# TM-Briefing: Dashboard UX Reorganisation

> **Datum:** 2026-03-02
> **Scope:** Reine Frontend-Reorganisation — keine neuen APIs, keine Breaking Changes
> **Prinzip:** Alle Daten sind bereits im Frontend verfügbar. Es geht ausschließlich um Reorganisation der Darstellung und Navigation.

---

## Analyseergebnis 1: Übersicht Tab (`/hardware`) — Cockpit-Upgrade

### IST-Zustand (Visuell verifiziert via Playwright)

Die Übersicht zeigt 2 Zonen ("Test", "Testneu") als Akkordeon-Sektionen mit DeviceMiniCards darin.

**Was man sieht:**
- Zone-Header: Name + `Ø 14.7°C` + `2 ESPs · 1/2 Online` + ⚠ 1
- DeviceMiniCards: Status-Dot, Device-Name, MOCK-Badge, Status-Text ("Online"/"Offline"), Sensor-Count ("1S"/"2S"), max 4 Sensor-Zeilen mit Icon + Wert + Unit, Overflow-Menü + Chevron

**Was man NICHT sieht:**
- Kein Trend (steigend/fallend/stabil) — nur statische Zahlenwerte
- Keine Farbkodierung der Werte (alle gleich weiß, egal ob Wert normal/warning/alarm)
- Keine Sparklines — `useSparklineCache` Composable existiert aber wird auf `/hardware` nicht genutzt
- Keine KPI-Leiste pro Zone (Min/Max/Avg, Alarmzähler) — obwohl `zoneKPIs` Computed in MonitorView bereits alles berechnet
- Keine "letzte Aktivität" als Zeitstempel auf Zone-Ebene — obwohl `formatRelativeTime()` bereitsteht
- Health-Ampel nur als kleiner Status-Dot, nicht als prominente Zone-Gesundheitsanzeige

### Betroffene Dateien

| Datei | Zeilen | Was dort passiert |
|-------|--------|-------------------|
| [ZonePlate.vue](El Frontend/src/components/dashboard/ZonePlate.vue) | 1-200 | Zone-Akkordeon: Header mit Name, Stats, Aggregation. `aggregateZoneSensors()` (Z106) liefert bereits Ø-Werte, aber keine Trends/Sparklines |
| [ZonePlate.vue:81-112](El Frontend/src/components/dashboard/ZonePlate.vue#L81-L112) | 81-112 | `stats` Computed: `total`, `online`, `warnings` — fehlt: `lastActivity`, `healthStatus`, KPI-Berechnung |
| [ZonePlate.vue:106](El Frontend/src/components/dashboard/ZonePlate.vue#L106) | 106 | `zoneAggregation = aggregateZoneSensors(props.devices)` — Rohdaten vorhanden, Sparklines fehlen |
| [DeviceMiniCard.vue](El Frontend/src/components/dashboard/DeviceMiniCard.vue) | 1-160 | Mini-Card: Sensor-Zeilen via `groupSensorsByBaseType()`. `qualityToValueColor()` existiert (Z96-101) aber zeigt nur weiß/muted |
| [DeviceMiniCard.vue:111-133](El Frontend/src/components/dashboard/DeviceMiniCard.vue#L111-L133) | 111-133 | `sensorDisplays` Computed: Zeigt label + value + unit — fehlt: Trend-Pfeile, Farbkodierung nach Schwellwert |
| [useSparklineCache.ts](El Frontend/src/composables/useSparklineCache.ts) | 1-57 | Sparkline-Cache: Sammelt Datenpunkte pro Sensor, 5s Dedup, max 30 Punkte. Wird nur in MonitorView importiert, NICHT in HardwareView |

### Vorhandene Bausteine (kein Neubau nötig)

| Baustein | Ort | Bereit? |
|----------|-----|---------|
| `aggregateZoneSensors()` | [sensorDefaults.ts](El Frontend/src/utils/sensorDefaults.ts) | ✅ Liefert Ø-Werte pro Sensor-Typ |
| `useSparklineCache` | [useSparklineCache.ts](El Frontend/src/composables/useSparklineCache.ts) | ✅ Muss nur in HardwareView importiert werden |
| `zoneKPIs` Computed | [MonitorView.vue:832-906](El Frontend/src/views/MonitorView.vue#L832-L906) | ⚠ Aktuell MonitorView-lokal. Muss in Composable extrahiert werden |
| `qualityToStatus()` | [formatters.ts:628-633](El Frontend/src/utils/formatters.ts#L628-L633) | ✅ Mapped Quality → good/warning/alarm/offline |
| `formatRelativeTime()` | [formatters.ts:34](El Frontend/src/utils/formatters.ts#L34) | ✅ Zeitstempel → "vor 11 Sekunden" |
| `getZoneHealthStatus()` | [MonitorView.vue](El Frontend/src/views/MonitorView.vue) (innerhalb zoneKPIs) | ⚠ MonitorView-lokal, muss extrahiert werden |

### Konkrete Änderungen

**A. ZonePlate aufwerten:**
1. **Sparklines inline:** `useSparklineCache` in [HardwareView.vue](El Frontend/src/views/HardwareView.vue) importieren, Sparkline-Daten an ZonePlate weiterreichen. Für Temperatur und Humidity je ein Mini-Sparkline im Zone-Header neben dem Ø-Wert.
2. **Health-Ampel prominenter:** Aktuell nur Farbe des oberen Rands (`zone-plate--warning`, `zone-plate--healthy`). Stattdessen: Farbiger Badge im Header (wie MonitorView L1 "⚠ Warnung" / "✕ Alarm" / "✓ OK").
3. **Letzte Aktivität:** Zeitstempel im Zone-Header: "vor 11 Sekunden" / "Keine Daten". Daten kommen aus `device.last_seen` oder Sensor-`last_read`.
4. **KPI-Leiste:** Kompakte Zeile unter dem Zone-Header: `Ø 22.1°C | Min 14.7°C | Max 24.5°C | ⚠ 1 Alarm`. Berechnung aus `zoneKPIs`-Logik (muss in Composable extrahiert werden).

**B. DeviceMiniCard aufwerten:**
1. **Trend-Pfeile:** Neben jedem Sensorwert ein TrendingUp/TrendingDown/Minus Icon. Berechnung: Vergleich aktueller Wert vs. Sparkline-Cache-Durchschnitt der letzten 5 Punkte.
2. **Farbkodierte Wertbereiche:** `qualityToValueColor()` (Z96-101) bereits vorhanden, nutzt aber nur `var(--color-text-primary)` für "normal". Erweitern: grün für "good", gelb für "warning", rot für "alarm" basierend auf `qualityToStatus()`.

**C. Composable-Extraktion (Voraussetzung):**
- `zoneKPIs`-Logik aus [MonitorView.vue:832-906](El Frontend/src/views/MonitorView.vue#L832-L906) in neues Composable `useZoneKPIs.ts` extrahieren
- `getZoneHealthStatus()` dorthin verschieben
- In MonitorView UND HardwareView importieren → Single Source of Truth

### Aufwand: MITTEL
- ZonePlate + DeviceMiniCard erweitern (Template + Script)
- Composable-Extraktion aus MonitorView
- Keine neuen Komponenten, keine neuen APIs

---

## Analyseergebnis 2: Monitor Tab (`/monitor`) — Zone-Navigation auf L2

### IST-Zustand (Visuell verifiziert via Playwright)

**L1 (`/monitor`):** 2 Zone-Kacheln nebeneinander mit Health-Badge, Ø-Temperatur, Sensor/Aktoren-Count, letzte Aktivität. Klick → L2.

**L2 (`/monitor/test`):** Zone-Detail mit "← Zurück"-Button oben links. Zeigt Zone-Dashboards (2 Auto-Dashboards), Sensoren (3) in Subzone-Akkordeon, Aktoren (3) in Subzone-Akkordeon. Sidebar rechts zeigt Dashboard-Preview mit Sparkline.

**Problem:** Auf L2 gibt es **KEINEN** direkten Zone-Wechsel. Um von Zone "Test" zu Zone "Testneu" zu wechseln:
1. "← Zurück" klicken → zurück zu L1
2. Zone "Testneu" klicken → L2 von Testneu

Das sind 2 Klicks + 2 Route-Wechsel für etwas, das 1 Klick sein sollte.

### Betroffene Dateien

| Datei | Zeilen | Was dort passiert |
|-------|--------|-------------------|
| [MonitorView.vue:1086-1096](El Frontend/src/views/MonitorView.vue#L1086-L1096) | 1086-1096 | Navigation: `goToZone(zoneId)` = router.push, `goBack()` = router.push({name: 'monitor'}). KEIN prevZone/nextZone |
| [MonitorView.vue:832-906](El Frontend/src/views/MonitorView.vue#L832-L906) | 832-906 | `zoneKPIs` Computed: Sortierte Zone-Liste mit allen KPIs. **Daraus lässt sich trivial prevZone/nextZone ableiten** |
| [MonitorView.vue:1334](El Frontend/src/views/MonitorView.vue#L1334) | ~1334 | Template: `<button class="monitor-view__back" @click="goBack">` — nur Zurück-Button, keine Prev/Next-Pfeile |
| [useSwipeNavigation.ts](El Frontend/src/composables/useSwipeNavigation.ts) | 1-156 | Swipe-Composable: `onSwipeLeft`/`onSwipeRight` Callbacks. Aktuell nur in AppShell für Sidebar-Swipe verwendet, NICHT im Monitor |
| [useKeyboardShortcuts.ts](El Frontend/src/composables/useKeyboardShortcuts.ts) | 1-127 | Keyboard-Shortcuts: Singleton-Registry mit Scope-System. Aktuell nur Escape für Back registriert. ArrowLeft/ArrowRight NICHT registriert |
| [HardwareView.vue](El Frontend/src/views/HardwareView.vue) | — | Nutzt `useSwipeNavigation` und `useKeyboardShortcuts` bereits — Pattern kann 1:1 in MonitorView übernommen werden |

### Vorhandene Bausteine (kein Neubau nötig)

| Baustein | Ort | Bereit? |
|----------|-----|---------|
| `zoneKPIs` sortierte Liste | [MonitorView.vue:832](El Frontend/src/views/MonitorView.vue#L832) | ✅ Liefert geordnete Zone-IDs |
| `useSwipeNavigation` | [useSwipeNavigation.ts](El Frontend/src/composables/useSwipeNavigation.ts) | ✅ Nur `onSwipeLeft`/`onSwipeRight` binden |
| `useKeyboardShortcuts` | [useKeyboardShortcuts.ts](El Frontend/src/composables/useKeyboardShortcuts.ts) | ✅ ArrowLeft/ArrowRight registrieren |
| `router.replace` | Vue Router | ✅ Zone-Wechsel = `router.replace({ name: 'monitor-zone', params: { zoneId: nextZoneId } })` |

### Konkrete Änderungen

**A. Computed für Prev/Next (in MonitorView.vue Script):**
```typescript
const sortedZoneIds = computed(() => zoneKPIs.value.map(z => z.zoneId))
const currentZoneIndex = computed(() => {
  if (!selectedZoneId.value) return -1
  return sortedZoneIds.value.indexOf(selectedZoneId.value)
})
const prevZoneId = computed(() => sortedZoneIds.value[currentZoneIndex.value - 1] ?? null)
const nextZoneId = computed(() => sortedZoneIds.value[currentZoneIndex.value + 1] ?? null)

function goToPrevZone() {
  if (prevZoneId.value) router.replace({ name: 'monitor-zone', params: { zoneId: prevZoneId.value } })
}
function goToNextZone() {
  if (nextZoneId.value) router.replace({ name: 'monitor-zone', params: { zoneId: nextZoneId.value } })
}
```

**B. Keyboard-Shortcuts registrieren:**
```typescript
const { register } = useKeyboardShortcuts()
onMounted(() => {
  register({ key: 'ArrowLeft', handler: () => goToPrevZone(), description: 'Vorherige Zone', scope: 'monitor' })
  register({ key: 'ArrowRight', handler: () => goToNextZone(), description: 'Nächste Zone', scope: 'monitor' })
})
```

**C. Swipe-Navigation binden:**
Auf L2 den `useSwipeNavigation`-Composable auf den Main-Content-Bereich binden:
- SwipeLeft → `goToNextZone()`
- SwipeRight → `goToPrevZone()`

**D. Template: Navigations-Pfeile im L2-Header:**
Neben dem "← Zurück"-Button zwei Pfeil-Buttons:
```
← Zurück     ‹ Test (1/2) ›
```
- `‹` disabled wenn keine prevZone
- `›` disabled wenn keine nextZone
- Aktive Zone + Position als Label: "Test (1/2)"

**E. Optional: Zone-Tab-Leiste am L2-Kopf:**
Horizontale Leiste mit allen Zone-Namen. Aktive Zone hervorgehoben (underline/bold). Klick auf andere Zone → direkter Wechsel. Pattern wie ViewTabBar.vue.

### Aufwand: KLEIN
- 3 Computeds + 2 Funktionen im Script (~20 Zeilen)
- Template: 2 Buttons + Keyboard/Swipe-Registrierung
- Kein neues Composable, kein neues API

---

## Analyseergebnis 3: Komponenten Tab (`/sensors`) — Flache Inventarliste

### IST-Zustand (Visuell verifiziert via Playwright)

**Sensoren-Tab:** Zone-Akkordeons "Test" (3 Sensoren) und "Testneu" (2 Sensoren), jeweils mit Subzone-Akkordeon ("Keine Subzone"). Sensor-Cards zeigen: Icon, Name ("GPIO 0", "Temp 0C79"), ESP-ID (abgeschnitten), Sensor-Typ (abgeschnitten). Drill-Down-Chevron für Config-SlideOver.

**Aktoren-Tab:** Gleiche Zone-Akkordeon-Struktur. Status-Summary oben: "0 Aktiv (ON) | 3 Inaktiv (OFF) | 2 Not-Stopp". Actuator-Cards zeigen: Icon, Name, ESP-ID, Typ, State + Einschalten-Button.

**Problem:** Die Zone-Gruppierung (Test → Keine Subzone → Cards) ist eine **Kopie der Monitor-Struktur**. Die Komponenten-Seite soll ein **Hardware-Inventar** sein, nicht eine zweite Zone-Ansicht:
- Gleiche Hierarchie: Zone → Subzone → Card (identisch zu MonitorView L2)
- Gleiche Daten: Sensoren/Aktoren nach Zone sortiert
- Config-Fokus statt Hardware-Fokus: Config-Panels im SlideOver, aber keine Hardware-Metadaten (GPIO, Firmware, Uptime, Fehlerrate)

### Betroffene Dateien

| Datei | Zeilen | Was dort passiert |
|-------|--------|-------------------|
| [SensorsView.vue](El Frontend/src/views/SensorsView.vue) | 1-220+ | Haupt-View: Tabs (Sensors/Actuators), Zone-Akkordeon-Rendering, Filter-Logik, Subzone CRUD, Config-SlideOver |
| [SensorsView.vue:28](El Frontend/src/views/SensorsView.vue#L28) | 28 | `import { useZoneGrouping, ZONE_UNASSIGNED } from '@/composables/useZoneGrouping'` — DIESES IMPORT ist das Problem. Es erzwingt Zone-Gruppierung |
| [SensorsView.vue:68-93](El Frontend/src/views/SensorsView.vue#L68-L93) | 68-93 | Zone/Subzone-Akkordeon collapse-State-Management — wird bei flacher Liste komplett überflüssig |
| [SensorsView.vue:96-186](El Frontend/src/views/SensorsView.vue#L96-L186) | 96-186 | Subzone CRUD (Create/Rename/Delete) — gehört NICHT in Hardware-Inventar. Subzone-Management bleibt auf /hardware |
| [useZoneGrouping.ts](El Frontend/src/composables/useZoneGrouping.ts) | 96-196 | Composable: `allSensors` (Z100) und `allActuators` (Z192) sind **bereits flache Arrays**. `sensorsByZone`/`actuatorsByZone` gruppieren diese erst danach |
| [useZoneGrouping.ts:100-123](El Frontend/src/composables/useZoneGrouping.ts#L100-L123) | 100-123 | `allSensors`: Flaches Array aller Sensoren mit Context (esp_id, gpio, sensor_type, name, raw_value, unit, quality, zone_id, zone_name, subzone_id, subzone_name, last_read) |
| [useZoneGrouping.ts:192-230](El Frontend/src/composables/useZoneGrouping.ts#L192-L230) | 192-230 | `allActuators`: Flaches Array aller Aktoren mit Context (gpio, actuator_type, name, state, pwm_value, emergency_stopped, esp_id, zone_id, zone_name, subzone_id, subzone_name) |
| [useZoneGrouping.ts:288-291](El Frontend/src/composables/useZoneGrouping.ts#L288-L291) | 288-291 | Return: `allSensors`, `filteredSensors`, `allActuators`, `filteredActuators` werden bereits exportiert — die flachen Arrays sind fertig abrufbar |
| [SensorCard.vue](El Frontend/src/components/devices/SensorCard.vue) | — | Config-Modus-Card. Behält ihre Rolle im SlideOver, aber wird in der Flat-List durch Tabellen-Zeilen ersetzt |
| [ActuatorCard.vue](El Frontend/src/components/esp/ActuatorCard.vue) | — | Config-Modus-Card. Gleiches Pattern wie SensorCard |
| [DataTable.vue](El Frontend/src/components/database/DataTable.vue) | 1-60 | Generische Tabellen-Komponente: Sortierung, Column-Schema, Row-Click. Kann als Basis für Hardware-Inventar-Tabelle dienen |

### Vorhandene Bausteine (kein Neubau nötig)

| Baustein | Ort | Bereit? |
|----------|-----|---------|
| `allSensors` (flaches Array) | [useZoneGrouping.ts:100](El Frontend/src/composables/useZoneGrouping.ts#L100) | ✅ ESP-ID, GPIO, Typ, Wert, Unit, Quality, Zone, Subzone, last_read |
| `allActuators` (flaches Array) | [useZoneGrouping.ts:192](El Frontend/src/composables/useZoneGrouping.ts#L192) | ✅ GPIO, Typ, Name, State, PWM, Emergency, ESP-ID |
| `filteredSensors`/`filteredActuators` | [useZoneGrouping.ts:126-139, 218-240](El Frontend/src/composables/useZoneGrouping.ts#L126-L139) | ✅ Filter nach ESP-ID, Typ, Quality, State |
| ESP-Metadaten | `useEspStore` | ✅ `firmware_version`, `uptime`, `last_seen`, `system_state` pro Device |
| `DataTable.vue` | [DataTable.vue](El Frontend/src/components/database/DataTable.vue) | ⚠ Existiert, nutzt aber `ColumnSchema` aus database API. Kann erweitert oder als Vorlage genutzt werden |
| `qualityToStatus()` | [formatters.ts:628](El Frontend/src/utils/formatters.ts#L628) | ✅ Quality → Status-Badge-Farbe |
| `formatRelativeTime()` | [formatters.ts:34](El Frontend/src/utils/formatters.ts#L34) | ✅ Für "Letzter Wert vor X" |

### Konkrete Änderungen

**A. SensorsView komplett umbauen:**
1. **Zone-Gruppierung entfernen:** Statt `sensorsByZone` nur noch `allSensors`/`filteredSensors` (flache Arrays) verwenden
2. **Subzone-CRUD entfernen:** Kompletter Block Z96-186 raus. Subzone-Management gehört auf /hardware
3. **Akkordeon-State entfernen:** Z68-93 (collapsedZones, collapsedSubzones) → nicht mehr nötig
4. **Tabs behalten:** "Sensoren" + "Aktoren" als flache Tabs (ohne Zone-Hierarchie)

**B. Hardware-Inventar-Tabelle:**
Statt SensorCard-Grid eine **sortierbare Tabelle** mit diesen Spalten:

| Spalte | Datenquelle | Prio |
|--------|-------------|------|
| Name | `sensor.name \|\| sensor.sensor_type` | P1 |
| Typ/Modell | `sensor.sensor_type` (→ `SENSOR_TYPE_CONFIG[type].label`) | P1 |
| ESP-ID | `sensor.esp_id` (gekürzt) | P1 |
| GPIO | `sensor.gpio` | P1 |
| Letzter Wert | `sensor.raw_value` + `sensor.unit` | P1 |
| Datenqualität | `qualityToStatus(sensor.quality)` → Badge | P1 |
| Letzte Messung | `formatRelativeTime(sensor.last_read)` | P1 |
| ESP-Status | `getESPStatus(device)` (Join via esp_id) | P2 |
| Firmware | `device.firmware_version` (Join via esp_id) | P2 |
| Uptime | `device.uptime` (Join via esp_id) | P3 |
| Kalibrierung | `sensor.calibration_offset` | P3 |

**C. Klick-Aktion:**
Row-Click → Config-SlideOver öffnen (bestehende `openSensorConfig()`/`openActuatorConfig()` Funktionen bleiben)

**D. Keine Automatisierungs-Info:**
- Keine Zonen-Spalte (Zone gehört in Monitor)
- Keine Regeln, keine Schwellwerte
- Fokus: "Welche Hardware habe ich? Funktioniert sie? Wie sind die Daten?"

### Aufwand: MITTEL
- SensorsView Template+Script deutlich vereinfachen (Zone-Gruppierung raus)
- Tabellen-Darstellung statt Card-Grid
- Keine neuen APIs — alle Daten bereits in `allSensors`/`allActuators`
- Optional: DataTable.vue erweitern oder eigene ComponentInventoryTable.vue erstellen

---

## Zusammenfassung für TM

| # | Bereich | Problem | Vision | Aufwand | Voraussetzung |
|---|---------|---------|--------|---------|---------------|
| 1 | **Übersicht** (`/hardware`) | Nur statische Zahlen, kein Trend, keine Sparklines, keine KPI-Leiste | Cockpit: Sparklines, Trend-Pfeile, farbkodierte Werte, KPI-Leiste, Health-Ampel prominent | **MITTEL** | `zoneKPIs`-Logik in Composable extrahieren |
| 2 | **Monitor Nav** (`/monitor/:zoneId`) | Kein Zone-zu-Zone-Wechsel auf L2, nur "Zurück" | Prev/Next-Pfeile, Swipe, Keyboard (←/→), optionale Zone-Tab-Leiste | **KLEIN** | Keine — alles in MonitorView lokal lösbar |
| 3 | **Komponenten** (`/sensors`) | Zone-gruppiert statt flaches Inventar, dupliziert Monitor-Struktur | Flache Hardware-Inventar-Tabelle, Datenauswertungs-Fokus, keine Zonen | **MITTEL** | allSensors/allActuators bereits verfügbar |

### Empfohlene Reihenfolge
1. **Monitor Nav** (klein, unabhängig, sofort spürbare UX-Verbesserung)
2. **Composable-Extraktion** (Voraussetzung für Übersicht-Upgrade, profitiert auch andere Views)
3. **Übersicht Cockpit-Upgrade** (nach Composable-Extraktion)
4. **Komponenten Inventar-Umbau** (unabhängig, kann parallel zu 2+3)

### Kein Neubau nötig
- `useSparklineCache` ✅ existiert
- `useSwipeNavigation` ✅ existiert
- `useKeyboardShortcuts` ✅ existiert
- `allSensors`/`allActuators` als flache Arrays ✅ existieren
- `zoneKPIs` Computed ✅ existiert (muss nur extrahiert werden)
- `qualityToStatus()` ✅ existiert
- `formatRelativeTime()` ✅ existiert
- `DataTable.vue` ✅ existiert als Vorlage
