# Phase 0.1 — Sensor zone_id/subzone_id zum Messzeitpunkt — Vollständige IST-Analyse

**Erstellt:** 2026-03-06  
**Ziel-Repo:** auto-one (El Servador, primär Backend)  
**Typ:** Analyse (kein Code, nur Bericht)  
**Priorität:** KRITISCH — Grundlage für Phase 2.4 Logic Engine Subzone-Matching  
**Ergebnis:** Vollständige Dokumentation des Ist-Zustands für Implementierung Phase 0.1

---

## Block 1: Datenbank-Inventar

### 1.1 sensor_data Tabelle — exakte Spalten

**Quelle:** `El Servador/god_kaiser_server/src/db/models/sensor.py` (Zeilen 268–387)

| Spalte | Typ | Nullable | Default | Beschreibung |
|--------|-----|----------|---------|--------------|
| id | UUID | NOT NULL | uuid4 | Primary Key |
| esp_id | UUID | NOT NULL | — | FK → esp_devices.id (CASCADE) |
| gpio | Integer | NOT NULL | — | GPIO-Pin-Nummer |
| sensor_type | String(50) | NOT NULL | — | Sensortyp (sht31_temp, ph, etc.) |
| raw_value | Float | NOT NULL | — | Rohwert (ADC/digital) |
| processed_value | Float | NULL | — | Verarbeiteter Wert (Pi-Enhanced) |
| unit | String(20) | NULL | — | Einheit (°C, %, etc.) |
| processing_mode | String(20) | NOT NULL | — | raw, pi_enhanced, local |
| quality | String(20) | NULL | — | good, fair, poor, error |
| timestamp | DateTime | NOT NULL | _utc_now | Messzeitpunkt |
| sensor_metadata | JSON | NULL | — | Zusätzliche Metadaten |
| data_source | String(20) | NOT NULL | production | production, mock, test, simulation |

**zone_id und subzone_id:** **NICHT VORHANDEN.** Bestätigt.

**Primary Key:** `id` (UUID)  
**Foreign Keys:** `esp_id` → `esp_devices.id` (ON DELETE CASCADE)  
**Indizes:**
- `idx_esp_gpio_timestamp` (esp_id, gpio, timestamp)
- `idx_sensor_type_timestamp` (sensor_type, timestamp)
- `idx_timestamp_desc` (timestamp DESC)
- `idx_data_source_timestamp` (data_source, timestamp)

**Alembic-Migrationen:**
- **Tabelle sensor_data:** Wird **nicht** in einer Migration explizit erstellt. Die Tabelle entsteht über `Base.metadata.create_all` in `create_db.py` (SQLAlchemy-Modelle). Die erste Migration, die sensor_data erwähnt, ist `add_data_source_field.py` (Revision: add_data_source_field, down_revision: add_audit_log_indexes).
- **add_data_source_field.py:** Fügt Spalte `data_source` hinzu (String(20), NOT NULL, server_default='production') und Index `idx_data_source_timestamp`.
- **Keine weitere Migration** ändert sensor_data danach.

### 1.2 Beziehungen

| Beziehung | Typ | Details |
|-----------|-----|---------|
| sensor_data → esp_devices | FK | esp_id → esp_devices.id (UUID) |
| sensor_data → sensor_configs | **Keine direkte FK** | Verknüpfung nur über (esp_id, gpio, sensor_type) — kein sensor_config_id |
| esp_devices → zone | Keine zones-Tabelle | zone_id: Optional[str], zone_name: Optional[str] — String-Felder, keine FK |
| subzone_configs | Eigenständig | esp_id (String, FK → esp_devices.device_id), subzone_id, parent_zone_id, assigned_gpios (JSON) |

**Hinweis:** SubzoneConfig.esp_id referenziert `esp_devices.device_id` (String wie "ESP_12AB34CD"), nicht esp_devices.id (UUID).

### 1.3 ER-Skizze (ASCII)

```
esp_devices
├── id (UUID, PK)
├── device_id (String, unique)  ← SubzoneConfig.esp_id referenziert dies
├── zone_id (String, nullable)  ← Zone zum aktuellen Zeitpunkt
└── zone_name (String, nullable)

subzone_configs
├── id (UUID, PK)
├── esp_id (String, FK → esp_devices.device_id)
├── subzone_id (String)
├── parent_zone_id (String)
└── assigned_gpios (JSON: [gpio, gpio, ...])  ← GPIO → Subzone-Zuordnung

sensor_configs
├── id (UUID, PK)
├── esp_id (UUID, FK → esp_devices.id)
├── gpio (Integer, nullable)
├── sensor_type (String)
└── (KEINE subzone_id-Spalte)

sensor_data
├── id (UUID, PK)
├── esp_id (UUID, FK → esp_devices.id)
├── gpio (Integer)
├── sensor_type (String)
├── raw_value, processed_value, unit, processing_mode, quality
├── timestamp (DateTime)
├── sensor_metadata (JSON)
├── data_source (String)
└── zone_id, subzone_id  ← FEHLEN (Phase 0.1-Ziel)
```

---

## Block 2: Schreibpfad — Wo kommt sensor_data her?

### 2.1 MQTT → sensor_handler — vollständiger Trace

**1. Topic:**  
`kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data`  
- **main.py Zeile 222:** `"kaiser/+/esp/+/sensor/+/data"` → `sensor_handler.handle_sensor_data`
- **TopicBuilder.build_sensor_data_topic:** `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` (topics.py Zeile 268)
- **TopicBuilder.parse_sensor_data_topic:** Regex `kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/sensor/(\d+)/data` → esp_id, gpio, kaiser_id

**2. Payload (erwartet, sensor_handler.py Zeilen 109–120):**
```json
{
  "ts": 1735818000,
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "ph",
  "raw": 2150,
  "value": 0.0,
  "unit": "",
  "quality": "stale",
  "raw_mode": true
}
```
- Alternativen: `timestamp` statt `ts`, `raw_value` statt `raw`
- Optional: `onewire_address`, `i2c_address` (für Multi-Value-Sensoren)

**3. Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

**4. Funktion:** `handle_sensor_data(topic, payload)` (Zeile 103) — führt den gesamten Flow aus

**5. Vor dem INSERT — Daten die der Handler hat:**
- esp_id_str, gpio (aus Topic)
- sensor_type, raw_value, value, unit, quality, raw_mode (aus Payload)
- esp_device (via esp_repo.get_by_device_id)
- sensor_config (optional, via sensor_repo.get_by_esp_gpio_and_type oder get_by_esp_gpio_type_and_i2c/onewire)
- processed_value, unit, quality (nach Pi-Enhanced falls aktiv)
- esp32_timestamp (aus Payload ts/timestamp)
- data_source (via _detect_data_source)

**6. Lookup:**  
- esp_device: `esp_repo.get_by_device_id(esp_id_str)` (Zeile 166)  
- sensor_config: `sensor_repo.get_by_esp_gpio_and_type` bzw. I2C/OneWire-Varianten (Zeilen 193–224)  
- **Kein** Lookup von zone_id oder subzone_id

### 2.2 INSERT-Stelle — exakt lokalisieren

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`  
**Zeilen:** 331–344

```python
sensor_data = await sensor_repo.save_data(
    esp_id=esp_device.id,
    gpio=gpio,
    sensor_type=sensor_type,
    raw_value=raw_value,
    processed_value=processed_value,
    unit=unit,
    processing_mode=processing_mode,
    quality=quality,
    timestamp=esp32_timestamp,
    metadata={"raw_mode": raw_mode},
    data_source=data_source,
)
```

**Repository:** `SensorRepository.save_data`  
**Datei:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`  
**Zeilen:** 215–269

**Model-Klasse:** `SensorData` (db/models/sensor.py)  
**Mechanismus:** `session.add(sensor_data)` nach Erstellung des SensorData-Objekts (Zeile 266)

### 2.3 Multi-Value-Sensoren (SHT31, BME280)

**Ergebnis:** Ein MQTT-Message = ein sensor_data INSERT.

- Jeder Wert (sht31_temp, sht31_humidity) wird vom ESP32 als **separate MQTT-Nachricht** gesendet (eigener Topic mit gleichem gpio, anderer sensor_type im Payload).
- Der sensor_handler verarbeitet jede Nachricht einzeln und ruft `save_data` einmal pro Nachricht auf.
- **Folge:** Beide INSERTs (temp + humidity) haben gleiches (esp_id, gpio), unterschiedlichen sensor_type. Die Zone/Subzone-Auflösung ist für beide identisch: (esp_id, gpio) → gleiche zone_id, gleiche subzone_id.

### 2.4 Weitere Schreibpfade

**Grep-Ergebnis:** Es gibt **keine** weiteren Stellen, die direkt in sensor_data schreiben.

- REST: Kein Endpoint schreibt sensor_data (nur Lesen via query_sensor_data, get_sensor_data_by_source)
- Batch-Import: Nicht vorhanden
- Seed-Script: Keine sensor_data-Seeds gefunden
- Tests: Nutzen `sensor_repo.save_data` oder indirekt über MQTT → sensor_handler

**Einziger Schreibpfad:** MQTT → sensor_handler → sensor_repo.save_data

---

## Block 3: Zone/Subzone-Auflösung — Wie bekommt man sie?

### 3.1 zone_id

**Quelle:** `esp_devices.zone_id` (Optional[str])  
**Key:** esp_id (UUID) — über esp_device.id nach Lookup via device_id  
**Lookup:** `ESPRepository.get_by_device_id(device_id_str)` → esp_device.zone_id

**Edge (ESP ohne Zone):** zone_id ist NULL. Beim INSERT: zone_id = None speichern.

### 3.2 subzone_id

**Quelle:** `subzone_configs.assigned_gpios`  
**Logik:** Für (esp_id, gpio) alle SubzoneConfigs des ESP durchsuchen, wo gpio in assigned_gpios.

**Existierende Hilfsfunktion:**  
`SubzoneRepository.get_subzone_by_gpio(esp_id: str, gpio: int) -> Optional[SubzoneConfig]`  
- Datei: `src/db/repositories/subzone_repo.py` Zeilen 129–144  
- Gibt SubzoneConfig zurück (mit subzone_id) oder None

**Wichtig:** SubzoneRepository.esp_id ist **device_id (String)**, nicht esp_devices.id (UUID). Der sensor_handler hat esp_id_str (device_id) und esp_device.id (UUID). Für den Lookup muss `esp_id_str` (device_id) verwendet werden.

**MonitorDataService (monitor_data_service.py Zeilen 66–73):**
```python
gpio_to_subzone: Dict[Tuple[str, int], Tuple[str, str]] = {}
subzone_configs_stmt = select(SubzoneConfig).where(SubzoneConfig.parent_zone_id == zone_id)
for sc in subzone_result.scalars().all():
    for gpio in sc.assigned_gpios or []:
        gpio_to_subzone[(sc.esp_id, gpio)] = (subzone_id, subzone_name)
```
- Key: (esp_id als device_id String, gpio)
- Value: (subzone_id, subzone_name)

**Edge (GPIO in keiner Subzone):** subzone_id = NULL  
**Edge (GPIO in mehreren Subzonen):** SubzoneService verhindert Konflikte beim Update (check_gpio_conflict). Ein GPIO sollte nur einer Subzone zugeordnet sein. **Zu prüfen:** Ob die API das bei Erstellung garantiert.

### 3.3 Hilfsfunktion existiert?

| Funktion | Vorhanden | Ort |
|----------|-----------|-----|
| get_zone_for_esp | Indirekt | esp_device.zone_id nach get_by_device_id |
| get_subzone_for_gpio | **Ja** | SubzoneRepository.get_subzone_by_gpio(esp_id: str, gpio: int) |

**Empfehlung:** Zentrale Hilfsfunktion `resolve_zone_subzone_for_sensor(esp_id_str: str, gpio: int)` erstellen, die:
1. esp_device = get_by_device_id(esp_id_str) → zone_id = esp_device.zone_id
2. subzone = subzone_repo.get_subzone_by_gpio(esp_id_str, gpio) → subzone_id = subzone.subzone_id if subzone else None
3. return (zone_id, subzone_id)

---

## Block 4: Lesepfade — Wer nutzt sensor_data?

### 4.1 REST-Endpoints

| Endpoint | Datei | Zeile | Filter | zone_id/subzone_id in Response? |
|----------|-------|-------|--------|----------------------------------|
| GET /api/v1/sensors/data | api/v1/sensors.py | 969 | esp_id, gpio, sensor_type, start_time, end_time, quality | **Nein** |
| GET /api/v1/sensors/data/by-source/{source} | api/v1/sensors.py | 1068 | source, esp_id | **Nein** |
| GET /api/v1/sensors/data/stats/by-source | api/v1/sensors.py | 1147 | — | Aggregation, kein Einzel-Lesen |
| GET /api/v1/sensors/stats | api/v1/sensors.py | 1178 | esp_id, gpio, start_time, end_time | **Nein** |

**Response-Schema (SensorReading):** timestamp, raw_value, processed_value, unit, quality, sensor_type — **keine** zone_id/subzone_id.

**query_data Filter:** sensor_repo.query_data unterstützt esp_id, gpio, sensor_type, start_time, end_time, quality, data_source — **keine** zone_id, subzone_id.

### 4.2 Logic Engine

**Aufruf:** sensor_handler Zeilen 324–356 (asyncio.create_task)  
**Funktion:** `logic_engine.evaluate_sensor_data(esp_id, gpio, sensor_type, value)`

**Payload an Logic Engine (logic_engine.py Zeilen 174–179):**
```python
trigger_data = {
    "esp_id": esp_id,
    "gpio": gpio,
    "sensor_type": sensor_type,
    "value": value,
    "timestamp": int(time.time()),
}
```

**SensorConditionEvaluator (sensor_evaluator.py):** Erhält context["sensor_data"] = trigger_data. Nutzt esp_id, gpio, sensor_type, value. **Phase 2.4 (implementiert):** Optional subzone_id — Prüfung trigger_data.subzone_id == condition.subzone_id.

**Phase 2.4 (implementiert 2026-03-06):** Logic Engine prüft Sensor-Subzone === Aktor-Subzone. trigger_data enthält zone_id/subzone_id (Phase 0.1). SensorCondition optional subzone_id. ActuatorActionExecutor überspringt Action bei Subzone-Mismatch (SubzoneRepository.get_subzone_by_gpio).

### 4.3 WebSocket-Broadcast

**Event-Name:** `sensor_data`  
**Datei:** sensor_handler.py Zeilen 394–419  
**Payload:**
```python
{
    "esp_id": esp_id_str,
    "message": message,
    "severity": "info",
    "device_id": esp_id_str,
    "gpio": gpio,
    "sensor_type": sensor_type,
    "value": display_value,
    "unit": unit,
    "quality": quality,
    "timestamp": esp32_timestamp_raw,
}
```
**zone_id/subzone_id:** **Nicht** enthalten.

### 4.4 Frontend

- **sensorsApi.queryData / getData:** Nutzt REST GET /sensors/data. Filter: esp_id, gpio, sensor_type, Zeitraum. **Keine** zone_id/subzone_id Filter.
- **Monitor L2:** Nutzt `useZoneGrouping` — Subzone-Gruppierung kommt aus subzone_configs (MonitorDataService), nicht aus sensor_data.

### 4.5 Weitere Consumer

| Consumer | Nutzung | zone_id/subzone_id? |
|----------|---------|----------------------|
| EventAggregatorService | _get_sensor_events für Audit-Aggregation | **Nein** |
| audit/events/aggregated | sources=sensor_data | **Nein** |
| Health-Check (AutoOps) | list_sensor_data | **Nein** |
| Debug API | Zählt sensor_data, löscht test/mock | **Nein** |
| Grafana/Prometheus | Nicht explizit gefunden | — |

---

## Block 5: Zonenwechsel — Mobile Sensoren

### 5.1 Wann wird zone_id gesetzt?

**Beim INSERT:** Aus `esp_devices.zone_id` zum **aktuellen Zeitpunkt** (Lookup beim Speichern).

**Szenario:** pH-Meter (ESP) wechselt von Zone A nach Zone B. User ändert esp_devices.zone_id.  
**Folge:** Alle **neuen** Messungen bekommen automatisch zone_id = B. Alte Messungen behalten (nach Backfill) zone_id = A. **Korrekt** — Lookup beim INSERT garantiert Messzeitpunkt-Zuordnung.

### 5.2 Audit-Log

**zone_assignment / subzone_assignment Events:**
- `zone_ack_handler.py` Zeile 294: `ws_manager.broadcast("zone_assignment", event_data)`
- `subzone_ack_handler.py` Zeile 147: `ws_manager.broadcast("subzone_assignment", event_data)`

**Persistierung:** WebSocket-Broadcast bei ACK von ESP. Ob Audit-Log-Einträge für Zone/Subzone-Änderungen geschrieben werden, wurde nicht im Detail geprüft. **Zu prüfen:** audit_log Tabelle bei zone/subzone Änderungen.

**Phase 0.1:** Audit-Log für Zonenwechsel ist **nicht** zwingend. Dokumentation ausreichend.

---

## Block 6: Lücken und Fix-Liste

### 6.1 Schema-Änderung

**Ergänzungen in sensor_data:**
- `zone_id: Optional[str]` (NULL wenn ESP ohne Zone)
- `subzone_id: Optional[str]` (NULL wenn GPIO in keiner Subzone)

**Indizes:**  
`idx_sensor_data_zone_timestamp (zone_id, timestamp)` und ggf. `idx_sensor_data_subzone_timestamp (subzone_id, timestamp)` für Abfragen nach Zone/Subzone.

### 6.2 Migration

- Alembic: Neue Migration `add_sensor_data_zone_subzone.py`
- Bestehende Daten: zone_id, subzone_id = NULL. **Backfill optional:** Aus esp_devices + subzone_configs für historische Abfragen (UPDATE mit JOIN).

### 6.3 Schreibpfad-Änderung

**Ort:** sensor_handler.py, vor dem save_data-Aufruf (nach Zeile 316, vor Zeile 331)

**Schritte:**
1. zone_id = esp_device.zone_id
2. subzone_id = resolve_subzone_for_gpio(esp_id_str, gpio) — SubzoneRepository.get_subzone_by_gpio
3. save_data(..., zone_id=zone_id, subzone_id=subzone_id)

**SensorRepository.save_data:** Neue Parameter zone_id, subzone_id hinzufügen.

### 6.4 Hilfsfunktion

**Empfehlung:** `resolve_zone_subzone_for_sensor(esp_id_str: str, gpio: int, session)` in Service oder als Util.  
**Wiederverwendung:** Logic Engine (Phase 2.4) könnte sie nutzen ODER die Werte aus sensor_data/trigger_data erhalten, wenn sie beim INSERT mitgeschrieben werden.

### 6.5 Rückwärtskompatibilität

- Neue Spalten NULL: Bestehende Consumer brechen **nicht**.
- Response-Schemas: SensorReading um zone_id, subzone_id erweitern (optional, nullable).
- WebSocket-Payload: Erweiterung optional für Frontend Monitor L2.

### 6.6 Tests

**Tests die sensor_data schreiben:**
- `test_repositories_sensor.py`: sensor_repo.save_data direkt
- `test_server_esp32_integration.py`: sensor_handler.handle_sensor_data via MQTT
- E2E: publish_sensor_data → get_sensor_data

**Nach Migration:** zone_id, subzone_id können NULL bleiben (optional). Integration-Tests für sensor_handler sollten bei vorhandenem ESP mit Zone/Subzone die neuen Felder prüfen.

---

## Block 7: Priorisierte Fix-Liste

| # | Änderung | Datei/Modul | Aufwand | Abhängigkeit |
|---|----------|-------------|---------|--------------|
| 1 | Alembic Migration: zone_id, subzone_id zu sensor_data | alembic/versions/ | ~30 min | — |
| 2 | SensorData Model: zone_id, subzone_id Spalten | db/models/sensor.py | ~10 min | 1 |
| 3 | SensorRepository.save_data: zone_id, subzone_id Parameter | db/repositories/sensor_repo.py | ~15 min | 2 |
| 4 | Hilfsfunktion resolve_zone_subzone(esp_id_str, gpio) | services/ oder utils/ | ~1 h | — |
| 5 | sensor_handler: Lookup + INSERT mit zone_id, subzone_id | mqtt/handlers/sensor_handler.py | ~1–2 h | 1, 3, 4 |
| 6 | (Optional) Backfill bestehende sensor_data | Migration oder Script | ~1 h | 1 |
| 7 | REST-Response: zone_id, subzone_id in SensorReading Schema | schemas/sensor.py, api/v1/sensors.py | ~30 min | 2 |
| 8 | sensor_repo.query_data: Filter zone_id, subzone_id | db/repositories/sensor_repo.py | ~30 min | 2 |
| 9 | WebSocket-Payload: zone_id, subzone_id (optional) | mqtt/handlers/sensor_handler.py | ~15 min | 5 |
| 10 | Logic Engine: trigger_data um zone_id, subzone_id erweitern (Phase 2.4) | services/logic_engine.py, sensor_handler | ~30 min | 5 |
| 11 | Integration-Tests: sensor_handler mit Zone/Subzone | tests/integration/ | ~1 h | 5 |

**Reihenfolge:** 1 → 2 → 3 → 4 → 5 (Kern). 6 optional. 7–9 für vollständige Nutzung. 10–11 für Phase 2.4.

---

## Unklarheiten / Zu prüfen

1. **sensor_data Tabellenerstellung:** Keine explizite Migration gefunden. Tabelle entsteht via SQLAlchemy create_all. Bei frischer DB-Installation: Welche Migrationen laufen vor create_all? **Empfehlung:** Prüfen ob sensor_data in einer frühen Migration existiert (add_audit_log_indexes down_revision-Kette).
2. **GPIO in mehreren Subzonen:** SubzoneService check_gpio_conflict verhindert Doppelzuordnung beim Update. Bei parallelen API-Calls theoretisch möglich. **Risiko:** Niedrig.
3. **SubzoneConfig.esp_id:** Referenziert device_id (String). Sensor_handler hat esp_id_str. Konsistent nutzbar.

---

## Akzeptanzkriterien (Checkliste)

- [x] Block 1: sensor_data Schema vollständig dokumentiert, ER-Skizze vorhanden
- [x] Block 2: Schreibpfad von MQTT bis INSERT lückenlos tracebar, Zeile/Datei für jede Stelle
- [x] Block 3: Zone/Subzone-Auflösung — wo existiert sie, wo fehlt sie
- [x] Block 4: Alle Lese- und Consumer-Pfade dokumentiert
- [x] Block 5: Zonenwechsel-Szenario geklärt
- [x] Block 6: Lücken und Fix-Liste vollständig
- [x] Block 7: Priorisierte Implementierungs-Liste (Reihenfolge, Aufwand)
- [x] Bericht: Keine Spekulationen ohne Kennzeichnung; „Unklar“-Stellen explizit genannt
