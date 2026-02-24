# W9: Wokwi Gateway-Routing Analysis

> **Date:** 2026-02-23
> **Branch:** feature/frontend-consolidation
> **Context:** Wokwi MQTT connectivity issues from simulation to Docker Mosquitto

---

## 1. wokwi.toml Configuration

**File:** `El Trabajante/wokwi.toml`

```toml
[wokwi]
version = 1
firmware = ".pio/build/wokwi_simulation/firmware.bin"
elf = ".pio/build/wokwi_simulation/firmware.elf"

rfc2217ServerPort = 4000

[wokwi.network]
gateway = true

[wokwi.serial]
baud = 115200
```

**Status:** `gateway = true` is correctly set. This should enable the simulated ESP32 to reach the host machine via `host.wokwi.internal`.

---

## 2. Firmware MQTT-Host Configuration

### platformio.ini (wokwi_simulation environment)

```ini
[env:wokwi_simulation]
extends = env:esp32_dev
build_flags =
    ${env:esp32_dev.build_flags}
    -D WOKWI_SIMULATION=1
    -D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"
    -D WOKWI_WIFI_PASSWORD=\"\"
    -D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
    -D WOKWI_MQTT_PORT=1883
    -D WOKWI_ESP_ID=\"ESP_00000001\"
```

### config_manager.cpp (runtime usage)

```cpp
// Line 91-95
#ifdef WOKWI_MQTT_HOST
  config.server_address = WOKWI_MQTT_HOST;  // "host.wokwi.internal"
#else
  config.server_address = "host.wokwi.internal";
#endif
```

### main.cpp (MQTT connection)

```cpp
MQTTConfig mqtt_config;
mqtt_config.server = wifi_config.server_address;  // "host.wokwi.internal"
mqtt_config.port = wifi_config.mqtt_port;          // 1883
```

**Status:** The firmware correctly uses `host.wokwi.internal` as MQTT host, which Wokwi's network gateway should resolve to the host machine (localhost).

---

## 3. Docker MQTT Broker Configuration

### docker-compose.yml

```yaml
mqtt-broker:
  image: eclipse-mosquitto:2
  container_name: automationone-mqtt
  ports:
    - "1883:1883"   # MQTT (PUBLISHED - correct)
    - "9001:9001"   # WebSocket
```

**Status:** Port 1883 is correctly **published** (not just exposed). This means it's accessible on `0.0.0.0:1883` from the host.

### mosquitto.conf

```
listener 1883
protocol mqtt
allow_anonymous true
```

**Status:** Anonymous connections allowed (correct for development). No authentication barrier for Wokwi ESP.

---

## 4. Diagnosis: Why Does the Connection Fail?

### Known Symptom (from project history)
> "MQTT Connection reset by peer: Despite all 3 prerequisites being met (no local Mosquitto, port published, firewall open), MQTT from Wokwi to Docker-Mosquitto fails. Mosquitto logs show NO connection attempt -> Wokwi Gateway routing problem."

### Root Cause Analysis

The connection chain is:

```
Wokwi ESP32 Firmware
  → DNS: "host.wokwi.internal"
    → Wokwi Gateway (gateway = true)
      → Host Machine (localhost)
        → Docker port mapping (0.0.0.0:1883 → container:1883)
          → Mosquitto Broker
```

**Potential failure points:**

| # | Point | Status | Issue |
|---|-------|--------|-------|
| 1 | Wokwi Gateway enabled | OK | `gateway = true` in wokwi.toml |
| 2 | DNS resolution | SUSPECT | `host.wokwi.internal` must resolve correctly in Wokwi's network stack |
| 3 | Gateway routing to host | SUSPECT | Wokwi Private Gateway may route differently than Wokwi Cloud |
| 4 | Docker port binding | OK | `0.0.0.0:1883:1883` confirmed |
| 5 | Mosquitto accepting | OK | `allow_anonymous true`, listening on `0.0.0.0:1883` |
| 6 | Windows Firewall | SUSPECT | Inbound rule for port 1883 must be active |

### Key Observations

1. **Mosquitto logs show NO connection attempt** - This means the TCP connection never reaches the broker. The failure is between the Wokwi Gateway and Docker's port binding.

2. **Wokwi Private Gateway vs. Cloud Gateway** - With Wokwi Pro Private Gateway, the `host.wokwi.internal` hostname behavior may differ. The private gateway runs locally and the DNS resolution happens inside the Wokwi simulation environment.

3. **Windows networking specifics** - Docker Desktop on Windows uses WSL2 or Hyper-V. The `0.0.0.0:1883` binding on Docker goes through the Windows network stack. Wokwi's gateway also goes through the Windows network stack but via a different path (Wokwi CLI process -> localhost).

4. **No `[net.forward]` section** - The wokwi.toml only has `gateway = true` but no explicit port forwarding rules. According to Wokwi docs, `gateway = true` should automatically forward all TCP connections from `host.wokwi.internal` to the host machine.

---

## 5. Recommended Fix Stages

### Stage 1: Verify Basic Connectivity (Low Effort)

Run the pre-flight check script:
```bash
bash "El Trabajante/tests/wokwi/helpers/preflight_check.sh"
```

Manually verify the Wokwi CLI version supports the gateway feature:
```bash
wokwi-cli --version
```

Check Windows Firewall rule exists:
```powershell
Get-NetFirewallRule -DisplayName "*MQTT*" | Get-NetFirewallPortFilter
```

### Stage 2: Alternative Host Address (Quick Fix)

If `host.wokwi.internal` doesn't resolve, try using the actual Windows LAN IP instead:

```ini
; In platformio.ini, replace:
-D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
; With the actual Windows IP (example):
-D WOKWI_MQTT_HOST=\"192.168.1.100\"
```

To find the Windows IP:
```bash
ipconfig.exe | grep -A5 "Ethernet adapter\|WiFi"
```

**Trade-off:** This breaks CI (which needs `host.wokwi.internal`). Would need conditional build flags or a CI-specific override.

### Stage 3: Explicit Port Forwarding in wokwi.toml (Medium Effort)

Add explicit network forwarding rules to `wokwi.toml`:

```toml
[wokwi.network]
gateway = true

# Explicit port forward for MQTT
[[net.forward]]
from = "host.wokwi.internal:1883"
to = "localhost:1883"
```

**Note:** This syntax depends on the Wokwi CLI version. Check Wokwi docs for the exact `net.forward` syntax supported by your version.

### Stage 4: Docker Network Mode Host (Last Resort)

Change Docker Mosquitto to use host network mode instead of port mapping:

```yaml
mqtt-broker:
  image: eclipse-mosquitto:2
  network_mode: host
  # Remove ports: section (not needed with host networking)
```

**Trade-off:** This changes the entire Docker networking model. Other services referencing `mqtt-broker` by hostname would need to use `localhost` instead. NOT recommended unless all other stages fail.

---

## 6. Recommended Action

**Start with Stage 1** (verify prerequisites are actually met at the moment of testing).

If Stage 1 passes but MQTT still fails, **try Stage 2** with the actual Windows IP to confirm it's a DNS/routing issue with `host.wokwi.internal`.

If Stage 2 works, the permanent fix is either:
- Stage 3 (explicit forwarding in wokwi.toml) if supported by CLI version
- A conditional platformio.ini flag: `WOKWI_MQTT_HOST` defaults to `host.wokwi.internal` for CI, but can be overridden via environment variable for local development

### Suggested platformio.ini Enhancement

```ini
; In [env:wokwi_simulation]:
; Allow override via environment variable for local development
; CI uses default host.wokwi.internal, local dev can set WOKWI_MQTT_HOST_OVERRIDE
-D WOKWI_MQTT_HOST=\"${sysenv.WOKWI_MQTT_HOST_OVERRIDE:host.wokwi.internal}\"
```

This would allow local development to override the host without breaking CI:
```bash
export WOKWI_MQTT_HOST_OVERRIDE="192.168.1.100"
pio run -e wokwi_simulation
```

---

## Summary

| Component | Configuration | Status |
|-----------|--------------|--------|
| wokwi.toml gateway | `gateway = true` | OK |
| Firmware MQTT host | `host.wokwi.internal:1883` | OK (correct for Wokwi) |
| Docker port mapping | `ports: ["1883:1883"]` | OK (published, not just exposed) |
| Mosquitto auth | `allow_anonymous true` | OK |
| DNS resolution | `host.wokwi.internal` → localhost | SUSPECT (main failure point) |
| Windows Firewall | Port 1883 inbound | NEEDS VERIFICATION |
| Wokwi CLI version | v0.19.1 | NEEDS VERIFICATION for gateway support |
