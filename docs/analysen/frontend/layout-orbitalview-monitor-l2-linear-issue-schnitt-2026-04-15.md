# Linear-Issue-Schnitt: Orbital View & Monitor (L2)
**Datum:** 2026-04-15  
**Format:** 12 Issues (Pflichtformat für Linear)  
**Board:** AutomationOne  
**Priorität-Mix:** 4x P0, 4x P1, 4x P2

---

## Issue-Cluster

1. **Layout-Responsiveness (3 Issues)** — #AUTO-LX-L01 bis #AUTO-LX-L03
2. **Sensor-Card-Datenkonsistenz (3 Issues)** — #AUTO-LX-S01 bis #AUTO-LX-S03
3. **EC-spezifisch (2 Issues)** — #AUTO-LX-E01 bis #AUTO-LX-E02
4. **Mock-Infrastruktur (2 Issues)** — #AUTO-LX-M01 bis #AUTO-LX-M02
5. **Regressionsschutz (1 Issue)** — #AUTO-LX-REG-01
6. **Datenpfad-Korrektionen (1 Issue)** — #AUTO-LX-D01

---

## Issue 1: Layout-Responsiveness Cluster

### Issue #AUTO-LX-L01
**Titel:** Card-Grid minmax zu klein bei 900-1366px Viewport

**Problem:**
- SensorCard-Inhalte überläufen bei Breiten 900-1100px
- Text bricht auf 2-3 Zeilen, Badges werden abgeschnitten
- Grund: `minmax(220px, 1fr)` + Gap (16px) + Padding (16px) = effektive Inhaltsbreite <180px

**Scope:**
- Datei: `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout.vue Grid-Definition)
- Component: ESPOrbitalLayout
- Breakpoint: 900-1100px

**Technische Ursache:**
```
minmax(220px, 1fr) + gap-4 (16px) + Card-Padding (16px)
= 220 + 16 + 16 = 252px für 1 Card + Spacing
Bei 900px Viewport: ~3.5 Cards passen, Breite wird zu eng
```

**Loesungsansatz:**
Erhöhe minmax auf `240px` oder nutze responsive `minmax(clamp(200px, 20vw, 240px), 1fr)`

**Akzeptanzkriterien:**
- [ ] Card-Text bricht nicht auf >2 Zeilen bei 900px Viewport
- [ ] Badges sind vollständig sichtbar bei 900-1100px
- [ ] Responsive-Test auf 5 Breakpoints: 320px, 600px, 900px, 1200px, 1600px
- [ ] Keine Regression bei Desktop (>1366px)

**Testfaelle:**
1. Viewport auf 950px setzen -> Card mit langem Namen (z.B. "pH-Sensor Gewächshaus Nord")
2. Erwartung: Text auf max 2 Zeilen, Badges sichtbar
3. Text nicht abgeschnitten

**Risiko:** Low  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 15 min  
**Prioritaet:** P1 (UX-Improvement)

---

### Issue #AUTO-LX-L02
**Titel:** Orbit-Radius schwankt zwischen 30%, 34%, 38% (3 clamp() Definitionen)

**Problem:**
- Zeilen 128-130 in ESPOrbitalLayout.vue enthalten 3 unterschiedliche `clamp()`-Definitionen
- Layout springt visuell beim Resizing
- Orbit-Container Größe ist instabil

**Scope:**
- Datei: `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout, Lines 128-130)
- Component: ESPOrbitalLayout (OrbitContainer)
- Breakpoint: 600px-1400px

**Technische Ursache:**
```css
L128: clamp(30vw, 30%, 38vw)
L129: clamp(34%, 34vw, 38vw)   ← Parameterordnung falsch (percentage vor vw)
L130: clamp(30vw, 38%, 40vw)
```
Unterschiedliche Parameter-Priorität erzeugt unterschiedliches Sizing bei verschiedenen Breiten.

**Loesungsansatz:**
Konsolidiere auf EINE Definition mit konsistenter clamp()-Syntax:
```css
width: clamp(240px, 34vw, 500px);  /* min, ideal, max */
```

**Akzeptanzkriterien:**
- [ ] Orbit-Radius ist stabil bei Resize von 600px auf 1400px
- [ ] Keine visuellen Sprünge oder Klicks beim Resizing
- [ ] Orbit-Größe ist linear mit Viewport (kein Treppenstufen-Effekt)

**Testfaelle:**
1. Browser-Fenster von 800px auf 1200px resizen (langsam)
2. Erwartung: Orbit-Container wächst/schrumpft smooth
3. Orbit springt nicht abrupt

**Risiko:** Medium  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 20 min  
**Prioritaet:** P0 (Stabilität)

---

### Issue #AUTO-LX-L03
**Titel:** Mobile Media Query nutzt hardcoded Breiten statt clamp()

**Problem:**
- @media (max-width: 600px) Block enthält hardcoded Breiten (280px, 140px)
- Sensor-Container überläuft auf Mobile, horizontales Scrolling notwendig
- Kein responsive clamp() Fallback

**Scope:**
- Datei: `El Frontend/src/views/HardwareView.vue` (ESPOrbitalLayout, Lines 555-588)
- Component: ESPOrbitalLayout (Mobile Media Query)
- Breakpoint: <600px

**Technische Ursache:**
```css
@media (max-width: 600px) {
  .sensor-container { width: 280px; }  /* ← Hardcoded, nicht responsive */
}
```
Bei z.B. 320px Viewport: 280px Container ist größer als verfügbare Breite.

**Loesungsansatz:**
Nutze clamp() in Media Query:
```css
@media (max-width: 600px) {
  .sensor-container { width: clamp(200px, 80vw, 280px); }
}
```

**Akzeptanzkriterien:**
- [ ] Kein horizontales Scrolling auf Mobile <600px
- [ ] Sensor-Container passt in Viewport-Breite
- [ ] Test auf 320px, 480px, 600px Breiten

**Testfaelle:**
1. Mobile-View öffnen <600px
2. Sensor-Orbita oder Grid beobachten
3. Keine Horizontal-Scrollbar
4. Inhalte vollständig sichtbar

**Risiko:** Medium  
**Abhaengigkeiten:** DEF-L02 sollte zuerst gefixt sein  
**Schaetzung:** 25 min  
**Prioritaet:** P1 (UX-Funktionalität)

---

## Issue 2: Sensor-Card-Datenkonsistenz Cluster

### Issue #AUTO-LX-S01
**Titel:** formatValue() zeigt "5000" statt "5.000" de-DE Locale

**Problem:**
- EC-Wert und andere numerische Werte zeigen keine Tausender-Trennung
- Englische Locale auch bei Browser-Locale de-DE
- Lesbarkeit bei Werten >999 schlecht

**Scope:**
- Datei: `El Frontend/src/utils/formatters.ts` oder `src/components/SensorCard.vue`
- Funktion: `formatValue()` oder SensorCard Value-Renderer
- Alle Sensoren (EC spezifisch kritisch)

**Technische Ursache:**
```typescript
// Aktuell (FALSCH)
export const formatValue = (value: number) => value.toString();
// Resultat: 5000 (en-US default)

// Sollte sein
export const formatValue = (value: number, locale: string = 'de-DE') => {
  return value.toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  });
};
// Resultat: 5.000
```

**Loesungsansatz:**
Nutze `Number.toLocaleString('de-DE')` mit passenden Fractional-Optionen.

**Akzeptanzkriterien:**
- [ ] Wert 5000 wird als "5.000" angezeigt (de-DE Locale)
- [ ] Wert 1234.567 wird als "1.234,57" angezeigt (2 Dezimalstellen)
- [ ] Unit bleibt unverändert hinter Wert

**Testfaelle:**
1. SensorCard mit EC-Sensor laden (Wert >999)
2. Erwartung: "5.000 µS/cm" statt "5000 µS/cm"
3. Dezimalwerte: "1.234,57" statt "1234.57"

**Risiko:** Low  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 10 min  
**Prioritaet:** P1 (UX-Lesbarkeit)

---

### Issue #AUTO-LX-S02
**Titel:** Quality-Status "Stale" wird zu "Warning" collapsed

**Problem:**
- Sensor mit stalen Daten zeigt "Warning" Badge statt "Stale"
- Nutzer verwechselt echte Fehler (Warning) mit fehlenden Updates (Stale)
- Semantik falsch

**Scope:**
- Datei: `El Frontend/src/stores/sensor-store.ts` oder `src/components/SensorCard.vue`
- Komponente: Quality-Mapping oder Badge-Logik
- Alle Sensoren mit quality-Flag

**Technische Ursache:**
```typescript
// Aktuell (FALSCH)
const qualityBadge = {
  'Good': { label: 'OK', color: 'green' },
  'Stale': { label: 'Warning', color: 'yellow' }  // ← Falsch
};

// Sollte sein
const qualityBadge = {
  'Good': { label: 'OK', color: 'green' },
  'Stale': { label: 'Stale', color: 'gray' },
  'Error': { label: 'Error', color: 'red' }
};
```

**Loesungsansatz:**
Erweitere Quality-Mapping um Stale als separate Status.

**Akzeptanzkriterien:**
- [ ] Stale-Sensor zeigt "Stale" Badge (grau), nicht "Warning" (rot)
- [ ] Error-Sensor zeigt "Error" Badge (rot)
- [ ] Good-Sensor zeigt "OK" Badge (grün)

**Testfaelle:**
1. Sensor mit quality='Stale' laden
2. Erwartung: Badge zeigt "Stale" nicht "Warning"
3. Farbe: grau, nicht rot

**Risiko:** Medium  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 15 min  
**Prioritaet:** P1 (Semantik)

---

### Issue #AUTO-LX-S03
**Titel:** SensorSatellite hardcoded px Font-Sizes nicht zoom-responsive

**Problem:**
- Zeilen 556, 574 in SensorSatellite.vue: `font-size: 10px`, `font-size: 8px`
- Bei Browser-Zoom (>100%) skaliert Text nicht mit
- Text bleibt klein und unlesbar

**Scope:**
- Datei: `El Frontend/src/components/SensorSatellite.vue` (Lines 556, 574)
- Component: SensorSatellite
- Inline-Styles mit px-Werten

**Technische Ursache:**
```html
<!-- Aktuell (FALSCH) -->
<span style="font-size: 10px">{{ value }}</span>  <!-- Zoom ignoriert px -->

<!-- Sollte sein -->
<span style="font-size: 0.625rem">{{ value }}</span>  <!-- Zoom respektiert rem -->
<!-- Oder Tailwind: -->
<span class="text-xs">{{ value }}</span>  <!-- text-xs = 0.75rem = 12px -->
```

**Loesungsansatz:**
Konvertiere px zu rem (10px = 0.625rem bei base 16px), oder nutze Tailwind-Klassen.

**Akzeptanzkriterien:**
- [ ] SensorSatellite Text skaliert bei Browser-Zoom auf 150%
- [ ] Font-Größe Verhältnis bleibt erhalten
- [ ] Keine Hard-codiert px Werte in Inline-Styles

**Testfaelle:**
1. SensorSatellite Component laden
2. Browser-Zoom auf Ctrl++ 150%
3. Erwartung: Text wächst mit, bleibt lesbar

**Risiko:** Low  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 10 min  
**Prioritaet:** P2 (Accessibility)

---

## Issue 3: EC-spezifisch Cluster

### Issue #AUTO-LX-E01
**Titel:** EC-Unit-Umrechnung nicht verfügbar (µS/cm -> mS/cm)

**Problem:**
- Feature-Lücke: User kann EC-Unit nicht wechseln
- Notwendig für Vergleich mit externen Datenquellen
- Typische Umrechnungen: µS/cm (Microsiemens) <-> mS/cm (Millisiemens) <-> ppm (Parts per Million)

**Scope:**
- Backend: EC-Handler oder Sensor-Service
- Frontend: `src/utils/formatters.ts` und SensorCard.vue
- EC-Sensoren spezifisch

**Technische Ursache:**
Kein Unit-Konvertierungs-Accessor. EC-Wert ist hart auf µS/cm gespeichert.

**Loesungsansatz:**
1. Backend: Unterstütze Unit-Konvertierung (Server oder Client-Side)
2. Frontend: SensorCard Unit-Selector-UI (Dropdown oder Buttons)
3. Speichere User-Pref in localStorage oder API

**Akzeptanzkriterien:**
- [ ] EC-Sensor zeigt Unit-Selector (Dropdown: µS/cm / mS/cm / ppm)
- [ ] Wert wird korrekt konvertiert (z.B. 1000 µS/cm = 1.0 mS/cm)
- [ ] User-Pref wird gespeichert
- [ ] Konvertierung bidirektional (forwards/backwards)

**Testfaelle:**
1. EC-Sensor öffnen (Wert 1000 µS/cm)
2. Unit zu mS/cm wechseln
3. Erwartung: Wert zeigt 1.0 mS/cm
4. Zur µS/cm zurückwechseln: 1000 µS/cm

**Risiko:** High (Feature-Lücke)  
**Abhaengigkeiten:** DEF-S01 (formatValue) sollte zuerst gefixt sein  
**Schaetzung:** 1-2h  
**Prioritaet:** P0 (Feature-Anforderung)

---

### Issue #AUTO-LX-E02
**Titel:** EC Chart Y-Achse dynamic skalieren (statt 0-5000 fix)

**Problem:**
- Y-Achse ist hart auf 0-5000 µS/cm codiert
- Bei Werten 1000-1500 (typisch): Grafik ist flach, nur 30% der Höhe genutzt
- Detail-Auflösung und Lesbarkeit schlecht

**Scope:**
- Datei: EC-Chart-Component oder Dashboard-Config
- Component: SparklineChart oder äquivalent (EC-spezifisch)
- Y-Achse Definition

**Technische Ursache:**
```javascript
// Aktuell (FALSCH)
yAxis: {
  min: 0,
  max: 5000  // ← Hardcoded
}
// Bei Daten 1000-1500: Nutzung nur 30% der Grafik-Höhe

// Sollte sein
const yMin = Math.min(...data) * 0.9;
const yMax = Math.max(...data) * 1.1;
yAxis: {
  min: yMin,
  max: yMax
}
```

**Loesungsansatz:**
Implementiere auto-scaling: Y-Achse basierend auf min/max der tatsächlichen Daten.

**Akzeptanzkriterien:**
- [ ] Y-Achse passt sich an Datenbreich an (auto-scale)
- [ ] Daten nutzen 80-90% der Grafik-Höhe
- [ ] Min/Max Werte sichtbar
- [ ] Keine Clipping bei Extremwerten

**Testfaelle:**
1. EC-Chart mit Werten 1000-1500 öffnen
2. Erwartung: Y-Achse ca. 900-1650 (nicht 0-5000)
3. Grafik füllt 80%+ der Höhe
4. Mit Werten 100-500: Y-Achse passt sich an

**Risiko:** Medium  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 20 min  
**Prioritaet:** P1 (Visualisierung)

---

## Issue 4: Mock-Infrastruktur Cluster

### Issue #AUTO-LX-M01
**Titel:** Mock-Sensoren ohne visuellen Unterscheidungs-Badge

**Problem:**
- Mock-Daten sind visuell identisch mit echten Sensoren
- User/Tester kann nicht erkennen, ob echte oder Mock-Daten sichtbar sind
- Verwechslungsgefahr bei Test-Sessions

**Scope:**
- Frontend: Mock-Sensor-Flag und SensorCard.vue Badge-Rendering
- Alle Sensoren im Mock-Mode
- UI-Ebene

**Technische Ursache:**
Sensor-Objekt hat kein `is_mock` Flag, oder SensorCard prüft nicht darauf.

**Loesungsansatz:**
1. Sensor-Schema: `is_mock?: boolean` hinzufügen
2. SensorCard.vue: Badge rendern wenn `is_mock === true`

**Akzeptanzkriterien:**
- [ ] Mock-Sensor zeigt "Mock" Badge (z.B. Orange/Gelb)
- [ ] Real-Sensor zeigt kein "Mock" Badge
- [ ] Badge ist prominent sichtbar
- [ ] Works auf Desktop und Mobile

**Testfaelle:**
1. Mock-Device mit Mock-Sensoren laden
2. Erwartung: Alle Cards zeigen "Mock" Badge
3. Real-Device laden: Kein "Mock" Badge

**Risiko:** Medium  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 15 min  
**Prioritaet:** P1 (Tester-UX)

---

### Issue #AUTO-LX-M02
**Titel:** SparklineChart wirft Runtime-Error bei undefined Daten

**Problem:**
- Sensor ohne Sparkline-Daten oder null sparkline
- Chart-Component wirft JS-Error oder zeigt blank
- View kann zerstört werden

**Scope:**
- Datei: `El Frontend/src/components/SparklineChart.vue` (oder äquivalent)
- Component: SparklineChart
- Props-Validierung und Render-Guards

**Technische Ursache:**
```typescript
// Aktuell (FALSCH)
const ChartComponent = (props: { data: number[] }) => {
  const length = props.data.length;  // ← Crash wenn data === undefined
};

// Sollte sein
const ChartComponent = (props: { data?: number[] }) => {
  if (!props.data || props.data.length === 0) return <div>Keine Daten</div>;
  // ...
};
```

**Loesungsansatz:**
Null-Check hinzufügen, graceful fallback für leere Sparkline.

**Akzeptanzkriterien:**
- [ ] Kein JS-Error wenn sparkline undefined
- [ ] Fallback-UI zeigt "Keine Daten" oder ähnlich
- [ ] Console-Logs sind sauber (keine Warnungen)
- [ ] View bleibt stabil

**Testfaelle:**
1. Sensor mit `sparkline: null` laden
2. Erwartung: Fallback-UI statt Error
3. Console sollte keine Errors zeigen

**Risiko:** High (Runtime-Error)  
**Abhaengigkeiten:** Keine  
**Schaetzung:** 10 min  
**Prioritaet:** P0 (Stabilität)

---

## Issue 5: Regressionsschutz

### Issue #AUTO-LX-REG-01
**Titel:** Frontend Unit-Tests für Layout-Fixes (Regression-Prevention)

**Problem:**
- Nach Layout-Fixes könnte Regression entstehen
- Keine automatisierte Tests für Responsive-Breakpoints
- Manuelle Testing ist zeitaufwändig und fehleranfällig

**Scope:**
- Test-Framework: Vitest (oder jest)
- Coverage: ESPOrbitalLayout, SensorCard, formatValue, Quality-Mapping
- Breakpoints: 320px, 480px, 600px, 900px, 1200px, 1600px

**Technische Ursache:**
Tests fehlen für kritische Komponenten.

**Loesungsansatz:**
1. Unit-Tests schreiben für:
   - `formatValue(5000, 'de-DE')` === '5.000'
   - `isStale()` mit last_read Alter
   - Quality-Mapping (Stale vs. Warning)
2. Visual-Regression-Tests (optional mit Playwright/Cypress)
3. CI/CD Integration

**Akzeptanzkriterien:**
- [ ] Unit-Tests für formatValue, Quality-Mapping, isStale
- [ ] Test-Coverage >80% für betroffene Komponenten
- [ ] Tests laufen in CI/CD
- [ ] Keine regressions nach Phase 1-3 Fixes

**Testfaelle:**
1. Test: `expect(formatValue(1000, 'de-DE')).toBe('1.000')`
2. Test: `expect(isStale(Date.now() - 2h + 1min)).toBe(true)`
3. Test: `expect(qualityBadge['Stale']).toEqual({ label: 'Stale', color: 'gray' })`

**Risiko:** Low (Prevention)  
**Abhaengigkeiten:** Phase 1-3 sollten zuerst durchgeführt sein  
**Schaetzung:** 1-2h  
**Prioritaet:** P2 (Quality-Assurance)

---

## Issue 6: Datenpfad-Korrektionen

### Issue #AUTO-LX-D01
**Titel:** Stale-Detection mit last_read Timestamp Age Check

**Problem:**
- Stale-Detection prüft nur Quality-Flag
- `last_read` Alter wird ignoriert
- Sensor mit Quality "Good" aber last_read >2h als "aktuell" markiert
- Gefährlich: User vertraut falschen Daten

**Scope:**
- Frontend: `src/stores/sensor-store.ts` (Stale-Detection Computed)
- Oder Backend: API Stale-Flag
- Alle Sensoren

**Technische Ursache:**
```typescript
// Aktuell (FALSCH)
const isStale = computed(() => sensor.quality !== 'Good');
// Ignoriert last_read Alter!

// Sollte sein
const isStale = computed(() => {
  if (sensor.quality !== 'Good') return true;
  
  const ageMs = Date.now() - sensor.last_read;
  const staleThresholdMs = 2 * 60 * 60 * 1000; // 2h
  
  return ageMs > staleThresholdMs;
});
```

**Loesungsansatz:**
Erweitere Stale-Detection um last_read Age-Check (Threshold: 2 Stunden).

**Akzeptanzkriterien:**
- [ ] Sensor mit Quality "Good" aber last_read >2h zeigt isStale = true
- [ ] Sensor mit Quality "Error" zeigt isStale = true (unabhängig last_read)
- [ ] Stale-Badge wird angezeigt
- [ ] last_read Alter wird geloggt/angezeigt

**Testfaelle:**
1. Sensor mit Quality "Good", last_read 2.5h alt laden
2. Erwartung: isStale = true, "Stale" Badge angezeigt
3. Sensor mit Quality "Good", last_read 1h alt: isStale = false

**Risiko:** High (Datentrust)  
**Abhaengigkeiten:** DEF-S02 (Quality-Mapping) sollte zuerst gefixt sein  
**Schaetzung:** 20 min  
**Prioritaet:** P0 (Kritische Korrektur)

---

## Linear-Import-Format

Für schnellere Integration in Linear, hier die komprimierte Struktur pro Issue:

```
TITEL: [Kurztitel]
PROBLEM: [1-2 Sätze]
SCOPE: [Datei + Komponente]
URSACHE: [Technisch]
LÖSUNG: [Ansatz]
ACCEPTANCE: [3-4 Checkboxen]
TEST: [2-3 Schritte]
RISIKO: [Low/Medium/High]
ABHÄNGIGKEITEN: [Ja/Nein]
SCHÄTZUNG: [Zeit]
PRIORITÄT: [P0/P1/P2]
```

---

## Zusammenfassung

| Issue | Typ | Risiko | Zeit | Priorität |
|-------|-----|--------|------|-----------|
| #AUTO-LX-L01 | Layout | Low | 15m | P1 |
| #AUTO-LX-L02 | Layout | Medium | 20m | P0 |
| #AUTO-LX-L03 | Layout | Medium | 25m | P1 |
| #AUTO-LX-S01 | Data | Low | 10m | P1 |
| #AUTO-LX-S02 | Data | Medium | 15m | P1 |
| #AUTO-LX-S03 | Access | Low | 10m | P2 |
| #AUTO-LX-E01 | Feature | High | 1-2h | P0 |
| #AUTO-LX-E02 | Visual | Medium | 20m | P1 |
| #AUTO-LX-M01 | UX | Medium | 15m | P1 |
| #AUTO-LX-M02 | Stability | High | 10m | P0 |
| #AUTO-LX-REG-01 | Testing | Low | 1-2h | P2 |
| #AUTO-LX-D01 | Critical | High | 20m | P0 |

**Gesamt:** 12 Issues, 4h-6h ohne Backend-Koordination

---

**Nächster Schritt:** Diese 12 Issues in Linear als Tickets erstellen, dann Phase-Workflow durcharbeiten.
