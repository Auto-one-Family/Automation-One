# Auftrag S5 — MQTT: alle Handler einzeln (vollständige Pflichtliste)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug` + bei Topic-Drift `mqtt-development`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — A (Ingestion), B (Command), G2/G3  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\reference\api\MQTT_TOPICS.md` — Pflichtabgleich pro Handler  
3. Vorarbeit sinnvoll: Report **S4** (Transport/Routing)

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/mqtt/handlers/`  
Zusätzlich: `src/main.py` und `mqtt/handlers/__init__.py` — **welche Handler sind wirklich registriert**

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S5-mqtt-handler-2026-04-05.md`

---

## Ziel

Pro **registriertem** MQTT-Handler ein **Steckbrief** mit Trace-first-Nachweis: Topic → Validierung → Services/Repos → DB → Publish-Back / WS (falls indirekt) → terminale bzw. akzeptierte Semantik.

---

## Pflichtliste (mindestens — plus alle weiteren Dateien im Ordner)

Du musst **jeden** Handler abdecken, der im Repo existiert **und/oder** registriert ist. Mindestens explizit prüfen:

| Modul (Python-Datei ohne .py) | Erwartete Rolle (Kurz) |
|-------------------------------|-------------------------|
| sensor_handler | Sensor-Ingestion |
| heartbeat_handler | Präsenz/Liveness |
| lwt_handler | Last Will |
| diagnostics_handler | Diagnose/Telemetrie |
| error_handler | Fehlerkanal Gerät |
| config_handler | Config-Antworten / Push-Rückfluss |
| discovery_handler | Discovery (Legacy aktiv) |
| actuator_handler | Kommandoeingang Aktor |
| actuator_response_handler | Antworten Aktor |
| actuator_alert_handler | Alerts Aktor |
| zone_ack_handler | Zone-ACK |
| subzone_ack_handler | Subzone-ACK |
| intent_outcome_handler | Intent-Outcome |
| intent_outcome_lifecycle_handler | Outcome-Lifecycle |

**Zusatzregel:** Jede weitere `*_handler.py` unter `handlers/` erhält dasselbe Schema.

---

## Pro Handler einheitlich dokumentieren

1. **Subscription(s):** exaktes Topic-Pattern, QoS, wo registriert.  
2. **Payload:** Pflichtfelder, optionale Felder, **Legacy-Aliase** (`raw|raw_value`, `heap_free|free_heap`, `type|config_type`, weitere im Code) — Toleranz vs. Drift-Risiko.  
3. **Validierung:** Pydantic/schema/manuell; was passiert bei ungültigem JSON.  
4. **Verarbeitung:** Service- und Repo-Aufrufe in Reihenfolge; **Transaktionsgrenzen** (commit/rollback).  
5. **Ausgänge:** alle MQTT-Publishes (Topic, QoS, Retain); indirekte WS-Emit-Aufrufe (wenn aus Handler-Pfad erreichbar).  
6. **Fehlerpfad:** Drop, Retry, NACK, DB-Fehler, „stiller“ Erfolg — mit Codeanker.  
7. **Korrelation / Finalität:** `correlation_id`, FIFO-Fallback, „accepted“ vs. terminal (Outcome) — explizit benennen.  
8. **Happy-Path + Störfall:** je Handler mindestens ein Störfall-Idee mit Codepfad (kann knapp sein).

---

## Master-Tabelle (Pflicht)

Eine Tabelle **alle Subscriptions** des Servers: Pattern | QoS | Handler-Entry | Datei:Zeile (oder Funktion)

---

## Abnahmekriterien

- **Kein** in `main.py` / `handlers/__init__.py` registrierter Handler ohne Steckbrief  
- Drift zu `MQTT_TOPICS.md` gesammelt in einer Sektion „Drift“  
- Gap-Liste P0/P1/P2 mit Bezug zu G2 (stille Verluste), G3 (Korrelation)

---

## Hinweis für Parallelität

Wo du FIFO-Fallback oder fehlende harte Korrelation findest: **Codezitat/Anker** und Risiko „parallel gleiche ESPs/Commands“ beschreiben — Detailausbau in **S11**.
