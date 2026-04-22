# PILOT-ISSUE I (IMPLEMENTIERUNG) — /updatedocs-Akzeptanzkriterium Backport

> **Zweck dieses Dokuments:** Pilotierung des `ISSUE-TEMPLATE-IMPLEMENTIERUNG.md` an einem realen Prozess-Fix (Phase-1-Schritt 1.5 aus dem Analysebericht). Dies ist ein **Prozess-Issue mit Code-Wirkung**, weil es Linear-Issue-Kommentare als "Kommentar-Edits" erzeugt und damit den Kanon der gelebten Akzeptanzkriterien aendert.
> **Dieser Entwurf** ist als Vorlage fuer ein neues Linear-Issue gedacht (noch nicht in Linear angelegt — erst nach Robin-Freigabe).
> **Basis-Template:** `docs/analysen/ISSUE-TEMPLATE-IMPLEMENTIERUNG.md`.
> **Analyse-Bericht-Bezug:** `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` §5 Phase 1 Schritt 1.5, §4.5 Gate 3, P-10.

---

**Vorgeschlagener Linear-Titel:** `feat: [Prozess] /updatedocs-Akzeptanzkriterium in aktive Backlog-Issues einpflegen`

---

## Intake-Block (V2 §4.8)

```
Intake:
- Problemklasse   = Drift (Workflow-Regel existiert, ist aber in Issue-Bodies nicht verankert)
- Impactklasse    = P1 (Gate-3-Luecke P-10 — Wissensintegration nicht nachweisbar)
- Scopeklasse     = Single-Layer (nur Linear-Issue-Kommentare via MCP)
- Artefaktlage    = Evidenz vorhanden (Analyse-Bericht §5 Phase 1; AUT-26/42/54 Stichproben)
- Ausfuehrungsmodus = IMPLEMENTIERUNG
- Containerwahl   = Einzel-Issue

Begruendung: 1 klarer Fix, 1 Schicht (Linear-MCP), <= 1 Agentenlauf (3-SP-Paket), keine
Schema-Aenderung. Matrix §4.9 -> Einzel-Issue.
```

---

## 0. Pflichtkopf
- **Owner:** Robin Herbig
- **Ausfuehrer:** TM (Operator-Rolle, nutzt Linear-MCP; kein Dev-Agent noetig, da kein Produktcode)
- **Deadline:** 2026-05-01 (W18-Ende)
- **Done-Kriterium:** Alle aktiven Backlog-Issues mit `priority <= P1` und Status ∈ {Backlog, Ready, In Progress} (Stichtag 2026-04-28) haben einen TM-Kommentar mit `- [ ] /updatedocs ausgefuehrt` + 11-Kategorien-Abgleich-Block; Liste der behandelten Issues als Audit-Trail in `.technical-manager/reports/BACKPORT-updatedocs-2026-05-01.md`.
- **Blocker:** Keine. (AUT-69 In-Review-Status ist unabhaengig, Backport-Kommentar bleibt additive Meta-Notiz.)

## 1. Issue-Typ
IMPLEMENTIERUNG

## 2. Scope
- **In-Scope:**
  - Linear-Issues im Projekt `MQTT-Transport & Recovery Hardening (INC EA5484)` mit priority ∈ {Urgent, High} und Status ∈ {Backlog, Ready, In Progress} — vermutlich AUT-55, AUT-56, AUT-57, AUT-60, AUT-71, AUT-72 (≈ 6 Issues).
  - Linear-Issues im Projekt `Testfeld Live-System 2 — Klima-Forensik (INC 2026-04-22)` mit priority ∈ {Urgent, High} — AUT-109, AUT-110, AUT-111, AUT-112, AUT-113 (≈ 5 Issues).
  - Audit-Trail-Datei `.technical-manager/reports/BACKPORT-updatedocs-2026-05-01.md` (neu).
- **Out-of-Scope:**
  - Keine Aenderung an abgeschlossenen Issues (`Done`, `Cancelled`) — die bleiben historisch.
  - Keine Aenderung am Issue-Body (nur Kommentar, um Audit-Pfad klein zu halten).
  - Keine Aenderung an `reference/**` oder `CLAUDE.md` — das passiert spaeter via Gate 3.
  - Keine Touches an P2/P3-Issues (zu viel, zu wenig Impact).
- **Betroffene Schichten:** Prozess / Tool (Linear-MCP).
- **Abhaengigkeiten:**
  - `parent`: None
  - `blocks`: None
  - `blockedBy`: None
  - `relatedTo`: AUT-68 (Praezedenz fuer Scope-Drift), AUT-69 (aktueller In-Review-Pfad), AUT-110/111 (Beispiel-Empfaenger der neuen Akzeptanzkriterien)

## 3. DoR (Definition of Ready)
- [x] Scope klar, Single-Layer (nur Linear-Kommentare)
- [x] Referenz-Analyse liegt vor: `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` §5 Phase 1 Schritt 1.5
- [x] Pattern-Referenz genannt: `.claude/skills/updatedocs/SKILL.md` (11-Kategorien-Matrix) und Phase-1-Migrationstabelle
- [x] Agent-Zuweisung: TM (nutzt Linear-MCP); kein Dev-Agent, weil kein Produktcode
- [x] verify-plan-Gate definiert: `B-BACK-01..03` (B-BACK-01 = Liste der Ziel-Issues existiert mit aktuellem Status; B-BACK-02 = Kommentar-Template ist formatkonform zu bestehenden TM-Kommentaren; B-BACK-03 = Audit-Trail-Datei-Pfad + Struktur ist definiert)
- [x] Test-Plan skizziert: Stichproben-Check auf 3 zufaellig gewaehlten Ziel-Issues, dass der Kommentar gerendert wird und die Checkboxes klickbar sind
- [x] Risiko-Klasse gesetzt: `low` (additives Kommentar-Attachment, kein Body-Edit, Rollback = Kommentar loeschen)
- [x] SP-Schaetzung: 3 SP (≤ 15 Issues × 10 Min Kommentar-Erzeugung + Audit-Trail)
- [x] `code_change=true` — Linear-Daten sind Repo-extern, aber der Audit-Trail kommt ins Repo, daher Gate-1+2+3 aktiv

## 4. Arbeitskette
1. **Analyse-Rueckblick:** §5 Phase 1 Schritt 1.5 liefert die Rahmenregel ("max. 20 Issues, Ein-Kommentar-Patch"); Pilot setzt die strengere Variante um (nur P0/P1).
2. **Paket-Zerlegung:** Commit-Grenze = 1 Commit fuer Audit-Trail-Datei; Kommentare an Linear werden **atomar** per Issue gesetzt (kein Batch-Overwrite), Kommentar-Text aus einer festen Vorlage.
3. **verify-plan (Gate 1, hard):** Skill `verify-plan` pruefen:
   - Liste der Ziel-Issues gegen Linear-Projekt-IDs verifizieren (Projekt-IDs stehen in TECHNICAL_MANAGER.md §Offene Epics).
   - Kommentar-Vorlage: 6–10 Zeilen, formatkonform zu bisherigen TM-Delta-Kommentaren (Beispiel AUT-54 "verify-plan Delta 2026-04-17").
   - Audit-Trail-Dateipfad existiert nicht doppelt (`.technical-manager/reports/BACKPORT-updatedocs-2026-05-01.md` ist neu).
4. **Umsetzung:**
   - TM-Aktion 1: `list_issues` pro Ziel-Projekt filtern auf (priority ≤ P1) ∧ (state ∈ {Backlog, Unstarted, Started}).
   - TM-Aktion 2: Pro Ziel-Issue `save_comment` mit der Vorlage (siehe unten).
   - TM-Aktion 3: Audit-Trail-Datei schreiben (AUT-ID, Zeitstempel, Kommentar-URL-ID).
5. **Build-Verifikation (Gate 2, hard):**
   - `pytest`, `ruff`, `pio run`, `npm run build` — nicht zutreffend, kein Produktcode.
   - Ersatz-Gate-2-Check: Stichproben-URL fuer 3 Kommentare oeffnet in Linear korrekt; Checkboxes rendern; Kommentar-Laenge < 1500 Zeichen (Policy aus §5 Phase 2 Schritt 2.4).
6. **Commit-Kette:** `docs(process): BACKPORT-updatedocs audit trail 2026-05-01` (1 Commit, genau eine logische Aenderung).
7. **Wissensintegration (Gate 3, hard):**
   - `/updatedocs` ausfuehren: Phase-1-Schritt 1.5 im Analyse-Bericht **von "offen" auf "pilotiert"** markieren → das ist der einzige Doku-Pfad, der durch dieses IMPL-Issue faktisch geaendert wird.
   - Folge-Issue anlegen: DOKU-Issue fuer `.claude/reference/TM_WORKFLOW.md` v2.0 → v2.1 (ist bereits als Phase-1-Schritt 1.2 vorgesehen, daher nur Cross-Link).

**Kommentar-Vorlage (zur Einpflegung in jedes Ziel-Issue):**
```
### Backport /updatedocs-Akzeptanzkriterium (TM, 2026-05-01)

Ergaenze DoD um folgende Zeile:
- [ ] `/updatedocs` ausgefuehrt — 11-Kategorien-Referenz-Abgleich dokumentiert; geaenderte Doku-Pfade mit "was + warum" gelistet.

Bezug: Analyse §4.5 Gate 3 + §5 Phase 1 Schritt 1.5.
Keine weiteren Aenderungen an diesem Issue noetig — Template-Upgrade gilt ab naechstem Pick.
```

## 5. DoD (Definition of Done)
- [ ] Audit-Trail-Datei `.technical-manager/reports/BACKPORT-updatedocs-2026-05-01.md` existiert mit: (a) Ziel-Issue-Liste, (b) Kommentar-URL-ID pro Issue, (c) Stichproben-Check-Ergebnis (3 von 3 Issues rendern korrekt)
- [ ] Commit-Hash im Kommentar dieses Pilot-Issues
- [ ] Build/Lint/Test: n/a — Ersatzcheck Stichproben-URL-Render dokumentiert
- [ ] Risiko-Klassen-Extras: `low` → kein 4h-Live-Test noetig; Rollback-Plan dokumentiert (Kommentar-Loeschen pro Issue via MCP `delete_comment`)
- [ ] `/updatedocs` ausgefuehrt (siehe Block 6)
- [ ] Kommentar-Laenge-Verletzung: 0 (Vorlage ist 6 Zeilen)
- [ ] Linear-Status: `Done` nach allen Gates
- [ ] Statusnachweis: Kommentar im Pilot-Issue mit Audit-Trail-Link + Stichproben-URLs

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=true` (Audit-Trail-Datei committed)
- **Pflicht-Checkliste:**
  - [ ] `/updatedocs` ausgefuehrt mit Beschreibung "Phase 1 Schritt 1.5 pilotiert, Audit-Trail angelegt"
  - [ ] Aktualisierte Doku-Pfade:
    - `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` §5 Phase 1 Schritt 1.5 — Status-Marker ergaenzt
    - `.technical-manager/reports/BACKPORT-updatedocs-2026-05-01.md` — neu
  - [ ] Pro Pfad: was + warum — dokumentiert in Kommentar
  - [ ] 11-Kategorien-Referenz-Abgleich:
    1. API-Refs = n/a
    2. Error-Codes = n/a
    3. Patterns = n/a
    4. Debugging = n/a
    5. Testing = n/a
    6. Security = n/a
    7. TM_WORKFLOW.md = n/a in diesem Issue (DOKU-Folge-Issue uebernimmt)
    8. CLAUDE.md Router = n/a
    9. agents/* = n/a
    10. skills/updatedocs/SKILL.md = n/a (unveraendert, nur referenziert)
    11. rules/rules.md = n/a

## 7. Follow-up-Tracking
- **Verantwortlich:** TM
- **Restpunkte:**
  - DOKU-Issue fuer TM_WORKFLOW.md v2.0 → v2.1 (siehe Phase 1 Schritt 1.2)
  - VERIFIKATION-Issue "Router-Sync-Check nach Backport" (pruefen ob Kommentare in naechsten Issue-Picks auch wirklich gezogen werden)
- **Check-Termin:** 2026-05-08 (1 Woche nach Deadline, in Sprint-Retro pruefen ob Dev-Agent-Team das Kriterium tatsaechlich benutzt)
- **Monitoring-Follow-up:** Metrik "Done-Issues ohne /updatedocs-Nachweis" aus §7 des Analyse-Berichts; Ziel: < 30 % nach Phase 1, < 5 % nach Phase 2

---

### Anti-Stuck-Selbstcheck (V2 §4.12)
- T1 Loop-Signal: Nicht erwartet (deterministische MCP-Kommentar-Erzeugung).
- T2 Scope-Unsicherheit: Wenn Ziel-Issue-Liste > 15 wird (mehr als Scope vorgesehen), stoppen und mit TM re-scopen.
- T3 Zeitgrenze: 45 Min → Zwischenstand (mindestens 5 Kommentare gesetzt + Audit-Trail-Kopf vorhanden).
- T4 Pfadkonflikt: Wenn `.technical-manager/reports/` nicht existiert (Verzeichnis fehlt), stoppen und Verzeichnis-Anlage separat klaeren — nicht stillschweigend `mkdir` anstossen.

### Pilot-Lernziele
- Ist die `code_change=true`-Klassifikation bei Prozess-Issues mit Audit-Trail-Datei angemessen, oder sollten wir eine Zwischenkategorie `meta_change` einfuehren?
- Werden die Gate-2-Ersatzchecks (Stichproben-URL-Render) als ausreichend akzeptiert, oder braucht die Policy eine haertere Definition?
- Wie lange dauert der Backport wirklich (Ziel: < 3 SP ≙ ≈ 2h Arbeitszeit)?
- Welche Issues werden **nicht** vom Backport erfasst (Done, P2/P3) und wie erfassen wir deren Drift-Anteil?
