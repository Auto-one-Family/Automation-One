# Auftrag: Monitoring-Stack erstellen und deployen

**An:** VS Code Entwickler-Agent (Edit Mode)
**Ziel:** Die 4 Monitoring-Services (Loki, Promtail, Prometheus, Grafana) in docker-compose.yml erstellen, Configs korrigieren, Stack starten und Integration verifizieren.

---

## Ausgangslage

**Was existiert:**
- Config-Dateien: `docker/loki/loki-config.yml`, `docker/promtail/config.yml`, `docker/prometheus/prometheus.yml`, `docker/grafana/provisioning/` (Datasources, Dashboards, system-health.json)
- Blueprint: `.claude/reference/infrastructure/DOCKER_AKTUELL.md` (Zeile 367-510) beschreibt den beabsichtigten Zustand aller 4 Services vollständig
- Server `/metrics` Endpoint: `api/v1/health/metrics` liefert bereits Prometheus-Format
- Dependency `prometheus-client` in `pyproject.toml`

**Was NICHT existiert:**
- Keine Monitoring-Service-Definitionen in `docker-compose.yml` (nur 4 Core-Services, endet bei Zeile ~173)
- Keine Named Volumes für Monitoring
- Kein `profiles: [monitoring]`
- Keine `GRAFANA_ADMIN_PASSWORD` in `.env.example` (`.env` hat den Wert bereits)
- Keine Makefile-Targets für Monitoring

**Was FALSCH konfiguriert ist:**
- `docker/prometheus/prometheus.yml`: `metrics_path` fehlt oder zeigt auf `/metrics` – korrekt ist `/api/v1/health/metrics`

---

## Phase 1: Kontext lesen

```bash
# 1. Blueprint für die Service-Definitionen (HAUPTQUELLE)
cat .claude/reference/infrastructure/DOCKER_AKTUELL.md

# 2. Bestehende docker-compose.yml (wo die Services reinkommen)
cat docker-compose.yml

# 3. Alle vorhandenen Configs
cat docker/loki/loki-config.yml
cat docker/promtail/config.yml
cat docker/prometheus/prometheus.yml
find docker/grafana -type f | sort
cat docker/grafana/provisioning/datasources/datasources.yml
cat docker/grafana/provisioning/dashboards/dashboards.yml

# 4. Server /metrics Endpoint (Pfad verifizieren)
grep -n "metrics" "El Servador/god_kaiser_server/src/api/v1/health.py" | head -10

# 5. .env und .env.example
cat .env
cat .env.example

# 6. Makefile
cat Makefile
```

---

## Phase 2: Service-Definitionen erstellen

### 2.1 docker-compose.yml erweitern

Füge die 4 Monitoring-Services **innerhalb des `services:` Blocks** ein – direkt **vor** der `volumes:` Sektion (vor Zeile 159). NICHT ans Dateiende, dort stehen `volumes:` und `networks:`. Nutze `DOCKER_AKTUELL.md` (Zeile 367-510) als Blueprint. Hier die Kern-Anforderungen:

**Alle 4 Services brauchen:**
- `profiles: ["monitoring"]`
- `networks: [automationone-net]`
- `restart: unless-stopped`
- `logging:` mit `json-file`, `max-size: "5m"`, `max-file: "3"`
- Healthcheck mit `interval`, `timeout`, `retries`

**Loki:**

```yaml
loki:
  image: grafana/loki:3.4
  container_name: automationone-loki
  profiles: ["monitoring"]
  ports:
    - "3100:3100"
  volumes:
    - ./docker/loki/loki-config.yml:/etc/loki/local-config.yaml:ro
    - automationone-loki-data:/loki
  command: -config.file=/etc/loki/local-config.yaml
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3100/ready || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  networks:
    - automationone-net
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

**Promtail:**

```yaml
promtail:
  image: grafana/promtail:3.4
  container_name: automationone-promtail
  profiles: ["monitoring"]
  volumes:
    - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
  command: -config.file=/etc/promtail/config.yml
  depends_on:
    loki:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9080/ready || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  networks:
    - automationone-net
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

**Hinweis Windows/Docker Desktop:** Der Mount `/var/run/docker.sock:/var/run/docker.sock:ro` funktioniert auf Windows mit Docker Desktop über WSL2-Integration automatisch, solange der Container Linux-basiert ist (ist er – `grafana/promtail` ist Linux).

**Prometheus:**

```yaml
prometheus:
  image: prom/prometheus:v3.2.1
  container_name: automationone-prometheus
  profiles: ["monitoring"]
  ports:
    - "9090:9090"
  volumes:
    - ./docker/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
    - automationone-prometheus-data:/prometheus
  command:
    - '--config.file=/etc/prometheus/prometheus.yml'
    - '--storage.tsdb.retention.time=7d'
    - '--web.enable-lifecycle'
  depends_on:
    el-servador:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  networks:
    - automationone-net
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

**Image-Tag `v3.2.1`:** Das ist die in DOCKER_AKTUELL.md spezifizierte Version. Falls der Pull fehlschlägt:
```bash
docker pull prom/prometheus:v3.2.1
# Falls Fehler → Fallback:
docker pull prom/prometheus:latest
```

**Grafana:**

```yaml
grafana:
  image: grafana/grafana:11.5.2
  container_name: automationone-grafana
  profiles: ["monitoring"]
  ports:
    - "3000:3000"
  environment:
    - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-admin}
    - GF_USERS_ALLOW_SIGN_UP=false
  volumes:
    - ./docker/grafana/provisioning:/etc/grafana/provisioning:ro
    - automationone-grafana-data:/var/lib/grafana
  depends_on:
    loki:
      condition: service_healthy
    prometheus:
      condition: service_healthy
  healthcheck:
    test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"]
    interval: 15s
    timeout: 5s
    retries: 5
  networks:
    - automationone-net
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "5m"
      max-file: "3"
```

### 2.2 Named Volumes ergänzen

In der `volumes:`-Sektion am Ende der docker-compose.yml (dort wo bereits die Core-Volumes stehen):

```yaml
volumes:
  # ... bestehende Core-Volumes ...
  automationone-loki-data:
  automationone-prometheus-data:
  automationone-grafana-data:
```

### 2.3 Vergleich mit Blueprint

Nachdem du die Services geschrieben hast, vergleiche gegen DOCKER_AKTUELL.md:

```bash
# Alle Service-Namen korrekt?
grep -E "^\s+(loki|promtail|prometheus|grafana):" docker-compose.yml

# Alle Container-Namen korrekt?
grep "container_name: automationone-" docker-compose.yml

# Alle im Monitoring-Profile?
grep -A 2 "profiles:" docker-compose.yml | grep monitoring

# Alle im richtigen Netzwerk?
grep -B 20 "automationone-net" docker-compose.yml | grep -E "^\s+(loki|promtail|prometheus|grafana):"

# Volumes definiert?
grep "automationone-.*-data" docker-compose.yml
```

**Prüfe gegen DOCKER_AKTUELL.md:** Stimmen Images, Ports, Memory-Limits (falls im Blueprint angegeben), Container-Namen? Korrigiere Abweichungen.

### 2.4 Makefile-Targets ergänzen

Das Makefile hat KEINE Monitoring-Targets. Ergänze am Ende des Makefiles:

```makefile
# ============================================
# Monitoring Stack (Profile: monitoring)
# ============================================
monitor-up:
	$(COMPOSE) --profile monitoring up -d

monitor-down:
	$(COMPOSE) --profile monitoring down

monitor-logs:
	$(COMPOSE) --profile monitoring logs -f --tail=100

monitor-status:
	$(COMPOSE) --profile monitoring ps
```

Ergänze auch die `.PHONY`-Zeile um die neuen Targets und den `help`-Block:
```
@echo "  make monitor-up  - Start monitoring stack (Loki, Promtail, Prometheus, Grafana)"
@echo "  make monitor-down - Stop monitoring stack"
@echo "  make monitor-logs - Follow monitoring logs"
@echo "  make monitor-status - Monitoring container status"
```

---

## Phase 3: Configs korrigieren

### 3.1 Prometheus metrics_path (KRITISCH)

```bash
cat docker/prometheus/prometheus.yml
```

Die bestehende Config hat bereits `scrape_configs` mit `metrics_path: '/metrics'` – das ist FALSCH. Korrigiere NUR den `metrics_path`, behalte alle anderen Einträge (Labels, Self-Scrape) bei. Die korrekte vollständige Config:

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'el-servador'
    metrics_path: '/api/v1/health/metrics'
    static_configs:
      - targets: ['el-servador:8000']
        labels:
          service: 'el-servador'
          environment: 'development'

  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

**NICHT** `/metrics` – der korrekte Pfad ist `/api/v1/health/metrics` (verifiziert in `health.py`: Router-Prefix `/v1/health` + App-Mount `/api` = `/api/v1/health/metrics`).

**ACHTUNG:** `DOCKER_AKTUELL.md` (Zeile 432) enthält ebenfalls den falschen Pfad `/metrics` – wird separat korrigiert.

### 3.2 Promtail Docker-Compose-Project-Filter

```bash
grep "compose.project" docker/promtail/config.yml
```

Promtail filtert Container nach `com.docker.compose.project`. Der Projekt-Name wird vom Verzeichnisnamen abgeleitet. Bei euch ist das Verzeichnis `Auto-one`, also wird der Compose-Projektname `auto-one` (lowercase).

Prüfe ob der Filter in der Promtail-Config dazu passt. Falls dort ein anderer Projektname steht, korrigiere ihn.

### 3.3 Grafana Datasource UIDs

```bash
cat docker/grafana/provisioning/datasources/datasources.yml
```

Die Dashboard-Datei (`system-health.json`) referenziert Datasources über UIDs. Prüfe ob die UIDs in `datasources.yml` mit denen in `system-health.json` übereinstimmen:

```bash
# UIDs in Datasources
grep "uid:" docker/grafana/provisioning/datasources/datasources.yml

# UIDs im Dashboard
grep -o '"uid":"[^"]*"' docker/grafana/provisioning/dashboards/system-health.json | sort -u
```

Falls sie nicht matchen → Datasource UIDs in `datasources.yml` an die Dashboard-Referenzen anpassen.

### 3.4 .env.example ergänzen

`.env` hat bereits `GRAFANA_ADMIN_PASSWORD=admin` (Zeile 56) – NICHT anfassen.

`.env.example` fehlt der Eintrag. Ergänze am Ende (vor den Production Notes):

```env
# =======================
# pgAdmin (Profile: devtools)
# =======================
PGADMIN_EMAIL=admin@example.com
PGADMIN_PASSWORD=changeme

# =======================
# Grafana (Profile: monitoring)
# =======================
GRAFANA_ADMIN_PASSWORD=changeme
```

**Hinweis:** pgAdmin-Variablen fehlen ebenfalls in `.env.example` – werden gleich mit ergänzt.

---

## Phase 4: Stack starten

### 4.1 Core-Stack verifizieren

```bash
docker compose ps
# Erwartet: 4 Container, alle healthy
```

Falls nicht healthy → **STOP**. Erst Core fixen.

### 4.2 Images vorab pullen

```bash
docker pull grafana/loki:3.4
docker pull grafana/promtail:3.4
docker pull prom/prometheus:v3.2.1
docker pull grafana/grafana:11.5.2
```

Falls ein Pull fehlschlägt → Image-Tag in docker-compose.yml anpassen (z.B. `latest`) und erneut versuchen. **Dokumentiere welcher Tag funktioniert hat.**

### 4.3 Monitoring-Stack starten

```bash
docker compose --profile monitoring up -d
```

### 4.4 Auf healthy warten

```bash
# Polling (max 90 Sekunden)
for i in $(seq 1 18); do
  echo "--- Check $i/18 ($(($i * 5))s) ---"
  docker compose --profile monitoring ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null | grep -E "loki|promtail|prometheus|grafana"
  
  # Alle healthy?
  UNHEALTHY=$(docker compose --profile monitoring ps 2>/dev/null | grep -E "loki|promtail|prometheus|grafana" | grep -v "healthy" | grep -v "STATUS" | wc -l)
  if [ "$UNHEALTHY" -eq 0 ] 2>/dev/null; then
    echo "=== Alle Monitoring-Services healthy ==="
    break
  fi
  sleep 5
done
```

### 4.5 Health-Checks

```bash
echo "=== Loki ==="
curl -sf http://localhost:3100/ready && echo " → OK" || echo " → FAILED"

echo "=== Prometheus ==="
curl -sf http://localhost:9090/-/healthy && echo " → OK" || echo " → FAILED"

echo "=== Grafana ==="
curl -sf http://localhost:3000/api/health && echo " → OK" || echo " → FAILED"

echo "=== Promtail (nur Container-Status) ==="
docker compose --profile monitoring ps promtail --format "{{.Status}}"
```

Falls ein Service nicht healthy wird:
```bash
docker compose --profile monitoring logs --tail=30 <service-name>
```

---

## Phase 5: Integration verifizieren

### 5.1 Promtail → Loki (Log-Pipeline)

```bash
# Welche Labels kennt Loki?
curl -sG http://localhost:3100/loki/api/v1/labels

# Welche Services? (Promtail setzt Label "service" aus __meta_docker_compose_service)
curl -sG http://localhost:3100/loki/api/v1/label/service/values
# Erwartet: Mindestens el-frontend, el-servador, mqtt-broker, postgres
# (kann 1-2 Minuten dauern bis Promtail die ersten Logs liefert)
```

Falls leer → 30 Sekunden warten und erneut prüfen. Promtail braucht etwas Zeit für die Docker-Discovery.

**Hinweis:** Das Label heisst `service` (NICHT `service_name`), weil `docker/promtail/config.yml` Zeile 31 `target_label: 'service'` setzt.

```bash
# Frontend-Logs in Loki?
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-frontend"}' \
  --data-urlencode 'limit=3'

# Server-Logs in Loki?
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={service="el-servador"}' \
  --data-urlencode 'limit=3'
```

### 5.2 Loki-Label für Frontend identifizieren (KRITISCH)

Der frontend-debug Agent nutzt Loki-Queries mit `{service="el-frontend"}`. Prüfe welches Label tatsächlich funktioniert:

```bash
echo "=== Test: service ==="
curl -sG http://localhost:3100/loki/api/v1/query \
  --data-urlencode 'query={service="el-frontend"}' --data-urlencode 'limit=1' 2>/dev/null | head -3

echo "=== Test: service_name ==="
curl -sG http://localhost:3100/loki/api/v1/query \
  --data-urlencode 'query={service_name="el-frontend"}' --data-urlencode 'limit=1' 2>/dev/null | head -3

echo "=== Test: container ==="
curl -sG http://localhost:3100/loki/api/v1/query \
  --data-urlencode 'query={container="automationone-frontend"}' --data-urlencode 'limit=1' 2>/dev/null | head -3

echo "=== Test: compose_service ==="
curl -sG http://localhost:3100/loki/api/v1/query \
  --data-urlencode 'query={compose_service="el-frontend"}' --data-urlencode 'limit=1' 2>/dev/null | head -3
```

**Dokumentiere welches Label Ergebnisse liefert.** Falls es NICHT `service="el-frontend"` ist, müssen die Agent-Dateien korrigiert werden (Phase 6).

### 5.3 Prometheus → Server Metrics

```bash
# Server-Metrics erreichbar?
curl -s http://localhost:8000/api/v1/health/metrics | head -10
# Erwartet: Prometheus-Format (# HELP, # TYPE, Metriken)

# Prometheus sieht den Target?
curl -s http://localhost:9090/api/v1/targets 2>/dev/null | python3 -m json.tool 2>/dev/null | grep -A 5 "el-servador" || echo "Target nicht gefunden"

# Target-Health
curl -s http://localhost:9090/api/v1/targets 2>/dev/null | grep -o '"health":"[^"]*"'
# Erwartet: "health":"up"
```

Falls Target "down":
```bash
# Kann Prometheus den Server erreichen? (gleiches Netzwerk?)
docker compose --profile monitoring exec prometheus wget -qO- http://el-servador:8000/api/v1/health/metrics 2>/dev/null | head -5
```

### 5.4 Grafana Datasources

```bash
# Datasources konfiguriert?
curl -sf http://localhost:3000/api/datasources -u admin:${GRAFANA_ADMIN_PASSWORD:-admin} 2>/dev/null | python3 -m json.tool 2>/dev/null | head -30
# Erwartet: 2 Datasources (Loki + Prometheus)
```

### 5.5 Grafana Dashboard

```bash
# Dashboards geladen?
curl -sf http://localhost:3000/api/search -u admin:${GRAFANA_ADMIN_PASSWORD:-admin} 2>/dev/null | python3 -m json.tool 2>/dev/null
# Erwartet: Mindestens "System Health" Dashboard
```

---

## Phase 6: Agent-Dokumentation korrigieren

### 6.1 Loki-Label prüfen und korrigieren

Basierend auf Phase 5.2 – falls das funktionierende Label NICHT `service="el-frontend"` ist:

```bash
# Alle Loki-Queries in Agent-Dateien finden
grep -rn 'service="el-' .claude/agents/ .claude/skills/

# Korrektes Label einsetzen (Beispiel wenn es service_name ist):
# service="el-frontend" → service_name="el-frontend"
```

Betroffen:
- `.claude/agents/frontend/frontend-debug-agent.md`
- `.claude/skills/frontend-debug/SKILL.md`
- Eventuelle andere Debug-Agenten mit Loki-Queries

### 6.2 Alle Loki-Queries funktional testen

Nimm jede Loki-Query aus dem frontend-debug Agent und führe sie aus:

```bash
# Aus dem Agent kopieren und testen
grep "curl.*loki" .claude/agents/frontend/frontend-debug-agent.md
```

Jede Query die keine Ergebnisse liefert → Label oder Query-Syntax korrigieren.

---

## Phase 7: Bericht

Erstelle:

```
.claude/reports/current/MONITORING_STACK_DEPLOYMENT.md
```

### Struktur

```markdown
# Monitoring Stack Deployment

## Status

| Komponente | Status | Port | Details |
|------------|--------|------|---------|
| Loki | 🟢/🟡/🔴 | 3100 | Logs empfangen: ja/nein |
| Promtail | 🟢/🟡/🔴 | - | Docker Discovery aktiv: ja/nein |
| Prometheus | 🟢/🟡/🔴 | 9090 | Targets: up/down |
| Grafana | 🟢/🟡/🔴 | 3000 | Datasources: konfiguriert/fehlend |

## Änderungen durchgeführt

### docker-compose.yml
- 4 Service-Definitionen erstellt (loki, promtail, prometheus, grafana)
- 3 Named Volumes ergänzt
- Profile: monitoring für alle 4 Services

### Config-Korrekturen
- prometheus.yml: metrics_path korrigiert → /api/v1/health/metrics
- (weitere Korrekturen aus Phase 3)

### .env.example
- GRAFANA_ADMIN_PASSWORD ergänzt (`.env` hatte den Wert bereits)
- PGADMIN_EMAIL + PGADMIN_PASSWORD ergänzt

## Integration

| Pipeline | Status | Test |
|----------|--------|------|
| Container → Promtail → Loki | ? | Label-Query |
| Server /metrics → Prometheus | ? | Target-Status |
| Loki → Grafana Datasource | ? | API-Check |
| Prometheus → Grafana Datasource | ? | API-Check |
| Dashboard geladen | ? | Search-API |

## Loki-Labels (Referenz für Debug-Agenten)

| Service | Funktionierendes Label | Beispiel-Query |
|---------|----------------------|----------------|
| Frontend | ? | `{?="el-frontend"}` |
| Server | ? | `{?="el-servador"}` |
| MQTT Broker | ? | `{?="mqtt-broker"}` |
| PostgreSQL | ? | `{?="automationone-postgres"}` |

## Zugriff

| Tool | URL | Credentials |
|------|-----|-------------|
| Grafana | http://localhost:3000 | admin / (aus .env) |
| Prometheus | http://localhost:9090 | - |
| Loki API | http://localhost:3100 | - |

## Image-Tags (final verwendet)

| Service | Image | Pull erfolgreich |
|---------|-------|-----------------|
| Loki | grafana/loki:? | ja/nein |
| Promtail | grafana/promtail:? | ja/nein |
| Prometheus | prom/prometheus:? | ja/nein |
| Grafana | grafana/grafana:? | ja/nein |

## Agent-Korrekturen
(Welche Loki-Labels in welchen Agent-Dateien korrigiert wurden)

## Startbefehle

Monitoring starten:
docker compose --profile monitoring up -d

Monitoring stoppen:
docker compose --profile monitoring down

Alles starten (Core + Monitoring):
docker compose --profile monitoring up -d

## Offene Punkte
```

---

## Regeln

1. **DOCKER_AKTUELL.md ist der Blueprint** – Vergleiche deine Service-Definitionen dagegen
2. **Core-Stack nicht anfassen** – Kein Ändern der 4 bestehenden Services
3. **Images vorab pullen** – Bevor du startest, sicherstellen dass alle Tags existieren
4. **metrics_path ist `/api/v1/health/metrics`** – NICHT `/metrics`
5. **Loki-Label identifizieren** – Das exakte Label ist kritisch für die Agent-Integration
6. **Bericht ist Pflicht** – Ampel-Status, alle Tests, alle Labels
7. **DOCKER_AKTUELL.md wird separat korrigiert** – metrics_path war im Blueprint selbst falsch, wurde berichtigt
8. **Makefile-Targets sind Pflicht** – Phase 2.4 nicht vergessen