# Auftrag S8 — Domain-Services (Batch 2): Logic Engine, Scheduler, Simulation

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — Bereich C, C4 (Rule vs. Hardware Success), G4  
2. Vorarbeit: **S7** (Actuator-Pfad), **S6** (Hysterese-Persistenz-Tabellen)

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/logic_engine.py`  
`El Servador/god_kaiser_server/src/logic_service.py`  
`El Servador/god_kaiser_server/src/logic_scheduler.py`  
`El Servador/god_kaiser_server/src/services/logic/` (rekursiv)  
`El Servador/god_kaiser_server/src/services/simulation/` (rekursiv)

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S8-domain-batch2-logic-2026-04-05.md`

---

## Ziel

Du dokumentierst **alle Trigger** der Logic (Zeit, MQTT, API, Reconnect, Regel-Updates), Priorität, Schutz vor Loops, und die **Trennung** zwischen „Regel hat gefeuert“ und „Hardware hat bestätigt“.

---

## Aufgaben

1. **Triggergraph:** Knoten = Auslöser, Kanten = Codepfad in Engine/Service.  
2. **Priorität:** Bestätigung im Code: **kleinere Zahl = höhere Priorität** (Hypothese aus Architektur-Review) — API-/Schema-Texte auf **Widerspruch** prüfen.  
3. **Bausteine:** ConflictManager, RateLimiter, Hysterese, condition evaluators — kurz Rolle + Persistenz.  
4. **Scheduler:** Tick-Intervall, Nebenwirkungen, Interaktion mit Runtime-State.  
5. **Simulation:** Was simuliert welche Teile; Grenzen (Produktion vs. Dev).  
6. **C4:** Wo wird Rule-Success mit Hardware-Success vermischt; wo sauber getrennt.  
7. **Extern sichtbare Outcomes:** Jeder Pfad, der zu MQTT/WS/DB führt: benennen.

---

## Deliverables

- Triggergraph (textuell/mermaid im Report erlaubt)  
- Risiko-Liste „Prioritäts-Drift API ↔ Runtime“  
- Gap-Liste P0/P1/P2

---

## Abnahmekriterien

- Mindestens **drei** unterschiedliche Triggerquellen mit Codeankern  
- Explizite Stellungnahme zu C4 mit mindestens einem Gegenbeispiel im Code (wo es **gut** ist) und einem kritischen Punkt (wo es **unklar** ist), falls vorhanden
