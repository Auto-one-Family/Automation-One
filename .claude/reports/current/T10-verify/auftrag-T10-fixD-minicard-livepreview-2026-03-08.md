# Auftrag T10-Fix-D: MiniCard Overflow-Zaehlung + Live-Preview Humidity-Wert

> **Bezug:** T10-Verifikationsbericht Phase 7 + Phase 3 — NB-T10-04 LOW, NB-T10-07 LOW
> **Prioritaet:** NIEDRIG — kosmetische Bugs, keine Funktionsblockade
> **Bereich:** El Frontend (Vue 3) — DeviceMiniCard.vue, SensorConfigPanel.vue
> **Datum:** 2026-03-08
> **Abhaengigkeit:** Keine — kann unabhaengig von Fix-A/B/C umgesetzt werden

---

## Problem 1: MiniCard Overflow-Zaehlung (NB-T10-04)

### IST

Die L1 MiniCard (DeviceMiniCard.vue) zeigt Sensor-Zeilen an. Bei mehr als N Zeilen (wahrscheinlich 3) wird ein "+X weitere" Overflow-Text angezeigt. Die Zaehlung ist aber FALSCH:

**Beispiel:** ESP hat 7 Sensoren. MiniCard zeigt 3 Zeilen + "+1 weitere". Korrekt waere "+4 weitere" (7 - 3 = 4).

**Screenshot S25** zeigt die L1-Uebersicht mit 2 ESPs. Beim Mock #08E2 werden die Sensor-Zeilen angezeigt, aber der Overflow-Zaehler zeigt "+1 weitere" statt "+N weitere" mit der korrekten Differenz.

### SOLL

```typescript
// DeviceMiniCard.vue — Overflow-Berechnung
const MAX_VISIBLE_SENSORS = 3  // oder whatever die aktuelle Grenze ist
const overflowCount = computed(() => {
  const total = sensors.value.length
  if (total <= MAX_VISIBLE_SENSORS) return 0
  return total - MAX_VISIBLE_SENSORS  // z.B. 7 - 3 = 4
})

// Template:
// VORHER (vermutlich): "+1 weitere" (hardcoded oder falsche Berechnung)
// NACHHER: `+${overflowCount} weitere`
```

**Moegliche Ursachen:**
- Hardcoded "+1" statt dynamisch berechnet
- Zaehlt `sensorTypes` statt `sensorConfigs` (1 SHT31 = 1 Typ, aber 2 Sub-Configs)
- Zaehlt physische Sensoren statt Sub-Configs (1 SHT31 = 2 Sub-Configs: temp + humidity)

**Pruefpunkt:** Die MiniCard muss die Anzahl der sensor_configs zaehlen (also Sub-Configs nach Multi-Value-Split), nicht die Anzahl der physischen Sensoren oder Sensor-Typen.

---

## Problem 2: Live-Preview Humidity-Wert (NB-T10-07)

### IST

Im Config-Panel gibt es eine aufklappbare Sektion "Live-Vorschau". Diese zeigt den aktuellen Sensor-Wert an. Fuer Humidity-Sensoren zeigt sie "22.0 %RH" — das ist der DEFAULT-WERT fuer TEMPERATUR, nicht fuer Humidity.

Der korrekte Default fuer Humidity ist 55.0 (wurde in T09-Fix-B als Mock-Default etabliert). Die Satellites neben dem Panel zeigen korrekt "55.0 %RH". Nur die Live-Vorschau IM Panel zeigt den falschen Wert.

### SOLL

Die Live-Vorschau im SensorConfigPanel muss den Wert aus der gleichen Quelle lesen wie die Satellites — naemlich aus dem aktuellen Sensor-State (Store oder WebSocket-Daten).

```typescript
// SensorConfigPanel.vue — Live-Vorschau
const liveValue = computed(() => {
  // VORHER (FALSCH — vermutlich):
  // return sensorConfig.value?.raw_value ?? 22.0  // Default 22.0 ist Temperatur-Default

  // NACHHER (RICHTIG):
  // Den aktuellen Wert aus dem Store/WebSocket lesen, nicht den Config-Default
  const currentData = sensorStore.getLatestReading(props.configId)
  if (currentData?.value !== undefined) {
    return currentData.value
  }
  // Fallback: typ-spezifischer Default
  return getDefaultForSensorType(props.sensorType)
  // sht31_humidity → 55.0, sht31_temp → 22.0, bmp280_pressure → 1013.25
})
```

**Moegliche Ursache:** Die Live-Vorschau liest `config.raw_value` statt den aktuellen Live-Wert. Bei Multi-Value-Sensoren wurde in T09-Fix-B festgelegt, dass Sub-Typen mit `None` als raw_value erstellt werden und eigene Defaults bekommen (temp=22, humidity=55, pressure=1013.25). Wenn die Live-Vorschau `raw_value ?? 22.0` macht, bekommt Humidity den Temperatur-Default.

---

## Was NICHT gemacht wird

- Keine Backend-Aenderungen
- Keine Aenderung an der Sensor-Erstellung oder Delete-Logik
- Keine Aenderung am Config-Panel-Routing (das ist Fix-C)

---

## Akzeptanzkriterien

### MiniCard (NB-T10-04)
1. **7 Sensoren:** MiniCard zeigt 3 Zeilen + "+4 weitere" (nicht "+1 weitere")
2. **4 Sensoren:** MiniCard zeigt 3 Zeilen + "+1 weitere"
3. **3 Sensoren:** MiniCard zeigt 3 Zeilen, kein Overflow-Text
4. **2 Sensoren:** MiniCard zeigt 2 Zeilen, kein Overflow-Text

### Live-Preview (NB-T10-07)
5. **sht31_humidity Config-Panel:** Live-Vorschau zeigt "55.0 %RH" (nicht "22.0 %RH")
6. **sht31_temp Config-Panel:** Live-Vorschau zeigt "22.0 °C" (unveraendert korrekt)
7. **bmp280_pressure Config-Panel:** Live-Vorschau zeigt "1013.3 hPa"
8. **Konsistenz:** Live-Vorschau-Wert = Satellite-Wert daneben (identische Quelle)

---

## Betroffene Dateien (geschaetzt)

| Datei | Aenderung |
|-------|-----------|
| `DeviceMiniCard.vue` | Overflow-Zaehlung: `total - MAX_VISIBLE` statt Fehlberechnung |
| `SensorConfigPanel.vue` | Live-Vorschau: Wert aus Store/WebSocket statt raw_value-Fallback |
