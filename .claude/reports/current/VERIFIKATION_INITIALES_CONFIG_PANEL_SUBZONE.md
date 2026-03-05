# Verifikation: Initiales Config-Panel Subzone-Implementierung

**Datum:** 2026-03-05  
**Auftrag:** `auftrag-initiales-config-panel-subzone-implementierung.md`  
**Zweck:** Code-Prüfung gegen Auftrag, Best Practices und Vollständigkeit

---

## 1. Abgleich Auftrag vs. Codebase

| Punkt | Auftrag | Codebase | Status |
|-------|---------|----------|--------|
| **P1** | subzone_id top-level in realConfig; metadata.subzone_id entfernen | `esp.ts` Z.699-700: `subzone_id: config.subzone_id \|\| null`; metadata nur `created_via` | ✅ |
| **P2** | ActuatorConfigCreate + MockActuatorConfig + Store + Modal | types/index.ts Z.373, AddActuatorModal Z.64/137/200, esp.ts Z.911 | ✅ |
| **P3** | Optional: Dropdown, Shared UI | ✅ Umgesetzt (Auftrag 3, 2026-03-05): SubzoneAssignmentSection in beiden Modals | ✅ |
| **P4** | OneWire-Bulk: subzone_id bei jedem addSensor | AddSensorModal Z.263-276: `chosenSubzoneId` aus `newSensor.subzone_id?.trim() \|\| undefined` | ✅ |
| **Scope** | Kein Auto-Open, keine Kalibrierung | Eingehalten | ✅ |

---

## 2. Code-Prüfung (Checkliste 3.1)

### 2.1 Store esp.ts

```text
Z.699-700: subzone_id: config.subzone_id || null   (addSensor Real-ESP)
Z.719-721: metadata: { created_via: 'dashboard_drag_drop' }  (kein subzone_id in metadata)
Z.911:     subzone_id: config.subzone_id ?? null   (addActuator Real-ESP)
Z.917-919: metadata: { created_via: 'dashboard_drag_drop' }
```

**Ergebnis:** P1 und P2 Store-seitig korrekt umgesetzt.

### 2.2 Typen (types/index.ts)

- `MockActuatorConfig` Z.373: `subzone_id?: string | null` ✅
- `ActuatorConfigCreate` (api/esp.ts Z.69): `subzone_id?: string | null` ✅

### 2.3 AddSensorModal.vue

- Z.64: `subzone_id: null` im initialen `newSensor`
- Z.190: `subzone_id: null` in `resetForm()`
- Z.263: `chosenSubzoneId = normalizeSubzoneId(newSensor.value.subzone_id)`
- Z.276: `subzone_id: chosenSubzoneId ?? undefined` bei jedem `addSensor()` in OneWire-Bulk
- SubzoneAssignmentSection (Dropdown): „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“; v-model via `subzoneModel` (string | null)

**Ergebnis:** P4 OneWire-Bulk korrekt; Subzone-Dropdown (SubzoneAssignmentSection) statt Freitext.

### 2.4 AddActuatorModal.vue

- Z.64: `subzone_id: null` in `newActuator`
- Z.137: `subzone_id: null` in `resetForm()`
- SubzoneAssignmentSection (Dropdown): gleiche Logik wie AddSensorModal; v-model via `subzoneModel`

**Ergebnis:** P2 Modal vollständig; Subzone-Dropdown statt Freitext.

---

## 3. Best-Practice-Prüfung

### 3.1 `||` vs `??` Konsistenz

| Stelle | Operator | Leerer String `''` | `undefined` |
|--------|----------|-------------------|-------------|
| **Sensor** (esp.ts Z.700) | `\|\| null` | → `null` ✓ | → `null` ✓ |
| **Aktor** (esp.ts Z.911) | `?? null` | → bleibt `''` | → `null` ✓ |

**Backend-Verhalten:**
- **Sensors** (`sensors.py` Z.83-95): `_normalize_subzone_id` wandelt `''` und `"__none__"` in `None` um.
- **Actuators** (`actuators.py` Z.505): `if request.subzone_id:` — in Python ist `''` falsy, daher wird bei `''` der `else`-Zweig ausgeführt (`remove_gpio_from_all_subzones`). Effektiv identisch zu `None`.

**Fazit:** Backend behandelt leeren String bei Aktoren wie „keine Subzone“. Kein funktionaler Fehler. Zur Konsistenz und Klarheit empfohlen: Aktor analog Sensor auf `|| null` umstellen.

### 3.2 Single Source of Truth

- `subzone_id` nur top-level in `realConfig`
- `metadata` enthält nur `created_via`, kein `subzone_id`

### 3.3 Form-Reset

- Beide Modals setzen `subzone_id: null` in `resetForm()`.

---

## 4. Potenzielle Lücken

### 4.1 Mock-ESP

| Pfad | subzone_id |
|------|------------|
| **Mock Sensor** | `debugApi.addSensor(deviceId, config)` — config enthält `subzone_id`; Backend `MockSensorConfig` hat `subzone_id: Optional[str]` (debug.py Z.67) ✅ |
| **Mock Aktor** | `debugApi.addActuator(deviceId, config)` — config enthält `subzone_id`; Backend `MockActuatorConfig` (debug.py Z.133-141) hat **kein** `subzone_id`-Feld. Pydantic ignoriert extra fields → Mock-Aktoren erhalten keine Subzone-Zuweisung. |

**Empfehlung:** Backend `MockActuatorConfig` um `subzone_id: Optional[str] = None` erweitern, falls Mock-Aktoren Subzonen unterstützen sollen. Sonst als bekannte Einschränkung dokumentieren.

### 4.2 Subzone-Validierung

- Frontend prüft nicht, ob `subzone_id` zur Zone des ESPs gehört.
- Backend übernimmt dies (SubzoneService, Zonen-Check).

---

## 5. Zusammenfassung

| Kriterium | Status |
|-----------|--------|
| **Vollständigkeit** | P1, P2, P4 umgesetzt; P3 bewusst ausgelassen |
| **Best Practices** | SSOT, Typ-Sicherheit, REST-Konvention eingehalten |
| **Backend-Kompatibilität** | Sensor: `_normalize_subzone_id`; Aktor: `if request.subzone_id` (leerer String = falsy) |
| **Mock-ESP** | Sensor: subzone_id unterstützt; Aktor: Backend-Schema fehlt subzone_id |
| **DB-Architektur** | subzone_configs.assigned_gpios = Single Source; sensor/actuator_configs haben keine subzone_id-Spalte |
| **ConfigBuilder** | Liest subzone_id aus metadata; API schreibt es nicht dorthin — Subzone geht per MQTT separat |

---

## 6. Empfohlene nächste Schritte

### 6.1 Optional (Konsistenz)

- In `esp.ts` Z.911: `config.subzone_id ?? null` → `config.subzone_id || null` (analog Sensor).

### 6.2 Optional (Mock-Aktor)

- Backend `MockActuatorConfig` um `subzone_id: Optional[str] = None` erweitern, falls Mock-Aktoren Subzonen brauchen.

### 6.3 Optional (ConfigBuilder metadata-Sync)

- Nach Subzone-Assignment: `subzone_id` in `sensor_metadata`/`actuator_metadata` schreiben, damit ConfigPayloadBuilder konsistent subzone_id an ESP32 liefert (aktuell nur subzone_configs + MQTT subzone/assign).

### 6.4 Nachfolge-Auftrag (laut Auftrag)

- Zusatzeinstellungen konsolidieren (Schwellwerte, Alerts, Runtime)
- Kalibrierung als eigener Task
- Nutzer-Hinweis für Level-2-Klick bei erweiterten Einstellungen

---

---

## 8. DB-Inspector & Server-Architektur (Ergänzung)

### 8.1 Datenbank-Schema: subzone_configs

| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| id | uuid | PK |
| esp_id | varchar | FK → esp_devices.device_id (CASCADE) |
| subzone_id | varchar | Eindeutig pro ESP (uq_esp_subzone) |
| subzone_name | varchar | Optional |
| parent_zone_id | varchar | Muss ESP.zone_id entsprechen |
| assigned_gpios | json | Array von GPIO-Nummern [4, 5, 6] |
| safe_mode_active | boolean | Default: true |
| sensor_count, actuator_count | integer | Von ESP-ACK |
| custom_data | jsonb | Subzone-Metadaten |
| last_ack_at, created_at, updated_at | timestamp | |

**Wichtig:** `sensor_configs` und `actuator_configs` haben **keine** subzone_id-Spalte. Die GPIO↔Subzone-Zuordnung erfolgt ausschließlich über `subzone_configs.assigned_gpios`.

### 8.2 Datenfluss: Create → DB → Monitor

```
Frontend POST subzone_id (top-level)
    → sensors.py / actuators.py
    → SubzoneService.assign_subzone(esp_id, subzone_id, assigned_gpios=[gpio])
    → subzone_configs: INSERT/UPDATE Zeile mit (esp_id, subzone_id, assigned_gpios)
    → SubzoneRepository.get_subzone_by_gpio(esp_id, gpio) für Response
```

**Monitor L2** (`MonitorDataService`): Baut `gpio_to_subzone` aus `subzone_configs` — iteriert über alle Subzonen, für jeden GPIO in `assigned_gpios` → `(subzone_id, subzone_name)`. ✅ Korrekt.

### 8.3 Config-Builder vs. metadata

| Quelle | Verwendung |
|--------|------------|
| **config_mapping.py** | Liest `sensor_metadata.subzone_id` und `actuator_metadata.subzone_id` für ESP32-Config-Payload |
| **Sensor/Actor Create API** | Schreibt `subzone_id` **nicht** in sensor_metadata/actuator_metadata — nur `request.metadata` wird übernommen |
| **SubzoneService** | Schreibt in `subzone_configs`; publiziert MQTT subzone/assign |

**Folge:** `ConfigPayloadBuilder` erhält subzone_id aus metadata — bei Create ohne metadata.subzone_id ist der Wert leer. Die ESP32-Config könnte `subzone_id: ""` pro Sensor/Aktor liefern. Die Subzone-Zuweisung geht aber separat per MQTT subzone/assign an den ESP. Ob die ESP32 subzone_id aus sensor/actuator-Config oder nur aus dem Subzone-Message nutzt, ist firmware-spezifisch.

**Empfehlung:** Backend könnte nach Subzone-Assignment `subzone_id` in `sensor_metadata`/`actuator_metadata` schreiben, damit ConfigBuilder konsistent ist. Optionaler Nachfolge-Fix.

### 8.4 SubzoneRepository.get_subzone_by_gpio

```python
# subzone_repo.py Z.128-144
subzones = await self.get_by_esp(esp_id)
for subzone in subzones:
    if subzone.assigned_gpios and gpio in subzone.assigned_gpios:
        return subzone
return None
```

Verwendet: sensors.py, actuators.py, MonitorDataService (indirekt über gpio_to_subzone-Map).

---

## 9. Referenzen

- Auftrag: `auftrag-initiales-config-panel-subzone-implementierung.md`
- Analyse: `INITIAL_SENSOR_ACTUATOR_CONFIG_PANEL_ANALYSIS.md`
- Backend: `El Servador/god_kaiser_server/src/api/v1/sensors.py` (`_normalize_subzone_id`), `actuators.py` (Z.505)
- Frontend: `El Frontend/src/stores/esp.ts`, `AddSensorModal.vue`, `AddActuatorModal.vue`
- DB: `subzone_configs` (assigned_gpios JSON), `SubzoneRepository` (get_subzone_by_gpio)
- Config: `config_mapping.py` (sensor_metadata.subzone_id), `config_builder.py`
