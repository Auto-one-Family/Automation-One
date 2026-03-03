# STEP 6: Phase 4B — Unified Alert Center

> **Erstellt:** 2026-03-03
> **Typ:** Implementierung (Code-Aenderungen im auto-one Repo)
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** STEP 0-5 ERLEDIGT (Phase 4A KOMPLETT: NotificationRouter, EmailService, 63 Tests, 11 Prometheus-Metriken, 5 Grafana-Alerts, Error-Code-System 6/6 Bloecke)
> **Geschaetzter Aufwand:** ~10-14h (4 Bloecke) — [VERIFY-PLAN: reduziert von ~15-20h, da Block 4B.3 zu 95% existiert und Block 4B.4 bestehende Health-Infrastruktur nutzt]
> **Prioritaet:** HOCH — Naechster logischer Schritt nach Phase 4A
> **Referenz-Plan:** `auto-one/.claude/reports/current/testrun-phasen/PHASE_4_INTEGRATION copy.md` (Abschnitt Phase 4B)

---

## Motivation

Phase 4A hat die Notification-Pipeline gebaut: Backend-Routing, Email-Delivery, Frontend-Inbox, Grafana-Webhook, Quick Action Ball, Per-Sensor-Alert-Config. **Aber:** Alerts haben keinen Lifecycle — sie erscheinen, werden gelesen, fertig. Es gibt kein Acknowledge, kein Resolve, keine Root-Cause-Korrelation, keine Alarm-Fatigue-Praevention.

Phase 4B fuehrt den **ISA-18.2-konformen Alert-Lifecycle** ein: Active → Acknowledged → Resolved. Alle Alert-Quellen (Grafana, Logic Engine, MQTT-Handler, Sensor-Thresholds, Device-Events) werden in einem konsistenten System konsolidiert — dem Unified Alert Center.

**Was dieser Auftrag NICHT macht:**
- Keine neuen Notification-Kanaele (Email, WS sind fertig aus 4A)
- Kein Plugin-System (das ist Phase 4C)
- Kein Diagnostics Hub (das ist Phase 4D)
- Keine Frontend-Tests (separater Auftrag, niedrigere Prio)
- Kein neuer separater View — Integration in bestehende Views

---

## Kernprinzip: ERWEITERN, nicht duplizieren

Phase 4A hat eine vollstaendige Notification-Infrastruktur geschaffen. Phase 4B **baut darauf auf**:

| Phase 4A (existiert bereits) | Phase 4B (erweitert/ergaenzt) |
|------------------------------|-------------------------------|
| `notification-inbox.store.ts` (Pinia Setup Store, `shared/stores/`) | **NEUER** `alert-center.store.ts` in `shared/stores/` — importiert aus notification-inbox.store, ergaenzt Alert-Lifecycle |
| `notification.store.ts` (Legacy Toast, `shared/stores/`) | Bleibt unveraendert — Toast-Benachrichtigungen funktionieren |
| `quickAction.store.ts` (Quick Action Ball, `shared/stores/`) | Bleibt unveraendert — QAB ruft alert-center.store Computed auf |
| `NotificationDrawer.vue` + `NotificationItem.vue` (SlideOver rechts) | **ERWEITERN** um Acknowledge/Resolve-Buttons pro Alert |
| `NotificationBadge.vue` | **MINIMAL ANPASSEN** — Severity-Farben + Pulse EXISTIEREN BEREITS, nur Zaehler-Quelle aendern |
| `QuickAlertPanel.vue` | **ERWEITERN** um Alert-Status-Filter (Active/Acknowledged/Resolved) |
| `SensorAlertConfig.vue` (Per-Sensor Thresholds) | Bleibt unveraendert — Konfiguration ist fertig |
| `notifications.ts` (API-Client) | **ERWEITERN** um `acknowledgeAlert()`, `resolveAlert()`, `getAlertStats()`, NotificationDTO um status-Felder |
| `SystemMonitorView.vue` + `HealthTab.vue` + `HealthSummaryBar.vue` | **ERWEITERN** um Alert-Lifecycle-Integration (Alert-Counts, Problem-Chips) |
| `NotificationRouter` (Backend, `src/services/notification_router.py`) | **ERWEITERN** um `_suppress_dependent_alerts()` Root-Cause-Korrelation + `broadcast_notification_updated` erweitern |
| `NotificationRepository` (Backend, `src/db/repositories/notification_repo.py`) | **ERWEITERN** um `acknowledge_alert()`, `resolve_alert()`, `auto_resolve_by_correlation()`, `get_alerts_by_status()`, `get_isa_metrics()` |
| `sensor_handler.py` (MQTT) | **MINIMAL:** Nur `correlation_id` in bestehende `_evaluate_thresholds_and_notify()` ergaenzen — Threshold-Pipeline existiert bereits! |
| `Notification` DB-Model | **ERWEITERN** um `status`, `acknowledged_at`, `resolved_at`, `acknowledged_by`, `correlation_id`. ACHTUNG: `parent_notification_id` existiert BEREITS! |
| 43/43 Grafana-Alerts | Bleiben unveraendert — Alert-Definitionen sind komplett |
| 11 Prometheus Notification-Metriken | **ERWEITERN** um Alert-Lifecycle-Metriken (acknowledge/resolve Counts) |

---

## Bestandsaufnahme: Was Phase 4A gebaut hat (Ist-Zustand)

### Backend (El Servador)

> **[VERIFY-PLAN KORREKTUR]** Alle Pfade gegen Codebase verifiziert. Das Verzeichnis `src/notifications/` existiert NICHT. Notification-Logik liegt in `src/services/`, `src/db/repositories/` und `src/schemas/`. Es gibt KEINEN separaten `NotificationService` — die Logik ist verteilt auf `NotificationRouter` (Routing+Broadcast) und `NotificationRepository` (CRUD). Threshold-Checks sind BEREITS implementiert (Phase 4A.7).

**Dateien die existieren und ERWEITERT werden:**

| Datei | Pfad (VERIFIZIERT) | Was existiert | Was fehlt fuer 4B |
|-------|------|---------------|-------------------|
| NotificationRouter | `src/services/notification_router.py` | Routing nach Severity+Channel, Deduplication (fingerprint + title-based 60s), Cascade-Suppression via `parent_notification_id`, `persist_suppressed()` fuer ISA-18.2 Audit-Trail, Email-Routing (Critical→sofort, Warning→first-of-day, Info→keine) | `_suppress_dependent_alerts()` Root-Cause-Korrelation, `auto_resolve_by_correlation()` |
| NotificationRepository | `src/db/repositories/notification_repo.py` | `get_for_user()`, `get_unread_count()`, `get_highest_unread_severity()`, `mark_as_read()`, `mark_all_as_read()`, `check_duplicate()`, `check_fingerprint_duplicate()`, `count_today_warnings()`, `get_pending_digest_notifications()` | `acknowledge_alert()`, `resolve_alert()`, `get_alerts_by_status()`, `get_isa_metrics()`, `auto_resolve_by_correlation()` |
| Notification API | `src/api/v1/notifications.py` | 9 REST-Endpoints: `GET /notifications` (list+filter), `GET /notifications/unread-count`, `GET /notifications/preferences`, `GET /notifications/{id}`, `PATCH /notifications/{id}/read`, `PATCH /notifications/read-all`, `POST /notifications/send` (admin), `PUT /notifications/preferences`, `POST /notifications/test-email` | `PATCH /alerts/{id}/acknowledge`, `PATCH /alerts/{id}/resolve`, `GET /alerts/active`, `GET /alerts/stats` |
| Notification Model | `src/db/models/notification.py` | `Notification` (15 Spalten: id, user_id, channel, severity, category, title, body, extra_data→metadata, source, is_read, is_archived, digest_sent, `parent_notification_id` (EXISTIERT BEREITS!), fingerprint, read_at) + `NotificationPreferences` + `NotificationSeverity`/`NotificationSource`/`NotificationCategory` Constants | Spalten: `status` (active/acknowledged/resolved), `acknowledged_at`, `resolved_at`, `acknowledged_by`, `correlation_id`. **ACHTUNG:** `parent_notification_id` existiert bereits — Plan-Spalte `parent_notification_id` umbenennen! |
| Notification Schema | `src/schemas/notification.py` | `NotificationCreate` (user_id, channel, severity, category, title, body, metadata, source, parent_notification_id, fingerprint), `NotificationResponse`, `NotificationListResponse`, `NotificationUnreadCountResponse`, `NotificationPreferencesUpdate/Response` | `correlation_id` Feld in NotificationCreate+Response, `status`/`acknowledged_at`/`resolved_at` in NotificationResponse |
| GrafanaWebhookHandler | `src/api/v1/webhooks.py` | Empfaengt Grafana-Alerts, parsed Severity (FIX-02: resolved→info), kategorisiert (Infrastructure/Data Quality/Connectivity/System), setzt fingerprint fuer Deduplication | Auto-Resolve: `correlation_id` setzen + bei Grafana `resolved`-Status alle korrelierenden Alerts resolven |
| sensor_handler.py | `src/mqtt/handlers/sensor_handler.py` | **BEREITS IMPLEMENTIERT (Phase 4A.7):** `_evaluate_thresholds_and_notify()` (Zeile 490-605) prueft Thresholds nach jedem DB-Write, nutzt `AlertSuppressionService.get_effective_thresholds()` + `check_thresholds()`, routet via `NotificationRouter.route()`, persistiert suppressed Alerts via `persist_suppressed()` | **KEIN neuer Code noetig!** Threshold-Pipeline ist komplett. Siehe Block 4B.3 Korrektur. |
| Health-Endpoints | `src/api/v1/health.py` | **5 Endpoints:** `GET /v1/health/` (basic: status, version, uptime), `GET /v1/health/detailed` (DB, MQTT, WS, SystemResources, components, warnings), `GET /v1/health/esp` (Fleet-Health: online/offline/error counts, per-device items mit recent_errors aus AuditLog), `GET /v1/health/live` (K8s liveness), `GET /v1/health/ready` (K8s readiness: DB+MQTT) | `GET /v1/health/dashboard` mit Active-Alert-Counts + Logic-Engine-Status aggregiert. ALTERNATIV: bestehende Endpoints reichen evtl. aus — `/v1/health/detailed` + `/v1/health/esp` liefern bereits Server+DB+MQTT+ESP+System-Status |

**Dateien die NICHT angefasst werden:**
- `src/services/email_service.py` — Email-Delivery funktioniert (Resend + SMTP Fallback)
- `src/services/digest_service.py` — Digest-Aggregation funktioniert
- `src/services/alert_suppression_service.py` — AlertSuppression (sensor-level + device-level, `get_effective_thresholds()`, `check_thresholds()`, `is_sensor_suppressed()`) funktioniert
- `src/websocket/manager.py` — Singleton, broadcast mit Subscription-Filter, Rate-Limiting — funktioniert
- Alle 63 bestehenden Tests — bleiben unveraendert, neue Tests kommen hinzu

### Frontend (El Frontend)

> **[VERIFY-PLAN KORREKTUR]** Store-Pfade korrigiert: Stores liegen in `src/shared/stores/`, NICHT in `src/stores/`. NotificationBadge hat BEREITS Severity-Farben + Pulse-Animation. System Monitor View (88KB, 6 Tabs, 20 Sub-Komponenten) ist ein MASSIVES bestehendes Feature das integriert werden MUSS. Health-API-Client + HealthTab.vue + HealthSummaryBar.vue existieren bereits.

**Dateien die existieren und ERWEITERT werden:**

| Datei | Pfad (VERIFIZIERT) | Was existiert | Was fehlt fuer 4B |
|-------|------|---------------|-------------------|
| notification-inbox.store.ts | `src/shared/stores/notification-inbox.store.ts` (385 Zeilen) | Pinia Setup Store: `notifications[]`, `unreadCount`, `highestSeverity`, `isDrawerOpen`, `activeFilter` (all/critical/warning/system), `filteredNotifications`, `groupedNotifications` (Heute/Gestern/Aelter), `loadInitial()`, `loadMore()` (Pagination PAGE_SIZE=50), `markAsRead()`, `markAllAsRead()`, WS-Handler: `handleWSNotificationNew`, `handleWSNotificationUpdated` (verarbeitet: is_read, is_archived, read_at), `handleWSUnreadCount`, Browser-Notifications fuer Critical | Computed: alertsByStatus (active/acknowledged/resolved), `acknowledgeAlert()`, `resolveAlert()`. WS-Handler erweitern: `status`, `acknowledged_at`, `resolved_at` Felder verarbeiten |
| notifications.ts | `src/api/notifications.ts` (228 Zeilen) | API-Client mit Types: `NotificationDTO` (id, user_id, channel, severity, category, title, body, metadata, source, is_read, is_archived, digest_sent, parent_notification_id, created_at, updated_at, read_at), `NotificationSeverity`, `NotificationCategory`, `NotificationSource`, `notificationsApi.list()`, `.getUnreadCount()`, `.getById()`, `.markRead()`, `.markAllRead()`, `.send()`, `.getPreferences()`, `.updatePreferences()`, `.sendTestEmail()` | `acknowledgeAlert(id)`, `resolveAlert(id)`, `getAlertStats()`. `NotificationDTO` erweitern: `status`, `acknowledged_at`, `resolved_at`, `acknowledged_by`, `correlation_id` |
| NotificationDrawer.vue | `src/components/notifications/NotificationDrawer.vue` (~330 Zeilen) | SlideOver (lg=560px) mit 4 Filter-Tabs (Alle/Kritisch/Warnungen/System), "Alle gelesen" Button, Settings-Gear, Notification-Liste gruppiert nach Datum (Heute/Gestern/Aelter), Lazy Loading, Sub-Komponenten: NotificationItem.vue (expandable rows mit Severity-Dot, Title, Body, relative Time, Action-Buttons: "Als gelesen"/"Zum Sensor"/"Zur Regel"/"In Grafana") | Acknowledge/Resolve-Buttons in NotificationItem, Status-Tabs (Active/Acknowledged/Resolved) STATT oder ZUSAETZLICH zu Severity-Filter, Root-Cause-Gruppierung (parent_notification_id) |
| NotificationBadge.vue | `src/components/notifications/NotificationBadge.vue` | **BEREITS IMPLEMENTIERT:** Bell-Icon mit Badge, Badge-Farbe nach Severity (critical=rot, warning=gelb, info=grau), Pulse-Animation bei Critical (2s Zyklus), Badge-Zahl = unreadCount (max "99+"), Click togglet Drawer | **NUR ANPASSUNG NOETIG:** Badge-Zahl auf `active + acknowledged` statt `unread` umstellen (wenn status-Feld eingefuehrt). Pulse bleibt. Farben bleiben. |
| QuickAlertPanel.vue | `src/components/quick-action/QuickAlertPanel.vue` (~564 Zeilen) | Top-5 unread Alerts sortiert nach Severity, expandable rows mit Detail-Grid (severity, source, esp_id), Action-Buttons (Check/markAsRead, ExternalLink/navigate, Mute via `sensorsApi.updateAlertConfig()`), Empty State, "Alle Alerts anzeigen" Footer-Button | Status-Filter-Chips (Active/Acknowledged/All), Acknowledge-Button (statt nur markAsRead), Batch-Acknowledge bei >3 aktiven Alerts |
| health.ts | `src/api/health.ts` (55 Zeilen) | **EXISTIERT BEREITS:** `getFleetHealth()` → `GET /health/esp`, Types: `FleetHealthDevice` (device_id, name, status, last_seen, uptime, heap_free, wifi_rssi, sensor/actuator_count, recent_errors[]), `FleetHealthResponse` (total/online/offline/error/unknown counts, totals, averages, devices[]) | Erweitern um `getHealthDashboard()` falls neuer `/health/dashboard` Endpoint kommt. ALTERNATIV: bestehender `getFleetHealth()` reicht fuer ESP-Status |
| SystemMonitorView.vue | `src/views/SystemMonitorView.vue` (88KB!) | **MASSIVES bestehendes Feature:** 6 Tabs (Events, Server Logs, Database, MQTT Traffic, Health), 20 Sub-Komponenten in `src/components/system-monitor/`, HealthSummaryBar (offline/heap/signal Probleme), HealthTab (Fleet Health KPIs, sortierbare Device-Liste, Problem-Highlighting), EventsTab mit 23 Event-Typen, 4 Severity-Level-Filter, ESP-Filter, Time-Range-Filter, Data-Source-Selector, Event-Grouping, Live-Pause | **INTEGRATION:** Alert-Lifecycle-Status in Events integrieren, HealthTab um Active-Alert-Counts erweitern, HealthSummaryBar um Alert-Summary erweitern |
| TopBar.vue | `src/shared/design/layout/TopBar.vue` | Header mit Navigation, NotificationBadge (zwischen EmergencyStopButton und ConnectionDot) | AlertStatusBar-Element integrieren (ODER HealthSummaryBar aus SystemMonitor wiederverwenden) |

**Dateien die NEU erstellt werden:**

| Datei | Pfad | Zweck |
|-------|------|-------|
| alert-center.store.ts | `src/shared/stores/alert-center.store.ts` | Pinia Setup Store fuer Alert-Lifecycle, Aggregation, ISA-18.2 Metriken. **ACHTUNG:** Pfad ist `shared/stores/`, NICHT `stores/`. Re-Export in `shared/stores/index.ts` noetig! |
| AlertStatusBar.vue | `src/components/alerts/AlertStatusBar.vue` | Permanent im Header: System-Status + Alert-Counts. **EMPFEHLUNG:** Design an bestehende `HealthSummaryBar.vue` anlehnen (gleicher Stil: Problem-Chips, expandable Details) |
| AlertBadge.vue | `src/components/alerts/AlertBadge.vue` | Wiederverwendbarer Alert-Badge fuer ESPCard, SensorCard, RuleCard |

**Dateien die NICHT angefasst werden:**
- `src/shared/stores/notification.store.ts` (Toast-Store, 124 Zeilen) — bleibt fuer transiente Toast-Notifications (notification, error_event, system_event WS-Events)
- `src/shared/stores/quickAction.store.ts` (157 Zeilen) — QAB-State-Mechanik ist fertig (alertSummary computed liest bereits aus inboxStore)
- `QuickActionBall.vue` (~312 Zeilen) — FAB-UI ist fertig (Alert-Dot, Panel-Switching)
- `SensorAlertConfig.vue` — Per-Sensor-Thresholds sind konfigurierbar
- `NotificationPreferences.vue` (~548 Zeilen) — Preferences-UI ist fertig (Email, Quiet Hours, Digest, Browser)

### Monitoring-Stack

| Element | Status | Phase 4B Aktion |
|---------|--------|----------------|
| 32 Prometheus-Alerts | Aktiv | Keine Aenderung |
| 6 Loki-Alerts | Aktiv | Keine Aenderung |
| 5 Notification-Pipeline-Alerts | Aktiv | Keine Aenderung |
| 11 Notification-Metriken | Aktiv | +4 Alert-Lifecycle-Metriken (acknowledge/resolve/auto_resolve/suppressed_root_cause) |

---

## Block 4B.1: UnifiedAlert Schema + alert-center.store.ts (~4-5h)

### 4B.1.1 — DB-Migration: Alert-Lifecycle-Spalten

**Datei:** Neue Alembic Migration in `El Servador/god_kaiser_server/alembic/versions/`

Die bestehende `notifications`-Tabelle bekommt neue Spalten:

```sql
-- Migration: add_alert_lifecycle_columns
ALTER TABLE notifications ADD COLUMN acknowledged_at TIMESTAMPTZ;
ALTER TABLE notifications ADD COLUMN acknowledged_by INTEGER REFERENCES user_accounts(id) ON DELETE SET NULL;
ALTER TABLE notifications ADD COLUMN resolved_at TIMESTAMPTZ;
-- ENTFERNT: parent_notification_id → parent_notification_id EXISTIERT BEREITS
ALTER TABLE notifications ADD COLUMN correlation_id VARCHAR(128);

-- Index fuer Alert-Lifecycle-Queries
CREATE INDEX ix_notifications_status_severity ON notifications(status, severity)
    WHERE resolved_at IS NULL;
CREATE INDEX ix_notifications_correlation ON notifications(correlation_id)
    WHERE correlation_id IS NOT NULL;
-- ENTFERNT: parent-Index → ix_notifications_fingerprint_unique existiert bereits fuer Dedup
```

**WICHTIG:** Das `status`-Feld existiert NICHT in der aktuellen `notifications`-Tabelle. Es muss hinzugefuegt werden:

```sql
ALTER TABLE notifications ADD COLUMN status VARCHAR(20) DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'resolved'));
```

Bestehende Notifications bekommen `status = 'resolved'` (da sie bereits gelesen/verarbeitet sind).

> **[VERIFY-PLAN KORREKTUR]** Die Spalte `parent_notification_id` im Plan muss zu `parent_notification_id` geaendert werden — dieses Feld EXISTIERT BEREITS im Model (`Notification.parent_notification_id`, UUID FK auf `notifications.id`, ON DELETE SET NULL). Die Migration muss es NICHT erneut anlegen. Nur `status`, `acknowledged_at`, `acknowledged_by`, `resolved_at`, `correlation_id` sind tatsaechlich NEU. Ausserdem: Das Python-Attribut heisst `extra_data`, der DB-Spaltenname ist `metadata` (via `mapped_column("metadata", JSON, ...)`). Plan-Code der auf `Notification.metadata` zugreift muss `Notification.extra_data` verwenden.

### 4B.1.2 — Notification Model erweitern

**Datei:** `El Servador/god_kaiser_server/src/db/models/notification.py`

> **[VERIFY-PLAN KORREKTUR]** Model nutzt SQLAlchemy 2.0 Mapped-Syntax (`Mapped[type] = mapped_column(...)`), NICHT `Column()`. `parent_notification_id` existiert bereits (Zeile 165). Das Python-Attribut fuer JSON-Metadata heisst `extra_data` (mapped auf DB-Spalte `metadata`).

Bestehende `Notification`-Klasse erweitern (NICHT neue Klasse):

```python
# Neue Spalten im bestehenden Notification Model (SQLAlchemy 2.0 Mapped-Syntax!):
status: Mapped[str] = mapped_column(
    String(20), default='active', nullable=False,
    doc="Alert lifecycle status (active, acknowledged, resolved)"
)
acknowledged_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True), nullable=True,
    doc="Timestamp when alert was acknowledged"
)
acknowledged_by: Mapped[Optional[int]] = mapped_column(
    Integer, ForeignKey('user_accounts.id', ondelete='SET NULL'), nullable=True,
    doc="User who acknowledged the alert"
)
resolved_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True), nullable=True,
    doc="Timestamp when alert was resolved"
)
# ENTFERNT: parent_notification_id — parent_notification_id EXISTIERT BEREITS (Zeile 165)
correlation_id: Mapped[Optional[str]] = mapped_column(
    String(128), nullable=True, index=True,
    doc="Correlation ID for grouping related alerts (e.g., grafana_{fingerprint})"
)
```

### 4B.1.3 — NotificationRepository + NotificationRouter erweitern

> **[VERIFY-PLAN KORREKTUR]** `src/notifications/service.py` existiert NICHT. Es gibt keinen separaten `NotificationService`. Die Logik ist aufgeteilt:
> - **NotificationRouter** (`src/services/notification_router.py`): Routing, Broadcast, Email-Delivery, `persist_suppressed()`
> - **NotificationRepository** (`src/db/repositories/notification_repo.py`): CRUD, Queries, Deduplication-Checks
>
> Die neuen Lifecycle-Methoden `acknowledge_alert()`, `resolve_alert()`, `auto_resolve_by_correlation()` gehoeren in das **Repository** (DB-Operationen) mit Broadcast-Logik im **Router**.

**Dateien:**
- `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py` (CRUD + Queries)
- `El Servador/god_kaiser_server/src/services/notification_router.py` (WS-Broadcast nach State-Change)

Neue Methoden im bestehenden `NotificationRepository`:

```python
## NotificationRepository (src/db/repositories/notification_repo.py):

async def acknowledge_alert(self, alert_id: UUID, user_id: int) -> Notification:
    """Alert als gesehen markieren — Lifecycle: active → acknowledged."""
    notification = await self.session.get(Notification, alert_id)
    if not notification or notification.user_id != user_id:
        raise NotFoundError(f"Alert {alert_id} not found")
    if notification.status != 'active':
        raise InvalidStateTransition(f"Cannot acknowledge alert in status '{notification.status}'")
    notification.status = 'acknowledged'
    notification.acknowledged_at = datetime.now(UTC)
    notification.acknowledged_by = user_id
    await self.session.flush()
    return notification

async def resolve_alert(self, alert_id: UUID, user_id: int | None = None) -> Notification:
    """Alert als erledigt markieren — Lifecycle: active|acknowledged → resolved."""
    notification = await self.session.get(Notification, alert_id)
    if not notification:
        raise NotFoundError(f"Alert {alert_id} not found")
    if notification.status == 'resolved':
        return notification  # Idempotent
    notification.status = 'resolved'
    notification.resolved_at = datetime.now(UTC)
    await self.session.flush()
    return notification

async def auto_resolve_by_correlation(self, correlation_id: str) -> int:
    """Alle aktiven Alerts mit gleicher correlation_id resolven (Grafana resolved-Event)."""
    result = await self.session.execute(
        update(Notification)
        .where(Notification.correlation_id == correlation_id)
        .where(Notification.status != 'resolved')
        .values(status='resolved', resolved_at=datetime.now(UTC))
    )
    return result.rowcount

## NotificationRouter (src/services/notification_router.py) — WS-Broadcast nach State-Change:

async def broadcast_alert_status_change(self, notification: Notification) -> None:
    """Broadcast notification_updated mit status/acknowledged_at/resolved_at."""
    # HINWEIS: broadcast_notification_updated() existiert bereits (Zeile 343),
    # muss um die neuen Felder erweitert werden:
    # data = { ...bestehendes..., 'status': notification.status,
    #          'acknowledged_at': ..., 'resolved_at': ... }
    pass
```

### 4B.1.4 — NotificationRouter erweitern: Root-Cause-Korrelation

**Datei:** `El Servador/god_kaiser_server/src/services/notification_router.py`

> **[VERIFY-PLAN KORREKTUR]** Pfad korrigiert. Bestehende `route()` Methode (Zeile 69) hat 5 Steps: Dedup → DB-Persist → Preferences → WS-Broadcast → Email. Neuer Step 6 (Root-Cause) kommt NACH DB-Write. Ausserdem: `Notification.extra_data` statt `Notification.metadata` im Python-Code verwenden.

Bestehenden `NotificationRouter.route()` erweitern:

```python
async def route(self, notification: NotificationCreate) -> Notification:
    # --- BESTEHENDE LOGIK (nicht aendern) ---
    # 1. Deduplication Check
    # 2. AlertSuppression Check (ISA-18.2)
    # 3. Rate-Limiting
    # 4. Channel-Selection (WS, Email, Digest)
    # 5. DB-Write + Broadcast

    # --- NEUE LOGIK (nach DB-Write ergaenzen) ---
    # 6. Root-Cause-Korrelation
    if notification.source == 'mqtt_handler' and notification.severity == 'critical':
        # MQTT-Offline ist Root-Cause → alle gleichzeitigen Sensor-Stale-Alerts
        # bekommen parent_notification_id
        await self._suppress_dependent_alerts(
            parent_id=saved_notification.id,
            esp_id=notification.metadata.get('esp_id'),
            window_seconds=30
        )

async def _suppress_dependent_alerts(self, parent_id: UUID, esp_id: str, window_seconds: int = 30):
    """Sensor-Alerts die durch MQTT-Offline verursacht wurden als abhaengig markieren."""
    cutoff = datetime.now(UTC) - timedelta(seconds=window_seconds)
    await self.db.execute(
        update(Notification)
        .where(Notification.created_at >= cutoff)
        .where(Notification.source == 'sensor_threshold')
        .where(Notification.extra_data['esp_id'].astext == esp_id)
        .where(Notification.parent_notification_id.is_(None))
        .values(parent_notification_id=parent_id)
    )
```

### 4B.1.5 — API-Endpoints erweitern

**Datei:** `El Servador/god_kaiser_server/src/api/v1/notifications.py`

> **[VERIFY-PLAN KORREKTUR]** Aktuell 9 Endpoints (nicht 19 wie im Plan). Auth nutzt `Depends(get_current_active_user)` (nicht `get_current_user`). Service-Calls gehen ueber `NotificationRepository(session)` direkt, NICHT ueber einen `NotificationService`. API-Route-Shadowing-Praevention beachten: `/alerts/active` und `/alerts/stats` muessen VOR `/{alert_id}` deklariert werden.

Neue Endpoints im bestehenden Router:

```python
@router.patch("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: UUID,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    """Alert als gesehen markieren (ISA-18.2 Acknowledge)."""
    return await service.acknowledge_alert(alert_id, current_user.id)

@router.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: UUID,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    """Alert als erledigt markieren (ISA-18.2 Resolve)."""
    return await service.resolve_alert(alert_id, current_user.id)

@router.get("/alerts/active")
async def get_active_alerts(
    severity: str | None = None,
    source: str | None = None,
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    """Alle aktiven (nicht-resolved) Alerts, optional gefiltert."""
    return await service.get_alerts_by_status(
        user_id=current_user.id,
        statuses=['active', 'acknowledged'],
        severity=severity,
        source=source,
    )

@router.get("/alerts/stats")
async def get_alert_stats(
    current_user: User = Depends(get_current_user),
    service: NotificationService = Depends(get_notification_service),
):
    """ISA-18.2 Metriken: Alerts/Stunde, stehende Alerts, Acknowledge-Rate."""
    return await service.get_isa_metrics(current_user.id)
```

### 4B.1.6 — GrafanaWebhookHandler erweitern: Auto-Resolve

**Datei:** `El Servador/god_kaiser_server/src/api/v1/webhooks.py`

> **[VERIFY-PLAN KORREKTUR]** Endpoint: `POST /v1/webhooks/grafana-alerts`. Bestehende Pipeline: Parse Alertmanager-Payload → extract alertname/severity/status → categorize (keyword-based) → map severity (FIX-02: resolved→info) → build metadata (grafana_fingerprint, labels, urls) → create NotificationCreate mit fingerprint → route via NotificationRouter. Fingerprint-Dedup via unique partial index.

Bestehende Grafana-Webhook-Logik erweitern:

```python
# In der bestehenden grafana_webhook() Funktion:
# NACH dem Routing fuer neue Alerts, VOR dem Return:

if alert_status == 'resolved':
    # Grafana sendet resolved → alle Alerts mit gleicher correlation_id resolven
    correlation_id = f"grafana_{alert.get('fingerprint', alert.get('labels', {}).get('alertname', ''))}"
    resolved_count = await notification_service.auto_resolve_by_correlation(correlation_id)
    logger.info(f"Auto-resolved {resolved_count} alerts for correlation_id={correlation_id}")
```

**WICHTIG:** Beim Erstellen neuer Grafana-Alerts muss die `correlation_id` gesetzt werden:

```python
# Beim Routing neuer Grafana-Alerts:
notification = NotificationCreate(
    severity=severity,
    source='grafana',
    category=category,
    title=alert_title,
    body=alert_body,
    correlation_id=f"grafana_{fingerprint}",  # NEU
    metadata={...}
)
```

### 4B.1.7 — Frontend: alert-center.store.ts (NEUER Store)

**Datei:** `El Frontend/src/shared/stores/alert-center.store.ts` (NEU)

> **[VERIFY-PLAN KORREKTUR]** Pfad korrigiert: `shared/stores/`, NICHT `stores/`. Import-Pfad fuer notification-inbox.store stimmt (gleicher Ordner). Nach Erstellung: Re-Export in `shared/stores/index.ts` hinzufuegen (Zeile 23/24 dort sind die bestehenden Notification-Exports). `NotificationDTO` in `api/notifications.ts` hat aktuell KEIN `status`-Feld — muss vorher erweitert werden (4B.1.8).

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNotificationInboxStore } from './notification-inbox.store'
import { acknowledgeAlert, resolveAlert, getAlertStats } from '@/api/notifications'

export const useAlertCenterStore = defineStore('alert-center', () => {
  // Re-use notification-inbox.store als Datenquelle
  const inboxStore = useNotificationInboxStore()

  // ISA-18.2 Metriken (vom Backend geladen)
  const isaMetrics = ref<{
    alerts_per_hour: number
    alerts_per_day: number
    standing_alerts: number
    critical_ratio: number
    actionable_rate: number
  } | null>(null)

  // Health-Dashboard Daten
  const healthStatus = ref<{
    overall_status: 'healthy' | 'warning' | 'critical'
    components: Record<string, { status: string; [key: string]: unknown }>
    active_alerts: { critical: number; warning: number; info: number }
  } | null>(null)

  // === Computed: Alert-Lifecycle-Views (aus notification-inbox.store) ===

  // HINWEIS: NotificationDTO muss um 'status' Feld erweitert werden (4B.1.8).
  // Bis dahin: Fallback auf is_read als Proxy (is_read=false → active, is_read=true → acknowledged)
  const activeAlerts = computed(() =>
    inboxStore.notifications.filter(n => n.status === 'active')
  )

  const acknowledgedAlerts = computed(() =>
    inboxStore.notifications.filter(n => n.status === 'acknowledged')
  )

  const resolvedAlerts = computed(() =>
    inboxStore.notifications.filter(n => n.status === 'resolved')
  )

  const unresolvedAlerts = computed(() =>
    inboxStore.notifications.filter(n => n.status !== 'resolved')
  )

  // Alert-Counts nach Severity (nur unresolved)
  const alertCountBySeverity = computed(() => ({
    critical: unresolvedAlerts.value.filter(a => a.severity === 'critical').length,
    warning: unresolvedAlerts.value.filter(a => a.severity === 'warning').length,
    info: unresolvedAlerts.value.filter(a => a.severity === 'info').length,
  }))

  // System-Gesamtstatus (worst-of)
  const overallStatus = computed<'healthy' | 'warning' | 'critical'>(() => {
    if (alertCountBySeverity.value.critical > 0) return 'critical'
    if (alertCountBySeverity.value.warning > 0) return 'warning'
    return 'healthy'
  })

  // Root-Cause-gefilterte Alerts (parent_notification_id === null → Top-Level)
  const topLevelAlerts = computed(() =>
    unresolvedAlerts.value.filter(a => !a.parent_notification_id)
  )

  // === Actions ===

  async function acknowledge(alertId: string) {
    await acknowledgeAlert(alertId)
    // Optimistic Update (WS-Event wird auch kommen)
    const alert = inboxStore.notifications.find(n => n.id === alertId)
    if (alert) {
      alert.status = 'acknowledged'
      alert.acknowledged_at = new Date().toISOString()
    }
  }

  async function resolve(alertId: string) {
    await resolveAlert(alertId)
    const alert = inboxStore.notifications.find(n => n.id === alertId)
    if (alert) {
      alert.status = 'resolved'
      alert.resolved_at = new Date().toISOString()
    }
  }

  async function loadIsaMetrics() {
    isaMetrics.value = await getAlertStats()
  }

  async function loadHealthDashboard() {
    healthStatus.value = await getHealthDashboard()
  }

  return {
    // State
    isaMetrics,
    healthStatus,
    // Computed
    activeAlerts,
    acknowledgedAlerts,
    resolvedAlerts,
    unresolvedAlerts,
    alertCountBySeverity,
    overallStatus,
    topLevelAlerts,
    // Actions
    acknowledge,
    resolve,
    loadIsaMetrics,
    loadHealthDashboard,
  }
})
```

**WICHTIG:** Dieser Store erstellt KEINE eigene Datenhaltung. Er nutzt `notification-inbox.store.ts` als Single Source of Truth und bietet darauf Alert-Lifecycle-spezifische Views und Actions.

### 4B.1.8 — API-Client erweitern

**Datei:** `El Frontend/src/api/notifications.ts`

> **[VERIFY-PLAN KORREKTUR]** Der API-Client nutzt Pattern `notificationsApi = { ... }` als Objekt-Literal (nicht einzelne export-Funktionen). Neue Methoden muessen ins bestehende `notificationsApi`-Objekt eingefuegt werden. Ausserdem: `NotificationDTO` Interface muss um `status`, `acknowledged_at`, `resolved_at`, `acknowledged_by`, `correlation_id` erweitert werden. API-Base-URL hat kein `/v1/` Prefix im Client — der Axios-Client hat `baseURL: /api/v1` konfiguriert, also nur relative Pfade verwenden.

Erweiterungen im bestehenden API-Client:

```typescript
// 1. NotificationDTO Interface erweitern (bestehend in notifications.ts):
interface NotificationDTO {
  // ... bestehende Felder ...
  status?: 'active' | 'acknowledged' | 'resolved'  // NEU
  acknowledged_at?: string | null                    // NEU
  resolved_at?: string | null                        // NEU
  acknowledged_by?: number | null                    // NEU
  correlation_id?: string | null                     // NEU
}

// 2. Neue Methoden im bestehenden notificationsApi Objekt:
export const notificationsApi = {
  // ... bestehende Methoden ...

  async acknowledgeAlert(alertId: string) {
    const { data } = await api.patch<NotificationDTO>(`/alerts/${alertId}/acknowledge`)
    return data
  },

  async resolveAlert(alertId: string) {
    const { data } = await api.patch<NotificationDTO>(`/alerts/${alertId}/resolve`)
    return data
  },

  async getActiveAlerts(filters?: { severity?: string; source?: string }) {
    const { data } = await api.get<NotificationDTO[]>('/alerts/active', { params: filters })
    return data
  },

  async getAlertStats() {
    const { data } = await api.get<IsaMetrics>('/alerts/stats')
    return data
  },
}

// 3. KEIN getHealthDashboard() hier — Health-API-Client existiert bereits in src/api/health.ts
//    Dort ggf. erweitern falls neuer /health/dashboard Endpoint kommt
```

### Verifikation Block 4B.1

- [ ] Migration laeuft fehlerfrei (up + down) — `status`, `acknowledged_at/by`, `resolved_at`, `correlation_id`
- [ ] `Notification` Model hat alle neuen Spalten (SQLAlchemy 2.0 Mapped-Syntax)
- [ ] `NotificationRepository.acknowledge_alert()` setzt Status korrekt
- [ ] `NotificationRepository.resolve_alert()` ist idempotent
- [ ] `NotificationRepository.auto_resolve_by_correlation()` findet Alerts korrekt
- [ ] `NotificationRouter._suppress_dependent_alerts()` markiert abhaengige Alerts (nutzt `parent_notification_id`)
- [ ] `NotificationRouter.broadcast_notification_updated()` sendet `status`, `acknowledged_at`, `resolved_at`
- [ ] API: `PATCH /alerts/{id}/acknowledge` → 200 mit aktualisiertem Alert
- [ ] API: `PATCH /alerts/{id}/resolve` → 200 mit aktualisiertem Alert
- [ ] API: `GET /alerts/active` → nur unresolved Alerts (Route-Shadowing ok)
- [ ] API: `GET /alerts/stats` → ISA-18.2 Metriken
- [ ] WS: `notification_updated` Event nach Acknowledge/Resolve enthält neue Felder
- [ ] GrafanaWebhookHandler setzt `correlation_id` bei neuen Alerts
- [ ] GrafanaWebhookHandler resolved Alerts automatisch bei Grafana `resolved`
- [ ] `alert-center.store.ts` in `src/shared/stores/` mit Re-Export in `index.ts`
- [ ] `alert-center.store.ts` berechnet `overallStatus` korrekt (worst-of)
- [ ] `alert-center.store.ts` filtert `topLevelAlerts` korrekt (ohne `parent_notification_id`)
- [ ] `notification-inbox.store.ts` WS-Handler verarbeitet `status`/`acknowledged_at`/`resolved_at`
- [ ] `NotificationDTO` Interface hat neue Felder (status, acknowledged_at, resolved_at, correlation_id)
- [ ] API-Client: `acknowledgeAlert()`, `resolveAlert()`, `getAlertStats()` funktionieren im `notificationsApi`-Objekt
- [ ] `NotificationCreate` Schema hat `correlation_id` Feld

---

## Block 4B.2: Alert-UI Komponenten (~5-6h)

### 4B.2.1 — AlertStatusBar.vue (NEU)

**Datei:** `El Frontend/src/components/alerts/AlertStatusBar.vue` (NEU)

> **[VERIFY-PLAN KORREKTUR]** Es gibt KEIN `MainLayout.vue` — der Header ist `TopBar.vue` in `src/shared/design/layout/TopBar.vue`. Die TopBar hat bereits: Navigation-Links, NotificationBadge (Bell + Badge), EmergencyStopButton, ConnectionDot. Ausserdem EXISTIERT BEREITS: `HealthSummaryBar.vue` in `src/components/system-monitor/` — zeigt offline Devices, Low Heap, Weak Signal als Problem-Chips mit expandable Details. Design der AlertStatusBar MUSS an das bestehende HealthSummaryBar-Pattern angelehnt werden (gleiche Glassmorphism-Aesthetik, HealthProblemChip Komponente wiederverwenden).

Permanente Status-Leiste im Header der Applikation. Zeigt auf einen Blick den System-Gesamtstatus.

**Design-Referenz:** `HealthSummaryBar.vue` + `HealthProblemChip.vue` (bestehende Pattern verwenden!)

**Mockup:**
```
┌──────────────────────────────────────────────────────────────┐
│  ● System OK  |  ⚠ 2 Warnings  |  🔴 1 Critical           │
│                                                              │
│  (Expandable: Klick zeigt Top-Alerts, wie HealthSummaryBar) │
└──────────────────────────────────────────────────────────────┘
```

**Verhalten:**
- Zeigt `overallStatus` aus `alert-center.store.ts` als farbigen Punkt
- Zeigt Alert-Counts nach Severity (nur unresolved, ohne `parent_notification_id`)
- Klick auf eine Severity-Zahl → oeffnet NotificationDrawer gefiltert nach dieser Severity
- Critical-Status: Hintergrund wird leicht rot getont (subtil, nicht aggressiv)
- Responsive: Auf mobilen Bildschirmen nur Punkt + hoechste Severity anzeigen

**Integration in TopBar.vue** (`src/shared/design/layout/TopBar.vue`):
```vue
<!-- In TopBar.vue, VOR dem NotificationBadge: -->
<AlertStatusBar @filter-click="openDrawerWithFilter" />
<NotificationBadge />  <!-- bestehendes Element -->
```

### 4B.2.2 — NotificationDrawer.vue + NotificationItem.vue erweitern

**Dateien:**
- `El Frontend/src/components/notifications/NotificationDrawer.vue` (~330 Zeilen, BESTEHT)
- `El Frontend/src/components/notifications/NotificationItem.vue` (~343 Zeilen, BESTEHT)

> **[VERIFY-PLAN KORREKTUR]** Die Action-Buttons (Als gelesen, Zum Sensor, Zur Regel, In Grafana) sind in `NotificationItem.vue` implementiert (nicht im Drawer selbst). Neue Acknowledge/Resolve-Buttons muessen dort ergaenzt werden. Der Drawer hat 4 bestehende Filter-Tabs (Alle/Kritisch/Warnungen/System) — die neuen Status-Tabs (Aktiv/Gesehen/Erledigt) muessen als ZWEITE Tab-Leiste oder als Ersatz fuer die bestehende implementiert werden.

Bestehende SlideOver-Komponente erweitern:

**Neue Elemente:**
1. **Status-Tabs** oben im Drawer: `Aktiv (3)` | `Gesehen (2)` | `Erledigt (5)` | `Alle`
2. **Acknowledge-Button** pro Alert-Eintrag (nur bei `status === 'active'`):
   - Icon: Haeckchen
   - Klick → `alertCenterStore.acknowledge(alertId)`
   - Nach Klick: Alert rutscht in Tab "Gesehen"
3. **Resolve-Button** pro Alert-Eintrag (bei `active` oder `acknowledged`):
   - Icon: Doppel-Haeckchen
   - Klick → `alertCenterStore.resolve(alertId)`
   - Nach Klick: Alert rutscht in Tab "Erledigt"
4. **Root-Cause-Gruppierung**: Alerts mit `parent_notification_id` werden unter ihrem Parent eingeruckt angezeigt (Collapsible)
5. **Auto-Resolve Indikator**: Alerts die durch Grafana auto-resolved wurden, zeigen ein kleines "Auto" Badge

**NICHT aendern:**
- SlideOver-Mechanik (oeffnen/schliessen Animation)
- Mark-as-read Logik
- Severity-Filter (funktioniert bereits)
- WebSocket-Update-Handling (funktioniert bereits)

### 4B.2.3 — NotificationBadge.vue erweitern

**Datei:** `El Frontend/src/components/notifications/NotificationBadge.vue` (BESTEHT)

> **[VERIFY-PLAN KORREKTUR]** Die Badge-Komponente hat BEREITS:
> - Badge-Farbe nach Severity: critical=rot, warning=gelb, info=grau (**EXISTIERT**)
> - Pulse-Animation bei Critical (2s Zyklus) (**EXISTIERT**)
> - Badge-Zahl = `unreadCount` (max "99+") (**EXISTIERT**)
> - Click togglet Drawer (**EXISTIERT**)
>
> **Einzige TATSAECHLICHE Aenderung:** Badge-Zahl von `unreadCount` auf `active + acknowledged` Count umstellen (aus alert-center.store statt inbox.store). Farben und Pulse bleiben unveraendert!

Bestehende Badge-Komponente minimal anpassen:

**Einzige Aenderung:**
- Badge-Zahl: `unreadCount` (aus inboxStore) → `unresolvedAlerts.length` (aus alertCenterStore)
- Alles andere bleibt: Farben, Pulse, Click-Handler

### 4B.2.4 — AlertBadge.vue (NEU)

**Datei:** `El Frontend/src/components/alerts/AlertBadge.vue` (NEU)

Wiederverwendbarer Mini-Badge fuer bestehende Cards:

```vue
<script setup lang="ts">
const props = defineProps<{
  entityType: 'esp' | 'sensor' | 'rule'
  entityId: string
}>()
</script>
```

**Verhalten:**
- Zeigt kleinen farbigen Punkt (rot/gelb) auf der Card, wenn aktive Alerts fuer diese Entity existieren
- Filtert aus `alert-center.store.topLevelAlerts` nach `metadata.esp_id`, `metadata.sensor_type`, oder `metadata.rule_id`
- Klick → oeffnet NotificationDrawer gefiltert nach dieser Entity

> **[VERIFY-PLAN HINWEIS]** `metadata` in NotificationDTO ist `Record<string, unknown>`. Die Felder `esp_id`, `sensor_type`, `rule_id` sind NICHT typisiert — sie kommen als dynamische Keys aus dem Server. FilterLogik muss safe casten: `(n.metadata?.esp_id as string) === entityId`

**Integration in bestehende Cards:**

1. **ESPCard** (HardwareView): `<AlertBadge entity-type="esp" :entity-id="esp.esp_id" />`
2. **SensorCard** (MonitorView): `<AlertBadge entity-type="sensor" :entity-id="sensor.id" />`
3. **RuleCard** (LogicView): `<AlertBadge entity-type="rule" :entity-id="rule.id" />`

### 4B.2.5 — QuickAlertPanel.vue erweitern

**Datei:** `El Frontend/src/components/quick-action/QuickAlertPanel.vue` (BESTEHT)

**Aenderungen:**
- Status-Filter-Chips oben: `Active` | `Acknowledged` | `All`
- Acknowledge-Swipe oder -Button direkt im Panel (schnelle Interaktion)
- "Alle bestaetigen" Button wenn > 3 aktive Alerts (Batch-Acknowledge)

### 4B.2.6 — System Monitor Integration (NEU)

> **[VERIFY-PLAN ERGAENZUNG]** Der System Monitor (`SystemMonitorView.vue`, 88KB) ist das zentrale Monitoring-Feature mit 6 Tabs und 20 Sub-Komponenten. Er MUSS in die Alert-Lifecycle-Integration einbezogen werden — der Plan ignoriert ihn komplett.

**Dateien:**
- `El Frontend/src/components/system-monitor/HealthTab.vue` — Fleet Health KPIs
- `El Frontend/src/components/system-monitor/HealthSummaryBar.vue` — Problem-Overview
- `El Frontend/src/components/system-monitor/EventsTab.vue` — Event-Liste
- `El Frontend/src/views/SystemMonitorView.vue` — Orchestrator

**Aenderungen:**

1. **HealthTab.vue erweitern:**
   - Neue KPI-Card: "Active Alerts" (critical/warning/info Counts aus `alertCenterStore`)
   - Alert-Severity-Verteilung als Mini-Chart (Donut oder Stacked Bar)
   - "Zur Alert-Inbox" Link bei Critical Alerts

2. **HealthSummaryBar.vue erweitern:**
   - Neben bestehenden Problem-Chips (offline/heap/signal): Neue `HealthProblemChip` fuer "X Critical Alerts" / "Y Warning Alerts"
   - Klick auf Alert-Chip → oeffnet NotificationDrawer gefiltert

3. **EventsTab.vue — Notification-Events:**
   - Bestehender `notification` Event-Typ in EventTimeline zeigt Alert-Status (active/acknowledged/resolved)
   - Acknowledge/Resolve-Buttons direkt in der Event-Detail-Ansicht (`EventDetailsPanel.vue`)

**NICHT aendern:**
- Tab-Struktur (6 Tabs bleiben)
- Filter-Mechanik (Severity, ESP, Time Range)
- Event-Grouping-Logik
- Database/Server Logs/MQTT Traffic Tabs

### Verifikation Block 4B.2

- [ ] AlertStatusBar zeigt korrekten Gesamtstatus (healthy/warning/critical)
- [ ] AlertStatusBar: Klick auf Severity-Zahl oeffnet gefilterten Drawer
- [ ] AlertStatusBar: Critical → roter Hintergrund-Tint
- [ ] NotificationDrawer: Status-Tabs funktionieren (Active/Acknowledged/Resolved/All)
- [ ] NotificationDrawer: Acknowledge-Button setzt Status korrekt
- [ ] NotificationDrawer: Resolve-Button setzt Status korrekt
- [ ] NotificationDrawer: Root-Cause-Gruppierung zeigt abhaengige Alerts eingeruckt
- [ ] NotificationBadge: Farbe basiert auf hoechster Severity
- [ ] NotificationBadge: Zaehlt nur unresolved Alerts
- [ ] NotificationBadge: Pulsiert bei Critical
- [ ] AlertBadge auf ESPCard: Zeigt Badge wenn Device-Alert aktiv
- [ ] AlertBadge auf SensorCard: Zeigt Badge wenn Sensor-Alert aktiv
- [ ] AlertBadge auf RuleCard: Zeigt Badge wenn Rule-Alert aktiv
- [ ] QuickAlertPanel: Status-Filter funktioniert
- [ ] QuickAlertPanel: Batch-Acknowledge funktioniert
- [ ] System Monitor HealthTab: Active-Alert KPI-Card sichtbar
- [ ] System Monitor HealthSummaryBar: Alert-Problem-Chips sichtbar
- [ ] System Monitor EventsTab: Notification-Events zeigen Alert-Status

---

## Block 4B.3: Sensor-Threshold-Alerts — correlation_id ergaenzen (~1h statt 3-4h)

> **[VERIFY-PLAN KRITISCHE KORREKTUR]** Dieser Block ist zu 95% BEREITS IMPLEMENTIERT (Phase 4A.7)!
>
> **Was EXISTIERT (sensor_handler.py Zeile 375-605):**
> - `_evaluate_thresholds_and_notify()` — vollstaendige Pipeline
> - Threshold-Check nach jedem DB-Write (Zeile 382-396: `if sensor_config: await self._evaluate_thresholds_and_notify(...)`)
> - `AlertSuppressionService.get_effective_thresholds()` — Custom alert_config > Global sensor_config
> - `AlertSuppressionService.check_thresholds()` — critical_min/max, warning_min/max
> - Sensor-level + Device-level Suppression (`is_sensor_suppressed()`)
> - Suppressed Alerts werden via `persist_suppressed()` als ISA-18.2 Audit-Trail gespeichert (channel="suppressed", is_read=True)
> - Unsuppressed Alerts gehen durch `NotificationRouter.route()` (volle Pipeline: Dedup, WS, Email)
> - Metadata enthält: esp_id, gpio, sensor_type, sensor_config_id, value, severity, thresholds
> - Deduplication via title-based 60s Window (NotificationRouter Standard)
>
> **Was FEHLT (einzige Erweiterung noetig):**
> - `correlation_id` wird NICHT gesetzt — muss in `_evaluate_thresholds_and_notify()` zum NotificationCreate hinzugefuegt werden
> - Erst NACHDEM die DB-Migration `correlation_id` Spalte hinzufuegt (Block 4B.1.1)
>
> **Plan-Annahme "Threshold-Checks existieren nicht" ist FALSCH.**

### Einzige Aenderung

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

In `_evaluate_thresholds_and_notify()` (Zeile 584, unsuppressed NotificationCreate):

```python
# Bestehender Code (Zeile 584-594):
notification = NotificationCreate(
    severity=severity,
    category="data_quality",
    title=f"Schwellenwert-Alarm: {sensor_name}",
    body=(...),
    source="sensor_threshold",
    metadata=alert_metadata,
    # NEU HINZUFUEGEN:
    correlation_id=f"threshold_{esp_id_str}_{sensor_type}",
)
```

Gleiche Aenderung fuer den suppressed-Pfad (Zeile 560, suppressed NotificationCreate).

### AlertConfig-Cache

> **[VERIFY-PLAN KORREKTUR]** Kein Cache noetig! Die bestehende Pipeline nutzt `sensor_config` das bereits im Haupt-Ingestion-Flow geladen wird (1x pro Message). `AlertSuppressionService.get_effective_thresholds(sensor_config)` operiert direkt auf dem bereits geladenen Objekt — kein extra DB-Query.

### Deduplication

Der bestehende `NotificationRouter` hat bereits Deduplication eingebaut (title-based 60s Window). Nach Hinzufuegen der `correlation_id` ermoeglicht diese zusaetzlich das spaetere Auto-Resolve (Block 4B.1.6).

### Verifikation Block 4B.3 (drastisch reduziert)

- [x] ~~Sensor-Wert ueber critical → Alert~~ **EXISTIERT BEREITS**
- [x] ~~Sensor-Wert unter warning → Alert~~ **EXISTIERT BEREITS**
- [x] ~~Normalbereich → kein Alert~~ **EXISTIERT BEREITS**
- [x] ~~Alert-Config disabled → kein Alert~~ **EXISTIERT BEREITS (Suppression)**
- [x] ~~Cache~~ **NICHT NOETIG (sensor_config bereits geladen)**
- [x] ~~Deduplication~~ **EXISTIERT BEREITS (title-based 60s)**
- [x] ~~Alert im Frontend~~ **EXISTIERT BEREITS (NotificationRouter → WS → InboxStore)**
- [x] ~~Korrekte metadata~~ **EXISTIERT BEREITS**
- [ ] `correlation_id` in NotificationCreate setzen (EINZIGE neue Aufgabe)

---

## Block 4B.4: Health-Aggregation Service (~2-3h statt 3-4h)

> **[VERIFY-PLAN KORREKTUR]** Die bestehenden Health-Endpoints sind VIEL umfangreicher als im Plan angenommen:
>
> | Endpoint | Was er liefert | Status |
> |----------|---------------|--------|
> | `GET /v1/health/` | status, version, uptime | EXISTIERT |
> | `GET /v1/health/detailed` | DB (pool, latency), MQTT (connected, subscriptions, msg counts), WS (connections, messages), System (CPU%, RAM%, Disk%), components[], warnings[] | **EXISTIERT — sehr umfangreich!** |
> | `GET /v1/health/esp` | Fleet-Health: online/offline/error/unknown counts, per-device (uptime, heap, rssi, sensor/actuator count, recent_errors aus AuditLog) | **EXISTIERT — genau was der Plan braucht!** |
> | `GET /v1/health/live` | K8s Liveness Probe | EXISTIERT |
> | `GET /v1/health/ready` | K8s Readiness: DB + MQTT Check | EXISTIERT |
>
> **Frontend hat BEREITS:**
> - `src/api/health.ts` — `getFleetHealth()` API-Client
> - `src/components/system-monitor/HealthTab.vue` — Fleet Health KPIs, sortierbare Device-Liste, Problem-Highlighting
> - `src/components/system-monitor/HealthSummaryBar.vue` — Compact problem overview (offline/heap/signal)
> - `src/components/system-monitor/HealthProblemChip.vue` — Problem-Badge Komponente
>
> **Tatsaechlich FEHLEND:** Nur Active-Alert-Counts + Logic-Engine-Status in Health-Response. ALTERNATIV: Alert-Counts koennen direkt aus `alert-center.store.ts` kommen (Frontend-seitig, ohne neuen Backend-Endpoint).

### Entscheidung: Neuer Endpoint oder Frontend-Aggregation?

**Option A: Neuer `/v1/health/dashboard` Endpoint** (wie im Plan)
- Pro: Alle Daten in einem Request, Server-seitig aggregiert
- Contra: Dupliziert grosse Teile von `/health/detailed` + `/health/esp`

**Option B: Frontend-Aggregation** (EMPFOHLEN)
- `getFleetHealth()` (existiert) → ESP-Status
- `alert-center.store.overallStatus` → Alert-Counts (aus notifications, bereits geladen)
- Optional: `/health/detailed` → Server/DB/MQTT-Status
- Pro: Kein neuer Endpoint, nutzt bestehende Infrastruktur
- Contra: 2 API-Calls statt 1

**Empfehlung:** Option B — Frontend-Aggregation. Falls doch Option A: `/health/dashboard` als AGGREGATOR der bestehenden Endpoints implementieren, NICHT duplizieren.

### 4B.4.1 — Health-Dashboard Endpoint (nur falls Option A gewaehlt)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/health.py`

Neuer Endpoint (neben den **5 bestehenden** Endpoints):

```python
@router.get("/health/dashboard")
async def health_dashboard(
    db: AsyncSession = Depends(get_db),
    mqtt_manager = Depends(get_mqtt_manager),
    notification_service = Depends(get_notification_service),
):
    """Zentraler Health-Hub — aggregiert alle Systemkomponenten."""
    # Server-Status
    server_status = {
        "status": "healthy",
        "uptime": get_uptime(),
        "version": settings.VERSION,
    }

    # Database
    db_status = await check_database_health(db)

    # MQTT
    mqtt_status = await check_mqtt_health(mqtt_manager)

    # ESP-Devices (aus device_registry)
    esp_status = await get_esp_device_summary(db)

    # Monitoring-Stack
    monitoring_status = await check_monitoring_health()

    # Active Alerts (aus notifications Tabelle)
    alert_counts = await notification_service.get_alert_counts()

    # Logic Engine
    logic_status = await get_logic_engine_status(db)

    # Overall = worst-of
    overall = determine_overall_status([
        server_status, db_status, mqtt_status, esp_status, monitoring_status
    ])

    return {
        "overall_status": overall,
        "components": {
            "server": server_status,
            "database": db_status,
            "mqtt": mqtt_status,
            "esp_devices": esp_status,
            "monitoring": monitoring_status,
        },
        "active_alerts": alert_counts,
        "logic_engine": logic_status,
        "last_updated": datetime.now(UTC).isoformat(),
    }
```

### 4B.4.2 — Hilfsfunktionen

> **[VERIFY-PLAN KORREKTUR]** ESP-Device-Summary existiert BEREITS als `/v1/health/esp` Endpoint mit `ESPHealthSummaryResponse`. Die Funktion `get_esp_device_summary()` ist unnoetig — Endpoint direkt nutzen. ESPDevice Model hat `last_seen` (nicht `last_heartbeat`) und `status`-Feld (online/offline/error/unknown). Logic-Rule Model heisst `CrossESPLogic` (nicht `LogicRule`), Spalten: `rule_name`, `enabled` (nicht `is_enabled`). Es gibt kein `RuleExecution` Model — Logic-Ausfuehrungen werden im `AuditLog` protokolliert.

```python
# ENTFALLEN: get_esp_device_summary() — bereits in /v1/health/esp

async def check_monitoring_health() -> dict:
    """Prueft Erreichbarkeit von Grafana, Prometheus, Loki."""
    # HINWEIS: GRAFANA_URL, PROMETHEUS_URL, LOKI_URL muessen in Settings
    # existieren oder als Defaults definiert werden (aktuell: nur LOKI_URL in
    # manchen Configs). Defaults: grafana=3000, prometheus=9090, loki=3100
    results = {}
    for name, url in [
        ("grafana", f"http://grafana:3000"),
        ("prometheus", f"http://prometheus:9090"),
        ("loki", f"http://loki:3100"),
    ]:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{url}/ready" if name != "grafana" else f"{url}/api/health")
                results[name] = "up" if resp.status_code == 200 else "down"
        except Exception:
            results[name] = "unreachable"
    return {
        **results,
        "status": "healthy" if all(v == "up" for v in results.values()) else "warning",
    }

async def get_logic_engine_status(db: AsyncSession) -> dict:
    """Zaehlt aktive Rules."""
    # KORREKTUR: Model heisst CrossESPLogic, Spalte heisst 'enabled'
    from ..db.models.logic import CrossESPLogic
    active_rules = await db.scalar(
        select(func.count()).select_from(CrossESPLogic).where(CrossESPLogic.enabled == True)
    )
    # HINWEIS: Kein RuleExecution Model vorhanden. Ausfuehrungen im AuditLog.
    # Fuer executions_24h: AuditLog nach category='logic_execution' filtern.
    return {
        "active_rules": active_rules or 0,
    }
```

### 4B.4.3 — Frontend: Health-Integration in AlertStatusBar + System Monitor

> **[VERIFY-PLAN KORREKTUR]** Das Frontend hat BEREITS umfangreiche Health-UI:
> - `HealthTab.vue` — Fleet Health mit KPI-Cards (Online-Count, Heap, RSSI, Errors), sortierbare Device-Liste
> - `HealthSummaryBar.vue` — Compact Problem-Overview (offline/heap/signal) im Events-Tab
> - `HealthProblemChip.vue` — Wiederverwendbare Problem-Badges
> - `getFleetHealth()` API-Client (src/api/health.ts)
>
> **Strategie:** AlertStatusBar nutzt `alertCenterStore.overallStatus` + `alertCountBySeverity` (Alert-Lifecycle-Daten). ESP-Health-Daten kommen aus bestehendem `getFleetHealth()`. KEIN neuer `loadHealthDashboard()` noetig wenn Option B (Frontend-Aggregation) gewaehlt wird.

**Integration:**
- `AlertStatusBar.vue` nutzt `alertCenterStore.overallStatus` fuer Status-Punkt (Alerts-basiert)
- Optional: Tooltip zeigt ESP-Offline-Count aus `getFleetHealth()` (bestehender API-Client)
- `HealthTab.vue` im System Monitor um Active-Alert-Section erweitern (importiert `alertCenterStore`)
- `HealthSummaryBar.vue` um Alert-Problem-Chips erweitern (z.B. "2 Critical Alerts" neben "3 Geraete offline")

### Verifikation Block 4B.4

- [ ] `GET /v1/health/dashboard` → vollstaendige Antwort mit allen Komponenten
- [ ] `overall_status` = worst-of aller Komponenten
- [ ] ESP-Device-Count korrekt (online/offline/total)
- [ ] Monitoring-Check: Grafana/Prometheus/Loki Erreichbarkeit
- [ ] Logic-Engine: Aktive Rules + Ausfuehrungen korrekt gezaehlt
- [ ] `active_alerts`: Alert-Counts nach Severity korrekt
- [ ] Frontend: AlertStatusBar zeigt Health-Status korrekt
- [ ] Frontend: Auto-Refresh alle 30 Sekunden

---

## Prometheus-Metriken (4 neue Metriken)

Bestehende 11 Notification-Metriken bleiben unveraendert. Neue Metriken fuer Alert-Lifecycle:

| Metrik | Typ | Labels | Beschreibung |
|--------|-----|--------|-------------|
| `automationone_alerts_acknowledged_total` | Counter | severity, source | Zaehlt Acknowledge-Events |
| `automationone_alerts_resolved_total` | Counter | severity, source, resolution_type | Zaehlt Resolve-Events (manual/auto) |
| `automationone_alerts_active_gauge` | Gauge | severity | Aktuelle Anzahl aktiver (nicht-resolved) Alerts |
| `automationone_alerts_root_cause_suppressed_total` | Counter | source | Zaehlt durch Root-Cause unterdrückte abhaengige Alerts |

**Integration:** In den bestehenden `NotificationService`-Methoden `acknowledge_alert()` und `resolve_alert()` die Counter inkrementieren.

---

## ISA-18.2 Compliance-Ziele

Diese Benchmarks muessen im normalen Betrieb (3 ESPs, <20 Sensoren) eingehalten werden:

| Metrik | ISA-18.2 Standard | AutomationOne Ziel | Wie sichergestellt |
|--------|-------------------|-------------------|--------------------|
| Alarme pro Stunde | < 6 | < 3 | AlertSuppression (4A) + Root-Cause-Korrelation (4B) + Temporal Grouping |
| Alarme pro Tag | < 144 | < 30 | Rate-Limiting (4A) + Deduplication (4A) |
| Stehende Alarme | < 5 | < 2 | Auto-Resolve (Grafana) + Threshold-Hysterese |
| Critical-Anteil | < 5% | < 5% | Severity-Klassifikation in NotificationRouter |
| Actionable Rate | > 80% | > 90% | Root-Cause-Suppression entfernt Noise |

**Messung:** `GET /v1/alerts/stats` gibt diese Metriken zurueck. AlertStatusBar zeigt Warnung wenn Ziele ueberschritten werden.

---

## Alarm-Fatigue-Praevention (4 Massnahmen)

| Massnahme | Wo implementiert | Details |
|-----------|-----------------|---------|
| **Root-Cause Suppression** | `NotificationRouter._suppress_dependent_alerts()` (Block 4B.1.4) | MQTT-Offline → alle abhaengigen Sensor-Alerts bekommen `parent_notification_id`, werden im Drawer unter Parent gruppiert |
| **Temporal Grouping** | `NotificationRouter` Deduplication (existiert aus 4A) | Gleicher Alert-Typ + gleiche Quelle innerhalb 30s → nur 1 Alert |
| **Severity-basiertes Interrupt-Design** | `NotificationBadge` + `NotificationToast` (Block 4B.2) | Critical: Toast + Badge-Puls. Warning: nur Badge-Increment. Info: nur Alert-History |
| **Alert-Rate-Limit** | `NotificationRouter` Rate-Limiting (existiert aus 4A) | Max 1 Critical-Toast pro 30s. Bestehende Rate-Limit-Logik bleibt |

---

## Tests fuer Phase 4B (~15-20 neue Tests)

Alle neuen Tests folgen dem bestehenden Muster aus den 63 Phase-4A-Tests:

| Testdatei | Tests | Was wird getestet |
|-----------|-------|-------------------|
| `test_alert_lifecycle.py` | 5 | acknowledge (happy + invalid state), resolve (happy + idempotent), auto_resolve_by_correlation |
| `test_alert_api.py` | 4 | PATCH acknowledge, PATCH resolve, GET active, GET stats |
| `test_root_cause_suppression.py` | 3 | MQTT-down supprimiert Sensor-Alerts, Window-Logik (30s), keine Suppression bei unabhaengigen Alerts |
| `test_sensor_threshold_alerts.py` | 5 | critical_high, warning_low, normal (kein Alert), disabled config (kein Alert), deduplication |
| `test_health_dashboard.py` | 3 | Vollstaendige Response, ESP-Count korrekt, Monitoring unreachable handling |

**Testdateien-Pfad:** `El Servador/god_kaiser_server/tests/unit/` und `tests/integration/`

---

## Reihenfolge der Implementation

> **[VERIFY-PLAN KORREKTUR]** Aufwand drastisch reduziert:
> - Block 4B.3 von ~3-4h auf ~1h (95% existiert bereits, nur correlation_id ergaenzen)
> - Block 4B.4 von ~3-4h auf ~2-3h (Health-Endpoints + Frontend-Komponenten existieren groesstenteils)
> - Block 4B.2.3 von Erweiterung auf minimale Anpassung (Severity-Farben existieren bereits)
> - **Neuer Gesamtaufwand: ~10-14h statt ~15-20h**

```
Block 4B.1 (Schema + Store) — ~4-5h
├── 4B.1.1 DB-Migration (status, acknowledged_at/by, resolved_at, correlation_id)
├── 4B.1.2 Model erweitern (SQLAlchemy 2.0 Mapped-Syntax!)
├── 4B.1.3 NotificationRepository + NotificationRouter erweitern
├── 4B.1.4 NotificationRouter Root-Cause-Korrelation
├── 4B.1.5 API-Endpoints (Route-Shadowing beachten!)
├── 4B.1.6 GrafanaWebhookHandler (correlation_id + Auto-Resolve)
├── 4B.1.7 alert-center.store.ts (src/shared/stores/!)
├── 4B.1.8 API-Client + NotificationDTO erweitern
└── 4B.1.9 notification-inbox.store.ts WS-Handler erweitern (status, acknowledged_at, resolved_at)
    ↓
Block 4B.3 (correlation_id in Threshold-Alerts) — ~1h  ← DRASTISCH REDUZIERT
└── Nur: correlation_id in _evaluate_thresholds_and_notify() setzen
    ↓
Block 4B.2 (Alert-UI) — ~4-5h
├── 4B.2.1 AlertStatusBar.vue (NEU, Design an HealthSummaryBar anlehnen)
├── 4B.2.2 NotificationDrawer + NotificationItem erweitern (Ack/Resolve Buttons)
├── 4B.2.3 NotificationBadge — minimale Anpassung (Zaehler-Quelle)
├── 4B.2.4 AlertBadge.vue (NEU)
├── 4B.2.5 QuickAlertPanel erweitern
└── 4B.2.6 System Monitor Integration (HealthTab + HealthSummaryBar um Alerts erweitern)
    ↓
Block 4B.4 (Health-Aggregation) — ~2-3h  ← REDUZIERT
├── Optional: /health/dashboard Endpoint (oder Frontend-Aggregation)
├── Monitoring-Health Check (Grafana/Prometheus/Loki)
└── Frontend: AlertStatusBar + System Monitor Verdrahtung
```

**Block 4B.1 → 4B.3 → 4B.2 → 4B.4** (sequenziell, jeder Block baut auf dem vorherigen auf)

---

## Abschluss-Verifikation (Gesamttest Phase 4B)

- [ ] AlertStatusBar zeigt korrekten Gesamtstatus (in TopBar.vue integriert)
- [ ] Sensor-Threshold Ueberschreitung → Alert in Inbox + Badge auf SensorCard (Threshold-Pipeline existiert, correlation_id neu)
- [ ] Grafana-Alert → erscheint im Alert-Drawer mit Severity + correlation_id
- [ ] Acknowledge → Alert wechselt Status (active→acknowledged), Badge-Zaehler sinkt
- [ ] Resolve → Alert wechselt Status (→resolved), verschwindet aus aktiver Ansicht
- [ ] Auto-Resolve: Grafana sendet "resolved" → korrelierte Alerts auto-resolved
- [ ] Root-Cause: MQTT-Offline → Sensor-Alerts als abhaengig gruppiert (parent_notification_id)
- [ ] ISA-18.2: Bei normalem Betrieb < 3 Alerts/Stunde
- [ ] System Monitor HealthTab: Alert-Counts integriert
- [ ] System Monitor HealthSummaryBar: Alert-Problem-Chips integriert
- [ ] Bestehende 63 Tests laufen weiterhin fehlerfrei (keine Regression)
- [ ] Neue ~15-20 Tests laufen fehlerfrei
- [ ] 4 neue Prometheus-Metriken sichtbar in Grafana
- [ ] NotificationDTO Frontend-Type hat neue Felder (status, acknowledged_at, resolved_at, correlation_id)
- [ ] WS notification_updated Event transportiert neue Felder korrekt
