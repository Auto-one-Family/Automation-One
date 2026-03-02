# Unified Monitoring UX — Konsolidierter Auftrag

> **Typ:** Konsolidierungs-Auftrag (Frontend + Backend + Grafana Provisioning)
> **Prioritaet:** NACH Hardware-Testlauf
> **Geschaetzter Aufwand:** ~10-14 Stunden (3 Arbeitspakete)
> **Betroffene Schichten:** El Servador (2 Endpoints + 2 WS-Events), El Frontend (1 Store + 3 Komponenten-Aenderungen), Grafana (2 Provisioning-Dateien)
> **Erstellt:** 2026-02-25
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf verify-plan-Analyse + 3 gezielte Recherchen
> **Ersetzt:** `auftrag-monitoring-stack-integration.md` (4-Schichten-Entwurf mit 7 Architektur-Problemen)
> **Status:** ABSORBIERT durch Phase 4A (Notification-Stack) + Phase 4B (Unified Alert Center). UX-Auftrag wird NICHT separat implementiert. Gute Architekturentscheidungen (ISA-18.2, ERSETZEN statt HINZUFUEGEN, ein Alert-Begriff) werden in 4A/4B uebernommen. Kein useSystemHealthStore, kein AlertSlideOver, kein alert_update WS-Event — alles durch notification-inbox.store, NotificationDrawer, notification_new ersetzt.
>
> **Wissensgrundlage (Recherche-Ergebnisse):**
> - `wissen/iot-automation/grafana-alerting-webhook-provisioning.md` — Exakte YAML-Vorlagen, Payload-Format, 9 Fallstricke
> - `wissen/iot-automation/vue3-pinia-health-aggregation-store-pattern.md` — Store-Referenzimplementierung, Race-Condition-Loesung, 7 Patterns
> - `wissen/iot-automation/unified-alert-center-ux-best-practices.md` — 5 Plattformen verglichen, ISA-18.2 Benchmark, Progressive Disclosure 4-Ebenen, Alert-Fatigue-Strategien, 31 Quellen
> - `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` — 5-Sekunden-Regel, Dashboard-Design, Farb-Kodierung
>
> **Erweiterte Wissensgrundlage (Recherche+Forschung 2026-02-25):**
> - `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` — 12 KI-Antipatterns bei Frontend-Dev, SPOG-Formel, 3-Klick-Regel, Vue 3 Konsolidierungs-Checkliste (31 Quellen: Addy Osmani, Martin Fowler, NN/g, incident.io)
> - `wissen/iot-automation/alarm-fatigue-empirische-benchmarks-monitoring.md` — Empirische Alarm-Fatigue-Daten: 80-99% Fehlalarme (Drew 2014, 390 cit.), 4-Stufen-Hierarchie (Karnik 2015), Alarm-freies Monitoring (Leenen 2022)
> - `wissen/iot-automation/dashboard-cognitive-load-overview-detail-pattern.md` — Shneiderman-Mantra empirisch validiert, Text+Icon > Icon allein (Bancilhon 2023 CHI), Klick-Benchmarks, Status-Aggregation fuer ~50 Devices

---

## Warum dieser Auftrag den alten ersetzt

Der `auftrag-monitoring-stack-integration.md` (verifiziert mit IST-ZUSTAND) hatte 7 Architektur-Probleme:

| # | Problem | Loesung in diesem Auftrag |
|---|---------|--------------------------|
| 1 | **Store-Fragmentierung:** 2 neue Stores (useAlertStore + useSystemHealthStore) erhoehen auf 15 | **EIN Store** `useSystemHealthStore` — Alerts sind Teil des System-Health |
| 2 | **Neue Komponenten neben Bestehenden = Legacy:** AlertListPanel.vue neben AlarmListWidget.vue, SystemStatusBar neben HealthSummaryBar | **ERSETZEN statt HINZUFUEGEN** — Bestehende erweitern, keine Parallelen |
| 3 | **"Alarme" vs "Alerts" Naming-Chaos:** Zwei Begriffe fuer aehnliche Konzepte verwirren den User | **Ein Begriff: "Alert"** mit Kategorien (sensor/infrastructure/device/system) |
| 4 | **Health-Daten 6-fach redundant:** 5 bestehende Quellen + neues system_health WS = 6. Weg | **system_health WS als EINZIGER Push-Kanal**, REST nur fuer Initial-Load |
| 5 | **Debug Console hinter Ctrl+Shift+D:** Entwickler-Denke, kein UX | **Tab #6 in SystemMonitorView** — sichtbar, erreichbar, keine versteckte Tastenkombination |
| 6 | **4 Schichten nicht trennbar:** Schicht 2 haengt von Schicht 1 ab, Schicht 3 auch | **3 Arbeitspakete** mit klaren Abhaengigkeiten und parallelen Teilen |
| 7 | **Grafana Contact Point Provisioning unklar:** Kein konkretes YAML, kein Payload-Format | **Exakte YAML-Vorlagen** aus gezielter Recherche (Grafana 11.x Docs) |

---

## Architektur-Prinzipien

### 1. Frontend = Kommandozentrale, Grafana = Labor

| Frontend (Reagieren) | Grafana (Analysieren) |
|---|---|
| Ist gerade alles OK? (Ampel) | Temperatur-Trend ueber 7 Tage |
| Welcher Alert feuert JETZT? | PromQL Deep-Dive |
| Welcher ESP ist offline? | Container-CPU 24h |
| Letzte 5 Fehler auf einen Blick | LogQL mit Structured Metadata |
| "Muss ich handeln?" | "Was ist die Ursache?" |

### 2. ERSETZEN statt HINZUFUEGEN

Jede neue Funktionalitaet ersetzt oder erweitert Bestehendes. Keine Parallel-Komponenten, keine Doppel-Stores, keine zweiten Notification-Pipelines.

### 3. Ein Alert-Konzept

Es gibt nur **"Alerts"** — mit Kategorien:

| Kategorie | Quelle | Beispiel |
|-----------|--------|---------|
| `sensor` | Grafana-Alert + sensor_health WS | ao-sensor-stale, ao-sensor-temp-range |
| `infrastructure` | Grafana-Alert | ao-container-restart, ao-disk-full |
| `device` | Grafana-Alert + esp_health WS | ao-esp-offline, ao-heartbeat-gap |
| `system` | Grafana-Alert + error_event WS | ao-server-down, ao-mqtt-down |

"Alarme" (AlarmListWidget) wird umbenannt zu "Sensor Alerts" und in das einheitliche System integriert.

### 4. Progressive Disclosure (3 Stufen)

```
Stufe 1: StatusBar (permanent, 5-Sekunden-Regel)
  → "Alles OK" ODER "2 Alerts aktiv"
  → Server | MQTT | DB | ESPs: 4/5 | Alerts: 2

Stufe 2: Alert-SlideOver (1 Klick auf StatusBar-Badge)
  → Liste aktiver Alerts mit Severity, Zeitpunkt, Kategorie
  → Klick auf einzelnen Alert → Deep-Link nach Grafana

Stufe 3: SystemMonitorView (Navigation oder Klick auf "Details")
  → Volle Debug-Ansicht mit Logs, Events, Health-Details
  → Tab "Debug" fuer Loki-Logs, MQTT-Feed, Container-Status
```

### 5. Forschungsvalidierte UX-Regeln

Diese Prinzipien sind empirisch belegt und MUESSEN bei der Implementierung beachtet werden:

| Regel | Quelle | Implikation fuer AutomationOne |
|-------|--------|-------------------------------|
| **Text + Icon + Farbe** — nie Farbe allein als Informationstraeger | Bancilhon et al. 2023, CHI, 17 cit. | StatusBar-Dots MUESSEN Text-Label haben ("Server" nicht nur gruener Punkt). Alert-Items brauchen Severity-Text UND Icon UND Farbe |
| **Overview bleibt sichtbar beim Drill-Down** | Baudisch et al. 2002, CHI, 275 cit. | StatusBar bleibt IMMER sichtbar (auch wenn AlertSlideOver offen, auch in SystemMonitorView). Kein reines Zooming ohne Kontext |
| **< 3 Sekunden fuer Gesamtstatus** | Endsley (Situational Awareness Level 1) | StatusBar muss SOFORT antworten: "Alles OK" oder "Problem". Keine Ladeanimation die laenger als 3s dauert |
| **Max 3 Klicks bis Root-Cause** | Industrie-Benchmark (Grafana, Datadog, ThingsBoard) | Klick 1: StatusBar → AlertSlideOver. Klick 2: Alert → Detail. Klick 3: Detail → Grafana. NICHT mehr |
| **Alarm-Flood-Erkennung** | Ahmed et al. 2013, IEEE T-ASE, 118 cit. | Wenn >30% der Devices gleichzeitig alarmieren → EIN konsolidierter Infrastructure-Alert statt 15+ Einzel-Alerts. Backend muss gruppieren |
| **Actionable-Rate > 80%** | ISA-18.2, Drew 2014, 390 cit. | Jeder Alert den das Frontend anzeigt MUSS eine klare Handlung implizieren. Info-Events sind KEINE Alerts (gehen ins Event-Log, nicht in die Alert-Liste) |

**KI-Antipattern-Checkliste fuer den implementierenden Agent:**
- [ ] KEIN Component-Sprawl: Bestehende Komponenten erweitern, nicht neue neben Bestehende stellen
- [ ] KEINE Over-Abstraction: Kein Abstract-Alert-Base-Component wenn es nur 2 Alert-Typen gibt
- [ ] KEINE redundanten Datenquellen: `useSystemHealthStore` ist Single Source of Truth — keine eigenen REST-Calls in Komponenten
- [ ] KEINE Terminologie-Inkonsistenz: "Alert" durchgaengig, niemals "Alarm" als Oberbegriff, niemals "Warnung" statt "Warning"
- [ ] KEIN Draft-Zero-Deployment: Jeden generierten Code manuell gegen das Domain-Modell pruefen (Multi-Value-Splitting, MQTT-Topics, ESP-IDs)
- [ ] KEINE reine Farbkodierung: Immer Text + Icon + Farbe kombinieren (Barrierefreiheit + Kognition)

### 6. EIN Store fuellt ALLES

```
useSystemHealthStore
  ├── serviceHealth     (Server, MQTT, DB Status)
  ├── espFleetHealth    (Online/Offline/Error Counts + per-device)
  ├── activeAlerts      (Map<fingerprint, Alert> — ALLE Quellen)
  ├── alertHistory      (Ring-Buffer, letzte 50)
  ├── overallStatus     (computed: healthy | degraded | critical | unknown)
  └── alertCount        (computed: activeAlerts.size)
```

Kein separater `useAlertStore`. Kein separater `useSystemHealthStore` + `useAlertStore`. EINER.

---

## Ersetzungs-Matrix

### Komponenten

| Bestehend | Aktion | Ergebnis |
|-----------|--------|---------|
| `HealthSummaryBar.vue` | **ERWEITERN** um Alert-Badge + Service-Status-Dots | Wird zur `SystemStatusBar` (gleiche Datei, umbenannt) |
| `AlarmListWidget.vue` | **ERWEITERN** um Grafana-Alert-Kategorie | Zeigt ALLE Alert-Typen (Sensor-Quality + Grafana), unified unter "Alerts" |
| `HealthTab.vue` | **UNVERAENDERT** — zeigt weiter ESP-Fleet-Detail | Bezieht Daten neu aus `useSystemHealthStore` statt eigener REST-Calls |
| `ESPHealthWidget.vue` | **UNVERAENDERT** — Dashboard-Widget | Bezieht Daten neu aus `useSystemHealthStore` |
| `ToastContainer.vue` | **UNVERAENDERT** — bleibt einziges Toast-System | Grafana-Alerts nutzen das BESTEHENDE `useToast()`, keine eigene AlertNotification.vue |
| `notification.store.ts` | **UNVERAENDERT** — bleibt fuer interne Server-Events | `error_event`, `notification`, `system_event` → Toast. Kein Alert-Handling hier |

### Stores

| Bestehend | Aktion | Ergebnis |
|-----------|--------|---------|
| `notification.store.ts` | **UNVERAENDERT** | Interne Events → Toast |
| `sensor.store.ts` | **UNVERAENDERT** | sensor_data, sensor_health |
| `esp.store.ts` | **MINIMAL ERWEITERN** | Leitet `system_health` + `alert_update` WS-Events an `useSystemHealthStore` weiter |
| — | **NEU** | `system-health.store.ts` — EIN neuer Store fuer alles |

### Neue Dateien

| Datei | Typ | Arbeitspaket |
|-------|-----|-------------|
| `shared/stores/system-health.store.ts` | Frontend Store | A |
| `components/system-monitor/AlertSlideOver.vue` | Frontend Komponente | A |
| `api/v1/alerts.py` | Backend Router | A |
| `docker/grafana/provisioning/alerting/contact-points.yml` | Grafana Config | A |
| `docker/grafana/provisioning/alerting/notification-policies.yml` | Grafana Config | A |

### Geloeschte/Umbenannte Dateien

| Datei | Aktion |
|-------|--------|
| `HealthSummaryBar.vue` | Umbenennen zu `SystemStatusBar.vue` (gleicher Pfad in `components/system-monitor/`) |
| `AlertListPanel.vue` | Wird NICHT erstellt (war im alten Auftrag geplant) — AlarmListWidget uebernimmt |
| `AlertNotification.vue` | Wird NICHT erstellt — bestehendes Toast-System uebernimmt |
| `alert.store.ts` | Wird NICHT erstellt — useSystemHealthStore uebernimmt |

---

## Arbeitspaket A: Unified Health + Alert System (~5-6h)

**Abhaengigkeiten:** Keine (Basis fuer B und C)
**Reihenfolge:** A MUSS zuerst, B und C danach (parallel moeglich)

### A1: Grafana Contact Point + Notification Policy (Provisioning)

Zwei neue YAML-Dateien in `docker/grafana/provisioning/alerting/`:

**`contact-points.yml`:**

```yaml
# Grafana Alerting File Provisioning — Contact Points
apiVersion: 1

contactPoints:
  - orgId: 1
    name: automationone-webhook
    receivers:
      - uid: ao-webhook-receiver
        type: webhook
        disableResolveMessage: false
        settings:
          url: http://el-servador:8000/api/v1/alerts/webhook
          httpMethod: POST
```

**`notification-policies.yml`:**

```yaml
# Grafana Alerting File Provisioning — Notification Policies
apiVersion: 1

policies:
  - orgId: 1
    receiver: automationone-webhook
    group_by:
      - grafana_folder
      - alertname
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

**Fallstricke (aus Recherche):**
- `name: automationone-webhook` im Contact Point MUSS EXAKT mit `receiver: automationone-webhook` in der Policy uebereinstimmen
- `uid` max 40 Zeichen, nur `[a-zA-Z0-9-_]`
- Provisionierte Ressourcen sind **read-only** in der Grafana-UI (kein Editieren, kein Loeschen)
- Dateinamen werden alphabetisch gelesen → `alert-rules.yml` VOR `contact-points.yml` VOR `notification-policies.yml` (OK — keine Abhaengigkeit bei der Reihenfolge)
- Hot-Reload moeglich: `POST /api/admin/provisioning/alerting/reload` (nur Admin)

**Verifikation A1:**
- [ ] `docker compose restart grafana` → Grafana startet ohne Provisioning-Fehler
- [ ] Grafana UI → Alerting → Contact Points → "automationone-webhook" sichtbar (read-only Badge)
- [ ] Grafana UI → Alerting → Notification Policies → Default Policy zeigt "automationone-webhook"

### A2: Backend Webhook-Endpoint + Alert-Cache + WS-Broadcast

**Neuer Router: `api/v1/alerts.py`**

```python
# Pattern: Analog zu POST /logs/frontend (ohne Auth, mit Rate-Limiting)
# Grafana sendet Standard-Webhook-Payload:
# {
#   "receiver": "automationone-webhook",
#   "status": "firing" | "resolved",
#   "alerts": [{
#     "status": "firing",
#     "labels": {"alertname": "...", "severity": "...", ...},
#     "annotations": {"summary": "...", "description": "..."},
#     "startsAt": "2026-02-25T10:00:00Z",
#     "endsAt": "0001-01-01T00:00:00Z",  # 0001 = noch aktiv
#     "fingerprint": "abc123",
#     "generatorURL": "http://grafana:3000/alerting/..."
#   }]
# }
```

**Implementierung:**
1. Pydantic-Modelle: `GrafanaWebhookPayload`, `GrafanaAlert` (Labels + Annotations + Status + Fingerprint)
2. In-Memory Alert-Cache: `dict[str, GrafanaAlert]` (Key = fingerprint). Max 200 Eintraege, LRU-Eviction
3. Bei `status: "firing"` → Cache eintragen + WS-Broadcast `alert_update`
4. Bei `status: "resolved"` → Aus Cache entfernen + WS-Broadcast `alert_update` mit resolved-Flag
5. Rate-Limiting: 30 req/min per IP (Grafana sendet gruppiert, nicht per Alert)
6. **KEIN Auth** — Grafana hat keinen JWT-Token. Server-zu-Server im Docker-Netz
7. Router registrieren in `api/v1/__init__.py`

**Alert-Kategorisierung im Backend:**

```python
ALERT_CATEGORY_MAP = {
    "automationone-sensor-esp": "sensor",
    "automationone-critical": "system",
    "automationone-application": "system",
    "automationone-infrastructure": "infrastructure",
    "automationone-mqtt-broker": "system",
    "automationone-loki-alerts": "infrastructure",
    "automationone-warnings": "device",
}

def categorize_alert(alert: GrafanaAlert) -> str:
    folder = alert.labels.get("grafana_folder", "")
    return ALERT_CATEGORY_MAP.get(folder, "system")
```

**WS-Event `alert_update` Payload:**

```json
{
  "event_type": "alert_update",
  "timestamp": "2026-02-25T10:00:00Z",
  "correlation_id": "uuid",
  "data": {
    "fingerprint": "abc123",
    "status": "firing",
    "category": "sensor",
    "severity": "critical",
    "alertname": "ao-sensor-stale",
    "summary": "Sensor SHT31 on ESP_12AB has not reported for 10 minutes",
    "labels": {"esp_id": "ESP_12AB", "sensor_type": "sht31"},
    "generator_url": "http://localhost:3000/alerting/...",
    "starts_at": "2026-02-25T10:00:00Z"
  }
}
```

**Verifikation A2:**
- [ ] `curl -X POST http://localhost:8000/api/v1/alerts/webhook -H "Content-Type: application/json" -d '{"receiver":"test","status":"firing","alerts":[{"status":"firing","labels":{"alertname":"test","severity":"warning"},"annotations":{"summary":"Test alert"},"startsAt":"2026-02-25T10:00:00Z","endsAt":"0001-01-01T00:00:00Z","fingerprint":"test123","generatorURL":""}]}'` → 200 OK
- [ ] WebSocket-Client empfaengt `alert_update` Event
- [ ] Zweiter POST mit `"status":"resolved"` → Alert verschwindet aus Cache

### A3: Backend system_health WS-Event (periodisch 30s)

**Kein neuer Endpoint.** Stattdessen: Erweiterung des bestehenden `update_all_metrics_async()` Scheduler-Jobs in `core/metrics.py` (laeuft bereits alle 15s).
[Korrektur verify-plan: Funktionsname ist `update_all_metrics_async()`, nicht `update_metrics()` — Zeile 403 in metrics.py]

**Implementierung:**
1. Alle 30 Sekunden (jeder 2. Zyklus): Health-Daten aus dem bereits vorhandenen Collection-Zyklus nehmen
2. Alert-Cache-Zusammenfassung aus A2 hinzufuegen
3. Broadcast via `ws_manager.broadcast("system_health", data)`
4. **system_health nutzt BESTEHENDE Daten** — keine neuen DB-Queries, keine neuen API-Calls

**WS-Event `system_health` Payload:**

```json
{
  "event_type": "system_health",
  "timestamp": "2026-02-25T10:00:30Z",
  "data": {
    "services": {
      "database": {"status": "healthy", "pool_active": 3, "pool_size": 20},
      "mqtt": {"status": "healthy", "messages_processed": 1234},
      "websocket": {"status": "healthy", "connections": 2}
    },
    "esp_fleet": {
      "total": 5, "online": 4, "offline": 1, "error": 0
    },
    "alerts": {
      "total_active": 2,
      "by_severity": {"critical": 0, "warning": 2},
      "by_category": {"sensor": 1, "device": 1}
    },
    "system": {
      "cpu_percent": 12.3,
      "memory_percent": 45.6
    }
  }
}
```

**Typ-Definition:** Neuer Event-Typ `system_health` + `alert_update` in `types/websocket-events.ts` hinzufuegen.

**Verifikation A3:**
- [ ] WebSocket-Client empfaengt `system_health` Events alle ~30s
- [ ] Daten stimmen mit `GET /api/v1/health/detailed` ueberein
- [ ] Alert-Zusammenfassung zeigt aktive Alerts aus dem Cache

### A4: Frontend useSystemHealthStore

**Ein neuer Store** in `shared/stores/system-health.store.ts`, basierend auf dem recherchierten Pattern.

**Kern-Architektur:**

```
App-Start
  → initialize(): REST parallel load (/health/detailed + /health/esp)
  → WS-Registrierung: system_health, alert_update, esp_health
  → Ready-Gate: Events VOR REST-Abschluss werden gepuffert
  → drainPendingEvents(): Gepufferte Events nach REST-Load verarbeiten
```

**Kritische Design-Entscheidungen:**
1. **shallowRef** fuer `serviceHealth`, `espFleetHealth`, `activeAlerts` — Deep Reactivity waere Performance-Killer bei 30s-Updates
2. **Map<string, Alert>** fuer activeAlerts (Key = fingerprint) — O(1) Lookup + Dedup
3. **Ring-Buffer** fuer alertHistory (maximal 50 Eintraege) — kein unbegrenztes Wachstum
4. **Alert Auto-Resolve:** Alerts mit `resolved`-Status werden aus activeAlerts entfernt, in alertHistory verschoben
5. **Keine separate REST-Calls** in HealthTab/ESPHealthWidget — diese beziehen Daten aus dem Store

**Store-Registrierung im WS-Dispatcher (`esp.store.ts`, 1645 Zeilen):**

**IST-ZUSTAND (verifiziert 2026-02-27):** `esp.store.ts` (1671 Zeilen) ist der ZENTRALE WS-Dispatcher. Alle WS-Events laufen durch `esp.store.ts` und werden an spezialisierte Stores delegiert (actuator.store, sensor.store, config.store, zone.store, notification.store, gpio.store). Die 2 neuen Events (`system_health`, `alert_update`) werden analog eingehaengt:
[Korrektur verify-plan: 1671 Zeilen (nicht 1645). Pfad: `El Frontend/src/stores/esp.ts` (nicht shared/stores/)]

```typescript
// In der bestehenden WS-Event-Dispatch-Logik (esp.store.ts, initWebSocket()):
// Pattern ist ws.on(), NICHT switch/case:
ws.on('system_health', handleSystemHealth),
ws.on('alert_update', handleAlertUpdate),

// Handler delegiert an useSystemHealthStore:
function handleSystemHealth(data: any) {
  useSystemHealthStore().handleWsEvent('system_health', data)
}
function handleAlertUpdate(data: any) {
  useSystemHealthStore().handleWsEvent('alert_update', data)
}
```
[Korrektur verify-plan: esp.store.ts nutzt `ws.on('event', handler)` Pattern (Zeile 1518-1548), NICHT switch/case]

**ACHTUNG:** Die HealthTab-Komponente macht aktuell einen EIGENEN REST-Call (`GET /health/esp`) bei jedem Mount. Nach Migration auf `useSystemHealthStore` entfaellt dieser Call — HealthTab liest dann aus dem Store. Das ist die Kern-Konsolidierung: von 4 separaten REST-Calls (HealthTab, HealthSummaryBar, ESPHealthWidget, AlarmListWidget) auf 2 initiale Calls im Store.

**Computed Getters (fuer UI-Binding):**
- `overallStatus`: computed → 'healthy' | 'degraded' | 'critical' | 'unknown'
- `alertCount`: computed → activeAlerts.size
- `espOnlineCount`: computed → espFleetHealth online count
- `espTotalCount`: computed → espFleetHealth total
- `hasActiveAlerts`: computed → alertCount > 0
- `criticalAlerts`: computed → filtered activeAlerts mit severity=critical
- `alertsByCategory`: computed → grouped Map<category, Alert[]>

**Verifikation A4:**
- [ ] Store initialisiert beim App-Start (REST-Load)
- [ ] system_health WS-Events aktualisieren den Store
- [ ] alert_update WS-Events fuegen Alerts hinzu / entfernen sie
- [ ] Race Condition: WS-Event vor REST-Load → Event gepuffert, nicht verloren

### A5: Frontend SystemStatusBar (HealthSummaryBar erweitern)

**Bestehende `HealthSummaryBar.vue` wird erweitert und umbenannt zu `SystemStatusBar.vue`.**

**IST-ZUSTAND (aus Frontend-Code-Analyse 2026-02-25):**
- `HealthSummaryBar.vue` ist aktuell **props-driven**, NICHT WS-reaktiv — bekommt Daten von SystemMonitorView als Props
- Zeigt nur auf dem Events-Tab (collapsible) — NICHT global sichtbar
- Zeigt: Offline-Count, Low-Heap-Count, Weak-Signal-Count
- HealthTab macht **separaten REST-Call** (`GET /health/esp`) mit manuellem Refresh-Button — NICHT WS-reaktiv
- Design-Tokens existieren bereits in `tokens.css`: `--color-status-good` (#22c55e), `--color-status-warning` (#eab308), `--color-status-alarm` (#ef4444), `--color-status-offline` (#6b7280)

**SOLL-Anzeige (permanente Leiste, erfuellt 3-Sekunden-Regel — Bancilhon 2023):**

```
┌──────────────────────────────────────────────────────────────────────┐
│ ● Server  ● MQTT  ● DB  │  ESPs: 4/5 online  │  ⚠ 2 Alerts  [▼]  │
└──────────────────────────────────────────────────────────────────────┘
```

- **Status-Dots MIT Text-Label:** "● Server" nicht nur "●" — Text + Icon + Farbe (Bancilhon 2023: redundante Kodierung entlastet Working Memory)
- **ESP-Count:** "4/5 online" — aus `useSystemHealthStore.espFleetHealth`
- **Alert-Badge:** Zaehler + Severity-Farbe (rot bei critical, gelb bei warning) — aus `useSystemHealthStore.alertCount`
- **[▼] Button:** Oeffnet AlertSlideOver (Stufe 2)

**Design-Token-Nutzung (PFLICHT — keine hardcoded Hex-Werte):**
- Gruen: `var(--color-status-good)` — healthy
- Gelb: `var(--color-status-warning)` — warning
- Rot: `var(--color-status-alarm)` — critical/down
- Grau: `var(--color-status-offline)` — unknown/offline

**Datenquelle:** Ausschliesslich `useSystemHealthStore` — keine eigenen REST-Calls.

**Platzierung:** Oberhalb des Tab-Systems (ViewTabBar), unterhalb der TopBar. Sichtbar auf ALLEN Views — DashboardView, SensorsView, LogicView, SystemMonitorView, etc. (Baudisch 2002: "Focus+Context" — Overview MUSS bei Drill-Down sichtbar bleiben). Eingebaut in `AppShell.vue` oder `TopBar.vue`, NICHT in einzelne Views — sonst vergisst man eine View.

**ACHTUNG:** Die bestehende HealthSummaryBar ist aktuell NUR im Events-Tab der SystemMonitorView sichtbar (collapsible). Die neue SystemStatusBar muss GLOBAL sein — das ist der Kern-Unterschied.

**Verifikation A5:**
- [ ] StatusBar zeigt korrekten Service-Status (Server/MQTT/DB)
- [ ] ESP-Zaehler aktualisiert sich bei esp_health Events
- [ ] Alert-Badge zeigt Anzahl aktiver Alerts
- [ ] Klick auf Alert-Badge oeffnet AlertSlideOver

### A6: Frontend AlertSlideOver (NEU)

**Neue Komponente `AlertSlideOver.vue`** in `components/system-monitor/`.

**Anzeige (SlideOver von rechts, 400px breit):**

```
┌──────────────────────────────────┐
│  Aktive Alerts (2)          [X]  │
├──────────────────────────────────┤
│  🔴 CRITICAL                     │
│  (keine)                         │
│                                  │
│  🟡 WARNING                      │
│  ┌────────────────────────────┐  │
│  │ ao-sensor-stale            │  │
│  │ SHT31 on ESP_12AB          │  │
│  │ seit 12 Min · sensor       │  │
│  │            [Grafana ↗]     │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ ao-esp-offline             │  │
│  │ ESP_56CD                   │  │
│  │ seit 3 Min · device        │  │
│  │            [Grafana ↗]     │  │
│  └────────────────────────────┘  │
│                                  │
│  ─── Letzte aufgeloeste ───      │
│  ✓ ao-container-restart (vor 1h) │
└──────────────────────────────────┘
```

**Features:**
- Gruppiert nach Severity (critical oben, dann warning, dann info)
- Alert-Kategorie als Label (sensor/device/infrastructure/system)
- "seit X Min" relative Zeitanzeige
- Deep-Link nach Grafana (`generatorURL` aus Webhook-Payload)
- Unten: Letzte 5 aufgeloeste Alerts (aus alertHistory)
- Schliesst bei Klick ausserhalb oder Escape
- **Alarm-Flood-Erkennung (Ahmed 2013):** Wenn >3 Alerts der gleichen Kategorie innerhalb 60s eintreffen → als Gruppe darstellen: "Infrastructure: 5 Alerts (MQTT offline → 4 Sensor-Stale)" statt 5 separate Eintraege. Das ist KRITISCH fuer die Benutzbarkeit — ein MQTT-Ausfall erzeugt sonst 10+ Einzel-Alerts

**Datenquelle:** Ausschliesslich `useSystemHealthStore` (activeAlerts, alertHistory).

**Design-Vorgaben (aus Forschung):**
- **Text + Icon + Farbe** fuer jeden Alert-Eintrag (nicht nur Farbpunkte)
- **Severity-Gruppen IMMER sichtbar** (auch wenn leer: "Critical (0)" → spart Verwirrung)
- **Resolved-Alerts max 30 Minuten sichtbar** dann nur im History-Tab (Abschnitt 9.2, unified-alert-center-ux)
- **Resolved zaehlen NICHT zum Badge-Counter** — Badge zeigt nur aktive unresolved Alerts
- **Max 99+ im Badge** (nie dreistellig — ThingsBoard/Grafana-Konvention)

**Verifikation A6:**
- [ ] SlideOver oeffnet bei Klick auf Alert-Badge in StatusBar
- [ ] Alerts gruppiert nach Severity
- [ ] Deep-Link zu Grafana funktioniert
- [ ] Aufgeloeste Alerts erscheinen im "Letzte aufgeloeste"-Bereich

---

## Arbeitspaket B: Alert-Quality-Konsolidierung (~2-3h)

**Abhaengigkeit:** Arbeitspaket A muss abgeschlossen sein (Alert-Store mit Grafana-Daten)
**Kann parallel mit C laufen.**

### B1: AlarmListWidget erweitern (NICHT ersetzen)

**Bestehende `AlarmListWidget.vue` (266 Zeilen) wird erweitert:**

**IST-ZUSTAND (aus Frontend-Code-Analyse 2026-02-25):**
- Zeigt Sensoren mit quality-Status `alarm`/`warning`/`poor`/`error`/`stale` aus esp.store
- Nutzt `QualityIndicator.vue` (4 States: good/warning/alarm/offline)
- Datenquelle: esp.store → sensor quality (WS-reaktiv via `sensor_data`/`sensor_health` Events)
- Widget-Titel: "Alarme" (deutsch) → muss zu "Sensor Alerts" werden
- KEIN Zugang zu Grafana-Alert-Daten

**SOLL-Erweiterung (KEIN Neuschreiben — bestehende Struktur beibehalten):**

1. **Umbenennung:** Widget-Titel von "Alarme" auf "Sensor Alerts"
2. **Zweite Datenquelle:** Neben Sensor-Quality-Alerts (poor/bad/error/stale aus sensor.store via esp.store) AUCH Grafana-Sensor-Alerts aus `useSystemHealthStore.alertsByCategory.sensor`
3. **Vereinte Darstellung:** Ein Alert ist ein Alert — egal ob aus Quality-Berechnung oder Grafana. Einheitliche Card mit:
   - Alert-Name (oder Sensor-Name bei Quality-Alerts) — **TEXT, nicht nur Icon** (Bancilhon 2023)
   - Severity-Farbe (rot/gelb) via bestehende `var(--color-status-alarm/warning)` Tokens
   - Quelle-Badge: "Quality" oder "Grafana" — klein, sekundaer, nicht prominent
   - Zeitstempel
4. **Sortierung:** Severity (critical > warning > info), dann Zeitstempel (neueste zuerst)
5. **Deduplizierung:** Wenn ein Sensor SOWOHL Quality=poor ALS AUCH einen Grafana-Alert hat, nur EINEN Eintrag zeigen — Grafana hat Vorrang (ist spezifischer). Quality-Info als sekundaere Zeile

**Verifikation B1:**
- [ ] AlarmListWidget zeigt sowohl Quality-Alerts als auch Grafana-Sensor-Alerts
- [ ] Keine Duplikate wenn ein Sensor sowohl Quality=poor ALS AUCH Grafana-Alert hat
- [ ] Widget-Titel zeigt "Sensor Alerts" statt "Alarme"

### B2: Sensor-Karten mit Grafana-Alert-Status

**Bestehende Sensor-Karten in MonitorView und HardwareView:**

Wenn ein Grafana-Alert fuer einen Sensor aktiv ist (identifiziert durch `labels.esp_id` + `labels.sensor_type`), soll die Sensor-Karte:

1. Roten Rahmen erhalten (zusaetzlich zum Quality-Indikator)
2. Tooltip: "Grafana Alert: ao-sensor-stale — seit 12 Min"
3. Alert-Icon (kleines Warnsignal-Symbol neben dem Quality-Dot)

**Implementierung:**
- Neues Computed im relevanten Sensor-Rendering: `const sensorAlert = computed(() => systemHealthStore.getAlertForSensor(espId, sensorType))`
- `getAlertForSensor(espId, sensorType)`: Durchsucht activeAlerts nach passenden Labels

**ACHTUNG:** Grafana-Alert-Labels haben `esp_id` und `sensor_type` — KEIN `sensor_id`. Frontend muss Sensor ueber die Kombination `esp_id + sensor_type` finden.

**Verifikation B2:**
- [ ] Sensor-Karte zeigt roten Rahmen bei aktivem Grafana-Alert
- [ ] Alert-Details im Tooltip sichtbar
- [ ] Rahmen verschwindet wenn Alert resolved wird

### B3: Konsistente Stale-Visualisierung

**Bestandsaufnahme (aus Frontend-Code-Analyse 2026-02-25):**
- `QualityIndicator.vue` hat 4 States: `good` / `warning` / `alarm` / `offline` — VERIFIZIERT im Code
- `is_stale` wird in AlarmListWidget korrekt genutzt (via sensor_health WS-Events)
- HealthTab zeigt Fleet-Health per REST (`GET /health/esp`), aber NICHT WS-reaktiv (nur manueller Refresh)
- Farben konsistent mit `tokens.css`: `--color-status-offline` (#6b7280 = Grau) fuer offline/stale

**Pruefung und Fix:**
1. MonitorView Sensor-Cards: `is_stale === true` → Grauer Rahmen + **"Veraltet seit X Min" als TEXT** (nicht nur Farbaenderung — Bancilhon 2023: Text + Icon > Icon allein)
2. HardwareView ESP-Orbital Sensor-Satelliten: `is_stale === true` → Grauer Hintergrund + "Stale" Text-Badge (pulsierender Punkt allein ist zu subtil)
3. QualityIndicator.vue: `stale` mappt korrekt auf `offline`-State — VERIFIZIERT. Aber pruefe ob der `offline`-Text-Label korrekt "Veraltet" zeigt (nicht "Offline" — ein staler Sensor ist nicht offline, er hat nur keine aktuellen Daten)
4. **Konsistente Stale-Schwelle:** Backend definiert stale-Timeout (5 Minuten). Frontend zeigt "Veraltet seit X Min" — die Minutenzahl muss live berechnet werden (nicht einmalig bei Event-Empfang)

**Verifikation B3:**
- [ ] Stale-Sensor in MonitorView visuell als "Veraltet" erkennbar
- [ ] Stale-Sensor in HardwareView ESP-Orbital visuell als "Veraltet" erkennbar
- [ ] Konsistent mit AlarmListWidget (gleiche Farbe, gleicher Text)

---

## Arbeitspaket C: Debug-Integration (~3-4h)

**Abhaengigkeit:** Arbeitspaket A muss abgeschlossen sein (system_health Daten im Store)
**Kann parallel mit B laufen.**

### C1: SystemMonitorView — Debug-Tab hinzufuegen

**Bestehende `SystemMonitorView.vue` (2456 Zeilen, Pfad: `views/SystemMonitorView.vue`) hat bereits 5 Tabs (verifiziert via MonitorTabs.vue):**
[Korrektur verify-plan: 2456 Zeilen (nicht 2120). Pfad ist `El Frontend/src/views/SystemMonitorView.vue`, NICHT `components/system-monitor/`]
- `events` — Ereignisse (Activity-Icon) — Audit-Events + WS
- `logs` — Server Logs (FileText-Icon) — Application Logs (WARNING+)
- `database` — Datenbank (Database-Icon) — DB-Records-Browser
- `mqtt` — MQTT Traffic (MessageSquare-Icon) — Live MQTT Messages
- `health` — Health (HeartPulse-Icon) — Fleet-Health (HealthTab, REST-only, manueller Refresh)

Ein 6. Tab "Debug" wird hinzugefuegt.

**Tab "Debug" zeigt:**

1. **Letzte Log-Zeilen (via Loki-Proxy):**
   - 50 neueste Zeilen aus allen Services
   - Auto-Refresh Toggle (5s Intervall)
   - Service-Filter Dropdown (el-servador, mqtt-broker, grafana, alloy, etc.)
   - Severity-Filter (ERROR, WARN, INFO, DEBUG)

2. **Alert-Historie:**
   - Alle Alerts (aktiv + aufgeloest) aus `useSystemHealthStore.alertHistory`
   - Nicht nur die letzten 5 wie im SlideOver, sondern die vollen 50

3. **Deep-Links nach Grafana:**
   - Pro Service ein Link zum relevanten Grafana-Dashboard
   - Server → `http://localhost:3000/d/server-health`
   - Container → `http://localhost:3000/d/container-metrics`
   - MQTT → `http://localhost:3000/d/mqtt-traffic`
   - Logs → `http://localhost:3000/explore?left={"datasource":"Loki",...}`

4. **Container-Status (optional, nice-to-have):**
   - Falls Zeit: cAdvisor-Daten ueber Prometheus-API abfragen
   - Container-Liste mit CPU/Memory/Status

**KEIN separater Shortcut (Ctrl+Shift+D). Erreichbar ueber:**
- Navigation → System (Admin-Bereich) → Tab "Debug"
- StatusBar → "Details" Link → SystemMonitorView mit Debug-Tab aktiv

### C2: Backend Loki-Proxy Endpoint

**Im bestehenden `api/v1/debug.py` Router (bereits vorhanden — aktuell Mock-ESP-Management + DB-Explorer, 700+ Zeilen):**
[Korrektur verify-plan: debug.py hat KEINE Loki-Funktionalitaet — der Loki-Proxy-Endpoint ist komplett NEU. Alternativ: eigenen `loki.py` Router erstellen um debug.py nicht weiter aufzublaehen]

```python
# GET /api/v1/debug/logs/recent?service=el-servador&limit=50&severity=ERROR
# Proxied an Loki: GET http://loki:3100/loki/api/v1/query_range
# LogQL: {compose_service=~"el-servador|mqtt-broker"} |= "" | line_format "{{.message}}"
```

**Implementierung:**
1. Endpoint in bestehenden `debug.py` Router integrieren (kein neuer Router)
2. Parameter: `service` (optional, Default: alle), `limit` (Default: 50, Max: 200), `severity` (optional)
3. Loki query_range mit `start` = jetzt - 15 Minuten, `end` = jetzt
4. Response: Array von `{timestamp, service, severity, message}`
5. Auth: Admin-only (wie andere Debug-Endpoints)
6. Timeout: 10s (Loki kann langsam sein bei breiten Queries)

**ACHTUNG:** `query_range` verwenden (nicht `query`). Loki unter `http://loki:3100` im Docker-Netz.

### C3: server_log WS-Event implementieren (optional)

**In `websocket-events.ts` ist `server_log` bereits DEFINIERT aber laut Kommentar "awaiting backend implementation".**

Falls Zeit: Live-Log-Stream ueber WebSocket (alternative zu Polling).
- Backend: Alloy oder Loki Tail-API → WS-Event `server_log`
- Frontend: Debug-Tab mit Live-Stream

**Prioritaet:** NIEDRIG — Polling-Ansatz (C2) reicht fuer den Anfang.

**Verifikation Arbeitspaket C:**
- [ ] SystemMonitorView hat 6. Tab "Debug"
- [ ] Log-Zeilen werden von Loki geladen und angezeigt
- [ ] Service-Filter und Severity-Filter funktionieren
- [ ] Alert-Historie zeigt alle 50 Eintraege
- [ ] Deep-Links oeffnen korrekte Grafana-Dashboards

---

## Terminologie-Referenz

| Begriff | Definition | Wo verwendet |
|---------|-----------|-------------|
| **Alert** | Jede Benachrichtigung ueber einen problematischen Zustand | Ueberall |
| **Alert-Kategorie** | sensor / infrastructure / device / system | AlertSlideOver, AlarmListWidget, Store |
| **Alert-Severity** | critical / warning / info | Farbkodierung, Sortierung |
| **Alert-Status** | firing / resolved | Store (activeAlerts vs alertHistory) |
| **Alert-Quelle** | "Quality" (Frontend-Berechnung) oder "Grafana" (Webhook) | AlarmListWidget Badge |
| **Health** | Systemzustand (Service up/down, ESP online/offline) | StatusBar, HealthTab |
| **Quality** | Sensor-Datenqualitaet (excellent → unknown, 9 Stufen) | QualityIndicator, MonitorView |
| ~~**Alarm**~~ | **DEPRECATED** — wird durch "Alert" ersetzt | Nirgends mehr |

---

## Reihenfolge und Abhaengigkeiten

```
Arbeitspaket A (5-6h) — Unified Health + Alert System
  A1: Grafana Provisioning (30min)
  A2: Backend Webhook + Cache + WS (2h)
  A3: Backend system_health WS (1h)
  A4: Frontend Store (1.5h)
  A5: Frontend StatusBar (1h)
  A6: Frontend AlertSlideOver (1h)
    │
    ├──→ Arbeitspaket B (2-3h) — Quality-Konsolidierung
    │      B1: AlarmListWidget erweitern (1.5h)
    │      B2: Sensor-Karten Alert-Status (1h)
    │      B3: Stale-Konsistenz (0.5h)
    │
    └──→ Arbeitspaket C (3-4h) — Debug-Integration
           C1: Debug-Tab in SystemMonitorView (2h)
           C2: Loki-Proxy Endpoint (1h)
           C3: server_log WS (optional, 1h)
```

**Gesamt: ~10-14h** (je nach Tiefe von C3 und cAdvisor-Integration)

---

## Abgrenzung: Was dieser Auftrag NICHT macht

- Keine Grafana-Dashboards im Frontend per iframe
- Keine PromQL/LogQL-Queries im Frontend
- Kein Ersetzen von Grafana — Grafana bleibt analytisches Werkzeug
- Keine Alert-Konfiguration im Frontend (Schwellwerte = Grafana)
- Keine neuen Grafana-Alerts — die 38 bestehenden reichen
- Keine ECharts-Migration (separater Auftrag, spaeter)
- Kein Dashboard-Persistenz-Backend (separater Auftrag, Phase 3)
- Kein Mobile-Responsive (separater Auftrag)

---

## IST-Zustand Frontend — Implementierungskontext (verifiziert 2026-02-25)

> Dieser Abschnitt dokumentiert den AKTUELLEN Code-Stand der relevanten Komponenten.
> Der implementierende Agent soll diese Fakten nutzen, nicht eigene Annahmen treffen.

### Aktuelle WS-Event-Architektur

```
WebSocket (26 Events) → esp.store.ts (1671 Zeilen, ZENTRALER Dispatcher) [Korrektur: 1671]
    ├─→ sensor.store.ts (sensor_data, sensor_health)
    ├─→ actuator.store.ts (10 Handler)
    ├─→ notification.store.ts (error_event, notification, system_event → useToast())
    ├─→ config.store.ts (3 Handler)
    ├─→ zone.store.ts (2 Handler)
    ├─→ logic.store.ts (logic_execution)
    └─→ gpio.store.ts (via esp_health)

NEU: system_health + alert_update → useSystemHealthStore (analog)
```

### Aktuelle Health-Datenquellen (REDUNDANT — das ist das Problem)

| Komponente | Datenquelle | WS-reaktiv? | REST-Call? |
|-----------|-------------|-------------|-----------|
| HealthTab | `GET /health/esp` (healthApi.getFleetHealth) | **NEIN** (manueller Refresh) | Ja, bei onMounted |
| HealthSummaryBar | Props von SystemMonitorView | **NEIN** (props-driven) | Indirekt |
| ESPHealthWidget | esp.store → esp_health WS | **JA** | Nein |
| AlarmListWidget | esp.store → sensor quality WS | **JA** | Nein |

**Nach Konsolidierung:** Alle 4 lesen aus `useSystemHealthStore` → 0 eigene REST-Calls, alle WS-reaktiv.

### Bestehendes Toast-System (NICHT aendern)

- `ToastContainer.vue` — Stacking (max 20), Auto-Dismiss (5s normal, 8s error), Dedup (2s Window)
- `useToast()` Composable — von notification.store.ts genutzt fuer error_event, notification, system_event
- `aria-live` Regions vorhanden
- **Grafana-Alerts nutzen dieses BESTEHENDE Toast-System** — kein neues AlertNotification.vue

### Bestehende Design-Tokens fuer Status (NUTZEN, nicht neu definieren)

```css
/* tokens.css — bereits vorhanden, PFLICHT fuer alle neuen Komponenten */
--color-status-good:     #22c55e;   /* gruen */
--color-status-warning:  #eab308;   /* gelb */
--color-status-alarm:    #ef4444;   /* rot */
--color-status-offline:  #6b7280;   /* grau */

/* Auch vorhanden: */
--color-success: #34d399;
--color-warning: #fbbf24;
--color-error:   #f87171;
--color-info:    #60a5fa;

/* Glassmorphism (fuer SlideOver): */
--glass-bg, --glass-border  /* bereits konsistent genutzt */
```

### Bestehende UI-Primitives (NUTZEN, nicht neu bauen)

| Primitive | Varianten | Relevanz |
|-----------|----------|----------|
| `BaseCard` | success, warning, danger, info, glass | Fuer Alert-Items im SlideOver |
| `BaseButton` | primary, ghost, danger + sm/md/lg | Fuer Filter-Buttons, Actions |
| `BaseModal` | konfigurierbare Breite | NICHT fuer AlertSlideOver (SlideOver ≠ Modal) |
| `BaseBadge` | success, warning, danger + pulse/dot | Fuer Alert-Counter, Status-Dots |
| `QualityIndicator` | 4 States: good/warning/alarm/offline | Fuer Sensor-Status in AlertSlideOver |

---

## Voraussetzungen

| Voraussetzung | Status |
|---------------|--------|
| Hardware-Testlauf erfolgreich | OFFEN |
| 38/38 Grafana-Alerts fehlerfrei | ERLEDIGT (2026-02-25) |
| Correlation-IDs End-to-End | ERLEDIGT (2026-02-25) |
| Loki Debug-Flow (Block A-F) | ERLEDIGT |
| CI/CD 8/8 gruen | ERLEDIGT |
| Frontend Phase 1+2+3 (Widgets) gemergt | ERLEDIGT (PR #15) |

---

## End-to-End-Verifikation

Nach Abschluss aller 3 Arbeitspakete:

- [ ] **5-Sekunden-Regel:** Seite laden → StatusBar zeigt innerhalb 5s ob alles OK
- [ ] **Alert-Flow:** Grafana-Alert manuell feuern → Toast erscheint <3s → Badge-Zaehler steigt → SlideOver zeigt Alert → Deep-Link fuehrt zu Grafana
- [ ] **Resolve-Flow:** Alert resolved → Badge-Zaehler sinkt → Alert wandert in "Aufgeloest"
- [ ] **Health-Update:** `docker compose stop mqtt-broker` → StatusBar MQTT-Dot wird rot → ESP-Fleet-Count aendert sich
- [ ] **Sensor-Alert:** ao-sensor-stale feuert → Sensor-Karte in MonitorView zeigt roten Rahmen
- [ ] **Debug:** SystemMonitorView → Debug-Tab → Log-Zeilen sichtbar, Alert-Historie vollstaendig
- [ ] **Performance:** Alle Systeme gleichzeitig aktiv, kein UI-Freeze, keine unnoetige Re-Renders
- [ ] **Kein Legacy:** Keine "Alarme" im UI, kein separater AlertStore, keine doppelten Toast-Systeme

---

## Referenzen

### Wissensdateien (Life-Repo)

| Datei | Inhalt |
|-------|--------|
| `wissen/iot-automation/grafana-alerting-webhook-provisioning.md` | Grafana Provisioning YAML, Webhook-Payload, Fallstricke |
| `wissen/iot-automation/vue3-pinia-health-aggregation-store-pattern.md` | Store-Pattern, Race-Condition-Loesung, Anti-Patterns |
| `wissen/iot-automation/unified-alert-center-ux-best-practices.md` | 5 Plattformen, ISA-18.2, Progressive Disclosure, 31 Quellen |
| `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | 5-Sekunden-Regel, Progressive Disclosure, Farb-Kodierung |
| `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` | 12 KI-Antipatterns, SPOG, 3-Klick-Regel, Vue 3 Checkliste |
| `wissen/iot-automation/alarm-fatigue-empirische-benchmarks-monitoring.md` | 80-99% Fehlalarme, 4-Stufen-Hierarchie, Alarm-freies Monitoring |
| `wissen/iot-automation/dashboard-cognitive-load-overview-detail-pattern.md` | Shneiderman-Mantra, Text+Icon>Icon, Klick-Benchmarks |
| `arbeitsbereiche/automation-one/STATUS.md` | Aktueller Projektstand |
| `arbeitsbereiche/automation-one/Dashboard_analyse.md` | Vollstaendiges Frontend-Inventar (16 Views, 97 Komponenten, 14 Stores) |
| `arbeitsbereiche/automation-one/auftrag-frontend-ux-konsolidierung.md` | UX-Konsolidierung Phase 1-3 |

### Wissenschaftliche Referenzen (Forschung 2026-02-25)

| Paper | Relevanz fuer diesen Auftrag |
|-------|------------------------------|
| Drew et al. (2014), PLoS ONE, 390 cit. | 80-99% Alarme sind Fehlalarme — validiert unsere Actionable-Rate-Anforderung |
| Baudisch et al. (2002), CHI, 275 cit. | Focus+Context > reines Zooming — StatusBar MUSS bei Drill-Down sichtbar bleiben |
| Ahmed et al. (2013), IEEE T-ASE, 118 cit. | >30% gleichzeitige Alarme = Infrastruktur-Problem → Alarm-Flood-Gruppierung |
| Bancilhon et al. (2023), CHI, 17 cit. | Text + Visualisierung zusammen reduziert kognitive Last → alle Status-Dots brauchen Text |
| Karnik & Bonafide (2015), Hosp. Ped., 33 cit. | 4-Stufen-Hierarchie: Eliminieren → Zusammenfassen → Priorisieren → Personalisieren |
| Leenen et al. (2022), PLoS ONE, 24 cit. | Alarm-freies Monitoring machbar wenn Trend-Visualisierung gut genug ist |
| Khawaja et al. (2014), IJHCI, 69 cit. | Messmethoden fuer kognitive Last (NASA-TLX, Reaktionszeit, Fehlerrate) |

### Backend-Dateien (auto-one Repo)

| Pfad | Relevanz |
|------|---------|
| `El Servador/god_kaiser_server/src/api/v1/__init__.py` | Router-Registry (67 Zeilen) |
| `El Servador/god_kaiser_server/src/api/v1/health.py` | Bestehende Health-Endpoints (410 Zeilen) |
| `El Servador/god_kaiser_server/src/api/v1/logs.py` | Pattern fuer Endpoint ohne Auth (140 Zeilen) |
| `El Servador/god_kaiser_server/src/api/v1/debug.py` | Debug-Router (Mock-ESP + DB-Explorer); Loki-Proxy ist NEU [Korrektur] |
| `El Servador/god_kaiser_server/src/websocket/manager.py` | WS-Broadcast (388 Zeilen) |
| `El Servador/god_kaiser_server/src/core/metrics.py` | Scheduler-Job `update_all_metrics_async()` fuer system_health (498 Zeilen) [Korrektur: Funktionsname] |
| `docker/grafana/provisioning/alerting/` | Provisioning-Verzeichnis |

### Frontend-Dateien (auto-one Repo)

| Pfad | Relevanz |
|------|---------|
| `El Frontend/src/shared/stores/` | Store-Verzeichnis — hier kommt system-health.store.ts |
| `El Frontend/src/stores/esp.ts` | WS-Dispatcher (1671 Zeilen) — leitet neue Events weiter [Korrektur: 1671] |
| `El Frontend/src/shared/stores/notification.store.ts` | Bleibt unveraendert |
| `El Frontend/src/components/system-monitor/HealthSummaryBar.vue` | Wird zu SystemStatusBar |
| `El Frontend/src/views/SystemMonitorView.vue` | Bekommt Debug-Tab [Korrektur: views/, nicht components/system-monitor/] |
| `El Frontend/src/components/dashboard-widgets/AlarmListWidget.vue` | Wird erweitert (Grafana-Alerts) |
| `El Frontend/src/types/websocket-events.ts` | 2 neue Event-Typen |
