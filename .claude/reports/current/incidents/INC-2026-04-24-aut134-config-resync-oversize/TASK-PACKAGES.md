# TASK-PACKAGES — INC-2026-04-24-aut134-config-resync-oversize

> **Status:** POST-VERIFY mutiert (Verify-Deltas bereits eingearbeitet)  
> **Branch-Pflicht für alle Pakete:** ausschließlich `auto-debugger/work`  
> **Keine Produkt-Implementierung im Orchestratorlauf**

---

## Übersicht

| PKG | Titel | Rolle | Prio | Blockiert durch |
|---|---|---|---|---|
| PKG-01 | Serverseitiger Config-Budget-Gate vor Auto-Push | server-dev | P0 | — |
| PKG-02 | Firmware Config-Oversize-Härtung + Correlation-Echo | esp32-dev | P0 | PKG-01 |
| PKG-03 | Heartbeat-Oversize (1024-Lane) entkoppeln/härten | esp32-dev + mqtt-dev | P1 | PKG-02 |
| PKG-04 | Operatorische Sicht auf Config-Reject-Kette | frontend-dev | P1 | PKG-01, PKG-02 |
| PKG-05 | Forensik-Vollkette CID -> DB -> Audit verifizieren | db-inspector (optional, empfohlen) | P1 | PKG-01 |

---

## PKG-01 — Serverseitiger Config-Budget-Gate vor Auto-Push (P0)

**Ziel:** Vor `publish_config` muss ein deterministischer Payload-Budget-Check erfolgen, damit bei erwartbarer Oversize kein Blind-Push ausgelöst wird.

**Scope (verify-korrigiert):**
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/services/esp_service.py`
- Optional helper in `src/services/config_builder.py` nur falls für Budget-Schätzung nötig.

**Mindeständerung:**
1. Bei Count-Mismatch vor `_auto_push_config()` Payloadgröße prüfen (serialisierte Config).
2. Bei Budgetüberschreitung:
   - kein unkontrollierter Retry-Burst,
   - Audit/WS-Ereignis mit klarer Ursache (`reason_code` + Größe),
   - `config_push_pending` sauber auflösen.

**Tests (verify-korrigiert):**
- `cd "El Servador/god_kaiser_server" && poetry run pytest tests/mqtt/test_heartbeat_handler.py -q`
- `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/services/test_esp_service_mock_config_response.py -q`

**Akzeptanzkriterien:**
- [ ] Kein Auto-Push ohne Budget-Vorabcheck bei Drift-Pfad.
- [ ] Bei Oversize wird ein klarer terminaler Serverpfad erzeugt (kein stilles Schleifenfenster).
- [ ] Commit nur auf `auto-debugger/work`.

---

## PKG-02 — Firmware Config-Oversize-Härtung + Correlation-Echo (P0)

**Ziel:** Oversize-Reject auf Firmwareseite muss reproduzierbar, korreliert und nicht-floodend sein.

**Scope (verify-korrigiert):**
- `El Trabajante/src/main.cpp` (Config-Ingress reject-Pfad)
- `El Trabajante/src/tasks/config_update_queue.cpp` (falls Requeue-/Retry-Effekt beteiligt)
- `El Trabajante/src/services/communication/mqtt_client.cpp` (nur wenn Correlation-Echo fehlt)

**Mindeständerung:**
1. Sicherstellen, dass `intent_outcome` für Config-Reject immer `correlation_id/intent_id/request_id` konsistent trägt.
2. Bei `Payload too large` keine sekundäre Retry-Flood-Kaskade auslösen.
3. Reason-Text deterministisch (`[CONFIG] Payload too large: <len> bytes, max=4096`).

**Tests (verify-korrigiert):**
- `cd "El Trabajante" && pio run -e esp32_dev`
- `cd "El Trabajante" && pio test -e native -f test_topic_builder`

**Akzeptanzkriterien:**
- [ ] Rejected-Outcome bleibt einmalig/terminal pro Versuch.
- [ ] Correlation-Felder sind bei Reject nicht leer.
- [ ] Commit nur auf `auto-debugger/work`.

---

## PKG-03 — Heartbeat-Oversize (1024-Lane) entkoppeln/härten (P1)

**Ziel:** Heartbeat darf in Zone-/Resync-Phasen die Publish-Lane nicht durch Oversize blockieren.

**Scope (verify-korrigiert):**
- `El Trabajante/src/tasks/publish_queue.h`
- `El Trabajante/src/tasks/publish_queue.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `docs/analysen/heartbeat-architektur-metrics-routing-2026-04-23.md` (Abgleich)

**Mindeständerung:**
1. Größe des Heartbeat-Core-Payloads im kritischen Pfad stabil unter 1024 halten.
2. Metriklast aus Core-Lane weiter separieren (AUT-121/AUT-133-kompatibel), ohne Contract-Bruch.
3. Oversize-Fall bleibt sichtbar, aber ohne Queue-Full-Sturm.

**Tests (verify-korrigiert):**
- `cd "El Trabajante" && pio run -e esp32_dev`
- `cd "El Trabajante" && pio test -e native -f test_topic_builder`
- Live-Check durch Robin: COM3 Monitor, kein `payload_len>1024` im Heartbeat über 10 Minuten.

**Akzeptanzkriterien:**
- [ ] Keine Heartbeat-Oversize-Rejects im Reconnect/Zone-Assign-Fenster.
- [ ] Kein regressiver Verlust an ACK-/Registration-Stabilität.
- [ ] Commit nur auf `auto-debugger/work`.

---

## PKG-04 — Operatorische Sicht auf Config-Reject-Kette (P1)

**Ziel:** Frontend zeigt reject-Ursache und Korrelation im bestehenden Muster klar an (kein Parallel-UI-Neubau).

**Scope (verify-korrigiert):**
- `El Frontend/src/shared/stores/actuator.store.ts` (falls Outcome-Routing dort endet)
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/utils/contractEventMapper.ts`
- `El Frontend/src/composables/useESPStatus.ts` (nur falls Reason-Rendering dort beteiligt)

**Mindeständerung:**
1. `intent_outcome` für `flow=config` mit `VALIDATION_FAIL` klar als terminales Reject darstellen.
2. Correlation-ID und Reason (`4164/4096`) für Operator sichtbar.
3. Keine Verwechslung mit Runtime-Health-Badge (`Eingeschränkt` bleibt separater Pfad).

**Tests (verify-korrigiert):**
- `cd "El Frontend" && npm run test -- tests/unit/composables/useESPStatus.test.ts`
- `cd "El Frontend" && npm run test -- tests/unit/stores/esp.test.ts`

**Akzeptanzkriterien:**
- [ ] Ein terminales UI-Ergebnis pro Korrelation.
- [ ] Ursache für Config-Reject ist im UI nachvollziehbar.
- [ ] Commit nur auf `auto-debugger/work`.

---

## PKG-05 — Forensik-Vollkette CID -> DB -> Audit verifizieren (P1, optional empfohlen)

**Ziel:** Für CID `f9f74534-...` die Persistenzkette in DB/Audit konkret belegen.

**Scope:**
- DB-Tabellen im laufenden Stack (`audit_logs`, `command_intents`, relevante ESP-Metadaten)
- Incident-Artefakt-Update in diesem Ordner (keine Produktcodeänderung)

**Ausführung:** `db-inspector`

**Akzeptanzkriterien:**
- [ ] CID-Spur inkl. Zeitstempel und Statusübergang dokumentiert.
- [ ] Fehlende Felder (`fingerprint`, `parent_notification_id`, `request_id`) klar als vorhanden/nicht vorhanden markiert.
- [ ] Ergebnis in Incident-Dokumenten nachgetragen.

---

## Cross-PKG-Abhängigkeiten

- PKG-01 -> PKG-02: Server muss zuerst den Push-Gate liefern, sonst bleibt Firmware im Oversize-Burst.
- PKG-02 -> PKG-03: Heartbeat-Lane-Härtung erst sinnvoll bewertbar, wenn Config-Reject-Kette stabil ist.
- PKG-01 + PKG-02 -> PKG-04: UI-Wiring erst nach stabiler, konsistenter Outcome-Kette finalisieren.

---

## BLOCKER

- Docker-Livekorrelation (Broker/Server/Alloy) für dasselbe Zeitfenster liegt nicht vollständig im Workspace vor.
- Für manche Evidenzen liegt nur User-Event/Serial vor, aber kein vollständiger Raw-Logdreiklang.
- DB-Stichprobe zu CID `f9f74534-...` noch nicht durchgeführt (PKG-05).
