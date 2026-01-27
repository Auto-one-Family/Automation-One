# Frontend Audit-Log Analyse - Ergebnis

**Erstellt:** 2026-01-20
**Analyst:** Claude Code
**Status:** ABGESCHLOSSEN

---

## 1. Zusammenfassung (Executive Summary)

### Gesamtbewertung: ✅ Frontend ist bereit für neue Event-Typen

Die Frontend-Infrastruktur für Audit-Logs ist **vollständig dynamisch** implementiert. Alle Event-Typen werden vom Server geladen - es gibt **keine hardcodierten Event-Typ-Labels** im Frontend.

**Kernaussage:** Wenn der Server die neuen ESP-Lifecycle Event-Typen korrekt im `/audit/event-types` Endpoint liefert, zeigt das Frontend diese automatisch an.

### Identifizierte Lücken

| Priorität | Lücke | Aufwand |
|-----------|-------|---------|
| 🔴 HOCH | Server `/audit/event-types` Endpoint fehlen 4 Event-Typen | 5 Min (Server) |
| 🟡 MITTEL | Keine Live-Updates für neue Audit-Einträge | 30-60 Min |
| 🟢 NIEDRIG | Kein ESP-spezifischer Audit-Tab im Dashboard | Optional |

---

## 2. Vorhandene Komponenten

### 2.1 Übersicht

| Komponente | Existiert? | Pfad | Status |
|------------|:----------:|------|--------|
| AuditLogView | ✅ Ja | `src/views/AuditLogView.vue` | Vollständig implementiert |
| Audit-API | ✅ Ja | `src/api/audit.ts` | 10 Endpoints, TypeScript-typisiert |
| Audit-Store | ❌ Nein | - | Nicht vorhanden (nicht notwendig) |
| Audit-Types | ✅ Ja | `src/api/audit.ts:17-112` | Interface `AuditLog` + 10 weitere |
| Audit-Route | ✅ Ja | `/audit` | Protected (requiresAuth) |
| ESP-Detail Audit-Tab | ❌ Nein | - | DeviceDetailView ist deprecated |
| WebSocket Audit-Events | ❌ Nein | - | Kein `audit_log_created` Event |

### 2.2 AuditLogView.vue Features

| Feature | Implementiert? | Details |
|---------|:--------------:|---------|
| Event-Typ-Filter | ✅ | Dynamisch vom Server geladen |
| Severity-Filter | ✅ | info/warning/error/critical |
| Source-Type-Filter | ✅ | esp32/user/system/api/mqtt/scheduler |
| Source-ID-Filter | ✅ | Freitext (für ESP-ID-Suche) |
| Zeitraum-Filter | ✅ | 1h/6h/24h/48h/1 Woche |
| Pagination | ✅ | 50 Einträge/Seite |
| Severity-Farben | ✅ | Blau/Gelb/Rot je nach Severity |
| Retention-Config | ✅ | Modal mit Severity-basierter Aufbewahrung |
| Cleanup (Dry-Run) | ✅ | Vorschau vor Löschung |
| Statistik-Karten | ✅ | Gesamt/Fehler/Speicher/Zu bereinigen |

### 2.3 Audit-API (audit.ts)

```typescript
// Implementierte Endpoints
auditApi.list(filters)           // GET /audit
auditApi.getErrors(hours, limit) // GET /audit/errors
auditApi.getEspConfigHistory()   // GET /audit/esp/{esp_id}/config-history
auditApi.getStatistics()         // GET /audit/statistics
auditApi.getErrorRate(hours)     // GET /audit/error-rate
auditApi.getRetentionConfig()    // GET /audit/retention/config
auditApi.updateRetentionConfig() // PUT /audit/retention/config
auditApi.runCleanup(dryRun)      // POST /audit/retention/cleanup
auditApi.getEventTypes()         // GET /audit/event-types
auditApi.getSeverities()         // GET /audit/severities
auditApi.getSourceTypes()        // GET /audit/source-types
```

### 2.4 AuditLog Interface (vollständig)

```typescript
interface AuditLog {
  id: string
  event_type: string          // ← Dynamisch, kein Enum
  severity: 'info' | 'warning' | 'error' | 'critical'
  source_type: string         // ← Dynamisch
  source_id: string | null    // ← ESP-ID bei ESP32-Events
  status: string
  message: string | null
  details: Record<string, unknown>
  error_code: string | null
  error_description: string | null
  ip_address: string | null
  correlation_id: string | null
  created_at: string
}
```

---

## 3. Neue Event-Typen Unterstützung

### 3.1 Server-seitige Definition (audit_log.py)

Die neuen Event-Typen sind im Server **definiert** (audit_log.py:207-220):

```python
class AuditEventType:
    # ESP Lifecycle Events (NEU - bereits definiert!)
    DEVICE_DISCOVERED = "device_discovered"
    DEVICE_APPROVED = "device_approved"
    DEVICE_REJECTED = "device_rejected"
    DEVICE_ONLINE = "device_online"
    DEVICE_OFFLINE = "device_offline"
    DEVICE_REDISCOVERED = "device_rediscovered"
    LWT_RECEIVED = "lwt_received"
```

### 3.2 Server-Endpoint `/audit/event-types` (audit.py:473-567)

**PROBLEM IDENTIFIZIERT:** Der Endpoint gibt **NICHT** alle Event-Typen zurück!

| Event-Typ | Im Endpoint? | Im Model? |
|-----------|:------------:|:---------:|
| `config_response` | ✅ | ✅ |
| `config_published` | ✅ | ✅ |
| `config_failed` | ✅ | ✅ |
| `device_registered` | ✅ | ✅ |
| `device_offline` | ✅ | ✅ |
| `device_discovered` | ❌ **FEHLT** | ✅ |
| `device_approved` | ❌ **FEHLT** | ✅ |
| `device_rejected` | ❌ **FEHLT** | ✅ |
| `device_online` | ❌ **FEHLT** | ✅ |
| `device_rediscovered` | ❌ **FEHLT** | ✅ |
| `lwt_received` | ❌ **FEHLT** | ✅ |

### 3.3 Frontend-Anzeige

Da das Frontend Event-Typen **dynamisch** vom Server lädt:

| Frage | Antwort |
|-------|---------|
| Werden neue Event-Typen automatisch angezeigt? | ✅ JA (wenn vom Server geliefert) |
| Sind Event-Typen hardcoded im Frontend? | ❌ NEIN |
| Gibt es ein Label-Mapping (Deutsch)? | ❌ NEIN (Server liefert `description`) |
| Werden unbekannte Event-Typen angezeigt? | ✅ JA (als raw string in Tabelle) |

---

## 4. WebSocket-Events Analyse

### 4.1 WebSocket-Service (websocket.ts)

| Frage | Antwort |
|-------|---------|
| Service existiert? | ✅ Ja (`src/services/websocket.ts`) |
| Singleton-Pattern? | ✅ Ja |
| Auto-Reconnect? | ✅ Ja (Exponential Backoff) |
| Token-Refresh? | ✅ Ja |

### 4.2 Definierte Message-Types (types/index.ts:351-370)

```typescript
export type MessageType =
  | 'sensor_data'
  | 'actuator_status'
  | 'actuator_response'
  | 'actuator_alert'
  | 'esp_health'
  | 'sensor_health'
  | 'config_response'
  | 'zone_assignment'
  | 'device_discovered'    // ✅ Vorhanden
  | 'device_approved'      // ✅ Vorhanden
  | 'device_rejected'      // ✅ Vorhanden
  | 'device_rediscovered'  // ✅ Vorhanden
  | 'logic_execution'
  | 'system_event'
  // ❌ FEHLT: audit_log_created
```

### 4.3 Audit Live-Updates

| Feature | Status |
|---------|--------|
| WebSocket-Event für neue Audit-Einträge | ❌ NICHT IMPLEMENTIERT |
| AuditLogView subscribed WebSocket | ❌ NEIN (nur manueller Refresh) |
| Real-time Audit-Notification | ❌ NEIN |

**Konsequenz:** Neue Audit-Einträge erscheinen erst nach manuellem "Aktualisieren"-Klick.

---

## 5. ESP-Detail Analyse

### 5.1 DeviceDetailView.vue

| Frage | Antwort |
|-------|---------|
| View existiert? | ⚠️ DEPRECATED |
| Route `/devices/:espId` | Redirect zu Dashboard |
| Audit-Tab vorhanden? | ❌ NEIN |

**Hinweis:** Die ESP-Detail-Ansicht wurde zugunsten der Dashboard-Integration (ESPSettingsPopover) aufgegeben.

### 5.2 PendingDevicesPanel.vue

| Frage | Antwort |
|-------|---------|
| Komponente existiert? | ✅ Ja |
| Zeigt Approve-Button? | ✅ Ja |
| Zeigt Reject-Button? | ✅ Ja |
| Zeigt Audit-History? | ❌ NEIN |
| WebSocket für Discovery-Events? | ✅ JA (via esp.ts Store) |

---

## 6. Router-Konfiguration

```typescript
// router/index.ts:72-76
{
  path: 'audit',
  name: 'audit',
  component: () => import('@/views/AuditLogView.vue'),
  // KEIN meta.requiresAdmin - alle authentifizierten User haben Zugang
}
```

| Frage | Antwort |
|-------|---------|
| Route existiert? | ✅ `/audit` |
| Auth-Guard? | ✅ requiresAuth |
| Admin-only? | ❌ NEIN (alle User) |

---

## 7. Handlungsempfehlungen

### 7.1 Sofort notwendig (Server-Fix)

**Priorität: 🔴 HOCH - Aufwand: 5 Minuten**

Der `/audit/event-types` Endpoint muss die fehlenden Event-Typen liefern:

```python
# In audit.py:list_event_types() hinzufügen:

# ESP Lifecycle Events (nach DEVICE_OFFLINE hinzufügen)
EventTypeInfo(
    value=AuditEventType.DEVICE_DISCOVERED,
    description="New device discovered",
    category="Device Lifecycle",
),
EventTypeInfo(
    value=AuditEventType.DEVICE_APPROVED,
    description="Device approved by admin",
    category="Device Lifecycle",
),
EventTypeInfo(
    value=AuditEventType.DEVICE_REJECTED,
    description="Device rejected by admin",
    category="Device Lifecycle",
),
EventTypeInfo(
    value=AuditEventType.DEVICE_ONLINE,
    description="Device came online",
    category="Device Lifecycle",
),
EventTypeInfo(
    value=AuditEventType.DEVICE_REDISCOVERED,
    description="Rejected device rediscovered",
    category="Device Lifecycle",
),
EventTypeInfo(
    value=AuditEventType.LWT_RECEIVED,
    description="Last Will message received (unexpected disconnect)",
    category="Device Lifecycle",
),
```

### 7.2 Optional: Live-Updates für Audit-Logs

**Priorität: 🟡 MITTEL - Aufwand: 30-60 Min**

1. Server: WebSocket-Broadcast bei neuem Audit-Eintrag hinzufügen
2. Frontend: `audit_log_created` Event in MessageType ergänzen
3. AuditLogView: WebSocket-Subscription für Auto-Refresh

### 7.3 Optional: ESP-spezifischer Audit-Tab

**Priorität: 🟢 NIEDRIG - Aufwand: 2-4 Stunden**

ESPSettingsPopover um "Audit-History" Tab erweitern:
- Ruft `auditApi.list({ source_id: espId })` auf
- Zeigt die letzten 20 Audit-Einträge für dieses ESP

---

## 8. Vollständige Vue-Komponenten Liste

### 8.1 Views (17 Dateien)

| Datei | Audit-relevant? | Beschreibung |
|-------|:---------------:|--------------|
| AuditLogView.vue | ✅ JA | Haupt-Audit-Log-Ansicht |
| DashboardView.vue | ⚠️ Indirekt | Enthält ESPs (könnten Audit-Link haben) |
| DeviceDetailView.vue | ❌ DEPRECATED | Redirect zu Dashboard |
| MaintenanceView.vue | ❌ Nein | Cleanup-Jobs |
| LogViewerView.vue | ❌ Nein | Server-Logs |
| MqttLogView.vue | ❌ Nein | MQTT-Traffic |
| SensorsView.vue | ❌ Nein | Sensor-Config |
| ActuatorsView.vue | ❌ DEPRECATED | Redirect zu SensorsView |
| LogicView.vue | ❌ Nein | Automation Rules |
| SettingsView.vue | ❌ Nein | App Settings |
| SystemConfigView.vue | ❌ Nein | System Config |
| UserManagementView.vue | ❌ Nein | User Management |
| LoginView.vue | ❌ Nein | Login |
| SetupView.vue | ❌ Nein | Initial Setup |
| DatabaseExplorerView.vue | ❌ Nein | DB Explorer |
| LoadTestView.vue | ❌ Nein | Load Testing |
| DevicesView.vue | ❌ DEPRECATED | Redirect zu Dashboard |

### 8.2 ESP-bezogene Components

| Datei | Pfad | Audit-relevant? |
|-------|------|:---------------:|
| ESPCard.vue | `components/esp/` | ⚠️ Potentiell (Audit-Link möglich) |
| ESPOrbitalLayout.vue | `components/esp/` | ❌ Nein |
| ESPSettingsPopover.vue | `components/esp/` | ⚠️ Potentiell (Audit-Tab möglich) |
| PendingDevicesPanel.vue | `components/esp/` | ⚠️ Potentiell (Audit-History möglich) |
| SensorSatellite.vue | `components/esp/` | ❌ Nein |
| ActuatorSatellite.vue | `components/esp/` | ❌ Nein |

### 8.3 Stores (5 Dateien)

| Datei | Audit-relevant? | Beschreibung |
|-------|:---------------:|--------------|
| auth.ts | ❌ Nein | Authentication |
| esp.ts | ⚠️ Indirekt | ESP-Daten (keine Audit-Integration) |
| logic.ts | ❌ Nein | Logic Rules |
| database.ts | ❌ Nein | DB Explorer |
| dragState.ts | ❌ Nein | Drag & Drop |

### 8.4 API-Clients (15 Dateien)

| Datei | Beschreibung |
|-------|--------------|
| audit.ts | ✅ **Audit-API** - vollständig |
| esp.ts | ESP Device Management |
| sensors.ts | Sensor Config/Data |
| actuators.ts | Actuator Control |
| auth.ts | Authentication |
| zones.ts | Zone Management |
| subzones.ts | Subzone Management |
| logic.ts | Logic Rules |
| config.ts | System Config |
| users.ts | User Management |
| database.ts | DB Explorer |
| logs.ts | Server Logs |
| debug.ts | Mock ESP |
| loadtest.ts | Load Testing |
| index.ts | Axios Instance |

---

## 9. Antworten auf die Prüfungsfragen

| Frage | Antwort |
|-------|---------|
| **1. Zeigt AuditLogView dynamisch alle Event-Typen an?** | ✅ JA - lädt via `getEventTypes()` vom Server |
| **2. Gibt es ein Label-Mapping für Event-Typen (Deutsch)?** | ❌ NEIN - Server liefert englische `description`, Frontend zeigt `event_type` raw |
| **3. Werden Severity-Levels farblich unterschieden?** | ✅ JA - info=blau, warning=gelb, error/critical=rot |
| **4. Kann nach ESP-ID gefiltert werden?** | ⚠️ INDIREKT - über `source_id` Filter (Freitext) |
| **5. Gibt es WebSocket-Events für neue Audit-Einträge?** | ❌ NEIN - manueller Refresh notwendig |
| **6. Gibt es einen Audit-Tab in der ESP-Detail-Ansicht?** | ❌ NEIN - ESP-Detail-View ist deprecated |

---

## 10. Fazit

### Was funktioniert bereits

1. ✅ **AuditLogView ist vollständig** - Filter, Pagination, Retention, Cleanup
2. ✅ **Dynamische Event-Typen** - Keine Hardcoding im Frontend
3. ✅ **Severity-Anzeige** - Farben und Icons
4. ✅ **API-Client komplett** - Alle Endpoints typisiert

### Was fehlt

1. 🔴 **Server-Endpoint unvollständig** - 6 Event-Typen fehlen in `/audit/event-types`
2. 🟡 **Keine Live-Updates** - Kein WebSocket für neue Audit-Einträge
3. 🟢 **Kein ESP-Audit-Tab** - Keine schnelle Audit-Ansicht pro ESP

### Nächster Schritt

**Priorität 1:** Server `/audit/event-types` Endpoint erweitern (5 Min)

Nach diesem Fix werden die neuen ESP-Lifecycle Events automatisch im Frontend-Dropdown erscheinen.

---

**Analyse abgeschlossen: 2026-01-20**
