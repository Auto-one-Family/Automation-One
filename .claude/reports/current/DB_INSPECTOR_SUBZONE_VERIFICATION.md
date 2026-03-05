# DB Inspector Report — Subzone-Verifikation

**Erstellt:** 2026-03-05  
**Modus:** B (Spezifisch: Verifikation initiale Subzone-Implementierung Sensor/Aktor-Config)  
**Quellen:** subzone_configs, sensor_configs, actuator_configs (Schema-Check)

---

## 1. Zusammenfassung

Die GPIO↔Subzone-Zuordnung wird ausschließlich in `subzone_configs.assigned_gpios` (JSON-Array) gespeichert. `sensor_configs` und `actuator_configs` haben keine subzone_id-Spalte. Monitor L2 und API-Responses lesen subzone_id über `SubzoneRepository.get_subzone_by_gpio()`. Keine Schema-Lücken; Architektur konsistent.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container erreichbar |
| subzone_configs | OK | 13 Spalten, assigned_gpios JSON |
| sensor_configs | OK | Keine subzone_id-Spalte (erwartet) |
| actuator_configs | OK | Keine subzone_id-Spalte (erwartet) |

---

## 3. Befunde

### 3.1 subzone_configs Schema

- **Schwere:** Niedrig (informativ)
- **Detail:** Spalten bestätigt: id, esp_id, subzone_id, subzone_name, parent_zone_id, assigned_gpios (json), safe_mode_active, sensor_count, actuator_count, last_ack_at, created_at, updated_at, custom_data (jsonb)
- **Evidenz:** `information_schema.columns` Abfrage

### 3.2 Datenfluss

- **Schwere:** Niedrig
- **Detail:** Create-Request mit subzone_id → SubzoneService.assign_subzone → subzone_configs INSERT/UPDATE mit assigned_gpios=[gpio]. Response/Monitor nutzen get_subzone_by_gpio(esp_id, gpio).
- **Evidenz:** Code-Analyse sensors.py, actuators.py, subzone_repo.py, monitor_data_service.py

### 3.3 ConfigBuilder vs. metadata

- **Schwere:** Mittel (optionaler Fix)
- **Detail:** ConfigBuilder liest sensor_metadata.subzone_id / actuator_metadata.subzone_id. Die Create-API schreibt subzone_id nicht in metadata — nur in subzone_configs. ESP erhält Subzone-Info separat per MQTT subzone/assign.
- **Evidenz:** config_mapping.py, config_builder.py, sensors.py _build_model_fields

---

## 4. Extended Checks

| Check | Ergebnis |
|-------|----------|
| pg_isready / docker exec | subzone_configs Schema abgefragt |
| Code-Analyse | SubzoneService, SubzoneRepository, MonitorDataService |

---

## 5. Bewertung & Empfehlung

- **Root Cause:** Keine — Architektur wie designed.
- **Nächste Schritte:** Optional: subzone_id nach Assignment in sensor_metadata/actuator_metadata schreiben für ConfigBuilder-Konsistenz. Siehe VERIFIKATION_INITIALES_CONFIG_PANEL_SUBZONE.md §6.3.
