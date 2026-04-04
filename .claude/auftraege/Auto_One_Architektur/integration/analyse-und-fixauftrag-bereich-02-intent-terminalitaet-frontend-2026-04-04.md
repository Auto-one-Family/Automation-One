# Analyse- und Fixauftrag Bereich 02: Deterministische Intent-Terminalitaet im Frontend

**Stand:** 2026-04-04  
**Prioritaet:** P0  
**Ziel:** Jeder ausgeloeste Intent endet sichtbar, eindeutig und reproduzierbar in genau einem terminalen Zustand.

---

## 1) Problemmechanik (fachlich erklaert)

Asynchrone Steuerungen liefern ihre Wahrheit zeitversetzt.  
Wenn die Bedienoberflaeche Endzustaende aus Timeouts, Polling oder indirekten Signalen erratet, entstehen Fehlinterpretationen:

- Ein bereits fehlgeschlagener Intent wirkt weiter "pending".
- Ein verzoegerter Erfolg wird als Fehler eingestuft.
- Doppelte Events loesen Mehrfachzustandswechsel aus.

In verteilten Systemen darf die UI finale Zustande nicht raten, sondern muss sie aus terminalen Outcome-Ereignissen ableiten.

---

## 2) Sollbild

Pro Intent gilt:

1. eindeutige Korrelation (`intent_id`/`correlation_id`),
2. genau ein finaler Status (`success`, `failed`, `rejected`, `expired`, `dropped`),
3. idempotente Verarbeitung doppelter terminaler Events,
4. klare Sichtbarkeit von Ursache und naechster Aktion.

UI-Heuristiken duerfen nur waehrend `pending` helfen, niemals terminale Outcomes ueberschreiben.

---

## 3) Pflichtanalyse

1. Erfasse den End-to-End-Lebenszyklus eines Intents:
   - Erzeugung,
   - Dispatch,
   - Ergebnisuebermittlung,
   - Finaldarstellung.
2. Identifiziere alle Stellen, an denen derzeit ohne terminales Outcome final entschieden wird.
3. Pruefe Korrelationstreue:
   - fehlen IDs?
   - werden IDs recycelt?
   - konkurrieren mehrere offene Intents mit gleicher Semantik?
4. Pruefe Duplikatverhalten:
   - gleiches terminales Event mehrfach,
   - spaeteres non-terminales Event nach terminalem Abschluss.

---

## 4) Fixauftrag

## F1 - Outcome-zentrierte Statusmaschine

- Fuehre eine explizite Intent-Statusmaschine ein:
  `created -> pending -> terminal`.
- Terminale Zustaende sind nur ueber terminale Outcome-Ereignisse erreichbar.
- Nach Terminalitaet sind weitere Statuswechsel gesperrt (idempotente Endlage).

## F2 - Korrelation verhaerten

- Jede UI-Aktion erzeugt eine eindeutige Korrelation.
- Ergebnisereignisse ohne Korrelation werden nicht still verworfen, sondern als Vertragsabweichung markiert.

## F3 - Sichtbarkeit im Operations-UI

- Zeige je Intent:
  - finalen Status,
  - Fehler-/Outcome-Code,
  - Klartextursache,
  - Zeit bis Abschluss.
- Trenne terminal und non-terminal visuell eindeutig.

## F4 - Heuristikgrenzen

- Timeouts duerfen nur "verzoegert" markieren, nicht "fehlgeschlagen", solange kein terminales Failure-Outcome vorliegt.

---

## 5) Testmatrix

1. **T1 Normaler Erfolgspfad**  
   Intent geht von pending sauber in success.

2. **T2 Terminaler Fehlerpfad**  
   Intent wird mit Fehlercode beendet, UI zeigt Ursache korrekt.

3. **T3 Duplikat terminales Event**  
   Zweites identisches Terminalevent aendert Zustand nicht.

4. **T4 Spaeteres non-terminales Event nach Terminalitaet**  
   Ignoriert ohne Zustandskorruption.

5. **T5 Timeout ohne Terminalevent**  
   UI markiert verzoegert, aber nicht falsch terminal.

---

## 6) Abnahmekriterien

- [ ] Jeder Intent erreicht genau einen terminalen Zustand.
- [ ] Kein Intent bleibt unbegrenzt ohne Abschlusssicht.
- [ ] Doppelte terminale Events erzeugen keine doppelte Finalisierung.
- [ ] UI-Endstatus basiert auf Outcomes, nicht auf Heuristikannahmen.
- [ ] Fuer jeden terminalen Fehler ist Ursache + Handlungsvorschlag sichtbar.

Wenn die UI einen Intent ohne terminales Outcome als "failed" finalisiert, gilt der Auftrag als nicht bestanden.

