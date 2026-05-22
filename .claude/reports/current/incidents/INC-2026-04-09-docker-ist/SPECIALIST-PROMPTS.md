# SPECIALIST-PROMPTS — INC-2026-04-09-docker-ist

**Hinweis:** Für diesen Lauf liegt **kein Dev-Handoff** vor — `TASK-PACKAGES.md` enthält nur **PKG-OBS-01 (Beobachtung / keine Maßnahme)**.

Bei einer **Folge-Session** mit echten Code-PKGs ist pro Rolle das Muster aus `.claude/agents/auto-debugger.md` §0a zu verwenden (Git `auto-debugger/work`, Pattern-Reuse, Alert-Pfad/Observability, Verify-Befehl, Fehler-Register bei Code).

---

## Platzhalter (nur bei Reaktivierung)

### Rolle: _nicht zugewiesen_

**Paket:** —

**Auftrag:** —

### Git (Pflicht)

- Arbeitsbranch: **`auto-debugger/work`**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)

- Erst bei konkretem PKG aus `TASK-PACKAGES.md` (nach Verify-Gate) ausfüllen.

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)

- Erst bei UI/Notification/WS-Scope ausfüllen; ISA/DB-Inbox vs. WS-transient nicht vermischen.

### Verify-Befehl (Pflicht)

- Siehe jeweils aktualisiertes PKG in `TASK-PACKAGES.md` nach `/verify-plan`.

### Fehler-Register (Pflicht bei Code)

- `.claude/reports/current/incidents/<incident_id>/FEHLER-REGISTER.md` — erst bei Code-PKGs pflegen.
