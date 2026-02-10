# Frontend Logging - Implementierungsplan
Datum: 2026-02-09
Status: Plan erstellt, bereit zur Implementierung

## Erstanalyse-Verifikation: ALLE FINDINGS BESTÄTIGT

| Finding | Status |
|---------|--------|
| 241 console.* in 33 Dateien | CONFIRMED (grep=245/34, minus 4 JSDoc-Kommentare) |
| Level-Breakdown 85/67/35/30/24 | CONFIRMED |
| window.onerror fehlt | CONFIRMED |
| VITE_LOG_LEVEL kaum genutzt | CONFIRMED (nur dragState.ts:36) |
| Kein zentraler Logger | CONFIRMED |
| 6 [DEBUG]-Artefakte | CONFIRMED (SystemMonitorView:917-989) |
| 12 %c-Calls in 6 Dateien | CONFIRMED |
| Keine Promtail Frontend-Stage | CONFIRMED |
| Grafana Panel 4 = nur UP/DOWN | CONFIRMED |
| Loki kein CORS | CONFIRMED (irrelevant - Docker pipeline) |

## Plan: 5 Teile, ~4h Aufwand

### 1. Logger (`src/utils/logger.ts`, ~80 LOC)
- `createLogger(component)` Factory
- Level-Gate via `import.meta.env.VITE_LOG_LEVEL`
- debug-Mode: human-readable (Entwickler-Konsole)
- non-debug-Mode: JSON one-liner (Promtail/Loki)
- Error IMMER durch (kein Gate)
- Vollständiger Code im Plan-File

### 2. main.ts Update
- window.onerror ergänzen
- 3 bestehende Handler auf Logger umstellen

### 3. Migration in 4 Batches (241 Calls)
| Batch | Dateien | Calls | Aufwand |
|-------|---------|-------|---------|
| 1: API Layer | 2 (index.ts, esp.ts) | 20 | 20 min |
| 2: Services | 1 (websocket.ts) | 28 | 25 min |
| 3: Stores | 4 (esp, logic, auth, dragState) | 67 | 45 min |
| 4: Views+Components | 25 | 122 | 90 min |

5 Replacement-Patterns definiert (A-E):
- A: Simple tagged calls (häufigstes)
- B: Styled %c calls (6 Dateien, lokale log() entfernen)
- C: [DEBUG] artifacts (→ logger.debug)
- D: Multi-arg string concatenation
- E: Iteration logs (→ single aggregate)

### 4. Promtail Pipeline-Stage
```yaml
- match:
    selector: '{compose_service="el-frontend"}'
    stages:
      - json:
          expressions:
            level: level
            component: component
      - labels:
          level:
          component:
```

### 5. Grafana Panel 4 Update
- "Frontend Log Activity" → "Frontend Errors (Last 5m)"
- Query: `count_over_time({compose_service="el-frontend", level="error"}[5m])`

## Vollständiger Plan
Datei: `.claude/plans/vivid-wobbling-wilkinson.md`
Enthält copy-paste-ready: Logger-Code, main.ts, Promtail-YAML, Grafana-JSON, Verifikations-Checkliste
