# Safety bei Netzwerkverlust — Vollanalyse AutomationOne
**Datum:** 2026-03-30
**Typ:** Tiefenanalyse (read-only, kein Code geändert)
**Scope:** El Trabajante (ESP32 Firmware) + El Servador (FastAPI Backend) + MQTT
**Basis:** L0 Deep Dive (Logic Engine Architektur bekannt)

---

## Executive Summary

AutomationOne hat ein strukturelles Sicherheitsproblem: Die gesamte Automatisierungslogik (Logic Engine) läuft auf dem Server. Der ESP32 ist reiner Executor. Bei Netzwerkverlust verliert der ESP jede Steuerungsmöglichkeit — laufende Aktoren bleiben im letzten Zustand, oft AN, für bis zu **1 Stunde** (Runtime Protection Timeout).

**Der einzige lokale Schutzmechanismus auf dem ESP ist ein 1-Stunden-Timer. Das ist für Pumpen und Heizungen inakzeptabel.**

Fünf spezifische Lücken wurden gefunden:
1. Kein MQTT-Disconnect → Aktoren-Stop auf ESP-Seite
2. Kein konfigurierbarer `on_disconnect_action` pro Aktor-Typ
3. MQTT-Subscriptions nach Reconnect nicht wiederhergestellt (kritischer Bug)
4. `default_state` im Struct vorhanden aber bei Disconnect nicht angewendet
5. Kein Background-Task für Heartbeat-Timeout-Überwachung auf Server-Seite

---

## Block 1: Firmware — Safety Mechanisms Inventory

### 1.1 SafetyController

**Dateien:** `src/services/actuator/safety_controller.h` / `.cpp`

**`EmergencyState` Enum** (safety_controller.h):
```
NORMAL / ACTIVE / CLEARING / RESUMING
```

**Recovery-Konfiguration** (`RecoveryConfig`):
- `inter_actuator_delay_ms = 2000`
- `verification_timeout_ms = 5000`
- `max_retry_attempts = 3`

**Emergency-Stop Flag-Hierarchie:**
- Global: `SafetyController::emergency_state_` (enum)
- Pro Aktor: `RegisteredActuator::emergency_stopped` (bool) — `actuator_manager.h:67`

**5 Emergency-Stop Auslösepfade:**

| Pfad | Auslöser | Datei:Zeile | Aktion |
|------|----------|-------------|--------|
| 1 | MQTT-Command `emergency_stop` | `main.cpp:910` | Global Stop |
| 2 | Broadcast-Emergency MQTT `kaiser/broadcast/emergency` | `main.cpp:936` | Global Stop |
| 3 | Runtime-Timeout (`max_runtime_ms`) abgelaufen | `actuator_manager.cpp:565` | Emergency-Stop (nicht clean OFF) |
| 4 | Command-Duration (`duration` im Payload) abgelaufen | `actuator_manager.cpp:542` | Clean OFF |
| 5 | Subzone-Isolation | `safety_controller.cpp:69` | Subzone Stop |

**Fehlt vollständig:** Pfad 6 — "MQTT-Disconnect → Aktoren stoppen" existiert nicht.

**`clearEmergencyStop()`:** Nur via MQTT-Command (`main.cpp:915`). Nach Clear: Aktoren bleiben OFF, Server muss neue ON-Commands senden.

---

### 1.2 Runtime Protection

**`max_runtime_ms`:**
- Default: `3600000UL` ms = **1 Stunde** — `actuator_types.h:33`
- Nicht via Server-Config konfigurierbar (Compile-Time-Konstante)
- Bei Ablauf: **Emergency-Stop** (nicht clean OFF → Aktor bleibt blockiert bis `clear_emergency` kommt)

**`command_duration_end_ms`:**
- Aus MQTT-Payload `"duration"` (optional)
- Bei Ablauf: **Clean OFF** (kein Emergency, Aktor sofort wieder steuerbar)
- Greift nur wenn `duration` im Command gesetzt war — bei Logic-Engine-Befehlen nicht immer der Fall

**Fazit:** Die einzige lokale Timeout-Protection ist 1 Stunde. Zu lang für Pumpen/Heizungen.

---

### 1.3 MQTT-Disconnect-Verhalten

**Disconnect-Erkennung:** Passiv via `loop()`. PubSubClient hat keinen `onDisconnect`-Callback.

**`handleDisconnection()` — `mqtt_client.cpp:813`:**
- Setzt Registration-Gate zurück
- Loggt einmal
- Ruft `reconnect()` auf
- **Kein Aktor-Aufruf, keine Sicherheitsaktion**

**Kritische Konfigurationswerte:**

| Parameter | Wert | Quelle |
|-----------|------|--------|
| KeepAlive | **60s** | `main.cpp:725` |
| Broker-Timeout | **90s** (KeepAlive × 1.5) | MQTT-Standard |
| clean_session | **true** (Default) | PubSubClient-Default |
| LWT Topic | `kaiser/{k}/esp/{e}/system/will` | `mqtt_client.cpp:196` |
| LWT Payload | `{"status":"offline"}` | `mqtt_client.cpp:199` |
| LWT QoS | **1** | `mqtt_client.cpp:201` |
| LWT Retain | **true** | `mqtt_client.cpp:203` |

**Reconnect-Strategie:**
- Exponential Backoff: 1s → 60s
- Circuit Breaker: 5 Failures → 30s OPEN-Phase

**KRITISCHER BUG — clean_session + Subscriptions:**
- `clean_session = true` → alle Subscriptions gehen bei Disconnect verloren
- `subscribe()` wird nur in `setup()` aufgerufen (`main.cpp:823-846`)
- `reconnect()` ruft **kein erneutes Subscribe** auf
- **Folge:** Nach MQTT-Reconnect empfängt ESP keine Aktor-Commands mehr!

---

### 1.4 WiFi-Disconnect-Verhalten

**`WiFi.setAutoReconnect(false)`** — manuell gesteuert.

**Kein WiFi-Disconnect-Event-Handler.** Polling via `wifiManager.loop()`.

**`handleDisconnection()` — `wifi_manager.cpp:256`:**
- Log + Reconnect-Versuch
- **Keine Aktor-Benachrichtigung**
- Kein AP-Mode-Fallback im laufenden Betrieb

**WiFiManager → MQTTClient Kommunikation:** Keine direkte Verbindung. MQTT erkennt WiFi-Verlust erst beim nächsten `mqtt_.loop()`.

**Zeitverlauf bei WiFi-Verlust:**
1. `t=0`: WiFi bricht ab
2. `t≈0`: `mqtt_.loop()` returned false → `handleDisconnection()` → reconnect()
3. `t=0..90s`: MQTT Reconnect-Versuche schlagen fehl (kein WiFi)
4. `t=0..3600s`: Aktoren laufen weiter (kein Eingriff)
5. `t=3600s`: Runtime Protection → Emergency-Stop

---

### 1.5 Watchdog

- **Timeout: 60s, panic=true** → Auto-Reboot (`main.cpp:429`)
- Feed-Intervall: 10s in `loop()` (`main.cpp:2357`)
- WiFi-Connect-Loop: speist Watchdog intern (`esp_task_wdt_reset()`, `wifi_manager.cpp:146`)
- **3× Watchdog in 24h → SafeMode:** Code vorhanden aber **auskommentiert** (`main.cpp:461-467`)
- Überwacht nur Loop-Hänger, keine Aktor-Anomalien

---

### 1.6 main_loop() — Sicherheits-Checks im Hauptzyklus

**`processActuatorLoops()` wird in jedem loop()-Zyklus aufgerufen** (`main.cpp:2547`). ✓

**30s WiFi-Disconnect-Debounce:** Öffnet Provisioning-Portal. **Kein Aktor-Eingriff.** (`main.cpp:2484`)

**`heartbeat_ack`-Timeout:** Existiert nicht. ESP sendet Heartbeats, prüft aber nicht ob Server antwortet.

**Kein "connection_lost_since" Timestamp** auf Aktor-Ebene.

---

## Block 2: Aktor-Zustandsmanagement bei Verbindungsverlust

### 2.1 RegisteredActuator Struct

**Felder** (aus `actuator_types.h` und `actuator_manager.h`):

| Feld | Typ | Safety-Relevanz |
|------|-----|-----------------|
| `gpio` | uint8_t | Identifikation |
| `config` | ActuatorConfig | Konfiguration inkl. `max_runtime_ms` |
| `current_state` | bool | Letzter bekannter Zustand |
| `emergency_stopped` | bool | Pro-Aktor Emergency-Flag |
| `command_duration_end_ms` | uint32_t | Duration-Timer |
| `runtime_start_ms` | uint32_t | Runtime-Timer-Start |
| `default_state` | bool | **Kommentiert: "Failsafe state if config lost"** |

**`default_state = false`** — in `actuator_types.h:51` dokumentiert als Failsafe-State, aber wird bei Disconnect **nicht angewendet**. Nur bei `begin()` als initialer GPIO-Zustand verwendet (`pump_actuator.cpp:62`).

**Fehlt:** `last_server_contact`, `last_command_timestamp`, `safe_state_on_disconnect`.

### 2.2 Aktor-Verhalten nach MQTT-Reconnect

Nach erfolgreicher MQTT-Reconnection:
- Aktoren behalten Zustand aus RAM (kein Reset)
- **Keine Config-Anfrage an Server** → Server weiß nicht was am GPIO passiert ist
- **Keine Status-Meldung an Server** → Server-DB und physischer Zustand divergieren
- **Subscriptions fehlen** (clean_session Bug → `actuator/{gpio}/command` nicht abonniert)

### 2.3 LWT-Konfiguration (vollständig)

```
Topic:   kaiser/{kaiser_id}/esp/{esp_id}/system/will
Payload: {"status":"offline","esp_id":"...","timestamp":"..."}
QoS:     1
Retain:  true
```

LWT wird vom Broker gesendet wenn:
- KeepAlive-Timeout überschritten (90s nach letztem Paket)
- TCP-Verbindung unerwartet getrennt

LWT wird **nicht** gesendet wenn:
- Der Broker selbst crasht/neustartet
- Der Pi-Strom ausfällt (Broker und Client fallen gleichzeitig weg)

---

## Block 3: Backend — Server-seitige Erkennung und Reaktion

### 3.1 Heartbeat-System

**Drei Timeout-Definitionen (Inkonsistenz!):**

| Konstante | Wert | Datei:Zeile | Genutzt? |
|-----------|------|-------------|----------|
| `HEARTBEAT_TIMEOUT_SECONDS` | **300s (5 min)** | `heartbeat_handler.py:46` | Deklariert, aber **toter Code** |
| `TIMEOUT_ESP_HEARTBEAT` | **120000ms (2 min)** | `constants.py:192` | Deklariert, aber **nicht aktiv genutzt** |
| `RECONNECT_THRESHOLD_SECONDS` | **60s (1 min)** | `heartbeat_handler.py:49` | Genutzt für Full-State-Push-Trigger |

**Was bei Heartbeat-Empfang passiert:**
- `esp_devices.last_seen` aktualisiert
- Wenn `offline_seconds > 60`: Full-State-Push an ESP (Konfiguration senden)
- WebSocket-Event an Frontend

**Was NICHT passiert:**
- Kein Background-Task der prüft ob Heartbeats ausbleiben
- Die Konstante `HEARTBEAT_TIMEOUT_SECONDS = 300` wird nirgends abgefragt
- **Bei ausbleibendem Heartbeat passiert auf Server-Seite NICHTS**, bis eine LWT eingeht

### 3.2 LWT-Handler Vollanalyse

**`mqtt/handlers/lwt_handler.py` — vollständiger Flow:**

1. Topic-Parsing: `system/will` erkannt
2. JSON-Payload validiert
3. `esp_devices.status = "offline"` gesetzt (`lwt_handler.py:111`)
4. `actuator_states.state = "off"` für **alle** Aktoren des ESPs (`lwt_handler.py:117-121`)
5. `device_metadata.last_disconnect` aktualisiert (`lwt_handler.py:133-141`)
6. Audit-Log `LWT_RECEIVED` / WARNING-Level (`lwt_handler.py:144-163`)
7. WebSocket-Event `"esp_health"` mit `source: "lwt"` (`lwt_handler.py:174-188`)

**KRITISCHER PHYSISCHER GAP:**

> Die `actuator_states.state = "off"`-Setzung ist eine reine Datenbankoperation.
> Der physische GPIO am ESP32 ändert sich dadurch NICHT.
> **Eine laufende Pumpe läuft weiter. Ein offenes Ventil bleibt offen.**
> Das Frontend zeigt "off" — die Physik zeigt "on".
> Der Server kann keinen OFF-Befehl senden, weil der ESP offline ist.

### 3.3 SafetyService — 7 Checks

**`services/safety_service.py` — `validate_actuator_command()`:**

| Check | Typ | Safety-Relevanz |
|-------|-----|-----------------|
| ESP-spezifischer Emergency-Stop | Block | ✓ |
| Globaler Emergency-Stop | Block | ✓ |
| PWM-Wertebereich 0.0–1.0 | Block | ✓ |
| ESP-Existenz in DB | Block | ✓ |
| **Online-Guard** (`is_online == True`) | Block | ✓ — `safety_service.py:163-168` |
| Aktor `enabled` | Block | ✓ |
| Aktor min/max Wertebereich | Block | ✓ |

**Online-Guard:** Wenn ESP als offline markiert → kein Befehl wird gesendet. Korrekte Implementierung.

**Problem:** Online-Guard greift nur wenn LWT eingetroffen ist. Bei Server-Crash oder langsamer Heartbeat-Erkennung kann der ESP mehrere Minuten als "online" gelten, obwohl keine Verbindung besteht.

**Emergency-Stop ist in-memory:** `_emergency_stop_active: dict[str, bool]` — geht nach Server-Restart verloren.

### 3.4 Server-Restart-Verhalten

**Emergency-Stop-States:** Werden beim Startup auf `"idle"` zurückgesetzt (`main.py:167-182`) — bewusstes Design-Entscheidung.

**Hysterese-State:** Wird aus DB geladen (`main.py:634`) — korrekt persistent. ✓

**Kein initialer Zustandsabgleich mit ESP-Hardware:**
- Server kennt nach Restart nur DB-State
- Tatsächlicher GPIO-Zustand unbekannt
- Full-State-Push nur reaktiv beim nächsten Heartbeat wenn `offline_seconds > 60`

**Folge:** Nach Server-Restart kann der SafetyService einen ESP als "online" mit Aktoren in State "off" (aus DB) betrachten, während der ESP tatsächlich einen Aktor auf "on" hält.

---

## Block 4: MQTT-Konfiguration

### 4.1 QoS-Übersicht

| Richtung | Topic | QoS | Retain | Begründung |
|----------|-------|-----|--------|------------|
| Server→ESP Aktor-Commands | `actuator/{gpio}/command` | **2** | false | Exactly-once Zustellung |
| ESP→Server Sensor-Daten | `sensor/{gpio}/data` | **1** | false | At-least-once |
| ESP→Server Heartbeat | `system/heartbeat` | **0** | false | Fire-and-forget |
| ESP→Server LWT | `system/will` | **1** | true | Retained, mindestens einmal |
| Server→ESP Emergency-Broadcast | `kaiser/broadcast/emergency` | 1 | false | Nicht retained! |

### 4.2 Retain-Analyse

**Kein Retain-Risiko bei Aktor-Commands:** `retain=false` (implizit). Nach ESP-Reconnect kein alter Command.

**LWT retained=true:** Korrekt — neuer Subscriber sieht sofort letzten Status. Problem: Altes `offline`-LWT bleibt bis überschrieben. Bei ESP-Reconnect muss Status aktiv auf `online` gesetzt werden (passiert via Heartbeat-Handler).

**Emergency-Broadcast retained=false:** Korrekt — soll nicht persistiert werden.

### 4.3 KeepAlive-Konfiguration

| Seite | KeepAlive | Broker-Timeout |
|-------|-----------|----------------|
| ESP32 | **60s** (`main.cpp:725`) | 90s |
| Server paho-mqtt | **60s** (`core/config.py:40`) | 90s |

**Fazit:** Server erkennt ESP-Disconnect spätestens nach 90s — sofern der Broker noch läuft.

### 4.4 Clean Session & Persistent Session

| Seite | clean_session | Auswirkung |
|-------|---------------|------------|
| ESP32 | **true** (Default) | Subscriptions nach Reconnect verloren → BUG |
| Server | **true** (`mqtt/client.py:245`) | Kein Offline-Queuing von Commands |

**Kritischer Bug (ESP):** `clean_session=true` + Subscribe nur in `setup()` → nach MQTT-Reconnect empfängt ESP keine Befehle mehr.

**Offline-Buffer (Server):** Bounded FIFO, max. 3 Versuche. Aktiviert bei Circuit Breaker OPEN. Bei `clean_session=true` auf Server-Seite werden gepufferte Commands nach Reconnect gesendet. Risiko: veraltete Commands bei langer Disconnect-Phase.

---

## Block 5: Lücken-Matrix — Alle 6 Ausfallszenarien

### Szenario 1: WiFi-Verlust am ESP32

| | |
|---|---|
| **ESP merkt es** | Sofort beim nächsten `mqtt_.loop()` (TCP-Layer). WiFi-Polling alle ~100ms. |
| **Aktor-Verhalten** | Läuft weiter. Letzter Zustand bleibt. |
| **Server merkt es** | Nach 90s (KeepAlive-Timeout → LWT gesendet vom Broker) |
| **Server-Reaktion** | LWT-Handler: DB auf "offline", actuator_states auf "off" (DB only) |
| **Schutzmechanismus** | Runtime Protection: 1h |
| **Lücke** | Kein WiFi-Disconnect-Callback → Aktoren stoppen |
| **Risiko** | Pumpe läuft 0–3600s unkontrolliert: **CRITICAL** |

**Zeitlinie:**
```
t=0s    WiFi weg. ESP merkt es sofort.
t=0s    MQTT-Reconnect startet (Backoff: 1s, 2s, 4s...)
t=90s   Broker sendet LWT (KeepAlive * 1.5)
t=90s   Server: actuator_states → "off" (DB only)
t=90s   Frontend zeigt "offline"
t=3600s Runtime Protection → Emergency-Stop auf ESP
t=??    WiFi zurück → ESP reconnects, ABER: Subscriptions fehlen!
```

---

### Szenario 2: MQTT-Broker Crash/Neustart

| | |
|---|---|
| **ESP merkt es** | Sofort (TCP-Connection bricht). `handleDisconnection()` aufgerufen. |
| **Aktor-Verhalten** | Läuft weiter. |
| **Server merkt es** | **Nie direkt** (Server ist MQTT-Subscriber, nicht Broker). Server verliert eigene MQTT-Verbindung. |
| **LWT gesendet?** | **NEIN** — Broker ist weg, LWT kann nicht gesendet werden |
| **Server-Reaktion** | Server reconnect zu Broker, aber: kein LWT empfangen → ESP bleibt als "online" in DB |
| **Schutzmechanismus** | Runtime Protection: 1h. Heartbeat-Background-Task: fehlt. |
| **Lücke** | LWT fehlt bei Broker-Crash. Server hält ESP für "online". Online-Guard greift nicht. |
| **Risiko** | Pumpe läuft 0–3600s unkontrolliert: **CRITICAL** |

---

### Szenario 3: Server (FastAPI) Crash/Neustart

| | |
|---|---|
| **ESP merkt es** | **Nie.** Broker läuft. ESP sendet weiter Heartbeats und Sensor-Daten. |
| **Aktor-Verhalten** | Bleibt in letztem Zustand. Keine neuen Commands von Logic Engine. |
| **Logic Engine** | Down. Hysterese-State verloren (aus DB nach Restart wiederhergestellt). |
| **LWT gesendet?** | **NEIN** — ESP ist noch verbunden (Broker läuft) |
| **Schutzmechanismus** | Runtime Protection: 1h. Nach Server-Restart: Full-State-Push reaktiv. |
| **Lücke** | Kein "heartbeat_ack" Check auf ESP → ESP merkt Server-Ausfall nicht. Aktor läuft bis 1h. |
| **Nach Restart** | Server liest Hysterese-State aus DB (korrekt), sendet Full-State-Push beim nächsten Heartbeat. |
| **Risiko** | Aktor läuft bis zu 1h unkontrolliert: **HIGH** (für Pumpen/Heizungen CRITICAL) |

---

### Szenario 4: Kompletter Pi-Ausfall (Strom weg)

| | |
|---|---|
| **ESP merkt es** | Nach 90s (KeepAlive-Timeout). TCP-Verbindung bricht. |
| **Aktor-Verhalten** | Läuft weiter bis Runtime Protection (1h). |
| **LWT gesendet?** | **NEIN** — Broker ist auch weg |
| **Server-Reaktion** | Keine — Server ist down |
| **Schutzmechanismus** | Runtime Protection: 1h. Sonst: nichts. |
| **Lücke** | Kein lokales Failsafe auf ESP. 1h unkontrollierter Betrieb. |
| **Risiko** | Pumpe läuft 0–3600s: **CRITICAL** |

**Zeitlinie:**
```
t=0s    Pi-Strom weg. ESP verliert TCP-Verbindung.
t=0s    MQTT-Reconnect startet. WiFi noch da (Router läuft).
t=0s    Backoff: 1s, 2s, 4s... alle Versuche schlagen fehl (Broker down).
t=3600s Runtime Protection → Emergency-Stop
t=??    Pi kommt zurück. ESP reconnect. Subscriptions fehlen (clean_session Bug).
```

---

### Szenario 5: Netzwerk-Partition (ESP und Pi getrennt)

| | |
|---|---|
| **ESP merkt es** | Nach 90s (KeepAlive-Timeout) |
| **Aktor-Verhalten** | Läuft weiter |
| **Server merkt es** | Nach 90s (LWT wenn Broker erreichbar vom Server). Wenn Broker auf Pi: nichts. |
| **LWT gesendet?** | Ja, wenn Broker erreichbar (Pi noch erreichbar) — Nein, wenn Broker abgeschnitten |
| **Server-Reaktion** | LWT-Handler: DB auf "offline", aber physischer Aktor läuft |
| **Schutzmechanismus** | Runtime Protection: 1h |
| **Heartbeat-Timeout-Detection** | `HEARTBEAT_TIMEOUT_SECONDS = 300` ist toter Code — kein Background-Task |
| **Lücke** | Server kann keine Commands senden (Netzwerk weg). ESP hat kein lokales Failsafe. |
| **Risiko** | Pumpe läuft 0–3600s: **CRITICAL** |

---

### Szenario 6: Intermittierende Verbindung (Flapping)

| | |
|---|---|
| **ESP merkt es** | Sofort bei jedem Disconnect |
| **Reconnect-Overhead** | Exponential Backoff: schnelle Reconnects bei kurzen Ausfällen |
| **Subscriptions** | **KRITISCH:** Werden bei jedem Reconnect verloren (clean_session=true). ESP empfängt nach erstem Reconnect keine Befehle mehr! |
| **Hysterese-State** | Stabil — persistent in DB auf Server-Seite ✓ |
| **QoS-2-Redelivery** | Möglich bei Server-Seite (clean_session=true → kein Replay). Risiko gering. |
| **LWT-Spam** | Jeder Disconnect → LWT. Jeder Reconnect → Heartbeat. Unkritisch. |
| **Aktor-Verhalten** | Nach erstem Reconnect: keine neuen Commands empfangbar (Subscription-Bug) |
| **Risiko** | Nach Reconnect ist ESP "blind" für Server-Commands: **HIGH** |

---

## Block 6: Bestandsaufnahme — Was existiert als Grundlage

### 6.1 Failsafe-Stichwortsuche in Firmware

| Suchbegriff | Ergebnis |
|-------------|----------|
| `failsafe` | Nicht gefunden |
| `fail_safe` | Nicht gefunden |
| `safe_state` | Nicht gefunden |
| `safe_mode` | SafeMode nach 3× Watchdog — auskommentiert (`main.cpp:461`) |
| `connection_lost` | `handleDisconnection()` — kein Aktor-Eingriff |
| `mqtt_disconnected` | Nicht gefunden |
| `offline_mode` | Nicht gefunden |
| `heartbeat_ack` | Nicht gefunden |
| `server_heartbeat` | Nicht gefunden |
| `default_state` | In `RegisteredActuator` als "Failsafe state if config lost" kommentiert, aber nicht bei Disconnect verwendet |

**Fazit:** Kein Failsafe-Konzept für Netzwerkverlust in der aktuellen Firmware. Der Ansatz mit `default_state` existiert konzeptuell im Struct, ist aber nicht implementiert.

### 6.2 Server-Heartbeats Richtung ESP

**Kein Server→ESP-Heartbeat.** Der Server sendet keine regelmäßigen "Ich bin noch da"-Messages. Einziger Kanal: reaktiver Full-State-Push wenn `offline_seconds > RECONNECT_THRESHOLD_SECONDS (60s)` bei Heartbeat-Empfang.

### 6.3 Konfigurierbare Timeouts pro Aktor

**`max_runtime_ms`** existiert in `ActuatorConfig` (`actuator_types.h:33`):
- Default: 3600000ms (1h) — Compile-Time-Konstante
- Semantik: Verschleißschutz, nicht als Netzwerk-Failsafe konzipiert
- Nicht über Server-API konfigurierbar
- Nicht pro Aktor-Typ unterschiedlich (Pumpe ≠ Relais ≠ Heizung)

**Kein `network_timeout_ms` oder `on_disconnect_action`** in ActuatorConfig.

---

## Block 7: Lücken-Priorisierung nach Risiko

### Priorisierung nach Aktor-Typ

| Aktor-Typ | Risiko bei unkontrollierten 60 min | Priorität |
|-----------|-------------------------------------|-----------|
| Pumpe (Wasser) | Überschwemmung, Schaden | **CRITICAL** |
| Heizung/Wärmematte | Überhitzung, Brand | **CRITICAL** |
| Ventil (Bewässerung) | Überschwemmung | **CRITICAL** |
| Befeuchter | Schimmel, Überfeuchtung | **HIGH** |
| Lüfter | Energieverschwendung | **MEDIUM** |
| PWM-Beleuchtung | Energieverschwendung | **LOW** |

### Konsolidierte Lücken-Liste

| Nr | Lücke | Betroffene Szenarien | Schwere |
|----|-------|----------------------|---------|
| **L1** | Kein MQTT/WiFi-Disconnect → Aktoren-Stop auf ESP | 1, 2, 4, 5 | **CRITICAL** |
| **L2** | MQTT-Subscriptions nach Reconnect verloren (clean_session Bug) | 1, 2, 4, 5, 6 | **CRITICAL** |
| **L3** | `max_runtime_ms` = 1h Compile-Time, nicht konfigurierbar | Alle | **HIGH** |
| **L4** | `default_state` im Struct vorhanden aber nicht bei Disconnect angewendet | 1, 2, 4, 5 | **HIGH** |
| **L5** | Kein Background-Task für Heartbeat-Timeout-Überwachung (Server) | 3, 5 | **HIGH** |
| **L6** | Emergency-Stop in-memory (verloren nach Server-Restart) | 3 | **MEDIUM** |
| **L7** | Kein Server→ESP-Heartbeat (ESP merkt Server-Crash nicht) | 3 | **MEDIUM** |
| **L8** | LWT wird nicht gesendet bei Pi-Ausfall oder Broker-Crash | 2, 4 | **MEDIUM** |
| **L9** | Kein `on_disconnect_action` pro Aktor konfigurierbar | Alle | **MEDIUM** |
| **L10** | SafeMode (3× Watchdog) auskommentiert | Seltene Crashes | **LOW** |

---

## Block 8: Lösungsvorschläge (nach Aufwand)

### Was andere IoT-Plattformen machen

**Home Assistant + ESPHome:**
- `safe_mode` auf ESP: bei Verbindungsverlust nach konfigurierbarem Timeout GPIO in definierten Zustand
- Jeder Aktor hat `restore_mode: ALWAYS_OFF` oder `RESTORE_DEFAULT_OFF` als Failsafe

**AWS IoT Greengrass:**
- Edge-Runtime-Komponente läuft lokal, erhält Regeln vom Cloud-Server
- Bei Verbindungsverlust: lokal gespeicherte Regeln weiter ausgeführt

**Siemens SIMATIC ET200:**
- IEC 61511 konform: jeder Output hat konfigurierten Sicherheitszustand (failsafe value)
- Substituierwerte bei Kommunikationsfehler (Substitution Values)

**ThingsBoard Edge:**
- Edge-Computing: Regeln lokal ausführbar bei Serverausfall

### Vorschläge für AutomationOne (nach Aufwand)

**Quick-Win (1–2h pro Lücke):**

1. **L2 Fix: Re-Subscribe nach MQTT-Reconnect** (`mqtt_client.cpp`)
   - In `reconnect()` / nach erfolgreicher Verbindung: `subscribeToActuatorTopics()` aufrufen
   - Aufwand: **~30 Minuten**
   - Impact: Kritischer Bug behoben

2. **L3 Quick: `max_runtime_ms` über Server-Config konfigurierbar machen**
   - Neues Feld in `ActuatorConfig` JSON
   - Server sendet bei Config-Push
   - Aufwand: **2–3h**

**Mittel (0.5–2 Tage):**

3. **L1 + L4: MQTT-Disconnect → Aktoren in `default_state`**
   - In `handleDisconnection()` (`mqtt_client.cpp:813`): Alle registrierten Aktoren auf `default_state` setzen
   - `default_state` pro Aktor aus Config (default: `false` = OFF)
   - Aufwand: **4–6h** (Firmware + Config + API)
   - Impact: Kritischste Lücke geschlossen

4. **L5 Fix: Heartbeat-Timeout Background-Task (Server)**
   - Neuer Background-Task in `maintenance/service.py`
   - Alle 60s: ESPs mit `last_seen > HEARTBEAT_TIMEOUT_SECONDS` → LWT-Handler-Logik ausführen
   - Aufwand: **2–4h**

5. **L9: `on_disconnect_action` pro Aktor konfigurierbar**
   - Neues Feld in ActuatorConfig: `disconnect_action: OFF | KEEP | SAFE_VALUE`
   - Für Pumpen/Ventile/Heizungen: Default = OFF
   - Für Lüfter: Default = KEEP
   - Aufwand: **1 Tag** (Firmware + Config-Schema + Server)

**Groß (2–5 Tage):**

6. **L7: Server→ESP Keepalive-ACK**
   - Server sendet alle 30s ACK auf Topic `kaiser/{k}/esp/{e}/system/heartbeat_ack`
   - ESP prüft in `loop()`: `if (millis() - last_server_ack_ms > SERVER_TIMEOUT_MS) → disconnect_action()`
   - Aufwand: **1–2 Tage** (MQTT-Topic + ESP-Loop + Server-Handler)

7. **Konfigurierbarer `network_failsafe_timeout_ms` pro Aktor**
   - Ersetzt `max_runtime_ms` als primären Safety-Mechanismus
   - Pro Aktor-Typ unterschiedlicher Default: Pumpe=120s, Relais=300s, Lüfter=3600s
   - Aufwand: **1–2 Tage**

**Langfristig (1+ Wochen):**

8. **Lokale Minimal-Logik auf ESP32**
   - Server sendet bei Config-Push vereinfachte "Offline-Regeln" (Hysterese-Parameter)
   - ESP speichert in NVS
   - Bei Disconnect: führt Minimal-Regeln lokal aus
   - Aufwand: **3–5 Tage** (Komplex: NVS-Format, Rule-Parser, Synchronisation)

---

## Zusammenfassung für nächste Phase

### Kritischste Sofort-Fixes (vor nächster Feldtest)

1. **L2 (Re-Subscribe nach Reconnect)** — 30 Minuten, kritischer Bug
2. **L1+L4 (Disconnect → default_state OFF)** — 4–6h, hauptsächliche Sicherheitslücke
3. **L3 (max_runtime_ms konfigurierbar)** — 2–3h, ermöglicht sinnvolle Timeouts

### Live-System Sofortmaßnahme

Für den aktuellen Live-Einsatz (Zelt, Befeuchter an GPIO 14):
- Befeuchter hat `max_runtime_ms = 3600000` (1h) — zu lang für Feuchtebetrieb
- Empfehlung: `duration` in jedem Logic-Engine-Command setzen (z.B. `duration: 120s`)
- So greift `command_duration_end_ms` als safety-valve (clean OFF nach 2 Minuten)
- Sofort umsetzbar ohne Firmware-Änderung

---

## Akzeptanzkriterien — Erfüllungsstatus

- [x] Alle 6 Ausfallszenarien dokumentiert mit IST-Verhalten (Code-Referenzen)
- [x] Lücken-Matrix vollständig ausgefüllt
- [x] Alle Safety-relevanten Firmware-Dateien gelesen und dokumentiert
- [x] MQTT-Konfiguration (QoS, KeepAlive, Retain, Clean Session) dokumentiert
- [x] LWT-Handler und Heartbeat-Handler Backend analysiert
- [x] Bestandsaufnahme: Was existiert schon als Grundlage für Failsafe
- [x] Lösungsvorschläge mit Aufwand-Einschätzung
- [x] Priorisierung nach Aktor-Typ und Risiko
- [x] Code-Referenzen (Datei:Zeile) für alle Befunde

---

*Analyse-Basis: Codestand 2026-03-30. Code-Referenzen relativ zu `El Trabajante/src/` (ESP32) und `El Servador/god_kaiser_server/src/` (Server).*
