# Auftrag P2.2: Server Device- und Sensor-Ingestion-Pipeline (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-9h  
**Abhaengigkeit:** P2.1 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der bearbeitende Agent hat keinen Zugriff auf das Life-Repo. Deshalb ist dieser Auftrag absichtlich vollstaendig formuliert.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

Nutze ausschliesslich den Auto-one-Code als Faktenbasis.

---

## Systemwissen fuer diesen Auftrag

Ingestion bedeutet hier End-to-End:

`Eingang (MQTT/HTTP) -> Parse -> Validation -> Normalisierung -> fachliche Verarbeitung -> Persistenz -> Weitergabe (Event/API/Realtime)`

Du sollst pro Stufe explizit klaeren:

1. Welche Datenform erwartet wird.
2. Welche Guards/Checks gelten.
3. Wie Fehler klassifiziert und behandelt werden.
4. Ob Daten verloren gehen koennen.
5. Wie Wiederanlauf/Recovery funktioniert.

---

## Ziel

Dokumentiere die gesamte Device- und Sensor-Ingestion so, dass Datenfluss, Contracts und Failure-Verhalten ohne implizites Wissen nachvollziehbar sind.

---

## Pflichtvorgehen (detailliert)

### Block A - Eingangspfade identifizieren

1. Finde alle produktiven Ingestion-Eingangspunkte:
   - MQTT-Subscriptions,
   - HTTP-Endpoints,
   - interne Event-Intakes (falls vorhanden).
2. Vergib Flow-IDs (z. B. `SRV-ING-FLOW-001`).

### Block B - Stufenmodell je Eingangspfad

Dokumentiere pro Flow:

1. Entry Contract (Schema, Pflichtfelder, optionale Felder, Versionierung).
2. Parse- und Validierungsregeln.
3. Normalisierung und Unit-Konvertierungen.
4. Fachliche Verarbeitung (welcher Service, welche Business-Regel).
5. Persistenzziele (Tabellen/Stores/Cache) inklusive Write-Timing.
6. Folgeausgaben (Events, API-Sichtbarkeit, Realtime-Signale).

### Block C - Fehler- und Recovery-Verhalten

1. Fehlerklassen definieren:
   - `PARSE_FAIL`,
   - `SCHEMA_INVALID`,
   - `SEMANTIC_INVALID`,
   - `TIMEOUT`,
   - `BACKPRESSURE_DROP`,
   - `DEPENDENCY_DOWN`.
2. Pro Fehlerklasse:
   - Detection,
   - Logging/Metrik,
   - Retry/NACK/Drop-Policy,
   - Endzustand,
   - Recovery-Pfad.

### Block D - Contract-Stabilitaet

1. Pruefe Rueckwaertskompatibilitaet:
   - tolerierte Zusatzfelder,
   - Defaulting bei fehlenden Feldern,
   - Version-Gates.
2. Markiere drift-gefaehrdete Stellen (Firmware sendet X, Server erwartet Y).

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-02-server-device-und-sensor-ingestion-pipeline.md`

Pflichtstruktur:

1. Scope + Begriffsdefinitionen
2. Ingestion-Flow-Inventar
3. Detaillierte Flow-Steckbriefe
4. Contract-Matrix
5. Fehler-/Recovery-Matrix
6. Datenverlust- und Drift-Risiken (Top 10)
7. Hand-off in P2.3/P2.5/P2.7

---

## Akzeptanzkriterien

- [ ] Alle produktiven Eingangspfade sind als E2E-Flows dokumentiert
- [ ] Pro Flow sind Schema, Guards, Persistenz und Ausgaenge nachvollziehbar
- [ ] Fehlerklassen und Recovery sind reproduzierbar beschrieben
- [ ] Rueckwaertskompatibilitaet und Drift-Risiken sind explizit bewertet
- [ ] Ergebnis ist ohne externe Kontextdatei verstaendlich
