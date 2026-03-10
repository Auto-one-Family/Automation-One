# ESP32 Debug Report

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: "WiFi BEACON_TIMEOUT nach erfolgreicher Verbindung")
**Geraet:** ESP_472204
**Quellen:** Bereitgestellter Serial-Log-Ausschnitt, `wifi_manager.cpp`, `mqtt_client.cpp`, `main.cpp`

---

## 1. Zusammenfassung

ESP_472204 verbindet sich beim Boot erfolgreich mit WiFi und initiiert die MQTT-Verbindung. Etwa 8,6 Sekunden nach dem WiFi-Connect tritt Reason 200 (BEACON_TIMEOUT) auf, gefolgt 2,4 Sekunden spaeter von Reason 201 (NO_AP_FOUND). Die Firmware hat keinen asynchronen WiFi-Event-Handler registriert — die Disconnect-Erkennung erfolgt ausschliesslich polling-basiert in `WiFiManager::loop()`. Der Disconnect selbst ist mit hoher Wahrscheinlichkeit eine Hardware/Umgebungs-Ursache (schwaches Signal, AP-Roaming, Kanalwechsel), keine Firmware-Fehlfunktion. Die Reconnect-Logik ist vorhanden und korrekt implementiert, wartet jedoch 30 Sekunden (`RECONNECT_INTERVAL_MS`) bevor der erste Reconnect-Versuch erfolgt.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| Bereitgestellter Serial-Log-Ausschnitt | ANALYSIERT | 10 Zeilen, Boot-Phase bis WiFi-Disconnect |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | GELESEN | Vollstaendige Reconnect-Logik analysiert |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | GELESEN | MQTT-Reconnect und Circuit Breaker analysiert |
| `El Trabajante/src/main.cpp` | GELESEN (Auszug) | WiFi-Event-Handler-Suche, loop()-Aufrufe geprueft |
| `logs/current/esp32_serial.log` | NICHT VERFUEGBAR | Kein vollstaendiges Log vorhanden |

---

## 3. Befunde

### 3.1 Reason 200 – BEACON_TIMEOUT

- **Schwere:** Hoch (WiFi-Verbindungsverlust)
- **Detail:** WiFi Reason 200 ist der ESP-IDF-interne Code `WIFI_REASON_BEACON_TIMEOUT`. Der ESP32-WiFi-Stack erwartet periodische Beacon-Frames vom Access Point. Bleiben diese aus (Standard-Schwellwert: ca. 6 aufeinanderfolgende ausgelassene Beacons, bei 100ms Beacon-Intervall entspricht das ca. 600ms), gilt die Verbindung als verloren. Typische Ursachen: AP ausser Reichweite, AP sendet voruebergehend keine Beacons (Reboot, Kanalwechsel), starke HF-Interferenz auf dem 2,4-GHz-Kanal, oder RSSI-Abfall unter den internen Schwellwert des ESP32-Stacks.
- **Zeitpunkt:** 15.305s nach Boot
- **Evidenz:** `[ 15305][W][WiFiGeneric.cpp:1062] _eventCallback(): Reason: 200 - BEACON_TIMEOUT`

### 3.2 Reason 201 – NO_AP_FOUND

- **Schwere:** Hoch (AP nach internem Scan nicht auffindbar)
- **Detail:** WiFi Reason 201 entspricht `WIFI_REASON_NO_AP_FOUND`. Nach dem BEACON_TIMEOUT fuehrt der ESP32-WiFi-Stack intern einen Background-Scan durch, um den verlorenen AP wiederzufinden. Schlaegt dieser Scan fehl, wird Reason 201 ausgegeben. Reason 201 folgt fast immer direkt auf Reason 200, wenn der AP auch nach dem kurzen Scan-Intervall nicht sichtbar ist. Das Zeitdelta zwischen 200 und 201 betraegt 2,438 Sekunden — das entspricht einem vollstaendigen internen Scan-Zyklus auf allen 2,4-GHz-Kanaelen.
- **Zeitpunkt:** 17.743s nach Boot
- **Evidenz:** `[ 17743][W][WiFiGeneric.cpp:1062] _eventCallback(): Reason: 201 - NO_AP_FOUND`

### 3.3 Timing-Analyse: 8,68 Sekunden Stabilitaetsfenster

- **Schwere:** Mittel (diagnostisch relevant)
- **Detail:** Der WiFi-Connect erfolgt bei 6.623ms. Der BEACON_TIMEOUT tritt bei 15.305ms auf. Das ergibt ein Stabilitaetsfenster von exakt **8,68 Sekunden**. Dieses kurze Fenster ist charakteristisch fuer:
  - Schwaches Signal: ESP verbindet sich am Rand der Empfangsreichweite, haelt die Verbindung kurz, verliert sie bei minimaler Schwankung
  - AP mit aggressivem Client-Leerlauf-Timeout: Einige Router trennen Clients, die noch keinen Datenverkehr erzeugt haben
  - Kanalwechsel des Access Points waehrend der MQTT-TCP-Verbindungsaufbau noch laeuft
- **Evidenz:** Timestamps 6623ms (WiFi connected) vs. 15305ms (BEACON_TIMEOUT)

### 3.4 Kein WiFi-Event-Handler registriert

- **Schwere:** Mittel (Architektur-Limitation, kein direkter Bug)
- **Detail:** Eine vollstaendige Suche nach `WiFi.onEvent`, `onWiFiEvent`, `WiFiEvent`, `SYSTEM_EVENT` im gesamten `El Trabajante/src/`-Verzeichnis liefert null Treffer. Die Firmware registriert keinen asynchronen WiFi-Event-Handler. Disconnect-Erkennung erfolgt ausschliesslich polling-basiert in `WiFiManager::loop()` via `WiFi.status() != WL_CONNECTED`. Das hat zwei Konsequenzen:
  1. Zwischen Eintritt des physischen Disconnects (~15.3s) und Erkennung durch den naechsten `loop()`-Aufruf gibt es eine Latenz von bis zu einem Loop-Zyklus.
  2. Die Reason-Codes (200, 201) aus `WiFiGeneric.cpp:_eventCallback()` werden vom Arduino-Framework-internen Callback-Mechanismus ausgegeben — die eigene Firmware-Logik sieht diese Werte nicht. Sie erscheinen nur im Serial-Output weil das ESP-Arduino-Framework sie intern loggt.
- **Evidenz:** Kein `WiFi.onEvent`-Aufruf im gesamten `src/`-Verzeichnis gefunden.

### 3.5 AutoReconnect deaktiviert — bewusste Entscheidung

- **Schwere:** Info
- **Detail:** `WiFiManager::begin()` setzt explizit `WiFi.setAutoReconnect(false)`. Das ESP-IDF-interne Auto-Reconnect ist damit deaktiviert. Die Firmware uebernimmt den Reconnect vollstaendig selbst ueber `WiFiManager::reconnect()` mit exponentialem Backoff und Circuit Breaker. Das ist architektonisch korrekt. Die Konsequenz: Nach einem Disconnect wartet die Firmware `RECONNECT_INTERVAL_MS = 30.000ms` (30 Sekunden) bevor der erste Reconnect-Versuch erfolgt. In dieser Zeit sendet der ESP keine Heartbeats, und der Server markiert das Geraet als offline.
- **Relevante Code-Stellen:**
  - `wifi_manager.cpp:14` — `const unsigned long RECONNECT_INTERVAL_MS = 30000;`
  - `wifi_manager.cpp:59` — `WiFi.setAutoReconnect(false);`
  - `wifi_manager.cpp:273-296` — `shouldAttemptReconnect()` mit HALF_OPEN-Bypass-Fix

### 3.6 Circuit Breaker Konfiguration

- **Schwere:** Info
- **Detail:** WiFi-Circuit-Breaker ist konfiguriert mit 10 Failures → OPEN, 60s Recovery-Timeout, 15s HALF_OPEN-Timeout. MQTT-Circuit-Breaker: 5 Failures → OPEN, 30s Recovery, 10s HALF_OPEN. Bei einem einzelnen transienten Disconnect wird der Circuit Breaker noch nicht geoeffnet. Erst nach 10 aufeinanderfolgenden fehlgeschlagenen Reconnect-Versuchen greift die 60-Sekunden-Sperre.
- **Evidenz:** `wifi_manager.cpp:38` — `circuit_breaker_("WiFi", 10, 60000, 15000)`

### 3.7 MQTT-Verbindungsstand beim Disconnect unklar

- **Schwere:** Mittel
- **Detail:** Der bereitgestellte Log-Ausschnitt zeigt, dass der MQTT-Connect bei ~6.634s initiiert wurde (LWT-Topic und LWT-Message wurden gesetzt). Der tatsaechliche Abschluss des TCP-Handshakes und MQTT-CONNACK ist im Ausschnitt nicht sichtbar — der letzte sichtbare Eintrag ist das LWT-Message-Logging. Wenn MQTT bei Timestamp 15.305s bereits verbunden war, wird der TCP-Socket durch den WiFi-Disconnect ungueltig. `PubSubClient::connected()` liefert dann beim naechsten `mqtt_.loop()`-Aufruf `false`, und der MQTT-Reconnect startet. Das LWT wird vom Broker ausgeloest, und der Server markiert ESP_472204 als offline.
- **Evidenz:** Letzter sichtbarer MQTT-Eintrag: `[6655] Last-Will Message: {...}` — kein CONNACK-Eintrag im bereitgestellten Ausschnitt.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Suche nach WiFi-Event-Handler im Firmware-Code | Kein `WiFi.onEvent` registriert — Disconnect nur polling-basiert erkannt |
| `WiFi.setAutoReconnect` Status | `false` (wifi_manager.cpp:59) — manuelle Reconnect-Kontrolle aktiv |
| Reconnect-Intervall | 30.000ms (`RECONNECT_INTERVAL_MS`, wifi_manager.cpp:14) |
| WiFi Circuit Breaker Konfiguration | 10 Failures → OPEN, 60s Recovery, 15s HALF_OPEN |
| MQTT Circuit Breaker Konfiguration | 5 Failures → OPEN, 30s Recovery, 10s HALF_OPEN |
| Reconnect-Kette nach Disconnect | `loop()` → `handleDisconnection()` → `reconnect()` → `connectToNetwork()` — korrekt implementiert |
| HALF_OPEN-Bypass in `shouldAttemptReconnect()` | Vorhanden (wifi_manager.cpp:280-282) — Race Condition behoben |
| `logs/current/esp32_serial.log` | Datei nicht vorhanden — nur bereitgestellter Ausschnitt analysiert |

---

## 5. Bewertung & Empfehlung

### Root Cause

**Primaer Hardware/Umgebung:** Das 8,68-Sekunden-Stabilitaetsfenster ist zu kurz fuer einen Software-Bug in der Firmware. Die Reason-Codes 200 und 201 sind ESP-IDF-interne Signale auf PHY/MAC-Layer-Ebene — die Anwendungsschicht (Firmware) kann diese nicht verursachen. Wahrscheinliche Ursachen in absteigender Prioritaet:

1. **Schwaches WiFi-Signal am ESP-Standort** — ESP verbindet sich bei grenzwertigem RSSI, verliert die Verbindung bei minimaler Signalschwankung. Verifikation: `wifi_rssi`-Feld im naechsten Heartbeat-Payload pruefen. Werte unter -70 dBm sind kritisch, unter -80 dBm instabil.
2. **Access Point Kanalwechsel oder Band-Steering** — Router wechselt den 2,4-GHz-Kanal waehrend der Client verbunden ist, oder versucht den ESP auf 5 GHz zu steuern (was ESP32 nicht unterstuetzt).
3. **AP-seitiger Client-Inaktivitaets-Timeout** — Einige Consumer-Router trennen Clients, die innerhalb eines kurzen Fensters nach der Verbindung noch keinen Datenverkehr erzeugt haben.
4. **HF-Interferenz** — Kurzzeitige Blockierung durch benachbarte 2,4-GHz-Netzwerke oder Bluetooth-Devices.

**Sekundaer Firmware-Architektur (kein Bug, aber Verbesserungspotenzial):**
- Kein asynchroner WiFi-Event-Handler: Disconnect-Erkennung hat Latenz bis zum naechsten `loop()`-Zyklus.
- 30-Sekunden-Reconnect-Wartezeit erzeugt ein grosses Offline-Fenster bei transienten Disconnects.

### Naechste Schritte

1. **RSSI-Wert pruefen:** Beim naechsten Boot den `wifi_rssi`-Wert aus dem Heartbeat-Payload ablesen:
   ```bash
   mosquitto_sub -t "kaiser/god/esp/ESP_472204/system/heartbeat" -v -C 1 -W 15
   ```
   Liegt der Wert unter -70 dBm, ist der ESP-Standort das Problem.

2. **Vollstaendiges Serial-Log erfassen:** Ein 60-Sekunden-Capture nach dem Disconnect zeigt die WiFi-Reconnect-Versuche und eventuelle Circuit-Breaker-Events:
   ```bash
   cd "El Trabajante" && timeout 60 /c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe device monitor -e esp32_dev 2>&1 | tee /tmp/serial_capture.log
   ```

3. **AP-Konfiguration pruefen:** Im Router-Interface sicherstellen, dass:
   - Kein Auto-Kanal-Wechsel aktiv ist (fixen auf Kanal 1, 6 oder 11)
   - Client-Leerlauf-Timeout deaktiviert oder auf mindestens 60 Sekunden gesetzt
   - Band-Steering deaktiviert (falls Router 5 GHz hat)

4. **Optional — Reconnect-Intervall reduzieren:** `RECONNECT_INTERVAL_MS` in `wifi_manager.cpp:14` von 30s auf 10s senken. Reduziert das Offline-Fenster bei transienten Disconnects erheblich ohne den Circuit-Breaker-Schutz zu beeintraechtigen.

5. **Optional — WiFi-Event-Handler hinzufuegen:** Ein `WiFi.onEvent`-Callback koennte den Reconnect sofort beim Disconnect-Event triggern und Reason-Codes in die Heartbeat-Diagnostik einschreiben.

---

## 6. Firmware-Code-Referenz

| Datei | Zeile | Relevanz |
|-------|-------|----------|
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 14 | `RECONNECT_INTERVAL_MS = 30000` |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 38 | Circuit Breaker: 10 failures, 60s recovery |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 59 | `WiFi.setAutoReconnect(false)` |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 245-253 | `loop()` — polling-basierte Disconnect-Erkennung |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 256-271 | `handleDisconnection()` → `reconnect()` |
| `El Trabajante/src/services/communication/wifi_manager.cpp` | 273-296 | `shouldAttemptReconnect()` mit HALF_OPEN-Fix |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | 59 | MQTT Circuit Breaker: 5 failures, 30s recovery |
| `El Trabajante/src/services/communication/mqtt_client.cpp` | 789-807 | `MQTTClient::loop()` — MQTT-Reconnect-Trigger |
| `El Trabajante/src/main.cpp` | 2447 | `wifiManager.loop()` im Haupt-Loop |
