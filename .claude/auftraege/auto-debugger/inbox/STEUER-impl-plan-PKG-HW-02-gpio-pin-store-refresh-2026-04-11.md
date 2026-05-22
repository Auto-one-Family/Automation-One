---
run_mode: artefact_improvement
incident_id: ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11
run_id: impl-plan-pkg-hw-02-2026-04-11
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - .claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-HW-02-gpio-pin-store-refresh-2026-04-11.md
scope: |
  **Auftrag:** Einen **einzigen**, **repo-verifizierten** Implementierungsplan für **PKG-HW-02** erstellen
  (GPIO-Reuse, „PIN belegt“, Pinia/API-State nach `sensor_config_deleted` und nach neuem Sensor auf gleichem GPIO).

  **Quellen (Pflichtlektüre):**
  - `TASK-PACKAGES.md` im Incident (Abschnitt PKG-HW-02)
  - `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md` (Frontend-Pfade)
  - `.claude/reference/api/WEBSOCKET_EVENTS.md` — Event `sensor_config_deleted` und Payload-Felder verifizieren
  - Code: `El Frontend/src/components/esp/ESPConfigPanel.vue`, Sensor-API unter `El Frontend/src/api/` (exakte Module per Glob),
    Pinia-Stores die Sensorlisten/GPIO-Belegung halten (per Grep `sensor_config_deleted`, `esp`-Store).

  **Deliverable-Datei (exakt):**
  `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-HW-02-gpio-pin-store-refresh-2026-04-11.md`

  **Pflichtgliederung des Implementierungsplans:**
  1. Titel, Datum, Branch, Bezug PKG-HW-02.
  2. **IST:** aktueller Ablauf „Sensor löschen → UI GPIO-Liste“ mit **konkreten** Store-/Composable-Pfaden.
  3. **SOLL:** kein falscher „PIN belegt“ nach erfolgreichem Delete; WS-Refresh oder optimistisches Update **mit** Cleanup in `onUnmounted` wo nötig (`.cursor/rules/frontend.mdc`).
  4. **Schritte nummeriert:** nur Vue 3 `<script setup lang="ts">`, Primitives/Design-Tokens einhalten, API nur über `src/api/`.
  5. **Tests:** Vitest-Dateien benennen oder neue Testdatei mit minimalem Scope; `vue-tsc --noEmit` im Verify-Block.
  6. **Verify:** vollständige PowerShell-kompatible Befehle.
  7. **Abgrenzung:** kein Backend-Transaktions-Redesign — nur wenn PKG-HW-02 einen klaren API-Bug braucht, in separatem Unterabschnitt mit Abhängigkeit zu PKG-HW-01.

  **Koordination:** Parallel zu PKG-HW-01 zulässig; im Plan dokumentieren, wenn ein Backend-Fix **Voraussetzung** ist.
forbidden: |
  Keine Secrets. Kein Light-Mode, keine Hex-Farben (Tailwind + Tokens). Keine relativen Import-Wildcards `../../` — Alias `@/`.
  Keine neuen Icon-Pakete. Keine Commits auf `master`.
done_criteria: |
  `implementierungsplan-PKG-HW-02-gpio-pin-store-refresh-2026-04-11.md` existiert unter `target_docs[0]`.
  Plan referenziert **verifizierte** WS-Event-Namen aus `WEBSOCKET_EVENTS.md` und mindestens eine **konkrete** Vue-Komponente/Store-Datei.
  Verify-Block enthält `vue-tsc` und Vitest wie in TASK-PACKAGES PKG-HW-02.
---

# STEUER — Implementierungsplan PKG-HW-02 (GPIO / Store / PIN belegt)

**Paket-ID:** `PKG-HW-02`

## Aktivierung

```text
@auto-debugger @.claude/auftraege/auto-debugger/inbox/STEUER-impl-plan-PKG-HW-02-gpio-pin-store-refresh-2026-04-11.md
```

## Git

Umsetzung später nur auf `auto-debugger/work`.
