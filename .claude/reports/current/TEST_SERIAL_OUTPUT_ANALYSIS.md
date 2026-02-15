# Serial Output Analysis for ser2net Integration

**Created:** 2026-02-10
**Analysis Scope:** ESP32 serial output formats, Wokwi test logs, log volume, Promtail regex patterns
**Sources:** Wokwi serial logs, ESP32 source code, Wokwi scenario YAML files, archived real-hardware logs

---

## 1. Existing Test Logs Showing Serial Output Format

### 1.1 Available Serial Log Captures

**Wokwi Serial Logs** (logs/wokwi/serial/):

| Category | Files | Example |
|----------|-------|---------|
| 01-boot | 3 files | boot_full_20260206_174101.log (17,745 lines, ~895KB) |
| 03-actuator | 4 files | actuator_led_on_20260206_165504.log |
| 05-emergency | 3 files | emergency_broadcast_20260206_165506.log |
| 06-config | in parent | config_sensor_add_20260206_165507.log |
| 07-combined | in parent | multi_device_parallel_20260206_170145.log |
| 09-pwm | in parent | pwm_channel_attach_20260206_165508.log |

**Archived Real-Hardware Logs** (logs/archive/): 24 sessions, 7 with esp32_serial.log
**Wokwi MQTT Logs** (logs/wokwi/mqtt/): 6 category subdirectories
**JUnit XML** (logs/wokwi/reports/): 20 JUnit XML + 20 JSON test reports

---

## 2. Five Distinct Serial Output Formats

### Format 1: Custom Logger (Primary Application Output)

**Source:** El Trabajante/src/utils/logger.cpp line 173

```
[      2409] [INFO    ] GPIOManager: Pin 21 allocated to I2C_SDA
[      8397] [ERROR   ] MQTT connection failed, rc=-2
[      8409] [WARNING ] System will continue but MQTT features unavailable
[      2427] [CRITICAL] 3x Watchdog in 24h -> SAFE MODE ACTIVATED
```

- Timestamp: millis() value, right-aligned 10-char field
- Level: 8-char field (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- **Volume:** 95%+ of all output during steady-state loop

### Format 2: Direct Serial.print (Boot Phase)

**Source:** main.cpp lines 137-152 (before logger init)

```
ets Jul 29 2019 12:21:46
rst:0x1 (POWERON_RESET),boot:0x13 (SPI_FAST_FLASH_BOOT)
ESP32 Sensor Network v4.0 (Phase 2)
Chip Model: ESP32-D0WDQ6-V3
CPU Frequency: 240 MHz
```

- No timestamp, no level. Includes ROM bootloader output.
- **Volume:** ~30-50 lines per boot (one-time)

### Format 3: MQTT Debug JSON

**Source:** mqtt_client.cpp (14 call sites)

```
[DEBUG]{"id":"mqtt_connect_entry","timestamp":8129,"location":"mqtt_client.cpp:84",...
```

- Prefix [DEBUG] followed by JSON object (single line)
- **Volume:** 5-15 lines per MQTT connect attempt (sporadic)

### Format 4: ESP-IDF Internal

**Source:** ESP32 Arduino Core / ESP-IDF (not our code)

```
[  2516][E][Preferences.cpp:483] getString(): nvs_get_str len fail: zone_id NOT_FOUND
[  8547][I][esp32-hal-i2c.c:75] i2cInit(): Initialising I2C Master
```

- Level: Single char (E/I/W/D/V)
- **Volume:** Moderate boot, rare steady-state

### Format 5: Wokwi Test Framework (NOT on Real Hardware)

```
[Complete Boot Sequence Test] Expected text matched: ...
```

**ser2net relevance: NONE** -- Wokwi CLI only.

---

## 3. Wokwi Scenarios

| Category | Files | wait-serial Steps | Status |
|----------|-------|-------------------|--------|
| 01-boot | 2 | 17 | Active |
| 02-sensor | 5 | 23 | Active |
| 03-actuator | 7 | 25 | Active |
| 04-zone | 2 | 7 | Active |
| 05-emergency | 3 | 11 | Active |
| 06-config | 2 | 6 | Active |
| 07-combined | 2 | 12 | Active |
| 08-i2c | 20 | 78 | Blocked |
| 08-onewire | 29 | 141 | Active |
| 09-hardware | 9 | 71 | Active |
| 09-pwm | 18 | 107 | Active |
| 10-nvs | 40 | 218 | 35 Active |
| gpio | 24 | 178 | Active |
| **TOTAL** | **163** | **894** | |

All 163 scenarios use wait-serial as primary validation (substring match).

---

## 4. Error Condition Serial Output

### 4.1 Watchdog Timeout (main.cpp:412-431)
```
[WARNING ] ESP REBOOTED DUE TO WATCHDOG TIMEOUT
[CRITICAL] 3x Watchdog in 24h -> SAFE MODE ACTIVATED
```

Modes: WDT_DISABLED (Wokwi), PROVISIONING (300s), PRODUCTION (60s+panic), SAFE_MODE (120s)

### 4.2 Hardware Failure -> LED blink, serial STOPS
### 4.3 WiFi Failure -> Provisioning AP-mode (serial continues)
### 4.4 MQTT Failure -> System continues, MQTT unavailable

---

## 5. Log Volume Analysis

### 5.1 Measured Loop Timing
- LOOP[1] at 8972ms, LOOP[1019] at 89977ms
- **1019 loops in ~81s = ~79.5ms/loop**

### 5.2 Lines Per Loop: 17 (minimum, 0 sensors)

### 5.3 Calculated Volume

| Metric | Value |
|--------|-------|
| Lines/loop | 17 (min) |
| Loops/sec | ~12.6 |
| **Lines/sec** | **~214** |
| Lines/hour | ~770,400 |
| **Bytes/sec** | **~13.9 KB** |
| **Bytes/hour** | **~50 MB** |

With 5 sensors: ~315-378 lines/sec

### 5.4 Rate-Limiting: NONE
- LOOP[N] trace msgs are ALL LOG_INFO (12/17 lines = ~70% volume)
- These are debugging artifacts, never removed
- 115200 baud = 11,520 B/s max. Output at ~13.9 KB/s **saturates link**

---

## 6. Promtail Regex Patterns

### 6.1 Format 1: Custom Logger
```
^\[\s*(?P<timestamp>\d+)\]\s+\[(?P<level>\w+)\s*\]\s+(?P<message>.+)$
```

### 6.2 Format 3: MQTT Debug JSON
```
^\[DEBUG\](?P<json>\{.+\})$
```

### 6.3 Format 4: ESP-IDF Internal
```
^\[\s*(?P<ts>\d+)\]\[(?P<level>[EIWDV])\]\[(?P<src>[^\]]+)\]\s+(?P<func>\w+)\(\):\s+(?P<msg>.+)$
```

### 6.4 Disambiguation: Unambiguous
- Format 1: ] [  (space between brackets)
- Format 3: ]{  (JSON after bracket)
- Format 4: ][  (no space between brackets)
- Format 2: no leading [

---

## 7. Key Findings

### 7.1 CRITICAL: Volume Too High
~214 lines/sec idle. Fix: LOOP traces LOG_INFO->LOG_DEBUG (~70% reduction).

### 7.2 Formats are unambiguous. Promtail can parse all.
### 7.3 Wokwi adds [WOKWI] and [Test] lines absent on real HW.
### 7.4 PlatformIO adds HH:MM:SS.mmm prefix; ser2net outputs raw.
### 7.5 All output is single-line (no multiline stage needed).

---

## 8. Next Steps

1. [ ] Reduce log volume: LOOP traces LOG_INFO -> LOG_DEBUG
2. [ ] Configure ser2net: UART -> TCP raw mode
3. [ ] Configure Promtail: Pipeline from Section 6
4. [ ] Add ESP ID label from boot or static config
5. [ ] Test with real hardware
6. [ ] Loki retention: 7d DEBUG, 30d ERROR+
7. [ ] Promtail drop stage for LOOP traces

---
*Report generated by test-log-analyst agent*