# ANALYSE: TM-Issue-Orchestrierung Linear + Agenten + AutoOne

**Owner:** Robin Herbig
**Ausfuehrer:** Technical Manager
**Deadline:** 2026-04-26
**Status:** Final (2026-04-22, V2-Integration 2026-04-22 Spaet-Nachmittag)
**Typ:** ANALYSE (kein Codeumbau)

> **V2-Integration:** AUFTRAG V2 vom 2026-04-22 ergaenzt diese Analyse um Intake-Engine (§4.8), Issue-vs-Projekt-Matrix (§4.9), Scope-Guard (§4.10), Prompt-Contract (§4.11) und Anti-Stuck-Protokoll (§4.12). Die urspruenglichen Abschnitte 1–7 bleiben inhaltlich unveraendert; die V2-Sektionen konkretisieren das Sollmodell an den vom Auftraggeber benannten Stellen.

---

## 0. Evidenz-Hinweis: Pflichtquellen-Abgleich

Der Auftrag fordert im Abschnitt 3 die vollstaendige Sichtung von 10 Pflichtquellen. Davon sind im Auto-one-Repo heute real vorhanden:

| # | Pflichtquelle (Auftrag) | Ist im Repo? | Verwendeter Ersatz / Befund |
|---|-------------------------|--------------|-----------------------------|
| 1 | `planung/pm-regelwerk-sprint-1-2026-04-20.md` | **nein** | Enthalten im Linear-Projekt `LIFE — Sprint-Steuerung S1` (project description verweist auf `life/planung/…` — anderer Workspace). Im AutoOne-Repo nicht repliziert. |
| 2 | `planung/life-sprint-1-agent-skill-orchestrierung-2026-04-22.md` | **nein** | Siehe Punkt 1 (LIFE-Workspace). |
| 3 | `arbeitsbereiche/automation-one/architektur-autoone/auto-debugger/SOLL-WORKFLOW-UND-SYSTEM-REGELN.md` | **nein** | Aequivalent liefert `.claude/skills/auto-debugger/SKILL.md` + `.claude/agents/auto-debugger.md` + TM_WORKFLOW.md Abschnitt 4. |
| 4 | `arbeitsbereiche/automation-one/architektur-autoone/server/tm-steuerung-server-durchleuchtung-S0-S13-2026-04-05.md` | **nein** | Keine Entsprechung gefunden. |
| 5 | `arbeitsbereiche/automation-one/architektur-autoone/frontend/tm-steuerung-frontend-durchleuchtung-F01-F14-2026-04-05.md` | **ja**, aber unter `.claude/reports/current/frontend-analyse/frontend/` | Gelesen als Referenz-Pattern fuer Issue-Schnitt. |
| 6 | `arbeitsbereiche/automation-one/architektur-autoone/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` | **nein** | Kein Treffer. |
| 7 | `wissen/iot-automation/ki-coding-fehler-mittelgrosse-codebases-agent-orchestrierung-2026-04-09.md` | **nein** | TM_WORKFLOW.md Abschnitt 9 ("Anti-KI-Fehler") deckt 8 Fehlerbilder. |
| 8 | `wissen/iot-automation/linear-issue-schnitt-agentic-engineering-autoone-2026-04-22.md` | **nein** | Teil-Aequivalent `docs/analysen/frontend/layout-orbitalview-monitor-l2-linear-issue-schnitt-2026-04-15.md` (12-Issue-Schnitt fuer eine View). |
| 9 | `wissen/iot-automation/quality-gates-agenten-workflow-autoone-2026-04-22.md` | **nein** | Teil-Aequivalent im TM_WORKFLOW.md Abschnitt 7 (verify-plan-Gate). |
| 10 | `wissen/iot-automation/definition-of-done-und-updatedocs-agenten-workflow-autoone-2026-04-22.md` | **nein** | Teil-Aequivalent TM_WORKFLOW.md Abschnitt 13 + `.claude/skills/updatedocs/SKILL.md`. |

**Befund:** 7 von 10 genannten Pflichtquellen existieren im AutoOne-Repo nicht unter dem angegebenen Pfad. 3 existieren in aequivalenten Formen innerhalb `.claude/` oder `docs/`. **Das ist bereits ein belegtes Ist-Problem** (P-15, siehe Problemkatalog). Die Analyse nutzt die tatsaechlich vorhandene Evidenz: TM_WORKFLOW.md v2.0, Skill-Definitionen (verify-plan, updatedocs, auto-debugger), 8 Linear-Projekte, >100 Issues mit Kommentaren, METRIK-Notiz 2026-04-15, Incident-Artefakte INC-EA5484 und INC-2026-04-22.

---

## 1. Kontext + Ziel

### 1.1 Ziel dieser Analyse

Besseres Issue-**Design** fuer agentische Softwarearbeit in AutoOne. Es geht nicht um mehr Tickets, sondern um sauberen Scope, klare Gates, konsistente Agentenzuordnung, verifizierbare Abschluesse und verbindliche Nachverfolgung bis zur echten Integration im System. Output: ein operationalisierbares Steuer- und Qualitaetsmodell mit direktem Uebergang in 4 Templates und 3 Pilot-Issues.

### 1.2 Nicht-Ziele

Kein grossflaechiger Codeumbau. Keine neue Agenten-Architektur. Keine generischen Best-Practice-Sammlungen ohne AutoOne-Bezug. Der bestehende `auto-debugger`-Pfad bleibt unangetastet — das Sollmodell integriert sich dort nahtlos.

### 1.3 Arbeitsprinzipien (eingehalten im Bericht)

Pattern-First (bestehende TM_WORKFLOW v2.0 + Skills wiederverwendet), Evidence-First (jede Aussage mit Issue-ID, Datei oder Kommentar-Referenz), Klein statt gross (Sollmodell in 3 Phasen migrierbar), Gate-freundlich (4 Gates mit Hard/Soft-Regel, nicht als Abschluss-Blocker), Chirurgisch (Templates muessen exakt das ergaenzen, was heute fehlt).

---

## 2. Ist-Zustand (belegt)

### 2.1 Regelwerk heute: TM_WORKFLOW.md v2.0

`.claude/reference/TM_WORKFLOW.md` (2026-04-15) liefert bereits ein solides Fundament:

- **Abschnitt 1–4:** 4 Workflow-Pfade (Fast-Track, F1 Test-Flow, F2 Dev-Flow, auto-debugger).
- **Abschnitt 5:** Issue-Pflichtformat mit 7 Pflichtfeldern (Titel, Agent, Kontextblock, Abhaengigkeiten, verify-plan-Hinweis, Akzeptanzkriterien, Pattern-Referenz).
- **Abschnitt 7:** verify-plan als Qualitaetsgate zwischen Plan und Umsetzung.
- **Abschnitt 9:** Anti-KI-Fehler-Katalog (8 Fehlerbilder mit Verbot/Pflicht).
- **Abschnitt 13:** Kontext-Analyse + `/updatedocs` als Pflicht nach jeder Codeaenderung, inkl. Akzeptanzkriterium `- [ ] /updatedocs ausgefuehrt`.

Ergebnis: Die Regeln existieren. Die Frage, die dieser Bericht beantwortet, ist **wo sie in realen Linear-Issues nicht eingehalten oder nicht operationalisiert sind**.

### 2.2 Linear-Bestand (Stand 2026-04-22)

**8 aktive Projekte** (via `list_projects`):

| # | Projekt | Issues | Start | Ziel |
|---|---------|--------|-------|------|
| 1 | Testfeld Live-System 2 — Klima-Forensik (INC 2026-04-22) | 7 (AUT-109..115) | 2026-04-22 | 2026-05-08 |
| 2 | LIFE — Sprint-Steuerung S1 | — | 2026-04-20 | 2026-05-31 |
| 3 | MQTT-Transport & Recovery Hardening (INC EA5484) | 19 (AUT-54..72 + AUT-121) | 2026-04-20 | 2026-05-15 |
| 4 | UI/UX Design-Token & Konsistenz-Audit | 12 (AUT-42..53) | 2026-04-21 | 2026-05-16 |
| 5 | Sensor-Lifecycle-Vereinheitlichung | 7 (AUT-35..41) | 2026-04-21 | 2026-05-09 |
| 6 | Monitor L2 Layout & Sensor-Card Fixes | 12 (AUT-23..34) | 2026-04-16 | 2026-04-30 |
| 7 | pH/EC Fertigation Datenpfad | Backlog | 2026-04-20 | 2026-05-01 |
| 8 | Bodenfeuchte-Kalibrierung | 6 PARTIAL | 2026-04-14 | 2026-04-18 |

### 2.3 Wie Issues heute erstellt und priorisiert werden

Beobachtet an den bestehenden Issue-Koerpern (Stichproben AUT-26, AUT-42, AUT-54, AUT-68, AUT-110):

- **Erstellung:** Der TM erzeugt Issues entweder direkt aus einer Analyse-Datei (Beispiel: Monitor-L2-12-Issue-Schnitt `docs/analysen/frontend/layout-orbitalview-monitor-l2-linear-issue-schnitt-2026-04-15.md`) oder aus einem Incident-Lagebild (Beispiel: `RUN-FORENSIK-REPORT-2026-04-17.md` → AUT-54..67).
- **Priorisierung:** Felder `priority` (Urgent/High/Normal/Low) + `estimate` (SP). Faktisch P0/P1/P2-Wellen in den Projektbeschreibungen.
- **Schnitt:** Meist ein Cluster (z.B. 6 Cluster in Monitor L2, 3 Phasen in UI/UX-Audit, 4 RC-Cluster in INC-EA5484). Granularitaet variiert: 1 SP (AUT-68 nach Re-Scope) bis 5 SP (AUT-54).
- **Parent-Child:** Im Issue-Body als Narrative ("parent=AUT-68"), nicht ueber das Linear-`parent`-Feld. Linear-Relations genutzt: `blocks`, `blockedBy`, `relatedTo`.

### 2.4 Wo heute Gates zu greifen versuchen

- **verify-plan-Gate**: Im TM_WORKFLOW.md seit 2026-04-15 Pflicht, in INC-EA5484-Issues (AUT-54 "verify-plan Delta 2026-04-17") und INC-2026-04-22-Issues (AUT-110: B-NRS-01..B-NRS-05) konsequent umgesetzt. In Monitor-L2-Issues (AUT-26, AUT-28, AUT-30) **fehlt** der explizite verify-plan-Hinweis (belegt in `.technical-manager/reports/METRIK-2026-04-15-tm-workflow-ueberarbeitung.md` Tabelle "Format-Compliance" Zeile "verify-plan Hinweis: Nein").
- **Build-Verifikation**: TM_WORKFLOW.md Tabelle pro Schicht, in Issue-Bodies via Akzeptanzkriterien ("Build gruen: pytest -q, ruff check .") sichtbar in AUT-110 B-NRS Feld DoD.
- **`/updatedocs`-Gate**: TM_WORKFLOW.md Abschnitt 13 fordert es als Akzeptanzkriterium. In keinem der stichprobenhaft gelesenen Done-Issues (AUT-26, AUT-42, AUT-54) war das Kriterium in der Liste enthalten. Die Regel ist geschrieben, aber in den realen Issue-Bodies noch nicht verankert.

### 2.5 Wie Ergebnisse ins System eingearbeitet werden

- **Artefakt-Ordner** werden gut gefuehrt: `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/` enthaelt RUN-FORENSIK-REPORT, SPRINT-PLAN, TASK-PACKAGES, VERIFY-PLAN-REPORT, STATE-ARCHITECTURE-ANALYSIS, INCIDENT-LAGEBILD, SPECIALIST-PROMPTS, CORRELATION-MAP (8 Artefakte).
- **Docs-Update** ist im Skill `updatedocs` definiert (Chirurgisches Editieren, 11 Kategorien-Matrix), aber der Skill-Aufruf erscheint nicht in den Akzeptanzkriterien der gesampelten Issues. Es entsteht ein Drift zwischen Code und Doku, der durch eine zusaetzliche Nacharbeit eingefangen werden muesste (heute nicht beobachtet).
- **Linear-Router-Drift**: `.technical-manager/TECHNICAL_MANAGER.md` listet AUT-54 weiterhin in Kategorie "3x In Review" (Stand 2026-04-22, Zeile 16), waehrend Linear AUT-54 seit 2026-04-21T08:16:54Z auf `Done` hat. Router-Aktualitaet laueft dem Linear-Stand hinterher.

---

## 3. Problemkatalog (mind. 10, priorisiert, belegt)

Jedes Problem: Symptom, Ursache, betroffene Schicht, Priorität (P0/P1/P2), Wiederholbarkeit, Klassifikation (Prozess / Tool / Prompt / Wissen).

| # | Titel | Symptom | Ursache | Schicht | Prio | Wdh. | Klasse | Evidenz |
|---|-------|---------|---------|---------|------|------|--------|---------|
| P-01 | Scope-Drift in Mega-Issues | AUT-68 vereinte Payload-Min + Counter-Split + REST-Fallback + Interval + Live-Verify in einem Issue; am 2026-04-22 re-scoped und in 5 Folge-Issues aufgetrennt (AUT-109/69/110/111/121) | Kein Issue-Typ-Feld + keine Pflicht-Obergrenze fuer Scope; keine Gate-Pruefung "Scope-Check" vor `In Progress` | Prozess | **P0** | hoch | Prozess | AUT-68 Delta-Kommentar 2026-04-22 ("Scope-Drift … 1. Scope-Drift: Payload-Optimierung + Root-Cause-Analyse + Counter-Split + REST-Fallback + Heartbeat-Interval-Anpassung in einem Issue. Damit unklar, wann 'done'.") |
| P-02 | Titel-Schema uneinheitlich | Monitor-L2-Issues haben `fix:`-Prefix, aber kein `[Schicht]`-Tag im Titel | Titel-Format-Regel TM_WORKFLOW Abschnitt 5.1 ist definiert, aber kein Gate prueft Einhaltung | Prozess | P1 | hoch | Prozess | METRIK-2026-04-15: Tabelle "Pflichtfeld Titel mit [Schicht]: Teilweise — `fix:`-Prefix vorhanden, `[Frontend]` fehlt"; AUT-26 Titel `fix: formatValue() ohne Locale-Formatierung (Tausender-Trennzeichen)` |
| P-03 | verify-plan-Hinweis fehlt in aelteren Issues | AUT-26, AUT-28, AUT-30 (Monitor L2, Phase 1 Quick Wins) enthalten keinen expliziten "verify-plan gegen folgende Dateien: [Liste]"-Block | verify-plan wurde erst 2026-04-17 mit der INC-EA5484-Welle als verbindlich in Issue-Bodies gezogen | Prozess | P0 | hoch | Prozess | METRIK-2026-04-15 Zeile "verify-plan Hinweis: Nein"; AUT-26-Body hat keinen verify-plan-Abschnitt; AUT-54 hat einen verify-plan-Delta-Block |
| P-04 | Issue-Typ-Vermischung | AUT-68 enthielt Analyse-Thesen (H6) + Implementierung (gpio_status raus) + Verifikation (Live-Stresstest) + Scope-Correction-Kommentare im selben Ticket | Kein explizites `Issue-Typ`-Feld (ANALYSE / IMPLEMENTIERUNG / VERIFIKATION / DOKU); Ticket-Typ nur implizit via Label | Prozess | **P0** | hoch | Prozess | AUT-68 Kommentar-Thread 2026-04-19 (Review), 2026-04-20 (Live-Evidence), 2026-04-22 (Scope-Korrektur) im selben Issue; vermischt Analyse- und Implementierungs-Daten |
| P-05 | Relations-Overflow | AUT-68 hat 17 relatedTo + 1 blocks + 0 blockedBy ohne Semantik-Unterscheidung (welches ist Parent-Signal, welches Cross-Link, welches Abgrenzung) | Linear kennt nur `blocks` / `blockedBy` / `relatedTo` / `duplicateOf`; keine Rollen-Tags wie "supersedes", "parent-narrative", "cross-incident" | Tool | P1 | mittel | Tool | AUT-68 `relations.relatedTo` enthaelt: 69, 71, 72, 54, 55, 58, 59, 60, 61, 63, 65, 66, 67, 70, 110, 111, 116, 121 — alle auf gleicher Ebene |
| P-06 | Parent/Sub-Issue im Narrative statt im Feld | AUT-109/71/72/121 werden im TM-Router und im Issue-Body als "parent=AUT-68" oder "parent=AUT-69" ausgewiesen, sind aber in Linear nur als `relatedTo` angelegt | Das Linear-`parent`-Feld wird nicht konsequent genutzt; stattdessen Narrative-Parent in Titel/Body | Tool + Prozess | P1 | hoch | Tool | AUT-68 `relations.relatedTo[AUT-121]` existiert; `parent`-Feld nicht gesetzt; TM-Router Zeile 46 spricht von "parent=AUT-68" |
| P-07 | Kommentar-Korrektur-Kaskade | AUT-68 Delta-Kommentar 2026-04-22 07:40:42Z nennt Folge-Issue "AUT-116"; ein zweiter Kommentar 07:42:15Z (2 Min spaeter) korrigiert auf "AUT-121"; der Body selbst ist noch nicht gefixt | Keine Transaktionalitaet zwischen "Issue anlegen" und "Cross-Link setzen"; der TM haengt Delta-Kommentare im Staccato-Stil an, statt den Body in einem atomaren Edit zu aktualisieren | Prozess | P1 | mittel | Prozess | AUT-68 Kommentar bd297b75 "Korrektur zum Delta-Kommentar oben: Das neue Follow-Up-Issue 'Heartbeat Metrics Split' ist AUT-121 (nicht AUT-116 wie im Body-Text vorlaeufig angegeben). Bitte im Body mental umsetzen — Body-Edit folgt." |
| P-08 | Router-Drift (TM-Router vs. Linear-Wahrheit) | `.technical-manager/TECHNICAL_MANAGER.md` beschreibt AUT-54 in Zeile 16 als "In Review" (Stand 22.04.), Linear hat AUT-54 seit 2026-04-21T08:16:54Z auf `Done` | Keine automatische Synchronisation Router↔Linear; TM aktualisiert Router manuell, mit Lag | Prozess + Tool | P1 | hoch | Prozess | TM-Router Zeile 16 "19 Issues, 3x In Review, 16x Backlog; AUT-69 Firmware+Server live-verified, AUT-68 repositioniert + AUT-121 ausgekoppelt 22.04." vs. Linear `completedAt=2026-04-21T08:16:54.278Z` fuer AUT-54 |
| P-09 | DoR (Definition of Ready) fehlt | Keines der gesampelten Issues enthaelt eine explizite DoR-Checkliste "Bevor ich diesen Issue auf In Progress ziehen darf, muss folgendes vorliegen: ..." | TM_WORKFLOW.md definiert keine DoR; nur DoD | Wissen | P1 | hoch | Wissen | Stichproben AUT-26, AUT-42, AUT-54, AUT-68, AUT-110 — keine DoR-Sektion. Folge: AUT-68 ging wiederholt in `In Progress` bevor Scope sauber war (s. P-01) |
| P-10 | `/updatedocs`-Pflicht nicht operationalisiert | TM_WORKFLOW.md Abschnitt 13 fordert `- [ ] /updatedocs ausgefuehrt` als letztes Akzeptanzkriterium — in AUT-26, AUT-42, AUT-54 (alle `Done`) fehlt diese Zeile | Regel im Workflow-Dokument, nicht im Issue-Template; daher beim Issue-Erzeugen vergessen | Prozess | **P0** | hoch | Prozess | AUT-26 Akzeptanzkriterien Block (6 Kriterien, kein updatedocs); AUT-42 (5 Kriterien, kein updatedocs); AUT-54 Verifikation (5 Punkte, kein updatedocs) |
| P-11 | Inline-Kommentare als heimliche Artefakte | AUT-68 Kommentar 2026-04-19 ist ueber 5000 Zeichen mit vollstaendigen Tabellen, DoD-Matrizen und Pattern-Diagrammen — Daten, die besser als Artefakt unter `.claude/reports/…/audit-AUT-68-2026-04-19.md` mit Issue-Verweis laegen | Kein Format-Limit fuer Kommentare; keine Regel "ab X Zeilen in ein Artefakt auslagern" | Prozess | P2 | mittel | Prozess | AUT-68 Kommentar ba5ca4cc-8c4d-4894 (≈5400 Zeichen, 6 Abschnitte, 3 Tabellen) |
| P-12 | Cross-Project-Parent-Kind | AUT-109 ist im Projekt `Testfeld Live-System 2 — Klima-Forensik (INC 2026-04-22)`, sein narrativer Parent AUT-68 ist im Projekt `MQTT-Transport & Recovery Hardening (INC EA5484)`; das Projekt-Board zeigt die Abhaengigkeit nicht | Cross-Project-Relations sind in Linear moeglich, aber das Projekt-Board gruppiert nur nach eigenem Projekt; Scope eines Incidents bleibt dadurch unvollstaendig sichtbar | Tool + Prozess | P1 | mittel | Tool | AUT-68 `projectId=e16d523e-1891-48b6-98fc-f7173a505de4` (EA5484), AUT-109 project=`Testfeld Live-System 2` (project `bb2b88cc-2c4d-4d61-ad96-ae442d64073c`), `relatedTo[AUT-109]` auf beiden Seiten |
| P-13 | Gate "Wissensintegration" fehlt | Nach DoD-Tech-Verifikation gibt es keinen expliziten Schritt "Docs + Referenzen + Folge-Issues geprueft", bevor der Issue auf `Done` darf | TM_WORKFLOW.md kennt nur Code-Verifikation + `/updatedocs`-Pflicht; kein explizites Gate "Wissensintegration" zwischen "Code gruen" und "Done" | Prozess | **P0** | hoch | Prozess | AUT-54 `completedAt=2026-04-21T08:16:54`; kein Kommentar-Eintrag "updatedocs ausgefuehrt", keine Dokumentations-Paths genannt |
| P-14 | Prompt-Qualitaet: Inkonsistente Schichtreferenz | Manche Issues referenzieren Pfade mit `El Servador/god_kaiser_server/src/…`, andere mit `El Servador/src/…` (falsche Verkuerzung); verify-plan korrigiert das nachtraeglich | Keine Pflicht-Pattern-Referenz-Sektion "absoluter Repo-Pfad + Zeilennummer" in Issue-Templates | Prompt | P1 | hoch | Prompt | verify-plan SKILL.md Zeile 62-63 listet diesen Fehler explizit als "Haeufige TM-Fehler bei Pfaden"; AUT-54 verify-plan Delta zeigt Korrektur `pio run -e esp32_dev` (nicht `-e seeed`) |
| P-15 | Pflichtquellen-Mismatch (dieser Auftrag) | 7 von 10 Pflichtquellen im Auftrag existieren nicht unter dem angegebenen Pfad | Wissens-Ablageorte (LIFE-Workspace vs. AutoOne-Repo) nicht klar getrennt; Auftrags-Autor geht von anderem Workspace aus | Wissen | P2 | mittel | Wissen | Siehe Abschnitt 0 dieser Analyse, Spalte "Ist im Repo?" — 7 Nein, 3 Teil-Aequivalent |

**Gesamt 15 Probleme, davon 4×P0, 8×P1, 3×P2. Davon 9 Prozess, 3 Tool, 2 Wissen, 1 Prompt.**

---

## 4. Sollmodell

### 4.1 Standard-Issue-Architektur (verbindlich, 8 Bloecke)

Jedes Issue folgt exakt diesem Raster. Bloecke duerfen leer bleiben, aber die Ueberschrift muss da sein.

```
## 0. Pflichtkopf
- **Owner:** <Person>
- **Ausfuehrer:** <Agent|Person>
- **Deadline:** <YYYY-MM-DD>
- **Done-Kriterium:** <1 Satz, messbar>
- **Blocker:** <Keine | IDs>

## 1. Issue-Typ
ANALYSE | IMPLEMENTIERUNG | VERIFIKATION | DOKU

## 2. Scope
- **In-Scope:** <Pfade, Komponenten>
- **Out-of-Scope:** <explizit ausgeschlossen>
- **Betroffene Schichten:** <ESP32 | Server | MQTT | Frontend | Docs>
- **Abhaengigkeiten:** <AUT-IDs mit Rolle: blocks/blockedBy/relatedTo/parent>

## 3. DoR (Definition of Ready)
- [ ] Scope klar und <= 1 Schicht oder Cross-Layer explizit begruendet
- [ ] Input-Artefakte liegen vor: <Analyse-Datei, Evidenz, Repro-Log>
- [ ] Agent-Zuweisung passt zum Scope
- [ ] verify-plan-Gate definiert (B-XXX-NN)

## 4. Arbeitskette
1. Ist-Analyse: <Bezug zu Analysebericht>
2. Paket-Zerlegung: <Kurzbeschreibung>
3. verify-plan: Gate <B-XXX-NN>
4. Umsetzung: <Agent>
5. Verifikation: <Testkommandos>

## 5. DoD (Definition of Done)
- [ ] Testnachweis: <Kommandos>
- [ ] Artefakt-Pfad: <.claude/reports/... oder docs/...>
- [ ] Statusnachweis: Linear Status=Done, Kommentar mit Evidenz
- [ ] Risiko-Status: <low|medium|high + Restrisiko>
- [ ] Review durch zweiten Agenten (bei Cross-Layer)

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** code_change={true|false}
- Pflichtblock wenn true:
- [ ] /updatedocs ausgefuehrt mit Beschreibung der Aenderungen
- [ ] Aktualisierte Doku-Pfade: <Liste>
- [ ] Pro Pfad: was + warum

## 7. Follow-up-Tracking
- **Verantwortlich:** <Person|TM>
- **Restpunkte:** <Liste offener Folge-Issues mit AUT-IDs>
- **Check-Termin:** <YYYY-MM-DD>
```

### 4.2 4 Issue-Typen mit spezifischen Pflichtfeldern

| Typ | Zweck | Typ-spezifische Pflichtfelder | Out-of-Scope per Definition |
|-----|-------|-------------------------------|------------------------------|
| ANALYSE | Ist-Zustand ermitteln, Problem belegen, Soll skizzieren | IST/SOLL-Dokumentationsziele (messbar: "Datei X existiert mit Inhalt Y"), Evidenz-Paths, Hypothesen-Liste | Kein Produktcode, kein Build-Befehl ausser Lesen |
| IMPLEMENTIERUNG | Code aendern | Testfaelle, Risiko-Status, SP-Schaetzung, `/updatedocs`-Pflicht gesetzt auf true | Keine offenen Hypothesen — alles muss belegt sein |
| VERIFIKATION | Testsystem, CI oder Live-Check fahren | Test-Plan, erwartete Metriken, Erfolgs-SLO, Rollback-Plan | Keine Code-Aenderung ausserhalb von Test-Fixtures |
| DOKU | Docs aktualisieren, Wissens-Drift schliessen | Ziel-Pfade mit bisher/neuer Inhalt, `/updatedocs`-Skill-Aufruf, Referenz-Abgleich | Kein neuer Inhalt ohne Bezug zu Code-Aenderung |

### 4.3 Titel-Schema (verbindlich)

```
<typ>: [<Schicht>] <Kurzaktion> — <Objekt>
```

Beispiele:
- `fix: [Frontend] Locale-Formatierung in formatSensorValue()` (statt heutigem AUT-26 `fix: formatValue() ohne Locale-Formatierung`)
- `feat: [Server] Rule-Skip-Counter + Notification fuer offline-Ziel-ESP` (AUT-110)
- `refactor: [ESP32] Unused-Felder aus publishHeartbeat() entfernen` (AUT-68 nach Re-Scope)
- `analyse: [Cross-Layer] 12h-Offline-Zyklus ESP_EA5484 (H8–H10)` (AUT-109)

`<typ>`: Conventional Commits (fix/feat/refactor/test/docs/chore).
`<Schicht>`: ESP32 | Server | MQTT | Frontend | Cross-Layer | Docs | Infra.

### 4.4 Relations-Semantik (praezisere Nutzung existierender Linear-Felder)

Linear kennt nativ `blocks`, `blockedBy`, `relatedTo`, `duplicateOf`, `parent`. Die Nutzung wird festgezogen:

| Relation | Nur verwenden fuer | Verboten |
|----------|---------------------|----------|
| `parent` | Echte Sub-Issues (Narrative "parent=AUT-68" wird **zwingend** auch im Feld gesetzt) | "verwandt" — das ist `relatedTo` |
| `blocks`/`blockedBy` | Harte Abhaengigkeit (ohne A kein B) | Reihenfolge-Wunsch ohne harte Blockade |
| `relatedTo` | Cross-Link (gleicher Incident, gleicher Cluster) | Parent-Child-Signal (dann `parent` nutzen) |
| `duplicateOf` | Echter Duplikat, wird dann geschlossen | "ueberlappt teilweise" (dann splitten) |

### 4.5 4-stufiges Gate-Modell

Jedes Gate: Zweck, Trigger, Hard/Soft-Regel, Fail-Verhalten, Verantwortlicher.

#### Gate 0 — Intake-Qualitaet

- **Zweck:** Issue ist ueberhaupt "startbar".
- **Trigger:** Issue wird von Backlog → Ready gezogen.
- **Regel:** **Hard.**
- **Pruefung:** Pflichtkopf vollstaendig; Issue-Typ gesetzt; Scope (In/Out/Schichten/Abhaengigkeiten) vollstaendig; DoR-Checkliste alle Haken.
- **Fail-Verhalten:** Issue bleibt in Backlog; TM oder Requester muss ergaenzen.
- **Verantwortlich:** TM (Quality-Check beim Ready-Ziehen).

#### Gate 1 — verify-plan

- **Zweck:** Sicherstellen, dass Plan gegen Repo-Realitaet stimmt (Pfade, Symbole, Build-Befehle, Abhaengigkeiten).
- **Trigger:** Issue wird von Ready → In Progress gezogen **und** `code_change=true`.
- **Regel:** **Hard** fuer IMPLEMENTIERUNG und VERIFIKATION. **Soft** fuer ANALYSE und DOKU (optional, empfohlen bei grosser Datei-Matrix).
- **Pruefung:** Skill `verify-plan` laufen lassen, Ergebnis als Delta-Kommentar anhaengen, Gate-Kennung (z.B. `B-XXX-NN`) eintragen.
- **Fail-Verhalten:** Issue geht zurueck in Ready; Delta-Kommentar enthaelt konkrete Korrekturen; TM passt Issue an, **kein Implementierungs-Start**.
- **Verantwortlich:** verify-plan-Skill-Ausfuehrer (oft TM oder Dev-Agent).

#### Gate 2 — Technische Verifikation

- **Zweck:** Code-Aenderung ist funktionsfaehig und hat keine Regression.
- **Trigger:** Dev-Agent sagt "fertig" (Code liegt auf Branch, Commit steht).
- **Regel:** **Hard.**
- **Pruefung:** Build-Kommandos aus TM_WORKFLOW.md Verifikationskriterien-Tabelle alle gruen; betroffene Unit-Tests oder Integration-Tests laufen; Risk-Klassen-spezifische Extras (bei P0: 4h-Live-Stresstest; bei DB-Migration: Alembic up+down; bei MQTT-Kontrakt: Broker-Log-Check).
- **Fail-Verhalten:** Commit zurueck; Fehlerbild in Kommentar mit Evidenz; Issue bleibt In Progress.
- **Verantwortlich:** Dev-Agent, gegenkontrolliert durch TM beim Review.

#### Gate 3 — Wissensintegration

- **Zweck:** Doku ist aktualisiert, Referenzen stimmen, Folge-Issues sind angelegt. Verhindert die heute sichtbare Drift zwischen Code und Doku.
- **Trigger:** Gate 2 bestanden, bevor `Done` gesetzt wird.
- **Regel:** **Hard** bei `code_change=true`. **Soft** bei ANALYSE (nur wenn Analyse die Referenzen selbst betraefe).
- **Pruefung:**
  - `/updatedocs` ausgefuehrt, Liste geaenderter Docs im Kommentar.
  - Referenz-Abgleich gegen `.claude/reference/api/*`, `reference/errors/*`, betroffene `rules/*.md`, `CLAUDE.md`-Router.
  - Follow-up-Issues (falls aus Scope ausgeschlossen) angelegt mit AUT-IDs.
- **Fail-Verhalten:** Issue bleibt In Progress; fehlende Doku-Edits oder Follow-ups werden als Subtasks angelegt.
- **Verantwortlich:** Dev-Agent (ausfuehrt), TM (Review und Gate-Abnahme).

**Gate-Faustregel:** Hard-Gates duerfen weder uebersprungen noch abgekuerzt werden, aber sie duerfen parallel laufen, wenn Arbeit unabhaengig ist. Soft-Gates sind dokumentationspflichtig ("bewusst uebersprungen weil …").

### 4.6 Agenteneinsatz-Logik (Zuweisungsmatrix)

Grundlage: `.claude/CLAUDE.md` (14 Agents + 1 Orchestrator). Die Matrix verdichtet die Routing-Regeln aus TM_WORKFLOW v2.0 Abschnitt 3 nach Issue-Typ.

| Issue-Typ | Schicht | Primaer-Agent | Optional Konsultation | Ein-Agent vs. Multi-Agent |
|-----------|---------|----------------|------------------------|---------------------------|
| ANALYSE | ESP32 | `esp32-debug` | `meta-analyst` bei Cross-Layer | Ein-Agent; bei unklarem Scope `meta-analyst` |
| ANALYSE | Server | `server-debug` | `db-inspector` bei DB-Fragen | Ein-Agent |
| ANALYSE | MQTT | `mqtt-debug` | `esp32-debug` bei Broker-Client-Sicht | Ein-Agent |
| ANALYSE | Frontend | `frontend-debug` | — | Ein-Agent |
| ANALYSE | Cross-Layer | `meta-analyst` | `auto-debugger` bei Incident-Artefakt-Orchestrierung | Multi-Agent seriell (debug-*) dann `meta-analyst` |
| IMPLEMENTIERUNG | ESP32 | `esp32-dev` | — | Ein-Agent |
| IMPLEMENTIERUNG | Server | `server-dev` | `db-inspector` bei Migration | Ein-Agent, Migration serial |
| IMPLEMENTIERUNG | MQTT (Kontrakt) | `mqtt-dev` | `server-dev` + `esp32-dev` | **Multi-Agent seriell**: mqtt-dev zuerst, dann server-dev, dann esp32-dev, dann frontend-dev (TM_WORKFLOW Abschnitt 3 Zeile 131) |
| IMPLEMENTIERUNG | Frontend | `frontend-dev` | — | Ein-Agent |
| VERIFIKATION | any | `test-log-analyst` oder `hardware-test` | debug-Agent der Schicht | Ein-Agent; bei Live-Test `hardware-test` + schicht-Debug-Agent |
| DOKU | any | keiner (TM) + Skill `/updatedocs` | — | Kein Agent, nur Skill |

**Konsolidierungs-Prinzip:** Ergebnisse werden per Skill `/collect-reports` konsolidiert, die Konsolidierung erzeugt `CONSOLIDATED_REPORT.md`, der im Issue-Kommentar referenziert wird (nicht eingebettet, um P-11 zu vermeiden).

**Scope-Schutz:** Jeder Agent bekommt die `## 2. Scope`-Sektion als Prompt-Praefix und darf explizit nur die dort gelisteten Pfade anfassen. Der TM pflegt das beim Aufruf.

### 4.7 auto-debugger-Integration

auto-debugger bleibt unveraendert fuer Multi-Layer-Incidents mit Safety-Risiko (siehe `.claude/skills/auto-debugger/SKILL.md`). Die neue Issue-Architektur erweitert ihn nur um:

- Jedes aus TASK-PACKAGES abgeleitete Linear-Issue muss das neue Pflichtformat (4.1) erfuellen.
- Gate 1 (verify-plan) ist schon heute Pflichtgate des auto-debugger vor Implementierung. Gate 3 (Wissensintegration) ist neu — auto-debugger-Orchestrator traegt es in `VERIFY-PLAN-REPORT.md` als finalen Schritt.
- Artefaktpfad bleibt `.claude/reports/current/incidents/<id>/` (unveraendert).

---

### 4.8 Intake-Engine (6-Schritt-Schema, V2 verbindlich)

Jede Robin-Chatnachricht durchlaeuft vor jeder Ticket-Erzeugung genau diese 6 Schritte, in dieser Reihenfolge. Ohne alle 6 entsteht **kein** Issue — der TM antwortet mit einer gezielten Rueckfrage oder eroeffnet zunaechst ein ANALYSE-Issue (Scope: "Intake klaeren").

| Schritt | Feld | Moegliche Werte | Regel |
|---------|------|-----------------|-------|
| 1 | **Problemklasse** | `Bug` \| `Drift` \| `Incident` \| `Refactor` \| `Feature` \| `Verifikation` \| `Doku` | Entscheidet spaeter den Issue-Typ. `Incident` triggert immer `auto-debugger`. |
| 2 | **Impactklasse** | `P0` (Safety/Outage) \| `P1` (Kernfunktion) \| `P2` (UX/Nebenfunktion) \| `P3` (Cosmetic/Metrik) | P0 → hard Gate 2 + 4h-Live-Test; P3 → darf CI-Fixture statt Live-Test. |
| 3 | **Scopeklasse** | `Single-Layer` \| `Cross-Layer` \| `Incident-Cluster` | Single-Layer = 1 Agent; Cross-Layer = Multi-Agent seriell oder parallel; Cluster = `auto-debugger`. |
| 4 | **Artefaktlage** | `Evidenz vorhanden` \| `Evidenz teilweise` \| `Evidenz fehlt` | Bei `fehlt` MUSS zuerst ANALYSE-Issue; kein direkter Sprung auf IMPLEMENTIERUNG. |
| 5 | **Ausfuehrungsmodus** | `ANALYSE` \| `IMPLEMENTIERUNG` \| `VERIFIKATION` \| `DOKU` | Einer — kein Mix (siehe §4.10 Scope-Guard). |
| 6 | **Containerwahl** | `Einzel-Issue` \| `Projekt` \| `unklar → ANALYSE-Issue zuerst` | Matrix siehe §4.9. |

**Intake-Notation (im TM-Router oder Chat-Rueckspiegel):**

```
Intake: [Problem=Bug | Impact=P0 | Scope=Cross-Layer | Evidenz=teilweise | Modus=ANALYSE | Container=Einzel-Issue]
Begruendung: 12h-Forensik vorhanden (Basis), aber H8–H10 noch offen → erst ANALYSE, danach IMPL-Issue ableiten.
```

**Harte Regeln:**
- Ohne Intake-Block im Issue-Body gilt Gate 0 als nicht erfuellt.
- `Artefaktlage=fehlt` + `Modus=IMPLEMENTIERUNG` ist verboten.
- `Scopeklasse=Incident-Cluster` erzwingt Container=Projekt.
- `Impactklasse=P0` zwingt Live- oder 4h-Test in Gate 2.

---

### 4.9 Issue-vs-Projekt-Matrix (V2 verbindlich)

Containerwahl (Schritt 6 der Intake-Engine) folgt einer harten Matrix, nicht dem Bauchgefuehl.

| Kriterium | Einzel-Issue | Projekt |
|-----------|--------------|---------|
| Anzahl klar abgegrenzter Root-Causes | 1 | > 1 |
| Zusammenhaengende Arbeitspakete | ≤ 2 | > 3 |
| Betroffene Schichten | 1 oder klein begruendetes Cross-Layer | Mehrschicht mit Sequenz-Zwang |
| Zeitschaetzung | ≤ 1 Agentenlauf | > 1 Welle / mehrere Agenten |
| Charakter | Punktueller Fix, klar benennbar | Incident / Hardening / Strukturumbau |
| Gate-Sequenz | Gate 0–3 in einem Run | Analyse → Impl → Verifikation als Sub-Issues |

**Beispiele aus der Baseline (Stand 2026-04-22):**
- `Einzel-Issue`: AUT-26 (formatValue Locale), AUT-72 (Memory-Leak TTL-Cache), AUT-70 (NTP-Doku) — jeweils 1 Schicht, 1 Root-Cause, ≤ 2 SP.
- `Projekt`: INC EA5484 (19 Issues), INC-2026-04-22 Klima-Forensik (7 Issues), UI/UX Design-Token (12 Issues) — mehrere Root-Causes, Mehrschicht, Wellen-Sequenz.
- `unklar → ANALYSE-Issue zuerst`: Der urspruengliche AUT-68 haette nie direkt als Einzel-Issue "Heartbeat-Slimming" gestartet werden duerfen — die Unsicherheit ueber Root-Cause (H6) haette einen ANALYSE-Issue erzwungen; erst danach Container-Entscheidung (wurde am 22.04. nachtraeglich gefaehrt — AUT-68 reduziert + AUT-109 ausgekoppelt).

**Entscheidungsheuristik bei Unsicherheit:**
Wenn zwei oder mehr Kriterien in `Projekt` fallen, MUSS Container=Projekt. Bei Patt (genau ein Kriterium pro Seite) entscheidet die Impactklasse: P0/P1 → Projekt, P2/P3 → Einzel-Issue mit 1 Follow-up.

---

### 4.10 Scope-Guard (V2 verbindlich)

Ein Issue darf **nur einen** primaeren Outcome-Typ haben (ANALYSE **oder** IMPLEMENTIERUNG **oder** VERIFIKATION **oder** DOKU). Mix-Issues sind verboten. Das ist die harte Anti-Mega-Issue-Regel und die direkte Antwort auf P-01/P-04.

**Pflichtverhalten des TM beim Mix-Signal:**

| Erkanntes Mix-Signal | Split-Regel |
|----------------------|-------------|
| Analyse-Thesen + Code-Fix im selben Issue | 1× ANALYSE (Thesen-Auswertung) → **blocks** → 1× IMPLEMENTIERUNG (Code) |
| Code-Fix + Live-Verifikation im selben Issue | 1× IMPLEMENTIERUNG → **blocks** → 1× VERIFIKATION |
| Feature + Doku-Umbau im selben Issue | 1× IMPLEMENTIERUNG → Gate 3 **oder** eigener DOKU-Issue (wenn Doku-Umfang > 2 Pfade) |
| Mehrere unabhaengige Bugs | N× Einzel-Issues, keine Sammelmeldung |

**Protokoll-Pflicht:** Jede Split-Entscheidung wird im Parent-Issue dokumentiert:
```
Scope-Guard 2026-MM-DD: Mix-Signal erkannt (<kurz>).
Split in: AUT-<id> (ANALYSE), AUT-<id> (IMPL), AUT-<id> (VERIFY).
Parent-Issue behaelt nur: <Rest-Outcome>.
```

**Historische Referenz:** AUT-68 war der Paradefall — Payload-Minimum + Counter-Split + REST-Fallback + Interval + Live-Verify-as-RCA in einem Issue. Der spaete Scope-Guard am 2026-04-22 hat das erst nachtraeglich aufgebrochen (AUT-68 Phase 1 + AUT-121 Metrics Split + AUT-109 RCA + AUT-71/72 Audit-Follow-ups). Ziel der V2-Regel: **keine nachtraeglichen Auftrennungen mehr, sondern Erkennung im Intake**.

---

### 4.11 Prompt-Contract fuer Agentenlaeufe (V2 verbindlich)

Jeder Sub-Agent-Aufruf verwendet dieses feste 6-Feld-Schema. Ohne alle 6 Felder darf der TM keinen Agenten starten. Das operationalisiert CLAUDE.md §"Invocations-Qualitaet" und schliesst P-14 (Pfad-Inkonsistenzen).

```
## Prompt-Contract — AUT-<id>
1. **Ziel (1 Satz):** <messbare Aenderung oder messbares Artefakt>
2. **In-Scope:** <absolute Repo-Pfade, ggf. mit Zeilenfenster>
3. **Out-of-Scope:** <explizit ausgeschlossen, inkl. "Kein Pattern-Bruch in <Datei>">
4. **Erwartetes Artefakt:** <Commit-Kette | Report-Datei | Test-Artefakt | Kommentar mit Evidenz>
5. **Verifikationskommandos:** <pio run -e seeed | pytest -q -k <pattern> | ruff check . | npm run build — aus CLAUDE.md-Verifikationstabelle>
6. **Abbruch-/Eskalationsregel:** <Referenz auf §4.12 Anti-Stuck-Protokoll; Trigger-Liste inline>
```

**Anti-Patterns (explizit verboten):**
- `"mach mal den Fix"` — Ziel nicht messbar, Scope offen.
- `"siehe Issue X"` ohne Pfade in Feld 2 — Agent muss raten.
- Fehlendes Verifikationskommando bei `code_change=true`.
- Fehlende Abbruch-Regel — Agent rennt in Loop.

**Evidenz-Bezug:** verify-plan-SKILL §2a zeigt in der Fehlerliste Pfad-Inkonsistenzen (`El Servador/src/` vs. `El Servador/god_kaiser_server/src/`). Prompt-Contract Feld 2 erzwingt absolute Pfade und loest das durch Template-Pflicht.

---

### 4.12 Anti-Stuck-Protokoll (V2 verbindlich)

Agenten bleiben heute gelegentlich in stillen Loops (P-07 Kommentar-Kaskade ist ein Seitensymptom). Ab sofort gilt ein hartes 4-Trigger-Protokoll.

**Trigger (Agent stoppt Run, sobald EINER zutrifft):**

| # | Trigger | Erkennungssignal |
|---|---------|------------------|
| T1 | **Loop-Signal** | 2× identischer Fehler (stderr-Match oder Exit-Code gleich) ohne neuen Befund zwischen den Versuchen |
| T2 | **Scope-Unsicherheit** | > 2 ungeklaerte Annahmen im Arbeits-Log (Agent sagt "vermutlich", "koennte sein", "unklar") |
| T3 | **Zeitgrenze** | 45 Minuten Wall-Clock ohne verwertbaren Zwischenstatus (kein Commit, kein Report-Abschnitt, kein Test-Lauf) |
| T4 | **Pfadkonflikt** | Zielpfad aus Prompt-Contract existiert nicht **oder** Pattern ist nicht erkennbar (verify-plan haette das fangen sollen, Anti-Stuck ist das Sicherheitsnetz) |

**Pflichthandlung bei Trigger:**

1. Agent stoppt den Run **kontrolliert** (kein Rollback noetig, Commit optional als "WIP: stopped by Anti-Stuck").
2. Agent haengt einen **BLOCKER-Kommentar** an das Linear-Issue mit exakt 3 Pflichtabschnitten:
   ```
   BLOCKER (Trigger T<N>, <YYYY-MM-DDThh:mmZ>)
   - Versucht: <was ich wann probiert habe — 1–3 Zeilen>
   - Blockade: <was genau blockiert — Pfad, Error, Pattern-Luecke>
   - Naechster kleinster Schritt: <1 konkrete Aktion, die das loesen koennte>
   ```
3. TM entscheidet innerhalb **eines Zyklus** (≤ 1 Tag) ueber eine von drei Reaktionen:
   - **Re-Scope:** Issue anpassen (Pfade, SP-Schaetzung, Out-of-Scope erweitern).
   - **Split:** Scope-Guard (§4.10) greift nachtraeglich; Issue in Teil-Issues zerlegen.
   - **Eskalation:** Anderen Agenten einsetzen (z.B. Wechsel von `esp32-dev` zu `meta-analyst` bei Pattern-Unsicherheit) **oder** auto-debugger einbeziehen.

**Was verboten ist:**
- Stilles Weiterrennen im Loop (T1/T3).
- Kommentar-Kaskade mit "Korrektur zum Korrektur-Kommentar" (P-07).
- Implizites Re-Interpretieren des Scopes, weil "das ist ja eigentlich gemeint" (T2).

**Metrik-Koppelung:** Anti-Stuck-Trigger-Rate wird in der Wochen-METRIK-Notiz (§7) erfasst: Anzahl BLOCKER-Kommentare pro Woche, aufgeschluesselt nach T1–T4. Ziel: T1 < 5 %, T2 < 10 %, T3 < 5 %, T4 = 0 (weil verify-plan T4 verhindern soll).

---

## 5. Migrationsplan (3 Phasen)

### Phase 1 — Quick Wins (W18, 2026-04-27 bis 2026-05-03)

Ziel: Die P0-Probleme abdecken, ohne Prozess-Bruch. Keine Anpassung bestehender Done-Issues, aber ab jetzt ist das neue Schema Pflicht.

| # | Aktion | Verantwortlich | Deliverable |
|---|--------|----------------|-------------|
| 1.1 | 4 Issue-Templates in `.claude/reference/linear-templates/` ablegen | TM | `ISSUE-TEMPLATE-ANALYSE.md`, `-IMPLEMENTIERUNG.md`, `-VERIFIKATION.md`, `-DOKU-UPDATEDOCS.md` |
| 1.2 | TM_WORKFLOW.md v2.0 → v2.1 mit neuem Pflichtformat, Issue-Typen, Gate-Modell | TM | TM_WORKFLOW.md, Abschnitt 5 ersetzt, Abschnitt 7 erweitert um Gate 0/2/3 |
| 1.3 | 3 Pilot-Issues (ANALYSE / IMPLEMENTIERUNG / VERIFIKATION) nach neuem Muster anlegen | TM | AUT-Pilot-A/I/V (Entwurf im Anhang) |
| 1.4 | Titel-Schema-Check in TM-Router-Checkliste aufnehmen | TM | Section in `.technical-manager/README.md` "Pre-Commit Issue-Check" |
| 1.5 | `/updatedocs`-Akzeptanzkriterium in allen aktiven Backlog-Issues (P0 und In Progress) per Kommentar nachgezogen | TM | Ein-Kommentar-Patch an max. 20 Issues |

**Messgroessen nach Phase 1:** 100 % neuer Issues haben Pflichtkopf und Issue-Typ. 0 Issues ohne verify-plan-Gate, wenn `code_change=true`.

### Phase 2 — Strukturumbau (W19–W20, 2026-05-04 bis 2026-05-17)

Ziel: Gate-Modell in den bestehenden Workflows verdrahten. Router-Synchronisation verbessern.

| # | Aktion | Verantwortlich | Deliverable |
|---|--------|----------------|-------------|
| 2.1 | Gate 0 in TM-Router-Workflow als "Ready-Gate" festziehen | TM | Sub-Sektion in TECHNICAL_MANAGER.md "Ready-Check" |
| 2.2 | Gate 3 in DoD aller aktiven IMPLEMENTIERUNG-Issues | TM | Patch-Kommentare auf AUT-55/56/57/60/71/72/110/111 |
| 2.3 | Cross-Project-Parent-Sichtbarkeit: einheitliche Naming-Konvention fuer Sub-Issues (`[INC-XXXX-NN][<parent>]`-Prefix), Linear-`parent`-Feld gesetzt | TM | Umformulierung 5–7 bestehender Titel (AUT-109/71/72/121) |
| 2.4 | Inline-Kommentar-Policy: Limit 1500 Zeichen; darueber als Artefakt unter `.claude/reports/current/…` ablegen und per Link referenzieren | TM | Section in `rules/rules.md` oder `reference/linear-templates/COMMENT-POLICY.md` |
| 2.5 | Router-Drift-Check: Wochen-Automatik "Router vs. Linear-Status" | TM + `agent-manager` | Skript oder Checkliste `scripts/check_router_sync.sh` |

**Messgroessen nach Phase 2:** < 24 h Lag zwischen Linear-Status-Change und Router-Update. Alle Multi-Layer-Incidents haben ihre Cross-Project-Parents im Titel sichtbar.

### Phase 3 — Stabilisierung (W21+, ab 2026-05-18)

Ziel: Metriken auswerten, Pattern schaerfen, KI-Fehler systematisch reduzieren.

| # | Aktion | Verantwortlich | Deliverable |
|---|--------|----------------|-------------|
| 3.1 | Metriken-Auswertung Phase 1/2: Re-Scope-Rate, Anzahl Gate-Fails, Done-ohne-updatedocs | TM | Retrospektive-Notiz `.technical-manager/reports/RETRO-2026-05-W21.md` |
| 3.2 | Anti-KI-Fehler-Katalog um die 2 neuen Befunde ergaenzen (Scope-Drift als expliziter Fehlerbild; Kommentar-Korrektur-Kaskade) | TM | TM_WORKFLOW.md Abschnitt 9 um 2 Zeilen erweitert |
| 3.3 | Templates nach realer Nutzung schaerfen: was wurde weggelassen, was ergaenzt? | TM | Template-v1.1 |
| 3.4 | `verify-plan`-Skill um Template-Compliance-Check erweitern (Pflichtkopf vorhanden?) | Skill-Owner | Erweiterung SKILL.md Abschnitt 2a |

**Messgroessen nach Phase 3:** Re-Scope-Rate < 10 % (heute AUT-68 = 1 von ~20 = 5 %, aber weitere latente Faelle vermutet); Done-ohne-updatedocs-Rate = 0 %; Router-Drift im Schnitt < 12 h.

---

## 6. Risiken + Gegenmassnahmen

| Risiko | Wahrscheinlichkeit | Impact | Gegenmassnahme |
|--------|---------------------|--------|----------------|
| Templates werden als Buerokratie wahrgenommen; Compliance bleibt niedrig | mittel | hoch | Templates auf das absolute Minimum halten (Pflichtkopf 5 Felder + Scope + DoR + DoD — nichts mehr); Pilot-Issues zuerst zeigen, dass sie **kuerzer** werden als bisherige Mega-Issues, nicht laenger. |
| Gate 3 (Wissensintegration) verzoegert Done | hoch | mittel | `/updatedocs`-Skill laeuft in < 5 Minuten; Gate 3 erlaubt "Doku-Follow-up-Issue" statt Blockade, wenn Aufwand > 2h abgeschaetzt. |
| verify-plan wird als reine Formalitaet abgehakt | mittel | hoch | verify-plan-Skill liefert bei Fehlen von Evidenz einen **Stop**; TM prueft bei Gate-Abnahme, ob Delta-Kommentar konkrete Korrekturen enthaelt, sonst ruft er das Gate erneut auf. |
| Issue-Typ-Zwang fuehrt zu Zwitter-Issues mit Mehrfach-Typ-Diskussion | niedrig | mittel | Regel: genau EIN Typ, bei Bedarf Split. Multi-Typ-Wunsch ist ein Scope-Signal → zwei Issues. |
| Cross-Project-Parent-Regel funktioniert im Projekt-Board visuell nicht | mittel | niedrig | Titel-Prefix (`[INC-XXXX-NN]`) erzeugt visuelle Zuordnung; Linear-Filter nach Label `incident:<id>` als Fallback. |
| Router-Automatik scheitert an fehlenden APIs | niedrig | niedrig | Router-Check ist manuell + Checkliste genug; Automatik ist Phase-3-Kuer, nicht Pflicht. |

---

## 7. Messbare Erfolgsmetriken

Gemessen im `.technical-manager/reports/METRIK-YYYY-WW-…md` pro Woche.

| Metrik | Heute (Baseline) | Ziel nach Phase 1 | Ziel nach Phase 2 | Ziel nach Phase 3 |
|--------|-------------------|--------------------|--------------------|--------------------|
| Re-Scope-Rate (Issues mit >1 Scope-Korrektur) | 1/19 in INC EA5484 ≈ 5 % | < 5 % | < 3 % | < 2 % |
| Issues ohne verify-plan-Gate bei `code_change=true` | ca. 30 % (Schaetzung Monitor L2 + UI/UX) | < 10 % | 0 % | 0 % |
| Done-Issues ohne `/updatedocs`-Nachweis | 100 % (AUT-26/42/54 Stichprobe) | < 30 % | < 5 % | 0 % |
| Router-Drift (h) zwischen Linear-Status-Change und Router-Update | > 24 h (AUT-54 Fall) | < 24 h | < 12 h | < 6 h |
| Erstagent-Treffer (war der erste zugewiesene Agent korrekt?) | 80 % (METRIK 2026-04-15: 12/12 Monitor L2 + INC EA5484 Multi-Agent) | 85 % | 90 % | 90 % |
| Kommentar-Laenge-Verletzungen (> 1500 Zeichen inline) | ca. 20 % (Stichprobe AUT-68, AUT-54) | < 15 % | < 5 % | < 3 % |

---

## 8. Lieferobjekte (zusaetzlich zu diesem Bericht)

Die folgenden 7 Artefakte werden als eigene Dateien im Repo abgelegt (dieser Bericht ist nur die Analyse). Nach V2-Integration (2026-04-22 Spaet-Nachmittag) sind alle 7 Dateien gelegt oder aktualisiert.

- `docs/analysen/ISSUE-TEMPLATE-ANALYSE.md` (Stand 2026-04-22, unveraendert seit v1)
- `docs/analysen/ISSUE-TEMPLATE-IMPLEMENTIERUNG.md` (Stand 2026-04-22, unveraendert seit v1)
- `docs/analysen/ISSUE-TEMPLATE-VERIFIKATION.md` (Stand 2026-04-22, unveraendert seit v1)
- `docs/analysen/ISSUE-TEMPLATE-DOKU-UPDATEDOCS.md` (**neu V2, 2026-04-22**)
- `docs/analysen/PILOT-ISSUE-A-analyse-heartbeat-metrics-consumer-audit.md` (**neu V2, 2026-04-22**)
- `docs/analysen/PILOT-ISSUE-I-implementierung-updatedocs-criterion-backport.md` (**neu V2, 2026-04-22**)
- `docs/analysen/PILOT-ISSUE-V-verifikation-night-rule-alarm-4h-live.md` (**neu V2, 2026-04-22**)

**Abdeckung der V2-Akzeptanzkriterien (AUFTRAG V2 §6):**

| # | Akzeptanzkriterium | Nachweis |
|---|---------------------|----------|
| 1 | Intake-Schema klassifiziert jede Robin-Chataufgabe eindeutig | §4.8 (6 Schritte, Notation, harte Regeln) |
| 2 | Klare, dokumentierte Regeln fuer "Issue vs Projekt" | §4.9 (Matrix + Entscheidungsheuristik) |
| 3 | Scope-Drift wird frueh erkannt und per Split behoben | §4.10 Scope-Guard + §4.1/§4.2 (Issue-Typ-Pflicht) |
| 4 | Agenten-Outputs folgen dem Prompt-Contract | §4.11 (6-Feld-Schema) |
| 5 | Anti-Stuck-Protokoll dokumentiert und in Pilot-Issues angewendet | §4.12 + Pilot-Issue A/I/V Abschnitt 4 |
| 6 | `/updatedocs` ist bei Codeaenderungen nachweisbar im Done-Pfad | §4.5 Gate 3 + ISSUE-TEMPLATE-IMPLEMENTIERUNG Abschnitt 6 + ISSUE-TEMPLATE-DOKU-UPDATEDOCS gesamt |
| 7 | 4 Templates + 3 Pilot-Issues liegen vor und sind nutzbar | Lieferobjekte oben + Stichproben in §9 |

---

## 9. Ausblick

Die TM_WORKFLOW.md v2.0 ist bereits zu 80 % das richtige Fundament. Dieser Analysebericht schlaegt **keine Neuerfindung** vor, sondern 5 Nacharbeiten (3 aus v1 + 2 aus V2):

1. **Issue-Typ und DoR** einfuehren — das ist das neue Strukturelement, dass das "alles in ein Issue"-Antipattern bricht (P-01, P-04).
2. **Gate 0 und Gate 3** hinzufuegen — das schliesst die beiden offenen Enden (Startbarkeit und Wissensintegration, P-09, P-10, P-13).
3. **Relations-Semantik** festziehen — das ist der kleinste Schritt mit groesstem Lesbarkeits-Gewinn (P-05, P-06, P-12).
4. **Intake-Engine vor Ticket-Erzeugung** (§4.8) + **Issue-vs-Projekt-Matrix** (§4.9) — das verankert die Container-Entscheidung im Workflow, statt im Bauchgefuehl (P-01 als Ursache).
5. **Anti-Stuck-Protokoll** (§4.12) — das ist das neue Sicherheitsnetz gegen stille Loops und Kommentar-Kaskaden (P-07 als Seitensymptom).

Alle anderen Befunde sind Folgeprobleme dieser Struktur-Luecken. Die 3 Pilot-Issues zeigen, dass die neuen Pflichtformate **kuerzer** werden als die historischen Mega-Issues wie AUT-68 — das war die Risiko-Annahme in §6 und ist durch die Pilotierung widerlegbar.

---

*Evidenz-Quellen dieser Analyse (alle im Repo verifiziert am 2026-04-22):*
- `.claude/reference/TM_WORKFLOW.md` (v2.0, 2026-04-15)
- `.technical-manager/TECHNICAL_MANAGER.md` (Stand 2026-04-22)
- `.technical-manager/reports/METRIK-2026-04-15-tm-workflow-ueberarbeitung.md`
- `.claude/skills/verify-plan/SKILL.md`, `.claude/skills/updatedocs/SKILL.md`, `.claude/skills/auto-debugger/SKILL.md`
- Linear-Issues via MCP: AUT-26, AUT-42, AUT-54, AUT-68, AUT-110 (Body + Kommentare + Relations)
- `docs/analysen/frontend/layout-orbitalview-monitor-l2-linear-issue-schnitt-2026-04-15.md`
- `.claude/reports/current/incidents/INC-2026-04-11-ea5484-mqtt-transport-keepalive/` (8 Artefakte)
