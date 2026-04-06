# Auftrag S9 — Runtime-State, Inbound-Inbox, Notifications, Event-Aggregation

**Datum:** 2026-04-05  
**Typ:** Tiefenanalyse  
**Empfohlener Agent:** `server-debug`

---

## Verbindliche Referenzen

1. `C:\Users\robin\Documents\PlatformIO\Projects\Auto-one\.claude\auftraege\Auto_One_Architektur\server\analyseauftrag-server-end-to-end-vollpruefung-und-vollstaendigkeit-2026-04-03.md` — G2, G4, Runtime-Fragen in Leitfragen  
2. Vorarbeit: **S0** (Lifecycle), **S1** (Degradation), **S6** (DB-Fehlerpfade)

---

## Code-Wurzel

`El Servador/god_kaiser_server/src/services/` — **Pflichtdateien:**

- `runtime_state_service.py`  
- `inbound_inbox_service.py`  
- `notification_router.py`  
- `event_aggregator_service.py`

**Erweiterung:** Weitere Orchestration-Services, die Runtime, Recovery, Replay oder „Drain“ betreffen — per semantische Suche (`grep`/`codebase_search`) nicht auslassen.

---

## Report

`Auto-one/.claude/reports/current/server-analyse/report-server-S9-runtime-inbox-2026-04-05.md`

---

## Ziel

Klärung von **DEGRADED / RECOVERY_SYNC / NORMAL** (und verwandte Zustände) im Code: Übergänge, Sichtbarkeit nach außen, **Replay** eingehender Nachrichten, und Bewertung **verlustfrei vs. best-effort** pro Pfad.

---

## Prüfhypothesen (verifizieren/falsifizieren)

- Es gibt **keine** vollständig durable Inbound-Replay-Queue über DB-Ausfall hinweg — Inbound kann verloren gehen.  
- Notification-Router verteilt Events auf MQTT/WS/andere Kanäle mit unterschiedlichen Garantien.

---

## Aufgaben

1. **Zustandsmaschine:** Zustände, Übergänge, Guards, Codeanker pro Transition.  
2. **Inbound-Inbox:** Was wird zwischengespeichert, wie lange, RAM vs. DB, was passiert bei Neustart.  
3. **NotificationRouter:** Producer und Consumer, Prioritäten, Fehlerbehandlung.  
4. **EventAggregator:** Rolle, Trigger, Nebenwirkungen.  
5. **Störfall:** „DB kurz nicht erreichbar während MQTT-Ingress“ — Schicksal der Messages Schritt für Schritt.  
6. **G2-Bewertung:** Tabelle Pfad | still möglich? | welcher Nachweis/Outcome bei Verlust

---

## Deliverables

- Zustandsdiagramm + Inbox-Beschreibung  
- Tabelle Pfad vs. Verlustrisiko  
- Gap-Liste P0/P1/P2

---

## Abnahmekriterien

- Jeder genannte Service mit öffentlichen Methoden und mindestens einem Aufrufer  
- Störfall „DB kurz weg“ mit **konkretem** Codepfad (kein Abstract)
