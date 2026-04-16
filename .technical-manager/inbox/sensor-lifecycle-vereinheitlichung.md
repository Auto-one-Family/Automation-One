# Sensor-Lifecycle-Vereinheitlichung: On-Demand, Alerts, Kalibrierung, Freshness

**Erstellt:** 2026-04-15
**Quelle:** Deep-Dive Code-Analyse (verify-plan Skill, alle Development-Skills)
**Priorität:** HOCH — User-facing Inkonsistenzen, Daten-Integrität
**Betroffene Schichten:** Backend (El Servador), Frontend (El Frontend), teilweise Firmware (El Trabajante)

---

## Zusammenfassung

Die Stale/Offline-Logik für Sensoren und Aktoren wurde kürzlich verbessert (Offline statt Warning bei stale ESP-Geräten). Dabei wurden strukturelle Lücken sichtbar: **On-Demand-Sensoren (pH, EC) fallen komplett durch das Monitoring-Raster**, es gibt **keine Kalibrier-Erinnerungen**, und die **Alert/Notification-Pipeline behandelt verschiedene Sensor-Modi nicht einheitlich**. Das System hat alle Bausteine, aber sie sind nicht durchgängig verdrahtet.

Dieser Report identifiziert **7 konkrete Issues** mit exakten Code-Stellen, Abhängigkeiten und Lösungsvorschlägen.

---

## ISSUE-01: On-Demand-Sensoren haben kein Freshness-Monitoring

### Problem

Der Sensor-Health-Job (`sensor_health.py:249-252`) überspringt **alle** nicht-continuous Sensoren:

```python
# Skip non-continuous modes
if effective["operating_mode"] != "continuous":
    sensors_skipped += 1
    continue
```

Das bedeutet: Ein pH-Sensor im `on_demand`-Modus, dessen letzte Messung **3 Wochen alt** ist, erzeugt keinerlei Warnung. Der User sieht einen grünen Status mit einem veralteten Wert — oder `stale` wird nie gesetzt.

Der Enum `SensorOperatingMode.requires_timeout()` (`enums.py:97-108`) gibt `True` nur für `CONTINUOUS` zurück. Das ist architektonisch korrekt für das bisherige Timeout-Konzept (Gerät sollte Daten senden, tut es aber nicht), aber es fehlt ein **paralleles Konzept für Messwert-Alter** bei On-Demand-Sensoren.

### Was der User braucht

- Konfigurierbare **Freshness-Dauer** pro Sensor(typ): "Nach X Stunden ohne Messung → Warnung, dass erneut gemessen werden muss"
- UI-Anzeige: "Letzte Messung vor 2 Tagen — bitte erneut messen"
- Optional: Notification/Alert wenn Freshness-Dauer überschritten

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/db/models/sensor_type_defaults.py` | Neues Feld `measurement_freshness_hours` (int, nullable, default=null → kein Limit) |
| `src/db/models/sensor.py` | Neues Feld `measurement_freshness_hours` als Instance-Override (analog zu `timeout_seconds`) |
| `src/services/maintenance/jobs/sensor_health.py` | Zweite Prüf-Schleife: On-Demand/Scheduled-Sensoren mit `measurement_freshness_hours > 0` gegen `last_reading_at` prüfen |
| `src/db/models/enums.py` | Neue Methode `requires_freshness_check()` die für `ON_DEMAND` und `SCHEDULED` `True` zurückgibt |
| `src/schemas/sensor_type_defaults.py` | Schema-Erweiterung um `measurement_freshness_hours` |
| `src/schemas/sensor.py` | Schema-Erweiterung um `measurement_freshness_hours` |

### Abgrenzung

- Timeout (continuous): "Gerät sollte senden, tut es nicht" → `timeout_seconds`
- Freshness (on_demand/scheduled): "Messwert ist veraltet, User sollte erneut messen" → `measurement_freshness_hours`

### Vorschlag Defaults

| Sensor-Typ | `measurement_freshness_hours` |
|-------------|-------------------------------|
| `ph` | 24 (täglich empfohlen) |
| `ec` | 24 (täglich empfohlen) |
| `moisture` (kapazitiv, continuous) | null (Timeout reicht) |
| `temperature` | null (continuous) |
| `humidity` | null (continuous) |

---

## ISSUE-02: Sensor-Health WebSocket-Event fehlt für On-Demand-Freshness

### Problem

Der aktuelle `sensor_health` WebSocket-Event (`sensor_health.py:357-373`) wird **nur** für continuous-stale Sensoren gebroadcastet. Das Frontend (`sensor.store.ts:314-351`) verarbeitet diesen Event und setzt `is_stale`, `stale_reason`, `operating_mode` etc.

Für On-Demand-Sensoren wird **kein** solcher Event gesendet. Im Frontend hat der Sensor daher **immer** `is_stale: false`, egal wie alt die letzte Messung ist.

### Lösung

Wenn ISSUE-01 implementiert ist, den `sensor_health` Event um einen neuen `stale_reason` erweitern:

```python
class StaleReason:
    TIMEOUT_EXCEEDED = "timeout_exceeded"  # bestehend
    NO_DATA = "no_data"                    # bestehend
    SENSOR_ERROR = "sensor_error"          # bestehend
    FRESHNESS_EXCEEDED = "freshness_exceeded"  # NEU
```

Frontend `sensor.store.ts` braucht keine Änderung — es verarbeitet bereits generisch `is_stale` und `stale_reason`.

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/services/maintenance/jobs/sensor_health.py` | Neue Prüf-Phase für Freshness + WS-Broadcast |
| Frontend: `src/shared/stores/sensor.store.ts` | Evtl. UI-Text für `freshness_exceeded` hinzufügen |
| Frontend: `src/utils/formatters.ts` | `formatStaleReason()` falls benötigt |

---

## ISSUE-03: Kein Kalibrier-Reminder-System

### Problem

Die Codebase hat ein vollständiges Kalibrierungs-System:
- `CalibrationService` (`calibration_service.py`) mit Session-Lifecycle
- `calibrated_at` Timestamp in `calibration_data` (wird bei jeder Kalibrierung gesetzt)
- Frontend Kalibrierungs-Wizard (`CalibrationWizard.vue`, `CalibrationStep.vue`)

Es fehlt aber komplett:
- **Kein `calibration_interval_days` Feld** auf `SensorConfig` oder `SensorTypeDefaults`
- **Kein Maintenance-Job** der `calibrated_at + calibration_interval_days < now` prüft
- **Keine Notification** "pH-Sensor X muss neu kalibriert werden"
- **Kein UI-Indikator** der anzeigt wann die nächste Kalibrierung fällig ist

Der einzige Hinweis auf Rekalibrierung ist ein Kommentar in `moisture.py:24`:
```python
# Readings may drift over time - periodic recalibration recommended
```

### Was der User braucht

- Pro Sensor(typ) konfigurierbar: "Alle X Tage neu kalibrieren"
- Notification wenn Kalibrierung fällig
- UI-Indikator: "Letzte Kalibrierung vor 45 Tagen — Rekalibrierung empfohlen"
- Alert-Suppression-Reason `calibration` ist bereits implementiert (ISA-18.2) → kann genutzt werden um Alerts während Kalibrierung zu unterdrücken (das funktioniert bereits!)

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/db/models/sensor_type_defaults.py` | Neues Feld `calibration_interval_days` (int, nullable, default=null) |
| `src/db/models/sensor.py` | Neues Feld `calibration_interval_days` als Instance-Override |
| `src/schemas/sensor_type_defaults.py` | Schema-Erweiterung |
| `src/schemas/sensor.py` | Schema-Erweiterung |
| `src/services/maintenance/jobs/sensor_health.py` ODER neuer Job | Kalibrierungs-Prüfung: `calibrated_at + interval < now` → Notification |
| `src/services/notification_router.py` | Neue `source="calibration_reminder"` (muss in `NOTIFICATION_SOURCES` in `schemas/notification.py` aufgenommen werden) |
| Frontend: Sensor-Config-UI | Anzeige/Einstellung von `calibration_interval_days` |
| Frontend: `SensorValueCard.vue` | Visueller Indikator wenn Kalibrierung fällig |

### Vorschlag Defaults

| Sensor-Typ | `calibration_interval_days` |
|-------------|---------------------------|
| `ph` | 30 |
| `ec` | 30 |
| `moisture` | 90 |
| `temperature` | null (selten nötig) |
| `humidity` | null (selten nötig) |

---

## ISSUE-04: Logic Engine berücksichtigt Sensor-Operating-Mode nicht

### Problem

Die Logic Engine (`logic_engine.py:192-270`) evaluiert Regeln bei **jedem** eingehenden Sensor-Datenpunkt über `evaluate_sensor_data()`. Der Sensor-Handler (`sensor_handler.py:574-610`) hat eine Freshness-Gate (`stale_for_logic`) die nur auf **Event-Alter** prüft (`LOGIC_FRESHNESS_SECONDS = 120`), nicht auf den Operating-Mode.

Das führt zu folgenden Szenarien:

**Szenario A: pH-Sensor (on_demand)**
- User misst pH-Wert → Logic Engine evaluiert → Aktor reagiert korrekt
- Nächste Messung kommt erst in 24h → Logic Engine wertet 24h lang denselben Wert aus
- Keine Re-Evaluation wenn der Wert sich in der Realität geändert haben könnte

**Szenario B: Timer-basierte Regeln mit On-Demand-Sensoren**
- Logic Engine `evaluate_timer_triggered_rules()` lädt letzte Sensor-Werte (`_load_sensor_values_for_timer`)
- Für On-Demand-Sensoren kann dieser Wert Stunden/Tage alt sein
- Die 5-Minuten-Staleness in der Timer-Evaluation (`logic_engine.py:350+`) verhindert die Evaluation mit alten Werten, aber **der User bekommt keine Rückmeldung** warum die Regel nicht feuert

**Szenario C: Cross-Sensor-Regeln**
- Regel: "Wenn pH < 5.5 UND Temperatur > 25°C → Alarm"
- pH ist on_demand (letzter Wert: vor 6h), Temperatur ist continuous (aktuell)
- Regel feuert mit veraltetem pH-Wert — oder feuert nicht wegen Staleness-Gate → beides potenziell falsch

### Lösung

1. **Freshness-Metadaten mitliefern**: Sensor-Evaluator (`sensor_evaluator.py`) sollte zusätzlich zum Wert auch das Alter des Werts prüfen und eine Warnung loggen wenn ein On-Demand-Sensor-Wert älter als `measurement_freshness_hours` ist
2. **Optional: "Stale-Aware" Condition-Flag**: Logic-Regeln könnten ein Flag `require_fresh_data: true` bekommen, das die Evaluation nur mit frischen Daten erlaubt
3. **Notification bei Logic-Rule-Skip wegen staler Daten**: User informieren wenn eine Regel nicht feuern kann weil ein benötigter Sensorwert veraltet ist

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/services/logic/conditions/sensor_evaluator.py` | Freshness-Check optional hinzufügen |
| `src/services/logic_engine.py` | Logging/Notification wenn Regel wegen staler Daten übersprungen wird |
| `src/schemas/logic.py` | Optional: `require_fresh_data` Flag in Condition-Schema |

---

## ISSUE-05: Alert-Threshold-Evaluation hat keinen Mode-Context

### Problem

Die Threshold-Evaluation in `sensor_handler.py:807-947` (`_evaluate_thresholds_and_notify`) wird bei **jedem** eingehenden Sensor-Datenpunkt ausgeführt, unabhängig vom Operating-Mode. Das ist grundsätzlich korrekt — wenn ein Wert kommt, sollte er geprüft werden.

**Aber**: Die Alert-Metadata enthalten keinen Hinweis auf den Operating-Mode. Wenn ein pH-Alarm um 14:00 ausgelöst wird und der User den Alert um 20:00 sieht, weiß er nicht:
- Ist der Wert noch aktuell? (continuous → ja, on_demand → vielleicht nicht)
- Muss er erneut messen um den Alarm zu validieren?

Außerdem: Die `alert_config` (`alert_config.py`) hat zwar `suppression_reason: "calibration"`, aber keine Möglichkeit **Mode-abhängige Schwellenwerte** zu setzen. Beispiel: Für continuous-Sensoren Warning bei Abweichung, für On-Demand-Sensoren erst Critical weil es eine punktuelle Messung ist.

### Lösung

1. **Alert-Metadata um `operating_mode` und `measurement_age_seconds` erweitern** (`sensor_handler.py:881-888`)
2. **Frontend Alert-Anzeige**: Bei On-Demand-Sensoren anzeigen wie alt der Messwert ist
3. **Optional: Mode-abhängige Severity-Regeln** im `alert_config`

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/mqtt/handlers/sensor_handler.py` | `alert_metadata` um `operating_mode` und `measurement_age_seconds` erweitern |
| Frontend: Alert-Anzeige-Komponenten | Alter des Messwerts anzeigen wenn `operating_mode != "continuous"` |

---

## ISSUE-06: Frontend zeigt kein Mess-Alter für On-Demand-Sensoren

### Problem

`SensorValueCard.vue` zeigt den "Messen"-Button für On-Demand-Sensoren (korrekt), aber:
- **Kein Hinweis** wie alt die letzte Messung ist
- **Kein visueller Indikator** dass der Wert veraltet sein könnte
- `qualityToStatus()` in `formatters.ts:657-664` mappt `stale` → `offline`, aber bei On-Demand-Sensoren wird `stale` nie gesetzt (siehe ISSUE-01)

Der `sensor.store.ts` hat `handleSensorHealth()` der `is_stale` setzt, aber für On-Demand-Sensoren kommt dieser Event nie (ISSUE-02).

### Was der User sieht

1. pH-Sensor konfiguriert als `on_demand`
2. Letzte Messung: vor 3 Tagen
3. UI zeigt: Normaler grüner Wert, kein Hinweis auf Alter
4. User weiß nicht dass er neu messen sollte

### Lösung

1. **`SensorValueCard.vue`**: Bei `operating_mode != 'continuous'` das Alter der letzten Messung anzeigen (aus `sensor_metadata.latest_timestamp`)
2. **Farbcodierung**: Gelb wenn `age > freshness_hours/2`, Rot wenn `age > freshness_hours`
3. **Text**: "Letzte Messung: vor 2 Tagen" direkt unter dem Wert
4. **Conditional Badge**: "Messung empfohlen" wenn Freshness überschritten

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `El Frontend/src/components/esp/SensorValueCard.vue` | Alters-Anzeige, Farbcodierung |
| `El Frontend/src/utils/formatters.ts` | Helper `formatMeasurementAge()` |
| `El Frontend/src/types/index.ts` | `measurement_freshness_hours` in Sensor-Typen ergänzen |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | Freshness-Einstellung im Config-Panel |
| `El Frontend/src/components/esp/EditSensorModal.vue` | Freshness-Einstellung im Edit-Modal |

---

## ISSUE-07: Notification-Source-Lücken — fehlende Quellen für neue Features

### Problem

`schemas/notification.py` definiert `NOTIFICATION_SOURCES`:
```python
NOTIFICATION_SOURCES = [
    "logic_engine", "mqtt_handler", "grafana", "sensor_threshold",
    "device_event", "autoops", "manual", "system", "ai_anomaly_service",
]
```

Es fehlen Sources für:
- `"freshness_reminder"` — Messwert-Alter überschritten (ISSUE-01/02)
- `"calibration_reminder"` — Kalibrierung fällig (ISSUE-03)
- `"measurement_required"` — On-Demand-Sensor braucht Messung

Ebenso fehlt in `NOTIFICATION_CATEGORIES`:
```python
NOTIFICATION_CATEGORIES = [
    "connectivity", "data_quality", "infrastructure", "lifecycle",
    "maintenance", "security", "system", "ai_anomaly",
]
```
Die Kategorie `"measurement"` oder `"sensor_lifecycle"` für Freshness/Calibration-Benachrichtigungen.

### Lösung

Erweiterung der Listen und Integration in die bestehende Pipeline:

| Source | Category | Trigger |
|--------|----------|---------|
| `freshness_reminder` | `data_quality` | Sensor-Health-Job (ISSUE-01) |
| `calibration_reminder` | `maintenance` | Kalibrier-Prüf-Job (ISSUE-03) |

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `src/schemas/notification.py` | Neue Sources + ggf. Kategorie |
| `src/services/maintenance/jobs/sensor_health.py` | Source beim NotificationCreate setzen |

---

## Abhängigkeits-Graph

```
ISSUE-01 (Freshness-Monitoring Backend)
  └─► ISSUE-02 (WebSocket-Event)
       └─► ISSUE-06 (Frontend-Anzeige)
  └─► ISSUE-04 (Logic Engine Mode-Context) [parallel möglich]
  └─► ISSUE-05 (Alert Mode-Context) [parallel möglich]

ISSUE-03 (Kalibrier-Reminder) [unabhängig von ISSUE-01, parallel]
  └─► ISSUE-06 (Frontend-Anzeige, Kalibrier-Indikator)

ISSUE-07 (Notification-Sources) [muss vor/parallel zu ISSUE-01 und ISSUE-03]
```

### Empfohlene Reihenfolge

1. **Batch 1 (Grundlagen):** ISSUE-07 + ISSUE-01 → Backend-Infrastruktur für Freshness
2. **Batch 2 (Durchleitung):** ISSUE-02 + ISSUE-05 → Events und Metadaten
3. **Batch 3 (UI):** ISSUE-06 → Frontend-Anzeige
4. **Batch 4 (Kalibrierung):** ISSUE-03 → Parallel oder nach Batch 1
5. **Batch 5 (Logic):** ISSUE-04 → Kann zuletzt, erfordert Design-Entscheidung

### Alembic-Migrationen benötigt

- `sensor_type_defaults`: `measurement_freshness_hours`, `calibration_interval_days`
- `sensor_configs`: `measurement_freshness_hours`, `calibration_interval_days`

---

## Vorhandene Infrastruktur die genutzt werden kann

| Baustein | Status | Pfad |
|----------|--------|------|
| Maintenance-Job-Framework | ✅ Vorhanden | `services/maintenance/service.py` |
| Sensor-Health-Job | ✅ Vorhanden, erweitern | `services/maintenance/jobs/sensor_health.py` |
| NotificationRouter | ✅ Vorhanden | `services/notification_router.py` |
| AlertSuppressionService | ✅ Vorhanden | `services/alert_suppression_service.py` |
| WebSocket-Broadcasting | ✅ Vorhanden | `websocket/manager.py` |
| `sensor_health` WS-Event | ✅ Vorhanden, erweitern | Frontend: `sensor.store.ts` |
| Sensor-Type-Defaults System | ✅ Vorhanden, erweitern | Model + Repo + API |
| `calibrated_at` Timestamp | ✅ Vorhanden | `calibration_data.calibrated_at` |
| Alert-Suppression `calibration` | ✅ Vorhanden | ISA-18.2 Pattern |
| On-Demand Trigger-API | ✅ Vorhanden | `POST /sensors/{esp_id}/{gpio}/measure` |
| Kalibrier-Service | ✅ Vorhanden | `calibration_service.py` |
| `SensorOperatingMode` Enum | ✅ Vorhanden, erweitern | `enums.py` |
| Config-Hierarchy (Instance > Type > Library > System) | ✅ Vorhanden | `compute_effective_config_from_cached()` |

---

## Dev-Rollen-Zuordnung

| Issue | Primäre Rolle | Sekundäre Rolle |
|-------|--------------|-----------------|
| ISSUE-01 | `server-dev` | — |
| ISSUE-02 | `server-dev` | `frontend-dev` (Store-Anpassung) |
| ISSUE-03 | `server-dev` | `frontend-dev` (UI-Indikator) |
| ISSUE-04 | `server-dev` | — |
| ISSUE-05 | `server-dev` | `frontend-dev` (Alert-Anzeige) |
| ISSUE-06 | `frontend-dev` | — |
| ISSUE-07 | `server-dev` | — |

---

## Risiko-Bewertung

| Risiko | Beschreibung | Mitigation |
|--------|-------------|------------|
| Migration | 2 neue Spalten auf 2 Tabellen | Nullable mit Default null → sichere Migration |
| Performance | Freshness-Check verdoppelt Sensor-Health-Job-Arbeit | In-Memory-Processing, gleiche Batch-Query-Optimierung wie bestehend |
| Breaking Change | Keine — alle neuen Felder nullable/optional | Bestehende Sensoren behalten Verhalten |
| Sensor-Libraries | `RECOMMENDED_MODE` in Libraries sollte Default-Freshness liefern | Library-Interface erweitern (optional) |
