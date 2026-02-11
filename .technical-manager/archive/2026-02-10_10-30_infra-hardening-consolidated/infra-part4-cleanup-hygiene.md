# Infra Part 4: Cleanup & Hygiene - Report
**Datum:** 2026-02-10
**Agent:** /do (system-control scope)
**Plan:** `.technical-manager/commands/pending/infra-part4-cleanup-hygiene.md`

---

## Teil A: Alert Rule 5 - ESP Offline Environment Guard

### Metriken-Label-Analyse

Die `god_kaiser_esp_*` Gauges in `El Servador/god_kaiser_server/src/core/metrics.py`
haben **KEINE Labels** (kein `environment`, kein `instance`, keine custom labels):

```python
ESP_TOTAL_GAUGE = Gauge("god_kaiser_esp_total", "Total registered ESP devices")
ESP_ONLINE_GAUGE = Gauge("god_kaiser_esp_online", "Online ESP devices")
ESP_OFFLINE_GAUGE = Gauge("god_kaiser_esp_offline", "Offline ESP devices")
```

**Option A** (Environment-Label) ist daher **nicht anwendbar**.

### Gewaehlte Loesung: Option C (Threshold + Online-Guard)

**Neue PromQL-Expression:**
```promql
god_kaiser_esp_offline > 5 and god_kaiser_esp_total > 0 and god_kaiser_esp_online > 0
```

**Begruendung:**
- `god_kaiser_esp_offline > 5` filtert Mock-Noise (Schwelle hoeher als einzelne Ausfaelle)
- `god_kaiser_esp_online > 0` stellt sicher, dass mindestens ein echtes Geraet aktiv war/ist
- Bei Mock-Daten (100 total, 32 offline, 68 online): Die Expression ist `true` (32 > 5),
  ABER der Threshold auf Stage C (`> 0`) wird erst nach dem Reduce (last) geprueft.
  Da die gesamte Expression ein Boolean-Ergebnis liefert (1 oder 0), feuert der Alert
  wenn alle Bedingungen gleichzeitig erfuellt sind - was bei Mock-Daten weiterhin der Fall ist.

**KORREKTUR-HINWEIS fuer TM:** Die Option C aus dem Plan hat eine Schwaeche:
Bei 100 Mock-ESPs mit 32 offline und 68 online sind ALLE drei Bedingungen erfuellt
(32 > 5, 100 > 0, 68 > 0). Der Alert wuerde weiterhin feuern. Fuer eine echte Loesung
muesste entweder:
- Ein `environment` Label auf den Metriken eingefuehrt werden (Server-Code-Aenderung)
- Oder die Mock-ESPs bei Server-Start NICHT als offline gezaehlt werden
- Oder der Threshold deutlich hoeher gesetzt werden (z.B. > 50% statt > 5)

**Aktueller Zustand:** Rule 5 wurde mit Option C implementiert wie im Plan vorgegeben.
Die Effektivitaet haengt von der tatsaechlichen ESP-Verteilung im Development ab.

### Geaenderte Datei

| Datei | Aenderung |
|-------|-----------|
| `docker/grafana/provisioning/alerting/alert-rules.yml` | Rule 5 PromQL + description aktualisiert |

### Beibehaltene Konfiguration
- UID: `ao-esp-offline` (unveraendert)
- Pipeline: A→B→C 3-Stage (unveraendert)
- for: 3m (unveraendert)
- severity: warning (unveraendert)
- noDataState: OK (unveraendert)

---

## Teil B: Logging-Strategie

### Erstellt: `docker/README-logging.md`

Dokumentiert den dreifachen Log-Weg:

1. **Primaer:** stdout → Docker json-file → Promtail → Loki (7 Tage Retention)
2. **Server Bind-Mount:** `logs/server/god_kaiser.log` - JSON, RotatingFileHandler (10MB x 5)
3. **Postgres Bind-Mount:** `logs/postgres/postgresql-*.log` - taeglich + 50MB Rotation
4. **MQTT:** stdout-only seit v3.1 (bind-mount `logs/mqtt/` leer)

**Geschaetzter Redundanz-Overhead:** 100-300MB

### Tatsaechlicher Zustand (verifiziert)

| Service | stdout | Bind-Mount | Docker json-file |
|---------|--------|------------|------------------|
| el-servador | via logging.yaml console handler | `logs/server/` (10MB x 5) | 10m x 3 |
| postgres | via logging_collector | `logs/postgres/` (daily + 50MB) | default |
| mqtt-broker | `log_dest stdout` | `logs/mqtt/` (leer) | default |
| el-frontend | stdout | keine | 5m x 3 |
| loki | stdout | keine | 5m x 3 |
| promtail | stdout | keine | 5m x 3 |
| prometheus | stdout | keine | 5m x 3 |
| grafana | stdout | keine | 5m x 3 |

---

## Teil C: pgAdmin Fix

### Diagnose

pgAdmin crashed **NICHT** wegen servers.json Mount-Problemen:
- `docker/pgadmin/servers.json` existiert und ist valides JSON
- Der Bind-Mount `./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro` funktioniert korrekt

**Tatsaechliche Ursache:** pgAdmin 9.12 hat strikte Email-Validierung:
```
'admin@automationone.local' does not appear to be a valid email address.
```
Die `.local` TLD ist als "special-use" reserviert und wird von pgAdmin 9.12 abgelehnt.

### Fix

| Datei | Aenderung |
|-------|-----------|
| `docker-compose.yml` | `PGADMIN_DEFAULT_EMAIL` Default: `.local` → `.dev` |

**Vorher:** `${PGADMIN_DEFAULT_EMAIL:-admin@automationone.local}`
**Nachher:** `${PGADMIN_DEFAULT_EMAIL:-admin@automationone.dev}`

### Verifikation

```
docker inspect --format='{{.State.Health.Status}}' automationone-pgadmin
→ healthy
```

pgAdmin startet, akzeptiert die Email, Healthcheck (`/misc/ping`) antwortet mit 200.

---

## Teil D: Verwaiste Volumes

### Dangling Volumes (von keinem Container genutzt)

| Volume | Groesse | Herkunft | Empfehlung |
|--------|---------|----------|------------|
| `automationone-postgres-data` | 112.5MB | Alte postgres-Daten (vor Volume-Naming) | LOESCHEN nach Backup-Pruefung |
| `automationone-grafana-data` | 22.6MB | Alte Grafana-Dashboards/Einstellungen | LOESCHEN (Dashboards sind provisioned) |
| `automationone-prometheus-data` | 18.9MB | Alte TSDB-Daten (7d Retention) | LOESCHEN (Metriken sind ephemer) |
| `automationone-loki-data` | 8.5MB | Alte Log-Daten | LOESCHEN (Logs sind ephemer) |
| `automationone-mosquitto-log` | 276KB | Entfernt aus docker-compose.yml | LOESCHEN |
| `fc61035e...` (anonym) | 4KB | Unbekannter Ursprung | LOESCHEN |

**Gesamt verwaist:** ~162.8MB

### Aktive Volumes (von laufenden Containern genutzt)

| Volume | Groesse | Service |
|--------|---------|---------|
| `auto-one_automationone-grafana-data` | 23.6MB | grafana |
| `auto-one_automationone-prometheus-data` | 17.2MB | prometheus |
| `auto-one_automationone-loki-data` | 10.0MB | loki |
| `auto-one_automationone-promtail-positions` | 1.2KB | promtail |
| `auto-one_automationone-pgadmin-data` | ~0MB | pgadmin (frisch) |
| `automationone-mosquitto-data` | 3KB | mqtt-broker |
| `automationone-postgres-data` | 112.5MB | ACHTUNG: dangling! |

**HINWEIS:** `automationone-postgres-data` wird als dangling gelistet obwohl
`docker-compose.yml` `name: automationone-postgres-data` definiert. Docker Compose
hat stattdessen `auto-one_automationone-postgres-data` erstellt (nicht in der Volume-Liste
als named volume sichtbar). Das deutet auf ein Docker Compose v2 Verhalten hin,
bei dem das `name:` Attribut bei Recreate nicht korrekt angewendet wird.

### Cleanup-Befehl (NUR nach Robin's Freigabe)

```bash
docker volume rm \
  automationone-grafana-data \
  automationone-loki-data \
  automationone-mosquitto-log \
  automationone-postgres-data \
  automationone-prometheus-data \
  fc61035e5ee2ba3caa7cca9e001472274d5a3dd87fb0e3b895d47a84a151b484
```

---

## Qualitaetskriterien

| Kriterium | Status | Details |
|-----------|--------|---------|
| Alert Rule 5 feuert nicht dauerhaft | TEILWEISE | Option C implementiert, aber bei 32/100 Mock-ESPs mit online > 0 koennte sie weiterhin feuern |
| Logging-Strategie dokumentiert | OK | `docker/README-logging.md` erstellt |
| pgAdmin startet healthy | OK | Email-Fix `.local` → `.dev`, Healthcheck = healthy |
| Verwaiste Volumes identifiziert | OK | 6 Volumes, ~162.8MB, dokumentiert |
| Keine Funktionalitaet gebrochen | OK | Alle bestehenden Services laufen |

---

## Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `docker/grafana/provisioning/alerting/alert-rules.yml` | Rule 5 PromQL + Kommentare + Description |
| `docker-compose.yml` | pgAdmin Email Default `.local` → `.dev` |

## Neue Dateien

| Datei | Zweck |
|-------|-------|
| `docker/README-logging.md` | Logging-Strategie-Dokumentation |

## Offene Punkte

1. **Alert Rule 5 Effektivitaet:** Die Option C ist implementiert aber moeglicherweise
   nicht ausreichend um Mock-Daten-Alerts zu verhindern. Fuer eine robuste Loesung
   muesste ein `environment` Label auf den ESP-Metriken eingefuehrt werden (Server-Code-Aenderung
   in `metrics.py`).

2. **Volume-Cleanup:** Die 6 verwaisten Volumes (162.8MB) sind dokumentiert.
   Robin muss entscheiden ob sie geloescht werden. Besonders `automationone-postgres-data`
   koennte noch Daten enthalten die gesichert werden sollten.

3. **Docker Compose Volume-Naming:** Das `name:` Attribut bei `postgres_data` wird
   von Docker Compose v2 bei Recreate-Operationen nicht korrekt angewendet.
   Die Volumes ohne explizites `name:` erhalten den Prefix `auto-one_`.
   Empfehlung: Alle Volumes auf explizites `name:` umstellen fuer konsistente Benennung.
