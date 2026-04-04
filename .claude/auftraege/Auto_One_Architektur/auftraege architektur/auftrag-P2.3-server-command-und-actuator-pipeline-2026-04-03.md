# Auftrag P2.3: Server Command- und Actuator-Pipeline (selbsttragend)

**Ziel-System:** Auto-one Backend "El Servador"  
**Typ:** Reine Analyse (kein Code-Aendern)  
**Prioritaet:** CRITICAL  
**Datum:** 2026-04-03  
**Geschaetzter Aufwand:** ~6-9h  
**Abhaengigkeit:** P2.1 und P2.2 abgeschlossen

---

## Verbindlicher Arbeits- und Ablagekontext

Der Agent hat keinen Zugriff auf das Life-Repo. Alle noetigen Informationen sind in diesem Auftrag enthalten.

- Arbeitswurzel: `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one`
- Ausgabeordner:
  `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server`

---

## Systemwissen fuer diesen Auftrag

Die Command-Pipeline ist sicherheitskritisch. Sie bestimmt, ob ein angeforderter Aktor-Befehl korrekt, idempotent und nachvollziehbar ausgefuehrt wird.

Die Analyse muss den gesamten Lifecycle sichtbar machen:

`Ausloeser -> Command-Erzeugung -> Safety-Gate -> Dispatch -> ACK/NACK -> terminaler Zustand`

Terminale Zustaende muessen mindestens modelliert werden als:

- `CONFIRMED`
- `REJECTED`
- `TIMED_OUT`
- `ROLLED_BACK`

---

## Ziel

Erstelle ein eindeutiges Command-State- und Contract-Bild, inklusive Idempotenz, Reconciliation und Failure-Pfaden bei Teilausfall.

---

## Pflichtvorgehen (detailliert)

### Block A - Einstiegspunkte und Command-Klassen

1. Erfasse alle produktiven Command-Einstiege:
   - API-getriggerte Commands,
   - UI-getriggerte Commands,
   - Rule-/Automation-getriggerte Commands.
2. Klassifiziere Commands:
   - normal,
   - kritisch/safety-relevant,
   - emergency.

### Block B - Lifecycle-Analyse je Command-Klasse

Dokumentiere je Klasse:

1. Generierung und Vorvalidierung.
2. Safety-Pruefung (Guards, Hard-Limits, Policy-Checks).
3. Dispatch-Semantik (Queue, Topic, HTTP, Sync/Async).
4. ACK/NACK-Korrelation (correlation_id, command_id, request_id).
5. Transition-Regeln zwischen Pending/Confirmed/Rejected/Timeout/Rollback.

### Block C - Idempotenz, Retry und Reconciliation

1. Definiere Idempotenzschluessel und Duplicate-Regeln.
2. Pruefe Retry-Strategien (backoff, max attempts, stop conditions).
3. Dokumentiere Reconciliation:
   - was passiert bei verlorenen ACKs,
   - was passiert bei spaeten ACKs,
   - wie wird finaler Zustand erzwungen.

### Block D - Fehlerbilder und Risiken

1. Analysiere mindestens:
   - `ACK_LOST`,
   - `ACK_DELAYED`,
   - `DISPATCH_FAIL`,
   - `SAFETY_REJECT`,
   - `DUPLICATE_COMMAND`,
   - `OUT_OF_ORDER_CONFIRMATION`.
2. Pro Fehlerbild:
   - Detection,
   - sichtbares Symptom,
   - technische Ursache,
   - Gegenmassnahme.

---

## Verbindliche Ausgabe

Erstelle exakt diese Datei:

`C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\arbeitsbereiche\automation-one\architektur-autoone\Server\paket-03-server-command-und-actuator-pipeline.md`

Pflichtstruktur:

1. Scope und Command-Typen
2. Command-Lifecycle-State-Machine
3. Contract-Matrix fuer Dispatch + ACK/NACK
4. Idempotenz- und Duplicate-Strategie
5. Retry-/Timeout-/Reconciliation-Regeln
6. Failure- und Inkonsistenzrisiken (Top 10)
7. Hand-off in P2.5/P2.6/P2.7

---

## Akzeptanzkriterien

- [ ] Lifecycle-Modell ist eindeutig und fuer alle Command-Klassen abgedeckt
- [ ] ACK/NACK-Semantik und Autoritaet sind klar definiert
- [ ] Idempotenzregeln sind technisch pruefbar beschrieben
- [ ] Retry/Timeout/Reconciliation ist fuer Teilausfallfaelle konsistent
- [ ] Ergebnis ist ohne externe Kontextdatei voll verstaendlich
