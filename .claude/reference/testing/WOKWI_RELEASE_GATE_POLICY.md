# Wokwi + Hardware Release Gate Policy

## Doppel-Gate (Pflicht)

1. **SIL-Gate (Wokwi)**  
   schnelle Regressionspruefung mit representative Suite.
2. **Hardware-Sanity-Gate**  
   Realhardware-Pfad vor Release.

Release darf nur passieren, wenn beide Gates PASS sind.

## Minimaler SIL-Pflichtsatz

- `01-boot/boot_full`
- `06-config/config_sensor_add`
- `11-error-injection/error_mqtt_disconnect`
- `07-combined/multi_device_parallel`

## Minimaler Hardware-Pflichtsatz

- Live Sensor Read (mindestens ein Sensor)
- MQTT Roundtrip (publish + ack/response)
- mindestens ein Aktor-/Safety-Pfad

## Blockierregeln

- SIL FAIL => Release blockiert
- Hardware FAIL => Release blockiert
- fehlende Artefakte/Logs => Release blockiert
- absichtlicher Fail-Simulationslauf muss Gate blockieren

## MCP-Regelung

- MCP darf fuer Diagnose und Agentenfluss genutzt werden.
- Gate-Entscheidung darf **nicht** an MCP-Verfuegbarkeit haengen.
- Bei MCP-Ausfall: Gate laeuft normal ueber CLI/Logs weiter.

## Artefakt-Pflicht

- SIL: `logs/wokwi/reports/gap3/`
- Hardware: `logs/current/hardware/gap3/`
- Zusammenfassung: `.claude/reports/current/wokwi-hardware-release-gate-verifikation-2026-04-06.md`

## Referenz

- `scripts/verify_top3_gaps.py` (Paket C)
- `scripts/tests/test_hardware_validation.ps1`
