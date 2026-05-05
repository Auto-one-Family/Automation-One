# auto-debugger — Soll-Workflow und Systemregeln (Repo-lokal)

Kurzreferenz für Agenten im **AutomationOne**-Checkout. Keine externen Repo-Namen.

---

## 1. Einstieg

- Steuerdatei: `.claude/auftraege/auto-debugger/inbox/STEUER-*.md` — Frontmatter zuerst (`run_mode`, `scope`, `forbidden`, `done_criteria`, `run_id`, `target_docs`).
- Keine Rückfragen, wenn Antwort aus Repo + Steuerdatei folgt.
- **Kanonisch:** fachliche Analysen/Konzepte unter `docs/analysen/`; Run-Artefakte unter `.claude/reports/current/`. Aufträge unter `.claude/auftraege/` — Duplikate vermeiden.

## 2. Shell (Windows)

- PowerShell: Befehle mit **`;`** verketten, nicht `&&`.

## 3. Git

- Orchestrierte Produktänderungen: Branch **`auto-debugger/work`** (von `master`). Orchestrator-Agent: nur eingeschränkte Git-Befehle laut Agent-Definition; kein Push/Force.

## 4. Code-Folge (wenn Umsetzung avisiert)

`TASK-PACKAGES.md` → **verify-plan**-Logik aus `.claude/skills/verify-plan/SKILL.md` im selben Kontext → `VERIFY-PLAN-REPORT.md` → **Post-Verify** Anpassung von TASK-PACKAGES + `SPECIALIST-PROMPTS` → Dev-Übergabe. Kein stilles Großrefactoring ohne Gate.

Nach **nennenswerter** Code-Änderung an Paketen: erneuter Reality-Check (verify-plan oder explizite Ergänzung im VERIFY-PLAN-REPORT) — Strenge nach Steuerdatei.

## 5. Pattern vor Greenfield

- Server: analoge Handler/Services, async, Pydantic v2, Logging, Error-Code-Bereiche.
- Frontend: Composition API, `src/api/`, Tokens + Tailwind, Lucide-Icons (keine Emoji-Icons).
- Firmware: TopicBuilder, Safety, kein `delay()` in Hauptloop, kein Arduino-`String` für neue Pfade.

## 6. Verifikation

- Backend: `pytest`, `ruff` (Pfade siehe `AGENTS.md`).
- Frontend: `vue-tsc --noEmit`; Playwright nur mit Stack — ohne Stack nicht „grün“ behaupten.
- Firmware: `pio run`.

`vue-tsc` rot durch fremde Dateien: fixen oder BLOCKER benennen.

## 7. Artefakte

- Bei Code-PKGs: `FEHLER-REGISTER.md` im Run-Ordner mitführen, wenn Vorgabe das verlangt.
- Abschluss: Änderungsliste, `done_criteria`, offene PKGs/BLOCKER.

## 8. Immer mitdenken (Frontend / Cross-Cutting)

- WS-Listener in `onUnmounted` abmelden.
- `data-testid` in Listen eindeutig (z. B. mit ID-Suffix).
- Zwei Alert-Ketten: persistierte Notifications vs. `error_event` — nicht ohne Evidence gleichsetzen.
- `request_id` / MQTT-CID nicht blind mischen.

## 9. Docker-Logs

Nur bei Integration/E2E/Monitoring-Kontext; gezielt pro Service; eine Evidenzzeile ins Lagebild/Register — nicht nach jedem Edit Voll-Logs.

## 10. Hooks (optional)

Pfadabhängig dieselben Checks wie `AGENTS.md`; Branch-Hinweis bei Abweichung von `auto-debugger/work`; kein Log-Spam.
