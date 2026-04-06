# Auftrag F06: HardwareView, Konfig-Panels, DnD-Fluesse

## Ziel
Analysiere den Hardwarebereich vollstaendig: 3-Level-Navigation, Konfigurationspfade, Rueckmeldungen und DnD-Seiteneffekte.

## IST-Wissen aus dem Frontend
- `HardwareView.vue` deckt `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` ab.
- SensorConfigPanel/ActuatorConfigPanel sind an Hardware-Kontext gebunden.
- Konfig-Workflows laufen ueber API + Realtime-Rueckmeldung.

## Scope
- `El Frontend/src/views/HardwareView.vue`
- `El Frontend/src/components/esp/**`
- `El Frontend/src/components/dashboard/ZonePlate.vue`
- DnD-nahe Komponenten in Hardware-Kontext

## Analyseaufgaben
1. Kartiere Triggerpfade fuer Zonen, ESP-Detail, Panel-Oeffnung, Sheet-Flows.
2. Belege exakt, wie Sensor-/Aktor-Konfigurationen initiiert, gespeichert und rueckgemeldet werden.
3. Dokumentiere Fehler-/Timeout-/Teil-Erfolg-Pfade bis zur UI.
4. Untersuche DnD-Interaktionen und deren Daten-/Persistenzeffekte.

## Pflichtnachweise
- Klick/Drag -> Panel/Form -> API/WS -> Store -> sichtbare Wirkung.
- Vergleich Happy Path vs. Stoerfall mit Codeankern.

## Akzeptanzkriterien
- Kein Konfig-Trigger bleibt ohne End-to-end-Nachweis.
- DnD-Risiken (Desync, Ghost State, Reihenfolgefehler) sind bewertet.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F06-hardware-konfiguration-dnd-2026-04-05.md`
