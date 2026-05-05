# Implementierungsplan — PKG-HW-01 Sensor-Delete / ESP-Config-Sync / Telemetrie ohne DB-Config

**Datum:** 2026-04-11  
**Branch (Produktcode):** `auto-debugger/work` (keine Commits auf `master`)  
**Paket-ID:** `PKG-HW-01`  
**Incident / Analyse:** `ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11`  
**Quellen:** `TASK-PACKAGES.md`, `VERIFY-PLAN-REPORT.md`, `docs/analysen/BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md`  
**Secrets:** keine Keys/Tokens in diesem Dokument

---

## 1. IST-Zustand (Code, repo-verifiziert)

### 1.1 REST Delete-Pipeline

`DELETE /api/v1/sensors/{esp_id}/{config_id}` implementiert in `delete_sensor`: DB-Löschung per Primary Key, Subzone-Cleanup wenn keine Sensoren mehr auf dem GPIO, `rebuild_simulation_config`, Scheduler-Job-Entfernung (nur wenn GPIO leer), anschließend **Rebuild** der kombinierten Config und **`ESPService.send_config`**, danach WebSocket **`sensor_config_deleted`**.

```1135:1275:El Servador/god_kaiser_server/src/api/v1/sensors.py
async def delete_sensor(
    esp_id: str,
    config_id: uuid.UUID,
    ...
    await sensor_repo.delete(sensor.id)
    ...
    combined_config = await config_builder.build_combined_config(esp_id, db)
    esp_service: ESPService = get_esp_service(db)
    config_sent = await esp_service.send_config(esp_id, combined_config)
    ...
    await ws_manager.broadcast(
        "sensor_config_deleted",
        {
            "config_id": str(config_id),
            "esp_id": esp_id,
            "gpio": gpio,
            "sensor_type": sensor.sensor_type,
        },
    )
    # Rückgabe: _model_to_response(..., correlation_id=mqtt_correlation_id) — letzte MQTT-Config-Push-ID ist bereits im Delete-Response verankert (Zeilen 1274–1275).
```

**Verify-Plan-Hinweis (Repo-Stand):** `delete_sensor` setzt `mqtt_correlation_id` aus `send_config` und gibt `return _model_to_response(sensor, esp_id, correlation_id=mqtt_correlation_id)` zurück — Schritt „correlation_id in Delete-Response“ aus älteren Planfassungen ist **im Code bereits vorhanden**; Restarbeit = Tests/Doku/Frontend-Konsum prüfen, nicht erneut einbauen.

### 1.2 Config-Payload und MQTT

`ConfigPayloadBuilder.build_combined_config()` lädt die **verbleibenden** Sensor-/Aktor-Modelle aus der DB und baut das ESP-Payload; Übergabe an `send_config`, Publish über `publisher.publish_config()` (Topic laut Doku: `kaiser/{kaiser_id}/esp/{esp_id}/config`).

```368:460:El Servador/god_kaiser_server/src/services/esp_service.py
    async def send_config(
        self,
        device_id: str,
        config: Dict[str, Any],
        ...
        success = self.publisher.publish_config(
            esp_id=device_id,
            config=config_with_correlation,
        )
```

Architektur-Kommentar im Builder (Einordnung):

```113:126:El Servador/god_kaiser_server/src/services/config_builder.py
class ConfigPayloadBuilder:
    ...
    ARCHITEKTUR:
        1. Sensor/Actuator CRUD API führt DB-Operation durch
        2. build_combined_config() lädt alle Sensoren/Aktoren eines ESP aus DB
        ...
        6. MQTT Publisher sendet an: kaiser/{kaiser_id}/esp/{esp_id}/config
```

### 1.3 Ingest ohne passende `sensor_configs`-Zeile

`SensorMQTTHandler` sucht Config per GPIO/Typ (ggf. OneWire/I2C-Adresse). Fehlt die Zeile, wird **gewarnt** und trotzdem persistiert — **ohne** Pi-Enhanced-Pfad. Es gibt **drei** Warnpfade (I2C / OneWire / Standard-GPIO); zudem setzt der Handler bei fehlender Config die **`quality`** auf **`degraded`** (sofern nicht bereits `error`/`critical`) — siehe Block direkt nach den Lookups.

Siehe zusammenhängend im Repo: **Zeilen 217–235** (I2C-/OneWire-Warnungen), **236–246** (Standard-Lookup + Warnung), **248–258** (`raw`/`raw_mode`/`quality`-Initialisierung), **255–258** (PKG-HW-01: **`degraded`** wenn keine `sensor_config`).

```248:258:El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py
                    raw_value = float(payload.get("raw", payload.get("raw_value")))
                    raw_mode = payload.get("raw_mode", True)
                    value = payload.get("value", 0.0)
                    quality = payload.get("quality", "unknown")
                    # PKG-HW-01: Ingest without matching sensor_configs row — not "good" path;
                    # keeps operator/observability distinct from calibrated good readings.
                    if not sensor_config and quality not in ("error", "critical"):
                        quality = "degraded"
```

**Verify-Plan-Hinweis:** Schritt „Ingest entschärfen“ aus Plan §3 ist **teilweise bereits umgesetzt** (`degraded`); Rest = Tests, Metriken, Frontend-Auswertung, keine doppelte Logik einführen.

**Nachprüfung 2026-04-11 (verify-plan + /do):** `degraded` muss in **`QUALITY_LEVELS`** (`src/schemas/sensor.py`) stehen und von **`_validate_payload`** akzeptiert werden — sonst würde ein ESP, der selbst `quality: "degraded"` mitschickt, fälschlich abgewiesen. Validierung nutzt nun **`QUALITY_LEVELS`** zentral. WebSocket **`sensor_config_deleted`** sendet **`sensor_type`** aus **`deleted_sensor_type`** (nicht `sensor.sensor_type` nach DB-Delete).

### 1.4 Firmware: Listen-Sync nach Config-Push (Repo-Stand, angepasst)

**Frühere Annahme** („nur Add, kein Remove aus RAM/NVS“) ist **überholt**: `handleSensorConfig` synchronisiert die Sensorliste mit dem Server-Payload, sobald die Anwendung **vollständig erfolgreich** war (`fail_count == 0`), und behandelt **leeres** `sensors`-Array (aktuator-only / alle Sensoren entfernt).

```3732:3740:El Trabajante/src/main.cpp
  if (total == 0) {
    // Empty sensor array is valid for actuator-only ESPs — drop stale RAM/NVS sensors (PKG-HW-01)
    LOG_I(TAG, "No sensors configured (actuator-only device)");
    sensorManager.syncSensorsAfterConfigPush(nullptr, 0);
    ConfigResponseBuilder::publishSuccess(ConfigType::SENSOR, 0,
                                          "No sensors configured",
                                          correlationId);
    return true;
  }
```

```3759:3792:El Trabajante/src/main.cpp
  uint8_t fail_count = static_cast<uint8_t>(total - success_count);
  if (fail_count == 0) {
    std::vector<SensorSyncSlot> sync_slots;
    sync_slots.reserve(total);
    for (JsonObject sensorObj : sensors) {
      bool active = true;
      if (!JsonHelpers::extractBool(sensorObj, "active", active, true) || !active) {
        continue;
      }
      int gpio_value = 255;
      if (!JsonHelpers::extractInt(sensorObj, "gpio", gpio_value)) {
        continue;
      }
      String st;
      if (!JsonHelpers::extractString(sensorObj, "sensor_type", st)) {
        continue;
      }
      st.toLowerCase();
      String ow;
      JsonHelpers::extractString(sensorObj, "onewire_address", ow, "");
      int i2c_int = 0;
      JsonHelpers::extractInt(sensorObj, "i2c_address", i2c_int, 0);
      SensorSyncSlot slot;
      slot.gpio = static_cast<uint8_t>(gpio_value);
      slot.i2c_address = static_cast<uint8_t>(i2c_int);
      slot.onewire_address = ow;
      slot.sensor_type = st;
      sync_slots.push_back(slot);
    }
    sensorManager.syncSensorsAfterConfigPush(
        sync_slots.empty() ? nullptr : sync_slots.data(),
        sync_slots.size());
  }
```

Aktiv entfernen pro Eintrag bleibt zusätzlich über **`active: false`** (`removeSensor` + NVS) möglich.

```3931:3938:El Trabajante/src/main.cpp
  if (!config.active) {
    // R20-P2: Address-based removal for multi-sensor GPIOs
    // removeSensor() handles both RAM removal AND NVS cleanup (via configManager.removeSensorConfig)
    if (!sensorManager.removeSensor(config.gpio, config.onewire_address, config.i2c_address)) {
      LOG_W(TAG, "Sensor removal requested, but no sensor on GPIO " + String(config.gpio));
    }
    LOG_I(TAG, "Sensor removed: GPIO " + String(config.gpio));
    return true;
  }
```

### 1.5 Bestehende Tests (Delete)

`El Servador/god_kaiser_server/tests/integration/test_api_sensors.py` — Klasse `TestDeleteSensor`: u. a. `test_delete_sensor` (200, GPIO), `test_delete_sensor_removes_gpio_from_subzones`. **Zusätzlich bereits vorhanden (PKG-HW-01):** `test_delete_sensor_send_config_excludes_deleted_and_returns_correlation_id` — mockt `ESPService.send_config`, prüft `correlation_id` in der JSON-Response, einmaligen Aufruf und dass der gelöschte Sensor **nicht** mehr in `cfg["sensors"]` vorkommt, ein verbleibender Sensor weiterhin enthalten ist.

---

## 2. SOLL-Verhalten (messbar)

| Dimension | SOLL |
|-----------|------|
| **Server nach Delete** | Nach erfolgreichem `DELETE` ist die betroffene `sensor_configs`-Zeile **weg**; `build_combined_config` enthält den gelöschten Sensor **nicht**; `send_config` wird ausgeführt (Erfolg/Failure wie heute geloggt); Frontend erhält `sensor_config_deleted` mit `esp_id`, `gpio`, `config_id`, `sensor_type`. |
| **Telemetrie vs. DB (EA5484-Fall)** | Zustand **„frische sensor_data, aber keine moisture-Zeile“** ist **eindeutig** klassifiziert: (a) reines Server-/Operator-Setup (nie angelegt), (b) **ESP-Firmware/NVS-Altlast** trotz leerer Server-Liste, (c) fehlgeschlagener oder nie empfangener Config-Push — **ohne** Vermischung mit Kalibrier-Mathe (PKG-CAL-*). |
| **Operator / Observability** | Mindestens: reproduzierbarer Ablauf + klare Logs/Metadaten, dass Daten **ohne** Config-Zeile laufen (bereits Log-Warnung); optional verschärft: sichtbares `quality`/Feld oder Audit-Zähler (nur wenn bestehendes Pattern, kein Greenfield-Alert-System). |
| **Firmware (falls im Scope)** | Nach Config-Push entspricht die **laufende** Mess-/Publish-Liste der Server-Wahrheit **oder** das Restrisiko ist dokumentiert (BLOCKER/HW-Workaround). |

**Trennung:** Server-Gap (Ingest-Policy, Transparenz) vs. Firmware/NVS (Listen-Sync) vs. Operator-Erwartung (physisches GPIO vs. DB).

---

## 3. Arbeitsschritte (nummeriert)

**Pattern-Reuse (global):** Delete- und Config-Push wie bei `create`/`update` in derselben Datei `sensors.py`; Ingest-Warnungen wie bestehend in `sensor_handler.py`; Firmware-Entfernung wie `active: false`-Pfad in `main.cpp` / `SensorManager::removeSensor`.

1. **Ist-Audit dokumentieren (kein Code):** Ablauf „Delete im UI/API → DB → MQTT config → ESP `config_response`“ mit einem Referenz-ESP im Lab notieren (Timestamps, `correlation_id` aus Audit/Logs wenn vorhanden). Evidence-Register analog `BERICHT-analyse-feuchte-kalibrierung-sensorwechsel-gpio-handling-2026-04-11.md` pflegen — **keine** erfundenen Logzeilen.

2. **Server: Delete-Response / Config-Push-Nachweis (Ist prüfen, nicht blind coden)**  
   - **Dateien:** `src/api/v1/sensors.py` — `delete_sensor` liefert bereits `correlation_id` via `_model_to_response(..., correlation_id=mqtt_correlation_id)` nach `send_config`.  
   - **Tests:** `test_delete_sensor_send_config_excludes_deleted_and_returns_correlation_id` in `tests/integration/test_api_sensors.py` deckt Mock-`send_config` + Payload + `correlation_id` bereits ab — **Restarbeit:** OpenAPI/REST-Doku und **Frontend** prüfen, ob `correlation_id` sinnvoll konsumiert wird; ggf. nur **Erweiterungen** (z. B. weiteres Sensortyp-Paar, Fehlerpfad `send_config` success=false), kein zweiter Parallel-Test mit gleicher Aussage.  
   - **Nicht:** doppelte Implementierung derselben Response-Logik.

3. **Server: Ingest ohne Config (Ist prüfen)**  
   - **Dateien:** `src/mqtt/handlers/sensor_handler.py` — `quality = "degraded"` bei fehlender Config ist **bereits implementiert** (siehe §1.3).  
   - **Rest:** Abdeckung durch Tests, ggf. Logging-`extra`/Observability **nur** wenn bestehendes Muster; keine zweite Qualitätslogik parallel einführen.

4. **Tests: Delete + Config-Pipeline**  
   - **Dateien:** `tests/integration/test_api_sensors.py` (erweitern).  
   - **Idee:** Mit FastAPI-`dependency_overrides` (falls im Projekt bereits Pattern vorliegen — **Closest:** andere Integrationstests mit gemocktem `ESPService` / Publisher) verifizieren, dass nach `DELETE` **`build_combined_config`** / **`send_config`** genau einmal mit Payload ohne gelöschten Sensor aufgerufen wird; alternativ schmaler: DB-Assert + Mock nur `send_config`.  
   - **Neue Datei** nur wenn kein Override-Pattern existiert — bevorzugt **erweitern** bestehender Testdatei.

5. **Firmware: Randfälle nach bestehendem Sync (Repo hat Kern bereits)**  
   - **Ist:** `syncSensorsAfterConfigPush` bei leerem Sensor-Array und bei `fail_count == 0` (§1.4).  
   - **Restarbeit:** Partialsuccess-Pfade (`fail_count > 0`), Bus-Sensoren, NVS/Regression — **Hardware-/Wokwi-Tests**, keine zweite Sync-Implementierung ohne Analyse.  
   - **Ziel-Hardware (Robin: ESP32 Dev **WROOM**):** PlatformIO-Env **`esp32_dev`** (`board = esp32dev` in `El Trabajante/platformio.ini`, Abschnitt „ESP32 DEV ENVIRONMENT“) — Hardware-Profil `El Trabajante/src/config/hardware/esp32_dev.h` (`BOARD_TYPE` **ESP32_WROOM_32**).  
   - **Verify (WROOM):** `pio run -e esp32_dev`. **Alternativ** Seeed XIAO ESP32-C3: `pio run -e seeed_xiao_esp32c3`. Kurzname `seeed` als Env existiert **nicht**.

6. **MQTT/REST/WS-Doku nur bei sichtbaren Kontraktsänderungen**  
   - Bei Schritt 2/3: Abschnitte in `.claude/reference/api/REST_ENDPOINTS.md` bzw. `WEBSOCKET_EVENTS.md` nur **ergänzen**, wenn neue Response-Felder oder Events — sonst weglassen (User-Regel: keine Docs ohne Auftrag; hier nur wenn Code es erzwingt).

---

## 4. MQTT / REST / WebSocket (Kompatibilität)

| Schnittstelle | Änderung |
|----------------|----------|
| REST `DELETE /api/v1/sensors/{esp_id}/{config_id}` | Unveränderte Route; optional **additive** Response-Felder (`correlation_id` o. ä.). |
| MQTT `kaiser/.../esp/{esp_id}/config` | Kein Topic-Wechsel; Payload bleibt kombinierte Server-Liste (bestehend). |
| WS `sensor_config_deleted` / `config_published` | Unverändert; keine neuen Event-Namen ohne separates PKG. |

Abgleich: `.claude/reference/api/MQTT_TOPICS.md` (Abschnitt config), `.claude/reference/api/REST_ENDPOINTS.md` (DELETE Sensor by UUID).

---

## 5. Tests (konkrete Pfade, verifiziert)

| Zweck | Befehl / Datei |
|--------|-----------------|
| Delete-API + Subzones (bestehend) | `El Servador/god_kaiser_server/tests/integration/test_api_sensors.py` (`TestDeleteSensor`) |
| Erweiterung Mock/Assert `send_config` | dieselbe Datei — neue Testmethode(n) |
| Regression Kalibrierung (laut TASK-PKG-HW-01) | `El Servador/god_kaiser_server/tests/integration/test_calibration_session_routes.py` |
| Lint gezielt (nach Änderungen) | `poetry run ruff check src/api/v1/sensors.py src/mqtt/handlers/sensor_handler.py` |

---

## 6. Verify-Block (PowerShell, volle Pfade)

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_api_sensors.py -q --tb=short
```

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/integration/test_calibration_session_routes.py -q --tb=short
```

Optional nur bei Firmware-Schritt 5 — **ESP32 DevKit / WROOM-32 (Standard in diesem Plan):**

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e esp32_dev
```

Nur bei Seeed XIAO ESP32-C3-Hardware:

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
pio run -e seeed_xiao_esp32c3
```

Vollständiger Backend-Check (nach Bedarf):

```powershell
Set-Location "c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Servador\god_kaiser_server"
poetry run pytest tests/ -q --timeout=120
```

---

## 7. Risiken und Rollback

| Risiko | Mitigation / Rollback |
|--------|------------------------|
| Firmware „Full sync“ entfernt fälschlich Bus-Sensoren | Nur mit Bus-tauglicher Vergleichslogik (ROM/I2C-Adresse); sonst Schritt 5 auslassen. Rollback: Revert Commit auf `auto-debugger/work`. |
| Striktere `quality` bricht Dashboard-Annahmen | Vor Merge Frontend-Stellen mit `grep` prüfen; konservative Qualität statt neuer Enum-Werte. Rollback: Server-Commit revert. |
| `correlation_id` in Delete-Response doppelt/confus mit WS | Dokumentieren welche ID „letzter MQTT-Push“ meint; Closest: Create-Pattern. |

---

## 8. Abgrenzung zu PKG-HW-02 und PKG-CAL-*

- **PKG-HW-02** (GPIO-Reuse, Frontend-Store, `sensor_config_deleted`): hier **nicht** implementieren — nur Schnittstelle: REST-DELETE und WS-Payload bleiben die Quelle der Wahrheit für die UI.  
- **PKG-CAL-01 / PKG-CAL-02** (`calibration_data`, `resolve_calibration_for_processor`, Feuchte-Mathe, Mutex): **ausgeschlossen** in diesem PR — keine Änderungen an `calibration_payloads.py` Kalibrier-Logik außer zufälliger Kollateral-Konflikt (vermeiden).

---

## 9. Nächster Schritt (Verify-Plan-Gate)

Vor Produkt-Implementierung: Skill **`.claude/skills/verify-plan/SKILL.md`** auf diesen Plan + geplante Dateiliste anwenden. **`VERIFY-PLAN-REPORT.md`** im gebundenen Artefaktordner ablegen — z. B. `.claude/reports/current/incidents/ANALYSE-feuchte-kalib-sensorwechsel-2026-04-11/VERIFY-PLAN-REPORT.md` (existiert) **oder** nach Anlage eines Run-Ordners `.claude/reports/current/auto-debugger-runs/<run_id>/`. Der Pfad `impl-plan-pkg-hw-01-2026-04-11/` ist im Repo **noch nicht** angelegt; nicht als existierend voraussetzen.

---

*Ende Plan PKG-HW-01*
