# Server Dev Report: Wokwi Live Session 2 - Bug Fixes (BUG 3, 4, 5)

## Modus: B (Implementierung)
## Auftrag: 3 Server-Bugs aus Wokwi Live Interaction Session 2 fixen

## Codebase-Analyse

Analysierte Dateien:

| Datei | Zweck | Zeilen |
|-------|-------|--------|
| `src/mqtt/handlers/heartbeat_handler.py` | Heartbeat-Handler, Zone-Mismatch-Detection, LWT-Clearing | 1165 |
| `src/services/zone_service.py` | Zone assign/remove, pending_zone_assignment Tracking | 447 |
| `src/mqtt/handlers/zone_ack_handler.py` | Zone ACK Processing, pending_zone_assignment Cleanup | 310 |
| `src/db/repositories/esp_repo.py` | Referenz: flag_modified Pattern (7 Instanzen) | 777 |
| `src/mqtt/topics.py` | TopicBuilder: build_zone_assign_topic, build_lwt_topic | 1044 |
| `src/mqtt/client.py` | MQTTClient.publish() Pattern, Circuit Breaker | 646 |

Patterns extrahiert:
- **flag_modified:** `from sqlalchemy.orm.attributes import flag_modified` + `flag_modified(device, "device_metadata")` -- 7 korrekte Instanzen in esp_repo.py
- **MQTT Publish:** Lazy import `from ..client import MQTTClient`, `MQTTClient.get_instance()`, `mqtt_client.publish(topic, payload, qos, retain)`
- **TopicBuilder:** `TopicBuilder.build_zone_assign_topic(esp_id)` existiert bereits
- **Rate-Limiting:** Cooldown via metadata timestamp (z.B. `zone_resync_sent_at`)

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Alle Aenderungen in bestehenden Dateien, keine neuen Dateien, Imports am Dateianfang |
| 2 | Namenskonvention | snake_case beibehalten (zone_resync_sent_at, zone_resync_cooldown_seconds) |
| 3 | Rueckwaertskompatibilitaet | Keine API/Payload-Aenderungen. Nur internes Verhalten geaendert |
| 4 | Wiederverwendbarkeit | Nutzt existierende TopicBuilder, MQTTClient, flag_modified Patterns |
| 5 | Speicher & Ressourcen | Kein neuer State, nur Metadata-Feld (zone_resync_sent_at) -- wird in bestehendem JSON gespeichert |
| 6 | Fehlertoleranz | try/except um MQTT publish (BUG 3), flag_modified nur wenn del tatsaechlich ausgefuehrt (BUG 4) |
| 7 | Seiteneffekte | BUG 3: Neues MQTT publish bei Mismatch (gewuenscht), rate-limited auf 5min. BUG 4: Nur Persistenz-Fix |
| 8 | Industrielles Niveau | Vollstaendig implementiert, keine Stubs/TODOs |

## Cross-Layer Impact

| Aenderung | Betroffene Layer | Geprueft |
|-----------|-----------------|----------|
| BUG 3: Zone resync bei Mismatch | Server -> MQTT -> ESP32 | ESP erhaelt zone/assign, identisches Payload wie manuelles assign |
| BUG 4: flag_modified | Nur Server (DB Persistenz) | Kein Frontend/ESP32 Impact |
| BUG 5: LWT clearing | Bereits implementiert | Keine Aenderung noetig |

## Ergebnis

### BUG 3: ZONE_MISMATCH auto-resolve (LOW)

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Fix:** Im Zone-Mismatch-Block (Zeile ~654) wo ESP keine Zone hat aber DB schon:
- Automatisch `zone/assign` via MQTT publizieren mit DB-Daten
- Rate-Limiting: `zone_resync_sent_at` Timestamp in device_metadata, Cooldown 300s (5 min)
- Payload identisch zum manuellen assign: zone_id, master_zone_id, zone_name, kaiser_id, timestamp
- Nutzt `TopicBuilder.build_zone_assign_topic()` + `MQTTClient.get_instance().publish()`
- try/except um Publish -- Failure ist non-fatal (wird beim naechsten Heartbeat nach Cooldown erneut versucht)

### BUG 4: SQLAlchemy JSON mutation tracking (HIGH)

**Root Cause:** SQLAlchemy erkennt in-place Mutationen an JSON-Spalten nicht. `flag_modified()` muss explizit aufgerufen werden.

**Dateien und Stellen:**

1. `El Servador/god_kaiser_server/src/services/zone_service.py`
   - Import: `from sqlalchemy.orm.attributes import flag_modified` (Zeile 34)
   - Stelle 1 (assign_zone): nach SET `pending_zone_assignment` -- `flag_modified(device, "device_metadata")`
   - Stelle 2 (remove_zone): nach DELETE `pending_zone_assignment` -- `flag_modified(device, "device_metadata")`
   - Stelle 3 (handle_zone_ack): nach DELETE `pending_zone_assignment` -- `flag_modified(device, "device_metadata")`

2. `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`
   - Import: `from sqlalchemy.orm.attributes import flag_modified` (Zeile 34)
   - Stelle 1 (zone_assigned): nach DELETE `pending_zone_assignment` -- `flag_modified(device, "device_metadata")`
   - Stelle 2 (zone_removed): nach DELETE `pending_zone_assignment` -- `flag_modified(device, "device_metadata")`

**Gesamt:** 5 neue `flag_modified()` Aufrufe, konsistent mit den 7 existierenden in `esp_repo.py`.

### BUG 5: Retained LWT not cleared (MEDIUM) -- BEREITS GEFIXT

**Status:** Bereits implementiert in heartbeat_handler.py Zeilen 212-226 ("Step 5b").
Der Code published bereits ein leeres retained LWT bei jedem Heartbeat eines online Devices.
Keine Aenderung noetig.

## Verifikation

```
766 passed, 3 skipped, 14 warnings in 54.77s
```

Alle Unit-Tests bestanden. Keine neuen Failures.

## Empfehlung

- BUG 3 und BUG 4 sind gefixt und testbar bei der naechsten Wokwi Live Session
- BUG 4 war HIGH severity -- `pending_zone_assignment` wurde nie in die DB persistiert, was Zone-ACK-Tracking komplett broken machte
- BUG 3 kann in der naechsten Session verifiziert werden: ESP nach Reboot sollte automatisch Zone vom Server re-zugewiesen bekommen
- Keine weiteren Agents noetig fuer diese Fixes
