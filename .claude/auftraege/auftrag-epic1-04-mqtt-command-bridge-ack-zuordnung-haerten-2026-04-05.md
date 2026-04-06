# Auftrag Epic 1 — 04: MQTTCommandBridge — ACK-Zuordnung härten (Zone/Subzone)

**Datum:** 2026-04-05  
**Epic:** 1  
**Bezug Ist-Analyse:** AP-C (K1) — **`resolve_ack`** löst bei fehlender/unkorrekter `correlation_id` auf **FIFO** pro `(esp_id, command_type)` auf → Risiko **falscher HTTP-Zuordnung** bei parallelen Zuweisungen.

---

## Problem (Ist)

- `send_and_wait_ack` legt **`correlation_id`** immer in den **ausgehenden** Payload.  
- Wenn das **ACK** vom ESP **keine** passende `correlation_id` enthält, wählt Strategie 2 das **älteste noch wartende** Future — das kann zu einem **anderen** API-Request gehören als das eintreffende ACK.

**Betroffene Kommandotypen:** mindestens **`zone`**, **`subzone`** (Bridge).  
**Subzone-REST assign** nutzt laut Analyse **kein** Bridge — dort anderes Risiko; dieser Auftrag fokussiert **Bridge**.

---

## Ziel (Soll) — wählbare Strategie (eine umsetzen, im PR begründen)

**Option A (bevorzugt, minimal-invasiv):**  
- Wenn eingehendes ACK **keine** gültige `correlation_id` hat oder diese nicht in `_pending` existiert: **kein** FIFO-Fallback mehr; **`resolve_ack` gibt `False` zurück**; der wartende HTTP-Call **läuft in Timeout** oder bekommt eine **explizite Fehler-Semantik** (je nach Aufrufer).  
- **Begründung:** Lieber **Timeout/Fehler** als **falsche** Zonen-Zuordnung in der DB.

**Option B (streng, firmware-abhängig):**  
- FIFO nur, wenn ein **Feature-Flag** „legacy_ack_matching“ aktiv ist; Standard **aus**.  
- Ops kann für alte Firmware temporär aktivieren.

**Option C (mittel):**  
- FIFO bleibt, aber **metrisch** und **log** als **WARN** mit `esp_id`, `command_type`, Queue-Länge — **allein** reicht für P0 nicht, ist aber Zusatz zu A/B.

**Empfehlung für AutomationOne-Produkt:** **Option A** als Default.

---

## Einschränkungen

- **Keine** Änderung der **Topic-Struktur**.  
- **Heartbeat**-Aufrufe der Bridge (Reconnect) müssen **getestet** werden — dort dürfen keine Deadlocks entstehen (Aufrufer: `src/mqtt/handlers/heartbeat_handler.py`, Code-Basis `El Servador/god_kaiser_server/`).  
- Wenn **ESP-Firmware** ACKs ohne `correlation_id` sendet, müssen nach Option A **mehr Timeouts** auftreten — das ist **akzeptabel**, wenn dokumentiert; parallel **Firmware-Auftrag** „ACK enthält immer `correlation_id` Echo“.

---

## Umsetzungsschritte

**Code-Basis:** `El Servador/god_kaiser_server/` — alle folgenden Pfade darunter.

1. **`src/services/mqtt_command_bridge.py`:** `resolve_ack` anpassen gemäß gewählter Option; Codepfade kommentieren **warum** kein FIFO mehr.  
2. **`src/mqtt/handlers/zone_ack_handler.py` / `src/mqtt/handlers/subzone_ack_handler.py`:** Sicherstellen, dass **`correlation_id`** aus dem Payload **zuverlässig** an `resolve_ack` übergeben wird (Ist: in beiden `payload.get("correlation_id")` im an `resolve_ack` übergebenen Dict — prüfen auf Alias-Felder aus Firmware).  
3. **`src/services/zone_service.py` (`ZoneService`):** Fehlerbilder bei Timeout vs. „ACK ohne Match“ in API-Responses **einheitlich** (keine falschen `ack_received=True`).  
4. **Tests:**  
   - Zwei parallele `send_and_wait_ack` für **dieselbe** `esp_id` und `command_type` mit **unterschiedlichen** IDs; erstes ACK **ohne** `correlation_id` darf bei Option A **nicht** das falsche Future lösen.  
   - Regression: Happy Path mit korrekter `correlation_id`.  
   - **Ist-Test anpassen:** `tests/unit/test_mqtt_command_bridge.py` enthält `test_resolve_ack_fallback_without_correlation_id` (erwartet FIFO ohne `correlation_id`); bei Option A **ersetzen oder umschreiben**, sonst rot.  
5. **Dokumentation:** Runbook „Zone assign schlägt fehl / timeout“ → Firmware-ACK prüfen; **Changelog:** `CHANGELOG.md` im selben Paket (`El Servador/god_kaiser_server/CHANGELOG.md`).

---

## Abnahmekriterien

- [ ] Kein automatisierter Test zeigt mehr **Fehlzuordnung** FIFO bei fehlendem `correlation_id` (neuer Testfall grün).  
- [ ] Bestehende Zone/Subzone-Integrationstests grün oder bewusst angepasst mit Begründung.  
- [ ] Metrics oder strukturierte Logs für „ACK dropped: no correlation match“ (mindestens Log-Zeile).  
- [ ] `El Servador/god_kaiser_server/CHANGELOG.md`: **Breaking behavior** für schlechte Firmware-ACKs beschrieben.

---

## Verknüpfung Subzone ohne Bridge

In **`SubzoneService.assign_subzone`** (fire-and-forget) **kein** `send_and_wait_ack` — dieser Auftrag **berührt das nicht**. Falls gewünscht, **separater** Auftrag „Subzone optional ACK-wait“.

---

*Ende Auftrag 04.*
