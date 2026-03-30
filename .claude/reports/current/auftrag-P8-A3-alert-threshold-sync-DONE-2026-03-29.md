# Auftrag P8-A3 — Alert-Config Threshold Sync — DONE

**Datum:** 2026-03-29
**Agent:** frontend-dev
**Status:** FERTIG
**Build:** OK (vue-tsc + vite build)

---

## Änderungen

### 1. DashboardWidget.config Interface erweitert
**Datei:** `El Frontend/src/shared/stores/dashboard.store.ts:69-77`

Neue typisierte Felder:
- `warnLow?: number` — maps to `custom_thresholds.warning_min`
- `warnHigh?: number` — maps to `custom_thresholds.warning_max`
- `alarmLow?: number` — maps to `custom_thresholds.critical_min`
- `alarmHigh?: number` — maps to `custom_thresholds.critical_max`

### 2. SensorOption.configId hinzugefügt
**Datei:** `El Frontend/src/composables/useSensorOptions.ts:17`

`SensorOption` Interface um `configId?: string` erweitert. Wird beim Aufbau der Options aus `MockSensor.config_id` gemappt (Zeile 97).

### 3. "Schwellen aus Sensor-Config laden" Button
**Datei:** `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue`

- Neuer Button in Zone 2 (Darstellung), direkt über den Threshold-Input-Feldern
- Nur sichtbar wenn `showThresholds` aktiv UND ein Sensor ausgewählt ist
- Lookup-Pfad: `sensorId` → `useSensorOptions.configId` → `sensorsApi.getAlertConfig(configId)`
- Response-Pfad: `response.alert_config.custom_thresholds` (nested!)
- Mapping: `warning_min→warnLow`, `warning_max→warnHigh`, `critical_min→alarmLow`, `critical_max→alarmHigh`
- `showThresholds` wird automatisch auf `true` gesetzt
- Inline-Feedback "Schwellen geladen" / Fehlermeldung, blendet nach 3s aus (CSS Transition)
- Link-Style Button (dashed border, dezent) — nicht prominent

### 4. Smart Defaults bei Auto-Generation
**Datei:** `El Frontend/src/shared/stores/dashboard.store.ts`

- `generateZoneDashboard()` Sensor-Type-Signatur um `config_id?: string` erweitert
- Neue async `enrichWidgetsWithAlertThresholds()` Funktion
- Fire-and-forget Pattern: Layout wird synchron erstellt, Thresholds werden danach asynchron geladen
- Batch-Optimierung via `Promise.allSettled()` — alle Alert-Config-Calls parallel
- Fehlertoleranz: 404/Fehler bei einzelnen Sensoren → Widget ohne Thresholds (kein Abbruch)
- Nach Enrichment: `persistLayouts()` + `syncLayoutToServer()` für Persistenz

## Design-Entscheidungen

- **Sync statt Async für generateZoneDashboard:** Funktion bleibt synchron (return `DashboardLayout | null`), damit alle Caller unverändert bleiben. Threshold-Enrichment läuft als fire-and-forget nach der Layout-Erstellung.
- **configId in SensorOption:** Gewählt statt separatem ESP-Store-Lookup, weil die Option bereits im Sensor-Dropdown-Kontext verfügbar ist.
- **Promise.allSettled statt Promise.all:** Einzelne Fehler dürfen nicht die gesamte Enrichment-Pipeline stoppen.

## Akzeptanzkriterien

- [x] Button vorhanden und funktional in Zone 2
- [x] Korrektes Mapping: warning_min→warnLow, warning_max→warnHigh, critical_min→alarmLow, critical_max→alarmHigh
- [x] showThresholds wird auf `true` gesetzt
- [x] Visuelles Feedback (Inline-Text, 3s Timeout)
- [x] Auto-Generation: Widgets bekommen Alert-Config-Thresholds als Default
- [x] Batch-Optimierung: Parallele API-Calls
- [x] Fehlerfall: Widget funktioniert ohne Alert-Config (404)
- [x] Manuelles Überschreiben nach Laden möglich
- [x] Keine Regression: Widgets ohne Alert-Config funktionieren wie bisher
