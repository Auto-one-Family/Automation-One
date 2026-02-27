# Chaos Engineering Mock-Volltest — Testlauf 001 (Frontend-Fokus) — 2026-02-27

## Datum: 2026-02-27
## Dauer: ~2 Stunden
## Blocks bearbeitet: D (Frontend Komplett-Test), G (UX-Qualitaets-Audit)
## Fixes committed: 4 Commits auf cursor/chaos-engineering-mock-volltest-1407

---

## Block-Status

| Block | Status | Kritische Funde | Commits |
|-------|--------|----------------|---------|
| D — Frontend Komplett-Test | BESTANDEN | 1 Runtime-Bug (ZonePlate TDZ), 1 TS-Error, 22 stale Tests | 3 Commits |
| G — UX-Qualitaets-Audit | BESTANDEN | 2 Memory Leaks, fehlende aria-labels, hardcoded hex colors | 2 Commits |

---

## Fix-Log

| Nr | Wo | Problem | Fix | Commit | Aufwand |
|----|-----|---------|-----|--------|---------|
| F-001 | ZonePlate.vue:64 | `activeSubzoneFilter` referenced before declaration (TDZ) — runtime crash in test + potential production crash | Moved `localDevices` + `watch()` after `activeSubzoneFilter` declaration (line 119→148) | 12a92f7 | 10 Min |
| F-002 | sensorDefaults.test.ts | 6 tests expected old v9.3 labels ("Temperatur (DS18B20)") but code uses v9.4 shortened labels ("Temperatur") | Updated test expectations to match current code | 12a92f7 | 5 Min |
| F-003 | esp.test.ts | 2 tests didn't set `connected: false` for offline devices → `getESPStatus()` returned 'online' due to spread from `mockESPDevice` | Added explicit `connected: false` to offline device test data | 12a92f7 | 5 Min |
| F-004 | dashboard.test.ts | Test pushed to `espStore.pendingDevices` but `dashboardStore.pendingCount` is standalone ref(0) | Fixed test to set `store.pendingCount = 1` directly | 12a92f7 | 3 Min |
| F-005 | AddSensorModal/AddActuatorModal tests | `.modal-close` selector doesn't exist — BaseModal uses `.modal-close-btn` | Updated selector in both test files | 12a92f7 | 3 Min |
| F-006 | ZonePlate.test.ts | Missing `useUiStore` mock + empty zone test expected "0/0 Online" but component shows "- Leer" | Added mock + updated assertion | 12a92f7 | 5 Min |
| F-007 | PendingDevicesPanel.vue:325 | `getESPStatus(device).label` — ESPStatus is string union, not object; TS2339 error | Changed to `getESPStatusDisplay(getESPStatus(device)).text` | 9680344 | 3 Min |
| F-008 | ComponentCard.test.ts | 3 tests expected English labels (ON/OFF/E-STOP) but component uses German (Ein/Aus/Not-Stopp) | Updated test expectations to German labels | 2b6f821 | 3 Min |
| F-009 | SystemMonitorView.vue | 4 hardcoded hex colors (#22c55e, #f87171, #60a5fa, #f093fb) instead of CSS variables | Replaced with var(--color-success/error/info/iridescent) | 2b6f821 | 5 Min |
| F-010 | EmergencyStopButton.vue | Missing aria-label, role="dialog", aria-modal on safety-critical element | Added WCAG accessibility attributes | 38c1aff | 5 Min |
| F-011 | LogManagementPanel.vue | Window `keydown` event listener not removed on unmount (memory leak) | Added `onUnmounted` with `removeEventListener` | 38c1aff | 3 Min |
| F-012 | DeviceSummaryCard.vue | `setTimeout` timer for flash animation not cleared on unmount (memory leak) | Track timer reference + clear in `onUnmounted` | 38c1aff | 5 Min |
| F-013 | sensors.py (Backend) | Unused `timezone` import flagged by ruff | Removed unused import | c94024d | 1 Min |
| F-014 | request_id.py (Backend) | Unused `get_request_id` import flagged by ruff | Removed unused import | c94024d | 1 Min |

---

## Block D: Frontend Komplett-Test — Ergebnisse

### D1: Route-Inventar (15 Views + Redirects)

| Route | View | HTTP | Status |
|-------|------|------|--------|
| `/hardware` | HardwareView | 200 | OK — Zone Accordion, Unassigned bar mit MOCK devices |
| `/hardware/:zoneId` | HardwareView | 200 | OK — Zone-Filter |
| `/hardware/:zoneId/:espId` | HardwareView | 200 | OK — ESP Detail |
| `/monitor` | MonitorView | 200 | OK — Sensor & Aktor Monitoring |
| `/custom-dashboard` | CustomDashboardView | 200 | OK — Dashboard Builder mit Widget-Katalog |
| `/sensors` | SensorsView | 200 | OK — Sensor-Tabelle mit Tabs |
| `/logic` | LogicView | 200 | OK — Rule Builder (vue-flow) |
| `/settings` | SettingsView | 200 | OK — User Account, Server Connection, About |
| `/system-monitor` | SystemMonitorView | 200 | OK — 6 Tabs (Live, Events, Logs, DB, MQTT, Health) |
| `/users` | UserManagementView | 200 | OK — User-Tabelle |
| `/calibration` | CalibrationView | 200 | OK — Kalibrierungs-Wizard |
| `/sensor-history` | SensorHistoryView | 200 | OK — Chart mit Zeitreihen |
| `/system-config` | SystemConfigView | 200 | OK — Config-Editor |
| `/maintenance` | MaintenanceView | 200 | OK — Service Status + Cleanup Jobs |
| `/load-test` | LoadTestView | 200 | OK — Mock-ESP Bulk-Generator |
| `/login` | LoginView | 200 | OK — Redirect zu /hardware wenn eingeloggt |
| `/setup` | SetupView | 200 | OK — Redirect zu /hardware wenn eingeloggt |

### D7: Deprecated Redirects

| Redirect | Ziel | Status |
|----------|------|--------|
| `/devices` | `/hardware` | OK |
| `/mock-esp` | `/hardware` | OK |
| `/database` | `/system-monitor?tab=database` | OK |
| `/logs` | `/system-monitor?tab=logs` | OK |
| `/actuators` | `/sensors?tab=actuators` | OK |
| `/audit` | `/system-monitor?tab=events` | OK |
| `/mqtt-log` | `/system-monitor?tab=mqtt` | OK |
| `/dashboard-legacy` | `/hardware` | OK |

### D8: API Response Times

| Endpoint | Response Time | Status |
|----------|--------------|--------|
| `/health` | 1ms | Excellent |
| `/api/v1/esp/devices` | 10ms | Excellent |
| `/api/v1/sensors/data?limit=10` | 8ms | Excellent |
| `/api/v1/logic/rules` | 5ms | Excellent |

### D9: Error Handling

| Test | Expected | Actual | Status |
|------|----------|--------|--------|
| No auth token | 401 | 401 | OK |
| Wrong password | 401 | 401 | OK |
| Non-existent device | 404 | 404 | OK |

### D: Manual GUI Test (computerUse)

- Emergency Stop (NOT-AUS) visible across all views, confirmation dialog works
- Zone creation via "Zone erstellen" dialog works
- Drag-and-drop of MOCK devices provides visual feedback
- Navigation: Sidebar navigation between all views works
- Auth guard: /login redirects to /hardware when authenticated
- No JS errors, no broken layouts, no stuck spinners

---

## Block G: UX-Qualitaets-Audit — Ergebnisse

### G1: 5-Sekunden-Test
- Dashboard zeigt Status in < 5s
- MOCK_CHAOS01 sichtbar im Unassigned bar
- NOT-AUS button prominent sichtbar

### G2: Konsistenz

| Metrik | Wert | Bewertung |
|--------|------|-----------|
| Hardcoded hex colors in .vue files | ~50 (meistens CSS var fallbacks) | Akzeptabel, 4 fixiert |
| console.log in production code | 0 (alle in logger.ts oder JSDoc) | Excellent |
| aria-label Referenzen | 26 | Grundlegend vorhanden, EmergencyStop fixiert |
| `: any` type assertions | 46 | Akzeptabel fuer Projekt-Stand |
| Responsive (@media + Tailwind breakpoints) | Views haben @media und/oder Tailwind responsive classes | OK |

### G3: Memory Leaks

| Komponente | Problem | Severity | Fix |
|------------|---------|----------|-----|
| LogManagementPanel.vue | Window keydown listener nicht entfernt | MEDIUM | Fixiert (F-011) |
| DeviceSummaryCard.vue | setTimeout timer nicht gecleaned | LOW | Fixiert (F-012) |
| 25+ Komponenten | `watch()` ohne explizites Stop | LOW | Vue cleaned auto bei Unmount |

### G4: Accessibility

| Check | Status |
|-------|--------|
| EmergencyStopButton aria-label | Fixiert (F-010) |
| EmergencyStop Dialog role="dialog" | Fixiert (F-010) |
| BaseModal aria-label="Schliessen" | Vorhanden |
| Button icons mit title | Meistens vorhanden |

---

## Automatisierte Tests

| Suite | Ergebnis | Details |
|-------|----------|---------|
| Vitest (Unit) | 1354/1354 BESTANDEN | 42 Dateien, 0 Failures (vorher: 22 Failures) |
| vue-tsc (TypeScript) | 0 Errors | (vorher: 1 Error in PendingDevicesPanel) |
| vite build (Production) | Erfolgreich | 8.0s Build-Zeit |
| ruff check (Backend Lint) | Alle bestanden | (vorher: 2 Errors) |

---

## Bekannte offene Punkte (NICHT in diesem Testlauf gefixt)

1. **DnD Sensor/Aktor Drop**: 2 bekannte Bugs → eigener Auftrag `auftrag-dnd-sensor-aktor-drop-fix.md`
2. **Dashboard-Persistenz-Endpoint**: POST /api/v1/dashboards fehlt noch
3. **Hardcoded Hex Colors**: ~46 verbleibende Stellen (v.a. Chart.js configs, CSS fallbacks)
4. **27 Komponenten ohne explizites onUnmounted**: Meistens unkritisch (Vue cleaned watchers auto), 2 kritische fixiert

---

## Naechste Session

- Block E: Datenbank-Konsistenz (19 Tabellen, FK-Checks, Stale-Daten)
- Block F: Chaos-Szenarien (MQTT-Pause, Invalid Payloads, Burst-Test)
- Block H: Monitoring-Integration (Grafana, Alerts)
- Tieferes Frontend-Testing: WebSocket live events, Real-time sensor updates
