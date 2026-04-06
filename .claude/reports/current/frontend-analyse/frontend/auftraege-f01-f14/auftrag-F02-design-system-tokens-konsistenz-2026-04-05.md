# Auftrag F02: Design-System, Tokens, Stilkonsistenz

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F02  
> **Prioritaet:** P2

## Relevantes Wissen (kompakt und verbindlich)
- Tokens sind die semantische Quelle (`tokens.css`) fuer Status, Text, Surface, Glass und Interaktion.
- Drift entsteht durch Hex-Direktwerte, Fallback-Hex und parallele Farbquellen in JS/Tailwind.
- In Operator- und Safety-Flaechen ist Farbsemantik fachkritisch, nicht nur visuell.
- Safety-Farben muessen reserviert bleiben; "Game-Layer" darf Alarmsemantik nicht verwischen.

## IST-Befund
- Hohe Farbdrift in produktiven Bereichen, besonders `system-monitor`, `esp`, `views`.
- Doppelquellen-Risiko: `tokens.css`, Tailwind-Konfig und JS-Paletten laufen nicht immer synchron.
- Kritische Komponenten enthalten direkte Farben statt semantischer Tokenbindung.

## SOLL-Zustand
- Eine Farbwahrheit mit klarer Governance: semantische Tokens -> abgeleitete Runtime-Nutzung.
- Keine direkten Hex-Werte in kritischen Operator- und Safety-Komponenten.
- A11y/Fokus/Disabled-Verhalten ist fuer kritische Dialoge einheitlich nachgewiesen.

## Analyseauftrag
1. Drift-Inventar je Datei erstellen: `direkt hex`, `fallback hex`, `token-konform`.
2. Token-Migrationsmatrix fuer Hotspots priorisieren (P0/P1/P2).
3. Regelwerk definieren: wann Tailwind/JS Farbe direkt lesen darf und wann nicht.
4. A11y-Pruefmatrix fuer ConfirmDialog, EmergencyStop, EventList, MonitorCards ableiten.

## [Korrektur] Verifizierter Ausfuehrungsrahmen (IST gegen Codebase)
- **Primaerer Agent:** `frontend-debug` (Analysefokus, keine ungefragten Code-Aenderungen).
- **Verbindliche Analyse-Dateien:**
  - `El Frontend/src/styles/tokens.css` (Single Source of Truth fuer Semantik)
  - `El Frontend/tailwind.config.js` (zweite Farbquelle mit Drift-/Sync-Risiko)
  - `El Frontend/src/utils/cssTokens.ts` (JS-Tokenzugriff inkl. Fallback-Logik)
  - `El Frontend/src/utils/chartColors.ts` und `El Frontend/src/utils/zoneColors.ts` (parallele JS-Paletten)
  - `El Frontend/src/shared/design/patterns/ConfirmDialog.vue` (kritischer Pattern-Layer)
  - `El Frontend/src/components/safety/EmergencyStopButton.vue` (Safety-kritische Farbsemantik)
  - `El Frontend/src/components/system-monitor/UnifiedEventList.vue` (Event-Farbsemantik; ersetzt unpraezises `EventList`)
  - `El Frontend/src/views/MonitorView.vue` und `El Frontend/src/views/SystemMonitorView.vue` (Operator-Hotspots; ersetzt unpraezises `MonitorCards`)
- **Korrektur zur Auftragsformulierung:** In der Codebase existieren `UnifiedEventList` sowie Monitor-Hotspots in `MonitorView`/`SystemMonitorView`, aber keine Komponenten mit den exakten Namen `EventList` oder `MonitorCards`.
- **Ziel-Output (verbindlich):**
  - `.claude/reports/current/frontend-analyse/report-frontend-F02-design-tokens-konsistenz-2026-04-05.md`
  - Falls schon vorhanden: inhaltlich aktualisieren/erganzen, nicht neuen Dateinamen erfinden.

## [Korrektur] Arbeitsreihenfolge fuer den Agent
1. Drift-Baseline als Inventar erstellen (Datei + Trefferart + Evidenzstelle), getrennt nach:
   - `direkt hex`: `#[0-9a-fA-F]{3,8}`
   - `fallback hex`: `var(--..., #xxxxxx)`
   - `token-konform`: `var(--color-...)` ohne Hex-Fallback
2. Priorisierung P0/P1/P2 verbindlich auf diese Hotspots anwenden:
   - **P0:** `EmergencyStopButton.vue`
   - **P1:** `UnifiedEventList.vue`, `ConfirmDialog.vue`, `MonitorView.vue`, `SystemMonitorView.vue`
   - **P2:** `chartColors.ts`, `zoneColors.ts`, weitere Driftstellen ausserhalb Safety/Operator-Kernflaechen
3. Governance-Regelwerk als Entscheidungslogik dokumentieren:
   - CSS-Komponenten nutzen semantische Token aus `tokens.css`
   - Tailwind darf nur Alias-Farben nutzen, die auf dieselbe Semantik zeigen
   - JS-Paletten nur fuer Charts/Canvas mit dokumentiertem Mapping zu `--color-*`
4. A11y-Pruefmatrix auf echte Komponenten anwenden:
   - `ConfirmDialog.vue`
   - `EmergencyStopButton.vue`
   - `UnifiedEventList.vue`
   - `MonitorView.vue` + `SystemMonitorView.vue`
5. Vorher/Nachher-Migrationsbeispiele aus mindestens 5 kritischen Komponenten ausarbeiten (fuer jede: Ist-Muster, Soll-Token, Risiko, Migrationsaufwand).

## [Korrektur] Output-Vertrag (MUSS im Report enthalten sein)
- Tabelle `Datei -> Verstosstyp -> Soll-Token -> Risiko -> Aufwand` mit Prioritaet `P0/P1/P2`.
- Abschnitt `Token-Migrationsmatrix` mit konkretem Mapping `Hardcoded/Fallback -> Ziel-Token`.
- Abschnitt `Governance-Regelwerk` mit klaren Ja/Nein-Regeln fuer CSS/Tailwind/JS-Farbquellen.
- Abschnitt `A11y-Pruefmatrix` fuer Fokus/Kontrast/Disabled in den oben genannten Komponenten.
- Abschnitt `Evidenz` mit konkreten Datei- und Symbolreferenzen (keine pauschalen Aussagen ohne Codebeleg).

## Scope
- **In Scope:** Tokens, Tailwind-Farbabbildung, JS-Farbquellen, kritische UI-Hotspots.
- **Out of Scope:** Komplett-Restyling, neue Farbpalette.

## Nachweise
- Tabelle `Datei -> Verstosstyp -> Soll-Token -> Risiko -> Aufwand`.
- Vorher/Nachher-Beispiel fuer mindestens 5 kritische Komponenten.
- Explizite Drift-Statistik je Bereich (`components/system-monitor`, `components/esp`, `shared/design`, `views`, `utils`).

## Akzeptanzkriterien
- Kritische Komponenten sind ohne harte Hex-Werte tokenisiert.
- Doppelte Farbquellen sind dokumentiert und mit Migrationspfad versehen.
- A11y-Basis fuer Fokus/Kontrast/Disabled in kritischen Dialogen belegt.
- Alle Aussagen sind mit konkreten Dateipfaden aus dem Frontend belegt und reproduzierbar.

## Tests/Nachweise
- CSS/Visual: `cd "El Frontend" && npm run test:css:tokens && npm run test:css:visual`
- A11y: `cd "El Frontend" && npm run test:css:a11y`
- Static Drift-Check (da aktuell keine ESLint/Stylelint-Regeldatei vorhanden): `rg -n "#[0-9a-fA-F]{3,8}\b|var\(--[^)]*,\s*#[0-9a-fA-F]{3,8}\b" "El Frontend/src"`
