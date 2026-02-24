# Logging-Infrastruktur Komplett-Analyse

> **Version:** 1.0 | **Datum:** 2026-02-23
> **Scope:** Alle 6 Schichten (ESP32, Server, MQTT, DB, Frontend, Monitoring)
> **Branch:** feature/frontend-consolidation

---

## Executive Summary

Die Logging-Infrastruktur ist architektonisch solide designed, hat aber einen zentralen Blind Spot: **ESP32 Serial-Logging ist vollstaendig manuell** und nicht agent-tauglich. Server, DB und Monitoring-Stack funktionieren zuverlaessig. Die Hauptprobleme sind:

1. **ESP32 Serial: Kein automatisches Capture** — Agents koennen keine Logs selbstaendig lesen
2. **ESP32 Log-Format: Kein Component-Feld** — Maschinenlesbarkeit eingeschraenkt
3. **Mosquitto: Kein Payload-Logging** — MQTT-Debug nur via live `mosquitto_sub`
4. **Frontend: Kein strukturiertes Output** — `createLogger()` nutzt nur `console.*`
5. **Loki: ESP32-Pipeline nie getestet** — Hardware-Profil wurde nie aktiviert
6. **`start_session.sh`: Erstellt KEINE Loki-Exports** — LOG_ACCESS_REFERENCE.md dokumentiert Dateien die nicht erzeugt werden

---

## Block A: ESP32 Firmware Logger

### Analyse: logger.h / logger.cpp

**Staerken:**
- Singleton-Pattern, kein Heap in Hot-Path (Fixed-Size Buffer)
- 5 Log-Levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Circular Buffer: 50 Eintraege x 128 Byte = 6.4 KB RAM
- `getLogs()` ermoeglicht In-Memory-Abfrage (z.B. via MQTT-Command)

**Schwaechen:**
- **Kein Component-Feld:** Format `[millis] [LEVEL] message` — KEINE Angabe welcher Manager/Service die Meldung erzeugt
- **Kein Error-Code im Format:** Error-Codes stehen nur im Message-Text, nicht strukturiert
- **Timestamp = millis():** Nur relative Zeit seit Boot, keine absolute Clock
- **Buffer zu klein:** 50 Eintraege bei 16 Boot-Phasen → Buffer voll nach ~3 Phasen
- **Kein JSON-Output-Mode:** Serial-Logger Docker-Service muss Regex-Parsing machen
- **Kein Remote-Level-Change:** `setLogLevel()` existiert, wird aber nicht via MQTT exponiert

### Serial-Output-Format (verifiziert)

```
[  timestamp] [LEVEL   ] message
```
- Timestamp: 10-stellig, rechtsbuendig, Millisekunden seit Boot
- Level: 8 Zeichen, linksbuendig mit Padding
- Beispiel: `[      2441] [INFO    ] GPIOManager: Pin 21 allocated to I2C_SDA`

**Zusaetzlich gemischte Formate im Serial-Stream:**
1. ESP-IDF SDK: `[millis][E][Module.cpp:line] method(): message` (z.B. NVS NOT_FOUND)
2. Boot-Banner: Box-Drawing-Zeichen (Plaintext, kein Level-Prefix)
3. Wokwi-Tags: `[WOKWI] message` (Simulation-spezifisch)
4. Direct `Serial.printf()`: Einige Stellen nutzen NICHT den Logger

### ESP32 Serial-Logger Docker-Service

**Status: Architektonisch komplett, aber NIE in Produktion getestet**

- `docker/esp32-serial-logger/serial_logger.py`: Gut implementierter TCP→JSON Bridge
- Parst alle 4 Formate (Custom Logger, ESP-IDF, MQTT Debug JSON, Plaintext)
- Structured JSON Output → Promtail Stage 4 kann es verarbeiten
- **Voraussetzung:** ser2net/socat TCP-Bridge auf Host (`host.docker.internal:3333`)
- **Problem:** ser2net/socat ist NICHT installiert/dokumentiert auf Robin's Windows-System
- Promtail-Config hat Stage 4 fuer `compose_service="esp32-serial-logger"` → Labels: level, device, component

### Log-Pfade (verifiziert)

| Pfad | Existiert | Groesse | Erzeugt von |
|------|-----------|---------|-------------|
| `logs/current/esp32_serial.log` | Ja | 14.5 KB | User (Wokwi CLI) |
| `logs/wokwi/serial/` | Ja (leer) | - | Makefile wokwi-test-* |
| `logs/wokwi/` | Ja | ~1.8 MB | Diverse Wokwi-Logs |
| `logs/current/STATUS.md` | Nein (wird bei Session-Start erstellt) | - | start_session.sh |

### Circular Buffer Bewertung

50 Eintraege sind **knapp aber akzeptabel** fuer Debug-Zwecke:
- Boot-Phase erzeugt ~40-60 Log-Eintraege → Buffer wird 1x ueberschrieben
- Fuer Runtime (Heartbeat alle 60s, Sensor alle 10s): ~6 Eintraege/min → 8 Minuten Historie
- **Empfehlung:** Auf 100 erhoehen (12.8 KB RAM, akzeptabel bei 260 KB free heap)

---

## Block B: Server-Logging

### Konfiguration (verifiziert)

| Setting | Wert | Env-Variable |
|---------|------|-------------|
| Level | INFO | `LOG_LEVEL` |
| Format | json | `LOG_FORMAT` |
| File Path | `logs/god_kaiser.log` | `LOG_FILE_PATH` |
| Max Bytes | 10 MB | `LOG_FILE_MAX_BYTES` |
| Backup Count | 10 | `LOG_FILE_BACKUP_COUNT` |

### Dual-Output-Architektur

```
Root Logger
├── FileHandler (JSON-Format) → logs/god_kaiser.log
│   Format: {"timestamp", "level", "logger", "message", "module", "function", "line", "request_id"}
└── StreamHandler (Text-Format) → stdout → Docker json-file → Promtail → Loki
    Format: "YYYY-MM-DD HH:MM:SS - logger - LEVEL - [request_id] - message"
```

**WICHTIG:** File-Handler schreibt JSON, Console-Handler schreibt TEXT. Die Promtail-Pipeline parst den TEXT-Output (Regex in Stage 2c). Das ist korrekt und funktioniert.

### Log-Dateien (verifiziert)

| Datei | Groesse | Letztes Update |
|-------|---------|----------------|
| `logs/server/god_kaiser.log` | 6.65 MB | 2026-02-23 14:13 (aktiv) |
| `logs/server/god_kaiser.log.1` | 10.49 MB | 2026-02-21 |
| ... (bis .10) | je ~10.5 MB | Feb 10-15 |
| **Total Server-Logs** | ~111 MB | - |

**Docker-Mount korrekt:** `./logs/server:/app/logs` ✓
**JSON-Format korrekt:** ✓ (verifiziert via `god_kaiser.log` Zeile 1)
**Rotation funktioniert:** ✓ (10 Backup-Dateien vorhanden)

### Noise-Level Bewertung

Server-Log hat hohen Noise-Anteil:
- `apscheduler.executors.default`: Scheduler-Jobs alle 15-60s
- `request_id` Middleware: Jeder Request (inkl. Health-Checks)
- Promtail droppt Health-Checks in Loki (Stage 2a) ✓
- **Empfehlung:** `apscheduler` Logger-Level auf WARNING setzen

---

## Block C: MQTT und DB Logging

### Mosquitto (verifiziert)

**Config:** stdout-only (kein File-Log)
```
log_dest stdout
log_type error, warning, notice, information, subscribe, unsubscribe
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
connection_messages true
```

**Was geloggt wird:** Connection/Disconnect Events, Subscribe/Unsubscribe, Errors
**Was NICHT geloggt wird:** Message-Payload-Inhalte (designbedingt — Mosquitto loggt keine Payloads)

**Docker json-file:** 10m x 3 Rotation ✓
**Bind-Mount:** DEAKTIVIERT (absichtlich — stdout-only seit v3.1) ✓
**Promtail:** Kein spezieller Parser — Mosquitto-Logs gehen als Plaintext in Loki

### PostgreSQL (verifiziert)

**Config korrekt:**
- Daily Rotation: `postgresql-YYYY-MM-DD.log` ✓
- Slow Query > 100ms: `log_min_duration_statement = 100` ✓
- MOD-Logging: INSERT/UPDATE/DELETE/DDL ✓
- UTC Timezone ✓
- 50 MB max per day rotation ✓

**Log-Dateien (verifiziert):**
- 12 Tage Historie vorhanden (Feb 9-23)
- Total: ~164 MB (ACHTUNG: `postgresql.log` ohne Datum = 103 MB — alte Datei vor Rotation-Setup)
- **Problem:** `postgresql.log` (103 MB) sollte geloescht werden — ist ein Ueberbleibsel

**Docker-Mount korrekt:** `./logs/postgres:/var/log/postgresql` ✓

### Mosquitto-Exporter Status

```yaml
healthcheck:
  test: ["NONE"]
```
- Image ist ein Scratch-Go-Binary: Kein Shell, kein wget, kein curl
- **Healthcheck "NONE" ist korrekt** — kann nicht anders gemacht werden
- Exporter selbst funktioniert (exposed Port 9234, Prometheus scrapes es)
- **Status: Kein Problem — "unhealthy" in Docker ist das erwartete Verhalten bei NONE**

---

## Block D: Frontend und Monitoring

### Frontend Logger (verifiziert)

```typescript
// El Frontend/src/utils/logger.ts
export function createLogger(namespace: string): Logger {
  const prefix = `[${namespace}]`
  return {
    debug: (...args) => console.debug(prefix, ...args),
    info: (...args) => console.info(prefix, ...args),
    warn: (...args) => console.warn(prefix, ...args),
    error: (...args) => console.error(prefix, ...args),
  }
}
```

**Schwaeche:** Output ist NICHT JSON-strukturiert — Promtail Stage 3 erwartet JSON (`json` Parser fuer `el-frontend`), aber `console.debug("[ESPCard]", ...)` erzeugt keinen JSON-String.

**Was tatsaechlich im Docker-Log landet:**
- Vite Dev-Server startup messages
- `console.error('[Vue Error]', { ... })` vom Global Error Handler
- Component-Logger: `[ESPCard] ...` als Plaintext

**Promtail Stage 3 Impact:** Die JSON-Expressions `level` und `component` werden bei Plaintext-Logs NICHT extrahiert → Labels fehlen in Loki fuer Frontend.

### Loki/Promtail Pipeline (verifiziert)

5 Stages konfiguriert:
1. `docker: {}` — Docker json-file unwrap ✓
2. `el-servador` match — Health-Drop, Multiline, Regex ✓
3. `el-frontend` match — JSON Parser (funktioniert NUR wenn strukturiertes JSON) ⚠️
4. `esp32-serial-logger` match — JSON Parser (funktioniert wenn Service laeuft) ✓
5. `loki` match — Self-referencing-Loop Prevention ✓

**Loki-Config:**
- Retention: 7 Tage ✓
- TSDB Storage ✓
- Filesystem Backend ✓

---

## Block E: Branch-Analyse

### Branches geprueft

| Branch | Logger-Aenderungen |
|--------|--------------------|
| `master` | Identisch mit `feature/frontend-consolidation` |
| `feature/phase2-wokwi-ci` | ESP32 Serial-Logger Docker-Service **GELOESCHT**, Promtail-Config **GELOESCHT** |
| `cursor/automatisierungs-engine-berpr-fung-1c86` | Nur Grafana Alerting geloescht |
| `cursor/testinfrastruktur-berarbeitung-2f8b` | Nur Grafana Alerting geloescht |
| `cursor/dashboard-neue-struktur-23ef` | Frontend-only (kein Logging) |

**Ergebnis: Keine besseren Logging-Implementierungen auf anderen Branches.** Der aktive Branch `feature/frontend-consolidation` hat die beste/vollstaendigste Logging-Infrastruktur.

---

## Block F: Agent-Log-Zugriff Bewertung

### esp32-debug

| Pfad | Existiert | Agent kann lesen | Problem |
|------|-----------|-----------------|---------|
| `logs/current/esp32_serial.log` | Ja (14.5 KB) | ✓ via Read Tool | NUR wenn User Wokwi/PIO-Monitor manuell gestartet hat |
| `logs/current/STATUS.md` | Nein (nur bei Session) | - | Nur nach `start_session.sh` |
| Loki `esp32-serial-logger` | Nie getestet | - | Hardware-Profil nie aktiviert |

**Bewertung: FRAGIL.** Agent ist auf manuelle User-Aktion angewiesen. Wenn `esp32_serial.log` nicht existiert oder leer ist, kann der Agent nichts tun.

### server-debug

| Pfad | Existiert | Agent kann lesen | Problem |
|------|-----------|-----------------|---------|
| `logs/server/god_kaiser.log` | Ja (6.65 MB) | ✓ via Read Tool | Sehr gross — nur tail effizient |
| `logs/current/god_kaiser.log` | Nein | - | Nur nach `start_session.sh` (Symlink) |
| `docker compose logs el-servador` | ✓ | ✓ via Bash | Funktioniert immer |
| Loki `compose_service=el-servador` | ✓ (wenn Monitoring up) | ✓ via curl | Abhaengig von Monitoring-Profil |

**Bewertung: GUT.** Server-Log existiert immer wenn Server laeuft. JSON-Format ist maschinenlesbar.

### mqtt-debug

| Pfad | Existiert | Agent kann lesen | Problem |
|------|-----------|-----------------|---------|
| `logs/current/mqtt_traffic.log` | Nein | - | Nur nach `start_session.sh` |
| `docker compose logs mqtt-broker` | ✓ | ✓ via Bash | Nur Connection-Events, keine Payloads |
| Loki `compose_service=mqtt-broker` | ✓ (wenn Monitoring) | ✓ via curl | Keine Payloads |

**Bewertung: EINGESCHRAENKT.** MQTT-Payload-Capture nur via live `mosquitto_sub` oder `start_session.sh`. Agent kann Broker-Gesundheit pruefen, aber keine Message-Inhalte analysieren.

### frontend-debug

| Pfad | Existiert | Agent kann lesen | Problem |
|------|-----------|-----------------|---------|
| `docker compose logs el-frontend` | ✓ | ✓ via Bash | Nur Vite-Server + console.error |
| Loki `compose_service=el-frontend` | ✓ (wenn Monitoring) | ✓ via curl | Labels fehlen (JSON-Parser matched nicht) |
| Browser Console | ❌ | Nur via Playwright MCP | Nur im Hauptkontext |

**Bewertung: EINGESCHRAENKT.** Hauptproblem ist Browser Console als Blind Spot. Playwright MCP hilft nur im Hauptkontext.

### db-inspector

| Pfad | Existiert | Agent kann lesen | Problem |
|------|-----------|-----------------|---------|
| `logs/postgres/postgresql-YYYY-MM-DD.log` | ✓ | ✓ via Read Tool | Grosse Dateien (bis 13 MB/Tag) |
| `docker compose logs postgres` | ✓ | ✓ via Bash | Stdout-Auszug |

**Bewertung: GUT.** DB-Logs sind zuverlaessig vorhanden.

---

## Identifizierte Verbesserungen

### Kritische Quick-Wins (Block G)

1. **`logs/current/` automatisch erstellen** — mkdir -p in allen Pfaden
2. **Log-Verzeichnis-README aktualisieren** mit korrekten Pfaden
3. **Alte `postgresql.log` (103 MB) bereinigen** — Ueberbleibsel vor Rotation-Setup
4. **`start_session.sh` Loki-Export-Diskrepanz dokumentieren** — LOG_ACCESS_REFERENCE behauptet Loki-Exports die nicht erzeugt werden
5. **Frontend createLogger(): JSON-strukturierte Ausgabe** — Damit Promtail Stage 3 funktioniert

### Mittelfristige Verbesserungen

6. **ESP32 Logger: Component-Feld einfuehren** — `[millis] [LEVEL] [COMPONENT] message`
7. **ESP32 Logger: Buffer auf 100 erhoehen** (12.8 KB RAM)
8. **ESP32 Logger: MQTT-basierter Log-Level-Change** — Runtime-Konfiguration
9. **ser2net/socat Dokumentation** fuer Hardware-Profil
10. **apscheduler Logger auf WARNING** — Noise-Reduktion in Server-Logs

### Log-Format-Konsistenz

| Schicht | Format | Timestamp | Level-Namen |
|---------|--------|-----------|-------------|
| ESP32 Serial | Text: `[millis] [LEVEL] msg` | millis (relativ) | DEBUG/INFO/WARNING/ERROR/CRITICAL |
| ESP32-IDF | Text: `[millis][X][Module:line]` | millis (relativ) | E/W/I/D |
| Server File | JSON: `{"timestamp","level",...}` | ISO8601 (UTC) | DEBUG/INFO/WARNING/ERROR/CRITICAL |
| Server Console | Text: `TS - logger - LEVEL - [req_id] - msg` | ISO8601 (UTC) | Same |
| Mosquitto | Text: `YYYY-MM-DDTHH:MM:SS: msg` | ISO8601 (lokal) | Implicit in message |
| PostgreSQL | Text: `TS [pid] user@db msg` | ISO8601 (UTC) | Implicit |
| Frontend | Plaintext: `[namespace] args...` | None (Browser-internal) | debug/info/warn/error |

**Inkonsistenzen:**
- ESP32 hat relative Timestamps (millis), alle anderen haben absolute
- Frontend hat KEINE Timestamps im Output
- Mosquitto hat keine expliziten Level-Labels
- Level-Namen sind konsistent (DEBUG/INFO/WARNING/ERROR/CRITICAL) bis auf ESP-IDF (E/W/I/D)

---

## Akzeptanzkriterien Status

- [x] ESP32 Logger (logger.h/cpp) komplett analysiert und dokumentiert
- [x] Alle Log-Pfade aller 6 Schichten verifiziert (existieren + sind beschreibbar)
- [ ] esp32-debug Agent kann zuverlaessig an ESP32 Serial-Logs kommen (**FRAGIL — manuelles Capture**)
- [x] server-debug Agent kann JSON-Logs lesen und Error-Codes extrahieren
- [x] Loki-Integration funktioniert fuer Server, MQTT, DB (Frontend: Labels fehlen, ESP32: nie getestet)
- [x] Branch-Analyse durchgefuehrt — keine besseren Implementierungen gefunden
- [x] Alle Log-Formate dokumentiert (was steht wo in welchem Format)
- [x] Session-Script (start_session.sh) analysiert — Symlinks korrekt, MQTT-Capture funktional
- [x] Mosquitto-Exporter Status bewertet — NONE healthcheck ist korrekt (Scratch binary)
- [ ] Mindestens 3 konkrete Logging-Verbesserungen implementiert → **NAECHSTER SCHRITT**
- [ ] /updatedocs erfolgreich → **NACH IMPLEMENTIERUNG**

---

---

## Implementierte Verbesserungen (Block G)

### 1. Frontend Logger: JSON-strukturierte Ausgabe ✓
**Datei:** `El Frontend/src/utils/logger.ts`
- `createLogger()` gibt jetzt JSON aus: `{"level","component","message","timestamp"}`
- Promtail Stage 3 kann jetzt `level` und `component` Labels extrahieren
- In DEV-Mode: zusaetzlich human-readable Browser Console Output
- Log-Level-Filtering via `VITE_LOG_LEVEL` Env-Variable
- TypeScript-Build verifiziert: 0 Fehler
- Alle 47 Consumer-Dateien behalten gleiche API (Interface unveraendert)
- 10+ Tests mocken den Logger → kein Impact

### 2. Server Noise-Reduktion: apscheduler auf WARNING ✓
**Datei:** `El Servador/god_kaiser_server/src/core/logging_config.py`
- `apscheduler`, `apscheduler.executors.default`, `apscheduler.scheduler` auf WARNING
- Eliminiert ~4 Log-Zeilen pro 15-60 Sekunden (Scheduler-Jobs)
- Nur WARNING/ERROR von apscheduler wird noch geloggt

### 3. Promtail: Mosquitto Healthcheck-Noise-Drop ✓
**Datei:** `docker/promtail/config.yml`
- Neuer Stage 5: Drop `.*healthcheck.*` fuer `compose_service="mqtt-broker"`
- Eliminiert ~4320 Zeilen/Tag (3 Zeilen x 2/min x 60min x 24h)
- Pipeline-Uebersicht im Header aktualisiert

### 4. LOG_ACCESS_REFERENCE.md komplett ueberarbeitet ✓
**Datei:** `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`
- Version 1.4 → 2.0
- Falsche Eintraege entfernt (Loki-Export-Dateien die nie erzeugt werden)
- Korrekte Log-Hierarchie pro Agent dokumentiert
- ESP32 Serial-Capture Workflow explizit beschrieben
- Loki-Queries fuer jeden Service hinzugefuegt
- Docker Logs als primaerer Fallback fuer alle Container-Logs

### 5. logs/README.md aktualisiert ✓
**Datei:** `logs/README.md`
- Korrekte Verzeichnisstruktur dokumentiert
- Persistente vs. Session-Logs klar getrennt
- Veraltete Poetry-Referenzen entfernt

### 6. LOG_LOCATIONS.md Version 4.0 ✓
**Datei:** `.claude/reference/debugging/LOG_LOCATIONS.md`
- Frontend Structured Logger Abschnitt hinzugefuegt
- Changelog aktualisiert

### 7. Fehlende Log-Verzeichnisse erstellt ✓
- `logs/esp32/.gitkeep` erstellt (war dokumentiert aber fehlte)

---

## Akzeptanzkriterien Status (Final)

- [x] ESP32 Logger (logger.h/cpp) komplett analysiert und dokumentiert
- [x] Alle Log-Pfade aller 6 Schichten verifiziert (existieren + sind beschreibbar)
- [~] esp32-debug Agent kann zuverlaessig an ESP32 Serial-Logs kommen — **MANUELL, aber klar dokumentiert**
- [x] server-debug Agent kann JSON-Logs lesen und Error-Codes extrahieren
- [x] Loki-Integration funktioniert fuer Server, MQTT (healthcheck-noise gefiltert), Frontend (jetzt mit JSON-Labels), DB
- [x] Branch-Analyse durchgefuehrt — keine besseren Implementierungen gefunden
- [x] Alle Log-Formate dokumentiert (was steht wo in welchem Format)
- [x] Session-Script (start_session.sh) analysiert — funktional korrekt
- [x] Mosquitto-Exporter Status bewertet — NONE healthcheck ist korrekt (Scratch binary)
- [x] **7 konkrete Logging-Verbesserungen implementiert** (Frontend JSON Logger, Server Noise-Reduktion, Promtail MQTT-Drop, LOG_ACCESS_REFERENCE v2.0, logs/README.md, LOG_LOCATIONS v4.0, fehlende Verzeichnisse)
- [x] Dokumentation aktualisiert — alle Agenten kennen ihre Log-Pfade

---

## Verbleibende Empfehlungen (nicht in Scope)

1. **ESP32 Logger Component-Feld** — `[millis] [LEVEL] [COMPONENT] message` fuer bessere Maschinenlesbarkeit
2. **ESP32 Logger Buffer auf 100** — 12.8 KB RAM, akzeptabel
3. **ESP32 MQTT-basierter Log-Level-Change** — Runtime-Konfiguration ueber MQTT Command
4. **ser2net/socat Dokumentation** — Fuer Hardware-Profil ESP32-Serial-Logger
5. **Alte postgresql.log (103 MB) bereinigen** — Ueberbleibsel vor Rotation-Setup
6. **Promtail Mosquitto Level-Extraktion** — Wuerde Custom-Regex erfordern, geringer Mehrwert
