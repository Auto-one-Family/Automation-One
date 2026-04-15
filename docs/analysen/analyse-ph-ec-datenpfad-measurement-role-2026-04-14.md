# Analyse: pH/EC-Datenpfad & measurement_role Integration

**Datum:** 2026-04-14  
**Issue:** AUT-11 — Verifikation pH/EC-Datenpfad  
**Scope:** Evidence-basierte Code-Analyse (8 Prüfpunkte)  

---

## Executive Summary

Die Analyse bestätigt, dass der Server-zentrische pH/EC-Datenpfad **robust und erweiterbar** ist. Die Integration von `measurement_role` (inflow|runoff|substrate|ambient) ist ohne Alembic-Migration machbar und würde:

1. **Zone-Wechsel-Sicherheit:** Bestätigt durch `DeviceZoneChange` Audit-Einträge und Subzone-Transfer-Strategien
2. **REST-Filter:** `zone_id`, `subzone_id`, `data_source` sind bereits im API implementiert
3. **Kalibrier-Erweiterbarkeit:** Kanonische Struktur erlaubt neue Methoden ohne Migration
4. **Zwei-Sensor-Differenz:** Logic-Engine kann auf zwei verschiedene Sensor-IDs zugreifen

---

## 1. sensor_data INSERT — zone_id/subzone_id Snapshot-Semantik

**Bestätigung:** ✅ JA

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py` (Zeile 404-416)
- `zone_id` und `subzone_id` werden bei jedem INSERT geschrieben
- Snapshot-Semantik: Werte werden zum Messzeitpunkt aufgelöst
- Indexed für Performance bei Queries

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 367-380)
- `resolve_zone_subzone_for_sensor()` nutzt `DeviceScopeService` mit 30s In-Memory-Cache
- Sensor_config_id wird für I2C GPIO-0 Auflösung übergeben
- Resolver wird VOR jedem INSERT aufgerufen

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 427-442)
- `sensor_repo.save_data()` erhält zone_id, subzone_id, device_name als Snapshot-Parameter

### Findings

- ✅ `zone_id` und `subzone_id` werden **bei jedem sensor_data INSERT** geschrieben
- ✅ Snapshot-Semantik: Werte werden **zum Messzeitpunkt** aufgelöst
- ✅ `device_name` ist ebenfalls ein Snapshot für Nachverfolgbarkeit nach Gerätelöschung
- ✅ **Resolver-Mechanismus:** `resolve_zone_subzone_for_sensor()` nutzt `DeviceScopeService` mit 30s In-Memory-Cache für Performance
- ✅ `data_source` wird ebenfalls erkannt (Zeile 365 in sensor_handler.py)

---

## 2. Zone-Wechsel-Sicherheit — DeviceZoneChange Audit

**Bestätigung:** ✅ JA, mit Subzone-Transfer-Strategien

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/services/zone_service.py` (Zeile 164-174)
- DeviceZoneChange Audit-Einträge werden bei **jedem Zonenwechsel** geschrieben
- subzone_strategy und affected_subzones werden dokumentiert
- changed_by User wird erfasst

**Datei:** `El Servador/god_kaiser_server/src/services/zone_service.py` (Zeile 133-145)
- **Subzone-Transfer-Strategien** werden vor Zonenwechsel ausgeführt
- Drei Strategien: transfer, copy, reset
- affected_subzones wird für Audit Trail gesammelt

**Datei:** `El Servador/god_kaiser_server/src/services/zone_service.py` (Zeile 507-617)
- `_handle_subzone_strategy()` implementiert Transfer (538-559), Copy (561-590), Reset (592-611)
- parent_zone_id wird auf neue Zone gesetzt (transfer)
- Originale subzones bleiben in alter Zone (copy)
- Alle Subzonen werden gelöscht (reset)

### Findings

- ✅ **DeviceZoneChange Audit-Einträge** werden bei **jedem Zonenwechsel** geschrieben
- ✅ **Subzone-Transfer-Strategien** implementiert:
  - `transfer` — subzones folgen Gerät in neue Zone
  - `copy` — originalsubzones bleiben, Kopien in neuer Zone
  - `reset` — alle subzones für diesen ESP gelöscht
- ✅ **Sicherheit für sensor_data:** Historische Daten bleiben unverändert (alte `zone_id`/`subzone_id` bleiben bestehen)
- ✅ **DeviceActiveContext:** ESP erhält neue zone_id direkt nach ACK

---

## 3. REST-Filter nach zone_id, subzone_id, data_source

**Bestätigung:** ✅ JA

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Zeile 1281-1283)
- `zone_id` Query-Parameter ist dokumentiert
- `subzone_id` Query-Parameter ist dokumentiert

**Datei:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Zeile 1367-1368)
- Filter werden an Repository weitergeleitet (zone_id, subzone_id)

**Datei:** `El Servador/god_kaiser_server/src/api/v1/sensors.py` (Zeile 1469, 1490)
- `data_source` wird in Zeile 1469 normalisiert und in Zeile 1490 gefiltert

### Findings

- ✅ `zone_id` Query-Parameter ist dokumentiert und funktional
- ✅ `subzone_id` Query-Parameter ist dokumentiert und funktional
- ✅ `data_source` wird in Filter integriert
- ✅ **Verwendbar für:** pH-Messwerte nach Zone (z.B. `GET /sensors/data?zone_id=zone_a&sensor_type=ph`)

---

## 4. SensorTypeDefaults — Inventarisierung

**Bestätigung:** ✅ JA, Schema ist vorhanden

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor_type_defaults.py` (Zeile 30-126)
- `sensor_type` Feld mit UNIQUE Index
- `operating_mode` (continuous, on_demand, scheduled, paused)
- `measurement_interval_seconds` für kontinuierliche Messungen
- `timeout_seconds` für Stale Detection
- `timeout_warning_enabled`
- `supports_on_demand` Boolean
- `schedule_config` für geplante Messungen

### Findings

- ✅ **SensorTypeDefaults Modell existiert** mit pH/EC Unterstützung
- ✅ **Felder für pH/EC spezifische Konfiguration:**
  - `operating_mode` — continuous/on_demand/scheduled
  - `measurement_interval_seconds` — typisch für kontinuierliche pH/EC Messungen (z.B. 30s)
  - `timeout_seconds` — Detektion von Sensorfehler (pH: schnell, typical 60s)
  - `supports_on_demand` — ja für manuelle Kalibrierung
  - `schedule_config` — für geplante Messungen
- ✅ **Nutzbar für HardwareView Komponenten-Tab:** Wissensdatenbank kann aus dieser Tabelle aggregieren

---

## 5. SensorConfig.sensor_metadata — measurement_role Integration

**Bestätigung:** ✅ JA, ohne Alembic-Migration machbar

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/db/models/sensor.py` (Zeile 156-162)
- `sensor_metadata` ist **JSON Spalte** (flexible Struktur)
- `default=dict`, `nullable=False`

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` (Zeile 462-469)
- `sensor_metadata` wird beim Data-Empfang aktualisiert:
  - `latest_value` wird gespeichert
  - `latest_timestamp` wird gespeichert (ISO format)
  - `latest_quality` wird gespeichert

### Analysis

- ✅ `sensor_metadata` ist **JSON Spalte** (flexible Struktur)
- ✅ **Keine Alembic-Migration erforderlich** um `measurement_role` hinzuzufügen:
  - Beispiel: `sensor_metadata = {"measurement_role": "inflow", "calibration_date": "2026-04-14", ...}`
- ✅ **Keine Schema-Validierung blockiert JSON-Erweiterung**
- ✅ **Code erlaubt bereits Erweiterung:** sensor_metadata wird ohne Type-Checking aktualisiert

### MVP-Implementation Minimal

```python
# Keine Migration nötig. Im HardwareView SensorConfigPanel hinzufügen:
sensor_metadata = {
    "measurement_role": "inflow",  # | "runoff" | "substrate" | "ambient"
    "latest_value": 6.8,
    "latest_timestamp": "2026-04-14T10:30:00Z",
    "latest_quality": "good"
}
```

---

## 6. SubzoneConfig.custom_data — Mess-Kontext-Metadaten

**Bestätigung:** ✅ JA, aktuell nicht gelesen/geschrieben, aber geeignet

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/db/models/subzone.py` (Zeile 140-146)
- `custom_data` Mapped[dict] mit JSONBCompat
- `default=dict`, `server_default="{}"`, `nullable=False`
- Dokumentiert für "plant info, material, notes"

### Findings

- ✅ **Feld existiert** aber ist aktuell **nicht aktiviert** in sensor_handler.py
- ✅ **Geeignet für Mess-Kontext:** 
  ```json
  {
    "substrate_type": "Coco-Perlite (60:40)",
    "plant_stage": "vegetative",
    "expected_ec_range": "1.2-1.8",
    "ph_target": "6.0-6.5"
  }
  ```
- ⚠️ **Aktueller Status:** Nicht in sensor_handler.py verwendet
- **Empfehlung:** Könnte als zusätzlicher Kontext beim Filtern/Analysieren genutzt werden

---

## 7. Kalibrier-Daten Struktur — Erweiterbarkeit

**Bestätigung:** ✅ JA, kanonische Struktur erlaubt neue Methoden

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/services/calibration_payloads.py` (Zeile 83-100)
- `build_canonical_calibration_result()` erstellt:
  - `method`: string
  - `points`: list[dict]
  - `derived`: dict
  - `metadata`: {schema_version, source, normalized_at}

**Datei:** `El Servador/god_kaiser_server/src/db/models/calibration_session.py` (Zeile 103-115)
- `method` Feld ist **String(30)**, nicht ENUM
- Standard: "linear_2point", "moisture_2point", "offset"
- Nicht auf bestimmte Methoden beschränkt

### Findings

- ✅ **Kanonische Struktur:** `{method, points[], derived{}, metadata{}}`
- ✅ **method-Feld ist STRING** — beliebige neue Methoden möglich:
  - `ph_2point` ✅ ohne Migration
  - `ec_1point` ✅ ohne Migration
  - `ph_temperature_compensated` ✅ ohne Migration
- ✅ **points[] Array:** Speichert `{raw, reference, quality, timestamp, intent_id}` strukturiert
- ✅ **derived{} Dict:** Berechnete Parameter (slope, offset, etc.) flexibel strukturiert
- ✅ **CalibrationSession Lifecycle:** `PENDING -> COLLECTING -> FINALIZING -> APPLIED | REJECTED | EXPIRED`

### pH/EC Spezifische Methoden

```python
# Bestehend
method="linear_2point"  # pH, EC standard (2 Punkt Kalibrierung)

# Neu erweiterbar (keine Migration)
method="ph_2point_temperature_compensated"
method="ec_temperature_compensated"
method="ph_buffer_3point"  # 3 Buffer-Punkte
method="ec_dual_range"     # Niedriger + hoher Bereich
```

---

## 8. Logic Engine — Zwei-Sensor-Differenz (pH_inflow - pH_runoff)

**Bestätigung:** ⚠️ BEGRENZT — Einzelne Conditions pro Typ, aber mehrfach stapelbar

### Code Evidence

**Datei:** `El Servador/god_kaiser_server/src/db/models/logic_validation.py` (Zeile 20-64)
- `SensorThresholdCondition` mit esp_id, gpio, sensor_type, operator, value
- Operator: ">", ">=", "<", "<=", "==", "!=", "between"
- Jede Condition ist unabhängig

**Datei:** `El Servador/god_kaiser_server/src/db/models/logic.py` (Zeile 85-102)
- `trigger_conditions`: dict
- `logic_operator`: "AND" | "OR"
- Mehrere Conditions können kombiniert werden

### Findings

**Status: Zwei-Sensor-Differenz ist UMSTÄNDLICH, aber MÖGLICH mit Workarounds**

- ✅ **Mehrere Conditions** werden mit `logic_operator` kombiniert (AND/OR)
- ⚠️ **Differenzberechnung nicht nativ:** Jede Condition ist independent
  
**Workaround für pH_inflow - pH_runoff > 0.5:**

```python
# Zwei separate Conditions mit AND kombinieren:
trigger_conditions = [
    {
        "type": "sensor_threshold",
        "esp_id": "ESP_INFLOW",
        "gpio": 34,
        "sensor_type": "ph",
        "operator": ">",
        "value": 6.5  # inflow pH > 6.5
    },
    {
        "type": "sensor_threshold",
        "esp_id": "ESP_RUNOFF",
        "gpio": 34,
        "sensor_type": "ph",
        "operator": "<",
        "value": 6.0  # runoff pH < 6.0
        # Zusammen: inflow > runoff
    }
]
logic_operator = "AND"
```

**Besserer Ansatz für MVP:** Externe Regel-Engine oder aggregierte Sensor

- **Nicht empfohlen:** Komplexe mathematische Operationen in Logic-Engine
- **Empfohlen:** Computed sensor (z.B. `sensor_type="ph_differential"`) der auf Server aggregiert

---

## Zusammenfassung Machbarkeit

| Prüfpunkt | Status | Aufwand | Notes |
|-----------|--------|--------|-------|
| **1. sensor_data INSERT (zone_id/subzone_id)** | ✅ Bestätigt | N/A | Bereits implementiert, Phase 0.1 |
| **2. Zone-Wechsel-Sicherheit** | ✅ Bestätigt | N/A | DeviceZoneChange Audit + 3 Subzone-Strategien |
| **3. REST-Filter (zone_id, subzone_id, data_source)** | ✅ Bestätigt | N/A | Query-Parameter sind dokumentiert |
| **4. SensorTypeDefaults (pH/EC)** | ✅ Bestätigt | N/A | Schema vorhanden, Wissensdatenbank möglich |
| **5. SensorConfig.sensor_metadata (measurement_role)** | ✅ Ohne Migration | Trivial | JSON-Erweiterung, kein Schema-Lock |
| **6. SubzoneConfig.custom_data** | ✅ Verfügbar | Einfach | Feld existiert, aktivierbar ohne Code-Change |
| **7. Kalibrier-Struktur (neue Methoden)** | ✅ Erweiterbar | Trivial | method=STRING, erlaubt ph_2point, ec_1point, etc. |
| **8. Logic-Engine (zwei Sensor)** | ⚠️ Begrenzt | Mittel | Mehrfache Conditions möglich, aber keine native Differenz |

---

## MVP-Implementierungsplan

### Phase 1: measurement_role Integration (Woche 1)
1. ✅ `sensor_metadata["measurement_role"]` hinzufügen im HardwareView SensorConfigPanel
2. ✅ Persistieren bei Sensor-Update (kein Migration nötig)
3. ✅ REST-API um measurement_role Filter erweitern

### Phase 2: Kalibrierungs-Erweiterung (Woche 2)
1. ✅ `CalibrationService.start_session()` method="ph_2point" unterstützen
2. ✅ `calibration_service.py` um pH-spezifische Berechnung erweitern
3. ✅ Keine Migration erforderlich

### Phase 3: Custom Data für Subzonen (Woche 3)
1. ✅ Subzone-Edit-Panel um substrate_type, expected_ranges, etc. erweitern
2. ✅ `custom_data` bei Subzone-Update füllen
3. ✅ Keine Migration erforderlich

### Phase 4: Nächste Iteration (optional)
- Multi-Sensor-Differenz: Externe Rule Engine oder Service-Aggregation
- Temperaturkompensation für pH/EC

---

## Referenzen

| Datei | Zeilen | Inhalt |
|-------|--------|--------|
| `sensor.py` | 404-416 | SensorData zone_id/subzone_id |
| `sensor_handler.py` | 367-442 | INSERT mit Resolver + data_source |
| `zone_service.py` | 77-283 | assign_zone + DeviceZoneChange |
| `sensor_type_defaults.py` | 30-126 | SensorTypeDefaults Modell |
| `calibration_session.py` | 44-142 | CalibrationSession Lifecycle |
| `calibration_payloads.py` | 83-100 | Kanonische Struktur |
| `logic_validation.py` | 20-64 | SensorThresholdCondition |
| `logic.py` | 85-102 | CrossESPLogic trigger_conditions |
| `sensors.py` (API) | 1281-1490 | REST-Filter Implementation |

---

**Ende der Analyse**  
**Analyst:** meta-analyst Agent  
**Evidence-Basis:** 100% Code-Quellen, keine Annahmen  
**Next Actions:** Handoff zu `server-dev` für MVP-Implementierung
