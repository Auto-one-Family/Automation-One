# V5.5 Safety-Garantien — Verifikationsbericht

> **Datum:** 2026-03-03
> **Agent:** server-development
> **Geprueft:** audit_retention_service.py, maintenance/service.py, config.py

---

## Emergency-Stop Persistenz

- [x] **BESTANDEN**

### Code-Referenzen
- `audit_retention_service.py:55` — `preserve_emergency_stops: True` in `DEFAULT_RETENTION_CONFIG`
- `audit_retention_service.py:332-333` — In `cleanup()` wird bei `preserve_emergency_stops=True` die Bedingung `AuditLog.event_type != "emergency_stop"` an die DELETE-Query angehaengt. Emergency-Stops werden aus der Loeschung AUSGESCHLOSSEN.
- `audit_retention_service.py:431-432` — In `max_records` Overflow-Logik: `preserve_emergency_stops` wird ebenfalls geprueft. Emergency-Stops sind auch hier geschuetzt.

### Edge Cases geprueft
1. **`preserve_emergency_stops=False`:** Kann via `set_config()` (Zeile 206-207) auf `False` gesetzt werden. Dann werden Emergency-Stops NICHT mehr geschuetzt — es gibt **KEINE Warnung** im Log. Dies ist ein akzeptables Verhalten, da die explizite Deaktivierung eine bewusste Entscheidung ist. **Empfehlung:** Warning-Log bei `preserve_emergency_stops=False` hinzufuegen.
2. **Zugehoerige Audit-Logs:** Der Schutz greift NUR fuer `event_type == "emergency_stop"`. Andere Audit-Eintraege die einen Emergency-Stop *dokumentieren* (z.B. Actuator-Commands die durch einen Emergency-Stop ausgeloest wurden) sind NICHT automatisch geschuetzt. Diese werden nach ihrer eigenen Severity und Retention geloescht. **Risiko: GERING** — die Emergency-Stop-Events selbst bleiben erhalten.

---

## CRITICAL-Events Schutz

- [x] **BESTANDEN**

### Code-Referenzen
- `audit_retention_service.py:47-52` — `severity_days` definiert: `AuditSeverity.CRITICAL: 0` (0 = nie loeschen)
- `audit_retention_service.py:319-320` — In `cleanup()` Severity-Schleife: `if severity_retention == 0: continue` — CRITICAL-Events werden komplett uebersprungen. Keine DELETE-Query wird erzeugt.

### Cross-Service-Check
- **maintenance/service.py:** `SensorDataCleanup`, `CommandHistoryCleanup`, `OrphanedMocksCleanup` — Diese operieren auf `SensorData`, `ActuatorHistory` und ESP-Mock-Tabellen. **KEINE dieser Jobs beruehrt die `AuditLog`-Tabelle.** CRITICAL-Events in `AuditLog` sind daher NICHT durch Maintenance-Jobs gefaehrdet.
- **Notification-Tabelle:** CRITICAL-Notifications (in der `Notification`-Tabelle) werden **NICHT** durch die Audit-Retention geschuetzt. Die Audit-Retention operiert ausschliesslich auf `AuditLog`. Notifications haben KEIN eigenes Retention-System. **Risiko: KEINES fuer HW-Test** — Notifications werden nicht automatisch geloescht.
- **`max_records` Limit:** Bei aktivem `max_records > 0` werden die aeltesten Eintraege geloescht. **ABER:** Der Code (Zeile 431) prueft `preserve_emergency_stops` auch hier — Emergency-Stops bleiben verschont. CRITICAL-Events sind jedoch **NICHT** explizit geschuetzt beim max_records-Pruning! Sie werden nur indirekt geschuetzt, weil die severity-basierte Retention sie nie zum Loeschen markiert, aber bei max_records wird nach `created_at ASC` geloescht **ohne** Severity-Pruefung. **Potentielles Risiko:** Wenn `max_records` aktiv und die DB sehr alt, koennten theoretisch alte CRITICAL-Events geloescht werden. **Default:** `max_records: 0` (unlimited) — kein Risiko im Normalfall.

---

## Backup-vor-Cleanup Reihenfolge

- [x] **BESTANDEN** (mit Hinweis)

### Scheduler-Jobs (IST-Zustand)
```
maintenance/service.py:start():
  03:00 — cleanup_sensor_data     (cron, daily, wenn SENSOR_DATA_RETENTION_ENABLED)
  03:30 — cleanup_command_history  (cron, daily, wenn COMMAND_HISTORY_RETENTION_ENABLED)
  hourly — cleanup_orphaned_mocks (interval 3600s, wenn ORPHANED_MOCK_CLEANUP_ENABLED)

KEIN database_backup Job vorhanden (V5.1 noch nicht implementiert)
```

### Analyse
- Die Cleanup-Jobs haben KEINE Abhaengigkeit untereinander — sie laufen unabhaengig (APScheduler Default).
- **V5.1-Empfehlung:** Database-Backup-Job muss um 02:00 registriert werden, VOR den Cleanup-Jobs um 03:00/03:30.
- **Parallelitaets-Risiko:** APScheduler kann verschiedene Jobs parallel ausfuehren (jeder Job hat `max_instances=1`, aber verschiedene Jobs koennen gleichzeitig laufen). Wenn das Backup laenger als 60 Minuten dauert, startet der Cleanup trotzdem um 03:00. **Empfehlung bei V5.1-Implementierung:** Sequenzielle Kette (Backup-Completion triggert Cleanup) statt unabhaengige Cron-Jobs.
- **Audit-Retention (`audit_retention_service.py`):** Wird **NICHT** als Scheduler-Job registriert! Default: `enabled: False` (Zeile 45). Selbst wenn enabled, muss `cleanup()` explizit aufgerufen werden (kein automatischer Scheduler-Job in maintenance/service.py). **Kein Risiko durch Audit-Retention im Scheduler.**

---

## Dry-Run Default

- [x] **BESTANDEN**

### ENV-Variablen und Default-Werte (config.py `MaintenanceSettings`)

| ENV-Variable | Default | Wirkung |
|---|---|---|
| `SENSOR_DATA_RETENTION_ENABLED` | `False` | Job wird NICHT registriert |
| `SENSOR_DATA_CLEANUP_DRY_RUN` | `True` | Zaehlt nur, loescht nicht |
| `COMMAND_HISTORY_RETENTION_ENABLED` | `False` | Job wird NICHT registriert |
| `COMMAND_HISTORY_CLEANUP_DRY_RUN` | `True` | Zaehlt nur, loescht nicht |
| `ORPHANED_MOCK_CLEANUP_ENABLED` | `True` | Job wird registriert |
| `ORPHANED_MOCK_AUTO_DELETE` | `False` | WARN ONLY, keine Loeschung |
| `AUDIT_LOG_RETENTION_ENABLED` | `False` | Kein Scheduler-Job (manuell) |
| `AUDIT_LOG_CLEANUP_DRY_RUN` | `True` | Zaehlt nur, loescht nicht |
| `HEARTBEAT_LOG_RETENTION_ENABLED` | `True` | Job wird registriert (BUT dry_run=True) |
| `HEARTBEAT_LOG_CLEANUP_DRY_RUN` | `True` | Zaehlt nur, loescht nicht |

### Dreistufige Sicherheit
1. **`*_ENABLED=False`** — Job wird gar nicht im Scheduler registriert (maintenance/service.py:80)
2. **`*_DRY_RUN=True`** — Selbst wenn enabled, wird nur gezaehlt (kein DELETE)
3. **`audit_retention_service.cleanup(force=False)`** — Zusaetzlicher Guard: Cleanup wird nur bei explizitem Aufruf ausgefuehrt

### Startup-Logging
- `maintenance/service.py:176-205` — `_log_cleanup_status()` loggt beim Start den exakten Status aller Cleanup-Jobs. Admin sieht sofort ob Loeschungen aktiv sind.

---

## Gesamt-Bewertung

- **SICHER FUER HARDWARE-TEST: JA**
- **SOFORT-FIX erforderlich: NEIN**

### Offene Punkte (nicht-blockierend)
1. **max_records Pruning schuetzt CRITICAL nicht explizit** — Risiko nur bei `max_records > 0` (Default: 0). Empfehlung: In `cleanup()` Zeile 430 zusaetzlich `AuditLog.severity != AuditSeverity.CRITICAL` als Bedingung hinzufuegen.
2. **Kein Warning-Log bei `preserve_emergency_stops=False`** — Empfehlung: Warning-Log in `set_config()` wenn Flag deaktiviert wird.
3. **V5.1 Backup-Job fehlt noch** — Muss VOR Cleanup-Jobs um 02:00 registriert werden.
