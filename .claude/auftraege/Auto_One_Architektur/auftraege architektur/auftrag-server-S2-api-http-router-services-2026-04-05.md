# Auftrag S2 — HTTP API: Router → Service → DB → Nebenkanäle

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — B, C, G3, G5  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\reference\api\REST_ENDPOINTS.md` — **Pflichtabgleich**

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/api/`  
`El Servador/god_kaiser_server/src/api/v1/` (alle Router-Module)

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S2-api-http-2026-04-05.md`

---

## Ziel

Du dokumentierst **jeden Router-Cluster**: Routen, Auth/Dependencies, Service-Aufrufe, DB-Zugriff, **Nebenwirkungen** (MQTT publish, WebSocket broadcast). REST-Dokumentation und Code sollen auf Drift geprüft werden.

---

## Aufgaben

1. **Inventar Router:** Datei pro Router-Modul mit Liste der Endpoints (Methode + Pfad).  
2. **Pro Router-Gruppe:** typischer Call-Graph „Endpoint → Service → Repo → commit“.  
3. **Auth:** JWT/OAuth/Dependencies — welche Routen sind geschützt, welche öffentlich.  
4. **Schreibende Endpoints:** Transaktionsgrenze, Idempotenz (falls behauptet), Fehlercodes.  
5. **Nebenkanäle:** Jeder Endpoint, der MQTT oder WS auslöst: Topic/Event-Name + Auslöser.  
6. **Abgleich `REST_ENDPOINTS.md`:** fehlend im Doc, fehlend im Code, Pfad-Drift — Tabelle.  
7. **Störfall:** mindestens zwei (Validierungsfehler, DB-Fehler beim Schreiben) mit erwarteter API-Antwort.

---

## Methodik

Trace-first: **HTTP Request → Handler → Service → DB → Response** und ggf. **→ MQTT/WS**.

---

## Deliverables

- Ein Kapitel pro Router-Modul (Überschrift = Dateipfad)  
- Drift-Tabelle zu `REST_ENDPOINTS.md`  
- Gap-Liste P0/P1/P2 (G3 Dispatch vs. Finalität bei Command-Endpoints)

---

## Abnahmekriterien

- Jeder **schreibende** Endpoint mit Nebenkanal hat explizite Nennung von MQTT/WS oder „keiner“  
- Drift-Tabelle ist vollständig für alle **in Code existierenden** v1-Routen (oder begründete Teilmenge + Verweis auf Vollständigkeitsmethode)
