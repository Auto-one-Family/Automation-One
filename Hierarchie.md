# System-Hierarchie & Architektur - AutomationOne Framework

> **Zweck:** Präzise Systemdokumentation für Entwickler - zeigt aktuelle Implementierung, Vision und Code-Locations  
> **Orientierung:** Basierend auf tatsächlichem Code in `El Trabajante/` und `El Servador/`  
> **Referenz:** `.claude/CLAUDE.md` (ESP32) und `.claude/CLAUDE_SERVER.md` (Server)

---

## 1. System-Hierarchie (4-Layer-Architektur)

**Wichtige Klarstellung:**
- **God-Kaiser fungiert auch als Kaiser:** Steuert ESPs direkt via `kaiser_id="god"` (aktueller Stand)
- **Kaiser-Nodes sind OPTIONAL:** Nur für Skalierung bei vielen ESPs
- **God-Kaiser Hardware-Flexibilität:** Kann auf verschiedenen Plattformen laufen:
  - **Option A:** Pi5 (aktuell) - für lokales Netzwerk, KI extern (Jetson/Cloud)
  - **Option B:** Jetson (geplant) - God-Kaiser mit integrierter KI direkt auf Jetson
- **KI-Integration flexibel:** 
  - Extern (wenn God-Kaiser auf Pi5) - separate Hardware/Cloud
  - Integriert (wenn God-Kaiser auf Jetson) - KI direkt im God-Kaiser
- **System bleibt robust:** Funktioniert von einfach (God-Kaiser + ESPs) bis komplex (mit Kaiser-Nodes, KI, etc.)

### 1.1 Vollständige Hierarchie-Struktur

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: God (KI/Analytics Layer) - OPTIONAL, MODULAR                  │
│ Status: 📋 Geplant                                                       │
│ Rolle: KI/Analytics, Predictions, Model Training                        │
│ Hardware-Optionen:                                                       │
│   - Option A: Separater Jetson/Cloud (wenn God-Kaiser auf Pi5)          │
│   - Option B: Integriert im God-Kaiser (wenn God-Kaiser auf Jetson)    │
│ Kommunikation: HTTP REST API (konfigurierbar)                           │
│ Code-Location: Noch nicht implementiert                                 │
│ Wichtig: Modular hinzufügbar, flexibel je nach God-Kaiser-Hardware    │
└─────────────────────────────────────────────────────────────────────────┘
                            ↕ HTTP REST (geplant, optional)
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: God-Kaiser Server - HARDWARE-FLEXIBEL                          │
│                                                                          │
│ OPTION A: Raspberry Pi 5 (✅ Aktuell implementiert)                    │
│ OPTION B: Jetson Nano/Orin (📋 Geplant - mit integrierter KI)          │
│                                                                          │
│ Status: 🚧 In Entwicklung (MQTT-Layer vollständig, REST API teilweise implementiert)│
│ Rolle: Control Hub, MQTT Broker, Database, Logic Engine, Library Storage │
│ Code-Location: El Servador/god_kaiser_server/                            │
│ Dokumentation: .claude/CLAUDE_SERVER.md                                  │
│                                                                          │
│ WICHTIG: God-Kaiser fungiert auch direkt als Kaiser!                   │
│ - Verwendet kaiser_id = "god" für direkte ESP-Steuerung                │
│ - Kann ESPs direkt ansteuern (ohne Kaiser-Nodes)                        │
│ - Kaiser-Nodes sind optional für Skalierung                            │
│                                                                          │
│ KERN-FUNKTIONEN (alle implementiert):                                   │
│ - Sensor-Datenverarbeitung mit dynamischen Python-Libraries             │
│ - Cross-ESP Automation Engine (Logic Engine)                            │
│ - Actuator-Steuerung mit Safety-Checks                                  │
│ - ESP-Geräteverwaltung und Zone-Management                              │
│ - MQTT-Broker (Mosquitto) mit TLS/mTLS                                  │
│ - Database Layer (PostgreSQL/SQLite)                                   │
│ - WebSocket für Real-time Updates                                       │
│ - Direkte ESP-Steuerung via MQTT (kaiser_id="god")                      │
│                                                                          │
│ KI-INTEGRATION (flexibel je nach Hardware):                             │
│ - Option A (Pi5): KI extern auf Jetson/Cloud (HTTP REST)                │
│ - Option B (Jetson): KI direkt integriert im God-Kaiser                │
└─────────────────────────────────────────────────────────────────────────┘
                            ↕ MQTT (TLS, Port 8883)
        ┌───────────────────┴───────────────────┐
        │                                       │
        ▼                                       ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│ LAYER 3: Kaiser-Nodes    │          │ LAYER 3: Kaiser-Nodes    │
│ (Raspberry Pi Zero/3)    │          │ (Raspberry Pi Zero/3)    │
│ Status: 📋 Geplant        │          │ Status: 📋 Geplant        │
│ Rolle: Relay Node für     │          │ Rolle: Relay Node für     │
│        Skalierung         │          │        Skalierung         │
│ Code-Location: Noch nicht │          │ Code-Location: Noch nicht │
│ implementiert             │          │ implementiert             │
│ Wichtig: OPTIONAL - God-  │          │ Wichtig: OPTIONAL - God-  │
│          Kaiser kann      │          │          Kaiser kann      │
│          ESPs direkt      │          │          ESPs direkt      │
│          steuern          │          │          steuern          │
└──────────────────────────┘          └──────────────────────────┘
        │                                       │
        └───────────────┬───────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │ LAYER 4: ESP32-Agenten│
            │ (WROOM/XIAO C3)       │
            │ Status: ✅ Production-Ready│
            │ Rolle: Sensor-Auslesung, │
            │        Aktor-Steuerung   │
            │ Code-Location: El Trabajante/│
            │ Dokumentation: .claude/CLAUDE.md│
            │ Kommunikation: Direkt mit God-Kaiser│
            │             (kaiser_id="god") oder│
            │             via Kaiser-Node (optional)│
            └───────────────────────┘
```

---

## 2. Aktuelle Implementierung (Was ist fertig?)

### 2.1 God-Kaiser Server - Implementierte Komponenten

#### ✅ Sensor-System (Vollständig implementiert)
- **Dynamischer Library-Loader:** `El Servador/god_kaiser_server/src/sensors/library_loader.py`
  - Lädt Sensor-Processor-Module zur Laufzeit via `importlib`
  - Automatische Discovery aus `sensor_libraries/active/`
  - Singleton-Pattern, Processor-Caching
  - Verfügbare Libraries: pH, Temperature, Humidity, EC, CO2, Flow, Light, Moisture, Pressure
- **Sensor-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
  - Empfängt RAW-Daten von ESPs via MQTT
  - Validiert Payload (Pydantic-Schemas)
  - Ruft Library-Loader auf für Processing
  - Speichert RAW + Processed in Database
  - Triggert Logic-Engine für Cross-ESP-Automation
- **Pi-Enhanced Processing:** Automatisch aktiv wenn `raw_mode: true` im Payload
  - Code-Location: `sensor_handler.py:130-150`
  - Response-Topic: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/processed`
- **Sensor-Service:** `El Servador/god_kaiser_server/src/services/sensor_service.py`
  - Business-Logic für Sensor-Operations
  - CRUD für Sensor-Configs
  - Data-Query mit Aggregation

#### ✅ Actuator-System (Vollständig implementiert)
- **Actuator-Service:** `El Servador/god_kaiser_server/src/services/actuator_service.py`
  - Command-Validierung (Safety-Checks)
  - Value-Validierung (PWM: 0.0-1.0)
  - Emergency-Stop-Prüfung
  - MQTT-Publish zu ESPs
- **Safety-Service:** `El Servador/god_kaiser_server/src/services/safety_service.py`
  - Validierung von Actuator-Commands
  - Integration in Actuator-Service
- **Actuator-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/actuator_handler.py`
  - Empfängt Status-Updates von ESPs
  - Speichert in `actuator_states` Tabelle
  - WebSocket-Broadcast für Frontend

#### ✅ Logic Engine (Cross-ESP-Automation) - Vollständig implementiert
- **Logic-Engine:** `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - Background-Task für Rule-Evaluation
  - Wird getriggert nach Sensor-Daten-Speicherung
  - Unterstützt: Sensor-Threshold-Conditions, Time-Windows, Compound-Logic (AND/OR)
  - Cooldown-Mechanismus für Rules
  - Execution-Logging in Database
- **Logic-Service:** `El Servador/god_kaiser_server/src/services/logic_service.py`
  - Status: 🚧 In Entwicklung (Skeleton vorhanden)
  - Soll CRUD für Logic-Rules bereitstellen
- **Database-Model:** `El Servador/god_kaiser_server/src/db/models/logic.py`
  - `CrossESPLogic` Model für Rules
  - `LogicExecution` Model für Execution-Logs
- **Repository:** `El Servador/god_kaiser_server/src/db/repositories/logic_repo.py`
  - Query-Methoden für Rules
  - Execution-Logging

#### ✅ ESP-Geräteverwaltung (Vollständig implementiert)
- **ESP-Service:** `El Servador/god_kaiser_server/src/services/esp_service.py`
  - ESP-Registration
  - Status-Tracking (online/offline)
  - Zone-Zuordnung
  - Kaiser-Zuordnung (aktuell: `kaiser_id="god"` für direkte God-Kaiser-Steuerung)
  - **Wichtig:** God-Kaiser steuert ESPs direkt via `kaiser_id="god"` (implementiert)
  - Kaiser-Nodes sind optional für Skalierung (geplant)
- **Heartbeat-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
  - Empfängt Heartbeats von ESPs (alle 60s)
  - Auto-Registration deaktiviert (ESPs müssen via REST API registriert werden)
  - Status-Updates (online/offline)
  - Health-Metrics-Logging
- **Database-Model:** `El Servador/god_kaiser_server/src/db/models/esp.py`
  - `ESPDevice` Model mit allen Feldern
  - `kaiser_id` Feld vorhanden (String, optional)
  - **Aktuell:** Alle ESPs verwenden `kaiser_id="god"` (direkte God-Kaiser-Steuerung)
  - **Zukunft:** ESPs können `kaiser_id="kaiser_01"` etc. für Kaiser-Node-Zuordnung erhalten

#### ✅ MQTT-Architektur (Vollständig implementiert)
- **MQTT-Client:** `El Servador/god_kaiser_server/src/mqtt/client.py`
  - Paho-MQTT Client
  - TLS/mTLS Support
  - Connection-Management
- **Subscriber:** `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
  - Thread-Pool für Handler-Execution
  - Handler-Registrierung in `main.py`
  - Topic-Pattern-Matching
- **Publisher:** `El Servador/god_kaiser_server/src/mqtt/publisher.py`
  - QoS-Level-Management
  - Retry-Logic
- **Topic-Builder:** `El Servador/god_kaiser_server/src/mqtt/topics.py`
  - Topic-Generierung mit `kaiser_id` Placeholder
  - Topic-Parsing für Handler
- **Constants:** `El Servador/god_kaiser_server/src/core/constants.py`
  - Default `kaiser_id = "god"`
  - Alle Topic-Patterns definiert

#### ✅ Database-Layer (Vollständig implementiert)
- **Models:** `El Servador/god_kaiser_server/src/db/models/`
  - Alle Models vorhanden: ESP, Sensor, Actuator, Logic, Kaiser, AI, User, etc.
- **Repositories:** `El Servador/god_kaiser_server/src/db/repositories/`
  - Repository-Pattern für alle Entities
  - Async-Support
- **Migrations:** `El Servador/god_kaiser_server/alembic/`
  - Alembic für Schema-Versioning

#### ✅ REST API (In Entwicklung)
- **Endpoints:** `El Servador/god_kaiser_server/src/api/v1/`
  - ESP-Endpoints: `esp.py` (CRUD, Registration)
  - Sensor-Endpoints: `sensors.py`
  - Actuator-Endpoints: `actuators.py`
  - Logic-Endpoints: `logic.py`
  - Kaiser-Endpoints: `kaiser.py` (Skeleton)
  - AI-Endpoints: `ai.py` (Skeleton)
- **Schemas:** `El Servador/god_kaiser_server/src/schemas/`
  - Pydantic-Models für Request/Response-Validation

#### ✅ WebSocket (Vollständig implementiert)
- **WebSocket-Manager:** `El Servador/god_kaiser_server/src/websocket/manager.py`
  - Real-time Updates für Frontend
  - Broadcast-Funktionalität
  - Connection-Management

### 2.2 ESP32-Firmware - Implementierte Komponenten

#### ✅ Vollständig Production-Ready
- **Code-Location:** `El Trabajante/src/`
- **Dokumentation:** `.claude/CLAUDE.md`
- **Status:** ~13.300 Zeilen Code, 41+ Tests, Production-Ready
- **Kern-Module:**
  - SensorManager: RAW-Daten-Auslesung, Pi-Enhanced-Request
  - ActuatorManager: Command-Handling, Safety-Controller
  - MQTTClient: Pub/Sub, Heartbeat, Topic-Building
  - ConfigManager: NVS-Persistenz
  - GPIOManager: Safe-Mode, Pin-Reservation
  - CircuitBreaker: Für Pi-Enhanced-Requests

---

## 3. Vision & Geplante Architektur

### 3.1 God-Kaiser Server - Vollständige Funktionalität

**Kern-Prinzip:** Der God-Kaiser Server enthält ALLE Funktionen, Libraries, Logiken und Features die für ein vollständiges Automatisierungssystem benötigt werden.

**Hardware-Flexibilität:** God-Kaiser Code ist hardware-agnostisch (Python, FastAPI, SQLAlchemy) und kann auf verschiedenen Plattformen laufen:
- **Option A:** Raspberry Pi5 (aktuell) - für lokales Netzwerk, KI extern
- **Option B:** Jetson Nano/Orin (geplant) - God-Kaiser mit integrierter KI direkt auf Jetson

**Wichtig:** God-Kaiser fungiert auch direkt als Kaiser und steuert ESPs via `kaiser_id="god"`. Das System funktioniert vollständig ohne Kaiser-Nodes. Kaiser-Nodes sind nur für Skalierung bei vielen ESPs (100+) optional.

#### ✅ Bereits implementiert:
- Sensor-Libraries (dynamisch ladbar)
- Logic Engine (Cross-ESP-Automation)
- Actuator-Steuerung
- ESP-Verwaltung
- Database-Layer
- MQTT-Infrastruktur
- **Direkte ESP-Steuerung:** God-Kaiser steuert ESPs direkt via `kaiser_id="god"` (implementiert)

#### 📋 Noch zu implementieren:
- **Vollständige REST API:** Alle Endpoints für Frontend-Kommunikation
- **Kaiser-Node-Management:** ESP-Zuordnung und Package-Generation (optional für Skalierung)
- **KI-Plugin-System:** Modulare KI-Integration
  - Extern (wenn God-Kaiser auf Pi5) - separate Hardware/Cloud
  - Integriert (wenn God-Kaiser auf Jetson) - KI direkt im God-Kaiser
- **Hardware-Detection:** Automatische Erkennung ob God-Kaiser auf Pi5 oder Jetson läuft
- **Chat-Interface:** Natural Language Processing für System-Kontrolle
- **Debug Frontend (Vue 3 + Tailwind):** Vollständiges Debug-Dashboard implementiert
- **Production Frontend:** User-Interface für alle Funktionen (geplant)

### 3.2 Kaiser-Nodes - Selektives Download-System (OPTIONAL)

**Wichtig:** Kaiser-Nodes sind OPTIONAL. God-Kaiser kann ESPs direkt steuern (aktueller Stand: `kaiser_id="god"`). Kaiser-Nodes dienen nur der Skalierung bei vielen ESPs.

**Konzept:** Kaiser-Nodes sind zusätzliche Raspberry Pis (Zero 2W oder Pi 3), die sich mit dem God-Kaiser verbinden und nur die benötigten Funktionen herunterladen.

#### Workflow (Geplant):
1. **Initial-Setup:** God-Kaiser richtet alle ESPs ein (direkte Steuerung via `kaiser_id="god"`)
2. **Optional - ESP-Zuordnung:** God-Kaiser weist ESPs an Kaiser-Nodes zu (für Skalierung)
3. **Package-Generation:** God-Kaiser erstellt Package für jeden Kaiser-Node:
   - ESP-Konfigurationen (Sensoren, Aktoren)
   - Benötigte Sensor-Libraries
   - Benötigte Logic-Rules
   - Benötigte KI-Modelle (mit Hardware-Check, nur wenn Hardware ausreicht)
4. **Selektives Download:** Kaiser-Node lädt nur:
   - Libraries die für zugewiesene ESPs benötigt werden
   - Logic-Rules die für zugewiesene ESPs relevant sind
   - KI-Modelle die kompatibel sind (Hardware-Check, optional)
   - Filter-Optionen und Einstellungen für lokale Steuerung

#### Code-Locations (Geplant):
- **Kaiser-Service:** `El Servador/god_kaiser_server/src/services/kaiser_service.py`
  - Status: 📋 Nur Skeleton vorhanden ("PLANNED")
  - Soll enthalten: `assign_esp_to_kaiser()`, `generate_package()`, `sync_config()`
- **Kaiser-Models:** `El Servador/god_kaiser_server/src/db/models/kaiser.py`
  - ✅ Bereits implementiert: `KaiserRegistry`, `ESPOwnership`
  - `KaiserRegistry.zone_ids`: JSON-Array der verwalteten Zonen
  - `KaiserRegistry.capabilities`: JSON mit Hardware-Info (max_esps, features)
- **Kaiser-API:** `El Servador/god_kaiser_server/src/api/v1/kaiser.py`
  - Status: 🚧 Skeleton vorhanden, Endpoints noch nicht vollständig
- **Kaiser-Client:** Noch nicht implementiert
  - Soll sein: `El Kaiser/god_kaiser_client/` (separates Projekt)
  - Verbindet sich mit God-Kaiser via HTTP REST
  - Lädt Packages herunter
  - Lokale MQTT-Bridge zu ESPs

#### Wichtige Architektur-Entscheidungen:
- **God-Kaiser = Single Source of Truth:** Alle Konfigurationen, Libraries, Rules werden zentral verwaltet
- **God-Kaiser fungiert auch als Kaiser:** Steuert ESPs direkt via `kaiser_id="god"` (aktueller Stand)
- **Kaiser-Nodes = Thin Clients (OPTIONAL):** Nur lokale Caches, keine eigenständige Logik
- **MQTT-Bridge:** Kaiser-Nodes können optional lokalen MQTT-Broker haben, bridgen zu God-Kaiser
- **Offline-Fähigkeit:** Kaiser-Nodes können bei God-Kaiser-Ausfall mit gecachten Daten arbeiten (read-only)
- **Skalierung:** Kaiser-Nodes sind nur für große Deployments nötig (100+ ESPs)

### 3.3 KI-Integration - Modulares Plugin-System

**Kern-Prinzip:** KI-Integration ist vollständig modular und optional. Das System funktioniert auch ohne KI komplett robust. 

**Hardware-Flexibilität:** God-Kaiser kann auf verschiedenen Plattformen laufen, KI-Integration passt sich an:
- **Option A:** God-Kaiser auf Pi5 → KI extern (separater Jetson/Cloud)
- **Option B:** God-Kaiser auf Jetson → KI direkt integriert im God-Kaiser

**Konzept:** KI-Module sollen modular integrierbar sein, ähnlich wie Sensor-Libraries. User kann KI-Plugins aktivieren/deaktivieren und Hardware/Cloud-Services hinzufügen. Bei God-Kaiser auf Jetson läuft KI direkt im gleichen Prozess.

#### Architektur (Geplant):
- **Base Plugin Interface:** Alle KI-Plugins erben von `AIPlugin` Base-Klasse
- **Hardware-Flexibles Design:** KI-Integration passt sich an God-Kaiser-Hardware an
  - **Wenn God-Kaiser auf Pi5:** KI extern (separate Hardware/Cloud)
    - Option 1: Edge-Hardware (separater Jetson Nano/Orin, Coral TPU, etc.)
    - Option 2: Cloud-Services (AWS SageMaker, Azure ML, GCP AI Platform, etc.)
    - Option 3: Lokaler Server (separate Maschine mit GPU)
  - **Wenn God-Kaiser auf Jetson:** KI direkt integriert
    - KI-Plugins laufen im gleichen Prozess wie God-Kaiser
    - Nutzt Jetson GPU direkt (CUDA, TensorRT)
    - Keine externe Kommunikation nötig
- **Connection-Manager:** Verwaltet Verbindungen zu externen KI-Services (nur bei Option A)
  - HTTP REST API für Cloud-Services
  - gRPC/WebSocket für Edge-Hardware
  - Circuit Breaker für Robustheit
  - Bei integrierter KI (Jetson): Direkter Funktionsaufruf, kein Connection-Manager nötig
- **Plugin-Registry:** Ähnlich wie `LibraryLoader` für Sensor-Libraries
  - Automatische Discovery aus `ai/plugins/`
  - Hardware-Check vor Aktivierung (detektiert ob auf Jetson oder extern)
  - Konfiguration: Welche Hardware/Cloud für welches Plugin? (nur bei externer KI)
- **Chat-Interface:** Natural Language Processing für User-Commands
  - User kann Logiken per Chat erstellen: "Wenn Temperatur über 25°C, schalte Pumpe ein"
  - System-Einstellungen per Chat ändern
  - Queries: "Zeige alle Sensoren in Zone greenhouse"

#### Code-Locations (Geplant):
- **AI-Service:** `El Servador/god_kaiser_server/src/services/ai_service.py`
  - Status: 📋 Nur Skeleton vorhanden ("PLANNED")
  - Soll enthalten: Plugin-Management, Connection-Pooling, Request-Routing
- **AI-Models:** `El Servador/god_kaiser_server/src/db/models/ai.py`
  - ✅ Bereits implementiert: `AIPredictions` Model
  - Speichert Predictions, Confidence-Scores, Model-Versionen
- **AI-API:** `El Servador/god_kaiser_server/src/api/v1/ai.py`
  - Status: 🚧 Skeleton vorhanden
- **Plugin-System:** Noch nicht implementiert
  - Soll sein: `El Servador/god_kaiser_server/src/ai/`
    - `base_plugin.py`: Base-Klasse für alle Plugins
    - `plugin_registry.py`: Plugin-Discovery und Registry
    - `connection_manager.py`: Verwaltung von Hardware/Cloud-Verbindungen
    - `hardware_validator.py`: Hardware/Service-Kompatibilitäts-Prüfung
    - `chat_interface.py`: NLP für User-Commands
    - `plugins/`: Plugin-Implementierungen
    - `adapters/`: Adapter für verschiedene Backends (Jetson, AWS, Azure, etc.)

#### KI-Funktionen (Geplant):
- **Anomalie-Erkennung:** Erkennt ungewöhnliche Sensor-Werte
- **Predictive Maintenance:** Vorhersage von Hardware-Ausfällen
- **Optimierung:** Empfehlungen für Energie-Einsparung, Ressourcen-Optimierung
- **Natural Language:** Chat-Interface für System-Kontrolle
- **Training:** KI-Modelle können auf Basis gesammelter Daten trainiert werden

#### Hardware/Service-Kompatibilität:

**Option A: God-Kaiser auf Pi5 (aktuell)**
- **God-Kaiser (Pi5):** KI läuft NICHT hier (Hardware-Limit)
  - Pi5 ist für Control Hub, MQTT, Database, Logic Engine optimiert
  - KI-Requests werden an externe Hardware/Cloud weitergeleitet
- **Externe KI-Hardware (Optional):**
  - Separater Jetson Nano/Orin: Für lokale KI-Inferenz
  - Coral TPU: Für TensorFlow Lite Models
  - Andere Edge-AI-Hardware: Modular hinzufügbar
- **Cloud-Services (Optional):**
  - AWS SageMaker, Azure ML, GCP AI Platform
  - Custom API-Endpoints (User-definierbar)
  - Webhook-Integration für externe Services

**Option B: God-Kaiser auf Jetson (geplant)**
- **God-Kaiser (Jetson):** KI läuft direkt integriert
  - Nutzt Jetson GPU direkt (CUDA, TensorRT)
  - KI-Plugins laufen im gleichen Prozess wie God-Kaiser
  - Keine externe Kommunikation nötig
  - Alle God-Kaiser-Funktionen + KI in einem System

**Kaiser-Nodes (beide Optionen):**
- Können optional lokale KI ausführen (wenn Hardware ausreicht)
  - Pi Zero: Sehr limitiert (nur einfache Models)
  - Pi 3: Moderate Möglichkeiten (TensorFlow Lite)
  - Validierung: Vor Download/Installation wird Hardware-Check durchgeführt

**Robustheit (beide Optionen):**
- System funktioniert auch wenn KI-Services ausfallen
  - Circuit Breaker für externe Calls (nur bei Option A)
  - Graceful Degradation: Fallback auf Logik-Engine
  - Optional-Flag: KI-Plugins können deaktiviert werden

### 3.4 Frontend - User-Interface

**Status:** Debug-Dashboard ✅ implementiert, Production Frontend 📋 geplant

#### Debug-Dashboard (✅ Implementiert)
**Technologie:** Vue 3 + TypeScript + Tailwind CSS (Dark Theme)

**Funktionen:**
- **Mock-ESP Management:** Vollständige Simulation echter ESP32-Geräte
- **Database Explorer:** Live-Abfragen aller Tabellen mit Filtern/Pagination
- **MQTT Live-Log:** Real-time MQTT-Nachrichten-Anzeige mit WebSocket
- **System Logs:** Server-Logs mit Filter- und Suchfunktionen
- **User Management:** CRUD-Operationen für Benutzer (Admin-only)
- **Load Testing:** Performance-Tests mit vielen Mock-ESPs
- **System Config:** Key-Value Konfiguration bearbeiten

**Code-Location:** `El Frontend/` (vollständig implementiert)
- Vue 3 + TypeScript + Tailwind CSS
- Pinia für State-Management
- Axios mit JWT-Interceptor
- WebSocket-Client für Real-time Updates
- Dokumentation: `El Frontend/Docs/Developer_Onboarding.md`

#### Production Frontend (📋 Geplant)
**Konzept:** Vollständiges User-Interface für alle System-Funktionen.

**Funktionen (Geplant):**
- **Dashboard Builder:** User erstellt eigene Dashboards mit Drag & Drop
- **Sensor-Widgets:** Live-Werte, Graphen, Gauges
- **Actuator-Controls:** Buttons, Slider, Schedules
- **Zone-Visualisierung:** Hierarchische Ansicht aller Geräte
- **Logic Builder:** Visuelle Erstellung von If-Then-Regeln
- **KI-Chat-Interface:** Chat für System-Kontrolle
- **Kaiser-Node-Manager:** Verwaltung von Kaiser-Nodes und ESP-Zuordnungen

**Integration:**
- **REST API:** Frontend kommuniziert mit God-Kaiser via REST API
- **WebSocket:** Real-time Updates für Live-Daten
- **Authentication:** JWT-basiert (bereits implementiert in Server)

---

## 4. Netzwerk & Remote-Zugriff

### 4.1 Aktuelle Implementierung

#### ✅ Lokales Netzwerk:
- **MQTT:** TLS/SSL konfigurierbar (`MQTT_USE_TLS` in Config)
- **REST API:** FastAPI auf Port 8000 (konfigurierbar)
- **CORS:** Konfigurierbar in `El Servador/god_kaiser_server/src/core/config.py`
  - Default: `localhost:3000`, `localhost:5173` (Development)

#### 📋 Remote-Zugriff (Geplant):
- **VPN-Integration:** Für sicheren Remote-Zugriff
- **Reverse Proxy:** Nginx/Traefik für Internet-Zugang
- **IP-Whitelisting:** Für zusätzliche Sicherheit
- **Rate Limiting:** Für API-Endpoints

### 4.2 Industrietauglichkeit

#### ✅ Bereits implementiert:
- **TLS/SSL:** MQTT mit TLS/mTLS Support
- **JWT-Authentication:** Für REST API
- **Error-Handling:** Umfassendes Error-Tracking
- **Circuit Breaker:** ESP32-seitig für Pi-Enhanced-Requests
- **Health-Checks:** Heartbeat-System für ESPs

#### 📋 Noch zu implementieren:
- **Circuit Breaker Server-seitig:** Für externe Services (God-Layer, Database)
- **Retry-Mechanismen:** Für MQTT-Publish, Database-Operations
- **Monitoring:** System-Metriken, Health-Dashboard
- **Backup-System:** Automatische Database-Backups
- **Graceful Degradation:** System funktioniert auch bei Teilausfällen

---

## 5. Code-Locations für Entwickler

### 5.1 God-Kaiser Server - Wichtige Dateien

| Komponente | Datei | Status | Beschreibung |
|------------|-------|--------|--------------|
| **Sensor-Library-Loader** | `src/sensors/library_loader.py` | ✅ | Dynamisches Laden von Sensor-Processors |
| **Sensor-Handler** | `src/mqtt/handlers/sensor_handler.py` | ✅ | MQTT-Handler für Sensor-Daten |
| **Logic-Engine** | `src/services/logic_engine.py` | ✅ | Cross-ESP-Automation |
| **Actuator-Service** | `src/services/actuator_service.py` | ✅ | Actuator-Steuerung mit Safety-Checks |
| **ESP-Service** | `src/services/esp_service.py` | ✅ | ESP-Geräteverwaltung |
| **Kaiser-Service** | `src/services/kaiser_service.py` | 📋 | Nur Skeleton - ESP-Zuordnung, Package-Generation |
| **AI-Service** | `src/services/ai_service.py` | 📋 | Nur Skeleton - KI-Plugin-Management |
| **Kaiser-Models** | `src/db/models/kaiser.py` | ✅ | Database-Models für Kaiser-Nodes |
| **AI-Models** | `src/db/models/ai.py` | ✅ | Database-Models für KI-Predictions |
| **Config** | `src/core/config.py` | ✅ | Zentrale Konfiguration (HierarchySettings, etc.) |
| **Constants** | `src/core/constants.py` | ✅ | MQTT-Topic-Patterns, Default kaiser_id |
| **MQTT-Topics** | `src/mqtt/topics.py` | ✅ | Topic-Building und Parsing |

### 5.2 ESP32-Firmware - Wichtige Dateien

| Komponente | Datei | Status | Beschreibung |
|------------|-------|--------|--------------|
| **SensorManager** | `src/services/sensor/sensor_manager.cpp` | ✅ | Sensor-Orchestrierung |
| **ActuatorManager** | `src/services/actuator/actuator_manager.cpp` | ✅ | Actuator-Control |
| **MQTTClient** | `src/services/communication/mqtt_client.cpp` | ✅ | MQTT Pub/Sub |
| **System-Types** | `src/models/system_types.h` | ✅ | KaiserZone, MasterZone, SubZone |
| **TopicBuilder** | `src/utils/topic_builder.cpp` | ✅ | MQTT-Topic-Generierung |

**Vollständige ESP32-Dokumentation:** `.claude/CLAUDE.md`

### 5.3 Dokumentation - Wichtige Dateien

| Dokument | Datei | Zweck |
|----------|-------|-------|
| **ESP32-Doku** | `.claude/CLAUDE.md` | Vollständige ESP32-Referenz |
| **Server-Doku** | `.claude/CLAUDE_SERVER.md` | Vollständige Server-Referenz |
| **MQTT-Protokoll** | `El Trabajante/docs/Mqtt_Protocoll.md` | MQTT-Spezifikation |
| **API-Referenz** | `El Trabajante/docs/API_REFERENCE.md` | ESP32-API-Referenz |

---

## 6. Architektur-Prinzipien

### 6.1 God-Kaiser = Single Source of Truth & Direkter Kaiser
- **Alle Konfigurationen:** Werden zentral auf God-Kaiser gespeichert
- **Alle Libraries:** Werden zentral auf God-Kaiser verwaltet
- **Alle Logic-Rules:** Werden zentral auf God-Kaiser definiert
- **Alle Daten:** Werden zentral auf God-Kaiser gespeichert
- **Direkte ESP-Steuerung:** God-Kaiser fungiert auch als Kaiser (`kaiser_id="god"`)
- **Kaiser-Nodes optional:** Nur für Skalierung bei vielen ESPs

### 6.2 Kaiser-Nodes = Thin Clients (OPTIONAL)
- **Keine eigenständige Logik:** Kaiser-Nodes führen nur aus, was God-Kaiser vorgibt
- **Lokale Caches:** Nur für Performance, nicht für Persistenz
- **Selektives Download:** Nur was für zugewiesene ESPs benötigt wird
- **Hardware-Check:** Vor Download von KI-Modellen (nur wenn Hardware ausreicht)
- **Optional:** System funktioniert auch komplett ohne Kaiser-Nodes

### 6.3 Modularität & Erweiterbarkeit
- **Sensor-Libraries:** Dynamisch ladbar, ähnlich wie Plugins
- **KI-Plugins:** Vollständig modular - passt sich an God-Kaiser-Hardware an
  - **Option A (God-Kaiser auf Pi5):** KI extern - User kann Edge-Hardware (Jetson) oder Cloud-Services hinzufügen
  - **Option B (God-Kaiser auf Jetson):** KI direkt integriert - läuft im gleichen Prozess wie God-Kaiser
  - System funktioniert robust auch ohne KI
- **God-Kaiser Hardware-Flexibilität:** Code ist hardware-agnostisch, kann auf Pi5 oder Jetson laufen
- **Logic-Rules:** User-definierbar, keine Code-Änderungen nötig
- **Frontend:** Konfigurierbar durch User (Dashboard Builder)
- **Skalierbarkeit:** Von einfach (God-Kaiser + ESPs) bis komplex (mit Kaiser-Nodes, KI, etc.)

### 6.4 Robustheit & Industrietauglichkeit
- **Error-Handling:** Umfassendes Error-Tracking auf allen Ebenen
- **Circuit Breaker:** Für externe Service-Calls
- **Retry-Mechanismen:** Für kritische Operations
- **Health-Checks:** Für alle System-Komponenten
- **Graceful Degradation:** System funktioniert auch bei Teilausfällen

---

## 7. Entwickler-Workflow

### 7.1 Neue Funktion hinzufügen

**Sensor-Library hinzufügen:**
1. Neue Processor-Klasse in `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`
2. Erbt von `BaseSensorProcessor` (`src/sensors/base_processor.py`)
3. Wird automatisch von `LibraryLoader` entdeckt
4. Code-Location: `.claude/CLAUDE_SERVER.md` → Section 3.1

**KI-Plugin hinzufügen (Geplant):**
1. Neue Plugin-Klasse in `El Servador/god_kaiser_server/src/ai/plugins/`
2. Erbt von `AIPlugin` (Base-Klasse noch zu implementieren)
3. Hardware-Requirements definieren
4. Wird automatisch von Plugin-Registry entdeckt

**Kaiser-Node-Funktionalität (Geplant):**
1. Package-Generation in `KaiserService.assign_esp_to_kaiser()`
2. Identifiziere benötigte Libraries/Rules/Models
3. Erstelle Download-Package
4. Sende an Kaiser-Node via REST API

### 7.2 Code-Orientierung

**Wo finde ich...**
- **Sensor-Processing?** → `src/mqtt/handlers/sensor_handler.py` + `src/sensors/library_loader.py`
- **Logic-Engine?** → `src/services/logic_engine.py`
- **Actuator-Steuerung?** → `src/services/actuator_service.py`
- **ESP-Verwaltung?** → `src/services/esp_service.py`
- **Kaiser-Funktionalität?** → `src/services/kaiser_service.py` (Skeleton)
- **KI-Integration?** → `src/services/ai_service.py` (Skeleton)
- **Database-Models?** → `src/db/models/`
- **REST API?** → `src/api/v1/`
- **MQTT-Handler?** → `src/mqtt/handlers/`

---

## 8. Status-Übersicht

### ✅ Vollständig implementiert:
- ESP32-Firmware (Production-Ready)
- Sensor-Library-System (dynamisch ladbar)
- Logic-Engine (Cross-ESP-Automation)
- Actuator-Steuerung (mit Safety-Checks)
- ESP-Geräteverwaltung
- MQTT-Infrastruktur (TLS/mTLS)
- Database-Layer (PostgreSQL/SQLite)
- WebSocket (Real-time Updates)
- Heartbeat-System
- Debug Frontend (Vue 3 + Tailwind)

### 🚧 In Entwicklung:
- Vollständige REST API Endpoints
- Production User Frontend

### 📋 Geplant:
- Kaiser-Node-Client (selektives Download-System, optional für Skalierung)
- KI-Plugin-System (modulare Integration)
  - Option A: Extern (wenn God-Kaiser auf Pi5) - separate Hardware/Cloud
  - Option B: Integriert (wenn God-Kaiser auf Jetson) - KI direkt im God-Kaiser
- Hardware-Detection (automatische Erkennung Pi5 vs. Jetson)
- Chat-Interface (Natural Language Processing)
- Vollständige Remote-Zugriff-Konfiguration
- Monitoring & Observability
- Backup-System

---

## 9. Wichtige Architektur-Entscheidungen

### 9.1 Kaiser-ID System
- **Aktuell:** Alle ESPs verwenden `kaiser_id = "god"` (Default)
  - **Bedeutung:** God-Kaiser fungiert direkt als Kaiser und steuert ESPs
  - **Implementiert:** God-Kaiser kann ESPs direkt ansteuern (ohne Kaiser-Nodes)
- **Konfiguration:** `El Servador/god_kaiser_server/src/core/config.py:117`
  - `HierarchySettings.kaiser_id` (Default: "god")
  - `HierarchySettings.god_id` (Default: "god_pi_central")
- **Zukunft:** Kaiser-Nodes haben eigene `kaiser_id` (z.B. "kaiser_01")
  - **Optional:** Nur für Skalierung bei vielen ESPs
  - **God-Kaiser bleibt zentral:** Auch mit Kaiser-Nodes bleibt God-Kaiser Single Source of Truth
- **Topic-Pattern:** `kaiser/{kaiser_id}/esp/{esp_id}/...`
  - Aktuell: `kaiser/god/esp/{esp_id}/...` (direkte God-Kaiser-Steuerung)
  - Zukunft: `kaiser/kaiser_01/esp/{esp_id}/...` (via Kaiser-Node, optional)
- **Code-Location:** `src/core/constants.py:46` (DEFAULT_KAISER_ID)

### 9.2 Zone-System

**Architektur-Prinzipien:**
- **Mehrere ESPs pro Zone:** Eine Zone kann mehrere ESPs enthalten (keine UNIQUE-Constraint)
- **SubZones-Ebene:** SubZones gehören zu Sensoren/Aktoren, **nicht direkt zu ESPs**
- **Hierarchie:** Master Zone → Zone → SubZone (Sensor/Actuator-Level)

**Implementierung:**
- **ESP32-seitig:** `El Trabajante/src/models/system_types.h:27`
  - `KaiserZone.zone_id`: Primary Zone Identifier (kann von mehreren ESPs geteilt werden)
  - `KaiserZone.master_zone_id`: Parent Zone
  - `KaiserZone.kaiser_id`: ID des übergeordneten Kaiser-Geräts (default: "god")
- **Server-seitig:** `El Servador/god_kaiser_server/src/db/models/esp.py:67`
  - `ESPDevice.zone_id`: Zone-Zuordnung (mehrere ESPs können gleiche zone_id haben)
  - `ESPDevice.zone_name`: Human-readable Name
- **Kaiser-Nodes:** `KaiserRegistry.zone_ids` (JSON-Array)
  - Liste der Zonen die ein Kaiser-Node verwaltet
- **SubZones:** Definiert in `SensorConfig.subzone_id` und `ActuatorConfig.subzone_id`
  - Gehören zu einzelnen Sensoren/Aktoren, nicht zum ESP
  - Werden in MQTT-Payloads übertragen (sensor_manager.cpp, actuator_manager.cpp)

### 9.3 ESP-ID Format
- **Format:** `ESP_{6-8 hex chars}` (z.B. `ESP_D0B19C` oder `ESP_12AB34CD`)
- **Erlaubte Zeichen:** `A-F`, `0-9` (uppercase hex)
- **Generierung:** Aus MAC-Adresse beim ersten Boot (6 Hex aus letzten 3 MAC-Bytes)
- **Speicherung:** NVS Namespace `system_config`, Key `esp_id`
- **Code-Location (ESP32):** `El Trabajante/src/services/config/config_manager.cpp:299`
- **Code-Location (Server):** `El Servador/god_kaiser_server/src/db/models/esp.py:52`

### 9.4 God-Kaiser Hardware-Flexibilität

**Kern-Prinzip:** God-Kaiser Code ist hardware-agnostisch (Python, FastAPI, SQLAlchemy) und kann auf verschiedenen Linux-Plattformen laufen.

#### Option A: Raspberry Pi 5 (✅ Aktuell implementiert)
- **Hardware:** Raspberry Pi 5
- **Einsatz:** Lokales Netzwerk, kleinere bis mittlere Deployments
- **KI-Integration:** Extern (separater Jetson/Cloud via HTTP REST)
- **Vorteile:** 
  - Günstig, energieeffizient
  - Ausreichend für Control Hub, MQTT, Database, Logic Engine
  - KI kann bei Bedarf auf separater Hardware laufen
- **Code-Location:** `El Servador/god_kaiser_server/` (aktuell)

#### Option B: Jetson Nano/Orin (📋 Geplant)
- **Hardware:** NVIDIA Jetson Nano, Jetson Orin Nano/AGX
- **Einsatz:** Größere Deployments, integrierte KI-Funktionalität
- **KI-Integration:** Direkt integriert (KI-Plugins laufen im gleichen Prozess)
- **Vorteile:**
  - KI direkt im God-Kaiser (keine externe Kommunikation)
  - Nutzt Jetson GPU direkt (CUDA, TensorRT)
  - Alle Funktionen in einem System
  - Höhere Performance für KI-Inferenz
- **Code-Location:** Gleicher Code wie Option A, Hardware-Detection für KI-Integration

#### Hardware-Detection (Geplant)
- **Automatische Erkennung:** System erkennt ob auf Pi5 oder Jetson
- **Code-Location (Geplant):** `El Servador/god_kaiser_server/src/core/hardware_detector.py`
- **KI-Integration passt sich an:**
  - Pi5: KI-Plugins rufen externe Services auf (HTTP REST)
  - Jetson: KI-Plugins nutzen lokale GPU direkt (CUDA/TensorRT)

#### Migration zwischen Optionen
- **Code bleibt gleich:** God-Kaiser Code ist hardware-agnostisch
- **Konfiguration:** Nur Hardware-spezifische Einstellungen anpassen
- **Database:** Kann migriert werden (PostgreSQL/SQLite)
- **KI-Plugins:** Automatische Anpassung je nach Hardware

---

**Letzte Aktualisierung:** 2025-12  
**Version:** 1.1  
**Basiert auf:** Code-Analyse von `El Trabajante/` und `El Servador/` (Stand: 2025-01)

