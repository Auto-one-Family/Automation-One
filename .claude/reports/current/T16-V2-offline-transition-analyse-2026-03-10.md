# T16-V2: Offline-Uebergangs-Logik — Code-Trace

**Erstellt:** 2026-03-10
**Verifikation:** V-SS-02 — Offline-Uebergangs-Logik tracen
**Modus:** B (Spezifische Analyse: Aktor-State-Reset bei Offline-Uebergang)

---

## 1. Zusammenfassung

Zwei Mechanismen setzen ESP-Geraete auf "offline": der **Heartbeat-Timeout** (periodisch, nach 300s) und der **LWT-Handler** (instant, bei MQTT-Disconnect). Beide setzen ausschliesslich `esp_devices.status` auf `"offline"`. **Kein Mechanismus setzt `actuator_states.state` auf `"unknown"`.** Die Aktor-States bleiben nach einem Offline-Uebergang auf ihrem letzten bekannten Wert stehen, typischerweise `"idle"` oder `"active"`.

**Aktor-State-Reset bei Offline: NEIN**

---

## 2. Heartbeat-Timeout-Handler

### Lokation

```
El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py
Methode: HeartbeatHandler.check_device_timeouts()
Zeilen: 1426-1523
```

### Aufruf-Kette

```
MaintenanceService._health_check_esps()          [maintenance/service.py:317]
  └─ heartbeat_handler.check_device_timeouts()   [heartbeat_handler.py:1426]
```

Der `MaintenanceService` ruft `_health_check_esps()` als geplanten Job auf (alle 60s, gemaess `service.py:318` Kommentar).

### Timeout-Schwellwert

```python
# heartbeat_handler.py:43
HEARTBEAT_TIMEOUT_SECONDS = 300  # 5 Minuten
```

### Was `check_device_timeouts()` tut (Zeilen 1439-1523)

1. Holt alle Geraete mit `status == "online"` via `esp_repo.get_by_status("online")`
2. Berechnet `timeout_threshold = now - timedelta(seconds=300)`
3. Fuer jedes Geraet mit `last_seen < timeout_threshold`:
   - **DB-Operation:** `await esp_repo.update_status(device.device_id, "offline")` — setzt nur `esp_devices.status` und `esp_devices.last_seen`
   - **Audit-Log:** `AuditEventType.DEVICE_OFFLINE` mit `reason="heartbeat_timeout"`
   - **WebSocket-Event:** `"esp_health"` mit `{"status": "offline", "reason": "heartbeat_timeout"}`
4. `session.commit()` nach allen Updates

### Was NICHT passiert

- Kein `ActuatorRepository.update_state(...)` Aufruf
- Kein Import von `ActuatorRepository` in `heartbeat_handler.py`
- Kein Reset von `actuator_states.state` auf `"unknown"` oder `"idle"`

---

## 3. LWT-Handler

### Lokation

```
El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py
Klasse: LWTHandler
Methode: handle_lwt()
Zeilen: 50-181
```

### Topic

```
kaiser/{kaiser_id}/esp/{esp_id}/system/will
```

### Was `handle_lwt()` tut (Zeilen 70-181)

1. Topic parsen — `esp_id` extrahieren
2. Payload validieren (minimal: `status`-Feld)
3. ESP via `esp_repo.get_by_device_id(esp_id_str)` aus DB laden
4. **Nur wenn** `esp_device.status == "online"`:
   - **DB-Operation:** `await esp_repo.update_status(esp_id_str, "offline")` — setzt nur ESP-Status (Zeile 110)
   - `device_metadata["last_disconnect"]` mit `reason`, `timestamp`, `source="lwt"` schreiben (Zeilen 113-121)
   - **Audit-Log:** `AuditEventType.LWT_RECEIVED`, Severity WARNING (Zeilen 124-143)
   - `session.commit()`
   - **WebSocket-Event:** `"esp_health"` mit `{"status": "offline", "reason": "...", "source": "lwt"}` (Zeilen 150-166)

### Was NICHT passiert

- Kein Aktor-State-Reset
- Kein Import von `ActuatorRepository` oder `ActuatorState`
- Keine Notifications werden erstellt (nur Audit-Log-Eintrag)

---

## 4. ESP-Repository: `update_status()`

### Lokation

```
El Servador/god_kaiser_server/src/db/repositories/esp_repo.py
Methode: ESPRepository.update_status()
Zeilen: 196-219
```

### Implementierung (vollstaendig)

```python
async def update_status(
    self, device_id: str, status: str, last_seen: Optional[datetime] = None
) -> Optional[ESPDevice]:
    device = await self.get_by_device_id(device_id)
    if device is None:
        return None

    device.status = status
    device.last_seen = last_seen or datetime.now(timezone.utc)

    await self.session.flush()
    await self.session.refresh(device)
    return device
```

**Fazit:** `update_status()` schreibt ausschliesslich `esp_devices.status` und `esp_devices.last_seen`. Kein Zugriff auf `actuator_states` oder `actuator_configs`.

---

## 5. Aktor-State-Modell

### `ActuatorState.state` Feld

```
El Servador/god_kaiser_server/src/db/models/actuator.py
Zeile: 289-294
```

Erlaubte Werte laut Dokumentation: `idle`, `active`, `error`, `emergency_stop`

Der Wert `"unknown"` ist **kein definierter State** im `ActuatorState`-Modell. Ein Offline-Reset muesste auf `"idle"` (oder einen neuen `"unknown"`-State) setzen.

### `ActuatorRepository.update_state()` — vorhandene Methode

```
El Servador/god_kaiser_server/src/db/repositories/actuator_repo.py
Methode: update_state()
Zeilen: 170-216
```

Diese Methode existiert und kann State, `current_value` und weitere Felder schreiben. Sie wird bereits in `actuator_service.py` und `actuator_response_handler.py` verwendet — nur nicht bei Offline-Uebergaengen.

---

## 6. Vollstaendige Bewertung aller Fragen

| Frage | Heartbeat-Timeout | LWT-Handler |
|-------|-------------------|-------------|
| `actuator_states.state` auf `"unknown"` gesetzt? | **NEIN** | **NEIN** |
| WebSocket-Event gesendet? | **JA** — `"esp_health"` mit `reason="heartbeat_timeout"` | **JA** — `"esp_health"` mit `source="lwt"` |
| Notifications erstellt? | Nein (nur Audit-Log) | Nein (nur Audit-Log) |
| DB-Operationen | `UPDATE esp_devices SET status='offline', last_seen=...` | `UPDATE esp_devices SET status='offline', last_seen=...` + `device_metadata` JSON-Update |

---

## 7. Vorgeschlagene Stelle fuer den Fix

### Empfehlung: Zentraler Offline-Uebergang in beiden Handlern

Der optimale Ort ist **nach** dem `esp_repo.update_status(...)` Aufruf in beiden Handlern, vor dem `session.commit()`.

**In `check_device_timeouts()` (heartbeat_handler.py:1458):**

```python
# Nach: await esp_repo.update_status(device.device_id, "offline")
# Einfuegen:
actuator_repo = ActuatorRepository(session)
actuators = await actuator_repo.get_by_esp(device.id)
for actuator in actuators:
    current_state = await actuator_repo.get_state(device.id, actuator.gpio)
    if current_state and current_state.state not in ("idle", "emergency_stop"):
        await actuator_repo.update_state(
            esp_id=device.id,
            gpio=actuator.gpio,
            actuator_type=actuator.actuator_type,
            current_value=0.0,
            state="idle",  # oder "unknown" wenn im Enum ergaenzt
        )
```

**In `handle_lwt()` (lwt_handler.py:110):**

Analoge Erweiterung nach `await esp_repo.update_status(esp_id_str, "offline")`.

### Alternativer Ansatz: Zentralisierung in `esp_repo.update_status()`

Ein einheitlicherer Ansatz waere, `update_status()` mit einem optionalen Parameter `reset_actuators: bool = False` zu erweitern. Das haette aber den Nachteil, dass der Repository das Actuator-Repository kennen muesste (Cross-Repository-Abhaengigkeit).

**Empfehlung: Handler-seitige Loesung** — beide Handler erhalten die Aktor-Reset-Logik direkt nach dem Status-Update. So bleibt jeder Handler eigenstaendig und testbar.

---

## 8. Analysierte Quellen

| Datei | Relevanz |
|-------|----------|
| `src/mqtt/handlers/heartbeat_handler.py:1426-1523` | `check_device_timeouts()` — Heartbeat-Timeout-Logik |
| `src/mqtt/handlers/lwt_handler.py:50-181` | `handle_lwt()` — LWT-Logik |
| `src/services/maintenance/service.py:317-350` | Aufruf von `check_device_timeouts()` alle 60s |
| `src/db/repositories/esp_repo.py:196-219` | `update_status()` — nur ESP-Status, kein Aktor-Reset |
| `src/db/repositories/actuator_repo.py:170-216` | `update_state()` — verfuegbar, aber nicht genutzt bei Offline |
| `src/db/models/actuator.py:289-294` | `ActuatorState.state` Feld — kein `"unknown"` definiert |
| `src/mqtt/handlers/heartbeat_handler.py:43` | `HEARTBEAT_TIMEOUT_SECONDS = 300` |
