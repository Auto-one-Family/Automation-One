---
run_mode: artefact_improvement
incident_id: ""
run_id: kalibrierung-schema-alignment-impl-2026-04-09
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md
scope: |
  Umsetzung Implementierungsplan Bodenfeuchte Schema-Alignment (PKG-1 bis PKG-6).
  Planquelle: .claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md
  Artefakte (Run): .claude/reports/current/auto-debugger-runs/kalibrierung-schema-alignment-impl-2026-04-09/ (TASK-PACKAGES, SPECIALIST-PROMPTS, VERIFY-PLAN-REPORT, FEHLER-REGISTER).
  Primaer Option (a): derived enthaelt dry_value/wet_value fuer Moisture nach Kalibrierung;
  Frontend moisture_2point wo moeglich; Backend-Fallback (3B) nur wenn linear_2point-Sessions fuer Moisture bestehen bleiben muessen.
  invert aus calibration in moisture.py lesen (klare Prioritaet zu params). Keine MQTT-Topic-/Schema-Breaks.
forbidden: |
  Keine Secrets. Branch auto-debugger/work fuer Produktaenderungen. Kein git push / force auf Shared-Remotes durch Agenten.
  Breaking REST/MQTT/WS/DB nur mit separatem Gate. Keine Firmware-Pflichtaenderung.
done_criteria: |
  Alle PKG-AK aus TASK-PACKAGES erfuellt; pytest (betroffene Module) und npx vue-tsc --noEmit gruen;
  Doku-Addendum docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md existiert;
  FEHLER-REGISTER-Eintraege geschlossen oder als BLOCKER dokumentiert.
---

# Steuerdatei — Kalibrierungsflow Bodenfeuchte (Implementierung)

**Git:** Vor Produktänderungen `git checkout auto-debugger/work` und Branch verifizieren.

## Referenz

| Was | Pfad |
|-----|------|
| Implementierungsplan | `.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md` |
| IST-Analyse (Kontext) | `docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md` |
| Run-Artefakte | `.claude/reports/current/auto-debugger-runs/kalibrierung-schema-alignment-impl-2026-04-09/` |

## Agent-Prompt (Copy-Paste)

```text
Du bist auto-debugger. Arbeite nach:
.claude/auftraege/auto-debugger/inbox/implementierungsplan-kalibrierungsflow-bodenfeuchte-schema-alignment-2026-04-09.md
und der Steuerdatei inbox/STEUER-kalibrierungsflow-bodenfeuchte-implementierung-2026-04-09.md

Ziel: Kalibrierung Bodenfeuchte so ausrichten, dass MoistureSensorProcessor nach finalize
dry_value/wet_value sieht (Option a), invert konsistent, Pi-Enhanced-Pfad getestet.
Reihenfolge PKG-1–6; verify-plan-Gate vor Implementierungsdelegation; Branch auto-debugger/work.
```

## Inhaltliche Notizen (optional)

- Nach Verify-Report: PKG-3 oft nur Regression, wenn Frontend auf `moisture_2point` umgestellt ist.
