---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: ""
run_id: kalibrierung-linear2point-moisture-2026-04-09
order: incident_first
target_docs:
  - docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md
scope: |
  Ziel: IST-Bericht zur Bodenfeuchte-Kalibrierung (Messinstabilitaet, Oszillation 0 Prozent bis ca. 60 Prozent)
  evidenzbasiert im Repo ablegen und alle Code-Referenzen gegen den aktuellen Tree verifizieren.

  KERNBEFUND (zu verifizieren, nicht nur zitieren):
  - Frontend/Wizard: Kalibrier-Session nutzt method "linear_2point" (useCalibrationWizard startSession).
  - Backend: finalize/_compute_calibration wendet fuer "linear_2point" _compute_linear_2point an → derived mit slope/offset;
    fuer "moisture_2point" _compute_moisture → dry_value/wet_value.
  - MoistureSensorProcessor (moisture.py): liest fuer die Umrechnung praktisch nur dry_value/wet_value aus der
    aufgeloesten Kalibrierung; fehlen diese Keys, Fallback auf feste Defaults (3200/1500 ADC).
  - resolve_calibration_for_processor (calibration_payloads.py): liefert Inhalt aus derived; bei kanonischem
    linear_2point-Ergebnis fehlen dort typischerweise dry_value/wet_value aus der linearen Rechnung.
  - Folge: Operator kalibriert "linear", Live-Verarbeitung arbeitet mit Default-Kennlinie oder unpassenden Grenzen
    → grosse Prozent-Spruenge, Clamping 0/100, wahrnehmbar als Schwanken im Arbeitsbereich inkl. 0 bis ca. 60 Prozent.
  - useCalibration.ts: Composable ohne produktive Imports (Legacy); aktiver Pfad = useCalibrationWizard + REST-Sessions.

  REFERENZ-STAND: Branch auto-debugger/work, Commit 00deff9 (Kurzreferenz). Bei Abweichung: Zeilennummern im Bericht
  aktualisieren, Befund beibehalten falls Logik unveraendert.

  ARBEITSPAKETE:
  1) Pfade im Tree verifizieren: god_kaiser_server/src/composables ist falsch — Frontend unter El Frontend/src/...;
     Server unter god_kaiser_server/... — exakte Pfade im Checkout ermitteln.
  2) Grep/Lesen: useCalibrationWizard (linear_2point), calibration_service (_compute_calibration, _compute_linear_2point,
     _compute_moisture), moisture.py (dry_value/wet_value, Defaults, invert aus params), calibration_payloads.py
     (resolve_calibration_for_processor), sensor_handler.py (Pi-Enhanced / process-Aufruf), sensor_manager.cpp
     (readRawAnalog, keine lokale Feuchte-Konvertierung in applyLocalConversion-Liste).
  3) Pruefen: Kein Import von useCalibration ausserhalb useCalibration.ts (Projektsuche).
  4) Pruefen: normalize_sensor_type / soil_moisture Alias → moisture (Registry) — Bestaetigung H5 verworfen.
  5) Berichtsdatei: docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md anlegen oder
     aktualisieren; Inhalt = vollstaendiger IST-Bericht mit Executive Summary, IST-Kontext, Evidence-Tabelle,
     Ursachenbaum (Mermaid), Hypothesenmatrix H1–H7, Code-Evidence, Luecken, Follow-up (Analyse vs Implementierung).
     Log-Zeilen vom 2026-04-09: nur dokumentieren dass keine eingecheckten Exports vorlagen — keine erfundenen Logs.

  NICHT IN DIESEM LAUF: Produkt-Code aendern oder REST/MQTT/DB-Schema brechen; keine Secrets; Implementierungs-Fix
  nur als Follow-up-Vorschlag im Bericht (Optionen a/b/c aus IST-Bericht), nicht umsetzen ohne separates Gate.
forbidden: |
  Keine Secrets oder Tokens in Berichten.
  Keine Breaking Changes an REST/MQTT/WebSocket/DB ohne separates Gate und Freigabe.
  Code-Aenderungen in diesem Lauf nur wenn ausdruecklich noetig zur Dokumentationskorrektur — bevorzugt: rein lesende
  Verifikation + Markdown-Artefakt. Falls doch minimale Doc-Fixes: nur Branch auto-debugger/work (von master);
  kein git push / kein force durch Agenten.
  Bash nur eingeschraenkt: git status, branch, checkout auto-debugger/work, read-only diff/log.
  Kein Verweis auf andere Repositories oder Pfade ausserhalb der Auto-one-Wurzel im Steuertext und im Ziel-Bericht.
  Keine erfundenen Laufzeit-Logs; nur Code-Evidence und ehrlicher Hinweis fehlender exportierter Logs.
done_criteria: |
  - Datei docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md existiert im Auto-one-Tree
    und enthaelt den vollstaendigen IST-Bericht (Abschnitte 1–8 wie im Auftrag beschrieben), mit verifizierten
    Repo-relativen Pfaden und aktualisierten Zeilenreferenzen falls noetig.
  - Kernbefund Schema-Mismatch linear_2point vs dry_value/wet_value ist an mindestens je einer Code-Stelle pro
    Schicht (Wizard, calibration_service, moisture.py, calibration_payloads) mit kurzem Zitat oder Zeilenangabe
    belegt.
  - Hypothesenmatrix H1–H7 im Bericht mit Status und Evidence; dominante Schicht Backend benannt.
  - Optional: Kurznotiz unter .claude/reports/current/auto-debugger-runs/kalibrierung-linear2point-moisture-2026-04-09/
    mit Verifikations-Checkliste (Pfad nur wenn Skill/Convention das vorsieht — sonst entfallen).
---

# Steuerlauf — Kalibrierungsflow Bodenfeuchte (linear_2point vs MoistureSensorProcessor)

**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `kalibrierung-linear2point-moisture-2026-04-09`

## Ziel (ein Satz)

Evidenzbasierter **IST-Bericht** unter `docs/analysen/` ablegen und die **semantische Luecke** zwischen **`linear_2point`-Kalibrier-Ergebnis** und **`MoistureSensorProcessor` (nur `dry_value`/`wet_value`)** im Code **Zeile fuer Zeile** verifizieren.

## Eingrenzung (wichtigste Punkte)

- Fokus: **Backend-Dominanz** (Kalibrier-derived vs Processor-Eingabe) + Mitverursacher ADC-Rauschen/Clamping; **kein** Implementierungs-Fix in diesem Lauf.
- **Nur** Auto-one-root-relative Pfade im Bericht; Referenz-Commit `00deff9` als Ausgangspunkt fuer Zeilen.

## Abnahme (messbar)

Bericht-Datei existiert, Kernbefund an **vier** genannten Stellen belegt, Matrix H1–H7 vollstaendig, keine fabulierten Logs.

---

## Runbook (imperativ)

1. **Branch pruefen:** Auf `auto-debugger/work` arbeiten; Referenz `00deff9` mit aktuellem HEAD vergleichen (nur zur Einordnung).

2. **Wizard → Session:** `useCalibrationWizard` / `calibrationApi.startSession` — `method: 'linear_2point'` nachweisen.

3. **Finalize:** `calibration_service` — Verzweigung `moisture_2point` vs `linear_2point`; dokumentieren welche Keys in `derived` landen.

4. **Processor:** `moisture.py` — Bedingung fuer `dry_value`/`wet_value`; Defaults; Verhalten wenn nur `slope`/`offset` in der Payload-Kette waeren.

5. **Aufloesung:** `calibration_payloads.resolve_calibration_for_processor` — was wird an `process()` durchgereicht?

6. **Pfad Live:** `sensor_handler` — Aufruf `processor.process` mit Kalibrierungsargument; optional Log-String Pi-Enhanced referenzieren (ohne echten Lauf zu erfinden).

7. **Firmware:** `sensor_manager.cpp` — Feuchte nicht in lokaler Umrechnungsliste; Rohdaten an Server.

8. **Legacy:** Projektweite Suche: Imports von `useCalibration` (ausser der Datei selbst).

9. **Bericht schreiben:** Alle Abschnitte 1–8 des vorgegebenen IST-Berichts; Pfade wie `El Frontend/...` im Text durch **korrekte** relative Pfade aus dem echten Repo ersetzen (z. B. `frontend/src/...` oder tatsaechlicher Ordnername).

10. **STOP** nach Bericht — Implementierungsoptionen (a/b/c) nur als Follow-up im Bericht, nicht codieren.

---

## Aktivierung fuer Robin (Claude Code)

Nach Kopie dieser Datei nach  
`.claude/auftraege/auto-debugger/inbox/STEUER-kalibrierungsflow-bodenfeuchte-linear2point-mismatch-2026-04-09.md`  
im **Auto-one**-Checkout:

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-kalibrierungsflow-bodenfeuchte-linear2point-mismatch-2026-04-09.md
Bitte Steuerlauf ausfuehren: IST-Bericht unter docs/analysen/ verifizieren und ablegen; keine Code-Fixes ohne separates Gate.
```
