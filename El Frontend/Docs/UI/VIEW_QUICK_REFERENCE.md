# Frontend Views - Quick Reference

**Erstellt:** 2025-12-19
**Zweck:** Schnelle Übersicht aller Views mit Status & API-Endpoints

---

## View-Übersicht (16 Total)

| # | View | Route | Auth | Admin | Status | API Endpoints | Komponenten |
|---|------|-------|------|-------|--------|---------------|-------------|
| 1 | **DashboardView** | `/` | ✅ | ❌ | ✅ Implementiert | - | StatCard, LoadingState, EmptyState |
| 2 | **MockEspView** | `/mock-esp` | ✅ | ✅ | ✅ Implementiert | `/debug/mock-esp` | ESPCard, LoadingState, EmptyState, ErrorState |
| 3 | **MockEspDetailView** | `/mock-esp/:espId` | ✅ | ✅ | ✅ Implementiert | `/debug/mock-esp/:espId/*` | Badge, LoadingState, EmptyState, ZoneAssignmentPanel |
| 4 | **SensorsView** | `/sensors` | ✅ | ❌ | ✅ Implementiert | - (Store-only) | - |
| 5 | **ActuatorsView** | `/actuators` | ✅ | ❌ | ✅ Implementiert | - (Store-only) | - |
| 6 | **LogicView** | `/logic` | ✅ | ❌ | ⚠️ Placeholder | `/v1/logic` (geplant) | - |
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

---

## API-Endpoint-Mapping

### Debug-APIs (Admin-only)

| View | Methode | Endpoint | Beschreibung |
|------|---------|----------|--------------|
| MockEspView | GET | `/debug/mock-esp` | Liste aller Mock-ESPs |
| MockEspView | POST | `/debug/mock-esp` | Mock-ESP erstellen |
| MockEspView | DELETE | `/debug/mock-esp/:espId` | Mock-ESP löschen |
| MockEspDetailView | GET | `/debug/mock-esp/:espId` | ESP-Details |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/heartbeat` | Heartbeat triggern |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/state` | System-State setzen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/sensors` | Sensor hinzufügen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/sensors/:gpio` | Sensor-Wert setzen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/sensors/batch` | Batch-Sensor-Update |
| MockEspDetailView | DELETE | `/debug/mock-esp/:espId/sensors/:gpio` | Sensor entfernen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/actuators` | Aktor hinzufügen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/actuators/:gpio` | Aktor-State setzen |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/emergency-stop` | Emergency-Stop |
| MockEspDetailView | POST | `/debug/mock-esp/:espId/clear-emergency` | Emergency aufheben |
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

| View | Store | Verwendung |
|------|-------|------------|
| DashboardView | `authStore`, `mockEspStore` | User-Info, ESP-Count |
| MockEspView | `mockEspStore` | CRUD-Operationen |
| MockEspDetailView | `mockEspStore` | Sensor/Aktor-Management |
| SensorsView | `mockEspStore` | Aggregierte Sensor-Daten |
| ActuatorsView | `mockEspStore` | Aggregierte Aktor-Daten |
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
| `LoadingState.vue` | DashboardView, MockEspView, MockEspDetailView, DatabaseExplorerView, LogViewerView, SystemConfigView, AuditLogView | `text?: string` |
| `EmptyState.vue` | DashboardView, MockEspView, MockEspDetailView | `icon, title, description, actionText?, @action` |
| `ErrorState.vue` | MockEspView | `message, showRetry?, showDismiss?, @retry, @dismiss` |
| `Badge.vue` | MockEspView, MockEspDetailView | `variant, size?, pulse?, dot?` |

### ESP-Komponenten

| Komponente | Verwendung (Views) | Props |
|------------|-------------------|-------|
| `ESPCard.vue` | MockEspView | `esp: MockESP, @heartbeat, @toggle-safe-mode, @delete` |
| `SensorValueCard.vue` | - (optional für SensorsView) | `sensor, @edit` |

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
| `ZoneAssignmentPanel.vue` | MockEspDetailView | `espId, currentZoneId?, currentZoneName?, currentMasterZoneId?, @zone-updated` |

---

## Feature-Status

| Feature | Status | View | Notizen |
|---------|--------|------|---------|
| Mock-ESP CRUD | ✅ Done | MockEspView, MockEspDetailView | Voll funktional |
| Sensor-Management | ✅ Done | MockEspDetailView | Inkl. Batch-Update |
| Actuator-Management | ✅ Done | MockEspDetailView | Inkl. Emergency-Stop |
| Zone-Assignment | ✅ Done | MockEspDetailView | Via ZoneAssignmentPanel |
| WebSocket Real-time | ✅ Done | MqttLogView | Auto-Reconnect funktioniert |
| Database-Explorer | ✅ Done | DatabaseExplorerView | Filter, Pagination, Schema |
| Log-Viewer | ✅ Done | LogViewerView | Real-time-Modus, Filter |
| User-Management | ✅ Done | UserManagementView | CRUD, Password-Reset |
| Load-Testing | ✅ Done | LoadTestView | Bulk-Create, Simulation |
| System-Config | ✅ Done | SystemConfigView | Inline-Editing |
| Audit-Log | ✅ Done | AuditLogView | Filter, Statistics, Retention |
| Logic-Engine | ⚠️ Placeholder | LogicView | Nur UI-Template |
| Auth-System | ✅ Done | LoginView, SetupView | JWT + Refresh-Token |

**Implementiert:** 15/16 Views (93.75%)
**Placeholder:** 1/16 Views (6.25%)

---

## Next Steps (für LogicView)

1. **Backend:** Logic-API implementieren (`/v1/logic/rules`)
2. **Frontend:** Rule-Builder-Komponente erstellen
   - Condition-Builder (Sensor-Werte, Zeit-Trigger)
   - Action-Builder (Actuator-Commands)
   - Cooldown-Konfiguration
3. **Store:** `logicStore` für Rule-Management
4. **Testing:** Rule-Execution-Flow testen

**Geschätzte Zeit:** 8-12h (Backend + Frontend)

---

**Ende Quick Reference**
