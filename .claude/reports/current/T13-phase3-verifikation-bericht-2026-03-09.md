# T13-Phase3 Verifikationsbericht

> **Datum:** 2026-03-09
> **Typ:** Verifikation + Fix
> **Bezug:** Phase-3-Implementierungsbericht + T13-Verification-Report
> **Ergebnis:** 27/27 PASS (1 Fix noetig, sofort behoben)

---

## Baseline ruff check

```
ruff check src/services/subzone_service.py src/services/device_scope_service.py \
  src/mqtt/handlers/heartbeat_handler.py src/mqtt/handlers/sensor_handler.py \
  src/main.py src/api/v1/zone.py src/utils/zone_subzone_resolver.py
```

**Ergebnis:** All checks passed.

---

## Phase 3.3: GPIO-0 Filter

| Kriterium | Status | Nachweis |
|-----------|--------|----------|
| V3.3-1: GPIO-0-Filter VOR MQTT-Publish | **PASS** | `subzone_service.py:181` — `mqtt_gpios = [g for g in assigned_gpios if g != 0]`, MQTT payload nutzt `mqtt_gpios` (Zeile 191), Publish via `_publish_subzone_message()` (Zeile 199) |
| V3.3-2: Alle 5 Einstiegspunkte zentralisiert | **PASS** | Pfade A-D gehen durch `SubzoneService.assign_subzone()`. Pfad E (`zone_service._send_transferred_subzones()`) hat eigenen GPIO-0-Filter (Zeile 624-626). |
| V3.3-3: DB-Wert behaelt GPIO 0 | **PASS** | `_upsert_subzone_config()` (Zeile 203) bekommt `assigned_gpios` (ungefiltert), nicht `mqtt_gpios` |
| V3.3-4: Log-Hinweis bei Filter | **PASS** | `subzone_service.py:183-186` — `logger.debug("Filtered GPIO 0 (I2C placeholder)...")` |

### Detail zu Pfad E (Zone Transfer)

`zone_service._send_transferred_subzones()` (Zeile 599-648) geht NICHT durch `SubzoneService.assign_subzone()`. Stattdessen baut es MQTT-Payloads direkt und sendet via `command_bridge.send_and_wait_ack()`. Es hat seinen eigenen GPIO-0-Filter bei Zeile 624-626:

```python
sz_payload["assigned_gpios"] = [g for g in sz_payload["assigned_gpios"] if g != 0]
```

Das ergibt einen **doppelten** Filter-Ort (SubzoneService + zone_service), ist aber korrekt — beide Pfade filtern GPIO 0 zuverlaessig.

---

## Phase 3.2: sensor_handler / Cache

### Widerspruch geklaert: **Fall B (Implementierer hat Recht)**

**Code-Nachweis:**
- `sensor_handler.py:45` — `from ...services.device_scope_service import DeviceScopeService`
- `sensor_handler.py:343` — `scope_service = DeviceScopeService(session)`
- `sensor_handler.py:349` — `scope_service=scope_service` an Resolver uebergeben

Der T13-Verification-Report (Architektur-Hinweis H1) war korrekt zum Zeitpunkt seiner Erstellung. Die Umstellung von `DeviceActiveContextRepository` auf `DeviceScopeService` wurde im Rahmen der T13-R2-Implementierung (Phase 2) bereits durchgefuehrt.

| Kriterium | Status | Nachweis |
|-----------|--------|----------|
| V3.2-1: sensor_handler nutzt DeviceScopeService | **PASS** | `sensor_handler.py:45,343` — Import + Instanziierung |
| V3.2-2: 30s-TTL-Cache | **PASS** | `device_scope_service.py:30` — `CONTEXT_CACHE_TTL_SECONDS = 30`, Cache-Hit bei Zeile 91 |
| V3.2-3: Cache speichert Plain-Data (NamedTuple) | **PASS** | `device_scope_service.py:33-38` — `ActiveContextData(NamedTuple)`, ORM-Objekt wird bei Zeile 96-100 in NamedTuple konvertiert |
| V3.2-4: Resolver funktioniert mit Service | **PASS** | `zone_subzone_resolver.py:47` — Parameter `scope_service: Optional["DeviceScopeService"]`, Zugriff auf `.active_zone_id`/`.active_subzone_id` (Zeilen 152-153, 185-186) matcht NamedTuple-Felder |
| V3.2-5: zone_local nicht betroffen | **PASS** | `zone_subzone_resolver.py:67-72` — `scope = "zone_local"` default, geht zu `_resolve_zone_local()` das `scope_service` nicht verwendet |

---

## Phase 3.1: Full-State-Push

| Kriterium | Status | Nachweis |
|-----------|--------|----------|
| V3.1-1: `set_command_bridge()` existiert | **PASS** | `heartbeat_handler.py:51` — `_command_bridge = None`, Zeile 54-57 — `set_command_bridge(bridge)` |
| V3.1-2: Reconnect VOR `update_status()` | **PASS** | Zeilen 162-167 — `is_reconnect` berechnet. Zeile 230 — `update_status()`. Korrekte Reihenfolge. |
| V3.1-3: Eigene Session | **PASS** | Zeile 1321 — `async with resilient_session() as session:` |
| V3.1-4: Zone via `send_and_wait_ack()` | **PASS** | Zeilen 1358-1364 — `_command_bridge.send_and_wait_ack(..., command_type="zone", timeout=10.0)` |
| V3.1-5: Subzones sequenziell, `parent_zone_id=""` | **PASS** | Zeile 1379 — `for sz in active_subzones:`, Zeile 1384 — `"parent_zone_id": ""` |
| V3.1-6: GPIO 0 gefiltert | **PASS** | Zeilen 1385-1387 — `[g for g in (sz.assigned_gpios or []) if g != 0]` |
| V3.1-7: Mock-ESP-Check | **PASS** | Zeilen 1328-1334 — Check auf `ESP_MOCK_`, `MOCK_`, `"MOCK" in device_id` |
| V3.1-8: Cooldown 120s | **PASS** | Zeile 48 — `STATE_PUSH_COOLDOWN_SECONDS = 120`, Zeilen 1338-1346 — Check via `metadata["full_state_push_sent_at"]` |
| V3.1-9: `asyncio.create_task()` | **PASS** | Zeile 262 — `asyncio.create_task(self._handle_reconnect_state_push(esp_device.device_id))` |
| V3.1-10: Zone-Mismatch-Skip bei Reconnect | **PASS** | `_update_esp_metadata()` Zeile 670 — `is_reconnect` Parameter, Zeile 713 — `if is_reconnect and db_has_zone:` → Skip mit Log "tolerated" |
| V3.1-11: main.py Bridge-Setup | **PASS** | `main.py:284` — `from .mqtt.handlers.heartbeat_handler import set_command_bridge as set_heartbeat_bridge`, Zeile 290 — `set_heartbeat_bridge(_mqtt_command_bridge)` |
| V3.1-12: `SubzoneRepository.get_by_esp_id()` | **PASS (nach Fix)** | Methode heisst `get_by_esp()` (subzone_repo.py:57). Heartbeat_handler rief `get_by_esp_id()` auf → **AttributeError zur Laufzeit**. Fix: Zeile 1375 geaendert zu `get_by_esp()`. |
| V3.1-13: Max 8 Subzones | **PASS** | Zeile 1376 — `[:8]` Slice |
| V3.1-14: Exception-Handling | **PASS** | Zeilen 1316/1421-1424 — `try/except` um gesamte Methode, Exception geloggt via `logger.error(..., exc_info=True)` |

### Fix V3.1-12: Falscher Methodenname

**Problem:** `heartbeat_handler.py:1375` rief `subzone_repo.get_by_esp_id(device_id)` auf, aber `SubzoneRepository` hat nur `get_by_esp(esp_id)`. Dies haette bei jedem echten Reconnect einen `AttributeError` verursacht und den Full-State-Push komplett verhindert.

**Fix:** `get_by_esp_id(device_id)` → `get_by_esp(device_id)` in Zeile 1375.

**Kritikalitaet:** HOCH — ohne Fix wuerde kein einziger Full-State-Push funktionieren (Subzone-Teil wuerde immer crashen, Zone-Assign allein wuerde durchgehen).

---

## Phase 3.4: Architektur-Hinweise H2/H3

### Widerspruch geklaert: **Implementierer hat Recht — H2 und H3 waren bereits erledigt**

| Kriterium | Status | Nachweis |
|-----------|--------|----------|
| V3.4-1: GET /zone/zones nutzt Repository | **PASS** | `zone.py:189-190` — `zone_repo = ZoneRepository(db)`, `zone_rows = await zone_repo.list_with_device_counts(...)`. Keine direkten SQLAlchemy-Queries im Endpoint. |
| V3.4-2: GET /zone/devices/{esp_id} hat Auth | **PASS** | `zone.py:224` — `_user: ActiveUser` |
| V3.4-3: GET /zone/{zone_id}/devices hat Auth | **PASS** | `zone.py:254` — `_user: ActiveUser` |

Der T13-Verification-Report listete H2/H3 als offene Hinweise. Zum Zeitpunkt der Phase-3-Implementierung waren sie jedoch bereits im Rahmen von T13-R1 erledigt.

---

## Abschluss ruff check

```
ruff check (7 Dateien) → All checks passed!
```

---

## Geaenderte Dateien

| Datei | Aenderung | Grund |
|-------|-----------|-------|
| `src/mqtt/handlers/heartbeat_handler.py` (Zeile 1375) | `get_by_esp_id()` → `get_by_esp()` | Falscher Methodenname verursacht AttributeError bei Reconnect |

---

## Zusammenfassung

| Phase | Kriterien | Ergebnis | Fixes |
|-------|-----------|----------|-------|
| 3.3 GPIO-0 Filter | V3.3-1 bis V3.3-4 | **4/4 PASS** | — |
| 3.2 Cache/Service | V3.2-1 bis V3.2-5 | **5/5 PASS** | — (bereits korrekt) |
| 3.1 Full-State-Push | V3.1-1 bis V3.1-14 | **14/14 PASS** | 1 Fix: Methodenname |
| 3.4 Architektur H2/H3 | V3.4-1 bis V3.4-3 | **3/3 PASS** | — (bereits erledigt) |
| ruff | Baseline + Abschluss | **Clean** | — |

**Gesamt: 27/27 PASS** (1 kritischer Fix angewendet, ruff clean)

### Widersprueche im T13-Verification-Report geklaert

1. **H1 (sensor_handler nutzt Repo direkt):** War korrekt zum Zeitpunkt der Erstellung. T13-R2-Implementierung (Phase 2) hat den sensor_handler bereits auf DeviceScopeService umgestellt.
2. **H2 (DB-Query im Router):** War bereits im Rahmen von T13-R1 gefixt.
3. **H3 (Auth fehlt):** War bereits im Rahmen von T13-R1 gefixt.

---

*Bericht erstellt: 2026-03-09 | Agent: server-development*
