# Git Commit Plan
**Erstellt:** 2026-03-05
**Branch:** master
**Remote:** origin (Auto-one-Family/Automation-One)
**GitHub:** master protected, keine offenen PRs

**Änderungen gesamt:** 65 modified, 21 untracked

---

## Commit 1: docs(reference): update API docs, database, docker, errors, CI

**Was:** Referenz-Dokumentation aktualisieren

**Dateien:**
- .claude/reference/DATABASE_ARCHITECTURE.md
- .claude/reference/api/MQTT_TOPICS.md
- .claude/reference/api/REST_ENDPOINTS.md
- .claude/reference/api/WEBSOCKET_EVENTS.md
- .claude/reference/debugging/CI_PIPELINE.md
- .claude/reference/debugging/LOG_LOCATIONS.md
- .claude/reference/errors/ERROR_CODES.md
- .claude/reference/infrastructure/DOCKER_AKTUELL.md
- .claude/reference/infrastructure/DOCKER_REFERENCE.md

---

## Commit 2: chore(ci): extend trivyignore

**Was:** Trivy-Scanner Ignore-Regeln erweitern

**Dateien:**
- .trivyignore

---

## Commit 3: chore(skills): update frontend and server development skills

**Was:** Skills und MODULE_REGISTRY aktualisieren

**Dateien:**
- .claude/skills/frontend-development/SKILL.md
- .claude/skills/server-development/MODULE_REGISTRY.md
- .claude/skills/server-development/SKILL.md

---

## Commit 4: docs(reports): add alert analysis, config panel, subzone, email reports

**Was:** Session-Reports und Analysen hinzufügen

**Dateien (modified + untracked):**
- .claude/reports/Testrunner/test.md
- .claude/reports/current/* (alle modified und untracked)

---

## Commit 5: feat(server): subzone helpers, email retry, sensor/actuator API, zone KPI

**Was:** Backend: Subzone-Helpers, Email-Retry-Service, API-Anpassungen, Zone-KPI

**Dateien:**
- El Servador/god_kaiser_server/src/api/v1/*
- El Servador/god_kaiser_server/src/db/models/zone_context.py
- El Servador/god_kaiser_server/src/db/repositories/email_log_repo.py
- El Servador/god_kaiser_server/src/main.py
- El Servador/god_kaiser_server/src/schemas/*
- El Servador/god_kaiser_server/src/services/*
- El Servador/god_kaiser_server/src/utils/subzone_helpers.py (neu)
- El Servador/god_kaiser_server/src/services/email_retry_service.py (neu)
- El Servador/god_kaiser_server/tests/*

---

## Commit 6: feat(frontend): notification stack, sensor/actuator config, email postfach, labels

**Was:** Frontend: Notification-Drawer, Sensor/Actor-Config-Panels, Email-Postfach-View, Labels

**Dateien:**
- El Frontend/src/api/notifications.ts
- El Frontend/src/components/*
- El Frontend/src/composables/*
- El Frontend/src/router/index.ts
- El Frontend/src/shared/design/layout/Sidebar.vue
- El Frontend/src/shared/stores/*
- El Frontend/src/stores/esp.ts
- El Frontend/src/types/index.ts
- El Frontend/src/utils/*
- El Frontend/src/views/*
- El Frontend/tests/unit/utils/labels.test.ts
- El Frontend/Docs/UI/Sensoren/README.md
- El Frontend/README.md
