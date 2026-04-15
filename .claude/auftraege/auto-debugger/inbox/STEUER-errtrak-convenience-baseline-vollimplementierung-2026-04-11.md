---
# Steuerdatei — Vollimplementierung (Nachlauf Incident INC-2026-04-10-esp32-mqtt-tls-errtrak-6014)
run_mode: artefact_improvement
incident_id: ""
run_id: errtrak-convenience-baseline-2026-04-11
order: incident_first
target_docs:
  - .claude/reports/current/incidents/INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/INCIDENT-LAGEBILD.md
  - .claude/reports/current/incidents/INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/TASK-PACKAGES.md
  - .claude/reports/current/incidents/INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/VERIFY-PLAN-REPORT.md
scope: |
  **Ziel:** Convenience-Methoden in `ErrorTracker` so reparieren, dass Aufrufer die **kanonischen**
  absoluten Codes aus `El Trabajante/src/models/error_codes.h` (z. B. `ERROR_MQTT_DISCONNECT` = 3014,
  `ERROR_TASK_QUEUE_FULL` = 4062) **ohne erneute Range-Addition** an `trackError` durchreichen.

  **IST-Bug (evidenzbasiert):** `logCommunicationError` macht `trackError(ERROR_COMMUNICATION + code, …)`
  mit `ERROR_COMMUNICATION = 3000`, während alle Produktions-Call-Sites **vollständige** 3xxx-Codes
  übergeben → z. B. 6014; `getCategoryString` akzeptiert COMMUNICATION nur `< 4000` → Log zeigt
  `[UNKNOWN]`. Gleiches Baseline-Muster betrifft `logApplicationError` (4xxx + 4000 → 8xxx, ebenfalls
  außerhalb der Kategoriefenster). `logServiceError` / `logHardwareError` analog absichern
  (API-Konsistenz + zukünftige Call-Sites), auch wenn aktuell keine `logServiceError`-Produktionsaufrufe
  in `src/` existieren.

  **Nicht-Ziel dieses Laufs:** Root-Cause für `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` (Infrastruktur) —
  dafür bleiben Incident-`CORRELATION-MAP.md` / PKG-02 separat; kein Umbau MQTT-Reconnect/TLS-Stack.

  **Ablauf (eure Patterns):**
  1) Branch `auto-debugger/work` verifizieren.  
  2) Skill **`verify-plan`** auf diese STEUER + die unten genannten Dateipfade — Chat-Block
     **OUTPUT FÜR ORCHESTRATOR** + **`VERIFY-PLAN-REPORT.md`** unter
     `.claude/reports/current/auto-debugger-runs/errtrak-convenience-baseline-2026-04-11/`.  
  3) **`esp32-dev`** (Skill: `.claude/skills/esp32-development/SKILL.md`, Regeln: `.cursor/rules/firmware.mdc`)
     implementiert PKG-01; bei Abweichungen aus Verify: TASK-PACKAGES im Run-Ordner nachziehen.  
  4) Build-Verifikation exakt wie unten; kein Merge nach `master` in diesem Auftrag.

forbidden: |
  Keine Secrets (Broker-URIs mit Credentials, NVS-Inhalte, JWT). Kein `git push --force` auf Shared-Remotes.
  Keine Commits auf `master`. Kein `delay()` in der Haupt-Loop (unverändert Projektregel). Keine neue
  Nutzung von Arduino `String` in heißen Pfaden einführen — bestehende `ErrorTracker`-Strings nicht
  ausbreiten. Safety-kritische Änderungen an `safety_controller` / Aktor-Logik **nicht** Teil des Scopes.
  `.claude/reference/errors/ERROR_CODES.md` nur anfassen, wenn nach Fix ein **dokumentierter** Widerspruch
  zur tatsächlich geloggten Code-Zahl bleibt (sonst weglassen). Kein TLS-Topic-Schema / kein MQTT-Topic-Change.

done_criteria: |
  - `verify-plan` ausgeführt; `VERIFY-PLAN-REPORT.md` liegt unter
    `.claude/reports/current/auto-debugger-runs/errtrak-convenience-baseline-2026-04-11/`
    und ist konsistent mit Chat-Block **OUTPUT FÜR ORCHESTRATOR (auto-debugger)**.
  - PKG-01: `error_tracker.cpp` — alle vier Convenience-Logger (`logHardwareError`, `logServiceError`,
    `logCommunicationError`, `logApplicationError`) mit einheitlicher Semantik: **Wenn `code` bereits in
    der Zielspanne der jeweiligen Kategorie liegt** (`[1000,2000)`, `[2000,3000)`, `[3000,4000)`,
    `[4000,5000)` — Grenzen wie `error_codes.h` / `error_tracker.h`-Enums), dann `trackError(code, …)`;
    **sonst** bisherige Addition (`ERROR_* + code`) für echte Offsets (Tests/Archive).
  - Optional: Kurzkommentar in `error_tracker.h` unter den Convenience-Deklarationen: Aufrufer sollen
    bevorzugt **Defines aus `error_codes.h`** übergeben (absolute Codes).
  - Build: `cd "El Trabajante" && pio run -e seeed_xiao_esp32c3` Exit-Code 0.
  - Akzeptanz-Serial (nach Flash): Bei `MQTT_EVENT_DISCONNECTED` ERRTRAK zeigt **3014** und Kategorie
    **COMMUNICATION**, nicht 6014/UNKNOWN (manuelle oder bestehende Hardware-Prüfung durch Robin).
  - Incident-Ordner `INC-2026-04-10-esp32-mqtt-tls-errtrak-6014/`: optionaler Verweis in
    `INCIDENT-LAGEBILD.md` Abschnitt „Eingebrachte Erkenntnisse“ mit Datum, dass PKG-01 umgesetzt wurde
    (ein Eintrag reicht) — **nur** wenn dieser Lauf das dokumentiert; kein Löschen bestehender Analyse.
---

# STEUER — ERRTRAK: Convenience-Baseline (Vollimplementierung)

**Chat-Start (empfohlen):**

```text
@.claude/skills/verify-plan/SKILL.md
@.claude/auftraege/auto-debugger/inbox/STEUER-errtrak-convenience-baseline-vollimplementierung-2026-04-11.md

Bitte verify-plan auf Scope + Pfade; OUTPUT FÜR ORCHESTRATOR; danach VERIFY-PLAN-REPORT im run_id-Ordner.
```

```text
@.claude/agents/esp32-dev.md
@.claude/skills/esp32-development/SKILL.md
@.claude/auftraege/auto-debugger/inbox/STEUER-errtrak-convenience-baseline-vollimplementierung-2026-04-11.md

Branch auto-debugger/work; PKG-01 gemäß STEUER; pio seeed_xiao_esp32c3 grün.
```

---

## Executive Summary

Der Incident hat **ISSUE-SW-01** belegt: Baseline wird **doppelt** angewendet, obwohl Call-Sites **absolute**
Codes aus `error_codes.h` nutzen. Die Implementierung korrigiert **ein zentrales API-Stück**
(`error_tracker.cpp`), statt jeden Aufrufer von Hand auf „Offset“ umzubauen — das entspricht eurem
**Pattern-Reuse**-Prinzip und minimiert Diff-Risiko.

---

## Bezugs- und Pflichtdateien (Repo-IST)

| Rolle | Pfad |
|-------|------|
| Implementierung | `El Trabajante/src/error_handling/error_tracker.cpp` |
| API / Doku-Kommentar | `El Trabajante/src/error_handling/error_tracker.h` |
| Code-Defines | `El Trabajante/src/models/error_codes.h` |
| Trigger Beispiel MQTT | `El Trabajante/src/services/communication/mqtt_client.cpp` (Disconnect → `logCommunicationError`, ca. Zeile 1179) |
| Trigger Beispiel Application | `El Trabajante/src/tasks/publish_queue.cpp`, `sensor_command_queue.cpp`, `actuator_command_queue.cpp`, `main.cpp` (`ERROR_TASK_QUEUE_FULL`, `ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL`) |

**Kanonische Zahlen (Abnahme):**

- Nach Fix: Disconnect-Log **3014**, nicht 6014.
- `ERROR_TASK_QUEUE_FULL` (4062) darf nicht als 8062 in ERRTRAK erscheinen.

---

## Arbeitspakete (Reihenfolge)

### PKG-00 — Gate: verify-plan (Pflicht vor erstem Produkt-Commit)

**Ziel:** Reality-Check dieser STEUER + Pfade + Build-Env-Name.

**Aktion:**

1. Skill `.claude/skills/verify-plan/SKILL.md` anwenden.
2. Ordner anlegen (falls fehlend):  
   `.claude/reports/current/auto-debugger-runs/errtrak-convenience-baseline-2026-04-11/`
3. Datei **`VERIFY-PLAN-REPORT.md`** dort ablegen — inkl. kopiertem Block
   **OUTPUT FÜR ORCHESTRATOR (auto-debugger)** (PKG-Tabelle, BLOCKER, Rollen).

**Abhängigkeit:** Keine.

---

### PKG-01 — ErrorTracker: Baseline-Idempotenz (Kernimplementierung)

**Ziel:** Doppel-Offset eliminieren, Kategorie `getCategoryString` / `getCategory` wieder konsistent.

**Implementierungsregel (normativ, alle vier Methoden gleich strukturiert):**

- `logHardwareError`: wenn `code >= ERROR_HARDWARE && code < ERROR_SERVICE` → `trackError(code, …)`; sonst `trackError(ERROR_HARDWARE + code, …)`.
- `logServiceError`: wenn `code >= ERROR_SERVICE && code < ERROR_COMMUNICATION` → `trackError(code, …)`; sonst `trackError(ERROR_SERVICE + code, …)`.
- `logCommunicationError`: wenn `code >= ERROR_COMMUNICATION && code < ERROR_APPLICATION` → `trackError(code, …)`; sonst `trackError(ERROR_COMMUNICATION + code, …)`.
- `logApplicationError`: wenn `code >= ERROR_APPLICATION && code < 5000` → `trackError(code, …)`; sonst `trackError(ERROR_APPLICATION + code, …)`.

**Hinweis:** Obere Grenze `5000` für Application entspricht dem bestehenden `getCategoryString`-Fenster
(`< 5000` für APPLICATION in `error_tracker.cpp`).

**Nicht tun:** Keine mechanische Suche/Ersetzung aller Call-Sites auf „Offset“ — nicht nötig nach dieser API-Korrektur.

**Verify (exakt, Pflicht):**

```text
cd "El Trabajante"
pio run -e seeed_xiao_esp32c3
```

**Akzeptanz:**

- [ ] `pio run` Exit 0.
- [ ] Nach manuellem Test am Gerät: Disconnect zeigt in ERRTRAK **3014** + Kategorie **COMMUNICATION** (kein UNKNOWN durch falsche Spanne).
- [ ] Throttle-Logik unverändert nutzbar (`error_code % 32` — bewusst keine Änderung am Slotting ohne separates PKG).

**Abhängigkeit:** Nach PKG-00.

---

### PKG-02 — Referenz-Doku (optional, nur bei Diskrepanz)

**Ziel:** `.claude/reference/errors/ERROR_CODES.md` nur dann minimal ergänzen/korrigieren, wenn dort
explizit eine **falsche** Erklärung zu „6014“ o. Ä. steht **oder** das Verhalten MQTT-Disconnect nach Fix
nicht mit 3014 beschrieben ist.

**Abhängigkeit:** Nach PKG-01 und nur wenn Verify/Incident-Abgleich eine Lücke zeigt.

---

## Regression & Archiv-Tests

- `El Trabajante/test/_archive/` nutzt teils **Offsets** (z. B. `logCommunicationError(1, …)`). Nach der
  normativen Regel bleiben diese gültig (Zweig `ERROR_COMMUNICATION + code`). Kein Stilllegen der Archive
  ohne separates Aufräum-PKG.

---

## forbidden / done_criteria

Vollständig im **YAML-Frontmatter** — bei Konflikt gewinnt Frontmatter.

---

## SPECIALIST-PROMPTS (Kurzblock — Copy-Paste für esp32-dev)

**Git (Pflicht):** Arbeitsbranch **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work`
und `git branch --show-current` verifizieren. Alle Commits dieses Auftrags nur auf diesem Branch; kein
Commit auf `master`; kein `git push --force`.

**KONTEXT:** STEUER `STEUER-errtrak-convenience-baseline-vollimplementierung-2026-04-11.md` + Incident
`INC-2026-04-10-esp32-mqtt-tls-errtrak-6014`.

**AUFTRAG:** PKG-01 in `error_tracker.cpp`/`error_tracker.h` umsetzen; Pattern wie oben; kein Scope-Drift
auf MQTT-TLS-Infrastruktur.

**DATEIEN:** siehe Tabelle „Bezugs- und Pflichtdateien“.

**OUTPUT:** Commit(s) auf `auto-debugger/work`; bei optional PKG-02 nur nach explizitem Verify-Hinweis.

---

## Aktivierung (Robin — kompakt)

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-errtrak-convenience-baseline-vollimplementierung-2026-04-11.md
Zuerst verify-plan + VERIFY-PLAN-REPORT unter auto-debugger-runs/errtrak-convenience-baseline-2026-04-11/,
danach esp32-dev PKG-01; Branch auto-debugger/work; kein TLS/Broker-Scope.
```
