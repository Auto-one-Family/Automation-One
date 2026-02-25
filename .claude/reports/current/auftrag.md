# Monitoring-Stack Integration ins Frontend

> **Typ:** Konsolidierungs-Auftrag (Frontend + Backend)
> **Prioritaet:** NACH Hardware-Testlauf
> **Geschaetzter Aufwand:** ~8-12 Stunden (4 Schichten)
> **Betroffene Schichten:** El Servador (3 neue Endpoints + 2 WS-Events), El Frontend (4 neue Komponenten + 2 Stores)
>
> **[IST-ZUSTAND Korrektur]:** Backend hat bereits 5 Health-Endpoints (`GET /api/v1/health/`, `/detailed`, `/esp`, `/live`, `/ready`), 28 WS-Event-Typen (aber KEIN `alert_update`, KEIN `system_health`), und `NotificationActionExecutor` mit Webhook-Channel (aber fuer LogicEngine, nicht Grafana). Frontend hat 13 Pinia Stores (notification.store.ts handelt bereits `error_event`/`notification`/`system_event` → Toast), `HealthTab.vue`, `ESPHealthWidget.vue`, `AlarmListWidget.vue`, `QualityIndicator.vue`, `ToastContainer.vue`. Die "3 neue Endpoints" stimmt, die "2 WS-Events" stimmt, aber "4 neue Komponenten" ueberlappt mit Bestehendem, und "2 Stores" ueberlappt mit notification.store.ts.
> **Erstellt:** 2026-02-25
> **Status:** OFFEN

---

## Ausgangslage

Zwei getrennte Welten:

- **Grafana (Port 3000):** 38 Alerts, 4+ Dashboards, Loki-Logs, Prometheus-Metriken — vollstaendig, aber separates Tool
- **AutomationOne Frontend (Port 5173):** Sensor-Daten, ESP-Status, Aktoren — hat bereits kleine Monitoring-Ansaetze, aber fragmentiert

> **[IST-ZUSTAND Frontend – umfangreicher als "klein"]:**
> - **13 Pinia Stores** (12 shared + 1 esp): `notification.store.ts` verarbeitet bereits `error_event`, `notification`, `system_event` WS-Events → Toast
> - **Monitoring-Views:** `MonitorView.vue` (Zonen-KPIs, Sparklines), `SystemMonitorView.vue` (Fleet Health, Events), `HardwareView` (ESP-Management), Dashboard (Widgets)
> - **Health-Komponenten:** `HealthTab.vue` (KPI-Karten: online count, heap, RSSI, per-device Liste), `HealthSummaryBar.vue`, `HealthProblemChip.vue`, `ESPHealthWidget.vue` (Dashboard-Widget), `AlarmListWidget.vue` (quality poor/bad/error/fair/stale)
> - **Toast-System:** `ToastContainer.vue` (shared/design/patterns/) mit success/error/warning/info Varianten, Action-Buttons, persistent/auto-dismiss, ARIA
> - **Quality-System:** `QualityIndicator.vue` (4 States: good/warning/alarm/offline), `labels.ts` (9 Quality-Levels inkl. 'stale'), `ColorLegend.vue` (Popover in TopBar)
> - **Health-API:** `api/health.ts` → `GET /health/esp` mit FleetHealthResponse (online/offline/error counts, per-device health items)
> - **WebSocket:** `useWebSocket.ts` Composable (connect, subscribe, on, cleanup), 28 Event-Typen in `types/websocket-events.ts`
> - **Sidebar:** `Sidebar.vue` (shared/design/layout/) mit Navigation zu /hardware, /monitor, /custom-dashboard, /system-monitor, /logic-rules — Badge-Platzierung moeglich

**Problem:** Robin muss zwischen zwei Tabs wechseln. Das Frontend weiss nicht, dass Grafana gerade einen Alert feuert. Grafana weiss nicht, was Robin gerade im Frontend macht. Die 5-Sekunden-Regel ("Alles OK?") funktioniert nur wenn BEIDES offen ist.

---

## Architektur-Entscheidung: Was gehoert wohin?

| Im Frontend (Operativer Blick) | In Grafana (Analytischer Blick) |
|---|---|
| Ist gerade alles OK? (Ampel) | Wie hat sich die Temperatur ueber 7 Tage entwickelt? |
| Welcher Alert feuert JETZT? | Welche PromQL-Query zeigt den Drift? |
| Welcher ESP ist offline? | Container-CPU-Auslastung ueber 24h |
| Letzte 5 Fehler auf einen Blick | LogQL Deep-Dive mit Structured Metadata |
| "Muss ich jetzt handeln?" | "Was ist die Root Cause?" |

**Prinzip:** Das Frontend ist die **Kommandozentrale** (reagieren), Grafana ist das **Labor** (analysieren). Das Frontend zeigt Zustand und Handlungsbedarf, Grafana zeigt Trends und Ursachen.

---

## 4 Schichten der Integration

### Schicht 1: Alert-Pipeline (Backend → WebSocket → Frontend) — ~3-4h

**Datenfluss:**

```
Grafana Alert fires
  → Webhook POST an El Servador /api/v1/alerts/webhook
    → Server parsed Alert-Payload (alertname, severity, summary, status)
    → Server broadcastet WebSocket-Event "alert_update"
      → Frontend empfaengt, zeigt Toast/Badge
        → Alert-Historie im Pinia Store (letzten N Alerts)
```

> **[IST-ZUSTAND Schicht 1 – Luecken-Analyse]:**
> - **Endpoint `/api/v1/alerts/webhook` existiert NICHT.** Muss neu erstellt werden. Router-Registration in `main.py` (Zeile ~207-310 hat 15 MQTT-Subscriptions + Router-Includes). Neuer Router in `El Servador/god_kaiser_server/src/api/v1/` anlegen, in `__init__.py` (67 Zeilen, Router-Registry) registrieren
> - **WS-Event `alert_update` existiert NICHT** in den 28 definierten Events (`types/websocket-events.ts`, 771 Zeilen). Muss in WebSocket-Manager (`websocket/manager.py`, 388 Zeilen) als neuer broadcast-Typ hinzugefuegt werden. Pattern: `await ws_manager.broadcast("alert_update", data)`
> - **Grafana Contact Point existiert NICHT.** Kein `contact-points.yml` in `docker/grafana/provisioning/`. Muss entweder per Provisioning-YAML oder Grafana-UI konfiguriert werden. URL: `http://el-servador:8000/api/v1/alerts/webhook` (Docker-internes Netz)
> - **ACHTUNG Grafana-Config:** `GF_AUTH_ANONYMOUS_ENABLED: true`, `GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer` — anonymer Zugriff erlaubt, aber Webhook-Versand benoetigt korrekte Notification Policy (aktuell: KEINE provisioniert)
> - **Verwandtes System:** `NotificationActionExecutor` (`services/logic/actions/notification_executor.py`, 247 Zeilen) hat bereits Webhook-Channel — aber Richtung ist umgekehrt (Server → extern). Fuer Grafana → Server ist ein neuer Receiver noetig
> - **Verwandtes System:** `notification.store.ts` verarbeitet bereits `error_event`/`notification`/`system_event` → Toast. Der neue `useAlertStore` muss sich davon ABGRENZEN: notification.store = interne Server-Events, alertStore = externe Grafana-Alerts

**Was der User sieht:**

- Toast-Notification bei neuem Alert (rot=critical, gelb=warning)
- Badge-Zaehler in der Sidebar ("3 aktive Alerts")
- Klick auf Badge → Alert-Liste mit Severity, Zeitpunkt, Aktion
- Klick auf einzelnen Alert → Deep-Link nach Grafana (fuer Root-Cause)

**Was konsolidiert werden muss:**

- Falls es bereits WebSocket-Events fuer Health/Status gibt → mit Alert-Pipeline vereinen
- Ein einziger Pinia Store (`useAlertStore`) fuer allen Alert-State
- Kein Polling — nur Push via WebSocket

> **[IST-ZUSTAND WS-Events Health/Status — EXISTIEREN BEREITS]:**
> - `esp_health` — Heartbeat (heap, RSSI, uptime, boot_count) → esp.store
> - `sensor_health` — Sensor-Timeout/Recovery mit is_stale Flag → sensor.store
> - `error_event` — Hardware/Config-Fehler mit troubleshooting Array → notification.store → Toast
> - `system_event` — Maintenance/Cleanup Events → notification.store → Toast
> - `notification` — LogicEngine Rule-Notifications → notification.store → Toast
> - **Konsolidierungs-Entscheidung:** `alert_update` (Grafana-Alerts) ist ANDERS als `error_event` (ESP-Fehler). Zusammenlegen waere falsch — verschiedene Quellen, verschiedene Semantik. Empfehlung: Separater Store `useAlertStore` fuer Grafana-Alerts, notification.store bleibt fuer interne Events

**Backend-Implementierung:**

```python
# POST /api/v1/alerts/webhook
# Grafana sendet JSON mit alerts[].labels, alerts[].annotations, alerts[].status
# Server cached aktive Alerts und broadcastet via WebSocket
```

> **[IST-ZUSTAND Backend-Integration]:**
> - **Router-Pattern:** Neuen Router `alerts.py` in `El Servador/god_kaiser_server/src/api/v1/` erstellen. Registrierung in `__init__.py` (Zeile ~1-67, importiert alle Router und bindet sie an app). Bestehende Router nutzen `APIRouter(prefix="/v1/alerts", tags=["alerts"])`
> - **WebSocket-Broadcast:** `WebSocketManager` ist Singleton (`websocket/manager.py`). Aufruf: `await ws_manager.broadcast(message_type="alert_update", data={...}, correlation_id=...)`
> - **Auth-Frage:** Grafana-Webhook muss OHNE JWT-Auth erreichbar sein (Grafana hat keinen Token). Loesung: Entweder Endpoint ohne Auth (wie `/health/live`), oder shared Secret im Webhook-Header. Pattern: `logs.py` (`POST /logs/frontend`) ist bereits ohne Auth, mit Rate-Limiting (10 req/min per IP)
> - **Grafana Webhook Payload Format** (Standard v11.x): `{"receiver":"...", "status":"firing|resolved", "alerts":[{"status":"firing", "labels":{"alertname":"ao-server-down", "severity":"critical"}, "annotations":{"summary":"..."}, "startsAt":"...", "endsAt":"..."}]}`
> - **CORS:** `CORS_ALLOWED_ORIGINS` enthaelt `http://localhost:3000` (Grafana) — Webhook von Grafana ist aber Server-zu-Server (Docker-intern), braucht kein CORS

**Frontend-Implementierung:**

```typescript
// useAlertStore — Pinia Store
// Empfaengt "alert_update" WebSocket-Events
// Haelt aktive Alerts + Historie (letzten 50)
// Exponiert: activeAlerts, alertCount, latestAlert
```

> **[IST-ZUSTAND Frontend-Integration]:**
> - **Store-Pattern:** Neue Stores in `El Frontend/src/shared/stores/` als `alert.store.ts`. Export in `index.ts` (23 Zeilen) hinzufuegen. Pattern: `defineStore('alert', () => { ... })` mit Composition API
> - **WS-Integration:** `useWebSocket.ts` Composable nutzt `.on(eventType, callback)` Pattern. Store muss in `esp.store.ts` oder eigenstaendig WS-Events subscriben. Pattern aus notification.store.ts kopieren: `ws.on('alert_update', handleAlertUpdate)`
> - **Toast-Integration:** `useToast()` Composable verfuegbar. Aufruf: `toast.show({ message: '...', type: 'error'|'warning', persistent: true, actions: [{label: 'Details', onClick: ...}] })`
> - **UEBERSCHNEIDUNG AlarmListWidget.vue:** Zeigt bereits "aktive Alarme" basierend auf Sensor-Quality (poor/bad/error/fair/stale). `AlertListPanel.vue` (neu) zeigt Grafana-Alerts — verschiedene Datenquellen! Naming-Konflikt vermeiden: "Alarme" (Sensor-Quality, bestehend) vs. "Alerts" (Grafana, neu)
> - **Typ-Definition:** Neuer Event-Typ `alert_update` muss in `types/websocket-events.ts` (771 Zeilen) hinzugefuegt werden. Bestehende Typen folgen Interface-Pattern mit `event_type`, `timestamp`, `data`

---

### Schicht 2: System-Health-Uebersicht (Ampel-System) — ~2-3h

**Datenfluss:**

```
El Servador sammelt intern:
  - Eigener Health-Status (DB, MQTT, Memory)
  - ESP-Fleet-Status (online/offline/degraded pro ESP)
  - Letzte Alert-States aus Grafana-Webhook-Cache

  → REST-Endpoint /api/v1/system/health (Aggregation)
  → WebSocket-Event "system_health" (periodisch, z.B. alle 30s)
    → Frontend Health-Bar oder Status-Leiste
```

> **[IST-ZUSTAND Schicht 2 – GROSSTEILS BEREITS VORHANDEN]:**
> - **`GET /api/v1/health/detailed`** existiert BEREITS in `api/v1/health.py` (410 Zeilen). Liefert: database (connected, pool_size, active), mqtt (connected, messages_processed, messages_failed), websocket (active_connections), system (cpu_percent, memory_percent, disk_usage), components (Einzelstatus), warnings. Auth required!
> - **`GET /api/v1/health/esp`** existiert BEREITS. Liefert: total_devices, online/offline/error/unknown counts, total_sensors, total_actuators, avg_heap, avg_rssi, per-device health items mit recent_errors
> - **`/api/v1/system/health` existiert NICHT** — aber `/api/v1/health/detailed` + `/api/v1/health/esp` zusammen decken 90% des gewuenschten Inhalts ab. Frage: Neuen Endpoint bauen oder bestehende Endpoints im Frontend aggregieren?
> - **WS-Event `system_health` existiert NICHT.** Muss neu als periodischer Broadcast implementiert werden. Pattern: `metrics.py` hat bereits einen 15s-Scheduler-Job (`update_metrics`) der die gleichen Daten sammelt — kann als Basis dienen
> - **Prometheus-Metriken (35+)** in `core/metrics.py` (499 Zeilen): `god_kaiser_mqtt_connected`, `god_kaiser_esp_online`, `god_kaiser_esp_offline`, `god_kaiser_cpu_percent`, `god_kaiser_memory_percent` etc. Diese Daten werden bereits alle 15s gesammelt — `system_health` WS-Event koennte denselben Collection-Zyklus nutzen
> - **KRITISCH: Kein Alert-Cache im Server.** Der Plan sagt "Letzte Alert-States aus Grafana-Webhook-Cache" — dieser Cache muss in Schicht 1 implementiert werden BEVOR Schicht 2 ihn nutzen kann. Abhaengigkeit!

**Was der User sieht:**

- Permanente Status-Leiste (oben oder Sidebar):
  - **Server:** Gruen/Rot
  - **MQTT:** Gruen/Rot
  - **DB:** Gruen/Rot
  - **ESPs:** "4/5 online"
  - **Alerts:** "0 aktiv" oder "2 firing"
- Alles auf einen Blick — die **5-Sekunden-Regel**

**Was konsolidiert werden muss:**

- Bestehende Health-Anzeigen im Frontend identifizieren und zentralisieren
- Ein `useSystemHealthStore` der ALLE Quellen buendelt
- Kein separates Health-Widget pro Service — eine einzige Leiste

> **[IST-ZUSTAND bestehende Health-Anzeigen]:**
> - `HealthTab.vue` (`components/system-monitor/`) — Fleet-Health mit KPI-Karten, per-device Liste, sortierbar. Nutzt `GET /health/esp`
> - `HealthSummaryBar.vue` (`components/system-monitor/`) — Aggregierte Health-Metriken Header
> - `ESPHealthWidget.vue` (`components/dashboard-widgets/`) — Dashboard-Widget: online/offline/warning counts, device list mit RSSI bars, uptime
> - `AlarmListWidget.vue` (`components/dashboard-widgets/`) — Sensor-Quality Alarme (poor/bad/error/fair/stale), severity-sortiert
> - `StatusPill.vue` (`components/dashboard/`) — Kleiner Status-Indikator
> - **Fragmentierung:** HealthTab holt Daten per REST bei Mount, ESPHealthWidget nutzt REST, aber `esp_health` WS-Events aktualisieren nur den esp.store — die Health-Widgets refreshen NICHT automatisch. Ein `useSystemHealthStore` mit WS-Push wuerde dieses Problem loesen
> - **Sidebar-Integration:** `Sidebar.vue` hat aktuell KEINE Health-Badges. Platz waere bei den NavLinks oder als eigene Sektion

---

### Schicht 3: Sensor-Data-Quality (teilweise vorhanden) — ~2-3h

**Was existiert:**

- MonitorView mit Sparklines, Gauges, LiveLineChart
- `ColorLegend.vue` (Farb-Kodierung: Exzellent/Gut/Mittel/Kritisch/Veraltet)
- Quality-Labels (`getQualityLabel()`)
- 8 Dashboard-Widget-Typen inkl. `AlarmListWidget`

> **[IST-ZUSTAND Schicht 3 – PRAEZISE Dateilage]:**
> - `ColorLegend.vue` (`components/common/`, 220 Zeilen): 6 Farb-Tokens (success/warning/error/offline/mock/real), Popover in TopBar
> - `labels.ts` (`utils/`, 322 Zeilen): **9 Quality-Levels** — excellent, good, fair, degraded, poor, bad, stale, error, unknown. Funktion: `getQualityInfo(quality)` → `{ label: string, colorClass: string }`
> - `QualityIndicator.vue` (`shared/design/primitives/`, 132 Zeilen): 4 States (good=green, warning=yellow, alarm=red+pulsing, offline=gray). Verwendet in SensorCards, SensorSatellites, MonitorView
> - `AlarmListWidget.vue` (`components/dashboard-widgets/`, 266 Zeilen): Filtert `quality === 'poor' || 'bad' || 'error'` als Alarm, `quality === 'fair' || sensor.is_stale === true` als Warning. Max 20 Items, Zone-Filter, time-ago formatting
> - `sensor_health` WS-Event existiert BEREITS — sendet Timeout/Recovery Events mit is_stale Flag. Wird in sensor.store.ts verarbeitet

**Was fehlt / konsolidiert werden muss:**

- Quality-Indikatoren ueberall konsistent (HardwareView, MonitorView, Dashboard)
- **"Stale"-Erkennung:** Sensor der seit >5min keinen Wert schickt → visuell markieren
- **Verbindung zu Grafana-Alerts:** Wenn `ao-sensor-stale` feuert, soll der betroffene Sensor im Frontend ROT sein (nicht nur in Grafana)
- Dafuer: Alert-Payload enthaelt `sensor_id` Label → Frontend kann Sensor-Karte rot faerben

> **[IST-ZUSTAND Schicht 3 – was BEREITS funktioniert vs. was FEHLT]:**
> - **Stale-Erkennung EXISTIERT teilweise:** `sensor_health` WS-Event liefert Timeout/Recovery. `AlarmListWidget` prueft `sensor.is_stale === true`. ABER: Nicht konsistent in allen Views — MonitorView und HardwareView nutzen es moeglicherweise nicht
> - **Grafana-Alert `ao-sensor-stale`:** Prometheus-Alert in `alert-rules.yml` Gruppe "automationone-sensor-esp". Nutzt `god_kaiser_sensor_last_update` Metrik (pro sensor_type, esp_id). Feuert nach 10min ohne Reading. Labels: `sensor_type`, `esp_id` — ACHTUNG: Kein `sensor_id` Label! Nur `sensor_type` + `esp_id`. Frontend muss Sensor ueber diese Kombination finden
> - **Weitere Sensor-Alerts:** `sensor-temp-range`, `sensor-ph-range`, `sensor-humidity-range`, `sensor-ec-range` — pruefen Wert-Grenzen via `avg_over_time([2m])`. Labels: `sensor_type`, `esp_id`
> - **Verbindungs-Luecke:** Aktuell kennt das Frontend die Grafana-Alerts NICHT. Der Alert-Store aus Schicht 1 muss Alert-Labels (`esp_id`, `sensor_type`) parsen und an den esp.store / sensor.store weitergeben, damit Sensor-Karten den Alert-Status anzeigen koennen. Das ist eine Abhaengigkeit zu Schicht 1!

---

### Schicht 4: Debug-Zugang (fuer Robin, nicht fuer Enduser) — ~2-3h

**Prinzip:** Nicht im Hauptdashboard, sondern hinter einem "Debug"-Tab oder Tastenkuerzel (z.B. `Ctrl+Shift+D`).

**Was der Debug-Modus zeigt:**

- Letzte 50 Log-Zeilen (via Loki-API durch den Server: `/api/v1/logs/recent`)
- MQTT-Message-Feed (live, via Server-Side `mosquitto_sub` → WebSocket)
- Alert-Historie (alle, nicht nur aktive)
- Container-Status (via cAdvisor-Metriken durch Prometheus-API)
- Deep-Links nach Grafana fuer jede Komponente

> **[IST-ZUSTAND Schicht 4 – was existiert, was NICHT]:**
> - **`/api/v1/logs/recent` existiert NICHT.** Muss neu gebaut werden als Loki-Proxy. Loki erreichbar unter `http://loki:3100` (Docker-intern). Endpoint: `GET /loki/api/v1/query_range` mit `start`/`end` Params. ACHTUNG: `query_range` (nicht `query`) fuer Log-Abfragen
> - **`POST /logs/frontend` existiert BEREITS** (`api/v1/logs.py`, 140 Zeilen) — Frontend-Error-Ingestion mit Rate-Limiting. Aber Richtung ist umgekehrt (Frontend → Server, nicht Server → Frontend)
> - **`/api/v1/debug/` Router existiert BEREITS** — hat diverse Debug-Endpoints (Mock-ESP, DB-Tables, Logs). Pruefen ob `logs/recent` dort oder separat besser passt
> - **MQTT-Feed via Server:** Server subscribed bereits 15 MQTT-Topic-Patterns (`main.py`). Ein WS-Event `server_log` ist bereits in `websocket-events.ts` DEFINIERT aber laut Kommentar "awaiting backend implementation". Koennte fuer MQTT-Feed genutzt werden
> - **cAdvisor-Metriken:** Prometheus scraped cAdvisor auf Port 8080. ABER: cAdvisor auf Docker Desktop hat KEIN `name`-Label auf Container-Metriken — nur `id`-Pfade (`/docker/[0-9a-f]+`). Abfrage muss `id`-basiert filtern
> - **Deep-Links Grafana:** `GF_SECURITY_ALLOW_EMBEDDING: true` und `GF_AUTH_ANONYMOUS_ENABLED: true` bereits gesetzt. Links wie `http://localhost:3000/d/<dashboard-uid>?var-esp_id=ESP_12AB34CD` funktionieren direkt
> - **Bestehende Debug-Infrastruktur:** `EventAggregatorService` (`services/event_aggregator_service.py`) aggregiert bereits audit_log, sensor_data, esp_health, actuators Events. Endpoint: `GET /api/v1/audit/aggregated-events` — koennte fuer Alert-Historie wiederverwendet werden

**Was NICHT im Frontend repliziert werden soll:**

- PromQL-Editor → bleibt in Grafana
- LogQL-Editor → bleibt in Grafana
- Dashboard-Builder fuer Metriken → bleibt in Grafana
- Historische Zeitreihen-Analyse → bleibt in Grafana

---

## Konsolidierungs-Strategie

### Schritt 1: Bestandsaufnahme im auto-one Repo

- [x] Welche Stores/Komponenten gibt es bereits fuer Health/Monitoring?
- [x] Welche WebSocket-Events transportieren Status-Daten?
- [x] Gibt es bereits einen `/health` oder `/status` Aggregations-Endpoint?
- [x] Bestehende Alert/Notification-Ansaetze identifizieren

> **[BESTANDSAUFNAHME ERLEDIGT — Ergebnisse]:**
>
> **Stores:** 13 Pinia Stores. Relevant: `notification.store.ts` (WS→Toast), `sensor.store.ts` (sensor_data, sensor_health), esp.store (esp_health, alle Device-Events)
>
> **Health-Komponenten:** HealthTab.vue, HealthSummaryBar.vue, HealthProblemChip.vue, ESPHealthWidget.vue, AlarmListWidget.vue, StatusPill.vue, QualityIndicator.vue, ColorLegend.vue
>
> **WS-Events (Status):** `esp_health` (Heartbeat), `sensor_health` (Timeout/Recovery), `error_event` (Fehler→Toast), `system_event` (Maintenance→Toast), `notification` (LogicEngine→Toast). Kein `alert_update`, kein `system_health`
>
> **Health-Endpoints:** `GET /health` (simple), `GET /api/v1/health/` (basic), `GET /api/v1/health/detailed` (DB+MQTT+WS+System+Components), `GET /api/v1/health/esp` (Fleet), `GET /api/v1/health/live` (Liveness), `GET /api/v1/health/ready` (Readiness). Kein `/api/v1/system/health` Aggregation
>
> **Alert/Notification:** `NotificationActionExecutor` (Server→extern via Email/Webhook/WS), `notification.store.ts` (WS→Toast), `ToastContainer.vue` (UI), `AlarmListWidget.vue` (Sensor-Quality Alarme). KEIN Grafana-Alert-Empfang

### Schritt 2: Zentralisierung

- [ ] `useAlertStore` — empfaengt Grafana-Webhooks, haelt Alert-State
- [ ] `useSystemHealthStore` — aggregiert Server/MQTT/DB/ESP-Status
- [ ] Beide Stores fuettern eine einzige `SystemStatusBar.vue` Komponente
- [ ] Bestehende fragmentierte Health-Anzeigen durch Referenz auf den Store ersetzen

### Schritt 3: Backend-Endpoints

| Endpoint | Methode | Zweck | IST-ZUSTAND |
|----------|---------|-------|-------------|
| `/api/v1/alerts/webhook` | POST | Grafana-Webhook-Empfaenger | **NEU.** Kein Auth (wie `/logs/frontend`). Rate-Limit. Neuer Router `alerts.py` in `api/v1/` |
| `/api/v1/system/health` | GET | Aggregierter Health-Status | **TEILWEISE.** `/health/detailed` + `/health/esp` decken 90% ab. Frage: Neuer Aggregations-Endpoint oder Frontend-seitige Zusammenfuehrung? |
| `/api/v1/logs/recent` | GET | Loki-Proxy (optional, fuer Debug) | **NEU.** Loki intern unter `http://loki:3100`. Nutze `query_range` (nicht `query`). Alternativ: In bestehenden `/api/v1/debug/` Router integrieren |
| WS `alert_update` | Push | Neuer/geaenderter Alert | **NEU.** Typ-Definition in `websocket-events.ts` + Broadcast in `websocket/manager.py` |
| WS `system_health` | Push | Periodischer Health-Status (30s) | **NEU.** Scheduler-Job analog zu `update_metrics` (15s) in `metrics.py`. Kann gleichen Collection-Zyklus nutzen |

### Schritt 4: Frontend-Komponenten

| Komponente | Zweck | Prioritaet | IST-ZUSTAND |
|------------|-------|------------|-------------|
| `SystemStatusBar.vue` | Permanente Leiste (Server/MQTT/DB/ESP/Alerts) | Schicht 2 | **NEU** aber `HealthSummaryBar.vue` existiert bereits in `components/system-monitor/`. Pruefen ob erweiterbar statt neu bauen |
| `AlertNotification.vue` | Toast bei neuem Alert | Schicht 1 | **UEBERSCHNEIDUNG:** `notification.store.ts` + `ToastContainer.vue` zeigen BEREITS Toasts fuer error_event/notification/system_event. Neues Alert-Toast koennte den gleichen Toast-Mechanismus nutzen, braucht evtl. keine eigene Komponente |
| `AlertListPanel.vue` | SlideOver oder Sidebar-Panel mit aktiven Alerts | Schicht 1 | **NEU** aber Naming-Konflikt mit `AlarmListWidget.vue` (zeigt Sensor-Quality-Alarme). Klare Abgrenzung: AlertList = Grafana, AlarmList = Sensor-Quality |
| `DebugConsole.vue` | Versteckter Debug-Modus (Logs, MQTT-Feed, Container) | Schicht 4 | **NEU** aber `SystemMonitorView.vue` existiert bereits unter `/system-monitor` mit HealthTab und Events-Tab (planned). Koennte als Tab dort integriert werden statt komplett neue Komponente |

---

## Abgrenzung: Was dieser Auftrag NICHT macht

- Keine Grafana-Dashboards im Frontend per iframe einbetten (fragil, Auth-Probleme)
  > **[HINWEIS]:** `GF_SECURITY_ALLOW_EMBEDDING: true` und `GF_AUTH_ANONYMOUS_ENABLED: true` sind bereits konfiguriert — iframes wuerden technisch funktionieren. Die Entscheidung dagegen ist trotzdem korrekt (UX, Styling, Responsiveness)
- Keine PromQL/LogQL-Queries im Frontend ausfuehren (zu komplex fuer den User)
- Kein Ersetzen von Grafana — Grafana bleibt das analytische Werkzeug
- Keine Alert-Konfiguration im Frontend (Schwellwerte aendern = Grafana)
- Keine neuen Grafana-Alerts erstellen — die 38 bestehenden reichen als Quelle

---

## Reihenfolge

1. **Schicht 1 zuerst** (Alert-Pipeline) — groesster Impact, macht Alerts sichtbar wo Robin hinschaut
2. **Schicht 2 danach** (Health-Ampel) — 5-Sekunden-Regel vollstaendig erfuellt
3. **Schicht 3 parallel** (Quality-Konsolidierung) — baut auf bestehendem Code auf
4. **Schicht 4 zuletzt** (Debug) — nur fuer Robin, nicht fuer User, kann warten

---

## Abhaengigkeiten

| Voraussetzung | Status | IST-ZUSTAND Details |
|---------------|--------|---------------------|
| Hardware-Testlauf erfolgreich | OFFEN | — |
| 38/38 Grafana-Alerts fehlerfrei | ERLEDIGT (2026-02-25) | 32 Prometheus + 6 Loki in 7 Gruppen. Alle laden fehlerfrei |
| Correlation-IDs End-to-End | ERLEDIGT (2026-02-25) | `request_context.py`, `request_id` Middleware, `correlation_id` in WS-Broadcasts |
| Loki Debug-Flow (Block A-F) | ERLEDIGT (2026-02-25) | Alloy native River-Config, Structured Metadata (logger, request_id, component, device, error_code) |
| Alert Contact Point konfiguriert | OFFEN (Voraussetzung fuer Schicht 1 Webhook) | **KEINE Provisioning-Dateien vorhanden.** Kein `contact-points.yml`, kein `notification-policies.yml` in `docker/grafana/provisioning/`. Muss entweder per YAML provisioniert oder via Grafana-UI (Port 3000, admin/changeme) konfiguriert werden |
| CI/CD 8/8 gruen | ERLEDIGT | 8 Workflows in `.github/workflows/` |
| **NEU: Notification Policy** | **OFFEN** | **Grafana braucht neben Contact Point AUCH eine Notification Policy die bestimmt, WELCHE Alerts an den Webhook gehen. Default-Policy sendet an Default-Contact-Point. Ohne Policy → kein Webhook-Trigger** |
| **NEU: websocket-events.ts Update** | **OFFEN** | **2 neue Event-Typen (`alert_update`, `system_health`) muessen in der 771-Zeilen Type-Definition hinzugefuegt werden** |
| **NEU: Router-Registry** | **OFFEN** | **Neuer `alerts.py` Router muss in `api/v1/__init__.py` (67 Zeilen) registriert werden** |

**Kritische Voraussetzung fuer Schicht 1:** Grafana braucht einen Webhook Contact Point der an El Servador schickt. Ohne diesen kommen keine Alerts im Backend an. Konfiguration: Grafana → Alerting → Contact Points → Webhook → `http://el-servador:8000/api/v1/alerts/webhook`

> **[IST-ZUSTAND Contact Point Setup]:**
> - **Option A (Provisioning YAML):** Datei `docker/grafana/provisioning/alerting/contact-points.yml` erstellen. Vorteil: Reproduzierbar, versioniert. Nachteil: Grafana-Neustart noetig
> - **Option B (UI):** Grafana → Alerting → Contact Points → New → Webhook. URL: `http://el-servador:8000/api/v1/alerts/webhook`. Vorteil: Sofort aktiv. Nachteil: Nicht in Git, geht bei `docker compose down -v` verloren (aber `automationone-grafana-data` Volume bleibt bei normalem `down`)
> - **Empfehlung:** Option A (YAML) fuer Reproduzierbarkeit + Option B zum Testen waehrend Entwicklung

---

## Verifikation

- [ ] Schicht 1: Alert in Grafana manuell feuern → Toast im Frontend sichtbar innerhalb <3s
- [ ] Schicht 2: Docker-Container stoppen → Health-Leiste zeigt sofort Rot
- [ ] Schicht 3: Sensor-Daten >5min alt → Sensor-Karte zeigt "Veraltet"-Markierung
- [ ] Schicht 4: `Ctrl+Shift+D` → Debug-Console oeffnet mit Live-Logs
- [ ] End-to-End: Alle 4 Schichten gleichzeitig aktiv, kein Performance-Einbruch

> **[IST-ZUSTAND Verifikation – Testbarkeit]:**
> - Schicht 1: Grafana-Alert manuell feuern geht per `POST http://localhost:3000/api/v1/provisioning/alert-rules` oder via Grafana UI "Test Rule". Monitoring-Stack muss laufen: `make monitor-up`
> - Schicht 2: `docker compose stop mqtt-broker` → `god_kaiser_mqtt_connected` faellt auf 0 → Server `/health/detailed` zeigt mqtt.connected=false. WS-Event muss diesen Status pushen
> - Schicht 3: **TEILWEISE BEREITS TESTBAR.** `sensor_health` WS-Event feuert bei Timeout. `AlarmListWidget` zeigt stale Sensoren. Fehlend: HardwareView/MonitorView muessen is_stale konsistent anzeigen
> - Schicht 4: Neuer Shortcut + DebugConsole muss implementiert werden. Evtl. als Tab in bestehender SystemMonitorView

---

## Ueberschneidungen und Cross-System-Risiken (verify-plan Analyse)

> Erstellt durch `/verify-plan` am 2026-02-25 basierend auf Codebase-Analyse

### 1. Naming-Konflikt: Alarme vs. Alerts

| System | Begriff | Quelle | Anzeige |
|--------|---------|--------|---------|
| `AlarmListWidget.vue` | "Alarme" | Sensor-Quality (poor/bad/error/fair/stale) | Dashboard-Widget |
| `AlertListPanel.vue` (neu) | "Alerts" | Grafana Alert-Rules (38 Rules) | Sidebar-Panel |

**Risiko:** User-Verwirrung wenn "3 Alarme" (Sensor) und "2 Alerts" (Grafana) gleichzeitig angezeigt werden. Empfehlung: Klare visuelle Unterscheidung + Konsistente Terminologie im gesamten Frontend

### 2. Doppelte Notification-Pipelines

| Pipeline | Trigger | Store | UI |
|----------|---------|-------|----|
| Bestehend | `error_event`/`notification`/`system_event` WS-Events | notification.store.ts | ToastContainer.vue |
| Neu (Schicht 1) | `alert_update` WS-Event (aus Grafana-Webhook) | useAlertStore (neu) | AlertNotification.vue (neu) |

**Risiko:** Zwei verschiedene Toast-Systeme die gleichzeitig feuern. Empfehlung: `AlertNotification.vue` sollte das bestehende `ToastContainer.vue` + `useToast()` nutzen, NICHT ein eigenes Toast-System bauen

### 3. Health-Daten Redundanz

| Quelle | Endpoint/Event | Daten | Nutzer |
|--------|---------------|-------|--------|
| `GET /health/detailed` | REST (on-demand) | DB, MQTT, WS, CPU, Memory, Disk | HealthTab.vue |
| `GET /health/esp` | REST (on-demand) | Fleet-Stats, per-device Health | HealthTab.vue, ESPHealthWidget.vue |
| `esp_health` WS-Event | Push (pro Heartbeat) | heap, RSSI, uptime per ESP | esp.store |
| `system_health` WS-Event (neu) | Push (30s) | Aggregation von allem oben | useSystemHealthStore (neu) |
| `metrics.py` Scheduler (15s) | Intern | Prometheus-Gauges fuer alle Werte | Prometheus/Grafana |

**Risiko:** 5 verschiedene Wege Health-Daten abzurufen. `system_health` WS-Event wuerde einen 6. hinzufuegen. Empfehlung: `system_health` nutzt den bestehenden `update_metrics()` Zyklus (15s) und fasst `/health/detailed` + `/health/esp` Daten zusammen — NICHT neu sammeln

### 4. Schicht-Abhaengigkeiten (Reihenfolge kritisch)

```
Schicht 1 (Alert-Pipeline) ──┐
  - /api/v1/alerts/webhook    │
  - alert_update WS-Event     │
  - useAlertStore              ├──→ Schicht 2 braucht Alert-Cache aus Schicht 1
  - Alert-Cache im Server    ─┘    fuer "Alerts: 2 firing" in StatusBar

Schicht 1 ──→ Schicht 3: Alert-Labels (esp_id, sensor_type)
               muessen im useAlertStore geparst werden
               damit Sensor-Karten den Grafana-Alert-Status anzeigen

Schicht 2 kann NICHT parallel mit Schicht 1 — Abhaengigkeit!
Schicht 3 kann parallel mit Schicht 2 (nutzt bestehenden Code)
Schicht 4 ist unabhaengig
```

### 5. Backend-Dateien die geaendert werden muessen

| Datei | Aktion | Schicht |
|-------|--------|---------|
| `api/v1/alerts.py` | **NEU** erstellen | 1 |
| `api/v1/__init__.py` | Router registrieren | 1 |
| `websocket/manager.py` | Keine Aenderung noetig (broadcast ist generisch) | — |
| `core/metrics.py` | Optional: system_health Broadcast in update_metrics() integrieren | 2 |
| `main.py` | Neuen Router importieren, optional Scheduler-Job fuer system_health | 1, 2 |
| `api/v1/debug.py` oder neuer `logs_proxy.py` | Loki-Proxy Endpoint | 4 |
| `docker/grafana/provisioning/alerting/contact-points.yml` | **NEU** erstellen | 1 (Vorbedingung) |
| `docker/grafana/provisioning/alerting/notification-policies.yml` | **NEU** erstellen | 1 (Vorbedingung) |

### 6. Frontend-Dateien die geaendert werden muessen

| Datei | Aktion | Schicht |
|-------|--------|---------|
| `shared/stores/alert.store.ts` | **NEU** erstellen | 1 |
| `shared/stores/system-health.store.ts` | **NEU** erstellen | 2 |
| `shared/stores/index.ts` | 2 neue Store-Exports | 1, 2 |
| `types/websocket-events.ts` | 2 neue Event-Typen hinzufuegen | 1, 2 |
| `components/alerts/AlertListPanel.vue` | **NEU** erstellen | 1 |
| `shared/design/layout/Sidebar.vue` | Alert-Badge hinzufuegen | 1 |
| `components/system-monitor/HealthSummaryBar.vue` | Erweitern zu SystemStatusBar ODER neue Komponente | 2 |
| `components/system-monitor/SystemMonitorView.vue` | Debug-Tab integrieren | 4 |
| `api/alerts.ts` | **NEU** erstellen (optional, fuer REST-Abfragen) | 1 |
| `api/health.ts` | Erweitern um system_health Abfrage | 2 |

### 7. Grafana Alert-Labels fuer Frontend-Mapping

Die 38 Alerts nutzen folgende Labels die das Frontend parsen muss:

| Alert-Gruppe | Labels | Frontend-Mapping |
|-------------|--------|------------------|
| automationone-critical (6) | `job` (el-servador, loki, alloy, prometheus), `instance` | Service-Status in StatusBar |
| automationone-sensor-esp (8) | `esp_id`, `sensor_type` | Sensor-Karte rot faerben, ESP-Status |
| automationone-application (6) | keine device-spezifischen | Allgemeine System-Warnung |
| automationone-infrastructure (6) | `id` (cAdvisor Container-Pfad) | Container-Status in Debug-Console |
| automationone-mqtt-broker (2) | keine | MQTT-Status in StatusBar |
| automationone-loki-alerts (6) | `compose_service` | Service-Zuordnung |
| automationone-warnings (3) | `esp_id` (bei esp-offline) | ESP-Fleet-Status |
