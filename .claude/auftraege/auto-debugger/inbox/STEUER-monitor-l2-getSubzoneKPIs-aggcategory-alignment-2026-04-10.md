---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: monitor-l2-subzone-kpis-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-monitor-l2-subzone-kpis-aggcategory-2026-04-10.md
scope: |
  IST-Analyse: getSubzoneKPIs in MonitorView.vue gruppiert nach SENSOR_TYPE_CONFIG[sensor_type].category
  (temperature, air, water, ...). Mehrere physikalische Groessen (RH %, CO2 ppm, Druck hPa) teilen category 'air'
  → fachlich falsche Vermischung in einem Mittelwert.

  AUFGABE:
  1) MonitorView.vue: Funktion getSubzoneKPIs vollstaendig lesen; alle sensor_type die category 'air' tragen auflisten
     (sensorDefaults / SENSOR_TYPE_CONFIG im Tree verifizieren).
  2) aggregateZoneSensors / getSensorAggCategory: Abgleich AggCategory vs. Config.category dokumentieren.
  3) Bericht mit Evidence-Zeilen, minimaler Repro-Beschreibung (Fixture-Idee: SHT + CO2 + BME in einer Subzone).
  4) SOLL-Vorschlag: Umstellung auf AggCategory oder gemeinsame Hilfsfunktion; keine Implementierung in diesem Lauf
     ausser Robin oeffnet Implementierungs-Gate.

  VPD: expliziter skip in getSubzoneKPIs — im Bericht als konsistent mit RH-Trennung festhalten; Ersatz-Metrik VPD separat.
forbidden: |
  Keine Secrets. Keine API-/Schema-Breaks ohne Gate. Branch auto-debugger/work; kein push/force.
  Bash nur eingeschraenkt wie Policy. Keine Pfade ausserhalb Auto-one-Wurzel im Bericht.
done_criteria: |
  - Bericht docs/analysen/BERICHT-monitor-l2-subzone-kpis-aggcategory-2026-04-10.md mit Code-Nachweis der air-Vermischung.
  - Liste aller unter 'air' fallenden sensor_types aus aktuellem SENSOR_TYPE_CONFIG.
  - Klare SOLL-Empfehlung (Refactor-Pfad) und Test-Idee; keine fabulierten Laufzeitwerte.
---

# Steuerlauf — L2 Subzone-KPI-Zeile und AggCategory-Ausrichtung

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `monitor-l2-subzone-kpis-2026-04-10`

## Ziel (ein Satz)

Nachweisen, dass **getSubzoneKPIs** und **aggregateZoneSensors** unterschiedlich gruppieren — und einen **refactor-sicheren** SOLL-Pfad dokumentieren.

## Runbook (imperativ)

1. `El Frontend/src/views/MonitorView.vue` — getSubzoneKPIs lokalisieren, Map-Keys und Einheiten-Ausgabe pruefen.
2. `El Frontend/src/utils/sensorDefaults.ts` — SENSOR_TYPE_CONFIG category-Felder; grep nach `category: 'air'`.
3. `getSensorAggCategory` und aggregateZoneSensors — Bucket-Logik fuer Vergleichstabellen.
4. Bericht: IST-Problem (dimensionslose Mittelwerte) mit Zeilenreferenzen; Risiko fuer Operator.
5. STOP — Implementierung nur als Follow-up-Paket im Bericht.

## Aktivierung (nach Kopie nach Auto-one inbox)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-monitor-l2-getSubzoneKPIs-aggcategory-alignment-2026-04-10.md
Bitte Steuerlauf: L2 Subzone-KPI-Bericht mit AggCategory-Abgleich; keine Code-Fixes ohne Gate.
```
