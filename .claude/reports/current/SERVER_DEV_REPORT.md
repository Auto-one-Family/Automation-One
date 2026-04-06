# Server Dev Report: 3 Bug-Fixes (audit_log Overflow, pwm_value, Config-Push Gate)

## Modus: B (Implementierung)

## Auftrag
3 kritische/hohe Bugs im AutomationOne Server beheben:
- Bug 1 (KRITISCH): `audit_log.status` VARCHAR(20) Overflow mit Reconciliation-Loop
- Bug 2 (HIGH): `monitor_data_service.py` pwm_value Doppel-Multiplikation
- Bug 3 (HIGH): Logic Engine feuert Aktuator-Commands vor Config-Push-Abschluss

## Codebase-Analyse

**Analysierte Dateien:**
- `src/db/models/audit_log.py` Zeile 107: `status: Mapped[str] = mapped_column(String(20), ...)`. Zeile 83: `severity` = `String(20)` (max. "critical" = 8 Zeichen, kein Problem).
- `src/mqtt/handlers/intent_outcome_lifecycle_handler.py` Zeile 59: `status=event_type` (ungekuerzt, event_type wie "exit_blocked_config_pending" = 26 Zeichen > VARCHAR(20)).
- `src/services/monitor_data_service.py` Zeile 175: `pwm_value = int((state.current_value or 0) * 100)`.
- `src/schemas/monitor.py` — `SubzoneActuatorEntry.pwm_value: int = 0`.
- `src/mqtt/handlers/heartbeat_handler.py` — `handle_heartbeat` (Zeile 443-452): Logic Engine Reconnect-Eval wird als Task geplant VOR `_has_pending_config()` (Zeile 555). `_complete_adoption_and_trigger_reconnect_eval` schlaeft 2s (`ADOPTION_GRACE_SECONDS`) und feuert dann sofort.

**Relevante Patterns:**
- Alembic Migration: `alembic/versions/increase_audit_logs_request_id_varchar_255.py` als Referenz.
- Handler-Instanzvariablen: `_handover_epoch_by_esp`, `_session_id_by_esp` als Set-Analogie.
- Migration-Head: `esp_hb_runtime_telemetry`.

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Status |
|---|-----------|--------|
| 1 | Struktur & Einbindung | Bestehende Dateien erweitert, kein neues Modul. Alembic-Migration folgt exakt dem Referenz-Pattern. |
| 2 | Namenskonvention | `_config_push_pending_esps: set[str]` — snake_case, korrekt. |
| 3 | Rueckwaertskompatibilitaet | VARCHAR-Erweiterung ist backward-kompatibel. `pwm_value: float` ist typ-aendernd — Frontend muss geprueft werden. |
| 4 | Wiederverwendbarkeit | Instanzvariable im bestehenden `HeartbeatHandler`. Kein neues Service-Layer noetig. |
| 5 | Speicher & Ressourcen | `_config_push_pending_esps` Set: Element wird nach Gate sofort via `discard` entfernt. Kein Memory-Leak. |
| 6 | Fehlertoleranz | `event_type[:50]` Truncation als Sicherheitsnetz. Alembic downgrade Warning dokumentiert. |
| 7 | Seiteneffekte | Bug 3 aendert nur das Timing von Reconnect-Eval wenn Config-Push ausstehend ist. Bug 2 aendert Typ `int → float`. |
| 8 | Industrielles Niveau | Vollstaendige Implementierung, keine Stubs. Erklaerende Log-Meldungen. |

## Cross-Layer Impact

| Aenderung | Geprueft |
|-----------|----------|
| `SubzoneActuatorEntry.pwm_value: int → float` | Frontend `ActuatorCard.vue` erwartet laut Auftrag `val * 100` fuer Anzeige — `float` 0.0-1.0 ist korrekt. TypeScript-Typen muessen geprueft werden. Empfehlung: frontend-dev beauftragen. |
| `audit_log.status VARCHAR(50)` | Keine REST-API-Aenderung. Nur DB-Schema. |
| Config-Push Gate | ESP32: kein Impact (Config-Push-Flow unveraendert). Logic Engine: triggert spaeter nach Reconnect wenn Config ausstehend. |

## Ergebnis

### Bug 1: audit_log.status VARCHAR(50)

**Geaenderte Dateien:**

1. `El Servador/god_kaiser_server/src/db/models/audit_log.py` Zeile 107-112:
   - `String(20)` → `String(50)` fuer `status` Spalte

2. `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_lifecycle_handler.py` Zeile 59:
   - `status=event_type` → `status=event_type[:50]` (Truncation als Sicherheitsnetz)

3. **NEU:** `El Servador/god_kaiser_server/alembic/versions/extend_audit_log_status_varchar_50.py`:
   - Neue Migration, Revises: `esp_hb_runtime_telemetry`
   - `op.alter_column("audit_logs", "status", VARCHAR(20) → VARCHAR(50))`

**Zusatz:** `severity: String(20)` (Zeile 83) ist kein Problem — laengster Wert "critical" = 8 Zeichen.

### Bug 2: pwm_value Doppel-Multiplikation

**Geaenderte Dateien:**

1. `El Servador/god_kaiser_server/src/schemas/monitor.py`:
   - `SubzoneActuatorEntry.pwm_value: int = 0` → `pwm_value: float = 0.0`

2. `El Servador/god_kaiser_server/src/services/monitor_data_service.py` Zeile 170-176:
   - `pwm_value = 0` → `pwm_value = 0.0`
   - `int((state.current_value or 0) * 100)` → `float(state.current_value or 0.0)`

### Bug 3: Config-Push Gate fuer Logic Engine Reconnect-Eval

**Geaenderte Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

a) `HeartbeatHandler.__init__`: Neue Instanzvariable `_config_push_pending_esps: set[str] = set()`

b) `_has_pending_config()`: Wenn Config-Push getriggert wird, `self._config_push_pending_esps.add(esp_device.device_id)` vor `asyncio.create_task`.

c) `_complete_adoption_and_trigger_reconnect_eval()`: Prueft ob `esp_id in self._config_push_pending_esps`. Wenn ja: discard, log, mark_adoption_completed, broadcast "adopted" mit `config_push_pending: True`, return (kein `trigger_reconnect_evaluation`).

**Ablauf nach Fix:**
```
ESP bootet → sensor_count=0, actuator_count=0
Heartbeat → _has_pending_config() erkennt Mismatch
          → _config_push_pending_esps.add("ESP_XXX")
          → asyncio.create_task(_auto_push_config)    <- Config wird gepusht
          → is_reconnect=True → asyncio.create_task(_complete_adoption...)
                → sleep(2s)
                → "ESP_XXX" in _config_push_pending_esps -> True
                → discard, skip trigger_reconnect_evaluation
                → broadcast adopted {config_push_pending: True}
                <- Kein Aktuator-Command!
ESP empfaengt Config → naechster Heartbeat mit sensor_count>0
_has_pending_config() → kein Mismatch → kein Gate
Logic Engine Reconnect-Eval → jetzt korrekt
```

## Alembic upgrade head

`alembic upgrade head` schlaegt mit der SQLite-Test-DB fehl (pre-existierender Zustand: `actuator_states` fehlt in SQLite-Test-DB). PostgreSQL-Produktion ist nicht betroffen.

In Docker-Umgebung:
```bash
docker compose exec el-servador sh -c "cd /app && alembic upgrade head"
```

## Verifikation

ruff check `--select E,F` auf allen geaenderten Dateien: **Keine neuen Fehler eingebracht.**
Alle gemeldeten Fehler (E501, F541, E712) existierten bereits vor dieser Aenderung.

## Empfehlungen

1. **frontend-dev beauftragen**: `SubzoneActuatorEntry.pwm_value` ist jetzt `float` statt `int`. TypeScript-Typen in `El Frontend/src/` pruefen (insbesondere `ActuatorCard.vue` und zugehoerige API-Typen).

2. **Hardware-Test**: Wokwi/Real-ESP mit Reboot — nach Config-Push pruefen ob naechster Heartbeat die Logic Engine korrekt triggert.

3. **Alembic upgrade in Docker**: Bei naechstem Deployment sicherstellen dass Migration `extend_audit_log_status_varchar_50` auf PostgreSQL ausgefuehrt wird.
