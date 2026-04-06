# Auftrag Epic 1 — 05: Intent/Outcome — Orchestrierung `sent`, Konsistenz, Timeouts

**Datum:** 2026-04-05  
**Epic:** 1  
**Bezug Ist-Analyse:** AP-D, AP-E, M1-Fragment — Spalte **`orchestration_state`** dokumentiert `accepted|sent|ack_pending`, **`upsert_intent` setzt aber nur** `accepted` oder `ack_pending`; **`sent` fehlt** im geprüften Pfad. Keine vollständige Statemachine wie im Implementierungsplan P0.1.

---

## Problem (Ist)

- **Teilimplementierung:** Intent-Zeilen existieren, Outcomes mit Finalität existieren, **terminal authority** für Nicht-Intent-Events nutzt `command_outcomes` — aber die **Orchestrierungsphase „wir haben MQTT wirklich gesendet“** ist **nicht** sauber im Modell abbildbar.  
- **Folge:** Betrieb und spätere Timeout-/Reconcile-Worker können **keine** eindeutige Entscheidung treffen zwischen „Intent akzeptiert, aber noch nicht raus“ vs. „raus, warte auf Outcome“.  
- Das betrifft dein **Langzeit-Ziel** „vertraglich finale Semantik“ aus dem Implementierungsplan — dieser Auftrag ist **Phase 1** (Klarheit + minimale Vollständigkeit), nicht die gesamte P0.1-Fläche.

---

## Ziel (Soll) — in zwei Stufen denkbar

### Stufe 1 (Pflicht in diesem Auftrag)

1. **Code und DB-Docstring** angleichen: Entweder **`sent` implementieren** an der Stelle, an der der Server einen Intent **tatsächlich per MQTT published** hat (Erfolg nach Publish) — **Stand Codebase:** `upsert_intent` wird nur aus `El Servador/god_kaiser_server/src/mqtt/handlers/intent_outcome_handler.py` aufgerufen, nicht aus Config-Push-, System-Command- oder Actuator-Pipelines; Inventar über `upsert_intent` allein zeigt also **nur** diesen Handler. **`sent`** gehört **vor** dem eingehenden Outcome an die **Publish-Erfolgs**-Stelle(n) der jeweiligen Flows (Actuator/System/Config), typischerweise per zusätzlichem Repo-Aufruf oder erweitertem Publish-Pfad — **oder** das Spalten-`doc` zu `orchestration_state` in `El Servador/god_kaiser_server/src/db/models/command_contract.py` (String-Spalte, **kein** Python-`Enum`) auf **nur erlaubte Zustände** reduzieren **ohne** Lüge.  
2. **`upsert_intent`:** Klare Regel dokumentieren (Kommentar + kurzes Snippet unter `El Servador/god_kaiser_server/docs/`): Welches Event setzt welchen State.  
3. **Stale-Pfad** `intent_outcome_handler` (kein WS bei stale): im Docstring für Operatoren erklären — **kein** Verhalten ändern nötig, nur **Transparenz**.

### Stufe 2 (optional, wenn Zeit — klar kennzeichnen)

- **Timeout-Worker:** Pending-Intents älter als SLA → markieren (`expired` / dedizierte Spalte / Outcome-Zeile) — **nur** wenn ihr eine SLA definiert (z. B. 30s). Ohne SLA **nicht** raten.

---

## Einschränkungen

- **Keine** Änderung der **kanonischen Outcome-Werte** (`El Servador/god_kaiser_server/src/services/intent_outcome_contract.py`) ohne separaten Contract-Auftrag.  
- **Keine** Breaking Changes am MQTT-Topic-Layout.  
- Alembic-Migration nur, wenn neue Spalten/Enums nötig — wenn möglich, bestehende Spalte `orchestration_state` nutzen.

---

## Umsetzungsschritte

1. **Inventar:** Per `grep` alle Aufrufer von `upsert_intent` listen (Stand Codebase: nur `intent_outcome_handler`) sowie separat alle Stellen, an denen intentbezogene MQTT-Publishes erfolgen.  
2. **Designentscheid:** Tabelle „Ereignis → orchestration_state“ im PR beschreiben.  
3. **Implementierung** Stufe 1 gemäß Entscheidung.  
4. **Tests:** Unit-Tests für Zustandsübergänge, mindestens ein Integrationstest; Mock-MQTT-Pattern existiert z. B. in `El Servador/god_kaiser_server/tests/integration/test_mqtt_subscriber.py` (Patch `MQTTClient`).  
5. **Doku:** Abschnitt in `El Servador/god_kaiser_server/docs/` für Support: „Intent hängt in ack_pending — was bedeutet das?“

---

## Abnahmekriterien

- [ ] Kein Widerspruch mehr zwischen **`command_intents.orchestration_state`-Dokumentation** und dem, was `command_contract_repo` **tatsächlich** schreibt.  
- [ ] Wenn `sent` vorgesehen ist, existiert mindestens **ein** Codepfad, der ihn setzt; sonst ist `sent` **entfernt** aus dem Docstring/Enum.  
- [ ] Tests grün.  
- [ ] Changelog.

---

## Abgrenzung zu P0.1 Gesamt

Der **volle** Implementierungsplan P0.1 (1000 parallele Intents, strikte Terminalität, Late-ACK-Fenster) ist **größer** als dieser Auftrag. Dieser Auftrag **bereitet** die Datenbasis und Verständlichkeit vor.

---

*Ende Auftrag 05.*
