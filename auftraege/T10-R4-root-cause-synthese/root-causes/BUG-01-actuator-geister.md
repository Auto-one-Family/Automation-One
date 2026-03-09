# Root-Cause: BUG-01 — Actuator-Geister

## Symptom
Actuator GPIO 27 wird nach Docker-Reload automatisch re-created. Command-Handler returned False. sensor_count Mismatch (ESP: 4, Server: 2).

## Reproduktion
1. Docker-Stack neustarten (oder ESP_472204 Heartbeat abwarten)
2. Heartbeat meldet `actuator_count > 0` (GPIO 27 hardcoded in Firmware)
3. Server sieht Mismatch mit DB → pusht Config → Config-Push scheitert wegen Session-Race
→ Command-Handler returned False, Actuator als "Geist" in DB

## Root Cause
- **Datei:** `heartbeat_handler.py:1194-1207`
- **Funktion:** `_has_pending_config` + `_auto_push_config`
- **Problem:** Config-Mismatch-Detection erkennt `esp_actuator_count == 0 and db_actuator_count > 0` → `asyncio.create_task(self._auto_push_config(esp_device.device_id))`. Dieser Task teilt die Heartbeat-Session. Nach `session.commit()` im Heartbeat-Handler wird die Session geschlossen, der Task versucht danach noch DB-Operationen → `InvalidRequestError`. Zusaetzlich: sensor_count-Vergleich toleriert nicht den Faktor 2 (raw+processed pro SHT31).

## Betroffene Schicht
- [x] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [ ] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Nur ESP_472204 (einziger ESP mit Actuator)
- Welche Daten: Actuator-Config wird zyklisch re-created/abgelehnt
- Welche Funktionen: Actuator-Config-Push scheitert, Command-Handler Failures

## Fix-Vorschlag
1. `_auto_push_config` muss eigene `resilient_session()` verwenden statt die Heartbeat-Session zu teilen.
2. sensor_count-Vergleich toleranter machen: Firmware zaehlt raw+processed, Server nur configs. Faktor 2 erlauben.

## Fix-Komplexitaet
- [ ] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [x] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: BUG-04 (teilweise — Actuator in DB aber nicht im UI)

## Verifikation nach Fix
```query
{compose_service="el-servador"} |= "Handler returned False" |= "actuator"
→ SOLL: 0 Treffer in 30 Minuten
```
