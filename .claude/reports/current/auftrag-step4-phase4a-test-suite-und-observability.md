# STEP 4: Phase 4A Test-Suite + Notification-Observability

> **Erstellt:** 2026-03-02
> **Typ:** Implementierung (Code-Aenderungen im auto-one Repo)
> **Ziel-Repo:** auto-one
> **Vorgaenger:** STEP 0 (12/15 Fixes), STEP 1 (Backend ~95%, 0 Tests), STEP 2 (Error-Code Analyse), STEP 3 (Prerequisites P1-P4 Bestandsaufnahme)
> **Geschaetzter Aufwand:** ~6-8.5 Tage (~48-68h)
> **Prioritaet:** KRITISCH — Blocker fuer Phase 4B (Unified Alert Center)

---

## Motivation

STEP 3 hat den gravierendsten Fund geliefert: **0 von ~63 Tests** existieren fuer den gesamten Phase 4A Notification-Stack. Gleichzeitig fehlen **alle 11 Prometheus-Metriken** fuer die Notification-Pipeline und **5 Grafana-Alerts** zur Ueberwachung des Notification-Systems selbst.

Ohne diese Test-Abdeckung und Observability ist Phase 4B (Unified Alert Center) nicht verantwortbar — es wuerde auf ungetesteten Code aufbauen und waere im Betrieb unsichtbar.

**Was dieser Auftrag NICHT macht:**
- Frontend-Tests (P2) — separate Aufgabe, niedrigere Prioritaet (Komponenten funktionieren alle)
- WebSocket Mid-Connection Revalidierung (P3) — theoretischer Gap, kein akuter Blocker
- Frontend-Placeholder-Handler in `useQuickActions.ts` — nicht Phase-4A-kritisch

---

## Ausgangslage (STEP 3 Befunde)

| Bereich | IST | SOLL | Gap |
|---------|-----|------|-----|
| Backend-Tests Phase 4A | 0 | ~63 | **63 Tests fehlen komplett** |
| Test-Infrastruktur | pytest 8.0.0, SQLite in-memory, MQTT-Mock, pytest-asyncio | Reif | conftest.py braucht `notification` Model Import |
| Frontend-Komponenten | 11/11 implementiert + integriert | Fertig | Kein Gap (nur Tests fehlen) |
| WS-Auth | Robust (JWT Handshake, Blacklist, Reconnect) | OK | Nur Mid-Connection Revalidierung offen |
| Prometheus Notification-Metriken | 0 | 11 | **11 Metriken fehlen** |
| Grafana Notification-Alerts | 0 | 5 | **5 Alerts fehlen** |
| Bestehende Alerts | 32/32 fehlerfrei (7 Gruppen) | OK | Kein Gap |

---

## Block 0: Test-Infrastruktur Vorbereitung (~30 Min)

### 0.1 conftest.py — Notification Model Import

**Datei:** `El Servador/god_kaiser_server/tests/conftest.py`
**Problem:** Model-Imports (Zeile 38-50) enthalten NICHT das `notification` Model. Wenn `Base.metadata.create_all()` aufgerufen wird, fehlt die `notifications`-Tabelle in der Test-DB.

**Fix:**
```python
# In den bestehenden Model-Imports (Zeile 38-50) `notification` zur Liste hinzufuegen:
from src.db.models import (  # noqa: F401, E402
    actuator,
    ai,
    auth,
    esp,
    kaiser,
    library,
    logic,
    notification,  # ← NEU: Phase 4A Notification + NotificationPreferences
    sensor,
    subzone,
    system,
    user,
)
```

> **WICHTIG:** Der Import-Style in conftest.py importiert MODULE (nicht Klassen direkt).
> Der bestehende Pattern ist `from src.db.models import actuator, ai, auth, ...`.
> NICHT `from god_kaiser_server.src.db.models.notification import Notification`.

**Verifikation:** Nach dem Fix muss `Base.metadata.create_all()` die Tabellen `notifications` und `notification_preferences` anlegen.

### 0.2 Notification-Fixtures fuer Tests

**Datei:** `El Servador/god_kaiser_server/tests/conftest.py` (am Ende erweitern)

Neue Fixtures erstellen:

```python
@pytest.fixture
async def sample_notification(db_session, sample_user):
    """Erstellt eine Test-Notification in der DB."""
    notification = Notification(
        user_id=sample_user.id,
        title="Test Alert",
        body="Sensor XYZ hat Schwellwert ueberschritten",
        channel="websocket",
        severity="warning",
        category="data_quality",
        source="sensor_threshold",
    )
    db_session.add(notification)
    await db_session.flush()
    return notification

@pytest.fixture
async def sample_preferences(db_session, sample_user):
    """Erstellt Test-NotificationPreferences."""
    prefs = NotificationPreferences(
        user_id=sample_user.id,
        websocket_enabled=True,
        email_enabled=False,
        email_severities=["critical"],
    )
    db_session.add(prefs)
    await db_session.flush()
    return prefs

@pytest.fixture
def mock_email_service():
    """Mock fuer EmailService — kein echter Email-Versand in Tests.

    Zwei Nutzungsarten:
    a) Direkt an NotificationRouter-Constructor uebergeben:
       router = NotificationRouter(session=db_session, email_service=mock_email_service)
    b) Alternativ den Singleton patchen:
       with patch("src.services.email_service.get_email_service", return_value=mock_email_service):
    """
    service = AsyncMock()
    service.is_available = True
    service.send_email = AsyncMock(return_value=True)
    service.send_critical_alert = AsyncMock(return_value=True)
    service.send_digest = AsyncMock(return_value=True)
    service.send_test_email = AsyncMock(return_value=True)
    service.provider_name = "Mock"
    return service

@pytest.fixture
def mock_ws_manager():
    """Mock fuer WebSocketManager — kein echter WS-Broadcast in Tests."""
    # WICHTIG: WS-Manager wird via WebSocketManager.get_instance() (async Singleton) geladen,
    # NICHT als Modul-Variable ws_manager. Deshalb get_instance patchen:
    mock_instance = AsyncMock()
    mock_instance.broadcast = AsyncMock()
    mock_instance.connection_count = 0
    with patch(
        "src.websocket.manager.WebSocketManager.get_instance",
        return_value=mock_instance
    ):
        yield mock_instance
```

### 0.3 Unit-conftest.py erweitern

**Datei:** `El Servador/god_kaiser_server/tests/unit/conftest.py`

Sicherstellen, dass Unit-Tests die autouse-Fixtures korrekt no-oppen (bestehendes Pattern beibehalten). Notification-spezifische No-Op-Fixtures sind NICHT noetig, da Unit-Tests MockObjekte nutzen.

**Akzeptanzkriterien Block 0:**
- [ ] `notification` und `NotificationPreferences` Models sind in conftest.py importiert
- [ ] `Base.metadata.create_all()` erstellt beide Tabellen in der Test-DB
- [ ] 4 neue Fixtures (`sample_notification`, `sample_preferences`, `mock_email_service`, `mock_ws_manager`) sind verfuegbar
- [ ] Bestehende Tests laufen weiterhin GRUEN (keine Regression)

---

## Block 1: NotificationRouter Tests (~12 Tests, CRITICAL)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_notification_router.py`

Dies ist der Kern-Service der Notification-Pipeline. Jeder Routing-Pfad muss getestet sein.

### 1.1 Test-Szenarien

| # | Test-Name | Beschreibung | Prio | Typ |
|---|-----------|-------------|------|-----|
| 1 | `test_route_normal_flow` | Normaler Flow: Persist in DB + WS-Broadcast `notification_new` + Badge-Update | H | Integration |
| 2 | `test_route_fingerprint_dedup` | Gleicher Fingerprint → zweiter Aufruf wird uebersprungen, kein Duplikat in DB | H | Integration |
| 3 | `test_route_title_dedup_60s` | Gleicher Titel innerhalb 60s → Skip. Nach 60s → durchgelassen | H | Integration |
| 4 | `test_route_critical_immediate_email` | Critical-Severity + email_enabled + critical in email_severities → `send_critical_alert()` aufgerufen | H | Integration |
| 5 | `test_route_warning_first_of_day_email` | Warning, erster am Tag → sofortige Email. Zweiter → Digest | M | Integration |
| 6 | `test_route_info_no_email` | Info-Severity → KEINE Email, egal welche Preferences | M | Integration |
| 7 | `test_route_quiet_hours_critical_passes` | Innerhalb Quiet Hours: Critical geht TROTZDEM durch per Email | M | Integration |
| 8 | `test_route_quiet_hours_warning_blocked` | Innerhalb Quiet Hours: Warning wird NICHT per Email gesendet | M | Integration |
| 9 | `test_is_quiet_hours_overnight_range` | Quiet Hours 22:00-06:00 (uebernacht): 23:00 → True, 07:00 → False | M | Unit |
| 10 | `test_broadcast_websocket_error_non_blocking` | WS-Broadcast-Fehler → wird geloggt, blockiert NICHT den Route-Flow | L | Unit |
| 11 | `test_persist_suppressed_audit_trail` | `persist_suppressed()` erstellt Notification mit `channel="suppressed"`, `is_read=True` | H | Integration |
| 12 | `test_broadcast_unread_count_correct` | `broadcast_unread_count()` sendet korrekten Count + `highest_severity` | L | Unit |

### 1.2 Test-Pattern (Vorlage)

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from god_kaiser_server.src.services.notification_router import NotificationRouter
from god_kaiser_server.src.schemas.notification import NotificationCreate

@pytest.mark.asyncio
async def test_route_normal_flow(db_session, sample_user, mock_ws_manager, mock_email_service):
    """NotificationRouter.route() persistiert in DB und broadcastet via WS."""
    # WICHTIG: email_service direkt an Constructor uebergeben (nicht Singleton)
    router = NotificationRouter(session=db_session, email_service=mock_email_service)

    notification = NotificationCreate(
        user_id=sample_user.id,
        title="Test Alert",
        body="Sensor hat Schwellwert ueberschritten",
        severity="warning",
        category="data_quality",
        source="sensor_threshold",
    )

    result = await router.route(notification)

    # route() gibt Optional[Notification] zurueck — Notification Model bei Erfolg, None bei Dedup
    assert result is not None
    assert result.id is not None  # UUID Primary Key (NICHT .db_id!)
    assert result.title == "Test Alert"
    assert result.severity == "warning"

    # WS-Broadcast pruefen
    mock_ws_manager.broadcast.assert_called()
    call_args = mock_ws_manager.broadcast.call_args
    assert call_args[0][0] == "notification_new"


@pytest.mark.asyncio
async def test_route_fingerprint_dedup(db_session, sample_user, mock_ws_manager, mock_email_service):
    """Zweite Notification mit gleichem Fingerprint wird uebersprungen."""
    router = NotificationRouter(session=db_session, email_service=mock_email_service)

    notification = NotificationCreate(
        user_id=sample_user.id,
        title="Duplicate Alert",
        body="Same alert",
        severity="warning",
        category="system",
        source="grafana",
        fingerprint="abc123def456",
    )

    result1 = await router.route(notification)
    assert result1 is not None
    assert result1.id is not None  # UUID (NICHT .db_id!)

    result2 = await router.route(notification)
    # route() gibt None zurueck bei Dedup (NICHT result.skipped!)
    assert result2 is None
```

### 1.3 Implementierungshinweise

- NotificationRouter Constructor: `NotificationRouter(session=db_session, email_service=mock_email_service)` — email_service als optionaler 2. Parameter direkt uebergeben
- WS-Manager: Wird via `WebSocketManager.get_instance()` (async Singleton) geladen. Mock per `mock_ws_manager` Fixture (patcht `src.websocket.manager.WebSocketManager.get_instance`)
- Quiet-Hours-Tests: `datetime.now()` mocken mit `freezegun` oder `unittest.mock.patch("src.services.notification_router.datetime")`
- Fingerprint-Dedup: Erst eine Notification erstellen, dann zweite mit gleichem Fingerprint — route() gibt `None` zurueck bei Dedup
- Titel-Dedup: Dedup-Window ist 60s. Zeitfenster testen mit `datetime` Mock. check_duplicate() nutzt `source + category + title` als Key
- **Return-Typ:** `route()` gibt `Optional[Notification]` zurueck. Erfolg = Notification-Objekt (`.id` ist UUID PK). Dedup = `None`

**Akzeptanzkriterien Block 1:**
- [ ] 12 Tests in `test_notification_router.py`
- [ ] Alle 12 Tests GRUEN
- [ ] Fingerprint-Dedup und Titel-Dedup beweisbar getestet
- [ ] Quiet-Hours-Logik mit Overnight-Range getestet

---

## Block 2: Notifications REST-API Tests (~10 Tests, CRITICAL)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_notifications_api.py`

Alle 9 REST-Endpoints + 1 Auth-Test muessen abgedeckt sein.

### 2.1 Test-Szenarien

| # | Test-Name | Endpoint | Prio |
|---|-----------|----------|------|
| 1 | `test_get_notifications_paginated` | `GET /v1/notifications` | H |
| 2 | `test_get_notifications_filter_severity` | `GET /v1/notifications?severity=critical` | M |
| 3 | `test_get_notifications_filter_category` | `GET /v1/notifications?category=system` | M |
| 4 | `test_get_unread_count` | `GET /v1/notifications/unread-count` | H |
| 5 | `test_get_notification_by_id` | `GET /v1/notifications/{id}` | M |
| 6 | `test_get_notification_not_found` | `GET /v1/notifications/{invalid_id}` → 404 | L |
| 7 | `test_mark_as_read` | `PATCH /v1/notifications/{id}/read` | H |
| 8 | `test_mark_all_as_read` | `PATCH /v1/notifications/read-all` | M |
| 9 | `test_send_notification_admin_only` | `POST /v1/notifications/send` mit Admin-User | H |
| 10 | `test_send_notification_non_admin_forbidden` | `POST /v1/notifications/send` mit Operator-User → 403 | H |

### 2.2 Test-Pattern

Nutze das bestehende Integration-Test-Pattern aus `test_api_sensors.py`:

```python
import pytest
from httpx import AsyncClient, ASGITransport

from src.core.security import create_access_token
from src.db.models.user import User
from src.main import app

@pytest.fixture
def auth_headers(sample_user: User):
    """Auth-Headers mit JWT-Token fuer sample_user."""
    token = create_access_token(data={"sub": sample_user.username})
    return {"Authorization": f"Bearer {token}"}

@pytest.mark.asyncio
async def test_get_notifications_paginated(db_session, sample_user, sample_notification, auth_headers):
    """GET /v1/notifications liefert paginierte Liste."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test"
    ) as client:
        response = await client.get(
            "/api/v1/notifications",
            headers=auth_headers,
            # WICHTIG: API nutzt page/page_size (NICHT limit/offset!)
            params={"page": 1, "page_size": 10}
        )
        assert response.status_code == 200
        body = response.json()
        # Response-Format: NotificationListResponse mit data/pagination/success
        # (NICHT "notifications"/"total"!)
        assert body["success"] is True
        assert "data" in body
        assert "pagination" in body
        assert body["pagination"]["total_items"] >= 1
```

### 2.3 Implementierungshinweise

- Auth-Token: `create_access_token(data={"sub": user.username})` aus `src.core.security` — wie in `test_api_sensors.py`
- Admin-Test: Erstelle separaten Admin-User mit `role="admin"` und Operator-User mit `role="operator"`
- Fuer den 404-Test: Verwende eine nicht-existierende UUID (z.B. `uuid.uuid4()`)
- `PATCH /read-all` Test: Erst mehrere ungelesene Notifications erstellen, dann read-all, dann Count pruefen
- **API nutzt `page`/`page_size`** (NICHT `limit`/`offset`). Default: page=1, page_size=50
- **Response-Schema:** `NotificationListResponse` hat Felder `success`, `data` (List), `pagination` (PaginationMeta mit `page`, `page_size`, `total_items`, `total_pages`). NICHT `notifications`/`total`
- **Admin-Endpoint:** `POST /v1/notifications/send` nutzt `AdminUser` Dependency (Annotated[User, Depends(require_admin)]) — User muss `role="admin"` haben
- **Import-Pattern:** `from src.main import app` (NICHT `from god_kaiser_server.src.main import app`)

**Akzeptanzkriterien Block 2:**
- [ ] 10 Tests in `test_notifications_api.py`
- [ ] Alle 10 Tests GRUEN
- [ ] Pagination korrekt getestet (offset, limit, total)
- [ ] Admin-only Endpoint verifiziert (403 fuer Non-Admin)

---

## Block 3: EmailService Tests (~8 Tests, HIGH)

**Neue Datei:** `El Servador/god_kaiser_server/tests/unit/test_email_service.py`

EmailService hat Dual-Provider-Logik (Resend + SMTP Fallback) — beides muss gemockt getestet werden.

### 3.1 Test-Szenarien

| # | Test-Name | Beschreibung | Prio |
|---|-----------|-------------|------|
| 1 | `test_send_email_resend_success` | Resend-Provider erfolgreich → return True | H |
| 2 | `test_send_email_resend_fail_smtp_fallback` | Resend schlaegt fehl → SMTP-Fallback greift → return True | H |
| 3 | `test_send_email_both_fail_returns_false` | Beide Provider fehlgeschlagen → return False (KEIN Exception-Raise) | H |
| 4 | `test_send_critical_alert_template` | `send_critical_alert()` rendert `alert_critical.html` Template korrekt | M |
| 5 | `test_send_digest_template` | `send_digest()` rendert `alert_digest.html` mit Notification-Liste | M |
| 6 | `test_send_test_email_template` | `send_test_email()` rendert `test.html` Template | L |
| 7 | `test_singleton_get_email_service` | `get_email_service()` gibt immer dieselbe Instanz zurueck | L |
| 8 | `test_jinja2_template_loading` | Alle 3 Templates (`alert_critical.html`, `alert_digest.html`, `test.html`) laden fehlerfrei | M |

### 3.2 Implementierungshinweise

- SMTP und Resend muessen KOMPLETT gemockt werden (kein echter Email-Versand)
- `asyncio.to_thread()` mocken fuer synchrone Provider
- Template-Pfad: `email_template_dir` aus Config muss auf die echten Templates zeigen
- Jinja2 Environment im EmailService: Pruefen ob Templates korrekt rendern (kein TemplateNotFoundError)

**Akzeptanzkriterien Block 3:**
- [ ] 8 Tests in `test_email_service.py`
- [ ] Alle 8 Tests GRUEN
- [ ] Dual-Provider-Logik (Resend → SMTP Fallback) beweisbar getestet
- [ ] Kein echter Email-Versand in Tests

---

## Block 4: AlertSuppressionService Tests (~6 Tests, HIGH)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_alert_suppression_service.py`

> **KORREKTUR:** AlertSuppressionService braucht eine DB-Session (`AlertSuppressionService(session=db_session)`)
> und macht DB-Abfragen (`esp_repo.get_by_id()`). Deshalb INTEGRATION, nicht unit.
> Die `tests/unit/conftest.py` ueberschreibt `override_get_db` mit No-Op — unit-Tests
> haben KEINEN Zugriff auf `db_session` oder `test_engine`.

ISA-18.2 Compliance erfordert nachweisbare Suppression-Logik.

### 4.1 Test-Szenarien

| # | Test-Name | Beschreibung | Prio |
|---|-----------|-------------|------|
| 1 | `test_is_sensor_suppressed_true` | Sensor mit `alerts_enabled=False` → suppressed | H |
| 2 | `test_is_sensor_suppressed_expiry` | Sensor mit `suppression_until` in der Vergangenheit → NOT suppressed | H |
| 3 | `test_device_level_propagation` | Device suppressed mit `propagate_to_children=True` → Sensor auch suppressed | H |
| 4 | `test_is_actuator_suppressed` | Analog zu Sensor (gleiche Logik) | M |
| 5 | `test_get_effective_thresholds_custom_over_global` | Custom Thresholds aus `alert_config.custom_thresholds` ueberschreiben globale Defaults | M |
| 6 | `test_check_thresholds_critical_over_warning` | Wert ueber `critical_max` → severity "critical" (nicht "warning"). **WICHTIG:** Threshold-Keys sind `warning_min`, `warning_max`, `critical_min`, `critical_max` (NICHT `critical_high`/`warning_high`) | M |

### 4.2 Implementierungshinweise

- Nutze `db_session` Fixture mit vorbereiteten SensorConfig-Eintraegen
- `suppression_until` testen: `datetime.now()` + offset fuer Vergangenheit/Zukunft
- Device-Propagation: ESPDevice mit `alert_config.propagate_to_children=True` erstellen

**Akzeptanzkriterien Block 4:**
- [ ] 6 Tests in `test_alert_suppression_service.py`
- [ ] Alle 6 Tests GRUEN
- [ ] Zeitablauf-Logik (`suppression_until`) beweisbar getestet
- [ ] Device→Sensor Propagation getestet

---

## Block 5: Webhooks API Tests (~5 Tests, HIGH)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_webhooks_api.py`

Grafana→AutomationOne Integration muss robust getestet sein.

### 5.1 Test-Szenarien

| # | Test-Name | Beschreibung | Prio |
|---|-----------|-------------|------|
| 1 | `test_grafana_webhook_firing_alert` | POST mit `status: "firing"` → Notification erstellt, Severity korrekt gemappt | H |
| 2 | `test_grafana_webhook_resolved_alert` | POST mit `status: "resolved"` → Severity "info" | H |
| 3 | `test_grafana_webhook_invalid_payload` | POST mit ungueltigem JSON → 422 | M |
| 4 | `test_grafana_webhook_fingerprint_dedup` | Gleicher Fingerprint in 2 Alerts → zweiter wird uebersprungen | H |
| 5 | `test_categorize_alert_keywords` | `categorize_alert()`: Keywords wie "cpu", "mqtt", "sensor" → korrekte Category | M |

### 5.2 Implementierungshinweise

- Webhook-Endpoint hat KEINE Auth (internes Netzwerk) — kein Auth-Header noetig
- Payload-Format: Grafana v11 Webhook-Format mit `alerts[]` Array
- Mock: NotificationRouter muss gemockt werden um DB-Seiteneffekte zu kontrollieren

```python
GRAFANA_FIRING_PAYLOAD = {
    "receiver": "automationone-webhook",
    "status": "firing",
    "alerts": [{
        "status": "firing",
        "labels": {"alertname": "HighCPU", "severity": "critical"},
        "annotations": {"summary": "CPU > 90%"},
        "startsAt": "2026-03-02T10:00:00Z",
        "fingerprint": "abc123",
    }]
}
```

**Akzeptanzkriterien Block 5:**
- [ ] 5 Tests in `test_webhooks_api.py`
- [ ] Alle 5 Tests GRUEN
- [ ] Grafana-Payload-Format korrekt verarbeitet
- [ ] Fingerprint-Dedup ueber Webhook getestet

---

## Block 6: Threshold→Notification Pipeline Tests (~5 Tests, HIGH)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_threshold_notification_pipeline.py`

End-to-End-Kette: Sensor-Wert → Threshold-Check → NotificationRouter.

### 6.1 Test-Szenarien

| # | Test-Name | Beschreibung | Prio |
|---|-----------|-------------|------|
| 1 | `test_threshold_exceeded_creates_notification` | Wert ueber `critical_high` → `router.route()` aufgerufen mit severity="critical" | H |
| 2 | `test_suppressed_sensor_persists_suppressed` | Sensor suppressed → `router.persist_suppressed()` statt `route()` | H |
| 3 | `test_severity_override_from_alert_config` | `severity_override` in alert_config → ueberschreibt berechnete Severity | M |
| 4 | `test_no_threshold_no_notification` | Kein Threshold konfiguriert → KEINE Notification erzeugt | M |
| 5 | `test_pipeline_error_non_blocking` | Fehler in Pipeline blockiert NICHT den Sensor-Data-Commit | H |

### 6.2 Implementierungshinweise

- `sensor_handler.py` ruft intern `_evaluate_thresholds_and_notify()` auf (NICHT `_check_alert_thresholds()` — existiert nicht!)
- Die Methode nutzt intern `AlertSuppressionService.get_effective_thresholds()` + `check_thresholds()` + `NotificationRouter.route()`
- SensorConfig mit `thresholds` JSON vorbereiten: `{"critical_max": 40.0, "warning_max": 35.0, "critical_min": null, "warning_min": null}` — Keys sind `warning_min`, `warning_max`, `critical_min`, `critical_max` (NICHT `critical_high`/`warning_high`!)
- Alternativ: `alert_config.custom_thresholds` fuer sensor-spezifische Overrides
- Mock: NotificationRouter mocken um Aufrufe zu verifizieren
- Pipeline-Error-Test: NotificationRouter-Mock wirft Exception → Sensor-Data trotzdem committed

**Akzeptanzkriterien Block 6:**
- [ ] 5 Tests in `test_threshold_notification_pipeline.py`
- [ ] Alle 5 Tests GRUEN
- [ ] Suppressed-Pfad separat von normalem Pfad getestet
- [ ] Non-blocking-Eigenschaft beweisbar getestet

---

## Block 7: Verbleibende Tests (~17 Tests, MEDIUM)

### 7.1 AlertSuppressionScheduler (~3 Tests)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_alert_suppression_scheduler.py`

| # | Test-Name | Prio |
|---|-----------|------|
| 1 | `test_check_suppression_expiry_reenables` | H |
| 2 | `test_check_suppression_not_expired_stays` | M |
| 3 | `test_check_maintenance_overdue_notification` | M |

### 7.2 DigestService (~5 Tests)

**Neue Datei:** `El Servador/god_kaiser_server/tests/unit/test_digest_service.py`

| # | Test-Name | Prio |
|---|-----------|------|
| 1 | `test_process_digests_collects_pending` | H |
| 2 | `test_process_digests_empty_batch_no_email` | M |
| 3 | `test_process_digests_only_email_enabled_users` | M |
| 4 | `test_process_digests_marks_sent` | M |
| 5 | `test_singleton_get_digest_service` | L |

### 7.3 Alert-Config Endpoints (~5 Tests)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_alert_config_api.py`

| # | Test-Name | Prio |
|---|-----------|------|
| 1 | `test_patch_sensor_alert_config` | H |
| 2 | `test_get_sensor_alert_config` | M |
| 3 | `test_patch_device_alert_config_propagate` | H |
| 4 | `test_alert_config_jsonb_merge` | M |
| 5 | `test_suppression_with_until` | H |

### 7.4 Runtime-Stats Endpoints (~4 Tests)

**Neue Datei:** `El Servador/god_kaiser_server/tests/integration/test_runtime_stats_api.py`

| # | Test-Name | Prio |
|---|-----------|------|
| 1 | `test_get_sensor_runtime_computed_values` | M |
| 2 | `test_patch_sensor_runtime` | M |
| 3 | `test_get_actuator_runtime` | M |
| 4 | `test_patch_actuator_runtime` | M |

**Akzeptanzkriterien Block 7:**
- [ ] 17 Tests in 4 neuen Dateien
- [ ] Alle 17 Tests GRUEN
- [ ] Scheduler-Expiry mit Zeitmanipulation getestet

---

## Block 8: Prometheus Notification-Metriken (~11 Metriken, HIGH)

**Datei:** `El Servador/god_kaiser_server/src/core/metrics.py` (erweitern)

STEP 3 hat dokumentiert: **0 Notification-spezifische Metriken** existieren. Das bedeutet, wenn der Email-Versand scheitert oder Notifications nicht durchkommen, gibt es keine Warnung.

### 8.1 Neue Metriken

> **NAMENSKONVENTION:** Bestehende Metriken in `metrics.py` nutzen den Prefix `god_kaiser_`.
> Neue Notification-Metriken sollten ebenfalls `god_kaiser_` verwenden fuer Konsistenz.
> Alternativ `ao_` als neuen Standard einführen — dann aber als bewusste Entscheidung dokumentieren.
> Die Grafana Alert-Regeln (Block 9) muessen den gewahlten Prefix nutzen!

| # | Metrik-Name | Typ | Labels | Beschreibung | Prio | Instrumentierungs-Ort |
|---|-------------|-----|--------|-------------|------|----------------------|
| 1 | `god_kaiser_notifications_total` | Counter | `severity`, `category`, `source` | Gesamt erzeugte Notifications | H | `notification_router.py:route()` |
| 2 | `god_kaiser_notifications_suppressed_total` | Counter | `reason` | Durch Suppression unterdrueckte | H | `notification_router.py:persist_suppressed()` |
| 3 | `god_kaiser_notifications_deduplicated_total` | Counter | — | Durch Fingerprint/Titel deduplizierte | M | `notification_router.py:route()` (Dedup-Branch) |
| 4 | `god_kaiser_email_sent_total` | Counter | `provider` (resend/smtp), `status` (success/failure) | Versendete Emails | H | `email_service.py:send_email()` |
| 5 | `god_kaiser_email_latency_seconds` | Histogram | `provider` | Email-Versand-Latenz | M | `email_service.py:send_email()` |
| 6 | `god_kaiser_digest_processed_total` | Counter | — | Verarbeitete Digest-Batches | M | `digest_service.py:process_digests()` |
| 7 | `god_kaiser_digest_notifications_per_batch` | Histogram | — | Notifications pro Digest | L | `digest_service.py:process_digests()` |
| 8 | `god_kaiser_ws_notification_broadcast_total` | Counter | `event_type` | WS-Broadcasts fuer Notifications | M | `notification_router.py:_broadcast_websocket()` |
| 9 | `god_kaiser_webhook_received_total` | Counter | `source` (grafana), `status` (processed/skipped/error) | Empfangene Webhooks | H | `webhooks.py:grafana_alerts_webhook()` |
| 10 | `god_kaiser_alert_suppression_active` | Gauge | `entity_type` (sensor/actuator/device) | Aktuell suppressed Entities | M | `alert_suppression_scheduler.py:check_suppression_expiry()` |
| 11 | `god_kaiser_alert_suppression_expired_total` | Counter | — | Durch Scheduler re-enabled | L | `alert_suppression_scheduler.py:check_suppression_expiry()` |

### 8.2 Implementierungsanleitung

**Schritt 1:** Metriken in `metrics.py` definieren (bestehende Patterns kopieren — siehe z.B. `MQTT_MESSAGES_TOTAL`):

```python
# =============================================================================
# Notification Pipeline Metriken (Phase 4A)
# =============================================================================

NOTIFICATIONS_TOTAL = Counter(
    "god_kaiser_notifications_total",
    "Total notifications created",
    ["severity", "category", "source"],
)

NOTIFICATIONS_SUPPRESSED_TOTAL = Counter(
    "god_kaiser_notifications_suppressed_total",
    "Total suppressed notifications",
    ["reason"],
)

EMAIL_SENT_TOTAL = Counter(
    "god_kaiser_email_sent_total",
    "Total emails sent",
    ["provider", "status"],
)

EMAIL_LATENCY_SECONDS = Histogram(
    "god_kaiser_email_latency_seconds",
    "Email sending latency in seconds",
    ["provider"],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0],
)

# ... etc fuer alle 11 Metriken (UPPER_SNAKE Python-Variablenname, god_kaiser_ Prometheus-Name)
```

> **WICHTIG:** Bestehende Metrik-Variablen nutzen `UPPER_SNAKE_CASE` (z.B. `MQTT_MESSAGES_TOTAL`).
> Neue Metriken sollten diesem Pattern folgen (NICHT `ao_notifications_total` als Variablenname).

**Schritt 2:** Metriken in den jeweiligen Services instrumentieren. Beispiel fuer `notification_router.py`:

```python
# Import-Pattern: from ..core.metrics import (NICHT god_kaiser_server.src.core.metrics)
from ..core.metrics import (
    NOTIFICATIONS_TOTAL,
    NOTIFICATIONS_SUPPRESSED_TOTAL,
    NOTIFICATIONS_DEDUPLICATED_TOTAL,
    WS_NOTIFICATION_BROADCAST_TOTAL,
)

async def route(self, notification):
    # ... bestehender Code ...

    # Nach erfolgreicher Persistenz:
    NOTIFICATIONS_TOTAL.labels(
        severity=notification.severity,
        category=notification.category,
        source=notification.source
    ).inc()

    # Im Dedup-Branch (wo return None):
    NOTIFICATIONS_DEDUPLICATED_TOTAL.inc()
```

**Schritt 3:** Pruefen dass `/api/v1/health/metrics` Endpoint die neuen Metriken exponiert (NICHT `/metrics`!).

> **HINWEIS:** `metrics.py` hat einen `_NoOpMetric` Stub fuer fehlende `prometheus_client` (Zeile 25-45).
> In Tests ohne prometheus_client werden alle Metrik-Aufrufe zu No-Ops — das ist gewollt und
> verhindert ImportErrors. Metrik-Instrumentierung muss trotzdem syntaktisch korrekt sein.
> Die `init_metrics()` Funktion (Zeile 249-273) muss um die neuen labeled Metriken erweitert werden,
> damit sie in Prometheus sichtbar sind (sonst NoData bei Alerts).

**Akzeptanzkriterien Block 8:**
- [ ] 11 Metriken in `metrics.py` definiert
- [ ] Alle 11 Metriken an den richtigen Stellen instrumentiert
- [ ] `/api/v1/health/metrics` Endpoint zeigt die neuen Metriken (manuell oder per Test verifizieren)
- [ ] Bestehende Metriken unberuehrt (keine Regression)

---

## Block 9: Grafana Notification-Alert-Regeln (~5 Alerts, MEDIUM)

**Datei:** `docker/grafana/provisioning/alerting/alert-rules.yml` (erweitern)

### 9.1 Neue Alert-Regeln

> **WICHTIG:** PromQL Metrik-Namen muessen mit Block 8 uebereinstimmen (`god_kaiser_` Prefix).
> Bestehende alert-rules.yml hat **32 Regeln** in 7 Gruppen (Header-Kommentar pruefen), NICHT 38.

| # | Alert-Name | Bedingung (PromQL) | Severity | Evaluation |
|---|-----------|-------------------|----------|------------|
| 1 | `NotificationRateTooHigh` | `rate(god_kaiser_notifications_total[5m]) > 10` | warning | 5m |
| 2 | `EmailFailureRate` | `rate(god_kaiser_email_sent_total{status="failure"}[15m]) > 0.5` | critical | 5m |
| 3 | `WebhookReceptionStopped` | `absent(increase(god_kaiser_webhook_received_total[1h]))` | warning | 15m |
| 4 | `HighSuppressionRatio` | `god_kaiser_notifications_suppressed_total / god_kaiser_notifications_total > 0.8` | info | 30m |
| 5 | `DigestBacklog` | `time() - god_kaiser_digest_processed_total > 7200` (stale fuer >2h) | warning | 30m |

### 9.2 Implementierungshinweise

- Neue Regeln als eigene Gruppe `notification-pipeline` hinzufuegen
- `for`-Dauer sinnvoll waehlen (nicht sofort feuern)
- Annotations mit `summary` und `description` (Deutsch)
- Labels mit `severity` setzen
- Bestehende 32 Regeln NICHT anfassen

**WARNUNG:** Alert 3 (`WebhookReceptionStopped`) feuert initial wenn noch keine Webhooks empfangen wurden. `noDataState: "OK"` setzen oder erst nach erstem Webhook aktiv schalten.

**Akzeptanzkriterien Block 9:**
- [ ] 5 neue Alert-Regeln in `alert-rules.yml`
- [ ] Gruppe `notification-pipeline` erstellt
- [ ] PromQL-Syntax valide (kein Grafana-Error beim Laden)
- [ ] Bestehende 32 Regeln unberuehrt

---

## Reihenfolge und Abhaengigkeiten

```
Block 0: Test-Infrastruktur (~0.5h)     ← ZUERST, alles andere haengt davon ab
    │
    ├── Block 1: NotificationRouter (12 Tests, ~3-4h)    ← CRITICAL
    ├── Block 2: Notifications API (10 Tests, ~2-3h)     ← CRITICAL
    │
    ├── Block 3: EmailService (8 Tests, ~2-3h)           ← HIGH
    ├── Block 4: AlertSuppression (6 Tests, ~1-2h)       ← HIGH
    ├── Block 5: Webhooks API (5 Tests, ~1-2h)           ← HIGH
    ├── Block 6: Pipeline (5 Tests, ~2-3h)               ← HIGH
    │
    └── Block 7: Verbleibende (17 Tests, ~3-4h)          ← MEDIUM

Block 8: Prometheus Metriken (11 Metriken, ~3-4h)        ← Unabhaengig von Tests
Block 9: Grafana Alerts (5 Regeln, ~1-2h)                ← Abhaengig von Block 8
```

**Parallelisierung moeglich:**
- Bloecke 1-7 (Tests) und Block 8 (Metriken) koennen PARALLEL bearbeitet werden
- Block 9 (Grafana) erst NACH Block 8 (Metriken muessen existieren)
- Innerhalb der Testbloecke: Bloecke 1+2 zuerst (CRITICAL), dann 3-6 (HIGH), dann 7 (MEDIUM)

---

## Gesamte Akzeptanzkriterien

- [ ] **Test-Infrastruktur:** conftest.py erweitert, Notification-Fixtures verfuegbar
- [ ] **63 neue Tests:** Verteilt auf 10 Dateien (Block 1-7)
- [ ] **Alle Tests GRUEN:** `pytest` laeuft ohne Failures
- [ ] **Keine Regression:** Bestehende ~114 Tests laufen weiterhin GRUEN
- [ ] **11 Prometheus-Metriken:** Definiert und instrumentiert
- [ ] **5 Grafana-Alerts:** Konfiguriert, PromQL valide
- [ ] **CI/CD:** Alle Pipelines bleiben GRUEN nach den Aenderungen

---

## Dateien-Uebersicht (alle im auto-one Repo)

### Neue Dateien (10 Test-Dateien)

> **Alle Pfade relativ zu** `El Servador/god_kaiser_server/`

| Datei | Block | Tests |
|-------|-------|-------|
| `tests/integration/test_notification_router.py` | 1 | 12 |
| `tests/integration/test_notifications_api.py` | 2 | 10 |
| `tests/unit/test_email_service.py` | 3 | 8 |
| `tests/integration/test_alert_suppression_service.py` | 4 | 6 |
| `tests/integration/test_webhooks_api.py` | 5 | 5 |
| `tests/integration/test_threshold_notification_pipeline.py` | 6 | 5 |
| `tests/integration/test_alert_suppression_scheduler.py` | 7.1 | 3 |
| `tests/unit/test_digest_service.py` | 7.2 | 5 |
| `tests/integration/test_alert_config_api.py` | 7.3 | 5 |
| `tests/integration/test_runtime_stats_api.py` | 7.4 | 4 |

### Modifizierte Dateien (8 Dateien)

| Datei | Block | Aenderung |
|-------|-------|-----------|
| `tests/conftest.py` | 0 | Notification Model Import + 4 Fixtures |
| `src/core/metrics.py` | 8 | 11 neue Metriken |
| `src/services/notification_router.py` | 8 | Metriken-Instrumentierung (4 Stellen) |
| `src/services/email_service.py` | 8 | Metriken-Instrumentierung (2 Stellen) |
| `src/services/digest_service.py` | 8 | Metriken-Instrumentierung (2 Stellen) |
| `src/services/alert_suppression_scheduler.py` | 8 | Metriken-Instrumentierung (2 Stellen) |
| `src/api/v1/webhooks.py` | 8 | Metriken-Instrumentierung (1 Stelle) |
| `docker/grafana/provisioning/alerting/alert-rules.yml` | 9 | 5 neue Alert-Regeln |

---

## Referenzen

| Dokument | Pfad | Relevanz |
|---------|------|----------|
| STEP 3 Ergebnisse | `arbeitsbereiche/automation-one/auftrag-step3-prerequisites-bestandsaufnahme.md` | Quell-Analyse fuer diesen Auftrag |
| STEP 3 Bericht | Eingebettet in STEP 3 Auftrag (Robin hat Ergebnisse geliefert) | P1-P4 Details |
| Fahrplan nach Phase 4A | `arbeitsbereiche/automation-one/fahrplan-nach-phase4a.md` | Kontext: STEP 4 = Error-Code-Ausbau (umbenannt) |
| Phase 4 Roadmap | `arbeitsbereiche/automation-one/roadmap-phase4-system-integration.md` | Gesamtkontext Phase 4A-4E |
| STEP 0 Bericht | `arbeitsbereiche/automation-one/STEP0-systemkontext-fixes-verifikation.md` | 12/15 Fixes erledigt |
| STEP 1 Bericht | `arbeitsbereiche/automation-one/STEP1_phase4a_verification.md` | Backend ~95%, 0 Tests |
| STEP 2 Auftrag | `arbeitsbereiche/automation-one/auftrag-step2-error-code-system-bestandsaufnahme.md` | Error-Code Analyse |
| Test-Infrastruktur | `El Servador/god_kaiser_server/tests/conftest.py` | Bestehende Fixtures/Patterns |
| Bestehender Test (Pattern) | `El Servador/god_kaiser_server/tests/integration/test_api_sensors.py` | Integration-Test-Vorlage |

---

## Einordnung im Fahrplan

```
[STEP 0] Systemkontext-Fixes          ← ERLEDIGT (12/15)
[STEP 1] Phase 4A Verifikation        ← ERLEDIGT (Backend ~95%, 0 Tests)
[STEP 2] Error-Code Bestandsaufnahme  ← ERLEDIGT (Analyse)
[STEP 3] Prerequisites Bestandsaufnahme ← ERLEDIGT (P1-P4 Analyse)
[STEP 4] Test-Suite + Observability   ← DIESER AUFTRAG (~6-8.5 Tage)
    │
    ├── 63 Backend-Tests (Bloecke 0-7)
    ├── 11 Prometheus-Metriken (Block 8)
    └── 5 Grafana-Alerts (Block 9)
    │
[STEP 5] Error-Code-System-Ausbau     ← Danach (~13h, auftrag-error-code-system-ausbau.md)
[STEP 6] Phase 4B: Unified Alert Center
[STEP 7] Phase 4C: Plugin-System
[STEP 8] Phase 4D: Diagnostics Hub
[STEP 9] Hardware-Test 2
```

**HINWEIS:** Die STEP-Nummerierung weicht vom Original-Fahrplan ab. Der Fahrplan hatte "STEP 4 = Error-Code-Ausbau". Durch die STEP 3 Analyse hat sich herausgestellt, dass die Test-Suite + Observability VOR dem Error-Code-Ausbau kommen muss — denn ohne Tests ist der bestehende Code nicht abgesichert, und der Error-Code-Ausbau wuerde auf ungetesteten Fundamenten aufbauen.
