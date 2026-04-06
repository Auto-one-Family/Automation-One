# Auftrag S11 — Querschnitt: Command / Actuator End-to-End (Bereich B)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse / Synthese  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — **Bereich B** (B1–B4), G3  
2. **Pflicht-Eingaben:** **S5** (actuator_*, zone_ack, subzone_ack, intent_outcome*), **S7**, **S2**, **S6**

---

## Code-Wurzel

Horizontal: HTTP-Routen (Commands), MQTT-Handler, `ActuatorService`, Publisher, Response-/ACK-Handler, DB-Updates, WS-Emit-Pfade.

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S11-e2e-command-actuator-2026-04-05.md`

---

## Ziel

Nachweis der **Command-Lifecycle** inkl. **Korrelation unter Parallelität**, Emergency-Pfad, und klare Unterscheidung **accepted vs. terminal** (Intent-Outcome).

---

## Aufgaben

1. **Zustandsdiagramm:** Serverseitige Command-States (pending, dispatched, acknowledged, failed, …) — Begriffe aus dem Code übernehmen, nicht erfinden.  
2. **Korrelation:** Rolle von `correlation_id`; alle Stellen mit **FIFO-Fallback** oder alternativem Matching: Codeanker + Risikobeschreibung (B3).  
3. **Emergency:** End-to-End von Eingang (API/MQTT/Logic) bis sichtbarem Outcome (B4).  
4. **Intent-Outcome:** Ist `system/intent_outcome` (o. ä.) **überall** verdrahtet, wo die Firmware Outcomes sendet? Lücken benennen (Leitfrage 8 Oberauftrag).  
5. **Parallelitäts-Szenario:** Zwei Commands gleicher Art an dieselbe ESP kurz hintereinander — erwartetes Mapping der Responses.  
6. **Traces:** Ein Happy-Path REST, ein Happy-Path MQTT, ein Störfall (Timeout/NAK).

---

## Deliverables

- Lifecycle-Diagramm (textuell)  
- Korrelations-/Fallback-Tabelle mit Risikoklassen  
- Gap-Liste P0/P1/P2 (G3, G5)

---

## Abnahmekriterien

- Explizite **Ja/Nein/Lücken**-Antwort zur Frage: „Gibt es noch FIFO-Fallback ohne harte Korrelation?“ mit Codezeilen  
- Emergency-Pfad mit mindestens **fünf** Codeankern von Eingang bis Outcome
