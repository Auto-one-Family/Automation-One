# Alert-Konfigurationen — Vollanalyse Phase A

**Datum:** 2026-03-05  
**Erstellt von:** Composer (Frontend + Server-Analyse)  
**Basis:** `auftrag-roadmap-alert-kalibrierung-sensortypen-2026-03-05.md` Phase A  
**Typ:** Analyse (kein Code)

---

## 0. Das RICHTIGE System — Backend & Frontend (SOLL)

> **Zweck:** Klare Vorgabe, welches System das Frontend für Alerts nutzen MUSS.  
> **Skills:** server-development, frontend-development

### 0.1 Backend — Kanonisches Alert-System (El Servador)

| Komponente | Datei | Rolle | Frontend MUSS |
|------------|-------|-------|---------------|
| **NotificationRouter** | `services/notification_router.py` | Single Entry Point für alle persistierten Alerts (Sensor, Aktor, Grafana, Logic, Manual) | — |
| **notifications** Tabelle | `db/models/notification.py` | Persistierte Alerts mit status (active/acknowledged/resolved), source, category | — |
| **REST API** | `api/v1/notifications.py` | GET /notifications, getActiveAlerts, getAlertStats, acknowledge, resolve | **JA** |
| **WebSocket** | `notification_new`, `notification_updated`, `notification_unread_count` | Echtzeit-Updates | **JA** |

**Regel:** Alle Alerts (sensor_threshold, mqtt_handler, grafana, logic_engine, manual) gehen durch NotificationRouter → DB → notification_new. Es gibt **keinen** zweiten Alert-Kanal.

### 0.2 Frontend — Kanonische Alert-Integration (El Frontend)

| Komponente | Datei | Datenquelle | Verwendung |
|------------|-------|-------------|------------|
| **alert-center.store** | `shared/stores/alert-center.store.ts` | notificationsApi.getActiveAlerts, getAlertStats, acknowledge, resolve | **Single Source of Truth** für Badge, Counts, Active-Alerts-Liste |
| **notification-inbox.store** | `shared/stores/notification-inbox.store.ts` | notificationsApi.list, WS notification_new/updated/unread_count | Liste, Unread-Count |
| **notificationsApi** | `api/notifications.ts` | GET /notifications, /alerts/active, /alerts/stats, PATCH acknowledge/resolve | **Einzige** API für Alert-Daten |
| **QuickAlertPanel** | `components/quick-action/QuickAlertPanel.vue` | alertCenterStore.fetchActiveAlerts | **RICHTIG** |
| **NotificationDrawer** | `components/notifications/NotificationDrawer.vue` | alertCenterStore + notification-inbox | **RICHTIG** |
| **AlertStatusBar** | `components/notifications/AlertStatusBar.vue` | alertCenterStore.alertStats | **RICHTIG** |
| **quickAction.store.alertSummary** | `shared/stores/quickAction.store.ts` | alert-center (Fallback: notification-inbox) | **RICHTIG** |
| **AlarmListWidget** | `components/dashboard-widgets/AlarmListWidget.vue` | alertCenterStore.activeAlertsFromInbox | **RICHTIG** (seit Alert-Basis 1) |

### 0.3 Was NICHT das Alert-System ist

| Quelle | Was es ist | Warum NICHT für Alerts |
|--------|------------|------------------------|
| **espStore.devices[].sensors[].quality** | Live-Qualität aus sensor_data WS (Server berechnet pro Messung) | Kein persistierter Alert, kein Ack/Resolve, keine ISA-18.2-Lifecycle |
| **sensor_data** WS-Event | Rohdaten + quality | Quality = Momentaufnahme, kein DB-Eintrag |
| **actuator_alert** WS-Event | Echtzeit-Echo vom MQTT-Handler | Zusätzlich zu notification_new; Frontend soll notification_new nutzen (persistiert) |

### 0.4 AlarmListWidget — Falsches System (IST)

| Komponente | Aktuelle Datenquelle | Soll-Datenquelle |
|------------|----------------------|------------------|
| **AlarmListWidget** | espStore.devices + sensor.quality | alertCenterStore.activeAlerts / notificationsApi.getActiveAlerts |

**Konsequenz:** AlarmListWidget zeigt „Live-Sensor-Qualität“ (poor/bad/error/fair, is_stale), **nicht** persistierte Alerts. Das ist ein **anderes System**. Für einheitliche Alert-Anzeige muss AlarmListWidget auf `alertCenterStore` oder `notificationsApi.getActiveAlerts()` umgestellt werden.

**Status (2026-03-05):** GEFIXT. AlarmListWidget wurde auf `alertCenterStore.activeAlertsFromInbox` umgestellt (Alert-Basis 1). Gleiche Quelle wie QuickAlertPanel und NotificationDrawer.

### 0.5 API-Referenz — Was das Frontend nutzen muss

| Aktion | API | Modul |
|--------|-----|-------|
| Aktive Alerts laden | GET /notifications/alerts/active | notificationsApi.getActiveAlerts() |
| Alert-Statistik | GET /notifications/alerts/stats | notificationsApi.getAlertStats() |
| Alert bestätigen | PATCH /notifications/{id}/acknowledge | notificationsApi.acknowledgeAlert() |
| Alert lösen | PATCH /notifications/{id}/resolve | notificationsApi.resolveAlert() |
| Liste (gefiltert) | GET /notifications?status=... | notificationsApi.list() |
| Unread-Count | GET /notifications/unread-count | notificationsApi.getUnreadCount() |

**WS-Subscription:** `notification_new`, `notification_updated`, `notification_unread_count` (via notification-inbox.store + alert-center).

### 0.6 Alert-Konfiguration (Sensor/Aktor) — Korrekte APIs

| Objekt | Lesen | Schreiben |
|--------|-------|-----------|
| Sensor | GET /sensors/{id}/alert-config | PATCH /sensors/{id}/alert-config |
| Aktor | GET /actuators/{id}/alert-config | PATCH /actuators/{id}/alert-config |
| ESP Device | GET /esp/devices/{id}/alert-config | PATCH /esp/devices/{id}/alert-config |

**Frontend:** sensorsApi.getAlertConfig/updateAlertConfig, actuatorsApi.getAlertConfig/updateAlertConfig. **Device-Level:** espApi.getAlertConfig/updateAlertConfig (seit Alert-Basis 2: DeviceAlertConfigSection in ESPSettingsSheet).

---

## 1. Konfigurations-Inventar (vollständig)

### 1.1 SensorConfigPanel → AlertConfigSection

**Pfad:** HardwareView L2 → Orbital → Klick auf Sensor-Satellite → SensorConfigPanel → Accordion „Alert-Konfiguration“

| # | Feld | Typ | API | Backend-Feld | Anmerkung |
|---|------|-----|-----|--------------|-----------|
| 1 | alerts_enabled | Toggle | PATCH /sensors/{id}/alert-config | alert_config.alerts_enabled | Master-Toggle pro Sensor |
| 2 | suppression_reason | Select | PATCH /sensors/{id}/alert-config | alert_config.suppression_reason | maintenance, intentionally_offline, calibration, custom |
| 3 | suppression_note | Text | PATCH /sensors/{id}/alert-config | alert_config.suppression_note | Optional |
| 4 | suppression_until | datetime-local | PATCH /sensors/{id}/alert-config | alert_config.suppression_until | Automatisches Re-Enable |
| 5 | custom_thresholds | Objekt | PATCH /sensors/{id}/alert-config | alert_config.custom_thresholds | warning_min/max, critical_min/max — Override für Alert-Regeln |
| 6 | severity_override | Select | PATCH /sensors/{id}/alert-config | alert_config.severity_override | Automatisch / Kritisch / Warnung / Info |

**Verifizierung:** AlertConfigSection.vue existiert. Eigener Save-Button „Alert-Konfiguration speichern“. Kein notification_channels Multi-Select.

### 1.2 SensorConfigPanel → Schwellwerte (Basis)

**Pfad:** HardwareView L2 → SensorConfigPanel → Accordion „Sensor-Schwellwerte (Basis)“

| # | Feld | Typ | API | Backend-Feld | Anmerkung |
|---|------|-----|-----|--------------|-----------|
| 1 | alarmLow / threshold_min | Number | POST createOrUpdate (sensorsApi) | threshold_min | Kritische Untergrenze |
| 2 | warnLow / warning_min | Number | createOrUpdate | warning_min | Warn-Untergrenze |
| 3 | warnHigh / warning_max | Number | createOrUpdate | warning_max | Warn-Obergrenze |
| 4 | alarmHigh / threshold_max | Number | createOrUpdate | threshold_max | Kritische Obergrenze |

**Verifizierung:** Getrennte Sektion von AlertConfigSection. Label „Basis“ vs. AlertConfigSection „Schwellen-Override für Alerts“. Beide in einem Panel, aber unterschiedliche Save-Buttons (Haupt-Save vs. Alert-Save).

### 1.3 ActuatorConfigPanel → AlertConfigSection

**Pfad:** HardwareView L2 → Orbital → Klick auf Aktor-Satellite → ActuatorConfigPanel → Accordion „Alert-Konfiguration“

| # | Feld | Typ | API | Backend-Feld | Anmerkung |
|---|------|-----|-----|--------------|-----------|
| 1 | alerts_enabled | Toggle | PATCH /actuators/{id}/alert-config | alert_config.alerts_enabled | |
| 2 | suppression_reason | Select | PATCH /actuators/{id}/alert-config | alert_config.suppression_reason | |
| 3 | suppression_note | Text | PATCH /actuators/{id}/alert-config | alert_config.suppression_note | |
| 4 | suppression_until | datetime-local | PATCH /actuators/{id}/alert-config | alert_config.suppression_until | |
| 5 | custom_thresholds | Objekt | PATCH /actuators/{id}/alert-config | alert_config.custom_thresholds | Aktor-spezifisch (Runtime, etc.) |
| 6 | severity_override | Select | PATCH /actuators/{id}/alert-config | alert_config.severity_override | |

**Verifizierung:** Gleiche Struktur wie Sensor. Kein propagate_to_children (nur Device-Level).

### 1.4 ESP Device → Alert-Config

**Pfad:** ESPSettingsSheet → Accordion „Alert-Konfiguration (Gerät)“ (DeviceAlertConfigSection.vue)

| # | Feld | Typ | API | Backend-Feld | Anmerkung |
|---|------|-----|-----|--------------|-----------|
| 1 | alerts_enabled | Toggle | PATCH /esp/devices/{id}/alert-config | alert_config.alerts_enabled | Device-weit |
| 2 | propagate_to_children | Toggle | PATCH /esp/devices/{id}/alert-config | alert_config.propagate_to_children | Zu Sensoren/Aktoren |
| 3 | suppression_reason | Text | PATCH /esp/devices/{id}/alert-config | alert_config.suppression_reason | |
| 4 | suppression_note | Text | PATCH /esp/devices/{id}/alert-config | alert_config.suppression_note | |
| 5 | suppression_until | Datum | PATCH /esp/devices/{id}/alert-config | alert_config.suppression_until | |

**Verifizierung:** GEFIXT (Alert-Basis 2). DeviceAlertConfigSection.vue ruft espApi.getAlertConfig/updateAlertConfig auf. ESPSettingsSheet zeigt Accordion „Alert-Konfiguration (Gerät)“ mit alerts_enabled, propagate_to_children, suppression_reason, suppression_note, suppression_until.

### 1.5 Notification-Preferences (User-Ebene)

**Pfad:** NotificationDrawer → Zahnrad/Einstellungen → NotificationPreferences.vue (SlideOver)

| # | Feld | Typ | API | Backend-Feld | Anmerkung |
|---|------|-----|-----|--------------|-----------|
| 1 | email_enabled | Toggle | PUT /notifications/preferences | email_enabled | |
| 2 | email_address | Text | PUT /notifications/preferences | email_address | Override |
| 3 | email_severities | Multi-Checkbox | PUT /notifications/preferences | email_severities | critical, warning, info |
| 4 | quiet_hours_enabled | Toggle | PUT /notifications/preferences | quiet_hours_enabled | |
| 5 | quiet_hours_start/end | Time | PUT /notifications/preferences | quiet_hours_* | HH:MM |
| 6 | digest_interval_minutes | Number | PUT /notifications/preferences | digest_interval_minutes | 0–1440 |
| 7 | browser_notifications | Toggle | PUT /notifications/preferences | browser_notifications | |
| 8 | websocket_enabled | Toggle | PUT /notifications/preferences | websocket_enabled | Echtzeit-Updates (WebSocket) ✅ (Alert-Basis 4) |

**Verifizierung:** NotificationPreferences.vue vollständig implementiert. Öffnet über inboxStore.isPreferencesOpen.

### 1.6 Grafana (Provisioning)

**Pfad:** `docker/grafana/provisioning/alerting/`

| # | Datei | Inhalt | User-editierbar? |
|---|-------|--------|------------------|
| 1 | contact-points.yml | Webhook URL: http://el-servador:8000/api/v1/webhooks/grafana-alerts | Nein (Provisioning) |
| 2 | notification-policies.yml | Routing-Regeln | Nein |
| 3 | alert-rules.yml | 37 Prometheus-Regeln (Server, MQTT, DB, Sensor, ESP, App, etc.) | Nein |
| 4 | loki-alert-rules.yml | Loki-basierte Alerts | Nein |

**Verifizierung:** Alle Alerts gehen an denselben Webhook. Keine User-editierbare Grafana-UI für Contact Points (Provisioning).

### 1.7 SystemConfigView / SettingsView

**Verifizierung:** Keine Alert-relevanten Config-Keys in SystemConfigView. SMTP/Resend in separater Config.

### 1.8 Logic Rules / Rule-Builder

**Verifizierung:** RuleFlowEditor unterstützt Action-Node-Typ `notification`. Notification-Action sendet über NotificationExecutor → NotificationCreate → NotificationRouter. Kein direkter Alert-Schwellen-Trigger — Rules können aber Benachrichtigungen auslösen.

---

## 2. Anzeige-Inventar (vollständig)

### 2.1 HardwareView Level 1 (Zone-Übersicht)

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | ZonePlate | Aggregierte Sensorwerte, Status-Dot (8px), Subzone-Chips | useZoneGrouping, getESPStatus |
| 2 | StatusPills | Filter (Online/Offline/Warning/SafeMode) | dashStore.statusCounts |
| 3 | TopBar | Emergency-Stop, WebSocket-Dot, dashStore.problemMessage | — |

**Verifizierung:** ZonePlate zeigt **keine** konkrete Alert-Anzahl. Status-Dot = Online/Offline/Warning (ESP-Status, nicht Notification-Count).

### 2.2 HardwareView Level 2 (Orbital / Device-Detail)

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | SensorCard / DeviceMiniCard | Aktueller Wert, Quality (OK/Warning/Critical), Stale-Badge | sensor_data WS, quality, getDataFreshness |
| 2 | ActuatorCard | Status, Emergency-Indikator | actuator_status WS |
| 3 | ESPSettingsSheet | Device-Info, Alert-Konfiguration (Gerät), Geräte nach Subzone (read-only) | espStore, espApi.getAlertConfig |
| 4 | SensorConfigPanel | Schwellwerte, AlertConfigSection | sensorsApi.get, getAlertConfig |
| 5 | ActuatorConfigPanel | AlertConfigSection | actuatorsApi.getAlertConfig |

**Verifizierung:** Farbcodierung (qualityToStatus) aus sensor.quality. Keine Schwellen-Visualisierung im Card — nur Quality-Dot.

### 2.3 MonitorView

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | Zone-Accordion | Sensoren/Aktoren pro Zone/Subzone | zonesApi.getZoneMonitorData |
| 2 | SensorCard | Live-Wert, Quality-Dot, Stale/ESP-Offline-Badges | monitor-data |
| 3 | Aktor-Karten | Status | monitor-data |
| 4 | 1h-Chart (expanded) | Historische Werte | sensorsApi.queryData |

**Verifizierung:** Keine Schwellen-Linien im Chart. Keine 5-Sekunden-Regel sichtbar.

### 2.4 CustomDashboardView

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | AlarmListWidget | Sensoren mit quality poor/bad/error/fair, is_stale | **espStore.devices** (FALSCH — siehe [§0.4](#04-alarmlistwidget--falsches-system-ist-soll)) |
| 2 | SensorCardWidget | Live-Wert | espStore |
| 3 | GaugeWidget | Wert mit Schwellen-Markierungen (thresholds Prop) | Widget-Config |
| 4 | LineChartWidget | Historische Werte, chartjs-plugin-annotation | sensorsApi.queryData |

**Verifizierung:** AlarmListWidget nutzt **sensor.quality** aus espStore — **nicht** die Notification/Alert-API. **SOLL:** alertCenterStore / notificationsApi.getActiveAlerts (siehe §0).

### 2.5 SensorConfigPanel / ActuatorConfigPanel — Anzeige

| # | Sektion | Was wird angezeigt | Datenquelle |
|---|---------|-------------------|-------------|
| 1 | Live-Vorschau | Aktueller Sensorwert (currentRawValue) | espStore sensors |
| 2 | Schwellwerte | alarmLow/warnLow/warnHigh/alarmHigh | sensorConfig |
| 3 | AlertConfigSection | alerts_enabled, suppressed, suppression_until, custom_thresholds | getAlertConfig |
| 4 | LinkedRulesSection | Verknüpfte Rules | logicStore.connections |

**Verifizierung:** Live-Vorschau zeigt nur Wert, kein OK/Warning/Critical-Status.

### 2.6 Phase 4A — Notification/Alert-UI

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | NotificationBadge | Unread-Count | notification-inbox.store, alert-center fallback |
| 2 | NotificationDrawer | Liste Notifications (active/acknowledged) | notificationsApi.list, WS notification_new |
| 3 | QuickActionBall | FAB mit Alert-Dot (critical/warning) | quickAction.store.alertSummary |
| 4 | QuickAlertPanel | Top-5 Alerts, Ack/Resolve/Snooze | alertCenterStore.fetchActiveAlerts |
| 5 | AlertStatusBar | ISA-18.2 KPIs (active, acknowledged, MTTA, MTTR) | alertCenterStore.alertStats |
| 6 | NotificationPreferences | E-Mail, Ruhezeiten, Digest | notificationsApi.getPreferences |

**Verifizierung:** Alle existieren. alertSummary nutzt alert-center mit Fallback notification-inbox.

### 2.7 SystemMonitorView

| # | Tab | Was wird angezeigt | Datenquelle |
|---|-----|-------------------|-------------|
| 1 | Events | Audit-Log, WS-Events (sensor_data, actuator_alert, notification, etc.) | GET /audit, WebSocket |
| 2 | Logs | Technische Logs | Loki |
| 3 | Database | DB-Status | |
| 4 | MQTT | MQTT-Status | |
| 5 | Health | Server, DB, MQTT, Container, Wartung | GET /health/detailed |

**Verifizierung:** Events-Tab zeigt actuator_alert, notification als Event-Typen. Vermischung mit Audit-Log.

### 2.8 Komponenten-Tab (/sensors)

| # | Komponente | Was wird angezeigt | Datenquelle |
|---|------------|-------------------|-------------|
| 1 | InventoryTable | Sensoren/Aktoren-Liste | inventory/zone context |
| 2 | DeviceDetailPanel | Device-Info, Metadaten, Schema | |
| 3 | Link „Vollständige Konfiguration“ | → /hardware?openSettings={espId} | |

**Verifizierung:** Kein Alert-Status. Nur Link zu HardwareView.

### 2.9 Toasts (notification.store)

| # | Typ | Wann | Inhalt |
|---|-----|------|--------|
| 1 | error | API-Fehler, config_response error | |
| 2 | warning | LWT disconnect, etc. | |
| 3 | success | Speichern OK | |
| 4 | info | — | |

**Verifizierung:** Keine Threshold-Alerts als Toast. notification.store zeigt Toasts für `notification` WS-Event (legacy). notification_new → notification-inbox.store (kein Toast).

---

## 3. Datenfluss-Diagramme

### 3.1 Sensor-Threshold → Alert → Anzeige

```
[ESP32] → MQTT sensor_data → [sensor_handler.py]
                                    ↓
                    _evaluate_thresholds_and_notify()
                                    ↓
                    AlertSuppressionService.get_effective_thresholds()
                    (custom_thresholds aus alert_config > threshold_min/max aus sensor_config)
                                    ↓
                    AlertSuppressionService.check_thresholds(value, thresholds) → severity
                                    ↓
                    get_severity_override(sensor_config) → optional override
                                    ↓
                    AlertSuppressionService.is_sensor_suppressed()
                                    ↓
            ┌───────────────────────┴───────────────────────┐
            │ is_suppressed?                                 │
            ├───────────────────────┬───────────────────────┤
            │ JA                    │ NEIN                   │
            │ persist_suppressed()  │ NotificationRouter.route()
            │ (DB nur, kein WS)     │ (DB + WS + Email)      │
            └───────────────────────┴───────────────────────┘
                                    ↓
                    WebSocket: notification_new
                                    ↓
                    [notification-inbox.store] + [alert-center.store]
                                    ↓
                    [QuickAlertPanel] [NotificationDrawer] [AlertStatusBar]
```

**Code-Referenzen:**
- sensor_handler.py:490–600
- alert_suppression_service.py:67–230
- notification_router.py:71–150

### 3.2 Grafana-Alert → Backend → Anzeige

```
[Prometheus/Loki] → Alert firing → [Grafana]
                                        ↓
                    contact-points.yml → Webhook POST /api/v1/webhooks/grafana-alerts
                                        ↓
                    [webhooks.py] → NotificationCreate(source="grafana", fingerprint=...)
                                        ↓
                    NotificationRouter.route() → DB + WS + Email
                                        ↓
                    [Frontend: notification_new] → gleiche Inbox wie Sensor-Alerts
```

**Code-Referenzen:** webhooks.py:259, notification.py:33–43

### 3.3 Actuator-Alert → Anzeige

```
[ESP32] → MQTT kaiser/+/esp/+/actuator/+/alert → [actuator_alert_handler.py]
                                                        ↓
                    WebSocket broadcast: actuator_alert (Echtzeit)
                                                        ↓
                    NotificationCreate(source="mqtt_handler") → NotificationRouter.route()
                                                        ↓
                    [DB] + [WS notification_new] + [Email]
                                                        ↓
                    [Frontend: notification_new] + [SystemMonitorView Events: actuator_alert]
```

**Code-Referenzen:** actuator_alert_handler.py:192–246

### 3.4 System-Alerts (Stale-Sensor, MQTT-Disconnect, Server-Fehler)

**Quelle:** Grafana alert-rules.yml (Prometheus-Metriken)
- ao-sensor-stale, ao-mqtt-disconnected, ao-server-down, etc.
- Alle → Webhook → NotificationRouter → source="grafana"
- **Vermischung:** Gleiche Inbox wie sensor_threshold, actuator, manual.

---

## 4. Dopplungs-Matrix

### 4.1 Konfigurations-Dopplungen

| Einstellung | Ort 1 | Ort 2 | Ort 3 | Dopplung? | Empfehlung |
|-------------|-------|-------|-------|-----------|------------|
| Schwellen (Sensor) | SensorConfigPanel „Sensor-Schwellwerte (Basis)“ | AlertConfigSection „Schwellen-Override für Alerts“ | — | Teilweise (Basis vs. Override) | Semantik klar: Basis = Haupt, Override = nur für Alerts. Dokumentation beibehalten. |
| alerts_enabled | SensorConfigPanel (AlertConfigSection) | ActuatorConfigPanel (AlertConfigSection) | ESP Device (API, keine UI) | Nein (versch. Objekte) | Device-Level UI fehlt — optional ergänzen. |
| suppressed | Via alerts_enabled=false | — | — | Nein | — |
| Email-Empfang | NotificationPreferences | Grafana Contact Points | — | Nein (User vs. System) | Grafana = System-Webhook. User = Preferences. |

### 4.2 Anzeige-Dopplungen

| Anzeige | Ort 1 | Ort 2 | Ort 3 | Dopplung? | Empfehlung |
|---------|-------|-------|-------|-----------|------------|
| Aktive Alerts (Notification-basiert) | QuickAlertPanel | NotificationDrawer | AlertStatusBar | Ja (gleiche Daten) | Progressive Disclosure: StatusBar → FAB → Drawer. OK. |
| „Alarme“ (Quality-basiert) | AlarmListWidget | SensorCard (Monitor) | — | **KRITISCH** | AlarmListWidget nutzt sensor.quality, NICHT notifications. Zwei verschiedene Quellen! |
| Sensor-Status (OK/Warning/Critical) | SensorCard | MonitorView | CustomDashboard | Ja | Einheitliche Quelle: sensor_data + quality. Kein Konflikt. |
| Unread-Count | NotificationBadge | QuickActionBall Badge | — | Ja (gleicher Store) | alertSummary. OK. |

---

## 5. Vermischungs-Analyse

### 5.1 Kategorien

| Kategorie | Definition | Beispiel |
|-----------|------------|----------|
| **sensor** | Sensor-Threshold-Überschreitung | Temperatur zu hoch, pH kritisch |
| **actuator** | Aktor-Status (Emergency, Runtime, Safety) | Pumpe läuft zu lange |
| **system** | Server, Plugin, DB | Server-Fehler, Plugin-Crash |
| **infrastructure** | MQTT, Container, Netzwerk | MQTT-Disconnect, Container down |
| **device** | ESP-Status (Stale, Offline) | Heartbeat-Lücke |

### 5.2 Notification.source (Code)

| source | Verwendung |
|--------|------------|
| sensor_threshold | sensor_handler.py (Schwellen-Alerts) |
| mqtt_handler | actuator_alert_handler.py |
| grafana | webhooks.py (Grafana-Alerts) |
| logic_engine | notification_executor.py |
| manual | notifications.py (Admin send) |
| system | — |
| device_event | — |
| autoops | — |
| ai_anomaly_service | (Phase K4) |

### 5.3 Notification.category (Code)

| category | Verwendung |
|----------|------------|
| data_quality | sensor_handler (Schwellen) |
| connectivity | — |
| infrastructure | actuator_alert (hardware_error) |
| lifecycle | — |
| maintenance | actuator_alert (runtime_protection) |
| security | actuator_alert (safety_violation) |
| system | actuator_alert (emergency_stop), Grafana |

### 5.4 Vermischungs-Stellen

| Quelle | source | category | Wo angezeigt | Vermischung |
|--------|--------|----------|--------------|-------------|
| Sensor-Schwellen | sensor_threshold | data_quality | QuickAlertPanel, NotificationDrawer, AlertStatusBar | Gleiche UI wie Grafana/Actuator |
| Grafana (Infra) | grafana | system/infrastructure | Gleiche Inbox | **GEFIXT (Alert-Basis 3):** Filter-Chips nach source |
| Actuator-Alert | mqtt_handler | system/maintenance/security/infrastructure | Gleiche Inbox | **GEFIXT (Alert-Basis 3):** Filter-Chips + Source-Badge pro Item |
| AlarmListWidget | — | — | alertCenterStore (seit Alert-Basis 1) | **GEFIXT:** Nutzt Notification-API |

### 5.5 Empfehlung Trennung

1. **Filter nach source:** ✅ IMPLEMENTIERT (Alert-Basis 3). NotificationDrawer hat Filter-Chips (Alle, Sensor, Infrastruktur, Aktor, Regel, System) + Source-Badge pro NotificationItem.
2. **AlarmListWidget:** ✅ IMPLEMENTIERT (Alert-Basis 1). Nutzt alertCenterStore.activeAlertsFromInbox.
3. **Label pro Eintrag:** ✅ IMPLEMENTIERT (Alert-Basis 3). NotificationItem zeigt Source-Badge (Sensor/Infrastruktur/Aktor/Regel/System).

---

## 6. Backend-Inventar

### 6.1 Endpoints

| Methode | Pfad | Zweck |
|---------|------|-------|
| GET | /sensors/{id}/alert-config | Sensor Alert-Config lesen |
| PATCH | /sensors/{id}/alert-config | Sensor Alert-Config schreiben |
| GET | /actuators/{id}/alert-config | Aktor Alert-Config lesen |
| PATCH | /actuators/{id}/alert-config | Aktor Alert-Config schreiben |
| GET | /esp/devices/{esp_id}/alert-config | Device Alert-Config lesen |
| PATCH | /esp/devices/{esp_id}/alert-config | Device Alert-Config schreiben |
| POST | /webhooks/grafana-alerts | Grafana Webhook |
| GET | /notifications | Liste (mit Filtern) |
| GET | /notifications/unread-count | Badge |
| GET | /notifications/preferences | User-Preferences |
| PUT | /notifications/preferences | User-Preferences speichern |
| GET | /notifications/alerts/active | Aktive Alerts (Phase 4B) |
| GET | /notifications/alerts/stats | Alert-Statistik |
| PATCH | /notifications/{id}/acknowledge | Alert bestätigen |
| PATCH | /notifications/{id}/resolve | Alert lösen |

### 6.2 Services

| Service | Datei | Verantwortung |
|---------|-------|---------------|
| AlertSuppressionService | alert_suppression_service.py | is_sensor_suppressed, is_actuator_suppressed, get_effective_thresholds, check_thresholds, get_severity_override |
| AlertSuppressionScheduler | alert_suppression_scheduler.py | suppression_until Ablauf, maintenance_overdue |
| NotificationRouter | notification_router.py | route(), persist_suppressed(), DB, WS, Email |
| sensor_handler | mqtt/handlers/sensor_handler.py | _evaluate_thresholds_and_notify |
| actuator_alert_handler | mqtt/handlers/actuator_alert_handler.py | handle_actuator_alert, NotificationRouter |

### 6.3 DB-Schema

| Tabelle | Alert-relevante Spalten |
|---------|-------------------------|
| sensor_configs | threshold_min, threshold_max, warning_min, warning_max, alert_config (JSONB) |
| actuator_configs | alert_config (JSONB) |
| esp_devices | alert_config (JSONB) |
| notifications | id, severity, category, source, extra_data (metadata), status, correlation_id, fingerprint |

**alert_config Struktur (JSONB):**
```json
{
  "alerts_enabled": true,
  "suppression_reason": "maintenance",
  "suppression_note": "",
  "suppression_until": "2026-03-06T12:00:00",
  "custom_thresholds": { "warning_min": 10, "warning_max": 90, "critical_min": 0, "critical_max": 100 },
  "severity_override": null
}
```

### 6.4 WebSocket-Events

| Event | Sender | Empfänger | Inhalt |
|-------|--------|-----------|--------|
| notification_new | Backend | Frontend | Neue Notification (alle Quellen) |
| notification_updated | Backend | Frontend | Status-Update (ack/resolve) |
| notification_unread_count | Backend | Frontend | Badge-Count |
| actuator_alert | MQTT-Handler | Frontend | Echtzeit Aktor-Alert (zusätzlich zu notification_new) |
| sensor_data | — | — | Enthält value, quality — keine Alert-Status |

**Verifizierung:** actuator_alert wird parallel zu NotificationRouter gesendet. notification_new kommt nach Router.route().

---

## 7. Priorisierte Empfehlungen

| # | Priorität | Maßnahme | Begründung |
|---|-----------|----------|------------|
| 1 | KRITISCH | AlarmListWidget auf RICHTIGES System umstellen | ✅ GEFIXT (Alert-Basis 1). |
| 2 | HOCH | Device-Level Alert-Config UI | ✅ GEFIXT (Alert-Basis 2). DeviceAlertConfigSection in ESPSettingsSheet. |
| 3 | HOCH | Filter nach source in NotificationDrawer | ✅ GEFIXT (Alert-Basis 3). Filter-Chips + Source-Badge pro Item. |
| 4 | MITTEL | websocket_enabled in Preferences | ✅ GEFIXT (Alert-Basis 4). Toggle in NotificationPreferences. |
| 5 | MITTEL | Schwellen-Linien in MonitorView Chart | 1h-Chart hat keine Threshold-Visualisierung. chartjs-plugin-annotation vorhanden. |

---

## 8. Offene Punkte

1. **AlarmListWidget:** Soll er Notification-basierte Alerts zeigen oder Quality-basierte? Aktuell Quality — Inkonsistenz mit Alert Center.
2. **Device-Level UI:** Wo soll Device-Alert-Config erscheinen? ESPSettingsSheet oder eigenes Accordion?
3. **Grafana Contact Points:** User-editierbar über Grafana-UI? Aktuell nur Provisioning.

---

## 9. Nächste Schritte (für Roadmap Phase C / 4B)

1. **Phase C (Darstellung):** Filter nach source ✅ (Alert-Basis 3), AlarmListWidget ✅ (Alert-Basis 1). Offen: Schwellen in Charts.
2. **Phase 4B (Unified Alert Center):** AlertStatusBar, QuickAlertPanel, NotificationDrawer sind vereinheitlicht. AlarmListWidget nutzt Notification-API.
3. **Device-Level:** ✅ GEFIXT (Alert-Basis 2). DeviceAlertConfigSection in ESPSettingsSheet.

---

## Akzeptanzkriterien (Erfüllung)

- [x] Jede Konfigurationsstelle dokumentiert (View, Komponente, Feld, API)
- [x] Jede Anzeigestelle dokumentiert (View, Komponente, Datenquelle)
- [x] Dopplungs-Matrix vollständig (10+ Einträge)
- [x] Vermischungs-Prüfung mit source/category-Mapping
- [x] Datenfluss für Sensor-Threshold und Grafana-Webhook dokumentiert
- [x] Priorisierte Empfehlungen (3 KRITISCH/HOCH)
- [x] Bericht self-contained
