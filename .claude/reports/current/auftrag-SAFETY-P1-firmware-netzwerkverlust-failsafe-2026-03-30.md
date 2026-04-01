# Auftrag SAFETY-P1: Firmware Failsafe bei Netzwerkverlust

**Ziel-Repo:** auto-one (Schwerpunkt: El Trabajante Firmware, minimal El Servador Backend)
**Typ:** Analyse + Implementierung
**Prioritaet:** CRITICAL
**Datum:** 2026-03-30
**Geschaetzter Aufwand:** ~8-12h (Analyse ~2h, Implementierung ~6-10h)
**Abhaengigkeit:** Keine — startet sofort
**Blockiert:** SAFETY-P4 (Offline-Regeln) — P4 braucht den Server-ACK-Timeout aus diesem Auftrag

---

## Auftragsziel

Implementiere die grundlegenden Sicherheitsmechanismen die verhindern dass Aktoren (Pumpen, Heizungen, Ventile, Befeuchter) bei Netzwerkverlust unkontrolliert weiterlaufen. Aktuell laeuft ein Aktor bei Verbindungsverlust bis zu **1 Stunde** weiter (Runtime Protection Default). Dieser Auftrag reduziert das auf **maximal 2 Minuten** durch 5 komplementaere Mechanismen.

**KEIN BREAKING CHANGE.** Alle bestehenden Funktionen bleiben erhalten. Neue Mechanismen sind additiv — sie greifen NUR bei Verbindungsverlust ein. Im Normalbetrieb (Server online) aendert sich NICHTS am Verhalten.

---

## System-Kontext (komplett — kein externes Repo noetig)

### Architektur

AutomationOne ist ein 3-schichtiges IoT-Framework. Die Logic Engine (Automatisierungsregeln, Hysterese, Safety-Checks) laeuft komplett auf dem **Server** (El Servador, FastAPI + Python). Der **ESP32** (El Trabajante, C++ Arduino) ist reiner Executor — er liest Sensoren aus, empfaengt Aktor-Befehle via MQTT und schaltet GPIOs. Kommunikation ausschliesslich ueber MQTT (Mosquitto Broker auf dem Pi).

### Live-System
- ESP_EA5484 "Zelt Agent" auf Raspberry Pi 5
- SHT31 Sensor (GPIO 0, I2C 0x44) — Temperatur + Luftfeuchte
- Luftbefeuchter an Olimex PWR Switch (GPIO 14, konfiguriert als Pumpe)
- Hysterese-Regel: Befeuchter AN wenn Feuchte < 45%, AUS wenn > 55%

### MQTT-Topic-Schema
```
kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data          # ESP→Server: Sensor-Daten
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command      # Server→ESP: Aktor-Befehle
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status       # ESP→Server: Aktor-Status
kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response     # ESP→Server: Command-Response
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat             # ESP→Server: Heartbeat (alle 30s)
kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack         # Server→ESP: Heartbeat-ACK (BEREITS VORHANDEN)
kaiser/{kaiser_id}/esp/{esp_id}/system/will                  # Broker→Server: LWT bei Disconnect
kaiser/broadcast/emergency                                    # Server→Alle: Emergency-Stop
```

---

## IST-Zustand (verifiziert durch Code-Analyse 2026-03-30)

### Problem 1: MQTT-Disconnect → Kein Aktor-Eingriff

**Datei:** `src/services/communication/mqtt_client.cpp`

`handleDisconnection()` (Zeile 813) macht bei MQTT-Disconnect:
1. Setzt Registration-Gate zurueck (SafePublish)
2. Loggt einmalig
3. Ruft `reconnect()` auf

**Was NICHT passiert:** Kein Callback an den ActuatorManager. Keine Sicherheitsaktion. Aktoren bleiben im letzten Zustand — bei ON laeuft der Aktor bis Runtime Protection greift (1 Stunde).

### Problem 2: Subscriptions verloren nach Reconnect

**Datei:** `src/main.cpp` (Zeilen 823-846)

PubSubClient nutzt `clean_session = true` (hardcoded im Library-Default). Alle MQTT-Subscriptions werden NUR in `setup()` aufgerufen — 11 Subscriptions:

```
Zeile 823-846: 11 Subscriptions:
  - system_command:             kaiser/{k}/esp/{e}/system/command       (823)
  - config:                     kaiser/{k}/esp/{e}/config               (824)
  - broadcast_emergency:        kaiser/broadcast/emergency              (825)
  - actuator_command_wildcard:  kaiser/{k}/esp/{e}/actuator/+/command   (826)
  - esp_emergency_topic:        kaiser/{k}/esp/{e}/emergency            (827)
  - zone_assign:                kaiser/{k}/esp/{e}/zone/assign          (828)
  - subzone_assign:             kaiser/{k}/esp/{e}/subzone/assign       (834)
  - subzone_remove:             kaiser/{k}/esp/{e}/subzone/remove       (835)
  - subzone_safe:               kaiser/{k}/esp/{e}/subzone/safe         (836)
  - sensor_command:             kaiser/{k}/esp/{e}/sensor/+/command     (842)
  - heartbeat_ack:              kaiser/{k}/esp/{e}/system/heartbeat/ack (846)
```

Die `reconnect()`-Funktion in `mqtt_client.cpp` ruft nach erfolgreichem Reconnect KEIN erneutes `subscribe()` auf. **Folge: Nach jedem MQTT-Reconnect empfaengt der ESP keine Befehle mehr.** Der Server sendet Commands, aber der ESP bekommt sie nicht. Das ist ein kritischer Bug der SOFORT gefixt werden muss.

### Problem 3: max_runtime_ms ist 1 Stunde und nicht konfigurierbar

**Datei:** `src/models/actuator_types.h` (Zeile 32-36)

`max_runtime_ms = 3600000UL` ist ein Compile-Time-Default innerhalb des `RuntimeProtection`-Structs. Zugriff im Code via `config.runtime_protection.max_runtime_ms`. Der Server kann diesen Wert NICHT per Config-Push aendern. Fuer Pumpen ist 1 Stunde unkontrollierter Betrieb inakzeptabel (Ueberschwemmung). Fuer Heizungen ebenso (Brandgefahr).

Zum Vergleich: Industrielle SPS-Systeme (Siemens PROFIsafe) haben Watchdog-Timeouts von 20ms bis maximal 1920ms — unter 2 Sekunden. Fuer einen Gartenbau-Kontext ist ein Kompromiss von 60-120 Sekunden angemessen.

### Problem 4: ESP trackt Server-ACK-Timeout nicht

Der Server sendet BEREITS einen Heartbeat-ACK bei jedem empfangenen Heartbeat — die Funktion `_send_heartbeat_ack()` wird bei jedem Heartbeat aufgerufen (heartbeat_handler.py:157, 187, 199, 371). Der ESP subscribed BEREITS auf `system/heartbeat/ack` (main.cpp:846) und handled die Message (main.cpp:1897-1942).

**Was FEHLT:** Der ESP trackt keinen `last_server_ack_ms` Timestamp und prueft keinen Timeout. Wenn der Server crasht aber der MQTT-Broker weiterlaeuft:
- MQTT-Verbindung bleibt bestehen (Broker ist ja da)
- `handleDisconnection()` wird NIE aufgerufen
- ESP empfaengt keine ACKs mehr, merkt es aber nicht
- Aktoren laufen im letzten Zustand weiter
- Erst nach 1 Stunde greift Runtime Protection

**Server-seitig ist KEIN neuer Code noetig.** Der ACK-Mechanismus existiert. Nur die Firmware muss den Timeout tracken.

Auf dem Server existieren drei Timeout-Konstanten die NICHT aktiv genutzt werden:
- `HEARTBEAT_TIMEOUT_SECONDS = 300` in `heartbeat_handler.py:46` — toter Code, nirgends abgefragt
- `TIMEOUT_ESP_HEARTBEAT = 120000` in `constants.py:192` — nicht aktiv genutzt
- `RECONNECT_THRESHOLD_SECONDS = 60` in `heartbeat_handler.py:49` — genutzt fuer Full-State-Push-Trigger, NICHT fuer Offline-Erkennung

### Problem 5: Kein Status-Sync nach Reconnect

Wenn der ESP die Verbindung verliert und wiedergewinnt:
- Aktoren behalten ihren RAM-Zustand (kein Reset)
- ESP sendet KEINE Status-Meldung an den Server
- Server-DB und physischer Aktor-Zustand koennen divergieren
- Server weiss nicht ob z.B. ein Failsafe-Shutdown stattgefunden hat

### Bestehende Strukturen die genutzt werden koennen

| Was | Wo | Zustand |
|-----|-----|---------|
| `ActuatorConfig.default_state` | `src/models/actuator_types.h:51` | Existiert, kommentiert "Failsafe state if config lost", Default `false`. Wird BEREITS aus Config-Push geparst (actuator_manager.cpp:768-770). Wird bei `begin()` als initialer GPIO-Zustand verwendet. Wird bei Disconnect NICHT angewendet. |
| `RuntimeProtection.max_runtime_ms` | `src/models/actuator_types.h:32-36` | Default `3600000UL` (1h). Zugriff via `config.runtime_protection.max_runtime_ms`. Nicht per Config-Push konfigurierbar. |
| `processActuatorLoops()` | `actuator_manager.cpp` → `main.cpp:2547` | Wird in jedem `loop()`-Zyklus aufgerufen. Prueft Runtime Protection + Duration Timer. Hier koennen neue Timer eingebaut werden. |
| `controlActuatorBinary(gpio, state)` | `actuator_manager.cpp` | Setzt GPIO HIGH/LOW — die Funktion zum Schalten. |
| `publishActuatorStatus(gpio)` | `actuator_manager.cpp` | Sendet aktuellen Aktor-Status via MQTT — kann fuer Reconnect-Sync genutzt werden. |
| `SafetyController` | `safety_controller.h/.cpp` | 5 Emergency-Stop-Pfade existieren. Pfad 6 (Disconnect→Stop) fehlt. |
| Config-Push JSON | `config_manager.cpp` | Empfaengt `kaiser/{k}/esp/{e}/config`. `default_state` wird bereits geparst. `max_runtime_ms` noch nicht. |
| Heartbeat-ACK Handler | `main.cpp:1897-1942` | Empfaengt `system/heartbeat/ack`, verarbeitet Approval-Logik. Setzt KEINEN Timestamp fuer Timeout-Tracking. |

---

## SOLL-Zustand (5 Mechanismen)

### Mechanismus A: Re-Subscribe nach MQTT-Reconnect

**Was:** Nach jedem erfolgreichen MQTT-Connect alle 11 Subscriptions erneut aufrufen.

**Wo:** In `mqtt_client.cpp` — entweder in `reconnect()` nach erfolgreichem `connect()`, oder besser: eine zentrale `subscribeToAllTopics()`-Funktion erstellen die sowohl von `setup()` als auch von `reconnect()` aufgerufen wird.

**Die 11 Subscriptions die `subscribeToAllTopics()` enthalten muss:**
1. `kaiser/{k}/esp/{e}/system/command` (system_command)
2. `kaiser/{k}/esp/{e}/config` (config)
3. `kaiser/broadcast/emergency` (broadcast_emergency)
4. `kaiser/{k}/esp/{e}/actuator/+/command` (actuator_command_wildcard)
5. `kaiser/{k}/esp/{e}/emergency` (esp_emergency)
6. `kaiser/{k}/esp/{e}/zone/assign` (zone_assign)
7. `kaiser/{k}/esp/{e}/subzone/assign` (subzone_assign)
8. `kaiser/{k}/esp/{e}/subzone/remove` (subzone_remove)
9. `kaiser/{k}/esp/{e}/subzone/safe` (subzone_safe)
10. `kaiser/{k}/esp/{e}/sensor/+/command` (sensor_command)
11. `kaiser/{k}/esp/{e}/system/heartbeat/ack` (heartbeat_ack)

**IST:** `subscribe()` nur in `setup()` (main.cpp:823-846).
**SOLL:** `subscribe()` auch nach jedem erfolgreichen Reconnect.

**Kein Breaking Change:** Im Normalbetrieb (kein Disconnect) aendert sich nichts. Nur nach Reconnect werden Subscriptions wiederhergestellt die vorher verloren gingen.

### Mechanismus B: MQTT-Disconnect → Aktoren in Safe State

**Was:** Wenn die MQTT-Verbindung abbricht, werden ALLE registrierten Aktoren in ihren `default_state` versetzt (Default: `false` = OFF).

**Wo:** In `mqtt_client.cpp` → `handleDisconnection()` (Zeile 813). Neuer Callback an den ActuatorManager.

**Ablauf:**
1. `handleDisconnection()` wird aufgerufen (MQTT-Verbindung verloren)
2. Neuer Code: Fuer jeden registrierten Aktor → `controlActuatorBinary(gpio, config.default_state)` aufrufen
3. Log: `[SAFETY] MQTT disconnected — all actuators set to safe state`
4. Danach wie bisher: `reconnect()` aufrufen

**Kein Breaking Change:** `default_state` ist `false` fuer alle Aktoren (bestehender Default). Aktoren gehen bei Disconnect AUS. Das ist das sicherste Verhalten. Wer einen Aktor bei Disconnect AN lassen will (z.B. Luefter), kann `default_state` per Config-Push auf `true` setzen (wird bereits geparst).

**WICHTIG:** Dieser Mechanismus greift NUR bei echtem MQTT/WiFi-Disconnect. Bei Server-Crash + laufendem Broker feuert er NICHT — dafuer braucht es Mechanismus D.

### Mechanismus C: Konfigurierbarer max_runtime_ms per Config-Push

**Was:** Der Server kann `max_runtime_ms` pro Aktor per Config-Push setzen. Damit kann der Timeout von 1 Stunde auf z.B. 120 Sekunden reduziert werden.

**Wichtig:** `default_state` wird BEREITS aus dem Config-Push geparst (actuator_manager.cpp:768-770) und vom config_builder.py gesendet (Mapping: `actuator_metadata.default_state → default_state`). Fuer `default_state` ist KEIN neuer Code noetig. Nur `max_runtime_ms` muss neu im Config-Push unterstuetzt werden.

**Wo:**
- **Firmware:** `config_manager.cpp` — beim Parsen der Aktor-Config das Feld `max_runtime_ms` aus dem JSON lesen und in `config.runtime_protection.max_runtime_ms` setzen.
- **Backend:** `config_builder.py` — beim Bauen des Config-Push JSON das Feld `max_runtime_ms` aus der Aktor-Konfiguration einbauen.

**Config-Push JSON (max_runtime_ms ist das neue Feld):**
```json
{
  "actuators": [
    {
      "gpio": 14,
      "actuator_type": "pump",
      "max_runtime_ms": 120000,
      "default_state": false,
      "...": "bestehende Felder bleiben unveraendert"
    }
  ]
}
```

**IST:** `config.runtime_protection.max_runtime_ms = 3600000UL` Compile-Time-Default, nicht per Config-Push aenderbar.
**SOLL:** Wenn der Server `max_runtime_ms` im Config-Push mitsendet, ueberschreibt der ESP den Default. Wenn das Feld fehlt (Backwards-Compatibility), bleibt der Default.

**Empfohlene Werte:**

| Aktor-Typ | max_runtime_ms | Begruendung |
|------------|---------------|-------------|
| Pumpe | 120.000 (2 min) | Ueberschwemmungsgefahr |
| Ventil | 120.000 (2 min) | Ueberschwemmungsgefahr |
| Heizung | 120.000 (2 min) | Brandgefahr |
| Befeuchter | 120.000 (2 min) | Schimmelgefahr |
| Luefter | 300.000 (5 min) | Nur Energieverschwendung |
| PWM-Licht | 3.600.000 (1h) | Kein Sicherheitsrisiko |

**Kein Breaking Change:** Feld ist optional im Config-Push. Alter Server ohne dieses Feld → ESP nutzt bestehenden Default. Neuer Server sendet es mit → ESP nutzt es.

### Mechanismus D: Server-ACK-Timeout Tracking (nur Firmware)

**Was:** Der ESP trackt `last_server_ack_ms` basierend auf dem BEREITS empfangenen `heartbeat/ack`. Wenn kein ACK innerhalb von `SERVER_ACK_TIMEOUT_MS` (Default: 120s) kommt, versetzt der ESP alle Aktoren in den Safe State — genau wie bei MQTT-Disconnect (Mechanismus B).

**Warum das noetig ist:** Bei Server-Crash + laufendem Broker feuert `handleDisconnection()` NICHT (MQTT-Verbindung steht ja noch). Ohne Mechanismus D merkt der ESP nichts.

**Server-seitig ist KEIN Code noetig.** Der ACK existiert bereits:
- `_send_heartbeat_ack()` wird bei jedem Heartbeat aufgerufen (heartbeat_handler.py:157, 187, 199, 371)
- Topic: `kaiser/{k}/esp/{e}/system/heartbeat/ack`
- ESP subscribed bereits (main.cpp:846)
- ESP handled bereits (main.cpp:1897-1942)

**Firmware-Aenderungen (NUR Firmware):**

1. **Neues Feld:** `uint32_t last_server_ack_ms` — initialisiert auf `millis()` bei erstem erfolgreichen MQTT-Connect
2. **Bestehenden Handler erweitern:** In main.cpp:1897-1942 (heartbeat/ack Handler) zusaetzlich `last_server_ack_ms = millis()` setzen. Die bestehende Approval-Logik wird NICHT angefasst.
3. **Check in `loop()` oder `processActuatorLoops()`:** Alle 10 Sekunden pruefen:
   ```
   Wenn (millis() - last_server_ack_ms > SERVER_ACK_TIMEOUT_MS)
     UND MQTT ist verbunden (mqtt_.connected() == true)
     UND server_timeout_triggered == false
   → Alle Aktoren in Safe State (wie Mechanismus B)
   → server_timeout_triggered = true
   → Log: "[SAFETY] Server ACK timeout — actuators set to safe state"
   ```
4. **Reset:** Bei naechstem empfangenen ACK → `server_timeout_triggered = false`, `last_server_ack_ms = millis()`

**Timeout-Hierarchie (gestaffelt, jede Stufe als Fallback):**
```
Stufe 1: MQTT Keep-Alive (90s)                            → Erkennt Broker-Ausfall → Mechanismus B
Stufe 2: Server-ACK-Timeout (120s, konfig.)               → Erkennt Server-Ausfall → Mechanismus D
Stufe 3: Runtime Protection (120-300s, per Config-Push)    → Absoluter Fallback → Mechanismus C
```

**Kein Breaking Change:** Der bestehende heartbeat/ack Handler wird nur um eine Zeile erweitert (`last_server_ack_ms = millis()`). Die bestehende Approval-Logik bleibt unveraendert. Wenn der Server keinen ACK sendet (alter Server), feuert der Timeout nach 120s — das ist GEWOLLT als Sicherheitsmechanismus.

### Mechanismus E: Reconnect State-Sync

**Was:** Nach erfolgreicher MQTT-Reconnection publiziert der ESP den aktuellen Status ALLER Aktoren. Damit erfaehrt der Server was waehrend der Offline-Phase passiert ist.

**Wo:** In `mqtt_client.cpp` oder `main.cpp` — nach erfolgreichem Reconnect und Re-Subscribe (Mechanismus A).

**Ablauf:**
1. MQTT Reconnect erfolgreich
2. Re-Subscribe (Mechanismus A) — alle 11 Topics
3. NEU: Fuer jeden registrierten Aktor → `publishActuatorStatus(gpio)` aufrufen
4. NEU: Heartbeat sofort senden (nicht auf naechsten 30s-Zyklus warten)
5. NEU: `last_server_ack_ms = millis()` und `server_timeout_triggered = false` (Mechanismus D Reset)

Die Funktion `publishActuatorStatus()` existiert bereits und sendet den aktuellen `current_state` auf `actuator/{gpio}/status`. Der Server empfaengt das via `actuator_status_handler` und aktualisiert `actuator_states` in der DB.

**Kein Breaking Change:** `publishActuatorStatus()` wird bereits nach jedem Aktor-Command aufgerufen. Zusaetzlicher Aufruf nach Reconnect ist identisch im Verhalten.

---

## Analyse-Teil (MUSS vor der Implementierung stattfinden)

### Block A: Firmware-Analyse

1. **`mqtt_client.cpp` komplett lesen** — Fokus auf:
   - `handleDisconnection()` (Zeile 813): Exakter Code, alle Aufrufe
   - `reconnect()`: Ablauf, wann wird `connect()` aufgerufen, Rueckgabewert
   - `loop()` bzw. `maintain()`: Wie wird Disconnect erkannt
   - Gibt es bereits einen Callback-Mechanismus an andere Klassen?

2. **`main.cpp` Subscriptions und Heartbeat-ACK-Handler lesen** — Fokus auf:
   - Zeilen 823-846: Alle 11 `subscribe()` Aufrufe verifizieren (Liste oben gegenchecken)
   - Ist eine `subscribeToAllTopics()`-Funktion bereits vorhanden oder muss sie erstellt werden?
   - Wo ist der beste Ort fuer die Funktion (main.cpp oder mqtt_client.cpp)?
   - Zeilen 1897-1942: Bestehender heartbeat/ack Handler — exakten Code lesen, Approval-Logik verstehen, Einfuegepunkt fuer `last_server_ack_ms = millis()` identifizieren

3. **`actuator_manager.cpp` + `src/models/actuator_types.h` lesen** — Fokus auf:
   - `ActuatorConfig` Struct: Alle Felder, besonders `default_state` und `RuntimeProtection.max_runtime_ms`
   - `processActuatorLoops()`: Alle Timer-Pruefungen, wo der neue Server-ACK-Check hinpasst
   - `controlActuatorBinary()`: Signatur, Seiteneffekte
   - `publishActuatorStatus()`: Signatur, was wird gesendet
   - Wie wird auf registrierte Aktoren iteriert? (Array, Vector, Map?)
   - Zeilen 768-770: Bestehende `default_state` Parsing-Logik verifizieren

4. **`config_manager.cpp` lesen** — Fokus auf:
   - Config-Push JSON Parsing: Wie werden Aktor-Configs empfangen und angewendet?
   - Welche Felder werden aktuell aus dem JSON gelesen?
   - Wo wird `runtime_protection.max_runtime_ms` gesetzt? Wird es bereits aus JSON gelesen?
   - NVS-Persistierung: Werden Config-Aenderungen in NVS geschrieben?

5. **`safety_controller.h/.cpp` lesen** — Fokus auf:
   - Wie wird Emergency-Stop ausgeloest? Gibt es eine zentrale Funktion?
   - Sollte der Disconnect-Safe-State als Emergency-Stop oder als separater Pfad implementiert werden?
   - `EmergencyState` Enum: Braucht es einen neuen State (z.B. `DISCONNECTED`)?

### Block B: Backend-Analyse

6. **`config_builder.py` lesen** — Fokus auf:
   - `build_combined_config()`: Wie werden Aktor-Configs serialisiert?
   - Wird `max_runtime_ms` bereits im JSON mitgesendet? Wenn nein: wo ergaenzen?
   - Wird `default_state` korrekt aus `actuator_metadata` gemappt? (Verifizieren)
   - Welche Datenquelle: `actuator_configs` Tabelle? Welche Spalte fuer `max_runtime_ms`?

---

## Implementierungsreihenfolge (A → B → C → D → E)

**A zuerst** weil es ein kritischer Bug ist (30 Minuten, sofort testbar).
**B zweites** weil es die Hauptluecke schliesst (2-3 Stunden).
**C drittes** weil es B besser macht (2-3 Stunden, minimal Backend).
**D viertes** weil es den Server-Crash-Fall abdeckt (2-3 Stunden, nur Firmware).
**E letztes** weil es den Zustand nach Offline-Phase synchronisiert (1-2 Stunden).

---

## Akzeptanzkriterien

- [ ] Nach MQTT-Reconnect empfaengt ESP weiterhin Aktor-Commands — alle 11 Subscriptions wiederhergestellt (Mechanismus A)
- [ ] Bei MQTT-Disconnect gehen alle Aktoren in Safe State (`config.default_state`) (Mechanismus B)
- [ ] `max_runtime_ms` kann per Config-Push geaendert werden — Wert kleiner als 3600000 wird akzeptiert und in `config.runtime_protection.max_runtime_ms` gesetzt (Mechanismus C)
- [ ] Wenn Server-ACK ausbleibt fuer > SERVER_ACK_TIMEOUT_MS bei aktiver MQTT-Verbindung → Aktoren gehen in Safe State (Mechanismus D)
- [ ] Nach Reconnect sendet ESP Status aller Aktoren + sofortigen Heartbeat (Mechanismus E)
- [ ] Bestehende Funktionalitaet unveraendert: Normaler Aktor-Command-Flow, Runtime Protection, Emergency-Stop, Config-Push, Heartbeat, Heartbeat-ACK Approval-Logik
- [ ] Keine neuen Compiler-Warnings, kein Speicher-Overhead > 200 Bytes RAM

## Einschraenkungen — Was NICHT gemacht wird

- Kein Wechsel von PubSubClient zu ESP-IDF MQTT (mittelfristig sinnvoll, aber eigener Auftrag)
- Kein `clean_session = false` (erfordert PubSubClient-Fork — Re-Subscribe ist der sicherere Fix)
- Keine lokalen Offline-Regeln (das ist SAFETY-P4)
- Keine Frontend-Aenderungen (UI fuer `max_runtime_ms` Konfiguration ist eigener Auftrag)
- Kein neuer Server-Code fuer Heartbeat-ACK (existiert bereits)
- Kein Heartbeat-Timeout Background-Task auf dem Server (der Firmware-seitige ACK-Timeout ist ausreichend)
