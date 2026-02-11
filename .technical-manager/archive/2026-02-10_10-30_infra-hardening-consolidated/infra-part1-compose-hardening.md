# Infrastructure Part 1: Docker Compose Hardening - Report
# ========================================================
# Datum: 2026-02-10
# Agent: /do (Precision Execution)
# Auftraggeber: Technical Manager
# Referenz: infra-part1-docker-compose-hardening.md
# Basis: infrastructure-reference-architecture.md v3.1

---

## Zusammenfassung

Alle 8 Punkte aus dem TM-Auftrag wurden erfolgreich umgesetzt. `docker compose config --quiet`
validiert ohne Fehler/Warnungen.

---

## Änderungen (8/8 umgesetzt)

### 1. Logging-Driver für postgres + mqtt-broker

| Service | Vorher | Nachher |
|---------|--------|---------|
| postgres | Kein logging-driver (Docker-Default = unbegrenzt) | `json-file`, max-size: 10m, max-file: 3 |
| mqtt-broker | Kein logging-driver (Docker-Default = unbegrenzt) | `json-file`, max-size: 10m, max-file: 3 |

### 2. Healthcheck für mosquitto-exporter

| Feld | Wert |
|------|------|
| test | `wget --no-verbose --tries=1 --spider http://localhost:9234/metrics || exit 1` |
| interval | 15s |
| timeout | 5s |
| retries | 5 |
| start_period | 10s |

**Vorher:** Einziger Service ohne Healthcheck. **Nachher:** 11/11 Services mit Healthcheck.

### 3. start_period für 9 Services

| Service | start_period | Begründung |
|---------|-------------|------------|
| postgres | 15s | DB-Initialisierung |
| mqtt-broker | 10s | Schneller Start |
| loki | 20s | TSDB-Initialisierung |
| promtail | 10s | Leichtgewichtig |
| prometheus | 15s | TSDB-Initialisierung |
| grafana | 20s | Plugin-Loading, Provisioning |
| postgres-exporter | 10s | Leichtgewichtig |
| mosquitto-exporter | 10s | Leichtgewichtig (mit neuem HC) |
| pgadmin | 20s | Python-App, braucht Anlaufzeit |

**Vorher:** 2/11 (el-servador 30s, el-frontend 30s). **Nachher:** 11/11 mit start_period.

### 4. el-frontend depends_on mit condition

```yaml
# VORHER:
depends_on:
  - el-servador

# NACHHER:
depends_on:
  el-servador:
    condition: service_healthy
```

**Alle depends_on jetzt konsistent mit `condition: service_healthy`.**

### 5. mosquitto Image-Version gepinnt

| Vorher | Nachher |
|--------|---------|
| `eclipse-mosquitto:2` (nur Major-Pin) | `eclipse-mosquitto:2.0.23` (neueste stabile 2.0.x, Jan 2026) |

### 6. Port-Exposure bereinigt

| Service | Vorher | Nachher |
|---------|--------|---------|
| postgres-exporter | `ports: "9187:9187"` | `expose: "9187"` |
| mosquitto-exporter | `ports: "9234:9234"` | `expose: "9234"` |
| loki | `ports: "3100:3100"` | `ports: "3100:3100"` + Dev-Kommentar |
| prometheus | `ports: "9090:9090"` | `ports: "9090:9090"` + Dev-Kommentar |

**Exporter-Ports nicht mehr extern exponiert.** Prometheus scrapet über Docker-DNS (automationone-net).
Loki/Prometheus behalten externe Ports für Dev-Debugging mit Kommentar.

### 7. Volume-Naming vereinheitlicht

| Vorher (Volume-Key) | Nachher (Volume-Key) |
|---------------------|---------------------|
| `postgres_data:` + `name: automationone-postgres-data` | `automationone-postgres-data:` |
| `mosquitto_data:` + `name: automationone-mosquitto-data` | `automationone-mosquitto-data:` |
| `automationone-loki-data:` | `automationone-loki-data:` (unverändert) |
| `automationone-prometheus-data:` | `automationone-prometheus-data:` (unverändert) |
| `automationone-grafana-data:` | `automationone-grafana-data:` (unverändert) |
| `automationone-promtail-positions:` | `automationone-promtail-positions:` (unverändert) |
| `automationone-pgadmin-data:` | `automationone-pgadmin-data:` (unverändert) |

**Service-Referenzen aktualisiert:** postgres und mqtt-broker Volumes zeigen auf neue Keys.
**Migrations-Kommentar hinzugefügt** mit `docker run --rm -v` Befehlen für Datenmigration.

**ACHTUNG:** Beim nächsten `docker compose up -d` werden NEUE leere Volumes erstellt.
Bestehende Daten in `postgres_data` und `mosquitto_data` müssen manuell migriert werden
(siehe Migrations-Kommentar in docker-compose.yml).

### 8. version: Feld

Nicht vorhanden (war bereits korrekt). Keine Änderung nötig.

---

## Verifikation

```
$ docker compose config --quiet
(keine Ausgabe = Erfolg, keine Fehler/Warnungen)
```

## Service-Vollständigkeitsmatrix (NACHHER)

| Service | container_name | restart | HC test | HC start_period | logging | networks | depends_on |
|---------|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| postgres | ✅ | ✅ | ✅ | ✅ 15s | ✅ 10m/3 | ✅ | — |
| mqtt-broker | ✅ | ✅ | ✅ | ✅ 10s | ✅ 10m/3 | ✅ | — |
| el-servador | ✅ | ✅ | ✅ | ✅ 30s | ✅ 10m/3 | ✅ | ✅ condition |
| el-frontend | ✅ | ✅ | ✅ | ✅ 30s | ✅ 5m/3 | ✅ | ✅ condition |
| loki | ✅ | ✅ | ✅ | ✅ 20s | ✅ 5m/3 | ✅ | — |
| promtail | ✅ | ✅ | ✅ | ✅ 10s | ✅ 5m/3 | ✅ | ✅ condition |
| prometheus | ✅ | ✅ | ✅ | ✅ 15s | ✅ 5m/3 | ✅ | ✅ condition |
| grafana | ✅ | ✅ | ✅ | ✅ 20s | ✅ 5m/3 | ✅ | ✅ condition |
| postgres-exporter | ✅ | ✅ | ✅ | ✅ 10s | ✅ 5m/3 | ✅ | ✅ condition |
| mosquitto-exporter | ✅ | ✅ | ✅ | ✅ 10s | ✅ 5m/3 | ✅ | ✅ condition |
| pgadmin | ✅ | ✅ | ✅ | ✅ 20s | ✅ 5m/3 | ✅ | ✅ condition |

**Ergebnis: 11/11 Services vollständig konfiguriert.**

## Qualitätskriterien-Check

- [x] `docker compose config` ohne Fehler/Warnungen
- [x] Jeder Service hat: container_name, restart, healthcheck (mit start_period), logging, networks
- [x] Alle depends_on mit `condition: service_healthy`
- [x] Alle Images mindestens Minor-gepinnt
- [x] Exporter-Ports nur `expose` (nicht extern)
- [x] Einheitliche Volume-Namensgebung `automationone-*`

## Offene Punkte

1. **Volume-Datenmigration:** Beim nächsten Stack-Start werden neue leere Volumes erstellt.
   User muss alte Daten manuell migrieren oder `docker compose down -v` für Clean-Start.
2. **Port 1883 Binding-Problem (E1):** Nicht Teil dieses Auftrags. Bleibt offen.
3. **pgAdmin Crash (E2):** Nicht Teil dieses Auftrags. Bleibt offen.
4. **PostgreSQL Log-Rotation (E3):** Nicht Teil dieses Auftrags. Betrifft postgresql.conf.
5. **Stack-Neustart nötig:** Änderungen werden erst nach `docker compose down && docker compose up -d` wirksam.

## Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `docker-compose.yml` | 8 Hardening-Punkte (logging, HC, start_period, depends_on, image, ports, volumes) |

## Nicht geänderte Dateien

Keine weiteren Dateien betroffen. Alle Änderungen beschränken sich auf `docker-compose.yml`.
