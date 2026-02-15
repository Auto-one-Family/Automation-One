# ser2net Analysis: ESP32 Serial-to-Docker Monitoring Stack

> **Date:** 2026-02-10
> **Agents:** /system-control, /esp32-development, /general-purpose, /test-log-analyst, /esp32-debug
> **Scope:** Complete analysis for integrating ESP32 serial output into AutomationOne Docker monitoring stack
> **Status:** Complete - All 4 TM-requested parts analyzed

---

## Executive Summary

**Machbarkeit:** Ja, aber nicht mit ser2net direkt. Empfehlung: Custom Python `pyserial` Container.

**Kernproblem:** Docker Desktop WSL2 Backend unterstuetzt `--device` USB-Passthrough NICHT nativ. Workaround ueber `usbipd-win` + netzwerk-basierte Bridge ist noetig.

**Empfohlene Architektur:** Python pyserial Service im Docker-Container, der ESP32 Serial-Output parsed und als strukturiertes JSON nach stdout schreibt. Promtail erfasst automatisch via Docker Socket Service Discovery.

**Aufwand:** 8-11h (Python-Ansatz) vs. 5-6h (ser2net basic, unstrukturiert)

---

## Teil 1: IST-Zustand Serial-Debugging

### 1.1 Aktuelles Serial-Debugging

Serial-Debugging erfolgt aktuell ausschliesslich ueber PlatformIO Serial Monitor:
- `pio device monitor` in VS Code Terminal
- Monitor-Filter: `esp32_exception_decoder`, `time`, `log2file`, `default`, `send_on_enter`
- Der `time`-Filter fuegt Host-seitige Timestamps hinzu (die ESP32 selbst hat nur `millis()`)
- Der `log2file`-Filter speichert Output lokal als Datei

**Kein** automatischer Transfer in den Monitoring-Stack. Serial-Logs existieren isoliert vom Loki/Grafana-System.

### 1.2 ESP32 Serial-Output Format (3 verschiedene Formate)

**Format 1: Custom Logger (dominant, 1324 Vorkommen in 27 Dateien)**
```
[      1234] [INFO    ] Logger system initialized
[      5678] [WARNING ] SensorManager: Sensor timeout on GPIO 4
[     12345] [ERROR   ] MQTTClient initialization failed!
[     67890] [CRITICAL] BOOT LOOP DETECTED - SAFE MODE
```
Format: `[%10lu] [%-8s] %s\n` - millis() Timestamp, Level (8 chars padded), Message
Promtail-Regex: `^\[\s*(?P<timestamp>\d+)\]\s+\[(?P<level>\w+)\s*\]\s+(?P<message>.*)$`

**Format 2: Direct Serial.print (Boot-Phase, 161 Vorkommen in 4 Dateien)**
```
+========================================+
|  ESP32 Sensor Network v4.0 (Phase 2)  |
+========================================+
Chip Model: ESP32
CPU Frequency: 240 MHz
Free Heap: 287456 bytes
```
Unstrukturierter Plaintext mit Unicode Box-Drawing Characters. Nur waehrend Boot.

**Format 3: MQTT Debug JSON (mqtt_client.cpp, 127 Aufrufe, temporaer)**
```
[DEBUG]{"id":"mqtt_connect_entry","timestamp":1234,"location":"mqtt_client.cpp:84","message":"MQTT connect() called","data":{...}}
```
Strukturiertes JSON mit `[DEBUG]` Prefix. Temporaere Debug-Instrumentierung.

**Format 4: ESP-IDF SDK interne Logs**
```
E (1234) wifi: connect failed
W (5678) mqtt: buffer full
```
Format: `<level_letter> (<millis>) <tag>: <message>`

### 1.3 USB-Serial Chips

| Board | USB-Serial Interface | WSL2 Device | Treiber |
|-------|---------------------|-------------|---------|
| ESP32 WROOM-32 Dev | CP2102 oder CH340 (extern) | `/dev/ttyUSB0` | cp210x / ch341 |
| XIAO ESP32-C3 | Native USB-JTAG (built-in) | `/dev/ttyACM0` | CDC-ACM |

### 1.4 Kritisches Finding: Hohes Log-Volumen

Der `loop()` in main.cpp produziert **14-20 LOG_INFO Zeilen pro Iteration** bei ~10ms Loop-Intervall = **1400-2000 Zeilen/Sekunde**. Das ist nahe am 115200 Baud Limit (~11.5 KB/s). Fuer ser2net/Promtail-Integration ist Rate-Limiting oder Log-Level-Erhoehung noetig.

### 1.5 ANSI Colors

Deaktiviert via `CONFIG_ARDUHAL_LOG_COLORS=0` in allen Build-Environments. Wichtig: Kein Escape-Code-Stripping noetig fuer Parsing.

---

## Teil 2: ser2net Technologie-Analyse

### 2.1 Was ist ser2net?

Linux-Daemon der bidirektionale Bruecken zwischen seriellen Geraeten und Netzwerk-Ports erstellt.

- **Repo:** [cminyard/ser2net](https://github.com/cminyard/ser2net) (aktiv gewartet)
- **Konfig:** YAML (`/etc/ser2net/ser2net.yaml`)
- **Protokolle:** Raw TCP, Telnet (RFC 2217), SSL/TLS
- **Hot-Reload:** SIGHUP laedt Config ohne Restart

```yaml
connection: &esp32-serial
  accepter: tcp,3333
  connector: serialdev,/dev/ttyUSB0,115200n81,local
  options:
    kickolduser: true
```

### 2.2 Docker Images

Kein offizielles Image. Beste Community-Option:

| Image | Quelle | Status |
|-------|--------|--------|
| `ghcr.io/jippi/docker-ser2net` | [jippi/docker-ser2net](https://github.com/jippi/docker-ser2net) | Aktiv, populaer |
| `jbouwh/ser2net` | [jbouwh/ser2net](https://github.com/jbouwh/ser2net) | Aktiv |
| `akshmakov/serialport-server` | socat-Wrapper | Multi-Arch |

### 2.3 Alternativen-Vergleich

| Kriterium | ser2net | socat | remserial | **Python pyserial** |
|-----------|---------|-------|-----------|---------------------|
| Setup-Komplexitaet | Niedrig | Mittel | Niedrig | Hoch (Custom Code) |
| Auto-Reconnect | Teilweise | Nein | Nein | **Voll kontrollierbar** |
| Hot-Plug | SIGHUP Reload | Crasht | Crasht | **Custom Watchdog** |
| Log-Formatierung | Raw Passthrough | Raw Passthrough | Raw Passthrough | **Volle Kontrolle** |
| Loki-Integration | Via Promtail | Via Promtail | Via Promtail | **Direkt oder Promtail** |
| Multi-Device | YAML pro Device | Ein Prozess/Device | Ein Prozess/Device | **Single Service, Multi-Port** |
| Stack-Konsistenz | C (fremd) | C (fremd) | C (fremd) | **Python (nativ)** |

### 2.4 USB-Passthrough: Windows -> WSL2 -> Docker

```
ESP32 (USB) --> Windows Host (COM3) --> usbipd-win --> WSL2 (/dev/ttyUSB0) --> Docker Container
```

**Tool:** `usbipd-win` v4.4.0 ([dorssel/usbipd-win](https://github.com/dorssel/usbipd-win))
- Installation: `winget install dorssel.usbipd-win`
- Einmaliger Bind (Admin): `usbipd bind --busid <BUSID>`
- Attach pro Session: `usbipd attach --wsl --busid <BUSID>`
- Auto-Attach: `usbipd attach --wsl --auto-attach --hardware-id <VID:PID>`

**Kritische Limitation:** Docker Desktop WSL2-Backend unterstuetzt `--device` fuer USB NICHT nativ.

**3 Workaround-Optionen:**

| Option | Ansatz | Zuverlaessigkeit |
|--------|--------|-------------------|
| A | Docker Engine direkt in WSL2 (nicht Docker Desktop) | Hoch |
| B | Docker Desktop + `privileged: true` + `/dev:/dev` | Niedrig (unsicher) |
| **C** | **ser2net/socat nativ in WSL2, Docker connected via TCP** | **Hoechste** |

**Empfehlung: Option C** - ser2net/socat laeuft in WSL2, exponiert TCP-Port, Python-Container im Docker-Stack connected via TCP. Vermeidet Device-Passthrough komplett.

---

## Teil 3: Integration in den Docker-Stack

### 3.1 Bestehender Stack (IST-Zustand)

11 Docker Services, 3 Profile:
- **default (4):** postgres, mqtt-broker, el-servador, el-frontend
- **monitoring (6):** loki, promtail, prometheus, grafana, postgres-exporter, mosquitto-exporter
- **devtools (1):** pgadmin

**Kein** Device-Passthrough konfiguriert. Keine `devices:` Section, kein `privileged: true`.

### 3.2 Promtail Logging-Architektur

Promtail nutzt **Docker Socket Service Discovery**:
```yaml
docker_sd_configs:
  - host: unix:///var/run/docker.sock
    refresh_interval: 5s
    filters:
      - name: label
        values: ["com.docker.compose.project=auto-one"]
```

**Implikation:** Jeder neue Container im selben Compose-Projekt wird automatisch erfasst. Ein neuer Container der nach stdout loggt braucht **keine Promtail-Konfigurationsaenderung** fuer Basis-Erfassung.

### 3.3 Empfohlener Integration-Ansatz: Option A (stdout -> Promtail)

```
ESP32 --> USB --> usbipd --> WSL2 /dev/ttyUSB0
                               |
                    [socat/ser2net in WSL2, TCP:3333]
                               |
              [Docker: esp32-serial-logger]
                    Python + pyserial (TCP-Client)
                               |
                         stdout (JSON)
                               |
              [Promtail docker_sd_configs] --> [Loki] --> [Grafana]
```

**Warum Option A (stdout):** Promtail erfasst Container-Logs automatisch. Keine Zusatz-Konfiguration noetig. Strukturiertes JSON ermoeglicht Label-Extraktion.

### 3.4 Docker Compose Service-Definition

```yaml
  # ============================================
  # ESP32 Serial Logger - Profile: hardware
  # ============================================
  esp32-serial-logger:
    build:
      context: ./docker/esp32-serial-logger
      dockerfile: Dockerfile
    container_name: automationone-esp32-serial
    profiles: ["hardware"]
    environment:
      SERIAL_HOST: host.docker.internal   # WSL2 Host wo ser2net/socat laeuft
      SERIAL_PORT: "3333"                 # TCP-Port von ser2net
      DEVICE_ID: "esp32-xiao-01"
      LOG_FORMAT: "structured"
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
    networks:
      - automationone-net
    restart: unless-stopped
```

**Neues Profil: `hardware`** - Aktiv nur wenn physische ESP32-Hardware angeschlossen. Unabhaengig von `monitoring` und `devtools`.

### 3.5 Promtail Pipeline-Stage

```yaml
      # Stage 4: ESP32 Serial Logger - Parse structured JSON output
      - match:
          selector: '{compose_service="esp32-serial-logger"}'
          stages:
            - json:
                expressions:
                  level: level
                  device: device_id
                  component: component
            - labels:
                level:
                device:
                component:
```

### 3.6 Label-Strategie fuer Multiple Devices

| Label | Quelle | Beispiel | Kardinalitaet |
|-------|--------|----------|---------------|
| `compose_service` | Docker-Label (auto) | `esp32-serial-logger` | 1 |
| `level` | JSON-Parsing | `info`, `warning`, `error` | 5 |
| `device` | JSON-Parsing (aus Env) | `esp32-xiao-01` | Pro Device |
| `component` | JSON-Parsing | `serial`, `logger`, `mqtt` | ~10 |

Fuer mehrere Devices: Ein Container pro Device, unterschieden durch `DEVICE_ID` Environment-Variable.

---

## Teil 4: Machbarkeit & Risiken

### 4.1 Machbarkeits-Bewertung

| Aspekt | Bewertung | Begruendung |
|--------|-----------|-------------|
| **ser2net unter Windows/WSL2/Docker** | **Machbar mit Einschraenkungen** | Device-Passthrough ist das Hauptproblem; TCP-Bridge Workaround funktioniert |
| **USB-Passthrough Kette** | **Machbar, mittlere Zuverlaessigkeit** | usbipd-win funktioniert, aber Hot-Plug erfordert manuelle Intervention |
| **Promtail/Loki Integration** | **Trivial** | Docker Socket SD erfasst neue Container automatisch |
| **Log-Parsing** | **Machbar, 3 Formate** | Multi-Stage Pipeline oder Python Pre-Processing |
| **Multi-Device** | **Skaliert linear** | Ein Container/Config pro Device |

### 4.2 Risiko-Matrix

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|---------------------|--------|------------|
| USB-Passthrough instabil | Mittel | Hoch | Auto-Attach + Reconnect-Logic |
| ESP32 Reset bei Serial-Connect | Hoch | Niedrig | `local` Option (DTR/RTS ignorieren) |
| Log-Volumen ueberfordert Loki | Niedrig | Mittel | Log-Level auf WARNING oder Rate-Limiter |
| WSL2 Device verschwindet | Mittel | Mittel | usbipd `--auto-attach` + Health-Check |
| Mehrere Devices: Port-Konflikte | Niedrig | Niedrig | Dedizierte TCP-Ports pro Device |

### 4.3 Bestehendes Pattern: Wokwi RFC2217

In `wokwi.toml` ist bereits `rfc2217ServerPort = 4000` konfiguriert - konzeptionell identisch mit ser2net (Serial-to-TCP Bridge). Validiert den Ansatz.

### 4.4 Aufwand-Schaetzung

| Komponente | Aufwand | Notizen |
|------------|---------|---------|
| usbipd-win Setup | 1h | Install + Bind + Test |
| WSL2 socat/ser2net nativ | 1h | TCP-Bridge auf Port 3333 |
| Python Serial Logger Container | 4-6h | Code + Dockerfile + Tests |
| Promtail Pipeline Stage | 1h | Match Selector + JSON Parser |
| Grafana Dashboard Panel | 1-2h | ESP32 Serial Log Panel |
| Dokumentation | 1h | Setup Guide fuer `hardware` Profile |
| **Total (empfohlen)** | **9-12h** | Python + TCP-Bridge Ansatz |
| **Total (minimal)** | **5-6h** | ser2net direkt, unstrukturiert |

---

## Teil 5: Firmware-Analyse (Blocker fuer ser2net-Streaming)

> Ergaenzt durch test-log-analyst und esp32-development Analyse

### 5.1 KRITISCH: 3 Firmware-Blocker identifiziert

| # | Blocker | Schwere | Aufwand Fix |
|---|---------|---------|-------------|
| **B1** | **Log-Volumen: ~214 Zeilen/s uebersteigt Baud-Rate** | BLOCKING | 5 min |
| **B2** | **MQTT Debug JSON: 127 fragmentierte Serial.print (0 println)** | HIGH | 30 min |
| **B3** | **Keine Runtime Log-Level Steuerung** | MEDIUM | 20 min |

### 5.2 B1: Log-Volumen (BLOCKING)

- **14** `LOG_INFO("LOOP[n]...")` Messages pro Loop-Iteration
- Bei ~100 Iterationen/s: **~84 KB/s** theoretischer Output
- UART-Bandbreite bei 115200 Baud: nur **~11.5 KB/s**
- **Ergebnis:** Serial-Buffer laeuft voll, Zeilen gehen verloren
- 12 von 17 Zeilen pro Loop sind Trace-Messages die nie entfernt wurden
- **~50 MB/Stunde** pro ESP32 in Loki (unnoetig)

**Fix (P1, 5 min):** 14x `LOG_INFO` auf `LOG_DEBUG` aendern in `main.cpp` Loop-Funktion. Reduziert Volumen um ~70%.

### 5.3 B2: MQTT Debug JSON Fragmentierung (HIGH)

- **127 von 128** `Serial.print()` Aufrufen der gesamten Codebase sind in `mqtt_client.cpp`
- **0** `Serial.println()` in mqtt_client.cpp
- 13 `#region agent log` Bloecke, jeweils ~10 aufeinanderfolgende `Serial.print()` die zusammen EINE JSON-Zeile bilden
- **Problem fuer ser2net:** Jeder Block wird in bis zu 10 TCP-Pakete fragmentiert
- Ein Line-Parser (Promtail oder Python) bekommt **halbe JSON-Zeilen**

**Fix (P2, 30 min):** `#ifdef ENABLE_AGENT_DEBUG_LOGS` Guard um alle 13 Bloecke. Default: deaktiviert.

### 5.4 B3: Keine Runtime Log-Level Steuerung (MEDIUM)

- Kein MQTT-Command fuer Log-Level Wechsel
- Kein `#ifdef DEBUG` oder Feature-Flag
- `feature_flags.h` ist leer
- Logger hat `setLogLevel()` Methode, wird aber nur einmal bei Boot gesetzt

**Fix (P3, 20 min):** `set_log_level` MQTT-Command. Pattern existiert bereits vollstaendig im System-Command-Handler.

### 5.5 Logger Thread-Safety

- Kein Mutex, kein Schutz auf Circular Buffer (50 Eintraege, ~6.8 KB)
- Aktuell kein Problem (single-threaded Arduino loop)
- StorageManager hat fertiges Mutex-Pattern (`CONFIG_ENABLE_THREAD_SAFETY`) zum Kopieren
- **Fuer ser2net nicht blocking** - wird erst bei Multithread-Erweiterung relevant

### 5.6 Wokwi-Testabdeckung fuer Serial-Output

- **163 Szenarios** in 13 Kategorien mit **894 `wait-serial` Steps**
- Alle nutzen ausschliesslich Substring-Match (kein Regex)
- Validieren Format 1 (Custom Logger) und Format 2 (Boot Banner)
- **Kein Szenario testet Log-Volumen oder Fragmentierung**

### 5.7 Empfohlene Reihenfolge der Firmware-Fixes

```
Phase 0 (VOR ser2net-Integration, ~55 min total):
  P1 (5 min):  LOOP-Traces LOG_INFO → LOG_DEBUG
  P2 (30 min): #ifdef Guard um MQTT Debug JSON
  P3 (20 min): set_log_level MQTT-Command

Phase 1: ser2net-Container aufsetzen (wie Teil 3)
Phase 2: Promtail Pipeline + Grafana Panel
Phase 3: End-to-End Test
```

---

## Empfehlungen an TM

### Sofortige Entscheidungen noetig:

1. **FIRMWARE ZUERST:** 3 Blocker muessen vor ser2net-Integration gefixt werden (~55 min). Soll esp32-dev das umsetzen?
2. **Ansatz waehlen:** Python pyserial (strukturiert, 9-12h) ODER ser2net basic (unstrukturiert, 5-6h)?
3. **Docker Desktop vs Docker Engine in WSL2:** Aktuell Docker Desktop. Soll der TCP-Bridge-Workaround (Option C) verwendet werden?
4. **Neues Profil `hardware`:** Soll dies unabhaengig von `monitoring` und `devtools` sein?

### Empfohlene Reihenfolge:

```
Phase 0: Firmware-Preparation (esp32-dev, ~55 min)
  0.1  LOOP-Traces LOG_INFO → LOG_DEBUG (5 min)
  0.2  #ifdef Guard um MQTT Debug JSON (30 min)
  0.3  set_log_level MQTT-Command (20 min)
  0.4  pio run -e esp32_dev (Build-Verifikation)

Phase 1: Infrastructure (system-control, ~3h)
  1.1  usbipd-win installieren und ESP32 USB binden
  1.2  socat in WSL2 als TCP-Bridge konfigurieren
  1.3  Basis-Test: Serial-Output via TCP lesbar

Phase 2: Container + Monitoring (server-dev + system-control, ~5-7h)
  2.1  Python Serial Logger Container implementieren
  2.2  Docker Compose Service + hardware Profile
  2.3  Promtail Pipeline-Stage hinzufuegen
  2.4  Grafana Dashboard-Panel erstellen

Phase 3: Verification (~1h)
  3.1  End-to-End Test: ESP32 Serial → Grafana
  3.2  Hot-Plug Test
  3.3  Dokumentation
```

### Gesamtaufwand revidiert:

| Phase | Aufwand | Agents |
|-------|---------|--------|
| Phase 0: Firmware | ~1h | esp32-dev |
| Phase 1: Infra | ~3h | system-control (Robin manuell) |
| Phase 2: Container | ~5-7h | server-dev, system-control |
| Phase 3: Verify | ~1h | test-log-analyst |
| **Total** | **~10-12h** | |

---

## Quellen

### Technologie
- [ser2net GitHub](https://github.com/cminyard/ser2net)
- [jippi/docker-ser2net](https://github.com/jippi/docker-ser2net)
- [socat serial bridge](https://www.digi.com/support/knowledge-base/serial-to-ethernet-or-wifi-bridge-with-linux-socat)
- [pySerial Docs](https://pyserial.readthedocs.io/en/latest/examples.html)

### USB-Passthrough
- [usbipd-win GitHub](https://github.com/dorssel/usbipd-win)
- [Microsoft: USB devices to WSL](https://devblogs.microsoft.com/commandline/connecting-usb-devices-to-wsl/)
- [Docker for Windows Serial Port Issue #4271](https://github.com/docker/for-win/issues/4271)
- [MCU on Eclipse: USB in Docker](https://mcuoneclipse.com/2025/10/26/using-windows-usb-devices-and-debug-probes-inside-docker-dev-container/)

### Monitoring-Stack
- [Grafana Promtail Pipelines](https://grafana.com/docs/loki/latest/send-data/promtail/pipelines/)
- [ESP-IDF Logging Library](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/log.html)

### Codebase-Analyse
- `El Trabajante/src/utils/logger.h` + `logger.cpp` - Custom Logger Singleton
- `El Trabajante/platformio.ini` - Serial-Konfiguration (115200 Baud)
- `El Trabajante/src/main.cpp` - Loop-Trace-Logging (Zeilen 1853-1981)
- `El Trabajante/src/services/communication/mqtt_client.cpp` - Debug JSON (127 Aufrufe)
- `El Trabajante/wokwi.toml` - RFC2217 Port 4000 (bestehendes Pattern)
- `docker-compose.yml` - 11 Services, 3 Profile, kein Device-Passthrough
- `docker/promtail/promtail-config.yml` - Docker Socket SD, Pipeline-Stages
