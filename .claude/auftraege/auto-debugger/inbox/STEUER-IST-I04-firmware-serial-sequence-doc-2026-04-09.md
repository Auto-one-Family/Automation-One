---
run_mode: artefact_improvement
incident_id: ""
run_id: ist-i04-firmware-serial-doc-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - El Trabajante/src/mqtt/mqtt_client.cpp
  - El Trabajante/src/services/intent_contract.cpp
scope: |
  Firmware: Ein Markdown-Dokument mit **Beispielsequenz** Boot → Connect → Publish, Beispielzeilen **ohne** Secrets.

  Akzeptanz:
  (1) Markdown-Datei unter `docs/` (Pfad im verify-plan gegen bestehende Firmware-Doku abgleichen).
  (2) Verweise auf `seq`, `correlation_id` / relevante Felder im Code (repo-relative Pfade).
  (3) CI-Check optional — wenn ja, nur mit bestehender Pipeline-Struktur (kein neues externes Tool ohne Gate).

  Kein Pflicht-Code-Change an der Firmware in diesem Auftrag; reine Doku-first, optional Querverweise auf Wokwi/SIL wie IST § G.
forbidden: |
  Keine Secrets (keine WLAN-Creds, keine Tokens). Keine falschen GPIO-/Device-IDs als „live“ deklariert.
  Kein Commit auf master; nur auto-debugger/work.
done_criteria: |
  Neue/aktualisierte Doku-Datei reviewbar; Links zu `mqtt_client.cpp` / `intent_contract.cpp` korrekt; Nutzer kann Sequenz
  mit Hardware/Wokwi gegenprüfen.
---

# STEUER — I04 Firmware Serial-Beispielsequenz (Doku)

**IST-Referenz:** § I Punkt 4.

## Schritte

1. **verify-plan**: Zielpfad unter `docs/` (z. B. `docs/debugging/` oder `docs/wokwi/` — nächstliegende bestehende Struktur).
2. **esp32-dev** oder **updatedocs**: Markdown schreiben.
3. Optional **auto-debugger** für TASK-PACKAGES nur wenn Orchestrierung gewünscht.

## Zuständige Agenten

| Phase | Agent / Skill |
|--------|----------------|
| Gate Pfad | **verify-plan** |
| Inhalt / C++-Verweise | **esp32-development** |
| Nur Markdown-Stil | **updatedocs** |
| Serial-Realität | **esp32-debug** (optional Kontext, keine Pflicht) |

## Chat-Start

```text
@.claude/auftraege/auto-debugger/inbox/STEUER-IST-I04-firmware-serial-sequence-doc-2026-04-09.md
verify-plan Zielpfad, dann esp32-dev: Markdown Boot→Connect→Publish mit correlation_id/seq; keine Secrets.
```
