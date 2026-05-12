# pH-Sensor Integration Test Suite — AUT-373

Systematic end-to-end verification of the pH sensor stack in AutomationOne.

**Hardware:** ESP32 DevKit WROOM, COM3  
**Scope:** pH sensor only (no EC in this test run)  
**Mode:** Observe, test, document — no production code changes

| GPIO | Sensor | Type |
|------|--------|------|
| 32 | Haoshi H-101 | ph (on_demand) |
| 4 | DS18B20 | ds18b20 (OneWire) |

## Prerequisites

```bash
pip install -r scripts/requirements.txt
```

Set env vars (copy `.env.example` or export directly):

```bash
export AO_BASE_URL=http://localhost:8000
export AO_USERNAME=operator@example.com
export AO_PASSWORD=yourpassword
export AO_ESP_ID=ESP_XXXXXX        # real ESP UUID from DB
export AO_SERIAL_PORT=COM3         # default
export AO_MQTT_BROKER=localhost    # optional
```

## Test Scripts (run in order S1 → S8)

| Script | Issue | Description |
|--------|-------|-------------|
| `scripts/s1-setup-config-verify.py` | AUT-374 | Frontend setup + temp sensor link |
| `scripts/s2-calibration-sim.py` | AUT-375 | 2-point calibration (simulated) |
| `scripts/s3-ondemand-measure.py` | AUT-376 | On-demand measure + ATC |
| `scripts/s4-latency-error.py` | AUT-377 | Latency + error analysis |
| `scripts/s5-abort-scenarios.py` | AUT-378 | Abort scenarios |
| `scripts/s6-stress-test.py` | AUT-379 | Stress test (hardware-cautious) |
| `scripts/s7-delete-readd.py` | AUT-380 | Delete + re-add, data integrity |
| `scripts/s8-zone-switch.py` | AUT-381 | Zone switch, historical data |

## Output Files

All outputs go to `outputs/`. See `outputs/README.md` for format details.

## Architecture Context

See `docs/architecture-context.md` for relevant server/firmware architecture facts.
