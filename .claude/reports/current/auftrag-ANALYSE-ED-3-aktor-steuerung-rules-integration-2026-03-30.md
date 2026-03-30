# ANALYSE-ED-3 — Analysebericht: Aktor-Steuerung, Aktor-Typ & Logic-Rules-Integration

> **Erstellt:** 2026-03-30
> **Typ:** Reiner Analysebericht (kein Code geändert)
> **Schicht:** Frontend + Backend + Firmware
> **Scope:** C1–C5 gemäß Auftrag

---

## Executive Summary

Die Analyse deckt drei strukturelle Probleme auf, die aber unterschiedlich weit fortgeschritten sind:

1. **C1 Aktor-Steuerungskette:** VOLLSTÄNDIG implementiert. `ActuatorCardWidget` im Custom-Dashboard hat bereits einen Toggle. MonitorView hat bereits `sendActuatorCommand`. Einzige Lücke: `ActuatorCard` im `mode='monitor'` ist read-only by design. PWM-Slider existiert in `ActuatorConfigPanel`.

2. **C2 Aktor-Typ-System:** Zweiteilung `hardware_type` / `actuator_type` ist in der DB korrekt modelliert. Firmware-Code beweist: relay/pump/valve sind technisch identisch (alle → `PumpActuator`). Frontend-Labels nutzen bereits `hardware_type` als ersten Lookup. F-V4-02 Mismatch (actuator_states mit alten Typ-Werten) hat eine Alembic-Migration.

3. **C3–C5 Rule-Integration:** Breites Fundament existiert (`LinkedRulesSection`, logic.store, connections computed, WS-Events). Lücken: kein Rule-Dashboard-Widget, `issued_by` im RuntimeWidget ungenutzt (Brücke zu Logic fehlt), kein API-Filter "Executions für Aktor X".

---

## C1 — Aktor-Steuerungskette

### C1.1 Backend Aktor-Command-API

**Endpoint:** `POST /v1/actuators/{esp_id}/{gpio}/command`

**Auth-Level:** `OperatorUser` (kein einfacher `ActiveUser`) — d.h. nur Operator+Admin darf schalten.

**Command-Body:**
```json
{ "command": "ON" | "OFF" | "PWM" | "TOGGLE", "value": 0.0–1.0, "duration": int }
```

**Online-Guard:** Explizit implementiert in [actuators.py:712](El%20Servador/god_kaiser_server/src/api/v1/actuators.py#L712):
```python
if not esp_device.is_online:
    raise DeviceOfflineError(esp_id, esp_device.status)  # HTTP 409
```

**Safety-Checks:** Über `actuator_service.send_command()` → `SafetyService` (max_runtime, cooldown, emergency_stop-State, enabled-Check).

**Bestätigung (ACK):** Asynchron via MQTT:
- ESP sendet Antwort auf `kaiser/{id}/esp/{id}/actuator/{gpio}/response`
- Server verarbeitet → WS-Broadcast `actuator_response` + `actuator_status` + `actuator_command`
- Response im Endpoint: `acknowledged: false` (ACK kommt erst via WS)

**Safety_warnings:** Im Response-Schema vorhanden, aber in der Implementierung derzeit leer `[]`.

### C1.2 Frontend — Bestehende Steuerungs-Implementierung

**Überraschung: Steuerung existiert bereits in mehreren Stellen:**

| Stelle | Modus | Toggle vorhanden? | Via |
|--------|-------|-------------------|-----|
| `ActuatorCardWidget.vue:72` | Dashboard-Widget | **JA** (Power-Button) | `espStore.sendActuatorCommand()` |
| `ActuatorConfigPanel.vue:237,248` | HardwareView L3 | **JA** (Toggle + PWM-Slider) | `espStore.sendActuatorCommand()` |
| `MonitorView.vue:1552` | MonitorView | **JA** (über ActuatorCard toggle-emit) | `espStore.sendActuatorCommand()` |
| `ActuatorCard.vue:189-197` | mode≠'monitor' | **JA** ("Einschalten"-Button) | emit('toggle') |
| `ActuatorCard.vue:187-197` | **mode='monitor'** | **NEIN** | read-only by design |

**`readOnly`-Prop im Dashboard:** `useDashboardWidgets.ts:262` setzt `readOnly` für Aktor-Widgets im Monitor-Kontext (z.B. in InlineDashboardPanel auf Monitor-Seite). Im Custom Dashboard (`/dashboard`) ist `readOnly` standardmäßig `false` → Toggle funktioniert.

**`actuatorsApi.sendCommand` (api/actuators.ts:146):** Existiert und ist aktiv in Nutzung. Nicht neu schreiben nötig.

**Pinia-Store-Action:** `espStore.sendActuatorCommand(deviceId, gpio, command, value?)` in `esp.ts:1576` — unterscheidet Mock vs. Real:
- Mock → `debugApi.setActuatorState()`
- Real → `actuatorsApi.sendCommand()`

### C1.3 Feedback-Loop

Vollständiger Feedback-Loop in `actuator.store.ts`:

```
Button Click
  → espStore.sendActuatorCommand()
    → POST /actuators/{id}/{gpio}/command  (HTTP 200 = "gesendet")
      → MQTT Command (QoS 1)
        → ESP32 ausführt GPIO
          → MQTT Response
            → Server → WS "actuator_command"  → toast "gesendet"
            → Server → WS "actuator_response" → toast "bestätigt" / "fehlgeschlagen"
            → Server → WS "actuator_status"   → actuator.state aktualisiert
```

### C1.4 Fehlende Bausteine

| Fehlendes Element | Ort | Aufwand |
|-------------------|-----|---------|
| Toggle im Monitor-Modus (`mode='monitor'`) | `ActuatorCard.vue` | **XS** — eine `v-if`-Bedingung entfernen + `@toggle` Handler in MonitorView anschließen |
| Confirm-Dialog vor Schalten | beliebig | **S** — BaseModal mit "Aktor schalten?" |
| PWM-Slider im Dashboard-Widget | `ActuatorCardWidget.vue` | **M** — neuer Slider-Block, nur für PWM-Aktoren |

**Aufwand Toggle im Monitor-Modus:**
- `ActuatorCard.vue:189`: `v-if="mode !== 'monitor'"` → `v-if="mode !== 'monitor' || !readOnly"` (1 Zeile)
- Neues Prop `allowToggle?: boolean` oder `readOnly?: boolean` in ActuatorCard
- In MonitorView: `@toggle` handler bereits vorhanden (sendet bereits commands)

---

## C2 — Aktor-Typ-System

### C2.1 Backend Typ-Definition

**`actuator_configs.actuator_type`** (normalisierter Server-Typ, DB-Wert):
- Werte: `"digital"` (für pump/valve/relay), `"pwm"`, `"servo"`
- Dokumentiert in Model-Docstring: "Server-normalized actuator type"

**`actuator_configs.hardware_type`** (Original-ESP32-Typ):
- Werte: `"relay"`, `"pump"`, `"valve"`, `"pwm"`
- Optional (nullable), wird beim Konfigurieren aus dem ESP32-Payload extrahiert

**`actuator_states.actuator_type`**: Kann alte Werte wie `"relay"`, `"pump"` haben (F-V4-02 Problem) — Migration vorhanden: [normalize_actuator_type_in_states_and_history.py](El%20Servador/god_kaiser_server/alembic/versions/normalize_actuator_type_in_states_and_history.py)

### C2.2 Firmware — GPIO-Behandlung

`createDriver()` in [actuator_manager.cpp:170-185](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L170):

```cpp
PUMP  → PumpActuator   // digitalWrite ON/OFF
PWM   → PWMActuator    // analogWrite 0-255
VALVE → ValveActuator  // (vermutlich auch digitalWrite)
RELAY → PumpActuator   // Kommentar: "Relay handled like pump (binary)"
```

**BESTÄTIGT:** Relay und Pump werden durch **denselben Treiber** implementiert. Valve hat eigenen Treiber, aber höchstwahrscheinlich ebenfalls digital (binary ON/OFF). Nur PWM nutzt einen anderen Code-Pfad.

**NVS:** speichert `act_{i}_type` mit den Originaltypen (pump/valve/relay/pwm).

### C2.3 Frontend Typ-UI

`getActuatorTypeInfo()` in [labels.ts:99-117](El%20Frontend/src/utils/labels.ts#L99):
- Nutzt `hardware_type` als primären Lookup (korrekt!)
- Fallback auf `actuator_type` (dann "Digital" als Label)
- Icon-Mapping: relay=ToggleRight, pump=Waves, valve=GitBranch, pwm=Activity

**AddActuatorModal/ActuatorConfigPanel:** Bieten alle 4 Typen als gleichwertige Dropdown-Optionen.

### C2.4 Aktor-Typ-Matrix

| Typ (ESP NVS) | hardware_type (DB) | actuator_type (DB) | GPIO-Implementierung | Icon |
|---------------|--------------------|--------------------|----------------------|------|
| `pump`        | `pump`             | `digital`          | PumpActuator (digital)| Waves |
| `relay`       | `relay`            | `digital`          | **PumpActuator** (!)  | ToggleRight |
| `valve`       | `valve`            | `digital`          | ValveActuator (digital)| GitBranch |
| `pwm`         | `pwm`              | `pwm`              | PWMActuator (analog)  | Activity |

**Fazit:** Pump, Relay und Valve sind GPIO-identisch (alle digital ON/OFF). Der Unterschied ist rein semantisch/konzeptuell.

### C2.5 Fix-Empfehlung

**Empfehlung: Option B — Kosmetikfix** (kein DB-Eingriff, kein Migration-Risiko)

Änderung in AddActuatorModal und ActuatorConfigPanel:
- Dropdown zeigt statt 4 gleichwertigen Typen: **2 Hardware-Interfaces** + **Funktion**
  - Hardware: "Relais (Digital Ein/Aus)", "PWM (0-255 analog)"
  - Beim Wählen "Relais": Unterpunkt-Dropdown "Funktion": Pumpe / Ventil / Relais / Sonstige
  - Die gewählte Funktion wird als `hardware_type` gespeichert
- Kein Backend-Eingriff nötig (hardware_type ist bereits nullable in DB)
- Labels in labels.ts bereits korrekt für alle 4 hardware_types

**Aufwand: S** (1-2h Frontend-only, kein Backend-Eingriff)

---

## C3 — Logic Rules im Monitor — IST-Zustand

### C3.1 Bestehende Rule-Anzeige

**Bereits implementiert:**

| Komponente | Was | Kontext |
|------------|-----|---------|
| `ActuatorCard.vue:200-219` | Bis zu 2 verknüpfte Regeln + "+X weitere" Link → /logic | mode='monitor' |
| `ActuatorCard.vue:221-228` | Letzte Execution mit Zeitstempel + trigger_reason | mode='monitor' |
| `LinkedRulesSection.vue` | Vollständige Rule-Liste für sensor/actuator, klickbar → LogicView | HardwareView L3 (ActuatorConfigPanel, SensorConfigPanel) |
| `ZoneRulesSection.vue` | Rules-Sektion in der Zone-Ansicht | Monitor |

**logicStore Verfügbarkeit:**
- `rules[]`: alle Regeln (nach `fetchRules()`)
- `connections`: computed LogicConnection[] (sensor→actuator via `extractConnections()`)
- `getRulesForZone(zoneId)`: filtert via ESPDevice.zone_id Mapping
- `executionHistory[]`: merged REST + WS-Events
- `activeExecutions`: Map<ruleId, timestamp>

**WebSocket-Events:**
- `logic_execution`: Broadcast bei Trigger mit `rule_id, rule_name, trigger{esp_id,gpio,sensor_type,value}, action{esp_id,gpio,command}, success, timestamp`

### C3.2 Monitor L2 Zone-Detail

Rules werden in `ZoneRulesSection.vue` angezeigt. Navigation zur Regel-Bearbeitung über Link (Route `logic-rule` mit `ruleId` Param).

### C3.3 Dashboard-Widget für Rules

**IST:** Kein Rule-Status-Widget in WIDGET_TYPE_META.

**Machbarkeit:** Neues Widget `LogicRuleStatusWidget` wäre möglich mit:
- Registrierung in 4 Stellen (WIDGET_TYPE_META, Widget-Komponenten-Map, WidgetConfigPanel, Dashboard-Store)
- Zeigt: aktive Regeln, letzte Executions, Aktivierungsstatus

**Einfachere Alternative:** Bestehendes `AlarmList`-Widget um "logic_execution"-Events erweitern (Notifications vom Backend kommen bereits mit `source: "logic_engine"`).

### C3.4 Korrelation Regel ↔ Aktor ↔ Sensor

`CrossESPLogic`-Struktur:
- `trigger_conditions`: JSON mit `{type, esp_id, gpio, sensor_type, operator, value}`
- `actions`: JSON-Liste mit `[{type: "actuator_command", esp_id, gpio, command, value}]`

→ Volle Korrelation Sensor↔Regel↔Aktor ist im Backend-Datenmodell vollständig abgebildet.

`LinkedRulesSection` nutzt `logicStore.connections` (= `extractConnections(rule)` für alle Regeln). Diese filtert via `sourceEspId+sourceGpio` (Sensor) oder `targetEspId+targetGpio` (Aktor).

**Bekanntes Problem (N6):** `extractSensorConditions()` in logic.ts behandelt Hysterese-Conditions mit einer vereinfachten SensorCondition-Projection (operator='>', value=activate_above). Das ist für die LinkedRulesSection ausreichend (ESP-ID + GPIO stimmt), aber für präzise Condition-Anzeige suboptimal.

---

## C4 — ActuatorRuntime-Widget & Rule-Verknüpfung

### C4.1 IST-Zustand

`ActuatorRuntimeWidget.vue` zeigt:
- Aktiven Status + KPIs (Laufzeit, Duty Cycle, Zyklen, Avg-Zyklus)
- Gantt-Timeline aus `ActuatorHistoryEntry[]`
- Datenquelle: `GET /actuators/{esp_id}/{gpio}/history?include_aggregation=true`

### C4.2 Daten-Brücke zu Logic

`ActuatorHistoryEntry.issued_by` (Backend-Feld, in Frontend-Interface definiert):
```typescript
issued_by: string | null  // Werte: "user:username", "logic:RULE_UUID", "system"
```

**Diese Information wird im Widget NICHT gerendert.** Die Gantt-Balken zeigen nur ON/OFF/Error/Emergency — kein `issued_by`.

**Verbindung Laufzeit ↔ Rule:**
- `actuator_history.issued_by = "logic:{rule_id}"` → direkte Verknüpfung
- Im Widget: `entry.issued_by` in `historyEntries.value` vorhanden, aber nicht ausgewertet

### C4.3 P8-A6 Überschneidung

P8-A6 (Aktor-Analytics, 3 Phasen) überschneidet sich mit C4:
- **Phase B (Timeline):** Kann `issued_by`-Annotationen als Tooltips zeigen → "Ausgelöst durch Regel: {rule_name}"
- Aufwand: chartjs tooltip-Callback erweitern + `logicStore.getRuleById(uuid)` Lookup

### C4.4 Fehlende Verbindung

Es gibt **keinen API-Endpoint** der "alle Executions die Aktor X betreffen" zurückgibt. Client-seitig wäre ein Filter über `executionHistory.actions_executed[].esp_id + gpio` möglich, aber nicht implementiert.

---

## C5 — Execution History

### C5.1 API-Endpunkte

| Endpoint | Vorhanden? | Filtert nach |
|----------|-----------|--------------|
| `GET /v1/logic/execution_history` | **JA** | Allgemein, `rule_id` Query-Parameter vermutlich möglich |
| `GET /v1/logic/rules/{id}/executions` | **NEIN** | Dedizierter Per-Rule-Endpoint fehlt |
| `GET /v1/logic/execution_history?actuator_gpio=X&actuator_esp_id=Y` | **NEIN** | Aktor-basierter Filter fehlt |
| `GET /v1/logic/execution_history?sensor_gpio=X&sensor_esp_id=Y` | **NEIN** | Sensor-basierter Filter fehlt |

### C5.2 ExecutionHistoryItem (Frontend-Type)

```typescript
interface ExecutionHistoryItem {
  id, rule_id, rule_name,
  triggered_at, trigger_reason,
  actions_executed: Record<string, unknown>[]  // enthält actuator esp_id + gpio
  success, error_message, execution_time_ms
}
```

→ `actions_executed` enthält Aktor-Referenzen, aber als untypisiertes JSON. Client-seitige Filterung nach Aktor ist technisch machbar, aber nicht optimiert.

### C5.3 Machbarkeit "Letzte 5 Executions für Aktor X"

**Option A — Client-seitig (kein Backend-Eingriff):**
```typescript
// In logic.store oder in Komponente
function getExecutionsForActuator(espId: string, gpio: number): ExecutionHistoryItem[] {
  return executionHistory.value.filter(e =>
    (e.actions_executed as any[]).some(a => a.esp_id === espId && a.gpio === gpio)
  )
}
```
Aufwand: **XS** — Client-Filter genügt für "Letzte 5".

**Option B — Backend-Filter (sauberer):**
Neuer Query-Parameter `actuator_esp_id` + `actuator_gpio` in `/v1/logic/execution_history`.
Aufwand: **S** — SQLAlchemy JSON-Feld-Filter (`logic_execution_history.actions_executed @> [{"esp_id": x, "gpio": y}]` in PostgreSQL).

---

## Gesamt-Findings & Fix-Empfehlungen

### Finding C1-F1: Toggle im Monitor-Modus fehlt

| Attribut | Wert |
|----------|------|
| Severity | **MEDIUM** — UX-Lücke, Workaround: HardwareView oder Custom Dashboard |
| Datei | [ActuatorCard.vue:189](El%20Frontend/src/components/devices/ActuatorCard.vue#L189) |
| Fix | `v-if="mode !== 'monitor'"` → `v-if="mode !== 'monitor' || allowToggle"` + neues `allowToggle?: boolean` Prop |
| Aufwand | **XS** (1-2 Zeilen) |

### Finding C1-F2: PWM-Slider fehlt im Dashboard-Widget

| Attribut | Wert |
|----------|------|
| Severity | **LOW** — nur relevant für PWM-Aktoren |
| Datei | [ActuatorCardWidget.vue](El%20Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue) |
| Fix | Slider (0-100%) für `actuator_type === 'pwm'`, ruft `sendActuatorCommand('PWM', value)` |
| Aufwand | **S** (2-3h, inkl. CSS) |

### Finding C2-F1: Aktor-Typ-Konfusion in AddActuatorModal

| Attribut | Wert |
|----------|------|
| Severity | **MEDIUM** — UX-Verwirrung für neue User |
| Datei | AddActuatorModal.vue, ActuatorConfigPanel.vue |
| Fix | Option B: 2-stufige Auswahl (Interface + Funktion), kein DB-Eingriff |
| Aufwand | **S** (2-3h Frontend-only) |

### Finding C2-F2: F-V4-02 Mismatch actuator_states

| Attribut | Wert |
|----------|------|
| Severity | **MEDIUM** — verursacht falsche Icons/Labels für historische States |
| Datei | [normalize_actuator_type_in_states_and_history.py](El%20Servador/god_kaiser_server/alembic/versions/normalize_actuator_type_in_states_and_history.py) |
| Fix | Migration ausführen: `alembic upgrade head` |
| Aufwand | **XS** (Migration existiert bereits) |

### Finding C3-F1: Kein Rule-Status-Dashboard-Widget

| Attribut | Wert |
|----------|------|
| Severity | **LOW** — kein Blocker |
| Beschreibung | Kein `LogicRuleStatusWidget` in WIDGET_TYPE_META |
| Fix | Neue Widget-Komponente (4 Registrierungspunkte) oder AlarmList um logic_execution erweitern |
| Aufwand | **M** (4-6h für neues Widget) / **S** für AlarmList-Erweiterung |

### Finding C4-F1: issued_by in RuntimeWidget ungenutzt

| Attribut | Wert |
|----------|------|
| Severity | **LOW** — fehlendes Feature, kein Bug |
| Datei | [ActuatorRuntimeWidget.vue](El%20Frontend/src/components/dashboard-widgets/ActuatorRuntimeWidget.vue) |
| Fix | Tooltip im Gantt-Chart erweitern: `entry.issued_by` auswerten, Rule-Name via logicStore.getRuleById() |
| Aufwand | **S** (2-3h) |

### Finding C5-F1: Kein Aktor-basierter Execution-Filter

| Attribut | Wert |
|----------|------|
| Severity | **LOW** — Client-seitiger Workaround ausreichend |
| Fix | Logic.store-Getter `getExecutionsForActuator(espId, gpio)` hinzufügen |
| Aufwand | **XS** (5-10 Zeilen im Store) |

---

## Daten-Verfügbarkeit (Zusammenfassung)

| Datenpunkt | Frontend-Store | API | WebSocket |
|------------|---------------|-----|-----------|
| Rule-Liste | `logicStore.rules[]` | `GET /v1/logic/rules` | — |
| Rule-Connections (Sensor→Aktor) | `logicStore.connections` (computed) | — | — |
| Rules pro Zone | `logicStore.getRulesForZone()` | — | — |
| Rules für Sensor | `LinkedRulesSection` (via connections) | `GET /v1/logic/rules?sensor_esp_id=X` | — |
| Rules für Aktor | `LinkedRulesSection` (via connections) | `GET /v1/logic/rules?actuator_esp_id=X` | — |
| Letzte Execution | `logicStore.executionHistory[]` | `GET /v1/logic/execution_history` | `logic_execution` Event |
| Execution für Aktor | ❌ kein Getter | ❌ kein Filter-Endpoint | partial via logic_execution.action |
| Laufzeit-History | ActuatorRuntimeWidget (lokal) | `GET /actuators/{id}/{gpio}/history` | — |
| issued_by in History | ✅ im Typ | ✅ in DB | — |

---

## Prioritäts-Ranking (Implementation-Reihenfolge)

| Prio | Finding | Effort | Impact |
|------|---------|--------|--------|
| 1 | C1-F1: Toggle im Monitor | XS | Direkte UX-Verbesserung |
| 2 | C2-F2: F-V4-02 Migration ausführen | XS | Korrekte Icon-Anzeige |
| 3 | C2-F1: AddActuatorModal UX | S | Weniger Verwirrung für neue User |
| 4 | C5-F1: getExecutionsForActuator Getter | XS | Basis für kontextuelle Anzeige |
| 5 | C4-F1: issued_by in Timeline | S | Analytics-Kontext |
| 6 | C1-F2: PWM-Slider im Widget | S | Nur für PWM-Aktoren relevant |
| 7 | C3-F1: Rule-Status-Widget | M | Nice-to-have Dashboard-Feature |

---

## Relevante Datei-Referenzen

| Datei | Funktion |
|-------|----------|
| [actuators.py:655](El%20Servador/god_kaiser_server/src/api/v1/actuators.py#L655) | Command-Endpoint |
| [actuators.py:712](El%20Servador/god_kaiser_server/src/api/v1/actuators.py#L712) | Online-Guard |
| [actuator.py:76-87](El%20Servador/god_kaiser_server/src/db/models/actuator.py#L76) | actuator_type + hardware_type Felder |
| [actuator_manager.cpp:170-184](El%20Trabajante/src/services/actuator/actuator_manager.cpp#L170) | createDriver (relay→PumpActuator) |
| [esp.ts:1576](El%20Frontend/src/stores/esp.ts#L1576) | sendActuatorCommand (zentrale Action) |
| [ActuatorCardWidget.vue:72](El%20Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue#L72) | Dashboard-Toggle bereits vorhanden |
| [ActuatorCard.vue:189](El%20Frontend/src/components/devices/ActuatorCard.vue#L189) | Monitor-Modus read-only (Lücke) |
| [LinkedRulesSection.vue:24-31](El%20Frontend/src/components/devices/LinkedRulesSection.vue#L24) | Rule-Filter via connections |
| [logic.ts:304-326](El%20Frontend/src/types/logic.ts#L304) | extractSensorConditions (N6-Problem) |
| [logic.store.ts:94](El%20Frontend/src/shared/stores/logic.store.ts#L94) | connections computed |
| [ActuatorRuntimeWidget.vue:44-55](El%20Frontend/src/components/dashboard-widgets/ActuatorRuntimeWidget.vue#L44) | issued_by Feld nicht genutzt |
