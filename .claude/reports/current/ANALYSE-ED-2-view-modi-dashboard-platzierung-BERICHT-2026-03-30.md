# ANALYSE-ED-2 — Analysebericht: View-Modi, Dashboard-Platzierung & Navigation

> **Datum:** 2026-03-30
> **Typ:** Analysebericht (keine Code-Änderungen)
> **Schicht:** Frontend (El Frontend)
> **Analysierte Dateien:** CustomDashboardView.vue (~1148 Zeilen gelesen), MonitorView.vue (~600 Zeilen gelesen), InlineDashboardPanel.vue (424 Zeilen vollständig), dashboard.store.ts (~1189 Zeilen vollständig), router/index.ts (vollständig), QuickDashboardPanel.vue (427 Zeilen vollständig), useDashboardWidgets.ts (100 Zeilen Anfang)

---

## 1. IST-Zustand der Modi

### B1: Ansichtsmodus (`isEditing`-Toggle)

**Initial-State:** `isEditing = ref(false)` → Ansichtsmodus ist der **Default** beim Öffnen des Editors.

**Toggle-Funktion `toggleEditMode()` (CDV:314-330):**
```
isEditing = true  → grid.enableMove(true), grid.enableResize(true), opts.removable = true, showCatalog = true
isEditing = false → grid.enableMove(false), grid.enableResize(false), opts.removable = false,
                    showCatalog = false, configPanelOpen = false
```

**Was im Ansichtsmodus verschwindet (v-if isEditing):**
| Element | Bedingung | Zeile |
|---------|-----------|-------|
| Widget-Katalog-Sidebar | `showCatalog && isEditing` | 975 |
| MapPin Target-Konfigurator | `activeLayoutId && isEditing` | 858 |
| Plus-Button (Katalog öffnen) | `isEditing` | 938 |
| Import-Button | `isEditing` | 944 |
| Delete-Dashboard-Button | `activeLayoutId && isEditing` | 947 |

**Was im Ansichtsmodus BLEIBT:**
- Vollständige Toolbar inkl. "Dashboard Builder"-Titel
- Layout-Selector Dropdown
- Export-Button (immer sichtbar)
- MonitorPlay-Link-Button (falls scope=zone+zoneId)
- Edit/Eye-Toggle-Button selbst
- GridStack-Container → **gleiche visuelle Darstellung wie Edit-Mode** — nur GridStack-Interaktivität deaktiviert, keine visuelle Unterscheidung

**Root Cause für "kein sichtbarer Unterschied":**
1. Das Dashboard rendert im Ansichtsmodus **weiterhin über GridStack** (selbes `.grid-stack` div), nicht über InlineDashboardPanel.
2. Es gibt keine CSS-Klasse die den View-Modus visuell absetzt (`.grid-stack--editing` wird entfernt, aber das hat keine sichtbaren Style-Auswirkungen laut Stylesheet-Analyse).
3. Widget-Header mit Typ-Badge und Titel bleiben in beiden Modi identisch.
4. Es gibt kein "InlineDashboardPanel-ähnliches" Re-Rendering im View-Modus.
5. `useDashboardWidgets` wird im Editor **ohne** `readOnly`-Option gerufen (CDV:60-81) — die Option existiert im Composable, wird aber im Editor nicht gesetzt.

**Fazit B1:** Der Ansichtsmodus deaktiviert GridStack-Interaktion, rendert aber visuell identisch zum Editor. Ein echter "Preview-Modus" fehlt.

---

### B2: "Im Monitor anzeigen" — Target-System

Das System besteht aus **zwei separaten Mechanismen**:

#### Mechanismus 1: MonitorPlay-Button (RouterLink, Zeile 848-855)
```vue
<router-link
  v-if="monitorRouteForLayout"
  :to="monitorRouteForLayout"
  ...
  title="Im Monitor anzeigen"
>
  <MonitorPlay class="w-4 h-4" />
</router-link>
```

`monitorRouteForLayout` (CDV:217-237):
```
scope='zone' + zoneId  → { name: 'monitor-zone-dashboard', params: { zoneId, dashboardId } }
scope='cross-zone'     → null (KEIN BUTTON!)
scope='sensor-detail'  → { name: 'monitor-sensor', params: ... }
scope=undefined        → null (KEIN BUTTON!)
```

**Ergebnis:** Navigiert zur Route `monitor-zone-dashboard` → MonitorView mit `isDashboardView=true` → rendert `<DashboardViewer :layoutId="..." showHeader />`. Das ist ein **eigenständiges Full-Screen-Dashboard** im Monitor, KEIN InlineDashboardPanel.

#### Mechanismus 2: MapPin Target-Konfigurator (Zeile 858-927)
```vue
<div v-if="dashStore.activeLayoutId && isEditing" ...>
  <button @click="showTargetConfig = !showTargetConfig">
    <MapPin />
  </button>
  <!-- Dropdown mit 4 Placement-Optionen -->
</div>
```

**KRITISCH:** Der MapPin-Button ist **ausschließlich im Edit-Modus sichtbar** (`v-if="... && isEditing"`).

Optionen im Dropdown:
- `Monitor — Inline` → `setTarget('monitor', 'inline')`
- `Monitor — Seitenpanel` → `setTarget('monitor', 'side-panel')`
- `Monitor — Unteres Panel` → `setTarget('monitor', 'bottom-panel')`
- `Übersicht — Seitenpanel` → `setTarget('hardware', 'side-panel')`
- `Anzeigeort entfernen` → `clearTarget()`
- Zone-Filter: `setZoneScope()` (optional)

**Target-Eindeutigkeit (`setLayoutTarget`, Store:1004-1037):**
Wenn ein anderes Dashboard dieselbe view+placement-Kombination hat, wird dessen Target automatisch geclearet. Sync zum Server via `syncLayoutToServer`.

**Broken Chain für "nichts passiert im Monitor":**

| Schritt | Status | Problem |
|---------|--------|---------|
| 1. User klickt MapPin | ⚠️ CONDITIONAL | Nur sichtbar wenn `isEditing === true` |
| 2. User wählt "Monitor — Inline" | ✅ OK | `setTarget()` ruft `setLayoutTarget()` auf |
| 3. Target wird gesetzt | ✅ OK | Store-State korrekt, Server-Sync getriggert |
| 4. User navigiert zu `/monitor` (L1) | ❌ NICHT SICHTBAR | `inlineMonitorPanelsCrossZone` wird auf L1 **nicht gerendert** |
| 5. User navigiert zu `/monitor/:zoneId` (L2) | ✅ SICHTBAR | `inlineMonitorPanelsL2` zeigt das Panel |
| 6. Feedback nach Target-Setzen | ❌ FEHLT | Kein Toast, kein Hinweis wo das Dashboard jetzt erscheint |

**Root Cause:** Kein visuelles Feedback nach Target-Setzen + User weiß nicht auf welchem Level (L1 vs. L2) das Dashboard erscheint. Inline-Panels erscheinen ausschließlich auf L2 (selectedZoneId != null).

---

### B3: Dashboard-Cards in der Übersicht

Es gibt **keine separate "Dashboard-Übersicht"-View**. Das gesamte Dashboard-Management läuft im **Editor-Dropdown** (`dashboard-builder__layout-dropdown`).

**Inhalt einer Dashboard-Card im Dropdown (Zeile 799-814):**
```
[   ] [DashboardName]  [Auto]  [🗑]
```
- Name (truncated via text-overflow)
- "Auto"-Badge wenn `autoGenerated === true`
- Löschen-Button (per Item)

**Fehlende Informationen:**
- Widget-Anzahl
- Scope (zone / cross-zone / zone-tile)
- Zone-Name wenn zone-scoped
- Letztes Update / Erstellungsdatum
- Target-Platzierung (wo wird es angezeigt?)

**Layout/CSS:**
- Schmale Dropdown-Liste (keine Grid/Card-Darstellung)
- Kein min-width, kein explizites max-width auf Items
- `text-overflow: ellipsis` auf Name → lange Namen werden abgeschnitten

**D1-Features:**
- Löschen pro Item (`handleDeleteSingleLayout`) → ✅ funktioniert (Confirm-Dialog)
- Bulk-Cleanup Button (`openBulkCleanup`) → ✅ funktioniert (Checkbox-Modal mit autoGenerated-Filter)
- Sortierung: Zeige-Reihenfolge = Array-Reihenfolge in `dashStore.layouts` (keine Sortierung)

**Fazit B3:** Die "Übersicht" ist ein compaktes Dropdown, keine dedizierte Dashboard-Gallerie. Der User kann keine Dashboard-Metadaten auf einen Blick erfassen.

---

## 2. Target-System Dokumentation

### DashboardTarget Interface (store:85-92)
```typescript
interface DashboardTarget {
  view: 'monitor' | 'hardware'
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'
  anchor?: string        // Nicht genutzt in Code
  panelPosition?: 'left' | 'right'  // Nicht genutzt in Code
  panelWidth?: number    // Nicht genutzt in Code
  order?: number         // Sort-Reihenfolge in Panel-Listen
}
```

**Aktiv genutzte Placements:** `inline`, `side-panel`, `bottom-panel` (via Editor-Dropdown)
**`page`-Placement:** Definiert aber nie gesetzt im Editor
**`anchor`/`panelPosition`/`panelWidth`:** Definiert aber nie genutzt

### DashboardLayout-Felder (store:94-109)
```typescript
interface DashboardLayout {
  scope?: 'zone' | 'zone-tile' | 'cross-zone' | 'sensor-detail'
  zoneId?: string        // Auf Layout-Ebene, NICHT auf Target
  target?: DashboardTarget
  autoGenerated?: boolean
  sensorId?: string
  // ...
}
```

### Datenfluss Client → Server → Client
```
Editor MapPin-Click
  → setLayoutTarget(layoutId, { view, placement })
  → layouts[idx].target = target (reaktiver Store-State)
  → persistLayouts() → localStorage
  → syncLayoutToServer(layoutId) → PUT /api/v1/dashboards/:serverId
                                  (payload: target als JSON-Feld)
  → MonitorView computed refresh (reaktiv auf layouts-Change)
  → InlineDashboardPanel rendert
```

**Server-seitige Persistenz:** Target wird als JSON-Feld `target` in der DB gespeichert. Bei `fetchLayouts()` wird es via `serverToLocal()` geladen (store:362).

**Auto-Migration:** Beim `fetchLayouts()` werden auto-generierte Zone-Dashboards ohne Target automatisch auf `{ view: 'monitor', placement: 'inline' }` gesetzt (store:391-404).

---

## 3. InlineDashboardPanel Bestandsaufnahme

### Alle 4 Verwendungsstellen in MonitorView

| # | Stelle | layoutId-Quelle | mode | compact | zoneId | Status |
|---|--------|----------------|------|---------|--------|--------|
| 1 | Zone-Tile Mini-Widget (L1) | `getZoneMiniPanelId(zone.zoneId)` | `view` | `true` | `zone.zoneId` | ✅ OK |
| 2 | L2 Inline-Panel | `inlineMonitorPanelsL2[n].id` | `manage` | `false` | `selectedZoneId` | ✅ OK |
| 3 | Bottom-Panel | `dashStore.bottomMonitorPanels[n].id` | `manage` | `false` | – | ✅ OK |
| 4 | Side-Panel | `dashStore.sideMonitorPanels[n].id` | `side-panel` | `false` | – | ✅ OK |

### Details pro Stelle

**1. Zone-Tile Mini-Widget:**
- Quelle: `getZoneMiniPanelId()` filtert `scope='zone-tile'` + alle Widget-Types in `TILE_ALLOWED_WIDGET_TYPES = Set(['gauge', 'sensor-card'])`
- Erstellt automatisch via `ensureZoneTileDashboard()` bei Zone-Render
- CompactMode: `ROW_HEIGHT_COMPACT = 70px`, kein Header, kein Padding
- Nur gauge/sensor-card möglich (Typ-Filter in `getZoneMiniPanelId`)

**2. L2 Inline-Panel:**
```typescript
// inlineMonitorPanelsL2 = cross-zone + zone-specific kombiniert
const inlineMonitorPanelsL2 = computed(() => {
  const cross = dashStore.inlineMonitorPanelsCrossZone     // scope !== 'zone' + target.placement='inline'
  const forZone = dashStore.inlineMonitorPanelsForZone(zoneId)  // scope='zone' + zoneId
  return [...cross, ...forZone].sort((a,b) => (a.target?.order ?? 0) - (b.target?.order ?? 0))
})
```
- Filtert: `target.view='monitor' && target.placement='inline'`
- Rendered bei: L2 (`selectedZoneId.value != null`)

**3. Bottom-Panel:**
- Filter: `target.view='monitor' && target.placement='bottom-panel'`
- Rendering: L1 und L2 (kein Zone-Scope-Filter)
- kein zoneId-Prop (Widgets können keinen Zone-Context nutzen)

**4. Side-Panel:**
- Filter: `target.view='monitor' && target.placement='side-panel'`
- Mode `side-panel`: single column stacking, `ROW_HEIGHT_SIDE = 120px`, borderless
- Layout `monitor-layout--has-side`: CSS-Grid mit Main + Side-Column
- kein zoneId-Prop

### InlineDashboardPanel Mode-System (Zeile 59-61)
```typescript
const isSidePanel = computed(() => props.mode === 'side-panel')
const isManageMode = computed(() => props.mode === 'manage' && authStore.isAuthenticated)
```
- `view` + `inline`: Read-only, kein Toolbar
- `manage`: Read-only + Hover-Toolbar (Gear + Trash, nur authenticated) — D4
- `side-panel`: Single-Column-Layout, kein Hover-Toolbar

### readOnly in useDashboardWidgets
InlineDashboardPanel ruft `useDashboardWidgets({ readOnly: true })` auf (IDP:48-53) → Widget-Komponenten erhalten `readOnly: true` Prop → Deaktiviert interaktive Kontrollen (z.B. Aktor-Toggle). Der Editor ruft es **ohne** `readOnly` auf.

### Vollständiges Dashboard in InlineDashboardPanel?
**JA** — kein Widget-Typ-Filter in InlineDashboardPanel selbst. Alle 10 Widget-Typen werden gerendert. CSS-Grid nutzt `grid-template-columns: repeat(12, 1fr)` mit originalen x/w-Koordinaten aus dem Layout.

---

## 4. Navigations-Matrix

### Dashboard-bezogene Routen (router/index.ts)

| Route | Name | Komponente | Modus |
|-------|------|------------|-------|
| `/editor` | `editor` | `CustomDashboardView` | Editor (leerer State) |
| `/editor/:dashboardId` | `editor-dashboard` | `CustomDashboardView` | Editor (spez. Dashboard) |
| `/monitor` | `monitor` | `MonitorView` | L1 Zone-Tiles |
| `/monitor/:zoneId` | `monitor-zone` | `MonitorView` | L2 Zone-Detail |
| `/monitor/:zoneId/dashboard/:dashboardId` | `monitor-zone-dashboard` | `MonitorView` | L3 DashboardViewer |
| `/monitor/:zoneId/sensor/:sensorId` | `monitor-sensor` | `MonitorView` | L3 Sensor-SlideOver |
| `/monitor/dashboard/:dashboardId` | *(kein Name)* | REDIRECT → `/editor/:id` | D2-Deprecated |

### Von/Nach-Matrix

| Von | Nach Editor | Nach Monitor L1 | Nach Monitor L2 (Zone) | Nach Monitor L3 (Dashboard) |
|-----|-------------|-----------------|------------------------|-----------------------------|
| **Editor** | — | — | — | MonitorPlay-Link (nur scope=zone+zoneId) |
| **Monitor L1** | — | — | Klick auf Zone-Tile | — |
| **Monitor L2** | InlineDashboardPanel `<Pencil>`-Link (pro Panel) | `<ArrowLeft>`-Button | — | Dashboard-Link in Abschnitt "Dashboards" |
| **Monitor L3** | — | `<ArrowLeft>`-Button | — | — |
| **QuickDashboardPanel** | `navigateToEditor(id)` | — | — | `navigateToDashboard(id)` → `/editor/:id` |

**Achtung QuickDashboardPanel:** `navigateToDashboard()` navigiert zu `{ name: 'editor-dashboard' }` — also zum **Editor**, nicht zum Monitor! Der Name ist irreführend (Zeile 52).

### Fehlende Navigationswege
1. **Editor → Monitor L1:** Kein direkter Link
2. **Editor → Monitor L2:** Nur für zone-scope Dashboards (MonitorPlay-Button → L3)
3. **Monitor L1 → Editor eines bestimmten Dashboards:** Nur über Zone-Tile → L2 → InlineDashboardPanel-Pencil-Link
4. **Cross-Zone Dashboard:** Kein "Im Monitor anzeigen"-Button im Editor

---

## 5. Broken-Chain-Analyse

### Bug 1: Ansichtsmodus = visuell identisch zu Edit-Modus

**Bruchstelle:** `CustomDashboardView.vue:1031-1039`
```vue
<div ref="gridContainer" :class="['grid-stack', { 'grid-stack--editing': isEditing }]" />
```
Es gibt keine alternative View-Darstellung für `isEditing === false`. GridStack bleibt aktiv, nur locked. Keine CSS-Klasse `.grid-stack--view-mode` mit anderen Widget-Styles.

**Fehlend:** Ein `v-if/v-else`-Switch der im View-Modus auf InlineDashboardPanel oder DashboardViewer umschaltet.

---

### Bug 2: "Im Monitor anzeigen" — kein Feedback

**Bruchstellen:**
1. `CustomDashboardView.vue:858`: `v-if="... && isEditing"` → MapPin nur im Edit-Modus
2. `CustomDashboardView.vue:176-181`: `setTarget()` ruft `showTargetConfig = false` auf, aber kein Toast/Feedback
3. `MonitorView.vue:1471-1485`: `inlineMonitorPanelsL2` nur auf L2 sichtbar — User auf L1 sieht nichts

**Fehlend:** Toast nach Target-Setzen ("Dashboard wird jetzt in Monitor [Zone X] — Inline angezeigt"), Deep-Link-Button ("Im Monitor anzeigen" → navigiert zur richtigen L2-Route).

---

### Bug 3: MonitorPlay-Button nicht sichtbar für neue Dashboards

**Bruchstelle:** `CustomDashboardView.vue:848-855`
```vue
<router-link v-if="monitorRouteForLayout" ...>
```
`monitorRouteForLayout` ist `null` für:
- scope = undefined (neues Dashboard ohne Scope)
- scope = cross-zone
- scope = zone-tile

**Fehlend:** Fallback-Verhalten (z.B. Link zu `/monitor` ohne dashboardId).

---

### Bug 4: QuickDashboardPanel navigiert immer zum Editor

**Bruchstelle:** `QuickDashboardPanel.vue:52`
```typescript
function navigateToDashboard(dashboardId: string): void {
  void router.push({ name: 'editor-dashboard', params: { dashboardId } })
```
Name-Konflikt: Die Funktion heißt `navigateToDashboard`, navigiert aber zum Editor.

---

### Bug 5: Dashboard-Übersicht als Dropdown statt Gallerie

**Bruchstelle:** `CustomDashboardView.vue:799-814`
Kein dedizierter View für Dashboard-Liste. Nur Dropdown mit Name+Auto+Delete. Fehlende Metadaten.

---

### Bug 6: `page`-Placement niemals nutzbar

**Bruchstelle:** `dashboard.store.ts:88` — `placement: 'page'` ist im Interface definiert aber im Editor-Dropdown nicht angeboten. `monitorRouteForLayout` (CDV:217-237) behandelt kein `placement='page'`.

---

## 6. Fix-Empfehlungen

| # | Finding | Fix | Datei | Aufwand |
|---|---------|-----|-------|---------|
| F1 | Ansichtsmodus visuell identisch | Im View-Modus GridStack durch InlineDashboardPanel/DashboardViewer ersetzen (v-if isEditing switch) | `CustomDashboardView.vue` | 4-6h |
| F2 | Kein Feedback nach Target-Setzen | Toast nach `setTarget()`: "Dashboard wird in Monitor [Placement] angezeigt" + Deep-Link-Button zu Monitor | `CustomDashboardView.vue` | 1h |
| F3 | MapPin nur im Edit-Modus | MapPin auch im View-Modus zeigen (nur `v-if="activeLayoutId"` ohne `isEditing`) | `CustomDashboardView.vue` | 15min |
| F4 | MonitorPlay fehlt für cross-zone | Fallback-Route zu `/monitor` wenn scope undefined/cross-zone, mit optionalem toast | `CustomDashboardView.vue` | 30min |
| F5 | QuickDashboardPanel navigiert zum Editor | `navigateToDashboard()` auf `monitor-zone-dashboard` oder `monitor` umleiten | `QuickDashboardPanel.vue` | 15min |
| F6 | Dashboard-Dropdown statt Gallerie | Eigener `/dashboards`-View oder Erweiterung des Dropdowns mit Scope/Widget-Count/Target-Info | Neue View | 6-10h |
| F7 | `page`-Placement tot | Entweder implementieren (Editor → Standalone-Page) oder aus Interface entfernen | `dashboard.store.ts` | 1h |
| F8 | Kein zoneId-Prop für bottom/side panels | `selectedZoneId ?? undefined` auch für bottom-panel und side-panel übergeben | `MonitorView.vue` | 15min |

---

## 7. Aufwand-Schätzung (Gesamt)

| Priorität | Fixes | Aufwand |
|-----------|-------|---------|
| **Kritisch** (F2, F3, F4) | Feedback + Sichtbarkeit | ~2h |
| **Hoch** (F1) | Echter Preview-Modus | ~5h |
| **Mittel** (F5, F7, F8) | Navigation-Fixes + Cleanup | ~1.5h |
| **Optional** (F6) | Dashboard-Gallerie | ~8h |
| **Gesamt** | | ~16h |

---

## 8. Zusammenfassung

Das Target-System (InlineDashboardPanel in Monitor) ist **technisch korrekt und funktionsfähig**. Alle 4 Verwendungsstellen in MonitorView funktionieren wenn das Target korrekt gesetzt ist. Die Store-Computed-Properties filtern korrekt.

**Die drei Kernprobleme sind UX-Probleme, keine Logik-Fehler:**

1. **Ansichtsmodus** rendert identisch zum Edit-Modus — kein visueller Unterschied, kein echter Preview.
2. **"Im Monitor anzeigen"** ist durch schlechte Sichtbarkeit (MapPin nur im Edit-Modus) und fehlendes Feedback nach dem Setzen kaputt aus User-Sicht — obwohl die Pipeline intern funktioniert.
3. **Dashboard-Cards** sind ein kompaktes Dropdown ohne Metadaten, nicht eine durchsuchbare Gallerie.

Die Route `monitor-zone-dashboard` ist aktiv und führt zu DashboardViewer (Full-Screen) — das ist der direkte "Im Monitor anzeigen"-Weg für zone-scope Dashboards.

Der QuickDashboardPanel hat einen funktionalen Bug: `navigateToDashboard` leitet zum Editor, nicht zum Monitor.
