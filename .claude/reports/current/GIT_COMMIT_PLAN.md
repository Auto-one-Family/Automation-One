# Git Commit Plan

**Erstellt:** 2025-02-15  
**Branch:** feature/frontend-consolidation  
**Ungepushte Commits:** 0 (Branch up to date mit origin)  
**Änderungen gesamt:** 49 modified, 20+ untracked  

---

## ⚠️ SICHERHEIT ZUERST – Empfehlung vor jedem Commit

```bash
# 1. Backup-Branch erstellen (alle Änderungen bleiben erhalten)
git stash push -m "WIP frontend-consolidation" -u

# Oder alternativ: Branch von aktuellem Stand
git add -A
git stash push -m "frontend-consolidation-full" -u

# 2. Nach Verifizierung: Stash wieder anwenden
git stash pop
```

**Kein Merge** – User wünscht explizit: "nicht unbedacht mergen". Merge erst nach Review und bewusster Entscheidung.

---

## Commit 1: fix(frontend): PendingDevicesPanel visibility and positioning

**Was:** Panel war unsichtbar weil anchor-el=null → updatePosition brach ab. Fallback-Positionierung (top-right), CSS-Fallback, Layout-Timing (requestAnimationFrame), robuste right-Positionierung.

**Dateien:**
- `El Frontend/src/components/esp/PendingDevicesPanel.vue` – Fallback-Position, double RAF, CSS top/right, Design-Updates

**Befehle:**
```bash
git add "El Frontend/src/components/esp/PendingDevicesPanel.vue"
git commit -m "fix(frontend): PendingDevicesPanel visibility and positioning when triggered from TopBar"
```

---

## Commit 2: feat(frontend): dashboard consolidation, zoom navigation, shared stores

**Was:** DashboardView Drei-Stufen-Zoom, ZonePlate/ZoneDetailView/DeviceDetailView, useZoomNavigation, dashboard.store, TopBar-Integration, UnassignedDropBar, neue Komponenten.

**Dateien:**
- `El Frontend/src/views/DashboardView.vue`
- `El Frontend/src/shared/design/layout/TopBar.vue`
- `El Frontend/src/shared/stores/dashboard.store.ts` (untracked)
- `El Frontend/src/composables/useZoomNavigation.ts` (untracked)
- `El Frontend/src/components/dashboard/UnassignedDropBar.vue`
- `El Frontend/src/components/dashboard/ZonePlate.vue` (untracked)
- `El Frontend/src/components/dashboard/ZoneDetailView.vue` (untracked)
- `El Frontend/src/components/dashboard/DeviceMiniCard.vue` (untracked)
- `El Frontend/src/components/dashboard/ZoomBreadcrumb.vue` (untracked)
- `El Frontend/src/components/zones/DeviceSummaryCard.vue` (untracked)
- `El Frontend/src/components/zones/SubzoneArea.vue` (untracked)
- `El Frontend/src/components/esp/DeviceDetailView.vue` (untracked)
- `El Frontend/src/components/esp/DeviceHeaderBar.vue` (untracked)
- `El Frontend/src/components/modals/RejectDeviceModal.vue` (untracked)

**Befehle:**
```bash
git add "El Frontend/src/views/DashboardView.vue" "El Frontend/src/shared/design/layout/TopBar.vue" "El Frontend/src/shared/stores/dashboard.store.ts" "El Frontend/src/composables/useZoomNavigation.ts" "El Frontend/src/composables/index.ts" "El Frontend/src/components/dashboard/UnassignedDropBar.vue" "El Frontend/src/components/dashboard/ZonePlate.vue" "El Frontend/src/components/dashboard/ZoneDetailView.vue" "El Frontend/src/components/dashboard/DeviceMiniCard.vue" "El Frontend/src/components/dashboard/ZoomBreadcrumb.vue" "El Frontend/src/components/zones/DeviceSummaryCard.vue" "El Frontend/src/components/zones/SubzoneArea.vue" "El Frontend/src/components/esp/DeviceDetailView.vue" "El Frontend/src/components/esp/DeviceHeaderBar.vue" "El Frontend/src/components/modals/RejectDeviceModal.vue"
git commit -m "feat(frontend): dashboard consolidation with zoom navigation and shared stores"
```

---

## Commit 3: feat(frontend): rules UI, logic store, views and auth flows

**Was:** RuleConfigPanel, RuleFlowEditor, RuleNodePalette, logic.store Erweiterungen, LogicView, LoginView, SetupView.

**Dateien:**
- `El Frontend/src/components/rules/RuleConfigPanel.vue`
- `El Frontend/src/components/rules/RuleFlowEditor.vue`
- `El Frontend/src/components/rules/RuleNodePalette.vue`
- `El Frontend/src/shared/stores/logic.store.ts`
- `El Frontend/src/views/LogicView.vue`
- `El Frontend/src/views/LoginView.vue`
- `El Frontend/src/views/SetupView.vue`

**Befehle:**
```bash
git add "El Frontend/src/components/rules/RuleConfigPanel.vue" "El Frontend/src/components/rules/RuleFlowEditor.vue" "El Frontend/src/components/rules/RuleNodePalette.vue" "El Frontend/src/shared/stores/logic.store.ts" "El Frontend/src/shared/stores/index.ts" "El Frontend/src/views/LogicView.vue" "El Frontend/src/views/LoginView.vue" "El Frontend/src/views/SetupView.vue"
git commit -m "feat(frontend): rules UI, logic store and auth view refinements"
```

---

## Commit 4: feat(frontend): esp store, design tokens, animations

**Was:** esp.store Erweiterungen, tokens.css, animations.css, tailwind.config.

**Dateien:**
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/types/index.ts`
- `El Frontend/src/styles/tokens.css`
- `El Frontend/src/styles/animations.css`
- `El Frontend/tailwind.config.js`

**Befehle:**
```bash
git add "El Frontend/src/stores/esp.ts" "El Frontend/src/types/index.ts" "El Frontend/src/styles/tokens.css" "El Frontend/src/styles/animations.css" "El Frontend/tailwind.config.js"
git commit -m "feat(frontend): esp store, design tokens and animations"
```

---

## Commit 5: feat(server): esp, sensors, heartbeat, pending devices

**Was:** Server-API für pending devices, sensor repo, heartbeat handler, Schemas.

**Dateien:**
- `El Servador/god_kaiser_server/src/api/v1/esp.py`
- `El Servador/god_kaiser_server/src/api/v1/sensors.py`
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/schemas/esp.py`
- `El Servador/god_kaiser_server/src/schemas/sensor.py`
- `El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py`

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/api/v1/esp.py" "El Servador/god_kaiser_server/src/api/v1/sensors.py" "El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py" "El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py" "El Servador/god_kaiser_server/src/schemas/esp.py" "El Servador/god_kaiser_server/src/schemas/sensor.py" "El Servador/god_kaiser_server/src/services/maintenance/jobs/sensor_health.py"
git commit -m "feat(server): esp pending devices, sensor repo and heartbeat handler"
```

---

## Commit 6: feat(firmware): mqtt client and pi-enhanced processor

**Was:** mqtt_client.cpp, pi_enhanced_processor Änderungen.

**Dateien:**
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/services/sensor/pi_enhanced_processor.cpp`
- `El Trabajante/src/services/sensor/pi_enhanced_processor.h`

**Befehle:**
```bash
git add "El Trabajante/src/services/communication/mqtt_client.cpp" "El Trabajante/src/services/sensor/pi_enhanced_processor.cpp" "El Trabajante/src/services/sensor/pi_enhanced_processor.h"
git commit -m "feat(firmware): mqtt client and pi-enhanced processor updates"
```

---

## Commit 7: chore(docker,ci,config): docker-compose, workflows, env, Makefile

**Was:** docker-compose, GitHub workflows, .env.example, Makefile.

**Dateien:**
- `docker-compose.yml`
- `.github/workflows/backend-e2e-tests.yml`
- `.github/workflows/playwright-tests.yml`
- `.env.example`
- `Makefile`

**Befehle:**
```bash
git add docker-compose.yml .github/workflows/backend-e2e-tests.yml .github/workflows/playwright-tests.yml .env.example Makefile
git commit -m "chore(docker,ci): update compose, workflows and env"
```

---

## Commit 8: chore(frontend): package.json and tsconfig

**Was:** package.json, package-lock.json, tsconfig.

**Dateien:**
- `El Frontend/package.json`
- `El Frontend/package-lock.json`
- `El Frontend/tsconfig.node.tsbuildinfo`
- `El Frontend/tsconfig.tsbuildinfo`

**Befehle:**
```bash
git add "El Frontend/package.json" "El Frontend/package-lock.json" "El Frontend/tsconfig.node.tsbuildinfo" "El Frontend/tsconfig.tsbuildinfo"
git commit -m "chore(frontend): update package and tsconfig"
```

---

## Commit 9: test(frontend): e2e esp registration flow

**Was:** Playwright-E2E für ESP-Registrierung.

**Dateien:**
- `El Frontend/tests/e2e/scenarios/esp-registration-flow.spec.ts`

**Befehle:**
```bash
git add "El Frontend/tests/e2e/scenarios/esp-registration-flow.spec.ts"
git commit -m "test(frontend): add e2e esp registration flow"
```

---

## Commit 10: docs(claude): reference, skills, agents, reports

**Was:** Alle .claude Änderungen – Agents, Reference, Skills, Reports, Rules.

**Dateien (modified):**
- `.claude/agents/frontend-debug.md`
- `.claude/reference/ROADMAP_KI_MONITORING.md`
- `.claude/reference/api/WEBSOCKET_EVENTS.md`
- `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`
- `.claude/reference/debugging/LOG_LOCATIONS.md`
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md`
- `.claude/reference/testing/agent_profiles.md`
- `.claude/rules/docker-rules.md`
- `.claude/skills/frontend-debug/SKILL.md`
- `.claude/skills/ki-audit/SKILL.md`
- `.claude/reports/Testrunner/test.md`
- `.claude/reports/current/CONSOLIDATED_REPORT.md`
- `.claude/reports/current/DB_INSPECTOR_REPORT.md`
- `.claude/reports/current/GIT_HEALTH_REPORT.md`
- `.claude/reports/current/KI_AUDIT_REPORT.md`

**Dateien (untracked):**
- `.claude/reports/current/BACKEND_INSPECTION.md`
- `.claude/reports/current/DEBUG_CONSOLIDATION_PLAN.md`
- `.claude/reports/current/DEBUG_INFRA_AGENT_ASSESSMENT.md`
- `.claude/reports/current/DEBUG_INFRA_PLAN.md`
- `.claude/reports/current/ESP_REGISTRATION_FLOW_REPORT.md`
- `.claude/reports/current/FRONTEND_INSPECTION.md`
- `.claude/reports/current/SYSTEMATIC_DEBUG_ESP472204.md`
- `.claude/reports/current/SYSTEMATIC_DEBUG_PENDING_PANEL.md`
- `.claude/reports/current/auto-one_*.md`
- `El Frontend/Docs/UI/02-Individual-Views-Summary.md`
- `docs/plans/Debug.md`
- `scripts/debug/`
- `scripts/esp/`

**Befehle:**
```bash
git add .claude/agents/frontend-debug.md .claude/reference/ .claude/rules/docker-rules.md .claude/skills/frontend-debug/SKILL.md .claude/skills/ki-audit/SKILL.md .claude/reports/ "El Frontend/Docs/UI/02-Individual-Views-Summary.md" docs/plans/Debug.md scripts/debug/ scripts/esp/
git commit -m "docs(claude): update reference, skills, agents and reports"
```

---

## Abschluss

**Nach allen Commits:**
```bash
git status
git log --oneline -12
# Optional: Push
git push origin feature/frontend-consolidation
```

**Zusammenfassung:**

| # | Commit | Typ |
|---|--------|-----|
| 1 | fix(frontend): PendingDevicesPanel visibility | fix |
| 2 | feat(frontend): dashboard consolidation | feat |
| 3 | feat(frontend): rules UI, logic store | feat |
| 4 | feat(frontend): esp store, tokens | feat |
| 5 | feat(server): esp, sensors, heartbeat | feat |
| 6 | feat(firmware): mqtt, pi-enhanced | feat |
| 7 | chore(docker,ci): compose, workflows | chore |
| 8 | chore(frontend): package, tsconfig | chore |
| 9 | test(frontend): e2e esp registration | test |
| 10 | docs(claude): reference, skills, reports | docs |

**Hinweise:**
- **Commit 1** kann einzeln verifiziert werden: Panel nach Klick auf "1 Neue" sichtbar
- **Kein Merge** bis User explizit entscheidet
- Bei Konflikten: Stash sichern, Branch-Status prüfen
- `logs/frontend/playwright/` ggf. in .gitignore statt committen
