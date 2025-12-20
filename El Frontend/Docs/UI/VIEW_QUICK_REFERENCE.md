# Frontend Views - Quick Reference

**Erstellt:** 2025-12-19  
**Letzte Aktualisierung:** 2025-12-20 (WebSocket-Integration verifiziert)  
**Zweck:** Schnelle Übersicht aller Views mit Status & API-Endpoints

---

## View-Übersicht (16 Total)

> ⚠️ **HINWEIS:** Am 20.12.2025 wurden die Routes refactored:  
> - `MockEspView` → `DevicesView` (Route `/devices`)  
> - `MockEspDetailView` → `DeviceDetailView` (Route `/devices/:espId`)  
> - Alte Routes (`/mock-esp/*`) redirecten automatisch.

| # | View | Route | Auth | Admin | Status | API Endpoints | Komponenten |
|---|------|-------|------|-------|--------|---------------|-------------|
| 1 | **DashboardView** | `/` | ✅ | ❌ | ✅ Implementiert | - | StatCard, LoadingState, EmptyState |
| 2 | **DevicesView** | `/devices` | ✅ | ❌ | ✅ Implementiert | `/debug/mock-esp`, `/v1/esp/devices` | ESPCard, LoadingState, EmptyState, ErrorState |
| 3 | **DeviceDetailView** | `/devices/:espId` | ✅ | ❌ | ✅ Implementiert | Unified: Mock+Real APIs | Badge, LoadingState, EmptyState, ZoneAssignmentPanel |
| 4 | **SensorsView** | `/sensors` | ✅ | ❌ | ✅ Implementiert | - (Store-only) | - |
| 5 | **ActuatorsView** | `/actuators` | ✅ | ❌ | ✅ Implementiert | - (Store-only) | - |
| 6 | **LogicView** | `/logic` | ✅ | ❌ | ⚠️ **Placeholder (53 LOC)** | `/v1/logic` (geplant) | - |
| 7 | **MqttLogView** | `/mqtt-log` | ✅ | ❌ | ✅ Implementiert | WebSocket `/api/v1/ws/realtime` | - |
| 8 | **DatabaseExplorerView** | `/database` | ✅ | ✅ | ✅ Implementiert | `/debug/db/*` | DataTable, FilterPanel, Pagination, SchemaInfoPanel, RecordDetailModal, TableSelector |
| 9 | **LogViewerView** | `/logs` | ✅ | ✅ | ✅ Implementiert | `/debug/logs/*` | LoadingState |
| 10 | **UserManagementView** | `/users` | ✅ | ✅ | ✅ Implementiert | `/v1/users/*` | - |
| 11 | **LoadTestView** | `/load-test` | ✅ | ✅ | ✅ Implementiert | `/debug/loadtest/*` | - |
| 12 | **SystemConfigView** | `/system-config` | ✅ | ✅ | ✅ Implementiert | `/debug/config` | LoadingState |
| 13 | **AuditLogView** | `/audit` | ✅ | ❌ | ✅ Implementiert | `/v1/audit/*` | LoadingState |
| 14 | **SettingsView** | `/settings` | ✅ | ❌ | ✅ Implementiert | - | - |
| 15 | **LoginView** | `/login` | ❌ | ❌ | ✅ Implementiert | `/auth/login` | - |
| 16 | **SetupView** | `/setup` | ❌ | ❌ | ✅ Implementiert | `/auth/setup` | - |

**Legende:**
- ✅ Auth: Login erforderlich
- ✅ Admin: Admin-Rolle erforderlich  
- ⚠️ Placeholder: UI vorhanden, aber nicht funktional

### Legacy Route Redirects (aus `router/index.ts`)

| Alt | Neu | Status |
|-----|-----|--------|
| `/mock-esp` | `/devices` | ✅ Redirect |
| `/mock-esp/:espId` | `/devices/:espId` | ✅ Redirect |

---

## API-Endpoint-Mapping

### Unified ESP APIs (DevicesView/DeviceDetailView)

> ⚠️ Der `espStore` routet automatisch basierend auf ESP-ID-Präfix:  
> - `ESP_MOCK_*` → Debug-APIs  
> - Andere → V1-APIs

| View | Methode | Endpoint | Beschreibung | Mock/Real |
|------|---------|----------|--------------|-----------|
| DevicesView | GET | `/debug/mock-esp` | Liste Mock-ESPs | Mock |
| DevicesView | GET | `/v1/esp/devices` | Liste Real-ESPs | Real |
| DevicesView | POST | `/debug/mock-esp` | Mock-ESP erstellen | Mock |
| DevicesView | DELETE | `/debug/mock-esp/:espId` | Mock-ESP löschen | Mock |
| DeviceDetailView | GET | `/debug/mock-esp/:espId` | Mock-ESP Details | Mock |
| DeviceDetailView | GET | `/v1/esp/devices/:espId` | Real-ESP Details | Real |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/heartbeat` | Heartbeat triggern | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/state` | System-State setzen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/sensors` | Sensor hinzufügen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/sensors/:gpio` | Sensor-Wert setzen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/sensors/batch` | Batch-Sensor-Update | Mock |
| DeviceDetailView | DELETE | `/debug/mock-esp/:espId/sensors/:gpio` | Sensor entfernen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/actuators` | Aktor hinzufügen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/actuators/:gpio` | Aktor-State setzen | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/emergency-stop` | Emergency-Stop | Mock |
| DeviceDetailView | POST | `/debug/mock-esp/:espId/clear-emergency` | Emergency aufheben | Mock |

### Debug-APIs (Admin-only, andere Views)
| DatabaseExplorerView | GET | `/debug/db/tables` | Tabellen-Liste |
| DatabaseExplorerView | GET | `/debug/db/tables/:tableName/schema` | Tabellen-Schema |
| DatabaseExplorerView | GET | `/debug/db/tables/:tableName/data` | Tabellen-Daten |
| DatabaseExplorerView | GET | `/debug/db/tables/:tableName/records/:recordId` | Einzelner Record |
| LogViewerView | GET | `/debug/logs/files` | Log-Dateien |
| LogViewerView | GET | `/debug/logs` | Logs abfragen |
| LoadTestView | POST | `/debug/loadtest/bulk-create` | Bulk-ESP-Erstellung |
| LoadTestView | POST | `/debug/loadtest/simulate` | Simulation starten |
| LoadTestView | GET | `/debug/loadtest/metrics` | Metriken |
| LoadTestView | POST | `/debug/loadtest/cleanup` | Cleanup |
| SystemConfigView | GET | `/debug/config` | Config-Einträge |
| SystemConfigView | PATCH | `/debug/config/:configKey` | Config aktualisieren |

### Public-APIs

| View | Methode | Endpoint | Beschreibung |
|------|---------|----------|--------------|
| UserManagementView | GET | `/v1/users` | Alle Benutzer |
| UserManagementView | POST | `/v1/users` | Benutzer erstellen |
| UserManagementView | PUT | `/v1/users/:userId` | Benutzer aktualisieren |
| UserManagementView | DELETE | `/v1/users/:userId` | Benutzer löschen |
| UserManagementView | POST | `/v1/users/:userId/reset-password` | Passwort zurücksetzen |
| UserManagementView | POST | `/v1/users/me/change-password` | Eigenes Passwort ändern |
| AuditLogView | GET | `/v1/audit` | Audit-Logs |
| AuditLogView | GET | `/v1/audit/statistics` | Statistiken |
| AuditLogView | GET | `/v1/audit/retention` | Retention-Config |
| AuditLogView | PUT | `/v1/audit/retention` | Retention aktualisieren |
| AuditLogView | POST | `/v1/audit/cleanup` | Manuelles Cleanup |
| LoginView | POST | `/auth/login` | Login |
| SetupView | POST | `/auth/setup` | Initial-Setup |

### WebSocket

| View | Methode | Endpoint | Beschreibung |
|------|---------|----------|--------------|
| MqttLogView | WS | `/api/v1/ws/realtime/:clientId?token=xxx` | Real-time MQTT-Messages |

---

## Store-Nutzung

> ⚠️ **Refactored:** `mockEspStore` wurde durch **`espStore`** ersetzt (Unified Store für Mock+Real).

| View | Store | Verwendung |
|------|-------|------------|
| DashboardView | `authStore`, `espStore` | User-Info, ESP-Count |
| **DevicesView** | `espStore` | Unified CRUD (Mock+Real) |
| **DeviceDetailView** | `espStore` | Sensor/Aktor-Management (Unified) |
| SensorsView | `espStore` | Aggregierte Sensor-Daten |
| ActuatorsView | `espStore` | Aggregierte Aktor-Daten |
| MqttLogView | `authStore` | Token-Refresh für WebSocket |
| DatabaseExplorerView | `databaseStore` | Table-Selection, Pagination |
| LoginView | `authStore` | Login |
| SetupView | `authStore` | Initial-Setup |
| SettingsView | `authStore` | User-Info, Logout |
| UserManagementView | - | Direct API-Calls |
| LoadTestView | - | Direct API-Calls |
| SystemConfigView | - | Direct API-Calls |
| AuditLogView | - | Direct API-Calls |
| LogViewerView | - | Direct API-Calls |

---

## Komponenten-Übersicht

### Common-Komponenten

| Komponente | Verwendung (Views) | Props |
|------------|-------------------|-------|
| `LoadingState.vue` | DashboardView, DevicesView, DeviceDetailView, DatabaseExplorerView, LogViewerView, SystemConfigView, AuditLogView | `text?: string` |
| `EmptyState.vue` | DashboardView, DevicesView, DeviceDetailView | `icon, title, description, actionText?, @action` |
| `ErrorState.vue` | DevicesView | `message, showRetry?, showDismiss?, @retry, @dismiss` |
| `Badge.vue` | DevicesView, DeviceDetailView | `variant, size?, pulse?, dot?` |

### ESP-Komponenten

| Komponente | Verwendung (Views) | Props | Status |
|------------|-------------------|-------|--------|
| `ESPCard.vue` | DevicesView | `esp: ESPDevice, @heartbeat, @toggle-safe-mode, @delete` | ✅ |
| `SensorSatellite.vue` | ❌ **Nicht verwendet** | `espId, gpio, sensorType, value, quality...` | ⚠️ Fertig, nicht integriert |
| `ActuatorSatellite.vue` | ❌ **Nicht verwendet** | `espId, gpio, actuatorType, state, pwmValue...` | ⚠️ Fertig, nicht integriert |
| `ConnectionLines.vue` | ❌ **Nicht verwendet** | `connections, positions, showTooltips...` | ⚠️ Fertig, nicht integriert |
| `SensorValueCard.vue` | - (optional für SensorsView) | `sensor, @edit` | ✅ |

### Dashboard-Komponenten

| Komponente | Verwendung (Views) | Props |
|------------|-------------------|-------|
| `StatCard.vue` | DashboardView | `title, value, icon?, trend?, variant?` |

### Database-Komponenten

| Komponente | Verwendung (Views) | Props |
|------------|-------------------|-------|
| `DataTable.vue` | DatabaseExplorerView | `columns, data, @sort` |
| `FilterPanel.vue` | DatabaseExplorerView | `columns, @filter` |
| `Pagination.vue` | DatabaseExplorerView | `page, pageSize, total, @change` |
| `RecordDetailModal.vue` | DatabaseExplorerView | `record, @close` |
| `SchemaInfoPanel.vue` | DatabaseExplorerView | `schema` |
| `TableSelector.vue` | DatabaseExplorerView | `tables, @select` |

### Zone-Komponenten

| Komponente | Verwendung (Views) | Props |
|------------|-------------------|-------|
| `ZoneAssignmentPanel.vue` | DeviceDetailView | `espId, currentZoneId?, currentZoneName?, currentMasterZoneId?, @zone-updated` |

---

## Feature-Status

> ⚠️ **Code-verifiziert am 20.12.2025**

| Feature | Status | View | Notizen |
|---------|--------|------|---------|
| Unified ESP CRUD | ✅ Done | DevicesView, DeviceDetailView | Mock+Real in einer View |
| Sensor-Management | ✅ Done | DeviceDetailView | Inkl. Batch-Update (nur Mock) |
| Actuator-Management | ✅ Done | DeviceDetailView | Inkl. Emergency-Stop (nur Mock) |
| Zone-Assignment | ✅ Done | DeviceDetailView | Via ZoneAssignmentPanel |
| WebSocket MQTT-Log | ✅ Done | MqttLogView | Auto-Reconnect, **alle 9 Message-Types** |
| WebSocket ESP-Updates | ✅ Done | DevicesView | esp_health, sensor_data, actuator_status, actuator_alert |
| **Satelliten-Layout** | ❌ **0%** | - | Komponenten fertig, **nicht in ESPCard integriert** |
| Database-Explorer | ✅ Done | DatabaseExplorerView | Filter, Pagination, Schema |
| Log-Viewer | ✅ Done | LogViewerView | Real-time-Modus, Filter |
| User-Management | ✅ Done | UserManagementView | CRUD, Password-Reset |
| Load-Testing | ✅ Done | LoadTestView | Bulk-Create, Simulation |
| System-Config | ✅ Done | SystemConfigView | Inline-Editing |
| Audit-Log | ✅ Done | AuditLogView | Filter, Statistics, Retention |
| **Logic-Engine UI** | ⚠️ **Placeholder** | LogicView | Nur statisches Template (53 LOC) |
| Auth-System | ✅ Done | LoginView, SetupView | JWT + Refresh-Token |

**Implementiert:** 15/16 Views (93.75%)  
**Placeholder:** 1/16 Views (6.25%)  
**Satelliten-Integration:** 0% (Komponenten ✅, Layout ❌)

---

## Next Steps (Priorisiert)

### 🔴 Priorität 1: Satelliten-Layout Integration (3-4 Tage)

| Schritt | Datei | Aufwand |
|---------|-------|---------|
| 1. Import Satelliten-Komponenten | `ESPCard.vue` | 0.5d |
| 2. CSS Orbital-Layout | `ESPCard.vue` | 1d |
| 3. Positions-Berechnung | `ESPCard.vue` | 1d |
| 4. ConnectionLines einbinden | `ESPCard.vue` | 0.5d |

### ✅ Priorität 2: WebSocket Live-Updates (ERLEDIGT 20.12.2025)

| Schritt | Datei | Status |
|---------|-------|--------|
| 1. MessageType erweitern | `types/index.ts` | ✅ Done |
| 2. sensor_data Handler | `esp.ts` Store | ✅ Done |
| 3. actuator_alert Handler | `esp.ts` Store | ✅ Done |
| 4. Handler-Cleanup (Memory Leak Fix) | `esp.ts` Store | ✅ Done |
| 5. MqttLogView alle Types | `MqttLogView.vue` | ✅ Done |

**Implementierte WebSocket-Handler im ESP-Store:**
- `handleEspHealth` - Device Health-Updates (uptime, heap, rssi)
- `handleSensorData` - Live Sensor-Wert-Updates
- `handleActuatorStatus` - Live Aktor-Status-Updates  
- `handleActuatorAlert` - Emergency-Stop und Safety-Alerts

### 🟢 Priorität 3: LogicView (8+ Tage)

| Schritt | Aufwand |
|---------|---------|
| 1. Backend: Logic-API (`/v1/logic/rules`) | 3d |
| 2. Frontend: logicStore | 1d |
| 3. Frontend: Rule-Builder-Komponente | 3d |
| 4. Testing | 1d |

---

**Ende Quick Reference**  
**Letzte Aktualisierung:** 20.12.2025
