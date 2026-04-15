# db-inspector — Sicherheitsreview (Tools & Datenpfade)

**Stand:** 2026-04-10

## 1. Ist-Zustand

| Mechanismus | Wirksamkeit | Kommentar |
|-------------|-------------|-----------|
| Agenten-Text (`db-inspector.md`) | Policy | Verbietet DDL/DML, `alembic upgrade`, DELETE ohne Freigabe; erlaubt nur `SELECT` in `psql -c`. |
| `.claude/settings.json` `deny` | Technisch (Claude Code) | `Bash(*DELETE FROM*)`, `*DROP TABLE*`, `*DROP DATABASE*` werden blockiert — **kein** vollständiger SQL-Parser (Umgehung z. B. `DELETE` ohne `FROM` theoretisch möglich → Risiko niedrig, nicht Null). |
| `.claude/settings.json` `hooks` | Kein SQL-Gate | Nur `PostToolUse` (Format) und `Stop`-Prompt — **kein** `PreToolUse`-Hook auf `psql`-Strings. SELECT-only bleibt **Policy + Review**, nicht technisch erzwungen. |
| Kein dediziertes MCP-SQL | n/a | Kein separates SQL-MCP im Repo gefunden; Zugriff läuft über Bash/`docker exec`. |
| Postgres-Logs | Compose | Postgres: **kein** Host-Bind-Mount in `docker-compose.yml` (stdout/json-file) — Inspector liest bevorzugt `docker compose logs --tail=N postgres`, nicht wilde Pfade. |
| Server-Logs | Mount | `./logs/server/` → Container `/app/logs` (siehe verify-plan Anhang) — nur lesen, keine Secrets ausgeben. |

## 2. Risiken

| Risiko | Schwere | Mitigation |
|--------|---------|------------|
| Bash erlaubt beliebige `psql`-Strings | Mittel | Agent-Policy: nur `SELECT`; Peer-Review; optional **Allowlist-Hook** auf `docker exec … psql` (Follow-up: Hook-Team / `hook-development` Skill). |
| `Write`/`Edit` außerhalb Reports | Niedrig | Agent: `Write` nur für `.claude/reports/current/DB_INSPECTOR_REPORT.md` dokumentieren; kein Schreiben in `El Servador/`. |
| COPY aus `.env` in Reports | Hoch | Tabu im Vertrag; nur Variablen**namen** erwähnen. |
| `docker cp` + Destruktiv-SQL (Workaround im alten Agententext) | Mittel | Nur nach expliziter menschlicher Freigabe dokumentieren; Default aus Agenten-Anleitung entfernen oder als „NOT FOR autonomous runs“ markieren. |

## 3. Follow-up-Auftrag (wenn gewünscht harte technische SELECT-only-Garantie)

1. **PreToolUse-Hook** (Claude Code): Bash-Befehle mit `psql` und ohne führendes `SELECT`/`WITH` (nach Whitespace) blocken — Ausnahmeliste: `\d`, `information_schema`, `pg_catalog` (regex-pflegbar).  
2. **Docker Role** (optional): DB-User nur `SELECT` auf App-Schema (separater Readonly-User in Compose-Overlay) — infra-seitig, nicht Agent.

## 4. Abnahme

- [x] Risiken dokumentiert  
- [x] Mitigationen (Policy + denylist + optional Hook/Role) benannt  
- [ ] Hook/Role **nicht** implementiert (bewusster Follow-up, außerhalb dieses Auftrags)
