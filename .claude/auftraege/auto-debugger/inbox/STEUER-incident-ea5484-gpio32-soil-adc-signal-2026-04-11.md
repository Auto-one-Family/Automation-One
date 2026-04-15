---
run_mode: incident
incident_id: INC-2026-04-11-ea5484-gpio32-soil-adc-signal
run_id: ""
order: incident_first
target_docs: []
scope: |
  **Problemcluster:** Bodenfeuchte-Signalintegrität auf **GPIO 32** bei ESP_EA5484 — extreme
  Rohwert-Sprünge und **ADC-Sättigung** trotz gültiger **linear_2point**-Kalibrierung in der DB.

  **Gesammeltes Wissen (aus Bericht §3–4, Executive Summary):**
  - Firmware-Warnung: `ADC rail on GPIO 32: raw=4095 (disconnected or saturated)` während manueller
    Messung — **offener/fehlerhafter ADC-Pfad** bzw. Referenz/Randbedingung in Messmomenten.
  - Server-Logs: kurzzeitig starke Sprünge z. B. raw 2111 → 3706 → 1430 auf **demselben GPIO**;
    linear Kalibrierung mappt auf 0%/100%/dazwischen → **quality poor/fair** bei Randlagen ist
    konsistent mit **instabilem Eingang**, nicht mit „falscher Kalibrierformel“ allein.
  - DB-IST: Kalibrierung **finalisiert**, `linear_2point`, Trocken-/Nasspunkte dokumentiert
    (Beispielraws im Bericht); **Anzahl Sensor-Konfigurationen (5 inkl. VPD)** rechtfertigt die
    Sprünge laut Bericht **nicht** ohne Hardware-Signalproblem.
  - **Abgrenzung:** Vollimplementierungs-STEUER Bodenfeuchte 2026-04-10 betrifft **Schema/Legacy**
    der Kalibrierdaten; dieser Lauf betrifft **Messwertstabilität / ADC / Verkabelung** und
    optional **Software-Glättung** als eigenes Paket — Querverweis, keine Doppel-PKG ohne Scope.

  **Ziel dieses Laufs (Analyseauftrag → Implementierungsplan):**
  1) Evidenz: Serial-Warnung 4095 ↔ Server-raw-Sprünge ↔ gleiches Zeitfenster (CORRELATION-MAP).
  2) Repo-Ist: Server-Pipeline Feuchte (Handler/Processor), Firmware-ADC-Pfad für analog soil —
     nur **nach Lesen** konkrete Dateizeilen in TASK-PACKAGES nennen (verify-plan).
  3) Pakete trennen: **P0 Hardware-Checkliste** (Spannungsteiler, Kabellänge, Masse, Sensor-Modul)
     vs. **optionale Software-Maßnahmen** (Mittelwert/Outlier, Debounce, Messfenster — nur mit
     Akzeptanzkriterien und Safety-Hinweis laut Agent Firmware-Regeln).

  Ausgabe: `.claude/reports/current/incidents/INC-2026-04-11-ea5484-gpio32-soil-adc-signal/` vollständig;
  kein Produktcode durch auto-debugger.
forbidden: |
  Keine Secrets in SQL-Beispielen oder Logs. Keine Firmware-Änderungen an SafetyController ohne
  explizites separates Risiko-Paket und Review-Hinweis in TASK-PACKAGES.
  Kein Commit auf master; Bash nur Git-Branch laut Agent.
  Keine Behauptung „Kalibrierung kaputt“ ohne DB-Stichprobe und Rohwert-Korrelation.
done_criteria: |
  - Incident-Ordner mit allen Pflichtdateien.
  - INCIDENT-LAGEBILD: klar getrennt „Signal/ADC/Hardware“ vs. „Kalibrierungs-Metadaten/Legacy“
    (Verweis auf docs/analysen/BERICHT… und ggf. STEUER-bodenfeuchte-kalibrierung-vollimplementierung).
  - CORRELATION-MAP: GPIO 32, raw-Verlauf, 4095-Ereignisse, quality-Wechsel (falls Server-Logs).
  - TASK-PACKAGES: mindestens ein **HW-Gate**-Paket (Messbar: z. B. 4095 nach Elimination offener
    Leitung nicht reproduzierbar ODER als BLOCKER dokumentiert) und getrennte optional-Software-PKGs
    mit Tests (pytest/pio) nur wenn Scope durch Verify bestätigt.
  - VERIFY-PLAN-REPORT + Post-Verify angepasste TASK-PACKAGES/SPECIALIST-PROMPTS; Übergabe-Chat.
---

# STEUER — Incident EA5484: GPIO 32 Bodenfeuchte, ADC 4095, Rohwert-Sprünge

> **Chat-Start:** `@.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-gpio32-soil-adc-signal-2026-04-11.md`  
> **Quelle:** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`  
> **Git:** `git checkout auto-debugger/work` vor Dev-Commits.

## Problemcluster (kurz)

Die **Prozentanzeige springt**, weil der **Roh-ADC** physisch/digital unstabil ist; **4095** ist
Sättigung bzw. „kein gültiger Messwert“. Die Kalibrierkurve kann nur abbilden, was am Pin ankommt.

## Erste Analyse (Vorarbeit)

1. **Ursachenbaum:** Zuerst **Verdrahtung/Referenz/Modul** und **WiFi/I2C-Nebenwirkungen** prüfen
   (Bericht §4); parallel **Firmware-Log** 4095 mit Server-raw korrelieren.  
2. **Software-Optionen** (Mittelwert, Median, Hold-last-good) nur mit klarem **Safety-/Latency-
   Scope** — nicht als Ersatz für offenes Kabel.  
3. **Code-Anker (Verify):** Server `calibration_response_handler.py`, `calibration_service.py`,
   Mess-API `POST …/sensors/{esp}/{gpio}/measure` (Bericht §8); Firmware analog read Pfad für GPIO 32.

## Pflicht-Checks für SPECIALIST-PROMPTS

1. **esp32-debug / esp32-dev:** ADC-Konfiguration, Sampling, Warnlog „ADC rail“.  
2. **server-debug:** Feuchte-Verarbeitung, quality-Regeln bei Rand-roh.  
3. **db-inspector (optional):** `sensor_configs` für ESP_EA5484 / GPIO 32 — nur Read-only laut Gate
   in STEUER-VORLAGE wenn DB-Evidence fehlt.
