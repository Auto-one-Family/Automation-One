# Auftrag P8-A3 — Alert-Config Threshold Sync

**Typ:** Feature — Frontend
**Schwere:** HIGH
**Aufwand:** ~2h
**Ziel-Agent:** frontend-dev
**Abhaengigkeit:** **A2** (braucht das Accordion-Layout in Zone 2 fuer korrekte Platzierung)
**Roadmap:** `roadmap-P8-v2-implementation-2026-03-27.md`

---

## Kontext

AutomationOne ist ein IoT-Framework mit Vue 3 Dashboard. Es gibt zwei getrennte Systeme fuer Sensor-Schwellwerte:

**System 1 — Alert-Config (Server-seitig, pro Sensor):**
- `AlertConfigSection.vue` ermoeglicht per-Sensor Threshold-Konfiguration
- API: `GET /sensors/{sensor_id}/alert-config` und `PATCH /sensors/{sensor_id}/alert-config`
  - [Korrektur] `sensor_id` ist UUID (nicht numerisch). Server: `sensor_id: uuid.UUID`. Methode ist PATCH, nicht PUT. Frontend-API: `sensorApi.getAlertConfig(sensorId: string)` / `sensorApi.updateAlertConfig(sensorId, config)` in `El Frontend/src/api/sensors.ts:236-252`.
- Server-Response-Schema (GET alert-config):
  ```json
  {
    "status": "ok",
    "alert_config": {
      "alerts_enabled": true,
      "custom_thresholds": {
        "warning_min": 18.0,
        "warning_max": 28.0,
        "critical_min": 15.0,
        "critical_max": 32.0
      }
    },
    "thresholds": {}
  }
  ```
  - [Korrektur] `custom_thresholds` ist NESTED in `alert_config`, nicht top-level. Zugriffspfad: `response.alert_config.custom_thresholds`. Server-Code: `El Servador/god_kaiser_server/src/api/v1/sensors.py:335-339`.
- Diese Schwellwerte loesen Server-seitige Alerts aus (Notification-System, E-Mail etc.)

**System 2 — Widget-Thresholds (Frontend, pro Widget):**
- `WidgetConfigPanel.vue` hat manuelle Felder: `warnLow`, `warnHigh`, `alarmLow`, `alarmHigh`
- Diese Werte werden in der Widget-Config (`dashboard.store.ts`) gespeichert
- `GaugeWidget.vue` nutzt sie fuer Farbzonen im Gauge
- `LineChartWidget.vue` und `HistoricalChart.vue` nutzen sie fuer Threshold-Linien via `chartjs-plugin-annotation`
- `showThresholds` Boolean steuert ob Linien angezeigt werden

**Das Problem:** Beide Systeme sind NICHT synchronisiert. Ein User der Schwellwerte im Alert-System konfiguriert hat, sieht sie nicht in seinen Dashboard-Widgets. Er muss sie manuell nochmal eingeben.

**Design-Prinzip:** Einstellungen gehoeren zu dem Objekt das sie betreffen. Sensor-Schwellwerte gehoeren zum Sensor (Alert-Config), nicht zum Dashboard-Widget. Das Widget ZEIGT Schwellwerte an. Der Default kommt vom Sensor — der User kann im Widget manuell ueberschreiben.

---

## IST

| Komponente | Was sie tut | Problem |
|-----------|------------|---------|
| `WidgetConfigPanel.vue` Zeilen ~342-399 | Manuelle Threshold-Eingabe pro Widget | NICHT mit Alert-Config synchronisiert |
  [Korrektur] Threshold-Section beginnt bei Zeile 342 (showThresholds toggle), Felder bis Zeile 399.
| `dashboard.store.ts` `generateZoneDashboard()` | Erstellt Auto-Dashboards fuer Zonen | `showThresholds: false`, keine Alert-Config-Abfrage |
| `GaugeWidget.vue` | Nutzt Threshold-Props fuer Farbzonen | Bekommt nur manuell eingegebene Werte |
| `LineChartWidget.vue` / `HistoricalChart.vue` | Threshold-Linien per chartjs-plugin-annotation | Bekommt nur manuell eingegebene Werte |

---

## SOLL

### Schritt 1 — "Schwellen aus Sensor-Config laden" Button

In `WidgetConfigPanel.vue`, innerhalb der Threshold-Section (Zone 2 nach A2-Restructuring):

1. **Neuer Button** "Schwellen aus Sensor-Config laden" (oder englisch: "Load from Alert Config")
2. Bei Klick:
   - Die aktuell ausgewaehlte `sensorConfigId` aus dem Widget ermitteln (aus dem Sensor-Dropdown)
   - API-Call: `sensorApi.getAlertConfig(configId)` wobei `configId` = UUID aus `MockSensor.config_id`
   - [Korrektur] Response-Pfad: `response.alert_config.custom_thresholds` (nested!)
   - Falls `alert_config.custom_thresholds` vorhanden:
     - `custom_thresholds.warning_min` → Widget-Config `warnLow`
     - `custom_thresholds.warning_max` → Widget-Config `warnHigh`
     - `custom_thresholds.critical_min` → Widget-Config `alarmLow`
     - `custom_thresholds.critical_max` → Widget-Config `alarmHigh`
     - `showThresholds` → `true`
   - Falls keine `custom_thresholds` existieren: Inline-Hinweis "Keine Schwellwerte fuer diesen Sensor konfiguriert"
3. **Visuelles Feedback:** Kurzer Inline-Text "Schwellen geladen" der nach 3 Sekunden ausblendet (CSS Transition, kein Toast-System noetig)
4. User kann Werte danach manuell aendern — die Widget-Config ist Master nach dem Laden

**Platzierung:** Direkt ueber den Threshold-Input-Feldern in Zone 2 (Darstellung). Der Button ist ein kleiner Link-Style Button, nicht prominent — die meisten User konfigurieren Thresholds ueber das Alert-System und laden sie dann hier.

### Schritt 2 — Smart Defaults bei Auto-Generation

In `dashboard.store.ts` bei `generateZoneDashboard()`:

1. Fuer jedes Sensor-Widget das erstellt wird:
   - `GET /sensors/{sensorConfigId}/alert-config` laden
   - Falls Thresholds existieren: In die Widget-Config als Default schreiben
   - `showThresholds: true` setzen (statt aktuell `false`)
2. Falls keine Thresholds existieren: `showThresholds: false` bleibt (wie bisher)
3. **Kein zusaetzlicher API-Call bei jedem Widget-Render** — Thresholds werden EINMALIG beim Erstellen gesetzt

**Batch-Optimierung:** Da `generateZoneDashboard()` mehrere Widgets gleichzeitig erstellt, die Alert-Config-Calls per `Promise.all()` parallelisieren. Falls ein Call fehlschlaegt (404 = kein Alert-Config), Widget trotzdem erstellen (ohne Thresholds).

---

## Sensor-Config-ID Ermittlung

Die `sensor_id` (UUID) muss aus dem Widget's Sensor-Auswahl abgeleitet werden. Im Widget-System werden Sensoren als 3-teilige IDs referenziert: `espId:gpio:sensorType`. Die Alert-Config-API nutzt die `sensor_id` als UUID (NICHT numerisch).

[Korrektur] **useSensorOptions.ts kennt die config_id (UUID) NICHT.** Das Composable exponiert nur `espId`, `gpio`, `sensorType` (siehe `SensorOption` Interface in `useSensorOptions.ts:12-18`).

**Korrigierte Loesung:** Die `config_id` (UUID) liegt auf `MockSensor.config_id` im ESP-Store (`types/index.ts:252`). Lookup-Pfad:
1. Widget-sensorId parsen: `"ESP_472204:0:sht31_temp"` → `{espId, gpio, sensorType}`
2. In `espStore.devices` das Device mit `espId` finden
3. In `device.sensors` den Sensor mit matching `gpio` + `sensor_type` finden
4. `sensor.config_id` (UUID) auslesen → als `sensorId` an die Alert-Config-API übergeben

**Empfehlung:** Entweder eine Helper-Funktion im Dashboard-Store oder `useSensorOptions` um `config_id` erweitern. Alternativ: `SensorOption` Interface in `useSensorOptions.ts` um `configId?: string` erweitern und beim Aufbau der Options `sensor.config_id` mitmappen.

---

## Einschraenkungen

- **Abhaengigkeit von A2:** Der Button kommt in Zone 2 (Darstellung) des 3-Zonen-Layouts
- Alert-Config-API-Endpoints bleiben unveraendert (nur gelesen, nicht geschrieben)
- `AlertConfigSection.vue` wird NICHT geaendert
- Manuelles Ueberschreiben im Widget IMMER moeglich
- Keine neuen npm-Pakete
- Widget-Config bleibt flaches Interface (kein nested `alertConfig` Objekt)
  - [Korrektur] `DashboardWidget.config` Interface (`dashboard.store.ts:39-69`) hat aktuell KEINE Felder `warnLow`, `warnHigh`, `alarmLow`, `alarmHigh`. Diese werden untypisiert über `useDashboardWidgets.ts:252-255` als `Record<string, any>` gemappt. Für Schritt 1+2 müssen diese Felder zum Interface hinzugefügt werden (strict TS Policy).

---

## Was NICHT gemacht wird

- Rueckwaerts-Sync (Widget → Alert-Config) — Widget-Thresholds sind nur lokal
- Automatisches Live-Update wenn sich Alert-Config aendert — nur bei manuellem Klick oder Auto-Generation
- Neues API-Endpoint — bestehendes `GET /sensors/{id}/alert-config` reicht

---

## Akzeptanzkriterien

- [ ] "Schwellen aus Sensor-Config laden" Button vorhanden und funktional in Zone 2
- [ ] Korrektes Mapping: warning_min→warnLow, warning_max→warnHigh, critical_min→alarmLow, critical_max→alarmHigh
- [ ] showThresholds wird auf `true` gesetzt wenn Schwellwerte geladen werden
- [ ] Visuelles Feedback nach Laden (Inline-Text, 3s Timeout)
- [ ] Auto-Generation (`generateZoneDashboard`): Widgets bekommen Alert-Config-Thresholds als Default
- [ ] Batch-Optimierung: Parallele API-Calls bei Auto-Generation
- [ ] Fehlerfall: Widget funktioniert auch wenn Alert-Config nicht vorhanden (404)
- [ ] Manuelles Ueberschreiben nach Laden moeglich
- [ ] Keine Regression: Widgets ohne Alert-Config funktionieren wie bisher
