## Zweck
Schnell-Orientierung für KI-Agenten im Frontend (`El Frontend`, Vue 3 + TypeScript + Vite + Pinia + Tailwind). Ziel: sofort relevante Dateien finden, Flows verstehen, Bugs lokalisieren.

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Server + Frontend starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 | - |
| **Bug debuggen** | `El Frontend/Docs/Bugs_Found.md` | Workflow + Fix dokumentiert |
| **API-Endpoint finden** | `El Frontend/Docs/APIs.md` | `src/api/` |
| **Auth-Flow verstehen** | `El Frontend/Docs/Admin oder user erstellen...md` | `src/stores/auth.ts` |
| **Mock ESP testen** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 3 | `src/views/MockEsp*.vue` |
| **WebSocket verbinden** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 4 | `src/views/MqttLogView.vue` |

---

## Build/Run
- Directory: `El Frontend/`
- Scripts (`package.json`): `npm run dev`, `npm run build`, `npm run preview`, `npm run type-check`.
- Dev-Server: Vite, default Port 5173. Node liegt unter `C:\Program Files\nodejs`.

## Entry Points
- `src/main.ts`: erstellt App, bindet Pinia + Router, lädt `./style.css`.
- `src/App.vue`: Root-Komponente, inkludiert Layout via Router.
- `src/router/index.ts`: Routen + Navigation Guards (Setup/Login/Role).

## State-Management (Pinia)
- Store: `src/stores/auth.ts`
  - State: `user`, `accessToken`, `refreshToken`, `setupRequired`, `error`, `isLoading`.
  - LocalStorage Keys: `el_frontend_access_token`, `el_frontend_refresh_token`.
  - Actions: `checkAuthStatus()`, `login()`, `setup()`, `refreshTokens()`, `logout()`, `clearAuth()`.
  - Roles: `isAdmin`, `isOperator`, `isAuthenticated`.
- Store: `src/stores/mockEsp.ts` (Mock-ESP UI; inspect when debugging mock flows).

## API-Layer
- Axios-Wrapper: `src/api/index.ts`
  - `baseURL: '/api/v1'`, Request-Interceptor setzt Bearer-Token aus `useAuthStore()`.
  - Response-Interceptor: 401 → `refreshTokens()` → Retry, sonst Logout + Redirect `/login`.
  - Exporte: `get/post/put/patch/del` Helper.
- Auth API: `src/api/auth.ts` (Status, Setup, Login, Refresh, Me, Logout).
- Debug API: `src/api/debug.ts` (Mock ESP CRUD, Heartbeats, Sensor/Actuator set, E-Stop, Message History).
- Typen für API: `src/types/index.ts` (Auth, MockESP, Logic, WebSocket, Responses).
- Siehe auch `El Frontend/Docs/APIs.md` für Endpoint-Tabelle.

## Routing & Guards
- Datei: `src/router/index.ts`
  - Routen: `/login`, `/setup`, geschützter Root `/` mit Kindern `dashboard`, `mock-esp`, `mock-esp/:espId`, `mqtt-log`, `sensors`, `actuators`, `logic`, `settings`.
  - Meta: `requiresAuth`, `requiresAdmin`.
  - Guard-Flow: Wenn `setupRequired === null` → `checkAuthStatus()`; `setup_required` true → Redirect `/setup`; fehlende Auth → `/login?redirect=...`; fehlende Admin-Rolle → Dashboard.

## Views (Seiten)
- Auth: `views/LoginView.vue`, `views/SetupView.vue`.
- Dashboard: `views/DashboardView.vue`.
- Sensors/Actuators/Logic/Settings: jeweilige Views unter `views/`.
- Mock/Debug: `views/MockEspView.vue`, `MockEspDetailView.vue`, `MqttLogView.vue` (nutzen `debugApi`).
- Layout: `components/layout/MainLayout.vue` (Wrapper), `AppHeader.vue`, `AppSidebar.vue`.

## Komponenten (Auswahl, nach Feature)
- Sensors: `components/sensors/*`
- Actuators: `components/actuators/*`
- Logic: `components/logic/*`
- MQTT/Logs: `components/mqtt/*`
- Dashboard Cards: `components/dashboard/*`
- Auth UI: `components/auth/*`
- Gemeinsame Bausteine: `components/common/*` (Buttons, Cards, Loader, Modals).

## Typen & Utilities
- `src/types/index.ts`: zentrale Interfaces (User, TokenResponse, MockESP, LogicRule, WebSocket message, etc.).
- `src/utils/`: Hilfsfunktionen (z.B. Formatierung); prüfen bei Bedarf.
- `src/assets/styles`, `src/style.css`: globale Styles/Tailwind.

## Auth/Token Flow (kurz)
1) Router-Guard ruft `authStore.checkAuthStatus()` → `/auth/status`.
2) Falls Setup nötig → `/setup`; sonst, bei Token vorhanden → `/auth/me`, ggf. Refresh.
3) Login/Setup speichern Tokens in LocalStorage und State.
4) Axios-Interceptor hängt Access-Token an; 401 → Refresh → Retry; bei Fehlschlag Logout.
5) Tokens löschen: `authStore.clearAuth()` oder Storage manuell leeren (siehe `Datenbanken.md`).

## Datenhaltung
- Frontend persistiert nur JWTs in LocalStorage (keine weitere DB). Details in `Datenbanken.md`.
- Laufzeitdaten (Lists, Telemetrie) werden aus Backend/Mock-API oder WebSocket (falls ergänzt) geladen und nicht dauerhaft gespeichert.

## Debug/Mock Flow
- `debugApi` spricht `/debug/mock-esp` Endpunkte des Backends an.
- Typen: `MockESP`, `MockSensorConfig`, `MockActuatorConfig`, `CommandResponse`.
- UI in `views/MockEsp*` + Komponenten unter `components/mock/` (falls vorhanden).

## Fehlerquellen / Troubleshooting
- 401-Refresh-Loop / „Not enough segments“ → Tokens korrupt → LocalStorage löschen / Inkognito.
- Setup hängt → Backend-DB nicht leer oder `/auth/status` liefert `setup_required=false`.
- 401 trotz Login → Backend neu starten + DB frisch erstellen (siehe Dev-Routine), dann Setup erneut.

## Nützliche Querverweise

### Frontend-spezifische Dokumentation
| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **Startup-Anleitung** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` | Server + Frontend starten, Architektur, Flows |
| **Bug-Dokumentation** | `El Frontend/Docs/Bugs_Found.md` | Alle gefundenen Bugs mit Workflows & Fixes |
| **API-Referenz** | `El Frontend/Docs/APIs.md` | REST-Endpunkte, Payloads, Response-Typen |
| **Auth-Flow** | `El Frontend/Docs/Admin oder user erstellen...md` | Token-Handling, Guards, Login/Setup |

### System-übergreifende Dokumentation
| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **Backend-Architektur** | `.claude/CLAUDE_SERVER.md` | Server API, MQTT-Handler, Database |
| **ESP32 Firmware** | `.claude/CLAUDE.md` | ESP32 Code, MQTT Topics, Error Codes |
| **MQTT Protokoll** | `El Trabajante/docs/Mqtt_Protocoll.md` | Topic-Schema, Payload-Struktur |