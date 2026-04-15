# FEHLER-REGISTER

Run-ID: `lifecycle-background-state-crosslayer-debug-2026-04-14`  
Modus: `artefact_improvement`  
Status: Evidence abgeschlossen, Umsetzung in PKGs zerlegt

## P0

### P0-01: Delete-Intent vs Tombstone-Restore Konflikt
- **Schicht:** Server/DB
- **Befund:** Nach Soft-Delete kann Heartbeat-Pfad Tombstone wiederherstellen.
- **Evidence:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, `El Servador/god_kaiser_server/src/api/v1/esp.py`
- **Risiko:** Gerät erscheint trotz Löschoperation wieder aktiv.
- **Empfohlene Maßnahme:** Policy-Gate für Restore nach explizitem Delete (konfigurierbar), plus strukturierte Skip-/Restore-Logs.

### P0-02: Hintergrundpfade ohne delete-scoped Stop
- **Schicht:** Server
- **Befund:** Engine-/Subscriber-Lifecycle primär global über Shutdown.
- **Evidence:** `El Servador/god_kaiser_server/src/services/logic_engine.py`, `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
- **Risiko:** Aktivität läuft nach fachlicher Entfernung weiter.
- **Empfohlene Maßnahme:** Guard/Skip bei tombstoned Kontexten an Eintrittspunkten, keine globale Architekturänderung.

### P0-03: Uneinheitliche Runtime-Filter auf aktive Geräte
- **Schicht:** DB/Repository
- **Befund:** Nicht alle Query-Pfade filtern auf `deleted_at IS NULL`.
- **Evidence:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
- **Risiko:** „Aktiv“-Sicht variiert je API/Use-Case.
- **Empfohlene Maßnahme:** konsolidierte Filterkonvention für Runtime-Reads dokumentieren und umsetzen.

## P1

### P1-01: Frontend L2-Restzustand nach Delete
- **Schicht:** Frontend
- **Befund:** Route kann L2 halten, obwohl `selectedDevice` bereits `null` ist.
- **Evidence:** `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/stores/esp.ts`
- **Risiko:** Leerzustand/Zombie-Detailansicht.
- **Empfohlene Maßnahme:** Route-Guard zurück auf L1, wenn Gerät fehlt.

### P1-02: Event-Definition Delete in UI-Kette uneinheitlich
- **Schicht:** Frontend
- **Befund:** `ZonePlate` kennt `device-delete`; `DeviceMiniCard` deklariert nur `click`.
- **Evidence:** `El Frontend/src/components/dashboard/ZonePlate.vue`, `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
- **Risiko:** schwer nachvollziehbare Delete-Trigger in bestimmten UI-Pfaden.
- **Empfohlene Maßnahme:** Emits konsolidieren und testen.

### P1-03: Firmware-Outcome für Revocation nicht granular genug
- **Schicht:** Firmware
- **Befund:** Rejection-Pfad klar, aber kein eigener Diagnosecode für „approval revoked/upstream deleted“ im gelebten Pfad.
- **Evidence:** `El Trabajante/src/main.cpp`, `El Trabajante/src/services/communication/mqtt_client.cpp`
- **Risiko:** eingeschränkte Diagnose im Feldbetrieb.
- **Empfohlene Maßnahme:** zusätzlicher Outcome-Code im bestehenden Admission-/Intent-Pattern.

