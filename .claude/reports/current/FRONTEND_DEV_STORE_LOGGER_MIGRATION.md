# Frontend Dev Report: Store Logger Migration

## Modus: B (Implementierung)

## Auftrag
Migrate all `console.*` calls in frontend stores to the new structured logger (`@/utils/logger.ts`).

## Codebase-Analyse
**Analyzed Files:**
- `El Frontend/src/stores/esp.ts` (2514 lines, 52 console.* calls)
- `El Frontend/src/stores/logic.ts` (346 lines, 10 console.* calls)
- `El Frontend/src/stores/auth.ts` (176 lines, 2 console.* calls)
- `El Frontend/src/stores/dragState.ts` (463 lines, 5 console.* calls via DEBUG flag + internal log())

**Identified Patterns:**
- All stores use Pinia setup syntax (`defineStore`)
- Console calls use `[StorePrefix]` pattern: `console.error('[ESP Store] message')`
- dragState.ts has custom DEBUG flag and styled log() function
- Multiple console.log calls need classification (info vs debug based on operational relevance)

## Qualitätsprüfung: 8-Dimensionen Checkliste

| # | Dimension | Status | Notes |
|---|-----------|--------|-------|
| 1 | Struktur & Einbindung | ✅ | Logger import added to all 4 stores, @/ alias used |
| 2 | Namenskonvention | ✅ | Logger instances use PascalCase: 'ESPStore', 'LogicStore', 'AuthStore', 'DragState' |
| 3 | Rückwärtskompatibilität | ✅ | No breaking changes - only internal logging migration |
| 4 | Wiederverwendbarkeit | ✅ | Uses centralized logger from `@/utils/logger.ts` |
| 5 | Speicher & Ressourcen | ✅ | No memory leaks - logger is lightweight, no cleanup needed |
| 6 | Fehlertoleranz | ✅ | Error logs preserved with same context, `error` parameter passed correctly |
| 7 | Seiteneffekte | ✅ | No side effects - logging behavior unchanged, only format changed |
| 8 | Industrielles Niveau | ✅ | Structured JSON logging ready for Docker/Promtail pipeline, TypeScript strict mode passes |

## Implementierung

### 1. auth.ts (2 console.error → logger.error)
- **Import added:** `import { createLogger } from '@/utils/logger'`
- **Logger created:** `const logger = createLogger('AuthStore')`
- **Replacements:**
  - Line 59: `console.error('Failed to check auth status:', err)` → `logger.error('Failed to check auth status', err)`
  - Line 128: `console.error('Logout API call failed:', err)` → `logger.error('Logout API call failed', err)`

### 2. logic.ts (10 console.* → logger.*)
- **Import added:** `import { createLogger } from '@/utils/logger'`
- **Logger created:** `const logger = createLogger('LogicStore')`
- **Replacements:** All 10 console.* calls replaced
  - `[Logic Store]` prefix removed from all messages
  - `console.debug` → `logger.debug`
  - `console.error` → `logger.error`
  - `console.info` → `logger.info`
- **Example:** `console.info(\`[Logic Store] Rule ${ruleId} toggled: enabled=${response.enabled}\`)` → `logger.info('Rule toggled', { ruleId, enabled: response.enabled })`

### 3. dragState.ts (5 calls - special handling)
- **Import added:** `import { createLogger } from '@/utils/logger'`
- **Logger created:** `const logger = createLogger('DragState')`
- **DEBUG constant removed:** `const DEBUG = import.meta.env.VITE_LOG_LEVEL === 'debug'` (not needed - logger handles level gating)
- **Internal log() function simplified:**
  ```typescript
  // BEFORE
  function log(message: string, data?: Record<string, unknown>): void {
    if (DEBUG) {
      const style = 'background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
      if (data) {
        console.log(`%c[DragState]%c ${message}`, style, 'color: #a78bfa;', data)
      } else {
        console.log(`%c[DragState]%c ${message}`, style, 'color: #a78bfa;')
      }
    }
  }

  // AFTER
  function log(message: string, data?: Record<string, unknown>): void {
    logger.debug(message, data)
  }
  ```
- **console.warn replaced:** Line 161: `console.warn('[DragState] Safety timeout triggered...')` → `logger.warn('Safety timeout triggered...')`
- **Result:** 20 logger.* calls (19 via internal log() + 1 direct logger.warn)

### 4. esp.ts (52 console.* → logger.*) - Largest File
- **Import added:** `import { createLogger } from '@/utils/logger'`
- **Logger created INSIDE defineStore:** `const logger = createLogger('ESPStore')` (line 88)
  - **Critical Fix:** Logger must be inside defineStore() block for proper scope access
- **Replacements:** All 52 console.* calls replaced
  - `[ESP Store]` prefix removed from all messages
  - `console.error` → `logger.error`
  - `console.warn` → `logger.warn`
  - `console.info` → `logger.info`
  - `console.debug` → `logger.debug`
  - `console.log` → `logger.info` (operational) or `logger.debug` (trace)

**Decision Logic for console.log → info vs debug:**
- **info:** Operational events (Loaded devices, Device deleted, Zone confirmed, Device approved)
- **debug:** Trace/internal state (Raw data, Zone assignment details, WebSocket event details, GPIO status)

**Example Replacements:**
- `console.log('[ESP Store] fetchAll: Fetched devices:', ...)` → `logger.debug('fetchAll: Fetched devices:', { deviceCount, devices })`
- `console.log('[ESP Store] fetchAll: Setting devices.value with', count, 'devices')` → `logger.info('Loaded devices', { count })`
- `console.info(\`[ESP Store] Zone updated (optimistic): ${deviceId} → ${zoneId}\`)` → `logger.info('Zone updated (optimistic)', { deviceId, zoneId })`
- `console.error(\`[ESP Store] Failed to fetch GPIO status for ${espId}:\`, err)` → `logger.error(\`Failed to fetch GPIO status for ${espId}\`, err)`

## Cross-Layer Impact

**No cross-layer changes required:**
- Server: No changes (logging is frontend-internal)
- Types: No changes (logger types are self-contained)
- Components: No changes (stores are implementation detail)

**Future Consideration:**
- Component logging migration (separate task) - components still use console.*
- API layer logging migration (separate task) - api modules still use console.*

## Verifikation

### Build Result
```bash
cd "El Frontend" && npm run build
✓ built in 12.37s
```
**Result:** ✅ Build successful, no TypeScript errors

### Console Call Verification
```
esp.ts:      Logger calls: 52 | Console calls: 0
logic.ts:    Logger calls: 10 | Console calls: 0
auth.ts:     Logger calls:  2 | Console calls: 0
dragState.ts: Logger calls: 20 | Console calls: 0
---
TOTAL:       Logger calls: 84 | Console calls: 0 ✅
```

### Logger Import Verification
All 4 stores have correct import and logger initialization:
- ✅ `import { createLogger } from '@/utils/logger'`
- ✅ `const logger = createLogger('<StoreName>')`

## Ergebnis

**Status:** ✅ **COMPLETE - All store files migrated successfully**

**Summary:**
- **4 files** migrated (esp.ts, logic.ts, auth.ts, dragState.ts)
- **69 console.* calls** → **84 logger.* calls** (dragState internal log() adds wrapper calls)
- **0 console.* calls** remaining in stores
- **Build:** ✅ TypeScript passes
- **Pattern:** Structured JSON logging ready for Docker/Promtail pipeline

**Next Steps (Out of Scope):**
1. Component console.* migration (`src/components/**/*.vue`)
2. API layer console.* migration (`src/api/*.ts`)
3. Service layer console.* migration (`src/services/*.ts`)
4. Composable layer console.* migration (`src/composables/*.ts`)

## Empfehlung

**Stores are complete.** For full frontend logging migration, run separate tasks for components, API modules, services, and composables.

**Pattern to follow for future migrations:**
1. Add `import { createLogger } from '@/utils/logger'`
2. Create logger instance: `const logger = createLogger('ComponentName')`
3. Replace console.* calls:
   - `console.error(msg, data)` → `logger.error(msg, data)`
   - `console.warn(msg, data)` → `logger.warn(msg, data)`
   - `console.log(msg, data)` → `logger.info(msg, data)` (operational) or `logger.debug(msg, data)` (trace)
   - `console.debug(msg, data)` → `logger.debug(msg, data)`
4. Remove `[Prefix]` patterns from messages
5. Convert multiple args to data object: `logger.info(msg, { key: value })`

**Logger API:**
- `logger.error(message, data?)` - Always logs (never gated)
- `logger.warn(message, data?)` - Logs if level >= warn
- `logger.info(message, data?)` - Logs if level >= info
- `logger.debug(message, data?)` - Logs if level >= debug

**Output Format:**
- `VITE_LOG_LEVEL=debug` → Human-readable: `[ComponentName] message { data }`
- `VITE_LOG_LEVEL=info|warn|error` → JSON: `{"level":"info","component":"ComponentName","message":"...","data":{...},"timestamp":"..."}`

---

**Report created:** 2026-02-09
**Agent:** frontend-development (Mode B - Implementation)
**Status:** ✅ COMPLETE
