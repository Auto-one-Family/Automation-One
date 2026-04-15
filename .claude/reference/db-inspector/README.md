# db-inspector — Referenzpaket

Kanonisierter Einstieg für den Agenten **`db-inspector`** und Skill **`.claude/skills/db-inspector/`**.

| Datei | Zweck |
|-------|--------|
| [VERTRAG.md](VERTRAG.md) | Input/Output, Tabus, Report-TOC, Orchestrierung |
| [REPORT_TEMPLATE.md](REPORT_TEMPLATE.md) | Leeres Report-Gerüst (Abschnitte) |
| [BEISPIEL_REPORT.md](BEISPIEL_REPORT.md) | Ausgefülltes Beispiel (synthetisch / Fixture-Hinweise) |
| [MQTT_DB_KORRELATION.md](MQTT_DB_KORRELATION.md) | Topic/Keys → Tabellen/Spalten (Evidence-Pfade) |
| [SICHERHEITSREVIEW.md](SICHERHEITSREVIEW.md) | Tools, Bash, Hooks, Mitigationen |
| [IST_AUDIT_TREFFER.md](IST_AUDIT_TREFFER.md) | Repo-Treffer „db-inspector“ (Paket A) |
| [MODEL_TABLE_MATRIX.md](MODEL_TABLE_MATRIX.md) | SQLAlchemy-Modell ↔ Tabelle ↔ Kern-Constraints |

**Kanonsicher Report-Pfad (laufende Analyse):** `.claude/reports/current/DB_INSPECTOR_REPORT.md`

**Alembic HEAD:** Immer mit `cd El Servador/god_kaiser_server` und `poetry run alembic heads` (oder aktiviertes Projekt-venv) gegen `SELECT version_num FROM alembic_version` prüfen. Repo-Datei z. B. `alembic/versions/ea85866bc66e_add_calibration_sessions_table.py` — bei Drift README/Matrix-Zeile aktualisieren, nicht raten.
