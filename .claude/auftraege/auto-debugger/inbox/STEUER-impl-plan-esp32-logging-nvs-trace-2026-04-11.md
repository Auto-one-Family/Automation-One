---
run_mode: artefact_improvement
incident_id: INC-ESP32-SERIAL-LOGGING-2026-04-11
run_id: impl-plan-esp32-logging-nvs-trace-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-ESP-LOG-NVS-TRACE-2026-04-11.md
scope: |
  **Ziel:** Einen **vollständigen**, **repo-verifizierten** Implementierungsplan schreiben, der **exakt festlegt**,
  **welche Log-Zeilen** (Datei, ungefähre Anker nach `Read`/`Grep`, Log-Level, Message-Schema, max. Datenlänge)
  **wo** in der Firmware eingefügt oder ersetzt werden — zur Nachverfolgung von **MQTT-Eingang**, **NVS-Transaktionen**
  und **Config-/Heartbeat-Handling**.

  **Vorarbeit (Pflichtlektüre, nicht erfinden):**
  - Ergebnis aus `STEUER-esp32-serial-logging-nvs-mqtt-2026-04-11.md`, falls vorhanden:
    `.claude/reports/current/incidents/INC-ESP32-SERIAL-LOGGING-2026-04-11/IST-ESP-MQTT-NVS-TRACEPOINTS.md`
  - Querschnitt NVS: `El Trabajante/src/services/config/storage_manager.cpp`,
    `El Trabajante/src/services/config/config_manager.cpp`, `El Trabajante/src/main.cpp` (MQTT + Config + Heartbeat-ACK).
  - Referenz: `.claude/reference/api/MQTT_TOPICS.md` (nur Abgleich Topic-Namen, keine Protokolländerung).

  **Deliverable-Datei (exakt dieser Pfad, neu anlegen oder vollständig ersetzen):**
  `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-ESP-LOG-NVS-TRACE-2026-04-11.md`

  **Verbindliche Gliederung des Implementierungsplans:**

  1. **Titel + Metadata:** Datum, Branch `auto-debugger/work`, Paket-ID `PKG-ESP-LOG-NVS-TRACE`, keine Secrets.

  2. **IST (1 Abschnitt):** Kurz: aktuelle Logger-Nutzung (TAGs), bekannte Lücken aus `IST-ESP-MQTT-NVS-TRACEPOINTS.md`
     — falls Datei fehlt, im Plan dokumentieren „BLOCKER: STEUER-esp32-serial-logging zuerst“.

  3. **SOLL:** Messbare Log-Ziele (z. B. „bei jedem `/config`-Empfang: Topic + `correlation_id` + Sensoranzahl“;
     „bei Mutex-Timeout: wartender Pfad vs. kein Owner-Log wenn technisch nicht möglich“ — ehrlich kennzeichnen).

  4. **Tabelle „Log-Insertion-Matrix“ (Kern des Dokuments):**  
     Spalten mindestens: **ID** | **Datei** | **Ort (Funktion / STEP-Kommentar)** | **Trigger** | **Level**
     | **Message-Pattern (Beispiel)** | **Datenfelder (max. Länge)** | **Abhängigkeit** (z. B. nach #3).  
     Mindestens **12 Zeilen** (kann mehrere Zeilen pro Datei sein), in **Ausführungsreihenfolge** nummeriert.

  5. **NVS-spezifisch:** eigene Untertabelle für `beginTransaction` / `beginNamespace` / `endTransaction` / `endNamespace`
     und für `setDeviceApproved` — inkl. ob **Dauer** (`micros()`/`millis()`-Delta) geloggt wird und **Risiko** für Timing.

  6. **MQTT-Eingang:** Zeilen für ersten zentralen Dispatch (Topic-Länge, letzte Topic-Segment-Chars) + pro
     **kritischem** Sub-Handler (config, heartbeat ack, system command) nur wenn in Matrix nicht redundant.

  7. **Tests / Verify:** `pio run -e esp32_dev`; optional `pio test -e native` nur wenn reine Hilfsfunktionen betroffen;
     PowerShell-`cd` mit vollem Pfad.

  8. **Risiken:** Serial-Überlauf, Timing, Flash-Write-Verlängerung durch zusätzliche Logs — Mitigation (DEBUG-Guard,
     `#ifdef`).

  9. **Abgrenzung:** Keine Server-/Frontend-Änderungen in diesem Plan; kein PKG-CAL-*.

  **Gate:** Vor Umsetzung durch Dev-Agenten **verify-plan** auf diese Plan-Datei
  (Skill `.claude/skills/verify-plan/SKILL.md`); Output für Orchestrator ablegen unter
  `.claude/reports/current/auto-debugger-runs/impl-plan-esp32-logging-nvs-trace-2026-04-11/VERIFY-PLAN-REPORT.md`
  oder im Incident-Ordner.
forbidden: |
  Keine erfundenen Zeilennummern — nur nach `Read`/`Grep` verifizierte Anker („ca. Zeile X“ oder Funktionsname + eindeutiger String im File).
  Keine Secrets in Beispiel-Payloads.
  Keine Protokoll-/Topic-Änderungen.
  Keine Commits auf `master`.
done_criteria: |
  Die Datei `implementierungsplan-PKG-ESP-LOG-NVS-TRACE-2026-04-11.md` existiert unter `target_docs[0]`.

  Die **Log-Insertion-Matrix** enthält ≥12 Zeilen mit allen Pflichtspalten.

  Unterpunkte **NVS** und **MQTT-Eingang** sind ausgefüllt (keine Platzhalter „TBD“ ohne BLOCKER-Verweis).

  verify-plan-Report-Pfad wie in `scope` genannt existiert oder ist im Plan als Ausnahme begründet.
---

# STEUER — Implementierungsplan PKG-ESP-LOG-NVS-TRACE

**Paket-ID:** `PKG-ESP-LOG-NVS-TRACE`  
**Kurztitel:** Serial-Logging: exakte Platzierung für MQTT-Empfang, NVS, Config/Heartbeat.

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-esp32-logging-nvs-trace-2026-04-11.md
```

## Voraussetzung

Idealerweise zuerst (oder parallel konsistent halten):

`STEUER-esp32-serial-logging-nvs-mqtt-2026-04-11.md` → `IST-ESP-MQTT-NVS-TRACEPOINTS.md`

## Git

`git checkout auto-debugger/work`

---

*Ende STEUER*
