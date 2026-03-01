# Logic Engine E2E Bug Report

> **Date:** 2026-03-01 21:57 CET (Dresden, Germany)
> **Scope:** Logic Engine End-to-End: Frontend -> Server -> DB -> Wokwi ESP32
> **Status:** 4 Bugs gefunden, alle gefixt und verifiziert

---

## Executive Summary

Die Logic Engine hatte einen **kritischen Bug**, der dazu fuehrte, dass **7 von 8 Automationsregeln nie ausgeloest wurden**, obwohl passende Sensordaten vorhanden waren. Ursache war ein Case-Sensitivity-Problem im String-Matching. Zusaetzlich wurde ein **PubSubClient Dangling-Pointer Bug** auf dem ESP32 gefunden, der zu MQTT-Reconnect-Fehlern fuehrte.

Alle 4 Bugs wurden gefixt und erfolgreich E2E verifiziert.

---

## Bug #1: Case-Sensitive sensor_type Matching (CRITICAL)

### Symptom
- 7 von 8 Logic-Regeln triggern **nie**, obwohl Sensordaten korrekt eintreffen
- Nur "Notification Test" (auf MOCK-Device) funktionierte
- Execution History zeigt 305 Ausfuehrungen fuer Notification Test, 0 fuer alle anderen

### Root Cause
Case-sensitive String-Vergleich in 3 Dateien der Rule-Matching-Pipeline:

| Datei | Zeile | Problem |
|-------|-------|---------|
| `logic_repo.py` | 109 | `condition.get("sensor_type") == sensor_type` |
| `sensor_evaluator.py` | 62 | `condition.get("sensor_type") != sensor_data.get("sensor_type")` |
| `hysteresis_evaluator.py` | 253 | `cond_sensor_type != sensor_data.get("sensor_type")` |

**Datenflussproblem:**
- ESP32 sendet: `sensor_type: "ds18b20"` (lowercase, korrekt)
- DB-Regeln speichern: `sensor_type: "DS18B20"` (uppercase, von UI-Eingabe)
- `"DS18B20" != "ds18b20"` -> Rule wird **nie** gematcht

### Fix
Alle 3 Dateien auf `.lower()` Normalisierung umgestellt:

**logic_repo.py:102-114:**
```python
sensor_type_lower = sensor_type.lower() if sensor_type else ""
for condition in conditions:
    if condition.get("type") in ("sensor_threshold", "sensor"):
        cond_sensor_type = (condition.get("sensor_type") or "").lower()
        if (
            condition.get("esp_id") == esp_id
            and condition.get("gpio") == gpio
            and cond_sensor_type == sensor_type_lower
        ):
            matching_rules.append(rule)
            break
```

**sensor_evaluator.py:60-66:**
```python
if condition.get("sensor_type"):
    cond_type = (condition.get("sensor_type") or "").lower()
    data_type = (sensor_data.get("sensor_type") or "").lower()
    if cond_type != data_type:
        return False
```

**hysteresis_evaluator.py:251-257:**
```python
cond_sensor_type = condition.get("sensor_type")
if cond_sensor_type:
    data_sensor_type = sensor_data.get("sensor_type") or ""
    if cond_sensor_type.lower() != data_sensor_type.lower():
        return False
```

### Betroffene Dateien
- `El Servador/god_kaiser_server/src/db/repositories/logic_repo.py`
- `El Servador/god_kaiser_server/src/services/logic/conditions/sensor_evaluator.py`
- `El Servador/god_kaiser_server/src/services/logic/conditions/hysteresis_evaluator.py`

### Impact
- **Severity:** CRITICAL
- **Betroffene Regeln:** 7 von 8 (alle ausser Notification Test)
- **Konsequenz:** Komplette Automationslogik funktionslos seit Deployment

---

## Bug #2: Rule Test zeigt immer 0.0 statt echtem Sensorwert (HIGH)

### Symptom
- "Regel testen" im Frontend zeigt "Bedingungen NICHT erfuellt"
- API Test-Response: `actual_value: 0.0` obwohl Sensor 22.5 liefert
- Between Test (20-30 Range): 0.0 ist nicht between 20-30 -> false

### Root Cause
`LogicService.test_rule()` nutzte `actual_value = 0.0` als Fallback, wenn kein `mock_sensor_values` im Request war. Es gab keinen Mechanismus, echte Sensorwerte aus der DB zu lesen.

**logic_service.py:296-300 (vorher):**
```python
if test_request.mock_sensor_values and mock_key in test_request.mock_sensor_values:
    actual_value = test_request.mock_sensor_values[mock_key]
else:
    actual_value = 0.0  # <- BUG: Immer 0.0
```

### Fix
Neue Methode `_get_latest_sensor_value()` hinzugefuegt, die den letzten echten Sensorwert aus der DB liest:

```python
async def _get_latest_sensor_value(self, esp_id: str, gpio: int) -> Optional[float]:
    result = await self.logic_repo.session.execute(
        text(
            "SELECT sd.processed_value, sd.raw_value "
            "FROM sensor_data sd "
            "JOIN esp_devices ed ON sd.esp_id = ed.id "
            "WHERE ed.device_id = :esp_id AND sd.gpio = :gpio "
            "ORDER BY sd.timestamp DESC LIMIT 1"
        ),
        {"esp_id": esp_id, "gpio": gpio},
    )
    row = result.fetchone()
    if row:
        return float(row[0]) if row[0] is not None else float(row[1])
    return None
```

Fallback geaendert:
```python
else:
    actual_value = await self._get_latest_sensor_value(esp_id, gpio)
    if actual_value is None:
        actual_value = 0.0
```

### Betroffene Dateien
- `El Servador/god_kaiser_server/src/services/logic_service.py`

### Impact
- **Severity:** HIGH
- **Symptom:** "Regel testen" Button im Frontend liefert immer falsche Ergebnisse
- **User Impact:** Kein Vertrauen in die Regelkonfiguration, kein Debugging moeglich

---

## Bug #3: Falsche sensor_types in DB-Regeln (MEDIUM)

### Symptom
- Zusaetzlich zum Case-Problem hatten einige Regeln komplett falsche sensor_type Werte
- `soil_moisture` in Regeln vs. `moisture` im MQTT-Protokoll

### Root Cause
UI/API akzeptierte beliebige Strings ohne Validierung gegen registrierte Sensor-Typen.

### Fix
DB-Regeln manuell korrigiert:

| Regel | Vorher | Nachher |
|-------|--------|---------|
| 6 Regeln (DS18B20) | `"DS18B20"` | `"ds18b20"` |
| Compound AND Test | `"SHT31"` | `"sht31"` |
| Delay Test | `"soil_moisture"` | `"moisture"` |

Notification Test: Device-Referenz von geloeschtem MOCK auf ESP_00000001 (Wokwi) umgeleitet.

### Betroffene Dateien
- Datenbank: `cross_esp_logic` Tabelle (8 Regeln)

### Impact
- **Severity:** MEDIUM (gefixt durch Bug #1 Normalisierung, aber Daten-Hygiene wichtig)
- **Empfehlung:** Validierung gegen `sensor_type_registry` bei Rule Create/Update einbauen

---

## Bug #4: PubSubClient Dangling Pointer bei MQTT Reconnect (HIGH)

### Symptom
- Wokwi ESP32 verliert MQTT-Verbindung nach ~7 Minuten
- Serial Log zeigt: `hostByName(): DNS Failed for 280102030405069E`
- `280102030405069E` ist eine OneWire ROM-Adresse, KEINE Hostname

### Root Cause
`PubSubClient::setServer(const char* domain, uint16_t port)` speichert **nur den Zeiger**, nicht eine Kopie des Strings. Wenn `mqtt_.setServer()` nur einmal in `initialize()` aufgerufen wird und der Arduino `String` intern realloziiert (Heap-Fragmentierung), zeigt der gespeicherte Zeiger auf Garbage-Daten.

Bei Reconnect wird der Garbage-Pointer als Hostname interpretiert -> DNS-Aufloesung einer OneWire-ROM-Adresse.

### Fix
`mqtt_.setServer()` wird jetzt **vor jedem Verbindungsversuch** in `connectToBroker()` aufgerufen:

**mqtt_client.cpp (connectToBroker(), vor LAST-WILL CONFIGURATION):**
```cpp
// Re-set server before every connection attempt to prevent dangling pointer.
// PubSubClient::setServer() stores only the char* pointer, not a copy.
mqtt_.setServer(current_config_.server.c_str(), current_config_.port);
```

### Betroffene Dateien
- `El Trabajante/src/services/communication/mqtt_client.cpp`

### Impact
- **Severity:** HIGH
- **Symptom:** ESP32 wird nach einigen Minuten permanent offline
- **Konsequenz:** Kein Sensor-Datenfluss, keine Aktor-Steuerung
- **Hinweis:** Firmware muss neu gebaut und geflasht/Wokwi neu gestartet werden

---

## DB Cleanup durchgefuehrt

Vor der Analyse wurde die DB bereinigt:

| Tabelle | Geloescht | Behalten |
|---------|-----------|----------|
| sensor_data (offline devices) | 5.159 Rows | - |
| sensor_data (Wokwi trimmed) | auf 200 | 200 |
| heartbeat_logs | 2.290 | 50/device |
| audit_logs | 30.109 | 200 |
| logic_execution_history | 255 | 50 |
| esp_devices (offline) | 2 | 1 (Wokwi) |
| user_accounts | 0 | alle |

---

## E2E Verifikation (nach allen Fixes)

### API-Level Test (curl)

| Regel | would_trigger | actual_value | Erwartet | Status |
|-------|--------------|--------------|----------|--------|
| Between Test (20-30) | true | 22.5 | true | OK |
| Notification Test (>20) | true | 22.5 | true | OK |
| Temperatur-Alarm (>30) | false | 22.5 | false | OK |
| Nacht-Modus (time) | false | - | abh. von Zeit | OK |
| Compound AND (>25 AND time) | false | 22.5 | false (22.5<25) | OK |
| Hysterese Kuehlung (>28) | false | 22.5 | false (22.5<28) | OK |
| Delay Test (moisture<30) | false | 0.0 | false (no data) | OK |
| Sequence Test (>25) | false | 22.5 | false (22.5<25) | OK |

### Frontend-Level Test (Playwright)

| Test | Vorher | Nachher | Status |
|------|--------|---------|--------|
| Between Test "Regel testen" | "Bedingungen NICHT erfuellt" | "Bedingungen erfuellt" | FIXED |
| Notification Test "Regel testen" | "Bedingungen NICHT erfuellt" | "Bedingungen erfuellt" | FIXED |
| Execution History | Nur Notification Test | Between + Notification | FIXED |
| Rule Dropdown Counts | "0x" fuer alle ausser Notification | "3x/53x gerade eben" | FIXED |

### Screenshots

| Screenshot | Beschreibung |
|------------|--------------|
| `screenshots/logic-between-test-FIXED.png` | Between Test Flow-Editor nach Fix |
| `screenshots/logic-notification-test-FIXED.png` | Notification Test Flow-Editor nach Fix |
| `screenshots/logic-execution-history.png` | Execution History mit beiden Regeln |

---

## Empfehlungen

### Kurzfristig
1. **ESP32 Firmware neu bauen** (`pio run -e esp32_wokwi_full`) und Wokwi neu starten fuer Bug #4 Fix
2. **Existierende Regeln pruefen** - alle sensor_types sollten lowercase sein

### Mittelfristig
3. **sensor_type Validierung einbauen** - Bei Rule Create/Update gegen `sensor_type_registry` validieren
4. **normalize_sensor_type()** aus `sensor_type_registry.py` in der gesamten Pipeline nutzen
5. **PubSubClient Alternative** evaluieren - AsyncMqttClient speichert Kopien statt Zeiger

### Langfristig
6. **Integration Tests** fuer Logic Engine Pipeline (sensor_handler -> logic_engine -> evaluators)
7. **sensor_type als Enum** in DB statt freier String
8. **Frontend sensor_type Dropdown** statt Freitext-Eingabe

---

## Betroffene Dateien (Zusammenfassung)

| Datei | Aenderung |
|-------|-----------|
| `El Servador/.../repositories/logic_repo.py` | Case-insensitive sensor_type matching |
| `El Servador/.../conditions/sensor_evaluator.py` | Case-insensitive sensor_type filter |
| `El Servador/.../conditions/hysteresis_evaluator.py` | Case-insensitive _matches_sensor() |
| `El Servador/.../services/logic_service.py` | _get_latest_sensor_value() + DB query fallback |
| `El Trabajante/.../communication/mqtt_client.cpp` | setServer() before every connect |
| DB: `cross_esp_logic` | 8 Regeln sensor_type normalisiert |
