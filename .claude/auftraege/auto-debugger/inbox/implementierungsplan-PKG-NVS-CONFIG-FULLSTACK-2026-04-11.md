# Implementierungsplan — PKG-NVS-CONFIG-FULLSTACK (Multi-Layer)

**Datum:** 2026-04-11  
**Branch (Produktcode):** `auto-debugger/work` — keine Commits auf `master`.  
**Incident:** `INC-NVS-CONFIG-CONSISTENCY-2026-04-11`  
**Quellen:** `IST-SYSTEM-REPORT.md`, `CODE-LAYER-MAP.md`, `TASK-PACKAGES.md`, Repo-`Read`/`Grep`.  
**Secrets:** keine.

---

## 1. IST-Code (Zitate-Anker)

### 1.1 Firmware — Mutex-Timeout und Heartbeat → NVS

```96:108:El Trabajante/src/services/config/storage_manager.cpp
bool StorageManager::beginTransaction() {
#ifdef CONFIG_ENABLE_THREAD_SAFETY
  if (nvs_mutex_ == nullptr) {
    return false;
  }
  if (xSemaphoreTakeRecursive(nvs_mutex_, pdMS_TO_TICKS(250)) != pdTRUE) {
    LOG_E(TAG, "StorageManager: beginTransaction lock timeout");
    return false;
  }
```

```2197:2199:El Trabajante/src/main.cpp
        if (strcmp(status, "approved") == 0 || strcmp(status, "online") == 0) {
            time_t approval_ts = server_time > 0 ? (time_t)server_time : timeManager.getUnixTimestamp();
            configManager.setDeviceApproved(true, approval_ts);
```

```1291:1308:El Trabajante/src/services/config/config_manager.cpp
void ConfigManager::setDeviceApproved(bool approved, time_t timestamp) {
  if (!storageManager.beginTransaction()) {
    LOG_E(TAG, "ConfigManager: Cannot save approval status - transaction error");
    return;
  }
  if (!storageManager.beginNamespace("system_config", false)) {
```

### 1.2 Server — DELETE und Response-Schema

```1135:1276:El Servador/god_kaiser_server/src/api/v1/sensors.py
async def delete_sensor(
    esp_id: str,
    config_id: uuid.UUID,
...
    return _model_to_response(sensor, esp_id, correlation_id=mqtt_correlation_id)
```

```336:348:El Servador/god_kaiser_server/src/schemas/sensor.py
class SensorConfigResponse(SensorConfigBase, TimestampMixin):
    ...
    esp_id: uuid.UUID = Field(
        ...,
        description="ESP device database ID (UUID)",
    )
```

### 1.3 Server — Telemetrie ohne Config

```238:259:El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py
                        sensor_config = await sensor_repo.get_by_esp_gpio_and_type(
                            esp_device.id, gpio, sensor_type
                        )
                        if not sensor_config:
                            logger.warning(
                                f"Sensor config not found: esp_id={esp_id_str}, gpio={gpio}, "
                                f"type={sensor_type}. Saving data without config."
                            )
...
                    if not sensor_config and quality not in ("error", "critical"):
                        quality = "degraded"
```

### 1.4 Frontend + Server-Texte

```81:87:El Frontend/src/shared/stores/config.store.ts
    } else {
      // Full error - all items failed
      toast.error(
        `${deviceName}: ${data.error_code || 'CONFIG_ERROR'} - ${data.message}`,
        { duration: 6000 }
      )
```

```1779:1784:El Servador/god_kaiser_server/src/core/esp32_error_mapping.py
    "NVS_WRITE_FAILED": {
        "category": "CONFIG",
        "severity": "ERROR",
        "message_de": "NVS-Speicherung fehlgeschlagen",
        "message_user_de": "Die Konfiguration konnte nicht im ESP32-Speicher gespeichert werden (Speicher voll oder beschädigt)",
```

---

## 2. SOLL (messbar)

| ID | SOLL | Messung |
|----|------|---------|
| S1 | Kein unnötiges NVS-Schreiben auf jedem Heartbeat-ACK | Serial: keine wiederholten Approval-Writes bei unverändertem Zustand; oder dokumentierte Queue |
| S2 | DELETE-Sensor API stabil | `pytest tests/integration/test_api_sensors.py` grün; Response-JSON parsebar im Client |
| S3 | Operator-Text passt zur Ursache | UI zeigt differenzierten Hinweis, sobald Firmware/Server einen Substatus liefert; sonst Server-Mapping anpassen |
| S4 | Observability | Config-Fehler-Logs enthalten `esp_id` + `correlation_id` |

---

## 3. Arbeitspakete (Closest-Pattern, Reihenfolge)

### PKG-A — P0-FW (vor oder parallel PKG-B je nach Team)

- **Pattern:** NVS-Zugriffe nur über `StorageManager`; keine zweite Mutex-Schicht.  
- **Änderung:** In `setDeviceApproved` / Heartbeat-Pfad: Schreiben nur wenn sich `approved` oder `timestamp` gegenüber NVS-Lesezustand geändert hat (RAM-Cache in `ConfigManager` oder minimaler „last written“-Vergleich — nächstliegende Stelle: bestehende Getter `isDeviceApproved` / `getApprovalTimestamp`).  
- **Nicht:** `delay()` in Hauptpfaden; kein Watchdog-Off.

### PKG-B — P0-SRV

- **Änderung:** DELETE-Response und ggf. Logging: sicherstellen, dass alle in JSON landenden UUIDs über FastAPI/Pydantic v2 oder explizite `str()` wo Drittanbieter `json.dumps` ohne Encoder.  
- **Test:** Integrationstest DELETE mit Assertion auf Response-Body-Felder.

### PKG-C — P1-FE

- **Änderung:** `config.store.ts`: wenn `data.detail` / zukünftiges `failure_class` Kontention signalisiert, Toast-Text anpassen; sonst Server `message_user_de` für NVS-Fehlercodes überarbeiten (ein Ort: `esp32_error_mapping.py`).

### PKG-D — P1-OBS

- **Änderung:** `config_handler` / `esp_service` — strukturierte Logs, bestehendes `request_id`-Pattern aus `request_context.py` wiederverwenden.

### PKG-E — P2-DOC

- Nur nach Kontrakt-Freeze und mit `/updatedocs`-Disziplin.

---

## 4. MQTT / REST / WS Kompatibilität

- **Keine** Breaking Changes an Topic-Pfaden oder WS-Event-Namen ohne separates Gate und Doku-Abgleich (`MQTT_TOPICS.md`, `WEBSOCKET_EVENTS.md`).  
- Optionale **additive** Felder in Logs oder WS-Payloads nur mit Frontend-Contract-Check.

---

## 5. Tests

| Schicht | Befehl |
|---------|--------|
| Server | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"; poetry run pytest tests/integration/test_api_sensors.py -q --tb=short` — **Windows-Fallback:** `.\.venv\Scripts\pytest.exe …` wenn `poetry` nicht im PATH |
| Server Lint | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"; poetry run ruff check src/` |
| Frontend | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"; npx vue-tsc --noEmit`; `npx vitest run` |
| Firmware | `cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"; pio run -e seeed_xiao_esp32c3` *(Env aus `platformio.ini` prüfen — nächstliegende produktive Env verwenden)* |

---

## 6. Verify-Block (PowerShell, volle `cd`-Pfade)

```powershell
cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one"
git checkout auto-debugger/work
git branch --show-current

cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one"
docker compose ps

cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_api_sensors.py -q --tb=short
# Falls poetry nicht im PATH: .\.venv\Scripts\pytest.exe tests/integration/test_api_sensors.py -q --tb=short
poetry run ruff check src/

cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend"
npx vue-tsc --noEmit
npx vitest run

cd "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e seeed_xiao_esp32c3
```

---

## 7. Risiken / Rollback

| Risiko | Mitigation | Rollback |
|--------|------------|----------|
| Firmware: Approval nicht mehr geschrieben wenn nötig | Unit-Logik + Grenzfälle `pending`/`online` testen | Git revert auf `auto-debugger/work` |
| Server: Response-Form ändert sich für Clients | Nur additive oder rückwärtskompatible Felder | Revert PKG-B |
| Falsche UI-Semantik | Feature-Flag oder schrittweise Textänderung | Revert PKG-C |

---

## 8. Abgrenzung

- **PKG-HW-02:** GPIO-Pin-Store / Refresh — nur erwähnen, wenn DELETE-WS Store-Update berührt; keine vollständige HW-02 hier.  
- **PKG-CAL-\*:** keine Kalibrier-Mathe, keine Mess-Session-Mutex-Änderungen.

---

## 9. verify-plan-Gate

Ergebnis: `VERIFY-PLAN-REPORT.md` im gleichen Incident-Ordner; Chat-Block **OUTPUT FÜR ORCHESTRATOR** wurde im Orchestrator-Lauf erzeugt.
