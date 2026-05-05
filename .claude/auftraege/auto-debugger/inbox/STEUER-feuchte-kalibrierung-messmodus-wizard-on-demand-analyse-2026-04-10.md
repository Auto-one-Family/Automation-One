---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-10-feuchte-wizard-messwert-streuung
run_id: feuchte-messmodus-wizard-on-demand-analyse-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md
scope: |
  ZIEL: Evidenzbasierter **Analysebericht** — Problem verschiebt sich nach Umsetzung des Backend/Frontend-Fixes
  zu **Kalibrierungs-UI + Messablauf**: Beim Klick **„Messung starten“** kommen **inkonsistente** Roh- bzw.
  Prozentwerte (erster Klick oft plausibel, **weitere** Klicks — auch mit Sekunden Pause — deutlich anders;
  trocken/nass **vertauscht wirkend**; nur **vereinzelt** „richtige“ Werte). **Keine** Produktcode-Aenderung
  in diesem Lauf — nur IST-Analyse, Hypothesenmatrix, Sequenz/State-Maschine, und **klare** naechste Schritte.

  KONTEXT — BEREITS UMGESETZTER FIX (konsistent weiterdenken, nicht widerlegen ohne Evidence):
  - Kalibrier-Finalisierung fuer Bodenfeuchte ueber **moisture_2point**; `resolve_calibration_for_processor` /
    `MoistureSensorProcessor` mit **dry_value/wet_value** in **derived** — Backend-Tests (u.a.
    `test_moisture_finalize_apply_persists_moisture_2point_derived`) und Regressionssuite **gruen** (~60 Tests).
  - Frontend: `calibration.ts` (JWT-Pfad) und `useCalibrationWizard.ts` waehlen **moisture_2point** fuer
    normalisierte Feuchte; `normalizeCalibrationSensorType` parallel Wizard/API (optional DRY-Thema).
  - API: `StartSessionRequest.method` ist `str` — **moisture_2point** gueltig.
  - **Folgerung fuer diese Analyse:** Die **Persistenz/Kennlinie** nach finalize ist **nicht** die primaere
    Vermutung — Fokus auf **Messpfad**, **Zeitliche Kopplung**, **On-Demand vs. Intervall**, **Firmware-Leselogik**,
    **UI-State vs. letzte MQTT-Zeile**.

  SYMPTOM (Operator Robin, normativ):
  - Im **Frontend** waehrend Kalibrierung: **„Messung starten“** — **nicht** jeder angezeigte Wert passt zur
    Erwartung; **erster** Durchlauf oft vernuenftig, **wiederholte** Klicks liefern oft **hoehere** Werte;
    **Trockene Erde** erscheint zeitweise als **nass** und umgekehrt; **selten** kommt ein als korrekt
    interpretierter Wert durch.
  - Messmodi im System: **Dauerbetrieb** (typ. **30 s** Intervall) vs. **On-Demand** (Klick / Server-Command-
    Trigger). Der ESP32 soll einen **zweiten Modus** haben: Sensor **nur auf Anfrage** auslesen — Wechsel und
    Robustheit zwischen bestehenden Patterns muss **verifiziert** werden (kein Greenfield-Raten).

  ANALYSE-DIMENSIONEN (alle im Bericht abdecken oder als BLOCKER markieren):

  1) FRONTEND — Wizard / Kalibrierungsmessphase
     - Ablauf von **„Messung starten“**: welche API/MQTT/WS-Events; wird **ein** Snapshot oder ein **Stream**
       angezeigt; **welcher** State (Pinia/store/local) speichert den zuletzt gesehenen Wert?
     - Race: laeuft parallel **Live-Sensor-Stream** (30 s) und **Kalibrier-Messfenster** — **ueberschreibt**
       eine Quelle die andere?
     - Debounce/Throttle: mehrfaches Klicken — **Queue**, **Drop**, **Stale closure**?
     - Anzeige: Roh vs. bereits kalibrierter Prozent — **welche** Zahl sieht der Operator wann?

  2) BACKEND — Commands / Pi-Enhanced / Handler
     - Gibt es einen **expliziten** „lies jetzt“-Pfad (REST oder MQTT command) fuer On-Demand?
     - Reihenfolge: Kommando an ESP → Antwort → Verarbeitung — **Korrelation** (request_id, seq, gpio)?
     - Wird bei On-Demand **dieselbe** `moisture.py`-Kette wie bei Intervall-Messages genutzt?

  3) FIRMWARE (ESP32)
     - **Intervall-Lesung** vs. **On-Demand-Lesung**: getrennte Funktionen? Mutex? **Reihenfolge** wenn beides
       kurz hintereinander?
     - ADC: Single-Sample vs. Mittelung — unterscheidet sich der Pfad?
     - Dokumentieren: **IST** aus Code (Datei/Symbol), nicht nur Vermutung.

  4) ZEIT / NETZ
     - MQTT **QoS**, **Retained**, **out-of-order** — kann eine **alte** Messung nach einer **neuen** ankommen?
     - WebSocket zum Frontend: **Last value wins** oder falsche Zuordnung bei schnellen Updates?

  5) HARDWARE-NAH (nur als Hypothese absichern)
     - Kapazitiver Sensor: **Einschwingen** nach Einstecken — erster Wert anders als Folgende (physikalisch);
       von Software-Hypothesen **trennen** im Bericht.

  HYPOTHESENMATRIX (Pflicht, IDs H1–H12 im Bericht):
  - Mindestens: Race Live-Stream vs. Kalibrierfenster; Stale MQTT; falscher gpio/esp_id im Wizard-State;
    On-Demand-Pfad liefert Roh, UI zeigt Prozent mit **anderer** Kalibrier-Version; Command ohne ACK;
    **zweites** Device im Store; **invert** nur in einem Pfad; Firmware Mutex/Double-Read.

  METHODIK:
  - **Closest pattern** pro Schicht (SOLL-WORKFLOW Repo-intern): keine neuen Architekturen erfinden.
  - Evidence: **Zeilenangaben** nach Grep/Read; **keine** erfundenen Logs — wenn Laufzeit-Logs fehlen:
    dokumentieren **welche** Log-Zeile fehlt fuer den naechsten Schritt.
  - Optional read-only: **eine** kurze SQL-Stichprobe `sensor_data` / `sensor_configs` fuer den betroffenen
    `esp_id` **nur** wenn DB erreichbar — sonst „nicht verfuegbar“.

  LIEFERFORMAT BERICHT (docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md):
  1 Executive Summary (dominante Hypothese **Schicht**)
  2 Symptom & Repro (Schritte fuer Robin)
  3 IST-Kette: Wizard-Klick → Netz → Server → MQTT → ESP → zurueck (mit **Luecken** markiert)
  4 Hypothesenmatrix H1–H12
  5 Code-Evidence-Tabelle (Datei, Symbol, IST-Verhalten)
  6 Abgrenzung zum **bereits gefixten** moisture_2point-Pfad (warum Symptom trotzdem im UI bleiben kann)
  7 Empfehlungen: **Analyse-Follow-up** vs. **Implementierungs-STEUER** (Vorschlag Titel, keine Umsetzung hier)
  8 Offene Messpunkte (Logs, Serial, kurzer E2E mit Korrelation)

forbidden: |
  Keine Secrets/Tokens in Artefakten.
  Keine produktiven Code-Aenderungen in diesem Lauf; kein Breaking REST/MQTT/WS ohne separates Gate.
  Branch auto-debugger/work; Git nur status/checkout/diff read-only; kein push/force.
  Keine Pfade auf Life-Repo, arbeitsbereiche/, wissen/ in der **Inbox-Kopie** unter Auto-one (nur Auto-one-root).
  Keine erfundenen Logzeilen.

done_criteria: |
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md existiert mit
    Abschnitten 1–8; Hypothesenmatrix vollstaendig; mindestens **8** Code-Referenzen (Pfad + Symbol) oder
    explizite BLOCKER, warum Code nicht gefunden.
  - Klar benannt: **Frontend** vs. **Firmware** vs. **Netz** als wahrscheinlichste dominante Schicht — oder
    „mehrere gleichgewichtig“ mit Evidence.
  - Abschnitt **6** erklaert explizit den Zusammenhang mit dem **bereits umgesetzten** moisture_2point-Fix
    (aus Debugger-Chat: Backend-Tests gruen, calibration.ts/Wizard konsistent).
---

# Steuerlauf — Feuchte-Kalibrierung: Wizard „Messung starten“ vs. On-Demand / Dauer-Modus

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `feuchte-messmodus-wizard-on-demand-analyse-2026-04-10`  
**Incident-ID:** `INC-2026-04-10-feuchte-wizard-messwert-streuung`

## Ziel (ein Satz)

Nachvollziehen, **warum** die **UI** bei wiederholter **Kalibrier-Messung** inkonsistente Werte zeigt — trotz **korrekter** `moisture_2point`-Kette im Backend — und das **Zusammenspiel** On-Demand-Lesung / 30-s-Intervall / Firmware **evidenzbasiert** dokumentieren.

## Eingrenzung

- **Nicht** erneut nur `derived`-Schema pruefen — das ist **Referenzkontext**, kein alleiniger Fokus.
- **Schwerpunkt:** Mess- und Anzeigepfad beim **Wizard**, nicht nur `moisture.py`-Formeln.

## Abnahme

Bericht-Datei existiert, Matrix und IST-Kette sind befuellt, Abgrenzung zu abgeschlossenem Fix klar.

---

## Runbook (imperativ)

1. **HEAD** notieren (`git rev-parse --short HEAD`).

2. **Grep/Read:** `useCalibrationWizard`, `Messung`, `measure`, `startMeasurement`, `reading_interval`,
   `onDemand`, `poll`, `command`, `moisture`, Kalibrier-Composable — Begriffe an echten Code anpassen.

3. **Backend:** MQTT/Command-Handler fuer „read now“; Sensor-Handler bei eingehender Roh-Message.

4. **Firmware:** `sensor_manager`, `readRawAnalog`, Timer vs. Trigger — **zwei Pfade** dokumentieren.

5. **Hypothesen** belegen oder verwerfen.

6. **Bericht** schreiben — inkl. **Debugger-Chat-Zusammenfassung** in Abschnitt 6 (Backend/Frontend-Fix:
   moisture_2point, Tests gruen, calibration.ts/Wizard-Paritaet).

7. **STOP** — Implementierung nur als Empfehlung / Folge-STEUER.

---

## Kopie nach Auto-one

Vollstaendig kopieren nach:

`Auto-one\.claude\auftraege\auto-debugger\inbox\STEUER-feuchte-kalibrierung-messmodus-wizard-on-demand-analyse-2026-04-10.md`

---

## Aktivierung (Claude Code, Auto-one-Checkout)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-feuchte-kalibrierung-messmodus-wizard-on-demand-analyse-2026-04-10.md
Bitte Analysebericht: Wizard „Messung starten“ inkonsistent trotz moisture_2point-Fix; Fokus On-Demand vs.
30s-Intervall und Firmware-Zweitpfad; docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md; kein Produktcode in diesem Lauf.
```

---

## Referenz — Debugger-Gegenpruefung (Zusammenfassung fuer Bericht Abschnitt 6)

**Server:** Tests erweitert, `moisture_2point` persistiert; `StartSessionRequest.method` kompatibel; **60 Tests gruen**.  
**Frontend:** `calibration.ts` + Wizard — **moisture_2point**, Normalisierung `soil_moisture`→`moisture`; vue-tsc clean.  
**Optional:** DRY `normalizeCalibrationSensorType`; **ruff** lokal `poetry run ruff check src/`.  
**Doku:** Operator-Hinweis unter `docs/analysen/` (Rechtschreibung „kanonisch“).

Diese Punkte im Analysebericht als **„abgeschlossener Fix-Stand“** einordnen — Symptom **jetzt** = separater Mechanismus (Messpfad/UI/Firmware-Netz).
