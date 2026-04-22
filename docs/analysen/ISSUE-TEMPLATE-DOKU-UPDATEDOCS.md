# ISSUE-TEMPLATE — DOKU / UPDATEDOCS

> Zweck: Dokumentation aktualisieren, Wissens-Drift schliessen, Referenzen nachziehen — **ohne** Produktcode-Aenderung.
> Basis: `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` Abschnitt 4.1/4.2 + §4.10 Scope-Guard.
> `code_change` in der Regel **false** (Doku-only); Ausnahme: wenn Skill-Definitionen oder Konfig-Schnipsel im Repo committed werden, dann `code_change=true`.
> Gate 1 (verify-plan) **soft** bei Doku-only, **hard** bei Skill-/Konfig-Edit. Gate 3 (Wissensintegration) **hard** immer — dieses Template ist selbst der Gate-3-Kanal.

---

**Titel-Schema (verbindlich):** `docs: [<Schicht|Doku-Bereich>] <Kurzaktion> — <Objekt>`
**Beispiele:** `docs: [Server] Error-Codes 5401..5405 in ERROR_CODES.md ergaenzen`, `docs: [Agent-Routing] CLAUDE.md-Router auf AUT-69 Live-Verify-Status aktualisieren`, `docs: [MQTT] MQTT_TOPICS.md um heartbeat-metrics-split-Topic erweitern`.
**<Schicht|Doku-Bereich>:** ESP32 | Server | MQTT | Frontend | Agent-Routing | Reference-API | Reference-Errors | Reference-Patterns | Reference-Testing | Rules | Skills.

---

## 0. Pflichtkopf
- **Owner:** <Person, Standard: Robin Herbig>
- **Ausfuehrer:** TM + Skill `/updatedocs` (Doku-only); bei Skill-/Konfig-Edits optional `server-dev` / `frontend-dev` / `esp32-dev` fuer Pattern-Konformitaet
- **Deadline:** <YYYY-MM-DD>
- **Done-Kriterium:** <1 Satz, messbar — z.B. "Datei `reference/errors/ERROR_CODES.md` enthaelt Eintraege 5401..5405 mit Spalten Code/Bedeutung/Remediation/Owner; Datei-Diff im Kommentar verlinkt; Router-Querverweise geprueft.">
- **Blocker:** <Keine | AUT-IDs — typisch: IMPL-Issue, dessen Aenderungen dokumentiert werden sollen, muss `Done` sein>

## 1. Issue-Typ
DOKU

## 2. Scope
- **In-Scope:** <konkrete Doku-Pfade, die geaendert werden — z.B. `.claude/reference/api/MQTT_TOPICS.md`, `.claude/CLAUDE.md`, `.claude/rules/rules.md`, `reference/errors/ERROR_CODES.md`, `docs/analysen/<datei>.md`>
- **Out-of-Scope:** <explizit ausgeschlossen — "Kein Produktcode", "Keine neuen Analyse-Berichte", "Keine Linear-Issue-Aenderungen ausser diesem">
- **Betroffene Doku-Kategorien** (aus `.claude/skills/updatedocs/SKILL.md` 11-Kategorien-Matrix): <API-Refs | Error-Codes | Patterns | Debugging | Testing | Security | TM-Workflow | Agents | Skills | Rules | CLAUDE.md-Router>
- **Abhaengigkeiten:**
  - `parent`: <AUT-ID oder None — typisch der IMPL-Issue, dessen Aenderungen dokumentiert werden>
  - `blocks`: <AUT-IDs oder None>
  - `blockedBy`: <AUT-IDs — typisch IMPL-Issue auf `Done`>
  - `relatedTo`: <AUT-IDs oder None — andere Doku-Issues derselben Doku-Serie>

## 3. DoR (Definition of Ready)
- [ ] Referenz-IMPL-Issue (oder Analyse-Quelle) ist identifiziert und `Done` / `Final`
- [ ] Ziel-Doku-Pfade konkret benannt (keine Pauschalangaben wie "irgendwo in reference/")
- [ ] Pro Ziel-Pfad: **Ist-Inhalt** und **Soll-Inhalt** jeweils in 1–3 Zeilen skizziert
- [ ] Referenz-Abgleich geplant gegen 11-Kategorien-Matrix aus `.claude/skills/updatedocs/SKILL.md`
- [ ] Folge-Issues-Check: Gibt es weitere Doku-Pfade ausserhalb dieses Scopes, die spaeter gezogen werden muessen?
- [ ] Gate-1-Entscheidung dokumentiert: verify-plan <an|aus>; bei reinen Text-Edits "aus" mit Begruendung; bei Skill-/Konfig-Edits "an" Pflicht

## 4. Arbeitskette
1. **Ist-Erhebung:** Fuer jeden Ziel-Pfad den aktuellen Stand lesen (absolute Pfade im Kommentar protokollieren mit Git-Commit-Hash).
2. **Soll-Entwurf:** Pro Pfad den Diff **im Issue-Kommentar** skizzieren (was wird geaendert, was bleibt, warum). Keine Frei-Form — Tabellen- oder Bullet-Form.
3. **(optional) verify-plan (Gate 1):** Bei Skill-/Konfig-Edits Pflicht; prueft dass angegebene Pfade/Symbole existieren und Patterns nicht brechen.
4. **`/updatedocs`-Skill ausfuehren:** Chirurgisch editieren (siehe Skill §2), Commit-Kette mit einer logischen Aenderung pro Commit, Conventional-Commits-Prefix `docs:`.
5. **Referenz-Abgleich:** Die 11-Kategorien-Matrix **durchgehen**, pruefen ob durch diese Aenderung andere Doku-Pfade mitziehen muessten (z.B. Error-Code-Neuanlage → Router-Querverweis in `reference/errors/INDEX.md`, falls vorhanden). Kaskade-Funde als Folge-Issues festhalten (§7).
6. **Abnahme:** Diff im Kommentar verlinken (Commit-URL oder `git diff`-Ausgabe bis 1500 Zeichen inline, sonst als Artefakt).

## 5. DoD (Definition of Done)
- [ ] Alle Ziel-Doku-Pfade sind geaendert — Commit-Hash(es) im Kommentar gelistet
- [ ] Pro geaenderter Datei: **1 Satz "was" + 1 Satz "warum"** im Kommentar (das ist die Pflicht-Begruendung aus `/updatedocs`-SKILL)
- [ ] Referenz-Abgleich (11 Kategorien) ist im Kommentar als Checkbox-Liste dokumentiert — jede Kategorie entweder "n/a" **oder** mit Ziel-Pfad markiert
- [ ] Folge-Doku-Issues (falls aus Scope ausgeschlossen) sind angelegt, AUT-IDs gelistet
- [ ] Build der Referenz-Dokumentation (falls Pipeline vorhanden) laeuft gruen — bei AutoOne aktuell keine Doc-Build-Pipeline, daher: Link-Check manuell im Kommentar bestaetigen ("keine broken Links in geaenderten Dateien")
- [ ] Linear-Status: `Done` erst nach Referenz-Abgleich + Folge-Issue-Anlage
- [ ] Kein Produktcode committed (bei `code_change=false`); sonst Type falsch gewaehlt → Scope-Guard §4.10

## 6. /updatedocs (Pflicht — dieser Issue ist der Ausfuehrungs-Issue)
- **Trigger:** immer — dieser Issue-Typ existiert, um `/updatedocs` verbindlich zu machen.
- **Pflicht-Checkliste:**
  - [ ] `/updatedocs` ausgefuehrt (Skill-Aufruf dokumentiert im Kommentar mit Uhrzeit)
  - [ ] Geaenderte Doku-Pfade vollstaendig gelistet
  - [ ] Pro Pfad: was geaendert + warum (1 Satz + 1 Satz)
  - [ ] 11-Kategorien-Referenz-Abgleich dokumentiert:
    1. [ ] `reference/api/` (MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS)
    2. [ ] `reference/errors/` (ERROR_CODES)
    3. [ ] `reference/patterns/` (COMMUNICATION_FLOWS, ARCHITECTURE_DEPENDENCIES)
    4. [ ] `reference/debugging/` (LOG_LOCATIONS, CI_PIPELINE, ACCESS_LIMITATIONS)
    5. [ ] `reference/testing/` (agent_profiles, flow_reference, TEST_WORKFLOW)
    6. [ ] `reference/security/` (PRODUCTION_CHECKLIST)
    7. [ ] `.claude/reference/TM_WORKFLOW.md`
    8. [ ] `.claude/CLAUDE.md` (Router)
    9. [ ] `.claude/agents/<agent>.md`
    10. [ ] `.claude/skills/<skill>/SKILL.md`
    11. [ ] `.claude/rules/rules.md` / `rules/<scoped>.md`
  - [ ] Bei Auslassung einer Kategorie: explizites "n/a: <Grund>" dokumentiert

## 7. Follow-up-Tracking
- **Verantwortlich:** <Person | TM>
- **Restpunkte:** <Liste offener Folge-Doku-Issues, falls Kaskade-Funde in §4.5 ergaben>
- **Check-Termin:** <YYYY-MM-DD — typisch naechste Sprint-Grenze, um Doku-Drift nachzumessen>
- **Drift-Re-Check:** <Link zur Router- oder Referenz-Datei, die periodisch gegen Linear-Status abgeglichen werden soll — siehe Analyse §5 Phase 2 Schritt 2.5>

---

### Typ-spezifische Pflichtfelder (DOKU)
- **Ist-/Soll-Paar** pro Ziel-Pfad — ohne dieses Paar ist der Scope nicht messbar.
- **11-Kategorien-Referenz-Abgleich** — Pflicht, nicht optional; auch wenn 10 von 11 `n/a` sind.
- **`code_change=false`** in der Regel — Ausnahme: Skill-/Konfig-Edits (SKILL.md, rules/*.md mit ausfuehrbaren Hinweisen, CLAUDE.md-Router).
- **Kein neuer Inhalt ohne Quelle** — jede Aenderung braucht eine Quellen-Referenz (AUT-ID, Commit-Hash, Analyse-Datei, Log-Evidenz).
- **Kein Produktcode-Commit** — sonst Scope-Guard-Verstoss; dann Split in DOKU + IMPL.

### Gate-Hinweise
- **Gate 0 (Intake):** Hard — Pflichtkopf, Ziel-Pfade, Ist-/Soll-Paar pro Pfad.
- **Gate 1 (verify-plan):** Soft bei reinen Text-Edits (Prosa, Tabellen); **Hard** bei Skill-/Konfig-Edits (SKILL.md, rules, CLAUDE.md-Router) — dort prueft verify-plan, dass die referenzierten Pfade und Symbole existieren.
- **Gate 2 (Tech-Verifikation):** n/a bei Doku-only; bei Skill-/Konfig-Edits = Linter/Schema-Check (`yamllint`, Skill-Frontmatter-Check).
- **Gate 3 (Wissensintegration):** **Hard, immer** — das ist der Zweck dieses Issue-Typs. Referenz-Abgleich und Folge-Issue-Anlage sind `Done`-Voraussetzung.

### Anti-Stuck-Hinweis (Bezug Analyse §4.12)
Bei Unklarheit ueber Ziel-Pfad oder Soll-Inhalt (Trigger T2 "Scope-Unsicherheit" oder T4 "Pfadkonflikt"): Run stoppen, BLOCKER-Kommentar mit "Versucht / Blockade / Naechster kleinster Schritt" anhaengen. Keine spekulativen Doku-Edits.
