---
run_mode: artefact_improvement
incident_id: ""
run_id: feuchte-wizard-nachweis-messkette-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md
scope: |
  **Schicht:** Querschnitt — **Evidenz, Nachweis, Regression** für die Messkette Wizard-Live-Messung.

  **Zweck:** Den im BERICHT §8 genannten **BLOCKER** („keine echten MQTT-Traces, Serial-Logs …“)
  systematisch abbauen: reproduzierbare Korrelation **pro Klick** (`request_id`), Abgleich Server-Logs
  (`CalibrationResponseHandler`, SensorService trigger), MQTT-Reihenfolge command/response,
  optional DB-Stichprobe `sensor_data`, optional ESP-Serial. **Kein Ersatz** für die drei
  Implementierungs-STEUER (Frontend/Backend/Firmware) — dies ist der **Nachweis- und Abnahme-Lauf**
  vor/nach Fix.

  **Artefakt-Pflicht:** CORRELATION-MAP (oder gleichwertige Tabelle) mit mindestens: HTTP-Request-ID,
  MQTT `request_id`/Payload-Ausschnitt, WS-`intent_id`/`correlation_id`, Zeitfenster.

  **Optional:** Kurzes additives Addendum zum BERICHT (nur wenn in target_docs explizit gewünscht —
  hier: **optional** im Run-Ordner als `EVIDENZ-NACHWEIS.md` statt docs/ zu ändern, um docs-Regel zu
  schonen; oder nur `.claude/reports/...`).

  **Abgrenzung:** Keine Produktcode-Änderung **in diesem Lauf**, es sei denn ein BLOCKER erzwingt
  einen Minimalfix — dann eigene PKG mit verify-plan. Standard: **Analyse + Dokumentation + Testplan-
  Update**.
forbidden: |
  Keine Secrets in Logs/Reports. Keine produktiven Zugangsdaten in Screenshots.
  Wenn Code-Fix nötig wird: auf Branch auto-debugger/work und separates PKG aus STEUER-Frontend/Backend/ESP.
done_criteria: |
  - Ordner `.claude/reports/current/auto-debugger-runs/feuchte-wizard-nachweis-messkette-2026-04-10/`
    enthält: INCIDENT-LAGEBILD oder `EVIDENZ-LAGEBILD.md`, `CORRELATION-MAP.md` (oder integriert),
    und bei Bedarf `TASK-PACKAGES.md` nur für Nachweis-Schritte (kein Pflicht-Code).
  - Messpunkte BERICHT §8 mindestens teilweise mit **echten** Zeilen/IDs belegt oder als BLOCKER mit
    messbarer Nachbedingung dokumentiert.
  - Klare Empfehlung: „Fix-STEUERn 1–3 vor/nach welcher Reihenfolge abnehmen“.
no_chat_questions: true
allow_user_escalation: false
---

# STEUER — Feuchte-Wizard: Nachweis Messkette (Evidenz & Regression)

**Bezugs-Analyse:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md` (§7–8)  
**Incident-Referenz:** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Orchestrierung:** `auto-debugger` → optional `server-debugger` / `mqtt-debug` / `esp32-debug` /
`meta-analyst` (nur Lesen/Reports)  
**Modus:** `artefact_improvement` mit Schwerpunkt **Evidence**, keine Implementierungspflicht

---

## 1. Problem-Lagebild

Die Hypothesen H1–H12 sind teils **code-stützbar**, aber für Produktentscheidung und Abnahme fehlen
**Laufzeitbelege** (BERICHT §3 BLOCKER). Diese STEUER füllt die Evidenzlücke — getrennt von den
Fix-Läufen.

---

## 2. Pflichtsequenz (Orchestrierung)

1. Git: Branch `auto-debugger/work` prüfen (Agent §0a).
2. **Repro:** Eine ESP-ID, ein GPIO, serialisierte Klicks „Messung starten“ (wie BERICHT §2).
3. **Server:** Log-Zeilen zu `Measurement triggered` / `request_id` und `CalibrationResponseHandler`
   (grep auf Logger-Namen / Module).
4. **MQTT:** command vs. response Topic mit `request_id` im Payload (Mosquitto-Log oder Client-Trace).
5. **WS:** Payload `calibration_measurement_received` (Browser-DevTools / WS-Log am Server).
6. **DB (optional):** `sensor_data` letzte Zeilen — Timestamp vs. Trigger (nur mit lokaler DB, keine
   Produktions-DB).

Ergebnis: **CORRELATION-MAP** mit Spalten: Schritt | Quelle | ID | Zeit | Befund.

---

## 3. Abgleich mit Fix-STEUERn

| STEUER | Was der Nachweis entscheidet |
|--------|------------------------------|
| Frontend Messkorrelation | Tritt falsche Zuordnung nur auf, wenn IDs nicht matchen? |
| Backend Fallback | Ist `raw` in der Response regelmäßig leer? Stimmt DB-„latest“ mit Intervall überein? |
| ESP32 Mutex | Serial-Log zeigt Überlappung Loop vs. manual? |

---

## 4. Regression nach Fixes

Nach Abschluss der Implementierungs-STEUER: dieselbe Checkliste erneut; **Delta** im Lagebild
(„vorher/nachher“) — ein Satz pro Hypothese (bestätigt/widerlegt/offen).

---

## 5. Akzeptanz

- Kein leerer Report: mindestens **ein** Hypothesen-Cluster mit Evidence oder begründetem BLOCKER
  (z. B. „MQTT-Trace fehlt — Nachbedingung: Broker-Log-Zugriff“).
- Übergabe an Robin: welche der drei Fix-STEUER durch Evidenz **priorisiert** werden.
