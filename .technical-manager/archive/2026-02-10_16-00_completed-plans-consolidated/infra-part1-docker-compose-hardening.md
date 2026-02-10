# Auftrag: Docker Compose Hardening
# ====================================
# Datum: 2026-02-09
# Auftraggeber: Technical Manager
# Ausführung: /do
# Referenz: .technical-manager/commands/pending/infrastructure-reference-architecture.md
#
# KONTEXT: Die Infrastructure Reference v3.1 (live-verifiziert) hat systematische
# Lücken in docker-compose.yml identifiziert. Dieser Auftrag schließt ALLE Lücken
# in EINEM konsistenten Durchgang. Keine halben Sachen.

---

## Ziel

docker-compose.yml auf industriellen Qualitätsstandard bringen. Jeder Service muss
ALLE Pflichtfelder haben. Keine Ausnahmen, keine "machen wir später"-Lücken.

## Referenz-Dokument

Lies zuerst diese Abschnitte in `.technical-manager/commands/pending/infrastructure-reference-architecture.md`:
- **A1** (Docker-Compose IST – 11 Services mit 🔴🟡🟢 Markierungen)
- **B1.1** (Pflichtfelder pro Service – SOLL-Standard 2025/2026)
- **B1.2** (Image-Versioning Regeln)
- **B1.3** (depends_on mit condition – PFLICHT)
- **C1** (Service-Vollständigkeitsmatrix – exakte Lücken pro Service)
- **C2** (mosquitto-exporter Healthcheck – empfohlener Fix)
- **C4** (Frontend depends_on – ohne condition)
- **C5** (mosquitto Image-Version – nur Major-Pin)
- **C6** (Port-Exposure Audit – 4 Ports unnötig extern)
- **E5–E9** (priorisierte Aktionspunkte)

## Datei

`docker-compose.yml` (Projekt-Root)

## Änderungen (8 Punkte)

### 1. Logging-Driver für postgres + mqtt-broker

Diese beiden Services haben KEINEN logging-driver. Docker-Default = unbegrenztes Log-Wachstum.

**Hinzufügen bei `postgres` und `mqtt-broker`:**
```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

Referenz: A1 Zeilen postgres + mqtt-broker, C1 Matrix "logging 🔴 FEHLT", B1.1 Pflichtfelder.

### 2. Healthcheck für mosquitto-exporter

Einziger Service OHNE Healthcheck. Port 9234 `/metrics` ist verfügbar.

**Hinzufügen bei `mosquitto-exporter`:**
```yaml
healthcheck:
  test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9234/metrics || exit 1"]
  interval: 15s
  timeout: 5s
  retries: 5
  start_period: 10s
```

Referenz: C2 (exakter Fix), A1 mosquitto-exporter "🟡 HC + start_period fehlt".

### 3. start_period für ALLE Services die es noch nicht haben

Nur el-servador (30s) und el-frontend (30s) haben start_period. 9 Services fehlen.

**Hinzufügen bei jedem Healthcheck der noch kein start_period hat:**

| Service | start_period | Begründung |
|---------|-------------|------------|
| postgres | 15s | Schneller Start, aber Init braucht Moment |
| mqtt-broker | 10s | Sehr schneller Start |
| loki | 20s | TSDB-Initialisierung |
| promtail | 10s | Leichtgewichtig |
| prometheus | 15s | TSDB-Initialisierung |
| grafana | 20s | Plugin-Loading, Provisioning |
| postgres-exporter | 10s | Leichtgewichtig, wartet auf postgres |
| mosquitto-exporter | 10s | Leichtgewichtig (wird in Punkt 2 gleich mit erstellt) |
| pgadmin | 20s | Python-App, braucht Anlaufzeit |

Referenz: C1 Matrix "start_period 🔴 FEHLT" bei 9/11, B1.1 "start_period: PFLICHT – JEDER Service".

### 4. el-frontend depends_on mit condition

IST: `depends_on: - el-servador` (ohne condition)
SOLL: Wie alle anderen depends_on im File.

**Ändern:**
```yaml
depends_on:
  el-servador:
    condition: service_healthy
```

Referenz: C4 (bestätigt, Zeile ~146), B1.3 "PFLICHT wenn Ziel Healthcheck hat".

### 5. mosquitto Image-Version pinnen

IST: `eclipse-mosquitto:2` (nur Major-Pin)
SOLL: Exakte Minor-Version für Reproduzierbarkeit.

**Ändern auf:** `eclipse-mosquitto:2.0.21` (oder aktuellste 2.0.x – Agent soll prüfen was die neueste stabile 2.0.x Version ist und diese verwenden)

Referenz: C5 "NUR MAJOR-PINNED", B1.2 Image-Versioning.

### 6. Port-Exposure bereinigen: Exporter-Ports auf expose

4 Ports sind extern exponiert obwohl sie nur Docker-intern gebraucht werden.
Prometheus scraped diese über das Docker-Netzwerk (DNS), NICHT über Host-Ports.

**Ändern für postgres-exporter und mosquitto-exporter:**
```yaml
# VORHER:
ports:
  - "9187:9187"  # bzw. "9234:9234"

# NACHHER:
expose:
  - "9187"       # bzw. "9234"
```

**Für loki und prometheus:** Ports beibehalten aber als Kommentar markieren:
```yaml
ports:
  - "3100:3100"   # Dev: Loki API direkt erreichbar (Prod: nur intern)
  - "9090:9090"   # Dev: Prometheus UI direkt erreichbar (Prod: nur intern)
```

Referenz: C6 Port-Exposure Audit, B2.3 Port-Exposure Goldene Regel.

### 7. Volume-Naming konsistent machen

IST: Mischung aus `postgres_data` / `mosquitto_data` und `automationone-loki-data` etc.
SOLL: Einheitliches Schema `automationone-{service}-data` für ALLE Volumes.

**Volumes-Sektion am Ende vereinheitlichen:**
```yaml
volumes:
  automationone-postgres-data:
  automationone-mosquitto-data:
  automationone-loki-data:
  automationone-prometheus-data:
  automationone-grafana-data:
  automationone-promtail-positions:
  automationone-pgadmin-data:
```

**ACHTUNG:** Beim Umbenennen der Volumes gehen bestehende Daten verloren wenn die
alten Volumes nicht migriert werden. Der Agent soll einen Kommentar im Compose-File
hinterlassen der erklärt wie man bei Bedarf die Daten migriert:
```yaml
# MIGRATION: Alte Volumes (postgres_data, mosquitto_data) werden durch
# automationone-postgres-data und automationone-mosquitto-data ersetzt.
# Vorhandene Daten mit: docker run --rm -v postgres_data:/from -v automationone-postgres-data:/to alpine cp -a /from/. /to/
```

Die Volume-Referenzen in den jeweiligen Service-Definitionen müssen natürlich auch
angepasst werden (z.B. postgres → `automationone-postgres-data:/var/lib/postgresql/data`).

Referenz: A0 🟡3 "Duplizierte Docker-Volumes".

### 8. `version:` Feld entfernen (falls vorhanden)

Seit Docker Compose v2 obsolet. Falls im File → entfernen.

Referenz: A1 Hinweis "version: Feld seit Docker Compose v2 obsolet".

## Qualitätskriterien

Nach allen Änderungen muss gelten:
- `docker compose config` ohne Fehler/Warnungen
- Jeder der 11 Services hat: container_name ✅, restart ✅, healthcheck (mit start_period) ✅, logging ✅, networks ✅
- Alle depends_on mit condition: service_healthy
- Alle Images mindestens Minor-gepinnt
- Keine unnötig extern exponierten Ports (Exporter nur expose)
- Einheitliche Volume-Namensgebung

## Verifikation

```bash
# Syntax-Check
docker compose config --quiet

# Service-Vollständigkeit (nach Start)
docker compose ps -a
# Erwartung: Alle 11 Services mit Status "healthy" (außer pgadmin wenn devtools-Profil nicht aktiv)

# Healthcheck-Prüfung
docker inspect --format='{{.State.Health.Status}}' $(docker compose ps -q)
```

## Report

Erstelle nach Abschluss einen Report mit:
- Jede Änderung dokumentiert (vorher/nachher)
- docker compose config Output (erfolgreich?)
- Offene Punkte falls etwas nicht umsetzbar war
- Report nach: `.technical-manager/inbox/agent-reports/infra-part1-compose-hardening.md`
