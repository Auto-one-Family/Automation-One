"""
Database Initialization Script

Creates all tables, seeds initial data, creates default admin user.
Run this script to initialize a fresh database.

Usage:
    poetry run python scripts/init_db.py
    or
    python -m scripts.init_db
"""

import asyncio
import os
import secrets
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from sqlalchemy import text

from src.core.config import get_settings
from src.core.logging_config import get_logger
from src.core.security import hash_password
from src.db.base import Base
from src.db.repositories.system_config_repo import SystemConfigRepository
from src.db.repositories.user_repo import UserRepository
from src.db.session import get_engine, get_session, init_db

logger = get_logger(__name__)
settings = get_settings()


async def create_default_admin() -> tuple[str, str]:
    """
    Create default admin user if it doesn't exist.
    
    Returns:
        Tuple of (username, password) - password is generated if not in ENV
    """
    async for session in get_session():
        try:
            user_repo = UserRepository(session)
            
            # Check if admin already exists
            admin_user = await user_repo.get_by_username("admin")
            if admin_user:
                logger.info("Default admin user already exists")
                return ("admin", "[existing password]")
            
            # Get password from ENV or generate
            admin_password = os.getenv("ADMIN_PASSWORD")
            if not admin_password:
                # Generate secure random password
                admin_password = secrets.token_urlsafe(16)
                logger.warning(
                    f"\n{'='*60}\n"
                    f"DEFAULT ADMIN PASSWORD GENERATED:\n"
                    f"Username: admin\n"
                    f"Password: {admin_password}\n"
                    f"{'='*60}\n"
                    f"⚠️  SAVE THIS PASSWORD! It will not be shown again.\n"
                    f"To set a custom password, use ADMIN_PASSWORD environment variable.\n"
                )
            else:
                logger.info("Using ADMIN_PASSWORD from environment")
            
            # Create admin user
            admin_user = await user_repo.create_user(
                username="admin",
                email=os.getenv("ADMIN_EMAIL", "admin@example.com"),
                password=admin_password,
                role="admin",
                full_name="System Administrator",
            )
            
            await session.commit()
            logger.info(f"Default admin user created: {admin_user.username}")
            
            return ("admin", admin_password)
            
        except Exception as e:
            logger.error(f"Failed to create default admin: {e}", exc_info=True)
            await session.rollback()
            raise
        finally:
            break


async def create_default_system_settings() -> None:
    """Create default system settings."""
    async for session in get_session():
        try:
            system_config_repo = SystemConfigRepository(session)
            
            # MQTT Auth settings
            await system_config_repo.set_mqtt_auth_config(
                enabled=False,
                username=None,
                password_hash=None,
            )
            
            await session.commit()
            logger.info("Default system settings created")
            
        except Exception as e:
            logger.error(f"Failed to create default system settings: {e}", exc_info=True)
            await session.rollback()
            raise
        finally:
            break


async def run_alembic_upgrade() -> None:
    """
    Run Alembic migrations to create/update database schema.
    
    Uses subprocess to run 'alembic upgrade head'.
    """
    import subprocess
    
    logger.info("Running Alembic migrations...")
    
    try:
        # Change to project root directory
        os.chdir(project_root)
        
        # Run alembic upgrade head
        result = subprocess.run(
            ["alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True,
        )
        
        logger.info("Alembic migrations completed successfully")
        if result.stdout:
            logger.debug(f"Alembic output: {result.stdout}")
            
    except subprocess.CalledProcessError as e:
        logger.error(f"Alembic migration failed: {e}")
        if e.stdout:
            logger.error(f"stdout: {e.stdout}")
        if e.stderr:
            logger.error(f"stderr: {e.stderr}")
        raise
    except FileNotFoundError:
        logger.error(
            "Alembic not found. Install it with: poetry add alembic"
        )
        raise


async def main() -> None:
    """
    Main initialization function.
    
    Steps:
    1. Run Alembic migrations (create tables)
    2. Create default admin user
    3. Create default system settings
    """
    logger.info("=" * 60)
    logger.info("Database Initialization Script")
    logger.info("=" * 60)
    
    try:
        # Step 1: Run Alembic migrations
        logger.info("Step 1: Running database migrations...")
        await run_alembic_upgrade()
        
        # Step 2: Create default admin
        logger.info("Step 2: Creating default admin user...")
        username, password = await create_default_admin()
        
        # Step 3: Create default system settings
        logger.info("Step 3: Creating default system settings...")
        await create_default_system_settings()
        
        logger.info("=" * 60)
        logger.info("Database initialization completed successfully!")
        logger.info("=" * 60)
        
        if password != "[existing password]":
            logger.info(f"\nAdmin credentials:")
            logger.info(f"  Username: {username}")
            logger.info(f"  Password: {password}")
            logger.info("\n⚠️  Save these credentials securely!")
        
    except Exception as e:
        logger.error(f"Database initialization failed: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
