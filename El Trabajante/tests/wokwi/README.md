# Wokwi ESP32 Test Scenarios

> **Purpose:** Test real ESP32 firmware in Wokwi virtual environment

---

## Overview

These YAML test scenarios validate the ESP32 firmware boot sequence, WiFi connectivity, and MQTT communication using the Wokwi simulator.

**Key Difference from Server Tests:**
- Server tests (`El Servador/tests/esp32/`) = Python tests against Mock/Real ESPs
- Wokwi tests = Real C++ firmware running in virtual environment

---

## Test Scenarios

| File | Purpose | Timeout |
|------|---------|---------|
| `boot_test.yaml` | Validate boot sequence phases 0-5 | 90s |
| `mqtt_connection.yaml` | Validate MQTT connectivity | 90s |

---

## Prerequisites

### 1. Build Firmware

```bash
cd "El Trabajante"
pio run -e wokwi_simulation
```

### 2. Install Wokwi CLI

```bash
curl -L https://wokwi.com/ci/install.sh | sh
export PATH="$HOME/.wokwi/bin:$PATH"
```

### 3. Get Wokwi CLI Token

1. Visit https://wokwi.com/dashboard/ci
2. Create a new token
3. Set environment variable: `export WOKWI_CLI_TOKEN=your_token`

### 4. Start MQTT Broker (for MQTT tests)

**Windows (Program Files\mosquitto):**
```powershell
# Start Mosquitto service
net start mosquitto

# Or run directly (if not a service)
& "C:\Program Files\mosquitto\mosquitto.exe" -v
```

**Docker:**
```bash
docker run -d -p 1883:1883 \
  -e "MOSQUITTO_ALLOW_ANONYMOUS=true" \
  eclipse-mosquitto:2 mosquitto -c /mosquitto-no-auth.conf

# Or with anonymous config
mkdir -p /tmp/mosquitto
echo -e "listener 1883\nallow_anonymous true" > /tmp/mosquitto/mosquitto.conf
docker run -d -p 1883:1883 -v /tmp/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf eclipse-mosquitto:2
```

**Linux:**
```bash
mosquitto -c /etc/mosquitto/mosquitto.conf
```

---

## Running Tests

### Local Development

```bash
cd "El Trabajante"

# Boot sequence test
wokwi-cli run --timeout 90000 --scenario tests/wokwi/boot_test.yaml

# MQTT connection test
wokwi-cli run --timeout 90000 --scenario tests/wokwi/mqtt_connection.yaml
```

### CI/CD (GitHub Actions)

Tests run automatically on push/PR to `El Trabajante/` directory.

See `.github/workflows/wokwi-tests.yml` for CI configuration.

---

## Expected Serial Output

### Boot Test Success (from main.cpp)

```
╔═══════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)      ║
╚═══════════════════════════════════════════╝
Chip Model: ESP32
...
✅ Watchdog configured: 30s timeout, no panic

=== GPIO SAFE-MODE INITIALIZATION ===
Board Type: ESP32-WROOM-32
GPIOManager: Safe-Mode initialization complete

[INFO] Logger system initialized
[INFO] ConfigManager: WOKWI_SIMULATION mode - using compile-time credentials
...
║   Phase 1: Core Infrastructure READY  ║
...
[INFO] Connecting to WiFi: Wokwi-GUEST
[INFO] WiFi connected! IP: 10.10.0.x
[INFO] MQTT connected successfully
║   Phase 2: Communication Layer READY  ║
...
[INFO] I2C Bus Manager initialized
║   Phase 3: Hardware Abstraction READY  ║
║   Phase 4: Sensor System READY         ║
║   Phase 5: Actuator System READY      ║
[INFO] Initial heartbeat sent for ESP registration
```

### MQTT Test Success (from mqtt_client.cpp, main.cpp)

```
[INFO] Connecting to WiFi: Wokwi-GUEST
[INFO] WiFi connected! IP: 10.10.0.x
[INFO] MQTTClient initialized
[INFO] MQTT connected successfully
[INFO] Subscribed to system + actuator + zone assignment + subzone management topics
[INFO] Initial heartbeat sent for ESP registration
=== Memory Status (Phase 2) ===
Free Heap: 230000 bytes
```

---

## Wokwi Configuration Files

| File | Purpose |
|------|---------|
| `wokwi.toml` | Wokwi CLI configuration (firmware path, network gateway) |
| `diagram.json` | Virtual hardware diagram (ESP32 + sensors) |
| `platformio.ini` | Build environment `[env:wokwi_simulation]` |

---

## Troubleshooting

### "SSID not found"

Wokwi uses `Wokwi-GUEST` as the simulated WiFi network. Ensure the firmware is built with `WOKWI_SIMULATION` flag.

### "MQTT connection failed"

1. Check if MQTT broker is running
2. In Wokwi, `host.wokwi.internal` routes to localhost
3. In CI, mosquitto service must be running

### "Timeout waiting for serial"

1. Increase timeout in YAML scenario
2. Check if expected message matches actual output (case-sensitive)
3. Run simulation manually to see actual output

### Build Errors

```bash
# Clean and rebuild
cd "El Trabajante"
pio run -e wokwi_simulation -t clean
pio run -e wokwi_simulation
```

---

## Adding New Test Scenarios

1. Create new YAML file in `tests/wokwi/`
2. Follow Wokwi scenario format:
   ```yaml
   name: My Test
   version: 1
   steps:
     - wait-serial: "Expected output"
       timeout: 10000
   ```
3. Update GitHub Actions workflow if needed
4. Test locally before pushing

---

## Related Documentation

- [Wokwi CLI Documentation](https://docs.wokwi.com/wokwi-cli/getting-started)
- [Wokwi ESP32 Simulation](https://docs.wokwi.com/chips/esp32)
- [Server ESP32 Tests](../../El Servador/docs/ESP32_TESTING.md)

---

**Last Updated:** 2026-01-05
