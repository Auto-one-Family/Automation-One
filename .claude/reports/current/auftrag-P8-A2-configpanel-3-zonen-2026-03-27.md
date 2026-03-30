# Auftrag P8-A2 — WidgetConfigPanel 3-Zonen Progressive Disclosure

**Typ:** Feature — Frontend
**Schwere:** HIGH
**Aufwand:** ~2-3h
**Ziel-Agent:** frontend-dev
**Abhaengigkeit:** Keine (aber Grundlage fuer A3 Alert-Threshold-Sync)
**Roadmap:** `roadmap-P8-v2-implementation-2026-03-27.md`

> **Revision 2026-03-29 — Korrekturen aus Verifikation:**
> Widget-Typ `historical-chart` → `historical` (korrekter registrierter Name in useDashboardWidgets.ts:83).
> `status-badge` entfernt (kein registrierter Widget-Typ).
> Smart-Defaults-Tabelle auf echte SENSOR_TYPE_CONFIG-Keys korrigiert und als illustrativ markiert.
> `hasYAxisFields` an bestehenden Code angepasst (`gauge` drin, `multi-sensor` raus).
> `hasAggregationField` und Debug-Modus gestrichen (neue Felder — widerspricht "nur bestehende Felder gruppieren").
> Fehlende Felder ergaenzt: Zone-Filter-Dropdowns (x2), showThresholds-Toggle, Statistics-Optionen.
> Smart Defaults: bestehender `handleSensorChange()` statt neuem watch() verwenden.

---

## Kontext

AutomationOne ist ein IoT-Framework mit Vue 3 Dashboard. Das Dashboard hat **10 Widget-Typen**, registriert in `useDashboardWidgets.ts` mit 4-stelliger Registrierung (widgetComponentMap, WIDGET_TYPE_META, WIDGET_DEFAULT_CONFIGS, mountWidgetToElement):

```
line-chart, gauge, sensor-card, historical, multi-sensor,
actuator-card, actuator-runtime, esp-health, alarm-list, statistics
```

Alle Widgets nutzen ein flaches Config-Interface — es gibt keinen Type-Discriminator.

Widget-Konfiguration erfolgt ueber `WidgetConfigPanel.vue` — ein SlideOver-Panel das Formularfelder fuer das ausgewaehlte Widget zeigt. Dieses Panel wird von `InlineDashboardPanel.vue` (mode="manage", Settings-Button) und vom GridStack-Editor (Gear-Button) geoeffnet.

**Sensor-Defaults existieren bereits** in `sensorDefaults.ts` als `SENSOR_TYPE_CONFIG`. Dieses Mapping enthaelt pro Sensor-Typ: Einheit, Dezimalstellen, Y-Achsen-Range, Kategorie. VPD hat zusaetzlich 5 Farbzonen (rot/gelb/gruen/gelb/rot).

**Sensor-Dropdown:** Das Composable `useSensorOptions.ts` liefert `groupedSensorOptions` (Zone→Subzone→Sensor) mit `filterZoneId` Parameter. Im WidgetConfigPanel werden native `<optgroup>` Elemente genutzt.

---

## Problem

`WidgetConfigPanel.vue` zeigt aktuell **alle** Felder flach untereinander — kein Accordion, keine Gruppierung, kein Progressive Disclosure. Bei Widget-Typen mit vielen Optionen (z.B. MultiSensor mit Zeitbereich, Sensoren, Aktoren, Schwellwerte, Y-Achsen, Farben, Labels, Dezimalstellen) wird das Panel zu lang und ueberfordernd.

Aus UX-Forschung (Progressive Disclosure, LogRocket 2025, IxDF):
- Das Arbeitsgedaechtnis haelt 4-7 Elemente — Zone 1 muss ≤5 Felder haben
- **Maximal 3 Disclosure-Levels** — mehr erhoehen Cognitive Load statt ihn zu senken
- Essentielles (Sensor-Auswahl) darf NIE hinter "Erweitert" versteckt werden
- Inkonsistente Reveal-Patterns (manche per Klick, andere per Hover) verwirren
- Klare visuelle Indikatoren noetig wenn mehr Inhalt existiert

---

## IST

`WidgetConfigPanel.vue` hat bereits folgende `v-if`-basierte Conditional-Logik:

- `hasSensorField` — Sensor-Dropdown (fuer Sensor-Widgets)
- `hasYRange` — Y-Achsen Min/Max, aktuell fuer `['line-chart', 'historical', 'gauge']`
- `hasSensorField` / Threshold-Felder — warnLow/warnHigh/alarmLow/alarmHigh
- `showThresholds` — Checkbox-Toggle der die Threshold-Felder ein-/ausblendet (WidgetConfigPanel.vue:315-324)
- Zone-Dropdown fuer Sensor-Filterung (WidgetConfigPanel.vue:186-200)
- Zone-Filter-Dropdown fuer alarm-list/esp-health/actuator-runtime (WidgetConfigPanel.vue:242-258)
- Farb-Palette CHART_COLORS (WidgetConfigPanel.vue:301-312)
- Statistics-Optionen showStdDev/showQuality (WidgetConfigPanel.vue:374-393)
- Bestehender `handleSensorChange()` Handler (WidgetConfigPanel.vue:121-141) — befuellt Y-Achse und Einheit aus SENSOR_TYPE_CONFIG wenn Sensor ausgewaehlt wird

**Problem:** Kein Accordion, keine Gruppierung. Alle Felder gleichzeitig sichtbar — auch irrelevante fuer den aktuellen Widget-Typ.

## SOLL — 3-Zonen-Layout

```
Zone 1: KERN (immer sichtbar, max 5 Felder)
  → Widget-Titel (Input)
  → Zone-Dropdown fuer Sensor-Filterung (fuer Sensor-Widgets)
  → Zone-Filter-Dropdown fuer alarm-list / esp-health / actuator-runtime
  → Sensor-/Aktor-Auswahl (Dropdown mit optgroup nach Zone→Subzone)
  → Zeitbereich (Select: 1h / 6h / 24h / 7d / 30d / custom)
  → Widget "funktioniert" nach Zone-1-Konfiguration allein

Zone 2: DARSTELLUNG (Accordion, Standard eingeklappt)
  → showThresholds-Toggle (Checkbox) + Threshold-Felder (warnLow/High, alarmLow/High)
    — spaeter mit "Aus Sensor-Config laden" Button (Auftrag A3)
  → Y-Achsen Min/Max (auto oder manuell)
  → Farb-Palette (CHART_COLORS)
  → Conditional: Threshold-Felder NUR bei ['line-chart', 'gauge', 'historical']
  → Conditional: Y-Achsen-Felder NUR bei ['line-chart', 'historical', 'gauge']

Zone 3: ERWEITERT (Accordion, Standard eingeklappt)
  → Dezimalstellen
  → Custom Labels
  → Statistics-Optionen (showStdDev / showQuality) — nur bei statistics-Widget
```

---

## Implementierung

### Accordion-Komponente

Einfaches `<details>/<summary>` Element (HTML-nativ, kein Headless-UI noetig):

```html
<details class="config-section">
  <summary class="config-section__header">
    <ChevronRight :size="16" class="config-section__chevron" />
    <span>Darstellung</span>
  </summary>
  <div class="config-section__body">
    <!-- Zone 2 Felder hier -->
  </div>
</details>
```

```css
.config-section__chevron {
  transition: transform 200ms ease;
}
details[open] .config-section__chevron {
  transform: rotate(90deg);
}
.config-section__body {
  overflow: hidden;
  animation: slideDown 200ms ease;
}
@keyframes slideDown {
  from { max-height: 0; opacity: 0; }
  to { max-height: 500px; opacity: 1; }
}
```

Alternativ: Falls `<details>` Animation Probleme macht, einen manuellen Toggle mit `v-show` und Transition-Wrapper (`<Transition>`) verwenden.

### Conditional Disclosure

Felder die nicht zum aktuellen Widget-Typ passen: per `v-if` **komplett ausblenden** (nicht disabled, sondern unsichtbar). Das reduziert visuelle Komplexitaet fuer einfache Widget-Typen.

Die folgenden Computed-Properties spiegeln den **bestehenden Code** wider — nicht neu erfinden, nur in die Zonen-Struktur einbetten:

```typescript
// Bestehende hasYRange-Logik beibehalten — aktuell: ['line-chart', 'historical', 'gauge']
const hasYAxisFields = computed(() =>
  ['line-chart', 'historical', 'gauge'].includes(widgetType.value)
)

// Threshold-Felder: nur bei diesen drei Chart-Typen sinnvoll
const hasThresholdFields = computed(() =>
  ['line-chart', 'gauge', 'historical'].includes(widgetType.value)
)

// Statistics-Zone nur bei statistics-Widget
const hasStatisticsOptions = computed(() =>
  widgetType.value === 'statistics'
)
```

**Hinweis zu hasYAxisFields:** Der aktuelle Code (WidgetConfigPanel.vue:51-53) hat `hasYRange` mit `['line-chart', 'historical', 'gauge']`. Diesen Stand beibehalten — `gauge` bleibt drin, `multi-sensor` kommt nicht hinzu.

**Kein `hasAggregationField`:** Eine `resolution`-Auswahl (1m / 5m / 1h / 1d) existiert aktuell nicht als eigenstaendiges Feld im WidgetConfigPanel. Dieses Feld NICHT einfuehren — es wuerde gegen die Einschraenkung "keine neuen Felder" verstossen.

### Smart Defaults bei Sensor-Auswahl

Wenn der User einen Sensor auswaehlt, Zone-2-Felder automatisch aus `SENSOR_TYPE_CONFIG` (in `sensorDefaults.ts`) vorausfuellen. **Diese Logik existiert bereits** als `handleSensorChange()` in WidgetConfigPanel.vue:121-141. Der Dev-Agent soll diese Logik NICHT neu schreiben, sondern sie in die neue Zone-2-Struktur einbetten.

Die SENSOR_TYPE_CONFIG-Keys sind **case-sensitiv**. Zur Orientierung — echte Keys (illustrativ, der Handler liest sie direkt aus dem Code):

| SENSOR_TYPE_CONFIG-Key | Y-Achse Min | Y-Achse Max | Einheit | Dezimalstellen |
|------------------------|-------------|-------------|---------|----------------|
| `DS18B20` | -55 | 125 | °C | 1 |
| `sht31_temp` | -40 | 125 | °C | 1 |
| `sht31_humidity` | 0 | 100 | %RH | 0 |
| `pH` | 0 | 14 | pH | 2 |
| `EC` | 0 | 5000 | µS/cm | 0 |
| `vpd` | 0 | 3 | kPa | 2 |
| `bme280_pressure` | 300 | 1100 | hPa | 0 |
| `co2` | 400 | 5000 | ppm | 0 |
| `light` | 0 | 100000 | lux | 0 |
| `soil_moisture` | 0 | 100 | % | 0 |

**Wichtig:** Die Tabelle ist illustrativ. Die echten Werte stehen in `sensorDefaults.ts` — der bestehende `handleSensorChange()` Handler liest sie von dort. Keine hardcodierten Werte in den neuen Zonen-Code einbauen.

Der User **sieht** diese Defaults nur wenn er Zone 2 oeffnet — sie wirken aber sofort (Widget zeigt die Defaults in der Vorschau).

Implementation: Der **bestehende `handleSensorChange()` Handler** (WidgetConfigPanel.vue:121-141) setzt Config-Felder sofern sie leer oder auf Default stehen (nicht ueberschreiben wenn der User sie manuell geaendert hat). Diesen Handler in die Zone-2-Struktur uebernehmen, nicht neu implementieren.

### Zustand

- Accordion-State wird **NICHT persistiert** — immer eingeklappt beim Oeffnen des ConfigPanels
- Das ist bewusst: Der haeufigste Flow ist "Sensor waehlen, fertig". Nur Power-User oeffnen Zone 2/3.

---

## Einschraenkungen

- Flaches Config-Interface bleibt (ein Interface fuer alle Widgets, kein Type-Discriminator)
- Keine neuen npm-Pakete
- Keine Aenderungen an Widget-Registrierung in `useDashboardWidgets.ts`
- `WidgetConfigPanel.vue` ist die einzige Datei die sich strukturell aendert
- Bestehende Widget-Konfigurationen muessen weiterhin funktionieren (Rueckwaertskompatibilitaet)
- KEIN 4. Disclosure-Level (max 3: Kern → Darstellung → Erweitert)
- Keine neuen Felder einfuehren — nur bestehende Felder neu gruppieren

---

## Was NICHT gemacht wird

- Alert-Config Sync-Button (kommt in Auftrag A3)
- Aktor-Auswahl im MultiSensor-Widget (kommt in Auftrag A6)
- `resolution`-Dropdown / Aggregation-Feld (existiert noch nicht, wird hier nicht eingefuehrt)
- Debug-Modus / Raw-Daten-Toggle (existiert noch nicht, wird hier nicht eingefuehrt)
- Neue `handleSensorChange()`-Logik schreiben — bestehende Logik in neue Struktur verschieben

---

## Akzeptanzkriterien

- [ ] 3-Zonen-Layout implementiert (Kern / Darstellung / Erweitert)
- [ ] Accordion mit smooth Animation (Chevron + Slide) fuer Zone 2 und Zone 3
- [ ] Zone 1 hat maximal 5 Felder (Titel, Zone-Filter(s), Sensor-Auswahl, Zeitbereich)
- [ ] Conditional Disclosure: `hasThresholdFields` gilt fuer `['line-chart', 'gauge', 'historical']` — kein `status-badge`
- [ ] Conditional Disclosure: `hasYAxisFields` gilt fuer `['line-chart', 'historical', 'gauge']` — unveraendert zum IST-Code
- [ ] `showThresholds`-Toggle bleibt in Zone 2 erhalten (schaltet Threshold-Felder ein/aus)
- [ ] Statistics-Optionen (showStdDev/showQuality) in Zone 3, nur bei `statistics`-Widget sichtbar
- [ ] Zone-Filter-Dropdown(s) (Sensor-Filter + Alarm/Health-Filter) in Zone 1
- [ ] Smart Defaults: bestehender `handleSensorChange()` Handler in Zone-2-Struktur eingebettet (nicht neu geschrieben)
- [ ] Widget "funktioniert" nach Zone-1-Konfiguration allein (Titel + Sensor + Zeitbereich)
- [ ] Max 3 Disclosure-Levels (keine geschachtelten Accordions in Zone 2 oder 3)
- [ ] Keine Regression: Alle bestehenden Widget-Konfigurationen laden und speichern korrekt
- [ ] Kein neues Feld eingefuehrt (kein resolution-Dropdown, kein Debug-Toggle)
