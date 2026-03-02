# Git Commit Plan

**Erstellt:** 2026-03-02
**Branch:** master (up to date with origin/master)
**Ungepushte Commits:** 0
**Änderungen gesamt:** 17 modified, 1 untracked, 0 staged

---

## Commit 1: feat(frontend): preserve view state with keep-alive and per-layout debounce

**Was:** Behebt State-Verlust beim Tab-Wechsel. AppShell wrapped RouterView mit `<keep-alive>` für MonitorView, LogicView und CustomDashboardView. CustomDashboardView bekommt `defineOptions` + `onActivated`/`onDeactivated` Lifecycle-Hooks um GridStack bei Reaktivierung korrekt wiederherzustellen. Dashboard-Store wechselt von single-timer auf per-layout Debounce-Map, damit beim schnellen Dashboard-Wechsel keine Edits verloren gehen.

**Dateien:**
- `El Frontend/src/shared/design/layout/AppShell.vue` – keep-alive Wrapper mit include-Liste + max=5
- `El Frontend/src/views/CustomDashboardView.vue` – defineOptions, onActivated/onDeactivated für Grid-Re-Init und Breadcrumb
- `El Frontend/src/shared/stores/dashboard.store.ts` – Per-layout debounce mit Map statt einzelnem Timer

**Befehle:**
```bash
git add "El Frontend/src/shared/design/layout/AppShell.vue" "El Frontend/src/views/CustomDashboardView.vue" "El Frontend/src/shared/stores/dashboard.store.ts"
git commit -m "feat(frontend): preserve view state with keep-alive and per-layout debounce"
```

---

## Commit 2: fix(frontend): replace hardcoded CSS values with design tokens in widgets

**Was:** Ersetzt hardcodierte px-Werte (padding, font-size, gap, border-radius, margin) und rgba-Farben durch CSS-Variablen aus dem Design-Token-System. Betrifft Dashboard-Widget-Styling und zwei Dashboard-Layout-Komponenten. InlineDashboardPanel passt ROW_HEIGHT von 60→80px an (synchron mit DashboardViewer cellHeight) und ändert overflow von hidden→auto für scrollbare Widget-Inhalte. DashboardViewer entfernt überflüssiges `inset: 4px` auf grid-items.

**Dateien:**
- `El Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue` – padding + background auf CSS vars
- `El Frontend/src/components/dashboard-widgets/ActuatorRuntimeWidget.vue` – font-size + padding auf CSS vars
- `El Frontend/src/components/dashboard-widgets/AlarmListWidget.vue` – font-size, padding, margin, border-radius auf CSS vars
- `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue` – gap + padding auf CSS vars
- `El Frontend/src/components/dashboard/DashboardViewer.vue` – entferne `inset: 4px` auf grid-stack-item-content
- `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` – ROW_HEIGHT 60→80, overflow hidden→auto

**Befehle:**
```bash
git add "El Frontend/src/components/dashboard-widgets/ActuatorCardWidget.vue" "El Frontend/src/components/dashboard-widgets/ActuatorRuntimeWidget.vue" "El Frontend/src/components/dashboard-widgets/AlarmListWidget.vue" "El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue" "El Frontend/src/components/dashboard/DashboardViewer.vue" "El Frontend/src/components/dashboard/InlineDashboardPanel.vue"
git commit -m "fix(frontend): replace hardcoded CSS values with design tokens in widgets"
```

---

## Commit 3: feat(frontend): redesign MonitorView dashboard section as compact card

**Was:** Dashboard-Sektion im MonitorView komplett umgebaut: Statt vertikaler Link-Liste jetzt kompakte, collapsible Card mit horizontalen Chips. Jeder Chip hat Direktlinks zum Dashboard und zum Editor. Collapse-State wird in localStorage persistiert. Includes defineOptions für keep-alive Kompatibilität. Entfernt veraltete CSS-Klassen (monitor-dashboards__show-all, monitor-dashboard-link__updated).

**Dateien:**
- `El Frontend/src/views/MonitorView.vue` – defineOptions, neue Dashboard-Card mit Chips, collapsible toggle, Pencil/Plus/Chevron Icons, neue CSS-Klassen

**Befehle:**
```bash
git add "El Frontend/src/views/MonitorView.vue"
git commit -m "feat(frontend): redesign MonitorView dashboard section as compact card"
```

---

## Commit 4: feat(frontend): restructure LogicView with rules-first layout

**Was:** LogicView Layout umstrukturiert: Bestehende Regeln kommen jetzt "above the fold" (Sektion 1), die Flow-Illustration erscheint nur noch im leeren Zustand. Vorlagen-Sektion wird collapsible mit Toggle-Button und Collapse-Transition. Collapse-State in localStorage persistiert. Breitere Grid-Layouts (max-width 960px). Logic-Store trackt jetzt execution_count und last_execution_success bei Rule-Execution Events.

**Dateien:**
- `El Frontend/src/views/LogicView.vue` – defineOptions, rules-first Layout, collapsible templates, ChevronUp import, Collapse-Transition CSS
- `El Frontend/src/shared/stores/logic.store.ts` – execution_count + last_execution_success Update bei rule_executed Event

**Befehle:**
```bash
git add "El Frontend/src/views/LogicView.vue" "El Frontend/src/shared/stores/logic.store.ts"
git commit -m "feat(frontend): restructure LogicView with rules-first layout"
```

---

## Commit 5: fix(firmware): correct Wokwi diagram pin references

**Was:** Zwei Pin-Bezeichnungen in der Wokwi-Diagrammdatei korrigiert: DHT22 Data-Pin von `esp:D16` auf `esp:RX2` (korrekter Wokwi-Alias für GPIO16) und Analog-Potentiometer von `esp:34` auf `esp:D34` (konsistente Dx-Notation).

**Dateien:**
- `El Trabajante/diagram.json` – DHT22 SDA Pin D16→RX2, Potentiometer SIG Pin 34→D34

**Befehle:**
```bash
git add "El Trabajante/diagram.json"
git commit -m "fix(firmware): correct Wokwi diagram pin references for DHT22 and ADC"
```

---

## Commit 6: docs(ci): update Wokwi testing docs and optimize nightly schedule

**Was:** WOKWI_TESTING.md aktualisiert auf v2.2: MCP-Integration dokumentiert (11 Tools, 2 Resources, Agent-Driven Testing Flow), Szenario-Zählung aktualisiert (191 total über 15 Kategorien), CLI-Installation korrigiert (GitHub releases statt npm), Quota-Hinweise ergänzt. CI Workflow wechselt Nightly-Schedule von täglich auf Mon+Thu (Quota-Optimierung: ~720 vs 2520 min/Woche). Makefile aktualisiert 173→191 in Help-Text und Echo.

**Dateien:**
- `.claude/reference/testing/WOKWI_TESTING.md` – v2.2, MCP section, scenario count table, CLI install fix
- `.github/workflows/wokwi-tests.yml` – cron Mon+Thu, comment updates für 15 categories + correlation
- `Makefile` – 173→191 Szenario-Zählung in help + wokwi-test-all

**Befehle:**
```bash
git add ".claude/reference/testing/WOKWI_TESTING.md" ".github/workflows/wokwi-tests.yml" Makefile
git commit -m "docs(ci): update Wokwi testing docs and optimize nightly schedule to Mon+Thu"
```

---

## Commit 7: docs(reports): add dashboard and logic UX final polish report

**Was:** Auftragsdokumentation für den Dashboard + Logik UX Polish Sprint. Beschreibt Phase 1 (Dashboard State, CSS-Konsistenz, Dashboard-Card, InlineDashboardPanel) und Phase 2 (LogicView Layout, execution_count Fix).

**Dateien:**
- `.claude/reports/current/auftrag-dashboard-logik-ux-finalpolish.md` – Neuer Auftragsbericht

**Befehle:**
```bash
git add ".claude/reports/current/auftrag-dashboard-logik-ux-finalpolish.md"
git commit -m "docs(reports): add dashboard and logic UX final polish report"
```

---

## Abschluss

**Nach allen Commits:**
```bash
# Status prüfen (GIT_COMMIT_PLAN.md sollte als einzige modified übrig bleiben)
git status

# Push
git push origin master
```

**Zusammenfassung:**

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `feat(frontend): preserve view state with keep-alive and per-layout debounce` | 3 | feat |
| 2 | `fix(frontend): replace hardcoded CSS values with design tokens in widgets` | 6 | fix |
| 3 | `feat(frontend): redesign MonitorView dashboard section as compact card` | 1 | feat |
| 4 | `feat(frontend): restructure LogicView with rules-first layout` | 2 | feat |
| 5 | `fix(firmware): correct Wokwi diagram pin references for DHT22 and ADC` | 1 | fix |
| 6 | `docs(ci): update Wokwi testing docs and optimize nightly schedule to Mon+Thu` | 3 | docs |
| 7 | `docs(reports): add dashboard and logic UX final polish report` | 1 | docs |

**Hinweise:**
- `GIT_COMMIT_PLAN.md` wird NICHT committed (ist der Plan selbst)
- Commit 1 ist Voraussetzung für Commits 3+4 (defineOptions in MonitorView/LogicView nutzt keep-alive aus AppShell)
- Commits 2-4 sind Frontend-Änderungen aus demselben UX-Polish Sprint
- Commit 5 ist unabhängig (Firmware-Diagramm)
- Commits 6-7 sind reine Dokumentation
- Reihenfolge: Infrastruktur (keep-alive) → CSS-Fixes → Features → Firmware → Docs
