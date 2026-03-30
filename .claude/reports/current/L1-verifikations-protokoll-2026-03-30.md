# L1 Verifikations-Protokoll — 2026-03-30

**Auftrag:** `auftrag-L1-live-verifikation-qos-fix-2026-03-29.md`
**System:** Lokaler Docker-Stack (el-servador, MQTT-Broker, el-frontend) + realer ESP_EA5484 via LAN
**Hinweis:** Pi 5 ist remote — Verifikation erfolgte gegen den lokalen Docker-Stack, der Echtdaten vom ESP empfaengt.

---

## Ergebnis-Uebersicht

| Check | Status | Details |
|-------|--------|---------|
| V1 Duration-Timer | NICHT VERIFIZIERBAR | ESP meldet `actuator_count=0`, GPIO 14 nicht konfiguriert |
| V2 OFF-Befehl | NICHT VERIFIZIERBAR | Gleicher Grund — kein Aktor registriert |
| V3 Hysterese-Roundtrip | **PASS** | API: `type: 'hysteresis'`, Schwellwerte korrekt im Editor |
| V4 Hysterese-Evaluator | **PASS** (historisch) | 4x erfolgreich gefeuert, Hysterese-Logik korrekt |
| V5 Live-Daten | **TEILWEISE PASS** | Sensordaten fliessen, Aktor-Status leer |
| N8 QoS Fix | **IMPLEMENTIERT + BUILD OK** | Beide Envs (seeed_xiao_esp32c3, esp32_dev) gruene Builds |

---

## V1: Duration-Timer (F1 Fix-Verifikation) — NICHT VERIFIZIERBAR

**Grund:** ESP_EA5484 Heartbeat zeigt `actuator_count: 0`. GPIO 14 ist weder als Aktor registriert noch reserviert.

```json
// Heartbeat-Auszug (2026-03-30T06:13Z)
{
  "actuator_count": 0,
  "gpio_status": [
    {"gpio": 21, "owner": "system", "component": "I2C_SDA"},
    {"gpio": 22, "owner": "system", "component": "I2C_SCL"}
  ]
}
```

**Voraussetzung fuer Test:** Aktor auf GPIO 14 muss rekonfiguriert werden (ueber Dashboard oder API).

---

## V2: OFF-Befehl (F2 Fix-Verifikation) — NICHT VERIFIZIERBAR

**Grund:** Identisch mit V1. Ohne konfigurierten Aktor kann kein ON/OFF-Test durchgefuehrt werden.

**Code-Review (Ersatz):** `equalsIgnoreCase("OFF")` ist in `actuator_manager.cpp:656` implementiert. Server sendet `command.upper()` in `publisher.py:91`. Fix ist im Code vorhanden.

---

## V3: Hysterese-Roundtrip Frontend — PASS

### API-Verifikation

```
GET /api/v1/logic/rules/675100d6-06a1-43bc-9fee-fef359645f53

conditions[0]:
  type: "hysteresis"
  sensor_type: "sht31_humidity"
  activate_below: 45
  deactivate_above: 60
  esp_id: "ESP_EA5484"
  gpio: 0
```

### Frontend-Verifikation (Playwright)

- Editor zeigt Regel "TimmsRegenReloaded" mit Flow-Graph
- Condition-Node: "Ein <45%RH · Aus >60%RH"
- Action-Node: "AN" auf ESP_EA5484 GPIO 14
- Screenshot: `V3-hysterese-roundtrip-editor.png`

### Bewertung

`type: 'hysteresis'` wird korrekt gespeichert und angezeigt. `graphToRuleData()` erkennt Hysterese-Bedingungen. Schwellwerte ueberleben den Save/Load-Roundtrip.

---

## V4: Hysterese-Evaluator feuert — PASS (historisch)

### Execution History (4 Eintraege, alle success=true)

| Zeitpunkt (UTC) | Humidity | Aktion | Korrekt? |
|-----------------|----------|--------|----------|
| 2026-03-26 14:40:52 | 42.7% (< 45) | ON | Ja (activate_below=45) |
| 2026-03-26 14:41:52 | 93.4% (> 60) | OFF | Ja (deactivate_above=60) |
| 2026-03-26 14:43:22 | 34.3% (< 45) | ON | Ja |
| 2026-03-26 14:44:23 | 33.7% (< 45) | ON | Ja (Cooldown 60s eingehalten) |

- success_rate: 100% (4/4)
- execution_time: 15-19ms
- `HysteresisConditionEvaluator` korrekt registriert und funktional

### Bewertung

Hysterese-Logik funktioniert nachweislich: unter activate_below → ON, ueber deactivate_above → OFF. Alle 4 Ausfuehrungen waren erfolgreich mit korrektem Verhalten.

**Hinweis:** Regel ist aktuell `enabled: false`. Letzte Ausfuehrung vor 4 Tagen.

---

## V5: Live-Daten Check — TEILWEISE PASS

### Sensordaten (aktuell, 2026-03-30 ~06:06 UTC)

| Sensor | GPIO | Letzter Wert | Timestamp | Status |
|--------|------|-------------|-----------|--------|
| sht31_temp | 0 | 19.9 °C | 06:06:34Z | applied |
| sht31_humidity | 0 | 43.3 %RH | 06:06:04Z | applied |
| vpd (virtual) | 0 | 1.3176 kPa | 06:06:34Z | active |

- Datenfluss: regelmaessig (alle ~30s erwartet, beobachtet ~30s Intervall)
- Qualitaet: "good" fuer alle Sensoren

### Aktor-Status

- `GET /api/v1/actuators/?esp_id=ESP_EA5484` → **leere Liste**
- Heartbeat: `actuator_count: 0`
- **Kein Aktor konfiguriert** — entspricht nicht dem erwarteten Setup (GPIO 14 Befeuchter)

### Logic Rule

- 1 Regel vorhanden: "TimmsRegenReloaded" (id: 675100d6-...)
- Aktuell deaktiviert (`enabled: false`)
- 4 historische Ausfuehrungen (alle erfolgreich)

### ESP-Status

```
ESP_EA5484: Online
  WiFi RSSI: -63 dBm (gut)
  Uptime: 1392s
  Heap Free: 200520 bytes
  sensor_count: 1, actuator_count: 0
  Zone: zelt_wohnzimmer
  IP: 192.168.178.91
```

---

## N8 Fix: ESP QoS fuer MQTT-Subscriptions — IMPLEMENTIERT

### Aenderungen

**Datei 1:** `El Trabajante/src/services/communication/mqtt_client.h:65`
```cpp
// Vorher:
bool subscribe(const String& topic);
// Nachher:
bool subscribe(const String& topic, uint8_t qos = 0);
```

**Datei 2:** `El Trabajante/src/services/communication/mqtt_client.cpp:651`
```cpp
// Vorher:
bool success = mqtt_.subscribe(topic.c_str());
// Nachher:
bool success = mqtt_.subscribe(topic.c_str(), qos);
// Log erweitert: "Subscribed (QoS X): topic"
```

**Datei 3:** `El Trabajante/src/main.cpp:822-846` (Initial Subscriptions)

| Topic | QoS vorher | QoS nachher |
|-------|------------|-------------|
| system_command | 0 | **1** |
| config | 0 | **1** |
| broadcast_emergency | 0 | **1** |
| actuator_command (wildcard) | 0 | **1** |
| esp_emergency | 0 | **1** |
| zone_assign | 0 | **1** |
| subzone_assign/remove/safe | 0 | **1** |
| sensor_command (wildcard) | 0 | **1** |
| heartbeat_ack | 0 | 0 (unveraendert) |

**Datei 4:** `El Trabajante/src/main.cpp:1600-1618` (Re-Subscribe nach kaiser_id Change)
- Gleiche QoS-Werte wie Initial Subscriptions angewandt

### Build-Verifikation

| Environment | Status | RAM | Flash | Dauer |
|-------------|--------|-----|-------|-------|
| seeed_xiao_esp32c3 | SUCCESS | 22.1% | 90.5% | 10.96s |
| esp32_dev | SUCCESS | 25.0% | 92.2% | 14.04s |

### Akzeptanzkriterien

- [x] Aktor-Command-Subscription nutzt QoS 1
- [x] Config-Subscription nutzt QoS 1
- [x] System-Command, Emergency, Zone, Subzone, Sensor-Command alle QoS 1
- [x] Heartbeat-ACK bleibt QoS 0 (regelmaessig, Verlust OK)
- [x] Build kompiliert fehlerfrei in beiden Environments
- [ ] ESP-Logs zeigen QoS-1-Subscription (erfordert Firmware-Flash + Serial Monitor)

---

## Neue Findings

### NF1: Kein Aktor auf ESP_EA5484 konfiguriert (HIGH)

**Problem:** Der Befeuchter (GPIO 14) ist nicht als Aktor registriert. `actuator_count=0` im Heartbeat, leere Aktor-Liste in API.

**Auswirkung:** V1/V2 nicht testbar. Logic Engine kann keine Befehle an GPIO 14 senden.

**Empfehlung:** Aktor ueber Dashboard rekonfigurieren bevor V1/V2 verifiziert werden.

### NF2: Regel "TimmsRegenReloaded" deaktiviert

**Problem:** Die einzige Hysterese-Regel ist `enabled: false` seit 2026-03-26.

**Auswirkung:** Keine aktive Automation. V4 nur historisch verifizierbar.

---

## Offene Punkte fuer L2+

1. **V1/V2 Verifikation:** Aktor auf GPIO 14 konfigurieren, dann Duration-Timer und OFF-Befehl testen
2. **N8 Deployment:** Firmware auf ESP flashen und QoS-1-Subscription in Serial-Logs verifizieren
3. **Regel reaktivieren:** "TimmsRegenReloaded" aktivieren nachdem Aktor konfiguriert ist
4. **Pi 5 Remote-Zugriff:** Fuer direkte DB-Queries und Serial-Monitor-Zugang
