## Auftrag: Logging-Infrastruktur Fix und Verbesserung — Implementierung auf Basis der Komplett-Analyse

**Ziel-Repo:** auto-one (C:/Users/PCUser/Documents/PlatformIO/Projects/Auto-one/)
**Kontext:** Eine umfassende Logging-Analyse aller 6 Schichten wurde durchgefuehrt (siehe Abschnitt "Analyseergebnisse" unten). 7 Quick-Wins wurden bereits implementiert (Frontend JSON Logger, Server Noise-Reduktion, Promtail MQTT-Drop, LOG_ACCESS_REFERENCE v2.0, logs/README.md, LOG_LOCATIONS v4.0, fehlende Verzeichnisse). Es verbleiben **6+ mittelfristige Verbesserungen** plus der zentrale Blind Spot: ESP32 Serial-Logging ist manuell und nicht agent-tauglich. Dieser Auftrag nimmt die Analyse-Ergebnisse und setzt die verbleibenden Verbesserungen um.
**Bezug:** Logging-Infrastruktur Komplett-Analyse (2026-02-23), `auftrag-esp32-logging-analyse.md` (Analyse-Auftrag), Phasenplan Phase 2
**Prioritaet:** Hoch
**Datum:** 2026-02-23 (optimiert mit Recherche+Forschung-Ergebnissen)

**Recherche-Grundlage (Life-Repo `wissen/iot-automation/`):**
- `esp32-structured-logging-formate.md` — ESP-IDF TAG-System, Buffer-Sizing, kein JSON auf ESP32
- `unified-logging-correlation-ids.md` — Correlation-IDs, asgi-correlation-id, Timestamp-Strategie
- `loki-promtail-pipeline-best-practices.md` — Labels sparsam, Structured Metadata, Promtail→Alloy
- `frontend-structured-logging-browser.md` — Vue Error Handler → REST-Endpoint
- `mqtt-payload-logging-debug.md` — Dedizierter Debug-Subscriber statt Mosquitto-Plugin
- `log-format-konsistenz-iot-multilayer.md` — Optimales Format pro Schicht, Normalisierung beim Ingest

**Forschungs-Grundlage (Life-Repo `wissen/iot-automation/`):**
- `2022-cloud-native-unified-structured-logging.md` — Kratzke: Structured Logging vereint Logs+Metriken+Traces
- `2025-lightweight-observability-iot-edge.md` — Lankala: Adaptive Sampling, Edge-lokale Vorverarbeitung
- `2025-opentelemetry-loki-unified-observability.md` — Pentaparthi: OpenTelemetry + Loki Standard-Architektur
- `2022-data-fusion-observability-signals.md` — Tzanettis: Signal-Fusion braucht Correlation-IDs
- `2025-observability-microservices-survey.md` — Faseeha: Drei-Ebenen-Observability (System+Service+Network)

---

# An den naechsten Agenten

Du bekommst die **konkreten Ergebnisse** einer umfassenden Logging-Analyse PLUS Best-Practice-Recherche und wissenschaftliche Forschungsergebnisse. Die Analyse ist ABGESCHLOSSEN — du musst nicht nochmal alles von Grund auf untersuchen. Aber: **Lies die Analyse-Ergebnisse gruendlich** bevor du anfaengst.

Dein Job ist zweistufig:

**Stufe 1 — Verstehen:** Lies jede betroffene Datei SELBST nochmal (nicht blind der Analyse vertrauen). Verstehe die aktuelle Implementierung, verifiziere dass die bereits implementierten Quick-Wins korrekt sind, und mache dir ein eigenes Bild pro Schicht.

**Stufe 2 — Implementieren:** Setze die verbleibenden Verbesserungen um, teste jede Aenderung, dokumentiere was du getan hast.

**WICHTIG:** Die Quick-Wins (1-7) wurden bereits implementiert. Verifiziere sie kurz, aber implementiere sie NICHT nochmal. Fokussiere dich auf die verbleibenden Punkte.

**WICHTIG:** Pruefe ALLE Branches. Es kann sein dass auf Feature-Branches bessere Implementierungen existieren.

**DESIGN-GRUNDSATZ (aus Recherche+Forschung):** Jede Schicht loggt im fuer sie OPTIMALEN Format. Der ESP32 loggt KEIN JSON — das ist bewusst so (Heap-Overhead, CPU-Zeit). Die Normalisierung passiert im Aggregator (Promtail/Alloy). Das ist der wissenschaftlich validierte Ansatz (Kratzke 2022, Lankala 2025).

---

### Vorbedingungen (vor Start pruefen)

| Bedingung | Pruefung |
|-----------|----------|
| Repo-Pfad | `C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one` (bzw. Workspace-Root) |
| Docker | `docker compose ps` — postgres, mqtt-broker, el-servador, el-frontend laufen fuer Block A/E/H |
| Loki/Promtail | Nur fuer Loki-Tests noetig: `make monitor-up` (Profile `monitoring`) |
| Server-Logs | `logs/server/god_kaiser.log` (Docker Bind-Mount); alternativ lokal: `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| Session-Logs | `logs/current/` wird von `scripts/debug/start_session.sh` angelegt; fuer mqtt_capture.sh ggf. `mkdir -p logs/current` |
| MQTT-Topic-Referenz | `.claude/reference/api/MQTT_TOPICS.md` — system/command, set_log_level (§3.3) |
| REST-Referenz | `.claude/reference/api/REST_ENDPOINTS.md` — nach Implementierung `/api/v1/logs/frontend` eintragen |

---

### Analyseergebnisse — Was du wissen musst

Lies diesen Abschnitt KOMPLETT bevor du anfaengst. Er enthaelt alle Erkenntnisse der vorherigen Analyse.

#### Schicht 1: ESP32 Firmware Logger — HAUPTPROBLEM

**Dateien:** `El Trabajante/src/utils/logger.h` + `logger.cpp`

**Was funktioniert:**
- Singleton-Pattern, kein Heap in Hot-Path (Fixed-Size Buffer)
- 5 Log-Levels: DEBUG, INFO, WARNING, ERROR, CRITICAL
- Circular Buffer: 50 Eintraege x 128 Byte = 6.4 KB RAM
- `getLogs()` ermoeglicht In-Memory-Abfrage via MQTT-Command
- Macros: `LOG_DEBUG()`, `LOG_INFO()`, `LOG_WARNING()`, `LOG_ERROR()`, `LOG_CRITICAL()`

**Was NICHT funktioniert / fehlt:**
- **Kein TAG-Feld:** Format ist `[millis] [LEVEL] message` — keine Info welcher Manager/Service die Meldung erzeugt. ESP-IDF verwendet das TAG-System (`static const char* TAG = "MyModule"`) — AutomationOne soll dieses Muster adaptieren.
- **Kein Error-Code im Format:** Error-Codes stehen nur im Message-Text, nicht strukturiert extrahierbar
- **Timestamp = millis():** Nur relative Zeit seit Boot, keine absolute Clock (NTP nicht genutzt). **Das ist OK** — der Server-Timestamp beim MQTT-Empfang ist die Authority (Recherche-Ergebnis).
- **Buffer zu klein:** 50 Eintraege bei 16 Boot-Phasen → Buffer voll nach ~3 Phasen, nur ~8 Minuten Runtime-Historie
- **Kein JSON-Output-Mode:** Der Serial-Logger Docker-Service muss Regex-Parsing machen. **KEIN JSON auf ESP32 implementieren** — der Overhead ist zu gross (Recherche+Forschung bestaetigt).
- **Kein Remote-Level-Change:** `setLogLevel()` existiert intern, wird aber NICHT via MQTT exponiert
- **Kein automatisches Capture:** Alles geht nur ueber Serial (115200 baud), Agent braucht User-Aktion
- **Keine Sequence-Number:** Fuer die Correlation-ID-Strategie (ESP-ID + Seq) braucht der Logger oder MQTT-Publisher eine monoton steigende Sequenznummer

**Serial-Output-Format (4 gemischte Formate im Stream):**
1. Custom Logger: `[  timestamp] [LEVEL   ] message` (10-stellig rechtsbuendig, 8 Zeichen Level)
2. ESP-IDF SDK: `[millis][E][Module.cpp:line] method(): message`
3. Boot-Banner: Box-Drawing-Zeichen (Plaintext, kein Level-Prefix)
4. Direct `Serial.printf()`: Einige Stellen nutzen NICHT den Logger

**ESP32 Serial-Logger Docker-Service:**
- `docker/esp32-serial-logger/serial_logger.py`: TCP→JSON Bridge, gut implementiert
- Parst alle 4 Formate korrekt
- **Voraussetzung:** ser2net/socat TCP-Bridge auf Host (`host.docker.internal:3333`)
- **ser2net/socat ist NICHT installiert/dokumentiert auf dem Windows-Entwicklungssystem**
- Promtail Stage 4 ist konfiguriert fuer `compose_service="esp32-serial-logger"` → Labels vorhanden
- **Hardware-Profil wurde NIE aktiviert — alles ist ungetestet**

**Verifizierte Log-Pfade:**
- `logs/current/esp32_serial.log` — existiert (14.5 KB), NUR wenn User manuell Wokwi/PIO-Monitor startet
- `logs/wokwi/serial/` — existiert (leer), wird von Makefile wokwi-test-* beschrieben
- `logs/esp32/.gitkeep` — neu erstellt (Quick-Win 7)

#### Schicht 2: Server-Logging — GUT, minor Noise

**Dateien:** `El Servador/god_kaiser_server/src/core/config.py` (LoggingSettings), `logging_config.py`

**Was funktioniert:**
- Dual-Output: FileHandler (JSON) + StreamHandler (Text → Docker → Promtail → Loki)
- JSON-Format: `{"timestamp", "level", "logger", "message", "module", "function", "line", "request_id"}`
- Rotation: 10 MB x 10 Backups, ~111 MB total
- Docker-Mount: `./logs/server:/app/logs`
- Promtail parst den Text-Output korrekt (Stage 2c Regex)

**Bereits implementierter Quick-Win:**
- apscheduler Logger auf WARNING gesetzt (Quick-Win 2) — Noise-Reduktion ~4 Zeilen/15-60s

**Verbleibend:** Keine kritischen Probleme. Server-Logging ist produktionsreif.

**Recherche-Optimierung:** Server hat bereits `request_id` — pruefen ob es konsistent in MQTT-Handlern propagiert wird (Correlation-ID-Strategie, siehe Block I).

#### Schicht 3: MQTT Mosquitto — EINGESCHRAENKT, designbedingt

**Datei:** `docker/mosquitto/mosquitto.conf`

**Was funktioniert:**
- stdout-only Logging (korrekt seit Mosquitto v3.1)
- Connection/Disconnect, Subscribe/Unsubscribe, Errors werden geloggt
- Docker json-file: 10m x 3 Rotation
- ISO8601 Timestamps

**Was NICHT funktioniert:**
- **Kein Payload-Logging:** Mosquitto loggt designbedingt KEINE Message-Inhalte
- MQTT-Debug nur via live `mosquitto_sub` oder `start_session.sh` Background-Capture
- Promtail hat keinen speziellen Parser — Mosquitto-Logs gehen als Plaintext in Loki (keine Level-Labels)

**Bereits implementierter Quick-Win:**
- Promtail Healthcheck-Noise-Drop fuer mqtt-broker (Quick-Win 3) — ~4320 Zeilen/Tag eliminiert

**Recherche-Optimierung:** Mosquitto Timestamp auf UTC umstellen (`log_timestamp_format %Y-%m-%dT%H:%M:%SZ`) — konsistent mit Server und Frontend.

#### Schicht 4: PostgreSQL — GUT

**Datei:** `docker/postgres/postgresql.conf`

**Was funktioniert:**
- Daily Rotation: `postgresql-YYYY-MM-DD.log`
- Slow Query > 100ms Warning
- MOD-Logging (INSERT/UPDATE/DELETE/DDL)
- Docker-Mount: `./logs/postgres:/var/log/postgresql`
- 12 Tage Historie vorhanden

**Offener Punkt:**
- `postgresql.log` (103 MB) ohne Datum = Ueberbleibsel vor Rotation-Setup → sollte geloescht werden

#### Schicht 5: Frontend — JSON Logger BEREITS IMPLEMENTIERT

**Datei:** `El Frontend/src/utils/logger.ts`

**Bereits implementierter Quick-Win (1):**
- `createLogger()` gibt jetzt JSON aus: `{"level","component","message","timestamp"}`
- Promtail Stage 3 kann `level` und `component` Labels extrahieren
- DEV-Mode: zusaetzlich human-readable Browser Console Output
- Log-Level-Filtering via `VITE_LOG_LEVEL`

**Verbleibend:** Browser Console bleibt Blind Spot fuer Agents.

**Recherche-Optimierung:** Vue Error Handler → REST-Endpoint (`/api/v1/logs/frontend`) implementieren. Das loest ~80% des Browser-Blind-Spots (siehe Block J).

#### Schicht 6: Loki/Promtail — FUNKTIONAL, ESP32 nie getestet

**Datei:** `docker/promtail/config.yml`

**5 Pipeline-Stages:**
1. `docker: {}` — Docker json-file unwrap
2. `el-servador` match — Health-Drop, Multiline, Regex
3. `el-frontend` match — JSON Parser (funktioniert JETZT mit neuem Logger)
4. `esp32-serial-logger` match — JSON Parser (funktioniert WENN Service laeuft) — NIE GETESTET
5. `mqtt-broker` match — Healthcheck-Drop (Quick-Win 3)

**Loki-Config:** 7 Tage Retention, TSDB Storage, Filesystem Backend

**Recherche-Optimierung (WICHTIG):**
- **`level` NICHT als Loki-Label verwenden** — Grafana's eigene Dokumentation warnt: `level` als Label erzeugt 5x Stream-Overhead bei mittlerem Log-Volumen. Stattdessen: Filter-Expressions (`|= "ERROR"`) nutzen. `compose_service` bleibt das einzige dynamische Label.
- **Structured Metadata** fuer high-cardinality Felder (request_id, esp_id, error_code) — erst mit Loki 3.x moeglich. Pruefen welche Loki-Version laeuft.
- **Promtail ist deprecated** (LTS seit Feb 2025, EOL 02.03.2026). Alloy-Migration als separaten Auftrag einplanen.

#### Branch-Analyse Ergebnis

| Branch | Logging-Aenderungen |
|--------|---------------------|
| `master` | Identisch mit `feature/frontend-consolidation` |
| `feature/phase2-wokwi-ci` | ESP32 Serial-Logger Docker-Service GELOESCHT, Promtail-Config GELOESCHT |
| `cursor/automatisierungs-engine-*` | Nur Grafana Alerting geloescht |
| `cursor/dashboard-neue-struktur-*` | Frontend-only (kein Logging) |

**Ergebnis:** Keine besseren Logging-Implementierungen auf anderen Branches. Aktiver Branch hat die beste Infrastruktur. ACHTUNG: `feature/phase2-wokwi-ci` hat den Serial-Logger-Service GELOESCHT — nicht von dort cherry-picken!

#### Agent-Log-Zugriff Status

| Agent | Zuverlaessigkeit | Hauptproblem |
|-------|-------------------|--------------|
| esp32-debug | FRAGIL | Auf manuelles Serial-Capture angewiesen |
| server-debug | GUT | Grosse Dateien (6+ MB), nur tail effizient |
| mqtt-debug | EINGESCHRAENKT | Keine Payload-Inhalte, nur Connection-Events |
| frontend-debug | EINGESCHRAENKT | Browser Console = Blind Spot |
| db-inspector | GUT | Grosse Dateien (bis 13 MB/Tag) |

---

### Was getan werden muss

Die 7 Quick-Wins sind implementiert. Jetzt muessen die verbleibenden Verbesserungen umgesetzt werden — optimiert durch Recherche-Ergebnisse und wissenschaftliche Forschung.

### Technische Details

**Betroffene Schichten:**
- [x] Firmware (El Trabajante) — Logger: TAG-Feld, Buffer, Seq-Nr, MQTT-Level-Change
- [x] Backend (El Servador) — Correlation-ID-Propagation pruefen, ggf. Frontend-Log-Endpoint
- [x] Docker — ser2net/socat Doku, Hardware-Profil testen, MQTT-Debug-Subscriber
- [x] Monitoring (Promtail) — Label-Strategie optimieren, Mosquitto UTC + Level-Extraktion
- [x] Frontend — Vue Error Handler → REST-Endpoint
- [x] Datenbank — Alte postgresql.log bereinigen

**Betroffene Module/Komponenten:**
- `El Trabajante/src/utils/logger.h` + `logger.cpp` — Firmware Logger (HAUPTARBEIT)
- `El Trabajante/src/mqtt/mqtt_manager.cpp` — MQTT system/command-Handler, Seq-Nr; ggf. `main.cpp` (set_log_level laut MQTT_TOPICS.md Zeile 1208)
- `El Servador/god_kaiser_server/src/core/logging_config.py` — Correlation-ID pruefen
- `El Servador/god_kaiser_server/src/api/v1/` — Neuer Router/Endpoint `POST /api/v1/logs/frontend`
- `El Frontend/src/utils/logger.ts` — unveraendert (Quick-Win 1); `El Frontend/src/main.ts` — Error Handler um REST-Push erweitern
- `docker/promtail/config.yml` — Label-Strategie, Mosquitto Level-Extraktion
- `docker/mosquitto/mosquitto.conf` — UTC Timestamp
- `docker-compose.yml` — Hardware-Profil Verifikation
- `docker/esp32-serial-logger/README.md` — NEU (Windows/socat Doku)
- `scripts/debug/mqtt_capture.sh` — NEU (MQTT Debug-Subscriber)
- `logs/postgres/` — alte postgresql.log bereinigen
- `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` — v3.0, mqtt_capture.sh, Correlation-ID
- `.claude/reference/debugging/LOG_LOCATIONS.md` — Update
- `.claude/reference/api/REST_ENDPOINTS.md` — nach Implementierung `/api/v1/logs/frontend` eintragen

---

#### Block A: Verifikation der Quick-Wins (Pflicht)

1. **Alle 7 Quick-Wins verifizieren:**

   | # | Quick-Win | Datei | Pruefen |
   |---|-----------|-------|---------|
   | 1 | Frontend JSON Logger | `El Frontend/src/utils/logger.ts` | JSON-Output Format korrekt? TypeScript-Build 0 Fehler? |
   | 2 | Server Noise-Reduktion | `El Servador/.../logging_config.py` | apscheduler auf WARNING? |
   | 3 | Promtail MQTT-Drop | `docker/promtail/config.yml` | Stage 5 korrekt? |
   | 4 | LOG_ACCESS_REFERENCE v2.0 | `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | Alle Pfade korrekt? |
   | 5 | logs/README.md | `logs/README.md` | Stimmt mit Realitaet ueberein? |
   | 6 | LOG_LOCATIONS v4.0 | `.claude/reference/debugging/LOG_LOCATIONS.md` | Frontend Structured Logger? |
   | 7 | logs/esp32/.gitkeep | `logs/esp32/.gitkeep` | Existiert? |

   **Wenn ein Quick-Win fehlerhaft ist: FIXEN.**

2. **Frontend JSON Logger funktional testen:**
   - Stack starten: `docker compose up -d` (bzw. unter Windows: `docker compose up -d`)
   - Frontend-Container-Logs: `docker compose logs el-frontend --tail 50`
   - Pruefe ob JSON-strukturierte Logs erscheinen
   - Loki-Query (Range mit Limit): `curl -s "http://localhost:3100/loki/api/v1/query_range" --data-urlencode 'query={compose_service="el-frontend"}' --data-urlencode "limit=50" | python -m json.tool` — **Hinweis:** Loki erreichbar nur bei `make monitor-up` (Profile monitoring).

#### Block B: ESP32 Logger — TAG-Feld einfuehren (HAUPTARBEIT)

**Hintergrund (aus Recherche):** ESP-IDF hat ein eingebautes TAG-System (`static const char* TAG = "MyModule"`). AutomationOne soll dieses Muster adaptieren statt ein komplett eigenes System zu erfinden. Der Feldname ist **TAG**, nicht COMPONENT — das ist die ESP-IDF-Terminologie und macht die Doku konsistent mit dem Espressif-Oekosystem.

3. **Logger-Format erweitern auf TAG-basiert:**
   - `logger.h` und `logger.cpp` lesen und verstehen
   - **Neues Format:** `[millis] [LEVEL] [TAG] message [E:code]`
   - Beispiel: `[  12345] [ERROR   ] [SENSOR  ] pH sensor read failed [E:3001]`
   - TAG = 3-8 Buchstaben Kurzname des aufrufenden Moduls (ESP-IDF-Konvention)
   - **Implementierung:** Neuen Parameter `const char* tag` zu `log()` Methode hinzufuegen
   - Macros anpassen: `LOG_INFO(tag, message, ...)` statt `LOG_INFO(message, ...)`
   - **ACHTUNG:** Das aendert die API aller Logger-Aufrufe in der gesamten Firmware!
   - Alle Aufrufer systematisch anpassen:
     ```bash
     grep -rn "LOG_DEBUG\|LOG_INFO\|LOG_WARNING\|LOG_ERROR\|LOG_CRITICAL" "El Trabajante/src/"
     ```
   - **TAG-Namen (ESP-IDF-Konvention):**

     | Manager/Service | TAG | Quelle-Datei |
     |-----------------|-----|---------------|
     | SensorManager | SENSOR | sensor_manager.cpp |
     | ActuatorManager | ACTUATOR | actuator_manager.cpp |
     | ZoneManager | ZONE | zone_manager.cpp |
     | MQTTManager | MQTT | mqtt_manager.cpp |
     | WiFiManager | WIFI | wifi_manager.cpp |
     | NVSManager | NVS | nvs_manager.cpp |
     | GPIOManager | GPIO | gpio_manager.cpp |
     | SafetySystem | SAFETY | safety_system.cpp |
     | LogicEngine | LOGIC | logic_engine.cpp |
     | I2CManager | I2C | i2c_manager.cpp |
     | OneWireManager | ONEWIRE | onewire_manager.cpp |
     | PWMManager | PWM | pwm_manager.cpp |
     | Boot/Main | BOOT | main.cpp |
     | Config | CONFIG | config_manager.cpp |
     | Diagnostics | DIAG | diagnostics.cpp |

   - **Pro Quell-Datei:** `static const char* TAG = "SENSOR";` am Anfang definieren (ESP-IDF-Pattern)
   - **Firmware kompilieren:** `pio run -e wokwi_simulation` — 0 Fehler erwartet
   - **Flash-Nutzung pruefen:** War ~90.4% — TAG-Strings koennten das erhoehen
   - Wenn Flash > 95%: TAG-Namen kuerzen oder als Enum + Lookup-Table

4. **Error-Code im Log-Format (strukturiert):**
   - Wenn ein Error-Code vorhanden ist, strukturiert am Ende:
     `[millis] [ERROR] [SENSOR] Sensor read failed [E:3001]`
   - Nur bei ERROR und CRITICAL Levels
   - **Regex fuer Serial-Logger/Promtail:** `\[E:(\d+)\]$` — einfach extrahierbar
   - Nicht alle Log-Aufrufe haben Error-Codes — nur dort wo es sinnvoll ist

#### Block C: ESP32 Logger — Buffer und Runtime-Config

5. **Circular Buffer auf 100 erhoehen:**
   - In `logger.h`: `MAX_LOG_ENTRIES` von 50 auf 100 aendern
   - RAM-Impact: 50 * (128+8) = 6.8 KB → 100 * (128+8) = 13.6 KB (~5.2% des freien Heaps)
   - **Recherche bestaetigt:** 13.6 KB bei ~260 KB free heap ist akzeptabel
   - **Verifizieren:** `pio run -e wokwi_simulation` — pruefen ob Heap-Warnung erscheint

6. **MQTT-basierter Log-Level-Change (bestehendes Topic nutzen):**
   - **Topic (laut MQTT_TOPICS.md):** `kaiser/god/esp/{esp_id}/system/command` (QoS 2) — NICHT neues Topic anlegen.
   - **Payload:** `{"command": "set_log_level", "params": {"level": "DEBUG"}}` (Level: DEBUG|INFO|WARNING|ERROR|CRITICAL)
   - **Response:** `kaiser/god/esp/{esp_id}/system/response` — Erfolg/Fehler + optional `"persisted": true` (NVS).
   - ESP32: In `main.cpp` bzw. MQTT-System-Command-Handler `Logger::setLogLevel()` aufrufen. Referenz: MQTT_TOPICS.md §3.3 (set_log_level), Code-Referenz main.cpp Zeile 1208.
   - **Hinweis fuer Zukunft:** Adaptive Sampling (dynamischer Log-Level basierend auf Systemzustand) ist ein wissenschaftlich validiertes Pattern fuer IoT (Lankala 2025) — koennte spaeter als automatischer Level-Wechsel bei Anomalien implementiert werden.

#### Block D: ESP32 Serial-Logger Docker-Service dokumentieren und testen

7. **ser2net/socat Dokumentation erstellen:**
   - `docker/esp32-serial-logger/README.md` erstellen
   - Windows-Setup dokumentieren:
     - COM-Port identifizieren (`Device Manager → Ports`)
     - ser2net oder socat installieren (via WSL2 oder native Windows)
     - TCP-Bridge: `socat tcp-listen:3333,reuseaddr,fork file:/dev/ttyUSB0,b115200`
     - Windows-Alternative: `com2tcp` oder Python-Script mit `pyserial`
   - Docker-Compose-Befehl: `docker compose --profile hardware up -d`

8. **Serial-Logger Service testen (wenn moeglich):**
   - Wenn ESP32 angeschlossen ist (oder Wokwi laeuft):
     - Hardware-Profil starten
     - Pruefen ob `esp32-serial-logger` Container hochkommt
     - Pruefen ob Logs in Loki: `{compose_service="esp32-serial-logger"}`
   - **Wenn nicht testbar: Praezise dokumentieren was Robin manuell tun muss**

#### Block E: Mosquitto UTC-Fix und Promtail-Optimierung

9. **Mosquitto Timestamp auf UTC umstellen:**
   - In `docker/mosquitto/mosquitto.conf` hinzufuegen:
     ```
     log_timestamp_format %Y-%m-%dT%H:%M:%SZ
     ```
   - **Begruendung (Recherche):** Alle anderen Schichten loggen UTC. Mosquitto ist die einzige Schicht mit lokaler Zeit. Harmonisierung auf UTC ist Best Practice.
   - Container neu starten und Format verifizieren

10. **Promtail Label-Strategie pruefen:**
    - **IST-Zustand:** In `docker/promtail/config.yml` wird `level` (und `logger`/`component`) aktuell als Loki-Label gesetzt (Stages 2d, 3, 4). Grafana-Doku warnt: `level` als Label erzeugt 5x Stream-Overhead bei mittlerem Volumen.
    - **Option A:** Labels `level`/`logger`/`component` entfernen; Abfragen nur noch ueber Filter-Expressions: `{compose_service="el-servador"} |= "ERROR"` bzw. `| json | level="ERROR"`.
    - **Option B:** Bei geringem Log-Volumen beibehalten; erst bei Performance-Problemen umstellen.
    - `compose_service` bleibt das zentrale Label. High-Cardinality Felder (request_id, esp_id, error_code) NICHT als Label; Structured Metadata nur wenn Loki 3.x. Pruefen: `docker compose exec loki loki --version` (Loki laeuft nur bei Profile `monitoring`).

11. **Promtail Mosquitto Level-Extraktion:**
    - Mosquitto-Logs haben keine expliziten Level-Labels
    - Nach dem Healthcheck-Drop in Stage 5 hinzufuegen:
      - Zeilen mit `error` → level=error
      - Alles andere → level=info
    - **Geringer Aufwand, guter Nutzen** fuer Loki-Queries wie `{compose_service="mqtt-broker"} | level="error"`

12. **Alte postgresql.log bereinigen:**
    - Host-Pfad: `logs/postgres/postgresql.log` (falls vorhanden, z. B. 103 MB) — Ueberbleibsel vor Rotation-Setup. Rotation schreibt in `postgresql-YYYY-MM-DD.log`.
    - Pruefen ob aktuelle Log-Datei noch `postgresql.log` heisst oder nur datierte: `docker compose exec postgres ls -la /var/log/postgresql/`
    - Service-Name: `postgres` (Container-Name: automationone-postgres). Wenn `postgresql.log` nicht mehr aktiv genutzt wird: auf Host loeschen (`logs/postgres/postgresql.log`).

#### Block F: MQTT Debug-Subscriber Script (NEU — aus Recherche)

13. **`scripts/debug/mqtt_capture.sh` erstellen:**
    - Dedizierter Debug-Subscriber fuer MQTT-Payload-Analyse (Datei existiert noch nicht — neu anlegen).
    - **Hintergrund:** Mosquitto loggt designbedingt keine Payloads. Ein externer Subscriber ist die beste Loesung (Recherche-Ergebnis — Mosquitto-Plugin ist Overkill).
    - **Vorbedingung:** Broker laeuft (`docker compose up -d`); optional `logs/current/` anlegen falls Session nicht via `start_session.sh` gestartet wurde: `mkdir -p logs/current`.
    - Script-Inhalt (Bash, Windows: Git Bash oder WSL):
      ```bash
      #!/bin/bash
      # MQTT Debug Capture — Alle Payloads mitschneiden
      # Usage: ./mqtt_capture.sh [topic-filter] [output-file]
      TOPIC="${1:-kaiser/#}"
      OUTPUT="${2:-logs/current/mqtt_capture_$(date +%Y%m%d_%H%M%S).log}"
      mkdir -p "$(dirname "$OUTPUT")"
      echo "Capturing MQTT messages on topic: $TOPIC → $OUTPUT"
      echo "Press Ctrl+C to stop"
      docker compose exec -T mqtt-broker mosquitto_sub -v -t "$TOPIC" | \
        while IFS= read -r line; do
          echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $line"
        done | tee "$OUTPUT"
      ```
    - Macht den MQTT-Payload-Blind-Spot behebbar ohne Mosquitto-Config zu aendern.
    - In `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` unter MQTT-Capture dokumentieren.

#### Block G: Correlation-ID Pattern einrichten (NEU — aus Recherche+Forschung)

**Hintergrund:** Correlation-IDs sind der Schluessel zur Cross-Layer-Analyse (Tzanettis 2022). Fuer IoT-Systeme: ESP-ID + Sequence als natuerliche Correlation-Keys (kein OpenTelemetry-Overhead). Der Server hat bereits `request_id` — es muss nur in MQTT-Handlern propagiert werden.

14. **ESP32: Sequence-Number in MQTT-Payloads:**
    - Monoton steigende Sequenznummer pro ESP32
    - In den MQTT-Payload aufnehmen: `{"value": 23.5, "gpio": 4, "seq": 42}`
    - Implementierung: Statische Variable im MQTTManager, bei jedem Publish inkrementieren
    - Kein zusaetzlicher ESP32-Overhead (kein UUID, kein Crypto)

15. **Server: Correlation-ID aus MQTT generieren:**
    - Pruefen ob `asgi-correlation-id` bereits installiert ist (`pip show asgi-correlation-id`)
    - Wenn nicht: Installieren und als Middleware registrieren
    - Fuer MQTT-Handler: Correlation-ID generieren als `f"{esp_id}:{topic_suffix}:{seq}:{timestamp_ms}"`
    - Beispiel: `"esp-001:temperature:42:1708704000000"`
    - Diese ID in ALLEN folgenden Log-Eintraegen propagieren
    - **Loki-Query-Beispiel:** `{compose_service="el-servador"} |= "esp-001:temperature:42"` → findet ALLE Verarbeitungsschritte

16. **Doku: Correlation-Pattern dokumentieren:**
    - In LOG_ACCESS_REFERENCE: Wie man mit Correlation-IDs Cross-Layer-Debugging macht
    - Beispiel-Queries fuer typische Debugging-Szenarien

#### Block H: Frontend Error Handler → REST-Endpoint (NEU — aus Recherche)

**Hintergrund:** Der Browser-Console-Blind-Spot wird zu ~80% geloest durch einen Vue Error Handler der Fehler an einen REST-Endpoint sendet (Recherche-Ergebnis). Runtime-Errors aus dem Browser landen dann im Server-Log und sind fuer alle Agents zugaenglich.

17. **Vue Error Handler um REST-Push erweitern:**
    - In `El Frontend/src/main.ts`: Zusaetzlich zum bestehenden Logger-Aufruf einen **Fire-and-Forget** POST an den Backend-Endpoint. **WICHTIG:** Base-URL aus `import.meta.env.VITE_API_URL` verwenden (Browser-Origin ist Frontend, API liegt auf el-servador).
      ```typescript
      const apiBase = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) || ''
      app.config.errorHandler = (err, instance, info) => {
        const payload = {
          level: 'error',
          component: instance?.$options?.name || 'unknown',
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          info: info,
          url: window.location.href,
          timestamp: new Date().toISOString()
        };
        logger.error('Vue error', { ... }); // bestehend beibehalten
        if (apiBase) {
          fetch(`${apiBase}/api/v1/logs/frontend`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(() => {});
        }
      };
      ```
    - **Zusaetzlich:** In `unhandledrejection` und `window.onerror` ebenfalls optionalen POST an `/api/v1/logs/frontend` senden (gleiche URL-Logik).

18. **Server: `/api/v1/logs/frontend` Endpoint erstellen:**
    - In `El Servador/god_kaiser_server/src/api/`: Neuer Router (z. B. `v1/logs.py` oder Anbindung in `health.py`/eigenes Modul) und in `v1/__init__.py` registrieren. Route: `POST /api/v1/logs/frontend` (ohne JWT für Fire-and-Forget aus dem Browser; optional CORS und Rate-Limit statt Auth).
    - Logger: `frontend.error` (eigener Logger-Namespace)
    - **Rate-Limiting:** Max 10 Requests/Minute pro IP (gegen Log-Flooding)
    - **Payload validieren:** Pydantic-Schema mit bekannten Feldern (level, component, message, stack?, info?, url?, timestamp)
    - Log-Format: `[FRONTEND] [component] message (url: ..., info: ...)`
    - **Referenz nach Implementierung:** `.claude/reference/api/REST_ENDPOINTS.md` um diesen Endpoint ergaenzen.

#### Block I: Agent-Zugriff optimieren

19. **esp32-debug Agent Workflow verbessern:**
    - Fallback-Kette:
      1. `logs/current/esp32_serial.log` (manuelles Capture)
      2. `docker compose logs esp32-serial-logger` (Hardware-Profil)
      3. Loki: `{compose_service="esp32-serial-logger"}`
      4. `logs/wokwi/serial/*.log` (Wokwi-Tests)
      5. **Fallback:** "Bitte starte Serial-Capture manuell"

20. **Log-Analyse-Patterns fuer alle Agents:**
    - Pro Agent: Die wichtigsten Loki-Queries als Referenz
    - Beispiele:
      - `{compose_service="el-servador"} |= "ERROR"` — Server-Fehler
      - `{compose_service="el-servador"} | json | level="ERROR"` — Strukturiert
      - `{compose_service="el-frontend"} | json | component="ESPCard"` — Frontend-Komponente
      - `{compose_service="mqtt-broker"} |= "disconnect"` — MQTT-Disconnects
      - `{compose_service="el-servador"} |= "esp-001:temperature"` — Correlation-ID-Suche
    - In LOG_ACCESS_REFERENCE aufnehmen

#### Block J: Start-Session und Dokumentation

21. **start_session.sh analysieren und verbessern:**
    - Pruefe: Log-Verzeichnisse, Symlinks, MQTT-Capture, Clean-Shutdown
    - Fehlende Features identifizieren und ggf. hinzufuegen

22. **Am Ende: `/updatedocs` aufrufen:**
    - Alle Agent-Beschreibungen aktualisieren:
      - `esp32-debug`: Neues Log-Format mit TAG-Feld, Fallback-Kette
      - `server-debug`: Correlation-IDs, Loki-Queries
      - `mqtt-debug`: MQTT Debug-Subscriber Script
      - `frontend-debug`: JSON-Logger, Error Handler → REST
      - `db-inspector`: Log-Pfade, Bereinigung
    - LOG_ACCESS_REFERENCE auf v3.0 aktualisieren
    - LOG_LOCATIONS aktualisieren
    - Sicherstellen dass jeder Agent universell fullstack arbeiten kann

---

### Akzeptanzkriterien

**Verifikation (Block A):**
- [ ] Alle 7 Quick-Wins verifiziert — korrekt und funktional
- [ ] Frontend JSON Logger funktional getestet — Loki-Labels vorhanden

**ESP32 Logger (Block B+C):**
- [ ] TAG-Feld implementiert — Format `[millis] [LEVEL] [TAG] message [E:code]`
- [ ] Alle Aufrufer angepasst — Firmware kompiliert mit 0 Fehlern
- [ ] Flash-Nutzung < 95% nach Aenderungen
- [ ] Circular Buffer auf 100 — Heap akzeptabel
- [ ] MQTT Log-Level-Change implementiert

**Infrastruktur (Block D+E+F):**
- [ ] Serial-Logger Docker-Service: README mit Windows-Setup
- [ ] Mosquitto Timestamp auf UTC umgestellt
- [ ] Promtail Labels: Kein `level` als Label, nur `compose_service`
- [ ] Alte postgresql.log bereinigt
- [ ] `mqtt_capture.sh` Debug-Subscriber Script erstellt

**Cross-Layer (Block G+H):**
- [ ] ESP32 Sequence-Number in MQTT-Payloads
- [ ] Server Correlation-ID-Generierung fuer MQTT-Handler
- [ ] `asgi-correlation-id` installiert/konfiguriert (oder eigene Implementierung verifiziert)
- [ ] Vue Error Handler → `/api/v1/logs/frontend` REST-Endpoint funktional
- [ ] Rate-Limiting auf Frontend-Log-Endpoint

**Dokumentation (Block I+J):**
- [ ] esp32-debug Agent hat dokumentierte Fallback-Kette
- [ ] Loki-Queries fuer alle Agents in LOG_ACCESS_REFERENCE
- [ ] Correlation-ID-Pattern dokumentiert
- [ ] `/updatedocs` erfolgreich

---

### Referenzen

**Life-Repo (Recherche+Forschung):**
- `wissen/iot-automation/esp32-structured-logging-formate.md` — ESP-IDF TAG-System Best Practices
- `wissen/iot-automation/unified-logging-correlation-ids.md` — Correlation-IDs fuer IoT
- `wissen/iot-automation/loki-promtail-pipeline-best-practices.md` — Loki Label-Strategie
- `wissen/iot-automation/frontend-structured-logging-browser.md` — Vue Error Handler Pattern
- `wissen/iot-automation/mqtt-payload-logging-debug.md` — MQTT Debug-Subscriber
- `wissen/iot-automation/log-format-konsistenz-iot-multilayer.md` — Format pro Schicht
- `wissen/sammlungen/recherche-bericht-logging-formate-2026-02-23.md` — Recherche-Gesamtbericht
- `wissen/sammlungen/forschungsbericht-iot-logging-architektur-2026-02-23.md` — Forschungsbericht
- `wissen/iot-automation/2022-cloud-native-unified-structured-logging.md` — Kratzke: Unified Logging
- `wissen/iot-automation/2025-lightweight-observability-iot-edge.md` — Lankala: IoT Edge Observability

**Ziel-Repo (auto-one) — verifizierte Pfade:**
- `El Trabajante/src/utils/logger.h` + `logger.cpp` — Firmware Logger (HAUPTARBEIT)
- `El Trabajante/src/mqtt/mqtt_manager.cpp` — MQTT system/command, Seq-Nr
- `El Servador/god_kaiser_server/src/core/config.py` — LoggingSettings; `logging_config.py` — Logging-Setup
- `El Servador/god_kaiser_server/src/api/v1/` — Neuen Router fuer `POST /api/v1/logs/frontend` anlegen/registrieren
- `El Frontend/src/utils/logger.ts` — Frontend Logger (JSON); `El Frontend/src/main.ts` — Error Handler + REST-Push (VITE_API_URL)
- `docker/promtail/config.yml` — Promtail Pipeline (level/labels prufen)
- `docker/mosquitto/mosquitto.conf` — Mosquitto UTC
- `docker/esp32-serial-logger/serial_logger.py` + `README.md` (neu) — Serial-Logger, Windows/socat Doku
- `docker-compose.yml` — Profile `hardware` fuer esp32-serial-logger
- `scripts/debug/start_session.sh` — existiert; `scripts/debug/mqtt_capture.sh` — NEU anlegen
- `logs/server/god_kaiser.log` — Server-Log (Docker); `logs/postgres/`, `logs/current/`, `logs/esp32/`
- `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` — v2.0 → v3.0
- `.claude/reference/debugging/LOG_LOCATIONS.md` — Update
- `.claude/reference/api/MQTT_TOPICS.md` — system/command, set_log_level (§3.3)
- `.claude/reference/api/REST_ENDPOINTS.md` — nach Implementierung logs/frontend eintragen

### Verify-Plan Prüfung (eingearbeitet)

- **MQTT Log-Level:** Plan korrigiert: Kein neues Topic; bestehendes `kaiser/god/esp/{esp_id}/system/command` mit `command: set_log_level` und `params: { level }` nutzen (MQTT_TOPICS.md §3.3). Response: `system/response`.
- **Frontend Error → REST:** Fetch-URL muss Backend treffen: `import.meta.env.VITE_API_URL` verwenden (nicht relativer Pfad), da Browser-Origin das Frontend ist.
- **Loki:** `query_range` mit `limit` fuer Abfragen verwenden; Loki nur bei `make monitor-up` erreichbar.
- **Promtail:** IST-Zustand ergaenzt — `level`/`logger`/`component` sind aktuell als Labels gesetzt; Entscheidung Option A/B dokumentiert.
- **Docker:** Service-Namen bestaetigt: `postgres`, `mqtt-broker`, `el-servador`, `el-frontend`; Profile `hardware` fuer esp32-serial-logger.
- **Pfade:** `logs/server/god_kaiser.log`, `scripts/debug/start_session.sh` existieren; `scripts/debug/mqtt_capture.sh` fehlt (wird erstellt). `logging_config.py` und `config.py` (LoggingSettings) beide relevant.

### Offene Punkte

- **Loki-Version:** Structured Metadata braucht Loki 3.x — welche Version laeuft? Pruefen und dokumentieren.
- **Promtail→Alloy Migration:** Promtail EOL am 02.03.2026. Eigener Auftrag Q1 2026, NICHT Teil dieses Auftrags. Aber: Migration-Readiness pruefen (hat Alloy ein `alloy convert` Tool?).
- **ESP-IDF Log V2:** Nutzt AutomationOne ESP-IDF V1 oder V2 Logging? V2 haette Binary Logging (10-35% Flash-Ersparnis). Pruefen ob Update moeglich.
- **OpenTelemetry:** Erst evaluieren wenn AutomationOne >100 Geraete oder Multi-Site wird (Recherche+Forschung bestaetigt: aktuell Overkill).
- **Adaptive Sampling (Forschung):** Dynamischer Log-Level basierend auf Anomalie-Erkennung (Lankala 2025). Feature fuer AutomationOne v2 — hier nur den MQTT-Level-Change als Grundlage implementieren.
- **Network-Level Observability (Forschung):** MQTT-Latenz und API-Response-Zeiten tracken fehlt noch (Faseeha 2025). Separater Auftrag.
