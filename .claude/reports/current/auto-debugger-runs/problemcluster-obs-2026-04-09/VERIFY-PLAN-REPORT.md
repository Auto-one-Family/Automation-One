# VERIFY-PLAN-REPORT — Run `problemcluster-obs-2026-04-09`

**Status:** **Ausgeführt** (Reality-Check gemäß Skill `verify-plan` gegen `TASK-PACKAGES.md`)  
**Datum:** 2026-04-09  
**Geprüfter Plan:** `.claude/reports/current/auto-debugger-runs/problemcluster-obs-2026-04-09/TASK-PACKAGES.md`  
**Git zum Prüfzeitpunkt:** `auto-debugger/work` (nur lesend verifiziert)

---

## Kurzfassung für TM

Die Pakete sind **überwiegend ausführbar**: referenzierte Kernpfade existieren, PKG-01-IST im Code **bestätigt** (JSON-Parse vor CID). PKG-02-IST **bestätigt** (Store loggt Fehler, Drawer wertet Rückgabe nicht aus). PKG-03: **keine** `data-testid` unter `src/components/notifications/` — Zielbild des Pakets stimmt. **Kein dediziertes Alert-Center-E2E** unter `tests/e2e/scenarios/` (neues Szenario nötig). PKG-04/05: Zielpfade existieren; PKG-05 bleibt an **Hardware-Gate** gebunden.  
**Korrektur am Plan:** Testpfad PKG-01 im `TASK-PACKAGES.md` auf konkreten Unit-Test-Pfad präzisiert.

**Breaking-Change-Scan (hochlevel):** PKG-01–03 wie beschrieben **ohne** REST-Schema-Änderung umsetzbar; Logging nur additive Felder/Texte beachten (Ops/Log-Parsing).

---

## Geprüft (Zahlen)

| Kategorie | Anzahl |
|-----------|--------|
| Repo-Pfade (Pakete) | 12+ |
| Agents (implizit: server-dev, frontend-dev, esp32-dev) | 3 Rollen |
| Kern-Dateien Read/Grep | 4 |

---

## Bestätigt (Plan ↔ Repo)

| Paket | Befund |
|-------|--------|
| **PKG-01** | `El Servador/god_kaiser_server/src/mqtt/subscriber.py`: `_route_message` — `json.loads` in `try/except JSONDecodeError`, **return bei Zeile ~180**, Erzeugung `generate_mqtt_correlation_id` erst **danach** (Zeilen 182–186). Entspricht IST-Lücke. Testdatei existiert: `tests/unit/test_mqtt_correlation.py`. |
| **PKG-02** | `El Frontend/src/shared/stores/alert-center.store.ts`: `acknowledgeAlert` / `resolveAlert` geben bei Exception **`false`** zurück, nur `logger.error`. `NotificationDrawer.vue` ruft die Funktionen auf **ohne** sichtbare Auswertung des Booleans (Zeilen ~102–106). |
| **PKG-03** | `El Frontend/tests/e2e/scenarios/` enthält diverse Specs — **kein** `alert-center`-Szenario im Bestand; Playwright-Infrastruktur vorhanden. `data-testid` in `src/components/notifications/`: **keine Treffer** (grep). |
| **PKG-04** | `docs/debugging/logql-queries.md` **existiert** — Erweiterung wie geplant möglich. |
| **PKG-05** | `El Trabajante/src/error_handling/error_tracker.cpp` **existiert**. Abnahme weiterhin nur mit HW-/Checkliste (unverändert). |
| **Zwei Ketten (Konzept)** | `El Servador/god_kaiser_server/src/mqtt/handlers/error_handler.py`: Broadcast **`error_event`** (z. B. Zeile ~245). **Kein** `NotificationRouter`-Import in der geprüften Datei — Konsistenz mit Runbook „Inbox vs. Error-Stream“. |

---

## Korrekturen am Plan (umgesetzt / dokumentiert)

**Tests PKG-01**

- **Plan sagte:** `tests/.../test_mqtt_correlation.py` (unpräzise).  
- **System sagt:** Datei liegt unter `El Servador/god_kaiser_server/tests/unit/test_mqtt_correlation.py`.  
- **Umsetzung:** `TASK-PACKAGES.md` entsprechend angepasst.

---

## Fehlende Vorbedingungen (Checkliste vor Umsetzung)

- [ ] Branch **`auto-debugger/work`** vor jedem Commit erneut prüfen.  
- [ ] **PKG-03:** Stack für E2E (Backend + Frontend + Auth) laut bestehendem `global-setup` — siehe `El Frontend/tests/e2e/global-setup.ts` und Projekt-AGENTS.md.  
- [ ] **PKG-05:** Konzept §7.4 Hardware-Checkliste; kein „verifiziert“ bei I/O/NVS nur mit Wokwi ohne explizites Gate.

---

## Ergänzungen (Meta)

- **Skill `verify-plan` Anhang A (Agent-Pfade):** Teilweise **nicht** identisch mit diesem Repo (z. B. flache `.claude/agents/server-debug.md` statt verschachtelter Pfade im Anhang). Für Befehle an Menschen **immer** `Glob` unter `.claude/agents/` nutzen.  
- **Docker/Health:** Für diesen Reality-Check **nicht** ausgeführt (Pakete erzwingen keinen laufenden Stack für Pfadprüfung). Vor Playwright: `make e2e-up` bzw. lokaler Stack laut `AGENTS.md`.

---

## Empfohlene Umsetzungsreihenfolge (nach Gate)

1. **PKG-01** (Server, klein, hoher Ops-Nutzen)  
2. **PKG-03** (`data-testid` zuerst) → dann **PKG-02** (Toast/Finalität nutzt ggf. gleiche Selektoren)  
3. **PKG-04** (Doku parallel möglich)  
4. **PKG-05** nur mit separatem HW-Scope

---

## Akzeptanz für „Weiter mit auto-debugger“

Gemäß `.claude/agents/auto-debugger.md` §2.1 Ziffer 5 und §1.3 Ziffer 8: **Verify-Plan gegen `TASK-PACKAGES` liegt vor** — **Dev-Delegation zu PKG-01–05 ist aus Sicht des Gates zulässig**, sofern pro Paket die Nicht-Ziele (kein REST-Schema-Bruch ohne separates Gate) eingehalten und Spezialisten-Prompts mit Git-Pflicht genutzt werden.

---

*Nächster Schritt im Orchestrator-Flow: gewünschtes PKG an `server-dev` / `frontend-dev` / `esp32-dev` mit Verweis auf `SPECIALIST-PROMPTS.md` und diesen Report.*

---

## Nachtrag: Repo-Stand Frontend PKG-02 / PKG-03 (nach Verify, Teilvergleich)

**Datum Nachtrag:** 2026-04-10 (Cursor-Lauf, Branch `auto-debugger/work`).

| Befund im Verify (2026-04-09) | Aktueller Stand (codebezogen) |
|-------------------------------|-------------------------------|
| Keine `data-testid` unter `src/components/notifications/` | **Erweitert:** u. a. `notification-drawer-trigger`, `notification-drawer-panel`, `notification-resolve-all`, `notification-inbox-filter-*`, `notification-source-filter-*`, `alert-status-tab-*`, `notification-item-<id>`, `notification-alert-ack-<id>`, `notification-alert-resolve-<id>`, `notification-load-more`, `notification-preferences-button`, `notification-drawer-empty`, Status-Bar-Trigger `notification-drawer-trigger-status-bar`. |
| Drawer wertet Ack/Resolve-Boolean nicht aus | **PKG-02:** `NotificationDrawer.vue` nutzt `useToast` bei fehlgeschlagenem Ack/Resolve und bei „Alle erledigen“. |
| Kein E2E `alert-center` | **Vorhanden:** `El Frontend/tests/e2e/scenarios/alert-center.spec.ts` (Öffnen per Glocke, Tab „Aktiv“). |

**Hinweis:** Dieser Nachtrag ersetzt nicht erneutes `/verify-plan` bei größeren Planänderungen; er dokumentiert Abweichung vom Snapshot im Verify-Text oben.
