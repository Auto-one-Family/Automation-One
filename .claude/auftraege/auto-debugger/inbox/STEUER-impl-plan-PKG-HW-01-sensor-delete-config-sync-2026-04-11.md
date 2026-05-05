---
run_mode: artefact_improvement
incident_id: ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11
run_id: impl-plan-pkg-hw-01-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-HW-01-sensor-delete-config-sync-2026-04-11.md
scope: |
  **Auftrag:** Einen **einzigen**, **repo-verifizierten** Implementierungsplan für **PKG-HW-01** erstellen
  (Sensor-Delete → ESP-Config-Konsistenz, Telemetrie ohne `sensor_configs`-Zeile klären/entschärfen).

  **Quellen (Pflichtlektüre vor Plan-Schreiben):**
  - Paketdefinition: `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/TASK-PACKAGES.md` (Abschnitt PKG-HW-01)
  - Kontext: `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`
  - Verify-Stand: `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/VERIFY-PLAN-REPORT.md`
  - Code: `El Servador/god_kaiser_server/src/api/v1/sensors.py` (`delete_sensor`), `sensor_handler.py` (Config-Lookup, „ohne Config“),
    `ESPService.send_config` / Config-Builder (per Grep/Read lokalisieren), optional `El Trabajante` Config-NVS-Pfad nur wenn im Plan belegt.

  **Deliverable-Datei (exakt dieser Pfad, neu anlegen oder vollständig ersetzen):**
  `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-HW-01-sensor-delete-config-sync-2026-04-11.md`

  **Inhalt des Implementierungsplans (verbindliche Gliederung):**
  1. **Titel + Metadata:** Datum, Branch `auto-debugger/work`, Bezug PKG-HW-01, **keine** Secrets.
  2. **IST-Zustand (Code):** Kurze Zitate/Verweise auf **existierende** Funktionen/Blöcke (Dateipfad + sinnvolle Anker, nach `Read`/`Grep`).
  3. **SOLL-Verhalten:** messbar; klar trennen: Server-Gap vs. Firmware/NVS vs. Operator-Erwartung.
  4. **Arbeitsschritte nummeriert:** je Schritt Datei(en), Signatur/Idee der Änderung, **kein** Greenfield ohne „Closest“-Referenz (bestehendes Pattern nennen).
  5. **MQTT/REST/WS:** nur additive oder rückwärtskompatible Änderungen dokumentieren; Abgleich `.claude/reference/api/MQTT_TOPICS.md` / `REST_ENDPOINTS.md` wo relevant.
  6. **Tests:** konkrete `pytest`-Pfade (bestehend erweitern vs. neu — Pfade verifiziert).
  7. **Verify-Block:** Copy-Paste-Befehle mit vollem Repo-Pfad (Windows/PowerShell-kompatibel: `cd "…"; …`).
  8. **Risiken + Rollback:** kurz.
  9. **Abgrenzung zu PKG-CAL-***: explizit „keine Kalibrier-Mathe in diesem PR“.

  **Nach dem Plan:** Umsetzung nur mit **verify-plan**-Gate vor Code-Delegation (Skill `.claude/skills/verify-plan/SKILL.md`); Artefakte optional unter
  `.claude/reports/current/auto-debugger-runs/impl-plan-pkg-hw-01-2026-04-11/`.
forbidden: |
  Keine Secrets/Keys/Tokens in Plänen oder Beispielpayloads.
  Keine Commits auf `master` aus diesem Auftrag; Produktcode nur Branch `auto-debugger/work`.
  Keine fiktiven Log-Zitate — nur repo- oder Laufzeit-verifizierte Evidence.
  Keine Vermischung mit PKG-HW-02 / PKG-CAL-* ohne Schnittstellen-Abschnitt.
done_criteria: |
  Die Datei `implementierungsplan-PKG-HW-01-sensor-delete-config-sync-2026-04-11.md` existiert im Repo unter `target_docs[0]`.
  Der Plan enthält alle Pflichtabschnitte aus `scope`, mit **verifizierten** Dateipfaden unter `El Servador/god_kaiser_server/`.
  Mindestens ein expliziter Verify-Befehl entspricht TASK-PACKAGES PKG-HW-01 (pytest + ggf. pio nur wenn FW im Plan).
---

# STEUER — Implementierungsplan PKG-HW-01 (Sensor-Delete / Config-Sync)

**Paket-ID:** `PKG-HW-01`  
**Kurztitel:** DB-Delete → `send_config` → ESP; Telemetrie ohne `moisture`-Config (EA5484-Evidence) adressieren.

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-PKG-HW-01-sensor-delete-config-sync-2026-04-11.md
```

## Erwartetes Ergebnis

Eine **eine** Markdown-Datei — der **Implementierungsplan** unter `target_docs` — die ein **server-dev**-Agent (oder Du mit `/do`) **Schritt für Schritt** abarbeiten kann, ohne weitere Architektur-Rätselraten.

## Git

Vor Umsetzung (nicht zwingend für reine Plan-Erstellung): `git checkout auto-debugger/work`.
