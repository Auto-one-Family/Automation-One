# SPECIALIST-PROMPTS — INC-NVS-CONFIG-CONSISTENCY-2026-04-11

Nach Verify angepasste PKG-Nummerierung siehe `TASK-PACKAGES.md`.

---

## Rolle: esp32-dev — PKG-01 (P0-FW)

**Scope:** NVS-Kontention zwischen Heartbeat-ACK (`setDeviceApproved`) und MQTT-Config (`sensor_config` / `system_config` Pfade).  
**IST:** `storage_manager.cpp` Mutex-Timeout 250 ms; `main.cpp` ruft bei jedem `approved|online`-ACK `setDeviceApproved(true, ts)`; `config_manager.cpp` schreibt NVS in `setDeviceApproved`.  
**SOLL:** Schreiben nur bei geändertem Zustand oder serieller NVS-Queue — **Closest-Pattern:** bestehende `StorageManager`-API erweitern, keine parallele Mutex-Welt.

### Git (Pflicht)
- Arbeitsbranch: **auto-debugger/work**. Vor Änderungen: `git checkout auto-debugger/work` und `git branch --show-current` verifizieren.  
- Commits nur auf diesem Branch; nicht auf `master`; kein `git push --force` auf Shared-Remotes.

### Pattern-Reuse (Pflicht)
- Vor Code: per `Grep`/`Glob` die **closest existing implementation** im gleichen Layer nennen und **dort** anbinden (`StorageManager`, `ConfigManager`, `handleSensorConfig` in `main.cpp`).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- NVS-Fehler erscheinen indirekt über MQTT `config_response` → WS — keine Vermischung mit ISA-Inbox ohne dediziertes PKG.

### Verify-Befehl (Pflicht)
- `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"; pio run -e seeed_xiao_esp32c3` — Exit-Code 0.

### Fehler-Register (Pflicht bei Code)
- Pro Fehler: Evidenz → Hypothese → Minimalfix → gleicher Verify-Befehl; Einträge in `.claude/reports/current/incidents/INC-NVS-CONFIG-CONSISTENCY-2026-04-11/FEHLER-REGISTER.md`.

---

## Rolle: server-dev — PKG-02, PKG-04

**PKG-02 Scope:** `DELETE /api/v1/sensors/{esp_id}/{config_id}` Response und UUID-JSON-Serialisierung; Tests in `tests/integration/test_api_sensors.py`.  
**PKG-04 Scope:** strukturierte Logs in `config_handler` / `esp_service` mit `correlation_id` + `esp_id`.

### Git (Pflicht)
- Wie oben: **auto-debugger/work** verpflichtend.

### Pattern-Reuse (Pflicht)
- Analogfälle: andere `response_model`-Endpoints mit UUID in `schemas/`; Logging wie in Nachbar-Handlern (`request_context`, structured logger).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- WS `sensor_config_deleted` vs. `config_response` klar trennen; Logs dürfen keine Secrets enthalten.

### Verify-Befehl (Pflicht)
- `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"; poetry run pytest tests/integration/test_api_sensors.py -q --tb=short`  
- **Windows:** falls `poetry` fehlt: `.\.venv\Scripts\pytest.exe tests/integration/test_api_sensors.py -q --tb=short`  
- `poetry run ruff check src/` (oder `.\.venv\Scripts\ruff.exe check src/` falls vorhanden)

### Fehler-Register (Pflicht bei Code)
- Wie esp32-dev; dieselbe `FEHLER-REGISTER.md`.

---

## Rolle: frontend-dev — PKG-03

**Scope:** `config.store.ts` — Toasts zu `config_response`; Abstimmung mit Server-`message` / künftigen Subcodes; keine zweite Notification-Welt.

### Git (Pflicht)
- **auto-debugger/work** — siehe Muster oben.

### Pattern-Reuse (Pflicht)
- Bestehende Toast- und Store-Patterns (`useToast`, `contractEventMapper`, `esp.ts`-Dispatcher).

### Frontend-Alert-Pfad / Backend-Observability (Pflicht)
- Transiente WS-Fehler vs. persistierte Inbox nicht vermischen.

### Verify-Befehl (Pflicht)
- `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"; npx vue-tsc --noEmit`  
- `npx vitest run`

### Fehler-Register (Pflicht bei Code)
- Wie oben.
