# TM-Auftrag 02: Docker Stack – Vollständige Analyse & Containerisierung

**Verfasser:** Robin (System-Kontext)  
**Format:** Einzelgespräch mit Technical Manager  
**Ziel:** Stack von vorn bis hinten analysieren, Netzwerkeigenschaften einzeln prüfen

---

## 0. Referenzdokumente für TM (Robin mitliefern)

**Diese Dateien zuerst lesen – sie liefern die Grundlage für gezielte Analyse.**

| Priorität | Pfad (relativ zu Projektroot) | Inhalt |
|-----------|-------------------------------|--------|
| 1 | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Architektur, Service-Liste, Container-Namen, Volumes, Makefile-Targets, Bind-Mounts |
| 2 | `.claude/reference/debugging/LOG_LOCATIONS.md` | Log-Verzeichnisse: `logs/server/`, `logs/mqtt/`, `logs/postgres/`, Docker-Bind-Mounts |
| 3 | `.claude/skills/system-control/SKILL.md` | Make-Targets, Health-Checks, `make up`, `make ci-up`, `make e2e-up` |
| 4 | `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | Sektion 0.5: Docker-Workflow, `docker compose`, Profile |
| 5 | `.claude/rules/docker-rules.md` | Falls vorhanden – Regeln für Docker-Änderungen |

**Compose-Varianten (Pfade):**

| Datei | Zweck |
|-------|-------|
| `docker-compose.yml` | Basis (4 Core + 1 DevTools + 4 Monitoring) |
| `docker-compose.ci.yml` | CI: tmpfs, schnelle Healthchecks |
| `docker-compose.e2e.yml` | E2E: CORS, JWT, Frontend – **`make e2e-up` vor Playwright** |

---

## 1. Referenzdateien für TM-Session hochladen

| # | Datei | Zweck |
|---|-------|-------|
| 1 | `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | Architektur, Befehle, Troubleshooting |
| 2 | `.claude/reference/infrastructure/DOCKER_AKTUELL.md` | Aktueller Stand |
| 3 | `.claude/reports/current/DOCKER_VOLLAUDIT.md` | Vollaudit |
| 4 | `.claude/reports/current/DOCKER_REPORT.md` | Zusammenfassung |
| 5 | `.claude/skills/system-control/SKILL.md` | Make-Targets, Health-Checks |
| 6 | `docker-compose.yml` | Basis-Stack |
| 7 | `docker-compose.dev.yml` | Dev-Overrides |
| 8 | `docker-compose.test.yml` | Test-Overrides |
| 9 | `docker-compose.ci.yml` | CI-Overrides |
| 10 | `docker-compose.e2e.yml` | E2E-Overrides |

---

## 2. IST-Zustand (Fakten)

### 2.1 Services

| Service | Container | Image | Ports | Healthcheck |
|---------|-----------|-------|-------|-------------|
| postgres | automationone-postgres | postgres:16-alpine | 5432 | pg_isready |
| mqtt-broker | automationone-mqtt | eclipse-mosquitto:2 | 1883, 9001 | mosquitto_sub |
| el-servador | automationone-server | Custom | 8000 | curl /health/live |
| el-frontend | automationone-frontend | Custom | 5173 | node fetch |
| pgadmin | automationone-pgadmin | dpage/pgadmin4 | 5050 | — |
| loki | automationone-loki | grafana/loki:3.4 | 3100 | wget /ready |
| promtail | automationone-promtail | grafana/promtail:3.4 | — | — |
| prometheus | automationone-prometheus | prom/prometheus:v3.2.1 | 9090 | wget /-/healthy |
| grafana | automationone-grafana | grafana/grafana:11.5.2 | 3000 | wget /api/health |

### 2.2 Netzwerk

- **Netzwerk:** `automationone-net` (bridge); alle Services im gleichen Netz.
- **Service-Discovery:** per Container-Name (z.B. `postgres:5432`).
- **Port-Exposition:** 1883 (MQTT) nicht am Host; 9001 (WebSocket) exponiert.
- **Volumes:** Named + Bind-Mounts (Logs: `./logs/server/`, `./logs/mqtt/`, `./logs/postgres/`).

### 2.3 Compose-Varianten

| Variante | PostgreSQL | el-servador DATABASE_URL | el-frontend |
|----------|------------|--------------------------|-------------|
| Basis | postgres:16 | postgresql+asyncpg | — |
| dev | postgres:16 | postgresql+asyncpg | Volume-Mounts |
| test | busybox (Dummy) | sqlite+aiosqlite | profile: frontend |
| ci | postgres + tmpfs | postgresql+asyncpg (CI) | profile: frontend |
| e2e | postgres + tmpfs | postgresql+asyncpg | profile: [] (immer gestartet) |

### 2.4 Ressourcen

- **Resource Limits:** Keine in der aktuellen Konfiguration.
- **Container-Hardening:** Sicherheitsoptionen (no-new-privileges, cap_drop) nicht aktiv.

---

## 3. Offene Fragen (für TM)

1. **Netzwerk:** Ist eine Segmentierung sinnvoll (z.B. backend vs. frontend vs. monitoring)? Welche Ports müssen am Host exponiert sein? Soll 1883 für MQTT am Host verfügbar sein?
2. **Frontend:** Läuft im Dev-Server (Vite) oder als Build (Nginx)? Wie ist das für Produktion vs. E2E gedacht?
3. **Resource Limits:** Sollen CPU/Memory-Limits für jeden Container definiert werden?
4. **Healthcheck:** Sind Intervalle und Retries für alle Environments optimal? (CI: 3–5s, Basis: 30s)
5. **Monitoring:** Wie werden Loki, Promtail, Prometheus, Grafana in den Stack integriert? Ist `--profile monitoring` der gewünschte Weg?
6. **pgadmin:** Exited (127) in manchen Läufen – ist das akzeptabel oder soll es behoben werden?

---

## 4. Bereiche für Detail-Analyse

| Bereich | Dateien | Fokus |
|---------|---------|-------|
| Netzwerk | `docker-compose.yml` networks | Bridge, Subnet, Ports |
| Volumes | `docker-compose.yml` volumes | Persistenz, Bind-Mounts |
| Healthchecks | Alle Services | Interval, Retries, Start-Period |
| Dev-Overrides | docker-compose.dev.yml | Hot-Reload, Volume-Mounts |
| Test-Overrides | docker-compose.test.yml | SQLite, Dummy-Postgres |
| CI-Overrides | docker-compose.ci.yml | tmpfs, Health-Interval |
| E2E-Overrides | docker-compose.e2e.yml | CORS, JWT, Frontend-Profile |
| Dockerfiles | `El Servador/`, `El Frontend/` | Multi-Stage, Non-Root |

### 4.1 Wo suchen / Was suchen

| Schicht | Wo suchen | Was suchen |
|---------|-----------|------------|
| **Compose** | `docker-compose*.yml` | `networks`, `volumes`, `ports`, `depends_on`, `profiles` |
| **Services** | `docker-compose.yml` | `automationone-*` Container-Namen, Healthcheck-Cmd |
| **Logs** | `logs/server/`, `logs/mqtt/`, `logs/postgres/` | Bind-Mounts in compose, Rotation |
| **E2E** | `docker-compose.e2e.yml` | `PLAYWRIGHT_API_BASE`, `CORS_ORIGINS`, JWT |
| **CI** | `.github/workflows/*.yml` | `docker-compose.ci.yml`, `--wait`, tmpfs |

### 4.2 Agent-Befehle für gezielte Analyse

| Analyse-Ziel | Agent | TM-Befehl (Kern) |
|--------------|-------|------------------|
| Stack-Status, Logs | system-control | Führe `docker compose ps`, `docker compose logs --tail=100` aus – Report |
| DB-Schema, Volume | db-inspector | Prüfe `automationone-postgres`, Tables, Migration-Status |
| MQTT-Broker-Config | mqtt-debug oder system-control | Lese `docker/mosquitto/mosquitto.conf`, prüfe Port 1883/9001 |

---

## 5. Empfohlene Agents & Skills

| Zweck | Agent | Skill |
|-------|-------|-------|
| Stack starten/stoppen, logs | system-control | system-control |
| DB-Inspektion | db-inspector | db-inspector |
| MQTT-Diagnose | — | mqtt-debug |
| Flow-Konsistenz | agent-manager | agent-manager |

---

## 6. Verknüpfung mit anderen Punkten

- **Punkt 1 (Wokwi):** CI-Mosquitto, Docker-Netz.
- **Punkt 3 (Datenbank):** Test/Dev/Prod, Volumes.
- **Punkt 4 (Netzwerk):** Port-Netzwerk, Segmentierung.

---

## 7. Randinformationen (Full-Stack-Kontext)

| Kontext | Info |
|---------|------|
| **Container-Namen** | Service `el-servador` = `automationone-server`; `postgres` = `automationone-postgres`; `mqtt-broker` = `automationone-mqtt` |
| **Port 1883** | MQTT nicht am Host exponiert; E2E nutzt `docker exec automationone-mqtt mosquitto_pub` |
| **E2E vs. Standard** | `make e2e-up` startet anderen Stack (e2e-File) – Playwright braucht explizit e2e-up |
