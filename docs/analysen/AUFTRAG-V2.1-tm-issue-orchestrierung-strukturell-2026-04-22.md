# ANALYSE-AUFTRAG V2.1: TM-Issue-Orchestrierung Linear + Agenten + AutoOne

**Owner:** Robin Herbig
**Ausfuehrer:** Technical Manager
**Deadline:** 2026-04-26
**Status:** Final (V2.1 — strukturell geschaerft 2026-04-22)
**Typ:** ANALYSE (kein grosser Codeumbau)
**Aenderung vs. V2:** Reine Strukturverbesserung. Inhaltlich identisch, aber Redundanzen konsolidiert, Pipeline visualisiert, Gates/Engines klar getrennt. Siehe §11 „Diff zu V2".

---

## 1. Zielbild & Direktive (konsolidiert)

### 1.1 Was konkret optimiert wird

Nicht „allgemein der Prozess", sondern der **Issue-Intake und Ausfuehrungsfluss** fuer AutoOne-Agentenarbeit:

- Robin meldet ein Problem per Chat.
- TM leitet daraus **entweder** ein Einzel-Issue **oder** ein Projekt mit sauberem Sub-Issue-Schnitt ab.
- Jeder Task durchlaeuft denselben Workflow (DoR → Gates → DoD → `updatedocs` → Follow-up).
- Agenten bleiben im Scope, bleiben nicht stecken, liefern verwertbare Ergebnisse.

### 1.2 Nicht verhandelbare Reihenfolge

```
Analyse
   →  Plan-Fabrik (TM eroeffnet Plan-Issue; Spezialagenten erstellen Planbausteine iterativ; TM konsolidiert)
   →  verify-plan (Gate G1 auf dem konsolidierten Plan)
   →  Implementierung (durch dieselben Dev-Agenten, die die Planbausteine erstellt haben — Kontinuitaetspflicht §5.4)
   →  Verifikation
   →  updatedocs
```

- Ohne abgeschlossene Analyse: **kein** Implementierungsplan.
- Ohne konsolidierten Plan: **kein** `verify-plan`.
- Ohne `verify-plan`-Pass auf Master-Plan: **keine** Code-Aenderung.
- Ohne `updatedocs`: **kein** Done bei Code-Aenderung.

Der Plan ist kein Nebenprodukt, sondern ein eigenes Linear-Issue mit eigenem Lebenszyklus (Typ `IMPLEMENTIERUNGSPLAN`, Container fuer Planarbeit). I-Issues werden erst angelegt/entblockt, wenn der Plan G1 passiert hat. Siehe §4 G1 und §5.4.

### 1.3 Rolle des TM

Der TM ist **Orchestrator**, nicht Ticket-Schreiber. Er
1. uebersetzt Problemberichte in analysierbare Fragestellungen,
2. sichert, dass Agenten auf echtem Code-Kontext planen,
3. erzwingt das `verify-plan`-Gate **auf dem Plan** (nicht erst auf fertigem Code),
4. fuehrt Nachverfolgung bis „sauber im System integriert" inkl. Doku.

### 1.4 Glossar (einheitliche Kuerzel)

| Kuerzel | Bedeutung |
|--------|-----------|
| **A / I / V / D** | Issue-Modi: **A**nalyse / **I**mplementierung / **V**erifikation / **D**oku |
| **DoR / DoD** | Definition of Ready / Done |
| **G0..G3** | Gates 0..3 (siehe §4) |
| **Container** | Einzel-Issue oder Linear-Projekt |
| **Scope-Guard** | Regel: ein primaerer Outcome-Typ pro Issue |

---

## 2. Pipeline End-to-End (visueller Anker)

```
   Robin-Chatmeldung
          │
          ▼
┌─────────────────────┐
│ 3. INTAKE-ENGINE    │   (§3)
│  Klassifikation 6D  │
│  Container-Entsch.  │
│  Scope-Guard        │
│  Duplikat-Check     │
└─────────┬───────────┘
          │  (→ A-Issue + ggf. Projekt)
          ▼
┌─────────────────────┐
│  G0  Intake-DoR     │   (§4)  Hard-Gate
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  ANALYSE-Issue      │   Agent: *-debug / meta-analyst
│  (nur IST + Ursachen│
│   + SOLL-Zielbild)  │
└─────────┬───────────┘
          │  (Ergebnis → Plan-Fabrik)
          ▼
┌─────────────────────┐
│  PLAN-Issue         │   (§5.4)  Container fuer Planarbeit
│  TM eroeffnet       │   Spezialagenten (esp32-dev / server-dev /
│  Spezialagenten     │   mqtt-dev / frontend-dev) liefern Planbausteine
│  iterieren          │   iterativ bis: Reihenfolge klar, Deps klar,
│  TM konsolidiert    │   Tests klar, keine Parallel-Patterns.
└─────────┬───────────┘
          │  (Master-Plan)
          ▼
┌─────────────────────┐
│  G1  verify-plan    │   Hard-Gate auf Master-PLAN (letzter Plan-Schritt)
│  (Pfade/Contracts/  │   verify-plan verbessert den Plan final
│   Tests/Risiken)    │
└─────────┬───────────┘
          │  pass
          ▼
┌─────────────────────┐
│  IMPL-Issue(s)      │   Agent: *-dev  (Prompt-Contract §5.2)
│  dieselben Agenten  │   Kontinuitaetspflicht §5.4
│  wie im Plan        │   Branch auto-debugger/work (Incident)
│                     │   Anti-Stuck §5.3
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  G2  Tech-Verify    │   Agent: test-log-analyst / hardware-test
│  (Build/Test/Live)  │
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│  G3  Wissens-Integ. │   TM + updatedocs-Skill
│  (updatedocs +      │
│   Follow-up-Issues) │
└─────────┬───────────┘
          ▼
        DONE
```

Jeder vertikale Schritt entspricht genau einer Station in §3–§5.

---

## 3. Intake-Engine (Chat → Ticket)

Ohne vollstaendigen Intake kein Ticket. Jede Robin-Chatmeldung wird in diese 6 Dimensionen zerlegt.

### 3.1 Klassifikation (6 Dimensionen)

| # | Dimension | Werte |
|---|-----------|-------|
| 1 | **Problemklasse** | Bug · Drift · Incident · Refactor · Feature · Verifikation · Doku |
| 2 | **Impactklasse** | P0 · P1 · P2 · P3 |
| 3 | **Scopeklasse** | Single-Layer · Cross-Layer · Incident-Cluster |
| 4 | **Artefaktlage** | Evidenz vorhanden? (Logs, Report, Repro, Screenshots, Codepfade) |
| 5 | **Ausfuehrungsmodus** | **A** Analyse · **I** Implementierung · **V** Verifikation · **D** Doku |
| 6 | **Container** | Einzel-Issue · Linear-Projekt |

Liefert Robin einen fertigen Analysebericht: Start bei Schritt 5 (Modus) + Evidenz-Validierung.

### 3.2 Entscheidungsmatrix — Issue vs. Projekt

**Einzel-Issue**, wenn alle erfuellt:
- ein klares Problem,
- max. 1 harte Abhaengigkeit,
- max. 1 Schicht oder klein begruendetes Cross-Layer,
- in ≤ 1 Agentenlauf lieferbar.

**Projekt**, wenn mindestens eins:
- mehrere Root-Causes,
- > 3 zusammenhaengende Arbeitspakete,
- Incident-Charakter,
- Pflichtsequenz A → I → V ueber mehrere Issues.

**Unklar** → zuerst **A-Issue**, danach Container-Entscheidung.

### 3.3 Scope-Guard (Anti-Mega-Issue)

- Ein Issue hat **genau einen** primaeren Outcome-Typ (A · I · V · D).
- Kein Mix aus Analyse + Umsetzung + Live-Verifikation in einem Ticket.
- Bei Mischbedarf: automatisch splitten in A-/I-/V-/D-Issues.
- Jede Split-Entscheidung wird im Parent-Issue dokumentiert.
- Jeder **I-Issue** referenziert ein abgeschlossenes A-Issue.
- Jeder **V-Issue** referenziert einen verifizierten Implementierungsplan (G1-pass).

### 3.4 Konsistenz- und Duplikat-Check (Pflicht vor G1)

Vor jedem Implementierungsplan explizit pruefen:

- Gibt es bereits ein bestehendes Pattern im Ziel-Layer?
- Gibt es offene/erledigte Issues mit gleicher Ursache?
- Wuerde der neue Fix ein Parallel-Pattern einfuehren?

Wenn ja: **keinen** neuen Sonderpfad bauen → bestehenden Pfad erweitern, Relationen (`parent`, `blocks`, `relatedTo`) sauber setzen. Ziel: **ein konsistenter Systempfad**, nicht „schnell ein weiterer Fix".

---

## 4. Gate-Modell (4 Hard-Gates)

Jedes Gate hat: **Trigger**, **Input**, **Output**, **Abbruchregel**.

### G0 — Intake-Qualitaet (DoR)

- **Trigger:** neues Ticket soll erstellt werden
- **Input:** 6D-Klassifikation aus §3.1, Evidenz, Scope-Guard gesetzt
- **Output:** Issue-Typ (A/I/V/D), passender Agent, klarer Scope
- **Abbruch:** ≥1 Dimension unvollstaendig → zurueck zu Robin oder in A-Issue umformen

### G1 — `verify-plan` (Plan-Gate, letzter Plan-Schritt)

- **Trigger:** Master-Plan aus Plan-Fabrik (§5.4) vom TM konsolidiert — alle Planbausteine der Schichtagenten integriert, Duplikate entfernt, Reihenfolge fixiert, Verantwortlichkeiten je Paket gesetzt.
- **Input:** Master-Plan + Repo-Realitaet (Pfade, Contracts, Tests, Pattern, bestehende Issues fuer Duplikat-Check).
- **Output:** `VERIFY-PLAN-REPORT.md` mit Delta; **angepasste** `TASK-PACKAGES.md` (verify-plan darf den Plan mutieren und final verbessern); anschliessend `SPECIALIST-PROMPTS.md` je Rolle durch den TM.
- **Abbruch:** bei Fail → Plan zurueck in Plan-Fabrik, **kein** I-Issue auf `Ready` heben.
- **Pflicht bei:** `code_change = true`.
- **Regel:** verify-plan laeuft **immer** gegen den konsolidierten Master-Plan (nicht gegen einzelne Bausteine). Wird der Plan mutiert, laeuft G1 erneut.

### G2 — Technische Verifikation

- **Trigger:** I-Issue umgesetzt, Branch `auto-debugger/work`
- **Input:** Build-/Test-Kommandos je Schicht (siehe Verifikationskriterien in `.claude/CLAUDE.md`), ggf. Live-Run
- **Output:** Evidenz-Kommentar am Issue (Logs, Testgruen, Live-Screenshot)
- **Abbruch:** Build/Test rot → Issue bleibt Open, Follow-up-Analyse

### G3 — Wissensintegration

- **Trigger:** G2-pass bei Code-Aenderung
- **Input:** geaenderte Doku-Pfade, Pattern-Drift
- **Output:** `updatedocs`-Lauf, Folge-Issues fuer Rest-Risiko
- **Abbruch:** kein Abbruch — Gate ist obligatorisch bei `code_change = true`

---

## 5. Agenten-Orchestrierung

### 5.1 Routing (Agent je Modus + Schicht)

| Modus | Agent |
|-------|-------|
| **A** (Analyse) | `*-debug` (schichtgebunden) · `meta-analyst` (Cross-Layer) |
| **I** (Implementierung) | `esp32-dev` · `server-dev` · `mqtt-dev` · `frontend-dev` |
| **V** (Verifikation) | `test-log-analyst` · `hardware-test` + zustaendiger Schicht-Agent |
| **D** (Doku) | TM + Skill `updatedocs` |

`auto-debugger` bleibt Orchestrator fuer Incidents und Mehrpaketfaelle (siehe CLAUDE.md Abschnitt „Orchestrator").

### 5.2 Prompt-Contract (Pflichtfelder je Agentenlauf)

Jeder Agentenauftrag MUSS enthalten:

1. **Ziel** in 1 Satz
2. **In-Scope / Out-of-Scope** (explizit beide)
3. **Betroffene Pfade** (Datei- oder Modul-genau)
4. **Erwartetes Artefakt** (Report / Code-Diff / Test)
5. **Verifikationskommandos** (Build/Test je Schicht)
6. **Abbruch-/Eskalationsregel** (Link zu §5.3)
7. **Referenz auf A-Issue** und — falls Modus I — auf G1-passed Plan

Keine freien „mach mal"-Prompts.

### 5.3 Anti-Stuck-Protokoll (hart)

**Trigger** (einer reicht):

| # | Bedingung |
|---|-----------|
| 1 | Loop: 2× gleicher Fehler ohne neuen Befund |
| 2 | Scope-Unsicherheit: > 2 unbeantwortete Annahmen |
| 3 | Zeit: 45 min ohne verwertbaren Zwischenstatus |
| 4 | Pfadkonflikt: Zielpfad/Pattern unklar |

**Ablauf bei Trigger:**
1. Agent stoppt den Run kontrolliert.
2. Agent erstellt `BLOCKER`-Kommentar mit drei Feldern: **Was versucht · Was blockiert · Naechster kleinster Schritt**.
3. TM entscheidet innerhalb 1 Zyklus: **Re-Scope** · **Split** · **Eskalation** (anderer Agent oder `auto-debugger`).

Kein stilles Weiterrennen im Loop.

### 5.4 Plan-Fabrik + Kontinuitaetspflicht

Die Planarbeit zwischen G0 und G1 ist keine Beilage, sondern ein eigener, iterativer Schritt mit klaren Rollen.

**Ablauf (Pflicht bei `code_change = true`):**

1. **TM eroeffnet Plan-Issue** (Linear-Typ `IMPLEMENTIERUNGSPLAN`, `blockedBy` = das A-Issue, `parent` optional wenn Teil eines Incidents). Das Plan-Issue ist Container — noch keine Code-Umsetzung.
2. **Spezialagenten erstellen Planbausteine einzeln** — pro Schicht/Cluster genau ein Baustein (`esp32-dev`, `server-dev`, `mqtt-dev`, `frontend-dev` oder `db-inspector`). Jeder Baustein steht in der Plan-Issue-Kommentarspur, nicht im Body.
3. **Iteration bis vollstaendig:** Dieselben Agenten schaerfen ihre Bausteine solange nach, bis
   - Reihenfolge innerhalb der Schicht klar,
   - Abhaengigkeiten zu anderen Schichten explizit,
   - Testumfang je Paket klar,
   - keine Parallel-Patterns entstehen (Duplikat-Check §3.4).
4. **TM konsolidiert** alle Planbausteine zu einem Master-Plan (`TASK-PACKAGES.md`): Duplikate entfernen, Cross-Layer-Reihenfolge fixieren, Verantwortlichkeit je Paket setzen.
5. **G1 `verify-plan`** laeuft als **letzter Plan-Schritt** auf den Master-Plan und darf ihn final verbessern (§4 G1).
6. **Freigabe:** Erst nach G1-Pass werden die abgeleiteten I-Issues von `Backlog` auf `Ready` gehoben.

**Kontinuitaetspflicht:**

Der **Dev-Agent, der den Planbaustein seiner Schicht erstellt hat, ist auch der Umsetzer** der abgeleiteten I-Issues dieser Schicht. Begruendung:

- Der planende Agent kennt Pfade, Pattern-Referenzen und Teststrategie bereits aus der Plan-Fabrik — kein Kontext-Verlust.
- Der Prompt-Contract (§5.2, Feld 7) referenziert denselben Plan, den der Agent mit erstellt hat.
- Uebergaben zwischen Agenten sind nur bei Eskalation (§5.3) oder Kapazitaetsengpass erlaubt und werden im I-Issue-Kommentar dokumentiert.

**Nicht erlaubt:**
- Plan-Fabrik uebersprungen (I-Issue direkt aus A-Issue) → Verstoss gegen §1.2.
- Plan nur vom TM geschrieben ohne Spezialagenten-Bausteine → Agenten laufen ohne Plan-Context, verletzt Kontinuitaetspflicht.
- Planbaustein-Autor ≠ I-Issue-Ausfuehrer ohne dokumentierten Grund → Scope-Drift-Risiko.

---

## 6. Issue-Architektur (Linear)

### 6.1 Grundschema — 8 Bloecke (jedes Issue)

1. **Pflichtkopf** — Owner, Ausfuehrer, Deadline, Done-Kriterium, Blocker
2. **Issue-Typ** — A · I · V · D
3. **Scope** — In-Scope, Out-of-Scope, Schichten, Abhaengigkeiten
4. **DoR** — Intake-Checkliste aus §3.1 erfuellt
5. **Arbeitskette** — mit Pflichtreferenz auf A-Issue (wenn I) und Plan (wenn I/V)
6. **DoD** — Gate-Evidenz (G1/G2/G3)
7. **`updatedocs`-Block** — bei Code-Aenderung Pflicht
8. **Follow-up-Tracking** — Rest-Risiko als eigenes Folge-Issue

### 6.2 Relationen (strikte Semantik)

| Typ | Bedeutung | Beispiel |
|-----|-----------|----------|
| `parent` | Echte Hierarchie, Sub-Issue einer Story | AUT-109 parent AUT-68 |
| `blocks` | A blockiert B (A muss zuerst fertig) | AUT-111 blocks AUT-115 |
| `blockedBy` | Umgekehrter `blocks`-Link | AUT-115 blockedBy AUT-111 |
| `relatedTo` | Kontext-Link, keine harte Reihenfolge | AUT-66 relatedTo AUT-54 |
| `duplicate` | Inhaltsgleich, einer wird geschlossen | Selten — nur nach Duplikat-Check §3.4 |

`relatedTo` wird **nicht** als Ersatz fuer `blocks` benutzt. Jeder **I-Issue** setzt zusaetzlich `blockedBy` = Plan-Issue (aufgeloest erst nach G1-Pass). Jeder **V-Issue** setzt `blockedBy` = zugehoeriger I-Issue auf `Done`.

### 6.3 Templates (v2) — 4 Modi

Jeder Modus bekommt eine eigene Template-Datei (siehe Lieferobjekte §7.2). Templates spiegeln das Grundschema 6.1 und sind mit den Gates G0–G3 verdrahtet.

---

## 7. Lieferobjekte (bis 2026-04-26)

### 7.1 Hauptanalyse
- `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md`
- Inhalt: Ist-Zustand · Problemkatalog · Sollmodell · Migrationsplan · KPI-Set

### 7.2 Templates v2 (je ein .md)
- `docs/analysen/ISSUE-TEMPLATE-ANALYSE.md`
- `docs/analysen/ISSUE-TEMPLATE-IMPLEMENTIERUNG.md`
- `docs/analysen/ISSUE-TEMPLATE-VERIFIKATION.md`
- `docs/analysen/ISSUE-TEMPLATE-DOKU-UPDATEDOCS.md`

### 7.3 Pilot-Issues (3 Drafts als Markdown)
- A-Template real genutzt
- I-Template real genutzt (mit Referenz auf A-Draft)
- V-Template mit `updatedocs`-Nachweis

---

## 8. Akzeptanzkriterien (Abnahme durch Robin)

- [ ] Jede neue Chatmeldung laesst sich mit dem 6D-Intake eindeutig klassifizieren.
- [ ] Issue-vs-Projekt-Regel dokumentiert und im Pilot angewendet.
- [ ] Pflichtablauf `A → Plan → verify-plan → I → V → D` in allen Pilot-Issues sichtbar.
- [ ] Scope-Drift wird frueh erkannt und per Split behoben.
- [ ] Agenten-Outputs folgen Prompt-Contract (§5.2, 7 Felder).
- [ ] Anti-Stuck-Protokoll dokumentiert und in Pilot-Issue angewendet.
- [ ] `updatedocs` bei Code-Aenderungen im Done-Pfad nachweisbar (G3).
- [ ] 4 Templates + 3 Pilot-Issues liegen vor und sind nutzbar.

---

## 9. Nicht-Ziele

- Kein grossflaechiger Produktcode-Umbau.
- Kein Austausch der bestehenden Agentenlandschaft.
- Keine generischen Lean/Agile-Sammlungen ohne AutoOne-Bezug.

---

## 10. Umsetzungspriorisierung (TM intern)

1. Template-Engine (§7.2) + Intake-Regeln (§3) finalisieren.
2. G0 und G3 in den echten Issue-Fluss verdrahten.
3. Anti-Stuck-Protokoll aktiv testen.
4. Erst danach Feintuning von Metriken.

---

## 11. Diff zu V2 (Struktur-Aenderungen, inhaltlich identisch)

| V2 | V2.1 | Begruendung |
|----|------|-------------|
| §0 + §0.1 + §0.2 (drei Preamble-Bloecke) | konsolidiert in **§1 Zielbild & Direktive** | §0.1 Pflichtsequenz und §1.1 Intake-Engine hatten 2× „6-Schritte-Klassifikation" — einmal reicht |
| §1.4 „Rolle des TM" innerhalb Kernauftrag | in §1.3 hochgezogen | konzeptionell, gehoert zur Direktive |
| Keine visuelle Pipeline | **§2 Pipeline End-to-End** als ASCII-Diagramm | Anker fuer den ganzen Rest; Leser sieht Fluss auf einen Blick |
| §1.1–§1.3 streut Intake-Regeln | gebuendelt in **§3 Intake-Engine** | eine Engine, eine Sektion |
| §3 Gate-Modell hinter Agenten-Workflow | **§4 Gate-Modell** vor Agenten (wird von Agenten konsumiert) | Gate-Abhaengigkeit jetzt linear |
| §2 Agenten-Workflow vermischt Routing + Contract + Stuck | **§5** mit klaren Unter-Abschnitten 5.1/5.2/5.3 | identische Inhalte, saubere Achsen |
| §4 Issue-Architektur nur 8-Punkt-Liste | **§6** mit 6.1 Schema / 6.2 Relationen / 6.3 Template-Link | verdrahtet mit §7.2 Lieferobjekten |
| Glossar fehlte | neu in **§1.4** | A/I/V/D wird 20+ Mal benutzt — einmal definieren |

### Feinschliff 2026-04-22 (nach Review durch Robin)

V2.1 hatte die **Plan-Fabrik-Logik** und die **Kontinuitaetspflicht** aus V2 §2.2a beim Konsolidieren zu leise gemacht. Dieser Feinschliff hebt sie wieder sichtbar hervor, ohne die V2.1-Struktur anzutasten:

| V2.1 (vorher) | V2.1 Feinschliff | Begruendung |
|---------------|------------------|-------------|
| §1.2 Kurzformel „Analyse → Plan → verify-plan → I → V → D" | **erweitert um Plan-Fabrik-Schritt** und 4 harte Regel-Punkte | Plan-Issue ist kein Nebenprodukt, sondern eigener Lebenszyklus — musste explizit stehen |
| §2 Pipeline-Diagramm: 1 Kasten von ANALYSE → G1 | **neuer PLAN-Issue-Kasten** zwischen ANALYSE und G1 | Der wichtigste iterative Schritt war unsichtbar |
| §4 G1: „Plan aus A-Issue abgeleitet" | **Trigger = konsolidierter Master-Plan**; Output erweitert um `TASK-PACKAGES.md`-Mutation + `SPECIALIST-PROMPTS.md` | G1 laeuft **auf dem Master-Plan**, nicht auf Einzelbausteinen — V2 hatte das, V2.1 hatte es verloren |
| §5 endete bei §5.3 Anti-Stuck | **§5.4 Plan-Fabrik + Kontinuitaetspflicht** als eigener Abschnitt | Explizite 6-Schritte-Plan-Fabrik + 3 „nicht erlaubt"-Verstoesse + Agenten-Kontinuitaet |
| §6.2 Relationen-Tabelle | **`duplicate` ergaenzt**; Pflicht-Satz „I-Issue blockedBy Plan-Issue, V-Issue blockedBy I-Issue" | Relations-Semantik fuer Plan-Fabrik vervollstaendigt |

**Kein Inhalt entfernt.** Drei fehlende V2-Konzepte (Plan-Fabrik als eigener Schritt, Kontinuitaetspflicht, G1 auf Master-Plan) wieder prominent verankert. Die Templates in §7.2 bleiben unveraendert — sie referenzieren jetzt den explizit benannten §5.4.
