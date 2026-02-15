# Auftrag: Grafana Dashboard Spezifikation – Korrektur & Vervollständigung
# =========================================================================
# Datum: 2026-02-10
# Auftraggeber: Technical Manager (Claude Desktop)
# Ausführung: /do
# Ziel-Dokument: .technical-manager/commands/pending/infra-part5-grafana-redesign.md
# → wird IN PLACE korrigiert und vervollständigt

---

# KONTEXT FÜR DEN ENTWICKLER

Das Ziel-Dokument enthält eine umfangreiche Analyse und ein Dashboard-Konzept,
erstellt vom TM und ergänzt durch einen verify-plan Agent. Es hat aber folgende
Probleme die du beheben musst:

1. **Offene Entscheidungen statt finaler Spezifikation** – Das Dokument enthält
   "Option A / B / C" Listen wo klare Entscheidungen stehen müssen
2. **Fehlende JSON-Strukturinformationen** – Kein Wort über die kritischen
   Grafana-JSON-Regeln die eine KI beim Generieren zwingend braucht
3. **Widersprüche zwischen Agent-Reports** – Besonders beim Loki `level` Label
4. **Unvollständige Komponentenliste** – Nur Dashboard beschrieben, aber Alert Rules
   und Promtail Pipeline sind ebenfalls betroffen
5. **Vermischung von Analyse und Spezifikation** – Diskussion und finale Entscheidung
   nicht sauber getrennt

---

# DEINE AUFGABE

Du korrigierst und vervollständigst das Dokument
`.technical-manager/commands/pending/infra-part5-grafana-redesign.md`
so dass es als **komplette, widerspruchsfreie Implementierungsspezifikation** dient.

Ein nachfolgender /do Agent wird auf Basis dieses Dokuments das Dashboard-JSON
und zugehörige Dateien generieren. Er muss ALLES was er braucht in DIESEM
Dokument finden – ohne Raten, ohne Optionen, ohne Widersprüche.

---

# PFLICHT: ANALYSE-PHASE ZUERST

## Schritt 1: Bestandsaufnahme des echten Systems

Lies und analysiere diese Dateien:

```
docker/grafana/provisioning/dashboards/system-health.json  ← KRITISCH: Referenz-JSON
docker/grafana/provisioning/dashboards/dashboards.yml       ← Provider-Config
docker/grafana/provisioning/datasources/datasources.yml     ← Datasource UIDs
docker/grafana/provisioning/alerting/alert-rules.yml        ← Alert Rules
docker/promtail/config.yml                                  ← Promtail Pipeline
```

Aus `system-health.json` extrahiere:
- **schemaVersion** (exakte Zahl)
- **Datasource-Referenz-Format** (wie referenziert das bestehende JSON die Datasources?)
- **Panel-Struktur** eines stat-Panels (vollständiges Beispiel mit fieldConfig)
- **Panel-Struktur** eines timeseries-Panels (vollständiges Beispiel)
- **Panel-Struktur** eines logs-Panels (falls vorhanden)
- **Row-Struktur** (wie sind Rows aktuell implementiert? collapsed/nicht-collapsed?)
- **ID-Vergabe** (höchste aktuelle Panel-ID)
- **gridPos-Muster** (wie werden Positionen berechnet?)

## Schritt 2: Live-Metriken verifizieren

```bash
# Server-Metriken: Vollständige Liste
curl -s http://localhost:8000/api/v1/health/metrics

# Postgres-Exporter: Dashboard-relevante Metriken
curl -s http://localhost:9187/metrics | grep -E "^pg_(up|stat_database_numbackends|database_size_bytes|stat_database_deadlocks|stat_database_conflicts|stat_activity_count|locks_count)" | head -20

# Mosquitto-Exporter: Dashboard-relevante Metriken
curl -s http://localhost:9234/metrics | grep -E "^broker_(clients_connected|messages_received|messages_sent|publish_messages_dropped|subscriptions_count|uptime)" | head -20

# Loki: Labels prüfen – KLÄRE DEN WIDERSPRUCH
curl -s 'http://localhost:3100/loki/api/v1/labels'
curl -s 'http://localhost:3100/loki/api/v1/label/level/values'
curl -s 'http://localhost:3100/loki/api/v1/label/compose_service/values'

# Prüfe ob level-Label bei el-servador in den Logs tatsächlich ankommt:
curl -s -G 'http://localhost:3100/loki/api/v1/query' \
  --data-urlencode 'query={compose_service="el-servador"} | logfmt | level != ""' \
  --data-urlencode 'limit=5'

# Grafana-Version
curl -s -u admin:admin http://localhost:3000/api/health
```

## Schritt 3: Dokument lesen

Lies das Ziel-Dokument vollständig:
`.technical-manager/commands/pending/infra-part5-grafana-redesign.md`

---

# WAS DU IM DOKUMENT KORRIGIEREN/ERGÄNZEN MUSST

## A. NEUE SEKTION: "JSON-Strukturregeln" (nach Teil 1, vor Teil 2)

Basierend auf deiner Analyse von `system-health.json`, dokumentiere die
EXAKTEN JSON-Strukturregeln die der implementierende Agent braucht:

### A.1 Collapsible Rows – DAS KRITISCHSTE THEMA

In Grafana gibt es eine **Dualität** bei der Row-JSON-Struktur die KI-Modelle
konsistent falsch machen. Dokumentiere mit Beispielen aus dem echten JSON:

**Wenn `collapsed: false` (Row ist OFFEN, default sichtbar):**
- Row-Element hat `"panels": []` (LEER!)
- Die Panels der Row stehen als GESCHWISTER nach dem Row-Element im Top-Level panels-Array
- gridPos der Panels: y-Werte starten NACH dem Row (Row y + 1)

**Wenn `collapsed: true` (Row ist GESCHLOSSEN, muss aufgeklappt werden):**
- Row-Element hat `"panels": [...]` mit den Panels DARIN
- Die Panels sind NICHT im Top-Level panels-Array
- gridPos der Panels: y-Werte starten bei Row y + 1 (relativ zur Row)

**Für unser Dashboard bedeutet das:**
- Row 0 (System Status): KEIN Row-Element, Panels direkt im Top-Level
- Row 1-3 (default: open): Row mit `collapsed: false`, Panels als Geschwister DANACH
- Row 4-5 (default: collapsed): Row mit `collapsed: true`, Panels IM Row-Element

→ Zeige das exakte Pattern aus dem bestehenden system-health.json als Referenz.

### A.2 Datasource-Referenzierung

Exaktes Format aus datasources.yml:
```json
{"type": "prometheus", "uid": "prometheus"}
{"type": "loki", "uid": "loki"}
```
Für alertlist-Panel: `{"type": "datasource", "uid": "grafana"}`

JEDES Panel und JEDES Target braucht eine explizite datasource-Referenz.
Niemals nur einen String, immer das Objekt.

### A.3 Panel-Grundstruktur

Dokumentiere die EXAKTE Struktur eines stat-Panels und eines timeseries-Panels
wie sie im bestehenden JSON verwendet wird. Inklusive:
- `fieldConfig.defaults` (unit, thresholds, mappings, color, min, max)
- `fieldConfig.defaults.custom` (was nötig, was optional)
- `fieldConfig.overrides` (wann und wie)
- `options` (reduceOptions, textMode, colorMode, graphMode, orientation)
- `targets` (refId, expr, legendFormat, datasource)

### A.4 schemaVersion und Dashboard-Envelope

Dokumentiere die exakte Top-Level-Struktur:
```json
{
  "id": null,
  "uid": "...",
  "title": "...",
  "schemaVersion": [EXAKTE ZAHL AUS BESTEHENDEM JSON],
  ...
}
```

### A.5 gridPos-Berechnungsregeln

- Grid = 24 Spalten breit
- Rows = immer `"w": 24, "h": 1`
- Panels: x + w <= 24 (keine Überlappung horizontal)
- y-Werte: streng sequentiell, keine Lücken, keine Überlappung
- Panel-IDs: eindeutig, sequentiell ab 1

---

## B. OFFENE ENTSCHEIDUNGEN FINALISIEREN

Ersetze ALLE "Option A/B/C"-Diskussionen durch EINE finale Entscheidung.
Markiere Entscheidungen mit ✅ FINAL.

### B.1 ESP Fleet Panel (ID:5 in Row 0)

Die "zwei Targets als Hauptwert + Subtext"-Idee (Option A) ist PROBLEMATISCH.
Ein stat-Panel mit zwei Targets zeigt zwei SEPARATE Werte nebeneinander,
nicht "68 / 100" als kombinierten Text.

**Prüfe im bestehenden JSON** ob es stat-Panels mit mehreren Targets gibt
und wie die dargestellt werden. Dann entscheide:

- **Wenn stat-Panel mit textMode-Trick funktioniert** → dokumentiere exakt wie
- **Wenn nicht** → verwende eine einzige PromQL-Expression die einen sinnvollen
  Einzelwert liefert, z.B.:
  - `god_kaiser_esp_online` als Hauptwert mit threshold-Farben
  - ODER gauge mit `god_kaiser_esp_online / clamp_min(god_kaiser_esp_total, 1) * 100`
  - Die Details (Total/Online/Offline) sind ohnehin in Row 2

### B.2 Panel 6 (Active Alerts)

**Entscheide:** Alert List Panel oder weglassen?
- Wenn Alert List: dokumentiere exakte JSON-Struktur (type: "alertlist")
  mit stateFilter, viewMode, maxItems
- Wenn weglassen: verteile die 4w Breite auf die anderen 5 Panels in Row 0

### B.3 Panel 22 (Deadlocks vs Locks)

**Entscheide** basierend auf den Live-Metriken:
- Wenn `pg_stat_database_deadlocks` immer 0 → nimm Locks stattdessen
- Titel und Query final festlegen

### B.4 Loki `level` Label – WIDERSPRUCH KLÄREN

Part 3 Agent-Report sagt: `level` Label mit Werten ERROR, INFO, WARNING existiert.
Verify-Plan Agent sagt: `level` Label hat KEINE Werte.

DU klärst das JETZT mit den Live-Queries (Schritt 2). Dokumentiere:
- Was die Loki API tatsächlich zurückgibt
- Ob die Promtail Pipeline in `config.yml` tatsächlich `level` extrahiert
- Ob die Regex-Stufe korrekt konfiguriert ist
- Finales Ergebnis: Funktioniert `{compose_service="el-servador", level="ERROR"}`
  als Loki-Query JA oder NEIN?

Wenn NEIN: Alle Panel-Queries die auf `level` Label setzen → auf Regex-Filter umschreiben.
Wenn JA: Dokumentiere warum der Verify-Plan-Agent es nicht gefunden hat.

---

## C. VOLLSTÄNDIGE PANEL-SPEZIFIKATIONSTABELLE

Erstelle eine EINZIGE, finale Tabelle aller Panels mit diesen Spalten:

| ID | Row | Titel | Typ | Datasource | Query (exakt) | Unit | Thresholds | gridPos (x,y,w,h) |

Regeln:
- Jedes Panel hat eine eindeutige ID (1-N, sequentiell)
- Jedes Panel hat eine exakte PromQL/LogQL Query (keine Platzhalter)
- gridPos ist BERECHNET (nicht geschätzt) – 24er Grid, keine Überlappung
- Row-Panels sind eigene Einträge (type: "row")

---

## D. VOLLSTÄNDIGE KOMPONENTENLISTE

Das Dokument beschreibt nur das Dashboard. Aber die Implementierung betrifft
MEHRERE Dateien. Ergänze eine Sektion "Betroffene Komponenten" die ALLE
Änderungen auflistet:

### D.1 Dashboard (Haupt-Deliverable)
- Datei: `docker/grafana/provisioning/dashboards/system-health.json`
- Aktion: Inhalt ersetzen (UID beibehalten: `automationone-system-health`)
- Titel: "AutomationOne – Operations"

### D.2 Alert Rules (falls Änderungen nötig)
- Datei: `docker/grafana/provisioning/alerting/alert-rules.yml`
- Prüfe: Stimmt die aktuelle Rule 5 Expression? Muss sie für das Dashboard angepasst werden?
- Dokumentiere ob Änderungen nötig sind oder nicht

### D.3 Promtail Pipeline (falls Änderungen nötig)
- Datei: `docker/promtail/config.yml`
- Prüfe: Wird `level` korrekt extrahiert? Fehlt die zweite Health-Log-Drop-Regex?
- Dokumentiere ob Änderungen nötig sind oder nicht
- HINWEIS: Ein separater Fix-Auftrag (infra-postfix-review-corrections.md) behandelt
  Promtail-Fixes. Hier nur dokumentieren, NICHT doppelt implementieren.

### D.4 Datasources (vermutlich keine Änderung)
- Datei: `docker/grafana/provisioning/datasources/datasources.yml`
- UIDs: prometheus, loki
- Dokumentiere: Keine Änderung nötig (oder doch?)

---

## E. QUALITÄTS-CHECKLISTE ERGÄNZEN

Füge am Ende des Dokuments eine Checkliste hinzu die der implementierende
Agent nach Fertigstellung durcharbeiten muss:

```
[ ] Jedes Panel hat eine eindeutige ID
[ ] Alle Panel-IDs sind sequentiell (keine Lücken, keine Duplikate)
[ ] Jedes Panel hat eine explizite datasource als Objekt (nie als String)
[ ] Alle Datasource-UIDs matchen datasources.yml (prometheus, loki)
[ ] gridPos: Kein Panel überschreitet x + w > 24
[ ] gridPos: Keine y-Überlappung zwischen Panels
[ ] gridPos: Row-Panels haben w:24, h:1
[ ] Collapsed rows: Panels INNERHALB des row.panels Arrays
[ ] Open rows: Panels als Geschwister NACH dem Row-Element, row.panels = []
[ ] Row 0 hat KEIN Row-Element (Panels direkt im Top-Level)
[ ] Alle PromQL-Queries wurden gegen Live-Metriken getestet
[ ] Alle LogQL-Queries verwenden existierende Labels
[ ] schemaVersion stimmt mit bestehendem Dashboard überein
[ ] Dashboard UID = "automationone-system-health" (NICHT geändert)
[ ] Dashboard version = 0 (Grafana verwaltet Versionierung)
[ ] Dashboard id = null (Grafana vergibt IDs)
[ ] Alle Thresholds haben null als ersten step-value
[ ] fieldConfig.defaults.color.mode ist gesetzt
[ ] Keine verwaisten Referenzen auf nicht-existierende Metriken/Labels
[ ] Alert Rules: Keine Änderungen die mit dem separaten Fix-Auftrag kollidieren
```

---

## F. DESIGN-PRINZIPIEN (ergänze prominent im Dokument)

Das Dashboard soll folgende Prinzipien erfüllen – diese sind NICHT optional:

1. **Menschenverständlich:** Ein Mensch der das Dashboard zum ersten Mal sieht
   versteht in 5 Sekunden ob das System gesund ist (Row 0 Ampeln).
   Klare Titel, sinnvolle Einheiten, keine kryptischen Metrik-Namen.

2. **Gebündelt aber übersichtlich:** Lieber WENIGER Panels die das Richtige
   zeigen als viele die überladen. Jede Information genau EINMAL.
   Wenn ein Wert in Row 0 als Ampel steht, muss er NICHT nochmal als
   eigenes Panel in einer Detail-Row auftauchen (außer als Zeitverlauf).

3. **Vollständig debugbar:** Wenn etwas rot ist, kann man durch Aufklappen
   der relevanten Row die Details sehen. Logs sind querybar. Metriken
   korrelierbar. Error-Logs mit Service-Labels.

4. **Professionell strukturiert:** Top-Down Informationsfluss.
   Oben: Status auf einen Blick. Mitte: Performance-Details (offen).
   Unten: DB und Logs (geschlossen, bei Bedarf aufklappbar).

5. **Nicht überladen:** Maximal 5-6 Rows. Stat-Panels klein und kompakt.
   Timeseries-Panels nutzen die volle Breite.
   Keine redundanten Panels. Keine "nice to have" Panels.

6. **Systemkonform:** Alle Queries nutzen exakt die Metrik-Namen wie sie
   vom System geliefert werden. Keine Annahmen. Keine Approximationen.
   Was nicht als Metrik existiert, kommt nicht ins Dashboard.

---

# OUTPUT

Das korrigierte Dokument bleibt am gleichen Ort:
`.technical-manager/commands/pending/infra-part5-grafana-redesign.md`

Struktur des korrigierten Dokuments:

```
# Grafana Dashboard & Monitoring – Implementierungsspezifikation
# (Titel ändern von "Analyse & Konzept" zu "Implementierungsspezifikation")

## Teil 1: IST-Zustand (bereinigt – keine ❓ mehr, nur verifizierte Fakten)
## Teil 1a: JSON-Strukturregeln (NEU – aus system-health.json extrahiert)
## Teil 2: Verfügbare Metriken (bereinigt – nur finale, verifizierte Daten)
## Teil 3: Dashboard-Spezifikation (alle Entscheidungen FINAL, keine Optionen)
  ### 3.1 Design-Prinzipien
  ### 3.2 Layout-Übersicht (ASCII-Art beibehalten, korrigiert)
  ### 3.3 Panel-Spezifikationstabelle (EINE Tabelle, ALLE Panels, ALLE Details)
  ### 3.4 Row-Konfigurationen (collapsed/open Zuordnung)
## Teil 4: Betroffene Komponenten (NEU – Dashboard + Alert Rules + Promtail + Datasources)
## Teil 5: Alert Rules Status (bereinigt)
## Teil 6: Qualitäts-Checkliste (NEU)
## Teil 7: Verify-Plan Ergebnisse (bereinigt – nur das was korrekt war)
```

Entferne aus dem Dokument:
- ALLE ❓ VERIFY-PLAN Marker (durch verifizierte Daten ersetzen)
- ALLE "Option A/B/C" Diskussionen (durch finale Entscheidung ersetzen)
- ALLE Widersprüche (durch eine einzige, verifizierte Wahrheit ersetzen)
- Die ursprüngliche "ANWEISUNG AN VERIFY-PLAN" im Header (ersetzen durch
  "Implementierungsspezifikation – alle Daten verifiziert [Datum]")

Behalte:
- Alle korrekten Metriken-Daten und Verify-Plan-Ergebnisse
- Die 🔧 KORREKTUR Marker (die sind wertvoll als Dokumentation)
- Die ASCII-Art Layout-Darstellung (korrigiert wo nötig)

---

# ERFOLGSKRITERIUM

Ein /do Agent der AUSSCHLIESSLICH dieses Dokument liest, kann daraus
ein vollständiges, funktionierendes `system-health.json` generieren –
ohne eine einzige Frage stellen zu müssen, ohne eine einzige Annahme
treffen zu müssen, ohne einen einzigen Live-Endpunkt abfragen zu müssen.

Das Dokument ist die SINGLE SOURCE OF TRUTH für die Dashboard-Implementation.

---

# REPORT

Erstelle nach Abschluss einen kurzen Report mit:
- Liste aller Änderungen die du am Dokument vorgenommen hast
- Ergebnis der Loki level-Label Untersuchung
- Alle finalen Entscheidungen die du getroffen hast (mit Begründung)
- Offene Risiken oder Unsicherheiten die du nicht klären konntest
- Report nach: `.technical-manager/inbox/agent-reports/infra-part5-document-review.md`
