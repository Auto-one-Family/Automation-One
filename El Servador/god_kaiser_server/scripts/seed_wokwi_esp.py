"""
Wokwi ESP Seed Script

Creates the Wokwi simulation ESP device (ESP_00000001) in the database.
This allows Wokwi-simulated firmware to connect immediately.

Usage:
    poetry run python scripts/seed_wokwi_esp.py

Prerequisites:
    - Database must exist (run init_db.py first or alembic upgrade head)
    - PostgreSQL must be running

Note:
    ESP ID Format: ESP_00000001 (8 hex characters, matches Pydantic pattern)
    The firmware in El Trabajante uses this ID for Wokwi simulation.
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from datetime import timezone

from src.core.logging_config import get_logger
from src.db.models.esp import ESPDevice
from src.db.repositories.esp_repo import ESPRepository
from src.db.session import get_session

logger = get_logger(__name__)

WOKWI_ESP_ID = "ESP_00000001"


async def seed_wokwi_esp() -> bool:
    """
    Create Wokwi simulation ESP device if it doesn't exist.

    Returns:
        True if created, False if already exists
    """
    async for session in get_session():
        try:
            esp_repo = ESPRepository(session)

            # Check if Wokwi ESP already exists
            existing_esp = await esp_repo.get_by_device_id(WOKWI_ESP_ID)
            if existing_esp:
                logger.info(f"[OK] Wokwi ESP '{WOKWI_ESP_ID}' already exists (status: {existing_esp.status})")
                return False

            # Create Wokwi ESP device
            wokwi_esp = ESPDevice(
                device_id=WOKWI_ESP_ID,
                name="Wokwi Simulation ESP",
                hardware_type="ESP32_WROOM",
                status="offline",
                zone_id=None,
                zone_name=None,
                master_zone_id=None,
                is_zone_master=False,
                kaiser_id="god",
                capabilities={
                    "max_sensors": 20,
                    "max_actuators": 12,
                    "features": ["heartbeat", "sensors", "actuators", "wokwi_simulation"],
                    "wokwi": True,
                },
                device_metadata={
                    "source": "wokwi_simulation",
                    "created_by": "seed_wokwi_esp",
                    "description": "Pre-registered Wokwi ESP for firmware simulation testing",
                    "simulation_config": {
                        "sensors": {},
                        "actuators": {},
                        "auto_heartbeat": False,
                    },
                },
            )

            session.add(wokwi_esp)
            await session.commit()

            logger.info(f"[OK] Created Wokwi ESP '{WOKWI_ESP_ID}'")
            return True

        except Exception as e:
            logger.error(f"Failed to create Wokwi ESP: {e}", exc_info=True)
            await session.rollback()
            raise
        finally:
            break

    return False


async def main() -> None:
    """Main entry point."""
    print("=" * 60)
    print("Wokwi ESP Seed Script")
    print("=" * 60)

    try:
        created = await seed_wokwi_esp()

        print()
        if created:
            print(f"[OK] Wokwi ESP '{WOKWI_ESP_ID}' created successfully!")
            print()
            print("Next steps:")
            print("  1. Mosquitto MQTT broker prüfen (läuft als Windows Service)")
            print("  2. God-Kaiser Server starten (poetry run uvicorn ...)")
            print("  3. Frontend starten (npm run dev)")
            print("  4. USER: Firmware bauen: cd 'El Trabajante' && pio run -e wokwi_simulation")
            print("  5. USER: Wokwi starten: VS Code Extension oder wokwi-cli . --timeout 0")
            print()
            print("Der ESP erscheint im Frontend sobald Wokwi verbindet.")
        else:
            print("[OK] Wokwi ESP already exists - no action needed")

        print("=" * 60)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
