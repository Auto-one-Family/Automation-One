# Auftrag S4 — MQTT: Transport, Subscription-Routing, Publishing

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug` oder `mqtt-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — G1, G2, G3  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\reference\api\MQTT_TOPICS.md` — **Pflichtabgleich** mit Ist-Code

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/mqtt/`

**Fokusdateien (Pflicht):** `client.py`, `subscriber.py`, `publisher.py`, `topics.py` (TopicBuilder o. ä.)

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S4-mqtt-transport-routing-2026-04-05.md`

---

## Ziel

Du erklärst die **gesamte MQTT-Schicht** unterhalb der Domain-Handler: wie Messages ankommen, wie sie einem Handler zugeordnet werden, wie Outbound gebaut wird — inkl. QoS, Retain (wo relevant), Threadpool/async-Brücke, Reconnect und Drop-Policy.

---

## Aufgaben

1. **Inbound-Pfad:** Von Broker-Callback bis Aufruf des Handler-Entrypoints; inkl. Topic-Matching, Wildcards, QoS.  
2. **Outbound-Pfad:** Wer ruft `publisher` an (typische Call-Sites-Kategorien); wie werden Topics gebaut (`topics.py`); QoS/Retain pro **Topic-Klasse** tabellarisch.  
3. **Resilience:** Reconnect-Strategie, Offline-Puffer, was passiert bei vollem Puffer oder dauerhaftem Ausfall.  
4. **Parallelität:** Wo werden Messages in Worker/Threadpool geschoben; welche gemeinsamen Strukturen (Locks, Queues).  
5. **Referenz-Sync:** Abgleich `MQTT_TOPICS.md` mit Code: fehlend, extra, falsch benannt — als Drift-Tabelle mit Priorität.

---

## Methodik

Trace-first: **eingehende MQTT-Message → Router → Handler-Funktion** und **Service entscheidet publish → publisher.build/publish → Broker**.

---

## Deliverables

- Textdiagramm Ein- und Ausgang  
- Tabelle Topic-Klasse | Pattern | QoS | Retain | Producer-Typ  
- Drift-Liste zu `MQTT_TOPICS.md`  
- Gap-Liste P0/P1/P2 (G2 stiller Verlust, G3 Korrelation nur soweit in dieser Schicht)

---

## Abnahmekriterien

- Jede Subscription, die in `subscriber` oder `main` registriert wird, ist entweder hier oder in S5 vollständig — verweise klar  
- Mindestens ein **Störfall** (disconnect oder publish failure) mit Codepfad zu sichtbarem Fehler/Log
