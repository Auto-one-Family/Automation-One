# 🔍 **PHASE B: ZIRKULÄRE ABHÄNGIGKEITEN - CODEBASE-ANALYSE & LÖSUNG**

## **📊 ERGEBNIS DER CODEBASE-ANALYSE**

### **🔍 IDENTIFIZIERTE ZIRKULÄRE ABHÄNGIGKEITEN:**

#### **KRITISCHE ZIRKULÄRE KETTEN:**

```
1. centralConfig.js ↔ mqtt.js (BIDIREKTIONAL)
   - centralConfig.js: import { useMqttStore } from './mqtt' (Zeile 8)
   - mqtt.js: import { useCentralConfigStore } from './centralConfig' (Zeile 17)

2. centralDataHub.js → ALLE STORES (ZENTRALER HUB)
   - Importiert alle anderen Stores (Zeilen 1-14)
   - Wird von mindmapStore.js importiert (Zeile 2)

3. espManagement.js → centralConfig.js + mqtt.js
   - Importiert beide kritischen Stores (Zeilen 1-2)

4. actuatorLogic.js → mqtt.js + systemCommands.js + sensorRegistry.js
   - Mehrfache Abhängigkeiten
```

### **🎯 BESTEHENDE EVENT-STRUKTUR ANALYSIERT:**

#### **✅ BEREITS VORHANDENE EVENT-DEFINITIONEN:**

```javascript
// src/utils/eventBus.js - Vollständige Event-Struktur vorhanden
MQTT_EVENTS = {
  // Store-zu-Store Kommunikation bereits definiert
  KAISER_ID_CHANGED: 'mqtt:kaiser_id_changed',
  CENTRAL_CONFIG_UPDATE: 'mqtt:central_config_update',
  MQTT_ACTION_NEEDED: 'mqtt:action_needed',
  ESP_KAISER_TRANSFER: 'mqtt:esp_kaiser_transfer',
  ESP_ZONE_CHANGED: 'mqtt:esp_zone_changed',
  // ... weitere 50+ Events bereits definiert
}
```

#### **✅ BEREITS VORHANDENE EVENT-LISTENER:**

```javascript
// centralConfig.js - Zeile 1901
initializeEventListeners() {
  // Bereits implementiert
}

// mqtt.js - Zeile 3671
initializeEventListeners() {
  // Bereits implementiert
}

// centralDataHub.js - Zeile 2415
initializeEventListeners() {
  // Bereits implementiert
}
```

---

## **🔥 PHASE B-1: STORE-IMPORT-DEPENDENCIES AUFLÖSEN**

### **SCHRITT 1: centralConfig.js → mqtt.js Import entfernen**

**DATEI:** `src/stores/centralConfig.js`
**ZEILE 8:** `import { useMqttStore } from './mqtt'` ❌ ENTFERNEN

**ERSETZEN DURCH EVENT-BASIERTE KOMMUNIKATION:**
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
search_replace
