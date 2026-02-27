# Auftrag: Trockentest-Bug-Fixes — 3 Bugs + Auftragskorrekturen

**Ziel-Repo:** auto-one
**Kontext:** Mock-Trockentest (F4 Dry Run) vom 2026-02-25 hat 3 Bugs und 8 Diskrepanzen zwischen Auftrag und Realitaet aufgedeckt. Dieser Auftrag fixt die Bugs und korrigiert alle F4-Auftraege.
**Bezug:** `arbeitsbereiche/automation-one/auftrag-mock-trockentest.md` (Original-Auftrag), Mock-Trockentest-Report (2026-02-25)
**Prioritaet:** Bug #1 CRITICAL (Blocker fuer Hardware-Test), Bug #2 MEDIUM, Bug #3 LOW
**Datum:** 2026-02-25
**Branch:** `fix/trockentest-bugs`

---

## Ziel

Am Ende kann Robin sagen: "Alle 3 Trockentest-Bugs sind gefixt. MQTT Device Discovery funktioniert. Sensor-Data API gibt Daten zurueck. Alle F4-Auftraege benutzen die korrekten MQTT-Topics, Payloads und API-Endpunkte."

**Zustaendiger Agent:** server-dev (Bug #1 + #2), auto-ops (Verifikation), system-control (Auftragskorrekturen)
**Voraussetzung:** Docker-Stack laeuft
**Aufwand:** ~2-3 Stunden

---

## Uebersicht der Bloecke (aktualisiert 2026-02-27 durch verify-plan)

| Block | Beschreibung | Severity | Status | Abhaengigkeit |
|-------|-------------|----------|--------|---------------|
| A | `audit_logs.request_id` VARCHAR(36) → VARCHAR(255) | **CRITICAL** | ✅ **BEREITS GEFIXT** | Keiner |
| B | Sensor-Data API 500 debuggen + fixen | **MEDIUM** | ⚠️ OFFEN (pruefen ob Bug noch besteht) | Keiner |
| C | Sensor-Range-Validierung (Quality-Flag) | **LOW** | ✅ **BEREITS GEFIXT** | Keiner |
| D | F4-Auftraege auf korrekte Werte aktualisieren | **HOCH** | OFFEN | B |
| E | Verifikation — Dry-Run wiederholen | **PFLICHT** | OFFEN (Befehle korrigiert) | B, D |

---

## Block A: audit_logs.request_id VARCHAR(36) → VARCHAR(255) (CRITICAL)

### ✅ STATUS: BEREITS IMPLEMENTIERT (verify-plan 2026-02-27)

**Verifiziert gegen Codebase:**
- Model: `El Servador/god_kaiser_server/src/db/models/audit_log.py:164` → `String(255)` bereits gesetzt
- Migration: `El Servador/god_kaiser_server/alembic/versions/increase_audit_logs_request_id_varchar_255.py` existiert
- Model nutzt moderne `mapped_column(String(255))` Syntax (nicht `Column`)
- Prometheus-Metrik und Audit-Logging im heartbeat_handler.py arbeiten korrekt

**Korrekturen am Original-Plan (fuer Referenz):**
- Plan sagte `src/models/` → **Korrekt:** `src/db/models/audit_log.py`
- Plan sagte `Column(String(36))` → **Korrekt:** `mapped_column(String(255))` (bereits gefixt)

**→ Keine Aktion noetig. Block A ueberspringen.**

---

## Block B: Sensor-Data API 500 Internal Error debuggen + fixen (MEDIUM)

### Problem

`GET /api/v1/sensors/data?esp_id=MOCK_DRYTST01` gab 500 Internal Error zurueck. DB-Speicherung funktioniert (21 Eintraege gespeichert), aber die API-Abfrage schlug fehl.

**Impact:** Sensordaten koennen nicht ueber die REST-API abgefragt werden. Frontend kann keine historischen Daten anzeigen.

### verify-plan Analyse (2026-02-27)

**Code-Review des Endpoints (`src/api/v1/sensors.py:789-874`):**
- Endpoint: `GET /api/v1/sensors/data` mit Dependency `current_user: ActiveUser` (AUTH PFLICHT!)
- Query via `sensor_repo.query_data()` (`src/db/repositories/sensor_repo.py:427`) — sauberer Select, kein Lazy-Loading
- Response: `SensorDataResponse` (Objekt mit `.readings[]` Liste), KEIN flaches Array
- Fehlende ESP-ID gibt 404 (nicht 500) → der 500er muss eine andere Ursache haben

**⚠️ WICHTIG: Alle curl-Befehle MUESSEN Auth-Token enthalten!**
Der Original-Plan hatte `curl` ohne Auth → ergibt 401/403, NICHT die erwartete 200-Response.

### Debugging-Strategie (ZUERST — vor dem Fix)

**Schritt 1: Auth-Token holen**

```bash
# Login und Token extrahieren
TOKEN=$(curl -sf -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | jq -r '.tokens.access_token')
echo "Token: $TOKEN"
```

**Schritt 2: Server-Logs lesen**

```bash
# Traceback im Server-Log finden
docker logs automationone-server 2>&1 | grep -A 20 "sensors/data" | grep -A 15 "ERROR\|Traceback\|Exception"

# Alternativ via Loki
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service="el-servador"} |= "sensors/data" |= "ERROR"' \
  --data-urlencode "start=$(date -d '5 min ago' +%s)000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=5' | jq '.data.result[].values[][1]'
```

**Schritt 3: Endpoint-Code analysieren**

Dateien (verifiziert):
- Route: `El Servador/god_kaiser_server/src/api/v1/sensors.py:789`
- Repository: `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py:427`
- Schema: `El Servador/god_kaiser_server/src/schemas/sensor.py:496` (SensorDataResponse)

Pruefen:
- Welche SQLAlchemy-Query wird ausgefuehrt? → Einfacher `select(SensorData)` ohne JOINs
- Welches Response-Model? → `SensorDataResponse(BaseResponse)` mit `readings: List[SensorReading]`
- Ist `esp_id` korrekt annotiert? → Ja: `Optional[str], Query()`

**Schritt 4: Isolierter Test (MIT Auth)**

```bash
# Minimaler Request (mit Token!)
curl -v -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_DRYTST01"

# Ohne Parameter (alle Daten)
curl -v -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data"

# Mit limit Filter
curl -v -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?limit=5"
```

### Wahrscheinlichste Ursachen (nach Code-Review)

| Rang | Ursache | Erkennbar an | Fix |
|------|---------|-------------|-----|
| 1 | **Fehlender Auth-Token** | `401 Unauthorized` | Token via Login-Endpoint holen (s.o.) |
| 2 | **Pydantic Response-Serialisierung** | `ResponseValidationError` im Log | SensorReading-Felder auf Optional pruefen |
| 3 | **DB-Schema Mismatch** | `ProgrammingError` im Log | Migration ausfuehren (`alembic upgrade head`) |
| 4 | **SQLAlchemy Lazy-Loading** | `MissingGreenlet` im Traceback | `selectinload()` in Query (unwahrscheinlich — kein JOIN im Code) |
| 5 | **None-Zugriff** | `AttributeError: 'NoneType'` | Null-Check in Response-Conversion |

### Fix-Anweisung

**ZUERST debuggen (Schritt 1-4), DANN fixen.** Den Fix hier nicht vorab definieren — er haengt vom Traceback ab.

### Verifikation Block B

```bash
# Auth-Token holen
TOKEN=$(curl -sf -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | jq -r '.tokens.access_token')

# B1: Mock-Daten senden — ZUERST Heartbeat fuer Device-Registration
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_APITEST/system/heartbeat" \
  -m '{"ts":'$(date +%s)',"uptime":1000,"heap_free":200000,"wifi_rssi":-45}'
sleep 5

# B1b: Sensor-Daten senden
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/MOCK_APITEST/sensor/21/data" \
  -m '{"ts":'$(date +%s)',"esp_id":"MOCK_APITEST","gpio":21,"sensor_type":"sht31","raw":2250,"raw_mode":false,"value":22.5,"unit":"C","quality":"good"}'
sleep 5

# B2: API-Abfrage (MIT Auth, Response ist Objekt mit .readings[])
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_APITEST" | jq '.readings | length'
# Erwartung: >= 1 (NICHT 500)

# B3: Detaillierte Response pruefen
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=MOCK_APITEST" | jq '.readings[0]'
# Erwartung: JSON mit timestamp, raw_value, processed_value, unit, quality
```

- [ ] Server-Traceback identifiziert und dokumentiert (falls 500 reproduzierbar)
- [ ] Root Cause identifiziert (Auth-Fehler? Serialisierung? DB-Schema?)
- [ ] Fix implementiert (falls Bug noch vorhanden)
- [ ] `GET /api/v1/sensors/data?esp_id=...` gibt 200 + Daten zurueck (mit Auth-Token!)
- [ ] Tests bestehen (`pytest` relevante Test-Datei)

---

## Block C: Sensor-Range-Validierung mit Quality-Flag (LOW)

### ✅ STATUS: BEREITS IMPLEMENTIERT (verify-plan 2026-02-27)

**Verifiziert gegen Codebase — ALLE 3 Teilfixes existieren bereits:**

**C1: SENSOR_PHYSICAL_LIMITS** → `src/mqtt/handlers/sensor_handler.py:69-88`
- Dict mit 16 Sensor-Typen, identische Werte wie im Plan vorgeschlagen
- Zusaetzlich `sht31` (ohne `_temp` Suffix) fuer MQTT-Payload-Kompatibilitaet

**C2: _check_physical_range()** → `src/mqtt/handlers/sensor_handler.py:442`
- Methode gibt `"implausible"` zurueck wenn Wert ausserhalb Limits
- Aufgerufen in Step 8b (Zeile 286-303) NACH Processing, VOR DB-Insert
- Quality wird auf `"critical"` gesetzt (nicht verworfen!)
- WARNING-Log mit esp_id, gpio, sensor_type, value, limits

**C3: Prometheus-Metrik** → `src/core/metrics.py:233-236`
- Counter: `god_kaiser_sensor_implausible_total` (Labels: sensor_type, esp_id)
- Helper: `increment_sensor_implausible()` (metrics.py:393)
- Aufgerufen in sensor_handler.py:303

**Korrekturen am Original-Plan (fuer Referenz):**
- Plan sagte `src/services/sensor_processing/` → **Korrekt:** `src/mqtt/handlers/sensor_handler.py` (Validierung) + `src/sensors/sensor_libraries/active/` (Processing)
- Plan schlug separate Funktion vor → **Realitaet:** Bereits als Klassenmethode `_check_physical_range()` implementiert
- Plan schlug Quality `"implausible"` vor → **Realitaet:** Quality wird auf `"critical"` gesetzt (ist in QUALITY_LEVELS enthalten)
- Architektur-Entscheidung korrekt: Werte werden gespeichert, nicht verworfen ✅

**→ Keine Aktion noetig. Block C ueberspringen.**

---

## Block D: F4-Auftraege auf korrekte Werte aktualisieren (HOCH)

### Problem

Der Trockentest hat 8 Diskrepanzen zwischen den F4-Auftraegen und der Realitaet aufgedeckt. Alle betroffenen Dateien muessen aktualisiert werden damit zukuenftige Agents die korrekten Werte verwenden.

### Korrekturtabelle

| Aspekt | FALSCH (in Auftraegen) | KORREKT (aus Trockentest) | Betroffene Dateien |
|--------|----------------------|--------------------------|-------------------|
| **MQTT Topic Heartbeat** | `esp32/{esp_id}/heartbeat` | `kaiser/{zone}/esp/{esp_id}/system/heartbeat` | auftrag-mock-trockentest.md, auftrag-f4-implementierung.md Block 2.2 |
| **MQTT Topic Sensor** | `esp32/{esp_id}/sensors/data` | `kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data` | auftrag-mock-trockentest.md, auftrag-f4-implementierung.md Block 2.2 |
| **Heartbeat Payload** | `device_id, firmware_version, uptime_ms, free_heap, wifi_rssi` | `ts, uptime, heap_free, wifi_rssi` | auftrag-f4-implementierung.md |
| **Sensor Payload** | `sensor_type, values (dict), unit, esp_id, sensor_id, gpio_pin` | `ts, esp_id, gpio, sensor_type, raw, raw_mode, value, unit, quality` | auftrag-mock-trockentest.md |
| **Prometheus Metrics** | `automationone_*` | `god_kaiser_*` | auftrag-f4-implementierung.md, auftrag-f4-optimierung-final.md |
| **Device-ID Pattern** | `MOCK_ESP_001` (Unterstriche) | `MOCK_DRYTST01` (keine Unterstriche nach Prefix) | Regex: `^(ESP_[A-F0-9]{6,8}\|MOCK_[A-Z0-9]+)$` |
| **Auth Token** | `access_token` (top-level) | `tokens.access_token` (nested in Login-Response) | auftrag-f4-implementierung.md |
| **Login Password** | `admin` / `password` | `Admin123#` (min 8 Zeichen, Complexity) | auftrag-f4-implementierung.md |

### Fix-Anweisung

**Betroffene Dateien im Life-Repo (hier, NICHT im auto-one Repo):**

1. `arbeitsbereiche/automation-one/auftrag-mock-trockentest.md` — MQTT Topics + Payloads korrigieren
2. `arbeitsbereiche/automation-one/auftrag-f4-implementierung.md` — Block 2 (auto-ops) Playbook 7, alle mosquitto_sub/pub Befehle
3. `arbeitsbereiche/automation-one/auftrag-f4-optimierung-final.md` — Prometheus Metric-Prefix, Auth-Flow

**Betroffene Dateien im auto-one Repo:**

4. `.claude/CLAUDE.md` oder `.claude/CLAUDE_AUTOOPS.md` — Falls dort MQTT Topics oder Metrics referenziert werden
5. `.claude/local-marketplace/auto-ops/agents/auto-ops.md` — Rolle 5: mosquitto_sub Topics in Delegation-Prompts
6. `.claude/skills/hardware-test/SKILL.md` — Wenn bereits erstellt: MQTT Topics + Auth korrigieren
7. Alle Debug-Agent-Prompts die MQTT Topics oder Metric-Prefixe referenzieren

### Korrekturen im Detail

**D1: MQTT Topics**

ALLE Vorkommen ersetzen:
```
# Heartbeat:
FALSCH: esp32/{esp_id}/heartbeat
KORREKT: kaiser/{zone}/esp/{esp_id}/system/heartbeat
# Default-Zone im Test: "god"

# Sensor Data:
FALSCH: esp32/{esp_id}/sensors/data
KORREKT: kaiser/{zone}/esp/{esp_id}/sensor/{gpio}/data

# Config Response:
KORREKT: kaiser/{zone}/esp/{esp_id}/config_response
```

**D2: Heartbeat Payload**

```json
// FALSCH:
{"device_id":"...", "firmware_version":"1.0.0", "uptime_ms":1000, "free_heap":200000, "wifi_rssi":-45}

// KORREKT:
{"ts":1740000000, "uptime":1000, "heap_free":200000, "wifi_rssi":-45}
```

**D3: Sensor-Data Payload**

```json
// FALSCH:
{"sensor_type":"sht31", "values":{"temperature":22.3,"humidity":58.7}, "unit":"multi", "esp_id":"...", "sensor_id":"...", "gpio_pin":21}

// KORREKT:
{"ts":1740000000, "esp_id":"MOCK_DRYTST01", "gpio":21, "sensor_type":"sht31", "raw":2230, "raw_mode":false, "value":22.3, "unit":"C", "quality":"good"}
```

**D4: Prometheus Metrics**

```
FALSCH: automationone_sensor_readings_total
KORREKT: god_kaiser_sensor_value

FALSCH: automationone_esp_last_heartbeat_seconds
KORREKT: god_kaiser_esp_last_heartbeat

FALSCH: automationone_mqtt_messages_total
KORREKT: god_kaiser_mqtt_messages_total
```

**D5: Auth-Flow**

```python
# Login:
# FALSCH: password = "password"
# KORREKT: password = "Admin123#"

# Token aus Login-Response:
# FALSCH: token = response["access_token"]
# KORREKT: token = response["tokens"]["access_token"]
```

**D6: Device-ID Pattern**

```python
# FALSCH: MOCK_ESP_001 (Unterstrich nach MOCK_)
# KORREKT: MOCK_DRYTST01 (keine Unterstriche nach Prefix)
# Regex: ^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+)$

# Approve-Endpoint:
# KORREKT: POST /api/v1/esp/devices/{esp_id}/approve mit leerem JSON-Body {}
```

### Verifikation Block D

- [ ] Alle MQTT Topics in allen Auftraegen korrigiert (`kaiser/{zone}/esp/...`)
- [ ] Alle Payloads korrigiert (Heartbeat: ts/uptime/heap_free/wifi_rssi)
- [ ] Alle Prometheus-Metriken korrigiert (`god_kaiser_*`)
- [ ] Auth-Flow korrigiert (nested `tokens.access_token`, Password `Admin123#`)
- [ ] Device-ID Pattern dokumentiert
- [ ] Approve-Endpoint korrekt dokumentiert: `POST /api/v1/esp/devices/{esp_id}/approve`

---

## Block E: Verifikation — Dry-Run Kurzversion wiederholen (PFLICHT)

### Vorgehen

Den Trockentest in Kurzform wiederholen um alle 3 Fixes zu verifizieren:

```bash
# E1: Stack-Check (korrekter Health-Endpoint)
curl -sf http://localhost:8000/api/v1/health/live | jq .

# E2: Auth-Token holen (Pflicht fuer API-Zugriff)
TOKEN=$(curl -sf -X POST "http://localhost:8000/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | jq -r '.tokens.access_token')

# E3: Device via MQTT registrieren (Block A bereits gefixt — nur Verifikation)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/VERIFY_FIX/system/heartbeat" \
  -m '{"ts":'$(date +%s)',"uptime":1000,"heap_free":200000,"wifi_rssi":-45}'
sleep 10

# Pruefen ob Device in DB
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT device_id, status FROM esp_devices WHERE device_id='VERIFY_FIX';"

# E4: Sensor-Daten senden
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/VERIFY_FIX/sensor/21/data" \
  -m '{"ts":'$(date +%s)',"esp_id":"VERIFY_FIX","gpio":21,"sensor_type":"sht31","raw":2250,"raw_mode":false,"value":22.5,"unit":"C","quality":"good"}'
sleep 5

# E5: Sensor-Data API (Bug #2 Fix-Verifikation — MIT Auth, Response ist Objekt)
curl -sf -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/v1/sensors/data?esp_id=VERIFY_FIX" | jq '.readings | length'
# Erwartung: >= 1

# E6: Out-of-Range-Wert (Block C bereits gefixt — nur Verifikation)
docker exec automationone-mqtt mosquitto_pub \
  -h localhost -p 1883 \
  -t "kaiser/god/esp/VERIFY_FIX/sensor/21/data" \
  -m '{"ts":'$(date +%s)',"esp_id":"VERIFY_FIX","gpio":21,"sensor_type":"sht31","raw":99990,"raw_mode":false,"value":999.9,"unit":"C","quality":"good"}'
sleep 5

# Pruefen ob Quality-Flag gesetzt
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "SELECT sensor_type, value, quality FROM sensor_data WHERE esp_id='VERIFY_FIX' ORDER BY timestamp DESC LIMIT 3;"
# Erwartung: 999.9 hat quality='critical', 22.5 hat quality='good'

# E7: Prometheus-Metriken (korrekter Metric-Name)
curl -sf "http://localhost:9090/api/v1/query?query=god_kaiser_sensor_implausible_total" | jq '.data.result | length'
# Erwartung: > 0 (nur wenn Out-of-Range gesendet wurde)

# E8: Cleanup — ACHTUNG: DELETE wird ggf. durch Hook blockiert!
# Falls Hook blockiert, manuell ausfuehren oder Cleanup-Script nutzen:
# python scripts/cleanup_for_real_esp.py (loescht MOCK_*/TEST_* Devices)
docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c \
  "DELETE FROM sensor_data WHERE esp_id='VERIFY_FIX'; DELETE FROM esp_devices WHERE device_id='VERIFY_FIX';"
```

### Akzeptanzkriterien (Gesamt — aktualisiert 2026-02-27)

- [x] **Bug #1:** MQTT Heartbeat registriert Device in DB (kein StringDataRightTruncation) — **BEREITS GEFIXT**
- [ ] **Bug #2:** `GET /api/v1/sensors/data?esp_id=...` gibt 200 + Daten zurueck (mit Auth-Token!)
- [x] **Bug #3:** Out-of-Range-Wert wird mit Quality-Flag `"critical"` gespeichert + WARNING geloggt — **BEREITS GEFIXT**
- [ ] **Auftraege:** Alle MQTT Topics, Payloads, Metrics in F4-Auftraegen korrigiert
- [ ] **Tests:** `pytest` + `npm test` bestehen (keine Regression)
- [ ] **Server:** Laeuft stabil nach allen Fixes

---

## Commit-Strategie (aktualisiert 2026-02-27)

Block A und C sind bereits implementiert. Verbleibende Commits:

```
Commit 1: fix(api): resolve sensor-data endpoint 500 error (falls Bug noch besteht)
Commit 2: docs(auftraege): correct MQTT topics, payloads, metrics in F4 task files
```

---

## Referenzen

**Life-Repo (Wissen):**
- `wissen/iot-automation/postgresql-audit-log-request-id-sizing.md` — VARCHAR-Sizing Best Practices (8 Quellen)
- `wissen/iot-automation/fastapi-sensor-data-api-500-debugging.md` — Debugging-Patterns (7 Quellen)
- `wissen/iot-automation/iot-sensor-range-validation-server-side.md` — Range-Validierung Best Practices (9 Quellen)

**Auto-One Repo (Pfade korrigiert 2026-02-27):**
- `El Servador/god_kaiser_server/src/db/models/audit_log.py` — SQLAlchemy AuditLog Model (request_id bereits String(255))
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` — Heartbeat/Discovery Handler
- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` — Sensor Data Handler (inkl. SENSOR_PHYSICAL_LIMITS + _check_physical_range)
- `El Servador/god_kaiser_server/src/api/v1/sensors.py:789` — REST-API Route GET /data (Auth Pflicht!)
- `El Servador/god_kaiser_server/src/schemas/sensor.py:496` — SensorDataResponse Schema
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py:427` — query_data() Repository
- `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/` — Pi-Enhanced Sensor Processing Libraries
- `El Servador/god_kaiser_server/src/core/metrics.py:233` — Prometheus Counter god_kaiser_sensor_implausible_total
- `docker/grafana/provisioning/alerting/alert-rules.yml` — Grafana-Alerts (Metric-Prefix pruefen)

---

*Erstellt am 2026-02-25 durch Claude Opus 4.6 (Automation-Experte, Life-Repo).*
*Basiert auf Mock-Trockentest-Report + 3 Recherche-Zusammenfassungen (24 Quellen) + Forschungs-Validierung.*
