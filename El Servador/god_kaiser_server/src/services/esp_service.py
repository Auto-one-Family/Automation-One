"""
ESP Device Service - Business Logic for ESP Device Operations

Phase: 5 (Week 9-10) - API Layer
Priority: 🟡 HIGH
Status: IMPLEMENTED

Provides:
- ESP device registration and management
- Health tracking and status updates
- Configuration management via MQTT
- Restart and reset commands

This service provides shared business logic used by both:
- REST API endpoints (api/v1/esp.py)
- MQTT handlers (mqtt/handlers/heartbeat_handler.py, discovery_handler.py)

References:
- .claude/PI_SERVER_REFACTORING.md (Lines 125-133)
- El Trabajante/docs/Mqtt_Protocoll.md
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..core.logging_config import get_logger
from ..db.models.esp import ESPDevice
from ..db.repositories import ESPRepository
from ..mqtt.publisher import Publisher

logger = get_logger(__name__)


class ESPService:
    """
    ESP device business logic service.
    
    Handles ESP registration, health tracking, and commands.
    """
    
    def __init__(
        self,
        esp_repo: ESPRepository,
        publisher: Optional[Publisher] = None,
    ):
        """
        Initialize ESPService.
        
        Args:
            esp_repo: ESP repository
            publisher: MQTT publisher (optional, created if not provided)
        """
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()
    
    # =========================================================================
    # Device Registration
    # =========================================================================
    
    async def register_device(
        self,
        device_id: str,
        ip_address: str,
        mac_address: str,
        firmware_version: str = "unknown",
        hardware_type: str = "ESP32_WROOM",
        name: Optional[str] = None,
        zone_id: Optional[str] = None,
        zone_name: Optional[str] = None,
        is_zone_master: bool = False,
        capabilities: Optional[Dict[str, Any]] = None,
    ) -> ESPDevice:
        """
        Register a new ESP device or update existing.
        
        Args:
            device_id: ESP device ID (ESP_XXXXXXXX format)
            ip_address: Device IP address
            mac_address: Device MAC address
            firmware_version: Firmware version
            hardware_type: Hardware type
            name: Human-readable name
            zone_id: Zone identifier
            zone_name: Zone name
            is_zone_master: Whether device is zone master
            capabilities: Device capabilities
            
        Returns:
            Created or updated ESPDevice
        """
        existing = await self.esp_repo.get_by_device_id(device_id)
        
        if existing:
            # Update existing device
            existing.ip_address = ip_address
            existing.mac_address = mac_address
            existing.firmware_version = firmware_version
            existing.hardware_type = hardware_type
            if name:
                existing.name = name
            if zone_id:
                existing.zone_id = zone_id
            if zone_name:
                existing.zone_name = zone_name
            existing.is_zone_master = is_zone_master
            if capabilities:
                existing.capabilities = capabilities
            existing.status = "online"
            existing.last_seen = datetime.now(timezone.utc)
            
            logger.info(f"ESP device updated: {device_id}")
            return existing
        else:
            # Create new device
            device = ESPDevice(
                device_id=device_id,
                ip_address=ip_address,
                mac_address=mac_address,
                firmware_version=firmware_version,
                hardware_type=hardware_type,
                name=name,
                zone_id=zone_id,
                zone_name=zone_name,
                is_zone_master=is_zone_master,
                capabilities=capabilities or {},
                status="online",
                last_seen=datetime.now(timezone.utc),
                metadata={},
            )
            created = await self.esp_repo.create(device)
            
            logger.info(f"ESP device registered: {device_id}")
            return created
    
    async def unregister_device(
        self,
        device_id: str,
    ) -> bool:
        """
        Unregister (delete) an ESP device.
        
        Args:
            device_id: ESP device ID
            
        Returns:
            True if deleted, False if not found
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            return False
        
        await self.esp_repo.delete(device.id)
        logger.info(f"ESP device unregistered: {device_id}")
        return True
    
    # =========================================================================
    # Health Tracking
    # =========================================================================
    
    async def update_health(
        self,
        device_id: str,
        uptime: int,
        heap_free: int,
        wifi_rssi: int,
        sensor_count: int = 0,
        actuator_count: int = 0,
        timestamp: Optional[int] = None,
    ) -> bool:
        """
        Update ESP device health from heartbeat.
        
        Args:
            device_id: ESP device ID
            uptime: Seconds since boot
            heap_free: Free heap memory (bytes)
            wifi_rssi: WiFi signal strength (dBm)
            sensor_count: Active sensor count
            actuator_count: Active actuator count
            timestamp: Heartbeat timestamp
            
        Returns:
            True if updated, False if device not found
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.warning(f"Health update for unknown device: {device_id}")
            return False
        
        # Update status and last_seen
        device.status = "online"
        device.last_seen = datetime.now(timezone.utc)

        # Store health data in metadata
        health_data = {
            "uptime": uptime,
            "heap_free": heap_free,
            "wifi_rssi": wifi_rssi,
            "sensor_count": sensor_count,
            "actuator_count": actuator_count,
            "timestamp": timestamp or int(datetime.now(timezone.utc).timestamp()),
        }
        
        metadata = device.metadata or {}
        metadata["health"] = health_data
        device.metadata = metadata
        
        logger.debug(f"Health updated for {device_id}: uptime={uptime}s, heap={heap_free}, rssi={wifi_rssi}")
        return True
    
    async def check_device_status(
        self,
        offline_threshold_seconds: int = 120,
    ) -> Dict[str, List[str]]:
        """
        Check all device statuses and mark offline devices.
        
        Args:
            offline_threshold_seconds: Seconds since last_seen to mark offline
            
        Returns:
            Dictionary with lists of online, offline, and newly_offline devices
        """
        all_devices = await self.esp_repo.get_all()
        now = datetime.now(timezone.utc)
        threshold = timedelta(seconds=offline_threshold_seconds)
        
        online = []
        offline = []
        newly_offline = []
        
        for device in all_devices:
            if device.last_seen and (now - device.last_seen) < threshold:
                # Device is online
                if device.status != "online":
                    device.status = "online"
                online.append(device.device_id)
            else:
                # Device is offline
                if device.status == "online":
                    device.status = "offline"
                    newly_offline.append(device.device_id)
                    logger.warning(f"ESP device went offline: {device.device_id}")
                offline.append(device.device_id)
        
        return {
            "online": online,
            "offline": offline,
            "newly_offline": newly_offline,
        }
    
    # =========================================================================
    # Commands
    # =========================================================================
    
    async def send_config(
        self,
        device_id: str,
        config: Dict[str, Any],
    ) -> bool:
        """
        Send configuration update to ESP via MQTT.
        
        Args:
            device_id: ESP device ID
            config: Configuration data
            
        Returns:
            True if sent successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot send config: device {device_id} not found")
            return False
        
        success = self.publisher.publish_config(
            esp_id=device_id,
            config=config,
        )
        
        if success:
            logger.info(f"Config sent to {device_id}: {list(config.keys())}")
        else:
            logger.error(f"Failed to send config to {device_id}")
        
        return success
    
    async def send_restart(
        self,
        device_id: str,
        delay_seconds: int = 0,
        reason: Optional[str] = None,
    ) -> bool:
        """
        Send restart command to ESP.
        
        Args:
            device_id: ESP device ID
            delay_seconds: Delay before restart
            reason: Restart reason
            
        Returns:
            True if sent successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot restart: device {device_id} not found")
            return False
        
        success = self.publisher.publish_system_command(
            esp_id=device_id,
            command="REBOOT",
            params={
                "delay_seconds": delay_seconds,
                "reason": reason or "Manual restart",
            },
        )
        
        if success:
            logger.info(f"Restart command sent to {device_id}")
        else:
            logger.error(f"Failed to send restart to {device_id}")
        
        return success
    
    async def send_factory_reset(
        self,
        device_id: str,
        preserve_wifi: bool = False,
    ) -> bool:
        """
        Send factory reset command to ESP.
        
        Args:
            device_id: ESP device ID
            preserve_wifi: Whether to preserve WiFi credentials
            
        Returns:
            True if sent successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            logger.error(f"Cannot reset: device {device_id} not found")
            return False
        
        success = self.publisher.publish_system_command(
            esp_id=device_id,
            command="FACTORY_RESET",
            params={
                "preserve_wifi": preserve_wifi,
            },
        )
        
        if success:
            logger.warning(f"Factory reset command sent to {device_id}")
        else:
            logger.error(f"Failed to send factory reset to {device_id}")
        
        return success
    
    # =========================================================================
    # Queries
    # =========================================================================
    
    async def get_device(
        self,
        device_id: str,
    ) -> Optional[ESPDevice]:
        """
        Get ESP device by device_id.
        
        Args:
            device_id: ESP device ID
            
        Returns:
            ESPDevice or None
        """
        return await self.esp_repo.get_by_device_id(device_id)
    
    async def get_all_devices(
        self,
        zone_id: Optional[str] = None,
        status: Optional[str] = None,
        hardware_type: Optional[str] = None,
    ) -> List[ESPDevice]:
        """
        Get all ESP devices with optional filters.
        
        Args:
            zone_id: Filter by zone
            status: Filter by status
            hardware_type: Filter by hardware type
            
        Returns:
            List of ESPDevice
        """
        if zone_id:
            return await self.esp_repo.get_by_zone(zone_id)
        elif status:
            return await self.esp_repo.get_by_status(status)
        elif hardware_type:
            return await self.esp_repo.get_by_hardware_type(hardware_type)
        else:
            return await self.esp_repo.get_all()
    
    async def get_health_summary(self) -> Dict[str, Any]:
        """
        Get health summary for all devices.
        
        Returns:
            Health summary dictionary
        """
        devices = await self.esp_repo.get_all()
        
        total = len(devices)
        online = sum(1 for d in devices if d.status == "online")
        offline = sum(1 for d in devices if d.status == "offline")
        error = sum(1 for d in devices if d.status == "error")
        unknown = sum(1 for d in devices if d.status == "unknown")
        
        # Collect health metrics from online devices
        heap_values = []
        rssi_values = []
        
        for device in devices:
            if device.status == "online" and device.metadata:
                health = device.metadata.get("health", {})
                if "heap_free" in health:
                    heap_values.append(health["heap_free"])
                if "wifi_rssi" in health:
                    rssi_values.append(health["wifi_rssi"])
        
        return {
            "total_devices": total,
            "online_count": online,
            "offline_count": offline,
            "error_count": error,
            "unknown_count": unknown,
            "avg_heap_free": sum(heap_values) / len(heap_values) if heap_values else None,
            "avg_wifi_rssi": sum(rssi_values) / len(rssi_values) if rssi_values else None,
        }
    
    # =========================================================================
    # Kaiser Assignment
    # =========================================================================
    
    async def assign_to_kaiser(
        self,
        device_id: str,
        kaiser_id: str,
    ) -> bool:
        """
        Assign ESP device to a Kaiser node.
        
        Args:
            device_id: ESP device ID
            kaiser_id: Kaiser node ID
            
        Returns:
            True if assigned successfully
        """
        device = await self.esp_repo.get_by_device_id(device_id)
        if not device:
            return False
        
        metadata = device.metadata or {}
        metadata["kaiser_id"] = kaiser_id
        device.metadata = metadata
        
        logger.info(f"ESP {device_id} assigned to Kaiser {kaiser_id}")
        return True
    
    async def get_devices_by_kaiser(
        self,
        kaiser_id: str,
    ) -> List[ESPDevice]:
        """
        Get all ESP devices assigned to a Kaiser node.
        
        Args:
            kaiser_id: Kaiser node ID
            
        Returns:
            List of ESPDevice
        """
        all_devices = await self.esp_repo.get_all()
        return [
            d for d in all_devices
            if d.metadata and d.metadata.get("kaiser_id") == kaiser_id
        ]
