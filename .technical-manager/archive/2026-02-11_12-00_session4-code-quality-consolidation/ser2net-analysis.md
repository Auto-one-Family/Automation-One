# ser2net Analysis: ESP32 Serial-to-Docker Monitoring Stack

> **Date:** 2026-02-10
> **Scope:** Technology research for bridging ESP32 serial output into AutomationOne Docker monitoring stack on Windows/WSL2
> **Status:** Complete

---

## 1. What is ser2net?

### Overview

ser2net (Serial to Network) is a Linux daemon that creates bidirectional bridges between serial devices and network ports. It allows TCP/IP or telnet sessions to be established with serial ports, effectively making physical serial devices accessible over a network.

**Repository:** [cminyard/ser2net](https://github.com/cminyard/ser2net) (official, actively maintained)

### How It Works

1. The daemon reads a configuration file (`/etc/ser2net/ser2net.yaml`)
2. It opens the configured network ports and waits for incoming connections
3. When a client connects via TCP, it opens the serial device and establishes a bidirectional data bridge
4. Data flows transparently: `TCP Client <---> ser2net <---> Serial Device`

### Configuration (YAML format, modern versions)

```yaml
connection: &esp32-serial
  accepter: tcp,3333
  connector: serialdev,/dev/ttyUSB0,115200n81,local
  options:
    banner: *banner
    kickolduser: true
```

Key parameters:
- **accepter**: Network port to listen on (TCP, UDP, telnet)
- **connector**: Serial device path, baud rate, parity, data bits, stop bits
- **timeout**: Seconds of inactivity before auto-close (0 = disabled)
- **kickolduser**: Disconnect previous client when new one connects

### Supported Protocols

- Raw TCP (direct byte stream)
- Telnet (with RFC 2217 for serial port control)
- SSL/TLS (encrypted connections)

### Signal Handling

- `SIGHUP`: Reloads configuration file without restart
- Supports chardelay for timing-sensitive serial protocols
- Configurable buffer sizes (`net-to-dev-bufsize`, `dev-to-net-bufsize`)

---

## 2. Available Docker Images for ser2net

### Community Images (no official image exists)

| Image | Source | Status | Notes |
|-------|--------|--------|-------|
| `ghcr.io/jippi/docker-ser2net` | [jippi/docker-ser2net](https://github.com/jippi/docker-ser2net) | Active | Most popular, supports YAML config |
| `jbouwh/ser2net` | [jbouwh/ser2net](https://github.com/jbouwh/ser2net) | Active | DSRM-to-TCP adapter focus |
| `jippi/ser2net` | [Docker Hub](https://hub.docker.com/r/jippi/ser2net) | Active | Mirror of GitHub image |
| `danrue/ser2net` | [Docker Hub](https://hub.docker.com/r/danrue/ser2net) | Older | Less maintained |

### Docker Run Example (jippi)

```bash
docker run --name ser2net \
  --network=host \
  --restart=unless-stopped \
  --detach \
  --volume $(pwd)/ser2net.yaml:/etc/ser2net/ser2net.yaml \
  --device /dev/ttyUSB0 \
  ghcr.io/jippi/docker-ser2net
```

### Docker Compose Example

```yaml
services:
  ser2net:
    image: ghcr.io/jippi/docker-ser2net
    restart: unless-stopped
    network_mode: host
    volumes:
      - ./ser2net.yaml:/etc/ser2net/ser2net.yaml:ro
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
```

---

## 3. Alternatives Analysis

### 3.1 socat (SOcket CAT)

**What it is:** A multipurpose relay tool that establishes bidirectional data channels between two endpoints (files, pipes, devices, sockets, etc.).

**Serial bridge command:**
```bash
socat tcp-l:4001,fork,keepalive,nodelay,reuseaddr /dev/ttyACM0,b115200,raw
```

**Docker image:** `akshmakov/serialport-server` (wraps socat, multi-arch)

**Pros:**
- Extremely flexible (supports SSL, IPv6, UNIX sockets, pipes)
- Available in most Linux package managers
- Can chain multiple transformations
- Supports fork mode (multiple simultaneous clients)

**Cons:**
- More complex command-line syntax
- Breaks connection when serial port disappears (no auto-reconnect)
- Process exits when network closes; must be restarted externally
- Not designed as a long-running daemon like ser2net

### 3.2 remserial

**What it is:** A lightweight TCP-to-serial bridge, simpler than ser2net.

**Repository:** [hunterli/remserial](https://github.com/hunterli/remserial)

**Pros:**
- Very simple, minimal footprint
- Supports pseudo-TTYs

**Cons:**
- Does NOT handle RFC 2217 (no remote serial port control)
- "Good enough for basic shoveling data back and forth" only
- No active development/maintenance
- No official Docker image
- No auto-reconnect or hot-plug handling

### 3.3 Custom Python Service (pyserial + Loki Push)

**What it is:** A custom Python container that reads serial data with `pyserial` and either:
- Writes to stdout (Promtail captures via Docker log driver)
- Pushes directly to Loki API
- Writes to a file that Promtail scrapes

**Key libraries:**
- `pyserial` (serial port access)
- `ser2sock` (multi-serial-line TCP bridge, Python 2.6-3.x)
- `ser2tcp` (simple proxy using pyserial, by pavelrevak)

**Pros:**
- Full control over log format, parsing, and label injection
- Can add structured metadata (ESP device ID, timestamp, log level)
- Can implement intelligent reconnection logic
- Can push directly to Loki API (skip Promtail entirely)
- Familiar Python ecosystem, fits existing server stack
- Can parse ESP32 Serial.printf() output into structured data

**Cons:**
- Must be built and maintained as a custom service
- Additional Dockerfile to maintain
- Python runtime overhead (larger image than C-based ser2net)
- Needs careful error handling for serial disconnection

### 3.4 Comparison Matrix

| Criterion | ser2net | socat | remserial | Python pyserial |
|-----------|---------|-------|-----------|-----------------|
| **Setup complexity** | Low | Medium | Low | High (custom code) |
| **Docker images** | Community | Community | None | Custom build |
| **Auto-reconnect** | Partial (runs as service) | No | No | Custom (full control) |
| **Hot-plug handling** | Config reload via SIGHUP | Crashes | Crashes | Custom (watchdog loop) |
| **Log formatting** | Raw passthrough | Raw passthrough | Raw passthrough | Full control |
| **Loki integration** | Via stdout + Promtail | Via stdout + Promtail | Via stdout + Promtail | Direct push or stdout |
| **Multi-device** | YAML config per device | One process per device | One process per device | Single service, multiple ports |
| **SSL/TLS** | Yes | Yes | No | Yes (requests lib) |
| **Maintenance burden** | Low | Low | Low | Medium |
| **Windows/WSL2 fit** | Device passthrough needed | Device passthrough needed | Device passthrough needed | Device passthrough needed |

---

## 4. USB Passthrough: Windows Host -> WSL2 -> Docker Container

### The Full Chain

```
ESP32 (USB) --> Windows Host (COM3) --> usbipd-win --> WSL2 (/dev/ttyUSB0) --> Docker Container
```

### 4.1 usbipd-win Tool

**What it is:** A Microsoft-supported tool that shares locally connected USB devices to WSL2 using the USB/IP protocol (part of the Linux kernel).

**Repository:** [dorssel/usbipd-win](https://github.com/dorssel/usbipd-win)
**Current Version:** 4.4.0 (as of late 2025)

**Installation:**
```powershell
winget install dorssel.usbipd-win
```

**One-time bind (persists across reboots):**
```powershell
# Admin PowerShell - only needed once per device
usbipd list                          # Find device BUSID (e.g. 1-3)
usbipd bind --busid 1-3             # Share device (persistent)
```

**Attach to WSL (needed after every plug/reboot):**
```powershell
usbipd attach --wsl --busid 1-3     # Forward to WSL2
```

**Auto-attach (semi-persistent, stays in foreground loop):**
```powershell
usbipd attach --wsl --auto-attach --hardware-id 10C4:EA60   # CP2102 VID:PID
```

### 4.2 /dev/ttyUSB Mapping in WSL2

After `usbipd attach`, the device appears in WSL2:

| USB-Serial Chip | Windows COM Port | WSL2 Device | Notes |
|-----------------|-------------------|-------------|-------|
| CP2102 (Silicon Labs) | COM3 | `/dev/ttyUSB0` | Most common on ESP32 DevKits |
| CH340/CH341 | COM4 | `/dev/ttyUSB0` | Common on cheap boards |
| CP2104 | COM5 | `/dev/ttyUSB0` | Seeed Xiao variant |
| Native USB (ESP32-S3/C3) | COMx | `/dev/ttyACM0` | CDC-ACM class |

**Important:** WSL2 kernel must have the USB serial drivers compiled in. The default WSL2 kernel includes:
- `cp210x` (CP2102/CP2104)
- `ch341` (CH340/CH341)
- `ftdi_sio` (FTDI)

If a driver is missing, see [rohzb/wsl2-usb-devices](https://github.com/rohzb/wsl2-usb-devices) for custom kernel module building.

**Verify in WSL2:**
```bash
ls -la /dev/ttyUSB*    # Should show device after attach
dmesg | tail -20       # Should show driver binding
```

### 4.3 Docker Device Mapping

**Critical limitation:** Docker Desktop for Windows with WSL2 backend does NOT natively support `--device` passthrough.

**Workaround architecture:**

```
Windows Host (USB)
    |
    v  [usbipd-win]
WSL2 Distribution (/dev/ttyUSB0)
    |
    v  [Docker within WSL2 - NOT Docker Desktop]
Docker Container (--device /dev/ttyUSB0)
```

**Option A: Docker Engine inside WSL2 (recommended)**
- Install Docker Engine directly in WSL2 (not Docker Desktop)
- `--device /dev/ttyUSB0:/dev/ttyUSB0` works natively
- Docker Compose `devices:` directive works

**Option B: Docker Desktop with privileged mode**
```yaml
services:
  ser2net:
    privileged: true
    volumes:
      - /dev:/dev
```
- Less secure, maps ALL devices
- May work with WSL2 backend but unreliable for USB devices
- Not recommended

**Option C: Network bridge from WSL2 (avoid device passthrough entirely)**
```
ESP32 --> Windows COM --> usbipd --> WSL2 /dev/ttyUSB0
                                        |
                                        v  [socat/ser2net runs in WSL2 natively]
                                     TCP:3333
                                        |
                                        v  [Docker container connects via TCP]
                                     Consumer container
```
- Runs ser2net/socat in WSL2 directly (not in Docker)
- Docker containers connect to the TCP port
- Avoids device passthrough entirely
- Most reliable for Windows/WSL2 setup

---

## 5. Known Issues with Serial Device Passthrough

### 5.1 Docker Desktop + WSL2

| Issue | Description | Severity |
|-------|-------------|----------|
| **No native USB support** | Docker Desktop WSL2 backend cannot see USB devices ([Issue #4271](https://github.com/docker/for-win/issues/4271)) | Blocking |
| **`--device` ignored** | Device mapping flags silently fail on Docker Desktop WSL2 ([Issue #1018](https://github.com/docker/for-win/issues/1018)) | Blocking |
| **usbipd required** | Must use usbipd-win as intermediary | Workaround exists |
| **WSL restart needed** | Sometimes WSL2 must be restarted before device attaches ([Issue #1092](https://github.com/dorssel/usbipd-win/issues/1092)) | Intermittent |

### 5.2 usbipd-win Specific

| Issue | Description | Impact |
|-------|-------------|--------|
| **Manual re-attach** | Device must be re-attached after every disconnect/reconnect | High (workflow friction) |
| **Auto-attach is foreground** | `--auto-attach` runs in a foreground loop, not as a background service | Medium |
| **CH340 errors** | Attaching CH340 devices can cause errors ([Issue #804](https://github.com/dorssel/usbipd-win/issues/804)) | Board-specific |
| **Device not visible** | After attach, /dev/ttyUSB0 sometimes doesn't appear ([Issue #1074](https://github.com/dorssel/usbipd-win/issues/1074)) | Intermittent |
| **udev not running** | WSL2 doesn't start udev by default; device detection may fail | Fixable |

### 5.3 ESP32 Specific

| Issue | Description | Mitigation |
|-------|-------------|------------|
| **ESP32 reset on connect** | Many ESP32 boards reset when serial connection opens (DTR/RTS) | Use `local` option in ser2net to ignore modem control |
| **Boot log flood** | ESP32 outputs bootloader messages at 74880 baud, then switches to 115200 | Ignore first ~2 seconds of output |
| **Watchdog output** | Crash dumps are unstructured text | Promtail regex must handle or skip |

---

## 6. Hot-Plug Behavior

### What Happens When ESP32 is Disconnected

```
1. USB physically disconnected
2. Windows detects USB removal -> COM port disappears
3. usbipd-win: device becomes "Not shared" (if no auto-attach)
4. WSL2: /dev/ttyUSB0 disappears
5. Docker container: serial device becomes invalid
6. ser2net/socat: connection drops, behavior depends on tool:
   - ser2net: logs error, keeps listening, waits for device to return
   - socat: process exits (needs external restart via supervisor/systemd)
   - Python pyserial: depends on implementation (can loop and retry)
```

### What Happens When ESP32 is Reconnected

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

Using Windows Task Scheduler (PowerShell):
```powershell
$action = New-ScheduledTaskAction -Execute "usbipd" `
  -Argument "attach --wsl --auto-attach --hardware-id 10C4:EA60"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" `
  -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -Action $action -Trigger $trigger `
  -Principal $principal -TaskName "usbipd-esp32"
```

Also see: [Kruceo/Usbipd-at-startup](https://github.com/Kruceo/Usbipd-at-startup) for a community tool.

**usbipd-win 4.4.0** added `--unplugged` option for auto-attaching devices that are currently not plugged in.

---

## 7. Performance Considerations

### Latency Chain: Serial -> Network -> Container -> Loki

```
ESP32 Serial TX (115200 baud)
  -> USB-Serial chip (CP2102/CH340) buffer: ~1-10ms
  -> USB transfer to Windows: ~1ms
  -> usbipd USB/IP to WSL2: ~1-5ms (network overhead)
  -> Serial device read in container: ~1ms
  -> ser2net/socat TCP forward: ~0.1ms (localhost)
  -> Promtail scrape interval: up to 5s (configurable)
  -> Loki push batch: ~1-5s
  -> Grafana query: ~100ms-2s

Total end-to-end: ~5-15 seconds typical
```

### Bottleneck Analysis

| Stage | Latency | Controllable? |
|-------|---------|---------------|
| Serial TX at 115200 baud | ~87us per byte | Fixed by baud rate |
| USB-Serial chip buffering | 1-10ms | Chip-dependent |
| USB/IP over usbipd | 1-5ms | Minor overhead |
| ser2net/socat forwarding | <1ms | Negligible |
| **Promtail scrape interval** | **1-5s** | **Yes - primary bottleneck** |
| **Loki batch push** | **1-5s** | **Yes - configurable** |
| Grafana refresh | 1-5s | Yes - dashboard setting |

**Key insight:** The serial-to-network bridging adds negligible latency (~10ms). The real latency comes from Promtail's scraping interval and Loki's batch push. For debugging purposes, 5-15 seconds end-to-end is acceptable.

### Throughput

At 115200 baud: ~11.5 KB/s maximum serial throughput. This is trivial for Promtail/Loki to handle. No performance concerns.

---

## 8. Integration Architecture for AutomationOne

### Recommended Architecture: Python Serial Logger (Option C from TM command)

```
                    Windows Host
                         |
                    [usbipd-win]
                         |
                    WSL2 (/dev/ttyUSB0)
                         |
              [Docker: esp32-serial-logger]
                    Python + pyserial
                         |
                    stdout (structured)
                         |
              [Promtail docker_sd_configs]
                         |
                    [Loki]
                         |
                    [Grafana]
```

### Why Python pyserial over ser2net/socat

1. **Log formatting:** ESP32 Serial.printf() output is unstructured text. A Python service can parse it into structured JSON before outputting to stdout, making Promtail parsing trivial.

2. **Label injection:** Python can add metadata labels (device ID, board type, firmware version) that ser2net cannot.

3. **Reconnection logic:** Full control over hot-plug recovery with configurable retry intervals.

4. **Stack consistency:** Server (El Servador) is already Python/FastAPI. Same toolchain, same CI.

5. **Loki integration flexibility:** Can output to stdout (Promtail captures) or push directly to Loki API. No intermediate TCP hop.

6. **Multi-device support:** Single service can manage multiple serial ports via configuration, each with its own labels.

### Conceptual Docker Compose Service

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
      SERIAL_PORT: /dev/ttyUSB0
      SERIAL_BAUD: "115200"
      DEVICE_ID: "esp32-xiao-01"
      LOG_FORMAT: "structured"   # structured | raw
    devices:
      - /dev/ttyUSB0:/dev/ttyUSB0
    labels:
      logging: "promtail"
      com.docker.compose.service: "esp32-serial-logger"
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
    networks:
      - automationone-net
    restart: unless-stopped
```

### Promtail Pipeline Stage (addition to existing config)

```yaml
      # Stage 4: ESP32 Serial Logger - Parse serial output
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

### Conceptual Python Service Structure

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

# Pattern for Serial.printf structured output
SERIAL_PATTERN = re.compile(
    r'^\[(\w+)\]\s*(.*)'
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

                    # Try ESP-IDF log format
                    match = ESP_LOG_PATTERN.match(line)
                    if match:
                        level_char, module, lineno, msg = match.groups()
                        emit_log(parse_level(level_char), msg, module)
                        continue

                    # Default: raw line as info
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

## 9. Recommendation Summary

### Primary Recommendation: Custom Python Serial Logger

**Verdict:** ser2net ist technisch machbar aber suboptimal fuer diesen Use-Case. Die Empfehlung ist ein leichtgewichtiger Python-Container mit pyserial.

| Criterion | ser2net | socat | **Python pyserial** |
|-----------|---------|-------|---------------------|
| Windows/WSL2 compatibility | Same | Same | **Same** |
| Log parsing/formatting | None | None | **Full control** |
| Loki integration | Via Promtail only | Via Promtail only | **Direct or Promtail** |
| Hot-plug recovery | Partial | None | **Custom, robust** |
| Multi-device support | Config-based | Manual | **Config-based** |
| Stack consistency | C (foreign) | C (foreign) | **Python (native)** |
| Maintenance burden | Low | Low | **Medium** |
| Setup complexity | Low | Low | **Medium** |

### Decision Matrix

- **If you want fastest setup:** ser2net Docker image + stdout capture via Promtail. Unstructured logs, but works in minutes.
- **If you want structured, queryable logs:** Python pyserial service. More setup, but structured JSON enables `{device="esp32-xiao-01", level="error"}` queries in Grafana.
- **If you want minimal overhead:** socat in WSL2 (not Docker) + TCP consumer. Lightest weight but poorest reliability.

### Critical Path: USB Passthrough

Regardless of which tool is chosen, the USB passthrough chain is the same bottleneck:

1. Install `usbipd-win` on Windows (`winget install dorssel.usbipd-win`)
2. Bind ESP32 USB device (one-time, admin): `usbipd bind --busid <BUSID>`
3. Attach to WSL2 (every session): `usbipd attach --wsl --auto-attach --hardware-id <VID:PID>`
4. Verify in WSL2: `ls /dev/ttyUSB0`
5. Docker container accesses `/dev/ttyUSB0` via `devices:` directive

**Risk assessment for USB passthrough:** Medium. It works, but requires manual intervention on ESP32 hot-plug and WSL2 restart. The `--auto-attach` flag mitigates most hot-plug scenarios but runs as a foreground process.

### Effort Estimate

| Component | Effort | Notes |
|-----------|--------|-------|
| usbipd-win setup | 1h | Install + bind + test |
| ser2net container (basic) | 2h | Config + Docker Compose + test |
| Python serial logger (full) | 4-6h | Code + Dockerfile + Promtail pipeline + test |
| Promtail pipeline stage | 1h | Match selector + JSON parser |
| Grafana dashboard panel | 1-2h | ESP32 serial log panel |
| Documentation | 1h | Setup guide for hardware profile |
| **Total (Python approach)** | **8-11h** | |
| **Total (ser2net approach)** | **5-6h** | |

---

## 10. Sources

- [ser2net GitHub (official)](https://github.com/cminyard/ser2net)
- [ser2net man page](https://linux.die.net/man/8/ser2net)
- [ser2net DeepWiki - Configuration](https://deepwiki.com/cminyard/ser2net/3-configuration)
- [jippi/docker-ser2net](https://github.com/jippi/docker-ser2net)
- [jbouwh/ser2net Docker](https://github.com/jbouwh/ser2net)
- [Docker Hub: jippi/ser2net](https://hub.docker.com/r/jippi/ser2net)
- [usbipd-win GitHub](https://github.com/dorssel/usbipd-win)
- [Microsoft: Connecting USB devices to WSL](https://devblogs.microsoft.com/commandline/connecting-usb-devices-to-wsl/)
- [usbipd-win WSL auto-attach discussion](https://github.com/dorssel/usbipd-win/discussions/168)
- [usbipd-win auto-attach by VID:PID](https://github.com/dorssel/usbipd-win/issues/371)
- [Kruceo/Usbipd-at-startup](https://github.com/Kruceo/Usbipd-at-startup)
- [rohzb/wsl2-usb-devices (kernel modules)](https://github.com/rohzb/wsl2-usb-devices)
- [Docker for Windows - Serial port support Issue #4271](https://github.com/docker/for-win/issues/4271)
- [Docker for Windows - Serial port Issue #1018](https://github.com/docker/for-win/issues/1018)
- [usbipd-win - Docker attach Issue #850](https://github.com/dorssel/usbipd-win/issues/850)
- [usbipd-win - WSL attach Issue #1092](https://github.com/dorssel/usbipd-win/issues/1092)
- [usbipd-win - CH340 error Issue #804](https://github.com/dorssel/usbipd-win/issues/804)
- [usbipd-win - Device not visible Issue #1074](https://github.com/dorssel/usbipd-win/issues/1074)
- [MCU on Eclipse: USB Devices in Docker Dev Container](https://mcuoneclipse.com/2025/10/26/using-windows-usb-devices-and-debug-probes-inside-docker-dev-container/)
- [Golioth Blog: USB with Docker on Windows](https://blog.golioth.io/usb-docker-windows-macos/)
- [socat serial bridge (Digi)](https://www.digi.com/support/knowledge-base/serial-to-ethernet-or-wifi-bridge-with-linux-socat)
- [socat serial bridge (acmesystems)](https://www.acmesystems.it/socat)
- [akshmakov/serialport-server (socat Docker)](https://github.com/akshmakov/serialport-server)
- [hunterli/remserial](https://github.com/hunterli/remserial)
- [pavelrevak/ser2tcp](https://github.com/pavelrevak/ser2tcp)
- [Hackaday: Linux Fu - Serial Untethered](https://hackaday.com/2021/02/11/linux-fu-serial-untethered/)
- [pySerial Documentation](https://pyserial.readthedocs.io/en/latest/examples.html)
- [Grafana Promtail Pipelines](https://grafana.com/docs/loki/latest/send-data/promtail/pipelines/)
- [Promtail Scraping Configuration](https://grafana.com/docs/loki/latest/send-data/promtail/scraping/)
- [ESP-IDF Logging Library](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-reference/system/log.html)
