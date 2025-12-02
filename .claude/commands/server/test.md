---
description: Führe El Servador Python Tests aus
---

# El Servador Test Suite

> **Kurze Anleitung** - Für vollständige Dokumentation siehe `/full-test` oder `.claude/CLAUDE_SERVER.md` Section 7

## Schnellstart

```bash
cd "El Servador"
poetry install
poetry run pytest -v --tb=short
```

## Test-Typen

| Typ | Location | Beschreibung |
|-----|----------|--------------|
| **Unit Tests** | `tests/unit/` | Isolierte Komponenten-Tests |
| **Integration Tests** | `tests/integration/` | Service-Integration |
| **E2E Tests** | `tests/e2e/` | End-to-End (benötigt Server) |
| **ESP32 Tests** | `tests/esp32/` | Server-orchestrierte ESP32-Tests |

## Mit Coverage

```bash
poetry run pytest --cov=god_kaiser_server --cov-report=term-missing --cov-report=html
```

**Coverage-Ziele:**
- Minimum: 70%
- Target: 85%
- Critical Modules: 90%+

## Code-Quality

```bash
poetry run black --check god_kaiser_server/
poetry run ruff check god_kaiser_server/
```

## Bei Fehlern

- Database-Errors: Prüfe Alembic-Migrations
- Import-Errors: Prüfe PYTHONPATH
- Coverage-Lücken: Fehlende Tests schreiben

---

## Related Documentation

- **Vollständige Doku:** `/full-test` oder `.claude/CLAUDE_SERVER.md` Section 7
- **ESP32 Tests:** `El Servador/docs/ESP32_TESTING.md`
