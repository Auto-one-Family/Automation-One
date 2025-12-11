# Frontend-Entwicklungsplan - AutomationOne Framework

> **Zweck:** Vollständiger Plan für die Entwicklung eines modernen Vuetify 3 Frontends für das AutomationOne Framework  
> **Basis:** God-Kaiser Server REST API + WebSocket, Ideen aus ARCHIV/growy-frontend  
> **Status:** 📋 Planungsphase

---

## 1. System-Verständnis

### 1.1 Backend-Architektur (God-Kaiser Server)

**Kern-Komponenten:**
- **REST API:** FastAPI auf Port 8000, JWT-Authentifizierung
- **WebSocket:** Real-time Updates mit Subscription-System für Sensor-Daten, Actuator-Status, Logic-Executions
- **MQTT:** Server kommuniziert mit ESPs via MQTT (TLS, Port 8883)
- **Database:** PostgreSQL/SQLite mit SQLAlchemy ORM
- **Services:** 
  - Sensor-Service: Dynamische Library-Loader für Sensor-Processing
  - Actuator-Service: Command-Validierung mit Safety-Checks
  - Logic-Engine: Background-Task für Rule-Evaluation (Cross-ESP-Automation)
  - ESP-Service: Geräteverwaltung, Zone-Zuordnung, Health-Tracking
  - Safety-Service: Server-seitige Validierung aller Actuator-Commands

**Zone-System-Architektur:**
- Zones sind **String-basiert** (kein separates Zone-Model)
- Zone-Informationen direkt im ESPDevice-Model gespeichert:
  - `zone_id`: String-Identifier (z.B. "greenhouse-zone-a")
  - `zone_name`: Human-readable Name (z.B. "Greenhouse Zone A")
  - `is_zone_master`: Boolean-Flag für Master-Zones
- Hierarchie: Master Zone → Zone → ESPs (organisiert über zone_id Strings)
- ESPs können über ESP-Endpoints (`PATCH /api/v1/esp/devices/{esp_id}`) Zonen zugeordnet werden

**Kaiser-System:**
- Alle ESPs verwenden aktuell `kaiser_id="god"` (direkte God-Kaiser-Steuerung)
- Kaiser-Nodes sind **optional** für Skalierung bei 100+ ESPs
- ESP-Model enthält `kaiser_id` Feld (String, optional)
- Kaiser-Zuordnung über `POST /api/v1/esp/devices/{esp_id}/assign_kaiser`

**Verfügbare API-Endpoints (Vollständig implementiert):**

**ESP-Management:**
- `GET /api/v1/esp/devices` - Liste mit Pagination, Filtern (zone_id, status, hardware_type)
- `GET /api/v1/esp/devices/{esp_id}` - Details mit sensor_count, actuator_count
- `POST /api/v1/esp/devices` - Registrierung (erfordert Operator-Rolle)
- `PATCH /api/v1/esp/devices/{esp_id}` - Update (inkl. Zone-Zuordnung)
- `POST /api/v1/esp/devices/{esp_id}/config` - Config-Update via MQTT
- `POST /api/v1/esp/devices/{esp_id}/restart` - Restart-Command
- `POST /api/v1/esp/devices/{esp_id}/reset` - Factory-Reset (mit Confirmation)
- `GET /api/v1/esp/devices/{esp_id}/health` - Health-Metriken (uptime, heap_free, wifi_rssi)
- `POST /api/v1/esp/devices/{esp_id}/assign_kaiser` - Kaiser-Zuordnung

**Sensor-Management:**
- `GET /api/v1/sensors/` - Liste mit Pagination, Filtern (esp_id, sensor_type, enabled)
- `GET /api/v1/sensors/{esp_id}/{gpio}` - Sensor-Config
- `POST /api/v1/sensors/{esp_id}/{gpio}` - Create/Update
- `DELETE /api/v1/sensors/{esp_id}/{gpio}` - Delete
- `GET /api/v1/sensors/data` - Daten-Abfrage (Zeitbereich, Quality-Filter)
- `GET /api/v1/sensors/{esp_id}/{gpio}/stats` - Statistiken (min/max/avg/std_dev)

**Actuator-Management:**
- `GET /api/v1/actuators/` - Liste mit Pagination
- `GET /api/v1/actuators/{esp_id}/{gpio}` - Config
- `POST /api/v1/actuators/{esp_id}/{gpio}` - Create/Update
- `POST /api/v1/actuators/{esp_id}/{gpio}/command` - Command senden (ON/OFF/PWM/TOGGLE)
- `GET /api/v1/actuators/{esp_id}/{gpio}/status` - Status
- `POST /api/v1/actuators/emergency_stop` - Emergency-Stop (alle oder spezifisch)
- `DELETE /api/v1/actuators/{esp_id}/{gpio}` - Delete
- `GET /api/v1/actuators/{esp_id}/{gpio}/history` - Command-History

**Logic-Management:**
- `GET /api/v1/logic/rules` - Liste mit Pagination
- `GET /api/v1/logic/rules/{rule_id}` - Rule-Details
- `POST /api/v1/logic/rules` - Create
- `PUT /api/v1/logic/rules/{rule_id}` - Update
- `DELETE /api/v1/logic/rules/{rule_id}` - Delete
- `POST /api/v1/logic/rules/{rule_id}/toggle` - Enable/Disable
- `POST /api/v1/logic/rules/{rule_id}/test` - Simulation
- `GET /api/v1/logic/execution_history` - Execution-History

**Authentifizierung:**
- `POST /api/v1/auth/login` - Login (Username/Password → JWT)
- `POST /api/v1/auth/refresh` - Token-Refresh
- `POST /api/v1/auth/logout` - Logout

**System:**
- `GET /api/v1/health` - System-Health-Check

**WebSocket:**
- `ws://localhost:8000/ws/realtime/{client_id}` - Real-time Updates mit Subscription-System

**Datenfluss:**
```
ESP32 → MQTT → God-Kaiser Server → Database
                              ↓
                    Logic Engine (Background-Task)
                              ↓
                         WebSocket → Frontend (Real-time)
                              ↓
                         REST API → Frontend (CRUD Operations)
```

### 1.2 Altes Frontend (ARCHIV) - Übernommene Ideen

**Wichtige Features aus dem alten Frontend:**
1. **Dashboard Builder:** Drag & Drop für Widgets, benutzerdefinierte Dashboards
2. **Zone-System:** Hierarchische Visualisierung (Master Zone → Zone → SubZone)
3. **Sensor-Visualisierung:** Live-Werte, Graphen, Gauges, Vergleichsansichten
4. **Actuator-Controls:** Buttons, Slider, Schedules, Safety-Limits
5. **Logic Builder:** Visuelle Erstellung von If-Then-Regeln (Cross-ESP-Automation)
6. **Mindmap-View:** Alternative Visualisierung der System-Hierarchie
7. **Development-Tools:** MQTT-Debug, System-Commands, Device-Simulator
8. **Central Data Hub:** Zentrale Datenverwaltung mit Store-Pattern (Pinia)
9. **Real-time Updates:** MQTT-Integration für Live-Daten (wird durch WebSocket ersetzt)

**Technologie-Stack (alt):**
- Vue 3 + Vuetify 3
- Pinia für State-Management
- Chart.js für Visualisierungen
- MQTT.js für Real-time (wird durch WebSocket ersetzt)
- Axios für REST API

**Probleme im alten Frontend:**
- Direkte MQTT-Verbindung (sollte über Server-WebSocket laufen)
- Legacy-Topics und Payload-Strukturen
- Komplexe Store-Struktur (kann vereinfacht werden)
- Viele redundante Komponenten

---

## 2. Neues Frontend - Konzept

### 2.1 Architektur-Prinzipien

**1. Server-Centric Communication:**
- **KEINE direkte MQTT-Verbindung** vom Frontend
- **REST API** für alle CRUD-Operationen
- **WebSocket** für Real-time Updates (vom Server)
- Frontend ist "dumm" - alle Logik auf dem Server

**2. Modulare Komponenten-Struktur:**
- Wiederverwendbare Widgets (Sensor-Card, Actuator-Card, etc.)
- Composables für Business-Logic (useSensorData, useActuatorControl, etc.)
- Stores für State-Management (espStore, sensorStore, actuatorStore, logicStore)

**3. Responsive Design:**
- Mobile-First Approach
- Vuetify 3 Grid-System
- Touch-optimierte Controls für Mobile

**4. User Experience:**
- Intuitive Navigation
- Kontextuelle Hilfe (Tooltips, Hints)
- Loading-States und Error-Handling
- Optimistic UI Updates

### 2.2 Haupt-Features

#### 2.2.1 Dashboard (Hauptansicht)
**Zweck:** Zentrale Übersicht aller System-Komponenten

**Features:**
- **System-Status-Bar:** 
  - Übersicht über alle ESPs (online/offline, Health-Score)
  - Health-Scores basierend auf Health-Metriken:
    - Uptime (Tage/Stunden/Minuten)
    - Heap-Free (Verfügbarer RAM)
    - WiFi-RSSI (Signal-Stärke)
  - Health-Status: healthy, degraded, unhealthy, critical
  - Live-Updates via WebSocket (`esp_health` Event-Type)
- **Zone-Cards:** 
  - Hierarchische Darstellung über zone_id/zone_name/is_zone_master
  - Gruppierung von ESPs nach zone_id
  - Master-Zone-Highlighting
- **Sensor-Widgets:** 
  - Live-Werte mit Einheiten
  - Mini-Graphen (letzte 1h)
  - Warnungen (Critical/Warning)
  - Drag & Drop für Positionierung
- **Actuator-Controls:**
  - ON/OFF-Buttons
  - PWM-Slider (0-100%)
  - Status-Anzeige (aktiv/inaktiv, Runtime)
  - Emergency-Stop-Button
- **Quick-Actions:** Schnellzugriff auf häufig genutzte Funktionen

**Technische Umsetzung:**
- Pinia Store: `dashboardStore` für Widget-Positionen und Konfiguration
- WebSocket: Subscription auf `/ws/realtime/{client_id}` mit Filtern:
  - `types`: ["sensor_data", "actuator_status", "esp_health", "logic_execution"]
  - `esp_ids`: Optionale Filterung nach spezifischen ESPs
  - Rate-Limiting: 10 Nachrichten/Sekunde pro Client
- REST API: 
  - `GET /api/v1/esp/devices` für ESP-Liste mit Health-Metriken
  - `GET /api/v1/sensors/data` für historische Daten
  - `GET /api/v1/esp/devices/{esp_id}/health` für detaillierte Health-Infos

#### 2.2.2 ESP-Verwaltung
**Zweck:** Konfiguration und Überwachung von ESP-Geräten

**Features:**
- **ESP-Liste:** Tabelle mit Status, Zone, Health-Score, letztem Heartbeat
- **ESP-Details:**
  - Hardware-Info (Board-Type, GPIO-Status)
  - Konfigurierte Sensoren/Aktoren
  - Health-Metriken (Heap, Uptime, WiFi-RSSI)
  - System-Commands (Restart, Factory-Reset)
- **ESP-Registrierung:** Neues ESP-Gerät registrieren (ESP-ID, Zone-Zuordnung)
- **Kaiser-Zuordnung:** ESP zu Kaiser-Node zuweisen (optional, für Skalierung)

**Technische Umsetzung:**
- REST API: 
  - `GET /api/v1/esp/devices` - Liste mit Pagination, Filtern (zone_id, status, hardware_type)
  - `POST /api/v1/esp/devices` - Registrierung (erfordert Operator-Rolle)
  - `GET /api/v1/esp/devices/{esp_id}` - Details mit sensor_count, actuator_count
  - `PATCH /api/v1/esp/devices/{esp_id}` - Update (inkl. Zone-Zuordnung)
  - `POST /api/v1/esp/devices/{esp_id}/restart` - Restart-Command
  - `POST /api/v1/esp/devices/{esp_id}/reset` - Factory-Reset (mit Confirmation)
  - `GET /api/v1/esp/devices/{esp_id}/health` - Health-Metriken
  - `POST /api/v1/esp/devices/{esp_id}/assign_kaiser` - Kaiser-Zuordnung
- WebSocket: 
  - `esp_health` Event-Type für Live-Health-Updates
  - `esp_status` Event-Type für Status-Änderungen (online/offline)

#### 2.2.3 Sensor-Management
**Zweck:** Konfiguration und Überwachung von Sensoren

**Features:**
- **Sensor-Liste:** Alle konfigurierten Sensoren mit aktuellen Werten
- **Sensor-Konfiguration:**
  - GPIO-Auswahl (mit Safe-Mode-Validierung)
  - Sensor-Typ (pH, Temperature, Humidity, EC, CO2, etc.)
  - Verarbeitungs-Modus (Pi-Enhanced Standard, OTA Library optional)
  - Kalibrierung (2-Punkt-Kalibrierung)
  - Thresholds (Min/Max/Warning/Critical)
  - Sample-Interval
- **Sensor-Daten-Visualisierung:**
  - Zeitreihen-Graphen (Chart.js)
  - Vergleichsansichten (mehrere Sensoren)
  - Export (CSV, JSON)
  - Aggregation (Stündlich/Täglich/Wöchentlich)
- **Sensor-Statistiken:**
  - Min/Max/Average/StdDev für Zeitbereiche
  - Quality-Distribution (good/poor/bad)
  - Reading-Count

**Technische Umsetzung:**
- REST API: 
  - `GET /api/v1/sensors/` - Liste mit Pagination, Filtern (esp_id, sensor_type, enabled)
  - `GET /api/v1/sensors/{esp_id}/{gpio}` - Sensor-Config
  - `POST /api/v1/sensors/{esp_id}/{gpio}` - Create/Update
  - `DELETE /api/v1/sensors/{esp_id}/{gpio}` - Delete
  - `GET /api/v1/sensors/data` - Daten-Abfrage mit Zeitbereich, Quality-Filter
  - `GET /api/v1/sensors/{esp_id}/{gpio}/stats` - Statistiken (min/max/avg/std_dev)
- WebSocket: 
  - `sensor_data` Event-Type für Live-Sensor-Werte
  - Subscription-Filter: `sensor_types` für spezifische Sensor-Typen
- Pinia Store: `sensorStore` für Sensor-Configs und aktuelle Werte
- **Pi-Enhanced Processing:** Automatisch aktiv wenn ESP `raw_mode: true` sendet, Server verarbeitet RAW-Daten mit Python-Libraries

#### 2.2.4 Actuator-Steuerung
**Zweck:** Steuerung und Überwachung von Aktoren

**Features:**
- **Actuator-Liste:** Alle konfigurierten Aktoren mit Status
- **Actuator-Konfiguration:**
  - GPIO-Auswahl (mit Safe-Mode-Validierung)
  - Actuator-Typ (Relay, PWM, Valve, Pump)
  - Safety-Limits (Max-Runtime, Cooldown)
  - Emergency-Stop-Status
- **Manuelle Steuerung:**
  - ON/OFF-Buttons
  - PWM-Slider (0-100%, wird zu 0.0-1.0 konvertiert → ESP32: 0-255)
  - Bestätigungs-Dialog für kritische Aktionen
- **Command-History:**
  - Historie aller gesendeten Commands
  - Erfolgs-Status, Error-Messages
  - Timestamp, Issued-By Information
- **Emergency-Stop:**
  - Global: Alle Aktoren auf allen ESPs stoppen
  - ESP-spezifisch: Nur Aktoren auf einem ESP stoppen
  - GPIO-spezifisch: Nur einen Aktor stoppen
  - Bestätigung erforderlich
- **Schedules:** Zeit-gesteuerte Aktivierung (Cron-ähnlich)
- **Runtime-Tracking:** Gesamtlaufzeit, Aktivierungsanzahl

**Technische Umsetzung:**
- REST API: 
  - `GET /api/v1/actuators/` - Liste mit Pagination
  - `GET /api/v1/actuators/{esp_id}/{gpio}` - Config
  - `POST /api/v1/actuators/{esp_id}/{gpio}` - Create/Update
  - `POST /api/v1/actuators/{esp_id}/{gpio}/command` - Command senden (ON/OFF/PWM/TOGGLE)
  - `GET /api/v1/actuators/{esp_id}/{gpio}/status` - Status
  - `POST /api/v1/actuators/emergency_stop` - Emergency-Stop (body: esp_id?, gpio?, reason)
  - `DELETE /api/v1/actuators/{esp_id}/{gpio}` - Delete
  - `GET /api/v1/actuators/{esp_id}/{gpio}/history` - Command-History
- WebSocket: 
  - `actuator_status` Event-Type für Status-Updates
- Pinia Store: `actuatorStore` für Actuator-Configs und States
- **Safety-Checks:** 
  - Alle Commands werden server-seitig via SafetyService validiert
  - Max-Runtime-Checks, Cooldown-Validierung, Emergency-Stop-Status
  - Value-Range-Validierung (PWM: 0.0-1.0)

#### 2.2.5 Logic Builder (Cross-ESP-Automation)
**Zweck:** Visuelle UI zur Erstellung und Verwaltung von If-Then-Regeln

**Wichtiger Architektur-Hinweis:**
- **Frontend = UI-Komponente**: Nur visueller Editor, keine Rule-Evaluation
- **Server = Single Source of Truth**: Alle ESPs, Sensoren, Aktoren kommen vom Server
- **Rule-Evaluation**: Läuft ausschließlich auf dem Server (Logic Engine Background-Task)
- **Validierung**: Client-seitige Schema-Validierung für sofortiges UI-Feedback, finale Validierung auf dem Server

**Features:**
- **Rule-Editor (UI-Komponente):**
  - Drag & Drop Interface für visuelle Erstellung
  - **Verfügbare Komponenten vom Server laden:**
    - ESPs: `GET /api/v1/esp/devices`
    - Sensoren: `GET /api/v1/sensors/` (zeigt nur verfügbare Sensoren)
    - Aktoren: `GET /api/v1/actuators/` (zeigt nur verfügbare Aktoren)
  - Trigger-Auswahl: Sensor-Wert, Zeit, Event (nur verfügbare Optionen)
  - Condition-Builder: AND/OR-Logik, Thresholds (UI-Validierung)
  - Action-Auswahl: Actuator-Command, Notification (nur verfügbare Aktoren)
  - Time-Constraints: Zeit-Fenster (nur zu bestimmten Zeiten aktiv)
  - Cooldown-Konfiguration: UI-Validierung (Min/Max)
  - Priority-Level: Für mehrere Rules (UI-Validierung)
  - **Client-seitige Schema-Validierung**: JSON-Schema-Validation für sofortiges Feedback
- **Rule-Liste:** 
  - Alle Rules mit Status (aktiv/inaktiv, letzte Ausführung)
  - Execution-Count pro Rule (vom Server)
  - Last-Execution-Success (Boolean, vom Server)
  - **Datenquelle**: `GET /api/v1/logic/rules` (Server ist Single Source of Truth)
- **Rule-Testing:** 
  - **Nutzt Server-Endpoint**: `POST /api/v1/logic/rules/{rule_id}/test`
  - **Keine lokale Evaluation**: Alle Tests laufen auf dem Server
  - Mock-Sensor-Werte: Frontend sendet Mock-Data zum Server
  - Mock-Time: Frontend sendet Mock-Time zum Server
  - Dry-Run-Modus: Server führt Simulation durch
  - Condition-Results und Action-Results: Server sendet Ergebnisse zurück
  - **UI zeigt nur Server-Response**: Frontend visualisiert Test-Ergebnisse
- **Execution-Log:** 
  - Historie aller Rule-Ausführungen (vom Server)
  - Erfolgsrate (Success-Rate, berechnet auf Server)
  - Filter nach Rule-ID, Success-Status, Zeitbereich
  - Trigger-Reason, Actions-Executed, Error-Messages
  - **Datenquelle**: `GET /api/v1/logic/execution_history` (Server)
- **Rule-Toggle:** 
  - Enable/Disable via `/api/v1/logic/rules/{rule_id}/toggle`
  - Reason für Toggle optional
  - **Server entscheidet**: Frontend sendet Request, Server führt aus

**Technische Umsetzung:**
- REST API: 
  - `GET /api/v1/esp/devices` - **Lädt verfügbare ESPs für Rule-Builder**
  - `GET /api/v1/sensors/` - **Lädt verfügbare Sensoren für Condition-Auswahl**
  - `GET /api/v1/actuators/` - **Lädt verfügbare Aktoren für Action-Auswahl**
  - `GET /api/v1/logic/rules` - Liste mit Pagination, Enabled-Filter
  - `GET /api/v1/logic/rules/{rule_id}` - Rule-Details mit Execution-Count
  - `POST /api/v1/logic/rules` - Create (Server validiert final)
  - `PUT /api/v1/logic/rules/{rule_id}` - Update (Server validiert final)
  - `DELETE /api/v1/logic/rules/{rule_id}` - Delete
  - `POST /api/v1/logic/rules/{rule_id}/toggle` - Enable/Disable
  - `POST /api/v1/logic/rules/{rule_id}/test` - **Simulation auf Server** (keine lokale Evaluation)
  - `GET /api/v1/logic/execution_history` - Execution-History mit Filtern
- WebSocket: 
  - `logic_execution` Event-Type für Rule-Execution-Events (vom Server)
- Pinia Store: `logicStore` für Rules und Execution-History (alle Daten vom Server)
- **Logic Engine (Server):** 
  - Läuft als Background-Task auf Server (nicht im Frontend!)
  - Wird getriggert nach Sensor-Daten-Speicherung
  - Evaluates Conditions mit AND/OR-Logic
  - Cooldown-Mechanismus verhindert zu häufige Ausführungen
  - Execution-Logging in Database
  - **Single Source of Truth für alle Rule-Evaluations**

#### 2.2.6 Zone-Verwaltung
**Zweck:** Hierarchische Organisation von ESPs und Sensoren/Aktoren

**Zone-System-Architektur:**
- **String-basiertes System:** Zones sind String-IDs (kein separates Zone-Model)
- **Zone-Felder im ESPDevice-Model:**
  - `zone_id`: String-Identifier (z.B. "greenhouse-zone-a")
  - `zone_name`: Human-readable Name (z.B. "Greenhouse Zone A")
  - `is_zone_master`: Boolean-Flag für Master-Zones
- **Hierarchie:** Master Zone (is_zone_master=true) → Zone → ESPs
- **Organisation:** ESPs werden über zone_id gruppiert

**Features:**
- **Zone-Tree-View:** 
  - Hierarchische Darstellung über zone_id/zone_name/is_zone_master
  - Gruppierung von ESPs nach zone_id
  - Master-Zone-Highlighting
- **Zone-Editor:**
  - Zone-Zuordnung über ESP-Update (`PATCH /api/v1/esp/devices/{esp_id}`)
  - Setzen von zone_id, zone_name, is_zone_master
  - ESP-Zuordnung zu bestehenden oder neuen Zonen
- **Zone-Übersicht:** 
  - Alle Zonen mit zugeordneten ESPs
  - Sensor/Actuator-Counts pro Zone
  - Health-Status-Aggregation pro Zone

**Technische Umsetzung:**
- REST API: 
  - Zone-Management über ESP-Endpoints:
    - `GET /api/v1/esp/devices?zone_id={zone_id}` - ESPs nach Zone filtern
    - `PATCH /api/v1/esp/devices/{esp_id}` - Zone-Zuordnung aktualisieren
- Pinia Store: `zoneStore` für Zone-Hierarchie (abgeleitet aus ESP-Daten)
- **Aggregation:** Zone-Informationen werden aus ESP-Liste aggregiert

#### 2.2.7 Settings
**Zweck:** System-Konfiguration und Administration

**Features:**
- **User-Management:** Accounts, Rollen (Admin/Operator/Viewer)
- **MQTT-Konfiguration:** Credentials, TLS-Settings
- **System-Config:** Retention-Days, Log-Level
- **Backup/Restore:** Database-Snapshots
- **Logs:** System-Logs, Error-Logs, Audit-Trail

**Technische Umsetzung:**
- REST API: Settings-Endpoints (noch zu implementieren im Server)
- Pinia Store: `settingsStore` für System-Config

#### 2.2.8 Development-Tools (Optional)
**Zweck:** Debugging und Entwicklung

**Features:**
- **MQTT-Debug-Panel:** Topic-Monitoring, Message-Log
- **System-Commands:** Direkte System-Befehle
- **Device-Simulator:** ESP-Verhalten simulieren
- **API-Tester:** REST API-Endpoints testen

**Technische Umsetzung:**
- Nur in Development-Mode verfügbar
- REST API: Health-Endpoints, Debug-Endpoints

---

## 3. Technologie-Stack

### 3.1 Core-Framework
- **Vue 3** (Composition API)
- **Vuetify 3** (Material Design Components)
- **Vite** (Build-Tool)

### 3.2 State-Management
- **Pinia** (Vue 3 State-Management)
  - Stores: `espStore`, `sensorStore`, `actuatorStore`, `logicStore`, `zoneStore`, `settingsStore`, `dashboardStore`, `authStore`

### 3.3 Kommunikation
- **Axios** (REST API Client)
- **WebSocket Client** (native WebSocket API oder vue-use WebSocket)
- **JWT** (Authentifizierung)

### 3.4 Visualisierung
- **Chart.js** oder **Apache ECharts** (für Zeitreihen-Graphen)
- **Vuetify Charts** (für einfache Visualisierungen)

### 3.5 Utilities
- **date-fns** (Datum/Zeit-Formatierung)
- **VueUse** (Composables für Vue 3)
- **Zod** oder **Yup** (Schema-Validation, optional)

### 3.6 Development-Tools
- **ESLint** (Code-Quality)
- **Prettier** (Code-Formatierung)
- **TypeScript** (optional, für bessere Type-Safety)

---

## 4. Ordnerstruktur

```
El Frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── assets/
│   │   ├── styles/
│   │   │   ├── main.css
│   │   │   └── variables.css
│   │   └── images/
│   ├── components/
│   │   ├── common/
│   │   │   ├── LoadingSpinner.vue
│   │   │   ├── ErrorMessage.vue
│   │   │   ├── ConfirmDialog.vue
│   │   │   ├── BreadcrumbNavigation.vue
│   │   │   └── HelpTooltip.vue
│   │   ├── dashboard/
│   │   │   ├── DashboardGrid.vue
│   │   │   ├── SystemStatusBar.vue
│   │   │   ├── ZoneCard.vue
│   │   │   ├── SensorWidget.vue
│   │   │   ├── ActuatorControl.vue
│   │   │   └── QuickActions.vue
│   │   ├── esp/
│   │   │   ├── ESPList.vue
│   │   │   ├── ESPCard.vue
│   │   │   ├── ESPDetails.vue
│   │   │   └── ESPRegistrationDialog.vue
│   │   ├── sensors/
│   │   │   ├── SensorList.vue
│   │   │   ├── SensorCard.vue
│   │   │   ├── SensorConfigDialog.vue
│   │   │   ├── SensorChart.vue
│   │   │   └── SensorComparison.vue
│   │   ├── actuators/
│   │   │   ├── ActuatorList.vue
│   │   │   ├── ActuatorCard.vue
│   │   │   ├── ActuatorConfigDialog.vue
│   │   │   ├── ActuatorControlPanel.vue
│   │   │   └── ActuatorScheduleDialog.vue
│   │   ├── logic/
│   │   │   ├── LogicList.vue
│   │   │   ├── LogicCard.vue
│   │   │   ├── LogicBuilder.vue
│   │   │   ├── LogicEditor.vue
│   │   │   ├── LogicTestPanel.vue
│   │   │   └── LogicExecutionLog.vue
│   │   ├── zones/
│   │   │   ├── ZoneTreeView.vue
│   │   │   ├── ZoneCard.vue
│   │   │   └── ZoneEditorDialog.vue
│   │   └── settings/
│   │       ├── UserManagement.vue
│   │       ├── MQTTConfig.vue
│   │       ├── SystemConfig.vue
│   │       └── BackupRestore.vue
│   ├── composables/
│   │   ├── useApi.js
│   │   ├── useWebSocket.js
│   │   ├── useAuth.js
│   │   ├── useSensorData.js
│   │   ├── useActuatorControl.js
│   │   ├── useLogicRules.js
│   │   ├── useESPManagement.js
│   │   └── useErrorHandling.js
│   ├── stores/
│   │   ├── auth.js
│   │   ├── esp.js
│   │   ├── sensor.js
│   │   ├── actuator.js
│   │   ├── logic.js
│   │   ├── zone.js
│   │   ├── settings.js
│   │   └── dashboard.js
│   ├── services/
│   │   ├── api.js          # Axios-Instanz mit Interceptors
│   │   ├── websocket.js    # WebSocket-Manager
│   │   └── auth.js         # JWT-Handling
│   ├── utils/
│   │   ├── validation.js
│   │   ├── formatters.js
│   │   ├── constants.js
│   │   └── helpers.js
│   ├── router/
│   │   └── index.js
│   ├── plugins/
│   │   └── vuetify.js
│   ├── App.vue
│   └── main.js
├── .env.example
├── .gitignore
├── index.html
├── package.json
├── vite.config.js
├── eslint.config.js
├── prettier.config.js
└── README.md
```

---

## 5. Implementierungs-Phasen

### Phase 1: Grundlagen (Week 1-2)
**Ziel:** Basis-Setup und Authentifizierung

**Tasks:**
1. Projekt-Setup (Vue 3 + Vuetify 3 + Vite)
2. Router-Konfiguration (Routes für alle Views)
3. Authentifizierung (Login, JWT-Handling)
4. API-Service (Axios mit Interceptors)
5. WebSocket-Service (Connection-Management)
6. Pinia Stores (Grundstruktur)
7. Layout-Komponenten (Navigation, Sidebar)

**Deliverables:**
- Funktionierender Login
- Navigation zwischen Views
- API-Client mit JWT-Auth
- WebSocket-Verbindung zum Server

### Phase 2: ESP-Verwaltung (Week 3)
**Ziel:** ESP-Liste und Details

**Tasks:**
1. ESP-Store (Pinia)
2. ESP-Liste-Komponente
3. ESP-Details-Komponente
4. ESP-Registrierung
5. WebSocket-Integration (Heartbeat-Updates)

**Deliverables:**
- ESP-Liste mit Live-Status
- ESP-Details-View
- ESP-Registrierung funktioniert

### Phase 3: Sensor-Management (Week 4)
**Ziel:** Sensor-Konfiguration und Visualisierung

**Tasks:**
1. Sensor-Store (Pinia)
2. Sensor-Liste-Komponente
3. Sensor-Config-Dialog
4. Sensor-Chart (Chart.js)
5. WebSocket-Integration (Live-Werte)

**Deliverables:**
- Sensor-Liste mit Live-Werten
- Sensor-Konfiguration funktioniert
- Sensor-Graphen zeigen Daten

### Phase 4: Actuator-Steuerung (Week 5)
**Ziel:** Actuator-Konfiguration und Steuerung

**Tasks:**
1. Actuator-Store (Pinia)
2. Actuator-Liste-Komponente
3. Actuator-Config-Dialog
4. Actuator-Control-Panel (Buttons, Slider)
5. Emergency-Stop-Funktionalität
6. WebSocket-Integration (Status-Updates)

**Deliverables:**
- Actuator-Liste mit Status
- Actuator-Steuerung funktioniert
- Emergency-Stop funktioniert

### Phase 5: Dashboard (Week 6)
**Ziel:** Haupt-Dashboard mit Widgets

**Tasks:**
1. Dashboard-Store (Pinia)
2. Dashboard-Grid (Drag & Drop)
3. System-Status-Bar
4. Zone-Cards
5. Sensor-Widgets
6. Actuator-Controls
7. Widget-Konfiguration

**Deliverables:**
- Funktionierendes Dashboard
- Drag & Drop für Widgets
- Live-Updates via WebSocket

### Phase 6: Logic Builder (Week 7)
**Ziel:** Cross-ESP-Automation Rules (UI-Layer)

**Wichtig:** Frontend ist nur UI. Rule-Evaluation läuft ausschließlich auf dem Server.

**Tasks:**
1. Logic-Store (Pinia) - Lädt verfügbare ESPs, Sensoren, Aktoren vom Server
2. Logic-Liste-Komponente - Zeigt Rules vom Server
3. Logic-Builder (Drag & Drop Editor) - UI-Komponente, keine Evaluation
4. Logic-Editor (Form-basiert) - Zeigt nur verfügbare Komponenten vom Server
5. Logic-Test-Panel - Nutzt Server-Endpoint für Simulation
6. Execution-Log - Zeigt Historie vom Server

**Deliverables:**
- Logic-Builder funktioniert (UI)
- Rules können erstellt/bearbeitet werden (Server validiert final)
- Execution-Log zeigt Historie (vom Server)
- Verfügbare Komponenten werden vom Server geladen

### Phase 7: Zone-Verwaltung (Week 8)
**Ziel:** Hierarchische Zone-Organisation

**Tasks:**
1. Zone-Store (Pinia)
2. Zone-Tree-View
3. Zone-Editor-Dialog
4. ESP-Zuordnung zu Zonen

**Deliverables:**
- Zone-Tree-View funktioniert
- Zonen können erstellt/bearbeitet werden

### Phase 8: Settings & Polish (Week 9-10)
**Ziel:** System-Konfiguration und Feinschliff

**Tasks:**
1. Settings-Store (Pinia)
2. Settings-Views (User-Management, MQTT-Config, etc.)
3. Error-Handling verbessern
4. Loading-States optimieren
5. Mobile-Responsiveness
6. Performance-Optimierung
7. Testing

**Deliverables:**
- Vollständiges Settings-Panel
- Mobile-optimiert
- Performance-optimiert

---

## 6. API-Integration

### 6.1 REST API Endpoints (Server)

**Wichtig:** Alle Endpoints verwenden Pydantic-Schemas für Request/Response-Validation. Pagination wird über Query-Parameter (`page`, `page_size`) gesteuert.

**ESP-Management:**

**List Devices:**
- `GET /api/v1/esp/devices`
- Query-Parameter: `zone_id?`, `status?`, `hardware_type?`, `page=1`, `page_size=20`
- Response: `ESPDeviceListResponse` mit PaginationMeta
- Liefert: Liste aller ESPs mit sensor_count, actuator_count

**Get Device:**
- `GET /api/v1/esp/devices/{esp_id}`
- Response: `ESPDeviceResponse` mit allen Device-Details

**Register Device:**
- `POST /api/v1/esp/devices`
- Body: `ESPDeviceCreate` (device_id, name, zone_id, zone_name, ip_address, mac_address, etc.)
- Erfordert: Operator-Rolle
- Response: `ESPDeviceResponse`

**Update Device:**
- `PATCH /api/v1/esp/devices/{esp_id}`
- Body: `ESPDeviceUpdate` (partial update, kann zone_id/zone_name enthalten)
- Erfordert: Operator-Rolle

**Device Commands:**
- `POST /api/v1/esp/devices/{esp_id}/config` - Config-Update via MQTT
- `POST /api/v1/esp/devices/{esp_id}/restart` - Restart-Command
- `POST /api/v1/esp/devices/{esp_id}/reset` - Factory-Reset (body: `confirm=true`)
- `GET /api/v1/esp/devices/{esp_id}/health` - Health-Metriken (uptime, heap_free, wifi_rssi)
- `POST /api/v1/esp/devices/{esp_id}/assign_kaiser` - Kaiser-Zuordnung

**Sensor-Management:**

**List Sensors:**
- `GET /api/v1/sensors/`
- Query-Parameter: `esp_id?`, `sensor_type?`, `enabled?`, `page=1`, `page_size=20`
- Response: `SensorConfigListResponse` mit latest_value, latest_quality

**Get Sensor:**
- `GET /api/v1/sensors/{esp_id}/{gpio}`
- Response: `SensorConfigResponse`

**Create/Update Sensor:**
- `POST /api/v1/sensors/{esp_id}/{gpio}`
- Body: `SensorConfigCreate` (sensor_type, name, enabled, interval_ms, processing_mode, calibration, thresholds, etc.)
- Erfordert: Operator-Rolle

**Delete Sensor:**
- `DELETE /api/v1/sensors/{esp_id}/{gpio}`
- Erfordert: Operator-Rolle

**Query Sensor Data:**
- `GET /api/v1/sensors/data`
- Query-Parameter: `esp_id?`, `gpio?`, `sensor_type?`, `start_time?`, `end_time?`, `quality?`, `limit=100`
- Response: `SensorDataResponse` mit SensorReading[]

**Get Sensor Statistics:**
- `GET /api/v1/sensors/{esp_id}/{gpio}/stats`
- Query-Parameter: `start_time?`, `end_time?`
- Response: `SensorStatsResponse` mit min/max/avg/std_dev, quality_distribution

**Actuator-Management:**

**List Actuators:**
- `GET /api/v1/actuators/`
- Query-Parameter: `esp_id?`, `actuator_type?`, `enabled?`, `page=1`, `page_size=20`
- Response: `ActuatorConfigListResponse` mit current_value, is_active

**Get Actuator:**
- `GET /api/v1/actuators/{esp_id}/{gpio}`
- Response: `ActuatorConfigResponse`

**Create/Update Actuator:**
- `POST /api/v1/actuators/{esp_id}/{gpio}`
- Body: `ActuatorConfigCreate` (actuator_type, name, enabled, max_runtime_seconds, cooldown_seconds, etc.)
- Erfordert: Operator-Rolle

**Send Command:**
- `POST /api/v1/actuators/{esp_id}/{gpio}/command`
- Body: `ActuatorCommand` (command: ON/OFF/PWM/TOGGLE, value: 0.0-1.0, duration?)
- Erfordert: Operator-Rolle
- Validierung: SafetyService prüft alle Commands server-seitig
- Response: `ActuatorCommandResponse` mit safety_warnings

**Get Status:**
- `GET /api/v1/actuators/{esp_id}/{gpio}/status`
- Query-Parameter: `include_config?`
- Response: `ActuatorStatusResponse` mit current state

**Emergency Stop:**
- `POST /api/v1/actuators/emergency_stop`
- Body: `EmergencyStopRequest` (esp_id?, gpio?, reason)
- Erfordert: Operator-Rolle
- Response: `EmergencyStopResponse` mit devices_stopped, actuators_stopped

**Get History:**
- `GET /api/v1/actuators/{esp_id}/{gpio}/history`
- Query-Parameter: `limit=20`
- Response: `ActuatorHistoryResponse` mit Command-History

**Delete Actuator:**
- `DELETE /api/v1/actuators/{esp_id}/{gpio}`
- Erfordert: Operator-Rolle
- Sendet OFF-Command vor Löschung

**Logic-Management:**

**List Rules:**
- `GET /api/v1/logic/rules`
- Query-Parameter: `enabled?`, `page=1`, `page_size=20`
- Response: `LogicRuleListResponse` mit execution_count, last_execution_success

**Get Rule:**
- `GET /api/v1/logic/rules/{rule_id}`
- Response: `LogicRuleResponse`

**Create Rule:**
- `POST /api/v1/logic/rules`
- Body: `LogicRuleCreate` (name, description, conditions[], actions[], logic_operator, enabled, priority, cooldown_seconds, etc.)
- Erfordert: Operator-Rolle

**Update Rule:**
- `PUT /api/v1/logic/rules/{rule_id}`
- Body: `LogicRuleUpdate` (partial update)
- Erfordert: Operator-Rolle

**Delete Rule:**
- `DELETE /api/v1/logic/rules/{rule_id}`
- Erfordert: Operator-Rolle

**Toggle Rule:**
- `POST /api/v1/logic/rules/{rule_id}/toggle`
- Body: `RuleToggleRequest` (enabled, reason?)
- Erfordert: Operator-Rolle
- Response: `RuleToggleResponse`

**Test Rule:**
- `POST /api/v1/logic/rules/{rule_id}/test`
- Body: `RuleTestRequest` (mock_sensor_values?, mock_time?, dry_run)
- Erfordert: Operator-Rolle
- Response: `RuleTestResponse` mit condition_results, action_results, would_trigger

**Execution History:**
- `GET /api/v1/logic/execution_history`
- Query-Parameter: `rule_id?`, `success?`, `start_time?`, `end_time?`, `limit=50`
- Response: `ExecutionHistoryResponse` mit success_rate

**Authentifizierung:**
- `POST /api/v1/auth/login` - Login (Username/Password → JWT)
- `POST /api/v1/auth/refresh` - Token-Refresh
- `POST /api/v1/auth/logout` - Logout

**Fehlerbehandlung:**
- `400 Bad Request`: Ungültige Request-Daten, Validierungsfehler
- `401 Unauthorized`: JWT-Token fehlt oder ungültig
- `403 Forbidden`: Unzureichende Berechtigung (Operator-Rolle erforderlich)
- `404 Not Found`: Resource nicht gefunden
- `422 Unprocessable Entity`: Pydantic-Validierungsfehler

### 6.2 WebSocket Events (Server)

**Connection:**
- Endpoint: `ws://localhost:8000/ws/realtime/{client_id}` (oder `wss://` für HTTPS)
- `client_id`: Eindeutige Client-Identifier (z.B. UUID)

**Subscription-Mechanismus:**
Nach Verbindungsaufbau kann der Client Subscriptions setzen:

```javascript
// Subscribe Message
{
  "action": "subscribe",
  "filters": {
    "types": ["sensor_data", "actuator_status", "esp_health"],
    "esp_ids": ["ESP_12AB34CD", "ESP_ABCDEF12"],
    "sensor_types": ["temperature", "humidity"]
  }
}

// Unsubscribe Message
{
  "action": "unsubscribe",
  "filters": {
    "types": ["sensor_data"]  // Optional: Entfernt nur bestimmte Filter
  }
}
// oder
{
  "action": "unsubscribe"  // Entfernt alle Filter
}
```

**Event-Types:**
- `sensor_data` - Neuer Sensor-Wert (wird getriggert nach Sensor-Daten-Speicherung)
- `actuator_status` - Actuator-Status-Update (nach Command-Execution)
- `logic_execution` - Logic-Rule wurde ausgeführt (von Logic-Engine)
- `esp_health` - ESP-Health-Update (via Heartbeat-Handler)
- `esp_status` - ESP-Status-Änderung (online/offline)
- `system_event` - System-Events (z.B. Emergency-Stop)

**Filter-Optionen:**
- `types`: Array von Message-Typen (falls leer: alle Typen)
- `esp_ids`: Array von ESP-IDs (falls leer: alle ESPs)
- `sensor_types`: Array von Sensor-Typen (nur für sensor_data relevant)

**Rate-Limiting:**
- **10 Nachrichten/Sekunde** pro Client
- Überschüssige Nachrichten werden verworfen (Logging im Server)

**Event-Payload-Format:**
Alle Events folgen diesem Schema:
```json
{
  "type": "sensor_data",
  "timestamp": 1234567890,
  "data": {
    // Event-spezifische Daten
  }
}
```

**Event-Payload-Beispiele:**

**sensor_data:**
```json
{
  "type": "sensor_data",
  "timestamp": 1234567890,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 21,
    "value": 23.5,
    "unit": "°C",
    "sensor_type": "SENSOR_TEMP_DS18B20",
    "quality": "good"
  }
}
```

**actuator_status:**
```json
{
  "type": "actuator_status",
  "timestamp": 1234567890,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 5,
    "value": 0.5,
    "is_active": true,
    "last_command": "PWM"
  }
}
```

**logic_execution:**
```json
{
  "type": "logic_execution",
  "timestamp": 1234567890,
  "data": {
    "rule_id": "uuid-here",
    "rule_name": "Temperature Alert",
    "trigger_reason": "Sensor ESP_12AB34CD:GPIO21 value 25.5 > 25.0",
    "success": true,
    "actions_executed": [
      {
        "type": "actuator",
        "esp_id": "ESP_ABCDEF12",
        "gpio": 10,
        "command": "ON"
      }
    ]
  }
}
```

**esp_health:**
```json
{
  "type": "esp_health",
  "timestamp": 1234567890,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "uptime": 86400,
    "heap_free": 150000,
    "wifi_rssi": -65,
    "health_status": "healthy"
  }
}
```

**esp_status:**
```json
{
  "type": "esp_status",
  "timestamp": 1234567890,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "status": "online",
    "last_seen": 1234567890
  }
}
```

**Thread-Safe Broadcast:**
- Server verwendet `broadcast_threadsafe()` für MQTT-Callback-Invokationen
- Events werden asynchron an alle subscribed Clients gesendet

---

## 7. State-Management (Pinia Stores)

### 7.1 authStore
**Zweck:** Authentifizierung und User-Session

**State:**
- `user: null | User`
- `token: string | null`
- `isAuthenticated: boolean`

**Actions:**
- `login(username, password)`
- `logout()`
- `refreshToken()`

### 7.2 espStore
**Zweck:** ESP-Geräteverwaltung

**State:**
- `devices: ESPDevice[]`
- `selectedDevice: ESPDevice | null`
- `deviceStatus: Map<esp_id, DeviceStatus>`
- `healthMetrics: Map<esp_id, HealthMetrics>` - Uptime, Heap-Free, WiFi-RSSI
- `deviceHealthScores: Map<esp_id, number>` - Berechneter Health-Score (0-100)

**Actions:**
- `fetchDevices(filters?)` - Mit Pagination, Filtern (zone_id, status, hardware_type)
- `fetchDeviceDetails(esp_id)` - Mit sensor_count, actuator_count
- `fetchDeviceHealth(esp_id)` - Health-Metriken abrufen
- `registerDevice(deviceData)` - Erfordert Operator-Rolle
- `updateDevice(esp_id, updateData)` - Inkl. Zone-Zuordnung
- `restartDevice(esp_id, delaySeconds?, reason?)`
- `resetDevice(esp_id, preserveWifi?, confirm)` - Factory-Reset
- `assignKaiser(esp_id, kaiser_id)` - Kaiser-Zuordnung
- `updateDeviceStatus(esp_id, status)` - Via WebSocket
- `updateHealthMetrics(esp_id, metrics)` - Via WebSocket (esp_health Event)

**Getters:**
- `onlineDevices`
- `offlineDevices`
- `devicesByZone(zone_id)` - Gruppiert nach zone_id
- `masterZoneDevices` - Devices mit is_zone_master=true
- `devicesWithHealthStatus(status)` - Filter nach health_status
- `calculateHealthScore(esp_id)` - Berechnet Score aus Metriken

### 7.3 sensorStore
**Zweck:** Sensor-Konfiguration und Daten

**State:**
- `configs: SensorConfig[]`
- `currentValues: Map<esp_id+gpio, SensorValue>`
- `historicalData: Map<esp_id+gpio, SensorDataPoint[]>`
- `sensorStats: Map<esp_id+gpio, SensorStats>` - Min/Max/Avg/StdDev

**Actions:**
- `fetchConfigs(filters?)` - Mit Pagination, Filtern (esp_id, sensor_type, enabled)
- `createConfig(esp_id, gpio, config)` - Erfordert Operator-Rolle
- `updateConfig(esp_id, gpio, config)` - Erfordert Operator-Rolle
- `deleteConfig(esp_id, gpio)` - Erfordert Operator-Rolle
- `fetchHistoricalData(esp_id, gpio, timeRange, filters?)` - Mit Quality-Filter
- `fetchSensorStats(esp_id, gpio, timeRange)` - Statistiken abrufen
- `updateCurrentValue(esp_id, gpio, value)` - Via WebSocket (sensor_data Event)

**Getters:**
- `sensorsByESP(esp_id)`
- `sensorsByZone(zone_id)` - Über ESP zone_id aggregiert
- `sensorsWithWarnings` - Basierend auf threshold_min/max
- `sensorsByType(sensor_type)`
- `getLatestValue(esp_id, gpio)`

### 7.4 actuatorStore
**Zweck:** Actuator-Konfiguration und Steuerung

**State:**
- `configs: ActuatorConfig[]`
- `states: Map<esp_id+gpio, ActuatorState>`
- `commandHistory: Map<esp_id+gpio, CommandHistoryEntry[]>`
- `emergencyStopActive: boolean`
- `emergencyStopReason: string | null`

**Actions:**
- `fetchConfigs(filters?)` - Mit Pagination, Filtern (esp_id, actuator_type, enabled)
- `createConfig(esp_id, gpio, config)` - Erfordert Operator-Rolle
- `updateConfig(esp_id, gpio, config)` - Erfordert Operator-Rolle
- `deleteConfig(esp_id, gpio)` - Sendet OFF-Command vor Löschung, erfordert Operator-Rolle
- `sendCommand(esp_id, gpio, command, value?, duration?)` - Erfordert Operator-Rolle, server-seitige Validierung
- `emergencyStop(esp_id?, gpio?, reason)` - Global, ESP-spezifisch oder GPIO-spezifisch
- `fetchCommandHistory(esp_id, gpio, limit?)` - Command-History abrufen
- `updateState(esp_id, gpio, state)` - Via WebSocket (actuator_status Event)

**Getters:**
- `actuatorsByESP(esp_id)`
- `activeActuators` - Aktoren mit is_active=true
- `actuatorsByZone(zone_id)` - Über ESP zone_id aggregiert
- `actuatorsByType(actuator_type)`
- `getCurrentValue(esp_id, gpio)`

### 7.5 logicStore
**Zweck:** Cross-ESP-Automation Rules (UI-State, keine Rule-Evaluation)

**Wichtig:** Dieser Store hält nur UI-State. Alle Rule-Daten kommen vom Server (Single Source of Truth). Rule-Evaluation läuft ausschließlich auf dem Server.

**State:**
- `rules: LogicRule[]` - **Alle Daten vom Server** (`GET /api/v1/logic/rules`)
- `executions: LogicExecution[]` - **Alle Daten vom Server** (`GET /api/v1/logic/execution_history`)
- `executionStats: Map<rule_id, ExecutionStats>` - **Vom Server berechnet** (Success-Rate, Total-Count)
- `availableESPs: ESPDevice[]` - **Für Rule-Builder UI** (vom Server geladen)
- `availableSensors: SensorConfig[]` - **Für Condition-Auswahl** (vom Server geladen)
- `availableActuators: ActuatorConfig[]` - **Für Action-Auswahl** (vom Server geladen)

**Actions:**
- `loadAvailableComponents()` - **Lädt ESPs, Sensoren, Aktoren vom Server für Rule-Builder**
  - `loadESPs()` - `GET /api/v1/esp/devices`
  - `loadSensors()` - `GET /api/v1/sensors/`
  - `loadActuators()` - `GET /api/v1/actuators/`
- `fetchRules(enabled?)` - Mit Pagination, Filter nach enabled (Server-Request)
- `createRule(rule)` - Sendet Rule zum Server, Server validiert final (erfordert Operator-Rolle)
- `updateRule(rule_id, rule)` - Sendet Update zum Server, Server validiert final (erfordert Operator-Rolle)
- `deleteRule(rule_id)` - Sendet Delete-Request zum Server (erfordert Operator-Rolle)
- `toggleRule(rule_id, enabled, reason?)` - Sendet Toggle-Request zum Server
- `testRule(rule_id, mockData)` - **Sendet Test-Request zum Server** (`POST /api/v1/logic/rules/{rule_id}/test`)
  - **Keine lokale Evaluation**: Alle Tests laufen auf dem Server
  - Empfängt Condition-Results und Action-Results vom Server
- `fetchExecutions(rule_id?, filters?)` - Mit Filtern (success, timeRange, Server-Request)
- `addExecution(execution)` - Via WebSocket (logic_execution Event vom Server)

**Getters:**
- `activeRules` - Rules mit enabled=true (berechnet aus Server-Daten)
- `inactiveRules` - Rules mit enabled=false (berechnet aus Server-Daten)
- `rulesByTrigger(trigger_type)` - Nach Trigger-Sensor gruppiert (UI-Helper)
- `rulesByPriority` - Sortiert nach Priority (UI-Helper)
- `getExecutionCount(rule_id)` - **Vom Server** (in Rule-Response enthalten)
- `getSuccessRate(rule_id)` - **Vom Server berechnet** (in Execution-History)
- `getLastExecution(rule_id)` - **Vom Server** (in Rule-Response enthalten)
- `getAvailableSensorsForESP(esp_id)` - UI-Helper für Rule-Builder
- `getAvailableActuatorsForESP(esp_id)` - UI-Helper für Rule-Builder

### 7.6 zoneStore
**Zweck:** Zone-Hierarchie (String-basiert, keine separaten Zone-Models)

**State:**
- `zones: Map<zone_id, ZoneInfo>` - Aggregiert aus ESP-Daten
- `zoneHierarchy: ZoneHierarchyNode[]` - Hierarchische Struktur

**ZoneInfo Structure:**
```typescript
{
  zone_id: string,
  zone_name: string,
  is_master: boolean,  // Basierend auf is_zone_master der ESPs
  esp_count: number,
  sensor_count: number,
  actuator_count: number,
  health_status: string  // Aggregiert aus ESP Health-Status
}
```

**Actions:**
- `fetchZones()` - Aggregiert Zones aus ESP-Liste
- `updateZoneFromESP(esp_id, zone_id, zone_name, is_zone_master)` - Via ESP-Update
- `getZoneInfo(zone_id)` - Zone-Details mit zugeordneten ESPs

**Getters:**
- `masterZones` - Zones mit is_master=true
- `zonesByMaster(master_zone_id)` - Sub-Zones eines Masters (falls Hierarchie vorhanden)
- `zoneHierarchy` - Hierarchische Darstellung
- `getESPsByZone(zone_id)` - ESPs einer Zone
- `getZoneHealthStatus(zone_id)` - Aggregierter Health-Status

### 7.7 dashboardStore
**Zweck:** Dashboard-Konfiguration

**State:**
- `widgets: DashboardWidget[]`
- `layout: GridLayout`

**Actions:**
- `addWidget(widget)`
- `removeWidget(widget_id)`
- `updateWidgetPosition(widget_id, position)`
- `saveLayout()`
- `loadLayout()`

### 7.8 settingsStore
**Zweck:** System-Konfiguration

**State:**
- `systemConfig: SystemConfig`
- `mqttConfig: MQTTConfig`
- `users: User[]`

**Actions:**
- `fetchSystemConfig()`
- `updateSystemConfig(config)`
- `fetchMQTTConfig()`
- `updateMQTTConfig(config)`
- `fetchUsers()`
- `createUser(user)`
- `updateUser(user_id, user)`
- `deleteUser(user_id)`

---

## 8. Composables

### 8.1 useApi.js
**Zweck:** Axios-Instanz mit Interceptors

**Features:**
- JWT-Token automatisch zu Requests hinzufügen
- Token-Refresh bei 401-Errors
- Error-Handling
- Request/Response-Logging (Development)

### 8.2 useWebSocket.js
**Zweck:** WebSocket-Connection-Management mit Subscription-System

**Features:**
- Auto-Reconnect bei Verbindungsabbruch
- Subscription-Management:
  - `subscribe(filters)` - Setzt Filter (types, esp_ids, sensor_types)
  - `unsubscribe(filters?)` - Entfernt Filter oder alle
- Event-Handling:
  - Event-Type-Routing zu entsprechenden Stores
  - Rate-Limiting-Erkennung (10 msg/sec)
- Connection-Status:
  - `isConnected: boolean`
  - `connectionError: Error | null`
  - `lastMessageTime: Date | null`
- Message-Queue bei Disconnect (optional)
- Client-ID-Generierung (UUID)

### 8.3 useSensorData.js
**Zweck:** Sensor-Daten-Handling

**Features:**
- Live-Werte abonnieren via WebSocket (sensor_data Event)
- Historische Daten abrufen:
  - `fetchHistoricalData(esp_id, gpio, timeRange, quality?)`
  - Zeitbereich-Filter, Quality-Filter
- Sensor-Statistiken:
  - `fetchStats(esp_id, gpio, timeRange)`
  - Min/Max/Average/StdDev, Quality-Distribution
- Daten-Formatierung:
  - Unit-Formatierung (z.B. "23.5°C")
  - Timestamp-Formatierung
  - Quality-Badge (good/poor/bad)
- Aggregation:
  - Min/Max/Avg für Zeitbereiche
  - Quality-Distribution

### 8.4 useActuatorControl.js
**Zweck:** Actuator-Steuerung

**Features:**
- Command senden:
  - `sendCommand(esp_id, gpio, command, value?, duration?)`
  - Commands: ON, OFF, PWM (0.0-1.0), TOGGLE
  - Wert-Konvertierung: 0.0-1.0 (Frontend) → 0-255 (ESP32)
- Command-History:
  - `fetchHistory(esp_id, gpio, limit?)`
  - Historie mit Success-Status, Error-Messages
- Status abfragen:
  - `fetchStatus(esp_id, gpio, includeConfig?)`
  - Current Value, is_active, last_command_at
- Emergency-Stop:
  - `emergencyStop(esp_id?, gpio?, reason)`
  - Global, ESP-spezifisch oder GPIO-spezifisch
  - Bestätigungs-Dialog
- Safety-Checks (client-seitig):
  - Value-Range-Validierung (0.0-1.0)
  - Confirmation für kritische Aktionen
- Optimistic UI Updates:
  - Sofortiges Feedback, Rollback bei Fehlern
  - Server validiert via SafetyService

### 8.5 useLogicRules.js
**Zweck:** Logic-Rule-Management (UI-Layer, keine Rule-Evaluation)

**Wichtig:** Diese Composable ist nur für UI-Operationen. Alle Rule-Evaluations laufen auf dem Server.

**Features:**
- **Verfügbare Komponenten laden:**
  - `loadAvailableESPs()` - Lädt ESPs vom Server für Rule-Builder
  - `loadAvailableSensors()` - Lädt Sensoren vom Server für Condition-Auswahl
  - `loadAvailableActuators()` - Lädt Aktoren vom Server für Action-Auswahl
- Rule erstellen/bearbeiten:
  - `createRule(ruleData)` - Sendet Rule zum Server, Server validiert final
  - `updateRule(rule_id, ruleData)` - Sendet Update zum Server, Server validiert final
  - Conditions- und Actions-Builder: Nur UI-Helper, keine Evaluation
- Rule-Validierung:
  - **Client-seitige Schema-Validierung**: Für sofortiges UI-Feedback (JSON-Schema)
  - **Server-seitige Validierung**: Via Pydantic (finale Validierung)
  - Frontend zeigt Validierungsfehler vom Server
- Rule-Testing:
  - `testRule(rule_id, mockData)` - **Sendet Test-Request zum Server**
  - **Keine lokale Evaluation**: Alle Tests laufen auf dem Server
  - Mock-Sensor-Werte: Werden zum Server gesendet
  - Mock-Time: Wird zum Server gesendet
  - Dry-Run-Modus: Server führt Simulation durch
  - Condition-Results und Action-Results: Vom Server empfangen und angezeigt
- Rule-Toggle:
  - `toggleRule(rule_id, enabled, reason?)` - Sendet Request zum Server
  - Enable/Disable: Server führt aus
- Execution-Historie:
  - `fetchExecutions(rule_id?, filters?)` - Lädt Historie vom Server
  - Filter nach Success-Status, Zeitbereich: Server-seitig
  - Success-Rate: Vom Server berechnet
  - Trigger-Reason, Actions-Executed: Vom Server empfangen

### 8.6 useESPManagement.js
**Zweck:** ESP-Verwaltung

**Features:**
- ESP-Liste abrufen
- ESP-Details abrufen
- ESP-Registrierung
- System-Commands

### 8.7 useErrorHandling.js
**Zweck:** Zentrale Fehlerbehandlung

**Features:**
- Error-Notifications (Snackbar)
- Error-Logging
- Retry-Logic
- User-Friendly Error-Messages

---

## 9. Zone-System-Architektur

### 9.1 Architektur-Übersicht

Das Zone-System im AutomationOne Framework ist **String-basiert** und verwendet keine separaten Zone-Models. Zone-Informationen sind direkt im `ESPDevice`-Model gespeichert.

**Kern-Prinzipien:**
- Zones sind **String-Identifiers** (`zone_id`)
- Zone-Hierarchie wird über `zone_id` und `is_zone_master` organisiert
- ESPs können über ESP-Update-Endpoints Zonen zugeordnet werden
- Frontend aggregiert Zone-Informationen aus ESP-Daten

### 9.2 Datenstruktur

**ESPDevice-Model (Server):**
```python
zone_id: Optional[str]         # String-Identifier (z.B. "greenhouse-zone-a")
zone_name: Optional[str]       # Human-readable Name (z.B. "Greenhouse Zone A")
is_zone_master: bool          # Flag für Master-Zones
```

**Hierarchie-Konzept:**
- **Master Zone:** ESP mit `is_zone_master=true` repräsentiert Master-Zone
- **Zone:** Gruppe von ESPs mit gleichem `zone_id`
- **SubZone:** Optional, über zone_id-Naming-Convention (z.B. "greenhouse-zone-a-sensor-1")

### 9.3 Frontend-Implementierung

**Zone-Store (Pinia):**
- Aggregiert Zone-Informationen aus ESP-Liste
- Erstellt `ZoneInfo`-Struktur:
  ```typescript
  {
    zone_id: string,
    zone_name: string,
    is_master: boolean,
    esp_count: number,
    sensor_count: number,
    actuator_count: number,
    health_status: string  // Aggregiert
  }
  ```

**Zone-Verwaltung:**
- **Zone-Zuordnung:** Über `PATCH /api/v1/esp/devices/{esp_id}` mit zone_id/zone_name/is_zone_master
- **Zone-Liste:** Aggregiert aus `GET /api/v1/esp/devices?zone_id={zone_id}`
- **Zone-Hierarchie:** Wird im Frontend aus ESP-Daten abgeleitet

**Zone-Visualisierung:**
- **Zone-Tree-View:** Hierarchische Darstellung über zone_id-Gruppierung
- **Zone-Cards:** Zeigen zugeordnete ESPs, Sensor/Actuator-Counts
- **Master-Zone-Highlighting:** Visuelles Highlighting für is_zone_master=true

### 9.4 Vorteile dieser Architektur

1. **Einfachheit:** Kein separates Zone-Model nötig
2. **Flexibilität:** Zones können dynamisch über ESP-Updates erstellt werden
3. **Skalierbarkeit:** Beliebige Zone-Hierarchien möglich
4. **Konsistenz:** Zone-Informationen immer konsistent mit ESP-Zuordnung

---

## 10. Health-Monitoring

### 10.1 Health-Metriken

Der God-Kaiser Server sammelt Health-Metriken von ESPs via Heartbeat-System:

**Health-Metriken (ESP-Device):**
- `uptime`: Sekunden seit ESP-Start
- `heap_free`: Verfügbarer RAM in Bytes
- `wifi_rssi`: WiFi-Signal-Stärke (dBm, z.B. -65)
- `sensor_count`: Anzahl konfigurierter Sensoren
- `actuator_count`: Anzahl konfigurierter Aktoren

**Health-Status:**
- `healthy`: Alle Metriken im Normalbereich
- `degraded`: Einige Metriken suboptimal
- `unhealthy`: Kritische Metriken außerhalb Normalbereich
- `critical`: System-Funktionalität beeinträchtigt

### 10.2 Health-Score-Berechnung

Frontend berechnet Health-Score (0-100) basierend auf:

1. **Uptime-Score:** 
   - > 7 Tage: 100 Punkte
   - > 1 Tag: 75 Punkte
   - > 1 Stunde: 50 Punkte
   - < 1 Stunde: 25 Punkte

2. **Heap-Free-Score:**
   - > 150KB: 100 Punkte
   - > 100KB: 75 Punkte
   - > 50KB: 50 Punkte
   - < 50KB: 25 Punkte

3. **WiFi-RSSI-Score:**
   - > -50 dBm: 100 Punkte
   - > -65 dBm: 75 Punkte
   - > -80 dBm: 50 Punkte
   - < -80 dBm: 25 Punkte

4. **Gesamt-Score:** Durchschnitt der drei Einzelscores

### 10.3 Health-Monitoring im Frontend

**ESP-Store:**
- `healthMetrics: Map<esp_id, HealthMetrics>`
- `deviceHealthScores: Map<esp_id, number>`
- `updateHealthMetrics(esp_id, metrics)` via WebSocket

**WebSocket-Integration:**
- Subscription auf `esp_health` Event-Type
- Live-Updates bei jedem Heartbeat (alle 60s)

**UI-Komponenten:**
- **Health-Badge:** Farbcodiert (grün/gelb/rot) basierend auf Health-Status
- **Health-Score-Display:** Prozentanzeige mit Tooltip für Details
- **Health-Metrics-Panel:** Detaillierte Ansicht (Uptime, Heap, WiFi)
- **Zone-Health-Aggregation:** Durchschnittlicher Health-Score pro Zone

**API-Endpoint:**
- `GET /api/v1/esp/devices/{esp_id}/health` - Detaillierte Health-Metriken
- Liefert: `uptime`, `heap_free`, `wifi_rssi`, `uptime_formatted`, `health_status`

---

## 11. Wichtige Design-Entscheidungen

### 11.1 Keine direkte MQTT-Verbindung
**Begründung:**
- Server ist Single Source of Truth
- WebSocket ist einfacher zu handhaben als MQTT im Browser
- Server kann Daten aggregieren und filtern
- Bessere Security (keine MQTT-Credentials im Frontend)

### 11.1.1 Server als Single Source of Truth (KRITISCH)
**Architektur-Prinzip:**
- **Alle Daten kommen vom Server**: ESPs, Sensoren, Aktoren, Rules
- **Keine lokale Logik**: Frontend evaluiert keine Rules lokal
- **Keine doppelte Validierung**: Client-Validierung nur für UI-Feedback, Server validiert final
- **Rule-Evaluation ausschließlich auf Server**: Logic Engine läuft als Background-Task
- **Rule-Testing auf Server**: `POST /api/v1/logic/rules/{rule_id}/test` führt Simulation auf Server durch

**Konsequenzen für Logic Builder:**
- Frontend lädt verfügbare Komponenten vom Server (`GET /api/v1/esp/devices`, etc.)
- Rule-Builder zeigt nur verfügbare Sensoren/Aktoren
- Client-seitige Schema-Validierung für sofortiges UI-Feedback
- Finale Validierung und Rule-Evaluation auf dem Server
- Test-Requests werden zum Server gesendet, Ergebnisse werden angezeigt

### 11.2 Optimistic UI Updates
**Begründung:**
- Bessere User Experience (sofortiges Feedback)
- Server validiert und korrigiert bei Fehlern
- Rollback bei Fehlern

### 11.3 Modulare Komponenten
**Begründung:**
- Wiederverwendbarkeit
- Einfacheres Testing
- Bessere Wartbarkeit

### 11.4 Pinia statt Vuex
**Begründung:**
- Vue 3 Standard
- Bessere TypeScript-Unterstützung
- Einfacheres API
- Composition API Integration

### 11.5 Vuetify 3 statt Custom Components
**Begründung:**
- Material Design ist etabliert
- Viele vorgefertigte Komponenten
- Gute Dokumentation
- Responsive Design out-of-the-box

### 11.6 Server-Centric Architecture
**Begründung:**
- Alle Validierung, Safety-Checks, Business-Logic auf Server
- Frontend ist "dumm" - präsentiert nur Daten und UI
- **Keine doppelte Logik**: Keine Rule-Evaluation im Frontend
- **Single Source of Truth**: Alle ESPs, Sensoren, Aktoren, Rules kommen vom Server
- SafetyService validiert alle Actuator-Commands server-seitig
- **Logic-Engine läuft ausschließlich als Background-Task auf Server**
  - Frontend evaluiert keine Rules
  - Rule-Testing via Server-Endpoint (`POST /api/v1/logic/rules/{rule_id}/test`)
  - Execution-History vom Server (`GET /api/v1/logic/execution_history`)
- Pi-Enhanced Processing auf Server (Python-Libraries)

**Logic Builder Architektur:**
- **UI-Komponente**: Nur visueller Editor, keine Rule-Evaluation
- **Verfügbare Komponenten**: Lädt ESPs, Sensoren, Aktoren vom Server
- **Client-Validierung**: JSON-Schema-Validation für sofortiges UI-Feedback
- **Server-Validierung**: Pydantic-Validierung (finale Validierung)
- **Rule-Testing**: Alle Tests laufen auf dem Server, Frontend zeigt nur Ergebnisse

### 11.7 Subscription-basierte WebSocket-Kommunikation
**Begründung:**
- Effiziente Datenübertragung (nur subscribed Events)
- Client-kontrollierte Filterung (types, esp_ids, sensor_types)
- Rate-Limiting schützt vor Überlastung
- Thread-safe Broadcast für MQTT-Callbacks

---

## 12. Migration vom alten Frontend

### 10.1 Übernommene Features
- ✅ Dashboard Builder (Drag & Drop)
- ✅ Zone-System (Hierarchie)
- ✅ Sensor-Visualisierung (Graphen, Gauges)
- ✅ Actuator-Controls (Buttons, Slider)
- ✅ Logic Builder (visueller Editor)
- ✅ Central Data Hub (Pinia Stores)

### 10.2 Entfernte Features
- ❌ Direkte MQTT-Verbindung (ersetzt durch WebSocket)
- ❌ Legacy-Topics (Server verwendet neue Topics)
- ❌ Redundante Komponenten (vereinfacht)
- ❌ Mindmap-View (optional, kann später hinzugefügt werden)

### 10.3 Neue Features
- ✅ WebSocket-Integration
- ✅ Bessere Error-Handling
- ✅ Optimistic UI Updates
- ✅ Mobile-First Design
- ✅ TypeScript-Support (optional)

---

## 13. Testing-Strategie

### 13.1 Unit-Tests
- Composables testen
- Store-Actions testen
- Utility-Funktionen testen

### 13.2 Component-Tests
- Vue-Komponenten testen (Vitest)
- Props-Validation
- Event-Handling

### 13.3 Integration-Tests
- API-Integration testen
- WebSocket-Integration testen
- Store-Integration testen

### 13.4 WebSocket-Integration-Tests
**Zweck:** Testen der WebSocket-Subscription und Event-Handling

**Tests:**
- Connection-Management (Connect, Disconnect, Reconnect)
- Subscription-Mechanismus (subscribe, unsubscribe)
- Event-Type-Routing (sensor_data → sensorStore, etc.)
- Rate-Limiting-Verhalten
- Filter-Funktionalität (esp_ids, sensor_types)
- Thread-Safe Event-Handling

### 13.5 API-Integration-Tests
**Zweck:** Testen der REST API-Integration

**Tests:**
- Alle Endpoints mit tatsächlichen Request/Response-Schemas
- Pagination-Funktionalität
- Filter-Parameter (zone_id, status, etc.)
- Error-Handling (400, 401, 403, 404, 422)
- JWT-Authentication
- Operator-Rolle-Requirement

### 13.6 Logic-Engine-Simulation-Tests
**Zweck:** Testen der Rule-Testing-Funktionalität

**Tests:**
- Rule-Test-Endpoint mit Mock-Daten
- Condition-Evaluation (sensor, time)
- Action-Simulation (dry-run)
- Success-Rate-Berechnung
- Execution-History-Filtering

### 13.7 E2E-Tests (Optional)
- Cypress oder Playwright
- User-Flows testen

---

## 14. Deployment

### 14.1 Build
```bash
npm run build
```
- Output: `dist/` Ordner
- Statische Dateien (HTML, CSS, JS)

### 14.2 Deployment-Optionen

**Option 1: God-Kaiser Server (Empfohlen)**
- Frontend wird vom God-Kaiser Server ausgeliefert
- Nginx oder FastAPI Static-Files
- Gleiche Domain wie API (CORS nicht nötig)

**Option 2: Separater Server**
- Separater Web-Server (Nginx, Apache)
- CORS-Konfiguration nötig
- Separate Domain/Subdomain

**Option 3: CDN**
- Statische Dateien auf CDN
- CORS-Konfiguration nötig

---

## 15. Implementierungs-Hinweise

### 15.1 Wichtige Architektur-Prinzipien

**1. Server-Centric:**
- Alle Validierung, Safety-Checks, Business-Logic auf Server
- Frontend zeigt nur Daten an und sendet Commands
- SafetyService validiert alle Actuator-Commands server-seitig
- Logic-Engine läuft als Background-Task auf Server

**2. Optimistic UI Updates:**
- Frontend zeigt sofort Feedback
- Server validiert und korrigiert bei Fehlern
- Rollback bei Fehlern

**3. Subscription-basiert:**
- WebSocket-Subscriptions für effiziente Updates
- Client kontrolliert welche Events empfangen werden
- Rate-Limiting schützt vor Überlastung

**4. Zone-basiert:**
- Organisation über zone_id Strings (kein separates Zone-Model)
- Zone-Informationen aggregiert aus ESP-Daten
- Hierarchie über is_zone_master Flag

### 15.2 Code-Qualität

- **TypeScript-Support:** Optional, aber empfohlen für bessere Type-Safety
- **Comprehensive Error-Handling:** 
  - Try-Catch für alle async Operations
  - User-Friendly Error-Messages
  - Error-Logging für Debugging
- **Loading-States:** 
  - Loading-Indikatoren für alle async Operations
  - Skeleton-Loaders für bessere UX
- **Retry-Logic:** 
  - Retry bei failed Requests (max 3 Versuche)
  - Exponential Backoff

### 15.3 Performance-Optimierungen

- **Pagination:** 
  - Alle Listen-APIs verwenden Pagination (default: 20 Items)
  - Infinite-Scroll oder "Load More" Buttons
- **Lazy-Loading:** 
  - Lazy-Loading für große Datasets
  - Virtual-Scrolling für lange Listen
- **WebSocket-Rate-Limiting:** 
  - Beachte 10 Nachrichten/Sekunde Limit
  - Throttle/Debounce bei vielen Events
- **Client-seitiges Caching:** 
  - Cache für häufig abgerufene Daten (ESPs, Sensor-Configs)
  - Cache-Invalidation bei Updates

### 15.4 Best Practices

**API-Calls:**
- Verwende immer die `useApi` Composable für konsistente Error-Handling
- JWT-Token wird automatisch zu Requests hinzugefügt
- Token-Refresh bei 401-Errors automatisch

**WebSocket:**
- Verwende `useWebSocket` Composable für Connection-Management
- Setze Subscriptions beim Mount, entferne beim Unmount
- Handle Reconnection automatisch

**State-Management:**
- Verwende Pinia Stores für alle Server-Daten
- Optimistic Updates in Stores vor API-Call
- Rollback bei API-Fehler

**Components:**
- Wiederverwendbare Components (SensorCard, ActuatorCard, etc.)
- Props-Validation mit TypeScript oder Prop-Types
- Emit Events für Parent-Communication

---

## 16. Nächste Schritte

1. **Ordnerstruktur erstellen** (siehe Section 4)
2. **Projekt-Setup** (Vue 3 + Vuetify 3 + Vite)
3. **Phase 1 starten** (Grundlagen)
4. **API-Integration** (Axios + WebSocket)
5. **Erste Komponenten** (ESP-Liste, Sensor-Liste)

---

**Letzte Aktualisierung:** 2025-01-15  
**Version:** 2.0  
**Status:** ✅ Überarbeitet basierend auf Codebase-Analyse

**Changelog v2.0:**
- Detaillierte API-Endpoint-Dokumentation basierend auf tatsächlicher Implementierung
- WebSocket-Subscription-System dokumentiert
- Zone-System-Architektur (String-basiert) dokumentiert
- Health-Monitoring-System dokumentiert
- Logic-Engine-Integration dokumentiert
- State-Management erweitert (Health-Metriken, Command-History, etc.)
- Composables erweitert (Subscription-Management, Stats, History)
- Testing-Strategie erweitert (WebSocket, API-Integration, Logic-Simulation)

