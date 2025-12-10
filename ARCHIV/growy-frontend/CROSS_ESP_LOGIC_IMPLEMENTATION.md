# 🔗 **CROSS-ESP-LOGIK IMPLEMENTATION**

## **📋 ÜBERSICHT**

Die Cross-ESP-Logik ermöglicht es, dass Aktoren auf einem ESP-Gerät durch Sensoren auf anderen ESP-Geräten gesteuert werden können. Diese Implementierung erweitert das bestehende System um Mehrgeräte-Funktionalität bei vollständiger Rückwärtskompatibilität.

---

## **✅ IMPLEMENTIERTE FEATURES**

### **1. Sensor-Referenzierung: `sensorReference` statt `sensorGpio`**

#### **Vorher:**

```javascript
condition: {
  sensorGpio: 4,  // Nur GPIO, impliziert lokalen ESP
  operator: '>',
  threshold: 30
}
```

#### **Nachher:**

```javascript
condition: {
  sensorReference: { espId: 'esp001', gpio: 4 },  // Vollständige Referenz
  operator: '>',
  threshold: 30
}
```

#### **Vorteile:**

- ✅ Eindeutige Sensor-Identifikation
- ✅ Cross-ESP-Unterstützung
- ✅ Rückwärtskompatibilität durch Migration
- ✅ Bessere Vergleichbarkeit und Indizierung

### **2. Globale Sensor-Auswahl: `GlobalSensorSelect.vue`**

#### **Features:**

- ✅ ESP-Auswahl mit visueller Unterscheidung (Farben)
- ✅ Sensor-Auswahl mit aktuellen Werten
- ✅ Cross-ESP-Warnungen
- ✅ Intuitive Benutzeroberfläche

#### **Verwendung:**

```vue
<GlobalSensorSelect
  v-model="condition.sensorReference"
  :current-actuator-esp-id="props.espId"
  @update:model-value="updateConditionSensor(index, $event)"
/>
```

### **3. Erweiterte ActuatorLogic Store**

#### **Neue Funktionen:**

```javascript
// Cross-ESP Bedingungsauswertung
async evaluateConditions(conditions, espId, sensorRegistry)

// Logik zwischen ESPs kopieren
async copyActuatorLogic(sourceEspId, sourceGpio, targetEspId, targetGpio, options)

// Logik für Ziel-ESP anpassen
adaptLogicForTarget(sourceLogic, sourceEspId, targetEspId, options)

// Erweiterte Statistiken
getExtendedLogicStats()
```

### **4. Konfiguration-Transfer: ActuatorMonitor**

#### **Features:**

- ✅ Kopier-Button für jeden Aktor mit Logik
- ✅ Ziel-Aktor-Auswahl
- ✅ Kopier-Optionen (Sensor-Referenzen anpassen, Timer, Failsafe)
- ✅ Intelligente Vorschläge für kompatible Sensoren

### **5. Utility-Funktionen: `espHelpers.js`**

#### **Neue Utilities:**

```javascript
// Sensor-Key-Parsing
parseSensorKey(sensorKey) // 'esp001-4' → { espId: 'esp001', gpio: 4 }
buildSensorKey(espId, gpio) // { espId: 'esp001', gpio: 4 } → 'esp001-4'

// Cross-ESP-Erkennung
isCrossEspReference(sensorReference, actuatorEspId)

// Migration
migrateConditionToSensorReference(condition, actuatorEspId)

// Intelligente Sensor-Vorschläge
suggestSensorMapping(sourceLogic, targetEspId, sensorRegistry)
```

---

## **🔧 TECHNISCHE IMPLEMENTIERUNG**

### **Datenmodell-Erweiterung**

#### **Bedingungs-Struktur:**

```javascript
// Altes Format (rückwärtskompatibel)
{
  sensorGpio: 4,
  operator: '>',
  threshold: 30
}

// Neues Format (Cross-ESP)
{
  sensorReference: { espId: 'esp001', gpio: 4 },
  operator: '>',
  threshold: 30
}
```

#### **Migration:**

```javascript
// Automatische Migration beim Laden
const migrateLogicConfig = (oldConfig, actuatorEspId) => {
  if (oldConfig.conditions) {
    oldConfig.conditions = oldConfig.conditions.map((condition) => {
      if (condition.sensorGpio && !condition.sensorReference) {
        return {
          ...condition,
          sensorReference: { espId: actuatorEspId, gpio: condition.sensorGpio },
          sensorGpio: undefined,
        }
      }
      return condition
    })
  }
  return oldConfig
}
```

### **Cross-ESP-Evaluierung**

#### **Erweiterte Bedingungsauswertung:**

```javascript
async evaluateConditions(conditions, espId, sensorRegistry) {
  const results = await Promise.all(
    conditions.map(async (condition) => {
      // Cross-ESP Sensor-Unterstützung
      let sensorEspId = espId
      let sensorGpio = condition.sensorGpio

      // Prüfe auf erweiterte Sensor-Referenz
      if (condition.sensorReference) {
        sensorEspId = condition.sensorReference.espId || espId
        sensorGpio = condition.sensorReference.gpio || condition.sensorGpio
      }

      const sensor = sensorRegistry.getSensor(sensorEspId, sensorGpio)
      // ... Auswertung
    })
  )
  return results.every((result) => result)
}
```

### **UI-Komponenten**

#### **GlobalSensorSelect.vue:**

- ESP-Auswahl mit Farbkodierung
- Sensor-Auswahl mit Live-Werten
- Cross-ESP-Warnungen
- Responsive Design

#### **ActuatorLogicEditor.vue:**

- Integration von GlobalSensorSelect
- Cross-ESP-Indikator
- Automatische Migration
- Erweiterte Validierung

#### **ActuatorMonitor.vue:**

- Kopier-Funktionalität
- Ziel-Aktor-Auswahl
- Kopier-Optionen
- Erfolgs-Feedback

---

## **🎯 VERWENDUNGSBEISPIELE**

### **Beispiel 1: Temperatur-Steuerung über Cross-ESP**

```javascript
// ESP001: Heizung wird durch Temperatursensor auf ESP002 gesteuert
const logic = {
  name: 'Cross-ESP Temperatursteuerung',
  conditions: [
    {
      sensorReference: { espId: 'esp002', gpio: 4 }, // Temperatursensor auf ESP002
      operator: '<',
      threshold: 20,
    },
  ],
  timers: [
    {
      startTime: '06:00',
      endTime: '22:00',
      days: [1, 2, 3, 4, 5],
    },
  ],
}
```

### **Beispiel 2: Konfiguration kopieren**

```javascript
// Von ESP001 GPIO 4 nach ESP002 GPIO 8 kopieren
await actuatorLogic.copyActuatorLogic(
  'esp001',
  4, // Quelle
  'esp002',
  8, // Ziel
  {
    adaptSensorReferences: true, // Sensor-Referenzen anpassen
    copyTimers: true, // Timer kopieren
    copyFailsafe: true, // Failsafe kopieren
  },
)
```

### **Beispiel 3: Intelligente Sensor-Vorschläge**

```javascript
// Finde kompatible Sensoren für Ziel-ESP
const suggestions = suggestSensorMapping(sourceLogic, 'esp002', sensorRegistry)[
  // Ergebnis:
  {
    conditionIndex: 0,
    sourceSensor: { espId: 'esp001', gpio: 4, type: 'SENSOR_TEMP_DS18B20' },
    compatibleSensors: [{ espId: 'esp002', gpio: 6, type: 'SENSOR_TEMP_DS18B20' }],
    recommended: { espId: 'esp002', gpio: 6, type: 'SENSOR_TEMP_DS18B20' },
  }
]
```

---

## **🔒 SICHERHEIT & VALIDIERUNG**

### **Validierungsregeln:**

1. ✅ Sensor-Referenzen müssen gültige ESP-IDs enthalten
2. ✅ Sensoren müssen in der Sensor-Registry existieren
3. ✅ Cross-ESP-Referenzen werden visuell gekennzeichnet
4. ✅ Failsafe-Mechanismen bei Sensor-Ausfällen

### **Fehlerbehandlung:**

```javascript
// Sensor nicht gefunden
if (!sensor) {
  console.warn(`Sensor nicht gefunden: ESP ${sensorEspId}, GPIO ${sensorGpio}`)
  return false
}

// Failsafe bei Cross-ESP-Fehlern
if (logic.failsafeEnabled) {
  await this.activateFailsafe(espId, gpio, logic.failsafeState)
}
```

---

## **📊 MONITORING & STATISTIKEN**

### **Erweiterte Logik-Statistiken:**

```javascript
const stats = actuatorLogic.getExtendedLogicStats()
// {
//   total: 15,
//   enabled: 12,
//   disabled: 3,
//   withCrossEspSensors: 5,  // Cross-ESP-Logiken
//   byEsp: { 'esp001': 8, 'esp002': 7 }
// }
```

### **Cross-ESP-Überwachung:**

- ✅ Anzahl Cross-ESP-Logiken
- ✅ Sensor-Verfügbarkeit
- ✅ Performance-Metriken
- ✅ Fehler-Statistiken

---

## **🔄 RÜCKWÄRTSKOMPATIBILITÄT**

### **Migration-Strategie:**

1. ✅ Bestehende `sensorGpio`-Konfigurationen funktionieren weiterhin
2. ✅ Automatische Migration beim Laden
3. ✅ Graduelle Umstellung möglich
4. ✅ Keine Breaking Changes

### **Fallback-Mechanismen:**

```javascript
// Unterstützt beide Formate
const sensorRef = condition.sensorReference || { espId: espId, gpio: condition.sensorGpio }
const sensor = sensorRegistry.getSensor(sensorRef.espId, sensorRef.gpio)
```

---

## **🚀 NÄCHSTE SCHRITTE**

### **Geplante Erweiterungen:**

1. **Logik-Vorlagen-System** - Wiederverwendbare Konfigurationen
2. **Advanced Sensor-Mapping** - KI-basierte Vorschläge
3. **Cross-ESP-Performance-Optimierung** - Caching und Redundanz
4. **Visualisierung** - Cross-ESP-Beziehungen im Dashboard
5. **Logging & Debugging** - Erweiterte Cross-ESP-Diagnose

### **API-Erweiterungen:**

```javascript
// Geplant: Logik-Vorlagen
await actuatorLogic.saveTemplate(logic, 'Temperatursteuerung')
await actuatorLogic.loadTemplate('Temperatursteuerung', targetEspId, targetGpio)

// Geplant: Advanced Mapping
await actuatorLogic.suggestCrossEspMapping(sourceEspId, targetEspId)
```

---

## **✅ ZUSAMMENFASSUNG**

Die Cross-ESP-Logik-Implementierung bietet:

- **🔗 Vollständige Cross-ESP-Unterstützung** - Sensoren können Aktoren auf anderen ESPs steuern
- **🔄 Rückwärtskompatibilität** - Bestehende Konfigurationen funktionieren weiterhin
- **🎯 Intuitive Benutzeroberfläche** - Globale Sensor-Auswahl mit visuellen Hinweisen
- **📋 Konfiguration-Transfer** - Einfaches Kopieren zwischen kompatiblen Aktoren
- **🔒 Sicherheit** - Validierung und Failsafe-Mechanismen
- **📊 Monitoring** - Erweiterte Statistiken und Überwachung

**Die Lösung folgt vollständig den bestehenden Code-Strukturen und erweitert diese konsistent für Mehrgeräte-Logik.**
