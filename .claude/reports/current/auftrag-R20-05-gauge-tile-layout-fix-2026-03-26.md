# Auftrag R20-05 — Gauge-Zahl-Ueberlappung in ZoneTile compact-Modus beheben

**Typ:** Bugfix — Frontend / CSS Layout
**Schwere:** MEDIUM
**Erstellt:** 2026-03-26 (ueberarbeitet nach Plan-Verifikation)
**Ziel-Agent:** frontend-dev

---

## Kontext

In der MonitorView Level 1 zeigt jede ZoneTileCard Mini-Widgets (Gauge, SensorCard). Diese
werden ueber `InlineDashboardPanel` mit `compact`-Prop gerendert. Die erlaubten Typen in
Kacheln sind `gauge` und `sensor-card` (`TILE_ALLOWED_WIDGET_TYPES` in MonitorView.vue:934).

Die Container-Hoehe im compact-Modus betraegt **70px** (`ROW_HEIGHT_COMPACT = 70` in
InlineDashboardPanel.vue:61). Das ist deutlich weniger als ein normaler Gauge braucht.

Das Gauge-Widget nutzt intern einen **Doughnut-Chart (Chart.js 4.x via vue-chartjs)** als
Gauge-Bogen. Der aktuelle Messwert wird per **CSS-Overlay** positioniert (`<div class="gauge-chart__value">`
mit `position: absolute; bottom: 4px` in GaugeChart.vue:168). Es gibt **kein** Chart.js Plugin
fuer den Center-Text.

---

## IST-Zustand (Problem)

Im compact-Modus (70px Container) wird der Gauge-Inhalt abgeschnitten oder ueberlappt. Die
Ursachen im Detail:

### Platzbudget-Rechnung (70px Container)

| Element | Hoehe | Quelle |
|---------|-------|--------|
| Container gesamt | 70px | `ROW_HEIGHT_COMPACT` (InlineDashboardPanel.vue:61) |
| Canvas bei size='sm' | 48px | `sizePixels = 80`, `height = sizePixels * 0.6` (GaugeChart.vue) |
| Value-Overlay (.gauge-chart__value) | ~18px | `position: absolute; bottom: 4px` (GaugeChart.vue:168) |
| Range-Labels (.gauge-chart__range) | ~14px | Min/Max-Werte unter dem Gauge (GaugeChart.vue:172-175) |
| **Summe benoetigt** | **~80px** | Canvas + Value + Range |
| **Verfuegbar** | **~60-65px** | 70px minus Padding/Borders |

**Ergebnis:** ~15-20px Defizit. Die `.inline-dashboard__cell` (Zeile 303) und
`.inline-dashboard__mount` (Zeile 312) haben beide `overflow: hidden` — der ueberschuessige
Inhalt wird **abgeschnitten**, nicht gescrollt.

### Size-System in GaugeWidget

GaugeWidget nutzt einen **ResizeObserver** (GaugeWidget.vue:124-133), der bei `height < 90px`
auf `size='sm'` schaltet. Im 70px-Container wird also immer `size='sm'` aktiv. GaugeChart
bekommt dieses size-Prop und rendert mit `sizePixels = 80` (Breite) und `height = 48px`.

**Kein compact-Prop:** InlineDashboardPanel gibt das `compact`-Prop **nicht** an die Widgets
weiter. Es wird nur intern fuer CSS-Klassen und Header-Visibility genutzt. Die Size-Erkennung
laeuft ausschliesslich ueber den ResizeObserver.

---

## SOLL-Zustand

- Der aktuelle Wert (z.B. "19.3") und die Einheit (z.B. "°C") sind vollstaendig lesbar
  innerhalb des 70px-Containers.
- Gauge-Bogen und Zahlenwert haben klare visuelle Trennung.
- Kein abgeschnittener Text, kein Overflow, keine Scrollbar.
- Das Layout funktioniert stabil bei allen ZoneTile-Groessen in MonitorView L1.
- Die normale Gauge-Darstellung (nicht compact, im CustomDashboardView/Editor) bleibt
  **unveraendert**.

---

## Betroffene Dateien

Alle Pfade relativ zu `El Frontend/src/`:

| Datei | Rolle | Was aendern |
|-------|-------|-------------|
| `components/charts/GaugeChart.vue` | Gauge-Rendering (Doughnut + CSS-Overlay) | Size='sm' Anpassungen: Range ausblenden, Value-Text verkleinern, Canvas-Hoehe optimieren |
| `components/dashboard-widgets/GaugeWidget.vue` | Widget-Wrapper mit ResizeObserver | Ggf. size-Schwellwerte anpassen |
| `components/dashboard/InlineDashboardPanel.vue` | Kachel-Container, ROW_HEIGHT_COMPACT | Ggf. ROW_HEIGHT_COMPACT erhoehen (Option B) |
| `components/monitor/ZoneTileCard.vue` | ZoneTile-Komponente | Pruefe ob extra-Slot CSS das Problem verschaerft |

---

## Loesungsansaetze (pruefen in dieser Reihenfolge)

### Ansatz A — GaugeChart size='sm' optimieren (Hauptansatz)

Bei `size='sm'` den vertikalen Platzbedarf unter 65px bringen:

**A1: Range-Labels ausblenden bei size='sm'**
Die `.gauge-chart__range` Zeile (Min/Max-Werte, GaugeChart.vue:172-175) zeigt z.B. "-40" und
"125" unter dem Gauge. Im 70px-Container brauchen diese ~14px die nicht vorhanden sind.

```html
<!-- GaugeChart.vue Template -->
<div v-if="size !== 'sm'" class="gauge-chart__range">
  <span>{{ min }}</span>
  <span>{{ max }}</span>
</div>
```

Oder per CSS:
```css
.gauge-chart--sm .gauge-chart__range {
  display: none;
}
```

**Gewinn: ~14px** — allein das koennte reichen.

**A2: Value-Text verkleinern bei size='sm'**
Die `.gauge-chart__value` font-size reduzieren:

```css
.gauge-chart--sm .gauge-chart__value {
  font-size: 12px;   /* statt 16-18px */
  bottom: 2px;       /* statt 4px, naeher am unteren Rand */
}
```

**Gewinn: ~4-6px** zusaetzlich.

**A3: Canvas-Hoehe anpassen bei size='sm'**
Statt `height = sizePixels * 0.6` (= 48px) den Faktor erhoehen:

```javascript
// GaugeChart.vue — bei size='sm'
const height = sizePixels * 0.55  // = 44px statt 48px
```

Oder `sizePixels` von 80 auf 70 reduzieren → `height = 42px`.

**A4: Cutout-Prozent erhoehen bei size='sm'**
Mehr Platz in der Gauge-Mitte fuer den Value-Text:

```javascript
cutout: props.size === 'sm' ? '72%' : '60%'
```

### Ansatz B — ROW_HEIGHT_COMPACT erhoehen (Alternative)

Falls Ansatz A visuell nicht befriedigend ist: `ROW_HEIGHT_COMPACT` von 70 auf 85-90px
erhoehen (InlineDashboardPanel.vue:61). Das gibt allen compact-Widgets mehr Platz.

**Vorteil:** Einfachste Aenderung, loest das Problem fuer alle Widget-Typen.
**Nachteil:** Aendert das Layout aller ZoneTiles — visuell pruefen ob die Kacheln dann zu
gross werden. Die ZoneTileCard-Proportionen muessen stimmen.

### Ansatz C — overflow: hidden lockern (Vorsichtig)

In InlineDashboardPanel.vue haben `.inline-dashboard__cell` (Zeile 303) und
`.inline-dashboard__mount` (Zeile 312) beide `overflow: hidden`. Falls nur der Gauge-Text
minimal uebersteht, koennte `overflow: visible` auf `.inline-dashboard__mount` das Symptom
beheben — aber NUR wenn das keinen visuellen Muell bei anderen Widgets erzeugt.

**Nur als letzter Fallback** — bevorzuge Ansatz A.

---

## Design-Token-Hinweise

- Schriftgroessen: `--text-xs` = 11px (Minimum fuer Tokens), `--text-sm` = 13px
- Werte unter 11px (z.B. 10px fuer Badges) sind bewusst hardcoded — kein Token noetig
- Fuer size='sm' Gauge-Text sind 10-12px hardcoded akzeptabel
- Abstaende: `--space-1` = 4px (kleinstes Token). Kein `--space-px`-Token
- Kein `--ao-*`-Prefix — semantische Prefixes (`--color-*`, `--glass-*`, `--space-*`, etc.)

---

## Einschraenkungen — Was NICHT geaendert werden darf

- TILE_ALLOWED_WIDGET_TYPES (`gauge`, `sensor-card`) bleibt unveraendert.
- Die Gauge-Implementierung bleibt **Doughnut-basiert (Chart.js)** — kein Wechsel zu SVG.
- Die normale Gauge-Darstellung (nicht size='sm', im CustomDashboardView/Editor) darf durch
  diesen Fix **NICHT veraendert** werden. Alle Aenderungen muessen auf `size='sm'` oder den
  compact-Kontext beschraenkt sein.
- `maintainAspectRatio: false` ist bereits gesetzt (GaugeChart.vue:127) — nicht anfassen.
- Keine neuen npm-Pakete installieren.

---

## Akzeptanzkriterien

1. **Keine Abschneidung:** Im MonitorView L1 ZoneTile zeigt der Gauge den Zahlenwert
   vollstaendig lesbar — kein Text wird durch `overflow: hidden` abgeschnitten.
2. **Normaler Modus unveraendert:** Im CustomDashboardView (voller Gauge, nicht compact)
   sieht der Gauge identisch aus wie vor dem Fix.
3. **Kein Overflow:** Der Widget-Container in ZoneTileCard zeigt keine Scrollbar und keinen
   sichtbaren Inhalt-Overflow.
4. **TypeScript-Compile:** `vue-tsc --noEmit` laeuft ohne neue Fehler.
5. **Visuell stabil:** Bei unterschiedlichen Zahlenwerten (einstellig "7", mehrstellig "23.4",
   dreistellig "100") und verschiedenen Einheiten ("°C", "%RH", "pH", "hPa") bleibt das
   Layout innerhalb des 70px-Containers stabil.

---

## Empfohlene Vorgehensweise

1. **GaugeChart.vue oeffnen** (`El Frontend/src/components/charts/GaugeChart.vue`) —
   bei `size='sm'`: `.gauge-chart__range` (Min/Max Labels, Zeile 172-175) ausblenden (Ansatz A1).
2. **Visuell testen** im Browser (MonitorView L1, ZoneTile mit Gauge) — reicht das?
3. Falls nein: **Value-Text verkleinern** bei size='sm' (Ansatz A2) und/oder Canvas-Hoehe
   reduzieren (Ansatz A3).
4. Falls das Layout insgesamt zu eng wirkt: **ROW_HEIGHT_COMPACT** erhoehen (Ansatz B) und
   Gesamteindruck der ZoneTiles visuell pruefen.
5. Nach jedem Schritt: Normalen Gauge-Modus im Editor verifizieren (keine Regression).

---

> Erstellt von: automation-experte Agent, ueberarbeitet nach Plan-Verifikation
> Roadmap-Referenz: R20-05 in `roadmap-R20-bugfix-konsolidierung-2026-03-26.md`
> Verwandter Bug: R20-08 (Gauge Alert-Schwellwerte) — separat, niedrigere Prio
