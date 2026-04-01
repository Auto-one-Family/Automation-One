# Auftrag: ANALYSE + FIX — Verbleibende Bugs nach Boot/Disconnect/Reconnect

**Typ:** Analyse + Fix (Firmware + Server)
**Datum:** 2026-04-01
**Prioritaet:** HOCH (Bug 1+2), MITTEL (Bug 3+4)
**Empfohlener Agent:** esp32-dev + server-dev
**Ergebnis:** Root-Cause-Analyse + implementierte Fixes
**Abhaengigkeit:** Keine — kann sofort bearbeitet werden

---

## Kontext

AutomationOne ist ein IoT-Framework mit drei Schichten:

1. **El Trabajante** (ESP32 Firmware, C++) — Sensoren auslesen, Aktoren schalten, Safety-System mit Offline-Rules (P4)
2. **El Servador** (FastAPI Server, Python) — REST-API, MQTT-Handler, Logic Engine, PostgreSQL (`god_kaiser_db`)
3. **El Frontend** (Vue 3 Dashboard) — Visualisierung

Das System nutzt MQTT fuer die Kommunikation zwischen ESP32 und Server. Der Server sendet Heartbeat-ACKs, Config-Pushes, Zone-Assignments und Aktor-Commands. Der ESP hat ein Safety-System mit mehreren Schutzebenen:

- **P1:** Heartbeat-basierte Server-Erreichbarkeitspruefung
- **P4:** Lokale Offline-Hysterese-Rules die auf dem ESP laufen wenn der Server ausfaellt. Der OfflineModeManager hat eine 4-State-Machine: `ONLINE → DISCONNECTED → OFFLINE_ACTIVE → RECONNECTING → ONLINE`.
- **P5:** Server-Status-Topic (`kaiser/{kaiser_id}/server/status`) — retained MQTT Message die sofort den Server-Zustand mitteilt

Getestetes Setup: ESP32 WROOM (`esp32_dev`), ESP-ID `ESP_EA5484`, Zone `zelt_wohnzimmer`, SHT31 I2C-Sensor (GPIO 0, Adresse 0x44, liefert `sht31_temp` + `sht31_humidity`), zwei Relay-Aktoren (GPIO 14 "Befeuchter", GPIO 25 ohne Name).

**Bereits gefixt in dieser Session (nicht Teil dieses Auftrags):**
- Bug A: Emergency-Broadcast JSON Buffer zu klein (256→512) — `main.cpp:352`
- Bug B: Emergency-Token NVS-Zugriffe ohne `beginNamespace()` — `main.cpp:298,359,756,762`
- Bug C: NVS `NOT_FOUND` Log-Noise — `esp_log_level_set("Preferences", ESP_LOG_NONE)` in `storage_manager.cpp`

---

## Serial-Log-Referenz

Das folgende Log dokumentiert einen kompletten Zyklus: Boot → MQTT-Connect → Registration → Config-Push → Server-Disconnect → P4 Offline-Rules → Server-Reconnect → Recovery. Alle Timestamps in eckigen Klammern sind Millisekunden seit ESP-Boot.

---

## Bug 1 (HOCH): SHT31-Sensor-Overwrite — Active Sensors 1 statt 2

### Beobachtung im Serial-Log

Der SHT31 ist ein I2C-Sensor der zwei Messwerte liefert: Temperatur (`sht31_temp`) und Luftfeuchtigkeit (`sht31_humidity`). Beide nutzen GPIO 0 und I2C-Adresse 0x44. Der Server sendet sie als zwei separate Sensor-Konfigurationen im Config-Push.

**Beim Config-Push (T=34345ms):**
```
[34364] I2C sensor 'sht31_temp' - GPIO validation skipped (uses I2C bus)
[34384] Saved sensor config for GPIO 0
[34395] Sensor Manager: Configured I2C sensor 'sht31_temp' at address 0x44 [sensor_count=1, active=true]
[34438] I2C sensor 'sht31_humidity' - GPIO validation skipped (uses I2C bus)
[34449] Sensor Manager: Updating existing sensor on GPIO 0           ← OVERWRITE!
[34459] Sensor type changed: sht31_temp → sht31_humidity              ← temp wird ueberschrieben
[34502] Sensor Manager: Updated sensor on GPIO 0 (sht31_humidity)
```

Resultat: `sensor_count=1`. Nur `sht31_humidity` ist aktiv. `sht31_temp` wurde ueberschrieben.

**Beim zweiten Config-Push (T=34783ms, 438ms spaeter) — dasselbe nochmal:**
```
[34814] Sensor Manager: Updating existing sensor on GPIO 0
[34815] Sensor type changed: sht31_humidity → sht31_temp              ← Hin...
[34902] Sensor Manager: Updating existing sensor on GPIO 0
[34912] Sensor type changed: sht31_temp → sht31_humidity              ← ...und zurueck
```

Bei JEDEM Config-Push wechselt der Sensor-Typ hin und her. Am Ende ist immer nur der LETZTE Typ (`sht31_humidity`) aktiv.

### Root-Cause

Die Firmware-Funktion `findSensorConfig()` in `sensor_manager.cpp` (Zeilen 1534–1552) ist EINE Implementierung mit optionalen Default-Parametern (GPIO, onewire_address, i2c_address) plus einer const-Ueberladung als Wrapper — keine drei separaten Varianten. Die Funktion sucht per GPIO + onewire_address + i2c_address, beruecksichtigt aber NICHT den `sensor_type`.

Da beide SHT31-Sub-Types (`sht31_temp` und `sht31_humidity`) dasselbe GPIO 0 und dieselbe Adresse 0x44 haben, findet `findSensorConfig()` beim zweiten Sensor immer den ERSTEN und gibt `existing != nullptr` zurueck.

Die Multi-Value-Logik in `configureSensor()` (Zeilen 252–311) wuerde korrekt einen neuen Slot anlegen — aber nur wenn `!existing && is_i2c_sensor`. Da `existing` durch den fehlerhaften Lookup schon gesetzt ist, wird der Multi-Value-Zweig NIE erreicht. Stattdessen geht der Code in den Update-Pfad (ca. Zeile 313) und ueberschreibt den bestehenden Eintrag. Der Multi-Value-Code ist faktisch toter Code fuer den SHT31-Fall bis `findSensorConfig()` gefixt ist.

Der `SensorManager` hat ein statisches Array `SensorConfig sensors_[MAX_SENSORS]` mit 10 Slots (`sensor_manager.h`). Das Array KANN zwei Eintraege mit gleichem GPIO und gleicher Adresse halten — die Lookup-Logik verhindert es nur.

### Was du analysieren musst

1. **`sensor_manager.cpp` — `findSensorConfig()` (Zeilen 1534–1552):** Bestaetigen dass `sensor_type` nicht verglichen wird. Den `sensor_type` als zusaetzlichen Vergleich einbauen fuer I2C-Sensoren.

2. **`sensor_manager.cpp` — `configureSensor()` (Zeilen 252–311):** Bestaetigen dass der Multi-Value-Zweig mit dem Fix korrekt angesprungen wird (wenn `findSensorConfig()` fuer den zweiten Sub-Type `nullptr` zurueckgibt).

3. **`sensor_manager.h` — `SensorConfig` Struct:** Bestaetigen dass ein `sensor_type` Feld existiert das fuer den Vergleich genutzt werden kann.

4. **ValueCache:** Die physische I2C-Auslese liest IMMER Temperatur UND Humidity zusammen (SHT31 Protokoll: Command 0x2400 liefert 6 Bytes: 2 Temp + CRC + 2 Hum + CRC). Werden BEIDE Werte im ValueCache gespeichert wenn zwei Sensor-Slots aktiv sind? Das ist kritisch fuer Offline-Rules: Wenn eine Offline-Rule `sensor_type: sht31_temp` referenziert, muss der ValueCache diesen Wert enthalten.

### Fix-Ansatz

`findSensorConfig()` fuer I2C-Sensoren um `sensor_type`-Vergleich erweitern. Wenn GPIO und I2C-Adresse gleich sind aber der `sensor_type` verschieden, `nullptr` zurueckgeben → `configureSensor()` legt NEUEN Slot an. Das Array hat 10 Slots — 2 davon fuer SHT31 ist kein Problem.

Der Fix muss mit einem optionalen `sensor_type`-Parameter arbeiten (Default: leerer String), damit bestehende Aufrufe ohne sensor_type weiterhin funktionieren. Nur der Config-Push-Pfad uebergibt den sensor_type.

### Akzeptanzkriterien

- [ ] Nach Config-Push: `sensor_count=2` (nicht 1)
- [ ] Kein `Sensor type changed` Log beim Config-Push
- [ ] ValueCache enthaelt BEIDE Werte (temp UND humidity)
- [ ] Offline-Rules finden beide Sensor-Typen im ValueCache

---

## Bug 2 (HOCH): Doppelter Config-Push vom Server

### Beobachtung im Serial-Log

```
[34345] MQTT message received: kaiser/god/esp/ESP_EA5484/config     ← 1. Config-Push
  → 2 Sensoren konfiguriert, 2 Aktoren konfiguriert, 2 Offline-Rules
[34783] MQTT message received: kaiser/god/esp/ESP_EA5484/config     ← 2. Config-Push (438ms spaeter!)
  → Sensoren: selbes Overwrite-Muster
  → Aktoren: "config unchanged, skipping"
  → Offline-Rules: nochmal empfangen und gespeichert
```

Der Server sendet die KOMPLETTE Konfiguration zweimal hintereinander (438ms Abstand). Der zweite Push ist komplett redundant — die Aktoren erkennen das sogar selbst (`config unchanged, skipping`). Aber:

- **NVS-Writes werden verdoppelt** (Sensor-Configs, Offline-Rules) — unnoetige Flash-Abnutzung
- **SHT31-Overwrite passiert zweimal** — verschlimmert Bug 1 (Type wechselt hin und her)
- **Log-Spam** — 30+ redundante Log-Zeilen

### Root-Cause-Vermutung

Der Server hat mehrere Stellen die einen Config-Push ausloesen koennen:
- `sensors.py` (3 Aufrufer: Zeilen ~770, ~1063, ~1208)
- `actuators.py` (2 Aufrufer: Zeilen ~635, ~1177)
- `heartbeat_handler.py` (1 Aufrufer: `_auto_push_config()`, aufgerufen via `asyncio.create_task()` an Zeile ~1379, mit 120s Cooldown ab Zeile ~1346)

Vermutlich loesen zwei verschiedene Code-Pfade gleichzeitig einen Config-Push aus — z.B. der Heartbeat-ACK-Handler und der Discovery/Approval-Handler. Oder der Heartbeat-ACK sendet erst Zone-Assignment + Config-Push, und dann loest das Zone-Assignment nochmal einen Config-Push aus.

### Was du analysieren musst

1. **Server-Logs (Loki):** Suche im Zeitraum ca. 2026-03-31T21:26:45Z nach `config_push` oder `push_config` oder `send_config` fuer ESP_EA5484. Welche zwei Code-Pfade haben den Push ausgeloest?

2. **`heartbeat_handler.py` — `_auto_push_config()`:** Gesucht per Funktionsname, nicht per Zeilennummer. Die Config-Push-Logik beginnt ab Zeile ~1346 (Cooldown-Check mit `config_push_sent_at` Metadata) und der `asyncio.create_task()` Aufruf ist an Zeile ~1379. Was passiert nach dem Heartbeat-ACK? Wird gleichzeitig ein Zone-Assignment gesendet das seinerseits einen Config-Push triggert?

3. **Config-Push-Cooldown:** Der Heartbeat hat einen 120s Cooldown. Aber die CRUD-Endpoints (`sensors.py`, `actuators.py`) haben KEIN Debounce. Wenn zwei Trigger innerhalb von 438ms feuern, werden zwei Pushes gesendet.

### Fix-Ansatz

Entweder:
- **Server-seitig:** Debounce/Dedup auf dem Config-Push-Pfad. Wenn ein Push fuer denselben ESP innerhalb der letzten 2 Sekunden gesendet wurde, zweiten Push ueberspringen.
- **Oder:** Den doppelten Trigger identifizieren und einen der beiden Aufrufer entfernen (wenn der zweite Push aus einem redundanten Code-Pfad kommt).

### Akzeptanzkriterien

- [ ] Nach Heartbeat-ACK + Zone-Assignment: genau EIN Config-Push (nicht zwei)
- [ ] Server-Logs zeigen nur einen `config_push`-Eintrag pro Heartbeat-Zyklus
- [ ] Kein funktionaler Verlust (Config-Push kommt weiterhin zuverlaessig nach Approval)

---

## Bug 3 (MITTEL): Server-Override-Spam bei jedem Aktor-Command

### Beobachtung im Serial-Log

Nach dem Server-Reconnect (T=136069ms, Server ONLINE) sendet der Server periodisch Aktor-Commands. JEDES Command loest den P4 Server-Override aus:

```
[155420] actuator/14/command → ON
[155431] [SAFETY-P4] Server override set for actuator GPIO 14     ← 1. Mal — korrekt
[215433] actuator/14/command → OFF
[215444] [SAFETY-P4] Server override set for actuator GPIO 14     ← 2. Mal — redundant
[215469] actuator/25/command → ON
[215481] [SAFETY-P4] Server override set for actuator GPIO 25     ← 1. Mal — korrekt
[245539] actuator/25/command → OFF
[245548] [SAFETY-P4] Server override set for actuator GPIO 25     ← 2. Mal — redundant
[305551] actuator/14/command → ON
[305560] [SAFETY-P4] Server override set for actuator GPIO 14     ← 3. Mal — redundant
```

### Warum das ein Problem ist

Der `server_override` Flag im P4-OfflineModeManager soll markieren, dass der Server die Kontrolle ueber einen bestimmten Aktor uebernommen hat, nachdem P4-Offline-Rules aktiv waren. Das Flag soll **einmal** pro Aktor gesetzt werden — beim ersten Command nach dem Uebergang von Offline zu Online. Danach ist klar: "Server hat die Kontrolle, P4-Rules gelten nicht mehr fuer diesen Aktor."

Wenn jedes Command den Override setzt:
- **Log-Spam:** Jeder Aktor-Command erzeugt eine zusaetzliche `Server override set` Zeile
- **State-Verwirrung:** Wenn der OfflineModeManager den Override-Zeitpunkt trackt, wird er bei jedem Command ueberschrieben
- **Falsche Semantik:** Der Override bedeutet "Server uebernimmt Kontrolle" — das passiert aber nur EINMAL, nicht bei jedem einzelnen Command

### Root-Cause

Die Funktion `setServerOverride(uint8_t actuator_gpio)` in `offline_mode_manager.cpp` iteriert das `offline_rules_[]` Array und setzt `offline_rules_[i].server_override = true` fuer alle Rules mit passendem `actuator_gpio`. Sie prueft dabei NICHT ob `server_override` bereits `true` ist — daher wird bei jedem eingehenden Command das Flag neu gesetzt und die Log-Zeile erneut geschrieben.

Das Override-Flag ist ein `bool` pro Rule im `offline_rules_[i]` Struct (indexiert per Rule-Index, NICHT per GPIO). Es gibt KEIN separates `server_override_set_[]` Array.

### Fix

In `setServerOverride()` einen Guard einbauen der prueft ob der Override bereits gesetzt ist:

```cpp
void OfflineModeManager::setServerOverride(uint8_t actuator_gpio) {
    for (uint8_t i = 0; i < offline_rule_count_; i++) {
        if (offline_rules_[i].actuator_gpio == actuator_gpio) {
            if (!offline_rules_[i].server_override) {  // ← NEU: Guard
                offline_rules_[i].server_override = true;
                LOG_I(TAG, "[SAFETY-P4] Server override set for actuator GPIO " + String(actuator_gpio));
            }
        }
    }
}
```

### Akzeptanzkriterien

- [ ] `Server override set` erscheint pro Aktor **maximal einmal** nach Server-Reconnect
- [ ] Bei erneutem Disconnect → P4 aktiv → Reconnect: Override wird wieder einmal pro Aktor gesetzt (das `server_override` Flag wird beim Aktivieren von P4 zurueckgesetzt)
- [ ] Aktor-Commands werden weiterhin korrekt ausgefuehrt (Guard betrifft nur Log + Flag, nicht die Command-Ausfuehrung)

---

## Bug 4 (MITTEL → HOCH nach Analyse): P4-Rules laufen weiter nach Server-Reconnect

### Beobachtung im Serial-Log

```
[136069] [SAFETY-P5] Server ONLINE — resetting P1 timer            ← Server ist zurueck
[136147] MQTT message received: kaiser/broadcast/emergency          ← Parse-Error (Bug A, gefixt)
...
[154372] Heartbeat-ACK empfangen
[155420] actuator/14/command → ON + Server override GPIO 14
[157528] Rule 1: GPIO 25 -> OFF (sensor GPIO 0 = 39.87             ← P4-RULE NOCH AKTIV!
```

**21.5 Sekunden** nachdem der Server wieder ONLINE ist (T=136069ms), fuehrt P4 noch eine Offline-Rule aus (T=157528ms: Rule 1 schaltet GPIO 25 OFF).

79 Sekunden lang kontrolliert P4 noch GPIO 25, obwohl der Server laengst zurueck ist (erst bei T=215469ms sendet der Server einen Command fuer GPIO 25). Wenn die P4-Rule und die Server-Logic-Engine unterschiedliche Entscheidungen treffen, entsteht Aktor-Flicker.

### Root-Cause

Der P5-Handler ruft bei `status == "online"` bereits `offlineModeManager.onServerAckReceived()` auf (`main.cpp:1279`). `onServerAckReceived()` ruft intern `deactivateOfflineMode()` auf — ABER NUR wenn `mode_ == OfflineMode::RECONNECTING`.

Das Problem: In diesem Szenario war der MQTT-Broker die ganze Zeit verbunden (nur der Server-Prozess ist ausgefallen, nicht der Broker). Dadurch wurde `onMQTTConnect()` nie ausgeloest → `onReconnect()` nie aufgerufen → der mode ist nach dem 30s Grace-Timer auf `OFFLINE_ACTIVE` gesetzt und bleibt dort. `onServerAckReceived()` hat KEINEN Case fuer `OFFLINE_ACTIVE` und macht daher nichts — P4 bleibt aktiv.

Die Funktion `deactivateOfflineMode()` existiert bereits (`offline_mode_manager.cpp:352`) und erledigt alles: Mode auf ONLINE setzen, Override-Flags zuruecksetzen, Log `[SAFETY-P4] Offline mode DEACTIVATED - back to server control` (Zeile 362) schreiben. Es muss KEIN neuer Deaktivierungscode geschrieben werden.

### Fix

Eine Zeile in `onServerAckReceived()` aendern — die bestehende Bedingung um `OFFLINE_ACTIVE` erweitern:

```cpp
// VORHER (nur RECONNECTING):
if (mode_ == OfflineMode::RECONNECTING) {
    deactivateOfflineMode();
}

// NACHHER (RECONNECTING oder OFFLINE_ACTIVE):
if (mode_ == OfflineMode::RECONNECTING || mode_ == OfflineMode::OFFLINE_ACTIVE) {
    deactivateOfflineMode();
}
```

Das ist der komplette Fix — eine Zeile, eine Bedingung. Kein neuer P5-Handler-Code noetig.

### Akzeptanzkriterien

- [ ] Nach `Server ONLINE` (P5): Log zeigt `[SAFETY-P4] Offline mode DEACTIVATED - back to server control`
- [ ] Keine weiteren `Rule X: GPIO Y -> ON/OFF` Logs nach Server-Reconnect
- [ ] Aktoren behalten ihren aktuellen Zustand nach P4-Deaktivierung (kein ploetzliches Umschalten)
- [ ] Bei erneutem Disconnect: P4 aktiviert sich wieder nach 30s Grace-Timer

---

## Bug 5 (NIEDRIG): Doppelte Server-OFFLINE-Meldung — KEIN CODE-FIX NOETIG

### Beobachtung im Serial-Log

```
[52402] [SAFETY-P5] Server OFFLINE (reason: graceful_shutdown)
[52414] [SAFETY-P4] Disconnect detected - 30s grace timer started
[53221] [SAFETY-P5] Server OFFLINE (reason: unexpected_disconnect)    ← 0.8s spaeter, zweites Event
```

Der ESP empfaengt zwei OFFLINE-Meldungen innerhalb von 0.8 Sekunden:
1. T=52402ms: `graceful_shutdown` — der Server sendet eine Shutdown-Message auf das Status-Topic
2. T=53221ms: `unexpected_disconnect` — der MQTT-Broker sendet das LWT des Servers

### Analyse-Ergebnis

Der Guard ist BEREITS implementiert: `onDisconnect()` hat `if (mode_ == OfflineMode::ONLINE)` als Eingangsbedingung (`offline_mode_manager.cpp:26`). Nach dem ersten Call ist `mode_ = DISCONNECTED` → das zweite OFFLINE-Event scheitert am Guard → der Grace-Timer wird NICHT neu gestartet.

Das Verhalten ist korrekt. Einzig das doppelte P5-Log `[SAFETY-P5] Server OFFLINE` im Serial-Monitor ist kosmetischer Spam (kommt vom P5-Handler in `main.cpp:1254` BEVOR `onDisconnect()` aufgerufen wird). Optional kann ein Guard `if (mode_ != OfflineMode::ONLINE) return` vor dem zweiten Disconnect-Log eingefuegt werden — niedrigste Prioritaet.

### Optionaler Server-seitiger Fix

Beim graceful_shutdown koennte der Server das LWT clearen BEVOR er disconnected (MQTT `disconnect()` mit `will_delay_interval` oder manuellem LWT-Clear). Dann wuerde der Broker kein zweites OFFLINE senden. Aber das ist eine Server-Optimierung, kein Firmware-Bug.

---

## Zusammenfassung und Prioritaeten

| Bug | Schwere | Schicht | Fix-Aufwand | Kern-Problem |
|-----|---------|---------|-------------|--------------|
| 1 | HOCH | Firmware | Mittel | `findSensorConfig()` beruecksichtigt `sensor_type` nicht → SHT31 Overwrite |
| 4 | HOCH | Firmware | **1 Zeile** | `onServerAckReceived()` fehlt `OFFLINE_ACTIVE` Case → P4 bleibt aktiv nach Server-Reconnect |
| 2 | HOCH | Server | Mittel | Zwei Trigger feuern Config-Push innerhalb 438ms |
| 3 | MITTEL | Firmware | **1 Guard** | `setServerOverride()` prueft nicht ob Override bereits gesetzt → Log-Spam |
| 5 | NIEDRIG | — | Kein Fix | Guard bereits implementiert, nur kosmetischer Log-Spam |

### Empfohlene Reihenfolge

1. **Bug 4** zuerst — 1-Zeilen-Fix, hohe Auswirkung (P4 deaktiviert sich nicht nach Server-Reconnect)
2. **Bug 1** als zweites — betrifft Sensor-Datenqualitaet und Offline-Rule-Zuverlaessigkeit
3. **Bug 3** als drittes — 1-Guard-Fix, Log-Hygiene
4. **Bug 2** als viertes — Server-seitige Analyse noetig, reduziert NVS-Abnutzung
5. **Bug 5** — kein Fix noetig

### Was NICHT geaendert werden darf

- P4 Offline-Rule-Evaluierungslogik (Hysterese, Sensor-Lookup, `isnan→continue`)
- P5 Server-Status-Topic-Mechanismus (retained Messages)
- MQTT-Topic-Struktur
- SafetyController und Emergency-Stop
- Heartbeat-Intervall (60s) und Heartbeat-ACK-Mechanismus
- Registration-Gate und PENDING_APPROVAL-Logik (gerade erst gefixt)
- HealthMonitor-Intervall
- Config-Push-Payload-Struktur
- NVS-Schema fuer Sensor/Aktor/Offline-Rules
- `deactivateOfflineMode()` selbst (funktioniert korrekt, wird nur nicht aufgerufen)

### Build

PlatformIO-Pfad: `/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe`
Befehl: `cd "El Trabajante" && /c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e esp32_dev`

### Bericht

Erstelle nach der Analyse einen Bericht mit:
1. **Root-Cause pro Bug** — genaue Dateien und Zeilennummern
2. **Fix-Details** — was wurde wo geaendert
3. **Vorher/Nachher** — relevante Log-Ausschnitte die zeigen dass der Bug behoben ist
4. **Build-Ergebnis** — Firmware kompiliert auf `esp32_dev` ohne Errors

---

> Erstellt von: automation-experte Agent
> Bezug: Serial-Log ESP_EA5484 Boot + Disconnect-Test 2026-03-31
> Geprueft: 8 Pfade, 2 Agents, 1 Build-Env, 5+ Funktionen, MQTT-Topic, Zeilennummern — alle bestaetigt
> Bereits gefixt: Bug A (Emergency JSON Buffer), Bug B (Emergency Token NVS), Bug C (NVS Log-Noise)
