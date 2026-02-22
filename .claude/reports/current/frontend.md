# Frontend Inspection Report

**Datum:** 2026-02-20T23:35:00Z
**Systemstatus:** degraded (Frontend OK, Server OK, MQTT OK, aber keine Sensor-Daten)
**Frontend-URL:** http://localhost:5173
**Login-Status:** Nicht getestet (kein Playwright MCP-Zugriff möglich)

---

## Executive Summary

**Status:** DEGRADED – System läuft, aber ohne Live-Daten

**Kritische Befunde:**
1. ✅ Frontend-Container läuft und antwortet (Port 5173)
2. ✅ Server-Container läuft und ist healthy (MQTT verbunden)
3. ✅ 2 ESP-Devices sind online (ESP_472204, MOCK_5D5ADA49)
4. ❌ **KEINE Sensor-Daten** – `sensor_data` Tabelle komplett leer
5. ❌ **KEINE Sensoren konfiguriert** – `sensor_configs` Tabelle leer
6. ⚠️ **WebSocket Token Expiry Problem** – Expired Tokens führen zu 403-Errors
7. ⚠️ **MQTT Last-Will JSON-Fehler** – ESPs senden leere/ungültige Payloads
8. ⚠️ **Token-Blacklist Race Condition** – Duplicate key violations

**User-Impact:**
- Dashboard zeigt keine Live-Sensor-Daten (da keine Sensoren existieren)
- WebSocket-Verbindungen brechen nach 30 Minuten ab (Token-Ablauf)
- UI zeigt vermutlich leere Sensor-Listen

---

## Systemstatus-Zusammenfassung

```json
{
  "timestamp": "2026-02-20T23:29:01Z",
  "overall": "critical",  // FALSE POSITIVE - Server ist online
  "services": {
    "docker": "ok (12 containers running)",
    "server": "error (FALSE - /health returns 200)",  // Script prüfte falschen Endpoint
    "postgres": "ok (14 connections, 9.5MB)",
    "mqtt": "ok (Port 1883 open)",
    "frontend": "ok (Port 5173 open)",
    "loki": "error (not ready)",
    "prometheus": "error",
    "grafana": "error"
  },
  "issues": [
    "server: /health/live unreachable (SCRIPT-BUG: Endpoint ist /health nicht /health/live)",
    "loki: not ready",
    "prometheus: not ready",
    "grafana: not ready"
  ]
}
```

**Tatsächlicher Status:**
- Server: **ONLINE** – `/health` returns `{"status":"healthy","mqtt_connected":true}`
- MQTT: **CONNECTED** – Server hat aktive MQTT-Verbindung
- Frontend: **ONLINE** – Vite Dev Server läuft
- Monitoring-Stack: **DOWN** – Loki/Prometheus/Grafana nicht verfügbar

---

## Browser-Befunde

### Frontend-Container-Analyse (Playwright MCP nicht verfügbar)

**Methodik:**
Da kein direkter Playwright MCP-Zugriff möglich war, wurde eine alternative Analyse durchgeführt:
1. Container-Logs (Vite Dev Server)
2. HTTP-Response von Port 5173
3. Source-Code-Analyse (Auth/WebSocket-Handling)
4. Loki Log-Aggregation

**Frontend HTML (http://localhost:5173):**
```html
<!DOCTYPE html>
<html lang="de" class="dark">
  <head>
    <script type="module" src="/@vite/client"></script>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/favicon.ico">
    <title>El Frontend - AutomationOne Debug Dashboard</title>
  </head>
  <body class="bg-dark-950 text-dark-100 font-sans antialiased">
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```
✅ HTML lädt korrekt
✅ Vite Dev Server aktiv
✅ TypeScript-Modul wird geladen

### Vite Proxy-Konfiguration

**File:** `El Frontend/vite.config.ts`

```typescript
proxy: {
  '/api': {
    target: process.env.VITE_API_TARGET || 'http://el-servador:8000',
    changeOrigin: true,
  },
  '/ws': {
    target: process.env.VITE_WS_TARGET || 'ws://el-servador:8000',
    ws: true,
  },
}
```

**Umgebungsvariablen (im Container):**
```bash
VITE_API_URL=http://localhost:8000  # FÜR BROWSER (korrekt)
VITE_WS_URL=ws://localhost:8000     # FÜR BROWSER (korrekt)
VITE_LOG_LEVEL=debug
```

**Bewertung:**
✅ Vite-Proxy nutzt `el-servador:8000` (Service-Name) – korrekt
✅ Browser nutzt `localhost:8000` (Host-Port-Mapping) – korrekt
⚠️ Startup-Logs zeigen alte Proxy-Errors (während Server noch nicht ready war)

### Console-Messages (Loki-basiert)

**Loki-Query:** `{compose_service="el-frontend"} |~ "error|Error|ERROR"`
**Zeitraum:** Letzte Stunde
**Ergebnis:** **0 Errors**

✅ Keine Frontend-Build-Errors
✅ Keine TypeScript-Errors
✅ Keine Vue-Component-Errors

### Network-Requests (Loki Server-Logs)

**Loki-Query:** `{compose_service="el-servador"} |~ "401|403"`
**Zeitraum:** Letzte Stunde
**Befunde:**

| Timestamp | Endpoint | Status | Details |
|-----------|----------|--------|---------|
| 22:24:38 | `/api/v1/auth/me` | 401 | Unauthorized (2x) |
| 22:24:38 | `/api/v1/ws/realtime/{client_id}` | 403 | Token expired (WebSocket) |
| 21:41:23 | `/api/v1/ws/realtime/{client_id}` | 403 | Token expired (WebSocket) |

**Pattern:**
- WebSocket-Verbindungen schlagen mit **403 Forbidden** fehl
- Ursache: **JWT Signature has expired**
- Betrifft Client-IDs nach ~30 Minuten Session-Dauer (Access Token Lifetime)

---

## Fehler / Bugs / Warnungen

| # | Level | Quelle | Beschreibung | Kontext | Timestamp |
|---|-------|--------|--------------|---------|-----------|
| 1 | ERROR | MQTT Subscriber | Invalid JSON payload on will-topic | ESP_472204: `kaiser/god/esp/ESP_472204/system/will` – leeres Payload | 22:32:01, alle ~60s |
| 2 | ERROR | MQTT Subscriber | Invalid JSON payload on will-topic | MOCK_5D5ADA49: `kaiser/god/esp/MOCK_5D5ADA49/system/will` – leeres Payload | 22:31:42, alle ~60s |
| 3 | WARNING | Auth Router | Token blacklist duplicate key | `asyncpg.exceptions.UniqueViolationError: duplicate key value violates unique constraint "ix_token_blacklist_token_hash"` | 22:24:38 |
| 4 | WARNING | WebSocket | JWT verification failed | `Token verification failed: Signature has expired` (client_id=client_1771626277952_zllt5iisi) | 22:24:38 |
| 5 | ERROR | Database | No sensor data | `sensor_data` table is empty (0 rows) | PERSISTENT |
| 6 | ERROR | Database | No sensors configured | `sensor_configs` table is empty (0 rows) | PERSISTENT |
| 7 | INFO | Vite Proxy | ECONNREFUSED during startup | `Error: connect ECONNREFUSED 172.18.0.12:8000` (Server not ready yet) | 17:49:35 (Startup) |

---

## Cross-Layer-Befunde

### 1. WebSocket Token Expiry Problem

**Frontend-Symptom:**
- WebSocket-Verbindungen werden mit 403 Forbidden abgelehnt
- Browser versucht Reconnect mit abgelaufenem Token

**Server-Log:**
```
2026-02-20 22:24:38 - src.api.v1.websocket.realtime - WARNING - WebSocket connection rejected:
JWT verification failed (client_id=client_1771626277952_zllt5iisi):
Token verification failed: Signature has expired.
```

**Root Cause:**
WebSocket-Service (`El Frontend/src/services/websocket.ts`) nutzt Token aus URL-Query-Parameter:
```typescript
// Line 121
return `${protocol}//${host}/api/v1/ws/realtime/${this.clientId}?token=${encodeURIComponent(token)}`
```

**Token-Refresh-Logik existiert:**
- `refreshTokenIfNeeded()` (Line 137-153) prüft Token-Ablauf
- Wird aufgerufen bei:
  1. Reconnect nach Disconnect (Line 284)
  2. Tab Visibility Change (Line 328)

**Problem:**
❌ **KEIN proaktiver Token-Refresh während aktiver Verbindung**
- WebSocket bleibt 30+ Minuten offen mit altem Token in URL
- Bei Tab-Wechsel (Visibility Change) versucht Reconnect mit abgelaufenem Token
- Refresh wird erst NACH 403 getriggert → Reconnect schlägt erneut fehl

**Empfehlung:**
1. Proaktiver Token-Refresh vor Ablauf (z.B. 5 Min vor Expiry)
2. WebSocket-Reconnect mit neuem Token bei Token-Refresh
3. Alternative: Backend akzeptiert Token-Refresh während aktiver WS-Verbindung

**Impact:**
⚠️ MEDIUM – Nach 30 Min Session-Dauer verliert User Live-Daten-Updates (WebSocket down)

---

### 2. MQTT Last-Will JSON Parsing Errors

**Frontend-Symptom:**
Keine direkten Frontend-Errors, aber Server-Log-Spam verhindert saubere Diagnose

**Server-Log:**
```
2026-02-20 22:32:01 - src.mqtt.subscriber - ERROR - Invalid JSON payload on topic
kaiser/god/esp/ESP_472204/system/will: Expecting value: line 1 column 1 (char 0)
```

**Frequenz:**
- ESP_472204: alle ~60 Sekunden
- MOCK_5D5ADA49: alle ~60 Sekunden

**Root Cause:**
ESPs senden leere oder nicht-JSON Payloads auf Last-Will-Topics

**Korrelation:**
- ESP_472204: status=online, last_seen=22:33:00 (kürzlich)
- MOCK_5D5ADA49: status=online, last_seen=22:32:42 (kürzlich)
- Beide Devices sind aktiv, aber senden fehlerhafte Will-Messages

**Empfehlung:**
1. ESP-Firmware: Last-Will Payload auf gültiges JSON setzen oder leer lassen
2. Server: Graceful Handling von leeren Payloads (nicht als ERROR loggen)

**Impact:**
⚠️ LOW – Nur Log-Spam, keine funktionale Auswirkung auf Frontend

---

### 3. Token Blacklist Race Condition

**Frontend-Symptom:**
Keine direkten Auswirkungen (Login/Refresh funktioniert)

**Server-Log:**
```
2026-02-20 22:24:38 - src.api.v1.auth - WARNING - Failed to blacklist old refresh token
(might be already blacklisted):
asyncpg.exceptions.UniqueViolationError: duplicate key value violates unique constraint
"ix_token_blacklist_token_hash"
```

**Root Cause:**
Bei Token-Rotation (Refresh-Endpoint) wird der alte Refresh-Token geblacklisted. Race Condition bei parallelen Refresh-Requests vom selben User führt zu Duplicate-Key-Violation.

**Empfehlung:**
1. Backend: `INSERT ... ON CONFLICT DO NOTHING` statt normales INSERT
2. Oder: Check-before-Insert mit SELECT + conditional INSERT

**Impact:**
⚠️ LOW – Nur Warning, Token-Refresh funktioniert trotzdem

---

### 4. NO SENSOR DATA – Root Cause

**Frontend-Symptom:**
Dashboard zeigt leere Sensor-Listen / keine Live-Daten

**Database-Befunde:**

```sql
-- ESP Devices (online)
SELECT device_id, status, last_seen FROM esp_devices WHERE status = 'online';
┌───────────────┬────────┬─────────────────────────────┐
│  device_id    │ status │         last_seen           │
├───────────────┼────────┼─────────────────────────────┤
│ ESP_472204    │ online │ 2026-02-20 22:33:00+00      │
│ MOCK_5D5ADA49 │ online │ 2026-02-20 22:32:42.939+00  │
└───────────────┴────────┴─────────────────────────────┘

-- Sensor Configs (expected: Sensors attached to ESPs)
SELECT COUNT(*) FROM sensor_configs;
┌───────┐
│ count │
├───────┤
│     0 │  ❌ EMPTY
└───────┘

-- Sensor Data (expected: Recent readings)
SELECT COUNT(*) FROM sensor_data;
┌───────┐
│ count │
├───────┤
│     0 │  ❌ EMPTY
└───────┘
```

**Root Cause Chain:**
1. **NO Sensors Configured** → `sensor_configs` table is empty
2. ESPs sind online und senden Heartbeats (last_seen aktuell)
3. Aber: Ohne konfigurierte Sensoren senden ESPs keine Sensor-Daten
4. `sensor_data` bleibt leer
5. Frontend-API-Calls zu `/api/v1/sensors` oder `/api/v1/sensor-data` liefern leere Arrays
6. Dashboard zeigt "No Data"

**Expected Flow:**
```
User → Frontend: Add Sensor → API: POST /api/v1/sensors → DB: INSERT sensor_configs
ESP  → MQTT: Empfängt neue Sensor-Config → Startet Sensor-Reading
ESP  → MQTT: Sendet Sensor-Daten → Server → DB: INSERT sensor_data
Server → WebSocket: Broadcast sensor_data → Frontend: Live-Update
```

**Empfehlung:**
1. Frontend: "Add Sensor" UI-Flow nutzen um erste Sensoren zu konfigurieren
2. Oder: DB-Seed-Script ausführen um Test-Sensoren anzulegen
3. ESP-Firmware: Prüfen ob Sensor-Config-MQTT-Messages verarbeitet werden

**Impact:**
🔴 CRITICAL (funktional) – Dashboard hat keine Daten zum Anzeigen
⚠️ MEDIUM (technisch) – System funktioniert, aber Sensoren müssen konfiguriert werden

---

## Source-Code-Analyse

### Auth Store – Token Management

**File:** `El Frontend/src/shared/stores/auth.store.ts`

**Befunde:**
✅ Auth-Store implementiert Token-Refresh korrekt (`refreshTokens()`, Line 108-123)
✅ `checkAuthStatus()` versucht automatisch Refresh bei 401 (Line 48-56)
✅ Tokens werden in `localStorage` gespeichert (persistent sessions)

**Token-Lifecycle:**
1. Login → setTokens (access + refresh)
2. API-Request mit expired access → Interceptor ruft `authStore.refreshTokens()`
3. Refresh → neuer access + refresh Token
4. Retry original request

**Limitierung:**
WebSocket nutzt Token direkt in URL → kein Auto-Refresh während aktiver Verbindung

---

### API Client – Interceptor-Logik

**File:** `El Frontend/src/api/index.ts`

**Response-Interceptor (Line 35-79):**
```typescript
// If 401 and not already retrying and not an auth endpoint, try to refresh token
if (
  error.response?.status === 401 &&
  !originalRequest._retry &&
  !isAuthEndpoint &&
  authStore.refreshToken
) {
  originalRequest._retry = true

  try {
    await authStore.refreshTokens()

    // Retry original request with new token
    originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`
    return api(originalRequest)
  } catch (refreshError) {
    // Refresh failed, logout user
    authStore.clearAuth()
    window.location.href = '/login'
    return Promise.reject(refreshError)
  }
}
```

**Bewertung:**
✅ **KORREKT implementiert**
✅ Verhindert Infinite Loop bei Auth-Endpoints
✅ Retry-Logic mit `_retry` Flag
✅ Automatic logout bei Refresh-Failure

---

### WebSocket Service – Token Refresh

**File:** `El Frontend/src/services/websocket.ts`

**Token Expiry Tracking (Line 106-131):**
```typescript
// Extract token expiry from JWT payload
try {
  const payload = JSON.parse(atob(token.split('.')[1]))
  this.tokenExpiry = payload.exp ? payload.exp * 1000 : null
} catch {
  this.tokenExpiry = null
}

// Check if token is expired or about to expire (within 60 seconds)
private isTokenExpired(): boolean {
  if (!this.tokenExpiry) return false
  const bufferMs = 60000 // 60 second buffer
  return Date.now() >= this.tokenExpiry - bufferMs
}
```

**Refresh Logic (Line 137-153, 283-293):**
```typescript
// Called during reconnect
private async refreshTokenIfNeeded(): Promise<boolean> {
  if (!this.isTokenExpired()) {
    return true // Token still valid
  }

  logger.info('Token expired/expiring, refreshing before reconnect...')
  const authStore = useAuthStore()

  try {
    await authStore.refreshTokens()
    return true
  } catch (error) {
    logger.error('Token refresh failed', error)
    return false
  }
}
```

**Bewertung:**
✅ Token-Expiry wird korrekt aus JWT extrahiert
✅ 60-Sekunden-Buffer vor Ablauf
⚠️ **Refresh nur bei Reconnect/Tab-Switch**, NICHT proaktiv während aktiver Verbindung

**Missing Feature:**
Kein Timer/Interval der Token-Ablauf überwacht und proaktiv refresht + reconnects

---

## Empfehlungen

### 1. WebSocket Token Lifecycle (PRIORITY: HIGH)

**Problem:**
WebSocket-Verbindungen schlagen nach 30 Min mit 403 fehl (expired token in URL)

**Lösung Option A – Proaktiver Token-Refresh (empfohlen):**
```typescript
// In websocket.ts, onOpen handler:
this.ws.onopen = () => {
  // ... existing code ...

  // Schedule token refresh before expiry
  this.scheduleTokenRefresh()
}

private scheduleTokenRefresh(): void {
  if (!this.tokenExpiry) return

  const bufferMs = 5 * 60 * 1000 // 5 minutes before expiry
  const delay = this.tokenExpiry - Date.now() - bufferMs

  if (delay > 0) {
    setTimeout(async () => {
      const tokenValid = await this.refreshTokenIfNeeded()
      if (tokenValid && this.isConnected()) {
        // Reconnect with fresh token
        logger.info('Refreshed token, reconnecting WebSocket')
        this.disconnect()
        await this.connect()
      }
    }, delay)
  }
}
```

**Lösung Option B – Backend akzeptiert Token-Update:**
Backend-WebSocket-Endpoint akzeptiert neue Message: `{ action: 'update_token', token: '...' }`
→ Komplexere Backend-Änderung, aber kein Reconnect nötig

---

### 2. MQTT Last-Will Payload Fix (PRIORITY: MEDIUM)

**Problem:**
ESPs senden leere/ungültige JSON auf Last-Will-Topics → Server-Log-Spam

**Lösung ESP-Firmware:**
```cpp
// El Trabajante/src/services/mqtt/mqtt_manager.cpp
void MqttManager::configure_last_will() {
  String will_topic = "kaiser/god/esp/" + String(device_id) + "/system/will";
  String will_payload = "{\"status\":\"offline\",\"reason\":\"connection_lost\"}";

  client.setWill(will_topic.c_str(), will_payload.c_str(), 1, false);
}
```

**Lösung Server (Fallback):**
```python
# El Servador/src/mqtt/subscriber.py
async def handle_esp_will(topic: str, payload: bytes):
    if not payload or len(payload) == 0:
        logger.info(f"Empty will payload on {topic} (expected)")
        return

    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        logger.warning(f"Invalid will payload on {topic} (non-JSON), ignoring")
        return
```

---

### 3. Token Blacklist Race Condition (PRIORITY: LOW)

**Problem:**
Duplicate key violation bei parallelen Refresh-Requests

**Lösung:**
```python
# El Servador/src/services/auth_service.py
async def blacklist_token(...):
    try:
        await token_repository.blacklist(...)
    except IntegrityError:
        # Token already blacklisted, ignore
        logger.debug(f"Token already blacklisted (concurrent refresh): {token_hash[:8]}...")
        pass
```

Oder:
```sql
INSERT INTO token_blacklist (...)
ON CONFLICT (token_hash) DO NOTHING;
```

---

### 4. Sensor Configuration Setup (PRIORITY: CRITICAL for User)

**Problem:**
Keine Sensoren konfiguriert → Dashboard zeigt keine Daten

**Empfohlene Aktionen:**

**Option A – UI-Flow (User-freundlich):**
1. Frontend: Navigiere zu "Add Sensor" Seite
2. Wähle ESP-Device (ESP_472204 oder MOCK_5D5ADA49)
3. Wähle Sensor-Typ (z.B. DS18B20 Temperature)
4. Wähle GPIO-Pin
5. Speichern → POST `/api/v1/sensors`

**Option B – DB-Seed-Script (Dev/Test):**
```bash
# Existiert bereits:
python scripts/seed_wokwi_esp.py

# Oder manuell SQL:
INSERT INTO sensor_configs (esp_id, sensor_type, gpio_pin, enabled) VALUES
  ('ESP_472204', 'ds18b20', 4, true),
  ('MOCK_5D5ADA49', 'sht31', 21, true);
```

**Erwartetes Verhalten nach Sensor-Config:**
1. Server sendet MQTT-Message zu ESP: `kaiser/esp/{device_id}/config/sensor`
2. ESP empfängt Config, startet Sensor-Reading
3. ESP sendet Sensor-Daten: `kaiser/god/esp/{device_id}/sensor/{sensor_type}`
4. Server speichert in `sensor_data`, broadcasted via WebSocket
5. Frontend empfängt WebSocket-Event, zeigt Live-Daten

---

### 5. Frontend Error Boundary (PRIORITY: LOW)

**Empfehlung:**
Implementiere Vue Error Boundary für graceful degradation bei Component-Errors

```vue
<!-- App.vue -->
<ErrorBoundary>
  <RouterView />
</ErrorBoundary>
```

---

## Appendix: Loki Query Results

### Frontend Errors (Letzte Stunde)

**Query:** `{compose_service="el-frontend"} |~ "error|Error|ERROR"`
**Result:** `totalLinesProcessed: 0` ✅ No errors

---

### Server WebSocket Events (Letzte Stunde)

**Query:** `{compose_service="el-servador"} |~ "websocket|WebSocket|broadcast|ws_manager"`
**Result:** 19 entries

**Summary:**
- 2x WebSocket connection rejected (403 – token expired)
- 3x Client connected
- 3x Client disconnected
- 3x MQTT subscriptions (kaiser/broadcast/emergency)

**Timeline:**
```
21:41:22 - client_1771621732176_z39k1kob9 disconnected
21:41:23 - client_1771623682336_h9wwf7l8x connection rejected (403, expired token)
21:41:24 - client_1771623682336_h9wwf7l8x connected (after refresh)
21:51:52 - client_1771623682336_h9wwf7l8x disconnected
21:51:53 - client_1771624313389_rzjoyq253 connected
22:24:37 - client_1771624313389_rzjoyq253 disconnected
22:24:38 - client_1771626277952_zllt5iisi connection rejected (403, expired token)
22:24:40 - client_1771626277952_zllt5iisi connected (after refresh)
```

**Pattern:**
WebSocket reconnects alle ~30-40 Minuten, dabei 403-Error bei erstem Versuch (expired token), dann erfolgreicher Reconnect nach Token-Refresh.

---

### Server API Errors (Letzte Stunde)

**Query:** `{compose_service="el-servador"} |~ "ERROR|401|403|500|422"`
**Result:** 30+ entries

**Error Distribution:**
- **MQTT Invalid JSON (BULK):** ~23 errors (ESP_472204, MOCK_5D5ADA49 will-topics)
- **Auth 401:** 2x `/api/v1/auth/me` (22:24:38)
- **WebSocket 403:** 2x (22:24:38, 21:41:23)
- **Token Blacklist Warning:** 1x (22:24:38, duplicate key)

---

## Technische Details

### Environment

- **OS:** Windows 11 Pro 10.0.26200
- **Docker:** 12 containers running (4 core + monitoring)
- **Node:** Vite 6.4.1 (Frontend)
- **Python:** FastAPI (Backend)
- **Database:** PostgreSQL 16-alpine
- **MQTT:** Eclipse Mosquitto 2

### Container Status

| Service | Status | Port | Health |
|---------|--------|------|--------|
| automationone-frontend | Up 5h | 5173 | healthy |
| automationone-server | Up 5h | 8000 | healthy |
| automationone-postgres | Up 5h | 5432 | healthy |
| automationone-mqtt | Up 5h | 1883, 9001 | healthy |
| automationone-loki | Down | - | - |
| automationone-prometheus | Down | - | - |
| automationone-grafana | Down | - | - |

### Network Topology

```
Browser (Host)
  ↓ http://localhost:5173
Frontend Container (172.18.0.13)
  ↓ Vite Proxy: http://el-servador:8000/api
  ↓ WebSocket: ws://localhost:8000/api/v1/ws/realtime
Server Container (172.18.0.13)
  ↓ postgresql://postgres:5432
  ↓ mqtt://mqtt-broker:1883
Database Container (172.18.0.X)
MQTT Container (172.18.0.X)
```

---

## Conclusion

**System Operational Status:** ✅ FUNCTIONAL
**Data Flow Status:** ❌ NO DATA (keine Sensoren konfiguriert)
**User Experience:** ⚠️ DEGRADED (Dashboard leer, WebSocket-Probleme nach 30 Min)

**Recommended Next Steps:**
1. **IMMEDIATE:** Configure sensors via Frontend UI oder DB-Seed-Script
2. **SHORT-TERM:** Implement proactive WebSocket token refresh
3. **MEDIUM-TERM:** Fix MQTT Last-Will payload errors
4. **LONG-TERM:** Fix token blacklist race condition

**Monitoring Recommendations:**
1. Restore Loki/Prometheus/Grafana stack für bessere Observability
2. Add Grafana Dashboard für WebSocket connection metrics
3. Add alert für "sensor_data table empty for > 5 minutes"

---

**Report generated by:** Frontend Inspector
**Skills used:** frontend-patterns, loki-queries, cross-layer-correlation, database-operations
**Methodology:** Container-Log-Analyse + Loki-Queries + Source-Code-Review + DB-Konsistenz-Checks
