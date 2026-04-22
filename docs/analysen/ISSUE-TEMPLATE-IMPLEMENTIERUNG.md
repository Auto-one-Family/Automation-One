# ISSUE-TEMPLATE — IMPLEMENTIERUNG

> Zweck: Code aendern — genau eine logische Aenderung (Prinzip aus `.claude/rules/rules.md` Abschnitt 3).
> Basis: `docs/analysen/ANALYSE-tm-issue-orchestrierung-linear-agenten-autoone-2026-04-26.md` Abschnitt 4.1/4.2.
> `code_change=true` -> Gate 1 **hard**, Gate 2 **hard**, Gate 3 **hard**.

---

**Titel-Schema (verbindlich):** `<fix|feat|refactor|chore>: [<Schicht>] <Kurzaktion> — <Objekt>`
**Beispiele:** `fix: [Frontend] Locale-Formatierung in formatSensorValue()`, `feat: [Server] Rule-Skip-Counter + Notification fuer offline-Ziel-ESP`, `refactor: [ESP32] Unused-Felder aus publishHeartbeat() entfernen`.
**<Schicht>:** ESP32 | Server | MQTT | Frontend | Cross-Layer | Docs | Infra.

---

## 0. Pflichtkopf
- **Owner:** <Person, Standard: Robin Herbig>
- **Ausfuehrer:** <Dev-Agent — `esp32-dev` | `server-dev` | `mqtt-dev` | `frontend-dev`>
- **Deadline:** <YYYY-MM-DD>
- **Done-Kriterium:** <1 Satz, messbar — z.B. "Branch `<name>` merged auf master, Build aller 3 Schichten gruen, Test `<Name>` existiert und ist gruen, `/updatedocs` ausgefuehrt.">
- **Blocker:** <Keine | AUT-IDs — insbesondere Pfad-/Kontrakt-Abhaengigkeiten>

## 1. Issue-Typ
IMPLEMENTIERUNG

## 2. Scope
- **In-Scope:** <konkrete Datei-Pfade mit Zeilenfenster wenn moeglich — `El Servador/god_kaiser_server/src/…`, `El Frontend/src/…`, `El Trabajante/src/…`>
- **Out-of-Scope:** <explizit ausgeschlossen — "keine Schema-Aenderung", "keine Token-Refactorings", "kein Topic-Rename">
- **Betroffene Schichten:** <ESP32 | Server | MQTT | Frontend | Cross-Layer>
- **Abhaengigkeiten:**
  - `parent`: <AUT-ID oder None — bei echtem Sub-Issue Feld in Linear setzen>
  - `blocks`: <AUT-IDs oder None>
  - `blockedBy`: <AUT-IDs oder None — MUSS leer sein, bevor Gate 0 durch ist>
  - `relatedTo`: <AUT-IDs oder None>

## 3. DoR (Definition of Ready)
- [ ] Scope klar und <= 1 Schicht **oder** Cross-Layer explizit begruendet
- [ ] Referenz-Analyse liegt vor: <Bericht-Datei oder AUT-Analyse-Issue>
- [ ] **Plan-Herkunft dokumentiert (AUFTRAG V2.1 §5.4):** Link auf das `IMPLEMENTIERUNGSPLAN`-Issue + Master-Plan-Pfad (`TASK-PACKAGES.md`) + G1-Pass-Nachweis (`VERIFY-PLAN-REPORT.md`)
- [ ] **Kontinuitaetspflicht (AUFTRAG V2.1 §5.4):** Dieser I-Issue-Ausfuehrer ist derselbe Dev-Agent, der den Planbaustein seiner Schicht in der Plan-Fabrik erstellt hat — oder Abweichung im Kommentar begruendet
- [ ] Pattern-Referenz genannt (welches bestehende Modul wird erweitert / nachgebaut — absoluter Repo-Pfad + Zeilennummer)
- [ ] Agent-Zuweisung passt (siehe Analyse-Bericht 4.6 — z.B. MQTT-Kontrakt-Aenderung = Multi-Agent seriell)
- [ ] verify-plan-Gate definiert (`B-<INC>-NN` oder `B-<Projekt>-NN`) **und G1 bereits passed** — keine Umsetzung vor G1-Pass
- [ ] Test-Plan (mind. 1 Unit- oder Integrationstest) skizziert
- [ ] Risiko-Klasse gesetzt: low | medium | high (P0 zwingend high, Stresstest-Pflicht)
- [ ] SP-Schaetzung: 1 | 2 | 3 | 5 (bei > 5 -> splitten)
- [ ] `code_change=true` gesetzt -> Gate-1+2+3 sind hard

## 4. Arbeitskette
1. **Analyse-Rueckblick:** <Bezug zu Analyse-Bericht oder Vor-Issue — genaue Datei-Pfade aus Analyse uebernehmen>
2. **Paket-Zerlegung:** <falls Aufgabe Multi-File: Reihenfolge der Aenderungen, Commit-Grenzen>
3. **verify-plan (Gate 1, hard):** Skill `verify-plan` laufen, Delta-Kommentar anhaengen. Kein Implementierungs-Start ohne gruenem Delta.
4. **Umsetzung durch:** <Agent> auf Branch `<name>` (z.B. `auto-debugger/work` bei Incident-Kontext, sonst Feature-Branch)
5. **Build-Verifikation (Gate 2, hard):** siehe `.claude/CLAUDE.md` Verifikationskriterien-Tabelle — `pio run`, `pytest`, `ruff check`, `npm run build`, `vue-tsc --noEmit`. Exit-Code 0 Pflicht.
6. **Commit-Kette:** Conventional Commits pro logischer Aenderung.
7. **Wissensintegration (Gate 3, hard):** `/updatedocs` ausfuehren, Folge-Issues anlegen wenn aus Scope ausgeschlossen.

## 5. DoD (Definition of Done)
- [ ] Testnachweis: <genaue Kommandos, die gruen laufen — aus CLAUDE.md-Verifikationstabelle>
- [ ] Betroffene Unit- oder Integrationstests laufen lokal gruen (Ausgabe in Kommentar)
- [ ] Build aller betroffenen Schichten gruen: <Liste der Befehle mit Exit-Code 0>
- [ ] Commit-Hash(es) im Kommentar: `<hash> — <Commit-Subject>`
- [ ] Risiko-Klassen-Extras:
  - [ ] P0 / `risk=high`: 4h-Live-Stresstest mit Log-Nachweis ODER explizite Begruendung warum n/a
  - [ ] DB-Migration: Alembic `upgrade` + `downgrade` getestet
  - [ ] MQTT-Kontrakt: Broker-Log-Check (QoS, Topic-Match) belegt
- [ ] `/updatedocs` ausgefuehrt (siehe Block 6)
- [ ] Linear-Status: `Done` erst nach allen Gates
- [ ] Statusnachweis: Linear-Kommentar mit Evidenz (Build-Logs, Test-Ausgabe, Commit-Link)

## 6. /updatedocs (Pflicht wenn code_change=true)
- **Trigger:** `code_change=true` (Standard fuer IMPLEMENTIERUNG)
- **Pflicht-Checkliste:**
  - [ ] `/updatedocs` ausgefuehrt mit konkreter Beschreibung der Aenderungen
  - [ ] Aktualisierte Doku-Pfade als Liste (z.B. `reference/api/REST_ENDPOINTS.md`, `reference/errors/ERROR_CODES.md`, `CLAUDE.md` bei Agent-Routing, `rules/<pfad>.md` bei Stil-Aenderung)
  - [ ] Pro Pfad: was geaendert + warum (1 Satz)
  - [ ] Referenz-Abgleich gegen 11-Kategorien-Matrix aus `.claude/skills/updatedocs/SKILL.md`

## 7. Follow-up-Tracking
- **Verantwortlich:** <Person | TM>
- **Restpunkte:** <Liste offener Folge-Issues mit AUT-IDs — ausgekoppelte Features, spaetere Refactors, beobachtete Kollateralien>
- **Check-Termin:** <YYYY-MM-DD — wann wird Ergebnis im System nachgeprueft>
- **Monitoring-Follow-up:** <Metrik / Dashboard / Alert, der den Effekt sichtbar macht>

---

### Typ-spezifische Pflichtfelder (IMPLEMENTIERUNG)
- **Testfaelle:** explizit gelistet (Name, Datei, erwartete Assertion); Auto-Discovery zaehlt nicht.
- **Risiko-Status:** `low | medium | high` + 1 Satz Begruendung.
- **SP-Schaetzung:** 1–5 (Linear-Estimate-Feld gesetzt).
- **`/updatedocs`-Pflicht:** MUSS auf `true` stehen; sonst Typ falsch gewaehlt.
- **Pattern-Referenz:** absoluter Repo-Pfad + Zeilennummer **mindestens eines** bestehenden Moduls, das als Vorlage dient.
- **Kein offener Hypothesen-Block** — alle Vorbehalte muessen in einem Analyse-Issue abgehandelt sein (Trennung P-04).

### Gate-Hinweise
- **Gate 0 (Intake):** Hard — Pflichtkopf vollstaendig, Scope klar, DoR komplett.
- **Gate 1 (verify-plan):** **Hard** — Delta-Kommentar Pflicht; bei Fail zurueck in `Ready`.
- **Gate 2 (Tech-Verifikation):** **Hard** — alle Build-Befehle gruen, Commit-Log dokumentiert.
- **Gate 3 (Wissensintegration):** **Hard** — `/updatedocs` + Referenz-Abgleich + Folge-Issues.
