# TASK-PACKAGES — host-log-vs-docker-stdout-2026-04-10

**Nach Verify angepasst** — siehe `VERIFY-PLAN-REPORT.md`.

## PKG-01 — Dokumentation (Pflicht)

**Owner:** server-dev / auto-debugger (artefact_improvement)

**Ziel:** `.claude/reference/debugging/LOG_LOCATIONS.md` — verbindliche **Ground Truth** fuer Docker-Dev:

- Zwei Handler: **Datei** = JSON (bei `LOG_FORMAT=json`), **Docker-Console** = **Text** (`TextFormatter` auf stdout).
- Dev mit Reload: `docker compose -f docker-compose.yml -f docker-compose.dev.yml` aktiviert **uvicorn --reload**; WatchFiles-/Reload-Zeilen in `docker logs` koennen fehlen oder zeitlich von der JSON-Datei abweichen.
- Live-Triage: **`docker logs automationone-server`** oder **`docker compose logs -f el-servador`** (Zeitfenster); ergaenzend Loki `compose_service="el-servador"` (§12).
- **Nicht erwartbar:** Byte-gleiche Zeilen zwischen Host-Datei und Docker-stdout.
- Windows: Bind-Mount + Editor-`tail` koennen verzoegern — kein Ersatz fuer `docker logs` bei Live-Triage.

**Akzeptanzkriterien:**

- [x] Abschnitt in LOG_LOCATIONS nachvollziehbar; Pfade stimmen mit Compose ueberein.
- [x] Aenderungen und Commits nur auf Branch `auto-debugger/work`.

**Verify:** Review; kein pytest-Pflicht bei reiner Doku.

---

## PKG-02 — Compose-Transparenz (optional, umgesetzt)

**Owner:** server-dev

**Ziel:** `docker-compose.yml` — unter `el-servador.environment` explizit `LOG_FILE_PATH=/app/logs/god_kaiser.log` (entspricht Default unter `WORKDIR /app` + Bind-Mount `./logs/server` → `/app/logs`).

**Akzeptanzkriterien:**

- [x] `docker compose -f docker-compose.yml -f docker-compose.dev.yml config` Exit 0.
- [x] Keine Secrets geaendert.

**Verify:** `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet`

---

## PKG-03 — Code (optional, nicht gestartet)

**Owner:** server-dev

**Status:** Nicht angeordnet — nur nach eigenem Nutzen (z. B. dokumentiertes Flush bei Reload). Kein Refactor.

**Verify (falls aktiviert):** `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/ -q --tb=short` + `ruff check src/`.
