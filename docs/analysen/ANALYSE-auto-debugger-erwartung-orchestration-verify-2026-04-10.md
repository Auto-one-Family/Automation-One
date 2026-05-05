# Analyse: auto-debugger — Erwartung vs. Ablauf, Verify-Integration, Folge-Orchestrierung

**Datum:** 2026-04-10  
**Typ:** Analyse (keine Produktiv-Code-Änderung; Ergebnis = Bericht + Text-/Strukturvorschläge für Agent/Skill/Router)  
**Repository:** AutomationOne (dieser Checkout)

---

## Executive Summary

Die Dokumentation zu **auto-debugger** beschreibt **„Orchestrierung“** korrekt als **Prozessführung und Artefakterzeugung** inklusive **Verify-Plan-Gate vor Implementierung**, nennt aber **nicht explizit**, wo ein Lauf im Modus **`artefact_improvement`** **standardmäßig endet** (oft: aktualisierte `target_docs` ± Pakete, **ohne** Dev-Umsetzung). Das Wort **„durchgängig“** in Router-Beispielen und die globale Regel **„OHNE PAUSE durcharbeiten“** in `.claude/CLAUDE.md` können mit **„alles bis Produktcode in einem Rutsch“** kollidieren — obwohl Steuerdatei und Agent **Implementierung ohne `VERIFY-PLAN-REPORT.md` verbieten**. Empfehlung: **„orchestrieren“ operationalisieren** (nummerierte Phasen + **„Standard-Ende“** pro `run_mode`), **Verify-Trigger schriftlich fixieren** (unmittelbar nach Erzeugung von `TASK-PACKAGES.md`, wenn Dev-Umsetzung avisiert ist), **Abschluss-Minicheckliste** gegen `done_criteria`/`forbidden`, und **Umgebungshinweis** (Cursor vs. Claude Code: kein magischer Subprozess — Verify = **verpflichtende Ausführung der verify-plan-Logik im gleichen Agent-Lauf**).

---

## Fehlerbild / Ursache

**Erwartung (typisch):** „Voll orchestriert“ wird als **End-to-End-Automatisierung** gelesen — inklusive **Implementierung** durch Dev-Agenten oder den Eindruck, der Assistent **führt alles selbstständig bis zum Code** aus.

**Steuerung / Soll-Pfad:** Im Modus **`artefact_improvement`** liefern Agent und Skill **zuerst** evidenzbasierte **Markdown-Ergänzungen**, optional **TASK-PACKAGES** und **SPECIALIST-PROMPTS**, und — **wenn Code folgen soll** — **`VERIFY-PLAN-REPORT.md`** nach Anwendung des **verify-plan**-Skill-**Inhalts**, **bevor** Umsetzung. Das ist **kein Regelverstoß**, sondern ein **Zielkonflikt** zwischen allgemeiner Orchestrierungs-Erwartung und dem **expliziten Gate-Modell**, verstärkt durch **Begriffsunschärfe** („Orchestrieren“ ≠ „sofort alles implementieren“).

**Ohne Schuldzuweisung:** Der Agent kann **korrekt** enden, wenn `done_criteria` nur Doku/Pakete/Vorbereitung Verify abdecken — der Nutzer empfindet das dennoch als **„abgebrochen“**, weil das **kommunizierte Ende der Kette** fehlt.

---

## IST — Kurzparaphrase aus Agent, Skill, Router

**Agent** (`.claude/agents/auto-debugger.md`): Koordination ohne Duplizieren von Fach-Debug-Logik; **`/verify-plan`-Gate** vor Implementierung aus Paketen; Modus **`artefact_improvement`**: IST einfangen, Lückenliste, additive Patches, **bei beabsichtigter Code-Änderung** TASK-PACKAGES + SPECIALIST-PROMPTS + VERIFY-PLAN-REPORT **vor** Dev-Agenten; Ausgabe unter `auto-debugger-runs/<run_id>/` wenn Pakete/Verify.

**Skill** (`.claude/skills/auto-debugger/SKILL.md`): Start über Steuerdatei; Abschnitt **„/verify-plan — Pflichtgate“**: Skill-Inhalt anwenden, Ergebnis in `VERIFY-PLAN-REPORT.md`; erst danach Dev-Agenten — **ausschließlich** auf `auto-debugger/work`.

**Router** (`.claude/CLAUDE.md`, `AGENTS.md`, `agent_profiles.md`): Verweis auf Steuerdatei, Work-Branch, **verify-plan vor Dev-Umsetzung**; Formulierung **„durchgaengigen Artefakt-Ordner“** ohne klare Trennung „Ende Analyse-Lauf“ vs. „Folge-Implementierungslauf“.

**verify-plan-Skill** (`.claude/skills/verify-plan/SKILL.md`): Reality-Check Plan↔Codebase; Ausgabe Chat oder Edit an Plan — für auto-debugger wird er **operativ** als **Inhalt für den Report `VERIFY-PLAN-REPORT.md`** genutzt (Konvention im auto-debugger-Agenten).

---

## Widersprüche / Spannungsfelder (Tabelle)

| Quelle | Aussage / Implikation | Spannung |
|--------|------------------------|----------|
| `CLAUDE.md` Basis-Regeln | „OHNE PAUSE durcharbeiten“, nie „Soll ich fortfahren?“ | Kann so gelesen werden, dass **auch** Verify+Implementierung **ohne sichtbaren Stop** durchlaufen müssen — obwohl Verify **Qualitätszeit** braucht und Implementierung oft **eigenes** Nutzer-Gate ist. |
| `CLAUDE.md` Orchestrator | „durchgaengigen Artefakt-Ordner“ | „Durchgängig“ = **Ordner-Kohärenz**, nicht zwingend **ein Chat bis Merge**. |
| Agent §2 `artefact_improvement` Schritt 5 | Pakete + Verify **nur wenn** „Code-Änderung aus dem Bericht folgen soll“ | **Optionalität** von Paketen ist klar; **Verify-Pflicht** nur **bedingt** — aber wenn Nutzer Pakete will, fehlt eine **explizite „danach sofort verify-plan ausführen“**-Zeile als **unübergehbare** Phase 5a. |
| Agent §1 `incident` Schritt 8–9 | Verify nach Paketen, keine Implementierung ohne Gate | Konsistent; dient als **Referenzmodell**, das für `artefact_improvement` **spiegelbar** sein sollte (nummeriert). |
| `agent_profiles.md` | verify-plan „Pflichtgate vor Implementierung aus Paketen“ | Klar für **Implementierung**; unklar, ob **SPECIALIST-PROMPTS** schon als „Delegation“ zählen (sollten erst **nach** Verify-Inhalt ausgeliefert werden, wenn Umsetzung folgt). |
| STEUER-VORLAGE | Kein `run_mode`-spezifisches „Lauf endet hier“ | Nutzer muss **implizit** aus Agent ableiten. |

---

## Lückenliste (gezielt zu V1–V5)

| Thema | Lücke |
|-------|--------|
| **V1** | **`artefact_improvement` — Standard-Ende** nirgends als ein Satz: „Typischer Abschluss = aktualisierte `target_docs`; Pakete/Verify nur bei avisierter Implementierung.“ |
| **V2** | **Wann verify-plan im selben Lauf zwingend:** nicht als **eindeutige Trigger-IF-Bedingung** formuliert (nur „vor Implementierung“). |
| **V2** | **„Skill anstoßen“** vs. **„Skill-Inhalt ausführen“:** In Cursor/Chat gibt es keinen separaten Prozess — das muss **explizit** heißen, um falsche Erwartung „Tool ruft Tool“ zu vermeiden. |
| **V3** | **Keine Pflicht-Minicheckliste** am Laufende gegen `done_criteria` / `forbidden` / Pfade / BLOCKER. |
| **V4** | **Folgelauf** nicht benannt: zweite Steuerdatei, `run_mode`-Wechsel, oder expliziter Chat-Schritt „jetzt Implementierung mit @SPECIALIST-PROMPTS nach VERIFY-PLAN-REPORT“. |
| **V5** | Branch/Bash-Regeln sind vorhanden; **Klarheit** könnte erhöht werden durch einen Satz „unverändert safety-critical; nur Lesbarkeit“. |

---

## Entscheidungstabelle (SOLL-Empfehlung, für spätere PR)

| `run_mode` | Standard-Endartefakte (ohne explizite Implementierungsfreigabe) | Verify (`VERIFY-PLAN-REPORT.md`) | Typischer Folgelauf |
|------------|-------------------------------------------------------------------|-----------------------------------|---------------------|
| `incident` | `INCIDENT-LAGEBILD`, `CORRELATION-MAP`, `TASK-PACKAGES`, `SPECIALIST-PROMPTS` | **Pflicht**, sobald `TASK-PACKAGES.md` **inhaltlich für Umsetzung** gedacht ist (immer im Incident-Standardpfad Schritt 8) | Nutzer startet Dev-Agenten mit Prompts **nach** vorliegendem Verify-Report |
| `artefact_improvement` | Aktualisierte `target_docs`; optional Lückenliste nur in Doku | **Pflicht**, genau dann, wenn **`TASK-PACKAGES.md`** (oder gleichwertige Paket-Sektion) **geschrieben** wird und **Dev-Umsetzung** laut `scope`/`done_criteria` vorgesehen oder nicht ausdrücklich ausgeschlossen ist | Wie links; bei **reiner Doku** ohne Pakete: **kein** Verify-Zwang |
| `both` | Kombination aus den beiden Pfaden gemäß `order` | Verify **nach dem Paket-Schritt** des jeweils Pakete erzeugenden Blocks, vor jeder Implementierung | Erst zweiten Modus-Teil fertigstellen, dann Verify vor Dev |

**Wichtig:** Diese Tabelle **lockert `forbidden` nicht** — sie verlangt nur **klare Trigger**, wann Verify **vor** jeglicher Umsetzung aus Paketen erfolgen muss.

---

## Empfehlung: Verify-Automatisierung (V2 — eindeutige Trigger)

**Entscheidung:** Verify ist **kein Hintergrund-Job** und **kein separater Slash-Command-Prozess** in Cursor. **Automatisierung** bedeutet hier: Der **auto-debugger** muss **im selben Lauf**, **unmittelbar** nach persistiertem `TASK-PACKAGES.md` (unter dem jeweiligen Incident- oder `auto-debugger-runs/`-Ordner), **sofern** die Pakete **implementierbare Aufgaben** beschreiben und die Steuerdatei **keine** reine Analyse/Doku ohne Folge-Code festlegt, die Prüflogik aus **`.claude/skills/verify-plan/SKILL.md`** anwenden und das Ergebnis in **`VERIFY-PLAN-REPORT.md`** schreiben — **bevor** SPECIALIST-PROMPTS an Dev-Agenten gegeben werden oder der Assistent selbst Produktcode ändert.

**Begründung:**

1. **Repo-Konvention:** Agent §1.3 und Skill §5 definieren bereits **Gate vor Implementierung**; die Lücke ist nur die **zeitliche und kausale Verknüpfung** („unmittelbar nach Paket-Datei“).
2. **Technische Realität Cursor / Claude Code:** Es gibt keinen garantierten **zweiten Agenten mit eigenem Lebenszyklus** nur für `/verify-plan`; zuverlässig ist **sequenzielle Ausführung im gleichen Kontext** nach Laden der Skill-Datei.
3. **Ohne Aufweichen von `forbidden`:** Ohne `VERIFY-PLAN-REPORT.md` **keine** Umsetzung — Verify-Trigger **verstärkt** das Gate, **schwächt** es nicht.

**Optionaler Zusatz-Trigger:** Steuerdatei enthält explizit `verify_plan: required` oder `implementation_follows: true` — dann Verify **auch** erzwingen, wenn Pakete minimal sind (reduziert Scope-Drift).

---

## Empfehlung: Folgelauf für Dev-Orchestrierung (V4)

1. **Benennung:** „**Implementierungslauf**“ — explizit im Chat oder durch **zweite Steuerdatei** (z. B. `run_mode: artefact_improvement` mit `scope: Umsetzung gemäß VERIFY-PLAN-REPORT …` und Verweis auf Pfade) **oder** Fortsetzung derselben Datei mit neuem Abschnitt „Phase 2: Umsetzung“ (wenn ihr ein Feld dafür einführt — sonst lieber **zweite Datei** für Klarheit).
2. **Reihenfolge:** `TASK-PACKAGES.md` → **`VERIFY-PLAN-REPORT.md`** → dann **SPECIALIST-PROMPTS** an Dev-Agenten (oder Copy-Paste durch Nutzer).
3. **Optimierte Prompt-Struktur:** Git-Pflichtblock unverändert an den Anfang; danach **Scope-Zitat aus Verify-Report**, **keine Erweiterung** des Paketumfangs ohne neuen Verify-Zyklus.

---

## Umgebung: Cursor vs. Claude Code (eine Zeile Abgrenzung)

**Cursor** und **Claude Code** können Inhalte aus `.claude/skills/` **lesen und befolgen**, aber es gibt **keine** garantierte automatische **Subagent-Invocation** nur durch Erwähnung von `/verify-plan`; realistisch ist **eine Session / ein Modellfluss**, in dem der auto-debugger **explizit** die verify-plan-Phasen abarbeitet und **`VERIFY-PLAN-REPORT.md`** schreibt — **Subagents/Task-Tool** (wo verfügbar) sind **optional** und dürfen in der Doku **nicht** als „immer parallel vollautomatisch“ beschrieben werden.

---

## Konkrete Textvorschläge (Copy-Paste-Blöcke)

### A) `.claude/agents/auto-debugger.md` — neuer Absatz unter „## 2. Modus `artefact_improvement`“ (vor „### 2.1 Pflichtsequenz“)

**Einordnung:** Operationalisierung **„orchestrieren“** + **Standard-Ende** (V1).

```markdown
### Bedeutung „orchestrieren“ (operational)

**Orchestrieren** = Ablauf und Artefakte gemäß Steuerdatei **in fester Reihenfolge** liefern — **nicht** automatisch „alle Dev-Pakete in einem Lauf implementieren“.

**Standard-Ende bei `artefact_improvement` (typisch):** aktualisierte `target_docs` mit Evidence/Lückenliste; **Ende des Standard-Laufs**, sofern **keine** `TASK-PACKAGES.md` für Umsetzung erzeugt wird.

**Wenn** `TASK-PACKAGES.md` geschrieben wird und **Implementierung** avisiert ist: **unmittelbar danach** verify-plan-Logik aus `.claude/skills/verify-plan/SKILL.md` anwenden und **`VERIFY-PLAN-REPORT.md`** im selben Run-Ordner schreiben — **vor** SPECIALIST-Prompts an Dev-Agenten oder eigener Produktcode-Änderung. *(Technisch: gleicher Agent-Kontext liest den Skill — kein separater Hintergrundprozess.)*
```

### B) `.claude/agents/auto-debugger.md` — neue Sektion „## 8. Abschluss-Checkliste (Pflicht)“ (vor Dateiende)

**Einordnung:** V3 Selbst-Check.

```markdown
## 8. Abschluss-Checkliste (vor „fertig“-Kommunikation)

Vor dem Beenden des strukturierten Laufs **explizit abhaken** (kurz im Chat oder als Abschnitt im letzten Artefakt):

- [ ] **`done_criteria`** aus der Steuerdatei: erfüllt oder Abweichung als **BLOCKER** dokumentiert
- [ ] **`forbidden`**: nicht verletzt (insb. kein Produktcode ohne vorliegendes Verify, falls Pakete/Umsetzung avisiert)
- [ ] **Pfade:** alle neuen/geänderten Artefakte mit repo-relativem Pfad genannt
- [ ] **Git:** wenn geschrieben wurde — Branch `auto-debugger/work` (oder Abweichung dokumentiert)
- [ ] **Folge:** wenn Implementierung offen — Nutzer informiert: **erst** nach `VERIFY-PLAN-REPORT.md` Dev-Agenten starten
```

### C) `.claude/skills/auto-debugger/SKILL.md` — Ergänzung nach Abschnitt „## 5. /verify-plan — Pflichtgate“ (als Unterabschnitt)

**Einordnung:** V2 Trigger + Cursor/Claude-Klarheit.

```markdown
### Trigger (wann im selben Lauf ausführen)

1. **Immer:** Wenn unter dem jeweiligen Report-Ordner eine **`TASK-PACKAGES.md`** existiert (neu oder wesentlich erweitert) und Pakete **implementierbare** Aufgaben enthalten — **direkt im Anschluss** die Schritte aus `verify-plan/SKILL.md` gegen die Codebase ausführen und **`VERIFY-PLAN-REPORT.md`** schreiben. **Keine** Delegation an `server-dev` / `frontend-dev` / … und **keine** Produktcode-Änderung durch diesen Agent davor.
2. **Nicht erforderlich:** Reine Doku-Erweiterung ohne Pakete und ohne avisierte Code-Umsetzung in `scope`/`done_criteria`.
3. **Umsetzungshinweis:** Ein Slash-Command `/verify-plan` ist **nicht** in jeder Umgebung verfügbar; der Auto-Debugger **lädt** `.claude/skills/verify-plan/SKILL.md` und **führt die Prüfung selbst aus** (gleicher Chat-/Session-Kontext).
```

### D) Optional — `.claude/CLAUDE.md` (Orchestrator-Abschnitt), ein Satz

**Einordnung:** Erwartungsmanagement vs. „OHNE PAUSE“.

```markdown
Hinweis: „Ohne Pause“ heisst **keine Rueckfrage-Stops** — **nicht** „Implementierung und Verify in einem ungesplitteten Nutzer-Erwartungsbild ohne sichtbares Gate“; Verify- und Dev-Phasen duerfen **inhaltlich** getrennt kommuniziert werden.
```

---

## Offene Fragen (max. 5)

1. Soll die Steuerdatei ein **explizites YAML-Feld** erhalten (`implementation_planned: true|false`, `verify: required|skipped`) — oder reichen **formulierte** `scope`/`done_criteria`?
2. Sollen **SPECIALIST-PROMPTS.md** bei avisierter Implementierung **erst nach Verify** geschrieben werden (strengeres Gate) oder **davor**, aber mit **prominenter Warnung** „nicht ausführen vor VERIFY-PLAN-REPORT“?
3. Ist **ein Kurz-Template** für `VERIFY-PLAN-REPORT.md` im Repo gewünscht (einheitliche Abschnitte), um Verify-Ergebnisse besser maschinell zu erkennen?
4. Wie soll **„wesentlich erweitert“** bei `TASK-PACKAGES.md` operationalisiert werden (nur menschlich, oder z. B. „neues Paket-Nummer-Range“)?
5. Soll **`both`** im Router **explizit** zwei **sichtbare Endzustände** haben (nach jedem Teil-Modus eine Mini-Checkliste)?

---

## Akzeptanzkriterien (Selbstprüfung dieses Berichts)

| Kriterium | Erfüllt |
|-----------|---------|
| Bericht unter `docs/analysen/ANALYSE-auto-debugger-erwartung-orchestration-verify-2026-04-10.md` | ja |
| Mindestens drei konkrete Text-Patch-Vorschläge mit Zieldatei | ja (A–C, optional D) |
| V2 Verify-Trigger eindeutig entschieden und begründet | ja (Abschnitt „Empfehlung: Verify-Automatisierung“) |
| Keine Empfehlung, `forbidden` / „kein Code ohne Verify“ aufzuweichen | ja |
