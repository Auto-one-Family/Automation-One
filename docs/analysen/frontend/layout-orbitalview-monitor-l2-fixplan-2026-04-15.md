# Fixplan: Orbital View & Monitor (L2)
**Datum:** 2026-04-15  
**Bearbeitungsstatus:** Planning  
**Geschaetzte Gesamtdauer:** 10-12h (3 Phasen)

---

## Ueberblick

Fixplan ist in 3 Phasen organisiert nach Implementierungs-Komplexitaet und Risiko:

- **Phase 1 — Quick Wins (S, 1-2h):** Triviale Fixes, keine Arch-Aenderungen, sofort produktionsreif
- **Phase 2 — Strukturelle Fixes (M, 4-8h):** CSS/Layout-Refactoring, Komponentenlogik-Updates
- **Phase 3 — Architektur (L, 1-2 Tage):** Feature-Implementierung, tiefe Store-Aenderungen

---

## Phase 1: Quick Wins (Dauer: 1-2h)

Fixes, die isoliert, schnell und risikoarm sind. Keine Arch-Aenderungen, keine Cross-Component-Dependencies.

### P1.1 — DEF-S01 + DEF-E01: formatValue() Locale-Fix

**Defekt:** EC-Wert zeigt "5000" statt "5.000" µS/cm (de-DE Locale)  
**Status:** Ausstehend  
**Dauer:** 10 min  
**Risiko:** Low

#### Aufgabe
1. `src/utils/formatters.ts` öffnen (oder SensorCard.vue wenn kein Formatter existiert)
2. `formatValue()` Funktion prüfen: nutzt `Number.toString()` statt `toLocaleString()`
3. Update:
   ```typescript
   // VORHER
   export const formatValue = (value: number) => value.toString();
   
   // NACHHER
   export const formatValue = (value: number, locale: string = 'de-DE') => {
     return value.toLocaleString(locale, {
       maximumFractionDigits: 2,
       minimumFractionDigits: 0
     });
   };
   ```
4. EC-Sensoren testen (Werte >999)
5. Commit: `fix: formatValue() locale de-DE für Tausender-Trennung`

---

### P1.2 — DEF-S03: SensorSatellite px->rem Konvertierung

**Defekt:** Font-Sizes in px (10px, 8px) sind nicht zoom-responsive  
**Status:** Ausstehend  
**Dauer:** 10 min  
**Risiko:** Low

#### Aufgabe
1. `src/components/SensorSatellite.vue` öffnen (Zeilen 556, 574)
2. Inline-Styles identifizieren mit `style="font-size: 10px"` und `style="font-size: 8px"`
3. Ändern zu:
   ```vue
   <!-- VORHER -->
   <span style="font-size: 10px">{{ value }}</span>
   
   <!-- NACHHER -->
   <span class="text-xs">{{ value }}</span>
   <!-- oder -->
   <span style="font-size: 0.625rem">{{ value }}</span>
   ```
4. Browser-Zoom testen (Ctrl++ auf 150%)
5. Commit: `fix: SensorSatellite font-sizes px->rem (zoom-responsive)`

---

### P1.3 — DEF-M02: SparklineChart Null-Check

**Defekt:** Sparkline undefined wirft Runtime-Error  
**Status:** Ausstehend  
**Dauer:** 10 min  
**Risiko:** Low (aber High Priority)

#### Aufgabe
1. `src/components/SparklineChart.vue` öffnen (oder Chart-Component)
2. Props-Validierung überprüfen: `data?: number[]`
3. Render-Guard hinzufügen:
   ```vue
   <template>
     <div v-if="!data || data.length === 0" class="text-gray-400 text-sm">
       Keine Sparkline-Daten
     </div>
     <div v-else>
       <!-- Chart rendering -->
     </div>
   </template>
   ```
4. Test: Sensor ohne Sparkline-Daten laden, kein Error
5. Commit: `fix: SparklineChart null-check graceful fallback`

---

### P1.4 — DEF-D02: Timestamp Validierung

**Defekt:** null timestamp wird als NOW gesetzt (falsche Zeitreihen-Daten)  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** High Priority

#### Aufgabe
1. `src/stores/sensor-store.ts` öffnen (Sensor-Init/Update-Logic)
2. Funktion finden, die `timestamp` setzt (z.B. `updateSensor()`, MQTT-Handler)
3. Pattern ändern:
   ```typescript
   // VORHER (FALSCH)
   const sensor = {
     ...payload,
     timestamp: payload.timestamp || Date.now()  // ← Problem
   };
   
   // NACHHER (RICHTIG)
   if (!payload.timestamp) {
     console.warn(`Sensor ${payload.id}: Missing timestamp, rejecting update`);
     return; // oder throw Error
   }
   const sensor = {
     ...payload,
     timestamp: payload.timestamp
   };
   ```
4. Test: Mock-Sensor mit null timestamp -> wird abgelehnt oder logged
5. Commit: `fix: reject sensor updates with missing/null timestamp`

---

## Phase 2: Strukturelle Fixes (Dauer: 4-8h)

Layout-Refactoring und Komponenten-Logik-Updates. Erfordert CSS-Änderungen und Testing auf mehreren Breakpoints.

### P2.1 — DEF-L01: Card-Grid minmax erhöhen

**Defekt:** Card-Grid minmax(220px) zu klein bei 900-1366px  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Low

#### Aufgabe
1. ESPOrbitalLayout.vue öffnen (Grid-Definition ~L280-290)
2. `grid-template-columns` identifizieren:
   ```css
   /* VORHER */
   grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
   
   /* NACHHER */
   grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
   /* oder responsive */
   grid-template-columns: repeat(auto-fit, minmax(clamp(200px, 20vw, 240px), 1fr));
   ```
3. Test auf Breakpoints: 800px, 950px, 1200px
4. Commit: `fix: increase card-grid minmax 220->240px`

---

### P2.2 — DEF-L02: clamp() Konsistenz in OrbitContainer

**Defekt:** 3 unterschiedliche clamp()-Definitionen (30%, 34%, 38%)  
**Status:** Ausstehend  
**Dauer:** 20 min  
**Risiko:** Medium

#### Aufgabe
1. ESPOrbitalLayout.vue Zeilen 128-130 öffnen
2. Alle 3 clamp()-Definitionen identifizieren
3. Eine konsistente Version auswählen oder neu schreiben:
   ```css
   /* OPTION A: Fix auf konsistent */
   width: clamp(240px, 34%, 500px);  /* min, ideal, max */
   
   /* OPTION B: Nur best-practice clamp */
   width: clamp(min(30vw, 240px), 34vw, min(40vw, 500px));
   ```
4. Orbit-Container testen (resizing 600px-1600px)
5. Commit: `fix: consolidate orbit-container clamp() definitions`

---

### P2.3 — DEF-L03: Mobile Media Query clamp()

**Defekt:** @media 600px mit hardcoded Breiten (280px, 140px)  
**Status:** Ausstehend  
**Dauer:** 25 min  
**Risiko:** Medium

#### Aufgabe
1. ESPOrbitalLayout.vue Zeilen 555-588 öffnen (@media query)
2. Alle hardcoded Breiten identifizieren (280px, 140px, etc.)
3. Ändern zu clamp():
   ```css
   /* VORHER */
   @media (max-width: 600px) {
     .sensor-container { width: 280px; }
   }
   
   /* NACHHER */
   @media (max-width: 600px) {
     .sensor-container { width: clamp(200px, 80vw, 280px); }
   }
   ```
4. Test: Mobile <600px, kein horizontales Scrolling
5. Commit: `fix: mobile media query use clamp() instead of hardcoded widths`

---

### P2.4 — DEF-L04: 1-col Fallback für Mobile Grid

**Defekt:** Mobile Grid mit >8 Sensoren bleibt 2-spaltig statt 1-spaltig  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Low

#### Aufgabe
1. ESPOrbitalLayout.vue Grid-Definition @media <600px
2. Update:
   ```css
   /* VORHER */
   @media (max-width: 600px) {
     grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
   }
   
   /* NACHHER */
   @media (max-width: 600px) {
     grid-template-columns: 1fr;  /* Always 1 column on mobile */
   }
   ```
3. Test: Mobile mit 10+ Sensoren -> nur 1 Spalte
4. Commit: `fix: mobile grid force 1 column layout <600px`

---

### P2.5 — DEF-L06: Subzone-Header truncate

**Defekt:** Zone-Name überläuft Header auf Mobile  
**Status:** Ausstehend  
**Dauer:** 10 min  
**Risiko:** Low

#### Aufgabe
1. ESPOrbitalLayout.vue Header-Row (Zone-Name Rendering)
2. Tailwind-Klasse hinzufügen:
   ```vue
   <!-- VORHER -->
   <h2 class="text-lg font-bold">{{ zoneName }}</h2>
   
   <!-- NACHHER -->
   <h2 class="text-lg font-bold truncate">{{ zoneName }}</h2>
   <!-- oder line-clamp für mehrere Zeilen -->
   <h2 class="text-lg font-bold line-clamp-2">{{ zoneName }}</h2>
   ```
3. Test: Mobile mit langem Zone-Namen
4. Commit: `fix: add truncate to subzone header on mobile`

---

### P2.6 — DEF-L07: Gaps responsive mit clamp()

**Defekt:** Gaps sind fixe rem-Werte (gap-4 = 16px überall)  
**Status:** Ausstehend  
**Dauer:** 30 min  
**Risiko:** Low

#### Aufgabe
1. Alle Container mit `gap-4` in ESPOrbitalLayout.vue + SensorCard.vue identifizieren
2. Für wichtigste (Grid-Container) CSS custom property oder clamp() nutzen:
   ```css
   /* OPTION A: CSS Custom Property */
   :root {
     --responsive-gap: clamp(8px, 2vw, 16px);
   }
   .grid {
     gap: var(--responsive-gap);
   }
   
   /* OPTION B: Inline */
   .grid {
     gap: clamp(8px, 2vw, 16px);
   }
   ```
3. Test auf Breakpoints: 320px, 600px, 1200px
4. Commit: `fix: make grid/flex gaps responsive with clamp()`

---

### P2.7 — DEF-S02: Quality-Status Stale != Warning

**Defekt:** "Stale" wird zu "Warning" collapsed  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Medium

#### Aufgabe
1. Pinia `sensor-store.ts` öffnen (Quality-Mapping oder SensorCard.vue computed)
2. Quality-Aggregation-Logik finden (z.B. `computed qualityBadge()`)
3. Update Mapping:
   ```typescript
   // VORHER (FALSCH)
   const qualityBadge = computed(() => {
     if (sensor.quality === 'Good') return { label: 'OK', color: 'green' };
     else return { label: 'Warning', color: 'yellow' };  // ← Stale fällt hier rein
   });
   
   // NACHHER (RICHTIG)
   const qualityBadge = computed(() => {
     if (sensor.quality === 'Good') return { label: 'OK', color: 'green' };
     if (sensor.quality === 'Stale') return { label: 'Stale', color: 'gray' };
     return { label: 'Error', color: 'red' };
   });
   ```
4. Test: Sensor mit Stale-Status -> zeigt "Stale" nicht "Warning"
5. Commit: `fix: differentiate quality status stale vs warning`

---

### P2.8 — DEF-S04: Value-Row Word-Wrap

**Defekt:** Große Zahlen + lange Units überläufen Card-Rand  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Low

#### Aufgabe
1. SensorCard.vue öffnen (Value-Row HTML/CSS)
2. Value-Flex-Container aktualisieren:
   ```vue
   <!-- VORHER -->
   <div class="flex items-center gap-1">
     <span class="font-bold">{{ value }}</span>
     <span class="text-sm">{{ unit }}</span>
   </div>
   
   <!-- NACHHER -->
   <div class="flex flex-wrap items-center gap-1">
     <span class="font-bold break-words">{{ value }}</span>
     <span class="text-sm">{{ unit }}</span>
   </div>
   ```
3. Test: Mobile mit großem Wert (12345.67 µS/cm)
4. Commit: `fix: add flex-wrap and break-words to sensor card value row`

---

### P2.9 — DEF-S05: Badge-Kompression auf Mobile

**Defekt:** 3+ Badges verschieben Value-Row auf Mobile  
**Status:** Ausstehend  
**Dauer:** 25 min  
**Risiko:** Low

#### Aufgabe
1. SensorCard.vue Badge-Row identifizieren
2. Option A: Badge-Collapse bei <250px:
   ```vue
   <div v-if="isMobile" class="flex gap-1 flex-wrap">
     <!-- Nur Hauptbadge anzeigen, Rest in Tooltip -->
     <badge>{{ mainBadge }}</badge>
     <span class="text-xs text-gray-500">+{{ otherBadgeCount }}</span>
   </div>
   <div v-else class="flex gap-1 flex-wrap">
     <!-- Alle Badges -->
   </div>
   ```
3. Oder Option B: Badge-Icons statt Text
4. Test: Mobile <250px mit Multi-Badge Sensor
5. Commit: `fix: collapse badges on mobile <250px or use icons`

---

### P2.10 — DEF-M01: Mock-Badge hinzufügen

**Defekt:** Mock-Sensoren ohne visuellen Unterscheidungs-Badge  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Low

#### Aufgabe
1. Mock-Sensor-Daten identifizieren (ob Flag `is_mock` oder `source: 'mock'` existiert)
2. Falls nicht, hinzufügen:
   ```typescript
   interface Sensor {
     id: string;
     name: string;
     is_mock?: boolean;  // ← Neu
     // ... other fields
   }
   ```
3. SensorCard.vue Badge-Section aktualisieren:
   ```vue
   <badge v-if="sensor.is_mock" class="bg-yellow-100 text-yellow-800">
     Mock
   </badge>
   ```
4. Test: Mock-Device laden, "Mock" Badge sichtbar
5. Commit: `feat: add is_mock flag and badge to sensor card`

---

## Phase 3: Architektur (Dauer: 1-2 Tage)

Feature-Implementierungen und tiefe Store-Änderungen. Erfordern Koordination zwischen Frontend/Backend, neue Handler.

### P3.1 — DEF-E02: Unit-Umrechnung µS/cm <-> mS/cm

**Defekt:** Keine Unit-Umrechnung für EC  
**Status:** Ausstehend  
**Dauer:** 1-2h  
**Risiko:** High Priority (Feature-Lücke)

#### Aufgabe
1. **Backend (Server):**
   - EC-Handler überprüfen (mqtt-handler oder sensor-service)
   - Unit-Konvertierungs-Logik hinzufügen
   - API-Endpoint: `POST /api/sensors/{id}/convert-unit?from=µS/cm&to=mS/cm`

2. **Frontend:**
   - Store erweitern: `ec_unit: 'µS/cm' | 'mS/cm' | 'ppm'` pro Sensor
   - Konvertierungs-Utility:
     ```typescript
     const convertEC = (value: number, from: Unit, to: Unit): number => {
       const toMicroSiemens = { 'µS/cm': 1, 'mS/cm': 1000, 'ppm': 1 }; // Simplified
       return value * toMicroSiemens[from] / toMicroSiemens[to];
     };
     ```
   - SensorCard: Unit-Selector hinzufügen (Dropdown oder Buttons)
   - persist in localStorage oder API

3. Test: EC-Wert in µS/cm laden, zu mS/cm umschalten, Wert korrekt konvertiert
4. Commit: `feat: add unit conversion for EC sensor (µS/cm mS/cm ppm)`

---

### P3.2 — DEF-L08: KPI-Grid Responsive Handling

**Defekt:** KPI-Grid kollabiert bei minmax(110px) in 200px Tile  
**Status:** Ausstehend  
**Dauer:** 20 min  
**Risiko:** Low (seltener Fall)

#### Aufgabe
1. ZoneTileCard.vue öffnen (KPI-Subgrid Definition)
2. Responsive Update:
   ```css
   /* VORHER */
   .kpi-grid {
     grid-template-columns: repeat(3, minmax(110px, 1fr));
   }
   
   /* NACHHER */
   @media (max-width: 300px) {
     .kpi-grid {
       grid-template-columns: repeat(2, minmax(90px, 1fr));
     }
   }
   @media (min-width: 300px) {
     .kpi-grid {
       grid-template-columns: repeat(3, minmax(110px, 1fr));
     }
   }
   ```
3. Test: Tile <300px -> 2 Spalten, >300px -> 3 Spalten
4. Commit: `fix: kpi-grid responsive at 300px breakpoint`

---

### P3.3 — DEF-S06: Quality-Aggregation: Main-Priority statt Worst-Case

**Defekt:** Multi-Wert Quality wird worst-case aggregiert  
**Status:** Ausstehend  
**Dauer:** 20 min  
**Risiko:** Medium

#### Aufgabe
1. `sensor-store.ts` öffnen (Quality-Aggregation-Logik)
2. Logik umschreiben:
   ```typescript
   // VORHER (FALSCH)
   const aggregateQuality = (values: SensorValue[]) => {
     return Math.max(...values.map(v => v.quality)); // worst wins
   };
   
   // NACHHER (RICHTIG)
   const aggregateQuality = (values: SensorValue[]) => {
     // Priorisiere Main-Wert, ignoriere Trend-Werte bei Quality-Check
     const mainQuality = values.find(v => v.type === 'main')?.quality || 'unknown';
     return mainQuality;
   };
   ```
3. Test: Sensor mit Main "Good", Min "Stale" -> zeigt "Good"
4. Commit: `fix: sensor quality prioritize main value over trend values`

---

### P3.4 — DEF-E03: Sparkline-Cache Robustheit

**Defekt:** Sparkline on_demand zeigt lueckenhafte Daten  
**Status:** Ausstehend  
**Dauer:** 45 min  
**Risiko:** Medium

#### Aufgabe
1. EC-Store oder Sparkline-Cache-Handler öffnen
2. Cache-Strategie überprüfen (bei on_demand Mode)
3. Option A: Vollständiger Buffer
   ```typescript
   const sparklineBuffer = ref<DataPoint[]>([]);
   
   const onMQTTData = (payload: SensorPayload) => {
     sparklineBuffer.value.push({
       timestamp: payload.timestamp,
       value: payload.value
     });
     // Älter als 24h entfernen
   };
   ```
4. Option B: Interpolation fehlender Punkte
   ```typescript
   const fillGaps = (data: DataPoint[]) => {
     // Wenn Lücke >5min, interpolieren
   };
   ```
5. Test: EC on_demand über 1h, Sparkline sollte kontinuierlich sein
6. Commit: `fix: sparkline cache robustness and data continuity`

---

### P3.5 — DEF-E04: Dynamic Chart Y-Achse

**Defekt:** Y-Achse hart-codiert 0-5000  
**Status:** Ausstehend  
**Dauer:** 20 min  
**Risiko:** Medium

#### Aufgabe
1. EC-Chart-Component öffnen (Y-Achse Config)
2. Auto-Skalierung implementieren:
   ```typescript
   const computeYAxisLimits = (data: number[]) => {
     const min = Math.min(...data);
     const max = Math.max(...data);
     return {
       min: Math.floor(min * 0.9),
       max: Math.ceil(max * 1.1)
     };
   };
   
   // In Chart-Config
   yAxis: {
     min: computeYAxisLimits(chartData).min,
     max: computeYAxisLimits(chartData).max
   }
   ```
3. Test: EC-Daten 1000-1500 -> Y-Achse skaliert auf ~900-1650
4. Commit: `fix: dynamic y-axis scaling for ec chart`

---

### P3.6 — DEF-D01: Stale-Detection mit last_read Timestamp

**Defekt:** Nur quality-basiert, last_read Alter nicht geprüft  
**Status:** Ausstehend  
**Dauer:** 20 min  
**Risiko:** High

#### Aufgabe
1. `sensor-store.ts` öffnen (Stale-Detection Computed)
2. Update:
   ```typescript
   const isStale = computed(() => {
     if (sensor.quality !== 'Good') return true;
     
     // Zusätzlich: prüfe last_read Alter
     const ageMs = Date.now() - sensor.last_read;
     const staleThresholdMs = 2 * 60 * 60 * 1000; // 2h
     
     return ageMs > staleThresholdMs;
   });
   ```
3. Test: Sensor mit Quality "Good" aber last_read >2h -> isStale = true
4. Commit: `fix: stale-detection includes last_read age check`

---

### P3.7 — DEF-M03: Stale vs. Snapshot visuelle Unterscheidung

**Defekt:** Stale und Snapshot-Mode sehen gleich aus  
**Status:** Ausstehend  
**Dauer:** 15 min  
**Risiko:** Low

#### Aufgabe
1. SensorCard.vue Status-Badge-Logik
2. Differentieren:
   ```vue
   <div v-if="isStale" class="flex gap-1 items-center">
     <icon-clock class="w-4 h-4 text-gray-500" />
     <span class="text-xs text-gray-500">Stale ({{ hoursAgo }}h)</span>
   </div>
   <div v-else-if="isSnapshot" class="flex gap-1 items-center">
     <icon-camera class="w-4 h-4 text-blue-500" />
     <span class="text-xs text-blue-500">Snapshot</span>
   </div>
   ```
3. Test: Stale-Sensor zeigt Clock-Icon, Snapshot-Sensor zeigt Camera-Icon
4. Commit: `feat: add visual icons to differentiate stale vs snapshot sensors`

---

## Implementierungs-Reihenfolge (Empfohlen)

Da viele P2-Fixes auf P1 basieren, folgende Reihenfolge empfohlen:

### Woche 1 (Montag-Mittwoch): Phase 1
1. **Montag:** P1.1 (formatValue), P1.2 (SensorSatellite), P1.3 (SparklineChart), P1.4 (Timestamp)
   - 4 PRs, alle <15min
   - Testing + Merge vor EOD

### Woche 1 (Mittwoch-Freitag): Phase 2
1. **Mittwoch:** P2.1-P2.5 (Layout-Fixes, clamp(), responsive)
   - 5 Fixes, 1 großer Refactor-PR
   - Responsive-Testing auf 5 Breakpoints
2. **Donnerstag:** P2.6-P2.10 (Quality, Gaps, Mock, Badges)
   - 5 Fixes, mehrere kleinere PRs
3. **Freitag:** Regression-Testing, Code-Review

### Woche 2 (Montag-Freitag): Phase 3
1. **Montag-Dienstag:** P3.1 (Unit-Konvertierung, Backend-Koordination)
2. **Mittwoch:** P3.2-P3.4 (KPI-Grid, Quality-Agg, Sparkline-Cache)
3. **Donnerstag:** P3.5-P3.7 (Chart-Skalierung, Stale-Detection, Icons)
4. **Freitag:** Integration-Testing, Allsystems-Go

---

## Teste-Szenarien (vor Commit)

Für JEDE Phase:

### Unit-Tests
- `formatValue()` mit Locale 'de-DE', Werte 999, 1000, 10000
- `computeYAxisLimits()` mit verschiedenen Datenbereichen
- `isStale` mit verschiedenen Altern (1h, 2h, 3h)

### Visual-Tests (Responsive)
- Viewport-Breiten: 320px, 480px, 600px, 900px, 1200px, 1600px
- Devices: iPhone SE, iPad, Laptop, Desktop 4K
- Sensoren: Mock + Real, Multi-Badge, große Zahlen, lange Unit-Namen

### Integration-Tests
- MQTT-Flow: null timestamp sollte abgelehnt werden
- Quality-Mapping: Stale vs. Warning unterschiedliche Badges
- Unit-Konvertierung: EC µS/cm -> mS/cm -> ppm und zurück

---

## Blockers & Abhängigkeiten

| Phase | Blocker | Impact | Mitigation |
|-------|---------|--------|-----------|
| P1 | Keine | Low | Parallel mit Phase 2 machbar |
| P2 | P1.1 (formatValue) | Low | P2.7 (Quality) abhängig von P1.4 |
| P2 | P1.4 (Timestamp) | Medium | P3.6 (Stale-Detection) braucht diese |
| P3 | Backend-Unit-API | High | Koordination mit Server-Team erforderlich (P3.1) |
| P3 | MQTT-Cache-Handler | Medium | P3.4 (Sparkline) braucht robusten Handler |

---

## Rollout-Plan

1. **Feature Branches:** Jede Phase als separater Branch (`phase-1-fixes`, `phase-2-layout`, `phase-3-arch`)
2. **Testing:** Acceptance-Tests vor Merge
3. **Deployment:** Phase 1 sofort, Phase 2 nach Regression-OK, Phase 3 in nächstem Sprint

---

**Gesamtdauer Schätzung:**
- Phase 1: 1-2h (4 Fixes)
- Phase 2: 4-8h (10 Fixes)
- Phase 3: 8h-2 Tage (7 Fixes + Backend-Koordination)
- **Total:** 10-12h + 1-2h Backend (abhängig)

**Nächster Schritt:** Linear-Issues erstellen aus Defektkatalog und Fixplan-Aufgaben tracken
