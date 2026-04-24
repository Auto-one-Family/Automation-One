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
- `cd "El Trabajante" && pio test -e native -f test_topic_builder`

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
