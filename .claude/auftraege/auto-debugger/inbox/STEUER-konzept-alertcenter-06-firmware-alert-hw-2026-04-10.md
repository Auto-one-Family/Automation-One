---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-06-firmware-hw-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - El Trabajante/src/error_handling/error_tracker.cpp
  - El Trabajante/src/services/communication/mqtt_client.cpp
scope: |
  Konzept §5.4 / §7 / Roadmap Phase 5: Firmware-Pfade für Fehler/Alerts — **nur** mit expliziter
  Hardware-Checkliste (Konzept §7.4). IST: `ErrorTracker::publishErrorToMqtt` und MQTT-Client —
  Projektregeln: kein Arduino `String` in neuem/angepasstem Code; Buffer-Konstanten; Topic über
  TopicBuilder. Ziel: nachweisbare Korrelation `esp_id` + Fehlercode + MQTT-Payload gemäß
  MQTT_TOPICS; Abnahme **nicht** allein Wokwi wenn I/O/Timing/NVS betroffen.
forbidden: |
  Kein `delay()` in der Haupt-Loop; Watchdog nicht deaktivieren; keine Heap-unfreundlichen String-
  Patterns; keine SafetyController-Änderungen ohne separates Safety-Review; kein „fertig“ ohne
  dokumentierte HW-Evidenz wenn STEUER das verlangt.
done_criteria: |
  Entweder: konkreter Firmware-Fix mit `pio run -e seeed_xiao_esp32c3` (oder projektüblichem Env)
  grün **und** kurzes HW-Protokoll (esp_id, Schritte, MQTT-Trace) im Run-Ordner — **oder** BLOCKER
  „HW nicht verfügbar“ im VERIFY-PLAN-REPORT mit messbarer Nachbedingung für spätere Abnahme.
---

# STEUER 06 — Firmware: Alert-/Error-Pfad, HW-Abnahme

## Pattern-Anker

- `El Trabajante/src/error_handling/error_tracker.cpp` — Payload-Aufbau.
- `El Trabajante/src/services/communication/mqtt_client.cpp` — Publish-Pfad.
- Topics: `.claude/reference/api/MQTT_TOPICS.md`, `utils/topic_builder.h`.

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** IST-Audit — String-Nutzung, Buffer, Übereinstimmung mit Server-Handler `error_handler.py` (nur Lesen, keine Dublette der Server-Logik).
2. **PKG-02:** Wenn Code-Änderung: minimal, C++-Konventionen aus firmware.mdc; Tests/Mocks unter `test/mocks/` wo vorhanden.
3. **PKG-03:** Hardware-Checkliste aus Konzept §7.4 ausfüllen (esp_id, Schritte, Abbruchkriterien).

## Verify

```text
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e seeed_xiao_esp32c3
```

*(Env-Name bei Abweichung in `platformio.ini` im VERIFY-PLAN anpassen — siehe AGENTS.md / bestehende STEUER-Reports.)*

## Abgrenzung

- Server- und Frontend-Fixes gehören in STEUER 02–05; dieser STEUER endet an der MQTT-Grenze der Firmware.

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
