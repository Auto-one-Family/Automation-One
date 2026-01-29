# Phase 5 - Vollständige Analyse: Event-Gruppierung & Timeline

**Erstellt:** 2026-01-27
**Zweck:** Architektur-Analyse für Event-Gruppierung und Timeline-Features

---

## 1. System Monitor - Komponenten-Hierarchie

### SystemMonitorView.vue
- **Pfad:** `El Frontend/src/views/SystemMonitorView.vue`
- **Zeilen:** 2.389
- **Rolle:** Haupt-View, State-Management, API+WebSocket-Integration, Filter-Logik

### Komponenten-Baum (12.822 Zeilen gesamt)

```
SystemMonitorView.vue (2.389)
├── MonitorTabs.vue (485) ─ Tab-Navigation, Pause, Export, Cleanup-Button
├── EventsTab.vue (175) ─ Container für Events-Ansicht
│   ├── DataSourceSelector.vue (1.120) ─ 4 Source-Pills + ESP/Level/Time-Filter
│   └── UnifiedEventList.vue (1.099) ─ Virtual Scrolling, Date-Separators, Kategorie-Farben
├── ServerLogsTab.vue (1.533) ─ Server-Log-Viewer mit Polling (3s), request_id-Filter
│   └── LogManagementPanel.vue (896) ─ Log-Datei Cleanup
├── MqttTrafficTab.vue (1.005) ─ MQTT-Traffic Live-Ansicht
├── DatabaseTab.vue (652) ─ Datenbank-Event-Feed
├── EventDetailsPanel.vue (1.708) ─ Detail-Overlay mit Korrelation (Phase 3)
├── CleanupPanel.vue (1.901) ─ Backup/Retention-Management
│   ├── CleanupPreview.vue (410)
│   └── AutoCleanupStatusBanner.vue (439)
├── MonitorHeader.vue (665) ─ Statistik-Leiste
├── MonitorFilterPanel.vue (453) ─ Mobile Filter-FAB
├── PreviewEventCard.vue (155) ─ Event-Card Preview
└── RssiIndicator.vue (126) ─ WiFi-Signal-Anzeige
```

---

## 2. State-Management

### Lokaler State (SystemMonitorView.vue)

| State | Typ | Zweck |
|-------|-----|-------|
| `unifiedEvents` | `UnifiedEvent[]` | Max 10.000 Events |
| `selectedEvent` | `UnifiedEvent \| null` | Ausgewähltes Event für Details |
| `filterEspId` | `string` | ESP-ID Filter |
| `filterLevels` | `Set<string>` | Severity-Filter (info/warning/error/critical) |
| `filterTimeRange` | `string` | Zeitfenster (all/1h/6h/24h/7d/30d/custom) |
| `customStartDate/EndDate` | `string` | Benutzerdefinierter Zeitraum |
| `selectedDataSources` | `Set<DataSource>` | 4 Quellen (audit_log/sensor_data/esp_health/actuators) |
| `isPaused` | `boolean` | Live-Pause (localStorage) |
| `activeTab` | `string` | Aktiver Tab |
| `paginationCursor` | `string` | Cursor für Infinite Scroll |
| `hasMoreEvents` | `boolean` | Weitere Events vorhanden |

### Computed Properties

| Computed | Zweck |
|----------|-------|
| `filteredEvents` | Client-seitige Filter (DataSource → ESP → Severity → Time) |
| `eventCounts` | Tab-Badges (errors, logs, mqtt) |

### Pinia Stores
- **espStore** (Geräteliste) - nur für ESP-ID-Dropdown
- Kein dedizierter Event/Audit-Store - Events leben im lokalen State

---

## 3. Server-Anbindung

### API-Calls (auditApi)

| Endpoint | Methode | Wann | Zweck |
|----------|---------|------|-------|
| `getAggregatedEvents()` | GET | onMounted, Filter-Change, Load-More | Multi-Source Event-Aggregation |
| `getStatistics()` | GET | onMounted | Error-Counts, Retention-Info |
| `queryLogs()` (logsApi) | GET | ServerLogsTab Polling (3s) | Server-Log-Abfrage |

### WebSocket-Events (31 Typen)

```
handleWebSocketMessage(message)
→ transformToUnifiedEvent(message)
→ unifiedEvents.unshift(event)  // Newest first
```

Empfängt alle 31 Event-Typen (esp_health, sensor_data, actuator_status, config_response, etc.)

### Datenfluss

```
1. Initial Load:     API → getAggregatedEvents(sources, time) → unifiedEvents
2. Live Updates:     WebSocket → transformToUnifiedEvent → unshift to unifiedEvents
3. Filter Change:    Debounced (300ms) → API Reload + Client-Filter (Computed)
4. Load More:        Cursor-based Pagination → append older events
```

### Hybrid-Filterung
- **Server:** Zeit, Quellen, Pagination
- **Client:** Severity, ESP-ID, Time-Refinement
- **_sourceType:** `'server'` Events skippen Client-Filter (bereits gefiltert)

---

## 4. UnifiedEventList - Event-Darstellung

### Props
| Prop | Typ |
|------|-----|
| `events` | `UnifiedEvent[]` |
| `isPaused` | `boolean` |
| `eventTypeLabels` | `Record<string, string>` |
| `restoredEventIds` | `Set<string>` |

### Render-Modi
- **Virtual Scroll:** Ab 200+ Events (berechnet `visibleRange` via Scroll-Position)
- **Standard Scroll:** Unter 200 Events

### Bestehende Gruppierung
- **Date Separators:** Events nach Tag gruppiert ("Heute", "Gestern", Datum)
- **Kategorie-Farben:** 4 Kategorien mit farbigen Left-Borders (esp-status=blau, sensors=grün, actuators=amber, system=violet)
- **Severity-Overlays:** Hintergrund-Tints + Icons

### Event-Item Layout
```
┌──────────────────────────────────────────────────┐
│ [Farbrand] [Icon] 13:10:25  CONFIG_PUBLISHED     │
│            Konfiguration gesendet an ESP_001      │
│            [Severity-Badge] [RSSI-Indicator]      │
└──────────────────────────────────────────────────┘
```

---

## 5. EventDetailsPanel - Detail-Ansicht

### Sections (in Reihenfolge)
| Section | Inhalt | Bedingung |
|---------|--------|-----------|
| Header | Event-Icon, Severity, Timestamp, Source | Immer |
| Summary | Typ-spezifische Zusammenfassung | Immer |
| Device Metrics | Heap%, RSSI-Qualität, Uptime | `showDeviceStatus` (Heartbeats) |
| Sensor Data | Wert, Unit, GPIO, Qualität | `showSensorData` |
| Error Details | Code, Message, Failures | `showErrorDetails` |
| Correlated Events | correlation_id-Verknüpfung + Latenz | Phase 3 - wenn correlation_id vorhanden |
| JSON | Expandierbare Rohdaten | Toggle |

### Bestehende Korrelations-Features (Phase 3)
- `correlatedEvents`: Verwandte Events anhand `correlation_id`
- `correlationLatency`: Millisekunden zwischen erstem und letztem Event

---

## 6. Event-Types & Transformation

### UnifiedEvent Interface (Kern-Felder)
```typescript
interface UnifiedEvent {
  id: string
  timestamp: string
  event_type: string               // 31 Typen
  severity: 'info' | 'warning' | 'error' | 'critical'
  source: 'server' | 'mqtt' | 'database' | 'esp' | 'logic' | 'user'
  dataSource: 'audit_log' | 'sensor_data' | 'esp_health' | 'actuators'
  message: string                  // Deutsch
  error_code?: number              // 1000-5999
  error_category?: string          // hardware/service/communication/application/server
  correlation_id?: string          // Phase 3
  request_id?: string              // Phase 4
  _sourceType: 'server' | 'websocket'  // Filter-Optimierung
}
```

### Event-Kategorien (4 visuelle Gruppen)
| Kategorie | Farbe | Event-Typen |
|-----------|-------|-------------|
| esp-status | Blau | heartbeat, online/offline, LWT, discovery |
| sensors | Grün | sensor_data, sensor_health |
| actuators | Amber | actuator_status/response/alert |
| system | Violet | config, auth, errors, lifecycle |

### Transformation Pipeline
```
WebSocket Message → transformToUnifiedEvent() → UnifiedEvent
API Response → transformAggregatedEventToUnified() → UnifiedEvent
```

`eventTransformer.ts` (400 Zeilen): getEventCategory(), transformEventMessage(), formatUptime(), formatMemory(), formatSensorValue()

---

## 7. Bestehende Gruppierungs-Features

| Feature | Status | Wo |
|---------|--------|----|
| Date Separators | ✅ Implementiert | UnifiedEventList.vue (sticky headers) |
| Kategorie-Farben | ✅ Implementiert | eventTransformer.ts → 4 Kategorien |
| correlation_id Anzeige | ✅ Implementiert (Phase 3) | EventDetailsPanel.vue |
| Latenz-Berechnung | ✅ Implementiert (Phase 3) | EventDetailsPanel.vue (correlationLatency) |
| request_id → Server Logs | ✅ Implementiert (Phase 4) | ServerLogsTab.vue |
| Time-Window Gruppierung | ❌ Nicht vorhanden | - |
| Event-Chain Timeline | ❌ Nicht vorhanden | - |
| Emergency-Stop Aggregation | ❌ Nicht vorhanden | - |
| Smart Error Clustering | ❌ Nicht vorhanden | - |

---

## 8. Implementierungs-Empfehlung

### Feature 1: Time-Window Gruppierung

**Beschreibung:** Events innerhalb von ±5s als Gruppe anzeigen ("Config-Update (5 Events)")

**Einstiegspunkt:**
- **Neue Utility:** `El Frontend/src/utils/eventGrouper.ts`
  - `groupByTimeWindow(events: UnifiedEvent[], windowMs: number): GroupedEvent[]`
  - GroupedEvent = { events: UnifiedEvent[], representative: UnifiedEvent, count: number }
- **Ändern:** `UnifiedEventList.vue` - Neue Render-Logik für gruppierte Events
- **Ändern:** `SystemMonitorView.vue` - Toggle "Gruppiert anzeigen" im Filter

**Datenfluss:**
```
filteredEvents → groupByTimeWindow(5000) → GroupedEvent[] → UnifiedEventList
```

**Risiko:** Virtual Scroll muss angepasst werden (variable Höhe für collapsed/expanded Groups)

---

### Feature 2: Event-Chain Visualisierung

**Beschreibung:** Timeline für korrelierte Events (config_published → config_response mit Latenz)

**Einstiegspunkt:**
- **Erweitern:** `EventDetailsPanel.vue` - "Correlated Events" Section ausbauen
- **Neue Komponente:** `EventTimeline.vue` - Horizontale Timeline mit Zeitmarken
- **Bestehende Basis:** `correlatedEvents` + `correlationLatency` (Phase 3) bereits vorhanden

**Änderungen:**
- EventDetailsPanel.vue: Timeline-Komponente statt Liste
- Neues CSS für Timeline-Visualisierung (Punkte + Verbindungslinien + Zeitangaben)

**Aufwand:** Gering - Infrastruktur (correlation_id, Latenz) existiert bereits

---

### Feature 3: Emergency-Stop Aggregation

**Beschreibung:** Emergency-Stop Trigger + alle betroffenen Aktoren als Gruppe

**Einstiegspunkt:**
- **Erweitern:** `eventGrouper.ts` - `groupEmergencyEvents(events): EmergencyGroup`
- **Erkennung:** event_type === 'emergency_stop' als Trigger, danach alle actuator_alert/-status Events desselben ESP innerhalb 5s
- **Anzeige:** Spezial-Card in UnifiedEventList mit rotem Banner

**Änderungen:**
- eventGrouper.ts: Emergency-Erkennungslogik
- UnifiedEventList.vue: EmergencyGroup-Render
- Neues CSS für Emergency-Gruppe

---

### Feature 4: Latenz-Visualisierung

**Beschreibung:** Grafische Darstellung der Zeit zwischen korrelierten Events

**Einstiegspunkt:**
- **Teil von Feature 2** (EventTimeline.vue)
- Kleine horizontale Timeline: `[config_published] ──243ms──> [config_response]`
- Farbcodierung: <100ms grün, <500ms gelb, >500ms rot

**Aufwand:** Geringster Aufwand - kann direkt in Feature 2 integriert werden

---

### Priorisierung

| Feature | Aufwand | Nutzen | Empfehlung |
|---------|---------|--------|------------|
| Event-Chain Timeline + Latenz | Niedrig | Hoch | Phase 5.1 (correlation_id existiert) |
| Time-Window Gruppierung | Mittel | Hoch | Phase 5.2 (Virtual Scroll Anpassung) |
| Emergency-Stop Aggregation | Niedrig | Mittel | Phase 5.3 (Spezialfall der Gruppierung) |

---

### Risiken & Abhängigkeiten

| Risiko | Beschreibung | Mitigation |
|--------|-------------|------------|
| Virtual Scroll | Gruppierte Events haben variable Höhe | Expand/Collapse mit fester Collapsed-Höhe |
| Performance | Gruppierung bei 10.000 Events | Lazy-Gruppierung nur für sichtbaren Bereich |
| WebSocket Live-Updates | Neue Events in bestehende Gruppen einfügen | Inkrementelle Re-Gruppierung statt full rebuild |
| correlation_id Verfügbarkeit | Nicht alle Events haben correlation_id | Time-Window als Fallback |

---

### Bestehende Infrastruktur (nutzbar)

1. **correlation_id** - Bereits in UnifiedEvent + EventDetailsPanel
2. **correlationLatency** - Bereits berechnet in EventDetailsPanel
3. **Date Separators** - Pattern für Gruppen-Header in UnifiedEventList
4. **Kategorie-System** - 4 Farben für visuelle Unterscheidung
5. **_sourceType** - Optimierung für Server vs. WebSocket Events
6. **request_id** - Verknüpfung zu Server-Logs
