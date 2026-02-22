"""
AutoOps CLI Runner - Entry point for running AutoOps from command line.

Can be invoked directly or via Claude Code slash commands.

Usage:
    # Full autonomous run with sensor specs
    python -m autoops.runner --mode configure --sensors DS18B20,SHT31 --actuators relay

    # Health check only
    python -m autoops.runner --mode health

    # Debug & fix scan
    python -m autoops.runner --mode debug

    # Full workflow (health -> configure -> debug -> verify)
    python -m autoops.runner --mode full --sensors DS18B20,PH --zone "Gewächshaus"
"""

import argparse
import asyncio
import json
import sys
from typing import Any

from .core.agent import AutoOpsAgent
from .core.context import ActuatorSpec, ESPSpec, SensorSpec


# Sensor type presets with intelligent defaults
SENSOR_PRESETS: dict[str, dict[str, Any]] = {
    "DS18B20": {
        "sensor_type": "temperature",
        "name": "DS18B20 Temperature",
        "interface_type": "ONEWIRE",
        "raw_value": 22.0,
        "unit": "°C",
    },
    "SHT31": {
        "sensor_type": "temperature",
        "name": "SHT31 Temperature",
        "interface_type": "I2C",
        "i2c_address": 0x44,
        "raw_value": 22.0,
        "unit": "°C",
    },
    "SHT31_HUMIDITY": {
        "sensor_type": "humidity",
        "name": "SHT31 Humidity",
        "interface_type": "I2C",
        "i2c_address": 0x44,
        "raw_value": 55.0,
        "unit": "%",
    },
    "PH": {
        "sensor_type": "ph",
        "name": "pH Sensor",
        "interface_type": "ANALOG",
        "raw_value": 6.5,
        "unit": "pH",
    },
    "EC": {
        "sensor_type": "ec",
        "name": "EC Sensor",
        "interface_type": "ANALOG",
        "raw_value": 1.2,
        "unit": "mS/cm",
    },
    "MOISTURE": {
        "sensor_type": "moisture",
        "name": "Soil Moisture",
        "interface_type": "ANALOG",
        "raw_value": 40.0,
        "unit": "%",
    },
    "CO2": {
        "sensor_type": "co2",
        "name": "CO2 Sensor",
        "interface_type": "ANALOG",
        "raw_value": 400.0,
        "unit": "ppm",
    },
    "LIGHT": {
        "sensor_type": "light",
        "name": "Light Sensor",
        "interface_type": "ANALOG",
        "raw_value": 500.0,
        "unit": "lux",
    },
}

ACTUATOR_PRESETS: dict[str, dict[str, Any]] = {
    "RELAY": {"actuator_type": "relay", "name": "Relay"},
    "PUMP": {"actuator_type": "relay", "name": "Water Pump"},
    "VALVE": {"actuator_type": "valve", "name": "Water Valve"},
    "FAN": {"actuator_type": "pwm_fan", "name": "Ventilation Fan"},
    "PWM": {"actuator_type": "pwm_fan", "name": "PWM Output"},
}


def parse_sensors(sensor_str: str) -> list[SensorSpec]:
    """Parse comma-separated sensor types into SensorSpec list."""
    specs = []
    for raw in sensor_str.split(","):
        name = raw.strip().upper()
        if not name:
            continue

        preset = SENSOR_PRESETS.get(name)
        if preset:
            specs.append(SensorSpec(**preset))
            # SHT31 auto-adds humidity as second value
            if name == "SHT31" and "SHT31_HUMIDITY" in SENSOR_PRESETS:
                specs.append(SensorSpec(**SENSOR_PRESETS["SHT31_HUMIDITY"]))
        else:
            # Unknown sensor - create generic
            specs.append(
                SensorSpec(
                    sensor_type=name.lower(),
                    name=f"{name} Sensor",
                    raw_value=0.0,
                )
            )

    return specs


def parse_actuators(actuator_str: str) -> list[ActuatorSpec]:
    """Parse comma-separated actuator types into ActuatorSpec list."""
    specs = []
    for raw in actuator_str.split(","):
        name = raw.strip().upper()
        if not name:
            continue

        preset = ACTUATOR_PRESETS.get(name)
        if preset:
            specs.append(ActuatorSpec(**preset))
        else:
            specs.append(
                ActuatorSpec(
                    actuator_type=name.lower(),
                    name=f"{name} Actuator",
                )
            )

    return specs


def build_esp_spec(
    sensors: list[SensorSpec],
    actuators: list[ActuatorSpec],
    name: str = "AutoOps ESP",
    zone: str | None = None,
    hardware: str = "ESP32_WROOM",
) -> ESPSpec:
    """Build an ESPSpec from parsed components."""
    return ESPSpec(
        name=name,
        hardware_type=hardware,
        zone_name=zone,
        sensors=sensors,
        actuators=actuators,
        auto_heartbeat=True,
        heartbeat_interval=60,
    )


async def run_autoops(
    mode: str = "full",
    server_url: str = "http://localhost:8000",
    username: str = "admin",
    password: str = "admin",
    sensors_str: str = "",
    actuators_str: str = "",
    zone: str | None = None,
    esp_name: str = "AutoOps ESP",
    hardware: str = "ESP32_WROOM",
    dry_run: bool = False,
    verbose: bool = True,
) -> dict[str, Any]:
    """
    Main entry point for AutoOps execution.

    Args:
        mode: "full", "health", "configure", "debug"
        server_url: God-Kaiser server URL
        sensors_str: Comma-separated sensor types (DS18B20,SHT31,PH)
        actuators_str: Comma-separated actuator types (RELAY,PUMP,FAN)
        zone: Zone name to assign
        esp_name: Name for the created ESP
        hardware: Hardware type (ESP32_WROOM, XIAO_ESP32_C3)
        dry_run: If True, only plan without executing
        verbose: Verbose output

    Returns:
        Session result dict
    """
    agent = AutoOpsAgent(
        server_url=server_url,
        username=username,
        password=password,
        dry_run=dry_run,
        verbose=verbose,
    )

    try:
        # Initialize
        init_result = await agent.initialize()
        if verbose:
            print(f"[AutoOps] Session: {init_result['session_id']}")
            print(f"[AutoOps] Plugins: {len(init_result['plugins'])} discovered")
            print(f"[AutoOps] Auth: {init_result['auth_status']}")
            print(f"[AutoOps] Health: {init_result['health_status']}")
            print()

        # Build ESP specs if configuring
        if mode in ("full", "configure") and sensors_str:
            sensors = parse_sensors(sensors_str)
            actuators = parse_actuators(actuators_str) if actuators_str else []
            spec = build_esp_spec(sensors, actuators, name=esp_name, zone=zone, hardware=hardware)
            agent.context.esp_specs = [spec]

            if verbose:
                print(f"[AutoOps] ESP Config: {esp_name}")
                print(f"[AutoOps]   Sensors: {[s.sensor_type for s in sensors]}")
                print(f"[AutoOps]   Actuators: {[a.actuator_type for a in actuators]}")
                if zone:
                    print(f"[AutoOps]   Zone: {zone}")
                print()

        # Determine plugins based on mode
        plugins = None
        if mode == "health":
            plugins = ["health_check"]
        elif mode == "configure":
            plugins = ["health_check", "esp_configurator"]
        elif mode == "debug":
            plugins = ["health_check", "debug_fix"]
        # mode == "full" → runs all plugins (default)

        # Execute
        result = await agent.run_autonomous(plugins=plugins)

        if verbose:
            print()
            print(result.get("summary", ""))
            print()
            print(f"[AutoOps] Report: {result.get('report_path', 'N/A')}")

        return result

    finally:
        await agent.cleanup()


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="AutoOps - Autonomous Operations Agent for AutomationOne"
    )
    parser.add_argument(
        "--mode",
        choices=["full", "health", "configure", "debug"],
        default="full",
        help="Operation mode",
    )
    parser.add_argument("--server", default="http://localhost:8000", help="God-Kaiser server URL")
    parser.add_argument("--username", default="admin", help="Auth username")
    parser.add_argument("--password", default="admin", help="Auth password")
    parser.add_argument(
        "--sensors",
        default="",
        help="Comma-separated sensor types (DS18B20,SHT31,PH,EC,MOISTURE,CO2,LIGHT)",
    )
    parser.add_argument(
        "--actuators", default="", help="Comma-separated actuator types (RELAY,PUMP,VALVE,FAN,PWM)"
    )
    parser.add_argument("--zone", default=None, help="Zone name")
    parser.add_argument("--esp-name", default="AutoOps ESP", help="ESP device name")
    parser.add_argument(
        "--hardware",
        default="ESP32_WROOM",
        choices=["ESP32_WROOM", "XIAO_ESP32_C3"],
        help="Hardware type",
    )
    parser.add_argument("--dry-run", action="store_true", help="Plan only, no execution")
    parser.add_argument("--quiet", action="store_true", help="Minimal output")
    parser.add_argument("--json", action="store_true", help="JSON output")

    args = parser.parse_args()

    result = asyncio.run(
        run_autoops(
            mode=args.mode,
            server_url=args.server,
            username=args.username,
            password=args.password,
            sensors_str=args.sensors,
            actuators_str=args.actuators,
            zone=args.zone,
            esp_name=args.esp_name,
            hardware=args.hardware,
            dry_run=args.dry_run,
            verbose=not args.quiet,
        )
    )

    if args.json:
        # Clean result for JSON output (remove non-serializable items)
        clean = {k: v for k, v in result.items() if k != "summary"}  # summary is already printed
        print(json.dumps(clean, indent=2, default=str))

    sys.exit(0 if result.get("all_passed", False) else 1)


if __name__ == "__main__":
    main()
