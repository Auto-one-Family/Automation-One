# T16-V2 Block D — Alert-Konfiguration E2E Verifikation
**Datum:** 2026-03-10
**Branch:** feat/T13-zone-device-scope-2026-03-09

---

## V-AK-01: ISA-18.2 Alert-Lifecycle
**Ergebnis:** PASS

**Status-Verteilung (DB):**
```
status    | count
----------+-------
active    |    10
resolved  |    83
acknowledged: 0 (kein Eintrag in DB)
```

**Acknowledge-API:** `PATCH /v1/notifications/{id}/acknowledge` — funktional Ja
- Endpoint in `El Servador/god_kaiser_server/src/api/v1/notifications.py` (Zeile 359–401)
- Pre-check: fetcht aktuelle State, wertet `AlertStatus.VALID_TRANSITIONS` aus
- Broadcastet `notification_updated` + `unread_count` via WebSocket nach Erfolg
- Prometheus-Metrik: `increment_alert_acknowledged(severity)`

**Resolve-API:** `PATCH /v1/notifications/{id}/resolve` — funktional Ja
- Endpoint in `src/api/v1/notifications.py` (Zeile 409–450)
- Identische Transition-Validierung, `resolution_type="manual"`
- Prometheus-Metrik: `increment_alert_resolved(severity, resolution_type)`

**Transition-Validierung:** vorhanden — vollständig implementiert

Details aus `El Servador/god_kaiser_server/src/db/models/notification.py` (Zeile 413–417):
```python
VALID_TRANSITIONS = {
    ACTIVE: {ACKNOWLEDGED, RESOLVED},
    ACKNOWLEDGED: {RESOLVED},
    RESOLVED: set(),  # Terminal state
}
```
Ungültige Transition (z.B. RESOLVED → ACTIVE) wirft `AlertInvalidStateTransition` (Error-Code 5860).

**AlertStatusBar:** vorhanden in `El Frontend/src/components/notifications/AlertStatusBar.vue`
- Zeigt active_count, acknowledged_count (wenn > 0)
- MTTA/MTTR werden aus `alertStore.mttaFormatted`/`alertStore.mttrFormatted` gerendert — Werte kommen vom `/alerts/stats` Endpoint
- Polling via `alertStore.startStatsPolling()` in `onMounted`
- Bar nur sichtbar wenn `active_count > 0 || acknowledged_count > 0 || resolved_today_count > 0`

**Anmerkung:** acknowledged_count = 0 in DB erklärt, warum kein "acknowledged"-Eintrag bei der GROUP BY Abfrage erscheint (SQL gibt 0-Zeilen nicht aus). Das ist korrekt.

---

## V-AK-02: NotificationDrawer + Frontend-Verwaltung
**Ergebnis:** PASS

**Filter — vorhanden (alle 3 Typen):**
- Severity-Filter (Tabs): Alle | Kritisch | Warnungen | System
- Status-Filter (Tabs): Alle | Aktiv (N) | Gesehen (N) | Erledigt (N)
- Source-Filter (Chips): Alle | Sensor | Infrastruktur | Aktor | Regel | System

**Bulk-Actions:** vorhanden
- "Alle gelesen" Button (`handleMarkAllRead`) — ruft `PATCH /v1/notifications/read-all` auf
- Ergebnis-Broadcast via WS `notification_unread_count`

**WS-Push:** Ja — 3 WebSocket-Events delegiert von `esp.store.ts`:
1. `notification_new` → `handleWSNotificationNew()` — neues Item an Liste prependen, Browser-Push bei critical
2. `notification_updated` → `handleWSNotificationUpdated()` — Status-Felder (incl. acknowledged_at, resolved_at) aktualisieren
3. `notification_unread_count` → `handleWSUnreadCount()` — Badge-Count autoritativ vom Server

**Pagination:** Ja — Lazy Loading
- Initial: 50 Einträge per `loadInitial()`
- "Mehr laden" Button sichtbar wenn `inboxStore.hasMore === true`
- `loadMore()` lädt jeweils nächste 50 Einträge via `page`-Parameter

**Acknowledge/Resolve im Drawer:** vorhanden
- `handleAcknowledge(id)` → `alertStore.acknowledgeAlert(id)` → `PATCH /acknowledge`
- `handleResolve(id)` → `alertStore.resolveAlert(id)` → `PATCH /resolve`
- Buttons in `NotificationItem.vue` (delegiert via emit `@acknowledge` / `@resolve`)

**Implementierungspfad:**
- `El Frontend/src/components/notifications/NotificationDrawer.vue`
- `El Frontend/src/shared/stores/notification-inbox.store.ts`
- `El Frontend/src/shared/stores/alert-center.store.ts` (acknowledge/resolve Actions)

---

## V-AK-03: Notification-Preferences
**Ergebnis:** PASS

**DB-Tabelle:** vorhanden — `notification_preferences` in `god_kaiser_db`

Schema (aus Model `El Servador/god_kaiser_server/src/db/models/notification.py`, Klasse `NotificationPreferences`, Zeile 264+):
- `user_id` (PK + FK 1:1)
- `websocket_enabled`, `email_enabled`, `email_address`, `email_severities`
- `quiet_hours_enabled`, `quiet_hours_start`, `quiet_hours_end`
- `digest_interval_minutes`
- `browser_notifications`

**DB-Inhalt (Stichprobe):**
```
websocket_enabled: true | email_enabled: false | quiet_hours_enabled: false | browser_notifications: false
```

**API-Endpoints:**
- `GET /v1/notifications/preferences` — `get_or_create()` (auto-erstellt bei erstem Zugriff)
- `PUT /v1/notifications/preferences` — Update aller Felder via `NotificationPreferencesUpdate`

**Frontend-Panel:** vorhanden — `El Frontend/src/components/notifications/NotificationPreferences.vue`

**Features:**
- WebSocket-Toggle: Ja (Radio icon, mit Hint-Text)
- Email: Ja (Toggle + Adresse + Severity-Checkboxes + Test-E-Mail Button)
- Quiet-Hours: Ja (Toggle + Von/Bis Zeitfelder, in AccordionSection "Erweiterte Einstellungen")
- Digest: Ja (Intervall in Minuten, 0 = deaktiviert)
- Browser-Push: Ja (Toggle, fordert `Notification.requestPermission()` an)

**Zugang:** Settings-Icon in NotificationDrawer Header → `inboxStore.openPreferences()`

---

## V-AK-04: Per-Sensor Alert-Suppression + Custom-Thresholds
**Ergebnis:** PASS

**DB-Schema alert_config:**
```
sensor_configs.alert_config   — Typ: json (vorhanden)
actuator_configs.alert_config — Typ: json (vorhanden)
```
JSONB-Felder existieren in beiden Tabellen.

**AlertConfigSection in SensorConfigPanel:** vorhanden
- Import in `El Frontend/src/components/esp/SensorConfigPanel.vue` (Zeile 26)
- Eingebunden bei Zeile 848 in einem AccordionSection-Block
- Kommentar: "Alert-spezifische Overrides: AlertConfigSection (eigener Save PATCH /sensors/{id}/alert-config)"

**AlertConfigSection in ActuatorConfigPanel:** vorhanden
- Import in `El Frontend/src/components/esp/ActuatorConfigPanel.vue` (Zeile 24)
- Eingebunden bei Zeile 615

**Custom-Thresholds:** editierbar
- Formularfelder: Warn Min, Warn Max, Kritisch Min, Kritisch Max
- Gespeichert unter `alert_config.custom_thresholds`
- Nur gesendet wenn mindestens ein Wert gesetzt

**Severity Override:** vorhanden (Dropdown: Automatisch | Kritisch | Warnung | Info)

**Suppression:** vorhanden mit Zeitlimit
- Master-Toggle (BellOff/Bell)
- Suppression-Grund: Wartung | Absichtlich offline | Kalibrierung | Benutzerdefiniert
- Freitext-Notiz (optional)
- `suppression_until` — datetime-local Feld (Zeitlimit für Auto-Reaktivierung)
- Leer lassen = manuelle Reaktivierung erforderlich

**AlertSuppressionService im Flow:** aufgerufen
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 558–626):
  ```python
  suppression_svc = AlertSuppressionService(session)
  is_suppressed, suppression_reason = await suppression_svc.is_sensor_suppressed(...)
  if is_suppressed:
      # skip alert generation
  ```
- Service in `El Servador/god_kaiser_server/src/services/alert_suppression_service.py`
- Scheduler für Auto-Reaktivierung: `alert_suppression_scheduler.py`
- Integration-Tests: `tests/integration/test_alert_suppression_service.py`, `test_alert_suppression_scheduler.py`

**DeviceAlertConfigSection:** zusätzlich existiert `El Frontend/src/components/devices/DeviceAlertConfigSection.vue` — Zone/Device-Ebene Suppression (separates Konzept)

---

## Zusammenfassung

| Test | Ergebnis | Kritische Findings |
|------|----------|-------------------|
| V-AK-01 ISA-18.2 Alert-Lifecycle | PASS | — |
| V-AK-02 NotificationDrawer | PASS | — |
| V-AK-03 Notification-Preferences | PASS | — |
| V-AK-04 Per-Sensor Suppression | PASS | — |

**Gesamtergebnis Block D: 4/4 PASS**

Das Alert-System ist vollständig implementiert:
- ISA-18.2 Lifecycle (active → acknowledged → resolved) mit State-Machine-Validierung und Error-Code 5860
- NotificationDrawer mit 3 Filter-Dimensionen, Lazy Loading, WS-Push, Bulk-Action
- Notification-Preferences mit DB-Persistenz (5 Feature-Kategorien)
- Per-Device Suppression mit Zeitlimit, Custom-Thresholds und AlertSuppressionService im MQTT-Handler-Flow
