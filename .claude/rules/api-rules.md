---
paths:
  - "El Servador/**"
---

# Server API Rules (El Servador)

> **Scope:** Nur fuer Dateien in `El Servador/`

---

## 1. Architektur-Prinzipien

### Server = Intelligenz

```
Server = Validierung + Transformation + Business-Logic + Persistenz
ESP32 = Dumme Agenten (RAW-Daten rein, Commands raus)
```

### 3-Schichten-Architektur

```
API Layer (api/v1/)     → Request/Response, Validation, Auth
Service Layer (services/) → Business Logic, Orchestration
Data Layer (db/, mqtt/)  → Persistence, Communication
```

- API-Endpoints rufen Services auf
- Services rufen Repositories auf
- Repositories machen DB-Queries
- **NIEMALS** DB-Queries direkt in API-Endpoints

---

## 2. Python-Konventionen

### Naming

| Element | Convention | Beispiel |
|---------|------------|----------|
| Klassen | PascalCase | `SensorService`, `ESPRepository` |
| Funktionen/Methoden | snake_case | `get_sensor_data()`, `handle_message()` |
| Variablen | snake_case | `sensor_count`, `is_active` |
| Konstanten | UPPER_SNAKE_CASE | `MAX_SENSORS`, `DEFAULT_TIMEOUT` |
| Private Members | `_` Prefix | `_internal_state` |

### Import-Reihenfolge

```python
# 1. Standard Library
import asyncio
from datetime import datetime, timezone
from typing import Optional, List

# 2. Third-party
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field

# 3. Local imports (relative)
from ..db.repositories import SensorRepository
from ..schemas import SensorCreate, SensorResponse
from ..core.logging_config import get_logger
```

### Type Hints (IMMER)

```python
async def get_sensor(
    sensor_id: uuid.UUID,
    db: AsyncSession
) -> Optional[SensorConfig]:
    ...

def process_reading(
    raw_value: float,
    calibration: dict | None = None
) -> dict[str, Any]:
    ...
```

---

## 3. Pattern-Anforderungen

### Repository-Pattern

```python
from .base_repo import BaseRepository
from ..models import SensorConfig

class SensorRepository(BaseRepository[SensorConfig]):
    def __init__(self, session: AsyncSession):
        super().__init__(SensorConfig, session)

    async def get_by_gpio(self, esp_id: str, gpio: int) -> Optional[SensorConfig]:
        stmt = select(self.model).where(
            and_(
                self.model.esp_id == esp_id,
                self.model.gpio == gpio
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
```

### Service-Pattern

```python
class SensorService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repo = SensorRepository(session)
        self.logger = get_logger(__name__)

    async def create_sensor(self, data: SensorCreate) -> SensorConfig:
        # Business Logic hier
        return await self.repo.create(**data.model_dump())
```

### MQTT-Handler-Pattern

```python
from .base_handler import BaseMQTTHandler, ValidationResult

class SensorHandler(BaseMQTTHandler):
    async def validate_payload(self, payload: dict) -> ValidationResult:
        required = ["esp_id", "gpio", "raw_value", "timestamp"]
        for field in required:
            if field not in payload:
                return ValidationResult.failure(
                    error_code=ValidationErrorCode.MISSING_REQUIRED_FIELD,
                    error_message=f"Missing: {field}"
                )
        return ValidationResult.success(data=payload)

    async def process_message(self, topic: str, payload: dict, session: AsyncSession) -> bool:
        # Message processing
        pass
```

---

## 4. FastAPI-Regeln

### Endpoint-Struktur

```python
@router.get("/{item_id}", response_model=SuccessResponse)
async def get_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_active_user)
) -> dict:
    service = ItemService(db)
    item = await service.get(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"status": "success", "data": item}
```

### Auth-Dependencies

| Dependency | Zugriff |
|------------|---------|
| `get_current_active_user` | Eingeloggte User |
| `get_current_operator_user` | Operator + Admin |
| `get_current_admin_user` | Nur Admin |

### Response-Format

```python
# Standard Success Response
{"status": "success", "data": {...}}

# Standard Error Response
{"detail": "Error message"}
```

---

## 5. Pydantic-Regeln

### Schema-Struktur

```python
from pydantic import BaseModel, Field, ConfigDict, field_validator

class SensorCreate(BaseModel):
    gpio: int = Field(..., ge=0, le=39)
    sensor_type: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)

    @field_validator("sensor_type")
    @classmethod
    def validate_sensor_type(cls, v: str) -> str:
        if v not in VALID_SENSOR_TYPES:
            raise ValueError(f"Invalid sensor type: {v}")
        return v

class SensorResponse(BaseModel):
    id: uuid.UUID
    gpio: int
    sensor_type: str
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
```

---

## 6. Database-Regeln

### Alembic Migrations

```bash
# Neue Migration erstellen
cd "El Servador/god_kaiser_server"
python -m alembic revision --autogenerate -m "Add table_name"

# Migration anwenden
python -m alembic upgrade head

# Rollback
python -m alembic downgrade -1
```

### Migration-Regeln

- **IMMER** `--autogenerate` fuer Model-Aenderungen
- **NIEMALS** Daten-loeschende Migrations ohne Backup-Plan
- **IMMER** Rollback-Faehigkeit pruefen
- Migration-Message: Verb + Objekt (`Add user_table`, `Remove old_column`)

### Session-Management

```python
# In API-Endpoints: Dependency Injection
async def endpoint(db: AsyncSession = Depends(get_db)):
    ...

# In Services: Session wird injiziert
class MyService:
    def __init__(self, session: AsyncSession):
        self.session = session
```

---

## 7. Async-Patterns

### Async/Await (IMMER fuer I/O)

```python
# RICHTIG
async def fetch_data():
    result = await db.execute(query)
    return result.scalars().all()

# FALSCH (blocking)
def fetch_data():
    result = db.execute(query)  # Blocks event loop!
    return result.scalars().all()
```

### Eager Loading fuer ORM-Relationships (async SQLAlchemy)

```python
# RICHTIG — selectinload verhindert MissingGreenlet
from sqlalchemy.orm import selectinload

stmt = select(ESPDevice).options(
    selectinload(ESPDevice.sensors),
    selectinload(ESPDevice.actuators),
)
result = await db.execute(stmt)

# FALSCH — lazy load in async Context → MissingGreenlet
stmt = select(ESPDevice)
result = await db.execute(stmt)
devices = result.scalars().all()
for d in devices:
    len(d.sensors)  # MissingGreenlet!
```

### Concurrent Operations

```python
# Parallel ausfuehren wenn unabhaengig
results = await asyncio.gather(
    service.get_sensors(esp_id),
    service.get_actuators(esp_id),
    return_exceptions=True
)
```

### ThreadPool fuer Blocking Code

```python
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=10)

async def run_blocking():
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(executor, blocking_function)
```

---

## 8. Fehlerbehandlung

### Error-Codes (5000-5999)

| Range | Category |
|-------|----------|
| 5000-5099 | DATABASE |
| 5100-5199 | MQTT |
| 5200-5299 | VALIDATION |
| 5300-5399 | AUTH |
| 5400-5499 | BUSINESS_LOGIC |
| 5500-5599 | EXTERNAL_SERVICE |
| 5600-5699 | INTERNAL |

### Logging

```python
from ..core.logging_config import get_logger

logger = get_logger(__name__)

logger.info("Processing sensor data for ESP %s", esp_id)
logger.warning("Sensor timeout for GPIO %d", gpio)
logger.error("Failed to process: %s", error, exc_info=True)
```

### Exception-Handling

```python
try:
    result = await service.process(data)
except ValidationError as e:
    raise HTTPException(status_code=422, detail=str(e))
except DatabaseError as e:
    logger.error("Database error: %s", e, exc_info=True)
    raise HTTPException(status_code=500, detail="Database error")
```

---

## 9. Safety-Regeln

### Actuator-Commands

```python
# IMMER Safety-Check vor Actuator-Command
safety_result = await safety_service.validate_actuator_command(
    esp_id=esp_id,
    gpio=gpio,
    command=command
)
if not safety_result.allowed:
    raise HTTPException(status_code=403, detail=safety_result.reason)
```

### MQTT-Topics (TopicBuilder)

```python
from ..mqtt.topics import TopicBuilder

# RICHTIG
topic = TopicBuilder.build_actuator_command_topic(esp_id, gpio)

# FALSCH
topic = f"kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command"
```

---

## 10. Build-Verifikation

### Vor jedem Commit

```bash
cd "El Servador" && poetry run pytest god_kaiser_server/tests/ -v
```

### Linting

```bash
cd "El Servador/god_kaiser_server" && poetry run ruff check src/
```

### Type-Checking

```bash
cd "El Servador/god_kaiser_server" && poetry run mypy src/
```

---

## 11. Verbotene Aktionen

| Aktion | Grund |
|--------|-------|
| DB-Queries in API-Endpoints | Repository-Pattern verletzt |
| Sync I/O in async Functions | Blockiert Event Loop |
| Hardcoded MQTT-Topics | TopicBuilder verwenden |
| Actuator ohne Safety-Check | Safety-First |
| Fehlende Type Hints | Code-Qualitaet |
| Magic Numbers | Konstanten in config.py |
| ORM-Relationships ohne selectinload() in async Queries | MissingGreenlet-Error |
| `datetime.now()` ohne timezone | Naive/aware Mismatch → TypeError. Immer `datetime.now(timezone.utc)` |
| `datetime.utcnow()` | Deprecated seit Python 3.12. Immer `datetime.now(timezone.utc)` |
| `DateTime` ohne `timezone=True` in Models | DB liefert naive Timestamps → Mismatch. Immer `DateTime(timezone=True)` |
