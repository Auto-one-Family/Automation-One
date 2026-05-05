# Baseline-Verifikation L0–L5: Bodenfeuchte GPIO 33 (unkalibriert)

**Datum:** 2026-04-11  
**Lauf:** `feuchte-baseline-esp-gpio33-2026-04-11` (Steuerdatei: nur Verifikation + Bericht, **kein** Code-Fix)  
**Hardware-Kontext (normativ, Robin):** ESP32 DevKit WROOM, seriell **COM4**; **ein** kapazitiver Bodenfeuchtesensor auf **GPIO 33**; **unkalibriert**; Substrat **trocken**, Sensor **stabil**.

**Stack-Recherche (dieses Update):** Auswertung **aktueller Docker-Logs** (`automationone-server`, `automationone-mqtt`, `automationone-mqtt-logger`), **cAdvisor** (`http://127.0.0.1:8080/healthz` → HTTP 200, Body `ok`), **Prometheus** (`http://127.0.0.1:9090`, `up`-Query: u. a. `el-servador`, `cadvisor`, `mqtt-broker`, `alloy`, `loki` = **1**), **Mosquitto-Exporter** (Metriken z. B. `broker_clients_connected`), **`docker stats`** (CPU/RAM der Kern-Container). **Hinweis Zeitbasis:** Die zuletzt gefundenen **ESP-/Feuchte-Zeilen** in den Server-Logs liegen im Zeitfenster **2026-04-10** (UTC-nahe Timestamps im Log); neuere Traffic-Spuren zu **ESP_EA5484** waren in der Stichprobe **nicht** vorhanden (Gerät offline, anderes Fenster oder Rotation — für den **Baseline-Inhalt** ändert das die Kette **MQTT → Handler → DB** nicht, begrenzt aber „Live jetzt“).

---

## Kurzfassung

| Aspekt | Ergebnis |
|--------|----------|
| **COM4 → `device_id`** | Im Repository/Stack **nicht** ableitbar (kein COM-Port in Server/DB). **Zuordnung nur durch Robin** (z. B. UI-Label, letzte Registrierung, Seriennummer). |
| **Einzelgerät GPIO 33 + `moisture` in `sensor_configs` (aktuell)** | **Ein** Treffer: **`ESP_6B27C8`**, **GPIO 33**, `pi_enhanced` **true** (`MOCK_*` ausgenommen). **`ESP_EA5484`** hat **keine** `moisture`-Zeile mehr in **`sensor_configs`** — widerspricht **nicht** den **älteren** Server-Logs (dort noch Pi-Enhanced für **ESP_EA5484**/GPIO **33**), zeigt aber **Persistenz-Drift**. |
| **„Neuer“ ESP laut Registrierungsdatum** | Zuletzt angelegtes **nicht-Mock**-Gerät bleibt **ESP_6B27C8** (2026-04-09); Feuchte-Konfig liegt dort jetzt auf **GPIO 33** (nicht mehr das frühere „nur 32“-Bild aus der ersten Berichtsversion). Für **COM4** weiterhin **manuelle** Zuordnung nötig. |
| **Live-Daten vs. „trocken stabil“** | Für **ESP_EA5484** / GPIO **33**: gespeicherte Rohwerte zuletzt **~220–380** ADC → Server **~100 %** verarbeitet — **nicht** plausibel als „trockenes Substrat“ unter der **Default-Kennlinie** (siehe L3). Entweder falsches Gerät im Fokus, zweiter Feuchtekanal (siehe unten), Verkabelung/Invert-Logik, oder Messbedingung weicht ab. |
| **GPIO 32 vs. 33 (Server-Log + DB)** | **Historisches Server-Log (~2026-04-10):** **GPIO 33** → **Pi-Enhanced** mit `MoistureSensorProcessor` (Logs). **GPIO 32:** weiterhin **`Sensor config not found … gpio=32, type=moisture`** — Ingest **ohne** Config; DB zeigte `processed_value` = **Roh-ADC**. **Aktueller DB-Stand (Re-Query bei Berichts-Update):** In **`sensor_configs`** existieren für **`ESP_EA5484` keine `moisture`-Zeilen** (weder 32 noch 33) — nur **GPIO 0** (SHT/VPD) und **GPIO 4** (DS18B20). **Fazit:** Zwischen **Log-Zeitfenster** und **jetziger** Persistenz liegt eine **Konfig-Drift** (Zeilen entfernt oder anderes Volume); neue MQTT-Messages würden den Handler vermutlich wie bei **32** warnen, sofern keine Config nachgezogen wird. |

---

## Operative Stack-Evidenz (Docker / Monitoring)

| Quelle | Befund |
|--------|--------|
| **`docker stats` (no-stream)** | `automationone-server` ~**197 MiB** RAM, CPU im einstelligen %-Bereich; `automationone-mqtt` / `automationone-postgres` / `automationone-cadvisor` niedrige Last — **kein** Ressourcen-Notfall sichtbar. |
| **cAdvisor** | `GET /healthz` → **200**, Antwort **`ok`**; Prometheus-Job `cadvisor` laut **`up`**-Query **erreichbar**; typische **`container_memory_usage_bytes`**-Serien vom Scrape (Container-Hierarchie über cAdvisor). |
| **Prometheus `:9090`** | Targets u. a. **`el-servador`** (`/api/v1/health/metrics`), **`postgres`** (Exporter), **`mqtt-broker`** (Mosquitto-Exporter), **`cadvisor`**, **`alloy`**, **`loki`** — Stichprobe **`up == 1`**. |
| **Mosquitto-Exporter** | Metriken u. a. **`broker_clients_connected`** (Stichprobe: **5**), **`broker_load_messages_received_1min`** — Broker **betriebsbereit**; detaillierter ESP-Verkehr steht dort nicht pro Topic (dafür **MQTT-Logger** + **Server-Log**). |
| **`automationone-mqtt` Logs** | Überwiegend **Healthcheck**-Clients auf **1883** — **kein** Payload-Inhalt; Sensorstrom siehe **Logger** / **Server**. |
| **`automationone-server` Logs** (Filter **ESP_EA5484**, **moisture**, **gpio 33**) | End-to-End sichtbar: **Empfang** `…/sensor/33/data` → **`[Pi-Enhanced] Processor found: MoistureSensorProcessor`** → **`SUCCESS: … gpio=33 … raw=336.0 → processed=100.0 %, quality=poor`** → **Publish** `…/sensor/33/processed` → **`Sensor data saved: … gpio=33, processing_mode=pi_enhanced`**. Parallel **`logic_engine`:** `No matching rules for sensor … gpio=33, sensor_type=moisture` (Automation nicht angebunden — erwartbar ohne Regeln). |
| **Warnung GPIO 32** | `WARNING - Sensor config not found: esp_id=ESP_EA5484, gpio=32, type=moisture. Saving data without config.` — erklärt parallele **`sensor/32/data`**-Messages im MQTT-Logger **ohne** Server-seitige Feuchte-Kalibrierung. |

---

## Abgrenzung zur früheren Fehlerkaskade

Dieser Lauf **wertet keine** älteren Incident-Ketten, Wizard-Finalize- oder Korrelations-Fixes aus. Es geht **ausschließlich** um eine schichtweise **Baseline-Lesung** (Identität, Konfig-Hintergrund, MQTT/DB-Evidenz, Server-Pfad, UI-Anbindung) für **ein** Zielgerät — hier mit DB-Filter **GPIO 33** + **`moisture`**.

---

## Tabelle L0–L5 (Schicht → Status → Evidence)

| # | Schicht | Status | Evidence (kurz) |
|---|---------|--------|-------------------|
| **L0** | **Identität (`esp_id` / `device_id`)** | **BLOCKER (teilweise)** für COM4-Zuordnung; **geteilt** zwischen **aktueller DB** und **Log-Evidenz** | **COM4** → **kein** DB-Feld. **Aktuell (`sensor_configs`):** einziges nicht-Mock-**`moisture`** auf **GPIO 33** = **`ESP_6B27C8`**. **Historische MQTT/Server-Logs:** umfangreich **`ESP_EA5484`** (inkl. Pi-Enhanced GPIO **33**). **Robin:** COM4 **explizit** einer `device_id` zuordnen; ohne das bleibt L0 **offen**. |
| **L1** | **Firmware-/Registry-Konfig (read-only Repo)** | **OK** (allgemein); **teilweise N/A** pin-fix | **Repo:** `MOISTURE_CAP` in `El Trabajante/src/models/sensor_registry.cpp` — `server_sensor_type` / `device_type` **`moisture`**, analog (kein fester GPIO im Registry-Eintrag). **ADC1:** GPIO **33** ist in `El Trabajante/src/config/hardware/esp32_dev.h` als erlaubter ADC1-Kanal gelistet. Konkreter **GPIO** kommt aus **Server/Device-Config** (NVS nach Push), nicht aus einem festen „33“-Define im Moisture-Eintrag. |
| **L2** | **MQTT / Roh-Payload** | **OK** (Logger + Server bestätigen) | **Topic-Muster:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` (s. `.claude/reference/api/MQTT_TOPICS.md`). **MQTT-Logger:** wiederkehrend `…/ESP_EA5484/sensor/33/data` mit `gpio` **33**, `moisture`, `raw` z. B. **186–420**, `raw_mode`: **true**; Antwort `…/sensor/33/processed` mit **100 %**, **`poor`**. **Zusatzkanal:** `…/sensor/32/data` **derselbe** `esp_id` — im Server-Log **Warnung** fehlende Config (s. Abschnitt „Operative Stack-Evidenz“); für die **Baseline GPIO 33** weiterhin **eindeutig** der **33**-Pfad relevant. |
| **L3** | **Server-Verarbeitung (Pi-Enhanced, Defaults)** | **OK** (Live-Log + Code) | Gleicher Ablauf wie im Code: **`[Pi-Enhanced] Processor found: MoistureSensorProcessor`**, dann **`SUCCESS: … gpio=33 … raw≈200–400 → processed=100.0 %, quality=poor`**, Publish auf **`sensor/33/processed`**. `resolve_calibration_for_processor` + Defaults **3200 / 1500** in `moisture.py` wenn **`calibration_data`** fehlt — **rechnerisch** erklärt niedriges ADC → hoher %-Wert. **Abgrenzung GPIO 32:** dort **kein** Pi-Enhanced-Feuchtepfad (keine Config) → **kein** Vergleich mit %-Defaults für „trocken/nass“-Aussage zu **33**. |
| **L4** | **Persistenz (`sensor_configs` / Kalibrierung)** | **BLOCKER (aktuell)** / **OK (historisch laut Logs)** | **Aktuell:** Keine **`sensor_configs`**, Zeile **`moisture`** für **`ESP_EA5484`** in der DB (Stichprobe: nur GPIO **0** und **4**). **Historisch (sensor_data + Server-Log vom 2026-04-10):** GPIO **33** wurde mit **`processing_mode=pi_enhanced`** gespeichert und **`calibration_data`** war für Feuchte **ohne** abgeschlossene Wizard-Kalibrierung aus Sicht der %-Verarbeitung **Default-tauglich** — das passt zu **`calibration_data` = NULL**, **solange** die Config-Zeile existierte. **Empfehlung:** Feuchte-Sensorzeilen in **`sensor_configs`** gegen Server-Config / UI **abgleichen** (Drift beseitigen). |
| **L5** | **Frontend** | **N/A** (kein UI-Test in diesem Lauf) | **Contract:** WebSocket-Event `sensor_data` mit `esp_id`, `gpio`, `sensor_type`, `value`, `unit`, `quality` (`El Frontend/src/types/websocket-events.ts`). **Kein** manueller Browser-Check — **BLOCKER** für „Operator sieht … live“; technische Kette **MQTT → Server → DB** ist oben belegt, UI müsste dieselben Werte über API/WS anzeigen, wenn Gerät ausgewählt ist. |

---

## Normative Metadaten

### A) Pipeline-Evidenz (Logs / MQTT, Schwerpunkt **ESP_EA5484**)

- **`device_id`:** `ESP_EA5484`  
- **`esp_devices.id` (UUID):** `63f776d4-d0fc-4191-b4e3-58c1d77ebb4d`  
- **Name (DB):** `Zeltsteuerung`  
- **`created_at`:** 2026-03-30  
- **`sensor_configs` (Stand Berichts-Update):** **keine** `moisture`-Zeile — **Drift** zu Logs vom **2026-04-10** (damals Pi-Enhanced für GPIO **33**).

### B) Aktuelle `sensor_configs` für **GPIO 33** + **`moisture`** (nicht-Mock)

- **`device_id`:** `ESP_6B27C8`  
- **`calibration_data`:** JSON-**`null`** (kein abgeschlossenes Wizard-`derived`; Verarbeitung wie „Defaults“ über `resolve_calibration_for_processor`).

---

## Erfolgsbild „Baseline OK“ (Einschätzung)

- **End-to-end Konsistenz** (MQTT-Roh → Server-Default → DB `%`) ist für **ESP_EA5484 / GPIO 33** **beschreibbar** und in **MQTT-Logger + Server-Log + DB** **widerspruchsfrei** (inkl. **`processing_mode=pi_enhanced`** in den Log-Zeilen).  
- **Inhaltliche** Baseline „trocken, stabil“ ist mit den **Roh-ADC-Werten an GPIO 33** (**weit unter** den Default-„trocken“-Annahmen) **nicht** vereinbar — physikalische Ursache (Sensor, Substrat, **Invert**-Parameter, falsches Board) bleibt **außerhalb** dieses Berichts zu klären.  
- **Paralleler Kanal GPIO 32** ist **operativ** durch **fehlende `sensor_configs`-Zeile** erklärt; er sollte bei der **COM4-/Ein-Sensor-Baseline** nicht mit **GPIO-33-%** vermischt werden.

---

## Referenzen (Repo-Pfade)

- MQTT: `.claude/reference/api/MQTT_TOPICS.md`  
- Feuchte-Defaults: `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py`  
- Handler: `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`  
- Kalibrierungsauflösung: `El Servador/god_kaiser_server/src/services/calibration_payloads.py`  
- Firmware-Typ: `El Trabajante/src/models/sensor_registry.cpp`  
- ADC-Pins: `El Trabajante/src/config/hardware/esp32_dev.h`

---

*Keine Secrets/Tokens in diesem Bericht. Keine Produktcode-Änderungen in diesem Lauf.*

---

## Anhang: Kurzbelege (nicht-sensitive Log-Auszüge)

**Server (`automationone-server`), Stichprobe Verarbeitung GPIO 33:**

```text
[Pi-Enhanced] Processor found: MoistureSensorProcessor for 'moisture'
[Pi-Enhanced] SUCCESS: esp_id=ESP_EA5484, gpio=33, sensor_type='moisture' → raw=336.0 → processed=100.0 %, quality=poor
Published to kaiser/god/esp/ESP_EA5484/sensor/33/processed (QoS 1): {"processed_value": 100.0, "unit": "%", "quality": "poor", ...}
Sensor data saved: ... gpio=33, processing_mode=pi_enhanced
```

**Server-Warnung GPIO 32 (Kontext Zweitkanal):**

```text
Sensor config not found: esp_id=ESP_EA5484, gpio=32, type=moisture. Saving data without config.
```
