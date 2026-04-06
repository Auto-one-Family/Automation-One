# Auftrag Epic 1 — 03: Emergency-Stop — MQTT-Korrelation und Incident-Verknüpfung

**Datum:** 2026-04-05  
**Epic:** 1  
**Bezug Ist-Analyse:** AP-B, AP-G (K3) — GPIO-OFF-Publishes im Emergency-Pfad rufen **`publish_actuator_command` ohne `correlation_id`** auf; **`incident_correlation_id`** existiert nur in Metadata, Audit, Broadcast, WS `actuator_alert`.

---

## Problem (Ist)

- Jeder normale Actuator-Command trägt optional **`correlation_id`** im MQTT-Payload (wenn vom Publisher gesetzt).  
- **Emergency** sendet **viele** GPIO-Commands **ohne** diese ID — die ESP-Antworten (`actuator/.../response`) können serverseitig **nicht** ohne Heuristik dem **Incident** zugeordnet werden.  
- Das erschwert **E2E-Audit** („welche Responses gehörten zu Not-Aus-Request X?“) und Debug in deinem **AutomationOne**-Betrieb.

---

## Ziel (Soll)

**Mindestziel (Pflicht):** Jeder im Emergency-Pfad gesendete **`publish_actuator_command`**-Aufruf enthält im MQTT-JSON ein Feld **`correlation_id`**, dessen Wert **deterministisch aus** `incident_correlation_id` **und** dem Kontext **esp_id + gpio** ableitbar ist, z. B.:

- `f"{incident_correlation_id}:{esp_id}:{gpio}"` **oder**  
- UUID v5 über feste Namespace + obiger String — **wichtig ist Eindeutigkeit pro GPIO-Publish und Rückführbarkeit zum Incident**.

**Oberziel (wenn ohne Firmware-Risiko möglich):** Dieselbe Zeichenkette ist **kurz genug** und **URL/MQTT-sicher** (keine Sonderzeichen, die JSON oder Topic-Parsing brechen).

**Nicht-Ziel:** ESP-Firmware muss in diesem Auftrag **nicht** geändert werden; wenn die Firmware `correlation_id` bereits in Responses spiegelt, gewinnt man automatisch bessere Zuordnung. Wenn nicht, bleibt die Zuordnung **serverseitig** über die **gesendete** ID und ggf. synthetische Response-IDs laut bestehendem Handler.

---

## Einschränkungen

- **`incident_correlation_id`** bleibt der **menschlich lesbare** Oberbegriff in Audit/WS/Broadcast.  
- **Keine** Verlangsamung des Emergency-Pfads durch zusätzliche DB-Roundtrips pro GPIO (Batching wo sinnvoll).  
- **Broker-Last:** Anzahl der Publishes unverändert lassen.

---

## Umsetzungsschritte

*Hinweis (Pfad-Basis):* Die relativen Pfade `src/…`, `tests/…`, `docs/` und `CHANGELOG.md` in diesem Abschnitt beziehen sich auf **`El Servador/god_kaiser_server/`** (nicht auf das Monorepo-Root).

1. **`src/api/v1/actuators.py`** (`emergency_stop`): Pro GPIO-Aufruf **`correlation_id`** an `publish_actuator_command` übergeben (nach Festlegung des Formats).  
2. **`src/mqtt/publisher.py`:** Sicherstellen, dass übergebene `correlation_id` **tatsächlich** ins Payload-Dict kommt (Ist: nur wenn Argument gesetzt — dann muss der Aufrufer sie setzen).  
3. **`ActuatorRepository.log_command`** in **`src/db/repositories/actuator_repo.py`** / Metadata (`command_metadata` am Model): optional **`incident_correlation_id`** **und** pro-GPIO-`correlation_id` speichern, damit Support-Auswertung in der DB möglich ist (wenn Schema/Kosten vertretbar).  
4. **Tests:** Integration oder Unit: „Emergency publish enthält `correlation_id` im Payload-Dict“.  
5. **Dokumentation:** Ein Absatz in `docs/` (eigenständiger Markdown; ein dediziertes Notfall-Runbook liegt im Repo derzeit nicht vor) oder Ergänzung in `docs/analyse/report-server-epic1-ist-vertrag-korrelation-verdrahtung-2026-04-05.md`: „Emergency-Korrelation: Incident-ID + GPIO-ID“.

---

## Abnahmekriterien

- [ ] MQTT-Payload jedes Emergency-GPIO-Commands enthält **`correlation_id`** (Test mit Mock-`MQTTClient` oder Publisher-Hook).  
- [ ] `incident_correlation_id` bleibt in Audit und WS unverändert sichtbar.  
- [ ] Keine Regression in bestehenden Emergency-Tests (`tests/integration/test_emergency_stop.py` o. ä.).  
- [ ] Changelog-Eintrag in `CHANGELOG.md` (siehe Pfad-Basis unter „Umsetzungsschritte“).

---

## Risiko / Abstimmung Firmware

Falls die Firmware **keine** `correlation_id` in `actuator_response` zurückgibt, ist der Gewinn **serverseitig** in History/Audit; das ist für diesen Auftrag **ausreichend**. Ein **Firmware-Auftrag** „Echo `correlation_id`“ kann später folgen.

---

*Ende Auftrag 03.*
