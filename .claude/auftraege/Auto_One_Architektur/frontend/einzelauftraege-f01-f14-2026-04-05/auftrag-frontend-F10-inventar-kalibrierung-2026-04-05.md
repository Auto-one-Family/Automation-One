# Auftrag F10: Komponenten-Inventar, Wissensbasis, Kalibrierung

## Ziel
Verifiziere die Rolle von SensorsView/Inventar/Kalibrierung und ihre Grenzen zur Hardware-Konfiguration.

## IST-Wissen aus dem Frontend
- `SensorsView.vue` ist Komponenten-/Inventarbereich.
- SensorConfigPanel gehoert nicht in SensorsView.
- Kalibrierung ist eigener Admin-relevanter Pfad.

## Scope
- `El Frontend/src/views/SensorsView.vue`
- `El Frontend/src/components/inventory/**`
- `El Frontend/src/views/CalibrationView.vue`
- `El Frontend/src/components/calibration/**`

## Analyseaufgaben
1. Beweise die Abgrenzung SensorsView vs. HardwareView (keine Konfig-Panels in SensorsView).
2. Dokumentiere Inventar-Fluesse (Suche, Filter, Detail, Kontextaenderung).
3. Analysiere Kalibrierungsablauf inkl. Rechte und Rueckmeldelogik.
4. Pruefe Navigation/Datenaustausch zwischen Inventar, Monitor und Hardware.

## Pflichtnachweise
- Inventaraktion -> API/Store -> sichtbares Ergebnis.
- Kalibrierungsaktion -> Serverantwort -> Komponentenstatus in UI.

## Akzeptanzkriterien
- Rollenabgrenzung ist ohne Restzweifel belegt.
- Kalibrierungsrisiken (Berechtigung, Fehlerrueckmeldung, Teilzustand) sind priorisiert.

## Report
`.claude/reports/current/frontend-analyse/report-frontend-F10-inventar-kalibrierung-2026-04-05.md`
