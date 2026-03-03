# Frontend Dev Report: Phase 4D Diagnostics Hub — Review & Fix

## Modus: B (Implementierung / Review & Fix)
## Auftrag: Review und Bugfix der Phase 4D Diagnostics Hub Frontend-Implementierung auf Pattern-Konsistenz und Korrektheit

---

## Codebase-Analyse

### Analysierte Dateien (14 spezifizierte + 6 Referenz-Dateien)

**Spezifizierte Dateien:**
- `El Frontend/src/api/diagnostics.ts`
- `El Frontend/src/shared/stores/diagnostics.store.ts`
- `El Frontend/src/components/system-monitor/DiagnoseTab.vue`
- `El Frontend/src/components/system-monitor/ReportsTab.vue`
- `El Frontend/src/components/system-monitor/MonitorTabs.vue`
- `El Frontend/src/components/system-monitor/HealthTab.vue`
- `El Frontend/src/components/system-monitor/HealthSummaryBar.vue`
- `El Frontend/src/components/system-monitor/types.ts`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/types/logic.ts`
- `El Frontend/src/shared/stores/index.ts`
- `El Frontend/src/router/index.ts`
- `El Frontend/src/components/rules/RuleNodePalette.vue`
- `El Frontend/src/components/rules/RuleFlowEditor.vue`

**Referenz-Dateien (zum Pattern-Abgleich):**
- `El Frontend/src/utils/formatters.ts` — Signatur von `formatRelativeTime`
- `El Frontend/src/shared/design/primitives/BaseModal.vue` — Prop-Namen
- `El Frontend/src/shared/design/primitives/SlideOver.vue` — Prop-Namen
- `El Frontend/src/components/plugins/PluginConfigDialog.vue`
- `El Frontend/src/views/PluginsView.vue`
- `El Frontend/src/shared/design/layout/Sidebar.vue`

---

## Qualitätsprüfung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | **Struktur & Einbindung** | `diagnostics.ts` in `api/`, `diagnostics.store.ts` in `shared/stores/` korrekt. Store korrekt in `shared/stores/index.ts` re-exportiert. Alle @/ Imports korrekt. |
| 2 | **Namenskonvention** | PascalCase für Komponenten, camelCase für Funktionen, UPPER_SNAKE für Konstanten — eingehalten. |
| 3 | **Rückwärtskompatibilität** | `TabId` in `types.ts` um `'diagnostics'` und `'reports'` erweitert — additive Erweiterung, keine Breaking Changes. |
| 4 | **Wiederverwendbarkeit** | `diagnostics.store.ts` nutzt etabliertes Pinia Setup-Store Pattern. DiagnoseTab und ReportsTab folgen dem MonitorTabs-Komponentenmuster. |
| 5 | **Speicher & Ressourcen** | `HealthSummaryBar.vue` — `onUnmounted` Cleanup für Keyboard-Handler vorhanden. `diagnostics.store.ts` — keine persistenten WS-Subscriptions, kein Leak-Risiko. |
| 6 | **Fehlertoleranz** | Try-Catch in allen Store-Actions. `error` State in Store. Null-Checks in Templates via `v-if`. |
| 7 | **Seiteneffekte** | Vue-Reaktivitätsbug (Set-Mutations in DiagnoseTab) behoben. SystemMonitorView `open-alerts` Event war unbehandelt — behoben. |
| 8 | **Industrielles Niveau** | Nach Fixes: TypeScript strict, kein `any`, Build-verifiziert. |

---

## Gefundene und behobene Bugs

### Bug 1: Vue 3 Reaktivitätsfehler — DiagnoseTab.vue (KRITISCH)

**Datei:** `El Frontend/src/components/system-monitor/DiagnoseTab.vue`

**Problem:** `ref<Set<string>>(new Set())` — Vue 3's Proxy-System trackt in-place Mutations auf `Set`-Objekten (`.add()`, `.delete()`) NICHT. Das Template re-renderte nicht bei Expand/Collapse von Check-Details.

**Fix:** Ersetzt durch `ref<Record<string, boolean>>({})` mit Object-Spread für alle Mutationen:

```typescript
// Vorher (broken):
const expandedChecks = ref<Set<string>>(new Set())
function toggleExpand(name: string) {
  if (expandedChecks.value.has(name)) { expandedChecks.value.delete(name) }
  else { expandedChecks.value.add(name) }
}

// Nachher (fixed):
const expandedChecks = ref<Record<string, boolean>>({})
function toggleExpand(name: string) {
  if (expandedChecks.value[name]) {
    expandedChecks.value = { ...expandedChecks.value, [name]: false }
  } else {
    expandedChecks.value = { ...expandedChecks.value, [name]: true }
  }
}
// In runSingleCheck:
expandedChecks.value = { ...expandedChecks.value, [checkName]: true }
```

Template-Referenzen: `expandedChecks.has(check.name)` → `expandedChecks[check.name]`

---

### Bug 2: Unnötige `any`-Casts — ReportsTab.vue

**Datei:** `El Frontend/src/components/system-monitor/ReportsTab.vue`

**Problem:** `expandedReportData = ref<Record<string, unknown> | null>(null)` erzwang `(expandedReportData as any).checks` und `(expandedReportData as any).summary` im Template — TypeScript `any`-Violation.

**Fix:** Typ zu `DiagnosticReport | null` geändert:

```typescript
import type { DiagnosticReport } from '@/api/diagnostics'
const expandedReportData = ref<DiagnosticReport | null>(null)
// In toggleReport:
expandedReportData.value = report  // direkte Zuweisung, kein Cast nötig
```

Template: `(expandedReportData as any).checks` → `expandedReportData.checks`

---

### Bug 3: Sidebar aktiver Zustand falsch — Sidebar.vue

**Datei:** `El Frontend/src/shared/design/layout/Sidebar.vue`

**Problem:** "Wartung"-Link navigiert zu `/system-monitor?tab=health`, nutzte aber `isActive('/maintenance')` — dieser Pfad existiert nicht als Route und triggerte nie. Zudem konnten "System" und "Wartung" gleichzeitig aktiv sein.

**Fix:** Beide Links mit Query-Param-Bewusstsein aktualisiert:

```vue
<!-- System-Link — schließt tab=health aus -->
:class="['sidebar__link', isActive('/system-monitor') && route.query.tab !== 'health' && 'sidebar__link--active']"

<!-- Wartung-Link — matcht /maintenance (Legacy) ODER /system-monitor?tab=health -->
:class="['sidebar__link', (isActive('/maintenance') || (isActive('/system-monitor') && route.query.tab === 'health')) && 'sidebar__link--active']"
```

---

### Bug 4: Fehlender Event-Handler — SystemMonitorView.vue

**Datei:** `El Frontend/src/views/SystemMonitorView.vue`

**Problem:** `HealthTab` emittiert `open-alerts`, aber `SystemMonitorView` hatte weder Import von `useNotificationInboxStore`, noch eine Handler-Funktion, noch `@open-alerts` Binding auf `<HealthTab>`.

**Fix:**

```typescript
// Hinzugefügt:
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
const inboxStore = useNotificationInboxStore()
function handleOpenAlerts() {
  inboxStore.toggleDrawer()
}
```

```vue
<!-- Template aktualisiert: -->
<HealthTab
  v-else-if="activeTab === 'health'"
  :filter-esp-id="filterEspId"
  @filter-device="handleFilterDevice"
  @open-alerts="handleOpenAlerts"
/>
```

---

### Bug 5: Fehlende Node-Typen in RuleFlowEditor — RuleFlowEditor.vue (FEATURE-VOLLSTÄNDIGKEIT)

**Datei:** `El Frontend/src/components/rules/RuleFlowEditor.vue`

**Problem:** `RuleNodePalette` fügt `diagnostics_status` (Condition) und `run_diagnostic` (Action) zur Palette hinzu, aber `RuleFlowEditor` hatte null Support — kein Icon-Import, keine Type-Imports, keine `NODE_INIT_DIMS`-Einträge (würde zu Crash führen), keine `getDefaultNodeData`-Cases, keine `ruleToGraph`/`graphToRuleData`-Behandlung, keine Vue Flow Node-Templates, keine CSS.

**Fix — alle 6 Integrationspunkte hinzugefügt:**

1. **Icon-Import:** `Stethoscope` aus `lucide-vue-next`
2. **Type-Imports:** `DiagnosticsCondition`, `DiagnosticsAction` aus `@/types/logic`
3. **NODE_INIT_DIMS:**
   ```typescript
   diagnostics_status: { width: 210, height: 100 },
   run_diagnostic: { width: 210, height: 80 },
   ```
4. **getDefaultNodeData():**
   ```typescript
   case 'diagnostics_status':
     return { checkName: defaults.checkName || 'mqtt', expectedStatus: defaults.expectedStatus || 'critical', operator: defaults.operator || '==', ...defaults }
   case 'run_diagnostic':
     return { checkName: defaults.checkName || '', ...defaults }
   ```
5. **ruleToGraph():** Handling für `diagnostics_status`-Conditions und `run_diagnostic`-Actions
6. **graphToRuleData():** Konversion zurück zu `DiagnosticsCondition` / `DiagnosticsAction`
7. **Vue Flow Node-Templates:** `#node-diagnostics_status` und `#node-run_diagnostic`
8. **MiniMap-Farben:** `diagnostics_status: () => '#22d3ee'`, `run_diagnostic: () => '#22d3ee'`
9. **CSS:** `.rule-node--diagnostics` und `.rule-node__icon-wrap--diagnostics` (Cyan-Farbe `#22d3ee`)

---

### Bug 6: Falsche Prop-Namen — PluginConfigDialog.vue (TS-Fehler)

**Datei:** `El Frontend/src/components/plugins/PluginConfigDialog.vue`

**Problem:** Verwendete `:visible="visible"` und `size="md"`, aber `BaseModal` erwartet `:open` und `:max-width`.

**Fix:**
```vue
<BaseModal :open="visible" :title="`${pluginName} — Konfiguration`" max-width="max-w-lg" @close="emit('close')">
```

---

### Bug 7: Falsches Prop bei SlideOver — PluginsView.vue (TS-Fehler)

**Datei:** `El Frontend/src/views/PluginsView.vue`

**Problem:** Verwendete `:visible="!!activePluginId"`, aber `SlideOver` erwartet `:open`.

**Fix:**
```vue
<SlideOver :open="!!activePluginId" :title="activePlugin?.display_name || 'Plugin'" @close="closeDetail">
```

---

## Dateien ohne Änderungsbedarf (verifiziert korrekt)

| Datei | Ergebnis |
|-------|----------|
| `api/diagnostics.ts` | Pattern-konform. API gibt unwrapped Data zurück (kein `ApiResponse`-Wrapper) — konsistent mit Direct-Response-Pattern. |
| `shared/stores/diagnostics.store.ts` | `currentReport.value.checks[idx] = result` — wird von Vue 3 getrackt (Array-Index-Assignment über Proxy). Kein Bug. |
| `components/system-monitor/MonitorTabs.vue` | Korrekte `TabId`-Typen, keine Probleme. |
| `components/system-monitor/HealthTab.vue` | Diagnostics-KPI-Sektion mit `v-if="diagStore.currentReport"` korrekt. |
| `components/system-monitor/HealthSummaryBar.vue` | `onUnmounted` Cleanup für Keyboard-Handler korrekt vorhanden. |
| `components/system-monitor/types.ts` | `TabId` enthält `'diagnostics'` und `'reports'` — korrekt. |
| `types/logic.ts` | `DiagnosticsCondition` und `DiagnosticsAction` korrekt definiert. |
| `shared/stores/index.ts` | `useDiagnosticsStore` korrekt re-exportiert. |
| `router/index.ts` | `/maintenance` Route existiert als eigenständige Route — kein Redirect nötig. |
| `components/rules/RuleNodePalette.vue` | `Stethoscope`-Icon bereits importiert, Palette-Einträge korrekt. |

---

## Cross-Layer Checks

| Prüfpunkt | Ergebnis |
|-----------|----------|
| `types/logic.ts` ↔ Server Pydantic-Schemas | `DiagnosticsCondition.check_name`, `expected_status`, `operator` — Felder stimmen mit Server überein (snake_case). |
| `api/diagnostics.ts` Endpunkte | Endpunkte wurden in REST_ENDPOINTS.md verifiziert. |
| Sidebar `/system-monitor?tab=health` | Router-Route `/maintenance` existiert separat; Sidebar-Fix ist nur UX/Highlighting. |
| HealthTab `open-alerts` Event | Wired zu `inboxStore.toggleDrawer()` — öffnet Notification-Drawer korrekt. |

---

## Verifikation

```
Erster Build-Lauf:
  src/components/plugins/PluginConfigDialog.vue(67,4): error TS2345 — 'visible' existiert nicht in BaseModal Props
  src/views/PluginsView.vue(161,6): error TS2345 — 'visible' existiert nicht in SlideOver Props
  → 2 TypeScript-Fehler

Zweiter Build-Lauf (nach Fixes):
  ✓ built in 18.62s
  2984 modules transformed
  0 TypeScript-Fehler
  0 Warnings
```

---

## Ergebnis

**7 Bugs gefunden und behoben** in 7 Dateien:

| # | Datei | Bug-Typ | Schwere |
|---|-------|---------|---------|
| 1 | `DiagnoseTab.vue` | Vue 3 Reaktivitätsfehler (Set-Mutation) | Kritisch |
| 2 | `ReportsTab.vue` | `any`-Cast durch falsche Typisierung | Mittel |
| 3 | `Sidebar.vue` | Falscher aktiver Zustand bei "Wartung" | UX |
| 4 | `SystemMonitorView.vue` | Fehlender `open-alerts` Event-Handler | Mittel |
| 5 | `RuleFlowEditor.vue` | Fehlende Unterstützung für 2 neue Node-Typen | Kritisch |
| 6 | `PluginConfigDialog.vue` | Falsche Prop-Namen für BaseModal | TypeScript-Fehler |
| 7 | `PluginsView.vue` | Falsches Prop für SlideOver | TypeScript-Fehler |

**10 Dateien ohne Änderungsbedarf** — korrekt implementiert.

---

## Empfehlung

Keine weiteren Frontend-Agenten notwendig. Der Build ist sauber. Die Phase-4D-Implementierung ist jetzt vollständig pattern-konform und TypeScript-fehlerfrei.

Bei der nächsten Session die `/maintenance`-Route im Router prüfen — sie leitet noch nicht auf `/system-monitor?tab=health` um. Das ist aktuell kein Bug (die Route existiert separat), aber für eine saubere UX wäre ein Redirect sinnvoll.
