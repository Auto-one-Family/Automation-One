# MQTT ACL-Topic-Analyse — Ist-Zustand vs. vorbereitete ACL

**Datum:** 2026-03-27
**Prioritaet:** MEDIUM (Blocker fuer Mosquitto Stufe 2)
**Typ:** Reine Analyse, kein Code

---

## Executive Summary

Die ACL-Datei `docker/mosquitto/config/acl` **existiert nicht**. Die ACL-Konfiguration in `mosquitto.conf` ist auskommentiert. Das System laeuft im Anonymous-Modus (`allow_anonymous true`). Die ACL muss komplett neu erstellt werden.

Zusaetzlich wurden **3 Firmware-Bugs** und **4 Orphaned Topics** gefunden, die bei der ACL-Erstellung beruecksichtigt werden muessen.

**Gesamtbilanz:** 31 aktive Topic-Patterns identifiziert, 4 Orphaned Topics, 3 Firmware-Bugs.

---

## Quelle 3: ACL-Status

```
# mosquitto.conf (Zeile 29-31) — ALLES AUSKOMMENTIERT:
# allow_anonymous false
# password_file /mosquitto/config/passwd
# acl_file /mosquitto/config/acl
```

**Aktueller Modus:** Anonymous Development — alle Clients haben uneingeschraenkten Zugriff auf alle Topics.

**Konsequenz:** Die Spalten "ACL el-servador" und "ACL esp_firmware" in der Tabelle unten zeigen den **SOLL-Zustand** fuer die zu erstellende ACL.

---

## Vollstaendige Topic-Zuordnungstabelle

### Legende

| Spalte | Bedeutung |
|--------|-----------|
| Backend SUB | Server subscribet dieses Topic (Handler in `main.py`) |
| Backend PUB | Server published auf dieses Topic |
| Firmware SUB | ESP32 subscribet dieses Topic |
| Firmware PUB | ESP32 published auf dieses Topic |
| ACL Server (SOLL) | Benoetigtes Zugriffsrecht fuer `el-servador` |
| ACL ESP (SOLL) | Benoetigtes Zugriffsrecht fuer `esp_firmware` |

### Sensor-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 1 | `kaiser/+/esp/+/sensor/+/data` | `sensor_handler` (main.py:242) | — | — | `SensorManager::publishSensorReading` (sensor_manager.cpp:1527) | read | write |
| 2 | `kaiser/+/esp/+/sensor/+/command` | — | `publisher.publish_sensor_command` (publisher.py:128) | Wildcard SUB (main.cpp:841) | — | write | read |
| 3 | `kaiser/+/esp/+/sensor/+/response` | — (kein Handler registriert) | — | — | `handleSensorCommand` (main.cpp:2894) | read | write |
| 4 | `kaiser/+/esp/+/sensor/+/processed` | — | `publisher.publish_pi_enhanced_response` (publisher.py:340) | — | — | write | — |
| 5 | `kaiser/+/esp/+/sensor/batch` | — (ORPHANED, kein Handler) | — | — | — (ORPHANED) | — | — |

### Actuator-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 6 | `kaiser/+/esp/+/actuator/+/command` | Mock-SUB (main.py:347) | `publisher.publish_actuator_command` (publisher.py:88) | Wildcard SUB (main.cpp:825) | — | readwrite | read |
| 7 | `kaiser/+/esp/+/actuator/+/status` | `actuator_handler` (main.py:245) | Mock-PUB (simulation/actuator_handler.py:670) | — | `ActuatorManager::publishActuatorStatus` (actuator_manager.cpp:852) | readwrite | write |
| 8 | `kaiser/+/esp/+/actuator/+/response` | `actuator_response_handler` (main.py:248) | Mock-PUB (simulation/actuator_handler.py:612) | — | `ActuatorManager::publishActuatorResponse` (actuator_manager.cpp:896) | readwrite | write |
| 9 | `kaiser/+/esp/+/actuator/+/alert` | `actuator_alert_handler` (main.py:252) | — | — | `ActuatorManager::publishActuatorAlert` (actuator_manager.cpp:919) | read | write |

### Emergency-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 10 | `kaiser/broadcast/emergency` | Mock-SUB (main.py:355) | `actuators.py:977` (API), `main.py:208` (startup clear) | SUB (main.cpp:824) | — | readwrite | read |
| 11 | `kaiser/+/esp/+/actuator/emergency` | Mock-SUB (main.py:351) | — | SUB (main.cpp:826) | — | write | read |
| 12 | `kaiser/+/esp/+/actuator/emergency/response` | — (kein Handler) | — | — | PUB (main.cpp:921) | read | write |
| 13 | `kaiser/+/esp/+/actuator/emergency/error` | — (kein Handler) | — | — | PUB (main.cpp:900) | read | write |

### System-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 14 | `kaiser/+/esp/+/system/heartbeat` | `heartbeat_handler` (main.py:255) | — | — | `MQTTClient::publishHeartbeat` (mqtt_client.cpp:766) | read | write |
| 15 | `kaiser/+/esp/+/system/heartbeat/ack` | — | `heartbeat_handler._send_heartbeat_ack` (heartbeat_handler.py:1209) | SUB (main.cpp:845) | — | write | read |
| 16 | `kaiser/+/esp/+/system/will` | `lwt_handler` (main.py:277) | — | — | LWT automatisch (mqtt_client.cpp:196) | read | write |
| 17 | `kaiser/+/esp/+/system/command` | — | `publisher.publish_system_command` (publisher.py:296) | SUB (main.cpp:822) | — | write | read |
| 18 | `kaiser/+/esp/+/system/command/response` | — (kein Handler) | — | — | PUB (main.cpp:1002ff) | read | write |
| 19 | `kaiser/+/esp/+/system/error` | `error_handler` (main.py:283) | — | — | `ErrorTracker::publishMqttError` (error_tracker.cpp:341) | read | write |
| 20 | `kaiser/+/esp/+/system/diagnostics` | `diagnostics_handler` (main.py:289) | — | — | `HealthMonitor::publishSnapshot` (health_monitor.cpp:296) | read | write |

### Config-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 21 | `kaiser/+/esp/+/config` | — | `publisher.publish_config` (publisher.py:238) | SUB (main.cpp:823) | — | write | read |
| 22 | `kaiser/+/esp/+/config/sensor/+` | — | `publisher.publish_sensor_config` (publisher.py:169) | — (empfangen via #21 config) | — | write | read |
| 23 | `kaiser/+/esp/+/config/actuator/+` | — | `publisher.publish_actuator_config` (publisher.py:199) | — (empfangen via #21 config) | — | write | read |
| 24 | `kaiser/+/esp/+/config_response` | `config_handler` (main.py:261) | — | — | `ConfigResponseBuilder::publish` (config_response.cpp:44) | read | write |

### Zone-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 25 | `kaiser/+/esp/+/zone/assign` | — | `zone_service.assign_zone` via MQTTCommandBridge | SUB (main.cpp:827) | — | write | read |
| 26 | `kaiser/+/esp/+/zone/ack` | `zone_ack_handler` (main.py:265) | — | — | PUB (main.cpp:1487ff) | read | write |

### Subzone-Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 27 | `kaiser/+/esp/+/subzone/assign` | — | `subzone_service.assign_subzone` via MQTTCommandBridge | SUB (main.cpp:833) | — | write | read |
| 28 | `kaiser/+/esp/+/subzone/remove` | — | `subzone_service.remove_subzone` (subzone_service.py:283) | SUB (main.cpp:834) | — | write | read |
| 29 | `kaiser/+/esp/+/subzone/safe` | — | `subzone_service.enable/disable_safe_mode` (subzone_service.py:355/409) | SUB (main.cpp:835) | — | write | read |
| 30 | `kaiser/+/esp/+/subzone/ack` | `subzone_ack_handler` (main.py:269) | — | — | PUB (main.cpp:133) | read | write |
| 31 | `kaiser/+/esp/+/subzone/status` | — (ORPHANED, kein Handler) | — | — | — (ORPHANED) | — | — |

### Sonstige Topics

| # | Topic-Pattern | Backend SUB | Backend PUB | Firmware SUB | Firmware PUB | ACL Server (SOLL) | ACL ESP (SOLL) |
|---|---------------|-------------|-------------|--------------|--------------|--------------------|--------------------|
| 32 | `kaiser/+/discovery/esp32_nodes` | `discovery_handler` (main.py:258) DEPRECATED | — | — | — | read | write |
| 33 | `kaiser/+/esp/+/mqtt/auth_update` | — | `mqtt_auth_service.broadcast_auth_update` (mqtt_auth_service.py:358) | — | — | write | read |
| 34 | `kaiser/broadcast/all` | — | PUB (konstante) | — | — | write | — |
| 35 | `kaiser/broadcast/zone/+` | — | PUB (konstante) | — | — | write | — |
| 36 | `kaiser/+/command` | SUB (constants.py) | PUB (constants.py) | — | — | readwrite | — |
| 37 | `kaiser/+/status` | — | PUB (constants.py) | — | — | write | — |
| 38 | `kaiser/god/esp/+/onewire/scan_result` | — (kein Handler!) | — | — | PUB HARDCODED (main.cpp:1094) | read | write |

---

## Spezial-Pruefungen

### 1. LWT-Topic

| Aspekt | Wert |
|--------|------|
| **Topic** | `kaiser/{kaiser_id}/esp/{esp_id}/system/will` |
| **QoS** | 1 |
| **Retain** | true |
| **Payload** | `{"status":"offline","reason":"unexpected_disconnect","timestamp":{unix_ts}}` |
| **Firmware-Quelle** | `mqtt_client.cpp:196-203` — dynamisch aus Heartbeat-Topic abgeleitet |
| **Server-Handler** | `lwt_handler.handle_lwt` (main.py:277) |
| **ACL benoetigt** | Server: read, ESP: write |
| **Status** | OK — Topic-Pattern konsistent zwischen Backend und Firmware |

### 2. Emergency-Broadcast

| Aspekt | Wert |
|--------|------|
| **Topic** | `kaiser/broadcast/emergency` |
| **Backend published** | Ja — `actuators.py:977` (API Endpoint), `main.py:208` (Startup retained-clear) |
| **Firmware subscribed** | Ja — `main.cpp:824` |
| **Backend subscribed** | Nur Mock-ESP (main.py:355) |
| **ACL benoetigt** | Server: readwrite (pub+mock-sub), ESP: read |
| **Status** | OK — aber Kommentar in Firmware falsch (sagt "ESP never subscribes") |

Zusaetzlich existiert ein **ESP-spezifischer** Emergency-Topic:
- `kaiser/+/esp/+/actuator/emergency` — Server PUB (nicht explizit gefunden), ESP SUB (main.cpp:826)
- Firmware published Antworten auf `.../emergency/response` und `.../emergency/error`
- **Kein Server-Handler** fuer diese Response/Error-Topics registriert!

### 3. Zone-ACK

| Aspekt | Wert |
|--------|------|
| **Topic** | `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` |
| **Wer published** | ESP32 (main.cpp:1487, 1513, 1554, 1643, 1670) |
| **Wer subscribed** | Server `zone_ack_handler` (main.py:265) via Wildcard `kaiser/+/esp/+/zone/ack` |
| **ACL benoetigt** | Server: read, ESP: write |
| **Status** | OK |

### 4. Config-Push

| Aspekt | Wert |
|--------|------|
| **Topic** | `kaiser/{kaiser_id}/esp/{esp_id}/config` |
| **Backend published** | Ja — `publisher.publish_config` (publisher.py:238), `heartbeat_handler._auto_push_config` |
| **Firmware subscribed** | Ja — `main.cpp:823` |
| **ACL benoetigt** | Server: write, ESP: read |
| **Status** | OK |

Zusaetzlich per-Sensor/Actuator Config:
- `kaiser/+/esp/+/config/sensor/+` — Server write, ESP read
- `kaiser/+/esp/+/config/actuator/+` — Server write, ESP read

### 5. Discovery/Registration

| Aspekt | Wert |
|--------|------|
| **Topic** | `kaiser/{kaiser_id}/discovery/esp32_nodes` |
| **Backend subscribed** | `discovery_handler` (main.py:258) — markiert als **DEPRECATED** |
| **Firmware published** | **Nein** — kein Publish-Code in der Firmware gefunden |
| **ACL benoetigt** | Server: read (falls noch aktiv) |
| **Status** | DEPRECATED — kein aktiver Discovery-Mechanismus in der Firmware. ESP-Registration erfolgt implizit ueber ersten Heartbeat. |

**Hinweis:** Es gibt kein dediziertes Discovery/Registration-Topic das in der ACL fehlen wuerde. Die Registration erfolgt ueber den Heartbeat-Handler.

---

## Firmware-Bugs (gefunden waehrend Analyse)

### BUG 1: Falsches Unsubscribe bei Kaiser-ID-Wechsel (MEDIUM)

**Datei:** `El Trabajante/src/main.cpp:1577`
**Problem:** Bei Zone-Assignment mit neuer Kaiser-ID wird fuer Heartbeat-ACK das falsche Topic unsubscribed:
```cpp
// IST (falsch):
mqtt.unsubscribe("kaiser/" + old_kaiser_id + "/system/heartbeat/ack");
// SOLL (korrekt):
mqtt.unsubscribe("kaiser/" + old_kaiser_id + "/esp/" + esp_id + "/system/heartbeat/ack");
```
**Auswirkung:** Nach Kaiser-ID-Wechsel bleibt das alte ACK-Subscription aktiv. Doppelte Heartbeat-ACKs moeglich.

### BUG 2: Hardcoded Kaiser-ID in OneWire Scan (LOW)

**Datei:** `El Trabajante/src/main.cpp:1094`
**Problem:** Topic `kaiser/god/esp/{esp_id}/onewire/scan_result` hat hardcodierten Kaiser-ID `"god"` statt konfiguriertem Wert.
**Auswirkung:** Bei Umbenennung der Kaiser-ID wuerde der Scan-Result auf falschem Topic landen.
**Zusatz:** Kein Server-Handler fuer dieses Topic registriert!

### BUG 3: Veralteter Kommentar in TopicBuilder (TRIVIAL)

**Datei:** `El Trabajante/src/mqtt/topic_builder.h:35` / `topic_builder.cpp:218`
**Problem:** `buildBroadcastEmergencyTopic()` markiert als "GHOST - ESP never subscribes", aber ESP subscribed es tatsaechlich in `main.cpp:824`.

---

## Orphaned Topics (in Code definiert, aber nicht aktiv genutzt)

| Topic | Definiert in | Status |
|-------|-------------|--------|
| `kaiser/+/esp/+/sensor/batch` | `topic_builder.cpp:95` | TopicBuilder-Methode existiert, kein Publisher, kein Handler |
| `kaiser/+/esp/+/subzone/status` | `topic_builder.cpp:250`, `constants.py` | TopicBuilder + Konstante existieren, kein Publisher, kein Handler |
| `kaiser/+/esp/+/sensor/+/processed` | `publisher.py:340` | Server published (Pi-Enhanced), aber kein Consumer/Handler |
| `kaiser/+/discovery/esp32_nodes` | `constants.py`, Handler in `main.py:258` | DEPRECATED — Handler existiert, aber Firmware published nicht |

---

## Topics ohne Server-Handler (ESP published, niemand hoert zu)

| # | Topic | Firmware-Quelle | Empfehlung |
|---|-------|-----------------|------------|
| 1 | `kaiser/+/esp/+/sensor/+/response` | main.cpp:2894 | Handler registrieren oder Topic dokumentieren als fire-and-forget |
| 2 | `kaiser/+/esp/+/system/command/response` | main.cpp:1002ff | Handler registrieren (13 verschiedene Subcommand-Responses) |
| 3 | `kaiser/+/esp/+/actuator/emergency/response` | main.cpp:921 | Handler registrieren |
| 4 | `kaiser/+/esp/+/actuator/emergency/error` | main.cpp:900 | Handler registrieren |
| 5 | `kaiser/god/esp/+/onewire/scan_result` | main.cpp:1094 (HARDCODED) | Handler registrieren + Kaiser-ID dynamisieren |

---

## SOLL-ACL Vorlage

Basierend auf der Analyse. Zwei MQTT-User: `el-servador` (Backend) und `esp_firmware` (alle ESP32).

```
# ============================================================
# AutomationOne MQTT ACL — generiert aus Code-Analyse 2026-03-27
# ============================================================

# --- User: el-servador (God-Kaiser Server) ---
user el-servador

# Sensor-Daten empfangen (ESP -> Server)
topic read kaiser/+/esp/+/sensor/+/data
topic read kaiser/+/esp/+/sensor/+/response

# Sensor-Kommandos senden (Server -> ESP)
topic write kaiser/+/esp/+/sensor/+/command

# Pi-Enhanced Response senden (Server -> ESP, kein Consumer aktuell)
topic write kaiser/+/esp/+/sensor/+/processed

# Actuator-Status empfangen (ESP -> Server)
topic read kaiser/+/esp/+/actuator/+/status
topic read kaiser/+/esp/+/actuator/+/response
topic read kaiser/+/esp/+/actuator/+/alert

# Actuator-Kommandos senden (Server -> ESP)
topic write kaiser/+/esp/+/actuator/+/command

# Emergency (Server -> ESP broadcast + ESP-spezifisch)
topic readwrite kaiser/broadcast/emergency
topic write kaiser/+/esp/+/actuator/emergency
topic read kaiser/+/esp/+/actuator/emergency/response
topic read kaiser/+/esp/+/actuator/emergency/error

# System-Topics empfangen (ESP -> Server)
topic read kaiser/+/esp/+/system/heartbeat
topic read kaiser/+/esp/+/system/will
topic read kaiser/+/esp/+/system/error
topic read kaiser/+/esp/+/system/diagnostics
topic read kaiser/+/esp/+/system/command/response

# System-Kommandos senden (Server -> ESP)
topic write kaiser/+/esp/+/system/command
topic write kaiser/+/esp/+/system/heartbeat/ack

# Config senden (Server -> ESP)
topic write kaiser/+/esp/+/config
topic write kaiser/+/esp/+/config/sensor/+
topic write kaiser/+/esp/+/config/actuator/+

# Config-Response empfangen (ESP -> Server)
topic read kaiser/+/esp/+/config_response

# Zone-Management (Server -> ESP + ACK zurueck)
topic write kaiser/+/esp/+/zone/assign
topic read kaiser/+/esp/+/zone/ack

# Subzone-Management (Server -> ESP + ACK zurueck)
topic write kaiser/+/esp/+/subzone/assign
topic write kaiser/+/esp/+/subzone/remove
topic write kaiser/+/esp/+/subzone/safe
topic read kaiser/+/esp/+/subzone/ack

# MQTT-Auth-Update (Server -> ESP)
topic write kaiser/+/esp/+/mqtt/auth_update

# Broadcast (Server -> alle ESP)
topic write kaiser/broadcast/all
topic write kaiser/broadcast/zone/+

# Kaiser-Status (Server intern)
topic readwrite kaiser/+/command
topic write kaiser/+/status

# Discovery (DEPRECATED, aber Handler noch aktiv)
topic read kaiser/+/discovery/esp32_nodes

# OneWire Scan Result (Firmware BUG: hardcoded kaiser/god)
topic read kaiser/god/esp/+/onewire/scan_result


# --- User: esp_firmware (alle ESP32-Geraete) ---
user esp_firmware

# Sensor-Daten senden (ESP -> Server)
topic write kaiser/+/esp/+/sensor/+/data
topic write kaiser/+/esp/+/sensor/+/response

# Sensor-Kommandos empfangen (Server -> ESP)
topic read kaiser/+/esp/+/sensor/+/command

# Actuator-Status senden (ESP -> Server)
topic write kaiser/+/esp/+/actuator/+/status
topic write kaiser/+/esp/+/actuator/+/response
topic write kaiser/+/esp/+/actuator/+/alert

# Actuator-Kommandos empfangen (Server -> ESP)
topic read kaiser/+/esp/+/actuator/+/command

# Emergency empfangen + Antwort
topic read kaiser/broadcast/emergency
topic read kaiser/+/esp/+/actuator/emergency
topic write kaiser/+/esp/+/actuator/emergency/response
topic write kaiser/+/esp/+/actuator/emergency/error

# System-Topics senden (ESP -> Server)
topic write kaiser/+/esp/+/system/heartbeat
topic write kaiser/+/esp/+/system/will
topic write kaiser/+/esp/+/system/error
topic write kaiser/+/esp/+/system/diagnostics
topic write kaiser/+/esp/+/system/command/response

# System-Kommandos empfangen (Server -> ESP)
topic read kaiser/+/esp/+/system/command
topic read kaiser/+/esp/+/system/heartbeat/ack

# Config empfangen (Server -> ESP)
topic read kaiser/+/esp/+/config
topic read kaiser/+/esp/+/config/sensor/+
topic read kaiser/+/esp/+/config/actuator/+

# Config-Response senden (ESP -> Server)
topic write kaiser/+/esp/+/config_response

# Zone-Management empfangen + ACK
topic read kaiser/+/esp/+/zone/assign
topic write kaiser/+/esp/+/zone/ack

# Subzone-Management empfangen + ACK
topic read kaiser/+/esp/+/subzone/assign
topic read kaiser/+/esp/+/subzone/remove
topic read kaiser/+/esp/+/subzone/safe
topic write kaiser/+/esp/+/subzone/ack

# MQTT-Auth-Update empfangen (Server -> ESP)
topic read kaiser/+/esp/+/mqtt/auth_update

# Discovery (DEPRECATED)
topic write kaiser/+/discovery/esp32_nodes

# OneWire Scan Result (BUG: hardcoded god)
topic write kaiser/god/esp/+/onewire/scan_result
```

---

## Zusammenfassung der Abweichungen

Da keine ACL-Datei existiert, gibt es keine "Abweichungen" im klassischen Sinn. Stattdessen:

### Risiken bei ACL-Erstellung

| # | Risiko | Details | Auswirkung wenn vergessen |
|---|--------|---------|---------------------------|
| 1 | `/system/` Prefix in Heartbeat/Diagnostics/Will | Topics enthalten `/system/` Segment — Doku ohne dieses Prefix waere falsch | ESPs erscheinen offline, kein Heartbeat |
| 2 | `system/command/response` fehlt in Doku | ESP published Antworten auf System-Commands, kein Server-Handler | ACL koennte write fuer ESP vergessen |
| 3 | `actuator/emergency/response` und `/error` | ESP published, kein Server-Handler | ACL koennte write fuer ESP vergessen |
| 4 | `sensor/+/response` (on-demand) | ESP published Sensor-Response, kein Server-Handler | ACL koennte write fuer ESP vergessen |
| 5 | OneWire `kaiser/god/...` hardcoded | Topic ignoriert konfigurierte Kaiser-ID | ACL muss explizit `kaiser/god/...` erlauben |
| 6 | `mqtt/auth_update` | Neues Topic fuer MQTT-Auth-Rotation | Koennte in alter Doku fehlen |
| 7 | Mock-ESP Topics | Server subscribed Actuator-Command/Emergency fuer Mock-Simulation | ACL fuer Server braucht auch read auf diesen Topics |
| 8 | `config/sensor/+` und `config/actuator/+` | Separate Config-Topics pro Sensor/Actuator zusaetzlich zu `/config` | ACL muss alle 3 Config-Patterns abdecken |

### Empfohlene Reihenfolge fuer Stufe 2

1. ACL-Datei erstellen (SOLL-Vorlage oben als Basis)
2. Password-Datei erstellen (`mosquitto_passwd`)
3. Firmware-Bugs fixen (BUG 1 + BUG 2)
4. `allow_anonymous false` aktivieren
5. Testen: Heartbeat, Sensor-Daten, Config-Push, Emergency, Zone-Assign

---

## Akzeptanzkriterien — Status

- [x] Vollstaendige Topic-Tabelle mit allen 3 Quellen abgeglichen (38 Topics, 31 aktiv)
- [x] Jede Abweichung zwischen ACL und tatsaechlicher Nutzung dokumentiert (keine ACL vorhanden — SOLL erstellt)
- [x] LWT-Topic, Emergency-Broadcast, Zone-ACK, Config-Push und Discovery separat geprueft
- [x] Korrekturvorschlaege fuer jede Abweichung formuliert (SOLL-ACL Vorlage)
- [x] Ergebnis als Report in `.claude/reports/current/`
