# Auftrag S12 — Querschnitt: Logic & Safety End-to-End (Bereiche C + D)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse / Synthese  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — **C**, **D** (insb. D2 Failure-Klassen)  
2. **Pflicht-Eingaben:** **S8**, **S7**, **S9**

---

## Code-Wurzel

Knoten: `LogicEngine` / `logic_service` / Scheduler ↔ `ActuatorService` / Publisher ↔ `SafetyService` ↔ `RuntimeState` / Degradation.

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S12-e2e-logic-safety-2026-04-05.md`

---

## Ziel

Eine **Failure-Klassen-Matrix (D2)** mit **konkreten Code-Stellen** und die Klärung, ob Safety **Logic überschreibt**, **blockt**, oder nur **annotiert**.

---

## Aufgaben

1. **D2-Matrix:** Zeilen = Failure-Klassen aus Oberauftrag (oder aus Code abgeleitet und mit Oberauftrag abgeglichen); Spalten = Erkennung | Übergang | Persistenz | Sichtbarkeit (WS/MQTT/API); Zelle = `Datei:Funktion`.  
2. **Interlocks:** Szenarien: Logic will Aktor, Safety verbietet, Runtime ist DEGRADED — Reihenfolge und Siegerregel.  
3. **Recovery:** Was passiert nach RECOVERY_SYNC mit laufenden Rules / pending Commands?  
4. **Tests:** Wo existieren pytest-Abdeckungen für diese Kreise; wo fehlen sie (als Lücken).  
5. **Störfälle:** mindestens zwei reproduzierbare Pfade (ein aus Logic, einer aus Safety-Block).

---

## Deliverables

- D2-Matrix (vollständig für serverseitig modellierbare Klassen)  
- Kurzliste „Safety vs. Logic“ Entscheidungsregeln  
- Gap-Liste P0/P1/P2

---

## Abnahmekriterien

- Jede Failure-Klasse in der Matrix hat **mindestens einen** Codeanker **oder** ist als „nicht im Server modelliert“ mit Folgeauftrag markiert  
- Mindestens **ein** Test-Referenz oder begründete „kein Test“-Markierung pro Kernpfad
