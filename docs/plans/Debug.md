# AutomationOne Debug-Infrastruktur Referenz

**Stand:** 2026-02-12 | **Für:** Alle Agenten, Technical Manager, Robin
**Status:** Phasen 1–3 implementiert, Phase 4 verifiziert, Phase 5 (Agent-Konsolidierung) offen

---

## Was dieses Dokument ist

Dieses Dokument beschreibt die gesamte Debug-Infrastruktur von AutomationOne — welche Datenquellen es gibt, wie man sie erreicht, welche Tools dafür am besten geeignet sind, und wohin die Agent-Architektur sich entwickelt. Es ist so geschrieben, dass jeder Agent (ob Debug, Dev, oder Ops) sofort versteht wo er welche Information findet und welches Werkzeug er dafür benutzen soll.

---

## 1. Das System im Überblick

AutomationOne ist ein 4-Schicht IoT-System. Daten fließen von unten nach oben:

```
Schicht 4: El Frontend (Vue 3)          Port 5173
    ↕ HTTP REST + WebSocket
Schicht 3: El Servador (FastAPI)         Port 8000
    ↕ MQTT (kaiser/god/esp/...)
Schicht 2: MQTT Broker (Mosquitto)       Port 1883 + 9001 (WS)
    ↕ MQTT
Schicht 1: El Trabajante (ESP32)         Hardware / Wokwi
```

Dazu kommen Hilfssysteme:

```
PostgreSQL 16                            Port 5432    → Persistenz
Loki + Promtail                          Port 3100    → Log-Aggregation
Prometheus + Exporters                   Port 9090    → Metriken
Grafana                                  Port 3000    → Dashboards
MQTT-Logger (neu)                        kein Port    → MQTT-Traffic nach Loki
```

Alles läuft in Docker auf einem Windows-Host. Netzwerk: `automationone-net` (Bridge).

---

## 2. Was seit heute anders ist

### Monitoring läuft immer

Vorher musste man `docker compose --profile monitoring up -d` starten um Loki, Promtail, Prometheus, Grafana und die Exporter zu bekommen. Jetzt reicht `docker compose up -d` — eine `docker-compose.override.yml` entfernt das Profil-Gate. Das bedeutet: **historische Logs sind ab sofort immer verfügbar**, nicht nur wenn jemand daran denkt den Monitoring-Stack zu starten.

### MQTT-Traffic wird persistiert

Ein neuer Container `automationone-mqtt-logger` subscribed auf `kaiser/#` und schreibt jeden MQTT-Message (Topic + Payload) nach stdout. Promtail fängt das auf und schickt es an Loki. Das heißt: **MQTT-Traffic ist jetzt historisch durchsuchbar** — nicht mehr nur live über `mosquitto_sub`.

### Ein Script für den Gesamtzustand

`scripts/debug/debug-status.ps1` (Bash-Wrapper: `scripts/debug/debug-status.sh`) prüft in einem Aufruf:
- Docker-Container-Status (welche laufen, Restarts)
- Server Health (live, ready, detailed)
- PostgreSQL (pg_isready, Connections, DB-Größe)
- MQTT Broker (Port offen)
- Frontend (Port offen)
- Loki (ready, Alter des letzten Logs pro Service)
- MQTT-Logger (Container läuft, Alter der letzten Message)
- Alembic Migration Stand
- Log-Verfügbarkeit (welche Dateien existieren, wie alt)
- Disk Usage

Output ist ein JSON mit `overall: "ok" | "degraded" | "critical"` und Details pro Service.

### Playwright-Zugang verifiziert

Der Playwright MCP-Server im Docker Gateway kann das Frontend unter `http://localhost:5173` erreichen. Login-Seite wird geladen, Screenshots funktionieren. Der automatisierte Login-Flow (Formular ausfüllen) braucht noch Feinarbeit bei den Element-Refs, ist aber kein Netzwerk- oder Infrastruktur-Problem.

---

## 3. Alle Datenquellen und der beste Weg sie zu erreichen

Für jede Datenquelle im System gibt es mehrere Zugriffswege. Hier steht welcher der beste ist und warum.

### 3.1 Server-Logs (El Servador / God-Kaiser)

**Was:** JSON-formatierte Logs mit Level, Timestamp, Logger-Name, Request-Context. Error-Codes 5000–5699.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **Loki-API** | `curl` auf `localhost:3100` | ✅ **Beste Option.** Historisch, filterbar, kein File-Handling |
| Bind-Mount File | `grep` in `logs/server/god_kaiser.log` | Wenn Loki nicht läuft oder für sehr schnelle Regex-Suche |
| Docker Logs | `docker compose logs --tail=N el-servador` | Für die letzten paar Zeilen, schneller Blick |

**Loki-Query für Server-Errors:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-server"} |~ "ERROR|CRITICAL"' \
  --data-urlencode 'limit=50'
```

**Loki-Query für bestimmten Handler:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-server"} |~ "sensor_handler"' \
  --data-urlencode 'limit=30'
```

### 3.2 MQTT-Traffic

**Was:** Alle MQTT-Messages zwischen ESP32 und Server. Topic-Schema: `kaiser/{id}/esp/{esp_id}/...`. 32 Topics, QoS 0–2.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **Loki-API (mqtt-logger)** | `curl` auf `localhost:3100` | ✅ **Beste Option für historischen Traffic.** Durchsuchbar, korrelierbar |
| Live-Subscribe | `mosquitto_sub -h localhost -t "kaiser/#" -v -C N -W N` | Für Live-Debugging, "was passiert gerade" |
| Docker-Exec Fallback | `docker compose exec mqtt-broker mosquitto_sub -t '#' -v -C N -W N` | Wenn mosquitto_sub nicht lokal installiert |

**WICHTIG:** `mosquitto_sub` IMMER mit `-C N` (Message Count) UND `-W N` (Timeout Sekunden) aufrufen. Ohne diese Flags blockiert der Befehl endlos und der Agent hängt.

**Loki-Query für MQTT-Traffic einer bestimmten ESP:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-mqtt-logger"} |~ "ESP_12AB34CD"' \
  --data-urlencode 'limit=30'
```

**Loki-Query für Heartbeats:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-mqtt-logger"} |~ "heartbeat"' \
  --data-urlencode 'limit=20'
```

**Live-Subscribe für Sensor-Daten (max 5 Messages, 15s Timeout):**
```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v -C 5 -W 15
```

### 3.3 ESP32 Serial-Logs

**Was:** Boot-Sequenz (16 Steps), Sensor-Init, WiFi/MQTT-Connect, Error-Codes 1000–4999, Watchdog, Circuit Breaker, SafeMode.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **Bind-Mount File** | `grep` in `logs/current/esp32_serial.log` | ✅ **Wenn File existiert** — direkt, schnell, vollständig |
| Loki (serial-logger) | `curl` auf `localhost:3100` | Wenn `--profile hardware` aktiv und esp32-serial-logger Container läuft |
| PlatformIO Monitor | `pio device monitor` | Nur bei direkter Hardware-Verbindung über USB |
| Wokwi-Logs | `logs/wokwi/serial/` | Nach Wokwi-Simulation |

**Einschränkung:** ESP32 Serial-Logs sind nur verfügbar wenn jemand den Serial Monitor gestartet und den Output in die Datei umgeleitet hat, ODER wenn der `esp32-serial-logger` Container läuft (Profil `hardware`), ODER nach einer Wokwi-Simulation. Es gibt keinen "immer an"-Modus wie bei den anderen Services.

### 3.4 Frontend-Logs und Browser-Zustand

**Was:** Vue-Errors, Warnings, API-Call-Ergebnisse, WebSocket-Events, Console-Output.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **Loki (Frontend-Container)** | `curl` auf `localhost:3100` | ✅ **Für Console-Output** den der Vue Error Handler nach stdout schreibt |
| **Playwright MCP** | Browser-Automation | ✅ **Für DOM, Network, live Console** — der einzige Weg den Browser zu sehen |
| Docker Logs | `docker compose logs --tail=N el-frontend` | Schneller Blick auf Vite-Build-Output |
| Source-Code-Analyse | `grep`/`read` in `El Frontend/src/` | Für Code-Verständnis, nicht für Runtime-Zustand |

**Loki-Query für Vue-Errors:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-frontend"} |~ "\\[Vue Error\\]"' \
  --data-urlencode 'limit=20'
```

**Loki-Query für API-Fehler (401, 500):**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-frontend"} |~ "\\[API\\].*(?:401|500)"' \
  --data-urlencode 'limit=20'
```

**Playwright** ist der einzige Weg um zu sehen was der User sieht — DOM-Zustand, gerenderte Komponenten, Network-Tab, WebSocket-Frames. Kein anderes Tool kann das. Details zu Playwright in Sektion 5.

### 3.5 PostgreSQL

**Was:** Device-Registrierungen, Sensor-Daten, Actuator-Configs, Heartbeat-Logs, Alembic-Migrationen.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **MCP database-server** | Strukturierte SQL-Queries | ✅ **Beste Option.** Sauber, typisiert, kein Bash nötig |
| Docker exec psql | `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "SELECT ..."` | Wenn MCP nicht verfügbar oder für komplexe Queries |
| Server Health API | `curl localhost:8000/api/v1/health/detailed` | Für DB-Status aus Server-Sicht (Connections, Circuit Breaker) |

**MCP database-server** ist hier klar besser als psql-over-Bash: Man bekommt strukturierte Ergebnisse, keine String-Parsing-Probleme, und es funktioniert auch wenn der Agent keinen Bash-Zugriff hat.

**Häufigste Queries:**
```sql
-- Alle ESPs mit Status
SELECT device_id, status, last_seen FROM esp_devices ORDER BY last_seen DESC;

-- Sensor-Daten der letzten 5 Minuten für eine ESP
SELECT COUNT(*) FROM sensor_data
WHERE esp_device_id = 'ESP_XXX' AND created_at > NOW() - INTERVAL '5 minutes';

-- DB-Größe
SELECT pg_size_pretty(pg_database_size('god_kaiser_db'));

-- Tabellen-Größen
SELECT tablename, pg_size_pretty(pg_total_relation_size(tablename::text))
FROM pg_tables WHERE schemaname='public'
ORDER BY pg_total_relation_size(tablename::text) DESC;
```

### 3.6 Server REST API

**Was:** Health-Status, Device-Management, Sensor/Actuator-Daten, Debug-Endpoints.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **curl** | Direkte HTTP-Requests | ✅ **Immer.** Schnell, zuverlässig, universell |

**Die wichtigsten Endpoints:**
```bash
# Lebt der Server?
curl -s http://localhost:8000/api/v1/health/live

# Ist alles bereit? (DB, MQTT, WS)
curl -s http://localhost:8000/api/v1/health/detailed

# Alle registrierten ESPs
curl -s http://localhost:8000/api/v1/esp/devices

# MQTT-Statistiken
curl -s http://localhost:8000/api/v1/debug/mqtt-stats
```

### 3.7 Docker-Infrastruktur

**Was:** Container-Status, Restarts, Logs, Netzwerk.

| Zugriffsweg | Tool | Wann benutzen |
|---|---|---|
| **debug-status.ps1** | Aggregierter JSON-Report | ✅ **Erster Schritt bei jedem Debug-Start** |
| `docker compose ps` | Container-Liste | Für schnellen Überblick |
| `docker compose logs --tail=N <service>` | Service-spezifische Logs | Wenn Loki nicht verfügbar |
| MCP docker | Docker CLI über MCP | Für strukturierten Zugriff |

### 3.8 Loki (Log-Aggregation)

**Was:** Zentraler Sammelpunkt für ALLE Container-Logs. 7 Tage Retention. Promtail scraped Docker-Socket automatisch.

| Was in Loki ist | Container-Name Filter |
|---|---|
| Server-Logs | `container_name="automationone-server"` |
| Frontend-Logs | `container_name="automationone-frontend"` |
| MQTT-Broker-Events | `container_name="automationone-mqtt"` |
| **MQTT-Traffic (Payloads)** | `container_name="automationone-mqtt-logger"` |
| PostgreSQL-Logs | `container_name="automationone-postgres"` |
| ESP32 Serial (wenn aktiv) | `container_name="automationone-esp32-serial"` |

**Loki ist die zentrale Drehscheibe.** Fast alles was die Agenten brauchen ist dort — historisch, durchsuchbar, korrelierbar über Timestamps. Die Loki-API ist der bevorzugte Zugriff für jede Art von Log-Analyse.

**Basis-Pattern für Loki-Queries:**
```bash
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="CONTAINER"} |~ "REGEX"' \
  --data-urlencode 'limit=N'
```

Optional mit Zeitfenster:
```bash
  --data-urlencode 'start=UNIX_TIMESTAMP'
  --data-urlencode 'end=UNIX_TIMESTAMP'
```

---

## 4. Der optimale Debug-Workflow

### Schritt 1: Gesamtzustand erfassen

```bash
# Von Projektroot:
./scripts/debug/debug-status.sh
# Oder direkt:
powershell.exe -File scripts/debug/debug-status.ps1
```

Das JSON sagt sofort: Läuft alles (`ok`), fehlt was (`degraded`), oder ist was kaputt (`critical`)? Welche Services sind down? Wie alt sind die letzten Logs? Gibt es Container-Restarts?

**Erst danach** gezielt in einzelne Services schauen.

### Schritt 2: Problem lokalisieren

Je nachdem wo das Problem liegt, gibt es zwei Pfade:

**Pfad A — "User sieht was nicht" (Frontend-Fokus):**
```
Browser (Playwright) → Console-Errors → Network-Tab → API-Response →
Server-Handler (Loki) → Database (MCP/psql)
```

**Pfad B — "Daten kommen nicht an" (Backend-Fokus):**
```
ESP32 Serial Log → MQTT-Traffic (Loki mqtt-logger / mosquitto_sub) →
Server-Handler (Loki) → Database (MCP/psql)
```

Beide Pfade treffen sich am Server und an der Datenbank. Der Knackpunkt ist meistens irgendwo dazwischen — eine kaputte MQTT-Verbindung, ein Handler der eine Exception wirft, ein fehlender DB-Eintrag.

### Schritt 3: Befunde korrelieren

Timestamps vergleichen. Wenn die ESP um 14:30:05 einen Heartbeat schickt, muss der im MQTT-Logger um ~14:30:05 auftauchen, im Server-Handler um ~14:30:06, und der DB-Status muss sich aktualisieren. Wo die Kette bricht, liegt das Problem.

Loki macht das einfach weil alle Logs die gleiche Zeitbasis haben.

---

## 5. Tool-Referenz: Was nutzen, wann, warum

### Loki-API (curl auf localhost:3100)

**Wann:** Immer wenn historische Logs gebraucht werden. Erster Anlaufpunkt für Server-Logs, MQTT-Traffic, Frontend-Console-Errors.

**Stärken:** Zeitliche Korrelation über Services hinweg, Regex-Filter, Zeitfenster, keine Datei-Handhabung nötig.

**Schwächen:** Loki muss laufen (ist jetzt Default). Queries können bei großen Zeitfenstern langsam sein — `limit=` und Zeiteingrenzung nutzen.

### MCP database-server (PostgreSQL)

**Wann:** Für jede DB-Query. Device-Status, Sensor-Daten, Schema-Prüfung, Konsistenz-Checks.

**Stärken:** Strukturierte Ergebnisse, kein String-Parsing, kein Docker-Exec nötig.

**Schwächen:** Nur SELECT-Queries sicher. Schreibende Queries (DELETE, UPDATE) nur mit expliziter User-Bestätigung.

### curl (HTTP)

**Wann:** Server Health, REST API, Loki-API, Grafana-API.

**Stärken:** Universell, schnell, überall verfügbar. Keine Abhängigkeiten.

**Regeln:** Nur GET-Methoden für Debug. POST/PUT/DELETE nur mit User-Bestätigung.

### mosquitto_sub (MQTT Live)

**Wann:** Wenn Live-Traffic beobachtet werden muss — "kommt gerade ein Heartbeat?"

**Stärken:** Echtzeit, direkt, keine Verzögerung durch Loki-Pipeline.

**KRITISCHE REGEL:** IMMER mit `-C N -W N` aufrufen. Beispiel: `mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 15`. Ohne diese Flags blockiert der Befehl **endlos** und der Agent hängt fest.

### Playwright MCP

**Wann:** Wenn der Browser-Zustand geprüft werden muss — DOM, Console, Network, Screenshots, User-Flows.

**Stärken:** Einziger Weg den Browser zu sehen. Kann Login durchführen, Seiten navigieren, DOM inspizieren, Console lesen, Network-Requests sehen, Screenshots machen.

**Status:** Infrastruktur steht. Frontend ist erreichbar. Login-Automatisierung braucht noch Feinarbeit bei Element-Refs. Screenshots funktionieren.

**Zugang:** Über den Docker MCP Gateway. Der Playwright-Container kann `localhost:5173` (Frontend) und `localhost:8000` (API) über `host.docker.internal` erreichen.

### debug-status.ps1 / debug-status.sh

**Wann:** Als allererster Befehl bei jedem Debug-Start. Gibt den Gesamtzustand in einem JSON.

**Aufruf:**
```bash
./scripts/debug/debug-status.sh
# oder
powershell.exe -File scripts/debug/debug-status.ps1
```

**Hinweis:** Das Script kann 5–15 Sekunden dauern weil es Docker-Container, HTTP-Endpoints und Loki-Queries sequentiell prüft. Das ist normal.

### docker compose (Infrastruktur)

**Wann:** Container-Status, Logs, Exec.

**Regeln:**
- `docker compose ps` — immer erlaubt
- `docker compose logs --tail=N <service>` — immer mit `--tail=N`
- `docker compose exec` — nur für SELECT-Queries und Read-Only-Befehle
- Container starten/stoppen/restarten — nur mit User-Bestätigung

### grep / Source-Code-Analyse

**Wann:** Für Bind-Mount-Logs wenn Loki nicht läuft. Für Source-Code-Verständnis (Component-Struktur, Store-Logik, Handler-Implementierung).

**Log-Pfade:**
- Server: `logs/server/god_kaiser.log`
- ESP32 Serial: `logs/current/esp32_serial.log`
- MQTT: `logs/mqtt/` (normalerweise leer — Mosquitto loggt nach stdout)
- Wokwi: `logs/wokwi/reports/`, `logs/wokwi/serial/`
- Tests: `logs/backend/pytest.log`, `logs/frontend/vitest/`, `logs/frontend/playwright/`

---

## 6. Strategie: Agent-Konsolidierung auf auto-ops

### Warum

Heute gibt es 13 Agenten im Projekt. Davon sind 5 Debug-Agenten (esp32-debug, server-debug, mqtt-debug, frontend-debug, test-log-analyst), plus db-inspector, system-control und meta-analyst. Sie arbeiten seriell, jeder hat ein enges Sichtfeld, und Cross-Layer-Korrelation passiert erst nachträglich. Der Overhead ist hoch: Jeder Agent macht seine eigenen Health-Checks, schreibt einen eigenen Report, und die Koordination läuft über Dateien.

### Wohin

Alle Debug-, Ops- und Analyse-Agenten werden in den bestehenden **auto-ops** konsolidiert (`.claude/local-marketplace/auto-ops/`). auto-ops hat bereits die richtige Plugin-Struktur und die richtige Philosophie: autonom arbeiten, vor destruktiven Aktionen fragen.

### Die 3 Rollen

Statt 8 spezialisierte Agenten gibt es 3 fokussierte Rollen innerhalb auto-ops:

**Driver** — Steuert den Browser via Playwright, führt User-Flows aus, generiert Traffic und Logs. Der Driver analysiert nicht selbst — er schafft die Bedingungen unter denen die Inspektoren arbeiten.

**Frontend Inspector** — Arbeitet von der Oberfläche nach innen. Startet beim Browser-Zustand (Console, DOM, Network), geht über die Vue-Schicht (Stores, Components, WebSocket-Handler) und verfolgt den Datenpfad bis zum Server (API-Responses, Handler-Logs, Database). Sein Fokus: "Warum sieht der User nicht was er sehen sollte?"

**Backend Inspector** — Arbeitet von der Hardware nach innen. Startet beim ESP32 (Serial-Log, Boot-Sequenz), folgt dem Datenpfad über MQTT (Traffic im Logger, Broker-Events), durch den Server (Handler, Validation) bis in die Datenbank. Sein Fokus: "Warum kommen die Daten nicht an oder sind falsch?"

### Wo sie sich treffen

```
Frontend Inspector                    Backend Inspector
      |                                      |
Browser Console                        ESP32 Serial Log
      ↓                                      ↓
DOM / Vue Components                   MQTT Publish
      ↓                                      ↓
Pinia Stores                           MQTT Broker (Loki)
      ↓                                      ↓
API Client (Network Tab)               Server Subscribe
      ↓                                      ↓
HTTP Response ←── Server Endpoint ──→ MQTT Handler
                        ↓
                    Database
```

Beide konvergieren am Server und an der Datenbank. Der eine kommt von oben (was sieht der User?), der andere von unten (was schickt die Hardware?). Zusammen decken sie den kompletten Datenpfad ab — die Cross-Layer-Analyse die heute der meta-analyst erst nachträglich macht, passiert automatisch.

### Was die Rollen an neuen Fähigkeiten bekommen

| Rolle | Neue Fähigkeit | Ermöglicht durch |
|---|---|---|
| Driver | Browser steuern, Login, Navigation, Screenshots | Playwright MCP |
| Frontend Inspector | Browser-Console lesen, DOM inspizieren, Network-Requests sehen | Playwright MCP |
| Frontend Inspector | Historische Frontend-Logs durchsuchen | Loki-API (Container-Logs) |
| Backend Inspector | Historischen MQTT-Traffic durchsuchen | Loki-API (mqtt-logger) |
| Backend Inspector | Sofortiger Gesamtzustand | debug-status.ps1 |
| Alle | Einheitliche Log-Query-Patterns | Loki-API als Standard |
| Alle | Strukturierte DB-Queries | MCP database-server |

### Was aus den alten Agenten wird

Die 4 Dev-Agenten (esp32-dev, server-dev, mqtt-dev, frontend-dev) bleiben separat — Implementierung ist ein anderer Workflow als Debugging. Die 5 Debug-Agenten + db-inspector + system-control + meta-analyst + agent-manager gehen in auto-ops auf. Ihr Wissen (Error-Codes, Boot-Sequenzen, Topic-Schemata, Handler-Mappings, DB-Queries) wird in auto-ops Skills überführt.

### Umsetzung

Der bestehende auto-ops unter `.claude/local-marketplace/auto-ops/` wird erweitert:

- **Neue Skills:** `frontend-debugging/`, `backend-debugging/`, `log-queries/`, `mqtt-analysis/`, `test-analysis/`
- **Neue Commands:** `/ops-debug-frontend`, `/ops-debug-backend`, `/ops-drive`
- **Agent-Definition erweitert:** 3 Rollen mit klaren Triggern und Datenpfaden
- **Alte Agenten:** Nach `.claude/archive/` verschoben

---

## 7. Sicherheitsregeln (für alle Rollen)

### Frei erlaubt (Read-Only)

- Alle Loki-Queries
- `curl -s` mit GET auf localhost
- `mosquitto_sub` mit `-C N -W N`
- `docker compose ps`, `docker compose logs --tail=N`
- SELECT-Queries über MCP database-server oder psql
- Source-Code lesen, grep in Logs
- Playwright: Seiten öffnen, DOM lesen, Console lesen, Screenshots
- `debug-status.ps1` ausführen

### Bestätigung nötig

- Schreibende API-Calls (POST, PUT, DELETE)
- Schreibende SQL (DELETE, UPDATE, DROP)
- Container starten/stoppen/restarten
- `mosquitto_pub` (Messages publizieren)
- Firmware flashen, NVS löschen
- Lastintensive Operationen (`vue-tsc`, `npm run build`, `vitest run`)
- Playwright: Formulare absenden, Buttons klicken die Zustand ändern

### Goldene Regeln

1. `mosquitto_sub` IMMER mit `-C N` UND `-W N` — sonst blockiert der Agent
2. `docker compose logs` IMMER mit `--tail=N`
3. Erst `debug-status.ps1`, dann gezielt einzelne Services prüfen
4. Loki bevorzugen gegenüber Bind-Mount-Logs (einheitlich, korrelierbar)
5. MCP database-server bevorzugen gegenüber psql-über-Bash (strukturiert, sicher)

---

## 8. Quick-Reference: Die 10 wichtigsten Befehle

```bash
# 1. Gesamtzustand (IMMER zuerst)
./scripts/debug/debug-status.sh

# 2. Server-Errors (Loki)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-server"} |~ "ERROR|CRITICAL"' \
  --data-urlencode 'limit=30'

# 3. MQTT-Traffic historisch (Loki)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-mqtt-logger"} |~ "kaiser"' \
  --data-urlencode 'limit=30'

# 4. MQTT-Traffic live
mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 15

# 5. Frontend-Errors (Loki)
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={container_name="automationone-frontend"} |~ "(?i)error"' \
  --data-urlencode 'limit=20'

# 6. Server Health
curl -s http://localhost:8000/api/v1/health/detailed

# 7. ESP-Devices in DB
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db \
  -c "SELECT device_id, status, last_seen FROM esp_devices ORDER BY last_seen DESC;"

# 8. Docker-Status
docker compose ps

# 9. Server-Container-Logs (schnell)
docker compose logs --tail=30 el-servador

# 10. Alembic-Migration-Stand
docker compose exec el-servador python -m alembic current
```

---

## 9. Datei-Referenz

| Datei | Pfad | Zweck |
|---|---|---|
| docker-compose.yml | Projektroot | Haupt-Stack (Core + Profile) |
| docker-compose.override.yml | Projektroot | Monitoring default + MQTT-Logger |
| debug-status.ps1 | `scripts/debug/` | Aggregierter System-Health-Check |
| debug-status.sh | `scripts/debug/` | Bash-Wrapper für Agenten |
| god_kaiser.log | `logs/server/` | Server Bind-Mount Log |
| esp32_serial.log | `logs/current/` | ESP32 Serial (wenn verfügbar) |
| STATUS.md | `logs/current/` | Session-Kontext (wenn von start_session.sh erstellt) |
| DEBUG_INFRA_PLAN.md | `.claude/reports/current/` | Dieser Gesamtplan |
| auto-ops/ | `.claude/local-marketplace/` | Operations-Plugin (wird erweitert) |
| agents/ | `.claude/agents/` | Alte Agenten (werden archiviert) |

---

## 10. Nächste Schritte

Phase 5 steht aus: auto-ops erweitern, neue Skills schreiben, neue Commands anlegen, alte Agenten archivieren. Das Wissen aus den alten Agenten (Error-Codes, Boot-Sequenzen, Topic-Schemata, Handler-Mappings, Playwright-Patterns, Loki-Queries, DB-Queries) wird in die neuen Skills überführt, ergänzt um die neuen Infra-Fähigkeiten (Loki als Standard, MQTT-Logger, debug-status.ps1, Playwright-Zugang).