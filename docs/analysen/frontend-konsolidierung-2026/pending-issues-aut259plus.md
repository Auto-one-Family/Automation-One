# Pending Linear Issues — Frontend-Konsolidierung 2026

> **Stand:** 2026-05-06  
> **Kontext:** AUT-259 wurde erstellt (Heartbeat-Schwellen). Diese Datei enthält alle weiteren  
> Follow-up-Issues aus SI-6, SI-7, SI-8 die wegen Linear-Free-Tier-Limit noch nicht angelegt wurden.  
> **Zu erstellen unter:** AutoOne Team, Eltern-Issues wie angegeben.

---

## AUT-259 (bereits erstellt)

**Titel:** `fix(frontend): Heartbeat-Ampel-Schwellen korrigieren — STALE 90s→70s, OFFLINE 210s→120s`  
**Priorität:** Urgent | **Parent:** AUT-245  
**Datei:** `El Frontend/src/composables/useESPStatus.ts`  
`HEARTBEAT_STALE_MS: 90_000 → 70_000`, `HEARTBEAT_OFFLINE_MS: 210_000 → 120_000`

---

## SI-8 — DiagnosticsView (Parent: AUT-245)

### ISSUE-SI8-A: esp_diagnostics WS-Event verdrahten
**Priorität:** Urgent  
**Titel:** `fix(frontend): esp_diagnostics WS-Event verdrahten — kein Frontend-Abonnement vorhanden`

**Befund:** Server sendet `esp_diagnostics` via `DiagnosticsHandler:197`. Frontend empfängt es nirgendwo — kein Type in `websocket-events.ts`, kein Eintrag in `contractEventMapper.ts`, kein Handler in `esp.ts`.

**Server-Payload:**
```
heap_free, heap_min_free, heap_fragmentation,
uptime_seconds, error_count,
wifi_rssi, mqtt_connected, system_state,
boot_reason, mqtt_cb_state, wdt_*
```

**Schritte:**
1. `ESPDiagnosticsEvent` Interface in `El Frontend/src/types/websocket-events.ts`
2. Eintrag `esp_diagnostics` in `WS_EVENT_TYPES` (`El Frontend/src/utils/contractEventMapper.ts`)
3. `handleEspDiagnosticsEvent()` in `El Frontend/src/stores/esp.ts` — speichert in `device.diagnostics`
4. Pattern: analog `esp_health` Verdrahtung (`espHealth.ts` + `esp.ts:handleEspHealth`)

**Akzeptanzkriterium:** `esp_diagnostics`-Events landen in `espStore.getDeviceById(id).diagnostics`, reaktiv im Vue DevTools sichtbar.

---

### ISSUE-SI8-B: esp_heartbeat_logs REST-Endpoint
**Priorität:** Medium  
**Titel:** `feat(server+frontend): GET /v1/esp/{esp_id}/heartbeat-logs — Zeitreihe surfacen`

**Befund:** `esp_heartbeat_logs`-Tabelle existiert (7-Tage-Retention, `heap_free`, `wifi_rssi`, `uptime`, `health_status`, `runtime_telemetry`). Kein REST-Endpoint exponiert — nur intern via `event_aggregator_service.py`.

**Neuer Endpoint:** `GET /v1/esp/{esp_id}/heartbeat-logs?hours=24&limit=100`

**Server:** `El Servador/god_kaiser_server/src/api/v1/esp.py` + Repo `esp_heartbeat_repo.py`  
**Frontend-Nutzung:** Sparkline in `DeviceDetailView.vue` oder `HealthTab.vue` (Heap/RSSI-Trend)

**Abgrenzung:** Feature-Request (AUT-133 Heartbeat Metrics Utilization), kein Bug.

---

### ISSUE-SI8-C: Diagnostics Report History — Paginierung
**Priorität:** Medium  
**Titel:** `feat(frontend): DiagnosticsView Report-History Paginierung — aktuell limit=20 fest`

**Befund:** `getDiagnosticHistory(limit, offset)` unterstützt Offset-Paginierung server-seitig. Frontend lädt fest `limit=20` ohne Nachladen.

**Schritte:**
1. `El Frontend/src/components/system-monitor/ReportsTab.vue` — "Mehr laden"-Button oder Infinite-Scroll
2. `El Frontend/src/shared/stores/diagnostics.store.ts` — Offset-Tracking ergänzen

---

### ISSUE-SI8-D: DiagnoseTab + ReportsTab Hex-rgba → CSS-Token
**Priorität:** Low  
**Titel:** `fix(frontend): DiagnoseTab + ReportsTab Status-Banner Hex-rgba → CSS-Token`

**Befund:**
- `DiagnoseTab.vue`: Status-Banner-Borders `rgba(52, 211, 153, 0.3)`, `rgba(251, 191, 36, 0.3)`, `rgba(248, 113, 113, 0.3)` — Hex-hardcoded
- `ReportsTab.vue`: Status-Pills `rgba(52, 211, 153, 0.15)`, `rgba(251, 191, 36, 0.15)`, `rgba(248, 113, 113, 0.15)` — Hex-hardcoded

**Kontext:** CSS-Var-Token (`--color-success`, etc.) haben keine `*/10`-Opacity-Varianten. Lösung: entweder Tailwind-Klassen (`success/10`, `warning/10`) nutzen oder Token-System um Alpha-Varianten erweitern. AUT-47 Token-Konformitätsregel.

---

## SI-6 — LogicEngineView (Parent: AUT-243)

### ISSUE-SI6-A: sensor_diff Canvas-Template fehlt
**Priorität:** High  
**Titel:** `fix(frontend): sensor_diff-Node — Palette-Eintrag vorhanden, Canvas-Template fehlt`

**Befund:** `RuleNodePalette.vue:133–139` hat den Node als draggbares Item. `RuleFlowEditor.vue` hat kein `#node-sensor_diff`-Template. Nach Drop: leerer, unbrauchbarer Node. AUT-173 (Done) hat den Server-Typ implementiert — Frontend hängt nach.

**Node-Felder:**
```
sensor_a_uuid, sensor_b_uuid, operator, threshold, consecutive_count
```

**Schritte:**
1. `RuleFlowEditor.vue`: Template `<template #node-sensor_diff>` — analog `#node-sensor`
2. `RuleConfigPanel.vue`: Abschnitt für `type === 'sensor_diff'` mit Sensor-A/B-Picker, Operator-Select, Threshold, Consecutive-Count
3. Serialisierung in `ruleToGraph()` / `graphToRule()` prüfen

---

### ISSUE-SI6-B: useActuatorOptions Composable
**Priorität:** High  
**Titel:** `feat(frontend): useActuatorOptions Composable — Aktor-Picker mit Zone-Gruppierung`

**Befund:** `useSensorOptions.ts` existiert mit Zone→Subzone→Sensor-Gruppierung. Pendant für Aktoren fehlt vollständig. `RuleConfigPanel.vue` löst Aktor-Auswahl direkt über `espStore.devices` ohne Zone-Gruppierung.

**Neues Composable:** `El Frontend/src/composables/useActuatorOptions.ts`  
Analog `useSensorOptions`, gruppiert Aktoren per Zone, liefert `ActuatorOption` mit `espId`/`gpio`/`configId`.

---

### ISSUE-SI6-C: rule_conflict_resolved WS-Event im Store abonnieren
**Priorität:** High  
**Titel:** `feat(frontend): rule_conflict_resolved WS-Event im Logic-Store abonnieren`

**Befund:** Server broadcastet `rule_conflict_resolved` (AUT-114 Telemetry). Store abonniert nur `conflict.arbitration` (`logic.store.ts:833`). `rule_conflict_resolved` ist ungenutzt.

**Schritt:** Handler `handleRuleConflictResolvedEvent()` in `El Frontend/src/shared/stores/logic.store.ts` — aktualisiert betroffene Regel (Conflict-State clearen) und emittiert optionalen Toast.

---

### ISSUE-SI6-D: Konflikt-Arbitrations-Badge in RuleCard
**Priorität:** Medium  
**Titel:** `feat(frontend): Konflikt-Badge in RuleCard/LinkedRulesSection aus recentConflictArbitrations`

**Befund:** `logicStore.recentConflictArbitrations` hält letzte 20 `conflict.arbitration`-Events. In `LogicView`/`RuleCard` gibt es kein UI-Binding dafür. Nur Alert-Center (AUT-131) zeigt Konflikte.

**Implementierung:** `RuleCard.vue` — computed `latestConflict` aus `recentConflictArbitrations` filtern auf `rule.id`. Badge "Konflikt vor Xs" wenn vorhanden. Analog: `LinkedRulesSection.vue`.

---

### ISSUE-SI6-E: Execution-History Zeitbereich-Filter + Aktor-Filter
**Priorität:** Medium  
**Titel:** `feat(frontend): Execution-History Zeitbereich-Filter (Datepicker) + Aktor-Filter`

**Befund:** Server-Endpoint `GET /v1/logic/execution_history` unterstützt `?start_time` + `?end_time` bereits. UI bietet nur Regel/Status/ReasonCode-Filter. Kein Datepicker, kein Aktor-Filter.

**Schritte:** In `LogicView.vue` (oder extrahierter Komponente SI6-F): DatePicker für `start_time`/`end_time`, Select für ESP+GPIO-Filter hinzufügen.

---

### ISSUE-SI6-F: ExecutionHistoryPanel als eigenständige Komponente
**Priorität:** Medium  
**Titel:** `refactor(frontend): ExecutionHistoryPanel.vue aus LogicView extrahieren`

**Befund:** ~200 Zeilen Execution-History-Logik sind inline in `LogicView.vue` eingebettet. Keine eigene Komponente, kein Reuse möglich (z.B. in MonitorView).

**Neue Datei:** `El Frontend/src/components/logic/ExecutionHistoryPanel.vue`  
Props: `ruleId?: string`, `espId?: string`, `gpio?: number`  
Integriert ISSUE-SI6-E (Zeitbereich-Filter) direkt.

---

### ISSUE-SI6-G: max_executions_per_hour UI-Feld
**Priorität:** Low  
**Titel:** `feat(frontend): max_executions_per_hour UI-Feld in LogicView-Toolbar ergänzen`

**Befund:** `CrossESPLogic.max_executions_per_hour` ist im Server-Schema vorhanden, hat aber kein UI-Eingabefeld. Wichtig für Rate-Limiting produktiver Regeln.

**Schritt:** In `LogicView.vue` Toolbar-Metadaten: Zahlen-Input für `max_executions_per_hour` neben `cooldown_seconds` ergänzen.

---

### ISSUE-SI6-H: useSensorOptions in RuleConfigPanel anbinden
**Priorität:** Low  
**Titel:** `refactor(frontend): useSensorOptions in RuleConfigPanel.vue anbinden statt espStore direkt`

**Befund:** `useSensorOptions.ts` existiert, wird in `RuleConfigPanel.vue` nicht genutzt. Panel iteriert `espStore.devices` direkt ohne Zone-Gruppierung.

**Schritt:** `RuleConfigPanel.vue` — `useSensorOptions()` für Sensor-A/B-Picker und actuator-Node-Picker einbinden.

---

### ISSUE-SI6-I: RuleConfigPanel diagnostics_status + run_diagnostic vervollständigen
**Priorität:** Low  
**Titel:** `feat(frontend): RuleConfigPanel diagnostics_status/run_diagnostic Abschnitt vervollständigen`

**Befund:** `RuleFlowEditor.vue`-Templates für `diagnostics_status`- und `run_diagnostic`-Nodes sind vorhanden. `RuleConfigPanel.vue`-Abschnitte für diese Typen müssen auf Vollständigkeit geprüft und ggf. ergänzt werden.

---

## SI-7 — AlertConfigView (Parent: AUT-244)

### ISSUE-SI7-A: offline_rules_preview Server-Endpoint
**Priorität:** High  
**Titel:** `feat(server): GET /api/v1/esp/{esp_id}/offline_rules_preview`

**Befund:** `ConfigPayloadBuilder.MAX_OFFLINE_RULES = 8`. Bei Überschreitung: silent Warning + Kürzung (`config_builder.py:445–452`). Frontend hat keine Möglichkeit, Slot-Belegung anzuzeigen.

**Neuer Endpoint:** `GET /api/v1/esp/{esp_id}/offline_rules_preview`

**Antwort-Schema:**
```json
{
  "esp_id": "...",
  "total_logic_rules": 12,
  "qualified_count": 5,
  "max_slots": 8,
  "slots_used": 5,
  "slots_free": 3,
  "qualified_rules": [{"rule_id": "...", "rule_name": "...", "offline_rule_index": 0}],
  "disqualified_rules": [{"rule_id": "...", "rule_name": "...", "reason": "cross_esp_action | calibration_sensor | or_compound | ..."}]
}
```

**Implementierung:** `_build_offline_rules()` + `_validate_offline_rules_consistency()` ohne MQTT-Push. Keine Seiteneffekte. Auth: `ActiveUser`.

**Dateien:** `El Servador/god_kaiser_server/src/api/v1/esp.py`, `services/config_builder.py`

**Voraussetzung für:** ISSUE-SI7-B (Slot-Anzeige Frontend)

---

### ISSUE-SI7-B: Offline-Rules Slot-Anzeige X/8 im Frontend
**Priorität:** High  
**Titel:** `feat(frontend): Offline-Rules Slot-Anzeige X/8 in LinkedRulesSection/SensorConfigPanel`  
**Blocked by:** ISSUE-SI7-A (offline_rules_preview Endpoint)

**Befund:** Kein Frontend-Feedback wenn ESP 8/8 Slots voll sind. Benutzer weiß nicht warum eine Logic-Rule nicht als Offline-Rule landet.

**Implementierung:**
- Neuer API-Call in `El Frontend/src/api/esp.ts`: `getOfflineRulesPreview(espId)`
- `LinkedRulesSection.vue`: Badge "X/8 Offline-Slots" + Liste der disqualifizierten Rules mit Grund
- Optional: Warning wenn `slots_free === 0`

---

### ISSUE-SI7-C: Kontextuelle Konflikt-Anzeige in LinkedRulesSection
**Priorität:** High  
**Titel:** `feat(frontend): Kontextuelle Konflikt-Anzeige in LinkedRulesSection`

**Befund:** `logicStore.recentConflictArbitrations` (letzte 20 Arbitrationen) ist vorhanden, aber nirgendwo in der Konfigurations-Nähe eines Sensors/Aktors sichtbar. Wenn zwei Rules denselben Aktor adressieren, gibt es im `SensorConfigPanel` / `ActuatorConfigPanel` keinen Hinweis.

**Implementierung:** `LinkedRulesSection.vue` — computed `conflictForRule(ruleId)` aus `recentConflictArbitrations`. Badge "Konflikt vor Xs" wenn vorhanden. Deeplink zum SystemMonitor Events-Tab.

---

### ISSUE-SI7-D: alert_config_context Aggregations-Endpoint
**Priorität:** Medium  
**Titel:** `feat(server): GET /api/v1/sensors/{sensor_id}/alert_config_context — Drei-Pfad-Aggregation`

**Befund:** Für Option B des Konsolidierungs-Konzepts (dedizierte AlertConfigView) wird ein Aggregations-Endpoint benötigt, der alle drei Konfigurationspfade für einen Sensor zusammenfasst.

**Antwort:** P3-Thresholds, P3-AlertConfig, verknüpfte P1-Logic-Rules, qualifizierte P2-Offline-Rules (aus `offline_rules_preview`-Logik).

**Dateien:** `El Servador/god_kaiser_server/src/api/v1/sensors.py`

---

### ISSUE-SI7-E: Zeitfenster-Eingabe input[type=time]
**Priorität:** Medium  
**Titel:** `fix(frontend): RuleConfigPanel Zeitfenster-Eingabe input[type=number] → input[type=time]`

**Befund:** `RuleConfigPanel.vue:524–563` nutzt `<input type="number">` für `startHour`, `startMinute`, `endHour`, `endMinute`. Kein nativer Zeitpicker. Eingabefehler möglich (Stunde > 23, Minute > 59).

**Schritt:** `<input type="time">` für Start/End ersetzen. Splitten nach `:` für `hour`/`minute`-Felder. Mitternachts-Wraparound (22:00 → 06:00) als Hinweistext.

---

### ISSUE-SI7-F: PendingConfigBanner Offline-Rule Differenzierung
**Priorität:** Low  
**Titel:** `feat(frontend): PendingConfigBanner — optionale Offline-Rule Push-Differenzierung`

**Befund:** `PendingConfigBanner.vue` trackt alle `config_keys` generisch. Kein Unterschied zwischen reinem Sensor-Config-Push und einem Push der `offline_rules`-Keys enthält.

**Implementierung:** Optionaler Prop `configKeys: string[]`. Bei `config_keys.includes('offline_rules')` → Banner-Text um "inkl. Offline-Rules" ergänzen. `handleConfigPublished` gibt `config_keys` bereits ans Intent weiter (`actuator.store.ts:1122`).

---

### ISSUE-SI7-G: Manueller Config-Push-Endpoint (Architektur-Gate)
**Priorität:** Low — TM-Entscheidung erforderlich  
**Titel:** `feat(server): POST /api/v1/esp/{esp_id}/push_config — manueller Push (Architektur-Gate)`

**Befund:** `esp.py:733` Kommentar: "Ein manueller Config-Push-Endpoint existiert nicht." Die Architektur sieht explizit keinen manuellen Push vor. `PendingConfigBanner` hat nur einen "Erneut senden"-Button der über `ActuatorStore` einen CRUD-Trigger simuliert.

**TM-Entscheidung:** Entweder Architektur-Entscheid beibehalten (und "Erneut senden" über bestehende CRUD-Ops lösen) oder `POST /api/v1/esp/{esp_id}/push_config` als Operator-only-Aktion einführen.

---

## Zusammenfassung

| Issue-ID | Titel (kurz) | Priorität | Parent | Typ |
|---|---|---|---|---|
| AUT-259 | Heartbeat-Schwellen 90/210 → 70/120 | Urgent | AUT-245 | fix ✅ erstellt |
| SI8-A | esp_diagnostics WS verdrahten | Urgent | AUT-245 | fix |
| SI6-A | sensor_diff Canvas-Template | High | AUT-243 | fix |
| SI7-A | offline_rules_preview Endpoint | High | AUT-244 | feat/server |
| SI7-B | Slot-Anzeige X/8 Frontend | High | AUT-244 | feat (blocked by SI7-A) |
| SI7-C | Konflikt-Anzeige LinkedRulesSection | High | AUT-244 | feat |
| SI6-B | useActuatorOptions Composable | High | AUT-243 | feat |
| SI6-C | rule_conflict_resolved Store-Handler | High | AUT-243 | feat |
| SI8-B | esp_heartbeat_logs Endpoint | Medium | AUT-245 | feat |
| SI8-C | Report-History Paginierung | Medium | AUT-245 | feat |
| SI7-D | alert_config_context Aggregation | Medium | AUT-244 | feat/server |
| SI7-E | Zeitfenster input[type=time] | Medium | AUT-244 | fix |
| SI6-D | Konflikt-Badge in RuleCard | Medium | AUT-243 | feat |
| SI6-E | Execution-History Zeitfilter | Medium | AUT-243 | feat |
| SI6-F | ExecutionHistoryPanel extrahieren | Medium | AUT-243 | refactor |
| SI8-D | DiagnoseTab/ReportsTab Hex→Token | Low | AUT-245 | fix |
| SI7-F | PendingConfigBanner Offline-Diff | Low | AUT-244 | feat |
| SI6-G | max_executions_per_hour UI | Low | AUT-243 | feat |
| SI6-H | useSensorOptions in RuleConfigPanel | Low | AUT-243 | refactor |
| SI6-I | diagnostics_status RuleConfigPanel | Low | AUT-243 | feat |
| SI7-G | Manueller Config-Push (TM-Gate) | Low | AUT-244 | feat/TM |
