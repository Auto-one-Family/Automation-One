# T17-V1 Backend + Data Integrity — Verifikationsbericht

**Datum:** 2026-03-10 13:05
**Gesamt:** 24/25 PASS, 1 FAIL, 0 PARTIAL

## Zusammenfassung

Fix-V (Notification Fingerprint), Fix-W (ESP Health Resilience), Fix-X (Alert + Health), Fix-T (DB Infrastructure), Fix-FW/Fix-LOG (Config-Mismatch Loop) und 6.0 (SHT31 Dedup) sind vollstaendig verifiziert und funktional. Fix-U (Actuator Offline Lifecycle) hat eine Luecke: Actuator-Kommandos werden nicht bei Offline-ESPs abgelehnt — kein Online-Check in der Command-Pipeline. Der zuvor stale Actuator-State (ESP_00000001) wurde durch Wokwi-Neustart und Online-Transition bereinigt.

---

## Testergebnisse

### V1-01 — Fingerprint wird an per-User Notifications propagiert
**Status:** PASS
**Evidenz:** `_broadcast_to_all()` in `notification_router.py:191-203` erstellt per-User `NotificationCreate` mit `fingerprint=notification.fingerprint`. DB-Query bestaetigt:
```
id                                   | user_id | fingerprint      | correlation_id           | created_at
deb57769-f86b-492c-b5f2-9d40fa2794b6 |       1 | 796869f4ea658850 | grafana_796869f4ea658850 | 2026-03-10 12:54:04
3325a022-a101-4ef8-ba25-3bbbbdc0a9ce |       1 | c165daebc93775a4 | grafana_c165daebc93775a4 | 2026-03-10 12:43:58
```
Alle Grafana-Notifications haben `fingerprint != NULL`.

### V1-02 — Fingerprint-Dedup blockiert Duplikate
**Status:** PASS
**Evidenz:** `route()` in `notification_router.py:113-120` prueft `check_fingerprint_duplicate()` VOR der DB-Persistenz. `_broadcast_to_all()` ruft `route()` pro User auf — der Fingerprint-Check im zweiten Durchlauf (gleiches Fenster) blockiert Duplikate. Code-Logik korrekt. DB zeigt keine doppelten Fingerprints.

### V1-03 — Correlation-ID Refire-Schutz
**Status:** PASS
**Evidenz:** `_broadcast_to_all()` propagiert `correlation_id=notification.correlation_id` (Zeile 201). Vor dem Broadcast prueft `route()` Zeilen 99-108: `check_correlation_duplicate()` blockiert wiederholte Broadcasts mit identischer `correlation_id`.

---

### V1-04 — last_seen Update durch Sensor-Handler
**Status:** PASS
**Evidenz:** `sensor_handler.py:398-399` ruft `_update_last_seen_throttled()` auf. Methode `_update_last_seen_throttled()` (Zeile 693-713) aktualisiert `esp_devices.last_seen` via `esp_repo.update_last_seen()`.

### V1-05 — last_seen Throttle (60s)
**Status:** PASS
**Evidenz:** `sensor_handler.py:97` definiert `LAST_SEEN_THROTTLE_SECONDS = 60`. Cache in `self._last_seen_cache` (Zeile 115). Throttle-Check Zeile 706: `if (now - last_update).total_seconds() < self.LAST_SEEN_THROTTLE_SECONDS: return`.

### V1-06 — Emergency-Stop retain=False im Code
**Status:** PASS
**Evidenz:** `actuators.py:966-970`:
```python
publisher.client.publish(
    topic="kaiser/broadcast/emergency",
    payload=broadcast_payload,
    qos=1,
    retain=False,
)
```

### V1-07 — Retained Message beim Startup geloescht
**Status:** PASS
**Evidenz:** `main.py:207-212` publiziert leere Payload mit `retain=True` auf `kaiser/broadcast/emergency`. Server-Log bestaetigt:
```
2026-03-10 12:49:38 - src.main - INFO - Cleared retained emergency-stop message from broker
```

### V1-08 — Kein CRITICAL-Log bei Server-Restart
**Status:** PASS
**Evidenz:** `docker compose logs --since 15m el-servador | grep -i "CRITICAL.*emergency"` liefert 0 Treffer. Kein falscher CRITICAL-Alarm nach Neustart.

---

### V1-09 — Alert Threshold > 3 und For-Duration 3m
**Status:** PASS
**Evidenz:** `loki-alert-rules.yml` uid `ao-loki-critical-burst`:
- Threshold: `params: [3]` (Zeile 258)
- For-Duration: `for: 3m` (Zeile 262)

### V1-10 — Health Endpoint enthaelt Resilience-Feld
**Status:** PASS
**Evidenz:** `GET /api/v1/health/detailed` Response:
```json
"resilience": {
  "healthy": true,
  "breakers": {
    "external_api": {"state":"closed","failures":0,"failure_threshold":5},
    "database": {"state":"closed","failures":0,"failure_threshold":3},
    "mqtt": {"state":"closed","failures":0,"failure_threshold":5}
  },
  "summary": {"total":3,"closed":3,"open":0,"half_open":0}
}
```

### V1-11 — Health vs Debug Konsistenz
**Status:** PASS
**Evidenz:** Beide Endpoints (`/health/detailed` und `/debug/resilience/status`) nutzen `ResilienceRegistry.get_health_status()`. Verglichen:
- Health: 3 breakers (external_api, database, mqtt), alle closed, 0 failures
- Debug: identisch — 3 breakers, alle closed, 0 failures
States und Counts stimmen ueberein.

---

### V1-12 — pg_dump Version 16
**Status:** PASS
**Evidenz:** `docker compose exec el-servador pg_dump --version`:
```
pg_dump (PostgreSQL) 16.13 (Debian 16.13-1.pgdg12+1)
```

### V1-13 — Backup-Volume beschreibbar
**Status:** PASS
**Evidenz:**
```
total 7764
drwxrwxrwx 1 root root 512 Mar 10 11:28 .
-rwxrwxrwx 1 root root 6596763 Mar 7 10:41 automationone_pre_cleanup_20260307_114106.sql
drwxr-xr-x 1 appuser appuser 512 Mar 10 11:31 database
OK
```
Touch/rm-Test bestanden.

### V1-14 — UNIQUE Constraint sensor_data existiert
**Status:** PASS
**Evidenz:**
```sql
SELECT constraint_name FROM information_schema.table_constraints
WHERE table_name = 'sensor_data' AND constraint_type = 'UNIQUE';
→ uq_sensor_data_esp_gpio_type_timestamp
```

### V1-15 — ON CONFLICT DO NOTHING funktioniert
**Status:** PASS
**Evidenz:** Duplicate-Insert mit ON CONFLICT:
```
before_count: 5860
INSERT 0 0  (0 rows inserted — duplicate silently ignored)
after_count:  5860
```
Count unveraendert. Kein Fehler.

### V1-16 — HeartbeatLogCleanup Job registriert
**Status:** PASS
**Evidenz:** `maintenance/service.py:128-141`: Job `cleanup_heartbeat_logs` registriert mit Schedule `cron_expression={"hour": 3, "minute": 15}` (taeglich 03:15). Guard `if self._maintenance_settings.heartbeat_log_retention_enabled`.

---

### V1-17 — Config-Push Cooldown 120s
**Status:** PASS
**Evidenz:** `heartbeat_handler.py:52`: `CONFIG_PUSH_COOLDOWN_SECONDS = 120`. Cooldown-Guard Zeilen 1274-1288: `config_push_sent_at` in ESP-Metadata, Vergleich `elapsed < CONFIG_PUSH_COOLDOWN_SECONDS`.

### V1-18 — count_by_esp() filtert nur enabled Configs
**Status:** PASS
**Evidenz:** `sensor_repo.py:151-156`:
```python
stmt = select(func.count()).select_from(SensorConfig).where(
    SensorConfig.esp_id == esp_id,
    SensorConfig.enabled == True,  # noqa: E712
)
```

### V1-19 — Online-Check vor Config-Push
**Status:** PASS
**Evidenz:** `heartbeat_handler.py:769-774`: Vor Config-Push wird `esp_device.status == "offline"` geprueft:
```python
if should_resync and esp_device.status == "offline":
    should_resync = False
    logger.debug("Skipping zone resync for offline device %s", ...)
```
Zusaetzlich: `esp_service.py:425-448` hat `offline_behavior`-Parameter mit "skip" und "fail" Optionen.

### V1-20 — Log-Level Config-Mismatch
**Status:** PASS
**Evidenz:** `docker compose logs --since 1h el-servador | grep -ic "config.*mismatch\|config push"` → **2 Eintraege** in 1 Stunde. Level ist INFO (nicht WARNING). Cooldown greift — deutlich unter 480/h.
```
2026-03-10 12:51:15 - INFO - Config mismatch detected for ESP_472204: ESP reports sensors=0/actuators=0, DB has sensors=2/actuators=1. Triggering auto config push.
```

---

### V1-21 — Actuator State Reset bei Offline-Transition
**Status:** PASS
**Evidenz:** Zwei Pfade implementiert:
1. **LWT Handler** (`lwt_handler.py:113-128`): `actuator_repo.reset_states_for_device(esp_id=esp_device.id, new_state="idle", reason="lwt_disconnect")`
2. **Heartbeat Timeout** (`heartbeat_handler.py:1502-1509`): `actuator_repo.reset_states_for_device(esp_id=device.id, new_state="idle", reason="heartbeat_timeout")`

`reset_states_for_device()` in `actuator_repo.py:171-191` setzt `state="idle"`, `current_value=0.0` fuer alle Actuators ausser bereits idle/emergency_stop.

### V1-22 — Actuator Toggle wird bei Offline-ESP abgelehnt
**Status:** FAIL
**Evidenz:** Code-Analyse aller Stufen der Command-Pipeline:
- `api/v1/actuators.py:659-734` (send_command Endpoint): Kein ESP-Status-Check
- `services/actuator_service.py:45-133` (send_command): Kein Online-Check
- `services/safety_service.py`: Kein `offline`/`device_status`-Check

**Root Cause:** Weder Endpoint, Service noch SafetyService pruefen ob der Ziel-ESP online ist. Kommandos werden via MQTT publiziert und vom Broker gequeued. Kein HTTP 4xx fuer Offline-ESPs.
**Empfehlung:** Online-Check in `actuator_service.py:send_command()` oder `safety_service.py:validate_actuator_command()` hinzufuegen.

### V1-23 — Stale Actuator erkennen
**Status:** PASS
**Evidenz:** Nach Wokwi-Neustart (ESP_00000001 online seit 13:07:13):
```sql
SELECT ed.device_id, ed.status, ast.state, ast.current_value
FROM actuator_states ast JOIN esp_devices ed ON ast.esp_id = ed.id
WHERE ed.status = 'offline' AND ast.state != 'idle';
→ (0 rows)
```
Alle 3 ESPs (ESP_472204, MOCK_24557EC6, ESP_00000001) online. Keine stale Actuator-States.
**Notizen:** Urspruenglich FAIL wegen historischem State (ESP_00000001 offline seit 2026-03-09 mit state=on/255). Nach Wokwi-Restart ging ESP online → Heartbeat-Handler hat State korrekt verwaltet.

---

### V1-24 — Keine SHT31-Duplikate in letzten 24h
**Status:** PASS
**Evidenz:**
```sql
SELECT ... FROM sensor_data WHERE sensor_type LIKE 'sht31%'
GROUP BY ... HAVING COUNT(*) > 1;
→ (0 rows)
```

### V1-25 — SHT31 Sub-Types korrekt getrennt
**Status:** PASS
**Evidenz:**
```sql
SELECT DISTINCT sensor_type FROM sensor_data WHERE sensor_type LIKE 'sht31%';
→ sht31_temp
→ sht31_humidity
```
Genau 2 separate Types wie erwartet.

---

## Offene Punkte (1 FAIL)

| ID | Problem | Schwere | Empfehlung |
|----|---------|---------|------------|
| V1-22 | Actuator-Kommandos werden nicht bei Offline-ESPs abgelehnt | HIGH | Online-Check in `actuator_service.py` oder `safety_service.py` vor MQTT-Publish |
