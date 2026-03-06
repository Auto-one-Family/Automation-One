# State-, Alert- und Diagnostik-Übersicht

> **Zweck:** Einheitliche Landkarte aller Zustände (Aktoren, Sensoren, Geräte), wo sie herkommen, wo sie genutzt werden, und wie sie mit Alerts/Diagnostics zusammenhängen. Basis für gezielte Analyse und „gerade ziehen“ von Dopplungen und langen Ketten.

---

## 1. Geräte-State (ESP / Device)

### 1.1 Wo liegt was?

| Konzept | Persistenz | Ort (Backend) | Ort (Frontend) |
|--------|------------|----------------|-----------------|
| **status** | DB | `esp_devices.status` | `espStore.devices[].status` |
| **last_seen** | DB | `esp_devices.last_seen` | `espStore.devices[].last_seen` |
| **health_status** | DB | `esp_devices.health_status` | optional in Response |
| **is_online** | abgeleitet | `status == "online"` (Property auf Model) | wie status |

**Mögliche Werte `status`:** `online`, `offline`, `error`, `unknown`, `pending_approval`, `approved`, `rejected`.

### 1.2 Wer schreibt status/last_seen?

| Quelle | Datei | Aktion |
|--------|--------|--------|
| Heartbeat | `mqtt/handlers/heartbeat_handler.py` | `update_status(esp_id, "online", last_seen)`; bei Timeout-Job → `"offline"` |
| LWT (Last Will) | `mqtt/handlers/lwt_handler.py` | Bei Will-Nachricht → `update_status(esp_id, "offline")` (sofort Offline) |
| Discovery | `mqtt/handlers/discovery_handler.py` | Neues Gerät → `pending_approval`; bestehend approved → `online` |
| Approval/Reject | `api/v1/esp.py` (approve/reject) | `approved` → danach erst bei nächstem Heartbeat `online` |

**Repository:** `db/repositories/esp_repo.py` → `update_status()`, `get_by_status()`.

### 1.3 Heartbeat-Time-Series (zusätzlich zur Tabelle esp_devices)

| Konzept | Tabelle | Zweck |
|--------|---------|--------|
| Verlauf | `esp_heartbeat_logs` | Zeitreihe: heap_free, wifi_rssi, uptime, health_status, data_source |

**Geschrieben von:** `heartbeat_handler.py` (optional, wenn Logging aktiv).  
**Gelesen von:** Analytics, Diagnostics, Health-Checks.  
**Hinweis:** `esp_devices.health_status` ist der „letzte“ Wert; Verlauf nur in `esp_heartbeat_logs`.

### 1.4 Ketten / Dopplungen (Gerät)

- **Zwei Wege zu „offline“:** LWT (sofort) und Heartbeat-Timeout-Job (z.B. 300 s). Beide rufen `update_status(..., "offline")` – konsistent, aber zwei Einstiegspunkte.
- **status vs. health_status:** `status` = Lebenszeichen (online/offline); `health_status` = bewertete Gesundheit (healthy/degraded/…). Beide auf `esp_devices` – klar trennen, damit keine Mischlogik entsteht.

---

## 2. Aktor-State

### 2.1 Wo liegt was?

| Konzept | Persistenz | Ort (Backend) | Ort (Frontend) |
|--------|------------|----------------|-----------------|
| Laufzustand (an/aus, PWM) | DB | `actuator_states` (state, current_value, last_command_timestamp) | `espStore.devices[].actuators[].state`, `pwm_value` |
| **emergency_stopped** | DB + RAM | DB: `actuator_states.state == 'emergency_stop'`; RAM: `SafetyService._emergency_stop_active` | `actuator.emergency_stopped` (Store + Monitor-Daten) |
| Config (Name, GPIO, Limits) | DB | `actuator_configs` | Enrichment aus `actuatorsApi.list()` → device.actuators[] |

**Werte `actuator_states.state`:** `idle`, `active`, `error`, `emergency_stop`.

### 2.2 Wer schreibt actuator_states?

| Quelle | Datei | Aktion |
|--------|--------|--------|
| MQTT Aktor-Status | `mqtt/handlers/actuator_handler.py` | Payload state (on/off/pwm/error) → `update_state(..., state=...)` (kein `emergency_stop` hier; Validator erlaubt nur on/off/pwm/error/unknown) |
| MQTT Aktor-Alert | `mqtt/handlers/actuator_alert_handler.py` | Bei emergency_stop/runtime_protection/safety_violation → `update_state(..., state="off", ...)` (nicht `emergency_stop`) |
| Clear Emergency (Fix) | `api/v1/actuators.py` (clear_emergency) | `actuator_repo.clear_emergency_states(esp_ids)` → alle `emergency_stop` → `idle` |
| Startup | `main.py` (Lifespan) | `clear_all_emergency_states_on_startup()` → alle `emergency_stop` → `idle` |

**Wichtig:** „Not-Aus“ in der UI kommt aus **actuator_states.state == 'emergency_stop'** (Monitor-Daten) bzw. aus WebSocket (Store). SafetyService ist nur RAM – blockiert Befehle, liefert aber keine Anzeige nach Neustart.

### 2.3 Wer liest actuator_states?

| Consumer | Datei | Verwendung |
|----------|--------|------------|
| Monitor L2 (Zone) | `services/monitor_data_service.py` | `emergency_stopped = (state.state == "emergency_stop")`; SubzoneActuatorEntry |
| GET /zone/{id}/monitor-data | `api/v1/zone.py` | → MonitorDataService → Frontend MonitorView (Subzonen-Accordion) |
| Evtl. Aktor-Liste | `api/v1/actuators.py` (list) | Wenn Response ActuatorState einbindet → gleiche Tabelle |

**Frontend:**

- **TopBar Not-Aus-Button:** `EmergencyStopButton.vue` → `espStore.devices[].actuators[].emergency_stopped`. Quelle: Enrichment (default false) + **WebSocket** (`actuator_alert`, `actuator_status.emergency`). Nach Reload: Enrichment/List-API; wenn List-API actuator_states liefert, dann kommt „Not-Aus“ aus DB.
- **MonitorView (L2):** `zonesApi.getZoneMonitorData(zoneId)` → direkt aus **actuator_states** (MonitorDataService).

### 2.4 Ketten / Dopplungen (Aktor)

- **Zwei Quellen für emergency:** (1) SafetyService (RAM, Validierung), (2) DB `actuator_states.state`. Klarstellung: Anzeige = DB (und WebSocket); Blockade = SafetyService. Fix: DB bei clear_emergency und beim Start bereinigen.
- **Alert-Handler schreibt state="off":** Aktuell setzt actuator_alert_handler bei Emergency `state="off"`, nicht `"emergency_stop"`. Wenn irgendwo doch `emergency_stop` in die DB kommt (z.B. alter Code/ESP-Payload), bleibt er bis Clear/Startup – jetzt durch Fix abgefangen.

---

## 3. Sensor-State / Sensor-Daten

### 3.1 Wo liegt was?

| Konzept | Persistenz | Ort (Backend) | Ort (Frontend) |
|--------|------------|----------------|-----------------|
| Konfiguration | DB | `sensor_configs` (GPIO, Typ, Kalibrierung, thresholds, alert_config) | Enrichment / Config-APIs |
| Zeitreihe Messwerte | DB | `sensor_data` (raw_value, processed_value, unit, quality, timestamp, zone_id, subzone_id) | Monitor: neueste Werte aus monitor-data; ggf. Charts/History-API |
| Qualität | DB | `sensor_data.quality` (good, fair, poor, error) | Anzeige in Monitor/Karten |

**Alert-relevant:** `sensor_configs.thresholds`, `sensor_configs.alert_config` (Suppression, Severity-Override).

### 3.2 Wer schreibt sensor_data?

| Quelle | Datei | Aktion |
|--------|--------|--------|
| MQTT Sensor-Daten | `mqtt/handlers/sensor_handler.py` | Payload → SensorService/Processing → `sensor_repo.save_data()`; optional LogicEngine, NotificationRouter (Schwellen/Alerts) |

### 3.3 Wer liest sensor_data (für Anzeige/Alerts)?

| Consumer | Datei | Verwendung |
|----------|--------|------------|
| Monitor L2 | `services/monitor_data_service.py` | Neueste Werte pro (esp_id, gpio, sensor_type) → SubzoneSensorEntry (value, unit, quality) |
| GET /zone/{id}/monitor-data | wie oben | Ein Kanal für alle Monitor-Sensorwerte |
| Sensor-Threshold-Alerts | `sensor_handler.py` + NotificationRouter | Schwellenprüfung → Notification erstellen → route() |

### 3.4 Ketten / Dopplungen (Sensor)

- **Schwellen an zwei Stellen denkbar:** (1) Sensor-Library/Processing (Plausibilität, quality), (2) Logic Engine / Alert-Logik. Dokumentieren: Welche Schwellen sind nur Alert, welche auch für quality?
- **sensor_data vs. sensor_configs:** Config = statisch; Daten = Zeitreihe. Klar trennen; Alert-Config (Suppression etc.) lebt in configs, nicht in sensor_data.

---

## 4. Subzone-State

| Konzept | Persistenz | Ort | Hinweis |
|--------|------------|-----|--------|
| **safe_mode_active** | DB | `subzone_configs.safe_mode_active` | Pro Subzone; default True. Unabhängig von globalem Not-Aus (SafetyService/actuator_states). |

**Schreiben:** SubzoneService (`enable_safe_mode` / `disable_safe_mode`), API Subzone-Endpoints.  
**Lesen:** KaiserService (Hierarchie), Monitor/Subzone-APIs.  
**Kette:** Subzone safe_mode ist geräte-/subzonenbezogen; globaler Not-Aus ist SafetyService + actuator_states – nicht vermischen.

---

## 5. Alert- und Notification-System

### 5.1 Zentrale Route

**Jede Benachrichtigung soll durch eine Stelle laufen:**

| Komponente | Datei | Rolle |
|------------|--------|--------|
| **NotificationRouter** | `services/notification_router.py` | route(): Persistenz → Dedup (fingerprint/correlation_id/title) → WebSocket → E-Mail (severity-basiert) |
| **Notification (DB)** | `db/models/notification.py` | notifications (user_id, channel, severity, category, status, fingerprint, correlation_id, …) |

### 5.2 Wer erzeugt Notifications (ruft Router/route auf)?

| Quelle | Datei | Auslöser |
|--------|--------|----------|
| Sensor-Schwelle / Data-Quality | `mqtt/handlers/sensor_handler.py` | Nach save_data; Schwellenprüfung; ggf. AlertSuppression prüfen → NotificationRouter.route() |
| Aktor-Alert (MQTT) | `mqtt/handlers/actuator_alert_handler.py` | emergency_stop, runtime_protection, … → WebSocket broadcast + ggf. Notification |
| Logic Engine | `logic/actions/notification_executor.py` | Regel-Aktion „notification“ → NotificationRouter.route() |
| Emergency Stop (API) | `api/v1/actuators.py` (emergency_stop) | WebSocket broadcast `actuator_alert` (zusätzlich zu Audit) |
| Webhooks (z.B. Grafana) | `api/v1/webhooks.py` | Externe Alerts → NotificationRouter.route() |
| Alert-Suppression-Scheduler | `services/alert_suppression_scheduler.py` | Ablauf Suppression → ggf. route() |
| AI-Bridge | `services/ai_notification_bridge.py` | Anomalie → route() |

### 5.3 Alert-Konfiguration (Unterdrückung, Kategorien)

| Ebene | Ort | Inhalt |
|-------|-----|--------|
| Gerät | `esp_devices.alert_config` | alerts_enabled, suppression_reason/note/until, propagate_to_children |
| Sensor | `sensor_configs.alert_config` | analog pro Sensor |
| Aktor | `actuator_configs.alert_config` | analog |
| Suppression (ISA-18.2) | AlertSuppressionService | Shelved-Alarms-Logik; Scheduler für Ablauf |

**Prüfpunkt:** AlertSuppression vor NotificationRouter – wo genau wird wo geprüft (device vs. sensor vs. global)?

### 5.4 Ketten / Dopplungen (Alerts)

- **Aktor-Alert:** actuator_alert_handler broadcastet WebSocket **und** schreibt History; emergency_stop im API schreibt Audit + WebSocket. Keine zentrale „eine Notification pro Event“-Regel für Aktor – prüfen ob Doppel-Benachrichtigungen möglich sind.
- **Mehrere Einstiege in NotificationRouter:** gewollt (ein Router, viele Quellen); aber Dedup (fingerprint, correlation_id, title) und Kategorien einheitlich definieren.
- **notification.status vs. is_read:** Status (active/acknowledged/resolved) für Alert-Lifecycle; is_read für „gelesen“. Beide in einem Model – klare Semantik dokumentieren.

---

## 6. Diagnostics

### 6.1 Diagnostik-Checks (modular)

| Check-Name | Datei | Kurzbeschreibung |
|------------|--------|-------------------|
| esp_devices | `diagnostics_service.py` | Geräte-Status, online/offline, Counts |
| sensors | `_check_sensors` | Configs, mit alert_config, Counts |
| actuators | `_check_actuators` | Configs, States (evtl. emergency) |
| monitoring | `_check_monitoring` | Heartbeat/Health-Daten |
| logic_engine | `_check_logic_engine` | Regeln, Scheduler |
| **alerts** | `_check_alerts` | NotificationRepo.get_alert_stats(), ISA-18.2 Rate, stehende Alarme |
| plugins | `_check_plugins` | Plugin-Status |

**Persistenz:** `diagnostic_reports` (overall_status, started_at, finished_at, checks JSON, triggered_by).

### 6.2 Wo Diagnostics lesen

- **Alerts-Check:** NotificationRepository (notifications), keine actuator_states. Für „Not-Aus“-Übersicht müsste man gezielt actuator_states oder SafetyService anbinden, falls gewünscht.
- **Actuators-Check:** aktuell Config-fokussiert; ob actuator_states (z.B. emergency_stop-Count) einfließt, in `_check_actuators` prüfen.

### 6.3 Ketten / Dopplungen (Diagnostics)

- **Alerts vs. actuator emergency:** Diagnostics „alerts“ = Notification-Tabelle; „Aktor im Not-Aus“ = actuator_states/SafetyService. Zwei verschiedene Blickwinkel – in Übersicht/Dashboard klar benennen.
- **Ein Report = viele Checks:** Ein Run erzeugt einen Report mit allen Checks; keine doppelte Persistenz pro Check.

---

## 7. Frontend – wo kommt State her?

| Anzeige / Aktion | Datenquelle | Backend-Origin |
|------------------|-------------|-----------------|
| Geräteliste (Status, last_seen) | espStore.devices | GET /v1/esp/devices (esp_devices) |
| Not-Aus-Button (grün/rot) | espStore.devices[].actuators[].emergency_stopped | Enrichment (actuatorsApi.list) + WebSocket (actuator_alert, actuator_status) |
| Monitor L2 (Sensoren/Aktoren pro Subzone) | zonesApi.getZoneMonitorData(zoneId) | GET /v1/zone/{id}/monitor-data → MonitorDataService (sensor_data, actuator_states, subzone_configs) |
| Aktor ein/aus, Not-Aus-Anzeige (Monitor) | wie oben | actuator_states (state, emergency_stop) |
| Live-Updates (Aktor/Sensor) | WebSocket | actuator_status, sensor_data, esp_health, actuator_alert |

**Kritisch:** Nach Neustart kommt „Not-Aus“ nur dann korrekt weg, wenn (1) actuator_states beim Clear und beim Startup bereinigt werden (erledigt) und (2) die Liste/Enrichment für Aktoren ggf. actuator_states vom Server bekommt (prüfen, ob actuatorsApi.list ActuatorState liefert).

---

## 8. Empfohlene Prüfliste (Alert/Diagnostics „gerade ziehen“)

1. **Eine Definition von „emergency“:** Nur actuator_states.state + SafetyService; Subzone safe_mode getrennt halten; in Doku und Variablennamen einheitlich.
2. **Alert-Quellen auflisten:** Alle Aufrufer von NotificationRouter.route() und alle direkten WebSocket-Broadcasts für Alerts (actuator_alert, …) – prüfen auf Doppel-Events pro realem Vorgang.
3. **Suppression-Ebenen:** Device vs. Sensor vs. Actuator alert_config + AlertSuppressionService – Reihenfolge und Vererbung (propagate_to_children) klar dokumentieren und testen.
4. **Diagnostics „alerts“ vs. „actuator emergency“:** Entweder im Alerts-Check actuator_states (emergency_stop) erwähnen oder separater kleiner Check „actuator_emergency“; keine stillen Doppel-Begriffe.
5. **Sensor-Schwellen:** Eine Stelle, die „Alert-Schwelle“ definiert (sensor_configs.thresholds / alert_config); Logic Engine und Sensor-Handler darauf beziehen, keine zweite parallele Schwellenlogik.
6. **Lange Ketten:** MQTT → Handler → Service → Repo → DB ist Standard. Prüfen: Gibt es Pfade wie MQTT → Handler → NotificationRouter + gleichzeitig Handler → WebSocket direkt? Wenn ja, bewusst und dokumentiert (z.B. actuator_alert: DB + History + WebSocket).
7. **Frontend eine Quelle pro Anzeige:** Pro Bildschirm-Element eine klare Quelle (Store vs. Monitor-API vs. WebSocket); keine Mischlogik „teils aus Store, teils aus Monitor“ für dasselbe Feld ohne Kommentar.

---

## 9. Datei-Index (schnell finden)

| Thema | Backend | Frontend |
|-------|--------|----------|
| Geräte-Status | `db/models/esp.py`, `mqtt/handlers/heartbeat_handler.py`, `lwt_handler.py`, `db/repositories/esp_repo.py` | `stores/esp.ts`, `api/esp.ts` |
| Aktor-State + Not-Aus | `db/models/actuator.py` (ActuatorState), `db/repositories/actuator_repo.py`, `api/v1/actuators.py`, `services/safety_service.py`, `mqtt/handlers/actuator_handler.py`, `actuator_alert_handler.py` | `shared/stores/actuator.store.ts`, `components/safety/EmergencyStopButton.vue`, `api/actuators.ts` |
| Sensor-Daten + Qualität | `db/models/sensor.py`, `mqtt/handlers/sensor_handler.py`, `services/monitor_data_service.py` | MonitorView, zonesApi.getZoneMonitorData |
| Monitor-Aggregation | `services/monitor_data_service.py`, `api/v1/zone.py` (monitor-data) | `api/zones.ts`, `views/MonitorView.vue` |
| Notifications/Alerts | `services/notification_router.py`, `db/models/notification.py`, `mqtt/handlers/actuator_alert_handler.py`, `sensor_handler.py` (Alert-Teil) | `shared/stores/notification.store.ts`, notification-inbox, alert-center |
| Suppression | `services/alert_suppression_scheduler.py`, alert_config in esp/sensor/actuator models | (UI für Suppression wenn vorhanden) |
| Diagnostics | `services/diagnostics_service.py`, `db/models/diagnostic.py` | Diagnostics-UI |

Damit kannst du gezielt analysieren: Wo wird welcher State geschrieben, wo gelesen, und wo Alerts/Diagnostics angebunden sind – und wo Duplikate oder zu lange Ketten entstehen.
