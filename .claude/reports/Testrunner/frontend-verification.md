# Frontend-Verifizierung gegen test.md

**Datum:** 2026-02-08  
**Kontext:** test.md Session 15 / 14.3 Code-Cross-Reference  
**Skill:** frontend-development  

---

## 1. Zusammenfassung

| Prüfpunkt | Status | Anmerkung |
|-----------|--------|-----------|
| LoginView | ✅ | name, .login-error, error-Source stimmig |
| Router / Auth-Redirect | ✅ | `push('/')` → Dashboard, Regex passt |
| Auth Store | ✅ | `error` aus `response.data.detail` |
| PendingDevicesPanel | ✅ | `device.device_id` in `.pending-device__name` |
| ActionBar | ✅ | „Geräte“ / „X Neue“ |
| api.ts (E2E Helper) | ✅ | Pfade stimmen mit Server |
| websocket.ts (E2E Helper) | ✅ | Event-Typen = WEBSOCKET_EVENTS.md |
| sensor-live.spec.ts | ✅ | Mock-ESP-Flow, API-Helper korrekt |
| REST_ENDPOINTS Abweichung | ⚠️ | `batch-sensors` vs. `sensors/batch` – Server nutzt `sensors/batch` |
| sensor-live getByText | ❌ | de-DE zeigt "23,5", Test sucht "23.5" – Regex-Mismatch |

---

## 2. Verifizierte Komponenten

### 2.1 LoginView.vue

| test.md Behauptung | Aktueller Code | Verifizierung |
|--------------------|----------------|---------------|
| `name="username"` | Z.87: `name="username"` | ✅ |
| `name="password"` | Z.103: `name="password"` | ✅ |
| `.login-error` | Z.77: `<div v-if="error" class="login-error">` | ✅ |
| Error aus Store | Z.27: `error = computed(() => localError \|\| authStore.error)` | ✅ |

### 2.2 Router (Login-Redirect)

| test.md | Code | Verifizierung |
|---------|------|---------------|
| Nach Login: `router.push(redirect \|\| '/')` | LoginView.vue Z.43 | ✅ |
| Route `/` = Dashboard | router/index.ts Z.27–30: `path: ''` → DashboardView | ✅ |
| auth.spec erwartet `/\/(dashboard)?(\?.*)?$` | Matches `/` und `/dashboard` | ✅ |

### 2.3 Auth Store (Error-Handling)

| test.md | Code | Verifizierung |
|---------|------|---------------|
| `error` aus `response.data.detail` | auth.ts Z.76–77: `axiosError.response?.data?.detail \|\| 'Login failed'` | ✅ |

### 2.4 PendingDevicesPanel

| test.md | Code | Verifizierung |
|---------|------|---------------|
| Pfad | test.md: `components/dashboard/` | Tatsächlich: `components/esp/PendingDevicesPanel.vue` |
| `device.device_id` in `.pending-device__name` | Z.261–264: `{{ device.device_id }}` in `.pending-device__name` | ✅ |
| EspStore `fetchPendingDevices` | Panel öffnet → `espStore.fetchPendingDevices()` | ✅ |

### 2.5 ActionBar

| test.md | Code | Verifizierung |
|---------|------|---------------|
| Button „Geräte“ oder „X Neue“ | Z.151–152: `{{ hasPendingDevices ? \`${pendingCount} Neue\` : 'Geräte' }}` | ✅ |
| `getByRole('button', { name: /Geräte\|Neue/ })` | Matcht „Geräte“ und „3 Neue“ etc. | ✅ |

---

## 3. E2E-Helper (api.ts)

| Funktion | Endpoint | Server-Referenz | Status |
|----------|----------|-----------------|--------|
| `approveDeviceViaAPI` | `POST /api/v1/esp/devices/{id}/approve` | esp.py, REST_ENDPOINTS | ✅ |
| `addSensorConfigViaAPI` | `POST /api/v1/sensors/{esp_id}/{gpio}` | sensors.py Z.243 | ✅ |
| `createMockEspWithSensor` | `POST /api/v1/debug/mock-esp` | debug.py | ✅ |
| | `POST /api/v1/debug/mock-esp/{id}/sensors` | debug.py Z.997 | ✅ |
| | `POST /api/v1/debug/mock-esp/{id}/simulation/start` | debug.py Z.490 | ✅ |
| `setMockSensorValue` | `POST /api/v1/debug/mock-esp/{id}/sensors/batch` | debug.py Z.1201 | ✅ |

**Token:** Alle Helper nutzen `localStorage.getItem('el_frontend_access_token')` – konsistent mit auth.ts TOKEN_KEY.

### REST_ENDPOINTS Abweichung

- REST_ENDPOINTS.md Z.164: `/debug/mock-esp/{esp_id}/batch-sensors`
- Server debug.py Z.1201: `/mock-esp/{esp_id}/sensors/batch`
- api.ts verwendet korrekt `sensors/batch` → **REST_ENDPOINTS.md ist veraltet**.

---

## 4. WebSocket-Helper (websocket.ts)

| test.md Section 9.4 Fix | Aktueller Code | Verifizierung |
|-------------------------|----------------|---------------|
| `device.online` → `device_discovered` / `esp_health` | Z.169–172: `DEVICE_DISCOVERED`, `DEVICE_ONLINE: 'esp_health'` | ✅ |
| `actuator.alert` → `actuator_alert` | Z.186: `ACTUATOR_ALERT: 'actuator_alert'` | ✅ |
| `sensor.data` → `sensor_data` | Z.178: `SENSOR_DATA: 'sensor_data'` | ✅ |
| `emergency.stop` → `actuator_alert` mit `alert_type` | Z.189: `EMERGENCY_STOP: 'actuator_alert'` | ✅ |

Entspricht WEBSOCKET_EVENTS.md (device_discovered, esp_health, sensor_data, actuator_alert).

---

## 5. sensor-live.spec.ts

| test.md Session 15 | Umsetzung | Verifizierung |
|-------------------|----------|---------------|
| Mock-ESP statt Heartbeat-Approve | Alle 4 Tests nutzen `createMockEspWithSensor` + `setMockSensorValue` | ✅ |
| Warten auf Gerät | `await expect(page.locator(\`:has-text("${testDeviceId}")\`).first()).toBeVisible({ timeout: 10000 })` | ✅ |
| SensorsView | Navigiert zu `/sensors` vor Assertion | ✅ |
| Mehrere Typen | `POST /mock-esp/{id}/sensors` für humidity/ph, dann simulation/start | ✅ |

---

## 6. Bekannte Frontend-Lücken (aus test.md)

| Thema | Status | Bemerkung |
|-------|--------|-----------|
| Token abgelaufen (sensor-live: show on device card) | ⚠️ | Kein Token-Refresh während Testlauf; globalSetup prüft nur beim Start |
| WebSocket-Subscription | ℹ️ | Dashboard subscribt nur `logic_execution`; `actuator_alert` kommt ggf. nicht an |
| formatSensorValue (Komma vs. Punkt) | ❌ | **Root Cause:** `formatNumber` nutzt `de-DE` → "23,5", Test erwartet `/23\.5/` |

---

## 7. formatSensorValue / Anzeige – KRITISCH

**Root Cause für sensor-live Display-Fehler:**

| Komponente | Code | Ausgabe |
|------------|------|---------|
| `formatters.ts` | `Intl.NumberFormat('de-DE', {...})` | **23,5** (Komma) |
| `SensorSatellite.vue` | `formatNumber(props.value, decimals)` | **23,5** |
| `sensor-live.spec.ts` | `getByText(/23\.5/)` | Erwartet **23.5** (Punkt) |

Die UI zeigt **"23,5"** (de-DE), der Test sucht **"23.5"** → Selektor schlägt fehl.

**Fix-Optionen:**
1. **Test anpassen:** `getByText(/23[,.]5/)` oder `getByText('23,5')` (Lokalisierung berücksichtigen)
2. **Komponente:** `data-testid` für Sensorwert einführen (z.B. `data-testid="sensor-value-23.5"` mit Rohwert)
3. **Formatters:** E2E-Modus mit Punkt optional – nicht empfohlen (bricht i18n)

---

## 8. Empfehlungen

| Priorität | Aktion | Verantwortung |
|-----------|--------|---------------|
| 1 | **sensor-live:** `getByText(/23\.5/)` → `getByText(/23[,.]5/)` oder `getByText('23,5')` (de-DE Komma) | test-log-analyst |
| 2 | REST_ENDPOINTS.md: `batch-sensors` → `sensors/batch` | updatedocs |
| 3 | Token-Refresh in langen Testläufen (optional) | test-log-analyst |
| 4 | PendingDevicesPanel-Pfad in test.md korrigieren (esp/ nicht dashboard/) | test-log-analyst |

---

## 9. Fazit

Die in test.md dokumentierten Frontend-Änderungen sind im Code korrekt umgesetzt. Die Verifizierung bestätigt:

- Auth-, Login- und Redirect-Logik
- PendingDevicesPanel-Struktur und API
- E2E-Helper (api.ts, websocket.ts) passen zum Server
- sensor-live.spec.ts nutzt den Mock-ESP-Flow wie beschrieben

**Erkannte Root Cause für sensor-live:** Die Tests nutzen `getByText(/23\.5/)` (Punkt), die UI zeigt aber "23,5" (de-DE Komma) – Anpassung des Test-Selektors empfohlen.

Verbleibende Abweichungen betreffen Doku (REST_ENDPOINTS, test.md Pfade).
