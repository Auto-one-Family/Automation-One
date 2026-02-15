# Auftrag 3: Promtail Positions-Datei persistieren

**Datum:** 2026-02-09
**Agent:** @system-control
**Priorität:** HOCH
**Geschätzter Aufwand:** 30-40 Minuten
**Typ:** Docker-Config-Änderung (docker-compose.yml + promtail-config.yml)

---

## WORUM GEHT ES

Promtail speichert die **Positions-Datei** (welche Log-Zeilen schon gelesen wurden) in `/tmp/positions.yaml` **INNERHALB des Containers**. Das Problem: `/tmp/` ist ephemeral (nicht persistent). Bei Container-Neustart:

1. Positions-Datei geht verloren
2. Promtail weiß nicht mehr wo es aufgehört hat
3. Promtail liest **ALLE Container-Logs erneut** von Anfang
4. Loki bekommt **Duplikate** aller Log-Einträge

**Warum ist das kritisch:**
- Nach jedem `docker compose restart promtail` → Tausende Duplikate
- Nach Server-Reboot → Komplette Log-History dupliziert
- Loki-Datenbank wächst unnötig
- Log-Queries zeigen falsche Counts
- Debugging erschwert (welche Logs sind real, welche Duplikate?)

**Aktuelles Log-Volumen:** ~46.000 Log-Zeilen/Stunde = ~1,1 Mio/Tag

**Bei Restart ohne Positions:** Alle historischen Logs werden erneut gesendet (je nach Retention potentiell Millionen Zeilen).

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (15 Min)

**1. Promtail-Config verstehen**

Datei: `docker/promtail/config.yml`

**Relevante Sektion:**
```yaml
positions:
  filename: /tmp/positions.yaml  # ← PROBLEM: /tmp/ ist ephemeral
```

**Was ist die Positions-Datei:**
```yaml
# Beispiel-Inhalt von positions.yaml
positions:
  /var/lib/docker/containers/<container-id>/<container-id>-json.log: "12345678"
  /var/lib/docker/containers/<another-id>/<another-id>-json.log: "98765432"
```

**Erklärung:**
- Jede Zeile = Position (Byte-Offset) im Container-Log-File
- Promtail liest nur ab dieser Position weiter
- Ohne Positions-Datei: Promtail startet bei Byte 0 (Anfang des Logs)

**Dokumentieren:**
- Aktueller Pfad: `/tmp/positions.yaml`
- Ist `/tmp/` persistent? **NEIN** (Container-interner /tmp)
- Wo sollte die Datei stattdessen liegen? (Options: Named Volume, Bind-Mount)

**2. Docker-Compose-Config prüfen**

Datei: `docker-compose.yml`

**Promtail-Service-Sektion:**
```yaml
# [Korrektur verify-plan] KRITISCH: profiles: ["monitoring"] fehlte im Snippet.
# Promtail ist NICHT im Default-Profil! Alle docker compose Befehle brauchen --profile monitoring
promtail:
  image: grafana/promtail:3.4
  container_name: automationone-promtail
  profiles: ["monitoring"]          # ← WICHTIG: Nicht im Default-Profil!
  volumes:
    - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    # ← Hier fehlt ein Volume für Positions
  ...
```

**Dokumentieren:**
- Sind Volumes gemountet? (Config + Docker-Socket: JA)
- Ist ein Positions-Volume vorhanden? **NEIN**
- Wo würde ein Named Volume definiert werden? (Im `volumes:` Top-Level-Block)

**3. Volume-Optionen evaluieren**

| Option | Beschreibung | Pro | Contra |
|--------|--------------|-----|--------|
| **A: Named Volume** | Docker-managed persistent Volume | Einfach, portabel, Docker managt Cleanup | Nicht direkt inspizierbar (in Docker-internem Pfad) |
| **B: Bind-Mount** | Host-Verzeichnis mounten | Direkt einsehbar auf Host, debuggable | Host-Pfad muss existieren, Permissions |
| **C: tmpfs** | RAM-basiertes temporäres Volume | Schnell | Nicht persistent (wie /tmp) → löst Problem nicht |

**TM-Empfehlung (aus Report):** **Option A (Named Volume)** – Standard-Lösung, einfach, wartbar.

**4. Promtail-Log-Verhalten prüfen (optional, wenn Stack läuft)**

```bash
# [Korrektur verify-plan] ALLE docker compose Befehle für Promtail brauchen --profile monitoring
# Container-Restart simulieren
docker compose --profile monitoring restart promtail

# Promtail-Log beobachten
docker logs automationone-promtail --tail 100

# Erwartetes Verhalten OHNE Positions:
# "added Docker target" für alle 8 Container
# Startet Log-Ingestion von Anfang an
```

**Dokumentieren:**
- Zeigt Log "positions file not found"?
- Wie viele Targets werden re-added? (Erwartet: 8)
- Sieht man in Loki Duplikate? (Test-Query nötig)

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Lösungsplan erstellen (10 Min)

**Lösung: Named Volume für Positions**

**Schritt 1: Named Volume definieren**

In `docker-compose.yml` **Top-Level `volumes:` Block** (ganz unten):

**VORHER:**
```yaml
# [Korrektur verify-plan] Volume-Keys und name:-Properties stimmen nicht mit dem Original überein.
# Tatsächlicher IST-Zustand aus docker-compose.yml:
volumes:
  postgres_data:
    name: automationone-postgres-data
  mosquitto_data:
    name: automationone-mosquitto-data
  automationone-loki-data:
  automationone-prometheus-data:
  automationone-grafana-data:
```

**NACHHER (ergänzen):**
```yaml
volumes:
  ...
  automationone-promtail-positions:  # ← NEU
    name: automationone-promtail-positions
```

**Erklärung:**
- Volume-Name: `automationone-promtail-positions` (konsistent mit anderen Volumes)
- Docker erstellt Volume beim ersten `docker compose up`
- Volume bleibt erhalten bei `down`, `restart`, `up -d`
- Volume wird erst gelöscht bei `docker compose down -v` (oder manuell)

**Schritt 2: Volume in Promtail-Service mounten**

In `docker-compose.yml` **Promtail Service-Sektion**:

**VORHER (IST-Zustand):**
```yaml
promtail:
  image: grafana/promtail:3.4
  container_name: automationone-promtail
  profiles: ["monitoring"]          # [Korrektur verify-plan] Profil muss erhalten bleiben
  volumes:
    - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
```

**NACHHER (ergänzen):**
```yaml
promtail:
  image: grafana/promtail:3.4
  container_name: automationone-promtail
  profiles: ["monitoring"]
  volumes:
    - ./docker/promtail/config.yml:/etc/promtail/config.yml:ro
    - /var/run/docker.sock:/var/run/docker.sock:ro
    - automationone-promtail-positions:/promtail-positions  # ← NEU
```

**Erklärung:**
- Named Volume wird nach `/promtail-positions` im Container gemountet
- Pfad ist frei wählbar (nicht `/tmp/` verwenden!)
- Sinnvolle Konvention: `/promtail-positions` oder `/positions`

**Schritt 3: Promtail-Config anpassen**

In `docker/promtail/config.yml`:

**VORHER:**
```yaml
positions:
  filename: /tmp/positions.yaml
```

**NACHHER:**
```yaml
positions:
  filename: /promtail-positions/positions.yaml
```

**KRITISCH:** Der Pfad muss mit dem Mount-Point in docker-compose.yml übereinstimmen!

**Zusammenhang:**
```yaml
# docker-compose.yml
volumes:
  - automationone-promtail-positions:/promtail-positions
    # ↑ Dieser Pfad im Container

# promtail/config.yml
positions:
  filename: /promtail-positions/positions.yaml
           # ↑ Datei innerhalb des gemounteten Volumes
```

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `docker-compose.yml` | Service-Definition | **ÄNDERN** (2 Stellen: Service + Volumes) |
| `docker/promtail/config.yml` | Promtail-Config | **ÄNDERN** (positions.filename) |

### Docker-Volume-Management

**Volume erstellen (automatisch beim up):**
```bash
# [Korrektur verify-plan] --profile monitoring erforderlich
docker compose --profile monitoring up -d promtail
# Docker erstellt automationone-promtail-positions Volume
```

**Volume inspizieren:**
```bash
# Liste aller Volumes
docker volume ls | grep promtail

# Details des Volumes
docker volume inspect automationone-promtail-positions

# Pfad auf Host (Linux)
# "Mountpoint": "/var/lib/docker/volumes/automationone-promtail-positions/_data"
```

**Positions-Datei einsehen (manuell):**
```bash
# Im Container
docker exec automationone-promtail cat /promtail-positions/positions.yaml

# Oder auf Host (nur Linux, Root-Rechte)
sudo cat /var/lib/docker/volumes/automationone-promtail-positions/_data/positions.yaml
```

**Volume löschen (wenn nötig):**
```bash
# Container stoppen (--profile monitoring!)
docker compose --profile monitoring stop promtail

# Volume entfernen
docker volume rm automationone-promtail-positions

# Container neu starten (erstellt Volume neu, leer)
docker compose --profile monitoring up -d promtail
```

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. YAML-Syntax**
```bash
# docker-compose.yml validieren (--profile monitoring für Promtail-Sektion)
docker compose --profile monitoring config > /dev/null
# Kein Output = valid

# promtail/config.yml validieren
docker compose --profile monitoring config | grep -A5 "promtail-positions"
# Volume sollte erscheinen
```

**2. Volume existiert**
```bash
# [Korrektur verify-plan] --profile monitoring erforderlich
docker compose --profile monitoring up -d promtail
docker volume ls | grep automationone-promtail-positions
# Output erwartet: automationone-promtail-positions
```

**3. Container startet**
```bash
# [Korrektur verify-plan] --profile monitoring erforderlich
docker compose --profile monitoring logs promtail --tail 50 | grep -i error
# Keine Errors über Positions-Datei
```

**4. Positions-Datei wird geschrieben**
```bash
# Warte 30s (Promtail schreibt Positions)
sleep 30

# Prüfe ob Datei existiert
docker exec automationone-promtail ls -la /promtail-positions/
# Erwartung: positions.yaml existiert

# Inhalt prüfen
docker exec automationone-promtail cat /promtail-positions/positions.yaml
# Erwartung: YAML mit Container-Log-Pfaden und Positions
```

**5. Restart-Test (KRITISCH)**

**Duplikate-Test:**

```bash
# 1. Loki-Query VOR Restart (Baseline)
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} [1h])' \
  | jq '.data.result[0].value[1]'
# Notiere Zahl (z.B. "43425")

# 2. Promtail restarten (--profile monitoring!)
docker compose --profile monitoring restart promtail

# 3. Warte 60s (Promtail re-ingest)
sleep 60

# 4. Loki-Query NACH Restart
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} [1h])' \
  | jq '.data.result[0].value[1]'
# Zahl sollte LEICHT höher sein (neue Logs in 60s)
# Zahl sollte NICHT doppelt so hoch sein (Duplikate)
```

**Interpretation:**
- Baseline: 43.425 Logs
- Nach Restart (60s später): ~43.500 Logs (+75 neue in 60s) → **OK**
- Nach Restart (60s später): ~86.850 Logs (2x Baseline) → **DUPLIKATE** (Positions nicht persistent)

---

## STRUKTUR & PATTERN

### Docker-Compose-Volume-Pattern

**AutomationOne-Konventionen:**

1. **Named Volumes** für Datenbanken, Monitoring-Daten, Positions
2. **Bind-Mounts** für Config-Dateien (read-only)
3. **Volume-Namen** folgen Pattern: `automationone-<service>-<zweck>`

**Beispiele:**
```yaml
automationone-postgres-data       # PostgreSQL-Datenbank
automationone-prometheus-data     # Prometheus TSDB
automationone-loki-data           # Loki Chunks + Rules
automationone-grafana-data        # Grafana Settings, Plugins
automationone-promtail-positions  # ← NEU (konsistent)
```

**Volume-Definition-Pattern:**
```yaml
volumes:
  automationone-<service>-<zweck>:
    name: automationone-<service>-<zweck>  # Expliziter Name (statt auto-generated)
```

**Begründung für expliziten Namen:**
- Bessere Identifizierung in `docker volume ls`
- Konsistenz über Environments
- Kein Prefix wie `auto-one_` (Compose-Projekt-Prefix)

### Promtail-Positions-Pattern

**Standard-Praxis:**
- Positions-Datei **muss persistent** sein
- Pfad im Container: Frei wählbar (oft `/positions/`, `/data/`, `/promtail-data/`)
- Dateiname: Konvention `positions.yaml` (nicht ändern, außer Multi-Instance-Setup)

**AutomationOne:**
- Mount-Point: `/promtail-positions/` (klar, beschreibend)
- Datei: `/promtail-positions/positions.yaml`
- Volume-Typ: Named Volume (managed by Docker)

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/system-control-promtail-positions-2026-02-09.md`

**Struktur:**

```markdown
# Promtail Positions-Datei Persistierung

## Analyse-Findings
- Aktueller Positions-Pfad: [/tmp/positions.yaml]
- Problem: [ephemeral, geht bei Restart verloren]
- Log-Volumen: [~46k Lines/h, 1.1M/Tag]
- Duplikate-Risiko: [bei Restart komplette History erneut]
- Ausgewählte Lösung: [Named Volume, Begründung]

## Lösungsplan
- Named Volume: [automationone-promtail-positions]
- Mount-Point: [/promtail-positions]
- Config-Änderung: [/tmp/positions.yaml → /promtail-positions/positions.yaml]

## Implementierung
- docker-compose.yml: [2 Änderungen: Service-Volume + Top-Level-Definition]
- promtail/config.yml: [1 Änderung: filename-Pfad]
- Diffs: [Zeilen-Nummern, Code]

## Verifikation
- YAML-Validierung: [docker compose config]
- Volume erstellt: [docker volume ls]
- Container startet: [Logs clean]
- Positions-Datei geschrieben: [cat im Container]
- Restart-Test: [Baseline, Nach-Restart, Duplikate? NEIN]

## Baseline-Metriken
- Loki Log-Count VOR Änderung: [Zahl]
- Log-Count nach Restart (mit Positions): [Zahl]
- Delta: [erwartet: ~Scrape-Interval × Log-Rate]
- Duplikate: [NEIN = Erfolg]
```

---

## KRITISCHE HINWEISE

### Positions-Datei-Lifecycle

**Wann wird Positions-Datei geschrieben:**
- Initial: Promtail erstellt leere Datei
- Fortlaufend: Nach jedem Batch (alle ~1-5s)
- Bei Shutdown: Final-Flush

**Wann Positions-Datei löschen:**
- Bei Migration (neue Loki-Instanz, alte Logs irrelevant)
- Bei Corruption (seltener Edge-Case)
- Bei Testing (gezielt Duplikate testen)

**NIEMALS löschen wenn:**
- Im laufenden Betrieb
- Ohne Backup (falls benötigt)

### Volume-Permissions

**Named Volumes:**
- Docker managed Permissions automatisch
- Promtail läuft typisch als `root` oder dedizierter User im Container
- Kein manuelles `chmod` nötig

**Falls Permissions-Fehler:**
```bash
# Im Container prüfen
docker exec automationone-promtail ls -la /promtail-positions/

# Owner sollte sein: Container-User (oft root oder promtail)
# Permissions: 644 oder 600 für positions.yaml
```

### Restart-Verhalten

**Mit persistierter Positions-Datei:**
```
1. Container startet
2. Promtail liest /promtail-positions/positions.yaml
3. Promtail kennt letzte Position jedes Containers
4. Promtail liest nur neue Logs (seit letztem Stop)
5. Keine Duplikate
```

**Ohne Positions-Datei (altes Verhalten):**
```
1. Container startet
2. Promtail findet keine positions.yaml
3. Promtail startet bei Byte 0 (Anfang) aller Container-Logs
4. Promtail sendet ALLE historischen Logs an Loki
5. Duplikate in Loki
```

### Multi-Container-Koordination

**Abhängigkeiten:**
- Promtail muss nach Loki starten (bereits via `depends_on` gelöst)
- Positions-Volume muss vor Promtail-Start existieren (Docker erstellt automatisch)

**Kein manueller Schritt nötig.**

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- Named Volume `automationone-promtail-positions` erstellen
- Volume in Promtail-Container nach `/promtail-positions` mounten
- Promtail-Config: Positions-Pfad von `/tmp/` nach `/promtail-positions/` ändern

**Warum:**
- `/tmp/` ist ephemeral → Positions gehen bei Restart verloren
- Ohne Positions → Promtail liest alle Logs erneut
- ~46k Lines/h × 24h × Retention = Millionen Duplikate möglich

**Wie:**
- docker-compose.yml: 2 Zeilen ändern (Service-Volume + Top-Level-Definition)
- promtail/config.yml: 1 Zeile ändern (filename-Pfad)
- Container restarten, Restart-Test durchführen

**Erwartung:**
- Nach Restart: Keine Log-Duplikate
- Positions-Datei persistent
- Loki-Datenbank sauber
