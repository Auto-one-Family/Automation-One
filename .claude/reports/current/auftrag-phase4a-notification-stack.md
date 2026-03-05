# Auftrag: Phase 4A — Notification-Stack (Email-Service + Routing + Frontend-Inbox)

**Ziel-Repo:** auto-one
**Kontext:** Erster Baustein von Phase 4 (System-Integration). Email-Service + Notification-Routing ist Grundlage fuer Alert Center (4B), Plugin-System (4C) und alle weiteren Benachrichtigungen. Robins Vision: "E-Mail-Postfach, Frontend-Kontrolle ueber das ganze System."
**Bezug:** `roadmap-phase4-system-integration.md` Block 4A, `roadmap.md` Phase 4
**Prioritaet:** Hoch
**Datum:** 2026-03-02
**Aufwand:** ~15-20h (3 Bloecke)
**Recherche-Basis:** 18 Web-Quellen + 12 wissenschaftliche Papers ausgewertet
**Wissensdateien:** `wissen/iot-automation/iot-alert-email-notification-architektur-2026.md`, `notification-stack-implementierung-recherche-2026.md`

---

## Ist-Zustand

### Was bereits existiert

**Backend (El Servador):**
- `NotificationActionExecutor` in `src/services/logic/actions/notification_executor.py` — **Alle 3 Kanaele bereits VOLL implementiert:** WebSocket (`ws_manager.broadcast`), Email (SMTP via `smtplib` + `asyncio.to_thread`), Webhook (`httpx.AsyncClient` POST). Gated auf `settings.notification.smtp_enabled`. Docstring sagt "placeholder" aber Code ist komplett. **[verify-plan: KEIN Placeholder — Plan-Annahme war falsch. Refactoring-Strategie noetig: bestehende Implementierung durch NotificationRouter WRAPPEN oder ERSETZEN, nicht "Placeholder fuellen".]**
- `actuator_alert_handler.py` — 4 Alert-Types (emergency, runtime, safety, hardware) via MQTT
- `SensorConfig.thresholds` — JSON-Feld mit critical_high/low, warning_high/low, enable_alerts (existiert, wird aber NICHT automatisch geroutet)
- `GET /v1/health/detailed` — Server, DB, MQTT, Container-Status
- `GET /v1/audit` — Alle System-Events (Audit-Log)
- `GET /v1/errors` — Aggregierte Fehler
- WebSocket Manager (`src/websocket/manager.py`) — **29 Event-Types** (nicht 28), Singleton via `WebSocketManager.get_instance()`, `broadcast(message_type: str, data: dict)` Signatur, Rate-Limit 10 msg/s pro Client, Thread-Safe via `broadcast_threadsafe()` **[verify-plan: 29 Events, broadcast-Signatur ist `broadcast("type_string", data_dict)` — NICHT `broadcast({"type": ...})`]**
- User-Management — `user.py` Model (Tabelle `user_accounts`, PK `id: int` auto-increment) + Auth-API (JWT, 3 Rollen: admin/operator/viewer) **[verify-plan: User-ID ist `int`, NICHT `UUID`. Tabelle heisst `user_accounts`, NICHT `users`. KRITISCH fuer FK in notifications-Schema.]**
- Logic Engine — 4 Condition-Evaluatoren + 4 Action-Executoren (inkl. `notification` mit Placeholder)
- PostgreSQL — **20 Tabellen** (nicht 19), 22 Alembic-Migrationen. DB-Base: `class Model(Base, TimestampMixin)`, TimestampMixin liefert `created_at`/`updated_at` automatisch

**Frontend (El Frontend):**
- `notification.store.ts` (Pfad: `src/shared/stores/notification.store.ts`) — Toast-System (error/warning/success/info) — **NUR Toasts, keine Inbox, kein persistenter State** **[verify-plan: Store-Pfad ist `shared/stores/`, NICHT `stores/`. Toast-Composable `useToast()` ist ein separater Singleton in `src/composables/useToast.ts`, KEIN Pinia-Store.]**
- `ToastContainer.vue` + `useToast()` — In-App-Notifications
- `AlarmListWidget.vue` — Persistierte Alerts aus alert-center.store (seit Alert-Basis 1; vorher Sensor-Quality)
- `SystemMonitorView.vue` — **5 Tabs** (Events, Logs, Database, MQTT, Health) **[verify-plan: 5 Tabs nicht 4, Tab-Reihenfolge korrigiert]**
- API-Layer — **20 Module** in `src/api/` (health.ts, logs.ts, debug.ts, audit.ts, auth.ts, esp.ts, sensors.ts, actuators.ts, zones.ts, subzones.ts, dashboards.ts, logic.ts, config.ts, users.ts, database.ts, calibration.ts, loadtest.ts, errors.ts, parseApiError.ts, index.ts). Pattern: `export const {domain}Api = { ... }` oder benannte Exports. Basis-URL: `/api/v1`
- Design-System — `tokens.css` mit Status-Farben **[verify-plan: Variablen-Namen sind `--color-error` (rot), `--color-warning` (amber), `--color-info` (blau), `--color-success` (gruen). NICHT `--status-critical` etc. Alle Referenzen im Plan muessen angepasst werden.]**
- WebSocket-Integration — Bestehender WS-Handler in Pinia Stores

**Monitoring:**
- 38/38 Grafana-Alerts aktiv (32 Prometheus + 6 Loki, 9 Gruppen)
- Grafana Contact Points — NUR Default (kein Webhook konfiguriert)
- Prometheus + Loki + Alloy + cAdvisor + Exporter — alles laeuft

### Was fehlt

1. **Keine `notifications` Tabelle** — Benachrichtigungen werden nirgends persistiert
2. **Kein Email-Service** — Email-Placeholder in NotificationActionExecutor ist leer
3. **Kein Notification-Router** — Keine zentrale Stelle die entscheidet WO eine Nachricht hingeht
4. **Kein Frontend-Inbox** — Nur Toasts, kein Bell-Badge, kein Drawer, kein Postfach
5. **Kein Grafana-Webhook** — Alerts bleiben in Grafana, Backend weiss nichts davon
6. **Keine User-Preferences** — Kein Quiet-Hours, kein Email-ein/aus, kein Severity-Filter

---

## Was getan werden muss

Robin bekommt ein vollstaendiges Benachrichtigungssystem:

1. **Backend:** Zentraler Notification-Router der JEDE System-Benachrichtigung empfaengt, in die DB schreibt, und ueber konfigurierbare Kanaele (WebSocket, Email, Webhook) weiterleitet
2. **Email:** Resend-API als Primary Provider (3.000 Emails/Monat frei), SMTP als Fallback. Nicht-blockierend via BackgroundTasks. Digest-Logik fuer Warning-Batching
3. **Frontend:** Bell-Badge in der Header-Leiste mit Unread-Counter, Notification-Drawer (rechts einblendbar), Preferences-Panel
4. **Grafana-Integration:** Webhook Contact Point der alle 38 Alerts an das Backend routet

**Erwartetes Ergebnis:** Robin sieht im Frontend sofort wenn etwas passiert (Badge pulsiert rot bei Critical). Er kann den Drawer oeffnen und alle Benachrichtigungen sehen. Kritische Alerts kommen zusaetzlich per Email. Warning-Alerts werden stuendlich als Digest gebatched.

---

## Technische Details

### Betroffene Schichten

- [x] Backend (El Servador) — Neues DB-Modell, 3 neue Services, 1 neuer API-Router, Alembic-Migration
- [ ] Firmware (El Trabajante) — NICHT betroffen
- [x] Frontend (El Frontend) — 3 neue Komponenten, 1 neuer Store, 1 neues API-Modul
- [x] Monitoring (Grafana) — Webhook Contact Point + Notification Policy konfigurieren

### Betroffene Module

<!-- [verify-plan: Alle Pfade korrigiert. /src/ → relative zu El Servador/god_kaiser_server/. /app/src/ → relative zu El Frontend/. -->
<!-- Schemas muessen in src/schemas/notification.py (separates File, bestehendes Pattern). -->
<!-- NotificationSettings in config.py muss ERWEITERT werden (Nested Class), NICHT flache Settings. -->

| Schicht | Modul (Pfad relativ zum Subprojekt) | Aenderung |
|---------|-------|-----------|
| Backend | `src/services/email_service.py` | **NEU** — Dual-Provider (Resend + SMTP) |
| Backend | `src/services/notification_router.py` | **NEU** — Zentraler Router |
| Backend | `src/services/digest_service.py` | **NEU** — Warning-Digest-Timer |
| Backend | `src/db/models/notification.py` | **NEU** — DB-Modell (Pattern: `class X(Base, TimestampMixin)`) |
| Backend | `src/schemas/notification.py` | **NEU** — Pydantic-Schemas (bestehendes Pattern: separate schemas/ Datei) |
| Backend | `src/api/v1/notifications.py` | **NEU** — REST-API (9 Endpoints), prefix="/v1/notifications" |
| Backend | `src/api/v1/webhooks.py` | **NEU** — Grafana Webhook Endpoint, prefix="/v1/webhooks" |
| Backend | `src/core/config.py` | **ERWEITERN** — `NotificationSettings`-Klasse um Resend-Felder ergaenzen (nested, NICHT flach) |
| Backend | `src/services/logic/actions/notification_executor.py` | **REFACTOR** — Bestehende SMTP/Webhook-Implementierung durch NotificationRouter ersetzen (KEIN Placeholder!) |
| Backend | `src/api/v1/__init__.py` | **ERWEITERN** — Neue Router registrieren (notifications_router, webhooks_router) |
| Backend | `src/db/models/__init__.py` | **ERWEITERN** — Notification-Model importieren |
| Backend | `alembic/versions/` | **NEU** — Migration fuer 2 Tabellen |
| Backend | `templates/email/` | **NEU** — Jinja2 Email-Templates (alert, digest, test). Verzeichnis existiert noch NICHT |
| Frontend | `src/shared/stores/notification-inbox.store.ts` | **NEU** — Inbox Pinia Store (in `shared/stores/`, NICHT `stores/`) |
| Frontend | `src/components/notifications/NotificationBadge.vue` | **NEU** — Bell-Icon + Badge |
| Frontend | `src/components/notifications/NotificationDrawer.vue` | **NEU** — Drawer (nutzt bestehende `SlideOver.vue`) |
| Frontend | `src/components/notifications/NotificationItem.vue` | **NEU** — Einzel-Item |
| Frontend | `src/components/notifications/NotificationPreferences.vue` | **NEU** — Settings |
| Frontend | `src/api/notifications.ts` | **NEU** — API-Client |
| Frontend | `src/shared/design/layout/TopBar.vue` | **ERWEITERN** — NotificationBadge einhaengen (NICHT AppHeader/AppSidebar!) |
| Monitoring | `docker/grafana/provisioning/alerting/contact-points.yml` | **NEU** — Webhook CP |
| Monitoring | `docker/grafana/provisioning/alerting/notification-policies.yml` | **NEU** — Policy |

---

## Block 4A.1: Email-Service Backend (~6-8h)

### 4A.1.1: Datenbank-Schema (2 neue Tabellen)

**Tabelle `notifications`:**
```sql
-- [verify-plan: KRITISCH — user_id muss INTEGER sein (user_accounts.id ist int, NICHT UUID).
--  Tabelle heisst user_accounts, NICHT users. id kann UUID bleiben (neues Modell-Design).]
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES user_accounts(id),  -- NICHT UUID, NICHT users!
    channel VARCHAR(20) NOT NULL,          -- 'email', 'websocket', 'webhook', 'inbox'
    severity VARCHAR(20) NOT NULL,         -- 'critical', 'warning', 'info' (3 Severity-Stufen)
                                           -- FIX-02: 'resolved' ist STATUS, nicht Severity.
                                           -- Severity + Status sind getrennte Dimensionen (ISA-18.2).
    category VARCHAR(50) NOT NULL,         -- FIX-03: Category und Source sind GETRENNTE Dimensionen.
                                           -- Categories: 'connectivity', 'data_quality', 'infrastructure',
                                           -- 'lifecycle', 'maintenance', 'security', 'system'
                                           -- Sources: separate Spalte (s.u.)
    title VARCHAR(255) NOT NULL,
    body TEXT,                              -- NULLABLE (nicht alle Notifications haben Body)
    metadata JSONB DEFAULT '{}',           -- esp_id, sensor_type, rule_id, grafana_fingerprint,
                                           -- correlation_id, zone_name, values
    source VARCHAR(50) NOT NULL,           -- 'grafana', 'logic_engine', 'mqtt_handler',
                                           -- 'sensor_threshold', 'device_event', 'autoops', 'manual', 'system'
    fingerprint VARCHAR(64),               -- FIX-07: Deduplikation. MD5/SHA256 von source+category+title.
                                           -- Partial Index WHERE fingerprint IS NOT NULL
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    digest_sent BOOLEAN DEFAULT FALSE,     -- Fuer Warning-Digest-Tracking
    parent_notification_id UUID REFERENCES notifications(id),  -- Root-Cause Korrelation
    -- FIX-04: created_at/updated_at kommen via TimestampMixin automatisch.
    -- In SQLAlchemy-Model NICHT nochmal definieren! read_at ist eigenes Feld.
    created_at TIMESTAMPTZ DEFAULT NOW(),   -- (nur Doku, TimestampMixin liefert dies)
    read_at TIMESTAMPTZ
);

-- Performance-Indizes
CREATE INDEX idx_notifications_user_unread
    ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created
    ON notifications(created_at DESC);
CREATE INDEX idx_notifications_source_category
    ON notifications(source, category);
CREATE INDEX idx_notifications_severity
    ON notifications(severity) WHERE severity IN ('critical', 'warning');
-- FIX-07: Fingerprint-Index fuer Deduplication
CREATE UNIQUE INDEX idx_notifications_fingerprint
    ON notifications(fingerprint) WHERE fingerprint IS NOT NULL;
```

**Tabelle `notification_preferences`:**
```sql
-- [verify-plan: Gleiche Korrektur wie oben — INTEGER, user_accounts]
CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES user_accounts(id),  -- NICHT UUID, NICHT users!
    websocket_enabled BOOLEAN DEFAULT TRUE,
    email_enabled BOOLEAN DEFAULT FALSE,
    email_address VARCHAR(255),
    email_severities JSONB DEFAULT '["critical"]',        -- Welche Severities per Email
    email_categories JSONB DEFAULT '[]',                   -- Leer = alle Kategorien
    webhook_url VARCHAR(500),
    webhook_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '07:00',
    digest_interval_minutes INT DEFAULT 60,                -- Warning-Digest-Intervall
    digest_min_count INT DEFAULT 3,                        -- Mindest-Warnings fuer Digest
    browser_notifications BOOLEAN DEFAULT FALSE,           -- Browser Notification API
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Alembic-Migration:** Eine Migration fuer beide Tabellen. Naming: `add_notifications_and_preferences.py`.

### 4A.1.2: Email-Service (Dual-Provider)

**Datei:** `/src/services/email_service.py`

**Architektur-Entscheidung (recherche-fundiert):**
- **Resend als Primary** — API-Key in `.env`, `pip install resend`, 3 Zeilen Code fuer Versand. Free Tier: 3.000/Monat, 100/Tag. Rate-Limit: 2 req/s (ausreichend fuer Alert-Emails)
- **fastapi-mail/SMTP als Fallback** — Wenn `RESEND_API_KEY` leer aber `SMTP_HOST` gesetzt. Library `fastapi-mail` v1.6.2 (2026-02-17, aktiv gepflegt, async via aiosmtplib, Jinja2 eingebaut)
- **Kein Celery/ARQ noetig** — Email-Versand ist ein <3s Task. FastAPI `BackgroundTasks` reicht (recherche-bestaetigt: kein Redis im Stack, 13 Container sind schon genug). Spaeter ARQ wenn Redis hinzukommt

**Config-Erweiterung (`src/core/config.py`):**

**[verify-plan: KRITISCH — Config nutzt NESTED `NotificationSettings(BaseSettings)` Klasse (Zeile 248-267).
SMTP-Felder existieren BEREITS: `smtp_enabled`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_use_tls`, `smtp_from`.
Zugriff via `settings.notification.smtp_host` (NICHT `settings.SMTP_HOST`).
NUR die Resend- und Email-Template-Felder muessen HINZUGEFUEGT werden:]**

```python
# In bestehender NotificationSettings-Klasse ergaenzen:
class NotificationSettings(BaseSettings):
    # --- BEREITS VORHANDEN (NICHT nochmal anlegen): ---
    # smtp_enabled, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, smtp_from
    # webhook_timeout_seconds

    # --- NEU HINZUFUEGEN: ---
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_enabled: bool = Field(default=False, alias="EMAIL_ENABLED")  # Master-Switch
    # FIX-05: email_enabled vs. smtp_enabled Logik:
    #   email_enabled=false → KEIN Email (weder Resend noch SMTP)
    #   email_enabled=true + resend_api_key gesetzt → Resend Provider
    #   email_enabled=true + resend_api_key leer + smtp_enabled=true → SMTP Fallback
    #   smtp_enabled ist PROVIDER-Switch, email_enabled ist MASTER-Switch
    email_from: str = Field(default="AutomationOne <alerts@robin-herbig.de>", alias="EMAIL_FROM")
    email_template_dir: str = Field(default="templates/email", alias="EMAIL_TEMPLATE_DIR")
```

**Email-Service Pattern:**
```python
class EmailService:
    async def send(self, to: str, subject: str, html: str) -> bool:
        if not settings.EMAIL_ENABLED:
            return False
        try:
            if settings.RESEND_API_KEY:
                return await self._send_resend(to, subject, html)
            elif settings.SMTP_HOST:
                return await self._send_smtp(to, subject, html)
            else:
                logger.warning("Email enabled but no provider configured")
                return False
        except Exception as e:
            logger.error(f"Email send failed: {e}", exc_info=True)
            # KRITISCH: Email-Fehler darf Alert-Verarbeitung NICHT blockieren
            return False
```

**Jinja2-Templates (3 Stueck):**
- `templates/email/alert_critical.html` — Severity-Banner (rot/gelb/blau), Was+Wo+Wann, Grafana-Link, Dashboard-Link
- `templates/email/alert_digest.html` — Zusammenfassung: N Warnings, Tabelle mit Severity/Titel/Quelle/Seit, Dashboard-Link
- `templates/email/test.html` — Setup-Verifikation ("Email-Service funktioniert")

### 4A.1.3: Notification-Router (Kern-Service)

**Datei:** `/src/services/notification_router.py`

**Verantwortung:** JEDE Benachrichtigung im System geht durch diesen Service. Er entscheidet basierend auf User-Preferences welche Kanaele bedient werden.

```python
class NotificationRouter:
    def __init__(self, db, ws_manager, email_service):
        self.db = db
        self.ws_manager = ws_manager
        self.email_service = email_service

    async def route(self, notification: NotificationCreate) -> Notification:
        # 1. IMMER: In DB speichern (Inbox)
        db_notification = await self._persist(notification)

        # 2. Preferences laden
        prefs = await self._get_preferences(notification.user_id)

        # 3. WebSocket IMMER (wenn enabled)
        # [verify-plan: broadcast-Signatur ist broadcast(message_type: str, data: dict).
        #  Event-Namen mit Underscore, NICHT Doppelpunkt (Konvention: sensor_data, actuator_status etc.)]
        if prefs.websocket_enabled:
            await self.ws_manager.broadcast(
                "notification_new",  # NICHT "notification:new" — Underscore-Konvention!
                db_notification.to_dict()
            )

        # 4. Email nach Severity + Quiet Hours + Digest-Logik
        if self._should_send_email(notification, prefs):
            # Critical: Sofort. Warning: Digest-Queue. Info: Nie.
            if notification.severity == "critical":
                await self._queue_email(db_notification, prefs)
            elif notification.severity == "warning":
                # Erste Warning des Tages → sofort. Danach → Digest
                if await self._is_first_warning_today(notification.user_id):
                    await self._queue_email(db_notification, prefs)
                # Sonst: digest_sent=False bleibt, DigestService holt sie ab

        # 5. Webhook (optional, fuer externe Systeme)
        if prefs.webhook_enabled and prefs.webhook_url:
            await self._send_webhook(db_notification, prefs.webhook_url)

        return db_notification

    def _should_send_email(self, notification, prefs) -> bool:
        if not prefs.email_enabled:
            return False
        if notification.severity not in prefs.email_severities:
            return False
        if prefs.quiet_hours_enabled and self._is_quiet_hours(prefs):
            return False
        return True
```

### 4A.1.4: Digest-Service (Warning-Batching)

**Datei:** `/src/services/digest_service.py`

**Recherche-Empfehlung (ISA-18.2 + SuprSend Best Practices):**

| Trigger | Delivery | Begruendung |
|---------|----------|-------------|
| severity=critical | Sofort (<30s) | Sofortiges Handeln noetig |
| severity=warning (erste des Tages) | Sofort | Kontext-Bewusstsein herstellen |
| severity=warning (Folge) | Digest alle 60 Min wenn ≥3 aktiv | Kein Email-Overload (ISA-18.2: <6/h) |
| severity=info | Kein Email | Nur Inbox + Badge |
| status=resolved (nach Critical) | Optional sofort | Bestaetigung |

**Implementierung:**
- Startet als `asyncio.Task` beim Server-Boot (in `lifespan`)
- Laeuft im Hintergrund, prueft alle 60 Minuten (konfigurierbar per `digest_interval_minutes`)
- Holt alle `notifications` mit `severity='warning' AND digest_sent=FALSE AND created_at > now() - interval`
- Wenn `count >= digest_min_count`: Email-Digest senden, `digest_sent=TRUE` setzen
- Respektiert Quiet Hours (22:00-07:00 keine Digests)

### 4A.1.5: REST-API Endpoints

**Datei:** `src/api/v1/notifications.py` — `router = APIRouter(prefix="/v1/notifications", tags=["notifications"])`

<!-- [verify-plan: Router-Prefix ist "/v1/notifications". main.py fuegt "/api" hinzu. -->
<!-- Volle URL wird also /api/v1/notifications/... — Frontend-API-Client nutzt Basis /api/v1.] -->

| Methode | Router-Pfad | Volle URL | Beschreibung |
|---------|-------------|-----------|-------------|
| `GET` | `/` | `/api/v1/notifications` | Liste mit Filtern: severity, source, category, is_read, limit/offset |
| `GET` | `/unread-count` | `/api/v1/notifications/unread-count` | Badge-Zaehler |
| `GET` | `/{id}` | `/api/v1/notifications/{id}` | Einzelne Notification mit Metadaten |
| `PATCH` | `/{id}/read` | `/api/v1/notifications/{id}/read` | Als gelesen markieren |
| `PATCH` | `/read-all` | `/api/v1/notifications/read-all` | Alle als gelesen markieren |
| `POST` | `/send` | `/api/v1/notifications/send` | Manuelle Notification senden (Admin-only) |
| `GET` | `/preferences` | `/api/v1/notifications/preferences` | User-Einstellungen laden |
| `PUT` | `/preferences` | `/api/v1/notifications/preferences` | User-Einstellungen speichern |
| `POST` | `/test-email` | `/api/v1/notifications/test-email` | Test-Email senden |

**Pydantic-Schemas** (in `src/schemas/notification.py`, NICHT inline im Router):

<!-- [verify-plan: Schemas gehoeren in src/schemas/ (bestehendes Pattern). user_id ist int, nicht UUID.] -->

```python
class NotificationCreate(BaseModel):
    severity: Literal["critical", "warning", "info"]  # FIX-02: 'success' gestrichen, 'resolved' ist Status
    category: str
    title: str = Field(max_length=255)
    body: str
    metadata: dict = {}
    source: str
    user_id: int | None = None  # None = an alle Admins. INT weil user_accounts.id = int!

class NotificationResponse(BaseModel):
    id: UUID
    severity: str
    category: str
    title: str
    body: str
    metadata: dict
    source: str
    is_read: bool
    created_at: datetime
    read_at: datetime | None

class NotificationPreferencesUpdate(BaseModel):
    email_enabled: bool | None = None
    email_address: str | None = None
    email_severities: list[str] | None = None
    quiet_hours_enabled: bool | None = None
    quiet_hours_start: time | None = None
    quiet_hours_end: time | None = None
    digest_interval_minutes: int | None = Field(None, ge=15, le=1440)
    browser_notifications: bool | None = None
```

### 4A.1.6: NotificationActionExecutor erweitern

**Datei:** `src/services/logic/actions/notification_executor.py`

**[verify-plan: KEIN Placeholder! Die bestehende Implementierung hat:**
- **`_send_email_notification()`: Voll funktional via `smtplib.SMTP` + `asyncio.to_thread()`, liest `settings.notification.smtp_*`**
- **`_send_webhook_notification()`: Voll funktional via `httpx.AsyncClient` POST**
- **`_send_websocket_notification()`: Voll funktional via `ws_manager.broadcast("notification", ...)`**
**Refactoring-Strategie: `__init__` um `notification_router` Parameter erweitern, dann die Channel-Methoden durch Router-Aufrufe ersetzen.]**

```python
# Vorher (bestehende SMTP-Implementierung, KEIN leerer Placeholder):
# _send_email_notification() nutzt smtplib direkt
# _send_webhook_notification() nutzt httpx direkt

# Nachher (durch NotificationRouter ersetzen):
async def _send_email(self, params, context):
    await self.notification_router.route(NotificationCreate(
        severity=params.get("severity", "info"),
        category="rule_execution",
        title=f"Regel '{context.rule_name}' ausgeloest",
        body=params.get("message", ""),
        metadata={"rule_id": str(context.rule_id), "trigger_value": context.trigger_value},
        source="logic_engine",
    ))
```

### 4A.1.7: WebSocket-Events (3 neue Events)

In den bestehenden WebSocket-Manager einhaengen:

<!-- [verify-plan: Event-Namen muessen Underscore-Konvention folgen (sensor_data, actuator_status, etc.). -->
<!-- Doppelpunkt-Notation existiert NICHT im System. broadcast() erwartet message_type als String.] -->

| Event (message_type) | Payload (data dict) | Wann |
|-------|---------|------|
| `notification_new` | `NotificationResponse` | Neue Notification erstellt |
| `notification_updated` | `{id, is_read, read_at}` | Notification gelesen/archiviert |
| `notification_unread_count` | `{count: int}` | Unread-Counter geaendert |

---

## Block 4A.2: Frontend Email-Inbox (~5-7h)

### 4A.2.1: API-Client

**Datei:** `El Frontend/src/api/notifications.ts`

Analog zu bestehenden API-Modulen (health.ts, logs.ts). Nutzt bestehenden `api` axios-Instance aus `./index` mit JWT-Auth + Interceptor. **[verify-plan: Import ist `import api from './index'`, Basis-URL `/api/v1`. Pattern: benannte Exports oder `export const notificationsApi = { ... }`]**

### 4A.2.2: Pinia Store

**Datei:** `El Frontend/src/shared/stores/notification-inbox.store.ts`
**[verify-plan: Stores gehoeren in `shared/stores/`, NICHT `stores/`. Einzige Ausnahme: `esp.ts`.]**

```typescript
export const useNotificationInboxStore = defineStore('notification-inbox', () => {
  const notifications = ref<Notification[]>([])
  const unreadCount = ref(0)
  const isDrawerOpen = ref(false)
  const activeFilter = ref<'all' | 'critical' | 'warning' | 'system'>('all')

  // Initial-Load beim App-Start
  async function loadInitial() {
    const [notifs, count] = await Promise.all([
      notificationsApi.list({ limit: 50 }),
      notificationsApi.getUnreadCount(),
    ])
    notifications.value = notifs
    unreadCount.value = count
  }

  // WebSocket-Handler registrieren (in bestehendem WS-Handler einhaengen)
  function handleWSEvent(data: any) {
    switch (data.type) {
      // [verify-plan: Event-Namen mit Underscore, nicht Doppelpunkt]
      case 'notification_new':
        notifications.value.unshift(data.notification)
        unreadCount.value++
        if (data.notification.severity === 'critical') {
          showBrowserNotification(data.notification)
        }
        break
      case 'notification_unread_count':
        unreadCount.value = data.count
        break
    }
  }

  // Gelesen markieren
  async function markAsRead(id: string) {
    await notificationsApi.markRead(id)
    const idx = notifications.value.findIndex(n => n.id === id)
    if (idx >= 0) {
      notifications.value[idx].is_read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }

  return { notifications, unreadCount, isDrawerOpen, activeFilter,
           loadInitial, handleWSEvent, markAsRead }
})
```

### 4A.2.3: NotificationBadge

**Datei:** `El Frontend/src/components/notifications/NotificationBadge.vue`
**Groesse:** ~80 Zeilen

- Bell-Icon: `Bell` aus `lucide-vue-next` **[verify-plan: NICHT Heroicons — Projekt nutzt AUSSCHLIESSLICH lucide-vue-next (108 Imports). Heroicons ist NICHT installiert.]**
- Badge mit Zaehler (max "99+")
- Farbe: `var(--color-error)` wenn Critical aktiv, `var(--color-warning)` bei Warning, sonst neutral **[verify-plan: `--color-error`/`--color-warning`, NICHT `--status-critical`/`--status-warning`]**
- CSS `@keyframes pulse` bei neuer Critical-Notification
- Klick togglet `isDrawerOpen` im Store
- **Position:** In `TopBar.vue` (`src/shared/design/layout/TopBar.vue`) rechts, zwischen `EmergencyStopButton` und `ConnectionDot`. **[verify-plan: Header heisst `TopBar.vue`, NICHT AppHeader/AppSidebar. Layout RIGHT: [+Mock] [Pending] | [ColorLegend] [NOT-AUS] | [Dot] [User]]**

### 4A.2.4: NotificationDrawer

**Datei:** `El Frontend/src/components/notifications/NotificationDrawer.vue`
**Groesse:** ~250-300 Zeilen

- **[verify-plan: `SlideOver.vue` existiert bereits als Shared-Primitive in `src/shared/design/primitives/SlideOver.vue`. Props: `open` (boolean), `title` (string), `width` ('sm'|'md'|'lg'). Features: ESC, Backdrop-Click, Body-Scroll-Lock, Teleport. NUTZE diese Komponente, NICHT eigene CSS-Transition bauen!]**
- SlideOver von rechts — bestehende `SlideOver.vue` Primitive mit `width="lg"` (560px) verwenden
- Header: "Benachrichtigungen" + Zahnrad-Icon (→ Preferences) + "Alle gelesen"-Button
- Filter-Tabs: Alle | Kritisch | Warnungen | System (analog zu bestehenden ViewTabBar-Tabs)
- Notification-Liste: Gruppiert nach Heute/Gestern/Aelter
- Empty State: "Keine Benachrichtigungen" mit Bell-Icon
- Lazy-Loading: Erste 50 laden, "Mehr laden"-Button am Ende
- Click-Outside oder Escape schliesst Drawer

### 4A.2.5: NotificationItem

**Datei:** `El Frontend/src/components/notifications/NotificationItem.vue`
**Groesse:** ~120 Zeilen

- Severity-Dot links (Farbe aus `tokens.css`: `--color-error`, `--color-warning`, `--color-info`, `--color-success`)
- Titel (fett wenn ungelesen) + Beschreibung (1 Zeile, truncated)
- Relative Zeit rechts ("vor 5 Min", "vor 1h")
- Expandierbar: Details (Quelle, ESP, Zone, Correlation-ID, Deep-Links)
- Action-Buttons: "Als gelesen" / "Zum Sensor" / "Zur Regel" / "In Grafana"
- Hover-State: Leichter Hintergrund (Design-Token, z.B. `glass-panel` Klasse oder Tailwind `hover:bg-dark-800`)

### 4A.2.6: NotificationPreferences

**Datei:** `El Frontend/src/components/notifications/NotificationPreferences.vue`
**Groesse:** ~180 Zeilen

- Bestehende `SlideOver.vue` verwenden ODER `BaseModal.vue` (beide in `shared/design/`). **[verify-plan: AccordionSection.vue existiert in shared/design/primitives/ — nutzen fuer Basic/Advanced/Expert Zonen]**
- **Basic-Zone:**
  - Toggle: Email-Benachrichtigungen ein/aus
  - Email-Adresse (Input)
  - Checkboxen: Welche Severities per Email (Critical ✓, Warning ✓, Info ✗)
- **Advanced-Zone (Accordion):**
  - Quiet Hours: ein/aus + Start/Ende (TimePicker)
  - Digest-Intervall: 15/30/60/120 Min (Dropdown)
  - Browser-Notifications: ein/aus (mit Permission-Request)
- **Expert-Zone (optional, spaeter):**
  - Webhook-URL + ein/aus
  - Kategorie-Filter

### 4A.2.7: WebSocket-Integration

In den bestehenden WebSocket-Handler einhaengen — KEIN separater Socket. **[verify-plan: WS wird vom `websocketService` Singleton (`src/services/websocket.ts`) verwaltet. `esp.store.ts` ist der primaere Dispatcher (Zeilen ~1522-1551) fuer ALLE 29 Event-Types. Neue Events `notification_new`, `notification_updated`, `notification_unread_count` muessen dort registriert und an den `notification-inbox.store` delegiert werden — analog zu `useNotificationStore().handleNotification()`.]**

**Browser Notification API (optional, nur Critical):**
```typescript
async function showBrowserNotification(notification: Notification) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
  if (Notification.permission === 'granted') {
    new window.Notification(notification.title, {
      body: notification.body,
      icon: '/favicon.ico',
      tag: notification.id, // Dedupliziert gleichnamige
    })
  }
}
```

---

## Block 4A.3: Grafana Webhook → Backend (~2-3h)

### 4A.3.1: Grafana Contact Point (Provisioning YAML)

**Datei:** `docker/grafana/provisioning/alerting/contact-points.yml`

```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: automationone-webhook
    receivers:
      - uid: ao-webhook-receiver
        type: webhook
        disableResolveMessage: false  # Resolved-Events senden!
        settings:
          url: http://el-servador:8000/api/v1/webhooks/grafana-alerts  # [verify-plan: KRITISCH — /api/ Prefix fehlte!]
          httpMethod: POST
          maxAlerts: 50
```

### 4A.3.2: Notification Policy

**Datei:** `docker/grafana/provisioning/alerting/notification-policies.yml`

```yaml
apiVersion: 1
policies:
  - orgId: 1
    receiver: automationone-webhook
    group_by: [grafana_folder, alertname]
    group_wait: 30s       # 30s warten ob weitere Alerts derselben Gruppe kommen
    group_interval: 5m    # Innerhalb einer Gruppe: max alle 5 Min neue Nachricht
    repeat_interval: 4h   # Gleicher Alert hoechstens alle 4h wiederholen
```

**Architektur-Entscheidung (recherche-bestaetigt):** Email NICHT ueber Grafana Contact Point, sondern Backend-seitig. Gruende:
- Backend hat User-Preferences, Digest-Logik, Quiet Hours
- Grafana braucht keine SMTP-Credentials
- Einfachere Konfiguration (nur 1 Contact Point: Webhook)
- Backend-Email-Logic testbar ohne Grafana

### 4A.3.3: Backend Webhook-Endpoint

**Datei:** `src/api/v1/webhooks.py` — `router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])`

```python
# [verify-plan: Router-Prefix "/v1/webhooks" + main.py "/api" = volle URL /api/v1/webhooks/grafana-alerts]
@router.post("/grafana-alerts")  # NICHT "/v1/webhooks/grafana-alerts" — Prefix kommt vom Router!
async def receive_grafana_alert(
    request: Request,
    payload: GrafanaWebhookPayload,
    background_tasks: BackgroundTasks,
):
    for alert in payload.alerts:
        # Grafana-Label → AutomationOne-Severity Mapping
        severity = alert.labels.get("severity", "info")
        if severity not in ("critical", "warning", "info"):
            severity = "info"

        notification = NotificationCreate(
            severity=severity,
            category=_categorize_alert(alert),  # infrastructure/sensor/device/system
            title=alert.annotations.get("summary", alert.labels.get("alertname", "Alert")),
            body=alert.annotations.get("description", ""),
            metadata={
                "grafana_fingerprint": alert.fingerprint,
                "grafana_status": alert.status,  # "firing" | "resolved"
                "esp_id": alert.labels.get("esp_id"),
                "sensor_type": alert.labels.get("sensor_type"),
                "alertname": alert.labels.get("alertname"),
                "generator_url": alert.generatorURL,
                "dashboard_url": alert.dashboardURL,
                "values": alert.values,
                "starts_at": alert.startsAt.isoformat(),
            },
            source="grafana",
        )

        # Deduplication: Gleicher fingerprint + firing = Update statt Neu
        existing = await repo.find_by_fingerprint(alert.fingerprint)
        if existing and alert.status == "firing":
            continue  # Schon bekannt, nicht nochmal routen
        if existing and alert.status == "resolved":
            await repo.mark_resolved(existing.id)
            # Resolved-Notification senden
            notification.severity = "info"
            notification.title = f"[RESOLVED] {notification.title}"

        await notification_router.route(notification)

    return {"status": "ok", "alerts_processed": len(payload.alerts)}
```

**Pydantic-Modell fuer Grafana-Payload:**
```python
class GrafanaAlert(BaseModel):
    status: str                          # "firing" | "resolved"
    labels: dict[str, str]
    annotations: dict[str, str]
    startsAt: datetime
    endsAt: datetime
    generatorURL: str = ""
    fingerprint: str
    silenceURL: str = ""
    dashboardURL: str = ""
    panelURL: str = ""
    values: dict[str, float] = {}

class GrafanaWebhookPayload(BaseModel):
    receiver: str
    status: str
    orgId: int
    alerts: list[GrafanaAlert]
    groupLabels: dict[str, str] = {}
    commonLabels: dict[str, str] = {}
    commonAnnotations: dict[str, str] = {}
    externalURL: str = ""
    version: str = "1"
    groupKey: str = ""
    truncatedAlerts: int = 0
    title: str = ""
    message: str = ""
```

### 4A.3.4: Alert-Kategorisierung

```python
def _categorize_alert(alert: GrafanaAlert) -> str:
    """Grafana-Alert → AutomationOne-Kategorie."""
    folder = alert.labels.get("grafana_folder", "")
    alertname = alert.labels.get("alertname", "").lower()

    if any(kw in alertname for kw in ["container", "disk", "memory", "cpu"]):
        return "infrastructure"
    if any(kw in alertname for kw in ["sensor", "stale", "quality"]):
        return "data_quality"
    if any(kw in alertname for kw in ["mqtt", "heartbeat", "offline"]):
        return "connectivity"
    if any(kw in alertname for kw in ["restart", "oom", "error"]):
        return "system"
    return "system"  # Default
```

---

## Abhaengigkeiten und Reihenfolge

```
Block 4A.1 (Backend):
├── 4A.1.1 DB-Schema + Migration          ← ZUERST (alles andere braucht die Tabellen)
├── 4A.1.2 EmailService                    ← Parallel zu 4A.1.3
├── 4A.1.3 NotificationRouter              ← Parallel zu 4A.1.2
├── 4A.1.4 DigestService                   ← NACH 4A.1.3 (nutzt NotificationRouter)
├── 4A.1.5 REST-API                        ← NACH 4A.1.3 (nutzt NotificationRouter)
├── 4A.1.6 NotificationActionExecutor      ← NACH 4A.1.3 (nutzt NotificationRouter)
└── 4A.1.7 WebSocket-Events               ← NACH 4A.1.3 (in NotificationRouter integriert)

Block 4A.2 (Frontend):
├── 4A.2.1 API-Client                      ← ZUERST (Store braucht API)
├── 4A.2.2 Pinia Store                     ← NACH 4A.2.1
├── 4A.2.3 NotificationBadge              ← NACH 4A.2.2
├── 4A.2.4 NotificationDrawer             ← Parallel zu 4A.2.3
├── 4A.2.5 NotificationItem               ← Parallel zu 4A.2.3
├── 4A.2.6 NotificationPreferences        ← NACH 4A.2.2
└── 4A.2.7 WebSocket-Integration           ← NACH 4A.2.2

Block 4A.3 (Grafana):
├── 4A.3.1 Contact Point YAML             ← ZUERST
├── 4A.3.2 Notification Policy             ← NACH 4A.3.1
├── 4A.3.3 Webhook Endpoint               ← Parallel zu 4A.3.1 (Backend-seitig)
└── 4A.3.4 Alert-Kategorisierung           ← In 4A.3.3 integriert

Parallelisierung:
- 4A.1 und 4A.3 Backend-Teile PARALLEL (Webhook-Endpoint ist unabhaengig von NotificationRouter)
- 4A.2 Frontend NACH 4A.1 Backend (braucht funktionierende API)
- 4A.3 Grafana YAML kann jederzeit (nur Config-Dateien)
```

---

## Akzeptanzkriterien

### Basis (MUSS)

- [ ] **DB-Schema:** `notifications` und `notification_preferences` Tabellen existieren, Migration laeuft fehlerfrei
- [ ] **Test-Email:** `POST /v1/notifications/test-email` → Email kommt an (Resend ODER SMTP)
- [ ] **Notification-Router:** `NotificationCreate` → DB-Eintrag + WS-Broadcast in <200ms
- [ ] **REST-API:** Alle 9 Endpoints antworten korrekt (GET/PATCH/POST/PUT)
- [ ] **Unread-Count:** `GET /v1/notifications/unread-count` liefert korrekte Zahl
- [ ] **Badge:** NotificationBadge zeigt korrekte Anzahl, Farbe passt zur hoechsten Severity
- [ ] **Drawer:** NotificationDrawer oeffnet/schliesst, zeigt Notifications, Filter funktioniert
- [ ] **Als gelesen:** Klick auf "Als gelesen" → Badge-Zaehler sinkt sofort (WebSocket-Update)
- [ ] **Grafana-Webhook:** Alert in Grafana feuern → erscheint in Frontend-Inbox innerhalb 30s
- [ ] **Resolved:** Grafana sendet "resolved" → Notification wird als "resolved" markiert
- [ ] **Preferences:** Email ein/aus, Severity-Filter, Quiet Hours speichern + laden

### Erweitert (SOLLTE)

- [ ] **Digest:** 3+ Warning-Notifications innerhalb 1h → Digest-Email mit Zusammenfassung
- [ ] **Quiet Hours:** Keine Email zwischen 22:00-07:00 (wenn konfiguriert)
- [ ] **Deduplication:** Gleicher Grafana-fingerprint → kein Duplikat in Inbox
- [ ] **Browser-Notification:** Critical → Browser Notification API (wenn Permission erteilt)
- [ ] **Logic Engine:** Regel feuert → Notification erscheint in Inbox (NotificationActionExecutor)
- [ ] **Deep-Links:** "Zum Sensor" / "Zur Regel" / "In Grafana" Links funktionieren
- [ ] **ISA-18.2:** Bei normalem Betrieb < 6 Notifications/Stunde in der Inbox

### Tests

- [ ] Backend: Unit-Tests fuer NotificationRouter (route, preferences, digest, dedup)
- [ ] Backend: Integration-Test fuer Grafana-Webhook-Endpoint (firing + resolved)
- [ ] Backend: Integration-Test fuer REST-API (CRUD, read-all, preferences)
- [ ] Frontend: Vitest fuer notification-inbox.store (WS-Handler, markAsRead, filter)
- [ ] Bestehende Tests: **804+ Backend** + **1342+ Frontend** Tests duerfen NICHT brechen **[verify-plan: Zahlen aktualisiert auf letzten verified Stand]**

---

## Referenzen

### Life-Repo (Strategie + Wissen)

| Datei | Inhalt |
|-------|--------|
| `arbeitsbereiche/automation-one/roadmap-phase4-system-integration.md` | Phase 4A-E Roadmap, Code-Snippets, UI-Mockups |
| `arbeitsbereiche/automation-one/roadmap.md` | Gesamtplan, Phase 4 Ueberblick |
| `arbeitsbereiche/automation-one/STATUS.md` | Backend 95%, Frontend 95%, Monitoring 100% |
| `arbeitsbereiche/automation-one/architektur-uebersicht.md` | 3-Schichten-Design |
| `wissen/iot-automation/iot-alert-email-notification-architektur-2026.md` | Alert UX, SMTP vs Resend, ISA-18.2, Grafana Webhook (Basis-Recherche) |
| `wissen/iot-automation/notification-stack-implementierung-recherche-2026.md` | Implementierungs-Details, fastapi-mail, BackgroundTasks vs Celery, Digest (Ergaenzungs-Recherche) |
| `wissen/iot-automation/unified-alert-center-ux-best-practices.md` | Alert-Center Design (4 Ebenen, ThingsBoard-Pattern) |
| `wissen/iot-automation/diagnostics-hub-plugin-system-hil-testing-recherche-2026.md` | Plugin-System, Agent-UI (fuer Phase 4C/4D) |
| `arbeitsbereiche/automation-one/hardware-tests/PHASE_4_INTEGRATION.md` | Phase 4 aus Testinfrastruktur-Perspektive |

### Ziel-Repo (auto-one) — Bekannte Dateien

<!-- [verify-plan: Alle Pfade korrigiert auf tatsaechliche Codebase-Struktur] -->

| Datei (relativ zu Subprojekt) | Relevanz |
|-------|----------|
| `El Servador/.../src/services/logic/actions/notification_executor.py` | Bestehende SMTP/Webhook-Impl. durch NotificationRouter ersetzen |
| `El Servador/.../src/core/config.py` | `NotificationSettings`-Klasse um Resend-Felder erweitern |
| `El Servador/.../src/db/models/` | Neues Notification-Modell (+ `__init__.py` Import) |
| `El Servador/.../src/schemas/` | Neue Pydantic-Schemas (notification.py) |
| `El Servador/.../src/api/v1/` | Neue Router + `__init__.py` Registrierung |
| `El Frontend/src/shared/stores/notification.store.ts` | Bestehender Toast-Store (NICHT ersetzen, neuen Store daneben) |
| `El Frontend/src/shared/stores/` | Neuer notification-inbox.store.ts |
| `El Frontend/src/api/` | Neues API-Modul (notifications.ts) |
| `El Frontend/src/styles/tokens.css` | Design-Tokens: `--color-error`, `--color-warning`, `--color-info`, `--color-success` |
| `El Frontend/src/shared/design/primitives/SlideOver.vue` | Bestehende Primitive fuer Drawer nutzen |
| `El Frontend/src/shared/design/layout/TopBar.vue` | NotificationBadge einhaengen |
| `docker/grafana/provisioning/alerting/` | Contact-Point + Notification-Policy NEU (existieren noch nicht) |
| `El Servador/.../alembic/versions/` | Neue Migration (22 bestehende) |

### Wissenschaftliche Fundierung

| Paper | Kernaussage | Anwendung |
|-------|-------------|-----------|
| Rizk et al. (2020) | User-Aware Notification System, Event-Severity + Schedules | Quiet Hours, Digest-Logik |
| Saraswathi & Jeena (2025) | Dynamische Schwellenwert-Anpassung, -30% False-Positives | Sensor-Threshold-Alerts (4B) |
| Putra et al. (2024) | WebSocket schneller als MQTT fuer Real-Time Push-Notifications | WS fuer Frontend-Delivery |
| José et al. (2025) | IoT Dashboard mit Message Queue → WebSocket | Architektur-Validierung |
| Twabi et al. (2025, FrameMQ) | Pub/Sub Latenz 2300ms→400ms durch Optimization | Backend-Routing Latenz |
| ISA-18.2 / IEC 62682 | <6 Alarme/h, <5% Critical, >80% Actionable | Alert-Rate-Limits |

---

## Offene Punkte

1. **Resend Domain:** Robin muss eine Domain bei Resend verifizieren (z.B. `robin-herbig.de`). Alternativ: `onboarding@resend.dev` fuer Testing
2. **SMTP-Credentials:** Falls SMTP-Fallback genutzt wird: App-Passwort fuer Gmail/eigenen Server einrichten
3. **Multi-User:** Aktuell ist Robin der einzige User. Schema ist Multi-User-faehig, aber die erste Implementierung kann vereinfachen: `user_id = None` → "an alle Admins"
4. **Notification-Retention:** Wie lange sollen alte Notifications in der DB bleiben? Empfehlung: 90 Tage, dann automatisch archivieren (Job in DigestService)
5. **HMAC-Signatur:** Grafana-Webhook kann mit HMAC-SHA256 signiert werden. Fuer Produktions-Setup aktivieren, fuer Entwicklung optional
6. **Sound:** Critical-Alert-Sound im Frontend? Technisch moeglich (Web Audio API), UX-Frage
7. **Phase 4B Uebergang:** Der `NotificationRouter` ist die Grundlage fuer das Unified Alert Center (4B). Das `UnifiedAlert`-Interface aus 4B wird spaeter auf den `notifications`-Tabelle aufbauen. Sicherstellen dass `metadata` JSONB flexibel genug ist fuer 4B-Erweiterungen

---

## /verify-plan Ergebnis (2026-03-02)

**Plan:** Phase 4A Notification-Stack (Email-Service + Routing + Frontend-Inbox)
**Geprueft:** ~30 Pfade, 0 Agents, 4 Services, 9 Endpoints, 3 WS-Events, 2 DB-Tabellen, Grafana-Webhook

### Zusammenfassung der Korrekturen

| # | Kategorie | Schwere | Korrektur |
|---|-----------|---------|-----------|
| 1 | **DB-Schema** | KRITISCH | `user_id` ist `INTEGER` (nicht UUID), Tabelle heisst `user_accounts` (nicht `users`) |
| 2 | **API-Prefix** | KRITISCH | Alle URLs muessen `/api/v1/...` sein, nicht `/v1/...`. Grafana-Webhook-URL korrigiert |
| 3 | **NotificationExecutor** | HOCH | Ist KEIN Placeholder — hat volle SMTP + Webhook Implementierung. Refactoring-Strategie noetig |
| 4 | **Config-Pattern** | HOCH | Nutzt nested `NotificationSettings(BaseSettings)` Klasse. SMTP-Felder existieren BEREITS. Nur Resend-Felder hinzufuegen |
| 5 | **Frontend Store-Pfad** | HOCH | `shared/stores/` nicht `stores/`. Alle Frontend-Pfade von `/app/src/` auf `El Frontend/src/` korrigiert |
| 6 | **WS-Event-Konvention** | HOCH | Underscore (`notification_new`), nicht Doppelpunkt (`notification:new`). broadcast-Signatur korrigiert |
| 7 | **Icon-Library** | MITTEL | `Bell` aus `lucide-vue-next`, NICHT Heroicons (nicht installiert) |
| 8 | **Design-Tokens** | MITTEL | `--color-error/warning/info/success`, NICHT `--status-critical/warning/info/success` |
| 9 | **SlideOver** | MITTEL | Existierende Shared-Primitive nutzen (nicht eigene CSS-Transition) |
| 10 | **TopBar** | MITTEL | Header heisst `TopBar.vue`, nicht AppHeader/AppSidebar |
| 11 | **Schemas-Pfad** | MITTEL | Pydantic-Schemas nach `src/schemas/notification.py` (separates File, bestehendes Pattern) |
| 12 | **Router-Registrierung** | MITTEL | `src/api/v1/__init__.py` und `src/db/models/__init__.py` muessen erweitert werden (fehlte im Plan) |
| 13 | **Zahlen** | NIEDRIG | 20 Tabellen (nicht 19), 29 WS-Events (nicht 28), 5 Tabs (nicht 4), 804+ Tests (nicht 790+) |

### Fehlende Vorbedingungen

- [x] Grafana provisioning/alerting/ Verzeichnis existiert (mit alert-rules.yml + loki-alert-rules.yml)
- [x] WebSocket Manager mit broadcast-Pattern existiert
- [x] Pinia Store Setup-Pattern etabliert
- [x] API Router Registration Pattern in __init__.py etabliert
- [ ] `templates/email/` Verzeichnis muss NEU erstellt werden (existiert nirgends)
- [ ] `resend` Python-Package muss in requirements.txt/pyproject.toml hinzugefuegt werden
- [ ] `src/schemas/notification.py` muss NEU erstellt werden
- [ ] Frontend: `src/components/notifications/` Verzeichnis muss NEU erstellt werden

### Ergaenzungen (im Plan fehlend)

1. **`src/api/v1/__init__.py`** — Neue Router muessen dort registriert werden (analog zu bestehenden Zeilen 39-57)
2. **`src/db/models/__init__.py`** — Notification-Model muss importiert werden (analog zu Zeilen 9-26)
3. **`src/schemas/notification.py`** — Pydantic-Schemas gehoeren in eigene Datei (bestehendes Pattern, 20 Schema-Dateien existieren)
4. **BackgroundTasks vs asyncio.to_thread** — Codebase nutzt NICHT FastAPI BackgroundTasks. Bestehende Pattern: `asyncio.to_thread()` fuer blocking, `APScheduler` fuer periodic. DigestService sollte in bestehenden `_central_scheduler` integriert werden, nicht als eigener `asyncio.Task`

---

## Systemkontext-Analyse Fix-Log (2026-03-02)

> Ergebnis der Element-fuer-Element Analyse aller Phase-4A-Elemente gegen die tatsaechliche Codebase.
> **Status:** Alle 15 FIX-Eintraege + 5 PRUEFEN-Punkte analysiert und eingearbeitet.

### Angewandte Fixes (in diesem Dokument)

| Fix-ID | Prio | Was | Status |
|--------|------|-----|--------|
| **FIX-02** | HOCH | Severity `success` gestrichen. 3 Severity-Stufen: `critical/warning/info`. `resolved` ist STATUS (ISA-18.2 Lifecycle), nicht Severity | ✅ SQL-Block 4A.1.1 korrigiert |
| **FIX-03** | MITTEL | Category und Source sind GETRENNTE Dimensionen. Categories: `connectivity/data_quality/infrastructure/lifecycle/maintenance/security/system`. Sources: `grafana/logic_engine/mqtt_handler/sensor_threshold/device_event/autoops/manual/system` | ✅ SQL-Block 4A.1.1 korrigiert |
| **FIX-04** | MITTEL | TimestampMixin-Hinweis: `class Notification(Base, TimestampMixin)` liefert `created_at/updated_at` automatisch. NICHT nochmal im Model definieren. `read_at` ist eigenes Feld | ✅ SQL-Kommentar ergaenzt |
| **FIX-05** | HOCH | `email_enabled` vs. `smtp_enabled` Logik geklaert: `email_enabled` = Master-Switch, `smtp_enabled` = Provider-Switch | ✅ Config-Block ergaenzt |
| **FIX-07** | HOCH | `fingerprint VARCHAR(64)` als eigene Spalte mit Partial UNIQUE Index ergaenzt | ✅ SQL + Index ergaenzt |

### Fixes in anderen Dokumenten

| Fix-ID | Prio | Was | Datei | Status |
|--------|------|-----|-------|--------|
| **FIX-06** | KRITISCH | WS-Event-Naming: `notification:new` → `notification_new` (Underscore) | `PHASE_4_INTEGRATION copy.md` | ✅ 3 Stellen korrigiert |
| **FIX-10** | KRITISCH | UX-Auftrag Status → "ABSORBIERT durch Phase 4A+4B". Kein `useSystemHealthStore`, kein `AlertSlideOver`, kein `alert_update` Event | `auftrag-unified-monitoring-ux.md` | ✅ Status geaendert |
| **FIX-14** | HOCH | Grafana Webhook URL: `/v1/webhooks/grafana-alerts` → `/api/v1/webhooks/grafana-alerts` | `PHASE_4_INTEGRATION copy.md` | ✅ 3 Stellen korrigiert |
| **FIX-01** | KRITISCH | `user_id UUID → INTEGER`, `users → user_accounts` | `roadmap-phase4-system-integration.md` (Life-Repo, nicht im auto-one Repo) | ⚠️ EXTERN — User muss im Life-Repo korrigieren |

### Neue Dokumentations-Abschnitte (FIX-08, FIX-13, FIX-15)

#### FIX-08: WS-Event Migration (notification → notification_new)

**Aktueller Zustand (implementiert):**
- `esp.store.ts` registriert BEIDE Events nebeneinander:
  - `ws.on('notification', handleNotification)` → `notification.store.ts` (Toast-System, LEGACY)
  - `ws.on('notification_new', handleNotificationNew)` → `notification-inbox.store.ts` (Inbox)
- Der `NotificationRouter` im Backend broadcastet `notification_new` (korrekter Name)
- Der alte `NotificationActionExecutor` broadcastet `notification` (Legacy)

**Entscheidung:** Sauberer Schnitt. Der `NotificationActionExecutor` wird durch den `NotificationRouter` ersetzt (Block 4A.1.6). Nach Refactoring broadcastet nur noch der Router mit `notification_new`. Das alte `notification` Event entfaellt — Frontend-seitig bleibt der Handler fuer Abwaertskompatibilitaet bis zum naechsten Cleanup, funktioniert aber als Dead-Code.

#### FIX-09: alert_update Event (UX-Auftrag) entfaellt

Der UX-Auftrag (`auftrag-unified-monitoring-ux.md`, Status: ABSORBIERT) plante ein WS-Event `alert_update`. Dieses wird durch `notification_new` vollstaendig abgedeckt. Das Frontend unterscheidet via `source`-Feld (grafana, logic_engine, etc.). EIN Event fuer alles.

#### FIX-13: Event-Routing-Logik (Toast vs. Inbox)

**Explizite Routing-Matrix (implementiert in `esp.store.ts`):**

| WS-Event | Ziel-Store | Funktion | Zweck |
|----------|-----------|----------|-------|
| `notification` | `notification.store.ts` | `handleNotification()` | Toast-System (transient, legacy) |
| `error_event` | `notification.store.ts` | `handleErrorEvent()` | Error-Toast (transient) |
| `notification_new` | `notification-inbox.store.ts` | `handleWSNotificationNew()` | Persistente Inbox + Badge |
| `notification_updated` | `notification-inbox.store.ts` | `handleWSNotificationUpdated()` | Read/Archive Updates |
| `notification_unread_count` | `notification-inbox.store.ts` | `handleWSUnreadCount()` | Badge-Zaehler |

**Wichtig:** Toast-Pipeline (notification.store) und Inbox-Pipeline (notification-inbox.store) koexistieren. NICHT den alten Toast-Handler entfernen.

#### FIX-12: AlertSlideOver (UX-Auftrag) entfaellt

Der UX-Auftrag plante `AlertSlideOver.vue` (400px, Severity-gruppiert). Phase 4A baut stattdessen `NotificationDrawer.vue` (560px, Zeitgruppen, Filter-Tabs). NUR EIN Drawer. Phase 4B erweitert den Drawer optional — kein zweiter Drawer.

#### FIX-15: actuator_alert_handler.py Integration

**Aktuell:** `src/mqtt/handlers/actuator_alert_handler.py` verarbeitet 4 Alert-Types (emergency, runtime, safety, hardware) via MQTT. Diese werden per WebSocket broadcastet aber NICHT in der `notifications`-Tabelle persistiert.

**Integration nach Phase 4A:** Der `actuator_alert_handler` sollte den `NotificationRouter.route()` aufrufen mit:
- `source = "mqtt_handler"`
- `category`: emergency → `connectivity`, safety → `system`, runtime → `system`, hardware → `infrastructure`
- `severity`: emergency → `critical`, safety → `warning`, runtime → `warning`, hardware → `warning`

**Aufwand:** ~1h, als Block 4A.1.8 oder nachgelagerter Integrations-Schritt. Kein Scope-Creep — dies ist eine natuerliche Erweiterung des Routing-Patterns.

### PRUEFEN-Ergebnisse (Codebase-Verifikation 2026-03-02)

| ID | Frage | Ergebnis |
|----|-------|---------|
| **PRUEFEN-01** | APScheduler Typ | ✅ `AsyncIOScheduler` (`src/core/scheduler.py:107`). Kein ContextVar-Problem. Digest-Service kann `get_central_scheduler()` nutzen |
| **PRUEFEN-02** | Admin-only Decorator | ✅ `require_admin()` existiert in `deps.py:242`. Type-Alias: `AdminUser = Annotated[User, Depends(require_admin)]` in `deps.py:298`. Fuer POST /send: `user: AdminUser` als Parameter |
| **PRUEFEN-03** | Store-Initialisierung | ✅ `App.vue:34` ruft `notificationInboxStore.loadInitial()` auf. Pattern: onMounted() → store.init() |
| **PRUEFEN-04** | Zeitformatierungs-Lib | ✅ `date-fns` v4.1.0 installiert. `formatDistanceToNow` + `de` Locale bereits genutzt in `RuleCard.vue`. `NotificationItem.vue` hat bereits `relativeTime` Computed |
| **PRUEFEN-05** | Grafana Provisioning | ✅ `docker/grafana/provisioning/alerting/` existiert. Dateien vorhanden: `contact-points.yml` (korrekte URL), `notification-policies.yml`, `alert-rules.yml`, `loki-alert-rules.yml` |

### FIX-11: Farb-Token-Naming Ergebnis

**Verifiziert in `tokens.css`:**
- `--color-error: #f87171` (Zeile 67) — Standard rot
- `--color-warning: #fbbf24` (Zeile 66) — Standard amber
- `--color-status-alarm: #ef4444` (Zeile 210) — Semantisches Alias rot
- `--color-status-warning: #eab308` (Zeile 209) — Semantisches Alias gelb

**Empfehlung:** `--color-error/warning/info/success` verwenden (garantiert vorhanden). Die `--color-status-*` Tokens existieren AUCH, sind aber leicht andere Farbnuancen (status-alarm ist red-500 vs error ist red-400). Fuer Phase 4A: Standardtokens `--color-error/warning` verwenden — konsistent mit dem implementierten Code.

### Scope-Abgrenzung (Phase 4A aendert NICHT)

| Komponente | Warum nicht | Wann |
|-----------|------------|------|
| `SystemMonitorView.vue` | Scope-Creep, gehoert in Phase 4D (Diagnostics Hub) | Phase 4D |
| `AlarmListWidget.vue` | Dashboard-Widget bleibt unabhaengig, wird in 4B erweitert | Phase 4B |
| `actuator_alert_handler.py` | Nur Routing-Vorbereitung dokumentiert (FIX-15), Implementierung als 4A.1.8 | Phase 4A.1.8 |
| `useSystemHealthStore` | UX-Auftrag ABSORBIERT (FIX-10), kommt als `alert-center.store` in 4B | Phase 4B |
| `AlertSlideOver.vue` | UX-Auftrag ABSORBIERT (FIX-12), NotificationDrawer reicht | Phase 4B |
5. **`esp.store.ts` WS-Dispatcher** — Neue Events muessen in der Dispatcher-Switch-Logik (Zeilen ~1522-1551) registriert und an `notification-inbox.store` delegiert werden
6. **AccordionSection.vue** — Existiert in shared/design/primitives/ und kann fuer die Preferences-Zonen genutzt werden
7. **Grafana `grafana.ini`** — Hat `unified_alerting.enabled = true` bereits gesetzt. Webhook-Authentication (HMAC) erfordert zusaetzliche ini-Einstellung

### Zusammenfassung fuer TM

Der Plan ist architektonisch solide und gut recherchiert. Die Hauptprobleme sind **technische Diskrepanzen** zwischen Plan-Annahmen und tatsaechlichem Systemzustand — insbesondere:

1. Der `NotificationActionExecutor` ist **kein Placeholder** sondern hat eine vollstaendige SMTP-Implementierung. Die Refactoring-Strategie muss angepasst werden.
2. Alle **Pfade, Typen und Konventionen** wurden an die echte Codebase angepasst (user_id: int, API-Prefix, Store-Pfade, WS-Events, Design-Tokens).
3. **Fehlende Registrierungen** in `__init__.py` Dateien wurden ergaenzt.

Nach Einarbeitung der Korrekturen ist der Plan **ausfuehrbar**. Die Reihenfolge (DB → Services → API → Frontend → Grafana) ist korrekt.
