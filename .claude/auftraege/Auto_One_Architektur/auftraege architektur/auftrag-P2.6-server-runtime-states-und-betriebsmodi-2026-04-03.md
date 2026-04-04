# Auftrag P2.6: Server Runtime States und Betriebsmodi (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** HIGH  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~5-8h  
**Abhaengigkeit:** P2.1 bis P2.5 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der Agent hat keinen Zugriff auf das Life-Repo.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

---

## Systemwissen fuer diesen Auftrag

Runtime-States muessen den realen Betriebszustand beschreiben, nicht nur Health-Endpoint-Antworten.

Mindestens folgende Betriebsmodi erwarten wir als Modell:

1. `COLD_START`
2. `WARMING_UP`
3. `NORMAL_OPERATION`
4. `DEGRADED_OPERATION`
5. `RECOVERY_SYNC`
6. `SHUTDOWN_DRAIN`

Wenn das System andere Namen nutzt, mappe diese sauber auf ein gemeinsames Zustandsmodell.

---

## Ziel

Erstelle eine vollstaendige Runtime-State-Machine fuer den Server inklusive Triggern, Guards, Actions, Service-Lifecycle und Risiken bei Teilwiederanlauf.

---

## Pflichtvorgehen (detailliert)

### Block A - Lifecycle-Aufnahme

1. Dokumentiere Startsequenz:
   - Prozessstart,
   - Dependency-Checks,
   - Worker-/Scheduler-Start,
   - API-Freigabe.
2. Dokumentiere Stop-/Restart-Sequenz:
   - Drain-Verhalten,
   - Pending-Arbeiten,
   - geordneter Shutdown.

### Block B - State-Machine

1. Definiere State-IDs (z. B. `SRV-STATE-001`).
2. Fuer jeden Transition-Pfad erfassen:
   - Event/Trigger,
   - Guard-Bedingung,
   - Action,
   - Next-State.
3. Markiere ungueltige oder gefaehrliche Transitionen.

### Block C - Health, Worker und Background Services

1. Mappe Health-Checks auf Runtime-States.
2. Dokumentiere, welcher Worker-/Job-Zustand welche State-Aussage erlaubt.
3. Definiere wann "teilweise gesund" vorliegt und was dann erlaubt ist.

### Block D - Restart, Rejoin, Resync

1. Dokumentiere Verhalten bei:
   - Cold Start,
   - Prozessrestart,
   - Teilwiederanlauf einzelner Services.
2. Analysiere Inkonsistenzrisiken:
   - stale cache,
   - verpasste Events,
   - doppelte Verarbeitung nach Restart.

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-06-server-runtime-states-und-betriebsmodi.md`

Pflichtstruktur:

1. Scope und Runtime-Begriffe
2. Start-/Stop-Lifecycle
3. Vollstaendige State-Machine
4. Trigger-Guard-Action-Matrix
5. Health/Worker/Background-Service-Mapping
6. Restart-/Resync-Risiken (Top 10)
7. Hand-off in P2.7 und Paket 5 Gesamtintegration

---

## Akzeptanzkriterien

- [ ] State-Machine ist fuer den Gesamtserver konsistent und vollstaendig
- [ ] Trigger/Guard/Action ist pro Transition explizit beschrieben
- [ ] Restart- und Teilwiederanlaufverhalten ist nachvollziehbar modelliert
- [ ] Kritische Uebergangsrisiken sind priorisiert und begruendet
- [ ] Ergebnis ist ohne externe Kontextdatei voll verstaendlich
