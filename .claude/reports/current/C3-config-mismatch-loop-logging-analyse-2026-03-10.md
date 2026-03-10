# C3 — Config Mismatch Loop: Server-seitiges Logging-Analyse

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: "Config Mismatch Loop — Server-seitiges Logging entlang Heartbeat → Config-Push → ACK")
**Typ:** Reine Code-Analyse — kein Code geaendert
**Quellen:** Direkte Datei-Lektuere (kein laufender Server befragt)

---

## 1. Zusammenfassung

Der Config-Mismatch-Loop ist vollstaendig im Code implementiert und hat ein gemischtes Logging-Bild: Die Erkennungsphase (Mismatch-Detection) ist gut dokumentiert, der Config-Push-Inhalt aber nur auf Zusammenfassungsebene (Counts, nie vollstaendiger JSON-Payload). Das groesste Risiko ist Log-Flooding bei Zone-Mismatch: dieser Pfad loggt bei jedem 30s-Heartbeat ein WARNING ohne eigene Cooldown-Logik im Logger — nur der `zone_resync_cooldown_seconds=60` bremst den MQTT-Push, nicht das Logging. Der ACK-Pfad (MQTTCommandBridge) ist gut instrumentiert.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `mqtt/handlers/heartbeat_handler.py` | Vollstaendig gelesen (1556 Zeilen) | Primaere Analyse-Quelle |
| `services/mqtt_command_bridge.py` | Vollstaendig gelesen (233 Zeilen) | ACK-Bridge vollstaendig |
| `services/config_builder.py` | Vollstaendig gelesen (254 Zeilen) | Config-Payload-Bau |
| `services/esp_service.py` | `send_config()` gelesen (Zeilen 395-545) | Config-MQTT-Publish |
| `mqtt/handlers/sensor_handler.py` | Logging-Pattern gelesen | Kein Config-Push darin |

---

## 3. C3-01: Heartbeat-Handler Logging

**Logger-Name:** `god_kaiser.mqtt.handlers.heartbeat_handler` (via `get_logger(__name__)`, Zeile 40)

### 3.1 Einstieg und Validierung

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:105` | ERROR | `[{error_code}] Failed to parse heartbeat topic: {topic}` | error_code, topic | Gut — Code + Kontext |
| `heartbeat_handler.py:113` | DEBUG | `Processing heartbeat: esp_id={esp_id_str}` | esp_id | Angemessen — frequentes Log |
| `heartbeat_handler.py:121` | ERROR | `[{error_code}] Invalid heartbeat payload from {esp_id_str}: {error}` | error_code, esp_id, Fehlertext | Gut |

### 3.2 Status-basiertes Device-Routing

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:143` | DEBUG | `Discovery rate limited for {esp_id_str}: {status_msg}` | esp_id, reason | Angemessen |
| `heartbeat_handler.py:178` | DEBUG | `Rejected device {esp_id_str} in cooldown, ignoring` | esp_id | Angemessen |
| `heartbeat_handler.py:190` | DEBUG | `Pending device {esp_id_str} heartbeat recorded` | esp_id | Angemessen |
| `heartbeat_handler.py:201` | INFO | `Device {esp_id_str} now online after approval` | esp_id | Gut |
| `heartbeat_handler.py:220` | WARNING | `Failed to audit log device_online: {audit_error}` | audit_error | Akzeptabel |

### 3.3 Heartbeat-Verarbeitung (normaler Pfad)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:243` | DEBUG | `Cleared retained LWT message for {esp_id_str}` | esp_id | Angemessen |
| `heartbeat_handler.py:245` | WARNING | `Failed to clear retained LWT for {esp_id_str}: {error}` | esp_id, error | Angemessen |
| `heartbeat_handler.py:287` | WARNING | `Failed to log heartbeat history for {esp_id_str}: {error}` | esp_id, error | Angemessen |
| `heartbeat_handler.py:299` | DEBUG | `Heartbeat processed{source_indicator}: esp_id={esp_id_str}, uptime=...s, heap_free=...B` | source, esp_id, uptime, heap | Gut — kein INFO-Flooding |
| `heartbeat_handler.py:349` | WARNING | `Failed to broadcast ESP health via WebSocket: {e}` | exception | Angemessen |
| `heartbeat_handler.py:373` | ERROR | `Error handling heartbeat: {e}` (exc_info=True) | exception + stack | Gut — catch-all |

### 3.4 Zone-Mismatch-Erkennung — Kritischer Bereich fuer Flooding

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:714` | INFO | `Zone mismatch for %s tolerated (reconnect state push pending)` | device_id | Gut — kein Flooding |
| `heartbeat_handler.py:725` | INFO | `Zone mismatch for %s tolerated (pending assignment to %s)` | device_id, pending_target | Gut |
| `heartbeat_handler.py:733` | WARNING | `ZONE_MISMATCH [{device_id}]: ESP reports zone_id='...' but DB has zone_id=None. ESP may have stale zone from NVS. Consider re-sending zone removal.` | device_id, esp_zone | **LOG-FLOODING-RISIKO** — kein eigener Cooldown |
| `heartbeat_handler.py:747` | WARNING | `ZONE_MISMATCH [{device_id}]: ESP lost zone config ({mismatch_reason}). DB has zone_id='...'. Auto-reassigning zone.` | device_id, reason, db_zone | **LOG-FLOODING-RISIKO** — liegt VOR Cooldown-Pruefung |
| `heartbeat_handler.py:765` | DEBUG | `Zone resync for {device_id} skipped (cooldown: {N}s remaining)` | device_id, remaining_s | Gut — MQTT wird gebremst, aber WARNING davor schon ausgegeben |
| `heartbeat_handler.py:792` | INFO | `Auto-reassigning zone '{db_zone_id}' to ESP {device_id} (zone lost after reboot). Topic: {topic}` | db_zone, device_id, topic | Gut — zeigt zone_id des Pushes |
| `heartbeat_handler.py:810` | DEBUG | `Updated Mock-ESP runtime zone for {device_id}` | device_id | Angemessen |
| `heartbeat_handler.py:816` | ERROR | `Failed to resend zone assignment to {device_id}: {error}` (exc_info=True) | device_id, error | Gut |
| `heartbeat_handler.py:823` | WARNING | `ZONE_MISMATCH [{device_id}]: ESP reports zone_id='...' but DB has zone_id='...'. Zone assignment may be inconsistent.` | device_id, esp_zone, db_zone | **LOG-FLOODING-RISIKO** |

### 3.5 GPIO-Status-Validierung

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:862` | DEBUG | `GPIO status validated and updated for {device_id}: {N} reserved pins` | device_id, count | Angemessen |
| `heartbeat_handler.py:867` | WARNING | `GPIO status validation failed for {device_id}, skipping GPIO metadata update` | device_id | Angemessen |
| `heartbeat_handler.py:877` | ERROR | `Failed to update ESP metadata for {device_id}: {e}` (exc_info=True) | device_id, error | Gut |
| `heartbeat_handler.py:887` | ERROR | `Unexpected error updating ESP metadata for {device_id}: {e}` (exc_info=True) | device_id, error | Gut |
| `heartbeat_handler.py:1080` | WARNING | `GPIO status item {idx} validation failed for {device_id}: {e}` | idx, device_id, error | Angemessen |
| `heartbeat_handler.py:1095` | WARNING | `GPIO count mismatch for {device_id}: reported={N}, validated={N}, bus_gpios={N}` | alle Counts | Gut |
| `heartbeat_handler.py:1101` | DEBUG | `GPIO count minor mismatch for {device_id}: reported={N}, validated={N}, bus_gpios={N}` | alle Counts | Angemessen |
| `heartbeat_handler.py:1111` | ERROR | `Failed to import GPIO schemas for {device_id}: {e}...` | device_id, error | Gut |
| `heartbeat_handler.py:1119` | ERROR | `Unexpected error validating GPIO status for {device_id}: {e}` (exc_info=True) | device_id, error | Gut |

### 3.6 Health-Metrics-Logging

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:1144` | WARNING | `Low memory on {esp_id}: heap_free={free_heap} bytes` | esp_id, bytes | Gut |
| `heartbeat_handler.py:1148` | WARNING | `Weak WiFi signal on {esp_id}: rssi={wifi_rssi} dBm` | esp_id, rssi | Gut |
| `heartbeat_handler.py:1152` | WARNING | `Device {esp_id} reported {error_count} error(s)` | esp_id, count | Gut |
| `heartbeat_handler.py:1154` | DEBUG | `Health metrics for {esp_id}: uptime=...s, free_heap=...B, rssi=...dBm, sensors=..., actuators=..., errors=...` | alle Metriken | Sehr gut — vollstaendig |

### 3.7 Heartbeat-ACK (fire-and-forget, QoS 0)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:1205` | DEBUG | `Heartbeat ACK sent to {esp_id}: status={status}` | esp_id, status | Angemessen — zu frequent fuer INFO |
| `heartbeat_handler.py:1208` | WARNING | `Failed to send heartbeat ACK to {esp_id}` | esp_id | Angemessen |
| `heartbeat_handler.py:1214` | WARNING | `Error sending heartbeat ACK to {esp_id}: {e}` | esp_id, error | Angemessen |

### 3.8 Config-Mismatch-Detection und Auto-Push — Kernbereich

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:1254` | INFO | `Config mismatch detected for {device_id}: ESP reports sensors={N}/actuators={N}, DB has sensors={N}/actuators={N}. Triggering auto config push.` | device_id, alle 4 Counts | Gut — zeigt exakt WARUM (Counts) |
| `heartbeat_handler.py:1268` | WARNING | `Failed to check pending config for {device_id}: {e}` | device_id, error | Angemessen |
| `heartbeat_handler.py:1291` | INFO | `Auto config push successful for {device_id}: {N} sensors, {N} actuators` | device_id, counts | Gut — Summary-Level |
| `heartbeat_handler.py:1297` | WARNING | `Auto config push failed for {device_id}: {message}` | device_id, message | Angemessen |
| `heartbeat_handler.py:1303` | ERROR | `Auto config push error for {device_id}: {e}` (exc_info=True) | device_id, error | Gut |

### 3.9 Full-State-Push (Reconnect-Pfad via MQTTCommandBridge)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:1318` | WARNING | `No command_bridge for state push to %s` | device_id | Angemessen |
| `heartbeat_handler.py:1333` | DEBUG | `Skipping state push for mock ESP %s` | device_id | Angemessen |
| `heartbeat_handler.py:1341` | DEBUG | `State push cooldown for %s (%ds remaining)` | device_id, seconds | Gut |
| `heartbeat_handler.py:1371` | WARNING | `Zone ACK timeout during state push for %s: %s` | device_id, exception | Angemessen |
| `heartbeat_handler.py:1406` | WARNING | `Subzone ACK timeout for %s/%s: %s` | device_id, subzone_id, exception | Angemessen |
| `heartbeat_handler.py:1413` | INFO | `Full-State-Push completed for %s: zone=%s, subzones=%d/%d` | device_id, zone, sent/total | Gut — Ergebnis klar |
| `heartbeat_handler.py:1422` | ERROR | `Full-State-Push failed for %s: %s` (exc_info=True) | device_id, error | Gut |

### 3.10 Device-Source-Detection (Debug-Diagnostics, 6 Stellen)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:999,1009,1018,1027,1034,1041,1049` | DEBUG | `DeviceSource detection [{esp_id}]: {result} (reason: {reason})` | esp_id, result, reason | Gut — nur DEBUG |

### 3.11 Discovery/Rediscovery

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:448` | INFO | `New ESP discovered: {esp_id} (hardware_type={type}, status={status}) (Zone: {zone}, Sensors: {N}, Actuators: {N})` | alle relevanten Felder | Sehr gut |
| `heartbeat_handler.py:459` | ERROR | `Error auto-registering ESP {esp_id}: {e}` (exc_info=True) | esp_id, error | Gut |
| `heartbeat_handler.py:511` | WARNING | `Failed to audit log device_discovered: {audit_error}` | audit_error | Angemessen |
| `heartbeat_handler.py:562` | INFO | `Device rediscovered: {device_id} (pending_approval again)` | device_id | Gut |
| `heartbeat_handler.py:581` | WARNING | `Failed to audit log device_rediscovered: {audit_error}` | audit_error | Angemessen |
| `heartbeat_handler.py:639` | INFO | `Broadcast device_discovered for {esp_id}` | esp_id | Angemessen |
| `heartbeat_handler.py:641` | WARNING | `Failed to broadcast device_discovered: {e}` | exception | Angemessen |
| `heartbeat_handler.py:665` | INFO | `Broadcast device_rediscovered for {esp_id}` | esp_id | Angemessen |
| `heartbeat_handler.py:667` | WARNING | `Failed to broadcast device_rediscovered: {e}` | exception | Angemessen |

### 3.12 Device-Timeout-Check (Scheduler-Kontext)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `heartbeat_handler.py:1460` | WARNING | `Device {device_id} timed out. Last seen: {device.last_seen}` | device_id, timestamp | Gut |
| `heartbeat_handler.py:1485` | WARNING | `Failed to audit log device_offline: {audit_error}` | audit_error | Angemessen |
| `heartbeat_handler.py:1507` | INFO | `Broadcast esp_health offline event for {device_id}` | device_id | Angemessen |
| `heartbeat_handler.py:1509` | WARNING | `Failed to broadcast ESP offline events: {e}` | exception | Angemessen |
| `heartbeat_handler.py:1518` | ERROR | `Error checking device timeouts: {e}` (exc_info=True) | error | Gut |

---

## 4. C3-02: MQTTCommandBridge Logging

**Logger-Name:** `god_kaiser.mqtt_command_bridge` (via `logging.getLogger(...)`, Zeile 21)

| Datei:Zeile | Level | Message-Template | Geloggte Variablen | Bewertung |
|-------------|-------|------------------|--------------------|-----------|
| `mqtt_command_bridge.py:52` | INFO | `MQTTCommandBridge initialized (client_connected=%s, broker=%s:%s)` | connected, host, port | Gut — Startup-Diagnose |
| `mqtt_command_bridge.py:90` | DEBUG | `Sending %s command to %s (correlation_id=%s, topic=%s)` | command_type, esp_id, corr_id, topic | Gut — vor Publish |
| `mqtt_command_bridge.py:100` | INFO | `%s command SENT to %s (topic=%s, correlation_id=%s, client_connected=%s)` | command_type, esp_id, topic, corr_id, connected | Gut — nach Publish |
| `mqtt_command_bridge.py:107` | WARNING | `MQTT publish failed for %s — %s` | topic, client_state | Gut — mit Diagnose-State |
| `mqtt_command_bridge.py:118` | INFO | `ACK received for %s %s (correlation_id=%s, status=%s)` | esp_id, command_type, corr_id, ack_status | Gut — Duration fehlt |
| `mqtt_command_bridge.py:124` | WARNING | `ACK timeout for %s %s (correlation_id=%s, timeout=%ss)` | esp_id, command_type, corr_id, timeout_val | Gut |
| `mqtt_command_bridge.py:161` | DEBUG | `ACK resolved via correlation_id=%s` | corr_id | Angemessen |
| `mqtt_command_bridge.py:174` | DEBUG | `ACK resolved via fallback for %s/%s (correlation_id=%s)` | esp_id, command_type, corr_id | Gut — Fallback sichtbar |
| `mqtt_command_bridge.py:181` | DEBUG | `No pending Future for ACK from %s/%s` | esp_id, command_type | Angemessen |
| `mqtt_command_bridge.py:208` | INFO | `MQTTCommandBridge shutdown complete (%d pending cancelled)` | count | Gut |

**Bewertung C3-02:**
- Topic und Correlation-ID geloggt: **Ja** (Zeile 90, 100)
- ACK-Empfang geloggt: **Ja** (Zeile 118) — ohne Roundtrip-Duration
- Timeout-Fall: **Ja, WARNING** (Zeile 124) — ausreichend
- Fallback-FIFO-Matching: **Ja, DEBUG** (Zeile 174) — sichtbar
- `_is_connected()` / `_get_client_state()`: **Nur bei Fehlerfall** (Zeile 100, 107) — kein periodisches Polling, korrekt

---

## 5. C3-03: Config-Push-Content Logging

### 5.1 Was wird vor und nach dem Push geloggt?

**Mismatch-Detection (`heartbeat_handler.py:1254`):**
```
INFO: "Config mismatch detected for ESP_XY:
      ESP reports sensors=0/actuators=0,
      DB has sensors=2/actuators=1.
      Triggering auto config push."
```
Nur Counts — kein Sensor-Name, kein GPIO, kein Typ.

**Config-Build (`config_builder.py:248`):**
```
INFO: "Built config payload for ESP_XY: 2 sensors, 1 actuators, zone=zone_a (Hauptzone)"
```
Counts + Zone-Info. Kein Sensor-Inhalt.

**GPIO-Validation-Pass (`config_builder.py:230`):**
```
DEBUG: "Config GPIO validation passed: 3 unique GPIOs"
```
Nur Anzahl eindeutiger GPIOs.

**MQTT-Publish-Erfolg (`esp_service.py:462`):**
```
INFO: "Config sent to ESP_XY: ['sensors', 'actuators']"
```
Nur Dict-Keys per `list(config.keys())` — kein Payload-Inhalt.

**Auto-Push-Ergebnis (`heartbeat_handler.py:1291`):**
```
INFO: "Auto config push successful for ESP_XY: 2 sensors, 1 actuators"
```
Wieder nur Counts.

### 5.2 Gibt es DEBUG-Logs mit vollem Payload?

**Nein.** Kein einziger Log-Aufruf serialisiert den vollstaendigen JSON-Payload. Sensor-Namen, GPIOs, Typen, Subzone-IDs, sample_interval_ms erscheinen in keinem Log auf keinem Level.

### 5.3 Was kann man aus Server-Logs allein diagnostizieren?

**Diagnosierbar (INFO-Level):**
- DASS ein Config-Mismatch erkannt wurde
- WARUM (ESP meldet 0 Sensoren, DB hat N)
- WANN der Push ausgeloest wurde
- WIE VIELE Sensoren/Aktoren (Counts)
- IN WELCHE ZONE das ESP gehoert
- OB der Push erfolgreich war

**Nicht diagnosierbar:**
- Welche spezifischen Sensoren (Name, Typ, GPIO) gepusht wurden
- Welche Subzone-IDs enthalten waren
- Welche sample_interval_ms-Werte
- Ob Payload sich gegenueber vorherigem Push geaendert hat
- Ob der ESP den Push empfangen hat (kein PUBACK-Logging)
- Wie lange der Mismatch-Loop insgesamt aktiv war

---

## 6. Vollstaendige Log-Sequenz: Config Mismatch Loop

```
[Heartbeat empfangen]
  DEBUG  heartbeat_handler:113  "Processing heartbeat: esp_id=ESP_XY"
  DEBUG  heartbeat_handler:299  "Heartbeat processed: esp_id=ESP_XY, uptime=...s, heap_free=...B"

[Mismatch-Check (_has_pending_config)]
  INFO   heartbeat_handler:1254 "Config mismatch detected for ESP_XY:
                                  ESP reports sensors=0/actuators=0,
                                  DB has sensors=2/actuators=1.
                                  Triggering auto config push."

[Config-Build (async task _auto_push_config)]
  DEBUG  config_builder:230     "Config GPIO validation passed: 3 unique GPIOs"
  INFO   config_builder:248     "Built config payload for ESP_XY:
                                  2 sensors, 1 actuators, zone=zone_a (Hauptzone)"

[MQTT-Publish (esp_service.send_config)]
  INFO   esp_service:462        "Config sent to ESP_XY: ['sensors', 'actuators']"

[Ergebnis]
  INFO   heartbeat_handler:1291 "Auto config push successful for ESP_XY: 2 sensors, 1 actuators"

[Heartbeat-ACK an ESP (fire-and-forget, QoS 0)]
  DEBUG  heartbeat_handler:1205 "Heartbeat ACK sent to ESP_XY: status=online"

--- LOOP: naechster Heartbeat 30s spaeter (wenn ESP weiterhin 0 meldet) ---
  DEBUG  heartbeat_handler:113  "Processing heartbeat: esp_id=ESP_XY"
  INFO   heartbeat_handler:1254 "Config mismatch detected ..."   [wiederholt sich]
  INFO   config_builder:248     "Built config payload ..."
  INFO   esp_service:462        "Config sent to ..."
  INFO   heartbeat_handler:1291 "Auto config push successful ..."
```

**Wichtig:** Der `_auto_push_config`-Pfad verwendet `esp_service.send_config()` (Fire-and-Forget via Publisher). Die `MQTTCommandBridge` mit ACK-Waiting wird hier NICHT eingesetzt — das ist nur der `_handle_reconnect_state_push`-Pfad fuer Zone/Subzone.

---

## 7. Vollstaendige Log-Sequenz: Zone-Mismatch-Loop

```
[Heartbeat ESP_XY mit zone_assigned=false, DB hat zone_id='zone_a']
  WARNING heartbeat_handler:747 "ZONE_MISMATCH [ESP_XY]:
                                  ESP lost zone config (zone_assigned=false).
                                  DB has zone_id='zone_a'. Auto-reassigning zone."

[Cooldown-Pruefung — NACH dem WARNING]
  [cooldown abgelaufen → MQTT-Push]
  INFO    heartbeat_handler:792 "Auto-reassigning zone 'zone_a' to ESP ESP_XY
                                  (zone lost after reboot). Topic: kaiser/god/esp/ESP_XY/zone/assign"

--- 30s spaeter (ESP kein NVS, noch zone_assigned=false) ---
  WARNING heartbeat_handler:747 "ZONE_MISMATCH [ESP_XY]: ..."   [wiederholt!]

[Cooldown noch aktiv (< 60s)]
  DEBUG   heartbeat_handler:765 "Zone resync for ESP_XY skipped (cooldown: 30s remaining)"
  [MQTT-Push wird gebremst, aber WARNING auf Zeile 747 wurde schon geloggt!]

--- nach 60s gesamt (Cooldown abgelaufen) ---
  WARNING heartbeat_handler:747 "ZONE_MISMATCH [ESP_XY]: ..."
  INFO    heartbeat_handler:792 "Auto-reassigning zone ..."
  [Loop beginnt neu]
```

---

## 8. Log-Flooding-Bewertung (30s-Heartbeat-Frequenz)

### Szenario A: Config-Mismatch-Loop (ESP meldet sensor_count=0, DB hat Sensoren)

| Log-Zeile | Level | Frequenz/Stunde |
|-----------|-------|-----------------|
| `heartbeat_handler:1254` — "Config mismatch detected" | INFO | 120x |
| `config_builder:248` — "Built config payload" | INFO | 120x |
| `esp_service:462` — "Config sent to" | INFO | 120x |
| `heartbeat_handler:1291` — "Auto config push successful" | INFO | 120x |
| **Gesamt** | INFO | **480x/Stunde pro ESP** |

**Bewertung:** Kritisches Flooding. Kein Cooldown im Logging-Pfad selbst. Der `_has_pending_config` prueft nur ob ESP weiterhin 0 meldet, drosselt aber die Log-Ausgabe nicht.

### Szenario B: Zone-Mismatch-Loop (ESP zone_assigned=false, DB hat Zone)

| Log-Zeile | Level | Frequenz/Stunde |
|-----------|-------|-----------------|
| `heartbeat_handler:747` — "ZONE_MISMATCH ESP lost zone config" | WARNING | 120x (jeder Heartbeat) |
| `heartbeat_handler:792` — "Auto-reassigning zone" | INFO | ca. 60x (MQTT-Cooldown 60s) |
| **WARNINGs gesamt** | WARNING | **120x/Stunde pro ESP** |

**Bewertung:** Aggressives Flooding. Der MQTT-Cooldown (Zeile 761-768) bremst nur den MQTT-Push auf 60x/h. Das WARNING auf Zeile 747 liegt VOR der Cooldown-Pruefung und erscheint bei jedem Heartbeat.

### Szenario C: Normaler Betrieb (kein Mismatch, kein Mismatch)

| Log-Zeile | Level | Frequenz/Stunde |
|-----------|-------|-----------------|
| `heartbeat_handler:113` — "Processing heartbeat" | DEBUG | 120x (nur bei DEBUG aktiv) |
| `heartbeat_handler:299` — "Heartbeat processed" | DEBUG | 120x (nur bei DEBUG aktiv) |
| `heartbeat_handler:1205` — "Heartbeat ACK sent" | DEBUG | 120x (nur bei DEBUG aktiv) |

**Bewertung:** Im normalen INFO-Level kein Flooding.

---

## 9. Befunde

### Befund 1: Log-Flooding Zone-Mismatch (HOCH)
- **Schwere:** Hoch
- **Detail:** `heartbeat_handler.py:747` (WARNING "ZONE_MISMATCH ESP lost zone config") wird bei JEDEM Heartbeat ausgegeben, auch wenn der MQTT-Cooldown (60s) aktiv ist. Die `should_resync = False`-Gate auf Zeile 763 verhindert den MQTT-Push, aber das WARNING auf Zeile 747 liegt VOR dieser Pruefung.
- **Evidenz:** heartbeat_handler.py:747 vs. 761-768 — Zeile 747 hat keinen eigenen Cooldown-Check.
- **Rate:** 120 WARNINGs/Stunde pro betroffenem ESP bei 30s-Heartbeat.

### Befund 2: Log-Flooding Config-Mismatch-Loop (MITTEL-HOCH)
- **Schwere:** Mittel-Hoch
- **Detail:** `_has_pending_config` triggert bei JEDEM Heartbeat vier INFO-Logs wenn ESP sensor_count=0 meldet. Kein internes Cooldown-Logging. 480 INFOs/Stunde.
- **Evidenz:** heartbeat_handler.py:1253-1262 — kein Cooldown-Guard.

### Befund 3: Kein Payload-Logging fuer Config-Push-Inhalt (MITTEL, Diagnosability)
- **Schwere:** Mittel
- **Detail:** Kein einziger Log-Aufruf serialisiert den vollstaendigen Sensor/Aktor-Payload (weder DEBUG noch INFO). Man kann aus Logs nicht erkennen welche Sensoren (Name, GPIO, Typ, Subzone-ID) gepusht wurden.
- **Empfehlung:** `logger.debug(f"Config payload detail: {json.dumps(config, default=str)}")` vor dem MQTT-Publish in `esp_service.send_config()` wuerde Diagnosierbarkeit massiv verbessern.

### Befund 4: Duration fehlt im ACK-Logging (NIEDRIG)
- **Schwere:** Niedrig
- **Detail:** `mqtt_command_bridge.py:118` ("ACK received") loggt correlation_id und status, aber nicht die Roundtrip-Dauer. Fuer Latenz-Diagnose waere `duration_ms` hilfreich.
- **Evidenz:** mqtt_command_bridge.py:118 — kein `time.time()` Delta vorhanden.

### Befund 5: Config-Push-Pfad ohne MQTTCommandBridge (NIEDRIG, Design)
- **Schwere:** Niedrig (Design-Anmerkung)
- **Detail:** `_auto_push_config` (Sensor/Aktor-Config) nutzt Fire-and-Forget via `Publisher.publish_config()`. `_handle_reconnect_state_push` (Zone/Subzone) nutzt MQTTCommandBridge mit ACK-Waiting. Dadurch gibt es fuer den Sensor-Config-Push keinen Timeout-Log — nur "push successful" oder allgemeinen Exception-Log.
- **Evidenz:** heartbeat_handler.py:1288 (send_config) vs. 1363 (send_and_wait_ack).

---

## 10. Empfehlungen

| Prioritaet | Empfehlung | Betroffene Stelle |
|------------|------------|-------------------|
| Hoch | Cooldown-Check VOR das Zone-Mismatch-WARNING verschieben: `should_resync`-Guard vor Zeile 747 setzen, so dass WARNING nur geloggt wird wenn `should_resync=True` | `heartbeat_handler.py:747` |
| Hoch | Cooldown fuer Config-Mismatch-Logging: Metadatum `config_push_sent_at` pruefen analog zu `zone_resync_sent_at`, bevor INFO auf Zeile 1254 ausgegeben wird | `heartbeat_handler.py:1253` |
| Mittel | DEBUG-Logging fuer vollstaendigen Config-Payload in `esp_service.send_config()` vor dem Publish hinzufuegen | `esp_service.py` nach Zeile 450 |
| Niedrig | Duration-Logging in `mqtt_command_bridge.send_and_wait_ack()`: Startzeit vor `asyncio.wait_for` setzen, Duration beim ACK-Empfang loggen | `mqtt_command_bridge.py:118` |
