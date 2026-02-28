# Chaos Engineering Vortest — Bericht

**Datum:** 2026-02-28, 08:15-08:35 UTC
**Tester:** Claude Agent (Playwright MCP + Bash)
**Wokwi-Simulation:** ESP_00000001 (ds18b20 GPIO 4, moisture GPIO 32, relay GPIO 14)
**Stack:** 12/12 Docker-Services running (monitoring profile)

---

## Zusammenfassung

| Bereich | Status | Details |
|---------|--------|---------|
| **Docker Stack** | OK | 12/12 Services healthy |
| **Server Health** | OK | healthy, mqtt_connected: true |
| **MQTT Broker** | OK | 4 Clients connected |
| **Wokwi ESP** | TEILWEISE | Heartbeats OK, Sensordaten nach Config-Push OK, dann gestoppt |
| **REST API** | TEILWEISE | 174 Endpoints, Auth OK, Sensor-Data-Format-Issue |
| **Frontend** | GRÖSSTENTEILS OK | 7/9 Views funktional, 1 hängt (System-Monitor) |
| **Datenpipeline** | OK | MQTT → Server → DB → Frontend komplett verifiziert |

---

## 1. Infrastruktur (Block A)

### Docker Stack
- **12 Services running:** server, postgres, mqtt, frontend, loki, alloy, prometheus, grafana, cadvisor, postgres-exporter, mosquitto-exporter, mqtt-logger
- Alle Services: `healthy` Status
- Container-Name-Mapping: `automationone-mqtt` (NICHT automationone-mqtt-broker)

### ESP-Geräte in DB

| device_id | status | zone | Bemerkung |
|-----------|--------|------|-----------|
| ESP_00000001 | online | Echt | Wokwi-Simulation |
| ESP_472204 | offline | Echt | Echter ESP, 16h offline |
| MOCK_012E36A6 | online | test | Mock-Server, sendet SHT31 |
| MOCK_0954B2B1 | pending_approval | — | Alter Mock, nicht approved |

### Sensor-Daten
- **4844 Datenpunkte** total in DB
- **658 Datenpunkte** für ESP_00000001 (ds18b20 + moisture, 24h-Fenster)
- Frische Daten fließen vom Mock-Server (SHT31 alle 30s)

---

## 2. Kritische Funde

### KRITISCH: Kein automatischer Config-Push nach ESP-Reboot

**Problem:** Nach einem ESP-Reboot (Wokwi-Neustart) hat der ESP `sensor_count: 0, actuator_count: 0` im Heartbeat. Der Server hat die Sensor-Configs in der DB, pusht sie aber NICHT automatisch.

**Root Cause:** `heartbeat_handler.py:1156` — `_has_pending_config()` ist ein Placeholder (return False). Der Server prüft nie ob der ESP seine Configs verloren hat.

**Impact:** Nach jedem ESP-Reboot müssen Configs manuell per API re-deployed werden. In Produktion würde ein Stromausfall alle Sensor-Configs auf allen ESPs verlieren.

**Workaround (getestet, funktioniert):** Manuell Config per MQTT publishen:
```
Topic: kaiser/god/esp/{esp_id}/config
Payload: { "sensors": [...], "actuators": [...] }
```
Felder müssen `sensor_name`, `active`, `sample_interval_ms`, `raw_mode`, `operating_mode`, `interface_type` enthalten.

**Fix-Empfehlung:** Im Heartbeat-Handler prüfen: `if payload.sensor_count < db_sensor_count → push_config()`. Priorität: **HOCH**.

### KRITISCH: System-Monitor View hängt (Browser Freeze)

**Problem:** `/system-monitor` verursacht einen kompletten Browser-Freeze. Playwright Timeout bei Snapshot, Screenshot und Console-Messages.

**Vermutung:** Wahrscheinlich ein DOM-Rendering-Problem mit großen Datenmengen (Events-Tab, Logs-Tab, oder MQTT-Traffic-Tab laden zu viele Einträge gleichzeitig).

**Impact:** System-Administration über UI nicht möglich.

**Fix-Empfehlung:** Pagination/Virtualisierung in allen System-Monitor-Tabs. Priorität: **HOCH**.

### HOCH: ESP_00000001 wird als "Offline" im Frontend angezeigt

**Problem:** Server meldet `status: online` (last_seen vor 1 Min), aber Frontend zeigt "Offline" mit rotem Dot.

**Vermutung:** Frontend-Status-Update kommt über WebSocket `esp_health` Events. Möglicherweise wird der Status nur beim initialen Load gesetzt und nicht per WS aktualisiert, oder die Heartbeat-Verarbeitung im Store hat einen Mapping-Fehler.

**Fix-Empfehlung:** `espStore.handleEspHealth()` debuggen — prüfen ob der `status` Wert korrekt gemappt wird. Priorität: **HOCH**.

### MITTEL: Actuator Config-Push schlägt auf Wokwi-ESP fehl

**Problem:** Sensor-Config wird akzeptiert (2/2 success), aber Actuator-Config gibt `UNKNOWN_ERROR` auf ESP-Seite zurück.

**Server-Log:** `Config FAILED on ESP_00000001: actuator - UNKNOWN_ERROR - Ein unerwarteter Fehler ist auf dem ESP32 aufgetreten`

**Vermutung:** Das Wokwi-Image kennt den Actuator-Config-Handler nicht oder das Payload-Format stimmt nicht mit der Firmware überein.

**Fix-Empfehlung:** ESP32-Firmware `actuator_config_handler` prüfen. Priorität: **MITTEL** (betrifft nur Wokwi, nicht echter ESP).

### MITTEL: Auth — Falsches Passwort gibt 422 statt 401

**Problem:** `POST /auth/login` mit falschem Passwort gibt HTTP 422 (Validation Error) statt 401 (Unauthorized).

**Impact:** Frontend Error-Handling könnte falschen Fehlermeldungs-Typ zeigen.

**Fix-Empfehlung:** Login-Endpoint: Passwort-Check VOR Schema-Validierung, oder 401 bei credential_error. Priorität: **NIEDRIG**.

### NIEDRIG: Sensor-Data API — sensor_type und processed_value null im Response

**Problem:** `GET /sensors/data` gibt `sensor_type: null` und `processed_value: null` in den Readings zurück, obwohl die DB beides hat.

**Ursache:** Response-Schema filtert/mappt die Felder nicht korrekt aus dem DB-Modell.

**Fix-Empfehlung:** `SensorDataResponse` Schema prüfen. Priorität: **NIEDRIG**.

### NIEDRIG: Zeitreihen-Chart mischt Sensor-Typen

**Problem:** Der Zeitreihen-Chart zeigt alle Sensoren eines ESPs in einem Chart (°C und % gemischt), was zu unsinnigen Y-Achsen-Werten führt (30-100 °C).

**Fix-Empfehlung:** Separate Charts pro Sensor-Typ oder Dual-Y-Axis. Priorität: **NIEDRIG**.

---

## 3. Frontend-Durchklick (Playwright MCP)

| View | URL | Status | Bemerkung |
|------|-----|--------|-----------|
| **Login** | /login | OK | Form, Validierung, Redirect funktionieren |
| **Hardware Übersicht** | /hardware | OK | 2 Zonen, 3 ESPs, Status-Badges, Zone-Plates |
| **ESP Detail (Orbital)** | /hardware/echt/ESP_00000001 | OK | Sensor-Satelliten, ComponentSidebar, Drop-Zones |
| **Monitor** | /monitor | OK | Zone-Übersicht mit Sensor-Counts |
| **Monitor Zone** | /monitor/echt | OK | 4 Sensor-Karten mit Live-Werten, Farbkodierung |
| **Komponenten** | /sensors | OK | 5 Sensoren, Sparklines, Quality-Badges |
| **Zeitreihen** | /sensor-history | OK | 658 Datenpunkte, Chart, CSV-Export |
| **Regeln/Logic** | /logic | OK | Visual Rule Builder, Empty-State |
| **System-Monitor** | /system-monitor | HÄNGT | Browser-Freeze, Timeout bei jeder Interaktion |
| Benutzer | /users | Nicht getestet | |
| Wartung | /maintenance | Nicht getestet | |
| Kalibrierung | /calibration | Nicht getestet | |
| Einstellungen | /settings | Nicht getestet | |
| Custom Dashboard | /custom-dashboard | Nicht getestet | |

### Frontend-Qualität
- **Dark Mode:** Konsistent, Glassmorphism-Effekte korrekt
- **WebSocket:** Verbindet sich nach Login sofort, ESPStore lädt 3 Devices
- **Navigation:** Sidebar, Breadcrumbs, ViewTabBar funktionieren
- **NOT-AUS Button:** Sichtbar in TopBar
- **Server-Status:** "Server verbunden" Badge korrekt
- **Console-Errors:** ~23 Errors beim Login (WS-Reconnect-Versuche vor Auth = erwartetes Verhalten)

---

## 4. API-Test (174 Endpoints)

| Kategorie | Getestet | Status |
|-----------|----------|--------|
| GET /health | OK | 200, healthy, mqtt_connected: true |
| POST /auth/login | OK | 200, Token korrekt |
| POST /auth/login (falsch) | ISSUE | 422 statt 401 |
| GET ohne Token | OK | 401 Unauthorized |
| GET /esp/devices | OK | 3 Devices zurück |
| GET /esp/devices/{id} | OK | Detail korrekt |
| GET /esp/devices/NONEXISTENT | OK | 404 |
| GET /sensors/ | OK | 5 Sensors |
| GET /sensors/data | ISSUE | Daten da, aber sensor_type/processed_value null im Response |
| GET /sensors/health | OK | 11 Processors loaded |
| POST /sensors/{id}/{gpio}/measure | OK | Measurement command sent |
| POST /esp/devices/{id}/restart | OK | Restart command sent |
| GET /logic/rules | OK | Leere Liste (keine Regeln) |

---

## 5. MQTT-Pipeline

| Test | Status | Details |
|------|--------|---------|
| Heartbeat → DB | OK | last_seen aktualisiert, Zone auto-reassigned |
| Sensor Data → DB | OK | Pi-Enhanced Processing (ds18b20: raw/16, moisture: Kalibrierung) |
| Config Push → ESP | TEILWEISE | Sensoren OK (2/2), Actuator FAILED (UNKNOWN_ERROR) |
| LWT | Nicht getestet | (würde Wokwi-Stop erfordern) |
| Retained Messages | BEOBACHTET | Alte Sensor-Daten sind retained im Broker |

---

## 6. Nächste Schritte (Empfehlung)

### Sofort (vor Block B-D des Auftrags)

1. **Config-Push-After-Reboot implementieren** — Ohne diesen Fix ist kein stabiler Testlauf möglich. Der Heartbeat-Handler muss `sensor_count` aus dem Heartbeat mit der DB vergleichen und bei Mismatch automatisch `build_combined_config() + send_config()` aufrufen.

2. **System-Monitor View Fix** — Debugging mit Vue DevTools nötig. Vermutlich ungebremster DOM-Render in einem der 5 Tabs.

3. **ESP Online/Offline-Anzeige im Frontend debuggen** — Der Store-Handler `handleEspHealth` muss den `status` korrekt setzen.

### Danach (Block B-D weiterführen)

4. Vollständiger API-Durchlauf aller 174 Endpoints (Block B)
5. Alle 12 MQTT-Handler systematisch testen (Block C)
6. Frontend-Durchklick aller 14 Views + Modals (Block D)
7. Chaos-Szenarien: ESP-Ausfall, Netzwerk-Unterbrechung, DB-Volllauf (Block F)

### Feature Branch

Der Auftrag empfiehlt `feature/chaos-mock-volltest` für Fixes. Aktuell sind noch keine Code-Änderungen gemacht — erst nach Genehmigung des Vorgehens.

---

## 7. Wokwi-Simulation Status

Die Wokwi-Simulation (ESP_00000001) war zum Testzeitpunkt aktiv:
- **Heartbeats:** Kamen alle ~30s (uptime stieg von 249s auf 429s)
- **Sensor-Daten:** Nach manuellem Config-Push flossen ds18b20 (22.5°C) und moisture (raw 1392-2405)
- **Actuator:** Config-Push fehlgeschlagen (GPIO 14 relay)
- **Zone:** "echt" (auto-reassigned nach Reboot)
- **WiFi RSSI:** -69 bis -98 dBm (Wokwi-Simulation, schwankend)

**Achtung:** Die Sensor-Daten fließen NUR solange die Wokwi-Simulation läuft UND die Config gepusht wurde. Nach dem nächsten Wokwi-Neustart muss die Config erneut gepusht werden.
