---
run_mode: artefact_improvement
incident_id: ""
run_id: docker-ist-folge-04-postgres
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md
scope: |
  PostgreSQL-Bezug zur IST-Stichprobe: Container automationone-postgres, Healthcheck pg_isready,
  Logs mit checkpoint / execute / INSERT sensor_data / UPDATE sensor_configs — kein FATAL im Tail.
  Aufgabe: operative Hinweise (Stichprobe vs. Full-Log, keine sensiblen Daten ins Repo) in der
  Referenz schärfen; bei Schema-/Query-Themen db-inspector Skill nutzen. Kein Produkt-DB-Code ändern,
  solange nur Dokumentationsabgleich nötig ist.
forbidden: |
  Keine vollständigen SQL-Logs oder Passwörter in Markdown. Keine Alembic-Migration „zur Dokumentation“.
  Keine direkten Produktions-DB-Zugriffe aus Steuerdateien. Branch nur auto-debugger/work.
done_criteria: |
  Kurzabschnitt in SYSTEM_OPERATIONS_REFERENCE (oder LOG_LOCATIONS) zu Postgres-Docker: Healthcheck,
  typische LOG:-Zeilen, Verweis auf asyncpg/god_kaiser_db nur auf Meta-Ebene. Optional: Verknüpfung
  mit CORRELATION-MAP (sensor_data INSERT) ohne konkrete Zeilenwerte.
---

# STEUER 04 — PostgreSQL: Operative Stichprobe (Folge INC-2026-04-09-docker-ist)

**Pattern (Repo-Ist):**

- Compose: `postgres` → `automationone-postgres`, Volume `automationone-postgres-data`, Config-Mount `docker/postgres/postgresql.conf`.
- App: `DATABASE_URL` mit `postgresql+asyncpg://` im Service `el-servador`.

**Schrittweise Umsetzung**

1. **Baseline:** Incident — INSERT/UPDATE in Stichprobe als Normalfall dokumentieren.
2. **Diagnose:** Bei echten Incidents `docker logs automationone-postgres --tail N` — nur Muster (FATAL, deadlock), keine Datenzeilen kopieren.
3. **Tiefendiagnose:** Skill `db-inspector` für Schema, orphaned rows, Volume — nicht im STEUER duplizieren.
4. **Code:** Nur bei nachgewiesenem Bug (z. B. Connection Pool) — dann STEUER-02/verify-plan und server-dev.

**Verify:** Dokumentation nur — kein pytest. Bei DB-Code-Änderungen: `pytest` + Alembic-Review.

**Rolle:** db-inspector bei Datenfragen; server-dev nur bei Backend-Fix.
