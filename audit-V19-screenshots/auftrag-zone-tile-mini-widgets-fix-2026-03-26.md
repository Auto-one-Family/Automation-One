# Auftrag: Zone-Tile Mini-Widgets — Sichtbarkeit + Layout fixen

> **Erstellt:** 2026-03-26
> **Typ:** Bugfix (2 Ebenen, 3 Ursachen)
> **Betroffene Dateien:** MonitorView.vue, InlineDashboardPanel.vue
> **Ergebnis:** Zone-Tiles zeigen 1-2 kompakte Gauge-Widgets mit korrektem Sizing

---

## Kontext

Der Monitor L1 zeigt Zone-Tiles (ZoneTileCard) mit einem `#extra`-Slot. In diesem Slot sollen Mini-Widgets (Gauge, Sensor-Card) als kompakte InlineDashboardPanels gerendert werden. Die Rendering-Infrastruktur ist komplett vorhanden:

| Baustein | Datei | Zeile | Status |
|----------|-------|-------|--------|
| `#extra`-Slot in ZoneTileCard | `ZoneTileCard.vue` | ~85 | Vorhanden |
| `v-if="getZoneMiniPanelId(zone.zoneId)"` | `MonitorView.vue` | ~1723-1731 | Vorhanden, aber `undefined` |
| `<InlineDashboardPanel compact>` | `MonitorView.vue` | Template | Vorhanden |
| `getZoneMiniPanelId(zoneId)` | `MonitorView.vue` | 941 | Funktion existiert |
| `TILE_ALLOWED_WIDGET_TYPES` = gauge, sensor-card | `MonitorView.vue` | 934 | Korrekt definiert |
| `compact` Prop auf InlineDashboardPanel | `InlineDashboardPanel.vue` | ~336-348 | Funktional (CSS-only) |
| Layout-Engine | `InlineDashboardPanel.vue` | 284 | **Reines CSS-Grid** (12 Spalten, `grid-auto-rows: v-bind(rowHeightPx)` — dynamisch: `ROW_HEIGHT_INLINE=80` Zeile 56, `ROW_HEIGHT_SIDE=120` Zeile 57). Kein GridStack. |

**Aktuell sieht der User: Zone-Tiles ohne jegliche Widgets im extra-Slot.**

---

## Ebene 1 — Warum keine Widgets sichtbar (KRITISCH)

### Ursache A: Strenger Sensor-Filter

**Fundstelle:** `MonitorView.vue:972-974`

```typescript
const tempSensor = sensors.find(s => s.sensorType.includes('temp'))
const humiditySensor = sensors.find(s => s.sensorType.includes('humi'))
if (!tempSensor && !humiditySensor) return  // ← Zone ohne Temp/Humi bekommt KEIN Dashboard
```

**Problem:** `ensureZoneTileDashboard()` erstellt nur dann ein Tile-Dashboard, wenn die Zone mindestens einen Temperatur- oder Feuchtigkeitssensor hat. Jede Zone die ausschliesslich pH, EC, Soil, CO2, Light, Flow oder Pressure Sensoren hat, bekommt kein Zone-Tile-Dashboard. `getZoneMiniPanelId()` gibt `undefined` zurueck, das `v-if` ist `false`, kein Panel wird gerendert.

**IST:** Nur Zonen mit Temp/Humi-Sensoren bekommen Mini-Widgets.
**SOLL:** Jede Zone mit mindestens einem Sensor bekommt Mini-Widgets — mit den Top-Sensortypen der Zone.

### Ursache B: Once-per-Session Guard

**Fundstelle:** `MonitorView.vue:1207-1213`

```typescript
watch(filteredZoneKPIs, (zones) => {
  if (tileDashboardsEnsured || zones.length === 0) return
  tileDashboardsEnsured = true  // ← Einmal gesetzt, nie zurueckgesetzt
  for (const zone of zones) {
    ensureZoneTileDashboard(zone.zoneId, zone.zoneName)
  }
}, { immediate: true })
```

**Problem:** Der Guard `tileDashboardsEnsured` feuert nur einmal pro Session. Wenn beim ersten Ausfuehren `espStore.devices` noch keine Sensordaten geladen hat (z.B. WebSocket-Daten kommen spaeter), findet `ensureZoneTileDashboard` keine Sensoren und erstellt nichts. Spaetere Device-Updates triggern die Erstellung **nie wieder**.

**IST:** Wenn Sensordaten beim ersten Watch-Trigger noch nicht da sind, bleiben Tiles dauerhaft leer.
**SOLL:** Reaktive Logik die pro Zone trackt ob ein Dashboard existiert und bei neuen Zonen oder spaet geladenen Geraeten nachholt.

---

## Ebene 2 — Layout-Problem (falls Widgets sichtbar)

### Ursache C: Widget-Clipping durch Grid-Konfiguration

**InlineDashboardPanel ist KEIN GridStack-Widget.** Es nutzt reines CSS-Grid:
- `display: grid` mit 12 Spalten
- `grid-auto-rows: v-bind(rowHeightPx)` (Fundstelle: `InlineDashboardPanel.vue:284`) — im Inline-Modus effektiv 80px (`ROW_HEIGHT_INLINE` Zeile 56), ABER dynamisch via `v-bind()` — kein hartkodierter CSS-Wert!

**Berechnung:**
- Gauge-Widgets werden mit `w: 3, h: 3` erstellt (Fundstelle: `MonitorView.vue:988`)
- Widget-Hoehe: 3 Reihen x 80px = **240px**
- Compact-CSS setzt `max-height: 120px` auf die Zelle (Fundstelle: `InlineDashboardPanel.vue:347`)
- Ergebnis: Widget wird auf 120px **abgeschnitten** (untere Haelfte fehlt)

**Zusaetzlich doppeltes Clipping:** MonitorView hat eigenes CSS:

```css
.monitor-zone-tile__mini-widget {
  max-height: 120px;
  overflow: hidden;
}
```

Das ergibt zwei verschachtelte 120px-Begrenzungen: InlineDashboardPanel-Cell UND MonitorView-Wrapper.

**IST:** Gauge 240px hoch, in 120px Container abgeschnitten, doppeltes Clipping.
**SOLL:** Gauge passt vollstaendig in den verfuegbaren Platz, kein Clipping.

---

## Fix-Plan (priorisiert)

### Fix 1: Sensor-Filter erweitern (Ursache A)

**Datei:** `MonitorView.vue` (~Zeile 972-974)

**Aenderung:** Statt nur `temp`/`humi` zu suchen, die **Top-2 Sensortypen** der Zone verwenden. Die Sensoren der Zone sind ueber `espStore.devices` verfuegbar — fuer jede Zone die Sensoren aggregieren und die zwei haeufigsten (oder wichtigsten) Typen als Gauge-Widgets erstellen.

Konkret:
1. Die Zeilen 972-974 (early return bei fehlenden temp/humi) entfernen
2. Stattdessen: Alle Sensoren der Zone sammeln, nach Typ gruppieren, die 2 relevantesten auswaehlen
3. Priorisierung: Temperatur > Feuchtigkeit > VPD > pH > EC > alle anderen
4. Wenn die Zone gar keine Sensoren hat: kein Dashboard erstellen (das ist korrekt)

### Fix 2: Once-Guard durch reaktive Logik ersetzen (Ursache B)

**Datei:** `MonitorView.vue` (~Zeile 1207-1213)

**Aenderung:** Den globalen Boolean `tileDashboardsEnsured` durch eine **pro-Zone-Tracking-Map** ersetzen.

Konzept:
```
// Statt globalem Boolean:
const ensuredZoneIds = new Set<string>()

watch(filteredZoneKPIs, (zones) => {
  for (const zone of zones) {
    if (ensuredZoneIds.has(zone.zoneId)) continue
    const hasSensors = /* pruefen ob espStore Sensoren fuer diese Zone hat */
    if (!hasSensors) continue  // Noch keine Daten → beim naechsten Trigger nochmal versuchen
    ensuredZoneIds.add(zone.zoneId)
    ensureZoneTileDashboard(zone.zoneId, zone.zoneName)
  }
}, { immediate: true })
```

Damit:
- Zonen die beim ersten Trigger noch keine Sensoren haben, werden beim naechsten Trigger erneut geprueft
- Zonen fuer die bereits ein Dashboard existiert, werden uebersprungen
- Neue Zonen die spaeter hinzukommen, werden automatisch erkannt

**Zusaetzlich:** Auch den `espStore.devices` Watch einbeziehen (oder als Dependency im computed). Wenn neue Geraete auftauchen, muss der Watcher erneut evaluieren.

### Fix 3: Widget-Sizing fuer compact-Modus korrigieren (Ursache C)

**Wichtig:** `grid-auto-rows` wird via `v-bind(rowHeightPx)` gesteuert (Zeile 284). Ein CSS-Override reicht NICHT — `v-bind()` hat hohe Spezifitaet. Die Aenderung muss in der **computed-Logik** von `rowHeightPx` (Zeile ~61) passieren.

#### Schritt 3a: `rowHeightPx` computed anpassen

**Datei:** `InlineDashboardPanel.vue` (~Zeile 61)

Aktuell berechnet `rowHeightPx`:
- Side-Panel → `ROW_HEIGHT_SIDE` (120px)
- Inline → `ROW_HEIGHT_INLINE` (80px)

Aenderung: `compact` Prop als dritte Bedingung einbeziehen:

```typescript
// Zeile ~61: rowHeightPx computed
const rowHeightPx = computed(() => {
  if (props.compact) return '120px'       // ← NEU: Compact-Modus = 120px
  if (isSidePanel.value) return `${ROW_HEIGHT_SIDE}px`
  return `${ROW_HEIGHT_INLINE}px`
})
```

#### Schritt 3b: Gauge-Widgets mit kompakten Dimensionen erstellen

**Datei:** `MonitorView.vue` (~Zeile 988)

Widget-Erstellung in `ensureZoneTileDashboard` aendern:

```typescript
// Statt: { type: 'gauge', w: 3, h: 3, sensorId: '...' }
{ type: 'gauge', w: 6, h: 1, sensorId: '...' }  // Halbe Breite, 1 Reihe
```

So passen 2 Gauges nebeneinander (je `w: 6` von 12 Spalten) in eine Reihe:
- Widget-Hoehe: 1 Reihe x 120px = **120px** — passt exakt
- Widget-Breite: 6/12 Spalten = **50%** — zwei Widgets Side-by-Side

### Fix 4: Doppeltes Clipping entfernen

**Datei:** `MonitorView.vue` (CSS-Sektion)

Den MonitorView-seitigen max-height-Wrapper entfernen:

```css
/* ENTFERNEN: */
.monitor-zone-tile__mini-widget {
  max-height: 120px;   /* ← entfernen */
  overflow: hidden;    /* ← entfernen */
}
```

Die Hoehenbegrenzung soll nur an EINER Stelle passieren: im InlineDashboardPanel via `rowHeightPx` computed (Fix 3a). Zwei verschachtelte 120px-Begrenzungen sind redundant und erschweren zukuenftige Anpassungen.

---

## Akzeptanzkriterien

| # | Kriterium | Pruefung |
|---|-----------|----------|
| 1 | Jede Zone mit mindestens 1 Sensor zeigt Mini-Widgets im Tile | Monitor L1 oeffnen, alle Zone-Tiles pruefen |
| 2 | Zonen mit nur pH/EC/CO2 (ohne Temp/Humi) zeigen trotzdem Widgets | Zone ohne Temp-Sensor anlegen, Tile pruefen |
| 3 | Spaet geladene Sensordaten fuehren trotzdem zu Widget-Erstellung | Browser-Refresh, beobachten ob Widgets nach WebSocket-Connect erscheinen |
| 4 | Gauge-Widgets sind vollstaendig sichtbar (kein Clipping) | Visuell: Gauge-Skala und -Wert komplett zu sehen |
| 5 | 2 Gauge-Widgets nebeneinander in einer Tile (nicht vertikal gestapelt) | Visuell: Zwei Gauges Side-by-Side |
| 6 | Kein Widget ragt ueber die Tile-Grenzen hinaus | Visuell: Tile-Card hat saubere Grenzen |
| 7 | Bestehende L2/Bottom/Side-Panel-Widgets unberuehrt | Monitor L2 oeffnen, Widgets pruefen |

---

## Scope-Grenzen — Was NICHT geaendert wird

- **ZoneTileCard.vue:** Props, Emits, Slots-Struktur bleiben unveraendert
- **InlineDashboardPanel.vue fuer nicht-compact-Modus:** Normales Grid-Layout (L2, Bottom, Side) bleibt exakt wie es ist
- **useDashboardWidgets.ts:** Keine Aenderungen an der Widget-Registry oder mountWidgetToElement
- **dashboard.store.ts:** Keine Aenderungen an `addWidget`, `removeWidget`, `updateWidgetConfig`
- **Editor-Dashboard:** Komplett unberuehrt
- **Widget-Typen-Filtering:** `TILE_ALLOWED_WIDGET_TYPES` (gauge, sensor-card) bleibt wie definiert

---

## Zusammenfassung der Aenderungen

| Fix | Datei | Zeile | Aenderung | Umfang |
|-----|-------|-------|-----------|--------|
| 1 | `MonitorView.vue` | ~972-974 | Sensor-Filter: Top-2 Sensortypen statt nur temp/humi | ~15 Zeilen |
| 2 | `MonitorView.vue` | ~1207-1213 | Once-Guard → pro-Zone `Set<string>` mit Retry | ~15 Zeilen |
| 3a | `InlineDashboardPanel.vue` | ~61 | `rowHeightPx` computed: `compact ? 120 : ...` | 1 Zeile |
| 3b | `MonitorView.vue` | ~988 | Widget-Erstellung: `h: 1, w: 6` statt `h: 3, w: 3` | 2 Zeilen |
| 4 | `MonitorView.vue` | CSS | `.monitor-zone-tile__mini-widget` komplett entfernen | 3 Zeilen entfernen |

**Geschaetzter Aufwand:** 30-45 Minuten. Keine neuen Dateien, keine neuen Dependencies.
