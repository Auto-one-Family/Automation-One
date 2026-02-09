# Auftrag 5: LOG_ACCESS_REFERENCE.md Label-Doku korrigieren

**Datum:** 2026-02-09
**Agent:** @agent-manager
**Priorität:** KRITISCH
**Geschätzter Aufwand:** 20-30 Minuten
**Typ:** Dokumentations-Korrektur

---

## WORUM GEHT ES

Die Dokumentation `LOG_ACCESS_REFERENCE.md` beschreibt die **Label-Strategie** für Loki-Queries **falsch**. Das führt zu:

1. **Fehlerhaften Query-Beispielen** (nutzen nicht-existente Labels)
2. **Verwirrung bei Entwicklern** (Queries funktionieren nicht wie dokumentiert)
3. **Falsche Annahmen in weiteren Dokumenten** (TM-Onboarding, andere Referenzen)

**Die Fehler:**

| Dokumentiertes Label | Tatsächliches Label | Quelle |
|---------------------|---------------------|--------|
| `service_name` | `service` | Promtail-Config Z.31 |
| `service_name` (ambig) | `service_name` (Auto-Label, nicht nutzen) | Docker SD |

**Zusätzlich:** Dokument behauptet "60+ Frontend-Queries nutzen `service_name`" → **Frontend hat 0 Loki-Queries**.

**Warum ist das kritisch:**
- Query-Beispiele in Doku funktionieren nicht
- User kopieren Beispiele → Fehler
- Wissensdatenbank ist fehlerhaft
- Weitere Referenzen könnten denselben Fehler übernommen haben

---

## WAS MUSS ANALYSIERT WERDEN

### Phase A: Vollständige IST-Analyse (10 Min)

**1. LOG_ACCESS_REFERENCE.md durchsuchen**

Datei: `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`

**Suchmuster:**
```bash
# Alle Erwähnungen von "service_name"
grep -n "service_name" .claude/reference/debugging/LOG_ACCESS_REFERENCE.md

# Alle Loki-Query-Beispiele
grep -n "{" .claude/reference/debugging/LOG_ACCESS_REFERENCE.md | grep -v "^#"
```

**Dokumentieren:**
- Zeilen-Nummern wo `service_name` vorkommt
- Kontext: Was wird dort beschrieben?
- Query-Beispiele: Funktionieren sie? (gegen Live-Loki testen)

**Beispiel-Finding:**
```markdown
<!-- FALSCH -->
Zeile 13-15:
"Labels: `service_name` oder `container`"

Zeile 42-47:
"Frontend-Queries: 60+ Queries nutzen service_name"
```

**2. Tatsächliche Label-Strategie verifizieren**

**Promtail-Config lesen:**

Datei: `docker/promtail/config.yml`

```yaml
relabel_configs:
  - source_labels: ['__meta_docker_container_name']
    regex: '/(.*)'
    target_label: 'container'

  - source_labels: ['__meta_docker_container_log_stream']
    target_label: 'stream'

  - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
    target_label: 'service'  # ← HIER: Label heißt "service"

  - source_labels: ['__meta_docker_container_label_com_docker_compose_service']
    target_label: 'compose_service'  # ← Duplikat

  - source_labels: ['__meta_docker_container_label_com_docker_compose_project']
    target_label: 'compose_project'
```

**Live-Verifizierung (wenn Stack läuft):**
```bash
# Alle Labels in Loki abfragen
curl -s http://localhost:3100/loki/api/v1/labels | jq -r '.data[]'

# Erwartete Labels:
# compose_project
# compose_service
# container
# service         ← Dieses nutzen!
# service_name    ← Auto-Label, ambig, nicht nutzen
# stream
# detected_level
```

**Dokumentieren:**
- Welche Labels gibt es wirklich?
- Welche kommen aus Promtail-Config? (`service`, `compose_service`, `container`, etc.)
- Welche sind Auto-Labels? (`service_name` von Docker SD)
- Warum ist `service_name` ambig? (enthält Container-Name + Service-Name gemischt)

**3. Frontend-Loki-Integration prüfen**

**Frontend-Codebase durchsuchen:**

```bash
# Suche nach Loki-Queries im Frontend
cd "El Frontend"
grep -r "loki" src/ --include="*.vue" --include="*.ts" --include="*.js"
grep -r "service_name" src/
grep -r "LogQL" src/
grep -r "3100" src/  # Loki-Port
```

**Erwartetes Ergebnis:** **Keine Treffer** (Frontend hat keine Loki-Integration)

**Dokumentieren:**
- Hat Frontend Loki-API-Client? (NEIN)
- Hat Frontend Loki-Queries? (NEIN)
- Woher kommt "60+ Queries" Behauptung? (Fehlinterpretation? Alte Planung?)

**4. Cross-Reference-Check**

**Andere Dokumente prüfen die Labels erwähnen:**

```bash
# Alle Referenz-Dokumente nach "service_name" durchsuchen
grep -r "service_name" .claude/reference/

# Erwartung: Mehrere Treffer (LOG_ACCESS + evtl. andere)
```

**Dokumentieren:**
- Welche Dokumente erwähnen `service_name`?
- Sind diese Erwähnungen korrekt oder falsch?
- Müssen weitere Dokumente korrigiert werden?

---

## WIE SOLL GEARBEITET WERDEN

### Phase B: Korrekturen planen (5 Min)

**Korrektur-Matrix erstellen:**

| Zeile(n) | Aktueller Text | Korrektur | Begründung |
|----------|---------------|-----------|------------|
| 13-15 | "Labels: `service_name` oder `container`" | "Labels: `service` oder `container`" | Promtail-Config Z.31 |
| 42-47 | "60+ Frontend-Queries nutzen service_name" | **KOMPLETT ENTFERNEN** oder "Frontend hat keine Loki-Integration" | Frontend-Analyse zeigt: 0 Queries |
| Query-Beispiele | `{service_name="el-servador"}` | `{service="el-servador"}` | Label-Korrektur |

**Zusätzlich ergänzen:**
- **Warnung** vor `service_name` Auto-Label (ambig, nicht nutzen)
- **Klarstellung** Label-Herkunft (Promtail vs Docker SD)
- **Empfohlene Labels:** `service` (Compose-Service), `container` (Container-Name)

### Phase C: Implementierung (10-15 Min)

**1. Datei öffnen**

Datei: `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md`

**2. Fehlerhafte Erwähnungen korrigieren**

**Beispiel-Korrektur (Zeile 13-15):**

**VORHER:**
```markdown
## Loki-Abfrage

AutomationOne nutzt Loki für zentrales Logging. Die wichtigsten Labels:
- `service_name`: Service-Name (z.B. `el-servador`, `mqtt-broker`)
- `container`: Container-Name (z.B. `automationone-server`)
```

**NACHHER:**
```markdown
## Loki-Abfrage

AutomationOne nutzt Loki für zentrales Logging. Die wichtigsten Labels:
- `service`: Compose-Service-Name (z.B. `el-servador`, `mqtt-broker`) ← aus Promtail-Config
- `container`: Container-Name (z.B. `automationone-server`)
- `compose_service`: Identisch mit `service` (Redundanz, kann ignoriert werden)
- `compose_project`: Projekt-Name (immer `auto-one`)

**WARNUNG:** Das Label `service_name` existiert ebenfalls, wird aber automatisch von Docker SD gesetzt und ist ambig (enthält Container-Name + Service-Name gemischt). Nutzen Sie stattdessen `service`.
```

**3. Query-Beispiele korrigieren**

**Alle Vorkommen von `{service_name=...}` ersetzen mit `{service=...}`**

**Beispiel:**

**VORHER:**
```bash
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="el-servador"}' \
  --data-urlencode 'limit=50'
```

**NACHHER:**
```bash
curl -s "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service="el-servador"}' \
  --data-urlencode 'limit=50'
```

**4. Frontend-Behauptung korrigieren**

**VORHER (Zeile 42-47, Beispiel):**
```markdown
## Frontend-Integration

Das Frontend nutzt über 60 Loki-Queries um Logs anzuzeigen. Die Queries verwenden das Label `service_name` für Service-Filterung.
```

**NACHHER:**
```markdown
## Frontend-Integration

Das Frontend hat **keine direkte Loki-Integration**. Logs werden via REST-API-Endpoint `/api/v1/debug/logs` abgerufen, der JSON-Dateien vom Server liest (nicht Loki). Eine direkte Frontend → Loki-Verbindung ist für zukünftige Erweiterungen geplant.
```

**5. Label-Referenz-Tabelle hinzufügen (optional, empfohlen)**

**Neue Sektion am Anfang:**

```markdown
## Loki-Label-Referenz

| Label | Herkunft | Beispielwert | Nutzen für Queries |
|-------|----------|--------------|-------------------|
| `compose_project` | Promtail | `auto-one` | Filter nach Projekt (falls mehrere) |
| `service` | Promtail | `el-servador`, `mqtt-broker` | **Primär:** Service-Filter |
| `compose_service` | Promtail | `el-servador` | Identisch mit `service`, redundant |
| `container` | Promtail | `automationone-server` | Container-Name-Filter |
| `stream` | Promtail | `stdout`, `stderr` | stdout vs stderr |
| `detected_level` | Promtail 3.x Auto | `info`, `error`, `warn`, `unknown` | Log-Level-Filter |
| `service_name` | Docker SD (Auto) | Gemischt | **NICHT NUTZEN** (ambig) |

**Empfohlene Queries:**
- Service-Filter: `{service="el-servador"}`
- Multi-Service: `{service=~"el-.*"}`
- Error-Logs: `{service="el-servador", detected_level="error"}`
- Container-spezifisch: `{container="automationone-server"}`
```

---

## WO IM SYSTEM

### Dateipfade

| Datei | Zweck | Änderung |
|-------|-------|----------|
| `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` | Loki-Logging-Doku | **ÄNDERN** (Label-Namen, Query-Beispiele, Frontend-Behauptung) |

### Cross-References prüfen

**Nach Korrektur:** Andere Dokumente durchsuchen die möglicherweise denselben Fehler haben:

```bash
grep -r "service_name" .claude/reference/ --exclude="LOG_ACCESS_REFERENCE.md"
```

**Falls Treffer:** In Report dokumentieren, separate Korrektur-Tickets erstellen.

---

## ERFOLGSKRITERIUM

### Technische Verifikation

**1. Markdown-Syntax**
```bash
# Markdown validieren (wenn Tool verfügbar)
markdownlint .claude/reference/debugging/LOG_ACCESS_REFERENCE.md
```

**2. Query-Beispiele funktionieren**

**Alle Query-Beispiele aus dem Dokument extrahieren und testen:**

```bash
# Beispiel-Query aus Doku
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={service="el-servador"}' \
  --data-urlencode 'limit=1' | jq '.status'
# Erwartung: "success"

# Alte Query (sollte NICHT mehr im Dokument sein)
curl -s "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query={service_name="el-servador"}' \
  --data-urlencode 'limit=1' | jq '.status'
# Funktioniert auch, aber ist ambig → Warnung hinzugefügt
```

**3. Korrekturen vollständig**

**Checklist:**
- [ ] Alle `service_name` in Query-Beispielen ersetzt durch `service`
- [ ] Warnung vor `service_name` Auto-Label hinzugefügt
- [ ] Frontend-Behauptung ("60+ Queries") korrigiert oder entfernt
- [ ] Label-Referenz-Tabelle hinzugefügt (optional)
- [ ] Query-Beispiele live getestet

**4. Cross-References geprüft**

- [ ] Andere Dokumente nach `service_name` durchsucht
- [ ] Treffer dokumentiert im Report
- [ ] Keine weiteren Fehler in LOG_ACCESS_REFERENCE.md

---

## STRUKTUR & PATTERN

### Dokumentations-Qualitäts-Standards

**AutomationOne Referenz-Dokumentation folgt:**

1. **Fakten-basiert:** Nur was tatsächlich implementiert ist
2. **Verifizierbar:** Alle Beispiele gegen Live-System testbar
3. **Präzise Terminologie:** Label-Namen exakt wie in Code
4. **Warnungen bei Ambiguität:** Wenn mehrere Wege existieren, Empfehlung geben

**Anti-Pattern (vermeiden):**
- "Wird verwendet" ohne Nachweis
- "60+ Queries" ohne Quelle
- Label-Namen "aus dem Gedächtnis"

### Markdown-Konventionen

**Code-Blocks:**
```markdown
```bash
# Inline-Kommentare für Erklärung
curl -s "http://..." | jq '.data'
```
```

**Label-Darstellung:**
- Inline-Code: `service` (für Label-Namen)
- Beispielwerte: `"el-servador"` (in Quotes, String)

**Warnungen:**
```markdown
**WARNUNG:** Text hier

oder

> **Achtung:** Text hier
```

---

## REPORT ZURÜCK AN TM

**Datei:** `.technical-manager/inbox/agent-reports/agent-manager-log-access-reference-2026-02-09.md`

**Struktur:**

```markdown
# LOG_ACCESS_REFERENCE.md Korrektur

## Analyse-Findings
- Fehlerhafte Label-Namen: [service_name → service]
- Zeilen mit Fehlern: [13-15, 42-47, Query-Beispiele]
- Promtail-Config verifiziert: [Labels confirmed]
- Live-Label-Check: [curl Loki, Labels gelistet]
- Frontend-Loki-Integration: [KEINE, 0 Queries]

## Korrektur-Plan
- Label-Namen: [Alle service_name → service]
- Frontend-Behauptung: [Entfernt/Korrigiert]
- Warnung hinzugefügt: [service_name Auto-Label ambig]
- Label-Referenz-Tabelle: [Hinzugefügt/Nicht hinzugefügt]

## Implementierung
- Zeilen geändert: [Liste mit Diffs]
- Query-Beispiele getestet: [Alle funktionieren]
- Markdown-Validierung: [OK/Fehler]

## Cross-References
- Andere Dokumente geprüft: [Liste]
- Weitere Fehler gefunden: [Ja/Nein, Details]
- Follow-up nötig: [Ja/Nein, welche Dokumente]

## Verifikation
- Query-Tests: [X/Y erfolgreich]
- Label live bestätigt: [curl Loki, Output]
- Keine service_name in Query-Beispielen: [Bestätigt]
```

---

## KRITISCHE HINWEISE

### Label-Ambiguität von service_name

**Warum service_name problematisch ist:**

Das `service_name` Label wird von Docker Service-Discovery automatisch gesetzt und enthält **beide Werte gemischt**:

```bash
# Live-Abfrage der service_name Werte
curl -s "http://localhost:3100/loki/api/v1/label/service_name/values" | jq -r '.data[]'

# Output (Beispiel):
automationone-frontend  ← Container-Name
automationone-grafana   ← Container-Name
automationone-server    ← Container-Name
el-frontend             ← Service-Name
el-servador             ← Service-Name
grafana                 ← Service-Name
...
```

**Problem:** Query `{service_name="el-servador"}` matcht nur Service-Name, nicht Container-Name. Query `{service_name="automationone-server"}` matcht nur Container-Name, nicht Service-Name.

**Lösung:** Klare Trennung:
- `service` = Compose-Service (aus Label `com.docker.compose.service`)
- `container` = Container-Name (aus `__meta_docker_container_name`)

### Frontend-Lüge vs Realität

**Die "60+ Queries" Behauptung:**

Mögliche Quellen:
1. **Alte Planung:** Loki-Integration war geplant, nie implementiert
2. **Fehlinterpretation:** 68 `console.*` Calls wurden als "Loki-Queries" gezählt
3. **Copy-Paste-Fehler:** Text aus anderem Projekt kopiert

**Korrekte Darstellung:**
- Frontend nutzt REST-API (`/api/v1/debug/logs`)
- Server liest JSON-Dateien von Disk
- Loki wird NICHT direkt vom Frontend angesprochen
- Zukünftige Erweiterung möglich (pino + Loki-Push)

### Konsistenz mit Grafana

**Grafana-Dashboards nutzen bereits die korrekten Labels:**

Aus `system-health.json`:
```json
{
  "expr": "{compose_project=\"auto-one\"}",  // ← KORREKT
  "datasource": {"uid": "loki"}
}
```

**Wenn LOG_ACCESS_REFERENCE falsch bleibt:**
- Doku widerspricht funktionierendem Dashboard
- User verwirrt warum Dashboard-Query anders ist als Doku-Beispiel

**Nach Korrektur:** Doku + Dashboard konsistent.

---

## ZUSAMMENFASSUNG

**Was wird gemacht:**
- `service_name` → `service` in allen Query-Beispielen
- Frontend-Behauptung ("60+ Queries") entfernen oder korrigieren
- Warnung vor `service_name` Auto-Label hinzufügen
- Label-Referenz-Tabelle hinzufügen (empfohlen)

**Warum:**
- Aktuelle Doku führt zu fehlerhaften Queries
- Frontend-Integration existiert nicht (Fehlinformation)
- `service_name` ist ambig und sollte nicht genutzt werden

**Wie:**
- Markdown-Datei editieren (Label-Namen, Query-Beispiele)
- Live-Tests gegen Loki
- Cross-Reference-Check für weitere Fehler

**Erwartung:**
- Alle Query-Beispiele funktionieren
- Keine Fehlinformationen über Frontend
- Klare Empfehlung welche Labels nutzen
