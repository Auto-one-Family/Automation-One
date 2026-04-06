# Serie S0–S13: El Servador — modulare Architektur- und Datenflussanalyse

**Stand:** 2026-04-05  
**Technical Manager:** Reihenfolge strikt einhalten, damit Traces konsistent bleiben.

## Ausführungsreihenfolge (verbindlich)

1. **S0** — Bootstrap, Lifespan, globale Verdrahtung  
2. **S1** — Core-Infrastruktur  
3. **S4** — MQTT Transport, Routing, Publishing  
4. **S5** — MQTT Handler (vollständige Liste)  
5. **S6** — Persistenz (Session, Models, Repos, Alembic)  
6. **S2** — HTTP API nach Routern  
7. **S3** — WebSocket / Realtime  
8. **S7** — Domain-Services Batch 1 (Aktor, Safety, Config, State)  
9. **S8** — Domain-Services Batch 2 (Logic, Scheduler, Simulation)  
10. **S9** — Runtime, Inbox, Notifications, Orchestration  
11. **S10** — E2E Ingestion (Querschnitt)  
12. **S11** — E2E Command/Actuator  
13. **S12** — E2E Logic & Safety  
14. **S13** — Synthese Ownership / Go-No-Go / Folgeaufträge  

## Code-Wurzel

`El Servador/god_kaiser_server/` (nicht `El Servador/src/`).

## Report-Ablage (kanonisch)

Verzeichnis anlegen falls fehlend:

`Auto-one/.claude/reports/current/server-analyse/`

Pro Auftrag eine Datei:

`report-server-S<ID>-<kurztitel>-YYYY-MM-DD.md`

## Oberauftrag und Roadmap

- `analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` (dieser Ordner)  
- `../roadmap-komplettanalyse.md`

## P2-Verfeinerung (ersetzt P2 nicht)

Die Einzelaufträge unter `../auftraege architektur/auftrag-P2.*` bleiben gültig; S0–S13 vertiefen Handler-Liste, Querschnitte und Referenz-Sync.

## Agenten-Empfehlung

- Analyse lesend: `server-debug` (oder gleichwertig)  
- Bei Drift-Fixes in Referenz-MD: `server-dev`  
- MQTT-Fokus: `mqtt-debug` / `mqtt-development`  
- **S13 / Synthese:** `meta-analyst` erst wenn Reports S0–S12 existieren oder als „Lückenliste“ gekennzeichnet sind

## Auftragsdateien dieser Serie

| ID | Datei |
|----|--------|
| S0 | `auftrag-server-S0-bootstrap-lifespan-globale-verdrahtung-2026-04-05.md` |
| S1 | `auftrag-server-S1-core-infrastruktur-2026-04-05.md` |
| S4 | `auftrag-server-S4-mqtt-transport-routing-publishing-2026-04-05.md` |
| S5 | `auftrag-server-S5-mqtt-handler-vollstaendig-2026-04-05.md` |
| S6 | `auftrag-server-S6-persistenz-session-models-repos-2026-04-05.md` |
| S2 | `auftrag-server-S2-api-http-router-services-2026-04-05.md` |
| S3 | `auftrag-server-S3-websocket-realtime-2026-04-05.md` |
| S7 | `auftrag-server-S7-domain-services-aktuator-safety-config-2026-04-05.md` |
| S8 | `auftrag-server-S8-domain-services-logic-scheduler-simulation-2026-04-05.md` |
| S9 | `auftrag-server-S9-runtime-inbox-notifications-2026-04-05.md` |
| S10 | `auftrag-server-S10-crosscut-ingestion-e2e-2026-04-05.md` |
| S11 | `auftrag-server-S11-crosscut-command-actuator-e2e-2026-04-05.md` |
| S12 | `auftrag-server-S12-crosscut-logic-safety-e2e-2026-04-05.md` |
| S13 | `auftrag-server-S13-synthese-integration-ownership-2026-04-05.md` |
