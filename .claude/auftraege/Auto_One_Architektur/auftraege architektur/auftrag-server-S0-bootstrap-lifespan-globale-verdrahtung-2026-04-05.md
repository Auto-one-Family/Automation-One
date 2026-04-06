# Auftrag S0 — Bootstrap, Lifespan, globale Verdrahtung (El Servador)

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse (keine Produktiv-Codeänderung; optional nur Report/Doku)  
**Empfohlener Agent:** `server-debug` (lesend)

---

## Verbindliche Referenzen (zuerst lesen)

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — Ziele G1–G5, Bereiche A–F, Methodik M1–M4  
2. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\README-serie-S0-S13-2026-04-05.md` — Reihenfolge der Serie

---

## Code-Wurzel

`El Servador/god_kaiser_server/`

---

## Report schreiben nach

`Auto-one/.claude/reports/current/server-analyse/report-server-S0-bootstrap-lifespan-2026-04-05.md`  
(Ordner bei Bedarf anlegen.)

---

## Ziel

Du lieferst eine **belegbare** Karte, wie die App startet und stoppt, welche Subsysteme wann leben und welche Hintergrundarbeit existiert. Hypothese zum **explizit verifizieren oder falsifizieren:** `src/main.py` ist der zentrale Lifespan-/Wiring-SPOF für DB, MQTT, Handler, WebSocket, Logic/Scheduler, Simulation/Maintenance.

---

## Scope (Pflicht)

- `src/main.py` (App-Factory, `lifespan`, Includes, Router-Mounts)  
- Alles, was dort importiert und initialisiert wird: MQTT-Client/Subscriber, Handler-Registrierung, WebSocket-Manager, LogicScheduler/LogicEngine, Maintenance/Simulation-Hooks  
- Globale Singletons, App-State, Background-Tasks (`asyncio.create_task`, `BackgroundTasks`), Threads (z. B. MQTT-Threadpool)

---

## Aufgaben

1. **Startkette:** Reihenfolge von Init-Schritten vom Prozessstart bis „ready for traffic“. Pro Schritt: **Datei:Funktion** oder **Datei:Block** + kurze Ursache (warum diese Reihenfolge).  
2. **Shutdown/Drain:** Was wird bei SIGTERM/ASGI-Shutdown geflusht, was hart abgebrochen, welche Timeouts existieren.  
3. **Background-Arbeit:** Vollständige Liste aller Tasks/Threads, die nach Startup laufen; jeweils: Owner-Modul, Trigger (einmalig vs. periodisch), Stop-Verhalten.  
4. **Inbound-Replay / Queues:** Existiert persistentes oder RAM-basiertes „Nachholen“ eingehender MQTT/HTTP-Verarbeitung nach Neustart oder nach DB-Recovery? Wo genau im Code; welche Grenzen (Größe, TTL, Drop).  
5. **Trace-Beispiel:** Ein Happy-Path „Prozess start → MQTT subscribed → ein Handler ist registriert“ mit 5–10 Zeilen Pfadanker.

---

## Methodik (kurz)

Trace-first: **Input (Startup-Event) → Zwischenzustand → aktive Komponenten → Ausgang (ready/degraded)**. Mindestens **ein Störfall** (z. B. MQTT-Connect verzögert oder DB-Init-Fehler), so weit im Code nachvollziehbar.

---

## Deliverables im Report

- Pfadkarte Start/Stop (nummeriert)  
- Tabelle: Background-Task | Modul | Frequenz | Shutdown  
- Abschnitt „Replay/Inbound-Queues“ mit Befund (ja/nein/teilweise) + Codeanker  
- Gap-Liste P0/P1/P2 gegen G2/G4 (stille Verluste, Recovery-Sichtbarkeit), falls im Scope erkennbar

---

## Abnahmekriterien

- Jeder genannte Background-Task hat einen **Codeanker**  
- Registrierung der MQTT-Handler ist mit **main.py + handlers/__init__.py** verknüpft (nur referenzieren, Detail in S5)  
- Kein freischwebendes „vermutlich“ ohne Dateiangabe
