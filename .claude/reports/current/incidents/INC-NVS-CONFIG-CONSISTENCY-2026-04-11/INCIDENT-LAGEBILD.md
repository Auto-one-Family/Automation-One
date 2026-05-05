# INCIDENT-LAGEBILD — INC-NVS-CONFIG-CONSISTENCY-2026-04-11

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-nvs-config-konsistenz-server-esp-frontend-2026-04-11.md`  
**Zeitraum:** 2026-04-11 (Analyse-Lauf; Live-Serial-Belege nur mit lokalem Operator-Zugriff verifizierbar)  
**Git-Branch (Soll / IST):** `auto-debugger/work` — verifiziert am Laufstart.

## Symptomcluster (Scope aus STEUER)

| # | Schicht | Symptom (zu falsifizieren/verifizieren) | Evidence-Typ |
|---|---------|------------------------------------------|----------------|
| 1 | Firmware | `StorageManager: beginTransaction|beginNamespace lock timeout` (250 ms), danach `NVS_WRITE_FAILED` / Speichern Sensor-Config | Serial / Code: `storage_manager.cpp` |
| 2 | Server | `DELETE /api/v1/sensors/...` → `TypeError: Object of type UUID is not JSON serializable` | Runtime-Log / pytest |
| 3 | Server/Telemetrie | `Sensor config not found` für GPIOs ohne DB-Zeile; `quality=degraded` (PKG-HW-01) | `sensor_handler.py`, Logs |
| 4 | Frontend | Toasts zu NVS-Fehlern mit Text „Speicher voll oder beschädigt“ vs. Lock-Kontention | `esp32_error_mapping.py`, `config.store.ts` |

## Betroffene IDs (Beispiel aus STEUER)

- Referenz-ESP: `ESP_EA5484` (nur als Steuer-Beispiel; keine Secrets).

## Pattern-Scan (Pflicht, Closest Implementation)

| Schicht | Nächstliegende Implementation | Repo-Pfad |
|--------|------------------------------|-----------|
| Firmware NVS | `StorageManager` Mutex 250 ms, `ConfigManager::setDeviceApproved` nutzt `beginTransaction` + `system_config` NS | `El Trabajante/src/services/config/storage_manager.cpp`, `config_manager.cpp` |
| Firmware ACK | Jeder Heartbeat-ACK mit `status approved|online` ruft `setDeviceApproved(true, ts)` | `El Trabajante/src/main.cpp` (Heartbeat-Block) |
| Server Delete | `delete_sensor` → DB delete → `send_config` → WS `sensor_config_deleted` → `_model_to_response` | `El Servador/god_kaiser_server/src/api/v1/sensors.py` |
| Server Ingest | Lookup fehlgeschlagen → Warnlog + `quality = "degraded"` | `sensor_handler.py` |
| Frontend Config-WS | `useConfigStore.handleConfigResponse` → Toast aus `data.message` / `error_code` | `El Frontend/src/shared/stores/config.store.ts` |
| Operator-Text DE | `message_user_de` für Code 2003 / String-Key `NVS_WRITE_FAILED` | `esp32_error_mapping.py` |

## ISA / WS-Transient (Abgrenzung)

- Persistierte ISA-/Inbox-Alerts (`NotificationRouter`) und **transiente** `config_response` / `error_event` über WebSocket **nicht** ohne Request-/MQTT-Korrelation zur selben Root-Cause zusammenlegen.

## Konsolidierung (`konsolidierung_step: single`)

- **Ein** Konsolidierungsschritt in diesem Lauf: Incident-Lagebild + `IST-SYSTEM-REPORT` + `CODE-LAYER-MAP` + `implementierungsplan-PKG-NVS-CONFIG-FULLSTACK` + Verify-Gate; Folgearbeiten nur als nummerierte PKGs im Plan/TASK-PACKAGES.

## Eingebrachte Erkenntnisse

- **2026-04-11 — Orchestrator:** `docker compose ps` zeigt Kernstack healthy (`el-servador`, `el-frontend`, `postgres`, `mqtt-broker`, Monitoring). Siehe `IST-SYSTEM-REPORT.md` Abschnitt S1.
- **2026-04-11 — Orchestrator:** `SensorConfigResponse.esp_id` ist im Schema explizit `uuid.UUID` (`schemas/sensor.py`); DELETE-Response baut `_model_to_response(sensor, esp_id, …)` nach DB-Delete — UUID-Serialisierungs-Fehler ist **Hypothese** bis reproduzierender Stack (Middleware/Logging/Custom JSON) vorliegt; P0-SRV = Absicherung + Regressionstest.

## BLOCKER

- Keine harten BLOCKER für **Analyse/Plan**-Phase. **Hardware-NVS-Race** für finale Abnahme: reale Serial-Capture unter Last empfohlen (nicht Wokwi-NVS-Limit beachten).
