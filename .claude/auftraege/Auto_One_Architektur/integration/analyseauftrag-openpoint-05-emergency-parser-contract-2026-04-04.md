# Analyseauftrag Open Point 05: Emergency-Broadcast Parser und Fail-Safe-Vertrag

**Typ:** Eigenstaendiger Analyseauftrag  
**Prioritaet:** P1  
**Ziel:** Notfallsignale robust verarbeiten, auch bei malformed Payloads.

## 1) Problemkern

Wenn Broadcast-Emergency JSON nicht parsebar ist, darf das System nicht in einem unklaren Zustand bleiben.  
Der Notfallpfad braucht harte Vertragsregeln.

## 2) Zielzustand

Emergency-Verarbeitung mit klarer Semantik:

1. Gueltige Payload -> deterministische Notfallaktion.
2. Ungueltige Payload -> definierter Fail-Safe-Zweig.
3. Jeder Reject hat eindeutigen Code und Telemetrie.

## 3) Pflichtanalyse

1. Definiere Pflichtfelder und Typen des Emergency-Contracts.
2. Pruefe Parserverhalten bei:
   - fehlenden Feldern,
   - falschen Typen,
   - unbekannten Werten,
   - teilgueltigen Payloads.
3. Lege Defaultentscheidung bei Parse-Fehlern fest.

## 4) Fixanforderungen

1. Strikter Parser mit valider Fehlerklassifikation.
2. Fail-Safe-Policy fuer malformed emergency messages.
3. Reject-Codes und Counter:
   - `EMERGENCY_PARSE_ERROR`
   - `EMERGENCY_CONTRACT_MISMATCH`
4. Unit-/Integrationstests fuer Edge Cases.

## 5) Abnahmekriterien

- [ ] Kein unklarer Zustand bei Emergency-Parse-Fehlern.
- [ ] Fail-Safe-Verhalten ist explizit, testbar und reproduzierbar.
- [ ] Parser-Fehler sind telemetrisch sichtbar.
- [ ] Gueltige Emergency-Payloads bleiben voll wirksam.

