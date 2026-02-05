# Docker-Fix-Report: asyncpg Dependency

**Datum:** 2026-02-05
**Problem:** `ModuleNotFoundError: No module named 'asyncpg'`

---

## Analyse

### Ursache

Der Server verwendet SQLAlchemy mit async Engine:

```python
# src/db/session.py:14
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine

# src/core/config.py:17
default="postgresql+asyncpg://god_kaiser:password@localhost:5432/god_kaiser_db"
```

Der `postgresql+asyncpg://` Dialect erfordert das `asyncpg` Modul zur Laufzeit.

### Befund in pyproject.toml (VOR Fix)

```toml
# Database
sqlalchemy = "^2.0.25"
alembic = "^1.13.1"
psycopg2-binary = "^2.9.9"  # PostgreSQL sync driver
# <-- asyncpg FEHLTE hier
```

### Dockerfile-Verhalten

```dockerfile
# Zeile 32-33
poetry install --no-interaction --no-ansi --only main
```

Korrekt: installiert nur `[tool.poetry.dependencies]`. Das Problem war, dass `asyncpg` dort nicht gelistet war.

---

## Fix

### Geänderte Datei

`El Servador/god_kaiser_server/pyproject.toml`

### Änderung

```diff
 # Database
 sqlalchemy = "^2.0.25"
 alembic = "^1.13.1"
 psycopg2-binary = "^2.9.9"  # PostgreSQL sync driver
+asyncpg = "^0.29.0"  # PostgreSQL async driver for create_async_engine
```

---

## Weitere async-DB-Dependencies

| Modul | Status | Begründung |
|-------|--------|------------|
| `asyncpg` | **HINZUGEFÜGT** | Erforderlich für `postgresql+asyncpg://` |
| `aiomqtt` | ✅ Vorhanden | Zeile 27 in pyproject.toml |
| `aiosqlite` | ✅ dev-only | Nur für Tests, korrekt in `dev.dependencies` |
| `redis.asyncio` | ✅ Optional | Code hat try/except ImportError (src/api/deps.py:383-385) |

---

## Nächster Schritt

```bash
docker compose up -d --build
```

Der Build sollte jetzt `asyncpg` installieren und der Server korrekt starten.

---

**Report abgeschlossen:** 2026-02-05
