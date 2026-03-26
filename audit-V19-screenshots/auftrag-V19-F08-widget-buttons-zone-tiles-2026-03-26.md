# V19-F08 — Widget Konfigurieren/Entfernen Buttons dauerhaft sichtbar in Zone-Tiles

> **Typ:** Bugfix (Frontend — Mode-Prop)
> **Erstellt:** 2026-03-26
> **Prioritaet:** LOW
> **Geschaetzter Aufwand:** <30min (einzeilige Aenderung)
> **Abhaengigkeit:** Keine
> **Verifiziert:** 2026-03-26 (3 Pfade, 0 Agents, 0 Services, 0 Endpoints)

---

## Kontext

### InlineDashboardPanel mode-Prop (Phase 7, D4)

In Phase 7 D4 wurde die Widget-Inline-Verwaltung implementiert. Das `InlineDashboardPanel` (`components/dashboard/InlineDashboardPanel.vue`) hat einen `mode`-Prop (Zeile 30, Default `'inline'`) mit 4 Werten:

- **`'view'`** — Reines Anzeigen. Die Toolbar wird per `v-if="isManageMode"` (Zeile 200) **gar nicht ins DOM gerendert** — nicht nur CSS-hidden, sondern komplett absent.
- **`'manage'`** — Hover-Toolbar mit 2 Buttons: [Konfigurieren] (Settings-Icon 14px) und [Entfernen] (Trash2-Icon 14px). `isManageMode` Computed (Zeile 60): `mode === 'manage' && authStore.isAuthenticated`. Die Toolbar erscheint nur on-hover (Desktop: `opacity: 0` → `opacity: 1`) oder dauerhaft (Touch-Geraete via `@media (hover: none)`, 44px Touch-Targets). Hintergrund: `rgba(30, 30, 45, 0.75)` + `backdrop-filter: blur(8px)`.
- **`'inline'`** — Legacy-Modus.
- **`'side-panel'`** — Sidebar-Layout.

### Zone-Tiles und Mini-Widgets

Die Zone-Tiles (`ZoneTileCard.vue`, `components/monitor/ZoneTileCard.vue`) auf Monitor L1 haben einen `#extra`-Slot (Zeile 85) der Mini-Widgets anzeigt. Diese Mini-Widgets sind `InlineDashboardPanel`-Instanzen mit `compact`-Prop (max-height 120px, Zeile 347) und aktuell **`mode="manage"`**.

### Das Problem

Die Konfigurieren/Entfernen-Buttons innerhalb der Zone-Tiles sind permanent sichtbar statt nur on-hover. In den kleinen Mini-Widget-Containern (max-height 120px) nehmen die Buttons unverhaeltnismaessig viel Platz ein und stoeren die Lesbarkeit der Gauge-Werte.

---

## IST-Zustand

**Problemstelle:** `views/MonitorView.vue`, **Zeile 1728** — `mode="manage"` im `#extra`-Slot der ZoneTileCard.

- Mini-Widgets in Zone-Tiles (L1) rendern die volle Hover-Toolbar ins DOM.
- Auf Touch-Geraeten (Tablet, Handy) sind die Buttons dauerhaft sichtbar (`@media (hover: none)`).
- Die Buttons ueberlagern den Gauge-Wert in den 120px-Containern.

---

## SOLL-Zustand

Mini-Widgets in Zone-Tiles sollen **KEINE** Konfigurieren/Entfernen-Buttons zeigen. Begruendung:

1. **Monitor L1 = 5-Sekunden-Ueberblick.** Die Zone-Tiles sollen auf einen Blick zeigen ob alles in Ordnung ist. Konfigurieren gehoert nicht auf diese Ebene — das Shneiderman-Mantra ("Overview first, zoom and filter, then details-on-demand") verbietet Interaktions-Elemente auf der Uebersichtsebene.
2. **Mini-Widgets sind zu klein** fuer eine interaktive Toolbar. Bei 120px max-height bleibt kein Platz fuer sinnvolle Interaktion.
3. **Konfiguration gehoert in den Editor** (Phase 7 Leitprinzip: "Monitor = Read-Only; Personalisierung ist Ausnahme, nicht Standard auf L1").

Bei `mode="view"` wird die Toolbar per `v-if` komplett aus dem DOM entfernt — kein CSS-Override noetig, kein Risiko fuer versteckte Touch-Interaktion.

Die Widgets auf Monitor **L2** (Zeile 2028) und im **Bottom-Bereich** (Zeile 2046) behalten `mode="manage"` — dort sind sie gross genug und der Kontext (Detail-Ebene) macht Interaktion sinnvoll.

---

## Loesung

**Eine Zeile aendern** in `views/MonitorView.vue`, Zeile 1728:

```vue
<!-- VORHER (Zeile 1728) -->
<InlineDashboardPanel mode="manage" :compact="true" ... />

<!-- NACHHER -->
<InlineDashboardPanel mode="view" :compact="true" ... />
```

Es gibt **keine weiteren** InlineDashboardPanel-Instanzen in Zone-Tiles — nur diese eine Stelle.

---

## Relevante Dateien

| Bereich | Datei | Zeile |
|---------|-------|-------|
| **Fix-Stelle** | `views/MonitorView.vue` → ZoneTileCard `#extra`-Slot | **1728** |
| mode-Prop Definition | `components/dashboard/InlineDashboardPanel.vue` | 30 |
| isManageMode Guard | `components/dashboard/InlineDashboardPanel.vue` | 60 |
| v-if Toolbar-Rendering | `components/dashboard/InlineDashboardPanel.vue` | 200 |
| compact max-height | `components/dashboard/InlineDashboardPanel.vue` | 347 |
| ZoneTileCard extra-Slot | `components/monitor/ZoneTileCard.vue` | 85 |

---

## Was NICHT geaendert werden darf

- InlineDashboardPanel auf Monitor **L2** (Zeile 2028) — bleibt `mode="manage"`.
- InlineDashboardPanel im **Bottom-Bereich** (Zeile 2046) — bleibt `mode="manage"`.
- **Side-Panels** — bleiben `mode="side-panel"`.
- **InlineDashboardPanel.vue selbst** — die Komponente ist korrekt. Nur der `mode`-Prop im Aufrufer (MonitorView) ist falsch.

---

## Akzeptanzkriterien

- [ ] `MonitorView.vue` Zeile ~1728: `mode="view"` statt `mode="manage"`
- [ ] Mini-Widgets in Zone-Tiles (L1) rendern KEINE Toolbar-Buttons (kein DOM-Element)
- [ ] Grosse Widgets auf Monitor L2 (Zeile ~2028) zeigen weiterhin die Hover-Toolbar
- [ ] Bottom-Panels (Zeile ~2046) zeigen weiterhin die Hover-Toolbar
- [ ] `vue-tsc --noEmit` und `npm run build` ohne Fehler
