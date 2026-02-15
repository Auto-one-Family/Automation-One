# Auftrag: Cleanup & Hygiene
# ============================
# Datum: 2026-02-09
# Auftraggeber: Technical Manager
# Ausführung: /do
# Referenz: .technical-manager/commands/pending/infrastructure-reference-architecture.md
#
# KONTEXT: Nach den Infrastruktur-Hardening-Änderungen (Part 1-3) bleiben
# Altlasten die bereinigt werden müssen: verwaiste Volumes, Mock-Daten die
# Alerts dauerhaft feuern lassen, und die Log-Redundanz-Strategie muss
# dokumentiert und aufgeräumt werden.

---

## Ziel

System-Hygiene herstellen: Altlasten entfernen, Mock-Daten-Problem lösen,
Log-Strategie dokumentieren. Das System soll sauber und eindeutig sein –
kein Zustand bei dem man rätseln muss ob etwas gewollt oder vergessen ist.

## Referenz-Dokument

Lies zuerst diese Abschnitte in `.technical-manager/commands/pending/infrastructure-reference-architecture.md`:
- **A0 🟡3** (Duplizierte Docker-Volumes)
- **A0 🟡5** (100 Mock-ESPs, 32 offline – Alert False Positive)
- **A5** (ESP Offline Alert Problem)
- **C3** (Log-Redundanz ~240MB+)
- **C10** (ESP Offline Guard-Clause – False-Positive-Analyse)
- **E10** (Verwaiste Volumes)
- **E11** (Mock-ESP-Daten und Alert Rule 5)

---

## Teil A: Alert Rule 5 – ESP Offline Environment Guard

### Problem

Alert Rule 5 (`ao-esp-offline`) feuert DAUERHAFT weil:
- `god_kaiser_esp_total = 100` (Mock/Simulation-Daten)
- `god_kaiser_esp_offline = 32`
- Bedingung: `god_kaiser_esp_offline > 0 and god_kaiser_esp_total > 0` → immer true

### Datei

`docker/grafana/provisioning/alerting/alert-rules.yml`

### Änderung

Die PromQL-Expression von Rule 5 (uid: `ao-esp-offline`) muss um einen
Environment-Guard erweitert werden:

**Option A (empfohlen):** Nutze eine Server-Metrik die das Environment angibt.
Prüfe ob `god_kaiser_*` Metriken ein Label `environment` haben:
```bash
curl -s http://localhost:8000/api/v1/health/metrics | grep god_kaiser_esp
```

Wenn ein Environment-Label existiert:
```promql
god_kaiser_esp_offline{environment!="development"} > 0 and god_kaiser_esp_total{environment!="development"} > 0
```

**Option B (Fallback):** Wenn kein Environment-Label existiert, einen höheren
Threshold setzen der Mock-Noise ignoriert:
```promql
(god_kaiser_esp_offline / god_kaiser_esp_total) > 0.5 and god_kaiser_esp_total > 0
```
Das feuert nur wenn >50% offline sind – nicht bei 32/100 Mock-Daten.

**Option C (simpelster Fix):** Alert-Condition auf eine sinnvollere Schwelle setzen:
```promql
god_kaiser_esp_offline > 5 and god_kaiser_esp_total > 0 and god_kaiser_esp_online > 0
```
Feuert nur wenn ESPs offline sind UND mindestens einige online waren (also echte Geräte aktiv).
Der Guard `esp_online > 0` stellt sicher dass der Alert nur feuert wenn tatsächlich
Geräte connected sind/waren.

**DER AGENT MUSS:**
1. Prüfen welche Labels auf den `god_kaiser_esp_*` Metriken verfügbar sind
2. Prüfen ob ein Environment-Label oder ähnliches existiert
3. Die beste Option wählen und begründen
4. Die alert-rules.yml entsprechend anpassen
5. Den `description`-Annotation-Text aktualisieren damit er die neue Logik erklärt

### Bestehende Konfiguration beibehalten

- UID: `ao-esp-offline` (NICHT ändern)
- 3-Stage Pipeline A→B→C (Struktur beibehalten)
- for: 3m (beibehalten)
- severity: warning (beibehalten)
- noDataState: OK (beibehalten)

---

## Teil B: Log-Redundanz-Strategie dokumentieren

### Problem

Logs werden aktuell über DREI Wege gespeichert:
1. **Bind-Mounts** (`./logs/server/`, `./logs/mqtt/`, `./logs/postgres/`) → lokale Dateien
2. **Docker json-file Driver** → Docker-interne Logs (rotiert nach Part 1)
3. **Promtail → Loki** → querybare Log-Aggregation (7 Tage Retention)

Das ergibt ~240MB+ redundante Speicherung. Mit den Part 1+2 Fixes (Logging-Driver
überall, Mosquitto stdout-only) ist das teilweise adressiert, aber die Strategie
muss DOKUMENTIERT werden damit klar ist was gewollt ist.

### Datei

Erstelle: `docker/README-logging.md`

### Inhalt

Erstelle ein kurzes, klares Dokument das die Log-Strategie beschreibt:

```markdown
# AutomationOne – Logging-Strategie

## Primärer Log-Weg (für Queries und Monitoring)
stdout → Docker json-file → Promtail → Loki (7 Tage Retention)

## Bind-Mount Logs (für direktes Debugging)
| Pfad | Service | Zweck | Rotation |
|------|---------|-------|----------|
| logs/server/ | el-servador | JSON-Logs mit Request-IDs | RotatingFileHandler (10MB × 10) |
| logs/postgres/ | postgres | SQL-Logs mit Timestamps | PostgreSQL-intern (täglich) |
| logs/mqtt/ | mqtt-broker | Deaktiviert (stdout-only seit v3.1) | — |

## Wann welchen Weg nutzen?
- **Loki (Grafana Explore):** Standardweg für Log-Suche, Level-Filter, Service-übergreifend
- **Bind-Mount Server-Logs:** Wenn JSON-Felder gebraucht werden die Promtail nicht extrahiert
- **Bind-Mount Postgres-Logs:** Für SQL-Debugging, Slow-Query-Analyse
- **docker logs <container>:** Schnelle Prüfung, letzte N Zeilen

## Cleanup
Bind-Mount-Logs in ./logs/ werden NICHT automatisch gelöscht.
Bei Platzbedarf: `rm -rf logs/server/*.log logs/postgres/*.log logs/mqtt/*.log`
```

Passe den Inhalt an den tatsächlichen Zustand an den du nach Part 1+2 vorfindest.

---

## Teil C: pgAdmin servers.json Mount-Fix

### Problem

pgAdmin crashed mit ExitCode 127 weil der Bind-Mount von `servers.json`
unter WSL2/Docker Desktop als Directory statt als File interpretiert wird.

### Datei

`docker/pgadmin/servers.json` (prüfen ob die Datei existiert und valides JSON enthält)

### Prüfung und Fix

1. Prüfe ob `docker/pgadmin/servers.json` existiert und valides JSON ist
2. Wenn die Datei existiert: Prüfe ob sie korrekt formatiert ist
3. Der Bind-Mount im docker-compose.yml ist: `./docker/pgadmin/servers.json:/pgadmin4/servers.json:ro`
4. **WSL2-Fix:** Unter WSL2/Docker Desktop kann es helfen, den Mount-Pfad als
   `/pgadmin4/servers.json` zu prüfen. Alternativ: den Mount über ein Volume statt
   Bind-Mount lösen, oder die Datei in einen Ordner legen und als Directory mounten:
   ```yaml
   # Alternative: Ordner-Mount statt File-Mount
   - ./docker/pgadmin:/pgadmin4/config:ro
   ```
   Und in pgAdmin via Environment-Variable auf den Config-Pfad zeigen.

5. **PRÜFE:** Was pgAdmin 9.12 tatsächlich als Mount-Target erwartet.
   Die pgAdmin-Dokumentation sagt `/pgadmin4/servers.json` für Auto-Discovery.

**DER AGENT MUSS:**
- Verifizieren ob die Datei existiert und valides JSON ist
- Testen ob der Mount nach einem `docker compose up pgadmin` funktioniert
- Falls nicht: den WSL2-kompatiblen Workaround implementieren
- Falls pgAdmin danach startet: Healthcheck prüfen

---

## Teil D: Verwaiste Volumes identifizieren

### Problem

Es existieren parallel:
- `auto-one_automationone-*` (alte Namensgebung)
- `automationone-*` (aktuelle Namensgebung)

Durch Part 1 (Volume-Naming-Vereinheitlichung) werden möglicherweise weitere
alte Volumes verwaist (z.B. `postgres_data` → `automationone-postgres-data`).

### Aktion

**NUR DOKUMENTIEREN, NICHT LÖSCHEN.**

```bash
# Alle Volumes auflisten
docker volume ls | grep -E "auto-one|automationone"

# Verwaiste Volumes identifizieren (nicht von laufenden Containern genutzt)
docker volume ls -f dangling=true
```

Erstelle eine Liste der verwaisten Volumes im Report. Robin entscheidet ob und
welche gelöscht werden.

---

## Qualitätskriterien

1. Alert Rule 5 feuert NICHT mehr dauerhaft bei Mock-Daten
2. Logging-Strategie ist in `docker/README-logging.md` dokumentiert
3. pgAdmin startet und zeigt Status "healthy"
4. Verwaiste Volumes sind identifiziert und dokumentiert
5. Keine bestehende Funktionalität ist gebrochen

## Verifikation

```bash
# Alert Rule 5 – in Grafana prüfen
# http://localhost:3000 → Alerting → ao-esp-offline
# Status sollte NICHT "Firing" sein (bei Mock-Daten)

# pgAdmin
docker compose --profile devtools up -d pgadmin
docker inspect --format='{{.State.Health.Status}}' automationone-pgadmin
# Erwartung: "healthy"

# Logging-Doku
cat docker/README-logging.md
# Erwartung: Lesbar, korrekt, vollständig

# Verwaiste Volumes
docker volume ls -f dangling=true
# Erwartung: Liste dokumentiert
```

## Report

Erstelle nach Abschluss einen Report mit:
- Alert Rule 5: Welche Option gewählt, warum, neue PromQL-Expression
- Alert Rule 5: Welche Metriken-Labels verfügbar waren
- pgAdmin: Status nach Fix (läuft/crashed), Healthcheck
- Logging-Strategie: Vollständiges README-logging.md
- Verwaiste Volumes: Liste mit Größen und Empfehlung
- Report nach: `.technical-manager/inbox/agent-reports/infra-part4-cleanup-hygiene.md`
