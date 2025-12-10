# 🎯 Apply-/Confirm-Workflow für Pin-Zuweisungen

## ✅ **Implementierung abgeschlossen**

Der vollständige **Apply-/Confirm-Mechanismus** für Pin-Zuweisungen wurde erfolgreich implementiert und ist produktionsbereit.

---

## 🏗️ **Architektur-Übersicht**

### **Store-Erweiterung: `espManagement.js`**

#### **Neue State-Properties:**

```javascript
// 🆕 NEU: Pending Pin Assignments für Apply/Confirm Workflow
pendingPinAssignments: new Map(), // Map<espId, Array<PinAssignment>>
pendingChangesCount: 0,
```

#### **Neue Getters:**

- `getPendingAssignments(espId)` - Alle pending assignments für einen ESP
- `hasPendingAssignments(espId)` - Prüft ob pending assignments existieren
- `getPendingCount(espId)` - Anzahl der pending assignments
- `getTotalPendingCount()` - Gesamtanzahl aller pending assignments

#### **Neue Actions:**

- `addPendingPinAssignment(espId, assignment)` - Fügt assignment zu pending hinzu
- `removePendingAssignment(espId, pendingId)` - Entfernt einzelnes pending assignment
- `clearPendingAssignments(espId)` - Löscht alle pending assignments
- `applyPendingChanges(espId)` - **Kern-Funktion**: Wendet alle pending changes an
- `exportPinConfig(espId)` - Erstellt Backup für Rollback
- `restorePinConfig(espId, backup)` - Stellt Konfiguration aus Backup wieder her

---

## 🎨 **UI-Erweiterung: `EnhancedPinConfiguration.vue`**

### **Neue UI-Elemente:**

#### **1. Pending Assignments Alert**

```vue
<v-alert v-if="hasPendingAssignments" type="warning" variant="tonal">
  <strong>Unbestätigte Änderungen:</strong>
  Es gibt {{ pendingCount }} unbestätigte Pin-Zuweisungen.
  
  <template v-slot:append>
    <v-btn @click="applyPendingChanges" :disabled="!mqttStore.isConnected">
      Änderungen bestätigen
    </v-btn>
    <v-btn @click="clearPendingAssignments">Verwerfen</v-btn>
  </template>
</v-alert>
```

#### **2. Pending Assignments Liste**

```vue
<v-card v-if="hasPendingAssignments">
  <v-card-title>Pending Assignments ({{ pendingCount }})</v-card-title>
  <v-list>
    <v-list-item v-for="assignment in pendingAssignments">
      <!-- Pending assignment mit Remove-Button -->
    </v-list-item>
  </v-list>
</v-card>
```

#### **3. Dialog-Action geändert**

```vue
<v-btn @click="addPendingAssignment" :disabled="!isAssignmentValid">
  Add to Pending
</v-btn>
```

---

## 🔄 **Workflow-Ablauf**

### **1. Pin-Zuweisung hinzufügen**

1. Benutzer wählt ESP, Pin, Typ, Name, Subzone
2. Klickt "Add to Pending" (nicht mehr "Assign")
3. Assignment wird zu `pendingPinAssignments` hinzugefügt
4. UI zeigt pending assignments an

### **2. Änderungen bestätigen**

1. Benutzer klickt "Änderungen bestätigen"
2. System erstellt Backup der aktuellen Konfiguration
3. Alle pending assignments werden sequentiell via MQTT gesendet:
   - `configurePiSensor()` für Sensoren
   - `configureActuator()` für Aktoren
   - `sendI2CConfiguration()` für I2C-Sensoren
4. Bei Erfolg: Persistierung + Cleanup + Success-Feedback
5. Bei Fehler: Automatischer Rollback + Error-Feedback

### **3. Änderungen verwerfen**

1. Benutzer klickt "Verwerfen"
2. Alle pending assignments werden gelöscht
3. UI wird zurückgesetzt

---

## 🛡️ **Sicherheits-Features**

### **Rollback-Mechanismus:**

- **Backup vor Anwendung**: `exportPinConfig()` erstellt deep clone
- **Automatischer Rollback**: Bei MQTT-Fehler wird Backup wiederhergestellt
- **Benutzer-Feedback**: Klare Meldungen über Erfolg/Fehler

### **MQTT-Sicherheit:**

- **Verbindungsprüfung**: "Bestätigen"-Button deaktiviert bei MQTT-Disconnect
- **Sequenzielle Ausführung**: Alle Befehle werden nacheinander gesendet
- **Fehler-Stopp**: Bei erstem Fehler wird gestoppt und Rollback ausgeführt

### **Validierung:**

- **Board-spezifische Validierung**: Pin-Validierung je nach Board-Typ
- **I2C-Spezialbehandlung**: I2C-Sensoren nur auf korrekten SDA-Pins
- **Konflikt-Prüfung**: Verhindert doppelte Pin-Zuweisungen

---

## 🧪 **Test-Szenarien**

### **✅ Erfolgreiche Anwendung:**

1. Mehrere Sensoren/Aktoren hinzufügen → "Bestätigen" → Alle werden konfiguriert
2. I2C-Sensor hinzufügen → "Bestätigen" → I2C-Konfiguration wird gesendet
3. Mixed Sensor/Aktor → "Bestätigen" → Beide Typen werden korrekt konfiguriert

### **✅ Rollback bei Fehler:**

1. MQTT-Disconnect während Anwendung → Rollback + Error-Message
2. Backend-Fehler → Rollback + Error-Message
3. Timeout → Rollback + Timeout-Message

### **✅ UI-Verhalten:**

1. Pending assignments werden korrekt angezeigt
2. "Bestätigen"-Button deaktiviert bei MQTT-Disconnect
3. Einzelne pending assignments können entfernt werden
4. "Verwerfen" löscht alle pending assignments

---

## 📊 **Technische Details**

### **MQTT-Kommandos (unverändert):**

- `configurePiSensor(espId, gpio, type, name, subzone)`
- `configureActuator(espId, gpio, type, name, subzone)`
- `sendI2CConfiguration(espId, config)`

### **Backup-Struktur:**

```javascript
{
  espId: string,
  subzones: Array<[string, Subzone]>,
  sensors: Array<[string, Sensor]>,
  actuators: Array<[string, Actuator]>,
  kaiserZone: object,
  masterZone: object,
  boardType: string,
  status: string,
  lastUpdate: number
}
```

### **Pending Assignment Struktur:**

```javascript
{
  gpio: number,
  type: string,
  name: string,
  subzone: string,
  category: 'sensor' | 'actuator',
  i2cAddress?: string,
  sensorHint?: string,
  pendingId: string,
  timestamp: number
}
```

---

## 🚀 **Deployment-Status**

### **✅ Implementiert:**

- [x] Store-Erweiterung mit pending assignments
- [x] UI-Erweiterung mit Apply/Confirm-Workflow
- [x] Rollback-Mechanismus mit Backup/Restore
- [x] MQTT-Integration mit Fehlerbehandlung
- [x] Board-spezifische Validierung
- [x] I2C-Sensor Support
- [x] Benutzer-Feedback via Snackbar

### **✅ Getestet:**

- [x] Erfolgreiche Anwendung mehrerer Änderungen
- [x] Rollback bei MQTT-Fehlern
- [x] UI-Verhalten bei verschiedenen Zuständen
- [x] Board-spezifische Pin-Validierung
- [x] I2C-Sensor Konfiguration

### **✅ Produktionsbereit:**

- [x] Vollständige Fehlerbehandlung
- [x] Benutzerfreundliche UI
- [x] Sichere Rollback-Mechanismen
- [x] Rückwärtskompatibilität gewährleistet

---

## 📝 **Nutzung**

### **Für Entwickler:**

```javascript
// Pending assignment hinzufügen
espStore.addPendingPinAssignment(espId, {
  gpio: 4,
  type: 'SENSOR_TEMP_DS18B20',
  name: 'Temperature Sensor',
  subzone: 'greenhouse',
  category: 'sensor',
})

// Pending changes anwenden
await espStore.applyPendingChanges(espId)

// Pending changes verwerfen
espStore.clearPendingAssignments(espId)
```

### **Für Benutzer:**

1. **Pin-Zuweisung**: ESP auswählen → Pin konfigurieren → "Add to Pending"
2. **Bestätigung**: "Änderungen bestätigen" klicken
3. **Verwerfung**: "Verwerfen" klicken um Änderungen zu löschen

---

**Status:** ✅ **Produktionsbereit**  
**Version:** v3.4.1  
**Letzte Aktualisierung:** Dezember 2024  
**Kompatibilität:** ESP32 Advanced Sensor Network System v3.4.1
