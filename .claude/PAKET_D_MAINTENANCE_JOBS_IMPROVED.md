# Paket D: Maintenance Jobs (IMPROVED - Data-Safe Version)

**Projekt:** AutomationOne Framework
**Paket-Version:** 2.0 (Data-Safe Edition)
**Erstellt:** 2025-12-27
**Zielgruppe:** Backend-Entwickler
**Geschätzter Aufwand:** 1-2 Arbeitstage
**Abhängigkeit:** Paket A (CentralScheduler) muss abgeschlossen sein

---

## 🎯 Design-Prinzipien (KRITISCH)

1. **Safety First:** Keine Daten löschen ohne explizite User-Konfiguration
2. **Unlimited Storage:** User kann Daten unendlich speichern
3. **Dry-Run:** Alle Cleanups testbar ohne Datenverlust
4. **Transparency:** User sieht was gelöscht wird BEVOR es gelöscht wird
5. **Rollback:** Möglichkeit zur Wiederherstellung (Archiv-Optionen)

---

## 1. Ziel

Nach diesem Paket läuft das System autonom mit **sicheren** automatischen Wartungsaufgaben:
- ✅ Alte Daten werden NUR bereinigt wenn User es konfiguriert
- ✅ Verwaiste Einträge werden entfernt (NUR wenn User es will)
- ✅ System-Health wird überwacht (keine Datenlöschung)
- ✅ Statistiken werden aggregiert (keine Datenlöschung)

---

## 2. Übersicht der Jobs

| Job | Kategorie | Intervall | Löscht Daten? | Default |
|-----|-----------|-----------|---------------|---------|
| `cleanup_sensor_data` | MAINTENANCE | Täglich 03:00 | ⚠️ JA | **DISABLED** |
| `cleanup_command_history` | MAINTENANCE | Täglich 03:30 | ⚠️ JA | **DISABLED** |
| `cleanup_audit_logs` | MAINTENANCE | Täglich 04:00 | ⚠️ JA | **DISABLED** |
| `cleanup_orphaned_mocks` | MAINTENANCE | Stündlich | ⚠️ JA (Mocks) | **WARN ONLY** |
| `health_check_esps` | MONITOR | Alle 60s | ❌ NEIN | **ENABLED** |
| `health_check_mqtt` | MONITOR | Alle 30s | ❌ NEIN | **ENABLED** |
| `aggregate_stats` | MAINTENANCE | Stündlich | ❌ NEIN | **ENABLED** |

**WICHTIG:** Cleanup-Jobs sind **per Default DISABLED** um Datenverlust zu verhindern!

---

## 3. Phase 1: MaintenanceService mit Safety-Features

### 3.1 Konfiguration (ERWEITERT)

**Datei:** `src/core/config.py`

```python
from pydantic import BaseSettings, validator
from typing import Optional

class MaintenanceSettings(BaseSettings):
    """
    Maintenance & Cleanup Konfiguration

    WICHTIG: Alle Cleanup-Jobs sind per Default DISABLED!
    User muss explizit aktivieren um Datenverlust zu verhindern.
    """

    # ─────────────────────────────────────────────────────────
    # SENSOR DATA CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    SENSOR_DATA_RETENTION_ENABLED: bool = False  # ⚠️ Default: DISABLED
    SENSOR_DATA_RETENTION_DAYS: int = 30  # Nur wenn ENABLED
    SENSOR_DATA_CLEANUP_DRY_RUN: bool = True  # Safety: Dry-Run per Default
    SENSOR_DATA_CLEANUP_BATCH_SIZE: int = 1000  # Max Records pro Batch
    SENSOR_DATA_CLEANUP_MAX_BATCHES: int = 100  # Max 100.000 Records pro Run

    # ─────────────────────────────────────────────────────────
    # COMMAND HISTORY CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    COMMAND_HISTORY_RETENTION_ENABLED: bool = False  # ⚠️ Default: DISABLED
    COMMAND_HISTORY_RETENTION_DAYS: int = 14  # Nur wenn ENABLED
    COMMAND_HISTORY_CLEANUP_DRY_RUN: bool = True  # Safety: Dry-Run per Default
    COMMAND_HISTORY_CLEANUP_BATCH_SIZE: int = 1000
    COMMAND_HISTORY_CLEANUP_MAX_BATCHES: int = 50

    # ─────────────────────────────────────────────────────────
    # AUDIT LOG CLEANUP (DEFAULT: DISABLED)
    # ─────────────────────────────────────────────────────────
    AUDIT_LOG_RETENTION_ENABLED: bool = False  # ⚠️ Default: DISABLED
    AUDIT_LOG_RETENTION_DAYS: int = 90  # Nur wenn ENABLED
    AUDIT_LOG_CLEANUP_DRY_RUN: bool = True  # Safety: Dry-Run per Default
    AUDIT_LOG_CLEANUP_BATCH_SIZE: int = 1000
    AUDIT_LOG_CLEANUP_MAX_BATCHES: int = 200

    # ─────────────────────────────────────────────────────────
    # ORPHANED MOCKS CLEANUP (DEFAULT: WARN ONLY)
    # ─────────────────────────────────────────────────────────
    ORPHANED_MOCK_CLEANUP_ENABLED: bool = True  # Enabled aber nur Warnings
    ORPHANED_MOCK_AUTO_DELETE: bool = False  # ⚠️ Default: Nur loggen
    ORPHANED_MOCK_AGE_HOURS: int = 24  # Mock muss 24h alt sein

    # ─────────────────────────────────────────────────────────
    # HEALTH CHECKS (IMMER ENABLED - löschen keine Daten)
    # ─────────────────────────────────────────────────────────
    HEARTBEAT_TIMEOUT_SECONDS: int = 180  # 3x Heartbeat-Intervall
    MQTT_HEALTH_CHECK_INTERVAL_SECONDS: int = 30
    ESP_HEALTH_CHECK_INTERVAL_SECONDS: int = 60

    # ─────────────────────────────────────────────────────────
    # STATS AGGREGATION (IMMER ENABLED - löschen keine Daten)
    # ─────────────────────────────────────────────────────────
    STATS_AGGREGATION_ENABLED: bool = True
    STATS_AGGREGATION_INTERVAL_MINUTES: int = 60

    # ─────────────────────────────────────────────────────────
    # ADVANCED SAFETY FEATURES
    # ─────────────────────────────────────────────────────────
    CLEANUP_REQUIRE_CONFIRMATION: bool = True  # Warnung beim ersten Start
    CLEANUP_ALERT_THRESHOLD_PERCENT: float = 10.0  # Alert wenn >10% gelöscht
    CLEANUP_MAX_RECORDS_PER_RUN: int = 100000  # Safety-Limit

    @validator("SENSOR_DATA_RETENTION_DAYS")
    def validate_sensor_retention(cls, v, values):
        """Warne bei zu kurzer Retention-Period"""
        if v < 7 and values.get("SENSOR_DATA_RETENTION_ENABLED"):
            logger.warning(
                f"SENSOR_DATA_RETENTION_DAYS={v} ist sehr kurz! "
                "Empfohlen: >= 7 Tage"
            )
        return v

    @validator("COMMAND_HISTORY_RETENTION_DAYS")
    def validate_command_retention(cls, v, values):
        """Warne bei zu kurzer Retention-Period"""
        if v < 7 and values.get("COMMAND_HISTORY_RETENTION_ENABLED"):
            logger.warning(
                f"COMMAND_HISTORY_RETENTION_DAYS={v} ist sehr kurz! "
                "Empfohlen: >= 7 Tage"
            )
        return v
```

### 3.2 Environment Variables (.env)

```bash
# ───────────────────────────────────────────────────────────
# MAINTENANCE JOBS - Default: ALLE CLEANUPS DISABLED
# ───────────────────────────────────────────────────────────

# Sensor Data Cleanup (DEFAULT: DISABLED)
SENSOR_DATA_RETENTION_ENABLED=false  # ⚠️ Explizit aktivieren!
SENSOR_DATA_RETENTION_DAYS=30
SENSOR_DATA_CLEANUP_DRY_RUN=true  # Safety: Zuerst testen!

# Command History Cleanup (DEFAULT: DISABLED)
COMMAND_HISTORY_RETENTION_ENABLED=false  # ⚠️ Explizit aktivieren!
COMMAND_HISTORY_RETENTION_DAYS=14
COMMAND_HISTORY_CLEANUP_DRY_RUN=true  # Safety: Zuerst testen!

# Audit Log Cleanup (DEFAULT: DISABLED)
AUDIT_LOG_RETENTION_ENABLED=false  # ⚠️ Explizit aktivieren!
AUDIT_LOG_RETENTION_DAYS=90
AUDIT_LOG_CLEANUP_DRY_RUN=true  # Safety: Zuerst testen!

# Orphaned Mocks Cleanup (DEFAULT: WARN ONLY)
ORPHANED_MOCK_CLEANUP_ENABLED=true
ORPHANED_MOCK_AUTO_DELETE=false  # ⚠️ Nur Warnings, keine Deletion!

# Health Checks (DEFAULT: ENABLED - löschen keine Daten)
HEARTBEAT_TIMEOUT_SECONDS=180
MQTT_HEALTH_CHECK_INTERVAL_SECONDS=30
ESP_HEALTH_CHECK_INTERVAL_SECONDS=60

# Stats Aggregation (DEFAULT: ENABLED - löschen keine Daten)
STATS_AGGREGATION_ENABLED=true
STATS_AGGREGATION_INTERVAL_MINUTES=60
```

---

## 4. Phase 2: Cleanup Jobs (DATA-SAFE)

### 4.1 Sensor Data Cleanup (VERBESSERT)

**Datei:** `src/services/maintenance/jobs/cleanup.py`

```python
from sqlalchemy.orm import Session
from sqlalchemy import func, delete
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class SensorDataCleanup:
    """
    Sensor Data Cleanup Job mit Safety-Features

    Features:
    - Dry-Run Mode (zählt nur, löscht nicht)
    - Batch-Processing (verhindert DB-Lock)
    - Safety-Limits (Max Records pro Run)
    - Transparency (loggt was gelöscht wird)
    - Rollback bei Fehlern
    """

    def __init__(self, session: Session, settings: MaintenanceSettings):
        self.session = session
        self.settings = settings
        self.logger = logging.getLogger(f"{__name__}.SensorDataCleanup")

    def execute(self) -> dict:
        """
        Führt Sensor Data Cleanup aus

        Returns:
            dict: {
                "dry_run": bool,
                "records_found": int,
                "records_deleted": int,
                "batches_processed": int,
                "cutoff_date": str,
                "duration_seconds": float
            }
        """
        # ────────────────────────────────────────────────────
        # SAFETY CHECK 1: Ist Cleanup aktiviert?
        # ────────────────────────────────────────────────────
        if not self.settings.SENSOR_DATA_RETENTION_ENABLED:
            self.logger.info(
                "Sensor data cleanup is DISABLED. "
                "Set SENSOR_DATA_RETENTION_ENABLED=true to activate."
            )
            return {
                "dry_run": False,
                "records_found": 0,
                "records_deleted": 0,
                "batches_processed": 0,
                "cutoff_date": None,
                "duration_seconds": 0,
                "status": "disabled"
            }

        start_time = datetime.utcnow()
        dry_run = self.settings.SENSOR_DATA_CLEANUP_DRY_RUN
        retention_days = self.settings.SENSOR_DATA_RETENTION_DAYS
        cutoff_date = datetime.utcnow() - timedelta(days=retention_days)

        # ────────────────────────────────────────────────────
        # PHASE 1: Zähle zu löschende Records
        # ────────────────────────────────────────────────────
        from god_kaiser_server.src.db.models import SensorData

        total_records = self.session.query(func.count(SensorData.id)).scalar()

        records_to_delete = (
            self.session.query(func.count(SensorData.id))
            .filter(SensorData.timestamp < cutoff_date)
            .scalar()
        )

        if records_to_delete == 0:
            self.logger.info(
                f"No sensor data older than {cutoff_date.date()} found. "
                "Cleanup not needed."
            )
            return {
                "dry_run": dry_run,
                "records_found": 0,
                "records_deleted": 0,
                "batches_processed": 0,
                "cutoff_date": cutoff_date.isoformat(),
                "duration_seconds": 0,
                "status": "nothing_to_delete"
            }

        # ────────────────────────────────────────────────────
        # SAFETY CHECK 2: Zu viele Records?
        # ────────────────────────────────────────────────────
        deletion_percent = (records_to_delete / total_records * 100) if total_records > 0 else 0

        if deletion_percent > self.settings.CLEANUP_ALERT_THRESHOLD_PERCENT:
            self.logger.warning(
                f"⚠️  CLEANUP ALERT: {records_to_delete:,} records ({deletion_percent:.1f}%) "
                f"will be deleted! Cutoff: {cutoff_date.date()}"
            )

        if records_to_delete > self.settings.CLEANUP_MAX_RECORDS_PER_RUN:
            self.logger.error(
                f"❌ CLEANUP ABORTED: {records_to_delete:,} records exceeds "
                f"safety limit ({self.settings.CLEANUP_MAX_RECORDS_PER_RUN:,}). "
                "Increase CLEANUP_MAX_RECORDS_PER_RUN or reduce RETENTION_DAYS."
            )
            return {
                "dry_run": dry_run,
                "records_found": records_to_delete,
                "records_deleted": 0,
                "batches_processed": 0,
                "cutoff_date": cutoff_date.isoformat(),
                "duration_seconds": 0,
                "status": "aborted_safety_limit"
            }

        # ────────────────────────────────────────────────────
        # PHASE 2: Dry-Run oder echte Deletion?
        # ────────────────────────────────────────────────────
        if dry_run:
            self.logger.warning(
                f"🔍 DRY-RUN MODE: Would delete {records_to_delete:,} records "
                f"older than {cutoff_date.date()}. Set SENSOR_DATA_CLEANUP_DRY_RUN=false "
                "to actually delete."
            )
            return {
                "dry_run": True,
                "records_found": records_to_delete,
                "records_deleted": 0,
                "batches_processed": 0,
                "cutoff_date": cutoff_date.isoformat(),
                "duration_seconds": (datetime.utcnow() - start_time).total_seconds(),
                "status": "dry_run"
            }

        # ────────────────────────────────────────────────────
        # PHASE 3: Batch-Deletion
        # ────────────────────────────────────────────────────
        batch_size = self.settings.SENSOR_DATA_CLEANUP_BATCH_SIZE
        max_batches = self.settings.SENSOR_DATA_CLEANUP_MAX_BATCHES

        total_deleted = 0
        batches_processed = 0

        self.logger.info(
            f"Starting sensor data cleanup: {records_to_delete:,} records to delete "
            f"(cutoff: {cutoff_date.date()})"
        )

        while batches_processed < max_batches:
            try:
                # Batch deletion mit LIMIT
                stmt = (
                    delete(SensorData)
                    .where(SensorData.timestamp < cutoff_date)
                    .execution_options(synchronize_session=False)
                )

                # SQLAlchemy Delete mit Limit (PostgreSQL)
                # Falls nicht unterstützt: Verwende Subquery
                batch_ids = (
                    self.session.query(SensorData.id)
                    .filter(SensorData.timestamp < cutoff_date)
                    .limit(batch_size)
                    .all()
                )

                if not batch_ids:
                    break  # Keine Records mehr

                batch_ids = [row.id for row in batch_ids]

                result = self.session.execute(
                    delete(SensorData).where(SensorData.id.in_(batch_ids))
                )

                deleted_count = result.rowcount
                total_deleted += deleted_count
                batches_processed += 1

                self.session.commit()

                self.logger.debug(
                    f"Batch {batches_processed}: Deleted {deleted_count} records "
                    f"({total_deleted:,}/{records_to_delete:,})"
                )

                if deleted_count < batch_size:
                    break  # Letzter Batch

            except Exception as e:
                self.logger.error(
                    f"Error in batch {batches_processed}: {e}",
                    exc_info=True
                )
                self.session.rollback()
                break

        duration = (datetime.utcnow() - start_time).total_seconds()

        self.logger.info(
            f"✅ Sensor data cleanup completed: {total_deleted:,} records deleted "
            f"in {batches_processed} batches ({duration:.2f}s)"
        )

        return {
            "dry_run": False,
            "records_found": records_to_delete,
            "records_deleted": total_deleted,
            "batches_processed": batches_processed,
            "cutoff_date": cutoff_date.isoformat(),
            "duration_seconds": duration,
            "status": "success"
        }
```

### 4.2 Command History Cleanup (analog)

**Datei:** `src/services/maintenance/jobs/cleanup.py`

```python
class CommandHistoryCleanup:
    """
    Actuator Command History Cleanup Job

    Analog zu SensorDataCleanup mit gleichen Safety-Features
    """

    def __init__(self, session: Session, settings: MaintenanceSettings):
        self.session = session
        self.settings = settings
        self.logger = logging.getLogger(f"{__name__}.CommandHistoryCleanup")

    def execute(self) -> dict:
        """Analog zu SensorDataCleanup.execute()"""

        if not self.settings.COMMAND_HISTORY_RETENTION_ENABLED:
            self.logger.info(
                "Command history cleanup is DISABLED. "
                "Set COMMAND_HISTORY_RETENTION_ENABLED=true to activate."
            )
            return {"status": "disabled", "records_deleted": 0}

        # Gleiche Logik wie SensorDataCleanup
        # aber mit ActuatorCommand Model
        # ...
```

### 4.3 Orphaned Mocks Cleanup (WARN-MODE)

**Datei:** `src/services/maintenance/jobs/cleanup.py`

```python
class OrphanedMocksCleanup:
    """
    Orphaned Mock ESPs Cleanup

    DEFAULT: Nur Warnings loggen, keine Deletion!
    User muss ORPHANED_MOCK_AUTO_DELETE=true setzen für echte Deletion.
    """

    def __init__(
        self,
        session: Session,
        scheduler: "CentralScheduler",
        settings: MaintenanceSettings
    ):
        self.session = session
        self.scheduler = scheduler
        self.settings = settings
        self.logger = logging.getLogger(f"{__name__}.OrphanedMocksCleanup")

    def execute(self) -> dict:
        """
        Findet und behandelt orphaned Mocks

        Returns:
            dict: {
                "orphaned_found": int,
                "deleted": int,
                "warned": int
            }
        """
        if not self.settings.ORPHANED_MOCK_CLEANUP_ENABLED:
            return {"status": "disabled"}

        from god_kaiser_server.src.db.models import ESP
        from datetime import datetime, timedelta

        orphaned_count = 0
        deleted_count = 0
        warned_count = 0

        # ────────────────────────────────────────────────────
        # Case 1: Running state aber kein Job im Scheduler
        # ────────────────────────────────────────────────────
        running_mocks = (
            self.session.query(ESP)
            .filter(
                ESP.esp_type == "mock",
                ESP.simulation_state == "running"
            )
            .all()
        )

        for mock in running_mocks:
            job_id = f"mock_esp_{mock.id}"
            job_exists = self.scheduler.get_job(job_id) is not None

            if not job_exists:
                orphaned_count += 1

                # Setze state auf stopped (kein Datenverlust)
                mock.simulation_state = "stopped"
                self.session.commit()

                self.logger.warning(
                    f"⚠️  Orphaned Mock detected: {mock.esp_id} (ID: {mock.id}) "
                    f"- State was 'running' but no scheduler job found. "
                    "Set to 'stopped'."
                )
                warned_count += 1

        # ────────────────────────────────────────────────────
        # Case 2: Alte stopped Mocks (optional deletion)
        # ────────────────────────────────────────────────────
        cutoff_age = datetime.utcnow() - timedelta(
            hours=self.settings.ORPHANED_MOCK_AGE_HOURS
        )

        old_stopped_mocks = (
            self.session.query(ESP)
            .filter(
                ESP.esp_type == "mock",
                ESP.simulation_state == "stopped",
                ESP.updated_at < cutoff_age
            )
            .all()
        )

        if old_stopped_mocks:
            if self.settings.ORPHANED_MOCK_AUTO_DELETE:
                # AUTO-DELETE AKTIVIERT
                for mock in old_stopped_mocks:
                    self.session.delete(mock)
                    deleted_count += 1

                    self.logger.info(
                        f"🗑️  Deleted old orphaned Mock: {mock.esp_id} "
                        f"(last updated: {mock.updated_at.date()})"
                    )

                self.session.commit()
            else:
                # NUR WARNEN (DEFAULT)
                for mock in old_stopped_mocks:
                    self.logger.warning(
                        f"⚠️  Old orphaned Mock found: {mock.esp_id} "
                        f"(last updated: {mock.updated_at.date()}). "
                        "Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete."
                    )
                    warned_count += 1

        return {
            "status": "success",
            "orphaned_found": orphaned_count + len(old_stopped_mocks),
            "deleted": deleted_count,
            "warned": warned_count
        }
```

---

## 5. Phase 3: MaintenanceService Integration

**Datei:** `src/services/maintenance/service.py`

```python
from god_kaiser_server.src.core.scheduler import CentralScheduler, JobCategory
from god_kaiser_server.src.core.config import Settings
from god_kaiser_server.src.services.maintenance.jobs.cleanup import (
    SensorDataCleanup,
    CommandHistoryCleanup,
    OrphanedMocksCleanup
)
from typing import Callable, Optional
import logging

logger = logging.getLogger(__name__)

class MaintenanceService:
    """
    Maintenance Service mit Safety-First-Approach

    WICHTIG: Alle Cleanup-Jobs sind per Default DISABLED!
    """

    def __init__(
        self,
        scheduler: CentralScheduler,
        session_factory: Callable,
        mqtt_client,
        settings: Settings
    ):
        self.scheduler = scheduler
        self.session_factory = session_factory
        self.mqtt_client = mqtt_client
        self.settings = settings
        self.logger = logging.getLogger(f"{__name__}.MaintenanceService")

        # Job-Ergebnis-Cache
        self.last_results = {}

    def start(self):
        """Registriert alle Maintenance Jobs"""

        self.logger.info("Starting Maintenance Service...")

        # ────────────────────────────────────────────────────
        # STARTUP WARNING: Cleanup-Status
        # ────────────────────────────────────────────────────
        self._log_cleanup_status()

        # Cleanup Jobs (nur wenn aktiviert)
        self._register_cleanup_jobs()

        # Health Check Jobs (immer aktiv)
        self._register_health_checks()

        # Stats Aggregation (immer aktiv)
        self._register_stats_jobs()

        self.logger.info("✅ Maintenance Service started")

    def _log_cleanup_status(self):
        """Loggt Cleanup-Status beim Startup"""

        cleanup_status = []

        if self.settings.SENSOR_DATA_RETENTION_ENABLED:
            dry_run = " (DRY-RUN)" if self.settings.SENSOR_DATA_CLEANUP_DRY_RUN else ""
            cleanup_status.append(
                f"  - Sensor Data Cleanup: ENABLED{dry_run} "
                f"(retain {self.settings.SENSOR_DATA_RETENTION_DAYS} days)"
            )
        else:
            cleanup_status.append("  - Sensor Data Cleanup: DISABLED (unlimited retention)")

        if self.settings.COMMAND_HISTORY_RETENTION_ENABLED:
            dry_run = " (DRY-RUN)" if self.settings.COMMAND_HISTORY_CLEANUP_DRY_RUN else ""
            cleanup_status.append(
                f"  - Command History Cleanup: ENABLED{dry_run} "
                f"(retain {self.settings.COMMAND_HISTORY_RETENTION_DAYS} days)"
            )
        else:
            cleanup_status.append("  - Command History Cleanup: DISABLED (unlimited retention)")

        if self.settings.ORPHANED_MOCK_AUTO_DELETE:
            cleanup_status.append("  - Orphaned Mocks Cleanup: AUTO-DELETE ENABLED")
        else:
            cleanup_status.append("  - Orphaned Mocks Cleanup: WARN ONLY (no deletion)")

        self.logger.info(
            "Maintenance Cleanup Status:\n" + "\n".join(cleanup_status)
        )

    def _register_cleanup_jobs(self):
        """Registriert Cleanup Jobs (nur wenn aktiviert)"""

        # Sensor Data Cleanup (optional)
        if self.settings.SENSOR_DATA_RETENTION_ENABLED:
            self.scheduler.add_job(
                func=self._run_sensor_data_cleanup,
                trigger="cron",
                hour=3,
                minute=0,
                job_id="maintenance_cleanup_sensor_data",
                category=JobCategory.MAINTENANCE,
                replace_existing=True
            )
            self.logger.info("Registered: cleanup_sensor_data (daily 03:00)")
        else:
            self.logger.info("Skipped: cleanup_sensor_data (DISABLED)")

        # Command History Cleanup (optional)
        if self.settings.COMMAND_HISTORY_RETENTION_ENABLED:
            self.scheduler.add_job(
                func=self._run_command_history_cleanup,
                trigger="cron",
                hour=3,
                minute=30,
                job_id="maintenance_cleanup_command_history",
                category=JobCategory.MAINTENANCE,
                replace_existing=True
            )
            self.logger.info("Registered: cleanup_command_history (daily 03:30)")
        else:
            self.logger.info("Skipped: cleanup_command_history (DISABLED)")

        # Orphaned Mocks Cleanup (immer registriert, aber mit warn/delete Mode)
        if self.settings.ORPHANED_MOCK_CLEANUP_ENABLED:
            self.scheduler.add_job(
                func=self._run_orphaned_mocks_cleanup,
                trigger="interval",
                hours=1,
                job_id="maintenance_cleanup_orphaned_mocks",
                category=JobCategory.MAINTENANCE,
                replace_existing=True
            )
            mode = "AUTO-DELETE" if self.settings.ORPHANED_MOCK_AUTO_DELETE else "WARN ONLY"
            self.logger.info(f"Registered: cleanup_orphaned_mocks (hourly, {mode})")
        else:
            self.logger.info("Skipped: cleanup_orphaned_mocks (DISABLED)")

    def _register_health_checks(self):
        """Registriert Health Check Jobs (immer aktiv)"""

        # ESP Health Check
        self.scheduler.add_job(
            func=self._run_esp_health_check,
            trigger="interval",
            seconds=self.settings.ESP_HEALTH_CHECK_INTERVAL_SECONDS,
            job_id="monitor_health_check_esps",
            category=JobCategory.MONITOR,
            replace_existing=True
        )
        self.logger.info("Registered: health_check_esps (every 60s)")

        # MQTT Health Check
        self.scheduler.add_job(
            func=self._run_mqtt_health_check,
            trigger="interval",
            seconds=self.settings.MQTT_HEALTH_CHECK_INTERVAL_SECONDS,
            job_id="monitor_health_check_mqtt",
            category=JobCategory.MONITOR,
            replace_existing=True
        )
        self.logger.info("Registered: health_check_mqtt (every 30s)")

    def _register_stats_jobs(self):
        """Registriert Stats Aggregation Jobs (immer aktiv)"""

        if self.settings.STATS_AGGREGATION_ENABLED:
            self.scheduler.add_job(
                func=self._run_stats_aggregation,
                trigger="interval",
                minutes=self.settings.STATS_AGGREGATION_INTERVAL_MINUTES,
                job_id="maintenance_aggregate_stats",
                category=JobCategory.MAINTENANCE,
                replace_existing=True
            )
            self.logger.info("Registered: aggregate_stats (hourly)")
        else:
            self.logger.info("Skipped: aggregate_stats (DISABLED)")

    # ────────────────────────────────────────────────────────
    # JOB IMPLEMENTATIONS
    # ────────────────────────────────────────────────────────

    def _run_sensor_data_cleanup(self):
        """Sensor Data Cleanup Job"""
        session = self.session_factory()
        try:
            cleanup = SensorDataCleanup(session, self.settings)
            result = cleanup.execute()
            self.last_results["cleanup_sensor_data"] = result
        except Exception as e:
            self.logger.error(f"Sensor data cleanup failed: {e}", exc_info=True)
        finally:
            session.close()

    def _run_command_history_cleanup(self):
        """Command History Cleanup Job"""
        session = self.session_factory()
        try:
            cleanup = CommandHistoryCleanup(session, self.settings)
            result = cleanup.execute()
            self.last_results["cleanup_command_history"] = result
        except Exception as e:
            self.logger.error(f"Command history cleanup failed: {e}", exc_info=True)
        finally:
            session.close()

    def _run_orphaned_mocks_cleanup(self):
        """Orphaned Mocks Cleanup Job"""
        session = self.session_factory()
        try:
            cleanup = OrphanedMocksCleanup(session, self.scheduler, self.settings)
            result = cleanup.execute()
            self.last_results["cleanup_orphaned_mocks"] = result
        except Exception as e:
            self.logger.error(f"Orphaned mocks cleanup failed: {e}", exc_info=True)
        finally:
            session.close()

    def _run_esp_health_check(self):
        """ESP Health Check Job"""
        # TODO: Implementierung
        pass

    def _run_mqtt_health_check(self):
        """MQTT Health Check Job"""
        # TODO: Implementierung
        pass

    def _run_stats_aggregation(self):
        """Stats Aggregation Job"""
        # TODO: Implementierung
        pass

    def stop(self):
        """Stoppt alle Maintenance Jobs"""
        self.logger.info("Stopping Maintenance Service...")

        # Remove all maintenance jobs
        jobs_to_remove = [
            "maintenance_cleanup_sensor_data",
            "maintenance_cleanup_command_history",
            "maintenance_cleanup_orphaned_mocks",
            "monitor_health_check_esps",
            "monitor_health_check_mqtt",
            "maintenance_aggregate_stats"
        ]

        for job_id in jobs_to_remove:
            try:
                self.scheduler.remove_job(job_id)
            except Exception:
                pass  # Job existiert vielleicht nicht

        self.logger.info("✅ Maintenance Service stopped")

    def get_status(self) -> dict:
        """Status aller Maintenance Jobs"""
        return {
            "service_running": True,
            "last_results": self.last_results,
            "config": {
                "sensor_data_retention_enabled": self.settings.SENSOR_DATA_RETENTION_ENABLED,
                "command_history_retention_enabled": self.settings.COMMAND_HISTORY_RETENTION_ENABLED,
                "orphaned_mock_auto_delete": self.settings.ORPHANED_MOCK_AUTO_DELETE
            }
        }


# ────────────────────────────────────────────────────────
# DEPENDENCY INJECTION
# ────────────────────────────────────────────────────────

_maintenance_service: Optional[MaintenanceService] = None

def init_maintenance_service(
    scheduler: CentralScheduler,
    session_factory: Callable,
    mqtt_client,
    settings: Settings
) -> MaintenanceService:
    global _maintenance_service
    _maintenance_service = MaintenanceService(
        scheduler=scheduler,
        session_factory=session_factory,
        mqtt_client=mqtt_client,
        settings=settings
    )
    _maintenance_service.start()
    return _maintenance_service

def get_maintenance_service() -> MaintenanceService:
    if _maintenance_service is None:
        raise RuntimeError("MaintenanceService not initialized")
    return _maintenance_service
```

---

## 6. Debug API Endpoints (User-Friendly)

**Datei:** `src/api/v1/debug.py`

```python
from fastapi import APIRouter, HTTPException, Depends
from god_kaiser_server.src.services.maintenance.service import get_maintenance_service

router = APIRouter()

@router.get("/maintenance/status")
async def get_maintenance_status():
    """
    Maintenance Service Status

    Zeigt:
    - Welche Cleanup-Jobs sind aktiviert
    - Letzte Cleanup-Ergebnisse
    - Konfiguration
    """
    service = get_maintenance_service()
    return service.get_status()

@router.post("/maintenance/trigger/{job_name}")
async def trigger_maintenance_job(job_name: str):
    """
    Trigger Maintenance Job manuell

    WICHTIG: Dry-Run Settings gelten auch für manuelle Triggers!
    """
    service = get_maintenance_service()

    # Mapping von Job-Namen zu Methoden
    job_map = {
        "cleanup_sensor_data": service._run_sensor_data_cleanup,
        "cleanup_command_history": service._run_command_history_cleanup,
        "cleanup_orphaned_mocks": service._run_orphaned_mocks_cleanup,
        "health_check_esps": service._run_esp_health_check,
        "health_check_mqtt": service._run_mqtt_health_check,
        "aggregate_stats": service._run_stats_aggregation
    }

    if job_name not in job_map:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown job: {job_name}. Available: {list(job_map.keys())}"
        )

    # Führe Job aus (synchron)
    job_map[job_name]()

    # Hole Ergebnis
    result = service.last_results.get(job_name, {})

    return {
        "job_id": job_name,
        "triggered": True,
        "result": result
    }

@router.get("/maintenance/config")
async def get_maintenance_config():
    """
    Maintenance Konfiguration

    Zeigt alle Cleanup-Settings
    """
    from god_kaiser_server.src.core.config import get_settings
    settings = get_settings()

    return {
        "sensor_data": {
            "retention_enabled": settings.SENSOR_DATA_RETENTION_ENABLED,
            "retention_days": settings.SENSOR_DATA_RETENTION_DAYS,
            "dry_run": settings.SENSOR_DATA_CLEANUP_DRY_RUN,
            "batch_size": settings.SENSOR_DATA_CLEANUP_BATCH_SIZE
        },
        "command_history": {
            "retention_enabled": settings.COMMAND_HISTORY_RETENTION_ENABLED,
            "retention_days": settings.COMMAND_HISTORY_RETENTION_DAYS,
            "dry_run": settings.COMMAND_HISTORY_CLEANUP_DRY_RUN,
            "batch_size": settings.COMMAND_HISTORY_CLEANUP_BATCH_SIZE
        },
        "orphaned_mocks": {
            "cleanup_enabled": settings.ORPHANED_MOCK_CLEANUP_ENABLED,
            "auto_delete": settings.ORPHANED_MOCK_AUTO_DELETE,
            "age_hours": settings.ORPHANED_MOCK_AGE_HOURS
        },
        "health_checks": {
            "heartbeat_timeout_seconds": settings.HEARTBEAT_TIMEOUT_SECONDS,
            "mqtt_interval_seconds": settings.MQTT_HEALTH_CHECK_INTERVAL_SECONDS,
            "esp_interval_seconds": settings.ESP_HEALTH_CHECK_INTERVAL_SECONDS
        }
    }

@router.post("/maintenance/enable-cleanup")
async def enable_cleanup(
    cleanup_type: str,  # "sensor_data" | "command_history"
    dry_run: bool = True
):
    """
    User-Friendly: Aktiviert Cleanup mit Safety-Confirmation

    Step 1: User ruft mit dry_run=True auf → Sieht Preview
    Step 2: User bestätigt mit dry_run=False → Cleanup wird aktiviert
    """
    from god_kaiser_server.src.core.config import get_settings
    settings = get_settings()

    if cleanup_type == "sensor_data":
        # TODO: Dynamische Config-Änderung
        # Für MVP: User muss .env editieren und Server neu starten
        return {
            "message": (
                "To enable sensor data cleanup:\n"
                "1. Set SENSOR_DATA_RETENTION_ENABLED=true in .env\n"
                f"2. Set SENSOR_DATA_CLEANUP_DRY_RUN={'true' if dry_run else 'false'}\n"
                "3. Restart server"
            )
        }
    elif cleanup_type == "command_history":
        return {
            "message": (
                "To enable command history cleanup:\n"
                "1. Set COMMAND_HISTORY_RETENTION_ENABLED=true in .env\n"
                f"2. Set COMMAND_HISTORY_CLEANUP_DRY_RUN={'true' if dry_run else 'false'}\n"
                "3. Restart server"
            )
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid cleanup_type")
```

---

## 7. User-Guide: Cleanup aktivieren (SCHRITT-FÜR-SCHRITT)

### Szenario 1: User will alte Sensor-Daten löschen

**Schritt 1: Dry-Run Test (kein Datenverlust)**

```bash
# 1. .env editieren
SENSOR_DATA_RETENTION_ENABLED=true
SENSOR_DATA_RETENTION_DAYS=30  # Alles älter als 30 Tage
SENSOR_DATA_CLEANUP_DRY_RUN=true  # ⚠️ NUR TESTEN!

# 2. Server neu starten
poetry run uvicorn src.main:app --reload

# 3. Logs prüfen beim Startup:
# [maintenance] Sensor Data Cleanup: ENABLED (DRY-RUN) (retain 30 days)

# 4. Manuellen Test triggern
curl -X POST http://localhost:8000/api/v1/debug/maintenance/trigger/cleanup_sensor_data

# 5. Logs prüfen:
# [maintenance] 🔍 DRY-RUN MODE: Would delete 15420 records older than 2025-11-27
```

**Schritt 2: Echte Deletion aktivieren**

```bash
# 1. .env editieren
SENSOR_DATA_CLEANUP_DRY_RUN=false  # ⚠️ ECHTE DELETION!

# 2. Server neu starten
poetry run uvicorn src.main:app --reload

# 3. Warten bis 03:00 Uhr oder manuell triggern
curl -X POST http://localhost:8000/api/v1/debug/maintenance/trigger/cleanup_sensor_data

# 4. Logs prüfen:
# [maintenance] ✅ Sensor data cleanup completed: 15420 records deleted
```

### Szenario 2: User will UNENDLICH speichern

```bash
# .env editieren
SENSOR_DATA_RETENTION_ENABLED=false  # ⚠️ CLEANUP DISABLED
COMMAND_HISTORY_RETENTION_ENABLED=false

# Server neu starten
poetry run uvicorn src.main:app --reload

# Logs prüfen:
# [maintenance] Sensor Data Cleanup: DISABLED (unlimited retention)
# [maintenance] Command History Cleanup: DISABLED (unlimited retention)
```

---

## 8. Zusammenfassung der Verbesserungen

| Feature | Original | IMPROVED |
|---------|----------|----------|
| **Default-Verhalten** | Cleanup aktiv | ❌ Cleanup DISABLED |
| **Unlimited Retention** | Nicht möglich | ✅ `ENABLED=false` |
| **Dry-Run** | Nicht vorhanden | ✅ Per Default aktiv |
| **Safety-Limits** | Nicht vorhanden | ✅ Max Records/Run |
| **Transparency** | Basic Logs | ✅ Detaillierte Logs + Warnings |
| **User-Guide** | Fehlt | ✅ Step-by-Step Guide |
| **Rollback** | Nicht möglich | ✅ Batch-Transactions |
| **Startup-Warning** | Fehlt | ✅ Cleanup-Status beim Start |

---

## 9. Verifikation Checkliste

| # | Prüfung | Status |
|---|---------|--------|
| 1 | Cleanup-Jobs sind per Default DISABLED | ☐ |
| 2 | Dry-Run ist per Default aktiv (wenn Cleanup enabled) | ☐ |
| 3 | User kann "unlimited retention" wählen | ☐ |
| 4 | Dry-Run loggt "Would delete X records" | ☐ |
| 5 | Echte Deletion loggt "Deleted X records" | ☐ |
| 6 | Safety-Limit verhindert zu große Deletions | ☐ |
| 7 | Batch-Deletion verhindert DB-Lock | ☐ |
| 8 | Startup-Warning zeigt Cleanup-Status | ☐ |
| 9 | Manual Trigger funktioniert | ☐ |
| 10 | Health-Checks löschen keine Daten | ☐ |
| 11 | Orphaned Mocks: Nur Warnings (default) | ☐ |
| 12 | Orphaned Mocks: Auto-Delete nur wenn konfiguriert | ☐ |

---

**Ende: Paket D (Data-Safe Version)**
