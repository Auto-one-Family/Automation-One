# Auftragsserie: Firmware + Server + Frontend Konsistenzkette

**Stand:** 2026-04-04  
**Typ:** Serienauftrag (3 gekoppelte Einzelauftraege)  
**Ziel:** Durchgaengig konsistente Ausfuehrungs-, Vertrags- und Darstellungskette fuer dieselben Intents von Device bis UI.

---

## Warum diese Serie

Die bestehenden Integrationsauftraege definieren bereits das gemeinsame Vokabular und zentrale Contract-Regeln.  
Diese Serie setzt darauf auf und zieht die Umsetzung schichtspezifisch in drei fokussierten Bloecken nach:

1. **Firmware** stellt saubere Emission und Admission sicher.
2. **Server** stellt kanonische Normalisierung und autoritative Persistenz sicher.
3. **Frontend** stellt deterministische, operator-taugliche Darstellung ohne Heuristikdrift sicher.

Damit wird dieselbe technische Wahrheit in allen Schichten konsistent und reproduzierbar.

---

## Reihenfolge (verbindlich)

1. `analyse-und-fixauftrag-firmware-intent-admission-finalitaet-2026-04-04.md`  
2. `analyse-und-fixauftrag-server-kanonisierung-reconciliation-authority-2026-04-04.md`  
3. `analyse-und-fixauftrag-frontend-terminalitaet-operator-observability-2026-04-04.md`

---

## Abhaengigkeiten

- Diese Serie setzt voraus, dass Bereich 01 (kanonisches Outcome-Lexikon) fachlich festgelegt ist.
- Server-Auftrag benoetigt die im Firmware-Auftrag festgelegten Emissionsregeln.
- Frontend-Auftrag benoetigt die im Server-Auftrag verhaerteten API/WS-Contracts.
- Firmware und Frontend duerfen technisch parallel vorbereitet werden, finale Abnahme aber nur gegen den serverseitig kanonisierten Contract.

---

## Globales Definition-of-Done

- Dieselbe Intent-ID hat ueber alle Schichten dieselbe terminale Bedeutung.
- Unknown-/Contract-Verletzungen sind sichtbar, zaehlbar und nicht still verschluckt.
- Retry-, Degraded- und Recovery-Semantik bleibt ueber Firmware, Server und Frontend deckungsgleich.
- Fuer Operatoren ist je terminalem Fehler die Ursache und naechste Aktion eindeutig ersichtlich.
- Keine Schicht trifft finale Annahmen, die dem autoritativen Contract widersprechen.
