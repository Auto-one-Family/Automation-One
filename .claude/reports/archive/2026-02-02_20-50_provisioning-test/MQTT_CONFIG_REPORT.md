# MQTT Debug Report - CONFIG Mode

> **Session:** 2026-02-02_20-50_provisioning-test
> **Agent:** mqtt-debug
> **Erstellt:** 2026-02-02
> **Log-Quelle:** `logs/current/mqtt_traffic.log`

---

## Summary

| Check | Status | Details |
|-------|--------|---------|
| Topic-Schema | ✅ OK | Alle Topics folgen `kaiser/god/esp/{esp_id}/...` Pattern |
| Heartbeat | ✅ OK | Regelmäßig alle 60s, Payload vollständig |
| Heartbeat ACK | ✅ OK | Server antwortet auf jeden Heartbeat |
| Diagnostics | ✅ OK | Alle 60s gesendet, vollständige Telemetrie |
| LWT (Last Will) | ⚠️ WARNUNG | Vorheriger unexpected_disconnect erkannt |
| Zone Assignment | 🔴 FEHLT | Keine `zone/assign` oder `zone/ack` Messages im Capture |
| Config Push | 🔴 FEHLT | Keine `config` oder `config_response` Messages |
| Payload-Validität | ✅ OK | Alle JSON-Payloads valide und vollständig |

---

## Beobachtete Topics

| Topic | Richtung | Anzahl | Status |
|-------|----------|--------|--------|
| `kaiser/god/esp/ESP_472204/system/will` | ESP→Broker | 1 | LWT retained |
| `kaiser/god/esp/ESP_472204/system/heartbeat` | ESP→Server | 16 | ✅ |
| `kaiser/god/esp/ESP_472204/system/heartbeat/ack` | Server→ESP | 16 | ✅ |
| `kaiser/god/esp/ESP_472204/system/diagnostics` | ESP→Server | 3 | ✅ |

**Erwartete aber FEHLENDE Topics (CONFIG-Mode):**

| Topic | Richtung | Erwartet | Status |
|-------|----------|----------|--------|
| `kaiser/god/esp/ESP_472204/zone/assign` | Server→ESP | JA | 🔴 NICHT GEFUNDEN |
| `kaiser/god/esp/ESP_472204/zone/ack` | ESP→Server | JA | 🔴 NICHT GEFUNDEN |
| `kaiser/god/esp/ESP_472204/config` | Server→ESP | JA | 🔴 NICHT GEFUNDEN |
| `kaiser/god/esp/ESP_472204/config_response` | ESP→Server | JA | 🔴 NICHT GEFUNDEN |

---

## Device: ESP_472204

### Status-Timeline

| Uptime | Server ACK Status | System State | Bemerkung |
|--------|-------------------|--------------|-----------|
| 4s | pending_approval | OPERATIONAL | Initial nach Reboot |
| 60s | pending_approval | PENDING_APPROVAL | State korrigiert |
| 64-604s | pending_approval | - | Wartend auf Approval |
| 604s | **online** | - | ✅ Approval erfolgt |
| 660s+ | online | OPERATIONAL | Normal betrieb |

**Zeitspanne im `pending_approval`:** ~600 Sekunden (10 Minuten)

### Heartbeat Payload Analyse

```json
{
    "esp_id": "ESP_472204",
    "zone_id": "test_zone_1",
    "master_zone_id": "",
    "zone_assigned": true,
    "ts": 1770061840,
    "uptime": 4,
    "heap_free": 210880,
    "wifi_rssi": -43,
    "sensor_count": 0,
    "actuator_count": 0,
    "gpio_status": [
        {"gpio":4,"owner":"sensor","component":"OneWireBus","mode":2,"safe":false},
        {"gpio":21,"owner":"system","component":"I2C_SDA","mode":2,"safe":false},
        {"gpio":22,"owner":"system","component":"I2C_SCL","mode":2,"safe":false}
    ],
    "gpio_reserved_count": 3,
    "config_status": {
        "wifi_configured": true,
        "zone_assigned": true,
        "system_configured": true,
        "subzone_count": 0,
        "boot_count": 2,
        "state": 8
    }
}
```

| Feld | Wert | Status |
|------|------|--------|
| esp_id | ESP_472204 | ✅ |
| zone_id | test_zone_1 | ✅ (bereits konfiguriert) |
| zone_assigned | true | ✅ |
| ts (Timestamp) | vorhanden | ✅ |
| uptime | steigend | ✅ |
| heap_free | 207-210 KB | ✅ stabil |
| wifi_rssi | -36 bis -43 dBm | ✅ gut |
| sensor_count | 0 | ⚠️ keine Sensoren |
| actuator_count | 0 | ⚠️ keine Aktoren |
| gpio_status | 3 reserviert | ✅ I2C + OneWire |

### Heartbeat ACK Analyse

```json
{
    "status": "pending_approval" | "online",
    "config_available": false,
    "server_time": 1770062439
}
```

| Feld | Wert | Status |
|------|------|--------|
| status | pending_approval → online | ✅ Transition korrekt |
| config_available | false | ⚠️ Keine Config bereit |
| server_time | vorhanden | ✅ |

### Diagnostics Analyse

```json
{
    "ts": 60,
    "esp_id": "ESP_472204",
    "heap_free": 209960,
    "heap_min_free": 202448,
    "heap_fragmentation": 3,
    "uptime_seconds": 60,
    "error_count": 0,
    "wifi_connected": true,
    "wifi_rssi": -38,
    "mqtt_connected": true,
    "sensor_count": 0,
    "actuator_count": 0,
    "system_state": "OPERATIONAL"
}
```

| Metrik | Wert | Bewertung |
|--------|------|-----------|
| heap_free | ~210 KB | ✅ Ausreichend |
| heap_min_free | ~202 KB | ✅ Keine kritischen Einbrüche |
| heap_fragmentation | 3% | ✅ Minimal |
| error_count | 0 | ✅ Fehlerfrei |
| mqtt_connected | true | ✅ |
| wifi_connected | true | ✅ |

---

## Evidence

### LWT Message (Zeile 1)

```
kaiser/god/esp/ESP_472204/system/will {"status":"offline","reason":"unexpected_disconnect","timestamp":1770060246}
```

**Interpretation:** Der ESP32 hatte vor diesem Capture einen unerwarteten Verbindungsabbruch. Die LWT Message wurde vom Broker gehalten und beim Start der MQTT-Subscription empfangen.

### Status-Transition (Zeile 24-25)

**VOR Approval (Zeile 24):**
```
kaiser/god/esp/ESP_472204/system/heartbeat {...,"uptime":604,...}
kaiser/god/esp/ESP_472204/system/heartbeat/ack {"status": "pending_approval", ...}
```

**NACH Approval (Zeile 25):**
```
kaiser/god/esp/ESP_472204/system/heartbeat {...,"uptime":604,...}
kaiser/god/esp/ESP_472204/system/heartbeat/ack {"status": "online", ...}
```

**Interpretation:** Der Device-Approval erfolgte serverseitig (vermutlich über Frontend/API) zwischen diesen beiden Heartbeats.

---

## Timing-Analyse

### Heartbeat-Intervall

| Heartbeat # | Uptime (s) | Delta (s) |
|-------------|------------|-----------|
| 1 | 4 | - |
| 2 | 64 | 60 ✅ |
| 3 | 124 | 60 ✅ |
| 4 | 184 | 60 ✅ |
| 5 | 244 | 60 ✅ |
| 6 | 304 | 60 ✅ |
| 7 | 364 | 60 ✅ |
| 8 | 424 | 60 ✅ |
| 9 | 484 | 60 ✅ |
| 10 | 544 | 60 ✅ |
| 11 | 604 | 60 ✅ |
| 12 | 664 | 60 ✅ |
| 13 | 724 | 60 ✅ |
| 14 | 784 | 60 ✅ |

**Bewertung:** ✅ Konstantes 60-Sekunden-Intervall, keine Ausfälle

### ACK-Latenz

| Heartbeat ts | ACK server_time | Delta (s) |
|--------------|-----------------|-----------|
| 1770061840 | 1770061839 | ~1s ✅ |
| 1770061900 | 1770061899 | ~1s ✅ |
| 1770061960 | 1770061959 | ~1s ✅ |

**Bewertung:** ✅ Server-Latenz < 2 Sekunden (akzeptabel)

---

## Diagnosis

### Hauptbefunde

1. **MQTT-Kommunikation funktioniert korrekt**
   - Topic-Schema wird eingehalten
   - Payloads sind vollständig und valide
   - Timing ist stabil

2. **Zone bereits zugewiesen (aus NVS)**
   - ESP meldet `zone_assigned: true` und `zone_id: "test_zone_1"`
   - Keine Zone-Assignment-Messages im Traffic, da Zone bereits in NVS gespeichert war
   - Dies ist **korrekt** bei einem Re-Boot nach vorheriger Konfiguration

3. **Keine Server-seitige Konfiguration gesendet**
   - `config_available: false` in allen ACKs
   - Keine `config` oder `config_response` Topics
   - Server hat keine zusätzliche Konfiguration für dieses Device

4. **Device war im Approval-Status**
   - Ca. 10 Minuten im `pending_approval` Status
   - Approval erfolgte zwischen uptime 604s und 664s
   - Nach Approval: Status wechselte zu `online`

5. **Vorheriger Verbindungsabbruch**
   - LWT Message zeigt `unexpected_disconnect`
   - Timestamp deutet auf ca. 26 Minuten vor Session-Start

### Status-Bewertung für CONFIG-Mode

| Erwartung | Erfüllt | Bemerkung |
|-----------|---------|-----------|
| Heartbeats funktionieren | ✅ | 16 korrekte Heartbeats |
| Server antwortet | ✅ | Alle ACKs empfangen |
| Zone Assignment via MQTT | ❌ | Nicht beobachtet (NVS) |
| Config Push via MQTT | ❌ | Server hat keine Config |

**Diagnose:** Der CONFIG-Flow über MQTT wurde NICHT ausgelöst, da:
1. Die Zone bereits im NVS des ESP32 gespeichert war
2. Der Server keine zusätzliche Konfiguration für dieses Device hatte

---

## Recommended Actions

### Sofortige Aktionen

1. **Für vollständigen CONFIG-Test:**
   - ESP32 NVS löschen (`nvs_erase_all` oder Reflash)
   - Dann neu booten
   - Zone über Frontend/API zuweisen
   - **Dann** MQTT Traffic erneut analysieren

2. **Server-Log prüfen (server-debug):**
   - Warum `config_available: false`?
   - Wurden Sensoren/Aktoren für dieses Device konfiguriert?

### Langfristige Empfehlungen

3. **LWT Handling verbessern:**
   - LWT-Cleanup nach Device-Reconnect (retained message löschen)

4. **Approval-Zeit verkürzen:**
   - 10 Minuten im pending_approval ist lang
   - Prüfen ob Auto-Approval konfiguriert werden kann

---

## Anhang: Message-Sequenz (Kurzform)

```
[1] will: unexpected_disconnect
[2] heartbeat → ack(pending_approval)
[3] diagnostics(OPERATIONAL)
[4] heartbeat → ack(pending_approval)
[5] diagnostics(PENDING_APPROVAL)
...
[12] heartbeat → ack(online) ← APPROVAL HIER
[13] diagnostics(OPERATIONAL)
[14] heartbeat → ack(online)
...
```

---

*Report generiert von mqtt-debug Agent*
*Session: 2026-02-02_20-50_provisioning-test*
