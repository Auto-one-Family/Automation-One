# Server Debug Report — T16-V2 Verifikation

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: "T16-V2 — V-AL-01 Alert-Rule Config + V-AL-04 Webhook Pipeline Trace + V-AL-03 MockActuator Emergency-Stop")
**Quellen:**
- `docker/grafana/provisioning/alerting/alert-rules.yml`
- `docker/grafana/provisioning/alerting/loki-alert-rules.yml`
- `docker/grafana/provisioning/alerting/notification-policies.yml`
- `docker/grafana/provisioning/alerting/contact-points.yml`
- `El Servador/god_kaiser_server/src/api/v1/webhooks.py`
- `El Servador/god_kaiser_server/src/services/notification_router.py`
- `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py`
- `El Servador/god_kaiser_server/src/services/simulation/actuator_handler.py`

---

## 1. Zusammenfassung

Die Alert-Rule-Infrastruktur ist vollstaendig konfiguriert (42 Rules total: 37 Prometheus + 5 Loki aktiv). Die Webhook-Pipeline ist implementiert mit Fingerprint-Dedup und Auto-Resolve. Ein kritischer Dedup-Bug wurde identifiziert: `_broadcast_to_all()` propagiert das `fingerprint`-Feld nicht an die per-User-Notifications, was den Root Cause der 79 identischen Notifications darstellt. Der MockActuator Emergency-Stop loggt auf CRITICAL-Level bei Broadcast-Emergency — dies ist beabsichtigt und angemessen fuer einen System-weiten Notfall-Stopp.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `alert-rules.yml` | OK | 37 Prometheus-Rules in 8 Groups |
| `loki-alert-rules.yml` | OK | 5 aktive + 1 deaktivierte Loki-Rule |
| `notification-policies.yml` | OK | group_wait 30s, group_interval 5m, repeat_interval 4h |
| `contact-points.yml` | OK | Webhook zu el-servador:8000, disableResolveMessage: false |
| `webhooks.py` | OK | POST /v1/webhooks/grafana-alerts vollstaendig implementiert |
| `notification_router.py` | KRITISCHER BUG | Broadcast-Pfad propagiert fingerprint nicht |
| `notification_repo.py` | OK | check_fingerprint_duplicate korrekt implementiert |
| `actuator_handler.py` | OK | CRITICAL-Log bei Broadcast-Emergency beabsichtigt |

---

## 3. Befunde

### 3.1 V-AL-01: Alert-Rule-Konfigurationen

#### ao-loki-critical-burst

| Parameter | Wert |
|-----------|------|
| uid | `ao-loki-critical-burst` |
| Datei | `loki-alert-rules.yml`, Zeile 225 |
| Loki-Query (refId A) | `sum(count_over_time({compose_service=~".+", compose_service!="postgres"} \| level="CRITICAL" [5m]))` |
| Evaluation-Intervall | `1m` (Gruppen-Level: `interval: 1m`) |
| For-Duration | `for: 1m` |
| Query-Window | `5m` (relativeTimeRange from: 300, to: 0) |
| Reduce (refId B) | `last` |
| Threshold (refId C) | `> 0` — jeder einzelne CRITICAL-Eintrag loest aus |
| noDataState | OK |
| execErrState | Alerting |
| Severity-Label | `critical` |
| postgres-Ausschluss | Ja — PostgreSQL FATAL wird von Alloy als CRITICAL gemappt, separate Alerts deckend |

**Besonderheit:** Der Threshold `> 0` ist absichtlich streng — jeder einzelne CRITICAL-Log-Eintrag (ausser postgres) triggert den Alert nach 1 Minute Wartezeit.

#### ao-loki-error-storm

| Parameter | Wert |
|-----------|------|
| uid | `ao-loki-error-storm` |
| Datei | `loki-alert-rules.yml`, Zeile 29 |
| Loki-Query (refId A) | `sum(count_over_time({compose_service="el-servador"} \|~ "(level=\"ERROR\"\|Traceback\|Exception\|HTTP/1.1\" 5)" [5m]))` |
| Evaluation-Intervall | `1m` |
| For-Duration | `for: 2m` |
| Query-Window | `5m` (relativeTimeRange from: 300, to: 0) |
| Reduce (refId B) | `last` |
| Threshold (refId C) | `> 10` — mehr als 10 Errors in 5 Minuten |
| noDataState | OK |
| execErrState | Alerting |
| Severity-Label | `warning` |

**Unterschied zu critical-burst:** Loest erst nach `for: 2m` aus (statt 1m) und benoetigt >10 Treffer statt >0. Nur el-servador-Logs, kein System-weites Scanning.

#### Gesamtzahl Alert-Rules

| Datei | Anzahl Rules |
|-------|-------------|
| `alert-rules.yml` (Prometheus-basiert) | 37 |
| `loki-alert-rules.yml` (aktiv) | 5 |
| `loki-alert-rules.yml` (deaktiviert: ao-loki-frontend-down) | 1 (kommentiert) |
| **Gesamt aktiv** | **42** |

Die 37 Prometheus-Rules verteilen sich laut Datei-Header auf 8 Gruppen: Critical (6), Warning (3), Infrastructure (7), Sensor/ESP (6), Application (6), MQTT Broker (2), Notification Pipeline (5), plus weitere.

---

### 3.2 V-AL-01: Notification-Policy

**Datei:** `notification-policies.yml`

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| `group_by` | `[grafana_folder, alertname]` | Alerts werden pro Folder+Alertname gruppiert |
| `group_wait` | `30s` | Grafana wartet 30s vor erster Notification einer neuen Gruppe |
| `group_interval` | `5m` | Minimum 5 Minuten zwischen Notifications der gleichen Gruppe |
| `repeat_interval` | `4h` | Noch-firing Alerts werden alle 4 Stunden erneut gesendet |
| Receiver | `automationone-webhook` | Einziger konfigurierter Contact-Point |

**Contact-Point (`contact-points.yml`):**

| Parameter | Wert |
|-----------|------|
| Name | `automationone-webhook` |
| Typ | `webhook` |
| URL | `http://el-servador:8000/api/v1/webhooks/grafana-alerts` |
| HTTP-Methode | `POST` |
| `maxAlerts` | `10` (max. 10 Alerts pro Webhook-Payload) |
| `disableResolveMessage` | `false` — Server empfaengt "resolved"-Status fuer Auto-Close |

---

### 3.3 V-AL-04: Webhook-Handler Code-Flow

**Datei:** `El Servador/god_kaiser_server/src/api/v1/webhooks.py`

#### Route-Handler

```
POST /v1/webhooks/grafana-alerts  (Zeile 169)
└── grafana_alerts_webhook(payload: GrafanaWebhookPayload, db: DBSession)
    ├── Z. 187: Leeres alerts[] -> WebhookValidationException
    ├── Z. 194: NotificationRouter(db) + NotificationRepository(db) erstellen
    ├── Z. 197: for alert in payload.alerts:
    │   ├── Z. 198: alertname = alert.labels.get("alertname", "Unknown Alert")
    │   ├── Z. 199: severity = map_grafana_severity(alert)
    │   ├── Z. 200: category = categorize_alert(alertname)
    │   ├── Z. 203: correlation_id = f"grafana_{alert.fingerprint}" if fingerprint else None
    │   ├── Z. 206: if status == "resolved" and correlation_id:
    │   │   └── auto_resolve_by_correlation(correlation_id) -> db.commit() -> continue
    │   ├── Z. 224: title = annotations["summary"] oder alertname (max 255 Zeichen)
    │   ├── Z. 228: body aus annotations["description"] + resolved-Text
    │   ├── Z. 237: metadata = {fingerprint, status, alertname, labels, urls, values}
    │   ├── Z. 257: NotificationCreate(..., fingerprint=alert.fingerprint, correlation_id=...)
    │   └── Z. 273: router_service.route(notification) -> processed++ oder skipped++
    └── Z. 285: Log-Zusammenfassung + Response {status, processed, skipped, auto_resolved}
```

#### GrafanaWebhookPayload-Schema (Zeilen 55-71)

Extrahierte Felder fuer die Notification:
- `alert.labels["alertname"]` -> title-Basis
- `alert.annotations["summary"]` -> title
- `alert.annotations["description"]` -> body
- `alert.labels["severity"]` -> severity via map_grafana_severity()
- `alert.fingerprint` -> fingerprint + correlation_id-Basis
- `alert.status` -> Auto-Resolve-Entscheidung
- `alert.labels["esp_id"]` oder `["instance"]` -> metadata.esp_id

#### map_grafana_severity() (Zeilen 136-161)

```
alert.status == "resolved"                              -> "info"
labels["severity"] in ("critical", "error")            -> "critical"
labels["severity"] in ("warning", "warn")              -> "warning"
labels["grafana_folder"].lower() contains "critical"   -> "critical"
default                                                 -> "warning"
```

FIX-02-Kommentar in Code: "resolved" ist keine Severity (nur 3 Levels: critical/warning/info). Grafana-Status wird in `metadata.grafana_status` gespeichert.

#### correlation_id Erzeugung (Zeile 203)

```python
correlation_id = f"grafana_{alert.fingerprint}" if alert.fingerprint else None
```

Beispiel: Fingerprint `abc123` -> correlation_id `grafana_abc123`.

---

### 3.4 V-AL-04: Fingerprint-Deduplizierung — Root Cause der 79 Notifications

#### check_fingerprint_duplicate() (notification_repo.py, Zeilen 228-241)

```python
async def check_fingerprint_duplicate(self, fingerprint: str) -> bool:
    stmt = select(func.count()).select_from(Notification).where(
        and_(
            Notification.fingerprint == fingerprint,
            Notification.status.in_([AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED]),
        )
    )
    result = await self.session.execute(stmt)
    return result.scalar_one() > 0
```

**Dedup-Logik:** Exakter String-Match des Fingerprints. Kein Zeitfenster — eine aktive Notification mit diesem Fingerprint blockiert alle Folgenotifications unbegrenzt. Zeitfenster sind nicht noetig da Alert-Resolution (auto_resolve_by_correlation) die blockierende Notification auf RESOLVED setzt.

#### check_correlation_duplicate() (notification_repo.py, Zeilen 243-260)

Analoge Funktion fuer `correlation_id` statt `fingerprint`. Wird im Broadcast-Pfad eingesetzt (Zeile 100 in notification_router.py).

#### ROOT CAUSE der 79 Notifications

**Datei:** `El Servador/god_kaiser_server/src/services/notification_router.py`

**Bug-Position:** Methode `_broadcast_to_all()`, Zeilen 184-207 — `fingerprint` wird nicht propagiert.

**Detaillierter Code-Flow:**

Schritt 1 — Grafana-Webhook kommt an (user_id=None, fingerprint gesetzt):
```python
# webhooks.py Z. 257-270: NotificationCreate mit fingerprint
notification = NotificationCreate(
    user_id=None,   # Broadcast
    fingerprint=alert.fingerprint,   # z.B. "abc123"
    correlation_id="grafana_abc123",
    ...
)
# -> router_service.route(notification) aufgerufen
```

Schritt 2 — route() entscheidet sich fuer den Broadcast-Pfad (notification_router.py Z. 96-109):
```python
if user_id is None:
    if notification.correlation_id:
        is_duplicate = await self.notification_repo.check_correlation_duplicate(
            correlation_id=notification.correlation_id,  # "grafana_abc123"
        )
        if is_duplicate:
            return None  # Dedup
    return await self._broadcast_to_all(notification)
```

Schritt 3 — _broadcast_to_all() erstellt per-User-Notifications OHNE fingerprint (Z. 191-203):
```python
for user in users:
    user_notification = NotificationCreate(
        user_id=user.id,
        channel=notification.channel,
        severity=notification.severity,
        category=notification.category,
        title=notification.title,
        body=notification.body,
        metadata=notification.metadata,
        source=notification.source,
        parent_notification_id=notification.parent_notification_id,
        correlation_id=notification.correlation_id,  # vorhanden: "grafana_abc123"
        # fingerprint fehlt! Default: None
    )
    result = await self.route(user_notification)  # rekursiver Aufruf
```

Schritt 4 — Rekursiver route()-Aufruf fuer user_notification (user_id gesetzt, fingerprint=None):
```python
# Z. 113: fingerprint-Check schlaegt fehl, da fingerprint=None
if notification.fingerprint:   # False -> Dedup-Block wird NICHT ausgefuehrt
    ...
# Z. 121: title-basierte Dedup als Fallback
window = self.DEDUP_WINDOWS.get(notification.source, self.DEDUP_WINDOW_DEFAULT)
# source="grafana" -> Default 60s
is_duplicate = await self.notification_repo.check_duplicate(
    user_id=user_id, source="grafana", category=..., title=..., window_seconds=60
)
```

**Ergebnis:** Wenn innerhalb von 60 Sekunden keine identische Notification existiert, wird eine neue erstellt. Bei Grafana-Alerts die alle 4h wiederholt werden (repeat_interval) oder bei mehreren Evaluation-Zyklen innerhalb von >60s ist die title-basierte Dedup nicht ausreichend.

**Konkrete Zahlenhypothese fuer 79:**
- 1 aktiver User
- Alert feuert, Grafana sendet repeat_interval-Webhooks ueber mehrere Stunden
- Jeder Webhook-Call nach Ablauf der 60s-title-Dedup erzeugt eine neue Notification
- Alternativ: mehrere Users x Webhook-Calls = 79 total

**Zweiter Dedup-Pfad (correlation_id) prueft zu frueh:**
Der `check_correlation_duplicate()`-Check in Z. 99-108 prueft BEVOR `_broadcast_to_all()` aufgerufen wird. Beim ersten Call gibt es keine Notification -> keine Dedup. Nach dem ersten Call existieren Notifications mit `correlation_id="grafana_abc123"`. Beim zweiten Call (z.B. nach 4h repeat_interval) greift `check_correlation_duplicate()` — ABER nur wenn die Notifications noch ACTIVE/ACKNOWLEDGED sind. Falls sie inzwischen RESOLVED wurden (durch Auto-Resolve oder manuell), greift die Dedup nicht mehr, und ein neuer Alert-Zyklus beginnt.

---

### 3.5 V-AL-04: Auto-Resolve

**Implementiert: JA**

**Code-Pfad:**
```
Grafana sendet alert.status = "resolved"
  -> webhooks.py Z. 206: if alert.status == "resolved" and correlation_id:
  -> notification_repo.auto_resolve_by_correlation("grafana_<fingerprint>")
     -> UPDATE notifications
        SET status="resolved", resolved_at=now, updated_at=now
        WHERE correlation_id = "grafana_<fingerprint>"
        AND status IN ("active", "acknowledged")
     -> return rowcount
  -> db.commit()
  -> increment_alert_resolved(severity, resolution_type="auto")
  -> continue  (keine neue Info-Notification erstellt)
```

**Matcht auf correlation_id** (nicht auf fingerprint), da per-User-Notifications zwar kein fingerprint aber correlation_id enthalten. Auto-Resolve funktioniert daher korrekt trotz des fingerprint-Propagierungsfehlers.

---

### 3.6 V-AL-03: MockActuator Emergency-Stop CRITICAL-Log

**Datei:** `El Servador/god_kaiser_server/src/services/simulation/actuator_handler.py`

**CRITICAL-Log-Stelle:** Zeile 257, Methode `handle_broadcast_emergency()`

```python
logger.critical("[MockActuator] Broadcast emergency stop received!")
```

**Warum CRITICAL:** Ein Broadcast-Emergency-Stop (Topic: `kaiser/broadcast/emergency`) schaltet ALLE aktiven Mock-ESPs gleichzeitig ab. Dies ist ein System-weites Ereignis, das sofortige Aufmerksamkeit erfordert.

**Vergleich der Log-Level:**
| Methode | Trigger | Log-Level |
|---------|---------|-----------|
| `handle_broadcast_emergency()` | `kaiser/broadcast/emergency` | CRITICAL (Z. 257) |
| `handle_emergency()` | `kaiser/{id}/esp/{esp_id}/actuator/emergency` | WARNING (Z. 205) |
| `emergency_stop()` | Direkte API-Methode | WARNING (via handle_emergency) |
| `clear_emergency()` | Notfall aufheben | INFO (Z. 300) |

**Wirkung auf ao-loki-critical-burst:**
Da `ao-loki-critical-burst` Threshold `> 0` mit Query-Window `5m` verwendet und alle Services ausser postgres scannet, triggert ein MockActuator-Broadcast-Emergency sofort diesen Grafana-Alert. Das ist Design — ein System-weiter Notfall-Stopp soll unmittelbar als kritischer Alert sichtbar sein.

---

## 4. Extended Checks (eigenstandig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| uid-Zaehlung alert-rules.yml | 37 Rules |
| uid-Zaehlung loki-alert-rules.yml | 5 aktiv (1 kommentiert) |
| fingerprint in _broadcast_to_all() propagiert? | NEIN — fehlt in user_notification-Erstellung (Z. 191-203) |
| correlation_id in _broadcast_to_all() propagiert? | JA — Z. 202 |
| Auto-Resolve implementiert? | JA — auto_resolve_by_correlation() in notification_repo.py |
| disableResolveMessage in contact-points | false (resolved wird empfangen und verarbeitet) |
| MockActuator emergency_stop() direkte API | WARNING-Level |
| MockActuator handle_emergency() ESP-spezifisch | WARNING-Level |
| MockActuator handle_broadcast_emergency() | CRITICAL-Level (beabsichtigt) |

---

## 5. Bewertung & Empfehlung

### Root Cause: 79 identische Notifications

**Root Cause:** `_broadcast_to_all()` in `notification_router.py` propagiert `fingerprint` nicht an die per-User-`NotificationCreate`-Objekte (Zeilen 191-203). Damit greift `check_fingerprint_duplicate()` nie fuer Broadcast-Notifications. Als Fallback gilt nur die title-basierte 60s-Dedup, die bei Grafana-repeat_interval-Webhooks (alle 4h) oder mehrfachen Alert-Evaluierungen nicht ausreicht.

**Fix-Ort:** `notification_router.py`, Methode `_broadcast_to_all()`, Zeilen 191-203

```python
# Fehlende Zeile hinzufuegen:
user_notification = NotificationCreate(
    user_id=user.id,
    ...
    correlation_id=notification.correlation_id,
    fingerprint=notification.fingerprint,  # <-- hinzufuegen
)
```

### Nächste Schritte

1. **KRITISCH:** `_broadcast_to_all()` fixen — `fingerprint` propagieren. Fix ist minimal, Zeile ~202 der Methode.
2. **MEDIUM:** Nach dem Fix pruefe ob `check_correlation_duplicate()` als zweite Schutzschicht behalten werden soll oder redundant ist.
3. **LOW:** Evaluiere ob `ao-loki-critical-burst` Threshold `> 0` auf `> 1` oder `> 2` erhoehen soll, um einzelne transiente CRITICAL-Logs nicht sofort als Grafana-Alert zu werten.
4. **INFO:** MockActuator CRITICAL-Log bei Broadcast-Emergency ist korrekt und erfordert keine Aenderung.
