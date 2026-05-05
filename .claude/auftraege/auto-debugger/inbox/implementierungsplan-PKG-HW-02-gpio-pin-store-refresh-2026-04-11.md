# Implementierungsplan — PKG-HW-02 GPIO / Store / „PIN belegt“

**Datum:** 2026-04-11  
**Branch (Pflicht):** `auto-debugger/work` (keine Commits auf `master`)  
**Bezug:** Paket **PKG-HW-02** aus `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/TASK-PACKAGES.md` und Analyse `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`.

---

## 1. IST — aktueller Ablauf „Sensor löschen → UI GPIO / PIN belegt“

### 1.1 Löschpfad (REST)

- **UI:** `El Frontend/src/components/esp/SensorConfigPanel.vue` — `confirmAndDelete()` ruft bei vorhandener `configId` `sensorsApi.delete(espId, configId)` auf (`El Frontend/src/api/sensors.ts`, `DELETE /sensors/{esp_id}/{config_id}`).
- **Nach erfolgreichem Delete:** `emit('deleted')` — Parent schließt Panel und lädt Gerät neu (siehe unten).

### 1.2 WebSocket `sensor_config_deleted` (verifiziert)

- **Dokumentation:** `.claude/reference/api/WEBSOCKET_EVENTS.md` §**4.3 sensor_config_deleted** — Top-Level `type: "sensor_config_deleted"`, `data`: **`config_id`**, **`esp_id`**, **`gpio`**, **`sensor_type`** (Beispielpayload im Doc).
- **Handler:** `El Frontend/src/stores/esp.ts` — `handleSensorConfigDeleted` entfernt Einträge aus `device.sensors`, wenn **`s.gpio === data.gpio && s.sensor_type === data.sensor_type`** (strikt stringgleich). Registrierung in `initWebSocket()` via `ws.on('sensor_config_deleted', handleSensorConfigDeleted)`.
- **Filter-Pipeline:** `El Frontend/src/stores/esp-websocket-subscription.ts` — `sensor_config_deleted` ist in `ESP_STORE_WS_ON_HANDLER_TYPES` / Mutation-Contract **`patch`** enthalten (Message wird nicht verworfen).

### 1.3 Zwei getrennte „GPIO-Wahrheiten“ im Frontend

| Quelle | Pfad | Wirkung im UI |
|--------|------|----------------|
| **Geräte-Sensorliste** | `props.device.sensors` (z. B. in `El Frontend/src/components/esp/ESPConfigPanel.vue`, computed `pinUsage`) | Tabelle „GPIO-Belegung“ im ESP-Konfig-Panel — folgt Pinia-`devices` nach Patch durch `handleSensorConfigDeleted` oder `fetchDevice`. |
| **Validierung „PIN belegt“** | `El Frontend/src/composables/useGpioStatus.ts` → `espStore.getGpioStatusForEsp` / `getReservedGpios` → **`useGpioStore`** (`El Frontend/src/shared/stores/gpio.store.ts`) | Meldungen wie *„GPIO X ist bereits belegt von Sensor: …“* (`validateGpio` / `validateGpioForSensor`). Daten kommen primär von **`espApi.getGpioStatus(espId)`** (REST), ggf. angereichert durch `updateGpioStatusFromHeartbeat` (Merge mit `esp_reported`). |

### 1.4 Refresh-Lücke nach Delete (Hypothese → Umsetzungshebel)

- **Parent nach Delete:** `El Frontend/src/views/HardwareView.vue` — `@deleted` auf `SensorConfigPanel` ruft **`espStore.fetchDevice(espId)`** auf, **nicht** `espStore.fetchGpioStatus(espId)`:

```1184:1185:El Frontend/src/views/HardwareView.vue
        @deleted="closeSensorConfigPanel(); espStore.fetchDevice(configSensorData!.espId)"
        @saved="closeSensorConfigPanel(); espStore.fetchDevice(configSensorData!.espId)"
```
- **Nach Neuanlage** existiert dagegen bereits das Muster **`fetchDevice` + `fetchGpioStatus`** (z. B. `El Frontend/src/components/esp/ESPOrbitalLayout.vue` bei `@added`).
- **Folge:** `device.sensors` kann per WS korrekt shrinken, **`gpioStatusMap`** bleibt aber bis zum nächsten expliziten `fetchGpioStatus` / Modal-Öffnen / Mount von `useGpioStatus` mit leerem Cache **veraltet** → Nutzer sieht weiterhin „GPIO belegt“ in Formularen, obwohl die Konfiguration in der DB schon weg ist.

### 1.5 Risiko / Annahmen (kurz)

- Wenn **`sensor_type`** im WS-Payload und in `device.sensors` **nicht exakt** übereinstimmen (Casing/Alias), entfernt `handleSensorConfigDeleted` den Eintrag nicht → Ghost in `pinUsage` **zusätzlich** zur GPIO-Store-Lücke. Das ist eher **Frontend-Robustheit**; ein REST-Response-Bug der GPIO-API wäre **PKG-HW-01** (Backend/Contract).

---

## 2. SOLL — Zielbild

1. **Kein falscher „PIN belegt“-Zustand** nach erfolgreichem Sensor-Delete und nach erfolgreicher Neukonfiguration auf dem **gleichen** GPIO: `gpioStatusMap` und `device.sensors` sollen **konsistent** zur Server-Wahrheit sein.
2. **Realtime:** Sobald `sensor_config_deleted` verarbeitet wird, soll die GPIO-Ansicht für betroffene ESPs **zuverlässig** aktualisiert werden (mindestens **ein** autoritativer Refresh der GPIO-Status-REST-Daten für `esp_id`).
3. **Vue-/Projektregeln:** weiterhin Vue 3 **`<script setup lang="ts">`**, API nur über `src/api/`, Tailwind + Design-Tokens (`.cursor/rules/frontend.mdc`). **Neue** WS-Subscriptions in Komponenten nur mit **`onUnmounted`-Cleanup** — im bevorzugten Ansatz bleibt die Logik im **bestehenden** `esp`-Store zentral (bereits `cleanupWebSocket()` vorhanden), statt parallele Listener in Views zu streuen.

---

## 3. Schritte (nummeriert, Implementierung)

1. **GPIO-Store nach Delete refreshen (Kernfix)**  
   - In `handleSensorConfigDeleted` (oder unmittelbar danach in derselben Store-Datei) **`fetchGpioStatus(data.esp_id)`** aufrufen (bereits an `espStore` exportiert, siehe `esp.ts` Re-Export von `gpioStore.fetchGpioStatus`).  
   - **Debounce optional:** falls Angst vor Doppel-Requests bei Burst-Events, kurz dokumentieren oder ein ESP-id-gestütztes „single flight“ analog zu `gpio.store.ts` `fetchGpioStatus` (bereits Loading-Guard).

2. **HardwareView `@deleted` (optional, UX)**  
   - Zusätzlich **`fetchGpioStatus(espId)`** neben `fetchDevice` — reduziert Latenz, falls WS verzögert; vermeidet doppelte Last, wenn Schritt 1 ohnehin bei jedem WS feuert (dann entweder **nur WS** oder **nur View**, nicht unkoordiniert doppelt ohne Konzept).

3. **Robustheit Ghost-Removal (optional, klein)**  
   - Abgleich `sensor_type` **case-insensitive** oder nach **canonical** Typ, **oder** wenn `data.config_id` gesetzt: Eintrag in `device.sensors` suchen, der **`id` / `config_id`** passt, und entfernen (Felder im `MockSensor`/API-Typ aus `El Frontend/src/types` / `api/esp` prüfen).  
   - **Payload-Felder** strikt an `WEBSOCKET_EVENTS.md` §4.3 halten.

4. **Aktor-Spiegel (falls im gleichen PR sinnvoll)**  
   - `handleActuatorConfigDeleted` analog prüfen: bei Bedarf **`fetchGpioStatus`** für symmetrisches Verhalten (kleiner Zusatz, gleiche User-Erwartung).

5. **Keine neuen parallelen Notification-Ketten**  
   - Weiterhin Toast nur im bestehenden Handler-Stil; **keine** Vermischung mit ISA-Inbox (`frontend.mdc` / auto-debugger-Pattern).

---

## 4. Tests

| # | Datei / Ort | Inhalt (minimal) |
|---|-------------|------------------|
| 1 | `El Frontend/tests/unit/stores/esp.test.ts` | Erweitern oder neue `describe`: bei simuliertem WS-Message `sensor_config_deleted` wird **`fetchGpioStatus`** (Mock) mit **`esp_id`** aus Payload aufgerufen **oder** GPIO-Map-Update nachvollziehbar. |
| 2 | Optional | `El Frontend/tests/unit/stores/esp-websocket-subscription.test.ts` — bleibt Contract-Liste; nur anfassen, wenn neue WS-Typen dazukommen (hier nicht erwartet). |
| 3 | Komponente | Falls `@deleted` in `HardwareView` erweitert wird: bestehndes Testmuster für HardwareView suchen (`Glob` `HardwareView*.test.ts`); wenn **kein** Test existiert, **nicht** großflächig neue Suite — Priorität **Store-Test**. |

---

## 5. Verify (PowerShell-kompatibel, vollständige Befehle)

Aus TASK-PACKAGES PKG-HW-02 (Repo-IST), mit Repo-Root in einer Variablen:

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run --passWithNoTests
```

Optional nach Änderungen an gebündelten Views:

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vite build
```

---

## 6. Abgrenzung / Abhängigkeit PKG-HW-01

- **Kein** Backend-Transaktions-Redesign in diesem Paket.
- **Unterabschnitt API-Bug:** Wenn **`GET …/gpio-status`** nach erfolgreichem `DELETE` weiterhin einen gelöschten Sensor in **`reserved`** (`source: database`) liefert, ist das ein **Server-/Cache-Bug** → **PKG-HW-01** oder dediziertes Backend-Ticket; Frontend kann dann maximal **Workaround** (harter Refetch + Evidenz) liefern, aber keine „Scheinlösung“ ohne Server-Fix.
- **Koordination:** PKG-HW-02 ist mit **PKG-HW-01** **parallel** planbar (UI), sobald der Delete-Pfad stabil ist; bei GPIO-REST-Inkonsistenz blockiert **PKG-HW-01** die sinnvolle Abnahme von Schritt 1.

---

## 7. Pattern-Scan (closest implementation)

- **GPIO-Refresh nach erfolgreicher Aktion:** `El Frontend/src/components/esp/AddSensorModal.vue` / `ESPOrbitalLayout.vue` — **`fetchGpioStatus`** nach Add.  
- **WS zentral:** `El Frontend/src/stores/esp.ts` — `handleSensorConfigDeleted`, `initWebSocket` / `cleanupWebSocket`.  
- **Dokumentation WS:** `.claude/reference/api/WEBSOCKET_EVENTS.md` §4.3.

---

*Ende Implementierungsplan PKG-HW-02.*
