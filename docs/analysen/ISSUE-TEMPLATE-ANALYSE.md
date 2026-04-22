# ISSUE-TEMPLATE — ANALYSE

> Zweck: Ist-Zustand ermitteln, Problem belegen, Soll skizzieren — ohne Produktcode-Aenderung.
> Basis: `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` Abschnitt 4.1/4.2.
> `code_change=false` -> Gate 1 **soft**, Gate 3 **soft** (nur wenn die Analyse selbst Referenzen aendert).

---

**Titel-Schema (verbindlich):** `analyse: [<Schicht>] <Kurzaktion> — <Objekt>`
**Beispiele:** `analyse: [Cross-Layer] 12h-Offline-Zyklus ESP_EA5484 (H8–H10)`, `analyse: [Server] Rule-Engine-Skip-Pfade beim Ziel-Offline-Fall`.
**<Schicht>:** ESP32 | Server | MQTT | Frontend | Cross-Layer | Docs | Infra.

---

## 0. Pflichtkopf
- **Owner:** <Person, Standard: Robin Herbig>
- **Ausfuehrer:** <Agent-Name aus `.claude/agents/` oder TM>
- **Deadline:** <YYYY-MM-DD>
- **Done-Kriterium:** <1 Satz, messbar — z.B. "Bericht-Datei `<Pfad>` existiert mit Abschnitten 1–9 und belegt Hypothese H7 mit mindestens 3 Evidenz-Quellen.">
- **Blocker:** <Keine | AUT-IDs>

## 1. Issue-Typ
ANALYSE

## 2. Scope
- **In-Scope:** <Pfade / Tabellen / Logfiles, die gelesen werden>
- **Out-of-Scope:** <explizit ausgeschlossen — z.B. "Kein Code-Fix", "Keine DB-Migration", "Kein UI-Redesign">
- **Betroffene Schichten:** <ESP32 | Server | MQTT | Frontend | Docs | Cross-Layer>
- **Abhaengigkeiten:**
  - `parent`: <AUT-ID oder None — bei echtem Sub-Issue auch im Linear-Feld setzen>
  - `blocks`: <AUT-IDs oder None>
  - `blockedBy`: <AUT-IDs oder None>
  - `relatedTo`: <AUT-IDs oder None — nur fuer Cross-Links>

## 3. DoR (Definition of Ready)
- [ ] Scope klar und <= 1 Schicht **oder** Cross-Layer explizit begruendet
- [ ] Input-Artefakte sind benannt und liegen vor: <Pfade — Logs, Reports, Screenshots, Repro-Skripte>
- [ ] Hypothesen-Liste vorhanden (mind. 1 Hypothese pro Cluster)
- [ ] Agent-Zuweisung passt zum Scope (siehe Analyse-Bericht 4.6 Agenten-Matrix)
- [ ] Gate-1-Entscheidung dokumentiert: verify-plan <an|aus>; Begruendung bei "aus"

## 4. Arbeitskette
1. **Input-Sichtung:** <welche Dateien liest der Agent in welcher Reihenfolge>
2. **Hypothesen-Pruefung:** <wie wird jede H1..Hn beantwortet — Log-Grep, DB-Query, Code-Trace>
3. **(optional) verify-plan:** <Gate-ID B-XXX-NN wenn relevant; sonst "uebersprungen, weil reine Lese-Analyse">
4. **Konsolidierung:** Bericht-Datei unter `<Pfad>` mit Abschnitten:
   - Kontext, IST, Befunde, Hypothesen-Auswertung, SOLL-Skizze, Folge-Issues-Vorschlag
   - **Plan-Fabrik-Input** (Pflicht bei Code-Folge): pro zu erwartendem Schichtpaket einen Platzhalter nennen (`esp32-dev` / `server-dev` / `mqtt-dev` / `frontend-dev`), damit der TM im Plan-Issue die Spezialagenten adressiert. Siehe AUFTRAG V2.1 §5.4.
5. **Handoff:** Bericht wird als Kommentar referenziert (nicht inline — P-11 vermeiden); Folge-Issues als Vorschlag im Kommentar, nicht automatisch erzeugt.
6. **Pflicht-Handoff an TM (wenn Code-Folge erwartet):** `ANALYSE → IMPLEMENTIERUNGSPLAN-Issue` ausloesen (TM eroeffnet Plan-Issue gemaess §5.4). **Keine** direkte Umsetzung aus Analyse-Text. Kontinuitaetspflicht notieren: Agenten, die den Planbaustein ihrer Schicht erstellen, sind auch die primaeren Umsetzer der abgeleiteten I-Issues.

## 5. DoD (Definition of Done)
- [ ] Bericht-Datei liegt unter angegebenem Pfad (`docs/analysen/…` oder `.claude/reports/current/…`) und ist lesbar
- [ ] Jede Hypothese hat einen Befund-Eintrag mit Evidenz-Quelle (Datei + Zeile **oder** Kommentar-ID **oder** Log-Timestamp)
- [ ] IST- und SOLL-Abschnitt vorhanden; SOLL ist Handlungsgrundlage fuer Folge-Issues
- [ ] Linear-Status: `Done` **erst** wenn Bericht verlinkt im Kommentar
- [ ] Risiko-Status: `low | medium | high` + 1 Satz Restrisiko
- [ ] Empfehlung fuer Folge-Issues (IMPLEMENTIERUNG / VERIFIKATION / DOKU) als Liste im Bericht

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=false` (Standard fuer ANALYSE-Issues)
- **Ausnahme:** Wenn Analyse direkt Referenz-Doku oder Skill-Definitionen anfasst (`reference/api/*`, `rules/*`, `CLAUDE.md`, Skill-SKILL.md), gilt `code_change=true`:
  - [ ] `/updatedocs` ausgefuehrt mit Beschreibung der Aenderungen
  - [ ] Aktualisierte Doku-Pfade: <Liste>
  - [ ] Pro Pfad: was geaendert + warum

## 7. Follow-up-Tracking
- **Verantwortlich:** <Person | TM>
- **Restpunkte:** <Liste offener Folge-Issues mit AUT-IDs, wenn bereits erzeugt — sonst "werden nach Gate 3 vom TM angelegt">
- **Check-Termin:** <YYYY-MM-DD — wann wird Bericht review'd?>

---

### Typ-spezifische Pflichtfelder (ANALYSE)
- IST-Abschnitt muss mindestens 1 konkrete Dateireferenz **oder** Log-Timestamp **oder** Kommentar-ID enthalten.
- SOLL-Abschnitt muss messbar sein (`Datei X existiert mit Inhalt Y`, **nicht** "Code sollte besser sein").
- Keine Produktcode-Aenderungen; nur Lesen und Berichten.
- Hypothesen-Liste ist Pflicht — jede H wird im Bericht mit `belegt | widerlegt | offen` beantwortet.

### Gate-Hinweise
- **Gate 0 (Intake):** Hard — Pflichtkopf vollstaendig, Scope klar, DoR-Checkliste alle Haken.
- **Gate 1 (verify-plan):** Soft — empfohlen bei grosser Datei-Matrix oder Cross-Layer, sonst Begruendung fuer "aus".
- **Gate 2 (Tech-Verifikation):** n/a (keine Code-Aenderung).
- **Gate 3 (Wissensintegration):** Soft — nur wenn Bericht Referenzen beeinflusst; sonst "n/a: reine Lese-Analyse".
