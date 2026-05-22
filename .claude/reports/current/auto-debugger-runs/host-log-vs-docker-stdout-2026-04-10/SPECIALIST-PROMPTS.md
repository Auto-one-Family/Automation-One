# SPECIALIST-PROMPTS — host-log-vs-docker-stdout-2026-04-10

Nach Verify abgestimmt mit `TASK-PACKAGES.md`.

---

## Rolle: server-dev (PKG-01 Doku, PKG-02 Compose)

### Scope

- `.claude/reference/debugging/LOG_LOCATIONS.md` — Ground Truth Docker vs. Host-Datei, Reload-Szenario, `docker logs` / Loki.
- Optional erledigt: `docker-compose.yml` — `LOG_FILE_PATH` unter `el-servador`.

### IST / SOLL

- **IST:** `logging_config.setup_logging()` schreibt JSON in Datei (bei `LOG_FORMAT=json`) und Text nach stdout; Compose mountet `./logs/server:/app/logs`.
- **SOLL:** Dokumentation macht die Divergenz operativ eindeutig; Compose setzt `LOG_FILE_PATH` explizit fuer Transparenz.

### Git (Pflicht)

- Arbeitsbranch: **auto-debugger/work**. Vor Aenderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Keine neue Logging-Library; Orientierung an `El Servador/god_kaiser_server/src/core/logging_config.py` und bestehenden Abschnitten in `LOG_LOCATIONS.md`.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- **N/A** fuer diesen Run — keine Frontend-Aenderung; Observability-Hinweis nur Loki `compose_service=el-servador` / `docker logs` wie in TASK-PKG-01.

### Verify-Befehl (Pflicht)

- Nach PKG-02: `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet` — Exit-Code 0.
- Bei optional spaeterem PKG-03 (Code): `poetry run pytest tests/unit/ -q --tb=short` im Server-Ordner.

### Fehler-Register (Pflicht bei Code)

- Fuer reine Doku/PKG-02 nicht erforderlich. Bei SPAETEREM PKG-03: Eintraege in `FEHLER-REGISTER.md` im Run-Ordner (Evidenz → Hypothese → Minimalfix → Re-Verify).
