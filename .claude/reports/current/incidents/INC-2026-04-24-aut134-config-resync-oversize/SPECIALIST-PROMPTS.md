# SPECIALIST-PROMPTS — INC-2026-04-24-aut134-config-resync-oversize

> **Stand:** Post-Verify, rollenweise konsolidiert  
> **Reihenfolge:** PKG-01 -> PKG-02 -> PKG-03/PKG-04 parallel, PKG-05 optional

---

## Rolle: `server-dev` — Start mit PKG-01

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
Harte Config-Budget-Prüfung vor Auto-Resync implementieren, damit Count-Mismatch nicht in Oversize-Burst endet.

### Scope
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
- `El Servador/god_kaiser_server/src/services/esp_service.py`
- optional helper in `src/services/config_builder.py`

### IST/SOLL
- IST: `_has_pending_config()` triggert `_auto_push_config()` bei Count-Drift; Oversize kann downstream erst in Firmware scheitern.
- SOLL: Vor Push wird serialisierte Payloadgröße geprüft; Oversize führt zu klarer terminaler Behandlung ohne Push-Loop.

### Verifikation
- `cd "El Servador/god_kaiser_server" && poetry run pytest tests/mqtt/test_heartbeat_handler.py -q`
- `cd "El Servador/god_kaiser_server" && poetry run pytest tests/unit/services/test_esp_service_mock_config_response.py -q`

### Abhängigkeit
- Dieses Paket ist Startpunkt für PKG-02/04.

---

## Rolle: `esp32-dev` — danach PKG-02, dann PKG-03-Anteil

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag (PKG-02)
Config-Oversize-Reject-Pfad deterministisch halten und Correlation-Echo für `intent_outcome` sicherstellen.

### Scope (PKG-02)
- `El Trabajante/src/main.cpp`
- optional `El Trabajante/src/tasks/config_update_queue.cpp`
- optional `El Trabajante/src/services/communication/mqtt_client.cpp`

### IST/SOLL (PKG-02)
- IST: Reject bei `payload_len >= CONFIG_PAYLOAD_MAX_LEN` ist vorhanden.
- SOLL: Reject ist terminal, korreliert (`correlation_id/request_id/intent_id`) und ohne Folgeburst.

### Auftrag (PKG-03-Anteil)
Heartbeat-Core unter 1024 stabilisieren, ohne ACK-/Registration-Verhalten zu brechen.

### Scope (PKG-03-Anteil)
- `El Trabajante/src/tasks/publish_queue.h`
- `El Trabajante/src/tasks/publish_queue.cpp`
- `El Trabajante/src/services/communication/mqtt_client.cpp`

### Verifikation
- `cd "El Trabajante" && pio run -e esp32_dev`
- `cd "El Trabajante" && pio test -e native -f test_topic_*`

### Abhängigkeit
- PKG-02 startet nach PKG-01.
- PKG-03-Anteil startet nach PKG-02.

---

## Rolle: `mqtt-dev` — PKG-03-Co-Owner

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
MQTT-Contract-/Topic-Seite so schärfen, dass Heartbeat-Oversize nicht erneut über Topic-/Payload-Drift entsteht.

### Scope
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Trabajante/src/tasks/publish_queue.cpp`
- `docs/analysen/heartbeat-architektur-metrics-routing-2026-04-23.md`
- `.claude/reference/api/MQTT_TOPICS.md` (nur falls Contract-Doku angepasst werden muss)

### IST/SOLL
- IST: Oversize-Rejects `payload_len=1225..1229` im COM3-Fenster.
- SOLL: Kein Heartbeat-Oversize im Reconnect-/Zone-Assign-Fenster; Contract bleibt rückwärtskompatibel.

### Verifikation
- `cd "El Trabajante" && pio run -e esp32_dev`
- Live-Check mit Robin: COM3 über 10 Minuten ohne Heartbeat-Oversize-Reject.

### Abhängigkeit
- Start nach PKG-02.

---

## Rolle: `frontend-dev` — PKG-04

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
Config-Reject (`flow=config`, `VALIDATION_FAIL`, Payload-oversize) im bestehenden UI-Muster klar und terminal anzeigen.

### Scope
- `El Frontend/src/stores/esp.ts`
- `El Frontend/src/utils/contractEventMapper.ts`
- `El Frontend/src/shared/stores/actuator.store.ts` (nur falls Lifecycle-Finalität dort betroffen)
- optional `El Frontend/src/composables/useESPStatus.ts` (keine Vermischung mit Runtime-Health)

### IST/SOLL
- IST: Rejection-Ursachen sind operatorisch nicht durchgehend klar zuordenbar.
- SOLL: Pro Korrelation genau ein terminales Ergebnis mit sichtbarer Ursache (`4164/4096`) und CID.

### Verifikation
- `cd "El Frontend" && npm run test -- tests/unit/stores/esp.test.ts`
- `cd "El Frontend" && npm run test -- tests/unit/composables/useESPStatus.test.ts`

### Abhängigkeit
- Start erst nach stabiler Server/Firmware-Kette (PKG-01 + PKG-02).

---

## Rolle: `db-inspector` (optional, empfohlen) — PKG-05

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
CID `f9f74534-5c3a-4735-876f-4c3132cec644` durch DB/Audit verfolgen und Lücken in `request_id/fingerprint/parent_notification_id` explizit markieren.

### Scope
- Laufende DB-Tabellen im Stack (`audit_logs`, `command_intents`, ggf. notification-bezogene Tabellen)
- Update der Incident-Artefakte in diesem Ordner

### Verifikation
- Nachweisbare Zeitlinie CID -> Status -> Source im Incident-Report.

### Abhängigkeit
- Kann nach PKG-01 parallel zu PKG-02/03 laufen.

---

## Rolle: `esp32-dev` — PKG-06 (parallel zu PKG-01/02 möglich, P0)

### Git (Pflicht)
- Arbeitsbranch: **`auto-debugger/work`**.
- Vor allen Dateiänderungen: `git checkout auto-debugger/work` und mit `git branch --show-current` verifizieren.
- Alle Commits dieses Auftrags nur auf diesem Branch; **kein** Commit direkt auf `master`; kein `git push --force` auf Shared-Remotes.

### Auftrag
`max_runtime_ms` (RuntimeProtection) darf bei R20-P11 „config unchanged, skipping“ **nicht** verworfen werden. Siehe `actuator_manager.cpp` ca. Z. 225–277: `soft_changed` ohne `runtime_protection`, Soft-Update kopiert `max_runtime_ms` nicht.

### Scope
- `El Trabajante/src/services/actuator/actuator_manager.cpp` (Hauptfix)
- ggf. `El Trabajante/src/services/actuator/actuator_drivers/pump_actuator.cpp` (`setRuntimeProtection` nach in-place-Update)

### Verifikation
- Manuell/Mini-Test: JSON mit geändertem `max_runtime_ms`, sonst identischen Feldern; NVS + Treiber müssen neuen Wert annehmen; kein früher Return bei Z. 245–250.
- `cd "El Trabajante" && pio run -e esp32_dev`

### Abhängigkeit
- Unabhängig von Oversize-Paketen; mit AUT-132/Config-Sync-Thema inhaltlich verwandt.

---

## Rolle: `esp32-dev` — PKG-07 (P2, Kosmetik/Diagnostik)

### Git (Pflicht)
- Wie oben, Branch **`auto-debugger/work`**.

### Auftrag
In `config_manager.cpp` `saveSensorConfig`/`saveSensor` Dedup-Schleife: `getString` für `sen_%d_type` / Legacy nur nach `keyExists` oder via `migrateReadString`, damit Serial nicht mit `[E] NOT_FOUND` zugespammt wird.

### Scope
- `El Trabajante/src/services/config/config_manager.cpp` (ca. Z. 1722–1740)

### Verifikation
- Config-Push-Szenario: keine wiederholten `Preferences.cpp:483` Fehler pro Sensor-Update im Happy-Path.
- `cd "El Trabajante" && pio run -e esp32_dev`

---

## Rolle: `server-dev` — PKG-08 (P2, Erwartung/Transparenz)

### Git (Pflicht)
- Wie oben, Branch **`auto-debugger/work`**.

### Auftrag
Klären/dokumentieren, warum `offline_rules` im Config (bis zu `MAX_OFFLINE_RULES`) von der „Anzahl sichtbarer“ Logik-Regeln in der UI abweichen kann; optional Meta- oder Audit-Feld ohne Schema-Bruch (abstimmen mit `mqtt-dev` / TM).

### Scope
- `El Servador/god_kaiser_server/src/services/config_builder.py` (`_build_offline_rules`, Kappung)
- ggf. kurze Doku: `docs/analysen/…` oder Server-interne README — nur nach Abgleich `forbidden` der Steuerdatei

### Verifikation
- Review-Abnahme: Operator versteht „6 im Log, 1 in UI“ ohne false-positive Bug-Report.
