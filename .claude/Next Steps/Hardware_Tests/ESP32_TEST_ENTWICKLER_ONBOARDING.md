# ESP32 Real-Hardware Test Plan

**Version:** 1.3
**Erstellt:** 2026-01-20
**Letzte Änderung:** 2026-01-20 (Test-Durchlauf 1 dokumentiert, Bugs gefixt)
**Zweck:** Systematischer Testplan für ESP32 DevKit mit DS18B20 Runtime-Konfiguration
**Workflow:** Manager teilt Logs → KI-Assistent analysiert → Gemeinsame Bewertung

> **⚠️ Änderungen in v1.3 (Test-Durchlauf 1):**
> - **Phase 0 & 1 durchgeführt und dokumentiert** mit ESP_D0B19C
> - **Bug T gefunden & gefixt:** Pending Devices zeigten `discovered_at` statt `last_seen`
> - **Bug U gefunden & gefixt:** WebSocket Events sendeten `esp_id` statt `device_id`
> - **Provisioning Portal Workflow** dokumentiert (WiFi-Konfiguration via AP)
> - **NVS-Fehler** dokumentiert (`subzone_config` Namespace nicht vorhanden)
> - **WiFi-Signalstärke** als kritischer Faktor identifiziert (< -80 dBm problematisch)
>
> **Änderungen in v1.2:**
> - **ALLE Befehle für Windows korrigiert** (volle Pfade statt PATH-abhängig)
> - `pio` → `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe`
> - `mosquitto_sub/pub` → `"C:\Program Files\mosquitto\mosquitto_sub.exe"`
> - `tail -f` → PowerShell `Get-Content ... -Wait -Tail`
> - `tail | grep` → PowerShell `Get-Content ... | Select-String`
> - Admin-Hinweise für `net start/stop mosquitto`
> - Mosquitto Service-Check Befehl hinzugefügt
>
> **Änderungen in v1.1:**
> - WiFi-Konfiguration (Section 0.2) hinzugefügt
> - **Config-Payload-Format korrigiert** (kritisch!): `sensor_type` statt `type`, `sensor_name` required, `measurement_interval_seconds` statt `interval`
> - Heartbeat-Payload mit korrekten Feldern (`uptime` statt `uptime_seconds`, `gpio_status` Array)
> - GPIO Safe-Mode Logs aus tatsächlichem Code
> - Config-Response Topic dokumentiert
> - Alle MQTT-Befehle in Anhang B korrigiert

---

## 0. QUICK START - Alle Befehle und Pfade

### 0.1 Projekt-Basispfad
```
C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one
```

### 0.2 WiFi-Konfiguration (VOR dem Flashen prüfen!)

**Datei:** `El Trabajante/platformio.ini`

Prüfe dass WiFi-Credentials korrekt sind:
```ini
build_flags =
    -DWIFI_SSID=\"DeinSSID\"
    -DWIFI_PASSWORD=\"DeinPasswort\"
    -DMQTT_HOST=\"192.168.1.100\"  ; IP des Servers
```

**Alternativ:** Credentials in `.env` Datei (falls konfiguriert).

---

### 0.3 Services starten (4 Terminals)

**Terminal 1: Mosquitto MQTT Broker**

*Prüfen ob Mosquitto bereits läuft:*
```cmd
netstat -ano | findstr 1883
```
Falls Port 1883 belegt → Mosquitto läuft bereits als Service, kein weiterer Start nötig.

*Manuell starten (falls nicht als Service):*
```cmd
cd "C:\Program Files\mosquitto"
mosquitto -v
```

*Als Windows-Service starten (Admin-CMD erforderlich!):*
```cmd
net start mosquitto
```

**Terminal 2: God-Kaiser Server**
```cmd
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

**Terminal 3: Frontend (Vue.js)**
```cmd
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npm run dev
```

**Terminal 4: ESP32 Serial Monitor**
```cmd
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
%USERPROFILE%\.platformio\penv\Scripts\platformio.exe device monitor
```
*Hinweis: Baud-Rate (115200) wird aus `platformio.ini` gelesen.*

### 0.4 ESP32 flashen
```cmd
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
%USERPROFILE%\.platformio\penv\Scripts\platformio.exe run -e esp32_dev -t upload
```

### 0.5 MQTT Traffic beobachten (separates Terminal)
```cmd
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -p 1883 -t "kaiser/#" -v
```

### 0.6 Log-Dateien

| Komponente | Log-Datei/Ausgabe | Zugriff (Windows) |
|------------|-------------------|-------------------|
| **ESP32** | Serial Monitor (UART) | Terminal 4 oder PlatformIO |
| **Server** | `El Servador/god_kaiser_server/logs/god_kaiser.log` | PowerShell: `Get-Content ... -Wait -Tail 50` |
| **Mosquitto** | `C:\Program Files\mosquitto\mosquitto.log` | Falls logging aktiviert |
| **Frontend** | Browser DevTools (F12 → Console) | Chrome/Firefox |

**Server-Log live verfolgen (PowerShell):**
```powershell
Get-Content "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait -Tail 50
```

### 0.7 Mosquitto Logging aktivieren (falls nicht aktiv)

**Datei:** `C:\Program Files\mosquitto\mosquitto.conf`
```conf
# Am Ende hinzufügen:
log_dest file C:/Program Files/mosquitto/mosquitto.log
log_type all
connection_messages true
```

**Neustart (Admin-CMD erforderlich!):**
```cmd
:: CMD als Administrator ausführen!
net stop mosquitto
net start mosquitto
```

---

## 1. TEST-ROLLEN

### 1.1 Manager (Du)
- Startet alle Services
- Flasht ESP32
- Beobachtet Live-Outputs
- Kopiert relevante Logs und teilt sie im Chat
- Führt physische Aktionen aus (Hardware anschließen, Reset drücken)
- Entscheidet über Pass/Fail

### 1.2 KI-Assistent (Claude)
- Analysiert geteilte Logs
- Identifiziert Fehler und Anomalien
- Erklärt erwartetes vs. tatsächliches Verhalten
- Schlägt nächste Schritte vor
- Dokumentiert Ergebnisse
- **Codet NICHT** - nur Analyse und Anleitung

---

## 2. HARDWARE-SETUP

### 2.1 Benötigte Komponenten

| Komponente | Spezifikation | Status |
|------------|---------------|--------|
| ESP32 DevKit V1 | ESP32-WROOM-32 | ☐ Bereit |
| DS18B20 | Wasserdicht oder TO-92 | ☐ Bereit |
| Pull-up Widerstand | 4.7kΩ | ☐ Bereit |
| Breadboard | Standard | ☐ Bereit |
| Jumper-Kabel | M-M oder M-F | ☐ Bereit |

### 2.2 Verkabelung DS18B20 (für spätere Phasen)

```
ESP32 DevKit          DS18B20
─────────────         ────────
3.3V ──────────────── VCC (rot)
GND  ──────────────── GND (schwarz)
GPIO 4 ─────┬──────── DATA (gelb)
            │
           [4.7kΩ]
            │
3.3V ───────┘
```

**WICHTIG:** DS18B20 wird erst in Phase 3 angeschlossen!

---

## PHASE 0: Serial-Output Baseline

**Ziel:** Verifizieren dass ESP32 sauber bootet und alle Log-Messages verständlich, vollständig und nicht-spammig sind.

### Phase 0.1: Frischer Boot ohne Hardware

**Voraussetzungen:**
- [x] ESP32 frisch geflasht (NVS gelöscht oder neuer Flash)
- [x] Mosquitto läuft
- [x] Server läuft
- [x] Serial Monitor offen

**Aktion:**
1. ESP32 flashen: `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe run -e esp32_dev -t upload`
2. Serial Monitor starten: `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe device monitor`
3. **Ersten 60 Sekunden** Serial-Output sammeln

**⚠️ PROVISIONING PORTAL (bei fehlendem/falschem WiFi):**

Falls WiFi fehlschlägt (AUTH_EXPIRE, Credentials falsch), startet ESP automatisch einen Access Point:
```
[WARNING] WiFi connection failed: AUTH_EXPIRE
[INFO] ╔════════════════════════════════════════╗
[INFO] ║   PROVISIONING PORTAL ACTIVE           ║
[INFO] ╚════════════════════════════════════════╝
[INFO] Connect to WiFi: AutoOne-ESP_XXXXXX
[INFO] Password: provision
[INFO] Portal IP: 192.168.4.1
```

**Provisioning-Workflow:**
1. Mit Handy/PC zu AP `AutoOne-ESP_XXXXXX` verbinden (PW: `provision`)
2. Browser öffnen → `192.168.4.1`
3. WiFi-SSID und Passwort eingeben
4. ESP speichert Credentials in NVS und bootet neu

**Erwartete Serial-Ausgabe (Boot-Sequenz):**

```
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
Chip Model: ESP32-D0WDQ6 (oder ähnlich)
CPU Frequency: 240 MHz
Free Heap: XXXXX bytes

=== GPIO SAFE-MODE INITIALIZATION ===
Board Type: ESP32_DEV_BOARD
[DEBUG] GPIO X: Safe-Mode (INPUT_PULLUP)  (mehrfach)
[INFO] I2C pins auto-reserved (SDA: GPIO 21, SCL: GPIO 22)
[INFO] All pins successfully set to Safe-Mode
[INFO] Board: ESP32_DEV_BOARD
[INFO] Available Pins: XX
[INFO] Reserved Pins: XX
[INFO] GPIOManager: Safe-Mode initialization complete

╔════════════════════════════════════════╗
║   Phase 1: Core Infrastructure READY  ║
╚════════════════════════════════════════╝

[INFO] Connecting to WiFi: <SSID>
[INFO] WiFi connected. IP: X.X.X.X
[INFO] Connecting to MQTT broker...
[INFO] MQTT connected successfully
[INFO] Initial heartbeat sent for ESP registration
[INFO] Subscribed to system + actuator + zone + subzone + sensor + heartbeat-ack topics

╔════════════════════════════════════════╗
║   Phase 2: Communication Layer READY  ║
╚════════════════════════════════════════╝

(Phase 3-5 analog mit jeweiligen READY-Bannern)
```

**Wichtig:** Die ESP-ID (`ESP_XXXXXXXX`) wird beim ersten Boot generiert und im Serial-Output angezeigt. **Notiere dir diese ID!** Du brauchst sie für MQTT-Befehle.

**Checkliste für Serial-Output:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 0.1.1 | Banner erscheint | `ESP32 Sensor Network v4.0` | ✅ Pass |
| 0.1.2 | Chip-Info geloggt | Model, Frequency, Heap | ✅ Pass |
| 0.1.3 | GPIO Safe-Mode | `GPIO SAFE-MODE INITIALIZATION` | ✅ Pass |
| 0.1.4 | Phase 1 READY | Banner sichtbar | ✅ Pass |
| 0.1.5 | WiFi Verbindung | `WiFi connected successfully` | ✅ Pass (via Provisioning) |
| 0.1.6 | MQTT Verbindung | `MQTT connected successfully` | ✅ Pass |
| 0.1.7 | Subscriptions | Mindestens 5 `Subscribed to:` | ✅ Pass |
| 0.1.8 | Initial Heartbeat | `heartbeat sent` | ✅ Pass |
| 0.1.9 | Phase 2 READY | Banner sichtbar | ✅ Pass |
| 0.1.10 | Phase 3 READY | Banner sichtbar | ✅ Pass |
| 0.1.11 | Phase 4 READY | Banner sichtbar | ✅ Pass |
| 0.1.12 | Phase 5 READY | Banner sichtbar | ✅ Pass |
| 0.1.13 | Kein Spam | Keine sich wiederholenden Messages in <5s | ✅ Pass |
| 0.1.14 | Keine Errors | Kein `[ERROR]` oder `[CRITICAL]` | ⚠️ Minor (siehe unten) |

**Test-Durchlauf 1 (2026-01-20):**
- **ESP-ID:** `ESP_D0B19C`
- **IP:** `192.168.1.195`
- **WiFi:** Via Provisioning Portal konfiguriert (initialer AUTH_EXPIRE)
- **Minor Issue:** `nvs_open failed: NOT_FOUND` für `subzone_config` Namespace (nicht kritisch, Namespace existiert noch nicht)

**Manager-Aktion:** Kopiere den kompletten Serial-Output der ersten 60 Sekunden und teile ihn im Chat.

---

### Phase 0.2: Heartbeat-Zyklus verifizieren

**Ziel:** Heartbeat wird alle 60 Sekunden gesendet und ist im MQTT sichtbar.

**Aktion:**
1. MQTT-Monitor starten:
   ```cmd
   "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v
   ```
2. **2-3 Minuten** warten
3. Heartbeat-Messages sammeln

**Erwartetes Heartbeat-Payload:**
```json
{
  "esp_id": "ESP_XXXXXXXX",
  "zone_id": "",
  "master_zone_id": "",
  "zone_assigned": false,
  "ts": 1737000000,
  "uptime": 120,
  "heap_free": 123456,
  "wifi_rssi": -45,
  "sensor_count": 0,
  "actuator_count": 0,
  "gpio_status": [],
  "gpio_reserved_count": 2,
  "config_status": { ... }
}
```
**Hinweis:** Das Payload enthält mehr Felder als hier gezeigt. Wichtig sind `esp_id`, `heap_free`, `sensor_count`.

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 0.2.1 | Heartbeat erscheint | Alle ~60 Sekunden | ✅ Pass |
| 0.2.2 | ESP-ID korrekt | Format `ESP_XXXXXXXX` (6-8 Hex) | ✅ Pass (`ESP_D0B19C`) |
| 0.2.3 | heap_free vorhanden | Wert > 50000 | ✅ Pass |
| 0.2.4 | sensor_count | `0` (noch keine Sensoren) | ✅ Pass |
| 0.2.5 | ts (Timestamp) | Unix-Timestamp (nicht 0) | ✅ Pass |
| 0.2.6 | uptime vorhanden | Sekunden seit Boot | ✅ Pass |

**Test-Durchlauf 1 (2026-01-20):**
- Heartbeats alle 60s empfangen
- Server sendet Heartbeat-ACK zurück
- ESP loggt `MQTT message received: kaiser/god/esp/ESP_D0B19C/system/heartbeat/ack`

**Manager-Aktion:** Teile 2-3 Heartbeat-Messages aus MQTT.

---

### Phase 0.3: Server-Empfang verifizieren

**Ziel:** Server empfängt und verarbeitet Heartbeat korrekt.

**Aktion:**
1. Server-Log beobachten (PowerShell):
   ```powershell
   Get-Content "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait -Tail 50
   ```
2. Nach Heartbeat-Verarbeitung suchen

**Erwartete Server-Log-Einträge:**
```
{"level": "INFO", "message": "Heartbeat received from ESP_XXXXXXXX", ...}
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 0.3.1 | Heartbeat empfangen | Log-Eintrag vorhanden | ☐ Pass ☐ Fail |
| 0.3.2 | ESP erkannt | Korrekte ESP-ID im Log | ☐ Pass ☐ Fail |
| 0.3.3 | Keine Fehler | Kein `ERROR` in Verbindung mit Heartbeat | ☐ Pass ☐ Fail |

**Manager-Aktion:** Teile relevante Server-Log-Zeilen.

---

## PHASE 1: Pending-Approval Flow

**Ziel:** Verifizieren dass der Pending-Approval-Mechanismus funktioniert.

### Phase 1.1: ESP-Status im Frontend prüfen

**Voraussetzungen:**
- [x] Frontend läuft (http://localhost:5173 oder :3000)
- [x] ESP sendet Heartbeats

**Aktion:**
1. Frontend öffnen
2. Zu ESP-Geräte-Übersicht navigieren
3. ESP-Status prüfen

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 1.1.1 | ESP sichtbar | In Geräteliste vorhanden | ✅ Pass |
| 1.1.2 | Status angezeigt | `Pending` oder `Approved` | ✅ Pass (Pending → Approved) |
| 1.1.3 | Online-Indikator | Grün/Online wenn Heartbeat < 120s | ✅ Pass |

**Test-Durchlauf 1 (2026-01-20):**
- ESP_D0B19C erschien in "Pending Devices" Panel
- **Bug T gefunden:** Zeit zeigte "vor 2 Tagen" statt aktuellem Zeitstempel → **GEFIXT** (siehe Section 6.2)

**Manager-Aktion:** Screenshot oder Beschreibung des Frontend-Zustands.

---

### Phase 1.2: ESP Approval durchführen (falls Pending)

**Aktion (falls Status = Pending):**
1. Im Frontend auf ESP klicken
2. "Approve" Button drücken
3. Serial-Monitor beobachten

**Erwartete Reaktion auf ESP:**
```
[INFO] ╔════════════════════════════════════════╗
[INFO] ║   DEVICE APPROVED BY SERVER            ║
[INFO] ╚════════════════════════════════════════╝
[INFO] Transitioning from PENDING_APPROVAL to OPERATIONAL
[INFO] ConfigManager: Device approval saved (approved=true, ts=XXXXXXXXXX)
[INFO]   → Sensors/Actuators now ENABLED
[INFO]   → Full operational mode active
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 1.2.1 | Approval im Frontend | Button funktioniert | ✅ Pass |
| 1.2.2 | ESP empfängt ACK | Serial zeigt `approved=true` | ✅ Pass |
| 1.2.3 | State-Transition | `OPERATIONAL` erreicht | ✅ Pass |
| 1.2.4 | NVS gespeichert | Bleibt nach Reboot approved | ✅ Pass |

**Test-Durchlauf 1 (2026-01-20):**
- Approved by User "Robin"
- ESP empfing ACK via `kaiser/god/esp/ESP_D0B19C/system/heartbeat/ack`
- State-Transition: `PENDING_APPROVAL → OPERATIONAL`
- Config gespeichert: `approved=true, ts=1768879909`
- Boot counter reset ("stable operation confirmed")

**Manager-Aktion:** Teile Serial-Output nach Approval.

---

### Phase 1.3: Approval-Persistenz testen

**Aktion:**
1. ESP Reset drücken (oder Strom aus/ein)
2. Boot-Sequenz beobachten
3. Prüfen ob ESP direkt OPERATIONAL wird

**Erwartung:** ESP sollte nach Boot direkt `OPERATIONAL` sein (nicht `PENDING_APPROVAL`).

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 1.3.1 | Boot nach Reset | Normale Boot-Sequenz | ☐ Pass ☐ Fail |
| 1.3.2 | Direkter OPERATIONAL | Kein PENDING_APPROVAL | ☐ Pass ☐ Fail |
| 1.3.3 | NVS-Load erfolgreich | `Config loaded from NVS` | ☐ Pass ☐ Fail |

---

## PHASE 2: GPIO Manager & Safe-Mode Verifikation

**Ziel:** GPIO Manager arbeitet korrekt, Safe-Mode schützt Hardware.

### Phase 2.1: Safe-Mode bei Boot

**Bereits in Phase 0 geprüft, hier Detail-Analyse:**

**Erwartete Log-Sequenz (aus gpio_manager.cpp):**
```
=== GPIO SAFE-MODE INITIALIZATION ===
Board Type: ESP32_DEV_BOARD
[DEBUG] GPIO 2: Safe-Mode (INPUT_PULLUP)
[DEBUG] GPIO 4: Safe-Mode (INPUT_PULLUP)
... (weitere GPIOs)
[INFO] I2C pins auto-reserved (SDA: GPIO 21, SCL: GPIO 22)
[INFO] All pins successfully set to Safe-Mode
[INFO] Board: ESP32_DEV_BOARD
[INFO] Available Pins: XX
[INFO] Reserved Pins: XX
[INFO] GPIOManager: Safe-Mode initialization complete
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 2.1.1 | Board-Typ erkannt | `ESP32_DEV_BOARD` | ☐ Pass ☐ Fail |
| 2.1.2 | I2C auto-reserviert | `I2C pins auto-reserved` | ☐ Pass ☐ Fail |
| 2.1.3 | Safe-Mode complete | `Safe-Mode initialization complete` | ☐ Pass ☐ Fail |
| 2.1.4 | Keine GPIO-Errors | Kein `[ERROR]` bei GPIO | ☐ Pass ☐ Fail |

---

### Phase 2.2: Pin-Availability Check

**Aktion:** Später bei Sensor-Konfiguration (Phase 3) wird GPIO 4 angefordert. Hier dokumentieren wir erwartetes Verhalten.

**Erwartung bei Pin-Request:**
```
[DEBUG] Pin 4 availability check: available=true
[INFO] Pin 4 reserved for: OneWire/DS18B20
```

---

## PHASE 3: DS18B20 Runtime-Konfiguration

**Ziel:** DS18B20 Sensor über MQTT zur Laufzeit hinzufügen und Daten empfangen.

### Phase 3.1: Hardware anschließen

**JETZT Hardware anschließen!**

**Aktion:**
1. ESP32 ausschalten (USB trennen)
2. DS18B20 nach Schema in Sektion 2.2 verkabeln
3. Verkabelung prüfen (VCC=3.3V, GND=GND, DATA=GPIO4, Pull-up)
4. USB wieder anschließen
5. Serial Monitor starten

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 3.1.1 | Verkabelung korrekt | Dreifach geprüft | ☐ Pass ☐ Fail |
| 3.1.2 | Pull-up vorhanden | 4.7kΩ zwischen DATA und 3.3V | ☐ Pass ☐ Fail |
| 3.1.3 | ESP bootet normal | Keine Hardware-Fehler | ☐ Pass ☐ Fail |

---

### Phase 3.2: Sensor via MQTT konfigurieren

**Aktion:**
1. MQTT-Befehl senden um DS18B20 zu konfigurieren

**⚠️ WICHTIGES CONFIG-FORMAT (aus Code verifiziert):**

Das Config-Payload hat ein **spezifisches Format**. Folgende Felder sind **REQUIRED**:
- `gpio` (integer) - GPIO-Pin
- `sensor_type` (string) - Sensortyp (z.B. "DS18B20")
- `sensor_name` (string) - Eindeutiger Name für den Sensor

Optionale Felder:
- `active` (bool, default: true) - Sensor aktiv/inaktiv
- `raw_mode` (bool, default: true) - Rohdaten-Modus
- `measurement_interval_seconds` (int, default: 30, range: 1-300) - Messintervall in **Sekunden**
- `operating_mode` (string: "continuous"|"on_demand"|"paused"|"scheduled", default: "continuous")

**MQTT-Befehl (manuell in CMD):**
```cmd
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -p 1883 -t "kaiser/god/esp/<ESP_ID>/config" -m "{\"sensors\":[{\"gpio\":4,\"sensor_type\":\"DS18B20\",\"sensor_name\":\"Temp_Sensor_1\",\"measurement_interval_seconds\":5,\"active\":true}]}"
```

**⚠️ WICHTIG:**
- `<ESP_ID>` durch tatsächliche ESP-ID ersetzen (z.B. `ESP_A1B2C3D4`)
- `sensor_type` NICHT `type`!
- `active` NICHT `enabled`!
- Intervall in **Sekunden** (5), NICHT Millisekunden!

**Erwartete Serial-Ausgabe:**
```
[INFO] MQTT message received: kaiser/god/esp/ESP_XXXXXXXX/config
[INFO] Handling sensor configuration from MQTT
[DEBUG] Sensor GPIO 4 config: mode=continuous, interval=5s
[INFO] Sensor configured successfully on GPIO 4
```

**Config-Response auf MQTT (Topic: `kaiser/god/esp/<ESP_ID>/config_response`):**
```json
{
  "type": "sensor",
  "status": "success",
  "success_count": 1,
  "fail_count": 0,
  "failures": []
}
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 3.2.1 | Config empfangen | `MQTT message received` | ☐ Pass ☐ Fail |
| 3.2.2 | Handler aufgerufen | `Handling sensor configuration` | ☐ Pass ☐ Fail |
| 3.2.3 | Sensor konfiguriert | `Sensor configured successfully` | ☐ Pass ☐ Fail |
| 3.2.4 | Config-Response | Auf `config_response` Topic | ☐ Pass ☐ Fail |
| 3.2.5 | success_count = 1 | Im Response JSON | ☐ Pass ☐ Fail |
| 3.2.6 | Kein Fehler | Kein `[ERROR]` im Serial | ☐ Pass ☐ Fail |

**Manager-Aktion:**
1. Teile Serial-Output nach Config-Befehl
2. Prüfe `config_response` Topic:
   ```cmd
   "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/config_response" -v
   ```

---

### Phase 3.3: Sensor-Daten verifizieren

**Aktion:**
1. MQTT-Monitor auf Sensor-Daten:
   ```cmd
   "C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/sensor/4/data" -v
   ```
2. 30 Sekunden warten
3. Daten sammeln

**Erwartetes Sensor-Payload (Topic: `kaiser/god/esp/<ESP_ID>/sensor/4/data`):**
```json
{
  "ts": 1737000060,
  "gpio": 4,
  "value": 23.5,
  "raw_mode": true
}
```
**Hinweis:** `sensor_type` ist NICHT im Payload enthalten - der Server kennt den Typ aus der Config.

**Erwartete Serial-Ausgabe (alle 5 Sekunden):**
```
[DEBUG] SensorManager: Reading sensor on GPIO 4
[INFO] Sensor data published: GPIO 4
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 3.3.1 | Daten auf MQTT | Payload alle ~5s | ☐ Pass ☐ Fail |
| 3.3.2 | Temperatur plausibel | 15-35°C (Raumtemperatur) | ☐ Pass ☐ Fail |
| 3.3.3 | GPIO korrekt | `gpio: 4` | ☐ Pass ☐ Fail |
| 3.3.4 | raw_mode gesetzt | `raw_mode: true` | ☐ Pass ☐ Fail |
| 3.3.5 | Kein Spam | Nicht häufiger als Intervall | ☐ Pass ☐ Fail |
| 3.3.6 | Serial-Log sauber | Nur bei Read, nicht kontinuierlich | ☐ Pass ☐ Fail |

**Manager-Aktion:** Teile 3-5 Sensor-Payloads aus MQTT.

---

### Phase 3.4: Server-Empfang verifizieren

**Aktion:**
1. Server-Log prüfen (PowerShell):
   ```powershell
   Get-Content "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server\logs\god_kaiser.log" -Wait -Tail 100 | Select-String -Pattern "sensor"
   ```

**Erwartete Log-Einträge:**
```json
{"level": "INFO", "message": "Sensor data received", "esp_id": "ESP_XXXXXXXX", "gpio": 4, "value": 23.5}
{"level": "INFO", "message": "Sensor data stored", "esp_id": "ESP_XXXXXXXX", "gpio": 4}
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 3.4.1 | Server empfängt | `Sensor data received` | ☐ Pass ☐ Fail |
| 3.4.2 | Daten gespeichert | `Sensor data stored` | ☐ Pass ☐ Fail |
| 3.4.3 | Keine Validierungsfehler | Kein `ERROR` bei Sensor | ☐ Pass ☐ Fail |

---

### Phase 3.5: Frontend-Anzeige verifizieren

**Aktion:**
1. Frontend öffnen
2. Zu ESP-Detail oder Dashboard navigieren
3. Sensor-Werte prüfen

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 3.5.1 | Sensor sichtbar | DS18B20 auf GPIO 4 angezeigt | ☐ Pass ☐ Fail |
| 3.5.2 | Live-Wert | Temperatur wird angezeigt | ☐ Pass ☐ Fail |
| 3.5.3 | Updates | Wert ändert sich bei Refresh | ☐ Pass ☐ Fail |

---

## PHASE 4: Fehlerszenarien testen

### Phase 4.1: Sensor-Disconnect simulieren

**Aktion:**
1. DS18B20 DATA-Kabel abziehen (während ESP läuft)
2. Serial-Monitor beobachten
3. MQTT beobachten

**Erwartete Reaktion:**
```
[WARNING] DS18B20 read failed on GPIO 4
[WARNING] Sensor read error: ERROR_SENSOR_READ_FAILED (1040)
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 4.1.1 | Error erkannt | `read failed` geloggt | ☐ Pass ☐ Fail |
| 4.1.2 | Error-Code korrekt | `1040` oder ähnlich | ☐ Pass ☐ Fail |
| 4.1.3 | Kein Crash | ESP läuft weiter | ☐ Pass ☐ Fail |
| 4.1.4 | Kein Spam | Nicht jede Sekunde Fehler | ☐ Pass ☐ Fail |

---

### Phase 4.2: Sensor wieder verbinden

**Aktion:**
1. DS18B20 DATA-Kabel wieder anstecken
2. Serial-Monitor beobachten

**Erwartete Reaktion:**
```
[INFO] DS18B20 reconnected on GPIO 4
[INFO] Sensor data published: GPIO=4, Value=23.5
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 4.2.1 | Auto-Recovery | Daten fließen wieder | ☐ Pass ☐ Fail |
| 4.2.2 | Keine Neukonfiguration | Kein erneuter Config-Befehl nötig | ☐ Pass ☐ Fail |

---

### Phase 4.3: Ungültige Konfiguration senden

**Aktion:**
1. Ungültigen GPIO versuchen (z.B. GPIO 6 = Flash-Pin)

**MQTT-Befehl:**
```cmd
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "kaiser/god/esp/<ESP_ID>/config" -m "{\"sensors\":[{\"gpio\":6,\"sensor_type\":\"DS18B20\",\"sensor_name\":\"Invalid_Test\",\"active\":true}]}"
```

**Erwartete Reaktion (Serial):**
```
[INFO] Handling sensor configuration from MQTT
[ERROR] GPIOManager: Attempted to request reserved pin 6
[ERROR] Sensor validation failed for GPIO 6
```

**Erwartete Config-Response (MQTT `config_response` Topic):**
```json
{
  "type": "sensor",
  "status": "partial_failure",
  "success_count": 0,
  "fail_count": 1,
  "failures": [{
    "type": "sensor",
    "gpio": 6,
    "error_code": 1002,
    "error_name": "GPIO_CONFLICT",
    "detail": "GPIO 6 reserved by system"
  }]
}
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 4.3.1 | GPIO abgelehnt | `reserved` Error | ☐ Pass ☐ Fail |
| 4.3.2 | Error-Code korrekt | `1001` oder `1002` | ☐ Pass ☐ Fail |
| 4.3.3 | Kein Crash | ESP stabil | ☐ Pass ☐ Fail |
| 4.3.4 | Bestehender Sensor OK | GPIO 4 funktioniert weiter | ☐ Pass ☐ Fail |

---

## PHASE 5: Config-Persistenz

### Phase 5.1: Sensor-Config in NVS speichern

**Aktion:**
1. ESP Reset (Power-Cycle)
2. Boot beobachten
3. Prüfen ob DS18B20 automatisch wieder konfiguriert wird

**Erwartete Boot-Sequenz (nach Reset):**
```
[INFO] Loading configuration from NVS...
[INFO] Found 1 saved sensor(s)
[INFO] Restoring sensor: GPIO=4, Type=DS18B20
[INFO] DS18B20 configured on GPIO 4
```

**Checkliste:**

| # | Prüfpunkt | Erwartet | Status |
|---|-----------|----------|--------|
| 5.1.1 | Config geladen | `Loading configuration from NVS` | ☐ Pass ☐ Fail |
| 5.1.2 | Sensor wiederhergestellt | `Restoring sensor` | ☐ Pass ☐ Fail |
| 5.1.3 | Daten fließen | Ohne erneuten MQTT-Befehl | ☐ Pass ☐ Fail |

---

## PHASE 6: Abschluss-Dokumentation

### 6.1 Test-Zusammenfassung

**Gesamtergebnis (Test-Durchlauf 1, 2026-01-20):**

| Phase | Status | Anmerkungen |
|-------|--------|-------------|
| Phase 0: Serial Baseline | ✅ Pass | Via Provisioning Portal, alle Checks OK |
| Phase 1: Pending-Approval | ✅ Pass | Approved by "Robin", State-Transition OK |
| Phase 2: GPIO Safe-Mode | ☐ Pending | Noch nicht getestet |
| Phase 3: DS18B20 Config | ☐ Pending | Noch nicht getestet |
| Phase 4: Fehlerszenarien | ☐ Pending | Noch nicht getestet |
| Phase 5: NVS-Persistenz | ☐ Pending | Noch nicht getestet |

**Test-Gerät:** ESP_D0B19C (ESP32-WROOM-32, IP: 192.168.1.195)

### 6.2 Gefundene Issues

| # | Bug-ID | Phase | Beschreibung | Severity | Status |
|---|--------|-------|--------------|----------|--------|
| 1 | **Bug T** | 1.1 | Pending Devices zeigten `discovered_at` statt `last_seen` ("vor 2 Tagen" statt "Gerade eben") | Medium | ✅ Fixed |
| 2 | **Bug U** | 1.2 | WebSocket `device_approved` Event sendete `esp_id` statt `device_id` | Medium | ✅ Fixed |
| 3 | **Bug V** | 0.1 | NVS Error-Spam: `subzone_config` Namespace nicht vorhanden | Low | ☐ Open |
| 4 | - | 1.2 | WiFi-Signal < -80 dBm verursacht BEACON_TIMEOUT und MQTT-Disconnects | Info | - |

**Bug T Details (FIXED):**
- **Problem:** `PendingDevicesPanel.vue` zeigte `discovered_at` (wann erstmals entdeckt) statt `last_seen` (letzter Heartbeat)
- **Fix:**
  - Server: `last_seen` Feld zu `PendingESPDevice` Schema hinzugefügt ([esp.py:1122-1125](El Servador/god_kaiser_server/src/schemas/esp.py#L1122-L1125))
  - Server: API Endpoint gibt jetzt `last_seen=device.last_seen` zurück ([esp.py](El Servador/god_kaiser_server/src/api/v1/esp.py))
  - Frontend: Zeigt `last_seen || discovered_at` ([PendingDevicesPanel.vue](El Frontend/src/components/esp/PendingDevicesPanel.vue))
  - Types: `last_seen` zu TypeScript Interface hinzugefügt ([types/index.ts](El Frontend/src/types/index.ts))

**Bug U Details (FIXED):**
- **Problem:** WebSocket Broadcast für `device_approved` und `device_rejected` Events sendete `esp_id` statt `device_id`
- **Frontend erwartete:** `{ device_id: "...", approved_by: "...", status: "approved" }`
- **Server sendete:** `{ esp_id: "...", approved_by: "..." }` (ohne `status`)
- **Fix:** Server Broadcasts korrigiert ([esp.py:1205-1210, 1286-1291](El Servador/god_kaiser_server/src/api/v1/esp.py#L1205-L1210))

**Bug V Details (OPEN - Low Priority):**
- **Problem:** Jeder Heartbeat loggt `nvs_open failed: NOT_FOUND` für `subzone_config`
- **Ursache:** Namespace existiert noch nicht auf frischem Device
- **Impact:** Nur Log-Spam, keine funktionale Beeinträchtigung
- **Empfehlung:** Graceful handling (Namespace erstellen wenn nicht vorhanden, oder nur einmal warnen)

### 6.3 Nächste Schritte

Nach erfolgreichem Test:
1. [ ] Zweiten Sensor hinzufügen (z.B. SHT31 auf I2C)
2. [ ] Actuator testen (LED/Relay)
3. [ ] Zone-Assignment testen
4. [ ] Cross-ESP Logic testen

---

## ANHANG A: Troubleshooting

### A.1 ESP bootet nicht

| Symptom | Mögliche Ursache | Lösung |
|---------|------------------|--------|
| Kein Serial-Output | USB-Kabel defekt | Anderes Kabel testen |
| Boot-Loop | Flash korrupt | `%USERPROFILE%\.platformio\penv\Scripts\platformio.exe run -t erase` dann neu flashen |
| `Brownout detector triggered` | Stromversorgung zu schwach | Kürzeres USB-Kabel, USB-Hub vermeiden |

### A.2 WiFi verbindet nicht

| Symptom | Mögliche Ursache | Lösung |
|---------|------------------|--------|
| `WiFi timeout` | SSID/Passwort falsch | `platformio.ini` prüfen |
| `WiFi: Auth failed` / `AUTH_EXPIRE` | Passwort falsch oder Provisioning nötig | Provisioning Portal nutzen (siehe Phase 0.1) |
| IP = 0.0.0.0 | DHCP-Problem | Router prüfen |
| `BEACON_TIMEOUT` | Schwaches WiFi-Signal (< -80 dBm) | ESP näher an Router, Antenne prüfen |
| Häufige Disconnects | Signal zu schwach | RSSI im Heartbeat prüfen, > -70 dBm anstreben |

### A.3 MQTT verbindet nicht

| Symptom | Mögliche Ursache | Lösung |
|---------|------------------|--------|
| `MQTT connection failed` | Broker nicht erreichbar | Mosquitto läuft? Port 1883 offen? |
| `Connection refused` | Broker IP falsch | `MQTT_HOST` in platformio.ini |

### A.4 DS18B20 nicht erkannt

| Symptom | Mögliche Ursache | Lösung |
|---------|------------------|--------|
| `No devices found` | Pull-up fehlt | 4.7kΩ zwischen DATA und 3.3V |
| `CRC error` | Schlechte Verbindung | Kabel prüfen, Kontakte säubern |
| `Short circuit` | Verkabelung falsch | VCC/GND vertauscht? |

---

## ANHANG B: MQTT-Befehle Referenz (Windows)

### Sensor hinzufügen (KORREKTES FORMAT!)
```cmd
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "kaiser/god/esp/<ESP_ID>/config" -m "{\"sensors\":[{\"gpio\":4,\"sensor_type\":\"DS18B20\",\"sensor_name\":\"Temp_1\",\"measurement_interval_seconds\":5,\"active\":true}]}"
```

**⚠️ Erforderliche Felder:**
- `gpio` - GPIO-Pin (integer)
- `sensor_type` - Sensortyp (string, z.B. "DS18B20", "SHT31")
- `sensor_name` - Eindeutiger Name (string)

**Optionale Felder:**
- `active` - true/false (default: true)
- `measurement_interval_seconds` - 1-300 (default: 30)
- `operating_mode` - "continuous"/"on_demand"/"paused" (default: "continuous")

### Sensor entfernen
```cmd
"C:\Program Files\mosquitto\mosquitto_pub.exe" -h localhost -t "kaiser/god/esp/<ESP_ID>/config" -m "{\"sensors\":[{\"gpio\":4,\"sensor_type\":\"DS18B20\",\"sensor_name\":\"Temp_1\",\"active\":false}]}"
```

### Alle Sensor-Daten beobachten
```cmd
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/sensor/+/data" -v
```

### Heartbeats beobachten
```cmd
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/system/heartbeat" -v
```

### Config-Responses beobachten
```cmd
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/+/config_response" -v
```

### Alle Topics eines ESP beobachten
```cmd
"C:\Program Files\mosquitto\mosquitto_sub.exe" -h localhost -t "kaiser/god/esp/<ESP_ID>/#" -v
```

---

**Ende des Testplans**

*Bei Fragen oder Problemen: Relevante Logs teilen, gemeinsam analysieren.*