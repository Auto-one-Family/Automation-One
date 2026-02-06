# SYSTEM_CONTROL_BROKER_FIX.md

**Agent:** system-control
**Timestamp:** 2026-02-05T18:39:35+01:00
**Auftrag:** Verifizieren ob ESP_472204 nach Broker-Fix korrekt registriert wurde

---

## Executive Summary

| Aspekt | Status | Ergebnis |
|--------|--------|----------|
| MQTT-Traffic | ✅ OK | Heartbeat empfangen |
| Broker-Connection | ✅ OK | ESP_472204 verbunden |
| Server-Discovery | ❌ FEHLER | Datetime-Bug blockiert |
| Pending-Device | ❌ FEHLER | Nicht registriert |
| **Broker-Fix** | ✅ ERFOLGREICH | ESP sendet an richtigen Broker |
| **Provisioning-Flow** | ❌ BLOCKIERT | Server-Bug verhindert Registrierung |

---

## 1. MQTT-Traffic (Priorität 1)

**Befehl:** `docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 5 -W 60`

**Ergebnis:** ✅ Heartbeat empfangen

```
Topic: kaiser/god/esp/ESP_472204/system/heartbeat
Payload:
{
  "esp_id": "ESP_472204",
  "zone_id": "",
  "master_zone_id": "",
  "zone_assigned": false,
  "ts": 1770313144,
  "uptime": 182,
  "heap_free": 209764,
  "wifi_rssi": -51,
  "sensor_count": 0,
  "actuator_count": 0,
  "gpio_status": [
    {"gpio": 4, "owner": "bus/onewire/4", "component": "OneWireBus", "mode": 2, "safe": false},
    {"gpio": 21, "owner": "system", "component": "I2C_SDA", "mode": 2, "safe": false},
    {"gpio": 22, "owner": "system", "component": "I2C_SCL", "mode": 2, "safe": false}
  ],
  "gpio_reserved_count": 3,
  "config_status": {
    "wifi_configured": true,
    "zone_assigned": false,
    "system_configured": true,
    "subzone_count": 0,
    "boot_count": 4,
    "state": 0
  }
}
```

**Bewertung:** ESP sendet korrekt strukturierte Heartbeats an den Docker-Broker.

---

## 2. Broker-Logs (Client-Connection)

**Befehl:** `docker compose logs --since 5m mqtt-broker`

**Ergebnis:** ✅ ESP_472204 verbunden

```
2026-02-05T17:36:04: New connection from 172.18.0.1:60948 on port 1883.
2026-02-05T17:36:04: New client connected from 172.18.0.1:60948 as ESP_472204 (p2, c1, k60).
```

**Details:**
- Client-ID: `ESP_472204`
- Verbunden seit: 17:36:04 UTC
- Source-IP: 172.18.0.1 (Host-Bridge)
- Protocol: MQTT v5 (p2), Clean Session (c1), Keepalive 60s (k60)

---

## 3. Server-Logs (Discovery/Heartbeat)

**Befehl:** `docker compose logs --since 5m el-servador | grep ESP_472204`

**Ergebnis:** ❌ Auto-Registrierung schlägt fehl

### Fehler (wiederholt bei jedem Heartbeat):

```
2026-02-05 17:36:04 - src.mqtt.handlers.heartbeat_handler - ERROR - [-] -
Error auto-registering ESP ESP_472204:
(sqlalchemy.dialects.postgresql.asyncpg.Error) <class 'asyncpg.exceptions.DataError'>:
invalid input for query argument $15: datetime.datetime(2026, 2, 5, 17, 36, 4,...
(can't subtract offset-naive and offset-aware datetimes)
```

### Fehleranalyse:

| Attribut | Wert |
|----------|------|
| **Fehlertyp** | `asyncpg.exceptions.DataError` |
| **Ursache** | Timezone-Inkompatibilität (naive vs aware datetime) |
| **Fehlerort** | `heartbeat_handler.py:377` → `_auto_register_esp()` |
| **Betroffenes Feld** | Query-Argument $15 (vermutlich `last_seen` oder `first_seen`) |
| **Reproduzierbar** | Ja, bei jedem Heartbeat (17:36, 17:37, 17:38, 17:39) |

### Versuchte Registrierungen:

Der Server versucht korrekt, ESP_472204 als Pending-Device zu registrieren:
- Status: `pending_approval`
- Discovery-Source: `heartbeat`
- Device-Type: `ESP32_WROOM`
- Capabilities: `heartbeat, sensors, actuators`

Die Registrierung scheitert **nach** der Datenvalidierung beim DB-Insert.

---

## 4. Pending-Devices (API)

**Befehle:**
```bash
# Login
POST /api/v1/auth/login
{"username": "admin", "password": "Admin123#"}

# Pending Devices
GET /api/v1/esp/devices/pending
Authorization: Bearer <token>
```

**Ergebnis:** ❌ Keine Pending-Devices

```json
{
  "success": true,
  "message": null,
  "devices": [],
  "count": 0
}
```

ESP_472204 erscheint NICHT in der Pending-Liste, weil der Datetime-Bug die DB-Insertion blockiert.

---

## 5. Gesamtergebnis

### Broker-Fix: ✅ ERFOLGREICH

Das ursprüngliche Problem (zwei MQTT-Broker) ist **gelöst**:
- Lokaler Mosquitto: Gestoppt
- Docker Mosquitto: Einziger aktiver Broker
- ESP_472204: Verbindet korrekt mit Docker-Broker
- Heartbeats: Werden korrekt empfangen

### Provisioning-Flow: ❌ BLOCKIERT

Ein **neuer Bug** im Server verhindert die Device-Registrierung:

| Flow-Schritt | Status |
|--------------|--------|
| ESP → MQTT Broker | ✅ Funktioniert |
| Broker → Server | ✅ Funktioniert |
| Server: Heartbeat empfangen | ✅ Funktioniert |
| Server: Auto-Register auslösen | ✅ Funktioniert |
| Server: DB Insert | ❌ **FEHLER** - Datetime-Bug |
| Pending-Device sichtbar | ❌ Blockiert |

---

## 6. Nächste Schritte (für TM)

### Sofort erforderlich:

1. **Datetime-Bug fixen** in `El Servador/src/mqtt/handlers/heartbeat_handler.py:377`
   - Problem: Mischung von timezone-aware und timezone-naive datetimes
   - Lösung: Alle datetimes auf UTC mit timezone-info normalisieren

### Nach Fix:

2. ESP_472204 Reset (oder warten auf nächsten Heartbeat)
3. Pending-Device sollte erscheinen
4. Device approven und Zone zuweisen

---

## Anhang: Rohdaten

### Heartbeat-Payload (gekürzt)
```json
{
  "esp_id": "ESP_472204",
  "uptime": 182,
  "heap_free": 209764,
  "wifi_rssi": -51,
  "sensor_count": 0,
  "actuator_count": 0,
  "config_status": {"state": 0, "boot_count": 4}
}
```

### Fehlgeschlagene Insert-Parameter
```
UUID: b9774a19-613d-4324-9049-c868c4f56a3a
esp_id: ESP_472204
status: pending_approval
created_at: 2026-02-05 17:36:04.235501+00:00 (aware)
last_seen: 2026-02-05 17:36:04.246958 (NAIVE - Problem!)
```

---

**Report erstellt von:** system-control
**Keine Code-Änderungen durchgeführt** (wie angewiesen)
