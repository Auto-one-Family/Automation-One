# Auftragsserie: Config-Korrelation Rest-Gaps (A-E)

**Stand:** 2026-04-04  
**Typ:** Serienauftrag (5 gekoppelte Einzelauftraege)  
**Prioritaet:** P0  
**Ziel:** Contract-scharfe, semantisch eindeutige Config-Korrelation ueber Firmware, Server und Frontend.

---

## Hauptauftragsdokument (verbindliche Referenz)

Alle Einzelauftraege dieser Serie sind aus folgendem Hauptdokument abgeleitet und duerfen dessen Invarianten nicht verletzen:

- `/.claude/reports/current/auftragsserie-config-korrelation-restgaps-2026-04-04.md`

---

## Reihenfolge (verbindlich)

1. `analyse-und-fixauftrag-bereich-a-contract-basis-und-korrelationsaxiome-2026-04-04.md`
2. `analyse-und-fixauftrag-bereich-b-frontend-terminalitaet-ohne-fallback-2026-04-04.md`
3. `analyse-und-fixauftrag-bereich-c-server-randhaertung-envelope-trace-callsites-2026-04-04.md`
4. `analyse-und-fixauftrag-bereich-d-firmware-strict-contract-statt-fallback-heilung-2026-04-04.md`
5. `analyse-und-fixauftrag-bereich-e-observability-lexikon-test-ci-governance-2026-04-04.md`

Abhaengigkeit: Jeder Folgebereich baut auf Begriffen/Regeln aus Bereich A auf.

---

## Globale Invarianten der Serie

- `data.correlation_id` ist fachlicher Matching-Schluessel fuer Config-Intents.
- `request_id` ist optionaler Trace-Kontext und niemals Ersatz-Korrelation.
- Keine Schicht darf fehlende Korrelation still "heilen" und als regulaeren Abschluss darstellen.
- Contract-Verletzungen sind first-class Signale (sichtbar, zaehlbar, testbar).
- Operatoren sehen Domain-Fehler und Contract-Fehler klar getrennt.

---

## Wartbarkeit und Zukunftsfaehigkeit (global)

- Contract-first statt Heuristik-first: Typen/Serializer/Mapper zuerst, UI-Fallbacks zuletzt.
- Single-source Semantik: gleiche Felder, gleiche Bedeutung, gleiche Terminalitaet in allen Schichten.
- Erweiterbar ohne Bruch: neue Contract-Codes nur mit Lexikon + Tests + Metriken.
- Fehlertoleranz ohne Semantikverlust: Pipeline darf robust bleiben, Diagnose darf nie verschleiern.

---

## Globales Definition-of-Done

- Kein terminales Config-Matching ohne eindeutige `data.correlation_id`.
- Envelope/Data-Divergenz ist sichtbar und metrisch erfassbar.
- Alle neuen Contract-Codes sind lexikonisiert und CI-abgesichert.
- Frontend finalisiert Config-Intents nicht mehr per "latest pending" Best-Guess.
- Firmware, Server, Frontend zeigen denselben Contract-Fall konsistent.
