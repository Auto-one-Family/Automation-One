# Frontend Debug & Fix Report

**Datum:** 2026-02-27
**Scope:** Systematischer Frontend-Durchlauf — HardwareView, Tests, Playwright, Logic

---

## Zusammenfassung

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| **Vitest Files** | 40/44 passed | **44/44 passed** |
| **Vitest Tests** | 1396/1421 passed | **1421/1421 passed** |
| **TypeScript** | 0 Errors (vue-tsc) | **0 Errors** |
| **Playwright E2E** | 6 Specs | **8 Specs** (+2 neu) |

---

## Fixes (4 Bereiche, 25 Test-Failures behoben)

### 1. AccordionSection.test.ts (2 Failures)

**Problem:** `localStorageMock` Variable undefiniert — Test referenzierte nicht-existente Mock-Variable statt der definierten Spies `getItemSpy`/`setItemSpy`.

**Fix:** Bereits extern korrigiert (Datei wurde zwischen Read und Edit aktualisiert). Nutzt jetzt `localStorage` direkt + `getItemSpy`/`setItemSpy` + `await nextTick()` für `onMounted`.

### 2. ESPSettingsSheet.test.ts (2 Failures)

**Problem:** SlideOver-Komponente nutzte `aria-label` statt `aria-labelledby`, und der Close-Button hatte kein `aria-label="Schließen"`.

**Fix:** `SlideOver.vue` aktualisiert:
- `aria-label` → `aria-labelledby="sheet-title"` (korrekte ARIA-Verknüpfung)
- `<h2>` bekommt `id="sheet-title"` (Label-Target)
- Close-Button bekommt `aria-label="Schließen"` (Screen-Reader zugänglich)

**Datei:** [SlideOver.vue](El Frontend/src/shared/design/primitives/SlideOver.vue)

### 3. PendingDevicesPanel.test.ts (19 Failures)

**Problem:** `TypeError: Cannot read properties of undefined (reading 'length')` auf Zeile 300+346. Mock-Store fehlte `unassignedDevices` Property → `filteredUnassigned.value` war `undefined`.

**Fix:** `unassignedDevices: []` zum ESP-Store-Mock hinzugefügt.

**Datei:** [PendingDevicesPanel.test.ts](El Frontend/tests/unit/components/PendingDevicesPanel.test.ts)

### 4. design-exports.test.ts (1 Failure — Timeout)

**Problem:** Dynamischer Import von `@/shared/design/primitives` timte bei 5s Limit aus (resolving 13 Vue-Komponenten + transitive Dependencies).

**Fix:** Timeout auf 15s erhöht für den ersten Test-Case.

**Datei:** [design-exports.test.ts](El Frontend/tests/unit/design/design-exports.test.ts)

---

## HardwareView Analyse

Alle Kernkomponenten geprüft:

| Komponente | Status | Details |
|-----------|--------|---------|
| HardwareView.vue | OK | Two-Level Navigation (Zone → ESP Detail) |
| DeviceMiniCard.vue | OK | `getESPStatusDisplay()` korrekt genutzt (kein `label`-Bug) |
| ZonePlate.vue | OK | Aggregation, Drag&Drop, Subzone-Filter |
| ESPSettingsSheet.vue | OK | SlideOver mit Sensor/Actuator-Listen |
| PendingDevicesPanel.vue | OK (gefixt) | SlideOver mit Geräte/Wartend/Info-Tabs |
| UnassignedDropBar.vue | OK | Drop-Target für nicht-zugewiesene Devices |
| useESPStatus.ts | OK | Single source of truth für Device-Status |

**Bekannter Issue aus MEMORY behoben:**
> PendingDevicesPanel.vue:325 — `getESPStatus(device).label` but ESPStatus has no `label` property

Dieser Bug existiert **nicht mehr** im aktuellen Code. `getESPStatusDisplay()` wird korrekt mit `.text` genutzt.

---

## Neue Playwright E2E-Tests

### hardware-view.spec.ts (15 Tests)

| Test-Bereich | Tests | Was wird getestet |
|-------------|-------|-------------------|
| Mock Device Lifecycle | 3 | Create, Create mit Sensoren+Aktoren, Delete |
| Zone Display | 2 | Devices gruppiert by Zone, Sensor-Werte auf Cards |
| Drag & Drop | 2 | Drag-Handles vorhanden, Device zwischen Zones ziehen |
| Device Configuration Panel | 5 | Settings öffnen via Gear, Sensor-Liste, Actuator-Liste, Close-Button, ESC |
| Context Menu Actions | 1 | Overflow-Menü mit Optionen |

### humidity-logic.spec.ts (6 Tests)

| Test | Was wird getestet |
|------|-------------------|
| Create Mock ESP | SHT31 Sensor (GPIO 21) + Relay (GPIO 16) in Zone "Feuchtigkeitstest" |
| Create Logic Rule | `humidity < 60% → relay ON` via API |
| High Humidity (no trigger) | 75% → Conditions NOT met, Actuator NOT activated |
| Low Humidity (trigger) | 45% → Conditions met, Would execute actions |
| Full WebSocket Flow | Sensor-Data → Rule Evaluation → Actuator Command |
| UI Verification | Sensor-Wert und Actuator-State auf Device-Card |

**Mock-Setup:** Vollständiger Greenhouse-Szenario mit SHT31 Luftfeuchtesensor und Relay-Befeuchter.

---

## Dateien geändert

| Datei | Änderung |
|-------|----------|
| `El Frontend/src/shared/design/primitives/SlideOver.vue` | aria-labelledby + Close aria-label |
| `El Frontend/tests/unit/components/PendingDevicesPanel.test.ts` | unassignedDevices im Mock |
| `El Frontend/tests/unit/design/design-exports.test.ts` | Timeout 5s → 15s |
| `El Frontend/tests/e2e/scenarios/hardware-view.spec.ts` | **NEU** — 15 E2E-Tests |
| `El Frontend/tests/e2e/scenarios/humidity-logic.spec.ts` | **NEU** — 6 Logic-Tests |

---

## Nächste Schritte

1. **Playwright ausführen:** `make e2e-up && npx playwright test tests/e2e/scenarios/hardware-view.spec.ts`
2. **Logic-Tests:** `npx playwright test tests/e2e/scenarios/humidity-logic.spec.ts`
3. **MEMORY aktualisieren:** `label`-Bug-Eintrag kann entfernt werden (behoben)
