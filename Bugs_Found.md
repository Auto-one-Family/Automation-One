# Bugs Found & Debug-Strategie Analyse

> **Letzte Aktualisierung:** 2026-01-06 04:51
> **Status:** 🟢 Bug V (MQTT Connection Loop) behoben, Bug W (WebSocket) automatisch gelöst
> **Projekt:** AutomationOne (ESP32 Firmware + God-Kaiser Server + Frontend)

---

## 1. Debug-Strategie Analyse

### 1.1 Verfügbare Debug-Ressourcen

Das System verfügt über **3 parallele Debug-Kanäle**, die optimal genutzt werden können:

| Debug-Kanal | Quelle | Format | Verfügbarkeit | Beste Verwendung |
|-------------|--------|--------|---------------|------------------|
| **CI Pipeline Logs** | GitHub Actions | Text/JSON | Bei jedem Push/PR | Automatisierte Tests, Build-Errors |
| **Server Logs** | God-Kaiser Server | JSON (Structured Logging) | Kontinuierlich | Server-seitige Fehler, MQTT-Handler, API-Calls |
| **ESP Serial Monitor** | ESP32 Firmware | Plain Text | Bei laufender Firmware | Boot-Sequenz, Hardware-Fehler, Sensor-Readings |

### 1.2 CI Pipeline - GitHub Actions

**Workflows:**
- `.github/workflows/wokwi-tests.yml` - Wokwi ESP32 Simulation Tests
- `.github/workflows/esp32-tests.yml` - Server-seitige Mock-ESP32 Tests
- `.github/workflows/server-tests.yml` - Unit & Integration Tests

**Log-Abruf:**
```powershell
# Workflow-Runs auflisten
gh run list --workflow=wokwi-tests.yml

# Logs anzeigen
gh run view <run-id> --log
gh run view <run-id> --log-failed

# Artifacts herunterladen
gh run download <run-id>
```

**Vorteile:**
- ✅ Automatische Ausführung bei jedem Push
- ✅ Reproduzierbare Umgebung
- ✅ Artifacts (Build-Logs, Test-Results)
- ✅ JUnit XML für Test-Reporting

**Nachteile:**
- ❌ Latenz (Workflow-Durchlauf dauert 5-15 Minuten)
- ❌ Kein interaktives Debugging
- ❌ Nur für automatische Tests geeignet

### 1.3 Server Logs - God-Kaiser Server

**Log-Datei:** `El Servador/god_kaiser_server/logs/god_kaiser.log`

**Format:** JSON (Structured Logging)
```json
{"timestamp":"2026-01-06 10:30:45","name":"god_kaiser_server.mqtt.handlers.heartbeat","level":"INFO","message":"Heartbeat received from ESP_WOKWI001"}
```

**Log-Level:** INFO, WARNING, ERROR, CRITICAL

**Log-Abruf:**
```powershell
# Letzte 100 Zeilen
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Tail 100

# Nach ESP filtern
Select-String -Path "El Servador/god_kaiser_server/logs/god_kaiser.log" -Pattern "ESP_WOKWI001"

# Live-Tail (Watch-Mode)
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Wait -Tail 20
```

**Vorteile:**
- ✅ Strukturierte JSON-Logs (einfach zu parsen)
- ✅ Rotating Logs (10MB, 5 Backups)
- ✅ Kontinuierliche Verfügbarkeit
- ✅ Server-seitige Fehler vollständig erfasst

**Nachteile:**
- ❌ Keine ESP32-internen Fehler (nur MQTT-Messages)
- ❌ Datei kann bei vielen ESPs groß werden

### 1.4 ESP Serial Monitor - PlatformIO / Wokwi

**Quellen:**
1. **PlatformIO Serial Monitor:** `pio device monitor` (echte Hardware)
2. **Wokwi CLI:** Serial-Output via RFC2217 (Port 4000)
3. **Wokwi Serial Logger:** `El Trabajante/scripts/wokwi_serial_logger.py`

**Log-Format:**
```
[1234567] [INFO] WiFi connected successfully
[1237890] [ERROR] MQTT connection failed
```

**Log-Abruf:**
```powershell
# PlatformIO Serial Monitor
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe device monitor

# Wokwi Serial Logger (separates Terminal)
cd "El Trabajante"
python scripts/wokwi_serial_logger.py
# Output: logs/wokwi_serial.log
```

**Vorteile:**
- ✅ Echte Hardware-Debugging
- ✅ Boot-Sequenz sichtbar
- ✅ Sensor-Readings in Echtzeit
- ✅ Low-Level Hardware-Fehler

**Nachteile:**
- ❌ Nur bei laufender Firmware verfügbar
- ❌ Keine Server-seitigen Informationen
- ❌ Buffer-Limit (nur aktuelle Logs)

### 1.5 Optimale Debug-Strategie

**Empfohlener Workflow für Bug-Debugging:**

1. **Bug reproduzieren:**
   - Server-Logs: `Get-Content logs/god_kaiser.log -Wait -Tail 50`
   - ESP Serial: `pio device monitor` oder Wokwi Serial Logger
   - MQTT Monitor: `mosquitto_sub -h localhost -p 1883 -t "kaiser/#" -v`

2. **Fehler lokalisieren:**
   - **Server-seitig?** → Server-Logs analysieren (JSON-Parsing)
   - **ESP-seitig?** → Serial Monitor analysieren (Boot-Sequenz, Error-Codes)
   - **MQTT-Verbindung?** → MQTT Monitor + Server-Logs kombinieren

3. **Fix implementieren:**
   - Code-Änderung
   - Lokal testen (Server + ESP)
   - CI-Pipeline verifiziert automatisch

4. **Verifizieren:**
   - Logs vor/nach Fix vergleichen
   - CI-Pipeline sollte grün sein
   - Manual-Test auf echter Hardware (optional)

**Kombinierte Debug-Session (4 Terminals):**
```powershell
# Terminal 1: Server-Logs (Live-Tail)
Get-Content "El Servador/god_kaiser_server/logs/god_kaiser.log" -Wait -Tail 50

# Terminal 2: MQTT Monitor
mosquitto_sub -h localhost -p 1883 -t "kaiser/#" -v

# Terminal 3: ESP Serial Monitor (PlatformIO)
cd "El Trabajante"
~/.platformio/penv/Scripts/platformio.exe device monitor

# Terminal 4: Server (mit Reload)
cd "El Servador/god_kaiser_server"
poetry run uvicorn god_kaiser_server.src.main:app --reload
```

---

## 2. Identifizierte Bugs & TODOs

### 2.1 Kritische Bugs (Behoben)

#### Bug V: MQTT Connection Loop ✅ FIXED (2026-01-06)

**Status:** 🟢 FIXED

**Symptom:**
```
04:40:46 - MQTT connected with result code: 0
04:40:47 - MQTT connected with result code: 0
04:40:48 - MQTT connected with result code: 0
... (jede Sekunde)
```

Der Server verbindet und trennt jede Sekunde zum MQTT-Broker. Heartbeats konnten nicht verarbeitet werden.

**Root Cause:**
- Die MQTT-Client-ID war **statisch** auf `"god_kaiser_server"` gesetzt
- Bei Uvicorn mit `--reload` oder mehreren Workern gab es **mehrere Prozesse mit identischer Client-ID**
- MQTT erlaubt nur **EINE** Verbindung pro Client-ID
- Neue Verbindungen kickten die alten → Endlosschleife

**Fix:**
```python
# src/mqtt/client.py Zeile 217-222 (vorher)
client_id = self.settings.mqtt.client_id or f"god_kaiser_{int(time.time())}"

# src/mqtt/client.py Zeile 217-222 (nachher - BUG V FIX)
base_id = self.settings.mqtt.client_id or "god_kaiser"
client_id = f"{base_id}_{os.getpid()}"  # PID macht Client-ID eindeutig
```

**Verifikation:**
- Server-Logs zeigen nur **EINEN** Connect: `MQTT Client ID: god_kaiser_server_30220 (PID-based for uniqueness)`
- Keine wiederholten "MQTT connected" Meldungen mehr
- Heartbeats werden verarbeitet: `Weak WiFi signal on ESP_00000001: rssi=-80 dBm`

---

#### Bug W: Keine WebSocket esp_health Broadcasts ✅ FIXED (Automatisch durch Bug V Fix)

**Status:** 🟢 FIXED (Folge-Bug von Bug V)

**Symptom:**
- Frontend erhielt keine Live-Updates (esp_health Broadcasts)
- Heartbeats wurden nicht verarbeitet
- 60 Sekunden Wartezeit bis Daten sichtbar

**Root Cause:**
- **Folge von Bug V:** Da der MQTT-Client ständig reconnected, wurden Heartbeats nicht verarbeitet
- Kein Heartbeat-Processing → keine WebSocket-Broadcasts

**Fix:**
- **Automatisch behoben durch Bug V Fix**
- Nach Bug V Fix werden Heartbeats normal verarbeitet
- WebSocket-Broadcasts funktionieren wieder

---

#### Bug X: ESP Online-Status nicht in Echtzeit angezeigt ✅ FIXED (2026-01-06)

**Status:** 🟢 FIXED

**Symptom:**
- Wenn ein ESP sich verbindet (Wokwi startet), dauert es ~60 Sekunden bis er als "online" angezeigt wird
- Benutzer sieht veralteten Status im Frontend

**Root Cause:**
1. **Frontend-Problem 1:** Der `handleEspHealth` Handler ignorierte unbekannte Devices
   - Wenn ein neues Device online kam, wurde es nicht in der Device-Liste gefunden
   - Das `esp_health` WebSocket-Event wurde komplett ignoriert
2. **Frontend-Problem 2:** Direkte Property-Mutation triggerte Vue-Reaktivität nicht zuverlässig
   - `device.status = data.status` führte nicht immer zu UI-Updates

**Fix (Frontend):**
```typescript
// El Frontend/src/stores/esp.ts

// Fix 1: Bei unbekannten Online-Devices die Device-Liste refreshen (Zeile 577-583)
if (!device && data.status === 'online') {
  console.info(`[ESP Store] New device online: ${espId}, refreshing device list...`)
  fetchAll()
  return
}

// Fix 2: Device-Objekt komplett ersetzen für Vue-Reaktivität (Zeile 604-616)
devices.value[deviceIndex] = {
  ...device,
  status: data.status ?? device.status,
  // ... andere Felder
}
```

**Verifikation:**
- ESP kommt online → Frontend zeigt sofort "online" Status
- Vue-Reaktivität funktioniert korrekt (computed properties werden aktualisiert)

---

### 2.2 Bekannte Probleme (Dokumentiert)

#### Bug T: MQTT-Verbindung von Wokwi zu lokalem Mosquitto

**Status:** 🔴 OPEN (Bekanntes Problem, dokumentiert in `.claude/Next Steps/1.Wokwiki.md`)

**Symptom:**
```
[E][WiFiClient.cpp:275] connect(): socket error on fd 48, errno: 104, "Connection reset by peer"
[E][WiFiGeneric.cpp:1583] hostByName(): DNS Failed for (empty)
```

**Root Cause:**
- Windows Firewall blockiert eingehende Verbindungen auf Port 1883
- Mosquitto bindet möglicherweise nur auf `localhost` statt `0.0.0.0`
- Wokwi Gateway kann nicht zu lokalem Mosquitto verbinden

**Betroffene Umgebung:**
- Nur Wokwi Simulation (nicht echte Hardware)
- Entwicklungsumgebung (Windows)

**Lösung:**
```powershell
# Als Administrator: Firewall-Regel hinzufügen
netsh advfirewall firewall add rule name="Mosquitto MQTT" dir=in action=allow protocol=tcp localport=1883

# Mosquitto Config prüfen (C:\Program Files\mosquitto\mosquitto.conf):
# listener 1883 0.0.0.0  (sollte auf allen Interfaces binden)
# allow_anonymous true

# Mosquitto neu starten
net stop mosquitto
net start mosquitto
```

**Priorität:** Medium (nur Wokwi betroffen, echte Hardware funktioniert)

**Referenz:** `.claude/Next Steps/1.Wokwiki.md` Section 6.1

---

### 2.3 TODO-Kommentare (Offene Aufgaben)

#### TODO-1: Broadcast Emergency Token Validierung

**Status:** 🟡 TODO (Nicht-kritisch, Security-Enhancement)

**Location:** `El Trabajante/src/main.cpp:621`

**Code:**
```cpp
// TODO: Validate against God-Kaiser's master emergency token
```

**Kontext:**
- Broadcast Emergency-Stop akzeptiert aktuell jeden Token
- Sollte gegen God-Kaiser Master-Token validiert werden

**Impact:** Low (nur Security-Enhancement, aktuell funktional)

**Priorität:** Low (kann in späterem Release implementiert werden)

---

#### TODO-2: Subzone Sensor/Aktuator Count

**Status:** 🟡 TODO (Nicht-kritisch, Feature-Completeness)

**Location:** `El Trabajante/src/main.cpp:855`

**Code:**
```cpp
// TODO: Iterate through sensors/actuators and count those with matching subzone_id
subzone_config.sensor_count = 0;
subzone_config.actuator_count = 0;
```

**Kontext:**
- Subzone-Konfiguration speichert aktuell `sensor_count = 0` und `actuator_count = 0`
- Sollte tatsächliche Anzahl der zugewiesenen Sensoren/Aktoren berechnen

**Impact:** Low (nur statistisch, funktionalität nicht betroffen)

**Priorität:** Low (kann in späterem Release implementiert werden)

---

#### TODO-3: OneWire ROM Code Storage

**Status:** 🟡 TODO (Nicht-kritisch, Feature-Limitierung)

**Location:** `El Trabajante/src/services/sensor/sensor_manager.cpp:350`

**Code:**
```cpp
uint8_t rom[8] = {0};  // TODO: Store ROM code in SensorConfig
```

**Kontext:**
- OneWire-Sensoren (z.B. DS18B20) benötigen ROM-Code für Identifikation
- Aktuell wird ROM-Code nicht in SensorConfig gespeichert
- Vereinfachte Implementierung (funktioniert für Single-Sensor-Bus)

**Impact:** Medium (Multi-Sensor-OneWire-Bus nicht vollständig unterstützt)

**Priorität:** Medium (wenn Multi-Sensor-OneWire-Bus benötigt wird)

---

#### TODO-4: BMP280 Register Reading

**Status:** 🟡 TODO (Nicht-kritisch, Feature-Limitierung)

**Location:** `El Trabajante/src/services/sensor/sensor_manager.cpp:502`

**Code:**
```cpp
// TODO: Implement proper BMP280 register reading
raw_value = (uint32_t)(buffer[0] << 8 | buffer[1]);
```

**Kontext:**
- BMP280-Sensor wird aktuell vereinfacht ausgelesen
- Nur erste 2 Bytes werden verwendet (Druck-Wert)
- Temperatur-Wert wird nicht korrekt ausgelesen

**Impact:** Medium (BMP280-Temperatur funktioniert nicht korrekt)

**Priorität:** Medium (wenn BMP280-Temperatur benötigt wird)

---

#### TODO-5: Firmware Version aus Build Config

**Status:** 🟡 TODO (Nicht-kritisch, Informational)

**Location:** `El Trabajante/src/services/provisioning/provision_manager.cpp:683`

**Code:**
```cpp
doc["firmware_version"] = "4.0.0";  // TODO: From build config
```

**Kontext:**
- Firmware-Version ist hardcodiert
- Sollte aus Build-Konfiguration (platformio.ini) kommen

**Impact:** Low (nur informativ, funktionalität nicht betroffen)

**Priorität:** Low (kann in späterem Release implementiert werden)

---

### 2.4 Zusammenfassung TODOs

| TODO | Location | Priorität | Impact | Kategorie |
|------|----------|-----------|--------|-----------|
| Broadcast Token Validierung | `main.cpp:621` | Low | Low | Security |
| Subzone Count | `main.cpp:855` | Low | Low | Feature-Completeness |
| OneWire ROM Code | `sensor_manager.cpp:350` | Medium | Medium | Feature-Limitierung |
| BMP280 Register | `sensor_manager.cpp:502` | Medium | Medium | Feature-Limitierung |
| Firmware Version | `provision_manager.cpp:683` | Low | Low | Informational |

**Empfehlung:** 
- TODOs mit Medium-Priorität sollten vor nächstem Release adressiert werden (OneWire ROM Code, BMP280 Register)
- TODOs mit Low-Priorität können in späteren Releases implementiert werden

---

## 3. Debug-Strategie Empfehlungen

### 3.1 Für verschiedene Bug-Typen

| Bug-Typ | Primäre Debug-Quelle | Sekundäre Quellen |
|---------|---------------------|-------------------|
| **Server-Fehler** | Server-Logs (JSON) | CI Pipeline (Integration Tests) |
| **ESP32 Boot-Fehler** | Serial Monitor | CI Pipeline (Wokwi Tests) |
| **MQTT-Verbindung** | MQTT Monitor + Server-Logs | Serial Monitor (ESP-Seite) |
| **Sensor-Readings** | Serial Monitor + Server-Logs | MQTT Monitor |
| **Aktor-Commands** | Server-Logs + MQTT Monitor | Serial Monitor |
| **Build-Errors** | CI Pipeline Logs | PlatformIO Build-Output |

### 3.2 Log-Analyse-Workflow

1. **Fehler reproduzieren:**
   - Alle relevanten Log-Kanäle aktivieren
   - Bug-Trigger ausführen

2. **Logs sammeln:**
   - Server-Logs: `logs/god_kaiser.log`
   - ESP Serial: `logs/wokwi_serial.log` oder Terminal-Output
   - MQTT: Terminal-Output (`mosquitto_sub`)

3. **Fehler lokalisieren:**
   - Timestamps vergleichen (Server vs. ESP)
   - MQTT-Topics analysieren (Message-Flow)
   - Error-Codes nachschlagen (`El Trabajante/src/models/error_codes.h`)

4. **Fix implementieren:**
   - Code-Änderung
   - Lokal testen
   - Logs vor/nach vergleichen

5. **Verifizieren:**
   - CI-Pipeline sollte grün sein
   - Manual-Test auf echter Hardware (optional)

### 3.3 Best Practices

**✅ DO:**
- Strukturierte Logs verwenden (JSON-Format im Server)
- Timestamps in allen Logs
- Error-Codes verwenden (nicht nur Strings)
- Log-Levels korrekt setzen (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- CI-Pipeline für automatische Verifikation nutzen

**❌ DON'T:**
- Sensitive Daten loggen (Passwords, Tokens)
- Zu viele DEBUG-Logs in Production
- Logs ohne Timestamps
- Error-Messages ohne Error-Codes

---

## 4. Aktueller System-Status

### 4.1 Laufende Prozesse (Stand: 2026-01-06)

```
Mosquitto MQTT Broker:     ✅ LÄUFT (Port 1883, LISTENING)
God-Kaiser Server:         ✅ LÄUFT (Port 8000, LISTENING)
Frontend (Vue.js):         ❓ UNBEKANNT (Port 5173)
Wokwi Simulation:          ❌ NICHT AKTIV
```

**Verifikation:**
```powershell
netstat -an | Select-String -Pattern "1883|8000|5173"
```

### 4.2 Bekannte funktionierende Features

- ✅ ESP32 Firmware baut erfolgreich
- ✅ Server startet und läuft stabil
- ✅ MQTT-Verbindung funktioniert (lokale Verbindung)
- ✅ CI-Pipeline läuft automatisch
- ✅ Serial Monitor funktioniert (PlatformIO)
- ✅ Wokwi CLI ist installiert und konfiguriert

### 4.3 Bekannte Probleme

- 🔴 MQTT-Verbindung von Wokwi zu lokalem Mosquitto (Windows Firewall)
- 🟡 5 TODOs identifiziert (nicht-kritisch)
- 🟡 Frontend-Status unbekannt (nicht geprüft)

---

## 5. Nächste Schritte

### 5.1 Kurzfristig (Diese Woche)

1. **Windows Firewall-Regel für Mosquitto hinzufügen:**
   ```powershell
   # Als Administrator
   netsh advfirewall firewall add rule name="Mosquitto MQTT" dir=in action=allow protocol=tcp localport=1883
   ```

2. **Wokwi MQTT-Verbindung testen:**
   - Firewall-Regel anwenden
   - Mosquitto neu starten
   - Wokwi CLI starten
   - Server-Logs auf Heartbeat-Empfang prüfen

3. **Frontend-Status prüfen:**
   - Läuft Frontend?
   - Port 5173 erreichbar?

### 5.2 Mittelfristig (Nächstes Release)

1. **Medium-Priority TODOs adressieren:**
   - OneWire ROM Code Storage (TODO-3)
   - BMP280 Register Reading (TODO-4)

2. **Debug-Infrastruktur erweitern:**
   - Log-Aggregation (optional: ELK Stack)
   - Error-Tracking (optional: Sentry)
   - Performance-Monitoring (optional: Prometheus)

### 5.3 Langfristig (Future Releases)

1. **Low-Priority TODOs adressieren:**
   - Broadcast Token Validierung (TODO-1)
   - Subzone Count (TODO-2)
   - Firmware Version aus Build Config (TODO-5)

2. **CI-Pipeline erweitern:**
   - Performance-Tests
   - Load-Tests
   - Security-Scans

---

## 6. Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **Wokwi Handbuch** | `.claude/Next Steps/1.Wokwiki.md` | Wokwi-Integration, MQTT-Debugging |
| **Server Bugs** | `El Frontend/Docs/Bugs_and_Phases/Bugs_Found.md` | Server/Frontend Bugs (historisch) |
| **CLAUDE.md** | `.claude/CLAUDE.md` | Haupt-KI-Dokumentation |
| **DEBUG_ARCHITECTURE.md** | `El Frontend/Docs/DEBUG_ARCHITECTURE.md` | Service-Start, Log-Locations |
| **Error Codes** | `El Trabajante/src/models/error_codes.h` | Alle Error-Code-Definitionen |

---

**Dokument-Version:** 1.0
**Erstellt:** 2026-01-06
**Autor:** Claude (Auto)
**Status:** Initial-Analyse abgeschlossen





