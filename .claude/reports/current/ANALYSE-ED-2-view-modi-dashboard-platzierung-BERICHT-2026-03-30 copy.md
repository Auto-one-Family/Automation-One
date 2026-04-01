# ANALYSE-ED-2 — Analysebericht: View-Modi, Dashboard-Platzierung & Navigation

> **Datum:** 2026-03-30
> **Typ:** Analysebericht (keine Code-Änderungen)
> **Schicht:** Frontend (El Frontend)
> **Analysierte Dateien:** CustomDashboardView.vue (1935 Zeilen, vollständig), MonitorView.vue (3490 Zeilen, vollständig), InlineDashboardPanel.vue (424 Zeilen, vollständig), dashboard.store.ts (vollständig), router/index.ts (vollständig), useDashboardWidgets.ts (vollständig)
> **Hinweis:** QuickDashboardPanel.vue existiert nicht im Projekt

---

## 1. IST-Zustand der Modi

### B1: Ansichtsmodus (`isEditing`-Toggle)

**Initial-State:** `isEditing = ref(false)` (CDV:106) — der Ansichtsmodus ist der **Default** beim Öffnen des Editors.

**Ausnahme:** `handleCreateLayout()` (CDV:596) und `handleCreateFromTemplate()` (CDV:613) setzen `isEditing.value = true` direkt — beim Erstellen eines neuen Dashboards startet man sofort im Edit-Modus.

**Toggle-Funktion `toggleEditMode()` (CDV:314–330):**
```
isEditing = true  → grid.enableMove(true), grid.enableResize(true),
                    grid.opts.removable = true, showCatalog = true
isEditing = false → grid.enableMove(false), grid.enableResize(false),
                    grid.opts.removable = false, showCatalog = false,
                    configPanelOpen = false
```

**Was im Ansichtsmodus verschwindet (v-if Bedingungen):**

| Element | Bedingung | Zeile |
|---------|-----------|-------|
| Widget-Katalog-Sidebar | `showCatalog && isEditing` | 975 |
| MapPin Target-Konfigurator | `activeLayoutId && isEditing` | 858 |
| Plus-Button (Katalog öffnen) | `isEditing` | 938 |
| Import-Button | `isEditing` | 944 |
| Delete-Dashboard-Button | `activeLayoutId && isEditing` | 948 |

**Was im Ansichtsmodus BLEIBT:**
- Vollständige Toolbar inkl. "Dashboard Builder"-Titel
- Layout-Selector Dropdown
- Export-Button (kein `v-if` auf `isEditing`)
- MonitorPlay-Link-Button (Bedingung: `v-if="monitorRouteForLayout"`, unabhängig von `isEditing`)
- Pencil/Eye-Toggle-Button selbst (`v-if="activeLayoutId"`)
- GridStack-Container → **gleiche visuelle Darstellung wie Edit-Mode**, nur Interaktivität deaktiviert

**CSS-Klassen die sich ändern:**
- `.grid-stack--editing` (CDV:1035): gesetzt wenn `isEditing === true`, entfernt bei `false`
- `.grid-stack--drop-target` (CDV:1036): gesetzt wenn `isEditing && dragStore.isDraggingDashboardWidget`
- `.dashboard-builder__tool-btn--active` am Edit/Eye-Toggle (CDV:931): `:class="{ active: isEditing }"`

**Root Cause warum kein sichtbarer Unterschied:**
1. Es gibt **kein `v-if/v-else`** das im View-Modus auf InlineDashboardPanel oder DashboardViewer umschaltet. Der GridStack-Container wird immer im selben `v-else`-Block (CDV:1034–1039) gerendert.
2. `.grid-stack--editing` hat im Stylesheet keine visuell differenzierende Style-Auswirkung — nur GridStack-interne Interaktivitäts-Änderungen.
3. Widget-Header mit Typ-Badge und Titel bleiben in beiden Modi identisch.
4. `useDashboardWidgets` wird im Editor **ohne `readOnly`**-Parameter aufgerufen (CDV:53–80) — die Option existiert, wird aber nicht gesetzt.
5. Es gibt einen Empty-State `v-else-if="!isEditing && widgets.length === 0"` (CDV:1017), aber nur für leere Dashboards.

**Vollständige Toolbar-Button-Liste:**

| Button | Icon | Bedingung | Aktion |
|--------|------|-----------|--------|
| MonitorPlay-Link | MonitorPlay | `v-if="monitorRouteForLayout"` | Router-Link zu Monitor |
| MapPin + Dropdown | MapPin | `v-if="activeLayoutId && isEditing"` | Target-Konfigurator öffnen |
| Edit/Eye-Toggle | Pencil/Eye | `v-if="activeLayoutId"` | `toggleEditMode()` |
| Plus | Plus | `v-if="isEditing"` | Katalog öffnen |
| Export | Download | immer sichtbar | Dashboard exportieren |
| Import | Upload | `v-if="isEditing"` | Dashboard importieren |
| Löschen | Trash2 | `v-if="activeLayoutId && isEditing"` | Dashboard löschen |

**Fazit B1:** Der Ansichtsmodus deaktiviert GridStack-Interaktion und blendet Editor-Werkzeuge aus, rendert aber visuell identisch zum Editor. Ein echter "Preview-Modus" (Umschalten auf InlineDashboardPanel oder DashboardViewer) fehlt.

---

### B2: "Im Monitor anzeigen" — Target-System

Das System besteht aus **zwei separaten Mechanismen** die unterschiedliche Dinge tun:

#### Mechanismus 1: MonitorPlay-Button (CDV:848–855)

```vue
<router-link
  v-if="monitorRouteForLayout"
  :to="monitorRouteForLayout"
  title="Im Monitor anzeigen"
>
  <MonitorPlay class="w-4 h-4" />
</router-link>
```

`monitorRouteForLayout` computed (CDV:217–237):
```
scope='zone' + zoneId  → { name: 'monitor-zone-dashboard', params: { zoneId, dashboardId } }
scope='cross-zone'     → null (KEIN BUTTON!)
scope='sensor-detail'  → { name: 'monitor-sensor', params: { zoneId, sensorId } }
scope=undefined        → null (KEIN BUTTON!)
```

**Ergebnis:** Navigiert zu Route `monitor-zone-dashboard` → MonitorView mit `isDashboardView=true` → rendert `<DashboardViewer :layoutId="..." showHeader />`. Das ist ein **eigenständiges Full-Screen-Dashboard** im Monitor-Kontext, KEIN InlineDashboardPanel.

#### Mechanismus 2: MapPin Target-Konfigurator (CDV:858–927)

```vue
<div v-if="dashStore.activeLayoutId && isEditing" ...>
  <button @click="showTargetConfig = !showTargetConfig">
    <MapPin />
  </button>
  <!-- Dropdown -->
</div>
```

**KRITISCH:** Der MapPin-Button ist **ausschließlich im Edit-Modus sichtbar** (`&& isEditing`). Im Ansichtsmodus (Default beim Öffnen) ist er nicht erreichbar.

**Target-Dropdown — alle 5 Optionen:**

| Option | Aufruf | Beschreibung |
|--------|--------|--------------|
| Monitor — Inline | `setTarget('monitor', 'inline')` | Unter den Zone-Kacheln |
| Monitor — Seitenpanel | `setTarget('monitor', 'side-panel')` | Fixiert rechts |
| Monitor — Unteres Panel | `setTarget('monitor', 'bottom-panel')` | Unter Hauptinhalt |
| Übersicht — Seitenpanel | `setTarget('hardware', 'side-panel')` | Rechts in Hardware-View |
| Anzeigeort entfernen | `clearTarget()` | `v-if="activeTarget"` |

Zusätzlich: Zone-Scope-Selector (CDV:913–925), nur `v-if="activeTarget?.view === 'monitor' && availableZones.length > 0"`.

**`setTarget()` Implementierung (CDV:176–181):**
```ts
function setTarget(view, placement) {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, { view, placement })
  showTargetConfig.value = false  // Dropdown schließt sich, KEIN Toast/Feedback
}
```

**`clearTarget()` Implementierung (CDV:197–203):**
```ts
function clearTarget() {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, null)
  selectedZoneId.value = null
  showTargetConfig.value = false  // Dropdown schließt sich, KEIN Toast/Feedback
}
```

**Broken Chain für "nichts passiert im Monitor":**

| Schritt | Status | Problem |
|---------|--------|---------|
| 1. User öffnet Editor | ⚠️ KEIN MapPin | `isEditing` default = false → MapPin unsichtbar |
| 2. User schaltet zu Edit-Mode | ✅ OK | MapPin erscheint |
| 3. User wählt "Monitor — Inline" | ✅ OK | `setLayoutTarget()` aufgerufen |
| 4. Target wird gesetzt | ✅ OK | Store-State korrekt, Server-Sync |
| 5. Feedback für User | ❌ FEHLT | Kein Toast, kein Hinweis |
| 6. User navigiert zu `/monitor` (L1) | ❌ NICHT SICHTBAR | Inline-Panels nur auf L2 |
| 7. User navigiert zu `/monitor/:zoneId` (L2) | ✅ SICHTBAR | `inlineMonitorPanelsL2` zeigt Panel |

**Root Cause:** Zwei UX-Probleme: (a) MapPin nur im Edit-Modus → Nutzer findet ihn nicht. (b) Kein Feedback was und wo das Dashboard jetzt erscheint. Die Pipeline selbst ist technisch korrekt.

---

### B3: Dashboard-Cards in der Übersicht

Es gibt **keine dedizierte Dashboard-Übersichts-View**. Alle Dashboard-Verwaltung läuft im **Dropdown des Layout-Selectors** (CDV:788–843).

**Inhalt des Dropdowns pro Dashboard-Eintrag:**
```
[Checkbox] [Name (truncated)] [Auto-Badge]  [🗑 Trash]
```

**Fehlende Metadaten:**
- Widget-Anzahl
- Scope (`zone` / `cross-zone` / `zone-tile`)
- Zone-Name wenn zone-scoped
- Target-Platzierung (wo wird es angezeigt?)
- Letztes Update / Erstellungsdatum

**Layout/CSS:**
- Schmale Dropdown-Liste (keine Grid/Card-Darstellung)
- `text-overflow: ellipsis` auf Name → lange Namen werden abgeschnitten
- Keine Sortierung (Reihenfolge = `dashStore.layouts`-Array)

**D1-Features:**
- Löschen pro Item: `handleDeleteSingleLayout()` → ✅ funktioniert (Confirm-Dialog)
- Bulk-Cleanup: `openBulkCleanup()` → ✅ funktioniert (Checkbox-Modal, `v-if="autoGeneratedLayouts.length > 0"`)

**Dropdown-Struktur vollständig (CDV:788–843):**
1. Bulk-Cleanup-Button (nur wenn `autoGeneratedLayouts.length > 0`)
2. Divider
3. Layout-Liste: alle `dashStore.layouts` mit Name / Auto-Badge / Trash
4. Divider
5. Template-Sektion: "Vorlagen" + `DASHBOARD_TEMPLATES` (iteriert via `dashStore.DASHBOARD_TEMPLATES`)
6. Divider
7. Input + Create-Button für neues Dashboard

**Fazit B3:** Die "Übersicht" ist ein kompaktes Dropdown ohne Metadaten, keine durchsuchbare Galerie.

---

## 2. Target-System Dokumentation

### DashboardTarget Interface (store:85–92)

```typescript
interface DashboardTarget {
  view: 'monitor' | 'hardware'
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'
  anchor?: string          // Definiert, niemals genutzt
  panelPosition?: 'left' | 'right'  // Definiert, niemals genutzt
  panelWidth?: number      // Definiert, niemals genutzt
  order?: number           // Sort-Reihenfolge in Panel-Listen
}
```

**Aktiv genutzte Placements:** `inline`, `side-panel`, `bottom-panel` (via Editor-Dropdown)
**Nie gesetzt:** `page`, `anchor`, `panelPosition`, `panelWidth`

### DashboardLayout — relevante Felder (store:95–109)

```typescript
interface DashboardLayout {
  id: string
  serverId?: string
  name: string
  scope?: 'zone' | 'zone-tile' | 'cross-zone' | 'sensor-detail'  // DashboardScope
  zoneId?: string          // Auf Layout-Ebene, NICHT auf Target
  target?: DashboardTarget
  autoGenerated?: boolean
  sensorId?: string
  widgets: DashboardWidget[]
  // ...
}
```

### Datenfluss Client → Server → Client

```
Editor MapPin-Klick (nur isEditing=true)
  → setTarget(view, placement) in CDV
  → dashStore.setLayoutTarget(layoutId, { view, placement })
    → Uniqueness-Check: altes Holder-Layout verliert sein Target
    → layouts[idx].target = target
    → persistLayouts() → localStorage
    → syncLayoutToServer(layoutId) → PUT /api/v1/dashboards/:serverId
                                    (payload: target als JSON-Feld)

Beim Laden:
  → fetchLayouts() → GET /api/v1/dashboards
  → serverToLocal(): target = dto.target as DashboardTarget (direkt gecastet)
  → Auto-Migration: scope='zone' + autoGenerated + !target
      → target = { view:'monitor', placement:'inline' }

Reaktivität:
  → MonitorView computed (inlineMonitorPanelsL2, sideMonitorPanels, bottomMonitorPanels)
    reagiert auf layouts-State-Änderung → InlineDashboardPanel rendert
```

**Server-seitige Persistenz:** `target` als JSON-Feld in DB. Kein Schema-Validation-Casting — direkte Serialisierung/Deserialisierung.

**Auto-Migration (fetchLayouts):**
- Betrifft: `scope='zone' && autoGenerated && !target`
- Aktion: `target = { view: 'monitor', placement: 'inline' }` + persistLayouts + syncLayoutToServer
- `generateZoneDashboard()` setzt ebenfalls direkt `target: { view: 'monitor', placement: 'inline' }` für neue auto-generated Layouts

---

## 3. InlineDashboardPanel Bestandsaufnahme

### Alle 4 Verwendungsstellen in MonitorView

| # | Stelle | layoutId-Quelle | mode | compact | zoneId | Zeile |
|---|--------|----------------|------|---------|--------|-------|
| 1 | Zone-Tile Mini-Widget (L1) | `getZoneMiniPanelId(zone.zoneId)` | `view` | `true` | `zone.zoneId` | MV:1756 |
| 2 | L2 Inline-Panel | `inlineMonitorPanelsL2[n].id` | `manage` | — | `selectedZoneId ?? undefined` | MV:2056 |
| 3 | Bottom-Panel | `dashStore.bottomMonitorPanels[n].id` | `manage` | — | — | MV:2074 |
| 4 | Side-Panel | `dashStore.sideMonitorPanels[n].id` | `side-panel` | — | — | MV:2085 |

### Details pro Verwendungsstelle

**Stelle 1 — Zone-Tile Mini-Widget (MV:1756–1764):**
```html
<InlineDashboardPanel
  v-if="getZoneMiniPanelId(zone.zoneId)"
  :layout-id="getZoneMiniPanelId(zone.zoneId)!"
  :zone-id="zone.zoneId"
  :compact="true"
  mode="view"
  class="monitor-zone-tile__mini-widget"
/>
```
- `getZoneMiniPanelId()` (MV:942–951): filtert `scope='zone-tile' && zoneId === param`, prüft ob alle Widgets in `TILE_ALLOWED_WIDGET_TYPES = new Set(['gauge', 'sensor-card'])` (MV:935)
- `compact=true` → `ROW_HEIGHT_COMPACT = 70px`, kein Header
- `ensureZoneTileDashboard()` wird via watch aufgerufen und erstellt das Layout automatisch

**Stelle 2 — L2 Inline-Panel (MV:2056–2062):**
```html
<InlineDashboardPanel
  v-for="panel in inlineMonitorPanelsL2"
  :layoutId="panel.id"
  :zone-id="selectedZoneId ?? undefined"
  mode="manage"
/>
```
- Alle 10 Widget-Typen werden gerendert (kein Typ-Filter)
- `zoneId` wird übergeben (Zone-Context für Widget-Daten)
- `mode="manage"`: zeigt Hover-Toolbar (Gear + Trash) für Auth-User

**Stelle 3 — Bottom-Panel (MV:2074–2081):**
```html
<div v-if="dashStore.bottomMonitorPanels?.length > 0" class="monitor-layout__bottom">
  <InlineDashboardPanel
    v-for="panel in dashStore.bottomMonitorPanels"
    :layoutId="panel.id"
    mode="manage"
  />
</div>
```
- Kein `zoneId`-Prop → Widgets haben keinen Zone-Context
- `max-height: 400px; overflow-y: auto;`

**Stelle 4 — Side-Panel (MV:2085–2092):**
```html
<aside v-if="dashStore.sideMonitorPanels.length > 0" class="monitor-layout__side">
  <InlineDashboardPanel
    v-for="panel in dashStore.sideMonitorPanels"
    :layoutId="panel.id"
    mode="side-panel"
  />
</aside>
```
- `mode="side-panel"`: `ROW_HEIGHT_SIDE = 120px`, single-column stacking
- CSS-Grid: `.monitor-layout--has-side` → `grid-template-columns: 1fr 300px` (fixe 300px)
- `position: sticky; top: 0;` auf Desktop
- Kein `zoneId`-Prop

### InlineDashboardPanel Props (IDP:28–40)

```typescript
interface Props {
  layoutId: string
  mode?: 'view' | 'manage' | 'inline' | 'side-panel'  // Default: 'inline'
  zoneId?: string
  compact?: boolean  // Default: false
}
```

### InlineDashboardPanel Mode-System

| Mode | Toolbar | Row-Height | Layout | Wer nutzt es |
|------|---------|------------|--------|--------------|
| `view` | Nein | 80px (INLINE) | 12-col grid | Stelle 1 (compact=true → 70px) |
| `inline` | Nein | 80px | 12-col grid | Default, nicht explizit in MonitorView genutzt |
| `manage` | Ja (Auth-User) | 80px | 12-col grid | Stellen 2, 3 |
| `side-panel` | Nein | 120px | single column | Stelle 4 |

**Hinweis:** `mode='view'` und `mode='inline'` verhalten sich **identisch** — kein Code-Unterschied (IDP:59–66 zeigt nur `isSidePanel` und `isManageMode` computed, kein `isViewMode`).

### useDashboardWidgets in InlineDashboardPanel (IDP:48–53)

```ts
const { ... } = useDashboardWidgets({
  showConfigButton: false,
  showWidgetHeader: false,
  readOnly: true,
  zoneId: zoneIdRef as Ref<string | undefined>,
})
```

`readOnly: true` betrifft **ausschließlich** den `actuator-card`-Widget-Typ (useDashboardWidgets:263–265):
```ts
if (readOnly && type === 'actuator-card') {
  props.readOnly = true
}
```
Alle anderen Widget-Typen (gauge, line-chart, sensor-card, etc.) sind von `readOnly` nicht betroffen.

### Kann InlineDashboardPanel ein vollständiges Dashboard rendern?

**JA.** IDP hat keinen Widget-Typ-Filter. Alle 10 Widget-Typen werden gerendert. CSS-Grid nutzt `grid-template-columns: repeat(12, 1fr)` mit originalen x/w-Koordinaten aus dem Layout.

---

## 4. Store Computed Properties — Filter-Logik

### `_inlineMonitorBase` (store:966–967)
```ts
const _inlineMonitorBase = (l: DashboardLayout) =>
  l.target?.view === 'monitor' && l.target?.placement === 'inline'
```

### `inlineMonitorPanelsCrossZone` (store:970–974)
```ts
computed(() =>
  layouts.value
    .filter(l => _inlineMonitorBase(l) && (l.scope !== 'zone' || l.scope == null))
    .sort(...)
)
```
Inkludiert: `scope !== 'zone'` — also `zone-tile`, `cross-zone`, `sensor-detail`, `undefined`.
Exkludiert: nur `scope === 'zone'`.

### `inlineMonitorPanels` (store:984)
```ts
const inlineMonitorPanels = inlineMonitorPanelsCrossZone
```
Direktes Alias-Assignment (kein neues `computed()`). Identisch mit `inlineMonitorPanelsCrossZone`.

### `inlineMonitorPanelsForZone(zoneId)` (store:977–981)
```ts
layouts.value.filter(l => _inlineMonitorBase(l) && l.scope === 'zone' && l.zoneId === zoneId)
```

### `inlineMonitorPanelsL2` (MonitorView, MV:1471–1485)
```ts
const cross = dashStore.inlineMonitorPanelsCrossZone        // scope != 'zone'
const forZone = dashStore.inlineMonitorPanelsForZone(zoneId)  // scope === 'zone' + zoneId match
// dedupliziert by id, sortiert nach target.order
```
Nur sichtbar wenn `selectedZoneId != null` (L2).

### `sideMonitorPanels` (store:987–990)
```ts
layouts.value.filter(l =>
  l.target?.view === 'monitor' && l.target?.placement === 'side-panel'
)
// Kein Scope-Filter — alle Scopes
```

### `bottomMonitorPanels` (store:992–996)
```ts
layouts.value.filter(l =>
  l.target?.view === 'monitor' && l.target?.placement === 'bottom-panel'
)
// Kein Scope-Filter — alle Scopes
```

---

## 5. Navigations-Matrix

### Dashboard-bezogene Routen (router/index.ts)

| Name | Path | Komponente | Modus |
|------|------|------------|-------|
| `editor` | `/editor` | CustomDashboardView | Editor, kein Layout |
| `editor-dashboard` | `/editor/:dashboardId` | CustomDashboardView | Editor, Dashboard geladen |
| `monitor` | `/monitor` | MonitorView | L1 Zone-Tiles |
| `monitor-zone` | `/monitor/:zoneId` | MonitorView | L2 Zone-Detail |
| `monitor-zone-dashboard` | `/monitor/:zoneId/dashboard/:dashboardId` | MonitorView | L3 DashboardViewer |
| `monitor-sensor` | `/monitor/:zoneId/sensor/:sensorId` | MonitorView | L3 Sensor-SlideOver |
| *(kein Name)* | `/monitor/dashboard/:dashboardId` | REDIRECT → `/editor/:id` | D2-Deprecated |
| *(kein Name)* | `/custom-dashboard` | REDIRECT → `/editor` | Deprecated 2026-03-01 |

**`monitor-zone-dashboard`:** MonitorView setzt `isDashboardView = computed(() => !!route.params.dashboardId)`. Bei `isDashboardView=true` rendert MonitorView `<DashboardViewer :layoutId="selectedDashboardId" showHeader />` statt L1/L2-Ansicht. Alle InlineDashboardPanels sind bei `isDashboardView=true` nicht sichtbar.

### Von/Nach-Matrix

| Von | Nach Editor | Nach Monitor L1 | Nach Monitor L2 | Nach Monitor L3 |
|-----|-------------|-----------------|-----------------|-----------------|
| **Editor** | — | — | — | MonitorPlay-Link (nur scope=zone+zoneId) |
| **Monitor L1** | — | — | Zone-Tile-Klick | — |
| **Monitor L2** | InlineDashboardPanel Header-Pencil-Link (pro Panel) | `<ArrowLeft>`-Button | — | Dashboard-Link in Zone-Dashboards-Sektion |
| **Monitor L3 (DashboardViewer)** | — | `<ArrowLeft>`-Button | — | — |

**Breadcrumb-Navigation:** Es gibt keine explizite Breadcrumb-Komponente. Navigation erfolgt über:
- `goBack()` (MV:1441): `router.push({ name: 'monitor' })` — von L2/L3 zu L1
- `goToPrevZone()` / `goToNextZone()` — via `router.replace({ name: 'monitor-zone', params: { zoneId } })`
- `handleClaimLayout(layoutId)` (MV:1619): `router.push({ name: 'editor-dashboard', params: { dashboardId: layoutId } })`

### Fehlende Navigationswege

1. **Editor → Monitor L1:** Kein direkter Link
2. **Editor → Monitor L2:** Nur für scope=zone Dashboards via MonitorPlay-Button (geht zu L3/DashboardViewer, nicht L2)
3. **Monitor L1 → Editor eines bestimmten Dashboards:** Nur über Zone-Tile → L2 → InlineDashboardPanel-Header-Pencil
4. **Cross-Zone Dashboard im Monitor anzeigen:** Kein MonitorPlay-Button (`monitorRouteForLayout` gibt `null` zurück)
5. **Scope=undefined Dashboard:** Kein MonitorPlay-Button

---

## 6. Broken-Chain-Analyse

### Bug 1: Ansichtsmodus visuell identisch zu Edit-Modus

**Bruchstelle:** CDV:1031–1039
```vue
<div v-else>
  <div ref="gridContainer"
    :class="['grid-stack',
      { 'grid-stack--editing': isEditing },
      { 'grid-stack--drop-target': isEditing && dragStore.isDraggingDashboardWidget }
    ]"
  />
</div>
```
Es gibt keinen alternativen Render-Zweig für `isEditing === false`. Die `v-else`-Semantik zeigt immer denselben GridStack-Container, unabhängig vom Modus.

**Fehlend:** Ein `v-if/v-else` der im View-Modus auf `<InlineDashboardPanel>` oder `<DashboardViewer>` umschaltet.

---

### Bug 2: MapPin erst nach Edit-Mode-Aktivierung erreichbar

**Bruchstelle:** CDV:858
```vue
<div v-if="dashStore.activeLayoutId && isEditing">
```
Der MapPin-Button ist die primäre UI für "Im Monitor anzeigen", ist aber nur im Edit-Modus sichtbar. Da `isEditing` default `false` ist, muss der User erst aktiv in den Edit-Modus wechseln, bevor er das Target setzen kann.

**Fehlend:** `v-if="dashStore.activeLayoutId"` ohne `&& isEditing`.

---

### Bug 3: Kein Feedback nach Target-Setzen

**Bruchstellen:**
- CDV:176–181: `setTarget()` schließt nur `showTargetConfig = false`, kein Toast
- CDV:197–203: `clearTarget()` analog
- CDV:858–927: Dropdown zeigt nach Auswahl visuell an was gesetzt ist (aktives Icon), aber kein persistentes Feedback und kein Hinweis wo das Dashboard jetzt erscheint
- User auf L1 (/monitor) sieht das Panel **nicht** — `inlineMonitorPanelsCrossZone` wird auf L1 nicht gerendert (kein InlineDashboardPanel-Slot in L1-Tiles außer Zone-Tile Mini-Widgets)

**Fehlend:** Toast nach `setTarget()` mit Ziel-Information ("Dashboard wird in Monitor — Inline angezeigt") + Deep-Link-Button.

---

### Bug 4: MonitorPlay-Button fehlt für cross-zone und scope=undefined

**Bruchstelle:** CDV:217–237 (`monitorRouteForLayout` gibt `null` zurück für)
- `scope === undefined` (neues Dashboard ohne Scope)
- `scope === 'cross-zone'`
- `scope === 'zone-tile'`

Für diese Fälle ist der MonitorPlay-Button (`v-if="monitorRouteForLayout"`) komplett unsichtbar.

**Fehlend:** Fallback-Route oder alternativer Navigationsmechanismus für cross-zone Dashboards.

---

### Bug 5: `page`-Placement niemals nutzbar

**Bruchstelle:** `DashboardTarget.placement: 'page'` (store:88) — definiert aber:
- Nie im Editor-Dropdown angeboten
- `monitorRouteForLayout` (CDV:217–237) behandelt `placement='page'` nicht
- Kein InlineDashboardPanel-Slot für `placement='page'` in MonitorView

**Fehlend:** Entweder implementieren oder aus Interface entfernen.

---

### Bug 6: `anchor`, `panelPosition`, `panelWidth` definiert aber nie genutzt

**Bruchstelle:** `DashboardTarget` Interface (store:85–92):
```typescript
anchor?: string
panelPosition?: 'left' | 'right'
panelWidth?: number
```
Diese Felder werden in keiner Computed-Property, keinem Filter, keinem Template genutzt. Side-Panel hat keine `panelPosition`-Unterscheidung (immer rechts, fixe 300px).

---

### Bug 7: Dashboard-Dropdown statt Gallerie

**Bruchstelle:** CDV:788–843 — Kein dedizierter View für Dashboard-Liste. Nur kompaktes Dropdown mit Name/Auto/Delete.

---

### Bug 8: `zoneId` fehlt bei Bottom/Side-Panels

**Bruchstelle:** MV:2074–2092 — Bottom-Panel (Stelle 3) und Side-Panel (Stelle 4) erhalten kein `zoneId`-Prop. Widgets in diesen Panels (z.B. SensorCard, Gauge) können keinen Zone-Context nutzen.

**Fehlend:** `selectedZoneId ?? undefined` analog zu Stelle 2.

---

### Bug 9: `inlineMonitorPanels` Alias-Assignment (kein `computed()`)

**Bruchstelle:** store:984
```ts
const inlineMonitorPanels = inlineMonitorPanelsCrossZone  // kein computed()
```
Beide Variablen zeigen auf dieselbe `computed()`-Referenz. Nicht falsch, aber inkonsistent mit `sideMonitorPanels` und `bottomMonitorPanels` die explizite `computed()`s sind. Falls `inlineMonitorPanelsCrossZone` ersetzt wird, muss `inlineMonitorPanels` auch aktualisiert werden.

---

## 7. Fix-Empfehlungen

| # | Bug | Fix | Datei | Aufwand |
|---|-----|-----|-------|---------|
| F1 | Ansichtsmodus visuell identisch | `v-if/v-else` Switch: bei `!isEditing` auf `<InlineDashboardPanel :readOnly>` oder `<DashboardViewer>` umschalten | `CustomDashboardView.vue` | 4–6h |
| F2 | MapPin nur im Edit-Modus | `v-if="dashStore.activeLayoutId"` (ohne `&& isEditing`) | `CustomDashboardView.vue` | 15min |
| F3 | Kein Feedback nach Target-Setzen | Toast nach `setTarget()`: "Dashboard wird in [Placement] angezeigt" + Deep-Link | `CustomDashboardView.vue` | 1h |
| F4 | MonitorPlay fehlt für cross-zone | Fallback-Route zu `/monitor` wenn scope undefined/cross-zone | `CustomDashboardView.vue` | 30min |
| F5 | `page`-Placement tot | Aus Interface entfernen ODER implementieren (eigenständige Page-Route) | `dashboard.store.ts` | 30min (entfernen) / 4h (implementieren) |
| F6 | `anchor`/`panelPosition`/`panelWidth` ungenutzt | Aus Interface entfernen ODER Side-Panel-Position via `panelPosition` steuerbar machen | `dashboard.store.ts`, `MonitorView.vue` | 15min (entfernen) / 2h (implementieren) |
| F7 | Dashboard-Dropdown statt Gallerie | Eigene `/dashboards`-View mit Metadaten (Scope, Widget-Count, Target, Zone) | Neue View | 6–10h |
| F8 | Kein `zoneId` bei Bottom/Side-Panels | `selectedZoneId ?? undefined` auch für bottom-panel und side-panel übergeben | `MonitorView.vue` | 15min |
| F9 | `mode='view'` === `mode='inline'` undokumentiert | Einen der Modi deprecaten oder klar differenzieren | `InlineDashboardPanel.vue` | 30min |

---

## 8. Aufwand-Schätzung (Gesamt)

| Priorität | Fixes | Aufwand |
|-----------|-------|---------|
| **Kritisch** (F2, F3, F4) | Sichtbarkeit + Feedback | ~1.75h |
| **Hoch** (F1) | Echter Preview-Modus | ~5h |
| **Mittel** (F5, F6, F8, F9) | Interface-Cleanup + zoneId | ~1.5h |
| **Optional** (F7) | Dashboard-Galerie | ~8h |
| **Gesamt** | | ~16h |

---

## 9. Zusammenfassung

Das Target-System (InlineDashboardPanel in Monitor) ist **technisch korrekt und funktionsfähig**. Alle 4 Verwendungsstellen in MonitorView funktionieren wenn das Target korrekt gesetzt ist. Die Store-Computed-Properties (`inlineMonitorPanelsCrossZone`, `inlineMonitorPanelsForZone`, `sideMonitorPanels`, `bottomMonitorPanels`) filtern korrekt. Auto-Migration in `fetchLayouts()` sichert Rückwärtskompatibilität.

**Die drei Kernprobleme sind UX-Probleme, keine Logik-Fehler:**

1. **Ansichtsmodus** (`isEditing=false`) rendert GridStack identisch zum Edit-Modus — nur Interaktion deaktiviert. Ein echter Preview-Modus der auf InlineDashboardPanel oder DashboardViewer umschaltet fehlt.
2. **"Im Monitor anzeigen"** (MapPin) ist nur im Edit-Modus erreichbar und gibt kein Feedback. Die Pipeline selbst funktioniert — das Problem ist Discoverability und fehlende Rückmeldung.
3. **Dashboard-Verwaltung** ist ein kompaktes Dropdown ohne Metadaten, keine durchsuchbare Galerie.

**Strukturelle Befunde:**
- `page`-Placement ist ein totes Interface-Feld
- `anchor`/`panelPosition`/`panelWidth` sind nie implementiert worden
- `mode='view'` und `mode='inline'` in InlineDashboardPanel sind identisch
- `inlineMonitorPanels` ist ein direktes Alias (`=`), kein eigenes `computed()`
- Bottom- und Side-Panels erhalten kein `zoneId`-Prop (Zone-Context fehlt für Widgets)
- `monitorRouteForLayout` gibt `null` für cross-zone Dashboards → kein MonitorPlay-Button

Die Route `monitor-zone-dashboard` ist aktiv und führt zu DashboardViewer (Full-Screen) — das ist der direkte "Im Monitor anzeigen"-Weg für zone-scope Dashboards. Für cross-zone fehlt ein äquivalenter Pfad.
