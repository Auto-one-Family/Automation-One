# Git Commit Plan
**Erstellt:** 2026-03-06
**Branch:** master
**Ziel:** Sauberer Commit aller Änderungen ohne Verluste, GitHub-Plugin-Verifikation

---

## Commit 1: feat(server): subzone resolver, logic, sensors, autoops, notifications

**Was:** Backend-Änderungen – Subzone/Sensor-Zuordnung, Logic-Engine, AutoOps-Plugins, E-Mail/Notification-Services.

**Dateien:** El Servador/god_kaiser_server (API, DB, Schemas, Services, Tests, AutoOps, Alembic).

**Befehl:**
```bash
git add "El Servador/god_kaiser_server/"
git commit -m "feat(server): subzone resolver, logic, sensors, autoops, notifications"
```

---

## Commit 2: feat(frontend): monitor, logic, calibration, sensor/actuator config, dashboard

**Was:** Frontend – Monitor-View, Logic-Store, Kalibrierung, Sensor/Aktor-Konfiguration, Dashboard-Widgets, Tests.

**Dateien:** El Frontend (api, components, stores, styles, types, utils, views, tests).

**Befehl:**
```bash
git add "El Frontend/"
git commit -m "feat(frontend): monitor, logic, calibration, sensor/actuator config, dashboard"
```

---

## Commit 3: docs(claude): reference, skills, reports, agents, scripts, Makefile

**Was:** Dokumentation, Claude-Referenzen, Skills, Reports, AGENTS.md, Scripts, Makefile, CI.

**Dateien:** .claude/, docs/, .github/, AGENTS.md, Makefile, scripts/, arbeitsbereiche/.

**Befehl:**
```bash
git add .claude/ docs/ .github/ AGENTS.md Makefile scripts/ arbeitsbereiche/
git commit -m "docs(claude): reference, skills, reports, agents, scripts, Makefile"
```

---

## Abschluss

**Nach allen Commits:**
```bash
git status
git push origin master
```

**Hinweise:**
- tsconfig.tsbuildinfo wird mitcommittet (nicht in .gitignore).
- arbeitsbereiche/ wird einbezogen (kein Eintrag in .gitignore).
