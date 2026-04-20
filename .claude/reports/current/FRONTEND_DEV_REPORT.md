# Frontend Dev Report: AUT-64 Config-Timeout als Pending-Finalität

## Modus: B (Implementierung)
## Auftrag: Linear-Issue AUT-64 — Frontend Config-Timeout als ausstehende Finalität erkennbar machen

## Codebase-Analyse

Analysierte Dateien:
- `El Frontend/src/components/esp/ActuatorConfigPanel.vue` — handleSave() mit waitForConfigTerminal
- `El Frontend/src/components/esp/SensorConfigPanel.vue` — identisches Pattern
- `El Frontend/src/shared/stores/actuator.store.ts` — Intent-State-Machine, Config-Lifecycle
- `El Frontend/src/composables/useToast.ts` — Toast-API (warning/error/info)
- `El Frontend/src/utils/logger.ts` — Structured Logger
- `El Frontend/src/styles/tokens.css` — Design-Tokens (warning/info-Farben)
- `El Frontend/src/components/dashboard/ActionBar.vue` — Referenz für UI-Pattern
- `El Frontend/src/router/index.ts` — SystemMonitor-Route für Deep-Link

Gefundene Patterns:
- Toast mit dedupeKey für idempotente Benachrichtigungen
- BEM-CSS mit Design-Token-Variablen (tokens.css)
- Spinner-Pattern: `Loader2` + `animate-spin` (Lucide)
- RefreshCw für Retry-Buttons
- reactive Map in Pinia Stores (Vue 3.2+ Map-Reaktivität)

## Qualitätsprüfung (8-Dimensionen-Checkliste)

| # | Dimension | Status | Details |
|---|-----------|--------|---------|
| 1 | Struktur & Einbindung | ✅ | PendingConfigBanner in components/esp/, Store-Erweiterung in shared/stores/ |
| 2 | Namenskonvention | ✅ | PascalCase Komponente, camelCase Funktionen, BEM-CSS |
| 3 | Rückwärtskompatibilität | ✅ | Nur additive Änderungen; bestehende toast.error bei config_failed bleibt |
| 4 | Wiederverwendbarkeit | ✅ | PendingConfigBanner wiederverwendbar für Actuator + Sensor Panels |
| 5 | Speicher & Ressourcen | ✅ | reactive(Map) statt plain Map — minimaler Overhead, kein Memory-Leak |
| 6 | Fehlertoleranz | ✅ | Defensiv gegen fehlende correlation_id (unknown:… Fallback) |
| 7 | Seiteneffekte | ✅ | Keine Store-Leaks, Banner reactivity via computed → kein manuelles Cleanup nötig |
| 8 | Industrielles Niveau | ✅ | TypeScript strict, aria-live, Design-Token-konform |

## Cross-Layer Impact

| Betroffener Bereich | Prüfergebnis |
|---------------------|-------------|
| Server (config_published/response/failed) | Kein Server-Code geändert. Frontend interpretiert bestehende Events defensiver. |
| WebSocket-Kontrakt | Unverändert. correlation_id wird so genutzt wie sie kommt (inkl. unknown:… Fallback) |
| AUT-65 Abhängigkeit | Code arbeitet mit beiden Szenarien: konsistente und unknown:… correlation_ids |

## Ergebnis

### Modifizierte Dateien

1. **`El Frontend/src/shared/stores/actuator.store.ts`**
   - L18: `import { reactive, computed } from 'vue'` hinzugefügt
   - L152: `intents = reactive(new Map())` statt `new Map()` (reaktiv für UI-Binding)
   - L407-429: `scheduleConfigTimeout` — `toast.error` → `toast.warning`, Observability-Log `config_pending_over_timeout` hinzugefügt
   - L1153-1198: Neue Funktionen `pendingConfigOrders` (computed), `findConfigIntentBySubject()`, `dismissConfigTimeout()`
   - L1211-1213: Neue Exports

2. **`El Frontend/src/components/esp/ActuatorConfigPanel.vue`**
   - L30-36: Import PendingConfigBanner, createLogger
   - L66-67: `lastConfigSubjectId`, `lastConfigCorrelationId` refs
   - L376-419: `handleSave()` — timeout-Pfade: `toast.error` → `toast.warning`, Observability-Logs, Pending-State-Tracking, Error-Toast NUR bei terminal_failed/integration_issue
   - L742-747: PendingConfigBanner Template-Integration vor Actions

3. **`El Frontend/src/components/esp/SensorConfigPanel.vue`**
   - L31-37: Import PendingConfigBanner, createLogger
   - L71-72: `lastConfigSubjectId`, `lastConfigCorrelationId` refs
   - L407-457: `handleSave()` — identische Timeout-Umstellung wie ActuatorConfigPanel
   - L832-837: PendingConfigBanner Template-Integration vor Actions

4. **`El Frontend/src/components/esp/PendingConfigBanner.vue`** (NEU)
   - Reusable inline-Komponente für Config-Pending-Status
   - Spinner (Loader2) für active pending, AlertTriangle für timeout
   - correlation_id Anzeige (gekürzt wenn lang)
   - Deep-Link zu `/system-monitor?tab=events`
   - Retry-Button (emits retry, dismissed timeout-Intent, löst neuen Save aus)
   - Dismiss-Button für Timeout-Intents
   - `aria-live="polite"`, `role="status"`
   - BEM-CSS mit Design-Tokens

## Verifikation

- **`npm run build`**: Exit-Code 0 ✅ (vue-tsc -b + vite build)
- **`npx vue-tsc --noEmit`**: Exit-Code 0 ✅
- **Linter**: Keine Fehler ✅

### Akzeptanzkriterien-Abgleich

| Kriterium | Status | Details |
|-----------|--------|---------|
| `config_published` ohne terminales Event → Pending-Status sichtbar, kein Hard-Error | ✅ | Warning-Toast + PendingConfigBanner (Spinner + "Konfigurationsauftrag läuft") |
| Nach nachgeliefertem `config_response` schließt Pending sauber auf success/failed | ✅ | `waitForConfigTerminal` resolved, Banner verschwindet bei terminal_success, refs werden null gesetzt |
| `npm run build` grün | ✅ | Exit 0 |
| `vue-tsc --noEmit` grün | ✅ | Exit 0 |
| Error-Toast NUR bei explizitem config_failed/Contract-Mismatch | ✅ | `terminal_failed`/`terminal_integration_issue` → toast.error; timeout → toast.warning |
| A11y: Pending-State mit aria-live + Spinner statt X-Icon | ✅ | `aria-live="polite"`, `role="status"`, Loader2-Spinner |
| Observability: config_pending_over_timeout → console.info | ✅ | Structured JSON-Log via createLogger in Store + Config-Panels |
| Retry-Aktion mit neuer correlation_id | ✅ | PendingConfigBanner emits retry → handleSave() generiert neue correlation_id via REST |
| Persistente Statusfläche mit correlation_id + Deep-Link | ✅ | PendingConfigBanner zeigt correlation_id, Link zu /system-monitor?tab=events |

## Testbeschreibung

Manuelle Verifikation möglich:
1. Config-Panel öffnen → Speichern klicken
2. Server-seitig config_response unterdrücken (oder Gerät offline)
3. Nach ~45-65s: Warning-Toast erscheint, PendingConfigBanner zeigt Spinner + "Konfigurationsauftrag läuft"
4. Nach Store-Timeout: Banner wechselt zu Warning-Icon + "Konfigurationsauftrag ausstehend" mit Retry-Button
5. Retry-Button klicken → neuer Save-Auftrag mit neuer correlation_id
6. config_response nachliefern → Banner verschwindet, Success-Toast
7. config_failed senden → Error-Toast (NICHT Warning)

Vitest-Unit-Test möglich über actuator.store Mock (pendingConfigOrders reactive computed testen).

## Empfehlung

Kein weiterer Agent nötig für AUT-64. Falls AUT-65 (WS correlation_id Konsistenz) Änderungen am Envelope bringt, ist der Frontend-Code bereits defensiv implementiert.

---
**Timestamp:** 2026-04-17
**Agent:** frontend-dev
**Linear:** AUT-64
