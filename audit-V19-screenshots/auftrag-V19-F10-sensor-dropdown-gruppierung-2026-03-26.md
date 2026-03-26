# V19-F10 — Sensor-Dropdown im Widget-Config nicht nach Zone/Subzone gruppiert

> **Typ:** Bugfix (Frontend — useSensorOptions Integration)
> **Erstellt:** 2026-03-26
> **Prioritaet:** LOW
> **Geschaetzter Aufwand:** ~1-2h
> **Abhaengigkeit:** Keine
> **Status:** GEGENSTANDSLOS — Alle Akzeptanzkriterien bereits im aktuellen Code erfuellt (Stand 2026-03-26)

---

## Analyse-Ergebnis

Beim Pruefen des aktuellen Codes wurde festgestellt, dass alle beschriebenen Implementierungsschritte bereits vorhanden sind. Der Auftrag ist obsolet.

Relevante Codezeilen im auto-one Repo:

| Kriterium | Status | Fundstelle |
|-----------|--------|------------|
| `useSensorOptions` im WidgetConfigPanel | [x] Bereits implementiert | `components/dashboard-widgets/WidgetConfigPanel.vue` Zeile 14 (Import) + Zeile 67 (Aufruf) |
| `<optgroup>` Zone/Subzone-Gruppierung (2-Level) | [x] Bereits implementiert | `components/dashboard-widgets/WidgetConfigPanel.vue` Zeilen 211–222 |
| `filterZoneId` wird durchgereicht | [x] Bereits implementiert | `components/dashboard-widgets/WidgetConfigPanel.vue` Zeilen 61–64 (`selectedSensorZone` ref + watch) |
| Zone-Filter-Dropdown vorhanden | [x] Bereits implementiert | `components/dashboard-widgets/WidgetConfigPanel.vue` Zeilen 186–199 |
| `zoneId`-Prop in InlineDashboardPanel | [x] Bereits implementiert | `components/dashboard/InlineDashboardPanel.vue` Zeile 233 |

---

## Korrigiertes Verstaendnis der Implementierung

### Richtiger Datei-Pfad

Das Dokument nannte urspruenglich `components/widgets/WidgetConfigPanel.vue`. **Der korrekte Pfad ist `components/dashboard-widgets/WidgetConfigPanel.vue`.**

### Tatsaechliche Datenstruktur (2-Level, nicht 1-Level)

Das urspruengliche Dokument beschrieb eine flache `group.options`-Struktur. Die tatsaechliche Implementierung von `useSensorOptions` liefert eine **verschachtelte 2-Level-Struktur**:

```
Zone (group)
  └ Subzone (subgroup)
      └ Sensor (option)
```

Das Template in WidgetConfigPanel.vue nutzt dementsprechend **verschachtelte `<optgroup>`-Tags**:

```html
<!-- Korrekte 2-Level-Struktur (Zone → Subgroups → Options) -->
<optgroup v-for="group in groupedSensorOptions" :label="group.label" :key="group.label">
  <template v-for="subgroup in group.subgroups" :key="subgroup.label">
    <optgroup :label="'  ' + subgroup.label">
      <option v-for="sensor in subgroup.options" :value="sensor.value" :key="sensor.value">
        {{ sensor.label }}
      </option>
    </optgroup>
  </template>
</optgroup>
```

Nicht die urspruenglich angenommene 1-Level-Struktur:

```html
<!-- FALSCH — so ist es NICHT implementiert -->
<optgroup v-for="group in groupedSensorOptions" :label="group.label">
  <option v-for="sensor in group.options" :value="sensor.value">...</option>
</optgroup>
```

### Sensor-Labels — Daten-Problem, kein Code-Problem

Das urspruengliche Dokument beschrieb technische Sensor-Labels ("sht31_humidity") als Code-Problem. **Das ist kein Code-Problem.**

`useSensorOptions` nutzt `s.name || s.sensor_type` als Label. Wenn ein Sensor im Backend einen `name` hat (z.B. "Luftfeuchtigkeit"), wird dieser angezeigt. Wenn nicht, faellt der Code auf `sensor_type` zurueck — das ist korrekt implementiertes Fallback-Verhalten.

Wenn Labels technisch aussehen, liegt das daran, dass **Sensoren im Backend noch keinen benutzerfreundlichen `name` haben**. Das ist ein Daten-Problem, das durch Setzen der Sensor-Namen in der Hardware-Konfiguration (HardwareView → SensorConfigPanel) geloest wird, nicht durch Code-Aenderungen.

---

## Kontext (unveraendert korrekt)

### useSensorOptions Composable

In Phase A (Editor) wurde das `useSensorOptions.ts` Composable implementiert. Es bietet:
- `groupedSensorOptions` — Sensoren gruppiert nach Zone → Subzone → Sensor (2-Level).
- `filterZoneId` — Optionaler Parameter um nur Sensoren einer bestimmten Zone anzuzeigen.
- Native `<optgroup>` Tags fuer die Dropdown-Gruppierung.
- Sensor-Dedup (keine doppelten Eintraege) ueber alle 6 Sensor-Widgets.

Der Zone-Kontext fliesst durch die gesamte Kette: `DashboardLayout → useDashboardWidgets → InlineDashboardPanel → Widget → WidgetConfigPanel → useSensorOptions(filterZoneId)`.

---

## Relevante Dateien (korrigiert)

| Bereich | Tatsaechliche Dateien |
|---------|----------------------|
| Sensor-Options Composable | `composables/useSensorOptions.ts` |
| Widget-Config-Panel | `components/dashboard-widgets/WidgetConfigPanel.vue` |
| InlineDashboardPanel | `components/dashboard/InlineDashboardPanel.vue` |
| Dashboard-Widget-Composable | `composables/useDashboardWidgets.ts` |
| Sensor-Labels | `sensorDefaults.ts` (SENSOR_TYPE_CONFIG Fallback-Labels) |

---

## Akzeptanzkriterien

- [x] Sensor-Dropdown im WidgetConfigPanel zeigt Sensoren gruppiert nach Zone → Subzone (`WidgetConfigPanel.vue:211-222`)
- [x] Sensor-Labels nutzen `s.name || s.sensor_type` — benutzerfreundlich wenn Backend-Name gesetzt, sonst sensor_type als Fallback (`useSensorOptions.ts`)
- [x] Bei Zone-gebundenen Dashboards zeigt der Dropdown nur Sensoren der betreffenden Zone (`WidgetConfigPanel.vue:61-64`, `selectedSensorZone` ref + `filterZoneId`)
- [x] Kein Regression bei der Widget-Konfiguration — sensorId-Format unveraendert
- [x] `zoneId`-Prop in InlineDashboardPanel korrekt weitergeleitet (`InlineDashboardPanel.vue:233`)

---

## Hinweis fuer das Team

Falls das Problem visuell noch auftritt (flache Liste, technische Labels), sind folgende Ursachen zu pruefen — **nicht im Code, sondern in den Daten**:

1. **Sensor-Name nicht gesetzt:** In der HardwareView den Sensor oeffnen (L2 → SensorConfigPanel) und einen benutzerfreundlichen Namen eintragen. `useSensorOptions` zeigt dann diesen Namen statt `sensor_type`.
2. **Sensor nicht einer Zone/Subzone zugeordnet:** Sensor erscheint unter "Nicht zugeordnet" im Dropdown, nicht unter einer Zone. Zuordnung in der HardwareView korrigieren.
3. **Falscher `zoneId`-Kontext:** Wenn das Dashboard keinen `zoneId` hat (z.B. ein persoenliches Dashboard ohne Zone-Bezug), zeigt `filterZoneId=null` alle Sensoren — das ist korrektes Verhalten.
