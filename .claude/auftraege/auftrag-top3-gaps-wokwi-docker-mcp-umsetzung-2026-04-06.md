# Auftrag: Top-3 Gaps schliessen — Wokwi + Docker + MCP mit Test- und Logpflicht

**Typ:** Umsetzungsauftrag (Analyse + gezielte Umsetzung + Verifikation)  
**Prioritaet:** Kritisch vor naechstem Release-Gate  
**Datum:** 2026-04-06  
**Bereich:** Firmware-Testinfrastruktur / DevOps / CI / MCP  
**Zielbild:** Reproduzierbare SIL-Tests mit Wokwi im Docker-Kontext, saubere agentische Nutzbarkeit (MCP), und belastbares 2-Stufen-Gate (SIL + Hardware-Sanity).

---

## 1) Kontext in Klartext

Das System hat bereits viel Wokwi-Substanz (Szenarien, CI-Jobs, Helper, MCP-Ansatz), aber die Zuverlaessigkeit steht und faellt mit drei Luecken:

1. MQTT-Erreichbarkeit und Routing im Docker-Wokwi-Pfad sind nicht durchgaengig als deterministic contract abgesichert.  
2. Ein Teil der Szenarien/Patterns ist historisch fragil (insb. MQTT-Injection-Pattern und Serial-Wait-Vertraege).  
3. Das Freigabemodell ist noch nicht hart genug: Wokwi-SIL alleine reicht nicht, Hardware-Sanity muss als Pflicht-Gate operationalisiert werden.

Diese drei Luecken werden hier als Top-3 Gaps mit direkter Umsetzung geschlossen.

---

## 2) Top-3 Gaps (Priorisierung)

## Gap 1 (P0): Docker-MQTT-Transport ist nicht als harter, reproduzierbarer Contract abgesichert

**Risiko:** Szenarien laufen "mal gruen, mal rot", weil Netzwerk-/Host-Aufloesung implizit bleibt.  
**Auswirkung:** False negatives/positives im CI-Gate, hohe Diagnosekosten.

## Gap 2 (P0): Szenario-Vertraege sind nicht vollstaendig normiert (Injection + Serial + Timing)

**Risiko:** Instabile Tests durch ungueltige oder fragile Pattern (z. B. MQTT als `set-control`-Annahme).  
**Auswirkung:** Testmasse vorhanden, aber begrenzte Aussagekraft.

## Gap 3 (P1): Release-Gate ist nicht als SIL+Hardware-Doppelabsicherung formal erzwungen

**Risiko:** Regressionsfreiheit in Simulation, aber Fehler auf realer Hardware.  
**Auswirkung:** Feldrisiko trotz gruener Pipeline.

---

## 3) Umsetzungsauftrag je Gap (mit Testpflicht)

## Arbeitspaket A — Gap 1 schliessen: Docker↔Wokwi↔MQTT Contract hardenen

### A.1 Ziel

Der Weg "simulierter ESP32 in Wokwi -> Broker" muss in lokalem Workflow und CI identisch reproduzierbar sein.

### A.2 Umsetzung

1. Pruefe und vereinheitliche den Wokwi-Network-Pfad fuer alle relevanten Testwege:
   - lokale Runs,
   - Docker-Runs,
   - CI-Runs.
2. Definiere den verbindlichen MQTT-Routing-Contract:
   - Hostname/Endpoint,
   - erforderliche Docker-Host-Aufloesung,
   - notwendige Compose-Parameter.
3. Entferne implizite Pfade/Abhaengigkeiten, die nur "zufaellig" funktionieren.
4. Stelle sicher, dass Token/Secrets nur ueber Env kommen (kein Hardcoding).

### A.3 Testpflicht (direkt nach A.2)

Fuehre diese Verifikation zwingend aus:

1. **Smoke Connectivity Test**  
   - Wokwi-Run startet erfolgreich.  
   - MQTT-Verbindung wird im Serial-Log eindeutig sichtbar.
2. **Injection Roundtrip Test**  
   - Externe MQTT-Injection wird empfangen.  
   - Reaktion erscheint im Serial-Log.
3. **Stabilitaetstest (3 Wiederholungen)**  
   - gleicher Test 3x hintereinander ohne sporadisches Scheitern.

### A.4 Logpflicht

Speichere alle Laeufe unter:

- `logs/wokwi/serial/gap1/`
- `logs/wokwi/mqtt/gap1/`
- `logs/wokwi/reports/gap1/`

Pflichtinhalt pro Lauf:

- Startzeit, Commit/Branch, Szenario-Name
- Exit-Code
- zentrale Serial-Signaturen:
  - Boot abgeschlossen
  - MQTT verbunden
  - Injection empfangen/verarbeitet

### A.5 Abnahme fuer Paket A

Paket A ist nur abgeschlossen, wenn:

1. 3/3 Wiederholungen stabil gruen sind,  
2. die Logs die erwarteten Signaturen enthalten,  
3. der Contract im Repo als klare, kurze Betriebsregel dokumentiert ist.

---

## Arbeitspaket B — Gap 2 schliessen: Szenario-Qualitaet normieren

### B.1 Ziel

Alle kritischen Szenarien folgen einem konsistenten, validen Testpattern:

- MQTT-Injection extern,
- YAML passiv (`wait-serial`/`delay`),
- klare Serial-Vertraege,
- keine nicht-existenten Parts/Controls.

### B.2 Umsetzung

1. Fuehre einen gezielten Audit ueber alle prioritaetsrelevanten Wokwi-Szenarien durch.
2. Markiere und behebe:
   - ungueltige `set-control`-Annahmen fuer MQTT,
   - fragile `wait-serial`-Strings,
   - unklare Timing-/Race-Stellen.
3. Standardisiere ein verbindliches Szenario-Grundmuster (Template):
   - Start,
   - Wartefenster,
   - externe Injection,
   - Serial-Pruefsequenz,
   - klares Timeout-Verhalten.
4. Harmonisiere CI-Job-Logik auf dieses Muster.

### B.3 Testpflicht (direkt nach B.2)

1. **Representative Suite** aus mindestens:
   - 1 Boot-Szenario,
   - 1 Sensor-/Config-Szenario,
   - 1 Error-Injection-Szenario,
   - 1 Last-/Stabilitaetsszenario.
2. Jede Gruppe mindestens 2x wiederholen.
3. CI-Nachweis:
   - manueller Trigger,
   - Ergebniszusammenfassung,
   - keine stillen Skips.

### B.4 Logpflicht

Speichere unter:

- `logs/wokwi/serial/gap2/`
- `logs/wokwi/reports/gap2/`
- `logs/wokwi/error-injection/gap2/`

Pflicht pro Szenario:

- verwendetes Pattern (Template-Version),
- zentrale Serial-Waits + Trefferzeit,
- Fehlerfall bei Timeout inkl. klarer Ursache.

### B.5 Abnahme fuer Paket B

Paket B ist nur abgeschlossen, wenn:

1. representative Suite lokal stabil laeuft,  
2. gleicher Kernpfad in CI gruen ist,  
3. kein prioritaeres Szenario mehr ungultige MQTT-`set-control`-Logik enthaelt.

---

## Arbeitspaket C — Gap 3 schliessen: Release-Gate auf SIL+Hardware verhaerten

### C.1 Ziel

Ein verbindliches Doppel-Gate:

1. **SIL-Gate (Wokwi)** fuer schnelle Regression,  
2. **Hardware-Sanity-Gate** fuer reale Verifikation vor Release.

### C.2 Umsetzung

1. Definiere den minimalen SIL-Pflichtsatz (schnell + aussagekraeftig).  
2. Definiere den minimalen Hardware-Pflichtsatz (kurz, aber realitaetskritisch):
   - Sensor-Read live,
   - MQTT roundtrip,
   - mindestens ein Aktor-/Safety-Pfad.
3. Definiere eindeutige Gate-Regeln:
   - wann blockierend,
   - wann nightly/informativ,
   - was als Fail gilt.
4. MCP-Nutzung operationalisieren:
   - MCP optional fuer Diagnose/Agenten,
   - Gate darf nicht daran scheitern, dass MCP experimentell ist.

### C.3 Testpflicht (direkt nach C.2)

1. **Simulierter End-to-End Probelauf**:
   - SIL-Gate komplett,
   - danach Hardware-Sanity.
2. **Evidenzpruefung**:
   - fuer beide Gates liegen Logs/Artefakte vor.
3. **Fail-Simulation**:
   - ein absichtlicher Fehler muss Gate blockieren und im Report sichtbar sein.

### C.4 Logpflicht

Speichere unter:

- `logs/wokwi/reports/gap3/` (SIL)
- `logs/current/hardware/gap3/` (Hardware)
- `.claude/reports/current/` (Gate-Zusammenfassung)

Pflichtreport:

- `wokwi-hardware-release-gate-verifikation-2026-04-06.md`

Mit:

- SIL-Status,
- Hardware-Status,
- Blocker-Liste,
- Freigabeempfehlung (JA/NEIN + Bedingungen).

### C.5 Abnahme fuer Paket C

Paket C ist nur abgeschlossen, wenn:

1. Gate-Regeln schriftlich fixiert sind,  
2. ein kompletter Probelauf dokumentiert ist,  
3. ein erzwungener Fehler das Gate tatsaechlich blockiert.

---

## 4) Ausfuehrungsreihenfolge (verbindlich)

1. Paket A (Gap 1)  
2. Paket B (Gap 2)  
3. Paket C (Gap 3)

**Regel:** Kein Start des naechsten Pakets ohne dokumentierte Abnahme des vorherigen.

---

## 5) Zwingende Ergebnisdateien

Erzeuge am Ende mindestens diese Dateien:

1. `.claude/reports/current/gap1-mqtt-docker-contract-verifikation-2026-04-06.md`
2. `.claude/reports/current/gap2-szenario-normierung-verifikation-2026-04-06.md`
3. `.claude/reports/current/gap3-sil-hardware-gate-verifikation-2026-04-06.md`
4. `.claude/reports/current/top3-gaps-abschlussbericht-2026-04-06.md`

Der Abschlussbericht muss enthalten:

- erledigt/offen je Gap,
- harte Restblocker,
- konkrete naechste 3 Umsetzungsaufgaben (falls offen).

---

## 6) Definition of Done (gesamt)

Der Gesamtauftrag ist nur dann fertig, wenn:

1. alle drei Gap-Pakete abgearbeitet sind,  
2. alle Test- und Logpflichten nachweislich erfuellt sind,  
3. die vier Ergebnisdateien vorhanden und aussagekraeftig sind,  
4. eine klare Betriebsentscheidung vorliegt:
   - **Gate release-ready** oder
   - **nicht release-ready** mit priorisierten Restblockern.

---

## 7) Nicht-Ziele (wichtig)

1. Keine grossen Feature-Umbauten ausserhalb Wokwi/Docker/MCP/Gate.  
2. Kein "alles neu bauen". Bestehende Struktur gezielt haerten.  
3. Keine kosmetischen Aenderungen ohne Beitrag zur Teststabilitaet.

---

## 8) Erwartete Endaussage

Am Ende muss glasklar beantwortet sein:

1. Funktioniert Wokwi-in-Docker fuer euren Alltag belastbar?  
2. Ist MCP sinnvoll nutzbar, ohne Gate-Risiko zu erhoehen?  
3. Ist die Kombination SIL + Hardware-Sanity jetzt robust genug fuer Releases?

