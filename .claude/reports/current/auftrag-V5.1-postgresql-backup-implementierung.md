# Auftrag: V5.1 — PostgreSQL-Backup: DatabaseBackupService implementieren

> **Erstellt:** 2026-03-03
> **Erstellt von:** Automation-Experte (Life-Repo), basierend auf Phase A Analyse
> **Ziel-Repo:** `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
> **Vorgaenger:** `auftrag-phaseA-grundsicherung-analyseauftraege.md` (Analyse A1-A4 ABGESCHLOSSEN)
> **Aufwand:** ~4h
> **Agent:** server-dev (primaer) + DevOps (Dockerfile)
> **Prioritaet:** HOCH — Datensicherheit VOR Hardware-Test 2
> **Verify-Plan:** 2026-03-03, 13 Korrekturen gegen echte Codebase

---

## Kontext aus Analyse

Die Phase A Analyse hat folgendes bestaetigt:
- **Option B gewaehlt:** `pg_dump` im Server-Container installieren (postgresql-client Paket)
- **Docker-DNS:** Server erreicht PostgreSQL via `postgres:5432` (Service-Name)
- **Credentials:** POSTGRES_USER/PASSWORD/DB sind Docker-ENV-Variablen aus `.env` — sie existieren NICHT in der Server-Config (`config.py`). Muessen als neue ENV-Variablen zum Server-Container und zur Config hinzugefuegt werden (siehe Schritt 1b + 2).
- **Backup-Pfad:** `backups/database/` (relativ, analog zu `backups/audit_logs/`). ACHTUNG: Braucht Docker-Volume-Mount (siehe Schritt 1c).
- **Scheduler-Slot:** 02:00 Uhr (VOR Cleanup 03:00)
- **Pattern:** Kein DB-Session noetig — subprocess-basiert (anders als audit_backup_service)
- **Keine bestehenden `BACKUP_*` ENV-Variablen** — muessen komplett neu erstellt werden

---

## Schritt 1: Dockerfile + Docker-Compose erweitern (~20min)

### 1a: Dockerfile — postgresql-client installieren

**Datei:** `El Servador/Dockerfile`

**Aenderung:** In der Runtime-Stage (Stage 2, Zeile 45) `postgresql-client` zur bestehenden `apt-get` Zeile hinzufuegen.

**Exakt:** Die existierende Zeile lautet:
```dockerfile
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*
```

Aendern zu:
```dockerfile
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*
```

**WICHTIG:** `curl` ist bereits vorhanden (nicht vergessen). Die Aenderung muss VOR `USER appuser` (Zeile 77) bleiben.

**Verifikation:** `docker exec automationone-server pg_dump --version` → PostgreSQL Version ausgeben

### 1b: Docker-Compose — POSTGRES_* ENVs zum Server hinzufuegen

**Datei:** `docker-compose.yml` (Zeile ~90, `el-servador.environment`)

Die POSTGRES_USER/PASSWORD/DB ENV-Variablen existieren bisher NUR im `postgres`-Service. Der Server kennt nur `DATABASE_URL`. Fuer `pg_dump` braucht der Server diese Werte separat.

**Einfuegen in `el-servador.environment` (nach DATABASE_AUTO_INIT):**
```yaml
      # Database Backup (pg_dump credentials)
      POSTGRES_HOST: postgres
      POSTGRES_PORT: "5432"
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
```

### 1c: Docker-Compose — Backup-Volume hinzufuegen

**Datei:** `docker-compose.yml` (Zeile ~111, `el-servador.volumes`)

Aktuell gibt es kein Volume fuer `/app/backups/`. Ohne Volume-Mount gehen Backups bei Container-Restart verloren!

**Einfuegen nach dem logs-Volume:**
```yaml
    volumes:
      - ./El Servador/god_kaiser_server/src:/app/src:ro
      - ./logs/server:/app/logs
      - ./backups:/app/backups          # Database + Audit Backups persistent
```

**ACHTUNG:** Der `appuser` (UID 1000) im Container braucht Schreibrechte. Ggf. `mkdir -p backups && chown 1000:1000 backups` auf dem Host ausfuehren, oder im Dockerfile `mkdir -p /app/backups` VOR `USER appuser` einfuegen.

---

## Schritt 2: Config erweitern (~15min)

**Datei:** `El Servador/god_kaiser_server/src/core/config.py`

**KORREKTUR:** Die Codebase nutzt das Pattern **separate `BaseSettings`-Subklassen** (z.B. `DatabaseSettings`, `MQTTSettings`, `MaintenanceSettings`), die in der Master-Klasse `Settings` als Attribute registriert werden. Flat-Variablen direkt in `Settings` waeren **inkonsistent**.

### 2a: Neue Subklasse `DatabaseBackupSettings` erstellen

**Einfuegen nach `MaintenanceSettings` (ca. Zeile 583, vor `ResilienceSettings`):**

```python
class DatabaseBackupSettings(BaseSettings):
    """PostgreSQL database backup settings (pg_dump)."""

    enabled: bool = Field(
        default=True,
        alias="DB_BACKUP_ENABLED",
        description="Enable scheduled database backups",
    )
    hour: int = Field(
        default=2,
        alias="DB_BACKUP_HOUR",
        ge=0,
        le=23,
        description="Cron hour for scheduled backup (0-23, default 02:00)",
    )
    max_age_days: int = Field(
        default=7,
        alias="DB_BACKUP_MAX_AGE_DAYS",
        ge=1,
        le=365,
        description="Days to keep backups before cleanup",
    )
    max_count: int = Field(
        default=20,
        alias="DB_BACKUP_MAX_COUNT",
        ge=1,
        le=100,
        description="Maximum number of backups to retain",
    )
    path: str = Field(
        default="backups/database",
        alias="DB_BACKUP_PATH",
        description="Backup directory (relative to /app in container)",
    )
    # pg_dump connection (separate from DATABASE_URL for subprocess use)
    pg_host: str = Field(
        default="postgres",
        alias="POSTGRES_HOST",
        description="PostgreSQL host for pg_dump (Docker-DNS service name)",
    )
    pg_port: int = Field(
        default=5432,
        alias="POSTGRES_PORT",
        description="PostgreSQL port for pg_dump",
    )
    pg_user: str = Field(
        default="god_kaiser",
        alias="POSTGRES_USER",
        description="PostgreSQL user for pg_dump",
    )
    pg_password: str = Field(
        default="password",
        alias="POSTGRES_PASSWORD",
        description="PostgreSQL password for pg_dump (via PGPASSWORD env)",
    )
    pg_db: str = Field(
        default="god_kaiser_db",
        alias="POSTGRES_DB",
        description="PostgreSQL database name for pg_dump",
    )

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")
```

### 2b: In Master-Settings registrieren

**In `class Settings` (ca. Zeile 802, nach `maintenance`):**

```python
    maintenance: MaintenanceSettings = MaintenanceSettings()
    database_backup: DatabaseBackupSettings = DatabaseBackupSettings()  # NEU
    resilience: ResilienceSettings = ResilienceSettings()
```

### 2c: Zugriff im Code

Statt `settings.DB_BACKUP_ENABLED` → **`settings.database_backup.enabled`**
Statt `settings.POSTGRES_DB` → **`settings.database_backup.pg_db`**

---

## Schritt 3: DatabaseBackupService erstellen (~2h)

**Neue Datei:** `El Servador/god_kaiser_server/src/services/database_backup_service.py`

### Klassen-Struktur:

```python
"""PostgreSQL Database Backup Service using pg_dump."""

import asyncio
import gzip
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pydantic import BaseModel

from ..core.logging_config import get_logger
from ..core.metrics import (
    BACKUP_CREATED_TOTAL,
    BACKUP_FAILED_TOTAL,
    BACKUP_LAST_SUCCESS_TIMESTAMP,
    BACKUP_SIZE_BYTES,
)

logger = get_logger(__name__)


class BackupInfo(BaseModel):
    """Metadata for a single backup file."""
    id: str                    # Filename ohne Extension (z.B. "backup_2026-03-03_02-00-00")
    filename: str              # Voller Dateiname (z.B. "backup_2026-03-03_02-00-00.sql.gz")
    created_at: datetime
    size_bytes: int
    path: str


class DatabaseBackupService:
    """Manages PostgreSQL database backups via pg_dump subprocess."""

    def __init__(self, settings):
        """
        Args:
            settings: Application settings (Settings instance).
        """
        backup_cfg = settings.database_backup

        # Backup-Pfad: analog zu audit_backup_service.py
        # Path(__file__).parent.parent = god_kaiser_server/ → in Docker: /app/
        project_root = Path(__file__).parent.parent
        self.backup_dir = project_root / backup_cfg.path
        self.max_age_days = backup_cfg.max_age_days
        self.max_count = backup_cfg.max_count
        self.enabled = backup_cfg.enabled

        # DB connection fuer pg_dump (Docker-DNS Service-Name)
        self.db_host = backup_cfg.pg_host
        self.db_port = backup_cfg.pg_port
        self.db_name = backup_cfg.pg_db
        self.db_user = backup_cfg.pg_user
        self.db_password = backup_cfg.pg_password

        # Backup-Verzeichnis erstellen
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    async def create_backup(self) -> BackupInfo:
        """Execute pg_dump and compress output to .sql.gz file.

        Returns:
            BackupInfo with metadata of created backup.

        Raises:
            RuntimeError: If pg_dump fails.
        """
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
        backup_id = f"backup_{timestamp}"
        temp_path = self.backup_dir / f"{backup_id}.sql.tmp"
        final_path = self.backup_dir / f"{backup_id}.sql.gz"

        try:
            # pg_dump via subprocess mit PGPASSWORD (sicher, kein CLI-Argument)
            env = {**os.environ, "PGPASSWORD": self.db_password}
            process = await asyncio.create_subprocess_exec(
                "pg_dump",
                "-h", self.db_host,
                "-p", str(self.db_port),
                "-U", self.db_user,
                "-d", self.db_name,
                "--no-owner",
                "--no-acl",
                "--format=plain",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                error_msg = stderr.decode().strip()
                logger.error(f"pg_dump failed (exit {process.returncode}): {error_msg}")
                BACKUP_FAILED_TOTAL.inc()
                raise RuntimeError(f"pg_dump failed: {error_msg}")

            # Atomic Write: temp file → gzip → rename
            with gzip.open(str(temp_path), "wb") as f:
                f.write(stdout)

            temp_path.rename(final_path)

            size = final_path.stat().st_size
            logger.info(f"Database backup created: {final_path.name} ({size} bytes)")

            # Prometheus metrics
            BACKUP_CREATED_TOTAL.inc()
            BACKUP_SIZE_BYTES.set(size)
            BACKUP_LAST_SUCCESS_TIMESTAMP.set(time.time())

            return BackupInfo(
                id=backup_id,
                filename=final_path.name,
                created_at=datetime.now(timezone.utc),
                size_bytes=size,
                path=str(final_path),
            )

        except Exception:
            # Cleanup temp file bei Fehler
            if temp_path.exists():
                temp_path.unlink()
            raise

    async def list_backups(self) -> list[BackupInfo]:
        """List all existing backups, sorted by date (newest first)."""
        backups = []
        for path in sorted(self.backup_dir.glob("backup_*.sql.gz"), reverse=True):
            stat = path.stat()
            backup_id = path.stem.replace(".sql", "")  # Remove .sql from .sql.gz stem
            backups.append(BackupInfo(
                id=backup_id,
                filename=path.name,
                created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
                size_bytes=stat.st_size,
                path=str(path),
            ))
        return backups

    async def get_backup(self, backup_id: str) -> Optional[BackupInfo]:
        """Get a specific backup by ID."""
        path = self.backup_dir / f"{backup_id}.sql.gz"
        if not path.exists():
            return None
        stat = path.stat()
        return BackupInfo(
            id=backup_id,
            filename=path.name,
            created_at=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
            size_bytes=stat.st_size,
            path=str(path),
        )

    async def delete_backup(self, backup_id: str) -> bool:
        """Delete a single backup file."""
        path = self.backup_dir / f"{backup_id}.sql.gz"
        if not path.exists():
            return False
        path.unlink()
        logger.info(f"Database backup deleted: {path.name}")
        return True

    async def cleanup_old_backups(self) -> int:
        """Remove backups older than max_age_days, keep max max_count.

        Returns:
            Number of deleted backups.
        """
        backups = await self.list_backups()
        deleted = 0
        now = datetime.now(timezone.utc)

        for i, backup in enumerate(backups):
            age_days = (now - backup.created_at).days
            if age_days > self.max_age_days or i >= self.max_count:
                await self.delete_backup(backup.id)
                deleted += 1

        if deleted > 0:
            logger.info(f"Database backup cleanup: {deleted} old backups removed")
        return deleted

    async def restore_backup(self, backup_id: str, confirm: bool = False) -> bool:
        """Restore database from backup. DANGEROUS — requires confirm=True.

        Args:
            backup_id: ID of backup to restore.
            confirm: Must be True to actually execute restore.

        Returns:
            True if restore successful.
        """
        if not confirm:
            raise ValueError("Restore requires confirm=True — this will overwrite the current database!")

        backup = await self.get_backup(backup_id)
        if not backup:
            raise FileNotFoundError(f"Backup {backup_id} not found")

        # Decompress and pipe to psql
        env = {**os.environ, "PGPASSWORD": self.db_password}
        with gzip.open(backup.path, "rb") as f:
            sql_content = f.read()

        process = await asyncio.create_subprocess_exec(
            "psql",
            "-h", self.db_host,
            "-p", str(self.db_port),
            "-U", self.db_user,
            "-d", self.db_name,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        stdout, stderr = await process.communicate(input=sql_content)

        if process.returncode != 0:
            error_msg = stderr.decode().strip()
            logger.error(f"Database restore failed: {error_msg}")
            raise RuntimeError(f"Restore failed: {error_msg}")

        logger.warning(f"Database restored from backup: {backup_id}")
        return True
```

### Aenderungen gegenueber Original-Plan:

1. **Logger:** `get_logger(__name__)` statt `logging.getLogger()` (Projekt-Pattern)
2. **Config-Zugriff:** `settings.database_backup.*` statt `settings.POSTGRES_*` (Subklassen-Pattern)
3. **Pfad-Aufloesung:** `Path(__file__).parent.parent / path` (analog `audit_backup_service.py`)
4. **os.environ:** `import os` am Modul-Anfang statt `__import__('os')` Hack
5. **Prometheus:** Direkte Metriken-Updates in create_backup() integriert

---

## Schritt 4: REST-API Router erstellen (~45min)

**Neue Datei:** `El Servador/god_kaiser_server/src/api/v1/backups.py`

### Router-Prefix Pattern:

Alle bestehenden Router setzen den Prefix inkl. `/v1/` direkt im `APIRouter()`:
```python
# Beispiel diagnostics.py:
router = APIRouter(prefix="/v1/diagnostics", tags=["diagnostics"])
```

### 5 Endpoints:

```python
"""Database Backup REST API Router."""

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from ...core.logging_config import get_logger
from ...services.database_backup_service import BackupInfo
from ..deps import AdminUser

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/backups/database", tags=["backups"])


def _get_backup_service(request: Request):
    """Get DatabaseBackupService from app.state."""
    service = getattr(request.app.state, "database_backup_service", None)
    if service is None:
        raise HTTPException(status_code=503, detail="Database backup service not initialized")
    return service


@router.post("/create")
async def create_backup(request: Request, user: AdminUser) -> BackupInfo:
    service = _get_backup_service(request)
    backup = await service.create_backup()
    return backup


@router.get("/list")
async def list_backups(request: Request, user: AdminUser) -> list[BackupInfo]:
    service = _get_backup_service(request)
    return await service.list_backups()


@router.get("/{backup_id}/download")
async def download_backup(backup_id: str, request: Request, user: AdminUser):
    service = _get_backup_service(request)
    backup = await service.get_backup(backup_id)
    if not backup:
        raise HTTPException(status_code=404, detail=f"Backup {backup_id} not found")
    return FileResponse(
        path=backup.path,
        filename=backup.filename,
        media_type="application/gzip",
    )


@router.delete("/{backup_id}")
async def delete_backup(backup_id: str, request: Request, user: AdminUser):
    service = _get_backup_service(request)
    deleted = await service.delete_backup(backup_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Backup {backup_id} not found")
    return {"deleted": True}


@router.post("/{backup_id}/restore")
async def restore_backup(backup_id: str, request: Request, user: AdminUser):
    service = _get_backup_service(request)
    # confirm=True ist hardcoded — der Endpoint IST die Bestätigung
    try:
        await service.restore_backup(backup_id, confirm=True)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Backup {backup_id} not found")
    return {"restored": True}
```

### DI-Pattern:

- **Auth:** `AdminUser` aus `..deps` (Annotated Dependency, erfordert Admin-Rolle)
- **Service:** Via `request.app.state.database_backup_service` (analog MaintenanceService in main.py)
- **KEIN** `DBSession` noetig (Service ist subprocess-basiert)

### Router registrieren:

**Datei:** `El Servador/god_kaiser_server/src/api/v1/__init__.py`

```python
# Nach dem letzten bestehenden Import (diagnostics):
from .backups import router as backups_router

# Bei der Router-Registrierung (nach diagnostics_router):
api_v1_router.include_router(backups_router)  # Database Backup API

# In __all__ Liste:
"backups_router",
```

**WICHTIG:** Das Pattern ist `api_v1_router.include_router(...)`, NICHT `app.include_router(..., prefix="/v1")`.

---

## Schritt 5: Prometheus-Metriken (~15min)

**Datei:** `El Servador/god_kaiser_server/src/core/metrics.py`

**KORREKTUR:** Alle Metrik-Variablen nutzen UPPER_SNAKE_CASE (z.B. `MQTT_MESSAGES_TOTAL`, `ESP_TOTAL_GAUGE`). Plan-Original hatte lowercase.

**4 neue Metriken einfuegen** (nach den Alert Lifecycle Metrics, ca. Zeile 351):

```python
# =============================================================================
# Database Backup Metrics (Phase V5.1)
# =============================================================================

BACKUP_CREATED_TOTAL = Counter(
    "god_kaiser_backup_created_total",
    "Total successful database backups",
)

BACKUP_FAILED_TOTAL = Counter(
    "god_kaiser_backup_failed_total",
    "Total failed database backup attempts",
)

BACKUP_SIZE_BYTES = Gauge(
    "god_kaiser_backup_size_bytes",
    "Size of the last successful backup in bytes",
)

BACKUP_LAST_SUCCESS_TIMESTAMP = Gauge(
    "god_kaiser_backup_last_success_timestamp",
    "Unix timestamp of the last successful backup",
)
```

**Metriken werden direkt in `DatabaseBackupService.create_backup()` aktualisiert** (kein separater Helper noetig, da kein Label-Management).

---

## Schritt 6: Scheduler-Integration (~30min)

**Datei:** `El Servador/god_kaiser_server/src/main.py`

**KORREKTUR Insertion-Point:** Nach Step 3.4.5 (Alert Suppression, Zeile ~378), VOR Step 3.5 (Mock-ESP Recovery). Der Plan-Original sagte "nach 3.4.2" — das ist zu frueh, da 3.4.3-3.4.5 noch folgen.

**KORREKTUR Scheduler-API:** `add_cron_job` erwartet `cron_expression: Dict` und `category: JobCategory` (Enum), NICHT keyword-args `hour=`/`minute=` oder String `"maintenance"`.

```python
        # Step 3.4.6: Database Backup Service (Phase V5.1)
        logger.info("Initializing Database Backup Service...")
        if settings.database_backup.enabled:
            from .services.database_backup_service import DatabaseBackupService

            _database_backup_service = DatabaseBackupService(settings)
            app.state.database_backup_service = _database_backup_service

            async def _scheduled_database_backup():
                """Scheduled daily database backup with cleanup."""
                try:
                    backup = await _database_backup_service.create_backup()
                    await _database_backup_service.cleanup_old_backups()
                    logger.info(f"Scheduled database backup completed: {backup.filename}")
                except Exception as e:
                    logger.error(f"Scheduled database backup FAILED: {e}")

            _central_scheduler.add_cron_job(
                job_id="database_backup",
                func=_scheduled_database_backup,
                cron_expression={"hour": settings.database_backup.hour, "minute": 0},
                category=JobCategory.MAINTENANCE,
            )
            logger.info(
                f"Database backup scheduled at {settings.database_backup.hour:02d}:00"
            )
        else:
            logger.info("Database backup service DISABLED (DB_BACKUP_ENABLED=false)")
```

**ACHTUNG:** `JobCategory` muss importiert sein — pruefe ob `from .core.scheduler import JobCategory` bereits existiert (Zeile ~339 fuer Prometheus-Job). Falls ja, kein zusaetzlicher Import noetig.

---

## Schritt 7: Unit-Tests (~30min)

**Neue Datei:** `El Servador/god_kaiser_server/tests/unit/test_database_backup_service.py`

### Test-Szenarien:

| # | Test | Methode |
|---|------|---------|
| 1 | Backup erstellt `.sql.gz` Datei | Mock `asyncio.create_subprocess_exec` → stdout = SQL dump |
| 2 | Backup-Liste korrekt sortiert | Erstelle 3 Test-Dateien, prüfe Reihenfolge |
| 3 | Cleanup entfernt alte Backups | Erstelle Dateien mit alten Timestamps, pruefe Loeschung |
| 4 | Cleanup respektiert max_count | 25 Dateien → max 20 bleiben |
| 5 | Delete entfernt einzelnes Backup | Erstelle + Loesche, pruefe Nicht-Existenz |
| 6 | Restore ohne confirm → ValueError | `confirm=False` → Exception |
| 7 | pg_dump Fehler → RuntimeError | Mock return_code=1 → Exception |
| 8 | Atomic Write: temp file bei Fehler geloescht | Simuliere Fehler nach pg_dump, pruefe kein .tmp bleibt |

**HINWEIS:** Tests brauchen ein Mock-Settings-Objekt mit `database_backup.*` Attributen (nicht flache `DB_BACKUP_*`).

---

## Schritt 8: Grafana-Alert (~10min)

**KORREKTUR:** Die Verzeichnisse `monitoring/grafana/provisioning/alerting/` und `monitoring/prometheus/alerts/` existieren NICHT im Repo. Alerting muss entweder:

- **Option A:** Neues Verzeichnis erstellen: `monitoring/prometheus/alerts/backup_alerts.yml` und in Prometheus-Config einbinden
- **Option B:** Alert direkt im Grafana UI konfigurieren (kein Code noetig)
- **Option C:** Erstmal ueberspringen und nur die Prometheus-Metriken bereitstellen — Alert spaeter manuell konfigurieren

Falls Option A gewaehlt:
```yaml
groups:
  - name: database_backup
    rules:
      - alert: DatabaseBackupMissing
        expr: time() - god_kaiser_backup_last_success_timestamp > 90000
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Kein DB-Backup seit >25h"
          description: "Der letzte erfolgreiche Database-Backup ist aelter als 25 Stunden."
```

---

## Verifikation (nach Implementierung)

| # | Test | Befehl | Erwartung |
|---|------|--------|-----------|
| 1 | pg_dump verfuegbar | `docker exec automationone-server pg_dump --version` | Version ausgeben |
| 2 | Manuelles Backup | `curl -X POST http://localhost:8000/api/v1/backups/database/create -H "Authorization: Bearer <token>"` | `.sql.gz` in `backups/database/`, JSON Response |
| 3 | Backup-Liste | `curl http://localhost:8000/api/v1/backups/database/list -H "Authorization: Bearer <token>"` | Array mit BackupInfo |
| 4 | Backup-Download | `curl http://localhost:8000/api/v1/backups/database/{id}/download -H "Authorization: Bearer <token>" -o test.sql.gz` | Valide gzip-Datei |
| 5 | Backup loeschen | `curl -X DELETE http://localhost:8000/api/v1/backups/database/{id} -H "Authorization: Bearer <token>"` | `{"deleted": true}` |
| 6 | Prometheus | `curl http://localhost:8000/api/v1/health/metrics \| grep god_kaiser_backup` | 4 Metriken sichtbar |
| 7 | Scheduler | Container-Log nach 02:00 | `Scheduled database backup completed:` |
| 8 | Unit-Tests | `cd "El Servador/god_kaiser_server" && pytest tests/unit/test_database_backup_service.py -v` | Alle gruen |

**KORREKTUREN in Verifikation:**
- Alle curl-Befehle brauchen `-H "Authorization: Bearer <token>"` (Admin-Auth)
- Prometheus-Endpoint: `/api/v1/health/metrics` (NICHT `/metrics`)
- pytest-Pfad: muss aus `El Servador/god_kaiser_server/` ausgefuehrt werden

---

## Abhaengigkeiten

| Von | Braucht | Blockiert |
|-----|---------|-----------|
| Schritt 1a (Dockerfile) | Nichts | Schritt 3 (pg_dump muss installiert sein) |
| Schritt 1b (Docker-Compose ENV) | Nichts | Schritt 2 (Config liest diese ENVs) |
| Schritt 1c (Docker-Compose Volume) | Nichts | Schritt 3 (Backups muessen persistiert werden) |
| Schritt 2 (Config) | Schritt 1b | Schritt 3 (Service liest Config) |
| Schritt 3 (Service) | Schritt 1a, 1b, 1c, 2, 5 | Schritt 4, 6 |
| Schritt 4 (API) | Schritt 3 | Nichts |
| Schritt 5 (Metriken) | Nichts | Schritt 3 (Import) |
| Schritt 6 (Scheduler) | Schritt 2, 3 | Nichts |
| Schritt 7 (Tests) | Schritt 3 | Nichts |
| Schritt 8 (Grafana) | Schritt 5 | Nichts |

**Empfohlene Reihenfolge:** 1a+1b+1c → 2 → 5 → 3 → 4+6+7 (parallel) → 8

---

## Verify-Plan Zusammenfassung

**13 Korrekturen angewendet:**

| # | Kategorie | Problem | Fix |
|---|-----------|---------|-----|
| 1 | Config-Pattern | Plan wollte flat ENVs in Settings-Klasse | Neue `DatabaseBackupSettings` Subklasse (Projekt-Pattern) |
| 2 | POSTGRES_* Credentials | `settings.POSTGRES_DB` existiert nicht | Neue ENVs in docker-compose + Config-Subklasse |
| 3 | Dateipfade | `src/...` ohne Projekt-Prefix | `El Servador/god_kaiser_server/src/...` |
| 4 | Router-Registrierung | `app.include_router(..., prefix="/v1")` | `api_v1_router.include_router(...)` + `prefix="/v1/backups/database"` im Router |
| 5 | Scheduler-API (1. Version) | `hour=`, `minute=` keyword args | `cron_expression={"hour": ..., "minute": 0}` |
| 6 | Scheduler-API (category) | `category="maintenance"` String | `category=JobCategory.MAINTENANCE` Enum |
| 7 | Metriken-Variablen | lowercase `god_kaiser_backup_*` | UPPER_SNAKE_CASE `BACKUP_CREATED_TOTAL` |
| 8 | Docker-Volume fehlt | Kein Volume fuer `/app/backups/` | Volume-Mount `./backups:/app/backups` hinzugefuegt |
| 9 | Backup-Pfad-Aufloesung | `Path(settings.path)` relativ | `Path(__file__).parent.parent / path` (audit-Pattern) |
| 10 | Grafana-Alert-Pfad | Alerting-Verzeichnis existiert nicht | 3 Optionen dokumentiert |
| 11 | Prometheus-Endpoint | `/metrics` | `/api/v1/health/metrics` |
| 12 | Auth fehlt | curl ohne Auth-Header | `-H "Authorization: Bearer <token>"` (Admin required) |
| 13 | os.environ Hack | `__import__('os').environ` | `import os` am Modul-Anfang |
| 14 | Insertion-Point main.py | "Nach 3.4.2" (zu frueh) | Nach 3.4.5 (Alert Suppression), neuer Step 3.4.6 |
| 15 | Logger-Pattern | `logging.getLogger()` | `get_logger(__name__)` (Projekt-Pattern) |
