# Linear Issue: Sensor-Lifecycle vereinheitlichen (On-Demand, Alerts, Kalibrierung, Freshness)

> **Dieses Dokument ist der 1:1 Issue-Text für Linear.**
> Kopiere alles ab "---" in ein neues Linear Issue, oder referenziere diese Datei in einem Cursor-Chat mit Linear-MCP.

---

## Titel

**Sensor-Lifecycle vereinheitlichen: On-Demand (pH/EC), Freshness-Monitoring, Kalibrier-Reminder, Alert-Pipeline**

## Beschreibung

### Kontext

Die Stale/Offline-Logik für Sensoren wurde kürzlich verbessert — Sensoren werden jetzt korrekt auf `offline` gesetzt wenn ihr ESP stale ist (statt dauerhaft Warning). Dabei wurde sichtbar, dass **On-Demand-Sensoren (pH, EC) komplett durch das Monitoring-Raster fallen** und mehrere Systeme (Alerts, Logic Engine, Notifications, Frontend) den `operating_mode` nicht einheitlich berücksichtigen.

**Das System hat alle Bausteine** (Maintenance-Jobs, NotificationRouter, AlertSuppression ISA-18.2, WebSocket-Events, Config-Hierarchy mit 4 Ebenen), aber sie sind **nicht durchgängig verdrahtet**.

### Auftrag an den Technical Manager

**@TM — Bitte analysiere den vollständigen Report und erstelle daraus eigenständige Sub-Issues direkt an die zuständigen Agenten:**

1. **Lies den vollständigen Analyse-Report:** `.technical-manager/inbox/sensor-lifecycle-vereinheitlichung.md`
2. **Validiere die 7 identifizierten Issues** gegen den aktuellen Code-Stand — der Report enthält exakte Dateipfade, Zeilennummern und Code-Zitate
3. **Erstelle für jedes Issue ein separates Linear Sub-Issue** mit:
   - Klarem Scope und Akzeptanzkriterien
   - Exakte Dateien die geändert werden müssen
   - Pattern-Vorgaben basierend auf vorhandenem Code (die Patterns sind im Report dokumentiert)
   - Zugewiesene Dev-Rolle (`server-dev`, `frontend-dev`)
   - Abhängigkeiten zu anderen Sub-Issues
4. **Priorisiere die Issues** nach dem Abhängigkeits-Graph aus dem Report:
   - Batch 1 (Grundlagen): Notification-Sources + Freshness-Backend-Infrastruktur
   - Batch 2 (Durchleitung): WebSocket-Events + Alert-Metadaten
   - Batch 3 (UI): Frontend-Anzeige für Mess-Alter und Kalibrierung
   - Batch 4 (Kalibrierung): Kalibrier-Reminder parallel
   - Batch 5 (Logic): Logic-Engine Mode-Awareness

### Die 7 Issues im Überblick

| # | Issue | Prio | Dev-Rolle | Kern-Problem |
|---|-------|------|-----------|-------------|
| 01 | **On-Demand-Sensoren: kein Freshness-Monitoring** | HOCH | `server-dev` | `sensor_health.py:249-252` überspringt alle nicht-continuous Sensoren. pH/EC im on_demand-Modus erzeugen keine Warnung egal wie alt der Wert ist. Neues Feld `measurement_freshness_hours` auf `SensorTypeDefaults` und `SensorConfig` nötig. |
| 02 | **sensor_health WS-Event fehlt für On-Demand** | HOCH | `server-dev` + `frontend-dev` | WebSocket `sensor_health` wird nur für continuous-stale gebroadcastet. Frontend `sensor.store.ts` verarbeitet generisch — bekommt aber für On-Demand nie einen Event. Neuer `StaleReason.FRESHNESS_EXCEEDED`. |
| 03 | **Kein Kalibrier-Reminder-System** | HOCH | `server-dev` + `frontend-dev` | `calibrated_at` wird gespeichert, aber es gibt kein `calibration_interval_days`, keinen Maintenance-Job, keine Reminder-Notification. Alle Bausteine (NotificationRouter, MaintenanceService, Suppression-Reason `calibration`) existieren bereits. |
| 04 | **Logic Engine ignoriert Operating-Mode** | MITTEL | `server-dev` | Timer-Regeln mit On-Demand-Sensordaten können mit Stunden alten Werten feuern. Kein Logging/Notification wenn Regel wegen staler On-Demand-Daten übersprungen wird. |
| 05 | **Alert-Metadata ohne Mode-Context** | MITTEL | `server-dev` + `frontend-dev` | `_evaluate_thresholds_and_notify()` baut Alert-Metadata ohne `operating_mode` und `measurement_age_seconds`. User kann nicht erkennen ob Alert auf aktuellem oder veraltetem Wert basiert. |
| 06 | **Frontend: kein Mess-Alter bei On-Demand** | HOCH | `frontend-dev` | `SensorValueCard.vue` zeigt "Messen"-Button aber keinen Hinweis wie alt die letzte Messung ist. `qualityToStatus()` mappt `stale` → `offline`, aber `stale` wird für On-Demand nie gesetzt. |
| 07 | **Notification-Sources fehlen** | NIEDRIG | `server-dev` | `NOTIFICATION_SOURCES` in `schemas/notification.py` fehlen `freshness_reminder` und `calibration_reminder`. |

### Vorhandene Patterns die genutzt werden MÜSSEN

Die Agenten sollen **auf Basis der vorhandenen Codebase-Patterns** implementieren — keine neuen Architekturen:

- **Config-Hierarchy**: Instance-Override > Type-Default > Library > System-Default (Pattern: `compute_effective_config_from_cached()` in `sensor_health.py:57-118`)
- **Maintenance-Job-Pattern**: Job-Funktion in `services/maintenance/jobs/`, registriert in `maintenance/service.py` mit Intervall
- **Notification-Pipeline**: `NotificationCreate` → `NotificationRouter.route()` (DB + WS + Email) — exakt wie `_evaluate_thresholds_and_notify()` in `sensor_handler.py:807-947`
- **WebSocket-Broadcast**: `ws_manager.broadcast("event_type", data)` — exakt wie `sensor_health` Event in `sensor_health.py:357-373`
- **Alert-Suppression**: ISA-18.2 Pattern via `AlertSuppressionService` — Alerts immer evaluieren, nur Notifications supprimieren
- **Alembic-Migration**: Nullable Felder mit `default=None` für sichere Migration ohne Downtime
- **Frontend Sensor-Store**: `handleSensorHealth()` in `sensor.store.ts` — generischer Handler der `is_stale`, `stale_reason` etc. setzt

### Akzeptanzkriterien (Gesamtpaket)

- [ ] pH/EC-Sensoren im on_demand-Modus zeigen im Frontend das Alter der letzten Messung
- [ ] User kann pro Sensor(typ) eine `measurement_freshness_hours` konfigurieren
- [ ] Wenn Freshness überschritten → Notification an User + visueller Indikator im Dashboard
- [ ] User kann pro Sensor(typ) ein `calibration_interval_days` konfigurieren
- [ ] Wenn Kalibrierung fällig → Notification an User + visueller Indikator
- [ ] Alert-Metadata enthalten `operating_mode` und `measurement_age_seconds`
- [ ] Logic Engine loggt/warnt wenn Regel wegen veraltetem On-Demand-Wert übersprungen wird
- [ ] Alle neuen Features nutzen die bestehende Config-Hierarchy (Instance > Type > Library > System)
- [ ] Alembic-Migration für neue DB-Felder
- [ ] Backend-Tests für alle neuen Features (pytest, gleiche Patterns wie bestehende Tests)
- [ ] Frontend-Tests für neue UI-Elemente (Vitest, gleiche Patterns)

### Referenz-Dateien

- **Vollständiger Analyse-Report**: `.technical-manager/inbox/sensor-lifecycle-vereinheitlichung.md`
- **Sensor-Health-Job**: `El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py`
- **Sensor-Handler (Threshold-Pipeline)**: `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- **Notification-Router**: `El Servador/god_kaiser_server/src/services/notification_router.py`
- **Alert-Suppression**: `El Servador/god_kaiser_server/src/services/alert_suppression_service.py`
- **Kalibrier-Service**: `El Servador/god_kaiser_server/src/services/calibration_service.py`
- **Logic Engine**: `El Servador/god_kaiser_server/src/services/logic_engine.py`
- **Sensor-Model**: `El Servador/god_kaiser_server/src/db/models/sensor.py`
- **Type-Defaults-Model**: `El Servador/god_kaiser_server/src/db/models/sensor_type_defaults.py`
- **Frontend SensorValueCard**: `El Frontend/src/components/esp/SensorValueCard.vue`
- **Frontend Sensor-Store**: `El Frontend/src/shared/stores/sensor.store.ts`

### Labels

`sensor-lifecycle`, `server-dev`, `frontend-dev`, `enhancement`

### Priorität

**Urgent** — User-facing Inkonsistenzen bei pH/EC-Sensoren die aktiv genutzt werden

---

> [repo=Auto-one-Family/Automation-One]
