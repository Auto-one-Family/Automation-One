# Server Dev Report: Debug & Fix Cross-Layer Error Consistency

## Modus: B (Implementierung)

## Auftrag
Systematisches Debugging und Fixing der Cross-Layer Error Consistency Aenderungen im God-Kaiser Server. Alle 10 geaenderten Dateien analysiert und konkrete Bugs identifiziert und behoben.

## Codebase-Analyse

**Analysierte Dateien (alle vollstaendig gelesen):**
- `src/core/error_codes.py` — alle IntEnum-Klassen und Werte
- `src/core/exceptions.py` — alle 35 Exception-Klassen inkl. MRO
- `src/core/exception_handlers.py` — Handler-Logik und Imports
- `src/core/request_context.py` — get_request_id() Existenz verifiziert
- `src/api/v1/sensors.py` — Import-Block und raise-Aufrufe
- `src/api/v1/actuators.py` — Import-Block und raise-Aufrufe
- `src/api/v1/esp.py` — Import-Block (HTTPException entfernt?)
- `src/api/v1/logic.py` — neue Exception-Importe
- `src/api/v1/subzone.py` — neue Exception-Importe
- `tests/unit/test_sensor_type_registry.py` — exc_info.value.message Nutzung

## Qualitaetspruefung (8-Dimensionen-Checkliste)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | request_context.py existiert, get_request_id() exportiert. audit_log_repo.log_api_error() Signatur passt. __init__.py leer (direkte Imports korrekt) |
| 2 | Namenskonvention | Alle Exception-Klassen PascalCase, alle numeric_codes Konstanten |
| 3 | Rueckwaertskompatibilitaet | API-Response-Format unveraendert. Frontend parseApiError.ts kompatibel (success, error.code, error.numeric_code, error.message, error.details, error.request_id) |
| 4 | Wiederverwendbarkeit | GodKaiserException.__init__ direkt aufgerufen statt super()-Kette die numeric_code ueberschreibt |
| 5 | Speicher & Ressourcen | Keine neuen Ressourcen, reine Exception-Hierarchie |
| 6 | Fehlertoleranz | Alle Fixes behalten bestehende Fehlerbehandlung. AuditLog fire-and-forget bleibt erhalten |
| 7 | Seiteneffekte | Keine Breaking Changes. ESP32NotFoundException jetzt ohne NotFoundError.__init__ Aufruf |
| 8 | Industrielles Niveau | 818 Tests bestanden nach allen Fixes |

## Gefundene und behobene Bugs

### Bug 1: Doppel-Init ueberschreibt numeric_code (KRITISCH)

**Problem:** Alle Klassen mit Mehrfach-Vererbung von `(XException, NotFoundError)` riefen am Ende `NotFoundError.__init__(self, ...)` explizit auf. `NotFoundError.__init__` ruft `GodKaiserException.__init__(..., numeric_code=None)` — das ueberschreibt das bereits gesetzte `self.numeric_code`.

**Betroffen:**
- `ESP32NotFoundException` (numeric_code=5001 wurde auf None zurueckgesetzt)
- `SensorNotFoundException` (kein numeric_code → bleibt None)
- `ActuatorNotFoundException` (kein numeric_code → bleibt None)
- `RuleNotFoundException` (numeric_code=5700 wurde auf None zurueckgesetzt)
- `SubzoneNotFoundException` (numeric_code=5780 wurde auf None zurueckgesetzt)

**Fix:** Alle diese Klassen rufen jetzt direkt `GodKaiserException.__init__(self, ...)` auf. Kein `super()` mehr, kein zweiter `NotFoundError.__init__()` Aufruf. Details-Dict wurde erweitert um `resource_type` und `identifier` zu erhalten (war vorher in NotFoundError).

**Gleiches Muster fuer Aliases:**
- `ESPNotFoundError` — neu: direkt GodKaiserException.__init__ mit numeric_code=5001
- `SensorNotFoundError` — neu: direkt GodKaiserException.__init__
- `ActuatorNotFoundError` — neu: direkt GodKaiserException.__init__

### Bug 2: DeviceNotApprovedError mit falschem numeric_code

**Problem:** `numeric_code=5403` = `ServiceErrorCode.OPERATION_TIMEOUT` = "Service operation timed out" — semantisch voellig falsch fuer "Device not approved".

**Fix:** `numeric_code=5405` = `ServiceErrorCode.PERMISSION_DENIED` = "Permission denied" — semantisch korrekt.

### Bug 3: GpioConflictError mit falschem numeric_code

**Problem:** `numeric_code=5209` = `ValidationErrorCode.INVALID_PAYLOAD_FORMAT` = "Invalid payload format" — GPIO-Konflikt hat nichts mit Payload-Format zu tun.

**Fix:** `numeric_code=5208` = `ValidationErrorCode.DUPLICATE_ENTRY` = "Duplicate entry (already exists)" — GPIO-Konflikt bedeutet "diese GPIO-Pin ist bereits belegt", was semantisch einem Duplicate-Eintrag entspricht.

### Bug 4: GatewayTimeoutError mit undefiniertem numeric_code

**Problem:** `numeric_code=5504` ist in KEINEM Server-IntEnum definiert. Die Zahl liegt im AuditErrorCode-Bereich (5500-5599), wo nur 5501-5503 belegt sind. 5504 = nicht definiert.

**Fix:** `numeric_code=5403` = `ServiceErrorCode.OPERATION_TIMEOUT` = "Service operation timed out" — semantisch korrekt fuer Gateway Timeout.

### Bug 5: Toter HTTPException-Import in sensors.py

**Problem:** `from fastapi import APIRouter, Depends, HTTPException, Query, status` — `HTTPException` wird nur in Docstrings erwaehnt, nie raised.

**Fix:** Import entfernt: `from fastapi import APIRouter, Depends, Query, status`

### Bug 6: Toter HTTPException-Import in actuators.py

**Problem:** Identisch zu sensors.py.

**Fix:** Import entfernt: `from fastapi import APIRouter, Depends, Query, status`

## Geprueft ohne Aenderungsbedarf

- **esp.py**: `HTTPException` nicht importiert und nicht raised — korrekt
- **logic.py**: `RuleNotFoundException`, `RuleValidationException` korrekt importiert und verwendet
- **subzone.py**: `ESPNotFoundError`, `SubzoneNotFoundException`, `ValidationException` korrekt
- **exception_handlers.py**: `from .request_context import get_request_id` korrekt (Datei existiert)
- **Request-Context**: `get_request_id()` in request_context.py vorhanden und exportiert
- **AuditLog**: `log_api_error(error_code, numeric_code, severity, message, source_id, method, details)` Signatur passt
- **get_session_maker**: in `db/session.py` vorhanden
- **Tests**: `exc_info.value.message` korrekt — `GodKaiserException` hat `self.message` Attribut
- **error_codes.py get_error_code_range()**: Alle neuen Ranges abgedeckt (5700-5749 SERVER_LOGIC, 5750-5779 SERVER_DASHBOARD, 5780-5799 SERVER_SUBZONE, 5800-5849 SERVER_AUTOOPS)
- **DuplicateESPError**: Erbt korrekt von DuplicateError mit numeric_code=5208 — kein Bug
- **ConfigurationException**: numeric_code=5002 = ConfigErrorCode.CONFIG_BUILD_FAILED — passt semantisch

## Geaenderte Dateien

| Datei | Aenderungen |
|-------|------------|
| `src/core/exceptions.py` | Bug 1-4: 8 Klassen gefixt (Doppel-Init, 3x numeric_code) |
| `src/api/v1/sensors.py` | Bug 5: HTTPException-Import entfernt |
| `src/api/v1/actuators.py` | Bug 6: HTTPException-Import entfernt |

## Verifikation

```
pytest god_kaiser_server/tests/unit/ (818 Tests):
818 passed, 3 skipped (platform-bedingt: Windows/Unix), 6 warnings (pre-existing)
0 failures, 0 errors
```

## Empfehlung

- `ERROR_CODES.md` aktualisieren: numeric_code 5504 entfernen (war undefiniert), stattdessen Mapping dokumentieren:
  - DeviceNotApprovedError → 5405 (PERMISSION_DENIED)
  - GpioConflictError → 5208 (DUPLICATE_ENTRY)
  - GatewayTimeoutError → 5403 (OPERATION_TIMEOUT)
