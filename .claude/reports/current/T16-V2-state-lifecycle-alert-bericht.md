# T16-V2 — Device-State-Lifecycle + Alert-Pipeline + Alert-Konfiguration E2E

**Datum:** 2026-03-10
**Typ:** Verifikationsbericht
**Vorgaenger:** T16-V1 (Config-Pipeline)
**Tests:** 14 (4x Block A + 4x Block B + 2x Block C + 4x Block D)

---

## Ergebnisuebersicht

| Test-ID | Beschreibung | Ergebnis |
|---------|-------------|----------|
| V-SS-01 | Actuator-State bei Offline-ESP | **FAIL** |
| V-SS-02 | Offline-Uebergangs-Logik | **FAIL** |
| V-SS-03 | Frontend ActuatorCard Stale-Darstellung | **PARTIAL** |
| V-SS-04 | ESP_00000001 Anomalie | **PARTIAL** |
| V-AL-01 | Alert-Rule + Notification-Policy | **PARTIAL** |
| V-AL-02 | Notification-Fingerprint-Analyse | **FAIL** |
| V-AL-03 | MockActuator Emergency-Stop Logs | **PASS** |
| V-AL-04 | Webhook → Notification Pipeline | **PASS** |
| V-RE-01 | Circuit Breaker Status | **PASS** |
| V-RE-02 | Logic Engine Health | **PASS** |
| V-AK-01 | ISA-18.2 Alert-Lifecycle | **PASS** |
| V-AK-02 | NotificationDrawer + Frontend | **PASS** |
| V-AK-03 | Notification-Preferences | **PASS** |
| V-AK-04 | Per-Sensor Suppression | **PASS** |

**Gesamt: 8 PASS, 3 PARTIAL, 3 FAIL**

---

## Block A — Stale Actuator State

### V-SS-01: Actuator-State bei Offline-ESP — FAIL

**Architekturkorrektur:** Actuator-State liegt in separater `actuator_states`-Tabelle, nicht in `actuator_configs`.

**Befund:**

| ESP | GPIO | State | Timestamp | ESP-Status | Bewertung |
|-----|------|-------|-----------|------------|-----------|
| ESP_00000001 | 26 | **on** | 1970-01-01 00:00:00 | offline | **STALE** |
| ESP_472204 | 27 | off | 2026-03-10 09:42:33 | offline | nicht verifizierbar |

- ESP_00000001/GPIO26: Relay zeigt `on` mit Epoch-Timestamp (1970) — State wurde nie per MQTT-ACK bestaetigt. ESP seit 18h offline. Realzustand unbekannt.
- Kein `state_updated_at`-Feld auf `actuator_configs` — Timestamp nur in `actuator_states`.

### V-SS-02: Offline-Uebergangs-Logik — FAIL

**Beide Offline-Pfade haben keinen Actuator-Reset:**

| Pfad | Code-Stelle | ESP offline setzen | Actuator-Reset | WS-Event |
|------|-------------|-------------------|----------------|----------|
| LWT-Handler | `lwt_handler.py:109-145` | Ja | **NEIN** | `esp_health` |
| Heartbeat-Timeout | `heartbeat_handler.py:1456-1459` | Ja | **NEIN** | `esp_health` |

**Root Cause:** Die Offline-Transition beruehrt `actuator_states` nicht. Server gibt stundealten Aktor-State zurueck.

**Fix-Empfehlung:**
1. Neue Methode `actuator_repo.reset_states_for_device(esp_id, new_state="unknown")` erstellen
2. In LWT-Handler UND `check_device_timeouts` nach Status-Update aufrufen
3. Migration: `actuator_states.last_command_timestamp` auf `TIMESTAMP WITH TIME ZONE` aendern

### V-SS-03: Frontend ActuatorCard Stale-Darstellung — PARTIAL

**Was funktioniert:**
- Offline-Indikator: CSS-Klasse `actuator-card--offline` mit `opacity: 0.5` + Badge "ESP offline" (`ActuatorCard.vue:55-57`)
- Stale-Erkennung: Threshold 60s, `opacity: 0.7` + Warning-Border (`ActuatorCard.vue:60-64`)
- Paritaet mit SensorCard grundsaetzlich vorhanden

**Drei Luecken:**

| Luecke | Schwere | Code-Stelle |
|--------|---------|-------------|
| Toggle-Button nicht disabled bei Offline-ESP | HOCH | `ActuatorCard.vue:168` — nur `emergency_stopped` prueft, `isEspOffline` fehlt |
| Kein Stale-Timestamp-Badge (SensorCard zeigt "vor 18h") | MITTEL | Badge-Bereich leer bei Stale |
| ActuatorCardWidget ohne Stale-/Offline-Logik | MITTEL | Dashboard-Widget zeigt `on` ohne Warnung |

**Fix-Empfehlung:**
1. Toggle: `:disabled="actuator.emergency_stopped || isEspOffline || isStale"`
2. Badge: Timestamp-Anzeige wie in SensorCard
3. Widget: `esp_state` / `last_seen` Props durchreichen

### V-SS-04: ESP_00000001 Anomalie — PARTIAL

**Befund:**
- ESP_00000001 ist echter Hardware-ESP (`ESP32_WROOM`), kein Mock
- Letzte Heartbeats: bis 14:30:04 UTC (09.03), dann Stille — RSSI bereits kritisch (-95 dBm)
- Sensor-Daten laufen weiter bis heute 09:06 UTC — alle `data_source=production`, identischer Wert `360/22.5` auf GPIO 4
- Kein Mock-Generator fuer echte ESPs — `SimulationScheduler` nur fuer `MOCK_ESP32`

**Root Cause:** `last_seen` wird NUR durch Heartbeat-Handler aktualisiert, NICHT durch Sensor-Handler. ESP sendet weiter Sensor-Daten via MQTT, aber der Heartbeat-Mechanismus ist ausgefallen (moegliche WiFi-Instabilitaet bei -95 dBm). Deshalb: `status=offline` trotz laufender Sensor-Daten.

**Empfehlung:**
1. `sensor_handler` sollte `last_seen` ebenfalls aktualisieren (oder zumindest als sekundaeren Indikator)
2. Alternativ: RSSI-basierte Warnung bei < -90 dBm implementieren

---

## Block B — Grafana Alert-Pipeline + Notification-Flooding

### V-AL-01: Alert-Rule + Notification-Policy — PARTIAL

**`ao-loki-critical-burst`:**
- Evaluation: 1m, For-Duration: 1m, Window: 5m
- Query: Alle Services ausser postgres
- **Threshold: `> 0`** — eine einzige CRITICAL-Zeile genuegt

**`ao-loki-error-storm`:**
- Evaluation: 1m, For-Duration: 2m, Window: 5m
- Threshold: `> 10` Fehler — kein Flooding-Problem

**Notification-Policy:** `group_wait: 30s`, `group_interval: 5m`, `repeat_interval: 4h`

**Kernbefund:** Policy ist korrekt konfiguriert. Das Problem liegt nicht in Grafana, sondern im Server-seitigen Webhook-Handler (siehe V-AL-02/V-AL-04).

### V-AL-02: Notification-Fingerprint-Analyse — FAIL

**Befund:** Alle 90 Grafana-Notifications haben `fingerprint=NULL`.

| Correlation-ID | Anzahl | Avg Intervall | Zeitraum |
|----------------|--------|---------------|----------|
| `bc4610db...` | 11 | ~10093s | 7h |
| `d5ac2636...` | 10 | ~10465s | 7h |
| (3 weitere) | 6-9 | <14400s | 7h |

**Root Cause (primaer):** `_broadcast_to_all()` in `notification_router.py` uebertraegt `fingerprint` nicht an per-User `NotificationCreate`. Dadurch greift `check_fingerprint_duplicate()` nie (NULL-Fingerprints werden uebersprungen).

**Root Cause (sekundaer):** `check_correlation_duplicate()` prueft nur `ACTIVE`/`ACKNOWLEDGED`. Nach "resolved"-Webhook setzt `auto_resolve_by_correlation()` alle auf `RESOLVED`. Naechster "firing"-Webhook findet kein ACTIVE → Dedup-Luecke. Grafana Refire-Cycle (~10000s statt erwartetem 14400s) multipliziert das Problem.

**Fix:** 1 Zeile in `_broadcast_to_all()`:
```python
fingerprint=notification.fingerprint,  # <- fehlt derzeit
```

### V-AL-03: MockActuator Emergency-Stop Startup-Logs — PASS

**CRITICAL-Log-Quelle:** `actuator_handler.py:257`
```python
logger.critical("[MockActuator] Broadcast emergency stop received!")
```

**Root Cause:** `actuators.py:970` publiziert Emergency-Stop mit `retain=True`. Beim naechsten Server-Start + Mock-Recovery wird die retained Message sofort zugestellt → CRITICAL-Log → Alert feuert.

**Fix-Empfehlung (3 Optionen):**
1. `retain=True` in `actuators.py:970` entfernen (empfohlen)
2. Beim Startup `clear_emergency` mit retain publizieren
3. Kurzfristig: Log-Level `CRITICAL → WARNING` in `actuator_handler.py:257`

### V-AL-04: Webhook → Notification Pipeline — PASS

**Trace bestaetigt V-AL-02-Befund:**
- Webhook-Handler: `POST /v1/webhooks/grafana-alerts` → `GrafanaWebhookPayload`
- `map_grafana_severity()`: Mappt Grafana-Labels auf AutomationOne-Severity
- `correlation_id = f"grafana_{alert.fingerprint}"` — korrekt erzeugt
- `auto_resolve_by_correlation()`: Implementiert — Grafana "resolved" → Notification resolved
- **Fingerprint-Propagation fehlt** in `_broadcast_to_all()` (Zeile 191-202)

---

## Block C — Circuit Breaker + Resilience

### V-RE-01: Circuit Breaker Status — PASS

| Breaker | State | Threshold | Recovery |
|---------|-------|-----------|---------|
| `mqtt` | closed | 5 Failures | 30s |
| `database` | closed | 3 Failures | 10s |
| `external_api` | closed | 5 Failures | 60s |

Keine State-Wechsel in den letzten 24h. Startup-Log: `healthy=True, breakers=3 (closed=3, open=0)`.

**Nebenbefund:** `ResilienceRegistry.get_health_status()` wird von keinem HTTP-Endpoint aufgerufen — Breaker-Status nur via Logs sichtbar.

### V-RE-02: Logic Engine Health — PASS

- Logic Engine + Scheduler gestartet (60s-Intervall bestaetigt)
- DB-Tabelle: `cross_esp_logic` (nicht `logic_rules`), Feld `enabled` (nicht `is_active`)
- **Aktive Rules: 0** — keine Rules konfiguriert (erwartetes Verhalten)
- Keine Errors/Timeouts in den letzten 6h
- Architektur: `LogicEngine._evaluation_loop()` = 1s-Keepalive; eigentliche Evaluierung event-getrieben + timer-getrieben via `LogicScheduler`

---

## Block D — Alert-Konfiguration E2E

### V-AK-01: ISA-18.2 Alert-Lifecycle — PASS

**Status-Verteilung:** active=10, resolved=83, acknowledged=0

**State-Machine (`notification.py`):**
- `ACTIVE → {ACKNOWLEDGED, RESOLVED}` — erlaubt
- `ACKNOWLEDGED → {RESOLVED}` — erlaubt
- `RESOLVED → {}` — Terminal, blockiert weitere Transitions

**Endpoints:**
- `PATCH /v1/notifications/{id}/acknowledge` — funktional, setzt `acknowledged_at`
- `PATCH /v1/notifications/{id}/resolve` — funktional, setzt `resolved_at`
- Error 5860 (`AlertInvalidStateTransition`) — implementiert und aktiv

**AlertStatusBar:** `AlertStatusBar.vue` — MTTA/MTTR via `/alerts/stats` Endpoint mit Polling

### V-AK-02: NotificationDrawer + Frontend — PASS

| Feature | Status |
|---------|--------|
| Severity-Filter (Alle/Kritisch/Warnungen/System) | Vorhanden |
| Status-Filter (Alle/Aktiv/Gesehen/Erledigt) | Vorhanden |
| Source-Filter (6 Quellen) | Vorhanden |
| Bulk "Alle gelesen" | Vorhanden (`PATCH /v1/notifications/read-all`) |
| WS-Push | 3 Events: `notification_new`, `notification_updated`, `notification_unread_count` |
| Browser-Push bei Critical | Automatisch |
| Pagination/Lazy-Loading | Initial 50, "Mehr laden" Button |

### V-AK-03: Notification-Preferences — PASS

**DB:** `notification_preferences` vorhanden, 1 Eintrag mit `websocket_enabled=true`

**Frontend:** `NotificationPreferences.vue` — vollstaendiges SlideOver-Panel:

| Feature | Status |
|---------|--------|
| WebSocket-Toggle | Vorhanden |
| Email (Toggle + Adresse + Severity-Checkboxes + Test-Mail) | Vorhanden |
| Quiet-Hours (Von/Bis) | Vorhanden |
| Digest-Intervall | Vorhanden |
| Browser-Push | Vorhanden |

### V-AK-04: Per-Sensor Suppression + Custom-Thresholds — PASS

| Feature | Status | Code-Stelle |
|---------|--------|-------------|
| AlertConfigSection in SensorConfigPanel | Vorhanden | Import + AccordionSection |
| AlertConfigSection in ActuatorConfigPanel | Vorhanden | Import + AccordionSection |
| Custom-Thresholds (Warn/Kritisch Min/Max) | 4 Felder, editierbar | AlertConfigSection |
| Suppression Master-Toggle | Vorhanden + 4 Gruende + Freitext | AlertConfigSection |
| `suppression_until` Zeitlimit | Auto-Reaktivierung implementiert | AlertSuppressionService |
| Im Notification-Flow aufgerufen | Ja | `sensor_handler.py` → `suppression_svc.is_sensor_suppressed()` |

---

## Kritische Findings (Fix-Prioritaet)

### 1. Notification-Fingerprint nicht propagiert (KRITISCH)
- **Root Cause:** `notification_router.py:_broadcast_to_all()` uebertraegt `fingerprint` nicht
- **Auswirkung:** Alle Grafana-Notifications mit `fingerprint=NULL`, Dedup greift nie, 90 Duplikate
- **Fix:** 1 Zeile: `fingerprint=notification.fingerprint` in `_broadcast_to_all()`
- **Sekundaer-Fix:** Correlation-Dedup sollte auch `RESOLVED` beruecksichtigen (Refire-Cycle)

### 2. Actuator-State-Reset bei Offline fehlt (HOCH)
- **Root Cause:** LWT-Handler und Heartbeat-Timeout setzen `actuator_states` nicht zurueck
- **Auswirkung:** Stale "on"-State fuer stromlose Aktoren taeuscht Nutzer
- **Fix:** `actuator_repo.reset_states_for_device(esp_id, "unknown")` in beiden Offline-Pfaden

### 3. Retained Emergency-Stop MQTT-Message (MITTEL)
- **Root Cause:** `actuators.py:970` publiziert mit `retain=True`, bleibt nach Restart erhalten
- **Auswirkung:** CRITICAL-Log bei jedem Restart → Alert feuert → Notification-Noise
- **Fix:** `retain=True` entfernen oder Startup-Clear implementieren

### 4. ActuatorCard Toggle bei Offline nicht disabled (MITTEL)
- **Root Cause:** `ActuatorCard.vue:168` — `:disabled` prueft nur `emergency_stopped`
- **Auswirkung:** User kann Command an Offline-ESP senden (wird nie ausgefuehrt)
- **Fix:** `isEspOffline || isStale` zur `:disabled`-Bedingung hinzufuegen

### 5. `last_seen` nur durch Heartbeat aktualisiert (MITTEL)
- **Root Cause:** `sensor_handler` aktualisiert `last_seen` nicht
- **Auswirkung:** ESP_00000001 erscheint offline obwohl Sensor-Daten ankommen
- **Fix:** `last_seen`-Update auch im Sensor-Handler oder sekundaeren Health-Indikator

---

## Detailberichte

| Block | Report-Pfad |
|-------|-------------|
| A | `.claude/reports/current/T16-V2-block-a-stale-state.md` |
| B | `.claude/reports/current/T16-V2-block-b-alert-pipeline.md` |
| C | `.claude/reports/current/T16-V2-block-c-resilience.md` |
| D | `.claude/reports/current/T16-V2-block-d-alert-config.md` |
| SS-03 | `.claude/reports/current/T16-V2-v-ss-03-frontend-actuator.md` |
| SS-04/AL-03/AL-04 | `.claude/reports/current/T16-V2-v-ss04-al03-al04.md` |
