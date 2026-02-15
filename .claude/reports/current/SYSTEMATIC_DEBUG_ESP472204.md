# Systematic Debugging: ESP_472204 / „Nichts im Frontend“

**Datum:** 2026-02-13  
**Symptom:** Echter ESP (ESP_472204) sendet laut Serial MQTT-Publishes; im Frontend ist nichts sichtbar.  
**Skills:** systematic-debugging, db-inspector, test-log-analyst

---

## Phase 1: Root Cause Investigation (abgeschlossen)

### 1.1 Fehlermeldungen / Serial

- **ESP Serial (COM5):**  
  - Pi-Enhanced HTTP: `http://192.168.0.194:8000/api/v1/sensors/process` → **Timeout 2500 ms**, Error 3021 (HTTP connection failed/timeout).  
  - Circuit Breaker [PiServer]: 5 Failures → OPEN, 60 s Recovery.  
  - Danach: lokales Fallback, **MQTT PUBLISH END** für sht31_temp / sht31_humidity (Publish wird ausgeführt).

- **Erkenntnis:** ESP führt MQTT-Publish aus; HTTP zum Server (192.168.0.194:8000) schlägt fehl. MQTT-Broker-Adresse steht nicht im gezeigten Log (typisch gleicher Host wie Server-IP).

### 1.2 Reproduktion

- Konsistent: Serial zeigt wiederholte Sensor-Lesungen und MQTT PUBLISH END; Frontend zeigt kein Gerät ESP_472204 und keine zugehörigen Daten.

### 1.3 Evidenz an Komponentengrenzen

| Grenze | Evidenz | Ergebnis |
|--------|---------|----------|
| **ESP → MQTT** | Serial: „MQTT PUBLISH END“ | Publish wird aufgerufen (kein Beweis, dass Broker erreicht wird). |
| **Broker → Server** | Server-Log: grep „472204“ / „ESP_47“ (Tail 500) | **Keine Treffer** → Server verarbeitet ESP_472204 nicht. |
| **Server → DB** | DB: esp_devices, esp_heartbeat_logs, sensor_data | **ESP_472204 fehlt** in esp_devices; 0 Heartbeats, 0 sensor_data für dieses Gerät. |
| **DB → Frontend** | Logik: Frontend liest Devices/Sensordaten aus API | Ohne Eintrag in esp_devices kann das Frontend ESP_472204 nicht anzeigen. |

### 1.4 Datenfluss rückverfolgt

- **Erwarteter Ablauf:**  
  Heartbeat → Server erhält → Auto-Discovery legt esp_devices-Eintrag an → Heartbeats/sensor_data werden gespeichert → API/WebSocket → Frontend.  
  Sensor-Daten → Server erhält → Lookup esp_devices → wenn vorhanden: sensor_data speichern; wenn nicht: **ESP_DEVICE_NOT_FOUND**, keine Speicherung.

- **Tatsache:** Weder Heartbeat noch Sensor-Nachrichten von ESP_472204 werden vom Server verarbeitet (kein Log, kein DB-Eintrag).  
→ **Unterbrechung vor dem Server:** MQTT-Nachrichten von ESP_472204 erreichen den Server nicht (oder werden vor dem Handler verworfen).

---

## Phase 2: Pattern

- **Funktionierendes Referenzverhalten:** MOCK_E1BD1447 – Heartbeats und Sensordaten im Log und in der DB, Frontend zeigt Mock-Device.  
- **Unterschied:** Bei MOCK sendet der **Server** (SimulationScheduler) die Heartbeats/Sensor-Daten an den **lokalen** Broker. Bei ESP_472204 sendet der **ESP** an einen Broker – der vom Server genutzte Broker (mqtt-broker:1883) erhält diese Nachrichten offenbar nicht oder der ESP ist nicht mit diesem Broker verbunden.

---

## Phase 3: Hypothese

**Hypothese:** Die MQTT-Nachrichten von ESP_472204 erreichen den Broker, mit dem der Server verbunden ist, nicht. Mögliche Ursachen:

1. **Broker-Adresse auf dem ESP:** Anderer Host/Port als der vom Server genutzte Broker (z. B. Server nutzt Docker-`mqtt-broker:1883`, ESP nutzt 192.168.0.194:1883 – nur konsistent, wenn 192.168.0.194 der Docker-Host ist und 1883 exposed ist).  
2. **Netzwerk/Firewall:** Port 1883 von der ESP-WLAN-IP aus nicht erreichbar.  
3. **MQTT-Client auf dem ESP:** Nicht wirklich verbunden (z. B. nach Verbindungsabbruch), Publish nur in lokaler Queue, Nachrichten kommen nie beim Broker an.

**Minimaler Test:** Auf dem Rechner, auf dem der Broker läuft (z. B. Host mit Docker):  
`mosquitto_sub -h localhost -t "kaiser/+/esp/+/system/heartbeat" -v`  
Wenn hier **kein** `kaiser/.../esp/ESP_472204/system/heartbeat` erscheint, während der ESP läuft, bestätigt das: Nachrichten von ESP_472204 erreichen diesen Broker nicht.

---

## Phase 4: Umsetzung / Nächste Schritte (ohne Fix ohne bestätigte Ursache)

- **Kein Code-Fix** ohne bestätigte Root Cause (systematic-debugging: keine Fixes ohne Root-Cause-Untersuchung).  
- **Empfohlene Schritte:**  
  1. **MQTT-Sichtbarkeit:** Siehe oben `mosquitto_sub` auf Heartbeat-Topic; ggf. auch `kaiser/+/esp/+/sensor/+/data` prüfen.  
  2. **Broker-Konfiguration ESP:** NVS/WiFi-Config prüfen: welche MQTT-Broker-URL nutzt der ESP? Mit Docker-Host und Port-Expose (1883) abgleichen.  
  3. **Netzwerk:** Von einem Gerät im gleichen WLAN wie der ESP: `telnet 192.168.0.194 1883` (oder nmap) um zu prüfen, ob 1883 von diesem Netz aus erreichbar ist.  
  4. **Test-Log-Analyst:** Backend-/E2E-Tests ausführen, die Device-Registration und Sensor-Pipeline abdecken → verifizieren, dass die Pipeline funktioniert, **wenn** ein Device in der DB existiert (siehe Task an test-log-analyst).

---

## Referenzen

- **DB-Details:** `.claude/reports/current/DB_INSPECTOR_REPORT.md`  
- **ESP32-Debug (Heartbeat/MQTT):** `.claude/skills/esp32-debug/SKILL.md`  
- **LOG_LOCATIONS / MQTT:** `.claude/reference/debugging/LOG_LOCATIONS.md`
