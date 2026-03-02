# STEP 3: Prerequisites-Bestandsaufnahme

> **Datum:** 2026-03-02
> **Typ:** Analyse (Read-Only, keine Code-Aenderungen)
> **Scope:** P1–P4 IST-Zustand Dokumentation vor Phase 4A Implementierung

---

## Zusammenfassung

| Prerequisite | Status | Aufwand (geschaetzt) | Kritische Befunde |
|---|---|---|---|
| **P1** Backend-Tests Gap | **0 von ~65 Tests vorhanden** | 3–4 Tage | Kein einziger Phase 4A Test existiert. Infrastruktur ist reif. `notification` Model fehlt im Root-conftest Import |
| **P2** Frontend IST/SOLL | **11/11 Komponenten implementiert** | 1–2 Tage (Tests) | Alle Komponenten vorhanden + integriert. 0 Frontend-Tests fuer Phase 4A |
| **P3** WS Auth-Hardening | **Robust implementiert** | 0.5 Tage | JWT-Handshake, Blacklist, Reconnect mit Token-Refresh. Luecke: Keine Mid-Connection Token-Revalidierung |
| **P4** Alert-Quality Monitoring | **38 Regeln, 0 Notification-Metrics** | 1–2 Tage | Contact-Points korrekt. Keine Prometheus-Metriken fuer Notification-Pipeline |

**Gesamt-Aufwand:** ~6–8.5 Tage

---

## Teil P1: Phase 4A Backend-Tests Gap-Analyse

### 1.1 Test-Infrastruktur (IST)

| Aspekt | Status | Details |
|---|---|---|
| Test-Runner | pytest 8.0.0 + pytest-asyncio 0.23.3 | `asyncio_mode = "auto"` in pyproject.toml |
| DB-Backend | SQLite in-memory (StaticPool) | Windows-kompatibel, function-scoped Engine |
| MQTT-Mock | `override_mqtt_publisher` (autouse) | Verhindert haengende Tests |
| Coverage | pytest-cov 4.1.0 | Konfiguriert aber kein Threshold definiert |
| Timeout | pytest-timeout 2.3.1 | Vorhanden |
| Mocking | pytest-mock 3.12.0 | Standard-Pattern im Projekt |

**Root conftest.py** (`El Servador/god_kaiser_server/tests/conftest.py`):
- Fixtures: `test_engine`, `db_session`, `override_get_db`, `override_mqtt_publisher`, `override_actuator_service`
- Sample-Data: `sample_esp_device`, `sample_user`, `sample_esp_with_zone`, `sample_esp_c3`, `gpio_service`
- **PROBLEM:** Model-Imports (Zeile 38-50) enthalten NICHT das `notification` Model → Tests die NotificationModel benutzen, koennten beim Table-Create fehlschlagen

**Unit conftest.py** (`tests/unit/conftest.py`):
- Ueberschreibt autouse-Fixtures als No-Ops (kein DB/MQTT noetig)

**Integration conftest.py** (`tests/integration/conftest.py`):
- Reset MQTT-Singleton zwischen Tests

### 1.2 Test-Bestand (IST)

| Verzeichnis | Anzahl | Beispiele |
|---|---|---|
| `tests/e2e/` | 9 | test_actuator_alert_e2e.py, test_sensor_data_e2e.py |
| `tests/esp32/` | ~19 | test_esp_registration.py, mocks/ |
| `tests/integration/` | ~45 | test_api_sensors.py, test_mqtt_handler.py |
| `tests/unit/` | ~41 | test_sensor_repo_i2c.py, test_auth_service.py |
| **Gesamt** | **114** | |

### 1.3 Bestehende Test-Patterns

**Integration Test Pattern** (aus `test_api_sensors.py`):
```python
@pytest.fixture
async def test_esp(db_session):
    esp = ESPDevice(device_id="TEST_ESP", ...)
    db_session.add(esp)
    await db_session.flush()
    return esp

@pytest.mark.asyncio
async def test_endpoint(db_session, test_esp):
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        response = await client.get("/api/v1/sensors/...")
        assert response.status_code == 200
```

**E2E Test Pattern** (aus `test_actuator_alert_e2e.py`):
- Benoetigt LAUFENDEN Server + MQTT Broker + PostgreSQL
- Nicht in-memory SQLite

### 1.4 Phase 4A Test-Gap (SOLL vs IST)

**Suchergebnis:** `grep` nach `test_notification|test_email|test_alert_supp|test_webhook|test_digest|test_suppression` fand **0 Phase-4A-spezifische Tests**.

3 tangential verwandte Dateien existieren:
- `test_sensor_data_cleanup.py` (Sensor-Cleanup, nicht Notification)
- `test_actuator_timeout.py` (Actuator-Timeout, nicht Alert-Suppression)
- `test_actuator_alert_e2e.py` (E2E, benoetigt Running Stack)

#### Fehlende Tests nach Modul (Prioritaet: H=High, M=Medium, L=Low)

**NotificationRouter** (`notification_router.py`, 358 Zeilen) — 12 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `route()` — Normaler Flow: Persist + WS-Broadcast + Email | H | Integration |
| 2 | `route()` — Deduplizierung (gleicher Fingerprint) | H | Integration |
| 3 | `route()` — Critical-Severity → sofortige Email | H | Integration |
| 4 | `route()` — Warning (first-of-day) → Email | M | Integration |
| 5 | `route()` — Warning (not first-of-day) → Digest | M | Integration |
| 6 | `route()` — Info-Severity → keine Email | M | Integration |
| 7 | `_is_quiet_hours()` — Innerhalb Quiet Hours | M | Unit |
| 8 | `_is_quiet_hours()` — Overnight Range (22:00-06:00) | M | Unit |
| 9 | `_broadcast_websocket()` — WS-Fehler non-blocking | L | Unit |
| 10 | `persist_suppressed()` — Audit-Trail korrekt | H | Integration |
| 11 | `broadcast_notification_updated()` — WS Event korrekt | L | Unit |
| 12 | `broadcast_unread_count()` — WS Event korrekt | L | Unit |

**EmailService** (`email_service.py`, 362 Zeilen) — 8 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `send_email()` — Resend-Provider Erfolg | H | Unit (Mock) |
| 2 | `send_email()` — Resend-Fehler → SMTP-Fallback | H | Unit (Mock) |
| 3 | `send_email()` — Beide Provider Fehler → returns False (kein Raise) | H | Unit (Mock) |
| 4 | `send_critical_alert()` — Template-Rendering | M | Unit |
| 5 | `send_digest()` — Batch-Template korrekt | M | Unit |
| 6 | `send_test_email()` — Test-Template | L | Unit |
| 7 | Singleton `get_email_service()` — Immer gleiche Instanz | L | Unit |
| 8 | Jinja2-Template-Loading korrekt | M | Unit |

**AlertSuppressionService** (`alert_suppression_service.py`, 221 Zeilen) — 6 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `is_sensor_suppressed()` — Sensor suppressed (alerts_enabled=False) | H | Unit |
| 2 | `is_sensor_suppressed()` — suppression_until abgelaufen → not suppressed | H | Unit |
| 3 | `is_sensor_suppressed()` — Device-Level Propagation | H | Integration |
| 4 | `is_actuator_suppressed()` — Analog zu Sensor | M | Unit |
| 5 | `get_effective_thresholds()` — Custom > Global Fallback | M | Unit |
| 6 | `check_thresholds()` — Critical > Warning Prioritaet | M | Unit |

**AlertSuppressionScheduler** (`alert_suppression_scheduler.py`, 220 Zeilen) — 3 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `check_suppression_expiry()` — Re-enables expired | H | Integration |
| 2 | `check_suppression_expiry()` — Nicht-expired bleibt suppressed | M | Integration |
| 3 | `check_maintenance_overdue()` — Erzeugt Notification bei ueberfaelliger Wartung | M | Integration |

**Webhooks API** (`webhooks.py`, 234 Zeilen) — 5 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `POST /webhooks/grafana-alerts` — Gueltige Payload | H | Integration |
| 2 | Grafana Severity-Mapping (resolved→info, critical, warning) | M | Unit |
| 3 | `categorize_alert()` — Keyword→Category Mapping | M | Unit |
| 4 | Fingerprint-Deduplizierung | H | Integration |
| 5 | Ungueltige Payload → 422 | M | Integration |

**Notifications API** (`notifications.py`, 354 Zeilen) — 10 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `GET /notifications` — Paginierte Liste | H | Integration |
| 2 | `GET /notifications` — Filter nach severity/category | M | Integration |
| 3 | `GET /notifications/unread-count` | H | Integration |
| 4 | `GET /notifications/preferences` | M | Integration |
| 5 | `GET /notifications/{id}` — Existiert | M | Integration |
| 6 | `GET /notifications/{id}` — 404 | L | Integration |
| 7 | `PATCH /notifications/{id}/read` | H | Integration |
| 8 | `PATCH /notifications/read-all` | M | Integration |
| 9 | `POST /notifications/send` — Admin-Only | H | Integration |
| 10 | `PUT /notifications/preferences` — Update + Validierung | M | Integration |

**Alert-Config Endpoints** (in `sensors.py`, `actuators.py`, `esp.py`) — 5 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `PUT /sensors/{id}/alert-config` — Setzt alert_config JSON | H | Integration |
| 2 | `PUT /actuators/{id}/alert-config` | M | Integration |
| 3 | `PUT /esp/{id}/alert-config` — Device-Level mit propagate_to_children | H | Integration |
| 4 | Alert-Config Validierung (suppression_reason Enum) | M | Integration |
| 5 | Suppression mit suppression_until → Scheduler re-enabled | H | E2E |

**Runtime-Stats** (in Model-Erweiterungen) — 4 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `sensor_metadata.last_maintenance` wird korrekt gespeichert | M | Integration |
| 2 | `sensor_metadata.maintenance_interval_days` → Scheduler erkennt | M | Integration |
| 3 | `runtime_stats` JSON-Feld Struktur | L | Unit |
| 4 | Migration-Test (Schema vorhanden) | M | Integration |

**Threshold→Notification Pipeline** (`sensor_handler.py`) — 5 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | Threshold-Ueberschreitung → `router.route()` aufgerufen | H | Integration |
| 2 | Suppressed Sensor → `router.persist_suppressed()` statt `route()` | H | Integration |
| 3 | Severity-Override aus alert_config | M | Integration |
| 4 | Kein Threshold konfiguriert → keine Notification | M | Integration |
| 5 | Critical vs Warning Schwellwert-Unterscheidung | M | Integration |

**DigestService** (`digest_service.py`, 156 Zeilen) — 5 Tests:

| # | Test-Szenario | Prio | Typ |
|---|---|---|---|
| 1 | `process_digests()` — Sammelt pending Notifications | H | Integration |
| 2 | `process_digests()` — Leerer Batch → keine Email | M | Unit |
| 3 | `process_digests()` — Nur User mit email_enabled | M | Integration |
| 4 | `process_digests()` — resilient_session Circuit Breaker | L | Integration |
| 5 | Singleton `get_digest_service()` | L | Unit |

### 1.5 Test-Gap Zusammenfassung

| Modul | Tests IST | Tests SOLL | Prioritaet |
|---|---|---|---|
| NotificationRouter | 0 | 12 | **CRITICAL** |
| EmailService | 0 | 8 | HIGH |
| AlertSuppressionService | 0 | 6 | HIGH |
| AlertSuppressionScheduler | 0 | 3 | MEDIUM |
| Webhooks API | 0 | 5 | HIGH |
| Notifications API | 0 | 10 | **CRITICAL** |
| Alert-Config Endpoints | 0 | 5 | HIGH |
| Runtime-Stats | 0 | 4 | MEDIUM |
| Threshold→Notification Pipeline | 0 | 5 | HIGH |
| DigestService | 0 | 5 | MEDIUM |
| **Gesamt** | **0** | **~63** | |

### 1.6 Blocker / Voraussetzungen

1. **`notification` Model Import fehlt im Root conftest.py** — Muss hinzugefuegt werden damit `Base.metadata.create_all()` die Notification-Tabelle anlegt
2. **Email-Templates** — 3 Jinja2-Templates existieren (`alert_critical.html`, `alert_digest.html`, `test.html`), Template-Pfad muss in Tests konfiguriert sein
3. **WS-Manager Mock** — Fuer NotificationRouter-Tests muss WebSocketManager gemockt werden
4. **CentralScheduler Mock** — Fuer Scheduler-Tests muss `JobCategory` importierbar sein

---

## Teil P2: Frontend Phase 4A IST/SOLL-Vergleich

### 2.1 Komponenten-Inventar

| Komponente | Datei | Zeilen | Status | Integriert in |
|---|---|---|---|---|
| NotificationBadge | `components/notifications/NotificationBadge.vue` | 126 | Vollstaendig | TopBar.vue (Zeile 288) |
| NotificationDrawer | `components/notifications/NotificationDrawer.vue` | 331 | Vollstaendig | App.vue (Zeile 46) |
| NotificationItem | `components/notifications/NotificationItem.vue` | 344 | Vollstaendig | NotificationDrawer (child) |
| NotificationPreferences | `components/notifications/NotificationPreferences.vue` | 549 | Vollstaendig | NotificationDrawer (child) |
| QuickActionBall | `components/quick-action/QuickActionBall.vue` | 309 | Vollstaendig | AppShell.vue (Zeile 100) |
| QuickAlertPanel | `components/quick-action/QuickAlertPanel.vue` | 551 | Vollstaendig | QuickActionBall (child) |

| Store / Composable / API | Datei | Zeilen | Status |
|---|---|---|---|
| notification-inbox.store | `shared/stores/notification-inbox.store.ts` | 386 | Vollstaendig |
| quickAction.store | `shared/stores/quickAction.store.ts` | 158 | Vollstaendig |
| useQuickActions | `composables/useQuickActions.ts` | 262 | Vollstaendig (einige Placeholder-Handler) |
| notifications API | `api/notifications.ts` | 228 | Vollstaendig |

### 2.2 Feature-Vollstaendigkeit

**NotificationBadge:**
- Bell-Icon mit Unread-Counter ✅
- Severity-basierte Farben (critical=rot, warning=gelb, info=blau) ✅
- Pulse-Animation bei Critical ✅
- Click → toggleDrawer() ✅

**NotificationDrawer:**
- SlideOver-Basis (560px, ESC/Click-Outside close) ✅
- Filter-Tabs: Alle / Kritisch / Warnungen / System ✅
- Gruppierung: Heute / Gestern / Aelter ✅
- Lazy Loading: 50 initial, "Mehr laden" Button ✅
- "Alle gelesen" Button ✅
- Settings-Zahnrad → Preferences ✅

**NotificationItem:**
- Severity-Dot (links) ✅
- Title (bold bei unread) + Body (1-Zeile truncated) ✅
- Relative Time (rechts) ✅
- Expandable Details (Quelle, ESP, Zone) ✅
- Deep-Links: Zum Sensor, Zur Regel, In Grafana ✅
- "Als gelesen" Action ✅

**NotificationPreferences:**
- Email-Toggle ✅
- Severity-Checkboxen (critical, warning, info) ✅
- Quiet Hours (von/bis) ✅
- Digest-Intervall ✅
- Browser-Notifications ✅
- Test-Email Button ✅
- Save/Cancel ✅

**QuickActionBall:**
- FAB unten-rechts, Glassmorphism ✅
- Alert-Badge-Dot ✅
- Sub-Panel Routing (menu/alerts/navigation) ✅
- Click-Away + ESC ✅

**QuickAlertPanel:**
- Top-5 unread Alerts ✅
- Ack / Navigate / Expand / Mute Actions ✅
- Mute → `sensorsApi.updateAlertConfig()` ✅
- Footer → NotificationDrawer Link ✅

### 2.3 Store/WS Integration

**notification-inbox.store.ts:**
- WS-Dispatcher in `esp.ts` (Zeile 1343-1357) delegiert korrekt:
  - `notification_new` → `handleWSNotificationNew()`
  - `notification_updated` → `handleWSNotificationUpdated()`
  - `notification_unread_count` → `handleWSUnreadCount()`
- Browser-Notification bei Critical Alerts ✅
- Computed: `filteredNotifications`, `groupedNotifications`, `badgeText` ✅

**quickAction.store.ts:**
- `alertSummary` computed: liest aus notification-inbox store ✅
- `hasActiveAlerts`, `isCritical`, `isWarning` computed ✅

### 2.4 Design-System Nutzung

| Aspekt | Verwendet | Korrekt |
|---|---|---|
| CSS Custom Properties | `var(--space-*)`, `var(--color-*)`, `var(--text-*)` | ✅ Konsistent |
| Glass-System | `var(--glass-border)`, `rgba(255,255,255,0.0x)` | ✅ |
| lucide-vue-next Icons | Check, ChevronDown, Settings, Bell, etc. | ✅ Keine fremden Icon-Pakete |
| Dark-Theme Only | Keine Light-Mode Styles | ✅ |
| Transitions | `var(--transition-fast)` | ✅ |
| Layout-Primitives | SlideOver.vue | ✅ |

### 2.5 Placeholder-Handler (useQuickActions.ts)

Folgende Aktionen in `useQuickActions.ts` haben Placeholder-Logik (console.log statt echte Implementierung):
- Time Range Picker (MonitorView)
- Export Dashboard (MonitorView)
- Widget Picker (MonitorView)

Diese sind **nicht Phase-4A-kritisch**, koennen spaeter nachgezogen werden.

### 2.6 Frontend-Tests

| Verzeichnis | Anzahl | Phase 4A relevant |
|---|---|---|
| `El Frontend/tests/unit/` | 45 | 0 |
| `El Frontend/tests/e2e/` | 24 | 0 |
| **Gesamt** | **69** | **0** |

**Fehlende Tests (empfohlen):**

| Komponente | Typ | Prio | Tests |
|---|---|---|---|
| NotificationBadge | Unit | M | Unread-Count Anzeige, Severity-Klassen, Pulse bei Critical |
| NotificationDrawer | Unit | M | Filter-Tabs, Gruppierung, Load-More |
| NotificationItem | Unit | M | Expand/Collapse, Deep-Links, Mark-Read |
| NotificationPreferences | Unit | L | Form-Validierung, Save/Cancel |
| QuickActionBall | Unit | M | Toggle, Panel-Routing, Badge-Dot |
| QuickAlertPanel | Unit | M | Alert-Liste, Mute-Action |
| notification-inbox.store | Unit | H | WS-Handler, Filterung, Paginierung |
| quickAction.store | Unit | L | alertSummary Computed |

### 2.7 P2 Fazit

**Alle 11 Frontend-Dateien sind vollstaendig implementiert und in die App integriert.** Es gibt keine fehlenden Komponenten, keine TODO/FIXME-Marker, und alle WS-Events sind korrekt verdrahtet. Der einzige Gap sind fehlende Frontend-Tests (0 von geschaetzt ~30-40 sinnvollen Tests).

---

## Teil P3: WebSocket Auth-Hardening IST-Zustand

### 3.1 Connection-Flow

```
Frontend (websocket.ts)                    Server (realtime.py)
──────────────────────                    ────────────────────
1. getToken() from authStore
2. isTokenExpired()? → refreshTokenIfNeeded()
3. ws://host/ws/realtime?token=<jwt>  ──→  4. verify_token(token, "access")
                                           5. Check: token missing → 4001
                                           6. Check: invalid JWT → 4001
                                           7. Check: blacklisted → 4001
                                           8. Check: user not found → 4001
                                           9. Check: user inactive → 4001
                                          10. ws_manager.connect(websocket, user_id)
                                   ←──── 11. Connection established
12. Subscribe/Unsubscribe JSON msgs ──→  13. Handle subscribe/unsubscribe
```

### 3.2 JWT Lifecycle

| Parameter | Wert | Quelle |
|---|---|---|
| Access Token Laufzeit | 30 Minuten | `config.py: jwt_access_token_expire_minutes` |
| Refresh Token Laufzeit | 7 Tage | `config.py: jwt_refresh_token_expire_days` |
| Algorithmus | HS256 | `config.py` |
| Token-Storage | localStorage | `auth.store.ts` |
| Blacklist | Token-Blacklist Check bei Handshake | `realtime.py` |

### 3.3 Reconnect-Verhalten (Frontend)

| Aspekt | Implementierung | Status |
|---|---|---|
| Exponential Backoff | 1s → 2s → 4s → ... → max 30s | ✅ |
| Jitter | ±10% Randomisierung | ✅ |
| Max Attempts | 10 | ✅ |
| Token Refresh vor Reconnect | `refreshTokenIfNeeded()` | ✅ |
| Visibility API | Reconnect bei Tab-Wechsel + Token-Refresh | ✅ |
| Token-Expiry Check | 60-Sekunden Buffer vor Ablauf | ✅ |
| Rate Limiting | 10 Messages/Sekunde (Client-Side) | ✅ |

### 3.4 Identifizierte Luecken

| Luecke | Schweregrad | Beschreibung |
|---|---|---|
| **Keine Mid-Connection Token-Revalidierung** | MEDIUM | Nach erfolgreicher Handshake-Auth wird der Token waehrend der Verbindung NICHT erneut geprueft. Bei 30min Token-Laufzeit und stabiler Verbindung bleibt eine Session potenziell laenger authentifiziert als der Token gueltig ist |
| Token als Query-Parameter | LOW | JWT wird als `?token=<jwt>` gesendet → in Server-Logs/Access-Logs sichtbar. Alternative: First-Message Auth nach Verbindungsaufbau. Allerdings Standard-Pattern bei WS |

### 3.5 P3 Fazit

**WebSocket Auth ist robust implementiert.** JWT-Validierung am Handshake, Token-Blacklist, Reconnect mit Token-Refresh und Exponential Backoff, Visibility-API Handling — alles vorhanden. Die Mid-Connection Revalidierung ist ein theoretisches Problem (30min Token + stabile Verbindung), aber kein akuter Blocker fuer Phase 4A.

---

## Teil P4: Alert-Quality Monitoring IST-Zustand

### 4.1 Alert-Inventar

**Prometheus Alert Rules** (`docker/grafana/provisioning/alerting/alert-rules.yml`):

| Gruppe | Regeln | Beispiele |
|---|---|---|
| System-Health | ~5 | CPU, Memory, Disk, Uptime |
| ESP-Device | ~6 | Offline, Heartbeat-Miss, Error-Rate |
| Sensor-Data | ~5 | Stale-Data, Out-of-Range, Read-Failures |
| MQTT-Broker | ~4 | Connection-Count, Message-Rate, Queue-Size |
| Database | ~4 | Pool-Exhaustion, Query-Latency, Connection-Errors |
| API-Server | ~4 | Error-Rate, Latency, Request-Count |
| Infrastructure | ~4 | Container-Health, Network, Storage |
| **Subtotal** | **32** | |

**Loki Alert Rules** (`docker/grafana/provisioning/alerting/loki-alert-rules.yml`):

| Gruppe | Regeln | Beispiele |
|---|---|---|
| Log-Pattern Alerts | 6 | Error-Burst, Critical-Keyword, MQTT-Disconnect-Pattern, Auth-Failure-Burst, Unhandled-Exception, Memory-Leak-Pattern |
| **Subtotal** | **6** | |

**Gesamt: 38 Alert-Regeln**

### 4.2 Contact-Points

```yaml
# contact-points.yml
contactPoints:
  - orgId: 1
    name: automationone-webhook
    receivers:
      - uid: ao-webhook-receiver
        type: webhook
        settings:
          url: "http://el-servador:8000/api/v1/webhooks/grafana-alerts"
          httpMethod: POST
          maxAlerts: 10
        disableResolveMessage: false
```

**Status:** ✅ Korrekt konfiguriert
- Docker-interner Hostname `el-servador` ✅
- Port 8000 (Standard FastAPI) ✅
- Endpoint `/api/v1/webhooks/grafana-alerts` existiert im Code ✅
- `maxAlerts: 10` → Batching ✅
- `disableResolveMessage: false` → Resolved-Events werden gesendet ✅

### 4.3 Notification-Policies

```yaml
# notification-policies.yml
policies:
  - orgId: 1
    receiver: automationone-webhook
    group_by: [grafana_folder, alertname]
    group_wait: 30s
    group_interval: 5m
    repeat_interval: 4h
```

**Bewertung:**
- `group_wait: 30s` — Sinnvoll, sammelt erste Alerts einer Gruppe
- `group_interval: 5m` — ISA-18.2 konform (max 6 Alarms/Stunde = min 10min Intervall)
- `repeat_interval: 4h` — Gut, verhindert Alert-Flooding

### 4.4 Notification-spezifische Prometheus Metriken (IST)

**Datei:** `El Servador/god_kaiser_server/src/core/metrics.py`

Vorhandene Metriken (Auszug):
- `ao_uptime_seconds` (Gauge)
- `ao_cpu_percent` (Gauge)
- `ao_mqtt_messages_total` (Counter)
- `ao_sensor_value` (Gauge, per device/sensor)
- `ao_esp_*` (diverse per-device Metriken)

**Notification-spezifische Metriken: 0**

### 4.5 Fehlende Prometheus Metriken (SOLL)

| Metrik | Typ | Labels | Beschreibung | Prio |
|---|---|---|---|---|
| `ao_notifications_total` | Counter | severity, category, source | Gesamt erzeugte Notifications | H |
| `ao_notifications_suppressed_total` | Counter | reason | Durch Suppression unterdrueckte | H |
| `ao_notifications_deduplicated_total` | Counter | — | Durch Fingerprint deduplizierte | M |
| `ao_email_sent_total` | Counter | provider (resend/smtp), status (success/failure) | Versendete Emails | H |
| `ao_email_latency_seconds` | Histogram | provider | Email-Versand-Latenz | M |
| `ao_digest_processed_total` | Counter | — | Verarbeitete Digest-Batches | M |
| `ao_digest_notifications_per_batch` | Histogram | — | Notifications pro Digest | L |
| `ao_ws_notification_broadcast_total` | Counter | event_type | WS-Broadcasts | M |
| `ao_webhook_received_total` | Counter | source (grafana), status | Empfangene Webhooks | H |
| `ao_alert_suppression_active` | Gauge | entity_type (sensor/actuator/device) | Aktuell suppressed Entities | M |
| `ao_alert_suppression_expired_total` | Counter | — | Durch Scheduler re-enabled | L |

### 4.6 Fehlende Grafana Alert-Regeln (SOLL)

| Alert | Bedingung | Prio |
|---|---|---|
| Notification-Rate zu hoch | `rate(ao_notifications_total[5m]) > 10` | H |
| Email-Fehlerrate | `rate(ao_email_sent_total{status="failure"}[15m]) > 0.5` | H |
| Webhook-Empfang gestoppt | `absent(ao_webhook_received_total) for 1h` | M |
| Suppression-Ratio zu hoch | `ao_notifications_suppressed_total / ao_notifications_total > 0.8` | L |
| Digest-Backlog | `ao_digest_processed_total stale for > 2h` | M |

### 4.7 P4 Fazit

**38 Alert-Regeln fuer System/ESP/MQTT/DB sind vorhanden und sinnvoll.** Contact-Points und Notification-Policies korrekt konfiguriert. Die grosse Luecke: **0 Metriken und 0 Alerts fuer die Notification-Pipeline selbst** — d.h. wenn Email-Versand scheitert oder Notifications nicht durchkommen, gibt es keine Warnung.

---

## Priorisierte Empfehlung

### Phase 1: Kritische Voraussetzungen (sofort)

1. **P1: conftest.py erweitern** — `notification` Model Import hinzufuegen (5 Min)
2. **P1: NotificationRouter Tests** (12 Tests) — Kernlogik, hoechstes Risiko
3. **P1: Notifications API Tests** (10 Tests) — Alle 9 Endpoints muessen funktionieren

### Phase 2: High Priority (innerhalb 2 Tage)

4. **P1: EmailService Tests** (8 Tests) — Dual-Provider Logik
5. **P1: AlertSuppression Tests** (6 Tests) — ISA-18.2 Compliance
6. **P1: Webhooks API Tests** (5 Tests) — Grafana-Integration
7. **P1: Threshold→Notification Pipeline Tests** (5 Tests) — End-to-End Kette
8. **P4: Prometheus Metriken implementieren** (11 Metriken) — Observability

### Phase 3: Medium Priority (innerhalb 1 Woche)

9. **P1: Scheduler + DigestService + Alert-Config + Runtime Tests** (17 Tests)
10. **P2: Frontend-Tests** (~30-40 Tests) — Unit-Tests fuer Notification-Komponenten
11. **P4: Grafana Alert-Regeln** (5 neue Alerts) — Notification-Pipeline Monitoring

### Phase 4: Low Priority / Nice-to-Have

12. **P3: Mid-Connection Token-Revalidierung** — Theoretischer Gap, kein akuter Blocker
13. **P2: Placeholder-Handler** in useQuickActions.ts — Nicht Phase-4A-kritisch

---

## Akzeptanzkriterien Check

- [x] P1: Test-Infrastruktur vollstaendig dokumentiert (conftest, patterns, dependencies)
- [x] P1: Phase-4A-Test-Luecken mit Prioritaeten aufgelistet (~63 Tests in 10 Modulen)
- [x] P1: conftest.py Blocker identifiziert (notification Model Import fehlt)
- [x] P2: Alle 11 Frontend-Dateien analysiert (6 Komponenten + 2 Stores + 1 Composable + 1 API + WS Integration)
- [x] P2: Integration in App/TopBar/AppShell verifiziert
- [x] P2: Design-System Konformitaet geprueft (CSS Variables, Glass, Icons, Dark-Only)
- [x] P2: Frontend-Test-Gap dokumentiert (0 von ~30-40 empfohlen)
- [x] P3: WS Connection-Flow dokumentiert (13 Schritte)
- [x] P3: JWT Lifecycle und Reconnect-Verhalten analysiert
- [x] P3: WS Auth Luecken identifiziert (Mid-Connection Revalidierung)
- [x] P4: 38 Alert-Regeln inventarisiert (32 Prometheus + 6 Loki)
- [x] P4: Contact-Points und Notification-Policies verifiziert
- [x] P4: Fehlende Metriken spezifiziert (11 neue Prometheus Metriken)
- [x] P4: Fehlende Alert-Regeln spezifiziert (5 neue Alerts)
- [x] Priorisierte Implementierungs-Empfehlung erstellt
