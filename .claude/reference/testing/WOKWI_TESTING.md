# Wokwi ESP32 Testing Guide

**Version:** 2.2 (MCP Integration + Quota Optimization)
**Last Updated:** 2026-03-02
**Status:** Production-Ready
**CLI Version:** v0.26.1
**Test Coverage:** 52 core (PR) + 139 extended (Nightly) = 191 total across 15 categories
**Nightly Schedule:** Mon+Thu at 2 AM UTC (quota-optimized)

---

## Entry Points (verbindlich)

- `scripts/run-wokwi-tests.py` = **lokaler Runner** (Developer-Werkzeug)
- `.github/workflows/wokwi-tests.yml` = **CI-Runner** (Gate/Artefakte)
- Abweichungen sind bewusst, solange dokumentiert und reproduzierbar.

## I2C Scope-Klarheit

- I2C **Sensor-Kommunikation** gilt im PR-Gate als **hardware-only**.
- CI deckt weiterhin simulierbare Initialisierungs-/Controller-Aspekte ab.

---

## Quick Start

### 1. Prerequisites

- Docker stack running (`make up` / `docker compose up -d`)
- Wokwi CLI installed ([wokwi.com/ci](https://wokwi.com/ci))
- PlatformIO CLI (`pio`)
- Database seeded with Wokwi test device
- **Windows-spezifisch:**
  - Kein lokaler Mosquitto Windows-Service (blockiert Port 1883)
  - Windows Firewall: Inbound-Regel für Port 1883 TCP (für Wokwi Gateway)
  - `WOKWI_CLI_TOKEN` gesetzt (`$env:WOKWI_CLI_TOKEN='wok_...'`)

### 2. First-Time Setup

```bash
# Build firmware for Wokwi simulation
make wokwi-build
# PowerShell (ohne make):
# & "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e wokwi_esp01

# Seed database with ESP_00000001 (status="approved")
make wokwi-seed
# Runs locally via .venv/Scripts/python.exe (script not mounted in container)

# Verify database entry
make shell-db
# In psql: SELECT device_id, status, approved_by FROM esp_devices WHERE device_id='ESP_00000001';
```

### 3. Run Tests

```bash
# Quick smoke test (3 scenarios, ~3 minutes)
make wokwi-test-quick

# All CI core scenarios (22 passive tests, ~20 minutes)
make wokwi-test-full

# Single scenario
make wokwi-test-scenario SCENARIO=tests/wokwi/scenarios/01-boot/boot_full.yaml

# Entire category
make wokwi-test-category CAT=01-boot

# Interactive mode (manual testing)
make wokwi-run
```

---

## Understanding Wokwi Integration

### Architecture

```
Wokwi Simulator ←MQTT→ Docker MQTT Broker ←MQTT→ El Servador ←PostgreSQL→ Database
     ESP32             host.wokwi.internal:1883      FastAPI            god_kaiser_db
```

**Key Components:**

1. **Wokwi Simulator:** Virtual ESP32 running actual firmware binary
2. **wokwi.toml:** Configuration (gateway=true enables MQTT to host)
3. **diagram.json:** Hardware configuration (ESP32, sensors, buttons)
4. **YAML Scenarios:** Test automation (wait-serial, set-control, delays)

### Provisioning Bypass

**Production ESP32:**
1. Boot → NVS empty → Captive Portal
2. User configures WiFi/MQTT via HTTP form
3. Config saved to NVS → reboot → normal operation

**Wokwi ESP32:**
1. Compile-time credentials (`-D WOKWI_SIMULATION=1`)
2. `ConfigManager::loadWiFiConfig()` → `config.configured = true`
3. Provisioning SKIPPED → direct to MQTT connect

**Code Location:** `El Trabajante/src/services/config/config_manager.cpp:71-111`

### Device Registration Flow

**Status State Machine:**

```
NEW Device (Auto-Discovery via Heartbeat):
  → pending_approval (heartbeat_handler.py:139)

SEEDED Device (seed_wokwi_esp.py):
  → approved (pre-approved by seed script)
  → online (first heartbeat after seed)

Status Transitions:
  pending_approval → approved (Admin REST API)
  approved → online (First heartbeat)
  online ↔ offline (Heartbeat timeout: 300s)
  rejected → (Cooldown: 5 min) → pending_approval (Rediscovery)
```

**Wokwi-Specific:**
- Seed script sets `status="approved"` (pre-approved, no manual approval needed)
- First heartbeat after seed → Status transition: `approved` → `online`
- Registration Gate opens after first heartbeat ACK (allows sensor/actuator publishes)

**Documentation:** `.claude/reports/current/WOKWI_DEVICE_STATUS_FLOW.md`

### Registration Gate

**Purpose:** Prevents ESP32 from publishing sensor/actuator data before server registration.

**Behavior:**
- ❌ **CLOSED:** Blocks ALL publishes except whitelisted topics (see below)
- ✅ **OPEN:** All publishes allowed

**Whitelisted (bypass gate even when CLOSED):**
- `/system/heartbeat` — always sent for registration
- `/config_response` — config ACK back to server
- `/zone/ack` — zone assignment ACK
- `/subzone/ack` — subzone assignment ACK

**Opening Conditions:**
1. **Primary:** Heartbeat ACK received (`main.cpp:1671`)
2. **Fallback:** 10-second timeout (`mqtt_client.cpp:531-534`)

**Closing Conditions:**
- MQTT disconnect
- Connection loss

**Impact on Tests:**
- Boot scenarios should include `wait-serial: "REGISTRATION CONFIRMED"` step
- Sensor/actuator tests start AFTER gate opens

**Code Location:** `El Trabajante/src/services/communication/mqtt_client.cpp:520-539`

---

## Makefile Targets

### Build & Prepare

```bash
# Build firmware for Wokwi
make wokwi-build
# Output: El Trabajante/.pio/build/wokwi_simulation/firmware.bin

# Seed database with Wokwi test device
make wokwi-seed
# Creates: ESP_00000001, status="approved", kaiser_id="god"
```

### List Scenarios

```bash
make wokwi-list
# Output: All 173 scenarios grouped by category
```

### Run Tests

```bash
# Quick Tests (3 scenarios)
make wokwi-test-quick
# - boot_full.yaml
# - boot_safe_mode.yaml
# - sensor_heartbeat.yaml

# Full CI Suite (23 scenarios)
make wokwi-test-full
# All scenarios from .github/workflows/wokwi-tests.yml

# Single Scenario
make wokwi-test-scenario SCENARIO=tests/wokwi/scenarios/01-boot/boot_full.yaml

# Category Tests
make wokwi-test-category CAT=01-boot
# Runs all *.yaml in specified category folder

# ALL 173 scenarios (nightly equivalent, requires Mosquitto)
make wokwi-test-all

# 10 Error-Injection scenarios (requires Mosquitto + mosquitto_pub)
make wokwi-test-error-injection

# Interactive Mode
make wokwi-run
# No scenario, manual testing, runs until Ctrl+C
```

---

## Test Scenarios

### Directory Structure

```
El Trabajante/tests/wokwi/scenarios/
├── 01-boot/          (2)   - Boot sequences, safe mode
├── 02-sensor/        (5)   - Heartbeat, DS18B20, DHT22, Analog
├── 03-actuator/      (7)   - LED, PWM, Binary, Emergency, Timeout
├── 04-zone/          (2)   - Zone assignment, Subzone assignment
├── 05-emergency/     (3)   - Broadcast, ESP stop, Full flow
├── 06-config/        (2)   - Sensor add, Actuator add
├── 07-combined/      (2)   - Multi-sensor, Multi-device parallel
├── 08-i2c/           (20)  - I2C bus scenarios
├── 08-onewire/       (29)  - OneWire bus scenarios
├── 09-hardware/      (9)   - Hardware detection, board types
├── 09-pwm/           (18)  - PWM control scenarios
├── 10-nvs/           (40)  - NVS storage scenarios
├── 11-error-injection/ (10) - Error injection (MQTT via CI background pattern)
└── gpio/             (24)  - GPIO allocation, conflicts
```

**Total:** 173 scenarios
**In CI:** 52 scenarios (categories 01-07 + gpio/i2c/nvs/pwm core + error-injection)

### Scenario YAML Structure

```yaml
name: 'Boot Full Test'
version: 1
steps:
  - wait-serial: 'ESP32 Sensor Network'      # Wait for serial output
  - wait-serial: 'Phase 1: Core Infrastructure READY'
  - wait-serial: 'MQTT connected successfully'
  - wait-serial: 'REGISTRATION CONFIRMED'    # Wait for registration gate
  - delay: 1000ms                             # Wait 1 second
  - set-control:                              # Simulate button press
      part-id: btn1
      control: pressed
      value: 1
  - wait-serial: 'Button pressed'
  - screenshot:                               # Visual validation
      part-id: esp
      save-to: screenshot.png
```

### Serial Output Validation

**Common wait-serial Patterns:**

| Pattern | Source | Purpose |
|---------|--------|---------|
| `"ESP32 Sensor Network"` | `main.cpp:148` | Boot header |
| `"GPIO SAFE-MODE INITIALIZATION"` | `gpio_manager.cpp` | GPIO init start |
| `"Phase X: Y READY"` | `main.cpp` | Boot phases (1-5) |
| `"WiFi connected successfully"` | `wifi_manager.cpp` | WiFi connected |
| `"MQTT connected successfully"` | `mqtt_client.cpp` | MQTT connected |
| `"REGISTRATION CONFIRMED"` | `mqtt_client.cpp:750` | Gate opened |
| `"heartbeat"` | `main.cpp:787` | Initial heartbeat (LOG_INFO, boot only) |
| `"ConfigResponse published"` | `config_response.cpp:45` | Config processed (sensor/actuator) |
| `"Published"` | `mqtt_client.cpp:558` | MQTT publish (LOG_DEBUG, invisible at default level) |

**Validation:** All `wait-serial` strings must match actual firmware output. Mismatches cause test timeouts.

---

## CI Integration

### Workflow: `.github/workflows/wokwi-tests.yml`

**Structure:**
- 1 Build Job (shared firmware artifact)
- 16 Core Test Jobs (PR/Push, parallel)
- 6 Nightly Extended Test Jobs (schedule/workflow_dispatch only)
- 1 Summary Job

**Concurrency:** `wokwi-tests-${{ github.ref }}` with `cancel-in-progress: true`

**Core Test Jobs (52 scenarios, every PR/Push):**
1. `boot-tests` (2 scenarios)
2. `sensor-tests` (2 scenarios)
3. `mqtt-connection-test` (1 scenario, legacy)
4. `actuator-tests` (4 scenarios, MQTT injection)
5. `zone-tests` (2 scenarios, MQTT injection)
6. `emergency-tests` (2 scenarios, MQTT injection)
7. `config-tests` (2 scenarios, MQTT injection)
8. `sensor-flow-tests` (3 scenarios)
9. `actuator-flow-tests` (3 scenarios, MQTT injection)
10. `combined-flow-tests` (3 scenarios, MQTT injection)
11. `gpio-core-tests` (5 scenarios, Mosquitto)
12. `i2c-core-tests` (5 scenarios, Mosquitto + diagram_i2c.json)
13. `nvs-core-tests` (5 scenarios, Mosquitto)
14. `pwm-core-tests` (3 scenarios, Mosquitto + MQTT injection)
15. `error-injection-tests` (10 scenarios, background pattern with `mosquitto_pub`)

**Nightly Extended Jobs (122 additional scenarios):**
17. `nightly-i2c-extended` (15 scenarios, I2C diagram)
18. `nightly-onewire-extended` (29 scenarios)
19. `nightly-hardware-extended` (9 scenarios)
20. `nightly-pwm-extended` (15 scenarios)
21. `nightly-nvs-extended` (35 scenarios)
22. `nightly-gpio-extended` (19 scenarios)

**Total:** 173 scenarios (52 core + 122 nightly)

**Nightly Schedule:** 03:00 UTC daily, also available via `workflow_dispatch`

**Error-Injection Pattern (Job 15):**
Error-injection scenarios use a background pattern: `wokwi-cli` runs in background, then `mosquitto_pub` injects MQTT messages externally. YAML files contain only `wait-serial` + `delay` steps. See `.claude/reference/testing/WOKWI_ERROR_MAPPING.md` for details.
- 08-i2c/ (15 remaining)

---

## Local Full-Stack Testing

### End-to-End Flow

```bash
# 1. Start Docker stack
make up
make monitor-up  # Optional: Loki/Grafana for logs

# 2. Seed database
make wokwi-seed

# 3. Build firmware
make wokwi-build

# 4. Run quick tests
make wokwi-test-quick

# 5. Monitor logs
make logs-server   # Server logs
make logs-mqtt     # MQTT broker
make mqtt-sub      # MQTT messages

# 6. Clean up
make down
```

#### Windows/PowerShell (ohne make)

```powershell
# 1. Start Docker stack
docker compose up -d

# 2. Seed database (lokal, nicht im Container)
cd "El Servador\god_kaiser_server"
.venv\Scripts\python.exe scripts\seed_wokwi_esp.py

# 3. Build firmware
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e wokwi_esp01

# 4. Run test scenario
cd "El Trabajante"
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# 5. Monitor logs
docker compose logs -f --tail=100 el-servador
docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v -C 10 -W 30

# 6. Clean up
docker compose down
```

### Verification Steps

**1. Database Check:**
```bash
make shell-db
```
```sql
SELECT device_id, status, discovered_at, approved_at, approved_by
FROM esp_devices WHERE device_id='ESP_00000001';
```
**Expected:**
- `status` = `"approved"`
- `approved_by` = `"seed_script"`
- `approved_at` = timestamp

**2. MQTT Check:**
```bash
make mqtt-sub
```
**Expected Topics:**
- `kaiser/god/esp/ESP_00000001/system/heartbeat` (every 60s)
- `kaiser/god/system/heartbeat/ack` (response)
- `kaiser/god/esp/ESP_00000001/sensor/{gpio}/data` (if sensors active)

**3. Server Log Check:**
```bash
make logs-server | grep ESP_00000001
```
**Expected Logs:**
- `Device ESP_00000001 heartbeat received`
- `Device ESP_00000001 now online after approval`
- No errors with code 5XXX

---

## Multi-ESP Support (Future)

**Current:** All Wokwi scenarios use `ESP_00000001` (hardcoded in platformio.ini)

**Planned:** Scenario-specific builds for parallel testing

### Option A: Multiple Build Environments (RECOMMENDED)

**platformio.ini:**
```ini
[env:wokwi_esp01]
extends = env:wokwi_simulation
build_flags = ${env:wokwi_simulation.build_flags} -D WOKWI_ESP_ID=\"ESP_00000001\"

[env:wokwi_esp02]
extends = env:wokwi_simulation
build_flags = ${env:wokwi_simulation.build_flags} -D WOKWI_ESP_ID=\"ESP_00000002\"

[env:wokwi_esp03]
extends = env:wokwi_simulation
build_flags = ${env:wokwi_simulation.build_flags} -D WOKWI_ESP_ID=\"ESP_00000003\"
```

**Makefile:**
```makefile
wokwi-build-multi:
	cd "El Trabajante" && ~/.platformio/penv/Scripts/pio.exe run -e wokwi_esp01 -e wokwi_esp02 -e wokwi_esp03

wokwi-seed-multi:
	docker exec -it automationone-server python scripts/seed_wokwi_multi_esp.py
```

**Seed Script:**
```python
devices = [
    {"device_id": "ESP_00000001", "status": "approved"},
    {"device_id": "ESP_00000002", "status": "approved"},
    {"device_id": "ESP_00000003", "status": "approved"},
]
```

**CI Parallel Tests:**
```yaml
- name: Run Multi-Device Test
  run: |
    wokwi-cli . --firmware .pio/build/wokwi_esp01/firmware.bin --timeout 180000 &
    PID1=$!
    wokwi-cli . --firmware .pio/build/wokwi_esp02/firmware.bin --timeout 180000 &
    PID2=$!
    wait $PID1 && wait $PID2
```

**Status:** Not implemented yet (planned for Phase 3)

**Documentation:** `.technical-manager/inbox/agent-reports/wokwi-esp32-development-2026-02-11.md` (Section 5)

---

## Troubleshooting

### Test Timeout (90s)

**Symptom:** `wokwi-cli` exits with timeout error

**Causes:**
1. **Serial pattern mismatch:** `wait-serial` string not found in firmware output
2. **MQTT connection failed:** Server not running or wrong host
3. **Registration Gate stuck:** Heartbeat ACK not received
4. **Firmware crash:** Check serial output for errors

**Debug:**
```bash
# Enable serial output logging
cd "El Trabajante"
wokwi-cli . --serial-log-file output.log --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Check output
cat output.log | grep -A 5 -B 5 "ERROR\|CRASH\|Exception"
```

### Device Stays Offline

**Symptom:** Device remains `status="approved"` after test

**Causes:**
1. **Heartbeat not sent:** MQTT connection failed
2. **Server not processing:** Check server logs
3. **Status transition bug:** See WOKWI_DEVICE_STATUS_FLOW.md

**Debug:**
```bash
# Check MQTT traffic
make mqtt-sub

# Check server logs
make logs-server | grep heartbeat

# Check database
make shell-db
SELECT device_id, status, last_heartbeat FROM esp_devices WHERE device_id='ESP_00000001';
```

### Registration Gate Stuck

**Symptom:** Sensor data not published, serial shows "Publish blocked (awaiting registration)"

**Causes:**
1. **Heartbeat ACK not received:** Server not sending response
2. **10s timeout not triggered:** Clock issue
3. **Gate reset on disconnect:** WiFi/MQTT instability

**Debug:**
```bash
# Check server heartbeat handler
make logs-server | grep heartbeat_ack

# Check MQTT ACK topic
make mqtt-sub | grep "heartbeat/ack"

# Check ESP serial for gate status
wokwi-cli . --serial-log-file output.log --scenario <scenario>
grep "REGISTRATION CONFIRMED\|Publish blocked" output.log
```

### MQTT Connection Failed (Windows)

**Symptom:** ESP32 boots, WiFi connects, but MQTT shows "Connection reset by peer" at `host.wokwi.internal:1883`

**Causes (check in order):**
1. **Local Mosquitto blocking port:** Windows Mosquitto service occupies port 1883 before Docker
2. **Docker port not published:** `docker ps` shows `1883/tcp` instead of `0.0.0.0:1883->1883/tcp`
3. **Windows Firewall blocking inbound:** Gateway traffic blocked even when port is published

**Fix (all 3 steps):**
```powershell
# 1. Stop local Mosquitto (Admin PowerShell)
Stop-Service mosquitto
# Or: Stop-Process -Id <PID> -Force

# 2. Restart Docker MQTT broker
docker compose restart mqtt-broker

# 3. Add firewall rule (Admin PowerShell, one-time)
New-NetFirewallRule -DisplayName "MQTT Mosquitto" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow

# Verify port published correctly
docker ps --format "table {{.Names}}\t{{.Ports}}" | Select-String mqtt
# Must show: 0.0.0.0:1883->1883/tcp
```

### Wokwi CLI Not Found

**Symptom:** `wokwi-cli: command not found`

**Solution:**
```bash
# Download latest from GitHub releases (wokwi-cli is NOT on npm)
gh release download v0.26.1 --repo wokwi/wokwi-cli --pattern "wokwi-cli-win-x64.exe" --dir /tmp/
cp /tmp/wokwi-cli-win-x64.exe ~/.wokwi/bin/wokwi-cli

# Verify
wokwi-cli --version  # Should show 0.26.1
```

**CI:** Uses `WOKWI_CLI_TOKEN` secret (set in GitHub repository settings)

---

## Best Practices

### Scenario Design

1. **Always start with boot wait:**
   ```yaml
   - wait-serial: 'ESP32 Sensor Network'
   - wait-serial: 'MQTT connected successfully'
   - wait-serial: 'REGISTRATION CONFIRMED'  # CRITICAL
   ```

2. **Add delays for asynchronous operations:**
   ```yaml
   - set-control: { part-id: btn1, control: pressed, value: 1 }
   - delay: 100ms  # Allow GPIO processing
   - wait-serial: 'Button pressed'
   ```

3. **Use specific serial patterns:**
   - ❌ `wait-serial: 'success'` (too generic, matches unrelated logs)
   - ✅ `wait-serial: 'Sensor DS18B20 read success'` (specific)

4. **Test one feature per scenario:**
   - Separate scenarios for sensor read vs full data flow
   - Easier to debug failures

### CI Efficiency

1. **Group similar scenarios in one job:**
   - `sensor-tests` runs all 02-sensor/ scenarios together
   - Shared firmware build artifact

2. **Use `--fail-text` for early exit:**
   ```bash
   wokwi-cli . --timeout 90000 --scenario <scenario> --fail-text "ERROR\|Exception"
   ```

3. **Parallel execution where possible:**
   - Independent test jobs run in parallel
   - Reduces total CI time

### Local Development

1. **Use `wokwi-run` for interactive testing:**
   ```bash
   make wokwi-run
   # Test manually, observe serial output, no scenario constraints
   ```

2. **Keep Docker stack running:**
   ```bash
   make dev  # Hot-reload for server changes
   make monitor-up  # Grafana for real-time logs
   ```

3. **Seed once, test many:**
   ```bash
   make wokwi-seed  # Only once
   make wokwi-test-quick  # Run multiple times
   ```

---

## Wokwi MCP Server Integration

**Status:** Configured (v0.26.1, experimental)
**Config:** `.mcp.json` (project root, `wokwi` server entry)

### Available MCP Tools (11 tools, verified 2026-03-02)

| Tool | Required Params | Description |
|------|----------------|-------------|
| `wokwi_start_simulation` | `projectPath?` | Start simulation |
| `wokwi_stop_simulation` | - | Stop simulation |
| `wokwi_resume_simulation` | - | Resume paused simulation |
| `wokwi_restart_simulation` | - | Restart simulation |
| `wokwi_get_status` | - | Get simulation status |
| `wokwi_write_serial` | `text` | Write to serial monitor |
| `wokwi_read_serial` | `clear?` | Read serial buffer |
| `wokwi_read_pin` | `partId`, `pin` | Read pin value |
| `wokwi_set_control` | `partId`, `control`, `value` | Set part control (e.g. temperature) |
| `wokwi_take_screenshot` | `partId` | Screenshot display component |
| `wokwi_export_vcd` | `outputPath` | Export VCD logic analyzer data |

### MCP Resources (2 resources)

| URI | Description |
|-----|-------------|
| `file://wokwi.toml` | Project configuration |
| `file://diagram.json` | Circuit diagram |

### Agent-Driven Testing Flow (via MCP)

```
1. wokwi_start_simulation → Start ESP32 simulation
2. wokwi_read_serial (poll) → Wait for "MQTT connected"
3. mosquitto_pub (Bash) → Inject MQTT config/commands
4. wokwi_read_serial → Read response
5. wokwi_set_control → Change sensor values dynamically
6. wokwi_read_serial → Verify sensor data published
7. wokwi_read_pin → Verify GPIO states (LED, actuator)
8. wokwi_export_vcd → Save timing data for analysis
9. wokwi_stop_simulation → Clean up
```

### Quota Notes

- MCP handshake and tool discovery do NOT consume quota
- Starting a simulation DOES consume CI minutes
- Nightly schedule: Mon+Thu (cron: `0 2 * * 1,4`) to preserve quota
- Quota is account-wide, not per-token

---

## Scenario Count (2026-03-02)

| Category | Count | CI Type |
|----------|-------|---------|
| 01-boot | 2 | core |
| 02-sensor | 18 | core (5) + nightly (13 dynamic) |
| 03-actuator | 7 | core |
| 04-zone | 2 | core |
| 05-emergency | 3 | core |
| 06-config | 2 | core |
| 07-combined | 2 | core |
| 08-i2c | 20 | core (5) + nightly (15) |
| 08-onewire | 29 | nightly |
| 09-hardware | 9 | nightly |
| 09-pwm | 18 | core (3) + nightly (15) |
| 10-nvs | 40 | core (5) + nightly (35) |
| 11-error-injection | 10 | core |
| 12-correlation | 5 | nightly |
| gpio | 24 | core (5) + nightly (19) |
| **Total** | **191** | **52 core + 139 nightly** |

---

## References

### Code Locations

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| **WOKWI_SIMULATION Guard** | `config_manager.cpp` | 71-111 | Compile-time credentials |
| **WOKWI_ESP_ID Application** | `config_manager.cpp` | 1332 | ESP ID from define |
| **Registration Gate** | `mqtt_client.cpp` | 520-539 | Publish blocking |
| **confirmRegistration()** | `main.cpp` | 1671 | Gate opener (Heartbeat ACK) |
| **Heartbeat Handler** | `heartbeat_handler.py` | 139, 184, 152 | Server-side status transitions |
| **Seed Script** | `seed_wokwi_esp.py` | 61-64 | Device pre-approval |

### Documentation

- **Device Status Flow:** `.claude/reports/current/WOKWI_DEVICE_STATUS_FLOW.md`
- **ESP32 Analysis:** `.technical-manager/inbox/agent-reports/wokwi-esp32-analysis-2026-02-11.md`
- **ESP32 Development:** `.technical-manager/inbox/agent-reports/wokwi-esp32-development-2026-02-11.md`
- **TM Integration Plan:** `.technical-manager/commands/pending/wokwi-integration-improvement.md`
- **System Operations:** `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`
- **Error-Injection Mapping:** `.claude/reference/testing/WOKWI_ERROR_MAPPING.md`
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`

### External Resources

- **Wokwi CI Docs:** [docs.wokwi.com/wokwi-ci/getting-started](https://docs.wokwi.com/wokwi-ci/getting-started)
- **Wokwi CLI Reference:** [docs.wokwi.com/wokwi-ci/cli-reference](https://docs.wokwi.com/wokwi-ci/cli-reference)
- **PlatformIO Wokwi:** [docs.platformio.org/en/latest/platforms/espressif32.html#wokwi-simulation](https://docs.platformio.org/en/latest/platforms/espressif32.html#wokwi-simulation)

---

**Last Review:** 2026-02-11
**Next Review:** After Phase 3 (Multi-ESP Support) implementation
**Maintainer:** VS Code Agent (claude-sonnet-4-5)
