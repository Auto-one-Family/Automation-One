# Analyseauftrag — auto-debugger: Erwartung vs. Ablauf, Verify-Integration, Folge-Orchestrierung

**Datum:** 2026-04-10  
**Typ:** Analyse (keine Produktiv-Code-Änderung in diesem Dokument; Ergebnis = Bericht + konkrete Text-/Strukturvorschläge für Agent/Skill/Router)  
**Ziel-Repository:** AutomationOne-Checkout (dieses Repo)

---

## 1. Problemzusammenfassung (IST-Situation)

Bei einem Lauf mit **`run_mode: artefact_improvement`** und einer Steuerdatei, die **additive Doku**, Router-Abgleich und **optional** `TASK-PACKAGES` / `SPECIALIST-PROMPTS` vorsieht, **sowie** ein explizites Verbot der **Code-Umsetzung ohne vorheriges `/verify-plan` und `VERIFY-PLAN-REPORT.md`**, kam es zu einer **Erwartungslücke**:

- **Erwartung (Nutzer):** „Voll orchestriert“ = möglichst **durchgehende** Ausführung inkl. starker Automatisierung bis hin zu **Dev-Schritten** oder dem Eindruck, „alles zieht von selbst durch“.
- **Tatsächlicher Soll-Pfad laut Steuerung:** **Orchestrierung** in diesem Modus = **Prozess und Artefakte**: Steuerdatei lesen, Branch-Disziplin, Lückenliste, **evidenzbasierte** Markdown-Ergänzungen, konsistente Router-Texte, **Pakete/Prompts vorbereiten**, **Qualitätsgate vor Implementierung** respektieren — **nicht** paralleles Umbauen von Server/Frontend/Firmware in einem Schwung ohne Verify.

Es lag **kein Regelverstoß** des Agenten gegen die Steuerdatei vor, sondern ein **Zielkonflikt** zwischen dieser Erwartung und dem **vorgeschriebenen** Artefakt-/Gate-Modell, verstärkt durch ein **Begriffs-Missverständnis**: „Orchestrieren“ wurde als „alles ausführen“ gelesen; im Skill/Agent ist es näher an **Ablauf halten, Artefakte liefern, Delegation vorbereiten, Implementierung erst nach Gate**.

**Folge:** Der Lauf wirkte „abgebrochen“ oder unvollständig, obwohl der **korrekte** Abschluss für `artefact_improvement` bei **Doku + Paketen + (vorbereitetem) Verify** liegen kann — nicht bei „alle Pakete sofort implementiert“.

---

## 2. Ziel dieses Analyseauftrags

1. **IST-Audit:** `.claude/agents/auto-debugger.md`, `.claude/skills/auto-debugger/SKILL.md` und relevante Router-Stellen (z. B. `.claude/CLAUDE.md`, `AGENTS.md`, `.claude/reference/testing/agent_profiles.md`) auf **Klärbarkeit** der Begriffe und **Ende der Standardkette** pro `run_mode` prüfen.
2. **Lückenliste:** Wo fehlt explizit:  
   - `artefact_improvement` **endet standardmäßig** bei welchem Artefakt?  
   - Wann ist **`/verify-plan`** Pflicht vs. optional vs. **nur Platzhalter**?  
   - Wie ist der **Folgelauf** benannt (zweite Steuerdatei, `run_mode: both`, expliziter Chat-Schritt)?
3. **Verbesserungsvorschläge (nur Konzept im Bericht):** Konkrete Formulierungs-Patches (Absätze, Aufzählungen, Entscheidungsbaum) so, dass:
   - der Agent **nachvollziehbar** den **`/verify-plan`-Skill anstößt oder ausführt**, sobald die Bedingungen dafür erfüllt sind (siehe Anforderung 4),
   - der Agent **seinen Auftrag** (Steuerdatei + Runbook) **am Ende des Laufs gegenprüft** (Kurz-Checkliste gegen `done_criteria` und `forbidden`),
   - **Dev-Agenten** erst **nach** klar definiertem Verify-/Gate-Schritt adressiert werden („optimiert“ = zielgerichtete SPECIALIST-PROMPTS, klarer Scope, kein Scope-Drift).
4. **Umgebung:** Ein Satz zur Abgrenzung **Cursor** vs. **Claude Code** (Subagents/Task-Tool), ohne externe Repos zu referenzieren — nur: welche Automatisierung ist in welcher Umgebung **realistisch**, damit die Doku **keine falschen Erwartungen** weckt.

---

## 3. Anforderungen an die Verbesserung (SOLL-Richtung, nach Analyse umzusetzen)

Die folgenden Punkte sind **Zielbilder** für spätere PRs auf Agent/Skill — **Struktur beibehalten**, nur **schärfen und optimieren**:

| ID | Anforderung |
|----|----------------|
| **V1** | Begriff **„orchestrieren“** im Agent/Skill **operationalisieren**: z. B. nummerierte Phasen pro `run_mode` mit explizitem **„Lauf endet hier (Standard)“** für `artefact_improvement`. |
| **V2** | **`/verify-plan`:** Definiere im Skill, **wann** der Agent den Skill **immer** anstoßen soll (z. B. sobald `TASK-PACKAGES.md` existiert und Implementierung avisiert ist; oder am Ende jedes Artefakt-Laufs mit Paketen — **entscheide** anhand Repo-Konvention und dokumentiere im Bericht). Ziel: Nutzer erwartet **automatische** Verify-Ausführung, **ohne** das Gate fachlich zu unterlaufen (keine Implementierung vor abgeschlossenem Verify-Report). |
| **V3** | **Selbst-Check vor Abschluss:** Pflicht-Minicheckliste im Agent (3–7 Bulletpoints): `done_criteria` abgehakt, `forbidden` nicht verletzt, Artefakt-Pfade geschrieben, BLOCKER dokumentiert falls nötig. |
| **V4** | **Dev-Delegation:** Klarstellung: SPECIALIST-PROMPTS/Dev-Agenten **erst** nach Verify **oder** in einem **explizit** als Implementierungslauf markierten Schritt (zweite Steuerdatei / anderer `run_mode` / explizite Anweisung in Steuerdatei). Vorschlag für **optimierte** Prompt-Struktur (Git-Pflichtblock bleibt). |
| **V5** | **Kein Bruch** der bestehenden Sicherheitslogik: Branch `auto-debugger/work`, kein Push/Force, Bash nur eingeschränkt — unverändert dokumentieren, nur Klarheit erhöhen. |

---

## 4. Nicht-Ziele

- Die **Steuerdatei-Semantik** von `artefact_improvement` nicht stillschweigend in „immer voll implementieren“ umbiegen.
- **Breaking Changes** an REST/MQTT/WS/DB aus diesem Auftrag.
- Große Neuschreibung des Skills — **inkrementelle**, präzise Text-Ergänzungen und ggf. eine **Entscheidungstabelle** `run_mode → Endartefakte → Verify → Folgelauf`.

---

## 5. Methodik

1. Dateien vollständig lesen (Agent, Skill, Router-Auszüge).  
2. Widersprüche zwischen **Steuer-Vorlage**, **Skill** und **Agent** tabellieren.  
3. Szenario durchspielen: **nur** `artefact_improvement` — erwarteter Output nach jeder Phase; dann Szenario **mit** TASK-PACKAGES — wo muss Verify **automatisch** folgen.  
4. Ergebnis als **Markdown-Bericht** ablegen (Pflicht, siehe unten).

---

## 6. Lieferobjekt (Pflicht)

**Pfad (Vorschlag):**  
`docs/analysen/ANALYSE-auto-debugger-erwartung-orchestration-verify-2026-04-10.md`

**Mindestinhalt:**

- Executive Summary (1 Absatz)  
- Abschnitt „Fehlerbild / Ursache“ (Erwartung vs. Steuerung, ohne Schuldzuweisung)  
- IST-Zitate oder Paraphrase aus Agent/Skill (kurz)  
- Lückenliste + **konkrete** Textvorschläge (Copy-Paste-fähige Blöcke für Agent.md und SKILL.md getrennt)  
- Empfehlung **Verify-Automatisierung** (exakte Trigger-Bedingungen)  
- Empfehlung **Folgelauf** für Dev-Orchestrierung  
- Offene Fragen (max. 5)

---

## 7. Akzeptanzkriterien

1. Bericht unter dem genannten (oder begründet abweichenden) Pfad **existiert** und ist **ohne** externe Repo-Verweise verständlich.  
2. Mindestens **drei** konkrete Text-Patch-Vorschläge (mit Zieldatei und Einordnung Before/After oder einzufügender Absatz).  
3. **V2** (Verify-Trigger) ist **eindeutig** entschieden und begründet (auch wenn die Begründung „nur manuell möglich in Umgebung X“ ist).  
4. Keine Empfehlung, die **`forbidden`** typischer Steuerdateien (keine Implementierung ohne Verify) **aufweicht**.

---

## Agent-Prompt (Copy-Paste, Auto-one-Checkout)

Du arbeitest in diesem Repository. Führe den **Analyseauftrag** `analyseauftrag-auto-debugger-erwartung-orchestration-verify-2026-04-10.md` aus: lies Agent `auto-debugger`, Skill `auto-debugger`, relevante Router-Stellen; analysiere Erwartung vs. `artefact_improvement`; liefere den Bericht unter `docs/analysen/ANALYSE-auto-debugger-erwartung-orchestration-verify-2026-04-10.md` mit den geforderten Abschnitten und konkreten Patch-Vorschlägen. Keine Produktiv-Code-Änderung außerhalb des Berichts, es sei denn Robin weist explizit eine Umsetzungs-PR an.
