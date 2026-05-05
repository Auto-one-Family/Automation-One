# Artefakt-Lagebild — Host-`god_kaiser.log` vs. Docker-Stdout

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-fix-host-log-vs-docker-stdout-2026-04-10.md`  
**run_id:** `host-log-vs-docker-stdout-2026-04-10`  
**Modus:** `artefact_improvement`  
**Git (IST):** Branch `auto-debugger/work` (Soll: `auto-debugger/work`) — Stand 2026-04-10.

## Problemstatement (kurz)

Server schreibt **zwei** Ziele: **RotatingFileHandler** (bei `LOG_FORMAT=json` → JSON in Datei) und **StreamHandler stdout** (immer **TextFormatter**, lesbar). Docker zeigt primär **stdout/stderr** (json-file-Logtreiber → `docker logs`); die Host-Datei `logs/server/god_kaiser.log` entspricht dem Bind-Mount `./logs/server:/app/logs`. Zeilen sind **nicht** byte-identisch zur Console. Mit **uvicorn --reload** (`docker-compose.dev.yml`) entstehen zusätzliche Prozess-/WatchFiles-Zeilen in Docker, die nicht 1:1 der JSON-Datei entsprechen muessen.

## Pattern-Scan (Repo-verifiziert)

| Thema | Fundstelle |
|-------|------------|
| Zwei Handler, Console = Text | `El Servador/god_kaiser_server/src/core/logging_config.py` — `setup_logging()`, `RotatingFileHandler` + `StreamHandler(sys.stdout)` mit `TextFormatter` |
| Datei-Formatter | Bei `settings.logging.format == "json"` nutzt der **File**-Handler `JSONFormatter`; Console bleibt Text |
| `handlers.clear()` bei erneutem `setup_logging()` | `logging_config.py` Zeile ~146 |
| Defaults | `El Servador/god_kaiser_server/src/core/config.py` — `LoggingSettings.file_path` default `logs/god_kaiser.log` → unter Docker mit `WORKDIR /app` → `/app/logs/god_kaiser.log` |
| Compose | `docker-compose.yml`: Service `el-servador`, `container_name: automationone-server`, Volume `./logs/server:/app/logs` |
| Reload-Dev | `docker-compose.dev.yml`: `command` mit `--reload --reload-dir /app/src` |

## Konsolidierung (`konsolidierung_step: single`)

Ein konsolidierter Doku-Block in **einer** Referenzdatei: `.claude/reference/debugging/LOG_LOCATIONS.md` (Ground-Truth-Regeln). Optionale Compose-Transparenz: ein `LOG_FILE_PATH` in `docker-compose.yml` ohne Semantikwechsel.

## Risiko / Annahmen

- Lokaler Poetry-Lauf ohne Docker schreibt weiterhin unter `El Servador/god_kaiser_server/logs/god_kaiser.log` (relativer Default) — Docker-Stack nutzt `/app/logs` im Container.
