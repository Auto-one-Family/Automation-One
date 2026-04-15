# IST-Audit: Repo-Treffer `db-inspector` (Paket A)

> **Zweck:** Pflege- und Router-Übersicht — eine Zeile = Pfad + eine Satz Rolle.  
> **Hinweis:** Archiv-Pfade (`.claude/reports/archive/`, `.technical-manager/archive/`) sind historisch; operative Definition liegt unter `.claude/agents/`, `.claude/skills/`, `.claude/reference/db-inspector/`.

## Agenten & Router

| Pfad | Rolle |
|------|--------|
| `.claude/agents/db-inspector.md` | Kanonische Agentendefinition (Modi, Bash/psql-Disziplin, Report-Pfad, NOT FOR). |
| `.claude/agents/server-debug.md` | Verweist DB-Inhalte → db-inspector. |
| `.claude/agents/mqtt-debug.md` | Verweist DB-Inhalte → db-inspector. |
| `.claude/agents/system-control.md` | NOT FOR DB-Queries; empfiehlt db-inspector für DB. |
| `.claude/agents/server-dev.md` | NOT FOR DB-Schema-Inspektion → db-inspector. |
| `.claude/agents/test-log-analyst.md` | DB-Inhalte → db-inspector. |
| `.claude/agents/meta-analyst.md` | Liest `DB_INSPECTOR_REPORT.md` als Quelle. |
| `.claude/agents/agent-manager.md` | Agenten-Inventar inkl. db-inspector. |
| `.claude/agents/auto-debugger.md` | Orchestrierung: db-inspector als DB-Spezialist. |
| `.claude/agents/Readme.md` | Agent-Liste (yellow), Report-Datei. |
| `.claude/CLAUDE.md` | Top-Level-Router: Schema/Migration → db-inspector. |

## Skills

| Pfad | Rolle |
|------|--------|
| `.claude/skills/db-inspector/SKILL.md` | Hauptskill: Schema, Alembic, Diagnose-SQL, Report-Hinweise. |
| `.claude/skills/README.md` | Skill-Katalog verlinkt db-inspector. |
| `.claude/skills/system-control/SKILL.md` | DB-Prüfung → db-inspector zuerst. |
| `.claude/skills/agent-manager/SKILL.md` | Pfade Agent + Skill + Referenzpaket. |
| `.claude/skills/meta-analyst/SKILL.md` | Cross-Report inkl. DB-Inspector-Report. |
| `.claude/skills/verify-plan/SKILL.md` | Tool-/Agent-Matrix erwähnt db-inspector. |
| `.claude/skills/frontend-debug/SKILL.md` | Schema/Migration → db-inspector. |
| `.claude/skills/server-development/databases.md` | Cleanup-Reihenfolge / Verweis auf db-inspector Skill. |
| `.claude/skills/server-development/SKILL.md` | (Router) DB-Schicht → Repos/Models; Detail im Skill db-inspector. |
| `.claude/skills/do/SKILL.md` | DB-Schritte → db-inspector Skill. |
| `.claude/skills/ki-audit/SKILL.md` | DB-Schema/Cleanup → db-inspector. |
| `.claude/skills/auto-debugger/SKILL.md` | Incident/Artefakt-Flow kann db-inspector einbinden. |

## Referenzpaket `.claude/reference/db-inspector/`

| Pfad | Rolle |
|------|--------|
| `VERTRAG.md` | Input/Output, Tabus, Invarianten-SQL, Orchestrierung. |
| `REPORT_TEMPLATE.md` | Kanonisches Report-TOC inkl. Model-Matrix-Verweis. |
| `BEISPIEL_REPORT.md` | Struktur-Beispiel (synthetisch). |
| `MQTT_DB_KORRELATION.md` | MQTT/REST/WS → Tabellen/Spalten mit Evidence-Pfaden. |
| `SICHERHEITSREVIEW.md` | Tools, Denylist, Risiken, Follow-up Hook/Role. |
| `MODEL_TABLE_MATRIX.md` | Modelklasse ↔ Tabelle ↔ Kern-Constraints. |
| `README.md` | Einstiegspaket-Index. |
| `IST_AUDIT_TREFFER.md` | Diese Datei (Paket A). |

## Weitere `.claude/reference/`

| Pfad | Rolle |
|------|--------|
| `.claude/reference/testing/agent_profiles.md` | Profil db-inspector (Skills, Referenzen, Abgrenzung). |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Operative Hinweise; DB-Probleme → db-inspector. |
| `.claude/reference/infrastructure/DOCKER_AKTUELL.md` | Stack-Doku erwähnt db-inspector-Rolle. |
| `.claude/reference/patterns/vs_claude_best_practice.md` | Verzeichnisbaum-Beispiel mit db-inspector.md. |

## Konfiguration & Hooks

| Pfad | Rolle |
|------|--------|
| `.claude/settings.json` | `deny`-Einträge für destruktives SQL (`DELETE FROM`, `DROP TABLE`, …); **kein** dedizierter SQL-Allowlist-Hook. |
| `.claude/settings.json` → `hooks` | Nur `PostToolUse` (auto-format) und `Stop`-Prompt — **keine** PreToolUse-SQL-Policy. |

## Orchestrierung auto-debugger

| Pfad | Rolle |
|------|--------|
| `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md` | Gate-Abschnitt db-inspector (Reihenfolge + Checkliste + Beispiel-Snippet). |

## Scripts & Produkt-Doku (Auszug)

| Pfad | Rolle |
|------|--------|
| `scripts/debug/start_session.sh` | Session-Hinweis bei Daten-Inkonsistenzen → db-inspector. |
| `docs/plans/Debug.md` | Architektur-Text erwähnt db-inspector im Multi-Agent-Kontext. |

## Reports / Archiv (nicht kanonisch für Agent-Text)

| Pfad | Rolle |
|------|--------|
| `.claude/reports/current/DB_INSPECTOR_REPORT.md` | **Kanonischer Live-Report** eines Laufs (wenn geschrieben). |
| `.claude/reports/archive/**/SKILL_ANALYSE_DB_INSPECTOR.md` | Historische Skill-Analyse. |
| `.claude/reports/archive/**/MQTT_DEBUG_COMMUNICATION.md` | Erwähnung db-inspector bei Config-Prüfung. |
| `.claude/reports/Technical Manager/TM_*.md`, `TM_INDEX.md`, `TM SKILLS.md` | TM-Notizen mit Routing zu db-inspector. |
| `.technical-manager/archive/**/*.md` | Strategische Reports; ggf. veraltete Pfade. |

**Kanon für Report-Format:** `.claude/reference/db-inspector/REPORT_TEMPLATE.md` → Ausgabe `.claude/reports/current/DB_INSPECTOR_REPORT.md`.  
**Kanon für Analyse-Markdown unter `docs/analysen/`:** Projekt-Doku; kein Ersatz für den Inspector-Report, aber darf auf Befunde verlinken.
