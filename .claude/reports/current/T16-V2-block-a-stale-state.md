# T16-V2 Block A — Stale Actuator State + Offline-Transition

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: T16-V2 Block A)
**Analysierte Quellen:** actuator_configs, actuator_states, actuator_history, esp_devices, heartbeat_handler.py, lwt_handler.py, maintenance/service.py

---

## V-SS-01: Actuator-State bei Offline-ESP

**Ergebnis:** FAIL

**Details:**

Die Datenbank hat zwei separate Tabellen fuer Aktor-Zustand:
- `actuator_configs` — Konfiguration (gpio, actuator_type, enabled, config_status). Kein State-Feld.
- `actuator_states` — Echtzeit-Zustandstabelle mit `state`, `current_value`, `last_command_timestamp`.

Die urspruengliche Abfrage auf `ac.current_state` schlug fehl (`column does not exist`), weil der State in der separaten Tabelle `actuator_states` liegt — ein wichtiger architektonischer Befund.

**Abfrage-Ergebnis actuator_states JOIN esp_devices:**

| gpio | actuator_type | state | current_value | last_command_timestamp | device_id    | esp_status |
|------|---------------|-------|---------------|------------------------|--------------|------------|
| 26   | relay         | on    | 255           | 1970-01-01 00:00:00    | ESP_00000001 | offline    |
| 27   | relay         | off   | 0             | 2026-03-10 09:42:33    | ESP_472204   | offline    |

**Stale States:**

| ESP | GPIO | State | Bewertung |
|-----|------|-------|-----------|
| ESP_00000001 | 26 | on | **STALE** — ESP offline, Relay ON, Timestamp epoch (1970) = nie bestaetigt |
| ESP_472204   | 27 | off | nicht verifizierbar — ESP offline, aber State=OFF (unkritisch) |

**Befund ESP_00000001 / GPIO 26:**
- `state = "on"`, `current_value = 255` (vollstaendiger Einschaltwert)
- `last_command_timestamp = 1970-01-01 00:00:00` — Der Aktor hat nie eine echte Statusbestaetigung vom ESP geschickt. Der State wurde nie per MQTT `actuator_status`-Nachricht bestaetigt, sondern ist ein Artefakt eines Befehls ohne ACK.
- ESP ist `offline` → kein laufender Heartbeat, kein MQTT-Kanal
- **Realzustand des Aktors ist unbekannt.** Server zeigt `on`, ESP koennte in beliebigem Zustand sein.

**Befund actuator_configs:**
- 1 Eintrag: ESP_472204, GPIO 27, digital, `config_status=applied`
- Kein `current_state`, kein `state_updated_at`, kein `last_command_at` in `actuator_configs`
- Die Konfigurationstabelle hat kein State-Tracking — das ist bewusst in `actuator_states` ausgelagert

**Schema-Pruefung actuator_configs — fehlende Felder:**

```
state_updated_at: NICHT VORHANDEN
last_command_at:  NICHT VORHANDEN
```

Beide Felder fehlen auch in `actuator_states`. Es gibt `last_command_timestamp` (ohne timezone — weiteres Problem), aber kein Feld das angibt, ob der State nach einem Offline-Ereignis invalidiert wurde.

**Datenvolumen:**
- actuator_states: 2 Eintraege
- actuator_history: 30 Eintraege

---

## V-SS-02: Offline-Uebergangs-Logik

**Ergebnis:** FAIL

**Details:**

### LWT-Handler (lwt_handler.py)

**Was passiert bei LWT-Empfang:**
1. ESP-Status in `esp_devices` wird auf `"offline"` gesetzt
2. `device_metadata.last_disconnect` wird mit Grund + Timestamp befuellt
3. Audit-Log-Eintrag `LWT_RECEIVED` wird erstellt
4. WebSocket-Broadcast `esp_health` mit `status: offline` wird gesendet

**Was NICHT passiert:**
- Kein Reset von `actuator_states.state`
- Kein Update von `actuator_states` auf irgendeinen Wert (z.B. `"unknown"`)
- Keine Notification an Frontend "Aktor-Status unbekannt"

Relevante Code-Stelle `lwt_handler.py:109-145`:
```python
if esp_device.status == "online":
    await esp_repo.update_status(esp_id_str, "offline")
    # Update device_metadata with disconnect reason
    device_metadata["last_disconnect"] = { ... }
    # Audit Logging
    # WebSocket Broadcast esp_health offline
    # KEIN Actuator-State-Reset
```

### Heartbeat-Timeout-Handler (heartbeat_handler.py:check_device_timeouts)

**Was passiert bei Heartbeat-Timeout:**
1. ESP-Status auf `"offline"` gesetzt (`esp_repo.update_status`)
2. Audit-Log `DEVICE_OFFLINE` mit reason `"heartbeat_timeout"`
3. WebSocket-Broadcast `esp_health` mit `status: offline`

**Was NICHT passiert:**
- Kein Reset von `actuator_states.state`
- Kein Laden der zugehoerigen Aktoren
- Keine Markierung des States als `"unknown"` oder `"stale"`

Relevante Code-Stelle `heartbeat_handler.py:1456-1459`:
```python
if last_seen < timeout_threshold:
    await esp_repo.update_status(device.device_id, "offline")
    offline_devices.append(device.device_id)
    # KEIN ActuatorRepository.reset_states_for_device()
```

### Actuator-Handler (actuator_handler.py)

Der `ActuatorStatusHandler` verarbeitet nur eingehende MQTT-Statusmeldungen vom ESP. Er wird bei Offline-Transitionene **nicht aufgerufen** — kein passiver Mechanismus.

### Maintenance-Service (maintenance/service.py)

`_health_check_esps()` ruft `heartbeat_handler.check_device_timeouts()` auf (alle `esp_health_check_interval_seconds`). Kein Actuator-Reset in dieser Kette.

### WebSocket-Events bei Offline-Transition

Beide Pfade (LWT + Heartbeat-Timeout) senden:
```json
{ "esp_id": "...", "status": "offline", "reason": "...", "timestamp": ... }
```

Das Frontend empfaengt `esp_health` und kann den ESP als offline markieren. Die `actuator_states` werden jedoch nicht per WS-Event invalidiert — das Frontend zeigt moeglicherweise einen veralteten Aktor-State weiter an.

---

## Root Cause

**Architektonische Luecke:** Die Offline-Transition (via LWT oder Heartbeat-Timeout) aktualisiert ausschliesslich `esp_devices.status`. Die Tabelle `actuator_states` wird weder zurueckgesetzt noch als `"unknown"` markiert.

Die Folge: Der Server persistiert einen Aktor-State (`on`/`off`) ohne Wissen, ob dieser State nach dem letzten Offline-Ereignis noch der Realitaet entspricht. Beim naechsten `GET /api/v1/actuators` liefert der Server einen State, der moeglicherweise Stunden oder Tage alt ist.

**Konkreter Beweis:** `ESP_00000001` / GPIO 26 zeigt `state=on` mit `last_command_timestamp=1970-01-01` und `esp_devices.status=offline`.

---

## Fix-Empfehlung

**Richtiger Ort:** Beide Pfade muessen erweitert werden — LWT ist bei Abstuerzen schneller (sofort), Heartbeat-Timeout ist der Fallback fuer schweigende Disconnects.

**Option A (empfohlen): State auf "unknown" setzen**

In `lwt_handler.py` und `heartbeat_handler.check_device_timeouts()` nach dem `esp_repo.update_status()`:

```python
# Nach esp_repo.update_status(esp_id_str, "offline"):
actuator_repo = ActuatorRepository(session)
await actuator_repo.reset_states_for_device(
    esp_id=esp_device.id,
    new_state="unknown",
    reason="device_offline"
)
```

`ActuatorRepository.reset_states_for_device()` muss noch implementiert werden:
```python
async def reset_states_for_device(self, esp_id: uuid.UUID, new_state: str, reason: str) -> int:
    stmt = (
        update(ActuatorState)
        .where(ActuatorState.esp_id == esp_id)
        .values(state=new_state, error_message=f"Device offline: {reason}")
    )
    result = await self.session.execute(stmt)
    return result.rowcount
```

**Option B: Frontend-seitig handeln**

Das Frontend ignoriert `actuator_states.state` wenn `esp_devices.status == "offline"` und zeigt stattdessen "Status unbekannt" an. Nachteil: Inkonsistenz bleibt in der DB.

**Option C: `state_invalidated_at` Feld erganzen**

Neue Spalte in `actuator_states`: `state_invalidated_at TIMESTAMP WITH TIME ZONE`. Bei Offline-Transition wird dieser Timestamp gesetzt. Server und Frontend pruefen dieses Feld beim Lesen.

**Empfehlung:** Option A (Reset auf "unknown") ist die sauberste Loesung, da der DB-State die Realitaet korrekt abbildet. Option C ist erweiterbar und erlaubt sppaetere Analyse wann genau der State ungueltig wurde.

---

## Erweiterungsbedarf: `last_command_timestamp` ohne Timezone

Nebendiagnose: `actuator_states.last_command_timestamp` ist `timestamp without time zone` (Beweis: `1970-01-01 00:00:00` ohne UTC-Suffix). Laut api-rules.md ist `datetime.now()` ohne timezone verboten — dieses Schema verletzt die Regel. Eine Migration auf `TIMESTAMP WITH TIME ZONE` ist empfohlen.

---

## Zusammenfassung

| Test | Ergebnis | Schwere |
|------|----------|---------|
| V-SS-01: Stale State vorhanden | FAIL | Hoch |
| V-SS-01: Fehlende state_updated_at / last_command_at Felder | FAIL | Mittel |
| V-SS-01: Konkreter Stale State (ESP_00000001 GPIO 26, on, 1970) | FAIL | Hoch |
| V-SS-02: LWT-Handler ohne Actuator-Reset | FAIL | Hoch |
| V-SS-02: Heartbeat-Timeout ohne Actuator-Reset | FAIL | Hoch |
| V-SS-02: WS-Event korrekt (esp_health offline) | PASS | — |
| Nebendiagnose: last_command_timestamp ohne Timezone | WARN | Mittel |
