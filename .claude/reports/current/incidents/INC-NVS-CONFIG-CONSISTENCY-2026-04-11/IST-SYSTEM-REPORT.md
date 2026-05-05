# IST-SYSTEM-REPORT — NVS / Config-Konsistenz (Multi-Layer)

**Incident:** `INC-NVS-CONFIG-CONSISTENCY-2026-04-11`  
**Referenz-Steuerung:** `.claude/auftraege/auto-debugger/inbox/STEUER-nvs-config-konsistenz-server-esp-frontend-2026-04-11.md`  
**Keine erfundenen Log-Zitate:** Serial-/Server-Zeilen nur mit **Hypothese**-Label, wenn nicht lokal gesichert.

---

## 1. Kontext / Zeitraum

- Analyse- und Repo-IST-Erfassung: **2026-04-11**.  
- Ziel: End-to-end Einordnung von NVS-Locks, DELETE-Sensor, Telemetrie ohne DB-Config, Frontend-Toasts.

## 2. Phase S1 — Docker-Service-Health (Stichprobe)

**Befehl (lokal ausgeführt):** `docker compose ps` im Repo-Root.

| Service | STATUS (Auszug) |
|---------|-----------------|
| `postgres` | Up (healthy) |
| `mqtt-broker` | Up (healthy) |
| `el-servador` | Up (healthy), Port 8000 |
| `el-frontend` | Up (healthy), Port 5173 |
| `alloy`, `loki`, `grafana`, `prometheus` | Up (healthy bzw. running) |

## 3. Phase S2 — MQTT-Pfade (Code-Verankerung)

| Thema | Fundstelle |
|-------|------------|
| Kombinierte Config-Publish-Kette | `El Servador/god_kaiser_server/src/services/esp_service.py` (`send_config` → `publish_config`) |
| Sensor-Telemetrie-Ingest | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| Config-Ack-Pipeline | `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` (siehe Modul-Docstring zu NVS_WRITE_FAILED) |

**Abgleich:** `.claude/reference/api/MQTT_TOPICS.md` bei Implementierung erneut lesen (kein blindes Rewrite).

## 4. Phase S3 — WebSocket-Events (Config-relevant)

| Event | Frontend-Einstieg |
|-------|-------------------|
| `config_response` | `El Frontend/src/stores/esp.ts` registriert Handler; delegiert zu `useConfigStore().handleConfigResponse` |
| `sensor_config_deleted` | `esp.ts` `handleSensorConfigDeleted` (siehe Kommentar nahe WS-Registrierung) |
| `config_published` / `config_failed` | `config.store.ts` |

Referenz: `.claude/reference/api/WEBSOCKET_EVENTS.md`.

## 5. Phase S4 — UI-Flow / Toasts

| Verhalten | Code |
|-----------|------|
| Erfolg / Fehler aus `config_response` | `El Frontend/src/shared/stores/config.store.ts` — `toast.success` / `toast.error` mit `data.message`, `data.error_code`, `failures[]` |
| Deutsche Endnutzer-Texte zu ESP-Fehlercodes | `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` — z. B. `2003` und String-Key `NVS_WRITE_FAILED` mit `message_user_de` |

**Semantik-Hinweis:** `message_user_de` für `NVS_WRITE_FAILED` lautet sinngemäß „…Speicher voll oder beschädigt“ — das kann von einem reinen **Mutex-Timeout** auf der Firmware abweichen (**Hypothese:** Operator sieht Speicher-Fehler, obwohl Ursache Kontention).

## 6. Phase S5 — Firmware: Task / Core / NVS

| Mechanismus | Code |
|---------------|------|
| Mutex-Timeout 250 ms | `El Trabajante/src/services/config/storage_manager.cpp` — `pdMS_TO_TICKS(250)` in `beginTransaction` und `beginNamespace` |
| Heartbeat-ACK → Approval in NVS | `El Trabajante/src/main.cpp` — bei `status == "approved" \|\| "online"` wird `configManager.setDeviceApproved(true, approval_ts)` aufgerufen |
| `setDeviceApproved` schreibt NVS | `El Trabajante/src/services/config/config_manager.cpp` — `beginTransaction` → `beginNamespace("system_config", false)` → `putBool` / `putULong` |

## 7. Phase S6 — Server: DELETE-Pipeline

| Schritt | Code |
|---------|------|
| `DELETE /{esp_id}/{config_id}` | `El Servador/god_kaiser_server/src/api/v1/sensors.py` `delete_sensor` |
| WS nach Delete | `broadcast("sensor_config_deleted", { "config_id": str(config_id), "esp_id": esp_id, ... })` |
| HTTP-Response | `return _model_to_response(sensor, esp_id, correlation_id=mqtt_correlation_id)` — `SensorConfigResponse.esp_id` ist `uuid.UUID` im Schema (`schemas/sensor.py`) |

**Hypothese (UUID-JSON):** Öffentlicher FastAPI-JSON-Response-Path serialisiert UUID typischerweise korrekt; ein gemeldeter `TypeError` deutet auf **Nebenpfad** (z. B. Logging, manuelles `json.dumps`, Test-Double) hin — mit pytest eingrenzen (PKG-02).

## 8. Telemetrie ohne DB-Config

- Warnlogs: `Sensor config not found` / I2C / OneWire-Varianten in `sensor_handler.py` (ca. Zeilen 218–247).  
- `quality`: wenn keine `sensor_config` und Quality nicht bereits `error`/`critical` → **`degraded`** (PKG-HW-01, Code ab Zeile ~255).

---

## 9. Risiko / Annahmen

- Live-Serial-Snippets aus `ESP_EA5484` liegen nicht im Repo → **Hypothese** H1/H3 bleiben bis Hardware-Replay offen.  
- Wokwi ersetzt NVS-Realität nicht vollständig — Firmware-Abnahme nicht nur über Simulation.
