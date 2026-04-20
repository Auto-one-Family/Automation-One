# Server Dev Report: AUT-63 Broadcast-Emergency Contract Fix

## Modus: B (Implementierung)

## Auftrag

Linear Issue AUT-63: Broadcast-Emergency Contract zwischen Server und Firmware angleichen.
Firmware akzeptiert nur lowercase `emergency_stop` / `stop_all`, Server sendete uppercase `EMERGENCY_STOP`.
Resultat: Firmware-Rejection mit Error 3016 (EMERGENCY_CONTRACT_MISMATCH / UNKNOWN_COMMAND_VALUE).

## Codebase-Analyse

| Datei | Befund |
|-------|--------|
| `El Servador/.../api/v1/actuators.py` Z.1027 | `"command": "EMERGENCY_STOP"` (uppercase) |
| `El Trabajante/.../emergency_broadcast_contract.h` Z.44-45 | `isSupportedBroadcastEmergencyCommand()` akzeptiert nur `"stop_all"` und `"emergency_stop"` (lowercase) |
| `El Trabajante/.../06-mqtt-message-routing-flow.md` | Broadcast-Topic `kaiser/broadcast/emergency` bestätigt, Handler ruft `safetyController.emergencyStopAll()` |

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Keine neue Datei, nur bestehende geändert ✅ |
| 2 | Namenskonvention | `broadcast_data` dict, snake_case ✅ |
| 3 | Rueckwaertskompatibilitaet | Firmware erwartet lowercase — Änderung stellt Kompatibilität _her_ ✅ |
| 4 | Wiederverwendbarkeit | Nutzt bestehenden `publisher.client.publish()` Pfad ✅ |
| 5 | Speicher & Ressourcen | Keine Änderung an Async/Session ✅ |
| 6 | Fehlertoleranz | Payload-Validierung vor Publish hinzugefügt, `reason` Fallback auf `"emergency"` ✅ |
| 7 | Seiteneffekte | Kein shared State geändert, kein Safety-Service betroffen ✅ |
| 8 | Industrielles Niveau | Kein Stub, vollständiger Test ✅ |

## Cross-Layer Impact

| Bereich | Impact |
|---------|--------|
| Firmware (El Trabajante) | Kein Firmware-Change nötig — Firmware war korrekt, Server war falsch |
| Frontend (El Frontend) | Nicht betroffen — Broadcast geht nur an ESPs, nicht ans Frontend |
| WebSocket | Nicht geändert — WS-Broadcast behält `alert_type: "emergency_stop"` (lowercase, war schon korrekt) |

## Ergebnis: Geänderte Dateien

### 1. `El Servador/god_kaiser_server/src/api/v1/actuators.py`

**Was:** Broadcast-Payload `command`-Feld von `"EMERGENCY_STOP"` auf `"emergency_stop"` geändert.
**Warum:** Firmware-Contract `isSupportedBroadcastEmergencyCommand()` akzeptiert nur lowercase.

**Hardening:**
- `reason` Fallback auf `"emergency"` wenn `request.reason` None/leer (verhindert leeren Payload-Wert)
- Explizite Validierung `broadcast_data.get("command")` vor `json.dumps` (defensive Guard gegen zukünftige Refactoring-Fehler)

### 2. `El Servador/god_kaiser_server/tests/integration/test_api_actuators.py`

**Was:** Neuer Test `test_emergency_broadcast_payload_matches_firmware_contract` in `TestEmergencyStop`.
**Warum:** Contract-Test sichert ab, dass der Broadcast-Command-Wert im Firmware-akzeptierten Set `{"emergency_stop", "stop_all"}` liegt.
**Prüft zusätzlich:** `reason`, `timestamp`, `incident_correlation_id` sind nicht leer.

## Verifikation

```
$ python -m pytest tests/integration/test_api_actuators.py::TestEmergencyStop -v
4 passed in 2.84s

$ python -m pytest tests/integration/test_api_actuators.py -v
20 passed in 14.37s
```

## Verbleibende Risiken

| Risiko | Schwere | Empfehlung |
|--------|---------|------------|
| `clear_emergency` Payload (Z.1128) sendet schon lowercase `"clear_emergency"` — kein Fix nötig | — | Kein Handlungsbedarf |
| Per-Actuator OFF-Commands (Z.933) senden `"OFF"` uppercase | niedrig | Separates Issue — der Actuator-Command-Pfad nutzt `publish_actuator_command()`, nicht den Broadcast-Pfad. Firmware-ActuatorHandler akzeptiert case-insensitive. |
| Kein E2E-Test mit echtem Broker | mittel | Wokwi-Scenario `05-emergency` existiert, sollte nach Merge verifiziert werden |

## Empfehlung

Kein weiterer Agent-Einsatz nötig. Firmware-Seite war bereits korrekt. Issue AUT-63 ist serverseitig vollständig umgesetzt.
