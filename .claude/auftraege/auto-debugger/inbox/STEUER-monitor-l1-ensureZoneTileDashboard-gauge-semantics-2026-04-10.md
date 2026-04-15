---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: monitor-l1-zone-tile-gauges-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-monitor-l1-zone-tile-gauge-vs-zonenmittel-2026-04-10.md
scope: |
  IST-Analyse: ensureZoneTileDashboard legt zone-tile-Dashboards mit bis zu zwei gauge-Widgets an.
  Sensorauswahl: TILE_SENSOR_PRIORITY, erster Treffer pro Basis-Typ, kein aggregateZoneSensors.
  Folge: Gauge zeigt Repraesentativ-Sensor, KPI-Zeile zeigt Zonen-Ø — beides live, aber unterschiedliche Semantik.

  AUFGABE:
  1) MonitorView.vue: ensureZoneTileDashboard, TILE_SENSOR_PRIORITY, getTileSensorPriority, Widget-config sensorId
     im Tree verifizieren.
  2) dashStore / Widget-Typ gauge: dokumentieren wie Bindung an Live-Werte erfolgt.
  3) Bericht: Mental-Model, Optionen SOLL (Label „Repraesentativ“ vs. Gauge an Zonenmittel gebunden),
     Abhaengigkeiten (Performance, useZoneKPIs-Reuse).
  4) Keine UI-Aenderung in diesem Lauf ohne separates Gate.

forbidden: |
  Keine Secrets. Keine Breaking Changes. Branch auto-debugger/work. Bash eingeschraenkt. Nur Auto-one-Pfade.
done_criteria: |
  - Bericht docs/analysen/BERICHT-monitor-l1-zone-tile-gauge-vs-zonenmittel-2026-04-10.md mit Evidence zu ensureZoneTileDashboard
    und KPI-Pipeline.
  - Explizite Nutzer-sichtbare Optionen-Tabelle (Label-only vs. Datenkanal-Aenderung) mit Aufwand/Kurzrisiko.
---

# Steuerlauf — L1 Zone-Tile Gauges vs. Zonenmittel

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `monitor-l1-zone-tile-gauges-2026-04-10`

## Ziel (ein Satz)

Bericht, der **Spot-Sensor-Gauges** vs. **Ø-KPI** technisch und UX-klar trennt und umsetzbare SOLL-Optionen liefert.

## Runbook (imperativ)

1. Grep: ensureZoneTileDashboard, TILE_SENSOR_PRIORITY, zone-tile, gauge.
2. Ablauf dokumentieren: Zone → Sensoren sammeln → sort → pick → addWidget.
3. Abgleich ZoneTileCard-KPI (aggregateZoneSensors) im selben Bericht.
4. HMI-Referenz (Mittel vs. Spot) als Anforderungstext fuer Tickets — keine normative externe PDF woertenweise kopieren.

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-monitor-l1-ensureZoneTileDashboard-gauge-semantics-2026-04-10.md
Bitte Steuerlauf: Gauge-vs-Ø-Bericht; Evidence-only ohne Feature-Code ohne Gate.
```
