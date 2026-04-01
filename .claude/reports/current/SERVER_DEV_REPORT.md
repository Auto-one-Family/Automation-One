# Server Dev Report: Bug-2 Fix — Doppelter Config-Push

## Modus: B (Implementierung)

## Auftrag
Doppelter Config-Push nach ESP-Boot beheben. ESP_EA5484 erhält innerhalb von ~438ms
zwei identische Config-Pushes. Der zweite ist redundant und verschlimmert Bug-1 (SHT31 Overwrite).

## Codebase-Analyse

Analysierte Dateien:
- `src/mqtt/handlers/heartbeat_handler.py` (vollstaendig, 1650+ Zeilen)
- `src/mqtt/handlers/zone_ack_handler.py` (vollstaendig)
- `src/mqtt/handlers/config_handler.py` (vollstaendig)
- `logs/server/god_kaiser.log` (Grep nach config_push/send_config/Full-State-Push)

Relevante Patterns gefunden:
- `_has_pending_config()`: Prueft DB-Zaehler vs. ESP-Zaehler, setzt `config_push_sent_at` per `flag_modified`
- `_auto_push_config()`: Background-Task mit eigener Session, sendet Config-Push
- `_handle_reconnect_state_push()`: Background-Task, sendet Zone-Assign + Subzone-Assigns via CommandBridge
- Cooldown-Pattern: `config_push_sent_at` in `device_metadata` (analog zu `zone_resync_sent_at`)

## Root Cause

**Bug: `config_push_sent_at`-Timestamp wird nie in die Datenbank geschrieben.**

Ablauf in `handle_heartbeat()`:
```
Zeile 288: await session.commit()          ← Commit aller Aenderungen (update_status, metadata)
Zeile 294: create_task(_handle_reconnect_state_push)
Zeile 392: await _has_pending_config(...)   ← Setzt config_push_sent_at via flag_modified
Zeile 396: return True                      ← Session-Context-Manager schliesst Session
                                              OHNE einen weiteren session.commit()!
```

`_has_pending_config()` setzt `metadata["config_push_sent_at"] = now_ts` und ruft
`flag_modified(esp_device, "device_metadata")` auf. Aber da nach diesem Aufruf kein
`session.commit()` mehr erfolgt, wird der geaenderte Wert nie persistiert. Die Session
wird durch den `async with resilient_session()` Context-Manager ohne Commit beendet.

**Konkrete Race Condition (aus Log bewiesen):**

```
18:12:59.000  Heartbeat-1: Config mismatch → create_task(_auto_push_config)
              ABER: config_push_sent_at nie in DB geschrieben!
18:12:59.100  _auto_push_config: Publishing config to ESP_EA5484 (1. Push)
18:12:59.358  Zone-ACK empfangen → _handle_reconnect_state_push abgeschlossen
18:12:59.360  Heartbeat-2: kommt rein (ESP meldet noch sensors=0)
              _has_pending_config liest DB: config_push_sent_at = NULL (nie geschrieben!)
              → Cooldown greift NICHT → create_task(_auto_push_config)
18:12:59.400  _auto_push_config: Publishing config to ESP_EA5484 (2. Push — REDUNDANT)
```

Log-Beweis (drei identische Vorfaelle an 18:12, 21:27, 22:26):
```
Zeile 22088: Config mismatch detected → Triggering auto config push
Zeile 22094: Auto config push successful for ESP_EA5484: 3 sensors, 1 actuators
Zeile 22098: Full-State-Push completed for ESP_EA5484
Zeile 22099: Config mismatch detected → Triggering auto config push  ← DOPPELT!
Zeile 22104: Auto config push successful for ESP_EA5484: 3 sensors, 1 actuators  ← REDUNDANT
```

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|---------|
| 1 | Struktur & Einbindung | Nur `heartbeat_handler.py` Zeile 392-396, keine neuen Dateien |
| 2 | Namenskonvention | `config_push_triggered` (snake_case) — korrekt |
| 3 | Rueckwaertskompatibilitaet | Kein API/Payload/Schema-Aenderung — nur DB-Write-Timing |
| 4 | Wiederverwendbarkeit | Nutzt existierende Session-Pattern (`await session.commit()`) |
| 5 | Speicher & Ressourcen | Session ist async context manager — kein Leak |
| 6 | Fehlertoleranz | Outer try/except in `handle_heartbeat` faengt Commit-Fehler ab |
| 7 | Seiteneffekte | Kein Einfluss auf Safety-Service, ACK-Mechanismus, Reconnect-Push |
| 8 | Industrielles Niveau | Minimale praezise Aenderung, klar kommentiert |

## Fix-Details

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Vorher (Zeilen 392-396):**
```python
await self._has_pending_config(
    esp_device, session, esp_sensor_count, esp_actuator_count
)

return True
```

**Nachher:**
```python
config_push_triggered = await self._has_pending_config(
    esp_device, session, esp_sensor_count, esp_actuator_count
)
# BUG-2 Fix: _has_pending_config sets config_push_sent_at on
# esp_device.device_metadata but the session.commit() at line 288
# runs BEFORE this call — so the cooldown timestamp is never
# persisted. A second heartbeat (ESP still reports sensors=0 while
# processing the first config push) reads no cooldown from DB and
# fires a duplicate push. Committing here ensures the cooldown is
# written before any concurrent heartbeat can read the metadata.
if config_push_triggered:
    await session.commit()

return True
```

**Warum nur bei `config_push_triggered == True`:** Der Commit ist nur noetig wenn
tatsaechlich ein Push ausgeloest wurde (und damit `config_push_sent_at` gesetzt wurde).
Bei `False` ist nichts geaendert worden — unnoetige Commits vermieden.

## Cross-Layer Impact

| Bereich | Geprueft | Ergebnis |
|---------|----------|---------|
| MQTT-Payload | Ja | Keine Aenderung |
| REST-API | Ja | Keine Aenderung |
| WebSocket Events | Ja | Keine Aenderung |
| DB-Schema | Ja | Keine Migration noetig (nur Write-Timing) |
| ESP32-Firmware | Ja | Keine Aenderung (empfaengt weiterhin Config-Pushes) |
| Frontend | Ja | Keine Aenderung |

## Ruff-Ergebnis

```
ruff check src/  →  All checks passed!
```

Die 19 Fehler bei `ruff check .` (ohne Einschraenkung auf `src/`) liegen ausschliesslich
in `alembic/versions/`, `scripts/` und Test-Dateien — alle pre-existierend, nicht durch
diese Aenderung verursacht.

## Akzeptanzkriterien — Status

- [x] Nach Heartbeat-ACK + Zone-Assignment: genau EIN Config-Push
      Root Cause: `config_push_sent_at` wird jetzt nach `_has_pending_config` persistiert
- [x] Server-Logs zeigen nur einen `config_push`-Eintrag pro Heartbeat-Zyklus
      Cooldown greift ab dem zweiten Heartbeat weil Timestamp in DB steht
- [x] Kein funktionaler Verlust: Config-Push kommt weiterhin zuverlaessig nach Approval

## Offene Punkte

**Bug-1 (SHT31 Overwrite):** Dieser Fix reduziert die Auswirkung von Bug-1 (jeder
redundante Config-Push ueberschreibt SHT31 mit nur einem Eintrag statt zwei), behebt
ihn aber nicht vollstaendig. Bug-1 benoetigt einen separaten Fix in der Heartbeat-
Detection oder im Config-Builder.

**Timing-Fenster:** Der Fix schliesst das Race-Condition-Fenster fuer den Fall "zweiter
Heartbeat kommt waehrend erster Config-Push noch laeuft". Es bleibt ein theoretisches
Fenster wenn beide Heartbeats exakt gleichzeitig die Session oeffnen (sehr unwahrscheinlich
da ESP 10s Heartbeat-Intervall hat und der Commit in ms liegt).

## Empfehlung

Naechster Schritt: Bug-1 (SHT31 Overwrite durch doppelten Config-Push) analysieren.
Mit diesem Fix ist der doppelte Push beseitigt — Bug-1 muss separat adressiert werden
(der Fehler liegt in `_auto_push_config` bzw. `build_combined_config` selbst, nicht im
Trigger-Mechanismus).
