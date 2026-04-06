# Auftrag Epic 1 — 02: Actuator REST — `correlation_id`, Safety-Warnungen, Finalität transparent

**Datum:** 2026-04-05  
**Epic:** 1  
**Bezug Ist-Analyse:** AP-A, AP-G — `ActuatorCommandResponse` liefert **`acknowledged=False`** (korrekt für Async), aber **keine** `correlation_id`; **`safety_warnings`** ist immer `[]`, obwohl `SafetyService` Warnungen liefern kann.

---

## Problem (Ist)

1. **`correlation_id`:** Wird in `ActuatorService.send_command` erzeugt und per MQTT sowie WS (`actuator_command` / `actuator_command_failed`) ausgespielt, **nicht** aber in der **HTTP-Response**. Clients, die nur REST nutzen, können POST und spätere WS-/MQTT-Ereignisse **nicht robust** zuordnen.  
2. **`safety_warnings`:** Schema-Feld existiert, Handler setzt **fest leer** — Warnungen aus `SafetyService` gehen im HTTP-Contract unter, auch wenn sie im History-Metadata landen.

---

## Ziel (Soll)

1. **`ActuatorCommandResponse`** enthält ein Feld **`correlation_id: str`**, gefüllt mit **derselben** UUID, die `send_command` für diesen Aufruf erzeugt hat (Happy-Path und konsistent auch bei No-Op, siehe unten).  
2. **`safety_warnings`:** Liste von strukturierten oder string-basierten Warnungen **wie** `SafetyService` sie im Erfolgsfall liefert (Schema festlegen: `list[str]` oder kleines Objekt — **ein** Format, konsistent mit bestehenden Patterns im Projekt). **IST:** `SafetyCheckResult.warnings` ist bereits `Optional[list[str]]` in `El Servador/god_kaiser_server/src/services/safety_service.py`.  
3. **Semantik von `acknowledged`:** Entweder unverändert lassen mit **klar dokumentiertem** Sinn („MQTT-Geräte-ACK noch ausstehend“) **oder** optional ein zweites Feld einführen (nur wenn nötig) — **Minimalprinzip:** lieber Doku + `correlation_id` als neue Enum-Semantik ohne Need.

**No-Op-Delta:** Wenn **kein** MQTT gesendet wird, soll `correlation_id` **trotzdem** zurückgegeben werden (dieselbe generierte ID für den Request-Trace), und die Response soll klar machen, dass **kein** Publish erfolgte (bestehendes Verhalten über `command_sent` / Logs prüfen — falls unklar, im Code vereinheitlichen und in OpenAPI beschreiben).

---

## Einschränkungen

- **Keine** Änderung der Firmware-Protokolle.  
- **Keine** Blockierung des HTTP-Handlers auf ESP-ACK (Finalität bleibt asynchron).  
- Breaking Change für API-Clients ist **akzeptabel nur mit** Versionshinweis / Changelog (neue Pflichtfelder vermeiden: `correlation_id` optional mit Deprecation-Phase nur wenn ihr strikte Rückwärtskompatibilität braucht — **Standard:** neues Feld optional `None` für alte Clients ist nicht nötig wenn nur interner Vue-Client; entscheidet der Umsetzende anhand eures API-Versionsmodells).

---

## Umsetzungsschritte

1. **`El Servador/god_kaiser_server/src/schemas/actuator.py`:** `ActuatorCommandResponse` um `correlation_id` erweitern; `safety_warnings` korrekt typisieren.  
2. **`El Servador/god_kaiser_server/src/api/v1/actuators.py`:** Nach `send_command` Rückgabe die **`correlation_id`** aus dem Service **explizit** an die Response binden (dafür muss `send_command` sie entweder zurückgeben oder der Service speichert sie pro Call — **bevorzugt:** Rückgabe als Teil eines kleinen Result-Objekts oder Tuple, ohne globale State).  
3. **`El Servador/god_kaiser_server/src/services/actuator_service.py`:** Signatur `send_command` so erweitern, dass der Aufrufer **`correlation_id`** und **Warnungen** zuverlässig erhält; alle Call-Sites aktualisieren (`logic_engine`, `actuator_executor`, `logic.py`, ggf. weitere).  
4. **Tests:** Unit-Tests für „Response enthält `correlation_id`“; Fall No-Op-Delta; Fall Safety-Warnung ohne Block.  
5. **OpenAPI** nachziehen.

---

## Abnahmekriterien

- [ ] POST `/api/v1/actuators/{esp_id}/{gpio}/command` liefert in der JSON-Response **`correlation_id`** gleich der in WS `actuator_command` verwendeten ID (manueller oder automatisierter Test mit Mock).  
- [ ] Wenn `SafetyService` Warnungen liefert und `valid=True`, erscheinen sie in **`safety_warnings`** der HTTP-Response (mindestens ein Test mit gemocktem Safety).  
- [ ] Changelog / Release-Note erwähnt API-Erweiterung.  
- [ ] **Follow-up dokumentiert** (Kommentar im PR oder separates Ticket): Frontend soll die ID für UI-Korrelation nutzen.

---

## Follow-up außerhalb dieses Repos

- **El Frontend:** Store/Composable soll **`correlation_id`** aus REST mit WS **`actuator_command`** (Publish) und bei Bedarf **`actuator_response`** (ESP-ACK) matchen können — **eigenständiger** Frontend-Auftrag.

---

*Ende Auftrag 02.*
