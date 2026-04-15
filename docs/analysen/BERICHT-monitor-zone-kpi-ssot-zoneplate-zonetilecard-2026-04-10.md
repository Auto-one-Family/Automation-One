# BERICHT: Zone-KPI SSOT — Monitor L1 (`ZoneTileCard`) vs. Hardware (`ZonePlate`)

**Run-ID:** `monitor-zone-kpi-ssot-2026-04-10`  
**Modus:** Evidence-Bericht (`artefact_improvement`), repo-verifiziert  
**Git-Branch zum Zeitpunkt der Analyse:** `auto-debugger/work`

---

## Executive Summary

Die **Zonenaggregation für angezeigte Kennzahlen** (arithmetisches Mittel pro abstrakter Sensorkategorie) kommt in Monitor L1 und in der Hardware-Ansicht **aus derselben Funktion** `aggregateZoneSensors` in `El Frontend/src/utils/sensorDefaults.ts`. Damit ist die **Rechensemantik für `avg` / `min` / `max` / `count` pro Kategorie** als Single Source of Truth umgesetzt.

Abweichungen betreffen **nicht die Formel**, sondern das **Operator-Mental-Model**:

- **Monitor (`ZoneTileCard`)** kennzeichnet den Mittelwert explizit mit dem Präfix **„Ø“** und nutzt `formatNumber(st.avg, …)` für die Zahl.
- **Hardware (`ZonePlate`)** zeigt in `aggregatedValues` ebenfalls den **Mittelwert** (`agg.avg`), aber **ohne** „Ø“/„Durchschnitt“ — nur kompakte Strings `avg + thin space + Einheit`, pipe-getrennt.

**Fazit SSOT:** Für die **Aggregationsmathematik** — ja, eine SSOT (`aggregateZoneSensors`). Für **einheitliche Kennzeichnung als Zonenmittel** — **Lücke**: Labels sind nicht harmonisiert; Empfehlung siehe Abschnitt „IST-Frage 7 / SOLL-Labels“.

---

## Evidence-Tabelle

| Ort (Datei) | Funktion / Baustein | Semantik (verifiziert) | Risiko / Hinweis |
|---------------|----------------------|-------------------------|------------------|
| `El Frontend/src/composables/useZoneKPIs.ts` | `computeZoneKPIs` → `aggregateZoneSensors(group.devices)` | Pro Zone werden die Geräte der Gruppe übergeben; `aggregation` im `ZoneKPI` ist `ReturnType<typeof aggregateZoneSensors>`. | Mobile-Sensor-Logik (6.7) passt **Zähler** (`sensorCount` etc.) an; Aggregation läuft weiterhin über `group.devices` — bewusst anderes Konzept als reine „Geräte in Zone“-Liste für Gäste (nur falls Scope Gäste-Daten in Mittelwerte einbeziehen soll; aktuell nicht separat adressiert). |
| `El Frontend/src/components/monitor/ZoneTileCard.vue` | Template KPI-Zeile: `Ø` + `formatKpiNumber(st)` (`formatNumber(st.avg, 1)`) | Zeigt **Mittelwert** pro Eintrag in `zone.aggregation.sensorTypes` mit klarem „Ø“. | Kein Risiko für falsche Formel; Operator sieht explizit Durchschnitt. |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | `zoneAggregation = computed(() => aggregateZoneSensors(props.devices))`; `aggregatedValues` aus `agg.avg` | Gleiche Eingabe: Geräteliste der Zone; Anzeige **ohne** „Ø“, nur `avgRounded` + Einheit. | **Mental-Model:** Wert kann wie Einzelmessung wirken; Einheitlicher Text „Zonenmittel“/„Ø“ fehlt im Header. |
| `El Frontend/src/utils/sensorDefaults.ts` | `aggregateZoneSensors` | Pro Gerät: `groupSensorsByBaseType` → Werte nach `AggCategory` sammeln → `avg` = Summe/n, plus `min`/`max`/`count`. | Siehe Filterliste unten; `onlineCount` in Rückgabe nutzt `d.status === 'online' \|\| d.connected` — weicht von `getESPStatus` in `useZoneKPIs` ab, wird in den hier analysierten Views aber **nicht** für die KPI-Zahlen genutzt. |

---

## `aggregateZoneSensors`: Filter und Kategorien (IST)

**Einträge in die Mittelwertbildung** (Schleife über `group.values`):

1. `value === null` oder `undefined` → **ausgeschlossen**
2. `quality === 'stale'` → **ausgeschlossen** (expliziter Skip)
3. `value === 0` und `quality === 'unknown'` → **ausgeschlossen** (DB-Init / noch keine Live-Daten)
4. `type === 'vpd'` und `value <= 0` → **ausgeschlossen**
5. `getSensorAggCategory(type) === 'other'` → **ausgeschlossen** (unkategorisiert)

**Kategorien (`AggCategory`):** u. a. `temperature`, `humidity`, `pressure`, `light`, `co2`, `moisture`, `ph`, `ec`, `flow`; Sortierung über `CATEGORY_PRIORITY`, Anzeige max. **3** Typen, Rest über `extraTypeCount`.

**Hinweis:** Die in `groupSensorsByBaseType` verwendete `quality` kommt aus `assessValueQuality` (nicht identisch mit Store-`MockSensor.quality` für Zählzwecke in `useZoneKPIs`). Die Aggregation filtert zusätzlich explizit `val.quality === 'stale'`.

---

## Code-Nachweise (Zeilen, Stand Branch `auto-debugger/work`)

### `useZoneKPIs` — Aufruf `aggregateZoneSensors`

```215:227:El Frontend/src/composables/useZoneKPIs.ts
      const aggregation = aggregateZoneSensors(group.devices)
      const totalDevices = group.devices.length
      const health = getZoneHealthStatus(alarmCount, activeSensors, sensorCount, onlineDevices, totalDevices, emergencyStoppedCount)

      deviceZoneMap.set(group.zoneId, {
        zoneId: group.zoneId,
        zoneName: group.zoneName,
        sensorCount,
        actuatorCount,
        activeSensors,
        activeActuators,
        alarmCount,
        aggregation,
```

### `ZoneTileCard` — „Ø“ und `st.avg`

```42:45:El Frontend/src/components/monitor/ZoneTileCard.vue
function formatKpiNumber(st: ZoneKPI['aggregation']['sensorTypes'][number]): string {
  if (st.count === 0) return '—'
  return formatNumber(st.avg, 1, '—')
}
```

```77:81:El Frontend/src/components/monitor/ZoneTileCard.vue
          <span class="monitor-zone-tile__kpi-value">
            <span class="monitor-zone-tile__kpi-avg">Ø</span>
            <span class="monitor-zone-tile__kpi-number">{{ formatKpiNumber(st) }}</span>
            <span class="monitor-zone-tile__kpi-unit">{{ st.unit }}</span>
          </span>
```

### `ZonePlate` — `avg` ohne „Ø“-Label

```113:121:El Frontend/src/components/dashboard/ZonePlate.vue
// ── B1: Zone Sensor Aggregation ──────────────────────────────────────────
const zoneAggregation = computed(() => aggregateZoneSensors(props.devices))

const aggregatedValues = computed(() => {
  return zoneAggregation.value.sensorTypes.map((agg) => {
    const avgRounded = Number.isInteger(agg.avg) ? `${agg.avg}` : agg.avg.toFixed(1)
    return `${avgRounded}\u2009${agg.unit}`
  })
})
```

### `aggregateZoneSensors` — Stale- und Null-Filter

```1398:1412:El Frontend/src/utils/sensorDefaults.ts
    for (const group of grouped) {
      for (const val of group.values) {
        if (val.value === null || val.value === undefined) continue
        if (val.quality === 'stale') continue // Skip stale data
        if (val.value === 0 && val.quality === 'unknown') continue // Skip DB init value (no live data yet)
        if (val.type === 'vpd' && val.value <= 0) continue // VPD=0 is physically unrealistic

        const category = getSensorAggCategory(val.type)
        if (category === 'other') continue // Skip uncategorized

        if (!categoryValues.has(category)) {
          categoryValues.set(category, [])
        }
        categoryValues.get(category)!.push(val.value)
```

---

## IST-Frage 7 — Einheitliche Ø-Labels

**IST:** Monitor L1 nutzt „Ø“; Hardware-Header (`ZonePlate`) nicht.

**SOLL (Empfehlung, kein Implementierungsauftrag in diesem Lauf):**

1. **Label-Harmonisierung:** Im Hardware-Zonenheader vor oder neben `aggregatedValues` ein einheitliches Präfix oder Tooltip, z. B. **„Ø“** oder Text **„Zonenmittel“**, konsistent mit Monitor.
2. **Tooltip (optional, Paketvorschlag):** z. B. „Zonenmittel (ohne stale)“ — entspricht der Filterlogik in `aggregateZoneSensors` (stale-Werte fließen nicht in `avg` ein).

Umsetzung nur nach explizitem Gate / Auftrag (Steuerdatei: keine Produktänderung ohne Freigabe).

---

## Abgleich L1 vs. Hardware (Kurz)

| Aspekt | Monitor L1 | Hardware `ZonePlate` |
|--------|------------|----------------------|
| Aggregationsfunktion | `aggregateZoneSensors(group.devices)` via `useZoneKPIs` | `aggregateZoneSensors(props.devices)` |
| Angezeigter Kennzahlwert | `st.avg` | `agg.avg` |
| Kennzeichnung Mittelwert | Ja („Ø“) | Nein (nur Zahl + Einheit) |
| Zusatz | `formatNumber` / separates Label `st.label` | Pipe-Liste, `+extraTypeCount` |

---

## optionaler Follow-up (nur Bericht)

- **TASK-PACKAGES-Vorschlag (nicht erstellt):** Ein kleines UI-Paket `frontend-dev`: Label/Tooltip in `ZonePlate` angleichen; Tests/Story falls vorhanden; `vue-tsc` grün.

---

## Erfüllung `done_criteria` (Steuerdatei)

- Bericht unter `docs/analysen/BERICHT-monitor-zone-kpi-ssot-zoneplate-zonetilecard-2026-04-10.md` mit verifizierten Pfaden und Zeilenreferenzen.
- Mindestens drei Nachweise: `useZoneKPIs`, `ZoneTileCard` (Ø), `ZonePlate` (avg ohne Label), `aggregateZoneSensors` (Filter).
- Klare Aussage: **Mathematik-SSOT gegeben**; **Label-SSOT / Operator-Klarheit** mit dokumentierter Lücke und SOLL-Empfehlung.
