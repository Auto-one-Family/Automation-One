# ADR-002: Fertigation Dual-Data-Source Architektur

**Status:** Accepted (2026-04-14)

**Entscheidungstreffer:** Frontend-Dev (Robin)

---

## Context

Das `FertigationPairWidget` (Vue 3) verbindet zwei separate Sensoren (Inflow/Runoff) für EC- und pH-Messungen.
Historisch gibt es 3 Datenpfade:

1. **REST KPI Bootstrap** — Initial-Load beim Component-Mount via `sensorsApi.queryData()`
2. **WebSocket KPI Live** — Real-time Sensor-Updates via `sensor_data` Events (pro Sensor separate Listener)
3. **Chart-eigener REST+WS** — MultiSensorChart hat seine eigenen API-Calls und WS-Subscriptions

Bislang gab es **keinen expliziten Divergenz-Schutz** zwischen KPI-Composable und Chart, und **Staleness** (Zeitdifferenz zwischen Messungen) war nur intern berechnet, nicht visuell sichtbar.

---

## Decision

Wir **akzeptieren** die Dual-Source-Architektur mit folgenden **minimalen** Schutzmaßnahmen:

1. **Staleness-Indicator visuell anzeigen** — Badge im Widget, die ab >60s sichtbar wird:
   - Orange Farbe (warning) bei 60–300s
   - Rot (danger) bei >300s
   - Rundet auf Sekunden ab

2. **Divergenz-Logging (Debug-Level)** — Console.warn wenn Timestamp-Differenz >5s:
   ```
   log.warn(`Divergence detected: staleness ${stalenessSeconds.toFixed(1)}s`, { inflowTime, runoffTime })
   ```
   Hilft bei Troubleshooting ohne die Architektur zu ändern.

3. **Keine Deduplication zwischen REST und WS** — Timestamps sind unterschiedlich genug, dass Chart-Duplikate selten sind. Wenn nötig: Chart-seitige Deduplication.

---

## Rationale

### Warum Dual-Source akzeptieren?

- **REST = Historisch**, WS = Live — kein echter Konflikt bei normalem Betrieb
- **Staleness-Detection** ist bereits implementiert (>300s Warning) → nur visuell zugänglich machen
- **Separates Chart-System** ist zielgerichtet für große Datenmengen/Zooming → nicht verbinden ohne Grund
- **Minimale Änderung** = niedrig Risiko, sofort umzusetzen

### Warum nicht fusionieren?

- Würde alle 3 Pfade synchronisieren → großer Refactoring (Chart, Store, Composable)
- REST für historische Daten zu langsam für Live-Updates
- WS für 7-Tage-Charts zu speicherintensiv
- Current-State: kommt mit Kurz-Divergenzen klar

### Monitoring statt Architektur

- Operator sieht **jetzt** wenn Staleness steigt → kann debuggen
- Wenn Divergenzen häufig >5s → neuer ADR für Server-seitige Koordination
- Operator kann via Console (log.warn) echte Desync erkennen

---

## Consequences

### Positive

- Staleness ist jetzt **visuell erkennbar** → schnelles Handeln möglich
- Divergenz-Logging hilft bei zukünftigen **Incident-Posts**
- **Keine Code-Duplikation** zwischen KPI und Chart
- **Lowrisk, highspeed** — sofort nach Demo implementierbar

### Negative / Akzeptierte Risiken

- **Kurzfristige Divergenz (<5s)** ist tolerated — kann zu "Fluktuationen" im Widget führen
  - Mitigiert durch: Staleness-Badge warnt proaktiv
- **Chart und KPI** zeigen *leicht* unterschiedliche Werte (wenn Timestamps drift)
  - Mitigiert durch: Operator-Kontext (KPI = Rechts jetzt, Chart = Historisch)
- **Monitoring-Overhead** — log.warn bei >5s staleness kann spammig werden
  - Mitigiert durch: Nur auf WS-Update-Logik, nicht pro Frame

---

## Follow-up ADRs (bei Bedarf)

Wenn Monitoring in 2–4 Wochen zeigt:
- Divergenzen **häufig >10s** → ADR-003 für Server-seitige Timestamp-Sync
- Staleness **>300s regelmäßig** → ADR-004 für Connection-Failover-Logik
- Chart und KPI **stark divergieren** → ADR-005 für einheitliche Quelle (Server-seitige KPI-Caches)

---

## Implementation Status

- [x] **FertigationPairWidget.vue** — Staleness-Badge hinzugefügt (Warning/Danger Farben)
- [x] **useFertigationKPIs.ts** — Divergenz-Logging bei >5s Timestamp-Differenz
- [ ] **Testing** — Manual Validation in Dev/Prod
- [ ] **Monitoring** — Grafana Dashboard für Staleness-Trends (optional, Phase 2)

---

## References

- Datei: `El Frontend/src/components/dashboard-widgets/FertigationPairWidget.vue` (Zeilen 248–276)
- Datei: `El Frontend/src/composables/useFertigationKPIs.ts` (Zeilen 302–402, divergence logging)
- Kommentar: "Dual-data-source" Problem ist bekannt — keine neuen Bugs, nur sichtbar machen + logging
