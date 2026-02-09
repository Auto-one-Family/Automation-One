# Promtail Positions-Datei Persistierung

**Auftrag:** 3 (system-control-promtail-positions)
**Agent:** system-control
**Datum:** 2026-02-09
**Status:** IMPLEMENTIERT, Verifikation ausstehend (Stack nicht gestartet)

---

## Analyse-Findings

- **Aktueller Positions-Pfad:** `/tmp/positions.yaml` (Zeile 11 in `docker/promtail/config.yml`)
- **Problem:** `/tmp/` ist ephemeral im Container, geht bei jedem Restart verloren
- **Log-Volumen:** ~46k Lines/h, ~1.1M/Tag (aus TM-Report)
- **Duplikate-Risiko:** Bei Restart komplette History erneut an Loki gesendet
- **Positions-Volume vorhanden:** NEIN (nur Config + Docker-Socket gemountet)
- **Ausgewaehlte Loesung:** Named Volume (konsistent mit loki-data, prometheus-data, grafana-data Pattern)

## Lösungsplan

- **Named Volume:** `automationone-promtail-positions`
- **Mount-Point:** `/promtail-positions` im Container
- **Config-Aenderung:** `/tmp/positions.yaml` → `/promtail-positions/positions.yaml`

## Implementierung

### 3 Aenderungen in 2 Dateien

**1. `docker/promtail/config.yml` (Zeile 11)**

```diff
 positions:
-  filename: /tmp/positions.yaml
+  filename: /promtail-positions/positions.yaml
```

**2. `docker-compose.yml` — Promtail Service (Zeile 194, neu)**

```diff
     volumes:
       - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
       - /var/run/docker.sock:/var/run/docker.sock:ro
+      - automationone-promtail-positions:/promtail-positions
```

**3. `docker-compose.yml` — Top-Level Volumes (Zeile 290, neu)**

```diff
   automationone-grafana-data:
+  automationone-promtail-positions:
```

**Hinweis:** Kein explizites `name:` Property — konsistent mit `automationone-loki-data`, `automationone-prometheus-data`, `automationone-grafana-data` die ebenfalls keines haben.

## Verifikation

**Noch nicht durchgefuehrt** (Monitoring-Stack war nicht gestartet).

Befehle fuer manuelle Verifikation:

```bash
# 1. YAML-Validierung
docker compose --profile monitoring config > /dev/null

# 2. Container starten + Volume pruefen
docker compose --profile monitoring up -d promtail
docker volume ls | grep automationone-promtail-positions

# 3. Container-Logs pruefen (keine Errors)
docker compose --profile monitoring logs promtail --tail 50

# 4. Positions-Datei existiert (nach ~30s)
docker exec automationone-promtail cat /promtail-positions/positions.yaml

# 5. Restart-Test (Duplikate-Check)
# Baseline Query
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({service="el-servador"} [1h])' \
  | jq '.data.result[0].value[1]'
# Restart
docker compose --profile monitoring restart promtail
# 60s warten, dann Query wiederholen — Zahl sollte NICHT doppelt sein
```

## Baseline-Metriken

- Loki Log-Count VOR Aenderung: **nicht gemessen** (Stack nicht gestartet)
- Log-Count nach Restart (mit Positions): **ausstehend**
- Duplikate: **ausstehend**

---

## Zusammenfassung

| Aspekt | Status |
|--------|--------|
| Code-Aenderungen | 3/3 umgesetzt |
| YAML-Syntax | Visuell geprueft, `docker compose config` ausstehend |
| Volume definiert | Ja (`automationone-promtail-positions`) |
| Volume gemountet | Ja (`/promtail-positions` im Container) |
| Config-Pfad aktualisiert | Ja (`/promtail-positions/positions.yaml`) |
| Live-Test | Ausstehend (Stack nicht gestartet) |
| Restart-Test | Ausstehend |

**Naechster Schritt:** Monitoring-Stack starten und Verifikationsschritte durchfuehren.
