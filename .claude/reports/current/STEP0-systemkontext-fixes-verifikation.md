# STEP 0 Bericht: Systemkontext-Fixes Verifikation

**Datum:** 2026-03-02
**Typ:** Analyse + Verifikation (kein Code geaendert)
**Geprueft:** 15 FIX-Punkte + 5 PRUEFEN-Punkte

---

## Zusammenfassung

| Status | Anzahl |
|--------|--------|
| GEFIXT | 12 |
| OFFEN  | 3 |
| NICHT ANWENDBAR | 0 |

### Offene Punkte (Handlungsbedarf)

| Punkt | Severity | Problem |
|-------|----------|---------|
| FIX-02 | NIEDRIG | Migration-Kommentar nennt "resolved" als Severity-Wert |
| FIX-11 | INFO | `--color-status-alarm` ist Legacy-Token, wird aber in 23 Dateien verwendet — KEIN sofortiger Fix |
| FIX-15 | NIEDRIG | Mapping-Abweichungen: `safety_violation` → "critical" statt "warning", `runtime_protection` → "maintenance" statt "lifecycle" |

---

## FIX-Ergebnisse

### FIX-01: user_id Typ in notifications Tabelle
**Status:** GEFIXT
**IST-Zustand:**
- [notification.py:85-91](El Servador/god_kaiser_server/src/db/models/notification.py#L85-L91): `user_id: Mapped[int] = mapped_column(Integer, ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False)`
- [user.py:33-37](El Servador/god_kaiser_server/src/db/models/user.py#L33-L37): PK in `user_accounts` ist `id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)`
- [notification.py (Schema):49-52](El Servador/god_kaiser_server/src/schemas/notification.py#L49-L52): `user_id: Optional[int]` in `NotificationCreate`
- [Migration:40-46](El Servador/god_kaiser_server/alembic/versions/add_notifications_and_preferences.py#L40-L46): `sa.Column("user_id", sa.Integer, sa.ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False)`
**Bewertung:** Korrekt. Integer PK, Integer FK, Migration stimmt. Keine Tabelle `users` referenziert.

---

### FIX-02: Severity-Werte
**Status:** OFFEN (NIEDRIG)
**IST-Zustand:**
- [notification.py:308-313](El Servador/god_kaiser_server/src/db/models/notification.py#L308-L313): Enum `NotificationSeverity` hat nur 3 Werte: `CRITICAL`, `WARNING`, `INFO` — korrekt
- [notification.py (Schema):30](El Servador/god_kaiser_server/src/schemas/notification.py#L30): `NOTIFICATION_SEVERITIES = ["critical", "warning", "info"]` — korrekt
- [webhooks.py:107-112](El Servador/god_kaiser_server/src/api/v1/webhooks.py#L107-L112): `if alert.status == "resolved": return "info"` — korrekt, "resolved" wird als Status behandelt und auf Severity "info" gemappt
- **BUG:** [Migration:58](El Servador/god_kaiser_server/alembic/versions/add_notifications_and_preferences.py#L58): Kommentar sagt `"Severity (critical, warning, info, resolved)"` — **"resolved" gehoert NICHT in die Severity-Liste**
**Bewertung:** Code-Logik ist korrekt. Nur der Migration-Kommentar ist irrefuehrend.
**Fix-Vorschlag:**
```python
# Zeile 58 in add_notifications_and_preferences.py aendern:
# ALT: comment="Severity (critical, warning, info, resolved)",
# NEU: comment="Severity (critical, warning, info)",
```

---

### FIX-03: Category und Source trennen
**Status:** GEFIXT
**IST-Zustand:**
- [notification.py:331-340](El Servador/god_kaiser_server/src/db/models/notification.py#L331-L340): `NotificationCategory` (7 Werte) und `NotificationSource` (8 Werte) als SEPARATE Klassen
- [notification.py (Schema):35-38](El Servador/god_kaiser_server/src/schemas/notification.py#L35-L38): `NOTIFICATION_CATEGORIES` = `["connectivity", "data_quality", "infrastructure", "lifecycle", "maintenance", "security", "system"]`
- [notification.py (Schema):31-34](El Servador/god_kaiser_server/src/schemas/notification.py#L31-L34): `NOTIFICATION_SOURCES` = `["grafana", "logic_engine", "mqtt_handler", "sensor_threshold", "device_event", "manual", "autoops", "system"]`
- [webhooks.py:95-101](El Servador/god_kaiser_server/src/api/v1/webhooks.py#L95-L101): `categorize_alert()` setzt `category` korrekt
- [notification_router.py:108-117](El Servador/god_kaiser_server/src/services/notification_router.py#L108-L117): `source` und `category` separat weitergereicht
**Bewertung:** Korrekt. Beide Dimensionen sind vollstaendig getrennt in Model, Schema, Konstanten und Setter-Logik.

---

### FIX-04: TimestampMixin bei Notification Model
**Status:** GEFIXT
**IST-Zustand:**
- [base.py:22-46](El Servador/god_kaiser_server/src/db/models/base.py#L22-L46): `TimestampMixin` definiert `created_at` und `updated_at`
- [notification.py:24](El Servador/god_kaiser_server/src/db/models/notification.py#L24): `class Notification(Base, TimestampMixin):` — erbt korrekt
- `created_at` / `updated_at` werden NICHT nochmal manuell definiert — kein Duplikat
- [notification.py:180-184](El Servador/god_kaiser_server/src/db/models/notification.py#L180-L184): `read_at` existiert als separates Feld
**Bewertung:** Korrekt. Keine doppelten Spalten. `read_at` ist eigenstaendig.

---

### FIX-05: email_enabled vs smtp_enabled
**Status:** GEFIXT
**IST-Zustand:**
- [config.py:268-272](El Servador/god_kaiser_server/src/core/config.py#L268-L272): `email_enabled` = Master-Switch fuer ALLE Email-Provider
- [config.py:252-256](El Servador/god_kaiser_server/src/core/config.py#L252-L256): `smtp_enabled` = SMTP-spezifischer Provider-Switch
- [email_service.py:104-109](El Servador/god_kaiser_server/src/services/email_service.py#L104-L109): `is_available` Property: `email_enabled AND (resend_available OR smtp_enabled)`
- [email_service.py:145-147](El Servador/god_kaiser_server/src/services/email_service.py#L145-L147): `send_email()` prueft `email_enabled` als erstes Gate
- [notification_router.py:134-135](El Servador/god_kaiser_server/src/services/notification_router.py#L134-L135): `if prefs.email_enabled and self.email_service.is_available:`
**Bewertung:** Korrekt. 2-Level-Kontrolle:
```
email_enabled=false          → Kein Email
email_enabled=true + resend  → Resend
email_enabled=true + smtp    → SMTP Fallback
```

---

### FIX-06: WS-Event-Naming Konvention
**Status:** GEFIXT
**IST-Zustand:**
- [notification_router.py:182](El Servador/god_kaiser_server/src/services/notification_router.py#L182): `await ws_manager.broadcast("notification_new", data)` — Underscore
- [notification_router.py:336](El Servador/god_kaiser_server/src/services/notification_router.py#L336): `await ws_manager.broadcast("notification_updated", data)` — Underscore
- [notification_router.py:349](El Servador/god_kaiser_server/src/services/notification_router.py#L349): `await ws_manager.broadcast("notification_unread_count", ...)` — Underscore
- [sensor_handler.py:418-419](El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py#L418-L419): `await ws_manager.broadcast("sensor_data", ...)` — Underscore
- Grep nach `"notification:"` (mit Doppelpunkt) in Server + Frontend: **0 Treffer**
**Bewertung:** Korrekt. Alle WS-Events verwenden konsistent Underscore-Konvention.

---

### FIX-07: Fingerprint-Feld in notifications Tabelle
**Status:** GEFIXT
**IST-Zustand:**
- [notification.py:172-177](El Servador/god_kaiser_server/src/db/models/notification.py#L172-L177): `fingerprint: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)` — eigene Spalte
- [notification.py:67-73](El Servador/god_kaiser_server/src/db/models/notification.py#L67-L73): Partial Unique Index `ix_notifications_fingerprint_unique` mit `postgresql_where=text("fingerprint IS NOT NULL")`
- [add_notification_fingerprint.py](El Servador/god_kaiser_server/alembic/versions/add_notification_fingerprint.py): Eigene Alembic-Migration fuer Fingerprint-Spalte + Index
- [notification_repo.py:227-235](El Servador/god_kaiser_server/src/db/repositories/notification_repo.py#L227-L235): `async def check_fingerprint_duplicate(fingerprint: str) -> bool`
- [webhooks.py:210-211](El Servador/god_kaiser_server/src/api/v1/webhooks.py#L210-L211): `fingerprint=alert.fingerprint` in NotificationCreate
- [notification_router.py:81-90](El Servador/god_kaiser_server/src/services/notification_router.py#L81-L90): Fingerprint-Check vor Titel-Dedup
**Bewertung:** Korrekt. Vollstaendige Implementierung: Spalte + Partial Unique Index + Dedup-Check + Webhook-Integration.

---

### FIX-08: Legacy WS-Event "notification" Migration
**Status:** GEFIXT
**IST-Zustand:**
- Server broadcastet **NICHT** mehr `"notification"` (ohne Suffix) — 0 Treffer bei Grep
- Neue Events: `notification_new`, `notification_updated`, `notification_unread_count`
- [esp.ts:1555](El Frontend/src/stores/esp.ts#L1555): `ws.on('notification', handleNotification)` — Legacy-Listener bleibt fuer Abwaertskompatibilitaet
- [esp.ts:1323-1325](El Frontend/src/stores/esp.ts#L1323-L1325): `handleNotification` delegiert an `notification.store` → Toast
- Notification-Executor (`notification_executor.py`) routet ueber `NotificationRouter`, nicht direkter WS-Broadcast
**Bewertung:** Korrekt. Legacy-Listener bleibt defensiv aktiv, aber Server sendet diesen Event nicht mehr.

---

### FIX-09: Keine doppelten WS-Events
**Status:** GEFIXT
**IST-Zustand:**
- Grep nach `"alert_update"` in Server (.py): **0 Treffer**
- Grep nach `"alert_update"` in Frontend (.ts/.vue): **0 Treffer**
- `actuator_alert` existiert als separates Event fuer das Echtzeit-Dashboard (SystemMonitorView, actuator.store.ts) — das ist KEIN Duplikat von `notification_new`, sondern ein anderer Use-Case (Dashboard-Visualisierung vs. Inbox-Persistierung)
**Bewertung:** Korrekt. Kein `alert_update` Event. `actuator_alert` und `notification_new` sind bewusst getrennte Events mit unterschiedlichem Zweck.

---

### FIX-10: Store-Architektur
**Status:** GEFIXT
**IST-Zustand:**
- [notification-inbox.store.ts](El Frontend/src/shared/stores/notification-inbox.store.ts): Existiert als Setup-Store (`defineStore('notification-inbox', ...)`)
  - State: `notifications`, `unreadCount`, `highestSeverity`
  - Actions: `loadInitial()`, `loadMore()`, `markAsRead()`, `markAllAsRead()`
  - WS-Handler: `handleWSNotificationNew()`, `handleWSNotificationUpdated()`, `handleWSUnreadCount()`
  - Badge: `badgeText` computed (z.B. "5", "99+")
- [notification.store.ts](El Frontend/src/shared/stores/notification.store.ts): Legacy-Store fuer Toasts — bleibt bestehen
- `system-health.store.ts` / `useSystemHealthStore`: **NICHT VORHANDEN** — korrekt, kommt erst Phase 4B
- `unreadCount` kommt aus EINEM Store (`notification-inbox.store`), initial via REST, dann WS-Updates
**Bewertung:** Korrekt. Ein Inbox-Store, ein Legacy-Toast-Store, kein `SystemHealthStore`.

---

### FIX-11: Farb-Token-Naming
**Status:** OFFEN (INFO — kein Blocker)
**IST-Zustand:**
- [tokens.css:65-68](El Frontend/src/styles/tokens.css#L65-L68): Standard-Tokens existieren: `--color-success`, `--color-warning`, `--color-error`, `--color-info`
- [tokens.css:209-212](El Frontend/src/styles/tokens.css#L209-L212): Legacy-Tokens existieren ebenfalls: `--color-status-good`, `--color-status-warning`, `--color-status-alarm`, `--color-status-offline`
- `--color-status-alarm` wird in **23 Stellen** verwendet (ActuatorConfigPanel, ESPConfigPanel, SensorConfigPanel, SensorSatellite, HistoricalChart, QualityIndicator, RangeSlider, CustomDashboardView, SensorCardWidget, cssTokens.ts)
- **Neue Notification-Komponenten verwenden KORREKT die Standard-Tokens:**
  - [NotificationItem.vue:195](El Frontend/src/components/notifications/NotificationItem.vue#L195): `var(--color-error)` fuer critical
  - [NotificationItem.vue:200](El Frontend/src/components/notifications/NotificationItem.vue#L200): `var(--color-warning)` fuer warning
  - [NotificationItem.vue:204](El Frontend/src/components/notifications/NotificationItem.vue#L204): `var(--color-info)` fuer info
  - [NotificationBadge.vue:95-108](El Frontend/src/components/notifications/NotificationBadge.vue#L95-L108): Korrekt mit `--color-error` und `--color-warning`
**Bewertung:** Die neuen Notification-Komponenten sind korrekt. Die Legacy-Tokens (`--color-status-*`) sind in 23 bestehenden Komponenten verankert und dienen einem anderen Zweck (Sensor-Status-Indikatoren). Eine Migration waere ein separates Refactoring, KEIN Blocker fuer Phase 4A.

---

### FIX-12: Nur EIN Drawer
**Status:** GEFIXT
**IST-Zustand:**
- [NotificationDrawer.vue](El Frontend/src/components/notifications/NotificationDrawer.vue): Existiert, verwendet `SlideOver.vue` als Wrapper
- `AlertSlideOver.vue`: **NICHT VORHANDEN** — korrekt
- [SlideOver.vue](El Frontend/src/shared/design/primitives/SlideOver.vue): Generische Primitive (kein Notification-spezifischer Code)
**Bewertung:** Korrekt. Ein Drawer, saubere Architektur:
```
SlideOver.vue (Primitive) → NotificationDrawer.vue (spezialisiert) → NotificationItem.vue
```

---

### FIX-13: Event-Routing-Logik Frontend
**Status:** GEFIXT
**IST-Zustand:**
- [esp.ts:1555](El Frontend/src/stores/esp.ts#L1555): `ws.on('notification', handleNotification)` → `notification.store` → Toast
- [esp.ts:1559](El Frontend/src/stores/esp.ts#L1559): `ws.on('notification_new', handleNotificationNew)` → `notification-inbox.store` → Inbox+Badge
- [esp.ts:1560](El Frontend/src/stores/esp.ts#L1560): `ws.on('notification_updated', handleNotificationUpdated)` → `notification-inbox.store`
- [esp.ts:1561](El Frontend/src/stores/esp.ts#L1561): `ws.on('notification_unread_count', handleNotificationUnreadCount)` → `notification-inbox.store`
- Keine doppelten Handler (jedes Event genau ein Handler, ein Ziel-Store)
**Bewertung:** Korrekt. Saubere Trennung:
```
notification (legacy) → notification.store → Toast
notification_new      → notification-inbox.store → Inbox + Badge
notification_updated  → notification-inbox.store → Update
notification_unread_count → notification-inbox.store → Badge-Count
```

---

### FIX-14: Grafana Webhook URL Konsistenz
**Status:** GEFIXT
**IST-Zustand:**
- [webhooks.py:28](El Servador/god_kaiser_server/src/api/v1/webhooks.py#L28): `router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])`
- [webhooks.py:139-144](El Servador/god_kaiser_server/src/api/v1/webhooks.py#L139-L144): `@router.post("/grafana-alerts", ...)`
- [__init__.py:29,61](El Servador/god_kaiser_server/src/api/v1/__init__.py#L29): `api_v1_router.include_router(webhooks_router)` — Registriert ohne Extra-Prefix
- [main.py](El Servador/god_kaiser_server/src/main.py): App mountet `api_v1_router` unter `/api`
- Resultierende URL: `http://el-servador:8000/api/v1/webhooks/grafana-alerts`
- [contact-points.yml:17](docker/grafana/provisioning/alerting/contact-points.yml#L17): `url: "http://el-servador:8000/api/v1/webhooks/grafana-alerts"` — stimmt ueberein
**Bewertung:** Korrekt. URL ist ueberall konsistent.

---

### FIX-15: actuator_alert_handler Integration
**Status:** OFFEN (NIEDRIG — Mapping-Abweichungen)
**IST-Zustand:**
- [actuator_alert_handler.py:44-58](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py#L44-L58): `NotificationRouter.route()` wird aufgerufen (FIX-15 Kommentar im Code)
- Severity/Category-Mappings:

| Alert-Type | IST-Severity | SOLL-Severity | IST-Category | SOLL-Category |
|------------|-------------|---------------|-------------|---------------|
| emergency_stop | critical | critical | system | system |
| runtime_protection | warning | warning | **maintenance** | **lifecycle** |
| safety_violation | **critical** | **warning** | security | security |
| hardware_error | warning | warning | infrastructure | infrastructure |

- `source` ist korrekt `"mqtt_handler"` fuer alle
- [actuator_alert_handler.py:252-254](El Servador/god_kaiser_server/src/mqtt/handlers/actuator_alert_handler.py#L252-L254): Graceful Degradation — NotificationRouter-Fehler blockieren NICHT die MQTT-Verarbeitung
- `actuator_alert` WS-Event wird ZUSAETZLICH fuer Echtzeit-Dashboard gesendet (korrekte Dual-Path-Architektur)

**Bewertung:** Grundstruktur korrekt, aber 2 Mapping-Abweichungen:
1. `safety_violation` hat `severity="critical"` statt `"warning"` — **ARGUIERBAR BESSER** (ISA-18.2: Safety Violations SIND critical)
2. `runtime_protection` hat `category="maintenance"` statt `"lifecycle"` — **DISKUTABEL** (beides valide Kategorien)

**Empfehlung:** Entscheidung dem TM ueberlassen. Beide Varianten sind sinnvoll. Falls Spec-Konformitaet gewuenscht:
```python
# actuator_alert_handler.py:48 aendern:
"safety_violation": "warning",     # war: "critical"
# actuator_alert_handler.py:55 aendern:
"runtime_protection": "lifecycle",  # war: "maintenance"
```

---

## PRUEFEN-Ergebnisse

### PRUEFEN-01: APScheduler Typ
**Ergebnis:** `AsyncIOScheduler`
**Details:**
- [scheduler.py:107-111](El Servador/god_kaiser_server/src/core/scheduler.py#L107-L111): `self._scheduler = AsyncIOScheduler(jobstores=..., executors=..., job_defaults=...)`
- [main.py:264-267](El Servador/god_kaiser_server/src/main.py#L264-L267): `_central_scheduler = init_central_scheduler()` in Step 3.4
- [alert_suppression_scheduler.py:194-220](El Servador/god_kaiser_server/src/services/alert_suppression_scheduler.py#L194-L220): Registriert 2 Jobs:
  - `suppression_expiry_check` (IntervalTrigger, alle 5 Min)
  - `maintenance_overdue_check` (CronTrigger, taeglich 08:00)
- Executor: `AsyncIOExecutor` (async/await kompatibel)
- JobStore: `MemoryJobStore` (In-Memory)
- `max_instances: 1`, `misfire_grace_time: 30`
**Empfehlung:** AsyncIOScheduler ist korrekt fuer FastAPI async-Kontext. ContextVar-Propagation funktioniert. Kein Thread-Problem.

---

### PRUEFEN-02: Admin-only Decorator Pattern
**Ergebnis:** FastAPI Dependency-Injection mit Typ-Annotation `AdminUser`
**Details:**
- [deps.py](El Servador/god_kaiser_server/src/api/deps.py): `AdminUser = Annotated[User, Depends(require_admin)]`
- [deps.py](El Servador/god_kaiser_server/src/api/deps.py): `async def require_admin(current_user: ActiveUser) -> User` — prueft Admin-Rolle
- [notifications.py:239-271](El Servador/god_kaiser_server/src/api/v1/notifications.py#L239-L271): `async def send_notification(..., user: AdminUser):` — Admin-geschuetzt
- Gleiches Pattern in [auth.py:366](El Servador/god_kaiser_server/src/api/v1/auth.py#L366) (POST /register) und [auth.py:674](El Servador/god_kaiser_server/src/api/v1/auth.py#L674) (POST /mqtt/configure)
**Empfehlung:** Standard-FastAPI-Pattern. Kein klassischer Decorator, sondern Dependency-Injection ueber `Annotated[User, Depends(require_admin)]`. Fuer neue Admin-Endpoints: `user: AdminUser` als Parameter hinzufuegen.

---

### PRUEFEN-03: Store-Initialisierung
**Ergebnis:** `App.vue onMounted` ist der Initialisierungs-Hub
**Details:**
- [App.vue:28-35](El Frontend/src/App.vue#L28-L35): `onMounted` ruft auf:
  1. `authStore.checkAuthStatus()` — Auth zuerst
  2. `notificationInboxStore.loadInitial()` — bedingt auf `isAuthenticated`
- [App.vue:38-41](El Frontend/src/App.vue#L38-L41): `onUnmounted`: `espStore.cleanupWebSocket()`
- [esp.ts:1602-1603](El Frontend/src/stores/esp.ts#L1602-L1603): ESP-Store ruft `initWebSocket()` automatisch bei Store-Creation auf
- [notification-inbox.store.ts:124-150](El Frontend/src/shared/stores/notification-inbox.store.ts#L124-L150): `loadInitial()` laedt erste Seite + Unread Count via REST API
- `main.ts`: Keine Store-Initialisierung, nur App-Setup + Error-Handler
**Empfehlung:** Pattern beibehalten: Auth → bedingte Store-Init in `App.vue`. ESP-Store ist Self-Initializing.

---

### PRUEFEN-04: Zeitformatierungs-Library
**Ergebnis:** `date-fns` v4.1.0 installiert, aber relative Zeit wird MANUELL berechnet
**Details:**
- [package.json:35](El Frontend/package.json#L35): `"date-fns": "^4.1.0"` + `"chartjs-adapter-date-fns": "^3.0.0"`
- date-fns wird NUR als Chart.js-Adapter genutzt, NICHT fuer relative Zeitanzeige
- [formatters.ts:34-65](El Frontend/src/utils/formatters.ts#L34-L65): `formatRelativeTime()` berechnet relative Zeit manuell (Deutsch):
  - "Gerade eben" (<10s), "vor X Minuten", "vor X Stunden", etc.
  - Fallback auf `formatDateTime` fuer aeltere Eintraege
- [formatters.ts:71-85](El Frontend/src/utils/formatters.ts#L71-L85): `formatDateTime()` nutzt `Intl.DateTimeFormat` (Browser-API)
**Empfehlung:** `formatRelativeTime()` aus `formatters.ts` verwenden. KEINE neue Library noetig. Bei Bedarf koennte `date-fns/formatDistanceToNow` genutzt werden, aber die manuelle Loesung funktioniert und ist bereits deutsch lokalisiert.

---

### PRUEFEN-05: Grafana Provisioning-Verzeichnis
**Ergebnis:** Existiert mit vollstaendiger Konfiguration
**Details:**
- Verzeichnis: `docker/grafana/provisioning/alerting/` — vorhanden
- Dateien: `contact-points.yml`, `notification-policies.yml`, `alert-rules.yml`, `loki-alert-rules.yml`
- [contact-points.yml:17](docker/grafana/provisioning/alerting/contact-points.yml#L17): Webhook-URL: `http://el-servador:8000/api/v1/webhooks/grafana-alerts` — korrekt
- [contact-points.yml:16-20](docker/grafana/provisioning/alerting/contact-points.yml#L16-L20): `httpMethod: POST`, `maxAlerts: 10`, `disableResolveMessage: false`
- [notification-policies.yml](docker/grafana/provisioning/alerting/notification-policies.yml): `group_by: [grafana_folder, alertname]`, `group_wait: 30s`, `group_interval: 5m`, `repeat_interval: 4h`
- [docker-compose.yml:292](docker-compose.yml#L292): Volume-Mount: `./docker/grafana/provisioning:/etc/grafana/provisioning:ro`
**Empfehlung:** Vollstaendig konfiguriert. `disableResolveMessage: false` → Server erhaelt "resolved" Status fuer Auto-Close. Timing ist sinnvoll: 30s Buffer, 5m Grouping, 4h Repeat.

---

## Zusaetzliche Findings

### Finding A: actuator_alert — Dual-Path Architektur
Der `actuator_alert_handler` sendet ZWEI parallele Pfade:
1. `actuator_alert` WS-Event → `actuator.store.ts` → Echtzeit-Dashboard (SystemMonitorView)
2. `NotificationRouter.route()` → `notification_new` WS-Event → `notification-inbox.store.ts` → Inbox

Dies ist **korrekte Architektur** (nicht Duplikation). Dashboard braucht sofortige, detaillierte Alert-Daten. Inbox braucht persistierte, user-bezogene Notifications.

### Finding B: Legacy "notification" Event — Toter Code im Frontend
[esp.ts:1555](El Frontend/src/stores/esp.ts#L1555) registriert `ws.on('notification', handleNotification)`, aber der Server sendet dieses Event nicht mehr. Der Listener ist toter Code, aber harmlos (defensiv). Kann bei naechstem Cleanup entfernt werden.

### Finding C: --color-status-* Token-Migration
Die Legacy-Tokens (`--color-status-good/warning/alarm/offline`) in [tokens.css:209-212](El Frontend/src/styles/tokens.css#L209-L212) werden in 23+ Stellen verwendet. Sie dienen einem spezifischen Zweck (Sensor-Status-Indikatoren mit eigenen Farbwerten). Eine Migration auf `--color-success/error/warning` waere ein separates Refactoring, da die Farbwerte UNTERSCHIEDLICH sind:
- `--color-status-alarm: #ef4444` (red-500) vs `--color-error: #f87171` (red-400)
- `--color-status-good: #22c55e` (green-500) vs `--color-success: #34d399` (emerald-400)

---

## Fazit

Der Phase 4A Notification-Stack ist **solide implementiert**. Von 15 FIX-Punkten sind 12 vollstaendig korrekt, 3 haben minimale Abweichungen (Migration-Kommentar, Token-Legacy, Mapping-Variante). Kein Blocker fuer Phase 4B. Die 5 PRUEFEN-Punkte liefern klare Antworten fuer die weitere Entwicklung.

**Naechste Schritte (TM-Entscheidung):**
1. Migration-Kommentar in FIX-02 korrigieren (30 Sekunden)
2. FIX-15 Mappings: safety_violation critical vs warning entscheiden
3. Phase 4B starten (Alert-Center + Acknowledge-Flow)
