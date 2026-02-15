# MQTT Boot Report

> **Session:** 2026-02-02_05-37_esp32-fulltest
> **Analysiert:** 2026-02-02
> **Agent:** MQTT_DEBUG_AGENT v1.0
> **Modus:** BOOT

---

## 1. Executive Summary

| Metrik | Wert |
|--------|------|
| ESP-Geräte erkannt | 3 |
| Heartbeats empfangen | 5 |
| Heartbeat-ACKs gesendet | 5 |
| Config-Fehler | 1 |
| Unexpected Disconnects | 3 |
| Emergency Stops | 3 Aktoren |

**Gesamtstatus:** ⚠️ **TEILWEISE ERFOLGREICH** - Heartbeat-Flow funktioniert, aber Konfiguration und Zone-Assignment fehlen für live ESP.

---

## 2. Geräte-Übersicht

| ESP-ID | Typ | Status | Probleme |
|--------|-----|--------|----------|
| ESP_472204 | Live/Hardware | ⚠️ pending_approval | Keine Zone/Config empfangen |
| ESP_00000001 | Wokwi/Simulator | ⚠️ offline | Config-Fehler, Emergency aktiv |
| ESP_D0B19C | Unbekannt | ❌ offline | Unexpected disconnect |

---

## 3. Detailanalyse pro Gerät

### 3.1 ESP_472204 (Live Device)

**Boot-Sequenz-Status:**

| Phase | Status | Details |
|-------|--------|---------|
| Heartbeat senden | ✅ | 5 Heartbeats empfangen |
| Heartbeat ACK | ✅ | Alle mit "pending_approval" |
| Zone Assignment | ❌ FEHLT | `zone/assign` nicht im Traffic |
| Config Push | ❌ FEHLT | `config` nicht im Traffic |
| Sensor Data | ❌ FEHLT | Keine sensor/data Messages |

**Heartbeat-Chronologie:**

| Zeile | Uptime | Heap Free | WiFi RSSI | Besonderheit |
|-------|--------|-----------|-----------|--------------|
| 15 | 4927s | 209648 | -44 dBm | state=8, GPIO 4+21+22 reserviert |
| 17 | - | - | - | **LWT: unexpected_disconnect** |
| 18 | 7s | 210932 | -46 dBm | **REBOOT** (boot_count=3), GPIO 4 fehlt! |
| 21 | 67s | 209844 | -49 dBm | GPIO 4 wieder da |
| 23 | 127s | 207920 | -45 dBm | Stabil |

**Anomalien:**

1. **Reboot erkannt** (Zeile 18)
   - Uptime sprang von 4927s auf 7s
   - boot_count=3 bestätigt mehrere Neustarts
   - Mögliche Ursache: Watchdog, Stromausfall, oder kritischer Fehler

2. **GPIO-Inkonsistenz nach Reboot**
   - Vor Reboot (Z.15): GPIO 4 (OneWireBus), 21, 22 reserviert
   - Nach Reboot (Z.18): NUR GPIO 21, 22 reserviert
   - Später (Z.21): GPIO 4 wieder da
   - **Interpretation:** OneWire-Initialisierung verzögert nach Reboot

3. **Stuck in pending_approval**
   - Alle 5 ACKs: `"status": "pending_approval"`
   - `config_available: false` in allen ACKs
   - Device wartet auf Admin-Approval im Server

---

### 3.2 ESP_00000001 (Wokwi Simulator)

**Messages gefunden:**

| Zeile | Topic | Status |
|-------|-------|--------|
| 1 | system/will | unexpected_disconnect |
| 2 | system/command/response | onewire/scan OK, 0 devices |
| 3 | zone/ack | ✅ zone_assigned: wokwi_test |
| 4 | config_response | ❌ **ERROR** |
| 5 | onewire/scan_result | 0 devices |
| 6-12 | actuator/* | Mixed results |

**Kritische Fehler:**

#### 3.2.1 Config-Fehler (Zeile 4)
```json
{
  "status": "error",
  "type": "actuator",
  "message": "Failed to configure actuator on GPIO 13",
  "error_code": "UNKNOWN_ERROR"
}
```
- **Schwere:** 🔴 KRITISCH
- **Auswirkung:** Aktor GPIO 13 nicht einsatzbereit

#### 3.2.2 Aktor-Status (Emergency Mode)

| GPIO | Type | State | Emergency | Command Success |
|------|------|-------|-----------|-----------------|
| 5 | relay | false | **active** | ❌ failed |
| 26 | relay | false | **active** | ✅ success |
| 13 | - | - | - | ❌ failed |

**Problem:** Alle Aktoren in Emergency-Modus (`emergency: "active"`)

#### 3.2.3 Command-Failures

- **GPIO 5** (Zeile 7): `"success": false, "message": "Command failed"`
- **GPIO 13** (Zeile 12): `"success": false, "message": "Command failed"`

---

### 3.3 ESP_D0B19C

Nur eine Message:
```
system/will {"status":"offline","reason":"unexpected_disconnect","timestamp":1768891112}
```
- Timestamp deutet auf ältere Verbindung (vor aktueller Session)
- Keine weiteren Messages - Gerät nicht aktiv

---

## 4. Broadcast Messages

### Emergency Stop (Zeile 14)
```json
{
  "command": "EMERGENCY_STOP",
  "reason": "Phase 2 Test",
  "issued_by": "Robin",
  "timestamp": "2026-01-30T03:42:17.420950+00:00",
  "devices_stopped": 1,
  "actuators_stopped": 3
}
```
- **Topic:** `kaiser/broadcast/emergency`
- **Hinweis:** Älterer Broadcast (2026-01-30), erklärt Emergency-Status der Aktoren

---

## 5. Boot-Sequenz Validierung

### Erwartete Sequenz (laut STATUS.md)

```
1. ESP→Server: heartbeat        ✅ ERFÜLLT
2. Server→ESP: config           ❌ NICHT GESEHEN
3. ESP→Server: config_response  ⚠️ Nur für ESP_00000001 (mit Fehler)
4. ESP→Server: sensor/data      ❌ NICHT GESEHEN
```

### Fehlende Messages für ESP_472204

| Topic | Erwartung | Status |
|-------|-----------|--------|
| `kaiser/god/esp/ESP_472204/config` | Server sendet Config | ❌ FEHLT |
| `kaiser/god/esp/ESP_472204/zone/assign` | Zone-Zuweisung | ❌ FEHLT |
| `kaiser/god/esp/ESP_472204/sensor/*/data` | Sensor-Daten | ❌ FEHLT |

**Ursache:** ESP ist in `pending_approval` - Server sendet keine Config bis Admin approved.

---

## 6. Timing-Analyse

### Heartbeat-Intervall ESP_472204

| Von (uptime) | Zu (uptime) | Delta |
|--------------|-------------|-------|
| 7s | 67s | 60s ✅ |
| 67s | 127s | 60s ✅ |

**Bewertung:** Heartbeat-Intervall von 60s ist korrekt.

### ACK Response Time

Alle Heartbeats haben sofortige ACKs (gleicher Timestamp in server_time).
**Bewertung:** ✅ Keine Latenz-Probleme

---

## 7. Payload-Validierung

### Heartbeat Payload (ESP_472204)

| Feld | Pflicht | Vorhanden | Wert (Beispiel) |
|------|---------|-----------|-----------------|
| esp_id | ✅ | ✅ | "ESP_472204" |
| ts | ✅ | ✅ | 1770007100 |
| uptime | ✅ | ✅ | 4927 |
| heap_free | ✅ | ✅ | 209648 |
| wifi_rssi | ✅ | ✅ | -44 |
| zone_id | ⚪ | ✅ | "" (leer) |
| sensor_count | ⚪ | ✅ | 0 |
| actuator_count | ⚪ | ✅ | 0 |
| gpio_status | ⚪ | ✅ | Array |
| config_status | ⚪ | ✅ | Object |

**Bewertung:** ✅ Alle Pflichtfelder korrekt, JSON valide

---

## 8. Zusammenfassung der Probleme

### Kritisch 🔴

| # | Problem | Betroffenes Gerät | Auswirkung |
|---|---------|-------------------|------------|
| 1 | Config-Fehler GPIO 13 | ESP_00000001 | Aktor nicht nutzbar |
| 2 | Emergency-Modus aktiv | ESP_00000001 | Alle Aktoren blockiert |

### Warnung ⚠️

| # | Problem | Betroffenes Gerät | Auswirkung |
|---|---------|-------------------|------------|
| 3 | Stuck in pending_approval | ESP_472204 | Keine Config/Zone möglich |
| 4 | Reboot erkannt | ESP_472204 | Potentielle Stabilität |
| 5 | GPIO-Inkonsistenz nach Reboot | ESP_472204 | OneWire verzögert |
| 6 | 3x unexpected_disconnect | Alle | Verbindungsprobleme |

---

## 9. Empfehlungen

### Sofort

1. **ESP_472204 approven** im Server-Dashboard
   - Aktueller Status blockiert alle weiteren Flows
   - Nach Approval sollte Zone-Assignment und Config kommen

2. **Emergency-Modus zurücksetzen** für ESP_00000001
   - Via `kaiser/broadcast/emergency` mit `command: "CLEAR"`
   - Oder via Server-API

### Kurzfristig

3. **GPIO 13 Config-Fehler untersuchen**
   - ESP32_DEBUG_AGENT soll Serial-Log prüfen
   - Mögliche Ursachen: GPIO nicht unterstützt, Konflikt, Hardware-Problem

4. **Reboot-Ursache analysieren** für ESP_472204
   - Serial-Log auf Watchdog-Reset prüfen
   - Heap-Fragmentierung beobachten (aktuell bei 3%, gut)

### Langfristig

5. **Disconnect-Monitoring** verbessern
   - 3 unexpected_disconnects in einer Session ist hoch
   - WiFi/MQTT Keep-Alive Intervalle prüfen

---

## 10. Anhang: Raw Traffic Zusammenfassung

| Zeile | ESP | Topic-Typ | Status |
|-------|-----|-----------|--------|
| 1 | ESP_00000001 | system/will | offline |
| 2 | ESP_00000001 | command/response | ok |
| 3 | ESP_00000001 | zone/ack | success |
| 4 | ESP_00000001 | config_response | **error** |
| 5 | ESP_00000001 | onewire/scan_result | ok |
| 6-12 | ESP_00000001 | actuator/* | mixed |
| 13 | ESP_D0B19C | system/will | offline |
| 14 | broadcast | emergency | STOP |
| 15-16 | ESP_472204 | heartbeat + ack | pending |
| 17 | ESP_472204 | system/will | offline |
| 18-24 | ESP_472204 | heartbeat + ack | pending |

---

*Report generiert: 2026-02-02*
*Agent: MQTT_DEBUG_AGENT*
*Session: 2026-02-02_05-37_esp32-fulltest*
