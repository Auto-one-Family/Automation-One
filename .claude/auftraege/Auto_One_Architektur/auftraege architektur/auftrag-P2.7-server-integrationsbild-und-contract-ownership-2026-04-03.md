# Auftrag P2.7: Server-Integrationsbild und Contract-Ownership (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-10h  
**Abhaengigkeit:** P2.1 bis P2.6 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der Agent hat keinen Zugriff auf das Life-Repo.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

---

## Systemwissen fuer diesen Auftrag

P2.7 ist der Abschluss von Paket 2. Ergebnis muss ein verbindliches Integrationsbild sein:

1. Klare Server-Grenzen zu Firmware, Datenbank und Frontend.
2. Klare Ownership aller relevanten Contracts.
3. Klare Bewertung stabiler vs fragiler E2E-Ketten.
4. Klare Hand-off-Aufgaben fuer nachgelagerte Pakete.

Contract-Ownership muss mindestens fuer diese Vertragstypen explizit gesetzt werden:

- API Contracts,
- MQTT Topic/Payload Contracts,
- Event/Queue Contracts,
- Status-/ACK-/Error-Code Contracts.

---

## Ziel

Erstelle ein serverzentriertes Integrationsmodell, das Verantwortungen, Autoritaetsregeln und Risiken ueber alle Systemgrenzen hinweg eindeutig macht.

---

## Pflichtvorgehen (detailliert)

### Block A - Integrationsgrenzen

1. Definiere Boundary je Nachbarsystem:
   - Server <-> Firmware,
   - Server <-> Datenbank,
   - Server <-> Frontend.
2. Dokumentiere je Boundary:
   - Datenarten,
   - Richtung,
   - Protokoll,
   - Autoritaet/Owner.

### Block B - End-to-End-Ketten

Analysiere mindestens diese Ketten:

1. Sensorwert entsteht -> landet im Monitoring.
2. User sendet Command -> Aktoraktion -> Rueckmeldung.
3. Regel feuert serverseitig -> Action wird dispatcht -> Status wird sichtbar.
4. Offline/Recovery: Reconnect -> Reconciliation -> konsistenter Endzustand.

Pro Kette dokumentieren:

- Ketten-ID (z. B. `SRV-E2E-001`),
- Teilschritte,
- Contract pro Schritt,
- Fehlerstellen,
- Beobachtbarkeit.

### Block C - Autoritaetsmodell

1. Lege verbindlich fest, welche Quelle bei Konflikt "gewinnt":
   - Statusquelle,
   - ACK-Autoritaet,
   - Error-Code-Autoritaet,
   - finaler Ausfuehrungszustand.
2. Dokumentiere Konfliktszenarien und Entscheidungsregel.

### Block D - Fragilitaetsanalyse und Hand-off

1. Bewerte je Schnittstelle:
   - stabil,
   - stabil aber degradierbar,
   - fragil.
2. Priorisiere Risiken nach Impact x Eintritt.
3. Leite konkrete Folgeaufgaben fuer Paket 3 (DB), Paket 4 (Frontend), Paket 5 (Gesamtintegration) ab.

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-07-server-integrationsbild-und-contract-ownership.md`

Pflichtstruktur:

1. Integrations-Scope und Boundary-Modell
2. Contract-Ownership-Matrix
3. End-to-End-Katalog (mind. 4 Kernketten)
4. Autoritaetsregeln bei Konflikt
5. Fragilitaetsanalyse (Top 10 Risiken)
6. Priorisierte Hand-off-Liste fuer Paket 3/4/5
7. Verifikationsplan (wie jede Kernaussage getestet werden kann)

---

## Akzeptanzkriterien

- [ ] Ownership pro kritischem Contract ist eindeutig benannt
- [ ] Kern-E2E-Ketten sind vollstaendig und widerspruchsfrei beschrieben
- [ ] Autoritaetsregeln fuer Status/ACK/Error sind explizit und testbar
- [ ] Risiken sind priorisiert und mit Folgeaufgaben verknuepft
- [ ] Ergebnis ist ohne externe Kontextdatei voll verstaendlich
