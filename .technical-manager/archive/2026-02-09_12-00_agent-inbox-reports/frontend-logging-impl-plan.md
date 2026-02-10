# Auftrag 4.2: Frontend Logging - Verifikation & Implementierungsplan
Datum: 2026-02-09
Agent: frontend-debug + system-control + main-context (parallel)
Typ: Verify + Plan

## Zusammenfassung

**Erstanalyse BESTÄTIGT.** Alle Kernfakten korrekt. Implementierungsplan für Phase 1+2 erstellt.

### Verifizierte Kernfakten
- 241 console.*-Calls in 33 Dateien (alle Level-Counts korrekt)
- Top-3: esp.ts(52), websocket.ts(28), SystemMonitorView.vue(20)
- window.onerror FEHLT (bestätigt)
- VITE_LOG_LEVEL definiert (docker-compose:133, default=debug) aber nur in 1 Datei genutzt
- Kein zentraler Logger vorhanden
- 6 [DEBUG]-Artefakte in SystemMonitorView (Zeilen 917-989)
- 12 styled %c-Calls in 6 Dateien
- Promtail: Keine Frontend-spezifische Pipeline-Stage
- Grafana: Panel 4 "Frontend Log Activity" = nur UP/DOWN, kein Level-Filter

### Implementierungsplan
1. **Logger**: `src/utils/logger.ts` (~80 LOC, createLogger Factory, JSON/plaintext dual-mode)
2. **main.ts**: window.onerror + alle Handler auf Logger umstellen
3. **Migration in 4 Batches**: API(20)→Services(28)→Stores(67)→Views+Components(122)
4. **Promtail**: JSON-Stage für el-frontend mit level/component Labels
5. **Grafana**: Panel 4 auf Frontend Error Count umstellen
6. **Aufwand**: ~4 Stunden, 36 Dateien

### Detailplan
Siehe: `.claude/plans/vivid-wobbling-wilkinson.md` (copy-paste-ready Code, YAML, Patterns)

## Nächster Schritt
TM entscheidet: Implementierung starten als Dev-Flow-Auftrag mit frontend-dev Agent.
Empfehlung: Batch-weise (1→2→3→4), nach jedem Batch `npm run build` zur Verifikation.
