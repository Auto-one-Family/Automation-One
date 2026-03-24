# T18-F2: MQTT OFF-Befehl — Analyse und Fix

**Datum:** 2026-03-11  
**Typ:** Analyse + Fix  
**Bezug:** T18-V6-ABSCHLUSSBERICHT §3.1, Auftrag T18-F2

---

## 1. Root-Cause-Analyse

### 1.1 Manueller Button vs. Regel-Deaktivierung

| Pfad | Verhalten |
|------|-----------|
| **Manueller Aktor-Button** | Frontend → `POST /v1/actuators/{esp_id}/{gpio}/command` → ActuatorService → Publisher → MQTT → ESP |
| **Regel-Deaktivierung** | Frontend → `POST /v1/logic/rules/{id}/toggle` → nur DB-Update, **kein OFF** an Aktoren |
| **Bedingung nicht mehr erfüllt** | Logic Engine → `conditions_met=False` → **return ohne OFF** |

### 1.2 Identifizierte Lücken

1. **Rule Toggle (disable):** `toggle_rule` in `logic.py` setzte nur `rule.enabled = False` in der DB. Es wurde **kein OFF** an die von der Regel gesteuerten Aktoren gesendet.

2. **Hysterese-Deaktivierung:** Wenn die Hysterese-Condition von aktiv auf inaktiv wechselt (z.B. Feuchte > deactivate_above), gab der HysteresisConditionEvaluator `False` zurück. Die Logic Engine kehrte dann ohne Aktion zurück – **kein OFF** wurde gesendet.

3. **Einfache Schwellenwert-Regel:** Bei Regeln mit einfacher Bedingung (z.B. `humidity < 40`) und ohne Hysterese: Wenn der Wert über den Schwellenwert steigt, wird die Regel nicht mehr ausgeführt. Es gibt **keinen expliziten OFF-Pfad** – die Regel feuert einfach nicht. *(Nicht in diesem Fix abgedeckt – erfordert Konfliktauflösung bei mehreren Regeln pro Aktor.)*

### 1.3 Backend/MQTT/Firmware – OFF-Pfad verifiziert

| Schicht | Status | Details |
|---------|--------|---------|
| **Publisher** | ✅ | `command.upper()` → `"OFF"`, Payload `{"command":"OFF","value":0,"duration":0,"timestamp":...}` |
| **ActuatorService** | ✅ | Ruft `publish_actuator_command` auf, Safety-Check akzeptiert OFF (value=0) |
| **Topic** | ✅ | `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` (kaiser_id default: "god") |
| **Firmware** | ✅ | `actuator_manager.cpp` Zeile 591: `command.command.equalsIgnoreCase("OFF")` → `controlActuatorBinary(gpio, false)` |

**Fazit:** Der OFF-Befehl wird korrekt serialisiert und von der Firmware verarbeitet. Das Problem lag in den **fehlenden OFF-Aufrufen** bei Regel-Deaktivierung und Hysterese-Deaktivierung.

---

## 2. Implementierte Fixes

### 2.1 Rule Toggle – OFF bei Disable

**Datei:** `El Servador/god_kaiser_server/src/api/v1/logic.py`

- Beim Deaktivieren einer Regel (`request.enabled=False`) werden alle Aktor-Aktionen der Regel durchlaufen.
- Für jede `actuator_command`/`actuator`-Aktion wird `ActuatorService.send_command(..., command="OFF", value=0.0)` aufgerufen.
- `issued_by` = `rule_toggle:{rule_id}` für Audit-Trace.

### 2.2 Hysterese-Deaktivierung – OFF senden

**Dateien:**
- `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py`
  - Beim Übergang aktiv → inaktiv wird `context["_hysteresis_just_deactivated"] = True` gesetzt (Kühlung und Heizung).

- `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - Wenn `conditions_met` False ist und `context.get("_hysteresis_just_deactivated")` True:
    - Erzeuge OFF-Varianten der Aktor-Aktionen (`command="OFF", value=0.0, duration=0`).
    - Führe diese über `_execute_actions` aus.

---

## 3. Akzeptanzkriterien

| Kriterium | Status |
|-----------|--------|
| Regel deaktivieren → Aktor geht aus | ✅ Implementiert |
| Hysterese-Deaktivierung → OFF gesendet | ✅ Implementiert |
| Manueller MQTT OFF (korrekter Topic/Payload) | ✅ Bereits funktionsfähig (Firmware/Publisher) |

---

## 4. Manueller MQTT OFF – Verifikation

Falls ein manuell gesendeter MQTT OFF nicht ankommt, prüfen:

1. **Topic:** `kaiser/god/esp/{esp_id}/actuator/{gpio}/command`  
   - `kaiser_id` muss "god" sein (oder konfigurierter Wert).  
   - `esp_id` und `gpio` müssen zum Ziel-Aktor passen.

2. **Payload:**
   ```json
   {"command":"OFF","value":0,"duration":0,"timestamp":1735818000}
   ```

3. **Beispiel mosquitto_pub:**
   ```bash
   mosquitto_pub -t "kaiser/god/esp/ESP_12AB34CD/actuator/5/command" \
     -m '{"command":"OFF","value":0,"duration":0,"timestamp":1735818000}' -q 2
   ```

4. **QoS:** Der Server nutzt QoS 2 für Aktor-Befehle. QoS 0 kann zu Verlusten führen.

---

## 5. Offene Punkte (Follow-up)

- **Einfache Schwellenwert-Regel ohne Hysterese:** Wenn z.B. `humidity < 40` → ON und der Wert auf 55 steigt, wird aktuell kein OFF gesendet. Eine Erweiterung würde Konfliktauflösung bei mehreren Regeln pro Aktor erfordern.
- **Firmware duration:** Die 15s Auto-Off aus der Regel wird vom Server gesendet, die Firmware nutzt `duration` derzeit nicht (siehe T18-V6 §3.1).
