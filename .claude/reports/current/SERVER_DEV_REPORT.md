# Server Dev Report: V1-22 Actuator Command Pipeline — Analyse fuer Offline-ESP Handling

## Modus: A (Analyse)
## Auftrag: Vollstaendige Analyse der Actuator Command Pipeline, Fokus: Commands an Offline-ESPs
## Datum: 2026-03-10

---

## Codebase-Analyse

**Analysierte Dateien:**
- `src/api/v1/actuators.py` (vollstaendig, ~1100 Zeilen)
- `src/services/actuator_service.py` (vollstaendig, 289 Zeilen)
- `src/services/safety_service.py` (vollstaendig, 265 Zeilen)
- `src/services/logic_engine.py` (vollstaendig, 1021 Zeilen)
- `src/services/logic/actions/actuator_executor.py` (vollstaendig, 156 Zeilen)
- `src/mqtt/client.py` (vollstaendig, 704 Zeilen)
- `src/mqtt/publisher.py` (vollstaendig, 445 Zeilen)
- `src/services/mqtt_command_bridge.py` (vollstaendig, 237 Zeilen)
- `src/core/constants.py` (QoS-Konstanten)

**Grep-Ergebnisse:**
- `send_command` — alle Caller im Server: 4 Aufrufstellen (actuators.py:704, logic_engine.py:783, actuator_executor.py:116)
- `emergency_stop` / `is_online` — Safety Service hat KEINEN is_online-Check
- `QOS_ACTUATOR_COMMAND = 2` in constants.py:205

---

## A1 — Actuator Command Endpoint

**Dateien untersucht:** `src/api/v1/actuators.py` Zeilen 648–734, 816–1013

**Befund:**

### send_command Endpoint

**Route:** `POST /{esp_id}/{gpio}/command` (Zeile 648)
**Auth:** `OperatorUser` (Zeile 664) — Operator oder Admin

**Parameter (Zeile 659–665):**
```python
async def send_command(
    esp_id: str,          # URL-Pfad
    gpio: int,            # URL-Pfad
    command: ActuatorCommand,  # Body (command, value, duration)
    db: DBSession,
    current_user: OperatorUser,
    actuator_service: ActuatorService,  # Dependency Injected
)
```

**Device-Lookup (Zeilen 683–701):**
- Zeile 683: `esp_repo = ESPRepository(db)` — ESP wird per `esp_id` nachgeschlagen
- Zeile 686: `esp_device = await esp_repo.get_by_device_id(esp_id)` — 404 wenn nicht gefunden
- Zeile 692: `actuator = await actuator_repo.get_by_esp_and_gpio(esp_device.id, gpio)` — 404 wenn nicht gefunden
- Zeile 698: `if not actuator.enabled: raise ValidationException(...)` — 422 wenn deaktiviert
- **KEIN `is_online`-Check** — ESP kann offline sein, Command wird trotzdem gesendet

**HTTP-Status-Codes:**
- `200` — Command gesendet
- `400` — Safety check rejected / MQTT publish failed
- `404` — ESP oder Actuator nicht gefunden (ESPNotFoundError, ActuatorNotFoundError)
- `422` — Actuator deaktiviert oder Validierungsfehler

**Flow: HTTP Request → Service → MQTT Publish:**
```
POST /{esp_id}/{gpio}/command
  → ESP-Lookup (DB, 404 wenn nicht existiert)
  → Actuator-Lookup (DB, 404 wenn nicht gefunden)
  → Enabled-Check (422 wenn disabled)
  → actuator_service.send_command(esp_id, gpio, command, value, duration, issued_by)
      → SafetyService.validate_actuator_command()  [CRITICAL PATH]
      → ESPRepository.get_by_device_id()           [2. DB-Lookup]
      → ActuatorRepository.get_by_esp_and_gpio()   [3. DB-Lookup]
      → publisher.publish_actuator_command()        [MQTT QoS 2, fire-and-forget]
      → actuator_repo.log_command()                [Audit-Log]
      → WebSocket.broadcast("actuator_command")    [best-effort]
  ← ActuatorCommandResponse(acknowledged=False)
```

**ANDERE Command-Endpoints:**

| Endpoint | Route | Zeile | Besonderheit |
|----------|-------|-------|--------------|
| Emergency Stop | `POST /emergency_stop` | 816 | Geht NICHT ueber send_command(), direkter publisher.publish_actuator_command() |
| Clear Emergency | `POST /clear_emergency` | 1015 | Geht ueber publisher.client.publish() direkt |

**ESP-Status im Kontext:** Nein. Der Endpoint prueft NICHT `esp_device.is_online`. Ein Command an einen offline ESP wird ohne Warnung angenommen und als Erfolg zurueckgegeben wenn MQTT-Publish technisch klappt.

**Caller:** Frontend via HTTP (user-initiated), Logic Engine via send_command()

**Empfehlung:** Fuer V1-22: Vor dem `actuator_service.send_command()` Aufruf `esp_device.is_online` pruefen und spezifischen HTTP-Response-Code (z.B. 503 Service Unavailable oder custom 400 mit `offline_queued=True`) zurueckgeben. Alternativ: SafetyService um is_online-Check erweitern.

---

## A2 — Actuator Service

**Dateien untersucht:** `src/services/actuator_service.py` Zeilen 1–289

**Befund:**

### send_command() Methode

**Signatur (Zeile 45–53):**
```python
async def send_command(
    self,
    esp_id: str,
    gpio: int,
    command: str,
    value: float = 1.0,
    duration: int = 0,
    issued_by: str = "logic_engine",
) -> bool:
```

**ESP-Device-Status verfuegbar?** Nein. Die Methode liest das ESP-Device (Zeile 156: `esp_repo.get_by_device_id(esp_id)`) ausschliesslich um `esp_device.id` (UUID) fuer den `actuator_repo.get_by_esp_and_gpio()` Call zu ermitteln. Das Feld `esp_device.is_online` wird an keiner Stelle abgerufen oder ausgewertet.

**ESP fuer Topic-Generierung aufgeloest?** Nein. Das MQTT-Topic wird im Publisher via `TopicBuilder.build_actuator_command_topic(esp_id, gpio)` gebaut — `esp_id` kommt als String direkt aus dem Parameter, ohne DB-Roundtrip.

**Exceptions geworfen?** Keine expliziten Exceptions. Die Methode gibt `False` zurueck bei:
- SafetyService.validate_actuator_command() = invalid (Zeile 86)
- ESP device not found in DB (Zeile 157–159)
- publisher.publish_actuator_command() = False (Zeile 176)
- Unerwartete Exception im outer try/except (Zeile 283)

**Caller von send_command:**

| Datei | Zeile | Kontext |
|-------|-------|---------|
| `src/api/v1/actuators.py` | 704 | HTTP Endpoint, `issued_by=f"user:{current_user.username}"` |
| `src/services/logic_engine.py` | 783 | Legacy `_execute_action_legacy()`, `issued_by=f"logic:{rule_id}"` |
| `src/services/logic/actions/actuator_executor.py` | 116 | Modular `ActuatorActionExecutor.execute()`, `issued_by=f"logic:{rule_id}"` |

**ESP-Status im Kontext:** Nein. Kein `is_online`-Check in der Methode.

**Empfehlung:** Fuer V1-22 kann hier ein early-return eingebaut werden: Nach dem ESP-Device-Lookup (Zeile 156) `if not esp_device.is_online: logger.warning(...); return False` oder besser: Rueckgabe eines reicheren Typs der zwischen "offline" und "mqtt_failure" unterscheidet. Derzeit ist beides `False` ohne Differenzierung.

---

## A3 — Safety Service

**Dateien untersucht:** `src/services/safety_service.py` Zeilen 1–265

**Befund:**

**Aktuelle Validierungen in `validate_actuator_command()` (Zeile 87–131):**
1. Emergency Stop per ESP aktiv? (`_emergency_stop_active[esp_id]`) — Zeile 110
2. Globaler Emergency Stop aktiv? (`_emergency_stop_active["__ALL__"]`) — Zeile 117
3. `value` ausserhalb [0.0, 1.0]? — Zeile 124
4. `check_safety_constraints()` — Zeile 131

**In `check_safety_constraints()` (Zeile 133–211):**
1. ESP existiert in DB? — Zeile 156–161
2. Actuator-Config existiert? — Zeile 163–170
3. Actuator enabled? — Zeile 172–177
4. Value in [min_value, max_value]? — Zeile 180–187
5. Actuator laeuft bereits (Warning)? — Zeile 190–197
6. GPIO-Konflikte (Warning)? — Zeile 200–206

**Parameter/Kontext in validate_actuator_command:**
```python
async def validate_actuator_command(
    self, esp_id: str, gpio: int, command: str, value: float
) -> SafetyCheckResult:
```

**Hat SafetyService Zugriff auf esp_repo oder ESP-Status?**
- JA: `self.esp_repo = esp_repo` (Zeile 69)
- Der ESP wird in `check_safety_constraints()` per `esp_repo.get_by_device_id(esp_id)` geladen (Zeile 156)
- **`esp_device.is_online` wird geladen aber NICHT geprueft**

**Wird SafetyService von actuator_service.send_command() aufgerufen?**
Ja — explizit als ERSTER Schritt, Kommentar "CRITICAL - MUST be called before every command!" (Zeile 78).

**Koennte er erweitert werden ohne Signatur-Aenderung?**
Ja. In `check_safety_constraints()` (Zeile 133) ist der `esp_device` bereits geladen (Zeile 156). Ein `if not esp_device.is_online: return SafetyCheckResult(valid=False, error="ESP is offline")` wuerde an Zeile 162 passen — nach dem Existence-Check, vor dem Actuator-Config-Check. Keine Signatur-Aenderung noetig. Der Caller (`actuator_service.send_command()`) erhaelt dann `safety_result.valid=False` und bricht ab.

**ESP-Status im Kontext:** Ja — `esp_repo` ist injiziert, `esp_device` wird geladen, `is_online` ist zugaenglich aber ungeprueft.

**Empfehlung:** Fuer V1-22 ist `safety_service.check_safety_constraints()` der praezise Eingriffspunkt. Erweiterung in Zeile 162 (nach Existence-Check): `if not esp_device.is_online: return SafetyCheckResult(valid=False, error=f"ESP {esp_id} is offline — command queued or rejected")`. Dies blockiert den Command an der richtigen Stelle im CRITICAL PATH, ohne API-Signatur oder actuator_service zu aendern.

---

## A4 — Logic Engine Command-Pfad

**Dateien untersucht:** `src/services/logic_engine.py` Zeilen 754–826, `src/services/logic/actions/actuator_executor.py` Zeilen 1–156

**Befund:**

**Wie sendet Logic Engine Actuator-Commands?**
Ueber `actuator_service.send_command()` — NICHT direkt MQTT. Zwei Pfade existieren:

**Pfad 1 — Modular (bevorzugt):** `ActuatorActionExecutor.execute()` in `actuator_executor.py:116`
```python
success = await self.actuator_service.send_command(
    esp_id=esp_id, gpio=gpio, command=command,
    value=value, duration=duration, issued_by=issued_by,
)
```

**Pfad 2 — Legacy (Backward Compatibility):** `logic_engine._execute_action_legacy()` Zeile 783
```python
success = await self.actuator_service.send_command(
    esp_id=esp_id, gpio=gpio, command=command,
    value=value, duration=duration, issued_by=f"logic:{rule_id}",
)
```

**Gibt es ActuatorActionExecutor?** Ja — `src/services/logic/actions/actuator_executor.py`. Wird in `logic_engine.py` Zeile 82 instanziiert: `actuator_exec = ActuatorActionExecutor(actuator_service)`.

**Hat Logic Engine ESP-Status-Awareness?**
Nein. Weder `logic_engine.py` noch `actuator_executor.py` prueft `esp_device.is_online`. Der einzige Status-Check ist ein "subzone_mismatch"-Skip in `actuator_executor.py` Zeilen 76–95 (Phase 2.4 Feature).

**Was passiert bei Command-Failure?**
- `send_command()` gibt `False` zurueck
- `actuator_executor.py` Zeile 142: `return ActionResult(success=False, message=f"Actuator command failed: ...")`
- `logic_engine._evaluate_rule()` Zeile 730: `logger.error(f"Rule {rule_name} failed to execute action: ...")`
- Die Rule-Execution wird trotzdem als Versuch geloggt (`logic_repo.log_execution()` Zeile 389)
- **Kein Retry, kein Queuing, kein Offline-Buffer** fuer Logic-Engine-Commands

**ESP-Status im Kontext:** Nein — weder in Logic Engine noch in ActuatorActionExecutor.

**Empfehlung:** Da Logic Engine `actuator_service.send_command()` aufruft, wirkt ein Fix im SafetyService automatisch auch auf Logic-Engine-Commands. Kein separater Fix in Logic Engine noetig. Falls Offline-Queuing gewuenscht: `actuator_executor.py` koennte unterscheiden ob Rueckgabe "offline" vs. "hardware_error" ist — dafuer muss `send_command()` aber einen reicheren Rueckgabetyp erhalten.

---

## A5 — MQTT-Publish-Mechanismus

**Dateien untersucht:** `src/mqtt/client.py` Zeilen 413–483, `src/mqtt/publisher.py` Zeilen 63–103, 355–419, `src/services/mqtt_command_bridge.py` Zeilen 1–237, `src/core/constants.py`

**Befund:**

**Werden Actuator-Commands ueber MQTTCommandBridge oder fire-and-forget?**

`MQTTCommandBridge` wird **ausschliesslich** fuer Zone-/Subzone-Operationen verwendet (`send_and_wait_ack()` mit ACK-Waiting). Actuator-Commands gehen **IMMER fire-and-forget** via `Publisher.publish_actuator_command()`.

**QoS-Level fuer Actuator-Commands:**
```python
# src/core/constants.py Zeile 205
QOS_ACTUATOR_COMMAND = 2  # Exactly once
```
QoS 2 bedeutet: Der Broker garantiert exactly-once-Delivery an den Broker. Ob die Message beim ESP ankommt (ESP offline → Broker speichert, liefert nach Reconnect) haengt vom ESP-MQTT-Client-State ab. **Paho-MQTT** mit `clean_session=True` (Zeile 246 in `client.py`) bedeutet: **Offline-Messages werden NICHT gespeichert** — nach Reconnect fehlen QoS-2-Messages die waehrend Offline-Zeit gesendet wurden.

**Zentraler publish_actuator_command():**
Ja — `publisher.publish_actuator_command()` in `src/mqtt/publisher.py` Zeile 63. Alle drei Caller nutzen diesen. Emergency Stop ruft jedoch `publisher.client.publish()` direkt auf (Zeile 876, 966 in actuators.py) ohne die Publisher-Abstraktion.

**MQTT-Topic-Schema fuer Commands:**
```
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command
```
Topic wird via `TopicBuilder.build_actuator_command_topic(esp_id, gpio)` gebaut.

**Retained Messages?** Nein. `publisher._publish_with_retry()` Zeile 391: `self.client.publish(topic, payload_str, qos)` ohne `retain=True`. Default ist `retain=False`.

**Offline Buffer im MQTTClient:**
`client.py` Zeile 172: `MQTTOfflineBuffer` ist initialisiert. Bei Circuit Breaker OPEN oder `not self.connected`: Messages werden gepuffert (Zeile 439–449). **Aber:** Der Buffer ist fuer MQTT-Broker-Unavailability, nicht fuer ESP-Offline-Status. Wenn MQTT connected ist und der ESP offline ist, wird publish als Erfolg gemeldet (rc=MQTT_ERR_SUCCESS) — der Broker nimmt die Message an, aber da `clean_session=True`, wird sie nach ESP-Reconnect NICHT nachgeliefert.

**ESP-Status im Kontext:** Nein. Publisher prueft keinen ESP-Status. MQTT-Client prueft nur Broker-Connectivity.

**Empfehlung:** Das QoS-2-garantierte Delivery gilt nur Broker-seitig. Das fundamentale Problem bei `clean_session=True` ist: Commands an offline ESPs gehen verloren. Fuer V1-22 gibt es zwei Optionen:
1. ESP-Client auf `clean_session=False` umstellen (auf ESP32-Firmware-Seite) — dann speichert Broker QoS-1/2-Messages
2. Server-seitiges Queuing: Command in DB persistieren als "pending", resenden beim naechsten Heartbeat des ESP

---

## A7 — Emergency Stop Sonderfall

**Dateien untersucht:** `src/api/v1/actuators.py` Zeilen 816–1013

**Befund:**

**Geht Emergency Stop ueber send_command()?**
Nein. Emergency Stop hat einen komplett separaten Pfad — er ruft `actuator_service.send_command()` **NICHT** auf. Stattdessen:

```python
# Zeilen 876–883: Direkter Publisher-Aufruf pro Actuator
success = publisher.publish_actuator_command(
    esp_id=device.device_id,
    gpio=actuator.gpio,
    command="OFF",
    value=0.0,
    duration=0,
    retry=True,
)
```

**Nutzt es Broadcast-Topic?**
Ja — zusaetzlich zu den ESP-spezifischen Commands sendet Emergency Stop ein Broadcast:
```python
# Zeilen 966–971: MQTT Broadcast
publisher.client.publish(
    topic="kaiser/broadcast/emergency",
    payload=broadcast_payload,
    qos=1,
    retain=False,
)
```

**MUSS Emergency Stop IMMER durchgehen auch bei offline ESP?**
Das Design intendiert das: Emergency Stop geht NICHT durch SafetyService, NICHT durch `send_command()`. Er versucht jeden Actuator per `publisher.publish_actuator_command()` zu stoppen und faengt Exceptions per `try/except` (Zeile 884). Ein MQTT-Fehler stoppt nicht die Schleife — er loggt nur `logger.error()` und setzt `success=False` fuer diesen Actuator.

**Kritische Beobachtung:** Emergency Stop setzt AUCH `safety_service.emergency_stop_all()` (oder `emergency_stop_esp()`) **NICHT** auf. Der `_emergency_stop_active`-Flag im SafetyService wird durch den `/emergency_stop` Endpoint **nie gesetzt**. Der Flag wird nur explizit durch den (separaten) `safety_service.emergency_stop_esp()` und `emergency_stop_all()` gesetzt — diese sind in der API via `/clear_emergency` erreichbar aber der `/emergency_stop` Endpoint aktiviert den Flag nicht.

**Ergebnis:** Nach einem Emergency-Stop-Request koennte ein nachfolgender normaler Command theoretisch durchkommen wenn der SafetyService-Flag nicht gesetzt wurde. Das ist ein potenzielles Design-Gap.

**ESP-Status im Kontext:** Nein — Emergency Stop prueft `is_online` nicht. Er sendet an ALLE ESPs (oder alle Actuators des angefragten ESP) unabhaengig vom Online-Status.

**Empfehlung:** Emergency Stop MUSS auch bei offline ESP "durchgehen" im Sinne von: MQTT-Publish-Versuch (Broker nimmt an, falls ESP reconnect mit `clean_session=False`). Kein is_online-Check fuer Emergency Stop einfuehren. Aber: Der SafetyService-Flag `_emergency_stop_active` sollte nach einem `/emergency_stop` gesetzt werden, damit nachfolgende normale Commands blockiert werden bis `/clear_emergency` aufgerufen wird.

---

## Zusammenfassung: Offline-ESP-Luecken

| Ebene | Datei:Zeile | is_online geprueft? | Luecke |
|-------|------------|---------------------|--------|
| API Endpoint | `actuators.py:686` | Nein | ESP-Lookup ohne Online-Check |
| SafetyService | `safety_service.py:156` | Nein — `esp_device` geladen, `is_online` ignoriert | Geeignetster Eingriffspunkt |
| ActuatorService | `actuator_service.py:156` | Nein | Redundant mit SafetyService-Lookup |
| ActuatorActionExecutor | `actuator_executor.py:116` | Nein | Verwendet send_command(), Fix erbt |
| Logic Engine | `logic_engine.py:783` | Nein | Verwendet send_command(), Fix erbt |
| Publisher | `publisher.py:88` | Nein | MQTT-Layer, falscher Fix-Punkt |
| Emergency Stop | `actuators.py:876` | Nein (korrekt so) | Intentional — soll immer senden |

**Minimaler Fix-Punkt fuer V1-22:**
`src/services/safety_service.py`, Funktion `check_safety_constraints()`, nach Zeile 161:
```python
# Nach dem Existence-Check:
if not esp_device.is_online:
    return SafetyCheckResult(
        valid=False,
        error=f"ESP {esp_id} is offline — command rejected",
    )
```

Dieser eine Eingriff blockiert Commands an offline ESPs fuer ALLE Caller (HTTP-Endpoint, Logic Engine, ActuatorActionExecutor) ausser Emergency Stop (der SafetyService nicht durchlaeuft).

**Wichtiger Vorbehalt:** Falls `clean_session=False` auf den ESP32-Clients aktiviert werden soll (damit Commands persistent im Broker bleiben bis ESP reconnect), muss das in der ESP32-Firmware (`El Trabajante/src/services/communication/mqtt_client.cpp`) und moeglichweise auch im Server-MQTT-Client angepasst werden.

---

## Qualitaetspruefung: 8-Dimensionen-Checkliste

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Analyse-Modus — kein Code geaendert |
| 2 | Namenskonvention | Keine Aenderung |
| 3 | Rueckwaertskompatibilitaet | Geplanter Fix: SafetyService-Erweiterung ohne Signatur-Aenderung — rueckwaertskompatibel |
| 4 | Wiederverwendbarkeit | SafetyService ist der Single-Point-of-Truth fuer Safety-Checks |
| 5 | Speicher & Ressourcen | Keine Aenderung |
| 6 | Fehlertoleranz | Luecke identifiziert: Kein is_online-Check im CRITICAL PATH |
| 7 | Seiteneffekte | Emergency Stop darf NICHT blockiert werden — separater Pfad sichert das |
| 8 | Industrielles Niveau | Derzeit: Fire-and-forget an offline ESPs mit silent success — nicht industriell |

---

## Cross-Layer Impact

| Aenderung | Betrifft | Pruefung noetig |
|-----------|---------|-----------------|
| SafetyService: is_online Check | Alle Actuator-Commands inkl. Logic Engine | Tests in `tests/unit/` fuer SafetyService-Erweiterung |
| ESP32 clean_session=False | ESP32-Firmware + Server-MQTT-Client | esp32-dev Agent + mqtt-dev Agent |
| Server MQTT clean_session=False | `src/mqtt/client.py:246` | MQTT-Behavior-Test noetig |

---

## Verifikation

Kein Code geaendert — keine Verifikation noetig.

---

## Empfehlung: Naechste Schritte fuer V1-22

**Option A (Minimal, nur Server):**
Eingriff in `src/services/safety_service.py:162` — `is_online`-Check in `check_safety_constraints()`. Kein anderer File benoetigt. Rueckwaertskompatibel. Blockiert alle normalen Commands an offline ESPs. Emergency Stop bleibt unberuehrt.

**Option B (Vollstaendig, MQTT-Persistenz):**
Zusaetzlich zu Option A: ESP32-MQTT-Client auf `clean_session=False` umstellen. Dann speichert der Broker QoS-1/2-Messages bis zum naechsten ESP-Reconnect. Benoetigt `esp32-dev` Agent.

**Option C (Server-seitiges Queuing):**
DB-Tabelle `actuator_command_queue` mit `pending/sent/failed`-Status. Bei offline ESP: Command persistieren, beim naechsten Heartbeat senden. Benoetigt neues Repository + Handler-Erweiterung.

**Empfehlung fuer V1-22:** Option A als sofortiger Fix, Option B als begleitende Firmware-Aenderung.

**Relevante Dateien:**
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\services\safety_service.py` (Eingriffspunkt: Zeile 161–162)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\services\actuator_service.py` (Zeile 156 — 2. ESP-Lookup, koennte entfernt werden nach SafetyService-Fix)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\api\v1\actuators.py` (Zeile 659–734: send_command Endpoint; Zeile 816–1013: emergency_stop)
- `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\mqtt\client.py` (Zeile 246: clean_session=True — relevant fuer Option B)
