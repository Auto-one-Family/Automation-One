# Logic-System Analyse aus ARCHIV

**Datum:** 2025-01-XX  
**Analysiert von:** Auto (AI-Assistent)  
**Zweck:** Analyse des alten Logic-Systems aus dem ARCHIV-Ordner für Referenz bei Server-Implementierung

---

## 1. Gefundene Dateien

### Hauptkomponenten

**Stores & State Management:**
- `ARCHIV/growy-frontend/src/stores/actuatorLogic.js` (3234 Zeilen) - **HAUPTDATEI**
- `ARCHIV/growy-frontend/src/stores/logicalAreas.js`

**UI-Komponenten:**
- `ARCHIV/growy-frontend/src/components/dashboard/LogicWizardEditor.vue` - Wizard für einfache Rule-Erstellung
- `ARCHIV/growy-frontend/src/components/dashboard/ActuatorLogicEditor.vue` - Drag & Drop Editor für komplexe Logik
- `ARCHIV/growy-frontend/src/components/dashboard/ActuatorLogicCard.vue` - Card-Komponente zur Anzeige
- `ARCHIV/growy-frontend/src/components/dashboard/LogicTestPanel.vue` - Test & Simulation Panel
- `ARCHIV/growy-frontend/src/components/dashboard/LogicTemplateLibrary.vue` - Template-Bibliothek

**Validierung & Utilities:**
- `ARCHIV/growy-frontend/src/utils/actuatorLogicValidation.js` - Umfassende Validierung
- `ARCHIV/growy-frontend/src/utils/logicTestEngine.js` - Test-Engine
- `ARCHIV/growy-frontend/src/utils/logicSimulation.js` - Simulations-Engine
- `ARCHIV/growy-frontend/src/utils/logicRecommendations.js` - KI-Empfehlungen
- `ARCHIV/growy-frontend/src/utils/logicExplainability.js` - Explainability-Features
- `ARCHIV/growy-frontend/src/utils/logicTrustLevel.js` - Trust-Level-Berechnung
- `ARCHIV/growy-frontend/src/utils/logicVersionControl.js` - Versionskontrolle

**Schemas:**
- `ARCHIV/growy-frontend/src/schemas/logic.schema.json` - JSON Schema für Validierung

**Dokumentation:**
- `ARCHIV/growy-frontend/CROSS_ESP_LOGIC_IMPLEMENTATION.md` - Cross-ESP Implementierungs-Dokumentation

---

## 2. Rule-Struktur

### Altes Frontend: ActuatorLogic-Konfiguration

Das alte Frontend nutzt eine **Aktor-zentrierte Struktur** - jede Logik ist an einen spezifischen Aktor gebunden:

```javascript
// Aktor-Logic-Konfiguration (Frontend)
{
  version: "1.0",
  timestamp: "2025-01-01T12:00:00Z",
  espId: "ESP_12AB34CD",
  gpio: 18,
  
  actuator: {
    type: "ACTUATOR_PUMP",
    name: "Wasserpumpe",
    gpio: 18
  },
  
  dependencies: [  // Alte Bezeichnung für "Conditions"
    {
      type: "sensor",
      sensorId: "ESP_12AB34CD-34",
      sensorGpio: 34,
      operator: ">",
      threshold: 30,
      sensorType: "SENSOR_TEMP_DS18B20"
    }
  ],
  
  timers: [
    {
      start: "08:00",
      end: "18:00",
      days: [1, 2, 3, 4, 5],  // 0=Sonntag, 6=Samstag
      enabled: true
    }
  ],
  
  configuration: {
    enabled: true,
    evaluationInterval: 30000,  // ms
    failsafeState: false,
    priority: "LOGIC"  // EMERGENCY, MANUAL, ALERT, LOGIC, TIMER, SCHEDULE, DEFAULT
  },
  
  metadata: {
    name: "Temperatur-gesteuerte Pumpe",
    description: "Pumpe aktiviert bei Temp > 30°C",
    createdBy: "user",
    lastModified: "2025-01-01T12:00:00Z"
  }
}
```

### Cross-ESP-Erweiterung (Neu)

Später wurde das System um Cross-ESP-Support erweitert:

```javascript
// Cross-ESP Condition (erweitert)
{
  sensorReference: {  // NEU: Statt nur sensorGpio
    espId: "ESP_12AB34CD",  // Kann anderer ESP sein!
    subzoneId: "subzone1",  // Optional
    gpio: 34,
    deviceType: "SENSOR_TEMP_DS18B20"
  },
  operator: ">",
  threshold: 30
}

// Cross-ESP Action (erweitert)
{
  actuatorReference: {
    espId: "ESP_AABBCCDD",  // Kann anderer ESP sein!
    subzoneId: "subzone2",
    gpio: 18,
    deviceType: "ACTUATOR_PUMP"
  },
  command: "ON",
  duration: 300
}
```

### Vergleich mit Server-Struktur

**Server:** `CrossESPLogic` Model (zentralisierte Rules)

```python
# Server-Struktur (logic.py)
{
  "name": "High pH Alert",
  "description": "Stop dosing pump when pH exceeds 7.5",
  "conditions": [
    {
      "type": "sensor_threshold",  # oder "sensor"
      "esp_id": "ESP_12AB34CD",
      "gpio": 34,
      "operator": ">",
      "value": 7.5,
      "sensor_type": "ph"  # Optional
    },
    {
      "type": "time_window",
      "start_hour": 6,
      "end_hour": 22,
      "days_of_week": [0, 1, 2, 3, 4]  # Optional
    }
  ],
  "actions": [
    {
      "type": "actuator_command",  # oder "actuator"
      "esp_id": "ESP_AABBCCDD",
      "gpio": 5,
      "command": "OFF",
      "value": 0.0,
      "duration_seconds": 0
    }
  ],
  "logic_operator": "AND",  # oder "OR"
  "enabled": true,
  "priority": 80,
  "cooldown_seconds": 300,
  "max_executions_per_hour": null
}
```

---

## 3. Condition-Typen

### Frontend: Condition-Typen

| Condition-Typ | Beschreibung | Felder | Frontend-Implementierung |
|---------------|--------------|--------|--------------------------|
| **sensor** | Sensor-Wert-Threshold | `sensorGpio` (alt) oder `sensorReference` (neu), `operator`, `threshold`, `sensorType` | ✅ Vollständig |
| **sensor_threshold** | Alias für "sensor" | Identisch zu "sensor" | ✅ Kompatibilität |
| **timer** | Zeitfenster-Bedingung | `startTime`, `endTime`, `days` (Array 0-6) | ✅ Vollständig |
| **time_window** | Alias für "timer" | Identisch zu "timer" | ❌ Nur im Schema |

### Server: Condition-Typen

| Condition-Typ | Beschreibung | Felder | Server-Implementierung |
|---------------|--------------|--------|------------------------|
| **sensor_threshold** | Sensor-Wert-Threshold | `esp_id`, `gpio`, `operator` (`>`, `<`, `>=`, `<=`, `==`, `!=`, `between`), `value`, `sensor_type` (optional) | ✅ Vollständig in `logic_engine.py` |
| **sensor** | Kompatibilitäts-Alias | Identisch zu `sensor_threshold` | ✅ Unterstützt |
| **time_window** | Zeitfenster-Bedingung | `start_hour` (0-23), `end_hour` (0-23), `days_of_week` (Optional, Array 0-6) | ✅ Vollständig in `logic_engine.py` |

### Condition-Operatoren

**Frontend unterstützt:**
- `>`, `<`, `>=`, `<=`, `==`, `!=`

**Server unterstützt zusätzlich:**
- `between` (mit `min` und `max` Feldern)

### Code-Beispiele

**Frontend Condition-Auswertung:**
```javascript
// actuatorLogic.js:1373-1425
evaluateCondition(condition, sensorData) {
  const value = Number(sensorData.value)
  const threshold = Number(condition.threshold)
  
  switch (condition.operator) {
    case '>': return value > threshold
    case '<': return value < threshold
    case '>=': return value >= threshold
    case '<=': return value <= threshold
    case '==': return value === threshold
    case '!=': return value !== threshold
    default: return false
  }
}
```

**Server Condition-Auswertung:**
```python
# logic_engine.py:255-323
async def _check_single_condition(self, condition: dict, sensor_data: dict) -> bool:
    if cond_type in ("sensor_threshold", "sensor"):
        # ... matching logic ...
        if operator == ">":
            return actual > threshold
        elif operator == "between":
            min_val = condition.get("min")
            max_val = condition.get("max")
            return min_val <= actual <= max_val
        # ... weitere Operatoren ...
    elif cond_type == "time_window":
        # Zeitfenster-Logik
```

---

## 4. Action-Typen

### Frontend: Action-Typen

| Action-Typ | Beschreibung | Felder | Status |
|------------|--------------|--------|--------|
| **actuator** | Aktor-Steuerung | `espId`, `gpio`, `command` (`ON`, `OFF`, `PWM`, `TOGGLE`), `value`, `duration` | ✅ Vollständig implementiert |
| **actuator_command** | Alias für "actuator" | Identisch | ✅ Kompatibilität |

**Hinweis:** Das Frontend fokussiert auf **Aktor-Steuerung** - andere Action-Typen werden nicht explizit unterstützt.

### Server: Action-Typen

| Action-Typ | Beschreibung | Felder | Status |
|------------|--------------|--------|--------|
| **actuator_command** | Aktor-Steuerung | `esp_id`, `gpio`, `command` (`ON`, `OFF`, `PWM`, `TOGGLE`), `value` (0.0-1.0), `duration_seconds` | ✅ Implementiert in `logic_engine.py` |
| **actuator** | Kompatibilitäts-Alias | Identisch | ✅ Unterstützt |
| **notification** | Benachrichtigung | `channel` (`email`, `webhook`, `websocket`), `target`, `message_template` | ❌ **NUR im Schema, NICHT implementiert** |
| **delay** | Verzögerung | `seconds` (1-3600) | ❌ **NUR im Schema, NICHT implementiert** |

### Code-Beispiele

**Frontend Action-Ausführung:**
```javascript
// actuatorLogic.js:2680-2705
async executeCrossEspActions(actions) {
  await Promise.all(
    actions.map(async (action) => {
      const { espId, subzoneId, gpio } = action.actuatorReference
      
      await systemCommands.sendCommand({
        esp_id: espId,
        gpio: gpio,
        command: action.command,
        duration: action.duration,
        // ...
      })
    })
  )
}
```

**Server Action-Ausführung:**
```python
# logic_engine.py:325-392
async def _execute_actions(self, actions: list, trigger_data: dict, ...):
    for action in actions:
        action_type = action.get("type")
        
        if action_type in ("actuator_command", "actuator"):
            success = await self.actuator_service.send_command(
                esp_id=action.get("esp_id"),
                gpio=action.get("gpio"),
                command=action.get("command", "ON"),
                value=action.get("value", 1.0),
                duration=action.get("duration_seconds", 0),
                issued_by=f"logic:{rule_id}"
            )
        else:
            logger.warning(f"Unknown action type: {action_type}")
```

---

## 5. UI-Komponenten

### LogicWizardEditor.vue

**Zweck:** Einfache, benutzerfreundliche Rule-Erstellung über Wizard-Interface

**Features:**
- **5-Schritt Wizard:**
  1. Aktor auswählen
  2. Trigger definieren (Sensor/Timer/Manuell)
  3. Bedingungen (optional)
  4. Cross-ESP Konfiguration
  5. Vorschau & Speichern

- **Condition-Typen:**
  - Sensor-Bedingung: Sensor auswählen, Operator, Schwellenwert
  - Timer-Bedingung: Start-/End-Zeit, Wochentage
  - Manuell: Für manuelle Trigger

- **Live-Test:** Regel vor Speicherung testen

**Code-Snippet:**
```vue
<!-- LogicWizardEditor.vue:50-120 -->
<v-tabs v-model="conditionType">
  <v-tab value="sensor">Sensor-Wert</v-tab>
  <v-tab value="timer">Zeitplan</v-tab>
  <v-tab value="manual">Manuell</v-tab>
</v-tabs>

<div v-if="conditionType === 'sensor'">
  <v-select v-model="selectedSensor" :items="availableSensors" />
  <v-select v-model="conditionOperator" :items="operators" />
  <v-text-field v-model="conditionThreshold" type="number" />
</div>

<div v-if="conditionType === 'timer'">
  <v-text-field v-model="timerStart" type="time" />
  <v-text-field v-model="timerEnd" type="time" />
  <v-chip-group v-model="selectedDays" multiple>
    <!-- Mo-So Chips -->
  </v-chip-group>
</div>
```

### ActuatorLogicEditor.vue

**Zweck:** Komplexer Drag & Drop Editor für fortgeschrittene Logik-Konfiguration

**Features:**
- **Drag & Drop Canvas:** Logik-Elemente per Drag & Drop platzieren
- **Element-Palette:**
  - Sensoren (aus ESP-Registry)
  - Timer (zeitbasierte Bedingungen)
  - Events (manuelle Trigger)

- **Visualisierung:**
  - Verbindungslinien zwischen Elementen
  - Hierarchie-Support (Parent/Child)
  - Farbkodierung nach Element-Typ

- **Validierung:** Echtzeit-Validierung mit Fehleranzeige

- **Template-Library:** Wiederverwendbare Logik-Templates

**Code-Snippet:**
```vue
<!-- ActuatorLogicEditor.vue:136-234 -->
<div class="logic-canvas" @drop.prevent="handleDrop">
  <!-- Logik-Elemente -->
  <div
    v-for="element in logicElements"
    class="logic-element"
    draggable="true"
  >
    <div class="element-header">
      <v-icon :icon="getElementIcon(element.type)" />
      <span>{{ element.title }}</span>
    </div>
  </div>
  
  <!-- Verbindungslinien (SVG) -->
  <svg class="connections-svg">
    <line v-for="connection in connections" ... />
  </svg>
</div>
```

### LogicTestPanel.vue

**Zweck:** Test & Simulation von Logic-Rules

**Features:**
- **Automatisierte Tests:** Test-Cases basierend auf Rule-Definition
- **Live-Simulation:** Simuliert Sensor-Daten und zeigt Aktor-Verhalten
- **Ergebnis-Visualisierung:** Detaillierte Test-Ergebnisse mit Erfolgsrate

**Code-Snippet:**
```vue
<!-- LogicTestPanel.vue:80-182 -->
<v-expansion-panel>
  <v-expansion-panel-title>
    Test-Ergebnisse
    <v-chip>{{ testResults.passed }}/{{ testResults.totalTests }}</v-chip>
  </v-expansion-panel-title>
  <v-expansion-panel-text>
    <!-- Test-Zusammenfassung -->
    <v-row>
      <v-col>Bestanden: {{ testResults.passed }}</v-col>
      <v-col>Fehlgeschlagen: {{ testResults.failed }}</v-col>
      <v-col>Erfolgsrate: {{ testResults.summary.successRate }}%</v-col>
    </v-row>
    
    <!-- Detaillierte Ergebnisse -->
    <v-table>
      <tr v-for="result in testResults.testResults">
        <td>{{ result.name }}</td>
        <td>{{ result.status }}</td>
      </tr>
    </v-table>
  </v-expansion-panel-text>
</v-expansion-panel>
```

### ActuatorLogicCard.vue

**Zweck:** Anzeige und Steuerung von Aktor-Logik im Dashboard

**Features:**
- **Status-Anzeige:** Aktueller Zustand mit Prioritäts-Info
- **Prioritäts-Hierarchie:** Visualisierung der Priority-Levels
- **Aktor-Steuerung:** Manuelles Toggle mit Override-Funktion
- **Statistiken:** Logik-Anzahl, aktive Prozesse, Timer, Logs

---

## 6. Erweiterte Features (Frontend)

### Prioritäts-System

**Frontend implementiert ein umfassendes Prioritäts-System:**

```javascript
// actuatorLogic.js:10-20
priorityLevels = {
  EMERGENCY: 100,  // Notfall-Alerts
  MANUAL: 90,      // Manuelle Steuerung
  ALERT: 80,       // Alert-System
  LOGIC: 70,       // Drag&Drop-Logik
  TIMER: 60,       // Timer-basierte Logik
  SCHEDULE: 50,    // Zeitplan
  DEFAULT: 0       // Standard-Zustand
}
```

**Funktionalität:**
- Zustandsauflösung basierend auf höchster Priorität
- Konfliktlösung bei gleicher Priorität (Aktor-Typ-spezifisch)
- Visualisierung im UI

**Server:** Unterstützt `priority` Feld (1-100), aber kein automatisches Prioritäts-System.

### Validierung

**Frontend bietet umfassende Validierung:**

```javascript
// actuatorLogicValidation.js
validateWithSeverity(logic) {
  // Schema-Validierung (JSON Schema)
  // Logische Vollständigkeit
  // Sicherheitsvalidierung (z.B. Pumpe ohne Feuchtigkeitssensor)
  // Performance-Validierung
  // Duplicate-Detection
  // Prioritätskonflikt-Detektion
  // Automatische Test-Case-Generierung
  // Intelligente Empfehlungen
}
```

**Features:**
- JSON Schema-Validierung gegen `logic.schema.json`
- Sicherheits-Constraints (z.B. Pumpe sollte Feuchtigkeitssensor haben)
- Performance-Warnungen (zu häufige Auswertung)
- Duplikat-Erkennung
- Prioritätskonflikt-Analyse

**Server:** Basis-Validierung in `logic_validation.py`, aber weniger umfangreich.

### Cross-ESP-Support

**Frontend:** Vollständig implementiert mit:
- `sensorReference` statt `sensorGpio`
- `actuatorReference` für Actions
- Subzone-Support
- Cross-ESP-Warnungen im UI
- Konfiguration-Transfer zwischen ESPs

**Server:** Unterstützt Cross-ESP durch `esp_id` in Conditions/Actions, aber kein expliziter Subzone-Support.

---

## 7. Gap-Analyse: Frontend vs. Server

| Feature | Altes Frontend | Aktueller Server | Gap? | Priorität |
|---------|---------------|------------------|------|-----------|
| **Condition-Typen** |
| sensor_threshold | ✅ Vollständig | ✅ Vollständig | ❌ | - |
| time_window | ✅ Vollständig (als "timer") | ✅ Vollständig | ❌ | - |
| between-Operator | ❌ | ✅ Unterstützt | ⚠️ Frontend fehlt | Niedrig |
| **Action-Typen** |
| actuator_command | ✅ Vollständig | ✅ Vollständig | ❌ | - |
| notification | ❌ | ⚠️ Nur Schema | 🔴 **NICHT implementiert** | Hoch |
| delay | ❌ | ⚠️ Nur Schema | 🔴 **NICHT implementiert** | Mittel |
| **Compound Logic** |
| AND/OR Operator | ✅ Unterstützt | ✅ Unterstützt | ❌ | - |
| Nested Conditions | ❌ | ❌ | ⚠️ Beide fehlen | Niedrig |
| **Prioritäts-System** |
| Priority-Levels | ✅ Umfassend (EMERGENCY-MANUAL-ALERT-LOGIC-TIMER) | ⚠️ Nur numerisch (1-100) | 🔴 **Fehlt automatische Auflösung** | Hoch |
| Konfliktlösung | ✅ Aktor-Typ-spezifisch | ❌ | 🔴 **Fehlt** | Hoch |
| **Cross-ESP** |
| Cross-ESP Conditions | ✅ Mit sensorReference | ✅ Mit esp_id | ⚠️ Subzone-Support fehlt | Mittel |
| Subzone-Support | ✅ Unterstützt | ❌ | 🔴 **Fehlt** | Mittel |
| **Validierung** |
| JSON Schema Validation | ✅ Vollständig | ⚠️ Basis-Validierung | ⚠️ Weniger umfangreich | Mittel |
| Sicherheits-Constraints | ✅ Pumpe+Feuchtigkeit, Heizung+Temperatur | ❌ | 🔴 **Fehlt** | Hoch |
| Duplicate-Detection | ✅ Implementiert | ❌ | 🔴 **Fehlt** | Niedrig |
| **Testing & Simulation** |
| Rule-Testing | ✅ LogicTestPanel | ✅ RuleTestRequest Schema | ⚠️ UI fehlt | Mittel |
| Simulation | ✅ Live-Simulation | ❌ | 🔴 **Fehlt** | Niedrig |
| **UI-Features** |
| Wizard-Editor | ✅ LogicWizardEditor | ❌ | 🔴 **Nur API** | Niedrig |
| Drag & Drop Editor | ✅ ActuatorLogicEditor | ❌ | 🔴 **Nur API** | Niedrig |
| Template-Library | ✅ LogicTemplateLibrary | ❌ | 🔴 **Fehlt** | Niedrig |
| **Cooldown** |
| Cooldown-Mechanismus | ⚠️ Teilweise | ✅ Vollständig | ⚠️ Frontend weniger ausgereift | - |
| max_executions_per_hour | ❌ | ✅ Unterstützt | ⚠️ Frontend fehlt | Niedrig |
| **Execution History** |
| Execution Logging | ✅ Logic-Logs | ✅ ExecutionHistory Model | ❌ | - |
| History-API | ❌ | ✅ Vollständig | ⚠️ Frontend fehlt | Mittel |

### Kritische Gaps (🔴)

1. **Notification Actions:** Im Server-Schema definiert, aber nicht implementiert
2. **Delay Actions:** Im Server-Schema definiert, aber nicht implementiert
3. **Prioritäts-System:** Server hat nur numerische Priorität, keine automatische Auflösung
4. **Sicherheits-Constraints:** Fehlen im Server (wichtig für Produktion)
5. **Subzone-Support:** Fehlt im Server (wichtig für Cross-ESP)

### Wichtige Gaps (⚠️)

1. **Testing UI:** Server hat API, aber keine UI-Komponenten
2. **Validierung:** Server-Validierung weniger umfangreich
3. **Cross-ESP UI:** Frontend hat GlobalSensorSelect, Server nur API

### Nice-to-Have Gaps (🟡)

1. **Wizard-Editor:** Nur Frontend-Feature
2. **Drag & Drop Editor:** Nur Frontend-Feature
3. **Template-Library:** Nur Frontend-Feature
4. **Simulation:** Nur Frontend-Feature

---

## 8. Empfehlungen

### Sofort implementieren (🔴 Hoch)

1. **Notification Actions implementieren:**
   ```python
   # logic_engine.py:_execute_actions erweitern
   elif action_type == "notification":
       channel = action.get("channel")
       target = action.get("target")
       message = action.get("message_template").format(**trigger_data)
       # ... Benachrichtigung senden
   ```

2. **Prioritäts-System erweitern:**
   - Automatische Auflösung bei mehreren aktiven Rules
   - Aktor-Typ-spezifische Konfliktlösung
   - Priority-Levels ähnlich Frontend

3. **Sicherheits-Constraints:**
   - Validierung: Pumpe sollte Feuchtigkeitssensor haben
   - Validierung: Heizung sollte Temperatursensor haben
   - Failsafe-Mechanismen verbessern

### Kurzfristig (⚠️ Mittel)

4. **Subzone-Support:**
   - `subzoneId` in Conditions/Actions
   - API-Endpunkte erweitern

5. **Delay Actions implementieren:**
   ```python
   elif action_type == "delay":
       seconds = action.get("seconds")
       await asyncio.sleep(seconds)
   ```

6. **Validierung erweitern:**
   - JSON Schema Validation
   - Sicherheits-Constraints
   - Duplicate-Detection

### Langfristig (🟡 Niedrig)

7. **Testing & Simulation API erweitern:**
   - Automatische Test-Case-Generierung
   - Live-Simulation-Endpunkt

8. **Template-System:**
   - Rule-Templates im Server speichern
   - API für Template-CRUD

---

## 9. Code-Snippets für Server-Erweiterungen

### Notification Action implementieren

```python
# logic_engine.py:_execute_actions
elif action_type == "notification":
    channel = action.get("channel")  # email, webhook, websocket
    target = action.get("target")
    message_template = action.get("message_template")
    
    # Template-Variablen ersetzen
    message = message_template.format(
        sensor_value=trigger_data.get("value"),
        esp_id=trigger_data.get("esp_id"),
        gpio=trigger_data.get("gpio"),
        timestamp=datetime.now().isoformat()
    )
    
    if channel == "email":
        # TODO: Email-Service integrieren
        pass
    elif channel == "webhook":
        # TODO: Webhook senden
        pass
    elif channel == "websocket":
        await self.websocket_manager.broadcast("notification", {
            "target": target,
            "message": message,
            "rule_name": rule_name
        })
```

### Prioritäts-System erweitern

```python
# logic_service.py
class LogicService:
    PRIORITY_LEVELS = {
        "EMERGENCY": 100,
        "MANUAL": 90,
        "ALERT": 80,
        "LOGIC": 70,
        "TIMER": 60,
        "SCHEDULE": 50,
        "DEFAULT": 0
    }
    
    async def resolve_priority_conflict(
        self, 
        rules: List[CrossESPLogic], 
        actuator_type: str
    ) -> CrossESPLogic:
        """Auflöse Prioritätskonflikte ähnlich Frontend."""
        # Sortiere nach Priorität
        sorted_rules = sorted(rules, key=lambda r: r.priority, reverse=True)
        
        # Bei gleicher Priorität: Aktor-Typ-spezifisch
        if len(sorted_rules) > 1:
            highest_priority = sorted_rules[0].priority
            conflicting = [r for r in sorted_rules if r.priority == highest_priority]
            
            if actuator_type == "ACTUATOR_PUMP":
                # Sicherheitszustand bevorzugen
                return next((r for r in conflicting if self._is_safe_state(r)), conflicting[0])
        
        return sorted_rules[0]
```

### Sicherheits-Constraints

```python
# logic_validation.py
def validate_safety_constraints(rule: dict) -> Dict[str, Any]:
    """Validiere Sicherheits-Constraints ähnlich Frontend."""
    warnings = []
    
    # Pumpe sollte Feuchtigkeitssensor haben
    actuator_type = rule.get("actuator", {}).get("type")
    conditions = rule.get("conditions", [])
    
    if actuator_type == "ACTUATOR_PUMP":
        has_moisture = any(
            c.get("sensor_type") == "SENSOR_MOISTURE" 
            for c in conditions
        )
        if not has_moisture:
            warnings.append("Pumpe ohne Feuchtigkeitssensor - Überflutungsrisiko")
    
    # Heizung sollte Temperatursensor haben
    if actuator_type == "ACTUATOR_HEATER":
        has_temp = any(
            c.get("sensor_type") in ["SENSOR_TEMP_DS18B20", "temperature"]
            for c in conditions
        )
        if not has_temp:
            warnings.append("Heizung ohne Temperatursensor - Überhitzungsrisiko")
    
    return {
        "safe": len(warnings) == 0,
        "warnings": warnings
    }
```

---

## 10. Zusammenfassung

### Was das alte Frontend gut macht:

1. **Prioritäts-System:** Umfassend mit automatischer Konfliktlösung
2. **Validierung:** Sehr umfangreich mit Sicherheits-Constraints
3. **UI:** Intuitive Wizard- und Drag & Drop-Editoren
4. **Cross-ESP:** Vollständig mit Subzone-Support
5. **Testing:** Test-Panel und Simulation

### Was der Server bereits gut hat:

1. **Execution Engine:** Robust implementiert
2. **Cooldown:** Vollständig mit max_executions_per_hour
3. **History:** Execution History komplett
4. **API:** RESTful API mit Pydantic-Schemas

### Was der Server noch braucht:

1. **Notification & Delay Actions:** Im Schema, aber nicht implementiert
2. **Prioritäts-Auflösung:** Automatische Konfliktlösung
3. **Sicherheits-Constraints:** Validierung für Produktion
4. **Subzone-Support:** Für vollständigen Cross-ESP-Support

---

**Ende der Analyse**







