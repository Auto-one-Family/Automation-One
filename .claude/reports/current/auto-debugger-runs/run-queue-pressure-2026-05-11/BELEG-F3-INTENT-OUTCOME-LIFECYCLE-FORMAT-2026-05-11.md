# BELEG F3 — Server: intent_outcome/lifecycle-Payload fehlendes event_type-Feld

**Run-ID:** run-queue-pressure-2026-05-11
**Datum:** 2026-05-11
**Finding-ID:** F3-INTENT-OUTCOME-LIFECYCLE-FORMAT
**Kategorie:** inconsistency
**Schicht:** Server (El Servador) / Firmware (El Trabajante)

---

## Symptom (Server-Log)

```
Dropping malformed intent_outcome/lifecycle payload … Missing event_type
intent_outcome missing intent_id normalized
```

Das ist ein anderes Feld als das in AUT-304 und AUT-329 dokumentierte fehlende `outcome`-Feld.
Hier fehlt `event_type` im lifecycle-Subpfad.

---

## Abgrenzung zu bestehenden Issues

- **AUT-304** (fehlendes `outcome`-Feld, In Review): Betrifft `intent_outcome`-Hauptpfad
  ohne `outcome`-Schlüssel. Fix in Arbeit.
- **AUT-329** (intent_outcome Ordering-Race, Backlog): Betrifft Reihenfolge
  accepted/applied/failed — nicht das `event_type`-Feld.

**Dieses Finding:** Der lifecycle-Subpfad (`system/intent_outcome/lifecycle`)
sendet Payloads ohne `event_type`. Server droppt sie ("Missing event_type").
Das ist ein separates Protokoll-Inkonsistenz-Problem auf dem lifecycle-Pfad.

---

## Kausalkette

1. Core-1 Safety-Task publiziert Intent-Lifecycle-Stufen auf `.../system/intent_outcome/lifecycle`
2. Server-Handler erwartet Pflichtfeld `event_type` im Payload
3. Firmware sendet Payload ohne dieses Feld (oder mit anderem Feldnamen)
4. Server loggt "Dropping malformed" — Frontend sieht keine Lifecycle-Updates

---

## Kanonische Codepfade (Server)

- Server-Handler für lifecycle: vermutlich `intent_outcome_handler.py` (analog zum
  Haupt-intent_outcome-Handler)
- Zu verifizieren: Pflichtfelder für lifecycle-Subpfad vs. was Firmware aktuell sendet

---

## Offene Fragen (TM-Entscheidungs-Block)

1. Welches Feld sendet die Firmware als Lifecycle-Stage-Identifier? `stage`? `lifecycle_event`?
   Server-Parser muss entsprechend angepasst oder Firmware-Payload normiert werden.
2. Ist der lifecycle-Pfad aktiv in Produktion genutzt oder optional/Debug-only?
   Falls optional: Low-Priority-Fix. Falls aktiv für UI-Finalität: High-Priority.
3. Kann AUT-304 auf diesen Subpfad erweitert werden, oder ist ein separates Issue sachlich besser?

---

## Empfehlung

Da AUT-304 bereits in Review ist und `outcome`-Feld betrifft, ist ein separates Issue
für `event_type` im lifecycle-Subpfad sachlich besser. Kann aber nach AUT-304-Merge
eingearbeitet werden (gleiche Dateien, gleiche Schicht).
