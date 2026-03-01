# Bug Fix Verification Report

> **Erstellt:** 2026-03-01
> **Basis:** FULLSTACK_BUG_REPORT.md (16 Bugs)
> **Methode:** 3-Phasen-Ansatz: Verifikation → Pattern-Suche → Schrittweiser Fix

---

## Zusammenfassung

| Kategorie | Anzahl |
|-----------|--------|
| **FIXED** | 12 |
| **WIDERLEGT** | 2 |
| **BY-DESIGN** | 1 |
| **DEFERRED** | 1 |
| **GESAMT** | **16** |

---

## Bug-Status Übersicht

| Bug | Schwere | Titel | Status | Gruppe |
|-----|---------|-------|--------|--------|
| BUG-001 | KRITISCH | SlideOver z-index vs ConfirmDialog | WIDERLEGT | - |
| BUG-002 | KRITISCH | Farb-Legende Backdrop nach Escape | **FIXED** | A |
| BUG-003 | KRITISCH | Widget-Katalog funktionslos | **FIXED** | B |
| BUG-004 | HOCH | Monitor Durchschnittstemperatur falsch | **FIXED** | C |
| BUG-005 | HOCH | DS18B20 fehlende Einheit | **FIXED** | C |
| BUG-006 | HOCH | Chart Millisekunden-Timestamps | **FIXED** | C |
| BUG-007 | HOCH | Dashboard Delete ohne Confirm | **FIXED** | B |
| BUG-008 | HOCH | Aktor Einschalten Inkonsistenz | **FIXED** | D |
| BUG-009 | MITTEL | Doppelte Zeitbereich-Buttons | **FIXED** | C |
| BUG-010 | MITTEL | Real Button z-index | **FIXED** | A |
| BUG-011 | MITTEL | Offline-Filter Granularität | **FIXED** | E |
| BUG-012 | MITTEL | Cross-ESP Button ohne Effekt | **FIXED** | E |
| BUG-013 | MITTEL | System Monitor falsche Sensorwerte | **FIXED** | C |
| BUG-014 | NIEDRIG | Kein Delete in SlideOvers | BY-DESIGN | - |
| BUG-015 | NIEDRIG | Logic Rule verwaiste Device-Referenzen | **FIXED** | F |
| BUG-016 | NIEDRIG | Zone-Name Case-Inkonsistenz | **FIXED** | F |

---

## Detaillierte Fix-Dokumentation

### BUG-001: SlideOver z-index vs ConfirmDialog — WIDERLEGT

**Phase 1 Ergebnis:** Teleport-Architektur korrekt. Sowohl SlideOver als auch ConfirmDialog (via BaseModal) nutzen `<Teleport to="body">` mit `z-index: var(--z-modal)` = 50. DOM-Reihenfolge bestimmt Stacking: ConfirmDialog (über uiStore.confirm()) wird NACH dem SlideOver gerendert und liegt daher oben. Kein z-index-Konflikt.

**Kein Fix nötig.**

---

### BUG-002: Farb-Legende Backdrop nach Escape — FIXED

**Root Cause:** `ColorLegend.vue` hatte keinen Escape-Handler. Der Backdrop (`position: fixed; inset: 0`) blieb nach Escape aktiv und blockierte die gesamte Seite inkl. NOT-AUS.

**Fix:** `El Frontend/src/components/common/ColorLegend.vue`
- Import von `onMounted`, `onUnmounted` hinzugefügt
- Escape-Handler registriert: `document.addEventListener('keydown', handleEsc)` mit Cleanup in `onUnmounted`
- `handleEsc` prüft `e.key === 'Escape' && isOpen.value`, ruft `close()` auf und stoppt Propagation

---

### BUG-003: Widget-Katalog funktionslos — FIXED

**Root Cause:** `addWidget()` in `CustomDashboardView.vue` hat `if (!grid) return` — silent fail wenn kein Dashboard/Layout aktiv ist. Katalog war immer sichtbar, auch ohne aktives Layout.

**Fix:** `El Frontend/src/views/CustomDashboardView.vue`
- `addWidget()`: Toast-Warning statt silent return: `toast.warning('Erstelle zuerst ein Dashboard')`
- Template: Hinweistext über Katalog-Buttons wenn kein Layout aktiv
- Katalog-Buttons: `:disabled="!dashStore.activeLayoutId"` (visuell ausgegraut)

---

### BUG-004: Monitor Durchschnittstemperatur falsch — FIXED

**Root Cause:** `aggregateZoneSensors()` in `sensorDefaults.ts` akzeptierte `raw_value = 0` als gültigen Temperaturwert (0°C ist technisch im DS18B20-Range). Sensoren ohne Live-Daten hatten `raw_value = 0` als DB-Initialwert.

**Fix:** `El Frontend/src/utils/sensorDefaults.ts`
- In `aggregateZoneSensors()`: Filtere Werte mit `value === 0 && quality === 'unknown'` raus (DB-Initialwert ohne Live-Daten)
- Echte 0°C-Messungen haben `quality === 'normal'` und werden weiterhin berücksichtigt

---

### BUG-005: DS18B20 fehlende Einheit — FIXED

**Root Cause:** `SensorCardWidget.vue` und `MonitorView.vue` lasen `sensor.unit` direkt statt `getSensorUnit(sensor.sensor_type)` aus `SENSOR_TYPE_CONFIG`. Server befüllt `unit`-Feld nicht für alle Sensoren.

**Fix:**
- `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue`: `getSensorUnit()` importiert und als Fallback genutzt
- `El Frontend/src/views/MonitorView.vue`: 4 Stellen aktualisiert mit `getSensorUnit()` Fallback

---

### BUG-006: Chart Millisekunden-Timestamps — FIXED

**Root Cause:** `LiveLineChart.vue` hatte keine `time.displayFormats` in der X-Scale. Chart.js wählte automatisch `millisecond` Format (`H:mm:ss.SSS a`) bei eng beieinanderliegenden Datenpunkten.

**Fix:** `El Frontend/src/components/charts/LiveLineChart.vue`
- `time.displayFormats` Block eingefügt: `{ millisecond: 'HH:mm:ss', second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' }`

---

### BUG-007: Dashboard Delete ohne Confirm — FIXED

**Root Cause:** `handleDeleteLayout()` in `CustomDashboardView.vue` löschte sofort ohne Bestätigung.

**Fix:** `El Frontend/src/views/CustomDashboardView.vue`
- `handleDeleteLayout()` zu `async` gemacht
- `uiStore.confirm()` mit `variant: 'danger'` vorgeschaltet (Pattern von LogicView.vue)
- `useUiStore` importiert

---

### BUG-008: Aktor Einschalten Inkonsistenz — FIXED

**Root Cause:** `ActuatorConfigPanel.vue` hatte keinen `emergency_stopped`-Check auf dem Toggle-Button. Nur `commandLoading` wurde geprüft.

**Fix:** `El Frontend/src/components/esp/ActuatorConfigPanel.vue`
- `isEmergencyStopped` Computed hinzugefügt
- Toggle-Button: `:disabled="commandLoading || isEmergencyStopped"`
- Button-Text: "Not-Stopp aktiv" statt "Einschalten" wenn gesperrt
- PWM-Slider: `:disabled="isEmergencyStopped"`
- Safety-Accordion: Visueller Hinweis "Not-Stopp aktiv — Steuerung gesperrt"

---

### BUG-009: Doppelte Zeitbereich-Buttons — FIXED

**Root Cause:** Inline Zeitbereich-Buttons (Level 2) und `<TimeRangeSelector>` im SlideOver (Level 3) waren gleichzeitig sichtbar.

**Fix:** `El Frontend/src/views/MonitorView.vue`
- `v-if="!showSensorDetail"` auf den inline Button-Container gesetzt — Buttons verschwinden wenn SlideOver offen ist

---

### BUG-010: Real Button z-index — FIXED

**Root Cause:** Lucide SVG Icons in TopBar-Buttons hatten keine `pointer-events: none` und konnten Klicks auf benachbarte Buttons interceptieren.

**Fix:** `El Frontend/src/shared/design/layout/TopBar.vue`
- CSS-Regel: `.header__type-btn svg, .header__action-btn svg { pointer-events: none; }`

---

### BUG-011: Offline-Filter Granularität — FIXED

**Root Cause:** Die `unassignedDevices` Computed in `HardwareView.vue` las direkt aus `espStore.unassignedDevices` ohne Filter-Logik. Die "Nicht zugewiesen"-Sektion zeigte immer ALLE unzugewiesenen Devices.

**Fix:** `El Frontend/src/views/HardwareView.vue`
- `unassignedDevices` Computed filtert jetzt über `filteredEsps.value.filter(d => !d.zone_id)` wenn Filter aktiv sind
- Fallback auf `espStore.unassignedDevices` wenn keine Filter aktiv

---

### BUG-012: Cross-ESP Button ohne Effekt — FIXED

**Root Cause:** `showCrossEspConnections` State existierte, aber kein Panel/Content war daran gebunden. Button-Toggle war irreführend.

**Fix:** `El Frontend/src/views/HardwareView.vue`
- Toggle-State `showCrossEspConnections` entfernt
- Button zeigt jetzt Info-Toast: "Cross-ESP Visualisierung wird entwickelt"
- Active-Class-Binding entfernt
- Tooltip-Text hinzugefügt

---

### BUG-013: System Monitor falsche Sensorwerte — FIXED

**Root Cause:** `eventTransformer.ts` las `data.value`, aber Server sendet `processed_value`/`raw_value`. Fallback war `0` statt `null`.

**Fix:** `El Frontend/src/utils/eventTransformer.ts`
- Mehrstufige Feldprüfung: `data.processed_value → data.raw_value → data.value`
- Fallback von `0` auf `null` geändert
- Summary zeigt `-` statt `0.0` wenn kein Wert verfügbar

---

### BUG-014: Kein Delete in SlideOvers — BY-DESIGN

**Ergebnis:** Architektur-Entscheidung. Sensor/Aktor-Konfiguration erfolgt in SlideOvers, Geräte-Verwaltung (inkl. Delete) über dedizierte Verwaltungs-UI. Kein Bug, ggf. Feature-Request.

---

### BUG-015: Logic Rule verwaiste Device-Referenzen — FIXED

**Fix:** Deaktivierte Rule "Test Temperatur Rule" aus `cross_esp_logic` gelöscht (referenzierte MOCK_TEMP01 und MOCK_RELAY01, die nicht existieren).

---

### BUG-016: Zone-Name Case-Inkonsistenz — FIXED

**Fix:** `zone_name` für `MOCK_98D427EA` von `testneu` auf `Testneu` normalisiert. Beide Devices in Zone `testneu` haben jetzt konsistent `zone_name = 'Testneu'`.

---

## Geänderte Dateien

| Datei | Bugs |
|-------|------|
| `El Frontend/src/components/common/ColorLegend.vue` | BUG-002 |
| `El Frontend/src/shared/design/layout/TopBar.vue` | BUG-010 |
| `El Frontend/src/views/CustomDashboardView.vue` | BUG-003, BUG-007 |
| `El Frontend/src/utils/sensorDefaults.ts` | BUG-004 |
| `El Frontend/src/components/dashboard-widgets/SensorCardWidget.vue` | BUG-005 |
| `El Frontend/src/views/MonitorView.vue` | BUG-005, BUG-009 |
| `El Frontend/src/components/charts/LiveLineChart.vue` | BUG-006 |
| `El Frontend/src/components/esp/ActuatorConfigPanel.vue` | BUG-008 |
| `El Frontend/src/views/HardwareView.vue` | BUG-011, BUG-012 |
| `El Frontend/src/utils/eventTransformer.ts` | BUG-013 |
| PostgreSQL: `cross_esp_logic` | BUG-015 |
| PostgreSQL: `esp_devices` | BUG-016 |

## Build-Status

- `npx vite build`: Erfolgreich
- Pre-existing TypeScript-Fehler in `RuleFlowEditor.vue` und `SensorHistoryView.vue` unverändert (nicht Teil dieses Auftrags)

## Offene Punkte

1. **BUG-012 Cross-ESP Visualisierung**: Feature noch nicht implementiert, Button zeigt jetzt Info-Toast. Full-Feature ist separater Entwicklungs-Auftrag.
2. **Playwright-Walkthrough**: Nicht durchgeführt (Docker-Stack müsste laufen). Empfehlung: Manueller Walkthrough nach Docker-Rebuild.
