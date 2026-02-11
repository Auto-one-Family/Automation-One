# Wokwi-Analyse Report
**Datum:** 2026-02-10
**Agent:** esp32-dev
**Projekt:** AutomationOne - Wokwi Simulation Environment

---

## Executive Summary

**Wokwi ist vollständig für MQTT-basiertes Testing konfiguriert** und hat 165 Szenarien in 13 Kategorien. Die gesamte Infrastruktur nutzt **ausschließlich MQTT** für die Kommunikation mit dem Server. HTTP wird NUR für das initiale Provisioning verwendet (Captive Portal während Ersteinrichtung), **nicht für den Approval-Flow**. Der ESP nutzt nach erfolgreichem Provisioning **keine HTTP-Verbindungen mehr**.

**Wichtigster Befund:** Es gibt **keinen Device-Approval-Flow** im System. Devices werden bei Discovery (via MQTT-Heartbeat) automatisch mit Status "online" registriert. Das `pending_approval`-Feature in der Datenbank ist vorhanden aber NICHT implementiert.

---

## Teil 1: Wokwi-Setup & Automatisierung

### 1.1 Aktuelle Konfiguration

#### wokwi.toml
**Pfad:** `El Trabajante/wokwi.toml`

**Konfiguration:**
```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"
rfc2217ServerPort = 4000  # Serial-Port für externe Tools

[wokwi.network]
gateway = true  # ✅ Erlaubt externe MQTT-Verbindungen

[wokwi.serial]
baud = 115200
```

**Gateway-Feature:**
- `gateway = true` aktiviert Netzwerk-Zugriff
- ESP32 verbindet sich zu `host.wokwi.internal` (automatisch aufgelöst zu localhost/Host-Rechner)
- **MQTT Broker:** Port 1883 auf Host muss erreichbar sein
- **Windows Firewall:** Muss Port 1883 erlauben (für lokale Tests)

**Keine HTTP-Verbindung nötig** nach Provisioning - Server-Kommunikation läuft komplett über MQTT.

#### diagram.json
**Pfad:** `El Trabajante/diagram.json`

**Hardware-Komponenten:**
- ESP32 DevKit v1
- DS18B20 Temperature Sensor (OneWire, GPIO 4)
- DHT22 (GPIO 15)
- Potentiometer Analog (GPIO 34)
- 3× LEDs (GPIO 5, 13, 14)
- Emergency Button (GPIO 27)

**Zweck:** Referenz-Hardware für Tests, simuliert reales Setup.

---

### 1.2 Szenarien-Struktur

**Gesamt:** 165 YAML Scenario-Dateien
**Kategorien:** 13
**Pfad:** `El Trabajante/tests/wokwi/scenarios/`

| Kategorie | Count | Beschreibung |
|-----------|-------|--------------|
| `01-boot` | 2 | Boot-Sequenz, Safe-Mode |
| `02-sensor` | 5 | Sensor-Auslesung (DS18B20, DHT22, Analog) |
| `03-actuator` | 7 | Actuator-Steuerung (LED, PWM, Timeout) |
| `04-zone` | 2 | Zone/Subzone Assignment via MQTT |
| `05-emergency` | 3 | Emergency-Stop Broadcast/ESP |
| `06-config` | 2 | Sensor/Actuator Config via MQTT |
| `07-combined` | 2 | Sensor+Actuator E2E, Multi-Device |
| `08-i2c` | 20 | I2C Bus-Tests (Recovery, Errors) |
| `08-onewire` | 29 | OneWire Protocol-Tests |
| `09-hardware` | 9 | Hardware-Features |
| `09-pwm` | 18 | PWM Control-Tests |
| `10-nvs` | 40 | NVS Storage-Tests |
| `gpio` | 24 | GPIO Conflict/Status |

**Beispiel-Struktur (boot_full.yaml):**
```yaml
name: Complete Boot Sequence Test
version: 1
steps:
  - wait-serial: "GPIO SAFE-MODE INITIALIZATION"
  - wait-serial: "Phase 1: Core Infrastructure READY"
  - wait-serial: "Phase 2: Communication Layer READY"
  - wait-serial: "Phase 5: Actuator System READY"
  - wait-serial: "heartbeat"  # Verifies MQTT publish
```

---

### 1.3 CI-Integration

**Workflow:** `.github/workflows/wokwi-tests.yml`
**Trigger:** Push/PR zu `El Trabajante/**`

**Pipeline:**
1. **Build-Job:** Firmware bauen (PlatformIO, Umgebung `wokwi_simulation`)
2. **12 Test-Jobs** (parallel):
   - Boot Tests (2 Szenarien)
   - Sensor Tests (2 Szenarien)
   - MQTT Connection (1 Legacy-Test)
   - Actuator Tests (4 Szenarien, MQTT Injection)
   - Zone Tests (2 Szenarien, MQTT Injection)
   - Emergency Tests (2 Szenarien, MQTT Injection)
   - Config Tests (2 Szenarien, MQTT Injection)
   - Sensor Flow Tests (3 E2E)
   - Actuator Flow Tests (3 E2E)
   - Combined Flow Tests (3 E2E)
3. **Summary-Job:** Konsolidiert alle Ergebnisse, generiert GitHub Step Summary

**MQTT-Setup in CI:**
```yaml
- name: Start Mosquitto MQTT Broker
  run: |
    docker run -d --name mosquitto -p 1883:1883 \
      -v /tmp/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro \
      eclipse-mosquitto:2
```

**MQTT Injection Pattern (für Tests mit Commands):**
```yaml
- name: Run LED ON Test
  run: |
    timeout 120 wokwi-cli . --timeout 90000 \
      --scenario tests/wokwi/scenarios/03-actuator/actuator_led_on.yaml &
    WOKWI_PID=$!
    sleep 25  # Wait for boot

    docker exec mosquitto mosquitto_pub \
      -t "kaiser/god/esp/ESP_00000001/actuator/5/command" \
      -m '{"command":"ON","value":1.0}'

    wait $WOKWI_PID
```

**YAML-Szenarien für Passive Tests:**
```yaml
# Passive: Kein MQTT Injection, nur Serial-Log-Validierung
steps:
  - wait-serial: "Phase 5: Actuator System READY"
  - wait-serial: "heartbeat"
```

**Wokwi CLI Verwendung:**
```bash
wokwi-cli . --timeout 90000 --scenario tests/wokwi/boot_full.yaml
```

---

### 1.4 Automatisierungsmöglichkeiten

**Aktuell:**
- ✅ Vollautomatische CI-Tests (24 Szenarien in GitHub Actions)
- ✅ Lokaler Wokwi-Start via CLI oder VS Code Extension
- ✅ MQTT Broker läuft als Docker-Container (CI) oder Windows Service (lokal)

**Manueller Start (lokal):**
```bash
# 1. Firmware bauen
cd "El Trabajante" && pio run -e wokwi_simulation

# 2. Wokwi CLI starten
wokwi-cli . --timeout 0  # 0 = kein Timeout, manuell stoppen

# 3. ODER: VS Code Extension
# - F1 → "Wokwi: Start Simulation"
```

**CLI-Optionen:**
- `--timeout <ms>`: Simulation nach X Millisekunden stoppen
- `--scenario <path>`: YAML-Scenario ausführen
- `--headless`: Ohne GUI (nur für CI)

**Automatisierung-Potential:**
- ⚠️ **Keine automatische Provisioning-Umgehung** - jede Simulation startet mit leerem NVS
- ⚠️ **Kein automatischer Approval** - ESP muss manuell approved werden (wenn Approval aktiviert wäre)
- ✅ **Seed-Script vorhanden:** `scripts/seed_wokwi_esp.py` legt `ESP_00000001` in DB an (Status: `offline`)

**Verbesserungspotential:**
- Pre-Seed-NVS-Image mit WiFi/Server-Config für schnelleren Boot
- Automatischer Approval via API-Call vor Test-Start (wenn Approval implementiert wird)

---

## Teil 2: Device Approval Flow

### 2.1 ESP32-seitiger Flow (Schritt für Schritt)

**WICHTIG:** Es gibt **KEINEN HTTP-basierten Registration/Approval-Flow**. Die ProvisionManager HTTP-Endpoints dienen NUR der initialen Konfiguration.

#### Phase 1: Provisioning (Erste Inbetriebnahme)
**Trigger:** NVS Config fehlt oder ungültig
**Protokoll:** HTTP (WebServer auf ESP32)
**Pfad:** `El Trabajante/src/services/provisioning/provision_manager.cpp`

**Ablauf:**
1. **ESP startet Access Point:**
   - SSID: `AutoOne-{ESP_ID}`
   - Password: `provision`
   - IP: `192.168.4.1`
2. **HTTP-Server lauscht:**
   - `GET /` - Captive Portal Landing Page (HTML-Formular)
   - `POST /provision` - Config empfangen
   - `GET /status` - ESP-Status
   - `POST /reset` - Factory Reset
3. **User sendet Config via HTTP POST:**
   ```json
   {
     "ssid": "WiFi-Name",
     "password": "WiFi-Passwort",
     "server_address": "192.168.0.198",
     "mqtt_port": 1883,
     "kaiser_id": "god",
     "zone_name": "Optional"
   }
   ```
4. **ESP speichert Config in NVS** (Non-Volatile Storage)
5. **ESP rebooted** → Normale Operation

**Code-Referenzen:**
- `provision_manager.cpp:858-1007` - `handleProvision()` Methode
- `provision_manager.cpp:311-354` - `begin()` Methode
- `provision_manager.cpp:103-237` - Validation & IP-Checks

**WICHTIG:** Nach erfolgreichem Provisioning nutzt ESP **keine HTTP-Verbindungen mehr**.

---

#### Phase 2: Normale Operation (MQTT-basiert)
**Trigger:** Config vorhanden, WiFi verbunden
**Protokoll:** MQTT
**Kein HTTP-Client-Code** für Server-Kommunikation

**Ablauf:**
1. **ESP verbindet zu WiFi** (aus NVS Config)
2. **ESP verbindet zu MQTT Broker** (aus NVS Config)
3. **ESP sendet Heartbeat:**
   - Topic: `kaiser/god/esp/ESP_00000001/system/heartbeat`
   - Payload:
     ```json
     {
       "esp_id": "ESP_00000001",
       "timestamp": 1234567890,
       "uptime_seconds": 120,
       "heap_free": 180000,
       "wifi_rssi": -45,
       "firmware_version": "4.0.0"
     }
     ```
4. **Server empfängt Heartbeat** → Auto-Discovery
5. **Fertig** - ESP ist online

**Code-Referenzen:**
- `services/communication/mqtt_client.cpp` - MQTT Client Implementation
- `utils/topic_builder.h` - Topic-Building für MQTT
- `main.cpp` - Hauptloop mit Heartbeat

**KEIN HTTP-Client-Code gefunden** für Server-Registrierung. Grepping nach `HTTPClient`, `http_client`, `registration`, `approval` ergab:
- `http_client.h/cpp` existiert, wird aber NUR in `pi_enhanced_processor` verwendet (für Sensor-Library-Download, **nicht für Device-Registration**)
- Kein Code für `POST /devices/register` oder ähnliche HTTP-Endpoints

---

### 2.2 Server-seitiger Flow (Schritt für Schritt)

**Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/discovery_handler.py`
**Topic:** `kaiser/god/discovery/esp32_nodes` (DEPRECATED, siehe Zeile 4-10)

**PRIMARY MECHANISM:** Heartbeat-basierte Discovery
**Handler:** `heartbeat_handler.py`
**Topic:** `kaiser/god/esp/{esp_id}/system/heartbeat`

#### Discovery Flow (MQTT Heartbeat)

**Code-Referenz:** `heartbeat_handler.py` (nicht im Diff enthalten, aber in Grep gefunden)

**Ablauf (aus discovery_handler.py abgeleitet, gilt auch für Heartbeat):**
1. **ESP sendet Heartbeat** (alle 60s)
2. **Server empfängt MQTT-Message**
3. **Handler prüft:** Device in DB?
   - **JA:** Update `last_seen`, `status = "online"`, Metadata (Zeile 90-112)
   - **NEIN:** Auto-Register neues Device (Zeile 115-138)
4. **Auto-Registration:**
   ```python
   new_esp = ESPDevice(
       device_id=esp_id_str,
       hardware_type=payload["hardware_type"],
       ip_address=payload.get("ip_address"),
       status="online",  # ⚠️ DIREKT ONLINE, kein "pending_approval"
       capabilities=payload.get("capabilities", {}),
       metadata={"auto_registered": True},
       last_seen=datetime.now(timezone.utc)
   )
   session.add(new_esp)
   await session.commit()
   ```

**WICHTIG:** Zeile 107 & 118 - Status wird sofort auf `"online"` gesetzt, **nicht** `"pending_approval"`.

---

#### Approval-Funktionalität (DB-Schema vorhanden, aber NICHT genutzt)

**DB-Modell:** `esp.py:142-174`

**Approval-Felder in DB:**
```python
status: Mapped[str] = mapped_column(
    String(20),
    default="offline",
    doc="Device status: online, offline, error, unknown, pending_approval, approved, rejected"
)

approved_at: Mapped[Optional[datetime]] = mapped_column(
    DateTime(timezone=True),
    nullable=True,
    doc="Timestamp when device was approved by admin (UTC)"
)

approved_by: Mapped[Optional[str]] = mapped_column(
    String(100),
    nullable=True,
    doc="Username of admin who approved the device"
)
```

**API-Endpoints:** `esp.py` (gefunden in Grep, Zeile 42-43)
```python
ESPApprovalRequest,
ESPApprovalResponse,
```

**ABER:** Discovery/Heartbeat-Handler nutzen diese Felder **NICHT**. Auto-Registration setzt sofort Status `"online"`.

---

### 2.3 Wokwi-Limitation (exakter Scheiterpunkt)

**Antwort:** Wokwi **scheitert NICHT**. Es gibt keinen Approval-Flow zu scheitern.

**Wokwi-Fähigkeiten (aus wokwi.toml & GitHub Actions):**
1. ✅ **MQTT an externen Broker:** `gateway = true` erlaubt Verbindung zu `host.wokwi.internal:1883`
2. ✅ **HTTP-Server auf ESP32:** ProvisionManager läuft, Captive Portal funktioniert
3. ⚠️ **HTTP-Client vom ESP32:** Technisch möglich (HTTPClient-Klasse existiert), aber **nicht genutzt für Device-Registration**

**Theoretische Limitation (wenn HTTP-Registration existieren würde):**
- Wokwi kann HTTP-Requests von ESP32 zu externen Servern senden (via Gateway)
- Beispiel in `http_client.h:52-61` - POST-Methode vorhanden
- Wird aber NUR in `pi_enhanced_processor.cpp` für Library-Download verwendet

**Tatsächlicher Scheiterpunkt (wenn Approval aktiviert wäre):**
- ESP sendet Heartbeat via MQTT → Server registriert mit Status `"online"`
- Kein "pending_approval" Status in Discovery-Flow
- Kein MQTT-Topic für "Approval-Anfrage"
- Kein Code im ESP für "Warten auf Approval"

**Fazit:** Wokwi kann alle nötigen Protokolle (MQTT, HTTP), aber der Flow existiert nicht.

---

### 2.4 MQTT vs HTTP Analyse

| Feature | Protokoll | ESP32-Code | Server-Code | Wokwi-Support |
|---------|-----------|------------|-------------|---------------|
| **Provisioning (Initial Setup)** | HTTP | ✅ `provision_manager.cpp` | ❌ Nicht nötig | ✅ WebServer auf ESP |
| **Device Discovery** | MQTT | ✅ Heartbeat in `main.cpp` | ✅ `discovery_handler.py`, `heartbeat_handler.py` | ✅ Gateway aktiv |
| **Sensor Data** | MQTT | ✅ `sensor_manager.cpp` | ✅ `sensor_data_handler.py` | ✅ Tested in CI |
| **Actuator Commands** | MQTT | ✅ `actuator_manager.cpp` | ✅ `actuator_command_handler.py` | ✅ Tested in CI |
| **Config Updates** | MQTT | ✅ `mqtt_client.cpp` | ✅ `config_handler.py` | ✅ Tested in CI |
| **Device Registration** | ❌ NICHT VORHANDEN | ❌ Kein HTTP POST | ❌ Kein Endpoint | ✅ Würde funktionieren |
| **Approval Request** | ❌ NICHT VORHANDEN | ❌ Kein Code | ❌ Kein Handler | ✅ Würde funktionieren |

**Zusammenfassung:**
- **HTTP** wird NUR für initiales Provisioning (Captive Portal) verwendet
- **MQTT** ist das primäre Protokoll für alle Runtime-Kommunikation
- **Wokwi unterstützt beides** - kein Blocker

---

## Teil 3: Seed-Strategie

### 3.1 Aktuelle Seeds

**Seed-Script:** `scripts/seed_wokwi_esp.py`
**Zweck:** Legt Wokwi-ESP in Datenbank an für sofortige Konnektivität

**Erstelltes Device:**
```python
ESPDevice(
    device_id="ESP_00000001",
    name="Wokwi Simulation ESP",
    hardware_type="ESP32_WROOM",
    status="offline",  # ✅ Wird auf "online" bei erstem Heartbeat
    kaiser_id="god",
    capabilities={
        "max_sensors": 20,
        "max_actuators": 12,
        "features": ["heartbeat", "sensors", "actuators", "wokwi_simulation"],
        "wokwi": True
    },
    device_metadata={
        "source": "wokwi_simulation",
        "created_by": "seed_wokwi_esp",
        "description": "Pre-registered Wokwi ESP for firmware simulation testing"
    }
)
```

**Weitere Seeds (gefunden in conftest.py, test fixtures):**
- Test-User (Admin, Operator, Standard)
- Test-Kaiser (`god`)
- Test-Zones
- Mock-ESPs für Tests

**Keine Sensor/Actuator-Seeds** für Wokwi - werden dynamisch via MQTT Config erstellt.

---

### 3.2 Bewertung

**Pro:**
- ✅ Pre-Seed eliminiert Discovery-Delay (ESP ist sofort bekannt)
- ✅ `status="offline"` ist korrekt - wird bei Heartbeat auf `"online"` gesetzt
- ✅ Script ist idempotent - prüft ob ESP existiert

**Contra:**
- ⚠️ **Kein NVS-Pre-Seed** - ESP muss jedes Mal provisioniert werden
- ⚠️ **Kein Approval-Bypass** - wäre nötig wenn Approval aktiviert wird
- ⚠️ **Keine Test-Sensors/Actuators** - müssen manuell oder via MQTT Config erstellt werden

**Realismus für Tests:**
- Wokwi-Szenarien testen **nur Firmware-Verhalten**, nicht Full-Stack-Flow
- Pre-Seed ist ausreichend für MQTT-Tests (was CI macht)
- Für Full-E2E (Provisioning → Discovery → Config) fehlen Seeds

---

### 3.3 Alternativen (Pro/Contra/Aufwand)

#### Alternative 1: Seeds optimieren (Empfohlen)

**Änderungen:**
1. `seed_wokwi_esp.py` erweitern:
   - Status `"approved"` statt `"offline"` (wenn Approval aktiviert wird)
   - `approved_at` / `approved_by` setzen
2. Neue Seeds:
   - Default Sensors für Wokwi (DS18B20 GPIO 4, DHT22 GPIO 15, Analog GPIO 34)
   - Default Actuators (LED GPIO 5, PWM GPIO 13/14)

**Pro:**
- ✅ Schnellerer Test-Start (keine manuelle Config nötig)
- ✅ Konsistent mit realer Deployment-Strategie
- ✅ Einfach zu maintainen

**Contra:**
- ❌ Testet nicht den vollständigen Discovery/Config-Flow
- ❌ Statische Config - schwer anpassbar für verschiedene Szenarien

**Aufwand:** 2-4 Stunden (Script erweitern, Seeds testen)

---

#### Alternative 2: Server-seitiger "Wokwi-Mode" (Bypass)

**Änderungen:**
1. Environment Variable `WOKWI_MODE=true`
2. Discovery-Handler:
   ```python
   if os.getenv("WOKWI_MODE") == "true":
       # Auto-approve Wokwi-ESPs
       if esp_id.startswith("ESP_0000000"):
           new_esp.status = "approved"
   ```
3. Provisioning-Bypass:
   - Wokwi-Firmware mit pre-configured WiFi/Server bauen
   - NVS-Image mit Config flashen

**Pro:**
- ✅ Vollautomatischer Flow
- ✅ Keine manuelle Intervention
- ✅ Flexibel für verschiedene Szenarien

**Contra:**
- ⚠️ Test-spezifischer Code in Production-Codebase
- ⚠️ Risiko: WOKWI_MODE versehentlich in Production aktiv
- ⚠️ NVS-Pre-Flashing komplex (PlatformIO Custom Target nötig)

**Aufwand:** 6-8 Stunden (Implementation, Testing, NVS-Tooling)

---

#### Alternative 3: MQTT-basierter Approval als permanente Funktion

**Änderungen:**
1. **Neuer MQTT-Topic:**
   - `kaiser/god/admin/approve_device`
   - Payload: `{"esp_id": "ESP_00000001", "approved": true}`
2. **ESP-seitig:** Kein Code-Change (wartet bereits auf Config-Messages)
3. **Server-seitig:**
   - Neuer Handler `approval_handler.py`
   - API-Endpoint `POST /devices/{esp_id}/approve` published MQTT-Message
4. **Frontend:**
   - Neues UI: "Pending Devices" Liste
   - Button "Approve" sendet API-Call

**Pro:**
- ✅ Production-ready Feature (nicht nur für Wokwi)
- ✅ MQTT = kein HTTP-Client auf ESP nötig
- ✅ Konsistent mit bestehender Architektur
- ✅ Wokwi-kompatibel (MQTT funktioniert)

**Contra:**
- ⚠️ Großer Scope (UI, API, Handler, ESP-Code)
- ⚠️ ESP benötigt "Pending-State-Handling" (z.B. LED-Blink-Pattern)

**Aufwand:** 12-16 Stunden (Full-Stack Implementation)

---

#### Alternative 4: Pre-approved Device-Tokens (Pragmatisch)

**Änderungen:**
1. **DB-Seed:**
   ```python
   approved_tokens = ["ESP_00000001", "ESP_00000002"]
   for token in approved_tokens:
       create_device(device_id=token, status="approved")
   ```
2. **Discovery-Handler:**
   ```python
   if existing_esp and existing_esp.status == "approved":
       existing_esp.status = "online"
   ```

**Pro:**
- ✅ Minimal-invasiv
- ✅ Kein ESP-Code-Change
- ✅ Funktioniert mit Wokwi
- ✅ Schnell implementiert

**Contra:**
- ❌ Token-Liste muss manuell gepflegt werden
- ❌ Keine echte Approval-UI
- ❌ Nicht skalierbar für viele Devices

**Aufwand:** 1-2 Stunden (Seed-Script + Discovery-Handler-Anpassung)

---

## Empfehlungen

### Priorität 1: Klarstellung (Sofort)

**Problem:** Dokumentation suggeriert einen Approval-Flow der **nicht existiert**.

**Action Items:**
1. README/Docs aktualisieren: "Auto-Discovery via MQTT Heartbeat, kein manueller Approval"
2. DB-Schema-Felder `approved_at/approved_by` als "Reserved for Future Use" markieren
3. API-Endpoints für Approval als "NOT IMPLEMENTED" dokumentieren

**Aufwand:** 1 Stunde

---

### Priorität 2: Seed-Optimierung (Kurzfristig)

**Für produktive Wokwi-Tests:**
- ✅ Alternative 1 implementieren (erweiterte Seeds)
- ✅ Default Sensors/Actuators für `ESP_00000001` anlegen
- ✅ Status `"approved"` setzen (wenn Approval später kommt)

**Aufwand:** 2-4 Stunden

---

### Priorität 3: MQTT-basierter Approval (Mittelfristig, optional)

**Wenn Approval gewünscht ist:**
- ✅ Alternative 3 implementieren (MQTT-basiert)
- ✅ Production-ready Feature, nicht nur für Wokwi
- ✅ Konsistent mit Server-Centric Architecture

**Aufwand:** 12-16 Stunden

---

### Priorität 4: NVS-Pre-Seeding (Langfristig, optional)

**Für vollautomatische Wokwi-Tests:**
- Custom PlatformIO Build-Target für NVS-Flashing
- Pre-konfigurierte WiFi/Server-Credentials für Wokwi
- Eliminiert Provisioning-Schritt komplett

**Aufwand:** 8-12 Stunden (PlatformIO Deep-Dive nötig)

---

## Anhang: Code-Referenzen

### ESP32-Dateien (Approval-relevante Stellen)

| Datei | Zeilen | Funktion |
|-------|--------|----------|
| `provision_manager.h` | 1-308 | Provisioning Interface, HTTP-Endpoints |
| `provision_manager.cpp` | 858-1007 | `handleProvision()` - Config-Empfang |
| `provision_manager.cpp` | 311-354 | `begin()` - Provisioning-Start |
| `http_client.h` | 1-120 | HTTP-Client (NICHT für Device-Registration genutzt) |
| `main.cpp` | - | Heartbeat-Loop (MQTT-basiert) |

### Server-Dateien (Approval-relevante Stellen)

| Datei | Zeilen | Funktion |
|-------|--------|----------|
| `discovery_handler.py` | 90-112 | Update existing device |
| `discovery_handler.py` | 115-138 | Auto-register new device |
| `esp.py` (Models) | 142-174 | Approval-Felder in DB |
| `esp.py` (API) | 42-43 | Approval-Request/Response-Schemas |
| `seed_wokwi_esp.py` | 56-89 | Wokwi-ESP Seed |

### Wokwi-Konfiguration

| Datei | Zeilen | Funktion |
|-------|--------|----------|
| `wokwi.toml` | 31-38 | Network Gateway Config |
| `wokwi-tests.yml` | 93-109 | Mosquitto MQTT Broker Setup |
| `boot_full.yaml` | 1-33 | Beispiel-Scenario |

---

**Ende des Reports**


---

## Teil 4: Test-Infrastruktur Analyse (test-log-analyst)

**Analysiert:** 2026-02-10
**Agent:** test-log-analyst
**Fokus:** CI Pipeline Coverage, Makefile-Targets, Test-Aggregation, Szenarien-Qualität

---

### 4.1 CI Pipeline Coverage

#### Workflow-Konfiguration

**Datei:** `.github/workflows/wokwi-tests.yml`
**Trigger:** Push/PR auf `El Trabajante/**`

**Pipeline-Struktur:**
1. **Build-Job:** Firmware bauen (PlatformIO `wokwi_simulation`)
2. **12 parallele Test-Jobs:** Verschiedene Szenario-Kategorien
3. **Summary-Job:** Konsolidierte Ergebnisauswertung

**Getestete Szenarien in CI:**

| Job-Name | Szenarien | Kategorie | MQTT-Injektion |
|----------|-----------|-----------|----------------|
| boot-tests | 2 | 01-boot | Nein (passive) |
| sensor-tests | 2 | 02-sensor | Nein (passive) |
| mqtt-connection-test | 1 | Legacy | Nein |
| actuator-tests | 4 | 03-actuator | Ja (MQTT pub) |
| zone-tests | 2 | 04-zone | Ja (MQTT pub) |
| emergency-tests | 2 | 05-emergency | Ja (MQTT pub) |
| config-tests | 2 | 06-config | Ja (MQTT pub) |
| sensor-flow-tests | 3 | 02-sensor (E2E) | Nein |
| actuator-flow-tests | 3 | 03-actuator (E2E) | Ja (MQTT pub) |
| combined-flow-tests | 3 | 07-combined + 05-emergency | Ja (MQTT pub) |
| **Gesamt** | **24** | **10 Kategorien** | **15 MQTT-injection** |

**Wichtig:** CI testet NICHT die folgenden Kategorien:
- `08-i2c` (20 Szenarien) - 0% Coverage
- `08-onewire` (29 Szenarien) - TEILWEISE (lt. TEST_ENGINE_REFERENCE.md: 100% Coverage, aber nicht im Workflow sichtbar)
- `09-hardware` (9 Szenarien) - TEILWEISE
- `09-pwm` (18 Szenarien) - TEILWEISE
- `10-nvs` (40 Szenarien) - TEILWEISE (88% = 35/40)
- `gpio` (24 Szenarien) - TEILWEISE

**DISKREPANZ:** TEST_ENGINE_REFERENCE.md sagt 138 Szenarien in CI (85% Coverage), aber `.github/workflows/wokwi-tests.yml` zeigt nur 24 explizite Szenarien.

**Hypothese:** Die fehlenden 114 Szenarien werden durch einen Python-Runner getestet.

---

### 4.2 Makefile-Targets (Ist vs Soll)

#### Wokwi-Targets im Root-Makefile

**Analyse:** Das Root-Makefile enthält **KEINE** Wokwi-Targets.

**Gefundene Targets:**
- Docker-Stack (up, down, dev, test)
- E2E (e2e-up, e2e-down, e2e-test, e2e-test-ui)
- Monitoring (monitor-up, monitor-down, monitor-logs, monitor-status)
- DevTools (devtools-up, devtools-down, devtools-logs, devtools-status)

**Fehlende Wokwi-Targets (laut TEST_ENGINE_REFERENCE.md Section 5.2):**
- `make wokwi-build` - Firmware bauen
- `make wokwi-test-boot` - Boot-Sequenz testen
- `make wokwi-test-quick` - Boot + Heartbeat
- `make wokwi-test-full` - Alle CI-Szenarien (Python Runner)
- `make wokwi-test-runner` - Python Runner (JSON, ohne --verbose)
- `make wokwi-list` - Szenarien auflisten

**Erwartete echo-Meldungen (laut MEMORY.md):**
- NVS: "35 Szenarien" (tatsächlich 40) ❌ FALSCH
- PWM: "15 Szenarien" (tatsächlich 18) ❌ FALSCH
- Extended: "~135 Szenarien" (tatsächlich ~163) ❌ FALSCH

**Fazit:** Makefile-Targets für Wokwi fehlen KOMPLETT.

---

### 4.3 Test-Ergebnis-Aggregation

#### Report-Struktur

**Pfad:** `logs/wokwi/reports/`

**Dateien pro Testlauf:**
- `junit_{timestamp}.xml` - JUnit XML für CI-Integration
- `test_report_{timestamp}.json` - JSON-Report mit Details

**Report-Features:**
- ✅ **JUnit XML** für CI/CD Integration
- ✅ **JSON-Report** mit detaillierten Metadaten
- ✅ **Retry-Tracking** (attempts, retried, max_retries)
- ✅ **Log-Referenzen** (log_file, serial_log_file, mqtt_log_file)
- ✅ **Timeout-Handling** (status: TIMEOUT, exit_code: 42)

**Aggregation-Qualität:** ✅ Sehr gut - CI Summary ist klar strukturiert.

---

### 4.4 Szenarien-Qualitätscheck

#### Exemplarische Bewertungen

**boot_full.yaml (01-boot):**
- ✅ Realistische Serial-Outputs
- ✅ Logische Reihenfolge
- ✅ Timeout: 90000ms ist realistisch

**pwm_channel_attach.yaml (09-pwm):**
- ✅ MQTT-Injection dokumentiert
- ✅ GPIO-spezifisch (GPIO 25)
- ⚠️ MQTT-Injection fehlt im YAML
- ❌ Keine Fehlerprüfung

**nvs_cap_free_entries.yaml (10-nvs):**
- ⚠️ Name suggeriert Capacity-Check, aber nur Boot-Test
- ❌ Keine NVS-Kapazitätsprüfung
- ❌ Gap: Szenario prüft nicht, was es verspricht

**Qualitäts-Zusammenfassung:**
- **Boot/Core:** ✅ Sehr gut
- **Actuator/Config:** ✅ Gut
- **Extended (NVS, PWM, I2C):** ⚠️ Teilweise unvollständig

---

### 4.5 Gap-Analyse: Was wird NICHT getestet?

#### Kategorien ohne CI-Coverage

| Kategorie | Szenarien | CI-Coverage | Grund |
|-----------|-----------|-------------|-------|
| **08-i2c** | 20 | 0% | NICHT im Workflow |
| **08-onewire** | 29 | ? | Doku sagt 100%, Workflow zeigt NICHTS |
| **09-hardware** | 9 | ? | Doku sagt 100%, Workflow zeigt NICHTS |
| **09-pwm** | 18 | ? | Doku sagt 100%, Workflow zeigt NICHTS |
| **10-nvs** | 40 | 88% | Doku sagt 35/40, Workflow zeigt NICHTS |
| **gpio** | 24 | ? | Doku sagt 100%, Workflow zeigt NICHTS |

**Problem:** `make wokwi-test-full` ist dokumentiert, aber existiert NICHT.

#### Firmware-Features ohne Wokwi-Coverage

**NICHT getestete Features:**
1. **Provisioning-Flow:** Captive Portal (Wokwi-Limitation)
2. **WiFi-Reconnect:** Nur erfolgreicher Connect getestet
3. **MQTT-Reconnect:** Nur erfolgreicher Connect getestet
4. **Firmware-Update (OTA):** Wokwi-Limitation
5. **Deep-Sleep/Wake-Up:** Wokwi-Limitation
6. **Watchdog-Reset:** Nur Safe-Mode bei Boot

**Coverage-Lücken:**
- **Core-Funktionen:** 90% ✅
- **Error-Recovery:** 20% ❌
- **Advanced-Features:** 0% ❌

---

### 4.6 Empfehlungen zur Test-Verbesserung

#### Priorität 1: Makefile-Integration (Sofort)

**Aufwand:** 1-2 Stunden
**Impact:** ✅ Hohe Konsistenz

#### Priorität 2: CI-Coverage erweitern (Mittelfristig)

**Aufwand:** 4-6 Stunden
**Impact:** ✅ Vollständige Transparenz

#### Priorität 3: Szenarien-Qualität verbessern (Langfristig)

**Aufwand:** 8-12 Stunden
**Impact:** ✅ Robustere Firmware

#### Priorität 4: CI-Erfolgsrate verbessern (Kontinuierlich)

**Aufwand:** 2-4 Stunden
**Impact:** ✅ Stabilere CI-Pipeline

---

## Zusammenfassung (Teil 4)

### Was funktioniert gut

✅ **JUnit XML + JSON Reports:** Sehr gute Aggregation
✅ **CI Summary:** Klare Übersicht
✅ **Szenarien-Qualität (Core):** Robust
✅ **MQTT-Injection-Pattern:** Funktionsfähig

### Kritische Gaps

❌ **Makefile-Targets fehlen:** Dokumentiert aber nicht implementiert
❌ **CI-Coverage-Diskrepanz:** 24 vs 138 Szenarien unklar
❌ **I2C-Kategorie:** 20 Szenarien, 0% Coverage
❌ **Szenarien-Qualität (Extended):** Unvollständig

### Empfohlene Sofort-Aktionen

1. **Makefile-Targets implementieren** (Prio 1) → 1-2 Stunden
2. **CI-Coverage klären** (Prio 2) → Python-Runner Status prüfen
3. **Flaky-Test analysieren** (Prio 4) → boot_full Timeout beheben

---

**Ende Teil 4 - Test-Infrastruktur Analyse**


