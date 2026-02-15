# Server Dev Report: Bug 3 ZONE_MISMATCH Fix - Auto Zone Reassignment

## Modus: B (Implementierung)

## Auftrag
Fix Bug 3 (ZONE_MISMATCH) from Wokwi Session 3: After ESP32 reboot (especially in Wokwi without persistent NVS), the ESP loses its zone config. Server should auto-reassign the zone via MQTT when detecting the mismatch through heartbeat.

## Codebase-Analyse

### Analysierte Dateien

| Datei | Zweck |
|-------|-------|
| `src/mqtt/handlers/heartbeat_handler.py` | Heartbeat-Verarbeitung, Zone-Mismatch-Detection |
| `src/services/zone_service.py` | Zone-Assignment Business Logic |
| `src/mqtt/handlers/zone_ack_handler.py` | Zone-ACK-Verarbeitung |
| `src/mqtt/topics.py` | TopicBuilder (MQTT Topic Construction) |
| `src/db/models/esp.py` | ESPDevice Model (zone_id, master_zone_id, zone_name) |
| `src/db/repositories/esp_repo.py` | ESP Repository |
| `src/core/constants.py` | MQTT Topic Constants |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | ESP32 Heartbeat Payload |
| `scripts/seed_wokwi_esp.py` | Wokwi Seed Script |
| `tests/integration/test_heartbeat_handler.py` | Existing Tests |
| `.claude/reference/api/MQTT_TOPICS.md` | MQTT Topics Reference |
| `.claude/reports/current/WOKWI_SESSION3_SENSOR_TEST.md` | Session 3 Evidence |

### Patterns Gefunden

1. **Zone-Resync-Code existiert bereits** (Zeilen 636-704 in heartbeat_handler.py)
2. ESP32 sendet `zone_id: ""` und `zone_assigned: false` nach NVS-Verlust (mqtt_client.cpp:695-697)
3. `TopicBuilder.build_zone_assign_topic()` wird korrekt fuer Resync verwendet
4. Rate-Limiting via `zone_resync_sent_at` Metadata-Key
5. Zone-Assignment-Payload-Format: `{zone_id, master_zone_id, zone_name, kaiser_id, timestamp}`

### Root Cause Analysis

Der bestehende Resync-Code war im Grunde korrekt implementiert, hatte aber drei Schwaechen:

1. **Nur zone_id String-Vergleich**: Der Code prueft nur `heartbeat_zone_id != db_zone_id`. Er ignoriert den `zone_assigned: false` Boolean-Flag, der ein staerkeres Signal ist. Wenn z.B. ein ESP einen stale `zone_id` String sendet aber `zone_assigned: false`, wurde der Mismatch nicht erkannt.

2. **Cooldown zu lang (300s)**: Nach einem Reboot musste der ESP 5 Minuten warten, bevor ein erneuter Resync moeglich war. In einem IoT-Szenario ist das zu lang -- zone-basierte Logik (Bewaesserung, Ventilation etc.) funktioniert waehrend dieser Zeit nicht.

3. **Logging unzureichend**: Bei fehlgeschlagenem MQTT-Publish wurde nur ein `logger.warning()` geschrieben, ohne `exc_info=True` fuer Stacktrace-Debugging. Die Mismatch-Gruende wurden nicht in Metadata gespeichert.

## Qualitaetspruefung: 8-Dimensionen

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | OK - Aenderung in bestehender Methode `_update_esp_metadata()`, keine neuen Dateien |
| 2 | Namenskonvention | OK - snake_case, bestehende Variablennamen beibehalten |
| 3 | Rueckwaertskompatibilitaet | OK - Gleiche MQTT-Payload-Struktur, keine API/DB-Aenderung |
| 4 | Wiederverwendbarkeit | OK - Nutzt existierende `TopicBuilder.build_zone_assign_topic()` und `MQTTClient` |
| 5 | Speicher & Ressourcen | OK - Keine neuen Allokationen, nur zusaetzlicher Boolean-Check |
| 6 | Fehlertoleranz | VERBESSERT - `exc_info=True` bei Fehlern, Rate-Limiting beibehalten |
| 7 | Seiteneffekte | OK - Identische MQTT-Nachricht wie vorher, nur schnellerer Cooldown |
| 8 | Industrielles Niveau | OK - Robuste Detection via zwei Signale (zone_id + zone_assigned), Cooldown, Logging |

## Cross-Layer Impact

| Bereich | Impact |
|---------|--------|
| ESP32 | KEINER - Gleiche MQTT zone/assign Payload |
| Frontend | KEINER - Kein WebSocket-Event-Aenderung |
| DB | KEINER - Kein Schema-Aenderung. Neues Metadata-Key `zone_resync_reason` (informativ) |
| MQTT | KEINER - Gleicher Topic `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign`, gleicher QoS 1 |

## Ergebnis: Implementierung

### Geaenderte Dateien

1. **`El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`** (Zeilen ~636-720)
   - Zone-Mismatch-Detection erweitert: Prueft jetzt ZUSAETZLICH `zone_assigned: false` Flag
   - Cooldown von 300s auf 60s reduziert
   - `exc_info=True` bei MQTT-Publish-Fehlern
   - Neues Metadata-Key `zone_resync_reason` fuer Debugging
   - Klarere Log-Messages: `"Auto-reassigning zone '{zone}' to ESP {esp_id} (zone lost after reboot)"`
   - `mismatch_reason` Variable fuer bessere Nachvollziehbarkeit

2. **`El Servador/god_kaiser_server/tests/integration/test_heartbeat_handler.py`**
   - Neue Testklasse `TestZoneMismatchDetection` mit 5 Tests:
     - `test_zone_mismatch_detected_via_zone_id` - Mismatch durch leeren zone_id String
     - `test_zone_mismatch_detected_via_zone_assigned_flag` - Mismatch durch zone_assigned=false
     - `test_no_mismatch_when_both_unassigned` - Kein False-Positive bei fehlender Zone
     - `test_no_mismatch_when_zones_match` - Kein False-Positive bei uebereinstimmenden Zones
     - `test_resync_cooldown_logic` - Cooldown-Timer (60s) funktioniert korrekt

### Aenderungs-Zusammenfassung

```
VORHER:
- Nur zone_id String-Vergleich
- 300s Cooldown
- logger.warning() bei Fehlern (kein Stacktrace)
- Kein Tracking des Mismatch-Grundes

NACHHER:
- zone_id String-Vergleich + zone_assigned Boolean-Check
- 60s Cooldown (schnellere Recovery nach Reboot)
- logger.error() mit exc_info=True bei Fehlern
- zone_resync_reason in Metadata gespeichert
```

### Detection Logic

```python
# Two detection signals:
esp_lost_zone = (
    not heartbeat_zone_assigned  # ESP reports zone_assigned=false
    and db_has_zone              # but server has zone in DB
)

# Trigger resync if EITHER signal fires:
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
    ...
```

## Verifikation

```
$ pytest tests/integration/test_heartbeat_handler.py -v
24 passed in 9.17s
```

Alle 24 Tests bestanden (19 bestehende + 5 neue).

## Empfehlung

- **Naechster Test:** Wokwi Full Boot Session mit Zone-Assignment, dann ESP-Reboot. Pruefen ob Zone automatisch reassigned wird.
- **Monitoring:** Im Server-Log nach `"Auto-reassigning zone"` suchen, um den Fix in der Praxis zu verifizieren.
- **Kein Cross-Layer-Impact:** Weder Frontend noch ESP32-Firmware benoetigen Aenderungen.
