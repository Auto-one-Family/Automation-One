# Phase 4: System-Integration, Notifications, Diagnostics & Hardware-Test 2

> **Voraussetzung:** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md) + [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) + [Phase 3](./PHASE_3_KI_ERROR_ANALYSE.md) Stufe 1+2 lauffaehig
> **Nutzt:** Alle vorherigen Phasen + **Wokwi MCP Server** (Phase 1) + **KG-RCA** (Phase 3)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 4" + "Agent-Driven Testing"
> **Detaillierte Roadmap:** `arbeitsbereiche/automation-one/roadmap-phase4-system-integration.md` (Code-Snippets, DB-Schemata, UI-Mockups)
> **Wissensbasis:** `wissen/iot-automation/unified-alert-center-ux-best-practices.md`, `alarm-fatigue-empirische-benchmarks-monitoring.md`, `grafana-alerting-webhook-provisioning.md`, `iot-alert-email-notification-architektur-2026.md`, `diagnostics-hub-plugin-system-hil-testing-recherche-2026.md`
> **Aktualisiert:** 2026-03-02 (Vollstaendige Erweiterung: 5 Subphasen 4A-4E integriert, Forschungserkenntnisse eingearbeitet, Best Practices aus 3 Recherchen + 16 Papers)

---

## Ziel

Phase 4 verbindet alle vorherigen Phasen zu einem integrierten System mit:
- **Notification-Stack** (Email, WebSocket, Webhook, Inbox)
- **Unified Alert Center** (ISA-18.2-konform, alle Quellen konsolidiert)
- **Plugin-Steuerung** (AutoOps-Plugins im Frontend, Logic Engine Integration)
- **Diagnostics Hub** (SystemMonitorView → zentrales Debugging-Werkzeug)
- **Hardware-Test 2** (volle Kontrolle, volles Monitoring, automatische Dokumentation)
- **Feedback-Loop** (Closed-Loop Agent-Architektur via Wokwi MCP)

**Gesamtaufwand:** ~80-110h (4-6 Wochen)
**Reihenfolge:** 4A → 4B → 4C → 4D → 4E (mit Parallelisierung A+B)

---

## Voraussetzungen (VOR Phase 4 erledigen)

| # | Auftrag | Aufwand | Warum VOR Phase 4 |
|---|---------|---------|-------------------|
| 1 | `auftrag-logging-multi-layer-fix.md` | ~4-5h | Starlette ContextVar Bug, PostgreSQL Logging — Logging muss sauber sein |
| 2 | `auftrag-loki-pipeline-verifikation.md` | ~6-8h | Loki E2E sauber fuer Diagnostics Hub (4D) |
| 3 | `auftrag-logic-engine-volltest.md` | ~10-12h | Logic Engine E2E bewiesen fuer Plugin-Actions (4C) + Diagnose-Trigger (4D) |
| 4 | `auftrag-mock-trockentest.md` | ~8-10h | Infrastruktur-Validierung vor HW-Test 2 (4E) |

---

## 5 Subphasen im Ueberblick

```
Phase 4A: Notification-Stack           Phase 4B: Unified Alert Center
(Email-Service + Routing)              (Grafana → Frontend Konsolidierung)
         │                                       │
         └───────────┬───────────────────────────┘
                     │
              Phase 4C: Plugin-System & Steuerung
              (AutoOps UI + Logic Engine Actions)
                     │
              Phase 4D: Diagnostics Hub
              (SystemMonitorView → System-Debugging)
                     │
              Phase 4E: Hardware-Test 2
              (Volle Kontrolle, volles Monitoring)
```

---

## Phase 4A: Notification-Stack (~15-20h)

### Ziel

Email-Postfach im Frontend + Backend-Email-Service + flexibles Notification-Routing. Alle System-Benachrichtigungen, Alert-Mails und manuelle Nachrichten in einem konsolidierten System.

### Architektur

```
                          ┌─────────────────────┐
                          │   Notification       │
                          │   Router Service     │
                          │   (Backend)          │
                          └──────┬──────────────┘
                                 │
                    ┌────────────┼──────────────┐
                    │            │              │
              ┌─────▼────┐ ┌────▼─────┐ ┌──────▼─────┐
              │ WebSocket │ │  Email   │ │  Webhook   │
              │ (Toast)   │ │  (SMTP)  │ │  (HTTP)    │
              └──────────┘ └────┬─────┘ └────────────┘
                                │
                          ┌─────▼──────┐
                          │ Inbox      │
                          │ (DB)       │
                          └────────────┘
```

### Block 4A.1: Email-Service Backend (~6-8h)

**Neue Dateien:**
- `/src/services/email_service.py` — SMTP-Versand + Template-Engine
- `/src/services/notification_router.py` — Zentraler Router (ersetzt Placeholder in NotificationActionExecutor)
- `/src/db/models/notification.py` — DB-Modell
- `/src/api/v1/notifications.py` — REST-API

**DB-Schema:** `notifications` Tabelle (UUID PK, user_id FK, channel, severity, category, title, body, metadata JSONB, source, is_read, is_archived, created_at, read_at)

**NotificationRouter:** Jede Benachrichtigung geht durch diesen Service → DB-Persist → Routing nach User-Preferences (WebSocket, Email, Webhook)

**Email-Empfehlung (Recherche-Ergebnis):**
- **Resend** statt SMTP direkt (Free Tier 3.000/Monat, bessere Zustellbarkeit)
- `BackgroundTasks` fuer nicht-blockierenden Email-Versand
- Email-Fehler duerfen Alert-Verarbeitung NICHT blockieren

**Digest-Strategie (Recherche-Best-Practice):**

| Trigger | Delivery | Begruendung |
|---------|----------|-------------|
| severity=critical | Sofort (<30s) | Sofortiges Handeln noetig |
| severity=warning (erste des Tages) | Sofort | Kontext-Bewusstsein herstellen |
| severity=warning (Folge-Warnings) | Digest alle 1h (wenn ≥3 aktiv) | Kein Email-Overload |
| Resolved (nach Critical) | Optional, sofort | Bestaetigung |
| Info-Events | Taeglich 07:00 Uhr | Informativ, kein Interrupt |

**REST-API Endpoints:**
```
GET    /v1/notifications                    # Liste (Filter: channel, severity, is_read, category)
GET    /v1/notifications/unread-count       # Badge-Zaehler
PATCH  /v1/notifications/{id}/read          # Als gelesen markieren
PATCH  /v1/notifications/read-all           # Alle als gelesen
POST   /v1/notifications/send              # Manuelle Notification (Admin)
GET    /v1/notifications/preferences        # User-Einstellungen
PUT    /v1/notifications/preferences        # User-Einstellungen speichern
POST   /v1/notifications/test-email         # Test-Email (Setup-Verifikation)
```

### Block 4A.2: Frontend Email-Inbox (~6-8h)

**Progressive Disclosure (3 Ebenen):**

1. **NotificationBadge** (permanent in Header): Bell-Icon mit Unread-Counter, Farbe = hoechste Severity, Pulse bei Critical
2. **NotificationInbox** (Drawer, rechts): Gruppiert nach Severity, Filter (Alle/Kritisch/Warnungen/System), Acknowledge/Read-Buttons
3. **Detail-Ansicht** (Inline expandierbar): Severity, Quelle, Zone, ESP, Correlation-ID, Deep-Links

**WebSocket-Events:** `notification:new`, `notification:updated`, `notification:read`
**Browser-Notifications:** Optional bei Critical (mit User-Permission)

### Block 4A.3: Grafana Webhook → Backend (~2-3h)

**Endpoint:** `POST /v1/webhooks/grafana-alerts`
**Grafana Contact Point:** Webhook an `http://el-servador:8000/v1/webhooks/grafana-alerts`

**Recherche-Empfehlung:** Email NICHT direkt ueber Grafana Contact Point senden. Stattdessen: Backend entscheidet basierend auf Severity + User-Praeferenzen + Digest-Logik. Das ist wartbarer und testbarer.

**Grafana Provisioning YAML:**
```yaml
contactPoints:
  - name: automationone-webhook
    receivers:
      - uid: ao-webhook-receiver
        type: webhook
        disableResolveMessage: false  # Resolved-Events senden!
        settings:
          url: http://el-servador:8000/v1/webhooks/grafana-alerts
policies:
  - receiver: automationone-webhook
    group_by: [grafana_folder, alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

### Verifikation 4A

- [ ] Email-Test: `/v1/notifications/test-email` → Email kommt an
- [ ] Inbox: Alle Notifications sichtbar, Filter funktioniert
- [ ] Badge: Korrekte Anzahl, Farbe passt zur hoechsten Severity
- [ ] Grafana-Alert feuert → erscheint in Inbox + optional als Email
- [ ] Logic-Rule feuert → erscheint in Inbox
- [ ] Preferences: Email ein/aus, Severity-Filter, Quiet Hours
- [ ] WebSocket: Neue Notification → Badge aktualisiert sofort

---

## Phase 4B: Unified Alert Center (~15-20h)

### Ziel

Alle Alertquellen (Grafana Infrastructure, Sensor Quality, Device Events, Logic Rules, System Events) in EINEM konsistenten Frontend konsolidieren. ISA-18.2-konforme Alert-Verwaltung.

### Alert-Klassifikation (3 Dimensionen — aus Forschung bestaetigt)

| Dimension | Werte |
|-----------|-------|
| **Severity** | `critical` (< 5 min), `warning` (< 1h), `info`, `resolved` |
| **Source** | `grafana`, `logic_engine`, `mqtt_handler`, `sensor_threshold`, `device_event`, `autoops` |
| **Category** | `connectivity`, `data_quality`, `infrastructure`, `lifecycle`, `maintenance`, `security` |

> **Warum 4 Severity-Stufen?** ThingsBoard nutzt 5, Grafana effektiv 3. Fuer ein System mit <50 Devices sind 4 Stufen optimal — genug Differenzierung ohne Entscheidungsparalyse. (Quelle: unified-alert-center-ux-best-practices.md)

### Alert-Lifecycle (ThingsBoard 2x2-Matrix — Best Practice bestaetigt)

```
                  Unacknowledged       Acknowledged
    Active    [🔴 Neuer Alert]     [🟡 Gesehen, laeuft]
    Cleared   [⚪ Auto-resolved]   [🟢 Erledigt]
```

**Recherche-Empfehlung fuer Frontend:**
- Critical + Unacknowledged: Badge pulsiert rot + Toast
- Warning + Unacknowledged: Badge gelb, kein Toast (ausser erster Warning des Tages)
- Resolved: 30 Min sichtbar (gruener Haken), dann nur Alert-History
- **Resolved zaehlt NICHT zum Badge-Counter** (kontraproduktiv)

### ISA-18.2 Benchmarks (aus Forschung — KRITISCH fuer Design)

| Metrik | ISA-18.2 Standard | AutomationOne Ziel |
|--------|-------------------|-------------------|
| Alarme pro Stunde (pro Operator) | < 6 | < 3 |
| Alarme pro Tag (pro Operator) | < 144 | < 30 |
| Stehende Alarme (permanent aktiv) | < 5 | < 2 |
| Anteil Critical an Gesamt | < 5% | < 5% |
| Actionable Rate | > 80% | > 90% |

### Block 4B.1: UnifiedAlert Schema + Store (~4-5h)

**UnifiedAlert Interface (TypeScript):**
```typescript
interface UnifiedAlert {
  id: string
  severity: 'critical' | 'warning' | 'info'
  source: string
  category: string
  title: string
  description: string
  metadata: Record<string, unknown>       // esp_id, sensor_type, rule_id, grafana_uid
  status: 'active' | 'acknowledged' | 'resolved'
  created_at: string
  acknowledged_at?: string
  resolved_at?: string
  correlation_id?: string
  parent_alert_id?: string                // Root-Cause Korrelation
  // Navigations-Links
  device_link?: string
  sensor_link?: string
  grafana_link?: string
}
```

**Alarm-Fatigue-Praevention (aus Recherche — 4 Massnahmen):**

1. **Root-Cause Suppression:** Wenn MQTT-Offline als Critical feuert → alle gleichzeitigen Sensor-Stale-Alerts bekommen `parent_alert_id` → nicht separat angezeigt
2. **Temporal Grouping:** Gleicher Alert-Typ + gleiche Quelle innerhalb 30s → zusammenfassen ("3 Sensoren offline in Zone A")
3. **Severity-basiertes Interrupt-Design:** Critical: Toast + Sound + Badge-Puls, Warning: nur Badge-Increment, Info: nur Alert-History
4. **Alert-Rate-Limit:** Max 1 Critical-Toast pro 30s, max 5 Badge-Updates pro Minute

### Block 4B.2: Alert-UI Komponenten (~5-6h)

**Integration in bestehende Views (KEIN neuer View, sondern Erweiterung):**

1. **AlertStatusBar** (permanent in MainLayout/Header):
   ```
   ● System OK  |  ⚠ 2 Warnings  |  🔔 5 ungelesen
   ```
   Zeigt Gesamtstatus auf einen Blick. Klick oeffnet gefilterten Alert-Drawer.

2. **AlertDrawer** (rechts einblendbar):
   - Gruppiert nach Severity (Critical oben)
   - Acknowledge/Resolve Buttons pro Alert
   - Auto-Resolve wenn Grafana "resolved" sendet
   - Filter: Source, Category, Zeitraum

3. **Alert-Badges in bestehenden Views:**
   - HardwareView: ESP-Card bekommt Alert-Badge
   - MonitorView: SensorCard bekommt Alert-Badge
   - LogicView: RuleCard bekommt Alert-Badge

### Block 4B.3: Sensor-Threshold-Alerts automatisieren (~3-4h)

Sensor-Thresholds existieren im SensorConfig-Modell, aber Ueberschreitungen werden NICHT automatisch als Alerts geroutet. Fix: Im `sensor_handler.py` nach Daten-Ingestion Threshold-Check → `NotificationRouter.route()`.

### Block 4B.4: Health-Aggregation Service (~3-4h)

Erweiterung von `/v1/health/detailed` zum zentralen Health-Hub: overall_status, components (server, database, mqtt, esp_devices, monitoring), active_alerts, recent_events, logic_engine Status.

### Verifikation 4B

- [ ] AlertStatusBar zeigt korrekten Gesamtstatus
- [ ] Sensor-Threshold Ueberschreitung → Alert in Inbox + Badge auf SensorCard
- [ ] Grafana-Alert → erscheint im Alert-Drawer mit Severity
- [ ] Acknowledge → Alert wechselt Status, Badge-Zaehler sinkt
- [ ] Auto-Resolve: Grafana sendet "resolved" → Alert wird gruen
- [ ] ISA-18.2: Bei normalem Betrieb < 6 Alerts/Stunde
- [ ] Health-Dashboard: Alle Komponenten-Status auf einen Blick

---

## Phase 4C: Plugin-System & Steuerung (~15-20h)

### Ziel

Das bestehende AutoOps-Plugin-System (Backend: `base_plugin.py` + `plugin_registry.py`, 4 Plugins) bekommt ein Frontend-UI. Plugins werden dynamisch geladen, per User konfiguriert, und koennen ueber die Logic Engine gesteuert werden.

### Block 4C.1: Plugin-Registry API erweitern (~4-5h)

**Neue Endpoints:**
```
GET    /v1/plugins                         # Alle registrierten Plugins
GET    /v1/plugins/{plugin_id}             # Plugin-Details + Konfiguration
POST   /v1/plugins/{plugin_id}/execute     # Plugin manuell ausfuehren
PUT    /v1/plugins/{plugin_id}/config      # Konfiguration aktualisieren
GET    /v1/plugins/{plugin_id}/history     # Ausfuehrungshistorie
POST   /v1/plugins/{plugin_id}/enable      # Plugin aktivieren
POST   /v1/plugins/{plugin_id}/disable     # Plugin deaktivieren
```

**Plugin-Metadata via Dekorator:** `@plugin_metadata(id, display_name, description, category, config_schema)` — Schema fuer dynamische Config-UI-Generierung.

### Block 4C.2: Plugin-Management UI (~5-6h)

**Recherche-Empfehlung:** Card-basierter Katalog (wie Grafana Plugins, Home Assistant Add-ons, Node-RED) — nicht listenbasiert.

- Plugin-Cards mit: Name + Beschreibung + Status-Badge + Konfigurations-Button
- Config-Dialog: Dynamisch aus `config_schema` generiert (Three-Zone-Pattern wie SensorConfigPanel)
- Plugin-Ausfuehrungshistorie (letzte 50)
- Integration: Neuer Tab in SystemMonitorView oder SettingsView

### Block 4C.3: Logic Engine → Plugin Actions (~3-4h)

**Neuer Action-Executor: `PluginActionExecutor`** — Plugins koennen als Actions in Logic Rules verwendet werden.

**Recherche-Erkenntnis:** `autoops_trigger` als neuer Action-Typ waere ein Alleinstellungsmerkmal — Regeln die KI-Agenten aktivieren (n8n/Node-RED koennen keine eingebetteten KI-Agenten direkt als Action aufrufen).

### Block 4C.4: User-Kontext bei Plugin-Laden (~2-3h)

`PluginContext` mit: User, user_preferences, system_config, trigger_rule, trigger_value, config_overrides, esp_devices, active_alerts.

### Verifikation 4C

- [ ] Plugin-Liste: Alle 4 Plugins sichtbar mit Status
- [ ] Config-Dialog: Dynamisch generiert aus Schema
- [ ] Manuell ausfuehren: "Jetzt ausfuehren" → Plugin laeuft, Ergebnis sichtbar
- [ ] Logic Rule + Plugin-Action: Regel feuert → Plugin wird ausgefuehrt
- [ ] User-Kontext: Plugin erhaelt User-Info bei Ausfuehrung

---

## Phase 4D: Diagnostics Hub (~20-25h)

### Ziel

Der SystemMonitorView wird zum vollstaendigen Diagnostics Hub. Volle Kontrolle ueber das System, Agenten-Diagnosen, strukturierte Reports fuer das Repo.

### Architektur-Vision (aus Recherche: Home Assistant Developer Tools + AWS IoT Device Defender + Azure IoT Hub als Vorbilder)

```
Diagnostics Hub (SystemMonitorView)
├── Tab: Uebersicht    ← NEU (Status-Kacheln, Schnell-Diagnosen, Live-Metriken)
├── Tab: Logs          ← ERWEITERN (Loki-Integration fuer historische Queries)
├── Tab: Metriken      ← NEU (Prometheus-Daten, Grafana-Embedding)
├── Tab: Diagnosen     ← NEU (10 modulare Checks, Report-Generierung)
├── Tab: Reports       ← NEU (Diagnose-Historie, Export, Status-Tracking)
└── Tab: Plugins       ← NEU oder eigener View (Plugin-Management, Agent-Activity)
```

### Block 4D.1: Diagnostics-Backend-Service (~5-6h)

**10 modulare Diagnose-Checks:**

| Check | Prueft | Metriken |
|-------|--------|----------|
| `server` | Uptime, Memory, CPU, API-Latenz | Response-Time P95 |
| `database` | Tabellen, FK-Integrity, Orphans, Size | Connections, Query-Duration |
| `mqtt` | Broker-Status, Clients, Message-Rate, Stale | Messages/s, Error-Rate |
| `esp_devices` | Online/Offline, Heartbeat, Firmware-Version | Last-Seen-Delta |
| `sensors` | Datenluecken, Threshold-Config, Kalibrierung | Signal-Coverage |
| `actuators` | Zustand, Runtime, Safety-Constraints | Response-Time |
| `monitoring` | Grafana, Prometheus, Loki, Alloy | Target-Availability |
| `logic_engine` | Regeln, Execution-History, Fehlerrate | Executions/24h |
| `alerts` | Alert-Fatigue, False-Positive-Rate | Alerts/Stunde (ISA-18.2) |
| `logs` | Error-Rate, Log-Volumen, Anomalien | Errors/Minute |

**Recherche-Empfehlung:** "On-Demand Diagnostic" Pattern — ein Button → POST `/v1/diagnostics/run` → Ergebnis in 3-8 Sekunden mit Status pro Check.

**REST-API:**
```
POST   /v1/diagnostics/run                 # Volle Diagnose starten
POST   /v1/diagnostics/run/{check_name}    # Einzelnen Check starten
GET    /v1/diagnostics/history              # Diagnose-Historie
GET    /v1/diagnostics/history/{id}         # Einzelner Report
POST   /v1/diagnostics/export/{id}         # Report als Markdown exportieren
GET    /v1/diagnostics/checks              # Verfuegbare Checks auflisten
```

### Block 4D.2: Report-System fuer Repo (~4-5h)

**Ordnerstruktur (im life-Repo):**
```
arbeitsbereiche/automation-one/
├── diagnosen/
│   ├── _aktuelle/                    # Unbearbeitete Reports
│   ├── _archiv/                      # Erledigte Reports
│   └── _vorlagen/                    # Report-Templates (existieren bereits)
```

**Report-Format:** Maschinenlesbares Markdown mit: Gesamtstatus, Check-Ergebnisse (✅/⚠️/❌), Severity-Tabelle, Empfehlungen, Naechste Schritte (Checkliste).

**Export-Buttons im Frontend:**
- "Report exportieren" → Markdown in `diagnosen/_aktuelle/`
- "Als Auftrag speichern" → Generiert `auftrag-diagnose-YYYY-MM-DD.md`

### Block 4D.3: Frontend Diagnostics Hub UI (~6-8h)

**Erweiterung von SystemMonitorView.vue:**
- Tab "Uebersicht": System-Status-Kacheln + Schnell-Diagnose-Buttons + Live-Metriken
- Tab "Diagnosen": Full-Diagnostic-Button + Einzelne Checks als Cards + Ergebnis-Anzeige
- Tab "Reports": Liste aller Reports + Sortierung + Status-Tracking

**Recherche-Empfehlung: Pro-ESP Health-Score (4 Dimensionen — AWS IoT Device Defender Pattern):**
Connectivity + Data Quality + Firmware + Config → aggregierter Score pro Device.

### Block 4D.4: Diagnose-Trigger via Logic Engine (~2-3h)

Neuer Condition-Evaluator `DiagnosticsConditionEvaluator` + Action-Executor `DiagnosticsActionExecutor`. Beispiel: "Wenn Health-Status == degraded FUER 5 Min → Volle Diagnose starten + Notification".

### Verifikation 4D

- [ ] Uebersicht-Tab: Alle 5 Status-Kacheln zeigen korrekten Status
- [ ] Schnell-Diagnose: Jeder der 10 Checks einzeln startbar
- [ ] Volle Diagnose: Alle Checks laufen, Ergebnis wird angezeigt
- [ ] Report-Export: Markdown-Datei wird in `diagnosen/_aktuelle/` gespeichert
- [ ] Logic Engine: Regel "Wenn DB degraded → Diagnose starten" funktioniert

---

## Phase 4E: Hardware-Test 2 (~10-15h)

### Ziel

Mit dem vollstaendig integrierten System (Notifications, Alerts, Plugins, Diagnostics) den zweiten, intensiven Hardware-Test durchfuehren. Diesmal mit vollem Monitoring, automatischen Diagnosen und strukturierter Fehler-Dokumentation.

### Block 4E.1: Pre-Flight Checklist (~2-3h)

**System-Bereitschaft:**
- [ ] Docker: Alle Container healthy (13/13)
- [ ] Grafana: 38/38 Alerts aktiv, Contact Point (Webhook) konfiguriert
- [ ] Email-Service: Test-Email erfolgreich
- [ ] Notification-Inbox: Unread-Count = 0 (frischer Start)

**ESP32-Bereitschaft:**
- [ ] Physisch verkabelt (SHT31-D I2C)
- [ ] Firmware aktuell, WiFi stabil
- [ ] Device registriert + approved, Sensor-Configs vorhanden

**Frontend-Bereitschaft:**
- [ ] Monitor zeigt Daten, Dashboard mit Widgets
- [ ] Logic Rules aktiv, Diagnostics Hub zeigt "System OK"
- [ ] Notification-Badge sichtbar

### Block 4E.2: Test-Szenarien (~2-3h)

| # | Szenario | Dauer | Prueft |
|---|----------|-------|--------|
| 1 | Happy Path | 30 Min | E2E Datenfluss, Monitoring, Dashboards |
| 2 | Threshold-Trigger | 15 Min | Alert-System, Notification-Routing, Logic Rules |
| 3 | Verbindungsabbruch | 15 Min | Heartbeat-Alert, Reconnect, Auto-Resolve |
| 4 | Diagnose unter Last | 15 Min | Diagnostics Hub waehrend Betrieb |
| 5 | Multi-Sensor (optional) | 15 Min | Zweiter Sensor, MultiSensorWidget |

**Recherche-Erkenntnis — Signal-Coverage-Luecke (HW-Test 1):**
SHT31 wurde nur im Normalbereich (20-25°C) getestet. HW-Test 2 sollte 3 Temperaturbereiche abdecken: kalt (<15°C), normal (20-25°C), warm (>30°C). Zusaetzlich: 3 Fault-Injection-Szenarien (Power-Cycle, WiFi-Loss, Sensor-Unplug).

### Block 4E.3: Automatisierte Test-Dokumentation (~3-4h)

Waehrend des Tests generiert das System automatisch:
1. **Test-Log** (Markdown): Chronologischer Ablauf aller Events
2. **Diagnose-Reports**: Automatisch alle 15 Min via Logic Rule
3. **Metriken-Snapshot**: Prometheus-Query fuer Zusammenfassung

**Abschluss-Report:** Strukturiert wie HW-Test 1, gespeichert in `arbeitsbereiche/automation-one/hardware-tests/`.

### Verifikation 4E

- [ ] Alle 4-5 Szenarien durchlaufen, Ergebnis dokumentiert
- [ ] Diagnose-Reports automatisch generiert
- [ ] Gefundene Bugs als strukturierte Reports in `diagnosen/_aktuelle/`
- [ ] Abschluss-Report vollstaendig

---

## Bestehende Integration: Gemeinsame Error-Reports (Schritt 4.1)

### Unified Error Report Format

| Feld | Typ | Beschreibung |
|------|-----|-------------|
| source | enum | "wokwi" \| "production" \| "ci_cd" |
| error_code | int | Error-Code aus Phase 0 Taxonomie (1000-6099) |
| severity | enum | "info" \| "warning" \| "error" \| "critical" |
| timestamp | ISO 8601 | Zeitpunkt des Fehlers |
| esp_id | string | ESP-ID oder "WOKWI_SIM" |
| scenario | string? | Wokwi-Szenario-Name |
| description | string | Fehlerbeschreibung |
| correlation_id | uuid? | Fuer Cross-Layer-Korrelation |

### Agent-Integration

- **test-log-analyst**: Error-Report-Format nutzen fuer Wokwi UND Produktions-Audit-Logs
- **meta-analyst**: Cross-Report-Korrelation (Wokwi + Produktion + AI-Predictions)

---

## Bestehende Integration: Dashboard-Konsolidierung (Schritt 4.2)

### Vorhandene Dashboards (2/5 — verifiziert 2026-03-02)

| Dashboard | Status | Notiz |
|-----------|--------|-------|
| System Health | ✅ Existiert | `docker/grafana/provisioning/dashboards/system-health.json` |
| Debug Console | ✅ Existiert | `docker/grafana/provisioning/dashboards/debug-console.json` |
| Sensor Data | 🔲 Geplant | PostgreSQL-Datasource FEHLT |
| Error Analysis | 🔲 Geplant | Error-Heatmap, AI-Anomalien |
| Test Status | 🔲 Geplant | CI/CD + Wokwi Results |

### Vorhandene Datasources (2/3)

| Datasource | Status |
|------------|--------|
| Prometheus | ✅ Konfiguriert (uid: prometheus) |
| Loki | ✅ Konfiguriert (uid: loki) |
| PostgreSQL | 🔲 **FEHLT** — noetig fuer sensor_data + ai_predictions |

### Alert-Regeln (32 — verifiziert 2026-03-02)

7 Gruppen: Critical (6), Warning (3), Infrastructure (6), Sensor/ESP (7+), Application (6), MQTT Broker (2).

---

## Bestehende Integration: Feedback-Loop (Schritt 4.3)

### Manueller Feedback-Loop

```
Produktion: Error erkannt → Analyse → Fix → Wokwi-Regression → CI/CD → Deploy
```

### Closed-Loop Agent-Feedback via Wokwi MCP

```
┌──────────────────────────────────────────────────────────────────┐
│              CLOSED-LOOP FEEDBACK (Agent-Driven)                  │
│                                                                  │
│  1. DETECT          2. REPRODUCE        3. ANALYSE               │
│  Grafana Alert      Wokwi MCP:          Phase 3 RCA:             │
│  + Isolation Forest Fehler in SIL       KG-Lookup + LLM          │
│  + auto-ops         reproduzieren       Root-Cause                │
│                                                                  │
│  5. VERIFY          4. FIX                                       │
│  Wokwi MCP:         Dev-Agent                                    │
│  Fix in SIL         implementiert Fix                            │
│  verifizieren       basierend auf RCA                            │
│                                                                  │
│  6. LEARN: Pattern → Fehler-KG + CI/CD Regression                │
└──────────────────────────────────────────────────────────────────┘
```

**Naming-Konvention Regressions-Szenarien:** `regression_{error_code}_{kurzbeschreibung}.yaml`

---

## Bestehende Integration: Frontend Tool-Integration (Schritt 4.5)

### 3-Stufen-Roadmap

| Stufe | Was | Aufwand |
|-------|-----|---------|
| 1 | ExternalIframeWidget (URL-Embedding im Dashboard-Editor) | 1-2 Tage |
| 2 | Integration-Manager View (`/integrations`, CRUD) | 1-2 Wochen |
| 3 | Frontend Plugin-System (Dynamic Import, Sandboxed) | 3-4 Wochen |

---

## Abhaengigkeiten und Parallelisierung

```
Voraussetzungen (4 Auftraege, ~30-35h):
├── Logging Multi-Layer Fix
├── Loki Pipeline Verifikation
├── Logic Engine Volltest
└── Mock-Trockentest

Phase 4A (15-20h):
├── 4A.1 Email Backend (6-8h)       ← ZUERST
├── 4A.2 Frontend Inbox (6-8h)      ← Parallel zu 4A.3
└── 4A.3 Grafana Webhook (2-3h)     ← Parallel zu 4A.2

Phase 4B (15-20h):                   ← NACH 4A.1
├── 4B.1 Schema + Store (4-5h)
├── 4B.2 Alert-UI (5-6h)
├── 4B.3 Threshold-Alerts (3-4h)    ← Parallel zu 4B.2
└── 4B.4 Health-Aggregation (3-4h)  ← Parallel zu 4B.2

Phase 4C (15-20h):                   ← NACH 4A.1
├── 4C.1 Plugin-Registry (4-5h)
├── 4C.2 Plugin-UI (5-6h)
├── 4C.3 Logic Engine Actions (3-4h)
└── 4C.4 User-Kontext (2-3h)

Phase 4D (20-25h):                   ← NACH 4B + 4C
├── 4D.1 Backend Service (5-6h)
├── 4D.2 Report-System (4-5h)       ← Parallel zu 4D.3
├── 4D.3 Frontend UI (6-8h)
└── 4D.4 Logic Trigger (2-3h)       ← NACH 4D.1 + 4C.3

Phase 4E (10-15h):                   ← NACH 4A-4D
├── 4E.1 Pre-Flight (2-3h)
├── 4E.2 Test-Szenarien (2-3h)
└── 4E.3 Dokumentation (3-4h)
```

---

## Akzeptanzkriterien Phase 4 (Gesamt)

### Basis-Kriterien

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | Notification-Router im Backend aktiv | WebSocket + Email + Webhook Channels funktionieren |
| 2 | Email-Service sendet Test-Email | `/v1/notifications/test-email` erfolgreich |
| 3 | Frontend-Inbox mit Badge und Drawer | Badge zaehlt ungelesene, Drawer zeigt gefilterte Liste |
| 4 | Grafana-Webhook → Backend → Inbox | Alert-Lifecycle: firing → acknowledged → resolved |
| 5 | UnifiedAlert Schema implementiert | Alle 6 Sources normalisiert auf ein Schema |
| 6 | ISA-18.2 eingehalten | < 6 Alerts/Stunde bei normalem Betrieb |
| 7 | Plugin-Management UI | 4 Plugins sichtbar, Config-Dialog, Execute-Button |
| 8 | Logic Engine → Plugin Action | Regel feuert → Plugin wird ausgefuehrt |
| 9 | Diagnostics Hub | 10 Checks, Report-Export, Live-Metriken |
| 10 | Hardware-Test 2 bestanden | 4-5 Szenarien durchlaufen, Bugs dokumentiert |

### Erweiterte Kriterien (Closed-Loop + Frontend Tool-Integration)

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 11 | Wokwi MCP in `.mcp.json` konfiguriert | `wokwi` Key vorhanden |
| 12 | Agent kann via MCP Simulation starten + Serial lesen | Manueller Test |
| 13 | Fehler-KG hat mindestens 20 Kausalkanten | KG-Datei oder DB |
| 14 | ExternalIframeWidget im Dashboard-Editor | Widget fuer URL-Embedding |
| 15 | 3 neue Grafana Dashboards | Sensor Data, Error Analysis, Test Status |
| 16 | PostgreSQL als Grafana-Datasource | datasources.yml hat PostgreSQL |

---

## Wissenschaftliche Fundierung Phase 4

| Paper | Kernaussage | Anwendung |
|-------|-------------|-----------|
| **Naqvi et al. (2026)** | Closed-Loop Agent-Architektur | Feedback-Loop |
| **TraceCoder (2026)** | Multi-Agent Debugging, +34.43% Pass@1 | Error-Report-Korrelation |
| **Chan & Alalfi (2025)** | SmartTinkerer: RL + Multi-Agent IoT | Multi-Agent Validierung |
| **LLMs-DCGRCA (2025)** | Dynamische Kausal-Graphen + LLMs | Kausal-Graph in Feedback-Loop |
| **ISA-18.2 / IEC 62682** | Alarm-Management-Standard | Alert-Rate-Limits, Benchmarks (4B) |
| **Phan & Nguyen (2025)** | Isolation Forest optimal fuer IoT-Sensordaten | Anomalie-Erkennung (Phase 3→4) |
| **Devi et al. (2024)** | IF → Self-Healing (Circuit Breaker Bruecke) | Recovery-Automatisierung |

---

## Beziehung zu bestehenden Auftraegen

| Bestehender Auftrag | Beziehung |
|---------------------|-----------|
| `auftrag-unified-monitoring-ux.md` | **WIRD ERSETZT** durch 4B (gleiche Vision, konkretere Umsetzung) |
| `auftrag-logic-rules-live-monitoring-integration.md` | **INTEGRIERT** in 4B.2 + 4D.4 |
| `auftrag-logging-multi-layer-fix.md` | **VORAUSSETZUNG** |
| `auftrag-loki-pipeline-verifikation.md` | **VORAUSSETZUNG** |
| `auftrag-logic-engine-volltest.md` | **VOR 4E** |
| `auftrag-mock-trockentest.md` | **VOR 4E** |
| `auftrag-isolation-forest.md` | **NACHFOLGER** — nutzt Diagnostics Hub |
| `auftrag-editor-integration-finaler-polish.md` | **PARALLEL** — unabhaengig |
| `auftrag-dashboard-logik-ux-finalpolish.md` | **PARALLEL** — unabhaengig |

---

## Endresultat

Nach Phase 4 ist die Testinfrastruktur komplett:

| Komponente | Status |
|-----------|--------|
| Error-Taxonomie (1000-6099) | Vollstaendig, dokumentiert, in Grafana |
| Wokwi-Simulation (SIL) | 173+ Szenarien, CI/CD automatisiert |
| Wokwi MCP Server | Agent-Driven SIL-Testing, Echtzeit-Simulation |
| Produktionstestfeld | ESP32 + Sensoren, E2E verifiziert |
| KI-Error-Analyse | Stufe 1 (Rule-based) + Stufe 2 (Isolation Forest) aktiv |
| **Notification-Stack** | **Email + WebSocket + Webhook + Inbox** |
| **Unified Alert Center** | **ISA-18.2-konform, alle Quellen konsolidiert** |
| **Plugin-System** | **Frontend-UI, Logic Engine Integration** |
| **Diagnostics Hub** | **10 Checks, Reports, Live-Metriken** |
| **Hardware-Test 2** | **Volles Monitoring, automatische Dokumentation** |
| Dashboards | 5 Dashboards (Operations, Debug, Sensor, Error, Test) |
| Feedback-Loop | Closed-Loop Agent: Detect → Reproduce → Analyse → Fix → Verify |
| Agent-System | 13+ Agents orchestriert, Reports konsolidiert |
| Wissenschaftliche Basis | 16+ Papers, ISA-18.2 Standard, 4 Forschungsluecken identifiziert |
