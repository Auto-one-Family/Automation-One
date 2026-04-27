# Changelog — auto-debugger (Skill / Orchestrierung)

## 2026-04-24

- **Linear-first:** Kanonische Issue-/Kommentar-SSOT in Linear; lokale Artefakte als Evidence-Store mit Rückkopplung (`LINEAR-SYNC-MANIFEST.json`, optional `LINEAR-ISSUES.md`).
- **Steuerdatei:** Neue optionale Felder `linear_*` und `linear_local_only` in `STEUER-VORLAGE.md`.
- **TM-parallele Phasen A–F** und **Resilienz-Check** in Skill und Agent `.claude/agents/auto-debugger.md` verankert.
- **verify-plan:** Bei vorhandener `LINEAR-ISSUES.md` Pflicht-Spalte **PKG → Linear-Identifier** im Block OUTPUT FÜR ORCHESTRATOR.
- **Headless:** `scripts/linear/auto_debugger_sync.py` (stdlib GraphQL); Konfiguration `.claude/config/linear-auto-debugger.yaml`; Doku `.claude/reference/linear-auto-debugger.md`; `.env.example` ergänzt um `LINEAR_*`.
- **Analysen:** `docs/analysen/ANALYSE-auto-debugger-linear-IST.md`, `docs/analysen/PLAN-auto-debugger-linear-SOLL.md`.
