# Auftrag: Vollanalyse Wokwi-in-Docker + MCP + MQTT-Testfaehigkeit

**Typ:** Reiner Analyseauftrag (kein produktiver Code-Umbau in diesem Auftrag)  
**Prioritaet:** Hoch  
**Datum:** 2026-04-06  
**Ziel:** Vollstaendiges, belastbares IST-Bild fuer Wokwi-Simulation im Docker-Stack inklusive MCP-Nutzung; klare Gap-Liste mit konkretem Umsetzungsplan.

---

## 1) Auftrag in einem Satz

Analysiere das gesamte Wokwi-Setup im Auto-One-Repo so tief, dass nach Abschluss eindeutig klar ist:

1. was heute bereits stabil funktioniert,  
2. was nur scheinbar funktioniert,  
3. wo technische Luecken liegen,  
4. welche Anpassungen in welcher Reihenfolge noetig sind, damit Wokwi-in-Docker + MCP + MQTT-Tests reproduzierbar und release-tauglich laufen.

---

## 2) Arbeitsmodus und harte Grenzen

1. Dies ist **Analyse**, kein verdeckter Refactor.  
2. Aendere produktive Dateien nur, wenn ein minimaler Analyse-Hilfsfix zwingend noetig ist (z. B. Tippfehler in einem Analyse-Skript).  
3. Kein Scope-Drift auf Frontend/Business-Features.  
4. Fokus ausschliesslich auf:
   - Firmware-Testpfad (Wokwi),
   - Docker-Netzwerk und Broker-Erreichbarkeit,
   - MCP-Anbindung,
   - CI/Local Test-Flow,
   - Sensor-Simulationsgrenzen.
5. Ergebnis muss selbsttragend sein: keine offenen "muessen wir spaeter mal anschauen"-Bloecke ohne konkrete ToDos.

---

## 3) Kernfragen, die beantwortet werden muessen

1. Ist Wokwi fuer eure Firmware-Regression **praktisch belastbar** oder nur Demo?  
2. Kann Wokwi im Docker-Kontext MQTT stabil erreichen (host.wokwi.internal/gateway)?  
3. Ist MCP praktisch nutzbar fuer agentische Testdurchlaeufe oder nur experimenteller Nice-to-have?  
4. Welche Testarten sind in Wokwi valide und welche muessen zwingend auf echter Hardware bleiben?  
5. Reicht der aktuelle Aufbau fuer euren Zweck oder braucht es ein klares 2-Stufen-Gate (SIL + Hardware)?

---

## 4) Analyseumfang (Pflicht)

### A. Tooling und Runtime
- Wokwi CLI Version, Aufrufmuster, Timeouts, Exit-Codes.
- Token-Handling und Secret-Hygiene.
- MCP-Startfaehigkeit (`wokwi-cli mcp`) und praktische Nutzbarkeit.

### B. Docker und Netzwerk
- Compose-Profile, Service-Topologie, `extra_hosts`, Port-Routing.
- Broker-Erreichbarkeit aus dem Wokwi-Kontext.
- Reproduzierbarkeit lokal vs CI.

### C. Szenarien und Testmuster
- Struktur und Abdeckung der Wokwi-Szenarien.
- Anti-Pattern-Erkennung (`part-id: "mqtt"` etc.).
- Korrektes Pattern fuer MQTT-Injection (Background-Run + externes Publish).

### D. Sensorrealitaet vs Simulationsgrenzen
- Welche Sensoren sind nativ simulierbar.
- Welche nicht (insb. SHT31/BMP280/BME280) und Folgen fuer Aussagekraft.
- Konsequenz fuer Teststrategie: was Wokwi leisten kann, was nicht.

### E. CI/CD- und Makefile-Pfad
- Was laeuft aktuell in PR/Push/Nightly.
- Welche Szenarien sind wirklich im automatischen Gate.
- Wo Counter, Jobs oder Flows inkonsistent sind.

---

## 5) Konkreter Ablauf (Schritt-fuer-Schritt)

## Schritt 1: IST-Inventur

Erstelle eine strukturierte Inventur aller relevanten Dateien/Komponenten:

- Wokwi-Konfiguration (`wokwi.toml`, Diagramme, Szenarien, Helper).
- Docker-Bausteine (Compose, Dockerfile fuer Wokwi sofern vorhanden).
- MCP-Konfiguration.
- CI-Workflow fuer Wokwi.
- Makefile-Targets und lokale Runner-Skripte.

Ergebnis: Tabelle "Gefunden / Verwendet / Veraltet / Unklar".

## Schritt 2: Wokwi-CLI + MCP Realitaetscheck

Pruefe:

1. exakte CLI-Version,  
2. ob `wokwi-cli mcp` lokal startbar ist,  
3. ob Token-Setup robust ist (kein Hardcoding),  
4. ob MCP-Konfiguration betriebssicher ist (Pfad, CWD, Env).

Ergebnis: "MCP readiness = Ja/Nein/Teilweise" mit Gruenden.

## Schritt 3: Docker-Netzwerkanalyse fuer MQTT

Pruefe technisch:

1. Weg vom simulierten ESP bis zum Broker,  
2. ob `host.wokwi.internal` im jeweiligen Kontext korrekt aufgeloest wird,  
3. ob `extra_hosts`/Gateway-Abbildung konsistent ist,  
4. ob das in lokalen und CI-nahen Szenarien gleichartig funktioniert.

Ergebnis: Sequenzdiagramm + Fehlerpunkte + notwendige Fixes.

## Schritt 4: Szenario-Qualitaetsanalyse

Pruefe alle Wokwi-Szenarien auf:

- ungueltige Automationsschritte,
- falsche Annahmen ueber MQTT in `set-control`,
- fragile `wait-serial`-Strings,
- Zeit-/Race-Probleme durch unklare Startreihenfolge.

Ergebnis:

- Liste "technisch valide Szenarien",
- Liste "scheinbar vorhanden, aber falsch modelliert",
- priorisierte Reparaturliste.

## Schritt 5: Sensor-Support und Aussagekraft

Bewerte getrennt:

1. Sensoren mit hoher Simulationsaussagekraft,  
2. Sensoren ohne native Unterstuetzung,  
3. Auswirkungen auf eure konkreten AutomationOne-Flows.

Ergebnis: Risiko-Matrix je Sensortyp (`niedrig/mittel/hoch`) inkl. Testempfehlung (SIL vs Hardware).

## Schritt 6: CI- und Release-Gate-Analyse

Pruefe:

- Welche Wokwi-Tests blocken PRs wirklich?
- Welche laufen nur Nightly?
- Wo liegen blinde Flecken?

Ergebnis:

- "Aktuelles Gate ist ausreichend / nicht ausreichend",
- konkret vorgeschlagenes Ziel-Gate.

## Schritt 7: Gap-Matrix und Sollbild

Baue eine Gap-Matrix:

- **IST:** was heute da ist.
- **SOLL:** was fuer belastbare Wokwi-in-Docker+MCP-Faehigkeit noetig ist.
- **Delta:** was fehlt.
- **Aktion:** konkrete Umsetzung.
- **Aufwand:** S/M/L.
- **Risiko bei Nicht-Umsetzung:** niedrig/mittel/hoch.

## Schritt 8: Umsetzungs-Roadmap (Analyse-Ergebnis)

Leite aus der Gap-Matrix eine umsetzbare Reihenfolge ab:

1. Hard-Blocker zuerst,
2. dann Stabilitaetsverbesserungen,
3. dann Komfort-/Skalierungsthemen.

Jedes Paket mit:

- Ziel,
- Dateien,
- Risiken,
- Abnahmekriterium,
- Testnachweis.

---

## 6) Erwartete Deliverables (Pflichtartefakte)

Lege nach Abschluss folgende Artefakte im Repo ab:

1. `.claude/reports/current/wokwi-docker-mcp-ist-stand-analyse-2026-04-06.md`  
   - Vollstaendige Analyse, Ist-Bild, Messergebnisse, Risiken.

2. `.claude/reports/current/wokwi-docker-mcp-gap-matrix-2026-04-06.md`  
   - Gap-Tabelle mit Priorisierung und Aufwand.

3. `.claude/reports/current/wokwi-docker-mcp-umsetzungsfahrplan-2026-04-06.md`  
   - Konkrete Schrittfolge fuer Umsetzung.

4. `.claude/reports/current/wokwi-docker-mcp-teststrategie-sil-vs-hardware-2026-04-06.md`  
   - Klare Trennung: was per Wokwi valide pruefbar ist, was nur auf echter Hardware.

---

## 7) Abnahmekriterien

Der Auftrag gilt erst als fertig, wenn:

1. Das aktuelle Systemverhalten nachvollziehbar dokumentiert ist (nicht nur Vermutungen).  
2. MQTT-Pfad im Wokwi-Kontext technisch schluessig bewertet wurde.  
3. MCP-Nutzbarkeit fuer reale Workflows klar eingeordnet wurde (nicht nur "experimentell").  
4. Simulationsgrenzen je Sensorklasse klar benannt sind.  
5. Eine priorisierte Gap-Liste mit klarer Reihenfolge vorliegt.  
6. Eine umsetzbare Release-Gate-Empfehlung vorliegt (mindestens SIL + Hardware-Sanity).  
7. Die vier Deliverable-Dateien vollstaendig erzeugt wurden.

---

## 8) Erwartetes Abschlussfazit (muss explizit enthalten sein)

Das Abschlussdokument muss eine klare Entscheidungsempfehlung enthalten:

1. **"So wie jetzt reicht"** oder  
2. **"Ergaenzungen sind notwendig"** (mit den 3 wichtigsten sofortigen Schritten) oder  
3. **"Setup derzeit zu fragil fuer Gate-Nutzung"** (mit Blocker-Liste).

Ohne diese Entscheidungsempfehlung ist der Auftrag unvollstaendig.

---

## 9) Qualitaetsanforderung fuer die Analyse

Die Analyse darf keine reinen Tool-Outputs stapeln.  
Sie muss:

- technische Ursachen benennen,
- Auswirkungen auf euren echten Betrieb erklaeren,
- klare, priorisierte Handlungsempfehlungen geben.

Kurz: Kein Datengrab, sondern eine belastbare Entscheidungsgrundlage.

