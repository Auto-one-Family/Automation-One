# ESP32 Test Category Runner

Führe ESP32-Tests für eine spezifische Kategorie aus. Nutzt dynamisches File-Management um PlatformIO's Multiple-Definition-Problem zu umgehen.

## Usage

Invoke the PowerShell script with the requested test category:

```powershell
cd "El Trabajante"
.\scripts\run-test-category.ps1 -Category <category>
```

## Available Categories

- `infra` - Infrastructure tests (Error-Tracking, Config, Storage, Logger, Topics)
- `actuator` - Actuator system tests (Manager, Safety, PWM, Integration)
- `sensor` - Sensor system tests (Manager, Pi-Enhanced, I2C, OneWire, Integration)
- `comm` - Communication tests (MQTT, WiFi, HTTP)
- `integration` - Integration tests (Full-System, Phase2)
- `all` - Run all categories sequentially

## Examples

```powershell
# Run infrastructure tests
cd "El Trabajante"
.\scripts\run-test-category.ps1 -Category infra

# Run actuator tests
cd "El Trabajante"
.\scripts\run-test-category.ps1 -Category actuator

# Run all test categories sequentially
cd "El Trabajante"
.\scripts\run-test-category.ps1 -Category all
```

## What the Script Does

1. **Archive**: Moves all test .cpp files to `test/_archive/`
2. **Restore**: Copies only the requested category tests back to `test/`
3. **Execute**: Runs `pio test -e esp32_dev`
4. **Cleanup**: Moves tests back to archive
5. **Report**: Shows PASS/FAIL/IGNORE summary

## Output Analysis

- **PASS**: Test successful ✓
- **FAIL**: Test failed - needs investigation ✗
- **IGNORE**: Hardware/GPIO not available - OK for graceful degradation ⚠

## Test Results

Results are logged to: `El Trabajante/test/test_output.log`

Check for failures:
```powershell
Select-String ":FAIL" test\test_output.log
```

## Troubleshooting

### Script not found
Ensure you're in the `El Trabajante` directory:
```powershell
cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
```

### PlatformIO not found
Use full path:
```powershell
~/.platformio/penv/Scripts/platformio.exe test -e esp32_dev
```

### Tests still fail with multiple definitions
Check that archive cleanup happened:
```powershell
# Should be empty (except helpers/)
ls test/*.cpp

# Should contain all test files
ls test/_archive/*.cpp
```

## Important Notes

- **Production Safe**: Tests are read-only on production devices
- **Server Independent**: No MQTT broker needed (MockMQTTBroker)
- **Hardware Independent**: Uses VirtualActuatorDriver for missing hardware
- **CI/CD Ready**: Works on empty ESP32 and deployed systems

## Related Documentation

- Test patterns: `El Trabajante/test/README.md`
- Test workflow: `.claude/TEST_WORKFLOW.md`
- Build commands: `.claude/commands/esp-build.md`
