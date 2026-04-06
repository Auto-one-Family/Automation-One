# Auftrag S10 — Querschnitt: Ingestion End-to-End (Bereich A)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse / Synthese aus Vorreports  
**Empfohlener Agent:** `server-debug` oder `meta-analyst` (wenn Vorreports vorliegen)

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — **Bereich A** (A1–A3)  
2. **Pflicht-Eingaben:** Reports **S5**, **S6**, **S9** (falls nicht vorhanden: im Auftrag explizit als Blocker markieren und nur aus Code nachziehen)

---

## Code-Wurzel

Querschnitt — keine neue Ordnergrenze: du arbeitest **horizontal** über Pfade aus S5+S6+S9.

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S10-e2e-ingestion-2026-04-05.md`

---

## Ziel

Ein **Pfadatlas** aller Ingestion-Quellen (primär MQTT-Topics aus S5, ergänzend HTTP falls Ingestion über API) von Eingang bis **Persistenz** und bis zu **MQTT/WS-Ausgängen**.

---

## Aufgaben

1. **Pfadatlas:** Eine Zeile pro Quelle: `Quelle (Topic/Route) → Handler/Endpoint → Service → Repo/Tabellen → Ausgänge (MQTT/WS/HTTP)`.  
2. **Mindestabdeckung:** je **eine** belastbare Spur pro Familie: `sensor`, `heartbeat`, `diagnostics`/`error`, `config` (response path), `discovery` (falls aktiv), `lwt`.  
3. **Verlust-/Drift-Matrix:** Zeilen = Risiko (Drop, Duplikat, Reorder, Alias-Missmatch); Spalten = betroffene Pfade; Zelle = Codeanker + Bewertung.  
4. **A3-Analogon:** Wenn A3 im Oberauftrag definiert ist, mappe 1:1; sonst: baue gleichwertige Matrix für Ingestion-Integrität.  
5. **G2:** Liste aller Stellen, an denen Ingestion **ohne** sichtbaren Fehler/Outcome enden kann.

---

## Deliverables

- Pfadatlas (Tabelle)  
- Verlust-/Drift-Matrix  
- Konsolidierte Gap-Liste P0/P1/P2 für den Oberauftrag-Abschnitt A

---

## Abnahmekriterien

- Kein Eintrag in der Master-Subscription-Tabelle aus **S5** der Ingestion ist, ohne dass er im Atlas vorkommt oder als „out of scope“ begründet ist  
- Mindestens **ein** Parallelitäts- oder Reorder-Szenario für Sensor/Heartbeat skizziert
