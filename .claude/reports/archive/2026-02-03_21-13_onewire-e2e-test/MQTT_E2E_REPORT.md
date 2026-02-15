# MQTT E2E Debug Report

> **Session:** 2026-02-03_21-13_onewire-e2e-test
> **Agent:** mqtt-debug
> **Generated:** 2026-02-03
> **Device:** ESP_472204

---

## Summary

| Check | Status | Details |
|-------|--------|---------|
| Heartbeat Flow | ✅ | Regelmäßig alle 60s, alle ACKs empfangen |
| Zone Assignment | ✅ | `test_zone` erfolgreich zugewiesen |
| Sensor Config | 🔴 **FAILED** | ROM CRC invalid + GPIO conflict |
| Sensor Data | 🔴 **MISSING** | Keine `sensor/*/data` Messages |
| Actuator Config | ✅ | GPIO 26 relay erfolgreich |
| Actuator Commands | ✅ | ON/OFF Commands funktionieren |
| Timing | ✅ | Command → Response < 1s |

---

## BUG-ONEWIRE-CONFIG-001 Status

### Frage: Enthält Config-Push `onewire_address`?

**ANTWORT: JA** ✅

**Evidence (Zeile 18):**
```json
{
  "sensors": [{
    "gpio": 4,
    "sensor_type": "ds18b20",
    "sensor_name": "Test DS18B20 Temperatur",
    "subzone_id": "",
    "active": true,
    "sample_interval_ms": 30000,
    "raw_mode": true,
    "operating_mode": "continuous",
    "measurement_interval_seconds": 30,
    "interface_type": "ONEWIRE",
    "onewire_address": "28FF641E8D3C0C79",  // <-- VORHANDEN!
    "i2c_address": 0
  }],
  "actuators": [...],
  "correlation_id": "6aee8dec-452d-4a99-b8b1-bae6a5d9f807",
  "timestamp": 1770149945
}
```

**Schlussfolgerung:** BUG-ONEWIRE-CONFIG-001 ist behoben - der Server sendet jetzt `onewire_address`.

---

## NEUER BUG: Sensor Config schlägt fehl

### Error-Sequenz (Zeilen 19-21)

**Error 1025 - ROM CRC Invalid:**
```json
{
  "error_code": 1025,
  "severity": 1,
  "category": "HARDWARE",
  "message": "ROM CRC invalid: 28FF641E8D3C0C79",
  "context": {"esp_id": "ESP_472204", "uptime_ms": 277272}
}
```

**Error 1002 - GPIO Conflict:**
```json
{
  "error_code": 1002,
  "severity": 2,
  "category": "HARDWARE",
  "message": "GPIO conflict for OneWire sensor",
  "context": {"esp_id": "ESP_472204", "uptime_ms": 277288}
}
```

**Config Response - FAILED:**
```json
{
  "status": "error",
  "type": "sensor",
  "count": 0,
  "failed_count": 1,
  "message": "All 1 item(s) failed to configure",
  "failures": [{
    "type": "sensor",
    "gpio": 4,
    "error_code": 1002,
    "error": "GPIO_CONFLICT",
    "detail": "GPIO 4 already used by sensor (OneWireBus)"
  }],
  "correlation_id": "6aee8dec-452d-4a99-b8b1-bae6a5d9f807"
}
```

### Analyse

1. **ROM CRC Problem:** Die Adresse `28FF641E8D3C0C79` besteht den CRC8-Check nicht
   - OneWire-Adressen sind 64-bit (8 Bytes)
   - Letztes Byte ist CRC8 über die ersten 7 Bytes
   - ESP32 validiert die Adresse und lehnt sie ab

2. **GPIO Conflict:** GPIO 4 ist bereits durch `OneWireBus` reserviert
   - Vorherige Session hat GPIO 4 reserviert
   - Neue Config kann nicht angewendet werden
   - ESP32 müsste rebootet werden oder existierender Sensor entfernt

---

## Message-Sequenz (Vollständig)

### Phase 1: Boot/Reconnect (Zeilen 1-6)

| Line | Topic | Direction | Payload Summary |
|------|-------|-----------|-----------------|
| 1 | `system/will` | Retained | Initial LWT (ts=0) |
| 2 | `zone/ack` | ESP→Server | zone_id="test_zone" ✅ |
| 3 | `config_response` | ESP→Server | actuator success (1) ✅ |
| 4 | `actuator/26/status` | ESP→Server | state=OFF |
| 5 | `actuator/26/response` | ESP→Server | OFF executed |
| 6 | `system/will` | Retained | Updated LWT (ts=1770149600) |

### Phase 2: Heartbeat Loop (Zeilen 7-17)

| Line | Timestamp | Topic | Key Data |
|------|-----------|-------|----------|
| 7 | 1770149674 | `heartbeat` | uptime=6s, sensor_count=0, actuator_count=0 |
| 8 | +1s | `heartbeat/ack` | status=online |
| 9 | +60s | `diagnostics` | uptime=60s, error_count=0 |
| 10 | 1770149734 | `heartbeat` | uptime=66s, GPIO 4 reserved (OneWireBus) |
| 11 | +1s | `heartbeat/ack` | status=online |
| ... | ... | ... | Pattern repeats every 60s |

**Heartbeat Timing:** Exakt 60s Intervall ✅
**ACK Latenz:** ~1s ✅

### Phase 3: Config Push #1 (Zeilen 18-23)

| Line | Topic | Direction | Result |
|------|-------|-----------|--------|
| 18 | `config` | Server→ESP | sensors + actuators |
| 19 | `system/error` | ESP→Server | 1025: ROM CRC invalid |
| 20 | `system/error` | ESP→Server | 1002: GPIO conflict |
| 21 | `config_response` | ESP→Server | **SENSOR FAILED** |
| 22 | `actuator/26/status` | ESP→Server | Initial status |
| 23 | `config_response` | ESP→Server | **ACTUATOR SUCCESS** |

### Phase 4: Config Push #2 (Zeilen 32-37)

Identisch zu Phase 3 - gleiche Fehler wiederholt.

### Phase 5: Actuator Commands (Zeilen 44-54)

#### ON Command Sequence

| Line | Timestamp | Topic | Payload |
|------|-----------|-------|---------|
| 44 | 1770150121 | `actuator/26/command` | `{"command": "ON", "value": 1.0}` |
| 45 | 1770150121 | `actuator/26/status` | `{"state": true, "pwm": 255}` |
| 46 | 1770150121 | `actuator/26/response` | `{"success": true}` |
| 47 | 1770150121 | `actuator/26/status` | runtime_ms=7 |

**Latenz:** < 1s (alle gleicher Timestamp) ✅

#### OFF Command Sequence

| Line | Timestamp | Topic | Payload |
|------|-----------|-------|---------|
| 51 | 1770150163 | `actuator/26/command` | `{"command": "OFF", "value": 0.0}` |
| 52 | 1770150163 | `actuator/26/status` | `{"state": false, "pwm": 0}` |
| 53 | 1770150163 | `actuator/26/response` | `{"success": true}` |
| 54 | 1770150163 | `actuator/26/status` | runtime_ms=41878 |

**Latenz:** < 1s ✅

---

## Timing-Analyse

| Metrik | Gemessen | Erwartung | Status |
|--------|----------|-----------|--------|
| Heartbeat Intervall | 60s | 60s | ✅ |
| Heartbeat → ACK | ~1s | < 5s | ✅ |
| Command → Status | < 1s | < 2s | ✅ |
| Command → Response | < 1s | < 2s | ✅ |
| Config → Response | < 1s | < 5s | ✅ |
| Diagnostics Intervall | ~120s | 120s | ✅ |
| Actuator Status Intervall | ~30s | 30s | ✅ |

---

## Fehlende erwartete Messages

| Topic Pattern | Erwartet | Vorhanden | Problem |
|---------------|----------|-----------|---------|
| `sensor/4/data` | Alle 10-30s | **NEIN** | Sensor nicht konfiguriert |
| `sensor/4/status` | Nach Config | **NEIN** | Config failed |

---

## GPIO Status aus Heartbeats

```
gpio_status: [
  {"gpio": 4,  "owner": "sensor",   "component": "OneWireBus", "mode": 2},
  {"gpio": 21, "owner": "system",   "component": "I2C_SDA",    "mode": 2},
  {"gpio": 22, "owner": "system",   "component": "I2C_SCL",    "mode": 2},
  {"gpio": 26, "owner": "actuator", "component": "Test Relay E2E", "mode": 1}
]
```

**Beobachtung:** GPIO 4 ist bereits als "OneWireBus" reserviert BEVOR die neue Config ankommt.

---

## Diagnosis

### Problem 1: ROM CRC Invalid (Error 1025)

Die OneWire-Adresse `28FF641E8D3C0C79` ist ungültig:
- Entweder wurde sie falsch aus der Datenbank gelesen
- Oder der physische Sensor hat eine andere Adresse
- Oder die Adresse wurde manuell/falsch eingegeben

**Verifizierung nötig:** Echte ROM-Adresse vom physischen DS18B20 auslesen.

### Problem 2: GPIO Conflict (Error 1002)

GPIO 4 wurde in einer früheren Konfiguration/Session reserviert:
- Die Reservation persistiert über Config-Pushes hinweg
- ESP32 erlaubt keine doppelte Reservation
- Dies ist eigentlich ein SAFETY-Feature

**Workaround:** ESP32 reboot oder explizites "unreserve" vor re-config.

### Problem 3: Keine Sensor-Daten

Da die Sensor-Konfiguration fehlschlägt:
- Kein Sensor wird initialisiert
- Keine Daten werden gesendet
- `sensor_count` bleibt 0

---

## Recommended Actions

### Sofort (Kritisch)

1. **OneWire-Adresse verifizieren:**
   ```bash
   # ESP32 Serial Monitor prüfen auf ROM-Discovery
   grep -i "ROM:" logs/current/esp32_serial.log
   ```

2. **Korrekte Adresse in DB aktualisieren:**
   - Die echte Adresse vom physischen Sensor verwenden
   - CRC muss valide sein

### Kurzfristig

3. **GPIO-Reservation-Handling verbessern:**
   - Option A: ESP32 vor Config-Push rebooten
   - Option B: Explizites "clear_config" Command implementieren
   - Option C: Server erkennt bereits reservierten GPIO und sendet kein redundantes Config

4. **Server-seitige CRC-Validierung:**
   - Bevor Adresse an ESP gesendet wird, CRC prüfen
   - Fehlerhafte Adressen ablehnen

### Langfristig

5. **Config-Idempotenz:**
   - Wenn GPIO bereits korrekt konfiguriert ist, kein Fehler
   - Nur bei Änderung der Konfiguration neukonfigurieren

---

## Actuator Flow: ERFOLGREICH

Trotz Sensor-Problemen funktioniert der Actuator-Flow einwandfrei:

| Schritt | Status |
|---------|--------|
| Config Push | ✅ |
| GPIO Reservation | ✅ |
| Initial Status | ✅ |
| ON Command | ✅ |
| Status Update (ON) | ✅ |
| OFF Command | ✅ |
| Status Update (OFF) | ✅ |
| Timing | ✅ (< 1s) |

---

## Conclusion

**BUG-ONEWIRE-CONFIG-001:** ✅ BEHOBEN - `onewire_address` wird jetzt gesendet

**NEUER BUG:** Sensor-Konfiguration schlägt fehl aufgrund:
1. Ungültige ROM CRC in der gespeicherten Adresse
2. GPIO-Conflict durch persistente Reservation

**Actuator:** ✅ Vollständig funktional

**Empfehlung:** ROM-Adresse aus ESP32-Discovery-Log extrahieren und in DB korrigieren.

---

*Report generiert von mqtt-debug Agent*
*Session: 2026-02-03_21-13_onewire-e2e-test*
