# Auftrag 4.1: pgAdmin DevTools – Analyse, Verifikation & Implementierungsplan
Datum: 2026-02-09
Typ: Analyse → Verify → Plan (ein Durchgang)
Priorität: 3 von 4 (unabhängig von Phase 3)

## Context

Erstanalyse abgeschlossen (Report: `pgadmin-integration-analysis.md`). Vollständige Spezifikation liegt vor. Dieser Auftrag verifiziert die Spezifikation gegen den aktuellen Stand und erstellt den finalen Implementierungsplan.

Bekannte Facts aus dem Report:
- `servers.json` verifiziert, nur `PassFile`-Zeile entfernen
- `.env.example` hat KEINE pgAdmin-Variablen (TM-Annahme war falsch)
- Korrekte Variablennamen: `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`
- Image: `dpage/pgadmin4:9.3`, Port 5050:80, Profile: `devtools`
- Healthcheck: `wget --spider http://localhost:80/misc/ping`
- 4 Makefile-Targets im monitoring-Pattern
- Volume: `automationone-pgadmin-data`

Offene Punkte aus TM-Review:
- Image-Version 9.3: Ist das aktuell? Auf Docker Hub prüfen
- Healthcheck-Pfad `/misc/ping`: Stimmt das für pgAdmin 4 v9.x?
- docker-compose.yml Platzierung: Exakte Zeilennummer bestätigen
- Makefile: Exakte Position der neuen Targets und .PHONY-Ergänzung

## Aufgabe

Drei Phasen in einem Durchgang:

### Phase A: Spezifikation verifizieren

1. Prüfe `docker/pgadmin/servers.json` – aktueller Inhalt, bestätige dass nur PassFile entfernt werden muss
2. Prüfe `.env.example` – bestätige dass KEINE pgAdmin-Variablen vorhanden sind
3. Prüfe `docker-compose.yml` – exakte Zeilennummer wo der pgadmin-Block eingefügt wird. Nach welchem Service? Vor der volumes-Sektion?
4. Prüfe `docker-compose.yml` volumes-Sektion – exakte Zeilennummer für neues Volume
5. Prüfe `Makefile` – bestehende Targets, Pattern, .PHONY-Zeile, Help-Sektion. Exakte Zeilennummern für Einfügung
6. Prüfe ob Profile `devtools` irgendwo anders referenziert wird (docker-compose.ci.yml, docker-compose.e2e.yml hatten Kommentare)

### Phase B: Image und Healthcheck validieren

1. Ist `dpage/pgadmin4:9.3` das richtige Tag? Oder ist es `8.x`? Prüfe was aktuell stabil und verfügbar ist
2. Healthcheck-Pfad `/misc/ping` – ist das der korrekte Endpoint für die gewählte Version?
3. Interner Port 80 – bestätigen dass pgAdmin darauf lauscht (nicht 5050 oder anderer Port)

### Phase C: Implementierungsplan erstellen

Erstelle einen exakten, zeilenweisen Plan:
1. `servers.json`: Exakte Änderung (diff-Format)
2. `.env.example`: Exakter neuer Block mit Zeilennummer
3. `docker-compose.yml`: Exakter Service-Block mit Zeilennummer
4. `docker-compose.yml`: Volume-Ergänzung mit Zeilennummer
5. `Makefile`: Exakte neue Targets mit Zeilennummern
6. Reihenfolge der Implementierungsschritte
7. Verifikations-Commands nach Implementation

Der Plan muss so präzise sein, dass ein Dev-Agent ihn ohne Rückfragen umsetzen kann.

## Agents (der Reihe nach)

/system-control
Vollanalyse und Planentwicklung. Du hast Zugriff auf alle relevanten Dateien. Prüfe jeden Punkt der Spezifikation gegen den echten Dateiinhalt. Erstelle den finalen Implementierungsplan mit exakten Zeilennummern und diff-Blöcken.

## Erfolgskriterium

Report enthält:
- Bestätigung oder Korrektur jedes Punkts der Erstanalyse
- Verifizierte Image-Version und Healthcheck-Pfad
- Vollständiger Implementierungsplan mit Zeilennummern für alle 5 Dateien
- Verifikations-Checkliste (make devtools-up, Browser-Check, DB-Connection)

## Report zurück an
.technical-manager/inbox/agent-reports/pgadmin-impl-plan.md
