# Auftrag: Grafana Template Variables – Analyse & Implementierungsplan
Datum: 2026-02-10 03:30

## Kontext

Das Dashboard `system-health.json` (UID: `automationone-system-health`, Titel: "AutomationOne – Operations") wurde kürzlich komplett neu aufgebaut: 26 Panels in 6 Rows. Es ist provisioniert über `docker/grafana/provisioning/dashboards/dashboards.yml` und wird beim Grafana-Start aus der JSON-Datei geladen.

Aktuell sind alle Queries hardcoded – feste Service-Namen, feste Zeitintervalle, keine dynamischen Filter. Der nächste Schritt ist die Integration von Template Variables, um das Dashboard interaktiv und flexibler nutzbar zu machen.

**Ziel:** Zwei Template Variables einbauen, die dem Benutzer sofortigen Mehrwert geben:
1. `$service` – Service-Filter für Log-Panels (Row 5)
2. `$interval` – Zeitintervall-Wahl für alle rate()-Queries (Row 1-3)

Eine dritte Variable (`$esp_id` für ESP32-Filterung) wird vorbereitet aber NICHT implementiert – nur als dokumentierte Option für späteren Ausbau.

---

## Pflicht-Analyse VOR jeder Änderung

### A. Bestandsaufnahme (NICHTS ändern, nur lesen und dokumentieren)

**A.1 Dashboard-JSON analysieren:**
- `docker/grafana/provisioning/dashboards/system-health.json` komplett lesen
- Dokumentiere: Aktueller `"templating"` Block (vermutlich `{"list": []}`)
- Dokumentiere: schemaVersion, alle Panel-IDs, alle Datasource-Referenzen
- Dokumentiere: Welche Panels nutzen `compose_service=` (hardcoded Service-Name)?
- Dokumentiere: Welche Panels nutzen `rate(...[Xm])` mit festem Intervall?
- Dokumentiere: Welche Panels nutzen `$__rate_interval` (Grafana built-in)?

**A.2 Provisioning-Konfiguration prüfen:**
- `docker/grafana/provisioning/dashboards/dashboards.yml` lesen
- Dokumentiere: `allowUiUpdates`, `disableDeletion`, `updateIntervalSeconds`
- Prüfe: Wird das Dashboard bei jeder Änderung der JSON-Datei automatisch neu geladen?

**A.3 Datasource-UIDs verifizieren:**
- `docker/grafana/provisioning/datasources/datasources.yml` lesen
- Dokumentiere exakte UIDs für Prometheus und Loki
- Diese UIDs werden in den Variable-Definitionen gebraucht

**A.4 Loki-Labels live verifizieren:**
- `curl -s http://localhost:3100/loki/api/v1/labels` ausführen
- `curl -s http://localhost:3100/loki/api/v1/label/compose_service/values` ausführen
- Dokumentiere: Welche Label-Werte existieren tatsächlich?
- WICHTIG: Nur existierende Labels können als Variable-Quelle dienen

**A.5 Prometheus-Metriken prüfen (für $interval-Relevanz):**
- `curl -s http://localhost:9090/api/v1/label/__name__/values` ausführen
- Dokumentiere: Welche Metriken werden mit `rate()` abgefragt?
- Prüfe: Nutzen die Queries bereits `$__rate_interval` oder feste Werte wie `[5m]`?

---

## Implementierungsplan-Anforderungen

Nach Abschluss der Analyse erstellst du einen **Implementierungsplan** (KEIN Code, nur Plan). Der Plan muss folgende Qualitätsanforderungen erfüllen:

### B. Variable `$service` (Log-Filter)

**B.1 Definition klären:**
- Typ: `query` – Loki als Datasource
- Query: `label_values(compose_service)` oder `label_values({__name__=~".+"}, compose_service)` – WAS GENAU FUNKTIONIERT? Teste beide Varianten gegen die Live-Loki-API bevor du eine empfiehlst.
- `includeAll: true` mit "All"-Option
- `multi: false` (Einzelauswahl, nicht Mehrfachauswahl)
- Refresh: `1` (bei Dashboard-Load)
- Default: `"All"` oder `$__all`

**B.2 Betroffene Panels identifizieren:**
- Liste JEDE Panel-ID auf, die `compose_service=` hardcoded nutzt
- Zeige die AKTUELLE Query und die NEUE Query mit `$service`
- Bei `includeAll: true` muss `=~` statt `=` verwendet werden (Grafana erzeugt Regex)
- Prüfe: Macht "All" bei JEDEM betroffenen Panel semantisch Sinn? Log-Panels ja, aber wenn ein Panel nur für einen spezifischen Service gedacht ist (z.B. Server-Response-Time), dann NICHT mit `$service` versehen.

**B.3 Fallstrick-Check:**
- Provisioned Dashboard + Query-Variable: Funktioniert die Query-Variable korrekt wenn die Datasource per UID referenziert wird (nicht per Name)?
- Bekannter Grafana-Bug: `${DS_VARIABLENAME}` Platzhalter funktionieren NICHT bei Provisioning. Nur direkte `{"type": "loki", "uid": "loki"}` Referenzen funktionieren.
- "All"-Wert bei Loki: Generiert Grafana `(service1|service2|...)` Regex? Funktioniert das mit LogQL Stream-Selektoren?

### C. Variable `$interval` (Zeitintervall)

**C.1 Definition klären:**
- Typ: `interval`
- Werte: `1m,5m,15m,30m,1h` (Custom, keine Query nötig)
- Auto-Option: Prüfe ob `auto` sinnvoll ist (Grafana berechnet dann basierend auf Time-Range)
- Default: `5m`

**C.2 Betroffene Panels identifizieren:**
- Liste JEDE Panel-ID auf, die `rate(...[Xm])` mit festem Intervall nutzt
- Zeige die AKTUELLE Query und die NEUE Query mit `$interval`
- ACHTUNG: Wenn Panels bereits `$__rate_interval` nutzen (Grafana built-in), ist `$interval` dort NICHT nötig und könnte sogar kontraproduktiv sein. `$__rate_interval` ist in den meisten Fällen die bessere Wahl für `rate()` weil es automatisch den Scrape-Intervall berücksichtigt.
- Klare Empfehlung: In welchen Panels `$interval`, in welchen `$__rate_interval`, und warum.

**C.3 Semantik prüfen:**
- `rate(metric[$interval])` ändert die Glättung. Kurze Intervalle = rauschiger, lange = glatter.
- Nicht ALLE Panels profitieren davon. Stat-Panels (Row 0) die einen Einzelwert zeigen brauchen kein variables Intervall.
- Nur Timeseries-Panels (Row 1-3) wo der User die Granularität anpassen will.

### D. Variable `$esp_id` (ESP32-Filter – NUR DOKUMENTIEREN)

**D.1 Machbarkeit prüfen:**
- Gibt es ein Prometheus-Label `esp_id` in den existierenden Metriken?
- `curl -s http://localhost:9090/api/v1/label/esp_id/values` ausführen
- Wenn ja: Wie viele verschiedene Werte? Wenn < 3, ist eine Variable aktuell Overengineering.
- Dokumentiere die Variable-Definition die SPÄTER eingebaut werden könnte, aber implementiere sie NICHT.

### E. JSON-Struktur des templating-Blocks

**E.1 Exakte JSON-Struktur dokumentieren:**
- Zeige den KOMPLETTEN `"templating"` Block so wie er in die JSON-Datei muss
- Verwende die exakten Datasource-UIDs aus A.3
- Verwende die exakten Query-Formate die in der Live-Prüfung funktioniert haben
- Setze korrekte Default-Werte (`current`-Objekt)

**E.2 Positionierung im Dashboard-JSON:**
- `"templating"` steht auf Top-Level neben `"panels"`, `"time"`, etc.
- Zeige wo genau der Block eingefügt wird (vor/nach welchem bestehenden Key)

### F. Qualitäts-Checkliste für den Plan

Bevor du den Plan als fertig deklarierst, prüfe:

- [ ] Alle Variable-Definitionen basieren auf LIVE-GETESTETEN Queries, nicht auf Annahmen
- [ ] Alle Datasource-UIDs stimmen mit `datasources.yml` überein
- [ ] Alle betroffenen Panel-IDs stimmen mit der aktuellen `system-health.json` überein
- [ ] Kein Panel wurde vergessen (systematische Prüfung ALLER Panels, nicht nur offensichtlicher)
- [ ] Kein Panel wurde fälschlicherweise einbezogen (semantisch prüfen ob Variable dort sinnvoll)
- [ ] `includeAll` + `=~` Syntax korrekt für LogQL UND PromQL
- [ ] Default-Werte gesetzt (Dashboard zeigt beim ersten Load sinnvolle Daten)
- [ ] Keine Konflikte mit `$__rate_interval` (Grafana built-in)
- [ ] JSON-Syntax valide (keine trailing commas, korrekte Verschachtelung)
- [ ] Provisioning-Kompatibilität bestätigt (keine `${DS_*}` Platzhalter)
- [ ] Refresh-Strategie dokumentiert (wann werden Variable-Werte aktualisiert)

---

## Erfolgskriterium

Der fertige Plan ist ein Dokument das folgendes enthält:

1. **Analyseergebnisse** aus A.1-A.5 (was ist der IST-Zustand, was existiert live)
2. **Exakter JSON-Block** für den `templating`-Abschnitt (copy-paste-ready)
3. **Panel-Änderungsliste** mit ALTER Query → NEUER Query für jedes betroffene Panel
4. **Nicht-betroffene Panels** mit Begründung warum sie NICHT geändert werden
5. **$esp_id Dokumentation** als Zukunfts-Option (nicht zur Implementierung)
6. **Ausgefüllte Qualitäts-Checkliste** (F)

Der Plan muss so präzise sein, dass ein Implementierer die JSON-Datei ändern kann ohne eigene Entscheidungen treffen oder Live-Endpoints abfragen zu müssen. Jede Query, jede UID, jeder Wert muss verifiziert und final sein.

## Was dieser Auftrag NICHT ist

- Kein Implementierungsauftrag. Du änderst KEINE Dateien außer deinem Report.
- Kein Dashboard-Redesign. Die 26 Panels und 6 Rows bleiben exakt wie sie sind.
- Kein Alerting-Auftrag. Alert Rules werden nicht verändert.

## Report zurück an
`.technical-manager/inbox/agent-reports/grafana-template-variables-2026-02-10.md`
