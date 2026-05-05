---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-10-feuchte-schwankung-50-100-postfix
run_id: feuchte-postfix-vollverifikation-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-feuchte-kalibrierung-postfix-vollverifikation-schwankung-50-100-2026-04-10.md
scope: |
  ZIEL: **Gezielte Vollverifikation** nach erneutem Fix durch Robin — Symptom **weiterhin** falsch, aber
  **veraendert**: Schwankung nun etwa **50 % bis 100 %** (vorher u.a. 0–60 % / starker Streuungsbereich).
  Der Bericht muss das Problem **von vorn** erklaeren (Operator-Perspektive + Pipeline), **jeden** zuvor
  identifizierten Fehlerpunkt **einzeln** gegen den **aktuellen Code und optional Live-Daten** pruefen
  (wirklich gefixt? nur teilweise? Regression? neues Symptom?), und **messbare** naechste Schritte liefern.

  PROBLEM VON VORN (normativ fuer Abschnitt „Problemstellung“ im Bericht):
  1) **Kalibrierung** soll Zwei-Punkt-Rohwerte (trocken/nass) in eine **verlaessliche** Anzeige ueberfuehren.
  2) **Zwei getrennte Welten:** (A) **Persistenz** nach Finalize (`moisture_2point`, `derived` mit
     `dry_value`/`wet_value`) und (B) **Live-Messung** im Wizard (**POST measure → MQTT → ESP → Response → WS**)
     sowie (C) **Dauerbetrieb** (z.B. 30 s) — alle koennen **unterschiedliche** Rohquellen oder **Zeitpunkte**
     liefern, wenn Korrelation/Fallback/Mutex fehlen.
  3) Robin hat **mehrfach** gefixt (Backend/Frontend/Firmware je nach Paket) — **dieser Lauf** prueft **nicht**
     „ob der Plan gut war“, sondern ob die **konkrete Umsetzung im Tree** und **in der Laufzeit** (soweit
     erreichbar) zu den **erwarteten** Invarianten passt.

  NEUES SYMPTOM (normativ):
  - Nach **neuer Kalibrierung** liegt die **Schwankung** etwa im Bereich **50 % bis 100 %** (nicht mehr
    breit um 0 %). Das ist **kein** Beweis, dass „alles stimmt“ — es kann z.B. bedeuten:
    - Rohwerte liegen **fast immer** oberhalb der kalibrierten „nass“-Referenz → **Clamping** nahe 100 % und
      moderate Variation darunter;
    - **invert** / vertauschte Rollen **dry vs wet** in **einem** Pfad;
    - **zu schmale** oder **verschobene** Spanne (dry_value - wet_value);
    - **falsche Zuordnung** welcher Messwert zur **aktuellen** Kalibrier-Session gehoert (teilweise gefixt,
      Rest-Race);
    - **Wechsel** zwischen **kalibrierter** Kurve und **Default**-Kennlinie (3200/1500) in verschiedenen
      Kontexten;
    - oder **Kombination** aus obigen Punkten.

  PFLICHT-PRUEFUNGEN — **JEWEILS EINZELN** mit Evidence (Code-Zeile oder Log/SQL), Status: OK | TEILWEISE |
  FEHLT | REGRESSION | UNKLAR:

  **A) Persistenz / Processor (Finalize-Kette)**
  - `calibration_service`: Bei `moisture` + finalize → `derived` enthaelt **`dry_value`, `wet_value`**,
    **`type`** konsistent (`moisture_2point` o.ae.); **kein** isoliertes `linear_2point`-only-Derived ohne
    dry/wet fuer Feuchte.
  - `resolve_calibration_for_processor` → `MoistureSensorProcessor.process`: **kein** stilles Fallback auf
    Default 3200/1500 **wenn** gueltige Kalibrierung existiert.
  - DB-Stichprobe (read-only): `sensor_configs.calibration_data` fuer betroffenen `esp_id`/GPIO — Shape
    **exakt** wie Processor erwartet (wenn DB erreichbar; sonst BLOCKER mit Anleitung).

  **B) Wizard Live-Messung (Messung starten)**
  - `useCalibrationWizard.ts`: Wird **`measurementRequestId`** (oder Aequivalent) mit **`intent_id` /
    `correlation_id`** aus WS-Payload **verglichen**? Abweichung → Event **verwerfen** (stale guard).
  - Kein reiner esp/gpio/session-Filter ohne ID-Match — **falls** doch noch so: dokumentieren als **offen**.
  - Zeit-Guard: wirksam gegen **veraltete** Payloads nach neuem Klick (nicht nur `Date.now()` beim Empfang).

  **C) Backend Response-Handler**
  - `calibration_response_handler.py`: Wenn `raw` fehlt — **welche** Fallback-Strategie **jetzt**? Noch
    `get_latest_reading` blind? Oder request-scoped / Fehlerpfad? Evidence.

  **D) Firmware**
  - `triggerManualMeasurement` vs. `performAllMeasurements`: **Mutex** oder andere Serialisierung **fuer
    dasselbe GPIO** — vorhanden oder nicht? Evidence.
  - `operating_mode` / Intervall: Konsistenz mit Analyse H12.

  **E) Mathematik 50–100 %**
  - Aus **einem** Beispiel (DB oder Log): `dry_value`, `wet_value`, **typischer** `raw_value`-Bereich.
    Rechnung: linear map → erwarteter Prozentbereich. Passt **50–100** zur Physik oder ist es **Clamping**?

  LIEFERFORMAT BERICHT (docs/analysen/BERICHT-feuchte-kalibrierung-postfix-vollverifikation-schwankung-50-100-2026-04-10.md):
  1 Executive Summary (1–2 Saetze: dominant verbleibende Ursache **oder** „mehrere gleichgewichtig“)
  2 Problem von vorn (Pipeline A/B/C, fuer Laien verstaendlich)
  3 Symptom-Update: **50–100 %** — moegliche Ursachen **kurz** klassifiziert
  4 Pruef-Matrix A–E: **jede Zeile** mit Status + Evidence + **Gap** falls UNKLAR
  5 Abgleich mit frueheren Berichten (Wizard-Analyse, Live-PostgreSQL-Bericht) — was ist **geloest**, was
    **nicht**
  6 Empfehlung: **ein** naechster Mini-Implementierungs-Schwerpunkt (kein Code in diesem Lauf) **oder**
     Messprotokoll (Serial/MQTT) als Voraussetzung

  METHODE:
  - Grep/Read gegen **aktuellen** HEAD; keine fabulierten Zeilennummern.
  - Optional: SQL read-only **ein** betroffenes Geraet — wenn nicht erreichbar, klar benennen.

forbidden: |
  Keine Secrets/Tokens.
  Keine produktiven Code-Aenderungen in diesem Lauf (rein Analyse + Bericht).
  Kein Breaking REST/MQTT/WS/DB.
  Git: status/branch/diff read-only; Branch auto-debugger/work bevorzugt.
  Inbox-Kopie nach Auto-one: keine Pfade auf Life/arbeitsbereiche/wissen.

done_criteria: |
  - Bericht-Datei existiert mit Matrix A–E vollstaendig; **keine** leeren Status-Zellen ohne „UNKLAR +
    Grund“.
  - Mindestens **eine** quantitative Einordnung zu **50–100 %** (Rechnung oder klarer Clamping-Nachweis /
    „nicht moeglich ohne Rohdaten“).
  - Explizite Aussage: welche der frueheren Hypothesen H1–H12 **weiter** relevant sind nach vermutetem Fix.
---

# Steuerlauf — Feuchte: Post-Fix-Vollverifikation, Schwankung 50–100 %

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `feuchte-postfix-vollverifikation-2026-04-10`  
**Incident-ID:** `INC-2026-04-10-feuchte-schwankung-50-100-postfix`

## Ziel (ein Satz)

Nach Robins letztem Fix **jeden** relevanten Fehlerpunkt **einzeln** verifizieren und das **neue** Symptom (**50–100 %**) **erklaeren** — als **einen** konsolidierten Bericht unter `docs/analysen/`.

## Runbook (kurz)

1. `git rev-parse --short HEAD` notieren.  
2. Matrix A–E abarbeiten (Grep/Read, optional SQL).  
3. Bericht schreiben.  
4. STOP.

## Aktivierung (Claude Code, Auto-one-Checkout)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-kalibrierung-postfix-vollverifikation-schwankung-50-100-2026-04-10.md
Bitte Vollverifikation nach letztem Fix: Problem von vorn, Matrix A–E je Zeile mit Evidence, neues Symptom
Schwankung 50–100 % quantitativ einordnen; Bericht docs/analysen/BERICHT-feuchte-kalibrierung-postfix-vollverifikation-schwankung-50-100-2026-04-10.md; kein Produktcode in diesem Lauf.
```

## Strategie-Repo — Kontext (nicht zwingend in Kurzfassung)

- Voranalyse Wizard/On-Demand: `STEUER-feuchte-kalibrierung-messmodus-wizard-on-demand-analyse-2026-04-10.md`
- Live PostgreSQL: `BERICHT-bodenfeuchte-live-verify-und-codebase-2026-04-10.md`
