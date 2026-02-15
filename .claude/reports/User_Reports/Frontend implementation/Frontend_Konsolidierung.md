# AutomationOne – Frontend Restructuring Blueprint

**Version:** 1.0  
**Datum:** 2026-02-11  
**Scope:** El Frontend (Vue 3 / TypeScript / Pinia / Tailwind)  
**Ziel:** Professionelle Neustrukturierung des bestehenden Frontends bei Beibehaltung des Iridescent-Designs, der Navigationslogik und aller funktionalen Errungenschaften.

---

## 0. Leseanleitung für den ausführenden Agenten

Dieses Dokument ist ein Auftrag. Es beschreibt den **Soll-Zustand** der Frontend-Architektur. Bevor du irgendetwas schreibst oder veränderst, musst du den kompletten bestehenden Frontendcode durchgehen und exakt verstehen, was es aktuell gibt. Dann ordnest du jedes existierende Element in die hier beschriebene Zielstruktur ein.

**Vorgehen:**
1. Lies `El Frontend/src/` vollständig – jede View, jede Komponente, jeden Store, jede Composable, jeden Utility, jede Type-Definition, jeden API-Client.
2. Erstelle ein IST-→-SOLL-Mapping: Wo lebt jedes Element heute, wo soll es hin?
3. Identifiziere sich wiederholende Patterns (Glassmorphism-Panels, Status-Badges, Card-Layouts, Modal-Wrapper, Form-Fields) und extrahiere sie als Design-Primitives.
4. Implementiere die Migration inkrementell – eine Domäne nach der anderen, Tests dazwischen.

---

## 1. Architektur-Entscheidung: Modular-Domain-Struktur

### Warum nicht Flat, Atomic oder Micro-Frontends?

Das aktuelle Frontend hat ~70 Komponenten, 5 Stores, 8 Composables, 16 API-Module, 14 Utilities und 11 aktive Views. Es ist zu groß für eine flache Struktur, aber zu kohärent für Micro-Frontends. Die reine Atomic-Design-Hierarchie (Atoms/Molecules/Organisms) erzeugt künstliche Trennungen, die bei IoT-Dashboards wenig Mehrwert bringen – ein `SensorSatellite` ist weder klar ein Molecule noch ein Organism.

**Gewählt: Domain-Modular mit Shared Design System**  

Das bedeutet: Feature-Bereiche (Dashboard, Monitoring, Regeln, etc.) sind eigenständige Module mit eigenen Komponenten, Composables und Types. Alles was sich wiederholt – Design-Primitives, Layout-Shells, Toast-System, Status-Indikatoren – lebt in einem zentralen `shared/`-Layer, der von allen Modulen importiert wird.

**Vorteile für AutomationOne:**
- Jede Navigations-Sektion entspricht einem Modul – intuitiv für neue Entwickler.
- Design-Tokens und wiederverwendbare Komponenten werden einmal definiert und überall konsumiert.
- Module können unabhängig getestet, lazy-loaded und erweitert werden.
- Passt zur server-zentrischen Architektur: Jedes Modul kapselt seine eigene API/WebSocket-Kommunikation.

---

## 2. Ziel-Dateibaum

```
src/
├── app/                              # App-Shell & globale Konfiguration
│   ├── App.vue                       # Root-Komponente, Layout-Routing
│   ├── main.ts                       # Entry, Plugin-Registrierung
│   ├── router/
│   │   ├── index.ts                  # Route-Definitionen
│   │   └── guards.ts                 # Auth, Admin, Setup Guards (extrahiert)
│   └── plugins/                      # Drittanbieter-Plugin-Setup (falls nötig)
│
├── shared/                           # ── DESIGN SYSTEM & SHARED LAYER ──
│   ├── design/                       # Design-Primitives (das Herzstück der Abstraktion)
│   │   ├── tokens/
│   │   │   ├── colors.ts             # Iridescent-Palette, Status-Farben, Zonen-Palette als JS-Konstanten
│   │   │   ├── spacing.ts            # Spacing-Scale
│   │   │   ├── typography.ts         # Font-Sizes, Weights
│   │   │   └── animations.ts         # Transition-Durations, Easing-Curves, Shimmer-Config
│   │   ├── primitives/               # Kleinste wiederverwendbare UI-Bausteine
│   │   │   ├── BaseButton.vue        # Varianten: primary, secondary, danger, ghost, icon-only
│   │   │   ├── BaseCard.vue          # Glass-Panel mit konfigurierbarem Padding, Border, Glow
│   │   │   ├── BaseInput.vue         # Text, Number, Select – einheitliches Styling
│   │   │   ├── BaseToggle.vue        # Switch mit Label
│   │   │   ├── BaseBadge.vue         # Status-Pills (online/offline/pending/error/mock/real)
│   │   │   ├── BaseModal.vue         # Teleport-basierter Modal-Wrapper
│   │   │   ├── BasePopover.vue       # Floating-UI Popover (für Settings-Overlays)
│   │   │   ├── BaseTooltip.vue       # Hover-Tooltip
│   │   │   ├── BaseSkeleton.vue      # Loading-Placeholder
│   │   │   ├── BaseIcon.vue          # Icon-Wrapper (Lucide oder eigenes Set)
│   │   │   └── BaseSpinner.vue       # Loading-Spinner
│   │   ├── patterns/                 # Zusammengesetzte UI-Patterns
│   │   │   ├── DataTable.vue         # Sortierbar, filterbar, paginiert
│   │   │   ├── EmptyState.vue        # "Keine Daten"-Ansicht mit Aktion
│   │   │   ├── ConfirmDialog.vue     # Bestätigungsdialog (Delete, Disconnect, etc.)
│   │   │   ├── FormSection.vue       # Label + Input + Validation + Error
│   │   │   ├── StatusIndicator.vue   # Dot + Text, animiert bei live-Daten
│   │   │   ├── MetricCard.vue        # Wert + Label + Trend-Pfeil (für System-Stats)
│   │   │   ├── TabContainer.vue      # Tab-Navigation (wiederverwendbar für alle Bereiche)
│   │   │   └── SearchFilter.vue      # Suchfeld + Filter-Chips
│   │   └── layout/                   # Seiten-Rahmen
│   │       ├── AppShell.vue          # Sidebar + TopBar + Content-Area
│   │       ├── Sidebar.vue           # Navigationsleiste links
│   │       ├── TopBar.vue            # Top-Navigation mit Breadcrumbs, User-Menu
│   │       └── ContentArea.vue       # Scrollbarer Content mit optionaler Action-Bar
│   │
│   ├── composables/                  # Globale Composables
│   │   ├── useWebSocket.ts           # WebSocket-Subscription (bestehend, refactored)
│   │   ├── useToast.ts               # Toast-System – zentrales Notification-Management
│   │   ├── useAuth.ts                # Auth-State, Token-Handling
│   │   ├── useDragState.ts           # Globaler Drag-State (bestehendes Dual-System)
│   │   ├── useBreakpoints.ts         # Responsive-Breakpoints
│   │   ├── useKeyboard.ts            # Keyboard-Shortcuts
│   │   └── useGrafana.ts             # Grafana-Panel-Embedding (NEU – siehe Abschnitt 7)
│   │
│   ├── services/                     # Singleton-Services
│   │   ├── websocket.ts              # WebSocket-Singleton (bestehend)
│   │   ├── api/                      # API-Client-Layer
│   │   │   ├── client.ts             # Axios-Instanz, Interceptors, Token-Refresh
│   │   │   ├── esp.api.ts            # ESP-Device CRUD
│   │   │   ├── sensors.api.ts        # Sensor CRUD & Daten
│   │   │   ├── actuators.api.ts      # Aktuator CRUD & Steuerung
│   │   │   ├── zones.api.ts          # Zonen-Management
│   │   │   ├── auth.api.ts           # Login, Register, Refresh
│   │   │   ├── users.api.ts          # User-Management
│   │   │   ├── system.api.ts         # System-Config, Health
│   │   │   ├── logic.api.ts          # Regel-Engine
│   │   │   ├── monitoring.api.ts     # Logs, Events, Metriken
│   │   │   └── index.ts              # Re-Export aller Module
│   │   └── grafana.ts                # Grafana HTTP API Client (NEU)
│   │
│   ├── stores/                       # Pinia Stores – global geteilt
│   │   ├── auth.store.ts             # Auth-State
│   │   ├── esp.store.ts              # ESP-Devices, Sensors, Actuators (Kern-Store, ~2500 Zeilen → aufteilen)
│   │   ├── ui.store.ts               # UI-State: Sidebar-Collapse, Active-Tab, Theme
│   │   ├── notification.store.ts     # Toast-Queue, Unread-Count
│   │   └── system.store.ts           # System-Health, Server-Status
│   │
│   ├── types/                        # Globale TypeScript-Definitionen
│   │   ├── esp.types.ts              # ESPDevice, MockESP, Sensor, Actuator, QualityLevel
│   │   ├── websocket.types.ts        # MessageType, alle 26 Event-Typen
│   │   ├── logic.types.ts            # LogicRule, Conditions, Actions
│   │   ├── gpio.types.ts             # GPIO-Belegung
│   │   ├── system.types.ts           # SystemState, HealthStatus
│   │   └── common.types.ts           # Pagination, ApiResponse, SelectOption, etc.
│   │
│   └── utils/                        # Pure Functions
│       ├── formatters.ts             # Datum, Zahlen, Bytes, Dauer
│       ├── validators.ts             # Form-Validierung
│       ├── color.ts                  # Zonen-Farb-Hash, Iridescent-Gradient-Generator
│       ├── device.ts                 # Device-Helfer (Status-Bestimmung, Sorting)
│       └── quality.ts                # QualityLevel-Berechnungen
│
├── modules/                          # ── FEATURE-MODULE ──
│   │
│   ├── dashboard/                    # Tab 1: Dashboard
│   │   ├── DashboardView.vue         # View-Einstieg, registriert im Router
│   │   ├── components/
│   │   │   ├── ActionBar.vue         # Status-Pills, Filter, View-Umschaltung
│   │   │   ├── ZoneGroupsContainer.vue
│   │   │   ├── ZoneGroup.vue         # VueDraggable-Wrapper
│   │   │   ├── orbital/
│   │   │   │   ├── ESPOrbitalLayout.vue   # 3-Spalten-Layout (Sensoren | ESP | Aktuatoren)
│   │   │   │   ├── ESPCard.vue            # Zentrale ESP-Karte mit Status, Chart, Settings
│   │   │   │   ├── SensorSatellite.vue    # Sensor-Anzeige mit Drag-Source
│   │   │   │   ├── ActuatorSatellite.vue  # Aktuator-Anzeige mit Steuerung
│   │   │   │   └── ConnectionOverlay.vue  # SVG Cross-ESP-Verbindungslinien
│   │   │   ├── sidebar/
│   │   │   │   ├── ComponentSidebar.vue   # Komponenten-Sidebar rechts
│   │   │   │   └── UnassignedDropBar.vue  # Drop-Zone für unzugeordnete Geräte
│   │   │   ├── panels/
│   │   │   │   ├── PendingDevicesPanel.vue # Slide-over für ausstehende Gerätegenehmigungen
│   │   │   │   ├── ESPSettingsPopover.vue  # Inline-Einstellungen pro ESP
│   │   │   │   ├── SensorDetailPanel.vue   # Sensor-Konfiguration & Live-Daten
│   │   │   │   └── ActuatorControlPanel.vue # Aktuator-Steuerung
│   │   │   └── charts/
│   │   │       ├── SensorChart.vue         # Eingebetteter Chart (Variante A: eigener Chart)
│   │   │       └── GrafanaPanelEmbed.vue   # Eingebetteter Grafana-Panel (Variante B)
│   │   ├── composables/
│   │   │   ├── useDashboardLayout.ts      # Layout-Berechnungen, Zone-Positioning
│   │   │   ├── useOrbitalDrag.ts          # Orbital-spezifische Drag-Logik
│   │   │   └── useDeviceApproval.ts       # Pending-Approval-Workflow
│   │   └── dashboard.types.ts             # Dashboard-spezifische Typen
│   │
│   ├── components/                   # Tab 2: Geräteverwaltung
│   │   ├── ComponentsView.vue
│   │   ├── components/
│   │   │   ├── DeviceLibrary.vue          # Übersicht aller bekannten Sensor/Aktor-Typen
│   │   │   ├── DeviceDetailCard.vue       # Einzelansicht mit Spezifikationen
│   │   │   ├── LibraryManager.vue         # Upload/Verwaltung von Geräte-Libraries
│   │   │   ├── DeviceInfoForm.vue         # Optionale Herstellerinformationen
│   │   │   └── GpioOverview.vue           # GPIO-Belegungs-Übersicht pro ESP
│   │   ├── composables/
│   │   │   └── useDeviceLibrary.ts        # CRUD für Geräte-Libraries
│   │   └── components.types.ts
│   │   # HINWEIS: Speicherkonzept für Gerätedokumente klären:
│   │   #   Option A: DB-Eintrag mit Dateipfad → Datei im Server-Filesystem
│   │   #   Option B: DB-BLOB (nur für kleine Dateien sinnvoll)
│   │   #   Option C: S3-kompatible Speicherung (MinIO-Container) mit DB-Referenz
│   │   # Empfehlung: Option A für MVP, Option C für Skalierung.
│   │
│   ├── rules/                        # Tab 3: Automatisierungsregeln
│   │   ├── RulesView.vue
│   │   ├── components/
│   │   │   ├── RuleCanvas.vue             # Drag-and-Drop-Canvas für visuelle Regelverknüpfung
│   │   │   ├── RuleNode.vue               # Einzelner Knoten (Trigger, Bedingung, Aktion)
│   │   │   ├── RuleEdge.vue               # Verbindungslinie zwischen Knoten (SVG Bézier)
│   │   │   ├── RuleNodeConfig.vue         # Konfigurationspanel pro Knoten
│   │   │   ├── RuleToolbar.vue            # Palette verfügbarer Knoten-Typen
│   │   │   └── RuleTestPanel.vue          # Simulation einer Regel-Ausführung
│   │   ├── composables/
│   │   │   ├── useRuleCanvas.ts           # Canvas-Zoom, Pan, Grid-Snap
│   │   │   └── useRuleValidation.ts       # Zyklen-Erkennung, fehlende Verbindungen
│   │   └── rules.types.ts
│   │   # HINWEIS: Library-Evaluierung nötig für den Canvas:
│   │   #   - Vue Flow (https://vueflow.dev) – Vue-nativer Node-Graph-Editor
│   │   #   - Rete.js – Framework für visuelle Programmierung
│   │   #   - Eigenlösung mit SVG + useDrag (nur bei sehr spezifischen Anforderungen)
│   │   # Empfehlung: Vue Flow – aktiv maintained, TypeScript, Vue 3 native.
│   │
│   ├── monitoring/                   # Tab 4: System Monitor
│   │   ├── MonitoringView.vue        # Tab-Container für Sub-Bereiche
│   │   ├── components/
│   │   │   ├── tabs/
│   │   │   │   ├── HealthOverview.vue     # System-Gesundheit auf einen Blick
│   │   │   │   ├── EventsLog.vue          # Echtzeit-Event-Stream (WebSocket)
│   │   │   │   ├── MqttTraffic.vue        # MQTT-Message-Inspector
│   │   │   │   ├── ServerLogs.vue         # Server-Log-Viewer (Loki-Daten)
│   │   │   │   ├── DatabaseStatus.vue     # DB-Verbindung, Tabellengrößen, Abfragen
│   │   │   │   └── GrafanaDashboards.vue  # Eingebettete Grafana-Dashboards (NEU)
│   │   │   ├── MetricsSummary.vue         # Kompakte Metriken-Leiste (CPU, RAM, Requests)
│   │   │   └── LogFilter.vue             # Filter für Level, Service, Zeitraum
│   │   ├── composables/
│   │   │   ├── useSystemHealth.ts         # Polling/WS für Health-Daten
│   │   │   ├── useLogStream.ts            # Loki LogQL via Backend-Proxy
│   │   │   └── useMetrics.ts              # Prometheus-Metriken via Backend-Proxy
│   │   └── monitoring.types.ts
│   │
│   ├── users/                        # Tab 5: Benutzerverwaltung
│   │   ├── UsersView.vue
│   │   ├── components/
│   │   │   ├── UserTable.vue              # Nutzt shared/patterns/DataTable
│   │   │   ├── UserForm.vue               # Erstellen/Bearbeiten
│   │   │   ├── RoleManager.vue            # Rollenzuweisung
│   │   │   └── UserProfile.vue            # Eigenes Profil bearbeiten
│   │   └── users.types.ts
│   │
│   ├── system/                       # Tab 6: Systemkonfiguration
│   │   ├── SystemView.vue
│   │   ├── components/
│   │   │   ├── GeneralSettings.vue        # Systemname, Zeitzone, Sprache
│   │   │   ├── NetworkSettings.vue        # MQTT-Broker-Config, API-URLs
│   │   │   ├── SecuritySettings.vue       # Token-Lifetime, Password-Policy
│   │   │   ├── BackupSettings.vue         # DB-Backup, Export/Import
│   │   │   └── DockerStatus.vue           # Container-Übersicht (readonly)
│   │   └── system.types.ts
│   │
│   ├── maintenance/                  # Tab 7: Wartung
│   │   ├── MaintenanceView.vue
│   │   ├── components/
│   │   │   ├── FirmwareUpdater.vue        # OTA-Update-Interface
│   │   │   ├── DeviceDiagnostics.vue      # Per-ESP Diagnose (Heap, RSSI, Uptime)
│   │   │   ├── SystemCleanup.vue          # Log-Rotation, DB-Vacuum, Cache-Clear
│   │   │   └── AuditLog.vue              # Änderungsprotokoll
│   │   └── maintenance.types.ts
│   │
│   ├── load-test/                    # Tab 8: Last-Test
│   │   ├── LoadTestView.vue
│   │   ├── components/
│   │   │   ├── TestConfigurator.vue       # Parameter-Setup
│   │   │   ├── TestRunner.vue             # Ausführung & Live-Fortschritt
│   │   │   └── TestResults.vue            # Ergebnis-Visualisierung
│   │   └── load-test.types.ts
│   │
│   └── auth/                         # Login/Register (kein Tab, aber eigenes Modul)
│       ├── LoginView.vue
│       ├── RegisterView.vue
│       ├── SetupView.vue             # Erst-Einrichtung
│       └── components/
│           └── AuthForm.vue           # Shared Login/Register-Formular-Logik
│
├── styles/                           # Globale Styles
│   ├── main.css                      # Entry – importiert alles
│   ├── tokens.css                    # CSS Custom Properties (Iridescent-Palette, Status-Farben)
│   ├── glass.css                     # Glassmorphism-Utilities (.glass-panel, .glass-overlay, etc.)
│   ├── animations.css                # Shimmer, Pulse, Fade-Transitions
│   └── tailwind.css                  # Tailwind Directives
│
└── tests/                            # Test-Infrastruktur
    ├── setup.ts                      # Vitest Global Setup
    ├── helpers/                      # Test-Utilities, Mocks, Factories
    └── e2e/                          # Playwright-Tests (Cross-Modul)
```

---

## 3. Design-System: Zentrale Abstraktion der wiederkehrenden Elemente

### 3.1 Das Problem heute

Im aktuellen Code wiederholen sich folgende Patterns dutzendweise mit leichten Variationen:

- **Glass-Panel-Container** mit `backdrop-blur`, transparentem Hintergrund und Border-Gradient – teilweise inline, teilweise als Klasse, teilweise als Tailwind-Ketten.
- **Status-Badges** (online/offline/pending/error) mit je eigenem Farbcode, aber ohne einheitliche Komponente.
- **Card-Layouts** die in ESP-Cards, Sensor-Cards, Aktor-Cards, Metric-Cards fast identisch aufgebaut sind.
- **Modal/Popover-Wrapper** die jeweils eigene Teleport- und Click-Outside-Logik implementieren.
- **Form-Felder** die Validierung, Error-Anzeige und Styling jeweils individuell lösen.

### 3.2 Soll-Zustand

Jeder dieser Patterns wird **genau einmal** als Primitive oder Pattern definiert. Module importieren und konfigurieren diese via Props/Slots.

**Beispiel-API für `BaseCard`:**
```vue
<BaseCard
  variant="glass"          <!-- glass | solid | outline -->
  :glow="isOnline"         <!-- Iridescent Glow-Effekt -->
  :padding="'lg'"          <!-- sm | md | lg | xl -->
  :interactive="true"      <!-- Hover-Effekt, Cursor-Pointer -->
>
  <template #header>...</template>
  <template #default>...</template>
  <template #footer>...</template>
</BaseCard>
```

**Beispiel-API für `BaseBadge`:**
```vue
<BaseBadge status="online" />      <!-- grün, pulsierender Dot -->
<BaseBadge status="error" />       <!-- rot -->
<BaseBadge status="pending" />     <!-- gelb, animiert -->
<BaseBadge variant="mock" />       <!-- lila (#a78bfa) -->
<BaseBadge variant="real" />       <!-- cyan (#22d3ee) -->
```

### 3.3 Aufgabe für den Agenten

1. **Grep** alle Stellen im Code, an denen `backdrop-blur`, `glass`, `bg-opacity`, Gradient-Border oder ähnliche Glassmorphism-Styles direkt verwendet werden.
2. **Katalogisiere** alle Varianten (welche Blur-Stärken, welche Opacities, welche Borders).
3. **Extrahiere** die häufigsten 3-4 Varianten als `BaseCard`-Varianten und die Glassmorphism-Utilities als CSS-Klassen in `styles/glass.css`.
4. **Migriere** alle Vorkommen auf die neue Komponente – eine View nach der anderen, mit Test dazwischen.

Dasselbe Vorgehen für: Status-Badges, Modals, Popovers, Form-Felder, Tabellen, leere Zustände.

---

## 4. Modulbeschreibungen – Was rein muss und wie

### 4.1 Dashboard

**Status:** Kernstück des Frontends. Existiert funktional, muss strukturell aufgeräumt werden.

**Was es heute kann und behalten soll:**
- ESP-Orbital-Layout mit 3-Spalten-Anordnung (Sensoren links, ESP mitte, Aktuatoren rechts)
- Zonen-Gruppierung mit Drag-and-Drop (VueDraggable) zum Umordnen
- Inline-Einstellungsfenster pro ESP (ESPSettingsPopover)
- Pending-Device-Approval (Slide-Over-Panel)
- Mock- und Real-ESP-Unterscheidung (lila vs. cyan Badge)
- Component-Sidebar zum Zuweisen neuer Sensoren/Aktuatoren
- Cross-ESP-Verbindungslinien (SVG Overlay)
- Sensor-Drag auf Chart-Panel zum Öffnen eines Diagramms

**Was sich ändern muss:**
- Alle Card-Varianten auf `BaseCard` umstellen.
- Alle Status-Anzeigen auf `BaseBadge` + `StatusIndicator` vereinheitlichen.
- Settings-Popover auf `BasePopover` mit wiederverwendbarer Form-Logik.
- Pending-Device-Approval auf `BaseModal` mit `ConfirmDialog` für Accept/Reject.
- Chart in ESP-Card: Hier Grafana evaluieren (siehe Abschnitt 7) oder alternativ Chart.js/Recharts für schnelle Inline-Charts, Grafana für historische Deep-Dives.
- **Pending-State-Anzeige:** Wenn ein Sensor zugewiesen wird, darf die UI den Zustand nicht sofort als "aktiv" zeigen. Der Server muss erst die ESP-Bestätigung abwarten. Die UI zeigt "pending" mit Spinner bis zur WebSocket-Bestätigung oder Timeout.
- Zonen-/Subzonen-Ansicht konsolidieren: Container-Darstellung mit Verbindungslinien zwischen Zonen. Info-Tooltip auf der Linie (z.B. Latenz, Datenrate).

### 4.2 Komponenten (Geräteverwaltung)

**Status:** Noch nicht ausgebaut. Muss als vollständiger Tab existieren.

**Inhalt:**
- **Geräte-Library:** Katalog aller bekannten Sensor- und Aktor-Typen mit Hersteller, Modell, Messbereich, Kommunikationsprotokoll, GPIO-Anforderungen.
- **Library-Management:** Neue Geräte-Typen anlegen, bearbeiten, löschen. Optional: Datenblatt-Upload (PDF).
- **GPIO-Übersicht:** Pro ESP: Welcher Pin ist belegt, welcher frei, welcher System-reserviert.
- **Speicherkonzept:** Gerätedefinitionen (JSON-Schema) in der DB. Datei-Anhänge (PDFs, Datenblätter) als Dateien im Server-Filesystem mit DB-Referenz auf den Pfad. Später optional MinIO für Skalierung.

**Aufgabe:** Agent muss prüfen, ob es bereits Komponenten oder API-Endpunkte gibt, die Teile davon abdecken (z.B. GPIO-Status-API). Diese einbinden statt neu schreiben.

### 4.3 Regeln (Automatisierungslogik)

**Status:** Bestehende Types (`logic.types.ts`) und ein einfacher Regel-Editor. Muss zu einem visuellen Flow-Editor ausgebaut werden.

**Zielkonzept:**
Ein Canvas, auf dem der User Knoten platziert und mit Verbindungslinien verknüpft. Knotentypen: **Trigger** (Sensor-Wert überschreitet Schwelle, Zeitplan, manuell), **Bedingung** (UND/ODER-Verknüpfung, Wertvergleich), **Aktion** (Aktuator schalten, Benachrichtigung senden, Sequenz starten). Jeder Knoten hat ein Konfigurationspanel, das sich bei Klick öffnet.

**Library-Empfehlung:** Vue Flow (`vueflow.dev`) – bietet Minimap, Controls, Node-Types, Edge-Types, TypeScript-Support. Aktiv maintained (>5k GitHub Stars, regelmäßige Releases).

**Fallback:** Eigenlösung mit SVG + native Drag nur wenn Vue Flow zu viele Einschränkungen hat. Dann: `useRuleCanvas`-Composable mit eigenem State-Management für Nodes/Edges.

### 4.4 System Monitor

**Status:** Existiert mit mehreren Tabs (Events, Health, Database, MQTT-Traffic, Server-Logs). Jeder Tab hat eigene Komponenten. Muss konsolidiert und auf Grafana-Integration geprüft werden.

**Aktueller Tab-Bestand (Agent: bitte verifizieren und ergänzen):**
- Events-Tab: Echtzeit-Event-Log via WebSocket
- Health-Tab: System-Gesundheitsübersicht
- Database-Tab: DB-Status und Abfragen
- MQTT-Traffic-Tab: MQTT-Message-Inspector
- Server-Logs-Tab: Log-Viewer

**Konsolidierung:**
- Alle Tabs behalten, aber auf gemeinsame Patterns aufbauen: `TabContainer` aus shared, `DataTable` für tabellarische Daten, `LogFilter` als wiederverwendbare Filterleiste.
- Wiederholende Muster identifizieren (z.B. jeder Tab hat eigenes Polling → vereinheitlichen über Composables).
- **Neuer Tab: Grafana Dashboards** – Eingebettete Grafana-Panels für historische Metriken und Logs (siehe Abschnitt 7).

### 4.5 Benutzer / System / Wartung / Last-Test

**Status:** Diese Tabs existieren in unterschiedlichen Ausbaustufen. Sie teilen sich viele Patterns (Tabellen, Formulare, Settings-Layouts).

**Konsolidierungs-Prinzip:** Jeder wird ein eigenes Modul, aber alle konsumieren dieselben `DataTable`, `FormSection`, `BaseCard`, `ConfirmDialog` Patterns. Kein Copy-Paste von Layout-Code. Wenn ein Formular-Layout in Users funktioniert, muss es identisch in System-Settings wiederverwendbar sein.

**Aufgabe für den Agenten:** Alle vier Module durchgehen, gemeinsame Strukturen identifizieren, in shared Patterns extrahieren, Module auf diese Patterns umstellen.

---

## 5. Store-Refactoring: ESP-Store aufteilen

Der `esp.store.ts` ist mit ~2500 Zeilen der größte einzelne Dateipunkt. Er verwaltet Devices, Sensors, Actuators, WebSocket-Handler, Zonen, Drag-State und mehr.

**Aufteilungsstrategie:**
```
stores/
├── esp.store.ts          → Nur noch ESPDevice-CRUD, Fetch, WebSocket-Setup
├── sensor.store.ts       → Sensor-spezifischer State und Aktionen (NEU, extrahiert)
├── actuator.store.ts     → Aktuator-spezifischer State und Aktionen (NEU, extrahiert)
├── zone.store.ts         → Zonen-Zuordnung und Zonen-CRUD (NEU, extrahiert)
```

Pinia erlaubt Cross-Store-Zugriff (`useEspStore()` innerhalb von `useSensorStore()`), also keine funktionale Einschränkung. Die WebSocket-Handler bleiben im ESP-Store als Dispatcher, der eingehende Events an den jeweiligen Sub-Store weiterleitet.

---

## 6. Toast-System: Bereits gut, noch besser machen

**Ist-Zustand:** Zentrales Toast-System existiert. Toasts werden über Composable oder direkt aus Stores getriggert.

**Verbesserungen:**
- **Severity-Levels klar trennen:** `info`, `success`, `warning`, `error`, `system` – mit unterschiedlicher Auto-Dismiss-Dauer (info: 3s, error: 8s, system: persistent).
- **Actionable Toasts:** Manche Toasts sollten einen Link zum System Monitor tragen ("Details anzeigen" → springt zum relevanten Log-Eintrag).
- **Toast-Gruppierung:** Wenn 5 Sensor-Disconnect-Events in 2 Sekunden kommen, einen zusammenfassenden Toast zeigen statt 5 einzelne.
- **Verbindung zu System Health:** Error-Toasts zählen. Bei >X Errors in Y Sekunden: automatisch einen "System-Problem erkannt"-Banner einblenden, der auf den System Monitor verlinkt.

---

## 7. Grafana-Integration: Empfehlung und Umsetzungsplan

### 7.1 Soll ich Grafana integrieren?

**Ja, aber hybrid.** Grafana ist hervorragend für historische Zeitreihen-Analyse, Log-Korrelation und vorgefertigte Monitoring-Dashboards. Es ist *nicht* ideal für Echtzeit-Inline-Widgets innerhalb eines Dashboards, weil eingebettete Panels eigene Ladezeiten haben und das Look-and-Feel schwer 100% anzupassen ist.

### 7.2 Integrationsstrategie: Zwei Wege parallel

| Anwendungsfall | Lösung | Begründung |
|---|---|---|
| **Inline-Charts in ESP-Cards** (Echtzeit-Sensordaten, letzte 5 Min) | Eigene Charts mit Chart.js oder Recharts | Schnelle Ladezeit, volles Design-Control, keine Iframe-Kosten. Daten kommen direkt über WebSocket. |
| **Historische Analyse** (Sensor-Verlauf über Tage/Wochen, Korrelationen) | Grafana-Panel-Embeds als Fullscreen oder Modal | Grafana kann Prometheus + Loki + InfluxDB gleichzeitig querien. Spart Eigenentwicklung von Query-Buildern. |
| **System Monitor – Logs & Metriken** | Dedizierter Grafana-Tab im System Monitor | Grafana-Dashboards für Server-Metriken, Log-Übersichten, Container-Health. Macht eigene Log-Viewer-Komponenten optional. |
| **Tiefe Diagnose** | Link zu Grafana (öffnet in neuem Tab) | Für Power-User die Grafana-native Features brauchen (Alerting, Explore, Annotations). |

### 7.3 Technische Umsetzung: Iframe-Embedding

Da du Grafana self-hosted im Docker-Stack hast (Port 3000), kannst du Panels per Iframe einbetten. Dafür nötig:

**Grafana-Config (`grafana.ini` / Environment Variables):**
```ini
[security]
allow_embedding = true

[auth.anonymous]
enabled = true
org_name = Main Org.
org_role = Viewer
```

**Vue-Composable `useGrafana.ts`:**
```typescript
// Baut Panel-URLs zusammen, handelt Theme-Sync und Zeitfenster
export function useGrafana() {
  const baseUrl = import.meta.env.VITE_GRAFANA_URL || 'http://localhost:3000'

  function panelUrl(dashboardUid: string, panelId: number, options?: {
    from?: string       // z.B. 'now-1h'
    to?: string         // z.B. 'now'
    theme?: 'dark' | 'light'
    refresh?: string    // z.B. '30s'
    kiosk?: boolean     // Navigation ausblenden
    vars?: Record<string, string>  // Template-Variablen
  }): string {
    const params = new URLSearchParams({
      from: options?.from || 'now-1h',
      to: options?.to || 'now',
      theme: options?.theme || 'dark',
      panelId: panelId.toString(),
      ...(options?.kiosk && { kiosk: '1' }),
      ...(options?.refresh && { refresh: options.refresh }),
    })
    // Template-Variablen (z.B. var-esp_id=esp_001)
    if (options?.vars) {
      Object.entries(options.vars).forEach(([k, v]) => params.set(`var-${k}`, v))
    }
    return `${baseUrl}/d-solo/${dashboardUid}?${params}`
  }

  return { panelUrl, baseUrl }
}
```

**Embed-Komponente `GrafanaPanelEmbed.vue`:**
```vue
<template>
  <div class="grafana-embed" :class="{ loading: isLoading }">
    <BaseSkeleton v-if="isLoading" />
    <iframe
      v-show="!isLoading"
      :src="src"
      frameborder="0"
      :style="{ width: '100%', height: height + 'px' }"
      @load="isLoading = false"
    />
  </div>
</template>
```

### 7.4 Wird das Look-and-Feel stören?

**Risiko:** Grafana-Panels haben ihr eigenes Styling. Im Dark-Theme mit `theme=dark` Parameter passt es farblich grob zu einem dunklen UI, aber es wird nie pixel-perfect zum Iridescent-Design sein.

**Mitigationen:**
- `kiosk=1` entfernt die Grafana-Navigation und Header → nur der reine Panel-Inhalt.
- `theme=dark` matcht dein dunkles Design grob.
- CSS-Overlay um den Iframe mit deinem Glass-Panel-Styling → rahmt den Grafana-Content ein.
- Für Inline-Charts (ESP-Card) eigene Charts benutzen → kein Grafana-Branding sichtbar.
- Grafana nur dort einsetzen, wo der User bewusst "Monitoring" macht (System Monitor Tab, historische Analyse) – dort erwartet man ein anderes Tool-Feeling.

### 7.5 Alternative: Grafana HTTP API direkt nutzen

Statt Iframe kannst du auch Daten über die Grafana/Prometheus/Loki API holen und in eigenen Komponenten rendern. Das gibt volle Design-Kontrolle, erfordert aber mehr Entwicklungsaufwand.

```
Frontend → Backend-Proxy (/api/v1/monitoring/metrics) → Prometheus API
Frontend → Backend-Proxy (/api/v1/monitoring/logs)    → Loki API
```

**Empfehlung:** Starte mit Iframe für den System Monitor Tab (schneller Mehrwert). Baue parallel eigene Inline-Charts für das Dashboard. Wenn der Iframe-Ansatz funktioniert, bleib dabei. Wenn das Design zu inkonsistent wird, migriere schrittweise auf eigene Visualisierung mit API-Anbindung.

---

## 8. CSS-Architektur: Tokens statt Copy-Paste

### 8.1 Ist-Zustand

CSS Custom Properties existieren bereits in `style.css` (Backgrounds, Text-Stufen, Iridescent-Palette, Status-Farben). Glassmorphism-Klassen sind definiert. Aber: Viele Komponenten nutzen sie nicht konsistent oder definieren lokale Varianten.

### 8.2 Soll-Zustand

```css
/* styles/tokens.css – Single Source of Truth */
:root {
  /* Surfaces */
  --surface-base:     #0a0a0f;
  --surface-elevated: #12121a;
  --surface-overlay:  #1a1a24;

  /* Text */
  --text-primary:   #f0f0f5;
  --text-secondary: #b0b0c0;
  --text-muted:     #707080;

  /* Iridescent */
  --iridescent-1: #60a5fa;
  --iridescent-2: #818cf8;
  --iridescent-3: #a78bfa;
  --iridescent-4: #c084fc;

  /* Status */
  --status-success: #22c55e;
  --status-warning: #f59e0b;
  --status-error:   #ef4444;
  --status-info:    #3b82f6;

  /* Device Types */
  --device-mock: #a78bfa;
  --device-real: #22d3ee;

  /* Spacing, Radius, Transitions */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --blur-sm: 8px;
  --blur-md: 16px;
  --blur-lg: 24px;
  --transition-fast: 150ms ease;
  --transition-normal: 300ms ease;
}
```

**Regel:** Keine Komponente darf Hex-Werte direkt verwenden. Alles geht über Tokens. Der Agent muss nach der Migration einen Grep auf Hex-Codes durchführen und jedes Vorkommen durch den entsprechenden Token ersetzen.

---

## 9. Migrations-Reihenfolge

Die Umstrukturierung passiert **nicht** in einem Big-Bang. Folgende Reihenfolge minimiert Risiko:

| Phase | Aufgabe | Abhängigkeit |
|-------|---------|-------------|
| **1** | `shared/design/tokens/` und `styles/` aufsetzen. CSS-Variablen konsolidieren. | Keine |
| **2** | `shared/design/primitives/` bauen: BaseCard, BaseBadge, BaseButton, BaseModal, BasePopover. | Phase 1 |
| **3** | `shared/design/patterns/` bauen: DataTable, TabContainer, FormSection, StatusIndicator. | Phase 2 |
| **4** | `shared/design/layout/` migrieren: AppShell, Sidebar, TopBar aus bestehenden Layout-Komponenten. | Phase 2 |
| **5** | `app/router/` refactoren: Guards extrahieren, Lazy-Loading pro Modul. | Phase 4 |
| **6** | Stores aufteilen: esp.store → esp + sensor + actuator + zone. | Unabhängig |
| **7** | Module einzeln migrieren: Auth → Dashboard → Monitoring → Rest. | Phase 3-6 |
| **8** | Grafana-Integration: Composable + Embed-Komponente + System Monitor Tab. | Phase 7 (Monitoring) |
| **9** | Neue Module ausbauen: Regeln (Vue Flow), Komponenten (Geräte-Library). | Phase 7 |
| **10** | Test-Abdeckung: Jedes Primitive, jedes Pattern, jedes Modul. | Laufend |

---

## 10. Qualitätskriterien für die Fertigstellung

- [ ] Kein Hex-Farbcode mehr direkt in Komponenten (alles über CSS-Tokens oder Design-Primitives)
- [ ] Jede Glassmorphism-Variante existiert genau einmal als Klasse oder BaseCard-Variant
- [ ] Jeder Modal/Popover nutzt die zentrale Komponente
- [ ] ESP-Store ist auf ≤800 Zeilen pro Datei aufgeteilt
- [ ] Jedes Modul hat einen eigenen Ordner unter `modules/`
- [ ] Shared Patterns werden von mindestens 2 Modulen genutzt
- [ ] Lazy-Loading für alle Module im Router konfiguriert
- [ ] TypeScript strict mode überall erfüllt
- [ ] Vitest-Coverage pro Primitive ≥80%
- [ ] Grafana-Panel-Embedding funktioniert im System Monitor Tab

---

*Erstellt als Arbeitsgrundlage für die Frontend-Konsolidierung von AutomationOne.*
*Dieses Dokument ist der Auftrag – der Code ist die Umsetzung.*