# Auftrag S3 — WebSocket / Realtime

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — G1, G2, Realtime-Sichtbarkeit  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\reference\api\WEBSOCKET_EVENTS.md` — **Pflichtabgleich**

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/api/v1/websocket/`  
`El Servador/god_kaiser_server/src/websocket/manager.py`  
Zusätzlich: **alle** `emit`/`broadcast`/`send`-Aufrufe unter `src/services/` und `src/mqtt/handlers/` (per Suche)

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S3-websocket-2026-04-05.md`

---

## Ziel

Vollständiger **Event-Katalog aus dem Code**, Abgleich mit Doku, Fan-out-Regeln, Fehler bei Disconnect — plus Bewertung: **Realtime weg, REST/MQTT noch da**.

---

## Aufgaben

1. **Verbindungsaufbau:** Wie authentifiziert der WS-Endpoint? Welche Parameter (Token, Raum, ESP)?  
2. **Manager:** Wie werden Clients registriert, gefiltert, entfernt?  
3. **Emit-Pfade:** Jede Stelle, die Nachrichten an Clients sendet: Datei:Funktion, Event-Name/Payload-Typ.  
4. **Katalog:** Tabelle Event | Producer-Modul | Trigger (MQTT-Ingestion, API, Logic, …) | Payload-Skizze  
5. **Abgleich `WEBSOCKET_EVENTS.md`:** Drift-Tabelle  
6. **Fehlerfall:** Client disconnect während burst updates; Backpressure; verlorene Events — was passiert?  
7. **Störfall-Szenario:** „WS down, MQTT up“ — welche Daten sieht das Frontend nicht, welche über andere Kanäle?

---

## Deliverables

- WS-Event-Matrix + Drift-Liste  
- Kurzdiagramm: Quelle → Manager → Client  
- Gap-Liste P0/P1/P2

---

## Abnahmekriterien

- Jeder Event-Typ aus dem Code ist entweder im Report oder in der Drift-Tabelle als „Doc fehlt“  
- Mindestens **fünf** unterschiedliche Producer-Dateien identifiziert (oder alle wenn weniger)
