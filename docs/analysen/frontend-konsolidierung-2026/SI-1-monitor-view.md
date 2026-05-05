# SI-1 — MonitorView (L1/L2) Pattern-First-Inventar

> **Issue:** [AUT-232](https://linear.app/autoone/issue/AUT-232)
> **Parent:** AUT-230 (Frontend-Konsolidierung 2026, Strang 1 von 8)
> **Datum:** 2026-05-06
> **Modus:** Read-only Inventar — keine Implementierung

## Executive Summary

Lagebild des Monitor-Lagebilds (L1 Zone-Tiles → L2 Zone-Detail) ist insgesamt sauber zentralisiert. Zwei klare Schwächen:

1. **Stale-Dualismus:** Zone-Stale (60 s) und Device-Stale (90 s) leben in zwei Composables.
2. **Hardcoded px in Charts/Icons:** Mobile-Token-Disziplin nicht durchgängig.

Keine Legacy-`mode="inline"`-Reste. KPI-Aggregation ist über `useZoneKPIs` + `aggregateZoneSensors` einzige Wahrheit.

---

## Aufgabe 1 — useZoneKPIs als einzige KPI-Quelle

| Stelle | Datei:Zeile | Befund |
|--------|-------------|--------|
| Zentrale Aggregation | `composables/useZoneKPIs.ts:98-327` | `computeZoneKPIs()` nutzt `aggregateZoneSensors()` + `getESPStatus()`, exposed als `zoneKPIs` und `filteredZoneKPIs` |
| L1-Konsument | `views/MonitorView.vue:160` | `useZoneKPIs({ filter: selectedZoneFilter })` |
| Tile-Konsument | `components/monitor/ZoneTileCard.vue:14` | Props `zone: ZoneKPI` (Typ aus `useZoneKPIs`) |
| Sensor-Aggregation Utility | `utils/sensorDefaults.ts:1617` | `aggregateZoneSensors()` — keine dezentralen Re-Aggregationen gefunden |

**Befund:** ✅ Zentral. Keine Doppel-Berechnung in Komponenten. **Kanon: `useZoneKPIs`.**

---

## Aufgabe 2 — Stale-Indikator

| Stelle | Datei:Zeile | Schwelle | Skopus |
|--------|-------------|----------|--------|
| Zone-Stale | `composables/useZoneKPIs.ts:296-303` | `ZONE_STALE_THRESHOLD_MS` ≈ 60 s (`utils/formatters.ts`) | Zone-Aktivität (lastActivity) |
| Device-Stale | `composables/useESPStatus.ts:70-97` | `HEARTBEAT_STALE_MS = 90 s`, `HEARTBEAT_OFFLINE_MS = 210 s` | ESP-Heartbeat |
| L1-Pass-Through | `MonitorView.vue:2110` | — | `:is-stale="isZoneStale(zone.lastActivity)"` |

**Befund:** ⚠️ Zwei Schwellen sind absichtlich (Zone ≠ Device), aber heute nirgends dokumentiert. AUT-199-Kanon `useESPStatus` regelt **Device**-Health, nicht Zone-Aggregat. **Kanon-Empfehlung:** Beibehaltung der Trennung, jedoch Begründung in Komponenten-Header dokumentieren.

---

## Aufgabe 3 — KPI-Set pro Zone-Tile

Alle KPIs werden als Props aus `ZoneKPI` (zentral berechnet) gepasst — Template macht ausschließlich Display-Logik.

| KPI | Quelle | Datei:Zeile |
|-----|--------|-------------|
| Sensor-Count | Props `sensorCount`, `activeSensors`, `realSensorCount` (computed) | `ZoneTileCard.vue:14-51` |
| Aktor-Count | Props `actuatorCount`, `activeActuators` | `ZoneTileCard.vue:162-186` |
| Aktive Rules | Props `rules`, `totalRuleCount`, `isRuleActive()` | `ZoneTileCard.vue:141-158` |
| Alarm-Count | Props `alarmCount` (Teil `ZoneKPI`) | `ZoneTileCard.vue:14-36` |
| Last-Activity | Props `lastActivity` (für Stale-Berechnung) | `ZoneTileCard.vue:14-36` |
| Sensor-Ø-Werte | `zone.aggregation.sensorTypes[]` | `ZoneTileCard.vue:111-135` (Default-Slot) |
| Online-Devices | Props `totalDevices`, `onlineDevices`, `mobileGuestCount` | `ZoneTileCard.vue:162-186` (Footer) |

**Befund:** ✅ Strikt props-driven. Keine Aggregations-Logik im Tile.

---

## Aufgabe 4 — L1/L2-Trennung

| Element | Datei:Zeile | L-Stufe | Befund |
|---------|-------------|---------|--------|
| Tile-Click → L2 | `MonitorView.vue:2117` | L1 | `@click="goToZone(zone.zoneId)"` (saubere Navigation) |
| Editor-Link Header-Slot | `ZoneTileCard.vue:83-92` + `MonitorView.vue:2116` | L1 | `:zone-tile-editor-to=…` mit `@click.stop` (kein Tile-Click) |
| Insight-Block / Mini-Widgets | `MonitorView.vue:2119-2131` | L1 | `ZoneTileInsightBlock` + `InlineDashboardPanel mode="view"` im `#extra`-Slot |
| L2-Header | `MonitorView.vue:2138-2147` | L2 | Back-Button + prev/next-Navigation |
| Konfig-Buttons direkt auf Tile | — | — | **Keine** (außer Editor-Link in Header-Slot) |

**Befund:** ✅ Klare Trennung. Tile reagiert nur auf Click → L2. Editor-Link ist explizit ausgenommen. Kein Diagnose-Inhalt im Lagebild.

---

## Aufgabe 5 — Legacy `mode="inline"` Inventar

```bash
# Suche im gesamten El Frontend/src/
mode="inline"  →  0 Treffer
mode: 'inline' →  0 Treffer
```

**Befund:** ✅ Komplett entfernt. Aktive Modi: `view`, `manage`, `side-panel`. Kein Cleanup nötig.

---

## Aufgabe 6 — Mobile-Breakpoints / Token-Disziplin

| Datei | Zeile | Code | Bewertung |
|-------|-------|------|-----------|
| `MonitorView.vue` | 2337 | `height="32px"` (Icon-SVG) | ❌ hardcoded |
| `MonitorView.vue` | 2359 | `style="height: 160px"` (Chart) | ❌ inline px |
| `MonitorView.vue` | 2608 | `style="height: 300px"` (Sensor-Detail-Chart) | ❌ inline px |
| `ZoneTileCard.vue` | 348 | `padding: 2px ...` | ⚠️ Token-Mix |
| `ZoneTileCard.vue` | 379 | `gap: 1px` | ⚠️ hardcoded |
| `ZoneTileCard.vue` | 384 | `min-height: 64px` | ⚠️ hardcoded |
| `ZoneTileCard.vue` | 520 | `height: 18px` | ⚠️ hardcoded |
| `ZoneTileCard.vue` | 229 | `translateY(-2px)` | ⚠️ hardcoded |
| `ZoneTileCard.vue` | 251–252 | `min-width: 44px` (Touch-Target — gerechtfertigt) | ⚠️ aber bewusst |
| `ZoneTileCard.vue` | 267–268 | `width/height: 18px` (Icon) | ⚠️ hardcoded |

**Befund:** ⚠️ Chart-Höhen (160 px, 300 px) und Icon-Größen (18, 32 px) liegen außerhalb der `--space-*`-Tokens. ZoneTileCard nutzt `--space-*` mehrheitlich, aber Mix mit absoluten Werten.

---

## Server- & ESP-Touchpoints

* **WS-Events** (16 relevant): `sensor_data`, `actuator_status`, `actuator_response`, `actuator_alert`, `esp_health`, `zone_assignment`, `subzone_assignment`, `logic_execution`, `notification_updated`, `unread_count`, `error_event`, `system_event` u.a. — alle laufen heute durch Stores in den KPI-Layer.
* **Heartbeat-Abhängigkeit:** `last_seen` aus 60-s-Heartbeat speist `useESPStatus`, dort `> 90 s = stale`, `> 210 s = offline`.
* **Kein L1-Resolution-Touchpoint** — Tiles zeigen nur Live-KPIs.

---

## Follow-up-Vorschläge (keine Implementierung in diesem Strang)

| # | Vorschlag | Aufwand | Prio |
|---|-----------|---------|------|
| F1 | Stale-Schwelle `ZONE_STALE_THRESHOLD_MS` in Komponenten-Header dokumentieren (Begründung Zone ≠ Device) | XS | Low |
| F2 | Chart-Höhen (160 px, 300 px) als CSS-Variablen `--chart-h-tile` / `--chart-h-detail` extrahieren | S | Med |
| F3 | Icon-Größen 18/32 px → `--size-icon-sm` / `--size-icon-md` Token einführen | S | Low |
| F4 | `ZoneTileCard.vue` `gap: 1px` / `padding: 2px` auf `--space-1` o.ä. mappen oder rechtfertigen | XS | Low |
| F5 | Test: filtert `filteredZoneKPIs` „Nicht zugewiesen“-Devices korrekt? Heute separater Code-Pfad | S | Med |

**Folge-Issues:** Bei Bedarf an `AUT-203` (SubzoneTileCard) und `AUT-199` (`useESPStatus` Kanon) anhängen.

---

## Anhang — Pattern-Tabelle (zur Übernahme in das Konsolidierungs-Umbrella)

| Konzept | Implementierungsstellen | Kanon-Kandidat | Abweichungen |
|---------|------------------------|----------------|--------------|
| KPI-Aggregation | `useZoneKPIs` + `aggregateZoneSensors` | `useZoneKPIs` | — |
| Stale (Zone) | `useZoneKPIs.isZoneStale` | `useZoneKPIs` | dokumentationslos abweichend von Device-Stale |
| Stale (Device) | `useESPStatus.getESPStatus` | `useESPStatus` (AUT-199) | — |
| KPI-Pass-through | `ZoneTileCard` Props | Props-only | ✅ |
| L1/L2-Navigation | `MonitorView.goToZone` | `goToZone` | ✅ |
| Mini-Widgets in L1 | `InlineDashboardPanel mode="view"` (extra-Slot) | `InlineDashboardPanel` | ✅ |
| Editor-Link in L1 | `ZoneTileCard #header-slot` | Slot-Pattern | ✅ |
| Mobile-Tokens | Mix aus `--space-*` und hardcoded px | `--space-*` Tokens | Charts/Icons noch hardcoded |
