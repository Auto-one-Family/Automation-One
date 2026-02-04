# MQTT Boot Report

> **Session:** 2026-02-02_03-47_esp32-fulltest
> **Modus:** BOOT
> **Analysiert:** 2026-02-02
> **Log:** `logs/current/mqtt_traffic.log` (63 Zeilen)

---

## 1. Executive Summary

| Aspekt | Status |
|--------|--------|
| Heartbeat-Kommunikation | **OK** |
| Heartbeat ACKs | **OK** |
| Boot-Sequenz ESP_472204 | **OK** - pending_approval → online |
| Zone Assignment | **NICHT ERFOLGT** |
| Historische Fehler (ESP_00000001) | **DOKUMENTIERT** |

**Haupt-ESP:** `ESP_472204` - Boot erfolgreich, OPERATIONAL

---

## 2. Devices im Traffic

| ESP_ID | Messages | Status | Anmerkung |
|--------|----------|--------|-----------|
| `ESP_472204` | 48 | **Aktiv** | Boot-Test Device |
| `ESP_00000001` | 12 | Historisch | Wokwi-Test (Fehler) |
| `ESP_D0B19C` | 1 | Offline | Will-Message |

---

## 3. ESP_472204 Boot-Sequenz (Fokus)

### 3.1 Chronologischer Ablauf

| Zeile | Topic | Uptime | Status | Bemerkung |
|-------|-------|--------|--------|-----------|
| 15 | heartbeat | 7s | - | Erster Heartbeat nach Boot |
| 16 | heartbeat/ack | - | `pending_approval` | Server erkennt neues Device |
| 17 | diagnostics | 60s | `PENDING_APPROVAL` | System-State konsistent |
| 18-28 | heartbeat + ack | 67-367s | `pending_approval` | Warte auf Approval |
| **29** | heartbeat/ack | 367s | **`online`** | **Device approved!** |
| 30 | diagnostics | 420s | `OPERATIONAL` | Vollständig betriebsbereit |
| 31-62 | heartbeat + ack | 427-1327s | `online` | Stabiler Betrieb |

### 3.2 Heartbeat-Analyse

**Intervall:** ~60 Sekunden (korrekt)

**Payload-Validierung (Zeile 15):**
```json
{
  "esp_id": "ESP_472204",           // ✓ Pflichtfeld
  "ts": 1770002179,                 // ✓ Pflichtfeld
  "uptime": 7,                      // ✓ Pflichtfeld
  "heap_free": 210928,              // ✓ Pflichtfeld
  "wifi_rssi": -54,                 // ✓ Pflichtfeld
  "sensor_count": 0,                // ✓ Vorhanden
  "actuator_count": 0,              // ✓ Vorhanden
  "zone_assigned": false,           // Info
  "gpio_status": [...],             // Extended Info
  "config_status": {...}            // Extended Info
}
```

**Alle Pflichtfelder vorhanden.**

### 3.3 System-Metriken

| Metrik | Start (7s) | Ende (1327s) | Bewertung |
|--------|------------|--------------|-----------|
| heap_free | 210928 | 209848 | **Stabil** (-1080 bytes) |
| wifi_rssi | -54 dBm | -51 dBm | **Stabil** (Range: -45 bis -56) |
| gpio_reserved | 2 | 3 | GPIO 4 (OneWire) hinzugefügt |

### 3.4 GPIO-Status Evolution

| Zeitpunkt | GPIOs reserviert |
|-----------|------------------|
| Uptime 7s | GPIO 21 (I2C_SDA), GPIO 22 (I2C_SCL) |
| Uptime 67s+ | + GPIO 4 (OneWireBus) |

### 3.5 ACK-Timing

**Alle Heartbeat-ACKs empfangen.**

| server_time - ts | Bewertung |
|------------------|-----------|
| 0-1 Sekunde | **Optimal** |

---

## 4. Fehlende erwartete Messages

### 4.1 Zone Assignment (NICHT erfolgt)

**Erwartet (lt. STATUS.md):**
```
1. Server→ESP: zone/assign
2. ESP→Server: zone/ack
```

**Gefunden:** KEINE Zone-Assignment für ESP_472204

**Ursache:** Device wurde approved, aber keine Zone zugewiesen (Frontend-Aktion erforderlich).

**Konsequenz:**
- `zone_assigned`: false in allen Heartbeats
- `config_available`: false in allen ACKs
- Kein Config-Push möglich

### 4.2 Config Push (NICHT erfolgt)

**Erwartet:**
```
Server→ESP: config
ESP→Server: config_response
```

**Gefunden:** KEINE Config-Messages für ESP_472204

**Ursache:** Keine Zone → kein Config.

---

## 5. Historische Fehler (ESP_00000001)

> Diese Messages sind älter (Wokwi-Test) und nicht Teil des aktuellen Boot-Tests.

### 5.1 Config-Response ERROR (Zeile 4)

```json
{
  "status": "error",
  "type": "actuator",
  "message": "Failed to configure actuator on GPIO 13",
  "error_code": "UNKNOWN_ERROR"
}
```

**Schweregrad:** ERROR
**GPIO:** 13
**Ursache:** Unbekannt (UNKNOWN_ERROR)

### 5.2 Actuator Command Failures

| Zeile | GPIO | Command | Success | Message |
|-------|------|---------|---------|---------|
| 7 | 5 | ON | **false** | "Command failed" |
| 8 | 5 | - | - | Alert: emergency_stop |
| 12 | 13 | OFF | **false** | "Command failed" |

### 5.3 Emergency Status

Zeilen 6, 9 zeigen `"emergency": "active"` für GPIO 5 und 26.

### 5.4 Broadcast Emergency (Zeile 14)

```json
{
  "command": "EMERGENCY_STOP",
  "reason": "Phase 2 Test",
  "issued_by": "Robin",
  "devices_stopped": 1,
  "actuators_stopped": 3
}
```

**Topic:** `kaiser/broadcast/emergency`
**Aktion:** Manueller Test-Emergency-Stop

---

## 6. Anomalien

### 6.1 Will-Message (Zeile 1)

```
ESP_00000001: {"status":"offline","reason":"unexpected_disconnect"}
```

**Bewertung:** LWT (Last Will Testament) korrekt konfiguriert. Device hat sich nicht sauber abgemeldet.

### 6.2 Will-Message (Zeile 13)

```
ESP_D0B19C: {"status":"offline","reason":"unexpected_disconnect"}
```

**Bewertung:** Weiteres Device mit unexpected_disconnect.

---

## 7. Topic-Schema Validierung

| Topic | Schema-konform? |
|-------|-----------------|
| `kaiser/god/esp/{esp_id}/system/heartbeat` | ✓ |
| `kaiser/god/esp/{esp_id}/system/heartbeat/ack` | ✓ |
| `kaiser/god/esp/{esp_id}/system/diagnostics` | ✓ |
| `kaiser/god/esp/{esp_id}/system/will` | ✓ |
| `kaiser/god/esp/{esp_id}/zone/ack` | ✓ |
| `kaiser/god/esp/{esp_id}/config_response` | ✓ |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/status` | ✓ |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/response` | ✓ |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/alert` | ✓ |
| `kaiser/broadcast/emergency` | ✓ |

**Alle Topics schema-konform.**

---

## 8. Payload-Validierung

| Message-Typ | JSON valid? | Pflichtfelder? |
|-------------|-------------|----------------|
| Heartbeat | ✓ | ✓ Alle vorhanden |
| Heartbeat ACK | ✓ | ✓ |
| Diagnostics | ✓ | ✓ |
| Will | ✓ | ✓ |
| Emergency | ✓ | ✓ |

**Keine malformed Payloads.**

---

## 9. Fazit

### Boot-Sequenz ESP_472204

| Checkpoint | Status |
|------------|--------|
| Heartbeat gesendet | ✓ |
| Server ACK empfangen | ✓ |
| pending_approval → online | ✓ |
| System OPERATIONAL | ✓ |
| Zone Assignment | ✗ (nicht erfolgt) |
| Config Push | ✗ (nicht erfolgt) |

**Bewertung:** Boot-Sequenz **ERFOLGREICH** bis zum Online-Status.

Zone-Assignment wurde nicht durchgeführt (erfordert Frontend-Aktion oder API-Call). Dies ist kein Fehler im MQTT-Kommunikationsfluss, sondern ein ausstehender Workflow-Schritt.

### Empfehlungen

1. **Zone zuweisen** für ESP_472204 via Frontend oder API
2. **ESP_00000001 Fehler untersuchen** - GPIO 13 Actuator-Konfiguration fehlgeschlagen
3. **Will-Messages** deuten auf instabile Verbindungen bei ESP_00000001 und ESP_D0B19C hin

---

*Report generiert: 2026-02-02*
*Agent: MQTT_DEBUG_AGENT v1.0*
