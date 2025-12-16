# El Frontend – Debug Architecture & Flows

Ziel: Das Debug-Dashboard soll ohne echte ESP32‑Hardware die gleichen Flows wie das Produktions-Frontend fahren. Diese Doku fasst die für Entwickler relevanten Pfade, Zustände und Integrationspunkte zusammen, damit Änderungen minimal bleiben und Tests (inkl. Lastszenarien mit vielen ESPs/Sensoren/Aktoren) reproduzierbar sind.

---

## 0) KI-Agenten: Server & Frontend starten

> **WICHTIG:** Diese Section ist für KI-Agenten gedacht, die das System entwickeln oder debuggen.

### 0.1) Voraussetzungen prüfen

```bash
# Working Directory muss Auto-one sein
pwd
# → c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one

# Poetry muss installiert sein (für Server)
poetry --version

# Node.js muss installiert sein (für Frontend)
node --version
npm --version
```

### 0.2) Server starten (God-Kaiser Backend)

```bash
# Terminal 1: Server starten
cd "El Servador/god_kaiser_server"
poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

**Erwartete Ausgabe:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Application startup complete.
```

**Server-Verifizierung:**
```bash
# Health-Check (sollte 200 OK zurückgeben)
curl http://localhost:8000/health

# Auth-Status prüfen (zeigt ob Setup nötig ist)
curl http://localhost:8000/api/v1/auth/status
```

### 0.3) Frontend starten (Vue 3 Dev Server)

```bash
# Terminal 2: Frontend starten
cd "El Frontend"
npm run dev
```

**Erwartete Ausgabe:**
```
VITE v5.x.x  ready in XXX ms

➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

### 0.4) System-Status nach Start

| Service | URL | Status-Check |
|---------|-----|--------------|
| Backend API | `http://localhost:8000` | `curl http://localhost:8000/health` |
| Frontend | `http://localhost:5173` | Browser öffnen |
| API Docs | `http://localhost:8000/docs` | Swagger UI |

### 0.5) Erster Login / Setup

1. **Browser öffnen:** `http://localhost:5173`
2. **Wenn Setup nötig:** Admin-Account erstellen (username, password, email)
3. **Wenn bereits eingerichtet:** Mit Admin-Credentials einloggen
4. **Nach Login:** Dashboard sollte erscheinen

### 0.6) Häufige Startprobleme

| Problem | Ursache | Lösung |
|---------|---------|--------|
| `EADDRINUSE :8000` | Server läuft bereits | `netstat -ano | findstr :8000` → PID killen |
| `EADDRINUSE :5173` | Frontend läuft bereits | `netstat -ano | findstr :5173` → PID killen |
| `ModuleNotFoundError` | Dependencies fehlen | `poetry install` im Server-Ordner |
| `npm ERR!` | Node modules fehlen | `npm install` im Frontend-Ordner |
| `401 Unauthorized` (Endlos-Loop) | Token abgelaufen, kein Refresh | Siehe `Bugs_Found.md` Bug #1 Pattern |
| `404 Not Found` auf API | Router-Prefix falsch | Prüfe `main.py` + Router Prefixes |

### 0.7) Beide Services gleichzeitig (Background)

Für KI-Agenten die beide Services im Hintergrund laufen lassen wollen:

```bash
# Server im Hintergrund (mit Bash Tool, run_in_background=true)
cd "El Servador/god_kaiser_server" && poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Frontend im Hintergrund (mit Bash Tool, run_in_background=true)
cd "El Frontend" && npm run dev
```

**Output prüfen:** Mit `BashOutput` Tool den Status der Background-Tasks abrufen.

### 0.8) Mosquitto MQTT Broker (Optional)

Für echte MQTT-Funktionalität (nicht nur Mock):

```bash
# Windows (Chocolatey)
choco install mosquitto

# Oder manuell von https://mosquitto.org/download/

# Broker starten
mosquitto -v
```

**Konfiguration in `.env`:**
```
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883
```

---

## 1) Architektur-Überblick
- **Vue 3 + Pinia + Vite + TypeScript** – State in Pinia, Routing via `vue-router`.
- **Axios mit JWT-Interceptor** – Refresh bei 401, Retry des Original-Requests; Logout & Redirect bei fehlgeschlagenem Refresh.
- **REST**: Proxy `/api` → `http://localhost:8000/api/v1`. Vollständige API-Abdeckung (Auth, Debug, Database, Logs, Users, Config, LoadTest).
- **WebSocket**: Proxy `/ws` → `ws://localhost:8000`. MQTT-Log über `/ws/realtime/{client_id}?token=...`.
- **Styling**: Tailwind CSS Dark Theme, Utility-Klassen in `src/style.css`.

## 2) Auth Flow (Frontend ↔ Server)
- Initial: `authStore.checkAuthStatus()` prüft `/auth/status` → entscheidet `/setup` vs. `/login`.
- Login/Setup: `authApi.login/setup` speichern `access_token` + `refresh_token` in `localStorage`, anschließend `authApi.me` für User-Daten.
- Axios-Interceptor: hängt `Authorization: Bearer <access>` an; bei 401 → `refreshTokens()` → wiederholt Request; sonst Logout + Redirect `/login`.
- Router-Guards: `requiresAuth` und `requiresAdmin` setzen Navigation durch; Setup-Zwang vor Login.

## 3) Debug REST Flows (Mock ESP)
Alle Aufrufe sind in `src/api/debug.ts` typisiert; State in `src/stores/mockEsp.ts` wird nach jeder Mutation per `getMockEsp` aktualisiert (Single Source of Truth = Server).

- **Mock ESP CRUD**: `createMockEsp`, `listMockEsps`, `getMockEsp`, `deleteMockEsp`.
- **Heartbeat & State**: `triggerHeartbeat`, `setState`, `setAutoHeartbeat`.
- **Sensoren**: `addSensor`, `setSensorValue`, `setBatchSensorValues`.
- **Aktoren**: `addActuator`, `setActuatorState`.
- **Safety**: `emergencyStop`, `clearEmergency`.
- **History**: `getMessages`, `clearMessages` (MQTT-Verlauf pro ESP).

UI-Abbildung:
- **MockEspView**: Create/Refresh/Delete/State-Toggle/Heartbeat, Grid-Übersicht, Admin-only Route.
- **MockEspDetailView**: Herzstück für Einzel-ESP – Safe Mode Toggle, Emergency Stop/Clear, Sensorwerte editieren, Aktoren toggeln, Sensor/Aktor hinzufügen.
- **SensorsView / ActuatorsView**: Aggregierte Listen über alle ESPs; ActuatorsView bietet globalen Emergency Stop über alle Geräte.

## 4) MQTT Live Log (WebSocket)
- Einstieg: `src/views/MqttLogView.vue` öffnet WS gegen `/ws/realtime/{client_id}?token=<jwt>`.
- Nach `onopen`: `subscribe`-Message mit allen `MessageType`-Filtern.
- Eingehende Nachrichten werden gepuffert (max 500, neu oben), Pausen-Toggle stoppt nur UI-Verarbeitung.
- **Token-Robustheit**: Vor Connect wird `ensureAuthToken()` aufgerufen → nutzt frischen Access-Token oder `refreshTokens()`; bei Fehlschlag Logout+Redirect. Reconnect nach Close (3s) holt erneut ein gültiges Token.

## 5) Typen & States (Kanonisch)
- Zentral in `src/types/index.ts`: `MockSystemState`, `MockSensor`, `MockActuator`, `MqttMessage`, `LogicRule` (für spätere Logic-Engine), Qualitätsstufen, API-Response-Typen.
- Frontend nutzt diese Typen in API-Layern und Stores, um Server-Schema 1:1 abzubilden.

## 6) Last- & Cross-Device-Tests
- Viele ESPs/Sensoren/Aktoren können über `MockEspView` erzeugt werden; Batch-Sensor-Set (`setBatchSensorValues`) erlaubt schnelle Simulation hoher Frequenz.
- MQTT-Log skaliert in der UI bis 500 Einträge; für längere Sessions ggf. filterbasiert einschränken (MessageType/ESP/Topic).
- Notfall: Globaler E-Stop über ActuatorsView (`emergencyStopAll` via Store-Schleife) hält Konsistenz mit Backend-Safety-Pfaden.

## 7) Logic Engine (Stand & TODO)
- `LogicView.vue` ist bewusst ein Placeholder; bereit für Anbindung an künftige `/v1/logic` Endpunkte.
- Typen (`LogicRule`, `LogicCondition`, `LogicAction`, `LogicExecution`) sind vorbereitet, damit spätere REST/WS-Integration minimalen Umbau erfordert.

## 8) Bekannte Grenzen / nächste sinnvolle Schritte
- WS: Aktuell kein gestaffelter Backoff oder Topic-basierte Re-Subscriptions nach Filterwechsel (wird clientseitig initial gesetzt). Bei Bedarf Re-Subscribe-UI hinzufügen.
- LogicView: Kein CRUD/UI; sobald Server-API stabil, Routen/Store/API-Module ergänzen und gleiche Auth/Refresh-Mechanik wiederverwenden.
- Charts: `chart.js`/`vue-chartjs` sind installiert, aber ungenutzt. Eignen sich für KPI/Trend-Visualisierung (z. B. Sensorverläufe).

## 9) Verknüpfte Referenzen
- Server API & MQTT: `../.claude/CLAUDE_SERVER.md`
- ESP32 Firmware: `../.claude/CLAUDE.md`
- MQTT Protokoll: `../El Trabajante/docs/Mqtt_Protocoll.md`


