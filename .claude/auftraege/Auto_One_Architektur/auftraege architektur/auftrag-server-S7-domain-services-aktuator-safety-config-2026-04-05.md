# Auftrag S7 — Domain-Services (Batch 1): Gerät, Sensor, Aktor, Safety, Config, State

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — B, D, G3, G5  
2. Vorarbeit: **S6** (Schreibmatrix), **S5** (MQTT-Eingänge für Aktor/Config/ACK)

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/services/` — **Fokus** (erweitere per Suche, nichts Relevantes auslassen):

- `actuator_service.py`, `safety_service.py`  
- `config_builder.py` oder gleichwertige Config-Pipeline  
- `device_response_contract.py`, `state_adoption_service.py`  
- Zugehörige Schemas unter `src/schemas/` oder `src/models/` wenn direkt gekoppelt

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S7-domain-batch1-2026-04-05.md`

---

## Ziel

End-to-End-Verständnis der **Command- und Safety-Ketten** bis MQTT und DB: was bedeutet „Erfolg“ serverseitig vs. fachliche Finalität auf dem Gerät.

---

## Aufgaben

1. **ActuatorService:** Einstiegspunkte (API, MQTT, Logic), Reihenfolge Safety-Checks, Publish an Gerät, erwartete Responses.  
2. **SafetyService:** Was blockiert hart, was markiert nur degraded? Bezug zu Runtime-State (Querverweis S9).  
3. **Config-Pipeline:** Bau, Push, Antwortpfad, Reconciliation-Hooks falls vorhanden.  
4. **State adoption / device response contract:** Wie werden Firmware-Zustände übernommen; wer ist **State-Owner** Server vs. ESP.  
5. **Cross-ESP vs. single-ESP:** Annahmen im Code explizit machen.  
6. **Traces:** Zwei Happy-Paths (z. B. REST-Command, MQTT-Command) und **zwei Störfälle** (Safety block, Publish-Fehler) als nummerierte Schritte mit Dateianker.  
7. **Failure-Ownership:** Tabelle Grenze | wer führt terminalen Status | wer repariert

---

## Deliverables

- Text-Sequenzdiagramme (4 Szenarien)  
- Kurzliste öffentlicher Service-Methoden mit „wer ruft sie“  
- Gap-Liste P0/P1/P2 (G3, G5)

---

## Abnahmekriterien

- Jede genannte Service-Öffentlich-Schnittstelle mit mindestens einem Caller-Anker (Router/Handler/Engine)  
- Explizite Aussage: **REST 200 bedeutet nicht automatisch physische Ausführung** — mit Codebeleg
