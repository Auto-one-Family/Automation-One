# Root-Cause: BUG-04 — Config-Panel zeigt keine Actuators

## Symptom
"Geraete nach Subzone" im ESPSettingsSheet zeigt nur Sensoren. Actuator GPIO 27 fehlt komplett in der Gruppierung.

## Reproduktion
1. L2 → ESP_472204 → ESPSettingsSheet oeffnen
2. Sektion "Geraete nach Subzone" pruefen
3. Nur Sensoren sichtbar, Actuator fehlt
→ Benutzer sieht nicht welche Aktoren zu welcher Subzone gehoeren

## Root Cause
- **Datei:** `El Frontend/src/types/index.ts:295`
- **Funktion:** `MockActuator` Interface
- **Problem:** Zweiteiliger Bug:
  1. `MockActuator` Interface hat kein `subzone_id`-Feld
  2. `api/esp.ts:269-282` Mapper `mapActuatorConfigToMockActuator()` ueberspringt `subzone_id`
  3. ESPSettingsSheet's `devicesBySubzone` Computed liest `(actuator as any).subzone_id` → immer `undefined` → Aktoren fallen aus der Gruppierung

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: ALLE ESPs mit Aktoren
- Welche Daten: Actuator-Configs nicht in "Geraete nach Subzone" sichtbar
- Welche Funktionen: ESPSettingsSheet Subzone-Gruppierung unvollstaendig

## Fix-Vorschlag
1. `types/index.ts`: `subzone_id?: string | null` zu `MockActuator` Interface hinzufuegen
2. `api/esp.ts`: `subzone_id: config.subzone_id` im Mapper ergaenzen
3. Voraussetzung: Server-API `ActuatorConfigResponse` muss `subzone_id` bereits liefern (pruefen)

## Fix-Komplexitaet
- [ ] Einzeiler
- [x] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: BUG-01 (teilweise — Actuator-Geister erzeugen Konfusion)
- Blockiert: — (standalone nach Fix)

## Verifikation nach Fix
```
L2 → ESP mit Actuator → ESPSettingsSheet → "Geraete nach Subzone"
→ SOLL: Actuator in korrekter Subzone-Gruppe sichtbar
```
