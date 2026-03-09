# Auftrag T10-Fix-D: MiniCard Overflow-Zaehlung + Live-Preview Humidity-Wert

> **Bezug:** T10-Verifikationsbericht Phase 7 + Phase 3 — NB-T10-04 LOW, NB-T10-07 LOW
> **Prioritaet:** NIEDRIG — kosmetische Bugs, keine Funktionsblockade
> **Bereich:** El Frontend (Vue 3) — DeviceMiniCard.vue, SensorConfigPanel.vue
> **Datum:** 2026-03-08
> **Abhaengigkeit:** Keine — kann unabhaengig von Fix-A/B/C umgesetzt werden

---

## Problem 1: MiniCard Overflow-Zaehlung (NB-T10-04)

### IST

Die L1 MiniCard (DeviceMiniCard.vue) zeigt Sensor-Zeilen an. Bei mehr als 4 Zeilen (`MAX_VISIBLE_SENSORS = 4`, Zeile 94) wird ein "+X weitere" Overflow-Text angezeigt.

**[verify-plan Korrektur]** Die Overflow-Berechnung in `extraSensorsCount` (Zeile 137-143) ist BEREITS dynamisch und korrekt: `totalValues - MAX_VISIBLE_SENSORS`. Das Template (Zeile 247) rendert `+{{ extraSensorsCount }} weitere` — NICHT hardcoded. Der Bug liegt NICHT in der Berechnung, sondern in einer **Zaehl-Diskrepanz**: Die Status-Zeile zeigt `sensorCount` (= `sensors.length`, also Roh-Array-Laenge, Zeile 154-157), waehrend `extraSensorsCount` ueber `groupSensorsByBaseType()` zaehlt, die Multi-Value-Sensoren gruppiert und ggf. Base-Type-Eintraege ueberspringt. Beispiel: 7 Sensoren im Array (→ "7S"), aber nach Gruppierung nur 5 totalValues → Overflow = 5 - 4 = "+1 weitere". Das ist technisch korrekt, aber fuer den User verwirrend (7S angezeigt, aber nur +1 weitere).

**Screenshot S25** zeigt die L1-Uebersicht mit 2 ESPs. Beim Mock #08E2 werden die Sensor-Zeilen angezeigt, aber der Overflow-Zaehler zeigt "+1 weitere" — vermutlich weil `groupSensorsByBaseType()` weniger Values produziert als `sensors.length`.

### SOLL

**[verify-plan Korrektur]** Die Overflow-Formel ist bereits korrekt (Zeile 141: `grouped.reduce((sum, g) => sum + g.values.length, 0)` minus `MAX_VISIBLE_SENSORS`). Das eigentliche Problem ist die **Inkonsistenz zwischen Status-Anzeige und Overflow**: `sensorCount` (Zeile 154-157) zaehlt `sensors.length` (Roh-Array), `extraSensorsCount` zaehlt gruppierte Values. Bei Multi-Value-Sensoren weichen diese ab.

**Loesung — EINE der beiden Optionen:**

Option A: `sensorCount` ebenfalls auf gruppierte Values umstellen:
```typescript
// DeviceMiniCard.vue — Zeile 154-157 ersetzen
const sensorCount = computed(() => {
  const sensors = props.device.sensors as RawSensor[] | undefined
  if (!sensors || sensors.length === 0) return props.device.sensor_count ?? 0
  const grouped = groupSensorsByBaseType(sensors)
  return grouped.reduce((sum, g) => sum + g.values.length, 0)
})
```

Option B: Overflow-Berechnung auf `sensors.length` umstellen (einfacher, aber zeigt dann ggf. Base-Types die nicht sichtbar sind).

**Empfehlung:** Option A — dann stimmen "7S" und "+3 weitere" (7 - 4 = 3) ueberein.

**Ursache (verifiziert):** `groupSensorsByBaseType()` ueberspringt Base-Type-Eintraege (z.B. "SHT31") wenn bereits individuelle Sub-Types ("sht31_temp", "sht31_humidity") vorhanden sind (sensorDefaults.ts:1101-1118). Dadurch hat `totalValues` weniger Eintraege als `sensors.length`.

---

## Problem 2: Live-Preview Humidity-Wert (NB-T10-07)

### IST

Im Config-Panel gibt es eine aufklappbare Sektion "Live-Vorschau" (SensorConfigPanel.vue:792-801). Diese rendert die **separate Komponente** `LiveDataPreview.vue` (El Frontend/src/components/esp/LiveDataPreview.vue).

**[verify-plan Korrektur]** LiveDataPreview hat KEINEN hardcoded Default von "22.0". `currentValue` startet als `null` und zeigt "--" bis WebSocket-Daten eintreffen (LiveDataPreview.vue:27, 94-98). Der Wert "22.0 %RH" fuer Humidity kommt daher, dass LiveDataPreview nur nach `espId + gpio` filtert (Zeile 46), aber NICHT nach `sensor_type`. Bei SHT31 (temp + humidity auf demselben GPIO) empfaengt die Komponente BEIDE Werte und zeigt den zuletzt eingetroffenen. Wenn `sht31_temp` (22.0) NACH `sht31_humidity` (55.0) eintrifft, wird 22.0 angezeigt — auch im Humidity-Panel.

Die Satellites neben dem Panel zeigen korrekt "55.0 %RH" weil sie per `sensor_type` filtern.

### SOLL

**[verify-plan Korrektur]** Der Fix muss in `LiveDataPreview.vue` erfolgen — NICHT in SensorConfigPanel.vue (dort wird LiveDataPreview nur eingebunden). LiveDataPreview braucht eine zusaetzliche `sensorType`-Prop um im WebSocket-Handler nach `sensor_type` zu filtern.

**Schritt 1: LiveDataPreview.vue — sensorType-Prop hinzufuegen + Filter erweitern**
```typescript
// LiveDataPreview.vue — Props erweitern (Zeile 14-21)
interface Props {
  espId: string
  gpio: number
  unit?: string
  sensorType?: string  // NEU: z.B. 'sht31_humidity'
}

// handleMessage (Zeile 34-63) — sensor_type Filter hinzufuegen
function handleMessage(msg: WebSocketMessage): void {
  const data = msg.data as {
    esp_id?: string; device_id?: string
    gpio?: number; value?: number; quality?: string
    sensor_type?: string  // WebSocket-Payload enthaelt sensor_type
  }
  const espId = data.esp_id || data.device_id
  if (espId !== props.espId || data.gpio !== props.gpio) return
  // NEU: Bei Multi-Value-Sensoren nur den passenden Sub-Type akzeptieren
  if (props.sensorType && data.sensor_type
      && data.sensor_type.toLowerCase() !== props.sensorType.toLowerCase()) return
  // ... rest bleibt gleich
}
```

**Schritt 2: SensorConfigPanel.vue — sensorType durchreichen (Zeile 799)**
```vue
<!-- VORHER -->
<LiveDataPreview :esp-id="espId" :gpio="gpio" :unit="unitValue || defaultUnit" />
<!-- NACHHER -->
<LiveDataPreview :esp-id="espId" :gpio="gpio" :sensor-type="sensorType" :unit="unitValue || defaultUnit" />
```

`sensorType` ist bereits als Prop in SensorConfigPanel verfuegbar (Zeile 38).

---

## Was NICHT gemacht wird

- Keine Backend-Aenderungen
- Keine Aenderung an der Sensor-Erstellung oder Delete-Logik
- Keine Aenderung am Config-Panel-Routing (das ist Fix-C)

---

## Akzeptanzkriterien

### MiniCard (NB-T10-04)

**[verify-plan Korrektur]** MAX_VISIBLE_SENSORS = **4** (nicht 3). Kriterien angepasst:

1. **7 gruppierte Values:** MiniCard zeigt 4 Zeilen + "+3 weitere", Status-Zeile zeigt "7S"
2. **5 gruppierte Values:** MiniCard zeigt 4 Zeilen + "+1 weitere"
3. **4 gruppierte Values:** MiniCard zeigt 4 Zeilen, kein Overflow-Text
4. **2 gruppierte Values:** MiniCard zeigt 2 Zeilen, kein Overflow-Text
5. **Konsistenz:** Die "XS"-Zahl in der Status-Zeile und der Overflow-Zaehler muessen auf derselben Zaehlbasis basieren (gruppierte Values)

### Live-Preview (NB-T10-07)

**[verify-plan Korrektur]** LiveDataPreview zeigt "--" bis WebSocket-Daten eintreffen (kein Default). Kriterien:

6. **sht31_humidity Config-Panel:** Live-Vorschau zeigt Humidity-Wert (55.0 %RH bei Mock), NICHT den Temperatur-Wert vom selben GPIO
7. **sht31_temp Config-Panel:** Live-Vorschau zeigt Temperatur-Wert (22.0 °C bei Mock), NICHT den Humidity-Wert
8. **Vor Datenempfang:** Live-Vorschau zeigt "--" (nicht 22.0 oder 55.0)
9. **Konsistenz:** Live-Vorschau-Wert = Satellite-Wert daneben (beide filtern nach sensor_type)

---

## Betroffene Dateien (verifiziert)

**[verify-plan Korrektur]** Dateiliste war unvollstaendig. Korrigiert:

| Datei | Aenderung |
|-------|-----------|
| `DeviceMiniCard.vue` | `sensorCount` computed (Zeile 154-157) auf `groupSensorsByBaseType` umstellen, damit Status-Anzeige und Overflow konsistent zaehlen |
| `LiveDataPreview.vue` | **NEU** — `sensorType`-Prop hinzufuegen + `handleMessage` um sensor_type-Filter erweitern |
| `SensorConfigPanel.vue` | Zeile 799: `:sensor-type="sensorType"` an LiveDataPreview durchreichen |
