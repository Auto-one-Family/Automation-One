# Routing Verification Report: Tab-Routing + Cross-Navigation (Auftrag 3)

**Modus:** A (Code-Review / Analyse)
**Datum:** 2026-03-01
**Pruefumfang:** router/index.ts, ViewTabBar, Sidebar, TopBar, LogicView, CustomDashboardView, MonitorView, LinkedRulesSection, SensorsView

---

## Executive Summary

Die Implementierung ist **korrekt und vollstaendig**. Alle Named Routes existieren, Named-Route-Referenzen in Views und Komponenten stimmen mit den Router-Definitionen ueberein, Breadcrumb-Store-Types sind vollstaendig, und die Cross-View-Links verwenden konsistente Route-Namen. Vier kleinere Beobachtungen werden dokumentiert — keine davon ist ein Fehler.

---

## 1. Router (router/index.ts)

### Neue Routes — Status: KORREKT

| Route | Name | View | Korrekt |
|-------|------|------|---------|
| `/editor` | `editor` | `CustomDashboardView.vue` | ja |
| `/editor/:dashboardId` | `editor-dashboard` | `CustomDashboardView.vue` | ja |
| `/logic/:ruleId` | `logic-rule` | `LogicView.vue` | ja |
| `/monitor/:zoneId/sensor/:sensorId` | `monitor-sensor` | `MonitorView.vue` | ja |

### Redirects — Status: KORREKT

| Alter Pfad | Ziel | Verhalten |
|------------|------|-----------|
| `/custom-dashboard` | `/editor` | `redirect: '/editor'` — absoluter Pfad, korrekt |
| `/sensor-history` | `/monitor` | `redirect: '/monitor'` — absoluter Pfad, korrekt |

### Vollstaendige Namens-Tabelle (alle vorhandenen Routes)

Alle bestehenden Routes sind unveraendert:
- `hardware`, `hardware-zone`, `hardware-esp`
- `monitor`, `monitor-zone` (bereits vorhanden)
- `logic` (bereits vorhanden)
- `settings`, `calibration`, `users`, `system-monitor`, `system-config`, `load-test`, `maintenance`, `sensors`

### Beobachtung 1: `monitor-zone` Route

Die Route `/monitor/:zoneId` mit Name `monitor-zone` existiert seit vorherigen Implementierungen. Sie wird korrekt von MonitorView referenziert. Kein Problem.

### Beobachtung 2: `sensor-history` Redirect

Der Redirect `/sensor-history` → `/monitor` hat zusaetzlich einen `name: 'sensor-history'` gesetzt:
```typescript
// Zeile 221-225
{
  path: 'sensor-history',
  name: 'sensor-history',
  redirect: '/monitor',
},
```
Named Redirects ohne eigene Komponente sind in Vue Router erlaubt. Kein Problem.

---

## 2. ViewTabBar (components/common/ViewTabBar.vue)

### Status: KORREKT

**Tabs definiert:**
```typescript
const tabs = [
  { path: '/hardware', label: 'Uebersicht', icon: LayoutDashboard },
  { path: '/monitor', label: 'Monitor', icon: Activity },
  { path: '/editor', label: 'Editor', icon: PenTool },
] as const
```

**Active-Detection:**
```typescript
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/hardware')) return '/hardware'
  if (path.startsWith('/monitor')) return '/monitor'
  if (path.startsWith('/editor')) return '/editor'
  return '/hardware'
})
```

- Der Tab `/custom-dashboard` wurde korrekt durch `/editor` ersetzt.
- Die `startsWith()`-Logik deckt alle Sub-Routen korrekt ab:
  - `/editor/dash-123` wird als `/editor` erkannt (korrekt)
  - `/monitor/zone-a/sensor/xyz` wird als `/monitor` erkannt (korrekt)
- RouterLink-Navigation ist korrekt (keine named-route-Referenz noetig hier, path reicht).
- Icons: `LayoutDashboard`, `Activity`, `PenTool` — alle aus `lucide-vue-next`, korrekt importiert.

---

## 3. Sidebar (shared/design/layout/Sidebar.vue)

### Status: KORREKT

**Relevante Pruefpunkte:**

1. **Zeitreihen-Link entfernt:** Die Sidebar enthaelt keinen Link zu `/sensor-history` oder `/zeitreihen`. Korrekt entfernt.

2. **Editor-Route:** Die Sidebar verlinkt **nicht** direkt auf `/editor`. Stattdessen wird `/hardware` mit kombinierter Active-Detection verwendet:
   ```vue
   :class="['sidebar__link', (isActive('/hardware') || isActive('/monitor') || isActive('/editor')) && 'sidebar__link--active']"
   ```
   Das ist korrekt: Die Sidebar behandelt Hardware/Monitor/Editor als eine zusammenhaengende "Dashboard"-Sektion. Der Tab-Wechsel erfolgt ueber den ViewTabBar.

3. **isActive-Logik:**
   ```typescript
   function isActive(to: string): boolean {
     if (to === '/') return route.path === '/'
     return route.path.startsWith(to)
   }
   ```
   Korrekt — `startsWith` deckelt Sub-Routen.

4. **Keine toten Links:** Alle RouterLinks zeigen auf Routen die in router/index.ts existieren (`/hardware`, `/logic`, `/sensors`, `/system-monitor`, `/users`, `/maintenance`, `/calibration`, `/settings`).

---

## 4. TopBar (shared/design/layout/TopBar.vue)

### Status: KORREKT

**Route-Detection (alle 4 Views):**
```typescript
const isHardwareRoute = computed(() => route.path.startsWith('/hardware'))
const isMonitorRoute = computed(() => route.path.startsWith('/monitor'))
const isEditorRoute = computed(() => route.path.startsWith('/editor'))
const isLogicRoute = computed(() => route.path.startsWith('/logic'))
```

**Breadcrumb-Aufbau:**

| View | L1 | L2 | L3 |
|------|----|----|-----|
| Hardware | "Hardware" → `/hardware` | `zoneName` → `/hardware/:zoneId` | `deviceName` (terminal) |
| Monitor | "Monitor" → `/monitor` | `zoneName` → `/monitor/:zoneId` | `sensorName` (terminal) |
| Editor | "Editor" → `/editor` | `dashboardName` (terminal) | — |
| Logic | "Automatisierung" → `/logic` | `ruleName` (terminal) | — |

**Breadcrumb-Store-Felder konsumiert:**
- `dashStore.breadcrumb.zoneName` — vorhanden im Store
- `dashStore.breadcrumb.deviceName` — vorhanden im Store
- `dashStore.breadcrumb.sensorName` — vorhanden im Store
- `dashStore.breadcrumb.ruleName` — vorhanden im Store
- `dashStore.breadcrumb.dashboardName` — vorhanden im Store

**Route-Params konsumiert:**
- `route.params.zoneId` — vorhanden in `monitor-zone`, `hardware-zone`, `hardware-esp`
- `route.params.espId` — vorhanden in `hardware-esp`
- `route.params.sensorId` — vorhanden in `monitor-sensor`
- `route.params.dashboardId` — vorhanden in `editor-dashboard`
- `route.params.ruleId` — vorhanden in `logic-rule`

Alle param-Namen stimmen mit den Routen-Definitionen ueberein. Kein Mismatch.

---

## 5. Dashboard Store (shared/stores/dashboard.store.ts)

### Status: KORREKT — alle neuen Breadcrumb-Felder vorhanden

**Breadcrumb-Typ:**
```typescript
const breadcrumb = ref<{
  level: 1 | 2 | 3
  zoneName: string
  deviceName: string
  sensorName: string
  ruleName: string
  dashboardName: string
}>({
  level: 1,
  zoneName: '',
  deviceName: '',
  sensorName: '',
  ruleName: '',
  dashboardName: '',
})
```

Alle 5 Namen-Felder sind korrekt typisiert und initialisiert:
- `sensorName` — fuer Monitor L3
- `ruleName` — fuer Logic L2
- `dashboardName` — fuer Editor L2

---

## 6. Deep-Links: LogicView (views/LogicView.vue)

### Status: KORREKT

**onMounted Deep-Link:**
```typescript
const ruleIdFromUrl = route.params.ruleId as string | undefined
if (ruleIdFromUrl && logicStore.getRuleById(ruleIdFromUrl)) {
  selectedRuleId.value = ruleIdFromUrl
  const rule = logicStore.getRuleById(ruleIdFromUrl)
  if (rule) {
    dashStore.breadcrumb.ruleName = rule.name
  }
}
```

**URL-Sync beim Rule-Select:**
```typescript
router.replace({ name: 'logic-rule', params: { ruleId } })
```

**URL-Sync bei Neue Regel / Reset:**
```typescript
router.replace({ name: 'logic' })
```

**Cleanup in onUnmounted:**
```typescript
onUnmounted(() => {
  logicStore.unsubscribeFromWebSocket()
  dashStore.breadcrumb.ruleName = ''
})
```

**Pruefergebnis:**
- Named routes `'logic-rule'` und `'logic'` existieren in router/index.ts: ja
- `route.params.ruleId` stimmt mit Route-Param-Name `:ruleId` ueberein: ja
- Breadcrumb wird korrekt gesetzt und beim Unmount zurueckgesetzt: ja
- Cleanup fuer WebSocket in onUnmounted: ja

### Beobachtung 3: Race Condition bei Deep-Link

Der Deep-Link in `onMounted` prueft `logicStore.getRuleById(ruleIdFromUrl)` direkt nach `fetchRules()`. Da `fetchRules()` mit `await` aufgerufen wird (`await logicStore.fetchRules()`), ist die Rule bereits geladen. Kein Race Condition.

---

## 7. Deep-Links: CustomDashboardView (views/CustomDashboardView.vue)

### Status: KORREKT

**onMounted Deep-Link (URL-Param):**
```typescript
const dashboardIdFromUrl = route.params.dashboardId as string | undefined
if (dashboardIdFromUrl) {
  const layout = dashStore.layouts.find(l => l.id === dashboardIdFromUrl)
  if (layout) {
    dashStore.activeLayoutId = dashboardIdFromUrl
    dashStore.breadcrumb.dashboardName = layout.name
  }
}
```

**onMounted Deep-Link (Query-Param, Legacy):**
```typescript
const layoutFromQuery = route.query.layout as string | undefined
if (layoutFromQuery && !dashboardIdFromUrl) {
  const layout = dashStore.layouts.find(l => l.id === layoutFromQuery)
  if (layout) {
    dashStore.activeLayoutId = layoutFromQuery
    dashStore.breadcrumb.dashboardName = layout.name
  }
}
```

**Pruefergebnis:**
- `route.params.dashboardId` stimmt mit Route-Param-Name `:dashboardId` in `editor-dashboard` ueberein: ja
- Query-Param `?layout=` als Fallback fuer MonitorView Cross-Links: korrekt implementiert
- `dashStore.breadcrumb.dashboardName` wird korrekt gesetzt: ja
- **Kein Cleanup von `dashboardName` in onUnmounted** — dies ist eine geringfuegige Luecke (der Name bleibt im Store nach Navigationswechsel), wird aber durch den naechsten onMounted-Aufruf ueberschrieben. Kein Runtime-Bug.

---

## 8. Deep-Links: MonitorView (views/MonitorView.vue)

### Status: KORREKT

**URL-Sync beim Oeffnen des Sensor-Slideovers:**
```typescript
if (selectedZoneId.value) {
  const sensorId = `${sensor.esp_id}-gpio${sensor.gpio}`
  dashStore.breadcrumb.sensorName = sensorName
  router.replace({
    name: 'monitor-sensor',
    params: { zoneId: selectedZoneId.value, sensorId },
  })
}
```

**URL-Sync beim Schliessen:**
```typescript
function closeSensorDetail() {
  showSensorDetail.value = false
  if (selectedZoneId.value) {
    dashStore.breadcrumb.sensorName = ''
    router.replace({ name: 'monitor-zone', params: { zoneId: selectedZoneId.value } })
  }
  // ...
}
```

**Deep-Link Watcher (eingehende URL):**
```typescript
watch(
  [selectedSensorId, () => espStore.devices.length],
  ([sensorId, deviceCount]) => {
    if (!sensorId || deviceCount === 0 || showSensorDetail.value) return
    const match = sensorId.match(/^(.+)-gpio(\d+)$/)
    if (!match) return
    const [, espId, gpioStr] = match
    const gpio = parseInt(gpioStr, 10)
    // Sensor suchen und openSensorDetail aufrufen
  },
  { immediate: true },
)
```

**Cleanup in onUnmounted:**
```typescript
onUnmounted(() => {
  dashStore.breadcrumb.sensorName = ''
})
```

**Pruefergebnis:**
- `name: 'monitor-sensor'` existiert in router/index.ts: ja
- `name: 'monitor-zone'` existiert in router/index.ts: ja
- Param-Format `{espId}-gpio{gpio}` ist konsistent zwischen Schreiber (openSensorDetail) und Parser (Watcher): ja
- `{ immediate: true }` am Watcher — deckt Direct-URL-Zugriff ab (Browser-Reload auf deep-link URL): korrekt
- Guard `showSensorDetail.value` verhindert doppelte Initialisierung: korrekt
- Breadcrumb-Cleanup in onUnmounted: ja

---

## 9. Cross-View-Links

### 9a. LinkedRulesSection.vue

### Status: KORREKT

```typescript
function navigateToRule(ruleId: string) {
  router.push({ name: 'logic-rule', params: { ruleId } })
}
```

- Named route `'logic-rule'` existiert in router/index.ts: ja
- Param-Name `ruleId` stimmt mit Route-Param `:ruleId` ueberein: ja
- `useRouter()` korrekt importiert: ja (`import { useRouter } from 'vue-router'`)
- `logicStore.connections` wird korrekt gefiltert (kein direkter API-Call in Komponente): ja
- `onMounted` laedt Regeln lazy falls noch nicht geladen: korrekt

### 9b. MonitorView — /editor Links

### Status: KORREKT

**Cross-Zone Dashboard Links:**
```vue
<router-link
  :to="{ path: '/editor', query: { layout: dash.id } }"
>
```

**Zone Dashboard Links:**
```vue
<router-link
  :to="{ path: '/editor', query: { layout: dash.id } }"
>
```

**handleClaimLayout:**
```typescript
function handleClaimLayout(layoutId: string) {
  dashStore.claimAutoLayout(layoutId)
  router.push({ path: '/editor', query: { layout: layoutId } })
}
```

**Konfiguration-Button (Sensor -> SensorsView):**
```typescript
router.push({ name: 'sensors', query: { sensor: `${sensor.esp_id}-gpio${sensor.gpio}` } })
```

**Pruefergebnis:**
- `/editor` mit `?layout=` Query: Route `/editor` (name: `editor`) existiert, der Query-Param wird in CustomDashboardView konsumiert: ja
- Named route `'sensors'` existiert in router/index.ts (Zeile 186): ja
- Query-Param `sensor=` wird in SensorsView onMounted konsumiert: ja

### 9c. SensorsView — Monitor-Link im SlideOver

### Status: KORREKT

```typescript
router.push({
  name: 'monitor-sensor',
  params: {
    zoneId: selectedSensorZoneId,
    sensorId: `${selectedSensorConfig.espId}-gpio${selectedSensorConfig.gpio}`,
  },
})
```

**Pruefergebnis:**
- Named route `'monitor-sensor'` existiert in router/index.ts: ja
- Param-Format `{espId}-gpio{gpio}` stimmt mit MonitorView-Parser ueberein: ja
- `selectedSensorZoneId` ist ein computed der `device.zone_id` liest: korrekt
- Der Link wird nur gerendert wenn `selectedSensorZoneId` truthy ist (`v-if="selectedSensorConfig && selectedSensorZoneId"`): korrekt, verhindert Navigation ohne gueltige Zone

---

## 10. Zusammenfassung: Named Routes Cross-Reference

| Named Route | Definiert in router | Referenziert von |
|-------------|---------------------|-----------------|
| `logic` | ja (Zeile 198) | LogicView (URL-Reset) |
| `logic-rule` | ja (Zeile 203) | LogicView (URL-Sync), LinkedRulesSection |
| `editor` | ja (Zeile 81) | — (path-basierte Links in MonitorView) |
| `editor-dashboard` | ja (Zeile 87) | — (nicht direkt referenziert, nur via path) |
| `monitor` | ja (Zeile 59) | MonitorView (goBack) |
| `monitor-zone` | ja (Zeile 65) | MonitorView (goToZone, closeSensorDetail) |
| `monitor-sensor` | ja (Zeile 71) | MonitorView (openSensorDetail URL-sync), SensorsView |
| `sensors` | ja (Zeile 186) | MonitorView (Konfiguration-Button) |
| `hardware` | ja (Zeile 38) | AuthGuard-Fallback, verschiedene Redirects |

**Kein toter Named-Route-Link gefunden.**

---

## 11. 8-Dimensionen-Qualitaetspruefung

| # | Dimension | Bewertung |
|---|-----------|-----------|
| 1 | Struktur & Einbindung | Neue Routes in bestehende children-Struktur integriert. Deprecated-Redirects korrekt kommentiert. |
| 2 | Namenskonvention | camelCase fuer route names (`logic-rule`, `monitor-sensor`, `editor-dashboard`). Kebab-case ist Vue-Router-Standard. |
| 3 | Rueckwaertskompatibilitaet | `/custom-dashboard` und `/sensor-history` leiten weiter. `/devices`, `/mock-esp` etc. bleiben erhalten. |
| 4 | Wiederverwendbarkeit | `ViewTabBar` zentral geteilt von MonitorView und CustomDashboardView. Breadcrumb-Store als Single Source of Truth. |
| 5 | Speicher & Ressourcen | Kein Memory-Leak: Breadcrumb-Cleanup in onUnmounted (LogicView, MonitorView). CustomDashboardView fehlt `dashboardName`-Reset — minor. |
| 6 | Fehlertoleranz | Deep-Links pruefen Existenz vor Nutzung (getRuleById, layouts.find). Sensor-Watcher hat Guard gegen Doppelinitialisierung. |
| 7 | Seiteneffekte | `router.replace` statt `router.push` fuer URL-Sync (History bleibt sauber). `router.push` fuer explizite Navigationen. Korrekte Unterscheidung. |
| 8 | Industrielles Niveau | TypeScript korrekt: `route.params.ruleId as string | undefined`. Alle Referenzen sind typsicher. |

---

## 12. Beobachtungen (keine Fehler)

| # | Befund | Schwere | Empfehlung |
|---|--------|---------|------------|
| 1 | `sensor-history` Redirect hat `name: 'sensor-history'` gesetzt, was bei Named-Route-Redirects unueblich aber erlaubt ist | Info | Optional entfernen fuer Klarheit |
| 2 | `editor-dashboard` Route wird nirgends per `name: 'editor-dashboard'` referenziert — Navigationen gehen per `path: '/editor'` + Query | Info | Akzeptabel, da kein direkter Named-Link noetig |
| 3 | `dashStore.breadcrumb.dashboardName` wird in CustomDashboardView nicht in onUnmounted zurueckgesetzt | Minor | `onUnmounted(() => { dashStore.breadcrumb.dashboardName = '' })` ergaenzen fuer Konsistenz |
| 4 | MonitorView `goBack()` navigiert zu `name: 'monitor'` (immer L1), nicht zu vorheriger History-Position | Design-Entscheidung | Korrekt fuer deterministische Navigation |

---

## 13. Verifikation

Build-Status: **Erfolgreich** (laut Auftrag — vue-tsc + vite build)

Code-Review-Ergebnis: **Approved**

- Alle Named Routes sind korrekt definiert und referenziert
- Breadcrumb Store enthaelt alle benoetigten Felder (ruleName, dashboardName, sensorName)
- Cross-View-Links sind laufzeitstabil (Guards gegen null/undefined vorhanden)
- Pattern-konform: `<script setup lang="ts">`, `@/` imports, `useRouter()`, `useRoute()`
- Kein Light-Mode-Code, keine Inline-Styles, keine relativen Imports

---

**Erstellt von:** frontend-dev Agent
**Report-Pfad:** `.claude/reports/current/ROUTING_VERIFICATION_REPORT.md`
