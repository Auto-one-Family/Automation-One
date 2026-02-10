# Auftrag: Promtail Pipeline – Industrielles Log-Processing
# ==========================================================
# Datum: 2026-02-09
# Auftraggeber: Technical Manager
# Ausführung: /do
# Referenz: .technical-manager/commands/pending/infrastructure-reference-architecture.md
#
# KONTEXT: Promtail ist der zentrale Log-Shipper. Aktuell werden Server-Logs nicht
# strukturiert geparst – alle Felder (level, logger, request_id) gehen verloren.
# Python Tracebacks werden in Einzelzeilen zerhackt. Für KI-gestütztes Debugging
# müssen Logs in Loki STRUKTURIERT und VOLLSTÄNDIG querybar sein.

---

## Ziel

Promtail-Pipeline so erweitern, dass:
1. ALLE Services ihre Logs strukturiert in Loki abliefern
2. Log-Level als Loki-Label für JEDEN Service verfügbar ist
3. Python-Tracebacks als zusammenhängende Einträge erscheinen
4. KI-Agents über Loki-Queries gezielt nach Fehlern, Levels, Modulen und Request-IDs suchen können
5. Die Pipeline konsistent, wartbar und dokumentiert ist

## Referenz-Dokument

Lies zuerst diese Abschnitte in `.technical-manager/commands/pending/infrastructure-reference-architecture.md`:
- **A5** (Monitoring Stack IST – Promtail-Details)
- **B5.3** (Promtail SOLL-Referenz – was fehlt)
- **C3** (Log-Redundanz – Promtail liest Docker-Logs, NICHT Bind-Mounts)
- **C8** (Server Log-Format – Dual-Format: JSON File + Text Console)
- **E4** (Promtail JSON-Parser – priorisiert)

## Datei

`docker/promtail/config.yml`

## Wichtiger Kontext: Was Promtail tatsächlich empfängt

Promtail liest via Docker Service Discovery die **Docker stdout/stderr Logs** (json-file Driver).
Es liest NICHT die Bind-Mount-Dateien in `./logs/`.

**Der Server (el-servador) hat Dual-Format-Logging:**
- **Console-Handler (stdout → Docker → Promtail):** Text-Format, z.B. `2026-02-09 12:00:00 [INFO] module.function: message`
- **File-Handler (Bind-Mount):** JSON-Format mit Feldern: timestamp, level, logger, message, module, function, line, request_id

Promtail bekommt also das **Text-Format** vom Server. Das bedeutet:
- Ein JSON-Parser allein reicht NICHT (Docker-Logs sind Text, nicht JSON)
- Es braucht einen **regex-Parser** der das Text-Format des Servers in Labels zerlegt
- ODER: Der Server muss umkonfiguriert werden auf JSON-stdout (besser, aber separater Auftrag)

**WICHTIG:** Bevor du die Pipeline baust, PRÜFE das tatsächliche Format:
```bash
docker logs --tail 5 automationone-server
```
Wenn der Output JSON ist → json-Stage verwenden.
Wenn der Output Text ist → regex-Stage mit passendem Pattern.
Dokumentiere in deinem Report welches Format du vorgefunden hast.

**Das Frontend (el-frontend) hat bereits einen JSON-Parser** → funktioniert, Labels `level` und `component` werden extrahiert.

## Änderungen

### 1. Server-Log-Parser hinzufügen

Füge eine neue `match`-Stage für el-servador hinzu, NACH dem bestehenden Health-Drop.

**Wenn Text-Format (wahrscheinlich):**
```yaml
- match:
    selector: '{compose_service="el-servador"}'
    stages:
      # Erst: Regex-Parser für Server Text-Logs
      # Format: "2026-02-09 12:00:00 [INFO] module.function: message"
      # ACHTUNG: Das exakte Format muss gegen echte Logs verifiziert werden!
      - regex:
          expression: '^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\s\[(?P<level>\w+)\]\s(?P<logger>[^:]+):\s(?P<message>.*)'
      - labels:
          level:
          logger:
```

**Wenn JSON-Format:**
```yaml
- match:
    selector: '{compose_service="el-servador"}'
    stages:
      - json:
          expressions:
            level: level
            logger: logger
            module: module
            function: function
            request_id: request_id
      - labels:
          level:
          logger:
          module:
      # request_id als structured metadata, nicht als Label (hohe Kardinalität)
      - structured_metadata:
          request_id:
```

**DER AGENT MUSS das tatsächliche Log-Format verifizieren und den passenden Parser wählen.**
Nicht blind eines der Templates einsetzen.

### 2. Python-Traceback Multiline-Stage

Python Tracebacks beginnen mit `Traceback (most recent call last):` und erstrecken sich
über viele Zeilen. Ohne Multiline werden sie in Loki als separate Einträge gespeichert
und sind nicht zusammenhängend querybar.

**Hinzufügen für el-servador (VOR dem Parser, NACH dem Health-Drop):**
```yaml
- match:
    selector: '{compose_service="el-servador"}'
    stages:
      - multiline:
          firstline: '^\d{4}-\d{2}-\d{2}'
          max_wait_time: 3s
          max_lines: 50
```

Die `firstline` Regex definiert: "Eine neue Log-Zeile beginnt mit einem Datum."
Alles was NICHT mit einem Datum beginnt (wie Traceback-Zeilen) wird an die
vorherige Zeile angehängt.

**WICHTIG:** Die multiline-Stage muss VOR allen Parser-Stages stehen, weil sie
zuerst die Zeilen zusammenfassen muss bevor der Parser drüberläuft.

### 3. Pipeline-Reihenfolge (gesamt)

Die Reihenfolge der Pipeline-Stages ist KRITISCH. Hier die vollständige Reihenfolge:

```yaml
pipeline_stages:
  # 1. Docker-Format parsen (existiert bereits)
  - docker: {}

  # 2. Server: Health-Checks droppen (existiert bereits)
  - match:
      selector: '{compose_service="el-servador"}'
      stages:
        - drop:
            source: ""
            expression: ".*GET /api/v1/health/.* HTTP/.*"

  # 3. Server: Multiline für Tracebacks (NEU)
  - match:
      selector: '{compose_service="el-servador"}'
      stages:
        - multiline:
            firstline: '^\d{4}-\d{2}-\d{2}'
            max_wait_time: 3s
            max_lines: 50

  # 4. Server: Log-Parser (NEU – regex ODER json, je nach Format)
  - match:
      selector: '{compose_service="el-servador"}'
      stages:
        - regex:  # ODER json: – siehe Punkt 1
            expression: '...'
        - labels:
            level:
            logger:

  # 5. Frontend: JSON-Parser (existiert bereits)
  - match:
      selector: '{compose_service="el-frontend"}'
      stages:
        - json:
            expressions:
              level: level
              component: component
        - labels:
            level:
            component:
```

**Hinweis:** Die match-Stages mit dem gleichen Selektor (`compose_service="el-servador"`)
KÖNNEN in eine einzige match-Stage zusammengefasst werden, solange die interne
Reihenfolge (drop → multiline → parser → labels) erhalten bleibt. Das ist sogar
besser weil es die Config kürzer und lesbarer macht.

### 4. Konsistente Label-Strategie

Folgende Labels sollen für ALLE Services als Loki-Labels verfügbar sein:

| Label | Quelle | Beschreibung |
|-------|--------|-------------|
| `compose_service` | Docker SD (existiert) | Service-Name aus Compose |
| `container` | Docker SD (existiert) | Container-Name |
| `stream` | Docker SD (existiert) | stdout/stderr |
| `compose_project` | Docker SD (existiert) | "auto-one" |
| `level` | Parser (NEU für Server) | Log-Level (INFO, WARNING, ERROR, DEBUG) |

Service-spezifische Labels:
| Label | Service | Beschreibung |
|-------|---------|-------------|
| `logger` | el-servador | Python Logger-Name (z.B. "mqtt_handler", "api") |
| `component` | el-frontend | Vue-Komponente |
| `module` | el-servador | Python-Modul (nur wenn JSON-Format) |

**NICHT als Labels (hohe Kardinalität):**
- `request_id` → structured_metadata wenn Loki 3.x es unterstützt, sonst im Log-Text belassen
- `function`, `line` → bleiben im Log-Text

### 5. Kommentare in der Config

Die fertige config.yml muss klar kommentiert sein:
- Was jede Stage tut
- Welches Log-Format erwartet wird
- Welche Labels extrahiert werden
- Warum die Reihenfolge so ist wie sie ist

## Qualitätskriterien

1. **Server-Logs in Loki haben Label `level`** – querybar mit `{compose_service="el-servador", level="ERROR"}`
2. **Frontend-Logs haben weiterhin Labels `level` + `component`** – bestehende Funktionalität darf NICHT brechen
3. **Python Tracebacks sind als einzelne Einträge in Loki** – nicht als 20 separate Zeilen
4. **Health-Check-Drops funktionieren weiterhin** – keine Health-Endpunkt-Logs in Loki
5. **Config ist sauber kommentiert** – jede Stage erklärt was und warum

## Verifikation

```bash
# Promtail nach Config-Änderung neustarten
docker compose restart promtail

# Server-Logs in Loki mit Level-Label
# In Grafana Explore (Loki):
# {compose_service="el-servador", level="ERROR"}
# → Muss Ergebnisse liefern (wenn Errors existieren)
# {compose_service="el-servador", level="INFO"}
# → Muss die normalen Logs zeigen

# Frontend-Logs weiterhin mit Labels
# {compose_service="el-frontend", level="error"}
# → Muss weiterhin funktionieren

# Traceback-Test (falls möglich):
# Einen absichtlichen Error im Server auslösen und prüfen ob der
# Traceback als EIN Eintrag in Loki erscheint
```

## Report

Erstelle nach Abschluss einen Report mit:
- Welches Log-Format der Server tatsächlich an Docker stdout schickt (mit Beispiel)
- Welchen Parser du gewählt hast und warum
- Die vollständige fertige config.yml
- Verifikationsergebnis: Loki-Query Screenshots oder Output
- Offene Punkte (z.B. wenn structured_metadata nicht unterstützt wird)
- Report nach: `.technical-manager/inbox/agent-reports/infra-part3-promtail-pipeline.md`
