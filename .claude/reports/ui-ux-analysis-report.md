# UI/UX Vollständige Analyse & Verbesserungsplan

**Projekt:** AutomationOne Framework
**Erstellt:** 2026-01-27
**Analyst:** Claude (UI/UX Engineer)

---

## Inhaltsverzeichnis

1. [Phase 1: Backend-Analyse](#phase-1-backend-analyse)
   - [1.1 API-Endpoint Katalog](#11-api-endpoint-katalog)
   - [1.2 WebSocket-Event Katalog](#12-websocket-event-katalog)
   - [1.3 Datenmodelle](#13-datenmodelle)
   - [1.4 Error-Code System](#14-error-code-system)
2. [Phase 2: Frontend-Analyse](#phase-2-frontend-analyse)
   - [2.1 Komponenten-Inventar](#21-komponenten-inventar)
   - [2.2 Feature-Matrix Backend → Frontend](#22-feature-matrix-backend--frontend)
   - [2.3 UX-Flows](#23-ux-flows)
   - [2.4 Design-System Konsistenz](#24-design-system-konsistenz)
3. [Phase 3: Lücken & Verbesserungen](#phase-3-lücken--verbesserungen)
   - [3.1 Fehlende Features](#31-fehlende-features)
   - [3.2 UX-Probleme](#32-ux-probleme)
   - [3.3 Konsistenz-Probleme](#33-konsistenz-probleme)
   - [3.4 Menschenverständlichkeit vs. Technik](#34-menschenverständlichkeit-vs-technik)
4. [Phase 4: Verbesserungsplan](#phase-4-verbesserungsplan)

---

## Phase 1: Backend-Analyse

### 1.1 API-Endpoint Katalog

**Gesamt: 153 Endpoints** über 13 Router-Dateien.

#### /v1/audit (21 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/` | Audit-Logs mit Filtern | ✅ (EventsTab) |
| GET | `/events/aggregated` | Multi-Source Events | ✅ (EventsTab) |
| GET | `/events/correlated/{correlation_id}` | Korrelierte Events | ✅ (EventTimeline) |
| GET | `/errors` | Letzte Fehler | ❌ |
| GET | `/esp/{esp_id}/config-history` | ESP Config-History | ❌ |
| GET | `/statistics` | Event-Statistiken | ❌ |
| GET | `/error-rate` | Fehlerrate | ❌ |
| GET | `/retention/status` | Auto-Cleanup Status | ✅ (CleanupPanel) |
| GET | `/retention/config` | Retention-Config | ✅ (CleanupPanel) |
| PUT | `/retention/config` | Retention-Config updaten | ✅ (CleanupPanel) |
| POST | `/retention/cleanup` | Manueller Cleanup | ✅ (CleanupPanel) |
| GET | `/event-types` | Event-Typen Liste | ✅ (Filter) |
| GET | `/severities` | Severity-Liste | ✅ (Filter) |
| GET | `/source-types` | Source-Types Liste | ✅ (Filter) |
| GET | `/backups` | Backup-Liste | ❌ |
| GET | `/backups/{id}` | Backup-Details | ❌ |
| POST | `/backups/{id}/restore` | Backup restaurieren | ❌ |
| DELETE | `/backups/{id}` | Backup löschen | ❌ |
| POST | `/backups/cleanup` | Abgelaufene Backups löschen | ✅ |
| GET | `/backups/retention/config` | Backup-Retention Config | ✅ |
| PUT | `/backups/retention/config` | Backup-Retention updaten | ✅ |

#### /v1/esp (15 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/devices` | Alle ESPs auflisten | ✅ (Dashboard, ESP Store) |
| GET | `/devices/pending` | Ausstehende ESPs | ✅ (Dashboard) |
| GET | `/devices/{esp_id}` | ESP-Details | ✅ (Dashboard) |
| POST | `/devices` | ESP registrieren | ✅ (Dashboard) |
| PATCH | `/devices/{esp_id}` | ESP updaten | ✅ (Dashboard) |
| DELETE | `/devices/{esp_id}` | ESP löschen | ✅ (Dashboard) |
| POST | `/devices/{esp_id}/config` | Config senden | ✅ (Dashboard) |
| POST | `/devices/{esp_id}/restart` | Neustart | ❌ |
| POST | `/devices/{esp_id}/reset` | Factory Reset | ❌ |
| GET | `/devices/{esp_id}/health` | Health-Details | ❌ |
| GET | `/devices/{esp_id}/gpio-status` | GPIO-Status | ❌ |
| POST | `/devices/{esp_id}/assign_kaiser` | Kaiser zuweisen | ❌ |
| GET | `/discovery` | Entdeckte Geräte | ❌ |
| POST | `/devices/{esp_id}/approve` | Gerät genehmigen | ✅ (Dashboard) |
| POST | `/devices/{esp_id}/reject` | Gerät ablehnen | ✅ (Dashboard) |

#### /v1/sensors (11 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/` | Sensoren auflisten | ✅ (SensorsView) |
| GET | `/{esp_id}/{gpio}` | Sensor-Config | ✅ |
| POST | `/{esp_id}/{gpio}` | Sensor erstellen/updaten | ✅ |
| DELETE | `/{esp_id}/{gpio}` | Sensor löschen | ✅ |
| GET | `/data` | Historische Daten | ✅ (Charts) |
| GET | `/data/by-source/{source}` | Daten nach Source | ❌ |
| GET | `/data/stats/by-source` | Stats nach Source | ✅ |
| GET | `/{esp_id}/{gpio}/stats` | Sensor-Statistiken | ❌ |
| POST | `/{esp_id}/{gpio}/measure` | Manuelle Messung | ❌ |
| POST | `/esp/{esp_id}/onewire/scan` | OneWire-Scan | ❌ |
| GET | `/esp/{esp_id}/onewire` | OneWire-Sensoren | ❌ |

#### /v1/actuators (8 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/` | Aktoren auflisten | ✅ (SensorsView) |
| GET | `/{esp_id}/{gpio}` | Aktor-Config | ✅ |
| POST | `/{esp_id}/{gpio}` | Aktor erstellen/updaten | ✅ |
| POST | `/{esp_id}/{gpio}/command` | Aktor-Befehl senden | ✅ (Dashboard) |
| GET | `/{esp_id}/{gpio}/status` | Aktor-Status | ❌ |
| POST | `/emergency_stop` | Emergency Stop | ❌ |
| DELETE | `/{esp_id}/{gpio}` | Aktor löschen | ✅ |
| GET | `/{esp_id}/{gpio}/history` | Command-History | ❌ |

#### /v1/debug (55 Endpoints)

| Kategorie | Endpoints | Frontend nutzt? |
|-----------|-----------|-----------------|
| Mock ESP CRUD | 5 | ✅ (Debug Store) |
| Mock Simulation | 5 | ✅ (teilweise) |
| Mock Sensors | 6 | ✅ (teilweise) |
| Mock Actuators | 8 | ✅ (teilweise) |
| Mock Messages | 2 | ❌ |
| Database Explorer | 4 | ✅ (DatabaseTab) |
| Log Management | 6 | ✅ (ServerLogsTab) |
| Configuration | 2 | ❌ |
| Load Testing | 4 | ✅ (LoadTestView) |
| Cleanup | 2 | ✅ (CleanupPanel) |
| Libraries | 2 | ❌ |
| Data Source | 1 | ❌ |
| Maintenance | 3 | ✅ (MaintenanceView) |
| Resilience | 9 | ❌ |

#### /v1/health (6 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/` | Health Check | ❌ |
| GET | `/detailed` | Detaillierter Health | ❌ |
| GET | `/esp` | ESP Health Summary | ❌ |
| GET | `/metrics` | Prometheus Metrics | ❌ |
| GET | `/live` | Liveness Probe | ❌ |
| GET | `/ready` | Readiness Probe | ❌ |

#### /v1/logic (8 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| GET | `/rules` | Regeln auflisten | ✅ (LogicView) |
| GET | `/rules/{id}` | Regel-Details | ✅ |
| POST | `/rules` | Regel erstellen | ✅ |
| PUT | `/rules/{id}` | Regel updaten | ✅ |
| DELETE | `/rules/{id}` | Regel löschen | ✅ |
| POST | `/rules/{id}/toggle` | Regel ein/ausschalten | ✅ |
| POST | `/rules/{id}/test` | Regel testen | ❌ |
| GET | `/execution_history` | Execution-History | ✅ |

#### /v1/zone (5 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| POST | `/devices/{esp_id}/assign` | Zone zuweisen | ✅ (ZoneAssignmentPanel) |
| DELETE | `/devices/{esp_id}/zone` | Zone entfernen | ✅ |
| GET | `/devices/{esp_id}` | Zone-Info | ✅ |
| GET | `/{zone_id}/devices` | Zone-Geräte | ✅ |
| GET | `/unassigned` | Unzugewiesene ESPs | ✅ |

#### /v1/subzone (6 Endpoints)

| Method | Path | Beschreibung | Frontend nutzt? |
|--------|------|--------------|-----------------|
| POST | `/devices/{esp_id}/subzones/assign` | Subzone zuweisen | ✅ |
| DELETE | `/devices/{esp_id}/subzones/{id}` | Subzone entfernen | ✅ |
| GET | `/devices/{esp_id}/subzones` | Subzonen auflisten | ✅ |
| GET | `/devices/{esp_id}/subzones/{id}` | Subzone-Details | ✅ |
| POST | `.../safe-mode` | Safe-Mode aktivieren | ✅ |
| DELETE | `.../safe-mode` | Safe-Mode deaktivieren | ✅ |

#### /v1/auth (10 Endpoints) - ✅ Alle im Frontend genutzt

#### /v1/users (7 Endpoints) - ✅ Alle im Frontend genutzt

#### /ws/realtime/{client_id} (1 WebSocket) - ✅ Im Frontend genutzt

---

### 1.2 WebSocket-Event Katalog

**Gesamt: 27 Event-Typen** (25 aktiv broadcast, 2 nur Frontend-definiert)

#### Frontend-Handling Status

| Status | Anzahl | Event-Typen |
|--------|--------|-------------|
| **Backend sendet + Frontend handled** | 12 | `sensor_data`, `actuator_status`, `actuator_alert`, `esp_health`, `config_response`, `zone_assignment`, `sensor_health`, `device_discovered`, `device_approved`, `device_rejected`, `logic_execution`, `sensor_data` (Chart) |
| **Backend sendet + Frontend IGNORIERT** | 13 | `actuator_response`, `actuator_command`, `actuator_command_failed`, `config_published`, `config_failed`, `device_rediscovered`, `error_event`, `notification`, `system_event`, `sequence_started/step/error/cancelled/completed` |
| **Frontend definiert + Backend NICHT implementiert** | 2 | `server_log`, `db_record_changed` |

#### Kritische Lücken (Backend sendet, Frontend ignoriert)

| Event | Payload | Wichtigkeit | Empfehlung |
|-------|---------|-------------|------------|
| **`error_event`** | esp_id, error_code, severity, message, troubleshooting, user_action_required | 🔴 HOCH | Sofort im EventsTab anzeigen mit Troubleshooting-Hilfe |
| **`actuator_command`** | esp_id, gpio, command, value, source | 🔴 HOCH | Im EventsTab als "Befehl gesendet" anzeigen |
| **`actuator_response`** | esp_id, gpio, success, error_code | 🔴 HOCH | Erfolg/Fehler-Feedback im Dashboard |
| **`actuator_command_failed`** | esp_id, gpio, error, reason | 🔴 HOCH | Fehlermeldung im Dashboard + Toast |
| **`config_published`** | esp_id, config_type | 🟡 MITTEL | Config-Flow Tracking |
| **`config_failed`** | esp_id, error | 🟡 MITTEL | Fehlermeldung bei Config-Problemen |
| **`notification`** | title, message, priority | 🔴 HOCH | Toast/Notification-System |
| **`system_event`** | event, timestamp | 🟡 MITTEL | System-Status-Anzeige |
| **`sequence_*`** (5 Events) | sequence_id, step, progress | 🟡 MITTEL | Sequenz-Progress-Anzeige |
| **`device_rediscovered`** | esp_id, previous_status | 🟢 NIEDRIG | Info-Event |

---

### 1.3 Datenmodelle

#### AuditLog

| Feld | Typ | Im Frontend sichtbar? |
|------|-----|----------------------|
| id | UUID | Intern |
| event_type | String(50) | ✅ (Kategorie-Badge) |
| severity | String(20) | ✅ (Level-Badge: info/warning/error/critical) |
| source_type | String(30) | ✅ (Quellen-Filter: esp32/user/system/api/mqtt) |
| source_id | String(100) | ✅ (ESP-ID Badge) |
| status | String(20) | ❌ (nicht angezeigt) |
| message | Text | ✅ (Event-Beschreibung) |
| details | JSON | ✅ (Detail-Panel JSON) |
| error_code | String(50) | ✅ (Error-Badge) |
| error_description | Text | ❌ (nicht angezeigt) |
| correlation_id | String(100) | ✅ (Timeline-Verknüpfung) |
| request_id | String(36) | ✅ (Server-Log-Verknüpfung) |
| created_at | DateTime | ✅ (Zeitstempel) |

#### ESPDevice

| Feld | Typ | Im Frontend sichtbar? |
|------|-----|----------------------|
| device_id | String(50) | ✅ (ESP-Name/ID) |
| name | String(100) | ✅ (Anzeigename) |
| zone_id / zone_name | String | ✅ (Zone-Badge) |
| status | String(20) | ✅ (Online/Offline) |
| last_seen | DateTime | ✅ (Heartbeat-Anzeige) |
| health_status | String(20) | ❌ (nicht dediziert angezeigt) |
| ip_address | String(45) | ❌ |
| mac_address | String(17) | ❌ |
| firmware_version | String(20) | ❌ |
| capabilities | JSON | ❌ |
| hardware_type | String(50) | ❌ |
| discovered_at | DateTime | ❌ |
| approved_at / approved_by | DateTime/String | ❌ |

#### SensorConfig / SensorData

| Feld | Im Frontend? | Anmerkung |
|------|-------------|-----------|
| sensor_type | ✅ | Als Badge |
| gpio | ✅ | Als Badge |
| raw_value / processed_value | ✅ | Als Messwert |
| unit | ✅ | Neben Wert |
| quality | ❌ | Nicht angezeigt |
| operating_mode | ❌ | Nicht angezeigt |
| calibration_data | ❌ | Nicht angezeigt |
| thresholds | ❌ | Nicht angezeigt |
| config_status | ❌ | Nicht angezeigt |

#### ActuatorConfig / ActuatorState

| Feld | Im Frontend? | Anmerkung |
|------|-------------|-----------|
| actuator_type | ✅ | Als Badge |
| gpio | ✅ | Als Badge |
| current_value / state | ✅ | Im Dashboard |
| emergency_stopped | ✅ | Via WS Event |
| timeout_seconds | ❌ | Nicht angezeigt |
| safety_constraints | ❌ | Nicht angezeigt |
| min_value / max_value | ❌ | Nicht angezeigt |
| runtime_seconds | ❌ | Nicht angezeigt |
| command history | ❌ | Keine dedizierte UI |

---

### 1.4 Error-Code System

#### Bereiche

| Range | Kategorie | Beschreibung | Im Frontend erklärt? |
|-------|-----------|--------------|---------------------|
| 1001-1053 | ESP32 Hardware | GPIO, I2C, OneWire, PWM, Sensor, Actuator | ❌ Nur Nummer |
| 2001-2506 | ESP32 Service | NVS, Config, Logger, Storage, Subzone | ❌ Nur Nummer |
| 3001-3032 | ESP32 Communication | WiFi, MQTT, HTTP, Network | ❌ Nur Nummer |
| 4001-4202 | ESP32 Application | State, Ops, Commands, Payload, Memory, Watchdog | ❌ Nur Nummer |
| 5001-5642 | Server | Config, MQTT, Validation, DB, Service, Audit, Sequence | ❌ Nur Nummer |

**Problem:** Error-Codes werden als nackte Nummern angezeigt. `error_codes.py` enthält `get_description()` und `get_user_friendly_message()` Methoden, aber das Frontend nutzt diese nicht.

---

## Phase 2: Frontend-Analyse

### 2.1 Komponenten-Inventar

#### Views (12)

| View | Route | Zweck | API-Endpoints |
|------|-------|-------|---------------|
| LoginView | `/login` | Authentifizierung | auth/* |
| SetupView | `/setup` | Ersteinrichtung | auth/setup |
| DashboardView | `/` | Haupt-Dashboard | esp/*, sensors/*, actuators/*, zone/* |
| SensorsView | `/sensors` | Sensor/Aktor-Verwaltung | sensors/*, actuators/* |
| LogicView | `/logic` | Automationsregeln | logic/* |
| SystemMonitorView | `/system-monitor` | Events, Logs, MQTT, DB | audit/*, debug/logs/*, debug/db/* |
| MaintenanceView | `/maintenance` | Maintenance Jobs (Admin) | debug/maintenance/* |
| LoadTestView | `/load-test` | Lasttests (Admin) | debug/load-test/* |
| UserManagementView | `/users` | Benutzerverwaltung (Admin) | users/* |
| SystemConfigView | `/system-config` | Systemeinstellungen (Admin) | debug/config/* |
| SettingsView | `/settings` | Benutzereinstellungen | auth/me |

#### System Monitor Komponenten (15)

| Komponente | Zweck | Datenquelle |
|------------|-------|-------------|
| MonitorTabs | Tab-Navigation + Live-Toggle | Intern |
| MonitorFilterPanel | Filter (ESP, Level, Zeit, Events) | audit/event-types, severities |
| UnifiedEventList | Event-Liste mit Virtual Scrolling | audit/events/aggregated |
| EventDetailsPanel | Detail-Panel mit JSON | Ausgewähltes Event |
| EventTimeline | Korrelations-Timeline | audit/events/correlated/{id} |
| ServerLogsTab | Server-Log-Viewer | debug/logs |
| DatabaseTab | DB-Explorer | debug/db/* |
| MqttTrafficTab | MQTT-Traffic-Viewer | WebSocket |
| DataSourceSelector | Quellen-Filter (System, Sensoren, ESP, Aktoren) | Intern |
| CleanupPanel | Cleanup-Management | audit/retention/* |
| CleanupPreview | Cleanup-Vorschau | audit/retention/cleanup |
| LogManagementPanel | Log-Verwaltung | debug/logs/* |
| AutoCleanupStatusBanner | Cleanup-Status-Banner | audit/retention/status |
| RssiIndicator | WiFi-Signal-Anzeige | Event-Payload |
| PreviewEventCard | Event-Vorschau | Event-Daten |

---

### 2.2 Feature-Matrix: Backend → Frontend

#### ✅ Gut abgedeckt

| Backend-Feature | Frontend-Element | Qualität |
|-----------------|------------------|----------|
| ESP-Geräteliste | DashboardView ZoneGroups | ⭐⭐⭐⭐ |
| Sensor-Config CRUD | SensorsView + ESPCard Satellites | ⭐⭐⭐⭐ |
| Aktor-Config CRUD | SensorsView + ESPCard Satellites | ⭐⭐⭐⭐ |
| Aktor-Befehle senden | Dashboard ActuatorSidebar | ⭐⭐⭐ |
| Zone-Zuweisungen | ZoneAssignmentPanel | ⭐⭐⭐⭐ |
| Subzone-Management | Dashboard SubzonePanel | ⭐⭐⭐ |
| Automationsregeln CRUD | LogicView | ⭐⭐⭐⭐ |
| Audit-Events (aggregiert) | UnifiedEventList | ⭐⭐⭐⭐ |
| Event-Korrelation | EventTimeline | ⭐⭐⭐⭐ |
| Server-Logs | ServerLogsTab | ⭐⭐⭐⭐ |
| Auth/Login | LoginView + AuthGuard | ⭐⭐⭐⭐⭐ |
| Real-time WS Updates | esp.ts Store + Charts | ⭐⭐⭐⭐ |
| Mock ESP Management | Debug via Dashboard | ⭐⭐⭐ |
| Maintenance Jobs | MaintenanceView | ⭐⭐⭐ |
| Data Cleanup | CleanupPanel | ⭐⭐⭐⭐ |

#### ❌ Nicht im Frontend vorhanden

| Backend-Feature | API-Endpoint | Priorität | Beschreibung |
|-----------------|-------------|-----------|--------------|
| **ESP Health Dashboard** | `/v1/health/esp`, `/v1/esp/{id}/health` | 🔴 HOCH | Kein dediziertes Health-Dashboard für ESP-Flotte |
| **Error Rate Monitoring** | `/v1/audit/error-rate` | 🔴 HOCH | Fehlerrate-Trends nicht visualisiert |
| **Audit Statistics** | `/v1/audit/statistics` | 🟡 MITTEL | Event-Statistiken nicht visualisiert |
| **ESP Config History** | `/v1/audit/esp/{id}/config-history` | 🟡 MITTEL | Config-Änderungsverlauf nicht sichtbar |
| **Actuator Command History** | `/v1/actuators/{id}/history` | 🟡 MITTEL | Befehls-History nicht einsehbar |
| **Actuator Status Polling** | `/v1/actuators/{id}/status` | 🟡 MITTEL | Kein dedizierter Status-View |
| **Sensor Statistics** | `/v1/sensors/{id}/stats` | 🟡 MITTEL | Min/Max/Avg nicht angezeigt |
| **Manual Measurement** | `/v1/sensors/{id}/measure` | 🟡 MITTEL | Kein Trigger-Button |
| **OneWire Scan** | `/v1/sensors/esp/{id}/onewire/scan` | 🟢 NIEDRIG | Kein Scan-UI |
| **ESP Restart/Reset** | `/v1/esp/{id}/restart`, `/reset` | 🟢 NIEDRIG | Keine UI-Buttons |
| **GPIO Status** | `/v1/esp/{id}/gpio-status` | 🟢 NIEDRIG | Kein GPIO-Viewer |
| **Rule Testing** | `/v1/logic/rules/{id}/test` | 🟡 MITTEL | Kein Test-Button |
| **Resilience Dashboard** | `/v1/debug/resilience/*` (9 Endpoints) | 🟡 MITTEL | Circuit-Breaker Status unsichtbar |
| **Backup Management** | `/v1/audit/backups/*` (5 Endpoints) | 🟢 NIEDRIG | Backup UI fehlt |
| **System Health** | `/v1/health/detailed` | 🟡 MITTEL | Kein System-Health-View |
| **Notification Display** | WS `notification` Event | 🔴 HOCH | Kein Toast/Notification-System |
| **Error Event Display** | WS `error_event` | 🔴 HOCH | Strukturierte Fehlermeldungen mit Troubleshooting ignoriert |
| **Sequence Progress** | WS `sequence_*` (5 Events) | 🟡 MITTEL | Kein Progress-Tracker |

---

### 2.3 UX-Flows

#### Flow 1: Event untersuchen (AKTUELL)

```
1. User sieht Event in UnifiedEventList
2. Klick → EventDetailsPanel öffnet rechts
3. Detail-Panel zeigt: Zusammenfassung, Details, Messwert-Details
4. Aktionen: "Alle Events von ESP", "Server-Logs um Zeit"
5. Bei correlation_id → EventTimeline mit verwandten Events
```

**Bewertung:** ⭐⭐⭐⭐ Gut strukturiert
**Probleme:**
- Error-Codes als Nummern (z.B. "3012") ohne Erklärung
- Kein Link zum betroffenen ESP/Sensor im Dashboard
- Keine Troubleshooting-Hinweise bei Fehlern

#### Flow 2: Fehler debuggen (AKTUELL)

```
1. User sieht Error-Badge im EventsTab
2. Wechselt zu ServerLogsTab
3. Filtert nach "Fehler" Level
4. Klickt auf Log-Eintrag → Detail-Panel
5. Sieht: Zeitstempel, Modul, Original-Nachricht
```

**Bewertung:** ⭐⭐⭐ Funktional
**Probleme:**
- Kein direkter Sprung von Event → Server-Log (nur "Logs um Zeitpunkt")
- Keine Error-Code-Erklärung
- Kein Troubleshooting-Guide
- `error_event` WebSocket-Events werden komplett ignoriert - obwohl Backend `troubleshooting` und `user_action_required` Felder sendet

#### Flow 3: Aktor steuern (AKTUELL)

```
1. User klickt ESP im Dashboard
2. Sidebar öffnet mit Aktor-Controls
3. User sendet Befehl (an/aus/PWM-Wert)
4. ... (kein Feedback ob Befehl ankam)
```

**Bewertung:** ⭐⭐ Verbesserungsbedürftig
**Probleme:**
- Kein Feedback ob Befehl vom ESP empfangen wurde (`actuator_response` ignoriert)
- Kein Fehler-Feedback bei fehlgeschlagenen Befehlen (`actuator_command_failed` ignoriert)
- Keine Command-History einsehbar
- Kein Emergency-Stop-Button in UI (nur API vorhanden)

#### Flow 4: ESP-Gesundheit überwachen (AKTUELL)

```
1. User sieht ESP-Karten im Dashboard
2. Online/Offline Status via Farbindikator
3. WiFi-RSSI via RssiIndicator
4. ... (keine weiteren Health-Details)
```

**Bewertung:** ⭐⭐ Grundlegend
**Probleme:**
- Kein Heap-Speicher-Anzeige
- Kein Uptime-Anzeige
- Kein Health-Trend
- Kein Alarm bei degraded/unhealthy Status
- `/v1/health/esp` Summary nicht genutzt

---

### 2.4 Design-System Konsistenz

#### Farben (Severity/Kategorie)

| Element | Farbe | Konsistent? |
|---------|-------|-------------|
| Info-Badge | Blau (#3b82f6) | ✅ |
| Warning-Badge | Gelb (#fbbf24) | ✅ |
| Error-Badge | Rot (#ef4444) | ✅ |
| Critical-Badge | Lila (#8b5cf6) | ⚠️ (sollte dunkler Rot sein) |
| ESP-Status Kategorie | Blau (#3b82f6) | ✅ |
| Sensors Kategorie | Grün (#10b981) | ✅ |
| Actuators Kategorie | Orange (#f59e0b) | ✅ |
| System Kategorie | Lila (#8b5cf6) | ✅ |

**Problem:** `critical` nutzt die gleiche Farbe wie `System`-Kategorie (Lila). Critical sollte visuell stärker sein als Error.

#### Glassmorphism

| Element | Background | Border | Konsistent? |
|---------|------------|--------|-------------|
| Event-Cards | rgba(255,255,255,0.02) | rgba(255,255,255,0.05) | ✅ |
| Detail-Panels | rgba(255,255,255,0.03) | rgba(255,255,255,0.08) | ✅ |
| Filter-Dropdowns | rgba(255,255,255,0.05) | rgba(255,255,255,0.1) | ✅ |
| Badges | Variabel | — | ✅ |

**Bewertung:** Glassmorphism ist konsistent implementiert.

---

## Phase 3: Lücken & Verbesserungen

### 3.1 Fehlende Features (Priorität nach Impact)

#### 🔴 Priorität 1: Kritisch

| # | Feature | Backend vorhanden | Aufwand | Beschreibung |
|---|---------|-------------------|---------|--------------|
| 1 | **Notification/Toast System** | WS `notification` Event | S | Globales Toast-System für Benachrichtigungen, Fehler, Warnungen |
| 2 | **Error Event Display** | WS `error_event` mit Troubleshooting | M | Strukturierte Fehlermeldungen mit `user_action_required` und `troubleshooting` im EventsTab |
| 3 | **Actuator Command Feedback** | WS `actuator_response/command_failed` | S | Erfolg/Fehler-Toast nach Aktor-Befehl |
| 4 | **Emergency Stop Button** | POST `/actuators/emergency_stop` | S | Deutlich sichtbarer Notfall-Button im Dashboard |
| 5 | **Error Code Translation** | `error_codes.py` `get_user_friendly_message()` | M | API-Endpoint für Error-Code-Erklärung, Frontend zeigt menschenlesbare Texte |

#### 🟡 Priorität 2: Wichtig

| # | Feature | Backend vorhanden | Aufwand | Beschreibung |
|---|---------|-------------------|---------|--------------|
| 6 | **ESP Health Dashboard** | `/health/esp`, `/esp/{id}/health` | L | Dediziertes Health-View mit Heap, Uptime, RSSI-Trends |
| 7 | **Actuator Command History** | `/actuators/{id}/history` | M | Timeline der gesendeten Befehle pro Aktor |
| 8 | **Sensor Statistics** | `/sensors/{id}/stats` | M | Min/Max/Avg/Trend-Anzeige pro Sensor |
| 9 | **Rule Test Button** | POST `/logic/rules/{id}/test` | S | "Test"-Button bei Automationsregeln |
| 10 | **Config History** | `/audit/esp/{id}/config-history` | M | Config-Änderungsverlauf pro ESP |
| 11 | **Sequence Progress** | WS `sequence_*` Events | M | Progress-Bar bei laufenden Sequenzen |
| 12 | **Resilience Dashboard** | `/debug/resilience/*` (9 Endpoints) | L | Circuit-Breaker-Status, Offline-Buffer |

#### 🟢 Priorität 3: Nice-to-Have

| # | Feature | Backend vorhanden | Aufwand | Beschreibung |
|---|---------|-------------------|---------|--------------|
| 13 | Manual Measurement Trigger | POST `/sensors/{id}/measure` | S | "Jetzt messen" Button |
| 14 | OneWire Scan UI | POST `/sensors/esp/{id}/onewire/scan` | M | Scan-Interface für OneWire-Bus |
| 15 | ESP Restart/Reset UI | POST `/esp/{id}/restart/reset` | S | Remote-Control Buttons |
| 16 | GPIO Viewer | GET `/esp/{id}/gpio-status` | M | Pin-Belegung visualisieren |
| 17 | Backup Management UI | `/audit/backups/*` | M | Backup-Liste, Restore, Löschen |
| 18 | Error Rate Chart | GET `/audit/error-rate` | M | Fehlerrate-Trend-Graph |
| 19 | System Health View | GET `/health/detailed` | M | Server-Komponenten-Status |

---

### 3.2 UX-Probleme

| # | Problem | Betroffene Komponente | Schwere | Lösungsvorschlag |
|---|---------|----------------------|---------|------------------|
| 1 | **Kein Befehls-Feedback** | Dashboard ActuatorSidebar | 🔴 | Toast bei `actuator_response`/`actuator_command_failed` |
| 2 | **Error-Codes als Nummern** | EventDetailsPanel, UnifiedEventList | 🔴 | `get_user_friendly_message()` Endpoint nutzen |
| 3 | **Kein Notification-System** | Global | 🔴 | Toast-Komponente + WS `notification` Handler |
| 4 | **Kein Emergency-Stop in UI** | Dashboard | 🔴 | Großer roter Button, sticky/always visible |
| 5 | **Critical = Lila** | Severity-Badges | 🟡 | Critical → Dunkelrot mit Pulsieren |
| 6 | **Kein ESP-Detail-Link** | EventDetailsPanel | 🟡 | Klick auf ESP-ID → Dashboard mit ESP geöffnet |
| 7 | **13 WS-Events ignoriert** | esp.ts Store | 🟡 | Handler für alle relevanten Events |
| 8 | **Sensor-Quality nicht sichtbar** | UnifiedEventList | 🟡 | Quality-Badge (good/fair/poor/error) |
| 9 | **Keine Trend-Indikatoren** | Sensor-Anzeigen | 🟡 | Pfeil ↑↓→ für Wertänderung |

---

### 3.3 Konsistenz-Probleme

| # | Problem | Wo? | Lösung |
|---|---------|-----|--------|
| 1 | `critical` Severity hat gleiche Farbe wie `System` Kategorie | Badges | Eigene Farbe für Critical (Dunkelrot) |
| 2 | Manche Events haben `esp_id`, andere `device_id` | WebSocket Events | Standardisieren auf `esp_id` |
| 3 | Audit-Backups API vorhanden, aber keine UI | /v1/audit/backups | Entweder UI bauen oder API aus Docs entfernen |
| 4 | `health_status` Feld in ESPDevice existiert, wird aber nie im Frontend angezeigt | Dashboard ESPCard | Health-Badge auf ESPCard |
| 5 | `error_description` in AuditLog existiert, wird aber nie angezeigt | EventDetailsPanel | Neben Error-Code anzeigen |

---

### 3.4 Menschenverständlichkeit vs. Technik

#### Aktuell zu technisch (Operator versteht es nicht)

| Element | Problem | Vorschlag |
|---------|---------|-----------|
| Error-Code "3012" | Nur Nummer | "MQTT-Verbindung unterbrochen (3012)" |
| "correlation_id" | Technischer Begriff | "Verknüpfte Ereignisse" |
| "pi_enhanced: true" | Unverständlich | "Verarbeitung: Server-seitig" |
| "raw_mode" | Unverständlich | Nicht anzeigen oder "Rohdaten-Modus" |
| "gpio: 22" | Unverständlich für Operator | "Pin 22 (Temperatur)" - mit Sensor-Name |
| "heap_free: 98304" | Unverständlich | "Speicher: 96 KB frei (64%)" mit Fortschrittsbalken |
| "QoS 1" | MQTT-Jargon | Nicht anzeigen |
| "config_status: pending" | Englisch-technisch | "Konfiguration: Wird gesendet..." |

#### Aktuell zu wenig Details (Entwickler kann nicht debuggen)

| Element | Problem | Vorschlag |
|---------|---------|-----------|
| Event-Fehler | Keine Troubleshooting-Hinweise | Backend sendet `troubleshooting` + `user_action_required` → anzeigen |
| Aktor-Befehle | Kein Feedback ob angekommen | `actuator_response` Event verarbeiten |
| Config-Deployment | Kein Status-Tracking | Config-Flow: published → received → applied/failed |
| MQTT-Verbindung | Nur connected/disconnected | Reconnect-Attempts, Last Error anzeigen |
| Server-Health | Keine Übersicht | Component-Status: DB, MQTT, Scheduler, Logic Engine |

#### Gute Balance (beibehalten)

| Element | Warum gut |
|---------|-----------|
| Level-Badges (Info/Warnung/Fehler) | Farbe + Text, universell verständlich |
| GPIO-Badge mit Sensor-Typ | "GPIO 22 · Temperatur" - technisch + verständlich |
| RSSI-Indicator | Balken-Visualisierung statt dBm-Wert |
| Zeitstempel-Formatierung | Relative Zeit ("vor 5 Min") + absolut bei Hover |
| Event-Gruppierung | Logische Zusammenfassung reduziert Noise |

---

## Phase 4: Verbesserungsplan

### Empfohlene Implementierungs-Reihenfolge

#### Sprint 1: Kritisches Feedback & Safety

| # | Aufgabe | Komponente | Aufwand |
|---|---------|------------|--------|
| 1 | **Toast/Notification System** erstellen | Neue Komponente `AppToast.vue` | S |
| 2 | **Emergency-Stop Button** im Dashboard | DashboardView Header | S |
| 3 | **Actuator Command Feedback** via WS | esp.ts Store + Toast | S |
| 4 | **Error Code Translation API** + Frontend | Neuer Endpoint + EventDetailsPanel | M |

**Ergebnis:** User bekommt Feedback, Safety-Controls sichtbar, Fehler verständlich.

#### Sprint 2: Fehlende WS-Event-Handler

| # | Aufgabe | Komponente | Aufwand |
|---|---------|------------|--------|
| 5 | `error_event` Handler mit Troubleshooting | esp.ts + EventDetailsPanel | M |
| 6 | `actuator_command/response/failed` Handler | esp.ts + Toast | S |
| 7 | `config_published/failed` Handler | esp.ts + Toast | S |
| 8 | `notification` Handler | esp.ts + AppToast | S |
| 9 | `system_event` Handler | esp.ts + StatusBar | S |
| 10 | Critical Severity → eigene Farbe (Dunkelrot + Puls) | CSS | S |

**Ergebnis:** Alle 25 Backend-Events werden im Frontend verarbeitet.

#### Sprint 3: Health & Monitoring

| # | Aufgabe | Komponente | Aufwand |
|---|---------|------------|--------|
| 11 | ESP Health Dashboard View | Neue View oder Dashboard-Erweiterung | L |
| 12 | `health_status` Badge auf ESPCard | ESPCard Component | S |
| 13 | Sensor Quality Badge | UnifiedEventList | S |
| 14 | Error Rate Chart | SystemMonitorView neuer Tab | M |
| 15 | `error_description` anzeigen | EventDetailsPanel | S |

**Ergebnis:** Vollständige Gesundheitsübersicht der ESP-Flotte.

#### Sprint 4: History & Details

| # | Aufgabe | Komponente | Aufwand |
|---|---------|------------|--------|
| 16 | Actuator Command History | Neues Panel in Dashboard | M |
| 17 | Sensor Statistics (Min/Max/Avg) | SensorsView Erweiterung | M |
| 18 | Config History pro ESP | Dashboard ESP-Detail | M |
| 19 | Rule Test Button | LogicView | S |
| 20 | Sequence Progress Tracker | Neues Panel | M |

**Ergebnis:** Vollständige History und Detail-Einblicke.

#### Sprint 5: Advanced Features

| # | Aufgabe | Komponente | Aufwand |
|---|---------|------------|--------|
| 21 | Resilience Dashboard | Neuer Admin-View | L |
| 22 | GPIO Viewer | ESP-Detail-Panel | M |
| 23 | Manual Measurement Button | SensorsView | S |
| 24 | ESP Restart/Reset Buttons | Dashboard ESP-Detail | S |
| 25 | Backup Management UI | SystemMonitorView | M |

**Ergebnis:** Vollständige Abdeckung aller Backend-Features.

---

### Zusammenfassung

| Metrik | Wert |
|--------|------|
| **Backend API Endpoints** | 153 |
| **Frontend nutzt** | ~95 (~62%) |
| **Frontend nutzt NICHT** | ~58 (~38%) |
| **WebSocket Event-Typen** | 27 |
| **Frontend verarbeitet** | 12 (44%) |
| **Frontend ignoriert** | 13 (48%) |
| **Frontend-only (nicht implementiert)** | 2 (8%) |
| **Kritische UX-Probleme** | 5 |
| **Empfohlene Sprints** | 5 |

**Top 3 Quick Wins:**
1. Toast-System + Actuator-Feedback (sofort spürbare Verbesserung)
2. Emergency-Stop-Button (Safety-kritisch)
3. Error-Code-Übersetzung (Menschenverständlichkeit)
