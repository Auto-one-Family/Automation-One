# BUG-006 & BUG-008 Fix-Report

**Datum:** 2026-02-02
**Agent:** Bug-Fix-Agent
**Bugs:** BUG-006 (Device Not Found), BUG-008 (Actuator Commands ignoriert)

---

## 1. Root-Cause Analyse

### BUG-006: Device Not Found

**Symptom:** Server meldet "Device not found" obwohl ESP online ist

**Ursache:** Der API-Endpoint `POST /api/v1/actuators/{esp_id}/{gpio}/command` prüft vor dem Senden eines Commands:
1. **ESP muss in der DB registriert sein** - via Heartbeat auto-registriert
2. **Actuator muss in der DB existieren** - muss explizit via API erstellt werden

Der Fehler "Device not found" tritt auf wenn:
- ESP nie einen Heartbeat gesendet hat (kein Auto-Discovery)
- Oder der Actuator nie über die API erstellt wurde (nur via direktem MQTT konfiguriert)

**Betroffene Datei(en):**
- `El Servador/god_kaiser_server/src/api/v1/actuators.py:436-448`

### BUG-008: Actuator Commands ignoriert

**Symptom:** ESP empfängt MQTT-Message aber führt Command nicht aus

**Ursache:** Der ESP-Handler `handleActuatorCommand()` prüft ob der Actuator lokal konfiguriert ist:
- `findActuator(gpio)` gibt `nullptr` zurück wenn kein Actuator auf diesem GPIO registriert ist
- Dies passiert wenn die Config-Message nie beim ESP ankam (ESP offline beim Push)
- Oder der Actuator nie konfiguriert wurde

Die bisherige Response war generisch "Command failed" ohne spezifischen Grund.

**Betroffene Datei(en):**
- `El Trabajante/src/services/actuator/actuator_manager.cpp:537-576`

### Zusammenhang

Die Bugs sind **eng verknüpft** und haben die gleiche Grundursache: **Asynchrone Konfiguration**.

```
Korrekter Workflow:
1. ESP sendet Heartbeat → Server registriert ESP in DB
2. User erstellt Actuator via PUT /api/v1/actuators/{esp_id}/{gpio}
3. Server speichert in DB UND sendet Config zu ESP via MQTT
4. BEIDE Seiten kennen jetzt den Actuator
5. Commands funktionieren

Fehlerfall:
- Schritt 2 oder 3 übersprungen/fehlgeschlagen
- → Server oder ESP kennt den Actuator nicht
- → "Device not found" (Server) oder "Command failed" (ESP)
```

---

## 2. Implementierte Fixes

### Fix 1: ESP - Detaillierte Error-Response

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp`

**Änderung:** `handleActuatorCommand()` prüft jetzt VOR der Command-Ausführung ob der Actuator existiert und sendet eine spezifische Fehlermeldung.

```cpp
// Vorher:
bool success = false;
if (command.command.equalsIgnoreCase("ON")) {
  success = controlActuatorBinary(gpio, true);
}
// ...
publishActuatorResponse(command, success,
                        success ? "Command executed" : "Command failed");

// Nachher:
RegisteredActuator* actuator = findActuator(gpio);
if (!actuator || !actuator->driver) {
  LOG_ERROR("╔════════════════════════════════════════╗");
  LOG_ERROR("║  ACTUATOR COMMAND FAILED               ║");
  LOG_ERROR("╚════════════════════════════════════════╝");
  LOG_ERROR("No actuator configured on GPIO " + String(gpio));
  LOG_ERROR("Hint: Send config first via kaiser/{id}/esp/{esp_id}/config");

  String errorMessage = "Actuator not configured on GPIO " + String(gpio) +
                        ". Configure via API first.";
  publishActuatorResponse(command, false, errorMessage);
  return false;
}

// Check emergency stop state
if (actuator->emergency_stopped) {
  publishActuatorResponse(command, false,
                          "Actuator in emergency stop state. Clear emergency first.");
  return false;
}
```

**Begründung:** User und Debugging-Tools sehen jetzt genau WARUM ein Command fehlschlägt.

### Fix 2: ESP - controlActuatorBinary Logging

**Datei:** `El Trabajante/src/services/actuator/actuator_manager.cpp`

**Änderung:** Fehlendes Error-Logging in `controlActuatorBinary()` hinzugefügt.

```cpp
// Vorher:
if (!actuator || !actuator->driver) {
  return false;  // Kein Logging!
}

// Nachher:
if (!actuator || !actuator->driver) {
  LOG_ERROR("controlActuatorBinary: actuator not found on GPIO " + String(gpio));
  errorTracker.trackError(ERROR_ACTUATOR_NOT_FOUND,
                          ERROR_SEVERITY_ERROR,
                          "Actuator missing (binary control)");
  return false;
}
```

### Fix 3: Server - Detaillierte Error-Messages mit Hints

**Datei:** `El Servador/god_kaiser_server/src/api/v1/actuators.py`

**Änderung:** HTTP-Fehlerantworten enthalten jetzt strukturierte Details mit Hints.

```python
# Vorher:
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=f"ESP device '{esp_id}' not found",
)

# Nachher:
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail={
        "error": "ESP_NOT_FOUND",
        "message": f"ESP device '{esp_id}' not found",
        "hint": "ESP must send heartbeat to register. Check if ESP is online and connected to MQTT.",
    },
)
```

Analog für "ACTUATOR_NOT_FOUND" und "ACTUATOR_DISABLED".

**Begründung:** Frontend und API-Clients können jetzt strukturierte Fehler anzeigen und dem User konkrete Lösungsschritte vorschlagen.

---

## 3. Verifikation

### Build-Status

| Komponente | Status | Details |
|------------|--------|---------|
| ESP32 | ✅ SUCCESS | Build in 20.14s, RAM: 22.3%, Flash: 88.8% |
| Server | ✅ Syntax OK | py_compile erfolgreich |

### Erwartetes Verhalten nach Fix

| Szenario | Vor Fix | Nach Fix |
|----------|---------|----------|
| ESP nicht in DB | HTTP 404: "ESP device not found" | HTTP 404: `{"error": "ESP_NOT_FOUND", "hint": "ESP must send heartbeat..."}` |
| Actuator nicht in DB | HTTP 404: "Actuator not found" | HTTP 404: `{"error": "ACTUATOR_NOT_FOUND", "hint": "Create via PUT..."}` |
| Actuator nicht auf ESP | MQTT Response: "Command failed" | MQTT Response: "Actuator not configured on GPIO X. Configure via API first." |
| Emergency Stop aktiv | MQTT Response: "Command failed" | MQTT Response: "Actuator in emergency stop state. Clear emergency first." |

---

## 4. Geänderte Dateien

| Datei | Änderungstyp | Zeilen |
|-------|--------------|--------|
| `El Trabajante/src/services/actuator/actuator_manager.cpp` | Modifiziert | 537-600, 382-392 |
| `El Servador/god_kaiser_server/src/api/v1/actuators.py` | Modifiziert | 436-468 |

---

## 5. Empfehlungen für Follow-up

### Sofort (High Priority)

1. **Live-Test durchführen:**
   ```bash
   # Terminal 1: MQTT-Traffic beobachten
   mosquitto_sub -h localhost -t "kaiser/god/esp/+/actuator/#" -v

   # Terminal 2: Command senden (sollte jetzt detaillierte Error zeigen)
   curl -X POST "http://localhost:8000/api/v1/actuators/ESP_NONEXISTENT/26/command" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer $TOKEN" \
     -d '{"command": "ON"}'
   ```

2. **Frontend anpassen:** Die strukturierten Fehlermeldungen (`error`, `message`, `hint`) im Frontend anzeigen.

### Mittelfristig

3. **Config-Sync-Mechanismus:** Beim ESP-Boot die aktuelle Config vom Server anfordern, um sicherzustellen, dass ESP und Server synchron sind.

4. **Actuator-Auto-Discovery:** Wenn ESP einen Actuator via Heartbeat meldet, automatisch in der DB anlegen (optional, mit Flag "auto_discovered").

### Langfristig

5. **State-Machine für Actuator-Lifecycle:**
   - `UNCONFIGURED` → `CONFIGURED` → `READY` → `ACTIVE`
   - Bessere Sichtbarkeit des aktuellen Zustands

---

## 6. Workflow für korrektes Actuator-Setup

```
1. ESP einschalten
   └─► ESP sendet Heartbeat
   └─► Server auto-registriert mit status="pending_approval"

2. ESP genehmigen (optional, je nach Security-Config)
   └─► Admin approved ESP via API
   └─► status="approved"

3. Actuator erstellen
   └─► PUT /api/v1/actuators/{esp_id}/{gpio}
   └─► Server speichert in DB
   └─► Server sendet Config zu ESP via MQTT
   └─► ESP konfiguriert Actuator lokal

4. Commands senden
   └─► POST /api/v1/actuators/{esp_id}/{gpio}/command
   └─► Server prüft DB → OK
   └─► Server sendet MQTT → ESP empfängt
   └─► ESP prüft lokale Config → OK
   └─► ESP führt aus und sendet Response
```

---

**Report erstellt:** 2026-02-02
**Fixes implementiert:** Ja
**Build-Verifikation:** Bestanden
**Live-Test:** Ausstehend (manuell durchführen)
