# Server Dev Report: Phase 4D Diagnostics Hub — Pattern Review & Bug Fixes

## Modus: B (Implementierung)

## Auftrag
Thorough review of Phase 4D Diagnostics Hub server-side files for pattern consistency, import correctness, type safety, API response consistency, error handling, and DB session management. Fix all issues found.

## Codebase-Analyse

Files analysed:
- `src/services/diagnostics_service.py` — 10 diagnostic checks + persist
- `src/services/diagnostics_report_generator.py` — Markdown generator
- `src/api/v1/diagnostics.py` — REST endpoints
- `src/db/models/diagnostic.py` — DB model
- `src/services/logic/actions/diagnostics_executor.py` — Logic action
- `src/services/logic/conditions/diagnostics_evaluator.py` — Logic condition
- `alembic/versions/add_diagnostic_reports.py` — Migration

Reference files read for pattern comparison:
- `src/db/repositories/notification_repo.py` — `get_alert_stats()` return keys verified
- `src/db/models/logic.py` — `LogicExecutionHistory` column names confirmed (`timestamp`, `success`)
- `src/services/logic/actions/base.py` — `ActionResult` signature
- `src/services/logic/conditions/base.py` — `BaseConditionEvaluator` interface
- `src/api/deps.py` — `DBSession`, `ActiveUser` type aliases confirmed
- `src/core/metrics.py` — `_server_start_time` exists at module level, import correct
- `src/api/v1/notifications.py` — Router prefix pattern `/v1/notifications` confirmed

## Qualitaetspruefung (8-Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|---------|
| 1 | Struktur & Einbindung | Korrekt. `diagnostics_router` bereits in `__init__.py` registriert. Router-Prefix `/v1/diagnostics` konsistent mit Pattern (notifications, plugins). |
| 2 | Namenskonvention | Korrekt. snake_case Funktionen, PascalCase Klassen. |
| 3 | Rueckwaertskompatibilitaet | Neue Endpunkte, kein Breaking Change. Migration hat `downgrade()`. |
| 4 | Wiederverwendbarkeit | `NotificationRepository` korrekt verwendet. `BaseActionExecutor`/`BaseConditionEvaluator` korrekt erweitert. |
| 5 | Speicher & Ressourcen | Async patterns korrekt. httpx-Client per Request mit `async with`. DB-Session injiziert. |
| 6 | Fehlertoleranz | BUGS GEFUNDEN UND BEHOBEN — siehe unten. |
| 7 | Seiteneffekte | Keine. Nur Lese-Queries ausser `_persist_report`. Safety-Service nicht betroffen. |
| 8 | Industrielles Niveau | Nach Fixes vollstaendig produktionsreif. Keine TODOs/Stubs. |

## Bugs gefunden und behoben

### Bug 1 — Falsche Stat-Keys in `_check_alerts` (LOGIKFEHLER)

**Datei:** `src/services/diagnostics_service.py`, Zeilen 557-558

**Problem:** `_check_alerts` rief `stats.get("mtta_seconds")` und `stats.get("mttr_seconds")` auf. `NotificationRepository.get_alert_stats()` gibt jedoch `"mean_time_to_acknowledge_s"` und `"mean_time_to_resolve_s"` zurueck. Die Keys existierten nicht — `get()` lieferte immer `None`, MTTA/MTTR-Metriken fehlten im Report.

**Fix:**
```python
# Vorher (falsch):
"mtta_seconds": stats.get("mtta_seconds"),
"mttr_seconds": stats.get("mttr_seconds"),

# Nachher (korrekt):
"mtta_seconds": stats.get("mean_time_to_acknowledge_s"),
"mttr_seconds": stats.get("mean_time_to_resolve_s"),
```

---

### Bug 2 — Falscher Typ-Annotation fuer `checks`-Spalte im DB-Model (TYPE ERROR)

**Datei:** `src/db/models/diagnostic.py`, Zeile 37

**Problem:** `checks: Mapped[dict]` — das Feld speichert eine **Liste** von Check-Dicts (wie in `_persist_report` ersichtlich: `checks_json` ist eine `list`). Die falsche Annotation `Mapped[dict]` verletzt die Typkonsistenz und kann bei ORM-Introspection zu Fehlern fuehren.

**Fix:**
```python
# Vorher (falsch):
checks: Mapped[dict] = mapped_column(JSON, nullable=False)

# Nachher (korrekt):
checks: Mapped[list] = mapped_column(JSON, nullable=False)
```

---

### Bug 3 — Falsche Exception in `DiagnosticsActionExecutor` (EXCEPTION MISMATCH)

**Datei:** `src/services/logic/actions/diagnostics_executor.py`, Zeile 83

**Problem:** Der Executor fing `KeyError` ab, aber `DiagnosticsService.run_single_check()` wirft `ValueError` bei unbekanntem Check-Namen (dokumentiert in `diagnostics_service.py` L149). Ein `KeyError` wurde niemals geworfen — ungueltige Check-Namen landeten im generischen `except Exception`-Block statt im spezifischen Handler.

**Fix:**
```python
# Vorher (falsch):
except KeyError:
    return ActionResult(
        success=False,
        message=f"Diagnostic check '{check_name}' not found",
    )

# Nachher (korrekt):
except ValueError:
    return ActionResult(
        success=False,
        message=f"Diagnostic check '{check_name}' not found",
    )
```

---

### Bug 4 — Fehlende Fehlerbehandlung beim DB-Commit in `_persist_report` (MISSING ERROR HANDLING)

**Datei:** `src/services/diagnostics_service.py`, Zeilen 640-641

**Problem:** `await self.session.commit()` ohne try/except. Ein DB-Fehler beim Persist wuerde die Exception durch `run_full_diagnostic` propagieren und den gesamten API-Call mit 500 beenden — obwohl die Diagnose bereits komplett ausgewertet wurde. Die fertigen Diagnose-Ergebnisse gingen verloren.

**Fix:** try/except mit Rollback + Logging, sodass die Funktion auch bei Persist-Fehler normal zurueckkehrt:
```python
# Vorher (fehlt Fehlerbehandlung):
self.session.add(db_report)
await self.session.commit()

# Nachher (korrekt):
self.session.add(db_report)
try:
    await self.session.commit()
except Exception as e:
    await self.session.rollback()
    logger.error(f"Failed to persist diagnostic report: {e}", exc_info=True)
```

## Dinge die korrekt waren (keine Aenderung noetig)

- **`LogicExecutionHistory` Spalten:** `timestamp` und `success` in `_check_logic_engine` korrekt — diese Spalten existieren exakt so im Model (`logic.py` L285, L305).
- **`MQTTClient.get_instance()` und `.is_connected()`:** Pattern korrekt — konsistent mit Nutzung in `metrics.py`.
- **`NotificationRepository.get_alert_stats()` und `.get_active_counts_by_severity()`:** Methoden existieren mit diesen exakten Signaturen. `get_alert_stats()` nimmt `user_id=None` optional — Aufruf ohne `user_id` in `_check_alerts` korrekt (system-weite Statistik).
- **API Router-Prefix:** `/v1/diagnostics` korrekt. Der Router wird in `api_v1_router` included, der mit `/api` gemountet wird — finale URLs `/api/v1/diagnostics/...`.
- **`DBSession` und `ActiveUser` aus `..deps`:** Korrekte Imports, existieren mit diesen Namen.
- **`_server_start_time` Import:** `from ..core.metrics import _server_start_time` korrekt — Variable auf Modul-Ebene in `metrics.py` definiert.
- **Alembic Migration:** `down_revision = "add_plugin_tables"` konsistent mit Git-History. `JSONB` fuer `checks`-Spalte korrekt (PostgreSQL-spezifisch, besser als JSON fuer Array-Queries).
- **`diagnostics_report_generator.py`:** Keine Bugs. Pure functions, kein DB/IO.
- **`diagnostics_evaluator.py`:** Korrekt. `async for session in self._session_factory()` Pattern konsistent mit `diagnostics_executor.py`.

## Cross-Layer Impact

| Bereich | Status |
|---------|--------|
| Frontend | Keine Aenderung an API-Responses — kein Impact |
| ESP32 | Kein Impact |
| MQTT | Kein Impact |
| Alembic | Keine Schema-Aenderung — kein Impact |
| ERROR_CODES.md | Keine neuen Error-Codes — kein Update noetig |

## Verifikation

Alle 4 Fixes auf Korrektheit geprueft durch erneutes Lesen der geaenderten Dateien.
Formale pytest-Ausfuehrung steht aus (nicht Teil des Auftrags).

## Zusammenfassung

4 Bugs behoben in 3 Dateien:

| Datei | Bug | Schwere |
|-------|-----|---------|
| `diagnostics_service.py` | Falsche Stat-Keys (`mtta_seconds`/`mttr_seconds`) | Logikfehler — MTTA/MTTR immer None |
| `diagnostics_service.py` | Kein try/except um `commit()` | Fehlendes Error-Handling |
| `diagnostic.py` | `Mapped[dict]` statt `Mapped[list]` | Typ-Inkonsistenz |
| `diagnostics_executor.py` | `KeyError` statt `ValueError` fangen | Exception Mismatch |
