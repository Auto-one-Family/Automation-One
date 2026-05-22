---
run_mode: artefact_improvement
incident_id: ""
run_id: konzept-alertcenter-04-zwei-ketten-doku-2026-04-10
order: incident_first
no_chat_questions: true
allow_user_escalation: false
target_docs:
  - docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md
  - docs/analysen/IST-observability-correlation-contracts-2026-04-09.md
  - .claude/reference/api/WEBSOCKET_EVENTS.md
scope: |
  Konzept P0 „E2E-Korrelation Alert vs. Error-Event“ und §1.4 / §5.3: Additive, evidenzbasierte
  Dokumentation für Operatoren und auto-debugger — klare Trennung **persistierte ISA-/DB-
  Notifications** (NotificationRouter, Inbox, Ack/Resolve) vs. **transiente** `error_event`-WS-
  Nachrichten (z. B. `error_handler.py` ohne NotificationRouter). Tabellarische Zuordnung:
  Symptom → erwartete Quelle → Korrelationsfelder (Clustering-Reihenfolge aus Konzept §6.2).
  Kein Produktcode zwingend; falls nur Markdown: run_id trotzdem für ggf. minimale TASK-PACKAGES
  (Doku-Review-Paket).
forbidden: |
  Keine erfundenen Logzeilen; keine Secrets; keine Umbenennung bestehender API-Events ohne
  separates Gate; keine Vermischung der Root-Cause-Zuordnung zwischen den Ketten in der Doku.
done_criteria: |
  IST-Observability oder separates Kapitel unter `docs/analysen/` enthält eine vom Repo
  abgesicherte „Zwei-Ketten“-Tabelle mit Verweisen auf echte Dateien (`notification_router.py`,
  `error_handler.py`, Frontend-Stores); Konzept-P0 als „bedient“ oder „BLOCKER“ mit Grund markiert.
---

# STEUER 04 — Operator-Doku: zwei Benachrichtigungsketten

## Pattern-Anker (nur Referenz für Text)

- Server: `src/mqtt/handlers/error_handler.py` — WS-Broadcast, **kein** NotificationRouter in der Stichprobe Konzept.
- Server: `src/services/notification_router.py` — persistierte Notifications.
- Frontend: `notification-inbox.store.ts` vs. Stellen, die `error_event` verarbeiten — per Grep verifizieren.

## Aufgabenpaket (SOLL für TASK-PACKAGES)

1. **PKG-01:** Diff/Review — welche Abschnitte in `IST-observability-correlation-contracts-2026-04-09.md` fehlen oder sind veraltet?
2. **PKG-02:** Additive Markdown-Abschnitte mit „Evidence:“-Zeilen (Dateipfade aus Repo).
3. **PKG-03 (optional):** Verweis in `.claude/reference/api/WEBSOCKET_EVENTS.md` oder README — ein Querverweis, keine Dublette.

## Verify

- Kein pytest-Zwang; **Lesbarkeit + Link-Check** (manuelle Repo-Pfade).
- Wenn nur Doku: `done_criteria` aus Steuerdatei oben.

---

*Teil von MASTER `STEUER-konzept-alertcenter-MASTER-2026-04-10.md`*
