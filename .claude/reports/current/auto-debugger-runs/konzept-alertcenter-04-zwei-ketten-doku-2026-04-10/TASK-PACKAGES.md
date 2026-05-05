# TASK-PACKAGES — konzept-alertcenter-04-zwei-ketten-doku-2026-04-10

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-konzept-alertcenter-04-zwei-ketten-operator-doku-2026-04-10.md`  
**Modus:** `artefact_improvement` (Doku-only)  
**Git-Branch (Akzeptanz):** `auto-debugger/work` — Commits nur dort.

## PKG-01 — Diff/Review IST-Observability

- **Status:** erledigt (additive Ergänzung, keine Widersprüche zur bestehenden „Zwei Ketten“-Narration).
- **Ergebnis:** Abschnitt „Zwei Benachrichtigungsketten“ um **Symptom→Quelle→Korrelationsfelder**-Tabelle + **Evidence:**-Zeilen erweitert.

## PKG-02 — Additive Markdown mit Evidence

- **Status:** erledigt in:
  - `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`
  - `docs/analysen/KONZEPT-auto-debugger-frontend-flow-api-alertcenter-2026-04-09.md` (P0-Zeile §5.5)
  - `.claude/reference/api/WEBSOCKET_EVENTS.md` (ein Querverweis, keine Dublette)

## PKG-03 — Querverweis WEBSOCKET_EVENTS

- **Status:** erledigt (Absatz unter Notification Events).

## Verify

- Kein pytest-Zwang. Abnahme: Lesbarkeit + Pfade im Repo manuell geprüft (`error_handler.py`, `notification_router.py`, `notification-inbox.store.ts`, `notification.store.ts`).
