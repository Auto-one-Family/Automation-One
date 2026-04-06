# Finalanalyse A3: Frontend Bodenfeuchte-Kalibrierung (Wizard, State, Finalitaet)

**Datum:** 2026-04-06
**Scope:** El Frontend Bodenfeuchte-Kalibrierflow mit Fokus auf Entrypoints, State, Datenherkunft und Finalitäts-UX
**Status:** Analyse abgeschlossen — 6 Pflichtlieferobjekte

---

## Executive Summary

Das Frontend hat zwei **semantisch unterschiedliche Kalibrierpfade**:
1. **Dedizierte Route** (`/calibration` → `CalibrationView` + `CalibrationWizard`): 2-Punkt-Wizard für alle Sensortypen, messpunkte live via `sensorsApi.queryData()`, state rein im Wizard-Komponent
2. **SensorConfigPanel (Inline)** im HardwareView: Komponententyp-spezifische Accordion-Sections mit `useCalibration` composable, Messpunkte aus live `espStore.sensors[].raw_value`

**Kernprobleme:**
- **Fehlende Datenquelle-Transparenz:** Wizard holt live Messpunkte via API, Inline nutzt lokalen Espstore → nicht konsistent
- **Unzureichende Typ-/GPIO-Guards:** Beide Flows erlauben Fehlkalibrierungen (z.B. pH auf analogem GPIO möglich)
- **Keine sichtbare Finalitäts-UX:** Nach `POST /calibrate` sendet Server Intent-Outcome (accepted/persisted/failed), aber Frontend zeigt nur Binary `success` an
- **Draft/Resume-Lücken:** Bei Navigation weg vom Wizard / Unmount von SensorConfigPanel gehen erfasste Messpunkte verloren, kein Guard
- **Auth-Verwirrung:** `/calibration` ist `requiresAdmin`, aber SensorConfigPanel im HardwareView ist nicht

**Auswirkung:** Nutzer können
- Mit falschen Sensortypen kalibrieren (GPIO/Type-Mismatch)
- Nicht sehen, ob Kalibrierung wirklich abgeschlossen ist
- Ungeplant Daten verlieren bei Routewechsel

---

## A) Entry- und Navigationspfade

### Pfad 1: Dedizierte Kalibrierroute (`/calibration`)

| Element | Details |
|---------|---------|
| **Route** | `/calibration` (authenticated, requiresAdmin: true) |
| **View** | `/src/views/CalibrationView.vue` (416 Bytes, nur Wrapper) |
| **Component** | `/src/components/calibration/CalibrationWizard.vue` (700 Zeilen) |
| **Einstiegspunkt** | Top-Level Navigation oder direkter Link |
| **Datenzugriff** | `espStore.devices` (Liste verfügbarer ESPs), `sensorsApi.queryData()` (live Messpunkt pro Step) |
| **State-Ownership** | Lokal im `CalibrationWizard` ref-State: `phase`, `points`, `calibrationResult`, `errorMessage` |

**Wizard-Lifecycle:**
```
select sensor → point1 (read value, confirm) → point2 (read value, confirm)
  → confirm (summary) → submit → done OR error
```

**Wert-Erfassung im Step:**
- `CalibrationStep.vue` Zeile 49-54: `sensorsApi.queryData({ esp_id, gpio, sensor_type, limit: 1 })`
- **Problem:** `queryData()` ist Historical-API (Datenbank-Abfrage), nicht live ADC-Lesen
- Fallback bei `queryData` Fehler: zeigt error, retry-Button ohne Timeout

**Rückwege & Abbruch:**
- Phase-Navigation: `select ↔ point1 ↔ point2 ↔ confirm`
- Back-Button: `handleAbort()` zeigt `uiStore.confirm()` wenn `points.length > 0`
- **Keine Draft-Persistierung:** Reset() löscht alles; Reload/Browser-Close = Datenverlust
- **Keine Leave-Guards:** `beforeRouteLeave` im CalibrationView nicht vorhanden

---

### Pfad 2: Inline SensorConfigPanel (HardwareView L3)

| Element | Details |
|---------|---------|
| **Route** | `/hardware` / `/hardware/:zoneId` / `/hardware/:zoneId/:espId` |
| **Entry** | ESP-Orbital-Layer-2 → Sensor-Card → SlideOver mit SensorConfigPanel |
| **Component** | `/src/components/esp/SensorConfigPanel.vue` (Zeile 561+: Calibration Accordion) |
| **Datenzugriff** | `espStore.devices[].sensors[].raw_value` (live aus WS-Feed, nicht API) |
| **State-Ownership** | `useCalibration()` composable + lokalem `SensorConfigPanel` State |

**Inline Calibration-Block (SensorConfigPanel Zeile 561-730):**
- Nur wenn `needsCalibration = true` (pH, EC, moisture, soil_moisture)
- Accordion mit `<AccordionSection>` Storage-Key für Expandedness
- 3 Sub-Templates: idle, active (point1/point2/complete), pH/EC/moisture-spezifisch
- **Messpunkte:** `currentRawValue` aus watcher auf `espStore.devices[].sensors[].raw_value` (Zeile 265-270)
- **Keine API-Calls:** Nutzt lokale `espStore`-Daten, kein `sensorsApi.queryData()`

**Lifecycle Inline:**
```
inactive → startCalibration('pH'/'EC'/'moisture') → point1-Button
  → setPoint1() → point2-Button → setPoint2() → complete (shows slope/offset)
  → Save (integriert in SensorConfigPanel.save()) oder Reset
```

**Rückwege:**
- Accordion kollabierbar (speichert State in localStorage via Storage-Key)
- "Zurücksetzen" Button: `calibration.resetCalibration()`
- **SlideOver-Close:** bei Unmount von SensorConfigPanel → kein Guard, Daten gehen verloren
- **Scope-Wechsel:** Beim "Save" im SensorConfigPanel werden Kalibrierparameter via `calibrationApi.calibrate()` gesendet (Zeile 383-385)

---

### Navigations-Vergleich

| Aspekt | Wizard-Route | Inline-SensorConfigPanel |
|--------|--------------|-------------------------|
| **Einstieg** | Menü-Link `/calibration` | Hardware-View Layer-2 |
| **Auth-Level** | requiresAdmin | Keine explizite Auth (erbt von /hardware) |
| **Messpunkt-Quelle** | `sensorsApi.queryData()` (API/DB) | `espStore.sensors[].raw_value` (WS) |
| **State-Ownership** | Wizard-Komponenten | useCalibration + SensorConfigPanel |
| **Wert-Saving** | Nach "Kalibrierung ausführen" (Confirm-Phase) | Bei "Sensor speichern" im SensorConfigPanel |
| **Draft-Persistierung** | Keine (sessionStorage unused) | Keine (localStorage nur für Accordion) |
| **Leave-Guard** | Keine `beforeRouteLeave` | Keine `beforeUnmount` Guard |
| **Sichtbarkeit in HW-View** | Nicht sichtbar | Sichtbar als Accordion-Section |

---

## B) State- und Ownership-Analyse

### Wizard-State-Machine (CalibrationWizard.vue, Zeile 20-38)

```typescript
type WizardPhase = 'select' | 'point1' | 'point2' | 'confirm' | 'done' | 'error'
const phase = ref<WizardPhase>('select')

// Selected sensor (cleared on phase='select' → 'point1')
const selectedEspId = ref('')
const selectedGpio = ref<number | null>(null)
const selectedSensorType = ref('')

// EC-Spezifisch
const ecPreset = ref<EcPresetId>('1413_12880')  // '0_1413' | '1413_12880' | 'custom'

// Messpunkte (linear accum.)
const points = ref<CalibrationPoint[]>([])
  // Struktur: { raw: number, reference: number }

// Result nach submit
const calibrationResult = ref<CalibrateResponse | null>(null)
const errorMessage = ref('')
const isSubmitting = ref(false)
```

**State-Transitions:**

| Phase | Eingang | Ausgang | Guard |
|-------|---------|---------|-------|
| select | START | point1 | `selectedSensorType` + device+gpio selection |
| point1 | selectSensor() | point2 | `points[0]` captured + emit |
| point2 | onPoint1Captured | confirm | `points[1]` captured + emit |
| confirm | onPoint2Captured | done/error | submitCalibration(), success-Flag |
| done | done | select | reset() |
| error | error | confirm/select | handleAbort() oder reset() |

**Problem: Fehlende Guards**
- `selectSensor()` prüft nur `espStore.devices.filter(d => espStore.getDeviceId(d))` → **Keine GPIO/Sensor-Type-Konsistenz-Check**
- `submitCalibration()` prüft nur `selectedGpio !== null && points.length === 2` → **Nicht geprüft: Passt GPIO zu sensorType?**

---

### useCalibration Composable State

```typescript
// Zentrale State-Holder (Zeile 10-44 von useCalibration.ts)
const calibrationType = ref<'pH' | 'EC' | 'moisture' | null>(null)
const step = ref<CalibrationStep>('idle' | 'point1' | 'point2' | 'complete')
const point1 = ref<CalibrationPoint | null>(null)
const point2 = ref<CalibrationPoint | null>(null)
const result = ref<CalibrationResult | null>(null)

// Moisture-only
const dryValue = ref<number>(3200)
const wetValue = ref<number>(1500)
```

**Besonderheit: Geteilter State zwischen Inline + (eventuell) Wizard**
- Beide (SensorConfigPanel + theoretisch Wizard) können `useCalibration()` aufrufen
- **Keine Isolation:** Wenn Wizard und SensorConfigPanel gleichzeitig `useCalibration()` nutzen → SharedState-Konflikt
- **Derzeit:** Wizard nutzt eigene `points` ref, SensorConfigPanel nutzt `calibration.point1/2`

---

### SensorConfigPanel State-Ownership

```typescript
// Config-Load (onMounted, Zeile 226+)
const name = ref(''), description = ref(''), unitValue = ref(''), enabled = ref(true)
const subzoneId = ref<string | null>(null)
const operatingMode = ref<'continuous' | 'on_demand' | 'scheduled' | 'paused'>('continuous')
const timeoutSeconds = ref(0), scheduleConfig = ref<{ type: string; expression: string } | null>(null)

// Hardware-Config
const gpioPin = ref(props.gpio), i2cAddress = ref('0x44'), i2cBus = ref(0)
const measureRangeMin = ref(0), measureRangeMax = ref(100)

// Thresholds
const alarmLow = ref(0), warnLow = ref(0), warnHigh = ref(100), alarmHigh = ref(100)

// Calibration (via composable)
const calibration = useCalibration()
const currentRawValue = ref(0)  // from watcher on espStore
```

**onMounted-Logic (Zeile 244-335):**
1. Load existing config from server (GET `/sensors/config/{configId}` oder `/sensors/{espId}/{gpio}`)
2. Fallback zu Mock ESP sensor data from `espStore` (Zeile 297+)
3. Parse metadata, device scope, schedule_config
4. Load device context (Zeile 311-317)

**Watch currentRawValue (Zeile 265-270):**
```typescript
watch(
  () => {
    const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
    const sensors = (device?.sensors as any[]) || []
    return sensors.find(s => s.gpio === props.gpio)
  },
  (sensor) => {
    if (sensor && typeof sensor.raw_value === 'number') {
      currentRawValue.value = sensor.raw_value
    }
  }
)
```

**Problem:** Watch hat keine Sensortyp-Prüfung → nutzt beliebigen Sensor mit GPIO, auch wenn Type falsch

---

## C) Messpunkt-Erfassung & Datenquellen

### CalibrationWizard (Dedizierte Route)

**Messpunkt-Flow:**
1. **Benutzer:** Klickt "Wert lesen" in CalibrationStep (Zeile 92-98)
2. **Komponente:** `readCurrentValue()` (CalibrationStep Zeile 45-65)
3. **API-Call:**
   ```typescript
   const response = await sensorsApi.queryData({
     esp_id: props.espId,
     gpio: props.gpio,
     sensor_type: props.sensorType,
     limit: 1,
   })
   if (response.readings.length > 0) {
     rawValue.value = response.readings[0].raw_value
   }
   ```
4. **Datenherkunft:** `GET /sensors/data` → Server-seitig from sensor database (timeseries)

**Probleme:**
- **Nicht live:** Messpunkt ist ~Sekunden alt (zuletzt gespeicherter Wert)
- **Bei Fehler:** "Kein aktueller Messwert verfügbar" oder "Fehler beim Lesen" → **Kein automatisches Retry, nur manueller Retry-Button**
- **Timeout:** Keine Timeout-Logik in `readCurrentValue()` → kann beliebig lange hängen
- **Offline-Szenario:** Wenn ESP offline → Server gibt leere `readings` → Fehlermeldung

---

### SensorConfigPanel (Inline)

**Messpunkt-Flow:**
1. **Watcher:** `espStore` WS-Feed aktualisiert `espStore.devices[].sensors[].raw_value` (Zeile 265-270)
2. **Inline-Calibration:** Nutzt direkt `currentRawValue` aus watcher
3. **User-Button:** Klick auf "Punkt 1" (Zeile 595 in Wizard-Äquivalent) → `calibration.setPoint1(currentRawValue, 4.0)`

**Datenherkunft:** `espStore.devices[].sensors[].raw_value` (WS-Update aus `sensor_data` Event)

**Probleme:**
- **Nur wenn espStore refreshed:** Bei langsamer WS oder Edge-Case (WS-Reconnect) kann `raw_value` stale sein
- **Kein Zeitstempel:** `espStore` zeigt aktuellen Wert, aber nicht "wann aktualisiert?"
- **GPIO-Type-Mismatch unsichtbar:** Wenn auf dem ESP GPIO 34 ein pH-Sensor, aber Panel denkt ES ist EC → messpunkt ist falsch

---

### Vergleichstabelle: Datenquellen

| Aspekt | Wizard API-Flow | Inline WS-Flow |
|--------|-----------------|----------------|
| **Quelle** | `sensorsApi.queryData()` (REST/DB) | `espStore.sensors[].raw_value` (WS) |
| **Frische** | Sekunden-alt (letzter DB-Eintrag) | Live (aktueller WS-Value) |
| **Timeout** | Keine explizite Logik | Implizit via WS-Connection |
| **Offline-Handling** | "Kein Messwert" Error | Zeigt gar nichts (stale oder undefined) |
| **Typ-Konsistenz-Check** | Keine (auch queryData prüft nicht) | Keine (watch auf GPIO ohne Type-Prüfung) |

**Risiko:** Nutzer in zwei Flows verschiedene Werte für denselben Sensor sehen → Verwirrung + falsche Kalibrierung

---

## D) Finalitäts-UX & Lifecycle

### Server-seitige Outcome-Semantik (aus REST_ENDPOINTS.md + WEBSOCKET_EVENTS.md)

Nach `POST /sensors/calibrate`:
1. **Server antwortet** (synchron): `{ success: bool, calibration: {...}, message: string }`
2. **Server sendet Intent-Outcome (asynchron via MQTT+WS):**
   - `intent_outcome` Topic: `kaiser/{kaiser_id}/esp/{esp_id}/system/intent_outcome`
   - Werte: `outcome` = "accepted" | "rejected" | "applied" | "persisted" | "failed" | "expired"
   - Felder: `terminality` ("terminal_success" | "terminal_failure" | "pending"), `code`, `reason`, `terminal_at`

**Outcome-Lifecycle:**
```
accepted → (ESP apply) → persisted    (terminal_success)
       └→ (ESP reject) → failed        (terminal_failure)
                    └→ expired         (timeout)
```

### Frontend-seitige Darstellung (CalibrationWizard)

**Nach submitCalibration() (Zeile 146-170):**
```typescript
try {
  const response = await calibrationApi.calibrate({...})
  calibrationResult.value = response
  phase.value = response.success ? 'done' : 'error'
  if (!response.success) {
    errorMessage.value = response.message ?? 'Kalibrierung fehlgeschlagen'
  }
} catch (err) {
  phase.value = 'error'
  errorMessage.value = err.message
}
```

**Done-Phase (Zeile 362-377):**
```vue
<div v-if="phase === 'done'" class="calibration-wizard__phase calibration-wizard__phase--center">
  <div class="calibration-wizard__done-icon">
    <Check :size="32" /> <!-- Erfolgs-Icon! -->
  </div>
  <h3 class="calibration-wizard__subtitle">Kalibrierung erfolgreich</h3>
  <p class="calibration-wizard__desc">
    {{ calibrationResult?.message ?? 'Parameter wurden gespeichert.' }}
  </p>
  <div v-if="calibrationResult?.calibration" class="calibration-wizard__result-data">
    <pre>{{ JSON.stringify(calibrationResult.calibration, null, 2) }}</pre>
  </div>
  <button class="calibration-wizard__submit-btn" @click="reset">
    <RefreshCw :size="14" /> Weitere Kalibrierung
  </button>
</div>
```

**Problem 1: Binary Success vs. Multi-State Outcome**
- Frontend zeigt nur `response.success` (true/false)
- Server sendet **6 Outcome-States** (`accepted`, `rejected`, `applied`, `persisted`, `failed`, `expired`)
- **Frontend ignoriert Intent-Outcome WS-Event völlig** → keine `intent_outcome_lifecycle` Behandlung
- **Result:** "Kalibrierung erfolgreich" zeigt auch bei `accepted` (interim state), nicht nur `persisted` (terminal)

**Problem 2: Fehlende Finalitäts-States**
- Keine visuelle Unterscheidung zwischen:
  - `accepted` (Server got it, ESP nicht geprüft)
  - `applied` (ESP angenommen, noch nicht persistiert)
  - `persisted` (ESP NVS geschrieben)
  - `failed` (ESP zurückgewiesen)

**Problem 3: Fehlende Fehlerklassen**
- Error-Phase zeigt nur `errorMessage` als plain text
- Keine Recovery-CTAs (Retry? Manuell auf ESP konfigurieren? Support kontaktieren?)

---

### SensorConfigPanel Finalitäts-UX

**Bei submitCalibration (Zeile 377-407 in SensorConfigPanel):**
```typescript
async function saveSensorConfig() {
  saving.value = true
  try {
    const config = { /* ...fields... */ }
    const calData = calibration.getCalibrationData()
    if (calData) {
      config.calibration = calData  // Inline mit config
    }
    await sensorsApi.createOrUpdate(props.espId, props.gpio, config)
    calibration.resetCalibration()
    emit('saved')
    toast.success('Sensor gespeichert')  // Toast!
  } catch (err) {
    toast.error('Fehler beim Speichern')
  } finally {
    saving.value = false
  }
}
```

**Problem:**
- Toast erfolg sofort nach API-Success (nicht nach Intent-Outcome)
- Keine Callback auf Intent-Outcome-Handling
- Wenn Intent später `failed` kommt → Nutzer sieht grünen Toast, aber echte Kalibrierung schlug fehl

---

## E) Operative Robustheit & Leave-Guards

### Draft/Resume-Verhalten

**Wizard-Route (`/calibration`):**
- `points` ref speichert erfasste Messpunkte (nicht persistent)
- `phase` speichert aktuellen Schritt (nicht persistent)
- **Beim Reload oder Browser-Close:** Alle Daten weg
- **Beim Navigation (z.B. zu `/hardware`):** kein `beforeRouteLeave` Guard → keine Warnung

**SensorConfigPanel (Inline):**
- `calibration` State persisted nicht
- Accordion-Expandedness speichert in `localStorage` via Storage-Key
- Aber: calibration-Messpunkte nicht in localStorage
- **Bei Unmount (SlideOver-Close):** `calibration.resetCalibration()` wird nicht explizit called → Daten bleiben im composable
- **Potential:** nächstes Mal SensorConfigPanel öffnen → alte calibration-State noch da (Pollution)

---

### Leave-Guard Implementation

**Wizard:**
- Route: `/calibration`, name: `calibration` (Zeile 275 in router/index.ts)
- View: `CalibrationView.vue` (nur Wrapper)
- **Keine Guard-Implementierung:**
  ```typescript
  // FEHLT:
  beforeRouteLeave(to, from, next) {
    if (phase.value !== 'select' && phase.value !== 'done' && phase.value !== 'error') {
      // Zeige Confirm-Dialog
      const confirmed = await uiStore.confirm({ ... })
      next(confirmed)
    } else {
      next()
    }
  }
  ```

**SensorConfigPanel:**
- Keine `beforeUnmount` Hook mit Guard
- Nur `onUnmounted(() => {})` ist empty
- **Sollte:** Warnen, wenn Config verändert aber nicht gespeichert

---

### Typ-/GPIO-Guards (unzureichend)

**CalibrationWizard selectSensor() (Zeile 126-134):**
```typescript
function selectSensor(espId: string, gpio: number, sensorType: string) {
  selectedEspId.value = espId
  selectedGpio.value = gpio
  selectedSensorType.value = sensorType
  // ❌ KEINE Validierung:
  // - Passt GPIO zu ESP?
  // - Ist sensorType auf dem ESP auf GPIO konfiguriert?
  // - Braucht sensorType diesen GPIO-Interface?
  points.value = []
  calibrationResult.value = null
  errorMessage.value = ''
  phase.value = 'point1'
}
```

**CalibrationWizard submitCalibration() (Zeile 146-170):**
```typescript
async function submitCalibration() {
  if (selectedGpio.value === null || points.value.length < 2) return
  // ❌ KEINE Validierung:
  // - Hat dieser GPIO tatsächlich einen Sensor?
  // - Sind die zwei Messpunkte vom selben Sensor?
  // - Sind Referenzwerte in valider Range?
  isSubmitting.value = true
  // ...
}
```

**SensorConfigPanel watcher (Zeile 265-270):**
```typescript
watch(() => {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === props.espId)
  const sensors = (device?.sensors as any[]) || []
  return sensors.find(s => s.gpio === props.gpio)  // ❌ Type-Prüfung fehlt!
}, ...)
```

---

## F) Auth & Access Control

| Route/Component | Auth-Level | Probleme |
|-----------------|-----------|----------|
| `/calibration` (CalibrationWizard) | `requiresAdmin: true` | Restrictive, aber konsistent |
| `/hardware` (SensorConfigPanel) | `requiresAuth: true` (default) | Alle authentifizierten Nutzer können kalibrieren → Sicherheitsrisiko |
| `POST /sensors/calibrate` (Server) | X-API-Key Header | Frontend benutzt `VITE_CALIBRATION_API_KEY` oder JWT fallback |

**Problem:** SensorConfigPanel im HardwareView ist erreichbar für alle, die Zugriff auf `/hardware` haben, aber Kalibrierung sollte Admin-only sein.

---

## G) Implementierungsplan: Unified Wizard Flow

### Zielarchitektur

```
Single Calibration-Route (/calibration)
  ├─ Dedizierter CalibrationWizard (NICHT inline)
  ├─ State-Machine mit Guards
  ├─ Live-Messpunkte via Server (trigger measure, nicht query-history)
  ├─ Finalitäts-Lifecycle (intent-outcome-aware)
  ├─ Draft-Persistierung (sessionStorage/localStorage)
  └─ Leave-Guard + Resume-Dialog
```

**Aus SensorConfigPanel entfernen:**
- Inline Calibration-Accordion
- useCalibration composable
- calibrationApi integration

---

## Pflichtlieferobjekt 1: Frontend-Systemmatrix

| Komponente/Store | Verantwortung | Eingang | Ausgang | Risiko |
|------------------|---------------|---------|---------|--------|
| **CalibrationView** | Route-Wrapper | /calibration | CalibrationWizard | Keine (minimal) |
| **CalibrationWizard** | State-Machine, Phase-Transitions | selectSensor(), onPoint*Captured(), submitCalibration() | phase, points, calibrationResult | Fehlende GPIO/Type-Validierung, kein Leave-Guard |
| **CalibrationStep** | Messpunkt-Erfassung UI | espId, gpio, sensorType, suggestedReference | rawValue, referenceValue, emit('captured') | Datenquelle (queryData) ist Historical, nicht live |
| **useCalibration** | Messpunkt-State + Slope/Offset-Berechnung | startCalibration(), setPoint1/2() | calibrationType, step, result, dryValue, wetValue | Keine Isolation zwischen concurrent-Calls (Shared state) |
| **SensorConfigPanel** | Konfiguration + **inline Calibration (fehlplatziert)** | props espId/gpio/sensorType, onMounted-fetch, watch-currentRawValue | saveSensorConfig(), emit('saved') | Messpunkte aus espStore.raw_value (WS-abhängig), kein Finalitäts-Lifecycle |
| **calibrationApi** | POST /sensors/calibrate Wrapper | CalibrateRequest | CalibrateResponse (success/calibration) | Ignoriert Server-seitige intent-outcome (nur binary success) |
| **sensorsApi.queryData()** | Historische Sensor-Daten (via DB-Abfrage) | esp_id, gpio, sensor_type, limit | readings[] mit raw_value | Nicht live, kann sekunden-alt sein |
| **espStore.devices[].sensors[].raw_value** | Live WS-Feed (sensor_data Event) | WS-Update | raw_value (float) | Nur wenn WS aktiv, kein Zeitstempel, Type-Mismatch möglich |
| **intentSignals.store** | Intent-Outcome Tracking (global) | WS intent_outcome / intent_outcome_lifecycle | signalsMap { intent_id → OutcomeRow } | **Nicht im Calibration-Flow integriert** |

---

## Pflichtlieferobjekt 2: Vergleichstabelle Wizard vs Inline

| Kriterium | Wizard-Route (`/calibration`) | Inline SensorConfigPanel | Empfehlung |
|-----------|------|----------|------------|
| **Entry-Punkt** | Top-Nav `/calibration` | Hardware-View L2 Sensor-Card | **Consolidate:** Nur Route |
| **Auth** | requiresAdmin | requiresAuth (inherit) | **Fix:** Inline entfernen oder zu Admin erheben |
| **State-Ownership** | Wizard local refs | useCalibration + SensorConfigPanel | **Fix:** Consolidate in single Wizard + intentSignals |
| **Messpunkt-Quelle** | sensorsApi.queryData (API/DB) | espStore.sensors[].raw_value (WS) | **Fix:** Server-seitige `trigger_measure` API |
| **Typprüfung** | Keine (❌) | Keine (❌) | **Add:** GPIO-Type-Validierung beiderseits |
| **Finalitäts-UX** | Binary success, kein Intent-Outcome | Toast.success, kein Intent-Outcome | **Add:** intent-outcome-lifecycle Listener |
| **Draft-Persistierung** | Keine (❌) | Keine (❌) | **Add:** sessionStorage + Resume-Dialog |
| **Leave-Guard** | Keine (❌) | Keine (❌) | **Add:** beforeRouteLeave + uiStore.confirm |
| **Error-Handling** | Plain errorMessage | Toast.error | **Upgrade:** Error-Klassifikation (Retry/Manual/Support) |
| **Wert-Saving** | submitCalibration → calibrationApi.calibrate | saveSensorConfig → sensorsApi.createOrUpdate (mit calibration-Feld) | **Fix:** Beide via calibrationApi, Intent-Outcome tracking |

**Drift-Punkte (Inkonsistenzen):**
1. Messpunkt-Quelle unterschiedlich (API vs. WS) → Nutzer sieht unterschiedliche Werte
2. State-Management verteilt (Wizard + useCalibration + SensorConfigPanel) → Contamination möglich
3. Finalitäts-Signalisierung binary → Nutzer denkt `accepted` = `persisted`
4. Auth-Level unterschiedlich → Admin kann via Route, aber auch normale User via HardwareView

---

## Pflichtlieferobjekt 3: End-to-End UI-Flows

### Happy Path (beide Flows sollten identisch sein)

```
1. SELECT SENSOR
   User: Öffne /calibration oder SensorConfigPanel-Accordion
   UI: Zeige Sensor-Type-Grid (pH, EC, Moisture, Temperature)
   User: Wähle "Bodenfeuchte" → Zeige verfügbare ESPs + GPIOs mit passendem Sensor-Type
   UI: Validate: GPIO hat soil_moisture Sensor
   User: Klick GPIO 34

2. POINT 1
   UI: Zeige Anweisung ("Sensor in trockener Erde, 5 sec warten")
   UI: Live Raw-Value Display (aktualisiert alle 500ms)
   User: Drücke "Messwert laden" oder "Punkt übernehmen"
   UI: Trigger measure am Server? Oder queryData (dann alte Daten!)
   User: Gib Referenz ein (0 für trocken)
   User: Klick "Punkt übernehmen"
   Logic: points[0] = { raw: X, reference: 0 }

3. POINT 2
   UI: Zeige "Punkt 1: raw=2847 → ref=0 ✓"
   UI: Zeige Anweisung ("Sensor in nassem Sand, 5 sec warten")
   UI: Live Raw-Value Display (aktualisiert)
   User: Drücke "Messwert laden"
   User: Gib Referenz ein (100 für nass)
   User: Klick "Punkt übernehmen"
   Logic: points[1] = { raw: 1450, reference: 100 }
          slope = (100-0)/(1450-2847) = -0.0717
          offset = 0 - (-0.0717)*2847 = 204.4

4. CONFIRM
   UI: Zeige Summary
     Sensor: Bodenfeuchte (soil_moisture)
     ESP: ESP_12AB34CD
     GPIO: 34
     Punkt 1: raw=2847 → ref=0% (trocken)
     Punkt 2: raw=1450 → ref=100% (nass)
     Slope: -0.0717
     Offset: 204.4
   User: Klick "Kalibrierung ausführen"

5. SUBMIT
   POST /sensors/calibrate {
     esp_id: "ESP_12AB34CD",
     gpio: 34,
     sensor_type: "soil_moisture",
     calibration_points: [
       { raw: 2847, reference: 0 },
       { raw: 1450, reference: 100 }
     ],
     method: "linear",
     save_to_config: true
   }
   Server Response (sync): { success: true, calibration: {...}, saved: true, message: "..." }

6. FINALITÄTS-LIFECYCLE (asynchron)
   Server sends MQTT intent_outcome:
     intent_id: "cal_xyz"
     outcome: "accepted"
     terminality: "pending"

   → Dann (ESP anwendet): outcome: "applied"
   → Dann (ESP persistiert): outcome: "persisted", terminality: "terminal_success"

   Frontend (via intent-outcome-lifecycle WS):
     State 1: "Kalibrierung akzeptiert..." (icon: hourglass)
     State 2: "Wird angewendet..." (icon: loading-spinner)
     State 3: "Erfolgreich persistiert" (icon: check-green)

7. DONE
   UI: Zeige "Kalibrierung erfolgreich"
   UI: Display Final Slope/Offset/Points
   User: Klick "Weitere Kalibrierung" → reset(), zurück zu SELECT
   oder: Klick-away von Route → Reset + Bestätigung
```

---

### Timeout Path (Happy Path + Fehler nach Submit)

```
4. CONFIRM → 5. SUBMIT (wie Happy Path)

6. TIMEOUT/FAILURE OUTCOME (asynchron via intent-outcome)
   Server: outcome: "expired", terminality: "terminal_failure", code: "TIMEOUT_APPLY", reason: "ESP nicht geantwortet (30s)"

   Frontend receives intent_outcome_lifecycle WS:
   Phase 1: state="accepted" (OK, Server hat Kalibrierung)
   Phase 2: (timeout nach 30s) state="expired", reason="ESP geantwortet nicht"

   UI-Transitions:
     "Kalibrierung akzeptiert..."
     → (30s später, nach Timeout)
     → "Fehler: Geräte antwortet nicht (Timeout). 3 Optionen:"
         - [Retry] Neuerversuch (Lesen + Messpunkte behalten, nur Submit neu)
         - [Manuell] Auf dem Gerät konfigurieren
         - [Support] Support kontaktieren
```

---

### Failure Path (Typ-/GPIO-Mismatch oder Server-Fehler)

```
1. SELECT SENSOR
   User: Klick Bodenfeuchte, dann GPIO 33 (das ist aber ein ADC-Pin, ESP hat dort keinen Sensor)

2. SERVER-SIDE VALIDATION
   (In idealer Zukunft: Frontend prüft vorher)

   POST /sensors/calibrate mit invalid GPIO
   Server: HTTP 400, { error: "GPIO33 hat keinen Sensor konfiguriert", code: "INVALID_GPIO" }

   Frontend:
     phase.value = 'error'
     errorMessage.value = "GPIO33 hat keinen Sensor konfiguriert"

   UI:
     "Fehler: GPIO33 hat keinen Sensor konfiguriert"
     Buttons:
       [Zurück] → phase = 'confirm' (keep points)
       [Neustart] → reset(), phase = 'select'
```

---

## Pflichtlieferobjekt 4: P0/P1/P2 Gap-Liste

| Priority | Gap | Nutzerwirkung | Fix-Effort |
|----------|-----|---------------|-----------|
| **P0 (Blockierend)** | Keine Live-Messpunkt-Quelle (queryData ist ~1s alt) | Nutzer misst, aber System zeigt Wert von vor 1s → falsche Kalibrierung | M (Server: trigger-measure API) |
| **P0** | Kein Intent-Outcome-Lifecycle-Handling | Nutzer sieht "erfolgreich" bei `accepted`, nicht bei `persisted` → falsche Sicherheit | M (WS-Listener + State-Update) |
| **P0** | SensorConfigPanel Kalibrierung inline + unklar Auth | Admin und Normal-User können kalibrieren über verschiedene Routen → Sicherheit + UX-Verwirrung | M (Entfernen Inline, nur /calibration) |
| **P1** | Keine Leave-Guard beide Flows | Nutzer navigiert weg nach 50% Kalibration → Daten weg, keine Warnung | S (beforeRouteLeave + beforeUnmount Hooks) |
| **P1** | Messpunkt-Quelle unterschiedlich (Wizard API vs. Inline WS) | In zwei Flows sieht Nutzer unterschiedliche Raw-Werte für denselben Sensor | M (Consolidate zu Server-seitig trigger-measure) |
| **P1** | Keine Typ-/GPIO-Validierung | User klickt pH, GPIO 35 (analog), calibriert → Ergebnis Müll | S (Backend-Validation + Frontend-Guard) |
| **P1** | Fehlende Draft-Persistierung | Nach Reload verlieren Nutzer 5 min Arbeit (beide Messpunkte) | M (sessionStorage + Resume-Dialog) |
| **P2** | Error-Handling zu simpel | Nur plain error-text, keine Recovery-CTAs | M (Error-Klassifikation: Retry/Manual/Support) |
| **P2** | useCalibration Shared-State nicht isoliert | Concurrent Wizard + SensorConfigPanel → State-Pollution | S (Scoped state pro instance oder store per sensor) |
| **P2** | Keine Finalitäts-Sichtbarkeit (accepted vs. persisted vs. failed) | Nutzer kann nicht unterscheiden ob Kalibrierung wirklich im NVS ist | M (intent-outcome UI-States) |

---

## Pflichtlieferobjekt 5: Zielbild Einheitlicher Wizard-Flow

```
UNIFIED CALIBRATION WIZARD
├─ Entry: /calibration (requiresAdmin: true)
├─ Views:
│  ├─ SelectView
│  │  ├─ Sensor-Type-Grid (pH, EC, Moisture, Temperature)
│  │  ├─ ESP+GPIO Selector mit Validation
│  │  │   ├─ Backend-Check: GPIO hat Sensor mit passendem Type?
│  │  │   └─ Show: Sensor-Name, aktueller Status (online/offline)
│  │  └─ EC-Preset-Selector (wenn Type='EC')
│  │
│  ├─ PointView (1/2)
│  │  ├─ Instruction mit SensorType-Bild (Sensor in Puffer tauchen, warten)
│  │  ├─ Live Raw-Value Display (aktualisiert alle 500ms)
│  │  │   └─ Datenquelle: Server trigger-measure API (nicht queryData!)
│  │  ├─ Reference-Input
│  │  ├─ Status-Indicator (Sensor online? WS aktiv? Wert kommt rein?)
│  │  └─ Buttons: [Messwert laden] [Punkt übernehmen] [Abbrechen]
│  │
│  ├─ ConfirmView
│  │  ├─ Summary-Table (Sensor, ESP, GPIO, Punkt1, Punkt2, Slope, Offset)
│  │  └─ Buttons: [Zurück] [Abbrechen] [Kalibrierung ausführen]
│  │
│  ├─ FinalizingView (pending intent-outcome)
│  │  ├─ Progress: accepted → applied → persisted
│  │  ├─ Live Status-Updates via intent-outcome-lifecycle WS
│  │  └─ Error-State mit Recovery-CTA
│  │
│  └─ DoneView (terminal outcome)
│     ├─ Success: grünes Icon + "Erfolgreich persistiert" (nicht nur "akzeptiert")
│     ├─ Final Parameters: Slope, Offset, Calibration-Timestamp
│     └─ Buttons: [Weitere Kalibrierung] [Zurück zu Hardware]
│
├─ State-Machine
│  └─ phase: 'select' | 'point1' | 'point2' | 'confirm' | 'finalizing' | 'done' | 'error'
│
├─ Storage (Draft-Persistierung)
│  └─ sessionStorage: { calibrationDraft: { espId, gpio, sensorType, points[], phase } }
│     └─ Resume-Dialog bei Reload: "Kalibrierung fortsetzen?"
│
├─ Guards
│  ├─ beforeRouteLeave: Warnung wenn phase !== 'select'/'done'/'error'
│  ├─ GPIO-Type-Match-Validation: Backend returns sensor-config mit Type
│  └─ Finalitäts-Guard: Nur in done-Phase erlauben zu router.push("/hardware")
│
└─ Integrations
   ├─ intentSignals.store: Subscribe zu intent-outcome Updates
   ├─ sensorsApi.triggerMeasure() (NEW): POST /sensors/{esp_id}/{gpio}/measure
   ├─ calibrationApi.calibrate(): POST /sensors/calibrate
   └─ calibrationApi.getOutcomeStatus(): GET /intent-outcomes?intent_id=...
```

---

## Pflichtlieferobjekt 6: Implementierungsplan (8 Pakete)

### Paket 1: Refactor State-Management (M, 3-4 Tage)
**Scope:** Consolidate Wizard + Inline State, remove useCalibration duplication
**Files:** `useCalibration.ts`, `CalibrationWizard.vue`, `SensorConfigPanel.vue`, `intentSignals.store.ts`
**Deliverables:**
- [ ] New `useCalibrationWizard()` Composable mit eigenständigem State (kein Sharing)
- [ ] SensorConfigPanel: Remove useCalibration, nur sensorsApi-Calls
- [ ] intentSignals.store: Add `calibrationOutcome` tracking (per intentId)
- [ ] Unit Tests: State-Isolation, Intent-Outcome updates

**Acceptance:** Zwei gleichzeitig offene Calibration-Sesionen interferieren nicht

---

### Paket 2: Add Server-seitige trigger-measure API (M, 3 Tage)
**Scope:** Backend: New REST endpoint, Frontend: sensorsApi.triggerMeasure()
**Files:** `El Servador/sensors.py`, `sensorsApi.ts`, `CalibrationStep.vue`
**Deliverables:**
- [ ] Server: POST `/sensors/{esp_id}/{gpio}/trigger` → sends MQTT trigger_measure, returns intent_id
- [ ] Server: WS event sensor_data_live nach Trigger (mit Timestamp)
- [ ] Frontend: sensorsApi.triggerMeasure() + Polling-Timeout (5s)
- [ ] CalibrationStep: Replace queryData() mit triggerMeasure() + live-value watcher
- [ ] Tests: Timeout-Handling, Offline-Scenario

**Acceptance:** Live Raw-Value in CalibrationStep wird bei Click innerhalb 1s aktualisiert

---

### Paket 3: GPIO-Type Validation (S, 2 Tage)
**Scope:** Frontend Guards + Backend Validation
**Files:** `CalibrationWizard.vue`, `El Servador/sensors.py`, `utils/sensorDefaults.ts`
**Deliverables:**
- [ ] Frontend selectSensor(): Validate GPIO-in-selectedSensorType-list
- [ ] Server POST /sensors/calibrate: Validate GPIO matches sensor_config.sensor_type
- [ ] Error-Message: "GPIO34 hat keinen soil_moisture Sensor (hat pH)"
- [ ] Backend HTTP 400 + Code INVALID_SENSOR_TYPE
- [ ] Frontend error-phase displays error-code + Retry/Manual CTA

**Acceptance:** Kalibrierung mit falschem Sensor-Type wird mit klarer Meldung abgewiesen

---

### Paket 4: Intent-Outcome Lifecycle UI (M, 4 Tage)
**Scope:** Finalitäts-States, WS-Listener, Multi-phase UI
**Files:** `CalibrationWizard.vue`, `intentSignals.store.ts`, `useCalibrationWizard.ts`, `WEBSOCKET_EVENTS.md` integration
**Deliverables:**
- [ ] New phase: 'finalizing' (zwischen confirm + done)
- [ ] intentSignals.store: subscribeToOutcome(intentId) → real-time updates
- [ ] CalibrationWizard.vue:
  - [ ] phase='finalizing': Show Progress-States (accepted/applied/persisted)
  - [ ] phase='done': Show nur wenn terminality='terminal_success'
  - [ ] phase='error': Show wenn terminality='terminal_failure'
- [ ] Error-Handler: Code-to-CTA Mapping (TIMEOUT→Retry, INVALID_GPIO→Manual, etc.)
- [ ] Unit Tests: Outcome-Transitions, Error-States

**Acceptance:** User sieht "Kalibrierung persistiert" nur bei terminal_success

---

### Paket 5: Draft-Persistierung + Resume (M, 3 Tage)
**Scope:** sessionStorage Backup + Resume-Dialog
**Files:** `CalibrationWizard.vue`, `CalibrationView.vue`, `useCalibrationWizard.ts`
**Deliverables:**
- [ ] useCalibrationWizard(): Auto-Save zu sessionStorage bei jedem State-Change
- [ ] CalibrationWizard: Load Draft bei onMounted
- [ ] CalibrationView: Resume-Dialog wenn Draft vorhanden
  ```vue
  <Dialog v-if="hasDraft">
    <p>Letzte Kalibrierung (Schritt {{ draftPhase }}) gefunden.</p>
    <Button @click="resumeDraft">Fortsetzen</Button>
    <Button @click="discardDraft">Neustarten</Button>
  </Dialog>
  ```
- [ ] Cleanup: Delete Draft nach DonePhase oder explicit Discard
- [ ] Tests: Draft persistence, Resume-Flow

**Acceptance:** Nach Reload zeigt Dialog auf, Nutzer kann fortsetzen

---

### Paket 6: Leave-Guard + Abort-Handling (S, 2 Tage)
**Scope:** beforeRouteLeave Hook, Confirmation Dialog
**Files:** `CalibrationView.vue`, `CalibrationWizard.vue`
**Deliverables:**
- [ ] CalibrationView: implement beforeRouteLeave with uiStore.confirm
- [ ] Guard-Logic:
  ```typescript
  if (phase.value !== 'select' && phase.value !== 'done' && phase.value !== 'error') {
    const confirmed = await uiStore.confirm({
      title: 'Kalibrierung abbrechen?',
      message: `Sie sind bei Schritt "${phase.value}". Erfasste Daten gehen verloren.`,
      confirmText: 'Abbrechen',
      variant: 'danger'
    })
    return confirmed
  }
  ```
- [ ] Abort-Button: handleAbort() hat already uiStore.confirm, test it
- [ ] Tests: Guard-Transitions, Dialog-Confirmation

**Acceptance:** User kann nicht ohne Bestätigung weg navigieren, wenn Messpunkte erfasst

---

### Paket 7: Remove Inline Calibration from SensorConfigPanel (M, 2 Tage)
**Scope:** Rip-Out, Redirect to /calibration
**Files:** `SensorConfigPanel.vue`, `router/index.ts` (optional redirect)
**Deliverables:**
- [ ] SensorConfigPanel: Remove Calibration Accordion Section (Zeile 561-730)
- [ ] Remove useCalibration import + usage
- [ ] Remove currentRawValue watcher
- [ ] Add Info-Badge: "Kalibrierung → /calibration" wenn needsCalibration
- [ ] (Optional) Click-Link in Badge → router.push('/calibration', { selectedSensor: { espId, gpio, sensorType } })
- [ ] Tests: SensorConfigPanel still saves non-calibration fields

**Acceptance:** SensorConfigPanel keine Calibration-UI mehr, kein Kalibrierungs-Toast

---

### Paket 8: E2E Tests + Documentation (M, 3 Tage)
**Scope:** Playwright E2E Tests, Wizard-Doc, API-Contract
**Files:** `tests/e2e/calibration-wizard.spec.ts`, `docs/calibration-flow.md`, `.claude/reference/` update
**Deliverables:**
- [ ] E2E Tests:
  - [ ] Happy Path: Select → Point1 → Point2 → Confirm → Submit → Finalizing → Done
  - [ ] Resume Path: Reload, Resume-Dialog, Continue
  - [ ] Leave-Guard: Navigate without Save → Dialog → Confirm
  - [ ] Timeout Path: Submit → 30s Timeout → Failure-UI
  - [ ] Type-Validation: Select pH, GPIO ohne pH Sensor → Error
- [ ] Documentation:
  - [ ] `docs/calibration-flow.md` mit Diagramme (State-Machine, WS-Lifecycle)
  - [ ] `.claude/reference/api/CALIBRATION_FLOW.md` (Intent-Outcome States)
  - [ ] Code-Comments: WS-Event-Handling, Draft-Storage
- [ ] Changelog: Breaking changes (removed inline calibration)

**Acceptance:** All E2E Green, Flow-Doc existiert, Team kann Wizard nutzen

---

### Zeitplan & Parallelisierung

```
Paket 1 (M): Days 1-3  ← Foundation
Paket 2 (M): Days 1-3  ← Parallel: Backend API
Paket 3 (S): Days 2-3  ← Parallel: Depends on Paket 1
Paket 4 (M): Days 4-7  ← Depends on Paket 1 + 2
Paket 5 (M): Days 4-6  ← Independent
Paket 6 (S): Days 5-6  ← Independent
Paket 7 (M): Days 7-8  ← Depends on Paket 4 (Finalitäts-UI final)
Paket 8 (M): Days 6-8  ← Parallel: Testing + Docs

Total: ~8 Werktage (1.6 Wochen), 3-4 Entwickler (Backend + Frontend)
```

---

## Anhang: Referenz-Links

| Datei | Zeilen | Kontext |
|-------|--------|---------|
| `CalibrationWizard.vue` | 1-700 | Dedizierte Route, Phase-Machine |
| `CalibrationStep.vue` | 45-65 | sensorsApi.queryData() Call |
| `SensorConfigPanel.vue` | 561-730 | Inline Calibration (zu entfernen) |
| `SensorConfigPanel.vue` | 265-270 | Watch auf espStore.sensors[].raw_value |
| `SensorConfigPanel.vue` | 377-407 | saveSensorConfig() + Toast |
| `useCalibration.ts` | 1-150 | State-Composable (zu refactor) |
| `calibrationApi.ts` | 1-50 | POST /sensors/calibrate Wrapper |
| `sensorsApi.ts` | 49-65 | queryData() API |
| `router/index.ts` | 275 | /calibration Route |
| `WEBSOCKET_EVENTS.md` | 857-941 | intent_outcome + lifecycle Schema |
| `REST_ENDPOINTS.md` | 70, 215-216 | /sensors/calibrate, /intent-outcomes |
| `intentSignals.store.ts` | - | (Exists, aber Calibration nicht integrated) |

---

## Nächste Schritte

1. **Decision:** Freigabe dieser Analyse für Implementierung?
2. **Planning:** Welche Pakete parallel starten (Backend + Frontend)?
3. **Assign:** Dev-Agenten + Ressourcen für 8-Tage-Sprint
4. **Test-Strategy:** E2E-Tests im Paket 8, Unit-Tests pro Paket
5. **Rollout:** Feature-Flag für new Wizard, disable Inline nach 1 Sprint

---

*Report Abschluss: 2026-04-06, 14:30 UTC*
