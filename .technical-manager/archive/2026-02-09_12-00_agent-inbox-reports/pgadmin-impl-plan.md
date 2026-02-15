# pgAdmin DevTools - Verifizierter Implementierungsplan

**Agent:** verify-plan + system-control
**Datum:** 2026-02-09
**Auftrag:** 4.1 - pgAdmin DevTools Verifikation & Implementierungsplan
**Status:** VERIFIZIERT - Bereit zur Implementierung

---

## Phase A: Spezifikations-Verifikation

### A1: servers.json - BESTAETIGT mit Korrektur

**Datei:** `docker/pgadmin/servers.json` (14 Zeilen)

| Feld | Wert | docker-compose.yml / .env | Status |
|------|------|---------------------------|--------|
| Host | `postgres` | Service-Name `postgres:` | OK |
| Port | `5432` | `ports: "5432:5432"` | OK |
| MaintenanceDB | `god_kaiser_db` | `POSTGRES_DB=god_kaiser_db` | OK |
| Username | `god_kaiser` | `POSTGRES_USER=god_kaiser` | OK |
| SSLMode | `prefer` | n/a (Docker-intern) | OK (harmlos) |
| PassFile | `/pgpass` | **Datei existiert nicht** | ENTFERNEN |

**Aenderung:** Zeile 10 Komma entfernen, Zeile 11 (`PassFile`) loeschen.

### A2: .env.example - BESTAETIGT

**Datei:** `.env.example` (72 Zeilen)

- **KEINE** pgAdmin-Variablen vorhanden (TM-Erstannahme war falsch, bereits korrigiert)
- Letzte Sektion: `GRAFANA_ADMIN_PASSWORD=changeme` (Zeile 55)
- Naechste Sektion: Wokwi CI (Zeile 57)
- **Einfuegepunkt:** Nach Zeile 55, vor Zeile 57

### A3: docker-compose.yml Service-Platzierung - BESTAETIGT

**Datei:** `docker-compose.yml` (328 Zeilen)

| Zeile | Inhalt |
|-------|--------|
| 283-306 | `postgres-exporter` (letzter profiled Service) |
| 307 | (leer) |
| 308-310 | Volumes-Header-Kommentar |
| 311 | `volumes:` |

**Einfuegepunkt:** Nach Zeile 306, vor Zeile 308. Zwischen postgres-exporter und Volumes-Sektion.

### A4: docker-compose.yml Volume-Platzierung - BESTAETIGT

| Zeile | Inhalt |
|-------|--------|
| 318 | `automationone-grafana-data:` |
| 319 | `automationone-promtail-positions:` |
| 320 | (leer) |

**Einfuegepunkt:** Nach Zeile 319 (letzte bestehende Volume-Deklaration).

**Konvention:** Monitoring-Volumes nutzen Format `automationone-{service}-data:` ohne explizite `name:` Property (anders als Core-Volumes postgres_data/mosquitto_data). pgAdmin folgt dem Monitoring-Pattern.

### A5: Makefile - BESTAETIGT

**Datei:** `Makefile` (150 Zeilen)

| Zeile | Inhalt |
|-------|--------|
| 7 | `.PHONY:` Deklaration (1 Zeile, alle Targets) |
| 47-51 | Monitoring Help-Sektion (letzte Help-Gruppe) |
| 52 | (leer, Ende help-Target) |
| 136-149 | Monitoring Targets (letzte Targets) |
| 150 | (leer, Ende der Datei) |

**Einfuegepunkte:**
1. Zeile 7: `.PHONY` erweitern um `devtools-up devtools-down devtools-logs devtools-status`
2. Nach Zeile 51: DevTools Help-Sektion einfuegen
3. Nach Zeile 149: DevTools Targets einfuegen

### A6: Profile `devtools` - BESTAETIGT

Profile `devtools` wird bereits in Kommentaren referenziert:
- `docker-compose.ci.yml:87-88`: `"pgadmin, loki, promtail, prometheus, grafana are excluded via their profiles (devtools, monitoring) which are not activated in CI"`
- `docker-compose.e2e.yml:106`: `"pgadmin, loki, promtail, prometheus, grafana excluded via profiles"`

**Keine Aenderungen** an CI/E2E-Dateien noetig. Die Kommentare sind bereits korrekt.

---

## Phase B: Image & Healthcheck Validierung

### B1: Image-Version - KORREKTUR ERFORDERLICH

| Aspekt | Original-Plan | Verifiziert | Quelle |
|--------|--------------|-------------|--------|
| Geplante Version | `dpage/pgadmin4:9.3` | **VERALTET** | Docker Hub, pgadmin.org |
| Aktuelle Version | - | `dpage/pgadmin4:9.12` | pgadmin.org Release Notes (05.02.2026) |

**KRITISCH - Sicherheitsluecken in 9.3:**
- **CVE-2025-12762** (9.10): Remote Code Execution bei PLAIN-Format SQL Restore
- **CVE-2025-12763** (9.10): Command Injection auf Windows
- **CVE-2026-1707** (9.12): Secret Key Exposure im Process Watcher

**Empfehlung:** Version auf `9.12` aendern. Zwingend fuer industrielles Niveau.

### B2: Healthcheck-Pfad - BESTAETIGT

| Aspekt | Wert | Status |
|--------|------|--------|
| Endpoint | `/misc/ping` | OK - Offizieller pgAdmin Healthcheck-Endpoint |
| Response | HTTP 200, Body: "PING" | OK - Leichtgewichtig, keine Session-Erstellung |
| Tool | `wget` | OK - In Alpine (pgAdmin Base-Image) verfuegbar |
| Interner Port | 80 | OK - pgAdmin Default (PGADMIN_LISTEN_PORT=80) |

**Healthcheck-Befehl (final):**
```
wget --no-verbose --tries=1 --spider http://localhost:80/misc/ping || exit 1
```

Konsistent mit Monitoring-Pattern (Loki: `/ready`, Prometheus: `/-/healthy`, Grafana: `/api/health`).

### B3: Port-Mapping - BESTAETIGT

| Aspekt | Wert |
|--------|------|
| Intern (Container) | 80 |
| Extern (Host) | 5050 |
| Kollidiert mit | Nichts (kein Service auf 5050) |

---

## Phase C: Implementierungsplan

### Schritt 1: servers.json bearbeiten

**Datei:** `docker/pgadmin/servers.json`

```diff
  {
    "Servers": {
      "1": {
        "Name": "AutomationOne",
        "Group": "Servers",
        "Host": "postgres",
        "Port": 5432,
        "MaintenanceDB": "god_kaiser_db",
        "Username": "god_kaiser",
-       "SSLMode": "prefer",
-       "PassFile": "/pgpass"
+       "SSLMode": "prefer"
      }
    }
  }
```

### Schritt 2: .env.example erweitern

**Datei:** `.env.example`
**Einfuegen nach Zeile 55** (nach `GRAFANA_ADMIN_PASSWORD=changeme`):

```env

# =======================
# pgAdmin (Profile: devtools)
# SECURITY: Change this password! Default fallback in docker-compose: 'admin' - INSECURE!
# Generate with: python -c "import secrets; print(secrets.token_urlsafe(16))"
# =======================
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=changeme
```

### Schritt 3: docker-compose.yml Service einfuegen

**Datei:** `docker-compose.yml`
**Einfuegen nach Zeile 306** (nach postgres-exporter logging-Block, vor Volumes-Header):

```yaml

  # ============================================
  # pgAdmin (Database Management) - Profile: devtools
  # ============================================
  pgadmin:
    image: dpage/pgadmin4:9.12
    container_name: automationone-pgadmin
    profiles: ["devtools"]
    ports:
      - "5050:80"
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_DEFAULT_EMAIL:-admin@automationone.local}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_DEFAULT_PASSWORD:-admin}
    volumes:
      - ./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro
      - automationone-pgadmin-data:/var/lib/pgadmin
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:80/misc/ping || exit 1"]
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

**Pattern-Konsistenz mit bestehenden Services:**
- Image-Pinning: Exakte Version wie Grafana (11.5.2), Prometheus (v3.2.1)
- Container-Name: `automationone-pgadmin` (automationone-{service} Pattern)
- Healthcheck: `wget --no-verbose --tries=1 --spider` (identisch mit Loki, Prometheus, Grafana, postgres-exporter)
- Healthcheck-Timing: interval 15s, timeout 5s, retries 5 (identisch mit allen Monitoring-Services)
- Logging: json-file, 5m/3 (identisch mit allen Monitoring-Services)
- Restart: unless-stopped (identisch mit allen Services)
- Network: automationone-net (identisch mit allen Services)
- depends_on: postgres healthy (wie postgres-exporter)

### Schritt 4: docker-compose.yml Volume einfuegen

**Datei:** `docker-compose.yml`
**Einfuegen nach Zeile 319** (nach `automationone-promtail-positions:`):

```yaml
  automationone-pgadmin-data:
```

### Schritt 5: Makefile aktualisieren

**Datei:** `Makefile`

**5a: .PHONY erweitern (Zeile 7)**

```diff
- .PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status
+ .PHONY: help up down dev dev-down test test-down build clean e2e-up e2e-down e2e-test e2e-test-ui logs logs-server logs-mqtt logs-frontend logs-db shell-server shell-db db-migrate db-rollback db-status db-backup db-restore mqtt-sub status health monitor-up monitor-down monitor-logs monitor-status devtools-up devtools-down devtools-logs devtools-status
```

**5b: Help-Sektion einfuegen (nach Zeile 51)**

```makefile
	@echo ""
	@echo "DevTools Stack:"
	@echo "  make devtools-up     - Start devtools (pgAdmin)"
	@echo "  make devtools-down   - Stop devtools stack"
	@echo "  make devtools-logs   - Follow devtools logs"
	@echo "  make devtools-status - DevTools container status"
```

**5c: Targets einfuegen (nach Zeile 149, Ende der Datei)**

```makefile

# ============================================
# DevTools Stack (Profile: devtools)
# ============================================
devtools-up:
	$(COMPOSE) --profile devtools up -d

devtools-down:
	$(COMPOSE) --profile devtools down

devtools-logs:
	$(COMPOSE) --profile devtools logs -f --tail=100

devtools-status:
	$(COMPOSE) --profile devtools ps
```

---

## Implementierungsreihenfolge

| # | Datei | Aenderung | Abhaengigkeit |
|---|-------|-----------|---------------|
| 1 | `docker/pgadmin/servers.json` | PassFile entfernen | Keine |
| 2 | `.env.example` | pgAdmin-Sektion hinzufuegen | Keine |
| 3 | `docker-compose.yml` | pgadmin Service-Block | servers.json (Schritt 1) |
| 4 | `docker-compose.yml` | Volume hinzufuegen | Service-Block (Schritt 3) |
| 5 | `Makefile` | .PHONY + Help + Targets | docker-compose.yml (Schritt 3-4) |

Schritte 1+2 sind unabhaengig und koennen parallel erfolgen. Schritte 3+4 gehoeren zusammen (eine Edit-Session). Schritt 5 nach 3+4.

---

## Verifikations-Checkliste

### Syntax-Validierung (vor Start)
```bash
docker compose --profile devtools config --quiet
```
Muss ohne Fehler durchlaufen.

### Funktions-Test
```bash
# 1. pgAdmin starten
make devtools-up

# 2. Container-Status pruefen
make devtools-status
# Erwartung: pgadmin Up (healthy)

# 3. Healthcheck pruefen
docker inspect automationone-pgadmin --format='{{json .State.Health.Status}}'
# Erwartung: "healthy"

# 4. Browser-Test
# http://localhost:5050
# Login: admin@automationone.local / changeme (oder Werte aus .env)
# AutomationOne-Server muss in Server-Liste sichtbar sein

# 5. DB-Verbindung testen
# Im Browser: Klick auf AutomationOne Server
# Passwort eingeben (POSTGRES_PASSWORD aus .env)
# god_kaiser_db muss sichtbar sein mit allen Tabellen

# 6. Sauberer Shutdown
make devtools-down
```

### Keine Seiteneffekte
```bash
# Core-Stack darf nicht betroffen sein
make status
# Erwartung: Alle Core-Services unveraendert

# Monitoring-Stack darf nicht betroffen sein
make monitor-status
# Erwartung: Wie zuvor (laufend oder gestoppt)
```

---

## Dokumentations-Updates (nach Implementation)

| Datei | Aenderung |
|-------|-----------|
| `.claude/reference/infrastructure/DOCKER_REFERENCE.md` | pgAdmin Service, Volume, Makefile-Targets, Port 5050 |
| `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` | DevTools-Commands |
| `.claude/CLAUDE.md` | Falls Service-Zaehlung erwaehnt wird |

---

## Zusammenfassung der Korrekturen gegenueber Erstanalyse

| Punkt | Erstanalyse | Korrektur | Grund |
|-------|------------|-----------|-------|
| Image-Version | `9.3` | **`9.12`** | 3 CVEs gefixt (RCE, Command Injection, Secret Exposure) |
| .env-Kommentar | Fehlte | `Generate with: python -c ...` hinzugefuegt | Konsistenz mit Grafana-Sektion |
| Alle anderen Punkte | Korrekt | Bestaetigt | Exakte Zeilennummern verifiziert |

---

*Quellen: [pgAdmin Release Notes](https://www.pgadmin.org/docs/pgadmin4/latest/release_notes.html), [pgAdmin Container Deployment](https://www.pgadmin.org/docs/pgadmin4/latest/container_deployment.html), [Docker Hub dpage/pgadmin4](https://hub.docker.com/r/dpage/pgadmin4)*
