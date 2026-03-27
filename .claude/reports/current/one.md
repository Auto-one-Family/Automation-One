# Auftrag FW-01: NVS-Delete-Bug + OneWire-Scan-Fix

> **Bereich:** El Trabajante (ESP32 Firmware, C++ / Arduino Framework)
> **Prio:** KRITISCH — verhindert funktionierendes Sensor/Aktor-Lifecycle
> **Datum:** 2026-03-26
> **Einschaetzung:** 2-3 Stunden, chirurgisch — keine Architektureaenderung

---

## Kontext: Was das System macht

AutomationOne hat eine 3-Schichten-Architektur:
- **El Servador** (FastAPI-Server): Zentrale Datenbank (PostgreSQL). Wahrheit ueber welche Sensoren/Aktoren existieren.
- **El Trabajante** (ESP32-Firmware): Laedt Konfiguration beim Boot aus NVS (Non-Volatile Storage im Flash). NVS ist der persistente Speicher des ESP32 ueber Reboots hinweg.
- **Synchronisationsregel:** Was im Backend-DB steht, muss im ESP-NVS widergespiegelt werden. Diskrepanz zwischen DB und NVS fuehrt zu Geist-Sensoren.

**Delete-Pipeline (SOLL-Ablauf):**
1. User loescht Sensor/Aktor im Frontend
2. Backend loescht den Eintrag aus `sensor_configs` / `actuator_configs` (Hard-Delete, kein Soft-Delete)
3. Backend sendet MQTT-Delete-Command an ESP
4. ESP empfaengt Command, entfernt aus RAM UND loescht aus NVS
5. Backend broadcastet per WebSocket an Frontend

**IST-Problem:** Schritt 4 ist unvollstaendig. ESP entfernt den Sensor/Aktor aus dem RAM, aber der NVS-Eintrag bleibt bestehen. Nach dem naechsten Reboot laedt die Firmware die alte NVS-Konfiguration und registriert den geloeschten Sensor/Aktor neu.

---

## Bug 1: NVS nicht bereinigt nach Delete-Command (KRITISCH)

### Symptome
- Sensor/Aktor wird geloescht (Backend OK, Frontend zeigt nichts mehr)
- Nach ESP-Reboot ist Sensor/Aktor wieder da
- Frontend kann den wiederaufgetauchten Sensor/Aktor nicht neu konfigurieren (GPIO intern belegt)
- Backend und ESP sind asynchron: DB sagt "geloescht", ESP sagt "aktiv"

### Root Cause

Beim Empfang eines Delete-MQTT-Commands entfernt der ESP den Sensor/Aktor aus der RAM-Struktur (SensorManager, ActuatorManager), ruft aber nicht die entsprechende NVS-Loesch-Funktion auf.

**Betroffene Dateien (zu pruefen):**
- `src/managers/SensorManager.cpp` / `.h` — `removeSensor()` oder aequivalente Funktion
- `src/managers/ActuatorManager.cpp` / `.h` — `removeActuator()` oder aequivalente Funktion
- `src/mqtt/CommandHandler.cpp` (oder aequivalent) — MQTT-Handler fuer delete/remove Commands
- `src/storage/NVSManager.cpp` / `.h` — NVS-Lese/Schreib/Loeschfunktionen

### IST-Verhalten (vereinfacht)

```cpp
// CommandHandler.cpp — MQTT-Delete-Command Handler (IST)
void handleDeleteSensor(const char* gpio) {
    sensorManager.removeSensor(gpio);  // Entfernt aus RAM
    // NVS wird NICHT bereinigt — Bug!
    // Beim naechsten Boot: configureSensorsFromNVS() laedt alten Eintrag wieder
}
```

### SOLL-Verhalten

```cpp
// CommandHandler.cpp — MQTT-Delete-Command Handler (SOLL)
void handleDeleteSensor(const char* gpio) {
    sensorManager.removeSensor(gpio);           // Entfernt aus RAM
    nvsManager.deleteSensorConfig(gpio);        // NEUES: NVS-Eintrag loeschen
    // Optional: MQTT-ACK zuruecksenden
}

void handleDeleteActuator(const char* gpio) {
    actuatorManager.removeActuator(gpio);       // Entfernt aus RAM
    nvsManager.deleteActuatorConfig(gpio);      // NEUES: NVS-Eintrag loeschen
}
```

**NVS-Delete-Funktion (falls noch nicht vorhanden):**

Der NVS in Arduino/ESP-IDF verwendet Namespaces und Keys. Typisches Muster fuer Sensoren:

```cpp
// NVSManager.cpp
bool NVSManager::deleteSensorConfig(const char* gpio) {
    char key[32];
    snprintf(key, sizeof(key), "sensor_%s", gpio);

    nvs_handle_t handle;
    esp_err_t err = nvs_open("sensors", NVS_READWRITE, &handle);
    if (err != ESP_OK) return false;

    err = nvs_erase_key(handle, key);
    nvs_commit(handle);
    nvs_close(handle);

    return (err == ESP_OK || err == ESP_ERR_NVS_NOT_FOUND);  // Nicht-existenter Key = OK
}
```

**Wichtig:** Das genaue NVS-Schema (Namespace-Name, Key-Format) haengt von der bestehenden Implementierung ab. Vor dem Fix: bestehende NVS-Schreib-Funktionen (`saveSensorConfig`, `saveActuatorConfig`) lesen um das genaue Format zu kennen, dann die Delete-Funktion symmetrisch aufbauen.

### Verifikation Bug 1

1. Sensor oder Aktor ueber das Frontend hinzufuegen → ESP konfiguriert ihn
2. Sensor/Aktor loeschen → ESP empfaengt Delete-Command
3. ESP manuell rebooten (Power-Cycle oder Reset-Button)
4. **Erwartung:** Sensor/Aktor taucht NICHT mehr auf (weder in ESP-Logs noch in MQTT-Daten)
5. **Fehlschlag:** Sensor/Aktor taucht nach Reboot wieder auf → NVS-Bug besteht noch

---

## Bug 2: OneWire-Scan findet DS18B20 auf GPIO 13 / GPIO 14 nicht (MITTEL)

### Symptome
- DS18B20-Sensoren auf GPIO 13 und GPIO 14 werden beim OneWire-Bus-Scan nicht gefunden
- GPIO 14 war zuvor fuer einen Aktor konfiguriert (jetzt aber in der DB geloescht)
- Scan liefert 0 gefundene Geraete oder schlaegt fehl

### Moegliche Ursachen (zu pruefen in dieser Reihenfolge)

**Ursache A — GPIO-Konfliktpruefung blockiert den Scan:**
Der OneWire-Scan-Code pruefte vor dem Scan ob ein GPIO bereits belegt ist. Falls der GPIO 14 noch im internen ESP-GPIO-Register steht (wegen Bug 1: NVS-Eintrag noch vorhanden), wird der Pin beim Scan uebersprungen.

Pruefen: Gibt es in der Scan-Funktion eine Pruefung wie `if (gpioIsRegistered(pin)) continue;` vor dem Scan? Falls ja: Diese Pruefung muss entfernt oder angepasst werden. Ein Scan-Befehl soll den Pin IMMER scannen, unabhaengig von gespeicherten Konfigurationen.

**Ursache B — OneWire-Bus nicht initialisiert auf dem Pin:**
OneWire benoetigt einen Pull-up-Widerstand (4.7kOhm) an DATA. Ohne Pull-up antwortet kein Sensor. Das ist Hardware — aber: Der Code-seitige Befehl `oneWire.reset()` schlaegt bei fehlendem Pull-up einfach lautlos fehl.

Falls GPIO 13 und GPIO 14 beide als OneWire-Bus betrieben werden sollen: Das ist ungewoehnlich. Normalerweise teilen sich alle DS18B20-Sensoren einen gemeinsamen Bus auf EINEM GPIO. Falls beide Pins gemeint sind als separater Bus, muss jeder separat initialisiert und gescannt werden.

**Ursache C — Scan-Antwort kommt nicht zurueck zum Backend:**
Der ESP-Scan gibt die gefundenen Adressen per MQTT zurueck. Falls der MQTT-Publish fehlschlaegt oder der Backend-Handler die Antwort nicht korrekt parst, zeigt das Frontend "keine Geraete" obwohl der Scan technisch funktioniert hat.

Pruefen: ESP-Logs waehrend des Scans anschauen. Werden Adressen gefunden (Serial/UART-Log), aber nicht per MQTT zurueckgesendet?

### SOLL-Verhalten

```
OneWire-Scan auf GPIO 13:
→ Bus wird initialisiert (OneWire-Objekt auf GPIO 13)
→ DallasTemperature.begin()
→ getDeviceCount() > 0
→ Adresse wird ausgelesen und per MQTT gepublished
→ Backend empfaengt Adresse, speichert in sensor_configs

OneWire-Scan auf GPIO 14 (wenn als separater Bus):
→ Identischer Ablauf fuer GPIO 14
```

### Verifikation Bug 2

1. DS18B20 an GPIO 13 anschliessen (mit 4.7kOhm Pull-up an 3.3V)
2. OneWire-Scan triggern (via Frontend oder direkt via MQTT-Command)
3. ESP-Logs beobachten: Wird ein Geraet gefunden? Wird die Adresse per MQTT gesendet?
4. Backend-Logs pruefen: Kommt die MQTT-Nachricht an?
5. **Erwartung:** Frontend zeigt gefundene DS18B20-Adresse an

---

## Zusammenhang der Bugs

Bug 1 (NVS) und Bug 2 (OneWire-Scan) sind technisch unabhaengig, interagieren aber:

- GPIO 14 war als Aktor konfiguriert → wurde geloescht (DB ist sauber)
- Wegen Bug 1 steht GPIO 14 aber noch im NVS des ESP
- Falls der Scan-Code GPIO-Register prueft: Der ESP haelt GPIO 14 noch fuer "belegt" und ueberspringt ihn beim Scan
- Fix-Reihenfolge: Bug 1 zuerst loesen, dann Bug 2 verifizieren

**Empfohlene Reihenfolge:**
1. NVS-Delete-Funktion implementieren (Bug 1)
2. Manuell: NVS komplett leeren (`nvs_erase_all` oder ueber ESP32-NVS-Tool) um sauberen Zustand herzustellen
3. OneWire-Scan neu testen (Bug 2)
4. Falls Scan immer noch nicht funktioniert: Ursache B und C pruefen

---

## Was NICHT geaendert wird

- Backend-Loeschlogik (ist korrekt: Hard-Delete in actuator_configs/sensor_configs)
- Frontend-Delete-Aufruf (war bereits auf config_id umgestellt, T10-Fix-B)
- MQTT-Command-Protokoll (nur die Firmware-Seite des Handlers)
- NVS-Boot-Loading (configureSensorsFromNVS laeuft weiterhin beim Boot — der Inhalt muss einfach korrekt sein)

---

## Akzeptanzkriterien

- [ ] Sensor loeschen → nach Reboot NICHT mehr aktiv
- [ ] Aktor loeschen → nach Reboot NICHT mehr aktiv
- [ ] DS18B20 auf GPIO 13 wird beim Scan gefunden und zurueckgemeldet
- [ ] GPIO 14 (nach Aktor-Loeschung) steht fuer OneWire-Scan wieder zur Verfuegung
- [ ] Keine Regression: Bestehende Sensor/Aktor-Konfigurationen (SHT31 gpio=0, Relay gpio=27) bleiben nach Reboot erhalten
