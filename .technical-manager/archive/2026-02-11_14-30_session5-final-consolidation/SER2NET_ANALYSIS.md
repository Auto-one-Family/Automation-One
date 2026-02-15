# ser2net Analysis: ESP32 Serial-to-Docker Monitoring Stack

> **Date:** 2026-02-10
> **Agents:** system-control, esp32-development, general-purpose, test-log-analyst, esp32-debug
> **Scope:** Complete analysis for integrating ESP32 serial output into AutomationOne Docker monitoring stack
> **Status:** Complete - All 4 TM-requested parts analyzed + firmware blocker analysis
> **Consolidated from:** `ser2net-analysis-2026-02-10.md` (441 lines) + `ser2net-analysis.md` (657 lines)

---

## Executive Summary

**Machbarkeit:** Ja, aber nicht mit ser2net direkt. Empfehlung: Custom Python `pyserial` Container.

**Kernproblem:** Docker Desktop WSL2 Backend unterstuetzt `--device` USB-Passthrough NICHT nativ. Workaround ueber `usbipd-win` + netzwerk-basierte Bridge ist noetig.

**Empfohlene Architektur:** Python pyserial Service im Docker-Container, der ESP32 Serial-Output parsed und als strukturiertes JSON nach stdout schreibt. Promtail erfasst automatisch via Docker Socket Service Discovery.

**Aufwand:** 10-12h total (inkl. Firmware-Fixes)

**3 FIRMWARE-BLOCKER identifiziert** die VOR der Integration gefixt werden muessen (~55 min).

---

## Teil 1: IST-Zustand Serial-Debugging

### 1.1 Aktuelles Serial-Debugging

Serial-Debugging erfolgt aktuell ausschliesslich ueber PlatformIO Serial Monitor:
- `pio device monitor` in VS Code Terminal
- Monitor-Filter: `esp32_exception_decoder`, `time`, `log2file`, `default`, `send_on_enter`
- Der `time`-Filter fuegt Host-seitige Timestamps hinzu (die ESP32 selbst hat nur `millis()`)
- Der `log2file`-Filter speichert Output lokal als Datei

**Kein** automatischer Transfer in den Monitoring-Stack. Serial-Logs existieren isoliert vom Loki/Grafana-System.

### 1.2 ESP32 Serial-Output Format (4 verschiedene Formate)

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

### 1.4 ANSI Colors

Deaktiviert via `CONFIG_ARDUHAL_LOG_COLORS=0` in allen Build-Environments. Kein Escape-Code-Stripping noetig fuer Parsing.

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

Key parameters:
- **accepter**: Network port to listen on (TCP, UDP, telnet)
- **connector**: Serial device path, baud rate, parity, data bits, stop bits
- **timeout**: Seconds of inactivity before auto-close (0 = disabled)
- **kickolduser**: Disconnect previous client when new one connects

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
| SSL/TLS | Ja | Ja | Nein | Ja (requests lib) |
| Stack-Konsistenz | C (fremd) | C (fremd) | C (fremd) | **Python (nativ)** |

**Empfehlung:** Python pyserial wegen voller Kontrolle ueber Log-Formatierung und Stack-Konsistenz.

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

### 2.5 /dev/ttyUSB Mapping in WSL2

After `usbipd attach`, the device appears in WSL2:

| USB-Serial Chip | Windows COM Port | WSL2 Device | Notes |
|-----------------|-------------------|-------------|-------|
| CP2102 (Silicon Labs) | COM3 | `/dev/ttyUSB0` | Most common on ESP32 DevKits |
| CH340/CH341 | COM4 | `/dev/ttyUSB0` | Common on cheap boards |
| CP2104 | COM5 | `/dev/ttyUSB0` | Seeed Xiao variant |
| Native USB (ESP32-S3/C3) | COMx | `/dev/ttyACM0` | CDC-ACM class |

WSL2 default kernel includes: `cp210x` (CP2102/CP2104), `ch341` (CH340/CH341), `ftdi_sio` (FTDI).

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

### 3.3 Empfohlener Integration-Ansatz

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

### 3.7 Bestehendes Pattern: Wokwi RFC2217

In `wokwi.toml` ist bereits `rfc2217ServerPort = 4000` konfiguriert - konzeptionell identisch mit ser2net (Serial-to-TCP Bridge). Validiert den Ansatz.

### 3.8 Conceptual Python Service

```python
"""
esp32_serial_logger.py - Reads ESP32 serial output, formats as structured JSON to stdout.
Promtail captures stdout via Docker log driver.
"""
import serial
import json
import sys
import time
import re
import os
from datetime import datetime

SERIAL_PORT: str = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
SERIAL_BAUD: int = int(os.getenv("SERIAL_BAUD", "115200"))
DEVICE_ID: str = os.getenv("DEVICE_ID", "esp32-unknown")
RECONNECT_INTERVAL: int = 5  # seconds

# Pattern for ESP32 LOG_* macros: "[I][module:line] message"
ESP_LOG_PATTERN = re.compile(
    r'^\[([EWIDV])\]\[(\w+):(\d+)\]\s*(.*)'
)

def parse_level(char: str) -> str:
    """Map ESP-IDF log level character to standard level."""
    mapping = {"E": "error", "W": "warning", "I": "info", "D": "debug", "V": "trace"}
    return mapping.get(char, "info")

def emit_log(level: str, message: str, component: str = "serial") -> None:
    """Output structured JSON to stdout for Promtail capture."""
    log_entry = {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "level": level,
        "device_id": DEVICE_ID,
        "component": component,
        "message": message.strip()
    }
    print(json.dumps(log_entry), flush=True)

def main() -> None:
    emit_log("info", f"Starting serial logger for {SERIAL_PORT} at {SERIAL_BAUD} baud", "logger")
    while True:
        try:
            with serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1) as ser:
                emit_log("info", f"Connected to {SERIAL_PORT}", "logger")
                while True:
                    line = ser.readline().decode("utf-8", errors="replace")
                    if not line:
                        continue
                    match = ESP_LOG_PATTERN.match(line)
                    if match:
                        level_char, module, lineno, msg = match.groups()
                        emit_log(parse_level(level_char), msg, module)
                        continue
                    emit_log("info", line)
        except serial.SerialException as e:
            emit_log("warning", f"Serial disconnected: {e}. Retrying in {RECONNECT_INTERVAL}s", "logger")
            time.sleep(RECONNECT_INTERVAL)
        except Exception as e:
            emit_log("error", f"Unexpected error: {e}", "logger")
            time.sleep(RECONNECT_INTERVAL)

if __name__ == "__main__":
    main()
```

---

## Teil 4: Machbarkeit & Risiken

### 4.1 Machbarkeits-Bewertung

| Aspekt | Bewertung | Begruendung |
|--------|-----------|-------------|
| **ser2net unter Windows/WSL2/Docker** | **Machbar mit Einschraenkungen** | Device-Passthrough ist das Hauptproblem; TCP-Bridge Workaround funktioniert |
| **USB-Passthrough Kette** | **Machbar, mittlere Zuverlaessigkeit** | usbipd-win funktioniert, aber Hot-Plug erfordert manuelle Intervention |
| **Promtail/Loki Integration** | **Trivial** | Docker Socket SD erfasst neue Container automatisch |
| **Log-Parsing** | **Machbar, 4 Formate** | Multi-Stage Pipeline oder Python Pre-Processing |
| **Multi-Device** | **Skaliert linear** | Ein Container/Config pro Device |

### 4.2 Risiko-Matrix

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|--------|---------------------|--------|------------|
| USB-Passthrough instabil | Mittel | Hoch | Auto-Attach + Reconnect-Logic |
| ESP32 Reset bei Serial-Connect | Hoch | Niedrig | `local` Option (DTR/RTS ignorieren) |
| Log-Volumen ueberfordert Loki | Niedrig | Mittel | Log-Level auf WARNING oder Rate-Limiter |
| WSL2 Device verschwindet | Mittel | Mittel | usbipd `--auto-attach` + Health-Check |
| Mehrere Devices: Port-Konflikte | Niedrig | Niedrig | Dedizierte TCP-Ports pro Device |

### 4.3 Performance

**Latency Chain: Serial -> Network -> Container -> Loki**

| Stage | Latency | Controllable? |
|-------|---------|---------------|
| Serial TX at 115200 baud | ~87us per byte | Fixed by baud rate |
| USB-Serial chip buffering | 1-10ms | Chip-dependent |
| USB/IP over usbipd | 1-5ms | Minor overhead |
| ser2net/socat forwarding | <1ms | Negligible |
| **Promtail scrape interval** | **1-5s** | **Yes - primary bottleneck** |
| **Loki batch push** | **1-5s** | **Yes - configurable** |
| Grafana refresh | 1-5s | Yes - dashboard setting |

**Total end-to-end: ~5-15 seconds typical.** Serial-to-network bridging adds negligible latency (~10ms). Real latency comes from Promtail scraping + Loki batch push.

At 115200 baud: ~11.5 KB/s maximum serial throughput. Trivial for Promtail/Loki.

---

## Teil 5: Firmware-Blocker (KRITISCH - VOR Integration fixen)

### 5.1 Uebersicht

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

---

## Teil 6: Hot-Plug Verhalten

### Was passiert bei ESP32 Disconnect

```
1. USB physically disconnected
2. Windows detects USB removal -> COM port disappears
3. usbipd-win: device becomes "Not shared" (if no auto-attach)
4. WSL2: /dev/ttyUSB0 disappears
5. Docker container: serial device becomes invalid
6. Tool-spezifisch:
   - ser2net: logs error, keeps listening, waits for device to return
   - socat: process exits (needs external restart)
   - Python pyserial: depends on implementation (can loop and retry)
```

### Was passiert bei ESP32 Reconnect

```
1. USB physically connected
2. Windows detects USB -> new COM port assigned (may be different number)
3. usbipd-win:
   - Without auto-attach: manual `usbipd attach --wsl` required
   - With auto-attach: automatically re-attaches (if loop is running)
4. WSL2: /dev/ttyUSB0 reappears (may be ttyUSB1 if previous wasn't cleaned)
5. Docker container: device reappears ONLY if using volume mount (/dev:/dev)
6. ser2net: connection re-establishes (if device path unchanged)
```

### Auto-Attach at Windows Boot

```powershell
# Using Windows Task Scheduler
$action = New-ScheduledTaskAction -Execute "usbipd" `
  -Argument "attach --wsl --auto-attach --hardware-id 10C4:EA60"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" `
  -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -Action $action -Trigger $trigger `
  -Principal $principal -TaskName "usbipd-esp32"
```

`usbipd-win 4.4.0` added `--unplugged` option for auto-attaching devices that are currently not plugged in.

---

## Teil 7: Known Issues

### Docker Desktop + WSL2

| Issue | Description | Severity |
|-------|-------------|----------|
| **No native USB support** | Docker Desktop WSL2 backend cannot see USB devices ([Issue #4271](https://github.com/docker/for-win/issues/4271)) | Blocking |
| **`--device` ignored** | Device mapping flags silently fail on Docker Desktop WSL2 ([Issue #1018](https://github.com/docker/for-win/issues/1018)) | Blocking |
| **usbipd required** | Must use usbipd-win as intermediary | Workaround exists |
| **WSL restart needed** | Sometimes WSL2 must be restarted before device attaches ([Issue #1092](https://github.com/dorssel/usbipd-win/issues/1092)) | Intermittent |

### usbipd-win Specific

| Issue | Description | Impact |
|-------|-------------|--------|
| **Manual re-attach** | Device must be re-attached after every disconnect/reconnect | High (workflow friction) |
| **Auto-attach is foreground** | `--auto-attach` runs in a foreground loop, not as a background service | Medium |
| **CH340 errors** | Attaching CH340 devices can cause errors ([Issue #804](https://github.com/dorssel/usbipd-win/issues/804)) | Board-specific |
| **Device not visible** | After attach, /dev/ttyUSB0 sometimes doesn't appear ([Issue #1074](https://github.com/dorssel/usbipd-win/issues/1074)) | Intermittent |

### ESP32 Specific

| Issue | Description | Mitigation |
|-------|-------------|------------|
| **ESP32 reset on connect** | Many ESP32 boards reset when serial connection opens (DTR/RTS) | Use `local` option in ser2net to ignore modem control |
| **Boot log flood** | ESP32 outputs bootloader messages at 74880 baud, then switches to 115200 | Ignore first ~2 seconds of output |
| **Watchdog output** | Crash dumps are unstructured text | Promtail regex must handle or skip |

---

## Teil 8: Empfehlungen an TM

### Sofortige Entscheidungen noetig:

1. **FIRMWARE ZUERST:** 3 Blocker muessen vor ser2net-Integration gefixt werden (~55 min). Soll esp32-dev das umsetzen?
2. **Ansatz waehlen:** Python pyserial (strukturiert, 9-12h) ODER ser2net basic (unstrukturiert, 5-6h)?
3. **Docker Desktop vs Docker Engine in WSL2:** Aktuell Docker Desktop. Soll der TCP-Bridge-Workaround (Option C) verwendet werden?
4. **Neues Profil `hardware`:** Soll dies unabhaengig von `monitoring` und `devtools` sein?

### Empfohlene Implementierungsreihenfolge

```
Phase 0: Firmware-Preparation (esp32-dev, ~55 min)
  0.1  LOOP-Traces LOG_INFO -> LOG_DEBUG (5 min)
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
  3.1  End-to-End Test: ESP32 Serial -> Grafana
  3.2  Hot-Plug Test
  3.3  Dokumentation
```

### Aufwand-Schaetzung

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
- [ser2net GitHub (official)](https://github.com/cminyard/ser2net)
- [jippi/docker-ser2net](https://github.com/jippi/docker-ser2net)
- [socat serial bridge](https://www.digi.com/support/knowledge-base/serial-to-ethernet-or-wifi-bridge-with-linux-socat)
- [pySerial Documentation](https://pyserial.readthedocs.io/en/latest/examples.html)

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
- `docker/promtail/config.yml` - Docker Socket SD, Pipeline-Stages

---

*Konsolidiert aus ser2net-analysis.md + ser2net-analysis-2026-02-10.md am 2026-02-11.*
