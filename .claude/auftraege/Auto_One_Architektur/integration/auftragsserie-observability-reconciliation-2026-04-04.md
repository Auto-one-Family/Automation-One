# Auftragsserie: Observability + Reconciliation Contract (vollstaendig)

**Stand:** 2026-04-04  
**Typ:** Serienauftrag (6 vollstaendige Einzelauftraege)  
**Ziel:** Deterministische Endzustaende pro Intent, klare Fehlersemantik, reproduzierbare Recovery und durchgaengige Betriebsbeobachtbarkeit.

---

## Warum diese Serie so geschnitten ist

Ein verteiltes IoT-System scheitert in der Praxis meist nicht an einem einzelnen Modul, sondern an semantischen Bruechen zwischen Firmware, Server und Frontend.  
Diese Serie stabilisiert daher zuerst die gemeinsame Sprache, danach die Endzustands-Sicht, danach Recovery-Lifecycle und Betriebszustaende.

---

## Reihenfolge (verbindlich)

1. `analyse-und-fixauftrag-bereich-01-kanonisches-outcome-lexikon-2026-04-04.md`  
2. `analyse-und-fixauftrag-bereich-02-intent-terminalitaet-frontend-2026-04-04.md`  
3. `analyse-und-fixauftrag-bereich-03-typvertrag-ws-api-2026-04-04.md`  
4. `analyse-und-fixauftrag-bereich-04-device-degraded-first-class-2026-04-04.md`  
5. `analyse-und-fixauftrag-bereich-05-reconciliation-session-domane-2026-04-04.md`  
6. `analyse-und-fixauftrag-bereich-06-firmware-semantik-stale-expiry-2026-04-04.md`

---

## Abhaengigkeiten

- Bereich 01 ist Pflicht vor allen anderen Bereichen (gemeinsame Semantik).
- Bereich 02 und 03 duerfen parallel laufen, sobald Bereich 01 fertig ist.
- Bereich 04 benoetigt Bereich 01 und 03.
- Bereich 05 benoetigt Bereich 01 bis 04.
- Bereich 06 kann ab Bereich 01 starten, finale Abnahme aber erst nach Bereich 02 und 03.

---

## Globales Definition-of-Done der Serie

- Jeder Intent hat einen eindeutig terminalen Zustand.
- Jeder terminale Fehler hat einen kanonischen, ursachenscharfen Code.
- Recovery-Phasen sind als Session mit Start, Verlauf, Ende und Kennzahlen sichtbar.
- Degraded ist ein persistierter Betriebszustand mit Eintritts- und Clear-Regeln.
- UI zeigt keine heuristischen Endannahmen mehr, wenn terminale Outcomes vorliegen.
- Vertragsverletzungen werden explizit sichtbar, nicht still verschluckt.

