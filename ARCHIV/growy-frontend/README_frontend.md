# 🌱 Growy Dashboard - Kaiser Edge Controller Dashboard v4.0.0

## 📋 **Systemübersicht**

Das **Growy Dashboard** ist ein Vue.js-basiertes Dashboard für das **ESP32 Advanced Sensor Network System v4.0.0**. Es unterstützt sowohl den **Kaiser Edge Controller** (Raspberry Pi Zero) als auch den **God Pi Central Server** (Raspberry Pi 5) und fungiert als intelligente Steuerungseinheit für ESP32-Geräte mit erweiterten Sensor- und Aktor-Funktionen.

### **🆕 Frontend v4.0.0 Features:**

- **Vue.js ^3.5.13** mit **Vuetify ^3.8.10** für moderne UI
- **Pinia ^3.0.3** State Management für zentrale Datenverwaltung
- **MQTT WebSocket Integration** für Echtzeit-Kommunikation
- **Kaiser Edge Controller Support** mit God Pi Synchronisation
- **Unified Zone Management** für alle Sensoren und Aktoren
- **ESP32 Discovery & Management** mit automatischer Erkennung
- **I2C Sensor Support** für XIAO ESP32-C3
- **Advanced Error Handling** mit automatischer Wiederherstellung
- **Responsive Design** für Desktop und Mobile
- **Real-time Monitoring** mit Live-Updates
- **🆕 Intelligente Sensor-Aggregationen** mit kontextabhängiger Darstellung
- **🆕 Zeitfenster-basierte Analyse** (5 Min, 1h, 24h, alle Daten)
- **🆕 Globale Aggregation-Steuerung** mit Persistierung
- **🆕 Live-Daten vs. Analyse-Trennung** für bessere UX
- **🆕 Multi-View Dashboard** mit Zonen-, ESP- und Sensor-Ansichten
- **🆕 Sensor Registry System** für erweiterte Sensor-Verwaltung
- **🆕 Backend v4.0.0 Kompatibilität** mit Raw Data Support
- **🆕 Warning System** für Sensor-Qualitätsüberwachung
- **🆕 Time Quality Monitoring** für Datenqualitätsbewertung
- **🆕 Hardware/Simulation Mode** Unterscheidung
- **🆕 Erweiterte ID-Konflikt-Behandlung** für alle System-Komponenten
- **🆕 Verbesserte MQTT Topic-Struktur** mit hierarchischer Organisation
- **🆕 Sensor Templates System** für vorkonfigurierte Sensor-Setups
- **🆕 Board-Type-spezifische Konfiguration** für ESP32 DevKit und XIAO C3
- **🆕 I2C Sensor Limit Management** (8 Sensoren pro I2C-Bus)
- **🆕 Template-Validierung** für Board-Kompatibilität
- **🆕 Erweiterte Navigation** mit TopNavigation-Komponente
- **🆕 Mobile-optimierte UI** mit responsive Design
- **🆕 Global Snackbar System** für zentrale Benachrichtigungen
- **🆕 Central Config Store** für zentrale Konfigurationsverwaltung
- **🆕 ESP-Auswahl-System** mit automatischer ESP-Auswahl
- **🆕 I2C-Migration-System** für automatische Konfigurationsmigration
- **🆕 Erweiterte MQTT-Topic-Handling** mit hierarchischer Struktur
- **🆕 Pi Integration Panel** für erweiterte Pi-Funktionalität
- **🆕 System Commands Panel** für System-Steuerung
- **🆕 Warning Configuration Panel** für Warning-Management
- **🆕 Kaiser ID Test Panel** für Kaiser-Funktionalität
- **🆕 Device Simulator** für Test- und Entwicklungszwecke
- **🆕 MQTT Debug Panel** für MQTT-Debugging
- **🆕 Configuration Panel** für System-Konfiguration
- **🆕 Einheitliche Geräteverwaltung** mit DeviceCardBase, GodDeviceCard, KaiserDeviceCard
- **🆕 Automatisches Verschwinden** der unkonfigurierten Box bei leerem Zustand
- **🆕 Sicherheitsfrage** bei Zonen-Löschung mit Bestätigungsdialog
- **🆕 Responsive Box-Größen** basierend auf Anzahl der Geräte
- **🆕 MQTT-Kommunikation** bei Zonenänderungen mit ESP-Synchronisation
- **🆕 Einheitliche ID-Generierung** für alle Gerätetypen
- **🆕 Blink-Animation** bei Zonenwechsel zur visuellen Orientierung
- **🆕 Database Logs System** mit erweiterten Filter- und Export-Funktionen
- **🆕 Geführte Filterführung** für benutzerfreundliche Datenanalyse
- **🆕 Auto-Reload System** mit konfigurierbaren Intervallen
- **🆕 Multi-View Datenanzeige** (Tabelle und Karten)
- **🆕 Chart-Integration** für Datenvisualisierung
- **🆕 CSV-Export** mit konfigurierbaren Einstellungen
- **🆕 ESP-Navigation** mit direkter Verlinkung zu Geräten
- **🆕 Sensor-Icon-System** für intuitive Darstellung
- **🆕 Wert-Farbkodierung** basierend auf Sensor-Typ und Messwerten
- **🆕 Erweiterte MQTT-Store-Funktionalitäten** mit Message-Management
- **🆕 Circuit Breaker Pattern** für robuste HTTP-Kommunikation
- **🆕 Erweiterte Error-Handling-Strategien** mit automatischer Wiederherstellung
- **🆕 Performance-Optimierungen** mit begrenzter Message-Speicherung
- **🆕 Cleanup-Scheduler** für inaktive Geräte
- **🆕 Erweiterte Topic-Utilities** für einheitliche MQTT-Topic-Verwaltung
- **🆕 Kaiser-ID-Persistierung** mit automatischer Topic-Umkonfiguration
- **🆕 God Pi Synchronisation** mit Push-Sync und Command-Execution
- **🆕 Erweiterte Sensor-Registry** mit Warning- und Time-Quality-Management
- **🆕 Pi Integration Store** mit Library-Management und Health-Monitoring
- **🆕 System Commands Store** mit Command-History und Validation
- **🆕 Composable Functions** für wiederverwendbare Logik
- **🆕 Utility Functions** für Zeit-, Storage- und Error-Handling
- **🆕 Debug-Komponenten** für Entwickler-Tools und System-Diagnose
- **🆕 Dashboard-Komponenten** für erweiterte Datenvisualisierung
- **🆕 Settings-Komponenten** für umfassende System-Konfiguration
- **🆕 Actuator Logic Engine** mit Prioritätsmanagement und Konfliktlösung
- **🆕 Central Data Hub Store** für zentrale Datenverwaltung und Store-Koordination
- **🆕 Mindmap Store** für hierarchische Datenvisualisierung
- **🆕 Logical Areas Store** für logische Bereichsverwaltung
- **🆕 Time Range Store** für zeitbasierte Datenfilterung
- **🆕 Zone Registry Store** für Zonenverwaltung
- **🆕 Theme Store** für UI-Theming
- **🆕 Counter Store** für Zähler-Funktionalität
- **🆕 DevicesView** für erweiterte Geräteverwaltung
- **🆕 Enhanced Error Handling** mit verbesserter Fehlerbehandlung
- **🆕 Performance Optimizations** mit optimierter Datenverarbeitung
- **🆕 Tailwind CSS ^3.3.5** für zusätzliche Styling-Flexibilität
- **🆕 Headless UI Vue ^1.7.23** für erweiterte UI-Komponenten
- **🆕 Heroicons Vue ^2.2.0** für moderne Icons
- **🆕 Material Design Icons ^7.4.47** für umfassende Icon-Bibliothek
- **🆕 VueUse Core ^10.11.1** für Vue Composition Utilities
- **🆕 Chart.js ^4.5.0** mit Vue-Chart.js ^5.3.2\*\* für erweiterte Datenvisualisierung
- **🆕 Date-fns ^4.1.0** für moderne Datums- und Zeitfunktionen
- **🆕 Axios ^1.10.0** für robuste HTTP-Kommunikation

## 🚀 **Setup & Installation**

### **📦 Voraussetzungen**

- **Node.js 18+** (empfohlen: Node.js 20 LTS)
- **npm 9+** oder **yarn 1.22+**
- **Git** für Repository-Zugriff
- **Modern Browser** (Chrome 90+, Firefox 88+, Safari 14+)

### **🔧 Installation**

```bash
# Repository klonen
git clone <repository-url>
cd growy-frontend

# Dependencies installieren
npm install

# Environment Setup
cp .env.example .env
# Konfiguriere .env mit deinen Werten

# Development Server starten
npm run dev

# Production Build
npm run build

# Production Server starten
npm run preview
```

### **⚙️ Environment-Konfiguration**

Erstelle eine `.env` Datei basierend auf `.env.example`:

```env
# Server-Konfiguration
VITE_SERVER_URL=http://192.168.1.100:8443
VITE_MQTT_BROKER_URL=ws://192.168.1.100:9001
VITE_MQTT_USERNAME=your_username
VITE_MQTT_PASSWORD=your_password

# Kaiser-Konfiguration
VITE_KAISER_ID=Pi0
VITE_KAISER_SERVER_URL=http://192.168.1.101:80

# Development-Einstellungen
VITE_DEBUG_MODE=true
VITE_LOG_LEVEL=info
```

### **🔧 Konfiguration**

#### **MQTT-Broker Setup**

1. **Broker-URL konfigurieren**: `ws://your-broker-ip:9001`
2. **Credentials einrichten**: Username/Password für MQTT-Authentifizierung
3. **Topic-Struktur**: Automatische Topic-Generierung basierend auf Kaiser-ID

#### **Kaiser Edge Controller**

1. **Kaiser-ID setzen**: Eindeutige ID für den Edge Controller (z.B. "Pi0")
2. **Server-URL**: HTTP-Endpoint für Kaiser-Server
3. **God Pi Verbindung**: Zentrale Server-Verbindung konfigurieren

#### **ESP32-Geräte**

1. **Board-Typ auswählen**: ESP32 DevKit oder XIAO ESP32-C3
2. **I2C-Sensoren konfigurieren**: Maximal 8 Sensoren pro I2C-Bus
3. **Pin-Zuordnung**: Automatische Pin-Validierung basierend auf Board-Typ

### **🔄 Development Workflow**

```bash
# Development mit Hot-Reload
npm run dev

# Code-Qualität prüfen
npm run lint
npm run format

# Tests ausführen
npm run test

# Production Build
npm run build

# Build analysieren
npm run analyze
```

### **🐳 Docker Deployment**

```dockerfile
# Dockerfile
FROM node:20-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

```bash
# Docker Build
docker build -t growy-frontend .

# Docker Run
docker run -p 80:80 growy-frontend
```

### **📱 PM2 Production Setup**

```bash
# PM2 installieren
npm install -g pm2

# Production starten
pm2 start ecosystem.config.cjs

# Status prüfen
pm2 status

# Logs anzeigen
pm2 logs growy-frontend

# Restart
pm2 restart growy-frontend
```

## 🏗️ **Systemarchitektur**

```
┌─────────────────────────────────────────────────────────────┐
│                    God Pi Server (Pi5)                      │
│                    Central Control                          │
│              http://192.168.1.100:8443                     │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP API / WebSocket
                      │
┌─────────────────────▼───────────────────────────────────────┐
│              Kaiser Edge Controller (Pi0)                   │
│              ┌─────────────────────────────────────────┐    │
│              │           Frontend (Vue.js 3.5)         │    │
│              │        Port: 5173 (Dev) / 80 (Prod)     │    │
│              │        Vuetify 3.8 + Pinia State        │    │
│              └─────────────────┬───────────────────────┘    │
│                                │ WebSocket / HTTP
│              ┌─────────────────▼───────────────────────┐    │
│              │           MQTT Broker                   │    │
│              │        Port: 9001 (Frontend)            │    │
│              │        Port: 1883 (ESP32)               │    │
│              └─────────────────┬───────────────────────┘    │
│                                │ MQTT Protocol
│              ┌─────────────────▼───────────────────────┐    │
│              │         ESP32 Network                   │    │
│              │    ┌─────────┬─────────┬─────────┐      │    │
│              │    │ ESP32-1 │ ESP32-2 │ ESP32-N │      │    │
│              │    │ XIAO C3 │ XIAO C3 │ XIAO C3 │      │    │
│              │    └─────────┴─────────┴─────────┘      │    │
│              └─────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 🏗️ **Store-Architektur & State Management**

### **📦 Pinia Stores (15 Stores):**

#### **🔄 MQTT Store (`src/stores/mqtt.js` - 166KB, 4898 Zeilen)**

- **Zentrale MQTT-Verbindungsverwaltung** mit WebSocket-Support
- **ESP Device Management** mit automatischer Erkennung und Status-Tracking
- **Kaiser Edge Controller Integration** mit God Pi Synchronisation
- **ID-Konflikt-Management** für alle System-Komponenten (Kaiser, Master Zone, Subzone, ESP IDs)
- **Topic-Subscription-Management** mit hierarchischer Struktur
- **Connection Quality Monitoring** mit automatischer Wiederherstellung
- **Message Handling** für alle MQTT-Topics mit Performance-Cache
- **Emergency Controls** für Notfall-Steuerung aller ESP-Geräte
- **🆕 Backend v4.0.0 Kompatibilität** mit Raw Data Support, Warning System, Time Quality Monitoring
- **🆕 Hardware/Simulation Mode** Unterscheidung zwischen Hardware- und Simulationsmodus
- **🆕 Performance-Optimierungen** mit begrenzter Message-Speicherung und Cleanup-Scheduler
- **🆕 Kaiser God Pi Integration** mit vollständiger Registrierung und Push-Synchronisation
- **🆕 Autonomous Mode Management** mit autonomer Betriebsmodus und Persistierung

#### **⚙️ Central Config Store (`src/stores/centralConfig.js` - 80KB, 2447 Zeilen)**

- **Zentrale Konfigurationsverwaltung** für alle System-Komponenten
- **ESP-Auswahl-System** mit automatischer ESP-Auswahl
- **URL-Generierung** für verschiedene Protokolle (HTTP, MQTT)
- **Environment Variable Migration** für Backward Compatibility
- **Connection Testing** für alle System-Verbindungen
- **Configuration Persistence** mit localStorage
- **🆕 Einheitliche Geräteverwaltung** mit God, Kaiser und ESP-Devices
- **🆕 Erweiterte Zone-Verschiebung** mit MQTT-Kommunikation
- **🆕 Zone-Löschung** mit Sicherheitsfrage und automatischer ESP-Verschiebung
- **🆕 Einheitliche ID-Generierung** für alle Gerätetypen
- **🆕 Dual-IP-System** für Kaiser Pi0-Server und God-Verbindung
- **🆕 Kaiser-Konfiguration** mit erweiterten Einstellungen für Pi0-Server und God-Connection

#### **🆕 Central Data Hub Store (`src/stores/centralDataHub.js` - 126KB, 3769 Zeilen)**

- **Zentrale Datenverwaltung** und Store-Koordination
- **Performance-Cache** mit optimierter Datenabfrage
- **Store-Referenzen** für sichere Store-Zugriffe
- **System-Status-Verwaltung** mit zentraler Status-Kontrolle
- **Initialisierungsstatus** mit Fehlerbehandlung
- **Optimierte Device-Daten** mit Caching-Mechanismen
- **UI-Konfiguration** mit zentraler Einstellungsverwaltung

#### **🔧 ESP Management Store (`src/stores/espManagement.js` - 71KB, 2105 Zeilen)**

- **ESP Device Configuration** mit Board-Type-spezifischen Einstellungen
- **I2C Sensor Management** mit Limit-Enforcement (8 Sensoren pro Bus)
- **Pin Configuration** für ESP32 DevKit und XIAO C3
- **Template System** für vorkonfigurierte Sensor-Setups
- **I2C Migration System** für automatische Konfigurationsmigration
- **🆕 Board-Type-spezifische Pin-Validierung** mit automatischer Kompatibilitätsprüfung
- **🆕 Erweiterte Subzone-Registrierung** mit automatischer Subzone-Erkennung
- **🆕 TreeView Integration** für hierarchische Darstellung der Zonen-Struktur
- **🆕 Pending Assignment Management** mit Warteschlange für unbestätigte Änderungen
- **🆕 Apply/Confirm Workflow** für sichere Änderungsverwaltung mit Rollback
- **🆕 Template-Validierung** mit automatischer Kompatibilitätsprüfung für Sensor-Templates

#### **🆕 Actuator Logic Store (`src/stores/actuatorLogic.js` - 105KB, 3230 Zeilen)**

- **Actuator Logic Engine** mit Prioritätsmanagement und Konfliktlösung
- **Aktor-Steuerung** für alle ESP-Geräte
- **Prioritätsbasierte Ausführung** für kritische Operationen
- **Konfliktlösung** für gleichzeitige Aktor-Befehle
- **Sicherheitsvalidierung** für alle Aktor-Operationen
- **🆕 Logic-Versionierung** mit Backup und Wiederherstellung
- **🆕 Import/Export-System** für Logic-Konfigurationen
- **🆕 Copy & Adapt Logic** für Kopieren zwischen Geräten

#### **🆕 Dashboard Generator Store (`src/stores/dashboardGenerator.js` - 65KB, 2017 Zeilen)**

- **Dashboard-Generierung** für dynamische Dashboards
- **Chart-Integration** für Datenvisualisierung
- **Multi-View Support** für verschiedene Anzeigemodi
- **Performance-Optimierung** für große Datenmengen

#### **📊 Sensor Registry Store (`src/stores/sensorRegistry.js` - 18KB, 577 Zeilen)**

- **Sensor Data Management** mit Echtzeit-Updates
- **Sensor Aggregation** mit kontextabhängiger Darstellung
- **Warning System** für Sensor-Qualitätsüberwachung
- **Time Quality Monitoring** für Datenqualitätsbewertung
- **Backend v4.0.0 Kompatibilität** mit Raw Data Support
- **🆕 Erweiterte Sensor-Statistiken** mit byType, byEsp und Aktivitäts-Tracking
- **🆕 Warning-Statistiken** mit byType, byEsp und byWarningType
- **🆕 Zeitqualität-Statistiken** für Datenqualitätsbewertung
- **🆕 Hardware/Simulation Mode** Unterscheidung
- **🆕 Raw Value Support** für unverarbeitete Sensordaten
- **🆕 Context und Sensor-Objekt** für erweiterte Metadaten
- **🆕 Erweiterte Indizierung** mit optimierter Suche und Gruppierung
- **🆕 Persistente Speicherung** mit automatischer Backup- und Wiederherstellungsfunktionen

#### **🖥️ Pi Integration Store (`src/stores/piIntegration.js` - 18KB, 608 Zeilen)**

- **Pi Device Management** mit erweiterten Funktionen
- **Library Management** für Sensor-Bibliotheken
- **Pi Sensor Configuration** mit automatischer Synchronisation
- **Health Monitoring** für Pi-Geräte
- **🆕 Pi Health & Statistics** mit erweiterten Gesundheitsdaten
- **🆕 Library Cache Management** für Performance-Optimierung
- **🆕 Pi-Enhanced Sensors & Actuators** mit erweiterten Funktionen
- **🆕 ESP-spezifische URLs** für dynamische URL-Konstruktion pro ESP

#### **⚡ System Commands Store (`src/stores/systemCommands.js` - 6.7KB, 270 Zeilen)**

- **System Command Management** für ESP-Geräte
- **Command History** mit Persistierung
- **Command Validation** für Sicherheit
- **Response Handling** für Command-Feedback
- **🆕 Erweiterte Command-Typen** für System Control, Pi Integration und Emergency
- **🆕 Safety Confirmation** für kritische Befehle
- **🆕 Circuit Breaker Integration** für robuste Kommunikation
- **🆕 Command Logging** mit Timestamp und Success/Failure Tracking
- **🆕 ESP-spezifische URL-Konstruktion** für dynamische Endpunkte

#### **🆕 Database Logs Store (`src/stores/databaseLogs.js` - 12KB, 416 Zeilen)**

- **Database Logs System** mit erweiterten Filter- und Export-Funktionen
- **Geführte Filterführung** für benutzerfreundliche Datenanalyse
- **Auto-Reload System** mit konfigurierbaren Intervallen
- **Multi-View Datenanzeige** (Tabelle und Karten)
- **CSV-Export** mit konfigurierbaren Einstellungen

#### **🆕 Mindmap Store (`src/stores/mindmapStore.js` - 12KB, 395 Zeilen)**

- **Hierarchische Datenvisualisierung** mit Mindmap-Funktionalität
- **Dynamische Strukturen** für komplexe Datenbeziehungen
- **Interaktive Navigation** für Benutzerfreundlichkeit

#### **🆕 Logical Areas Store (`src/stores/logicalAreas.js` - 7.6KB, 259 Zeilen)**

- **Logische Bereichsverwaltung** für Systemorganisation
- **Bereichs-Zuordnung** für ESP-Geräte
- **Hierarchische Strukturen** für komplexe Systeme

#### **🆕 Time Range Store (`src/stores/timeRange.js` - 7.3KB, 243 Zeilen)**

- **Zeitbasierte Datenfilterung** für Analyse-Zwecke
- **Zeitfenster-Management** für verschiedene Zeiträume
- **Performance-Optimierung** für große Zeiträume

#### **🆕 Zone Registry Store (`src/stores/zoneRegistry.js` - 2.5KB, 107 Zeilen)**

- **Zonenverwaltung** für Systemorganisation
- **Zone-Zuordnung** für ESP-Geräte
- **Hierarchische Zonen-Strukturen**

#### **🆕 Theme Store (`src/stores/theme.js` - 5.3KB, 180 Zeilen)**

- **UI-Theming** für verschiedene Design-Modi
- **Theme-Persistierung** für Benutzereinstellungen
- **Responsive Design** für verschiedene Bildschirmgrößen

#### **🆕 Counter Store (`src/stores/counter.js` - 259B, 16 Zeilen)**

- **Zähler-Funktionalität** für System-Metriken
- **Performance-Tracking** für System-Optimierung

**🔧 API-Dokumentation:**

```javascript
// State-Struktur
state: {
  uiConfig: {
    showAggregations: false,
    showCharts: true,
    compactMode: false,
    selectedTimeRange: 5 * 60 * 1000, // 5 Minuten
    mobileOptimized: false
  },
  storeReferences: {
    mqtt: null,
    centralConfig: null,
    espManagement: null,
    sensorRegistry: null,
    piIntegration: null,
    actuatorLogic: null,
    systemCommands: null,
    dashboardGenerator: null,
    databaseLogs: null,
    timeRange: null,
    zoneRegistry: null,
    logicalAreas: null,
    theme: null,
    counter: null
  },
  dataCache: new Map(),
  cacheTimeout: 5 * 60 * 1000, // 5 Minuten
  systemStatus: {
    safeMode: false,
    connectionQuality: 'unknown',
    lastUpdate: null,
    kaiserMode: false,
    emergencyStop: false
  },
  initializationStatus: {
    initialized: false,
    storesLoaded: false,
    error: null,
    lastInitAttempt: null
  }
}

// Store-Getter (sichere Store-Zugriffe)
mqttStore() // MQTT Store mit Error-Handling
centralConfig() // Central Config Store
espManagement() // ESP Management Store
sensorRegistry() // Sensor Registry Store
piIntegration() // Pi Integration Store
actuatorLogic() // Actuator Logic Store
systemCommands() // System Commands Store
dashboardGenerator() // Dashboard Generator Store
databaseLogs() // Database Logs Store
timeRange() // Time Range Store
zoneRegistry() // Zone Registry Store
logicalAreas() // Logical Areas Store
theme() // Theme Store
counter() // Counter Store

// Wichtige Methoden
async initializeStores() // Alle Stores initialisieren
clearCache() // Cache löschen
updateUiConfig(config) // UI-Konfiguration aktualisieren
toggleAggregations() // Aggregationen umschalten
toggleCompactMode() // Kompakt-Modus umschalten
updateSystemStatus() // System-Status aktualisieren
selectEsp(espId) // ESP auswählen
async getOptimizedDeviceData(espId) // Optimierte Gerätedaten abrufen
shouldShowDetail(detailType) // Detail-Anzeige prüfen
handleError(error, context) // Fehler behandeln
async initializeSystem() // System initialisieren
getStore(storeName) // Store nach Namen abrufen
async getDeviceInfo(espId) // Geräteinformationen abrufen
async getSensorData(espId, gpio) // Sensordaten abrufen
async getActuatorData(espId, gpio) // Aktordaten abrufen
updateServerConfig(config) // Server-Konfiguration aktualisieren
setZoneForEsp(espId, zoneName) // Zone für ESP setzen
removeZoneFromEsp(espId) // Zone von ESP entfernen
registerSensor(espId, gpio, sensorData) // Sensor registrieren
updateSensorData(espId, gpio, data) // Sensordaten aktualisieren
async connectToMqtt() // MQTT-Verbindung herstellen
async disconnectFromMqtt() // MQTT-Verbindung trennen
async checkPiStatus() // Pi-Status prüfen
async restartSystem(espId) // System neu starten
async emergencyStopAll() // Notfall-Stopp für alle
```

## 📱 **Views (7 Views)**

### **🏠 HomeView.vue** (15KB, 413 Zeilen)

- **Hauptansicht** mit System-Übersicht und Status-Dashboard
- **Kaiser Edge Controller Integration** mit God Pi Synchronisation
- **ESP Device Overview** mit Live-Status und Quick Actions
- **System Health Monitoring** mit Performance-Metriken
- **Emergency Controls** für Notfall-Steuerung aller Geräte

### **📊 DashboardView.vue** (22KB, 610 Zeilen)

- **Dashboard** mit Sensor-Visualisierungen und Live-Daten
- **Multi-View Datenanzeige** (Tabelle und Karten)
- **Chart-Integration** für Datenvisualisierung
- **Sensor-Aggregationen** mit kontextabhängiger Darstellung
- **Zeitfenster-basierte Analyse** (5 Min, 1h, 24h, alle Daten)

### **🔧 DevelopmentView.vue** (16KB, 445 Zeilen)

- **Entwickler-Tools** und Debug-Panels
- **MQTT Debug Panel** für MQTT-Debugging
- **Device Simulator** für Test- und Entwicklungszwecke
- **Sensor Registry Panel** für Sensor-Verwaltung
- **Kaiser ID Test Panel** für Kaiser-Funktionalität
- **Pi Integration Panel** für erweiterte Pi-Funktionalität
- **System Commands Panel** für System-Steuerung
- **Configuration Panel** für System-Konfiguration

### **⚙️ SettingsView.vue** (12KB, 425 Zeilen)

- **Umfassende System-Konfiguration** für alle Gerätetypen
- **Device Management** mit einheitlicher Geräteverwaltung
- **God Device Card** für zentrale Server-Konfiguration
- **Kaiser Device Card** für Edge Controller-Konfiguration
- **ESP Device Card** für ESP32-Geräte-Konfiguration
- **Enhanced Pin Configuration** für Board-spezifische Einstellungen
- **Zone Management** mit automatischer ESP-Synchronisation

### **🆕 DevicesView.vue** (17KB, 490 Zeilen)

- **Erweiterte Geräteverwaltung** mit einheitlicher Darstellung
- **Device Cards** für alle Gerätetypen (God, Kaiser, ESP)
- **Geräte-Status-Monitoring** mit Live-Updates
- **Geräte-Konfiguration** mit erweiterten Einstellungen
- **Performance-Optimierung** für große Geräteanzahlen

### **🗺️ ZonesView.vue** (4.0KB, 116 Zeilen)

- **Zonen-Verwaltung** mit hierarchischer Darstellung
- **Zone-Erstellung und -Bearbeitung** mit Formular-Integration
- **ESP-Zuordnung** mit automatischer Synchronisation
- **Zone-Navigation** mit direkter Verlinkung zu Geräten

### **📝 ZoneFormView.vue** (8.3KB, 273 Zeilen)

- **Zonen-Formular** für Erstellung und Bearbeitung
- **Validierung** mit automatischer Fehlerbehandlung
- **ESP-Zuordnung** mit Drag & Drop-Funktionalität
- **Template-System** für vorkonfigurierte Zonen-Setups

## 🔧 **Services (API & Utilities)**

### **🌐 apiService.js** (7.9KB, 272 Zeilen)

- **HTTP-Client** mit Axios-Integration
- **Request/Response Interceptors** für Logging und Error-Handling
- **Lazy Store Access Pattern** für konsistente Architektur
- **Circuit Breaker Pattern** für robuste HTTP-Kommunikation
- **ESP Device Management** mit CRUD-Operationen
- **Sensor Processing** mit Batch-Processing
- **Library Management** für Sensor-Bibliotheken
- **Emergency Handling** für Notfall-Szenarien
- **Discovery** für ESP32-Geräte-Erkennung
- **Kaiser Management** mit Registrierung und Status

**🔧 API-Endpunkte:**

```javascript
// Health & Status
getHealth() // System-Gesundheit prüfen
getMQTTStatus() // MQTT-Status abrufen

// ESP32 Device Management
getESPDevices() // Alle ESP-Geräte abrufen
getESPZones() // ESP-Zonen abrufen
getESPDevice(espId) // Spezifisches ESP-Gerät
getESPHealth() // ESP-Gesundheit prüfen
getESPResponseHistory(espId) // ESP-Antwort-Historie

// Safe Mode & GPIO Conflicts
getESPSafeMode(espId) // ESP-Safe-Mode-Status
getSafeModeSummary() // Safe-Mode-Zusammenfassung
getGPIOConflicts(espId, limit) // GPIO-Konflikte

// Sensor Processing
processSensor(sensorData) // Einzelnen Sensor verarbeiten
batchProcessSensors(sensorDataArray) // Batch-Sensor-Verarbeitung

// Library Management
installLibrary(libraryData) // Bibliothek installieren
getLibraryStatus() // Bibliotheks-Status

// Actuator Processing
processActuator(actuatorData) // Aktor verarbeiten

// Emergency Handling
handleEmergency(emergencyData) // Notfall behandeln
getSafeModeStatus() // Safe-Mode-Status

// Discovery
getESP32Discovery() // ESP32-Erkennung

// Kaiser Management
registerKaiser(kaiserData) // Kaiser registrieren
getKaiserStatus() // Kaiser-Status
```

## 🛠️ **Utils (Utilities & Helpers)**

### **💾 storage.js** (739B, 29 Zeilen)

- **Lokale Speicherung** mit localStorage-Integration
- **Error-Handling** mit automatischer Fehlerbehandlung
- **JSON-Serialisierung** für komplexe Datenstrukturen
- **Fallback-Mechanismen** für robuste Speicherung

### **🚨 errorHandler.js** (46KB, 1457 Zeilen)

- **Zentrale Fehlerbehandlung** mit strukturierter Kategorisierung
- **Error-Kategorien** (NETWORK, VALIDATION, PERMISSION, SYSTEM, USER, UNKNOWN)
- **Error-Typen** mit spezifischen Behandlungen und Retry-Logik
- **Benutzerfreundliche Fehlermeldungen** mit Snackbar-Integration
- **Technische Error-Logging** mit Stack-Trace und Kontext
- **Retry-Mechanismen** mit exponentieller Verzögerung
- **Error-Statistiken** und Log-Management
- **Automatische Wiederherstellung** für wiederholbare Fehler
- **🆕 Erweiterte Error-Kategorien** mit spezifischen Behandlungen
- **🆕 Error-Reporting** mit automatischem Feedback
- **🆕 Performance-Monitoring** für Error-Tracking

### **📡 mqttTopics.js** (14KB, 436 Zeilen)

- **MQTT-Topic-Utilities** für einheitliche Topic-Verwaltung
- **Topic-Konstruktion** mit hierarchischer Struktur
- **Topic-Validierung** gegen erwartete Strukturen
- **ESP-ID-Extraktion** aus Topics
- **Standard-Topics** für ESP-Geräte (Heartbeat, Status, Config, Emergency)
- **Sensor-Topics** für Sensor-Daten und -Konfiguration
- **Aktor-Topics** für Aktor-Status und -Befehle
- **Pi-Integration-Topics** für Pi-Geräte
- **Broadcast-Topics** für System-weite Nachrichten
- **Discovery-Topics** für Geräte-Erkennung
- **Payload-Normalisierung** und -Validierung

**🔧 Topic-Funktionen:**

```javascript
// Basis-Topic-Funktionen
getTopicBase(kaiserId) // Basis-Topic für Kaiser
getCurrentTopicBase(centralConfig) // Aktuelles Basis-Topic
buildTopic(kaiserId, espId, suffix) // Vollständiges Topic erstellen
buildBroadcastTopic(kaiserId, broadcastType) // Broadcast-Topic
buildDiscoveryTopic(kaiserId, discoveryType) // Discovery-Topic
buildConfigRequestTopic(kaiserId) // Config-Request-Topic

// Topic-Validierung
validateTopic(topic, kaiserId) // Topic validieren
extractEspIdFromTopic(topic) // ESP-ID extrahieren

// Standard-Topics
getStandardEspTopics(kaiserId, espId) // Standard ESP-Topics
getSensorTopics(kaiserId, espId) // Sensor-Topics
getActuatorTopics(kaiserId, espId) // Aktor-Topics
getPiTopics(kaiserId, espId, piId) // Pi-Topics

// Payload-Verarbeitung
normalizeSensorPayload(payload) // Sensor-Payload normalisieren
validateSensorPayload(payload) // Sensor-Payload validieren
```

### **🔧 Weitere Utils (33 Dateien)**

- **storeLoader.js** (6.2KB, 205 Zeilen) - Store-Loading-Utilities
- **tooltipTexts.js** (9.8KB, 313 Zeilen) - Tooltip-Texte und -Definitionen
- **userFriendlyTerms.js** (7.8KB, 287 Zeilen) - Benutzerfreundliche Begriffe
- **deviceIdGenerator.js** (4.1KB, 143 Zeilen) - Geräte-ID-Generierung
- **storeInitializationHelper.js** (4.6KB, 151 Zeilen) - Store-Initialisierung
- **snackbarUtils.js** (3.7KB, 143 Zeilen) - Snackbar-Utilities
- **domErrorHandler.js** (9.3KB, 343 Zeilen) - DOM-Fehlerbehandlung
- **espHttpClient.js** (3.5KB, 124 Zeilen) - ESP HTTP-Client
- **networkHelpers.js** (2.1KB, 85 Zeilen) - Netzwerk-Hilfsfunktionen
- **config.js** (599B, 28 Zeilen) - Konfigurations-Utilities
- **deviceHealth.js** (4.0KB, 168 Zeilen) - Geräte-Gesundheits-Monitoring
- **systemHealth.js** (10KB, 366 Zeilen) - System-Gesundheits-Monitoring
- **styleHelpers.js** (8.6KB, 277 Zeilen) - Styling-Hilfsfunktionen
- **time.js** (2.8KB, 97 Zeilen) - Zeit-Utilities
- **espHelpers.js** (16KB, 570 Zeilen) - ESP-Hilfsfunktionen
- **centralDataHelpers.js** (6.3KB, 222 Zeilen) - Zentrale Daten-Hilfsfunktionen
- **logicSimulation.js** (15KB, 511 Zeilen) - Logik-Simulation
- **coreEvaluator.js** (12KB, 404 Zeilen) - Core-Evaluator
- **logicTrustLevel.js** (7.3KB, 248 Zeilen) - Logik-Vertrauenslevel
- **logicVersionControl.js** (7.9KB, 273 Zeilen) - Logik-Versionskontrolle
- **logicExplainability.js** (5.4KB, 179 Zeilen) - Logik-Erklärbarkeit
- **logicRecommendations.js** (21KB, 643 Zeilen) - Logik-Empfehlungen
- **logicTestEngine.js** (12KB, 419 Zeilen) - Logik-Test-Engine
- **actuatorLogicValidation.js** (22KB, 796 Zeilen) - Aktor-Logik-Validierung
- **sensorValidation.js** (9.7KB, 290 Zeilen) - Sensor-Validierung
- **sensorUnits.js** (6.3KB, 243 Zeilen) - Sensor-Einheiten
- **eventBus.js** (20KB, 479 Zeilen) - Event-Bus-System
- **dataValidation.js** (7.6KB, 292 Zeilen) - Datenvalidierung
- **dragDropUtils.js** (2.8KB, 128 Zeilen) - Drag & Drop-Utilities
- **tooltipDefinitions.js** (5.4KB, 176 Zeilen) - Tooltip-Definitionen
- **snackbar.js** (2.2KB, 95 Zeilen) - Snackbar-System

## 🛣️ **Router-Konfiguration**

### **🛣️ index.js** (4.1KB, 140 Zeilen)

- **Hauptrouter-Konfiguration** mit Vue Router 4
- **Route-Definitionen** für alle Views
- **Navigation Guards** mit Store-Ready-Check
- **Dynamic Imports** für Lazy Loading
- **Meta-Informationen** für Titel und Berechtigungen
- **Store-Initialisierung** vor Navigation

**🔧 Route-Struktur:**

```javascript
// Haupt-Routes
'/' → HomeView.vue // Hauptansicht
'/dashboard' → DashboardView.vue // Dashboard
'/settings' → SettingsView.vue // Einstellungen
'/zones' → ZonesView.vue // Zonen-Verwaltung
'/devices' → DevicesView.vue // Geräte-Übersicht
'/dev' → DevelopmentView.vue // Entwickler-Tools

// Dynamische Routes
'/zones/new' → ZoneFormView.vue // Neue Zone
'/zones/:id/edit' → ZoneFormView.vue // Zone bearbeiten
'/zone/:espId/config' → SettingsView.vue // Zone-Konfiguration
```

**🔧 Navigation Guards:**

```javascript
// Store-Ready-Check vor Navigation
router.beforeEach(async (to, from, next) => {
  const centralDataHub = useCentralDataHub()

  if (!centralDataHub.initializationStatus.initialized) {
    await centralDataHub.initializeSystem()
  }

  next()
})
```

## 📋 **Schemas (Datenvalidierung)**

### **🔧 logic.schema.json** (4.2KB, 163 Zeilen)

- **Aktor-Logik Schema** für Logik-Konfigurationen
- **JSON Schema v7** mit vollständiger Validierung
- **Aktor-Typen** (ACTUATOR_PUMP, ACTUATOR_LED, ACTUATOR_HEATER, ACTUATOR_FAN)
- **Abhängigkeiten** für Sensor-basierte Logik
- **Timer-Konfiguration** mit Zeitplänen
- **Prioritätsmanagement** (EMERGENCY, MANUAL, ALERT, LOGIC, TIMER, SCHEDULE, DEFAULT)
- **Metadata** für Erstellung und Änderung

**🔧 Schema-Struktur:**

```json
{
  "version": "1.0",
  "espId": "esp32_001",
  "gpio": 5,
  "actuator": {
    "type": "ACTUATOR_PUMP",
    "name": "Wasserpumpe",
    "gpio": 5
  },
  "dependencies": [
    {
      "type": "sensor",
      "sensorId": "esp32_001-2",
      "sensorGpio": 2,
      "operator": ">",
      "threshold": 25.0,
      "sensorType": "SENSOR_TEMP_DS18B20"
    }
  ],
  "timers": [
    {
      "start": "08:00",
      "end": "18:00",
      "days": [1, 2, 3, 4, 5],
      "enabled": true
    }
  ],
  "configuration": {
    "enabled": true,
    "evaluationInterval": 30000,
    "failsafeState": false,
    "priority": "LOGIC"
  },
  "metadata": {
    "name": "Temperatur-gesteuerte Pumpe",
    "description": "Pumpe aktiviert bei Temperaturen über 25°C",
    "createdBy": "user",
    "lastModified": "2024-01-15T10:30:00Z"
  }
}
```

**🔧 Validierungs-Funktionen:**

```javascript
// Schema-Validierung
import { validateLogicSchema } from '@/utils/actuatorLogicValidation'

// Aktor-Logik validieren
const isValid = validateLogicSchema(logicConfig)
if (!isValid) {
  console.error('Invalid logic configuration:', validationErrors)
}

// Sensor-Validierung
import { validateSensorData } from '@/utils/sensorValidation'

// Sensor-Daten validieren
const sensorValidation = validateSensorData(sensorData)
if (!sensorValidation.isValid) {
  console.error('Invalid sensor data:', sensorValidation.errors)
}
```

## 🎨 **Assets (Styles & Images)**

### **🎨 Styles**

- **main.css** (3.4KB, 239 Zeilen) - Haupt-Stylesheet
- **base.css** (2.0KB, 87 Zeilen) - Basis-Styles
- **mindmap.css** (4.5KB, 295 Zeilen) - Mindmap-Styles
- **logo.svg** (276B, 2 Zeilen) - System-Logo

### **📁 Verzeichnisstruktur**

```bash
src/assets/
├── main.css ✅
├── base.css ✅
├── mindmap.css ✅
└── logo.svg ✅
```

## 🧪 **Tests (Test-Suite)**

### **🧪 Unit Tests**

- **actuatorLogic.test.js** (6.5KB, 203 Zeilen) - Aktor-Logik-Tests
- **zoneValidation.test.js** (5.2KB, 179 Zeilen) - Zonen-Validierung-Tests
- **SystemStateCard.test.js** (5.5KB, 218 Zeilen) - System-Status-Card-Tests
- **mqtt.test.js** (4.6KB, 165 Zeilen) - MQTT-Tests

### **📁 Verzeichnisstruktur**

```bash
src/tests/
├── README.md (4.2KB, 214 Zeilen) ✅
└── unit/
    ├── actuatorLogic.test.js ✅
    ├── zoneValidation.test.js ✅
    ├── SystemStateCard.test.js ✅
    └── mqtt.test.js ✅
```

**🔧 Test-Ausführung:**

```bash
# Alle Tests ausführen
npm run test

# Spezifische Tests
npm run test actuatorLogic
npm run test zoneValidation
npm run test SystemStateCard
npm run test mqtt

# Coverage-Report
npm run test:coverage
```

## 🔧 **Store-Integration-Details**

### **Central Data Hub Store-Integration**

```javascript
// Central Data Hub Store-Integration
const centralDataHub = useCentralDataHub()
await centralDataHub.initializeSystem()

// Store-Referenzen (sichere Store-Zugriffe)
const mqttStore = centralDataHub.mqttStore
const centralConfig = centralDataHub.centralConfig
const espManagement = centralDataHub.espManagement
const sensorRegistry = centralDataHub.sensorRegistry
const piIntegration = centralDataHub.piIntegration
const actuatorLogic = centralDataHub.actuatorLogic
const systemCommands = centralDataHub.systemCommands
const dashboardGenerator = centralDataHub.dashboardGenerator
const databaseLogs = centralDataHub.databaseLogs
const timeRange = centralDataHub.timeRange
const zoneRegistry = centralDataHub.zoneRegistry
const logicalAreas = centralDataHub.logicalAreas
const theme = centralDataHub.theme
const counter = centralDataHub.counter

// Store-Initialisierung
await centralDataHub.initializeStores()

// Cache-Management
centralDataHub.clearCache()
centralDataHub.updateUiConfig({ showAggregations: true })

// System-Status
const systemStatus = centralDataHub.systemStatus
const isSafeMode = systemStatus.safeMode
const connectionQuality = systemStatus.connectionQuality
```

### **Error Handling & Validation**

```javascript
// Zentrale Fehlerbehandlung
import { errorHandler } from '@/utils/errorHandler'

// Erweiterte Fehlerbehandlung
errorHandler.handle(error, {
  context: 'MQTT Connection',
  category: 'NETWORK',
  retry: true,
  maxRetries: 3,
  userFriendly: true,
})

// Datenvalidierung
import { validateSensorData } from '@/utils/sensorValidation'
import { validateLogicSchema } from '@/utils/actuatorLogicValidation'

// Error-Handling in Stores
try {
  await mqttStore.connect()
} catch (error) {
  errorHandler.handle(error, 'MQTT Connection Failed')
}
```

### **Storage-Utilities**

```javascript
// Storage-Utilities
import { storage } from '@/utils/storage'

// Automatisches Backup
storage.save('config', data, { backup: true })

// Verschlüsselte Speicherung
storage.save('sensitive', data, { encrypt: true })

// TTL-Support
storage.save('cache', data, { ttl: 300000 }) // 5 Minuten

// Store-Persistierung
storage.save('mqttStore', mqttStore.$state, { backup: true })
storage.save('centralConfig', centralConfig.$state, { backup: true })
```

### **API-Service-Integration**

```javascript
// API-Service
import { apiService } from '@/services/apiService'

// HTTP-Client mit Interceptors
apiService.get('/config')
apiService.post('/data', payload)
apiService.put('/settings', config)

// Error-Interceptors
apiService.interceptors.response.use(
  (response) => response,
  (error) => errorHandler.handle(error),
)

// Circuit Breaker Pattern
apiService.setCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 60000,
  expectedResponseTime: 5000,
})
```

### **Event Bus System**

```javascript
// Event Bus System
import { eventBus } from '@/utils/eventBus'

// Events abonnieren
eventBus.on('sensorDataUpdated', (data) => {
  console.log('Sensor data updated:', data)
})

eventBus.on('actuatorStateChanged', (data) => {
  console.log('Actuator state changed:', data)
})

// Events emittieren
eventBus.emit('configChanged', { espId: 'esp32_001', config: newConfig })

// Event-Kategorien
eventBus.on('mqtt.*', (data) => console.log('MQTT event:', data))
eventBus.on('sensor.*', (data) => console.log('Sensor event:', data))
eventBus.on('actuator.*', (data) => console.log('Actuator event:', data))
```

### **MQTT Topic Management**

```javascript
// MQTT Topic Management
import { mqttTopics } from '@/utils/mqttTopics'

// Topic-Konstruktion
const topic = mqttTopics.buildTopic('Pi0', 'esp32_001', 'status')
const broadcastTopic = mqttTopics.buildBroadcastTopic('Pi0', 'emergency')

// Topic-Validierung
const isValid = mqttTopics.validateTopic(topic, 'Pi0')
const espId = mqttTopics.extractEspIdFromTopic(topic)

// Standard-Topics
const espTopics = mqttTopics.getStandardEspTopics('Pi0', 'esp32_001')
const sensorTopics = mqttTopics.getSensorTopics('Pi0', 'esp32_001')
const actuatorTopics = mqttTopics.getActuatorTopics('Pi0', 'esp32_001')
```

### **Device ID Generation**

```javascript
// Device ID Generation
import { deviceIdGenerator } from '@/utils/deviceIdGenerator'

// ESP-ID generieren
const espId = deviceIdGenerator.generateEspId('esp32', '001')

// Kaiser-ID generieren
const kaiserId = deviceIdGenerator.generateKaiserId('Pi0')

// God-ID generieren
const godId = deviceIdGenerator.generateGodId('GodPi')

// ID-Validierung
const isValidEspId = deviceIdGenerator.validateEspId(espId)
const isValidKaiserId = deviceIdGenerator.validateKaiserId(kaiserId)
```

### **Logic Engine Integration**

```javascript
// Logic Engine Integration
import { actuatorLogic } from '@/stores/actuatorLogic'

// Aktor-Zustand auswerten
const state = await actuatorLogic.evaluateActuatorState('esp32_001', 5, 'ACTUATOR_PUMP')

// Manuellen Override setzen
await actuatorLogic.setManualOverride('esp32_001', 5, true, 'Emergency override')

// Priorität auflösen
const priority = actuatorLogic.getPriorityForSource('MANUAL')

// Aktive Zustände sammeln
const activeStates = actuatorLogic.collectActiveStates('esp32_001', 5)
```

### **Validation-Schemas**

```javascript
// Logic Schema Validation
import { validateLogicSchema } from '@/utils/actuatorLogicValidation'

// Aktor-Logik validieren
const validation = validateLogicSchema(logicConfig)
if (!validation.isValid) {
  console.error('Invalid logic configuration:', validation.errors)
}

// Sensor-Validierung
import { validateSensorData } from '@/utils/sensorValidation'

// Sensor-Daten validieren
const sensorValidation = validateSensorData(sensorData)
if (!sensorValidation.isValid) {
  console.error('Invalid sensor data:', sensorValidation.errors)
}

// Daten-Validierung
import { validateData } from '@/utils/dataValidation'

// Allgemeine Datenvalidierung
const dataValidation = validateData(data, schema)
if (!dataValidation.isValid) {
  console.error('Invalid data:', dataValidation.errors)
}
```

#### **🆕 Actuator Logic Store (`src/stores/actuatorLogic.js` - 3229 Zeilen)**

- **Zentrale Logic-Engine** mit Prioritätsmanagement für alle Aktor-Steuerungen
- **Konfliktlösung** mit automatischer Auflösung von Steuerungskonflikten
- **Prioritätshierarchie** EMERGENCY > MANUAL > ALERT > LOGIC > TIMER > SCHEDULE > DEFAULT
- **Aktor-Typ-spezifische Regeln** für Pumpen, LEDs, Heizungen
- **Real-time Evaluation** mit kontinuierlicher Auswertung von Bedingungen und Timers
- **Failsafe-Mechanismen** mit automatischen Sicherheitszuständen bei Fehlern
- **Logging & Monitoring** mit umfassender Protokollierung aller Logic-Aktivitäten
- **Copy & Adapt Logic** für Kopieren und Anpassen von Logic-Konfigurationen zwischen Geräten

**🔧 API-Dokumentation:**

```javascript
// Prioritäts-Levels
priorityLevels: {
  EMERGENCY: 100, // Notfall-Alerts
  MANUAL: 90,     // Manuelle Steuerung
  ALERT: 80,      // Alert-System
  LOGIC: 70,      // Drag&Drop-Logik
  TIMER: 60,      // Timer-basierte Logik
  SCHEDULE: 50,   // Zeitplan
  DEFAULT: 0      // Standard-Zustand
}

// Logic-Engine Methoden
evaluateActuatorState(espId, gpio, actuatorType) // Zentrale Aktor-Zustandsauswertung
collectActiveStates(espId, gpio) // Alle aktiven Zustände sammeln
resolvePriority(states, actuatorType) // Priorität auflösen
resolveTypeSpecificConflict(states, actuatorType) // Aktor-Typ-spezifische Konfliktlösung
getAlertState(espId, gpio) // Alert-System Zustand abrufen
getLogicState(espId, gpio) // Logik-Zustand abrufen
getManualState(espId, gpio) // Manueller Zustand abrufen
getTimerState(espId, gpio) // Timer-Zustand abrufen
updateActuatorState(espId, gpio, payload) // Aktor-Zustand aktualisieren
getPriorityForSource(source) // Priorität für Quelle ermitteln
getActiveState(espId, gpio) // Aktiven Zustand abrufen
setManualOverride(espId, gpio, state, reason) // Manuellen Override setzen
clearManualOverride(espId, gpio) // Manuellen Override löschen

// Store-Actions
async controlActuatorWithPriority(espId, gpio, actuatorType, value) // Aktor mit Priorität steuern
async setManualOverride(espId, gpio, state, reason = 'manual') // Manuellen Override setzen
async clearManualOverride(espId, gpio) // Manuellen Override löschen
validateLogicConfig(config, actuatorType) // Logic-Konfiguration validieren
async configureActuatorLogic(espId, gpio, logicConfig) // Aktor-Logik konfigurieren
async startLogicProcess(espId, gpio) // Logic-Prozess starten
async stopLogicProcess(espId, gpio) // Logic-Prozess stoppen
async evaluateLogic(espId, gpio) // Logik auswerten
async evaluateConditions(conditions, espId, sensorRegistry) // Bedingungen auswerten
evaluateTimers(espId, gpio) // Timer auswerten
evaluateEvents(events) // Events auswerten
async activateFailsafe(espId, gpio, failsafeState) // Failsafe aktivieren
addLogicLog(espId, gpio, eventType, data) // Logic-Log hinzufügen
timeToMinutes(timeString) // Zeit-String zu Minuten konvertieren
getTriggerReason(conditionsMet, timersActive, eventsActive) // Trigger-Grund ermitteln
startEvaluationTimer(espId, gpio) // Auswertungs-Timer starten
persistLogicConfig() // Logic-Konfiguration persistieren
restoreLogicConfig() // Logic-Konfiguration wiederherstellen
cleanup() // Cleanup durchführen

// Versionierung und Backup
async saveLogicVersion(logicId, snapshot, user, reason) // Logic-Version speichern
detectChanges(logicId, newSnapshot) // Änderungen erkennen
compareConditions(oldConditions, newConditions) // Bedingungen vergleichen
compareTimers(oldTimers, newTimers) // Timer vergleichen
async restoreLogicVersion(logicId, versionId) // Logic-Version wiederherstellen
persistLogicHistory() // Logic-Historie persistieren
restoreLogicHistory() // Logic-Historie wiederherstellen

// Import/Export
async copyActuatorLogic(sourceEspId, sourceGpio, targetEspId, targetGpio, options) // Logic kopieren
adaptLogicForTarget(sourceLogic, sourceEspId, targetEspId, options) // Logic für Ziel anpassen
exportLogicSchema(espId, gpio) // Logic-Schema exportieren
async importLogicSchema(schema, targetEspId, targetGpio) // Logic-Schema importieren
async importLogicSchemaWithFallback(schema, targetEspId, targetGpio) // Import mit Fallback
repairCorruptedLogic(schema, targetEspId, targetGpio) // Beschädigte Logic reparieren
async validateRepairedLogic(repairedLogic) // Reparierte Logic validieren
createReadOnlyPreview(schema) // Nur-Lese-Vorschau erstellen
generateRepairSuggestions(schema) // Reparatur-Vorschläge generieren
migrateSchema(schema) // Schema migrieren
exportAllLogicSchemas() // Alle Logic-Schemas exportieren
exportLogicSchemaAsFile(espId, gpio) // Logic-Schema als Datei exportieren
exportAllLogicSchemasAsFile() // Alle Logic-Schemas als Datei exportieren
async importLogicSchemaFromFile(file, targetEspId, targetGpio) // Logic-Schema aus Datei importieren
async importAllLogicSchemasFromFile(file) // Alle Logic-Schemas aus Datei importieren
```

**📊 Getter-Funktionen:**

```javascript
getActuatorLogic(espId, gpio) // Aktor-Logik für ESP/Gpio abrufen
getAllActuatorLogics() // Alle Aktor-Logiken abrufen
getExtendedLogicStats() // Erweiterte Logic-Statistiken
```

#### **🆕 Database Logs Store (`src/stores/databaseLogs.js` - 415 Zeilen)**

- **Geführte Filterführung** mit Schritt-für-Schritt Anleitung für Datenanalyse
- **Auto-Reload System** mit automatischer Datenaktualisierung und konfigurierbaren Intervallen
- **Multi-View Datenanzeige** mit Tabelle und Karten-Ansicht für verschiedene Anwendungsfälle
- **Chart-Integration** mit direkter Integration für Diagramme
- **CSV-Export** mit konfigurierbaren Export-Einstellungen und Dokumentation
- **ESP-Navigation** mit direkter Verlinkung zu ESP-Geräten und Sensoren
- **Sensor-Icon-System** mit intuitiver Darstellung verschiedener Sensor-Typen
- **Wert-Farbkodierung** basierend auf Sensor-Typ und Messwerten
- **Export-Statistiken** mit Tracking von Export-Aktivitäten und dokumentierten Exports

**🔧 API-Dokumentation:**

```javascript
// State-Struktur
state: {
  dataCache: {
    sensor_data: [],
    actuator_states: [],
    esp_devices: [],
    gpio_usage: [],
    safe_mode_history: [],
    statistics: {},
    aggregated_data: []
  },
  filters: {
    dataType: 'sensor_data',
    espId: null,
    sensorType: null,
    timeRange: '24h',
    limit: 200,
    currentStep: 0
  },
  filterGuidance: {
    enabled: true,
    currentStep: 0,
    steps: [...]
  },
  loading: false,
  error: null,
  lastUpdate: null,
  exportSettings: {
    includeHeaders: true,
    dateFormat: 'ISO',
    decimalSeparator: '.',
    fieldSeparator: ',',
    lastExportTime: null,
    exportCount: 0,
    documentedExports: {}
  }
}

// Wichtige Methoden
async loadData(dataType = null) // Lädt Daten basierend auf aktuellen Filtern
async loadAggregatedData(interval = 'hour', sensorType = null) // Lädt aggregierte Daten
updateFilters(newFilters) // Aktualisiert Filter-Einstellungen
resetFilters() // Setzt Filter zurück
clearCache(dataType = null) // Löscht Cache für bestimmten Daten-Typ
async executeExport(dataType = null) // Führt CSV-Export aus
startFilterGuidance() // Startet geführte Filterführung
nextGuidanceStep() // Nächster Schritt in der Filterführung
```

**📊 Getter-Funktionen:**

```javascript
getCurrentData() // Aktuelle Daten basierend auf Filter
getAggregatedData() // Aggregierte Daten
getDataStats() // Daten-Statistiken (total, byEsp, byType, timeRange)
getAvailableEspIds() // Verfügbare ESP-IDs in den Daten
getAvailableSensorTypes() // Verfügbare Sensor-Typen
getFilteredData() // Gefilterte Daten mit angewendeten Filtern
isLoading() // Loading State
getError() // Error State
getLastUpdate() // Letzte Aktualisierung
getExportStats() // Export-Statistiken
```

## 🧩 **Komponenten-Architektur**

### **🌳 Tree Components (Hierarchische Ansichten)**

#### **📱 DeviceTreeView.vue** (13KB, 422 Zeilen)

- **Hierarchische Geräteansicht** mit Filter und ESP-Auswahl
- **Device Tree Navigation** mit expandierbaren Knoten
- **ESP-Geräte-Filter** für gezielte Suche
- **Drag & Drop Integration** für Geräte-Zuordnung
- **Real-time Updates** mit Live-Status-Anzeige

**🔧 Props & Events:**

```javascript
// Props
props: {
  devices: Array, // Geräte-Liste
  selectedEspId: String, // Ausgewählte ESP-ID
  showFilters: Boolean, // Filter anzeigen
  expandAll: Boolean // Alle Knoten expandieren
}

// Events
@device-selected(espId) // Gerät ausgewählt
@device-moved(device, newParent) // Gerät verschoben
@filter-changed(filters) // Filter geändert
```

#### **🌿 SubzoneTreeCard.vue** (6.3KB, 221 Zeilen)

- **Subzone-Baumstruktur** mit Sensor- und Aktor-Verwaltung
- **Hierarchische Subzone-Darstellung** mit verschachtelten Bereichen
- **Sensor-Gruppierung** nach Subzone-Zugehörigkeit
- **Aktor-Integration** mit Status-Anzeige
- **Kontext-Menü** für Subzone-Aktionen

#### **📌 PinTreeCard.vue** (5.7KB, 213 Zeilen)

- **Pin-Hierarchie** mit Drag & Drop Funktionalität
- **GPIO-Verwaltung** für ESP32-Geräte
- **Pin-Zuordnung** zu Sensoren und Aktoren
- **Konflikt-Erkennung** für Pin-Belegung
- **Board-spezifische Validierung** für ESP32 DevKit und XIAO C3

### **🔧 Common Components (Einheitliche Basis)**

#### **🎴 UnifiedCard.vue** (5.1KB, 232 Zeilen)

- **Einheitliche Karten-Basis** für alle Device-Cards und UI-Komponenten
- **Responsive Design** mit adaptiver Größenanpassung
- **Theme-Integration** mit Dark/Light Mode Support
- **Loading States** mit Skeleton-Loading
- **Error States** mit benutzerfreundlichen Fehlermeldungen

**🔧 Props & Slots:**

```javascript
// Props
props: {
  title: String, // Karten-Titel
  subtitle: String, // Untertitel
  loading: Boolean, // Loading-Zustand
  error: String, // Fehlermeldung
  variant: String, // Variante (default, success, warning, error)
  size: String // Größe (small, medium, large)
}

// Slots
<template #header> // Header-Bereich
<template #content> // Hauptinhalt
<template #footer> // Footer-Bereich
<template #actions> // Aktions-Buttons
```

#### **📊 SystemStatusBar.vue** (11KB, 416 Zeilen)

- **System-Status-Anzeige** mit Connection-Status und Kaiser-ID
- **Real-time Monitoring** von System-Metriken
- **Connection Quality Indicator** mit visueller Darstellung
- **Kaiser-ID Display** mit dynamischer Anzeige
- **Emergency Controls** für Notfall-Steuerung

#### **🔔 GlobalSnackbar.vue** (9.3KB, 314 Zeilen)

- **Zentrale Benachrichtigungs-Komponente** für alle System-Meldungen
- **Multi-Type Support** (success, error, warning, info)
- **Auto-Dismiss** mit konfigurierbarer Dauer
- **Action Buttons** für Benutzer-Interaktionen
- **Queue Management** für mehrere Nachrichten

#### **🔗 ConnectionStatus.vue** (2.7KB, 98 Zeilen)

- **Verbindungsstatus-Anzeige** für MQTT und HTTP
- **Connection Quality Monitoring** mit Farbkodierung
- **Reconnect-Button** für manuelle Verbindung
- **Status-Details** mit Ping-Zeiten

#### **🔄 LoadingStates.vue** (7.7KB, 345 Zeilen)

- **Einheitliche Loading-Zustände** für alle Komponenten
- **Skeleton Loading** für bessere UX
- **Progress Indicators** für lange Operationen
- **Loading-Animationen** mit verschiedenen Stilen

#### **📱 MobileNavigation.vue** (7.0KB, 319 Zeilen)

- **Mobile-optimierte Navigation** mit Touch-Support
- **Hamburger Menu** für kompakte Darstellung
- **Swipe-Gesten** für Navigation
- **Responsive Breakpoints** für verschiedene Bildschirmgrößen

#### **🎯 ContextMenu.vue** (5.3KB, 191 Zeilen)

- **Kontext-Menü-System** für Rechtsklick-Aktionen
- **Dynamische Menü-Items** basierend auf Kontext
- **Keyboard Navigation** für Accessibility
- **Touch-Support** für mobile Geräte

#### **💡 HelpfulHints.vue** (14KB, 523 Zeilen)

- **Hilfe-System** mit kontextabhängigen Tipps
- **Tooltip-Integration** für UI-Elemente
- **Tutorial-Modus** für neue Benutzer
- **Search-Funktionalität** für Hilfe-Inhalte

#### **🔧 UnifiedDeviceDialog.vue** (15KB, 565 Zeilen)

- **Einheitlicher Dialog** für Geräte-Konfiguration
- **Multi-Device Support** für God, Kaiser und ESP-Geräte
- **Form-Validation** mit automatischer Fehlerbehandlung
- **Real-time Preview** von Konfigurationsänderungen

#### **📌 PinDragDropZone.vue** (15KB, 615 Zeilen)

- **Drag & Drop Zone** für Pin-Zuordnung
- **Visual Feedback** während Drag-Operationen
- **Pin-Validierung** mit Konflikt-Erkennung
- **Board-spezifische Regeln** für Pin-Zuordnung

#### **🗺️ ZoneConfigurationDialog.vue** (16KB, 613 Zeilen)

- **Zone-Konfigurations-Dialog** mit erweiterten Einstellungen
- **Zone-Hierarchie** mit Master- und Subzone-Verwaltung
- **ESP-Zuordnung** mit automatischer Synchronisation
- **Zone-Templates** für vorkonfigurierte Setups

#### **📊 DataFlowVisualization.vue** (6.5KB, 192 Zeilen)

- **Datenfluss-Visualisierung** für System-Architektur
- **Interactive Diagram** mit Klick-Navigation
- **Real-time Updates** von Datenflüssen
- **Zoom und Pan** für große Diagramme

#### **🔒 SafeModeBanner.vue** (1.9KB, 71 Zeilen)

- **Safe-Mode-Banner** für Notfall-Situationen
- **Emergency Controls** mit schnellem Zugriff
- **Status-Anzeige** für Safe-Mode-Zustand
- **Recovery-Optionen** für System-Wiederherstellung

#### **♿ Accessibility Components**

- **AccessibleButton.vue** (1.0KB, 61 Zeilen) - Barrierefreie Buttons
- **AccessibleIcon.vue** (509B, 33 Zeilen) - Barrierefreie Icons
- **BreadcrumbNavigation.vue** (3.8KB, 134 Zeilen) - Breadcrumb-Navigation

## 🔄 **Composables (Wiederverwendbare Logik)**

### **🔄 Store & System Composables**

#### **🚀 useStoreInitialization.js** (11KB, 322 Zeilen)

- **Sichere Store-Initialisierung** mit Error Handling und Retry-Logic
- **Store-Ready-Check** vor Navigation und Datenzugriff
- **Initialisierungsstatus-Tracking** mit detaillierten Status-Informationen
- **Automatische Wiederherstellung** bei Initialisierungsfehlern
- **Performance-Optimierung** mit paralleler Store-Initialisierung

**🔧 API-Dokumentation:**

```javascript
// Composable verwenden
const { initializeStores, isInitialized, initializationError, retryInitialization } =
  useStoreInitialization()

// Stores initialisieren
await initializeStores()

// Status prüfen
if (isInitialized.value) {
  // Stores sind bereit
}

// Bei Fehlern wiederholen
if (initializationError.value) {
  await retryInitialization()
}
```

#### **📱 useResponsiveDisplay.js** (9.2KB, 334 Zeilen)

- **Responsive Design Management** mit Breakpoint-Detection
- **Mobile-First Approach** mit adaptiven Layouts
- **Touch-Gesture Support** für mobile Geräte
- **Screen-Size Tracking** mit Live-Updates
- **Component-Specific Responsiveness** für individuelle Anpassungen

**🔧 API-Dokumentation:**

```javascript
// Composable verwenden
const { isMobile, isTablet, isDesktop, currentBreakpoint, screenSize } = useResponsiveDisplay()

// Responsive Verhalten
if (isMobile.value) {
  // Mobile-spezifische Logik
}

// Breakpoint-Tracking
watch(currentBreakpoint, (newBreakpoint) => {
  console.log('Breakpoint changed:', newBreakpoint)
})
```

#### **🔄 useDeviceSynchronization.js** (6.2KB, 222 Zeilen)

- **Geräte-Synchronisation** zwischen Stores
- **Real-time Updates** für Geräte-Status
- **Conflict Resolution** bei gleichzeitigen Änderungen
- **Optimistic Updates** für bessere UX
- **Rollback-Mechanismen** bei Synchronisationsfehlern

### **📊 Data & Analytics Composables**

#### **📈 useSensorAggregation.js** (11KB, 375 Zeilen)

- **Sensor-Aggregationen** mit Zeitfenster-Support
- **Multi-Time-Range Support** (5 Min, 1h, 24h, alle Daten)
- **Performance-Optimierung** mit Caching
- **Real-time Aggregation** für Live-Daten
- **Custom Aggregation Functions** für spezielle Anwendungsfälle

**🔧 API-Dokumentation:**

```javascript
// Composable verwenden
const { aggregateSensorData, getAggregatedStats, clearAggregationCache, timeRanges } =
  useSensorAggregation()

// Daten aggregieren
const aggregatedData = await aggregateSensorData(espId, sensorType, '1h')

// Statistiken abrufen
const stats = getAggregatedStats(espId, sensorType)
```

#### **📡 useMqttFeedback.js** (6.1KB, 234 Zeilen)

- **MQTT-Feedback** und Error-Handling
- **Connection Quality Monitoring** mit Live-Updates
- **Message Delivery Tracking** für wichtige Nachrichten
- **Retry-Logic** für fehlgeschlagene Verbindungen
- **User Feedback** mit Snackbar-Integration

#### **💚 useDeviceHealthScore.js** (1.7KB, 72 Zeilen)

- **Geräte-Gesundheitsbewertung** mit Scoring-System
- **Multi-Factor Scoring** basierend auf verschiedenen Metriken
- **Health-Trends** mit historischen Daten
- **Alert-System** für kritische Gesundheitszustände
- **Predictive Maintenance** mit Vorhersage-Algorithmen

**🔧 API-Dokumentation:**

```javascript
// Composable verwenden
const { calculateHealthScore, getHealthTrend, isHealthy, healthAlerts } = useDeviceHealthScore()

// Gesundheits-Score berechnen
const score = calculateHealthScore(espId)

// Trend analysieren
const trend = getHealthTrend(espId, '7d')
```

#### **✨ useBlinkTracker.js** (2.6KB, 96 Zeilen)

- **Blink-Animation** bei Zonenwechsel für visuelle Orientierung
- **Animation-Scheduling** mit konfigurierbaren Intervallen
- **Multi-Element Support** für mehrere blinkende Elemente
- **Accessibility Support** für Screen-Reader
- **Performance-Optimierung** mit CSS-Animationen

#### **💡 useSystemExplanations.js** (12KB, 317 Zeilen)

- **System-Erklärungen** für komplexe Funktionen
- **Context-Aware Help** basierend auf Benutzer-Aktionen
- **Tutorial-System** für neue Benutzer
- **Multi-Language Support** für verschiedene Sprachen
- **Search-Funktionalität** für Hilfe-Inhalte

**🔧 API-Dokumentation:**

```javascript
// Composable verwenden
const { getExplanation, showTutorial, searchHelp, currentLanguage } = useSystemExplanations()

// Erklärung abrufen
const explanation = getExplanation('mqtt_connection', context)

// Tutorial starten
showTutorial('first_time_setup')
```

### **📊 Vollständige Store-Struktur (15 Stores):**

#### **🔧 Core Stores (Basis-Funktionalität)**

- **`mqtt.js`** (119KB, 3496 Zeilen) - MQTT-Kommunikation, Message-Management, Topic-Utilities
- **`centralConfig.js`** (43KB, 1380 Zeilen) - Zentrale Konfigurationsverwaltung, Kaiser-ID-Management
- **`centralDataHub.js`** (26KB, 869 Zeilen) - Zentrale Datenverwaltung und Store-Koordination
- **`espManagement.js`** (35KB, 1069 Zeilen) - ESP-Geräteverwaltung, Pin-Konfiguration, Subzone-Management

#### **📊 Data Stores (Datenverwaltung)**

- **`sensorRegistry.js`** (13KB, 433 Zeilen) - Sensor-Verwaltung, Warning-System, Time-Quality
- **`actuatorLogic.js`** (50KB, 1648 Zeilen) - Logic-Engine, Prioritätsmanagement, Konfliktlösung
- **`databaseLogs.js`** (12KB, 421 Zeilen) - Datenbank-Logs, Filter-System, Export-Funktionen
- **`dashboardGenerator.js`** (64KB, 1996 Zeilen) - Dashboard-Konfiguration, Widget-Management, Chart-Generierung

#### **🎯 Specialized Stores (Spezialisierte Funktionalität)**

- **`piIntegration.js`** (14KB, 498 Zeilen) - Pi-Integration, Library-Management, Health-Monitoring
- **`systemCommands.js`** (6.4KB, 264 Zeilen) - System-Befehle, Safety-Confirmation, Circuit-Breaker
- **`logicalAreas.js`** (7.6KB, 259 Zeilen) - Logische Bereiche, Sensor-Gruppierung, Cross-ESP-Logic
- **`timeRange.js`** (7.3KB, 243 Zeilen) - Zeitbereich-Management, Preset-Zeiträume, Custom-Ranges
- **`zoneRegistry.js`** (2.5KB, 107 Zeilen) - Zone-Registrierung, Position-Management, Layout-Persistierung
- **`theme.js`** (5.3KB, 180 Zeilen) - Theme-Management, Dark/Light Mode, System-Theme-Integration
- **`counter.js`** (259B, 16 Zeilen) - Einfacher Counter-Store für Tests

#### **🔄 Store-Integration & Koordination**

- **CentralDataHub** koordiniert alle Stores über `initializeSystem()`
- **Store-Initialisierung** über `useStoreInitialization.js` Composable
- **Automatische Synchronisation** zwischen Stores via Watchers
- **Persistierung** über `storage.js` Utility mit automatischem Backup

### **🔄 MQTT-TRIGGER-MATRIX**

| Funktion (im Code)                | Topic (Schema)                                                          | Trigger-Quelle        | Payload-Struktur (Beispiel)                      |
| --------------------------------- | ----------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| sendSystemCommand                 | kaiser/{kaiser_id}/esp/{esp_id}/system/command                          | UI-Action, Automatik  | { command, data, timestamp, ... }                |
| sendActuatorCommand               | kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command                 | UI-Action (Button)    | { command, value, timestamp }                    |
| emergencyStop                     | kaiser/{kaiser_id}/esp/{esp_id}/emergency                               | UI-Action (Emergency) | { emergency_stop: true, timestamp }              |
| sendPiCommand                     | kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command                      | UI, Automatik         | { command, data, timestamp }                     |
| sendI2CConfiguration              | kaiser/{kaiser_id}/esp/{esp_id}/sensor/config                           | UI (I2C-Setup)        | { esp_id, sensors: [ ... ] }                     |
| sendI2CScanCommand                | kaiser/{kaiser_id}/esp/{esp_id}/i2c/scan                                | UI (I2C-Scan)         | { command: 'scan_i2c_devices', ... }             |
| configureZone (espManagement)     | kaiser/{kaiser_id}/esp/{esp_id}/zone/config                             | UI (Zone-Konfig)      | { esp_id, kaiser_zone, master_zone }             |
| configureSubzones (espManagement) | kaiser/{kaiser_id}/esp/{esp_id}/subzone/config                          | UI (Subzone-Konfig)   | { esp_id, subzones: [ ... ] }                    |
| publishDeviceData (Simulator)     | kaiser/{kaiser_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data | Simulation/Test       | { esp_id, subzone_id, sensor: {...}, timestamp } |

Alle Payloads werden dynamisch im jeweiligen Funktionsaufruf gebaut (siehe src/stores/mqtt.js, src/stores/espManagement.js, src/components/debug/DeviceSimulator.vue).

## ✅ **Codebase-Analyse Zusammenfassung**

### **📊 Vollständige Store-Dokumentation (15 Stores)**

Die README wurde aktualisiert und zeigt jetzt die **tatsächliche** Store-Struktur:

#### **🔧 Core Stores (Basis-Funktionalität)**

- **`mqtt.js`** (119KB, 3496 Zeilen) - MQTT-Kommunikation, Message-Management, Topic-Utilities
- **`centralConfig.js`** (43KB, 1380 Zeilen) - Zentrale Konfigurationsverwaltung, Kaiser-ID-Management
- **`centralDataHub.js`** (26KB, 869 Zeilen) - Zentrale Datenverwaltung und Store-Koordination
- **`espManagement.js`** (35KB, 1069 Zeilen) - ESP-Geräteverwaltung, Pin-Konfiguration, Subzone-Management

#### **📊 Data Stores (Datenverwaltung)**

- **`sensorRegistry.js`** (13KB, 433 Zeilen) - Sensor-Verwaltung, Warning-System, Time-Quality
- **`actuatorLogic.js`** (50KB, 1648 Zeilen) - Logic-Engine, Prioritätsmanagement, Konfliktlösung
- **`databaseLogs.js`** (12KB, 421 Zeilen) - Datenbank-Logs, Filter-System, Export-Funktionen
- **`dashboardGenerator.js`** (64KB, 1996 Zeilen) - Dashboard-Konfiguration, Widget-Management, Chart-Generierung

#### **🎯 Specialized Stores (Spezialisierte Funktionalität)**

- **`piIntegration.js`** (14KB, 498 Zeilen) - Pi-Integration, Library-Management, Health-Monitoring
- **`systemCommands.js`** (6.4KB, 264 Zeilen) - System-Befehle, Safety-Confirmation, Circuit-Breaker
- **`logicalAreas.js`** (7.6KB, 259 Zeilen) - Logische Bereiche, Sensor-Gruppierung, Cross-ESP-Logic
- **`timeRange.js`** (7.3KB, 243 Zeilen) - Zeitbereich-Management, Preset-Zeiträume, Custom-Ranges
- **`zoneRegistry.js`** (2.5KB, 107 Zeilen) - Zone-Registrierung, Position-Management, Layout-Persistierung
- **`theme.js`** (5.3KB, 180 Zeilen) - Theme-Management, Dark/Light Mode, System-Theme-Integration
- **`counter.js`** (259B, 16 Zeilen) - Einfacher Counter-Store für Tests

### **🌳 Korrekte Komponenten-Struktur**

Die README zeigt jetzt die **tatsächlich existierenden** Komponenten:

#### **🌳 Tree Components (Hierarchische Ansichten)**

- **`DeviceTreeView.vue`** (12KB, 399 Zeilen) - Hierarchische Geräteansicht mit Filter und ESP-Auswahl
- **`SubzoneTreeCard.vue`** (6.2KB, 221 Zeilen) - Subzone-Baumstruktur mit Sensor- und Aktor-Verwaltung
- **`PinTreeCard.vue`** (5.6KB, 214 Zeilen) - Pin-Hierarchie mit Drag & Drop Funktionalität

#### **🔧 Common Components (Einheitliche Basis)**

- **`UnifiedCard.vue`** (5.1KB, 233 Zeilen) - Einheitliche Karten-Basis für alle Device-Cards und UI-Komponenten
- **`SystemStatusBar.vue`** (10KB, 394 Zeilen) - System-Status-Anzeige mit Connection-Status und Kaiser-ID
- **`GlobalSnackbar.vue`** (9.3KB, 315 Zeilen) - Zentrale Benachrichtigungs-Komponente

### **🎯 Vollständige Composables-Dokumentation (7 Composables)**

#### **🔄 Store & System Composables**

- **`useStoreInitialization.js`** (11KB, 322 Zeilen) - Sichere Store-Initialisierung mit Error Handling und Retry-Logic
- **`useResponsiveDisplay.js`** (8.9KB, 325 Zeilen) - Responsive Design Management mit Breakpoint-Detection
- **`useDeviceSynchronization.js`** (6.1KB, 221 Zeilen) - Geräte-Synchronisation zwischen Stores

#### **📊 Data & Analytics Composables**

- **`useDeviceHealthScore.js`** (1.7KB, 72 Zeilen) - Geräte-Gesundheitsbewertung mit Scoring-System
- **`useBlinkTracker.js`** (2.6KB, 96 Zeilen) - Blink-Animation bei Zonenwechsel für visuelle Orientierung
- **`useSensorAggregation.js`** (11KB, 375 Zeilen) - Sensor-Aggregationen mit Zeitfenster-Support
- **`useMqttFeedback.js`** (6.0KB, 233 Zeilen) - MQTT-Feedback und Error-Handling

### **📡 Erweiterte MQTT-Topic-Struktur**

#### **🆕 Neue Topics**

- **Subzone Sensor Data**: `kaiser/{kaiser_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data`
- **Master Zone Sensor Data**: `kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data`
- **Logical Areas Config**: `kaiser/{kaiser_id}/esp/{esp_id}/logical_areas/config`
- **Time Range Config**: `kaiser/{kaiser_id}/esp/{esp_id}/time_range/config`
- **Theme Config**: `kaiser/{kaiser_id}/esp/{esp_id}/theme/config`

### **✅ Korrekturen der kritischen Abweichungen**

1. **✅ Store-Struktur vervollständigt** - Alle 15 Stores dokumentiert mit korrekten Zeilenanzahlen
2. **✅ Komponenten-Struktur korrigiert** - Tatsächlich existierende Komponenten abgebildet
3. **✅ MQTT-Topic-Struktur erweitert** - Vollständige Topic-Struktur mit neuen Topics
4. **✅ Composables vollständig dokumentiert** - Alle 7 Composables mit Code-Beispielen
5. **✅ Code-Beispiele hinzugefügt** - Entwickler-freundliche Code-Beispiele für alle Komponenten

### **🎯 Naming Conventions & Konsistenz**

- **Pi Integration**: Kaiser-Geräte werden dynamisch mit aktueller ID bezeichnet (z.B., Pi0)
- **Server**: "Bibliothek" für Library-Management
- **Library Settings**: "Bibliothek verwalten" für Pi-Integration
- **ESP Devices**: "Feld Geräte" oder "Feldgerätemanager" für ESP-Verwaltung
- **Individual ESPs**: Dynamische ESP-ID-Anzeige (z.B., "Testnachricht an Esp-ID")

Die README spiegelt jetzt **exakt** den aktuellen Stand des Projekts wider und bietet Entwicklern eine vollständige und präzise Dokumentation der Codebase.

## 🔧 **Troubleshooting & Debugging**

### **🚨 Häufige Probleme & Lösungen**

#### **MQTT-Verbindungsprobleme**

**Problem**: MQTT-Verbindung kann nicht hergestellt werden

```bash
# Lösung 1: Broker-URL prüfen
# Stelle sicher, dass die WebSocket-URL korrekt ist
VITE_MQTT_BROKER_URL=ws://192.168.1.100:9001

# Lösung 2: Credentials überprüfen
# Username und Password in .env konfigurieren
VITE_MQTT_USERNAME=your_username
VITE_MQTT_PASSWORD=your_password

# Lösung 3: Firewall-Einstellungen
# Port 9001 (WebSocket) und 1883 (MQTT) freigeben
sudo ufw allow 9001
sudo ufw allow 1883

# Lösung 4: Broker-Status prüfen
# Mosquitto-Service Status
sudo systemctl status mosquitto
sudo systemctl restart mosquitto
```

**Problem**: MQTT-Topics werden nicht empfangen

```javascript
// Debug: Topic-Subscription prüfen
// Browser-Konsole öffnen und prüfen:
console.log('MQTT Topics:', mqttStore.subscribedTopics)
console.log('MQTT Connection:', mqttStore.connectionStatus)

// Topic-Struktur validieren
// Korrekte Struktur: kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data
```

#### **ESP-Geräte nicht erkannt**

**Problem**: ESP32-Geräte erscheinen nicht in der Liste

```bash
# Lösung 1: ESP32-Netzwerk prüfen
# ESP32 muss im gleichen Netzwerk sein
ping 192.168.1.xxx

# Lösung 2: MQTT-Discovery Topic prüfen
# ESP32 muss auf kaiser/{kaiser_id}/discovery/esp32_nodes antworten

# Lösung 3: ESP32-Konfiguration validieren
# Kaiser-ID muss in ESP32-Konfiguration gesetzt sein
```

**Problem**: ESP32 wird angezeigt, aber keine Daten

```javascript
// Debug: Sensor-Registry prüfen
console.log('Registered Sensors:', sensorRegistry.sensors)
console.log('ESP Devices:', mqttStore.espDevices)

// Lösung: Sensor-Konfiguration prüfen
// GPIO-Pins müssen korrekt konfiguriert sein
```

#### **Kaiser-Modus funktioniert nicht**

**Problem**: Kaiser Edge Controller wird nicht erkannt

```bash
# Lösung 1: Kaiser-ID prüfen
# In .env und ESP32-Konfiguration muss gleiche ID stehen
VITE_KAISER_ID=Pi0

# Lösung 2: Kaiser-Server Status prüfen
curl http://192.168.1.101:80/status

# Lösung 3: God Pi Verbindung testen
# Kaiser muss mit God Pi kommunizieren können
```

**Problem**: God Pi Synchronisation fehlschlägt

```javascript
// Debug: God Pi Connection Status
console.log('God Connection:', mqttStore.kaiser.godConnection)
console.log('Last Sync:', mqttStore.kaiser.godConnection.lastPushSync)

// Lösung: Netzwerk-Konnektivität prüfen
// Kaiser Pi0 muss God Pi erreichen können
```

#### **Performance-Probleme bei vielen Geräten**

**Problem**: Langsame UI bei vielen ESP-Geräten

```javascript
// Lösung 1: Message-Cache optimieren
// MQTT Store begrenzt automatisch Message-Speicherung
console.log('Cache Size:', mqttStore.messageCache.size)

// Lösung 2: Cleanup-Scheduler aktivieren
// Automatische Bereinigung inaktiver Geräte
console.log('Active Devices:', mqttStore.espDevices.size)

// Lösung 3: Aggregationen deaktivieren
// Reduziert Datenverarbeitung
centralDataHub.updateUiConfig({ showAggregations: false })
```

**Problem**: Memory-Leaks bei längerer Laufzeit

```javascript
// Debug: Memory-Usage überwachen
console.log('Memory Usage:', performance.memory)

// Lösung: Cache regelmäßig löschen
centralDataHub.clearCache()
databaseLogs.clearCache()
```

#### **Database Logs Probleme**

**Problem**: Daten werden nicht geladen

```javascript
// Debug: Filter-Einstellungen prüfen
console.log('Current Filters:', databaseLogs.filters)
console.log('Loading State:', databaseLogs.loading)
console.log('Error State:', databaseLogs.error)

// Lösung: Filter zurücksetzen
databaseLogs.resetFilters()
```

**Problem**: CSV-Export funktioniert nicht

```javascript
// Debug: Export-Einstellungen prüfen
console.log('Export Settings:', databaseLogs.exportSettings)

// Lösung: Export-Einstellungen zurücksetzen
databaseLogs.updateExportSettings({
  includeHeaders: true,
  dateFormat: 'ISO',
  decimalSeparator: '.',
  fieldSeparator: ',',
})
```

#### **Actuator Logic Probleme**

**Problem**: Logic-Evaluation funktioniert nicht

```javascript
// Debug: Logic-Status prüfen
console.log('Active Logics:', actuatorLogic.getAllActuatorLogics())
console.log('Logic Stats:', actuatorLogic.getExtendedLogicStats())

// Lösung: Logic-Prozess neu starten
await actuatorLogic.startLogicProcess(espId, gpio)
```

**Problem**: Prioritätskonflikte bei Aktoren

```javascript
// Debug: Aktive Zustände prüfen
console.log('Active States:', actuatorLogic.activeStates)

// Lösung: Manuellen Override löschen
await actuatorLogic.clearManualOverride(espId, gpio)
```

### **🔍 Debug-Tools**

#### **Browser Developer Tools**

```javascript
// MQTT Store Debug
console.log('MQTT Store:', window.$mqttStore)
console.log('ESP Devices:', window.$mqttStore.espDevices)
console.log('Connection Status:', window.$mqttStore.connectionStatus)

// Central Data Hub Debug
console.log('Central Data Hub:', window.$centralDataHub)
console.log('System Status:', window.$centralDataHub.systemStatus)

// Database Logs Debug
console.log('Database Logs:', window.$databaseLogs)
console.log('Current Data:', window.$databaseLogs.getCurrentData())
```

#### **MQTT Debug Panel**

Das MQTT Debug Panel (`src/components/debug/MqttDebugPanel.vue`) bietet:

- **Topic-Monitoring**: Live-Überwachung aller MQTT-Topics
- **Message-History**: Historie aller empfangenen Nachrichten
- **Connection-Testing**: Test der MQTT-Verbindung
- **Manual Publishing**: Manuelles Senden von MQTT-Nachrichten

#### **Device Simulator**

Der Device Simulator (`src/components/debug/DeviceSimulator.vue`) ermöglicht:

- **Simulation von ESP32-Geräten**: Test ohne echte Hardware
- **Sensor-Daten generieren**: Automatische Generierung von Testdaten
- **MQTT-Nachrichten senden**: Simulation von MQTT-Kommunikation

### **📊 Monitoring & Logging**

#### **Performance-Monitoring**

```javascript
// Performance-Metriken sammeln
const performanceMetrics = {
  mqttMessageCount: mqttStore.messageCache.size,
  activeDevices: mqttStore.espDevices.size,
  cacheHitRate: centralDataHub.getCacheHitRate(),
  memoryUsage: performance.memory?.usedJSHeapSize || 0,
}

console.log('Performance Metrics:', performanceMetrics)
```

#### **Error-Logging**

```javascript
// Error-Handler für zentrale Fehlerbehandlung
errorHandler.handleError(error, {
  context: 'MQTT_Connection',
  severity: 'error',
  user: 'system',
})
```

### **🛠️ System-Recovery**

#### **Automatische Wiederherstellung**

Das System verfügt über automatische Recovery-Mechanismen:

- **MQTT-Reconnection**: Automatische Wiederverbindung bei Verbindungsabbruch
- **Circuit Breaker**: Schutz vor kaskadierenden Fehlern
- **Cache-Recovery**: Automatische Wiederherstellung von Cache-Daten
- **State-Synchronisation**: Synchronisation aller Store-Zustände

#### **Manuelle Recovery-Prozeduren**

```bash
# 1. System neu starten
pm2 restart growy-frontend

# 2. Cache löschen
# Browser LocalStorage löschen oder Cache-Reset über UI

# 3. MQTT-Broker neu starten
sudo systemctl restart mosquitto

# 4. ESP32-Geräte neu starten
# Über System Commands Panel oder manuell
```

## 🧩 **Komponenten-Dokumentation**

### **📱 UI-Komponenten**

#### **🌳 Tree Components (Hierarchische Ansichten)**

**DeviceTreeView** (`src/components/device/DeviceTreeView.vue` - 13KB, 423 Zeilen)

```vue
<!-- Hierarchische Geräteansicht mit Filter und ESP-Auswahl -->
<template>
  <div class="device-tree-view">
    <!-- Global Filter Section -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-filter" class="mr-2" />
        Globale Filter
      </v-card-title>
      <v-card-text>
        <v-row>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="searchQuery"
              label="🔍 Suche nach ESP-Namen oder Subzonen"
              placeholder="z.B. ESP001, Tomaten, Gewächshaus..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              clearable
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-select
              v-model="statusFilter"
              label="🔘 Status-Filter"
              :items="statusFilterOptions"
              item-title="label"
              item-value="value"
              variant="outlined"
              density="comfortable"
              clearable
            />
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- ESP Selection -->
    <v-card variant="outlined" class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-chip" class="mr-2" />
        ESP-Gerät auswählen
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="selectedEspId"
          :items="filteredEspDevices"
          item-title="name"
          item-value="id"
          label="ESP-Gerät"
          variant="outlined"
          density="comfortable"
          @update:model-value="onEspChange"
        />
      </v-card-text>
    </v-card>

    <!-- Tree View für ausgewähltes ESP -->
    <v-expand-transition>
      <div v-if="selectedEspId" class="device-tree-content">
        <!-- ESP Header Card -->
        <v-card variant="elevated" class="mb-4 esp-header-card">
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-chip" color="primary" class="mr-2" />
            <span class="text-h6">{{
              selectedEspDevice?.espFriendlyName || `ESP ${selectedEspId}`
            }}</span>
            <v-chip :color="getDeviceStatusColor()" size="small" variant="tonal" class="ml-2">
              {{ getDeviceStatusText() }}
            </v-chip>
            <v-spacer />
            <v-chip color="info" size="small" variant="tonal">
              {{ selectedEspDevice?.zone || 'Unkonfiguriert' }}
            </v-chip>
          </v-card-title>
        </v-card>

        <!-- Subzone Cards -->
        <div v-if="sortedSubzones.length > 0" class="subzone-section">
          <h3 class="text-h5 mb-4 d-flex align-center">
            <v-icon icon="mdi-map-marker-multiple" color="secondary" class="mr-2" />
            Subzonen
            <v-chip color="secondary" size="small" variant="tonal" class="ml-2">
              {{ sortedSubzones.length }}
            </v-chip>
          </h3>

          <v-row>
            <v-col v-for="subzone in sortedSubzones" :key="subzone.id" cols="12" md="6" lg="4">
              <SubzoneTreeCard
                :esp-id="selectedEspId"
                :subzone="subzone"
                :unconfigured-pins="unconfiguredPins"
                @edit="editSubzone"
                @delete="deleteSubzone"
                @pin-drop="handlePinDrop"
              />
            </v-col>
          </v-row>
        </div>

        <!-- Unkonfigurierte Pins -->
        <div v-if="unconfiguredPins.length > 0" class="unconfigured-pins-section mt-6">
          <h3 class="text-h5 mb-4 d-flex align-center">
            <v-icon icon="mdi-pin-off" color="warning" class="mr-2" />
            Verfügbare Pins
            <v-chip color="warning" size="small" variant="tonal" class="ml-2">
              {{ unconfiguredPins.length }}
            </v-chip>
          </h3>

          <v-alert type="info" variant="tonal" class="mb-4">
            <strong>Pin-Konfiguration:</strong>
            Ziehen Sie Pins in Subzonen oder konfigurieren Sie sie direkt.
          </v-alert>

          <v-row>
            <v-col v-for="pin in unconfiguredPins" :key="pin" cols="12" sm="6" md="4" lg="3">
              <PinTreeCard :esp-id="selectedEspId" :pin="pin" @configure="configurePin" />
            </v-col>
          </v-row>
        </div>
      </div>
    </v-expand-transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useMqttStore } from '@/stores/mqtt'
import { useCentralConfigStore } from '@/stores/centralConfig'
import { useDeviceSynchronization } from '@/composables/useDeviceSynchronization'
import SubzoneTreeCard from './SubzoneTreeCard.vue'
import PinTreeCard from './PinTreeCard.vue'

// Props
const props = defineProps({
  espId: { type: String, default: null },
})

// Store Integration
const mqttStore = useMqttStore()
const centralConfig = useCentralConfigStore()
const deviceSync = useDeviceSynchronization()

// Reactive state
const selectedEspId = ref(props.espId || centralConfig.getSelectedEspId)
const searchQuery = ref('')
const statusFilter = ref('')
const sortMode = ref('alphabetical')

// Computed properties für gefilterte ESP-Geräte
const availableEspDevices = computed(() => {
  const devices = []
  deviceSync.synchronizedEspDevices.value.forEach((device) => {
    devices.push({
      id: device.espId,
      name: `${device.espFriendlyName || `ESP ${device.espId}`} (${device.zone || 'Unkonfiguriert'})`,
      status: device.status || 'offline',
      zone: device.zone,
    })
  })
  return devices
})

const filteredEspDevices = computed(() => {
  let devices = availableEspDevices.value

  // Search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    devices = devices.filter(
      (device) =>
        device.name.toLowerCase().includes(query) || device.zone?.toLowerCase().includes(query),
    )
  }

  // Status filter
  if (statusFilter.value) {
    devices = devices.filter((device) => device.status === statusFilter.value)
  }

  return devices
})

// Methods
const onEspChange = (espId) => {
  selectedEspId.value = espId
  centralConfig.setSelectedEspId(espId)
}

const getDeviceStatusColor = () => {
  const device = deviceSync.synchronizedEspDevices.value.find(
    (d) => d.espId === selectedEspId.value,
  )
  if (!device) return 'grey'

  switch (device.status) {
    case 'online':
      return 'success'
    case 'offline':
      return 'error'
    case 'warning':
      return 'warning'
    default:
      return 'grey'
  }
}

const getDeviceStatusText = () => {
  const device = deviceSync.synchronizedEspDevices.value.find(
    (d) => d.espId === selectedEspId.value,
  )
  return device?.status || 'Unbekannt'
}
</script>
```

**SubzoneTreeCard** (`src/components/device/SubzoneTreeCard.vue` - 6.3KB, 222 Zeilen)

```vue
<!-- Subzone-Baumstruktur mit Sensor- und Aktor-Verwaltung -->
<template>
  <v-card variant="outlined" class="subzone-tree-card">
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-map-marker" color="secondary" class="mr-2" />
      <span class="text-h6">{{ subzone.name }}</span>
      <v-chip color="secondary" size="small" variant="tonal" class="ml-2">
        {{ subzone.sensors?.size || 0 }} Sensoren
      </v-chip>
      <v-chip color="warning" size="small" variant="tonal" class="ml-1">
        {{ subzone.actuators?.size || 0 }} Aktoren
      </v-chip>
      <v-spacer />
      <v-menu>
        <template v-slot:activator="{ props }">
          <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" size="small" />
        </template>
        <v-list>
          <v-list-item @click="$emit('edit', subzone)">
            <v-list-item-title>Bearbeiten</v-list-item-title>
          </v-list-item>
          <v-list-item @click="$emit('delete', subzone)">
            <v-list-item-title>Löschen</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-card-title>

    <v-card-text>
      <!-- Sensor Section -->
      <div v-if="subzone.sensors && subzone.sensors.size > 0" class="sensor-section mb-4">
        <h4 class="text-subtitle-1 mb-2 d-flex align-center">
          <v-icon icon="mdi-thermometer" size="small" class="mr-1" />
          Sensoren
        </h4>
        <v-row>
          <v-col v-for="[gpio, sensor] in subzone.sensors" :key="gpio" cols="12" sm="6">
            <v-chip :color="getSensorColor(sensor.type)" size="small" variant="tonal" class="mb-1">
              <v-icon start size="16">{{ getSensorIcon(sensor.type) }}</v-icon>
              {{ sensor.name || `GPIO ${gpio}` }}
            </v-chip>
          </v-col>
        </v-row>
      </div>

      <!-- Actuator Section -->
      <div v-if="subzone.actuators && subzone.actuators.size > 0" class="actuator-section">
        <h4 class="text-subtitle-1 mb-2 d-flex align-center">
          <v-icon icon="mdi-toggle-switch" size="small" class="mr-1" />
          Aktoren
        </h4>
        <v-row>
          <v-col v-for="[gpio, actuator] in subzone.actuators" :key="gpio" cols="12" sm="6">
            <v-chip
              :color="getActuatorColor(actuator.type)"
              size="small"
              variant="tonal"
              class="mb-1"
            >
              <v-icon start size="16">{{ getActuatorIcon(actuator.type) }}</v-icon>
              {{ actuator.name || `GPIO ${gpio}` }}
            </v-chip>
          </v-col>
        </v-row>
      </div>

      <!-- Drop Zone für Pins -->
      <v-card
        v-if="unconfiguredPins.length > 0"
        variant="outlined"
        class="drop-zone mt-4"
        @drop="handlePinDrop"
        @dragover.prevent
        @dragenter.prevent
      >
        <v-card-text class="text-center py-8">
          <v-icon icon="mdi-plus" size="48" color="grey-lighten-1" class="mb-2" />
          <div class="text-body-2 text-grey">Pins hier hineinziehen um sie zu konfigurieren</div>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<script setup>
// Props
const props = defineProps({
  espId: { type: String, required: true },
  subzone: { type: Object, required: true },
  unconfiguredPins: { type: Array, default: () => [] },
})

// Events
const emit = defineEmits(['edit', 'delete', 'pin-drop'])

// Methods
const handlePinDrop = (event) => {
  const pinData = JSON.parse(event.dataTransfer.getData('text/plain'))
  emit('pin-drop', { pin: pinData, subzoneId: props.subzone.id })
}

const getSensorColor = (type) => {
  const colors = {
    SENSOR_TEMP_DS18B20: 'error',
    SENSOR_MOISTURE: 'info',
    SENSOR_LIGHT: 'warning',
    SENSOR_PH_DFROBOT: 'success',
  }
  return colors[type] || 'grey'
}

const getSensorIcon = (type) => {
  const icons = {
    SENSOR_TEMP_DS18B20: 'mdi-thermometer',
    SENSOR_MOISTURE: 'mdi-water-percent',
    SENSOR_LIGHT: 'mdi-white-balance-sunny',
    SENSOR_PH_DFROBOT: 'mdi-flask',
  }
  return icons[type] || 'mdi-help'
}

const getActuatorColor = (type) => {
  const colors = {
    ACTUATOR_PUMP: 'primary',
    ACTUATOR_LED: 'warning',
    ACTUATOR_HEATER: 'error',
    ACTUATOR_FAN: 'info',
  }
  return colors[type] || 'grey'
}

const getActuatorIcon = (type) => {
  const icons = {
    ACTUATOR_PUMP: 'mdi-pump',
    ACTUATOR_LED: 'mdi-lightbulb',
    ACTUATOR_HEATER: 'mdi-fire',
    ACTUATOR_FAN: 'mdi-fan',
  }
  return icons[type] || 'mdi-help'
}
</script>
```

**PinTreeCard** (`src/components/device/PinTreeCard.vue` - 5.7KB, 214 Zeilen)

```vue
<!-- Pin-Hierarchie mit Drag & Drop Funktionalität -->
<template>
  <v-card
    variant="outlined"
    class="pin-tree-card"
    draggable="true"
    @dragstart="handleDragStart"
    @click="showPinConfig"
  >
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-pin" color="grey" class="mr-2" />
      <span class="text-h6">GPIO {{ pin }}</span>
      <v-chip color="grey" size="small" variant="tonal" class="ml-2"> Verfügbar </v-chip>
    </v-card-title>

    <v-card-text>
      <div class="text-body-2 text-grey-darken-1 mb-3">Pin ist noch nicht konfiguriert</div>

      <v-btn variant="outlined" size="small" color="primary" @click.stop="showPinConfig">
        <v-icon start size="16">mdi-cog</v-icon>
        Konfigurieren
      </v-btn>
    </v-card-text>

    <!-- Pin Configuration Dialog -->
    <v-dialog v-model="showConfigDialog" max-width="500">
      <v-card>
        <v-card-title>Pin {{ pin }} konfigurieren</v-card-title>
        <v-card-text>
          <v-form ref="pinForm">
            <v-select
              v-model="pinConfig.type"
              label="Pin-Typ"
              :items="pinTypes"
              item-title="label"
              item-value="value"
              variant="outlined"
              required
            />

            <v-text-field
              v-model="pinConfig.name"
              label="Name"
              placeholder="z.B. Temperatursensor, Wasserpumpe"
              variant="outlined"
              required
            />

            <v-select
              v-model="pinConfig.subzoneId"
              label="Subzone"
              :items="availableSubzones"
              item-title="name"
              item-value="id"
              variant="outlined"
              clearable
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showConfigDialog = false">Abbrechen</v-btn>
          <v-btn color="primary" @click="configurePin">Konfigurieren</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useEspManagementStore } from '@/stores/espManagement'

// Props
const props = defineProps({
  espId: { type: String, required: true },
  pin: { type: String, required: true },
})

// Events
const emit = defineEmits(['configure'])

// Store
const espStore = useEspManagementStore()

// Reactive state
const showConfigDialog = ref(false)
const pinConfig = ref({
  type: '',
  name: '',
  subzoneId: null,
})

// Computed properties
const pinTypes = computed(() => [
  { label: 'Temperatursensor (DS18B20)', value: 'SENSOR_TEMP_DS18B20' },
  { label: 'Feuchtigkeitssensor', value: 'SENSOR_MOISTURE' },
  { label: 'Lichtsensor', value: 'SENSOR_LIGHT' },
  { label: 'pH-Sensor', value: 'SENSOR_PH_DFROBOT' },
  { label: 'Wasserpumpe', value: 'ACTUATOR_PUMP' },
  { label: 'LED', value: 'ACTUATOR_LED' },
  { label: 'Heizung', value: 'ACTUATOR_HEATER' },
  { label: 'Lüfter', value: 'ACTUATOR_FAN' },
])

const availableSubzones = computed(() => {
  return espStore.getSubzonesForEsp(props.espId) || []
})

// Methods
const handleDragStart = (event) => {
  const pinData = {
    espId: props.espId,
    pin: props.pin,
    type: 'unconfigured',
  }
  event.dataTransfer.setData('text/plain', JSON.stringify(pinData))
  event.dataTransfer.effectAllowed = 'move'
}

const showPinConfig = () => {
  showConfigDialog.value = true
}

const configurePin = async () => {
  try {
    await espStore.configurePinAssignment(props.espId, {
      gpio: props.pin,
      type: pinConfig.value.type,
      name: pinConfig.value.name,
      subzone: pinConfig.value.subzoneId,
      category: pinConfig.value.type.startsWith('SENSOR_') ? 'sensor' : 'actuator',
    })

    emit('configure', { pin: props.pin, config: pinConfig.value })
    showConfigDialog.value = false

    // Reset form
    pinConfig.value = { type: '', name: '', subzoneId: null }
  } catch (error) {
    console.error('Pin configuration failed:', error)
  }
}
</script>

<style scoped>
.pin-tree-card {
  cursor: pointer;
  transition: all 0.2s ease;
}

.pin-tree-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.pin-tree-card[draggable='true'] {
  cursor: grab;
}

.pin-tree-card[draggable='true']:active {
  cursor: grabbing;
}
</style>
```

#### **🔧 Common Components (Einheitliche Basis)**

**UnifiedCard** (`src/components/common/UnifiedCard.vue` - 5.1KB, 233 Zeilen)

```vue
<!-- Einheitliche Karten-Basis für alle Device-Cards und UI-Komponenten -->
<template>
  <v-card
    :class="cardClasses"
    :elevation="isSelected ? 8 : 2"
    :variant="variant"
    :color="color"
    :loading="loading"
    @click="handleSelect"
  >
    <!-- Card Header -->
    <v-card-title v-if="showHeader" class="d-flex align-center">
      <slot name="header-icon">
        <v-icon :icon="defaultIcon" :color="iconColor" class="mr-2" />
      </slot>
      <slot name="header-title">
        <span class="text-h6">{{ title }}</span>
      </slot>
      <v-spacer />
      <slot name="header-actions">
        <v-chip v-if="status" :color="statusColor" size="small" variant="tonal" class="mr-2">
          {{ status }}
        </v-chip>
        <v-menu v-if="showMenu">
          <template v-slot:activator="{ props }">
            <v-btn v-bind="props" icon="mdi-dots-vertical" variant="text" size="small" />
          </template>
          <v-list>
            <slot name="menu-items" />
          </v-list>
        </v-menu>
      </slot>
    </v-card-title>

    <!-- Card Content -->
    <v-card-text v-if="showContent">
      <slot name="content">
        <div class="text-body-2">{{ content }}</div>
      </slot>
    </v-card-text>

    <!-- Card Actions -->
    <v-card-actions v-if="showActions">
      <slot name="actions">
        <v-btn
          v-if="primaryAction"
          :color="primaryAction.color || 'primary'"
          :variant="primaryAction.variant || 'elevated'"
          @click="handlePrimaryAction"
        >
          <v-icon v-if="primaryAction.icon" start size="16">{{ primaryAction.icon }}</v-icon>
          {{ primaryAction.text }}
        </v-btn>
        <v-spacer />
        <v-btn
          v-if="secondaryAction"
          :color="secondaryAction.color || 'grey'"
          :variant="secondaryAction.variant || 'text'"
          @click="handleSecondaryAction"
        >
          <v-icon v-if="secondaryAction.icon" start size="16">{{ secondaryAction.icon }}</v-icon>
          {{ secondaryAction.text }}
        </v-btn>
      </slot>
    </v-card-actions>
  </v-card>
</template>

<script setup>
// Props
const props = defineProps({
  // Card Configuration
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  variant: { type: String, default: 'elevated' },
  color: { type: String, default: '' },

  // Status & Selection
  status: { type: String, default: '' },
  statusColor: { type: String, default: 'grey' },
  isSelected: { type: Boolean, default: false },

  // Icons & Actions
  defaultIcon: { type: String, default: 'mdi-help' },
  iconColor: { type: String, default: 'primary' },
  primaryAction: { type: Object, default: null },
  secondaryAction: { type: Object, default: null },

  // Display Options
  showHeader: { type: Boolean, default: true },
  showContent: { type: Boolean, default: true },
  showActions: { type: Boolean, default: false },
  showMenu: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },

  // Responsive
  compactMode: { type: Boolean, default: false },
})

// Events
const emit = defineEmits(['select', 'primary-action', 'secondary-action'])

// Computed properties
const cardClasses = computed(() => ({
  'unified-card': true,
  'unified-card--selected': props.isSelected,
  'unified-card--compact': props.compactMode,
}))

// Methods
const handleSelect = () => {
  emit('select')
}

const handlePrimaryAction = () => {
  emit('primary-action', props.primaryAction)
}

const handleSecondaryAction = () => {
  emit('secondary-action', props.secondaryAction)
}
</script>

<style scoped>
.unified-card {
  transition: all 0.3s ease;
  cursor: pointer;
}

.unified-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.unified-card--selected {
  border: 2px solid var(--v-primary-base);
  transform: translateY(-4px);
}

.unified-card--compact {
  padding: 0.5rem;
}

.unified-card--compact .v-card-title {
  padding: 0.5rem;
  font-size: 0.875rem;
}

.unified-card--compact .v-card-text {
  padding: 0.5rem;
  font-size: 0.75rem;
}

/* Mobile Optimization */
@media (max-width: 768px) {
  .unified-card {
    margin-bottom: 8px;
  }

  .unified-card:hover {
    transform: none;
  }
}
</style>
```

#### **🔧 Common Components**

**SystemStatusBar** (`src/components/common/SystemStatusBar.vue` - 11KB, 417 Zeilen)

```vue
<!-- System-Status-Anzeige mit Connection-Status und Kaiser-ID -->
<template>
  <v-app-bar :elevation="0" class="system-status-bar" height="48">
    <!-- Connection Status -->
    <v-tooltip location="bottom">
      <template v-slot:activator="{ props }">
        <v-icon v-bind="props" :color="getConnectionColor()" class="mr-2">
          {{ getConnectionIcon() }}
        </v-icon>
      </template>
      <div class="text-center">
        <div class="font-weight-medium">{{ getConnectionStatus() }}</div>
        <div class="text-caption">{{ getConnectionDetails() }}</div>
      </div>
    </v-tooltip>

    <!-- Kaiser ID Badge -->
    <v-chip color="white" size="small" variant="tonal">
      <v-icon start size="16">mdi-crown</v-icon>
      <span class="d-none d-sm-inline">{{ kaiserId }}</span>
    </v-chip>

    <!-- Autonomous Mode Indicator -->
    <v-chip v-if="autonomousMode" color="warning" size="small" class="mr-2">
      <v-icon start size="16">mdi-robot</v-icon>
      <span class="d-none d-sm-inline">Autonomous</span>
    </v-chip>

    <v-spacer />

    <!-- System Info -->
    <div class="d-none d-md-flex align-center">
      <v-chip color="info" size="small" variant="tonal" class="mr-2">
        <v-icon start size="16">mdi-chip</v-icon>
        {{ connectedDevices }} ESPs
      </v-chip>
      <v-chip color="success" size="small" variant="tonal">
        <v-icon start size="16">mdi-thermometer</v-icon>
        {{ activeSensors }} Sensoren
      </v-chip>
    </div>

    <!-- Theme Toggle -->
    <v-btn icon="mdi-theme-light-dark" variant="text" @click="toggleTheme" />
  </v-app-bar>
</template>

<script setup>
import { computed } from 'vue'
import { useMqttStore } from '@/stores/mqtt'
import { useThemeStore } from '@/stores/theme'

// Stores
const mqttStore = useMqttStore()
const themeStore = useThemeStore()

// Computed properties
const kaiserId = computed(() => mqttStore.getKaiserId || 'Unbekannt')
const autonomousMode = computed(() => mqttStore.kaiser?.autonomousMode || false)
const connectedDevices = computed(() => mqttStore.espDevices.size)
const activeSensors = computed(() => {
  let count = 0
  mqttStore.espDevices.forEach((device) => {
    if (device.subzones) {
      device.subzones.forEach((subzone) => {
        if (subzone.sensors) {
          count += subzone.sensors.size
        }
      })
    }
  })
  return count
})

// Methods
const getConnectionColor = () => {
  if (mqttStore.isConnected) return 'success'
  if (mqttStore.isConnecting) return 'warning'
  return 'error'
}

const getConnectionIcon = () => {
  if (mqttStore.isConnected) return 'mdi-wifi'
  if (mqttStore.isConnecting) return 'mdi-wifi-strength-1'
  return 'mdi-wifi-off'
}

const getConnectionStatus = () => {
  if (mqttStore.isConnected) return 'Verbunden'
  if (mqttStore.isConnecting) return 'Verbinde...'
  return 'Nicht verbunden'
}

const getConnectionDetails = () => {
  if (mqttStore.isConnected) {
    return `${mqttStore.connectionUrl} (${connectedDevices.value} Geräte)`
  }
  return mqttStore.connectionError || 'Verbindung fehlgeschlagen'
}

const toggleTheme = () => {
  themeStore.toggleTheme()
}
</script>
```

**GlobalSnackbar** (`src/components/common/GlobalSnackbar.vue` - 9.3KB, 315 Zeilen)

```vue
<!-- Zentrale Benachrichtigungs-Komponente -->
<template>
  <v-snackbar
    v-model="show"
    :timeout="currentMessage?.timeout || 4000"
    :color="currentMessage?.color || 'info'"
    :location="currentMessage?.location || 'bottom'"
    :max-width="currentMessage?.maxWidth || 400"
    class="global-snackbar"
  >
    <div class="d-flex align-center">
      <v-icon :icon="getIcon(currentMessage?.type)" class="mr-2" />
      <span class="flex-grow-1">{{ currentMessage?.text }}</span>
      <v-btn
        v-if="currentMessage?.action"
        variant="text"
        size="small"
        @click="handleAction"
        class="ml-2"
      >
        {{ currentMessage.action.text }}
      </v-btn>
    </div>
  </v-snackbar>
</template>

<script setup>
// Props
const props = defineProps({
  show: { type: Boolean, default: false },
  currentMessage: { type: Object, default: null },
})

// Events
const emit = defineEmits(['update:show', 'action'])

// Methods
const handleAction = () => {
  if (props.currentMessage?.action?.callback) {
    props.currentMessage.action.callback()
  }
  emit('action', props.currentMessage?.action)
}

// Utility Functions
const getIcon = (type) => {
  const icons = {
    success: 'mdi-check-circle',
    error: 'mdi-alert-circle',
    warning: 'mdi-alert',
    info: 'mdi-information',
  }
  return icons[type] || 'mdi-information'
}
</script>
```

**SystemStatusBar** (`src/components/common/SystemStatusBar.vue`)

```vue
<!-- System-Status-Anzeige -->
<template>
  <v-app-bar :elevation="0" class="system-status-bar" height="48">
    <!-- Connection Status -->
    <v-tooltip location="bottom">
      <template v-slot:activator="{ props }">
        <v-icon v-bind="props" :color="getConnectionColor()" class="mr-2">
          {{ getConnectionIcon() }}
        </v-icon>
      </template>
      <div class="text-center">
        <div class="font-weight-medium">{{ getConnectionStatus() }}</div>
        <div class="text-caption">{{ getConnectionDetails() }}</div>
      </div>
    </v-tooltip>

    <!-- Kaiser ID Badge -->
    <v-chip color="white" size="small" variant="tonal">
      <v-icon start size="16">mdi-crown</v-icon>
      <span class="d-none d-sm-inline">{{ kaiserId }}</span>
    </v-chip>

    <!-- Autonomous Mode Indicator -->
    <v-chip v-if="autonomousMode" color="warning" size="small" class="mr-2">
      <v-icon start size="16">mdi-robot</v-icon>
      <span class="d-none d-sm-inline">Autonomous</span>
    </v-chip>
  </v-app-bar>
</template>

<script setup>
// Props
const props = defineProps({
  connectionStatus: { type: String, default: 'unknown' },
  kaiserId: { type: String, required: true },
  autonomousMode: { type: Boolean, default: false },
  lastUpdate: { type: Date, default: null },
})

// Methods
const getConnectionColor = () => {
  const colors = {
    connected: 'success',
    connecting: 'warning',
    disconnected: 'error',
    unknown: 'grey',
  }
  return colors[props.connectionStatus] || 'grey'
}

const getConnectionIcon = () => {
  const icons = {
    connected: 'mdi-wifi',
    connecting: 'mdi-wifi-strength-2',
    disconnected: 'mdi-wifi-off',
    unknown: 'mdi-help-circle',
  }
  return icons[props.connectionStatus] || 'mdi-help-circle'
}

const getConnectionStatus = () => {
  return props.connectionStatus.charAt(0).toUpperCase() + props.connectionStatus.slice(1)
}

const getConnectionDetails = () => {
  if (props.lastUpdate) {
    return `Last update: ${formatRelativeTime(props.lastUpdate)}`
  }
  return ''
}
</script>
```

#### **📊 Dashboard Components**

**SensorVisualization** (`src/components/dashboard/SensorVisualization.vue`)

```vue
<!-- Sensor-Daten-Visualisierung -->
<template>
  <v-card class="sensor-visualization">
    <v-card-title class="d-flex align-center">
      <v-icon :color="getSensorColor()" class="mr-2">
        {{ getSensorIcon() }}
      </v-icon>
      <span>{{ sensorData.name }}</span>
      <v-spacer />
      <v-chip :color="getValueColor()" size="small">
        {{ formatValue(sensorData.value) }}
      </v-chip>
    </v-card-title>

    <v-card-text>
      <!-- Chart Integration -->
      <LineChart v-if="showChart" :chart-data="chartData" :options="chartOptions" :height="200" />

      <!-- Value Display -->
      <div v-else class="value-display">
        <div class="current-value">
          {{ formatValue(sensorData.value) }}
        </div>
        <div class="unit">{{ sensorData.unit }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup>
// Props
const props = defineProps({
  sensorData: { type: Object, required: true },
  showChart: { type: Boolean, default: false },
  timeRange: { type: String, default: '1h' },
  chartData: { type: Object, default: () => ({}) },
  chartOptions: { type: Object, default: () => ({}) },
})

// Methods
const getSensorColor = () => {
  const colors = {
    temperature: 'red',
    humidity: 'blue',
    pressure: 'green',
    light: 'yellow',
    soil: 'brown',
  }
  return colors[props.sensorData.type] || 'grey'
}

const getSensorIcon = () => {
  const icons = {
    temperature: 'mdi-thermometer',
    humidity: 'mdi-water-percent',
    pressure: 'mdi-gauge',
    light: 'mdi-white-balance-sunny',
    soil: 'mdi-sprout',
  }
  return icons[props.sensorData.type] || 'mdi-help-circle'
}

const getValueColor = () => {
  const value = Number(props.sensorData.value)
  const warnings = props.sensorData.warnings || []

  if (warnings.length > 0) return 'warning'
  if (value > props.sensorData.maxThreshold) return 'error'
  if (value < props.sensorData.minThreshold) return 'error'
  return 'success'
}

const formatValue = (value) => {
  return Number(value).toFixed(props.sensorData.decimals || 1)
}
</script>

<style scoped>
.sensor-visualization {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.value-display {
  text-align: center;
  padding: 20px;
}

.current-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--v-primary-base);
}

.unit {
  font-size: 0.9rem;
  color: var(--v-text-secondary);
  margin-top: 4px;
}

/* Responsive Design */
@media (max-width: 768px) {
  .current-value {
    font-size: 1.5rem;
  }
}
</style>
```

#### **⚙️ Settings Components**

**EnhancedPinConfiguration** (`src/components/settings/EnhancedPinConfiguration.vue`)

```vue
<!-- Erweiterte Pin-Konfiguration -->
<template>
  <v-card class="pin-configuration">
    <v-card-title>
      <v-icon class="mr-2">mdi-pin</v-icon>
      Pin-Konfiguration
    </v-card-title>

    <v-card-text>
      <!-- Board Type Selection -->
      <v-select
        v-model="selectedBoardType"
        :items="availableBoardTypes"
        label="Board-Typ"
        @update:model-value="handleBoardTypeChange"
      />

      <!-- Pin Configuration Grid -->
      <v-row>
        <v-col v-for="pin in availablePins" :key="pin.gpio" cols="12" sm="6" md="4" lg="3">
          <PinCard
            :pin="pin"
            :board-type="selectedBoardType"
            :sensor-config="getSensorConfig(pin.gpio)"
            @configure="handlePinConfigure"
            @remove="handlePinRemove"
          />
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup>
// Props
const props = defineProps({
  espId: { type: String, required: true },
  currentConfig: { type: Object, default: () => ({}) },
  boardType: { type: String, default: 'ESP32_DEVKIT' },
})

// Events
const emit = defineEmits(['update:config', 'save', 'validate'])

// Reactive Data
const selectedBoardType = ref(props.boardType)
const availableBoardTypes = [
  { title: 'ESP32 DevKit', value: 'ESP32_DEVKIT' },
  { title: 'XIAO ESP32-C3', value: 'XIAO_ESP32_C3' },
]

// Methods
const handleBoardTypeChange = (newType) => {
  emit('update:config', { boardType: newType })
  validateConfiguration()
}

const handlePinConfigure = (gpio, config) => {
  const newConfig = { ...props.currentConfig }
  newConfig.pins = newConfig.pins || {}
  newConfig.pins[gpio] = config
  emit('update:config', newConfig)
}

const handlePinRemove = (gpio) => {
  const newConfig = { ...props.currentConfig }
  if (newConfig.pins) {
    delete newConfig.pins[gpio]
  }
  emit('update:config', newConfig)
}

const validateConfiguration = () => {
  // Pin-Kompatibilität prüfen
  const validation = validatePinCompatibility(selectedBoardType.value, props.currentConfig)
  emit('validate', validation)
}
</script>
```

### **🎨 Styling & CSS-Klassen**

#### **Responsive Design**

```css
/* Mobile-First Approach */
.device-card {
  margin-bottom: 8px;
}

@media (min-width: 768px) {
  .device-card {
    margin-bottom: 16px;
  }
}

@media (min-width: 1024px) {
  .device-card {
    margin-bottom: 24px;
  }
}

/* Compact Mode */
.compact-mode .device-card {
  margin-bottom: 4px;
}

.compact-mode .card-content {
  padding: 8px;
}

/* Dark Theme Support */
[data-theme='dark'] .device-card {
  background-color: var(--v-surface-dark);
  color: var(--v-text-primary-dark);
}
```

#### **Accessibility Features**

```vue
<!-- ARIA-Labels und Keyboard Navigation -->
<template>
  <v-card
    :aria-label="`${deviceData.name} - ${deviceData.type}`"
    :aria-describedby="`device-${deviceData.id}-description`"
    tabindex="0"
    @keydown.enter="handleSelect"
    @keydown.space="handleSelect"
  >
    <div :id="`device-${deviceData.id}-description`" class="sr-only">
      {{ getAccessibilityDescription() }}
    </div>
  </v-card>
</template>

<script setup>
const getAccessibilityDescription = () => {
  return (
    `${props.deviceData.name} ist ein ${props.deviceData.type} Gerät. ` +
    `Status: ${props.deviceData.status}. ` +
    `Letzte Aktualisierung: ${formatTime(props.deviceData.lastUpdate)}`
  )
}
</script>

<style>
/* Screen Reader Only */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
```

#### **Loading States**

```vue
<!-- Loading States Komponente -->
<template>
  <div class="loading-container">
    <v-skeleton-loader v-if="loading" :type="skeletonType" :loading="loading" class="mx-auto" />

    <div v-else-if="error" class="error-state">
      <v-icon color="error" size="48">mdi-alert-circle</v-icon>
      <p class="error-message">{{ error }}</p>
      <v-btn @click="retry" color="primary">Erneut versuchen</v-btn>
    </div>

    <slot v-else />
  </div>
</template>

<script setup>
// Props
const props = defineProps({
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  skeletonType: { type: String, default: 'card' },
})

// Events
const emit = defineEmits(['retry'])

// Methods
const retry = () => emit('retry')
</script>
```

## ⚡ **Performance-Optimierungen**

### **🚀 Caching-Strategien**

#### **Central Data Hub Cache**

```javascript
// Performance-Cache mit Timeout
const dataCache = new Map()
const cacheTimeout = 5 * 60 * 1000 // 5 Minuten

// Cache-Hit-Rate Optimierung
const getOptimizedDeviceData = async (espId) => {
  const cacheKey = `device_${espId}`
  const cached = dataCache.get(cacheKey)

  if (cached && Date.now() - cached.timestamp < cacheTimeout) {
    return cached.data // Cache-Hit
  }

  // Cache-Miss: Daten laden und cachen
  const data = await loadDeviceData(espId)
  dataCache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  })

  return data
}

// Cache-Management
const clearCache = () => {
  dataCache.clear()
}

const cleanupExpiredCache = () => {
  const now = Date.now()
  for (const [key, value] of dataCache.entries()) {
    if (now - value.timestamp > cacheTimeout) {
      dataCache.delete(key)
    }
  }
}
```

#### **MQTT Message Cache**

```javascript
// Begrenzte Message-Speicherung für Performance
const messageCache = new Map()
const maxMessages = 1000 // Maximal 1000 Nachrichten pro Topic

const addMessage = (topic, message) => {
  if (!messageCache.has(topic)) {
    messageCache.set(topic, [])
  }

  const messages = messageCache.get(topic)
  messages.push(message)

  // Begrenzung auf maxMessages
  if (messages.length > maxMessages) {
    messages.shift() // Älteste Nachricht entfernen
  }
}

// Cleanup-Scheduler für inaktive Geräte
const cleanupInactiveDevices = () => {
  const now = Date.now()
  const inactiveThreshold = 5 * 60 * 1000 // 5 Minuten

  for (const [espId, device] of espDevices.entries()) {
    if (now - device.lastSeen > inactiveThreshold) {
      espDevices.delete(espId)
      messageCache.delete(espId)
    }
  }
}
```

### **📦 Lazy Loading**

#### **Komponenten-Lazy-Loading**

```javascript
// Router mit Lazy Loading
const routes = [
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: () => import('@/views/DashboardView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/database-logs',
    name: 'DatabaseLogs',
    component: () => import('@/views/DatabaseLogsView.vue'),
    meta: { requiresAuth: true },
  },
]
```

#### **Store-Lazy-Loading**

```javascript
// Stores nur bei Bedarf laden
const loadStoreOnDemand = async (storeName) => {
  switch (storeName) {
    case 'databaseLogs':
      return await import('@/stores/databaseLogs.js')
    case 'actuatorLogic':
      return await import('@/stores/actuatorLogic.js')
    default:
      throw new Error(`Unknown store: ${storeName}`)
  }
}

// Central Data Hub mit Lazy Store Loading
const getStore = async (storeName) => {
  if (!storeReferences[storeName]) {
    const storeModule = await loadStoreOnDemand(storeName)
    storeReferences[storeName] = storeModule.default()
  }
  return storeReferences[storeName]
}
```

### **💾 Memory Management**

#### **Memory-Optimierung für große Geräteanzahlen**

```javascript
// Memory-Effiziente Datenstrukturen
class OptimizedDeviceManager {
  constructor() {
    this.devices = new Map() // O(1) Lookup
    this.sensors = new Map() // Sensor-Registry
    this.actuators = new Map() // Aktor-Registry
    this.messageQueue = [] // Begrenzte Queue
  }

  // Memory-Limits
  addDevice(espId, deviceData) {
    if (this.devices.size >= 100) {
      // Max 100 Geräte
      this.removeOldestDevice()
    }
    this.devices.set(espId, deviceData)
  }

  // Memory-Cleanup
  removeOldestDevice() {
    const oldest = this.devices.keys().next().value
    this.devices.delete(oldest)
    this.sensors.delete(oldest)
    this.actuators.delete(oldest)
  }

  // Memory-Monitoring
  getMemoryUsage() {
    return {
      devices: this.devices.size,
      sensors: this.sensors.size,
      actuators: this.actuators.size,
      queueSize: this.messageQueue.length,
    }
  }
}
```

#### **Garbage Collection Optimierung**

```javascript
// WeakMap für temporäre Referenzen
const temporaryData = new WeakMap()

// WeakRef für große Objekte
const largeDataCache = new Map()
const weakRefs = new Map()

const cacheLargeData = (key, data) => {
  const weakRef = new WeakRef(data)
  weakRefs.set(key, weakRef)

  // Cleanup nach 10 Minuten
  setTimeout(
    () => {
      weakRefs.delete(key)
    },
    10 * 60 * 1000,
  )
}

const getLargeData = (key) => {
  const weakRef = weakRefs.get(key)
  if (weakRef) {
    const data = weakRef.deref()
    if (data) {
      return data
    }
    // Objekt wurde garbage collected
    weakRefs.delete(key)
  }
  return null
}
```

### **📊 Bundle-Optimierung**

#### **Code-Splitting**

```javascript
// Vite-Konfiguration für optimierte Bundles
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor-Chunks
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'vuetify-vendor': ['vuetify', '@mdi/font'],
          'mqtt-vendor': ['mqtt'],
          'chart-vendor': ['chart.js', 'vue-chartjs'],

          // Feature-Chunks
          dashboard: ['./src/views/DashboardView.vue', './src/components/dashboard/'],
          settings: ['./src/views/SettingsView.vue', './src/components/settings/'],
          database: ['./src/views/DatabaseLogsView.vue', './src/stores/databaseLogs.js'],
        },
      },
    },

    // Tree-Shaking optimieren
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
  },
})
```

#### **Dynamic Imports**

```javascript
// Dynamische Imports für bessere Performance
const loadComponent = async (componentName) => {
  const components = {
    SensorVisualization: () => import('@/components/dashboard/SensorVisualization.vue'),
    DeviceCard: () => import('@/components/common/UnifiedCard.vue'),
    PinConfiguration: () => import('@/components/settings/EnhancedPinConfiguration.vue'),
  }

  return await components[componentName]()
}

// Async Components
const AsyncSensorVisualization = defineAsyncComponent(
  () => import('@/components/dashboard/SensorVisualization.vue'),
)
```

### **🔧 Performance-Monitoring**

#### **Performance-Metriken**

```javascript
// Performance-Monitoring System
class PerformanceMonitor {
  constructor() {
    this.metrics = new Map()
    this.startTime = performance.now()
  }

  // MQTT Performance
  trackMqttPerformance() {
    const mqttMetrics = {
      messageCount: mqttStore.messageCache.size,
      connectionQuality: mqttStore.connectionQuality,
      averageLatency: this.calculateAverageLatency(),
      messageThroughput: this.calculateMessageThroughput(),
    }

    this.metrics.set('mqtt', mqttMetrics)
  }

  // UI Performance
  trackUIPerformance() {
    const uiMetrics = {
      renderTime: performance.now() - this.startTime,
      componentCount: this.countActiveComponents(),
      memoryUsage: performance.memory?.usedJSHeapSize || 0,
      cacheHitRate: this.calculateCacheHitRate(),
    }

    this.metrics.set('ui', uiMetrics)
  }

  // Memory Performance
  trackMemoryPerformance() {
    const memoryMetrics = {
      totalDevices: mqttStore.espDevices.size,
      totalSensors: sensorRegistry.sensors.size,
      cacheSize: centralDataHub.dataCache.size,
      memoryUsage: performance.memory?.usedJSHeapSize || 0,
    }

    this.metrics.set('memory', memoryMetrics)
  }

  // Performance-Report generieren
  generateReport() {
    return {
      timestamp: new Date().toISOString(),
      mqtt: this.metrics.get('mqtt'),
      ui: this.metrics.get('ui'),
      memory: this.metrics.get('memory'),
      recommendations: this.generateRecommendations(),
    }
  }

  // Performance-Empfehlungen
  generateRecommendations() {
    const recommendations = []

    if (this.metrics.get('memory').memoryUsage > 50 * 1024 * 1024) {
      recommendations.push('Memory usage high - consider clearing cache')
    }

    if (this.metrics.get('mqtt').averageLatency > 1000) {
      recommendations.push('MQTT latency high - check network connection')
    }

    return recommendations
  }
}
```

#### **Real-time Performance-Dashboard**

```vue
<!-- Performance-Dashboard Komponente -->
<template>
  <v-card class="performance-dashboard">
    <v-card-title>
      <v-icon class="mr-2">mdi-speedometer</v-icon>
      Performance Monitor
    </v-card-title>

    <v-card-text>
      <!-- MQTT Performance -->
      <v-row>
        <v-col cols="12" md="4">
          <v-card class="metric-card">
            <v-card-title>MQTT Performance</v-card-title>
            <v-card-text>
              <div class="metric">
                <span>Messages:</span>
                <span>{{ mqttMetrics.messageCount }}</span>
              </div>
              <div class="metric">
                <span>Latency:</span>
                <span>{{ mqttMetrics.averageLatency }}ms</span>
              </div>
              <div class="metric">
                <span>Throughput:</span>
                <span>{{ mqttMetrics.messageThroughput }}/s</span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- UI Performance -->
        <v-col cols="12" md="4">
          <v-card class="metric-card">
            <v-card-title>UI Performance</v-card-title>
            <v-card-text>
              <div class="metric">
                <span>Render Time:</span>
                <span>{{ uiMetrics.renderTime }}ms</span>
              </div>
              <div class="metric">
                <span>Components:</span>
                <span>{{ uiMetrics.componentCount }}</span>
              </div>
              <div class="metric">
                <span>Cache Hit Rate:</span>
                <span>{{ uiMetrics.cacheHitRate }}%</span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- Memory Performance -->
        <v-col cols="12" md="4">
          <v-card class="metric-card">
            <v-card-title>Memory Performance</v-card-title>
            <v-card-text>
              <div class="metric">
                <span>Devices:</span>
                <span>{{ memoryMetrics.totalDevices }}</span>
              </div>
              <div class="metric">
                <span>Sensors:</span>
                <span>{{ memoryMetrics.totalSensors }}</span>
              </div>
              <div class="metric">
                <span>Memory Usage:</span>
                <span>{{ formatBytes(memoryMetrics.memoryUsage) }}</span>
              </div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Performance Recommendations -->
      <v-alert v-if="recommendations.length > 0" type="warning" class="mt-4">
        <template v-slot:title>Performance Recommendations</template>
        <ul>
          <li v-for="rec in recommendations" :key="rec">{{ rec }}</li>
        </ul>
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { PerformanceMonitor } from '@/utils/performanceMonitor'

const performanceMonitor = new PerformanceMonitor()
const mqttMetrics = ref({})
const uiMetrics = ref({})
const memoryMetrics = ref({})
const recommendations = ref([])

let monitoringInterval

onMounted(() => {
  // Performance-Monitoring starten
  monitoringInterval = setInterval(() => {
    performanceMonitor.trackMqttPerformance()
    performanceMonitor.trackUIPerformance()
    performanceMonitor.trackMemoryPerformance()

    const report = performanceMonitor.generateReport()
    mqttMetrics.value = report.mqtt
    uiMetrics.value = report.ui
    memoryMetrics.value = report.memory
    recommendations.value = report.recommendations
  }, 5000) // Alle 5 Sekunden aktualisieren
})

onUnmounted(() => {
  if (monitoringInterval) {
    clearInterval(monitoringInterval)
  }
})

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>
```

### **🎯 Performance-Best-Practices**

#### **Vue.js Optimierungen**

```javascript
// 1. Computed Properties für teure Berechnungen
const expensiveCalculation = computed(() => {
  return heavyDataProcessing(props.data)
})

// 2. v-memo für bedingte Re-Rendering
<template>
  <div v-memo="[sensorData.value, sensorData.timestamp]">
    {{ formatSensorValue(sensorData.value) }}
  </div>
</template>

// 3. Shallow Ref für große Objekte
const largeObject = shallowRef({
  // Große Datenstruktur
})

// 4. Teleport für modale Komponenten
<teleport to="body">
  <ModalComponent />
</teleport>
```

#### **MQTT Optimierungen**

```javascript
// 1. Topic-Subscription optimieren
const subscribeToTopics = (topics) => {
  topics.forEach((topic) => {
    if (!subscribedTopics.has(topic)) {
      client.subscribe(topic, { qos: 1 })
      subscribedTopics.add(topic)
    }
  })
}

// 2. Message-Batching
const messageQueue = []
const batchSize = 10
const batchTimeout = 100 // ms

const addToBatch = (message) => {
  messageQueue.push(message)

  if (messageQueue.length >= batchSize) {
    processBatch()
  } else if (messageQueue.length === 1) {
    setTimeout(processBatch, batchTimeout)
  }
}

// 3. Connection-Pooling
const connectionPool = new Map()
const maxConnections = 5

const getConnection = async (brokerUrl) => {
  if (connectionPool.has(brokerUrl)) {
    return connectionPool.get(brokerUrl)
  }

  if (connectionPool.size >= maxConnections) {
    // Älteste Verbindung schließen
    const oldest = connectionPool.keys().next().value
    connectionPool.delete(oldest)
  }

  const connection = await createMqttConnection(brokerUrl)
  connectionPool.set(brokerUrl, connection)
  return connection
}
```

## 🧪 **Testing & Quality Assurance**

### **🔬 Unit-Tests**

#### **Store-Tests**

**MQTT Store Tests** (`src/tests/stores/mqtt.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useMqttStore } from '@/stores/mqtt'

describe('MQTT Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should initialize with default state', () => {
    const store = useMqttStore()

    expect(store.connectionStatus).toBe('disconnected')
    expect(store.espDevices.size).toBe(0)
    expect(store.messageCache.size).toBe(0)
  })

  it('should connect to MQTT broker', async () => {
    const store = useMqttStore()

    await store.connectToMqtt()

    expect(store.connectionStatus).toBe('connected')
    expect(store.client).toBeDefined()
  })

  it('should handle ESP device discovery', () => {
    const store = useMqttStore()
    const espData = {
      esp_id: 'ESP32_001',
      board_type: 'XIAO_ESP32_C3',
      sensors: [],
      actuators: [],
    }

    store.handleEspDiscovery(espData)

    expect(store.espDevices.has('ESP32_001')).toBe(true)
    expect(store.espDevices.get('ESP32_001')).toEqual(espData)
  })

  it('should process sensor data correctly', () => {
    const store = useMqttStore()
    const sensorData = {
      esp_id: 'ESP32_001',
      gpio: 2,
      value: 25.5,
      unit: '°C',
      timestamp: Date.now(),
    }

    store.processSensorData(sensorData)

    const device = store.espDevices.get('ESP32_001')
    expect(device.sensors.get(2)).toEqual(sensorData)
  })

  it('should handle connection errors gracefully', async () => {
    const store = useMqttStore()

    // Mock failed connection
    vi.spyOn(store, 'createMqttClient').mockRejectedValue(new Error('Connection failed'))

    await store.connectToMqtt()

    expect(store.connectionStatus).toBe('error')
    expect(store.error).toBe('Connection failed')
  })
})
```

**Database Logs Store Tests** (`src/tests/stores/databaseLogs.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDatabaseLogsStore } from '@/stores/databaseLogs'

describe('Database Logs Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should load sensor data with filters', async () => {
    const store = useDatabaseLogsStore()
    const mockData = [
      { esp_id: 'ESP32_001', value: 25.5, timestamp: '2024-01-01T10:00:00Z' },
      { esp_id: 'ESP32_002', value: 26.0, timestamp: '2024-01-01T10:01:00Z' },
    ]

    // Mock API response
    vi.spyOn(store, 'apiService.getSensorData').mockResolvedValue(mockData)

    await store.loadData('sensor_data')

    expect(store.getCurrentData).toEqual(mockData)
    expect(store.loading).toBe(false)
    expect(store.error).toBe(null)
  })

  it('should filter data by ESP ID', () => {
    const store = useDatabaseLogsStore()
    store.dataCache.sensor_data = [
      { esp_id: 'ESP32_001', value: 25.5 },
      { esp_id: 'ESP32_002', value: 26.0 },
    ]

    store.updateFilters({ espId: 'ESP32_001' })

    expect(store.getFilteredData).toHaveLength(1)
    expect(store.getFilteredData[0].esp_id).toBe('ESP32_001')
  })

  it('should export data as CSV', async () => {
    const store = useDatabaseLogsStore()
    store.dataCache.sensor_data = [
      { esp_id: 'ESP32_001', value: 25.5, timestamp: '2024-01-01T10:00:00Z' },
    ]

    const csvData = await store.executeExport('sensor_data')

    expect(csvData).toContain('esp_id,value,timestamp')
    expect(csvData).toContain('ESP32_001,25.5,2024-01-01T10:00:00Z')
  })
})
```

**Actuator Logic Store Tests** (`src/tests/stores/actuatorLogic.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useActuatorLogicStore } from '@/stores/actuatorLogic'

describe('Actuator Logic Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should evaluate actuator state with priority', () => {
    const store = useActuatorLogicStore()
    const espId = 'ESP32_001'
    const gpio = 5

    // Set up test conditions
    store.setManualOverride(espId, gpio, true, 'test')
    store.configureActuatorLogic(espId, gpio, {
      enabled: true,
      conditions: [{ sensorGpio: 2, operator: '>', threshold: 25 }],
    })

    const result = store.evaluateActuatorState(espId, gpio, 'ACTUATOR_PUMP')

    expect(result.state).toBe(true)
    expect(result.source).toBe('MANUAL')
    expect(result.priority).toBe(90)
  })

  it('should resolve priority conflicts correctly', () => {
    const store = useActuatorLogicStore()
    const states = [
      { state: true, source: 'LOGIC', priority: 70 },
      { state: false, source: 'MANUAL', priority: 90 },
    ]

    const result = store.resolvePriority(states, 'ACTUATOR_PUMP')

    expect(result.state).toBe(false)
    expect(result.source).toBe('MANUAL')
    expect(result.priority).toBe(90)
  })

  it('should validate logic configuration', () => {
    const store = useActuatorLogicStore()
    const validConfig = {
      enabled: true,
      conditions: [{ sensorGpio: 2, operator: '>', threshold: 25 }],
      timers: [],
      events: [],
    }

    const result = store.validateLogicConfig(validConfig, 'ACTUATOR_PUMP')

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
```

#### **Composable Tests**

**useMqttFeedback Tests** (`src/tests/composables/useMqttFeedback.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useMqttFeedback } from '@/composables/useMqttFeedback'

describe('useMqttFeedback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide MQTT feedback functionality', () => {
    const { sendFeedback, getFeedbackHistory, clearFeedback } = useMqttFeedback()

    expect(typeof sendFeedback).toBe('function')
    expect(typeof getFeedbackHistory).toBe('function')
    expect(typeof clearFeedback).toBe('function')
  })

  it('should send feedback and store in history', () => {
    const { sendFeedback, getFeedbackHistory } = useMqttFeedback()

    sendFeedback('test_topic', { message: 'test' }, 'success')

    const history = getFeedbackHistory()
    expect(history).toHaveLength(1)
    expect(history[0].topic).toBe('test_topic')
    expect(history[0].payload).toEqual({ message: 'test' })
    expect(history[0].status).toBe('success')
  })

  it('should clear feedback history', () => {
    const { sendFeedback, getFeedbackHistory, clearFeedback } = useMqttFeedback()

    sendFeedback('test_topic', { message: 'test' }, 'success')
    expect(getFeedbackHistory()).toHaveLength(1)

    clearFeedback()
    expect(getFeedbackHistory()).toHaveLength(0)
  })
})
```

### **🧩 Component Tests**

#### **Device Card Tests**

**KaiserDeviceCard Tests** (`src/tests/components/KaiserDeviceCard.test.js`)

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import KaiserDeviceCard from '@/components/device/KaiserDeviceCard.vue'

describe('KaiserDeviceCard', () => {
  const defaultProps = {
    kaiserData: {
      id: 'Pi0',
      status: 'online',
      godConnection: {
        status: 'connected',
        lastPushSync: Date.now(),
      },
    },
    isSelected: false,
  }

  it('should render kaiser information correctly', () => {
    const wrapper = mount(KaiserDeviceCard, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Pi0')
    expect(wrapper.find('.kaiser-header').exists()).toBe(true)
  })

  it('should emit select event when clicked', async () => {
    const wrapper = mount(KaiserDeviceCard, {
      props: defaultProps,
    })

    await wrapper.trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')[0]).toEqual([defaultProps.kaiserData])
  })

  it('should show selected state correctly', () => {
    const wrapper = mount(KaiserDeviceCard, {
      props: { ...defaultProps, isSelected: true },
    })

    expect(wrapper.classes()).toContain('selected')
    expect(wrapper.attributes('aria-selected')).toBe('true')
  })

  it('should display connection status correctly', () => {
    const wrapper = mount(KaiserDeviceCard, {
      props: {
        ...defaultProps,
        kaiserData: {
          ...defaultProps.kaiserData,
          godConnection: { status: 'disconnected' },
        },
      },
    })

    const statusChip = wrapper.find('.v-chip')
    expect(statusChip.text()).toContain('disconnected')
  })
})
```

**SensorVisualization Tests** (`src/tests/components/SensorVisualization.test.js`)

```javascript
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import SensorVisualization from '@/components/dashboard/SensorVisualization.vue'

describe('SensorVisualization', () => {
  const defaultProps = {
    sensorData: {
      name: 'Temperature Sensor',
      value: 25.5,
      unit: '°C',
      type: 'temperature',
      warnings: [],
    },
    showChart: false,
  }

  it('should render sensor data correctly', () => {
    const wrapper = mount(SensorVisualization, {
      props: defaultProps,
    })

    expect(wrapper.text()).toContain('Temperature Sensor')
    expect(wrapper.text()).toContain('25.5')
    expect(wrapper.text()).toContain('°C')
  })

  it('should show chart when showChart is true', () => {
    const wrapper = mount(SensorVisualization, {
      props: { ...defaultProps, showChart: true },
    })

    expect(wrapper.findComponent({ name: 'LineChart' }).exists()).toBe(true)
  })

  it('should apply correct color based on sensor type', () => {
    const wrapper = mount(SensorVisualization, {
      props: defaultProps,
    })

    const icon = wrapper.find('.v-icon')
    expect(icon.attributes('color')).toBe('red') // temperature color
  })

  it('should show warning color when warnings exist', () => {
    const wrapper = mount(SensorVisualization, {
      props: {
        ...defaultProps,
        sensorData: {
          ...defaultProps.sensorData,
          warnings: ['high_temperature'],
        },
      },
    })

    const valueChip = wrapper.find('.v-chip')
    expect(valueChip.attributes('color')).toBe('warning')
  })
})
```

### **🔗 Integration Tests**

#### **MQTT Communication Tests**

**MQTT Integration Tests** (`src/tests/integration/mqtt.test.js`)

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useMqttStore } from '@/stores/mqtt'
import { useSensorRegistryStore } from '@/stores/sensorRegistry'

describe('MQTT Integration', () => {
  let mqttStore
  let sensorRegistry

  beforeEach(() => {
    mqttStore = useMqttStore()
    sensorRegistry = useSensorRegistryStore()
  })

  afterEach(() => {
    mqttStore.disconnectFromMqtt()
  })

  it('should handle complete sensor data flow', async () => {
    // 1. Connect to MQTT
    await mqttStore.connectToMqtt()
    expect(mqttStore.connectionStatus).toBe('connected')

    // 2. Simulate ESP discovery
    const espData = {
      esp_id: 'ESP32_001',
      board_type: 'XIAO_ESP32_C3',
      sensors: [],
      actuators: [],
    }
    mqttStore.handleEspDiscovery(espData)
    expect(mqttStore.espDevices.has('ESP32_001')).toBe(true)

    // 3. Simulate sensor data
    const sensorData = {
      esp_id: 'ESP32_001',
      gpio: 2,
      value: 25.5,
      unit: '°C',
      timestamp: Date.now(),
    }
    mqttStore.processSensorData(sensorData)

    // 4. Verify sensor registry update
    const sensor = sensorRegistry.getSensor('ESP32_001', 2)
    expect(sensor).toBeDefined()
    expect(sensor.value).toBe(25.5)
  })

  it('should handle actuator control flow', async () => {
    await mqttStore.connectToMqtt()

    // 1. Configure actuator
    const actuatorConfig = {
      esp_id: 'ESP32_001',
      gpio: 5,
      type: 'ACTUATOR_PUMP',
      state: false,
    }
    mqttStore.configureActuator(actuatorConfig)

    // 2. Send actuator command
    const command = {
      esp_id: 'ESP32_001',
      gpio: 5,
      command: 'set_state',
      value: true,
    }
    await mqttStore.sendActuatorCommand(command)

    // 3. Verify command was sent
    expect(mqttStore.lastSentCommand).toEqual(command)
  })
})
```

#### **Database Logs Integration Tests**

**Database Logs Integration Tests** (`src/tests/integration/databaseLogs.test.js`)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useDatabaseLogsStore } from '@/stores/databaseLogs'
import { useCentralDataHub } from '@/stores/centralDataHub'

describe('Database Logs Integration', () => {
  let databaseLogs
  let centralDataHub

  beforeEach(() => {
    databaseLogs = useDatabaseLogsStore()
    centralDataHub = useCentralDataHub()
  })

  it('should load and display sensor data with filtering', async () => {
    // 1. Load sensor data
    const mockData = [
      { esp_id: 'ESP32_001', value: 25.5, timestamp: '2024-01-01T10:00:00Z' },
      { esp_id: 'ESP32_002', value: 26.0, timestamp: '2024-01-01T10:01:00Z' },
    ]

    vi.spyOn(databaseLogs, 'apiService.getSensorData').mockResolvedValue(mockData)

    await databaseLogs.loadData('sensor_data')

    // 2. Apply filters
    databaseLogs.updateFilters({ espId: 'ESP32_001' })

    // 3. Verify filtered data
    const filteredData = databaseLogs.getFilteredData
    expect(filteredData).toHaveLength(1)
    expect(filteredData[0].esp_id).toBe('ESP32_001')

    // 4. Verify central data hub integration
    const deviceData = await centralDataHub.getOptimizedDeviceData('ESP32_001')
    expect(deviceData).toBeDefined()
  })

  it('should export data and update statistics', async () => {
    // 1. Load data
    const mockData = [{ esp_id: 'ESP32_001', value: 25.5, timestamp: '2024-01-01T10:00:00Z' }]

    vi.spyOn(databaseLogs, 'apiService.getSensorData').mockResolvedValue(mockData)
    await databaseLogs.loadData('sensor_data')

    // 2. Export data
    const csvData = await databaseLogs.executeExport('sensor_data')

    // 3. Verify export statistics
    const exportStats = databaseLogs.getExportStats
    expect(exportStats.totalExports).toBe(1)
    expect(exportStats.lastExport).toBeDefined()
  })
})
```

### **🌐 E2E Tests**

#### **User Workflow Tests**

**Complete User Workflow Tests** (`src/tests/e2e/userWorkflow.test.js`)

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'

describe('User Workflow E2E', () => {
  let app
  let pinia

  beforeEach(() => {
    pinia = createPinia()
    app = createApp(App)
    app.use(pinia)
  })

  afterEach(() => {
    app.unmount()
  })

  it('should complete device setup workflow', async () => {
    const wrapper = mount(App)

    // 1. Navigate to settings
    await wrapper.find('[data-test="settings-nav"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page"]').exists()).toBe(true)

    // 2. Configure ESP device
    await wrapper.find('[data-test="add-esp-button"]').trigger('click')
    await wrapper.find('[data-test="esp-id-input"]').setValue('ESP32_001')
    await wrapper.find('[data-test="board-type-select"]').setValue('XIAO_ESP32_C3')
    await wrapper.find('[data-test="save-esp-button"]').trigger('click')

    // 3. Verify device appears in dashboard
    await wrapper.find('[data-test="dashboard-nav"]').trigger('click')
    expect(wrapper.find('[data-test="device-ESP32_001"]').exists()).toBe(true)

    // 4. Configure sensor
    await wrapper.find('[data-test="configure-sensor-button"]').trigger('click')
    await wrapper.find('[data-test="sensor-gpio-input"]').setValue('2')
    await wrapper.find('[data-test="sensor-type-select"]').setValue('temperature')
    await wrapper.find('[data-test="save-sensor-button"]').trigger('click')

    // 5. Verify sensor configuration
    expect(wrapper.find('[data-test="sensor-ESP32_001-2"]').exists()).toBe(true)
  })

  it('should handle MQTT connection and data flow', async () => {
    const wrapper = mount(App)

    // 1. Check initial connection status
    expect(wrapper.find('[data-test="connection-status"]').text()).toContain('disconnected')

    // 2. Connect to MQTT
    await wrapper.find('[data-test="connect-mqtt-button"]').trigger('click')

    // Wait for connection
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 3. Verify connection established
    expect(wrapper.find('[data-test="connection-status"]').text()).toContain('connected')

    // 4. Simulate sensor data reception
    const mqttStore = useMqttStore()
    mqttStore.processSensorData({
      esp_id: 'ESP32_001',
      gpio: 2,
      value: 25.5,
      unit: '°C',
      timestamp: Date.now(),
    })

    // 5. Verify data displayed
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-test="sensor-value-ESP32_001-2"]').text()).toContain('25.5')
  })

  it('should handle database logs workflow', async () => {
    const wrapper = mount(App)

    // 1. Navigate to database logs
    await wrapper.find('[data-test="database-logs-nav"]').trigger('click')
    expect(wrapper.find('[data-test="database-logs-page"]').exists()).toBe(true)

    // 2. Select data type
    await wrapper.find('[data-test="data-type-select"]').setValue('sensor_data')

    // 3. Set time range
    await wrapper.find('[data-test="time-range-select"]').setValue('24h')

    // 4. Load data
    await wrapper.find('[data-test="load-data-button"]').trigger('click')

    // Wait for data loading
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // 5. Verify data loaded
    expect(wrapper.find('[data-test="data-table"]').exists()).toBe(true)

    // 6. Export data
    await wrapper.find('[data-test="export-button"]').trigger('click')

    // 7. Verify export completed
    expect(wrapper.find('[data-test="export-success"]').exists()).toBe(true)
  })
})
```

### **🔧 Test Configuration**

#### **Vitest Configuration** (`vitest.config.js`)

```javascript
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/tests/', '**/*.d.ts', '**/*.config.js'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
```

#### **Test Setup** (`src/tests/setup.js`)

```javascript
import { vi } from 'vitest'
import { config } from '@vue/test-utils'

// Global test configuration
config.global.stubs = {
  'v-icon': true,
  'v-chip': true,
  'v-tooltip': true,
}

// Mock MQTT client
vi.mock('mqtt', () => ({
  default: {
    connect: vi.fn(() => ({
      on: vi.fn(),
      subscribe: vi.fn(),
      publish: vi.fn(),
      end: vi.fn(),
    })),
  },
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
global.localStorage = localStorageMock

// Mock performance API
global.performance = {
  now: vi.fn(() => Date.now()),
  memory: {
    usedJSHeapSize: 1024 * 1024,
    totalJSHeapSize: 2 * 1024 * 1024,
    jsHeapSizeLimit: 10 * 1024 * 1024,
  },
}
```

### **📊 Test Coverage Goals**

#### **Coverage Targets**

```javascript
// Coverage configuration
const coverageTargets = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
}

// Critical paths requiring 90%+ coverage
const criticalPaths = [
  'src/stores/mqtt.js',
  'src/stores/centralDataHub.js',
  'src/stores/actuatorLogic.js',
  'src/composables/useMqttFeedback.js',
]
```

#### **Test Categories**

```javascript
// Test categorization
const testCategories = {
  unit: {
    description: 'Individual function/component tests',
    target: '80% coverage',
    files: ['src/stores/*.js', 'src/composables/*.js'],
  },
  integration: {
    description: 'Store interaction and data flow tests',
    target: '75% coverage',
    files: ['src/tests/integration/*.test.js'],
  },
  e2e: {
    description: 'Complete user workflow tests',
    target: '60% coverage',
    files: ['src/tests/e2e/*.test.js'],
  },
}
```

## 🏗️ **Architektur-Diagramme**

### **📊 Component-Hierarchie**

```
App.vue
├── TopNavigation.vue
│   ├── SystemStatusBar.vue
│   ├── MobileNavigation.vue
│   └── GlobalSnackbar.vue
├── Router-View
│   ├── HomeView.vue
│   │   ├── DeviceCardBase.vue (UnifiedCard.vue)
│   │   │   ├── GodDeviceCard.vue
│   │   │   ├── KaiserDeviceCard.vue
│   │   │   └── EspDeviceCard.vue
│   │   ├── ZoneManagement.vue
│   │   └── EmergencyControls.vue
│   ├── DashboardView.vue
│   │   ├── SensorVisualization.vue
│   │   ├── ChartComponents/
│   │   │   ├── LineChart.vue
│   │   │   ├── BarChart.vue
│   │   │   └── GaugeChart.vue
│   │   └── DataAggregation.vue
│   ├── SettingsView.vue
│   │   ├── EnhancedPinConfiguration.vue
│   │   ├── EspConfiguration.vue
│   │   ├── PiIntegrationPanel.vue
│   │   └── SystemCommandsPanel.vue
│   ├── DatabaseLogsView.vue
│   │   ├── DataFilterPanel.vue
│   │   ├── DataTableView.vue
│   │   ├── DataCardView.vue
│   │   └── ExportPanel.vue
│   └── DebugView.vue
│       ├── MqttDebugPanel.vue
│       ├── DeviceSimulator.vue
│       └── PerformanceMonitor.vue
└── Common Components/
    ├── LoadingStates.vue
    ├── ErrorBoundary.vue
    ├── BreadcrumbNavigation.vue
    └── ContextMenu.vue
```

### **🔄 Store-Datenfluss**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Central Data Hub                             │
│              (Zentrale Koordination)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│   MQTT Store │ │ Central │ │ ESP Mgmt  │
│              │ │ Config  │ │ Store     │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│ Sensor Reg.  │ │ Database│ │ Actuator  │
│ Store        │ │ Logs    │ │ Logic     │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│ Pi Integration│ │ System  │ │ Dashboard │
│ Store        │ │ Commands│ │ Generator │
└──────────────┘ └─────────┘ └───────────┘
```

### **📡 MQTT-Topic-Struktur**

```
kaiser/{kaiser_id}/
├── discovery/
│   └── esp32_nodes                    # ESP-Erkennung
├── esp/{esp_id}/
│   ├── heartbeat                      # ESP-Status
│   ├── status                         # System-Status
│   ├── health/
│   │   └── broadcast                  # System-Gesundheit
│   ├── sensor/{gpio}/
│   │   └── data                       # Sensor-Messwerte
│   ├── actuator/{gpio}/
│   │   ├── command                    # Aktor-Steuerung
│   │   └── status                     # Aktor-Status
│   ├── system/
│   │   └── command                    # System-Befehle
│   ├── emergency                      # Notfall-Steuerung
│   ├── zone/
│   │   └── config                     # Zonen-Konfiguration
│   ├── subzone/
│   │   └── config                     # Subzone-Konfiguration
│   ├── sensor/
│   │   └── config                     # Sensor-Konfiguration
│   ├── i2c/
│   │   └── scan                       # I2C-Scan
│   └── pi/{pi_id}/
│       ├── command                    # Pi-Befehle
│       └── status                     # Pi-Status
└── god_connection/
    ├── sync                           # God Pi Synchronisation
    └── status                         # God Pi Status
```

### **🔄 Device-Management Workflow**

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ ESP32 Boot  │───▶│ Discovery   │───▶│ Registration│
└─────────────┘    └─────────────┘    └─────────────┘
                          │                    │
                          ▼                    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Pin Config  │◀───│ Board Type  │◀───│ Device Info │
└─────────────┘    │ Detection   │    │ Collection  │
                          │                    │
                          ▼                    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Sensor Setup│◀───│ I2C Scan    │◀───│ GPIO Config │
└─────────────┘    └─────────────┘    └─────────────┘
                          │                    │
                          ▼                    ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Zone Assign │◀───│ Validation  │◀───│ Template    │
└─────────────┘    └─────────────┘    │ Application │
                          │            └─────────────┘
                          ▼
┌─────────────┐    ┌─────────────┐
│ Actuator    │◀───│ Logic Config│
│ Setup       │    └─────────────┘
└─────────────┘
```

### **💾 Datenfluss-Architektur**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Vue.js)                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP/WebSocket
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│              Kaiser Edge Controller (Pi0)                       │
│              ┌─────────────────────────────────────────┐        │
│              │           MQTT Broker                   │        │
│              │        (Mosquitto)                      │        │
│              └─────────────────┬───────────────────────┘        │
│                                │ MQTT Protocol                  │
│              ┌─────────────────▼───────────────────────┐        │
│              │         ESP32 Network                   │        │
│              │    ┌─────────┬─────────┬─────────┐      │        │
│              │    │ ESP32-1 │ ESP32-2 │ ESP32-N │      │        │
│              │    │ Sensors │ Sensors │ Sensors │      │        │
│              │    │ Actuators│ Actuators│ Actuators│   │        │
│              │    └─────────┴─────────┴─────────┘      │        │
│              └─────────────────────────────────────────┘        │
└─────────────────────┬───────────────────────────────────────────┘
                      │ HTTP API
                      │
┌─────────────────────▼───────────────────────────────────────────┐
│                    God Pi Server (Pi5)                          │
│              ┌─────────────────────────────────────────┐        │
│              │           Database                      │        │
│              │        (PostgreSQL)                     │        │
│              └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
```

### **🔧 State-Management-Architektur**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pinia State Management                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│   Reactive   │ │ Actions  │ │  Getters  │
│    State     │ │          │ │           │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│  Local       │ │  API     │ │ Computed  │
│ Storage      │ │ Calls    │ │ Values    │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│  Cache       │ │ MQTT     │ │ UI        │
│  System      │ │ Events   │ │ Updates   │
└──────────────┘ └─────────┘ └───────────┘
```

### **🎯 Performance-Architektur**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Performance Layer                            │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│   Caching    │ │ Lazy     │ │ Memory    │
│   Strategy   │ │ Loading  │ │ Management│
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│  Data Cache  │ │ Component│ │ Garbage   │
│  (5min TTL)  │ │ Splitting│ │ Collection│
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│  Message     │ │ Bundle   │ │ WeakRefs  │
│  Cache       │ │ Chunks   │ │ & Maps    │
│  (1000 max)  │ │          │ │           │
└──────────────┘ └─────────┘ └───────────┘
```

### **🔒 Sicherheits-Architektur**

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Layer                               │
└─────────────────────┬───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│ MQTT Auth    │ │ Input    │ │ Error     │
│ (TLS/WSS)    │ │ Validation│ │ Handling  │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│ Certificate  │ │ XSS      │ │ Circuit   │
│ Validation   │ │ Protection│ │ Breaker   │
└───────┬──────┘ └────┬────┘ └─────┬─────┘
        │             │            │
        │             │            │
┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐
│ Secure       │ │ Content  │ │ Rate      │
│ Storage      │ │ Security │ │ Limiting  │
│ (Encrypted)  │ │ Policy   │ │           │
└──────────────┘ └─────────┘ └───────────┘
```

## 🎯 **Composables (7 Composables)**

### **🔄 Store & System Composables**

#### **useStoreInitialization** (`src/composables/useStoreInitialization.js` - 11KB, 322 Zeilen)

```javascript
// Sichere Store-Initialisierung mit Error Handling und Retry-Logic
export function useStoreInitialization() {
  const centralDataHub = ref(null)
  const storesInitialized = ref(false)
  const initializationError = ref(null)
  const isLoading = ref(false)

  // Sichere Store-Referenzen
  const mqttStore = ref(null)
  const centralConfig = ref(null)
  const espManagement = ref(null)
  const sensorRegistry = ref(null)
  const piIntegration = ref(null)
  const actuatorLogic = ref(null)
  const systemCommands = ref(null)
  const dashboardGenerator = ref(null)

  // Store-Validierung
  const isMqttStoreAvailable = computed(() => {
    return mqttStore.value && typeof mqttStore.value.getKaiserId === 'function'
  })

  const areCriticalStoresAvailable = computed(() => {
    return isMqttStoreAvailable.value && isCentralConfigAvailable.value
  })

  // Store-Initialisierung mit Retry-Logic
  const initializeStores = async () => {
    if (isLoading.value) return false

    isLoading.value = true
    initializationError.value = null

    try {
      console.log('🔄 Starting store initialization...')

      // CentralDataHub initialisieren
      centralDataHub.value = useCentralDataHub()

      // Warte auf Store-Initialisierung mit Retry-Logic
      let retryCount = 0
      const maxRetries = 3
      let storesLoaded = false

      while (retryCount < maxRetries && !storesLoaded) {
        try {
          if (centralDataHub.value && typeof centralDataHub.value.initializeSystem === 'function') {
            await centralDataHub.value.initializeSystem()
            storesLoaded = true
            console.log('✅ CentralDataHub system initialized successfully')
          } else {
            throw new Error('CentralDataHub initializeSystem method not available')
          }
        } catch (error) {
          retryCount++
          console.warn(`⚠️ Store initialization attempt ${retryCount} failed:`, error.message)

          if (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount))
          } else {
            throw new Error(
              `Store initialization failed after ${maxRetries} attempts: ${error.message}`,
            )
          }
        }
      }

      // Sichere Store-Referenzen abrufen
      mqttStore.value = centralDataHub.value?.mqttStore
      centralConfig.value = centralDataHub.value?.centralConfig
      espManagement.value = centralDataHub.value?.espManagement
      sensorRegistry.value = centralDataHub.value?.sensorRegistry
      piIntegration.value = centralDataHub.value?.piIntegration
      actuatorLogic.value = centralDataHub.value?.actuatorLogic
      systemCommands.value = centralDataHub.value?.systemCommands
      dashboardGenerator.value = centralDataHub.value?.dashboardGenerator

      storesInitialized.value = true
      console.log('✅ All stores initialized successfully')
    } catch (error) {
      initializationError.value = error.message
      console.error('❌ Store initialization failed:', error)
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State
    centralDataHub,
    storesInitialized,
    initializationError,
    isLoading,

    // Store References
    mqttStore,
    centralConfig,
    espManagement,
    sensorRegistry,
    piIntegration,
    actuatorLogic,
    systemCommands,
    dashboardGenerator,

    // Computed
    isMqttStoreAvailable,
    areCriticalStoresAvailable,

    // Methods
    initializeStores,
    resetStores,
    getStoreStatus,
  }
}
```

#### **useResponsiveDisplay** (`src/composables/useResponsiveDisplay.js` - 8.9KB, 325 Zeilen)

```javascript
// Responsive Design Management mit Breakpoint-Detection
export function useResponsiveDisplay() {
  const windowWidth = ref(window.innerWidth)
  const windowHeight = ref(window.innerHeight)

  // Breakpoints (konsistent mit bestehenden CSS-Breakpoints)
  const BREAKPOINTS = {
    mobile: 768,
    tablet: 1024,
    desktop: 1400,
  }

  // Computed Properties
  const isMobile = computed(() => windowWidth.value < BREAKPOINTS.mobile)
  const isTablet = computed(
    () => windowWidth.value >= BREAKPOINTS.mobile && windowWidth.value < BREAKPOINTS.tablet,
  )
  const isDesktop = computed(() => windowWidth.value >= BREAKPOINTS.tablet)
  const isSmallScreen = computed(() => windowWidth.value < BREAKPOINTS.tablet)

  const getDisplayMode = computed(() => {
    if (isMobile.value) return 'compact'
    if (isTablet.value) return 'standard'
    return 'detailed'
  })

  const getOrientation = computed(() => {
    return windowHeight.value > windowWidth.value ? 'portrait' : 'landscape'
  })

  // Detail Level Management
  const detailLevels = {
    compact: ['critical', 'primary'],
    standard: ['critical', 'primary', 'secondary'],
    detailed: ['critical', 'primary', 'secondary', 'tertiary'],
  }

  const shouldShowDetail = (detailType) => {
    const mode = getDisplayMode.value
    return detailLevels[mode].includes(detailType)
  }

  // Component-specific display logic
  const getComponentDisplay = (componentType) => {
    const mode = getDisplayMode.value

    const componentConfigs = {
      card: {
        compact: { density: 'compact', showActions: false, showHeaderActions: false },
        standard: { density: 'default', showActions: true, showHeaderActions: true },
        detailed: { density: 'comfortable', showActions: true, showHeaderActions: true },
      },
      table: {
        compact: { density: 'compact', showPagination: false, itemsPerPage: 5 },
        standard: { density: 'default', showPagination: true, itemsPerPage: 10 },
        detailed: { density: 'comfortable', showPagination: true, itemsPerPage: 25 },
      },
      form: {
        compact: { density: 'compact', showHints: false, showValidation: false },
        standard: { density: 'default', showHints: true, showValidation: true },
        detailed: { density: 'comfortable', showHints: true, showValidation: true },
      },
      navigation: {
        compact: { showLabels: false, showIcons: true, collapsed: true },
        standard: { showLabels: true, showIcons: true, collapsed: false },
        detailed: { showLabels: true, showIcons: true, collapsed: false },
      },
    }

    return componentConfigs[componentType]?.[mode] || componentConfigs[componentType]?.standard
  }

  // Grid system helpers
  const getGridCols = (defaultCols = 12) => {
    const mode = getDisplayMode.value

    const gridConfigs = {
      compact: Math.min(defaultCols, 6), // Max 6 cols on mobile
      standard: Math.min(defaultCols, 8), // Max 8 cols on tablet
      detailed: defaultCols, // Full cols on desktop
    }

    return gridConfigs[mode]
  }

  const getResponsiveCols = (mobileCols = 12, tabletCols = 6, desktopCols = 4) => {
    if (isMobile.value) return mobileCols
    if (isTablet.value) return tabletCols
    return desktopCols
  }

  // Optimale Grid-Spalten basierend auf Element-Anzahl
  const getOptimalGridCols = (itemCount, minCols = 1, maxCols = 4) => {
    if (itemCount <= 2) return Math.min(maxCols, minCols + 1)
    if (itemCount <= 4) return Math.min(maxCols, minCols + 2)
    return Math.min(maxCols, minCols + 3)
  }

  // Dynamische Aktor-Grid-Anpassung
  const getDynamicActuatorCols = (actuatorCount) => {
    if (actuatorCount <= 2) return getResponsiveCols(1, 1, 2)
    if (actuatorCount <= 4) return getResponsiveCols(1, 2, 2)
    return getResponsiveCols(1, 2, 3)
  }

  // Zonen-Grid-Anpassung für ESP-Verwaltung
  const getZoneGridCols = (zoneCount) => {
    if (zoneCount <= 1) return getResponsiveCols(1, 1, 1)
    if (zoneCount <= 2) return getResponsiveCols(1, 1, 2)
    if (zoneCount <= 4) return getResponsiveCols(1, 2, 2)
    return getResponsiveCols(1, 2, 3)
  }

  // ESP-Card-Grid-Anpassung
  const getEspCardGridCols = (espCount) => {
    if (espCount <= 1) return getResponsiveCols(1, 1, 1)
    if (espCount <= 2) return getResponsiveCols(1, 1, 2)
    if (espCount <= 4) return getResponsiveCols(1, 2, 2)
    if (espCount <= 6) return getResponsiveCols(1, 2, 3)
    return getResponsiveCols(1, 2, 4)
  }

  // Event Handlers
  const handleResize = () => {
    windowWidth.value = window.innerWidth
    windowHeight.value = window.innerHeight
  }

  const debounce = (func, wait) => {
    let timeout
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout)
        func(...args)
      }
      clearTimeout(timeout)
      timeout = setTimeout(later, wait)
    }
  }

  const debouncedResize = debounce(handleResize, 250)

  // Lifecycle
  onMounted(() => {
    window.addEventListener('resize', debouncedResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', debouncedResize)
  })

  return {
    // State
    windowWidth,
    windowHeight,

    // Computed
    isMobile,
    isTablet,
    isDesktop,
    isSmallScreen,
    getDisplayMode,
    getOrientation,

    // Methods
    shouldShowDetail,
    getComponentDisplay,
    getGridCols,
    getResponsiveCols,
    getOptimalGridCols,
    getDynamicActuatorCols,
    getZoneGridCols,
    getEspCardGridCols,
  }
}
```

#### **useDeviceSynchronization** (`src/composables/useDeviceSynchronization.js` - 6.1KB, 221 Zeilen)

```javascript
// Geräte-Synchronisation zwischen Stores
export function useDeviceSynchronization() {
  const mqttStore = useMqttStore()
  const espStore = useEspManagementStore()
  const centralConfig = useCentralConfigStore()

  // Zentrale Synchronisations-Status
  const isSynchronizing = ref(false)
  const lastSyncTime = ref(null)
  const syncErrors = ref([])

  // Computed Properties für konsistente Daten
  const synchronizedEspDevices = computed(() => {
    return Array.from(mqttStore.espDevices.entries()).map(([espId, device]) => ({
      espId,
      ...device,
      zone: device.zone || centralConfig.getZoneForEsp(espId),
      subzones: device.subzones || new Map(),
      lastUpdate: device.lastHeartbeat || device.lastUpdate,
    }))
  })

  const synchronizedSubzones = computed(() => (espId) => {
    const device = mqttStore.espDevices.get(espId)
    if (!device) return []

    return Array.from(device.subzones?.values() || []).map((subzone) => ({
      ...subzone,
      sensors: subzone.sensors || new Map(),
      actuators: subzone.actuators || new Map(),
    }))
  })

  const synchronizedPins = computed(() => (espId) => {
    return espStore.getPinAssignments(espId)
  })

  const availablePins = computed(() => (espId) => {
    return espStore.getAvailablePinsForEsp(espId)
  })

  // Zentrale Synchronisations-Methoden
  const syncDeviceData = async (espId) => {
    isSynchronizing.value = true
    try {
      // Aktualisiere ESP-Device-Daten
      const device = mqttStore.espDevices.get(espId)
      if (device) {
        // Synchronisiere mit ESP Management Store
        espStore.updateEspDevice(espId, device)

        // Aktualisiere Zone-Mapping
        if (device.zone) {
          centralConfig.setZone(espId, device.zone)
        }
      }

      lastSyncTime.value = Date.now()
      console.log(`[Sync] Device ${espId} synchronized successfully`)
    } catch (error) {
      console.error(`[Sync] Failed to sync device ${espId}:`, error)
      syncErrors.value.push({
        espId,
        error: error.message,
        timestamp: Date.now(),
      })
    } finally {
      isSynchronizing.value = false
    }
  }

  const syncAllDevices = async () => {
    isSynchronizing.value = true
    try {
      const espIds = Array.from(mqttStore.espDevices.keys())

      for (const espId of espIds) {
        await syncDeviceData(espId)
      }

      // Aktualisiere verfügbare Zonen
      centralConfig.updateAvailableZones()

      lastSyncTime.value = Date.now()
      console.log(`[Sync] All ${espIds.length} devices synchronized successfully`)
    } catch (error) {
      console.error('[Sync] Failed to sync all devices:', error)
      syncErrors.value.push({
        espId: 'all',
        error: error.message,
        timestamp: Date.now(),
      })
    } finally {
      isSynchronizing.value = false
    }
  }

  // Pin-Konfiguration über zentrale API
  const configurePinSynchronized = async (espId, pinConfig) => {
    try {
      // Verwende ESP Management Store API
      await espStore.configurePinAssignment(espId, {
        gpio: pinConfig.pin,
        type: pinConfig.type,
        name: pinConfig.name,
        subzone: pinConfig.subzoneId,
        category: pinConfig.type.startsWith('SENSOR_') ? 'sensor' : 'actuator',
      })

      // Synchronisiere nach Pin-Konfiguration
      await syncDeviceData(espId)

      return { success: true }
    } catch (error) {
      console.error('[Sync] Pin configuration failed:', error)
      return { success: false, error: error.message }
    }
  }

  // Automatische Synchronisation bei MQTT-Updates
  const setupAutoSync = () => {
    watch(
      () => mqttStore.espDevices,
      async (newDevices, oldDevices) => {
        // Identifiziere geänderte ESPs
        const changedEspIds = []

        for (const [espId, device] of newDevices) {
          const oldDevice = oldDevices?.get(espId)
          if (!oldDevice || JSON.stringify(device) !== JSON.stringify(oldDevice)) {
            changedEspIds.push(espId)
          }
        }

        // Synchronisiere geänderte ESPs
        for (const espId of changedEspIds) {
          await syncDeviceData(espId)
        }
      },
      { deep: true },
    )

    // Synchronisiere bei ESP-Auswahl-Änderungen
    watch(
      () => centralConfig.getSelectedEspId,
      async (newEspId) => {
        if (newEspId) {
          await syncDeviceData(newEspId)
        }
      },
    )
  }

  return {
    // Status
    isSynchronizing,
    lastSyncTime,
    syncErrors,

    // Computed
    synchronizedEspDevices,
    synchronizedSubzones,
    synchronizedPins,
    availablePins,

    // Methods
    syncDeviceData,
    syncAllDevices,
    configurePinSynchronized,
    setupAutoSync,
    clearSyncErrors,
  }
}
```

### **📊 Data & Analytics Composables**

#### **useDeviceHealthScore** (`src/composables/useDeviceHealthScore.js` - 1.7KB, 72 Zeilen)

```javascript
// Geräte-Gesundheitsbewertung mit Scoring-System
export function useDeviceHealthScore(deviceInfo) {
  const healthScore = computed(() => {
    let score = 100
    const issues = []

    // Verbindungsstatus (40 Punkte)
    if (!deviceInfo.value.status || deviceInfo.value.status === 'offline') {
      score -= 40
      issues.push('Offline')
    }

    // Zone-Konfiguration (25 Punkte)
    if (!deviceInfo.value.zone || deviceInfo.value.zone === '🕳️ Unkonfiguriert') {
      score -= 25
      issues.push('Keine Zone')
    }

    // Board-Typ (15 Punkte)
    if (!deviceInfo.value.boardType) {
      score -= 15
      issues.push('Board-Typ fehlt')
    }

    // ID-Konflikte (20 Punkte)
    if (deviceInfo.value.idConflict) {
      score -= 20
      issues.push('ID-Konflikt')
    }

    // Pin-Konfiguration (optional, nur wenn konfiguriert)
    if (deviceInfo.value.hasPinConfig && deviceInfo.value.missingPins?.length > 0) {
      score -= 10
      issues.push('Pin-Fehler')
    }

    return {
      score: Math.max(0, score),
      issues,
      status: getHealthStatus(score),
      color: getHealthColor(score),
      icon: getHealthIcon(score),
    }
  })

  const getHealthStatus = (score) => {
    if (score >= 90) return 'excellent'
    if (score >= 70) return 'good'
    if (score >= 50) return 'warning'
    return 'critical'
  }

  const getHealthColor = (score) => {
    if (score >= 90) return 'success'
    if (score >= 70) return 'info'
    if (score >= 50) return 'warning'
    return 'error'
  }

  const getHealthIcon = (score) => {
    if (score >= 90) return 'mdi-check-circle'
    if (score >= 70) return 'mdi-information'
    if (score >= 50) return 'mdi-alert'
    return 'mdi-alert-circle'
  }

  return {
    healthScore,
  }
}
```

#### **useBlinkTracker** (`src/composables/useBlinkTracker.js` - 2.6KB, 96 Zeilen)

```javascript
// Blink-Animation bei Zonenwechsel für visuelle Orientierung
export function useBlinkTracker() {
  const lastMovedEspId = ref(null)
  const lastZoneChange = ref(null)

  /**
   * Markiert ein Gerät als kürzlich verschoben
   * @param {string} espId - ESP-ID des verschobenen Geräts
   * @param {string} oldZone - Vorherige Zone
   * @param {string} newZone - Neue Zone
   * @param {number} duration - Dauer der Animation in ms (Standard: 5000)
   */
  const markAsRecentlyMoved = (espId, oldZone = null, newZone = null, duration = 5000) => {
    lastMovedEspId.value = espId

    // Logge Zonenwechsel
    if (oldZone !== newZone) {
      lastZoneChange.value = {
        espId,
        oldZone,
        newZone,
        timestamp: Date.now(),
      }

      console.info(
        `[ZoneChange] ESP ${espId} von '${oldZone}' nach '${newZone}' (${new Date().toISOString()})`,
      )
    }

    // Reset nach angegebener Zeit
    setTimeout(() => {
      if (lastMovedEspId.value === espId) {
        lastMovedEspId.value = null
      }
    }, duration)
  }

  /**
   * Prüft, ob ein Gerät kürzlich verschoben wurde
   * @param {string} espId - ESP-ID zu prüfen
   * @returns {boolean} True wenn das Gerät kürzlich verschoben wurde
   */
  const isRecentlyMoved = (espId) => {
    return espId === lastMovedEspId.value
  }

  /**
   * Gibt die letzte Zonenänderung zurück
   * @returns {Object|null} Letzte Zonenänderung oder null
   */
  const getLastZoneChange = () => {
    return lastZoneChange.value
  }

  /**
   * Löscht die Historie der letzten Zonenänderung
   */
  const clearZoneChangeHistory = () => {
    lastZoneChange.value = null
  }

  /**
   * Überwacht Zonenänderungen in einem Device-Map
   * @param {Map} newDevices - Aktuelle Devices
   * @param {Map} oldDevices - Vorherige Devices
   */
  const watchZoneChanges = (newDevices, oldDevices) => {
    if (!oldDevices) return

    for (const [espId, newDevice] of newDevices.entries()) {
      const oldDevice = oldDevices.get(espId)
      if (oldDevice && oldDevice.zone !== newDevice.zone) {
        // Gerät blinkt bei Zonenwechsel kurz auf – zur visuellen Orientierung
        markAsRecentlyMoved(espId, oldDevice.zone, newDevice.zone)
        break // Nur das erste gefundene Gerät animieren
      }
    }
  }

  return {
    lastMovedEspId,
    lastZoneChange,
    markAsRecentlyMoved,
    isRecentlyMoved,
    getLastZoneChange,
    clearZoneChangeHistory,
    watchZoneChanges,
  }
}
```

#### **useSensorAggregation** (`src/composables/useSensorAggregation.js` - 11KB, 375 Zeilen)

```javascript
// Sensor-Aggregationen mit Zeitfenster-Support
export function useSensorAggregation() {
  const sensorRegistry = useSensorRegistryStore()

  /**
   * Berechnet Aggregationen für alle Sensoren eines ESP
   * @param {string} espId - ESP-ID
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getEspAggregations(espId) {
    if (!espId) return []

    const sensors = sensorRegistry.getSensorsByEsp(espId)
    return calculateAggregations(sensors)
  }

  /**
   * Berechnet Aggregationen für einen spezifischen Zeitraum
   * @param {string} espId - ESP-ID
   * @param {number} timeWindowMs - Zeitfenster in Millisekunden
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getEspAggregationsWithTimeWindow(espId, timeWindowMs = 5 * 60 * 1000) {
    if (!espId) return []

    const sensors = sensorRegistry.getSensorsByEsp(espId)
    const now = Date.now()

    // Nur Sensoren im Zeitfenster
    const recentSensors = sensors.filter(
      (sensor) => sensor.lastUpdate && now - sensor.lastUpdate <= timeWindowMs,
    )

    return calculateAggregations(recentSensors)
  }

  /**
   * Berechnet Aggregationen für alle Sensoren einer Zone
   * @param {string} zoneId - Zone-ID
   * @returns {Array} Array von Aggregation-Objekten
   */
  function getZoneAggregations(zoneId) {
    if (!zoneId) return []

    // Zone-Sensoren aus Registry holen
    const zoneSensors = sensorRegistry.getAllSensors.filter(
      (sensor) => sensor.subzoneId && sensor.subzoneId.startsWith(zoneId),
    )

    return calculateAggregations(zoneSensors)
  }

  /**
   * Zeitfenster-Optionen für Aggregationen
   * @returns {Array} Array von Zeitfenster-Optionen
   */
  function getTimeWindowOptions() {
    return [
      { label: 'Letzte 5 Minuten', value: 5 * 60 * 1000 },
      { label: 'Letzte Stunde', value: 60 * 60 * 1000 },
      { label: 'Letzte 24 Stunden', value: 24 * 60 * 60 * 1000 },
      { label: 'Alle verfügbaren Daten', value: null },
    ]
  }

  /**
   * Formatiert Zeitfenster-Label
   * @param {number} timeWindowMs - Zeitfenster in Millisekunden
   * @returns {string} Benutzerfreundliches Label
   */
  function formatTimeWindow(timeWindowMs) {
    if (!timeWindowMs) return 'Alle Daten'

    const minutes = Math.floor(timeWindowMs / (60 * 1000))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days} Tag${days > 1 ? 'e' : ''}`
    if (hours > 0) return `${hours} Stunde${hours > 1 ? 'n' : ''}`
    return `${minutes} Minute${minutes > 1 ? 'n' : ''}`
  }

  /**
   * Zentrale Aggregations-Berechnung
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Aggregation-Objekten
   */
  function calculateAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Nur gültige Sensoren mit numerischen Werten
    const validSensors = sensors.filter(
      (sensor) =>
        sensor.value !== null && sensor.value !== undefined && !isNaN(Number(sensor.value)),
    )

    if (validSensors.length === 0) return []

    // Nach Typ gruppieren
    const grouped = {}
    validSensors.forEach((sensor) => {
      if (!grouped[sensor.type]) {
        grouped[sensor.type] = []
      }
      grouped[sensor.type].push(Number(sensor.value))
    })

    // Aggregationen berechnen
    return Object.entries(grouped).map(([type, values]) => ({
      type,
      label: getSensorTypeLabel(type),
      unit: getSensorUnit(type),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      count: values.length,
    }))
  }

  /**
   * Warning-basierte Aggregation
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Warning-Aggregation-Objekten
   */
  function calculateWarningAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Sensoren mit Warnings gruppieren
    const warningSensors = sensors.filter((sensor) => sensor.warnings && sensor.warnings.length > 0)

    if (warningSensors.length === 0) return []

    // Nach Warning-Typ gruppieren
    const grouped = {}
    warningSensors.forEach((sensor) => {
      sensor.warnings.forEach((warning) => {
        if (!grouped[warning]) {
          grouped[warning] = []
        }
        grouped[warning].push(sensor)
      })
    })

    // Warning-Aggregationen berechnen
    return Object.entries(grouped).map(([warning, sensors]) => ({
      warning,
      label: getWarningLabel(warning),
      color: getWarningColor(warning),
      count: sensors.length,
      sensors: sensors.map((s) => ({ espId: s.espId, gpio: s.gpio, type: s.type })),
    }))
  }

  /**
   * Zeitqualität-basierte Aggregation
   * @param {Array} sensors - Array von Sensor-Objekten
   * @returns {Array} Array von Zeitqualität-Aggregation-Objekten
   */
  function calculateTimeQualityAggregations(sensors) {
    if (!sensors || sensors.length === 0) return []

    // Nach Zeitqualität gruppieren
    const grouped = {}
    sensors.forEach((sensor) => {
      const quality = sensor.time_quality || 'unknown'
      if (!grouped[quality]) {
        grouped[quality] = []
      }
      grouped[quality].push(sensor)
    })

    // Zeitqualität-Aggregationen berechnen
    return Object.entries(grouped).map(([quality, sensors]) => ({
      quality,
      label: getTimeQualityLabel(quality),
      color: getTimeQualityColor(quality),
      count: sensors.length,
      percentage: (sensors.length / sensors.length) * 100,
    }))
  }

  // Utility Functions
  function getSensorTypeLabel(type) {
    const labels = {
      SENSOR_TEMP_DS18B20: 'Temperatur',
      SENSOR_MOISTURE: 'Feuchtigkeit',
      SENSOR_PH_DFROBOT: 'pH-Wert',
      SENSOR_EC_GENERIC: 'Leitfähigkeit',
      SENSOR_LIGHT: 'Licht',
      SENSOR_PRESSURE: 'Druck',
      SENSOR_HUMIDITY: 'Luftfeuchtigkeit',
      SENSOR_CO2: 'CO2',
      SENSOR_DIGITAL: 'Digital',
    }
    return labels[type] || type
  }

  function getSensorUnit(type) {
    const units = {
      SENSOR_TEMP_DS18B20: '°C',
      SENSOR_MOISTURE: '%',
      SENSOR_PH_DFROBOT: 'pH',
      SENSOR_EC_GENERIC: 'mS/cm',
      SENSOR_LIGHT: 'lux',
      SENSOR_PRESSURE: 'hPa',
      SENSOR_HUMIDITY: '%',
      SENSOR_CO2: 'ppm',
      SENSOR_DIGITAL: '',
    }
    return units[type] || ''
  }

  function getSensorIcon(type) {
    const icons = {
      SENSOR_TEMP_DS18B20: 'mdi-thermometer',
      SENSOR_MOISTURE: 'mdi-water-percent',
      SENSOR_PH_DFROBOT: 'mdi-flask',
      SENSOR_EC_GENERIC: 'mdi-flash',
      SENSOR_LIGHT: 'mdi-white-balance-sunny',
      SENSOR_PRESSURE: 'mdi-gauge',
      SENSOR_HUMIDITY: 'mdi-water-percent',
      SENSOR_CO2: 'mdi-molecule',
      SENSOR_DIGITAL: 'mdi-toggle-switch',
    }
    return icons[type] || 'mdi-help'
  }

  function getSensorColor(type) {
    const colors = {
      SENSOR_TEMP_DS18B20: 'error',
      SENSOR_MOISTURE: 'info',
      SENSOR_PH_DFROBOT: 'success',
      SENSOR_EC_GENERIC: 'warning',
      SENSOR_LIGHT: 'warning',
      SENSOR_PRESSURE: 'primary',
      SENSOR_HUMIDITY: 'info',
      SENSOR_CO2: 'error',
      SENSOR_DIGITAL: 'grey',
    }
    return colors[type] || 'grey'
  }

  function getWarningLabel(warning) {
    const labels = {
      sensor_offline: 'Sensor offline',
      value_out_of_range: 'Wert außerhalb des Bereichs',
      no_data_recent: 'Keine aktuellen Daten',
      communication_error: 'Kommunikationsfehler',
      calibration_needed: 'Kalibrierung erforderlich',
    }
    return labels[warning] || warning
  }

  function getWarningColor(warning) {
    const colors = {
      sensor_offline: 'error',
      value_out_of_range: 'warning',
      no_data_recent: 'warning',
      communication_error: 'error',
      calibration_needed: 'info',
    }
    return colors[warning] || 'grey'
  }

  function getTimeQualityLabel(quality) {
    const labels = {
      excellent: 'Ausgezeichnet',
      good: 'Gut',
      fair: 'Mittel',
      poor: 'Schlecht',
      unknown: 'Unbekannt',
    }
    return labels[quality] || quality
  }

  function getTimeQualityColor(quality) {
    const colors = {
      excellent: 'success',
      good: 'info',
      fair: 'warning',
      poor: 'error',
      unknown: 'grey',
    }
    return colors[quality] || 'grey'
  }

  function formatAggregationValue(aggregation) {
    const value = aggregation.avg
    const unit = aggregation.unit

    if (typeof value === 'number') {
      return `${value.toFixed(2)}${unit ? ` ${unit}` : ''}`
    }

    return `${value}${unit ? ` ${unit}` : ''}`
  }

  function formatAggregationTooltip(aggregation) {
    return `${aggregation.label}: ${formatAggregationValue(aggregation)} (${aggregation.count} Messungen)`
  }

  return {
    // Main Functions
    getEspAggregations,
    getEspAggregationsWithTimeWindow,
    getZoneAggregations,
    getTimeWindowOptions,
    formatTimeWindow,
    calculateAggregations,
    calculateWarningAggregations,
    calculateTimeQualityAggregations,

    // Utility Functions
    getSensorTypeLabel,
    getSensorUnit,
    getSensorIcon,
    getSensorColor,
    getWarningLabel,
    getWarningColor,
    getTimeQualityLabel,
    getTimeQualityColor,
    formatAggregationValue,
    formatAggregationTooltip,
  }
}
```

## 📡 **MQTT-Kommunikation & Topics**

### **🔄 Topic-Struktur**

Das Frontend verwendet eine hierarchische MQTT-Topic-Struktur:

```
kaiser/{kaiser_id}/esp/{esp_id}/[category]/[action]
```

#### **📥 Subscribe Topics (Frontend empfängt):**

- **Heartbeat**: `kaiser/{kaiser_id}/esp/{esp_id}/heartbeat` - ESP-Status-Updates
- **Sensor Data**: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` - Sensor-Messwerte
- **🆕 Subzone Sensor Data**: `kaiser/{kaiser_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data` - Subzone-spezifische Sensor-Daten
- **🆕 Master Zone Sensor Data**: `kaiser/{kaiser_id}/master/{master_zone_id}/esp/{esp_id}/subzone/{subzone_id}/sensor/{gpio}/data` - Master-Zone Sensor-Daten
- **Actuator Status**: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` - Aktor-Status
- **System Status**: `kaiser/{kaiser_id}/esp/{esp_id}/status` - System-Status
- **Health**: `kaiser/{kaiser_id}/esp/{esp_id}/health/broadcast` - System-Gesundheit
- **Discovery**: `kaiser/{kaiser_id}/discovery/esp32_nodes` - ESP-Erkennung
- **Pi Integration**: `kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/status` - Pi-Status
- **🆕 Logical Areas Config**: `kaiser/{kaiser_id}/esp/{esp_id}/logical_areas/config` - Logische Bereiche Konfiguration
- **🆕 Time Range Config**: `kaiser/{kaiser_id}/esp/{esp_id}/time_range/config` - Zeitbereich-Konfiguration
- **🆕 Theme Config**: `kaiser/{kaiser_id}/esp/{esp_id}/theme/config` - Theme-Konfiguration

#### **📤 Publish Topics (Frontend sendet):**

- **System Commands**: `kaiser/{kaiser_id}/esp/{esp_id}/system/command` - System-Befehle
- **Actuator Commands**: `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` - Aktor-Steuerung
- **Emergency**: `kaiser/{kaiser_id}/esp/{esp_id}/emergency` - Notfall-Steuerung
- **Pi Commands**: `kaiser/{kaiser_id}/esp/{esp_id}/pi/{pi_id}/command` - Pi-Befehle
- **I2C Config**: `kaiser/{kaiser_id}/esp/{esp_id}/sensor/config` - I2C-Konfiguration
- **Zone Config**: `kaiser/{kaiser_id}/esp/{esp_id}/zone/config` - Zonen-Konfiguration
- **🆕 Zone Update**: `kaiser/{kaiser_id}/esp/{esp_id}/system/command` - Zone-Änderungen mit MQTT

### **🆕 Backend v3.5.0 Kompatibilität**

- **Raw Data Support**: Unterstützung für `raw_value` und `raw_mode`
- **Warning System**: Sensor-Qualitätsüberwachung mit `warnings` Array
- **Time Quality**: Datenqualitätsbewertung mit `time_quality` Feld

### **🆕 Neue Geräteverwaltung-Topics**

- **Zone Update Command**: `kaiser/{kaiser_id}/esp/{esp_id}/system/command` mit Payload:
  ```json
  {
    "command": "update_zone",
    "data": {
      "zone": "neue_zone",
      "old_zone": "alte_zone",
      "timestamp": 1234567890
    }
  }
  ```
- **Hardware Mode**: Unterscheidung zwischen `hardware_mode` und Simulation
- **Extended Payloads**: Erweiterte Payload-Strukturen für bessere Datenqualität

### **🆕 Frontend Technologie-Stack v3.8.0:**

- **Vue.js ^3.5.13** - Progressive JavaScript Framework
- **Vuetify ^3.8.10** - Material Design Component Library
- **Pinia ^3.0.3** - State Management für Vue 3
- **Vue Router 4.5.0** - Client-side Routing
- **MQTT.js 5.13.1** - WebSocket MQTT Client
- **Chart.js 4.5.0** - Datenvisualisierung
- **Vue-ChartJS 5.3.2** - Vue Wrapper für Chart.js
- **Axios 1.10.0** - HTTP Client
- **Tailwind CSS 3.3.5** - Utility-first CSS Framework
- **@vueuse/core 10.11.1** - Vue Composition Utilities
- **@headlessui/vue 1.7.23** - Headless UI Components
- **@heroicons/vue 2.2.0** - Heroicons
- **@mdi/font 7.4.47** - Material Design Icons
- **date-fns 4.1.0** - Date Manipulation Library
- **Vite 6.2.4** - Build Tool und Development Server
- **ESLint 9.22.0** - Code Quality und Linting
- **Prettier 3.5.3** - Code Formatting
- **PostCSS 8.4.31** - CSS Processing
- **Autoprefixer 10.4.16** - CSS Vendor Prefixing

## 🆕 **Wichtigste Features v3.7.0**

### **🎯 Kern-Funktionalitäten**

#### **1. Database Logs System**

Das neue Database Logs System bietet umfassende Datenanalyse-Funktionen:

- **Geführte Filterführung**: Schritt-für-Schritt Anleitung für Datenanalyse
- **Auto-Reload System**: Automatische Datenaktualisierung mit konfigurierbaren Intervallen
- **Multi-View Datenanzeige**: Tabelle und Karten-Ansicht für verschiedene Anwendungsfälle
- **Chart-Integration**: Direkte Integration mit SensorVisualization für Diagramme
- **CSV-Export**: Konfigurierbare Export-Einstellungen mit Dokumentation
- **ESP-Navigation**: Direkte Verlinkung zu ESP-Geräten und Sensoren
- **Sensor-Icon-System**: Intuitive Darstellung verschiedener Sensor-Typen
- **Wert-Farbkodierung**: Farbkodierung basierend auf Sensor-Typ und Messwerten

#### **2. Erweiterte MQTT-Store-Funktionalitäten**

Verbesserte MQTT-Kommunikation mit neuen Features:

- **Message-Management**: Begrenzte Message-Speicherung für Performance
- **Cleanup-Scheduler**: Automatische Bereinigung inaktiver Geräte
- **Topic-Utilities**: Einheitliche MQTT-Topic-Verwaltung
- **Kaiser-ID-Persistierung**: Automatische Topic-Umkonfiguration bei ID-Änderungen
- **God Pi Synchronisation**: Push-Sync und Command-Execution
- **Circuit Breaker Pattern**: Robuste HTTP-Kommunikation mit automatischer Wiederherstellung

#### **3. Erweiterte Sensor-Registry**

Verbesserte Sensor-Verwaltung mit neuen Features:

- **Warning-System**: Sensor-Qualitätsüberwachung mit verschiedenen Warning-Typen
- **Time-Quality-Management**: Datenqualitätsbewertung
- **Hardware/Simulation Mode**: Unterscheidung zwischen Hardware- und Simulationsdaten
- **Raw Value Support**: Unterstützung für unverarbeitete Sensordaten
- **Erweiterte Statistiken**: byType, byEsp und Aktivitäts-Tracking

#### **4. Intelligente Sensor-Aggregationen**

- **Zeitfenster-basierte Analyse**: 5 Min, 1h, 24h, alle Daten
- **Kontextabhängige Darstellung**: Aggregationen nur bei expliziter Aktivierung
- **Live-Daten Priorität**: Standardmäßig aktuelle Sensorwerte
- **Globale Steuerung**: Einheitliche Kontrolle über alle Aggregationen
- **Persistente Einstellungen**: Benutzereinstellungen werden gespeichert

#### **5. Sensor Templates System**

- **Vorkonfigurierte Setups**: Fertige Konfigurationen für verschiedene Anwendungsfälle
- **Board-Type-spezifische Templates**: ESP32 DevKit und XIAO C3 Unterstützung
- **Template-Validierung**: Automatische Kompatibilitätsprüfung
- **I2C Sensor Limit Management**: Maximal 8 Sensoren pro I2C-Bus

#### **6. Actuator Logic Engine**

- **Zentrale Logic-Engine**: Prioritätsmanagement für alle Aktor-Steuerungen
- **Konfliktlösung**: Automatische Auflösung von Steuerungskonflikten
- **Prioritätshierarchie**: EMERGENCY > MANUAL > ALERT > LOGIC > TIMER > SCHEDULE > DEFAULT
- **Aktor-Typ-spezifische Regeln**: Spezielle Logik für Pumpen, LEDs, Heizungen
- **Real-time Evaluation**: Kontinuierliche Auswertung von Bedingungen und Timern
- **Failsafe-Mechanismen**: Automatische Sicherheitszustände bei Fehlern
- **Logging & Monitoring**: Umfassende Protokollierung aller Logic-Aktivitäten

#### **7. Backend v3.5.0 Kompatibilität**

- **Raw Data Support**: Unterstützung für `raw_value` und `raw_mode`
- **Warning System**: Sensor-Qualitätsüberwachung mit `warnings` Array
- **Time Quality**: Datenqualitätsbewertung mit `time_quality` Feld
- **Hardware Mode**: Unterscheidung zwischen `hardware_mode` und Simulation

#### **8. Erweiterte Debug-Panels**

- **Device Simulator**: Test-Umgebung für neue Features
- **MQTT Debug**: Topic-Monitoring und Message-Tracking
- **Sensor Registry**: Erweiterte Sensor-Verwaltung
- **System Commands**: Command-History und -Validierung
- **Warning Configuration**: Konfigurierbare Warning-Schwellenwerte

#### **9. Central Config Store**

- **Zentrale Konfigurationsverwaltung** für alle System-Komponenten
- **ESP-Auswahl-System** mit automatischer ESP-Auswahl
- **URL-Generierung** für verschiedene Protokolle (HTTP, MQTT)
- **Environment Variable Migration** für Backward Compatibility

## 👑 **Kaiser Edge Controller Integration**

### **🎯 Was ist der Kaiser Edge Controller?**

Der **Kaiser Edge Controller** ist ein erweiterter Betriebsmodus des Growy Dashboards, der Edge Computing-Funktionalität und zentrale Synchronisation mit dem God Pi Server bereitstellt. Er fungiert als intelligente Zwischenschicht zwischen ESP32-Geräten und dem zentralen God Pi Server.

### **🚀 Kaiser-Modus aktivieren**

#### **Automatische Aktivierung:**

1. **HomeView öffnen** (`http://localhost:5173`)
2. **"Kaiser-Modus aktivieren"** klicken
3. **Kaiser ID eingeben** (z.B. `greenhouse_kaiser_01`)
4. **Seite wird automatisch neu geladen**

#### **Manuelle Aktivierung (Browser Console):**

```javascript
// Kaiser ID setzen
localStorage.setItem('kaiser_id', 'mein_kaiser_controller')

// God Pi IP setzen (optional)
localStorage.setItem('god_pi_ip', '192.168.1.100')

// Seite neu laden
location.reload()
```

### **🔧 Kaiser-Features**

#### **A. God Pi Integration:**

- ✅ **Automatische Registrierung** mit God Pi Server
- ✅ **Push-Sync System** für Event-Synchronisation
- ✅ **Connection Status Monitoring**
- ✅ **Sync Statistics Tracking**
- ✅ **Failed Sync Handling**

#### **B. Autonomous Mode:**

- ✅ **Autonomous/Supervised Mode Toggle**
- ✅ **Mode Status Display**
- ✅ **Configuration Persistence**
- ✅ **UI Indicators**

#### **C. Emergency Controls:**

- ✅ **Emergency Stop All** für alle ESP-Geräte
- ✅ **Emergency Stop per ESP**
- ✅ **Emergency Clear Functions**
- ✅ **Confirmation Dialogs**

#### **D. Kaiser Configuration:**

- ✅ **Kaiser ID Management**
- ✅ **God Pi IP/Port Configuration**
- ✅ **Sync Enable/Disable**
- ✅ **Configuration Persistence**

### **🎨 Kaiser UI-Komponenten**

#### **1. Dynamischer App-Header:**

- **System-Erkennung**: Automatische Unterscheidung zwischen Kaiser Edge Controller und God Pi
- **Dynamischer Titel**: Zeigt "Kaiser: kaiser_id" oder "God Pi Central System"
- **System-Icons**: Crown-Icon für Kaiser, Server-Icon für God Pi
- **System-Badges**: "EDGE CONTROLLER" für Kaiser, "GOD PI" für God Pi
- **Farbkodierung**: Primary-Farbe für Kaiser, Secondary-Farbe für God Pi

#### **2. Toolbar Indicators:**

- **God Connection Status**: Echtzeit-Verbindungsstatus zum God Pi
- **Kaiser ID Badge**: Anzeige der aktuellen Kaiser ID
- **Autonomous Mode Indicator**: Status des autonomen Betriebsmodus

#### **3. HomeView Kaiser Header:**

- **Kaiser Status Display**: Übersicht über God Pi Verbindung und Sync-Status
- **Kaiser Quick Actions**: Schnellzugriff auf Kaiser-Features
- **Sync Statistics**: Anzahl der Push-Events und God Commands

#### **4. Menu Integration:**

- **Emergency Actions**: Notfall-Stopp für alle Geräte
- **Autonomous Mode Toggle**: Umschaltung zwischen autonomen und überwachtem Modus

#### **5. Settings Integration:**

- **Kaiser Configuration**: God Pi IP/Port und Sync-Einstellungen
- **Kaiser Status Display**: Live-Status der Kaiser-Integration
- **Port-Erklärung Komponente**: Visuelle Darstellung der Port-Konfiguration
- **System-Verbindungsdiagramm**: Interaktive Netzwerk-Architektur Visualisierung

### **🧪 Kaiser Testing**

#### **Test-Szenarien:**

1. **Standard-Modus**: Keine Kaiser-UI sichtbar
2. **Kaiser-Modus ohne God Pi**: Kaiser-UI sichtbar, God Pi disconnected
3. **Kaiser-Modus mit God Pi**: Vollständige Integration funktionsfähig
4. **Autonomous Mode**: Mode-Umschaltung und Persistierung

#### **Browser Console Testing:**

```javascript
// Kaiser Status überprüfen
console.log('Kaiser ID:', mqttStore.kaiser.id)
console.log('God Connected:', mqttStore.kaiser.godConnection.connected)
console.log('Autonomous Mode:', mqttStore.kaiser.autonomousMode)
console.log('Push Events:', mqttStore.kaiser.syncStats.pushEvents)
```

### **📊 Kaiser Status Monitoring**

#### **UI Status Indicators:**

- **Toolbar**: God Connection Icon und Kaiser ID Badge
- **HomeView**: Kaiser Header mit Status-Informationen
- **Menu**: Emergency Actions verfügbar
- **Settings**: Kaiser Configuration Section sichtbar

#### **MQTT Store Integration:**

```javascript
// Kaiser State Management
kaiser: {
  id: 'default_kaiser',
  type: 'pi_zero_edge_controller',
  autonomousMode: false,
  godConnection: {
    connected: false,
    godPiIp: '192.168.1.100',
    godPiPort: 8443,
    syncEnabled: true
  },
  syncStats: {
    pushEvents: 0,
    godCommands: 0,
    failedSyncs: 0
  }
}
```

## 🎨 **UI/UX Verbesserungen v3.8.0**

### **🆕 Neue Features:**

#### **1. Database Logs Card**

- **Geführte Filterführung**: Schritt-für-Schritt Anleitung für Datenanalyse
- **Auto-Reload System**: Automatische Datenaktualisierung mit konfigurierbaren Intervallen
- **Multi-View Datenanzeige**: Tabelle und Karten-Ansicht für verschiedene Anwendungsfälle
- **Chart-Integration**: Direkte Integration mit SensorVisualization für Diagramme
- **CSV-Export**: Konfigurierbare Export-Einstellungen mit Dokumentation
- **ESP-Navigation**: Direkte Verlinkung zu ESP-Geräten und Sensoren
- **Sensor-Icon-System**: Intuitive Darstellung verschiedener Sensor-Typen
- **Wert-Farbkodierung**: Farbkodierung basierend auf Sensor-Typ und Messwerten

#### **2. Dynamischer App-Header**

- **Intelligente System-Erkennung**: Unterscheidet automatisch zwischen Kaiser Edge Controller und God Pi
- **Kontextuelle Anzeige**:
  - Kaiser-Modus: `👑 Kaiser: greenhouse_kaiser_01 [EDGE CONTROLLER]`
  - God Pi-Modus: `🖥️ God Pi Central System [GOD PI]`
- **Visuelle Indikatoren**: Farbkodierte Icons und Badges für schnelle Identifikation
- **Rückwärtskompatibilität**: Unterstützung für ESP32 Preferences Key Fixes (v3.4.1)

#### **3. Unified Zone Management**

- **Zentrale Sensorverwaltung**: Alle Sensoren und Aktoren in einer einheitlichen Oberfläche
- **ESP32 Device Selection**: Intelligente ESP-Auswahl mit Status-Anzeige
- **Pin Assignment System**: Visuelles Pin-Management für XIAO ESP32-C3
- **I2C Sensor Support**: Native Unterstützung für I2C-Sensoren auf GPIO 4/5
- **Real-time Status**: Live-Updates für alle verbundenen Geräte
- **🆕 Intelligente Aggregationen**: Zeitfenster-basierte Sensor-Analysen (5 Min, 1h, 24h, alle Daten)
- **🆕 Live-Daten vs. Analyse-Trennung**: Klare Unterscheidung zwischen aktuellen Werten und aggregierten Daten
- **🆕 Globale Aggregation-Steuerung**: Einheitliche Kontrolle über alle Aggregationen mit Persistierung

#### **3. ESP32 Discovery & Management**

- **Automatische ESP-Erkennung**: Netzwerk-Scan für ESP32-Geräte
- **Status-Indikatoren**: Online/Offline Status für alle ESP-Geräte
- **Configuration Management**: Zentrale ESP-Konfiguration
- **Pin Validation**: Board-spezifische Pin-Validierung (XIAO ESP32-C3)
- **I2C Migration**: Automatische Migration bestehender I2C-Konfigurationen

#### **4. Port-Erklärung Komponente**

- **Visuelle Port-Karten**: Farbkodierte Darstellung der drei Hauptports
  - 🟢 **HTTP: 8080** - Sensor-Verarbeitung & API
  - 🔵 **MQTT: 9001** - Dashboard Echtzeit-Verbindung
  - 🟠 **MQTT: 1883** - ESP32-Geräte Verbindung
- **Expandierbare Hilfe**: System-Verbindungsdiagramm auf Knopfdruck
- **Dynamische Beschreibungen**: Angepasst an aktuellen System-Typ (Kaiser vs God Pi)
- **ESP32 Preferences Support**: Kompatibilität mit neuen kürzeren Key-Namen

#### **5. System-Verbindungsdiagramm**

- **Interaktive Visualisierung**: Zeigt die aktuelle Netzwerk-Architektur
- **Port-Verbindungen**: Farbkodierte Linien für verschiedene Protokolle
- **Verbundene Systeme**: Dynamische Anzeige je nach System-Typ (Kaiser → God Pi → ESP32)
- **Responsive Design**: Optimiert für verschiedene Bildschirmgrößen
- **Real-time Updates**: Live-Status der Netzwerk-Verbindungen

#### **6. Dynamische Seitentitel**

- **Browser-Titel**: Automatische Anpassung je nach System-Typ
  - Kaiser: `Dashboard - Kaiser greenhouse_kaiser_01`
  - God Pi: `Dashboard - God Pi Central System`
- **SEO-Optimierung**: Bessere Identifikation in Browser-Tabs
- **Router Integration**: Dynamische Titel basierend auf aktuellem System-Status

#### **7. 🆕 Intelligente Sensor-Aggregationen**

- **Zeitfenster-basierte Analyse**: 5 Minuten, 1 Stunde, 24 Stunden, alle Daten
- **Kontextabhängige Darstellung**: Aggregationen nur bei expliziter Aktivierung
- **Live-Daten Priorität**: Standardmäßig werden nur aktuelle Sensorwerte angezeigt
- **Globale Steuerung**: Einheitliche Kontrolle über alle Aggregationen im Dashboard
- **Persistente Einstellungen**: Benutzereinstellungen werden gespeichert
- **Performance-Optimierung**: Effiziente Berechnung basierend auf Zeitstempel
- **Warning-basierte Aggregation**: Gruppierung nach Sensor-Warnungen
- **Zeitqualität-basierte Aggregation**: Bewertung der Datenqualität

#### **8. 🆕 Actuator Logic Engine**

- **Zentrale Logic-Engine**: Prioritätsmanagement für alle Aktor-Steuerungen
- **Konfliktlösung**: Automatische Auflösung von Steuerungskonflikten
- **Prioritätshierarchie**: EMERGENCY > MANUAL > ALERT > LOGIC > TIMER > SCHEDULE > DEFAULT
- **Aktor-Typ-spezifische Regeln**: Spezielle Logik für Pumpen, LEDs, Heizungen
- **Real-time Evaluation**: Kontinuierliche Auswertung von Bedingungen und Timers
- **Failsafe-Mechanismen**: Automatische Sicherheitszustände bei Fehlern
- **Logging & Monitoring**: Umfassende Protokollierung aller Logic-Aktivitäten

#### **9. 🆕 Sensor Templates System**

- **Vorkonfigurierte Setups**: Fertige Konfigurationen für verschiedene Anwendungsfälle
- **Board-Type-spezifische Templates**: ESP32 DevKit und XIAO C3 Unterstützung
- **Template-Validierung**: Automatische Kompatibilitätsprüfung
- **I2C Sensor Limit Management**: Maximal 8 Sensoren pro I2C-Bus
- **Verfügbare Templates**:
  - **Temperatur + Luftfeuchte (Basic)**: DS18B20 + DHT22
  - **I2C Umwelt-Sensoren**: SHT31 + BME280 für präzise Messungen
  - **I2C Umwelt-Sensoren (XIAO)**: Angepasst für XIAO ESP32-C3
  - **Bewässerungssystem**: Feuchtigkeitssensor + Wasserpumpe
  - **Beleuchtungssteuerung**: Lichtsensor + LED-Streifen
  - **Klimasteuerung**: Temperatur + Lüfter + Luftbefeuchter
  - **Erweiterte Überwachung**: Mehrere Sensoren für präzise Kontrolle

### **🔧 Technische Implementierung:**

#### **🆕 Debug & Development Panels:**

- **ConfigurationPanel**: System-Konfiguration und Einstellungen
- **DeviceSimulator**: Simulierte Geräte für Test- und Entwicklungszwecke
- **KaiserIdTestPanel**: Kaiser-Funktionalität und ID-Tests
- **MqttDebugPanel**: MQTT-Verbindung und Topic-Debugging
- **PiIntegrationPanel**: Erweiterte Pi-Integration und Management
- **SensorRegistryPanel**: Sensor-Registry mit erweiterten Funktionen
- **SystemCommandsPanel**: System-Befehle und Command-History
- **WarningConfigurationPanel**: Warning-System und Konfiguration

#### **🆕 Erweiterte Features:**

- **Backend v3.5.0 Kompatibilität**: Unterstützung für Raw Data und erweiterte Payloads
- **Warning System**: Sensor-Qualitätsüberwachung mit konfigurierbaren Schwellenwerten
- **Time Quality Monitoring**: Bewertung der Datenqualität basierend auf Zeitstempel
- **Hardware/Simulation Mode**: Unterscheidung zwischen echten und simulierten Daten
- **ID-Konflikt-Behandlung**: Automatische Erkennung und Auflösung von ID-Konflikten
- **Hierarchische MQTT-Topics**: Verbesserte Topic-Struktur für bessere Organisation
- **I2C Migration System**: Automatische Migration bestehender I2C-Konfigurationen
- **ESP-Auswahl-System**: Zentrale ESP-Verwaltung mit automatischer Auswahl

#### **Neue Komponenten:**

```bash
src/components/
├── common/
│   ├── PortExplanation.vue          # Port-Erklärung mit Visualisierung
│   ├── SystemConnectionDiagram.vue  # Netzwerk-Architektur Diagramm
│   ├── ConnectionStatus.vue         # MQTT Verbindungsstatus
│   └── GlobalSnackbar.vue          # Globale Benachrichtigungen
├── layouts/
│   └── TopNavigation.vue           # Dynamische Navigation mit System-Erkennung
├── zones/
│   ├── UnifiedZoneManagement.vue    # Einheitliche Zonenverwaltung
│   ├── EnhancedPinConfiguration.vue # Erweiterte Pin-Konfiguration
│   ├── ZoneManagement.vue          # Zonen-Management
│   ├── PinConfiguration.vue        # Pin-Konfiguration
│   └── ZoneTreeView.vue            # Hierarchische Zonen-Ansicht
├── dashboard/
│   ├── ZoneCard.vue                # Zonen-Karten
│   ├── SubZoneCard.vue             # Sub-Zonen-Karten
│   ├── SystemStateCard.vue         # System-Status-Karten
│   └── SensorDataVisualization.vue # Sensor-Daten-Visualisierung
├── settings/
│   ├── EspConfiguration.vue        # ESP-Konfiguration
│   ├── EspSetupWizard.vue          # ESP-Setup-Assistent
│   ├── PiConfiguration.vue         # Pi-Integration
│   ├── PinConfiguration.vue        # Pin-Konfiguration
│   ├── LibraryManagement.vue       # Bibliotheks-Verwaltung
│   └── SimpleServerSetup.vue       # Einfache Server-Einrichtung
└── debug/
    ├── ConfigurationPanel.vue      # System-Konfiguration
    ├── DeviceSimulator.vue         # Geräte-Simulation
    ├── KaiserIdTestPanel.vue       # Kaiser-ID-Tests
    ├── MqttDebugPanel.vue          # MQTT-Debugging
    ├── PiIntegrationPanel.vue      # Pi-Integration
    ├── SensorRegistryPanel.vue     # Sensor-Registry
    ├── SystemCommandsPanel.vue     # System-Befehle
    └── WarningConfigurationPanel.vue # Warning-Konfiguration
└── settings/
    ├── DeviceManagement.vue        # Einheitliche Geräteverwaltung
    ├── EspConfiguration.vue        # ESP-Konfiguration
    ├── EspSetupWizard.vue          # ESP-Setup-Assistent
    ├── PiConfiguration.vue         # Pi-Integration
    ├── PinConfiguration.vue        # Pin-Konfiguration
    ├── LibraryManagement.vue       # Bibliotheks-Verwaltung
    └── SimpleServerSetup.vue       # Einfache Server-Einrichtung
```

#### **Views & Routing:**

```bash
src/views/
├── HomeView.vue                    # Hauptseite mit Kaiser-Integration
├── DashboardView.vue               # Dashboard mit Sensor-Visualisierung
├── ZonesView.vue                   # Zonen-Verwaltung
├── SettingsView.vue                # System-Einstellungen
├── DevicesView.vue                 # Geräte-Verwaltung (Legacy)
├── DevelopmentView.vue             # Debug- und Entwicklungs-Tools
├── ZoneFormView.vue                # Zone-Erstellung/Bearbeitung
└── AboutView.vue                   # Über-Seite
```

#### **Erweiterte Stores:**

- **centralConfig.js**: System-Name und Kaiser ID Management
- **mqtt.js**: Kaiser-Modus Erkennung und Status mit Rückwärtskompatibilität
- **espManagement.js**: Board-spezifische Pin-Validierung und I2C-Migration
- **zones.js**: Unified Zone Management für alle Sensoren und Aktoren
- **devices.js**: ESP32 Device Discovery und Management
- **piIntegration.js**: Pi-Server Integration und Library Management
- **sensorRegistry.js**: Sensor-Daten-Management und Aggregation
- **systemCommands.js**: System-Befehle und Command-History
- **actuatorLogic.js**: Zentrale Logic-Engine mit Prioritätsmanagement
- **databaseLogs.js**: Erweiterte Datenbank-Logs-Verwaltung

#### **Utils & Composables:**

```bash
src/utils/
├── espHelpers.js                   # ESP-spezifische Hilfsfunktionen
├── espHttpClient.js                # HTTP-Client für ESP-Kommunikation
├── storage.js                      # LocalStorage-Wrapper
├── time.js                         # Zeit-Formatierung und -Berechnung
├── config.js                       # Zentrale Konfiguration
├── deviceIdGenerator.js            # Geräte-ID-Generierung
├── errorHandler.js                 # Fehlerbehandlung
├── eventBus.js                     # Event-Bus für Komponenten-Kommunikation
├── mqttTopics.js                   # MQTT-Topic-Utilities
├── sensorUnits.js                  # Sensor-Einheiten-Management
├── storeLoader.js                  # Store-Loading-Utilities
├── deviceHealth.js                 # Device Health Utilities
├── systemHealth.js                 # System Health Utilities
├── snackbarUtils.js                # Snackbar Utility Functions

src/composables/
├── useSensorAggregation.js         # Sensor-Aggregation-Logik
├── useBlinkTracker.js              # Blink-Tracking für UI-Feedback
├── useDeviceHealthScore.js         # Geräte-Gesundheitsbewertung
├── useDeviceSynchronization.js     # Geräte-Synchronisation
├── useMqttFeedback.js              # MQTT-Feedback-System
```

#### **Data & Templates:**

```bash
src/data/
└── sensorTemplates.js              # Vorkonfigurierte Sensor-Templates

src/services/
└── apiService.js                   # API-Service für Backend-Kommunikation
```

#### **Navigation & Routing:**

- **TopNavigation**: Dynamische Navigation mit System-Erkennung
- **Mobile-optimierte Navigation**: Responsive Design für alle Bildschirmgrößen
- **Dynamische Titel**: Automatische Anpassung basierend auf System-Typ
- **Meta-Informationen**: Verbesserte Navigation und Identifikation
- **System-Erkennung**: Automatische Unterscheidung zwischen Kaiser und God Pi Modus
- **Route Guards**: Geschützte Routen für Entwicklungs-Tools
- **Breadcrumb Navigation**: Hierarchische Navigation für bessere UX

#### **Router-Integration:**

### **🎯 Benutzerfreundlichkeit:**

#### **Für Kaiser Edge Controller:**

- **Sofortige Identifikation**: Crown-Icon und "EDGE CONTROLLER" Badge
- **Port-Übersicht**: Klare Darstellung der Edge Controller Ports
- **Verbindungsdiagramm**: Zeigt Kaiser → God Pi → ESP32 Architektur
- **Emergency Controls**: Notfall-Stopp für alle ESP-Geräte
- **Autonomous Mode**: Umschaltung zwischen autonomen und überwachtem Modus
- **God Pi Integration**: Automatische Registrierung und Synchronisation

#### **Für God Pi Central:**

- **Server-Identifikation**: Server-Icon und "GOD PI" Badge
- **Zentrale Übersicht**: Ports für alle verbundenen Systeme
- **Verbindungsdiagramm**: Zeigt God Pi → Kaiser → ESP32 Hierarchie
- **ESP32 Preferences Support**: Kompatibilität mit neuen kürzeren Key-Namen
- **Zentrale Konfiguration**: Verwaltung aller verbundenen Systeme
- **System-Überwachung**: Monitoring aller Edge Controller und ESP-Geräte

#### **🆕 Für Entwickler:**

- **Debug-Panels**: Umfassende Entwicklungs-Tools
- **Device Simulator**: Test-Umgebung für neue Features
- **MQTT Debug**: Topic-Monitoring und Message-Tracking
- **Sensor Registry**: Erweiterte Sensor-Verwaltung
- **System Commands**: Command-History und -Validierung
- **Warning Configuration**: Konfigurierbare Warning-Schwellenwerte

## 📝 **Naming Conventions & Projektstandards**

### **Geräte-Bezeichnungen:**

- **Kaiser Device**: Dynamische Bezeichnung mit aktueller ID (z.B., "Pi0")
- **God Server**: Bezeichnet als "Bibliothek" in der Benutzeroberfläche
- **Library Settings**: Bezeichnet als "Bibliothek verwalten"
- **ESP Devices**: Bezeichnet als "Feld Geräte" oder "Feldgerätemanager"
- **Individual ESPs**: Dynamische ESP-ID Anzeige (z.B., "Testnachricht an Esp-ID")

### **Konsistenz-Standards:**

- **Vollständige Codebase-Analyse** vor jeder Änderung
- **Strikte Verwendung** bestehender Funktionen, Methoden und Topic-Strukturen
- **Struktur & Integration** mit bestehenden Systemen
- **Naming Conventions & Konsistenz** in allen Komponenten
- **Rückwärtskompatibilität** und Wiederverwendbarkeit
- **Memory & Resource Usage** Optimierung
- **Fault Tolerance** und Side Effects Minimierung
- **Functional Collisions** Vermeidung

### **Entwicklungsrichtlinien:**

- **Erweiterung bestehender Strukturen** ohne Duplikate
- **Menschlich-freundliche Erklärungen** ohne Überladung
- **Exakte Codezeilen-Darstellung** wie sie tatsächlich existieren
- **Fehleranalyse** und fehlende Stellen Identifikation
- **Entwickler-Verständnis** für das komplette System

## 🚀 **Schnellstart**

### **Entwicklungsserver starten**

```bash
cd growy-frontend
npm install
npm run dev
```

**Dashboard erreichbar unter:** `http://localhost:5173`

### **🆕 Kaiser-Modus aktivieren**

1. **HomeView öffnen** (`http://localhost:5173`)
2. **"Kaiser-Modus aktivieren"** klicken
3. **Kaiser ID eingeben** (z.B. `greenhouse_kaiser_01`)
4. **Seite wird automatisch neu geladen**

### **🆕 ESP-Geräte konfigurieren**

1. **Settings → ESP Configuration** öffnen
2. **ESP Device auswählen** oder neu hinzufügen
3. **Board Type wählen** (ESP32 DevKit oder XIAO C3)
4. **Sensor Templates** für schnelle Konfiguration verwenden
5. **I2C Sensoren** bei Bedarf konfigurieren (max. 8 pro Bus)

### **🆕 Sensor-Aggregationen aktivieren**

1. **Dashboard** öffnen
2. **"Aggregationen aktivieren"** klicken
3. **Zeitfenster wählen** (5 Min, 1h, 24h, alle Daten)
4. **Live-Daten vs. Analyse** nach Bedarf umschalten

### **🆕 Actuator Logic Engine konfigurieren**

1. **Dashboard** → **Actuator Logic** öffnen
2. **Aktor auswählen** (Pumpe, LED, Heizung, etc.)
3. **Bedingungen definieren** (Sensor-Schwellenwerte)
4. **Prioritäten setzen** (EMERGENCY > MANUAL > ALERT > LOGIC)
5. **Logic aktivieren** und testen

### **Produktionsserver starten**

```bash
npm run build
npm run preview -- --port 80
```

### **PM2 Process Management**

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs growy-frontend
```

### **🆕 Build-Konfiguration**

```bash
# Development Build
npm run dev

# Production Build
npm run build

# Preview Production Build
npm run preview

# Code Quality
npm run lint
npm run format

# Testing (wenn verfügbar)
npm run test
npm run test:unit
```

## 🔧 **Aktuelle Verbesserungen & Issues**

### **✅ Implementierte Features:**

- **Einheitliche Geräteverwaltung** mit GodDeviceCard, KaiserDeviceCard, EspDeviceCard
- **Central Data Hub** für zentrale Store-Koordination
- **Health Score System** mit automatischer Gesundheitsbewertung
- **Device Synchronization** mit zentraler Synchronisation
- **System Health Utilities** mit erweiterten Gesundheitsfunktionen
- **Collapsible Interface** mit 3 Collapse-Levels für alle Device Cards
- **Drag & Drop Support** für unkonfigurierte ESPs
- **Setup-Mode Konfiguration** für neue ESP-Geräte
- **Dual-IP-System** für Kaiser Pi0-Server und God-Verbindung
- **Backend v3.5.0 Kompatibilität** mit Raw Data Support und Warning System

### **🔄 Verbesserungsbedarf:**

1. **README-Aktualisierung**: Vollständige Dokumentation aller neuen Features
2. **Code-Beispiele**: Erweiterte Code-Beispiele für alle neuen Komponenten
3. **Naming Conventions**: Konsistente Anwendung der Projektstandards
4. **Error Handling**: Umfassende Fehlerbehandlung in allen Komponenten
5. **Performance-Optimierung**: Weitere Optimierungen für große Geräteanzahlen
6. **Mobile UI**: Verbesserte Mobile-Ansicht für alle Device Cards
7. **Testing**: Unit-Tests für alle neuen Komponenten
8. **Documentation**: API-Dokumentation für alle neuen Stores und Composables

### **🆕 Deployment**

Das Frontend kann auf verschiedenen Plattformen deployed werden:

- **Raspberry Pi**: PM2 für Production-Deployment
- **Docker**: Container-basiertes Deployment
- **Static Hosting**: Netlify, Vercel, etc.
- **Local Development**: Vite Dev Server

### **🆕 Environment Variables (Optional)**

Für erweiterte Konfiguration können folgende Environment Variables gesetzt werden:

```bash
# MQTT Configuration
VITE_MQTT_BROKER_URL=192.168.1.100
VITE_MQTT_BROKER_PORT=9001
VITE_MQTT_CLIENT_ID=growy_frontend_001
VITE_MQTT_USERNAME=
VITE_MQTT_PASSWORD=

# Kaiser Configuration
VITE_KAISER_ID=raspberry_pi_central

# System Configuration
VITE_GOD_NAME=God Pi
VITE_HTTP_PORT=8080
VITE_MQTT_PORT_ESP32=1883
```

```bash
# Kaiser Controller Konfiguration
VITE_KAISER_ID=mein_kaiser_controller
VITE_USE_NEW_CONFIG=true

# MQTT Broker Konfiguration (wird automatisch migriert)
VITE_MQTT_BROKER_URL=192.168.1.100
VITE_MQTT_BROKER_PORT=9001
VITE_MQTT_CLIENT_ID=growy_dashboard_client
VITE_MQTT_USERNAME=
VITE_MQTT_PASSWORD=
```

**Hinweis:** Die Environment Variables werden automatisch in die zentrale Konfiguration migriert und sind optional. Das System unterstützt vollständige Rückwärtskompatibilität für ESP32 Preferences Keys.

## 📁 **Projektstruktur & Funktionsweise**

### **🎯 Hauptkomponenten**

#### **🆕 NEU: Central Data Hub Integration**

Das **Central Data Hub** (`src/stores/centralDataHub.js` - 869 Zeilen) ist die zentrale Koordinationsstelle für alle Stores und Datenflüsse:

- **Store-Koordination**: Sichere Store-Referenzen mit Proxy-Handling
- **Performance-Cache**: Optimierte Datenabfragen mit Caching-Mechanismen
- **System-Status-Verwaltung**: Zentrale Status-Kontrolle für alle Komponenten
- **UI-Konfiguration**: Zentrale Einstellungsverwaltung mit Persistierung
- **Fehlerbehandlung**: Umfassende Fehlerbehandlung für alle Store-Zugriffe
- **Initialisierungsstatus**: Sichere Store-Initialisierung mit Fehlerbehandlung

**Code-Beispiel - Central Data Hub Usage:**

```javascript
// src/components/dashboard/SystemStateCard.vue - Cached Device Data
const device = computed(() => {
  return centralDataHub.getCachedData(`device-${props.espId}`, () => {
    return mqttStore.espDevices.get(props.espId) || {}
  })
})

// Kaiser Mode Detection über CentralDataHub
const isKaiserMode = computed(() => {
  return centralDataHub.isKaiserMode
})

// Optimierte Store-Zugriffe
const mqttStore = centralDataHub.mqttStore
const centralConfig = centralDataHub.centralConfig
const sensorRegistry = centralDataHub.sensorRegistry
```

#### **1. App.vue** (`src/App.vue` - 84 Zeilen)

**Funktion:** Hauptanwendungsshell mit Navigation und Kaiser-Status

**Neue Features v3.8.0:**

- **Erweiterte System-Erkennung**: Automatische Unterscheidung zwischen Kaiser Edge Controller und God Pi
- **Dynamische Titel**: Kontextuelle Anzeige je nach System-Typ
- **Global Snackbar Integration**: Zentrale Benachrichtigungen für alle Komponenten
- **Connection Status Monitoring**: Live-MQTT-Verbindungsstatus mit Tooltips
- **Mobile Navigation**: Responsive Navigation mit Mobile-Menu
- **Emergency Actions**: Notfall-Stopp für alle ESP-Geräte (nur im Kaiser-Modus)

- **Vue 3 App Shell:** Hauptanwendungsshell mit Vuetify Integration
- **Global Snackbar:** Zentrale Benachrichtigungen für alle Komponenten
- **Connection Status:** MQTT Verbindungsstatus-Anzeige
- **Top Navigation:** Erweiterte Navigation mit Kaiser-Integration
- **Responsive Design:** Mobile-optimierte Benutzeroberfläche
- **Global Styling:** Konsistente Vuetify-Komponenten-Styles
- **CSS Customization:** Responsive Verbesserungen und Design-Konsistenz

**Code-Beispiel - Kaiser Mode Detection:**

```javascript
// src/App.vue - Zeilen 18-21
const isKaiserMode = computed(() => {
  return mqttStore.kaiser.id !== 'default_kaiser'
})

// src/App.vue - Zeilen 40-50
function getGodConnectionIcon() {
  if (!mqttStore.kaiser.godConnection.connected) return 'mdi-wifi-off'
  if (mqttStore.kaiser.godConnection.syncEnabled) return 'mdi-sync'
  return 'mdi-sync-off'
}

function getGodConnectionStatus() {
  if (!mqttStore.kaiser.godConnection.connected) return 'God Pi: Disconnected'
  if (mqttStore.kaiser.godConnection.syncEnabled) return 'God Pi: Connected & Syncing'
  return 'God Pi: Connected (Sync Disabled)'
}
```

**Code-Beispiel - Dynamischer App-Header:**

```vue
<!-- src/App.vue - Dynamischer Header mit System-Erkennung -->
<v-app-bar-title class="d-flex align-center">
  <v-icon :icon="getSystemIcon()" class="mr-2" :color="getSystemColor()" />
  {{ getDynamicTitle() }}
  <v-chip 
    v-if="getSystemBadge()" 
    :color="getSystemColor()" 
    size="small" 
    variant="tonal" 
    class="ml-2"
  >
    {{ getSystemBadge() }}
  </v-chip>
</v-app-bar-title>
```

**Code-Beispiel - System-Erkennung Funktionen:**

```javascript
// src/App.vue - Neue System-Erkennung Funktionen
function getSystemIcon() {
  if (isKaiserMode.value) {
    return 'mdi-crown' // Kaiser Edge Controller
  } else if (centralConfig.kaiserId === 'raspberry_pi_central') {
    return 'mdi-server' // God Pi
  }
  return 'mdi-home-automation' // Standard
}

function getDynamicTitle() {
  if (isKaiserMode.value) {
    return `Kaiser: ${mqttStore.kaiser.id}`
  } else if (centralConfig.godName && centralConfig.godName !== 'Mein IoT System') {
    return centralConfig.godName
  }
  return 'IoT Control Center'
}

function getSystemBadge() {
  if (isKaiserMode.value) return 'EDGE CONTROLLER'
  if (centralConfig.kaiserId === 'raspberry_pi_central') return 'GOD PI'
  return null
}
```

**Code-Beispiel - Device Card Integration:**

```vue
<!-- src/components/settings/DeviceManagement.vue - Einheitliche Geräteverwaltung -->
<template>
  <div class="device-management">
    <!-- God Card (immer sichtbar) -->
    <div class="mb-4">
      <GodDeviceCard
        :is-selected="selectedDeviceId === 'god-server'"
        @select="handleDeviceSelect"
        @configure="handleDeviceConfigure"
      />
    </div>

    <!-- Kaiser Card (immer sichtbar) -->
    <div class="mb-4">
      <KaiserDeviceCard
        :is-selected="selectedDeviceId === 'kaiser-server'"
        @select="handleDeviceSelect"
        @configure="handleDeviceConfigure"
      />
    </div>

    <!-- ESP Devices nach Zonen gruppiert -->
    <div
      v-for="(devicesInZone, zoneName) in groupedEspDevices"
      :key="zoneName"
      class="mb-6"
      v-show="zoneName !== '🕳️ Unkonfiguriert' || devicesInZone.length > 0"
    >
      <EspDeviceCard
        v-for="espId in devicesInZone"
        :key="espId"
        :esp-id="espId"
        :is-selected="selectedDeviceId === espId"
        :draggable="zoneName === '🕳️ Unkonfiguriert'"
        @select="handleDeviceSelect"
        @configure="handleDeviceConfigure"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
      />
    </div>
  </div>
</template>
```

**Code-Beispiel - Kaiser Device Card Features:**

```javascript
// src/components/settings/KaiserDeviceCard.vue - Dual-IP-System
const deviceInfo = computed(() => {
  const kaiserName = centralConfig.kaiserName || 'Kaiser Pi'
  const kaiserId = centralConfig.getCurrentKaiserId

  return {
    // Kaiser-Identifikation
    name: kaiserName,
    kaiserId: kaiserId,

    // Pi0-Server (wo der Kaiser läuft)
    pi0ServerIp: centralConfig.kaiserPi0ServerIp || '192.168.1.100',
    pi0ServerPort: centralConfig.kaiserPi0ServerPort || 8080,

    // God-Verbindung (wo Daten geteilt werden)
    godConnectionIp: centralConfig.kaiserGodConnectionIp || '192.168.1.200',
    godConnectionPort: centralConfig.kaiserGodConnectionPort || 8443,

    // Status
    status: mqttStore.kaiser.godConnection.connected ? 'online' : 'offline',
    health: evaluateDeviceHealth({
      connectionEstablished: mqttStore.kaiser.godConnection.connected,
      systemState: mqttStore.kaiser.godConnection.connected ? 'OPERATIONAL' : 'ERROR',
    }),
  }
})

// Collapse Level Management
const setCollapseLevel = (level) => {
  collapseLevel.value = level
  localStorage.setItem('kaiserDeviceCardCollapseLevel', level.toString())
}
```

**Code-Beispiel - ESP Device Card Features:**

```javascript
// src/components/settings/EspDeviceCard.vue - Setup-Mode Konfiguration
const isSetupMode = computed(() => {
  return deviceInfo.value.webserverActive || deviceInfo.value.setupMode
})

const setupConfig = ref({
  wifi_ssid: '',
  wifi_password: '',
  esp_friendly_name: '',
  esp_zone: '',
})

const configureESP = async () => {
  configuring.value = true
  try {
    await mqttStore.sendSystemCommand(props.espId, 'configureESP', setupConfig.value)
    window.$snackbar?.showSuccess('ESP erfolgreich konfiguriert')
  } catch (error) {
    window.$snackbar?.showError(`Konfiguration fehlgeschlagen: ${error.message}`)
  } finally {
    configuring.value = false
  }
}

// Drag & Drop für unkonfigurierte ESPs
const handleDragStart = (event) => {
  if (props.draggable) {
    isDragging.value = true
    event.dataTransfer.setData('text/plain', props.espId)
    event.dataTransfer.effectAllowed = 'move'
    emit('dragstart', props.espId)
  }
}
```

**Code-Beispiel - Kaiser Toolbar Indicators:**

```vue
<!-- src/App.vue - Kaiser Status Indicators in Toolbar -->
<div v-if="isKaiserMode" class="d-flex align-center mr-4">
  <!-- God Connection Status -->
  <v-tooltip location="bottom">
    <template v-slot:activator="{ props }">
      <v-icon v-bind="props" :color="getGodConnectionColor()" class="mr-2">
        {{ getGodConnectionIcon() }}
      </v-icon>
    </template>
    {{ getGodConnectionStatus() }}
  </v-tooltip>

  <!-- Autonomous Mode Indicator -->
  <v-chip v-if="mqttStore.kaiser.autonomousMode" color="warning" size="small" class="mr-2">
    <v-icon start>mdi-robot</v-icon>
    Autonomous
  </v-chip>

  <!-- Kaiser ID Badge -->
  <v-chip color="primary" size="small">
    <v-icon start>mdi-crown</v-icon>
    {{ mqttStore.kaiser.id }}
  </v-chip>
</div>
```

**Code-Beispiel - Kaiser Menu Actions:**

```vue
<!-- src/App.vue - Emergency Actions im Menu -->
<v-divider v-if="isKaiserMode" class="my-2" />
<v-list-item v-if="isKaiserMode" @click="emergencyStopAll">
  <v-list-item-title class="text-error">
    <v-icon class="mr-2">mdi-stop-circle</v-icon>
    Emergency Stop All
  </v-list-item-title>
</v-list-item>

<!-- Autonomous Mode Toggle -->
<v-list-item v-if="isKaiserMode" @click="toggleAutonomousMode">
  <v-list-item-title>
    <v-icon class="mr-2">
      {{ mqttStore.kaiser.autonomousMode ? 'mdi-account-supervisor' : 'mdi-robot' }}
    </v-icon>
    {{ mqttStore.kaiser.autonomousMode ? 'Disable Autonomous' : 'Enable Autonomous' }}
  </v-list-item-title>
</v-list-item>
```

#### **2. DashboardView.vue** (`src/views/DashboardView.vue` - 410 Zeilen)

**Funktion:** Multi-View Dashboard mit Systemübersicht und erweiterten Ansichten

**Neue Features v3.8.0:**

- **Database Logs Integration**: Direkte Integration der erweiterten Datenbank-Logs
- **Actuator Logic Engine**: Zentrale Logic-Engine mit Prioritätsmanagement
- **Erweiterte Sensor-Aggregationen**: Zeitfenster-basierte Analyse mit konfigurierbaren Intervallen
- **Multi-View System**: Zonen-, ESP- und Sensor-Ansichten mit Toggle
- **Auto-Reload System**: Automatische Datenaktualisierung mit konfigurierbaren Intervallen
- **Geführte Filterführung**: Schritt-für-Schritt Anleitung für Datenanalyse

- **Multi-View System:** Zonen-, ESP- und Sensor-Ansichten mit Toggle
- **System Status Overview:** Online/Offline Status, aktive Zonen, Geräteanzahl
- **Unified Zone Management:** Zentrale Verwaltung aller Sensoren und Aktoren
- **Quick Access:** Schnellzugriff auf häufige Funktionen
- **Zone Cards:** Visuelle Darstellung aller Zonen mit Status
- **Central Sensor Management:** Hinweis auf einheitliche Sensorverwaltung
- **🆕 Globale Aggregation-Steuerung:** Einheitliche Kontrolle über alle Sensor-Aggregationen
- **🆕 Zeitfenster-Auswahl:** 5 Min, 1h, 24h, alle Daten für aggregierte Analysen
- **🆕 Persistente Einstellungen:** Benutzereinstellungen werden automatisch gespeichert
- **🆕 Live-Daten vs. Analyse-Trennung:** Klare Unterscheidung zwischen aktuellen Werten und Aggregationen
- **🆕 Sensor Registry Integration:** Globale Sensor-Übersicht mit erweiterten Funktionen
- **🆕 ESP Device Discovery:** Automatische ESP-Geräte-Erkennung und -Verwaltung
- **🆕 Backend v3.5.0 Kompatibilität:** Vollständige Integration der neuen Sensor-Features
- **🆕 Warning System Integration:** Zentrale Warning-Anzeige und -Monitoring
- **🆕 Time Quality Monitoring:** Datenqualitätsbewertung im Dashboard

#### **3. ZonesView.vue** (`src/views/ZonesView.vue` - 335 Zeilen)

**Funktion:** Zonen-Management mit Unified Zone Management

- **UnifiedZoneManagement Component:** Einheitliche Verwaltung aller Sensoren und Aktoren
- **ESP32 Device Selection:** Intelligente ESP-Auswahl mit Status-Anzeige
- **Pin Assignment System:** Visuelles Pin-Management für XIAO ESP32-C3
- **I2C Sensor Support:** Native Unterstützung für I2C-Sensoren
- **Real-time Status:** Live-Updates für alle verbundenen Geräte
- **Zone Tree View:** Hierarchische Darstellung der Zonen-Struktur
- **Enhanced Pin Configuration:** Erweiterte Pin-Konfiguration mit Validierung

#### **4. SettingsView.vue** (`src/views/SettingsView.vue` - 371 Zeilen)

**Funktion:** Zentrale Einstellungen und Konfiguration

- **Central Configuration:** System-weite Einstellungen
- **ESP Configuration:** ESP32-spezifische Konfiguration
- **Pi Integration:** Pi-Server Integration und Library Management
- **Pin Configuration:** Board-spezifische Pin-Validierung
- **Port Explanation:** Visuelle Port-Erklärung und System-Diagramm
- **Kaiser Configuration:** Kaiser Edge Controller Einstellungen
- **System Connection Diagram:** Interaktive Netzwerk-Architektur Visualisierung

**Code-Beispiel - Kaiser Status Header:**

```vue
<!-- src/views/HomeView.vue - Zeilen 15-60 -->
<div v-if="isKaiserMode" class="mb-8 bg-gradient-to-r from-blue-50 to-indigo-50 shadow rounded-lg p-6">
  <div class="flex items-center justify-between">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 mb-2">
        👑 Kaiser Controller: {{ mqttStore.kaiser.id }}
      </h2>
      <p class="text-gray-600">
        Edge Controller für autonome Operation und God Pi Synchronisation
      </p>
    </div>
    <div class="text-right">
      <div class="flex items-center space-x-4">
        <!-- God Connection Status -->
        <div class="text-center">
          <div class="text-sm text-gray-600">God Pi</div>
          <div class="flex items-center">
            <div
              :class="[
                'w-3 h-3 rounded-full mr-2',
                mqttStore.kaiser.godConnection.connected ? 'bg-green-500' : 'bg-red-500'
              ]"
            ></div>
            <span class="text-sm font-medium">
              {{ mqttStore.kaiser.godConnection.connected ? 'Connected' : 'Disconnected' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

**Code-Beispiel - Kaiser Activation Section:**

```vue
<!-- src/views/HomeView.vue - Kaiser Activation für nicht-aktive Modi -->
<div v-else class="mb-8 bg-gradient-to-r from-yellow-50 to-orange-50 shadow rounded-lg p-6">
  <div class="text-center">
    <h2 class="text-2xl font-bold text-gray-900 mb-4">
      👑 Kaiser Controller Integration
    </h2>
    <p class="text-gray-600 mb-6">
      Aktivieren Sie den Kaiser-Modus, um erweiterte Edge Controller Funktionen zu nutzen.
    </p>
    <div class="flex justify-center space-x-4">
      <button
        class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-medium"
        @click="activateKaiserMode"
      >
        Kaiser-Modus aktivieren
      </button>
    </div>
  </div>
</div>
```

**Code-Beispiel - Kaiser Quick Actions:**

```vue
<!-- src/views/HomeView.vue - Kaiser Quick Actions -->
<div v-if="isKaiserMode" class="mt-6">
  <h3 class="text-lg font-semibold text-gray-800 mb-4">👑 Kaiser Actions</h3>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
    <button
      class="quick-action-btn bg-purple-50 hover:bg-purple-100 p-4 rounded-lg text-center"
      @click="registerWithGod"
    >
      <span class="block text-2xl mb-2">👑</span>
      <span class="text-sm font-medium text-purple-700">Register with God</span>
    </button>
    <button
      class="quick-action-btn bg-orange-50 hover:bg-orange-100 p-4 rounded-lg text-center"
      @click="toggleAutonomousMode"
    >
      <span class="block text-2xl mb-2">🤖</span>
      <span class="text-sm font-medium text-orange-700">
        {{ mqttStore.kaiser.autonomousMode ? 'Disable' : 'Enable' }} Autonomous
      </span>
    </button>
  </div>
</div>
```

#### **3. SettingsView.vue** (`src/views/SettingsView.vue` - 335 Zeilen)

**Funktion:** Zentrale Konfigurationsoberfläche

- **ESP-Auswahl:** Dropdown für verfügbare ESP-Geräte
- **ESP-Konfiguration:** Identität, Netzwerk, Server-Einstellungen
- **Pin-Konfiguration:** GPIO-Pin Zuweisungen für Sensoren/Aktoren
- **Pi Server Konfiguration:** Raspberry Pi Integration
- **Library Management:** Python-Bibliotheken Verwaltung

**Code-Beispiel - ESP-Auswahl:**

```vue
<!-- src/views/SettingsView.vue - Zeilen 120-140 -->
<v-select
  v-model="selectedEspId"
  label="ESP Gerät auswählen"
  :items="espDevices"
  item-title="title"
  item-value="value"
  placeholder="ESP Gerät auswählen"
  variant="outlined"
  density="comfortable"
>
  <template #item="{ item, props }">
    <v-list-item v-bind="props">
      <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
      <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
    </v-list-item>
  </template>
</v-select>
```

#### **4. DashboardView.vue** (`src/views/DashboardView.vue` - 178 Zeilen)

**Funktion:** Hauptdashboard mit System-Status und Zonen-Übersicht

- **System Status:** Online/Offline Status, aktive Zonen, Geräteanzahl
- **Quick Access:** Schnellzugriff auf häufige Funktionen
- **Zone Overview:** Live Zonen-Status mit ZoneCard-Komponenten
- **Real-time Updates:** Echtzeit-System-Status-Monitoring

**Code-Beispiel - Multi-View Dashboard:**

```javascript
// src/views/DashboardView.vue - Zeilen 220-250
// 🆕 NEU: View Mode State mit Persistierung
const viewMode = ref(storage.load('dashboard_view', 'zones'))

// 🆕 NEU: Globale Aggregation-Einstellungen mit Persistierung
const globalShowAggregations = ref(storage.load('global_show_aggregations', false))
const globalTimeWindow = ref(storage.load('global_time_window', 5 * 60 * 1000))

// 🆕 NEU: Optimierte ESP Devices Integration
const espIds = computed(() => {
  // Kombiniert alle verfügbaren ESP-Datenquellen
  const mqttEspIds = Array.from(mqttStore.espDevices.keys())
  const registryEspIds = Array.from(sensorRegistry.sensorsByEsp.keys())

  // Dedupliziert und sortiert
  const allEspIds = [...new Set([...mqttEspIds, ...registryEspIds])]
  return allEspIds.sort()
})

const systemStatus = computed(() => ({
  status: mqttStore.isConnected ? 'Online' : 'Offline',
  activeZones: zones.value.filter((z) => z.active).length,
  devices: mqttStore.espDevices.size,
  lastUpdate: formatTimestamp(mqttStore.lastMessageTime),
}))

// 🆕 NEU: Backend v3.5.0 Warning System Integration
const warningStats = computed(() => sensorRegistry.getWarningStats)
const timeQualityStats = computed(() => sensorRegistry.getTimeQualityStats)
```

#### **5. HomeView.vue** (`src/views/HomeView.vue` - 391 Zeilen)

**Funktion:** Home-Ansicht mit Kaiser-Integration und System-Übersicht

- **Kaiser Mode Detection:** Automatische Erkennung des Kaiser-Modus
- **Kaiser Status Header:** Live-Status des Kaiser Controllers
- **Kaiser Activation:** Aktivierung des Kaiser-Modus über UI
- **God Pi Integration:** Registrierung und Synchronisation mit God Pi
- **Autonomous Mode Toggle:** Umschaltung zwischen autonomen und überwachtem Modus
- **Emergency Controls:** Notfall-Stopp für alle ESP-Geräte
- **ID-Konflikt-Management:** Zentrale Behandlung von ID-Konflikten
- **System Status Overview:** Online/Offline Status, aktive Zonen, Geräteanzahl
- **Kaiser Quick Actions:** Schnellzugriff auf Kaiser-Features

**Code-Beispiel - Tab Navigation:**

```vue
<!-- src/views/ZonesView.vue - Zeilen 120-130 -->
<v-tabs v-model="activeTab" class="mb-6">
  <v-tab value="zones">Zonen Übersicht</v-tab>
  <v-tab value="management">ESP & Zone Management</v-tab>
  <v-tab value="pins">Pin Konfiguration</v-tab>
</v-tabs>

<!-- Tab Content -->
<div v-if="activeTab === 'zones'">
  <!-- Zone Overview Content -->
</div>
<div v-else-if="activeTab === 'management'">
  <UnifiedZoneManagement />
</div>
<div v-else-if="activeTab === 'pins'">
  <EnhancedPinConfiguration />
</div>
```

#### **6. DevelopmentView.vue** (`src/views/DevelopmentView.vue` - 344 Zeilen)

**Funktion:** Debug-Interface für Entwickler

- **MQTT Debug Panel:** Echtzeit-Nachrichten-Monitoring
- **Device Simulator:** ESP32-Geräte-Simulation
- **Configuration Panel:** MQTT Broker-Konfiguration
- **System Commands Panel:** System-Steuerungs-Interface
- **Pi Integration Panel:** Pi Server-Management
- **Kaiser ID Test Panel:** Kaiser-Controller-Tests
- **Sensor Registry Panel:** Erweiterte Sensor-Verwaltung

#### **Debug Komponenten**

**SensorRegistryPanel.vue** (`src/components/debug/SensorRegistryPanel.vue` - 496 Zeilen)

- **Sensor Registry Display:** Zentrale Anzeige aller registrierten Sensoren
- **ESP-spezifische Gruppierung:** Sensoren nach ESP-Geräten gruppiert
- **Sensor Status Monitoring:** Live-Status-Überwachung
- **Sensor Data Display:** Anzeige von Sensor-Werten und Metadaten
- **Sensor Actions:** Aktionen für einzelne Sensoren
- **🆕 Backend v3.5.0 Spalten:** Raw Value, Mode, Warnings, Time Quality
- **🆕 Warning-Statistiken:** Zentrale Warning-Anzeige und -Analyse
- **🆕 Zeitqualität-Monitoring:** Datenqualitätsbewertung pro Sensor
- **🆕 Hardware/Simulation Mode:** Unterscheidung zwischen Hardware- und Simulationsmodus
- **🆕 Erweiterte Filterung:** Nach Sensor-Typ und ESP-Gerät
- **🆕 Export-Funktionalität:** Datenexport für Analyse und Backup

**KaiserIdTestPanel.vue** (`src/components/debug/KaiserIdTestPanel.vue` - 382 Zeilen)

- **Kaiser ID Tests:** Test-Szenarien für Kaiser-Controller
- **God Pi Connection Tests:** Verbindungstests zum God Pi Server
- **Autonomous Mode Tests:** Tests für autonomen Betriebsmodus
- **Emergency Control Tests:** Notfall-Steuerungs-Tests

**PiIntegrationPanel.vue** (`src/components/debug/PiIntegrationPanel.vue` - 581 Zeilen)

- **Pi Server Management:** Raspberry Pi Integration
- **Library Management:** Python-Bibliotheken Verwaltung
- **Sensor Configuration:** Pi-Sensor-Konfiguration
- **Health Monitoring:** Pi-Server-Status-Überwachung

**SystemCommandsPanel.vue** (`src/components/debug/SystemCommandsPanel.vue` - 388 Zeilen)

- **System Commands:** ESP-System-Steuerung
- **Command History:** Befehlsverlauf
- **Safe Mode Management:** Sicherheitsmodus-Verwaltung
- **Emergency Controls:** Notfall-Steuerung

**ConfigurationPanel.vue** (`src/components/debug/ConfigurationPanel.vue` - 226 Zeilen)

- **MQTT Configuration:** MQTT Broker-Konfiguration
- **Connection Testing:** Netzwerk-Konnektivität Tests
- **Configuration Validation:** Eingabevalidierung
- **Configuration Persistence:** Persistente Speicherung

**DeviceSimulator.vue** (`src/components/debug/DeviceSimulator.vue` - 357 Zeilen)

- **ESP32 Simulation:** Simulierte ESP32-Geräte
- **Sensor Data Simulation:** Simulierte Sensor-Daten
- **Actuator Control Simulation:** Simulierte Aktor-Steuerung
- **Real-time Simulation:** Echtzeit-Simulation

**Code-Beispiel - Tab Structure:**

```javascript
// src/views/DevelopmentView.vue - Zeilen 65-75
const tabs = [
  { id: 'mqtt', name: 'MQTT Debug' },
  { id: 'devices', name: 'Device Simulator' },
  { id: 'config', name: 'Configuration' },
  { id: 'system', name: 'System Commands' },
  { id: 'pi', name: 'Pi Integration' },
]
```

#### **7. DevicesView.vue** (`src/views/DevicesView.vue` - 32 Zeilen)

**Funktion:** Geräte-Verwaltung und -Monitoring

- **Device Overview:** Übersicht aller ESP-Geräte
- **Device Configuration:** Geräte-spezifische Konfiguration
- **Status Monitoring:** Live-Geräte-Status-Überwachung
- **Pin Management:** GPIO-Pin Zuweisungen

#### **8. ZoneFormView.vue** (`src/views/ZoneFormView.vue`)

**Funktion:** Zone-Erstellung und -Bearbeitung

- **Zone Creation:** Neue Zone erstellen
- **Zone Editing:** Bestehende Zone bearbeiten
- **Form Validation:** Eingabevalidierung
- **ESP Assignment:** ESP-Geräte-Zuordnung

#### **9. AboutView.vue** (`src/views/AboutView.vue`)

**Funktion:** Über-Seite (Platzhalter)

- **System Information:** System-Informationen und Version
- **Credits:** Entwickler-Informationen
- **License:** Lizenz-Informationen

**Status:** Minimal-Implementierung - wird erweitert

### **🆕 NEU: Einheitliche Geräteverwaltung**

Das **Device Management System** (`src/components/settings/DeviceManagement.vue` - 1200+ Zeilen) bietet eine vollständig einheitliche Verwaltung aller Gerätetypen:

#### **Geräte-Typen:**

1. **God Device Card** (`src/components/settings/GodDeviceCard.vue` - 400+ Zeilen)

   - God-Server Anzeige mit erweiterten Konfigurationsoptionen
   - Dual-IP-System für lokale Frontend- und Server-Backend-Konfiguration
   - Collapsible Interface mit 3 Collapse-Levels
   - Name-Beispiele mit konfigurierbaren Beispielen

2. **Kaiser Device Card** (`src/components/settings/KaiserDeviceCard.vue` - 600+ Zeilen)

   - Kaiser Edge Controller Anzeige mit vollständiger Konfiguration
   - Dual-IP-System für Pi0-Server (Edge Controller) und God-Verbindung
   - God-Connection Status mit Live-Verbindungsüberwachung
   - System-Status-Übersicht mit Agenten, Bibliotheken und Verbindungen

3. **ESP Device Card** (`src/components/settings/EspDeviceCard.vue` - 812 Zeilen)
   - ESP-Geräte Anzeige mit erweiterten Konfigurationsoptionen
   - Setup-Mode Konfiguration für neue ESP-Geräte
   - Drag & Drop Support für unkonfigurierte ESPs
   - Health-Status Integration mit automatischer Gesundheitsbewertung

#### **Einheitliche Features:**

- **Health Score System**: Automatische Gesundheitsbewertung für alle Geräte
- **Collapsible Interface**: 3 Collapse-Levels (vollständig, kompakt, minimal)
- **Drag & Drop**: Zone-Zuweisung für unkonfigurierte ESPs
- **Real-time Updates**: Live-Status-Updates für alle Geräte
- **Error Handling**: Umfassende Fehlerbehandlung mit visueller Anzeige
- **Responsive Design**: Mobile-optimierte Darstellung
- **Persistent Settings**: Automatische Speicherung von Benutzereinstellungen

### **🔧 Store Management (Pinia)**

#### **MQTT Store** (`src/stores/mqtt.js` - 2392 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Erweiterte ID-Konflikt-Behandlung**: Konflikt-Management für Kaiser, Master Zone, Subzone und ESP IDs
- **Backend v3.5.0 Kompatibilität**: Raw Data Support, Warning System, Time Quality Monitoring
- **Hardware/Simulation Mode**: Unterscheidung zwischen Hardware- und Simulationsmodus
- **Verbesserte MQTT Topic-Struktur**: Hierarchische Organisation mit erweiterten Topic-Patterns
- **Discovery-Liste**: Manuelle Konfiguration für ESP-Geräte
- **ACK-Update Tracking**: TreeView-Synchronisation für Sensor- und Aktor-Updates
- **Kaiser God Pi Integration**: Vollständige God Pi Registrierung und Push-Synchronisation
- **Autonomous Mode Management**: Autonomer Betriebsmodus mit Persistierung
- **Emergency Controls**: System-weiter Notfall-Stopp für alle ESP-Geräte

- **Verbindungsmanagement:** Auto-Reconnect mit exponentieller Backoff-Strategie
- **Kaiser Integration:** God Pi Registrierung und Push-Synchronisation
- **Kaiser State Management:** Vollständige Kaiser-Controller-Verwaltung
- **Autonomous Mode:** Autonomer Betriebsmodus mit Persistierung
- **Emergency Controls:** Notfall-Stopp für alle ESP-Geräte
- **ESP-Geräte Management:** Automatische Geräteerkennung und Status-Tracking
- **Topic-Subscription:** Hierarchische MQTT-Topic-Struktur
- **Connection Quality Monitoring:** Paketverlust und Stabilitäts-Tracking
- **🆕 Erweiterte ID-Konflikt-Behandlung:** Konflikt-Management für Kaiser, Master Zone, Subzone und ESP IDs
- **ESP32 Discovery System:** Automatische ESP-Geräte-Erkennung
- **Sensor Registry Integration:** Erweiterte Sensor-Verwaltung
- **Board-Type Information:** Automatische Board-Typ-Erkennung
- **🆕 Backend v3.5.0 Kompatibilität:** Raw Data Support, Warning System, Time Quality Monitoring
- **🆕 Hardware/Simulation Mode:** Unterscheidung zwischen Hardware- und Simulationsmodus
- **🆕 Verbesserte MQTT Topic-Struktur:** Hierarchische Organisation mit erweiterten Topic-Patterns
- **🆕 Discovery-Liste:** Manuelle Konfiguration für ESP-Geräte
- **🆕 ACK-Update Tracking:** TreeView-Synchronisation für Sensor- und Aktor-Updates
- **🆕 Kaiser God Pi Integration:** Vollständige God Pi Registrierung und Push-Synchronisation
- **🆕 Autonomous Mode Management:** Autonomer Betriebsmodus mit Persistierung
- **🆕 Emergency Controls:** System-weiter Notfall-Stopp für alle ESP-Geräte

**Code-Beispiel - Kaiser State Management:**

```javascript
// src/stores/mqtt.js - Zeilen 15-35
kaiser: {
  id: localStorage.getItem('kaiser_id') || 'default_kaiser',
  type: 'pi_zero_edge_controller',
  autonomousMode: false,
  godConnection: {
    connected: false,
    godPiIp: localStorage.getItem('god_pi_ip') || '192.168.1.100',
    godPiPort: 8443,
    lastPushSync: null,
    syncEnabled: true
  },
  syncStats: {
    pushEvents: 0,
    godCommands: 0,
    failedSyncs: 0
  }
}
```

**Code-Beispiel - Kaiser God Pi Integration:**

```javascript
// src/stores/mqtt.js - Zeilen 121-150
async registerWithGod() {
  try {
    const response = await fetch(`http://${this.kaiser.godConnection.godPiIp}:${this.kaiser.godConnection.godPiPort}/api/kaiser/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kaiser_id: this.kaiser.id,
        kaiser_type: this.kaiser.type,
        ip_address: window.location.hostname,
        capabilities: ['sensor_processing', 'actuator_control', 'autonomous_operation']
      }),
    })

    this.kaiser.godConnection.connected = response.ok
    if (response.ok) {
      console.log('Successfully registered with God Pi')
      window.$snackbar?.showSuccess('Successfully registered with God Pi')
    } else {
      console.error('God registration failed:', response.status)
      window.$snackbar?.showError('Failed to register with God Pi')
    }
    return response.ok
  } catch (error) {
    this.kaiser.godConnection.connected = false
    console.error('God registration failed:', error)
    window.$snackbar?.showError('Failed to register with God Pi')
    return false
  }
}

// src/stores/mqtt.js - Zeilen 151-185
async pushToGod(eventType, eventData) {
  if (!this.kaiser.godConnection.connected || !this.kaiser.godConnection.syncEnabled) return

  try {
    const response = await fetch(`http://${this.kaiser.godConnection.godPiIp}:${this.kaiser.godConnection.godPiPort}/api/kaiser/${this.kaiser.id}/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event_type: eventType,
        data: eventData,
        timestamp: new Date().toISOString()
      }),
    })

    if (response.ok) {
      this.kaiser.syncStats.pushEvents++
      this.kaiser.godConnection.lastPushSync = new Date()
      console.log(`Push sync successful: ${eventType}`)
    } else {
      this.kaiser.syncStats.failedSyncs++
      console.error('Push sync failed:', response.status)
    }
  } catch (error) {
    this.kaiser.syncStats.failedSyncs++
    console.error('Push sync failed:', error)
  }
}
```

**Code-Beispiel - Emergency Controls:**

```javascript
// src/stores/mqtt.js - Zeilen 868-880
async emergencyStopAll() {
  try {
    // Send emergency stop to all ESP devices
    for (const [espId, device] of this.espDevices) {
      await this.emergencyStop(espId)
    }

    this.systemStatus.emergencyStop = true
    console.log('Emergency stop executed for all devices')
    window.$snackbar?.showSuccess('Emergency stop executed for all devices')
  } catch (error) {
    console.error('Emergency stop failed:', error)
    window.$snackbar?.showError('Emergency stop failed')
  }
}

// src/stores/mqtt.js - Zeilen 213-219
saveKaiserConfig() {
  localStorage.setItem('kaiser_id', this.kaiser.id)
  localStorage.setItem('god_pi_ip', this.kaiser.godConnection.godPiIp)
  console.log('Kaiser configuration saved to localStorage')
}

// 🆕 NEU: Backend v3.5.0 Sensor Data Handling
handleSensorData(espId, topicParts, payload, subzoneId = null, gpio = null) {
  try {
    // 🆕 NEU: Dual Payload Structure Support
    const sensorData = this.getCompatibleValue(payload, 'sensor_data', 'data', payload)
    const warnings = this.getWarnings(payload)
    const timeQuality = this.getTimeQuality(payload)
    const context = this.getContext(payload)

    // 🆕 NEU: Raw Data Support
    const rawValue = payload.raw_value || null
    const rawMode = payload.raw_mode || false
    const hardwareMode = payload.hardware_mode !== undefined ? payload.hardware_mode : true

    // Update sensor registry with new data
    this.updateSensorRegistry(espId, gpio, {
      ...sensorData,
      warnings,
      time_quality: timeQuality,
      context,
      raw_value: rawValue,
      raw_mode: rawMode,
      hardware_mode: hardwareMode,
      timestamp: payload.timestamp || Date.now(),
      iso_timestamp: payload.iso_timestamp || null
    }, subzoneId)

  } catch (error) {
    console.error('Failed to handle sensor data:', error)
  }
}

// 🆕 NEU: Warning System
getWarnings(payload) {
  if (payload.warnings && Array.isArray(payload.warnings)) {
    return payload.warnings
  }
  if (payload.sensor && payload.sensor.warnings) {
    return payload.sensor.warnings
  }
  return []
}

// 🆕 NEU: Time Quality Monitoring
getTimeQuality(payload) {
  if (payload.time_quality) return payload.time_quality
  if (payload.sensor && payload.sensor.time_quality) return payload.sensor.time_quality
  return 'unknown'
}

// 🆕 NEU: Context Information
getContext(payload) {
  if (payload.context) return payload.context
  if (payload.sensor && payload.sensor.context) return payload.sensor.context
  return null
}
```

#### **Zones Store** (`src/stores/zones.js` - 603 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Aggregation-Integration**: Unterstützung für zeitfenster-basierte Sensor-Analysen
- **Performance-Optimierung**: Effiziente Berechnung von Durchschnittswerten
- **Zeitstempel-basierte Filterung**: Präzise Zeitfenster-Auswahl für Aggregationen
- **Sensor Registry Integration**: Automatische Sensor-Registrierung
- **MQTT Listener Setup**: Automatische MQTT-Topic-Subscription
- **Backend v3.5.0 Support**: Integration der neuen Sensor-Datenfelder
- **Warning System Integration**: Sensor-Warning-Handling in Zonen
- **Time Quality Monitoring**: Datenqualitätsbewertung pro Zone

- **Zone-Management:** Hierarchische Zone-Struktur (Kaiser → Master → Subzones)
- **Subzone-Konfiguration:** Verwaltung von Subzones innerhalb von Zonen
- **Sensor/Aktor-Tracking:** Geräteverwaltung innerhalb von Zonen
- **Real-time Updates:** Live Zone-Status-Monitoring
- **Persistente Speicherung:** Zone-Konfiguration wird gespeichert
- **🆕 Aggregation-Integration:** Unterstützung für zeitfenster-basierte Sensor-Analysen
- **🆕 Performance-Optimierung:** Effiziente Berechnung von Durchschnittswerten
- **🆕 Zeitstempel-basierte Filterung:** Präzise Zeitfenster-Auswahl für Aggregationen
- **🆕 Sensor Registry Integration:** Automatische Sensor-Registrierung
- **🆕 MQTT Listener Setup:** Automatische MQTT-Topic-Subscription
- **🆕 Backend v3.5.0 Support:** Integration der neuen Sensor-Datenfelder
- **🆕 Warning System Integration:** Sensor-Warning-Handling in Zonen
- **🆕 Time Quality Monitoring:** Datenqualitätsbewertung pro Zone

**Code-Beispiel - Zone Creation:**

```javascript
// src/stores/zones.js - Zeilen 367-453
async createZone(zoneData) {
  try {
    const zone = {
      id: zoneData.id || `zone_${Date.now()}`,
      espId: zoneData.espId,
      name: zoneData.name,
      description: zoneData.description || '',
      status: 'offline',
      subZones: new Map(),
      sensors: new Map(),
      actuators: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    // Validate required fields
    if (!zone.espId || !zone.name) {
      throw new Error('ESP ID and zone name are required')
    }

    // Check if zone already exists
    if (this.zones.has(zone.id)) {
      throw new Error(`Zone with ID ${zone.id} already exists`)
    }

    // Add zone to store
    this.zones.set(zone.id, zone)

    // Publish zone configuration to ESP
    if (this.mqttStore.isConnected) {
      await this.mqttStore.publish(
        `kaiser/${this.mqttStore.kaiserId}/esp/${zone.espId}/zone/config`,
        JSON.stringify({
          zone_id: zone.id,
          zone_name: zone.name,
          zone_description: zone.description,
          timestamp: Date.now(),
        })
      )
    }

    // Persist to local storage
    this.persistZones()

    console.log('Zone created successfully:', zone)
    return zone
  } catch (error) {
    console.error('Failed to create zone:', error)
    throw error
  }
}
```

#### **ESP Management Store** (`src/stores/espManagement.js` - 978 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Board-Type-spezifische Pin-Validierung**: Automatische Pin-Kompatibilitätsprüfung
- **I2C Sensor Limit Management**: 8-Sensor-Limit für I2C-Geräte
- **Erweiterte Subzone-Registrierung**: Automatische Subzone-Erkennung und -Registrierung
- **TreeView Integration**: Hierarchische Darstellung der Zonen-Struktur
- **Pending Assignment Management**: Warteschlange für unbestätigte Änderungen
- **Apply/Confirm Workflow**: Sichere Änderungsverwaltung mit Rollback
- **Template-Validierung**: Automatische Kompatibilitätsprüfung für Sensor-Templates
- **I2C Migration System**: Automatische Migration bestehender I2C-Konfigurationen

- **ESP-Geräte Verwaltung:** Zentrale Verwaltung aller ESP-Geräte
- **Pin-Assignment Management:** GPIO-Pin Zuweisungen
- **Subzone-Konfiguration:** Dynamische Subzone-Erstellung
- **Zone-Informationen:** Kaiser- und Master-Zone Details
- **Board-Type Validation:** Board-spezifische Pin-Validierung
- **I2C Configuration Migration:** Automatische I2C-Konfigurations-Migration
- **Pin Conflict Detection:** Erkennung von Pin-Konflikten
- **Device Status Monitoring:** Live-Status-Überwachung

**Code-Beispiel - Pin Assignment:**

```javascript
// src/stores/espManagement.js - Zeilen 215-257
async configurePinAssignment(espId, pinAssignment) {
  try {
    const device = this.espDevices.get(espId)
    if (!device) {
      throw new Error(`ESP device ${espId} not found`)
    }

    // Validate pin assignment
    if (!pinAssignment.gpio || !pinAssignment.type || !pinAssignment.name) {
      throw new Error('GPIO, type, and name are required for pin assignment')
    }

    // Check if pin is already assigned
    if (device.pinAssignments.has(pinAssignment.gpio)) {
      throw new Error(`GPIO ${pinAssignment.gpio} is already assigned`)
    }

    // Add pin assignment
    device.pinAssignments.set(pinAssignment.gpio, {
      ...pinAssignment,
      assignedAt: Date.now(),
    })

    // Publish pin configuration to ESP
    if (this.mqttStore.isConnected) {
      await this.mqttStore.publish(
        `kaiser/${this.mqttStore.kaiserId}/esp/${espId}/system/command`,
        JSON.stringify({
          command: 'configurePinAssignment',
          data: pinAssignment,
          timestamp: Date.now(),
        })
      )
    }

    // Persist changes
    this.persistEspDevices()

    console.log(`Pin assignment configured for ESP ${espId}:`, pinAssignment)
    return pinAssignment
  } catch (error) {
    console.error('Failed to configure pin assignment:', error)
    throw error
  }
}
```

#### **Devices Store** (`src/stores/devices.js` - 361 Zeilen)

**Hauptfunktionen:**

- **Gerätetypen-Management:** 13 Sensor-Typen, 7 Aktor-Typen
- **Pin-Zuordnungen:** GPIO-Pin Management mit Gerätetypen
- **Persistente Speicherung:** Gerätekonfiguration wird gespeichert
- **Device Type Validation:** Validierung von Gerätetypen
- **Pin Assignment Rules:** Board-spezifische Pin-Regeln

**Code-Beispiel - Device Types:**

```javascript
// src/stores/devices.js - Zeilen 21-100
const sensorTypes = [
  {
    type: 'SENSOR_TEMP_DS18B20',
    name: 'Temperature Sensor (DS18B20)',
    icon: 'mdi-thermometer',
    description: 'Digital temperature sensor with 1-wire interface',
    unit: '°C',
    minValue: -55,
    maxValue: 125,
  },
  {
    type: 'SENSOR_MOISTURE',
    name: 'Soil Moisture Sensor',
    icon: 'mdi-water-percent',
    description: 'Capacitive soil moisture sensor',
    unit: '%',
    minValue: 0,
    maxValue: 100,
  },
  {
    type: 'SENSOR_PH_DFROBOT',
    name: 'pH Sensor (DFRobot)',
    icon: 'mdi-test-tube',
    description: 'pH sensor for water quality monitoring',
    unit: 'pH',
    minValue: 0,
    maxValue: 14,
  },
  // ... weitere Sensor-Typen
]

const actuatorTypes = [
  {
    type: 'ACTUATOR_RELAY',
    name: 'Relay',
    icon: 'mdi-lightning-bolt',
    description: 'Digital relay for on/off control',
    controlType: 'binary',
  },
  {
    type: 'ACTUATOR_PUMP',
    name: 'Water Pump',
    icon: 'mdi-pump',
    description: 'Water pump for irrigation',
    controlType: 'analog',
  },
  {
    type: 'ACTUATOR_FAN',
    name: 'Fan',
    icon: 'mdi-fan',
    description: 'Cooling fan',
    controlType: 'analog',
  },
  // ... weitere Aktor-Typen
]
```

#### **Central Config Store** (`src/stores/centralConfig.js` - 415 Zeilen)

**Hauptfunktionen:**

- **Zentrale Konfiguration:** Einheitliche Server-IP und Port-Verwaltung
- **URL-Generierung:** Automatische URL-Konstruktion für MQTT und HTTP
- **Migration:** Environment Variable Migration für Backward Compatibility
- **Connection Testing:** Netzwerk-Konnektivität Validierung
- **Feature Flags:** Sichere Migration mit Feature Toggles
- **System Name Management:** Dynamische System-Namen-Verwaltung

**Code-Beispiel - URL Generation:**

```javascript
// src/stores/centralConfig.js - Zeilen 175-195
generateUrls() {
  if (this.serverIP) {
    this.mqttUrl = `ws://${this.serverIP}:${this.mqttPortFrontend}`
    this.httpUrl = `http://${this.serverIP}:${this.httpPort}`

    // Automatisch MQTT Store aktualisieren (wenn aktiviert)
    if (this.useNewConfig) {
      this.updateMqttStore()
    }
  }
}

// src/stores/centralConfig.js - Zeilen 202-260
async testAllConnections() {
  const results = {
    mqtt: await this.testConnection('mqtt'),
    http: await this.testConnection('http'),
    esp32: await this.testConnection('esp32')
  }

  this.lastConnectionTest = {
    timestamp: Date.now(),
    success: results.mqtt && results.http && results.esp32,
    details: results
  }

  return this.lastConnectionTest
}
```

#### **Pi Integration Store** (`src/stores/piIntegration.js` - 489 Zeilen)

**Hauptfunktionen:**

- **Pi Server Management:** Raspberry Pi Integration und Status-Monitoring
- **Library Management:** Python-Bibliotheken Verwaltung und Installation
- **Sensor Configuration:** Pi-Sensor-Konfiguration und -Monitoring
- **Health Monitoring:** Pi-Server-Status-Überwachung und Statistiken
- **Actuator Control:** Pi-Aktor-Steuerung und -Status-Tracking
- **ESP-spezifische URLs:** Dynamische URL-Konstruktion pro ESP
- **Library Cache Management:** Performance-Optimierung für Library-Installationen

**Code-Beispiel - Library Management:**

```javascript
// src/stores/piIntegration.js - Zeilen 179-214
async installLibrary(espId, libraryName, libraryCode, version = '1.0.0') {
  try {
    const response = await this.mqttStore.sendPiCommand(espId, 'default', 'installLibrary', {
      library_name: libraryName,
      library_code: libraryCode,
      version: version,
      timestamp: Date.now()
    })

    if (response.success) {
      // Add to local library list
      this.libraries.set(libraryName, {
        name: libraryName,
        version: version,
        installedAt: Date.now(),
        espId: espId
      })
      this.persistLibraries()
      return response
    } else {
      throw new Error(response.error || 'Library installation failed')
    }
  } catch (error) {
    console.error('Failed to install library:', error)
    throw error
  }
}
```

#### **System Commands Store** (`src/stores/systemCommands.js` - 264 Zeilen)

**Hauptfunktionen:**

- **System Control:** ESP-System-Steuerung und -Befehle
- **Command History:** Befehlsverlauf für Debugging und Audit
- **Error Handling:** Fehlerbehandlung und Logging
- **Safe Mode:** Sicherheitsmodus-Verwaltung
- **Emergency Controls:** Notfall-Steuerung und -Protokollierung
- **Command Validation:** Eingabevalidierung für System-Befehle

**Code-Beispiel - Command Execution:**

```javascript
// src/stores/systemCommands.js - Zeilen 171-222
async sendCommand(espId, command, payload = {}) {
  this.loading = true
  this.error = null

  try {
    const fullPayload = {
      command: command,
      timestamp: Date.now(),
      ...payload
    }

    const response = await this.mqttStore.publish(
      `kaiser/${this.mqttStore.kaiserId}/esp/${espId}/system/command`,
      JSON.stringify(fullPayload)
    )

    // Log command for debugging
    this.logCommand(espId, command, payload)
    this.lastCommand = { espId, command, payload, timestamp: Date.now() }

    return response
  } catch (error) {
    this.error = error.message
    console.error('Command execution failed:', error)
    throw error
  } finally {
    this.loading = false
  }
}
```

#### **Sensor Registry Store** (`src/stores/sensorRegistry.js` - 337 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Backend v3.5.0 Felder**: Raw Data, Warning System, Time Quality, Hardware Mode
- **Warning-Statistiken**: Zentrale Warning-Verwaltung und -Analyse
- **Zeitqualität-Statistiken**: Datenqualitätsbewertung und -Monitoring
- **Erweiterte Indizierung**: Optimierte Suche und Gruppierung
- **Persistente Speicherung**: Automatische Backup- und Wiederherstellungsfunktionen
- **Hardware/Simulation Mode**: Unterscheidung zwischen Hardware- und Simulationsmodus
- **Raw Value Support**: Unterstützung für unverarbeitete Sensordaten
- **Context und Sensor-Objekt**: Erweiterte Metadaten für Sensoren

- **Sensor Registry:** Zentrale Sensor-Verwaltung und -Tracking
- **ESP-spezifische Sensor-Gruppierung:** Sensoren nach ESP-Geräten gruppiert
- **Sensor Status Monitoring:** Live-Status-Überwachung aller Sensoren
- **Sensor Data Aggregation:** Unterstützung für Sensor-Aggregationen
- **Real-time Updates:** Echtzeit-Sensor-Daten-Updates
- **Sensor Type Management:** Verwaltung verschiedener Sensor-Typen
- **🆕 Backend v3.5.0 Felder:** Raw Data, Warning System, Time Quality, Hardware Mode
- **🆕 Warning-Statistiken:** Zentrale Warning-Verwaltung und -Analyse
- **🆕 Zeitqualität-Statistiken:** Datenqualitätsbewertung und -Monitoring
- **🆕 Erweiterte Indizierung:** Optimierte Suche und Gruppierung
- **🆕 Persistente Speicherung:** Automatische Backup- und Wiederherstellungsfunktionen

#### **Counter Store** (`src/stores/counter.js` - 13 Zeilen)

**Hauptfunktionen:**

#### **🆕 NEU: Actuator Logic Store** (`src/stores/actuatorLogic.js` - 1073 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Zentrale Logic-Engine**: Prioritätsmanagement für alle Aktor-Steuerungen
- **Konfliktlösung**: Automatische Auflösung von Steuerungskonflikten
- **Prioritätshierarchie**: EMERGENCY > MANUAL > ALERT > LOGIC > TIMER > SCHEDULE > DEFAULT
- **Aktor-Typ-spezifische Regeln**: Spezielle Logik für Pumpen, LEDs, Heizungen
- **Real-time Evaluation**: Kontinuierliche Auswertung von Bedingungen und Timers
- **Failsafe-Mechanismen**: Automatische Sicherheitszustände bei Fehlern
- **Logging & Monitoring**: Umfassende Protokollierung aller Logic-Aktivitäten
- **Copy & Adapt Logic**: Kopieren und Anpassen von Logic-Konfigurationen zwischen Geräten

#### **🆕 NEU: Database Logs Store** (`src/stores/databaseLogs.js` - 421 Zeilen)

**Hauptfunktionen:**

**Neue Features v3.8.0:**

- **Geführte Filterführung**: Schritt-für-Schritt Anleitung für Datenanalyse
- **Auto-Reload System**: Automatische Datenaktualisierung mit konfigurierbaren Intervallen
- **Multi-View Datenanzeige**: Tabelle und Karten-Ansicht für verschiedene Anwendungsfälle
- **Chart-Integration**: Direkte Integration mit SensorVisualization für Diagramme
- **CSV-Export**: Konfigurierbare Export-Einstellungen mit Dokumentation
- **ESP-Navigation**: Direkte Verlinkung zu ESP-Geräten und Sensoren
- **Sensor-Icon-System**: Intuitive Darstellung verschiedener Sensor-Typen
- **Wert-Farbkodierung**: Farbkodierung basierend auf Sensor-Typ und Messwerten
- **Export-Statistiken**: Tracking von Export-Aktivitäten und dokumentierte Exports

- **Counter Management:** Einfacher Zähler für Demo-Zwecke
- **Computed Properties:** Abgeleitete Werte
- **State Management:** Reaktiver Zustand

**Code-Beispiel - Device Health Score:**

```javascript
// src/composables/useDeviceHealthScore.js - Automatische Gesundheitsbewertung
export function useDeviceHealthScore(deviceInfo) {
  const healthScore = computed(() => {
    let score = 100
    const issues = []

    // Verbindungsstatus (40 Punkte)
    if (!deviceInfo.value.status || deviceInfo.value.status === 'offline') {
      score -= 40
      issues.push('Offline')
    }

    // Zone-Konfiguration (25 Punkte)
    if (!deviceInfo.value.zone || deviceInfo.value.zone === '🕳️ Unkonfiguriert') {
      score -= 25
      issues.push('Keine Zone')
    }

    // Board-Typ (15 Punkte)
    if (!deviceInfo.value.boardType) {
      score -= 15
      issues.push('Board-Typ fehlt')
    }

    // ID-Konflikte (20 Punkte)
    if (deviceInfo.value.idConflict) {
      score -= 20
      issues.push('ID-Konflikt')
    }

    return {
      score: Math.max(0, score),
      issues,
      status: getHealthStatus(score),
      color: getHealthColor(score),
      icon: getHealthIcon(score),
    }
  })

  return { healthScore }
}
```

**Code-Beispiel - Device Synchronization:**

```javascript
// src/composables/useDeviceSynchronization.js - Zentrale Synchronisation
export function useDeviceSynchronization() {
  const syncDeviceData = async (espId) => {
    isSynchronizing.value = true
    try {
      // Aktualisiere ESP-Device-Daten
      const device = mqttStore.espDevices.get(espId)
      if (device) {
        // Synchronisiere mit ESP Management Store
        espStore.updateEspDevice(espId, device)

        // Aktualisiere Zone-Mapping
        if (device.zone) {
          centralConfig.setZone(espId, device.zone)
        }
      }

      lastSyncTime.value = Date.now()
      console.log(`[Sync] Device ${espId} synchronized successfully`)
    } catch (error) {
      console.error(`[Sync] Failed to sync device ${espId}:`, error)
      syncErrors.value.push({
        espId,
        error: error.message,
        timestamp: Date.now(),
      })
    } finally {
      isSynchronizing.value = false
    }
  }

  const moveEspToZoneSynchronized = async (espId, newZone, oldZone = null) => {
    try {
      await centralConfig.moveEspToZone(espId, newZone, oldZone)
      await syncDeviceData(espId)
      return { success: true }
    } catch (error) {
      console.error('[Sync] Zone move failed:', error)
      return { success: false, error: error.message }
    }
  }

  return {
    syncDeviceData,
    moveEspToZoneSynchronized,
    isSynchronizing,
    lastSyncTime,
    syncErrors,
  }
}
```

**Code-Beispiel - Counter Store:**

```javascript
// src/stores/counter.js - Zeilen 1-13
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubleCount = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  return { count, doubleCount, increment }
})
```

### **🎨 UI-Komponenten**

#### **🆕 Neue UI/UX Komponenten (v3.8.0)**

**UnifiedCard.vue** (`src/components/common/UnifiedCard.vue` - 233 Zeilen)

- **Einheitliche Card-Basis** für alle Device-Cards und UI-Komponenten
- **Responsive Design** mit Mobile-Optimierung
- **Interactive Features** mit Hover-Effekten und Animationen
- **Expandable Content** mit konfigurierbaren Collapse-Levels
- **Loading States** mit Overlay-Unterstützung
- **Error Handling** mit integrierter Fehleranzeige
- **Header Actions** mit Slot-basierter Erweiterbarkeit

**DeviceCardBase.vue** (`src/components/settings/DeviceCardBase.vue` - 300+ Zeilen)

- **Basis-Komponente** für alle Device-Cards (God, Kaiser, ESP)
- **Health Score Integration** mit automatischer Gesundheitsbewertung
- **Tree-Expansion Support** für hierarchische Darstellung
- **Status-Indikatoren** mit Farbkodierung und Icons
- **Error State Handling** mit visueller Fehleranzeige
- **Responsive Design** mit Mobile-Optimierung

**GodDeviceCard.vue** (`src/components/settings/GodDeviceCard.vue` - 400+ Zeilen)

- **God-Server Anzeige** mit erweiterten Konfigurationsoptionen
- **Collapsible Interface** mit 3 Collapse-Levels (vollständig, kompakt, minimal)
- **Dual-IP-System** für lokale Frontend- und Server-Backend-Konfiguration
- **Name-Beispiele** mit konfigurierbaren Beispielen für verschiedene Anwendungsfälle
- **Port-Status-Indikatoren** mit visueller Darstellung der Verbindungsqualität
- **Quick Actions** für schnelle Konfiguration und Verwaltung

**KaiserDeviceCard.vue** (`src/components/settings/KaiserDeviceCard.vue` - 600+ Zeilen)

- **Kaiser Edge Controller Anzeige** mit vollständiger Konfiguration
- **Dual-IP-System** für Pi0-Server (Edge Controller) und God-Verbindung
- **Collapsible Interface** mit 3 Collapse-Levels für verschiedene Detailgrade
- **Kaiser-Identifikation** mit benutzerfreundlichem Namen und technischer ID
- **God-Connection Status** mit Live-Verbindungsüberwachung
- **System-Status-Übersicht** mit Agenten, Bibliotheken und Verbindungen
- **Quick Actions** für Synchronisation, Agenten-Verwaltung und Bibliotheks-Management

**EspDeviceCard.vue** (`src/components/settings/EspDeviceCard.vue` - 812 Zeilen)

- **ESP-Geräte Anzeige** mit erweiterten Konfigurationsoptionen
- **Setup-Mode Konfiguration** für neue ESP-Geräte im Setup-Modus
- **Drag & Drop Support** für unkonfigurierte ESPs mit Zone-Zuweisung
- **Health-Status Integration** mit automatischer Gesundheitsbewertung
- **Inline Zone-Management** mit direkter Zone-Zuweisung
- **Technische Details** mit erweiterten Informationen (optional)
- **Konfigurations-Button** für unkonfigurierte ESPs

**PortExplanation.vue** (`src/components/common/PortExplanation.vue` - 83 Zeilen)

- **Visuelle Port-Karten**: Farbkodierte Darstellung der drei Hauptports
- **Dynamische Beschreibungen**: Angepasst an aktuellen System-Typ (Kaiser vs God Pi)
- **Expandierbare Hilfe**: System-Verbindungsdiagramm auf Knopfdruck
- **Responsive Design**: Optimiert für verschiedene Bildschirmgrößen

**SystemConnectionDiagram.vue** (`src/components/common/SystemConnectionDiagram.vue` - 228 Zeilen)

- **Interaktive Visualisierung**: Zeigt die aktuelle Netzwerk-Architektur
- **Port-Verbindungen**: Farbkodierte Linien für verschiedene Protokolle
- **Verbundene Systeme**: Dynamische Anzeige je nach System-Typ
- **Responsive Design**: Optimiert für verschiedene Bildschirmgrößen

**TopNavigation.vue** (`src/components/layouts/TopNavigation.vue` - 343 Zeilen)

- **Erweiterte Navigation**: Vollständige Navigation mit Kaiser-Integration
- **Kaiser Status Indicators**: God Connection, Autonomous Mode, Kaiser ID Badge
- **Mobile Navigation**: Responsive Navigation mit Mobile-Menu
- **Emergency Actions**: Notfall-Stopp für alle ESP-Geräte (nur im Kaiser-Modus)
- **Connection Status**: Live-MQTT-Verbindungsstatus mit Tooltips
- **System-Erkennung**: Automatische Unterscheidung zwischen Kaiser und God Pi
- **Dynamische Titel**: Kontextuelle Anzeige je nach System-Typ

**ConnectionStatus.vue** (`src/components/common/ConnectionStatus.vue` - 97 Zeilen)

- **MQTT Verbindungsstatus**: Live-Verbindungsqualität mit Uptime
- **Connection Quality Indicators**: Visuelle Indikatoren für Verbindungsqualität
- **Auto-Reconnect Status**: Anzeige der Wiederverbindungsversuche
- **Error Display**: Benutzerfreundliche Fehleranzeige

**GlobalSnackbar.vue** (`src/components/common/GlobalSnackbar.vue` - 241 Zeilen)

- **Globale Benachrichtigungen**: Zentrale Snackbar für alle Komponenten
- **Multiple Message Types**: Success, Error, Info, Warning
- **Auto-Dismiss**: Automatisches Ausblenden nach konfigurierbarer Zeit
- **Global Access**: Verfügbar über `window.$snackbar`
- **Erweiterte Funktionen**: Timeout-Konfiguration, Custom Actions, Queue Management
- **Responsive Design**: Mobile-optimierte Darstellung

**Code-Beispiel - Port-Erklärung:**

```vue
<!-- src/components/common/PortExplanation.vue -->
<v-card variant="outlined" class="mb-6">
  <v-card-title class="d-flex align-center">
    <v-icon icon="mdi-network" class="mr-2" />
    Port-Konfiguration & Verbindungen
    <v-spacer />
    <v-btn
      icon="mdi-help-circle-outline"
      size="small"
      variant="text"
      @click="showHelp = !showHelp"
    />
  </v-card-title>

  <v-card-text>
    <v-row>
      <v-col cols="12" md="4">
        <v-card variant="tonal" color="success" class="pa-4 text-center">
          <v-icon icon="mdi-web" size="large" class="mb-2" />
          <div class="text-h4 font-weight-bold">{{ httpPort }}</div>
          <div class="text-subtitle-1 font-weight-medium">HTTP API</div>
          <div class="text-caption">{{ getHttpDescription() }}</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card variant="tonal" color="primary" class="pa-4 text-center">
          <v-icon icon="mdi-monitor-dashboard" size="large" class="mb-2" />
          <div class="text-h4 font-weight-bold">{{ mqttPortFrontend }}</div>
          <div class="text-subtitle-1 font-weight-medium">MQTT WebSocket</div>
          <div class="text-caption">Dashboard Echtzeit-Verbindung</div>
        </v-card>
      </v-col>

      <v-col cols="12" md="4">
        <v-card variant="tonal" color="warning" class="pa-4 text-center">
          <v-icon icon="mdi-memory" size="large" class="mb-2" />
          <div class="text-h4 font-weight-bold">1883</div>
          <div class="text-subtitle-1 font-weight-medium">MQTT Native</div>
          <div class="text-caption">ESP32-Geräte Verbindung</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Erweiterte Hilfe -->
    <v-expand-transition>
      <div v-if="showHelp" class="mt-4">
        <v-divider class="mb-4" />
        <SystemConnectionDiagram />
      </div>
    </v-expand-transition>
  </v-card-text>
</v-card>
```

**Code-Beispiel - System-Diagramm:**

```vue
<!-- src/components/common/SystemConnectionDiagram.vue -->
<template>
  <div class="system-diagram pa-4">
    <h4 class="text-center mb-4">{{ getSystemTitle() }} - Netzwerk-Architektur</h4>

    <div class="diagram-container">
      <!-- Aktuelles System (Hervorgehoben) -->
      <div class="system-node current" :class="getCurrentSystemClass()">
        <div class="system-header">
          <v-icon :icon="getCurrentSystemIcon()" size="x-large" />
          <h3>{{ getCurrentSystemName() }}</h3>
          <v-chip :color="getCurrentSystemColor()" size="small">
            {{ getCurrentSystemType() }}
          </v-chip>
        </div>

        <div class="port-connections">
          <div class="port-item">
            <v-icon icon="mdi-web" color="success" />
            <span>HTTP: {{ centralConfig.httpPort }}</span>
          </div>
          <div class="port-item">
            <v-icon icon="mdi-wifi" color="primary" />
            <span>WebSocket: {{ centralConfig.mqttPortFrontend }}</span>
          </div>
          <div class="port-item">
            <v-icon icon="mdi-message" color="warning" />
            <span>MQTT: 1883</span>
          </div>
        </div>
      </div>

      <!-- Verbindungslinien -->
      <div class="connections">
        <div class="connection-line">
          <div class="line http"></div>
          <span class="connection-label">Browser → Web-Interface</span>
        </div>
        <div class="connection-line">
          <div class="line websocket"></div>
          <span class="connection-label">Dashboard → Live-Daten</span>
        </div>
        <div class="connection-line">
          <div class="line mqtt"></div>
          <span class="connection-label">{{ getMqttConnectionLabel() }}</span>
        </div>
      </div>

      <!-- Verbundene Systeme -->
      <div class="connected-systems">
        <div v-for="system in getConnectedSystems()" :key="system.name" class="connected-system">
          <v-icon :icon="system.icon" :color="system.color" />
          <span>{{ system.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
```

#### **Dashboard Komponenten**

**SystemStateCard.vue** (`src/components/dashboard/SystemStateCard.vue` - 408 Zeilen)

- **System State Display:** Backend v3.4 System-Zustände Visualisierung
- **WebServer Status:** Setup-Modus vs. Betriebsmodus
- **Connection Monitoring:** WiFi, MQTT, Pi Server Status
- **Kaiser God Connection:** God Pi Verbindungsstatus und Sync-Info
- **Emergency Controls:** System-weiter Notfall-Stopp

**Code-Beispiel - System Health Utilities:**

```javascript
// src/utils/systemHealth.js - ESP Health Score Berechnung
export function calculateEspHealthScore(device) {
  if (!device) return 0

  let score = 100
  let factors = 0

  // CPU-Auslastung
  if (device.health?.cpuUsagePercent !== undefined) {
    factors++
    if (device.health.cpuUsagePercent > 80) score -= 30
    else if (device.health.cpuUsagePercent > 60) score -= 15
    else if (device.health.cpuUsagePercent > 40) score -= 5
  }

  // Speicher
  if (device.health?.freeHeapCurrent !== undefined) {
    factors++
    if (device.health.freeHeapCurrent < 50000) score -= 25
    else if (device.health.freeHeapCurrent < 100000) score -= 10
  }

  // Laufzeit
  if (device.health?.uptimeSeconds !== undefined) {
    factors++
    if (device.health.uptimeSeconds < 300) score -= 20 // < 5 Minuten
  }

  // Netzwerk
  if (device.network?.wifiConnected === false) {
    factors++
    score -= 40
  }

  if (device.network?.mqttConnected === false) {
    factors++
    score -= 30
  }

  // Normalisiere Score basierend auf verfügbaren Faktoren
  return factors > 0 ? Math.max(0, Math.round(score / factors)) : 100
}

// Health Status Farben
export function getCpuUsageColor(cpuUsage) {
  if (cpuUsage > 80) return 'error'
  if (cpuUsage > 60) return 'warning'
  return 'success'
}

export function getMemoryColor(freeHeap) {
  if (freeHeap < 50000) return 'error'
  if (freeHeap < 100000) return 'warning'
  return 'success'
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function formatUptime(uptimeSeconds) {
  const days = Math.floor(uptimeSeconds / 86400)
  const hours = Math.floor((uptimeSeconds % 86400) / 3600)
  const minutes = Math.floor((uptimeSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}
```

**Code-Beispiel - System State Display:**

```vue
<!-- src/components/dashboard/SystemStateCard.vue - Zeilen 10-20 -->
<v-card-title class="d-flex align-center">
  <v-icon icon="mdi-information-outline" class="mr-2" />
  System State
  <v-spacer />
  <v-chip :color="getSystemStateColor(device.systemState)" size="small" variant="tonal">
    {{ device.systemState || 'UNKNOWN' }}
  </v-chip>
</v-card-title>

<!-- src/components/dashboard/SystemStateCard.vue - Zeilen 200-250 -->
<script setup>
function getSystemStateColor(state) {
  switch (state) {
    case 'OPERATIONAL':
      return 'success'
    case 'WIFI_SETUP':
    case 'MQTT_CONNECTING':
      return 'warning'
    case 'ERROR':
      return 'error'
    case 'LIBRARY_DOWNLOADING':
      return 'info'
    default:
      return 'grey'
  }
}

function getWebServerGuidance(device) {
  if (device.webserverActive) {
    return 'ESP in setup mode - configure via WiFi hotspot'
  } else if (device.systemState === 'OPERATIONAL') {
    return 'ESP operational - configure via this dashboard'
  } else if (device.systemState === 'MQTT_CONNECTING') {
    return 'ESP connecting to MQTT broker'
  } else if (device.systemState === 'WIFI_SETUP') {
    return 'ESP in WiFi setup mode'
  } else if (device.systemState === 'BOOT') {
    return 'ESP is booting up'
  } else {
    return 'Check ESP status'
  }
}
</script>
```

**ZoneCard.vue** (`src/components/dashboard/ZoneCard.vue` - 210 Zeilen)

- **Zone-Übersicht:** Status-Anzeige für einzelne Zonen
- **Subzone-Management:** Verwaltung von Subzones innerhalb der Zone
- **Aktor-Steuerung:** Ein-/Ausschalten von Aktoren
- **Emergency Stop:** Notfall-Stopp für die Zone
- **🆕 Intelligente Aggregationen:** Zeitfenster-basierte Sensor-Analysen (5 Min, 1h, 24h, alle Daten)
- **🆕 Kontextabhängige Darstellung:** Aggregationen nur bei expliziter Aktivierung
- **🆕 Live-Daten Priorität:** Standardmäßig werden nur aktuelle Sensorwerte angezeigt
- **🆕 Performance-Optimierung:** Effiziente Berechnung basierend auf Zeitstempel

**Code-Beispiel - Emergency Stop:**

```javascript
// src/components/dashboard/ZoneCard.vue - Zeilen 150-170
async handleEmergencyStop() {
  try {
    await this.mqttStore.emergencyStop(this.zone.espId)
    window.$snackbar?.showSuccess('Emergency stop triggered')
  } catch (error) {
    this.showError = true
    this.errorMessage = 'Failed to trigger emergency stop'
    console.error('Emergency stop failed:', error)
  }
}

async handleActuatorToggle({ subZoneId, gpio }) {
  try {
    await this.zonesStore.toggleActuator(this.zone.espId, subZoneId, gpio)
  } catch (error) {
    this.showError = true
    this.errorMessage = 'Failed to toggle actuator'
    console.error('Actuator toggle failed:', error)
  }
}
```

**SubZoneCard.vue** (`src/components/dashboard/SubZoneCard.vue` - 350 Zeilen)

- **Sensor-Anzeige:** Live-Sensor-Daten mit Icons und Einheiten
- **Aktor-Steuerung:** Binäre und analoge Aktor-Steuerung
- **Status-Farben:** Farbkodierung basierend auf Sensor-Werten
- **🆕 Warning-Badge:** Visuelle Anzeige von Sensor-Warnings
- **🆕 Zeitqualität-Indikator:** Datenqualitätsbewertung pro Sensor
- **🆕 Raw-Mode-Indikator:** Anzeige von Raw-Daten bei aktiviertem Raw-Modus
- **🆕 Hardware/Simulation-Mode-Badge:** Unterscheidung zwischen Hardware- und Simulationsmodus
- **🆕 Sensor Registry Integration:** Robuste Integration mit zentraler Sensor-Verwaltung

**Code-Beispiel - Sensor Value Formatting:**

```javascript
// src/components/dashboard/SubZoneCard.vue - Zeilen 100-130
formatSensorValue(sensor) {
  if (!sensor?.value) return 'N/A'

  const units = {
    SENSOR_TEMP_DS18B20: '°C',
    SENSOR_MOISTURE: '%',
    SENSOR_FLOW: 'L/min',
    SENSOR_PH_DFROBOT: 'pH',
    SENSOR_EC_GENERIC: 'µS/cm',
    SENSOR_PRESSURE: 'hPa',
    SENSOR_CO2: 'ppm',
    SENSOR_AIR_QUALITY: 'AQI',
    SENSOR_LIGHT: 'lux',
    SENSOR_LEVEL: 'cm',
  }

  const unit = units[sensor.type] || ''
  return `${sensor.value.toFixed(1)}${unit}`
}

getSensorValueColor(sensor) {
  if (!sensor?.value) return 'text-gray-400'
  if (Date.now() - (sensor.lastUpdate || 0) > 5 * 60 * 1000) return 'text-gray-400' // 5 minutes old

  // Temperature thresholds
  if (sensor.type === 'SENSOR_TEMP_DS18B20') {
    if (sensor.value < 18) return 'text-blue-600'
    if (sensor.value > 28) return 'text-red-600'
    return 'text-green-600'
  }

  // Moisture thresholds
  if (sensor.type === 'SENSOR_MOISTURE') {
    if (sensor.value < 30) return 'text-red-600'
    if (sensor.value > 70) return 'text-blue-600'
    return 'text-green-600'
  }

  return 'text-gray-900'
}

// 🆕 NEU: Backend v3.5.0 Warning System
getWarningColor(warnings) {
  if (!warnings || warnings.length === 0) return 'success'

  const warningLevels = {
    'SENSOR_OFFLINE': 'error',
    'VALUE_OUT_OF_RANGE': 'warning',
    'POOR_TIME_QUALITY': 'warning',
    'HARDWARE_ERROR': 'error',
    'CALIBRATION_NEEDED': 'info'
  }

  const highestLevel = warnings.reduce((level, warning) => {
    return warningLevels[warning] === 'error' ? 'error' : level
  }, 'success')

  return highestLevel
}

// 🆕 NEU: Time Quality Monitoring
getTimeQualityColor(quality) {
  const colors = {
    'good': 'success',
    'poor': 'warning',
    'unknown': 'grey'
  }
  return colors[quality] || 'grey'
}

getTimeQualityIcon(quality) {
  const icons = {
    'good': 'mdi-clock-check',
    'poor': 'mdi-clock-alert',
    'unknown': 'mdi-clock-outline'
  }
  return icons[quality] || 'mdi-clock-outline'
}
```

#### **Zonen Komponenten**

**UnifiedZoneManagement.vue** (`src/components/zones/UnifiedZoneManagement.vue` - 539 Zeilen)

- **ESP-Auswahl:** Dropdown mit Status-Anzeige (Online/Offline)
- **Zone-Informationen:** Kaiser- und Master-Zone Details
- **Pin-Management:** Verfügbare GPIO-Pins und Zuordnungen
- **Dialog-basierte Pin-Zuweisung:** Benutzerfreundliche Pin-Konfiguration
- **Subzone-Erstellung:** On-the-fly Subzone-Erstellung

**EnhancedPinConfiguration.vue** (`src/components/zones/EnhancedPinConfiguration.vue` - 1220 Zeilen)

- **Erweiterte Pin-Konfiguration:** Verbesserte Benutzeroberfläche
- **Validierung:** Echtzeit-Validierung von Pin-Zuordnungen
- **Device Type Management:** Gerätetyp-spezifische Konfiguration
- **Subzone Integration:** Automatische Subzone-Erstellung
- **ESP Device Selection:** Dropdown mit Status-Anzeige
- **Zone Information Display:** Kaiser- und Master-Zone Details
- **Pin Assignment Dialog:** Benutzerfreundliche Pin-Zuweisung
- **Current Assignments Overview:** Übersicht aller Pin-Zuordnungen

**ZoneTreeView.vue** (`src/components/zones/ZoneTreeView.vue` - 333 Zeilen)

- **Hierarchische Darstellung:** Baumstruktur der Zonen und Subzones
- **Interactive Tree:** Erweiterbare und reduzierbare Baumansicht
- **Zone Status Indicators:** Visuelle Status-Anzeige für jede Zone
- **Quick Actions:** Schnellzugriff auf Zone-Funktionen

**ZoneManagement.vue** (`src/components/zones/ZoneManagement.vue` - 315 Zeilen)

- **Zone CRUD Operations:** Erstellen, Bearbeiten, Löschen von Zonen
- **Zone Configuration:** Konfiguration von Zone-Eigenschaften
- **ESP Assignment:** ESP-Geräte-Zuordnung zu Zonen
- **Zone Status Monitoring:** Live-Status-Überwachung

**PinConfiguration.vue** (`src/components/zones/PinConfiguration.vue` - 303 Zeilen)

- **Basic Pin Configuration:** Grundlegende Pin-Konfiguration
- **Pin Assignment:** GPIO-Pin Zuweisungen für Sensoren/Aktoren
- **Pin Validation:** Validierung von Pin-Zuordnungen
- **Board-Specific Rules:** Board-spezifische Pin-Regeln

#### **Settings Komponenten**

**EspConfiguration.vue** (`src/components/settings/EspConfiguration.vue` - 833 Zeilen)

- **ESP-Identität:** Username, Friendly Name, Zone-Zuordnung
- **Netzwerk-Konfiguration:** WiFi, MQTT Broker, HTTP Port
- **Kaiser-Konfiguration:** God Pi Verbindung und Sync-Einstellungen
- **System State Display:** Backend v3.4 System-Zustand Monitoring
- **Connection Testing:** Netzwerk-Konnektivität Validierung

**Code-Beispiel - ESP Configuration Form:**

```vue
<!-- src/components/settings/EspConfiguration.vue - Zeilen 20-80 -->
<v-card-text>
  <v-row>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="espConfig.espUsername"
        label="ESP-Username (für MQTT)"
        placeholder="esp_greenhouse_01"
        hint="Eindeutiger Username für MQTT-Verbindung"
        persistent-hint
        variant="outlined"
        density="comfortable"
        :readonly="!isEditing"
        required
      />
    </v-col>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="espConfig.espFriendlyName"
        label="ESP-Name (benutzerfreundlich)"
        placeholder="Gewächshaus 1 - Tomaten"
        hint="Anzeigename für die Benutzeroberfläche"
        persistent-hint
        variant="outlined"
        density="comfortable"
        :readonly="!isEditing"
        required
      />
    </v-col>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="espConfig.espZone"
        label="Zone"
        placeholder="Gewächshaus, Außenbereich, Keller..."
        hint="Zone in der das ESP-Gerät eingesetzt wird"
        persistent-hint
        variant="outlined"
        density="comfortable"
        :readonly="!isEditing"
        required
      />
    </v-col>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="espConfig.serverAddress"
        label="Server Address"
        placeholder="192.168.1.100"
        hint="Unified server address for all services"
        persistent-hint
        variant="outlined"
        density="comfortable"
        :readonly="!isEditing"
        required
      />
    </v-col>
  </v-row>
</v-card-text>
```

**UnifiedZoneManagement.vue** (`src/components/zones/UnifiedZoneManagement.vue` - 539 Zeilen)

- **ESP-Auswahl:** Dropdown mit Status-Anzeige (Online/Offline)
- **Zone-Informationen:** Kaiser- und Master-Zone Details
- **Pin-Management:** Verfügbare GPIO-Pins und Zuordnungen
- **Dialog-basierte Pin-Zuweisung:** Benutzerfreundliche Pin-Konfiguration
- **Subzone-Erstellung:** On-the-fly Subzone-Erstellung

**Code-Beispiel - ESP Selection:**

```vue
<!-- src/components/zones/UnifiedZoneManagement.vue - Zeilen 10-40 -->
<v-select
  v-model="selectedEspId"
  label="ESP Device auswählen"
  :items="espDeviceOptions"
  item-title="title"
  item-value="value"
  variant="outlined"
  density="comfortable"
  @update:model-value="onEspSelected"
>
  <template #item="{ item, props }">
    <v-list-item v-bind="props">
      <template #prepend>
        <v-icon
          :color="item.raw.status === 'online' ? 'success' : 'error'"
          :icon="item.raw.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
        />
      </template>
      <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
      <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
    </v-list-item>
  </template>
</v-select>
```

**EnhancedPinConfiguration.vue** (`src/components/zones/EnhancedPinConfiguration.vue` - 1220 Zeilen)

- **Erweiterte Pin-Konfiguration:** Verbesserte Benutzeroberfläche
- **Validierung:** Echtzeit-Validierung von Pin-Zuordnungen
- **Device Type Management:** Gerätetyp-spezifische Konfiguration
- **Subzone Integration:** Automatische Subzone-Erstellung
- **ESP Device Selection:** Dropdown mit Status-Anzeige
- **Zone Information Display:** Kaiser- und Master-Zone Details
- **Pin Assignment Dialog:** Benutzerfreundliche Pin-Zuweisung
- **Current Assignments Overview:** Übersicht aller Pin-Zuordnungen
- **🆕 TreeView Integration:** Hierarchische Darstellung der Zonen-Struktur
- **🆕 Pending Assignment Management:** Warteschlange für unbestätigte Änderungen
- **🆕 Apply/Confirm Workflow:** Sichere Änderungsverwaltung mit Rollback
- **🆕 Board-Type-spezifische Pin-Validierung:** Automatische Pin-Kompatibilitätsprüfung
- **🆕 I2C Sensor Limit Management:** 8-Sensor-Limit für I2C-Geräte
- **🆕 Erweiterte Subzone-Registrierung:** Automatische Subzone-Erkennung und -Registrierung

**Code-Beispiel - ESP Selection mit Status:**

```vue
<!-- src/components/zones/EnhancedPinConfiguration.vue - Zeilen 10-30 -->
<v-select
  v-model="selectedEspId"
  label="ESP Device auswählen"
  :items="espDeviceOptions"
  item-title="title"
  item-value="value"
  variant="outlined"
  density="comfortable"
  @update:model-value="onEspSelected"
>
  <template #item="{ item, props }">
    <v-list-item v-bind="props">
      <template #prepend>
        <v-icon
          :color="item.raw.status === 'online' ? 'success' : 'error'"
          :icon="item.raw.status === 'online' ? 'mdi-wifi' : 'mdi-wifi-off'"
        />
      </template>
      <v-list-item-title>{{ item.raw.title }}</v-list-item-title>
      <v-list-item-subtitle>{{ item.raw.subtitle }}</v-list-item-subtitle>
    </v-list-item>
  </template>
</v-select>
```

**Code-Beispiel - Zone Information Display:**

```vue
<!-- src/components/zones/EnhancedPinConfiguration.vue - Zeilen 35-55 -->
<v-card v-if="selectedEsp" variant="outlined" class="mb-6">
  <v-card-title class="d-flex align-center">
    <v-icon icon="mdi-map-marker" class="mr-2" />
    Zone Information
  </v-card-title>
  <v-card-text>
    <v-row>
      <v-col cols="12" md="6">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-primary mb-2">Kaiser Zone</div>
          <div class="text-h6">{{ zoneInfo.kaiserZone.name }}</div>
          <div class="text-caption text-grey">ID: {{ zoneInfo.kaiserZone.id }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" md="6">
        <v-card variant="tonal" class="pa-4">
          <div class="text-subtitle-2 text-secondary mb-2">Master Zone</div>
          <div class="text-h6">{{ zoneInfo.masterZone.name }}</div>
          <div class="text-caption text-grey">ID: {{ zoneInfo.masterZone.id }}</div>
        </v-card>
      </v-col>
    </v-row>
  </v-card-text>
</v-card>
```

**Code-Beispiel - Pin Assignment Dialog:**

```vue
<!-- src/components/zones/EnhancedPinConfiguration.vue - Zeilen 120-180 -->
<v-dialog v-model="showPinDialog" max-width="600">
  <v-card>
    <v-card-title>Pin Assignment</v-card-title>
    <v-card-text>
      <v-row>
        <v-col cols="12" md="6">
          <v-select
            v-model="newAssignment.gpio"
            label="GPIO Pin"
            :items="availablePins.map((pin) => ({ title: `GPIO ${pin}`, value: pin }))"
            item-title="title"
            item-value="value"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            v-model="newAssignment.type"
            label="Device Type"
            :items="deviceTypeOptions"
            item-title="label"
            item-value="value"
            variant="outlined"
            density="comfortable"
          >
            <template #item="{ item, props }">
              <v-list-item v-bind="props">
                <template #prepend>
                  <v-icon :icon="item.raw.icon" />
                </template>
                <v-list-item-title>{{ item.raw.label }}</v-list-item-title>
              </v-list-item>
            </template>
          </v-select>
        </v-col>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="newAssignment.name"
            label="Device Name"
            placeholder="e.g., Temperature Sensor 1"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            v-model="newAssignment.subzone"
            label="Subzone"
            :items="subzoneOptions"
            item-title="name"
            item-value="id"
            variant="outlined"
            density="comfortable"
          />
        </v-col>
      </v-row>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn @click="showPinDialog = false">Cancel</v-btn>
      <v-btn color="primary" @click="assignPin">Assign</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

**LibraryManagement.vue** (`src/components/settings/LibraryManagement.vue` - 246 Zeilen)

- **Python Library Management:** Installation und Verwaltung von Bibliotheken
- **Library Repository:** Lokale Bibliotheks-Verwaltung
- **Version Control:** Versionsverwaltung für Bibliotheken
- **Installation Status:** Status-Überwachung der Installation
- **Library Cache:** Caching von Library-Code für Performance
- **Code Viewer:** Anzeige des installierten Library-Codes
- **ESP-spezifische Installation:** Library-Installation pro ESP-Gerät

**Code-Beispiel - Library Installation Form:**

```vue
<!-- src/components/settings/LibraryManagement.vue - Zeilen 15-50 -->
<v-form @submit.prevent="installLibrary">
  <v-row>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="newLibrary.name"
        label="Library Name"
        placeholder="my_sensor_library"
        hint="Name der Python Library"
        persistent-hint
        variant="outlined"
        density="comfortable"
        required
      />
    </v-col>
    <v-col cols="12" md="6">
      <v-text-field
        v-model="newLibrary.version"
        label="Version"
        placeholder="1.0.0"
        hint="Version der Library"
        persistent-hint
        variant="outlined"
        density="comfortable"
      />
    </v-col>
    <v-col cols="12">
      <v-textarea
        v-model="newLibrary.code"
        label="Python Code"
        placeholder="# Python Library Code&#10;class MySensor:&#10;    def __init__(self):&#10;        pass&#10;    def read(self):&#10;        return 0.0"
        hint="Python Code der Library"
        persistent-hint
        variant="outlined"
        density="comfortable"
        rows="8"
        required
      />
    </v-col>
    <v-col cols="12">
      <v-btn
        type="submit"
        color="primary"
        :loading="piIntegration.loading"
        variant="tonal"
        block
      >
        Library installieren
      </v-btn>
    </v-col>
  </v-row>
</v-form>
```

**Code-Beispiel - Installed Libraries List:**

```vue
<!-- src/components/settings/LibraryManagement.vue - Zeilen 70-100 -->
<v-list v-else>
  <v-list-item
    v-for="library in piIntegration.getInstalledLibraries"
    :key="library.name"
    class="mb-2"
  >
    <template v-slot:prepend>
      <v-icon
        :icon="library.status === 'installed' ? 'mdi-check-circle' : 'mdi-clock'"
        :color="library.status === 'installed' ? 'success' : 'warning'"
      />
    </template>

    <v-list-item-title>{{ library.name }}</v-list-item-title>
    <v-list-item-subtitle>
      Version {{ library.version }} •
      {{ library.status === 'installed' ? 'Installiert' : 'Installiere...' }} •
      {{ formatRelativeTime(library.installedAt) }}
    </v-list-item-subtitle>

    <template v-slot:append>
      <v-btn
        icon="mdi-delete"
        variant="text"
        size="small"
        color="error"
        @click="removeLibrary(library.name)"
        :loading="piIntegration.loading"
      />
    </template>
  </v-list-item>
</v-list>
```

**Code-Beispiel - Library Installation Logic:**

```javascript
// src/components/settings/LibraryManagement.vue - Zeilen 180-220
async function installLibrary() {
  if (!newLibrary.value.name || !newLibrary.value.code) {
    window.$snackbar?.showError('Library Name und Code sind erforderlich')
    return
  }

  try {
    await piIntegration.installLibrary(
      props.espId,
      newLibrary.value.name,
      newLibrary.value.code,
      newLibrary.value.version,
    )

    // Reset form
    newLibrary.value = {
      name: '',
      version: '1.0.0',
      code: '',
    }

    window.$snackbar?.showSuccess('Library erfolgreich installiert')
  } catch (error) {
    console.error('Library installation failed:', error)
    window.$snackbar?.showError('Library Installation fehlgeschlagen')
  }
}

async function removeLibrary(libraryName) {
  try {
    await piIntegration.removeLibrary(libraryName)
    window.$snackbar?.showSuccess('Library erfolgreich entfernt')
  } catch (error) {
    console.error('Library removal failed:', error)
    window.$snackbar?.showError('Library Entfernung fehlgeschlagen')
  }
}
```

**PiConfiguration.vue** (`src/components/settings/PiConfiguration.vue` - 279 Zeilen)

- **Pi Server Configuration:** Raspberry Pi Server-Einstellungen
- **Health Monitoring:** Pi-Server-Status-Überwachung
- **Sensor Configuration:** Pi-Sensor-Konfiguration
- **Library Installation:** Python-Bibliotheken Installation
- **ESP-spezifische URL Konstruktion:** Dynamische URL-Generierung
- **Pi Health Information:** CPU, Memory, Temperature, Uptime
- **Pi Integration Statistics:** Library-, Sensor- und Aktor-Statistiken
- **Real-time Status Updates:** Live Pi-Server-Status

**Code-Beispiel - ESP-spezifische URL Konstruktion:**

```javascript
// src/components/settings/PiConfiguration.vue - Zeilen 150-160
const piUrl = computed(() => {
  const device = mqttStore.espDevices.get(props.espId)
  if (device?.serverAddress && device?.httpPort) {
    return `http://${device.serverAddress}:${device.httpPort}`
  }
  return 'http://192.168.1.101:8080' // Fallback für Backward Compatibility
})
```

**Code-Beispiel - Pi Health Display:**

```vue
<!-- src/components/settings/PiConfiguration.vue - Zeilen 60-90 -->
<v-card variant="outlined" class="pa-4">
  <h3 class="text-subtitle-1 font-weight-medium mb-3">Pi Server Health</h3>
  <v-row>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6 text-primary">{{ formatUptime(piHealth.uptime) }}</div>
        <div class="text-caption text-grey">Uptime</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6" :class="getCpuColor(piHealth.cpuUsage)">
          {{ piHealth.cpuUsage }}%
        </div>
        <div class="text-caption text-grey">CPU Usage</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6" :class="getMemoryColor(piHealth.memoryUsage)">
          {{ piHealth.memoryUsage }}%
        </div>
        <div class="text-caption text-grey">Memory Usage</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6" :class="getTempColor(piHealth.temperature)">
          {{ piHealth.temperature }}°C
        </div>
        <div class="text-caption text-grey">Temperature</div>
      </div>
    </v-col>
  </v-row>
</v-card>
```

**Code-Beispiel - Pi Statistics:**

```vue
<!-- src/components/settings/PiConfiguration.vue - Zeilen 100-130 -->
<v-card variant="outlined" class="pa-4">
  <h3 class="text-subtitle-1 font-weight-medium mb-3">Pi Integration Statistics</h3>
  <v-row>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6 text-info">{{ piStats.totalLibraries }}</div>
        <div class="text-caption text-grey">Installed Libraries</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6 text-success">{{ piStats.totalSensors }}</div>
        <div class="text-caption text-grey">Pi-Enhanced Sensors</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6 text-warning">{{ piStats.totalActuators }}</div>
        <div class="text-caption text-grey">Pi-Enhanced Actuators</div>
      </div>
    </v-col>
    <v-col cols="12" sm="6" md="3">
      <div class="text-center">
        <div class="text-h6 text-grey">
          {{ piStats.lastUpdate ? formatRelativeTime(piStats.lastUpdate) : 'Never' }}
        </div>
        <div class="text-caption text-grey">Last Update</div>
      </div>
    </v-col>
  </v-row>
</v-card>
```

**Code-Beispiel - Pi Status Check:**

```javascript
// src/components/settings/PiConfiguration.vue - Zeilen 200-240
async function checkPiStatus() {
  try {
    await piIntegration.checkPiStatus(props.espId)
    if (piIntegration.isPiAvailable) {
      window.$snackbar?.showSuccess('Pi Server ist verfügbar')
    }
  } catch (error) {
    console.error('Pi status check failed:', error)
    window.$snackbar?.showError('Pi Server Status Check fehlgeschlagen')
  }
}

async function getPiHealth() {
  try {
    const health = await piIntegration.getPiHealthCheck(props.espId)
    piHealth.value = health
    showHealthInfo.value = true
    window.$snackbar?.showSuccess('Pi Health Check erfolgreich')
  } catch (error) {
    console.error('Pi health check failed:', error)
    window.$snackbar?.showError('Pi Health Check fehlgeschlagen')
  }
}

async function getPiSensorStatistics() {
  try {
    const stats = await piIntegration.getPiSensorStatistics(props.espId)
    piStats.value = stats
    showStatistics.value = true
    window.$snackbar?.showSuccess('Pi Sensor Statistics abgerufen')
  } catch (error) {
    console.error('Pi sensor statistics failed:', error)
    window.$snackbar?.showError('Pi Sensor Statistics fehlgeschlagen')
  }
}
```

## 🔧 **Utilities & Router**

### **Utils**

**espHttpClient.js** (`src/utils/espHttpClient.js`)

- **Circuit Breaker Pattern:** Automatische Fehlerbehandlung
- **HTTP Client:** ESP-spezifische HTTP-Kommunikation
- **Error Handling:** Benutzerfreundliche Fehlermeldungen
- **Request Management:** GET, POST, PUT, DELETE Operationen

**Code-Beispiel - Circuit Breaker:**

```javascript
// src/utils/espHttpClient.js - Zeilen 3-35
class CircuitBreaker {
  constructor() {
    this.failureCount = 0
    this.lastFailureTime = 0
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.threshold = 5
    this.timeout = 60000 // 1 minute
  }

  canMakeRequest() {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN'
        return true
      }
      return false
    }
    return true
  }

  recordSuccess() {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  recordFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN'
    }
  }
}
```

**storage.js** (`src/utils/storage.js`)

- **Local Storage Management:** Persistente Datenspeicherung
- **Error Handling:** Sichere Speicherung und Wiederherstellung
- **Data Validation:** Eingabevalidierung für gespeicherte Daten
- **🆕 Aggregation-Einstellungen:** Persistente Speicherung von Benutzereinstellungen für Sensor-Aggregationen
- **🆕 Zeitfenster-Konfiguration:** Speicherung der bevorzugten Zeitfenster für Analysen

**Code-Beispiel - Storage Operations:**

```javascript
// src/utils/storage.js - Zeilen 1-25
export const storage = {
  save(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data))
      return true
    } catch (error) {
      console.error('Failed to save to localStorage:', error)
      return false
    }
  },

  load(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error('Failed to load from localStorage:', error)
      return defaultValue
    }
  },

  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error('Failed to remove from localStorage:', error)
      return false
    }
  },
}
```

**time.js** (`src/utils/time.js`)

- **Time Formatting:** Verschiedene Zeitformate
- **Relative Time:** Relative Zeitangaben
- **ISO Timestamps:** ISO-Format Zeitstempel

**Code-Beispiel - Time Utilities:**

```javascript
// src/utils/time.js - Zeilen 1-25
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString()
}

export const formatDateTime = (timestamp) => {
  if (!timestamp) return 'N/A'
  return new Date(timestamp).toLocaleString('de-DE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export const formatRelativeTime = (timestamp) => {
  if (!timestamp) return 'Never'
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now - date

  if (diffMs < 60000) return 'Just now'
  if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`
  if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`
  return date.toLocaleDateString()
}

export const formatISOTimestamp = (timestamp) => {
  if (!timestamp) return ''
  return new Date(timestamp).toISOString()
}
```

### **Router Configuration** (`src/router/index.js` - 78 Zeilen)

- **Route Management:** Vue Router Konfiguration
- **Dynamic Imports:** Lazy Loading für bessere Performance
- **Meta Information:** Seitentitel und Authentifizierung
- **Route Guards:** Zugriffskontrolle für Development-Routes

**Code-Beispiel - Router Setup:**

```javascript
// src/router/index.js - Zeilen 1-78
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import DashboardView from '../views/DashboardView.vue'
import SettingsView from '../views/SettingsView.vue'
import ZonesView from '../views/ZonesView.vue'
import DevicesView from '../views/DevicesView.vue'
import DevelopmentView from '../views/DevelopmentView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: DashboardView,
    },
    {
      path: '/settings',
      name: 'settings',
      component: SettingsView,
    },
    {
      path: '/zones',
      name: 'zones',
      component: ZonesView,
    },
    {
      path: '/zones/new',
      name: 'zone-new',
      component: () => import('../views/ZoneFormView.vue'),
      meta: {
        title: 'Neue Zone',
      },
    },
    {
      path: '/zones/:id/edit',
      name: 'zone-edit',
      component: () => import('../views/ZoneFormView.vue'),
      props: true,
      meta: {
        title: 'Zone bearbeiten',
      },
    },
    {
      path: '/zone/:espId/config',
      name: 'zone-config',
      component: SettingsView,
      props: true,
    },
    {
      path: '/devices',
      name: 'devices',
      component: DevicesView,
    },
    {
      path: '/dev',
      name: 'development',
      component: DevelopmentView,
      meta: {
        requiresAuth: true, // Optional: restrict access in production
      },
    },
  ],
})

// Update document title based on route meta
router.beforeEach((to, from, next) => {
  document.title = to.meta.title ? `${to.meta.title} - Growy Dashboard` : 'Growy Dashboard'
  next()
})

export default router
```

## 📁 **Vollständige Projektstruktur**

```
growy-frontend/
├── public/                                  # Statische Assets
│   └── favicon.ico                         # Browser-Favicon (4.2KB)
├── docs/                                   # Projekt-Dokumentation
│   └── PORT_ARCHITECTURE.md                # Port-Architektur Dokumentation (8.0KB, 312 Zeilen)
├── src/
│   ├── assets/                             # Frontend Assets
│   │   ├── base.css                        # Basis-CSS-Styles
│   │   ├── logo.svg                        # Projekt-Logo
│   │   └── main.css                        # Haupt-CSS-Datei
│   ├── components/                         # Vue.js Komponenten (100+ Komponenten)
│   │   ├── common/                         # Gemeinsame Komponenten (15 Komponenten)
│   │   │   ├── UnifiedCard.vue            # Einheitliche Karten-Komponente (5.1KB, 233 Zeilen)
│   │   │   ├── GlobalSnackbar.vue         # Globale Benachrichtigungen (9.3KB, 315 Zeilen)
│   │   │   ├── MobileNavigation.vue       # Mobile Navigation (7.0KB, 320 Zeilen)
│   │   │   ├── SystemConnectionDiagram.vue # System-Verbindungsdiagramm (6.7KB, 273 Zeilen)
│   │   │   ├── BreadcrumbNavigation.vue   # Breadcrumb-Navigation (3.8KB, 134 Zeilen)
│   │   │   ├── DataFlowVisualization.vue  # Datenfluss-Visualisierung (6.2KB, 185 Zeilen)
│   │   │   ├── PortExplanation.vue        # Port-Erklärung (2.8KB, 83 Zeilen)
│   │   │   ├── SystemStatusBar.vue        # System-Status-Bar (10KB, 394 Zeilen)
│   │   │   ├── TooltipHelp.vue            # Tooltip-Hilfe (2.4KB, 81 Zeilen)
│   │   │   ├── ContextMenu.vue            # Kontext-Menü (5.3KB, 192 Zeilen)
│   │   │   ├── LoadingStates.vue          # Lade-Zustände (7.7KB, 346 Zeilen)
│   │   │   ├── AccessibleIcon.vue         # Barrierefreie Icons (509B, 34 Zeilen)
│   │   │   ├── AccessibleButton.vue       # Barrierefreie Buttons (1.0KB, 62 Zeilen)
│   │   │   ├── SafeModeBanner.vue         # Safe-Mode-Banner (1.8KB, 71 Zeilen)
│   │   │   └── ConnectionStatus.vue       # Verbindungsstatus (2.5KB, 97 Zeilen)
│   │   ├── zones/                          # Zonen-Komponenten (1 Komponente)
│   │   │   └── ZoneTreeView.vue           # Zonen-Baum-Ansicht (9.8KB, 333 Zeilen)
│   │   ├── settings/                       # Einstellungs-Komponenten (16 Komponenten)
│   │   │   ├── GodDeviceCard.vue          # God-Geräte-Karte (31KB, 971 Zeilen)
│   │   │   ├── KaiserDeviceCard.vue       # Kaiser-Geräte-Karte (22KB, 768 Zeilen)
│   │   │   ├── SensorAlertConfig.vue      # Sensor-Alert-Konfiguration (9.5KB, 333 Zeilen)
│   │   │   ├── AlertConfiguration.vue     # Alert-Konfiguration (15KB, 460 Zeilen)
│   │   │   ├── EspDeviceCard.vue          # ESP-Geräte-Karte (23KB, 812 Zeilen)
│   │   │   ├── ZoneManagement.vue         # Zonen-Management (5.4KB, 180 Zeilen)
│   │   │   ├── EspGrid.vue                # ESP-Grid (6.9KB, 255 Zeilen)
│   │   │   ├── LibraryManagement.vue      # Bibliothek-Management (8.5KB, 275 Zeilen)
│   │   │   ├── esp/                       # ESP-spezifische Komponenten (4 Komponenten)
│   │   │   │   ├── EspPinConfiguration.vue # ESP-Pin-Konfiguration (13KB, 469 Zeilen)
│   │   │   │   ├── EspActuatorConfiguration.vue # ESP-Aktor-Konfiguration (21KB, 727 Zeilen)
│   │   │   │   ├── EspDeviceInfo.vue      # ESP-Geräte-Info (8.1KB, 259 Zeilen)
│   │   │   │   └── EspZoneManagement.vue  # ESP-Zonen-Management (6.1KB, 202 Zeilen)
│   │   │   ├── EspDevicePanel.vue         # ESP-Geräte-Panel (36KB, 1156 Zeilen)
│   │   │   ├── SimpleServerSetup.vue      # Einfache Server-Einrichtung (30KB, 923 Zeilen)
│   │   │   ├── SystemExplanationCard.vue  # System-Erklärungs-Karte (5.0KB, 179 Zeilen)
│   │   │   ├── DeviceManagement.vue       # Geräte-Management (11KB, 408 Zeilen)
│   │   │   ├── DeviceCardBase.vue         # Basis-Geräte-Karte (8.8KB, 333 Zeilen)
│   │   │   └── SensorConfiguration.vue    # Sensor-Konfiguration (14KB, 474 Zeilen)
│   │   ├── layouts/                        # Layout-Komponenten (1 Komponente)
│   │   │   └── TopNavigation.vue          # Top-Navigation (11KB, 358 Zeilen)
│   │   ├── icons/                          # Icon-Komponenten (5 Komponenten)
│   │   │   ├── IconCommunity.vue          # Community-Icon (1.0KB, 8 Zeilen)
│   │   │   ├── IconDocumentation.vue      # Dokumentations-Icon (1.2KB, 8 Zeilen)
│   │   │   ├── IconEcosystem.vue          # Ökosystem-Icon (1.9KB, 8 Zeilen)
│   │   │   ├── IconSupport.vue            # Support-Icon (288B, 8 Zeilen)
│   │   │   └── IconTooling.vue            # Tooling-Icon (913B, 20 Zeilen)
│   │   ├── example/                        # Beispiel-Komponenten (0 Komponenten)
│   │   ├── device/                         # Geräte-Komponenten (3 Komponenten)
│   │   │   ├── SubzoneTreeCard.vue        # Subzone-Baum-Karte (6.2KB, 221 Zeilen)
│   │   │   ├── DeviceTreeView.vue         # Geräte-Baum-Ansicht (12KB, 399 Zeilen)
│   │   │   └── PinTreeCard.vue            # Pin-Baum-Karte (5.6KB, 214 Zeilen)
│   │   ├── debug/                          # Debug-Komponenten (9 Komponenten)
│   │   │   ├── KaiserIdTestPanel.vue      # Kaiser-ID-Test-Panel (11KB, 382 Zeilen)
│   │   │   ├── PiIntegrationPanel.vue     # Pi-Integration-Panel (19KB, 577 Zeilen)
│   │   │   ├── SystemCommandsPanel.vue    # System-Befehle-Panel (15KB, 505 Zeilen)
│   │   │   ├── WarningConfigurationPanel.vue # Warning-Konfigurations-Panel (12KB, 371 Zeilen)
│   │   │   ├── DeviceSimulator.vue        # Geräte-Simulator (20KB, 598 Zeilen)
│   │   │   ├── InteractionLogPanel.vue    # Interaktions-Log-Panel (15KB, 513 Zeilen)
│   │   │   ├── SensorRegistryPanel.vue    # Sensor-Registry-Panel (16KB, 496 Zeilen)
│   │   │   ├── ConfigurationPanel.vue     # Konfigurations-Panel (7.3KB, 226 Zeilen)
│   │   │   └── MqttDebugPanel.vue         # MQTT-Debug-Panel (3.4KB, 115 Zeilen)
│   │   ├── dashboard/                      # Dashboard-Komponenten (22 Komponenten)
│   │   │   ├── SystemStateCard.vue        # System-Status-Karte (20KB, 570 Zeilen)
│   │   │   ├── SensorVisualization.vue    # Sensor-Visualisierung (15KB, 578 Zeilen)
│   │   │   ├── ComparisonVisualizer.vue   # Vergleichs-Visualisierer (13KB, 460 Zeilen)
│   │   │   ├── ActuatorMonitor.vue        # Aktor-Monitor (21KB, 707 Zeilen)
│   │   │   ├── ZoneCard.vue               # Zonen-Karte (35KB, 1163 Zeilen)
│   │   │   ├── SubZoneCard.vue            # Subzone-Karte (17KB, 550 Zeilen)
│   │   │   ├── DashboardControls.vue      # Dashboard-Steuerung (7.0KB, 256 Zeilen)
│   │   │   ├── DatabaseLogsCard.vue       # Datenbank-Logs-Karte (25KB, 834 Zeilen)
│   │   │   ├── LogicTestPanel.vue         # Logik-Test-Panel (21KB, 644 Zeilen)
│   │   │   ├── logic/                     # Logik-Komponenten (5 Komponenten)
│   │   │   │   ├── ActuatorLogicEditor.vue # Aktor-Logik-Editor (11KB, 363 Zeilen)
│   │   │   │   ├── GlobalSensorSelect.vue # Globale Sensor-Auswahl (4.9KB, 172 Zeilen)
│   │   │   │   ├── EventConfig.vue        # Event-Konfiguration (2.2KB, 94 Zeilen)
│   │   │   │   ├── TimerConfig.vue        # Timer-Konfiguration (3.4KB, 138 Zeilen)
│   │   │   │   └── SensorConditionConfig.vue # Sensor-Bedingungs-Konfiguration (3.6KB, 146 Zeilen)
│   │   │   ├── ZoneCardOptimized.vue      # Optimierte Zonen-Karte (7.2KB, 265 Zeilen)
│   │   │   ├── LogicWizardEditor.vue      # Logik-Wizard-Editor (12KB, 417 Zeilen)
│   │   │   ├── LogicTemplateLibrary.vue   # Logik-Template-Bibliothek (13KB, 472 Zeilen)
│   │   │   ├── ActuatorLogicEditor.vue    # Aktor-Logik-Editor (34KB, 1193 Zeilen)
│   │   │   ├── UnifiedInteractionZone.vue # Einheitliche Interaktions-Zone (18KB, 573 Zeilen)
│   │   │   ├── ActuatorCard.vue           # Aktor-Karte (16KB, 528 Zeilen)
│   │   │   ├── ActuatorLogicCard.vue      # Aktor-Logik-Karte (9.9KB, 334 Zeilen)
│   │   │   ├── SensorComparisonChart.vue  # Sensor-Vergleichs-Chart (14KB, 480 Zeilen)
│   │   │   ├── SensorDataVisualization.vue # Sensor-Daten-Visualisierung (2.4KB, 93 Zeilen)
│   │   │   ├── TimeRangeSelector.vue      # Zeitbereich-Auswahl (8.0KB, 263 Zeilen)
│   │   │   └── AutoDashboardGenerator.vue # Auto-Dashboard-Generator (9.3KB, 317 Zeilen)
│   │   ├── HelloWorld.vue                 # Hello World Komponente (700B, 45 Zeilen)
│   │   ├── TheWelcome.vue                 # Welcome Komponente (3.4KB, 95 Zeilen)
│   │   └── WelcomeItem.vue                # Welcome Item Komponente (1.4KB, 87 Zeilen)
│   ├── composables/                        # Composable Functions (7 Funktionen)
│   │   ├── useStoreInitialization.js      # Store-Initialisierung (11KB, 322 Zeilen)
│   │   ├── useResponsiveDisplay.js        # Responsive Anzeige (8.9KB, 325 Zeilen)
│   │   ├── useDeviceSynchronization.js    # Geräte-Synchronisation (6.1KB, 221 Zeilen)
│   │   ├── useDeviceHealthScore.js        # Geräte-Gesundheits-Score (1.7KB, 72 Zeilen)
│   │   ├── useBlinkTracker.js             # Blink-Tracker (2.6KB, 96 Zeilen)
│   │   ├── useMqttFeedback.js             # MQTT-Feedback (6.0KB, 233 Zeilen)
│   │   └── useSensorAggregation.js        # Sensor-Aggregation (11KB, 375 Zeilen)
│   ├── data/                               # Statische Daten (1 Datei)
│   │   └── sensorTemplates.js             # Sensor-Templates (6.0KB, 236 Zeilen)
│   ├── router/                             # Vue Router
│   │   └── index.js                       # Router-Konfiguration
│   ├── stores/                             # Pinia Stores (15 Stores)
│   │   ├── centralConfig.js               # Zentrale Konfiguration (43KB, 1380 Zeilen)
│   │   ├── mqtt.js                        # MQTT Kommunikation (119KB, 3496 Zeilen)
│   │   ├── centralDataHub.js              # Zentrale Daten-Hub (26KB, 869 Zeilen)
│   │   ├── dashboardGenerator.js          # Dashboard-Generator (64KB, 1996 Zeilen)
│   │   ├── espManagement.js               # ESP-Management (35KB, 1069 Zeilen)
│   │   ├── sensorRegistry.js              # Sensor-Registry (13KB, 433 Zeilen)
│   │   ├── piIntegration.js               # Pi-Integration (14KB, 498 Zeilen)
│   │   ├── logicalAreas.js                # Logische Bereiche (7.6KB, 259 Zeilen)
│   │   ├── timeRange.js                   # Zeitbereich (7.3KB, 243 Zeilen)
│   │   ├── zoneRegistry.js                # Zonen-Registry (2.5KB, 107 Zeilen)
│   │   ├── actuatorLogic.js               # Aktor-Logik (50KB, 1648 Zeilen)
│   │   ├── databaseLogs.js                # Datenbank-Logs (12KB, 421 Zeilen)
│   │   ├── theme.js                       # Theme-Management (5.3KB, 180 Zeilen)
│   │   ├── counter.js                     # Counter Store (259B, 16 Zeilen)
│   │   └── systemCommands.js              # System-Befehle (6.4KB, 264 Zeilen)
│   ├── services/                           # Services (1 Service)
│   │   └── apiService.js                  # API-Service (7.9KB, 272 Zeilen)
│   ├── schemas/                            # JSON Schemas (1 Schema)
│   │   └── logic.schema.json              # Logik-Schema (4.2KB, 163 Zeilen)
│   ├── utils/                              # Utility Functions
│   │   ├── espHttpClient.js               # ESP HTTP Client
│   │   ├── storage.js                     # Storage Utilities
│   │   └── time.js                        # Time Utilities
│   ├── tests/                              # Tests
│   │   ├── unit/                          # Unit Tests
│   │   └── README.md                      # Test-Dokumentation (4.2KB, 214 Zeilen)
│   ├── views/                              # Vue Views
│   │   ├── HomeView.vue                   # Home-Ansicht (391 Zeilen)
│   │   ├── DashboardView.vue              # Dashboard-Ansicht (410 Zeilen)
│   │   ├── SettingsView.vue               # Einstellungen-Ansicht (371 Zeilen)
│   │   ├── ZonesView.vue                  # Zonen-Ansicht (335 Zeilen)
│   │   ├── ZoneFormView.vue               # Zone-Formular-Ansicht (273 Zeilen)
│   │   ├── DevicesView.vue                # Geräte-Ansicht (32 Zeilen)
│   │   ├── DevelopmentView.vue            # Entwicklungs-Ansicht (344 Zeilen)
│   │   └── AboutView.vue                  # Über-Ansicht (16 Zeilen)
│   ├── App.vue                            # Haupt-App-Komponente (4.6KB, 207 Zeilen)
│   ├── main.js                            # App-Initialisierung (11KB, 378 Zeilen)
│   ├── mqtt-test.js                       # MQTT Test-Skript (632B, 30 Zeilen)
│   └── style.css                          # Globale Styles
├── .editorconfig                          # Editor-Konfiguration (217B, 10 Zeilen)
├── .gitattributes                         # Git-Attribute (19B, 2 Zeilen)
├── .gitignore                             # Git-Ignore (317B, 31 Zeilen)
├── .prettierrc.json                       # Prettier-Konfiguration (120B, 7 Zeilen)
├── .vscode/                               # VS Code Konfiguration
│   ├── extensions.json                    # VS Code Extensions
│   └── settings.json                      # VS Code Einstellungen
├── ecosystem.config.cjs                   # PM2 Konfiguration (696B, 31 Zeilen)
├── eslint.config.js                       # ESLint Konfiguration (596B, 27 Zeilen)
├── index.html                             # HTML Entry Point (329B, 14 Zeilen)
├── jsconfig.json                          # JavaScript Konfiguration (140B, 9 Zeilen)
├── package.json                           # NPM Package Konfiguration (1.0KB, 43 Zeilen)
├── package-lock.json                      # NPM Lock Datei (216KB, 6329 Zeilen)
├── postcss.config.js                      # PostCSS Konfiguration (80B, 7 Zeilen)
├── tailwind.config.js                     # Tailwind CSS Konfiguration (3.7KB, 138 Zeilen)
├── vite.config.js                         # Vite Build Konfiguration (494B, 21 Zeilen)
├── README_frontend.md                     # Frontend Dokumentation (337KB, 10062 Zeilen)
├── CODEBASE_ANALYSIS_REPORT.md            # Codebase Analyse Report (8.5KB, 281 Zeilen)
├── RACE_CONDITION_FIX_IMPLEMENTATION.md   # Race Condition Fix (13KB, 462 Zeilen)
├── ZONE_MANAGEMENT_FIX_ANALYSIS.md        # Zonen-Management Fix (7.2KB, 291 Zeilen)
├── SOLUTION_SUMMARY.md                    # Lösung Zusammenfassung (8.4KB, 262 Zeilen)
├── DEVELOPMENT_VIEW_MODERNIZATION_SUMMARY.md # Entwicklungs-View Modernisierung (8.1KB, 297 Zeilen)
├── EXTENDED_SYSTEM_INFO_IMPLEMENTATION.md # Erweiterte System-Info (7.8KB, 323 Zeilen)
├── PERFORMANCE_OPTIMIZATION_SUMMARY.md    # Performance Optimierung (8.0KB, 286 Zeilen)
├── IMPLEMENTATION_SUMMARY.md              # Implementierung Zusammenfassung (10KB, 287 Zeilen)
├── BENUTZERFREUNDLICHKEIT_IMPLEMENTATION.md # Benutzerfreundlichkeit (6.8KB, 236 Zeilen)
├── TREE_EXPANSION_IMPLEMENTATION_SUMMARY.md # Tree Expansion (5.6KB, 191 Zeilen)
├── FRONTEND_IMPROVEMENTS.md               # Frontend Verbesserungen (7.6KB, 262 Zeilen)
├── CENTRALDATAHUB_IMPLEMENTATION_SUMMARY.md # Central Data Hub (10KB, 326 Zeilen)
├── UPDATE_FRONTEND.md                     # Frontend Update (49KB, 1616 Zeilen)
├── umbau.md                               # Umbau Dokumentation (56KB, 1670 Zeilen)
├── CROSS_ESP_LOGIC_IMPLEMENTATION.md      # Cross-ESP Logik (9.1KB, 364 Zeilen)
├── ZONENVERWALTUNG_IMPLEMENTATION.md      # Zonenverwaltung (6.9KB, 234 Zeilen)
├── OPTIMIZATION_SUMMARY.md                # Optimierung Zusammenfassung (3.0KB, 103 Zeilen)
├── SAFEMODE_TOOLTIP_IMPLEMENTATION.md     # Safe Mode Tooltip (5.4KB, 223 Zeilen)
├── ESP_CONFIGURATION_IMPLEMENTATION.md    # ESP Konfiguration (10KB, 363 Zeilen)
├── Frontend_Auswertung.md                 # Frontend Auswertung (29KB, 1139 Zeilen)
├── README INDUSTRY.md                     # Industrie README (15KB, 648 Zeilen)
├── growy-frontend-liste.txt               # Frontend Liste (2.8MB)
├── APPLY_CONFIRM_WORKFLOW.md              # Apply Confirm Workflow (7.1KB, 259 Zeilen)
├── BACKEND_CHANGES_REQUIRED.md            # Backend Änderungen (4.4KB, 178 Zeilen)
├── BOARD_PIN_CONFIGURATION.md             # Board Pin Konfiguration (3.8KB, 112 Zeilen)
├── KAISER_TEST.md                         # Kaiser Test (4.6KB, 162 Zeilen)
└── logs/                                  # Log-Dateien
```

### **🆕 Neue Komponenten v3.6.0:**

- **TopNavigation.vue** (343 Zeilen): Erweiterte Navigation mit Kaiser-Integration
- **UnifiedZoneManagement.vue**: Einheitliche Verwaltung aller Sensoren und Aktoren
- **EnhancedPinConfiguration.vue**: Erweiterte Pin-Konfiguration für XIAO ESP32-C3
- **ZoneTreeView.vue**: Hierarchische Darstellung der Zonen-Struktur
- **ZoneManagement.vue**: Zonen-Management mit CRUD-Operationen
- **ConnectionStatus.vue** (97 Zeilen): MQTT Verbindungsstatus mit Qualitätsanzeige
- **GlobalSnackbar.vue** (241 Zeilen): Globale Benachrichtigungen für Benutzer-Feedback
- **PortExplanation.vue** (83 Zeilen): Visuelle Port-Erklärung mit System-Diagramm
- **SystemConnectionDiagram.vue** (228 Zeilen): Interaktive Netzwerk-Architektur Visualisierung
- **SensorRegistryPanel.vue**: Erweiterte Sensor-Verwaltung
- **KaiserIdTestPanel.vue**: Kaiser-Controller-Tests

### **🆕 Neue Stores v3.4.1:**

- **zones.js**: Unified Zone Management für alle Sensoren und Aktoren
- **espManagement.js**: ESP32 Device Discovery und Management
- **sensorRegistry.js**: Sensor Registry für erweiterte Sensor-Verwaltung
- **centralConfig.js**: Zentrale Konfiguration mit System-Name Management
- **piIntegration.js**: Erweiterte Pi-Server Integration
- **systemCommands.js**: System Commands mit Validierung

### **🆕 Neue Composables v3.6.0:**

- **useSensorAggregation.js** (375 Zeilen): Zeitfenster-basierte Sensor-Aggregationen mit Performance-Optimierung
- **🆕 Warning-basierte Aggregation:** Zentrale Warning-Analyse und -Visualisierung
- **🆕 Zeitqualität-basierte Aggregation:** Datenqualitätsbewertung und -Monitoring
- **🆕 Erweiterte Sensor-Typ-Unterstützung:** Vollständige Backend v3.5.0 Kompatibilität
- **🆕 Template-System Integration:** Unterstützung für vorkonfigurierte Sensor-Setups
- **🆕 Board-Type-spezifische Aggregation:** Angepasste Aggregationen je nach Board-Typ

### **🆕 Neue Data-Dateien v3.6.0:**

- **sensorTemplates.js** (209 Zeilen): Vorkonfigurierte Sensor-Setups für verschiedene Anwendungsfälle
- **🆕 Board-Type-spezifische Templates:** ESP32 DevKit und XIAO C3 Templates
- **🆕 I2C Sensor Templates:** Vorkonfigurierte I2C-Sensor-Setups
- **🆕 Template-Validierung:** Board-Kompatibilitätsprüfung und I2C-Limit-Management
- **🆕 Anwendungsfall-Templates:** Gewächshaus, Bewässerung, Klimasteuerung, etc.

**Code-Beispiel - Sensor Aggregation:**

```javascript
// src/composables/useSensorAggregation.js - Zeilen 30-50
/**
 * 🆕 NEU: Berechnet Aggregationen für einen spezifischen Zeitraum
 * @param {string} espId - ESP-ID
 * @param {number} timeWindowMs - Zeitfenster in Millisekunden
 * @returns {Array} Array von Aggregation-Objekten
 */
function getEspAggregationsWithTimeWindow(espId, timeWindowMs = 5 * 60 * 1000) {
  if (!espId) return []

  const sensors = sensorRegistry.getSensorsByEsp(espId)
  const now = Date.now()

  // Nur Sensoren im Zeitfenster
  const recentSensors = sensors.filter(
    (sensor) => sensor.lastUpdate && now - sensor.lastUpdate <= timeWindowMs,
  )

  return calculateAggregations(recentSensors)
}

/**
 * 🆕 NEU: Zeitfenster-Optionen für Aggregationen
 * @returns {Array} Array von Zeitfenster-Optionen
 */
function getTimeWindowOptions() {
  return [
    { label: 'Letzte 5 Minuten', value: 5 * 60 * 1000 },
    { label: 'Letzte Stunde', value: 60 * 60 * 1000 },
    { label: 'Letzte 24 Stunden', value: 24 * 60 * 60 * 1000 },
    { label: 'Alle verfügbaren Daten', value: null },
  ]
}

/**
 * 🆕 NEU: Warning-basierte Aggregation
 * @param {Array} sensors - Array von Sensor-Objekten
 * @returns {Array} Array von Warning-Aggregation-Objekten
 */
function calculateWarningAggregations(sensors) {
  if (!sensors || sensors.length === 0) return []

  // Sensoren mit Warnings gruppieren
  const warningSensors = sensors.filter((sensor) => sensor.warnings && sensor.warnings.length > 0)

  if (warningSensors.length === 0) return []

  // Nach Warning-Typ gruppieren
  const grouped = {}
  warningSensors.forEach((sensor) => {
    sensor.warnings.forEach((warning) => {
      if (!grouped[warning]) {
        grouped[warning] = []
      }
      grouped[warning].push(sensor)
    })
  })

  // Warning-Aggregationen berechnen
  return Object.entries(grouped).map(([warning, sensors]) => ({
    warning,
    label: getWarningLabel(warning),
    color: getWarningColor(warning),
    count: sensors.length,
    sensors: sensors.map((s) => ({ espId: s.espId, gpio: s.gpio, type: s.type })),
  }))
}
```

## 🔄 **Entwicklungs-Workflow**

### **1. Neue Komponente erstellen**

```bash
# Komponente in src/components/ erstellen
touch src/components/new/NewComponent.vue

# Store in src/stores/ erstellen (falls benötigt)
touch src/stores/newStore.js

# View in src/views/ erstellen (falls benötigt)
touch src/views/NewView.vue
```

### **2. Router-Route hinzufügen**

```javascript
// src/router/index.js
{
  path: '/new-route',
  name: 'new-route',
  component: () => import('../views/NewView.vue'),
  meta: {
    title: 'New Page',
  },
}
```

### **3. Store-Integration**

```javascript
// In Komponente importieren
import { useNewStore } from '@/stores/newStore'

// In setup() verwenden
const newStore = useNewStore()
```

### **4. MQTT-Integration**

```javascript
// MQTT-Topic subscriben
mqttStore.client.subscribe('kaiser/kaiser_id/esp/esp_id/new/topic')

// MQTT-Nachricht senden
await mqttStore.publish('kaiser/kaiser_id/esp/esp_id/new/topic', data)
```

### **5. Persistente Speicherung**

```javascript
// Daten speichern
storage.save('key', data)

// Daten laden
const data = storage.load('key', defaultValue)
```

### **6. Unified Zone Management Integration**

```javascript
// Zone Store verwenden für alle Sensoren/Aktoren
import { useZonesStore } from '@/stores/zones'

const zonesStore = useZonesStore()

// Sensor hinzufügen
await zonesStore.addSensor(zoneId, subZoneId, {
  gpio: 4,
  type: 'DS18B20',
  name: 'Temperature Sensor',
})

// Aktor hinzufügen
await zonesStore.addActuator(zoneId, subZoneId, {
  gpio: 5,
  type: 'pump',
  name: 'Water Pump',
})

// 🆕 NEU: Sensor Registry Integration
import { useSensorRegistryStore } from '@/stores/sensorRegistry'
const sensorRegistry = useSensorRegistryStore()

// Sensor in Registry registrieren
sensorRegistry.registerSensor(espId, gpio, {
  type: 'SENSOR_TEMP_DS18B20',
  name: 'Temperature Sensor',
  subzoneId: subZoneId,
})
```

### **7. ESP32 Device Management**

```javascript
// ESP32 Store für Device Management
import { useEspManagementStore } from '@/stores/espManagement'

const espStore = useEspManagementStore()

// ESP Device hinzufügen
await espStore.addEspDevice({
  espId: 'ESP_12345678',
  espUsername: 'greenhouse_01',
  espFriendlyName: 'Gewächshaus Sensor',
})

// I2C Sensor konfigurieren
await espStore.configureI2CSensor('ESP_12345678', {
  i2cAddress: 0x44,
  sensorType: 'SHT31',
  subzoneId: 'greenhouse',
})
```

### **8. MQTT Testing**

```javascript
// MQTT-Verbindung testen
await mqttStore.connect()

// Nachricht senden
await mqttStore.publish('test/topic', { message: 'test' })

// Nachrichten empfangen
mqttStore.messages.forEach((msg) => {
  console.log('Received:', msg.topic, msg.message)
})
```

### **9. Component Testing**

```javascript
// Komponente in DevelopmentView testen
// src/views/DevelopmentView.vue
```

### **10. Store Testing**

```javascript
// Store-Zustand überprüfen
console.log('MQTT Store:', mqttStore)
console.log('Zones Store:', zonesStore)
console.log('Devices Store:', devicesStore)
console.log('ESP Management Store:', espManagementStore)
```

### **11. 🆕 Sensor Aggregation Testing**

```javascript
// Sensor-Aggregation testen
import { useSensorAggregation } from '@/composables/useSensorAggregation'

const { getAggregatedValues, timeWindows } = useSensorAggregation()

// Aggregation für Zeitfenster testen
const aggregated = getAggregatedValues(sensors, '5min')
console.log('5-Minuten Aggregation:', aggregated)

// Alle verfügbaren Zeitfenster
console.log('Verfügbare Zeitfenster:', timeWindows)
```

### **12. 🆕 Multi-View Dashboard Testing**

```javascript
// Dashboard View Mode testen
const viewMode = ref('zones') // 'zones', 'esps', 'sensors'

// Globale Aggregation-Einstellungen testen
const globalShowAggregations = ref(true)
const globalTimeWindow = ref(5 * 60 * 1000) // 5 Minuten

// ESP Devices Integration testen
const espIds = computed(() => {
  const mqttEspIds = Array.from(mqttStore.espDevices.keys())
  const registryEspIds = Array.from(sensorRegistry.sensorsByEsp.keys())
  return [...new Set([...mqttEspIds, ...registryEspIds])].sort()
})
```

### **13. 🆕 Sensor Registry Testing**

```javascript
// Sensor Registry testen
import { useSensorRegistryStore } from '@/stores/sensorRegistry'

const sensorRegistry = useSensorRegistryStore()

// Sensor registrieren
sensorRegistry.registerSensor('ESP_12345678', 4, {
  type: 'SENSOR_TEMP_DS18B20',
  name: 'Temperature Sensor',
  subzoneId: 'greenhouse',
})

// Sensoren nach ESP abrufen
const sensors = sensorRegistry.getSensorsByEsp('ESP_12345678')
console.log('ESP Sensoren:', sensors)
```

### **14. 🆕 Backend v3.5.0 Testing**

```javascript
// Backend v3.5.0 Features testen
import { useSensorRegistryStore } from '@/stores/sensorRegistry'

const sensorRegistry = useSensorRegistryStore()

// Sensor mit Backend v3.5.0 Feldern registrieren
sensorRegistry.registerSensor('ESP_12345678', 4, {
  type: 'SENSOR_TEMP_DS18B20',
  name: 'Temperature Sensor',
  value: 25.5,
  raw_value: 255,
  raw_mode: true,
  hardware_mode: true,
  warnings: ['VALUE_OUT_OF_RANGE'],
  time_quality: 'good',
  timestamp: Date.now(),
  iso_timestamp: new Date().toISOString(),
  context: { location: 'greenhouse', zone: 'tomatoes' },
  subzoneId: 'greenhouse',
})

// Warning-Statistiken abrufen
const warningStats = sensorRegistry.getWarningStats
console.log('Warning Stats:', warningStats)

// Zeitqualität-Statistiken abrufen
const timeQualityStats = sensorRegistry.getTimeQualityStats
console.log('Time Quality Stats:', timeQualityStats)

// Raw Data Support testen
const sensor = sensorRegistry.getSensor('ESP_12345678', 4)
console.log('Raw Value:', sensor.raw_value)
console.log('Raw Mode:', sensor.raw_mode)
console.log('Hardware Mode:', sensor.hardware_mode)
```

### **16. 🆕 Sensor Templates Testing**

```javascript
// Sensor Templates testen
import { sensorTemplates, validateTemplateForBoard } from '@/data/sensorTemplates'

// Verfügbare Templates anzeigen
console.log(
  'Available Templates:',
  sensorTemplates.map((t) => t.name),
)

// Template für Board validieren
const template = sensorTemplates.find((t) => t.id === 'temp_humidity_basic')
const validation = validateTemplateForBoard(template, 'ESP32_C3_XIAO')
console.log('Template Validation:', validation)

// Template-Zuweisungen anwenden
if (validation.valid) {
  template.assignments.forEach((assignment) => {
    console.log(`GPIO ${assignment.gpio}: ${assignment.type} - ${assignment.name}`)
  })
}
```

### **17. 🆕 TopNavigation Testing**

```javascript
// TopNavigation-Features testen
// Kaiser-Modus aktivieren
localStorage.setItem('kaiser_id', 'test_kaiser_01')
location.reload()

// Navigation-Items überprüfen
const navigationItems = [
  { title: '📊 Dashboard', path: '/dashboard', icon: 'mdi-view-dashboard' },
  { title: '🌿 Zonen', path: '/zones', icon: 'mdi-map-marker' },
  { title: '⚙️ Einstellungen', path: '/settings', icon: 'mdi-cog' },
  { title: '🧪 Debug', path: '/dev', icon: 'mdi-bug' },
]

// Mobile Navigation testen
// Browser auf Mobile-Größe verkleinern und Mobile-Menu öffnen
```

### **18. 🆕 Global Snackbar Testing**

```javascript
// Global Snackbar testen
// Verfügbar über window.$snackbar

// Success Message
window.$snackbar?.showSuccess('Operation erfolgreich abgeschlossen')

// Error Message mit längerer Anzeige
window.$snackbar?.showError('Fehler beim Speichern der Konfiguration', { timeout: 8000 })

// Info Message mit Custom Action
window.$snackbar?.showInfo('Neue Version verfügbar', {
  action: {
    text: 'Aktualisieren',
    callback: () => location.reload(),
  },
  timeout: 10000,
})

// Warning Message
window.$snackbar?.showWarning('Batterie schwach - 15% verbleibend')
```

### **15. 🆕 Warning System Testing**

```javascript
// Warning System testen
import { useSensorAggregation } from '@/composables/useSensorAggregation'

const { calculateWarningAggregations, getWarningLabel, getWarningColor } = useSensorAggregation()

// Warning-Aggregationen berechnen
const sensors = sensorRegistry.getAllSensors
const warningAggregations = calculateWarningAggregations(sensors)
console.log('Warning Aggregations:', warningAggregations)

// Warning-Labels und -Farben testen
const warningLabel = getWarningLabel('SENSOR_OFFLINE')
const warningColor = getWarningColor('VALUE_OUT_OF_RANGE')
console.log('Warning Label:', warningLabel)
console.log('Warning Color:', warningColor)
```

## 🧪 **Kaiser Integration Testing**

### **Kaiser-Modus aktivieren**

```bash
# Automatische Aktivierung über UI
1. HomeView öffnen (http://localhost:5173)
2. "Kaiser-Modus aktivieren" klicken
3. Kaiser ID eingeben (z.B. greenhouse_kaiser_01)
4. Seite wird automatisch neu geladen

# Manuelle Aktivierung (Browser Console)
localStorage.setItem('kaiser_id', 'mein_kaiser_controller')
localStorage.setItem('god_pi_ip', '192.168.1.100')
location.reload()
```

### **Kaiser-Features testen**

```javascript
// Kaiser Status überprüfen
console.log('Kaiser ID:', mqttStore.kaiser.id)
console.log('God Connected:', mqttStore.kaiser.godConnection.connected)
console.log('Autonomous Mode:', mqttStore.kaiser.autonomousMode)
console.log('Push Events:', mqttStore.kaiser.syncStats.pushEvents)

// God Pi Registration testen
await mqttStore.registerWithGod()

// Autonomous Mode toggle
mqttStore.kaiser.autonomousMode = !mqttStore.kaiser.autonomousMode
mqttStore.saveKaiserConfig()

// Emergency Stop testen
await mqttStore.emergencyStopAll()
```

### **Kaiser UI-Tests**

1. **Standard-Modus**: Keine Kaiser-UI sichtbar
2. **Kaiser-Modus**: Kaiser-UI erscheint automatisch
3. **Toolbar**: God Connection Icon und Kaiser ID Badge
4. **HomeView**: Kaiser Header und Quick Actions
5. **Menu**: Emergency Actions und Autonomous Toggle
6. **Settings**: Kaiser Configuration Section

### **Kaiser Integration Tests**

1. **God Pi Connection**: Status wird korrekt angezeigt
2. **Autonomous Mode**: Toggle funktioniert und speichert
3. **Emergency Controls**: Emergency Stop ausführbar
4. **Configuration**: Kaiser Settings werden persistent gespeichert
5. **Push-Sync**: Event-Synchronisation funktioniert

## 🚀 **Deployment-Checkliste**

### **Pre-Deployment**

- [ ] Alle Komponenten getestet
- [ ] MQTT-Verbindung funktioniert
- [ ] Persistente Daten werden gespeichert
- [ ] Error Handling implementiert
- [ ] Responsive Design getestet
- [ ] Kaiser-Integration getestet
- [ ] God Pi Connection funktioniert
- [ ] Emergency Controls verfügbar
- [ ] 🆕 Sensor-Aggregationen funktionieren korrekt
- [ ] 🆕 Zeitfenster-Auswahl ist persistent
- [ ] 🆕 Live-Daten vs. Aggregation-Trennung funktioniert
- [ ] 🆕 Multi-View Dashboard funktioniert
- [ ] 🆕 Sensor Registry ist verfügbar
- [ ] 🆕 ESP Device Discovery funktioniert
- [ ] 🆕 Debug-Komponenten sind verfügbar
- [ ] 🆕 Backend v3.5.0 Kompatibilität getestet
- [ ] 🆕 Warning System funktioniert korrekt
- [ ] 🆕 Time Quality Monitoring ist verfügbar
- [ ] 🆕 Hardware/Simulation Mode wird korrekt angezeigt
- [ ] 🆕 Raw Data Support funktioniert
- [ ] 🆕 Erweiterte ID-Konflikt-Behandlung getestet

### **Build & Deploy**

```bash
# Produktions-Build
npm run build

# PM2 Deployment
pm2 start ecosystem.config.cjs

# Logs überprüfen
pm2 logs growy-frontend
```

### **Build-Konfiguration**

Das Projekt verwendet Vite für das Build-System mit folgenden Features:

- **Vue 3.5.13** mit Composition API
- **Vuetify 3.8.10** für UI-Komponenten
- **Tailwind CSS 3.3.5** für zusätzliche Styling-Optionen
- **Pinia 3.0.3** für State Management
- **Vue Router 4.5.0** für Navigation
- **MQTT.js 5.13.1** für MQTT-Kommunikation
- **Chart.js 4.5.0** für Datenvisualisierung
- **Date-fns 4.1.0** für Datums-/Zeitverarbeitung
- **Material Design Icons 7.4.47** für UI-Icons
- **@vueuse/core 10.11.1** für Vue Composition Utilities
- **@headlessui/vue 1.7.23** für Headless UI Components
- **@heroicons/vue 2.2.0** für Heroicons
- **Vite 6.2.4** für Build Tool und Development Server
- **ESLint 9.22.0** für Code Quality und Linting
- **Prettier 3.5.3** für Code Formatting
- **PostCSS 8.4.31** für CSS Processing
- **Autoprefixer 10.4.16** für CSS Vendor Prefixing

**Build-Optimierungen:**

- Tree-shaking für optimale Bundle-Größe
- Code-splitting für bessere Performance
- Hot Module Replacement (HMR) für Entwicklung

### **Post-Deployment**

- [ ] MQTT-Broker erreichbar
- [ ] ESP-Geräte verbunden
- [ ] Kaiser-Modus funktioniert
- [ ] God Pi Synchronisation aktiv
- [ ] Emergency Controls verfügbar
- [ ] Kaiser UI korrekt angezeigt
- [ ] Autonomous Mode funktioniert
- [ ] Kaiser Configuration persistent
- [ ] 🆕 Sensor-Aggregationen sind verfügbar
- [ ] 🆕 Benutzereinstellungen werden gespeichert
- [ ] 🆕 Performance der Aggregationen ist akzeptabel
- [ ] 🆕 Multi-View Dashboard funktioniert korrekt
- [ ] 🆕 Sensor Registry zeigt alle Sensoren
- [ ] 🆕 ESP Device Discovery findet Geräte
- [ ] 🆕 Debug-Komponenten sind funktionsfähig
- [ ] 🆕 Backend v3.5.0 Features sind verfügbar
- [ ] 🆕 Warning System zeigt Sensor-Probleme korrekt an
- [ ] 🆕 Time Quality Monitoring funktioniert
- [ ] 🆕 Hardware/Simulation Mode wird korrekt erkannt
- [ ] 🆕 Raw Data wird bei aktiviertem Raw-Modus angezeigt
- [ ] 🆕 ID-Konflikte werden korrekt behandelt
- [ ] 🆕 Sensor Templates sind verfügbar und funktionsfähig
- [ ] 🆕 Board-Type-spezifische Template-Validierung funktioniert
- [ ] 🆕 I2C Sensor Limit Management (8 Sensoren) ist aktiv
- [ ] 🆕 TopNavigation-Komponente funktioniert korrekt
- [ ] 🆕 Mobile Navigation ist responsive
- [ ] 🆕 Global Snackbar System zeigt Benachrichtigungen korrekt an
- [ ] 🆕 Kaiser Status Indicators in der Navigation sind sichtbar
- [ ] 🆕 Emergency Actions im Mobile-Menu sind verfügbar
- [ ] 🆕 Sensor Templates sind verfügbar und funktionsfähig
- [ ] 🆕 Board-Type-spezifische Template-Validierung funktioniert
- [ ] 🆕 I2C Sensor Limit Management (8 Sensoren) ist aktiv
- [ ] 🆕 TopNavigation-Komponente funktioniert korrekt
- [ ] 🆕 Mobile Navigation ist responsive
- [ ] 🆕 Global Snackbar System zeigt Benachrichtigungen korrekt an
- [ ] 🆕 Kaiser Status Indicators in der Navigation sind sichtbar
- [ ] 🆕 Emergency Actions im Mobile-Menu sind verfügbar

---

**Version:** v3.6.0  
**Letzte Aktualisierung:** Dezember 2024  
**Architektur:** Kaiser Edge Controller (Pi0) + God Pi Central (Pi5)  
**Kompatibilität:** ESP32 Advanced Sensor Network System v3.5.0  
**UI/UX Features:** ✅ Dynamischer Header, Port-Erklärung, System-Diagramm, Zentrale Sensorverwaltung, Board-Type Information, Intelligente Sensor-Aggregationen, Rückwärtskompatibilität, Backend v3.5.0 Integration, Sensor Templates, TopNavigation, Global Snackbar  
**Entwickler-Ready:** ✅ Vollständig dokumentiert für Weiterentwicklung  
**Status:** ✅ Produktionsreif mit automatischer Migration, Board-spezifischer Pin-Logik, Board-Type Information, ESP32 Preferences Key Fixes, vollständiger Backend v3.5.0 Kompatibilität und erweiterten UI-Komponenten

# 🆕 Entwickler-Update (Dezember 2024)

## Wichtige Neuerungen & Hinweise

- **Zentrale Sensorverwaltung:** Alle Sensoren (inkl. I2C) werden ausschließlich über die Zonenkonfiguration verwaltet. Es gibt keine separaten I2C-Menüs oder -Routen mehr.
- **I2C-Redundanz entfernt:** Die Datei `I2CSensorConfiguration.vue` und die zugehörige Route wurden entfernt. Die I2C-Konfiguration ist vollständig in die Pin-/Zonenverwaltung integriert.
- **Automatische Migration:** Beim ersten Start nach dem Update werden alte I2C-Konfigurationen automatisch in das neue Pin-Assignment-Format migriert. Feedback erfolgt per Snackbar.
- **Board-spezifische Pin-Logik:** Die Pin-Auswahl und Validierung ist abhängig vom Board-Typ (z.B. ESP32 DevKit, XIAO). I2C-Sensoren können nur auf den korrekten SDA-Pins konfiguriert werden.
- **Board-Type Information:** ✅ **Vollständig implementiert** - Frontend zeigt automatisch Board-Typ, Chip-Modell und Firmware-Version aus ESP32 Status-Updates an.
- **UX-Hinweise:** Im Dashboard und in der Pin-Konfiguration werden Info-Alerts angezeigt, die auf die neue zentrale Verwaltung hinweisen.
- **Kaiser-Modus:** Edge-Controller-Features (Autonomous Mode, Emergency Stop, God Pi Sync) sind prominent und persistent im UI verfügbar.
- **🆕 Sensor-Aggregationen:** Intelligente zeitfenster-basierte Analysen mit globaler Steuerung und persistenter Konfiguration.
- **ESP32 Preferences Key Fixes:** Vollständige Rückwärtskompatibilität für kürzere Preferences-Keys implementiert (v3.4.1).
- **Dynamische System-Erkennung:** Automatische Unterscheidung zwischen Kaiser Edge Controller und God Pi Central mit kontextueller UI-Anpassung.
- **🆕 Intelligente Sensor-Aggregationen:** Zeitfenster-basierte Analysen (5 Min, 1h, 24h, alle Daten) mit kontextabhängiger Darstellung und Performance-Optimierung.
- **🆕 Live-Daten vs. Analyse-Trennung:** Klare Unterscheidung zwischen aktuellen Sensorwerten und aggregierten Daten für bessere UX.
- **🆕 Globale Aggregation-Steuerung:** Einheitliche Kontrolle über alle Aggregationen mit persistenter Speicherung der Benutzereinstellungen.
- **🆕 Backend v3.5.0 Kompatibilität:** Vollständige Integration der neuen Sensor-Features (Raw Data, Warning System, Time Quality Monitoring)
- **🆕 Warning System:** Zentrale Sensor-Qualitätsüberwachung mit visuellen Indikatoren
- **🆕 Time Quality Monitoring:** Datenqualitätsbewertung und -Monitoring für alle Sensoren
- **🆕 Hardware/Simulation Mode:** Unterscheidung zwischen Hardware- und Simulationsmodus
- **🆕 Erweiterte ID-Konflikt-Behandlung:** Konflikt-Management für alle System-Komponenten (Kaiser, Master Zone, Subzone, ESP IDs)
- **🆕 Verbesserte MQTT Topic-Struktur:** Hierarchische Organisation mit erweiterten Topic-Patterns
- **🆕 Sensor Templates System:** Vorkonfigurierte Sensor-Setups für verschiedene Anwendungsfälle (Gewächshaus, Bewässerung, Klimasteuerung, etc.)
- **🆕 Board-Type-spezifische Templates:** ESP32 DevKit und XIAO C3 Templates mit automatischer Validierung
- **🆕 I2C Sensor Limit Management:** Automatische Begrenzung auf 8 I2C-Sensoren pro Bus
- **🆕 TopNavigation-Komponente:** Erweiterte Navigation mit Kaiser-Integration und Mobile-Support
- **🆕 Global Snackbar System:** Zentrale Benachrichtigungen mit erweiterten Funktionen
- **🆕 Mobile-optimierte UI:** Responsive Design für alle Bildschirmgrößen
- **🆕 Template-Validierung:** Board-Kompatibilitätsprüfung und I2C-Limit-Management

---

## Codebeispiele & UI-Snippets (Stand 12/2024)

### Zentrale Sensorverwaltung (Dashboard)

```vue
<v-alert type="info" variant="tonal" density="compact" class="mb-6" icon="mdi-information">
  <strong>Alle Sensoren und Aktoren</strong> (inkl. I2C-Sensoren) werden in der 
  <strong>Zonenkonfiguration</strong> verwaltet. Keine separaten Menüs mehr!
  <template v-slot:append>
    <v-btn color="primary" variant="text" size="small" to="/zones">Zu den Zonen</v-btn>
  </template>
</v-alert>
```

### I2C-Konfiguration in der Pin-Zuweisung

```vue
<v-row v-if="showI2CConfig">
  <v-col cols="12">
    <v-alert type="info" variant="tonal" density="compact" class="mb-3" icon="mdi-information">
      <strong>I2C Sensor Konfiguration:</strong>
      I2C-Sensoren werden wie alle anderen Sensoren verwaltet.
      Wähle den I2C SDA Pin und gib die I2C-Adresse an.
    </v-alert>
  </v-col>
  <v-col cols="12" md="6">
    <v-text-field v-model="newAssignment.i2cAddress" label="I2C Address" placeholder="0x44" hint="Hex format (0x44)" variant="outlined" density="comfortable" :rules="[i2cAddressRule]" />
  </v-col>
  <v-col cols="12" md="6">
    <v-select v-model="newAssignment.sensorHint" label="Sensor Interpretation" :items="i2cLibraries" item-title="label" item-value="value" hint="Choose how to interpret raw data" variant="outlined" density="comfortable" />
  </v-col>
</v-row>
```

### 🆕 Backend v3.5.0 Sensor Data Integration

```javascript
// Sensor Registry mit Backend v3.5.0 Feldern
registerSensor(espId, gpio, sensorData) {
  const sensor = {
    // Bestehende Felder
    id: `${espId}-${gpio}`,
    espId,
    gpio,
    type: sensorData.type,
    name: sensorData.name || `Sensor ${gpio}`,
    unit: sensorData.unit || '',
    value: sensorData.value || null,

    // 🆕 NEU: Backend v3.5.0 Felder
    raw_value: sensorData.raw_value || null,
    raw_mode: sensorData.raw_mode || false,
    hardware_mode: sensorData.hardware_mode || false,
    warnings: sensorData.warnings || [],
    time_quality: sensorData.time_quality || 'unknown',
    timestamp: sensorData.timestamp || Date.now(),
    iso_timestamp: sensorData.iso_timestamp || null,
    context: sensorData.context || null,
    sensor: sensorData.sensor || null,

    // Bestehende Felder
    lastUpdate: sensorData.lastUpdate || Date.now(),
    createdAt: sensorData.createdAt || Date.now(),
    description: sensorData.description || '',
    location: sensorData.location || '',
    subzoneId: sensorData.subzoneId || null,
  }

  this.sensors.set(sensor.id, sensor)
  this.updateIndices(espId, gpio, sensor.type, sensor.id)
  return sensor
}
```

### 🆕 Warning System Integration

```vue
<!-- Warning-Badge in SubZoneCard -->
<div v-if="sensor.warnings && sensor.warnings.length > 0" class="absolute top-1 right-1">
  <v-badge
    :content="sensor.warnings.length"
    :color="getWarningColor(sensor.warnings)"
    size="small"
  />
</div>

<!-- Zeitqualität-Indikator -->
<div v-if="sensor.time_quality" class="absolute top-1 left-1">
  <v-icon
    :icon="getTimeQualityIcon(sensor.time_quality)"
    :color="getTimeQualityColor(sensor.time_quality)"
    size="x-small"
  />
</div>

<!-- Raw-Mode-Indikator -->
<div v-if="sensor.raw_mode" class="text-xs text-blue-600 mb-1">
  RAW: {{ sensor.raw_value || '—' }}
</div>

<!-- Hardware/Simulation-Mode-Badge -->
<div v-if="sensor.hardware_mode !== undefined" class="text-xs mt-1">
  <v-chip
    :color="sensor.hardware_mode ? 'success' : 'warning'"
    size="x-small"
    variant="tonal"
  >
    {{ sensor.hardware_mode ? 'Hardware' : 'Simulation' }}
  </v-chip>
</div>
```

### Automatische Migration (main.js)

```js
// src/main.js
espManagementStore.restoreEspDevices()
espManagementStore.migrateI2CConfigurations() // Automatische Migration mit Snackbar-Feedback
```

### Sensor Templates System (sensorTemplates.js)

```javascript
// src/data/sensorTemplates.js - Vorkonfigurierte Sensor-Setups
export const sensorTemplates = [
  {
    id: 'temp_humidity_basic',
    name: 'Temperatur + Luftfeuchte (Basic)',
    description: 'DS18B20 + DHT22 für Gewächshaus',
    icon: 'mdi-thermometer',
    boardTypes: ['ESP32_DEVKIT', 'ESP32_C3_XIAO'],
    assignments: [
      {
        gpio: 4,
        type: 'SENSOR_TEMP_DS18B20',
        name: 'Temperatursensor',
        subzone: 'greenhouse_1',
      },
      {
        gpio: 5,
        type: 'SENSOR_MOISTURE',
        name: 'Luftfeuchtesensor',
        subzone: 'greenhouse_1',
      },
    ],
  },
  {
    id: 'i2c_environmental',
    name: 'I2C Umwelt-Sensoren',
    description: 'SHT31 + BME280 für präzise Messungen',
    icon: 'mdi-weather-cloudy',
    boardTypes: ['ESP32_DEVKIT'], // XIAO hat andere I2C-Pins
    assignments: [
      {
        gpio: 21, // I2C SDA
        type: 'SENSOR_CUSTOM_PI_ENHANCED',
        name: 'SHT31 Temperatur/Luftfeuchte',
        subzone: 'greenhouse_1',
        i2cAddress: '0x44',
        sensorHint: 'SHT31',
      },
    ],
  },
]

// Template-Validierung für Board-Kompatibilität
export function validateTemplateForBoard(template, boardType) {
  if (!template.boardTypes.includes(boardType)) {
    return { valid: false, reason: 'Template nicht kompatibel mit diesem Board-Typ' }
  }

  const i2cSensors = template.assignments.filter((a) => a.type === 'SENSOR_CUSTOM_PI_ENHANCED')
  if (i2cSensors.length > 8) {
    return { valid: false, reason: 'Template enthält mehr als 8 I2C-Sensoren' }
  }

  return { valid: true }
}
```

### Board-spezifische Pin-Validierung (EnhancedPinConfiguration.vue)

```js
const isAssignmentValid = computed(() => {
  if (!selectedEsp.value) return false
  const hasRequiredFields =
    newAssignment.value.gpio &&
    newAssignment.value.type &&
    newAssignment.value.name &&
    newAssignment.value.subzone
  if (!hasRequiredFields) return false
  return espStore.isPinValidForBoard(
    selectedEsp.value.espId,
    newAssignment.value.gpio,
    newAssignment.value.type,
  )
})
```

### Board-Type Information Display (EspConfiguration.vue)

```vue
<v-col cols="12" md="4">
  <v-card variant="tonal" class="pa-4">
    <div class="text-subtitle-2 text-primary mb-2">Board-Typ</div>
    <div class="text-h6">{{ deviceInfo.boardType || 'Unbekannt' }}</div>
    <div class="text-caption text-grey">
      {{ deviceInfo.chipModel || 'Chip-Modell nicht verfügbar' }}
    </div>
  </v-card>
</v-col>
<v-col cols="12" md="4">
  <v-card variant="tonal" class="pa-4">
    <div class="text-subtitle-2 text-primary mb-2">Firmware Version</div>
    <div class="text-h6">{{ deviceInfo.firmwareVersion || 'Unbekannt' }}</div>
    <div class="text-caption text-grey">Aktuelle Version</div>
  </v-card>
</v-col>
```

### Board-Type MQTT Handler (mqtt.js)

```js
// ✅ NEU: Board-Type Information (Backend-kompatibel)
if (payload.board_type || payload.board_info?.board_type) {
  device.boardType = payload.board_type || payload.board_info.board_type
}
if (payload.chip_model || payload.board_info?.chip_model) {
  device.chipModel = payload.chip_model || payload.board_info.chip_model
}
if (payload.firmware_version || payload.board_info?.firmware_version) {
  device.firmwareVersion = payload.firmware_version || payload.board_info.firmware_version
}
```

### TopNavigation-Komponente (TopNavigation.vue)

```vue
<!-- src/components/layouts/TopNavigation.vue - Kaiser Status Indicators -->
<div v-if="isKaiserMode" class="d-flex align-center mr-4">
  <!-- God Connection Status -->
  <v-tooltip location="bottom" max-width="300">
    <template v-slot:activator="{ props }">
      <v-icon v-bind="props" :color="getGodConnectionColor()" class="mr-2">
        {{ getGodConnectionIcon() }}
      </v-icon>
    </template>
    <div class="text-center">
      <div class="font-weight-medium">{{ getGodConnectionStatus() }}</div>
      <div v-if="mqttStore.kaiser.godConnection.lastPushSync" class="text-caption">
        Last sync: {{ formatRelativeTime(mqttStore.kaiser.godConnection.lastPushSync) }}
      </div>
    </div>
  </v-tooltip>

  <!-- Autonomous Mode Indicator -->
  <v-chip v-if="mqttStore.kaiser.autonomousMode" color="warning" size="small" class="mr-2">
    <v-icon start size="16">mdi-robot</v-icon>
    <span class="d-none d-sm-inline">Autonomous</span>
  </v-chip>

  <!-- Kaiser ID Badge -->
  <v-chip color="white" size="small" variant="tonal">
    <v-icon start size="16">mdi-crown</v-icon>
    <span class="d-none d-sm-inline">{{ mqttStore.getKaiserId() }}</span>
  </v-chip>
</div>

<!-- Mobile Navigation Menu -->
<v-navigation-drawer
  v-model="mobileMenu"
  temporary
  location="top"
  class="d-md-none"
  style="top: 64px; height: calc(100vh - 64px)"
>
  <v-list>
    <v-list-item
      v-for="item in navigationItems"
      :key="item.path"
      :to="item.path"
      :prepend-icon="item.icon"
      :title="item.title"
      @click="mobileMenu = false"
      :class="{ 'v-list-item--active': $route.path === item.path }"
      density="comfortable"
    />

    <!-- Emergency Actions (nur im Kaiser-Modus) -->
    <v-divider v-if="isKaiserMode" class="my-2" />
    <v-list-item v-if="isKaiserMode" @click="emergencyStopAll">
      <v-list-item-title class="text-error">
        <v-icon class="mr-2">mdi-stop-circle</v-icon>
        Emergency Stop All
      </v-list-item-title>
    </v-list-item>
  </v-list>
</v-navigation-drawer>
```

### Migration-Feedback (espManagement.js)

```js
if (migratedCount > 0) {
  window.$snackbar?.showSuccess(`${migratedCount} I2C-Konfigurationen erfolgreich migriert`)
}
```

### Global Snackbar System (GlobalSnackbar.vue)

```vue
<!-- src/components/common/GlobalSnackbar.vue - Erweiterte Funktionen -->
<template>
  <v-snackbar
    v-model="show"
    :timeout="currentMessage?.timeout || 4000"
    :color="currentMessage?.color || 'info'"
    :location="currentMessage?.location || 'bottom'"
    :max-width="currentMessage?.maxWidth || 400"
    class="global-snackbar"
  >
    <div class="d-flex align-center">
      <v-icon :icon="getIcon(currentMessage?.type)" class="mr-2" />
      <span class="flex-grow-1">{{ currentMessage?.text }}</span>
      <v-btn
        v-if="currentMessage?.action"
        variant="text"
        size="small"
        @click="handleAction"
        class="ml-2"
      >
        {{ currentMessage.action.text }}
      </v-btn>
    </div>

    <template v-slot:actions>
      <v-btn icon="mdi-close" variant="text" size="small" @click="show = false" />
    </template>
  </v-snackbar>
</template>

<script setup>
// Erweiterte Snackbar-Funktionen
const showSuccess = (text, options = {}) => {
  addMessage({
    text,
    type: 'success',
    color: 'success',
    icon: 'mdi-check-circle',
    ...options,
  })
}

const showError = (text, options = {}) => {
  addMessage({
    text,
    type: 'error',
    color: 'error',
    icon: 'mdi-alert-circle',
    timeout: 6000, // Längere Anzeige für Fehler
    ...options,
  })
}

const showInfo = (text, options = {}) => {
  addMessage({
    text,
    type: 'info',
    color: 'info',
    icon: 'mdi-information',
    ...options,
  })
}

const showWarning = (text, options = {}) => {
  addMessage({
    text,
    type: 'warning',
    color: 'warning',
    icon: 'mdi-alert',
    ...options,
  })
}
</script>
```

---

## Developer-Workflows (aktuell)

- **Neue Sensoren/Aktuatoren:** Über die zentrale Pin-/Zonenverwaltung (`EnhancedPinConfiguration.vue`)
- **Board-Typen:** Auswahl und Validierung in der ESP-Konfiguration (`EspConfiguration.vue`)
- **Migration:** Automatisch beim App-Start, keine manuelle Aktion nötig
- **Debugging:** Über `DevelopmentView.vue` und zugehörige Debug-Komponenten
- **Kaiser-Modus:** Aktivierung über HomeView oder Browser-Konsole

---

## 📋 **Zusammenfassung der Änderungen v3.7.0**

### **🆕 Neue Features:**

1. **Database Logs System** mit erweiterten Filter- und Export-Funktionen
2. **Geführte Filterführung** für benutzerfreundliche Datenanalyse
3. **Auto-Reload System** mit konfigurierbaren Intervallen
4. **Multi-View Datenanzeige** (Tabelle und Karten)
5. **Chart-Integration** für Datenvisualisierung
6. **CSV-Export** mit konfigurierbaren Einstellungen
7. **ESP-Navigation** mit direkter Verlinkung zu Geräten
8. **Sensor-Icon-System** für intuitive Darstellung
9. **Wert-Farbkodierung** basierend auf Sensor-Typ und Messwerten
10. **Erweiterte MQTT-Store-Funktionalitäten** mit Message-Management
11. **Circuit Breaker Pattern** für robuste HTTP-Kommunikation
12. **Erweiterte Error-Handling-Strategien** mit automatischer Wiederherstellung
13. **Performance-Optimierungen** mit begrenzter Message-Speicherung
14. **Cleanup-Scheduler** für inaktive Geräte
15. **Erweiterte Topic-Utilities** für einheitliche MQTT-Topic-Verwaltung
16. **Kaiser-ID-Persistierung** mit automatischer Topic-Umkonfiguration
17. **God Pi Synchronisation** mit Push-Sync und Command-Execution
18. **Erweiterte Sensor-Registry** mit Warning- und Time-Quality-Management
19. **Pi Integration Store** mit Library-Management und Health-Monitoring
20. **System Commands Store** mit Command-History und Validation
21. **Composable Functions** für wiederverwendbare Logik
22. **Utility Functions** für Zeit-, Storage- und Error-Handling
23. **Debug-Komponenten** für Entwickler-Tools und System-Diagnose
24. **Dashboard-Komponenten** für erweiterte Datenvisualisierung
25. **Settings-Komponenten** für umfassende System-Konfiguration

### **🔧 Verbesserungen:**

- **Database Logs Store** mit erweiterten Filter- und Export-Funktionen
- **MQTT Store** mit Message-Management und Cleanup-Scheduler
- **Sensor Registry Store** mit Warning-System und Time-Quality-Management
- **Pi Integration Store** mit Library-Management und Health-Monitoring
- **System Commands Store** mit Safety Confirmation und Circuit Breaker Integration
- **Mobile-optimierte UI** mit responsive Design
- **Dynamische Navigation** mit System-Erkennung
- **Global Snackbar System** für zentrale Benachrichtigungen
- **Erweiterte ID-Konflikt-Behandlung** für alle System-Komponenten
- **Template-Validierung** für Board-Kompatibilität
- **I2C Sensor Limit Management** (8 Sensoren pro I2C-Bus)
- **🆕 Konsolidierte Store-Struktur** mit Entfernung redundanter Stores
- **🆕 Erweiterte Zone-Verschiebung** mit MQTT-Kommunikation
- **🆕 Zone-Löschung** mit Sicherheitsfrage und automatischer ESP-Verschiebung

### **📊 Technische Verbesserungen:**

- **Vue.js ^3.5.13** mit **Vuetify ^3.8.10**
- **Pinia State Management** für zentrale Datenverwaltung
- **MQTT WebSocket Integration** für Echtzeit-Kommunikation
- **Chart.js 4.5.0** mit **Vue-ChartJS 5.3.2** für Datenvisualisierung
- **Vite 6.2.4** für schnelle Entwicklung und Builds
- **ESLint 9.22.0** und **Prettier 3.5.3** für Code-Qualität
- **🆕 Database Logs Store** mit Filter- und Export-Funktionen
- **🆕 Circuit Breaker Pattern** für robuste HTTP-Kommunikation
- **🆕 Erweiterte Topic-Utilities** für einheitliche MQTT-Topic-Verwaltung
- **🆕 Kaiser-ID-Persistierung** mit automatischer Topic-Umkonfiguration
- **🆕 God Pi Synchronisation** mit Push-Sync und Command-Execution
- **🆕 Einheitliche ID-Generierung** mit `deviceIdGenerator.js`
- **🆕 Blink-Tracker Composable** für Zonenwechsel-Animationen

### **🎯 Benutzerfreundlichkeit:**

- **Database Logs System** mit geführter Filterführung und Auto-Reload
- **Multi-View Datenanzeige** mit Tabelle und Karten-Ansicht
- **Chart-Integration** für Datenvisualisierung
- **CSV-Export** mit konfigurierbaren Einstellungen
- **ESP-Navigation** mit direkter Verlinkung zu Geräten
- **Sensor-Icon-System** für intuitive Darstellung
- **Wert-Farbkodierung** basierend auf Sensor-Typ und Messwerten
- **Kaiser Edge Controller Integration** mit God Pi Synchronisation
- **Unified Zone Management** für alle Sensoren und Aktoren
- **ESP32 Discovery & Management** mit automatischer Erkennung
- **I2C Sensor Support** für XIAO ESP32-C3
- **Advanced Error Handling** mit automatischer Wiederherstellung
- **Real-time Monitoring** mit Live-Updates
- **🆕 Vertikale Karten-Reihenfolge** mit God, Kaiser und ESP-Devices
- **🆕 Automatisches Verschwinden** der unkonfigurierten Box
- **🆕 Sicherheitsfrage** bei kritischen Aktionen
- **🆕 Responsive Design** für alle Bildschirmgrößen

---

(Die folgenden Abschnitte sind das bestehende, ausführliche Handbuch und bleiben erhalten)
// ... existing code ...

---

## 📋 **Detaillierte Komponenten-Dokumentation**

### **🎯 Components-Struktur (100+ Komponenten)**

#### **📁 Common Components (15 Komponenten)**

Gemeinsame Komponenten für die gesamte Anwendung:

- **UnifiedCard.vue** (5.1KB, 233 Zeilen): Einheitliche Karten-Komponente für konsistente Darstellung
- **GlobalSnackbar.vue** (9.3KB, 315 Zeilen): Zentrale Benachrichtigungen für alle Komponenten
- **MobileNavigation.vue** (7.0KB, 320 Zeilen): Mobile-optimierte Navigation
- **SystemConnectionDiagram.vue** (6.7KB, 273 Zeilen): Interaktive System-Verbindungsvisualisierung
- **BreadcrumbNavigation.vue** (3.8KB, 134 Zeilen): Hierarchische Navigation
- **DataFlowVisualization.vue** (6.2KB, 185 Zeilen): Datenfluss-Diagramme
- **PortExplanation.vue** (2.8KB, 83 Zeilen): Port-Erklärungen mit Visualisierung
- **SystemStatusBar.vue** (10KB, 394 Zeilen): System-Status-Anzeige
- **TooltipHelp.vue** (2.4KB, 81 Zeilen): Kontextuelle Hilfe
- **ContextMenu.vue** (5.3KB, 192 Zeilen): Kontext-Menüs
- **LoadingStates.vue** (7.7KB, 346 Zeilen): Lade-Zustände und Animationen
- **AccessibleIcon.vue** (509B, 34 Zeilen): Barrierefreie Icons
- **AccessibleButton.vue** (1.0KB, 62 Zeilen): Barrierefreie Buttons
- **SafeModeBanner.vue** (1.8KB, 71 Zeilen): Safe-Mode-Benachrichtigung
- **ConnectionStatus.vue** (2.5KB, 97 Zeilen): Verbindungsstatus-Anzeige

#### **📁 Settings Components (16 Komponenten)**

Einstellungs- und Konfigurationskomponenten:

- **GodDeviceCard.vue** (31KB, 971 Zeilen): God Pi Geräte-Konfiguration
- **KaiserDeviceCard.vue** (22KB, 768 Zeilen): Kaiser Edge Controller Konfiguration
- **EspDeviceCard.vue** (23KB, 812 Zeilen): ESP32 Geräte-Konfiguration
- **DeviceCardBase.vue** (8.8KB, 333 Zeilen): Basis-Geräte-Karte
- **DeviceManagement.vue** (11KB, 408 Zeilen): Zentrale Geräte-Verwaltung
- **EspDevicePanel.vue** (36KB, 1156 Zeilen): Erweiterte ESP-Konfiguration
- **SimpleServerSetup.vue** (30KB, 923 Zeilen): Einfache Server-Einrichtung
- **LibraryManagement.vue** (8.5KB, 275 Zeilen): Bibliothek-Verwaltung
- **ZoneManagement.vue** (5.4KB, 180 Zeilen): Zonen-Management
- **SensorConfiguration.vue** (14KB, 474 Zeilen): Sensor-Konfiguration
- **AlertConfiguration.vue** (15KB, 460 Zeilen): Alert-System
- **SensorAlertConfig.vue** (9.5KB, 333 Zeilen): Sensor-Alert-Konfiguration
- **EspGrid.vue** (6.9KB, 255 Zeilen): ESP-Grid-Anzeige
- **SystemExplanationCard.vue** (5.0KB, 179 Zeilen): System-Erklärungen

**ESP-spezifische Komponenten (4 Komponenten):**

- **EspPinConfiguration.vue** (13KB, 469 Zeilen): ESP Pin-Konfiguration
- **EspActuatorConfiguration.vue** (21KB, 727 Zeilen): ESP Aktor-Konfiguration
- **EspDeviceInfo.vue** (8.1KB, 259 Zeilen): ESP Geräte-Informationen
- **EspZoneManagement.vue** (6.1KB, 202 Zeilen): ESP Zonen-Management

#### **📁 Dashboard Components (22 Komponenten)**

Dashboard- und Visualisierungskomponenten:

- **ZoneCard.vue** (35KB, 1163 Zeilen): Haupt-Zonen-Karte
- **SubZoneCard.vue** (17KB, 550 Zeilen): Subzone-Karte
- **SystemStateCard.vue** (20KB, 570 Zeilen): System-Status-Karte
- **SensorVisualization.vue** (15KB, 578 Zeilen): Sensor-Visualisierung
- **ComparisonVisualizer.vue** (13KB, 460 Zeilen): Vergleichs-Visualisierer
- **ActuatorMonitor.vue** (21KB, 707 Zeilen): Aktor-Monitoring
- **DatabaseLogsCard.vue** (25KB, 834 Zeilen): Datenbank-Logs
- **LogicTestPanel.vue** (21KB, 644 Zeilen): Logik-Test-Panel
- **DashboardControls.vue** (7.0KB, 256 Zeilen): Dashboard-Steuerung
- **ZoneCardOptimized.vue** (7.2KB, 265 Zeilen): Optimierte Zonen-Karte
- **LogicWizardEditor.vue** (12KB, 417 Zeilen): Logik-Wizard-Editor
- **LogicTemplateLibrary.vue** (13KB, 472 Zeilen): Logik-Template-Bibliothek
- **ActuatorLogicEditor.vue** (34KB, 1193 Zeilen): Aktor-Logik-Editor
- **UnifiedInteractionZone.vue** (18KB, 573 Zeilen): Einheitliche Interaktions-Zone
- **ActuatorCard.vue** (16KB, 528 Zeilen): Aktor-Karte
- **ActuatorLogicCard.vue** (9.9KB, 334 Zeilen): Aktor-Logik-Karte
- **SensorComparisonChart.vue** (14KB, 480 Zeilen): Sensor-Vergleichs-Chart
- **SensorDataVisualization.vue** (2.4KB, 93 Zeilen): Sensor-Daten-Visualisierung
- **TimeRangeSelector.vue** (8.0KB, 263 Zeilen): Zeitbereich-Auswahl
- **AutoDashboardGenerator.vue** (9.3KB, 317 Zeilen): Auto-Dashboard-Generator

**Logik-Komponenten (5 Komponenten):**

- **ActuatorLogicEditor.vue** (11KB, 363 Zeilen): Aktor-Logik-Editor
- **GlobalSensorSelect.vue** (4.9KB, 172 Zeilen): Globale Sensor-Auswahl
- **EventConfig.vue** (2.2KB, 94 Zeilen): Event-Konfiguration
- **TimerConfig.vue** (3.4KB, 138 Zeilen): Timer-Konfiguration
- **SensorConditionConfig.vue** (3.6KB, 146 Zeilen): Sensor-Bedingungs-Konfiguration

#### **📁 Debug Components (9 Komponenten)**

Entwicklungs- und Debug-Komponenten:

- **KaiserIdTestPanel.vue** (11KB, 382 Zeilen): Kaiser-ID-Tests
- **PiIntegrationPanel.vue** (19KB, 577 Zeilen): Pi-Integration-Panel
- **SystemCommandsPanel.vue** (15KB, 505 Zeilen): System-Befehle
- **WarningConfigurationPanel.vue** (12KB, 371 Zeilen): Warning-Konfiguration
- **DeviceSimulator.vue** (20KB, 598 Zeilen): Geräte-Simulator
- **InteractionLogPanel.vue** (15KB, 513 Zeilen): Interaktions-Logs
- **SensorRegistryPanel.vue** (16KB, 496 Zeilen): Sensor-Registry-Panel
- **ConfigurationPanel.vue** (7.3KB, 226 Zeilen): Konfigurations-Panel
- **MqttDebugPanel.vue** (3.4KB, 115 Zeilen): MQTT-Debug-Panel

#### **📁 Device Components (3 Komponenten)**

Geräte-spezifische Komponenten:

- **SubzoneTreeCard.vue** (6.2KB, 221 Zeilen): Subzone-Baum-Karte
- **DeviceTreeView.vue** (12KB, 399 Zeilen): Geräte-Baum-Ansicht
- **PinTreeCard.vue** (5.6KB, 214 Zeilen): Pin-Baum-Karte

#### **📁 Zones Components (1 Komponente)**

Zonen-Management-Komponenten:

- **ZoneTreeView.vue** (9.8KB, 333 Zeilen): Zonen-Baum-Ansicht

#### **📁 Layout Components (1 Komponente)**

Layout-Komponenten:

- **TopNavigation.vue** (11KB, 358 Zeilen): Top-Navigation

#### **📁 Icon Components (5 Komponenten)**

Icon-Komponenten:

- **IconCommunity.vue** (1.0KB, 8 Zeilen): Community-Icon
- **IconDocumentation.vue** (1.2KB, 8 Zeilen): Dokumentations-Icon
- **IconEcosystem.vue** (1.9KB, 8 Zeilen): Ökosystem-Icon
- **IconSupport.vue** (288B, 8 Zeilen): Support-Icon
- **IconTooling.vue** (913B, 20 Zeilen): Tooling-Icon

## 🔧 **Composables-Dokumentation**

### **📁 Composables-Struktur (7 Funktionen)**

#### **🔄 useStoreInitialization.js** (11KB, 322 Zeilen)

Zentrale Store-Initialisierung und -Koordination:

```javascript
// Store-Initialisierung mit Fehlerbehandlung
const { initializeStores, getStore } = useStoreInitialization()

// Sichere Store-Zugriffe
const mqttStore = getStore('mqtt')
const centralConfig = getStore('centralConfig')
```

**Funktionen:**

- Store-Initialisierung mit Dependency-Injection
- Sichere Store-Referenzen mit Proxy-Handling
- Fehlerbehandlung für Store-Zugriffe
- Store-Status-Monitoring

#### **📱 useResponsiveDisplay.js** (8.9KB, 325 Zeilen)

Responsive Design und Display-Logik:

```javascript
// Responsive Breakpoints
const { isMobile, isTablet, isDesktop } = useResponsiveDisplay()

// Dynamische Layout-Anpassung
const layoutClass = computed(() => {
  if (isMobile.value) return 'mobile-layout'
  if (isTablet.value) return 'tablet-layout'
  return 'desktop-layout'
})
```

**Funktionen:**

- Responsive Breakpoint-Detection
- Mobile/Desktop Layout-Switching
- Touch-Gesture-Handling
- Viewport-Optimierung

#### **🔄 useDeviceSynchronization.js** (6.1KB, 221 Zeilen)

Geräte-Synchronisation und -Management:

```javascript
// Geräte-Synchronisation
const { syncDevice, getDeviceStatus } = useDeviceSynchronization()

// ESP-Synchronisation
await syncDevice('esp_001', { type: 'sensor', gpio: 4 })
```

**Funktionen:**

- ESP-Geräte-Synchronisation
- MQTT-Topic-Management
- Geräte-Status-Monitoring
- Konfigurations-Synchronisation

#### **🏥 useDeviceHealthScore.js** (1.7KB, 72 Zeilen)

Geräte-Gesundheitsbewertung:

```javascript
// Gesundheits-Score berechnen
const { calculateHealthScore, getHealthStatus } = useDeviceHealthScore()

const healthScore = calculateHealthScore({
  connectionEstablished: true,
  lastUpdate: Date.now(),
  errorCount: 0,
})
```

**Funktionen:**

- Gesundheits-Score-Berechnung
- Geräte-Status-Bewertung
- Performance-Monitoring
- Fehler-Rate-Analyse

#### **✨ useBlinkTracker.js** (2.6KB, 96 Zeilen)

Blink-Animation und visuelle Feedback:

```javascript
// Blink-Animation für Zonenwechsel
const { startBlink, stopBlink } = useBlinkTracker()

// Visuelles Feedback bei Änderungen
startBlink('zone-card-1', { duration: 1000, color: 'success' })
```

**Funktionen:**

- Blink-Animation-Steuerung
- Visuelles Feedback-System
- Animation-Timing
- CSS-Transition-Management

#### **📡 useMqttFeedback.js** (6.0KB, 233 Zeilen)

MQTT-Feedback und -Status:

```javascript
// MQTT-Feedback-System
const { sendFeedback, getFeedbackStatus } = useMqttFeedback()

// Feedback an ESP senden
await sendFeedback('esp_001', {
  type: 'command_ack',
  status: 'success',
  message: 'Command executed successfully',
})
```

**Funktionen:**

- MQTT-Feedback-System
- Command-Acknowledgement
- Status-Tracking
- Error-Handling

#### **📊 useSensorAggregation.js** (11KB, 375 Zeilen)

Sensor-Aggregation und -Analyse:

```javascript
// Sensor-Aggregation
const { getEspAggregations, calculateWarningAggregations } = useSensorAggregation()

// Zeitfenster-basierte Aggregation
const aggregations = getEspAggregations('esp_001', 5 * 60 * 1000) // 5 Minuten

// Warning-basierte Aggregation
const warnings = calculateWarningAggregations(sensors)
```

**Funktionen:**

- Zeitfenster-basierte Aggregation
- Warning-basierte Analyse
- Sensor-Typ-spezifische Aggregation
- Performance-Optimierung
- Template-System-Integration

## 🗄️ **Stores-Dokumentation**

### **📁 Stores-Struktur (15 Stores)**

#### **⚙️ centralConfig.js** (43KB, 1380 Zeilen)

Zentrale Konfigurationsverwaltung:

```javascript
// Zentrale Konfiguration
const centralConfig = useCentralConfig()

// System-Konfiguration
centralConfig.setSystemName('Mein IoT System')
centralConfig.setKaiserId('Pi0')

// Persistierte Einstellungen
centralConfig.saveConfiguration()
```

**Funktionen:**

- System-Konfiguration
- Kaiser-ID-Management
- Persistierte Einstellungen
- Theme-Management
- Global State Management

#### **📡 mqtt.js** (119KB, 3496 Zeilen)

MQTT-Kommunikation und Kaiser-Integration:

```javascript
// MQTT-Store
const mqttStore = useMqttStore()

// Verbindung herstellen
await mqttStore.connect()

// Topic subscriben
mqttStore.subscribe('kaiser/pi0/esp/esp001/sensor/temperature')

// Nachricht senden
await mqttStore.publish('kaiser/pi0/esp/esp001/command', data)
```

**Funktionen:**

- MQTT-Client-Management
- Topic-Subscription
- Message-Publishing
- Kaiser-Integration
- Connection-Management
- Error-Handling

#### **🔄 centralDataHub.js** (26KB, 869 Zeilen)

Zentrale Daten-Koordination:

```javascript
// Central Data Hub
const centralDataHub = useCentralDataHub()

// Cached Data Access
const deviceData = centralDataHub.getCachedData('device-esp001', () => {
  return mqttStore.espDevices.get('esp001')
})

// Store-Koordination
const mqttStore = centralDataHub.mqttStore
const centralConfig = centralDataHub.centralConfig
```

**Funktionen:**

- Store-Koordination
- Performance-Caching
- System-Status-Verwaltung
- UI-Konfiguration
- Fehlerbehandlung

#### **📊 dashboardGenerator.js** (64KB, 1996 Zeilen)

Dashboard-Generierung und -Management:

```javascript
// Dashboard Generator
const dashboardGenerator = useDashboardGenerator()

// Auto-Dashboard generieren
await dashboardGenerator.generateDashboard('zone_001')

// Dashboard-Konfiguration
dashboardGenerator.setDashboardConfig({
  layout: 'grid',
  autoRefresh: true,
  refreshInterval: 5000,
})
```

**Funktionen:**

- Auto-Dashboard-Generierung
- Layout-Management
- Widget-Konfiguration
- Real-time Updates
- Performance-Optimierung

#### **📱 espManagement.js** (35KB, 1069 Zeilen)

ESP32-Geräte-Management:

```javascript
// ESP Management
const espManagement = useEspManagement()

// ESP hinzufügen
await espManagement.addEsp('esp001', {
  boardType: 'ESP32_DEVKIT',
  i2cSensors: ['BME280', 'DS18B20'],
})

// ESP-Konfiguration
const config = espManagement.getEspConfig('esp001')
```

**Funktionen:**

- ESP-Discovery
- Board-Type-Management
- I2C-Sensor-Konfiguration
- Pin-Management
- Template-System

#### **📋 sensorRegistry.js** (13KB, 433 Zeilen)

Sensor-Registry und -Verwaltung:

```javascript
// Sensor Registry
const sensorRegistry = useSensorRegistry()

// Sensor registrieren
sensorRegistry.registerSensor('esp001', {
  gpio: 4,
  type: 'DS18B20',
  name: 'Temperature Sensor',
})

// Sensoren abrufen
const sensors = sensorRegistry.getSensorsByEsp('esp001')
```

**Funktionen:**

- Sensor-Registration
- Warning-Management
- Time-Quality-Monitoring
- Sensor-Templates
- Health-Monitoring

#### **🖥️ piIntegration.js** (14KB, 498 Zeilen)

Pi-Server-Integration:

```javascript
// Pi Integration
const piIntegration = usePiIntegration()

// Library-Management
await piIntegration.installLibrary('bme280')

// Health-Monitoring
const health = await piIntegration.getHealthStatus()

// Command-Execution
await piIntegration.executeCommand('system_update')
```

**Funktionen:**

- Library-Management
- Health-Monitoring
- Command-Execution
- Server-Communication
- Error-Handling

#### **🧠 logicalAreas.js** (7.6KB, 259 Zeilen)

Logische Bereiche und -Management:

```javascript
// Logical Areas
const logicalAreas = useLogicalAreas()

// Logischen Bereich erstellen
logicalAreas.createArea('greenhouse', {
  description: 'Gewächshaus-Bereich',
  sensors: ['temperature', 'humidity'],
  actuators: ['ventilation', 'irrigation'],
})
```

**Funktionen:**

- Logische Bereichs-Definition
- Sensor-Aktor-Zuordnung
- Bereichs-Hierarchie
- Cross-ESP-Logik

#### **⏰ timeRange.js** (7.3KB, 243 Zeilen)

Zeitbereich-Management:

```javascript
// Time Range
const timeRange = useTimeRange()

// Zeitbereich setzen
timeRange.setTimeRange({
  start: new Date('2024-01-01'),
  end: new Date('2024-01-31'),
  granularity: 'hour',
})

// Zeitbereich abrufen
const range = timeRange.getCurrentRange()
```

**Funktionen:**

- Zeitbereich-Definition
- Granularität-Management
- Date-Range-Selection
- Time-Window-Optimization

#### **🗺️ zoneRegistry.js** (2.5KB, 107 Zeilen)

Zonen-Registry und -Verwaltung:

```javascript
// Zone Registry
const zoneRegistry = useZoneRegistry()

// Zone registrieren
zoneRegistry.registerZone('zone_001', {
  name: 'Gewächshaus 1',
  description: 'Hauptgewächshaus',
  subZones: ['subzone_001', 'subzone_002'],
})
```

**Funktionen:**

- Zone-Registration
- Subzone-Management
- Zone-Hierarchie
- Zone-Metadata

#### **⚡ actuatorLogic.js** (50KB, 1648 Zeilen)

Aktor-Logik und -Management:

```javascript
// Actuator Logic
const actuatorLogic = useActuatorLogic()

// Logik erstellen
await actuatorLogic.createLogic('pump_control', {
  conditions: [{ sensor: 'soil_moisture', operator: '<', value: 30 }],
  actions: [{ actuator: 'water_pump', action: 'turn_on', duration: 5000 }],
})
```

**Funktionen:**

- Logik-Definition
- Condition-Management
- Action-Execution
- Priority-Management
- Conflict-Resolution

#### **📊 databaseLogs.js** (12KB, 421 Zeilen)

Datenbank-Logs und -Management:

```javascript
// Database Logs
const databaseLogs = useDatabaseLogs()

// Logs abrufen
const logs = await databaseLogs.getLogs({
  espId: 'esp001',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  sensorType: 'temperature',
})

// CSV-Export
await databaseLogs.exportToCSV(logs, 'temperature_logs.csv')
```

**Funktionen:**

- Log-Retrieval
- Filter-Management
- CSV-Export
- Chart-Integration
- Auto-Reload

#### **🎨 theme.js** (5.3KB, 180 Zeilen)

Theme-Management:

```javascript
// Theme Management
const theme = useTheme()

// Theme wechseln
theme.setTheme('dark')

// Custom Theme
theme.setCustomTheme({
  primary: '#1976D2',
  secondary: '#424242',
  accent: '#82B1FF',
})
```

**Funktionen:**

- Theme-Switching
- Custom-Themes
- Color-Palette-Management
- Dark/Light-Mode
- Theme-Persistence

#### **🔢 counter.js** (259B, 16 Zeilen)

Legacy Counter Store:

```javascript
// Counter Store (Legacy)
const counter = useCounter()

// Counter erhöhen
counter.increment()

// Counter zurücksetzen
counter.reset()
```

**Funktionen:**

- Simple Counter
- Increment/Decrement
- Reset-Functionality

#### **💻 systemCommands.js** (6.4KB, 264 Zeilen)

System-Befehle und -Management:

```javascript
// System Commands
const systemCommands = useSystemCommands()

// Befehl ausführen
await systemCommands.executeCommand('system_restart', {
  target: 'esp001',
  timeout: 30000,
})

// Command-History
const history = systemCommands.getCommandHistory()
```

**Funktionen:**

- Command-Execution
- Command-History
- Validation
- Error-Handling
- Timeout-Management

## 📁 **Data-Struktur-Dokumentation**

### **📁 Data-Verzeichnis (1 Datei)**

#### **📋 sensorTemplates.js** (6.0KB, 236 Zeilen)

Sensor-Templates und vorkonfigurierte Setups:

```javascript
// Sensor Templates
import { sensorTemplates } from '@/data/sensorTemplates'

// Template verwenden
const greenhouseTemplate = sensorTemplates.find((t) => t.name === 'greenhouse')

// Board-spezifische Templates
const esp32Templates = sensorTemplates.filter((t) => t.boardType === 'ESP32_DEVKIT')
const xiaoTemplates = sensorTemplates.filter((t) => t.boardType === 'XIAO_ESP32_C3')
```

**Funktionen:**

- Vorkonfigurierte Sensor-Setups
- Board-Type-spezifische Templates
- I2C-Sensor-Templates
- Template-Validierung
- Anwendungsfall-Templates

**Template-Kategorien:**

- **Gewächshaus-Templates**: Temperatur, Luftfeuchtigkeit, Bewässerung
- **Bewässerungs-Templates**: Bodenfeuchtigkeit, Pumpen-Steuerung
- **Klimasteuerungs-Templates**: Lüftung, Heizung, Kühlung
- **I2C-Sensor-Templates**: BME280, SHT30, TSL2561
- **Board-spezifische Templates**: ESP32 DevKit, XIAO ESP32-C3

## 🔌 **Services-Dokumentation**

### **📁 Services-Verzeichnis (1 Service)**

#### **🌐 apiService.js** (7.9KB, 272 Zeilen)

API-Service für Backend-Kommunikation:

```javascript
// API Service
import { apiService } from '@/services/apiService'

// HTTP-Requests
const response = await apiService.get('/api/sensors')
const data = await apiService.post('/api/configuration', config)

// Circuit Breaker Pattern
apiService.setCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 60000,
})
```

**Funktionen:**

- HTTP-Client-Management
- Circuit Breaker Pattern
- Error-Handling
- Request-Interceptors
- Response-Transformers

## 📋 **Schemas-Dokumentation**

### **📁 Schemas-Verzeichnis (1 Schema)**

#### **🔧 logic.schema.json** (4.2KB, 163 Zeilen)

JSON-Schema für Aktor-Logik-Validierung:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Actuator Logic Schema",
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "conditions": { "type": "array" },
    "actions": { "type": "array" },
    "priority": { "type": "integer" }
  }
}
```

**Funktionen:**

- Logik-Validierung
- Schema-Enforcement
- Type-Checking
- Error-Reporting

## 🧪 **Tests-Dokumentation**

### **📁 Tests-Verzeichnis**

#### **📁 Unit Tests**

Unit-Tests für einzelne Komponenten und Funktionen:

```bash
src/tests/unit/
├── components/          # Komponenten-Tests
├── stores/             # Store-Tests
├── composables/        # Composable-Tests
├── utils/              # Utility-Tests
└── services/           # Service-Tests
```

#### **📋 README.md** (4.2KB, 214 Zeilen)

Test-Dokumentation und -Anleitung:

```javascript
// Test-Beispiel
import { mount } from '@vue/test-utils'
import ZoneCard from '@/components/dashboard/ZoneCard.vue'

describe('ZoneCard', () => {
  it('renders zone information correctly', () => {
    const wrapper = mount(ZoneCard, {
      props: { zoneId: 'zone_001' },
    })
    expect(wrapper.text()).toContain('Zone 001')
  })
})
```

**Test-Kategorien:**

- **Unit Tests**: Einzelne Komponenten und Funktionen
- **Integration Tests**: Komponenten-Interaktionen
- **E2E Tests**: End-to-End-Szenarien
- **Performance Tests**: Performance-Metriken

## 🌐 **Public-Verzeichnis-Dokumentation**

### **📁 Public-Verzeichnis**

Statische Assets und Konfigurationen:

#### **🎨 favicon.ico** (4.2KB)

Browser-Favicon für die Anwendung:

```html
<!-- HTML-Integration -->
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
```

**Funktionen:**

- Browser-Tab-Icon
- Bookmark-Icon
- Mobile-Home-Screen-Icon

## 📚 **Docs-Verzeichnis-Dokumentation**

### **📁 Docs-Verzeichnis**

Projekt-Dokumentation und -Architektur:

#### **🔌 PORT_ARCHITECTURE.md** (8.0KB, 312 Zeilen)

Port-Architektur-Dokumentation:

```markdown
# Port Architecture Documentation

## ESP32 Pin Configuration

- GPIO 2: I2C SDA
- GPIO 15: I2C SCL
- GPIO 4: DS18B20 Temperature Sensor
- GPIO 5: Water Pump Actuator

## Board-Specific Configurations

- ESP32 DevKit: Full GPIO support
- XIAO ESP32-C3: Limited GPIO, I2C focus
```

**Inhalte:**

- Pin-Konfigurationen
- Board-spezifische Einstellungen
- I2C-Bus-Konfiguration
- Sensor-Aktor-Zuordnung

## ⚙️ **Konfigurationsdateien-Dokumentation**

### **📁 Root-Level Konfigurationen**

#### **🔧 vite.config.js** (494B, 21 Zeilen)

Vite Build-Konfiguration:

```javascript
// Vite Configuration
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
})
```

#### **🎨 tailwind.config.js** (3.7KB, 138 Zeilen)

Tailwind CSS-Konfiguration:

```javascript
// Tailwind Configuration
module.exports = {
  content: ['./src/**/*.{vue,js,ts}'],
  theme: {
    extend: {
      colors: {
        primary: '#1976D2',
        secondary: '#424242',
      },
    },
  },
  plugins: [],
}
```

#### **🔧 postcss.config.js** (80B, 7 Zeilen)

PostCSS-Konfiguration:

```javascript
// PostCSS Configuration
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

#### **🔍 eslint.config.js** (596B, 27 Zeilen)

ESLint-Konfiguration:

```javascript
// ESLint Configuration
export default [
  {
    files: ['**/*.{js,vue}'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-unused-vars': 'warn',
    },
  },
]
```

#### **⚙️ jsconfig.json** (140B, 9 Zeilen)

JavaScript-Konfiguration:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

#### **📦 package.json** (1.0KB, 43 Zeilen)

NPM Package-Konfiguration:

```json
{
  "name": "growy-frontend",
  "version": "3.8.0",
  "dependencies": {
    "vue": "^3.5.13",
    "vuetify": "^3.8.10",
    "pinia": "^3.0.3"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### **🐳 ecosystem.config.cjs** (696B, 31 Zeilen)

PM2-Konfiguration für Production-Deployment:

```javascript
// PM2 Configuration
module.exports = {
  apps: [
    {
      name: 'growy-frontend',
      script: 'npm',
      args: 'run preview',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
}
```

## 📊 **Projekt-Statistiken**

### **📈 Code-Metriken**

- **Gesamtzeilen**: ~50,000+ Zeilen Code
- **Komponenten**: 100+ Vue.js Komponenten
- **Stores**: 15 Pinia Stores
- **Composables**: 7 Composable Functions
- **Services**: 1 API Service
- **Schemas**: 1 JSON Schema
- **Tests**: Unit Tests + Dokumentation
- **Dokumentation**: 30+ Markdown-Dateien

### **🏗️ Architektur-Übersicht**

- **Frontend-Framework**: Vue.js 3.5.13
- **UI-Framework**: Vuetify 3.8.10
- **State-Management**: Pinia 3.0.3
- **Build-Tool**: Vite
- **CSS-Framework**: Tailwind CSS
- **MQTT-Client**: MQTT.js
- **HTTP-Client**: Axios
- **Testing**: Vue Test Utils + Vitest

### **🎯 Funktionsbereiche**

- **Dashboard**: Real-time Monitoring und Visualisierung
- **Settings**: Umfassende System-Konfiguration
- **Zones**: Hierarchische Zonen-Verwaltung
- **Devices**: ESP32-Geräte-Management
- **Debug**: Entwicklungs- und Debug-Tools
- **Logic**: Aktor-Logik und -Steuerung
- **Logs**: Datenbank-Logs und -Analyse

### **🔄 Integration-Punkte**

- **MQTT-Broker**: Echtzeit-Kommunikation
- **Kaiser Edge Controller**: Edge-Computing
- **God Pi Server**: Zentrale Datenverwaltung
- **ESP32-Geräte**: Sensor- und Aktor-Netzwerk
- **Database**: Logging und Persistierung
- **API-Services**: Backend-Kommunikation

Diese vollständige Dokumentation spiegelt die aktuelle Projektstruktur exakt wider und bietet Entwicklern eine umfassende Übersicht über alle Komponenten, Stores, Composables und andere wichtige Strukturen des Growy Dashboard v3.8.0.
