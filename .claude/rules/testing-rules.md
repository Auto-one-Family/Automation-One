---
paths:
  - "**/tests/**"
  - "**/test_*"
  - "**/*.spec.ts"
  - "**/*.test.ts"
---

# Testing Rules

## Test-Konventionen
- Python: pytest mit fixtures aus conftest.py, async Tests mit pytest-asyncio
- Frontend: Vitest fuer Unit-Tests, Playwright fuer E2E
- ESP32: PlatformIO native test framework
- Keine Mocks fuer interne Module — nur fuer externe Services (DB, MQTT Broker, HTTP)

## Test-Benennung
- Python: `test_<was>_<szenario>` (z.B. `test_sensor_data_validates_range`)
- TypeScript: `describe('<Modul>')` + `it('should <verhalten>')`
- Dateien: `test_<modul>.py` (Python), `<Modul>.test.ts` / `<Modul>.spec.ts` (TS)

## Assertions
- Exakte Werte pruefen, keine `assert result` ohne Vergleich
- Fehlerfaelle IMMER testen (nicht nur Happy Path)
- Async-Tests muessen Timeouts haben
