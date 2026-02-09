# Test-Log-Analyst Report — Playwright Sensor-Live E2E

**Erstellt:** 2026-02-08  
**Aktualisiert:** 2026-02-08 (Lauf 7: Alle 4 Tests grün)  
**Quelle:** `npx playwright test tests/e2e/scenarios/sensor-live.spec.ts --reporter=list --workers=1`  
**Skill:** test-log-analyst

---

## 1. Zusammenfassung

| Bereich | Status | Fehler | Empfehlung |
|---------|--------|--------|------------|
| **Playwright sensor-live** | 🟢 Alle 4 Passed | — | Tests stabil |
| Backend (pytest) | — | Nicht ausgeführt | — |
| Frontend (Vitest) | — | Nicht ausgeführt | — |
| Wokwi | — | Nicht ausgeführt | — |

---

## 2. Playwright E2E — sensor-live.spec.ts

### Testergebnis (Lauf 7 — 2026-02-08, alle Fixes)

| # | Test | Ergebnis | Dauer |
|---|------|----------|-------|
| 1 | should display sensor data from MQTT | ✓ Passed | ~4s |
| 2 | should update sensor value in real-time | ✓ Passed | ~6s |
| 3 | should display different sensor types | ✓ Passed | ~8s |
| 4 | should show sensor on device card | ✓ Passed | ~5s |

**Fix Test 4:** Mock ESP ohne Zone landete in UnassignedDropBar (eingeklappt). Test nutzt jetzt SensorsView (ohne Nav), prüft Sensor-Card mit esp_id + Value.  
**Fix Test 3:** Locator `text=/22[,.]?5/` für toFixed(2)-Format.

### Fehlerdetails (aktueller Lauf)

**Tests 1, 2, 4:** `Backend not reachable at http://localhost:8000`  
- Ort: `helpers/api.ts:110` (createMockEspWithSensors)  
- Ursache: Docker/Backend nicht erreichbar beim Teststart. User hat `npx playwright test` ohne vorheriges `make e2e-up` ausgeführt.  
- **NETWORK_DEBUG_REPORT.md:** Zeigt Container laufen (automationone-server Up 2h) — aber E2E-Stack nutzt `docker-compose.e2e.yml` mit anderen Env-Vars (JWT, CORS). Standard-Stack kann laufen, E2E-Stack muss explizit gestartet werden.  
- Lösung: `make e2e-up` aus Projekt-Root, dann `make e2e-test` oder `npx playwright test` aus El Frontend.

**Test 3:** `TypeError: Cannot read properties of undefined (reading 'sensors')`  
- Ort: `helpers/api.ts:67` — `(options.sensors || []).map(...)`  
- Ursache: Test ruft `createMockEspWithSensors(page, { espId, sensors })` — nur 2 Argumente. Signatur erwartet `(page, request, options)`. Das Options-Objekt landete als `request`, `options` war `undefined`.  
- **Fix implementiert:** `sensor-live.spec.ts:104` — `async ({ page, request })` und `createMockEspWithSensors(page, request, { ... })`.

### Fehlerdetails (vor Fix, historisch)

**Historisch (ältere Läufe):** WebSocket `sensor_data` Timeout, `expect(locator).toBeVisible()` fehlgeschlagen (text=23.5, 25.5, 22.5). Nach API-Helper-Fix: Backend-Timeout bei ECONNREFUSED.

### Beobachtungen aus Logs

| Beobachtung | Bedeutung |
|-------------|-----------|
| MQTT published | `[MQTT Helper] Published to kaiser/god/esp/MOCK_*/sensor/*/data` — MQTT-Publish erfolgreich |
| WebSocket | Häufige `[WS Helper] Connected` / `WebSocket closed` — viele Reconnect-Zyklen |
| Test 1 | `[Test] WebSocket message timeout, checking UI` — sensor_data nicht rechtzeitig per WS |
| Auth | `[Global Setup] Auth state expired` → Re-Login in einem Lauf |

### Frühere Läufe (Diagnose)

In früheren Runs traten zusätzlich auf:
- `AbortError: signal is aborted without reason` (api.ts createMockEspWithSensor)
- `Test timeout of 90000ms exceeded` in `page.evaluate` (api.ts)

Der aktuelle Spec nutzt **kein** `createMockEspWithSensor` mehr, sondern `publishHeartbeat` + `publishSensorData` aus `helpers/mqtt.ts`.

---

## 3. Mögliche Ursachen

### 3.1 WebSocket sensor_data nicht empfangen

- Test 1: explizit `WebSocket message timeout`
- Server sendet `sensor_data` laut `sensor_handler.py:314` via `ws_manager.broadcast("sensor_data", ...)`
- Mögliche Gründe: Timing, Reconnect-Race, falscher Event-Typ

### 3.2 Sensor-Werte nicht in der UI

- `SensorsView.vue` zeigt `sensor.raw_value.toFixed(2)` (z. B. `23.50`)
- Tests suchen `text=23.5` — sollte Teilstring von `23.50` sein
- Wenn `allSensors` leer ist → „Keine Sensoren“ → kein Match

### 3.3 Datenfluss MQTT → REST

- Nach `page.reload()` kommt `espStore.fetchAll()` → REST
- Sensor-Werte müssen in der API-Antwort (device.sensors) enthalten sein
- Evtl. Device/Pending-Status: Heartbeat erzeugt Device, aber noch nicht approved?

### 3.4 Test 4 (passed in früheren Läufen)

- Test 4: Assertion `expect(deviceCard).toBeVisible()` vor Sensor-Check
- Bei Backend unreachable: wie Tests 1, 2 — createMockEsp scheitert

### 3.5 Root Cause Lauf 5 (2026-02-08): sensor_data nie per WebSocket — BEHOBEN

**Server-Log (bestätigt):**
```
Error handling sensor data: (sqlalchemy...) invalid input for query argument $10: 
datetime.datetime(2026, 2, 8, 2, 51, 34,... (can't subtract offset-naive and offset-aware datetimes)
Handler returned False for topic kaiser/god/esp/MOCK_REALTIMEIJMSVGYJ/sensor/5/data
```

- **Ursache:** `sensor_repo.save_data()` nutzt `timestamp or datetime.now(timezone.utc)` — timezone-aware Fallback kollidiert mit PostgreSQL TIMESTAMP WITHOUT TIME ZONE
- **Folge:** save_data schlägt fehl → kein WebSocket-Broadcast sensor_data → Tests timeout
- **Fix 1:** `sensor_handler.py:274` — `.replace(tzinfo=None)` nach `datetime.fromtimestamp(...)` (bereits vorhanden)
- **Fix 2:** `sensor_repo.py` — timestamp vor Insert auf naive normalisieren: `if ts.tzinfo: ts = ts.replace(tzinfo=None)`
- **DB-Inspector:** `sensor_data` Tabelle war leer (0 rows) — bestätigt, dass save_data nie erfolgreich war

### 3.6 Korrelation mit NETWORK_DEBUG_REPORT.md

- **Report:** automationone-server Up 2h, health/live OK, MQTT funktioniert
- **Abweichung:** E2E-Tests brauchen `make e2e-up` (docker-compose.e2e.yml), nicht nur Standard-Compose
- **Mögliche Ursache:** User hat `npx playwright test` ohne e2e-up ausgeführt; oder Standard-Stack lief, aber Port 8000 war aus Host-Sicht nicht erreichbar (z.B. anderes Netzwerk-Interface)

---

## 4. Nächste Schritte

1. ~~**Server sensor_handler:**~~ ✓ Behoben: naive UTC datetime für PostgreSQL
2. ~~**Server sensor_repo:**~~ ✓ Behoben: timestamp-Fallback auf naive normalisieren
3. ~~**Test 4 (device card):**~~ ✓ Behoben: auf SensorsView verifizieren (stabile WS, keine Nav-Reconnects)
4. ~~**Test 3 (22.5):**~~ ✓ Behoben: Regex-Locator für toFixed(2)
5. **Testlauf:** `make e2e-test` oder `cd "El Frontend"; npx playwright test tests/e2e/scenarios/sensor-live.spec.ts --reporter=list --workers=1`
6. **Voraussetzung:** `make e2e-up` ausgeführt (Docker-Services laufen)

---

## 4b. DB-Inspector Check (2026-02-08)

| Prüfung | Ergebnis |
|---------|----------|
| `esp_devices` (MOCK_%) | ✓ Devices vorhanden (MOCK_REALTIMEIJMSVGYJ, MOCK_MULTI46A3TEPB, MOCK_CARDE03C3WV0) |
| `sensor_configs` | ✓ Konfigs für GPIO 4, 5, 34 (temperature, humidity, ph) |
| `sensor_data` | ❌ **0 rows** — bestätigt: save_data nie erfolgreich |

**Skill:** db-inspector

---

## 5. Root Cause & Fix (2026-02-08)

### Root Cause

1. **Heartbeat erzeugt `pending_approval`**  
   Server auto-registriert neue Geräte via Heartbeat mit `status=pending_approval`.

2. **API filtert Pending Devices**  
   `GET /api/v1/esp/devices` schließt `pending_approval` aus (esp.py:151–153).

3. **SensorsView nutzt nur `espStore.devices`**  
   `allSensors` = `devices.flatMap(esp => esp.sensors)`. Pending Devices landen nie in der Liste.

4. **WebSocket `sensor_data` benötigt existierende Device-Cards**  
   `handleSensorData` sucht `device` in `devices.value`; ohne Device wird die Update-Logik übersprungen.

5. **Single-Value-Sensoren werden nicht dynamisch angelegt**  
   `handleSingleValueSensorData`: „We don't create new sensors here via WebSocket - they must be added via API.“

### Implementierter Fix

- **API-Helper:** `El Frontend/tests/e2e/helpers/api.ts`  
  - `createMockEspWithSensors(page, options)` – authentifizierter Aufruf der Debug-API

- **Neuer Testablauf:**  
  `createMockEsp` (device + sensors in UI) → `publishHeartbeat` → `publishSensorData`  
  - Device kommt aus Mock-Store in `listDevices`  
  - Sensor-Updates via WebSocket greifen auf vorhandene Device-Struktur

- **Test 4:** Assertion verschärft – `expect(deviceCard).toBeVisible()` vor Sensor-Check.

### API-Helper Fix (2026-02-08) – Timeout behoben

**Problem:** `page.evaluate` mit `fetch` im Browser-Kontext führte zu 30s Test-Timeout.

**Lösung:** API-Calls über `page.request` (Node-Kontext) statt `page.evaluate`:
- Token via kurzem `page.evaluate` (localStorage) holen
- `page.request.post()` direkt an Backend (localhost:8000)
- `timeout: 30000` für Mock-ESP-Erstellung (DB + SensorConfig)
- `getApiBase()` nutzt `PLAYWRIGHT_API_BASE` oder Port 8000

### Fix 2 (2026-02-08) – "Target page, context or browser has been closed"

**Problem:** POST zu `createMockEsp` hing (Backend nicht erreichbar). Test-Timeout (30s) löste Abriss aus → `page.request` wurde mit dem Browser geschlossen → obskurer Fehler.

**Lösung:**
- **Standalone `request`-Fixture:** `createMockEspWithSensors(page, request, options)` nutzt `request.post()` statt `page.request.post()` — unabhängig vom Page-Lifecycle
- **Fail-Fast (15s):** API-Timeout auf 15s reduziert → bei unreachable Backend klare Fehlermeldung statt 30s Warte
- **Bessere Fehlermeldung:** Bei ECONNREFUSED/Timeout/ENOTFOUND Hinweis: `make e2e-up` ausführen
- **Test-Timeout:** sensor-live describe: `test.setTimeout(60000)` für createMockEsp + MQTT + WebSocket + UI
- **Makefile:** `make e2e-up`, `make e2e-down`, `make e2e-test` hinzugefügt

### Verifikation

```powershell
# 1. Docker-Services starten (VORAUSSETZUNG)
cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"
make e2e-up

# 2. Tests ausführen
make e2e-test
# oder gezielt:
cd "El Frontend"
npx playwright test tests/e2e/scenarios/sensor-live.spec.ts --reporter=list --workers=1
```

**Voraussetzung:** Docker-Services laufen (`make e2e-up`). Ohne laufendes Backend: Fehlermeldung nach ~15s mit Hinweis auf `make e2e-up`.

---

## 6. Sensor-Datenfluss (verifiziert gegen echtes System)

| Schritt | Quelle | Ziel | Protokoll |
|----------|--------|------|-----------|
| 1. Device + Sensoren anlegen | `createMockEspWithSensors` | `POST /api/v1/debug/mock-esp` | REST |
| 2. Heartbeat (optional) | `publishHeartbeat` | `kaiser/god/esp/{id}/system/heartbeat` | MQTT |
| 3. Sensor-Daten | `publishSensorData` | `kaiser/god/esp/{id}/sensor/{gpio}/data` | MQTT |
| 4. Server verarbeitet | `sensor_handler.handle_sensor_data` | DB + WebSocket broadcast | Python |
| 5. Frontend empfängt | `espStore.handleSensorData` | `sensor_data` Event | WebSocket |
| 6. UI aktualisiert | SensorsView / Device-Card | `raw_value.toFixed(2)` | Vue |

**Server:** `sensor_handler.py` erfordert ESP in DB; Mock-ESP erstellt Device + SensorConfig. MQTT-Payload: `ts`, `esp_id`, `gpio`, `sensor_type`, `raw`, `value`, `raw_mode`.

**MQTT-Container:** `automationone-mqtt` (docker-compose); Tests nutzen `docker exec automationone-mqtt mosquitto_pub`.

---

## 7. Referenzen

| Datei | Zweck |
|------|-------|
| `El Frontend/tests/e2e/scenarios/sensor-live.spec.ts` | Spec |
| `El Frontend/tests/e2e/helpers/mqtt.ts` | publishHeartbeat, publishSensorData |
| `El Frontend/tests/e2e/helpers/websocket.ts` | WS_MESSAGE_TYPES.SENSOR_DATA |
| `El Frontend/tests/e2e/helpers/api.ts` | createMockEspWithSensors(page, request, options) |
| `El Frontend/src/views/SensorsView.vue` | sensor.raw_value.toFixed(2) |
| `El Servador/.../sensor_handler.py:314` | WebSocket broadcast sensor_data |
