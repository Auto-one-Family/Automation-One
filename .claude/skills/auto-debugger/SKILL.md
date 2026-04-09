---
name: auto-debugger
description: |
  Orchestrierung fuer Incident-Laeufe und additive Verbesserung von Markdown-Analyseberichten.
  Start immer ueber Steuerdatei unter .claude/auftraege/auto-debugger/inbox/.
  Verwenden bei: auto-debugger, Incident-Artefakte, Korrelation, TASK-PACKAGES,
  artefact_improvement, verify-plan-Gate vor Implementierung,
  VERIFY-PLAN-REPORT.md, Post-Verify TASK-PACKAGES mutieren, SPECIALIST-PROMPTS rollenweise, Dev-Handoff.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
user-invocable: true
argument-hint: "Pfad zur Steuerdatei oder @inbox/STEUER-….md"
---

# Auto-Debugger Skill

> **Agent:** `.claude/agents/auto-debugger.md`  
> **Konzept:** `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md`

---

## 1. Wann du diesen Skill laedst

- Strukturierter **Incident-Workflow** mit festen Artefakten unter `.claude/reports/current/incidents/<incident_id>/`.
- **Artefakt-Verbesserung:** bestehende Markdown-Berichte (z. B. unter `docs/analysen/`) **additiv** und **repo-verifiziert** erweitern.
- **Kombination** beider Modi (`both`) mit Reihenfolge aus der Steuerdatei.

**Nicht:** Ersatz fuer reine Einzel-Log-Analyse — dann direkt `server-debug`, `frontend-debug`, `mqtt-debug` oder `esp32-debug`.

---

## 2. Normative Steuerdatei

**Pflichtablage:** `.claude/auftraege/auto-debugger/inbox/`  
**Vorlage:** `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md`

### Pflichtfelder

| Feld | Werte / Bedeutung |
|------|-------------------|
| `run_mode` | `incident` \| `artefact_improvement` \| `both` |
| `target_docs` | Liste repo-relativer Pfade (bei reinem `incident` leer erlaubt wenn in `scope` begruendet) |
| `scope` | Was du bearbeitest (z. B. nur additive Abschnitte, nur Korrelation) |
| `forbidden` | Harte Grenzen (keine Schema-Aenderungen, keine Secrets, …) |
| `done_criteria` | Messbare Abnahme |

### Optionale Felder

| Feld | Wann |
|------|------|
| `incident_id` | bei `incident` oder `both` — Ziel `.claude/reports/current/incidents/<id>/` |
| `run_id` | Ausgabe `.claude/reports/current/auto-debugger-runs/<run_id>/` fuer Pakete/Verify im Artefakt-Modus |
| `order` | bei `both`: `incident_first` (Default) oder `artefact_first` |

**Startpattern (Robin):** Steuerdatei im Chat referenzieren, z. B. `@.claude/auftraege/auto-debugger/inbox/STEUER-….md`

**Ohne gueltige Steuerdatei:** nur Klärungsfragen — **keine** vollstaendige Artefaktstruktur ausgeben.

---

## 2a. Git-Arbeitsbranch `auto-debugger/work`

- **Fixer Arbeitsbranch** für alle auto-debugger-orchestrierten Änderungen: **`auto-debugger/work`** (von `master` abgezweigt).  
- **Robin:** Vor dem Lauf `git checkout auto-debugger/work` (Branch existiert im Repo; bei neuem Clone einmal von `master` anlegen: `git checkout -b auto-debugger/work master`).  
- **Agent:** Zu Beginn strukturierter Arbeit Branch prüfen/wechseln gemäß `.claude/agents/auto-debugger.md` Abschnitt **0a**; **Bash** nur für die dort erlaubten Git-Kommandos.  
- **Delegation:** Jeder Block in `SPECIALIST-PROMPTS.md` enthält die **Git-Pflicht** (nur Commits auf `auto-debugger/work`, nicht auf `master`). `TASK-PACKAGES.md` verlangt dasselbe in den Akzeptanzkriterien.

---

## 3. Feste Artefakt-Dateinamen (Incident)

Unter `.claude/reports/current/incidents/<incident_id>/`:

- `INCIDENT-LAGEBILD.md`
- `CORRELATION-MAP.md`
- `TASK-PACKAGES.md`
- `SPECIALIST-PROMPTS.md`
- `VERIFY-PLAN-REPORT.md`

**Clustering-Reihenfolge** fuer Korrelation (nicht mischen ohne Evidence):

1. Notification: `correlation_id`, `fingerprint`, `parent_notification_id`  
2. HTTP: `X-Request-ID` / `request_id`  
3. `esp_id` + Zeitfenster  
4. MQTT-Logs mit generierter/synthetischer CID  
5. Titel / Dedup-Key **zuletzt**

**Pflicht-Hinweis:** ISA-18.2 / `NotificationRouter` / DB-Notifications **vs.** WS `error_event` (ohne Router) — keine falsche Root-Cause-Zuordnung.

---

## 4. Merge-Regeln

- Vor Delegation/Spezialisierung: **INCIDENT-LAGEBILD** aktualisieren.  
- Nach jedem inhaltlichen Teilschritt: Abschnitt **„Eingebrachte Erkenntnisse“** mit Timestamp **anhaengen** (additiv).  
- Bestehende Autoren-Zusammenfassungen nicht loeschen ohne explizite Freigabe in der Steuerdatei.

---

## 5. /verify-plan — Pflichtgate und Post-Verify-Übergabe

**Vor jeder Implementierung**, die aus `TASK-PACKAGES.md` abgeleitet wird:

1. Skill **`.claude/skills/verify-plan/SKILL.md`** anwenden (Inhalt der Pakete + relevante Pfade). Im **Gate-Kontext** muss die Chat-Antwort den normativen Block **„OUTPUT FÜR ORCHESTRATOR (auto-debugger)“** enthalten (PKG → Delta, Rolle, Abhängigkeiten, BLOCKER).  
2. Vollständiges Ergebnis in **`VERIFY-PLAN-REPORT.md`** im jeweiligen Incident- bzw. `auto-debugger-runs/`-Ordner festhalten (gebundener Pfad).  
3. **Post-Verify (Pflicht):** **`TASK-PACKAGES.md` mutieren** — Verify-Erkenntnisse und den Orchestrator-Block **in die Paketdatei einarbeiten** (nicht nur im Chat wiederholen): korrigierte Pfade, Tests, Reihenfolge, HW-Gates, entfernte/aufgeteilte Pakete, verschärfte Akzeptanzkriterien.  
4. **`SPECIALIST-PROMPTS.md`** danach **pro Dev-Rolle** aktualisieren: nur PKG-Anteile dieser Rolle, Verweise auf die **angepassten** PKG-Nummern, gemeinsame Reihenfolge und Schnittstellen („nach PKG-01“, „blockiert bis …“).  
5. **Kurze Übergabe-Zusammenfassung** im Chat: geänderte PKG, Startauftrag pro Rolle, verbleibende **BLOCKER**.  
6. **Keine** Produkt-Implementierung durch den Orchestrator in Schritten 3–5 — nur Artefakte; Dev-Agenten starten danach — **ausschließlich** auf Branch **`auto-debugger/work`** (siehe **2a**).

Ohne abgeschlossenes Gate (1–2): maximal Analyse- und Doku-Updates gemäss `scope`/`forbidden` der Steuerdatei.

### 5a. Delta → TASK-PACKAGES (Beispiel)

```markdown
<!-- Verify meldet: pytest-Pfad in PKG-01 falsch -->

**Vorher (Auszug PKG-01):**
- Tests: `pytest tests/unit/test_foo.py`

**Nachher (nach Verify / OUTPUT FÜR ORCHESTRATOR):**
- Tests: `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/services/test_foo.py -q`
- Akzeptanz: Exit-Code 0; Pfad aus VERIFY-PLAN-REPORT Abschnitt „Korrekturen“ übernommen.
```

Der Spezialisten-Prompt für `server-dev` verweist dann explizit auf **PKG-01 (nach Verify-Stand)** und die aktualisierte Testzeile.

---

## 6. Beispiel-Steuerlauf (ohne Secrets)

**Szenario:** Modus `artefact_improvement`, ein Zieldokument.

0. `git checkout auto-debugger/work` (Arbeitsbranch).  
1. Kopiere `STEUER-VORLAGE.md` nach `inbox/STEUER-obs-ist-2026-04-09.md`.  
2. Setze `run_mode: artefact_improvement`, `target_docs: [docs/analysen/IST-observability-correlation-contracts-2026-04-09.md]`, `scope` auf additive Evidence-Zeilen und Lueckenliste, `forbidden` z. B. „keine REST-Schema-Aenderungen“, `done_criteria` z. B. „alle P0-Luecken geschlossen oder als BLOCKER dokumentiert“.  
3. Optional `run_id: obs-ist-2026-04-09`.  
4. Chat: `@.claude/auftraege/auto-debugger/inbox/STEUER-obs-ist-2026-04-09.md` — Agent **auto-debugger** starten.  
5. Erwartung: aktualisierte Zieldatei(en) mit nachvollziehbaren Evidence-Verweisen; bei Folge-Implementierung: `TASK-PACKAGES.md` + `VERIFY-PLAN-REPORT.md` unter `auto-debugger-runs/<run_id>/`.

---

## 7. Known gaps

- Abweichungen zwischen Konzeptbericht und Repo-Ist: im **VERIFY-PLAN-REPORT** festhalten; Repo-Ist gewinnt.  
- Playwright/E2E-Flows fuer Alert-Center: separate Roadmap-Phase laut Konzept — nicht Teil dieses Skills.

**Struktur von `VERIFY-PLAN-REPORT.md`:** Sollte den fachlichen Verify-Teil und denselben Inhalt wie der Chat-Block **OUTPUT FÜR ORCHESTRATOR (auto-debugger)** konsistent abbilden (oder darauf verweisen), damit Post-Verify-Patches an `TASK-PACKAGES.md` nachvollziehbar bleiben.
