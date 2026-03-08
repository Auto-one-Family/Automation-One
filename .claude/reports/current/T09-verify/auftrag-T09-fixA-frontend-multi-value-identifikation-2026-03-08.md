# T09-Fix-A — Frontend: Multi-Value Sensor-Identifikation und State-Management

**Datum:** 2026-03-08
**Prioritaet:** KRITISCH
**Schicht:** El Frontend (Vue 3 + TypeScript + Pinia)
**Bugs:** NB-T09-03, NB-T09-05, NB-T09-06, NB-T09-09, NB-T09-10
**Voraussetzung:** Fix1 (Sensor-Config-Pipeline) ist implementiert — Backend liefert `config_id` (UUID) als primaeren Identifier
**Referenz:** `.claude/reports/current/T09-verify/T09-verifikation-bericht-2026-03-08.md`

---

## Ueberblick: Das Kernproblem

Das gesamte Frontend identifiziert Sensoren primaer ueber `gpio` (Pin-Nummer). Das funktioniert fuer Single-Value-Sensoren (1 Sensor = 1 GPIO), bricht aber komplett bei **Multi-Value-Sensoren** (z. B. SHT31 = Temperatur + Feuchtigkeit auf demselben I2C-Bus, gpio=0). Seit Fix1 liefert das Backend fuer jeden Multi-Value-Sensor **separate `sensor_config`-Eintraege** mit eigener UUID (`config_id`). Das Frontend muss diese UUIDs als primaeren Identifier verwenden — nicht GPIO.

### Betroffene Multi-Value-Sensoren

| Sensor | Physischer Chip | Logische Eintraege | Gemeinsamer GPIO |
|--------|----------------|-------------------|-----------------|
| SHT31 | 1 I2C-Chip | `sht31_temp` + `sht31_humidity` | gpio=0 (I2C-Fallback) |
| BMP280 | 1 I2C-Chip | `bmp280_temp` + `bmp280_pressure` | gpio=0 |
| BME280 | 1 I2C-Chip | `bme280_temp` + `bme280_humidity` + `bme280_pressure` | gpio=0 |

Alle I2C-Sensoren teilen sich `gpio=0` als Fallback-Wert (weil der GPIO-Pin bei I2C nicht pro Sensor gilt, sondern der SDA-Bus-Pin ist). Daher sind GPIO-basierte Lookups fuer I2C-Sensoren grundsaetzlich mehrdeutig.

---

## Bug 1: Duplicate Vue Keys (NB-T09-03) — ZUERST FIXEN

### IST-Zustand
`SensorColumn.vue` (Zeile 64–66) verwendet als `v-for`-Key auf `<SensorSatellite>`:
```html
<SensorSatellite
  v-for="(sensor, idx) in sensors"
  :key="`sensor-${sensor.gpio}`"
```

Bei Multi-Value-Sensoren (SHT31 temp + humidity) haben BEIDE `gpio=0`. Vue erhaelt dadurch zwei Elemente mit `:key="sensor-0"` und wirft:
```
[Vue warn]: Duplicate keys detected: 'sensor-0'. This may cause update errors.
```

### Warum das kritisch ist
Vue's Virtual-DOM-Diff-Algorithmus nutzt Keys um Elemente effizient zu recyclen. Doppelte Keys fuehren dazu, dass Vue beim naechsten Re-Render das falsche DOM-Element wiederverwendet — ein Satellite zeigt dann den Wert eines anderen Sensors. Das ist die Mitursache fuer den Dual-Value-Bug (NB-T09-05).

### SOLL-Zustand
```html
<SensorSatellite
  v-for="(sensor, idx) in sortedSensors"
  :key="sensor.id || `sensor-${sensor.gpio}-${sensor.sensor_type}`"
```

- **Primaer:** `sensor.id` (die `config_id` UUID aus der DB) — garantiert unique
- **Fallback:** `sensor.gpio + sensor.sensor_type` — fuer den Fall dass `id` noch nicht geladen ist (z. B. waehrend WS-Events vor REST-Response)

> **[Korrektur verify-plan]:** Das `SensorItem`-Interface in SensorColumn.vue (Zeile 19–32) hat aktuell KEIN `id`-Feld. Dieses muss zuerst ergaenzt werden: `id?: string` (oder die Prop-Typen muessen angepasst werden, damit die config_id durchgereicht wird). Ohne diese Ergaenzung ist `sensor.id` immer `undefined`.

### Betroffene Dateien
- `src/components/esp/SensorColumn.vue` — Zeile 64–66 (`:key`-Attribut) + `SensorItem`-Interface (Zeile 19–32) um `id?: string` erweitern

### Akzeptanzkriterien
- [ ] Keine "Duplicate keys" Warnung in der Browser-Console bei Mock-ESP mit SHT31 (2 Sensoren auf gpio=0)
- [ ] Korrekt bei 2x SHT31 (4 Sensoren auf gpio=0, verschiedene I2C-Adressen)
- [ ] Korrekt bei SHT31 + BMP280 (4 Sensoren auf gpio=0)

---

## Bug 2: Dual-Value-Bug — Satellite zeigt ZWEI Werte (NB-T09-05) — KRITISCH

### IST-Zustand (3 Faktoren)

**Faktor 1: Store-Lookup per GPIO (Kernproblem)**
`sensor.store.ts` (Zeile 143–148), Funktion `handleKnownMultiValueSensor`:
```typescript
// AKTUELL — FALSCH (Zeile 148):
let sensor = sensors.find(s => s.gpio === data.gpio)
```
Wenn ein WS-Event fuer `gpio=0` eintrifft, findet `find()` immer den ERSTEN Sensor mit gpio=0 — egal ob es der Temperature- oder Humidity-Eintrag ist. Der zweite Eintrag (z. B. sht31_humidity) wird als `multi_values`-Property auf den ERSTEN gemerged. Das Ergebnis: Eine Satellite-Card zeigt ZWEI Werte ("20.0°C TEMPERATUR" + "20.0%RH LUFTFEUCHTE"), waehrend der zweite Eintrag als verwaiste Satellite-Card mit nur dem Rohwert erscheint.

> **[Korrektur verify-plan]:** Die aufrufende Funktion `handleSensorData` (Zeile 102–138) hat die echte Signatur `(message: SensorDataMessage, devices: ESPDevice[], getDeviceId)` — nicht `(data: SensorData)` wie im SOLL-Code unten gezeigt. Der Fix muss die bestehende Signatur beibehalten und die Logik INNERHALB der Funktion aendern.

**Faktor 2: WebSocket Double-Dispatch**
`useWebSocket.ts` (Zeile 156–164), Funktion `on()` registriert WS-Callbacks doppelt:
```typescript
// Registrierung 1: in messageHandlers Map<string, Set<handler>> (lokal, Zeile 161)
messageHandlers.get(type)!.add(callback)
// Registrierung 2: in websocketService.listeners Map (global, Zeile 164)
const unsubscribeService = websocketService.on(type, callback)
```
`websocket.ts` (Zeile 355–376), `handleMessage()` dispatcht ueber BEIDE Pfade:
1. `this.routeMessage(message)` (Zeile 370) → Subscription-Callback → iteriert `messageHandlers` → Callback
2. `this.listeners.get(message.type)` (Zeile 373–376) → direkter Callback
Resultat: `handleSensorData` wird 2x pro WS-Message aufgerufen, was den Merge-Bug in Faktor 1 verstaerkt.

**Faktor 3: fetchDevice ueberschreibt Store-State**
Nach dem Oeffnen des Config-Panels (Event `@saved`/`@deleted`) wird `fetchDevice()` aufgerufen. Das Backend liefert ZWEI separate MockSensor-Eintraege (sht31_temp + sht31_humidity) — korrekt. Aber der WS-Handler merged trotzdem multi_values auf den ersten Eintrag, weil er per GPIO sucht, nicht per sensor_type.

### SOLL-Zustand

**Fix Faktor 1 — Store-Lookup per sensor_type + GPIO:**
```typescript
// NEU — KORREKT:
function handleSensorData(data: SensorData) {
  // Primaer: Suche per config_id (wenn vom Backend mitgeliefert)
  let existing = data.config_id
    ? sensors.find(s => s.id === data.config_id)
    : null

  // Fallback: GPIO + sensor_type Kombination
  if (!existing) {
    existing = sensors.find(s =>
      s.gpio === data.gpio && s.sensor_type === data.sensor_type
    )
  }

  if (existing) {
    // Wert updaten — NUR auf dem passenden Sensor
    existing.value = data.value
    existing.unit = data.unit
    existing.timestamp = data.timestamp
    // KEIN multi_values Merge mehr noetig!
  }
}
```

Die Funktion `handleKnownMultiValueSensor` wird dadurch **ueberfluessig**, weil das Backend (nach Fix1) bereits gesplittete Eintraege liefert. Jeder WS-Event aktualisiert genau EINEN Sensor-Eintrag.

> **[Korrektur verify-plan]:** Das `SensorDataPayload`-Interface (sensor.store.ts Zeile 34–43) hat aktuell KEIN `config_id`-Feld. Wenn der SOLL-Code `data.config_id` nutzen soll, muss entweder (a) das Backend `config_id` im WS-Event `sensor_data` mitliefern und das Interface erweitert werden, oder (b) der Lookup NUR ueber `gpio + sensor_type` erfolgen (ohne config_id-Primaer-Lookup). Option (b) ist einfacher und reicht fuer den Fix aus.

**Fix Faktor 2 — Double-Dispatch eliminieren:**
```typescript
// useWebSocket.ts Zeile 156-164 — NUR EINEN Registrierungspfad verwenden:
function on(type: MessageType | string, callback: (message: WebSocketMessage) => void): () => void {
  if (!messageHandlers.has(type)) {
    messageHandlers.set(type, new Set())
  }
  messageHandlers.get(type)!.add(callback)
  // NICHT zusaetzlich websocketService.on() aufrufen
  return () => { messageHandlers.get(type)?.delete(callback) }
}
```
ODER: Die `handleMessage`-Funktion in `websocket.ts` (Zeile 355) so aendern, dass sie nur EINEN Dispatch-Pfad nutzt (entweder `routeMessage` oder `listeners`, nicht beide).

**Fix Faktor 3 — fetchDevice-Konsistenz:**
Nach `fetchDevice()` den Store-State so setzen, dass die Sensor-Liste aus der DB-Response die WS-generierten Eintraege ERSETZT (nicht merged). Das verhindert Orphaned-Eintraege.

### Betroffene Dateien
1. `src/shared/stores/sensor.store.ts` — `handleKnownMultiValueSensor` (Zeile 143–192) und `handleSensorData` (Zeile 102–138)
2. `src/composables/useWebSocket.ts` — `on()`-Registrierung (Zeile 156–177)
3. `src/services/websocket.ts` — `handleMessage` Dual-Dispatch (Zeile 355–380: `routeMessage` Zeile 370 + `listeners` Zeile 373–376)

### Akzeptanzkriterien
- [ ] SHT31-Satellite-Card zeigt NUR EINEN Wert (entweder Temperatur ODER Feuchtigkeit, nie beide)
- [ ] Kein verwaister Satellite ohne Wert nach Config-Panel-Interaktion
- [ ] `handleSensorData` wird exakt 1x pro WS-Message aufgerufen (nicht 2x)
- [ ] Bei 2x SHT31 (0x44 + 0x45): 4 Satellites, jeder mit genau 1 Wert
- [ ] Console zeigt keine Fehler bei schnellen WS-Updates (3+ Sensoren pro Sekunde)

---

## Bug 3: Config-Panel oeffnet falschen Sensor (NB-T09-06) — KRITISCH

### IST-Zustand

> **[Korrektur verify-plan]:** Die Event-Kette geht ueber 4 Komponenten, nicht 2. Alle 4 muessen angepasst werden:

**Event-Kette (IST):**
```
SensorColumn.vue (Zeile 83):        emit('sensor-click', sensor.gpio)         → gpio: number
  ↓
ESPOrbitalLayout.vue (Zeile 168-170): handleSensorClick(gpio) → emit('sensorClick', gpio)  → gpio: number
  ↓
DeviceDetailView.vue (Zeile 69-70):  handleSensorClick(gpio) → emit('sensor-click', { espId, gpio })  → { espId, gpio }
  ↓
HardwareView.vue (Zeile 645-658):    handleSensorClickFromDetail(payload: { espId: string; gpio: number })
```

`HardwareView.vue` (Zeile 645–658) empfaengt das Payload-Objekt und sucht den Sensor:
```typescript
function handleSensorClickFromDetail(payload: { espId: string; gpio: number }) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === payload.espId)
  const sensors = (device?.sensors as any[]) || []
  const sensor = sensors.find((s: any) => s.gpio === payload.gpio)  // Findet IMMER den ERSTEN
  if (!sensor) return
  configSensorData.value = { espId: payload.espId, gpio: payload.gpio, sensorType: sensor.sensor_type, unit: sensor.unit }
  showSensorConfig.value = true
}
```

**Screenshot-Nachweis (S42):** Klick auf "Temperature" Satellite (SHT31) oeffnet Config-Panel fuer "sht31_humidity" — das Panel zeigt Einheit "%RH" und Sensor-Typ "sht31_humidity", obwohl der Nutzer auf den Temperatur-Eintrag geklickt hat.

### Warum
Beide SHT31-Eintraege (temp + humidity) haben `gpio=0`. `sensors.find()` liefert immer den ersten Treffer — unabhaengig davon, WELCHE Satellite-Card geklickt wurde. Das Problem ist in ALLEN 4 Stufen der Event-Kette: Nur `gpio` wird durchgereicht, nie `sensor_type`.

### SOLL-Zustand

**Gesamte Event-Kette anpassen — `sensor_type` (und optional `configId`) durchreichen:**

**1. SensorColumn.vue (Zeile 46-48 + 83) — Emit-Typ aendern:**
```typescript
// defineEmits aendern:
'sensor-click': [payload: { configId?: string; gpio: number; sensorType: string }]

// Click-Event (Zeile 83):
@click="emit('sensor-click', { configId: sensor.id, gpio: sensor.gpio, sensorType: sensor.sensor_type })"
```

**2. ESPOrbitalLayout.vue (Zeile 56 + 168-170) — Emit + Handler anpassen:**
```typescript
// emits aendern:
sensorClick: [payload: { configId?: string; gpio: number; sensorType: string }]

// Handler:
function handleSensorClick(payload: { configId?: string; gpio: number; sensorType: string }) {
  emit('sensorClick', payload)
}
```

**3. DeviceDetailView.vue (Zeile 46 + 69-70) — Emit + Handler anpassen:**
```typescript
// emits aendern:
(e: 'sensor-click', payload: { espId: string; gpio: number; sensorType: string; configId?: string }): void

// Handler:
function handleSensorClick(payload: { configId?: string; gpio: number; sensorType: string }) {
  emit('sensor-click', { espId: espStore.getDeviceId(props.device), ...payload })
}
```

**4. HardwareView.vue (Zeile 645-658) — Lookup per sensor_type:**
```typescript
function handleSensorClickFromDetail(payload: { espId: string; gpio: number; sensorType: string; configId?: string }) {
  const device = espStore.devices.find(d => espStore.getDeviceId(d) === payload.espId)
  const sensors = (device?.sensors as any[]) || []

  // Primaer: per gpio + sensor_type (eindeutig fuer Multi-Value)
  let sensor = sensors.find((s: any) => s.gpio === payload.gpio && s.sensor_type === payload.sensorType)
  // Fallback: nur GPIO (Rueckwaertskompatibilitaet fuer Single-Value)
  if (!sensor) sensor = sensors.find((s: any) => s.gpio === payload.gpio)
  if (!sensor) return

  configSensorData.value = {
    espId: payload.espId,
    gpio: payload.gpio,
    sensorType: sensor.sensor_type || 'unknown',
    unit: sensor.unit || '',
  }
  showSensorConfig.value = true
}
```

> **[Korrektur verify-plan]:** Die Funktion setzt `configSensorData.value` + `showSensorConfig.value = true` — es gibt KEINE `openConfigPanel(sensor)`-Funktion. Ausserdem muss `configSensorData`-Typ (Zeile 227) um optionales `configId` erweitert werden fuer Bug 4.

### Betroffene Dateien
1. `src/components/esp/SensorColumn.vue` — Zeile 46-48 (emit-Type) + Zeile 83 (emit-Call)
2. `src/components/esp/ESPOrbitalLayout.vue` — Zeile 56 (emit-Type) + Zeile 168-170 (Handler)
3. `src/components/esp/DeviceDetailView.vue` — Zeile 46 (emit-Type) + Zeile 69-70 (Handler)
4. `src/views/HardwareView.vue` — Zeile 645-658 (`handleSensorClickFromDetail`)

### Akzeptanzkriterien
- [ ] Klick auf SHT31-Temperature-Satellite oeffnet Config-Panel mit sensor_type=`sht31_temp`, Einheit=`°C`
- [ ] Klick auf SHT31-Humidity-Satellite oeffnet Config-Panel mit sensor_type=`sht31_humidity`, Einheit=`%RH`
- [ ] Klick auf DS18B20-Satellite oeffnet korrektes Config-Panel (Rueckwaertskompatibilitaet)
- [ ] Klick auf BMP280-Temperature vs. BMP280-Pressure oeffnet jeweils das richtige Panel

---

## Bug 4: Frontend DELETE API nutzt GPIO statt config_id (NB-T09-09) — MITTEL

### IST-Zustand

> **[Korrektur verify-plan]:** Die Funktion ist KEINE standalone-Funktion `deleteSensor()`, sondern eine Methode auf dem `sensorsApi`-Objekt: `sensorsApi.delete()`.

`src/api/sensors.ts` (Zeile 33–35):
```typescript
async delete(espId: string, gpio: number): Promise<void> {
  await api.delete(`/sensors/${espId}/${gpio}`)
}
```
Der Server-Endpunkt wurde in Fix1-E auf `DELETE /sensors/{esp_id}/{config_id}` (UUID) umgestellt (sensors.py Zeile 887–899: `config_id: uuid.UUID`). Das Frontend sendet aber noch `gpio` (z. B. `0`) als zweiten Parameter. FastAPI versucht `"0"` als UUID zu parsen → `422 Unprocessable Entity`.

Aufrufer in `SensorConfigPanel.vue` (Zeile 265–278):
```typescript
if (isMock) {
  await espStore.removeSensor(props.espId, props.gpio)   // Mock-Pfad: debugApi
} else {
  await sensorsApi.delete(props.espId, props.gpio)        // Real-ESP-Pfad: HIER ist der Bug
}
```

### SOLL-Zustand
```typescript
// src/api/sensors.ts
async delete(espId: string, configId: string): Promise<void> {
  await api.delete(`/sensors/${espId}/${configId}`)
}
```

Alle Aufrufer von `sensorsApi.delete()` muessen `config_id` (UUID) statt `gpio` uebergeben.

> **[Korrektur verify-plan]:** `SensorConfigPanel.vue` bekommt aktuell nur `espId`, `gpio`, `sensorType`, `unit` als Props (Zeile 34–41). Fuer den Fix braucht es zusaetzlich `configId?: string` als Prop. Das bedeutet: Die `configSensorData`-Struktur in `HardwareView.vue` (Zeile 227) muss ebenfalls um `configId` erweitert werden, und die gesamte Event-Kette aus Bug 3 muss `configId` durchreichen. **Bug 3 und Bug 4 sind dadurch gekoppelt.**
>
> Der Mock-ESP-Pfad (`espStore.removeSensor`) nutzt `debugApi.removeSensor(deviceId, gpio)` — dieser ist ein separater Endpoint und NICHT von der config_id-Umstellung betroffen.

### Betroffene Dateien
1. `src/api/sensors.ts` — Zeile 33–35 (Methodensignatur + URL)
2. `src/components/esp/SensorConfigPanel.vue` — Zeile 270 (Aufrufer) + Props-Interface um `configId?: string` erweitern
3. `src/views/HardwareView.vue` — Zeile 227 (`configSensorData`-Typ um `configId` erweitern)

### Akzeptanzkriterien
- [ ] `deleteSensor()` sendet UUID als zweiten Path-Parameter
- [ ] Einzelnen SHT31-Humidity loeschen funktioniert (SHT31-Temperature bleibt)
- [ ] Keine 422-Fehler in Console bei Sensor-Loeschung
- [ ] Nach Loeschung: Store + UI aktualisiert (kein Ghost-Satellite)

---

## Bug 5: Satellite-Reihenfolge wechselt bei jedem Render (NB-T09-10) — MITTEL

### IST-Zustand
`SensorColumn.vue` (Zeile 64–66) rendert:
```html
<SensorSatellite v-for="(sensor, idx) in sensors" ...>
```
Das `sensors`-Array ist nicht deterministisch sortiert. Die Reihenfolge haengt davon ab, welcher WS-Event zuerst eintrifft. Bei jedem Render/Refresh kann ein SHT31-Temperature-Satellite oben oder unten erscheinen — das verwirrt den Nutzer.

### SOLL-Zustand
Ein `computed` Property das die Sensoren deterministisch sortiert:
```typescript
const sortedSensors = computed(() => {
  return [...props.sensors].sort((a, b) => {
    // 1. Nach sensor_type alphabetisch (humidity vor temp, pressure vor temp)
    const typeCompare = (a.sensor_type || '').localeCompare(b.sensor_type || '')
    if (typeCompare !== 0) return typeCompare
    // 2. Bei gleichem Typ: nach I2C-Adresse
    return (a.i2c_address || 0) - (b.i2c_address || 0)
  })
})
```
Dann im Template `sortedSensors` statt `sensors` verwenden.

### Betroffene Dateien
1. `src/components/esp/SensorColumn.vue` — Zeile ~65 (v-for) + neues `computed`

### Akzeptanzkriterien
- [ ] SHT31-Satellites erscheinen immer in gleicher Reihenfolge (z. B. Humidity vor Temperature)
- [ ] Reihenfolge bleibt stabil nach WS-Updates
- [ ] Reihenfolge bleibt stabil nach Page-Refresh

---

## Fix-Reihenfolge (Abhaengigkeiten)

```
1. NB-T09-03 (Duplicate Keys)     ← ZUERST, da Vue sonst falsch recycled (SensorItem.id ergaenzen!)
2. NB-T09-05 (Dual-Value Store)   ← haengt von korrekten Keys ab
3. NB-T09-06 (Wrong Config Panel) ← 4-Komponenten Event-Kette, NICHT eigenstaendig (→ Bug 4 braucht configId)
4. NB-T09-09 (DELETE API)         ← GEKOPPELT mit Bug 3 (configId muss durch Event-Kette fliessen)
5. NB-T09-10 (Sortierung)         ← eigenstaendig, am Ende
```

> **[Korrektur verify-plan]:** Bug 3 und Bug 4 sind NICHT unabhaengig. Bug 4 braucht `configId` im SensorConfigPanel, und `configId` kommt durch dieselbe 4-Stufen-Event-Kette die in Bug 3 angepasst wird. Empfehlung: Bug 3 + Bug 4 zusammen implementieren (gleiche Event-Kette).

Empfehlung: Bug 1 zuerst fixen (inkl. `SensorItem.id`-Erweiterung), dann Bug 2, dann Bug 3+4 zusammen (Event-Kette + DELETE API), zuletzt Bug 5.

---

## Was NICHT gemacht wird

- **Backend-Aenderungen** — der Server liefert bereits korrekte Daten (Fix1 verifiziert)
- **Neue Sensor-Typen hinzufuegen** — nur bestehende Multi-Value-Sensoren korrekt anzeigen
- **Monitor-View umbauen** — Cross-View-Konsistenz war in T09 bereits MATCH (7/7)
- **AddSensorModal aendern** — funktioniert korrekt (Info-Text, Multi-Value-Hinweis)
- **Performance-Optimierung** (shallowRef, RAF-Batching) — separater Auftrag
- **WebSocket Ready-Gate Pattern** — separater Auftrag, nicht Teil dieses Fixes

---

## Testplan

Nach allen 5 Fixes diese Sequenz durchlaufen:

1. Mock-ESP erstellen
2. SHT31 hinzufuegen (0x44) → 2 Satellites pruefen (je 1 Wert)
3. Zweiten SHT31 hinzufuegen (0x45) → 4 Satellites, stabile Reihenfolge
4. Klick auf Temperature-Satellite → Config-Panel zeigt sht31_temp, °C
5. Klick auf Humidity-Satellite → Config-Panel zeigt sht31_humidity, %RH
6. Humidity-Sensor loeschen → 3 Satellites, Temperature bleibt
7. BMP280 hinzufuegen → 2 weitere Satellites (temp + pressure)
8. Console pruefen: Keine Warnungen, keine Fehler
9. 30 Sekunden warten, WS-Updates beobachten: Keine Dual-Values, stabile Reihenfolge
