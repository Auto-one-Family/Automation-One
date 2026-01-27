# System Monitor - Vollstaendige System-Analyse (Phase 0)

**Analysiert am:** 2026-01-24
**Analyst:** KI-System-Agent
**Version:** 2.0 FINAL (Korrigierte Analyse)
**Status:** VOLLSTAENDIG

---

## Executive Summary

Der **System Monitor** (`SystemMonitorView.vue`) ist die **NEUE, konsolidierte View** fuer System-Ueberwachung mit:

1. **8 Buttons** in der Header-Leiste (nicht 4 wie in AuditLogView)
2. **4 Tabs**: Ereignisse, Server Logs, Datenbank, MQTT Traffic
3. **WebSocket-Integration**: Live-Updates via `useWebSocket` Composable
4. **Audit-Funktionen integriert**: Retention und Cleanup aus AuditLogView uebernommen

**WICHTIG:** `AuditLogView.vue` ist **LEGACY** - alle Funktionen wurden in SystemMonitorView Tab "Ereignisse" konsolidiert.

### Architektur-Uebersicht

```
+------------------------------------------------------------------+
|                    SystemMonitorView.vue                          |
+------------------------------------------------------------------+
|  [Live]  5 Events  2 ESPs   [Stats][Filter][Pause][Refresh]...   |
+------------------------------------------------------------------+
|  [Ereignisse(3)] [Server Logs] [Datenbank] [MQTT Traffic(5)]     |
+------------------------------------------------------------------+
|                                                                  |
|   UnifiedEventList                                               |
|   - Transformiert WebSocket + AuditLog Events                    |
|   - Deutsche Fehlermeldungen via errorCodeTranslator             |
|   - Filter nach ESP, Level, Zeit, Event-Type                     |
|                                                                  |
+------------------------------------------------------------------+
```

---

## 1. Button-Analyse (Alle 8 Buttons)

### 1.1 Statistics Button (BarChart3)

#### UI-Identifikation
- **Icon:** `BarChart3` (lucide-vue-next)
- **Position:** 1 (ganz links in Actions)
- **CSS-Klasse:** `monitor-btn`, toggle: `monitor-btn--active`
- **Tooltip:** "Statistiken anzeigen"
- **Sichtbarkeit:** Immer

**Code-Location:** [MonitorHeader.vue:98-105](El Frontend/src/components/system-monitor/MonitorHeader.vue#L98-L105)

```vue
<button
  class="monitor-btn"
  :class="{ 'monitor-btn--active': showStats }"
  @click="emit('toggle-stats')"
  title="Statistiken anzeigen"
>
  <BarChart3 class="w-4 h-4" />
</button>
```

#### Event-Handler
- **Emit:** `toggle-stats`
- **Parent-Handler:** [SystemMonitorView.vue:788](El Frontend/src/views/SystemMonitorView.vue#L788) `@toggle-stats="toggleStats"`
- **Methode:** `toggleStats()` (Zeile 629-634)

```typescript
function toggleStats() {
  showStats.value = !showStats.value
  if (showStats.value && !statistics.value) {
    loadStatistics()
  }
}
```

#### Datenfluss
```
[Click Stats Button]
    |
    +-> emit('toggle-stats')
    +-> toggleStats()
            +-> showStats = !showStats
            +-> if (showStats && !statistics):
                    loadStatistics()
                        +-> auditApi.getStatistics()
                        +-> auditApi.getRetentionConfig()
                        +-> statistics.value = stats
```

#### API-Kommunikation
- **Endpoint:** `GET /api/v1/audit/statistics`
- **Auth:** ActiveUser
- **Response:** `AuditStatistics`

---

### 1.2 Filter Button

#### UI-Identifikation
- **Icon:** `Filter` (lucide-vue-next)
- **Position:** 2
- **Toggle-State:** `showFilters`
- **Tooltip:** "Filter anzeigen"

**Code-Location:** [MonitorHeader.vue:106-113](El Frontend/src/components/system-monitor/MonitorHeader.vue#L106-L113)

#### Event-Handler
- **Emit:** `toggle-filters`
- **Parent-Handler:** `@toggle-filters="toggleFilters"`
- **Methode:** `toggleFilters()` (Zeile 587-589)

#### Filter-Panel (MonitorFilterPanel.vue)
Bietet Filter fuer:
- **ESP-ID:** Text-Input mit Autocomplete
- **Severity-Levels:** info, warning, error, critical (Checkboxes)
- **Zeitraum:** all, 1h, 6h, 24h (Radio)
- **Event-Types:** 16 verschiedene Typen (Multi-Select)

---

### 1.3 Pause/Play Button

#### UI-Identifikation
- **Icon:** `Pause` (aktiv) / `Play` (pausiert)
- **Position:** 3
- **Toggle-State:** `isPaused`
- **Tooltip:** "Pausieren" / "Fortsetzen"

**Code-Location:** [MonitorHeader.vue:114-121](El Frontend/src/components/system-monitor/MonitorHeader.vue#L114-L121)

```vue
<button
  class="monitor-btn"
  :class="{ 'monitor-btn--active': isPaused }"
  @click="emit('toggle-pause')"
  :title="isPaused ? 'Fortsetzen' : 'Pausieren'"
>
  <component :is="isPaused ? Play : Pause" class="w-4 h-4" />
</button>
```

#### Funktion
- **Pausiert:** WebSocket-Messages werden ignoriert (`if (isPaused.value) return`)
- **Bestehende Events:** Bleiben sichtbar
- **Neue Events:** Werden nicht hinzugefuegt

**Code-Location:** [SystemMonitorView.vue:216-226](El Frontend/src/views/SystemMonitorView.vue#L216-L226)

```typescript
function handleWebSocketMessage(message: WebSocketMessage) {
  if (isPaused.value) return  // <-- Hier wird pausiert

  const event = transformToUnifiedEvent(message)
  unifiedEvents.value.unshift(event)
  // ...
}
```

---

### 1.4 Refresh Button

#### UI-Identifikation
- **Icon:** `RefreshCw` (mit Spin-Animation beim Loading)
- **Position:** 4
- **Tooltip:** "Aktualisieren"
- **Disabled:** Waehrend `isLoading`

**Code-Location:** [MonitorHeader.vue:122-129](El Frontend/src/components/system-monitor/MonitorHeader.vue#L122-L129)

#### Event-Handler
- **Emit:** `refresh`
- **Methode:** `handleRefresh()` -> `loadHistoricalEvents()`

```typescript
async function loadHistoricalEvents(): Promise<void> {
  isLoading.value = true
  try {
    // Load last 6 hours of events, max 200
    const response = await auditApi.list({
      hours: 6,
      page_size: 200,
    })
    // Transform and merge with existing events...
  }
}
```

#### API-Kommunikation
- **Endpoint:** `GET /api/v1/audit?hours=6&page_size=200`
- **Auth:** ActiveUser

---

### 1.5 Export/Download Button

#### UI-Identifikation
- **Icon:** `Download`
- **Position:** 5
- **Tooltip:** "Exportieren"

**Code-Location:** [MonitorHeader.vue:130-132](El Frontend/src/components/system-monitor/MonitorHeader.vue#L130-L132)

#### Funktion
```typescript
function handleExport() {
  const data = JSON.stringify(filteredEvents.value, null, 2)
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `system-monitor-${activeTab.value}-${timestamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Keine API-Kommunikation** - Export erfolgt client-seitig aus `filteredEvents`.

---

### 1.6 Settings/Retention Button (Admin-Only)

#### UI-Identifikation
- **Icon:** `Settings`
- **Position:** 6
- **Tooltip:** "Aufbewahrung konfigurieren"
- **Sichtbarkeit:** Nur fuer Admin (`v-if="isAdmin"`)

**Code-Location:** [MonitorHeader.vue:134-137](El Frontend/src/components/system-monitor/MonitorHeader.vue#L134-L137)

#### Event-Handler
- **Emit:** `open-retention`
- **Parent-Handler:** `@open-retention="showRetentionModal = true"`

#### Modal-Inhalt
Identisch mit AuditLogView Retention-Modal (Zeile 903-993):
- Automatische Bereinigung aktivieren
- Standard-Aufbewahrung (Tage)
- Max. Eintraege
- Aufbewahrung nach Schweregrad
- Notfall-Stopp-Events schuetzen

#### API-Kommunikation
- **GET:** `GET /api/v1/audit/retention/config`
- **PUT:** `PUT /api/v1/audit/retention/config` (AdminUser!)

---

### 1.7 Cleanup/Trash Button (Admin-Only)

#### UI-Identifikation
- **Icon:** `Trash2`
- **Position:** 7
- **CSS-Klasse:** `monitor-btn--warning` (orange Hover-Effekt)
- **Tooltip:** "Alte Eintraege bereinigen"
- **Sichtbarkeit:** Nur fuer Admin

**Code-Location:** [MonitorHeader.vue:138-140](El Frontend/src/components/system-monitor/MonitorHeader.vue#L138-L140)

#### Event-Handler
- **Emit:** `open-cleanup`
- **Parent-Handler:** `@open-cleanup="showCleanupModal = true; cleanupResult = null"`

#### Modal-Inhalt (Zeile 995-1099)
- Warnung wenn Retention deaktiviert
- Vorschau-Button (Dry-Run)
- Bereinigen-Button (echte Loeschung)
- Backup-Info nach Loeschung

#### API-Kommunikation
- **POST:** `POST /api/v1/audit/retention/cleanup?dry_run={true|false}` (AdminUser!)

---

### 1.8 Clear/EyeOff Button

#### UI-Identifikation
- **Icon:** `EyeOff`
- **Position:** 8 (ganz rechts)
- **Tooltip:** "Ansicht leeren (temporaer - Events bleiben in Datenbank)"
- **Sichtbarkeit:** Immer

**Code-Location:** [MonitorHeader.vue:142-148](El Frontend/src/components/system-monitor/MonitorHeader.vue#L142-L148)

#### Funktion
```typescript
function clearEvents() {
  if (unifiedEvents.value.length === 0) {
    return
  }
  unifiedEvents.value = []
  // Note: Events are only cleared from view, not from database
  console.log('[SystemMonitor] View cleared (events remain in database)')
}
```

**WICHTIG:** Dies loescht KEINE Daten aus der Datenbank - nur die lokale Anzeige wird geleert. Nach Refresh erscheinen Events wieder.

---

## 2. Tab-Struktur

### 2.1 Tabs-Uebersicht

**Component:** [MonitorTabs.vue](El Frontend/src/components/system-monitor/MonitorTabs.vue)

| Tab | TabId | Badge | Content-Component |
|-----|-------|-------|-------------------|
| Ereignisse | `events` | Error+Critical Count | `UnifiedEventList` |
| Server Logs | `logs` | Server-Events Count | `ServerLogsTab` |
| Datenbank | `database` | - | `DatabaseTab` |
| MQTT Traffic | `mqtt` | MQTT-Events Count | `MqttTrafficTab` |

### 2.2 Event-Counts Berechnung

```typescript
const eventCounts = computed(() => ({
  events: unifiedEvents.value.filter(e =>
    e.severity === 'error' || e.severity === 'critical'
  ).length,
  logs: unifiedEvents.value.filter(e => e.source === 'server').length,
  mqtt: unifiedEvents.value.filter(e =>
    e.source === 'mqtt' || e.source === 'esp'
  ).length,
}))
```

---

## 3. WebSocket-Integration (LIVE-UPDATES!)

### 3.1 Architektur

**Im Gegensatz zu AuditLogView hat SystemMonitorView ECHTE Live-Updates!**

```typescript
const { on, isConnected, connectionStatus } = useWebSocket({ autoConnect: true })

// Subscribe to all event types for live updates
onMounted(async () => {
  ALL_EVENT_TYPES.forEach(eventType => {
    wsUnsubscribers.push(on(eventType, handleWebSocketMessage))
  })
})
```

### 3.2 Subscribed Event-Types

```typescript
const ALL_EVENT_TYPES = [
  'sensor_data',
  'sensor_health',
  'actuator_status',
  'actuator_response',
  'actuator_alert',
  'esp_health',
  'config_response',
  'device_discovered',
  'device_rediscovered',
  'device_approved',
  'device_rejected',
  'zone_assignment',
  'logic_execution',
  'system_event',
  'error_event',
  'notification',
] as const
```

### 3.3 Event-Transformation

WebSocket-Messages werden in `UnifiedEvent` transformiert:

```typescript
interface UnifiedEvent {
  id: string
  timestamp: string
  event_type: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  source: 'esp' | 'mqtt' | 'server' | 'user' | 'logic'
  esp_id?: string
  zone_id?: string
  zone_name?: string
  message: string               // Deutsche Fehlermeldung!
  error_code?: number | string
  error_category?: string
  gpio?: number
  device_type?: string
  data: Record<string, unknown>
}
```

### 3.4 Deutsche Fehlermeldungen

Der `errorCodeTranslator` wird verwendet um ESP32 Error-Codes in deutsche Meldungen zu uebersetzen:

```typescript
import { translateErrorCode, detectCategory } from '@/utils/errorCodeTranslator'

function generateGermanMessage(wsMessage, errorCode) {
  if (errorCode && (type === 'error_event' || type === 'actuator_alert')) {
    const info = translateErrorCode(errorCode)
    return espId ? `${info.title} (${espId})` : info.title
  }
  // Type-specific German messages...
}
```

---

## 4. Datenfluss-Gesamtdiagramm

```
+-------------------------------------------------------------------------+
|                       WebSocket (God-Kaiser Server)                      |
|  Events: sensor_data, esp_health, config_response, actuator_alert, ...  |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                    useWebSocket Composable                               |
|  - Auto-Connect                                                         |
|  - on(eventType, handler) Subscriptions                                 |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                    SystemMonitorView.vue                                 |
|                                                                         |
|  handleWebSocketMessage(message)                                        |
|       |                                                                 |
|       +-> if (isPaused) return                                          |
|       +-> transformToUnifiedEvent(message)                              |
|       |       +-> extractEspId()                                        |
|       |       +-> determineSeverity()                                   |
|       |       +-> generateGermanMessage()                               |
|       |       +-> errorCodeTranslator                                   |
|       |                                                                 |
|       +-> unifiedEvents.unshift(event)                                  |
|       +-> Limit to MAX_EVENTS (500)                                     |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                    filteredEvents (computed)                             |
|  - Filter by activeTab (events/logs/mqtt)                               |
|  - Filter by filterEspId                                                |
|  - Filter by filterLevels (Set)                                         |
|  - Filter by filterEventTypes (Set)                                     |
|  - Filter by filterTimeRange                                            |
+------------------------------------+------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
|                    UnifiedEventList.vue                                  |
|  - Virtualized List (Performance)                                       |
|  - Event-Icon by severity                                               |
|  - Click -> EventDetailsPanel                                           |
+-------------------------------------------------------------------------+
```

---

## 5. Vergleich: SystemMonitorView vs AuditLogView (Legacy)

| Feature | SystemMonitorView | AuditLogView (Legacy) |
|---------|-------------------|----------------------|
| **Live-Updates** | JA (WebSocket) | NEIN (nur Refresh) |
| **Tabs** | 4 (Events, Logs, DB, MQTT) | 0 (nur Tabelle) |
| **Error-Translation** | Deutsch via errorCodeTranslator | Keine |
| **Mobile FAB** | JA (Filter-Button) | NEIN |
| **Statistik-Bar** | Collapsible (showStats) | Immer sichtbar (4 Cards) |
| **Retention-Modal** | JA (Admin) | JA (Admin) |
| **Cleanup-Modal** | JA (Admin) | JA (Admin) |
| **Clear-View** | JA (EyeOff Button) | NEIN |
| **Export** | JA (JSON) | NEIN |
| **Deep-Linking** | JA (URL Query Params) | Begrenzt |

**Empfehlung:** AuditLogView kann als deprecated markiert werden. Alle Funktionen sind in SystemMonitorView enthalten.

---

## 6. Kritische Probleme & Risiken

### 6.1 P1 - Major

#### Problem 1: "FEHLER (24H)" Bug (geerbt von AuditLogView)
- **Beschreibung:** Label suggeriert 24h, aber Backend-Query ist ALL-TIME
- **Location:** [SystemMonitorView.vue:804-805](El Frontend/src/views/SystemMonitorView.vue#L804-L805)
- **Fix:** Backend-Query oder Label korrigieren

### 6.2 P2 - Minor

#### Problem 2: Backup-UI fehlt
- **Beschreibung:** Backend hat Backup-API, Frontend nutzt sie nicht
- **Fix:** Backup-Liste in Cleanup-Modal hinzufuegen

#### Problem 3: MAX_EVENTS = 500 koennte zu niedrig sein
- **Beschreibung:** Bei vielen ESP32s koennte Buffer schnell voll werden
- **Current:** `const MAX_EVENTS = 500`
- **Fix:** Konfigurierbar machen oder erhoehen

---

## 7. Code-Referenzen

### Frontend

| Datei | Pfad | Funktion |
|-------|------|----------|
| SystemMonitorView.vue | [El Frontend/src/views/SystemMonitorView.vue](El Frontend/src/views/SystemMonitorView.vue) | Haupt-View |
| MonitorHeader.vue | [El Frontend/src/components/system-monitor/MonitorHeader.vue](El Frontend/src/components/system-monitor/MonitorHeader.vue) | Header mit Buttons |
| MonitorTabs.vue | [El Frontend/src/components/system-monitor/MonitorTabs.vue](El Frontend/src/components/system-monitor/MonitorTabs.vue) | Tab-Navigation |
| MonitorFilterPanel.vue | [El Frontend/src/components/system-monitor/MonitorFilterPanel.vue](El Frontend/src/components/system-monitor/MonitorFilterPanel.vue) | Filter-Panel |
| UnifiedEventList.vue | [El Frontend/src/components/system-monitor/UnifiedEventList.vue](El Frontend/src/components/system-monitor/UnifiedEventList.vue) | Event-Liste |
| EventDetailsPanel.vue | [El Frontend/src/components/system-monitor/EventDetailsPanel.vue](El Frontend/src/components/system-monitor/EventDetailsPanel.vue) | Event-Details |
| AuditLogView.vue | [El Frontend/src/views/AuditLogView.vue](El Frontend/src/views/AuditLogView.vue) | **LEGACY** |

### Backend (unveraendert)

| Datei | Pfad |
|-------|------|
| audit.py | [El Servador/.../src/api/v1/audit.py](El Servador/god_kaiser_server/src/api/v1/audit.py) |
| audit_retention_service.py | [El Servador/.../src/services/audit_retention_service.py](El Servador/god_kaiser_server/src/services/audit_retention_service.py) |
| audit_log.py | [El Servador/.../src/db/models/audit_log.py](El Servador/god_kaiser_server/src/db/models/audit_log.py) |

---

## 8. Button-Uebersicht (Quick Reference)

| # | Icon | Name | Emit | Funktion | Admin |
|---|------|------|------|----------|-------|
| 1 | BarChart3 | Stats | toggle-stats | Statistik-Bar ein/aus | Nein |
| 2 | Filter | Filter | toggle-filters | Filter-Panel ein/aus | Nein |
| 3 | Pause/Play | Pause | toggle-pause | Live-Updates pausieren | Nein |
| 4 | RefreshCw | Refresh | refresh | Historische Events laden | Nein |
| 5 | Download | Export | export | JSON-Export | Nein |
| 6 | Settings | Retention | open-retention | Retention-Config Modal | **JA** |
| 7 | Trash2 | Cleanup | open-cleanup | Cleanup Modal | **JA** |
| 8 | EyeOff | Clear | clear | View leeren (temp.) | Nein |

---

## Anhang A: Legacy AuditLogView.vue

Die urspruengliche AuditLogView.vue ist noch vorhanden, aber funktionell durch SystemMonitorView ersetzt:

**Route:** `/audit` (vermutlich)
**Status:** LEGACY - kann deprecated werden
**Migration:** Alle Funktionen sind in SystemMonitorView Tab "Ereignisse" verfuegbar

Empfehlung fuer Phase 1:
1. AuditLogView aus Router entfernen ODER
2. Redirect zu `/system-monitor?tab=events` einrichten

---

**Ende der Phase 0 Analyse (v2.0)**

*Diese korrigierte Analyse dokumentiert die ECHTE SystemMonitorView mit WebSocket-Integration und 8 Buttons.*
