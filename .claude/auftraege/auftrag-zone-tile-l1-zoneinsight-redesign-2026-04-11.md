# Auftrag — Monitor L1 ZoneTileCard „Zoneinsight“ statt Repräsentativ-Gauges + Bearbeiten-UX

**Datum:** 2026-04-11  
**Repo:** Auto-one (AutomationOne)  
**Status:** Phase 1 (A–C + D teilweise) umgesetzt im Frontend-Checkout.

## Kurz-Evidence (IST → SOLL)

| Thema | Dateien |
|--------|---------|
| Kein Standard-Doppel-Gauge mehr | `MonitorView.vue` — `ensureZoneTileDashboard` erzeugt leeres `zone-tile`-Layout; Migration leert Legacy-Auto-2×-Gauge |
| Zoneinsight VPD + 24h | `ZoneTileInsightBlock.vue`, `sensorDefaults.ts` (`computeAirVpdKpaFromTempRh`, `computeZoneVpdKpaFromKpiSensorTypes`), `zoneTileInsight.ts` (`pickZoneLeadTemperatureSensor`) |
| Bearbeiten am richtigen Ort | `ZoneTileCard.vue` — Stift-Link `@click.stop` → `editor-dashboard` mit `serverId \|\| layoutId` |
| Kein „hängender“ Link unter Gauges | `InlineDashboardPanel.vue` — `compact` zone-tile **Bearbeiten**-Zeile entfernt |

## BLOCKER (nicht in diesem Commit)

- **pH/EC Soll–Ist, Messfälligkeit (E/F):** braucht DB/API und eine autorisierte CRUD-Stelle — Kachel bleibt bewusst read-only.
- **Tag/Nacht (H):** Produktregel Zeitfenster offen.

## Tests

- `tests/unit/utils/sensorDefaults.test.ts` — VPD- und Prioritäts-Tests ergänzt.
- `npx vue-tsc --noEmit` — grün (inkl. kleiner TS-Fixes in `useDeviceActions.ts`, unbenutzte Route-Computeds in `TopBar.vue`).

---

*(Vollständiger Lastenheft-Text war in der ursprünglichen Chat-Nachricht enthalten; diese Datei fasst die Umsetzung und Evidence für das Team zusammen.)*
