# Frontend Code-Analyse — Lauf-1 (2026-04-21)

**Erstellt:** 2026-04-21
**Modus:** B (Spezifisch: Livetest Dresden AUT-108 — Sensor-Latenz, Aktor-Antwortzeit, LWT-Reconnect, Auth-Token-401)
**Quellen analysiert:**
- `El Frontend/src/stores/esp.ts` (handleEspHealth, handleSensorData, handleActuatorStatus, initWebSocket)
- `El Frontend/src/stores/esp-websocket-subscription.ts` (Subscription-Kontrakt)
- `El Frontend/src/shared/stores/sensor.store.ts` (handleSensorData, Matching-Logik)
- `El Frontend/src/shared/stores/actuator.store.ts` (Command-Lifecycle, Timeouts)
- `El Frontend/src/services/websocket.ts` (Reconnect, Token-Refresh, Rate-Limiting)
- `El Frontend/src/api/index.ts` (Axios Interceptor, Token-Refresh-Queue)
- `El Frontend/src/shared/stores/auth.store.ts` (refreshTokens, Token-Keys)
- `El Frontend/src/composables/useConfigResponse.ts` (Config-Response-Handler)
- Git-Diff `2fd679a0` (fix: soften config response timeout handling after reconnect)

---

## 1. WebSocket Sensor-Data Pipeline (Fokus A — Sensor-Latenz)

### Pfad eines `sensor_data`-Events

```
MQTT → Server (sensor_handler.py) → WS broadcast
  → websocket.ts handleMessage() → routeMessage()
  → esp.ts ws.on('sensor_data') → handleSensorData()
  → sensor.store.ts handleSensorData()
  → applyDevicePatch() → devices.value[i] = { ...device, sensors }
  → Vue Reactivity → Component re-render
```

### Kein Batching / kein Debouncing

Das Frontend verarbeitet jeden `sensor_data`-Event **synchron und sofort** beim Eintreffen:

- `handleMessage()` → JSON.parse → `routeMessage()` → callback — keine Queue, kein Timer
- `applyDevicePatch()` ersetzt das Device-Objekt direkt (`devices.value[index] = newDevice`)
- Kein `requestAnimationFrame`, kein `nextTick`-Delay, kein `throttle`/`debounce`

**Frontend ist kein Latenz-Faktor** in der 2s-End-to-End-Kette. Die Latenz liegt ausschliesslich in den vorgelagerten Schichten: ESP32-Messintervall, MQTT-Broker-Round-Trip, Server-Handler-Verarbeitungszeit.

### Rate-Limit-Warning (potenzielle Auffaelligkeit)

Der WebSocket-Service loggt eine Warnung wenn mehr als 10 Nachrichten/Sekunde eintreffen (`checkRateLimit()`). **Das Rate-Limiting ist nur ein Log-Warning — kein Drop, keine Verzögerung**. Bei vielen Sensoren (z. B. mehrere ESP32 parallel) könnte dieses Warning im Docker-Log auftreten, ist aber nicht latenzrelevant.

### Sensor-Matching-Logik

Priorität: `config_id` (exakt) → `i2c_address`/`onewire_address` (adressbasiert) → `gpio + sensor_type` (Legacy). Die Logik ist korrekt und ohne Performance-Bottleneck.

### Stale-Guard

`sensor.store.ts` ignoriert `sensor_data`-Events, deren Timestamp vor dem `offlineInfo.timestamp` liegt — verhindert Phantom-Werte nach Reconnect. Korrekte Implementierung.

---

## 2. Actuator-Command Flow (Fokus B — Aktor-Antwortzeit)

### Command-Pfad (Real ESP)

```
UI Button → esp.ts sendActuatorCommand()
  → actuatorsApi.sendCommand() (POST /api/v1/actuators/{esp_id}/{gpio}/command)
  → REST Response mit correlation_id
  → actStore.registerCommandIntent() + scheduleActuatorTimeout(30s)
  → Toast: "Befehl akzeptiert"

Server → WS: actuator_command → handleActuatorCommand()
  → Toast: "Befehl in Bearbeitung"
  → scheduleActuatorTimeout() (erneuert den 30s Timer)

ESP32 → MQTT → Server → WS: actuator_response → handleActuatorResponse()
  → clearTimeout(pendingTimeout)
  → finalizeIntent(outcome: 'success'/'failed')
  → Toast: "Befehl bestätigt" / "Befehl fehlgeschlagen"
```

Alternativ kann der Intent auch via `actuator_status` terminiert werden, wenn dieser zuerst eintrifft und mit dem erwarteten State übereinstimmt.

### Timeout-Handling

| Timeout-Art | Wert | Verhalten |
|-------------|------|-----------|
| `ACTUATOR_RESPONSE_TIMEOUT_MS` | 30.000 ms | Persistent Toast: "Timeout - keine terminale Rueckmeldung" |
| `CONFIG_RESPONSE_TIMEOUT_MS` | 75.000 ms | Non-persistent Toast: "Konfigurationsauftrag ausstehend" |
| `CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS` | 120.000 ms | Gilt wenn `config_keys` includes `'offline_rules'` |

Das 30s-Actuator-Timeout ist **angemessen** für MQTT-Hin-und-Rück-Latenz. Kein Frontend-seitiger Engpass identifiziert.

### Correlation-ID-Tracking

Die `correlation_id` aus der REST-Response wird durch den gesamten WS-Intent-Lifecycle mitgeführt. Duplicate-Suppression via `_retry`-Flag im Axios-Interceptor. Korrektes Design.

### Stale-Actuator-Guard

`actuatorResetEpochMsByKey` verhindert, dass verspätete `actuator_status`-Events nach einem Offline-Reset den Zustand falsch setzen. Korrekt implementiert in `handleActuatorStatus()`.

---

## 3. Reconnect & Offline-Handling (Fokus C — LWT)

### Reconnect-Strategie

Der WebSocket-Service implementiert exponentielles Backoff:
- Basis: 1000 ms, Faktor: 2^n, Deckel: 30.000 ms, max. 10 Versuche
- Jitter: ±10 % zur Thundering-Herd-Vermeidung
- Page-Visibility-API: Tab-Switch löst Reconnect aus (mit partial Backoff-Reset)

Nach 10 fehlgeschlagenen Versuchen wechselt der Status auf `'error'` — **kein automatischer Neuversuch mehr** (der User muss die Seite neu laden). Dies ist sinnvoll, schafft aber ein Risiko bei langem Netzwerkausfall.

### Offline-Status im UI

LWT-Events vom Server werden korrekt verarbeitet:

1. `esp_health` mit `source='lwt'` → `recordDisconnect(espId)` (Flapping-Detection)
2. `offlineInfo = { reason: 'lwt', displayText: 'Verbindung verloren', timestamp }`
3. `device.connected = false`, `device.status = 'offline'`
4. Toast: `"${device.name}: Verbindung unerwartet verloren"` (5s, non-persistent)
5. Actuator-States werden auf `false`/idle zurückgesetzt wenn `actuator_states_reset > 0`

Der Offline-Status ist **vollständig im Pinia-Store** (`esp.store.devices[].offlineInfo`) und korrekt reaktiv.

### Was der Commit `2fd679a0` geändert hat (fix: soften config response timeout)

Drei Änderungen in `actuator.store.ts`:

| Änderung | Vorher | Nachher | Grund |
|----------|--------|---------|-------|
| `CONFIG_RESPONSE_TIMEOUT_MS` | 45.000 ms | 75.000 ms | Heartbeat-Periode > Timeout verhindern — bei langsamen ESP/MQTT kamen config_responses nach 45s Timeout an → false persistent failures |
| Config-Timeout-Toast | `persistent: true` | `persistent: false` | Operator sah stuck Toast auch wenn Gerät dann doch antwortete |
| `handleConfigResponse` contract-check | Fehler bei nicht-finalisierbarer Shape | Silentes `logger.warn` + return bei `status=success/partial_success` | Nach Reconnect kommen ggf. replayed config_responses ohne passenden Intent-Eintrag (intent wurde durch Reconnect nicht transferiert) |

**Bewertung:** Die Änderungen sind ein korrekter Hotfix für das Reconnect-Szenario. Der erhöhte Timeout (75s) kann bei langen Sessions zu langer Pending-Anzeige führen, ist aber notwendig für ESP32-Hardware mit träger MQTT-Verbindung.

### Bekannte Lücke: Intent-State überlebt keinen WS-Reconnect

Nach einem WebSocket-Disconnect bleiben `pendingCommands` und `pendingConfigTimeouts` im Actuator-Store erhalten (In-Memory-Map). Nach Reconnect können WS-Events (config_response, actuator_response) für bereits-gestartete, aber noch laufende Intents ankommen — dieser Fall wird durch den `2fd679a0`-Fix defensiv abgefangen (late response ohne Intent-Eintrag wird ignoriert statt als Fehler gemeldet).

**Was nicht abgefangen wird:** Wenn ein ESP32 einen Command bestätigt hat (MQTT-level), der Client aber während der Verarbeitung die WS-Verbindung verloren hat, sieht das Frontend keinen `actuator_response` — der 30s-Timeout-Toast erscheint obwohl der Command erfolgreich war. Dies ist ein bekanntes Blind-Spot bei allen WS-basierten Command-ACK-Patterns ohne Server-seitige Persistenz.

---

## 4. Auth-Token-Refresh

### Implementierung

- **Tokens:** `el_frontend_access_token` / `el_frontend_refresh_token` in `localStorage`
- **Request-Interceptor:** Hängt Bearer-Token an jeden Request
- **Response-Interceptor (401-Handler):**
  - Queue-Mechanismus: Nur **ein** Refresh-Call für N parallele 401-Responses (korrekt)
  - Guard gegen Infinite-Loop: `_retry`-Flag + Skip für `/auth/refresh`, `/auth/login`, `/auth/status`
  - Refresh fehlgeschlagen → `clearAuth()` + Redirect zu `/login`
- **WS-Reconnect:** `refreshTokenIfNeeded()` prüft JWT-Expiry (60s Buffer) vor jedem Reconnect-Versuch

### Bezug zum 401 im Server-Log (07:39:19Z)

Das beobachtete 401 im Server-Log entsteht vermutlich **vor** dem Token-Refresh greift, weil:

1. Ein Request an den Server geht mit abgelaufenem Token (z. B. nach langem Tab-Hintergrund)
2. Server antwortet 401
3. Interceptor fängt ab, setzt `_retry = true`, startet Refresh
4. Refresh-Request erhält neues Token-Paar
5. Original-Request wird mit neuem Token wiederholt

Das 401 selbst ist im Server-Log **erwartet und normal** — der Client recover automatisch. Besorgniserregend wäre nur, wenn mehrere 401-Logs hintereinander für **denselben** Request-Pfad erscheinen (deutet auf Refresh-Loop hin).

**Prüfpunkt:** Gibt es im Server-Log `POST /api/v1/auth/refresh` kurz nach dem 401? Wenn ja, ist der Flow korrekt. Wenn das 401 wiederholt ohne Refresh auftritt, liegt eine Token-Persistenz-Lücke vor.

**Potenzielle Schwäche:** `authStore.refreshTokens()` ruft nach dem Token-Refresh zusätzlich `authApi.me()` auf. Das bedeutet **2 API-Calls** pro Refresh-Zyklus. Bei gleichzeitig vielen parallelen 401-Requests (z. B. Dashboard-Load mit 5+ API-Calls gleichzeitig) kann das zu kurzem Stall führen, bis die Queue abgearbeitet ist.

---

## 5. Extended Checks

| Check | Ergebnis |
|-------|----------|
| Docker-Container-Status | Nicht geprüft (Livetest-Szenario) |
| Server-Health | Nicht geprüft (kein aktuell laufender Stack) |
| Source-Code Type-Workarounds | `handleEspHealth` hat `message: any` — Schwere: Niedrig (intern, nicht User-facing) |
| Reconnect-Max-Attempts | 10 Versuche, dann `status='error'`, kein Auto-Retry mehr |

---

## 6. Blind-Spot-Fragen (an User)

Die folgenden Fragen können nur im Browser oder anhand von Logs beantwortet werden:

1. **401-Analyse:** Im Server-Log um 07:39:19Z — erscheint kurz danach ein `POST /api/v1/auth/refresh`? Falls ja: normaler Refresh. Falls nein: Token wurde nicht gespeichert oder Refresh-Token war bereits abgelaufen.

2. **WS-Reconnect sichtbar?** Gab es während des Tests eine Phase, in der der WebSocket neu verbunden hat (sichtbar als "Verbindung verloren"-Toast oder Lücke in Live-Daten)?

3. **Config-Timeout-Toast:** Erschien im UI ein gelber Non-Persistent-Toast "Konfigurationsauftrag ausstehend..."? Das wäre ein Hinweis, dass ESP32 > 75s für config_response benötigte.

4. **Actuator-Timeout-Toast:** Erschien ein roter Persistent-Toast "Timeout - keine terminale Rueckmeldung"? Das deutet auf MQTT-Delivery-Failure oder zu hohe Latenz (>30s) hin.

5. **Browser-Console:** Gibt es `[WebSocket]`-Logs die einen Disconnect/Reconnect-Zyklus zeigen? Format: `WebSocket Disconnected { code, reason }` gefolgt von `Scheduling reconnect attempt N/10`.

---

## 7. Bewertung & Empfehlungen für TASK-PACKAGES

### Befunde nach Schwere

| Befund | Schwere | Bereich |
|--------|---------|---------|
| Kein Batching/Debouncing — Frontend trägt 0 zur 2s-Latenz bei | Info | Fokus A |
| Rate-Limit-Warning bei >10 WS-Msg/s — nur Log, kein Drop | Niedrig | Fokus A |
| `handleEspHealth` hat `message: any`-Typ | Niedrig | Codequalität |
| Config-Intent überlebt keinen Reconnect (late responses werden ignoriert statt terminiert) | Mittel | Fokus C |
| Nach 10 Reconnect-Versuchen kein automatischer Neustart — User muss Page reloaden | Mittel | Fokus C |
| Actuator-Command-ACK geht verloren wenn WS während ESP-Bestätigung trennt (false Timeout-Toast) | Mittel | Fokus B |
| 2 API-Calls pro Token-Refresh (token + /me) bei parallelen 401s | Niedrig | Auth |

### Root Cause für die 2s-Latenz (Fokus A)

Das Frontend ist **nicht die Ursache**. Zu untersuchende Schichten in absteigender Wahrscheinlichkeit:
1. ESP32-Mess- und Publish-Intervall (prüfen: Serial-Log, `sensor_interval_ms`)
2. MQTT-Broker-Round-Trip (prüfen: MQTT-Debug-Log, Broker-Queue)
3. Server-Handler-Verarbeitungszeit (prüfen: Server-Log Timestamps von MQTT-Receive bis WS-Broadcast)

### Empfehlungen für TASK-PACKAGES

**TP-FRONTEND-1 (Mittel):** Config-Intent-Resurrect nach WS-Reconnect. Nach erfolgreicher Reconnection könnten noch laufende Config-Intents via REST-Endpoint abgefragt werden (`GET /api/v1/esp/{id}/config`) um den Intent-State zu synchronisieren. Alternativ: Server-seitiges Replay bei WS-Connect.

**TP-FRONTEND-2 (Niedrig):** Page-Reload-Empfehlung nach WS-Error-State. Wenn `status='error'` (10 Reconnects erschöpft), sollte ein Banner mit Reload-Button erscheinen statt stiller Error-State.

**TP-FRONTEND-3 (Niedrig):** `handleEspHealth` typisieren (entfernt `message: any`). Nutze die normalisierte `WebSocketMessage`-Schnittstelle aus `websocket.ts`.

**TP-FRONTEND-4 (Niedrig):** Auth-Refresh-Call optimieren — `authApi.me()` innerhalb `refreshTokens()` als separaten Schritt lazy oder parallel ausführen, damit die Queue nicht blockiert wird.
