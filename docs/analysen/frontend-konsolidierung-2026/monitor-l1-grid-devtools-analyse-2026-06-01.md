# MonitorView L1 — Zone-Tile-Grid DevTools-Analyse (AUT-587)

**Datum:** 2026-06-01  
**Umgebung:** dev-local, Docker (`localhost:5173` Frontend, `localhost:8000` API)  
**Methode:** Playwright (Computed-Styles + `getBoundingClientRect`), manuell äquivalent zu Chrome DevTools Elements/Computed + Device Toolbar  
**Testdaten:** 2 Zonen — „Testzone ESP 32 S3“ (3 KPIs, keine Regeln), „Testzone esp32 DEV“ (2 KPIs, Regeln-Block, Zoneinsight 24h geladen)  
**Screenshot:** `monitor-l1-1280-aut587.png` (Viewport 1280×900)

**Bezug:** [AUT-232](https://linear.app/autoone/issue/AUT-232) SI-Inventar (F2 Chart-Höhen, F3/F4 Icon/Space hardcoded px) — Einordnung in Abschnitt Problem 5.

---

## Messwerte-Tabelle (Responsive)

| Viewport | Ziel (Issue) | `grid-template-columns` (Computed) | Spalten | Kachel-Breite (px) | Grid-Breite (px) | Overflow-X | Anmerkung |
|----------|--------------|-------------------------------------|---------|-------------------|------------------|------------|-----------|
| 375 | 1 Spalte, 100 % | `333px` | 1 | 333 | 333 | nein | Kacheln gestapelt; Höhen 425 / 438 px |
| 768 | 1–2 Spalten | `470px` | 1 | 470 | 470 | nein | Weiterhin 1 Spalte (Breakpoint 1024px greift nicht) |
| 1280 | 2–3 Spalten, kein Leerraum rechts | `488px 488px` | 2 | 488 / 488 | 992 (= Main 100 %) | nein | **Höhen 274 vs 363 px** in einer Zeile; **361 px ungenutzter Viewport unterhalb des Grids** |
| 1920 | 3–4 Spalten, Kacheln wachsen | `533.328px 533.336px 533.328px` | 3 definiert, **2 Kacheln** | 533 / 533 | 1632 | nein | **Leere 3. Spalte ~533 px**; Kacheln wachsen nicht über 2-Spalten-Logik hinaus sinnvoll |

**Gemeinsame Grid-Computed-Werte (alle Viewports):**

- `display: grid`
- `gap: 16px` (`var(--space-4)`)
- `align-items: start` (explizit gesetzt)
- `justify-items: normal`
- `max-width: 100%`
- `grid-template-rows`: auto (z. B. bei 1280: eine Zeile `362.5px`)

**Kachel `.monitor-zone-tile` (1280 px):**

- `width: 100%` (innerhalb Grid-Zelle → 488 px)
- `align-self: auto` (erbt `start` vom Grid → **kein Stretch**)
- `min-width: 0` (via `:deep` in MonitorView)
- `min-height: auto`
- Kein `max-width` auf der Kachel

---

## Hardcoded-px-Inventar (L1-relevant)

### `ZoneTileCard.vue` (scoped)

| Wert | Selektor / Kontext | AUT-232-Bezug |
|------|-------------------|---------------|
| `18px` × `18px` | `.monitor-zone-tile__editor-icon` | F3/F4 Icons |
| `44px` | `.monitor-zone-tile__editor` min-width/height | WCAG Touch (OK) |
| `64px` | `.monitor-zone-tile__kpi` min-height | interne KPI-Höhe |
| `110px` | `.monitor-zone-tile__kpis` `minmax(110px, 1fr)` | KPI-Zeilen-Grid |
| `22px` / `18px` | `.monitor-zone-tile__rules-count` | Badge |
| `12px` | `.monitor-zone-tile__rule` padding-left calc | Bullet-Einzug |
| `3px` | border-left Akzent | — |
| `900px` / `560px` | Media Queries KPI-Spalten | eigene Breakpoints |
| `2px` | hover `translateY` | — |

**Nicht in ZoneTileCard (AUT-232 F2):** Chart-Höhen `160px` / `300px` liegen in `MonitorView.vue` (L2 Detail) bzw. `InlineDashboardPanel.vue` (`ROW_HEIGHT_*` 70/80/120 px) — **nicht ursächlich für L1-Grid-Leerraum**, aber für Folge-Fixes bei Mini-Widgets in `#extra`.

### `ZoneTileInsightBlock.vue`

| Wert | Kontext |
|------|---------|
| `14px` × `14px` | `.zone-tile-insight__spinner` |

### `MonitorView.vue` (Grid + Filter)

| Wert | Kontext |
|------|---------|
| `1024px` / `1600px` | Media Queries `.monitor-zone-grid` feste Spaltenanzahl |
| `10px` / `14px` | `.monitor-zone-filter__icon` left/width/height |
| `300px` | `.monitor-layout--has-side` Side-Panel-Spalte (nicht L1 aktiv gemessen) |

---

## Problem 1 — Massiver Leerraum: Grid füllt Viewport nicht

**Ist (gemessen):**

- Horizontal 1280 px: Grid nutzt **100 %** der Main-Spalte (992 px nach Sidebar), kein rechter Rand innerhalb Main.
- Vertikal 1280×900: Grid endet bei **y ≈ 537**, **361 px** schwarzer/leerer Bereich unterhalb (`window.innerHeight - grid.bottom`).
- 1920 px: **3 gleich breite Spalten**, nur **2 Kacheln** → dritte Spalte bleibt leer (~533 px).
- Kacheln kleben optisch oben links in der Content-Fläche; Inhalt füllt **~40 %** der Viewporthöhe (Issue-Screenshot bestätigt).

**Ursache (Code):**

```3134:3155:El Frontend/src/views/MonitorView.vue
.monitor-zone-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  ...
}
@media (min-width: 1024px) {
  .monitor-zone-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 1600px) {
  .monitor-zone-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
```

- Feste Spaltenzahl (`repeat(N, 1fr)`) statt `repeat(auto-fit, minmax(MIN, 1fr))` → bei wenigen Zonen entstehen **Geister-Spalten** (1920 px).
- `align-items: start` + inhaltsbedingte Kachelhöhe → Grid-Zeile nur so hoch wie die höchste Kachel, **kein vertikales Füllen** des Viewports (erwartbar; kein Bug an sich, aber verstärkt „leer unten“).
- Kein `max-width` auf Kacheln — Breitenproblem ist Spaltenanzahl, nicht Kappen.

**Vorschlag:**

- In `MonitorView.vue` `.monitor-zone-grid`:  
  `grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));`  
  (MIN nach DevTools: 320–380 px; 360 px Kompromiss für Zoneinsight + 3 KPIs)
- Media Queries 1024/1600 entfernen oder nur als `max()`-Fallback.
- Optional: `width: 100%` beibehalten; **kein** neues Wrapper-Element.

**Ohne neues Element lösbar:** **ja** (reine CSS-Anpassung am bestehenden Grid).

---

## Problem 2 — Ungleiche Kachelhöhen

**Ist (gemessen @ 1280 px):**

| Zone | Höhe (px) | Regeln-Block |
|------|-----------|--------------|
| Testzone ESP 32 S3 | 274–276 | nicht im DOM |
| Testzone esp32 DEV | 363–365 | ja, ~77 px |

- Grid: `align-items: start`
- Kacheln: `align-self: auto`, `height` inhaltsabhängig

**Ursache (Code):**

- `align-items: start` in `.monitor-zone-grid` (s. oben) verhindert CSS-Grid-Stretch in der Zeile.
- Zusätzlicher Inhalt: `.monitor-zone-tile__rules-summary` nur bei `totalRuleCount > 0` (`v-if`, `ZoneTileCard.vue` Z.141–158).
- Footer hat `margin-top: auto` (Z.439–446), wirkt erst bei **gleicher Flex-Höhe** der Kachel — mit `start` bleiben Kacheln unterschiedlich hoch.

**Vorschlag:**

1. `.monitor-zone-grid { align-items: stretch; }` (Default nutzen).
2. `.monitor-zone-tile` bleibt `display: flex; flex-direction: column` — Footer klebt unten.
3. Regeln: `v-if` → `v-show` mit `min-height` auf **bestehendem** `.monitor-zone-tile__rules-summary` (z. B. `min-height: 77px`) wenn `totalRuleCount === 0` unsichtbar aber platzreservierend — **ohne** neues DOM, nur Template/CSS am vorhandenen Block.

**Ohne neues Element lösbar:** **ja** (Grid `stretch` + optional `v-show`/min-height am bestehenden Regeln-Container).

---

## Problem 3 — Inkonsistente Inhaltszusammensetzung (KPI / Regeln)

**Ist (gemessen):**

| Zone | KPI-Elemente | `.monitor-zone-tile__kpis` | Regeln |
|------|--------------|----------------------------|--------|
| ESP 32 S3 | 3 | `display: grid`, `min-height: auto` | **nicht im DOM** (`v-if`) |
| esp32 DEV | 2 | gleich | `display: flex`, Höhe **77 px** |

- KPI-Anzahl kommt aus `zone.aggregation.sensorTypes` (`useZoneKPIs` / `aggregateZoneSensors`) — fachlich korrekt unterschiedlich.
- Regeln-Block: `v-if="totalRuleCount > 0"` — kein versteckter Platzhalter.

**Ursache (Code):**

- `ZoneTileCard.vue` Z.111–135 (dynamische KPI-`v-for`), Z.141 (`v-if` Regeln).
- `#extra`-Slot in `MonitorView.vue` (Zoneinsight + optionales `InlineDashboardPanel`) addiert weitere variable Höhe.

**Vorschlag:**

- **KPI-Zeile:** `min-height` auf bestehendem `.monitor-zone-tile__kpis` anhand maximaler Spaltenzahl (z. B. 3 Zeilen à KPI `min-height: 64px` + gap) — stabilisiert ohne Dummy-KPIs.
- **Regeln:** siehe Problem 2 (`v-show` + `min-height` / `visibility: hidden` wenn 0 Regeln).
- **Editor-Konformität:** `#extra` + `InlineDashboardPanel` `compact` unverändert lassen; nur vertikale Reservierung im Tile-Flex.

**Ohne neues Element lösbar:** **teilweise** — KPI-Differenz bleibt inhaltlich; **Layout**-Konsistenz ohne neue KPI-Slots erreichbar (min-height / v-show).

---

## Problem 4 — Lade-/Leerzustände (CLS)

**Ist (gemessen / abgeleitet):**

- Nach Laden: `.zone-tile-insight__row` (24h) **Höhe 18 px**, Spinner **nicht** sichtbar.
- Textbreiten-Probe: `…` **7 px** vs. `24,1 – 28,4 °C` **101 px** → **Δ94 px** horizontal.
- Kein `min-height` / Skeleton auf `.zone-tile-insight__row-value`.
- Performance-CLS-Recording im MCP-Lauf nicht zuverlässig (kein `setTimeout`); **indirekter CLS-Risiko-Score hoch** durch Breitenwechsel + optionalen Spinner (14×14 px) neben Text.

**Ursache (Code):**

```116:125:El Frontend/src/components/monitor/ZoneTileInsightBlock.vue
      <div class="zone-tile-insight__row">
        ...
        <span class="zone-tile-insight__row-value">
          <Loader2 v-if="spanLoading" class="zone-tile-insight__spinner" />
          <span class="zone-tile-insight__value">{{ spanLine.primary }}</span>
```

- `spanLine.primary` wechselt `'…'` → langer Wert (`ZoneTileInsightBlock.vue` Z.89–98).
- Async: `sensorsApi.getStats` im `watch` (Z.36–74).

**Vorschlag:**

- Auf **bestehendem** `.zone-tile-insight__row-value`: `min-width: 7ch` (oder gemessene 101 px als `min-width: 6.5rem`) + `min-height: 18px` (bereits stabil).
- Spinner: `position: absolute` innerhalb `row-value` **oder** gleiche Box wie finaler Text (bestehende Elemente, nur CSS).
- Optional: `BaseSkeleton` statt `Loader2` in derselben Zeile — kein zusätzliches UI-Element außerhalb der Row.

**Ohne neues Element lösbar:** **ja** (CSS + ggf. Spinner-Positionierung in vorhandener Row).

---

## Problem 5 — Responsives Grid + AUT-232

**Ist:** siehe Messwerte-Tabelle.

- Breakpoints **1024** und **1600** sind **fest** und koppeln nicht an Kachel-Inhalt oder Zonenanzahl.
- `auto-fit`/`minmax` fehlt auf Container-Ebene (nur innerhalb KPI-Zeile in ZoneTileCard).

**AUT-232 Einordnung:**

- **F2 (160/300 px Charts):** L2 / InlineDashboardPanel — nicht Hauptursache L1-Leerraum.
- **F3/F4 (18 px Stift-Icon):** berührt Touch-Innenicon, nicht Grid-Breite.
- **L1-relevant aus Inventar:** KPI `min-height: 64px`, KPI-Grid `minmax(110px)`, Media 900/560 in ZoneTileCard — begrenzen **innere** Umbrüche, nicht äußere Spaltenzahl.

**Vorschlag:** Problem 1 (`auto-fit` am `.monitor-zone-grid`); KPI/Media in ZoneTileCard bei Fix-Issue mit AUT-232 bündeln.

**Ohne neues Element lösbar:** **ja**.

---

## Problem 6 — Erreichbarkeit & Konfigurierbarkeit

**Ist (gemessen @ 1280 px):**

| Element | Breite × Höhe | WCAG 44×44 |
|---------|---------------|------------|
| Stift `.monitor-zone-tile__editor` | **44 × 44** | **ja** |
| Filter `.monitor-zone-filter__select` | **173 × 36** | **nein** (Höhe) |
| FAB `.qa-fab__button` (mode monitor) | **44 × 44**, sichtbar | **ja** |

- FAB-Klasse: `.qa-fab--monitor` (nicht `quick-action-ball` — Issue-Naming veraltet).
- Filter @ 375 px: nicht überlappt (kein Overflow-X).

**Editor / Dashboard-Datenfluss (Code-Verifikation):**

- L1: `getZoneMiniPanelId` → `dashStore.getCanonicalZoneTileLayout(zoneId)` (`MonitorView.vue` ~1361).
- Widgets: `InlineDashboardPanel` `mode="view"` `compact` im `#extra`-Slot.
- Editor-Link: `getZoneTileEditorRoute` → Zone-Tile-Layout im Editor.
- Store: `fetchFromServer` in `dashboard.store.ts` (beim App-Lifecycle); Panel liest Layout aus Store per `layoutId`.

**Vorschlag:**

- Filter: `min-height: 44px` + ggf. größeres Tap-Padding auf **bestehendem** `<select>`.
- FAB: unverändert; Widget-Add über `QuickActionBall` `mode="monitor"` → `AddWidgetDialog` (bestehender Flow).

**Ohne neues Element lösbar:** **ja** (CSS am Select; FAB OK).

---

## Vorschlagsliste (Umsetzungs-Split)

| Priorität | Art | Datei | Änderung |
|-----------|-----|-------|----------|
| P1 | CSS | `MonitorView.vue` | `auto-fit` + `minmax(~360px, 1fr)`, Media Queries 1024/1600 ersetzen |
| P1 | CSS | `MonitorView.vue` | `align-items: stretch` |
| P2 | Template/CSS | `ZoneTileCard.vue` | Regeln `v-show` + `min-height` Reserve |
| P2 | CSS | `ZoneTileCard.vue` | `.monitor-zone-tile__kpis { min-height: … }` |
| P3 | CSS | `ZoneTileInsightBlock.vue` | `min-width`/`min-height` auf `__row-value` |
| P3 | CSS | `MonitorView.vue` | Filter `min-height: 44px` |
| Folge | AUT-232 | `InlineDashboardPanel.vue` / L2 | ROW_HEIGHT / Chart px tokenisieren |

---

## Screenshots & Repro

1. Stack: `docker compose` (Frontend 5173, API 8000).
2. Login, Monitor: `/monitor`, L1 „Alle Zonen“.
3. DevTools: `.monitor-zone-grid`, `.monitor-zone-tile`, Device Toolbar 375/768/1280/1920.

**Hinweis Implementierung:** Dieser Auftrag ist **Analyse only** — Fixes in separatem Folge-Issue nach Freigabe des Berichts.
