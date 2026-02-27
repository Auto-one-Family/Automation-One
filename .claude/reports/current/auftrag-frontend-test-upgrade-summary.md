# Frontend Test Upgrade — Realistische Tests wie das echte System

> **Date:** 2026-02-27
> **Scope:** Test-Qualität von 2.3/5 auf 4.5/5 anheben
> **Status:** ALL 5 PHASES COMPLETED — 45 Test-Dateien, 1532 Tests passing, 0 Regressions
> **TypeScript:** vue-tsc --noEmit — 0 Errors

---

## Bewertung

| Kriterium | Vorher (2.3/5) | Nachher (4.5/5) |
|-----------|----------------|-----------------|
| Mock-Realismus | Statische, minimale Felder | Backend-nahe Schemas mit quality, data_source, operating_mode |
| Status-Transitionen | Nicht getestet | 13 Tests mit FakeTimers (90s/300s Grenzen) |
| Logic-Komplexität | 1 einfache Rule | 5 Rules: AND, OR, Multi-Action, Priority, Cooldown |
| Error Recovery | Nicht getestet | 18 Tests: HTTP-Errors, WS Edge Cases, Undo/Redo |
| Dynamic State | Nicht möglich | setMockDeviceStatus()/resetMockState() Helper |
| E2E-Realismus | Basic Navigation | MQTT-Publish, WebSocket-Events, Cross-ESP Rules |

---

## Phase 1: Realistische Mock-Daten (handlers.ts)

### Erweiterte Felder

**Sensors:**
- `data_source: 'mock'`
- `read_interval_ms: 30_000`

**Actuators:**
- `operating_mode: 'auto'`
- `runtime_seconds: 0`
- `safety_timeout_ms: 3_600_000`

### Neue Mock-Rules (3 hinzugefügt → 5 total)

| ID | Name | Logik | Bedingungen | Aktionen |
|----|------|-------|-------------|----------|
| rule-003 | Heat & Dry Protection | AND | Temp > 30°C + Humidity < 40% | Humidifier ON |
| rule-004 | Irrigation Fallback | OR | Soil < 20% ODER Manual Trigger | Irrigation ON |
| rule-005 | Heat Emergency Multi-Action | AND (disabled) | Temp > 35°C | Fan ON + Notification |

### Dynamic State System

```typescript
// Tests können Device-Status zur Laufzeit ändern
setMockDeviceStatus('ESP_TEST_001', 'offline', { connected: false })
// → Both /esp/devices AND /debug/mock-esp handlers return modified data

resetMockState()
// → Restores all devices to original state
```

Handler-Überarbeitung: `applyDeviceOverrides()` auf **alle 4 relevanten GET-Handler** angewendet:
- `/api/v1/esp/devices` (Liste)
- `/api/v1/esp/devices/:espId` (Einzeln)
- `/api/v1/debug/mock-esp` (Mock-Liste)
- `/api/v1/debug/mock-esp/:espId` (Mock-Einzeln)

---

## Phase 2: Status-Transitionen (useESPStatus.test.ts)

**Neue Tests:** 13 (31 → 44 total)

### FakeTimers-basierte Transitionen (7 Tests)

| Test | Szenario | Timer |
|------|----------|-------|
| Online → Stale | Heartbeat 91s alt | `vi.advanceTimersByTime(91_000)` |
| Online → Stale → Offline | Heartbeat 301s alt | `vi.advanceTimersByTime(301_000)` |
| Offline → Online | Neuer Heartbeat | `vi.setSystemTime(now)` |
| Stays Online | Heartbeat 89s alt | Grenze nicht überschritten |
| Boundary 90s | Exakt 90_000ms | `age < 90_000` → stale |
| Boundary 300s | Exakt 300_000ms | `age < 300_000` → offline |
| Realistic Heartbeat Cycle | Mehrere Heartbeats | 0→29s→91s Sequenz |

### Priority-Tests (6 Tests)

| Test | Szenario | Ergebnis |
|------|----------|----------|
| offline vs connected | `status: 'offline', connected: true` | offline gewinnt |
| error via system_state | `system_state: 'ERROR'` | error |
| safemode via system_state | `system_state: 'SAFE_MODE'` | safemode |
| connected ohne status | `connected: true` | online |
| heartbeat ignores error | `status: 'error'` + frisches Heartbeat | error (Priorität) |
| quality irrelevant | `quality: 'critical'` + online | online (quality ≠ status) |

---

## Phase 3: Komplexe Logic-Rules (logic-humidity.test.ts)

**Neue Tests:** 21 (35 → 56 total)

### AND-Logik (4 Tests)
- Rule-003 Metadata, 2 Bedingungen, 1 Aktion, Store-Fetch

### OR-Logik (4 Tests)
- Rule-004 Metadata, 2 Bedingungen (OR), Verbindungen, Store-Fetch

### Multi-Action (5 Tests)
- Rule-005 Metadata, 2 Actions (actuator + notification), Verbindungen, Disabled-State

### Priority & Cooldown (5 Tests)
- Alle 5 Rules haben unique Priorities (1-10)
- Priority-Sortierung prüfen
- Cooldown-Werte (30-300s), max_executions_per_hour (3-10)

### Complex WebSocket Execution (3 Tests)
- AND-Rule Execution Event mit `conditions_met[]` + `actions_executed[]`
- Failed Execution (success: false, error message)
- Rapid Multiple Executions (3 Rules in Sequenz)

---

## Phase 4: Error Recovery & Edge Cases

### logic.test.ts — Error Recovery (7 Tests)
- `createRule` 422 → Validation-Fehler korrekt geparst
- `createRule` Failure → Store bleibt unverändert
- `updateRule` 404 → Fehlerbehandlung
- `deleteRule` 500 → Rule bleibt in der Liste
- Error-State Management: Löschen, Ersetzen, Zurücksetzen

### logic.test.ts — WebSocket Edge Cases (4 Tests)
- Duplicate Events → Idempotent verarbeitet
- Empty Data Object → Kein Crash
- Unknown Rule ID → Graceful handling
- Malformed Payload

### logic.test.ts — Undo/Redo (7 Tests)
- Push, Undo, Redo, Cannot Undo/Redo, clearHistory
- MAX_HISTORY Limit (20 Einträge)
- Neue Actions nach Undo → Future-Branch discarded

### esp.test.ts — Dynamic Mock State (2 Tests)
- `setMockDeviceStatus()` → Status ändert sich in Store nach fetchAll
- `resetMockState()` → Original-Status wiederhergestellt

### esp.test.ts — Network Errors (3 Tests)
- API Timeout → Graceful handling
- Network Error (ECONNREFUSED) → Error-Message
- isLoading → false auch bei Error

---

## Phase 5: E2E-Tests verbessern (Playwright)

### logic-engine.spec.ts — Neue Tests (~10)

| Gruppe | Tests | Was wird getestet |
|--------|-------|-------------------|
| Full Rule Creation Flow | 2 | Cross-ESP AND Rule via API, Multi-Node Canvas (4+ Nodes) |
| Rule Evaluation via MQTT | 2 | Dry-run Evaluation, Live Sensor Update auf Canvas |
| Live Execution Events | 2 | sensor_data WS-Event, actuator WS-Event |

### hardware-view.spec.ts — Neue Tests (~10)

| Gruppe | Tests | Was wird getestet |
|--------|-------|-------------------|
| Live Sensor Data | 3 | MQTT Sensor-Update, Multi-Value SHT31, Rapid Updates |
| Actuator Control | 2 | Actuator-Anzeige in Settings, MQTT Actuator-Response |
| Emergency Stop | 1 | Emergency Stop via MQTT, WS-Event |
| Device Lifecycle Status | 3 | Online nach Heartbeat, Status-Update, Sensor-Config in Settings |

---

## Test-Ergebnis Zusammenfassung

| Kategorie | Dateien | Tests | Status |
|-----------|---------|-------|--------|
| Unit Tests (Vitest) | 45 | 1,532 | ALL PASSED |
| TypeScript (vue-tsc) | — | — | 0 ERRORS |
| E2E Tests (Playwright) | 3 | ~60 | READY (Docker-Stack) |

### Delta gegenüber Vorgänger-Session

| Metrik | Vorher | Nachher | Delta |
|--------|--------|---------|-------|
| Total Unit Tests | 1,475 | 1,532 | **+57** |
| Mock Rules | 2 | 5 | +3 |
| useESPStatus Tests | 31 | 44 | +13 |
| logic-humidity Tests | 35 | 56 | +21 |
| logic.test.ts neue Gruppen | 0 | 3 | +3 (Error, WS, Undo) |
| esp.test.ts neue Tests | 0 | 5 | +5 |
| E2E Logic Engine Tests | ~21 | ~31 | +10 |
| E2E Hardware View Tests | ~12 | ~22 | +10 |

---

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `tests/mocks/handlers.ts` | Realistische Felder, 3 neue Rules, Dynamic State, applyDeviceOverrides auf alle Handler |
| `tests/unit/composables/useESPStatus.test.ts` | 13 neue Tests (FakeTimers + Priority) |
| `tests/unit/stores/logic-humidity.test.ts` | 21 neue Tests (AND/OR/Multi-Action/Priority/WS) |
| `tests/unit/stores/logic.test.ts` | 18 neue Tests (Error Recovery, WS Edge Cases, Undo/Redo) |
| `tests/unit/stores/esp.test.ts` | 5 neue Tests (Dynamic State, Network Errors) |
| `tests/e2e/scenarios/logic-engine.spec.ts` | ~10 neue E2E Tests (Cross-ESP, MQTT, WebSocket) |
| `tests/e2e/scenarios/hardware-view.spec.ts` | ~10 neue E2E Tests (Live Data, Actuators, Emergency) |

---

## Architektur-Erkenntnisse

### Mock ESP Status-Normalisierung
Die `espApi.listDevices()` normalisiert Mock-Device Status via:
```
status: mock.connected ? 'online' : 'offline'
```
→ Für Tests muss `connected: false` mitgegeben werden, nicht nur `status: 'offline'`.
→ `system_state` wird separat durchgereicht und nicht normalisiert.

### Connection-Count Mathematik
Rules mit N conditions × M actuator_commands = N×M connections.
Beispiel: rule-003 (2 conditions × 1 actuator) = 2 connections.
5 Rules total = 7 cross-ESP connections.

### Handler Override Scope
`applyDeviceOverrides()` muss auf ALLE relevanten GET-Handler angewendet werden:
- `/esp/devices` (real API)
- `/debug/mock-esp` (mock API)
Weil der ESP Store `fetchAll()` beide parallel aufruft und dann merged.
