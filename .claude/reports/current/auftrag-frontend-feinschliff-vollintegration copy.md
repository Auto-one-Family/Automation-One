# Auftrag: Frontend-Feinschliff & Vollintegration — KOMPLETT

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Kontext:** Alle Kernkomponenten sind implementiert (Backend 95%, Frontend 95%, Monitoring 100%). Phase 4A+4B ERLEDIGT, Phase 4C in Arbeit. Dieser Auftrag deckt den KOMPLETTEN Feinschliff aller bereits existierenden Frontend-Komponenten ab — systematisch, View fuer View, Komponente fuer Komponente.
> **Typ:** Analyse + gezielte Fixes (Code-Aenderungen im auto-one Repo)
> **Prioritaet:** HOCH — Qualitaetssicherung VOR Hardware-Test 2
> **Geschaetzter Aufwand:** ~18-25h (10 Bloecke, teilweise parallelisierbar)

---

## Prinzip

**KEIN neuer Feature-Code.** Nur:
- Redundanzen bereinigen
- Fehlende Verdrahtungen herstellen
- Edge Cases absichern
- UX-Konsistenz herstellen
- Tote/unreferenzierte Elemente entfernen
- Bereits existierende Backend-APIs im Frontend sichtbar machen

---

## Komplettes Frontend-Inventar (IST-Zustand)

### Views (16 registriert)
| View | Route | Status | Feinschliff-Block |
|------|-------|--------|-------------------|
| HardwareView | `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` | FERTIG | Block 3 |
| MonitorView | `/monitor`, `/monitor/dashboard/:id`, `/monitor/zone/:zoneId/dashboard/:id` | FERTIG | Block 4 |
| CustomDashboardView | `/dashboards`, `/dashboards/:id` | FERTIG | Block 5 |
| LogicView | `/logic`, `/logic/:ruleId` | FERTIG | Block 6 |
| SystemMonitorView | `/system-monitor` | FERTIG (7 Tabs) | Block 2 |
| SensorsView | `/sensors` | FERTIG | Block 7 |
| CalibrationView | `/calibration` | FERTIG | Block 7 |
| PluginsView | `/plugins` | FERTIG | Block 8 |
| SettingsView | `/settings` | FERTIG | Block 9 |
| UsersView | `/users` | FERTIG | Block 9 |
| LoginView | `/login` | FERTIG | Block 9 |
| MaintenanceView | `/maintenance` | EXISTIERT, kein Sidebar-Eintrag | Block 1 |
| DashboardView | `/dashboard-legacy` | LEGACY — LOESCHEN | Block 10 |

### Stores (14 Pinia)
| Store | Datei | Status |
|-------|-------|--------|
| dashboard.store.ts | Layouts, Widgets, GridStack | FERTIG |
| notification.store.ts | Toasts (LEGACY) | FERTIG, wird parallel zu notification-inbox genutzt |
| notification-inbox.store.ts | Inbox, Badge, Drawer (NEU Phase 4A) | FERTIG |
| esp.store.ts | ESP-Geraete | FERTIG |
| sensor.store.ts | Sensoren | FERTIG |
| actuator.store.ts | Aktoren | FERTIG |
| zone.store.ts | Zonen | FERTIG |
| logic.store.ts | Logic Rules | FERTIG |
| auth.store.ts | JWT, User | FERTIG |
| settings.store.ts | App-Einstellungen | FERTIG |
| drag.store.ts | DnD-State | FERTIG |
| calibration.store.ts | Kalibrierung | FERTIG |
| health.store.ts | System-Health | FERTIG |
| plugin.store.ts | Plugin-System | FERTIG |

### Notification-System (Phase 4A — 11 Komponenten)
| Komponente | Datei | Status | Feinschliff |
|-----------|-------|--------|-------------|
| NotificationBadge | `notifications/NotificationBadge.vue` | IMPLEMENTIERT | Block 2.1 |
| NotificationDrawer | `notifications/NotificationDrawer.vue` | IMPLEMENTIERT | Block 2.1 |
| NotificationItem | `notifications/NotificationItem.vue` | IMPLEMENTIERT (mit emailStatus) | Block 2.1 |
| NotificationPreferences | `notifications/NotificationPreferences.vue` | IMPLEMENTIERT | Block 2.1 |
| notification-inbox.store.ts | Store | IMPLEMENTIERT | Block 2.1 |
| notifications.ts (API) | API-Client | IMPLEMENTIERT (EmailLogEntry, getEmailLog, getEmailLogStats) | Block 2.1 |

### Alert-Management (Phase 4B — 6 Komponenten)
| Komponente | Datei | Status | Feinschliff |
|-----------|-------|--------|-------------|
| AlertStatusBar | `alerts/AlertStatusBar.vue` | IMPLEMENTIERT (ISA-18.2) | Block 2.2 |
| QuickAlertPanel | `quick-actions/QuickAlertPanel.vue` | IMPLEMENTIERT (Top-5, Ack/Navigate/Mute) | Block 2.2 |
| NotificationItem Ack/Resolve | In NotificationItem.vue | IMPLEMENTIERT | Block 2.2 |
| NotificationDrawer Status-Tabs | In NotificationDrawer.vue | IMPLEMENTIERT | Block 2.2 |
| HealthTab Alert-KPI | In HealthTab.vue | IMPLEMENTIERT | Block 2.2 |
| HealthSummaryBar Alert-Chips | In HealthSummaryBar.vue | IMPLEMENTIERT | Block 2.2 |

### Quick Action Ball (Phase 4A — FAB-System)
| Komponente | Datei | Status | Feinschliff |
|-----------|-------|--------|-------------|
| QuickActionBall | `quick-actions/QuickActionBall.vue` | IMPLEMENTIERT (FAB + Glassmorphism) | Block 2.3 |
| QuickAlertPanel | `quick-actions/QuickAlertPanel.vue` | IMPLEMENTIERT | Block 2.3 |
| QuickNavigationPanel | `quick-actions/QuickNavigationPanel.vue` | IMPLEMENTIERT | Block 2.3 |
| QuickWidgetPanel | `quick-actions/QuickWidgetPanel.vue` | IMPLEMENTIERT | Block 2.3 |
| QuickDashboardPanel | `quick-actions/QuickDashboardPanel.vue` | IMPLEMENTIERT | Block 2.3 |
| useQuickActions.ts | Composable | IMPLEMENTIERT (ctx-full-diagnostic, global-last-report existieren) | Block 2.3 |

### SystemMonitor Tabs (7 Tabs)
| Tab | Komponente | Status | Feinschliff |
|-----|-----------|--------|-------------|
| Events | UnifiedEventList.vue | FERTIG | Block 2.4 |
| Logs | ServerLogsTab.vue | FERTIG | Block 2.4 |
| Database | DatabaseTab.vue | FERTIG | Block 2.4 |
| MQTT | MqttTrafficTab.vue | FERTIG | Block 2.4 |
| Health | HealthTab.vue | FERTIG (+ Alert-KPI Phase 4B) | Block 2.4 |
| Diagnostics | DiagnosticsTab.vue | FERTIG | Block 2.4 |
| Reports | ReportsTab.vue | FERTIG | Block 2.4 |

### Dashboard-System (10 Widget-Typen)
| Widget | Komponente | Status |
|--------|-----------|--------|
| LineChart | LineChartWidget.vue | FERTIG |
| Gauge | GaugeWidget.vue | FERTIG |
| SensorCard | SensorCardWidget.vue | FERTIG |
| ActuatorCard | ActuatorCardWidget.vue | FERTIG |
| HistoricalChart | HistoricalChartWidget.vue | FERTIG |
| ESPHealth | ESPHealthWidget.vue | FERTIG |
| AlarmList | AlarmListWidget.vue | FERTIG |
| ActuatorRuntime | ActuatorRuntimeWidget.vue | FERTIG |
| MultiSensor | MultiSensorWidget.vue | FERTIG (NEU 2026-03-01) |
| WidgetConfigPanel | WidgetConfigPanel.vue | FERTIG (NEU 2026-03-01) |

### Backup-System
| Komponente | Ort | Status |
|-----------|-----|--------|
| DatabaseBackupService | Backend `database_backup_service.py` | KOMPLETT (create, list, download, delete, restore) |
| REST-API | Backend `backups.py` | KOMPLETT (5 Endpoints) |
| Scheduler | Backend `main.py` CronJob | KOMPLETT (02:00 taeglich) |
| **Backup-UI** | **Frontend — SystemMonitor Inline-Portal** | **EXISTIERT als Inline-Portal im Database-Tab** |
| QAB-Action "Backup erstellen" | useQuickActions.ts | **FEHLT** |

### Plugin-System (Phase 4C)
| Komponente | Ort | Status |
|-----------|-----|--------|
| 4 AutoOps-Plugins | Backend | FERTIG (DebugFix, ESPConfigurator, HealthCheck, SystemCleanup) |
| REST-API | Backend `plugins.py` | FERTIG |
| PluginsView | Frontend | FERTIG |
| Logic Engine Plugin-Actions | Backend | FERTIG |

### Layout & Navigation
| Komponente | Datei | Status |
|-----------|-------|--------|
| Sidebar | `shared/design/layout/Sidebar.vue` | FERTIG — Redundanz "System"/"Wartung" |
| ViewTabBar | `shared/design/ViewTabBar.vue` | FERTIG |
| AccordionSection | `shared/AccordionSection.vue` | FERTIG |
| SlideOver | `shared/design/SlideOver.vue` | FERTIG |
| ConfirmDialog | `shared/design/ConfirmDialog.vue` | FERTIG |
| ColorLegend | `shared/ColorLegend.vue` | FERTIG |
| GrafanaPanelEmbed | `shared/GrafanaPanelEmbed.vue` | FERTIG (Health-Check + Fallback) |

### Design-System
| Element | Datei | Status |
|---------|-------|--------|
| tokens.css | `shared/design/tokens.css` | FERTIG (Glassmorphism, Status-Farben, Typografie, Spacing) |
| cssTokens.ts | `shared/design/cssTokens.ts` | FERTIG (Utility fuer Token-Zugriff) |
| --color-status-alarm | Legacy-Token | **23 Dateien** nutzen noch dieses veraltete Token (INFO-Level) |

---

## Block 1: Sidebar & Navigation bereinigen (~1.5h)

### Ziel
Jeder Sidebar-Eintrag fuehrt zu einem EIGENEN, sinnvollen Ziel. Keine Duplikate.

### 1.1 — Sidebar-Inventar verifizieren

**Datei:** `El Frontend/src/shared/design/layout/Sidebar.vue`

**Pruefen und dokumentieren:**
- [ ] Jeden Sidebar-Eintrag auflisten: Label, Route, Icon, Sichtbarkeit (alle/admin)
- [ ] Welche Eintraege fuehren zum GLEICHEN View? (bekannt: "System" → `/system-monitor`, "Wartung" → `/system-monitor?tab=health`)
- [ ] MaintenanceView.vue (`/maintenance`) — existiert, hat aber KEINEN Sidebar-Eintrag

**Erwartetes IST-Inventar (zu verifizieren):**
```
Navigation:
  Dashboard    → /hardware        → LayoutDashboard
  Regeln       → /logic           → Workflow
  Komponenten  → /sensors         → Activity
Administration (Admin-only):
  System       → /system-monitor  → Monitor            ← PROBLEM
  Benutzer     → /users           → Users
  Wartung      → /system-monitor?tab=health → Wrench   ← PROBLEM (Duplikat)
  Kalibrierung → /calibration     → SlidersHorizontal
  Plugins      → /plugins         → Puzzle
Footer:
  Einstellungen → /settings       → UserCog
```

### 1.2 — Sidebar-Bereinigung umsetzen

**Empfohlene Loesung (Option A — minimal-invasiv):**
- [ ] "Wartung" aus der Sidebar ENTFERNEN
- [ ] "System" bleibt mit allen 7+ Tabs (Events, Logs, Database, MQTT, Health, Diagnostics, Reports)
- [ ] PRUEFEN: MaintenanceView.vue — soll es als separater Sidebar-Eintrag existieren oder wird der Inhalt in SystemMonitorView als Tab integriert?

**Alternativen (nur falls Robin anders entscheidet):**
| Option | Beschreibung | Aufwand |
|--------|-------------|---------|
| A (Empfohlen) | "Wartung" entfernen, "System" bleibt | ~5min |
| B | "Wartung" → `/maintenance` verlinken (eigener View) | ~10min |
| C | "System" → "Monitoring", "Wartung" → "Betrieb" mit verschiedenen Views | ~2h |

### 1.3 — Alle internen Links pruefen

**Suchen in allen `.vue` Dateien nach:**
- [ ] `router.push` / `router-link` / `href` mit `/system-monitor` — Query-Parameter korrekt? (`?tab=health`, `?tab=reports`, `?tab=diagnostics`)
- [ ] Links zu `/maintenance` — Gibt es solche? Funktionieren sie?
- [ ] Links mit `localhost:3000` (Grafana) — Dynamisch via `useGrafana.ts`?
- [ ] Tote Links die ins Leere fuehren

**Report:** Tabelle aller internen Links mit Ziel + Status (funktional/kaputt/redundant/tot)

---

## Block 2: Notification, Alert & SystemMonitor Feinschliff (~4-5h)

### 2.1 — Notification-System polieren

**Komponenten:** NotificationBadge, NotificationDrawer, NotificationItem, NotificationPreferences, notification-inbox.store.ts

**Pruefen und fixen:**
- [ ] NotificationDrawer Footer: "Letzte 5 Emails" mit Status anzeigen — **FEHLT NOCH**
  - API existiert bereits: `getEmailLog()` in `notifications.ts` (Z.345)
  - `EmailLogEntry` Interface existiert (Z.139)
  - Nur Frontend-Integration im Drawer-Footer fehlt
- [ ] NotificationItem `emailStatus` computed (Z.51) — verifizieren dass sent/failed/pending korrekt dargestellt werden
- [ ] NotificationPreferences — alle Felder funktional verbunden? (email_enabled, email_severities, quiet_hours, digest)
- [ ] Badge-Count — wird korrekt ueber WebSocket aktualisiert? (`notification_count` WS-Event)
- [ ] Drawer Status-Tabs (Phase 4B) — Tabs filtern korrekt nach Status (active/acknowledged/resolved)?
- [ ] Edge Case: Was passiert bei 0 Notifications? Leerer State mit Hinweis?
- [ ] Edge Case: Was passiert bei 100+ ungelesenen? Scroll-Performance?

### 2.2 — Alert-Management polieren

**Komponenten:** AlertStatusBar, QuickAlertPanel, Ack/Resolve in NotificationItem, HealthTab Alert-KPI, HealthSummaryBar Alert-Chips

**Pruefen und fixen:**
- [ ] AlertStatusBar ISA-18.2 Lifecycle — alle State-Transitions visuell klar?
  - UNACK (rot) → ACK (gelb) → RESOLVED (gruen) → automatisch archiviert
- [ ] QuickAlertPanel Batch-Ack — funktioniert fuer mehrere Alerts gleichzeitig?
- [ ] HealthTab Alert-KPI — Zahlen aktualisieren sich in Echtzeit (WebSocket)?
- [ ] HealthSummaryBar Alert-Chips — Severity-Farben konsistent mit Design-Tokens?
- [ ] `threshold_correlation_id` — wird im Frontend angezeigt/genutzt fuer Threshold-basierte Alerts?
- [ ] Edge Case: Was passiert wenn Grafana-Stack nicht laeuft? Fallback-Anzeige?

### 2.3 — Quick Action Ball (FAB) polieren

**Komponenten:** QuickActionBall, QuickAlertPanel, QuickNavigationPanel, QuickWidgetPanel, QuickDashboardPanel, useQuickActions.ts

**Pruefen und fixen:**
- [ ] FAB Pulse-Animation bei ungelesenen Alerts — funktioniert?
- [ ] FAB Position — kollidiert nicht mit anderen UI-Elementen (Scrollbar, Footer)?
- [ ] Kontextabhaengige Actions — wechseln je nach aktuellem View?
- [ ] `ctx-full-diagnostic` Action — startet Diagnose korrekt?
- [ ] `global-last-report` Action — oeffnet letzten Report?
- [ ] **FEHLEND: "Backup erstellen" Action** — hinzufuegen:
  ```typescript
  {
    id: 'global-backup-create',
    label: 'Backup erstellen',
    icon: 'Database',
    action: () => backupsApi.createBackup(),
    context: 'global'
  }
  ```
- [ ] Sub-Panel-Uebergaenge — smooth Glassmorphism-Transition?
- [ ] Edge Case: Keyboard-Accessibility (Escape schliesst Panel)?

### 2.4 — SystemMonitorView polieren

**View:** SystemMonitorView.vue (7 Tabs: Events, Logs, Database, MQTT, Health, Diagnostics, Reports)

**Pruefen und fixen:**
- [ ] Tab-Wechsel — URL-Parameter (`?tab=health`) werden korrekt gesetzt/gelesen?
- [ ] Tab-Wechsel — State bleibt erhalten beim Zurueckwechseln?
- [ ] EventsTab (UnifiedEventList) — Pagination funktioniert? Filter funktionieren?
- [ ] LogsTab (ServerLogsTab) — Auto-Scroll bei neuen Logs? Performance bei vielen Eintraegen?
- [ ] DatabaseTab — Backup-Inline-Portal EXISTIERT BEREITS:
  - [ ] Zeigt Backup-Liste an? (via `backupsApi.listBackups()`)
  - [ ] "Jetzt Backup erstellen" Button funktioniert?
  - [ ] Download-Link fuer einzelne Backups?
  - [ ] Letztes Backup Datum/Groesse sichtbar?
  - [ ] Restore-Funktion accessible (mit ConfirmDialog)?
  - [ ] Backup-Scheduler-Status anzeigen (naechstes geplantes Backup)?
- [ ] MqttTrafficTab — Live-Traffic-Anzeige? Message-Counter?
- [ ] HealthTab — Server, DB, MQTT Status-Ampel korrekt? Alert-KPI (Phase 4B) integriert?
- [ ] DiagnosticsTab — 10 Checks ausfuehrbar? Report-Generierung funktioniert?
- [ ] ReportsTab — Gespeicherte Reports abrufbar? "1-Klick-Diagnose" prominent?
- [ ] **Diagnostics 1-Klick-Zugang verbessern:**
  - [ ] Prominenter Button "System-Check starten" am Anfang des Health-Tabs oder als eigener Mini-Tab
  - [ ] Letzter Report-Status als Badge/Indikator im Tab-Header
- [ ] **Grafana-Hinweis wenn Monitoring-Stack nicht laeuft:**
  - [ ] `GrafanaPanelEmbed.vue` hat bereits Health-Check mit "Grafana nicht erreichbar" Fallback
  - [ ] FEHLEND: Prominenter Hinweis-Banner im HealthTab/SystemMonitorView wenn Monitoring-Stack offline

---

## Block 3: HardwareView Feinschliff (~2-3h)

### Ziel
Route-basierter 3-Level-Zoom (/hardware → /hardware/:zoneId → /hardware/:zoneId/:espId) ist funktional sauber, Edge Cases abgesichert.

**View:** HardwareView.vue (686 Zeilen)

### 3.1 — Level 1: Zonen-Uebersicht

**Pruefen und fixen:**
- [ ] Zone-Kacheln — Statusfarben korrekt (gruen/gelb/rot/grau)?
- [ ] Zone-Sortierung — Probleme zuerst, dann online, leere zuletzt, alphabetisch?
- [ ] Zone-Erstellung — **NAV-001 bekannt:** `:disabled="unassignedDevices.length === 0"` — User kann KEINE leere Zone erstellen. Entscheidung: Feature oder Bug?
- [ ] Unassigned Section — Farbhartkodierung `rgba(245,158,11,0.04)` → ersetzen durch `var(--color-warning)` mit Opacity (**DESIGN-001**)
- [ ] BEM-Violation — `zone-plate__chevron` Klasse im Unassigned-Section (**DESIGN-002**)
- [ ] Context-Menu "Zone aendern" — Position in Bildschirmmitte statt bei Karte (**NAV-002**)

### 3.2 — Level 2: Zone-Detail (ESP-Karten)

**Pruefen und fixen:**
- [ ] DeviceMiniCard — Status korrekt (online/offline/error)?
- [ ] ESPSettingsSheet (SlideOver) — oeffnet korrekt? Schliesst sauber?
- [ ] SlideOver-Stacking — ESPSettingsSheet → SensorConfig Click → zweites SlideOver. Visueller Hinweis dass dahinter Panel offen? (**SETTINGS-001**)
- [ ] `handleSettingsClose()` — `setTimeout(200ms)` Race Condition bei schnellem Open→Close→Open (**SETTINGS-002**)
- [ ] Hover-only Elemente (Settings-Gear `opacity:0→1`) — auf Touch-Geraeten nicht erreichbar (**CARD-003**)
- [ ] Offline-Auto-Expand — Zones mit offline/error Devices werden automatisch aufgeklappt?

### 3.3 — Level 3: ESP-Detail (ESPOrbitalLayout)

**Pruefen und fixen:**
- [ ] ESPOrbitalLayout (410 Zeilen + useOrbitalDragDrop.ts) — Sensoren/Aktoren korrekt dargestellt?
- [ ] AddSensorModal — Sensor-Type-Dropdown vollstaendig? Alle 9 Typen?
- [ ] AddActuatorModal — Alle 4 Aktor-Typen?
- [ ] DnD Sensor/Aktor-Drop — **Bekannter Bug:** Payload-Verlust (sensorType nicht an Modal weitergegeben). Oeffnet immer mit Default-Typ
- [ ] GPIO-Pin-Validierung — Blacklist {0,1,3,6-11,12} wird client-seitig geprueft?
- [ ] I2C-Sensoren — Anzeige "I2C — 0x44" statt "GPIO 0"?
- [ ] Multi-Value-Sensoren (SHT31, BMP280, BME280) — Toast-Info bei Hinzufuegen?
- [ ] Sensor-Icon-Map — Default-Fallback fuer unbekannte Sensortypen? (**CARD-002**)

### 3.4 — Sensor/Aktor-Konfigurationspanels

**Pruefen und fixen:**
- [ ] SensorConfigPanel (Three-Zone: Basic/Advanced/Expert) — alle Accordion-Sections funktional?
- [ ] ActuatorConfigPanel (Three-Zone) — alle Sections funktional?
- [ ] Emergency-Stop-Button — Reset-Pfad vorhanden? User weiss wie Aktor wieder freigeben? (**ACTUATOR-001**)
- [ ] **Sensor/Aktor LOESCHEN fehlt komplett** — kein Delete-Button in Config-Panels (**DELETE-001**)
  - Device-Loeschen hat ConfirmDialog danger (3 Wege) ✅
  - Zone-Loeschen hat ConfirmDialog danger ✅
  - Sensor/Aktor-Loeschen — **FEHLT**
- [ ] Kalibrierung — Offset-Calibration fuer nicht-pH/EC Sensortypen pruefen (Temperatur, Feuchte, Licht)
- [ ] Sensor-Type-Aware Defaults — Sensortyp waehlen fuellt alles voraus?

---

## Block 4: MonitorView Feinschliff (~2-3h)

### Ziel
2-Level Monitoring (Zonen → Sensor-Detail) mit integrierten Dashboards funktioniert konsistent.

**View:** MonitorView.vue (713 Zeilen)

### 4.1 — Level 1: Zonen-Uebersicht (Monitor)

**Pruefen und fixen:**
- [ ] Zone-Accordion — useZoneGrouping.ts liefert korrekte ZoneGroup[]/SubzoneGroup[]?
- [ ] Accordion localStorage-Persistenz — State bleibt nach Reload?
- [ ] Smart Defaults — ≤4 Zonen alle offen, >4 nur erste?
- [ ] SensorCard monitor-mode — Live-Wert, Sparkline, Status-Dot, ESP-Badge, Read-Only?
- [ ] ActuatorCard monitor-mode — Status korrekt, Read-Only?
- [ ] Sparkline-Cache (useSparklineCache.ts) — 5s-Deduplizierung funktioniert? Shared mit SensorsView?
- [ ] Zone-Dashboard-Links — zoneDashboards(zoneId) Computed korrekt?

### 4.2 — Level 2: Dashboard-Viewer

**Pruefen und fixen:**
- [ ] DashboardViewer.vue (367 Zeilen) — GridStack `staticGrid: true` (View-Only)?
- [ ] InlineDashboardPanel.vue (165 Zeilen) — CSS-Grid-Only (12 Spalten, KEIN GridStack)?
- [ ] useDashboardWidgets.ts (265 Zeilen) — Widget mount/unmount sauber?
- [ ] Auto-Generierung — generateZoneDashboard() erstellt sinnvolle Widgets fuer Zonen?
- [ ] Router-Integration — `monitor-dashboard` + `monitor-zone-dashboard` Routes funktionieren?
- [ ] Side-Panel-Integration in HardwareView — konsistent mit MonitorView?

### 4.3 — Cross-View Navigation

**Pruefen und fixen:**
- [ ] Sensor-Klick in Monitor → L3 SlideOver mit Zeitreihe — funktioniert?
- [ ] Zone-zu-Zone-Navigation — Cross-Tab-Links (Hardware ↔ Monitor)?
- [ ] Tab-Verhalten ViewTabBar (Hardware / Monitor / Dashboard) — aktiver Tab visuell klar?
- [ ] Browser-History — Zurueck/Vorwaerts durch alle Levels funktioniert?
- [ ] Deep-Links — `/monitor/zone/123/dashboard/456` funktioniert direkt?

---

## Block 5: Dashboard-Editor (CustomDashboardView) Feinschliff (~2h)

### Ziel
GridStack Widget-Builder mit allen 10 Widget-Typen funktioniert zuverlaessig.

**View:** CustomDashboardView.vue (620 Zeilen)

### 5.1 — Layout-Management

**Pruefen und fixen:**
- [ ] Layout erstellen — neues Layout mit Namen?
- [ ] Layout wechseln — Dropdown/Tab funktioniert?
- [ ] Layout loeschen — mit ConfirmDialog?
- [ ] Layout-Persistenz — Speicherung in DB via API?
- [ ] GridStack DnD — Widgets verschieben/resizen funktioniert fluessig?
- [ ] Target-Config-Dropdown — Layout einem Ziel zuordnen (Zone/Global)?

### 5.2 — Widget-Typen (alle 10)

**Jeden Widget-Typ einzeln pruefen:**
- [ ] LineChartWidget — Echtzeitdaten? Sensor-Auswahl?
- [ ] GaugeWidget — Wertbereich korrekt? Farben nach Status?
- [ ] SensorCardWidget — Live-Wert? Sparkline?
- [ ] ActuatorCardWidget — Status? Toggle funktioniert?
- [ ] HistoricalChartWidget — Zeitraum-Auswahl? Y-Achsen-Range korrekt (SENSOR_TYPE_CONFIG)?
- [ ] ESPHealthWidget — Device-Status? Online/Offline?
- [ ] AlarmListWidget — Aktuelle Alarme? Severity-Farben?
- [ ] ActuatorRuntimeWidget — Laufzeit-Statistik?
- [ ] MultiSensorWidget — Chip-basierte Multi-Sensor-Auswahl? Mehrere Linien?
- [ ] WidgetConfigPanel (SlideOver) — Titel, Sensor, Y-Range, Zeitraum, Farbe, Schwellenwerte?

### 5.3 — Widget-Konfiguration

**Pruefen und fixen:**
- [ ] Widget hinzufuegen — aus Katalog waehlen → in Grid platzieren?
- [ ] Widget konfigurieren — Doppelklick/Zahnrad → WidgetConfigPanel?
- [ ] Widget loeschen — mit Bestaetigung?
- [ ] Charts-Reaktivitaet — Vue 3 lokaler `ref` State Pattern korrekt? (War Bug 1 CRITICAL)
- [ ] Y-Achsen suggestedMin/suggestedMax — pro Sensortyp korrekt?

---

## Block 6: Logic-Rules-Editor Feinschliff (~2h)

### Ziel
Visual Rule Builder mit Flow-Editor, RuleCards, Execution History funktioniert robust.

**View:** LogicView.vue + RuleFlowEditor.vue + RuleConfigPanel.vue + RuleCard.vue

### 6.1 — Landing Page

**Pruefen und fixen:**
- [ ] RuleCards Grid-Layout — uebersichtlich bei vielen Regeln?
- [ ] RuleCard Status-Label — "Aktiv" (gruen), "Deaktiviert" (grau), "Fehler" (rot mit AlertCircle)?
- [ ] RuleCard Inline-Buttons — @select/@toggle/@delete Events korrekt?
- [ ] Toggle-Pulse Animation — visuelles Feedback beim Aktivieren/Deaktivieren?
- [ ] Error-Styling — roter Rand bei fehlerhaften Regeln?
- [ ] Scroll — overflow: auto funktioniert (war Bug 6)?

### 6.2 — Flow-Editor

**Pruefen und fixen:**
- [ ] ruleToGraph() — Alle Condition-Typen: threshold, hysteresis, compound, time_window?
- [ ] Node-DnD — Vue Flow Drag-and-Drop funktioniert?
- [ ] Undo/Redo — Overlay-Buttons + Ctrl+Z/Y Shortcuts?
- [ ] History-Luecken — pushToHistory fuer onDrop, deleteNode, duplicateNode, onNodeDragStop?
- [ ] Connection-Validierung — Logic-Node (AND/OR) wird immer erstellt wenn keiner existiert?
- [ ] PWM-Wert — Roundtrip stabil? Kein Degradation (0.5 → 0.005)?
- [ ] ESP-ID Fallback — unbekannte Devices werden graceful gehandelt?
- [ ] Templates Content-Width — 740px (nicht 520px)?
- [ ] Compound Condition — kein Dangling Edge (Parent-ID ohne Node)?

### 6.3 — Execution History

**Pruefen und fixen:**
- [ ] REST-Integration — loadExecutionHistory() holt korrekte Daten?
- [ ] WS-Merge — neue Ausfuehrungen werden live eingefuegt?
- [ ] Deduplizierung — keine doppelten Eintraege?
- [ ] Filter — Regel-Filter und Status-Filter funktionieren?
- [ ] Expandierbare Details — Klick zeigt trigger_reason, duration_seconds?
- [ ] Max 50 Eintraege — Pagination oder Truncation?
- [ ] Execution-Info im Rule-Dropdown — execution_count, last_triggered angezeigt?

---

## Block 7: SensorsView & CalibrationView Feinschliff (~1.5h)

### 7.1 — SensorsView

**View:** SensorsView.vue

**Pruefen und fixen:**
- [ ] Zonen-Container — Accordion-Sections fuer Zonen + Subzonen korrekt?
- [ ] "Nicht zugewiesen"-Bereich — Sensoren ohne Zone werden angezeigt?
- [ ] Filter — greifen innerhalb der Gruppierung?
- [ ] Klick oeffnet Config-Panel — SensorConfigPanel SlideOver?
- [ ] Sparkline-Cache shared mit MonitorView?
- [ ] Subzone-Chips — horizontal scrollbar bei vielen Subzonen?
- [ ] Qualitaets-Labels — Exzellent/Gut/Mittel/Kritisch/Veraltet korrekt?

### 7.2 — CalibrationView

**View:** CalibrationView.vue

**Pruefen und fixen:**
- [ ] pH-Kalibrierung — 2-Punkt-Verfahren funktioniert?
- [ ] EC-Kalibrierung — 2-Punkt-Verfahren funktioniert?
- [ ] Offset-Kalibrierung fuer andere Sensortypen — verfuegbar?
- [ ] CalibrationWizard — Schrittfolge klar? Abbruch moeglich?
- [ ] Kalibrierungsdaten persistent — in DB gespeichert?

---

## Block 8: PluginsView Feinschliff (~1h)

**View:** PluginsView.vue

**Pruefen und fixen:**
- [ ] Plugin-Liste — alle 4 Plugins (DebugFix, ESPConfigurator, HealthCheck, SystemCleanup) angezeigt?
- [ ] Plugin-Status — aktiv/inaktiv korrekt?
- [ ] Plugin-Konfiguration — bearbeitbar? Speicherbar?
- [ ] Plugin-Logs — einsehbar?
- [ ] Logic Engine Integration — Plugin-Actions in Regeln verfuegbar?
- [ ] Plugin-Schedules — werden aus DB geladen und angezeigt?
- [ ] Edge Case: Was passiert wenn ein Plugin crasht? Error-Anzeige?

---

## Block 9: Settings, Users & Auth Feinschliff (~1.5h)

### 9.1 — SettingsView

**Pruefen und fixen:**
- [ ] Alle Einstellungen persistent?
- [ ] Kategorisierung klar (System, Notifications, Display)?
- [ ] Email-Konfiguration (SMTP/Resend) — sichtbar und konfigurierbar?
- [ ] Backup-Einstellungen — Scheduler-Config (Uhrzeit, Max-Alter, Max-Anzahl)?
- [ ] Monitoring-Stack-Info — Status der externen Services?

### 9.2 — UsersView

**Pruefen und fixen:**
- [ ] User-Liste — alle Users angezeigt?
- [ ] Rollen — Admin/Operator korrekt vergeben und angezeigt?
- [ ] User erstellen/bearbeiten/loeschen — funktional?
- [ ] Passwort-Aenderung — sicher (aktuelle Passwort-Abfrage)?

### 9.3 — Auth-Flow

**Pruefen und fixen:**
- [ ] LoginView — JWT-Token korrekt gespeichert?
- [ ] Token-Refresh — automatisch vor Ablauf?
- [ ] Logout — Token geloescht, Redirect zu Login?
- [ ] Admin-Routes — werden korrekt geschuetzt (requiresAdmin)?
- [ ] WebSocket Auth — JWT wird bei WS-Verbindung mitgesendet?

---

## Block 10: Bereinigung & Konsistenz (~2h)

### 10.1 — Tote Dateien entfernen

**Pruefen und entfernen (falls bestaetigt tot):**
- [ ] DashboardView.vue (956 Zeilen, LEGACY unter `/dashboard-legacy`) — LOESCHEN
- [ ] useZoomNavigation.ts + .test.ts — Orphan-Dateien (bereits identifiziert)
- [ ] MaintenanceView.vue — ENTSCHEIDUNG: integrieren oder als eigenen Sidebar-Eintrag behalten?
- [ ] Weitere Orphan-Dateien via Dead-Code-Analyse finden

### 10.2 — Design-Token-Konsistenz

**Pruefen und fixen:**
- [ ] `--color-status-alarm` Legacy-Token — 23 Dateien nutzen noch dieses veraltete Token
  - Ersetzen durch korrektes Token aus tokens.css (z.B. `--color-status-critical`)
  - ODER als Alias definieren falls bewusst genutzt
- [ ] Hex-Farben — noch hartcodierte Hex-Werte in Komponenten? (Phase 2 hat ~100+ ersetzt)
- [ ] Glassmorphism-Konsistenz — alle Panels/Cards nutzen gleiche backdrop-blur Werte?
- [ ] Status-Farben — ueberall konsistent (gruen=online, gelb=warning, rot=critical, grau=offline)?
- [ ] Typografie — einheitliche Font-Sizes aus Tokens?

### 10.3 — Error-Handling & Loading States

**In JEDEM View pruefen:**
- [ ] Loading State — Skeleton/Spinner waehrend API-Calls?
- [ ] Error State — Fehlermeldung bei API-Fehler (nicht stille Fehler)?
- [ ] Empty State — sinnvoller Hinweis wenn keine Daten vorhanden?
- [ ] Offline State — Was passiert wenn Server nicht erreichbar?
- [ ] WebSocket Reconnect — Reconnect-Indikator sichtbar?
- [ ] Toast-Notifications — Erfolg/Fehler konsistent fuer CRUD-Operationen?

### 10.4 — Responsive & Accessibility Basics

**Pruefen:**
- [ ] Desktop (1920x1080) — alles sichtbar und nutzbar?
- [ ] Tablet (768x1024) — kritische Views nutzbar?
- [ ] Touch-Targets — mindestens 44px? (DnD-Forschung: WCAG Pflicht)
- [ ] Keyboard-Navigation — Tab-Reihenfolge sinnvoll?
- [ ] Escape schliesst Modals/SlideOvers/Panels?
- [ ] aria-Labels auf interaktiven Elementen?

---

## Zusammenfassung: Tatsaechlich offene Aufgaben

| # | Aufgabe | Aufwand | Block | Prioritaet |
|---|---------|---------|-------|------------|
| 1 | Sidebar "Wartung" entfernen (Redundanz) | ~15min | 1 | HOCH |
| 2 | Alle internen Links pruefen + tote Links fixen | ~30min | 1 | HOCH |
| 3 | NotificationDrawer Footer "Letzte 5 Emails" | ~1h | 2.1 | MITTEL |
| 4 | QAB-Action "Backup erstellen" hinzufuegen | ~15min | 2.3 | MITTEL |
| 5 | Diagnostics 1-Klick-Zugang verbessern | ~30min | 2.4 | MITTEL |
| 6 | Grafana-Offline-Banner im SystemMonitor | ~30min | 2.4 | MITTEL |
| 7 | DatabaseTab Backup-UI verifizieren + polieren | ~30min | 2.4 | HOCH |
| 8 | Sensor/Aktor-Loeschen in Config-Panels | ~1-2h | 3.4 | HOCH |
| 9 | DnD Sensor-Payload Fix (Default-Typ Bug) | ~30min | 3.3 | MITTEL |
| 10 | `--color-status-alarm` Legacy-Token bereinigen (23 Dateien) | ~1h | 10.2 | NIEDRIG |
| 11 | DashboardView LEGACY loeschen | ~15min | 10.1 | NIEDRIG |
| 12 | Orphan-Dateien entfernen | ~15min | 10.1 | NIEDRIG |
| 13 | Hartcodierte Farben → Design-Tokens | ~1h | 10.2 | NIEDRIG |
| 14 | Error/Loading/Empty States konsistent machen | ~2-3h | 10.3 | MITTEL |
| 15 | HardwareView UX-Bugs (NAV-001, NAV-002, DESIGN-001/002) | ~1h | 3.1 | NIEDRIG |
| 16 | SlideOver-Stacking visueller Hinweis | ~30min | 3.2 | NIEDRIG |
| 17 | Emergency-Stop Reset-Pfad dokumentieren/sichtbar machen | ~30min | 3.4 | MITTEL |
| 18 | Touch-Accessibility Grundlagen (44px Targets, hover-only Elemente) | ~1-2h | 10.4 | NIEDRIG |
| **Gesamt** | | **~12-16h** | | |

---

## Abhaengigkeiten und Reihenfolge

```
Block 1 (Sidebar/Navigation)     ← ZUERST (beeinflusst alle anderen Blocks)
    │
    ├── Block 2 (Notification/Alert/SystemMonitor) ← PARALLEL
    ├── Block 3 (HardwareView)                     ← PARALLEL
    ├── Block 4 (MonitorView)                      ← PARALLEL
    │
    ├── Block 5 (Dashboard-Editor)                 ← NACH Block 4
    ├── Block 6 (Logic-Rules-Editor)               ← PARALLEL
    ├── Block 7 (SensorsView/Calibration)          ← PARALLEL
    ├── Block 8 (PluginsView)                      ← PARALLEL
    ├── Block 9 (Settings/Users/Auth)              ← PARALLEL
    │
    └── Block 10 (Bereinigung/Konsistenz)          ← ZULETZT (nach allen anderen)
```

## Vorbedingungen

- [ ] Docker-Stack muss laufen fuer Frontend-Entwicklung (`make dev`)
- [ ] Monitoring-Stack optional fuer Grafana-Tests (`make monitor-up`)
- [ ] Aktueller master-Branch ohne offene Merge-Konflikte

## Verifikation

Nach Abschluss aller Bloecke:
- [ ] `npm run build` (Vite) — 0 Fehler
- [ ] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [ ] Alle Views einmal durchklicken (Happy Path)
- [ ] WebSocket-Verbindung stabil ueber 5 Minuten
- [ ] Kein Console.error im Browser
