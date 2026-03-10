# T16-V2 Block B — Alert-Pipeline + Notification-Flooding Analyse

**Erstellt:** 2026-03-10
**Modus:** B — Spezifisch: Alert-Rule-Konfiguration und Notification-Flooding-Ursache
**Quellen:**
- `docker/grafana/provisioning/alerting/loki-alert-rules.yml`
- `docker/grafana/provisioning/alerting/alert-rules.yml`
- `docker/grafana/provisioning/alerting/notification-policies.yml`
- `docker/grafana/provisioning/alerting/contact-points.yml`
- `El Servador/god_kaiser_server/src/api/v1/webhooks.py`
- `El Servador/god_kaiser_server/src/services/notification_router.py`
- `El Servador/god_kaiser_server/src/db/repositories/notification_repo.py`
- PostgreSQL: `notifications`-Tabelle (90 Eintraege)

---

## V-AL-01: Alert-Rule + Notification-Policy Konfiguration

**Ergebnis:** PARTIAL

### Details

#### Rule `ao-loki-critical-burst`

| Parameter | Wert |
|-----------|------|
| Datei | `loki-alert-rules.yml` |
| Group | `automationone-loki-alerts` |
| Evaluation-Intervall | `1m` |
| For-Duration | `1m` (fires after 1 consecutive evaluation) |
| Window | `5m` (LogQL: `[5m]`) |
| Query | `sum(count_over_time({compose_service=~".+", compose_service!="postgres"} \| level="CRITICAL" [5m]))` |
| Threshold | `> 0` (jede einzige CRITICAL-Log-Zeile genuegt) |
| Severity-Label | `critical` |
| NoData | `OK` |
| ExecErr | `Alerting` |

**Auffaelligkeit:** Threshold ist `> 0` — eine einzige CRITICAL-Zeile in 5 Minuten triggert den Alert. Das ist sehr aggressiv und erklaert die 2 CRITICAL-Notifications (`grafana_ad1aadc54ad6ea76`) die im FLOODING-Assessment erscheinen (avg_gap 5640s ~ 94min, unter dem 4h repeat_interval).

#### Rule `ao-loki-error-storm`

| Parameter | Wert |
|-----------|------|
| Datei | `loki-alert-rules.yml` |
| Group | `automationone-loki-alerts` |
| Evaluation-Intervall | `1m` |
| For-Duration | `2m` (fires after 2 consecutive evaluations) |
| Window | `5m` (LogQL: `[5m]`) |
| Query | `sum(count_over_time({compose_service="el-servador"} \|~ "(level=\"ERROR\"\|Traceback\|Exception\|HTTP/1.1\" 5)" [5m]))` |
| Threshold | `> 10` (mehr als 10 Fehler/5min) |
| Severity-Label | `warning` |
| NoData | `OK` |
| ExecErr | `Alerting` |

**Auffaelligkeit:** Es existiert nur 1 Notification mit dieser Rule (`grafana_3e50e3053c7b0dd7`, `2026-03-09 11:39:14`). Kein Flooding-Problem fuer diese Rule.

#### Notification Policies

| Parameter | Wert | Bedeutung |
|-----------|------|-----------|
| Receiver | `automationone-webhook` | POST zu `http://el-servador:8000/api/v1/webhooks/grafana-alerts` |
| `group_by` | `[grafana_folder, alertname]` | Gruppiert nach Ordner + Alertname |
| `group_wait` | `30s` | Wartezeit vor erster Notification einer neuen Gruppe |
| `group_interval` | `5m` | Mindestabstand zwischen Gruppenbenachrichtigungen (bei Aenderung) |
| `repeat_interval` | `4h` | Wiederholungsintervall fuer weiterhin aktive Alerts |
| `maxAlerts` | `10` | Max. Alerts pro Webhook-Payload |

**Bewertung:** Die Policy ist korrekt konfiguriert. `repeat_interval: 4h` bedeutet, ein dauerhaft feuerder Alert sollte alle 4 Stunden eine neue Notification produzieren (~14400s). Die tatsaechlichen avg_gap-Werte in der DB schwanken: manche correlation_ids zeigen ~10000-16000s (unter 4h), was auf Refire-Cycles nach "Resolved" hindeutet, nicht auf Policy-Fehler.

#### Webhook-Handler (Server)

| Parameter | Wert |
|-----------|------|
| Endpoint | `POST /api/v1/webhooks/grafana-alerts` |
| Payload-Parsing | Pydantic-Schemas `GrafanaWebhookPayload` + `GrafanaAlert` |
| Severity-Mapping | `alert.status == "resolved"` → `"info"`, Label `critical/error` → `"critical"`, Label `warning/warn` → `"warning"`, Fallback → `"warning"` |
| Fingerprint-Herkunft | `alert.fingerprint` direkt aus Grafana-Payload |
| Correlation-ID | `f"grafana_{alert.fingerprint}"` |
| Dedup-Pfad fuer Broadcasts | `check_correlation_duplicate(correlation_id)` |
| Fingerprint-Pfad fuer User-Notifications | `check_fingerprint_duplicate(fingerprint)` |

**Root Cause identifiziert** (siehe V-AL-02): Der Fingerprint wird nicht in die `_broadcast_to_all`-Kopien weitergegeben. Die per-User-Notifications haben keinen `fingerprint`-Wert in der DB.

---

## V-AL-02: Notification-Tabelle + Fingerprint-Analyse

**Ergebnis:** FAIL

### SQL-Ergebnisse

#### Notification-Uebersicht (Top-Quellen nach Haeufigkeit)

```
source   | category       | severity | title                                    | cnt | first      | last
---------|----------------|----------|------------------------------------------|-----|------------|-----
grafana  | connectivity   | warning  | ESP32 Heartbeat-Luecke                   |  21 | 2026-03-08 | 2026-03-10
grafana  | connectivity   | info     | ESP32 Heartbeat-Luecke                   |  15 | 2026-03-08 | 2026-03-10
grafana  | data_quality   | warning  | Sensordaten veraltet                     |  12 | 2026-03-08 | 2026-03-10
grafana  | infrastructure | warning  | Frontend nicht erreichbar                |  10 | 2026-03-09 | 2026-03-10
grafana  | system         | info     | No Grafana webhooks received for >1 hour |   8 | 2026-03-09 | 2026-03-10
```

**Nur eine Source:** Alle 90 Notifications stammen von `grafana`. Keine System-, MQTT- oder Sensor-Notifications aus internen Quellen vorhanden.

#### Status-Verteilung

```
is_read | is_archived | status   | count
--------|-------------|----------|------
false   | false       | resolved |   78
false   | false       | active   |    6
true    | false       | resolved |    5
```

**Auffaelligkeit:** 78 von 89 nicht-archivierten Notifications sind `resolved` aber `is_read=false`. Das ist erwartet, da `auto_resolve_by_correlation()` den `resolved_at`-Timestamp setzt aber nicht `is_read=true` (nur `resolve_alert()` setzt `is_read=true`).

#### Fingerprint-Analyse (Kernbefund)

```
fingerprint | correlation_id              | cnt
------------|-----------------------------|----|
(NULL)      | grafana_796869f4ea658850   |  11
(NULL)      | grafana_bc4610db680147a5   |  11
(NULL)      | grafana_d5ac2636f9178437   |  10
...
```

**Befund:** `fingerprint`-Spalte ist in ALLEN 90 Grafana-Notifications `NULL`.

```
total | has_fingerprint | null_fingerprint | has_correlation_id
------|-----------------|------------------|-------------------
   90 |               0 |               90 |                 90
```

`correlation_id` ist dagegen in allen 90 Eintraegen gesetzt (`grafana_{fingerprint}`).

#### Flooding-Assessment (avg_gap vs. 4h = 14400s)

Alerts mit `avg_gap < 14400s` (unter dem konfigurierten `repeat_interval: 4h`) und mehr als 1 Notification:

| correlation_id | cnt | avg_gap_s | assessment |
|----------------|-----|-----------|------------|
| grafana_bc4610db680147a5 | 11 | 10093 | FLOODING |
| grafana_d5ac2636f9178437 | 10 | 10465 | FLOODING |
| grafana_ad1aadc54ad6ea76 | 2  | 5640  | FLOODING |
| grafana_f9ad68b1e8eb5e89 | 2  | 11988 | FLOODING |
| grafana_c79a7c6ad7aae4f3 | 2  | 4410  | FLOODING |

Die flooding-Alerts `bc4610db...` und `d5ac2636...` sind VOLLSTAENDIG resolved (alle 11 bzw. 10 Zeilen haben `status=resolved`). Das erklaert das Muster: Jedes Mal wenn Grafana "firing" sendet, wird eine neue Notification angelegt (Dedup schlaegt fehl weil kein ACTIVE-Eintrag mehr existiert), dann kommt "resolved" → `auto_resolve_by_correlation()` setzt alle auf resolved.

### Fingerprint-Deduplizierungslogik — Code-Trace

**Generierung:** Im Webhook-Handler (`webhooks.py:203`):
```python
correlation_id = f"grafana_{alert.fingerprint}" if alert.fingerprint else None
```
und weiter unten (`webhooks.py:267-270`):
```python
notification = NotificationCreate(
    fingerprint=alert.fingerprint,        # <- korrekt gesetzt
    correlation_id=correlation_id,        # <- korrekt gesetzt
)
```

**Routing-Pfad:** `route()` in `notification_router.py`:
- `user_id=None` → Pfad geht in `_broadcast_to_all(notification)` (Zeile 109)
- Vor diesem Aufruf: `check_correlation_duplicate(correlation_id)` (Zeile 100) — prueft ob ACTIVE/ACKNOWLEDGED existiert
- `check_fingerprint_duplicate(fingerprint)` wird NICHT aufgerufen fuer `user_id=None`-Broadcasts

**`_broadcast_to_all()` (Zeile 184-207):** Erstellt pro User eine neue `NotificationCreate` mit `user_id=user.id`. Dabei wird `fingerprint` NICHT uebertragen — nur: `channel`, `severity`, `category`, `title`, `body`, `metadata`, `source`, `parent_notification_id`, `correlation_id`.

**In `route()` fuer den User-Call:** `user_id != None` → geht in den user-spezifischen Pfad. Dort wird `check_fingerprint_duplicate()` geprueft. Da `fingerprint` in der per-User-`NotificationCreate` NICHT gesetzt ist (fehlt in `_broadcast_to_all`), schlaegt dieser Check nicht an. Die DB-Zeile hat `fingerprint=NULL`.

**`check_correlation_duplicate()` (Zeile 243):** Prueft ob ACTIVE oder ACKNOWLEDGED existiert. Wenn der Alert von Grafana "resolved" gesendet wird und `auto_resolve_by_correlation()` alle bestehenden auf `status=resolved` setzt, findet der naechste "firing"-Webhook keinen ACTIVE-Eintrag mehr. Die Dedup-Luecke oeffnet sich genau dann, wenn:

1. Grafana sendet "firing" → Notification erstellt, `status=ACTIVE`
2. Grafana sendet "resolved" → `auto_resolve_by_correlation()` → alle auf `status=RESOLVED`
3. Grafana sendet "firing" erneut (nach Ablauf von `group_interval: 5m`) → `check_correlation_duplicate()` findet keinen ACTIVE → **neue Notification wird erstellt**

Das ist der Refire-Cycle: jedes "firing" → "resolved" → "firing" erzeugt eine neue Notification.

### Root Cause der Dedup-Luecke

**Primaer:** `fingerprint` wird in `_broadcast_to_all()` nicht in die per-User-`NotificationCreate` uebertragen. Dadurch haben alle 90 DB-Zeilen `fingerprint=NULL` und `check_fingerprint_duplicate()` kann nie greifen.

**Sekundaer:** `check_correlation_duplicate()` prueft nur `ACTIVE`/`ACKNOWLEDGED`. Nach einem "resolved"-Webhook setzt `auto_resolve_by_correlation()` den Status auf `RESOLVED`. Beim naechsten "firing"-Webhook findet die Pruefung keinen aktiven Eintrag — legitimes neues Firing, kein Fehler, aber bedingt durch den schnellen Refire-Cycle (~10000s statt erwarteten 14400s).

**Tertiaer:** Auch beim user-spezifischen Pfad (`user_id != None`) wird `check_fingerprint_duplicate()` nur fuer Notifications mit gesetztem `fingerprint` aufgerufen. Ohne `fingerprint` faellt der Code in den title-basierten Dedup (`check_duplicate()` mit `window_seconds=60`), der fuer Grafana-Alerts zu kurz ist.

### Fix-Empfehlung

**Fix 1 (kritisch):** `fingerprint` in `_broadcast_to_all()` weitergeben.

In `notification_router.py`, Methode `_broadcast_to_all()`, Zeile ~191:

```python
# JETZT (fehlt fingerprint):
user_notification = NotificationCreate(
    user_id=user.id,
    channel=notification.channel,
    ...
    correlation_id=notification.correlation_id,
)

# FIX:
user_notification = NotificationCreate(
    user_id=user.id,
    channel=notification.channel,
    ...
    correlation_id=notification.correlation_id,
    fingerprint=notification.fingerprint,  # <- HINZUFUEGEN
)
```

**Fix 2 (optional, defense-in-depth):** `check_correlation_duplicate()` auf alle nicht-`RESOLVED`-Zeiten erweitern — oder: beim Refire eines resolved Alerts die `correlation_id` auf eine neue UID mappen statt dieselbe zu recyceln.

**Fix 3 (optional):** `auto_resolve_by_correlation()` sollte den `fingerprint` auf NULL setzen nach Resolve, sodass ein neues Firing mit identischem Fingerprint nicht faelschlich dedupliziert wird (zukunftssicher wenn Fix 1 umgesetzt ist).

---

## Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `loki-alert-rules.yml` | OK | 5 Loki-Rules, davon 2 relevant (critical-burst, error-storm) |
| `notification-policies.yml` | OK | repeat_interval: 4h korrekt konfiguriert |
| `contact-points.yml` | OK | Webhook-URL korrekt |
| `webhooks.py` | PARTIAL | fingerprint korrekt aus Payload gelesen, aber in _broadcast_to_all verloren |
| `notification_router.py` | FAIL | _broadcast_to_all uebertraegt fingerprint nicht |
| `notification_repo.py` | OK | check_fingerprint_duplicate() + check_correlation_duplicate() korrekt implementiert |
| PostgreSQL `notifications` | FAIL | fingerprint=NULL in allen 90 Eintraegen, Flooding bestaetigt |

## Bewertung & Empfehlung

- **Root Cause:** `_broadcast_to_all()` in `notification_router.py` uebertraegt das `fingerprint`-Feld nicht in die per-User-NotificationCreate. Dadurch ist `fingerprint=NULL` in der DB und `check_fingerprint_duplicate()` kann nie greifen.
- **Sekundaerer Mechanismus:** `check_correlation_duplicate()` versagt nach "resolved"-Webhooks, da kein ACTIVE-Eintrag mehr existiert. Der Grafana-Refire-Cycle (firing → resolved → firing) erzeugt systematisch neue Notifications.
- **Schwere:** HOCH — fuehrt zu Notification-Flooding: ESP32 Heartbeat-Luecke 21+15=36 Eintraege, Sensordaten veraltet 12+6=18 Eintraege.
- **Fix-Aufwand:** 1 Zeile Code in `_broadcast_to_all()`, kein Schema-Change erforderlich.
- **Naechster Schritt:** `fingerprint=notification.fingerprint` in `_broadcast_to_all()` ergaenzen, anschliessend pytest + Server-Neustart.
