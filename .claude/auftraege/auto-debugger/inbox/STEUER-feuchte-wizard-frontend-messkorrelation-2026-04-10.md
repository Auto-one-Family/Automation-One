---
run_mode: artefact_improvement
incident_id: ""
run_id: feuchte-wizard-frontend-messkorrelation-2026-04-10
order: incident_first
target_docs:
  - docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md
scope: |
  **Schicht:** El Frontend (Wizard Live-Messung „Messung starten“).

  **Root-Cause-Cluster (aus BERICHT):** H1, H6, H11 — fehlende Zuordnung eingehender
  `calibration_measurement_received`-Events zur jeweils ausgelösten `request_id`; defekter
  Zeit-Guard; mehrere in-flight Requests ohne „latest wins“-Semantik.

  **IST (repo-verifiziert):** `useCalibrationWizard.ts` speichert `measurementRequestId` nach
  `sensorsApi.triggerMeasurement`, filtert WS-Events nur nach `esp_id`/`gpio`/optional `session_id`,
  vergleicht **nicht** `intent_id`/`correlation_id` mit `measurementRequestId`. Der Check
  `eventReceivedAt < triggeredAt` ist praktisch wirkungslos, weil `eventReceivedAt = Date.now()`
  beim Event und `triggeredAt` beim Trigger beide Client-Zeiten sind — kein Schutz vor
  verspäteten/alten Payloads nach neuem Klick.

  **SOLL:** Strikte Korrelation: Ein WS-Event aktualisiert `lastRawValue` nur, wenn
  `data.intent_id` oder `data.correlation_id` (Konvention: gleiche UUID-Kette wie Server-
  `publish_sensor_command`, vgl. `publisher.py`) mit dem zuletzt gesetzten
  `measurementRequestId` übereinstimmt. Optional: „Stale ignore“ — Events mit passendem
  esp/gpio aber **fremder** Request-ID nicht anzeigen (Logging/Debug optional). Optional UX:
  Doppelklick entkoppeln (Button-Debounce oder Queue: nur letzter Request zählt) innerhalb
  derselben Komponente ohne neue Notification-Welt.

  **Abgrenzung:** Keine Änderung an Finalize/Apply/moisture_2point-Persistenz; kein Ersatz für
  Backend-Fallback oder Firmware-Mutex — siehe getrennte STEUER-Dateien.
forbidden: |
  Keine Secrets. Branch auto-debugger/work für Produktänderungen; kein Commit auf master durch Agenten.
  Keine zweite Toast-/Notification-Infrastruktur; bestehende `useWebSocket`-Patterns und Cleanup in
  onUnmounted beibehalten. Keine Hex-Farben; Tailwind + Design-Tokens.
  Bash nur: erlaubte Git-Kommandos laut auto-debugger Agent §0a.
done_criteria: |
  - `npx vue-tsc --noEmit` und `npx vitest run` (mindestens betroffene Tests / neue Tests für WS-Filter)
    im Ordner El Frontend grün.
  - Manuelles oder dokumentiertes Review: Mehrfach „Messung starten“ führt nicht dazu, dass ein
    älteres Event den Rohwert überschreibt, wenn ein neuerer Request aktiv ist (Intent-Match).
  - TASK-PACKAGES.md + SPECIALIST-PROMPTS.md + VERIFY-PLAN-REPORT.md unter
    `.claude/reports/current/auto-debugger-runs/feuchte-wizard-frontend-messkorrelation-2026-04-10/`
    nach verify-plan-Gate; FEHLER-REGISTER bei Code-PKGs gepflegt.
no_chat_questions: true
allow_user_escalation: false
---

# STEUER — Feuchte-Wizard: Frontend Mess-Korrelation (Request-ID ↔ WS-Event)

**Bezugs-Analyse:** `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-messmodus-wizard-on-demand-2026-04-10.md` (§3–5, H1/H6/H11)  
**Incident-Referenz (Meta):** `INC-2026-04-10-feuchte-wizard-messwert-streuung`  
**Orchestrierung:** `auto-debugger` → Delegation `frontend-dev`  
**Modus:** `artefact_improvement` mit Implementierungs-PKGs nach `/verify-plan`

---

## 1. Problem-Lagebild (kanonisch)

Symptom: Nach mehrfach „Messung starten“ schwankt die **Roh-ADC**-Anzeige; Werte wirken nicht der
letzten Anforderung zugeordnet. Der Bericht ordnet das primär der **fehlenden Korrelation** zwischen
HTTP/MQTT-`request_id` und dem WS-Payload zu — nicht der bereits gefixten `moisture_2point`-
Finalize-Kette (BERICHT §6).

---

## 2. Pattern-Scan (Pflicht vor PKG)

- **Closest implementation:** `El Frontend/src/composables/useCalibrationWizard.ts` — bestehende
  Filter für `esp_id`/`gpio`/`session_id`; erweitern um ID-Match, nicht parallelen Composable.
- **API-Kette:** `sensorsApi.triggerMeasurement` → Response `request_id`; Server setzt in MQTT
  `request_id`/`intent_id`/`correlation_id` konsistent (`El Servador/.../mqtt/publisher.py`).
- **WS:** Events `calibration_measurement_received` / `_failed` — Filter in `useWebSocket` bereits
  typgebunden; Cleanup bleibt in `onUnmounted`.

---

## 3. Arbeitspakete (Vorschlag; nach verify-plan schärfen)

### PKG-FE-01 — Korrelationslogik im WS-Handler

**Owner:** frontend-dev  
**Dateien:**

- `El Frontend/src/composables/useCalibrationWizard.ts` (Handler `calibration_measurement_received`,
  `triggerLiveMeasurement`)

**Inhalt:**

1. Nach erfolgreichem Trigger: `measurementRequestId` = API-`request_id` (unverändert lassen).
2. Im WS-Handler: Nur wenn  
   `(data.intent_id === measurementRequestId || data.correlation_id === measurementRequestId)`  
   (string-Vergleich, null-safe) **und** esp/gpio/session wie bisher — dann `setLastRawValue`.
3. Events mit fremder ID: nicht `lastRawValue` setzen (optional: `lifecycleMessage` / Debug nur in
   Dev, ohne neue Alert-Welt).
4. Den Block `eventReceivedAt < triggeredAt` **ersetzen oder ergänzen** durch sinnvolle Logik
   (z. B. Monotonie-„generation“ pro Trigger: Zähler erhöhen bei jedem Klick; Event nur annehmen,
   wenn `data` zur aktuellen Generation passt — **nur** wenn verify-plan ein einfacheres
   ID-Match nicht reicht).

**Verify:**

```text
cd "El Frontend" && npx vue-tsc --noEmit
cd "El Frontend" && npx vitest run --reporter=dot
```

### PKG-FE-02 — Tests (Vitest)

**Owner:** frontend-dev  
**Dateien:** bestehende Testdatei zu `useCalibrationWizard` oder neue Spec nahe Composables.

**Inhalt:** Mock WS: zwei Events mit gleichem esp/gpio aber unterschiedlicher `intent_id` — nur das
zur aktuellen `measurementRequestId` passende aktualisiert `lastRawValue`.

---

## 4. Schnittstellen & Abhängigkeiten

- **Parallel:** Kann unabhängig von Backend-STEUER (Fallback) und Firmware-STEUER (Mutex) umgesetzt
  werden — Gesamtverhalten erst nach Integration aller drei messbar.
- **Mit Backend abgleichen:** Falls WS-Payload künftig explizit `request_id` enthält (Backend-STEUER),
  Frontend sollte denselben Schlüssel akzeptieren (einheitliche Namenskonvention im verify-plan
  festhalten).

---

## 5. Akzeptanz (Gesamt dieser STEUER)

- Kein Überschreiben von `lastRawValue` durch ein Event, das nicht zur letzten gültigen
  `measurementRequestId` gehört (unter idealer Netzwerkannahme; Rest-HW/Race siehe andere STEUER).
- Dokumentierte Verify-Befehle grün; VERIFY-PLAN-REPORT widerspricht nicht den echten Pfaden im Repo.
