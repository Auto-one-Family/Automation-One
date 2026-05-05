# SI-6 Logic Engine View — Analyse & Konsolidierung

**Stand:** 2026-05-06  
**Scope:** AUT-243 — LogicEngineView Konsolidierung  
**Verfasser:** meta-analyst  
**Branch:** auto-debugger/work

---

## 1. Inventar-Tabelle

| Komponente | Pfad | Zeilen | Zweck | Status |
|---|---|---|---|---|
| `LogicView.vue` | `El Frontend/src/views/LogicView.vue` | 2241 | Haupt-View: Toolbar, Editor-Layout, Execution History, Degraded-Banner, Templates-Sektion | vorhanden |
| `RuleFlowEditor.vue` | `El Frontend/src/components/rules/RuleFlowEditor.vue` | 2049 | Vue-Flow-Canvas: Custom-Nodes, Drag-Drop, Undo/Redo, rule↔graph-Konvertierung, Live-Execution-Flash | vorhanden |
| `RuleNodePalette.vue` | `El Frontend/src/components/rules/RuleNodePalette.vue` | 617 | Linke Sidebar: Draggable Bausteine, kollabierbare Kategorien, Suchfilter | vorhanden |
| `RuleConfigPanel.vue` | `El Frontend/src/components/rules/RuleConfigPanel.vue` | ~450 (abgeschnitten) | Rechte Sidebar: Dynamische Node-Konfiguration je Typ | vorhanden |
| `RuleCard.vue` | `El Frontend/src/components/rules/RuleCard.vue` | 466 | Landing-State-Karte: Status-Dot, Flow-Badges, Lifecycle-Badge, Execute-Counter | vorhanden |
| `RuleTemplateCard.vue` | `El Frontend/src/components/rules/RuleTemplateCard.vue` | — | Template-Auswahl-Karte im Landing-State | vorhanden |
| `RuleCardCompact.vue` | `El Frontend/src/components/logic/RuleCardCompact.vue` | 938 | Monitor-Karte: Quick-Toggle, Quick-Edit, ON/OFF-History, Lifecycle-Badge | vorhanden |
| `LogicEngineView.vue` (dediziert) | — | — | Dedizierte View für Logic Engine (kein separates File außer `LogicView.vue`) | n/a — LogicView ist die View |
| Execution-History-Komponente (eigenständig) | — | — | Wiederverwendbare History-Komponente | **fehlt** (inline in LogicView) |
| Konflikt-UI-Komponente | — | — | Standalone-UI für Konflikt-Arbitrationen | **fehlt** |

**Anmerkung zur View-Struktur:** Es existiert keine separate `LogicEngineView.vue`. Die Route `/logic/:ruleId` wird durch `LogicView.vue` bedient, die gleichzeitig Landing-State, Editor-Layout und History-Panel enthält. Das ist die kanonische View.

---

## 2. Composable-Kanon

### Vorhanden

| Composable | Pfad | Zweck | Nutzung in Logic |
|---|---|---|---|
| `useSensorOptions` | `El Frontend/src/composables/useSensorOptions.ts` | Zone→Subzone→Sensor-Gruppierung für Dropdowns, `SensorOption`-Typ mit `espId`/`gpio`/`configId` | Derzeit **nicht** in `RuleConfigPanel.vue` verwendet — Panel löst Sensor-Auswahl direkt via `espStore.devices` |
| `useRuleLifecycleBadge` | `El Frontend/src/composables/useRuleLifecycleBadge.ts` | Badge-Label + Variant + Pulsing für Lifecycle-State | Genutzt in `RuleCard`, `RuleCardCompact` |
| `useActuatorHistory` | `El Frontend/src/composables/useActuatorHistory.ts` | Aktor-History | Vorhanden, aber nicht in Logic-View-Kontext genutzt |

### Fehlt

| Composable | Warum nötig | Follow-up |
|---|---|---|
| `useActuatorOptions` | Kein Pendant zu `useSensorOptions` für Aktoren. `RuleConfigPanel` löst Aktor-Auswahl (ESP + GPIO) direkt über `espStore.devices` ohne Abstraktion oder Zone-Gruppierung. Bei komplexen Anlagen wird die ESP-Liste unübersichtlich. | Follow-up Issue: `useActuatorOptions` — Aktor-Picker mit Zone-Gruppierung analog zu `useSensorOptions` |
| `useLogicRuleValidation` | Validierungslogik ist über `ruleValidationMapper.ts` (Utils) und inline in `LogicView.saveRule()` verteilt. Kein reaktives Composable, das Validation-State kapselt. | Follow-up Issue: Composable für Rule-Validierungsstate |

**Klarstellung:** `useSensorOptions` ist in `LogicView`/`RuleConfigPanel` **nicht aktiv eingebunden**. Der Panel nutzt `espStore.devices` direkt und iteriert Sensoren ohne Zone-Gruppierung. Das ist eine bekannte Inkonsistenz.

---

## 3. Rule-Editor-Spezifikation (Konzept)

Aus AUT-243-Anforderungen und Code-Evidenz sind folgende Felder für `cross_esp_logic` konfigurierbar:

### Regel-Metadaten (Toolbar-Ebene in LogicView)

| Feld | Typ | Aktuell konfigurierbar | Anmerkung |
|---|---|---|---|
| `name` | `string` | ja | Pflicht, Toolbar-Input |
| `description` | `string` | ja | Optional, Toolbar-Input |
| `priority` | `int` (1–100) | ja | Toolbar, numerisches Input |
| `cooldown_seconds` | `int` (≥0) | ja | Toolbar, numerisches Input |
| `is_critical` | `bool` | ja | Toggle-Button in Toolbar |
| `escalation_policy` | `JSON` | ja | Raw-JSON-Input, sichtbar nur wenn `is_critical=true` |
| `enabled` | `bool` | ja | Eye-Toggle in Toolbar |
| `max_executions_per_hour` | `int` | **nein** | Im Server-Schema vorhanden (`CrossESPLogic.max_executions_per_hour`), kein UI-Feld |
| `logic_operator` | `AND`/`OR` | ja | Über Logic-Node im Canvas |

### Bedingungen (Node-Typen im Canvas)

| Node-Typ | Konfigurierbare Felder | Status |
|---|---|---|
| `sensor` | `espId`, `gpio`, `sensorType`, `operator` (`>/<=/between/hysteresis`), `value`, `min`, `max`, Hysterese-Felder | implementiert |
| `time` | `startHour`, `startMinute`, `endHour`, `endMinute`, `daysOfWeek` | implementiert |
| `diagnostics_status` | `checkName`, `expectedStatus`, `operator` | implementiert |
| `sensor_diff` | `sensor_a_uuid`, `sensor_b_uuid`, `operator`, `threshold`, `consecutive_count` | in Palette definiert, aber **kein Canvas-Node-Template** in RuleFlowEditor |
| `hysteresis` | via sensor-Node mit `operator: 'hysteresis'` und `activateAbove`/`deactivateBelow` etc. | implementiert |

### Aktionen (Node-Typen im Canvas)

| Node-Typ | Konfigurierbare Felder | Status |
|---|---|---|
| `actuator` | `espId`, `gpio`, `command` (ON/OFF/PWM/TOGGLE), `pwmValue` (0–100%), `duration` (s) | implementiert |
| `notification` | `channel` (email/webhook/websocket), `target`, `messageTemplate` | implementiert |
| `delay` | `seconds` | implementiert |
| `plugin` | `pluginId`, dynamische `config`-Felder aus Plugin-Schema | implementiert |
| `run_diagnostic` | `checkName` | implementiert |

**Gap:** `sensor_diff`-Node ist in `RuleNodePalette.vue` als draggbares Item vorhanden (Zeile 133–139), aber `RuleFlowEditor.vue` besitzt kein `#node-sensor_diff`-Template. Der Node würde nach einem Drop als leerer Knoten erscheinen.

---

## 4. Execution-History-Anforderungen — IST vs. SOLL

### IST (aus `LogicView.vue` + `logic.store.ts`)

| Merkmal | IST-Zustand |
|---|---|
| Trigger | Button in Toolbar, lädt lazy beim ersten Öffnen |
| Darstellung | Collapsible Bottom-Panel (max-height 260px) in `LogicView.vue`, inline, keine eigene Komponente |
| Datenquelle | REST `GET /v1/logic/execution_history` (limit 50) + WebSocket `logic_execution`-Events (live-merge) |
| Filter | Regel-Filter (Select), Status-Filter (Erfolg/Fehler), Reason-Code-Filter (aus `lifecycleByReasonCode`) |
| Detail-Ansicht | Expandable per Click: error_message, terminal_reason_code, terminal_reason_text |
| Zeitraum | Default: letzte 7 Tage (Server-seitig, `start_time = now - 7d`) |
| Pagination | Keine clientseitige Pagination; Store hält max. 50 Einträge |
| Zeitfilter UI | **fehlt** — kein Datepicker für start_time/end_time, obwohl Server-Endpoint diese Query-Parameter unterstützt |
| Aktor-Filter | **fehlt** — kein Filter nach GPIO/ESP |
| Export | **fehlt** |

### SOLL (Anforderungen aus AUT-243-Kontext)

| Anforderung | Begründung |
|---|---|
| Zeitbereich-Filter (start/end) | Server-Endpoint unterstützt es bereits; UI-seitig fehlt der Datepicker |
| Aktor-Filter (ESP + GPIO) | Operator will "Alle Ausführungen für Ventil X" sehen |
| Pagination oder "Lade mehr" | 50 Einträge reichen bei aktiven Anlagen nicht |
| Eigenständige Komponente `ExecutionHistoryPanel.vue` | Derzeit 200+ Zeilen inline in LogicView; Wiederverwendung in MonitorView möglich |
| Zone-Filter | Konsistenz mit Zone-zentrischem UI-Konzept |

---

## 5. Kanonische Entscheidungen

### Was ist heute kanonisch

| Bereich | Kanonische Lösung | Belegt in |
|---|---|---|
| Logic-Engine-View | `LogicView.vue` unter Route `/logic` und `/logic/:ruleId` | `El Frontend/src/views/LogicView.vue` |
| Pinia Store für Logic | `useLogicStore` in `El Frontend/src/shared/stores/logic.store.ts` | Store mit ~1200 Zeilen, vollständig implementiert |
| WS-Event für Execution-Updates | `logic_execution` → `handleLogicExecutionEvent()` im Store | `logic.store.ts` Zeile 688 |
| Konflikt-WS-Event | `conflict.arbitration` → `handleConflictArbitrationEvent()` | `logic.store.ts` Zeile 833 |
| Degraded-State | WS-Events `rule_degraded` / `rule_recovered` → `rule.degraded_since` / `rule.degraded_reason` | `logic.store.ts` Zeile 894–927 |
| Undo/Redo | Command-Pattern im Store (`pushToHistory`, `undo`, `redo`, max 50 Schritte) | `logic.store.ts` ab Zeile 1003 |
| Verbindungsvalidierung | `isValidConnection()` im Store | `logic.store.ts` Zeile 1093 |
| Hysterese-Nodes | Über `sensor`-Node mit `operator: 'hysteresis'`; `LogicHysteresisState` serverseits in `cross_esp_logic`/`logic_execution_history` | `RuleFlowEditor.vue` Zeile 447–469; `logic.py` |
| DB-Tabelle | `cross_esp_logic` (NICHT `logic_rules`) | `El Servador/god_kaiser_server/src/db/models/logic.py` Zeile 52 |
| Execution-History-Tabelle | `logic_execution_history` (via `logic_repo.get_execution_history()`) | `El Servador/god_kaiser_server/src/api/v1/logic.py` Zeile 700 |
| AUT-111 is_critical + Degraded | Server-seitig implementiert: `is_critical`, `escalation_policy`, `degraded_since`, `degraded_reason` Felder in `CrossESPLogic`; UI: Critical-Toggle + Degraded-Banner in LogicView | `logic.py` Zeile 82–87 |

### Was fehlt / nicht kanonisch

| Lücke | Bewertung |
|---|---|
| `sensor_diff`-Node: Palette-Eintrag ohne Canvas-Template | Node-Typ nicht implementiert (nur Palette-Placeholder) |
| `max_executions_per_hour` in UI | Server-Feld vorhanden, kein UI-Eingabefeld |
| Eigenständige Execution-History-Komponente | Inline in LogicView, kein Reuse möglich |
| `useActuatorOptions` Composable | Fehlt vollständig |
| `useSensorOptions` in RuleConfigPanel | Vorhanden, aber nicht angebunden (Panel nutzt espStore direkt) |
| Konflikt-UI | `recentConflictArbitrations` im Store vorhanden, aber keine dedizierte UI-Komponente; wird aktuell nur im Alert-Center über AUT-131 gehandelt |

---

## 6. ABGRENZUNG: Logic Engine (SI-6) vs. Offline-Rules (SI-7)

Diese Abgrenzung ist kritisch. Beide Konzepte dürfen in keiner View verwechselt oder gemischt werden.

| Dimension | Logic Engine (SI-6 / LogicView) | Offline-Rules (SI-7 / AlertConfigView) |
|---|---|---|
| Ausführungsort | Server (`logic_engine.py`) | ESP32-lokal (NVS-Blob) |
| DB-Tabelle | `cross_esp_logic` | Kein eigener DB-Eintrag; Blob in `device_metadata.simulation_config` oder NVS |
| Cross-ESP | Ja — Sensordaten von ESP-A können Aktor auf ESP-B steuern | Nein — Sensor und Aktor müssen auf demselben ESP32 sein |
| Max. Regelanzahl | Unbegrenzt (DB) | Max. 8 pro ESP32 (NVS-Limit) |
| Netzwerk-Abhängigkeit | Regel feuert nicht wenn Server offline | Regel feuert auch ohne Netzwerk / Server-Verbindung |
| UI | `LogicView.vue` + `RuleFlowEditor` | SI-7 `AlertConfigView` (noch nicht konsolidiert) |
| Hysterese | `LogicHysteresisState` serverseits | ESP-lokal (Embedded-Logik im Firmware-Handler) |
| Konflikterkennung | `ConflictManager` (server-seitig, `conflict_manager.py`) | Keine — ESP führt aus ohne Koordination |
| WS-Event | `logic_execution`, `conflict.arbitration`, `rule_degraded` | Kein eigenes Event (Sensor-Data als Indikator) |
| Typischer Anwendungsfall | "Wenn pH-Sensor auf ESP-A > 7.0 UND Uhrzeit zwischen 08:00–18:00, dann Pumpe auf ESP-B an" | "Wenn Temperatur > 35°C, dann lokalen Lüfter an (auch ohne WLAN)" |

**Regel:** Offline-Rules (ESP-NVS) werden in SI-6/LogicView **nicht** konfiguriert. Sie erscheinen in LogicView allenfalls als read-only Hinweis ("Gerät hat 3 lokale Rules"). Die vollständige Konfiguration gehört in SI-7.

---

## 7. Server-Touchpoints-Tabelle

### REST-Endpunkte (`El Servador/god_kaiser_server/src/api/v1/logic.py`)

| Endpoint | Method | Status | Beschreibung |
|---|---|---|---|
| `/v1/logic/rules` | GET | vorhanden | Liste aller Regeln, paginiert, `?enabled=bool` |
| `/v1/logic/rules` | POST | vorhanden | Regel erstellen (`OperatorUser` erforderlich) |
| `/v1/logic/rules/{rule_id}` | GET | vorhanden | Einzelregel abrufen |
| `/v1/logic/rules/{rule_id}` | PUT | vorhanden | Regel aktualisieren |
| `/v1/logic/rules/{rule_id}` | DELETE | vorhanden | Löschen + OFF-Command an betroffene Aktoren + Hysterese-Reset + Conflict-Lock-Release |
| `/v1/logic/rules/{rule_id}/toggle` | POST | vorhanden | Enable/Disable; bei Disable: OFF-Command + Conflict-Lock-Release |
| `/v1/logic/rules/{rule_id}/test` | POST | vorhanden | Dry-Run-Simulation, liefert `would_trigger` |
| `/v1/logic/execution_history` | GET | vorhanden | History mit `?rule_id`, `?success`, `?start_time`, `?end_time`, `?limit` |
| `/v1/logic/degraded` | GET | vorhanden | Nur degradierte Regeln, `?critical_only=bool` |
| `/v1/logic/templates` | GET | vorhanden | Server-seitige Template-Liste |
| `/v1/logic/templates/{id}` | GET | vorhanden | Template-Details |
| `/v1/logic/templates/{id}/instantiate` | POST | vorhanden | Template instanziieren → Regel erstellen |
| `logic_validation.py` | n/a | vorhanden | Pydantic-Validierungsmodelle: `SensorThresholdCondition`, `TimeWindowCondition` etc. |

### WebSocket-Events (Server → Client)

| Event-Typ | Status | Handler im Store |
|---|---|---|
| `logic_execution` | vorhanden | `handleLogicExecutionEvent()` |
| `conflict.arbitration` | vorhanden | `handleConflictArbitrationEvent()` |
| `rule_degraded` | vorhanden | `handleRuleDegradedEvent()` |
| `rule_recovered` | vorhanden | `handleRuleRecoveredEvent()` |
| `sequence_started` / `sequence_step` / `sequence_completed` / `sequence_error` / `sequence_cancelled` | vorhanden | `handleSequenceEvent()` |
| `rule_conflict_resolved` (AUT-114 Telemetry) | vorhanden (Server broadcastet) | **nicht** im Store abonniert — nur `conflict.arbitration` wird verarbeitet |

### Nicht vorhandene Endpunkte (Fehlende SOLL-Punkte)

| Endpoint | Begründung | Priorität |
|---|---|---|
| `GET /v1/logic/execution_history` mit Pagination (page/page_size) | Aktuell nur `limit`-Parameter, kein cursor/offset-Pagination | Medium |
| `GET /v1/logic/rules/{id}/conflicts` | Aktuelle Konflikte für eine Regel abrufen | Low |
| `GET /v1/logic/conflict_history` | Conflict-Manager hält `_conflict_history` im RAM, kein REST-Endpoint | Low |

---

## 8. Follow-up-Vorschläge

Die folgenden Punkte sind **keine Implementierungsaufträge**, sondern Issue-Kandidaten für Linear.

| # | Titel | Typ | Begründung |
|---|---|---|---|
| FU-1 | `sensor_diff`-Node: Canvas-Template in `RuleFlowEditor.vue` implementieren | Bug/Feature | Node ist in Palette definiert (Zeile 133 `RuleNodePalette.vue`), aber kein `#node-sensor_diff`-Template in `RuleFlowEditor.vue`. Nach Drop entsteht ein leerer Node ohne Handles. |
| FU-2 | `max_executions_per_hour`-Feld in Toolbar-Metadaten ergänzen | Feature | Server-Feld vorhanden in `CrossESPLogic`; UI fehlt. Wichtig für Rate-Limiting produktiver Regeln. |
| FU-3 | `ExecutionHistoryPanel.vue` als eigenständige Komponente extrahieren | Refactoring | ~200 Zeilen inline in `LogicView.vue`; potentiell wiederverwendbar in `MonitorView`. Zeitbereich-Filter (start/end Datepicker) einfacher einzubauen wenn eigenständig. |
| FU-4 | `useActuatorOptions` Composable erstellen | Feature | Pendant zu `useSensorOptions`; Zone-Gruppierung für Aktor-Picker in `RuleConfigPanel` (sensor-Node `espId`/`gpio` und actuator-Node `espId`/`gpio` aktuell ungruppiert über `espStore.devices`). |
| FU-5 | `useSensorOptions` in `RuleConfigPanel` anbinden | Refactoring | Composable existiert, wird aber in `RuleConfigPanel.vue` nicht genutzt. Sensor-Auswahl direkt über `espStore.devices` ohne Zone-Gruppierung. |
| FU-6 | Konflikt-Arbitrations-UI in LogicView integrieren | Feature | `recentConflictArbitrations` im Store vorhanden. Derzeit keine Anzeige in LogicView (nur über Alert-Center AUT-131). Ein Konflikt-Badge pro RuleCard wäre wertvoll. |
| FU-7 | `rule_conflict_resolved`-WS-Event im Store abonnieren | Feature | Server broadcastet `rule_conflict_resolved` (AUT-114 Telemetry); Store subscribt nur `conflict.arbitration`. Telemetry-Event ungenutzt. |
| FU-8 | Execution-History: Zeitbereich-Filter (Datepicker) + Aktor-Filter | Feature | Server-Endpoint unterstützt `?start_time` / `?end_time` bereits. UI bietet nur Regel/Status/ReasonCode-Filter. |
| FU-9 | `RuleConfigPanel` für `diagnostics_status`/`run_diagnostic` vervollständigen | Feature | RuleFlowEditor-Template vorhanden; RuleConfigPanel-Abschnitt muss noch auf Vollständigkeit geprüft werden. |

---

## Anhang: Datei-Referenzen

- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\views\LogicView.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\rules\RuleFlowEditor.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\rules\RuleNodePalette.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\rules\RuleConfigPanel.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\rules\RuleCard.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\components\logic\RuleCardCompact.vue`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\shared\stores\logic.store.ts`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\composables\useSensorOptions.ts`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\api\v1\logic.py`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\db\models\logic.py`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\db\models\logic_validation.py`
- `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\src\services\logic\safety\conflict_manager.py`
