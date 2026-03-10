# T17-V1-22 Analyse: Actuator-Kommandos an Offline-ESPs — Command-Pipeline Online-Guard

**Datum:** 2026-03-10
**Typ:** Tiefenanalyse (kein Code geaendert)
**Ausloeser:** T17-V1 Finding V1-22 (FAIL)
**Vorgaenger:** Fix-U (Frontend-Schutz + State-Reset)

---

## Kritischer Befund: Korrektur der Problemannahme

Die urspruengliche Annahme war: **Broker queued Messages fuer Offline-ESPs → stale Commands bei Reconnect.**

**FALSCH.** Beide Clients (ESP32 und Server) verbinden mit `clean_session=true`. Der Mosquitto-Broker verwirft Messages an offline Clients **sofort**. Es gibt kein Stale-Command-Execution-Problem durch Broker-Queuing.

**Korrigiertes Problem:** Commands an Offline-ESPs werden vom Server akzeptiert (HTTP 200), via MQTT publiziert (Broker akzeptiert die Message), aber nie zugestellt — **ohne Fehlerfeedback an den Caller**. Die Message verschwindet stumm.

---

## Analyse-Ergebnisse

### A1 — Actuator Command Endpoint

**Dateien untersucht:** `El Servador/god_kaiser_server/src/api/v1/actuators.py` (Zeilen 648-734)

**Befund:** `POST /{esp_id}/{gpio}/command` empfaengt `esp_id`, `gpio`, `command`, `value`, `duration`. Der ESP wird an Zeile 686 via `esp_repo.get_by_device_id()` aufgeloest — `esp_device.is_online` ist im Kontext, wird aber **nie geprueft**. Der Endpoint gibt HTTP 200 zurueck auch wenn der ESP offline ist und die MQTT-Message im Nichts verschwindet.

**Andere Command-Endpoints:**
- Emergency Stop (`/emergency_stop`, Zeile 816) — separater Pfad, NICHT ueber `send_command()`
- Kein Toggle-Endpoint (Toggle laeuft ueber den gleichen Command-Endpoint mit `command=TOGGLE`)

**ESP-Status im Kontext:** Ja, ab Zeile 686 verfuegbar aber ungenutzt.

---

### A2 — Actuator Service

**Dateien untersucht:** `El Servador/god_kaiser_server/src/services/actuator_service.py` (Zeilen 45-289)

**Befund:** `send_command(esp_id, gpio, command, value, duration, issued_by) -> bool`

Step 1: `safety_service.validate_actuator_command()` — laedt ESP intern, prueft NICHT is_online.
Step 2: Eigene Session, erneuter `esp_repo.get_by_device_id()` (Zeile 156) — `is_online` ungenutzt.
Step 3: `publisher.publish_actuator_command()` — Fire-and-forget, QoS 2.

**Alle Caller identifiziert:**
| Caller | Datei | Eigenstaendiger Status-Check? |
|--------|-------|-------------------------------|
| HTTP Endpoint | `actuators.py:704` | Nein |
| Logic Engine (Legacy) | `logic_engine.py:783` | Nein |
| ActuatorActionExecutor | `actuator_executor.py:116` | Nein |

**Exceptions:** Keine. Alle Fehler → `return False` ohne Differenzierung.

---

### A3 — Safety Service

**Dateien untersucht:** `El Servador/god_kaiser_server/src/services/safety_service.py` (Zeilen 60-211)

**Befund:** `check_safety_constraints()` laedt `esp_device` via `esp_repo.get_by_device_id()` an Zeile 156. Das ESPDevice-Objekt mit `status`-Feld ist verfuegbar. **Kein Offline-Check vorhanden.**

**Bestehende Safety-Checks:**
1. Emergency-Stop-Flag (In-Memory)
2. PWM-Range-Validierung
3. Actuator-Config enabled
4. Actuator-State Timeout
5. GPIO-Konflikte

**ESP-Repo Zugriff:** Ja, `self.esp_repo` ist injiziert (Zeile 69).

**Minimaler Fix:** Eine `if`-Zeile nach Zeile 161 — 0 zusaetzliche DB-Queries:
```python
if not esp_device.is_online:
    return SafetyCheckResult(valid=False, error=f"ESP {esp_id} is offline (status={esp_device.status})")
```

---

### A4 — Logic Engine Command-Pfad

**Dateien untersucht:** `logic_engine.py:783`, `actuator_executor.py:116`

**Befund:** Logic Engine sendet **ausschliesslich** ueber `actuator_service.send_command()`. Kein direkter MQTT-Zugriff. Beide Pfade (modular + legacy) erben automatisch jeden SafetyService-Fix.

**Bei Command-Failure:** `ActionResult(success=False)` + Log-Eintrag. Kein Retry, kein Queuing, kein Error-State-Propagation.

---

### A5 — MQTT-Publish-Mechanismus

**Dateien untersucht:** `publisher.py:63-103`, `client.py:235-247`, `mqtt_command_bridge.py`

**Befund:**
- Actuator-Commands: Fire-and-forget via `Publisher.publish_actuator_command()`, **QoS 2**
- MQTTCommandBridge: NUR fuer Zone/Subzone-Operationen (ACK-Waiting)
- Topic-Schema: `kaiser/{kid}/esp/{eid}/actuator/{gpio}/command` (aus TopicBuilder)
- Retained: Nein fuer Commands
- Server MQTT: `clean_session=True` (client.py:245)

---

### A6 — ESP-Status-Verfuegbarkeit im Service-Kontext

**Dateien untersucht:** `esp.py:139-152,249-252`, `esp_repo.py:40-57`, `safety_service.py:156`, `actuator_service.py:152-156`

**Befund:** ESP-Status ist an **zwei** Stellen ohne zusaetzliche Queries verfuegbar:
1. `safety_service.check_safety_constraints()` — Zeile 156, `esp_device` bereits geladen
2. `actuator_service.send_command()` Step 2 — Zeile 156, `esp_device` erneut geladen

**ESP-Status-Update-Pfade:**
- Heartbeat → `esp_repo.update_status(esp_id, "online", last_seen)` (alle 30s)
- LWT → `esp_repo.update_status(esp_id, "offline")` (sofort bei Disconnect)
- Maintenance Health Check → Offline-Markierung bei Heartbeat-Timeout (300s)

**Kosten eines Lookups:** Einfaches `SELECT * FROM esp_devices WHERE device_id = ? AND deleted_at IS NULL` — indiziertes Unique-Feld, O(log n), billigste Query im Schema.

**Kein In-Memory-Cache vorhanden.** Rein DB-basiert.

---

### A7 — Emergency-Stop Sonderfall

**Dateien untersucht:** `actuators.py:816-1013`

**Befund:** Emergency Stop geht **NICHT** ueber `send_command()`. Separater Pfad:
1. Iteriert alle Actuators (oder gefiltert per `esp_id`/`gpio`)
2. Direkt `publisher.publish_actuator_command(command="OFF")` pro Actuator
3. Zusaetzlich Broadcast auf `kaiser/broadcast/emergency` (QoS 1, kein retain)

**Design-Gap:** Der `/emergency_stop` API-Endpoint setzt `SafetyService._emergency_stop_active` Flag **NICHT**. Nur `safety_service.emergency_stop_all()` und `emergency_stop_esp()` setzen es.

**Empfehlung:** Emergency Stop MUSS vom Online-Guard unberuehrt bleiben. Da er einen separaten Pfad nutzt (nicht ueber `send_command()`), ist dies automatisch der Fall bei einem SafetyService-Fix.

---

### A8 — Mosquitto Broker Session-Verhalten

**Dateien untersucht:** `docker-compose.yml:50-75`, `docker/mosquitto/mosquitto.conf:1-76`, `mqtt_client.cpp:300-362`, `client.py:235-247`

**Befund:**

| Parameter | Wert | Quelle |
|-----------|------|--------|
| ESP32 `clean_session` | `true` (hartkodiert in PubSubClient) | mqtt_client.cpp:332 |
| Server `clean_session` | `true` (explizit) | client.py:245 |
| Broker `persistence` | `true` | mosquitto.conf:36 |
| `max_queued_messages` | 1000 | mosquitto.conf:72 |
| `max_inflight_messages` | 20 | mosquitto.conf:69 |
| Message Expiry/TTL | nicht konfiguriert | — |

**Entscheidender Widerspruch:** `persistence=true` ist gesetzt, aber beide Clients verbinden mit `clean_session=true`. Der Broker verwirft alle Subscriptions und queued Messages bei jedem Reconnect. `max_queued_messages=1000` greift NUR bei `clean_session=false`.

**Ergebnis: Broker buffert KEINE Messages fuer offline ESPs.** MQTT-Publish an offline ESP → Message wird vom Broker angenommen (rc=SUCCESS) → sofort verworfen → nie zugestellt.

**Impact:** Bestehende Features (Config-Push, Zone-Assign) sind ebenfalls betroffen — Commands gehen verloren wenn ESP offline. Das funktioniert aktuell nur weil der Server bei ESP-Reconnect (Heartbeat) aktiv den Full-State-Push triggert.

---

### A9 — Firmware Command-Empfang

**Dateien untersucht:** `actuator_manager.cpp:544-613`, `mqtt_client.cpp:850-867,996-1013`, `main.cpp:810-868`, `time_manager.h/.cpp`

**Befund:** Firmware fuehrt **jeden** empfangenen Command blind aus. Einzige Validierungen:
1. GPIO-Pruefung (Actuator konfiguriert?)
2. Emergency-Stop-State (Actuator im E-Stop?)
3. PWM-Wert-Range (constrain 0.0-1.0)

**Kein Freshness-Check.** Das `timestamp`-Feld wird lokal mit `millis()` gesetzt, NICHT aus dem Payload gelesen. Kein `issued_at`-Parsing.

**NTP:** Vollstaendig implementiert (3 NTP-Server, Stunden-Resync), aber nicht im Command-Path genutzt. Drift: 100-500 ppm (~3-18s/h). Wokwi: kein NTP, sendet `ts: 0`.

**Randbedingung:** Freshness-Check waere nur zuverlaessig wenn `timeManager.isSynchronized() == true` UND `issued_at > 0`. Vor erstem NTP-Sync (Boot-Phase, ~10s) kein Schutz moeglich.

---

## Korrigierte Bewertungsmatrix

Durch den A8-Befund (`clean_session=true` → kein Broker-Queuing) aendert sich die Bewertung:

### Ansatz A: Online-Check in safety_service.check_safety_constraints() — **EMPFOHLEN**

| Kriterium | Bewertung |
|-----------|-----------|
| **Abdeckung** | MAXIMAL — alle Caller (API + Logic Engine) gehen durch SafetyService |
| **Performance** | **0 zusaetzliche DB-Queries** — ESP bereits im Kontext |
| **Komplexitaet** | MINIMAL — eine `if`-Zeile |
| **Zukunftssicherheit** | SEHR GUT — zentraler Safety-Chokepoint |
| **Emergency-Stop** | AUTOMATISCH AUSGENOMMEN — separater Pfad |
| **Risiko** | MINIMAL — bestehende SafetyCheckResult-Struktur |

### Ansatz B: Online-Check in actuator_service.send_command() — Alternative

| Kriterium | Bewertung |
|-----------|-----------|
| **Abdeckung** | MAXIMAL — gleiche Abdeckung wie A |
| **Performance** | 0 zusaetzliche Queries (ESP in Step 2 geladen) |
| **Komplexitaet** | NIEDRIG |
| **Problem** | Return-Wert ist `bool` — keine differenzierte Fehlermeldung |

### Ansatz E: Firmware Freshness-Check — **NICHT MEHR NOTWENDIG**

Da der Broker keine Messages queued (`clean_session=true`), gibt es kein Stale-Command-Execution-Problem beim Reconnect. Ansatz E loest ein Problem das nicht existiert. Nur relevant wenn zukuenftig `clean_session=false` eingefuehrt wird.

### Ansatz C/D/F/G/H: Nicht empfohlen

- **C (API-Endpoint):** Allein unzureichend, Logic Engine umgeht API
- **D (Dual-Layer):** Redundanz unnoetig da SafetyService bereits den einzigen Chokepoint ist
- **F (Broker-Config):** Nicht noetig und wuerde Retained Messages brechen
- **G (Sequence-Number):** Over-Engineering, Problem existiert nicht
- **H (Topic Cleanup):** Irrelevant bei `clean_session=true`

---

## Empfohlener Fix-Ansatz

### Primaer: Ansatz A — Online-Check in SafetyService

**Datei:** `safety_service.py`, Methode `check_safety_constraints()`, nach Zeile 161

**Implementierungsskizze:**
```python
esp_device = await self.esp_repo.get_by_device_id(esp_id)
if not esp_device:
    return SafetyCheckResult(valid=False, error=f"ESP device not found: {esp_id}")

# --- V1-22: Online Guard ---
if not esp_device.is_online:
    return SafetyCheckResult(
        valid=False,
        error=f"ESP device is offline: {esp_id} (status={esp_device.status})"
    )
# --- Ende Online Guard ---

# ... bestehende Checks (Emergency-Stop, PWM-Range, etc.)
```

**API-Endpoint-Erweiterung** (optional, fuer klares HTTP-Feedback):
```python
# In actuators.py send_command Endpoint
# SafetyCheckResult.error enthaelt "offline" → HTTP 409
if "offline" in safety_result.error.lower():
    raise HTTPException(status_code=409, detail=safety_result.error)
```

### Sekundaer: Keiner noetig

Ansatz E (Firmware Freshness) ist nicht mehr noetig da Broker nicht queued. Kann als zukuenftige Defense-in-Depth-Massnahme in Phase 7+ betrachtet werden falls `clean_session` geaendert wird.

### Nicht empfohlen

- Broker-Config aendern (bricht bestehende Mechanismen)
- MQTTCommandBridge erweitern (falsche Abstraktionsebene)
- Command-Versionierung (Over-Engineering)

---

## Performance-Bewertung

| ID | Frage | Antwort |
|----|-------|---------|
| P1 | Zusaetzliche DB-Queries | **0** — ESP bereits in `check_safety_constraints()` geladen |
| P2 | ESP-Status im Kontext | **Ja** — `esp_device.is_online` Property auf dem bereits geladenen Model |
| P3 | Command-Frequenz | Niedrig — manuelle Toggles + Logic Engine Regeln, geschaetzt <10 Commands/Minute |
| P4 | In-Memory-Cache noetig | **Nein** — bei <10 Cmd/Min ist ein indizierter Single-Row-Lookup vernachlaessigbar |
| P5 | Latenz-Impact | **~0ms** — kein zusaetzlicher I/O, nur ein Python `if`-Check auf dem bereits geladenen Objekt |

---

## Stabilitaets-Bewertung

| ID | Frage | Antwort |
|----|-------|---------|
| S1 | Fail-Mode bei DB-Fehler | **Fail-closed** — `get_by_device_id()` wirft Exception → `send_command()` returned `False` → kein Command gesendet. Emergency-Stop: nicht betroffen (separater Pfad, kein SafetyService). |
| S2 | Race Condition Offline waehrend Check | **Akzeptabel** — Zeitfenster ~ms. ESP geht offline, LWT verarbeitet nach Check → Command publiziert, Broker verwirft sofort (clean_session). Kein Schaden. |
| S3 | Logic Engine Resilience | **Kein Retry** — `ActionResult(success=False)` + Log. Keine Kaskade. Rule wird beim naechsten Trigger-Zyklus erneut evaluiert. |
| S4 | Cascading Failure | **Kein Risiko** — Offline-Check ist billiger als der bestehende Safety-Check. Weniger Code-Pfad wird ausgefuehrt, nicht mehr. |
| S5 | Breaking Change | **Nein** — HTTP 409 waere ein neuer Status-Code. Bestehende Clients erwarten 200/400/404/500. Ein 409 wird von Standard-HTTP-Libraries korrekt als Client-Error behandelt. |

---

## Zukunftssicherheits-Bewertung

| ID | Frage | Antwort |
|----|-------|---------|
| Z1 | Command-Queuing (Phase 7+) | **Nicht blockiert** — Check ist im SafetyService. Ein zukuenftiges Queuing-Feature wuerde VOR dem SafetyService greifen (Queue bei Offline, Safety-Check bei Delivery). Alternativ: `allow_offline=True` Parameter. |
| Z2 | Cross-Zone-Commands (6.7) | **Nicht blockiert** — Cross-Zone ≠ Offline. Online-Check auf Ziel-ESP ist orthogonal zu Zone-Routing. |
| Z3 | Scheduled/Deferred Commands | **Korrekt gehandhabt** — Check passiert in `send_command()` zum Ausfuehrungszeitpunkt, nicht zum Schedule-Zeitpunkt. Scheduler ruft `send_command()` → SafetyService → Online-Check genau wenn ausgefuehrt wird. |
| Z4 | Deaktivierbar/Konfigurierbar | **Einfach erweiterbar** — Check ist eine `if`-Zeile. Kann mit Config-Flag oder `SafetyCheckResult`-Flag gesteuert werden. |

---

## Design-Gap (Nebenbefund aus A7)

**Emergency-Stop Flag-Inkonsistenz:** Der `/emergency_stop` API-Endpoint setzt `SafetyService._emergency_stop_active` Flag NICHT. Nur `safety_service.emergency_stop_all()` und `emergency_stop_esp()` setzen ihn. Nach einem API-initiierten Emergency-Stop koennte ein nachfolgender normaler Command durchkommen weil das Safety-Flag nie gesetzt wurde. Dies ist ein separater Bug, nicht Teil von V1-22.

---

## Akzeptanzkriterien — Status

| # | Kriterium | Status |
|---|-----------|--------|
| 1 | Alle 9 Analyse-Punkte beantwortet | ERFUELLT — A1-A9 mit Datei:Zeile |
| 2 | Alle Caller von send_command() identifiziert | ERFUELLT — 3 Caller (API, Logic Legacy, ActuatorExecutor) |
| 3 | ESP-Status-Verfuegbarkeit geklaert | ERFUELLT — 0 zusaetzliche DB-Queries |
| 4 | Emergency-Stop dokumentiert | ERFUELLT — separater Pfad, automatisch ausgenommen |
| 5 | Mosquitto Session-Verhalten | ERFUELLT — clean_session=true, kein Queuing |
| 6 | Firmware Command-Empfang | ERFUELLT — blind execution, kein Freshness-Check |
| 7 | Ansaetze A, B, D, E bewertet | ERFUELLT — A empfohlen, E nicht mehr noetig |
| 8 | P1-P5 beantwortet | ERFUELLT |
| 9 | S1-S5 beantwortet | ERFUELLT |
| 10 | Z1-Z4 beantwortet | ERFUELLT |
| 11 | Klare Empfehlung | ERFUELLT — Ansatz A (SafetyService), 1 if-Zeile |

---

## Zusammenfassung

**Das Problem ist einfacher als angenommen.** Kein Stale-Command-Execution durch Broker-Queuing (weil `clean_session=true`). Das eigentliche Problem: Commands an offline ESPs werden stumm akzeptiert und verworfen — kein Fehlerfeedback.

**Der Fix ist minimal:** Eine `if`-Zeile in `safety_service.check_safety_constraints()` nach dem bestehenden ESP-Lookup. 0 zusaetzliche DB-Queries. 0 neue Dependencies. Emergency-Stop automatisch ausgenommen. Alle Caller (API + Logic Engine) geschuetzt.
