# Auftrag: Phase 4A — Notification-Stack + Quick Action Ball + Alert-Konfiguration

**Ziel-Repo:** auto-one
**Kontext:** Erster Baustein von Phase 4 (System-Integration). Notification-Routing + Email-Service + Frontend-Inbox sind die Grundlage fuer Alert Center (4B), Plugin-System (4C) und alle weiteren Benachrichtigungen. Der Quick Action Ball ist die primaere Frontend-Oberflaeche fuer Notifications und Alerts — global erreichbar, kontextabhaengig, mit integriertem Alert-Panel. Dazu kommt Per-Sensor-Alert-Konfiguration und Component-Tab-Erweiterung (Hardware-Info + Runtime). Robins Vision: "E-Mail-Postfach, Frontend-Kontrolle ueber das ganze System."
**Prioritaet:** Hoch
**Datum:** 2026-03-02
**Aufwand:** ~50-65h (8 Bloecke, 3 Gruppen)

### Aufbau: 3 Gruppen

| Gruppe | Bloecke | Aufwand | Beschreibung |
|--------|---------|---------|-------------|
| **Gruppe 1: Backend + Inbox** | 4A.1 – 4A.3 | ~15-20h | NotificationRouter, Email-Service, Frontend-Inbox, Grafana-Webhook |
| **Gruppe 2: Quick Action Ball** | 4A.4 – 4A.6 | ~16-21h | FAB-Komponente, Quick Alert Panel, Quick Navigation + Dashboard-Widget Actions |
| **Gruppe 3: Alert-Config + Component Tab** | 4A.7 – 4A.8 | ~15-20h | Per-Sensor/Device Alert-Konfiguration, Hardware-Info + Runtime & Maintenance |

---

## Ist-Zustand

### Was bereits existiert

**Backend (El Servador):**
- `NotificationActionExecutor` in `El Servador: src/services/logic/actions/notification_executor.py` — [VERIFIZIERT] **Alle 3 Kanaele bereits VOLL implementiert:** WebSocket (`ws_manager.broadcast`), Email (SMTP via `smtplib` + `asyncio.to_thread`), Webhook (`httpx.AsyncClient` POST). Gated auf `settings.notification.smtp_enabled`. Docstring sagt "placeholder", aber Code ist komplett. **Refactoring-Strategie:** Bestehende Implementierung durch NotificationRouter WRAPPEN oder ERSETZEN, nicht "Placeholder fuellen"
- `actuator_alert_handler.py` — 4 Alert-Types (emergency, runtime, safety, hardware) via MQTT
- `SensorConfig.thresholds` — JSON-Feld mit critical_high/low, warning_high/low, enable_alerts (existiert, wird aber NICHT automatisch geroutet)
- `GET /v1/health/detailed` — Server, DB, MQTT, Container-Status
- `GET /v1/audit` — Alle System-Events (Audit-Log)
- `GET /v1/errors` — Aggregierte Fehler
- WebSocket Manager (`El Servador: src/websocket/manager.py`) — [VERIFIZIERT] 29 Event-Types, Singleton via `WebSocketManager.get_instance()`, Signatur: `broadcast(message_type: str, data: dict)`. Rate-Limit 10 msg/s pro Client, Thread-Safe via `broadcast_threadsafe()`
- User-Management — [VERIFIZIERT] `user.py` Model, Tabelle `user_accounts`, PK `id: int` (auto-increment, NICHT UUID). Auth-API mit JWT, 3 Rollen: admin/operator/viewer
- Logic Engine — 4 Condition-Evaluatoren + 4 Action-Executoren (inkl. `notification`)
- PostgreSQL — [VERIFIZIERT] 20 Tabellen, 22 Alembic-Migrationen. DB-Base: `class Model(Base, TimestampMixin)`, TimestampMixin liefert `created_at`/`updated_at` automatisch
- Config — [VERIFIZIERT] Nested `NotificationSettings(BaseSettings)` Klasse (Zeile 248-267). SMTP-Felder existieren BEREITS: `smtp_enabled`, `smtp_host`, `smtp_port`, `smtp_username`, `smtp_password`, `smtp_use_tls`, `smtp_from`. Zugriff via `settings.notification.smtp_host`
- Codebase nutzt NICHT FastAPI `BackgroundTasks`. [VERIFIZIERT] Bestehende Patterns: `asyncio.to_thread()` fuer blocking I/O, `APScheduler` (`_central_scheduler`) fuer periodische Tasks

**Frontend (El Frontend):**
- `notification.store.ts` in `El Frontend: src/shared/stores/notification.store.ts` — [VERIFIZIERT] Toast-System (error/warning/success/info), NUR Toasts, keine Inbox, kein persistenter State. Toast-Composable `useToast()` ist ein separater Singleton in `src/composables/useToast.ts` (kein Pinia-Store)
- `ToastContainer.vue` + `useToast()` — In-App-Notifications
- `AlarmListWidget.vue` — Sensor-Quality-Alerts als Dashboard-Widget
- `SystemMonitorView.vue` — [VERIFIZIERT] 5 Tabs (Events, Logs, Database, MQTT, Health). **⚠️ Grafana-Deeplink fehlt (verify-plan 2026-03-02):** Tiefergehende System-Diagnostik und Logs liegen in Grafana (localhost:3000). Ein Link/Button dorthin muss im HealthTab oder als eigener Tab im SystemMonitorView ergaenzt werden.
- API-Layer — [VERIFIZIERT] 20 Module in `src/api/`. Pattern: `export const {domain}Api = { ... }` oder benannte Exports. Nutzt `api` axios-Instance aus `./index` mit JWT-Auth + Interceptor. Basis-URL: `/api/v1`
- Design-System — [VERIFIZIERT] `tokens.css` mit Status-Farben: `--color-error` (rot), `--color-warning` (amber), `--color-info` (blau), `--color-success` (gruen)
- Icon-Library — [VERIFIZIERT] Projekt nutzt ausschliesslich `lucide-vue-next` (108 Imports). Heroicons ist NICHT installiert
- Shared Primitives — [VERIFIZIERT] `SlideOver.vue` in `src/shared/design/primitives/SlideOver.vue` (Props: `open`, `title`, `width: 'sm'|'md'|'lg'`; Features: ESC, Backdrop-Click, Body-Scroll-Lock, Teleport). `AccordionSection.vue` in `src/shared/design/primitives/`
- Layout — [VERIFIZIERT] Header heisst `TopBar.vue` in `src/shared/design/layout/TopBar.vue`. Layout rechts: [+Mock] [Pending] | [ColorLegend] [NOT-AUS] | [Dot] [User]
- Store-Pfade — [VERIFIZIERT] Stores gehoeren in `src/shared/stores/` (einzige Ausnahme: `esp.ts`)
- WebSocket — `websocketService` Singleton (`src/services/websocket.ts`). `esp.store.ts` ist der primaere Dispatcher (Zeilen ~1522-1551) fuer alle 29 Event-Types. Neue Events muessen dort registriert werden

**Monitoring:**
- 38/38 Grafana-Alerts aktiv (32 Prometheus + 6 Loki, 9 Gruppen)
- Grafana Contact Points — NUR Default (kein Webhook konfiguriert)
- Prometheus + Loki + Alloy + cAdvisor + Exporter — alles laeuft
- `grafana.ini` hat `unified_alerting.enabled = true` bereits gesetzt

### Was fehlt

1. **Keine `notifications` Tabelle** — Benachrichtigungen werden nirgends persistiert
2. **Kein zentraler Email-Service** — Bestehende SMTP-Implementierung in `NotificationActionExecutor` funktioniert, ist aber direkt an die Logic Engine gekoppelt (nicht wiederverwendbar). Kein Resend-Support, kein Template-System, kein Dual-Provider
3. **Kein Notification-Router** — Keine zentrale Stelle die entscheidet WO eine Nachricht hingeht (Kanal-Routing, Preferences, Digest)
4. **Kein Frontend-Inbox** — Nur Toasts, kein Bell-Badge, kein Drawer, kein Postfach
5. **Kein Grafana-Webhook** — Alerts bleiben in Grafana, Backend weiss nichts davon
6. **Keine User-Preferences** — Kein Quiet-Hours, kein Email-ein/aus, kein Severity-Filter

---

## Was getan werden muss

Robin bekommt ein vollstaendiges Benachrichtigungs- und Alert-Management-System:

**Gruppe 1 — Backend + Inbox:**
1. **Backend:** Zentraler Notification-Router der JEDE System-Benachrichtigung empfaengt, in die DB schreibt, und ueber konfigurierbare Kanaele (WebSocket, Email, Webhook) weiterleitet
2. **Email:** Resend-API als Primary Provider (3.000 Emails/Monat frei), SMTP als Fallback. Nicht-blockierend. Digest-Logik fuer Warning-Batching (ISA-18.2 konform: <6 Alarme/h, >80% Actionable)
3. **Frontend:** Bell-Badge in der TopBar mit Unread-Counter, Notification-Drawer (rechts einblendbar via bestehendem `SlideOver.vue`), Preferences-Panel
4. **Grafana-Integration:** Webhook Contact Point der alle 38 Alerts an das Backend routet. Email-Versand backend-seitig (nicht via Grafana SMTP), weil Backend User-Preferences, Digest-Logik und Quiet Hours hat

**Gruppe 2 — Quick Action Ball:**
5. **Quick Action Ball:** Subtiler, global erreichbarer FAB (Bottom-Right, 44px) der kontextabhaengige Schnellaktionen bietet — Alerts verwalten, Notifications pruefen, Widgets einfuegen, zwischen Views navigieren. Glassmorphism-Styling passend zum Design-Token-System
6. **Quick Alert Panel:** Kompaktes Alert-Management-Panel im Quick Action Ball — aktive Alerts mit Ack/Mute/Navigate, Deep-Links zu betroffenen Devices
7. **Quick Navigation + Dashboard-Widget Actions:** MRU-Navigation, Favoriten, Dashboard-Widgets per Drag & Drop aus dem FAB

**Gruppe 3 — Alert-Config + Component Tab:**
8. **Per-Sensor/Device Alert-Konfiguration:** Master-Toggle, Suppression mit Grund + Zeitfenster (automatisches Re-Enable), Custom-Thresholds, Severity-Override, Notification-Channel-Override. Device-Level Suppression propagiert zu Kindern
9. **Component Tab Erweiterung:** Hardware-Info (Hersteller, Modell, Seriennummer, Datenblatt-Link) + Runtime & Maintenance (Betriebsstunden, Wartungsintervall, Wartungshistorie)

**Erwartetes Ergebnis:** Robin sieht im Frontend sofort wenn etwas passiert — der Quick Action Ball pulsiert rot bei Critical, der Badge zeigt die Anzahl. Er kann das Alert-Panel oeffnen, Alerts bestaetigen oder stumm schalten, direkt zum betroffenen Sensor navigieren. Per Email kommen kritische Alerts, Warnings als Digest. Pro Sensor kann Robin Alerts gezielt ein/ausschalten mit begruendeter Suppression.

---

## Technische Details

### Betroffene Schichten

- [x] Backend (El Servador) — Neues DB-Modell, 3 neue Services, 1 neuer API-Router, Alembic-Migration
- [ ] Firmware (El Trabajante) — NICHT betroffen
- [x] Frontend (El Frontend) — 3 neue Komponenten, 1 neuer Store, 1 neues API-Modul
- [x] Monitoring (Grafana) — Webhook Contact Point + Notification Policy konfigurieren

### Betroffene Module

| Schicht | Modul (Pfad relativ zum Subprojekt) | Aenderung |
|---------|-------|-----------|
| Backend | `El Servador: src/services/email_service.py` | **NEU** — Dual-Provider (Resend + SMTP) |
| Backend | `El Servador: src/services/notification_router.py` | **NEU** — Zentraler Router |
| Backend | `El Servador: src/services/digest_service.py` | **NEU** — Warning-Digest-Timer |
| Backend | `El Servador: src/db/models/notification.py` | **NEU** — DB-Modell (Pattern: `class X(Base, TimestampMixin)`) |
| Backend | `El Servador: src/schemas/notification.py` | **NEU** — Pydantic-Schemas (bestehendes Pattern: separate schemas/-Datei, 20 existieren) |
| Backend | `El Servador: src/api/v1/notifications.py` | **NEU** — REST-API (9 Endpoints), prefix="/v1/notifications" |
| Backend | `El Servador: src/api/v1/webhooks.py` | **NEU** — Grafana Webhook Endpoint, prefix="/v1/webhooks" |
| Backend | `El Servador: src/core/config.py` | **ERWEITERN** — Bestehende `NotificationSettings`-Klasse um Resend-Felder ergaenzen (nested, NICHT flach) |
| Backend | `El Servador: src/services/logic/actions/notification_executor.py` | **REFACTOR** — Bestehende SMTP/Webhook-Implementierung durch NotificationRouter ersetzen |
| Backend | `El Servador: src/api/v1/__init__.py` | **ERWEITERN** — Neue Router registrieren (`notifications_router`, `webhooks_router`) via `include_router()` |
| Backend | `El Servador: src/db/models/__init__.py` | **ERWEITERN** — Notification-Model importieren (damit Alembic es erkennt) |
| Backend | `El Servador: alembic/versions/` | **NEU** — Migration fuer 2 Tabellen |
| Backend | `El Servador: templates/email/` | **NEU** — Verzeichnis + 3 Jinja2 Email-Templates (existiert noch NICHT) |
| Backend | `El Servador: requirements.txt` oder `pyproject.toml` | **ERWEITERN** — `resend` Package hinzufuegen |
| Frontend | `El Frontend: src/shared/stores/notification-inbox.store.ts` | **NEU** — Inbox Pinia Store |
| Frontend | `El Frontend: src/components/notifications/NotificationBadge.vue` | **NEU** — Bell-Icon + Badge (Verzeichnis existiert noch NICHT) |
| Frontend | `El Frontend: src/components/notifications/NotificationDrawer.vue` | **NEU** — Drawer (nutzt bestehendes `SlideOver.vue` Primitive) |
| Frontend | `El Frontend: src/components/notifications/NotificationItem.vue` | **NEU** — Einzel-Item |
| Frontend | `El Frontend: src/components/notifications/NotificationPreferences.vue` | **NEU** — Settings |
| Frontend | `El Frontend: src/api/notifications.ts` | **NEU** — API-Client |
| Frontend | `El Frontend: src/shared/design/layout/TopBar.vue` | **ERWEITERN** — NotificationBadge einhaengen |
| Frontend | `El Frontend: src/stores/esp.ts` (WS-Dispatcher) | **ERWEITERN** — 3 neue Events im Dispatcher registrieren |
| Monitoring | `docker/grafana/provisioning/alerting/contact-points.yml` | **NEU** — Webhook CP |
| Monitoring | `docker/grafana/provisioning/alerting/notification-policies.yml` | **NEU** — Policy |

---

## Block 4A.1: Email-Service Backend (~6-8h)

### 4A.1.1: Datenbank-Schema (2 neue Tabellen)

**Tabelle `notifications`:**
```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES user_accounts(id),  -- [VERIFIZIERT] int PK, Tabelle user_accounts
    channel VARCHAR(20) NOT NULL,          -- 'email', 'websocket', 'webhook', 'inbox'
    severity VARCHAR(20) NOT NULL,         -- 'critical', 'warning', 'info', 'success'
    category VARCHAR(50) NOT NULL,         -- 'sensor_alert', 'device_event', 'infrastructure',
                                           -- 'rule_execution', 'system', 'manual'
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',           -- esp_id, sensor_type, rule_id, grafana_fingerprint,
                                           -- correlation_id, zone_name, values
    source VARCHAR(50) NOT NULL,           -- 'grafana', 'logic_engine', 'mqtt_handler',
                                           -- 'sensor_threshold', 'device_event', 'manual'
    is_read BOOLEAN DEFAULT FALSE,
    is_archived BOOLEAN DEFAULT FALSE,
    digest_sent BOOLEAN DEFAULT FALSE,     -- Fuer Warning-Digest-Tracking
    parent_notification_id UUID REFERENCES notifications(id),  -- Root-Cause Korrelation
    created_at TIMESTAMPTZ DEFAULT NOW(),
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
```

**Tabelle `notification_preferences`:**
```sql
CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES user_accounts(id),  -- [VERIFIZIERT] int PK
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

**Registrierung nach Implementierung:**
- [ ] Model in `El Servador: src/db/models/__init__.py` importieren (analog zu bestehenden Zeilen 9-26, damit Alembic es erkennt)

### 4A.1.2: Email-Service (Dual-Provider)

**Datei:** `El Servador: src/services/email_service.py`

**Architektur-Entscheidung:**
- **Resend als Primary** — API-Key in `.env`, `pip install resend`, minimale API-Flaeche. Free Tier: 3.000 Emails/Monat, 100/Tag, 2 req/s Rate-Limit (ausreichend fuer Alert-Emails). Automatisches SPF/DKIM/DMARC, Dashboard fuer Debugging
- **SMTP als Fallback** (via bestehende fastapi-mail/aiosmtplib) — Wenn `RESEND_API_KEY` leer aber `SMTP_HOST` gesetzt. Ermoeglicht spaeter Wechsel auf eigenen SMTP-Server (z.B. Postfix in Docker) ohne Code-Aenderungen
- **Warum Dual-Provider statt nur Resend:** Robin kann spaeter self-hosted gehen. Resend fuer jetzt (einfach), SMTP fuer spaeter (unabhaengig)
- **Kein Celery/ARQ noetig** — Email-Versand ist ein <3s Task. Kein Redis im Stack, 13 Container sind bereits viel. [ANGENOMMEN] Bestehender `_central_scheduler` (APScheduler) fuer periodische Tasks nutzen statt eigenen `asyncio.Task` — Agent muss pruefen wie der Scheduler angebunden ist

**Config-Erweiterung (`El Servador: src/core/config.py`):**

[VERIFIZIERT] SMTP-Felder existieren BEREITS in der nested `NotificationSettings`-Klasse. NUR diese Felder muessen HINZUGEFUEGT werden:

```python
# In bestehender NotificationSettings-Klasse ergaenzen:
class NotificationSettings(BaseSettings):
    # --- BEREITS VORHANDEN (NICHT nochmal anlegen): ---
    # smtp_enabled, smtp_host, smtp_port, smtp_username, smtp_password, smtp_use_tls, smtp_from
    # webhook_timeout_seconds

    # --- NEU HINZUFUEGEN: ---
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_enabled: bool = Field(default=False, alias="EMAIL_ENABLED")  # Master-Switch
    email_from: str = Field(default="AutomationOne <alerts@robin-herbig.de>", alias="EMAIL_FROM")
    email_template_dir: str = Field(default="templates/email", alias="EMAIL_TEMPLATE_DIR")
```

**Email-Service Pattern:**
```python
class EmailService:
    async def send(self, to: str, subject: str, html: str) -> bool:
        if not settings.notification.email_enabled:  # Nested access!
            return False
        try:
            if settings.notification.resend_api_key:
                return await self._send_resend(to, subject, html)
            elif settings.notification.smtp_host:
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

**Registrierung nach Implementierung:**
- [ ] `resend` in `requirements.txt` oder `pyproject.toml` hinzufuegen
- [ ] `templates/email/` Verzeichnis erstellen (existiert noch nicht)

### 4A.1.3: Notification-Router (Kern-Service)

**Datei:** `El Servador: src/services/notification_router.py`

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
        # [VERIFIZIERT] broadcast-Signatur: broadcast(message_type: str, data: dict)
        # [VERIFIZIERT] Event-Naming: Underscore-Konvention (sensor_data, actuator_status, etc.)
        if prefs.websocket_enabled:
            await self.ws_manager.broadcast(
                "notification_new",  # Underscore-Konvention, KEIN Doppelpunkt
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

**Datei:** `El Servador: src/services/digest_service.py`

**Digest-Logik (recherche-fundiert, ISA-18.2 + SuprSend Best Practices):**

| Trigger | Delivery | Begruendung |
|---------|----------|-------------|
| severity=critical | Sofort (<30s) | Sofortiges Handeln noetig |
| severity=warning (erste des Tages) | Sofort | Kontext-Bewusstsein herstellen |
| severity=warning (Folge) | Digest alle 60 Min wenn ≥3 aktiv | Kein Email-Overload. ISA-18.2 empfiehlt <6 Alarme/h fuer Bediener |
| severity=info | Kein Email | Nur Inbox + Badge |
| status=resolved (nach Critical) | Optional sofort | Bestaetigung |

**Implementierung:**
- [ANGENOMMEN] In bestehenden `_central_scheduler` (APScheduler) integrieren statt als eigenen `asyncio.Task` starten — Agent muss pruefen wie periodische Tasks im System registriert werden
- Laeuft im Hintergrund, prueft alle 60 Minuten (konfigurierbar per `digest_interval_minutes`)
- Holt alle `notifications` mit `severity='warning' AND digest_sent=FALSE AND created_at > now() - interval`
- Wenn `count >= digest_min_count`: Email-Digest senden, `digest_sent=TRUE` setzen
- Respektiert Quiet Hours (22:00-07:00 keine Digests)

**Deduplication-Strategie:**

| Methode | Wann | Wie |
|---------|------|-----|
| **Fingerprint-Dedup** | Gleicher Grafana-Alert feuert nochmal | `fingerprint` als UNIQUE KEY in `notifications` |
| **Zeitfenster-Dedup** | Gleiche Quelle+Kategorie innerhalb 60s | GROUP BY source+category WHERE created_at > now()-60s |
| **Kaskaden-Suppression** | MQTT-down verursacht Sensor-Stale | `parent_notification_id` FK auf `notifications.id` |

### 4A.1.5: REST-API Endpoints

**Datei:** `El Servador: src/api/v1/notifications.py` — `router = APIRouter(prefix="/v1/notifications", tags=["notifications"])`

Router-Prefix "/v1/notifications" + main.py "/api" = volle URL `/api/v1/notifications/...`. Frontend-API-Client nutzt Basis `/api/v1`.

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

**Pydantic-Schemas** (in `El Servador: src/schemas/notification.py`, separate Datei nach bestehendem Pattern — 20 Schema-Dateien existieren):

```python
class NotificationCreate(BaseModel):
    severity: Literal["critical", "warning", "info", "success"]
    category: str
    title: str = Field(max_length=255)
    body: str
    metadata: dict = {}
    source: str
    user_id: int | None = None  # None = an alle Admins. [VERIFIZIERT] int weil user_accounts.id = int

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

**Registrierung nach Implementierung:**
- [ ] Router in `El Servador: src/api/v1/__init__.py` registrieren via `include_router()` (analog zu bestehenden Zeilen 39-57)
- [ ] Pydantic-Schemas als eigene Datei in `src/schemas/notification.py` anlegen

### 4A.1.6: NotificationActionExecutor refactoren

**Datei:** `El Servador: src/services/logic/actions/notification_executor.py`

[VERIFIZIERT] Die bestehende Implementierung hat:
- `_send_email_notification()`: Voll funktional via `smtplib.SMTP` + `asyncio.to_thread()`, liest `settings.notification.smtp_*`
- `_send_webhook_notification()`: Voll funktional via `httpx.AsyncClient` POST
- `_send_websocket_notification()`: Voll funktional via `ws_manager.broadcast("notification", ...)`

**Refactoring-Strategie:** `__init__` um `notification_router` Parameter erweitern, dann die Channel-Methoden durch Router-Aufrufe ersetzen:

```python
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

In den bestehenden WebSocket-Manager einhaengen. Event-Namen folgen der bestehenden Underscore-Konvention (z.B. `sensor_data`, `actuator_status`):

| Event (message_type) | Payload (data dict) | Wann |
|-------|---------|------|
| `notification_new` | `NotificationResponse` | Neue Notification erstellt |
| `notification_updated` | `{id, is_read, read_at}` | Notification gelesen/archiviert |
| `notification_unread_count` | `{count: int}` | Unread-Counter geaendert |

---

## Block 4A.2: Frontend Email-Inbox (~5-7h)

### 4A.2.1: API-Client

**Datei:** `El Frontend: src/api/notifications.ts`

Analog zu bestehenden API-Modulen (health.ts, logs.ts). Nutzt bestehenden `api` axios-Instance aus `./index` mit JWT-Auth + Interceptor. Import: `import api from './index'`, Basis-URL `/api/v1`. Pattern: benannte Exports oder `export const notificationsApi = { ... }`.

### 4A.2.2: Pinia Store

**Datei:** `El Frontend: src/shared/stores/notification-inbox.store.ts`

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

  // WebSocket-Handler (wird vom WS-Dispatcher in esp.store.ts aufgerufen)
  function handleWSEvent(data: any) {
    switch (data.type) {
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

**Datei:** `El Frontend: src/components/notifications/NotificationBadge.vue`
**Groesse:** ~80 Zeilen

- Bell-Icon: `Bell` aus `lucide-vue-next` (bestehende Icon-Library des Projekts)
- Badge mit Zaehler (max "99+")
- Farbe: `var(--color-error)` wenn Critical aktiv, `var(--color-warning)` bei Warning, sonst neutral (bestehende Design-Tokens aus `tokens.css`)
- CSS `@keyframes pulse` bei neuer Critical-Notification
- Klick togglet `isDrawerOpen` im Store
- **Position:** In `TopBar.vue` rechts, zwischen `EmergencyStopButton` und `ConnectionDot`

### 4A.2.4: NotificationDrawer

**Datei:** `El Frontend: src/components/notifications/NotificationDrawer.vue`
**Groesse:** ~250-300 Zeilen

- Bestehendes `SlideOver.vue` Primitive mit `width="lg"` (560px) verwenden — NICHT eigene CSS-Transition bauen
- Header: "Benachrichtigungen" + Zahnrad-Icon (→ Preferences) + "Alle gelesen"-Button
- Filter-Tabs: Alle | Kritisch | Warnungen | System (analog zu bestehenden ViewTabBar-Tabs)
- Notification-Liste: Gruppiert nach Heute/Gestern/Aelter
- Empty State: "Keine Benachrichtigungen" mit Bell-Icon
- Lazy-Loading: Erste 50 laden, "Mehr laden"-Button am Ende
- Click-Outside oder Escape schliesst Drawer (SlideOver-Feature)

### 4A.2.5: NotificationItem

**Datei:** `El Frontend: src/components/notifications/NotificationItem.vue`
**Groesse:** ~120 Zeilen

- Severity-Dot links (Farbe aus `tokens.css`: `--color-error`, `--color-warning`, `--color-info`, `--color-success`)
- Titel (fett wenn ungelesen) + Beschreibung (1 Zeile, truncated)
- Relative Zeit rechts ("vor 5 Min", "vor 1h")
- Expandierbar: Details (Quelle, ESP, Zone, Correlation-ID, Deep-Links)
- Action-Buttons: "Als gelesen" / "Zum Sensor" / "Zur Regel" / "In Grafana"
- Hover-State: Bestehende Design-Konventionen folgen (glass-panel oder dark-800 Variante — Agent prueft was im Projekt ueblich ist)

### 4A.2.6: NotificationPreferences

**Datei:** `El Frontend: src/components/notifications/NotificationPreferences.vue`
**Groesse:** ~180 Zeilen

- Bestehende `SlideOver.vue` oder `BaseModal.vue` verwenden (beide in `shared/design/`). `AccordionSection.vue` fuer die Zonen nutzen
- **Basic-Zone:**
  - Toggle: Email-Benachrichtigungen ein/aus
  - Email-Adresse (Input)
  - Checkboxen: Welche Severities per Email (Critical, Warning, Info)
- **Advanced-Zone (Accordion):**
  - Quiet Hours: ein/aus + Start/Ende (TimePicker)
  - Digest-Intervall: 15/30/60/120 Min (Dropdown)
  - Browser-Notifications: ein/aus (mit Permission-Request)
- **Expert-Zone (optional, spaeter):**
  - Webhook-URL + ein/aus
  - Kategorie-Filter

### 4A.2.7: WebSocket-Integration

In den bestehenden WebSocket-Handler einhaengen — KEIN separater Socket. Die 3 neuen Events (`notification_new`, `notification_updated`, `notification_unread_count`) muessen im WS-Dispatcher von `esp.store.ts` (Zeilen ~1522-1551) registriert und an den `notification-inbox.store` delegiert werden — analog zu `useNotificationStore().handleNotification()`.

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

**Registrierung nach Implementierung:**
- [ ] `El Frontend: src/components/notifications/` Verzeichnis erstellen
- [ ] WS-Events im Dispatcher (`esp.store.ts` Zeilen ~1522-1551) registrieren
- [ ] NotificationBadge in `TopBar.vue` einhaengen
- [ ] Store in App-Initialisierung laden (`loadInitial()`)

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
          url: http://el-servador:8000/api/v1/webhooks/grafana-alerts  # /api/ Prefix beachten!
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

**Architektur-Entscheidung:** Email NICHT ueber Grafana Contact Point, sondern Backend-seitig. Gruende:
- Backend hat User-Preferences, Digest-Logik, Quiet Hours
- Grafana braucht keine SMTP-Credentials
- Einfachere Konfiguration (nur 1 Contact Point: Webhook)
- Backend-Email-Logic testbar ohne Grafana

### 4A.3.3: Backend Webhook-Endpoint

**Datei:** `El Servador: src/api/v1/webhooks.py` — `router = APIRouter(prefix="/v1/webhooks", tags=["webhooks"])`

```python
# Router-Prefix "/v1/webhooks" + main.py "/api" = volle URL /api/v1/webhooks/grafana-alerts
@router.post("/grafana-alerts")
async def receive_grafana_alert(
    request: Request,
    payload: GrafanaWebhookPayload,
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

**Pydantic-Modell fuer Grafana-Payload** (in `El Servador: src/schemas/notification.py` oder eigene `src/schemas/grafana.py`):

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

**Grafana-Payload-Referenz (vollstaendiges Beispiel, Grafana 11.x+):**
```json
{
  "receiver": "automationone-webhook",
  "status": "firing",
  "orgId": 1,
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "SensorDataStale",
        "severity": "warning",
        "esp_id": "ESP_472204",
        "sensor_type": "sht31",
        "grafana_folder": "AutomationOne"
      },
      "annotations": {
        "summary": "Sensor SHT31 auf ESP_472204 liefert seit 5 Min keine Daten",
        "description": "Letzter Wert: 22.3°C um 14:07 UTC"
      },
      "startsAt": "2026-03-02T14:12:00.000Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "a1b2c3d4e5f6",
      "values": { "B": 0, "C": 1 }
    }
  ],
  "groupLabels": { "grafana_folder": "AutomationOne", "alertname": "SensorDataStale" },
  "commonLabels": { "alertname": "SensorDataStale", "severity": "warning" },
  "version": "1",
  "title": "[FIRING:1] SensorDataStale"
}
```

### 4A.3.4: Alert-Kategorisierung

```python
def _categorize_alert(alert: GrafanaAlert) -> str:
    """Grafana-Alert → AutomationOne-Kategorie."""
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

**Registrierung nach Implementierung:**
- [ ] Webhook-Router in `El Servador: src/api/v1/__init__.py` registrieren via `include_router()`

---

## Gruppe 2: Quick Action Ball (Bloecke 4A.4 – 4A.6)

> Der Quick Action Ball ist die primaere Frontend-Oberflaeche fuer das gesamte Notification- und Alert-System. Er ist global sichtbar, kontextabhaengig und bietet Schnellzugriff auf Alerts, Navigation und Widgets — ohne Kontextwechsel.

### Design-Hintergrund: Warum ein subtiler FAB

Material Design definiert den FAB mit 56px Durchmesser — das ist fuer mobile-first Consumer-Apps optimiert. AutomationOne ist ein IoT-Dashboard fuer professionelle Nutzer mit grossem Monitor. Deshalb: 44px (subtiler), Glassmorphism statt Material-Schatten, kontextabhaengige Actions statt statischer Plus-Button.

**Glassmorphism-Prinzip (passend zum bestehenden tokens.css):** Semi-transparenter Hintergrund (`rgba(var(--color-surface), 0.7)`) mit `backdrop-filter: blur(12px)` und subtiler Border (`1px solid rgba(var(--color-border), 0.2)`). Das fuegt sich nahtlos in das bestehende Design-Token-System ein, das bereits `--shadow-lg`, Status-Farben und Glassmorphism-Variablen definiert.

**Micro-Interactions:** Hover-Scale von 1.08 mit leichtem Overshoot (`cubic-bezier(0.34, 1.56, 0.64, 1)`) erzeugt ein "springendes" Gefuehl. Expand-Animation 200ms ease-out. Diese Werte kommen aus UX-Forschung zu FAB-Usability (Pibernik 2019, Umar 2024): Ueber-animierte FABs werden als stoerend empfunden, unter-animierte als "tot". Der Sweet Spot ist 150-250ms mit leichtem Overshoot.

---

## Block 4A.4: Quick Action Ball Komponente (~6-8h)

### 4A.4.1: Architektur

```
                    ┌──────────────────────────────┐
                    │     QuickActionBall.vue       │
                    │  (Global, Bottom-Right, z-50) │
                    │                               │
                    │  ┌─ QuickActionMenu.vue ────┐ │
                    │  │                           │ │
                    │  │  Kontextabhaengige Items: │ │
                    │  │  ● Alert-Panel            │ │
                    │  │  ● Notifications          │ │
                    │  │  ● Dashboard-Widgets      │ │
                    │  │  ● Quick-Navigation       │ │
                    │  │  ● Custom Actions         │ │
                    │  │                           │ │
                    │  └───────────────────────────┘ │
                    └──────────────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │ quickAction.store.ts │
                    │ (Pinia Store)        │
                    │                      │
                    │ - activeMenu         │
                    │ - contextActions[]    │
                    │ - currentView        │
                    │ - dragPayload        │
                    │ - alertSummary       │
                    └──────────────────────┘
```

### 4A.4.2: Neue Dateien

| Datei | Beschreibung |
|-------|-------------|
| `El Frontend: src/components/quick-action/QuickActionBall.vue` | Haupt-FAB-Komponente |
| `El Frontend: src/components/quick-action/QuickActionMenu.vue` | Expandierendes Menu-Panel |
| `El Frontend: src/components/quick-action/QuickActionItem.vue` | Einzelnes Menu-Item |
| `El Frontend: src/components/quick-action/QuickAlertPanel.vue` | Alert-Management-Panel (Block 4A.5) |
| `El Frontend: src/shared/stores/quickAction.store.ts` | State Management |
| `El Frontend: src/composables/useQuickActions.ts` | Kontextabhaengige Action-Logik |
| `El Frontend: src/composables/useNavigationHistory.ts` | MRU-Navigation (Block 4A.6) |

### 4A.4.3: QuickActionBall.vue Spezifikation

```
Position: fixed, bottom: 20px, right: 20px
Groesse: 44px (subtiler als Material Design 56px)
z-index: 50 (ueber Sidebar z-30, unter Modals z-60)
Styling: Glassmorphism via tokens.css
  - background: rgba(var(--color-surface), 0.7)
  - backdrop-filter: blur(12px)
  - border: 1px solid rgba(var(--color-border), 0.2)
  - box-shadow: var(--shadow-lg)
Hover: scale(1.08) + blur-Intensivierung (16px)
Click: Expandiert zu QuickActionMenu
Animation: 200ms ease-out (cubic-bezier(0.34, 1.56, 0.64, 1))

Icon-Zustaende:
  - Default: Aktions-Icon (Blitz/Plus) aus lucide-vue-next
  - Alerts aktiv: Pulsierender Punkt (rot bei Critical, orange bei Warning)
  - Drag-Mode: Drag-Icon
  - Expanded: X (Schliessen)
```

### 4A.4.4: Kontextabhaengige Actions

Der FAB zeigt unterschiedliche Optionen je nach aktuellem View. Das wird ueber `useRouter().currentRoute` gesteuert:

| Aktuelle View | Verfuegbare Quick Actions |
|--------------|--------------------------|
| HardwareView (Level 1-3) | Widget einfuegen, Sensor hinzufuegen, Device konfigurieren, Zone wechseln |
| MonitorView | Widget einfuegen, Zeitraum aendern, Alert-Panel, Dashboard exportieren |
| LogicView | Regel erstellen, Ausfuehrungslog, Fehler-Analyse |
| SystemMonitorView | Diagnostics starten, Log-Suche, Health-Check |
| SettingsView | Profil, Notifications, System-Config |
| **Global (immer)** | Alert-Panel, Notifications (Badge), Emergency Stop, Quick-Search (Ctrl+K) |

### 4A.4.5: Integration in AppShell

- QuickActionBall wird als Teleport-Target in `AppShell.vue` eingebaut (unter `</router-view>`)
- Bekommt `currentRoute` via `useRouter()` fuer Kontext-Erkennung
- Verbindung zu `notification-inbox.store.ts` (aus Block 4A.2) fuer Alert-Badge
- **NICHT anzeigen** auf Login-Seite und bei Mobile-Viewport < 768px (dort wuerde der FAB kritischen Content ueberdecken)

**Registrierung nach Implementierung:**
- [x] `QuickActionBall` in `AppShell.vue` als Teleport-Target einbauen
- [x] Store in `src/shared/stores/` anlegen (Konvention)
- [x] Composable in `src/composables/` anlegen

---

## Block 4A.5: Quick Alert Panel (~6-8h)

### Hintergrund: Alert-Management im IoT-Kontext

In IoT-Monitoring-Systemen (ThingsBoard, Grafana, PagerDuty, Home Assistant) haben sich drei UX-Patterns als Standard etabliert:

1. **Acknowledge (Ack):** Alert als "gesehen" markieren — verhindert wiederholte Benachrichtigung, signalisiert dass jemand sich kuemmert
2. **Mute/Snooze:** Alert fuer definierte Zeit stummschalten — nuetzlich bei bekannten Situationen (Wartung, Kalibrierung)
3. **Direct Navigation:** Ein-Klick-Sprung zum betroffenen Device/Sensor — reduziert die Mean-Time-to-Acknowledge drastisch (Studien zeigen 40-60% Reduktion bei Deep-Link-Alerts)

ISA-18.2 (Industriestandard fuer Alarm-Management) definiert: Max 6 Alarme pro Stunde pro Operator, davon <5% Critical, >80% muessen actionable sein. Das Quick Alert Panel unterstuetzt das durch kompakte Darstellung mit sofortiger Handlungsmoeglichkeit.

### 4A.5.1: QuickAlertPanel.vue

Das Quick Alert Panel ist ein spezielles Menu-Item im QuickActionBall das ein kompaktes Alert-Management-Panel oeffnet:

```
┌─────────────────────────────┐
│ ⚠ Aktive Alerts (3)    [X] │
│─────────────────────────────│
│ 🔴 ESP32-001 Offline        │
│    Zone A • seit 5min        │
│    [Ack] [Mute 1h] [→]      │
│─────────────────────────────│
│ 🟡 pH-Sensor Threshold       │
│    Zone B • pH 4.2 (< 5.0)  │
│    [Ack] [Mute 4h] [→]      │
│─────────────────────────────│
│ 🟡 Humidity Drift            │
│    Zone A • +15% in 2h       │
│    [Ack] [Details] [→]      │
│─────────────────────────────│
│ Alle Alerts anzeigen →       │
└─────────────────────────────┘
```

### 4A.5.2: Quick Actions pro Alert

| Action | Funktion | Backend-Integration |
|--------|---------|---------------------|
| **[Ack]** | Alert als gesehen markieren | `PATCH /v1/notifications/{id}/read` (aus Block 4A.1) |
| **[Mute Xh]** | Alert fuer X Stunden stummschalten | Preset: 1h, 4h, 24h, Custom. Nutzt Per-Sensor-Alert-Config (Block 4A.7) |
| **[→]** | Direkt-Navigation zum betroffenen Device/Sensor | Deep Link via `metadata.esp_id`/`metadata.sensor_type` aus Notification |
| **[Details]** | Expand fuer volles Alert-Detail | Severity, History, Related Alerts (inline expandierbar) |

### 4A.5.3: Datenquelle

Das Quick Alert Panel nutzt die `notification-inbox.store.ts` aus Block 4A.2 als Datenquelle. Es zeigt die letzten N ungelesenen Notifications gefiltert nach `severity: ['critical', 'warning']`. Die WebSocket-Integration (Block 4A.2.7) sorgt fuer Echtzeit-Updates.

**Verbindung zu Phase 4B:** Das Quick Alert Panel ist die KURZFORM des Alert-Drawers. Wenn Phase 4B (Unified Alert Center) implementiert wird, bekommt der "Alle Alerts anzeigen →" Link den vollstaendigen AlertDrawer als Ziel. Beide nutzen denselben Store — kein Duplikat.

**Registrierung nach Implementierung:**
- [ ] `QuickAlertPanel.vue` in `src/components/quick-action/` anlegen
- [ ] Alert-Badge im QuickActionBall mit `notification-inbox.store.ts` verbinden

---

## Block 4A.6: Quick Navigation + Dashboard-Widget Actions (~7-9h)

### 4A.6.1: Quick Navigation (~3-4h)

**Konzept:** Schnelles Springen zwischen Views und Entities ohne Sidebar-Navigation.

**Items im Quick-Navigation-Menu:**
- Letzte 5 besuchte Views/Entities (MRU-Liste via `useNavigationHistory.ts`)
- Favorisierte Sensoren/Devices (neue Funktion: Stern-Icon in DeviceDetailView)
- Quick-Search Trigger (oeffnet bestehende Command Palette via `ui.store.ts`)

**Composable `useNavigationHistory.ts`:**
- Trackt Route-Changes via `useRouter().afterEach()`
- Speichert in localStorage (Key: `ao_nav_history`)
- Max 20 Eintraege, dedupliziert nach Route-Path
- Jeder Eintrag: `{ path, label, icon, timestamp }`

### 4A.6.2: Dashboard-Widget Quick Actions (~4-5h)

**Konzept:** User-erstellte Dashboards erscheinen als draggable Items im QuickActionMenu. Per Drag & Drop koennen Widgets aus dem FAB in die aktuelle View eingefuegt werden.

**Hintergrund DnD-Pattern:** AutomationOne nutzt bereits GridStack.js fuer den Dashboard-Editor und hat ein `dragState.store.ts` sowie `useWidgetDragDrop.ts`. Das Dashboard-Widget-Feature im FAB baut auf dieser bestehenden Infrastruktur auf — kein neues DnD-Framework noetig.

**Implementierung:**
1. `dashboard.store.ts` erweitern: `savedDashboards[]` mit Thumbnail-Preview (Computed aus bestehenden Layout-Daten)
2. QuickActionMenu zeigt Dashboard-Liste als horizontale Scroll-Leiste
3. Drag-Start aus QuickActionItem → nutzt bestehendes `dragState.store.ts`
4. Drop-Target: `CustomDashboardView` (GridStack), `MonitorView` (InlineDashboardPanel)
5. Bestehendes `useWidgetDragDrop.ts` als Basis — WCAG 2.2 konforme Tastatur-Alternative (Space zum Aufnehmen, Pfeiltasten zum Positionieren, Enter zum Ablegen)

**Einschraenkung:** Nur auf Views die Widgets akzeptieren (Editor, Monitor). Auf anderen Views wird die Widget-Option ausgegraut angezeigt mit Tooltip "Nur in Editor/Monitor verfuegbar".

**Registrierung nach Implementierung:**
- [ ] `useNavigationHistory.ts` in `src/composables/` anlegen
- [ ] `dashboard.store.ts` um `savedDashboards[]` erweitern
- [ ] QuickActionMenu mit Drag-Logik verbinden

---

## Gruppe 3: Alert-Konfiguration + Component Tab (Bloecke 4A.7 – 4A.8)

> Per-Sensor-Alert-Konfiguration gibt Robin granulare Kontrolle ueber welche Sensoren wann Alerts ausloesen. Die Component-Tab-Erweiterung liefert Runtime-Tracking als Kontext fuer Diagnosen.
>
> **⚠️ verify-plan Korrektur (2026-03-02):** Block 4A.8 wurde REDUZIERT weil Hardware-Metadaten (manufacturer, model, serial_number, etc.) und Basis-Maintenance-Logik BEREITS implementiert sind in DeviceMetadataSection.vue + device-metadata.ts + sensor_metadata/actuator_metadata JSONB-Felder. Gesamtaufwand Gruppe 3: ~12-17h (statt ~15-20h). Geraete-Einstellungen werden IMMER ueber Dashboard (Hardware-View → SlideOver) erreicht, NIE ueber Komponenten-Tab.

---

## Block 4A.7: Per-Sensor/Device Alert-Konfiguration (~7-10h)

### Hintergrund: Alarm Fatigue und Alert Suppression

Alert Fatigue ist das zentrale Problem in jedem Monitoring-System: Zu viele Alerts fuehren dazu, dass Operatoren kritische Meldungen uebersehen. Empirische Benchmarks (ISA-18.2, IEC 62682) zeigen:

- **Optimal:** 1 Alarm pro 10 Minuten pro Operator (~6/h)
- **Maximal akzeptabel:** 12/h
- **Ueberlastung:** >30/h (Operator reagiert nicht mehr)
- **Empfehlung:** Mindestens 80% der Alarme muessen eine konkrete Handlung erfordern

Die Per-Sensor-Alert-Konfiguration adressiert dies, indem der Operator gezielt steuern kann:
1. Welche Sensoren ueberhaupt alertieren (Master-Toggle)
2. Warum ein Sensor stumm geschaltet ist (begruendete Suppression — Audit-Trail)
3. Wann er automatisch wieder aktiv wird (zeitgesteuerte Re-Aktivierung)
4. Welche Schwellenwerte gelten (Custom Thresholds pro Sensor statt nur globale)

**Entscheidender Unterschied:** Alerts werden WEITERHIN evaluiert — nur die NOTIFICATIONS werden unterdrueckt. Das bedeutet: Der Alert-Zaehler im Diagnostics Hub zeigt alle Alerts, auch suppressed. Nur Email/WebSocket/Badge werden gefiltert. Das ist der ISA-18.2-konforme Ansatz (Shelved Alarms Pattern).

### 4A.7.1: Schema

```typescript
interface SensorAlertConfig {
  // Alert-Steuerung
  alerts_enabled: boolean           // Master-Toggle fuer diesen Sensor
  suppression_reason?: string       // 'maintenance' | 'intentionally_offline' | 'calibration' | 'custom'
  suppression_note?: string         // Freitext-Begruendung
  suppression_until?: string        // ISO-Datum — automatisches Re-Enable

  // Threshold-Overrides (ueberschreibt globale Schwellenwerte)
  custom_thresholds?: {
    warning_min?: number
    warning_max?: number
    critical_min?: number
    critical_max?: number
  }

  // Severity-Override
  severity_override?: 'critical' | 'warning' | 'info'  // null = Default

  // Notification-Override
  notification_channels?: string[]  // Welche Kanaele fuer DIESEN Sensor (null = global)
}

interface DeviceAlertConfig {
  alerts_enabled: boolean
  suppression_reason?: string
  suppression_note?: string
  suppression_until?: string
  // Wenn Device suppressed → ALLE Sensoren/Aktoren dieses Devices suppressed
  propagate_to_children: boolean  // Default: true
}
```

### 4A.7.2: Backend

**Aenderungen:**
- `SensorConfig` Model erweitern: `alert_config` JSONB-Feld (Datei: `El Servador/god_kaiser_server/src/db/models/sensor.py`)
- `ActuatorConfig` Model erweitern: `alert_config` JSONB-Feld (Datei: `El Servador/god_kaiser_server/src/db/models/actuator.py`)
- `ESPDevice` Model erweitern: `alert_config` JSONB-Feld (Datei: `El Servador/god_kaiser_server/src/db/models/esp.py`)
- Neuer Service: `AlertSuppressionService` — prueft ob Sensor/Device suppressed ist
- Neue API-Endpoints: `PATCH /v1/sensors/{id}/alert-config`, `PATCH /v1/actuators/{id}/alert-config`, `PATCH /v1/esp/devices/{id}/alert-config`
- Alembic-Migration fuer 3 neue JSONB-Felder

**⚠️ WICHTIG — IST-Zustand sensor_handler.py (verify-plan 2026-03-02):**
Der aktuelle `sensor_handler.py` (`El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`) hat KEINE Threshold-Pruefung und KEINEN NotificationRouter-Aufruf. Die GESAMTE Pipeline Threshold→Severity→NotificationRouter muss NEU gebaut werden — nicht nur die Suppression-Schicht. Das betrifft:
1. `_get_effective_thresholds()` — Custom aus alert_config vs. Global aus sensor_config.thresholds
2. `_check_thresholds()` — Wert gegen Schwellenwerte pruefen, Severity bestimmen
3. `_persist_alert()` — Alert in DB speichern (auch wenn suppressed)
4. NotificationRouter-Integration — Import + Aufruf in der Verarbeitungskette
5. AlertSuppressionService-Integration — is_suppressed() Pruefung

**Integration in Sensor-Handler (sensor_handler.py):**
```python
# KOMPLETT NEU ZU BAUEN — sensor_handler hat aktuell KEINE Threshold/Notification-Logik:
async def _process_sensor_data(self, sensor_config, value):
    # 1. Threshold pruefen (Custom oder Global)
    thresholds = self._get_effective_thresholds(sensor_config)
    severity = self._check_thresholds(value, thresholds)

    if severity:
        # 2. Suppression pruefen
        if not await alert_suppression_service.is_suppressed(sensor_config.id):
            await notification_router.route(NotificationCreate(...))
        # Alert wird IMMER in DB gespeichert (auch wenn suppressed)
        await self._persist_alert(sensor_config, severity, value, suppressed=True)
```

**Automatisches Re-Enable:** Periodischer Task via bestehendem APScheduler (`El Servador/god_kaiser_server/src/core/scheduler.py`). Neue JobCategory `MAINTENANCE` (oder eigene Kategorie) nutzen. Alle 5 Minuten `suppression_until`-Pruefung. Existierende Kategorien: MOCK_ESP, MAINTENANCE, MONITOR, CUSTOM, SENSOR_SCHEDULE.

### 4A.7.3: Frontend — AlertConfigSection.vue

**Neue Datei:** `El Frontend/src/components/esp/AlertConfigSection.vue`

**⚠️ KORREKTUR (verify-plan 2026-03-02):** Das Verzeichnis `config-sections/` existiert NICHT. Bestehende Sektions-Komponenten liegen in:
- `src/components/devices/` (DeviceMetadataSection.vue, LinkedRulesSection.vue)
- `src/components/esp/` (LiveDataPreview.vue)
Empfehlung: Neue Datei in `src/components/esp/` ablegen (konsistent mit LiveDataPreview) oder in `src/components/devices/` (konsistent mit DeviceMetadataSection). KEIN neues Unterverzeichnis `config-sections/` anlegen.

Integration als neue Accordion-Sektion in bestehendem `SensorConfigPanel.vue` (Three-Zone-Pattern) und `ActuatorConfigPanel.vue`. Platzierung: NACH der bestehenden "Schwellwerte & Alarme"-Sektion (Zone 2), VOR der Zone 3 (Hardware). Die bestehenden Sektionen bleiben UNVERAENDERT.

**Geraete-Einstellungen werden IMMER ueber das Dashboard (Hardware-View → Device-Detail → SlideOver/ESPSettingsSheet) erreicht, NIEMALS ueber den "Komponenten"-Tab (/sensors).** Die SensorConfigPanel/ActuatorConfigPanel sind Teil des SlideOver-Systems im Dashboard.

```
┌─ Alert-Konfiguration ─────────────────────────┐
│                                                 │
│  Alerts fuer diesen Sensor:  [● Aktiv ▾]       │
│                                                 │
│  ┌─ Wenn deaktiviert: ────────────────────────┐│
│  │  Grund: [Wartung          ▾]               ││
│  │  Notiz: [pH-Sensor wird kalibriert___]     ││
│  │  Wieder aktivieren: [In 24h ▾] [Datum]     ││
│  │                                             ││
│  │  ⚠ Alerts werden weiterhin evaluiert —      ││
│  │    nur Notifications werden unterdrueckt.   ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─ Schwellenwert-Override ───────────────────┐│
│  │  □ Eigene Schwellenwerte verwenden          ││
│  │  Warning: Min [__] Max [__]                 ││
│  │  Critical: Min [__] Max [__]                ││
│  │  (Global: Warning 5.0-8.0, Crit 4.0-9.0)  ││
│  └─────────────────────────────────────────────┘│
│                                                 │
│  ┌─ Severity-Override ────────────────────────┐│
│  │  Default-Severity: [Warning ▾]              ││
│  │  (Override nur fuer diesen Sensor)          ││
│  └─────────────────────────────────────────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

**Device-Level Alert-Config:** Dasselbe Pattern wird auch in `ESPSettingsSheet.vue` als neue Accordion-Sektion eingebaut. Wenn ein Device suppressed wird mit `propagate_to_children: true`, werden alle Child-Sensoren/Aktoren automatisch suppressed (visuell mit "Geerbt von Device" Hinweis).

**Registrierung nach Implementierung:**
- [ ] `AlertConfigSection.vue` in `src/components/esp/` oder `src/components/devices/` anlegen (KEIN config-sections/ Unterordner)
- [ ] In `SensorConfigPanel.vue` und `ActuatorConfigPanel.vue` als Accordion-Sektion einbinden (nach "Schwellwerte & Alarme", vor Zone 3)
- [ ] In `ESPSettingsSheet.vue` als Device-Level Accordion-Sektion einbinden
- [ ] `AlertSuppressionService` im Backend anlegen
- [ ] Alembic-Migration fuer 3 JSONB-Felder (sensor_configs, actuator_configs, esp_devices)
- [ ] Periodischen Task fuer `suppression_until` Check registrieren (scheduler.py, Kategorie MAINTENANCE)
- [ ] **NEU:** Threshold→Severity→NotificationRouter Pipeline in sensor_handler.py komplett bauen (existiert aktuell NICHT)
- [ ] QuickAlertPanel.vue: Mute-Placeholder (Zeile 7: "Auftrag 5 dependency") durch echte Suppression-Action ersetzen

---

## Block 4A.8: Component Tab Erweiterung — Hardware-Info + Runtime (~5-7h, REDUZIERT)

### Hintergrund: Three-Zone-Pattern im Konfigurationspanel

AutomationOnes SensorConfigPanel und ActuatorConfigPanel nutzen bereits das Three-Zone-Pattern (Zone 1: Primaer-Anzeige, Zone 2: Konfiguration, Zone 3: Erweitert). Das Three-Zone-Pattern kommt aus dem Bereich Industrial IoT Configuration UX.

### ⚠️ DUPLIKAT-WARNUNG (verify-plan 2026-03-02)

**Die Hardware-Info-Felder und die Basis-Maintenance-Logik EXISTIEREN BEREITS im System:**

**Bestehende Komponenten (NICHT neu bauen!):**
- `El Frontend/src/components/devices/DeviceMetadataSection.vue` — Fertige Komponente, bereits eingebunden in SensorConfigPanel (Zeile 642) und ActuatorConfigPanel (Zeile 503) als Accordion "Geraete-Informationen"
- `El Frontend/src/types/device-metadata.ts` — TypeScript-Interface `DeviceMetadata` mit: manufacturer, model, datasheet_url, serial_number, installation_date, installation_location, maintenance_interval_days, last_maintenance, notes, custom_fields
- `El Frontend/src/composables/useDeviceMetadata.ts` — Composable fuer Metadata-Handling
- Helper-Funktionen: `parseDeviceMetadata()`, `mergeDeviceMetadata()`, `getNextMaintenanceDate()`, `isMaintenanceOverdue()`

**Bestehende Backend-Felder (KEINE neue Migration noetig!):**
- `SensorConfig.sensor_metadata` — JSONB-Feld existiert bereits (`El Servador/god_kaiser_server/src/db/models/sensor.py`, Zeile 157)
- `ActuatorConfig.actuator_metadata` — JSONB-Feld existiert bereits (`El Servador/god_kaiser_server/src/db/models/actuator.py`, Zeile 132)
- `ESPDevice.device_metadata` — JSONB-Feld existiert bereits (`El Servador/god_kaiser_server/src/db/models/esp.py`, Zeile 190)

### 4A.8.1: Hardware-Info Sektion — NUR ERWEITERUNG (~1-2h)

**KEINE neue Datei.** Bestehende `DeviceMetadataSection.vue` erweitern um fehlende Felder:

| Feld | Status | Aktion |
|------|--------|--------|
| manufacturer | ✅ EXISTIERT | Nichts tun |
| model | ✅ EXISTIERT | Nichts tun |
| serial_number | ✅ EXISTIERT | Nichts tun |
| datasheet_url | ✅ EXISTIERT | Nichts tun |
| installation_date | ✅ EXISTIERT | Nichts tun |
| installation_location | ✅ EXISTIERT | Nichts tun |
| maintenance_interval_days | ✅ EXISTIERT | Nichts tun |
| last_maintenance | ✅ EXISTIERT | Nichts tun |
| notes | ✅ EXISTIERT | Nichts tun |
| **firmware_version** | ❌ FEHLT | In `DeviceMetadata` Interface + `DeviceMetadataSection.vue` + `parseDeviceMetadata()` ergaenzen |

**Backend:** KEINE neue Migration. Das `firmware_version` Feld wird einfach ins bestehende JSONB geschrieben (sensor_metadata/actuator_metadata sind schematlos).

### 4A.8.2: Runtime & Maintenance Sektion — NUR NEUE Felder (~4-5h)

**Neue Datei:** `El Frontend/src/components/devices/RuntimeMaintenanceSection.vue` (im `devices/`-Ordner, konsistent mit DeviceMetadataSection)

**NUR diese Felder sind tatsaechlich NEU** (Maintenance-Grundlogik existiert schon in device-metadata.ts):

| Feld | Typ | Automatisch | Beschreibung |
|------|-----|-------------|-------------|
| uptime_hours | number | Ja (berechnet) | Betriebsstunden seit Installation (aus `installation_date` + Heartbeat-Daten) |
| last_restart | datetime | Ja (aus ESP-Health) | Letzter Neustart |
| expected_lifetime_hours | number | Nein | Erwartete Lebensdauer |
| maintenance_log | array | Nein | Wartungshistorie (Datum + Beschreibung) |

**NICHT duplizieren** (existieren bereits in DeviceMetadata/DeviceMetadataSection):
- ~~next_maintenance~~ → wird aus `last_maintenance` + `maintenance_interval_days` berechnet (Funktion `getNextMaintenanceDate()` existiert in device-metadata.ts)
- ~~maintenance_interval_days~~ → existiert in DeviceMetadata

**Backend:** `runtime_stats` JSONB-Feld auf SensorConfig + ActuatorConfig + Alembic-Migration. Neuer Endpoint: `/v1/sensors/{id}/runtime`, `/v1/actuators/{id}/runtime`

**Timeline-Anzeige:** Kleine Timeline-Visualisierung der Wartungshistorie (letztes Jahr). Die Overdue-Warnung existiert bereits in `DeviceMetadataSection.vue` (AlertTriangle-Icon + `isMaintenanceOverdue()`), muss NICHT nochmal gebaut werden.

**Maintenance-Alert-Integration:** Wenn `next_maintenance` ueberfaellig → automatische Notification via NotificationRouter (Block 4A.1). Severity: `info`. Category: `maintenance`. Das ist ein natuerlicher Consumer des Notification-Stacks.

**Registrierung nach Implementierung:**
- [ ] `firmware_version` Feld in bestehende `DeviceMetadataSection.vue` + `device-metadata.ts` ergaenzen
- [ ] `RuntimeMaintenanceSection.vue` in `src/components/devices/` anlegen (NICHT in config-sections/)
- [ ] In `SensorConfigPanel.vue` und `ActuatorConfigPanel.vue` als Accordion-Sektion einbinden (nach "Geraete-Informationen")
- [ ] Backend: `runtime_stats` JSONB-Feld + Alembic-Migration (NUR fuer runtime_stats, NICHT fuer metadata — das existiert schon)
- [ ] Backend: Endpoints `/v1/sensors/{id}/runtime` + `/v1/actuators/{id}/runtime`

---

## Abhaengigkeiten und Reihenfolge

```
GRUPPE 1: Backend + Inbox
═══════════════════════════

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

GRUPPE 2: Quick Action Ball
════════════════════════════

Block 4A.4 (Quick Action Ball):
├── 4A.4.2 Neue Dateien anlegen            ← ZUERST
├── 4A.4.3 QuickActionBall.vue             ← Parallel zu Store
├── 4A.4.4 Kontextabhaengige Actions       ← NACH 4A.4.3
└── 4A.4.5 AppShell-Integration            ← ZULETZT

Block 4A.5 (Quick Alert Panel):
└── QuickAlertPanel.vue                     ← NACH 4A.2 + 4A.4 (braucht Inbox-Store + FAB)

Block 4A.6 (Quick Navigation + Widgets):
├── 4A.6.1 useNavigationHistory.ts          ← Parallel (unabhaengig)
└── 4A.6.2 Dashboard-Widget DnD             ← NACH 4A.4 (braucht FAB-Menu)

GRUPPE 3: Alert-Config + Component Tab
═══════════════════════════════════════

Block 4A.7 (Per-Sensor Alert-Config):
├── 4A.7.1 Schema definieren                ← ZUERST
├── 4A.7.2 Backend (Service + API + Migration + Threshold→Notification Pipeline NEU!) ← NACH 4A.1.3 (braucht NotificationRouter)
└── 4A.7.3 Frontend AlertConfigSection.vue   ← NACH Backend (in src/components/esp/ oder src/components/devices/)

Block 4A.8 (Component Tab — REDUZIERT, ~5-7h statt 8-10h):
├── 4A.8.1 DeviceMetadataSection ERWEITERN   ← NUR firmware_version ergaenzen (NICHT neu bauen!)
└── 4A.8.2 RuntimeMaintenanceSection.vue     ← NUR neue Felder (uptime, last_restart, lifetime, maintenance_log)

GRUPPEN-ABHAENGIGKEITEN
═══════════════════════

Gruppe 1 (4A.1-4A.3) ──► Gruppe 2 (4A.4-4A.6) ──► (parallel zu Gruppe 3)
                     └──► Gruppe 3 (4A.7-4A.8) ──► (parallel zu Gruppe 2)

Parallelisierung innerhalb Gruppe 1:
- 4A.1 und 4A.3 Backend-Teile PARALLEL (Webhook-Endpoint ist unabhaengig von NotificationRouter)
- 4A.2 Frontend NACH 4A.1 Backend (braucht funktionierende API)
- 4A.3 Grafana YAML kann jederzeit (nur Config-Dateien)

Parallelisierung nach Gruppe 1:
- Gruppe 2 (Quick Action Ball) NACH 4A.2 (braucht Inbox-Store fuer Alert-Badge)
- Gruppe 3 Backend (4A.7.2) NACH 4A.1.3 (braucht NotificationRouter fuer Suppression-Integration)
- Gruppe 3 Frontend (4A.7.3, 4A.8) kann PARALLEL zu Gruppe 2 (nur UI-Erweiterungen bestehender Panels)
- Block 4A.4 (FAB-Komponente) kann PARALLEL zu 4A.7/4A.8 (unabhaengige UI)
```

---

## Akzeptanzkriterien

### Basis (MUSS)

- [ ] **DB-Schema:** `notifications` und `notification_preferences` Tabellen existieren, Migration laeuft fehlerfrei
- [ ] **Test-Email:** `POST /api/v1/notifications/test-email` → Email kommt an (Resend ODER SMTP)
- [ ] **Notification-Router:** `NotificationCreate` → DB-Eintrag + WS-Broadcast in <200ms
- [ ] **REST-API:** Alle 9 Endpoints antworten korrekt (GET/PATCH/POST/PUT)
- [ ] **Unread-Count:** `GET /api/v1/notifications/unread-count` liefert korrekte Zahl
- [ ] **Badge:** NotificationBadge zeigt korrekte Anzahl, Farbe passt zur hoechsten Severity
- [ ] **Drawer:** NotificationDrawer oeffnet/schliesst, zeigt Notifications, Filter funktioniert
- [ ] **Als gelesen:** Klick auf "Als gelesen" → Badge-Zaehler sinkt sofort (WebSocket-Update)
- [ ] **Grafana-Webhook:** Alert in Grafana feuern → erscheint in Frontend-Inbox innerhalb 30s
- [ ] **Resolved:** Grafana sendet "resolved" → Notification wird als "resolved" markiert
- [ ] **Preferences:** Email ein/aus, Severity-Filter, Quiet Hours speichern + laden
- [ ] **Registrierungen:** Alle neuen Router, Models, WS-Events korrekt eingebunden (siehe Checklisten pro Block)

### Erweitert (SOLLTE) — Gruppe 1

- [ ] **Digest:** 3+ Warning-Notifications innerhalb 1h → Digest-Email mit Zusammenfassung
- [ ] **Quiet Hours:** Keine Email zwischen 22:00-07:00 (wenn konfiguriert)
- [ ] **Deduplication:** Gleicher Grafana-fingerprint → kein Duplikat in Inbox
- [ ] **Browser-Notification:** Critical → Browser Notification API (wenn Permission erteilt)
- [ ] **Logic Engine:** Regel feuert → Notification erscheint in Inbox (NotificationActionExecutor)
- [ ] **Deep-Links:** "Zum Sensor" / "Zur Regel" / "In Grafana" Links funktionieren
- [ ] **ISA-18.2:** Bei normalem Betrieb < 6 Notifications/Stunde in der Inbox

### Quick Action Ball (MUSS) — Gruppe 2

- [x] **FAB sichtbar:** Quick Action Ball auf allen Views (bottom-right, ueber Sidebar, z-38)
- [x] **Kontext-Actions:** Actions wechseln bei View-Wechsel (HardwareView vs. MonitorView vs. LogicView)
- [x] **Glassmorphism:** Styling konsistent mit Design-Tokens (backdrop-filter, rgba, shadow)
- [x] **Micro-Interaction:** Hover-Scale, Expand-Animation smooth (200ms, keine Ruckler)
- [x] **Alert-Badge:** Pulsiert bei Critical (rot), zeigt korrekte Anzahl aus notification-inbox.store
- [ ] **Quick Alert Panel:** Ack/Mute/Navigate funktionieren, Alerts korrekt aus Store geladen
- [ ] **Quick Navigation:** MRU-Liste aktualisiert sich bei View-Wechsel, localStorage persistiert
- [x] **Mobile:** FAB ueberdeckt keinen kritischen Content (ausgeblendet < 768px)

### Alert-Config + Component Tab (MUSS) — Gruppe 3

- [ ] **Alert-Config Master-Toggle:** Deaktiviert Notifications (NICHT Evaluation)
- [ ] **Alert-Config Suppression-Grund:** Pflichtfeld wenn deaktiviert (Audit-Trail)
- [ ] **Alert-Config Auto-Re-Enable:** Sensor wird nach `suppression_until` automatisch reaktiviert
- [ ] **Alert-Config Custom Thresholds:** Ueberschreiben globale Werte korrekt
- [ ] **Alert-Config Device-Level:** Suppression propagiert zu allen Child-Sensoren/Aktoren
- [ ] **Hardware-Info:** Felder speichern und laden korrekt (Metadata JSONB)
- [ ] **Runtime:** Betriebsstunden berechnen sich automatisch
- [ ] **Maintenance-Warning:** Badge/Notification wenn naechste Wartung ueberfaellig
- [ ] **Regression:** Bestehende Sensor/Aktor-Konfiguration funktioniert weiterhin unveraendert

### Tests

- [ ] Backend: Unit-Tests fuer NotificationRouter (route, preferences, digest, dedup)
- [ ] Backend: Unit-Tests fuer AlertSuppressionService (is_suppressed, auto-reenable, propagation)
- [ ] Backend: Integration-Test fuer Grafana-Webhook-Endpoint (firing + resolved)
- [ ] Backend: Integration-Test fuer REST-API (CRUD, read-all, preferences, alert-config)
- [ ] Frontend: Vitest fuer notification-inbox.store (WS-Handler, markAsRead, filter)
- [ ] Frontend: Vitest fuer quickAction.store (context-actions, menu-state)
- [x] Bestehende Tests: 804+ Backend + 1532 Frontend Tests brechen NICHT (verifiziert 2026-03-02)

---

## Offene Punkte

**Gruppe 1 (Backend + Inbox):**
1. **Resend Domain:** Robin muss eine Domain bei Resend verifizieren (z.B. `robin-herbig.de`). Alternativ: `onboarding@resend.dev` fuer Testing
2. **SMTP-Credentials:** Falls SMTP-Fallback genutzt wird: App-Passwort fuer Gmail/eigenen Server einrichten
3. **Multi-User:** Aktuell ist Robin der einzige User. Schema ist Multi-User-faehig, aber die erste Implementierung kann vereinfachen: `user_id = None` → "an alle Admins"
4. **Notification-Retention:** Wie lange sollen alte Notifications in der DB bleiben? Empfehlung: 90 Tage, dann automatisch archivieren (Job in DigestService)
5. **HMAC-Signatur:** Grafana-Webhook kann mit HMAC-SHA256 signiert werden (`X-Grafana-Alerting-Signature` Header). Fuer Produktions-Setup aktivieren, fuer Entwicklung optional
6. **Sound:** Critical-Alert-Sound im Frontend? Technisch moeglich (Web Audio API), UX-Frage

**Gruppe 2 (Quick Action Ball):**
7. **Dashboard-Widget DnD:** Soll das Widget-DnD aus dem FAB das bestehende `useWidgetDragDrop.ts` direkt nutzen oder einen Wrapper bekommen? Empfehlung: Direkter Aufruf, kein Wrapper — KISS
8. **FAB auf Mobile:** Komplett ausblenden oder als Bottom-Bar umbauen? Empfehlung: Ausblenden < 768px, spaeter evaluieren ob Bottom-Bar sinnvoll
9. **Quick-Search Shortcut:** Soll Ctrl+K den FAB oeffnen oder direkt die Command Palette? Empfehlung: Direkt Command Palette (bestehendes Pattern), FAB ist Mouse-first

**Gruppe 3 (Alert-Config + Component Tab):**
10. **Suppression-Audit:** Soll jede Suppression/Re-Aktivierung im AuditLog erscheinen? Empfehlung: Ja — wichtig fuer Compliance und Fehlersuche
11. **Alembic-Migrationen:** Block 4A.7 und 4A.8 brauchen zusammen 4-5 JSONB-Felder auf bestehenden Tabellen. Eine oder mehrere Migrationen? Empfehlung: Eine Migration pro Block (2 Migrationen), klar benannt
12. **Maintenance-Benachrichtigung Intervall:** Wie oft soll "Wartung ueberfaellig" erinnert werden? Empfehlung: 1x pro Tag (nicht oefter — Alarm Fatigue)

**Uebergreifend:**
13. **Phase 4B Uebergang:** Der `NotificationRouter` ist die Grundlage fuer das Unified Alert Center (4B). Das `UnifiedAlert`-Interface aus 4B wird spaeter auf der `notifications`-Tabelle aufbauen. Sicherstellen dass `metadata` JSONB flexibel genug ist fuer 4B-Erweiterungen
14. **Quick Alert Panel → AlertDrawer (4B):** Das Quick Alert Panel (4A.5) ist die Kurzform. Der volle AlertDrawer kommt mit 4B. Beide nutzen denselben notification-inbox.store — "Alle Alerts anzeigen →" wird mit 4B verlinkt

---

## TM-Kontext (nur fuer Robin/TM, NICHT fuer Agents)

Dieser Abschnitt enthaelt Hintergrundinformationen, Recherche-Quellen und strategische Bezuege. Agenten im auto-one Repo haben KEINEN Zugriff auf diese Dateien — alle implementierungsrelevanten Informationen stehen in den Bloecken oben.

### Bezuege im Life-Repo

| Datei | Inhalt |
|-------|--------|
| `arbeitsbereiche/automation-one/roadmap-phase4-system-integration.md` | Phase 4A-E Roadmap, Code-Snippets, UI-Mockups |
| `arbeitsbereiche/automation-one/roadmap.md` | Gesamtplan, Phase 4 Ueberblick |
| `arbeitsbereiche/automation-one/STATUS.md` | Backend 95%, Frontend 95%, Monitoring 100% |
| `arbeitsbereiche/automation-one/architektur-uebersicht.md` | 3-Schichten-Design |
| `wissen/iot-automation/iot-alert-email-notification-architektur-2026.md` | Alert UX, SMTP vs Resend, ISA-18.2, Grafana Webhook (Basis-Recherche) |
| `wissen/iot-automation/notification-stack-implementierung-recherche-2026.md` | Implementierungs-Details: fastapi-mail, BackgroundTasks vs Celery/ARQ, Digest-Strategien (Ergaenzungs-Recherche) |
| `wissen/iot-automation/unified-alert-center-ux-best-practices.md` | Alert-Center Design (4 Ebenen, ThingsBoard-Pattern) |
| `arbeitsbereiche/automation-one/hardware-tests/PHASE_4_INTEGRATION.md` | Phase 4 aus Testinfrastruktur-Perspektive |

### Recherche-Quellen (18 Web + 12 Papers)

**Email-Provider:**
1. Resend — Send emails with FastAPI (resend.com/docs)
2. Resend Pricing — Free: 3.000/Monat, Pro: $20/50.000
3. Resend Account Quotas — 2 req/s, 100/Tag Free
4. fastapi-mail PyPI — v1.6.2, async SMTP, Jinja2
5. fastapi-mail Documentation — ConnectionConfig, Template-Setup

**Task-Queue-Vergleich:**
6. BackgroundTasks vs ARQ (davidmuraya.com) — Detailvergleich
7. BackgroundTasks vs Celery vs ARQ (medium.com) — Feature-Tabelle
8. FastAPI BackgroundTasks Docs — Offizielle Doku
9. ARQ vs Celery (bithost.in) — Redis-Anforderungen

**Grafana Webhook:**
10. Grafana Webhook Notifier Docs — Payload-Format, HMAC
11. Grafana File Provisioning — YAML-Provisioning
12. Grafana Webhook DeepWiki — Integration-Details
13. Grafana Community: JSON Payload — Praxis-Beispiele

**Digest/Batching:**
14. NotificationAPI: Batching & Digest — Batch-Strategien
15. SuprSend: Best Practices — Grouping, Timing
16. ilert: Intelligent Alert Grouping — Deduplication
17. Prometheus Alertmanager Deduplication — Grouping

**Vue 3 Notifications:**
18. vue3-notification (kyvg) — Toast-Library (kein Inbox, daher Custom-Build)

### Wissenschaftliche Fundierung

| Paper | Kernaussage | Anwendung im Auftrag |
|-------|-------------|-----------|
| Rizk et al. (2020) | User-Aware Notification System, Event-Severity + Schedules | Quiet Hours, Digest-Logik |
| Saraswathi & Jeena (2025) | Dynamische Schwellenwert-Anpassung, -30% False-Positives | Sensor-Threshold-Alerts (relevant fuer 4B) |
| Putra et al. (2024) | WebSocket schneller als MQTT fuer Real-Time Push-Notifications | WS fuer Frontend-Delivery |
| Jose et al. (2025) | IoT Dashboard mit Message Queue → WebSocket | Architektur-Validierung |
| Twabi et al. (2025, FrameMQ) | Pub/Sub Latenz 2300ms→400ms durch Optimization | Backend-Routing Latenz |
| ISA-18.2 / IEC 62682 | <6 Alarme/h, <5% Critical, >80% Actionable | Alert-Rate-Limits, Digest-Schwellen |

### Verify-Plan Zusammenfassung (2026-03-02)

Geprueft: ~30 Pfade, 4 Services, 9 Endpoints, 3 WS-Events, 2 DB-Tabellen, Grafana-Webhook. 13 Korrekturen eingearbeitet (2 KRITISCH, 4 HOCH, 5 MITTEL, 2 NIEDRIG). Hauptkategorien:
- DB-Schema: user_id INTEGER, Tabelle user_accounts (nicht UUID/users)
- API-Prefix: /api/v1/ konsistent
- NotificationExecutor: Kein Placeholder, Refactoring noetig
- Config: Nested NotificationSettings, SMTP existiert bereits
- Frontend: Store-Pfade, WS-Events, Icons, Design-Tokens alle korrigiert
- Registrierungen: __init__.py, Dispatcher ergaenzt
