---
# Steuerdatei fuer auto-debugger (YAML-Frontmatter)
run_mode: artefact_improvement
incident_id: INC-2026-04-09-dockerlog-obs-triage
run_id: dockerlog-triage-ref03-tests-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs: []
scope: |
  `target_docs` absichtlich leer: dieser Lauf **validiert** den Produktpfad Klasse **A** gegen Tests und Code — Ergebnis
  in Run-Artefakten oder Incident-`INCIDENT-LAGEBILD.md` Abschnitt „Eingebrachte Erkenntnisse“ dokumentieren.

  **Repo-nachweisbare Produktkette (3016 / system/error):**
  - MQTT-Topic `kaiser/+/esp/+/system/error` → `ErrorEventHandler` in
    `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`.
  - Registrierung: `El Servador/god_kaiser_server/src/main.py` (`register_handler` fuer `system/error`).
  - Kritisches Topic-Flag: `El Servador/god_kaiser_server/src/mqtt/subscriber.py` (`_is_critical_topic`, Suffix `system/error`).
  - Server-Fehlercode 3016: `El Servador/god_kaiser_server/src/core/error_codes.py` (`MQTT_PAYLOAD_INVALID`);
    Mapping/Troubleshooting: `esp32_error_mapping.py`.
  - Firmware: `El Trabajante/src/main.cpp` Broadcast-Emergency-Zweig mit `EMERGENCY_PARSE_ERROR` und
    `ERROR_MQTT_PAYLOAD_INVALID` (Header `error_codes.h`).

  **Ziel:**
  1. Relevante **pytest**-Teilmengen ausfuehren (nicht zwingend volles 1820+ Suite): mindestens
     `tests/unit/test_topic_validation.py` (Topic-Parsing `system/error`),
     `tests/integration/test_mqtt_subscriber.py` (`_is_critical_topic` fuer `system/error`),
     `tests/integration/test_contract_ingress_matrix_t1_t6.py` (ErrorEventHandler-Pfad),
     sowie gezielte `grep`-/Read-Verifikation, dass **3016** in Server-Mapping und Tests konsistent ist.
  2. **Keine** Verhaltensaenderung, solange alle Tests gruen und keine Luecke im Contract sichtbar — dann Ergebnis
     als „Pfad im Repo verifiziert (Datum)“ in Run-`README.md` oder Incident-Lagebild eintragen.
  3. **Nur** wenn Tests rot oder Contract-Luecke: TASK-PACKAGES unter
     `.claude/reports/current/auto-debugger-runs/dockerlog-triage-ref03-tests-2026-04-10/` mit **einem** fokussierten
     Fix-Paket (Owner z. B. server-dev), danach **verify-plan** und Post-Verify-Anpassung gemaess Skill `auto-debugger`.

  **WebSocket:** `error_event` vs. NotificationRouter/Inbox **nicht vermischen** (Agent `auto-debugger` §1.4) — bei
  Dokumentation der Testergebnisse explizit trennen.

  Begruendung leeres `target_docs`: reine Verifikation/Tests; optionaler Markdown-Nachtrag nur in Incident oder Run-README.
forbidden: |
  Keine Secrets. Keine MQTT-Topic- oder Payload-Breaking-Changes ohne separates Gate und Product-Review.
  Keine Aenderung am SafetyController oder Logic-Engine aus diesem Steuerlauf (nicht im Scope).
  Branch `auto-debugger/work` fuer jede Code-Aenderung; kein `git push` / force durch Agenten.
  Keine gruenen Behauptungen ohne ausgefuehrte pytest-Zeilen (Evidenz im Run-Ordner oder Terminal-Log-Zitat).
done_criteria: |
  Nachweis: pytest-Subset aus `scope` ausgefuehrt (Exit-Code und Kommando im Run-`README.md` oder VERIFY-Notiz dokumentiert).
  Ergebnis: entweder „alle relevanten Tests gruen, keine Code-Aenderung noetig“ **oder** ein abgeschlossenes Mini-PKG
  mit gruenem Re-Verify.
  Bei Code-Aenderung: FEHLER-REGISTER.md gefuehrt; VERIFY-PLAN-REPORT.md vor Merge-Empfehlung vorhanden.
---

# STEUER — REF-03: Produktpfad Klasse A — Test-/Contract-Verifikation

**Bezug:** `INC-2026-04-09-dockerlog-obs-triage` (Signal vs. Observability-Laerm; Produktspur A)  
**Agent:** `auto-debugger` (Orchestrierung) → Delegation an `server-dev` / pytest nur bei Bedarf  
**Modus:** `artefact_improvement`  
**Run-ID:** `dockerlog-triage-ref03-tests-2026-04-10`

## Kurzbegründung

Die Docker-Log-Triage unterscheidet **A** (echte Geraete-/MQTT-Spur) von **B/C**. Dieser Lauf **beweist** die Server-Seite
der Kette A per bestehender Testabdeckung und Mapping — ohne neue Features.

## Runbook (imperativ)

1. `git checkout auto-debugger/work`.
2. `cd "El Servador/god_kaiser_server"` — Poetry-Umgebung wie in AGENTS.md.
3. pytest-Subset aus `scope` ausfuehren; Ergebnis dokumentieren.
4. Bei Gruen: kurzer Eintrag in `.claude/reports/current/auto-debugger-runs/dockerlog-triage-ref03-tests-2026-04-10/README.md`
   (anlegen) oder `INCIDENT-LAGEBILD.md` „Eingebrachte Erkenntnisse“.
5. Bei Rot: TASK-PACKAGES + verify-plan + Fix-Schleife gemaess Skill.

## Agent-Prompt (Copy-Paste)

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-INC-dockerlog-triage-REF-03-produktpfad-tests-2026-04-10.md
Bitte REF-03: pytest-Subset zu system/error und 3016; nur bei Bedarf PKG auf auto-debugger/work.
```
