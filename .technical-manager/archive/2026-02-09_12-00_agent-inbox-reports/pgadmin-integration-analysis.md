# pgAdmin DevTools-Profil: Erstanalyse

**Agent:** system-control (Analyse-Modus)
**Datum:** 2026-02-09
**Auftrag:** 4.1 - pgAdmin Integration Spezifikation
**Status:** VOLLSTAENDIG - Keine offenen Fragen

---

## 1. servers.json Verifikation

**Datei:** `docker/pgadmin/servers.json`

| Feld | servers.json Wert | docker-compose.yml / .env | Match |
|------|-------------------|---------------------------|-------|
| Host | `postgres` | Service-Name `postgres:` | OK |
| Port | `5432` | `ports: "5432:5432"` | OK |
| MaintenanceDB | `god_kaiser_db` | `POSTGRES_DB=god_kaiser_db` | OK |
| Username | `god_kaiser` | `POSTGRES_USER=god_kaiser` | OK |
| SSLMode | `prefer` | n/a (intern Docker-Netz) | OK (harmlos, kein SSL vorhanden) |
| PassFile | `/pgpass` | **PROBLEM** | KORREKTUR NOETIG |

### PassFile-Problem

`servers.json` referenziert `"PassFile": "/pgpass"` - diese Datei existiert nicht im Container. Zwei Optionen:

- **Option A (empfohlen):** `PassFile` Zeile entfernen. User gibt Passwort beim ersten Login ein, pgAdmin speichert es im persistenten Volume. Einfachster Ansatz fuer DevTools.
- **Option B:** pgpass-Datei erstellen und als Volume mounten. Unnoetige Komplexitaet fuer ein Dev-Tool.

### Korrigierte servers.json

```json
{
  "Servers": {
    "1": {
      "Name": "AutomationOne",
      "Group": "Servers",
      "Host": "postgres",
      "Port": 5432,
      "MaintenanceDB": "god_kaiser_db",
      "Username": "god_kaiser",
      "SSLMode": "prefer"
    }
  }
}
```

Einzige Aenderung: `PassFile` Zeile entfernt.

---

## 2. .env.example Korrektur

### IST-Zustand

Der TM-Auftrag erwaehnt `PGADMIN_EMAIL` und `PGADMIN_PASSWORD` in `.env.example`. **Diese Variablen existieren dort NICHT.** Die `.env.example` enthaelt keine pgAdmin-Variablen. Korrekturbedarf:

### SOLL-Zustand

Neuer Abschnitt in `.env.example` (nach Grafana-Sektion, Zeile 55):

```env
# =======================
# pgAdmin (Profile: devtools)
# SECURITY: Change this password! Default fallback in docker-compose: 'admin' - INSECURE!
# =======================
PGADMIN_DEFAULT_EMAIL=admin@automationone.local
PGADMIN_DEFAULT_PASSWORD=changeme
```

**Wichtig:** pgAdmin erwartet `PGADMIN_DEFAULT_EMAIL` und `PGADMIN_DEFAULT_PASSWORD` (nicht `PGADMIN_EMAIL`/`PGADMIN_PASSWORD`). Die Variablennamen sind durch das offizielle `dpage/pgadmin4` Image festgelegt.

---

## 3. Docker Service-Spezifikation

### Extrahierte Patterns aus bestehenden Monitoring-Services

| Aspekt | Monitoring-Pattern | pgAdmin-Anwendung |
|--------|-------------------|-------------------|
| Image-Pinning | Exakte Version (`grafana:11.5.2`, `prometheus:v3.2.1`) | Exakte Version pinnen |
| Container-Name | `automationone-{service}` | `automationone-pgadmin` |
| Healthcheck-Tool | `wget --no-verbose --tries=1 --spider` | Gleich |
| HC Timing | interval: 15s, timeout: 5s, retries: 5 | Gleich |
| Logging | json-file, max-size: 5m, max-file: 3 | Gleich |
| Network | `automationone-net` | Gleich |
| Restart | `unless-stopped` | Gleich |
| Profile | `profiles: ["monitoring"]` | `profiles: ["devtools"]` |
| depends_on | `condition: service_healthy` | `postgres: service_healthy` |

### Vollstaendige Service-Definition

```yaml
  # ============================================
  # pgAdmin (Database Management) - Profile: devtools
  # ============================================
  pgadmin:
    image: dpage/pgadmin4:9.3
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

### Entscheidungen und Begruendungen

| Entscheidung | Begruendung |
|-------------|-------------|
| **Image `dpage/pgadmin4:9.3`** | Offizielles pgAdmin 4 Image. Version 9.3 ist aktuell stabil (Feb 2026). Exakt gepinnt wie Grafana/Prometheus. |
| **Port 5050:80** | pgAdmin lauscht intern auf 80. Port 5050 extern ist pgAdmin-Konvention und kollidiert mit keinem bestehenden Service. |
| **Profile `devtools`** | Eigenes Profil, nicht `monitoring`. pgAdmin ist ein Dev-Tool, kein Monitoring-Service. Ermoeglicht selektives Starten. |
| **Env-Defaults** | `admin@automationone.local` / `admin` als Fallback. Gleiche Strategie wie Grafana (`${GRAFANA_ADMIN_PASSWORD:-admin}`). |
| **Volume `automationone-pgadmin-data`** | Persistiert Einstellungen, gespeicherte Queries, Passwoerter. Named Volume wie alle anderen. |
| **servers.json read-only** | Pre-Provisioning Config. pgAdmin liest sie beim Start, weitere Aenderungen ueber UI. |
| **depends_on postgres healthy** | pgAdmin ist nutzlos ohne DB. Gleiche Strategie wie `postgres-exporter`. |
| **Kein Resource-Limit** | Kein bestehender Service hat `deploy.resources`. Konsistenz beibehalten. Bei Bedarf spaeter via `docker-compose.override.yml`. |

---

## 4. Volume-Ergaenzung

Neuer Eintrag in der `volumes:` Sektion:

```yaml
  automationone-pgadmin-data:
```

Position: Nach `automationone-promtail-positions:` (Zeile 319).

---

## 5. Makefile-Targets

### Bestehendes Pattern (monitoring)

```makefile
monitor-up:      $(COMPOSE) --profile monitoring up -d
monitor-down:    $(COMPOSE) --profile monitoring down
monitor-logs:    $(COMPOSE) --profile monitoring logs -f --tail=100
monitor-status:  $(COMPOSE) --profile monitoring ps
```

### Neue Targets (devtools)

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

### Help-Sektion Ergaenzung

```
@echo ""
@echo "DevTools Stack:"
@echo "  make devtools-up     - Start devtools (pgAdmin)"
@echo "  make devtools-down   - Stop devtools stack"
@echo "  make devtools-logs   - Follow devtools logs"
@echo "  make devtools-status - DevTools container status"
```

### .PHONY Ergaenzung

Hinzufuegen: `devtools-up devtools-down devtools-logs devtools-status`

---

## 6. Platzierung im docker-compose.yml

Der neue Service-Block wird eingefuegt **nach dem postgres-exporter** (Zeile 306) und **vor der volumes-Sektion** (Zeile 308). Logische Gruppierung: alle profiled Services am Ende, devtools nach monitoring.

---

## 7. Zusammenfassung der Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `docker/pgadmin/servers.json` | `PassFile` Zeile entfernen |
| `.env.example` | pgAdmin-Sektion hinzufuegen (`PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`) |
| `docker-compose.yml` | pgadmin Service hinzufuegen (Profile: devtools) |
| `docker-compose.yml` | Volume `automationone-pgadmin-data` hinzufuegen |
| `Makefile` | 4 devtools-Targets + Help-Sektion + .PHONY |

---

## 8. Post-Implementation Checklist

- [ ] `docker compose --profile devtools config` validieren (YAML-Syntax)
- [ ] `make devtools-up` testen
- [ ] pgAdmin erreichbar unter `http://localhost:5050`
- [ ] AutomationOne-Server automatisch in der Server-Liste sichtbar
- [ ] DB-Verbindung mit Passwort-Eingabe funktioniert
- [ ] `make devtools-down` stoppt Container sauber
- [ ] Dokumentation aktualisieren: DOCKER_REFERENCE.md, SYSTEM_OPERATIONS_REFERENCE.md

---

## 9. Diskrepanz-Hinweis fuer TM

Der TM-Auftrag erwaehnte: "`.env.example` – `PGADMIN_EMAIL` und `PGADMIN_PASSWORD` definiert (aber verwaist)". **Diese Variablen existieren NICHT in `.env.example`.** Moeglicherweise waren sie in einer frueheren Version vorhanden oder befinden sich in der tatsaechlichen `.env` (nicht im Repo). Die Analyse basiert auf dem aktuellen Stand der `.env.example`.
