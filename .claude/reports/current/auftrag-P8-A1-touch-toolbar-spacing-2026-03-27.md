# Auftrag P8-A1 — Touch-Targets & Toolbar-Spacing Fix

**Typ:** Bug-Fix — Frontend (CSS)
**Schwere:** MEDIUM
**Aufwand:** ~1-2h
**Ziel-Agent:** frontend-dev
**Abhaengigkeit:** Keine

---

## Kontext

AutomationOne ist ein Vue 3 IoT-Dashboard-Framework. Widgets werden ueber zwei voneinander getrennte Mechanismen verwaltet, je nach Kontext:

**Mechanismus 1 — `InlineDashboardPanel.vue`** (`src/components/dashboard/InlineDashboardPanel.vue`):
Wird in MonitorView fuer L2 Inline-Panels, Bottom-Panels und Side-Panels eingesetzt. Die Komponente hat eine Hover-Toolbar mit einem Settings-Icon (Zahnrad, 14px) und einem Trash2-Icon (Muelleimer, 14px). Ein `mode`-Prop steuert das Verhalten: `view` (read-only, keine Toolbar), `manage` (Toolbar aktiv, Konfigurieren + Entfernen moeglich), `inline`, `side-panel`. Auf Touch-Geraeten ist die Toolbar per `@media (hover: none)` permanent sichtbar (`opacity: 1`) und die Buttons haben bereits korrekte `min-width: 44px; min-height: 44px` Touch-Targets. Das Problem liegt ausschliesslich im **Abstand zwischen den Buttons**.

**Mechanismus 2 — GridStack Widget-Header in `CustomDashboardView.vue`** (`src/views/CustomDashboardView.vue`):
Der Dashboard-Editor nutzt GridStack.js fuer Drag-and-Drop-Layouts. Widget-Header-Buttons (Gear-Button `.dashboard-widget__gear-btn`, Remove-Button `.dashboard-widget__remove-btn`) werden direkt in `useDashboardWidgets.ts` als DOM-Elemente in GridStack-Items gemountet und sind KEINE `InlineDashboardPanel`-Instanz. Sie haben 24x24px und werden via Hover-`opacity`-Transition sichtbar. Es gibt keinen Touch-Override.

Das Design-System nutzt `tokens.css` mit 129 Tokens (semantische Prefixes `--color-*`, `--glass-*`, `--space-*`).

---

## Warum Touch-Targets und Spacing relevant sind

Auf Touch-Geraeten (Smartphones, Tablets) gibt es keinen Cursor, keinen Hover und keine Sub-Pixel-Praezision. Die menschliche Fingerkuppe trifft zuverlassig ein Ziel von mindestens 44x44px — kleinere Targets fuehren zu Fehlbedienungen. Das WCAG 2.5.5-Kriterium (AAA) schreibt 44x44px vor; Apple HIG und Google Material Design schreiben 44px bzw. 48px als Minimum vor.

Selbst wenn die Buttons gross genug sind, fuehrt ein zu enger Abstand zwischen ihnen zu Fehlbedienung: Die Finger-Touch-Area ist groessr als das eigentliche Ziel — das benachbarte Element wird mitgetroffen. WCAG empfiehlt mindestens 8px Abstand zwischen Touch-Targets. Auf Hover-basierten Systemen (`hover: hover`) existiert dieses Problem nicht, weil der Cursor praezise ist.

---

## Problem 1 — InlineDashboardPanel Toolbar-Gap zu eng

**IST:**
- Settings-Icon: 14px, Trash2-Icon: 14px
- Desktop-Button (`@media (hover: hover)`): 28x28px
- Touch-Button (`@media (hover: none)`): min 44x44px — korrekt
- Touch-Sichtbarkeit: `opacity: 1` permanent — korrekt
- **Toolbar `gap: 2px`** zwischen den Buttons — das Gap gilt fuer alle Kontexte inkl. Touch
- Auf Touch-Geraeten: Die 44x44px-Bereiche der beiden Buttons ueberlappen sich bei 2px Abstand. Antippen des Settings-Buttons trifft versehentlich den Trash-Button.

**SOLL:**
- Toolbar-`gap` auf `8px` erhoehen — das ist das WCAG-Minimum fuer Abstand zwischen Touch-Targets

**Datei:** `src/components/dashboard/InlineDashboardPanel.vue` — scoped `<style>` Block

**Fix — eine CSS-Zeile:**
```css
.widget-toolbar {
  gap: 8px; /* war: 2px — 8px ist WCAG-Minimum fuer Touch-Target-Abstand */
}
```

**Auswirkung auf Desktop:** Visuell minimal — 6px mehr Abstand zwischen Zahnrad und Muelleimer. Keine funktionale Auswirkung.

---

## Problem 2 — GridStack Editor-Buttons ohne Touch-Override

**IST:**
- Gear-Button (`.dashboard-widget__gear-btn`) und Remove-Button (`.dashboard-widget__remove-btn`) im GridStack Widget-Header: **24x24px**
- Sichtbar im Edit-Mode via `opacity`-Transition auf Hover des Widget-Headers (CSS-Klasse `.grid-stack--editing`)
- **Kein `@media (pointer: coarse)` oder `@media (hover: none)` Override in der Datei**
- Auf Touch-Geraeten existiert kein Hover, die Buttons bleiben dauerhaft unsichtbar (opacity: 0). Selbst wenn sie sichtbar waeren, waeren 24x24px nicht zuverlaessig treffbar.
- CSS-Klassennamen sind verifiziert: `.dashboard-widget__gear-btn` (Zeile ~1640), `.dashboard-widget__remove-btn` (Zeile ~1677). Alle bestehenden Styles nutzen `:deep()` Selektoren mit `.grid-stack--editing` Prefix.

**SOLL:**
- Touch-Target auf mindestens 44x44px unter `pointer: coarse` / `hover: none` — via `min-width` + `min-height` + Padding (damit das Icon visuell zentriert bleibt)
- Buttons auf Touch-Geraeten permanent sichtbar — `opacity: 1` ohne Hover-Bedingung
- Icons bleiben bei 24px visueller Groesse

**Datei:** `src/views/CustomDashboardView.vue` — im `<style>` Block, mit `:deep()` weil die Buttons als DOM-Elemente durch `useDashboardWidgets.ts` in Child-Elemente gemountet werden

**Fix — Media-Query-Block am Ende des Style-Abschnitts fuer `.grid-stack--editing`:**
```css
@media (pointer: coarse), (hover: none) {
  .grid-stack--editing :deep(.dashboard-widget__gear-btn),
  .grid-stack--editing :deep(.dashboard-widget__remove-btn) {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;   /* Stellt sicher dass das Icon zentriert bleibt */
    align-items: center;
    justify-content: center;
    opacity: 1;             /* Permanent sichtbar — kein Hover auf Touch-Geraeten */
  }
}
```

**Warum `display: inline-flex` notwendig:** `min-width`/`min-height` vergrossern nur den Klickbereich. Ohne `display: inline-flex` + `align-items/justify-content: center` bleibt das 24px-Icon an der urspruenglichen Position und der zusaetzliche Klickbereich entsteht nur nach rechts/unten — das Icon liegt dann nicht mehr in der Mitte des Touch-Targets.

**Warum `(pointer: coarse), (hover: none)` statt nur einem der beiden:** `pointer: coarse` trifft Touch-Geraete (Finger), `hover: none` trifft Geraete ohne Hover-Faehigkeit (ebenfalls Touch). Beide zusammen decken alle gaengigen Touch-Szenarien ab (iOS Safari, Android Chrome, iPad). Das `,` (Komma) bedeutet logisches ODER — der Block greift wenn mindestens eine Bedingung gilt.

**Auswirkung auf Desktop:** Keine — Desktop-Browser melden `pointer: fine` UND `hover: hover`, die Media-Query greift nicht.

---

## Kontext-Matrix (IST-Zustand der 5 Panel-Kontexte)

Diese Matrix zeigt welche Kontexte von diesem Auftrag betroffen sind und welche korrekt sind:

| # | Kontext | Mechanismus | Betroffenheit |
|---|---------|-------------|---------------|
| 1 | CustomDashboardView (Editor) | GridStack-Header-Buttons (KEIN InlineDashboardPanel) | **Problem 2 behebt Touch-Targets** |
| 2 | MonitorView L2 Inline-Panels | InlineDashboardPanel `mode="manage"` | **Problem 1 behebt Gap** |
| 3 | MonitorView L1 ZoneTileCard extra-Slot | InlineDashboardPanel `mode="view"` + `compact` | Nicht betroffen — read-only, keine Toolbar |
| 4 | MonitorView Bottom-Panels | InlineDashboardPanel `mode="manage"` | **Problem 1 behebt Gap** |
| 5 | MonitorView Side-Panels | InlineDashboardPanel `mode="side-panel"` | Pruefe ob Toolbar aktiv ist; falls nein: nicht betroffen |

Kontext 3 ist bewusst `mode="view"` — Mini-Widgets in Zone-Tiles sollen read-only sein. Das ist kein Bug.

---

## Einschraenkungen

- `InlineDashboardPanel` mode-Prop-Logik (`view`/`manage`/`inline`/`side-panel`) bleibt unveraendert
- Icon-Groessen bleiben unveraendert: 14px in Monitor-Toolbar, 24px in Editor-Buttons
- Keine neuen npm-Pakete
- GridStack.js-Integration bleibt unveraendert (kein Umbau von `useDashboardWidgets.ts`)
- Desktop-Darstellung darf sich nicht visuell merklich veraendern — Buttons bleiben kompakt
- Keine Aenderungen an `tokens.css`

---

## Akzeptanzkriterien

- [ ] `InlineDashboardPanel.vue`: `.widget-toolbar { gap: 8px }` im scoped CSS (in DevTools Element-Inspector pruefbar: Computed Style fuer `.widget-toolbar` zeigt `gap: 8px`)
- [ ] `CustomDashboardView.vue`: Gear-Button und Remove-Button unter `pointer: coarse` im DevTools Device-Mode haben `min-width: 44px` und `min-height: 44px` (Computed Styles pruefbar)
- [ ] `CustomDashboardView.vue`: Gear-Button und Remove-Button sind im Device-Mode (Touch) ohne Hover sichtbar (`opacity: 1` — nicht via Hover-Trigger)
- [ ] `CustomDashboardView.vue`: Das Gear-Icon bleibt visuell in der Mitte des 44x44px-Bereichs zentriert (kein Layout-Shift sichtbar)
- [ ] Desktop (kein Device-Mode): Editor-Buttons bleiben wie bisher — kompakt, via Hover sichtbar, keine Groessenveraenderung
- [ ] MonitorView im Device-Mode: Manage-Toolbar (Settings + Trash) hat sichtbaren Abstand (kein optisches Zusammenkleben der Icons)
- [ ] Kein TypeScript/Vue-Compiler-Fehler nach den Aenderungen (`vue-tsc --noEmit` sauber)
