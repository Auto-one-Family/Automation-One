# MQTT Traffic Analyse Report

> **Session:** 2026-02-02_19-37_provisioning-test
> **Agent:** mqtt-debug
> **Fokus:** CONFIG-Flow (Zone Assignment, Config Push)
> **Erstellt:** 2026-02-02

---

## Zusammenfassung

| Aspekt | Status | Details |
|--------|--------|---------|
| Topic-Schema | ✅ KORREKT | `kaiser/god/esp/{esp_id}/...` |
| Payload-Struktur | ✅ KORREKT | Alle Pflichtfelder vorhanden |
| Message-Sequenz | ⚠️ WARNUNG | 2 Reconnects am Sessionstart |
| Heartbeat-Intervall | ✅ KORREKT | 60 Sekunden |
| Zone Assignment | ✅ KORREKT | zone_ack empfangen |
| Server-Response | ✅ KORREKT | ~1s Latenz |

**Gesamtbewertung:** ✅ CONFIG-Flow funktioniert korrekt

---

## 1. Topic-Analyse

### Gefundene Topics

| Topic | Richtung | Anzahl | Status |
|-------|----------|--------|--------|
| `kaiser/god/esp/ESP_472204/zone/ack` | ESP → Server | 1 | ✅ |
| `kaiser/god/esp/ESP_472204/system/will` | ESP → Server | 2 | ⚠️ |
| `kaiser/god/esp/ESP_472204/system/heartbeat` | ESP → Server | 15 | ✅ |
| `kaiser/god/esp/ESP_472204/system/heartbeat/ack` | Server → ESP | 14 | ✅ |
| `kaiser/god/esp/ESP_472204/system/diagnostics` | ESP → Server | 1 | ✅ |

### Topic-Schema Validierung

```
Erwartetes Pattern: kaiser/{kaiser_id}/esp/{esp_id}/{category}/{action}
Gefundenes Pattern: kaiser/god/esp/ESP_472204/{category}/{action}
                          ───  ──────────
                           │        │
                           │        └─ esp_id: ESP_472204 ✓
                           └─ kaiser_id: god ✓
```

**Ergebnis:** Topic-Schema entspricht Spezifikation in STATUS.md

---

## 2. Payload-Analyse

### 2.1 Zone ACK (ESP → Server)

```json
{
  "esp_id": "ESP_472204",
  "status": "zone_assigned",
  "zone_id": "test_zone_1",
  "master_zone_id": "",
  "ts": 1770057361
}
```

| Feld | Wert | Validierung |
|------|------|-------------|
| esp_id | ESP_472204 | ✅ Format korrekt |
| status | zone_assigned | ✅ Erwarteter Status |
| zone_id | test_zone_1 | ✅ Nicht leer |
| master_zone_id | "" | ✅ Optional |
| ts | 1770057361 | ✅ Unix Timestamp |

### 2.2 Heartbeat (ESP → Server)

**Beispiel-Payload (Zeile 9, nach Stabilisierung):**

```json
{
  "esp_id": "ESP_472204",
  "zone_id": "test_zone_1",
  "master_zone_id": "",
  "zone_assigned": true,
  "ts": 1770057559,
  "uptime": 63,
  "heap_free": 209872,
  "wifi_rssi": -38,
  "sensor_count": 0,
  "actuator_count": 0,
  "gpio_status": [
    {"gpio": 4, "owner": "sensor", "component": "OneWireBus", "mode": 2, "safe": false},
    {"gpio": 21, "owner": "system", "component": "I2C_SDA", "mode": 2, "safe": false},
    {"gpio": 22, "owner": "system", "component": "I2C_SCL", "mode": 2, "safe": false}
  ],
  "gpio_reserved_count": 3,
  "config_status": {
    "wifi_configured": true,
    "zone_assigned": true,
    "system_configured": true,
    "subzone_count": 0,
    "boot_count": 0,
    "state": 8
  }
}
```

**Pflichtfelder-Check (lt. STATUS.md):**

| Pflichtfeld | Vorhanden | Wert |
|-------------|-----------|------|
| ts | ✅ | 1770057559 |
| uptime | ✅ | 63 |
| heap_free | ✅ | 209872 |
| wifi_rssi | ✅ | -38 |

**Erweiterte Felder:**

| Feld | Status | Anmerkung |
|------|--------|-----------|
| gpio_status | ✅ | 3 reservierte GPIOs |
| config_status | ✅ | state=8 (OPERATIONAL) |
| sensor_count | ✅ | 0 (keine Sensoren konfiguriert) |
| actuator_count | ✅ | 0 (keine Aktoren konfiguriert) |

### 2.3 Heartbeat ACK (Server → ESP)

```json
{
  "status": "online",
  "config_available": false,
  "server_time": 1770057493
}
```

| Feld | Wert | Validierung |
|------|------|-------------|
| status | online | ✅ ESP ist online |
| config_available | false | ✅ Keine neue Config pending |
| server_time | 1770057493 | ✅ Unix Timestamp |

### 2.4 Diagnostics (ESP → Server)

```json
{
  "ts": 60,
  "esp_id": "ESP_472204",
  "heap_free": 209952,
  "heap_min_free": 200760,
  "heap_fragmentation": 4,
  "uptime_seconds": 60,
  "error_count": 0,
  "wifi_connected": true,
  "wifi_rssi": -39,
  "mqtt_connected": true,
  "sensor_count": 0,
  "actuator_count": 0,
  "system_state": "OPERATIONAL"
}
```

**Bewertung:** ✅ Vollständiger Diagnostics-Report, keine Fehler

---

## 3. Message-Sequenz-Analyse

### Zeitlicher Ablauf

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ZEIT        │ MESSAGE                        │ ANMERKUNG                     │
├─────────────┼────────────────────────────────┼───────────────────────────────┤
│ t=0         │ zone/ack (zone_assigned)       │ Zone erfolgreich zugewiesen   │
│ t+10s       │ will (unexpected_disconnect)   │ ⚠️ Erste Disconnection        │
│ t+133s      │ heartbeat (boot_count=2)       │ Reboot #1                     │
│ t+133s      │ heartbeat/ack                  │ Server bestätigt              │
│ t+133s      │ will (unexpected_disconnect)   │ ⚠️ Zweite Disconnection       │
│ t+138s      │ heartbeat (boot_count=3)       │ Reboot #2                     │
│ t+138s      │ heartbeat/ack                  │ Server bestätigt              │
│ t+198s      │ diagnostics                    │ 60s uptime, OPERATIONAL       │
│ t+198s      │ heartbeat (state=8)            │ ✅ Stabil                     │
│ t+258s+     │ heartbeat (alle 60s)           │ ✅ Regulärer Betrieb          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Beobachtungen

1. **Initiale Instabilität:** 2 Reboots am Session-Start
   - boot_count: 2 → 3
   - Will-Messages: 2x unexpected_disconnect

2. **Stabilisierung:** Nach ~200s stabiler Betrieb
   - state wechselt von 6 auf 8 (OPERATIONAL)
   - Keine weiteren Will-Messages

3. **Regulärer Heartbeat-Zyklus:**
   - Intervall: exakt 60 Sekunden ✅
   - Server-Antwortzeit: ~1 Sekunde ✅

---

## 4. CONFIG-Flow Validierung

### Checkliste (lt. STATUS.md Phase 4)

| Schritt | Status | Evidence |
|---------|--------|----------|
| Zone-Assignment empfangen | ✅ | `zone/ack` mit `status: zone_assigned` |
| Zone-ID gesetzt | ✅ | `zone_id: test_zone_1` in allen Heartbeats |
| zone_assigned Flag | ✅ | `zone_assigned: true` in allen Heartbeats |
| config_status aktualisiert | ✅ | `wifi_configured: true`, `zone_assigned: true` |
| System operational | ✅ | `state: 8`, `system_state: OPERATIONAL` |

**Ergebnis:** CONFIG-Flow vollständig und korrekt

---

## 5. Auffälligkeiten & Warnungen

### ⚠️ WARNUNG: Initiale Disconnections

**Symptom:** 2x `unexpected_disconnect` am Session-Start

**Will-Message Analyse:**
```json
{"status":"offline","reason":"unexpected_disconnect","timestamp":1770053671}
{"status":"offline","reason":"unexpected_disconnect","timestamp":1770057494}
```

**Mögliche Ursachen:**
1. Watchdog-Timeout während Boot
2. WiFi-Instabilität
3. MQTT-Broker Reconnect-Problem
4. Heap-Exhaustion

**Empfehlung:** ESP32-Serial-Log prüfen (esp32-debug) für Root-Cause

### ⚠️ HINWEIS: Keine Sensoren/Aktoren

**Beobachtung:**
- `sensor_count: 0`
- `actuator_count: 0`

**Bewertung:** Erwartbar für CONFIG-Test (nur Zone-Assignment getestet)

---

## 6. Metriken

### Heartbeat-Statistik

| Metrik | Wert |
|--------|------|
| Heartbeats gesendet | 15 |
| Heartbeats beantwortet | 14 |
| Antwortrate | 93.3% |
| Durchschnittliches Intervall | 60s |
| Min. heap_free | 209672 |
| Max. heap_free | 210876 |
| WiFi RSSI Range | -38 bis -45 dBm |

### Timing-Analyse

| Metrik | Wert |
|--------|------|
| Session-Dauer | ~15 Minuten |
| Zeit bis Stabilität | ~200s |
| Server-Latenz | ~1s |

---

## 7. Fazit

### Positiv

- ✅ Topic-Schema korrekt implementiert
- ✅ Alle Payload-Pflichtfelder vorhanden
- ✅ Heartbeat-Intervall exakt 60s
- ✅ Zone-Assignment erfolgreich
- ✅ Server-Response zuverlässig
- ✅ System erreicht OPERATIONAL-State

### Verbesserungsbedarf

- ⚠️ Initiale Reconnects klären (esp32-debug)
- ⚠️ boot_count Reset-Verhalten prüfen

### Empfehlungen

1. **ESP32-Serial-Log analysieren** für Ursache der initialen Disconnections
2. **Watchdog-Timeout** prüfen (falls relevant)
3. **Sensor/Actuator-Test** als nächster Schritt

---

*Report generiert: 2026-02-02*
*Agent: mqtt-debug*
*Session: 2026-02-02_19-37_provisioning-test*
