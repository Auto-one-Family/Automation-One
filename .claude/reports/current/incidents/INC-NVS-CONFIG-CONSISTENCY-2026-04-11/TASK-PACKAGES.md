# TASK-PACKAGES — INC-NVS-CONFIG-CONSISTENCY-2026-04-11

**Branch:** Alle Produkt-Commits nur auf `auto-debugger/work`.  
**Post-Verify:** Diese Datei wurde nach `VERIFY-PLAN-REPORT.md` angepasst (Testpfade, Agent-Pfade, Docker-Namen).

---

## PKG-01 — P0-FW: NVS-Kontention / `setDeviceApproved`

- **Owner:** esp32-dev  
- **Risiko:** Mittel (Timing, Hardware)  
- **Ziel:** NVS-Schreiblast reduzieren: `setDeviceApproved(true, ts)` nur bei **tatsächlicher Änderung** von Approved/Timestamp, oder zentrale Serialisierung der NVS-Schreibpfade (Closest-Pattern: bestehende `StorageManager`-Transaktion, keine zweite Mutex-Welt).  
- **Dateien:** `El Trabajante/src/main.cpp`, `El Trabajante/src/services/config/config_manager.cpp`, `El Trabajante/src/services/config/storage_manager.cpp`  
- **Tests:** `pio run -e seeed_xiao_esp32c3` oder Projekt-Default-Env aus `platformio.ini`; optional Wokwi-Szenarien unter `El Trabajante/tests/wokwi/scenarios/10-nvs/` (NVS in Sim eingeschränkt — siehe `verify-plan` Anhang Wokwi).  
- **Akzeptanz:** Kein wiederholtes `beginTransaction lock timeout` bei stabiler Verbindung und periodischem Heartbeat-ACK ohne Config-Änderung; oder nachweislich dokumentierte Backoff-Strategie + Operator-Hinweis.

## PKG-02 — P0-SRV: DELETE-Sensor Response / UUID-JSON

- **Owner:** server-dev  
- **Risiko:** Niedrig  
- **Ziel:** `DELETE` liefert stabil serialisierbare JSON-Response; falls `esp_id` als UUID im Response-Body Probleme macht: explizit `str`/`field_serializer` Pattern analog zu anderen Responses; Regressionstest.  
- **Dateien:** `El Servador/god_kaiser_server/src/api/v1/sensors.py`, `El Servador/god_kaiser_server/src/schemas/sensor.py`  
- **Tests:** `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"; poetry run pytest tests/integration/test_api_sensors.py -q --tb=short` — alternativ `.\.venv\Scripts\pytest.exe` (Windows ohne Poetry-PATH)  
- **Akzeptanz:** DELETE-Integrationstest grün; kein `TypeError: … UUID … JSON serializable` im relevanten Pfad.

## PKG-03 — P1-FE: Toast-Semantik NVS vs. Timeout

- **Owner:** frontend-dev  
- **Risiko:** Niedrig  
- **Ziel:** UI-Texte unterscheiden **Lock/Timeout/Kontention** vs. **echter NVS-Schreibfehler**, sobald Server/Firmware Subcode oder klarere `message` liefern; interim: Mapping in `config.store.ts` nur wenn Payload-Felder vorhanden (keine erfundenen Keys). Server-seitig: `esp32_error_mapping.py` prüfen auf einheitliche `message_user_de`.  
- **Dateien:** `El Frontend/src/shared/stores/config.store.ts`, ggf. `El Servador/.../esp32_error_mapping.py`  
- **Tests:** `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"; npx vitest run` (gezielte Store-Tests erweitern falls nötig)  
- **Akzeptanz:** Kein irreführender „Speicher voll“-Text bei reiner Kontention, sofern Backend entsprechende Unterscheidung liefert.

## PKG-04 — P1-OBS: strukturierte Logs ConfigResponse-Failures

- **Owner:** server-dev  
- **Risiko:** Niedrig  
- **Ziel:** Bestehendes strukturiertes Logging (`request_id`, `correlation_id`, `esp_id`) in `config_handler` / Publish-Pfad bei Fehlschlag vervollständigen — **keine** Schema-Breaking-Changes an MQTT/WS ohne separates Gate.  
- **Dateien:** `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py`, ggf. `esp_service.py`  
- **Tests:** gezielte Unit-Tests im MQTT-Handler-Verzeichnis (`poetry run pytest tests/unit/...`)  
- **Akzeptanz:** Log-Zeile enthält mindestens `esp_id` + `correlation_id` bei dokumentiertem Fehlerpfad.

## PKG-05 — P2-DOC (optional, nach Code-Freeze)

- **Owner:** TM / updatedocs  
- **Ziel:** `.claude/reference/api/MQTT_TOPICS.md`, `WEBSOCKET_EVENTS.md`, `ERROR_CODES.md` minimal ergänzen **nur** bei Kontraktänderung.  
- **Abgrenzung:** Keine PKG-CAL-* Mathe, keine vollständige PKG-HW-02.

---

## Verify-Übernahme (aus VERIFY-PLAN-REPORT)

- Docker-Service-Namen: `mqtt-broker`, `el-servador`, `el-frontend`, `postgres` (nicht generische Kurznamen).  
- Server-Dev-Agent-Pfad: `.claude/agents/server/server_dev_agent.md` (snake_case-Dateiname).  
- pytest immer mit `cd` in `god_kaiser_server` + `poetry run pytest`.
