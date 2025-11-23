---
description: Führe El Servador Python Tests aus
---

# El Servador Test Suite

Führe die komplette Test-Suite für den God-Kaiser Server aus.

## Aufgabe

1. **Environment prüfen:**
   ```bash
   cd "El Servador"
   poetry --version
   poetry check
   ```

2. **Tests ausführen:**
   ```bash
   poetry run pytest -v --tb=short
   ```

3. **Test-Coverage generieren:**
   ```bash
   poetry run pytest --cov=god_kaiser_server --cov-report=term-missing --cov-report=html
   ```

4. **Ergebnisse analysieren:**
   - Anzahl Tests (passed/failed/skipped)
   - Test-Coverage Prozentsatz
   - Fehlende Coverage (uncovered lines)
   - Fehler-Details bei Failures

5. **Code-Quality-Checks (optional):**
   ```bash
   poetry run black --check god_kaiser_server/
   poetry run ruff check god_kaiser_server/
   ```

## Test-Typen

- **Unit Tests:** `tests/unit/` - Isolierte Komponenten-Tests
- **Integration Tests:** `tests/integration/` - Service-Integration
- **E2E Tests:** `tests/e2e/` - End-to-End (benötigt laufenden Server)

## Bei Fehlern

- Zeige vollständigen Fehler-Traceback
- Analysiere Root-Cause
- Schlage Fixes vor
- Prüfe ob Dependencies aktuell sind
- Prüfe ob Database-Migrations fehlen

## Coverage-Ziele

- **Minimum:** 70% Coverage
- **Target:** 85% Coverage
- **Critical Modules:** 90%+ (core, services, mqtt)

## Optionale Parameter

- `--maxfail=1`: Stoppe nach erstem Fehler
- `-k <pattern>`: Führe nur Tests aus, die Pattern matchen
- `-x`: Stoppe bei erstem Fehler
- `--lf`: Führe nur zuletzt fehlgeschlagene Tests aus
