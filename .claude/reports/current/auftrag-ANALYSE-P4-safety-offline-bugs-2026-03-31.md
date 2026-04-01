# Auftrag: ANALYSE — P4 Safety Offline-Mode Bugs

**Typ:** Tiefenanalyse (Backend + Firmware)
**Datum:** 2026-03-31
**Prioritaet:** HOCH — Sicherheitskritisch
**Empfohlener Agent:** server-dev + esp32-dev (oder general-purpose der beides kann)
**Ergebnis:** Analysebericht in `tests/verification/P4-GUARD-2026-03-31/` mit konkreten Fix-Vorschlaegen

---

## Kontext

AutomationOne ist ein IoT-Framework mit drei Schichten:
1. **El Trabajante** (ESP32 Firmware, C++) — Sensoren auslesen, Aktoren schalten, Offline-Safety
2. **El Servador** (FastAPI Server, Python) — REST-API, Logic Engine, MQTT-Handler, PostgreSQL
3. **El Frontend** (Vue 3) — Dashboard

Das System hat zwei unabhaengige Safety-Mechanismen fuer den Fall dass der ESP die Verbindung zum Server verliert:

### SAFETY-P1: ACK-Timeout
- Der ESP sendet Heartbeats (~60s Intervall)
- Der Server antwortet mit Heartbeat-ACKs
- Wenn 120 Sekunden lang KEIN ACK kommt: **Alle Aktoren werden auf `default_state` (OFF) gesetzt**
- P1 reagiert auf: Server-Prozess down, Netzwerk-Timeout, Broker down
- P1 ist ein "harter Notaus" — schaltet IMMER alles ab, egal was gerade laeuft

### SAFETY-P4: Offline-Hysterese-Mode
- Der ESP hat einen **OfflineModeManager** mit 4-State-Machine:
  ```
  ONLINE → (MQTT disconnect) → DISCONNECTED → (30s Timer) → OFFLINE_ACTIVE
    ↑                                                              ↓
    └─────── (MQTT reconnect) ←── RECONNECTING ←──────────────────┘
  ```
- Im OFFLINE_ACTIVE-Modus evaluiert der ESP lokale **Offline-Rules** autonom
- Offline-Rules sind Hysterese-basiert (activate_below/deactivate_above)
- Rules werden vom Server via Config-Push uebertragen und im NVS persistiert
- P4 reagiert NUR auf: **MQTT-Disconnect** (TCP-Verbindung zum Broker verloren)

### P4-GUARD
- Filtert kalibrierungspflichtige Sensoren (pH, EC) aus Offline-Rules
- Grund: Analoge Sensoren liefern im Offline-Mode nur ADC-Rohwerte (0-4095) ueber `applyLocalConversion()`, waehrend die Thresholds in physikalischen Einheiten stehen (z.B. pH 7.5). Ein Vergleich 2048 > 7.5 = true wuerde eine Dosierpumpe faelschlicherweise einschalten.
- **Server-Filter:** `sensor_type.split("_")[0]` gegen Whitelist (erlaubt: ds18b20, sht31, bmp280, bme280)
- **Firmware-Filter:** `requiresCalibration()` strcmp als Defense-in-Depth
- Digitale Sensoren (SHT31, DS18B20, BMP280, BME280) sind erlaubt — `applyLocalConversion()` liefert fuer diese physikalische Werte (°C, %RH, hPa)

---

## Was bei Live-Tests passiert ist (2026-03-31)

Getestet wurde auf echtem ESP32 (ESP_EA5484) mit:
- **Sensor:** SHT31 (Temperatur + Luftfeuchtigkeit, I2C, GPIO 0, Adresse 0x44)
- **Aktor:** Relais fuer Luftbefeuchter (GPIO 14, konfiguriert als type=relay, Firmware instanziiert PumpActuator)
- **Logic Rule:** Server-seitige Rule die bei Temperatur-Schwellwert den Luftbefeuchter schaltet (funktioniert im Online-Modus)
- **Netzwerk:** WiFi (192.168.0.161), MQTT-Broker (192.168.0.39:1883)

### Test-Szenario 1: Nur Server gestoppt (Broker laeuft weiter)

**Was passiert ist:** NICHTS. Der ESP hat nicht reagiert. Die MQTT-Verbindung zum Broker blieb bestehen. Der OfflineModeManager wurde nicht aktiviert. Nach 120 Sekunden griff P1 (ACK-Timeout) und schaltete den Aktor ab. Obwohl die Temperatur sich aenderte, wurde KEINE Rule evaluiert — weder Server-seitig (Server war aus) noch lokal (P4 war nicht aktiv).

**Serial-Beweis:**
```
[289544] [SAFETY-P1] Server ACK timeout (120s) — setting actuators to safe state
[289544] PumpActuator GPIO 14 OFF
[289563] 1 actuator(s) set to safe state (default_state)
[289564] [SAFETY-P4] Disconnect detected - 30s grace timer started  ← P4 startet GLEICHZEITIG mit P1
```

P4 detektierte den "Disconnect" im SELBEN Moment wie P1 feuerte — NICHT weil MQTT wirklich abbrach, sondern vermutlich weil P1 den Disconnect-Status triggert.

### Test-Szenario 2: Broker gestoppt (MQTT-Verbindung bricht ab)

**Was passiert ist:** Der Aktor war AN (Relay ON, Logic Rule aktiv). Broker wurde gestoppt. Der ESP erkannte den MQTT-Disconnect. Aber anstatt die 30s Grace Period abzuwarten und dann Offline-Rules zu evaluieren, wurde der Aktor **SOFORT** abgeschaltet.

**Serial-Beweis:**
```
E (587634) MQTT_CLIENT: mqtt_message_receive: transport_read() error: errno=128
[579982] [MQTT] MQTT_EVENT_ERROR type=1 — TCP transport error: ESP_ERR_ESP_TLS_TCP_CLOSED_FIN
[580010] MQTT_EVENT_DISCONNECTED
[580032] CircuitBreaker [MQTT]: Failure recorded (count: 1/5)
[580042] MQTT disconnected
[580053] [SAFETY-P4] Disconnect detected - 30s grace timer started
[580056] [SAFETY-M2] MQTT_DISCONNECTED received — setting safe state    ← SOFORT!
[580067] PumpActuator GPIO 14 OFF                                       ← SOFORT AUS!
[580079] 1 actuator(s) set to safe state (default_state)
```

**Chronologie (alle Timestamps innerhalb von 37ms!):**
1. T=580042: MQTT disconnected erkannt
2. T=580053: P4 startet 30s Grace Timer
3. T=580056: `[SAFETY-M2]` setzt Aktoren auf safe state — **BEVOR P4 ueberhaupt die Grace Period abwarten kann!**
4. T=580067: Aktor AUS

Der Tag `[SAFETY-M2]` deutet auf Code aus dem RTOS-Migration M2-Modul hin. Dieser Code reagiert DIREKT auf `MQTT_EVENT_DISCONNECTED` und setzt Aktoren sofort auf safe state — ohne P4's Grace Period zu respektieren. P4 hat den Timer gestartet, aber M2 hat den Aktor schon abgeschaltet.

**Dann:** Der Broker wurde wieder gestartet. ESP reconnectete nach ~13 Sekunden:
```
[593094] MQTT_EVENT_CONNECTED
[593205] [SAFETY-P1] All 11 MQTT topics subscribed
[593215] [SAFETY-P1] MQTT reconnected — syncing actuator state with server
[593241] [SAFETY-P4] Reconnected during grace period - back ONLINE
```

P4 sagt "Reconnected during grace period" — die 30s waren noch nicht um. P4 hat nie OFFLINE_ACTIVE erreicht. Die Offline-Rules wurden NIE evaluiert.

### Zusaetzliches Finding: 0 Offline-Rules gepusht

Der Config-Push vom Server enthielt **0 Offline-Rules**:
```
[316756] StorageManager: Cleared namespace: offline
[316757] [SAFETY-P4] Received 0 offline rules - cleared
```

Die Logic Rule funktioniert online (Server sendet Actuator-Commands), aber der Server konvertiert sie NICHT in eine Offline-Rule. Das bedeutet: Selbst wenn P4 korrekt funktionieren wuerde, gaebe es KEINE Offline-Rules zum Evaluieren.

### Zusaetzliches Finding: Intermittierender Boot-Crash

Beim ersten Boot nach Konfigurationsaenderung crashte der ESP:
```
assert failed: xQueueSemaphoreTake queue.c:1545 (( pxQueue ))
Backtrace: 0x400840bd:0x3ffb1a70 0x4008eaa1:0x3ffb1a90 0x40094569:0x3ffb1ab0
```
Der Crash passierte direkt nach dem Laden der 2 Sensor-Configs aus NVS (SHT31 temp + humidity). Ein NULL-Queue-Handle wurde an `xQueueSemaphoreTake` uebergeben. Der zweite Boot (nach Watchdog-Reboot) funktionierte. Intermittierend, vermutlich Race-Condition.

---

## Bug-Katalog

### BUG-1 (KRITISCH): SAFETY-M2 schaltet Aktor SOFORT ab bei MQTT-Disconnect

**IST:** Bei MQTT_EVENT_DISCONNECTED wird `[SAFETY-M2]` getriggert und setzt ALLE Aktoren sofort auf safe state (default_state = OFF). Das passiert BEVOR P4's 30s Grace Period ablaufen kann und BEVOR Offline-Rules evaluiert werden.

**SOLL:** Bei MQTT-Disconnect soll P4's State-Machine die Kontrolle uebernehmen:
1. DISCONNECTED: 30s Grace Period, Aktor-Zustand bleibt UNVERAENDERT
2. OFFLINE_ACTIVE: Offline-Rules uebernehmen und entscheiden ob der Aktor an oder aus sein soll
3. Nur wenn KEINE Offline-Rules vorhanden sind: DANN auf safe state fallen

**WO SUCHEN:**
- Die Meldung `[SAFETY-M2] MQTT_DISCONNECTED received — setting safe state` kommt aus dem RTOS-Migrations-Code (M2 = ESP-IDF MQTT Integration)
- Suche nach dem Tag `SAFETY-M2` in der Firmware
- Der Code registriert sich vermutlich als MQTT-Event-Handler fuer `MQTT_EVENT_DISCONNECTED`
- Dieser Handler ruft `SafetyController::setAllActuatorsToSafeState()` oder aehnlich auf
- **Konflikt:** P4's OfflineModeManager registriert sich AUCH fuer MQTT-Disconnect (startet den 30s Timer), aber M2 handelt schneller

**FIX-VORSCHLAG:** M2 darf bei MQTT-Disconnect NICHT mehr direkt die Aktoren abschalten. Stattdessen:
- Option A: M2 delegiert an P4. P4 entscheidet ob sofort abgeschaltet wird (keine Offline-Rules) oder ob die Grace Period + Offline-Rules greifen.
- Option B: M2-Code fuer `MQTT_DISCONNECTED` entfernen/deaktivieren. P4 ist bereits der designierte Handler fuer diesen Fall.
- Option C: M2 prueft ob Offline-Rules vorhanden sind. Wenn ja: nicht abschalten (P4 uebernimmt). Wenn nein: abschalten.

**Akzeptanzkriterien:**
- [ ] Bei MQTT-Disconnect mit aktiven Offline-Rules: Aktor-Zustand bleibt 30s unveraendert, dann Offline-Rules
- [ ] Bei MQTT-Disconnect OHNE Offline-Rules: Aktor wird nach 30s auf safe state gesetzt (nicht sofort)
- [ ] Kein `PumpActuator GPIO X OFF` Log innerhalb der ersten 30s nach Disconnect
- [ ] P4-Log zeigt saubere Transition: ONLINE → DISCONNECTED → OFFLINE_ACTIVE

### BUG-2 (HOCH): Server pusht 0 Offline-Rules trotz aktiver Logic Rule

**IST:** Der Config-Push vom Server enthaelt `offline_rules: []` (leer). Die Logic Rule funktioniert online (Server sendet Actuator ON/OFF Commands), wird aber nicht in eine Offline-Rule konvertiert. Im Serial-Log:
```
[SAFETY-P4] Received 0 offline rules - cleared
```

**SOLL:** Eine aktive Hysterese-basierte Logic Rule mit SHT31-Temperatur-Sensor soll automatisch zu einer Offline-Rule konvertiert und im Config-Push mitgesendet werden.

**WO SUCHEN (Backend):**

Die Konvertierung passiert in `config_builder.py`:
- Aeussere Funktion: `_build_offline_rules()` — iteriert ueber aktive Logic Rules
- Innere Funktion: `_extract_offline_rule(self, rule, esp_id)` — extrahiert eine einzelne Rule
- Variable `sensor_value_type` wird aus der Condition extrahiert: `hysteresis_cond.get("sensor_type") or ""`

**Moegliche Ursachen — ALLE pruefen:**

1. **Die Logic Rule hat KEINEN Hysterese-Condition-Typ:**
   - `_extract_offline_rule()` sucht nach Conditions mit `type == "hysteresis"` (oder einem spezifischen Typ-Feld)
   - Wenn die Rule einen einfachen Threshold hat statt Hysterese, wird sie uebersprungen
   - **PRUEFEN:** `SELECT conditions FROM cross_esp_logic WHERE is_active = true` — hat die Condition ein `type`-Feld? Welchen Wert?
   - **PRUEFEN:** Welchen Condition-Typ erwartet `_extract_offline_rule()`? Wie heisst das Feld im JSON?

2. **Die Rule referenziert den falschen ESP:**
   - `_extract_offline_rule()` hat den Parameter `esp_id`
   - Die Rule-Conditions referenzieren einen bestimmten ESP
   - Wenn die ESP-ID in der Rule nicht mit dem Ziel-ESP uebereinstimmt, wird die Rule uebersprungen
   - **PRUEFEN:** Stimmt die ESP-ID in der Rule-Condition mit ESP_EA5484 ueberein?

3. **Der GUARD filtert die Rule:**
   - `sensor_value_type.split("_")[0]` wird gegen die Whitelist geprueft
   - `sht31_temp` → `split("_")[0]` → `"sht31"` — sollte IN der Whitelist sein
   - **PRUEFEN:** Wie lautet die exakte Whitelist im Code? Enthaelt sie `"sht31"`?
   - **PRUEFEN:** Wird das Ergebnis des Filters geloggt? Gibt es Server-Logs die zeigen WARUM 0 Rules rauskamen?

4. **Die Condition hat kein `sensor_type`-Feld:**
   - `sensor_value_type = hysteresis_cond.get("sensor_type") or ""` — wenn das Feld fehlt oder anders heisst, ist `sensor_value_type` leer
   - Ein leerer String wuerde vom GUARD gefiltert werden: `"".split("_")[0]` → `""` nicht in Whitelist
   - **PRUEFEN:** Wie heisst das Sensor-Typ-Feld in der Condition exakt?

5. **`_build_offline_rules()` wird gar nicht aufgerufen:**
   - Der Config-Push-Code ruft moeglicherweise `_build_offline_rules()` nicht auf
   - **PRUEFEN:** In welcher Funktion wird der Config-Push zusammengebaut? Wird `_build_offline_rules()` dort aufgerufen?
   - **PRUEFEN:** Gibt es eine Bedingung die den Aufruf verhindert?

**Diagnose-Queries:**

```sql
-- Aktive Logic Rules komplett anzeigen
SELECT id, rule_name, is_active, conditions::text, actions::text
FROM cross_esp_logic WHERE is_active = true;

-- ESP-ID pruefen
SELECT id, name FROM esp_devices WHERE deleted_at IS NULL;
```

**Akzeptanzkriterien:**
- [ ] Config-Push enthaelt mindestens 1 Offline-Rule wenn eine aktive Hysterese-Rule mit SHT31 existiert
- [ ] Serial-Log zeigt: `[SAFETY-P4] Received X offline rules` mit X > 0
- [ ] Serial-Log zeigt: `[SAFETY-P4] Saved X offline rules to NVS`

### BUG-3 (MITTEL): P1 und P4 haben keinen definierten Vorrang

**IST:** P1 (ACK-Timeout, 120s) und P4 (Offline-Mode, 30s) sind unabhaengig. Es gibt kein definiertes Verhalten wenn beide gleichzeitig relevant sind.

**Beobachtetes Verhalten bei "nur Server down":**
- P1 feuert nach 120s (kein ACK) → Aktoren AUS
- P4 detektiert im SELBEN Moment einen "Disconnect" → startet 30s Timer
- Server kommt 80ms spaeter zurueck → P4 wird abgebrochen, P1 wird restored

**Problem-Szenarien:**

| Szenario | P1 | P4 | Ergebnis | Korrekt? |
|----------|----|----|----------|----------|
| Nur Server down | Feuert nach 120s | Nie aktiviert (kein MQTT-Disconnect) | Aktor AUS nach 120s | Teils — 120s ohne Regelung |
| Broker down, Aktor war AUS | Zaehlt weiter | OFFLINE_ACTIVE nach 30s (falls BUG-1 gefixt) | Offline-Rules uebernehmen | OK |
| Broker down, Aktor war AN | Zaehlt weiter | OFFLINE_ACTIVE nach 30s (falls BUG-1 gefixt) | Offline-Rules halten Aktor AN | OK — ABER nur wenn P1 nicht vorher feuert! |
| Broker down seit >90s + letzter ACK alt | **Feuert VOR P4!** | Startet 30s Timer | P1 schaltet Aktor AUS bevor P4 uebernehmen kann | **FALSCH** |

**WO SUCHEN:**
- P1-Timer-Logik: Suche nach `Server ACK timeout` und dem 120s-Vergleich
- P4-Timer-Logik: `OfflineModeManager` — 30s DISCONNECTED-Timer
- Gibt es eine Koordination zwischen P1 und P4?

**FIX-VORSCHLAG:**
- Wenn P4 OFFLINE_ACTIVE erreicht hat, soll P1 PAUSIERT werden (P4 hat die Kontrolle)
- P1 soll NUR feuern wenn P4 NICHT aktiv ist
- Alternative: P1 delegiert an P4's Offline-Rules statt direkt auf default_state zu gehen

**Akzeptanzkriterien:**
- [ ] Wenn P4 im OFFLINE_ACTIVE ist, feuert P1 NICHT
- [ ] P1 feuert nur im ONLINE-State oder wenn P4 keine Offline-Rules hat

### BUG-4 (MITTEL): Emergency Broadcast JSON Parse Error

**IST:** Bei jedem Server-Start/-Stop empfaengt der ESP eine Nachricht auf `kaiser/broadcast/emergency` die nicht als JSON geparsed werden kann:
```
[257392] MQTT message received: kaiser/broadcast/emergency
[257393] ERROR: Failed to parse broadcast emergency JSON
```

Das tritt konsistent auf (in Wokwi und auf echtem ESP).

**WO SUCHEN:**
- **Firmware:** Wo wird das Topic `kaiser/broadcast/emergency` verarbeitet? In `main.cpp` bei den MQTT-Callbacks. Wie wird der JSON-Parse durchgefuehrt? ArduinoJson `deserializeJson()`?
- **Server:** Was sendet der Server auf dieses Topic? Retained Message? Startup-Message? Beim Stoppen des Servers kann Mosquitto eine LWT-Nachricht senden.
- **Broker:** Gibt es eine Retained Message auf `kaiser/broadcast/emergency`? Pruefen mit `mosquitto_sub -v -t 'kaiser/broadcast/emergency' -C 1`

**Moegliche Ursachen:**
1. Retained Emergency-Message die nicht geloescht wurde (Server sendet beim Shutdown evtl. eine kaputte Nachricht)
2. Server-LWT (Last Will and Testament) auf dem Emergency-Topic mit nicht-JSON Payload
3. Server sendet absichtlich eine "clear" Nachricht die kein gueltiges JSON ist

**Akzeptanzkriterien:**
- [ ] Kein `Failed to parse broadcast emergency JSON` Error beim normalen Betrieb
- [ ] Emergency-Topic enthaelt entweder gueltiges JSON oder keine retained Message

### BUG-5 (NIEDRIG): SHT31 I2C-Sibling Overwrite — Active Sensors: 1 statt 2

**IST:** Der SHT31 hat zwei Sub-Types: `sht31_temp` und `sht31_humidity`. Beide nutzen GPIO 0 und I2C-Adresse 0x44. Beim Laden aus NVS oder Config-Push wird der zweite Config-Eintrag als "Update" des ersten behandelt:
```
[6910] Configured I2C sensor 'sht31_temp' at address 0x44 [sensor_count=1]
[6921] Updating existing sensor on GPIO 0
[6931] Sensor type changed: sht31_temp → sht31_humidity
...
[7243] Active Sensors: 1    ← sollte 2 sein
```

Das Ergebnis: Nur `sht31_humidity` ist als aktiver Sensor registriert. Bei jedem Config-Push wechselt der Typ hin und her (humidity → temp → humidity).

**WO SUCHEN:**
- `sensor_manager.cpp`: `findSensorConfig()` sucht per GPIO. Bei GPIO 0 findet es immer den ersten Eintrag, unabhaengig vom sensor_type.
- Das Problem ist bekannt als "I2C Sibling Issue" — mehrere logische Sensoren auf demselben physischen I2C-Geraet werden als ein Sensor behandelt
- `configureSensor()` oder die NVS-Lade-Logik behandelt den zweiten Config als Update statt als neuen Sensor

**Auswirkung auf P4:**
- Wenn nur ein Sensor aktiv ist, liefert der ValueCache moeglicherweise nur einen der beiden Werte
- Offline-Rules die den "falschen" Sensor-Typ referenzieren finden keinen Wert im Cache
- **ABER:** Die I2C-Auslese liest physisch beide Werte (SHT31 liefert immer Temperatur+Humidity zusammen via `expand_multi_value()`). Die Frage ist ob der ValueCache beide Werte speichert oder nur den des "aktiven" Sensors.

**Akzeptanzkriterien:**
- [ ] Active Sensors zeigt 2 (nicht 1) nach Laden von sht31_temp + sht31_humidity
- [ ] Kein "Sensor type changed" Log beim Config-Push
- [ ] ValueCache enthaelt beide Werte (temp UND humidity)

### BUG-6 (NIEDRIG): Intermittierender Boot-Crash (xQueueSemaphoreTake NULL)

**IST:**
```
assert failed: xQueueSemaphoreTake queue.c:1545 (( pxQueue ))
```
Crash direkt nach dem Laden der 2 Sensor-Configs aus NVS. NULL-Queue-Handle. Tritt nicht bei jedem Boot auf — der zweite Boot nach Watchdog-Reboot funktioniert.

**WO SUCHEN:**
- Der Crash passiert nach `Loaded 2 sensor configurations` und vor der Sensor-Konfiguration (die erst beim zweiten Boot bei Zeile 6892 sichtbar ist)
- Vermutlich versucht der Config-Lade-Code oder der Sensor-Setup-Code einen Mutex zu nehmen der nicht initialisiert ist
- Die RTOS-Mutexe werden bei `[SYNC] RTOS mutexes created` angelegt (T=186ms im zweiten Boot, T=7179ms fuer Queues)
- **Timing-Problem:** Die Config-Update-Queue und Publish-Queue werden in Phase 5 erstellt (`[SYNC] Config update queue created`), aber Sensor-Configs werden in Phase 4 geladen. Wenn der Sensor-Config-Code versucht, etwas in die Publish-Queue zu schicken (z.B. eine Config-Response), findet er eine NULL-Queue.
- **PRUEFEN:** Wird im Sensor-Config-Lade-Pfad `xQueueSend()` oder `xSemaphoreTake()` aufgerufen bevor die Queue/der Mutex erstellt ist?
- **PRUEFEN:** Gibt es einen Code-Pfad der nur beim ERSTEN Boot nach Konfig-Aenderung anders laeuft?

**Akzeptanzkriterien:**
- [ ] Kein Crash bei Boot mit 2+ Sensor-Configs in NVS
- [ ] Queues/Mutexe werden VOR Phase 4 Sensor-Loading erstellt, ODER Phase 4 Code prueft auf NULL bevor er Queue/Mutex nutzt

---

## Analyse-Auftrag (Was der Agent tun soll)

### Phase 1: Bug-1 Analyse — SAFETY-M2 vs P4

1. **Finde den `[SAFETY-M2]` Code:**
   - Suche in der Firmware nach dem String `SAFETY-M2`
   - Identifiziere die Datei und Funktion die bei MQTT_DISCONNECTED Aktoren abschaltet
   - Dokumentiere den vollstaendigen Code-Pfad: Welcher Event-Handler → welche Funktion → welcher Aufruf

2. **Finde den P4 Disconnect-Handler:**
   - Suche in `offline_mode_manager.cpp/.h` nach dem MQTT-Disconnect-Handler
   - Dokumentiere: Wann wird der 30s Timer gestartet? Welche Funktion?

3. **Vergleiche die Reihenfolge:**
   - Beide Handler reagieren auf MQTT_DISCONNECTED
   - Wer wird zuerst aufgerufen?
   - Gibt es eine Event-Dispatch-Reihenfolge?

4. **Pruefe ob P4 OFFLINE_ACTIVE je erreichbar ist:**
   - Wenn M2 sofort die Aktoren abschaltet — wird P4 trotzdem OFFLINE_ACTIVE erreichen?
   - Oder schaltet M2 ab, P4 wartet 30s, und dann evaluiert P4 Rules die den Aktor ggf. wieder einschalten?
   - Das waere ein "Flapping": Aktor OFF (M2) → 30s spaeter ON (P4-Rule) — unakzeptabel

5. **Fix vorschlagen** (konkreter Code-Vorschlag)

### Phase 2: Bug-2 Analyse — 0 Offline-Rules

1. **Logic Rule aus DB lesen:**
   ```sql
   SELECT id, rule_name, is_active, conditions::text, actions::text
   FROM cross_esp_logic WHERE is_active = true;
   ```
   - Conditions und Actions komplett dokumentieren
   - Pruefe: Hat die Rule einen `hysteresis`-Condition-Typ?

2. **`_build_offline_rules()` in `config_builder.py` lesen:**
   - Welche Bedingungen muessen erfuellt sein damit eine Rule in eine Offline-Rule konvertiert wird?
   - Gibt es Logging das zeigt WARUM 0 Rules rauskommen?

3. **`_extract_offline_rule(self, rule, esp_id)` lesen:**
   - Welche Felder werden aus der Condition extrahiert?
   - Wie wird der `sensor_value_type` bestimmt?
   - Wie lautet die GUARD-Whitelist exakt?

4. **Config-Push-Code lesen:**
   - Wo wird `_build_offline_rules()` aufgerufen?
   - Wird das Ergebnis korrekt in den Config-Push eingebaut?
   - Pruefe die Server-Logs: `docker logs [server-container] 2>&1 | grep -i "offline_rule\|extract_offline\|build_offline"`

5. **Root-Cause identifizieren und Fix vorschlagen**

### Phase 3: Bug-3 Analyse — P1/P4 Koordination

1. **P1-Timer-Code lesen:**
   - Wo wird der 120s-Timeout implementiert?
   - Welche Variable trackt den letzten ACK-Zeitpunkt?
   - Was passiert exakt wenn der Timer ablaeuft?

2. **P4 State-Machine lesen:**
   - Alle State-Transitions dokumentieren
   - Gibt es einen Check fuer P1 in der P4-Logik?

3. **Interaktions-Analyse:**
   - Kann P4 den P1-Timer pausieren?
   - Was passiert wenn P1 und P4 gleichzeitig feuern?

4. **Fix vorschlagen:** Koordinations-Mechanismus

### Phase 4: Weitere Bugs

1. **Bug-4:** Emergency Broadcast — Retained Message pruefen, Server-Code pruefen
2. **Bug-5:** SHT31 Overwrite — `findSensorConfig()` Logik, ValueCache Multi-Sensor
3. **Bug-6:** Boot-Crash — Queue/Mutex Timing in Phase 4 vs Phase 5

### Phase 5: Bericht

Erstelle `tests/verification/P4-GUARD-2026-03-31/bericht-ANALYSE-P4-safety-bugs.md`:

```markdown
# P4 Safety Offline-Mode — Bug-Analyse

## Bug-1: SAFETY-M2 sofortiges Abschalten
- Code-Pfad: [Datei:Zeile → Datei:Zeile → ...]
- Root Cause: [...]
- Fix-Vorschlag: [konkreter Code]
- Risiko-Bewertung: [...]

## Bug-2: 0 Offline-Rules
- Logic Rule JSON: [komplett]
- Condition-Typ: [hysteresis/threshold/...]
- Root Cause: [...]
- Fix-Vorschlag: [...]

## Bug-3: P1/P4 Koordination
- P1 Code-Pfad: [...]
- P4 Code-Pfad: [...]
- Interaktion: [...]
- Fix-Vorschlag: [...]

## Bug-4/5/6: [Kurzanalyse je Bug]

## Empfohlene Fix-Reihenfolge
1. Bug-1 (KRITISCH — ohne Fix ist P4 wirkungslos)
2. Bug-2 (HOCH — ohne Fix gibt es keine Offline-Rules)
3. Bug-3 (MITTEL — nach Bug-1 und Bug-2 relevant)
4. Bug-4/5/6 (NIEDRIG — nach den kritischen Fixes)
```

---

## Was NICHT geaendert werden soll

- Keine Aenderungen am Frontend
- Keine Aenderungen an der Logic Engine (Server-seitige Rule-Evaluation)
- Keine Aenderungen an der MQTT-Topic-Struktur
- Keine Aenderungen an der DB-Schema
- Keine Aenderungen an der Config-Push-Struktur (nur Inhalt)
- Keine neuen Features — nur Bugfixes und Analyse

---

## verify-plan — Reality-Check (2026-03-31)

- **Ausgabeordner:** `tests/verification/P4-GUARD-2026-03-31/` existierte im Repo nicht — bei Phase 5 anlegen (Bericht liegt jetzt dort).
- **SAFETY-M2:** String und Logik in `El Trabajante/src/tasks/safety_task.cpp` (nicht `main.cpp`). MQTT-Disconnect: `mqtt_client.cpp` → `xTaskNotify` → `safety_task.cpp`.
- **GUARD Server:** In `config_builder.py` ist die Filterlogik **`normalize_sensor_type()` + `CALIBRATION_REQUIRED_SENSOR_TYPES` (`ph`, `ec`, `moisture`)** — nicht `sensor_type.split("_")[0]` gegen eine Positiv-Whitelist wie im Fließtext beschrieben.
- **P1 bei Broker down:** `checkServerAckTimeout()` läuft nur bei `mqttClient.isConnected()` — der 120s-ACK-Timeout aus dieser Funktion feuert nicht, solange MQTT getrennt ist; Tabellenzeile „Broker down … P1 vor P4“ gegen Code und ggf. andere Mechanismen prüfen.
- **Bericht:** `tests/verification/P4-GUARD-2026-03-31/bericht-ANALYSE-P4-safety-bugs.md` (Phase-5-Template).

