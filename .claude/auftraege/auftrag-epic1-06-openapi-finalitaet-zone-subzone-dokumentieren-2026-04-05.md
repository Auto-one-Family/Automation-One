# Auftrag Epic 1 — 06: OpenAPI und Betriebsdoku — Finalität Actuator, Zone, Subzone, Emergency

**Datum:** 2026-04-05  
**Epic:** 1  
**Bezug Ist-Analyse:** AP-G, C2 — Matrix aus Ist-Bericht in **verbindliche API-Beschreibung** und **kurze Betriebsdoku** überführen.

---

## Problem (Ist)

- Finalität ist **im Code** unterschiedlich: Actuator REST wartet nicht auf ESP; Zone kann **synchron** auf ACK warten; Subzone assign **ohne** Bridge; Emergency eigener Pfad.  
- **OpenAPI** und externe Integratoren sehen das **nicht** einheitlich — Risiko falscher Erwartung in **AutomationOne**-Deployments (Grafana, externe Steuerung, eigenes Frontend).

---

## Ziel (Soll)

1. **OpenAPI (FastAPI):** Für die genannten Endpunkte **Feld-Beschreibungen** und ggf. **Response-Models** so erweitern, dass jeder Response klar macht:  
   - **`acknowledged`** / **`ack_received`** / **`mqtt_sent`** — **was genau** wurde bereits garantiert?  
   - Verweis: „**Geräte-Finalität** über MQTT-Topics … / WS-Events …“ (kurz, ohne Roman).  
2. **Zentrales Markdown** unter `god_kaiser_server/docs/` (ein Dateiname, z. B. `finalitaet-http-mqtt-ws.md`): **Matrix** aus AP-G **als SOLL-Doku** nachziehen, nachdem Aufträge **02–04** umgesetzt oder verworfen sind (damit keine Doku-Doppelarbeit).  
3. **`intent_outcomes` GET:** Beschreibung, dass das **Auslese-API** für Outcome-Zeilen ist, nicht für Blocking-Commands.

---

## Einschränkungen

- **Keine** neuen Endpunkte nur für Doku.  
- Texte **deutsch oder englisch** — **eine** Sprache konsistent mit dem restlichen `god_kaiser_server/docs/`-Ordner (IST: überwiegend deutsch, z. B. `logic-rule-priority.md`; Server-`README.md` im Root ist englisch).

---

## Umsetzungsschritte

1. **`src/api/v1/actuators.py`:** `summary`/`description` der Router oder einzelner Routen mit Finalitäts-Hinweis (ohne UI-Floskeln); **Emergency** (`/emergency_stop`, `/clear_emergency` und Legacy-Aliase) liegt in derselben Datei, nicht in einem separaten Router.  
2. **`src/api/v1/zone.py` / `src/api/v1/subzone.py` / `src/schemas/zone.py` / `src/schemas/subzone.py`:** Felder `ack_received`, `mqtt_sent` etc. mit präzisen `Field(description=...)`.  
3. **`src/api/v1/intent_outcomes.py`:** `GET /api/v1/intent-outcomes` und `GET /api/v1/intent-outcomes/{intent_id}` — Beschreibung wie in Zielpunkt 3 (Auslese-API, kein Blocking-Command).  
4. **`god_kaiser_server/docs/finalitaet-http-mqtt-ws.md`:** Tabelle aus Epic-1-Bericht + Anpassungen nach anderen Aufträgen (z. B. neue `correlation_id` in Actuator-Response).  
5. Optional: Link aus **`god_kaiser_server/README.md`** — `docs/index` existiert derzeit nicht unter `god_kaiser_server/docs/`.

---

## Abnahmekriterien

- [ ] OpenAPI-JSON (falls generiert) zeigt bei Actuator-Command, Zone-Assign, Subzone-Assign, Emergency **verständliche** Beschreibungen zu Finalität.  
- [ ] Markdown-Datei existiert und ist mit dem **aktuellen** Code konsistent (Review gegen `git diff` der Aufträge 02–04).  
- [ ] Kein Widerspruch zur Matrix in Epic-1-Bericht (`god_kaiser_server/docs/analyse/report-server-epic1-ist-vertrag-korrelation-verdrahtung-2026-04-05.md`) **ohne** erklärenden Footnote.

---

## Abhängigkeit

- **Idealer Abschluss nach** 02 (und ggf. 04), damit `correlation_id`- und Bridge-Verhalten in der Doku **stimmen**. Kann **entworfen** werden parallel, **final gemerged** nach diesen Aufträgen.

---

*Ende Auftrag 06.*
