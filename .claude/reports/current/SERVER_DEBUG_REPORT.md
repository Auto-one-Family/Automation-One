# Server Debug Report

**Erstellt:** 2026-03-01 13:15 UTC
**Modus:** A (Allgemeine Analyse)
**Quellen:** Docker Container Logs (el-servador, --tail=300), Loki API (4h Zeitfenster 09:00-13:15 UTC), PostgreSQL direkte Queries, Health-Endpoints

---

## 1. Zusammenfassung

Der God-Kaiser Server laeuft stabil und ist voll einsatzbereit. Alle drei Circuit Breaker (mqtt, database, external_api) sind geschlossen. Die Startup-Sequenz verlief vollstaendig korrekt mit 12 MQTT-Handlern, WebSocket-Manager und Logic Engine. Es wurden **keine echten Business-Logic-Fehler (5000-5699)** und **keine ERROR-Eintraege** gefunden. Handlungsbedarf besteht bei zwei mittelschweren Problemen: (1) Wiederkehrende APScheduler Job-Misses weisen auf Event-Loop-Belastung hin, (2) Broadcast Emergency-Stop-CRITICAL beim Startup ist ein Log-Level-Problem (kein echter Fehler). Drei orphaned Mock-ESPs akkumulieren sich ohne automatische Bereinigung.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Docker Container Logs `el-servador` | OK | 300 Zeilen analysiert, Server seit 13:11:48 UTC aktiv |
| Loki API `{compose_service="el-servador"}` | OK | Verfuegbar auf localhost:3100, 4h-Fenster abgefragt |
| `/api/v1/health/live` | OK | `{"success":true,"alive":true}` |
| `/api/v1/health/ready` | OK | `{"success":true,"ready":true,"checks":{"database":true,"mqtt":true,"disk_space":true}}` |
| `/api/v1/health/detailed` | GESPERRT | Benoetigt Auth-Token (401) - normales Verhalten |
| PostgreSQL `god_kaiser_db` | OK | Direkte psql-Abfragen erfolgreich |
| Alembic Migration | OK | Aktuelle Revision: `a1b2c3d4e5f6` (token_blacklist) |

---

## 3. Befunde

### 3.1 Startup-Sequenz (VOLLSTAENDIG - KEIN PROBLEM)

Die Startup-Sequenz um 13:11:48 UTC verlief fehlerfrei. Im analysierten 4h-Fenster gab es 4 Server-Neustarts (09:32, 10:27, 10:49, 13:11).

Letzter Startup 13:11:48 UTC:
- CircuitBreaker `external_api` initialisiert (threshold=5, recovery=60s, half_open=15s)
- CircuitBreaker `database` initialisiert (threshold=3, recovery=10s, half_open=5s)
- CircuitBreaker `mqtt` initialisiert (threshold=5, recovery=30s, half_open=10s)
- DB Engine erstellt: pool_size=10, max_overflow=20
- MQTT connected to `mqtt-broker:1883` (result code: 0)
- **12 MQTT Handler registriert:** sensor/data, actuator/status, actuator/response, actuator/alert, heartbeat, discovery, config_response, zone/ack, subzone/ack, will, error, diagnostics
- Zuzueglich 3 Mock-ESP-Handler: actuator/command, actuator/emergency, broadcast/emergency
- CentralScheduler gestartet
- SimulationScheduler gestartet
- Logic Engine gestartet + Evaluation Loop aktiv
- Logic Scheduler gestartet (60s Intervall)
- WebSocket Manager mit Event Loop initialisiert
- Mock-Recovery: 1 Simulation wiederhergestellt (MOCK_95A49FCB)
- Sensor Type Auto-Registration: 11 Typen (0 neu, 11 bestehend)
- MaintenanceService: 5 Jobs registriert
- **Resilience Status beim Start: healthy=True, breakers=3 (closed=3, open=0)**

**Ergebnis:** Alle Services korrekt initialisiert. Startup ohne Fehler.

---

### 3.2 CRITICAL-Eintraege: Broadcast Emergency Stop (LOG-LEVEL-PROBLEM)

- **Schwere:** Mittel (kein echter Fehler, aber irrefuehrendes Log-Level)
- **Haeufigkeit:** 8x CRITICAL im 4h-Zeitfenster (je 2x pro Server-Neustart)
- **Zeitpunkte:** 09:32:49, 10:27:45-46, 10:49:25, 13:11:48

```
src.services.simulation.actuator_handler - CRITICAL - [MockActuator] Broadcast emergency stop received!
src.services.simulation.actuator_handler - WARNING  - [MockActuator] Emergency stop received for MOCK_95A49FCB
src.services.simulation.actuator_handler - INFO     - [MockActuator] Emergency stop executed for MOCK_95A49FCB
```

**Analyse:** Beim Neustart des Servers wird automatisch ein `kaiser/broadcast/emergency`-MQTT-Topic empfangen (vermutlich retained message oder Sofort-Zustellung nach Subscribe). Der CRITICAL-Level ist im Simulationshandler so hart kodiert fuer alle Emergency-Events, aber im Startup-Kontext ist es normales Verhalten. Die Mock-Aktoren reagieren korrekt - sie wechseln in SAFE_MODE.

**Einmalig manuell ausgeloest (10:30:18):**
```
src.api.v1.debug - WARNING - Emergency stop triggered on mock ESP MOCK_95A49FCB by admin: Manueller Stopp ueber Konfigurations-Panel
```

**Folge:** MOCK_95A49FCB laeuft nach Neustart im SAFE_MODE statt OPERATIONAL.

---

### 3.3 APScheduler Job-Misses (WIEDERKEHREND - MITTEL)

- **Schwere:** Mittel
- **Haeufigkeit:** 6 Ereignisse mit je 3 Jobs gleichzeitig verpasst

| Zeitpunkt | Verzoegerung | Betroffene Jobs |
|-----------|-------------|-----------------|
| 09:17:05 | 11 Minuten 14s | cleanup_orphaned_mocks, aggregate_stats |
| 10:04:29 | 41s | health_check_esps, check_sensor_health, mock_heartbeat |
| 10:12:33 | 44s | health_check_esps, check_sensor_health, mock_heartbeat |
| 10:42:43 | 57s | health_check_esps, check_sensor_health, mock_heartbeat |
| 12:06:03 | 38s | health_check_esps, check_sensor_health, mock_heartbeat |
| 12:19:59 | 34s | health_check_esps, check_sensor_health, mock_heartbeat |

```
apscheduler.executors.default - WARNING - Run time of job "MaintenanceService._health_check_esps ..." was missed by 0:00:57.992384
src.core.scheduler - WARNING - Job monitor_health_check_esps missed scheduled run
```

**Analyse:** APScheduler kann Scheduler-Jobs nicht puenktlich ausfuehren, da der asyncio Event-Loop kurzzeitig blockiert ist. Die groesste Verzoegerung (11 Minuten um 09:17) deutet auf eine Phase hoher Last hin - moeglicherweise ein blockierender DB-Vorgang oder Container-Ressourcen-Engpass (Docker Desktop Windows). Nach einem Job-Miss laeuft der naechste Job normal weiter - kein dauerhafter Ausfall.

**Folge:** ESP-Timeout-Erkennung und Sensor-Health-Checks koennen verzoegert sein. Mock-Heartbeat-Publikation unterbrochen (MOCK_95A49FCB wurde korrekt als "timed out" markiert bei 09:17 und 10:04).

---

### 3.4 ESP Timeout-Erkennung (INFORMATIV)

```
09:17:05 - heartbeat_handler - WARNING - Device MOCK_95A49FCB timed out. Last seen: 2026-03-01 09:17:05.655652+00:00
09:17:05 - maintenance.service - WARNING - health_check_esps: 1 ESP(s) timed out: ['MOCK_95A49FCB']
09:17:05 - maintenance.jobs.sensor_health - WARNING - Sensor stale: MOCK_95A49FCB GPIO 0 (SHT31) - no data for 915s (timeout: 180s)
10:04:48 - heartbeat_handler - WARNING - Device MOCK_95A49FCB timed out. Last seen: 2026-03-01 10:04:48
10:04:48 - maintenance.service - WARNING - health_check_esps: 1 ESP(s) timed out: ['MOCK_95A49FCB']
```

**Analyse:** MOCK_95A49FCB wurde zweimal als offline erkannt - beides Mal als Folge der APScheduler Job-Misses, die den Heartbeat-Job unterbrochen haben. Nach Server-Neustart immer sofort wieder online. Kein echter ESP-Ausfall.

---

### 3.5 Actuator Config fehlend (WIEDERKEHREND - NIEDRIG)

- **Schwere:** Niedrig
- **Haeufigkeit:** ~8x pro Server-Neustart + vereinzelt bei Aktorbetrieb

```
src.mqtt.handlers.actuator_handler - WARNING - Actuator config not found: esp_id=MOCK_95A49FCB, gpio=18. Updating state without config.
src.mqtt.handlers.actuator_handler - WARNING - Actuator config not found: esp_id=MOCK_95A49FCB, gpio=13. Updating state without config.
```

Zusaetzlich im Zeitraum 11:32-11:33 viermal hintereinander fuer gpio=18 (Frontend-Konfigurationstest).

**Analyse:** Die Aktuator-Konfigurationen fuer GPIO 13 und GPIO 18 von MOCK_95A49FCB fehlen in der `actuator_configs`-Tabelle. Der Handler akzeptiert Status-Updates trotzdem und aktualisiert `actuator_states`. Kein Datenverlust, aber kein Konfigurationskontext vorhanden.

**DB-Bestaetigung:** `actuator_configs`-Tabelle hat 8.192 Bytes (8 KB) - minimal befuellt.

---

### 3.6 Orphaned Mock-ESPs (WARTUNGSBEDARF - NIEDRIG)

- **Schwere:** Niedrig
- **Haeufigkeit:** Bei jedem OrphanedMocksCleanup-Job (stuendlich)

```
OrphanedMocksCleanup - WARNING - Old orphaned Mock found: MOCK_57A7B22F (last updated: 2026-02-27). Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete.
OrphanedMocksCleanup - WARNING - Old orphaned Mock found: MOCK_0CBACD10 (last updated: 2026-02-27). Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete.
```

**DB-Bestand (aktuell):**

| Device | Status | Letzte Aktivitaet | Bemerkung |
|--------|--------|-------------------|-----------|
| MOCK_95A49FCB | online | 2026-03-01 13:14:48 | Aktive Simulation |
| MOCK_98D427EA | offline | 2026-02-28 07:31:24 | 1 Tag alt |
| MOCK_0CBACD10 | offline | 2026-02-27 18:40:11 | 2 Tage alt |
| MOCK_57A7B22F | offline | 2026-02-27 16:44:09 | 2 Tage alt |

3 von 4 Mock-ESPs sind seit 2-4 Tagen offline. Automatisches Loeschen ist deaktiviert (`ORPHANED_MOCK_AUTO_DELETE` nicht gesetzt).

---

### 3.7 JWT Auth-Probleme (WIEDERKEHREND - NIEDRIG/INFORMELL)

- **Schwere:** Niedrig (normales Frontend-Verhalten nach Token-Ablauf)
- **Haeufigkeit:** Je nach Session, mehrfach pro Tag

**Token-Ablauf-Events (normal):**
```
09:20:37 - JWT verification failed: Signature has expired.
09:20:37 - Refresh token is blacklisted
10:22:26 - JWT verification failed: Signature has expired.
11:45:56 - JWT verification failed: Signature has expired.
13:14:10 - JWT verification failed: Signature has expired.
```

**UniqueViolation bei Token-Blacklisting (Doppel-Refresh):**
```
10:22:26 - Failed to blacklist old refresh token: IntegrityError: UniqueViolationError: duplicate key value violates unique constraint "ix_token_blacklist_token_hash"
10:23:38 - Failed to blacklist old refresh token: IntegrityError: UniqueViolationError
13:14:10 - Failed to blacklist old refresh token: IntegrityError: UniqueViolationError
```

**Fehlgeschlagene Login-Versuche:**
```
11:46:39 - Failed login attempt for: admin
11:47:30 - Failed login attempt for: admin
12:45:39 - Failed login attempt for: admin
```

**Analyse:** Die UniqueViolation beim Token-Blacklisting entsteht, wenn das Frontend parallele Refresh-Anfragen sendet oder bei Retry-Logik nach Verbindungsabbruch denselben Token zweimal zu blacklisten versucht. Der Server faengt den Fehler korrekt ab und loggt als WARNING - kein Datenverlust. Die fehlgeschlagenen Login-Versuche sind moeglicherweise vergessenes Passwort oder ein Tab mit alter URL.

**Token Blacklist Wachstum:** 38 Eintraege, kein Cleanup-Job konfiguriert. Die Tabelle waechst unbegrenzt (aktuell 88 KB - unkritisch).

---

### 3.8 MQTT TLS-Warnung (INFORMELL - KEIN PROBLEM)

```
src.main - WARNING - MQTT TLS is disabled. MQTT authentication credentials will be sent in plain text. Enable MQTT_USE_TLS for secure credential distribution.
```

Bei jedem Server-Neustart einmalig geloggt. Bekannte Konfigurationsentscheidung fuer Development-Environment. Kein Handlungsbedarf in DEV.

---

### 3.9 Logic Engine (KEIN PROBLEM)

- Logic Engine gestartet, Evaluation Loop aktiv (60s Intervall)
- SequenceActionExecutor: 4 Action-Typen registriert (actuator_command, actuator, delay, notification)
- HysteresisConditionEvaluator initialisiert
- **1 Regel in DB:** "Test Temperatur Rule" - **deaktiviert** (`enabled=false`, priority=1, cooldown=60s)
- `logic_execution_history`: 0 Eintraege - Regel wurde nie ausgefuehrt
- Keine Logic-Engine-Fehler oder Rate-Limit-Events im gesamten Log

---

### 3.10 WebSocket-System (FUNKTIONIERT)

- WS Manager korrekt initialisiert mit Event Loop
- Graceful Shutdown bei Server-Neustart um 13:11:36 korrekt durchgefuehrt
- **Aktive Verbindungen im Analysezeitraum:** 1-2 Clients gleichzeitig

**Verbindungsmuster (exemplarisch):**
- `client_1772364775271_tf0w89icy`: mehrfache Reconnects (normale Browser-Tab-Verhalten)
- `client_1772370765466_dnrqk8l1v`: aktive Verbindung seit 13:12:56 (aktuell)
- 1 abgewiesene WS-Verbindung 13:14:10 wegen abgelaufenem JWT - sofortige Wiedereverbindung mit neuem Token erfolgreich

Kein Rate-Limiting, keine Queue-Overflow-Warnungen, kein Event-Loop-Bug.

---

### 3.11 REST-API (GESUND - KEIN 5XX)

Alle REST-Requests im Log mit Status 200 (ausser Auth-geschuetzte ohne Token = 401):

| Endpoint | Status | Antwortzeit |
|----------|--------|-------------|
| GET /api/v1/health/live | 200 | 0.2-9.7ms |
| GET /api/v1/health/metrics | 200 | 1.2-15.0ms |
| GET /api/v1/health/ready | 200 | 7.2ms |
| GET /api/v1/sensors/data | 200 | 50.3ms |
| GET /api/v1/esp/devices | 200 | 11.4-61.8ms |
| GET /api/v1/logic/rules | 200 | 9.7-44.6ms |
| GET /api/v1/debug/mock-esp | 200 | 6.3-80.1ms |
| GET /api/v1/esp/devices/pending | 200 | 8.1-21.1ms |
| GET /api/v1/esp/devices/MOCK.../gpio-status | 200 | 268.6ms |
| POST /api/v1/auth/login | 200 | 279.8ms (bcrypt) |

**Kein einziger 5xx-Fehler.** Die GPIO-Status-Abfrage (268.6ms) und Login (279.8ms) sind die langsamsten Anfragen - noch im normalen Bereich.

---

### 3.12 Datenbank (GESUND)

**Sensor-Daten-Bestand:**
- 2.927 Messwerte total
- Zeitraum: 2026-02-26 bis 2026-03-01 13:14:48 (aktiv)
- SHT31: 2.031 Messwerte (MOCK_95A49FCB, aktiv - 1 Messung alle ~60s)
- DS18B20: 896 Messwerte (seit 2026-02-27 inaktiv)

**Aktive DB-Connections:** 7 Connections (1 active = eigene psql-Abfrage, 6 idle = Server-Connection-Pool). Kein blockierter Query, kein Lock-Wait.

**Alembic:** Aktuelle Revision `a1b2c3d4e5f6` - Migration vollstaendig.

**Tabellen-Groessen:**

| Tabelle | Groesse |
|---------|---------|
| sensor_data | 1.808 kB |
| esp_heartbeat_logs | 912 kB |
| audit_logs | 240 kB |
| esp_devices | 208 kB |
| actuator_history | 176 kB |

---

### 3.13 Error-Codes 5000-5699 (KEINER GEFUNDEN)

Im gesamten analysierten Log-Zeitraum (4h via Loki + Docker Logs) wurden **keine strukturierten Business-Logic-Fehlercodes [5xxx]** gefunden. Alle Eintraege oberhalb INFO-Level betreffen bekannte Betriebszustaende.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| `curl /api/v1/health/live` | `{"success":true,"alive":true}` - Server online |
| `curl /api/v1/health/ready` | DB+MQTT+Disk alle `true` |
| `docker compose ps` | Alle 12 Container healthy/up, keine Restarts |
| Loki ERROR-Query (4h) | 0 ERROR-Eintraege |
| Loki CRITICAL-Query (4h) | 8x MockActuator Emergency Stop (erwartet, Log-Level-Problem) |
| Loki WARNING-Query (4h) | 8 Kategorien identifiziert, kein unbekanntes Problem |
| PostgreSQL sensor_data | 2.927 Eintraege, letzte Messung 13:14:48 UTC (aktiv) |
| PostgreSQL esp_devices | 4 Geraete: 1 online, 3 offline (Orphaned) |
| PostgreSQL active queries | 6 idle connections, kein blockierter Query |
| Alembic current | `a1b2c3d4e5f6` - vollstaendig migriert |
| Circuit Breaker Status | 3/3 closed (mqtt, database, external_api) |
| Logic Engine | Aktiv, 1 deaktivierte Regel, 0 Ausfuehrungen |
| Token Blacklist | 38 Eintraege, kein Cleanup-Job |
| DB Tabellen-Groessen | Groesste Tabelle sensor_data 1.8MB - unkritisch |

---

## 5. Bewertung & Empfehlung

### Root Cause Analyse

| Problem | Root Cause | Schwere |
|---------|-----------|---------|
| APScheduler Job-Misses (regelmaessig) | asyncio Event-Loop-Belastung, vermutlich Docker Desktop Windows Host-Ressourcen | Mittel |
| CRITICAL bei Startup (Emergency Stop) | `kaiser/broadcast/emergency` retained MQTT-Message oder Sofortzustellung nach Subscribe; Log-Level im Code zu hoch | Mittel (nur Log-Level) |
| Actuator Config missing gpio 13/18 | `actuator_configs`-Tabelle hat keine Eintraege fuer MOCK_95A49FCB-Aktoren | Niedrig |
| Orphaned Mocks (3 Stueck) | `ORPHANED_MOCK_AUTO_DELETE` nicht gesetzt - bewusste Entscheidung, aber Akkumulation seit 2026-02-27 | Niedrig |
| Token Blacklist UniqueViolation | Frontend sendet parallele Refresh-Anfragen; Server faengt es korrekt ab | Niedrig |
| Token Blacklist waechst unbegrenzt | Kein Cleanup-Job fuer abgelaufene blackgelistete Tokens | Niedrig |

### Naechste Schritte (nach Prioritaet)

**1. APScheduler misfire_grace_time pruefen** - In der Scheduler-Konfiguration koennte ein laengerer `misfire_grace_time` Wert helfen. Alternativ pruefen ob blockierende sync-Calls im Event-Loop existieren.

**2. Broadcast Emergency Startup-Verhalten klaeren** - Pruefen ob `kaiser/broadcast/emergency` als retained message im Broker konfiguriert ist. Falls ja: entweder retained messages beim Subscribe ignorieren ODER Log-Level von CRITICAL auf WARNING reduzieren fuer den Startup-Kontext.

**3. Orphaned Mocks bereinigen** - MOCK_98D427EA, MOCK_0CBACD10, MOCK_57A7B22F koennen manuell aus der DB entfernt werden (erfordert explizite Genehmigung da DELETE-Operation).

**4. Token Blacklist Cleanup-Job** - Periodischen Job hinzufuegen, der Tokens entfernt, bei denen die originale Expiry-Zeit ueberschritten ist.

**5. Actuator Config fuer MOCK_95A49FCB** - GPIO 13 und 18 in `actuator_configs` eintragen, um die WARNING-Meldungen zu eliminieren.

### Gesamtstatus

```
Server Health:      GESUND
MQTT:               VERBUNDEN (result code 0, TLS disabled by design)
Database:           GESUND (Pool 10+20, keine blockierten Queries)
Logic Engine:       AKTIV (0 aktive Regeln, 0 Ausfuehrungen)
WebSocket:          AKTIV (1-2 Verbindungen, normales Reconnect-Pattern)
Circuit Breaker:    ALLE GESCHLOSSEN (0 open, 0 half-open)
Resilience:         HEALTHY
ERROR-Eintraege:    KEINE
CRITICAL-Eintraege: 8 (alle: MockActuator Emergency Stop bei Neustart)
5xxx-Error-Codes:   KEINE
```

Kein sofortiger Handlungsbedarf. Der Server ist stabil und produktionsbereit fuer Development-Zwecke. Alle Befunde sind bekannte Betriebszustaende oder niedrigprioritaere Verbesserungsmoeglichkeiten.
