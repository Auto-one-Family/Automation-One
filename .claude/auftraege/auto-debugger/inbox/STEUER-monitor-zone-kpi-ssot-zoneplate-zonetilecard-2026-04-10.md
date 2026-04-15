---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: monitor-zone-kpi-ssot-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-monitor-zone-kpi-ssot-zoneplate-zonetilecard-2026-04-10.md
scope: |
  IST-Analyse und Evidence-Bericht: Zonen-Kennzahlen Monitor L1 vs. Hardware Zone-Header.

  KERNBEFUND (zu verifizieren im Tree):
  - useZoneKPIs ruft aggregateZoneSensors(group.devices) auf; ZoneTileCard zeigt explizit „Ø“ + formatNumber(st.avg).
  - ZonePlate nutzt aggregateZoneSensors(props.devices); aggregatedValues zeigt avg ohne textliches „Ø“/„Durchschnitt“.
  - Risiko: gleiche Mathematik, unterschiedliches Mental Model fuer Operator.

  AUFGABE:
  1) Pfade und Zeilen zu useZoneKPIs, ZoneTileCard, ZonePlate, aggregateZoneSensors im aktuellen Checkout verifizieren.
  2) Dokumentieren: welche Stale-/null-Filter in aggregateZoneSensors greifen; Konsistenz L1 vs. Hardware.
  3) Bericht docs/analysen/BERICHT-monitor-zone-kpi-ssot-zoneplate-zonetilecard-2026-04-10.md mit Executive Summary,
     Evidence-Tabelle (Datei, Funktion, Semantik), Abgleich IST-Frage 7 (einheitliche Ø-Labels), Empfehlung SOLL-Labels
     (keine Code-Aenderung in diesem Lauf ausser Robin explizit Gate oeffnet).

  OPTIONAL Follow-up (nur im Bericht als Paketvorschlag): Tooltip „Zonenmittel (ohne stale)“ fuer Hardware-Header.
forbidden: |
  Keine Secrets. Keine Breaking Changes an REST/MQTT/WebSocket/DB ohne separates Gate.
  Code-Aenderungen nur auf Branch auto-debugger/work (von master); kein git push / kein force.
  Bash nur: git status, branch, checkout auto-debugger/work, read-only diff/log.
  Im Steuertext und Ziel-Bericht keine Pfade ausserhalb der Auto-one-Wurzel; keine fremden Repositories.
  Keine erfundenen Zeilennummern — nach Lesen aktualisieren.
done_criteria: |
  - Bericht unter docs/analysen/BERICHT-monitor-zone-kpi-ssot-zoneplate-zonetilecard-2026-04-10.md existiert mit verifizierten Repo-Pfaden.
  - Mindestens drei Code-Nachweise: useZoneKPIs, ZoneTileCard (Ø), ZonePlate (avg ohne Label), aggregateZoneSensors (Stale/Kategorien).
  - Klare Aussage: SSOT erreicht oder dokumentierte Luecke + empfohlene Label-Harmonisierung.
---

# Steuerlauf — Zone-KPI SSOT und Header-Labeling (L1 vs. Hardware)

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `monitor-zone-kpi-ssot-2026-04-10`

## Ziel (ein Satz)

Evidence-basierter Bericht, ob **Zonenmittel** in Monitor L1 und Hardware-Header **dieselbe Aggregationssemantik** nutzen und wo **Labels** fehlen, die Operator-Verwechslung verhindern.

## Runbook (imperativ)

1. Branch `auto-debugger/work` pruefen.
2. `El Frontend/src/composables/useZoneKPIs.ts` lesen — Aufruf aggregateZoneSensors, Rueckgabefelder.
3. `El Frontend/src/components/monitor/ZoneTileCard.vue` — KPI-Slot, „Ø“, formatKpiNumber.
4. `El Frontend/src/components/dashboard/ZonePlate.vue` — zoneAggregation, aggregatedValues, fehlendes Ø-Label.
5. `El Frontend/src/utils/sensorDefaults.ts` — aggregateZoneSensors, Stale-Filter, AggCategory.
6. Synopse-Tabelle aus IST (Ort | Semantik | Risiko) ins Berichtsformat uebernehmen und gegen Code verifizieren.
7. Bericht schreiben; Implementierungs-Tickets nur als Vorschlag, nicht codieren ohne Gate.

## Aktivierung (nach Kopie nach Auto-one `.claude/auftraege/auto-debugger/inbox/`)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-monitor-zone-kpi-ssot-zoneplate-zonetilecard-2026-04-10.md
Bitte Steuerlauf: Bericht unter docs/analysen/ ablegen; nur Evidence, keine Feature-Aenderung ohne Gate.
```
