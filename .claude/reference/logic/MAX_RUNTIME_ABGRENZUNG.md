# Max Runtime — Rule vs. Device: Abgrenzung und Datenfluss

> **Version:** 1.0 | **Datum:** 2026-03-11  
> **Bezug:** T18-F6, T18-V5-ABSCHLUSSBERICHT §1.5, T18-V6-LOGIC-ENGINE-VOLLANALYSE F6

---

## Kurzfassung

Es gibt **zwei getrennte Mechanismen** für Laufzeitbegrenzung:

| Konzept | Ort | Feld | Wirkung |
|---------|-----|------|---------|
| **Rule duration** | RuleConfigPanel (Aktor-Node) | `duration_seconds` / `duration` | Pro Command im MQTT-Payload → ESP Auto-Off nach N Sekunden |
| **Device max_runtime** | ActuatorConfigPanel (Hardware) | `max_runtime_seconds` | DB + Server; **nicht** im Command-Payload; ESP nutzt Default |

**Prioritätslogik:** Wenn beide gesetzt sind (z.B. Rule duration=15, Device max_runtime=3600), gilt **immer die Rule duration** im MQTT-Payload. Der ESP schaltet nach 15 s ab. Es gibt **keinen Merge** und **keinen Fallback** von Rule auf Device.

---

## 1. Rule duration (Auto-Abschaltung pro Aktion)

### 1.1 UI und Datenquelle

- **Ort:** Logic Editor → RuleConfigPanel → Aktor-Node → Feld „Auto-Abschaltung (Sek.)“
- **Frontend-Feld:** `duration` (RuleFlowEditor), API: `duration_seconds`
- **Bedeutung:** Wie lange der Aktor bei **dieser Regel-Aktion** eingeschaltet bleibt (0 = dauerhaft)

### 1.2 Datenfluss

```
RuleConfigPanel (duration)
    → RuleFlowEditor.graphToRuleData() → actions[].duration_seconds
    → API POST/PUT /api/v1/logic/rules
    → LogicEngine (Regel-Ausführung)
    → ActuatorActionExecutor.execute()
        duration = action.get("duration_seconds") or action.get("duration", 0)
    → ActuatorService.send_command(..., duration=duration)
    → Publisher.publish_actuator_command(..., duration=duration)
    → MQTT Payload: {"command":"ON","value":1.0,"duration":15,...}
    → ESP32 handleActuatorCommand() → command.duration_s
    → processActuatorLoops(): command_duration_end_ms → Auto-OFF nach N Sekunden
```

### 1.3 Code-Referenzen

| Schicht | Datei | Relevanz |
|---------|-------|----------|
| Frontend | `RuleConfigPanel.vue` | Feld „Auto-Abschaltung (Sek.)“ → `localData.duration` |
| Frontend | `RuleFlowEditor.vue` | `graphToRuleData()`: `duration_seconds: node.data.duration ?? 0` |
| Backend | `logic/actions/actuator_executor.py` | `duration = action.get("duration_seconds") or action.get("duration", 0)` |
| Backend | `actuator_service.py` | `send_command(..., duration=duration)` |
| Backend | `mqtt/publisher.py` | `publish_actuator_command(..., duration=duration)` → Payload `"duration": duration` |
| Firmware | `actuator_manager.cpp` | `command.duration_s = extractJSONUInt32(payload, "duration", 0)`; F1: `command_duration_end_ms` |

---

## 2. Device max_runtime (Geräte-Sicherheitsgrenze)

### 2.1 UI und Datenquelle

- **Ort:** HardwareView → ActuatorConfigPanel → „Laufzeit & Wartung“ → `max_runtime_seconds`
- **DB:** `actuator_configs.safety_constraints` (JSON: `max_runtime`, `cooldown_period`)
- **API:** `ActuatorConfigCreate/Update` → `max_runtime_seconds` → gemappt in `safety_constraints["max_runtime"]`

### 2.2 Datenfluss (aktuell)

```
ActuatorConfigPanel (max_runtime_seconds)
    → API POST /api/v1/actuators/{esp_id}/{gpio}
    → actuators.py: safety_constraints["max_runtime"] = max_runtime_seconds
    → DB: actuator_configs.safety_constraints
    → ConfigPayloadBuilder / config_mapping.py
```

**Wichtig:** `DEFAULT_ACTUATOR_MAPPINGS` in `config_mapping.py` enthält **kein** Mapping für `max_runtime` oder `safety_constraints`. Die Device-`max_runtime_seconds` wird **nicht** an den ESP im Config-Payload gesendet.

### 2.3 ESP-Seite: runtime_protection

- **ActuatorManager:** `config.runtime_protection.max_runtime_ms` (Default: 3600000 ms = 1 h)
- **PumpActuator:** `protection_.max_runtime_ms` (Default: 3600000 ms)
- **parseActuatorDefinition():** Liest **kein** `max_runtime` aus der Config-JSON

**Ergebnis:** Der ESP nutzt für `runtime_protection` / Timeout-Protection immer den **Hardcoded-Default** (1 h). Die im ActuatorConfigPanel gesetzte `max_runtime_seconds` hat **keinen Effekt** auf das ESP-Verhalten.

### 2.4 Server-Seite: safety_service

- `safety_service.check_safety_constraints()` prüft `actuator_config.timeout_seconds` (separates DB-Feld)
- Bei aktivem Aktor + `timeout_seconds` gesetzt: nur **Warnung**, kein Block
- `max_runtime_seconds` aus `safety_constraints` wird dort **nicht** verwendet

---

## 3. Prioritätslogik und Verhalten

### 3.1 Beide gesetzt (Rule duration=15, Device max_runtime=3600)

| Schritt | Ergebnis |
|---------|----------|
| MQTT-Payload | `duration: 15` (von Rule) |
| ESP | Auto-OFF nach 15 s (F1: command_duration_end_ms) |
| Device max_runtime | Hat keinen Einfluss (nicht im Payload, nicht in ESP-Config) |

**→ Es gilt die Rule duration.**

### 3.2 Nur Rule duration=0 (dauerhaft)

| Schritt | Ergebnis |
|---------|----------|
| MQTT-Payload | `duration: 0` |
| ESP | Kein Auto-Off aus Rule; `command_duration_end_ms` bleibt 0 |
| runtime_protection | Greift bei `timeout_enabled` und `activation_start_ms` (Phase 2) — nutzt Default 3600 s |

**→ ESP-Timeouts nutzen Default 1 h, Device max_runtime hat weiterhin keinen Effekt.**

### 3.3 Nur Device max_runtime gesetzt, Rule ohne duration

- Rule sendet `duration: 0` (Default)
- Device max_runtime ist in DB, wird aber nicht an ESP übermittelt
- **→ ESP nutzt Default 3600 s für runtime_protection.**

---

## 4. Kein Fallback

**Aktuell:** Wenn die Rule keine `duration_seconds` hat (0), wird `duration=0` gesendet. Es gibt **keinen** Fallback auf `max_runtime_seconds` aus der ActuatorConfig.

**Mögliche Erweiterung (separater Plan):**

```python
# Im ActuatorActionExecutor oder ActuatorService:
duration = action.get("duration_seconds") or action.get("duration")
if duration is None or duration == 0:
    # Fallback: ActuatorConfig.max_runtime_seconds aus DB
    actuator_config = await actuator_repo.get_by_esp_and_gpio(...)
    safety = actuator_config.safety_constraints or {}
    duration = safety.get("max_runtime") or safety.get("max_runtime_seconds") or 0
```

Das wäre eine **Verhaltensänderung** und müsste bewusst entschieden werden.

---

## 5. Übersicht: Zwei getrennte Mechanismen

| Aspekt | Rule duration | Device max_runtime |
|--------|---------------|---------------------|
| **Zweck** | Pro-Aktion Laufzeit (Business-Logik) | Geräte-Sicherheitsgrenze (Hardware) |
| **Konfiguration** | Pro Regel/Aktion | Pro Aktor (Device) |
| **Transport** | MQTT Command-Payload | DB + (aktuell nicht) Config-Payload |
| **ESP-Verwendung** | F1: command_duration_end_ms → Auto-Off | runtime_protection (Default 1 h) |
| **Aktueller Effekt auf ESP** | ✅ Voll wirksam | ❌ Nicht übermittelt |

---

## 6. Referenzen

- `El Trabajante/docs/system-flows/03-actuator-command-flow.md` (Zeile 239: Rule duration vs. runtime_protection)
- `El Servador/.../logic/actions/actuator_executor.py`
- `El Servador/.../actuator_service.py`
- `El Servador/.../mqtt/publisher.py`
- `El Servador/.../core/config_mapping.py` (DEFAULT_ACTUATOR_MAPPINGS)
- `El Trabajante/.../actuator_manager.cpp` (handleActuatorCommand, processActuatorLoops)
- `.claude/reference/api/MQTT_TOPICS.md` (actuator command payload)

---

**Ende MAX_RUNTIME_ABGRENZUNG.md**
