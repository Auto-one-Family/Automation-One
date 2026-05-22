---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: bodenfeuchte-ist-soll-impl-plan-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md
  - .claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md
scope: |
  ZWEI-STUFIGER AUFTRAG (ein Lauf, zwei verpflichtende Ausgabe-Artefakte):

  STUFE A — TIEFE IST-/SOLL-VOLLVERIFIKATION (nur lesend + DB/SQL read-only):
  Ziel: Jede relevante Codestelle im AutomationOne-Tree **exakt** gegen das **bestehende Pattern** des Stacks
  pruefen (Server async/Pydantic, Frontend Composable/API, Tests, OpenAPI/Schemas). **IST** = aktueller
  Zustand mit Zeilenreferenzen; **SOLL** = messbar konsistenter Zustand, bei dem `MoistureSensorProcessor`
  nach einer abgeschlossenen Feuchte-Kalibrierung **immer** `dry_value`/`wet_value` aus der persistierten
  Kette erhaelt (Pi-Enhanced-Pfad), ohne stille Fallback-Kennlinie 3200/1500 — ausser explizit dokumentiertem
  Ausnahmepfad.

  NORMATIVER KONTEXT (bereits belegt — im Verifikationsdokument einchecken, nicht nur verweisen):
  - Life-Strategie-Spiegel: Bericht `BERICHT-bodenfeuchte-live-verify-und-codebase-2026-04-10.md` (PostgreSQL:
    `derived.type: linear_2point` ohne `dry_value`/`wet_value`; Live-ESP `63f776d4-...` vs Mock-ESP).
  - Implementierungsplan 2026-04-09 (Option a: moisture_2point / derived mit dry/wet; PKG-1–6).
  - Robin: Problem wurde **bereits zweimal** „gefixt“ — Verifikation MUSS **Regressionsvektoren** finden:
    nur Frontend geaendert / nur Backend / finalize ok aber DB nicht migriert / alter Session-Stand /
    zweiter ESP parallel / Tests gruen aber Produktions-DB alt / OpenAPI vs. Runtime.

  VERIFIKATIONS-MATRIX (jede Zeile: Datei-Pfad relativ Auto-one-Root, Funktion/Symbol, IST, SOLL, Evidence,
  Risiko — keine leeren Zeilen mit „TODO“):

  1) FRONTEND — Kalibrierung
     - `El Frontend` (oder tatsaechlicher Pfad): `useCalibrationWizard.ts` — **alle** Vorkommen von
       `startSession`, `calibrationApiMethodForSensorType`, `moisture`/`soil_moisture`, `linear_2point`,
       `moisture_2point` (ripgrep mit Zeilen).
     - `CalibrationWizard` / Modals / Presets falls vorhanden: welche `method` werden gesetzt.
     - `src/api/` oder Aequivalent: Typen fuer Calibration-Request/Response — passen sie zu Backend?

  2) BACKEND — Finalize & Derived
     - `god_kaiser_server/.../calibration_service.py`: `_compute_calibration`, `_compute_moisture`,
       `_compute_moisture_from_role_points`, `_compute_linear_2point` — **jeder** Branch fuer
       `sensor_type == moisture` (normalisiert).
     - Oeffentliche Router/Schemas: welche `method`-Strings sind **zulaessig** (OpenAPI, Pydantic-Modelle)?

  3) BACKEND — Processor-Kette
     - `moisture.py`: kompletter Pfad `process`, Default-Mapping, `invert` (params vs calibration).
     - `calibration_payloads.py`: `resolve_calibration_for_processor` — exakt welche Keys kommen bei
       `derived` aus DB an?

  4) BACKEND — Ingest
     - `sensor_handler.py` (oder aktueller Name): Pi-Enhanced-Zweig, Uebergabe `calibration` an Processor.

  5) REGISTRY & ALIAS
     - `sensor_type_registry.py` (und Frontend-Aequivalent): `moisture` vs `soil_moisture`.

  6) TESTS
     - `test_moisture_processor.py`, Kalibrierungs-Tests, MQTT-Flow-Tests: decken sie **Finalize→DB-Shape→
       Processor** ab? Wo ist die Luecke?

  7) FIRMWARE (nur IST/SOLL-Uebersicht, kein Pflicht-Fix)
     - `sensor_manager.cpp` (o.a.): Roh-ADC, Median — nur ob Server-Annahmen konsistent sind.

  8) DATENBANK / BETRIEB
     - SQL read-only: Beispiel `sensor_configs.calibration_data` fuer betroffene ESPs — **IST**-Shape.
     - SOLL: welche Migration/Neu-Kalibrierung ist noetig (Operator vs. Skript)?

  REGRESSIONS-ANALYSE (Pflichtabschnitt in STUFE-A-Dokument):
  - Mindestens **fuenf** plausible Erklaerungen, warum ein frueherer Fix „nicht gehalten“ hat — jeweils mit
    **Code- oder DB-Evidence** bestaetigt, verworfen, oder „unklar“.
  - Explizit pruefen: Ist der **aktuell gepushte** Code in `calibration_service` (linear_2point →
    moisture mapping) **identisch** mit dem, was bei Robin in der **DB** steht (Finalize-Zeitpunkt vs.
    Deploy-Zeitpunkt)?

  STUFE B — VOLLSTAENDIGER IMPLEMENTIERUNGS-STEUER (Output-Datei, vom Agenten **neu zu schreiben**):
  Ziel-Datei (Auto-one): `.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md`

  Diese Output-Datei muss **vollstaendig ausfuellbar** sein (kein Platzhalter-Stubs wie „PKG-X TBD“) und enthalten:

  1) YAML-Frontmatter **eigener** STEUER (run_mode artefact_improvement oder both — je nachdem ob Migration
     DB-Schreibzugriff braucht; scope dann explizit).
  2) **Executive Summary** (ein Absatz): eine empfohlene **kanonische** Methode (Option a aus Plan oder
     begruendete Abweichung) passend zum verifizierten Pattern.
  3) **IST→SOLL-Delta-Tabelle** (Komponente, Aenderung, Risiko).
  4) **Arbeitspakete PKG-1 … PKG-N** mit:
     - konkreten Dateipfaden (verifiziert),
     - Akzeptanzkriterien (checkbox-tauglich),
     - Verify-Befehle (`pytest` Pfade, `vue-tsc`, `ruff` — exakt wie im Repo ueblich),
     - Abhaengigkeit: PKG-N+1 erst nach Verify von PKG-N.
  5) **Daten-Migration** (falls noetig): SQL oder Admin-Prozedur, **keine** Secrets; Rollback-Hinweis.
  6) **Regressionstests-Liste**: welche bestehenden Tests **muessen** gruen sein + **neue** Tests mit
     Assertion auf `dry_value`/`wet_value` im derived nach finalize.
  7) **forbidden** / **done_criteria** fuer den **Implementierungs**-Lauf (kopierbar).
  8) **SPECIALIST-PROMPTS** Kurzblock oder Verweis auf verify-plan-OUTPUT-Format (keine leeren Platzhalter).
  9) Aktivierungszeile fuer Robin: `@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md`

  METHODE (SOLL-WORKFLOW einhalten):
  - Pattern vor Greenfield: `SOLL-WORKFLOW-UND-SYSTEM-REGELN.md` (closest pattern pro Schicht).
  - Vor jeder empfohlenen Code-Aenderung: **verify-plan**-Skill im gleichen Kontext (wie in SOLL-Dokument C).
  - Branch **auto-debugger/work**; Git nur eingeschraenkt; kein push/force.

  REIHENFOLGE DER ARBEIT IN DIESEM LAUF:
  1) Kontext lesen: Implementierungsplan 2026-04-09, BERICHT 2026-04-10 (falls im Checkout unter
     `docs/analysen/` oder Strategie-Kopie — wenn fehlt: Kernfakten aus diesem YAML nutzen).
  2) Matrix abarbeiten: ripgrep + Read, Zeilen aktualisieren.
  3) `VERIFIKATION-IST-SOLL-...md` schreiben (STUFE A).
  4) `STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md` schreiben (STUFE B).
  5) Selbstcheck gegen done_criteria.

forbidden: |
  Keine Secrets, Tokens, Passwoerter, Connection-Strings in Artefakten.
  Keine produktiven Code-Aenderungen in DIESEM Lauf — nur Verifikationsdokument + Output-STEUER fuer Folgelauf.
  Keine Breaking Changes an REST/MQTT/WS/DB-Schema in diesem Lauf.
  Bash: git status/branch/checkout/diff read-only; SQL nur read-only fuer IST-Analyse; kein docker rm, kein drop.
  In der Inbox-Kopie nach Auto-one: keine Pfade auf Life, arbeitsbereiche/, wissen/ — Fakten aus diesem YAML
  reichen.
  Keine fabulierten Zeilennummern: bei Unsicherheit Grep erneut ausfuehren und im Dokument „Stand HEAD <short>“
  nennen.

done_criteria: |
  - docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md existiert und enthaelt:
    (1) Vollstaendige Matrix mit allen Schichten und **verifizierten** Repo-Pfaden,
    (2) IST/SOLL pro Schicht,
    (3) Regressions-Analyse (min. 5 Vektoren mit Evidence-Status),
    (4) explizite Antwort: welche **eine** kanonische Fix-Strategie passt zum bestehenden System (Option a/b
        aus Plan oder begruendete Variante).
  - .claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md
    existiert und ist **implementierungsreif**: vollstaendige PKG-Kette, Verify-Befehle, Migration/Operator-
    Hinweis, YAML forbidden/done_criteria, keine TBD-Pakete.
  - Kein Widerspruch zwischen beiden Artefakten (SOLL in B muss aus IST-Analyse in A folgen).
---

# Steuerlauf — Bodenfeuchte: IST/SOLL-Vollverifikation + Implementierungs-STEUER (Output)

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `bodenfeuchte-ist-soll-impl-plan-2026-04-10`

## Ziel (zwei Saetze)

**Stufe A:** End-to-end **IST vs. SOLL** mit vollstaendiger **Codematrix** und **Regressionsanalyse** (warum fruehere Fixes scheitern konnten) — Dokument unter `docs/analysen/`.  
**Stufe B:** Daraus einen **vollstaendigen, ausfuehrbaren** Implementierungs-**STEUER** unter `.claude/auftraege/auto-debugger/inbox/` erzeugen — inkl. PKG-Kette, Tests, Migration/Operator-Schritte.

## Eingrenzung

- **Kein** Produktcode in diesem Lauf — nur **Analyse-Artefakte** und der **STEUER** fuer den naechsten Lauf.
- Fokus: **Semantik** `linear_2point` vs. `dry_value`/`wet_value` / `moisture_2point`, Pi-Enhanced-Pfad, persistierte DB.

## Abnahme

Beide Dateien in `target_docs` existieren und erfuellen `done_criteria` im YAML.

---

## Runbook (imperativ)

1. Branch `auto-debugger/work` pruefen; HEAD-Kurz-SHA fuer Zeilenangaben notieren.

2. **Kontext einlesen** (Auto-one-Tree): `implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md` falls als Kopie unter `.claude/auftraege/` oder `docs/` vorhanden; sonst aus **diesem** STEUER-YAML arbeiten. Live-Bericht 2026-04-10 einbeziehen falls vorhanden.

3. **Matrix** (scope): Frontend → Backend finalize → payload resolution → moisture processor → handler → registry → tests → Firmware-Ueberblick → DB.

4. **Regressionsvektoren** systematisch: Deploy vs. DB-Zeitstempel, zweites Geraet, fehlende Migration, Tests ohne Integration, API-Schema.

5. **`VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md`** schreiben.

6. **`STEUER-bodenfeuchte-kalibrierung-vollimplementierung-2026-04-10.md`** in `inbox/` schreiben — **vollstaendig**, mit eigenem YAML-Header.

7. **STOP** — Implementierung erst im **Folgelauf** mit der erzeugten STEUER-Datei.

---

## Kopie nach Auto-one

Vollstaendig kopieren nach:

`Auto-one\.claude\auftraege\auto-debugger\inbox\STEUER-bodenfeuchte-ist-soll-vollverifikation-und-implementierungsauftrag-2026-04-10.md`

In der Kopie: eingebetteter `scope`/`forbidden`/`done_criteria` aus diesem Dokument; **keine** externen Repo-Verweise.

---

## Aktivierung (Claude Code, Auto-one-Checkout)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-ist-soll-vollverifikation-und-implementierungsauftrag-2026-04-10.md
Bitte Stufe A+B: vollstaendige IST/SOLL-Verifikationsmatrix mit Regressionsanalyse (warum fruehere Fixes nicht hielten),
dann ausfuehrbaren Implementierungs-STEUER in inbox ablegen; in diesem Lauf keinen Produktcode aendern.
```

---

## Strategie-Repo — Referenz (nicht in Inbox-Kopie)

| Ressource | Pfad (Life) |
|-----------|-------------|
| Live-Bericht | `arbeitsbereiche/automation-one/architektur-autoone/auto-debugger/BERICHT-bodenfeuchte-live-verify-und-codebase-2026-04-10.md` |
| Implementierungsplan 2026-04-09 | `.../implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md` |
| SOLL-Workflow | `.../SOLL-WORKFLOW-UND-SYSTEM-REGELN.md` |
