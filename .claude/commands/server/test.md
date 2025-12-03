---
description: Führe El Servador Python Tests aus
---

# El Servador Test Suite

> **Kurze Anleitung** - Für vollständige Dokumentation siehe `/full-test` oder `.claude/CLAUDE_SERVER.md` Section 7

## Schnellstart

```bash
cd "El Servador/god_kaiser_server"
python -m pytest tests/ --no-cov -q
```

## Test-Typen

| Typ | Location | Tests | Beschreibung |
|-----|----------|-------|--------------|
| **Unit Tests** | `tests/unit/` | ~20 | Isolierte Komponenten-Tests |
| **Integration Tests** | `tests/integration/` | **34** | Handler-Tests mit ESP32-Payloads |
| **E2E Tests** | `tests/e2e/` | ~5 | End-to-End (benötigt Server) |
| **ESP32 Tests** | `tests/esp32/` | ~100 | Server-orchestrierte ESP32-Tests |

## Integration Tests (NEU 2025-12-03)

```bash
# Alle 34 Handler-Integration-Tests
python -m pytest tests/integration/test_server_esp32_integration.py -v --no-cov
```

**Was sie testen:** SensorHandler, ActuatorHandler, HeartbeatHandler, Pi-Enhanced Flow

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
