# Defektkatalog: Orbital View & Monitor (L2)
**Datum:** 2026-04-15  
**Version:** 1.0  
**Insgesamt:** 16 Defekte

---

## Kategorisierung

| Kategorie | Count | Risiko-Mix |
|-----------|-------|-----------|
| `layout_breakpoint` | 5 | 3x Medium, 2x Low |
| `layout_density_or_spacing` | 2 | 1x Medium, 1x Low |
| `card_data_binding` | 5 | 3x Medium, 2x High |
| `card_formatting_or_units` | 2 | 2x Medium |
| `mock_logic_inconsistency` | 3 | 2x Medium, 1x High |
| `real_data_path_inconsistency` | 2 | 2x High |

---

## Defekt-Detailtabelle

### Layout-Responsiveness

#### DEF-L01: Card-Grid minmax zu klein

| Feld | Wert |
|------|-------|
| **ID** | DEF-L01 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | Card-Grid minmax(220px, 1fr) zu klein bei 900-1366px Viewport |
| **Beschreibung** | Text in SensorCard überläuft auf 2-3 Zeilen; Badges werden abgeschnitten bei Breiten 900-1100px. Grund: `minmax(220px, 1fr)` + Grid-Gap (16px) + Card-Padding (16px) = effektive Inhaltsbreite <180px. |
| **Betroffene Dateien** | `El Frontend/src/views/HardwareView.vue` (nested ESPOrbitalLayout.vue) — Grid-Definition Zeile ~280-290 |
| **Viewport-Betroffenheit** | 900px-1100px (Tablet-Modus, seltener aber kritisch bei Kiosk-Displays) |
| **Reproduktionsschritte** | 1. HardwareView öffnen (L2 Orbital-View)<br/>2. Responsive-Modus auf 950px setzen<br/>3. Sensor mit langem Namen beobachten (z.B. "pH-Sensor Gewächshaus Nord")<br/>4. Text überläuft rechts |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Ändern zu `minmax(240px, 1fr)` oder responsive `minmax(clamp(200px, 20vw, 240px), 1fr)` |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L01 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaengigkeiten** | Keine |

---

#### DEF-L02: clamp() Widerspruch in ESPOrbitalLayout

| Feld | Wert |
|------|-------|
| **ID** | DEF-L02 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | Orbit-Radius schwankt zwischen 30%, 34%, 38% (3 clamp()-Definitionen) |
| **Beschreibung** | Zeilen 128-130 in ESPOrbitalLayout.vue enthalten 3 unterschiedliche `clamp()`-Definitionen für denselben Container:<br/>- L128: `clamp(30vw, 30%, 38vw)`<br/>- L129: `clamp(34%, 34vw, 38vw)` (Parameterordnung falsch)<br/>- L130: `clamp(30vw, 38%, 40vw)`<br/>Resultat: Visueller "Jump" bei Viewport-Änderung, Layout-Instabilität. |
| **Betroffene Dateien** | `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout, Lines 128-130) |
| **Viewport-Betroffenheit** | 600px-1400px (sichtbar bei resizing) |
| **Reproduktionsschritte** | 1. Orbital-View öffnen<br/>2. Browser-Fenster von 800px auf 1200px resizen<br/>3. Orbit-Container springt visuell (Radius ändert sich abrupt) |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Drei Definitionen konsolidieren zu EINER korrekten: `clamp(30vw, 34%, 38vw)` (oder clamp(240px, 34%, 500px) für absolute Grenzen) |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L02 (zu erstellen) |
| **Geschaetzte Dauer** | 20 min |
| **Abhaengigkeiten** | Keine |

---

#### DEF-L03: Mobile Media Query mit Hardcoded Breiten

| Feld | Wert |
|------|-------|
| **ID** | DEF-L03 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | Media Query @600px nutzt fixe Breiten statt clamp() |
| **Beschreibung** | Zeilen 555-588 in ESPOrbitalLayout.vue enthalten `@media (max-width: 600px)` Blockierungen mit hardcoded Breiten (280px, 140px) für Sensor-Container. Diese breakpoints sind starr und erzeugen bei z.B. 590px oder 610px unterschiedliche Layouts. Kein responsive `clamp()` Fallback. |
| **Betroffene Dateien** | `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout, Lines 555-588) |
| **Viewport-Betroffenheit** | <600px (Mobile), sichtbar bei 480px-600px Skalierung |
| **Reproduktionsschritte** | 1. Mobile-Ansicht öffnen (<600px)<br/>2. Sensor-Orbita (oder Grid) beobachten<br/>3. Horizontal scrollbar erscheint (sollte nicht)<br/>4. Inhalte-Breite ist >viewport |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | clamp() nutzen für Sensor-Größen auch in Mobile-Query: z.B. `width: clamp(100px, 80vw, 280px)` statt fixe 280px |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L03 (zu erstellen) |
| **Geschaetzte Dauer** | 25 min |
| **Abhaengigkeiten** | DEF-L02 sollte zuerst gefixt sein |

---

#### DEF-L04: Kein 1-col Fallback für Multi-Row Sensor Grid

| Feld | Wert |
|------|-------|
| **ID** | DEF-L04 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | Mobile Grid mit >8 Sensoren bleibt 2-spaltig statt 1-spaltig |
| **Beschreibung** | Auf Breiten <600px mit Sensoren >8: Grid-Layout wird nicht zu 1 Spalte. Media Query setzt Mindest-Spalten nicht herunter, resultiert in vertikales Scrollen im Modal. UX-degradation: User muss doppelt horizontal scrollen (Modal + Grid). |
| **Betroffene Dateien** | `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout Grid-Definition, Media Query section) |
| **Viewport-Betroffenheit** | <600px mit Device, das >8 Sensoren hat |
| **Reproduktionsschritte** | 1. Mock-Device mit 10+ Sensoren erstellen (oder echtes Device)<br/>2. Mobile-View öffnen (<600px)<br/>3. Sensor-Grid beobachten: zeigt 2 Spalten statt 1<br/>4. Horizontales Scrolling notwendig |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Media Query für <600px ändern: `grid-template-columns: 1fr` statt `repeat(auto-fit, minmax(220px, 1fr))` |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L04 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-L05: 3xl/4xl Breakpoints definiert aber nicht genutzt

| Feld | Wert |
|------|-------|
| **ID** | DEF-L05 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | Tailwind Breakpoints 3xl (1600px) und 4xl (1920px) als Dead Code |
| **Beschreibung** | tailwind.config.ts definiert erweiterte Breakpoints (3xl: 1600px, 4xl: 1920px), aber kein Vue-Template nutzt `3xl:` oder `4xl:` Präfixe. Dead Code, verursacht keine Fehler, aber Verwirrung bei Maintenance. |
| **Betroffene Dateien** | `El Frontend/tailwind.config.ts` + alle Vue-Templates (Abwesenheit von 3xl:/4xl: Präfixen) |
| **Viewport-Betroffenheit** | Keine (Dead Code) |
| **Reproduktionsschritte** | Grep: `grep -r "3xl:" src/` und `grep -r "4xl:" src/` — sollte keine Treffer zeigen. |
| **Aufloesung (getestet)** | Nein — Dead Code, keine Implementierung nötig |
| **Fixansatz** | Option A: Breakpoints aus Config entfernen<br/>Option B: Layouts für 1600px+ ausarbeiten (optionale Optimierung für 4K-Displays) |
| **Risiko** | Low |
| **Fixplan-Referenz** | Phase 3 (Architektur) — optional |
| **Linear-Issue-Referenz** | #AUTO-LX-L05 (Cleanup-Ticket, optional) |
| **Geschaetzte Dauer** | 10 min |
| **Abhaengigkeiten** | Keine |

---

#### DEF-L06: Subzone-Header Overflow bei langem Zone-Namen

| Feld | Wert |
|------|-------|
| **ID** | DEF-L06 |
| **Kategorie** | `layout_density_or_spacing` |
| **Titel** | Zone-Name überläuft Header-Row auf Mobile |
| **Beschreibung** | Subzone-Header (Zone-Name) mit langen Namen (z.B. "Fruchttragende Oekosystem-Kontrolle") überläuft Header-Zeile auf <600px. Kein `truncate` oder `line-clamp`, Font-Size responsive aber nicht Breite. |
| **Betroffene Dateien** | `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout Header-Row Styling) |
| **Viewport-Betroffenheit** | <600px |
| **Reproduktionsschritte** | 1. Mobile-View öffnen<br/>2. Device mit langem Zone-Namen laden<br/>3. Header-Text überläuft rechts |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Header-Text: `class="truncate"` oder `line-clamp-2` hinzufügen, oder Font-Size reduzieren auf Mobile |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L06 (zu erstellen) |
| **Geschaetzte Dauer** | 10 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-L07: Gaps nicht responsive

| Feld | Wert |
|------|-------|
| **ID** | DEF-L07 |
| **Kategorie** | `layout_density_or_spacing` |
| **Titel** | Grid-Gaps und Flex-Gaps nutzen fixe rem-Werte statt clamp() |
| **Beschreibung** | Überall in Layouts: `gap-4` (1rem = 16px) ist fix auf allen Breakpoints. Auf Mobile mit 4 Spalten + 3 Gaps = 3×16px = 48px nur für Abstände bei 320px Breite verschwendet. Spacing wirkt unausgewogen. |
| **Betroffene Dateien** | ESPOrbitalLayout.vue, SensorCard.vue (alle `gap-*` Klassen) |
| **Viewport-Betroffenheit** | Mobile (<600px) |
| **Reproduktionsschritte** | 1. Mobile-View öffnen<br/>2. Grid oder Flex-Container mit mehreren Items beobachten<br/>3. Gaps wirken zu groß relativ zu Item-Größe |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Gaps mit clamp() oder CSS Custom Properties: z.B. `gap: clamp(8px, 2vw, 16px)` |
| **Risiko** | Low |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-L07 (zu erstellen) |
| **Geschaetzte Dauer** | 30 min (alle Instanzen durchgehen) |
| **Abhaendigkeiten** | Keine |

---

#### DEF-L08: ZoneTileCard KPI-Grid kollabiert bei 3 Spalten

| Feld | Wert |
|------|-------|
| **ID** | DEF-L08 |
| **Kategorie** | `layout_breakpoint` |
| **Titel** | KPI-Mini-Cards (pH, EC, Temp) bei minmax(110px) in 200px Tile: Werte abgeschnitten |
| **Beschreibung** | ZoneTileCard mit KPI-Subgrid: 3 Spalten à `minmax(110px, 1fr)` in 200px Card-Breite = Rechnung geht nicht auf. Überlauf oder Wert-Clipping. Seltener Randfall aber möglich bei Kiosk-Displays oder extreme Zooms. |
| **Betroffene Dateien** | `El Frontend/src/components/ZoneTileCard.vue` oder parent Container (KPI-Grid Definition) |
| **Viewport-Betroffenheit** | <300px (seltene Breite) oder kleine Tile-Container |
| **Reproduktionsschritte** | 1. Browser auf 280px Breite setzen<br/>2. ZoneTile mit 3 KPIs beobachten<br/>3. KPI-Werte überläufen oder werden abgeschnitten |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | KPI-Grid auf Mobile zu 2 Spalten umschalten, oder minmax(90px) reduzieren, oder KPI-Anzahl je Breakpoint limitieren |
| **Risiko** | Low |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-L08 (zu erstellen) |
| **Geschaetzte Dauer** | 20 min |
| **Abhaendigkeiten** | Keine |

---

### Sensor-Card-Defekte

#### DEF-S01: formatValue() ohne Tausender-Trennzeichen

| Feld | Wert |
|------|-------|
| **ID** | DEF-S01 |
| **Kategorie** | `card_formatting_or_units` |
| **Titel** | EC-Wert zeigt "5000" statt "5.000" µS/cm (de-DE Locale) |
| **Beschreibung** | formatValue() in src/utils/formatters.ts oder SensorCard.vue nutzt `Number.toString()` statt `toLocaleString('de-DE')`. EC-Wert mit 4+ Ziffern unlesbar. |
| **Betroffene Dateien** | `El Frontend/src/utils/formatters.ts` oder `src/components/SensorCard.vue` (formatValue-Funktion) |
| **Viewport-Betroffenheit** | Alle (nicht Layout-Fehler) |
| **Reproduktionsschritte** | 1. SensorCard mit EC-Sensor laden (Wert >999)<br/>2. Wert liest sich als "5000" statt "5.000"<br/>3. Browser Locale ist de-DE |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | formatValue() nutzen: `value.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 0 })` |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 1 (Quick Wins) |
| **Linear-Issue-Referenz** | #AUTO-LX-S01 (zu erstellen) |
| **Geschaetzte Dauer** | 10 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-S02: Quality-Status "Stale" wird zu "Warning" collapsed

| Feld | Wert |
|------|-------|
| **ID** | DEF-S02 |
| **Kategorie** | `card_data_binding` |
| **Titel** | Sensor mit staler Daten zeigt "Warning" Badge statt "Stale" |
| **Beschreibung** | Quality-Aggregation (Pinia Store oder SensorCard computed) mappt Stale-Status zu Warning. Semantisch falsch: Stale = "Daten alt aber gültig", Warning = "Fehler/Anomalie". User verwechselt echte Fehler mit fehlenden Updates. |
| **Betroffene Dateien** | `El Frontend/src/stores/sensor-store.ts` oder `src/components/SensorCard.vue` (Quality-Mapping) |
| **Viewport-Betroffenheit** | Alle |
| **Reproduktionsschritte** | 1. Sensor mit letztem Update vor >1h laden (Mock oder real)<br/>2. Badge zeigt "Warning" statt "Stale" oder "Keine Daten"<br/>3. Vergleich: ein funktionierender Sensor mit echtem Fehler vs. staler Sensor sollte unterschiedliche Badges haben |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Quality-Mapping erweitern: Stale = eigenes Badge-Status "Stale" (grau), nicht Warning (rot) |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-S02 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-S03: Font-Sizes in px statt rem

| Feld | Wert |
|------|-------|
| **ID** | DEF-S03 |
| **Kategorie** | `card_formatting_or_units` |
| **Titel** | SensorSatellite hardcoded px Font-Sizes (10px, 8px) — nicht zoom-responsive |
| **Beschreibung** | Zeilen 556, 574 in SensorSatellite.vue enthalten Inline-Styles mit `font-size: 10px` und `font-size: 8px`. Bei Browser-Zoom (>100%) wird Text nicht skaliert, bleibt klein und unlesbar. |
| **Betroffene Dateien** | `El Frontend/src/components/SensorSatellite.vue` (L556, L574 Inline-Styles) |
| **Viewport-Betroffenheit** | Alle (betrifft Zoom, nicht Responsive) |
| **Reproduktionsschritte** | 1. SensorSatellite Component laden<br/>2. Browser-Zoom auf 150% erhöhen (Ctrl++)<br/>3. SensorSatellite-Text bleibt klein, nicht skaliert |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | px zu rem konvertieren: `10px` -> `0.625rem` (~10px bei base 16px), `8px` -> `0.5rem`. Oder CSS-Klassen nutzen. |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 1 (Quick Wins) |
| **Linear-Issue-Referenz** | #AUTO-LX-S03 (zu erstellen) |
| **Geschaetzte Dauer** | 10 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-S04: SensorCard Value-Row Overflow bei großen Zahlen + langen Units

| Feld | Wert |
|------|-------|
| **ID** | DEF-S04 |
| **Kategorie** | `card_data_binding` |
| **Titel** | Wert "12345.67 µS/cm" überläuft Card-Rand bei 220px Breite |
| **Beschreibung** | SensorCard mit großem Wert + langer Unit (z.B. EC "12345.67 µS/cm") hat keine `flex-wrap` oder `word-break` Handling. Text wird abgeschnitten oder überläuft Card-Rand auf Mobile (220px). |
| **Betroffene Dateien** | `El Frontend/src/components/SensorCard.vue` (Value-Row HTML/CSS) |
| **Viewport-Betroffenheit** | <280px (Mobile) |
| **Reproduktionsschritte** | 1. SensorCard mit EC oder EC-ähnlichem Wert laden (große Zahl)<br/>2. Mobile-View <280px<br/>3. Wert + Unit überläuft rechts oder wird abgeschnitten |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Value-Row: `flex-wrap: wrap` oder `break-words`, oder Font-Size responsive reduzieren |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-S04 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-S05: Subzone + Scope-Badges erzeugen zu viele Zeilen auf 220px Card

| Feld | Wert |
|------|-------|
| **ID** | DEF-S05 |
| **Kategorie** | `card_data_binding` |
| **Titel** | 3+ Badges + Value verschieben sich auf Mobile |
| **Beschreibung** | SensorCard mit Subzone-Badge + Scope-Badge + Quality-Badge + Value = 3-4 Zeilen. Bei 220px Breite wird Layout vertikal verschoben, Wert/Trend rückt nach unten. Keine Badge-Kompression oder Collapse-Logik. |
| **Betroffene Dateien** | `El Frontend/src/components/SensorCard.vue` (Badge-Row und Layout) |
| **Viewport-Betroffenheit** | <280px (Mobile) mit Multi-Badge Sensoren |
| **Reproduktionsschritte** | 1. Sensor mit Subzone + Scope laden<br/>2. Mobile-View <280px<br/>3. Beobachten: Badges und Value bilden 3-4 Zeilen statt 2 |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Option A: Badge-Kompression (Icons statt Text)<br/>Option B: Badge-Collapse bei <250px (Tooltip statt inline)<br/>Option C: Subzone-Badge entfernen (redundant mit Device-Info) |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-S05 (zu erstellen) |
| **Geschaetzte Dauer** | 25 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-S06: Multi-Wert Quality-Aggregation: worst-quality gewinnt

| Feld | Wert |
|------|-------|
| **ID** | DEF-S06 |
| **Kategorie** | `card_data_binding` |
| **Titel** | Sensor mit Main/Min/Max: Quality wird worst-case aggregiert (eine stale -> alle warning) |
| **Beschreibung** | Sensoren mit Multi-Wert (z.B. EC: Main, Min, Max Trend) haben Quality-Aggregation, die worst-case Qualität nimmt (wenn eine stale, alle zeigen Warning). Resultat: gültiger Wert wird hinter stale-Nebenwert versteckt. Semantik falsch. |
| **Betroffene Dateien** | `El Frontend/src/stores/sensor-store.ts` oder parent `src/components/SensorCard.vue` (Quality-Aggregation Logik) |
| **Viewport-Betroffenheit** | Alle |
| **Reproduktionsschritte** | 1. Sensor mit Multi-Wert laden (EC mit Trend-Min/Max)<br/>2. Eines der Trend-Werte "stale" machen (Mock oder real)<br/>3. Beobachten: Card zeigt Quality "Warning" obwohl Main-Wert aktuell ist |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Quality-Aggregation ändern: Main-Wert Quality priorisieren statt worst-case. Oder separate Quality-Badges pro Wert. |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-S06 (zu erstellen) |
| **Geschaetzte Dauer** | 20 min |
| **Abhaendigkeiten** | DEF-S02 sollte zuerst gefixt sein |

---

### EC-spezifische Defekte

#### DEF-E01: EC zeigt "5000" statt "5.000" µS/cm

| Feld | Wert |
|------|-------|
| **ID** | DEF-E01 |
| **Kategorie** | `card_formatting_or_units` |
| **Titel** | EC-Wert Tausender-Trennung fehlt (identisch mit DEF-S01 EC-Spezifisch) |
| **Beschreibung** | EC-Formatter oder parent-Component überschreibt Locale-Einstellung. EC zeigt "5000" statt "5.000" µS/cm. Redundant mit DEF-S01 aber EC-spezifisch dokumentiert. |
| **Betroffene Dateien** | `El Frontend/src/utils/formatters.ts` (EC-branch) oder EC-Handler |
| **Viewport-Betroffenheit** | Alle |
| **Reproduktionsschritte** | 1. EC-Sensor mit Wert >999 laden<br/>2. Wert liest sich als "5000" statt "5.000" |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Siehe DEF-S01 (nutzen toLocaleString mit de-DE) |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 1 (Quick Wins) — zusammen mit DEF-S01 |
| **Linear-Issue-Referenz** | #AUTO-LX-E01 (zusammen mit S01) |
| **Geschaetzte Dauer** | 5 min (Teil von DEF-S01) |
| **Abhaendigkeiten** | DEF-S01 |

---

#### DEF-E02: Keine Unit-Umrechnung µS/cm <-> mS/cm verfügbar

| Feld | Wert |
|------|-------|
| **ID** | DEF-E02 |
| **Kategorie** | `card_data_binding` |
| **Titel** | User kann EC-Unit nicht wechseln (µS/cm / mS/cm / ppm) |
| **Beschreibung** | Feature-Lücke: Kein Unit-Converter in EC-Handler oder Frontend-Store. User kann nicht zwischen Einheiten wechseln (µS/cm ↔ mS/cm ↔ ppm). Notwendig für Vergleich mit externen Datenquellen. |
| **Betroffene Dateien** | `El Frontend/src/utils/formatters.ts` (EC-formatter) oder Backend EC-Handler |
| **Viewport-Betroffenheit** | Keine (Feature-Request) |
| **Reproduktionsschritte** | 1. EC-Sensor öffnen<br/>2. Settings/Unit-Selector suchen<br/>3. Nicht vorhanden |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Unit-Converter hinzufügen: `toLocaleString('de-DE')` erweitern um Unit-Mapping. EC-Value kann in µS/cm gespeichert sein, aber User-Setting für Anzeige-Unit. |
| **Risiko** | High |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-E02 (zu erstellen) |
| **Geschaetzte Dauer** | 1-2h (Unit-Logik + Settings UI) |
| **Abhaendigkeiten** | DEF-E01 sollte zuerst gefixt sein |

---

#### DEF-E03: EC on_demand Mode: Sparkline-Cache sporadisch

| Feld | Wert |
|------|-------|
| **ID** | DEF-E03 |
| **Kategorie** | `card_data_binding` |
| **Titel** | Sparkline-Graph bei EC on_demand zeigt Lücken (sporadische Daten) |
| **Beschreibung** | EC on_demand Mode: Sparkline wird periodisch aktualisiert, aber Cache-Invalidation ist nicht robust. Lueckenhafte Datenpunkte im Graph (fehlende Punkte), Trend ist unlesbar. Grund: MQTT-Publishes lückenhafte Daten oder Pinia-Store invalidiert nicht richtig. |
| **Betroffene Dateien** | `El Frontend/src/stores/sensor-store.ts` (EC on_demand Cache) oder MQTT-Handler |
| **Viewport-Betroffenheit** | Alle (bei EC on_demand Mode) |
| **Reproduktionsschritte** | 1. EC-Sensor mit on_demand Modus laden<br/>2. Sparkline-Graph öffnen<br/>3. Beobachten: Graph hat Lücken, nicht durchgehend |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | MQTT Cache-Strategie überprüfen: Entweder Daten vollständig buffern, oder Sparkline mit fehlenden Punkten interpolieren |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-E03 (zu erstellen) |
| **Geschaetzte Dauer** | 45 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-E04: Y-Achse in Charts hart-codiert 0-5000

| Feld | Wert |
|------|-------|
| **ID** | DEF-E04 |
| **Kategorie** | `card_data_binding` |
| **Titel** | EC-Chart Y-Achse fix 0-5000: Flache Grafik bei 1000-1500er Bereich |
| **Beschreibung** | EC-Chart-Component oder Dashboard-Config: Y-Achse ist hart-codiert auf 0-5000 µS/cm. Bei Werten 1000-1500 (typischer Bereich): Grafik ist flach (nur unteren 30% der Höhe), Detail-Auflösung schlecht. |
| **Betroffene Dateien** | EC-Chart-Component oder Dashboard-Config (Y-Achsen-Definition) |
| **Viewport-Betroffenheit** | Alle (bei EC-Anzeige mit typischen Werten) |
| **Reproduktionsschritte** | 1. EC-Sensor mit Werten 1000-1500 laden<br/>2. Chart öffnen<br/>3. Y-Achse geht von 0-5000: Daten sind in unteren 30% der Grafik-Höhe |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Y-Achse dynamic setzen (auto-scale) oder User-Setting hinzufügen. Z.B. `yAxis: { min: Math.min(data)*0.9, max: Math.max(data)*1.1 }` |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-E04 (zu erstellen) |
| **Geschaetzte Dauer** | 20 min |
| **Abhaendigkeiten** | Keine |

---

### Mock-Infrastruktur-Defekte

#### DEF-M01: Mock-Sensoren ohne visuellen Hinweis

| Feld | Wert |
|------|-------|
| **ID** | DEF-M01 |
| **Kategorie** | `mock_logic_inconsistency` |
| **Titel** | Mock-Daten sind visuell identisch mit echten (kein Unterscheidungs-Badge) |
| **Beschreibung** | Frontend erzeugt Mock-Sensoren für Tests, aber es gibt keinen visuellen Hinweis (Badge, Icon, Farbe) der sie von echten unterscheidet. User (oder Tester) kann nicht erkennen ob er echte oder Mock-Daten sieht. Verwechslungsgefahr. |
| **Betroffene Dateien** | `El Frontend/src/components/SensorCard.vue` (Badge-Section) oder Mock-Generator (fehlender is_mock Flag) |
| **Viewport-Betroffenheit** | Alle (bei Mock-Mode) |
| **Reproduktionsschritte** | 1. Mock-Device mit Mock-Sensoren laden<br/>2. Observieren: Sensoren sehen identisch mit echten aus<br/>3. Keine visuelle Unterscheidung |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | SensorCard: `is_mock` Flag hinzufügen, Badge anzeigen "Mock" (Orange/Gelb) wenn `is_mock === true` |
| **Risiko** | Medium |
| **Fixplan-Referenz** | Phase 2 (Strukturelle Fixes) |
| **Linear-Issue-Referenz** | #AUTO-LX-M01 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-M02: Sparkline undefined -> Runtime-Error

| Feld | Wert |
|------|-------|
| **ID** | DEF-M02 |
| **Kategorie** | `mock_logic_inconsistency` |
| **Titel** | Sparkline-Chart wirft JS-Error oder zeigt blank bei undefined Daten |
| **Beschreibung** | Sensor ohne Sparkline-Daten (oder Mock mit null sparkline): Chart-Component hat kein Fallback. Wirft `Cannot read property 'length' of undefined` oder ähnlich. View kann zerstört werden. |
| **Betroffene Dateien** | `El Frontend/src/components/SparklineChart.vue` (oder äquivalent) — fehlender null-check |
| **Viewport-Betroffenheit** | Alle (bei Sensoren ohne Sparkline-Daten) |
| **Reproduktionsschritte** | 1. Sensor mit undefined oder null sparkline laden<br/>2. Console zeigt JS-Error<br/>3. Chart zeigt blank oder verschwindet |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | SparklineChart: Null-Check hinzufügen. `if (!data || data.length === 0) return <div>Keine Daten</div>` |
| **Risiko** | High |
| **Fixplan-Referenz** | Phase 1 (Quick Wins) |
| **Linear-Issue-Referenz** | #AUTO-LX-M02 (zu erstellen) |
| **Geschaetzte Dauer** | 10 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-M03: Stale/Snapshot-Daten nicht visuell unterscheidbar

| Feld | Wert |
|------|-------|
| **ID** | DEF-M03 |
| **Kategorie** | `mock_logic_inconsistency` |
| **Titel** | Stale-Sensor und Snapshot-Mode sehen gleich aus |
| **Beschreibung** | Stale-Daten (alt, aber gültig) und Snapshot-Mode (ein Punkt, kein Trend) haben keine UI-Differenzierung. User verwechselt "keine Aktualisierung seit Stunden" mit "gerade ein Screenshot gemacht". |
| **Betroffene Dateien** | `El Frontend/src/components/SensorCard.vue` (Status-Rendering) oder Mock-Mode-Logik |
| **Viewport-Betroffenheit** | Alle (bei Stale oder Snapshot) |
| **Reproduktionsschritte** | 1. Sensor als Stale markieren (last_read >2h)<br/>2. Vergleich: Snapshot-Mode Sensor<br/>3. Beobachten: keine visuelle Unterscheidung |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Status-Badge/Icon erweitern: "Stale" = grau Icon + Text, "Snapshot" = blau Icon + Text |
| **Risiko** | Low |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-M03 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | DEF-S02 sollte zuerst gefixt sein |

---

### Datenpfad-Defekte

#### DEF-D01: Stale-Detection nur quality-basiert, last_read Alter nicht geprüft

| Feld | Wert |
|------|-------|
| **ID** | DEF-D01 |
| **Kategorie** | `real_data_path_inconsistency` |
| **Titel** | Sensor als "not stale" markiert, obwohl last_read >2h alt |
| **Beschreibung** | Stale-Detection-Logik (Pinia oder Backend) nutzt nur Quality-Flag, nicht last_read Timestamp. Resultat: Sensor mit `quality = "Good"` aber `last_read = 2 Stunden alt` wird als aktuell angezeigt. Gefährlich: User vertraut falschen Daten. |
| **Betroffene Dateien** | `El Frontend/src/stores/sensor-store.ts` (computed stale-detection) oder Backend API |
| **Viewport-Betroffenheit** | Alle |
| **Reproduktionsschritte** | 1. Sensor mit Quality "Good" aber last_read >2h laden<br/>2. Beobachten: Status zeigt "aktuell", nicht "stale"<br/>3. Check Timestamp: >2h alt |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Stale-Detection: `isStale = quality !== "Good" OR (Date.now() - last_read > 2h)` |
| **Risiko** | High |
| **Fixplan-Referenz** | Phase 3 (Architektur) |
| **Linear-Issue-Referenz** | #AUTO-LX-D01 (zu erstellen) |
| **Geschaetzte Dauer** | 20 min |
| **Abhaendigkeiten** | Keine |

---

#### DEF-D02: Timestamp null/undefined wird als NOW gesetzt

| Feld | Wert |
|------|-------|
| **ID** | DEF-D02 |
| **Kategorie** | `real_data_path_inconsistency` |
| **Titel** | Sensor mit null timestamp zeigt aktuelle Zeit statt Fehler |
| **Beschreibung** | MQTT-Handler oder Pinia-Store setzt `timestamp = timestamp || Date.now()`. Wenn MQTT-Payload null oder undefined timestamp hat, wird es auf NOW gesetzt. Resultat: Falsche Zeitreihe-Daten, Trends sind verfälscht. |
| **Betroffene Dateien** | `El Frontend/src/stores/sensor-store.ts` (Sensor-Init) oder MQTT-Handler |
| **Viewport-Betroffenheit** | Alle (bei Sensoren mit null timestamp) |
| **Reproduktionsschritte** | 1. Mock-Sensor mit `timestamp: null` erstellen<br/>2. MQTT-Message mit null timestamp publizieren<br/>3. Beobachten: Sensor zeigt aktuelle Zeit<br/>4. Trend/Sparkline verfälscht |
| **Aufloesung (getestet)** | Nein — noch nicht implementiert |
| **Fixansatz** | Validierung hinzufügen: `if (!timestamp) throw Error('Missing timestamp')` oder Log-Warning statt Silent-Fix |
| **Risiko** | High |
| **Fixplan-Referenz** | Phase 1 (Quick Wins) |
| **Linear-Issue-Referenz** | #AUTO-LX-D02 (zu erstellen) |
| **Geschaetzte Dauer** | 15 min |
| **Abhaendigkeiten** | Keine |

---

## Zusammenfassung nach Risiko

| Risiko | Count | IDs |
|--------|-------|-----|
| **High** | 4 | DEF-E02, DEF-M02, DEF-D01, DEF-D02 |
| **Medium** | 11 | DEF-L01, DEF-L02, DEF-L03, DEF-L04, DEF-L06, DEF-S01, DEF-S02, DEF-S04, DEF-S05, DEF-E01, DEF-M01 |
| **Low** | 5 | DEF-L05, DEF-L07, DEF-L08, DEF-S03, DEF-E03, DEF-M03 |

---

**Stand:** 2026-04-15  
**Nächster Schritt:** Fixplan durcharbeiten, Linear-Issues erstellen
