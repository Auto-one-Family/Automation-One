# Verbesserungsauftrag — auto-debugger: Post-Verify Plan-Anpassung, Dev-Handoff, verify-plan-Ausgabecontract

**Datum:** 2026-04-10  
**Typ:** Implementierung (Doku/Agent/Skill-Texte im Repo; keine Produkt-API/MQTT/WS/DB-Vertragsänderung)  
**Branch:** ausschließlich `auto-debugger/work` (von `master`); kein Push durch Agenten.

---

## 1. Ausgangslage (zusätzliches Problem zum bestehenden Analysebericht)

Nach einem erfolgreichen **`/verify-plan`-Durchlauf** (Inhalt aus `.claude/skills/verify-plan/SKILL.md` angewendet, Ergebnis in  
`.claude/reports/current/auto-debugger-runs/<run_id>/VERIFY-PLAN-REPORT.md`) fehlt eine **verbindliche zweite Orchestrator-Phase**:

1. **`auto-debugger`** soll den **Implementierungsplan** (`TASK-PACKAGES.md`) **gezielt an die Verify-Erkenntnisse anpassen** (präzisere Pfade, Reihenfolge, HW-Gates, entfernte/aufgeteilte Pakete, Akzeptanzkriterien verschärft).
2. Anschließend sollen **SPECIALIST-PROMPTS** (oder gleichwertige Dev-Übergabeblöcke) **pro Dev-Rolle** so erstellt/aktualisiert werden, dass **jeder Dev-Agent einen zusammenhängenden Bereich** hat, der sich **mit den Paketen der anderen Rollen abstimmt** (keine Doppelarbeit, klare Schnittstellen, gemeinsame Reihenfolge z. B. PKG-01 → PKG-03 → PKG-02 …).
3. Der Skill **`verify-plan`** bleibt in seiner **Kernfunktion unverändert** (Reality-Check Plan↔Codebase, Breaking-Change-Sicht, Testnachweis) — er ist **„Goldstandard“**. Ergänzt werden soll nur ein **stabiler, maschinenlesbarer Ausgabe-Block**, den **`auto-debugger`** zum **sofortigen Umbau** von `TASK-PACKAGES.md` / Prompts nutzen kann, **ohne** die Prüflogik von `verify-plan` zu verwässern.

**Bekanntes Doku-Spannfeld:** In `verify-plan/SKILL.md` kann eine Formulierung stehen, die Reports unter `.claude/reports/` generell untersagt oder einschränkt; **`auto-debugger`** verlangt `VERIFY-PLAN-REPORT.md` unter `auto-debugger-runs/<run_id>/`. Das ist **kein fachlicher Widerspruch**, wenn im **verify-plan**-Skill eine **explizite Ausnahme** oder **Präzisierung** steht: *Orchestrator-Läufe* schreiben den Report an den **vom Orchestrator definierten Pfad**; die **Kernprüfung** des Skills bleibt gleich.

---

## 2. Ziele (SOLL)

### 2.1 `auto-debugger` (`.claude/agents/auto-debugger.md` + `.claude/skills/auto-debugger/SKILL.md`)

| ID | Ziel |
|----|------|
| **H1** | Nach vorliegendem **`VERIFY-PLAN-REPORT.md`** **Pflichtphase „Plan-Anpassung“**: `TASK-PACKAGES.md` **mutieren** (nicht nur Kommentar im Chat) — Korrekturen aus Verify übernehmen (Testpfade, Annahmen, Reihenfolge, BLOCKER/HW-Gates, verworfene Teilpakete). |
| **H2** | **Danach** `SPECIALIST-PROMPTS.md` **aktualisieren** (oder neu erzeugen): **ein Block pro Dev-Agent-Typ** (`server-dev`, `frontend-dev`, `esp32-dev`, … — nur was im Run vorkommt), jeweils **nur Pakete/Teile**, die zur Rolle gehören, **mit Querverweis** auf die **angepassten** PKG-Nummern und **gemeinsamer** Reihenfolge/Hinweise („nach PKG-01“, „blockiert bis data-testid da“, …). |
| **H3** | **Keine** Dev-Implementierung durch `auto-debugger` in dieser Phase — nur **Übergabeartefakte**; Produktcode weiterhin nur durch Spezialisten oder explizit separaten Implementierungsauftrag. |
| **H4** | Am Ende der Phase: kurze **Übergabe-Zusammenfassung** (Chat): welche PKG geändert, welche Dev-Rolle startet womit, was **BLOCKER** bleibt. |

### 2.2 `verify-plan` (`.claude/skills/verify-plan/SKILL.md`)

| ID | Ziel |
|----|------|
| **V1** | **Neuer normativer Ausgabe-Abschnitt** (z. B. `## OUTPUT FÜR ORCHESTRATOR (auto-debugger)` oder fester Markdown-Block), der **immer** gefüllt wird, wenn der Verify-Lauf im Kontext eines **auto-debugger**-Runs mit `TASK-PACKAGES.md` ausgeführt wird — **zusätzlich** zu bestehendem Chat-/Edit-Verhalten. |
| **V2** | Inhalt des Blocks (mindestens): **(a)** Tabellarische oder bullet **PKG → Delta** (was am Plan zu ändern ist: Pfade, Tests, Risiko, Reihenfolge), **(b)** **PKG → empfohlene Dev-Rolle**, **(c)** **Cross-PKG-Abhängigkeiten** (ein Satz pro Kante), **(d)** **BLOCKER** die Implementierung verzögern. Form so, dass `auto-debugger` den Block **1:1** zum Patchen von `TASK-PACKAGES.md` nutzen kann. |
| **V3** | **Kernprozess** des Skills (Lesen, Grep/Glob, Abgleich Plan↔Repo, Breaking-Change-Denken) **unverändert** lassen — nur **Output-Contract** und **Klärung Report-Pfad** für Orchestrator-Runs ergänzen. |
| **V4** | Expliziter Satz: Bei **auto-debugger**-Runs ist **`VERIFY-PLAN-REPORT.md`** unter `auto-debugger-runs/<run_id>/` **zulässig und erwünscht**; das widerspricht nicht der Qualitätsintention des Skills (kein „weiche Reporte irgendwo“, sondern **gebundener** Report-Pfad). |

### 2.3 Router / Profile (kurz)

| ID | Ziel |
|----|------|
| **R1** | `.claude/CLAUDE.md`, `AGENTS.md`, `.claude/reference/testing/agent_profiles.md`: **Kette** in einem Satz: `TASK-PACKAGES` → Verify-Inhalt → `VERIFY-PLAN-REPORT` → **Plan-Anpassung durch auto-debugger** → **SPECIALIST-PROMPTS** → Dev-Agenten. |

---

## 3. Nicht-Ziele

- Keine Änderung von **FastAPI-Routern**, **Vue-Komponenten**, **Firmware** in diesem Auftrag (nur `.claude/` und ggf. reine Doku unter `docs/` falls für Skill-Zitat nötig).
- **verify-plan** nicht zu einem „automatischen Code-Generator“ umbauen.
- **`forbidden`** typischer Steuerdateien nicht lockern (kein Produktcode ohne vorliegenden Verify-Report).

---

## 4. Methodik

1. IST lesen: `auto-debugger` Agent, `auto-debugger` Skill, `verify-plan` Skill, relevante Router-Zeilen.  
2. **verify-plan** zuerst um **Output-Contract + Report-Pfad-Klarstellung** erweitern (minimal-invasiv).  
3. **auto-debugger** um **Phase nach Verify** erweitern (Nummerierung mit incident/artefact konsistent halten).  
4. Optional: **Template-Abschnitt** in `VERIFY-PLAN-REPORT.md`-Dokumentation im Skill auto-debugger verweisen, damit Verify-Ausgabe und Report-Struktur zusammenpassen.

---

## 5. Akzeptanzkriterien (messbar)

1. In **`verify-plan/SKILL.md`** existiert der **neue Output-Block** mit klarer Überschrift; bestehende Prüfschritte sind **inhaltlich** die gleichen (kein Entfernen der Golden-Path-Logik).  
2. In **`auto-debugger`** Agent und/oder Skill steht **explizit**: Nach `VERIFY-PLAN-REPORT.md` → **`TASK-PACKAGES.md` anpassen** → **`SPECIALIST-PROMPTS.md` rollenweise** → dann Übergabe an Dev-Agenten.  
3. **Mindestens ein Beispiel** (als Kommentar oder kurzes Appendix-Fragment im Skill auto-debugger): Wie aus einem Verify-**Delta** ein PKG-Eintrag umgeschrieben wird (Before/After-Stil, 5–15 Zeilen).  
4. Router/Profil erwähnen die **vollständige Kette** inkl. Plan-Anpassung.  
5. **Kein** Treffer von Formulierungen, die **widersprüchlich** zu „Report nur Chat“ und gleichzeitig „Orchestrator-Report-Pfad“ sind — **eine** klare Regel muss stehen.

---

## 6. Agent-Prompt (Copy-Paste)

Du arbeitest im AutomationOne-Checkout auf Branch `auto-debugger/work`. Setze den Verbesserungsauftrag `auftrag-auto-debugger-post-verify-handoff-verifyplan-contract-2026-04-10.md` um:

1. Ergänze `.claude/skills/verify-plan/SKILL.md` um den **Orchestrator-Output-Contract** und die **Klarstellung zum Report-Pfad** unter `auto-debugger-runs/<run_id>/`, **ohne** die bestehende Verify-Logik zu ersetzen oder zu kürzen.  
2. Ergänze `.claude/agents/auto-debugger.md` und `.claude/skills/auto-debugger/SKILL.md` um die **Post-Verify-Phase**: Plan aus `VERIFY-PLAN-REPORT` in `TASK-PACKAGES.md` einarbeiten, danach `SPECIALIST-PROMPTS.md` pro Dev-Rolle kohärent und reihenfolgetreu.  
3. Aktualisiere Router/Profil kurz (Abschnitt Kette).  
4. Liefere eine **Änderungsliste** der bearbeiteten Dateien und einen **kurzen Testwalkthrough** (gedanklich): gegeben Verify-Report mit PKG-01-Testpfad-Korrektur → erwartete Änderung in TASK-PACKAGES → erwarteter Ausschnitt im Specialist-Prompt.

**Git:** nur `auto-debugger/work`, kein `push`, kein `force`.
