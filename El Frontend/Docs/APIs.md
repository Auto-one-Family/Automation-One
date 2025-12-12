## Zweck
Schnellreferenz aller aktuell im Frontend angebundenen REST-Endpunkte und zugehörigen Code-Stellen. Basis: `El Frontend` (Vue 3 + Vite) mit Backend `El Servador` (FastAPI, Prefix `/api/v1`).

## Axios-Basis
- Datei: `src/api/index.ts`
  - `baseURL: '/api/v1'`, `timeout: 30000`
  - Request-Interceptor: setzt `Authorization: Bearer <accessToken>` aus `useAuthStore()`.
  - Response-Interceptor: bei 401 + Refresh-Token → `authStore.refreshTokens()` → wiederholt Request, sonst Logout + Redirect `/login`.
  - Exporte: `get/post/put/patch/del` Helper (lösen `res.data` auf).

## Auth-API (`src/api/auth.ts`)
| Endpoint | Methode | Payload | Response | Verwendet in |
| --- | --- | --- | --- | --- |
| `/auth/status` | GET | – | `AuthStatusResponse { setup_required, user_count }` | `authStore.checkAuthStatus()` (Router-Guard) |
| `/auth/setup` | POST | `SetupRequest { username, email, password, full_name? }` | `TokenResponse { access_token, refresh_token, ... }` | `authStore.setup()` (SetupView) |
| `/auth/login` | POST | `LoginRequest { username, password, remember_me? }` | `TokenResponse` | `authStore.login()` (LoginView) |
| `/auth/refresh` | POST | `{ refresh_token }` | `TokenResponse` | `authStore.refreshTokens()` (Interceptor + Store) |
| `/auth/me` | GET | – | `{ success, data: User }` | `authStore.checkAuthStatus()`, `login()`, `setup()`, `refreshTokens()` |
| `/auth/logout` | POST | `{ logout_all?: boolean }` | `void` | `authStore.logout()` |

### Datenstrukturen
- `src/types/index.ts`: `User`, `LoginRequest`, `SetupRequest`, `TokenResponse`, `AuthStatusResponse`.
- LocalStorage Keys: `el_frontend_access_token`, `el_frontend_refresh_token`.

## Debug/Mock ESP-API (`src/api/debug.ts`)
Alle Pfade unter `/debug/mock-esp` (Backend: FastAPI Debug-Router).

| Endpoint | Methode | Payload | Response | Zweck |
| --- | --- | --- | --- | --- |
| `/debug/mock-esp` | POST | `MockESPCreate` | `MockESP` | Mock-ESP anlegen |
| `/debug/mock-esp` | GET | – | `{ success, data: MockESP[], total }` | Mock-ESPs auflisten |
| `/debug/mock-esp/{esp_id}` | GET | – | `MockESP` | Details lesen |
| `/debug/mock-esp/{esp_id}` | DELETE | – | `void` | Mock löschen |
| `/debug/mock-esp/{esp_id}/heartbeat` | POST | – | `HeartbeatResponse` | Heartbeat senden |
| `/debug/mock-esp/{esp_id}/state` | POST | `{ state, reason? }` | `CommandResponse` | System-Status setzen |
| `/debug/mock-esp/{esp_id}/auto-heartbeat` | POST | Query `{ enabled, interval_seconds }` | `CommandResponse` | Auto-Heartbeat toggeln |
| `/debug/mock-esp/{esp_id}/sensors` | POST | `MockSensorConfig` | `CommandResponse` | Sensor hinzufügen |
| `/debug/mock-esp/{esp_id}/sensors/{gpio}` | POST | `{ raw_value, quality?, publish? }` | `CommandResponse` | Sensorwert setzen |
| `/debug/mock-esp/{esp_id}/sensors/batch` | POST | `{ values: Record<gpio,raw>, publish? }` | `CommandResponse` | Sensorwerte gesammelt setzen |
| `/debug/mock-esp/{esp_id}/actuators` | POST | `MockActuatorConfig` | `CommandResponse` | Aktor hinzufügen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}` | POST | `{ state, pwm_value?, publish? }` | `CommandResponse` | Aktor schalten |
| `/debug/mock-esp/{esp_id}/emergency-stop` | POST | Query `{ reason }` | `CommandResponse` | E-Stop auslösen |
| `/debug/mock-esp/{esp_id}/clear-emergency` | POST | – | `CommandResponse` | E-Stop zurücksetzen |
| `/debug/mock-esp/{esp_id}/messages` | GET | Query `{ limit }` | `{ success, esp_id, messages[] }` | MQTT-Historie lesen |
| `/debug/mock-esp/{esp_id}/messages` | DELETE | – | `void` | MQTT-Historie leeren |

### Datenstrukturen
- `src/types/index.ts`: `MockESP`, `MockSensorConfig`, `MockActuatorConfig`, `MockSystemState`, `CommandResponse`, `QualityLevel`, `MqttMessageRecord`.

## Weitere Calls
Aktuell existieren keine zusätzlichen REST-Wrapper im Frontend; Komponenten nutzen die obigen Services über Views:
- Mock ESP Flows: `views/MockEspView.vue`, `MockEspDetailView.vue`, `MqttLogView.vue`.
- Auth/Setup: `views/LoginView.vue`, `SetupView.vue`, Guards in `router/index.ts`.

## Fehler- und Retry-Logik
- 401 → Refresh über Interceptor; bei Fehlschlag Logout.
- Alle Requests erben das globale Timeout (30s) und JSON-Header.
- **Bekannte Bugs:** Siehe `Bugs_Found.md` für dokumentierte Fehler und deren Lösungen.

## Backend-Verortung
Relevante Server-Router liegen unter `El Servador/god_kaiser_server/src/api/v1/`:
- Auth: `auth.py`
- Debug/Mock: `debug.py` (oder gleichnamiger Router; je nach Serverstruktur)
MQTT/ESP/Logic Endpunkte sind derzeit im Frontend nicht verdrahtet.