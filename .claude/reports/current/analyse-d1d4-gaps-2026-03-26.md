# Phase 7 D1-D4 Gap-Analyse — Code-Befunde

> **Erstellt:** 2026-03-26
> **Typ:** Analyse (kein Code geaendert)
> **Grundlage:** 27 Screenshots + BERICHT.md aus `tests/screenshots/phase7-d1d4-verification/`

---

## Zusammenfassung

| GAP | Schwere | Ursache (1 Satz) | Fix-Aufwand | Betroffene Datei(en) |
|-----|---------|-----------------|-------------|---------------------|
| GAP-1 | MEDIUM | `getZoneMiniPanelId()` gibt `undefined` zurueck weil keine Zone-Dashboards mit `target.placement='inline'` + `scope='zone'` existieren | S | `MonitorView.vue`, `dashboard.store.ts` |
| GAP-2+3 | ~~KRITISCH~~ **ERLEDIGT** | Event-Kette ist vollstaendig implementiert — kein Bruchpunkt | 0 | — |
| GAP-4 | KOSMETISCH | `--glass-bg: rgba(255,255,255,0.02)` = 2% Alpha, visuell nicht wahrnehmbar; `-webkit-backdrop-filter` fehlt | XS | `tokens.css`, `InlineDashboardPanel.vue` |
| GAP-5 | MEDIUM | `display: none` bei `@media (max-width: 767px)` in QuickActionBall.vue | XS | `QuickActionBall.vue` |
| GAP-6 | LOW | Touch-CSS `@media (hover: none)` ist korrekt implementiert; Glassmorphism-Schwaeche (gleiche Ursache wie GAP-4) ueberdeckt Toolbar visuell | XS | `tokens.css` (gleicher Fix wie GAP-4) |
| GAP-7 | MEDIUM | Race-Condition: `nextTick`-Callback in `mountWidgets()` hat keinen mounted-Guard; kann nach `v-if`-Unmount noch `render()` ausfuehren | S | `InlineDashboardPanel.vue` |

**Legende Fix-Aufwand:** XS = 1-3 Zeilen, S = 5-15 Zeilen, M = 15-50 Zeilen

---

## Detail-Befunde

### GAP-1: Mini-Widgets im ZoneTileCard extra-Slot nicht sichtbar

**Ursache:** Der Code-Pfad ist vollstaendig implementiert — aber es existieren keine Zone-Dashboards die alle Filter-Bedingungen gleichzeitig erfuellen.

**Kette die scheitert:**
```
MonitorView.vue:1652  v-if="getZoneMiniPanelId(zone.zoneId)"  → undefined
  └─ MonitorView.vue:940  getZoneMiniPanelId()
       └─ dashboard.store.ts:892  inlineMonitorPanelsForZone(zoneId)
            └─ Filter: target.view='monitor' AND target.placement='inline'
                       AND scope='zone' AND zoneId === zoneId
            └─ Ergebnis: leeres Array → kein Panel gefunden
```

**Code-Stellen:**

| Datei | Zeile | Was |
|-------|-------|-----|
| `MonitorView.vue` | 1650-1658 | `#extra`-Slot mit `<InlineDashboardPanel>` — korrekt |
| `MonitorView.vue` | 1652 | `v-if="getZoneMiniPanelId(zone.zoneId)"` — blockt weil `undefined` |
| `MonitorView.vue` | 933-948 | `getZoneMiniPanelId()` + `TILE_ALLOWED_WIDGET_TYPES` — Logik korrekt |
| `dashboard.store.ts` | 891-896 | `inlineMonitorPanelsForZone()` — gibt leeres Array zurueck |
| `dashboard.store.ts` | 881-882 | `_inlineMonitorBase()` — Filter auf `target.view='monitor'` + `target.placement='inline'` |
| `ZoneTileCard.vue` | 84-85 | `<slot name="extra" />` — existiert, korrekt platziert |
| `InlineDashboardPanel.vue` | 33-35 | `compact` Prop — vollstaendig implementiert |

**Diagnose:** Die Infrastruktur (Slot, Prop, Filter, Rendering) funktioniert. Das Problem ist ein **Daten-Gap**: Zone-Dashboards muessen mit `target: { view: 'monitor', placement: 'inline' }` und `scope: 'zone'` erstellt werden UND mindestens ein Widget vom Typ `gauge` oder `sensor-card` enthalten. Funktion `generateZoneDashboard()` (Zeile 842-852) kann das — sie muss aufgerufen werden.

**Fix-Ansatz:** Beim Laden der MonitorView oder bei Zone-Wechsel pruefen ob ein Zone-Dashboard mit korrektem `target` existiert. Falls nicht: `generateZoneDashboard()` aufrufen oder bestehende Zone-Dashboards mit fehlendem `target`-Feld migrieren. Alternativ: Auto-Generate bei erstem L1-Rendering wenn noch kein passendes Panel existiert.

---

### GAP-2+3: AddWidgetDialog — KEIN GAP (bereits implementiert)

**Befund:** Die gesamte Event-Kette ist vollstaendig implementiert. Kein Bruchpunkt gefunden.

| Komponente | mode Prop | widget-selected emit | Weiterleitung | Zeile |
|---|---|---|---|---|
| `QuickWidgetPanel.vue` | Ja (Zeile 30) | Ja (Zeile 41) | Ursprung | 86-89: `handleMonitorSelect()` |
| `QuickActionBall.vue` | Ja (Zeile 29) | Ja (Zeile 39) | Zeile 100: `@widget-selected` forwarding | — |
| `MonitorView.vue` | — | — | 2132-2135: `mode="monitor"` + `@widget-selected` | 1536-1543: Handler + Refs |
| `AddWidgetDialog.vue` | — | `update:open`, `close`, `added` | — | Vollst. 3-Schritt-Flow |

**Details QuickWidgetPanel.vue:**
- Zeile 65: `isMonitorMode = computed(() => props.mode === 'monitor')`
- Zeile 148: `draggable` bei `isMonitorMode` auf `false`
- Zeile 150: `@click="isMonitorMode && handleMonitorSelect(item)"`
- Zeile 161: Drag-Icon bei `isMonitorMode` ausgeblendet

**Details MonitorView.vue:**
- Zeile 77: `import AddWidgetDialog`
- Zeile 1536-1537: `showAddWidgetDialog = ref(false)`, `addWidgetDefaultType = ref<string | undefined>()`
- Zeile 1540-1543: `handleFabWidgetSelected(widgetType)` setzt Refs und oeffnet Dialog
- Zeile 2138-2144: `<AddWidgetDialog>` mit allen Bindings

**Fazit:** Der Bericht-Befund "AddWidgetDialog nicht verbunden" basierte moeglicherweise auf einem frueheren Stand. Die Implementierung ist jetzt komplett. **Kein Fix noetig.**

---

### GAP-4: Hover-Toolbar ohne Glassmorphism

**Ursache:** Glassmorphism ist technisch implementiert, aber `--glass-bg` hat nur 2% Alpha-Transparenz — visuell nicht wahrnehmbar. Zusaetzlich fehlt `-webkit-backdrop-filter` fuer Safari.

**Code-Stellen:**

| Datei | Zeile | Was | Status |
|-------|-------|-----|--------|
| `tokens.css` | 91 | `--glass-bg: rgba(255, 255, 255, 0.02)` | 2% Alpha = unsichtbar |
| `InlineDashboardPanel.vue` | 354 | `background: var(--glass-bg, ...)` | Korrekt, aber Token zu schwach |
| `InlineDashboardPanel.vue` | 355 | `backdrop-filter: blur(8px)` | Vorhanden |
| `InlineDashboardPanel.vue` | 355 | `-webkit-backdrop-filter: blur(8px)` | **FEHLT** |
| `InlineDashboardPanel.vue` | 357 | `border: 1px solid var(--glass-border, ...)` | Vorhanden |
| `InlineDashboardPanel.vue` | 358-359 | `opacity: 0` + Transition | Korrekt |
| `InlineDashboardPanel.vue` | 347 | `position: absolute` | Korrekt |

**Vergleich:** QuickActionBall.vue nutzt `rgba(20, 20, 30, 0.7)` (Zeile 166) als FAB-Background — deutlich sichtbar. Die Widget-Toolbar nutzt `rgba(255, 255, 255, 0.02)` — faktisch transparent.

**Fix-Ansatz:**
1. `tokens.css` Zeile 91: `--glass-bg` auf `rgba(30, 30, 45, 0.75)` erhoehen (passend zum Dark-Theme `--color-bg-tertiary: #15151f`)
2. `InlineDashboardPanel.vue` Zeile 355: `-webkit-backdrop-filter: blur(8px)` ergaenzen

---

### GAP-5: FAB auf Mobile nicht sichtbar

**Ursache:** Explizite `display: none`-Regel fuer Viewports unter 768px.

**Code-Stelle:**
`QuickActionBall.vue`, Zeilen 147-152:
```css
/* Hidden on mobile < 768px */
@media (max-width: 767px) {
  .qa-fab {
    display: none;
  }
}
```

**Kontext:** Der Kommentar "Hidden on mobile" suggeriert eine bewusste Entscheidung. Aber im MonitorView ist der FAB mit `mode="monitor"` der einzige Weg, Widgets per Quick-Add hinzuzufuegen. Ohne FAB gibt es auf Mobile keinen Zugang zum AddWidgetDialog.

**Weitere Pruefungen:**
- Kein `v-if` in MonitorView der den FAB ausblended
- z-index korrekt: `--z-fab: 38` (tokens.css Zeile 170) — liegt ueber allen Panels
- Nur `route.meta.requiresAuth !== false` Guard (QuickActionBall.vue Zeile 88) — kein Viewport-Guard

**Fix-Ansatz:** Die `@media (max-width: 767px) { display: none }` Regel entfernen oder auf view-spezifische Bedingung aendern. In MonitorView soll der FAB immer sichtbar sein (auch mobile). Falls FAB im Editor-Mode auf Mobile nicht gewuenscht ist: die Entscheidung per `mode` Prop steuern statt per Viewport.

---

### GAP-6: Widget-Toolbar auf Mobile nicht sichtbar

**Ursache:** Touch-CSS ist korrekt implementiert. Die scheinbare Unsichtbarkeit hat die gleiche Ursache wie GAP-4 (schwacher `--glass-bg` Token).

**Implementierte Touch-Features:**

| Feature | Datei | Zeile | Status |
|---------|-------|-------|--------|
| `@media (hover: none) { opacity: 1 }` | `InlineDashboardPanel.vue` | 369-374 | Korrekt |
| Touch-Target 44px | `InlineDashboardPanel.vue` | 406-411 | Korrekt |
| `pointer-events: auto` bei Touch | `InlineDashboardPanel.vue` | 372 | Korrekt |

**Potentielle Nebenprobleme:**

| Problem | Datei | Zeile | Schwere |
|---------|-------|-------|---------|
| `overflow: hidden` auf Widget-Container | `InlineDashboardPanel.vue` | 293 | LOW — Toolbar liegt innerhalb, wird nicht abgeschnitten |
| `-webkit-backdrop-filter` fehlt | `InlineDashboardPanel.vue` | 355 | LOW — Safari-only |

**Diagnose:** Die Toolbar ist auf Touch-Geraeten `opacity: 1` und `pointer-events: auto`. Sie ist technisch sichtbar und klickbar. Die visuellen Probleme (laut Screenshot "nicht sichtbar") kommen vom gleichen `--glass-bg: 2%`-Problem wie GAP-4. Buttons sind da, aber der Hintergrund ist transparent — auf dunklem Theme sind nur die Icons sichtbar, der Toolbar-Container selbst nicht.

**Fix-Ansatz:** Gleicher Fix wie GAP-4 — `--glass-bg` Token staerker machen. Kein separater Fix noetig.

---

### GAP-7: Browser-Crash nach Widget-Entfernen Abbrechen

**Ursache:** Der Cancel-Pfad selbst ist safe (kein unhandled Promise Rejection). Aber es gibt eine Race-Condition beim Entfernen des letzten Widgets die einen Crash verursachen kann.

**Cancel-Pfad (SAFE):**
```
confirmRemove(w)  [InlineDashboardPanel.vue:92-102]
  → uiStore.confirm()  [ui.store.ts:127-137, Promise<boolean>, nie rejected]
    → Cancel → resolveConfirm(false)  [ui.store.ts:139-150]
      → confirmed = false → return (nichts passiert)
```

`uiStore.confirm()` resolved **immer** mit `boolean`, nie `reject`. Cancel ist vollstaendig abgesichert.

**Race-Condition (potentieller Crash-Trigger):**

| Schritt | Datei | Zeile | Was passiert |
|---------|-------|-------|-------------|
| 1 | `InlineDashboardPanel.vue` | 92-102 | `confirmRemove()` — kein try/catch |
| 2 | `dashboard.store.ts` | 977-982 | `removeWidget()` filtert Widget raus |
| 3 | `dashboard.store.ts` | 278-288 | `saveLayout()` schreibt `layouts.value[idx]` reaktiv neu |
| 4 | `InlineDashboardPanel.vue` | 158 | `watch(widgets, ..., { deep: true })` feuert |
| 5 | `InlineDashboardPanel.vue` | 132-134 | `mountWidgets()` → `cleanupAllWidgets()` synchron |
| 6 | `InlineDashboardPanel.vue` | 135 | `nextTick(() => { ... })` wird eingeplant |
| 7 | `InlineDashboardPanel.vue` | 171 | `v-if="layout && widgets.length > 0"` → **Komponente wird unmountet** |
| 8 | `InlineDashboardPanel.vue` | 164-166 | `onUnmounted` → `cleanupAllWidgets()` nochmal |
| 9 | `InlineDashboardPanel.vue` | 135-155 | **nextTick-Callback laeuft NACH Unmount** → `render(vnode, mountEl)` auf destroyed Element |

**Zusaetzliches Problem:** `watch(widgets, ..., { deep: true })` (Zeile 158) feuert auch bei `serverId`-Updates durch `syncLayoutToServer` (dashboard.store.ts Zeile 525-529), da `{ deep: true }` auf das gesamte Widget-Objekt reagiert — nicht nur auf hinzugefuegte/entfernte Widgets. Das loest unnoetige `cleanupAllWidgets()` + Re-Mount-Zyklen aus.

**Fix-Ansatz:**
1. Mounted-Guard einfuehren: `let isMounted = true` + `onUnmounted(() => { isMounted = false; cleanupAllWidgets() })` + `if (!isMounted) return` im `nextTick`-Callback (InlineDashboardPanel.vue Zeile 135)
2. Watcher narrowen: `watch(() => widgets.value.map(w => w.id), ...)` statt `{ deep: true }` — so feuert er nur bei tatsaechlichen Widget-Aenderungen, nicht bei `serverId`-Updates

---

## Fix-Reihenfolge (Empfehlung)

| Prio | GAP | Grund |
|------|-----|-------|
| 1 | GAP-5 | XS-Fix, schaltet Mobile-FAB frei |
| 2 | GAP-4 + GAP-6 | XS-Fix am Token, behebt beide visuellen Probleme |
| 3 | GAP-7 | S-Fix, verhindert potentielle Crashes |
| 4 | GAP-1 | S-Fix, erfordert Dashboard-Auto-Generation oder Migration |
| — | GAP-2+3 | Kein Fix noetig (bereits implementiert) |
