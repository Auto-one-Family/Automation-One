# Max Runtime — Rule vs. Device: Abgrenzung und Datenfluss

> **Version:** 1.2 | **Datum:** 2026-05-06 (Update: AUT-164 Fix verifiziert)
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

## 1. Rule duration (Maximale Laufzeit pro Ausfuehrung)

### 1.1 UI und Datenquelle

- **Ort:** Logic Editor → RuleConfigPanel → Aktor-Node → Feld „Maximale Laufzeit pro Ausfuehrung (Sek.)”
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
| Frontend | `RuleConfigPanel.vue` | Feld „Maximale Laufzeit pro Ausfuehrung (Sek.)” → `localData.duration` |
| Frontend | `RuleFlowEditor.vue` | `graphToRuleData()`: `duration_seconds: node.data.duration ?? 0` |
| Backend | `logic/actions/actuator_executor.py` | `duration = action.get("duration_seconds") or action.get("duration", 0)` |
| Backend | `actuator_service.py` | `send_command(..., duration=duration)` |
| Backend | `mqtt/publisher.py` | `publish_actuator_command(..., duration=duration)` → Payload `"duration": duration` |
| Firmware | `actuator_manager.cpp` | `command.duration_s = extractJSONUInt32(payload, "duration", 0)`; F1: `command_duration_end_ms` |

---

## 2. Device max_runtime (Geräte-Sicherheitsgrenze)

### 2.1 UI und Datenquelle

- **Ort:** HardwareView → ActuatorConfigPanel → Feld „Geraete-Sicherheitslimit” → `max_runtime_seconds`
- **DB:** `actuator_configs.safety_constraints` (JSON: `max_runtime`, `cooldown_period`)
- **API:** `ActuatorConfigCreate/Update` → `max_runtime_seconds` → gemappt in `safety_constraints["max_runtime"]`

### 2.2 Datenfluss (aktuell — AUT-164 implementiert)

```
ActuatorConfigPanel (max_runtime_seconds)
    → API POST /api/v1/actuators/{esp_id}/{gpio}
    → actuators.py: safety_constraints["max_runtime"] = max_runtime_seconds
    → DB: actuator_configs.safety_constraints
    → ConfigPayloadBuilder / config_mapping.py
        DEFAULT_ACTUATOR_MAPPINGS: safety_constraints.max_runtime → max_runtime_ms
        transform: seconds_to_ms (x * 1000, fallback 3600000)
    → MQTT Config-Push: {"max_runtime_ms": <wert_in_ms>}
    → ESP parseActuatorDefinition(): config.runtime_protection.max_runtime_ms = wert
    → ActuatorManager.registerOrUpdateActuator():
        soft_changed-Check erkennt Änderung
        Soft-Update-Pfad: RAM + NVS + PumpActuator::syncRuntimeLimitsFromConfig()
```

**Stand:** `DEFAULT_ACTUATOR_MAPPINGS` in `config_mapping.py` enthält seit AUT-164 ein Mapping:
`safety_constraints.max_runtime` → `max_runtime_ms` via `seconds_to_ms`. Der Wert kommt vollständig beim ESP an.

### 2.3 ESP-Seite: runtime_protection

- **ActuatorManager:** `config.runtime_protection.max_runtime_ms` — wird aus Config-Push gelesen (Z. 930–932 `parseActuatorDefinition`)
- **PumpActuator:** `protection_.max_runtime_ms` — via `syncRuntimeLimitsFromConfig()` synchronisiert (pump_actuator.cpp Z. 238–241)
- **soft_changed:** Vergleicht `prev.runtime_protection.max_runtime_ms` und `.timeout_enabled` (actuator_manager.cpp Z. 244–247)
- **NVS:** `saveActuatorConfig()` wird nach Soft-Update aufgerufen (actuator_manager.cpp Z. 287–291)

**Ergebnis:** Der ESP übernimmt `max_runtime_ms` aus dem Config-Push korrekt in RAM, NVS und Pump-Treiber. Kein unnötiger GPIO-Teardown (Soft-Update-Pfad).

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
| Device max_runtime | Wirkt als Safety-Ceiling via `runtime_protection.max_runtime_ms` — greift nur wenn Rule duration=0 oder Aktor dauerhaft ON |

**→ Es gilt die Rule duration für den konkreten Command. Device max_runtime ist die Hardware-Sicherheitsgrenze (Ceiling), nicht der Command-Timer.**

### 3.2 Nur Rule duration=0 (dauerhaft)

| Schritt | Ergebnis |
|---------|----------|
| MQTT-Payload | `duration: 0` |
| ESP | Kein Auto-Off aus Rule; `command_duration_end_ms` bleibt 0 |
| runtime_protection | Greift bei `timeout_enabled` und `activation_start_ms` — nutzt konfigurierten Wert aus Config-Push (Default 3600 s wenn nie gesetzt) |

**→ ESP-Timeouts nutzen den via Config-Push übermittelten `max_runtime_ms`-Wert. Wenn kein Config-Push erfolgt ist, gilt der Struct-Default (1 h).**

### 3.3 Nur Device max_runtime gesetzt, Rule ohne duration

- Rule sendet `duration: 0` (Default)
- Device max_runtime kommt via Config-Push als `max_runtime_ms` zum ESP
- **→ ESP nutzt den via Config-Push empfangenen Wert für `runtime_protection.max_runtime_ms`.**

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
| **Transport** | MQTT Command-Payload | DB + Config-Payload (`max_runtime_ms`) |
| **ESP-Verwendung** | F1: command_duration_end_ms → Auto-Off | runtime_protection (konfigurierbar via Config-Push) |
| **Aktueller Effekt auf ESP** | ✅ Voll wirksam | ✅ Wirksam (AUT-164 implementiert) |

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
