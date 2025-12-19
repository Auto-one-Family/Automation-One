# Frontend Views - Systematische Analyse

**Erstellt:** 2025-12-19
**Letztes Update:** 2025-12-19
**Projekt:** Auto-one El Frontend (Vue3 + TypeScript + Vite)

---

## Übersicht

Diese Dokumentation analysiert alle 16 Frontend-Views systematisch nach:
- Route & Auth-Anforderungen
- API-Endpoints & Payloads
- Komponenten-Nutzung
- Store-Integration
- WebSocket-Events

**Backend-Referenz:** `El Servador/god_kaiser_server/src/`

---

## 1. Vollständige View-Matrix

| ViewName | Route | Status | Auth | Admin | API Endpoints | Komponenten | Beschreibung |
|----------|-------|--------|------|-------|---------------|-------------|--------------|
| **DashboardView.vue** | `/` | ✅ Implementiert | ✅ | ❌ | - | StatCard, LoadingState, EmptyState | Haupt-Dashboard mit System-Übersicht |
| **MockEspView.vue** | `/mock-esp` | ✅ Implementiert | ✅ | ✅ | `/debug/mock-esp` | ESPCard, LoadingState, EmptyState, ErrorState | Liste aller Mock-ESP-Geräte mit Filtern |
| **MockEspDetailView.vue** | `/mock-esp/:espId` | ✅ Implementiert | ✅ | ✅ | `/debug/mock-esp/:espId/*` | Badge, LoadingState, EmptyState, ZoneAssignmentPanel | Detail-Ansicht für einzelnes Mock-ESP |
| **SensorsView.vue** | `/sensors` | ✅ Implementiert | ✅ | ❌ | - (Store-only) | - | Aggregierte Sensor-Ansicht über alle ESPs |
| **ActuatorsView.vue** | `/actuators` | ✅ Implementiert | ✅ | ❌ | - (Store-only) | - | Aggregierte Aktor-Ansicht über alle ESPs |
| **LogicView.vue** | `/logic` | ⚠️ Placeholder | ✅ | ❌ | `/v1/logic` (geplant) | - | Automation-Rules (noch nicht implementiert) |
| **MqttLogView.vue** | `/mqtt-log` | ✅ Implementiert | ✅ | ❌ | WebSocket `/api/v1/ws/realtime` | - | Echtzeit MQTT-Nachrichten via WebSocket |
| **DatabaseExplorerView.vue** | `/database` | ✅ Implementiert | ✅ | ✅ | `/debug/db/*` | DataTable, FilterPanel, Pagination, SchemaInfoPanel | Datenbank-Explorer mit Query-Builder |
| **LogViewerView.vue** | `/logs` | ✅ Implementiert | ✅ | ✅ | `/debug/logs/*` | LoadingState | Server-Log-Viewer mit Filter & Suche |
| **UserManagementView.vue** | `/users` | ✅ Implementiert | ✅ | ✅ | `/v1/users/*` | - | Benutzerverwaltung (CRUD) |
| **LoadTestView.vue** | `/load-test` | ✅ Implementiert | ✅ | ✅ | `/debug/loadtest/*` | - | Load-Testing-Tools für Mock-ESPs |
| **SystemConfigView.vue** | `/system-config` | ✅ Implementiert | ✅ | ✅ | `/debug/config` | LoadingState | System-Konfigurationseditor |
| **AuditLogView.vue** | `/audit` | ✅ Implementiert | ✅ | ❌ | `/v1/audit/*` | LoadingState | Audit-Log mit Retention-Verwaltung |
| **SettingsView.vue** | `/settings` | ✅ Implementiert | ✅ | ❌ | - | - | Benutzereinstellungen & Server-Info |
| **LoginView.vue** | `/login` | ✅ Implementiert | ❌ | ❌ | `/auth/login` | - | Login-Formular |
| **SetupView.vue** | `/setup` | ✅ Implementiert | ❌ | ❌ | `/auth/setup` | - | Initial-Setup für ersten Admin-User |

---

## 2. Kritische Views - Detailanalyse

### 2.1 MockEspView.vue

**Route:** `/mock-esp` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`

**API-Endpoints:**
```typescript
// GET - Liste aller Mock-ESPs
GET /api/v1/debug/mock-esp
Response: { success: boolean, data: MockESP[], total: number }

// POST - Mock-ESP erstellen
POST /api/v1/debug/mock-esp
Payload: {
  esp_id: string,
  zone_id?: string,
  auto_heartbeat: boolean,
  heartbeat_interval_seconds: number,
  sensors: MockSensorConfig[],
  actuators: MockActuatorConfig[]
}
Response: MockESP

// DELETE - Mock-ESP löschen
DELETE /api/v1/debug/mock-esp/:espId
```

**Store-Nutzung:**
- `useMockEspStore()` - CRUD-Operationen, State-Management
- Filter-State: Local refs (filterType, filterStatus)

**Komponenten:**
- `ESPCard` - Wiederverwendbare ESP-Karte mit Actions
- `LoadingState`, `EmptyState`, `ErrorState` - Common UI States

**Features:**
- Type-Filter (Mock/Real) + Status-Filter (Online/Offline)
- Inline ESP-ID-Generator (`ESP_MOCK_XXXXXX`)
- Bulk-Actions: Refresh, Delete

---

### 2.2 MockEspDetailView.vue

**Route:** `/mock-esp/:espId` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`
**Service:** `El Servador/god_kaiser_server/src/services/mock_esp_manager.py`

**API-Endpoints:**
```typescript
// GET - ESP-Details
GET /api/v1/debug/mock-esp/:espId
Response: MockESP

// POST - Heartbeat triggern
POST /api/v1/debug/mock-esp/:espId/heartbeat
Response: { success: boolean, esp_id: string, timestamp: string, message_published: boolean, payload: object }

// POST - System-State setzen
POST /api/v1/debug/mock-esp/:espId/state
Payload: { state: MockSystemState, reason?: string }

// POST - Auto-Heartbeat konfigurieren
POST /api/v1/debug/mock-esp/:espId/auto-heartbeat?enabled=true&interval_seconds=60

// POST - Sensor hinzufügen
POST /api/v1/debug/mock-esp/:espId/sensors
Payload: MockSensorConfig

// POST - Sensor-Wert setzen
POST /api/v1/debug/mock-esp/:espId/sensors/:gpio
Payload: { raw_value: number, quality?: QualityLevel, publish: boolean }

// POST - Batch-Sensor-Update
POST /api/v1/debug/mock-esp/:espId/sensors/batch
Payload: { values: Record<number, number>, publish: boolean }

// DELETE - Sensor entfernen
DELETE /api/v1/debug/mock-esp/:espId/sensors/:gpio

// POST - Aktor hinzufügen
POST /api/v1/debug/mock-esp/:espId/actuators
Payload: MockActuatorConfig

// POST - Aktor-State setzen
POST /api/v1/debug/mock-esp/:espId/actuators/:gpio
Payload: { state: boolean, pwm_value?: number, publish: boolean }

// POST - Emergency-Stop
POST /api/v1/debug/mock-esp/:espId/emergency-stop?reason=manual

// POST - Emergency aufheben
POST /api/v1/debug/mock-esp/:espId/clear-emergency

// GET - Publizierte Nachrichten abrufen
GET /api/v1/debug/mock-esp/:espId/messages?limit=100

// DELETE - Nachrichtenverlauf löschen
DELETE /api/v1/debug/mock-esp/:espId/messages
```

**Store-Nutzung:**
- `useMockEspStore()` - CRUD für Sensoren/Aktoren, State-Management

**Komponenten:**
- `Badge` - Status-Anzeige (Mock/Real, State, Quality)
- `ZoneAssignmentPanel` - Zone-Zuweisung
- `LoadingState`, `EmptyState` - UI States

**Utils:**
- `sensorDefaults` - `SENSOR_TYPE_CONFIG`, `getSensorUnit()`, `getSensorDefault()`
- `labels` - `getStateInfo()`, `getQualityLabel()`, `getActuatorTypeLabel()`
- `formatters` - `formatUptime()`, `formatHeapSize()`, `formatRssi()`

**Features:**
- Sensor-Typ-basierte Default-Werte (DS18B20, SHT31, PH, etc.)
- Batch-Sensor-Update-Modal
- Quality-Level-Editing (excellent, good, fair, poor, bad, stale)
- Emergency-Stop mit Visual Feedback

---

### 2.3 LogicView.vue

**Route:** `/logic`

**Status:** ⚠️ **PLACEHOLDER** - Noch nicht implementiert

**Geplante API:**
```typescript
// Logic-Engine (Server-seitig implementiert)
GET /v1/logic/rules
POST /v1/logic/rules
PUT /v1/logic/rules/:ruleId
DELETE /v1/logic/rules/:ruleId
```

**Features (geplant):**
- Create Automation-Rules
- Condition-Builder (Sensor-Schwellwerte, Zeit-Trigger)
- Action-Definition (Actuator-Commands)
- Cooldown-Konfiguration

**Aktuell:**
- Static Example Card: "Temperature Control" Rule
- Hinweis auf `/v1/logic` API-Endpoint

---

### 2.4 MqttLogView.vue

**Route:** `/mqtt-log`
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/websocket/realtime.py`
**WebSocket-Manager:** `El Servador/god_kaiser_server/src/websocket/manager.py`

**WebSocket-Integration:**
```typescript
// WebSocket-Verbindung
const apiHost = import.meta.env.VITE_API_HOST || 'localhost:8000'
const clientId = `frontend_${Date.now()}`
WS ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${accessToken}

// Subscribe-Nachricht (nach onopen)
{
  action: 'subscribe',
  filters: {
    types: ['sensor_data', 'actuator_status', 'logic_execution',
            'esp_health', 'system_event']
  }
}

// Empfangene Nachrichten
{
  type: MessageType,
  topic: string,
  payload: object,
  esp_id?: string,
  timestamp?: string
}
```

**Store-Nutzung:**
- `useAuthStore()` - Token-Refresh für WebSocket-Auth

**Features:**
- Real-time Message Stream (max 500 Messages)
- Auto-Reconnect (3s Delay)
- Pause/Resume-Funktion
- Filter nach Type, ESP-ID, Topic
- Expandable Payload-View (JSON)
- Token-Refresh-Integration

**Message Types:**
- `sensor_data` - Sensor-Messwerte
- `actuator_status` - Aktor-Statusänderungen
- `logic_execution` - Logic-Engine-Events
- `esp_health` - Heartbeat/Diagnostics
- `system_event` - Server-Events

---

### 2.5 DatabaseExplorerView.vue

**Route:** `/database` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`
**Schemas:** `El Servador/god_kaiser_server/src/schemas/debug_db.py`

**API-Endpoints:**
```typescript
// GET - Liste aller Tabellen mit Schema
GET /api/v1/debug/db/tables
Response: { 
  success: boolean, 
  tables: TableSchema[] // name, columns, row_count, primary_key
}

// GET - Tabellen-Schema
GET /api/v1/debug/db/:tableName/schema
Response: {
  table_name: string,
  columns: ColumnSchema[], // name, type, nullable, primary_key, foreign_key
  row_count: number,
  primary_key: string
}

// GET - Tabellen-Daten mit Pagination/Filter/Sorting
GET /api/v1/debug/db/:tableName?page=1&page_size=50&sort_by=created_at&sort_order=desc&filters={"column":"value"}
Response: {
  success: boolean,
  table_name: string,
  data: Record<string, unknown>[],
  total_count: number,
  page: number,
  page_size: number,
  total_pages: number
}

// GET - Einzelner Record
GET /api/v1/debug/db/:tableName/:recordId
Response: { success: boolean, table_name: string, record: Record<string, unknown> }
```

**Filter-Syntax (Django-Style):**
```json
{
  "column": "value",           // exact match
  "column__gte": 100,          // greater than or equal
  "column__lte": 200,          // less than or equal
  "column__in": ["a", "b"],    // in list
  "column__contains": "text"   // LIKE %text%
}
```

**Erlaubte Tabellen:** Definiert in `schemas/debug_db.py` → `ALLOWED_TABLES`

**Store-Nutzung:**
- `useDatabaseStore()` - Table-Selection, Pagination, Filters

**Komponenten:**
- `TableSelector` - Dropdown für Tabellen-Auswahl
- `SchemaInfoPanel` - Schema-Anzeige (Columns, Types)
- `FilterPanel` - Column-basierte Filter
- `DataTable` - Daten-Grid mit Sortierung
- `Pagination` - Seiten-Navigation
- `RecordDetailModal` - Detail-View für Records

**Features:**
- Dynamic Table-Loading
- Client-side + Server-side Filtering
- Sortierung (asc/desc)
- Pagination (50/100/200 Einträge)
- JSON-Feld-Anzeige

---

### 2.6 LogViewerView.vue

**Route:** `/logs` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`
**Log-Konfiguration:** `El Servador/god_kaiser_server/config/logging.yaml`

**API-Endpoints:**
```typescript
// GET - Log-Dateien auflisten
GET /api/v1/debug/logs/files
Response: { 
  success: boolean,
  files: LogFile[], 
  log_directory: string 
}

interface LogFile {
  name: string,
  path: string,
  size_bytes: number,
  size_human: string,
  modified: string,
  is_current: boolean
}

// GET - Logs abfragen (mit Filtern)
GET /api/v1/debug/logs?level=INFO&module=mqtt.handlers&search=error&file=app.log&start_time=2025-01-01T00:00:00Z&end_time=2025-12-31T23:59:59Z&page=1&page_size=100
Response: {
  success: boolean,
  logs: LogEntry[],
  total_count: number,
  page: number,
  page_size: number,
  has_more: boolean
}

interface LogEntry {
  timestamp: string,
  level: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL',
  logger: string,
  message: string,
  module?: string,
  function?: string,
  line?: number,
  exception?: string,
  extra?: Record<string, unknown>
}
```

**Hinweis:** Logs werden aus der Log-Datei gelesen, die in `config/logging.yaml` definiert ist. 
Bei großen Dateien wird nur bis max. 10.000 Einträge gescannt.

**Features:**
- Log-File-Selector
- Level-Filter (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Module-Filter (z.B. `mqtt.handlers`)
- Full-Text-Search
- Time-Range-Filter (Start/End)
- Real-time-Modus (Polling alle 3s)
- Auto-Scroll (Toggle)
- Expandable Log-Details (Exception, Extra-Data)

**Log-Level-Icons:**
- DEBUG: Bug
- INFO: Info
- WARNING: AlertTriangle
- ERROR: XCircle
- CRITICAL: AlertCircle

---

### 2.7 UserManagementView.vue

**Route:** `/users` (Admin-only)

**API-Endpoints:**
```typescript
// GET - Alle Benutzer
GET /v1/users
Response: { success: boolean, users: User[], total: number }

// POST - Benutzer erstellen
POST /v1/users
Payload: { username: string, email: string, password: string, role: UserRole }
Response: User

// PUT - Benutzer aktualisieren
PUT /v1/users/:userId
Payload: { email?: string, role?: UserRole, is_active?: boolean }
Response: User

// DELETE - Benutzer löschen
DELETE /v1/users/:userId
Response: { success: boolean, message: string }

// POST - Passwort zurücksetzen (Admin)
POST /v1/users/:userId/reset-password
Payload: { new_password: string }

// POST - Eigenes Passwort ändern
POST /v1/users/me/change-password
Payload: { current_password: string, new_password: string }
```

**User-Rollen:**
- `admin` - Volle Rechte
- `operator` - Lese-/Schreib-Zugriff
- `viewer` - Nur Lesezugriff

**Features:**
- CRUD-Operationen
- Role-Based Access Control (RBAC)
- Password-Reset (Admin-Funktion)
- User-Status (Active/Inactive)
- Self-Service Password-Change

---

### 2.8 LoadTestView.vue

**Route:** `/load-test` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`
**Service:** `El Servador/god_kaiser_server/src/services/mock_esp_manager.py`

**API-Endpoints:**
```typescript
// POST - Bulk-ESP-Erstellung (max 100)
POST /api/v1/debug/load-test/bulk-create
Payload: {
  count: number,           // 1-100
  prefix: string,          // Default: "LOAD_TEST"
  with_sensors: number,    // 0-10
  with_actuators: number   // 0-10
}
Response: {
  success: boolean,
  created_count: number,
  esp_ids: string[],
  message: string
}

// POST - Simulation starten (aktiviert Auto-Heartbeat)
POST /api/v1/debug/load-test/simulate
Payload: {
  esp_ids?: string[],          // Optional: spezifische ESPs (sonst alle)
  interval_ms: number,         // 100-60000 ms
  duration_seconds: number     // 10-3600 s
}
Response: {
  success: boolean,
  message: string,
  active_simulations: number
}

// POST - Simulation stoppen
POST /api/v1/debug/load-test/stop
Response: {
  success: boolean,
  message: string,
  active_simulations: number
}

// GET - Metriken
GET /api/v1/debug/load-test/metrics
Response: {
  success: boolean,
  mock_esp_count: number,
  total_sensors: number,
  total_actuators: number,
  messages_published: number,
  uptime_seconds: number
}
```

**Hinweis:** Es gibt keinen expliziten Cleanup-Endpoint. 
Zum Löschen verwende `DELETE /api/v1/debug/mock-esp/:espId` für jedes ESP einzeln 
oder lösche die ESPs direkt über den MockEspView.

**Features:**
- Bulk-ESP-Erstellung (1-1000 ESPs)
- Auto-Sensor/Actuator-Hinzufügung
- Load-Simulation (configurable Intervals)
- Realtime-Metriken
- Cleanup-Funktion

---

### 2.9 SystemConfigView.vue

**Route:** `/system-config` (Admin-only)
**Backend-Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`
**DB-Tabelle:** `system_config`

**API-Endpoints:**
```typescript
// GET - Alle Config-Einträge (optional nach Typ filtern)
GET /api/v1/debug/config?config_type=mqtt
Response: {
  success: boolean,
  configs: ConfigEntry[],
  total: number
}

interface ConfigEntry {
  id: string,
  config_key: string,
  config_value: unknown,  // JSON oder String
  config_type: string,    // mqtt, database, security, logging, etc.
  description: string | null,
  is_secret: boolean,     // true = Wert wird maskiert
  created_at: string,
  updated_at: string
}

// PATCH - Config-Wert aktualisieren
PATCH /api/v1/debug/config/:configKey
Payload: { config_value: unknown }  // JSON-Wert
Response: ConfigEntry
```

**Secret-Handling:** 
- Wenn `is_secret: true`, wird `config_value` als `"***MASKED***"` zurückgegeben
- Beim Update wird der echte Wert trotzdem gespeichert

**Config-Typen:**
- `mqtt` - MQTT-Broker-Einstellungen
- `database` - DB-Connection-Params
- `security` - Auth-Settings
- `logging` - Log-Level-Konfiguration

**Features:**
- Config-Type-Filter
- Secret-Handling (masked values)
- Inline-Editing
- JSON-Value-Support

---

### 2.10 AuditLogView.vue

**Route:** `/audit`

**API-Endpoints:**
```typescript
// GET - Audit-Logs mit Filtern
GET /v1/audit?event_type=user.login&severity=info&user_id=123&start_time=2024-01-01&end_time=2024-12-31&page=1&page_size=50
Response: {
  success: boolean,
  logs: AuditLog[],
  total: number,
  has_more: boolean
}

interface AuditLog {
  id: number,
  event_type: string,
  event_category: string,
  severity: 'info' | 'warning' | 'error' | 'critical',
  user_id?: number,
  esp_id?: string,
  description: string,
  metadata: Record<string, unknown>,
  created_at: string
}

// GET - Statistiken
GET /v1/audit/statistics
Response: {
  total_logs: number,
  by_severity: { info: number, warning: number, error: number, critical: number },
  by_category: { user: number, esp: number, system: number, ... },
  error_rate: { last_hour: number, last_day: number, last_week: number }
}

// GET - Retention-Config
GET /v1/audit/retention
Response: {
  retention_days: number,
  auto_cleanup_enabled: boolean,
  last_cleanup: string
}

// PUT - Retention-Config aktualisieren
PUT /v1/audit/retention
Payload: { retention_days: number, auto_cleanup_enabled: boolean }

// POST - Manuelles Cleanup
POST /v1/audit/cleanup
Response: { success: boolean, deleted_count: number }
```

**Event-Types:**
- `user.login`, `user.logout`, `user.created`, `user.updated`
- `esp.connected`, `esp.disconnected`, `esp.command_sent`
- `system.config_changed`, `system.error`
- `sensor.value_updated`, `actuator.state_changed`

**Features:**
- Multi-Filter (Event-Type, Severity, User, ESP, Time-Range)
- Statistics-Dashboard
- Retention-Policy-Management
- Manual-Cleanup-Trigger
- Severity-Color-Coding

---

## 3. Gemeinsame Komponenten

### 3.1 Common UI Components

**Pfad:** `El Frontend/src/components/common/`

| Komponente | Props | Verwendung |
|------------|-------|------------|
| `LoadingState.vue` | `text?: string` | Alle Views mit async-Daten |
| `EmptyState.vue` | `icon, title, description, actionText?, @action` | Listen ohne Einträge |
| `ErrorState.vue` | `message, showRetry?, showDismiss?, @retry, @dismiss` | Error-Handling |
| `Badge.vue` | `variant, size?, pulse?, dot?` | Status-Anzeige |

**Varianten:**
- `success` - Grün (Online, Good Quality)
- `warning` - Gelb (Warning, Fair Quality)
- `danger` - Rot (Error, E-Stop, Critical)
- `info` - Blau (Info)
- `gray` - Grau (Offline, Inactive)
- `mock` - Lila (Mock-Device)
- `real` - Türkis (Real-Device)

### 3.2 ESP-spezifische Komponenten

**Pfad:** `El Frontend/src/components/esp/`

| Komponente | Props | Verwendung |
|------------|-------|------------|
| `ESPCard.vue` | `esp: MockESP, @heartbeat, @toggle-safe-mode, @delete` | MockEspView Grid |
| `SensorValueCard.vue` | `sensor, @edit` | Sensor-Listen |

### 3.3 Dashboard-Komponenten

**Pfad:** `El Frontend/src/components/dashboard/`

| Komponente | Props | Verwendung |
|------------|-------|------------|
| `StatCard.vue` | `title, value, icon?, trend?, variant?` | DashboardView KPIs |

### 3.4 Database-Komponenten

**Pfad:** `El Frontend/src/components/database/`

| Komponente | Props | Verwendung |
|------------|-------|------------|
| `DataTable.vue` | `columns, data, @sort` | DatabaseExplorerView |
| `FilterPanel.vue` | `columns, @filter` | DatabaseExplorerView |
| `Pagination.vue` | `page, pageSize, total, @change` | DatabaseExplorerView |
| `RecordDetailModal.vue` | `record, @close` | DatabaseExplorerView |
| `SchemaInfoPanel.vue` | `schema` | DatabaseExplorerView |
| `TableSelector.vue` | `tables, @select` | DatabaseExplorerView |

### 3.5 Zone-Management-Komponenten

**Pfad:** `El Frontend/src/components/zones/`

| Komponente | Props | Verwendung |
|------------|-------|------------|
| `ZoneAssignmentPanel.vue` | `espId, currentZoneId?, currentZoneName?, currentMasterZoneId?, @zone-updated` | MockEspDetailView |

---

## 4. Store-Übersicht

### 4.1 authStore

**Pfad:** `El Frontend/src/stores/auth.ts`

**State:**
- `user: User | null` - Aktueller Benutzer
- `accessToken: string | null` - JWT Access-Token
- `refreshToken: string | null` - JWT Refresh-Token
- `setupRequired: boolean | null` - Initial-Setup-Status

**Getters:**
- `isAuthenticated: boolean` - Login-Status
- `isAdmin: boolean` - Admin-Rolle
- `userRole: UserRole | null` - Aktuelle Rolle

**Actions:**
- `login(username, password)` - Login
- `logout(allDevices?)` - Logout (optional alle Geräte)
- `refreshTokens()` - Token erneuern
- `checkAuthStatus()` - Setup-Status prüfen

### 4.2 mockEspStore

**Pfad:** `El Frontend/src/stores/mockEsp.ts`

**State:**
- `mockEsps: MockESP[]` - Alle Mock-ESPs
- `selectedEspId: string | null` - Aktuell ausgewähltes ESP
- `isLoading: boolean` - Loading-State
- `error: string | null` - Error-Message

**Getters:**
- `selectedEsp: MockESP | null` - Aktuelles ESP-Objekt
- `espCount: number` - Anzahl ESPs
- `onlineEsps: MockESP[]` - Online-ESPs

**Actions:**
- `fetchAll()` - Alle ESPs laden
- `create(config)` - ESP erstellen
- `remove(espId)` - ESP löschen
- `triggerHeartbeat(espId)` - Heartbeat
- `setState(espId, state, reason)` - State setzen
- `addSensor(espId, config)` - Sensor hinzufügen
- `setSensorValue(espId, gpio, value, quality, publish)` - Sensor-Wert
- `setBatchSensorValues(espId, values, publish)` - Batch-Update
- `removeSensor(espId, gpio)` - Sensor entfernen
- `addActuator(espId, config)` - Aktor hinzufügen
- `setActuatorState(espId, gpio, state, pwmValue)` - Aktor-State
- `emergencyStop(espId, reason)` - E-Stop
- `clearEmergency(espId)` - E-Stop aufheben

### 4.3 databaseStore

**Pfad:** `El Frontend/src/stores/database.ts`

**State:**
- `tables: string[]` - Verfügbare Tabellen
- `selectedTable: string | null` - Aktuelle Tabelle
- `schema: TableSchema | null` - Tabellen-Schema
- `data: Record<string, unknown>[]` - Tabellen-Daten
- `totalCount: number` - Gesamt-Anzahl Rows
- `currentPage: number` - Aktuelle Seite
- `pageSize: number` - Einträge pro Seite

**Actions:**
- `loadTables()` - Tabellen laden
- `selectTable(tableName)` - Tabelle auswählen
- `loadSchema()` - Schema laden
- `loadData(params)` - Daten mit Filtern laden
- `loadRecord(id)` - Einzelnen Record laden

---

## 5. Utils & Helpers

### 5.1 sensorDefaults.ts

**Exports:**
```typescript
interface SensorTypeConfigEntry {
  unit: string
  defaultValue: number
  decimals: number
  label: string
}

const SENSOR_TYPE_CONFIG: Record<SensorType, SensorTypeConfigEntry>

function getSensorUnit(sensorType: string): string
function getSensorDefault(sensorType: string): number
function getSensorLabel(sensorType: string): string
function getSensorTypeOptions(): { value: string; label: string }[]
```

**Unterstützte Sensor-Typen:**
- `DS18B20` - Temperatur (°C)
- `SHT31` - Temperatur/Humidity (°C / %)
- `PH` - pH-Wert
- `EC` - Leitfähigkeit (µS/cm)
- `TDS` - Total Dissolved Solids (ppm)
- `TURBIDITY` - Trübung (NTU)
- `LDR` - Lichtsensor (Lux)
- `PIR` - Bewegungsmelder (0/1)
- `ULTRASONIC` - Ultraschall (cm)
- `FLOW` - Durchflusssensor (L/min)

### 5.2 labels.ts

**Exports:**
```typescript
function getStateInfo(state: MockSystemState): { label: string; variant: string }
function getQualityLabel(quality: QualityLevel): string
function getActuatorTypeLabel(type: string): string

const QUALITY_LABELS: Record<QualityLevel, string> = {
  excellent: 'Exzellent',
  good: 'Gut',
  fair: 'Ausreichend',
  poor: 'Schlecht',
  bad: 'Sehr schlecht',
  stale: 'Veraltet'
}
```

**State-Mappings:**
- `OPERATIONAL` → Success (Grün)
- `SAFE_MODE` → Warning (Gelb)
- `ERROR` → Danger (Rot)
- `INITIALIZING` → Info (Blau)

### 5.3 formatters.ts

**Exports:**
```typescript
function formatUptime(seconds: number): string
  // z.B. "2h 34m" oder "45s"

function formatHeapSize(bytes: number): string
  // z.B. "32.5 KB" oder "1.2 MB"

function formatRssi(rssi: number): string
  // z.B. "-45 dBm (Exzellent)"

function formatNumber(value: number, decimals: number): string
  // z.B. "23.45" (mit konfigurierbaren Nachkommastellen)
```

---

## 6. WebSocket-Integration

### 6.1 Connection-Management

**URL-Pattern:**
```
ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${accessToken}
```

**Client-ID-Format:**
```typescript
const clientId = `frontend_${Date.now()}`
```

**Auth-Flow:**
1. Token aus `authStore.accessToken` holen
2. Wenn abgelaufen → `authStore.refreshTokens()` aufrufen
3. Bei Fehler → Logout & Redirect zu `/login`

### 6.2 Message-Format

**Subscribe-Request:**
```json
{
  "action": "subscribe",
  "filters": {
    "types": ["sensor_data", "actuator_status", "logic_execution", "esp_health", "system_event"],
    "esp_ids": ["ESP_MOCK_123ABC"],  // optional
    "topics": ["kaiser/god/esp/+/sensor/+/data"]  // optional
  }
}
```

**Unsubscribe-Request:**
```json
{
  "action": "unsubscribe",
  "filters": { ... }
}
```

**Server-Message:**
```json
{
  "type": "sensor_data",
  "topic": "kaiser/god/esp/ESP_MOCK_123ABC/sensor/4/data",
  "payload": {
    "raw_value": 23.5,
    "quality": "good",
    "raw_mode": true
  },
  "esp_id": "ESP_MOCK_123ABC",
  "timestamp": "2024-12-19T12:34:56Z"
}
```

### 6.3 Reconnect-Logic

**Auto-Reconnect:**
- Delay: 3000ms (3 Sekunden)
- Bei `onclose` → setTimeout → `connect()`
- Token-Refresh vor Reconnect

**Error-Handling:**
- `onerror` → Console-Logging
- `onclose` → Reconnect-Timer starten
- Token-Refresh-Fehler → Logout

---

## 7. Router-Guards

### 7.1 Auth-Check

**Route-Meta:**
```typescript
{
  requiresAuth: boolean,      // Login erforderlich
  requiresAdmin: boolean       // Admin-Rolle erforderlich
}
```

**Guard-Logic:**
```typescript
router.beforeEach(async (to, from, next) => {
  // 1. Setup-Check
  if (authStore.setupRequired && to.name !== 'setup') {
    return next({ name: 'setup' })
  }

  // 2. Auth-Check
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next({ name: 'login', query: { redirect: to.fullPath } })
  }

  // 3. Admin-Check
  if (to.meta.requiresAdmin && !authStore.isAdmin) {
    return next({ name: 'dashboard' })
  }

  // 4. Redirect authenticated users
  if (authStore.isAuthenticated && (to.name === 'login' || to.name === 'setup')) {
    return next({ name: 'dashboard' })
  }

  next()
})
```

### 7.2 Admin-Only Views

**Liste:**
- `/mock-esp` - MockEspView
- `/mock-esp/:espId` - MockEspDetailView
- `/database` - DatabaseExplorerView
- `/logs` - LogViewerView
- `/users` - UserManagementView
- `/load-test` - LoadTestView
- `/system-config` - SystemConfigView

**Public Views (Auth-required):**
- `/` - DashboardView
- `/sensors` - SensorsView
- `/actuators` - ActuatorsView
- `/logic` - LogicView
- `/mqtt-log` - MqttLogView
- `/audit` - AuditLogView
- `/settings` - SettingsView

---

## 8. API-Base-Configuration

### 8.1 Axios-Instance

**Pfad:** `El Frontend/src/api/index.ts`

**Base-URL:**
```typescript
const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1'
```

**Default-Headers:**
```typescript
{
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`  // via Interceptor
}
```

**Interceptors:**
```typescript
// Request-Interceptor (Token hinzufügen)
api.interceptors.request.use(config => {
  const authStore = useAuthStore()
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`
  }
  return config
})

// Response-Interceptor (401 → Token-Refresh)
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const authStore = useAuthStore()
      if (authStore.refreshToken) {
        await authStore.refreshTokens()
        // Retry original request
        return api.request(error.config)
      } else {
        await authStore.logout()
        router.push('/login')
      }
    }
    return Promise.reject(error)
  }
)
```

### 8.2 Environment-Variables

**.env.development:**
```bash
VITE_API_BASE=/api/v1
VITE_API_HOST=localhost:8000
```

**.env.production:**
```bash
VITE_API_BASE=/api/v1
VITE_API_HOST=auto-one.local:8000
```

---

## 9. Type-Definitionen

### 9.1 Mock-ESP-Types

**Pfad:** `El Frontend/src/types/index.ts`

```typescript
export type MockSystemState =
  | 'INITIALIZING'
  | 'OPERATIONAL'
  | 'SAFE_MODE'
  | 'ERROR'
  | 'EMERGENCY_STOP'
  | 'OFFLINE'

export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'bad' | 'stale'

export interface MockSensor {
  gpio: number
  sensor_type: string
  name: string
  subzone_id?: string
  raw_value: number
  unit: string
  quality: QualityLevel
  raw_mode: boolean
}

export interface MockActuator {
  gpio: number
  actuator_type: string
  name: string
  state: boolean
  pwm_value: number
  emergency_stopped: boolean
}

export interface MockESP {
  id: number
  esp_id: string
  zone_id?: string
  zone_name?: string
  master_zone_id?: string
  hardware_type: string
  system_state: MockSystemState
  connected: boolean
  uptime: number
  heap_free: number
  wifi_rssi: number
  sensors: MockSensor[]
  actuators: MockActuator[]
  auto_heartbeat: boolean
  heartbeat_interval_seconds: number
  created_at: string
  updated_at: string
}

export interface MockESPCreate {
  esp_id: string
  zone_id?: string
  auto_heartbeat: boolean
  heartbeat_interval_seconds: number
  sensors: MockSensorConfig[]
  actuators: MockActuatorConfig[]
}

export interface MockSensorConfig {
  gpio: number
  sensor_type: string
  name?: string
  subzone_id?: string
  raw_value: number
  unit: string
  quality: QualityLevel
  raw_mode: boolean
}

export interface MockActuatorConfig {
  gpio: number
  actuator_type: string
  name?: string
  state: boolean
  pwm_value: number
}
```

### 9.2 WebSocket-Types

```typescript
export type MessageType =
  | 'sensor_data'
  | 'actuator_status'
  | 'logic_execution'
  | 'esp_health'
  | 'system_event'

export interface MqttMessage {
  id: string
  timestamp: string
  type: MessageType
  topic: string
  payload: Record<string, unknown>
  esp_id?: string
}

export interface WebSocketFilters {
  types?: MessageType[]
  esp_ids?: string[]
  topics?: string[]
}
```

### 9.3 API-Response-Types

```typescript
export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  page_size: number
}

export interface CommandResponse {
  success: boolean
  message: string
  esp_id?: string
  timestamp?: string
}
```

---

## 10. Testing-Empfehlungen

### 10.1 Kritische User-Flows

**Flow 1: Mock-ESP erstellen & Sensor hinzufügen**
1. Login als Admin
2. Navigate zu `/mock-esp`
3. Click "Mock ESP erstellen"
4. Fill Form (ESP-ID, Zone, Auto-Heartbeat)
5. Submit → ESP erscheint in Liste
6. Click auf ESP-Card → Navigate zu `/mock-esp/:espId`
7. Click "Sensor hinzufügen"
8. Select Sensor-Type (z.B. DS18B20)
9. Submit → Sensor erscheint in Liste
10. Click "Bearbeiten" → Set Value → Publish
11. Verify WebSocket-Message in `/mqtt-log`

**Flow 2: Database-Explorer**
1. Login als Admin
2. Navigate zu `/database`
3. Select Table (z.B. `esps`)
4. Verify Schema-Anzeige
5. Set Filter (Column + Value)
6. Apply → Verify gefilterte Daten
7. Click auf Record → Detail-Modal öffnet
8. Change Page → Verify Pagination

**Flow 3: Log-Viewer Real-time**
1. Login als Admin
2. Navigate zu `/logs`
3. Click "Live" → Polling startet
4. Set Level-Filter (z.B. ERROR)
5. Trigger Error (z.B. falsche API-Request)
6. Verify Error erscheint in Log
7. Click auf Log-Row → Expand Details
8. Verify Exception-Stack-Trace

### 10.2 Edge-Cases

**Mock-ESP:**
- ESP mit 0 Sensoren/Aktoren erstellen
- Sensor-Wert außerhalb Range setzen
- Emergency-Stop während Aktor aktiv
- ESP löschen während Heartbeat läuft

**WebSocket:**
- Connection-Loss → Auto-Reconnect
- Token-Expiry während aktiver Connection
- Message-Overflow (> 500 Messages)

**Database:**
- Tabelle ohne Records
- NULL-Werte in Columns
- JSON-Fields (verschachteltes Objekt)
- Pagination Edge (letzte Seite)

---

## 11. Performance-Optimierung

### 11.1 Lazy-Loading

**Alle Views werden lazy-loaded:**
```typescript
{
  path: '/mock-esp',
  component: () => import('@/views/MockEspView.vue')
}
```

**Vorteile:**
- Initial-Bundle kleiner
- Code-Splitting automatisch
- Faster First Contentful Paint (FCP)

### 11.2 WebSocket-Message-Limit

**MqttLogView:**
```typescript
const maxMessages = 500

if (messages.value.length > maxMessages) {
  messages.value = messages.value.slice(0, maxMessages)
}
```

**Grund:**
- Verhindert Memory-Leaks
- DOM bleibt performant

### 11.3 Pagination

**DatabaseExplorerView:**
- Page-Size-Options: 50, 100, 200
- Server-seitige Pagination
- Lazy-Loading bei Scroll (optional)

---

## 12. Security-Considerations

### 12.1 Token-Storage

**Aktuell:** LocalStorage
```typescript
localStorage.setItem('access_token', token)
localStorage.setItem('refresh_token', token)
```

**Risiko:** XSS-Attacken können Tokens stehlen

**Alternative:** httpOnly Cookies (Server-seitig)

### 12.2 Admin-Routes

**Schutz:** Router-Guard + Server-seitige Validierung

**Client-seitig:**
```typescript
if (to.meta.requiresAdmin && !authStore.isAdmin) {
  return next({ name: 'dashboard' })
}
```

**Server-seitig:**
```python
@router.get("/debug/mock-esp")
async def list_mock_esps(current_user: User = Depends(require_admin)):
    ...
```

### 12.3 Secret-Handling

**SystemConfigView:**
- `is_secret: true` → Value wird maskiert (******)
- Keine Secrets im Frontend-Log
- Keine Secrets in WebSocket-Messages

---

## 13. Deployment-Checkliste

### 13.1 Environment-Variablen

**Production `.env`:**
```bash
VITE_API_BASE=/api/v1
VITE_API_HOST=auto-one.prod.local:8000
NODE_ENV=production
```

### 13.2 Build-Command

```bash
npm run build
```

**Output:** `El Frontend/dist/`

### 13.3 Nginx-Config

```nginx
server {
  listen 80;
  server_name auto-one.local;

  root /var/www/auto-one/dist;
  index index.html;

  # Frontend (SPA)
  location / {
    try_files $uri $uri/ /index.html;
  }

  # API-Proxy
  location /api/ {
    proxy_pass http://localhost:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
  }

  # WebSocket-Proxy
  location /ws/ {
    proxy_pass http://localhost:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

---

## 14. Änderungshistorie

| Datum | Version | Änderungen |
|-------|---------|------------|
| 2025-12-19 | 1.0 | Initial-Analyse aller 16 Views |

---

**Ende der Dokumentation**

