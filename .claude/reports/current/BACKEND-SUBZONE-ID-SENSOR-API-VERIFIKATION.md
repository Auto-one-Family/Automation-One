# Backend — subzone_id in Sensor-API Verifikation

**Ziel-Repo:** El Servador (god_kaiser_server)  
**Erstellt:** 2026-03-05  
**Priorität:** KRITISCH (falls Bug)  
**Typ:** Verifikation + kleine Anpassungen

---

## Kurzfassung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| **GET /sensors/{esp_id}/{gpio} — subzone_id in Response** | ✅ Ja |
| **POST /sensors/{esp_id}/{gpio} — subzone_id verarbeitet** | ✅ Ja |
| **Merge bei bestehender Subzone** | ✅ Ja (Merge, kein Replace) |
| **subzone_id = null → GPIO aus Subzonen entfernt** | ✅ Ja |
| **List-Endpunkte liefern subzone_id** | ⚠️ Nein → behoben |

**Fazit:** Die zentralen GET/POST-Pfade für Einzelsensor sind korrekt. Zwei List-Endpunkte haben `subzone_id` nicht angereichert und wurden angepasst.

---

## Teil 1: GET /sensors/{esp_id}/{gpio} — subzone_id

### 1.1 Schema

- **Datei:** `src/schemas/sensor.py`
- **SensorConfigResponse** enthält `subzone_id: Optional[str]` (Zeilen 357–360), Beschreibung: „Subzone ID this sensor belongs to (if any)“.

### 1.2 Response-Bau

- **Datei:** `src/api/v1/sensors.py`
- **get_sensor** (ab Zeile 396):
  - Verwendet `SubzoneRepository(db)`.
  - Zeilen 450–452: `subzone = await subzone_repo.get_subzone_by_gpio(esp_id, gpio)`, `subzone_id_val = subzone.subzone_id if subzone else None`.
  - Zeile 455: `response = _model_to_response(sensor, esp_id, subzone_id=subzone_id_val)`.
- **_model_to_response** (Zeilen 103–169) setzt `subzone_id=subzone_id` im `SensorConfigResponse`.

### 1.3 Rückgabe

- Bei einem Sensor in Subzone „becken_ost“ liefert die API `subzone_id: "becken_ost"`.
- **SubzoneRepository.get_subzone_by_gpio** (subzone_repo.py, Zeilen 128–144) existiert und wird genutzt.

---

## Teil 2: POST /sensors/{esp_id}/{gpio} — subzone_id

### 2.1 Schema

- **SensorConfigCreate** enthält `subzone_id: Optional[str]` (schemas/sensor.py, Zeilen 220–224), inkl. Hinweis „Null/empty = remove from all subzones“.

### 2.2 create_or_update_sensor

- **Single-Value-Pfad** (ab Zeile 812):
  - `subzone_id_val = _normalize_subzone_id(request.subzone_id)` („__none__“ und leer → None).
  - Bei `subzone_id_val`: `SubzoneService.assign_subzone(..., assigned_gpios=[gpio], ...)` und `db.commit()`.
  - Sonst: `subzone_service.remove_gpio_from_all_subzones(esp_id, gpio)` und `db.commit()`.
- **Multi-Value-Pfad** (ab Zeile 616): gleiche Logik für die Subzone-Zuweisung.

### 2.3 SubzoneService — Merge vs. Replace

- **Datei:** `src/services/subzone_service.py`
- **_upsert_subzone_config** (Zeilen 580–659):
  - Bei **bestehender** Subzone (Zeilen 611–618):  
    `current = set(existing.assigned_gpios or [])`, `merged = current | set(assigned_gpios)`, `final_gpios = sorted(merged)`.  
    → **Merge** (Vereinigung), kein Replace.
  - Zusätzlich: zugewiesene GPIOs werden aus **anderen** Subzonen des ESP entfernt (ein GPIO nur in einer Subzone).

### 2.4 subzone_id = null

- Bei `_normalize_subzone_id(request.subzone_id) == None` wird `remove_gpio_from_all_subzones(esp_id, gpio)` aufgerufen (sensors.py Zeilen 832, 631).
- **remove_gpio_from_all_subzones** (subzone_service.py, Zeilen 719–733): entfernt den GPIO aus allen Subzonen des ESP und flusht die Session. Aufrufer führt `commit()` aus.

---

## Teil 3: Roundtrip

- **Einzelsensor:** POST mit `subzone_id: "becken_ost"` → SubzoneService.assign_subzone (Merge) bzw. _upsert_subzone_config → GET liefert `subzone_id: "becken_ost"`. ✅
- **Zwei Sensoren in derselben Subzone:** Sensor A in Subzone X; Sensor B zu X zuweisen: assign_subzone(..., assigned_gpios=[gpio_b]). _upsert_subzone_config merged bestehende assigned_gpios mit [gpio_b] → beide bleiben in X. ✅

---

## Teil 4: Anpassungen (List-Endpunkte)

### 4.1 Feststellung

- **GET /** (list_sensors) und **GET /esp/{esp_id}/onewire** (list_onewire_sensors) riefen `_model_to_response(sensor, esp_device_id)` **ohne** `subzone_id` auf.
- Response-Schema ist weiterhin `SensorConfigResponse` (mit `subzone_id`). Ohne Anreicherung war `subzone_id` dort immer `None`.

### 4.2 Durchgeführte Änderungen

1. **list_sensors** (`src/api/v1/sensors.py`):
   - `SubzoneRepository(db)` angelegt.
   - Pro Sensor: `subzone = await subzone_repo.get_subzone_by_gpio(esp_device_id, sensor.gpio)`, dann `_model_to_response(sensor, esp_device_id, subzone_id=subzone.subzone_id if subzone else None)`.

2. **list_onewire_sensors** (gleiche Datei):
   - `SubzoneRepository(db)` angelegt.
   - Pro Sensor: `subzone = await subzone_repo.get_subzone_by_gpio(esp_id, sensor.gpio)`, dann `_model_to_response(sensor, esp_id, subzone_id=subzone.subzone_id if subzone else None)`.

- **delete_sensor:** Unverändert; liefert das gelöschte Objekt, GPIO wurde bereits aus allen Subzonen entfernt, `subzone_id=None` ist korrekt.

---

## Referenzen (Code-Stellen)

| Thema | Datei | Zeilen |
|-------|--------|--------|
| SensorConfigResponse.subzone_id | schemas/sensor.py | 357–360 |
| SensorConfigCreate.subzone_id | schemas/sensor.py | 220–224 |
| get_sensor + get_subzone_by_gpio | api/v1/sensors.py | 450–455 |
| create_or_update_sensor Subzone (Single-Value) | api/v1/sensors.py | 811–842, 859–866 |
| create_or_update_sensor Subzone (Multi-Value) | api/v1/sensors.py | 615–644 |
| _normalize_subzone_id | api/v1/sensors.py | 83–95 |
| _upsert_subzone_config (Merge) | services/subzone_service.py | 580–659 (Merge: 611–618) |
| remove_gpio_from_all_subzones | services/subzone_service.py | 719–733 |
| get_subzone_by_gpio | db/repositories/subzone_repo.py | 128–144 |

---

## Optional: Tests

- Bestehende Tests in `tests/` für Sensor-API und SubzoneService nutzen; Roundtrip (POST mit subzone_id → GET prüft subzone_id) ggf. in einem Integrationstest abdecken.
- Manuell: Sensor anlegen/aktualisieren mit `subzone_id: "becken_ost"`, GET auf denselben Sensor, Response auf `subzone_id: "becken_ost"` prüfen; zweiten Sensor derselben Subzone zuweisen und beide GET-Responses prüfen.
