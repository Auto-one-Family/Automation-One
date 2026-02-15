# Auftrag: Post-Hardening Fixes – 4 Korrekturen
# =================================================
# Datum: 2026-02-10
# Auftraggeber: Technical Manager
# Ausführung: /do
# Kontext: Part 1–4 Infrastructure Hardening ist abgeschlossen.
# TM-Review hat 4 Stellen identifiziert die nicht dem Qualitätsstandard entsprechen.
# Dieser Auftrag korrigiert sie. Keine Workarounds – jeder Fix muss systemkonform sein.

---

## PFLICHT: Analyse-Phase ZUERST

Bevor du IRGENDETWAS änderst, analysiere den IST-Zustand:

```bash
# 1. Volume-Naming: Wie heißen die Volumes wirklich?
docker volume ls | grep -E "auto-one|automationone"

# 2. Alert Rule 5: Feuert sie gerade?
curl -s -u admin:admin http://localhost:3000/api/v1/provisioning/alert-rules | python3 -c "
import json,sys
rules = json.load(sys.stdin)
for r in rules:
    print(f\"{r.get('uid','?'):25s} {r.get('title','?')}\")
"

# 3. ESP-Metriken: Aktuelle Werte
curl -s http://localhost:8000/api/v1/health/metrics | grep god_kaiser_esp

# 4. Promtail Health-Log-Noise: Wie viele Health-Logs kommen durch?
# In Loki (oder via API):
curl -s -G 'http://localhost:3100/loki/api/v1/query_range' \
  --data-urlencode 'query=count_over_time({compose_service="el-servador"} |= "Request completed: GET /api/v1/health/" [1h])' \
  --data-urlencode 'limit=1'
```

Dokumentiere die Ergebnisse im Report. Dann fix:

---

## Fix 1: Volume-Naming mit explizitem `name:` Attribut

### Problem

Docker Compose v2 hängt den Projekt-Prefix (`auto-one_`) an Volume-Keys.
Ohne explizites `name:` Attribut heißen die Volumes `auto-one_automationone-postgres-data`
statt `automationone-postgres-data`. Das ist doppelt-gemoppelt, und die
Migrations-Anleitung im Kommentar referenziert Namen die nicht existieren.

### Datei

`docker-compose.yml` → `volumes:` Sektion am Ende

### Erwarteter IST-Zustand

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

### SOLL-Zustand

```yaml
volumes:
  automationone-postgres-data:
    name: automationone-postgres-data
  automationone-mosquitto-data:
    name: automationone-mosquitto-data
  automationone-loki-data:
    name: automationone-loki-data
  automationone-prometheus-data:
    name: automationone-prometheus-data
  automationone-grafana-data:
    name: automationone-grafana-data
  automationone-promtail-positions:
    name: automationone-promtail-positions
  automationone-pgadmin-data:
    name: automationone-pgadmin-data
```

### Migrations-Kommentar aktualisieren

Prüfe nach deiner Analyse (Schritt 1) welche Volume-Namen TATSÄCHLICH existieren.
Passe den Migrations-Kommentar über der volumes-Sektion an die REALEN alten Namen an.

Beispiel – wenn die aktiven Volumes `auto-one_automationone-postgres-data` heißen:
```yaml
# MIGRATION: Nach Volume-Naming-Fix werden neue Volumes mit korrekten Namen erstellt.
# Alte Daten migrieren (alte Namen prüfen mit: docker volume ls | grep auto-one):
#   docker run --rm -v auto-one_automationone-postgres-data:/from -v automationone-postgres-data:/to alpine cp -a /from/. /to/
#   docker run --rm -v auto-one_automationone-mosquitto-data:/from -v automationone-mosquitto-data:/to alpine cp -a /from/. /to/
```

### Verifikation

```bash
# Nach docker compose down && docker compose up -d:
docker volume ls | grep automationone
# Erwartung: Volumes heißen exakt automationone-postgres-data (OHNE auto-one_ Prefix)
```

---

## Fix 2: Alert Rule 5 – Prozentualer Threshold

### Problem

Die aktuelle Expression `god_kaiser_esp_offline > 5 and god_kaiser_esp_total > 0 and god_kaiser_esp_online > 0`
feuert bei Mock-Daten (100 total, 32 offline, 68 online) weil ALLE drei Bedingungen erfüllt sind.
Das ist kein Edge-Case sondern der Normalzustand in Development.

### Design-Anforderung

Die Alert Rule muss:
1. Bei echtem ESP-Ausfall feuern (z.B. 3 von 5 Geräten offline = 60%)
2. Bei Mock-Daten NICHT feuern (32 von 100 = 32%)
3. Bei leerem System (0 ESPs) NICHT feuern
4. Division-by-Zero sicher sein

### Datei

`docker/grafana/provisioning/alerting/alert-rules.yml` → Rule 5 (uid: `ao-esp-offline`)

### Neue PromQL-Expression

```promql
(god_kaiser_esp_offline / clamp_min(god_kaiser_esp_total, 1)) > 0.5 and god_kaiser_esp_online > 0
```

**Logik:**
- `clamp_min(god_kaiser_esp_total, 1)` → Division-by-Zero-Schutz (Minimum Divisor = 1)
- `> 0.5` → feuert nur wenn >50% der registrierten Geräte offline sind
- `god_kaiser_esp_online > 0` → Guard: mindestens ein echtes Gerät war aktiv
- Bei 32/100 Mock-Daten: 0.32 > 0.5 = false → KEIN Alert ✅
- Bei 3/5 echten Geräten: 0.6 > 0.5 = true → Alert ✅
- Bei 0 total: clamp_min → 0/1 = 0 > 0.5 = false → KEIN Alert ✅

### Pipeline-Anpassung

Die 3-Stage Pipeline A→B→C bleibt. NUR die Expression in Stage A ändert sich.
Stage B (Reduce: last) und Stage C (Threshold: > 0) bleiben identisch –
weil die PromQL-Expression selbst ein Boolean liefert (0 oder 1 via den `> 0.5` Vergleich),
das durch Reduce(last) auf 0 oder 1 reduziert wird, und dann durch Threshold(> 0) geprüft wird.

**PRÜFE:** Ob Grafana die Expression korrekt evaluiert. Eine PromQL mit `and` liefert
den Wert der LINKEN Seite wenn beide Seiten true sind – das wäre dann der Prozentwert,
nicht 0/1. In dem Fall muss der Threshold in Stage C angepasst werden:

- Wenn Expression Boolean (0/1) liefert → Stage C Threshold bleibt `> 0`
- Wenn Expression den Prozentwert liefert → Stage C Threshold wird `> 0.5`

Teste die Expression in Grafana Explore (Prometheus) und dokumentiere was sie liefert.

### Annotations aktualisieren

```yaml
annotations:
  summary: "ESP32-Geraete offline"
  description: "Mehr als 50% der registrierten ESP32-Geraete sind seit >3m offline. Guard: Mindestens ein Geraet muss online sein (verhindert False-Positives bei reinen Mock-Daten). Pruefen: Netzwerk, MQTT-Broker, ESP-Firmware."
```

### Kommentar aktualisieren

```yaml
# Rule 5: ESP Devices Offline
# Fires when >50% of registered ESP devices are offline for >3m
# Guards: clamp_min prevents division-by-zero, esp_online > 0 ensures real devices exist
# Development note: 100 mock ESPs with ~32% offline will NOT trigger this rule
```

### Beibehalten (NICHT ändern)

- UID: `ao-esp-offline`
- Stage-Struktur: A→B→C
- for: 3m
- severity: warning
- noDataState: OK
- execErrState: Alerting
- relativeTimeRange: from 180 to 0

---

## Fix 3: Promtail – Zweite Health-Log-Drop-Regex

### Problem

Die Drop-Stage fängt nur Uvicorn-Access-Logs ab:
```
INFO:     172.18.0.3:59152 - "GET /api/v1/health/metrics HTTP/1.1" 200 OK
```

Aber der Server loggt Health-Requests AUCH im strukturierten Format:
```
2026-02-09 23:10:47 - src.middleware.request_id - INFO - [-] - Request completed: GET /api/v1/health/metrics status=200
```

Diese Zeilen landen in Loki. Bei 15s Prometheus-Scrape-Interval = ~240 unnötige Einträge/Stunde.

### Datei

`docker/promtail/config.yml` → Pipeline Stage 2a (el-servador drop)

### Erwarteter IST-Zustand

```yaml
- drop:
    source: ""
    expression: ".*GET /api/v1/health/.* HTTP/.*"
```

### SOLL-Zustand

Prüfe zuerst das EXAKTE Format der strukturierten Health-Logs:
```bash
docker logs automationone-server 2>&1 | grep "Request completed.*health" | tail -5
```

Dann ergänze eine ZWEITE Drop-Stage die dieses Format matcht.
Die Drop-Stages müssen VOR der Multiline-Stage stehen (erst Noise raus, dann aggregieren).

**Wahrscheinlich:**
```yaml
# 2a: Drop health-check and metrics endpoint access logs (high frequency noise)
# Two patterns: Uvicorn access format + structured middleware format
- drop:
    source: ""
    expression: ".*GET /api/v1/health/.* HTTP/.*"
- drop:
    source: ""
    expression: ".*Request completed: GET /api/v1/health/.*"
```

**ABER:** Verifiziere das Pattern gegen echte Logs. Wenn das Format anders ist,
passe die Regex an. Dokumentiere das exakte Format im Report.

### Pipeline-Kommentar aktualisieren

```yaml
# 2a: Drop health-check and metrics endpoint access logs (high frequency noise)
# Prometheus scrapes /health/metrics every 15s, Docker healthcheck hits /health/live every 30s
# Two drop patterns needed because server logs requests in two formats:
#   1. Uvicorn access: 'INFO:     ... "GET /api/v1/health/metrics HTTP/1.1" 200'
#   2. Structured middleware: '... - Request completed: GET /api/v1/health/metrics status=200'
```

### Verifikation

```bash
# Nach Promtail-Restart:
# Loki-Query für Health-Logs (sollte LEER sein):
# {compose_service="el-servador"} |= "/api/v1/health/"
# Erwartung: Keine Ergebnisse (beide Formate gedroppt)
```

---

## Fix 4: mqtt-broker Log-Bind-Mount auskommentieren

### Problem

Mosquitto ist seit Part 2 stdout-only. Der Bind-Mount `./logs/mqtt:/mosquitto/log`
existiert noch im Compose-File, erzeugt aber nur einen leeren Ordner im Container.
Das ist kein aktives Problem, aber ein toter Mount in einer Datei die sonst
durchgehend aufgeräumt ist, ist inkonsistent.

### Datei

`docker-compose.yml` → Service `mqtt-broker` → `volumes:`

### Erwarteter IST-Zustand

```yaml
volumes:
  - ./docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
  - automationone-mosquitto-data:/mosquitto/data
  - ./logs/mqtt:/mosquitto/log
```

### SOLL-Zustand

```yaml
volumes:
  - ./docker/mosquitto/mosquitto.conf:/mosquitto/config/mosquitto.conf:ro
  - automationone-mosquitto-data:/mosquitto/data
  # Log-Mount deaktiviert: Mosquitto nutzt stdout-only seit v3.1
  # Reaktivieren zusammen mit log_dest file in mosquitto.conf falls File-Logging benötigt wird
  # - ./logs/mqtt:/mosquitto/log
```

---

## Reihenfolge

1. **Analyse-Phase** (alle 4 IST-Zustände dokumentieren)
2. **Fix 1** (Volumes) → `docker compose config --quiet` zur Kontrolle
3. **Fix 2** (Alert Rule 5) → Expression in Grafana Explore testen
4. **Fix 3** (Promtail) → Health-Log-Format verifizieren, Drop ergänzen
5. **Fix 4** (Bind-Mount) → Auskommentieren

## Qualitätskriterien

| Fix | Kriterium | Verifikation |
|-----|-----------|-------------|
| 1 | Volumes heißen `automationone-*` OHNE Prefix | `docker volume ls` nach Recreate |
| 2 | Alert Rule 5 feuert NICHT bei 32/100 Mock-Daten | Grafana Alerting → ao-esp-offline Status |
| 3 | Keine Health-Logs in Loki | `{compose_service="el-servador"} \|= "/api/v1/health/"` = leer |
| 4 | `docker compose config` ohne Fehler | Syntax-Check |

## Report

Erstelle nach Abschluss einen Report mit:
- IST-Analyse Ergebnisse (alle 4 Befunde mit echten Daten)
- Jeder Fix: vorher/nachher mit echten Werten
- Alert Rule 5: Was die PromQL-Expression in Grafana Explore tatsächlich liefert
- Promtail: Exaktes Health-Log-Format das du gefunden hast
- Verifikation: Alle 4 Kriterien geprüft
- Report nach: `.technical-manager/inbox/agent-reports/infra-postfix-review.md`
