# GPIO-Owner-Mismatch Analyse

> **Datum:** 2026-02-03
> **Status:** Root Cause identifiziert
> **Schweregrad:** Kritisch (blockiert OneWire-Sensor-Konfiguration)

---

## Executive Summary

Der GPIO-Konflikt entsteht durch inkonsistente Owner-String-Konventionen zwischen `OneWireBusManager` und `SensorManager`. Der Bus setzt `"sensor"` als Owner, aber der SensorManager erwartet `"onewire_bus/4"`.

---

## 1. OneWireBusManager Reservation

**Datei:** [onewire_bus.cpp](El%20Trabajante/src/drivers/onewire_bus.cpp#L76)
**Zeile:** 76

**Code:**
```cpp
if (!gpioManager.requestPin(pin_, "sensor", "OneWireBus")) {
```

| Parameter | Wert |
|-----------|------|
| **gpio** | `pin_` (z.B. 4) |
| **owner** | `"sensor"` |
| **component_name** | `"OneWireBus"` |

**Effekt:** GPIO 4 wird mit Owner `"sensor"` und Component `"OneWireBus"` reserviert.

---

## 2. GPIOManager Speicherung

**Datei:** [gpio_manager.cpp](El%20Trabajante/src/drivers/gpio_manager.cpp#L97-L128)
**Zeilen:** 97-128

**Signatur:**
```cpp
bool GPIOManager::requestPin(uint8_t gpio, const char* owner, const char* component_name)
```

**Speicherung (Zeilen 115-118):**
```cpp
strncpy(pin_info.owner, owner, sizeof(pin_info.owner) - 1);
pin_info.owner[sizeof(pin_info.owner) - 1] = '\0';
strncpy(pin_info.component_name, component_name, sizeof(pin_info.component_name) - 1);
pin_info.component_name[sizeof(pin_info.component_name) - 1] = '\0';
```

**Log-Ausgabe (Zeile 121):**
```cpp
LOG_INFO("GPIOManager: Pin " + String(gpio) + " allocated to " + String(component_name));
// Ergibt: "GPIOManager: Pin 4 allocated to OneWireBus"
```

**Gespeicherte Werte für GPIO 4:**
| Feld | Wert |
|------|------|
| `pin_info.owner` | `"sensor"` |
| `pin_info.component_name` | `"OneWireBus"` |

---

## 3. GPIOManager Query-Methoden

**Datei:** [gpio_manager.cpp](El%20Trabajante/src/drivers/gpio_manager.cpp#L319-L335)

### getPinOwner() - Zeilen 319-326
```cpp
String GPIOManager::getPinOwner(uint8_t gpio) const {
    for (const auto& pin_info : pins_) {
        if (pin_info.pin == gpio && pin_info.owner[0] != '\0') {
            return String(pin_info.owner);  // Gibt "sensor" zurück
        }
    }
    return "";
}
```

### getPinComponent() - Zeilen 328-335
```cpp
String GPIOManager::getPinComponent(uint8_t gpio) const {
    for (const auto& pin_info : pins_) {
        if (pin_info.pin == gpio && pin_info.component_name[0] != '\0') {
            return String(pin_info.component_name);  // Gibt "OneWireBus" zurück
        }
    }
    return "";
}
```

---

## 4. SensorManager Validierung

**Datei:** [sensor_manager.cpp](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L360-L387)
**Zeilen:** 360-387

### Owner-Abfrage (Zeile 361):
```cpp
String owner = gpio_manager_->getPinOwner(config.gpio);
```
**Ergebnis:** `owner = "sensor"` (von GPIOManager zurückgegeben)

### Erwarteter Owner (Zeile 362):
```cpp
String expected_owner = "onewire_bus/" + String(config.gpio);
```
**Ergebnis:** `expected_owner = "onewire_bus/4"`

### Validierungs-Logik (Zeilen 364-387):
```cpp
if (owner.length() == 0) {
    // CASE 1: Pin free → Reserve with shared owner name
    if (!gpio_manager_->requestPin(config.gpio, "sensor", expected_owner.c_str())) {
        // ...
    }
} else if (owner == expected_owner) {
    // CASE 2: Pin already reserved for OneWire → Sharing OK
    LOG_INFO("SensorManager: Sharing OneWire bus on GPIO ...");
} else {
    // CASE 3: Pin used by other device → ERROR  ← HIER LANDEN WIR
    LOG_ERROR("SensorManager: GPIO " + String(config.gpio) +
             " already in use by: " + owner + " (expected: free or " +
             expected_owner + ")");
    errorTracker.trackError(ERROR_GPIO_CONFLICT, ...);
    return false;
}
```

---

## 5. String-Mismatch

| Aspekt | Wert |
|--------|------|
| **Gesetzt durch OneWireBus** | `"sensor"` (owner) + `"OneWireBus"` (component) |
| **Erwartet durch SensorManager** | `"onewire_bus/4"` (als owner) |
| **Match?** | **NEIN** |

### Vergleich der Werte:

| Schritt | Akteur | Aktion | Wert |
|---------|--------|--------|------|
| 1. Boot | OneWireBusManager | `requestPin(4, "sensor", "OneWireBus")` | owner=`"sensor"` |
| 2. Config | SensorManager | `getPinOwner(4)` | Erhält `"sensor"` |
| 3. Config | SensorManager | Berechnet expected | `"onewire_bus/4"` |
| 4. Config | SensorManager | Vergleich | `"sensor" != "onewire_bus/4"` |
| 5. Config | SensorManager | Ergebnis | **ERROR_GPIO_CONFLICT** |

---

## 6. Root Cause

**Inkonsistente Owner-String-Konvention:**

Der `OneWireBusManager` und der `SensorManager` verwenden unterschiedliche Konventionen für den Owner-String:

1. **OneWireBusManager** verwendet die generische Kategorie `"sensor"` als Owner
   - Begründung: Der Bus ist für Sensoren gedacht
   - Component-Name `"OneWireBus"` enthält die spezifische Information

2. **SensorManager** erwartet einen spezifischen Owner `"onewire_bus/{gpio}"`
   - Begründung: Ermöglicht Bus-Sharing-Erkennung über Owner-String
   - Würde selbst `requestPin(gpio, "sensor", "onewire_bus/4")` aufrufen

**Architektonisches Problem:**
- Der SensorManager hat eine spezifischere Owner-Konvention als der OneWireBusManager
- Der SensorManager nutzt `getPinOwner()` statt `getPinComponent()` für die Validierung
- Es gibt keine dokumentierte Konvention für Owner-Strings bei Bus-Sharing

---

## 7. Betroffene Code-Stellen

| Datei | Zeile | Problem |
|-------|-------|---------|
| [onewire_bus.cpp](El%20Trabajante/src/drivers/onewire_bus.cpp#L76) | 76 | Setzt `"sensor"` als Owner statt spezifischen Bus-Identifier |
| [sensor_manager.cpp](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L362) | 362 | Erwartet `"onewire_bus/{gpio}"` als Owner |
| [sensor_manager.cpp](El%20Trabajante/src/services/sensor/sensor_manager.cpp#L375) | 375 | Vergleicht nur Owner, ignoriert Component |

---

## 8. Lösungsoptionen (nur Auflistung, keine Implementierung)

### Option A: OneWireBusManager anpassen
```cpp
// onewire_bus.cpp:76 ändern zu:
String bus_owner = "onewire_bus/" + String(pin_);
if (!gpioManager.requestPin(pin_, "sensor", bus_owner.c_str())) {
```
- **Pro:** Konsistent mit SensorManager-Erwartung
- **Contra:** Breaking Change für bestehende GPIO-Status-Logs

### Option B: SensorManager Component-Check hinzufügen
```cpp
// sensor_manager.cpp:361-362 ändern zu:
String owner = gpio_manager_->getPinOwner(config.gpio);
String component = gpio_manager_->getPinComponent(config.gpio);

// Zusätzlich in CASE 3 prüfen:
if (owner == "sensor" && component == "OneWireBus") {
    // Bus bereits initialisiert durch OneWireBusManager → OK
}
```
- **Pro:** Keine Änderung am OneWireBusManager nötig
- **Contra:** Komplexere Validierungslogik

### Option C: Owner-Konvention vereinheitlichen
- Dokumentierte Konvention: `"{category}/{bus_type}/{gpio}"`
- z.B. `"sensor/onewire/4"` oder `"sensor/i2c/sda"`
- **Pro:** Zukunftssicher, skalierbar
- **Contra:** Größerer Refactoring-Aufwand

### Option D: Boot-Reihenfolge ändern
- SensorManager initialisiert den OneWire-Bus (nicht OneWireBusManager)
- OneWireBusManager wird nur als Utility-Klasse verwendet
- **Pro:** Zentrale GPIO-Verwaltung im SensorManager
- **Contra:** Architektur-Änderung, möglicherweise andere Abhängigkeiten

---

## 9. Empfehlung

**Option A** ist die minimal-invasive Lösung mit dem geringsten Risiko.

Die Änderung betrifft nur eine Zeile in `onewire_bus.cpp` und macht den Owner-String konsistent mit der SensorManager-Erwartung. Der Component-Name bleibt `"OneWireBus"` für Debugging-Zwecke.

---

## 10. Sequenzdiagramm (Ist-Zustand)

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  main.cpp   │     │OneWireBus   │     │ GPIOManager  │
│   (Boot)    │     │  Manager    │     │              │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘
       │                   │                   │
       │ begin(4)          │                   │
       │──────────────────►│                   │
       │                   │                   │
       │                   │ requestPin(4, "sensor", "OneWireBus")
       │                   │──────────────────►│
       │                   │                   │ stores: owner="sensor"
       │                   │        OK         │         component="OneWireBus"
       │                   │◄──────────────────│
       │                   │                   │

... später bei Config-Empfang ...

┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│ ConfigMgr   │     │SensorManager│     │ GPIOManager  │
└──────┬──────┘     └──────┬──────┘     └──────┬───────┘
       │                   │                   │
       │ addSensor(DS18B20,│                   │
       │           GPIO=4) │                   │
       │──────────────────►│                   │
       │                   │                   │
       │                   │ getPinOwner(4)    │
       │                   │──────────────────►│
       │                   │      "sensor"     │
       │                   │◄──────────────────│
       │                   │                   │
       │                   │ expected = "onewire_bus/4"
       │                   │ "sensor" != "onewire_bus/4"
       │                   │                   │
       │    ERROR_GPIO_    │                   │
       │    CONFLICT       │                   │
       │◄──────────────────│                   │
```

---

*Analyse abgeschlossen. Keine Implementierung durchgeführt.*
