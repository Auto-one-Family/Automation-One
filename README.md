# AutomationOne IoT-Framework

**Modulares, skalierbares IoT-Framework zur dynamischen Steuerung von ESP32-basierten Sensor-/Aktor-Netzwerken mit KI-Integration.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![ESP-IDF](https://img.shields.io/badge/ESP--IDF-Arduino-red.svg)](https://github.com/espressif/arduino-esp32)

---

## 🎯 Vision

Vollständige Kontrolle über beliebig viele ESP32-Geräte mit Arduino-kompatiblen Sensoren (SHT31, DS18B20, pH, EC, etc.) durch **dynamische Konfiguration ohne Code-Änderungen**. Nutzer können Sensoren/Aktoren per Frontend hinzufügen, Cross-ESP-Automationen erstellen und KI-gestützte Vorhersagen erhalten.

### 💡 Kern-Prinzip: Server-First Processing

```
Standard-Workflow (90% der Anwendungen):
┌─────────────┐              ┌──────────────────┐
│   ESP32     │──RAW Data──→ │  God-Kaiser      │
│  (Sensor)   │              │  (Python Libs)   │
│             │←─Processed─  │  (Verarbeitung)  │
└─────────────┘              └──────────────────┘

✅ Keine Libraries auf ESP nötig
✅ Sensoren funktionieren sofort
✅ Komplexe Algorithmen ohne ESP-Limits
```

---

## 📊 Entwicklungsstand

> Dieses Dokument beschreibt die **vollständige Vision** des Systems.
> Hier ist der aktuelle Implementierungsstand:

| Komponente | Status | Details |
|------------|--------|---------|
| **ESP32 Firmware (El Trabajante)** | ✅ Production-Ready | Vollständig implementiert, 41+ Tests, dokumentiert |
| **God-Kaiser Server (El Servador)** | 🚧 In Entwicklung | MQTT-Layer vollständig, REST API in Planung |
| **Frontend (Vuetify)** | 📋 Konzept | Architektur definiert, Implementation geplant |
| **Kaiser-Nodes** | 📋 Konzept | Database Models vorhanden, Implementation nach Server |
| **God Layer** | 📋 Konzept | Plugin-Interface geplant |

### Jetzt nutzbar:
- ✅ ESP32 Firmware mit Sensor/Actuator-Support
- ✅ MQTT-Kommunikation (ESP ↔ Server)
- ✅ Provisioning via Captive Portal
- ✅ Zone-System auf ESP-Seite
- ✅ Umfangreiche Test-Suite (140+ Server-Tests, 41+ ESP-Tests)
- ✅ Sensor-Datenverarbeitung (Pi-Enhanced Mode)
- ✅ Database Layer (PostgreSQL/SQLite)

### In aktiver Entwicklung:
- 🚧 Server REST API Endpoints
- 🚧 Sensor-Library-Loader (pH fertig, 8 weitere geplant)
- 🚧 Cross-ESP Automation Engine
- 🚧 Vuetify Dashboard

### Roadmap:
- 📋 Frontend Dashboard Builder
- 📋 Kaiser Schema-Sync
- 📋 God Layer Plugin-Interface
- 📋 Mobile-optimiertes Frontend
- 📋 Logic Engine für If-Then-Regeln

---

## 🏗️ System-Architektur

### Das Gesamtbild
```
                              ┌─────────────────────────┐
                              │      GOD LAYER          │
                              │  (Optional Plugin)      │
                              │  ML · Predictions       │
                              │  Analytics · Insights   │
                              └───────────┬─────────────┘
                                          │ Liest/Schreibt
                                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       GOD-KAISER SERVER (Raspberry Pi 5)                │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
│  │   FastAPI    │  │     MQTT     │  │  PostgreSQL  │  │   Vuetify   │ │
│  │   REST API   │  │    Broker    │  │   TimeSeries │  │  Frontend   │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘ │
│                                                                         │
│  📊 Alle Daten        🔧 Volle Kontrolle       🎨 User baut eigene UI  │
│  📝 Umfangreiche Logs 🔌 Modular/Plugin-fähig  🔐 Sicher & Industriell │
│  🗂️ Zone-System       ⚡ Echtzeit-Events       🌐 Auch als Webseite    │
└─────────────────────────────────────────────────────────────────────────┘
              │                                           │
              │ MQTT                                      │ Schema-Sync
              ▼                                           ▼
┌──────────────────────────┐                ┌──────────────────────────┐
│     ESP32 AGENTEN        │                │    KAISER (Pi Zero/3)    │
│    "El Trabajante"       │                │    Lightweight Client    │
│                          │                │                          │
│  • Sensor-Rohdaten       │                │  • Lädt User-Schemas     │
│  • Actuator-Steuerung    │                │  • Lokales Dashboard     │
│  • Provisioning          │                │  • Offline-fähig         │
│  • Zone-Zuordnung        │                │  • Skalierung (100+ ESP) │
└──────────────────────────┘                └──────────────────────────┘
```

### Architektur-Prinzipien

| Prinzip | Beschreibung |
|---------|--------------|
| **Server = Single Source of Truth** | Alle Daten, Configs, Logs landen zentral auf dem God-Kaiser |
| **Frontend = Schlüssel** | User konfiguriert seine eigene Oberfläche, Server liefert die Funktionen |
| **Modular & Erweiterbar** | Sensoren, Aktoren, Zonen, Logik - alles dynamisch hinzufügbar/entfernbar |
| **Kaiser = Thin Client** | Holt sich nur die Schemas die er braucht, zeigt User-View |
| **God = Optional Plugin** | KI-Layer kann geladen werden, konsumiert nur Server-Daten |

### Komponenten-Details

#### God-Kaiser Server (Zentrale)
- **Hardware:** Raspberry Pi 5 (oder vergleichbar)
- **Rolle:** Kontrollzentrum, Datenhub, API-Provider, Frontend-Host
- **Verantwortlich für:**
  - Empfang und Speicherung aller ESP-Daten
  - Sensor-Datenverarbeitung mit Python-Libraries
  - Cross-ESP Automationslogik
  - User-Management und Sicherheit
  - Frontend-Bereitstellung (Vuetify)
  - Schema-Verteilung an Kaiser-Nodes

#### ESP32-Agenten (El Trabajante)
- **Hardware:** ESP32-WROOM-32 oder Seeed XIAO ESP32-C3
- **Rolle:** Hardware-Interface, Datensammler, Aktor-Controller
- **Verantwortlich für:**
  - Sensor-Rohdaten lesen und via MQTT senden
  - Actuator-Commands vom Server empfangen und ausführen
  - Provisioning via Captive Portal
  - Zone-Zuordnung speichern

#### Kaiser-Nodes (Skalierung)
- **Hardware:** Raspberry Pi Zero 2W oder Pi 3
- **Rolle:** Lightweight Client, lokales Dashboard, ESP-Gruppierung
- **Verantwortlich für:**
  - User-konfigurierte Schemas vom Server laden
  - Lokale Visualisierung der relevanten Daten
  - Optionale Offline-Fähigkeit
  - Skalierung bei großen Netzwerken (100+ ESPs)

#### God Layer (KI-Plugin)
- **Hardware:** Kann auf Pi 5 laufen oder extern (Cloud, Jetson)
- **Rolle:** Intelligenz-Schicht, Datenanalyse, Vorhersagen
- **Verantwortlich für:**
  - Konsumiert Server-Daten (read-only oder via API)
  - ML-Modelle für Predictions
  - Empfehlungen an User (via Server)
  - Optional: Auto-Actions mit User-Approval

### Kommunikations-Matrix

| Von | Nach | Protokoll | Port | Auth | Zweck |
|-----|------|-----------|------|------|-------|
| ESP32 | God-Kaiser | MQTT | 8883 | User/Pass + mTLS | Sensor-Daten, Status |
| ESP32 | Kaiser | MQTT | 1883 | User/Pass | Lokal (opt.) |
| Kaiser | God-Kaiser | MQTT Bridge | 8883 | mTLS | Message Relay |
| Frontend | God-Kaiser | HTTP REST | 8000 | JWT | CRUD Operations |
| Frontend | God-Kaiser | WebSocket | 8000 | JWT | Live-Daten |
| God-Kaiser | God | HTTP REST | 8001 | API-Key | Daten-Push, Predictions |
| God | God-Kaiser | HTTP REST | 8000 | API-Key | KI-Empfehlungen |

---

## 🚀 Kern-Features

### 1. Dynamische Sensor-/Aktor-Konfiguration
- **Frontend-gesteuert**: Sensoren/Aktoren per UI hinzufügen, keine Firmware-Änderung nötig
- **GPIO Safe-Mode**: Automatische Pin-Validierung, Conflict-Detection
- **Hot-Swap**: Konfiguration zur Laufzeit ändern, ESP neu konfigurieren

### 2. Sensor-Verarbeitung: Pi-Enhanced als Standard

#### **Pi-Enhanced Mode** (STANDARD - 90% der Anwendungen)
- **ESP sendet**: Raw ADC-Werte (analogRead/digitalRead)
- **God-Kaiser verarbeitet**: Mit dynamischen Python-Libraries
- **ESP empfängt**: Verarbeitete Werte zurück
- **Vorteile**: 
  - ✅ Sofort einsatzbereit - funktioniert ab Sekunde 1
  - ✅ Komplexe Algorithmen möglich (Kalman-Filter, Temperatur-Kompensation)
  - ✅ Zentrale Updates - keine ESP-Neuflashung nötig
  - ✅ ESP-Flash bleibt frei
- **Setup**: Null - funktioniert ohne Konfiguration

#### **OTA Library Mode** (OPTIONAL - 10% Power-User)
- **User wählt explizit**: "Library auf ESP installieren"
- **ESP lädt einmalig**: C++-Library vom Server (~30s, Gzip, CRC32-validiert)
- **ESP verarbeitet**: Lokal auf dem Chip
- **Vorteile**: 
  - ✅ Offline-fähig (funktioniert ohne Server-Verbindung)
  - ✅ Schnellere Response (keine Server-Roundtrip)
  - ✅ Weniger MQTT-Traffic
- **Nachteile**:
  - ⚠️ ESP-Flash-Verbrauch (~15KB pro Library)
  - ⚠️ Setup-Zeit (Download 10-30s)
  - ⚠️ Updates mühsamer (jeder ESP einzeln)
  
**Standard-Empfehlung**: Pi-Enhanced Mode (einfach, flexibel, sofort bereit)

### 3. Cross-ESP Automation Engine
- **User-definierte Regeln**: `IF ESP1.Sensor(GPIO4) > 25°C THEN ESP2.Actuator(GPIO5) = ON`
- **Multi-Sensor-Trigger**: `IF (ESP1.pH < 6.0 AND ESP2.Temp > 30) THEN ...`
- **Zeit-Constraints**: Regeln nur zu bestimmten Zeiten aktiv
- **Safety-Limits**: Cooldown, Max-Runtime, Frequency-Limits

### 4. KI-Integration (God Layer)
- **Modulare Plugins**: Dynamisch ladbare KI-Module (TensorFlow, Scikit-Learn)
- **Predictions**: God analysiert Sensor-Daten, sendet Empfehlungen
- **Auto-Action**: User kann Auto-Execution aktivieren (mit Approval-Workflow)
- **Feedback-Loop**: Rejected Predictions → Training-Data für Model-Verbesserung

### 5. Skalierbarkeit via Kaiser-Nodes
- **Load-Balancing**: Kaiser übernehmen Gruppen von ESPs
- **Local Caching**: Häufig genutzte Sensor-Libraries lokal gespeichert
- **Autonomous Operation**: Kaiser kann bei God-Kaiser-Ausfall autonom arbeiten
- **Zero-Config**: Kaiser erben Konfiguration vom God-Kaiser

---

## 📂 Projektstruktur

```
Auto-one/
├── El Trabajante/                    # 🔧 ESP32 Firmware (84 Dateien)
│   ├── src/
│   │   ├── core/                     # State Machine, Main Loop, Application
│   │   ├── drivers/                  # GPIO, I2C, OneWire, PWM
│   │   ├── services/
│   │   │   ├── communication/        # MQTT, HTTP, WebServer, Discovery
│   │   │   ├── sensor/               # Manager, Factory, Drivers (pH, Temp, etc.)
│   │   │   ├── actuator/             # Manager, Drivers (Pump, Valve, PWM)
│   │   │   └── config/               # ConfigManager, StorageManager
│   │   ├── utils/                    # Logger, TimeManager, DataBuffer
│   │   ├── models/                   # Sensor/Actuator Types, System State
│   │   ├── error_handling/           # ErrorTracker, CircuitBreaker
│   │   └── config/hardware/          # XIAO ESP32-C3, ESP32 Dev Board
│   ├── platformio.ini                # Build Config (ESP32-WROOM, XIAO C3)
│   └── README.md                     # ESP32-spezifische Doku
│
├── El Servador/                      # 🌐 God-Kaiser Server (127 Dateien)
│   ├── god_kaiser_server/
│   │   ├── src/
│   │   │   ├── core/                 # Config, Security, Logging, Exceptions
│   │   │   ├── api/v1/               # REST Endpoints (9 Module)
│   │   │   ├── services/             # Business Logic (11 Services)
│   │   │   ├── mqtt/                 # Client, Subscriber, Publisher, Handlers
│   │   │   ├── websocket/            # Real-time Manager
│   │   │   ├── db/
│   │   │   │   ├── models/           # SQLAlchemy Models (9 Tabellen)
│   │   │   │   └── repositories/     # Repository Pattern (10 Repos)
│   │   │   ├── sensors/
│   │   │   │   ├── library_loader.py # Dynamic Import (importlib)
│   │   │   │   └── sensor_libraries/active/ # 9 Sensor-Typen
│   │   │   ├── schemas/              # Pydantic DTOs (10 Schemas)
│   │   │   └── utils/                # MQTT, Time, Data, Network Helpers
│   │   ├── scripts/                  # DB Init, Backup, Certificates, Migration
│   │   ├── tests/                    # Unit, Integration, E2E
│   │   ├── docs/                     # Architecture, API, MQTT Topics, Security
│   │   ├── alembic/                  # Database Migrations
│   │   └── pyproject.toml            # Poetry, FastAPI, SQLAlchemy, Paho-MQTT
│   └── README.md                     # Server-spezifische Doku
│
├── README.md                         # 📖 Diese Datei (Master-Dokumentation)
└── .gitignore                        # Git Ignore Rules
```

---

## 🔧 Technologie-Stack

### ESP32 Firmware (El Trabajante)
| Komponente | Technologie | Zweck |
|------------|-------------|-------|
| Framework | Arduino (ESP-IDF) | Hardware-Abstraktion |
| Build System | PlatformIO | Multi-Board-Support |
| MQTT Client | PubSubClient | ESP ↔ God-Kaiser Kommunikation |
| HTTP Client | HTTPClient (Arduino) | Library-Download, Pi-Enhanced |
| Storage | NVS (ESP32) | Config-Persistenz (encrypted) |
| WiFi | WiFiManager | AP-Mode Config-Portal |
| I2C | Wire.h | SHT31, BMP280, etc. |
| OneWire | DallasTemperature | DS18B20 Temp-Sensoren |
| PWM | ledcWrite | Aktor-Steuerung (0-255) |

### God-Kaiser Server (El Servador)
| Komponente | Technologie | Zweck |
|------------|-------------|-------|
| Web Framework | FastAPI 0.104+ | REST API, WebSocket |
| ORM | SQLAlchemy 2.0 | Database Abstraction |
| Database | PostgreSQL (Prod) / SQLite (Dev) | Persistenz |
| MQTT Broker | Mosquitto | TLS, mTLS, ACL |
| MQTT Client | Paho-MQTT | Pub/Sub, QoS 1/2 |
| Validation | Pydantic 2.5+ | Request/Response DTOs |
| Auth | python-jose + passlib | JWT, bcrypt |
| Migration | Alembic | Schema Versioning |
| Dynamic Import | importlib | Sensor-Library-Loader |
| Async | asyncio + asyncpg | Non-blocking I/O |

### Frontend (Vuetify 3)

Das Frontend ist der **"Schlüssel"** zum System - der User konfiguriert hier seine individuelle Oberfläche.

| Feature | Beschreibung |
|---------|--------------|
| **Dashboard Builder** | User erstellt eigene Dashboards mit Drag & Drop |
| **Sensor-Widgets** | Live-Werte, Graphen, Gauges - frei kombinierbar |
| **Actuator-Controls** | Buttons, Slider, Schedules - direkt im Dashboard |
| **Zone-Visualisierung** | Hierarchische Ansicht aller Geräte und Bereiche |
| **Logic Builder** | Visuelle Erstellung von If-Then-Regeln |
| **User-Schemas** | Exportierbar für Kaiser-Nodes |

**Technologie:**
- Framework: Vue 3 + Vuetify 3
- State: Pinia
- Charts: Apache ECharts / Chart.js
- Realtime: WebSocket
- Build: Vite

**Deployment:**
- Läuft direkt auf God-Kaiser Server
- Erreichbar als Webseite im lokalen Netz
- Optional: Reverse Proxy für Internet-Zugang

---

## 🔐 Sicherheitskonzept

### Authentifizierungs-Ebenen

#### 1. **Frontend → God-Kaiser (JWT)**
```
POST /api/auth/login
→ JWT Token (24h gültig)
→ Alle Requests: Authorization: Bearer {token}
```

#### 2. **MQTT Credentials (User-konfigurierbar)**
```
POST /api/auth/mqtt/configure
→ Username/Password global für alle ESPs
→ Mosquitto: bcrypt-hashed passwords
→ Optional: allow_anonymous=true (Initial)
```

#### 3. **TLS/mTLS**
```
God-Kaiser Mosquitto: Server-Cert (obligatorisch)
Kaiser Bridge: Client-Cert (mTLS, obligatorisch)
ESPs: Optional (Performance vs. Security)
```

#### 4. **God ↔ God-Kaiser (API-Keys)**
```
Statische Keys in .env
Keine Rotation (manuell bei Kompromittierung)
```

### Zertifikats-Hierarchie
```
CA (Root Certificate)
├── Server-Cert (God-Kaiser Mosquitto)
├── Client-Cert 1 (Kaiser 1)
├── Client-Cert 2 (Kaiser 2)
└── ...
```

---

## 📡 Datenfluss-Szenarien

### Szenario A: Sensor-Reading (Realtime) - Pi-Enhanced Mode (Standard)
```
1. ESP32 liest Sensor RAW (analogRead/digitalRead)
2. ESP32 → MQTT publish RAW → kaiser/god/esp/{id}/sensor/{gpio}/data
3. God-Kaiser empfängt, validiert Payload (JSON Schema)
4. God-Kaiser lädt Sensor-Config aus DB
5. God-Kaiser verarbeitet RAW mit Python Sensor-Library (dynamic import)
6. God-Kaiser speichert RAW + Processed in sensor_data Tabelle
7. God-Kaiser sendet Processed zurück → ESP32 (optional)
8. God-Kaiser sendet an Logic Engine (Cross-ESP-Evaluierung)
9. God-Kaiser → WebSocket broadcast → Frontend
10. Latency: ~50ms End-to-End

Hinweis: Bei OTA Library Mode (optional) verarbeitet ESP lokal,
         sendet direkt Processed-Werte (Schritt 5 entfällt).
```

### Szenario B: Actuator-Command
```
1. Frontend → POST /api/actuators/{esp_id}/{gpio}/command
2. God-Kaiser validiert (Safety-Constraints, GPIO-Availability)
3. God-Kaiser prüft Cross-ESP-Logic-Konflikte
4. God-Kaiser → MQTT publish → kaiser/god/esp/{id}/actuator/{gpio}/command
5. ESP32 empfängt, aktiviert Hardware (digitalWrite/ledcWrite)
6. ESP32 → MQTT publish → kaiser/god/esp/{id}/actuator/{gpio}/status
7. God-Kaiser updated actuator_states Tabelle
8. God-Kaiser → WebSocket broadcast → Frontend
9. Latency: ~150ms End-to-End
```

### Szenario C: Cross-ESP Automation
```
1. ESP1 → Sensor-Wert → God-Kaiser
2. Logic Engine evaluiert alle aktiven Rules
3. Rule-Match: IF ESP1.Temp > 25°C THEN ESP2.Pump = ON
4. Logic Engine prüft: Cooldown? Frequency-Limit? Time-Constraint?
5. Logic Engine → ActuatorService.send_command(ESP2, GPIO5, ON)
6. God-Kaiser → MQTT → ESP2
7. ESP2 aktiviert Pump
8. God-Kaiser logged Execution (audit trail)
9. God-Kaiser → WebSocket → Frontend (Logic-Execution-Event)
10. Latency: ~200ms
```

### Szenario D: KI-Prediction
```
1. God-Kaiser batched Sensor-Daten (alle 5min, configurable)
2. God-Kaiser → POST /api/ingest/sensor_data → God (Port 8001)
3. God führt KI-Modell aus (TensorFlow/PyTorch)
4. God → POST /api/ai/recommendation → God-Kaiser
   Payload: {prediction, confidence, recommended_action}
5. God-Kaiser speichert in ai_predictions Tabelle
6. IF auto_action=enabled: Execute recommended_action
   ELSE: User approval via Frontend
7. God-Kaiser → WebSocket → Frontend (Prediction-Event)
8. User → Approve/Reject
9. IF Rejected: Feedback → God (Training-Data)
10. Latency: 5min (Batch-Interval)
```

---

## 👥 User-Capabilities (Frontend)

### 1. ESP-Verwaltung
- **Registrierung**: Neue ESPs per mDNS/IP-Scan entdecken, registrieren
- **Konfiguration**: WiFi, MQTT-Credentials, Zone-Assignment
- **Überwachung**: Live-Status (online/offline), Heap, RSSI, Uptime
- **Steuerung**: Restart, Factory-Reset, Firmware-Update (OTA)
- **Kaiser-Zuordnung**: ESPs zu Kaiser-Nodes zuweisen

### 2. Sensor-Management
- **Hinzufügen**: GPIO auswählen, Sensor-Typ wählen (pH, Temp, EC, etc.)
- **Verarbeitungs-Modus**: 
  - ◉ Pi-Enhanced (Standard) - Sofort bereit, empfohlen
  - ○ OTA Library (Erweitert) - Optional für Offline-Betrieb
- **Kalibrierung**: 2-Punkt-Kalibrierung (z.B. pH 4.0 / 7.0)
- **Thresholds**: Min/Max/Warning/Critical setzen
- **Intervall**: Sample-Interval (2s-5min), Report-Interval
- **Live-Preview**: Sensor-Werte während Konfiguration anzeigen

### 3. Aktor-Steuerung
- **Manuelle Controls**: ON/OFF-Buttons, PWM-Slider (0-255)
- **Schedules**: Zeit-gesteuerte Aktivierung (Cron-ähnlich)
- **Safety-Limits**: Max-Runtime (z.B. 30min), Cooldown (z.B. 5min)
- **Emergency-Stop**: Globaler Stop aller Aktoren
- **Runtime-Tracking**: Gesamtlaufzeit, Aktivierungsanzahl

### 4. Automations-Builder (Cross-ESP Logic)
- **Drag&Drop-Editor**: Visuelle Regel-Erstellung
- **Trigger**: Sensor-Werte, Zeit, Events
- **Conditions**: AND/OR-Logik, Mehrere Bedingungen
- **Actions**: Aktor-Befehle, Benachrichtigungen
- **Testing**: Simulation vor Aktivierung
- **Priority**: Regeln priorisieren (höher = zuerst)

### 5. KI-Integration
- **Plugin-Galerie**: Verfügbare KI-Module anzeigen
- **Konfiguration**: Dynamisch generierte UI für Plugin-Parameter
- **Predictions-Viewer**: Confidence-Score, Empfehlungen
- **Approval-Workflow**: Manuell Approve/Reject
- **Model-Training**: Re-Training triggern (wenn unterstützt)

### 6. Daten-Visualisierung
- **Freie Diagramme**: User wählt ESP + Sensor + Zeitraum
- **Vergleichsansichten**: Mehrere ESPs in einem Chart
- **Export**: CSV, JSON, PDF
- **Aggregation**: Stündlich/Täglich/Wöchentlich

### 7. System-Administration
- **User-Management**: Accounts, Rollen (Admin/Operator/Viewer)
- **MQTT-Auth-Toggle**: Enable/Disable Global-Credentials
- **TLS-Certs**: Upload/Download Certificates
- **Backup/Restore**: Database-Snapshots
- **Logs**: System-Logs, Error-Logs, Audit-Trail

---

## 🧩 Modularität & Erweiterbarkeit

### Neue Sensor-Typen hinzufügen

#### **Variante 1: Pi-Enhanced (Server-Side) - STANDARD & EMPFOHLEN**
1. Neue Library in `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/`
2. Datei: `new_sensor.py`
3. Funktion: `process_new_sensor(raw_data: int, metadata: dict) -> dict`
4. **Keine ESP-Änderung nötig!** - Funktioniert sofort für alle ESPs

```python
def process_new_sensor(raw_data: int, metadata: dict) -> dict:
    # Raw ADC-Wert → Physikalische Einheit
    voltage = (raw_data / 4095.0) * 3.3
    physical_value = voltage * 10.0  # Beispiel-Formel
    
    return {
        "processed_value": physical_value,
        "unit": "ppm",
        "quality": "good" if 0 < physical_value < 1000 else "poor"
    }
```

**Vorteile**: Zentral gepflegt, sofort verfügbar, komplexe Algorithmen möglich

#### **Variante 2: OTA Library (ESP-Side) - OPTIONAL für Offline-Betrieb**
1. C++-Library entwickeln (z.B. für DFRobot pH-Sensor)
2. Library via Frontend hochladen
3. God-Kaiser komprimiert (Gzip), berechnet CRC32
4. User wählt explizit: "Library auf ESP installieren"
5. ESP lädt via HTTP/MQTT, installiert in Flash
6. ESP nutzt lokale Library (offline-fähig)

**Verwendung**: Nur wenn Offline-Betrieb oder minimale Latenz kritisch sind

### Neue Aktor-Typen hinzufügen
1. Neue Driver-Klasse in `El Trabajante/src/services/actuator/actuator_drivers/`
2. Implementiert `IActuatorDriver` Interface
3. Factory-Pattern registriert neuen Typ automatisch

```cpp
class ServoActuator : public IActuatorDriver {
public:
    bool init(uint8_t gpio) override { /* ... */ }
    bool setValue(float value) override { 
        // value: 0.0-1.0 → Servo-Winkel 0-180°
        int angle = (int)(value * 180);
        servo.write(angle);
        return true;
    }
    // ...
};
```

---

## 🚀 Quick Start

### Prerequisites
- **Hardware**: Raspberry Pi 5 (God + God-Kaiser), ESP32-WROOM/XIAO C3
- **Software**: Python 3.11+, Poetry, PostgreSQL, Mosquitto, PlatformIO

### 1. Clone Repository
```bash
git clone https://github.com/Auto-one-Family/Automation-One.git
cd Automation-One
```

### 2. Setup God-Kaiser Server
```bash
cd "El Servador"
poetry install
cp config/.env.example .env
# Edit .env (Database-URL, JWT-Secret, etc.)

# Database Init
poetry run python god_kaiser_server/scripts/init_db.py
poetry run alembic upgrade head

# Create Admin User
poetry run python god_kaiser_server/scripts/create_admin.py

# Start Server
poetry run uvicorn god_kaiser_server.src.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Setup Mosquitto (MQTT Broker)
```bash
# Install
sudo apt-get install mosquitto mosquitto-clients

# Generate Certificates
cd "El Servador"
poetry run python god_kaiser_server/scripts/generate_certificates.py

# Configure
sudo cp certificates/server.crt /etc/mosquitto/certs/
sudo cp certificates/server.key /etc/mosquitto/certs/
# Edit /etc/mosquitto/mosquitto.conf (Port 8883, TLS)

# Restart
sudo systemctl restart mosquitto
```

### 4. Flash ESP32 Firmware
```bash
cd "El Trabajante"
# Edit platformio.ini (Board: esp32dev / seeed_xiao_esp32c3)

# Build & Upload
pio run -t upload

# Monitor Serial
pio device monitor
```

### 5. ESP32 Provisioning

Neue ESPs werden über ein Captive Portal konfiguriert:

1. **ESP startet im AP-Modus:**
   - **SSID:** `AutoOne-ESP_{MAC}` (z.B. `AutoOne-ESP_AB12CD`)
   - **Passwort:** `provision`
   - **IP:** `192.168.4.1`
   - **Timeout:** 10 Minuten

2. **Konfiguration:**
   ```
   Browser: http://192.168.4.1

   Oder API:
   POST http://192.168.4.1/provision
   {
     "ssid": "MeinWiFi",
     "password": "geheim",
     "server": "192.168.0.100",
     "mqtt_port": 8883
   }
   ```

3. **ESP verbindet sich zum God-Kaiser und ist einsatzbereit**

### 6. Verify Setup
```bash
# Check God-Kaiser Server
curl http://localhost:8000/api/health

# Check MQTT
mosquitto_sub -h localhost -p 8883 --cafile certificates/ca.crt -t "kaiser/god/esp/+/sensor/+/data"

# Check ESP (Serial)
# → Should see: "MQTT Connected", "WiFi Connected"
```

---

## 📊 Database Schema (Wichtigste Tabellen)

### Core Tables
```
esp_devices              # ESP-Registry (esp_id, kaiser_id, health_status)
sensor_configs           # Sensor-Config (esp_id, gpio, sensor_type, calibration)
sensor_data              # Time-Series Data (esp_id, gpio, raw/processed_value)
actuator_configs         # Actuator-Config (esp_id, gpio, actuator_type, safety)
actuator_states          # Current State (esp_id, gpio, state, runtime)
actuator_history         # Audit Trail (command, triggered_by, timestamp)
```

### Logic & Automation
```
cross_esp_logic          # Automation Rules (triggers, conditions, actions)
logic_execution_history  # Execution Log (rule_id, success, execution_time)
```

### Kaiser & Ownership
```
kaiser_registry          # Kaiser Nodes (kaiser_id, ip_address, capabilities)
esp_ownership            # ESP-zu-Kaiser Mapping (esp_id, current_owner)
```

### AI Integration
```
ai_predictions           # God Predictions (prediction_type, confidence, recommended_action)
library_metadata         # OTA Libraries (OPTIONAL - library_name, version, crc32_checksum)
```

### System
```
user_accounts            # Users (username, password_hash, role)
system_config            # Key-Value Config (mqtt_auth_enabled, retention_days)
```

---

## 🧪 Testing

### Unit Tests
```bash
cd "El Servador"
poetry run pytest tests/unit/ -v
```

### Integration Tests
```bash
poetry run pytest tests/integration/ -v
```

### E2E Tests (requires running server + ESP)
```bash
poetry run pytest tests/e2e/ -v
```

---

## 📈 Performance & Skalierung

### God-Kaiser Server
- **Max ESPs**: 500+ (tested with PostgreSQL)
- **Sensor-Data-Throughput**: 10.000 msgs/sec (MQTT QoS 1)
- **WebSocket Clients**: 100 concurrent (Rate-Limit: 10 msg/sec)
- **Database Pool**: 20 connections, 40 overflow
- **Memory**: ~500MB (100 ESPs, 1000 sensors, 7d data)

### Kaiser Relay Nodes
- **Max ESPs per Kaiser**: 100
- **Local MQTT**: No TLS (Latency-Optimierung)
- **Library Cache**: 32GB microSD, Gzip-compressed
- **Offline-Operation**: 24h autonomous (if God-Kaiser down)

### ESP32 Performance
- **Max Sensors**: 10 pro ESP
- **Max Actuators**: 8 pro ESP
- **Heap Usage**: ~150KB (10 sensors, 5 actuators)
- **MQTT Message Size**: Max 1KB (adjustable)
- **Offline Buffer**: 100 Messages (NVS-backed)

---

## 🛡️ Best Practices

### Security
1. **Immer TLS für MQTT verwenden** (außer Kaiser ↔ ESP lokal)
2. **JWT Secret regelmäßig rotieren** (24h Token-Expiry)
3. **MQTT Anonymous-Mode nur für Testing**
4. **Private Keys NIE committen** (git-ignored)
5. **Rate-Limiting aktivieren** (10 req/sec/IP)

### Development
1. **Branch-Strategie**: `main` (stable), `develop` (testing), Feature-Branches
2. **Code-Reviews**: Mindestens 1 Reviewer für Core-Module
3. **Testing**: Unit-Tests für alle Services, Integration für Datenflüsse
4. **Logging**: Structured Logging (JSON), Log-Level per Modul
5. **Documentation**: Code-Kommentare (EN), README (DE/EN)

### Deployment
1. **Staging-Environment**: Separate Pi5 für Testing
2. **Database-Backups**: Täglich, inkrementell, 30d Retention
3. **Monitoring**: Prometheus + Grafana (CPU, Memory, MQTT-Queue)
4. **Alerting**: Slack/Email bei Critical-Errors
5. **Rollback-Strategy**: Database-Migrations rückgängig machbar

---

## 🐛 Troubleshooting

### ESP32 verbindet nicht zu MQTT
```
1. Check Serial Monitor: "WiFi Connected?"
2. Check Mosquitto Logs: sudo journalctl -u mosquitto -f
3. Check Firewall: sudo ufw allow 8883/tcp
4. Test MQTT: mosquitto_sub -h <ip> -p 8883 --cafile ca.crt -t "test"
```

### Sensor-Daten kommen nicht an
```
1. Check MQTT-Topic: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
2. Check sensor_handler.py Logs
3. Check sensor_configs Table: enabled=true?
4. Check Library-Loader: Library für sensor_type vorhanden?
```

### Cross-ESP Logic triggert nicht
```
1. Check logic_engine.py Logs
2. Check cross_esp_logic Table: enabled=true, priority correct?
3. Check Conditions: Richtige Sensor-Werte?
4. Check Time-Constraints: Aktuell innerhalb Zeit-Fenster?
5. Check Cooldown: Last-Execution vor X Sekunden?
```

---

## 📚 Weitere Dokumentation

### Für KI-Agenten (Empfohlen)
- **ESP32 Code-Orientierung**: `.claude/commands/CLAUDE.md` - Vollständige ESP32-Dokumentation
- **Server Code-Orientierung**: `.claude/commands/CLAUDE_SERVER.md` - Vollständige Server-Dokumentation

### Projekt-Dokumentation
- **ESP32 Firmware**: `El Trabajante/README.md`
- **God-Kaiser Server**: `El Servador/README.md`
- **ESP32 Testing**: `El Servador/docs/ESP32_TESTING.md` (Server-orchestrierte Tests)
- **MQTT Protocol**: `El Trabajante/docs/Mqtt_Protocoll.md`
- **ESP32 System Flows**: `El Trabajante/docs/system-flows/`
- **ESP32 API Reference**: `El Trabajante/docs/API_REFERENCE.md`

### Geplante Dokumentation
- **Architecture Deep-Dive**: `El Servador/docs/ARCHITECTURE.md` (⚠️ Zu erstellen)
- **API Reference**: `El Servador/docs/API.md` (⚠️ Zu erstellen)
- **MQTT Topics**: `El Servador/docs/MQTT_TOPICS.md` (⚠️ Zu erstellen)
- **Security**: `El Servador/docs/SECURITY.md` (⚠️ Zu erstellen)
- **Deployment**: `El Servador/docs/DEPLOYMENT.md` (⚠️ Zu erstellen)

---

## 🤝 Contributing

1. Fork Repository
2. Create Feature-Branch: `git checkout -b feature/amazing-feature`
3. Commit Changes: `git commit -m 'Add amazing feature'`
4. Push: `git push origin feature/amazing-feature`
5. Open Pull Request

---

## 📝 License

MIT License - siehe [LICENSE](LICENSE) Datei.

---

## 👥 Authors

**AutomationOne Team**
- Hardware: ESP32 Firmware, Sensor-Integration
- Backend: God-Kaiser Server, MQTT, Database
- AI: God Layer, Predictions, Model-Training

---

## 🙏 Acknowledgments

- **FastAPI**: Moderne Python Web-API
- **PlatformIO**: Multi-Board ESP32-Support
- **Mosquitto**: Robuster MQTT-Broker
- **SQLAlchemy**: ORM mit PostgreSQL
- **Paho-MQTT**: Python MQTT-Client