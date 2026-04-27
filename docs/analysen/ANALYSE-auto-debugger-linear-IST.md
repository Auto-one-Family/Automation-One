# IST-Analyse: auto-debugger und lokale Artefakte vs. Linear (2026-04-24)

> **Zweck:** Pfad-Matrix für die Linear-Einbettung. Quellen: `.claude/skills/auto-debugger/SKILL.md`, `.claude/agents/auto-debugger.md`, `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md`, bestehende Incident-/Run-Ordner unter `.claude/reports/current/`.

## 1. Normative Steuerung

| Artefakttyp | Pfad | Linear-Aktion (Soll) | Retention lokal |
|-------------|------|----------------------|-----------------|
| Steuerdatei (Run-Contract) | `.claude/auftraege/auto-debugger/inbox/STEUER-*.md` | Frontmatter: `linear_*`, `linear_local_only`; Verweis auf Parent-Issue optional | **Ja** — Git-versioniert, kein Ersatz durch Linear |
| Vorlage | `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md` | Dokumentation der Felder | **Ja** |
| Outbox-Hinweise | `.claude/auftraege/auto-debugger/outbox/README.md` | Kein SSOT; optional Link zu Linear-Run | **Ja** |

## 2. Incident-Artefakte

Basisordner: **`.claude/reports/current/incidents/<incident_id>/`**

| Datei | Inhalt (IST) | Linear-Aktion (Soll) | Retention |
|-------|--------------|----------------------|-----------|
| `INCIDENT-LAGEBILD.md` | Symptom, Schichten, Fragen | Phase **A**: Parent-/Run-Kommentar + Kurz-Lagebild; Evidence-Pfade | **Ja** — Evidence-Store |
| `CORRELATION-MAP.md` | HTTP/MQTT/WS/DB-Tabellen | Phase **A/B**: Kommentar mit gekürzten Zeilen + Link auf diese Datei | **Ja** |
| `TASK-PACKAGES.md` | PKG, Owner, Tests | Phase **B/C**: Sub-Issues oder Checklisten-Kommentar; gleiche PKG-IDs wie Linear | **Ja** |
| `SPECIALIST-PROMPTS.md` | Copy-Paste-Blöcke | Phase **B**: Issue-Beschreibung oder Kommentar je Spezial-Paket | **Ja** |
| `VERIFY-PLAN-REPORT.md` | verify-plan-Gate | Phase **D**: Kommentar `VERIFY-PLAN: passed/failed` + Pfad zu dieser Datei | **Ja** |
| `LINEAR-SYNC-MANIFEST.json` | (neu) Idempotenz / Issue-IDs | — | **Ja** |
| `LINEAR-ISSUES.md` | (neu, optional) PKG → Linear-ID | verify-plan OUTPUT referenziert IDs | **Ja** |
| Weitere Reports (z. B. `SPRINT-PLAN-*.md`, `RUN-FORENSIK-*.md`) | Projekt-/TM-Anreicherung | Verknüpfung `relatedTo` / Kommentar mit Pfad | **Ja** |
| Unterordner `logs/` o. ä. | Rohlogs | Kommentar: gekürzt + Repo-Pfad | **Ja** |

## 3. Artefakt-Modus (`auto-debugger-runs`)

Basisordner: **`.claude/reports/current/auto-debugger-runs/<run_id>/`**

| Datei | Inhalt (IST) | Linear-Aktion (Soll) | Retention |
|-------|--------------|----------------------|-----------|
| `TASK-PACKAGES.md` | wie Incident | wie oben | **Ja** |
| `SPECIALIST-PROMPTS.md` | wie Incident | wie oben | **Ja** |
| `VERIFY-PLAN-REPORT.md` | wie Incident | Phase **D** | **Ja** |
| `CORRELATION-MAP.md` | optional | wie Incident | **Ja** |
| `LINEAR-SYNC-MANIFEST.json` / `LINEAR-ISSUES.md` | neu | wie oben | **Ja** |

## 4. Zusätzliche Analyse-Dokumente (`docs/analysen/`)

| Artefakttyp | Pfad | Linear-Aktion | Retention |
|-------------|------|----------------|-----------|
| IST-/SOLL-Analysen, Konzept | `docs/analysen/*.md` | `artefact_improvement`: Kommentar mit PR-/Commit-Bezug; keine Pflicht für jedes Doc | **Ja** |

## 5. Linear IST (vor Einbettung)

- **Keine** automatische Synchronisation aus Skill/Agent.
- **Manuell:** Steuerdateien verlinken oft bestehende Issues (z. B. `https://linear.app/autoone/issue/AUT-134/...` im Freitext unter dem Frontmatter).
- **Cursor:** MCP-Server `user-linear` kann `save_issue`, `save_comment`, `list_issues` etc. — wird im Soll-Orchestrierer genutzt (siehe `.claude/reference/linear-auto-debugger.md`).

## 6. Ausnahme `linear_local_only`

Wenn in der Steuerdatei `linear_local_only: true` gesetzt und in `scope` begründet: **kein** Linear-Pflichtkommentar für diesen Lauf; Matrix-Zeilen „Linear-Aktion“ entfallen nur, soweit ausdrücklich ausgenommen.

## 7. Referenz-Implementierung (Repo)

- Konfiguration: `.claude/config/linear-auto-debugger.yaml`
- Headless-Hilfe: `scripts/linear/auto_debugger_sync.py`
- Onboarding: `.claude/reference/linear-auto-debugger.md`
- Secrets: `.env` → `LINEAR_API_KEY` (siehe `.env.example`)
