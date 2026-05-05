# SPECIALIST-PROMPTS — impl-plan-esp32-logging-nvs-trace-2026-04-11

## esp32-dev — PKG-ESP-LOG-NVS-TRACE (PKG-01)

### Scope

Implementiere additive `LOG_*`-Zeilen gemäß  
`.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-ESP-LOG-NVS-TRACE-2026-04-11.md` (Matrix L01–L14) in:

- `El Trabajante/src/main.cpp`
- `El Trabajante/src/tasks/config_update_queue.cpp`
- `El Trabajante/src/services/config/storage_manager.cpp`
- `El Trabajante/src/services/config/config_manager.cpp`

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Vor Code: per `Grep`/`Glob` die **closest existing implementation** im gleichen Layer nennen und **dort** anbinden (keine duplizierte Parallel-Logik).
- In `config_update_queue.cpp` den bestehenden TAG **`SYNC`** (`CFG_Q_TAG`) für neue Meldungen verwenden.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Nicht anwendbar (reine Firmware-Serial-Logs). Keine Vermischung mit Server-Notification-Ketten.

### Verify-Befehl (Pflicht)

- Nach Abschluss:  
  `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"; pio run -e esp32_dev`  
  Exit-Code 0.

### Fehler-Register (Pflicht bei Code)

- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl erneut; Einträge in  
  `.claude/reports/current/auto-debugger-runs/impl-plan-esp32-logging-nvs-trace-2026-04-11/FEHLER-REGISTER.md`.

---

*Ende SPECIALIST-PROMPTS*
