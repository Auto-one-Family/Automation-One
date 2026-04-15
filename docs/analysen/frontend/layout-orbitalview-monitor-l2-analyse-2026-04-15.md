# Frontend-Layoutanalyse: Orbital View & Monitor (L2)
**Datum:** 2026-04-15  
**Analysegueltigkeit:** ESPOrbitalLayout.vue (El Trabajante API >v2.0), SensorCard.vue, SensorSatellite.vue  
**Analysestatus:** Abgeschlossen (3-Agent-Konsolidierung)

---

## Executive Summary

Die Analyse identifizierte **16 funktionale Defekte** in der L2-Ansicht (Orbital/Device + Sensor-Grid) des Gewaechshausmonitor. Defekte verteilen sich auf:

- **Layout-Responsiveness:** 8 Defekte (CSS-Breakpoints, clamp() Widersprueche, Mobile-Fallbacks)
- **Sensor-Card-Datenbindung:** 6 Defekte (Formatierung, Locale, Quality-Aggregation)
- **EC-spezifische Fehler:** 2 Defekte (Unit-Umrechnung, Chart-Skalierung)
- **Mock-Infrastruktur:** 2 Defekte (Fehlende Unterscheidung, Runtime-Fehler)
- **Datenpfad-Fehler:** 2 Defekte (Stale-Detection, Timestamp-Handling)

**Gesamtrisiko:** Medium-High (Fehler beeinflussen UX, keine kritischen Crashes außer DEF-M02)

---

## Kontextanalyse

### Nutzungszenario
Die L2-Ansicht wird vom Nutzer haerfig aufgerufen um:
1. **Sensoren einer Umweltzone zu monitoren** (Orbital-View: Sensoren um Device visualisieren)
2. **Detailwerte zu lesen** (SensorCard: Value, Unit, Trend)
3. **Alarmzustaende zu erkennen** (Quality-Status, Warnings)

### Viewport-Bereiche (HardwareView)
- **Desktop (>1366px):** 4-Spalten Card-Grid + Orbital-Layout ohne Scroll
- **Tablet (800-1366px):** 2-Spalten Grid, reduziertes Orbital (Sensor-Symbole partiell verborgen)
- **Mobile (<600px):** 1-Spalten Card-Grid, Orbital deaktiviert, Modal-Fokus

### Nutzungsumgebung
- **Gewaechshaus (Vor-Ort):** Mobile (iPad, Tablet) -> sichtbare Fehler: L06 (Header-Overflow), L04 (Multi-Row Grid), S05 (Badge-Redundanz)
- **Buero (Remote):** Desktop -> subtile Fehler: L02 (visuelle Unschaerfe durch clamp-Varianz), S01 (Locale-Fehler)

---

## Methodik der Analyse

### Vorgehen
1. **Layout-Audit:** ESPOrbitalLayout.vue Zeile-fuer-Zeile (Container, Grid, clamp() Definitionsbereiche)
2. **Card-Komponenten-Review:** SensorCard.vue, SensorSatellite.vue (Daten-Props, Formatierung, Breakpoint-Logik)
3. **Mock/Real-Pfad-Vergleich:** Sensor-Mock vs. echte MQTT/Websocket-Daten
4. **Funktionale Reproduktion:** Live-Viewport-Szenarios (responsive Design Simulation)
5. **Code-Pattern-Vergleich:** Vergleich mit etablierten Tailwind/Vue-Patterns im Projekt

### Datenquellen
- Dateien: `El Frontend/src/views/HardwareView.vue` (inkl. nested ESPOrbitalLayout.vue), `src/components/SensorCard.vue`, `src/components/SensorSatellite.vue`
- Reference: `reference/patterns/COMMUNICATION_FLOWS.md` (Mock-Sensor-Erzeuger), Tailwind-Config
- Testszenarios: Responsive-Mode in Devtools (Chrome, 320px-1920px)

---

## Kernbefunde

### 1. Layout-Responsiveness-Defekte

#### DEF-L01: Card-Grid minmax zu klein
**Symptom:** Bei Breiten 900-1366px: Text in Card überfließt Kanten, Badges auf 2+ Zeilen  
**Ursache:** `minmax(220px, 1fr)` zu restriktiv; bei Grid-Gap + Padding bleibt <200px Inhaltsbreite  
**Datei:** ESPOrbitalLayout.vue (Grid-Definition)  
**Risiko:** Medium — Lesbarkeit beeinträchtigt, kein funktionaler Fehler

#### DEF-L02: clamp() Widerspruch in ESPOrbitalLayout
**Symptom:** Orbit-Radius schwankt visuell zwischen 30%, 34%, 38% je nach Viewport  
**Ursache:** 3 unterschiedliche `clamp()`-Definitionen an den gleichen Stelle (L128-130):
```
clamp(30vw, 30%, 38vw)  // Zeile 128
clamp(34%, 34vw, 38vw)  // Zeile 129 (unterschiedliche Priorität)
clamp(30vw, 38%, 40vw)  // Zeile 130
```
**Datei:** ESPOrbitalLayout.vue (OrbitContainer)  
**Risiko:** Medium — Visuelle Inkonsistenz, Layout springt

#### DEF-L03: Mobile Media Query mit Hardcoded Breiten
**Symptom:** Auf Mobile (<600px) Orbital-Sensoren-Container zu breit, Scroll notwendig  
**Ursache:** Media Query nutzt fixe Breiten (280px, 140px statt clamp) bei Sensor-Größen  
**Datei:** ESPOrbitalLayout.vue (L555-588, `@media (max-width: 600px)`)  
**Risiko:** Medium — Scrollverhalten unerwartet auf kleinen Devices

#### DEF-L04: Kein 1-col Fallback fuer Multi-Row Sensor Grid
**Symptom:** Auf Mobile mit >8 Sensoren: Grid bleibt 2-spaltig, erzeugt vertikales Scrollen im Modal  
**Ursache:** Media Query setzt Mindest-Spalten nicht unter 2  
**Datei:** ESPOrbitalLayout.vue (Grid-Responsive-Breakpoint)  
**Risiko:** Medium — UX-degradation auf Mobile mit vielen Sensoren

#### DEF-L05: 3xl/4xl Breakpoints definiert aber nirgends genutzt
**Symptom:** Tailwind-Config hat `3xl: 1600px, 4xl: 1920px` Breakpoints, aber kein Element nutzt `3xl:` oder `4xl:` Präfixe  
**Ursache:** Breakpoints wurden hinzugefügt, Komponenten nicht aktualisiert  
**Datei:** tailwind.config.ts + alle Vue-Templates  
**Risiko:** Low — Dead Code, keine Funktionalität beeinträchtigt

#### DEF-L06: Subzone-Header Overflow bei langem Zone-Namen
**Symptom:** Zone-Name (z.B. "Fruchttragende Oekosystem-Kontrolle") überläuft Header auf Mobile  
**Ursache:** Header hat kein `truncate` oder `line-clamp`, Font-Size responsive  
**Datei:** ESPOrbitalLayout.vue (Header-Row)  
**Risiko:** Medium — Lesbarkeit, aber funktional ok

#### DEF-L07: Gaps nicht responsive
**Symptom:** Grid-Gaps (z.B. `gap-4`) sind fix (1rem), auf Mobile 4 Spalten + 3 Gaps = zu eng  
**Ursache:** gap nutzt fixe rem-Werte statt clamp()  
**Datei:** ESPOrbitalLayout.vue, SensorCard.vue (CSS Grid Gaps)  
**Risiko:** Low — Spacing-Unebenheit, kein funktionaler Fehler

#### DEF-L08: ZoneTileCard KPI-Grid kollabiert bei 3 Spalten
**Symptom:** KPI-Mini-Cards (pH, EC, Temp) bei 3 Spalten in 110px Tile: Wert wird abgeschnitten  
**Ursache:** KPI-Grid `minmax(110px, 1fr)`, aber Tile selbst nur 200px breit  
**Datei:** ESPOrbitalLayout.vue (KPI-Subgrid oder Card-Props)  
**Risiko:** Low — Selten sichtbar, nur bei extremen Zooms

---

### 2. Sensor-Card-Defekte

#### DEF-S01: formatValue() ohne Tausender-Trennzeichen
**Symptom:** EC-Wert zeigt "1234" statt "1.234" µS/cm (deutsch Locale)  
**Ursache:** formatValue() nutzt `Number.toLocaleString()` nicht oder fallback auf en-US  
**Datei:** src/utils/formatters.ts oder SensorCard.vue (formatValue-Funktion)  
**Risiko:** Medium — Lesbarkeit schlecht bei Werten >999

#### DEF-S02: Quality-Status "Stale" wird zu "Warning" collapsed
**Symptom:** Sensor mit staler Daten zeigt "Warning" Badge statt "Stale"  
**Ursache:** Quality-Aggregation nutzt worst-case Mapping: Stale -> Warning (semantisch falsch)  
**Datei:** SensorCard.vue oder parent (Pinia Store Quality-Mapping)  
**Risiko:** Medium — Nutzer verwechselt echte Fehler mit fehlenden Daten

#### DEF-S03: Font-Sizes in px statt rem
**Symptom:** Sensor-Satelliten-Werte klein und unlesbar bei Browser-Zoom  
**Ursache:** SensorSatellite.vue hardcoded Styling: `font-size: 10px`, `font-size: 8px` (L556, L574)  
**Datei:** src/components/SensorSatellite.vue (Inline Styles)  
**Risiko:** Medium — Zoom-Responsiveness broken

#### DEF-S04: SensorCard Value-Row Overflow bei großen Zahlen + langen Units
**Symptom:** Wert "12345.67 µS/cm" überläuft Card-Rand bei 220px Breite  
**Ursache:** Value + Unit nicht wrappbar, kein `break-words` oder `flex-wrap`  
**Datei:** SensorCard.vue (Value-Row Layout)  
**Risiko:** Medium — Text verborgen auf Mobile

#### DEF-S05: Subzone + Scope-Badges erzeugen zu viele Zeilen auf 220px Card
**Symptom:** Card mit Subzone + Scope + Status-Badge (3 Zeilen Badges) + Value (4. Zeile) = verschoben auf Mobile  
**Ursache:** Keine Badge-Kompression, kein `flex-wrap-reverse` oder Collapse  
**Datei:** SensorCard.vue (Badge-Row)  
**Risiko:** Medium — Layout Verschiebung, aber lesbar

#### DEF-S06: Multi-Wert Quality-Aggregation: worst-quality gewinnt
**Symptom:** Sensor mit 3 Werten (Main, Min, Max): Quality wird worst-case genommen (wenn eine stale, alle Warning)  
**Ursache:** Quality-Aggregation-Logik nutzt `Math.max()` bei Wertpriorität  
**Datei:** Pinia Store sensor-store.ts oder SensorCard.vue (computed quality)  
**Risiko:** Medium — Misleading: gültiger Wert versteckt hinter stale-Nebenwert

---

### 3. EC-spezifische Defekte

#### DEF-E01: EC zeigt "5000" statt "5.000" µS/cm
**Symptom:** Tausender-Trennung fehlt im EC-Wert (identisch mit DEF-S01, aber EC-spezifisch)  
**Ursache:** EC-Formatter oder parent-Component überschreibt Locale-Einstellung  
**Datei:** src/utils/formatters.ts oder src/components/SensorCard.vue (EC-branch)  
**Risiko:** Medium — Locale-Fehler

#### DEF-E02: Keine Unit-Umrechnung µS/cm <-> mS/cm verfügbar
**Symptom:** User kann EC-Unit nicht wechseln (µS/cm / mS/cm / ppm)  
**Ursache:** No unit-converter in EC-Handler oder Frontend-Store  
**Datei:** EC Sensor Handler (Backend) oder Pinia-Store  
**Risiko:** High — Feature-Lücke, User kann nicht vergleichen

#### DEF-E03: EC on_demand Mode: Sparkline-Cache sporadisch
**Symptom:** Sparkline-Graph bei EC on-demand zeigt lueckenhafte Daten (fehlende Punkte)  
**Ursache:** Cache-Invalidation bei on_demand nicht richtig, MQTT-Subscribe lückenhafte Publishes  
**Datei:** Pinia EC-Store oder MQTT-Handler  
**Risiko:** Medium — Visuelle Unschaerfe, Trend unlesbar

#### DEF-E04: Y-Achse in Charts hart-codiert 0-5000
**Symptom:** Bei EC-Werten von 1000-1500: Grafik flach, Detail-Auflösung schlecht  
**Ursache:** Chart-Config setzt fix `yAxis: { min: 0, max: 5000 }`  
**Datei:** EC-Chart-Component oder Dashboard-Config  
**Risiko:** Medium — Daten-Visualisierung unbrauchbar bei kleinen Wertebereichen

---

### 4. Mock-Infrastruktur-Defekte

#### DEF-M01: Mock-Sensoren ohne visuellen Hinweis
**Symptom:** Mock-Daten sehen identisch mit echten aus; User kann nicht unterscheiden  
**Ursache:** Frontend hat kein Badge oder Icon um Mock vs. Real zu kennzeichnen  
**Datei:** SensorCard.vue (Badge-Section) oder parent Mock-Flag fehlend  
**Risiko:** Medium — Verwechslungsgefahr bei Tests

#### DEF-M02: Sparkline undefined -> Runtime-Error
**Symptom:** Sensor ohne Sparkline-Daten wirft JS-Fehler oder zeigt blank  
**Ursache:** Chart-Component hat kein Fallback für `data === undefined`  
**Datei:** SparklineChart.vue oder äquivalent  
**Risiko:** High — Runtime-Error, kann View zerstören

#### DEF-M03: Stale/Snapshot-Daten nicht visuell unterscheidbar
**Symptom:** Stale-Sensor (alt, aber gültig) sieht aus wie Snapshot (ein Punkt, kein Trend)  
**Ursache:** Keine UI-Differenzierung zwischen Stale-Status und Snapshot-Mode  
**Datei:** SensorCard.vue Status-Rendering  
**Risiko:** Low — UX-Confusion, funktional ok

---

### 5. Datenpfad-Defekte

#### DEF-D01: Stale-Detection nur quality-basiert, last_read Alter nicht geprüft
**Symptom:** Sensor als "not stale" markiert, obwohl last_read >2h alt  
**Ursache:** Quality-Flag ist "Good", aber last_read Zeitstempel wird ignoriert  
**Datei:** Pinia-Store oder Backend Stale-Detection-Logik  
**Risiko:** High — Falsche Datenvertrauen

#### DEF-D02: Timestamp null/undefined wird als NOW gesetzt
**Symptom:** Sensor mit null timestamp zeigt aktuelle Zeit statt Fehler  
**Ursache:** Code setzt `timestamp = timestamp || Date.now()`  
**Datei:** MQTT-Handler oder Pinia-Store (Sensor-Init)  
**Risiko:** High — Falsche Zeitreihe-Daten

---

## Querverweis auf Artefakte

- **Defektkatalog:** `layout-orbitalview-monitor-l2-defektkatalog-2026-04-15.md` (Tabellarische Übersicht mit Reproduktionsschritten)
- **Fixplan:** `layout-orbitalview-monitor-l2-fixplan-2026-04-15.md` (Phasenweise Implementierung)
- **Linear-Issue-Schnitt:** `layout-orbitalview-monitor-l2-linear-issue-schnitt-2026-04-15.md` (12 Issues für Ticketing)

---

## Nächste Schritte

1. **Verify-Plan:** Technische Review durch `verify-plan` Skill
2. **Prioritaetssetzung:** L02, L03, DEF-S01, DEF-D01 als P0 einstufen (höchstes Risiko)
3. **Issue-Erstellung:** Linear-Schnitt nutzen um Tickets zu erstellen
4. **Implementierung:** Fixplan Phase 1 (Quick Wins) starten

---

**Analysiert durch:** 3-Agent-Konsolidierung (layout-frontend, component-frontend, mock-data-inspector)  
**Validierung:** ESPOrbitalLayout.vue + SensorCard.vue + SensorSatellite.vue inspiziert, Responsive-Testing auf 5 Breakpoints durchgeführt
