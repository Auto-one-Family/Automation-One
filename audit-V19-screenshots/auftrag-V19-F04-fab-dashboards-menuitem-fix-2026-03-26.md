# V19-F04 — FAB "Dashboards" MenuItem: Panel nicht sichtbar

> **Typ:** Bugfix (Frontend — QuickDashboardPanel Sichtbarkeit)
> **Erstellt:** 2026-03-26
> **Prioritaet:** HIGH
> **Geschaetzter Aufwand:** ~1-2h
> **Abhaengigkeit:** Keine

---

## Kontext — FAB-Architektur

Der FAB (Floating Action Button, `QuickActionBall.vue`) besteht aus mehreren Schichten:

1. **QuickActionBall.vue** — Runder Button unten rechts (Blitz-Icon). Hat `mode`-Prop (`'editor'` | `'monitor'`). Rendert `activePanelComponent` via dynamic component (Zeile ~49-57).
2. **QuickActionMenu.vue** — Menue das beim Klick erscheint. Rendert dynamisch `store.contextActions` + `store.globalActions` via `QuickActionItem`-Komponenten. Keine hardcodierten Items.
3. **QuickDashboardPanel.vue** — Voll implementierte Komponente (~416 Zeilen) unter `components/quick-action/QuickDashboardPanel.vue`. Listet vorhandene Dashboards auf und ermoeglicht Direktnavigation.
4. **QuickWidgetPanel.vue** — Panel fuer Widget-Typen-Auswahl.
5. **useQuickActions.ts** — Definiert alle FAB-Actions pro View-Kontext. Die `mon-dashboards`-Action existiert **nur im Monitor-View-Kontext** (Zeilen ~80-89).
6. **quickAction.store.ts** — Verwaltet `activePanel`-State. `executeAction()` erkennt Panel-Wechsel und ruft `setActivePanel('dashboards')` auf (Zeilen ~136-145).

**Event-Kette bei "Dashboards"-Klick:**
`QuickActionItem @click` → `handleAction('mon-dashboards')` → `store.executeAction()` → `setActivePanel('dashboards')` → `activePanelComponent` wechselt zu `QuickDashboardPanel`

Die Verdrahtung ist vollstaendig vorhanden. Das Problem liegt in der **Sichtbarkeit des Panels**.

---

## IST-Zustand

- FAB-Button ist sichtbar (Blitz-Icon, unten rechts, `MonitorView.vue`).
- Klick oeffnet `QuickActionMenu` mit mehreren Optionen — darunter "Dashboards" (erscheint **nur im Monitor-View**, nicht im Editor).
- Klick auf "Dashboards" schliesst das Menu und wechselt `store.activePanel` auf `'dashboards'`.
- **`QuickDashboardPanel.vue` wird zwar gerendert, ist aber nicht sichtbar.** Der Playwright-Audit (V19, Screenshot `C2-fab-geoeffnet.png`) bestaetigt: Kein Panel erscheint nach dem Klick.

Moegliche Ursachen (in absteigender Wahrscheinlichkeit):
1. **CSS-Positionierungsproblem:** `.qa-dash-panel` ist `position: absolute`, positioniert via `bottom: calc(100% + var(--space-2)), right: 0`. Das Panel oeffnet sich moeglicherweise ausserhalb des sichtbaren Viewports oder wird durch `overflow: hidden` eines Elternelements abgeschnitten.
2. **Leerer Dashboard-Store:** `useDashboardStore().layouts` hat keine Eintraege → `QuickDashboardPanel` zeigt einen Empty-State, der visuell kaum wahrnehmbar ist (z.B. weisser Text auf hellem Hintergrund oder 0-height Container).
3. **JS-Error beim Panel-Wechsel:** Ein Store-Import-Fehler oder fehlende Referenz verhindert das Rendern.

---

## SOLL-Zustand

Nach dem Klick auf "Dashboards" im FAB-Menu soll `QuickDashboardPanel.vue` sichtbar erscheinen — direkt ueber dem FAB, mit der Liste aller vorhandenen Dashboards (oder einem klar lesbaren Empty-State wenn keine vorhanden sind).

**Das Panel muss sichtbar sein.** Kein neues Feature, keine Navigation-Umleitung — das bestehende `QuickDashboardPanel` soll korrekt dargestellt werden.

---

## Vorgehen

### Schritt 1: Problem isolieren

1. Browser-DevTools oeffnen (Vue-Tab + Elements-Tab).
2. FAB im Monitor-View oeffnen → "Dashboards" klicken.
3. **Vue DevTools:** Pruefe ob `quickAction.store.activePanel === 'dashboards'` nach dem Klick gesetzt ist.
4. **Elements-Tab:** Pruefe ob `QuickDashboardPanel` im DOM vorhanden ist. Wenn ja: Welche computed styles hat es? Ist es `display: none`, `visibility: hidden`, `opacity: 0`, oder ausserhalb des Viewports (`top/left/right/bottom`)?
5. **Console-Tab:** Gibt es JS-Errors beim Panel-Wechsel?

### Schritt 2: CSS-Fix (wahrscheinlichster Fall)

**Problem:** `QuickActionBall.vue` hat vermutlich `overflow: hidden` oder das Panel-Positioning ist relativ zu einem Container-Element das klein ist oder am Rand liegt.

**Fix-Ansatz:**
```
.qa-dash-panel {
  position: fixed;          /* statt absolute — unabhaengig vom Container */
  bottom: calc(4rem + var(--space-4));   /* ueber dem FAB-Button */
  right: var(--space-4);
  z-index: var(--z-overlay); /* sicherstellen dass Panel ueber allem liegt */
  max-height: 60vh;
  overflow-y: auto;
}
```

Alternativ: Den Elterncontainer von `QuickActionBall.vue` auf `overflow: visible` setzen, falls `position: absolute` beibehalten werden soll.

### Schritt 3: Empty-State pruefen

Falls `useDashboardStore().layouts.length === 0`:

Der Empty-State in `QuickDashboardPanel.vue` muss auch ohne Daten klar sichtbar sein:
- Mindesthoehe: `min-height: 120px`
- Sichtbarer Text: "Noch keine Dashboards vorhanden"
- Button: "Dashboard erstellen" → navigiert zu `/editor`

### Schritt 4: Testen

1. Monitor-View oeffnen.
2. FAB-Button klicken.
3. "Dashboards" anklicken.
4. Erwartung: `QuickDashboardPanel` erscheint sichtbar mit Dashboard-Liste oder leerEM State.

---

## Relevante Dateien

| Datei | Rolle |
|-------|-------|
| `components/quick-action/QuickActionBall.vue` | FAB Container, rendert `activePanelComponent` |
| `components/quick-action/QuickDashboardPanel.vue` | Das Panel selbst (~416 Zeilen) |
| `components/quick-action/QuickActionMenu.vue` | Menue mit Action-Items |
| `composables/useQuickActions.ts` | Action-Definitionen pro View, `mon-dashboards` ca. Zeile 80-89 |
| `shared/stores/quickAction.store.ts` | `activePanel` State, `executeAction()`, `setActivePanel()` |
| `views/MonitorView.vue` | FAB-Einbindung (mode="monitor") |

---

## Was NICHT geaendert werden darf

- Die Widget-Auswahl im FAB (`QuickWidgetPanel`) — funktioniert korrekt.
- Der `AddWidgetDialog` — funktioniert korrekt.
- Die FAB-Positionierung und das Styling des Buttons selbst — ist korrekt.
- Der Editor (`CustomDashboardView`) — keine Aenderungen noetig.
- Die Event-Kette und die Action-Definitionen in `useQuickActions.ts` — sind korrekt verdrahtet.

---

## Akzeptanzkriterien

- [ ] Klick auf "Dashboards" im FAB (Monitor-View) oeffnet `QuickDashboardPanel` sichtbar
- [ ] Das Panel erscheint ueber dem FAB, innerhalb des Viewports, nicht abgeschnitten
- [ ] Bei vorhandenen Dashboards: Liste der Dashboards sichtbar und klickbar
- [ ] Bei leerem Store: Klarer Empty-State ("Noch keine Dashboards", min-height 120px)
- [ ] Kein JavaScript-Error in der Console beim Panel-Wechsel
- [ ] Andere FAB-Items (Widget-Typen, Widget-Klick → AddWidgetDialog) funktionieren weiterhin
- [ ] `vue-tsc --noEmit` und `npm run build` ohne Fehler
