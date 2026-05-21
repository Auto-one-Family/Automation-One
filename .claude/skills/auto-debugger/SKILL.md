---
name: auto-debugger
description: |
  Orchestrierung fuer Incident-Laeufe und additive Verbesserung von Markdown-Analyseberichten.
  Steuerung primaer ueber Linear-Issue (Label auto-debugger); historisch per Steuerdatei (Lesepfad).
  Verwenden bei: auto-debugger, Incident-Artefakte, Korrelation, TASK-PACKAGES,
  artefact_improvement, verify-plan-Gate vor Implementierung,
  VERIFY-PLAN-REPORT.md, Post-Verify TASK-PACKAGES mutieren, SPECIALIST-PROMPTS rollenweise, Dev-Handoff,
  Linear-first, BELEG-MD, Findings-Kategorien, LINEAR-SYNC-MANIFEST, LINEAR-ISSUES.md, Resilienz-Check,
  Pattern-Scan (closest implementation), Fehler-Register (Mikrozirkular), keine Standard-Chat-Rueckfragen mit Steuerdatei.
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
user-invocable: true
argument-hint: "Linear-Issue-ID (z. B. AUT-209) oder legacy @inbox/STEUER-….md"
---

# Auto-Debugger Skill

> **Agent:** `.claude/agents/auto-debugger.md`  
> **Konzept:** `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md`  
> **Linear / Konfiguration:** `.claude/reference/linear-auto-debugger.md`, `.claude/config/linear-auto-debugger.yaml`  
> **Headless-Skript:** `scripts/linear/auto_debugger_sync.py`

---

## 0. Linear-first (kanonische SSOT)

- **Linear** ist die **kanonische** Oberfläche für Status, Verknüpfungen, Historie und nachvollziehbare Kommentare (Evidence gekürzt + **vollständiger Repo-Pfad** zur Rohdatei).
- **Lokale** Markdown-Artefakte unter `.claude/reports/current/incidents/` bzw. `auto-debugger-runs/` bleiben der **Evidence-Store**; jedes nennenswerte Ergebnis wird **zusätzlich** in Linear gespiegelt (Kommentar oder Issue-Beschreibung).
- **Ausnahme:** `linear_local_only: true` in der Steuerdatei (mit Begründung in `scope`) — dann entfallen Linear-Pflichtkommentare für diesen Lauf, soweit ausgenommen.
- **Dedup:** Vor Anlage neuer Issues: Linear durchsuchen (Cursor: MCP **user-linear** `list_issues` / Query aus Steuerfeld `linear_dedup_search_query`; headless: `python scripts/linear/auto_debugger_sync.py search --query "…"`). Treffer **verknüpfen** (`relatedTo` / `duplicateOf`) oder **Non-Duplikat** kurz begründen.
- **Idempotenz:** Pro Run `LINEAR-SYNC-MANIFEST.json` im **gebundenen** Artefaktordner (Parent-/Child-IDs, Kommentar-Hashes) — kein Issue-Spam bei Wiederholung. Konvention: `.claude/reference/linear-auto-debugger.md`.
- **PKG ↔ Linear:** Optional `LINEAR-ISSUES.md` (Tabelle PKG → Linear-Identifier); verify-plan muss dieselben IDs kennen, wenn die Datei existiert (Skill **verify-plan**).

### TM-parallele Phasen A–F (Kurz)

| Phase | Linear-Pflicht (wenn nicht `linear_local_only`) |
|-------|--------------------------------------------------|
| **A** Volldiagnose | Parent-/Run-Issue: Kommentar Lagebild + Hypothesen + Pfade zu `INCIDENT-LAGEBILD.md` / `CORRELATION-MAP.md` |
| **B** Spezial-Issues | Sub-Issues je klarer Frage; `parentId`, Labels; vorher Dedup |
| **C** Plan / PKG | Kommentar mit Checkliste; gleiche PKG-Nummern wie `TASK-PACKAGES.md` |
| **D** verify-plan | Kommentar `VERIFY-PLAN: passed` oder `failed` + BLOCKER-IDs; Verweis auf `VERIFY-PLAN-REPORT.md` |
| **E** Umsetzung | (Dev-Agenten) Abschlusskommentar mit Diff-/Pfad-Evidenz |
| **F** Live-Verifikation | Kommentar-Vorlage für Robin (Schritte, erwartete Signale) |

### Resilienz-Check (Querschnitt)

Wenn Symptom **Zustand, Sync, Lifecycle, Reconnect, NVS, MQTT-Offline, Stromausfall** berührt: **expliziter Abschnitt** „Resilienz-Check“ im Lagebild oder im Linear-Parent-Kommentar — kein „sicher“ ohne **Code-/State-Machine-Beleg** (Pfade, Symbole, kurze Zitate).

---

## 1. Wann du diesen Skill laedst

- Strukturierter **Incident-Workflow** mit festen Artefakten unter `.claude/reports/current/incidents/<incident_id>/`.
- **Artefakt-Verbesserung:** bestehende Markdown-Berichte (z. B. unter `docs/analysen/`) **additiv** und **repo-verifiziert** erweitern.
- **Kombination** beider Modi (`both`) mit Reihenfolge aus der Steuerdatei.

**Nicht:** Ersatz fuer reine Einzel-Log-Analyse — dann direkt `server-debug`, `frontend-debug`, `mqtt-debug` oder `esp32-debug`.

---

## 2. Normative Steuerung — Linear-First

**Primärer Eingang:** Linear-Issue mit Label **`auto-debugger`** + passendem Status (TM legt fest).  
**Vorlage Issue-Body:** Felder `scope`, `forbidden`, `done_criteria` im Issue-Body (analog Steuerdatei-Felder).

**Fallback (historisch, Lesepfad):** `.claude/auftraege/auto-debugger/inbox/STEUER-*.md`  
Inbox ist eingefroren — kein neues Schreibziel. Bestehende MDs für historische Läufe weiter nutzbar.  
**Legacy-Vorlage:** `.claude/auftraege/auto-debugger/STEUER-VORLAGE.md`

### Pflichtfelder (im Linear-Issue-Body oder Steuerdatei)

| Feld | Werte / Bedeutung |
|------|-------------------|
| `scope` | Was zu analysieren ist (Docker/Loki/Prometheus/DB/Code-Schicht) |
| `forbidden` | Harte Grenzen (keine Breaking Changes, keine Secrets, kein Direktcommit auf `master`) |
| `done_criteria` | Messbare Abnahme (z. B. „≥1 tracing-gap-Finding mit Beleg-MD") |
| `run_mode` | `incident` \| `artefact_improvement` \| `both` (nur Steuerdatei-Compat) |
| `target_docs` | Liste repo-relativer Pfade (nur Steuerdatei-Compat, bei `incident` leer erlaubt) |

### Optionale Felder (weiterhin gültig)

| Feld | Wann |
|------|------|
| `incident_id` | bei `incident` oder `both` — Ziel `.claude/reports/current/incidents/<id>/` |
| `run_id` | Ausgabe `.claude/reports/current/auto-debugger-runs/<run_id>/` |
| `order` | bei `both`: `incident_first` (Default) oder `artefact_first` |
| `linear_local_only` | `true` — kein Linear-Pflichtspiegel (nur mit Begründung in `scope`) |
| `linear_epic_issue_id` / `linear_parent_issue_id` | bestehendes Epic/Parent |
| `linear_run_issue_id` | bestehendes Run-Issue statt neuem Parent |
| `linear_target_labels` | kommagetrennte Label-Namen |
| `linear_dedup_search_query` | Suchstring vor Issue-Erstellung |
| `no_chat_questions` | optional: `true` — dokumentiert im Frontmatter die Erwartung „keine Standard-Rückfragen” (Norm bei gültiger Steuerdatei ohne `allow_user_escalation`; siehe Agent §0) |
| `konsolidierung_step` | optional: `single` — höchstens ein begrenzter Konsolidierungsschritt Alt+Neu pro Lauf; weitere Schritte als Folge-PKGs |
| `allow_user_escalation` | optional: `true` — nur dann gezielte Rückfragen an den Menschen erlaubt, wenn die Steuerdatei es ausdrücklich freigibt |

**Startpattern (Robin):** Linear-Issue-ID im Chat, z. B. `AUT-209 abarbeiten` — oder legacy `@inbox/STEUER-….md`.

**Ohne gültigen Eingang:** nur Klärungsfragen — **keine** vollständige Artefaktstruktur ausgeben.

**Mit gültiger Steuerdatei:** Pflichtsequenz **ohne** Standard-Chat-Rückfragen ausführen (Repo-Lektüre, konservative Annahme mit Risikozeile, oder BLOCKER) — vollständig in `.claude/agents/auto-debugger.md` §0.

---

## 2a. Beleg-MD-Template (pro Finding)

Dateiname: `.claude/reports/current/auto-debugger-runs/<run_id>/BELEG-<finding-id>-<YYYY-MM-DD>.md`  
Vorlage: `.claude/auftraege/auto-debugger/BELEG-VORLAGE.md`

```markdown
# BELEG — <Finding-Titel>

**Finding-ID:** <id>  
**Datum:** <YYYY-MM-DD>  
**Linear-Issue:** <URL>  
**Kategorie:** <error | tracing-gap | duplicate | inconsistency | overcomplexity | unstructured>  
**Schicht:** <El Trabajante | El Servador | El Frontend | Stack>

## Symptom-Zusammenfassung

<1–2 Absätze>

## Logs-Beleg

```loki
<LogQL-Query>
```

<5–20 Zeilen Roh-Output mit Timestamps, request_id/correlation_id>

## Stack-Beleg

<Stacktrace oder State-Snapshot aus Service>

## Code-Beleg

`path/to/file.py:123` (Kontext: 5–15 Zeilen)

```python
<Code-Ausschnitt>
```

## Kausalerklärung

<Wie Logs + Stack + Code das Symptom verursachen>
```

---

## 2b. Duplikat-Output-Schritt (Kategorie `duplicate`)

Wenn `duplicate` erkannt wird, **muss** der Linear-Issue-Body enthalten:
- **Kanonische Stelle:** `path/to/file.py:123` — mit Begründung (höchste Test-Abdeckung, längste Lebensdauer, klarste API, wenigste Sonderfälle)
- **Zu prüfende andere Stellen:** Liste `path/to/other.py:456`, …
- **Begründung der Kanonisierung:** explizit, nicht nur als Behauptung

Verweis auf Profil-Sektion: `.claude/agents/auto-debugger.md` — **8. Konsolidierungs-Regel**.

---

## 2c. Rollen-Trennung (Verweis)

`auto-debugger` ist **Analyst**, nicht Implementierer. Kein Code-Change direkt — Ausgabe geht als Linear-Issue an Spezialagenten.

Vollständige Regel: `.claude/agents/auto-debugger.md` — **9. Rollen-Trennung**.

---

## 2d. Git-Arbeitsbranch `auto-debugger/work`

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
- `LINEAR-SYNC-MANIFEST.json` (Idempotenz / Linear-IDs; vom Orchestrator gepflegt)
- `LINEAR-ISSUES.md` (optional; PKG → Linear-Identifier — **gleiche** IDs wie verify-plan/TASK-PACKAGES)
- `FEHLER-REGISTER.md` — **Pflicht**, sobald **Code-PKGs** geplant sind (Mikroskopischer Fehlerworkflow; gleicher Dateiname unter `auto-debugger-runs/<run_id>/` bei Artefakt-Modus mit Implementierung)

**Clustering-Reihenfolge** fuer Korrelation (nicht mischen ohne Evidence):

1. Notification: `correlation_id`, `fingerprint`, `parent_notification_id`  
2. HTTP: `X-Request-ID` / `request_id`  
3. `esp_id` + Zeitfenster  
4. MQTT-Logs mit generierter/synthetischer CID  
5. Titel / Dedup-Key **zuletzt**

**Pflicht-Hinweis:** ISA-18.2 / `NotificationRouter` / DB-Notifications **vs.** WS `error_event` (ohne Router) — keine falsche Root-Cause-Zuordnung.

**Operator-UX & Finalität (eine Zeile):** UI-Zustände und Meldungen müssen zu **tatsächlichen** API-/Store-/WS-Ergebnissen passieren — kein Schein-Erfolg; Cockpit-Signalhierarchie (Lagebild → Diagnose → Forensik) und bestehende Design-Tokens respektieren.

---

## 3a. Pattern-Scan (Pflichtschritt im Ablauf)

**Wann:** Nach erstem Lagebild bzw. nach IST-Erfassung der `target_docs` — **vor** Erstellung oder scharfer Schärfung von `TASK-PACKAGES.md` / `SPECIALIST-PROMPTS.md`.

**Minimal-Checkliste (im Lagebild oder Kurzabschnitt dokumentieren):**

1. **Backend (falls im Scope):** Pro betroffenem Layer ein **Analogfall** genannt (`Grep` nach ähnlichem Endpoint, Handler, Service, Topic); Pfade **repo-verifiziert**.  
2. **Frontend (falls im Scope):** **Closest** Komponente/Composable/Store für denselben UI-Flow; **welcher** Alert-/Notification-/Drawer-Pfad gilt — **keine** parallele „zweite Welt“ ohne PKG-Hinweis auf Migration.  
3. **Schnittstellen:** Keine stillen Änderungen an REST/MQTT/WS/DB ohne Abgleich mit `forbidden` und Verify-Gate.  
4. **Konsolidierung:** Wenn `konsolidierung_step: single` — nur **ein** begrenzter Alt+Neu-Schritt in diesem Lauf; Rest als Folge-Pakete.

Der Agent **auto-debugger** integriert diesen Schritt in die Pflichtsequenz (Incident §1.3 Schritt 2b, Artefakt §2.1 Schritt 2b).

---

## 3b. Fehler-Register (fortlaufend im Lauf)

**Zweck:** Jeder Fehler (Build, Lint, Test, Laufzeit, E2E) **einzeln** bearbeiten — nicht wegdrücken durch die nächste große Änderung.

**Datei:** `FEHLER-REGISTER.md` im **gebundenen** Artefaktordner (`incidents/<id>/` oder `auto-debugger-runs/<run_id>/`).

**Pro Eintrag (tabellarisch oder nummeriert):**

| Feld | Inhalt |
|------|--------|
| ID | fortlaufend |
| Evidenz | eine Zeile Output / Assertion / Stack |
| Hypothese | eine Zeile Ursache vs. Symptom |
| Fix | Minimalfix (thematische Einheit) |
| Verify | Befehl + Ergebnis (grün/rot) nach Re-Run |

**Regel:** Neuen Fehler erst angehen, wenn der vorherige mit **demselben** Verify-Befehl **grün** verifiziert wurde — oder explizit als BLOCKER mit Nachbedingung geschlossen.

**Delegation:** Jeder Block in `SPECIALIST-PROMPTS.md` enthält den Pflichtabschnitt **Fehler-Register** (siehe Agent §0a Muster-Fragment).

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

### 5b. Muster-Fragment SPECIALIST-PROMPT (Pflichtblöcke)

Vollständiges Gerüst mit **Git**, **Pattern-Reuse**, **Alert-Pfad**, **Verify**, **Fehler-Register** — identisch zum Block in `.claude/agents/auto-debugger.md` §0a („Muster-Fragment“); bei Prompt-Erzeugung **kopieren und** mit PKG-Pfaden sowie konkretem Verify-Befehl **füllen**.

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
- **Tooling:** Linear-Schreibzugriff in Cursor typischerweise über MCP **user-linear**; headless über `scripts/linear/auto_debugger_sync.py` (stdlib). Keine erfundenen Topic-/Dateinamen — nur repo-belegte Pfade.

**Struktur von `VERIFY-PLAN-REPORT.md`:** Sollte den fachlichen Verify-Teil und denselben Inhalt wie der Chat-Block **OUTPUT FÜR ORCHESTRATOR (auto-debugger)** konsistent abbilden (oder darauf verweisen), damit Post-Verify-Patches an `TASK-PACKAGES.md` nachvollziehbar bleiben.
