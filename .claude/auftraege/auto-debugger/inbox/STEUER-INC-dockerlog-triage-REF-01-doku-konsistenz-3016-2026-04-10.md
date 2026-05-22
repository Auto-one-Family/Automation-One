---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-triage-ref01-doku-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
# konsolidierung_step: single
target_docs:
  - docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - docs/debugging/logql-queries.md
  - .claude/reference/errors/ERROR_CODES.md
scope: |
  **Code-Baseline (repo-verifiziert):** Der Kommunikationscode fuer ungueltige/malformed MQTT-Payloads ist
  **3016** (`ERROR_MQTT_PAYLOAD_INVALID` / `CommunicationErrorCode.MQTT_PAYLOAD_INVALID`), nicht 6016.
  Firmware: `El Trabajante/src/models/error_codes.h`; Server: `El Servador/god_kaiser_server/src/core/error_codes.py`;
  UI-Mapping: `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` (Eintrag 3016).

  **Ziel:** Alle **IST-/Steuer-/Referenz**-Texte, die noch „6016“ im Kontext EMERGENCY_PARSE_ERROR / MQTT-Payload
  nennen, **korrigieren oder klar als Tippfehler** markieren — konsistent mit `INCIDENT-LAGEBILD.md` und
  `IST-docker-log-triage` §2.1.

  **Additiv:** Kurzverweise im IST-Triage-Dokument auf die **strengen** Produktmuster:
  - MQTT: `kaiser/+/esp/+/system/error` → Handler `error_handler.handle_error_event`, Registrierung in
    `El Servador/god_kaiser_server/src/main.py` (Zeilenblock um `register_handler(..., "kaiser/+/esp/+/system/error", ...)`).
  - Kritische Topics: `El Servador/god_kaiser_server/src/mqtt/subscriber.py` (`_is_critical_topic` inkl. `system/error`).
  - Broadcast-Emergency Parse-Fail: `El Trabajante/src/main.cpp` (Zweig `broadcast_emergency_topic`,
    `errorTracker.logCommunicationError(ERROR_MQTT_PAYLOAD_INVALID, ...)`).

  **LogQL / Screening (Klasse C):** In `docs/debugging/logql-queries.md` pruefen, ob Abschnitte zu Volltext `error`
  vs. Feld-/Label-Filtern die Triage A/B/C stuetzen; nur **additive** Klarstellungen (kein Rewrite der gesamten Datei).

  **ERROR_CODES.md:** Nur wenn dort 3016/6016-Verwechslung oder Luecke zur MQTT-Payload-Klasse besteht — minimal ergaenzen.

  Querverbindung Incident: `.claude/reports/current/incidents/INC-2026-04-09-dockerlog-obs-triage/CORRELATION-MAP.md`
  bei Widerspruch aktualisieren (ein Satz), nicht duplizieren.
forbidden: |
  Keine Secrets. Keine Breaking Changes an REST/MQTT/WebSocket/DB-Schemas oder Topic-Namen.
  Keine Firmware-/Server-**Verhaltensaenderung** in diesem Lauf — nur Markdown-Referenzen und Konsistenz.
  Commits nur auf Branch `auto-debugger/work`; kein `git push` / force durch Agenten.
  Keine flaechige Umschreibung der Correlation-Contracts — Praefenz: Querverweise und Zahlencode-Fixes.
done_criteria: |
  Alle genannten `target_docs` sind durchsucht: „6016“ im Kontext MQTT-Payload/Emergency ist bereinigt **oder**
  einmalig als historischer Such-/Tippfehler mit korrektem **3016** erklaert.
  IST-docker-log-triage enthaelt explizit die repo-stimmigen Pfade/Handler (oder Verweis auf INCIDENT-LAGEBILD §Pattern-Scan).
  `docs/debugging/logql-queries.md`: bei Bedarf ein klarer Hinweis, dass reine `|= "error"`-Queries Klasse-C-Artefakte
  erzeugen koennen — ohne bestehende funktionierende Queries zu brechen.
  Abnahme: Leseprüfung + `grep` auf verbleibende widersprüchliche „6016“-Nennungen im Scope der target_docs.
---

# STEUER — REF-01: Doku-Konsistenz (3016) + Triage-SSoT

**Bezug:** `INC-2026-04-09-dockerlog-obs-triage` (Nachziehen nach Code-Analyse 2026-04-10).  
**Agent:** `auto-debugger`  
**Modus:** `artefact_improvement`  
**Run-ID:** `dockerlog-triage-ref01-doku-2026-04-10`

## Kurzbegründung

Die aeltere Steuerkette (STEUER-01–03, 2026-04-09) spricht teils von **6016**; der einheitliche Code im Repo ist **3016**
fuer `ERROR_MQTT_PAYLOAD_INVALID`. Dieses REF-Paket stellt Doku und Referenz ohne Produktcode-Aenderung gerade.

## Runbook (imperativ)

1. `git checkout auto-debugger/work`; `git branch --show-current` verifizieren.
2. `target_docs` oeffnen; `grep` / Suche nach `6016` und Kontext pruefen.
3. Korrekturen/additive Abschnitte gemaess `scope`; CORRELATION-MAP nur bei inhaltlichem Zwang an einen Satz anpassen.
4. Kein TASK-PACKAGES-Zwang — reine Doku. (Folge: REF-02/03 bei Ops- oder Test-Paketen.)

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-INC-dockerlog-triage-REF-01-doku-konsistenz-3016-2026-04-10.md
Bitte REF-01 gemaess Frontmatter: 3016-Konsistenz, IST- und LogQL-Querverweise, kein Produktcode.
```
