# Sprint W16 — Agent-Dispatch-Plan

> **Sprint:** Bodenfeuchte-Kalibrierung Abschluss (14.–18. April 2026)
> **Linear-Projekt:** [Bodenfeuchte-Kalibrierung](https://linear.app/autoone/project/bodenfeuchte-kalibrierung-2bd02c8051af)
> **Dispatch-Regel:** Parallel wo keine Abhängigkeiten, Sequentiell bei Blocks

---

## Dispatch-Übersicht

```
Tag 1 (Mo 14.04) — PARALLEL:
  ├── esp32-dev  → AUT-5 (E-P1 Overflow-Telemetrie)
  ├── esp32-dev  → AUT-6 (E-P2 Outbox-Retry)      [nach AUT-5]
  └── frontend-dev → AUT-7 (F-P4 Finalizing-UI)    [unabhängig]

Tag 2 (Di 15.04) — SEQUENTIELL nach AUT-7:
  └── frontend-dev → AUT-8 (F-P7 Inline entfernen)

Tag 3 (Mi 16.04) — SEQUENTIELL nach AUT-7 + AUT-8:
  └── frontend-dev → AUT-9 (F-P8 E2E Tests)

Tag 4 (Do 17.04) — SEQUENTIELL nach AUT-5 + AUT-6:
  └── esp32-dev + server-dev → AUT-10 (E-P8 Cross-Layer Test)

Tag 5 (Fr 18.04) — Sprint-Gate:
  └── Alle Verifikationsbefehle grün
```

## Abhängigkeitsgraph

```
AUT-5 (ESP32) ──┐
                 ├──→ AUT-10 (Cross-Layer Test)
AUT-6 (ESP32) ──┘

AUT-7 (Frontend) ──→ AUT-8 (Inline entfernen) ──→ AUT-9 (E2E Tests)
```

## Pflicht für JEDEN Agent-Start

1. **CLAUDE.md lesen** — Projekt-Router mit Skills, Patterns, Verifikation
2. **Skill laden** — `esp32-development` bzw. `frontend-development`
3. **Bestehenden Code analysieren** — Pattern aus Codebase übernehmen
4. **Linear-Issue referenzieren** — AUT-ID in Commit-Message
5. **Verifikation ausführen** — siehe Issue "Definition of Done"
6. **Conventional Commit** — wie im Issue beschrieben

## Agent-Aktivierung (Copy-Paste für Sessions)

### AUT-5 + AUT-6: esp32-dev
```
Lies .claude/CLAUDE.md und aktiviere Skill esp32-development.
Arbeite Sprint W16 Issues AUT-5 und AUT-6 ab:
- AUT-5: Overflow-Telemetrie-Event in mqtt_status_publisher.cpp
- AUT-6: 3x Retry mit Backoff in PublishOutbox für sensor_data
Details: .claude/auftraege/sprint-w16/AUT-5.md und AUT-6.md
Verifikation: pio run -e seeed muss grün sein.
```

### AUT-7: frontend-dev
```
Lies .claude/CLAUDE.md und aktiviere Skill frontend-development.
Arbeite Sprint W16 Issue AUT-7 ab:
- AUT-7: Finalizing-Phase UI im CalibrationWizard
Details: .claude/auftraege/sprint-w16/AUT-7.md
Verifikation: npm run build && npx vue-tsc --noEmit muss grün sein.
```

### AUT-8: frontend-dev (nach AUT-7)
```
Lies .claude/CLAUDE.md und aktiviere Skill frontend-development.
Arbeite Sprint W16 Issue AUT-8 ab:
- AUT-8: Inline-Kalibrierung aus SensorConfigPanel entfernen
Voraussetzung: AUT-7 muss committed sein.
Details: .claude/auftraege/sprint-w16/AUT-8.md
Verifikation: npm run build && npx vue-tsc --noEmit muss grün sein.
```

### AUT-9: frontend-dev (nach AUT-7 + AUT-8)
```
Lies .claude/CLAUDE.md und aktiviere Skill frontend-development.
Arbeite Sprint W16 Issue AUT-9 ab:
- AUT-9: Playwright E2E Tests für Kalibrierungs-Wizard
Voraussetzung: AUT-7 und AUT-8 müssen committed sein.
Details: .claude/auftraege/sprint-w16/AUT-9.md
Verifikation: npx playwright test calibration-wizard muss grün sein.
```

### AUT-10: esp32-dev + server-dev (nach AUT-5 + AUT-6)
```
Lies .claude/CLAUDE.md und aktiviere Skills esp32-development + server-development.
Arbeite Sprint W16 Issue AUT-10 ab:
- AUT-10: Cross-Layer Systemtest Kalibrierflow
Voraussetzung: AUT-5 und AUT-6 müssen committed sein.
Details: .claude/auftraege/sprint-w16/AUT-10.md
Verifikation: pytest tests/integration/test_cross_layer_calibration.py muss grün sein.
```
