# AutoOps Server Error Report

**Erstellt:** 2026-03-31 ca. 16:08 UTC
**Modus:** A — Allgemeine Analyse (letzte 20 Minuten)
**Analysierter Zeitraum:** 2026-03-31 15:47 – 16:08 UTC
**Quellen:**
- `docker logs automationone-server --since 20m` (1110 Zeilen)
- `.claude/reports/current/SERVER_DEBUG_REPORT.md` (bekannte Issues)

---

## 1. Zusammenfassung

In den letzten 20 Minuten wurden **2 echte Bugs (ERROR-Level)**, **1 kritisches strukturelles Problem (ESP_EA5484 Disconnect-Storm)** und mehrere Klassen von Warnings identifiziert. Der schwerwiegendste aktive Bug ist ein Datenbankfehler im `hysteresis_evaluator`: Die `_session_factory` ist ein `async_generator` statt eines async Context Managers, weshalb Hysterese-Zustände nicht in der DB persistiert werden — die Logik-Engine läuft dennoch weiter. Das zweite ERROR-Muster ist ein Deduplication-Fehler im Grafana-Webhook-Handler: Bereits bekannte Alerts werden statt mit UPSERT mit INSERT versucht, was zu `UniqueViolationError` führt. Zusätzlich erzeugt ESP_EA5484 eine anomale Disconnect-Welle (233 LWT-Events in ~20 Minuten), die zu Log-Flooding und einem Zone-ACK-Timeout führt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs automationone-server --since 20m` | OK | 1110 Zeilen, vollständig analysiert |
| Container-Status `automationone-server` | healthy | Up 16 Minuten zum Analysezeitpunkt, 1x Neustart in Zeitraum |
| `SERVER_DEBUG_REPORT.md` | OK | Bekanntes Issue: ESP_EA5484 offline / 403-Guard |

---

## 3. Befunde — Sortiert nach Schweregrad

---

### 3.1 [HOCH] Bug: HysteresisEvaluator — async_generator statt Context Manager

- **Schwere:** Hoch
- **Level:** ERROR + Traceback
- **Timestamps:**
  - `2026-03-31 15:51:05` — `load_states_from_db` (Startup)
  - `2026-03-31 15:51:29` — `_persist_state` (jede Sensor-Auswertung wenn Hysterese aktiv)
- **Message (load_states_from_db):**
  ```
  Failed to load hysteresis states from DB: 'async_generator' object does not support the asynchronous context manager protocol
  ```
- **Message (_persist_state):**
  ```
  Failed to persist hysteresis state for 675100d6-06a1-43bc-9fee-fef359645f53:0: 'async_generator' object does not support the asynchronous context manager protocol
  ```
- **Stack-Trace 1 (load_states_from_db):**
  ```
  File "/app/src/services/logic/conditions/hysteresis_evaluator.py", line 114, in load_states_from_db
    async with self._session_factory() as session:
  TypeError: 'async_generator' object does not support the asynchronous context manager protocol
  ```
- **Stack-Trace 2 (_persist_state):**
  ```
  File "/app/src/services/logic/conditions/hysteresis_evaluator.py", line 146, in _persist_state
    async with self._session_factory() as session:
  TypeError: 'async_generator' object does not support the asynchronous context manager protocol
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py`
  - Zeile 114 (`load_states_from_db`)
  - Zeile 146 (`_persist_state`)
- **Regel betroffen:** `675100d6-06a1-43bc-9fee-fef359645f53` (Regel "TimmsRegenReloaded")
- **Auswirkung:** Hysterese-Zustände werden beim Server-Start nicht aus der DB geladen (kein State-Recovery) und nach jeder Aktivierung nicht persistiert. Bei Server-Neustart geht der Hysterese-State verloren. Die Logik-Engine führt Aktionen (Aktor ON/OFF) trotzdem aus — nur die Persistierung schlägt still fehl.
- **Root Cause:** `self._session_factory` ist ein `async_generator` (wahrscheinlich eine `yield`-basierte `get_db`-Funktion), die nicht direkt mit `async with` verwendet werden kann. Korrekt wäre `contextlib.asynccontextmanager` oder direkter `async for`-Aufruf.

---

### 3.2 [HOCH] Bug: Grafana-Webhook-Handler — UniqueViolation bei Notification-Deduplication

- **Schwere:** Hoch
- **Level:** ERROR (wiederholt)
- **Timestamps (Beispiele):**
  - `2026-03-31 15:58:23` — Alert: "Webhook Reception Stopped" (fingerprint: `4fa643ec059eb498`)
  - `2026-03-31 15:59:25` — Alert: "Heartbeat Gap" (fingerprint: `d3ac181ffcf74b34`) — 3x
  - `2026-03-31 16:04:25` — Alert: "Heartbeat Gap" (fingerprint: `d3ac181ffcf74b34`) — 4x (inkl. auto-resolve)
  - `2026-03-31 16:05:28` — Alert: "Sensor Data Stale" (fingerprint: `a22fa2efc7b70869`)
  - `2026-03-31 16:07:16` — Alert: "Loki: Frontend Down" (fingerprint: `796869f4ea658850`)
- **Fehler-Muster:**
  ```
  Failed to route Grafana alert '<AlertName>': (sqlalchemy.dialects.postgresql.asyncpg.IntegrityError)
  <class 'asyncpg.exceptions.UniqueViolationError'>: duplicate key value violates unique constraint
  "ix_notifications_fingerprint_unique"
  DETAIL: Key (fingerprint)=(<fingerprint_hex>) already exists.
  ```
- **Folge-Fehler (Cascade):**
  ```
  Failed to route Grafana alert '<AlertName>': This Session's transaction has been rolled back due to
  a previous exception during flush. To begin a new transaction with this Session, first issue
  Session.rollback(). Original exception was: [UniqueViolationError...]
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/api/v1/webhooks.py`
- **Betroffene Alerts (unique fingerprints):**
  | Alert-Name | Fingerprint | Erstes Auftreten |
  |------------|-------------|-----------------|
  | Webhook Reception Stopped | `4fa643ec059eb498` | 15:58:23 |
  | Heartbeat Gap | `d3ac181ffcf74b34` | 15:59:25 |
  | Sensor Data Stale | `a22fa2efc7b70869` | 16:05:28 |
  | Loki: Frontend Down | `796869f4ea658850` | 16:07:16 |
- **Auswirkung:** Grafana-Alerts können nach dem ersten Eintrag nicht erneut geroutet werden. "Resolved"-Meldungen werden nicht verarbeitet. Der Webhook-Endpoint gibt trotzdem HTTP 200 zurück (`0 routed, N skipped`). Die Session wird nach dem IntegrityError inkonsistent — alle nachfolgenden Operationen in derselben Session schlagen ebenfalls fehl (rollback-Cascade).
- **Root Cause:** Der Handler versucht bei eingehenden Grafana-Alerts stets ein `INSERT`, anstatt ein `INSERT ... ON CONFLICT DO UPDATE` (UPSERT) oder ein vorheriges `SELECT` auf den Fingerprint zu machen. Grafana schickt für denselben Alert mehrfach Benachrichtigungen (firing, resolved, re-firing), was denselben Fingerprint erzeugt.

---

### 3.3 [MITTEL] ESP_EA5484 — Anomaler Disconnect-Storm (LWT-Flooding)

- **Schwere:** Mittel (kein Server-Bug, aber Hardware-/Konnektivitätsproblem mit Auswirkung auf Server-Log)
- **Level:** WARNING (Massenauftreten)
- **Zeitraum:** 2026-03-31 15:52:04 – 16:08 (ca. 16 Minuten)
- **Anzahl LWT-Events:** 233 in ~16 Minuten (ca. 14–15 pro Minute / alle ~4 Sekunden)
- **Message:**
  ```
  LWT received: ESP ESP_EA5484 disconnected unexpectedly (reason: unexpected_disconnect)
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- **Nebeneffekte:**
  - Log-Flooding: 233 WARNING-Zeilen dominieren das Log
  - Notification-Erstellung: `2026-03-31 15:55:15` — Grafana-Notification "ESP Disconnect Wave — 3+ disconnects in 2 minutes" erstellt
  - Zone-ACK-Timeout bei ESP_00000001: 16:06:18 (wahrscheinlich bedingt durch Netzwerk-Degradierung, die ESP_EA5484 betrifft)
  - Sensor-Datenlücke für ESP_EA5484 zwischen 15:52 und 15:56 (keine Sensor-Logs in dieser Zeit)
- **Recovery:** ESP_EA5484 reconnectete um ca. `15:56:48` — Zone-Push, Config-Push und Sensor-Daten liefen danach normal an
- **Anmerkung:** LWT wird vom MQTT-Broker bei unerwarteter Verbindungstrennung gepublisht. Das zyklische Muster (alle ~2 Sekunden) deutet auf eine Reconnect-Schleife im ESP_EA5484-Firmware hin: Connect → sofortiger Drop → LWT → Reconnect-Versuch → ...

---

### 3.4 [MITTEL] Zone-ACK-Timeout — ESP_00000001

- **Schwere:** Mittel
- **Level:** WARNING
- **Timestamp:** `2026-03-31 16:06:18`
- **Message:**
  ```
  ACK timeout for ESP_00000001 zone (correlation_id=ac42a059-74e6-4259-b7ec-195ae5a02af4, timeout=15.0s, elapsed_ms=14999)
  Zone ACK timeout during state push for ESP_00000001: No ACK for ESP_00000001 zone (correlation_id=...) within 15.0s
  ```
- **Betroffene Dateien:**
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
  - `El Servador/god_kaiser_server/god_kaiser/mqtt_command_bridge.py`
- **Kontext:** Zeitgleich mit dem RSSI-Peak von -96 dBm und -91 dBm (16:06:03/16:06:04). Sehr wahrscheinlich bedingt durch den schlechten WiFi-Empfang in diesem Moment.
- **Auswirkung:** Zone-Assignment beim entsprechenden Heartbeat-Zyklus nicht bestätigt. Kein Datenverlust, aber Zone-State evtl. kurz nicht synchron.

---

### 3.5 [MITTEL] Handler returned False — actuator/26/command (6x)

- **Schwere:** Mittel
- **Level:** WARNING
- **Timestamps:** 15:51:29, 15:52:31, 15:53:32, 15:54:34, 16:06:35, 16:07:36
- **Message:**
  ```
  Handler returned False for topic kaiser/god/esp/ESP_00000001/actuator/26/command - processing may have failed
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
- **Kontext:** Erscheint JEDES MAL wenn die Logik-Engine Regel "TimmsRegenReloaded" auslöst und Aktor GPIO 26 an ESP_00000001 ansteuert. Direkt danach folgt aber `actuator_service` INFO: `Actuator command sent` — das Kommando wurde also gesendet. Ebenso folgen `actuator_handler` INFO: `state=on` — der Aktor reagiert.
- **Root Cause:** Der Mock-ESP-Aktor-Command-Handler gibt `False` zurück, obwohl das Kommando verarbeitet wurde. Entweder gibt der Handler absichtlich `False` als "not-my-topic"-Signal zurück, oder es liegt ein Rückgabewert-Bug vor.
- **Anmerkung:** Kein Datenverlust feststellbar. Wahrscheinlich ein Rückgabewert-Bug im Handler-Code selbst.

---

### 3.6 [NIEDRIG] ESP_00000001 — Schwaches WiFi-Signal (persistierend)

- **Schwere:** Niedrig (degradierendes Trend)
- **Level:** WARNING
- **Timestamps + RSSI:**
  - `15:52:31` — rssi=-73 dBm
  - `15:53:31` — rssi=-84 dBm
  - `15:53:31` — rssi=-72 dBm
  - `15:54:31` — rssi=-77 dBm
  - `16:06:03` — rssi=-96 dBm (kritisch)
  - `16:06:04` — rssi=-91 dBm
  - `16:07:05` — rssi=-89 dBm
  - `16:08:05` — rssi=-96 dBm (kritisch)
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- **Trend:** RSSI verschlechtert sich im Verlauf der 20 Minuten von -72/-73 auf -96 dBm. Werte unter -80 dBm gelten als instabil, -96 dBm liegt im Grenzbereich. Korreliert mit dem Zone-ACK-Timeout um 16:06.

---

### 3.7 [NIEDRIG] Sensor Stale — ESP_00000001 GPIO 4 (nur beim Startup)

- **Schwere:** Niedrig (transient, nur beim Neustart)
- **Level:** WARNING
- **Timestamp:** `2026-03-31 15:51:05`
- **Message:**
  ```
  Sensor stale: ESP ESP_00000001 GPIO 4 (ds18b20) - no data for 192s (timeout: 180s)
  Sensor health check complete: 1 checked, 1 stale, 0 healthy, 3 skipped
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py`
- **Kontext:** Server neu gestartet um 15:51. Der Health-Check läuft sofort und findet den Sensor als stale (letztes Datum 192s alt). Danach normalisiert sich der Zustand beim nächsten Check (15:59:05: `3 healthy`).
- **Auswirkung:** Keine. Erwartetes Verhalten beim Neustart.

---

### 3.8 [NIEDRIG] LWT für unbekanntes Device ESP_472204

- **Schwere:** Niedrig
- **Level:** WARNING + Error-Code [5001]
- **Timestamp:** `2026-03-31 15:51:06`
- **Message:**
  ```
  LWT received: ESP ESP_472204 disconnected unexpectedly (reason: unexpected_disconnect)
  [5001] LWT for unknown device ESP_472204 - ignoring
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py`
- **Auswirkung:** Wird korrekt ignoriert. Nur einmaliges Auftreten.

---

### 3.9 [NIEDRIG] Zone ACK — mock_zone nicht in DB

- **Schwere:** Niedrig
- **Level:** WARNING
- **Timestamps:** `15:51:06`, `15:51:06` (2x beim Startup)
- **Message:**
  ```
  Zone ACK from ESP_00000001: zone 'mock_zone' not found in DB. Ignoring — will be resolved on next heartbeat cycle.
  Handler returned False for topic kaiser/god/esp/ESP_00000001/zone/ack - processing may have failed
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`
- **Kontext:** Nur beim Startup (15:51:06). ESP_00000001 sendet zone ACK für `mock_zone`, die nicht in der DB existiert. Transient.

---

### 3.10 [NIEDRIG] Email Template Directory fehlt

- **Schwere:** Niedrig (konfiguratorisch)
- **Level:** WARNING
- **Timestamp:** `2026-03-31 15:51:05`
- **Message:**
  ```
  Email template directory not found: /app/templates/email
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/services/email_service.py`
- **Auswirkung:** E-Mail-Versand möglicherweise ohne Templates. Nur bei Email-Funktion relevant.

---

### 3.11 [NIEDRIG] MQTT TLS deaktiviert (Security-Warnung)

- **Schwere:** Niedrig (Development-Kontext)
- **Level:** WARNING
- **Timestamp:** `2026-03-31 15:51:05`
- **Message:**
  ```
  MQTT TLS is disabled. MQTT authentication credentials will be sent in plain text. Enable MQTT_USE_TLS for secure credential distribution.
  ```
- **Betroffene Datei:** `El Servador/god_kaiser_server/src/main.py`
- **Auswirkung:** Development-Umgebung — akzeptabel. In Production aktivieren.

---

### 3.12 [INFO] HTTP 401 — Unauthentifizierte Requests (Cluster)

- **Schwere:** Info
- **Level:** INFO (HTTP-Status)
- **Zeitraum:** 16:03:37–16:04:29 und 16:07:58
- **Betroffene Endpoints:**
  - `GET /api/v1/debug/mock-esp` — 401
  - `GET /api/v1/esp/devices/pending` — 401
  - `GET /api/v1/esp/devices` — 401 (3x)
  - `GET /api/v1/logic/rules` — 401
  - `GET /api/v1/zones` — 401
  - `GET /api/v1/health/detailed` — 401
- **Kontext:** Cluster von 401-Requests zwischen 16:03:37 und 16:04:29. Zeitlich korreliert mit erneutem Browser-Refresh oder Session-Ablauf nach dem Frontend-Reconnect. JWT-Ablauf oder Token-Rotation wahrscheinlich.
- **Log-Zeile:** `src.api.deps - WARNING - No authentication token provided`

---

### 3.13 [INFO] HTTP 403 — POST /api/v1/actuators/ESP_EA5484/14 (3x)

- **Schwere:** Info (bekanntes Issue aus SERVER_DEBUG_REPORT.md)
- **Timestamps:** 16:01:08, 16:01:29, 16:03:03
- **Ursache:** ESP_EA5484 hat Status `offline` in DB — Device-Status-Guard blockiert Konfiguration (bereits vollständig in `SERVER_DEBUG_REPORT.md` dokumentiert, Befund 3.1 dort).

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| `docker ps` Container-Status | `automationone-server` healthy, up 16 min; alle anderen Services healthy/running |
| Anzahl LWT-Events ESP_EA5484 | 233 Events in ~16 Minuten (massives Flooding) |
| Anzahl ERROR-Level-Einträge | 2 echte Bugs (hysteresis + webhook), plus Cascade-Fehler |
| HTTP-Fehler 4xx (gesamt) | 3x 403 (ESP_EA5484 offline, bekannt), 11x 401 (Authentifizierung) |
| HTTP-Fehler 5xx | Keine |
| Circuit Breaker Status (Startup) | Alle 3 geschlossen (mqtt, database, external_api) — healthy |
| MQTT-Subscriptions | 15 Topics korrekt registriert |
| Server-Neustart im Zeitraum | 1x (15:47-15:48 Shutdown, 15:51:04 Startup) |
| Sensor-Daten nach Neustart | ESP_00000001 + ESP_EA5484 beide aktiv, Daten kommen an |
| Hysteresis-Persistierung | KAPUTT — kein einziger State wird persistiert |
| Grafana-Webhook Deduplication | KAPUTT — 4 verschiedene Alert-Fingerprints können nicht re-geroutet werden |

---

## 5. Bewertung & Empfehlungen

### Root Causes (nach Priorität)

**Bug 1 — HysteresisEvaluator `_session_factory` falsch verdrahtet**
- Datei: `src/services/logic/conditions/hysteresis_evaluator.py`, Zeilen 114 + 146
- `self._session_factory()` gibt einen `async_generator` zurück, der nicht mit `async with` kompatibel ist
- Fix: Entweder `get_db` mit `@asynccontextmanager` wrappen, oder direkt `async for session in self._session_factory(): ...` verwenden — abhängig davon wie `_session_factory` injiziert wird
- Kritikalität: Bei Server-Neustart kein State-Recovery — Hysterese startet immer "fresh"

**Bug 2 — Grafana-Webhook-Handler kein UPSERT**
- Datei: `src/api/v1/webhooks.py`
- Handler macht blindes `INSERT` ohne `ON CONFLICT DO NOTHING/UPDATE` — schlägt bei jedem Re-Sending des gleichen Alerts fehl
- Cascade: Nach dem ersten IntegrityError wird die SQLAlchemy-Session ohne Rollback weiterverwendet — alle Folge-Alerts im selben Webhook-Batch schlagen ebenfalls fehl
- Fix: Vor INSERT auf Fingerprint prüfen (`SELECT ... WHERE fingerprint=...`) oder `INSERT ... ON CONFLICT (fingerprint) DO UPDATE SET status=..., updated_at=...`

**Hardware-Problem — ESP_EA5484 Reconnect-Loop**
- 233 LWT-Events in 16 Minuten = Firmware-seitige Reconnect-Schleife
- Kein Server-Bug, aber führt zu Log-Flooding und erhöhter Last
- Empfehlung: ESP_EA5484-Firmware-Logs prüfen (Serial-Monitor), Exponential-Backoff für MQTT-Reconnect konfigurieren

**Degradierendes WiFi — ESP_00000001**
- RSSI von -72 auf -96 dBm im Verlauf von 20 Minuten
- Werte unter -85 dBm verursachen bereits Paketverlust, -96 dBm löste den Zone-ACK-Timeout aus
- Empfehlung: Physische Position des ESP_00000001 oder Access-Point prüfen

### Keine offenen 5xx-Fehler
Der Server liefert keine HTTP-500-Antworten. Die internen Fehler (Hysterese, Webhooks) werden vom Exception-Handler abgefangen und führen nicht zu Client-sichtbaren Fehlern (Hysterese: stille Fehler; Webhooks: HTTP 200 trotz Fehler).

---

## 6. Betroffene Code-Dateien

| Datei | Problem | Priorität |
|-------|---------|-----------|
| `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py` | `async_generator` statt Context Manager, Zeilen 114 + 146 | Hoch |
| `El Servador/god_kaiser_server/src/api/v1/webhooks.py` | Kein UPSERT/Deduplication vor Notification-INSERT | Hoch |
| `El Servador/god_kaiser_server/src/mqtt/subscriber.py` | Handler-Rückgabewert `False` bei actuator/command — potentieller Bug | Mittel |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | Zone-ACK-Timeout bei schlechtem Signal (Verhalten korrekt, aber Monitoring) | Info |
| `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` | Kein Rate-Limiting für LWT-Storm-Logging | Info |
