# V7.1 Alert-Kategorie-Trennung — Verifikationsbericht

> **Datum:** 2026-03-03
> **Agent:** server-development
> **Geprueft:** Alle NotificationCreate-Aufrufe, notification_router.py, Frontend-Stores

---

## Kategorie-Inventar (source UND category)

### Alle NotificationCreate-Aufrufe im System

| Wo (Datei:Zeile) | Trigger | source | category | Korrekt? |
|---|---|---|---|---|
| sensor_handler.py:563-575 | Suppressed Threshold | `"sensor_threshold"` | `"data_quality"` | **JA** |
| sensor_handler.py:588-599 | Threshold Alert | `"sensor_threshold"` | `"data_quality"` | **JA** |
| actuator_alert_handler.py:227-241 | emergency_stop | `"mqtt_handler"` | `"system"` (via ALERT_CATEGORY) | **JA** |
| actuator_alert_handler.py:227-241 | runtime_protection | `"mqtt_handler"` | `"maintenance"` (via ALERT_CATEGORY) | **JA** |
| actuator_alert_handler.py:227-241 | safety_violation | `"mqtt_handler"` | `"security"` (via ALERT_CATEGORY) | **JA** |
| actuator_alert_handler.py:227-241 | hardware_error | `"mqtt_handler"` | `"infrastructure"` (via ALERT_CATEGORY) | **JA** |
| notification_executor.py:152-161 | Logic Rule Action | `"logic_engine"` | `"system"` (hardcoded) | **HINWEIS** — immer "system", nicht kontextabhaengig |
| webhooks.py:253-264 | Grafana Webhook | `"grafana"` | dynamisch aus Payload | **JA** |
| alert_suppression_scheduler.py:199-212 | Wartung faellig | `"system"` | `"maintenance"` | **JA** |
| notifications.py:428-437 | Manuell (Admin-API) | dynamisch aus Request | dynamisch aus Request | **JA** — Frontend/Admin setzt Werte |

### Nicht-Notification-Erzeuger (bestaetigt)

| Wo | Was passiert | Notification? |
|---|---|---|
| error_handler.py | Speichert in AuditLog, NICHT in Notification-Tabelle | **NEIN** — kein NotificationCreate |
| lwt_handler.py | Speichert AuditLog + DB-Status-Update + WS-Broadcast | **NEIN** — kein NotificationCreate |
| diagnostics_service.py | Speichert DiagnosticReport, KEINE Notifications | **NEIN** — kein NotificationCreate |
| circuit_breaker.py | Logging only | **NEIN** |
| Health-Endpoints | HTTP-Status-Responses | **NEIN** |

---

## Pipeline-Analyse

### Sensor-Alert-Pipeline
- **KORREKT** — `source="sensor_threshold"`, `category="data_quality"` korrekt gesetzt (sensor_handler.py:572/596)
- Sowohl suppressed als auch unsuppressed Notifications verwenden konsistente Werte
- `NotificationRouter.route()` reicht `category` und `source` 1:1 durch (notification_router.py:100-120)

### System-Alert-Pipeline
- **Teilweise KORREKT** mit identifizierten Problemen:

#### Problem 1: error_handler.py — KEIN NotificationCreate
- `error_handler.py` erzeugt **KEINE Notifications**! Es speichert nur in `AuditLog` und broadcastet via WebSocket (`error_event`).
- Die `"HARDWARE"` Grossschreibung (payload.get("category") Zeile 160/208) betrifft nur das `details`-Dict im AuditLog und den WebSocket-Broadcast — NICHT die Notification-Tabelle.
- **Bewertung:** Kein Bug im Notification-System. Der WebSocket-Broadcast enthaelt `category: "HARDWARE"` als Rohdaten vom ESP32, was korrekt ist (ESP sendet Grossbuchstaben). Frontend muss dies bei der WS-Verarbeitung beachten.
- **Empfehlung:** Fuer zukuenftige Notification-Integration (wenn ESP-Errors auch als Notifications erscheinen sollen) muss die category auf lowercase gemappt werden.

#### Problem 2: lwt_handler.py — KEIN NotificationCreate
- LWT erzeugt **KEINE Notification**! Es aktualisiert den ESP-Status in der DB und broadcastet `esp_health` via WebSocket.
- ESP-Disconnects erscheinen daher NICHT im Notification-Inbox des Users.
- **Bewertung:** Architektur-Entscheidung, kein Bug. Disconnects sind transient und werden ueber die HeartbeatHandler-Timeout-Logik gehandelt.
- **Empfehlung:** Wenn ESP-Disconnects als Notifications gewuenscht sind (z.B. fuer Hardware-Test-Monitoring), muss ein NotificationCreate mit `source="device_event"`, `category="connectivity"` hinzugefuegt werden.

#### Problem 3: notification_executor.py — Hardcoded "system"
- Logic-Rule-Notifications verwenden immer `category="system"` (Zeile 156).
- Wenn eine Logic-Rule z.B. auf Sensor-Daten reagiert, waere `category="data_quality"` semantisch korrekter.
- **Bewertung:** Akzeptabel fuer HW-Test. Logic Engine ist eine System-Komponente → "system" ist vertretbar.

### Fingerprint-Separation
- `notification_router.py:98-101` — Dedup prueft `source`, `category`, `title` und `user_id`. Category fliesst in die Dedup-Logik ein.
- `fingerprint` Feld (Schema Zeile 98-101) wird separat behandelt — Grafana-Alerts nutzen Grafana-eigene Fingerprints.
- **Ergebnis:** Sensor-Alerts und System-Alerts werden NICHT versehentlich dedupliziert (verschiedene source + category + title).

### Root-Cause-Suppression
- `parent_notification_id` Feld existiert und wird durch `notification_router.py` durchgereicht.
- ISA-18.2 Cascade-Suppression funktioniert unabhaengig von category.
- **KORREKT**

---

## Frontend-Nutzung

### Kategorie verfuegbar im Store: **JA**
- `notification-inbox.store.ts:255/259` — `category` und `source` werden aus WebSocket-Daten extrahiert und im Store gespeichert.
- `api/notifications.ts:41/45` — `NotificationDTO` hat `category: NotificationCategory` und `source: NotificationSource` als typisierte Felder.
- `api/notifications.ts:18-25` — `NotificationCategory` Type definiert: `connectivity | data_quality | infrastructure | lifecycle | maintenance | security | system`
- `api/notifications.ts:26-34` — `NotificationSource` Type definiert: `logic_engine | mqtt_handler | grafana | sensor_threshold | device_event | autoops | manual | system`

### Kategorie-Filter implementiert: **TEILWEISE**
- `NotificationListFilters` (notifications.ts:64-65) hat `category?` und `source?` als Filter-Parameter — API unterstuetzt Filterung.
- `AlertActiveListFilters` (notifications.ts:141) hat `category?` als Filter-Parameter.
- **QuickAlertPanel.vue:** Kein Kategorie-Filter (filtert nach Status + Severity). Identifizierte Luecke, wird in Phase C V4.3 adressiert.
- **NotificationDrawer.vue:** Status-Tabs, kein expliziter Kategorie-Filter.

### Visueller Unterschied: **NEIN**
- Keine visuelle Differenzierung nach category im Frontend. Keine unterschiedlichen Icons oder Farben pro Kategorie.

---

## Isolation Forest / Anomalie-Detection Status

- [x] **KEINE aktive Anomalie-Detection**
- `ai.py` Zeile 25/51 definiert nur das DB-Model `AIPrediction` mit `prediction_type: anomaly_detection` — das ist eine Datenstruktur, kein aktiver Service.
- Keine `sklearn`, `IsolationForest` oder aktive ML-Imports im `src/`-Verzeichnis.
- **Ergebnis:** Keine unerwartete KI-Anomalie-Erkennung die falsche Alerts erzeugen koennte.

---

## Empfehlungen

1. **[NICHT BLOCKIEREND]** `error_handler.py` erzeugt keine Notifications — wenn ESP-Hardware-Errors im Notification-Inbox erscheinen sollen, muss NotificationCreate mit `source="mqtt_handler"`, `category="infrastructure"` hinzugefuegt werden.
2. **[NICHT BLOCKIEREND]** `lwt_handler.py` erzeugt keine Notifications — ESP-Disconnects sind nur via WebSocket sichtbar, nicht im Notification-Inbox.
3. **[NICHT BLOCKIEREND]** `notification_executor.py` verwendet hardcoded `category="system"` — kontextabhaengige Kategorie waere praeziser.
4. **[PHASE C V4.3]** Frontend-Kategorie-Filter fehlt — Store hat die Daten, UI zeigt sie nicht differenziert.

---

## Bewertung

- **SAUBER GETRENNT: JA** — Wo Notifications erzeugt werden, sind source und category korrekt und konsistent gesetzt.
- **BLOCKIERT HW-TEST: NEIN** — Das System funktioniert korrekt. Die identifizierten Luecken (fehlende Notifications fuer Errors/LWT) sind Feature-Requests, keine Bugs.
- **SOFORT-FIX erforderlich: NEIN**
