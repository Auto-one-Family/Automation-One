## Zweck
Schnell-Orientierung für KI-Agenten im Frontend (`El Frontend`, Vue 3 + TypeScript + Vite + Pinia + Tailwind). Ziel: sofort relevante Dateien finden, Flows verstehen, Bugs lokalisieren.

> **Letzte Aktualisierung (2025-12-24):** Zone Naming & Mock ESP Updates
> - **Zone Naming Konventionen:** `zone_id` (technisch) vs `zone_name` (menschenlesbar) klar getrennt
> - **Mock ESP DB-Integration:** Mock ESPs werden in Server-DB registriert und können normal aktualisiert werden
> - **ZoneAssignmentPanel:** Generiert automatisch `zone_id` aus `zone_name` (z.B. "Zelt 1" → "zelt_1")
> - **esp.ts updateDevice:** Mock ESPs nutzen jetzt die normale ESP API (nicht mehr blockiert)

---

## 0. Quick Reference - Was suche ich?

| Ich will... | Primäre Quelle | Code-Location |
|-------------|----------------|---------------|
| **Server + Frontend starten** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` Section 0 | - |
| **Bug debuggen** | `El Frontend/Docs/Bugs_Found.md` | Workflow + Fix dokumentiert |
| **API-Endpoint finden** | `El Frontend/Docs/APIs.md` | `src/api/` |
| **Zone zuweisen** | Section "Zone Naming" unten | `src/components/zones/ZoneAssignmentPanel.vue` |
| **ESP-Gerät updaten** | Section "Mock ESP Architektur" unten | `src/api/esp.ts` |
| **Audit-Logs verwalten** | `AuditLogView.vue` | `src/views/AuditLogView.vue` + `src/api/audit.ts` |
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
- Audit API: `src/api/audit.ts` (Audit Logs, Statistics, Retention Management).
- Debug API: `src/api/debug.ts` (Mock ESP CRUD, Heartbeats, Sensor/Actuator set, E-Stop, Message History).
- Typen für API: `src/types/index.ts` (Auth, MockESP, Logic, Audit, WebSocket, Responses).
- Siehe auch `El Frontend/Docs/APIs.md` für Endpoint-Tabelle.

## Routing & Guards
- Datei: `src/router/index.ts`
  - Routen: `/login`, `/setup`, geschützter Root `/` mit Kindern `dashboard`, `audit`, `mock-esp`, `mock-esp/:espId`, `mqtt-log`, `sensors`, `actuators`, `logic`, `settings`.
  - Meta: `requiresAuth`, `requiresAdmin`.
  - Guard-Flow: Wenn `setupRequired === null` → `checkAuthStatus()`; `setup_required` true → Redirect `/setup`; fehlende Auth → `/login?redirect=...`; fehlende Admin-Rolle → Dashboard.

## Views (Seiten)
- Auth: `views/LoginView.vue`, `views/SetupView.vue`.
- Dashboard: `views/DashboardView.vue`.
- Audit Logs: `views/AuditLogView.vue` (Audit Log Dashboard mit Retention-Konfiguration).
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
| **Audit-System** | Neu: `AuditLogView.vue` + `src/api/audit.ts` | Audit-Log-Dashboard mit Retention-Management |

### System-übergreifende Dokumentation
| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **Backend-Architektur** | `.claude/CLAUDE_SERVER.md` | Server API, MQTT-Handler, Database |
| **ESP32 Firmware** | `.claude/CLAUDE.md` | ESP32 Code, MQTT Topics, Error Codes |
| **MQTT Protokoll** | `El Trabajante/docs/Mqtt_Protocoll.md` | Topic-Schema, Payload-Struktur |

---

## Zone Naming Konventionen

### Zwei-Feld-System
Das System verwendet zwei Felder für Zonen:

| Feld | Typ | Beispiel | Verwendung |
|------|-----|----------|------------|
| `zone_id` | Technisch | `zelt_1`, `gewaechshaus_nord` | MQTT Topics, DB Keys, API URLs |
| `zone_name` | Menschenlesbar | `Zelt 1`, `Gewächshaus Nord` | UI-Anzeige, Benutzer-Eingabe |

### Automatische ID-Generierung
`ZoneAssignmentPanel.vue` generiert `zone_id` automatisch aus `zone_name`:

```typescript
// Beispiel: "Zelt 1" → "zelt_1"
function generateZoneId(zoneName: string): string {
  let zoneId = zoneName.toLowerCase()
  // Deutsche Umlaute ersetzen
  zoneId = zoneId.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  // Sonderzeichen durch Unterstriche ersetzen
  zoneId = zoneId.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return zoneId
}
```

### UI-Anzeige
- **Eingabefelder:** Nur `zone_name` (menschenfreundlich)
- **Anzeige:** `zone_name` mit `zone_id` als Tooltip
- **Server-Validierung:** `zone_id` darf nur `[a-z0-9_-]` enthalten

### Relevante Dateien
| Datei | Funktion |
|-------|----------|
| `src/components/zones/ZoneAssignmentPanel.vue` | Zone-Zuweisung mit ID-Generierung |
| `src/views/DeviceDetailView.vue` | Zone-Anzeige in Geräte-Details |
| `src/views/DevicesView.vue` | Zone-Eingabe bei ESP-Erstellung |
| `src/api/zones.ts` | Zone API (assignZone, removeZone) |

---

## Mock ESP Architektur

### Dual-Storage-Prinzip
Mock ESPs existieren an **zwei Orten**:

```
Mock ESP erstellen (POST /v1/debug/mock-esp)
        │
        ├── MockESPManager (In-Memory)
        │   └── Live-Simulation: Sensoren, Aktoren, State Machine
        │
        └── ESPRepository (PostgreSQL)
            └── Persistenz: Zone, Name, Metadata, Status
```

### API-Routing
| Operation | Endpoint | Beschreibung |
|-----------|----------|--------------|
| **Create** | `POST /v1/debug/mock-esp` | Erstellt in Memory + DB |
| **Read** | `GET /v1/debug/mock-esp/{id}` | Liest aus Memory (Live-Daten) |
| **Update** | `PATCH /v1/esp/devices/{id}` | Aktualisiert in DB (normale ESP API!) |
| **Delete** | `DELETE /v1/debug/mock-esp/{id}` | Löscht aus Memory + DB |
| **Zone** | `POST /v1/zone/devices/{id}/assign` | Zone-Zuweisung via DB |

### Wichtig: Updates über normale API
Mock ESPs können über die **normale** `/esp/devices/{id}` API aktualisiert werden:

```typescript
// esp.ts - updateDevice() funktioniert für Mock UND Real ESPs
async updateDevice(espId: string, update: ESPDeviceUpdate): Promise<ESPDevice> {
  // Beide Typen nutzen dieselbe DB-API
  const response = await api.patch<ESPDevice>(`/esp/devices/${normalizedId}`, update)
  return response.data
}
```

### Fallback bei Server-Neustart
Wenn der Server neu startet, ist der In-Memory Store leer, aber die DB-Einträge bleiben. Das Frontend behandelt diesen Fall:

```typescript
// esp.ts - 404 Fallback für Mock ESPs
if (axiosError.response?.status === 404 && isMockEsp(normalizedId)) {
  // Versuche Debug-Store als Fallback
  const current = await debugApi.getMockEsp(normalizedId)
  return { ...current, metadata: { db_sync_required: true } }
}
```

### Relevante Dateien
| Datei | Funktion |
|-------|----------|
| `src/api/esp.ts` | Unified ESP API (Mock + Real) |
| `src/api/debug.ts` | Debug-spezifische API (Heartbeat, Sensors, Actuators) |
| `src/stores/esp.ts` | ESP Pinia Store |
| `src/views/DeviceDetailView.vue` | Geräte-Detailansicht |