# T13-Phase3 — Pre-existing Findings bereinigen — Implementierungsbericht

> **Datum:** 2026-03-09
> **Typ:** Implementierungsbericht
> **Bezug:** Konsolidierungs-Roadmap Phase 3 (nach Phase 1 Bug-Fixes + Phase 2 MQTTCommandBridge)
> **Status:** IMPLEMENTIERT, Verifizierung ausstehend (ruff clean, pytest uebersprungen)

---

## Zusammenfassung

Phase 3 bereinigt drei Pre-existing Findings aus T12/T13. Die Codebase-Analyse hat **zwei kritische Abweichungen vom Auftrag** ergeben.

| Phase | Auftrag | IST-Befund | Implementierung |
|-------|---------|------------|-----------------|
| 3.1 | Full-State-Push bei Reconnect | Auftrag korrekt | Wie geplant implementiert |
| 3.2 | sensor_handler nutzt Repo direkt | **FALSCH** — nutzt bereits DeviceScopeService | Cache-Safety Fix (Plain-Data statt ORM) |
| 3.3 | GPIO-0 Filter verifizieren | Filter in 4/5 Pfaden fehlend | Zentraler Filter in SubzoneService |
| 3.4 | Architektur-Hinweise H2/H3 | **BEREITS ERLEDIGT** | Entfaellt |

---

## Phase 3.3: GPIO-0 I2C-Placeholder Filter — IMPLEMENTIERT

### IST/SOLL-Delta

**IST:** GPIO-0-Filter existierte NUR in `zone_service._send_transferred_subzones()` (Zeile 624). Vier weitere Code-Pfade (REST subzone/assign, Sensor-Create single/multi, Actuator-Create) uebergaben GPIO 0 ungefiltert an den ESP, was Error 2506 ausloeste.

**SOLL:** GPIO 0 NIEMALS im MQTT-Payload `subzone/assign`.

### Aenderung

**Datei:** `El Servador/god_kaiser_server/src/services/subzone_service.py`
**Stelle:** Payload-Aufbau in `assign_subzone()` (Zeile 183)

Zentraler Filter vor MQTT-Publish:
```python
mqtt_gpios = [g for g in assigned_gpios if g != 0]
```

GPIO 0 bleibt in der DB (`subzone_configs.assigned_gpios`) fuer server-seitige I2C-Sensor-Aufloesung via `assigned_sensor_config_ids`.

### Abdeckung

Alle 5 Code-Pfade die `subzone/assign` senden gehen durch `SubzoneService.assign_subzone()` — der Filter greift zentral.

---

## Phase 3.2: Cache-Safety im DeviceScopeService — IMPLEMENTIERT

### IST/SOLL-Delta

**Auftrag behauptete:** sensor_handler nutzt `DeviceActiveContextRepository` direkt, soll auf `DeviceScopeService` umgestellt werden.

**Tatsaechlicher IST-Zustand:** sensor_handler nutzt BEREITS `DeviceScopeService` (Zeile 343). `get_active_context()` mit Class-Level-Cache (30s TTL) existiert und wird genutzt.

**Tatsaechliches Problem:** Der Cache speicherte `DeviceActiveContext` ORM-Objekte. Nach Session-Close (pro MQTT-Message eine neue Session) sind diese detached. Funktionierte zufaellig weil der Consumer (`zone_subzone_resolver.py`) nur Skalar-Spalten las (`active_zone_id`, `active_subzone_id`).

### Aenderung

**Datei:** `El Servador/god_kaiser_server/src/services/device_scope_service.py`

1. Neues `ActiveContextData(NamedTuple)` fuer session-unabhaengige Cache-Werte
2. `_CachedContext.context` Typ: `Optional[DeviceActiveContext]` → `Optional[ActiveContextData]`
3. `get_active_context()` konvertiert ORM → NamedTuple beim Cachen
4. Consumer (`zone_subzone_resolver.py`) unveraendert — Attribut-Zugriff identisch

---

## Phase 3.1: Full-State-Push bei ESP-Reconnect — IMPLEMENTIERT

### IST/SOLL-Delta

**IST:** Nach ESP-Reboot (>60s offline) sendet der Heartbeat-Handler nur Zone-Resync (Szenario B, Zeile 700-782). Subzones werden NICHT gesendet. GPIOManager auf ESP hat keine aktiven Subzone-GPIO-Registrierungen.

**SOLL:** Kompletter State-Push (Zone + alle aktiven Subzones) bei erkanntem Reconnect, ACK-gesteuert via MQTTCommandBridge.

### Aenderungen

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

1. **Module-Level Bridge-Referenz:** `_command_bridge` + `set_command_bridge()` (Pattern von zone_ack_handler)
2. **Reconnect-Erkennung** in `handle_heartbeat()`: `is_reconnect = offline_seconds > 60` — berechnet VOR `update_status()` (das `last_seen` ueberschreibt)
3. **`_handle_reconnect_state_push()`**: Async-Task mit eigener `resilient_session()`:
   - Zone-Assign via `command_bridge.send_and_wait_ack()` (10s Timeout)
   - Bei Zone-ACK-Erfolg: Alle aktiven Subzones sequenziell (max 8)
   - `parent_zone_id = ""` (Firmware setzt aktuelle Zone)
   - GPIO 0 gefiltert in `assigned_gpios`
   - Mock-ESP-Check (kein Push)
   - Cooldown: 120s via `device_metadata["full_state_push_sent_at"]`
4. **Zone-Mismatch-Skip:** Bei `is_reconnect` wird Szenario-B-Resync uebersprungen (Full-State-Push uebernimmt)
5. **`asyncio.create_task()`:** Nach `session.commit()` — blockiert Heartbeat-Handler nicht

**Datei:** `El Servador/god_kaiser_server/src/main.py`

- `set_heartbeat_bridge(_mqtt_command_bridge)` nach Zeile 288 hinzugefuegt

### Architektur-Entscheidungen

| Entscheidung | Begruendung |
|-------------|-------------|
| `last_seen` statt `status == "offline"` | `check_device_timeouts()` setzt "offline" erst nach 300s. ESPs 60-300s offline waeren nicht erkannt |
| Berechnung VOR `update_status()` | `update_status()` ueberschreibt `last_seen` mit NOW — danach Offline-Dauer nicht ermittelbar |
| `asyncio.create_task()` | Gleicher Pattern wie `_auto_push_config()` (Zeile 1224). Eigene Session, fire-and-forget |
| 120s Cooldown | Verhindert doppelten Push bei schnell aufeinanderfolgenden Heartbeats nach Reboot |

---

## Phase 3.4: Architektur-Hinweise — ENTFAELLT

### IST-Befund

- **H2 (DB-Query im Router):** `zone_repo.list_with_device_counts()` existiert bereits (Zeilen 185-250). Endpoint delegiert korrekt ans Repository.
- **H3 (Auth fehlt):** Alle Zone-Endpoints haben Auth-Dependency (`ActiveUser` oder `OperatorUser`).

→ Kein Handlungsbedarf.

---

## Verifizierung

| Check | Ergebnis |
|-------|----------|
| `ruff check` (betroffene Dateien) | CLEAN |
| Import-Check (device_scope_service, heartbeat_handler) | OK |
| `pytest` (vollstaendig) | **2057 passed, 0 failed, 68 skipped** (180s) |

### Bugfix waehrend Verifizierung

2 Heartbeat-Tests schlugen fehl wegen `TypeError: '>' not supported between instances of 'MagicMock' and 'int'`. Ursache: Tests mocken `esp_device.last_seen` als `MagicMock()` statt `datetime`. Fix: `isinstance(esp_device.last_seen, datetime)` statt `if esp_device.last_seen:` in der Reconnect-Erkennung.

---

## Geaenderte Dateien

| Datei | Phase | Zeilen geaendert |
|-------|-------|-------------------|
| `src/services/subzone_service.py` | 3.3 | +7 (GPIO-0 Filter im Payload-Aufbau) |
| `src/services/device_scope_service.py` | 3.2 | +15 (ActiveContextData NamedTuple, ORM→Plain-Data) |
| `src/mqtt/handlers/heartbeat_handler.py` | 3.1 | +115 (set_command_bridge, reconnect detection, _handle_reconnect_state_push) |
| `src/main.py` | 3.1 | +2 (set_heartbeat_bridge Import + Aufruf) |

## NICHT geaenderte Dateien

| Datei | Begruendung |
|-------|-------------|
| `src/services/mqtt_command_bridge.py` | Phase 2, fertig |
| `src/services/zone_service.py` | Phase 1, fertig (GPIO-Filter dort bleibt redundant aber schadet nicht) |
| `src/utils/zone_subzone_resolver.py` | Consumer-Zugriff identisch (NamedTuple hat gleiche Attribute) |
| `src/mqtt/handlers/sensor_handler.py` | Nutzt bereits DeviceScopeService — kein Handlungsbedarf |
| Firmware (El Trabajante) | Keine Firmware-Aenderungen noetig |
