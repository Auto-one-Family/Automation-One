# Sensor-Konfigurationspanel — Datenfluss-Detailanalyse

> **Erstellt:** 2026-03-05  
> **Ziel:** Exakt dokumentieren, was beim Klick auf „Speichern“ gesendet wird, wann, wohin und wie der Server die Nachricht verarbeitet.  
> **Basis:** Roadmap `roadmap-sensor-konfig-panel-fixes-2026-03-04 copy.md`, VOLLANALYSE, Auftrag Vollanalyse.  
> **Ziel-Repo:** auto-one (El Frontend + El Servador)

---

## 1. Kurzfassung: Was funktioniert, was nicht

| Aktion des Users | Erwartung | Tatsächliches Verhalten | Ursache / Stand |
|------------------|-----------|-------------------------|-----------------|
| **Dropdown:** Bestehende Subzone wählen → **Speichern** klicken | Subzone wird gespeichert, Sensor erscheint in dieser Subzone (Monitor L2, subzone_configs) | Laut früherer Analyse: Subzone **nicht** persistiert | **Codebase 2026-03-05:** Backend ist implementiert (Schema, SubzoneService im POST, GET liefert subzone_id). Falls weiterhin fehlschlagend: Frontend-Payload (z. B. `__none__` vs. null), Mock vs. Real, oder Backend-Validierung/Rollback prüfen. |
| **Dropdown:** „+ Neue Subzone erstellen…“ → Name eingeben → **Haken** klicken | Neue Subzone wird angelegt, aktueller Sensor wird ihr zugewiesen | Funktioniert | Direkter Aufruf `POST /subzone/.../assign` mit `assigned_gpios: [gpio]`; Backend schreibt in `subzone_configs` |
| Alle anderen Einstellungen (Name, Schwellwerte, Kalibrierung, Hardware, …) + **Speichern** | Werte werden in DB und ggf. an ESP gesendet | Bei Real-ESP: Sensor-Config wird gespeichert; Subzone sollte mitverarbeitet werden (Backend-Code vorhanden) | Bei **Mock-ESP** wird kein POST ausgeführt (nur Toast). |
| Panel öffnen (bestehender Sensor mit Subzone) | Subzone im Dropdown vorausgewählt | Früher: oft **nicht** vorausgewählt | **Codebase 2026-03-05:** GET /sensors liefert subzone_id via get_subzone_by_gpio. Frontend muss subzone_id in SubzoneAssignmentSection v-model übernehmen (SensorConfigPanel Zeile 150, 188). |

**Zuverlässiger Alternativweg für Subzone:** Dropdown „+ Neue Subzone erstellen…“ → Namen eingeben (ggf. gleicher Name wie bestehende Subzone) → Haken klicken. Kein Klick auf den allgemeinen „Speichern“-Button nötig für die Subzone-Zuweisung.

**Playwright E2E (2026-03-05):** Monitor L2 (Zone Test) → Übersicht → Sensor „pH Wassertank“ (Mock #9FCB) geöffnet, Subzone im Dropdown auf „Reihe 2“ geändert, Speichern → Toast. Rückprüfung Monitor: Sensor **bleibt** unter „Reihe 1“. Bestätigt: Bei **Mock-ESP** wird kein POST ausgeführt, Subzone-Änderung über Haupt-Save wird nicht persistiert (siehe Abschnitt 10.5).

---

## 2. Was passiert beim Klick auf „Speichern“? (Haupt-Save)

### 2.1 Frontend: Wo wird der Klick behandelt?

- **Komponente:** `El Frontend/src/components/esp/SensorConfigPanel.vue`
- **Button:** „Speichern“ (oder vergleichbar) ruft die Methode **`handleSave()`** auf (Referenz: Roadmap Zeilen 246–307, Vollanalyse SensorConfigPanel handleSave).
- **Bedingung:** Bei **Mock-ESP** wird nur ein Toast angezeigt und ggf. lokaler Store aktualisiert; **kein** HTTP-Request.  
  Bei **Real-ESP** wird `sensorsApi.createOrUpdate(espId, gpio, config)` aufgerufen.

### 2.2 Wie wird das `config`-Objekt gebaut?

Vor dem Aufruf von `createOrUpdate` wird ein **config**-Objekt aus den refs/state der Komponente zusammengesetzt. Relevante Stellen (logisch, Zeilennummern aus Roadmap/Vollanalyse):

- **Grundeinstellungen:** `name`, `description`, `unit`, `enabled` aus den jeweiligen refs.
- **Subzone:**  
  `config.subzone_id = subzoneId.value`  
  `subzoneId` ist der ref, der mit `SubzoneAssignmentSection` per **v-model** gebunden ist. Wenn der User eine **bestehende Subzone** im Dropdown wählt, wird `selectedValue` in SubzoneAssignmentSection gesetzt und per **`emit('update:modelValue', subzoneId)`** an den Parent (SensorConfigPanel) übergeben → **subzoneId** enthält dann z.B. `"becken_ost"`. Wenn der User „Keine Subzone“ wählt, ist es `"__none__"` oder `null` (je nach Implementierung). Wenn der User „+ Neue Subzone erstellen…“ wählt und den Haken klickt, wird **nicht** über v-model der Haupt-Save getriggert, sondern **SubzoneAssignmentSection** ruft direkt **subzonesApi.assignSubzone** auf (siehe Abschnitt 3).
- **Schwellwerte:** `threshold_min`, `threshold_max`, `warning_min`, `warning_max`
- **Kalibrierung:** `calibration` (z.B. von CalibrationWizard)
- **Hardware/Interface:** `gpio`, `interface_type`, `i2c_address`, `i2c_bus`, `measure_range`, `pulses_per_liter` usw.
- **Metadaten:** `metadata` (z.B. mergeDeviceMetadata(...))

**Wichtig:** Das Frontend setzt **`config.subzone_id = subzoneId.value`** und schickt dieses Objekt an **createOrUpdate**. Das Backend muss dieses Feld lesen und verarbeiten – tut es aktuell **nicht**.

### 2.3 Welcher HTTP-Request wird ausgelöst?

- **API-Funktion:** `sensorsApi.createOrUpdate(espId, gpio, config)`  
  (Datei: `El Frontend/src/api/sensors.ts`, typisch `createOrUpdate(espId, gpio, body)`.)
- **Methode:** **POST**
- **URL:**  
  `POST /api/v1/sensors/{esp_id}/{gpio}`  
  (Basis-URL aus Umgebung, z.B. `http://localhost:8000` oder Proxy.)
- **Body:** Das **config**-Objekt als JSON, inklusive u.a.:
  - `sensor_type`, `name`, `description`, `unit`, `enabled`
  - `threshold_min`, `threshold_max`, `warning_min`, `warning_max`
  - **`subzone_id`** (z.B. `"becken_ost"` oder `null` / `"__none__"`)
  - `metadata`, `calibration`
  - `interface_type`, `i2c_address`, `i2c_bus`, `measure_range`, `pulses_per_liter` usw.

**Wann:** Einmal pro Klick auf „Speichern“, sobald `handleSave()` läuft und es sich um einen Real-ESP handelt.

**Wohin:** An den El Servador (Backend), Route unter dem Sensor-Router (Prefix z.B. `/api/v1/sensors`).

### 2.4 Backend: Was empfängt und verarbeitet der Server?

- **Route:** `POST /api/v1/sensors/{esp_id}/{gpio}`  
  Handler typisch: **`create_or_update_sensor`** in `El Servador/god_kaiser_server/src/api/v1/sensors.py` (ab Zeile 456).
- **Request-Body:** Wird als Pydantic-Modell **SensorConfigCreate** geparst (Schema in `El Servador/god_kaiser_server/src/schemas/sensor.py`).

**Stand Codebase 2026-03-05 (Verifikation):**

- **SensorConfigCreate** enthält das Feld **`subzone_id: Optional[str] = Field(None, max_length=50, ...)`** in `schemas/sensor.py` (Zeilen 218–221). Das Frontend-Body-Feld wird vom Backend gelesen.
- **create_or_update_sensor** ruft **nach** dem Speichern der Sensor-Config (nach `db.commit()`) den **SubzoneService** auf: bei gesetztem `request.subzone_id` → `assign_subzone(...)`, sonst → `remove_gpio_from_all_subzones(esp_id, gpio)`. Gilt für Single-Value (sensors.py Zeilen 794–824) und Multi-Value (599–623).
- **subzone_id** wird nicht in `_schema_to_model_fields` übernommen (Subzone-Zuordnung liegt in `subzone_configs`); die Verarbeitung erfolgt ausschließlich über den SubzoneService-Block.

**Folge (historisch):** War das Schema früher ohne subzone_id, wurde die Zuordnung nicht persistiert. **Aktuell** sollte „bestehende Subzone wählen + Speichern“ die Zuordnung in `subzone_configs` aktualisieren. Bei anhaltenden Problemen: Frontend-Payload (null vs. `"__none__"`), Validierungsfehler im SubzoneService oder Rollback prüfen.

---

## 3. Der funktionierende Pfad: „+ Neue Subzone erstellen…“ → Haken

### 3.1 User-Ablauf

1. User öffnet Sensor-Konfigurationspanel (z.B. Klick auf Sensor in HardwareView/MonitorView).
2. In der Subzone-Sektion wählt er im Dropdown **„+ Neue Subzone erstellen…“** (intern `CREATE_OPTION` = `"__create_new__"`).
3. Es erscheint ein Eingabefeld (Placeholder z.B. „Subzone-Name eingeben…“). User gibt einen Namen ein (kann identisch mit einer bestehenden Subzone sein).
4. User klickt auf den **Haken** (Bestätigen) oder drückt Enter.
5. **Kein** Klick auf den allgemeinen „Speichern“-Button ist für die Subzone-Zuweisung nötig.

### 3.2 Frontend: Welcher Code läuft?

- **Komponente:** `El Frontend/src/components/devices/SubzoneAssignmentSection.vue`
- Beim Auswählen von „+ Neue Subzone erstellen…“ wird z.B. **`isCreating.value = true`** gesetzt (Zeilen 51–52), das Eingabefeld angezeigt.
- Bei Bestätigung (Haken/Enter) wird **`confirmCreateSubzone()`** aufgerufen (Zeilen 88–118).

In **confirmCreateSubzone()** passiert u.a.:

1. **Name → subzone_id:** Der eingegebene Name wird normalisiert (toLowerCase, Leerzeichen → `_`, nur `a-z0-9_`), daraus wird **subzone_id** abgeleitet (Zeilen 96–100).
2. **Direkter API-Aufruf (kein Haupt-Save):**  
   **`subzonesApi.assignSubzone(espId, { subzone_id, subzone_name, parent_zone_id, assigned_gpios: [gpio] })`**  
   Dabei ist **gpio** der GPIO des aktuellen Sensors (z.B. aus **props.gpio**). Also wird **genau dieser eine Sensor** (sein GPIO) der (neu angelegten oder bestehenden) Subzone zugewiesen.
3. Nach Erfolg: **espStore.fetchAll()** und **loadSubzones()** werden aufgerufen; außerdem **emit('update:modelValue', subzoneId)** damit das Panel die neue Subzone anzeigt.

### 3.3 HTTP-Request (funktionierender Pfad)

- **Methode:** **POST**
- **URL:**  
  `POST /api/v1/subzone/devices/{esp_id}/subzones/assign`
- **Body (Beispiel):**  
  `{ "subzone_id": "becken_ost", "subzone_name": "Becken Ost", "parent_zone_id": "<zone_uuid>", "assigned_gpios": [4] }`  
  (GPIO 4 als Beispiel; bei mehreren Sensoren in derselben Subzone würde die **Backend-Logik** beim **Merge** die Liste erweitern, aber der Frontend-Call sendet hier nur **einen** GPIO.)

**Wann:** Einmal beim Klick auf den Haken in der „Neue Subzone erstellen“-Eingabe.  
**Wohin:** An den Subzone-Endpoint des El Servador.

### 3.4 Backend: Was passiert mit diesem Request?

- **Route:** `POST /api/v1/subzone/devices/{esp_id}/subzones/assign`  
  Handler: **assign_subzone** in `El Servador/god_kaiser_server/src/api/v1/subzone.py` (Zeilen 105–166).
- Der Handler ruft **SubzoneService.assign_subzone()** auf (z.B. in `god_kaiser_server/src/services/subzone_service.py`), der wiederum **`_upsert_subzone_config`** (Zeilen 579–659) nutzt.
- **Merge-Logik (bestehende Subzone):** Wenn die Subzone bereits existiert, werden die übergebenen **assigned_gpios** mit den bestehenden **gemerged** (current | assigned_gpios), nicht ersetzt. Der neue GPIO wird also zur Liste hinzugefügt; andere Sensoren in der Subzone bleiben erhalten.
- **Neue Subzone:** Wenn die Subzone neu ist, wird sie angelegt und der GPIO in **assigned_gpios** eingetragen; derselbe GPIO wird aus anderen Subzonen des ESP entfernt.

**Warum es funktioniert:** Die Subzone-Zuordnung läuft ausschließlich über diese **Subzone-API** und **subzone_configs**. Da das Frontend hier **direkt** diese Route mit dem richtigen Payload aufruft, wird die DB konsistent aktualisiert. Der Haupt-Save (Sensor-Config) ist dafür nicht nötig.

---

## 4. Vergleich: Beide Pfade im Überblick

| Aspekt | Dropdown „bestehende Subzone“ + **Speichern** | „+ Neue Subzone erstellen…“ + **Haken** |
|--------|-----------------------------------------------|------------------------------------------|
| **Auslöser** | Klick auf **Speichern** im SensorConfigPanel | Klick auf **Haken** in SubzoneAssignmentSection |
| **Frontend-Funktion** | **handleSave()** → **sensorsApi.createOrUpdate(espId, gpio, config)** | **confirmCreateSubzone()** → **subzonesApi.assignSubzone(espId, payload)** |
| **HTTP** | **POST /api/v1/sensors/{esp_id}/{gpio}** Body: config inkl. **subzone_id** | **POST /api/v1/subzone/devices/{esp_id}/subzones/assign** Body: subzone_id, subzone_name, parent_zone_id, **assigned_gpios: [gpio]** |
| **Backend-Handler** | **create_or_update_sensor** (sensors.py) | **assign_subzone** (subzone.py) → SubzoneService |
| **Schema** | **SensorConfigCreate** (ohne subzone_id) | Subzone-Assign-Schema mit assigned_gpios |
| **Subzone-Verarbeitung** | **Keine** – subzone_id wird ignoriert, SubzoneService wird nicht aufgerufen | **Ja** – _upsert_subzone_config schreibt/merged subzone_configs |
| **Ergebnis** | Sensor-Daten gespeichert, **Subzone unverändert** | Subzone-Zuordnung **gespeichert** |

---

## 5. Laden der Subzone beim Öffnen des Panels

- Beim Öffnen des SensorConfigPanels wird die aktuelle Config per **GET /api/v1/sensors/{esp_id}/{gpio}** geladen.
- **Stand Codebase 2026-03-05:** Die Response wird in **get_sensor** (sensors.py) gebaut; **subzone_id** wird **mitgeliefert**: Es wird **SubzoneRepository.get_subzone_by_gpio(esp_id, gpio)** aufgerufen (Zeilen 435–437), und der Wert in **\_model_to_response(..., subzone_id=subzone_id_val)** übergeben.
- **Folge:** Das Frontend kann die Subzone vorauswählen, sofern die Response **subzone_id** enthält und das Panel sie in **subzoneId** (und damit ins Subzone-Dropdown) übernimmt (SensorConfigPanel.vue: `subzoneId.value = config.subzone_id` bei Load, Zeile 150; bei Sensor aus Store Zeile 188).

---

## 6. Konkret: Was der Server „sieht“ und was er tun müsste

### 6.1 Beim Speichern (POST /sensors/{esp_id}/{gpio})

- **Angekommen:** JSON-Body mit allen vom Frontend gesendeten Feldern, **inklusive** `subzone_id` (sofern das Frontend es setzt).
- **Was der Server aktuell macht:** Nur die Felder, die im **SensorConfigCreate**-Schema definiert sind, werden gelesen. Da **subzone_id** dort fehlt, wird es **nicht** gelesen und **nicht** verarbeitet.
- **Was nötig wäre (Soll):**
  1. **SensorConfigCreate** um optionales Feld **subzone_id: Optional[str] = None** erweitern.
  2. In **create_or_update_sensor** **nach** dem erfolgreichen Speichern der Sensor-Config:
     - Wenn **request.subzone_id** gesetzt und nicht „Keine Subzone“ (z.B. nicht `"__none__"`/null): **SubzoneService** aufrufen, um (esp_id, gpio) der Subzone **request.subzone_id** zuzuordnen (GPIO in **assigned_gpios** der Subzone aufnehmen, aus anderen Subzonen des ESP entfernen).
     - Wenn **request.subzone_id** leer/null oder „Keine Subzone“: GPIO aus **allen** Subzonen des ESP entfernen.
  3. Validierung: Subzone muss existieren und zur Zone des ESP passen; bei ungültiger **subzone_id** z.B. 400 mit Fehlermeldung.

### 6.2 Beim Laden (GET /sensors/{esp_id}/{gpio})

- **Aktuell:** Response enthält **kein** **subzone_id**.
- **Soll:** Mit **SubzoneRepository.get_subzone_by_gpio(esp_id, gpio)** die Subzone ermitteln und in der Response **subzone_id** (oder null) zurückgeben, damit das Frontend das Dropdown korrekt setzen kann.

---

## 7. Checkliste für Implementierung (Backend + Frontend)

- [x] **Backend:** `SensorConfigCreate` um **subzone_id** erweitern; in **create_or_update_sensor** bei gesetztem **subzone_id** SubzoneService aufrufen (Merge/Remove-Logik wie bei assign); bei null/„Keine Subzone“ GPIO aus allen Subzonen entfernen. *(Stand 2026-03-05: umgesetzt.)*
- [x] **Backend:** **GET /sensors/{esp_id}/{gpio}** um **subzone_id** anreichern (Lookup über get_subzone_by_gpio). *(Umgesetzt.)*
- [x] **Backend:** Response-Schema (z.B. **SensorConfigResponse**) um **subzone_id** erweitern. *(In _model_to_response/Response vorhanden.)*
- [ ] **Frontend:** **SensorConfigCreate** in `types/index.ts` um **subzone_id?: string | null** ergänzen (Typ-Sicherheit), falls noch nicht vorhanden.
- [ ] **Frontend:** Sicherstellen, dass beim Speichern **subzone_id** aus **subzoneId.value** ins config übernommen wird (bereits der Fall, Zeile 303); bei „Keine Subzone“ **null** senden (nicht den String `"__none__"`).
- [ ] **Verifikation:** Mit **Real-ESP**: Dropdown „bestehende Subzone“ wählen → Speichern → DB und Monitor L2 prüfen; Panel erneut öffnen → Subzone vorausgewählt.

---

## 8. Referenzen (Code-Pfade, Repo auto-one)

| Was | Datei / Ort |
|-----|-------------|
| handleSave, config.subzone_id setzen | El Frontend/src/components/esp/SensorConfigPanel.vue (handleSave, subzoneId) |
| createOrUpdate | El Frontend/src/api/sensors.ts |
| SubzoneAssignmentSection confirmCreateSubzone, assignSubzone | El Frontend/src/components/devices/SubzoneAssignmentSection.vue |
| subzonesApi.assignSubzone | El Frontend/src/api/subzones.ts |
| SensorConfigCreate (Schema) | El Servador/god_kaiser_server/src/schemas/sensor.py |
| create_or_update_sensor, get_sensor, _model_to_response | El Servador/god_kaiser_server/src/api/v1/sensors.py |
| assign_subzone Endpoint | El Servador/god_kaiser_server/src/api/v1/subzone.py |
| SubzoneService.assign_subzone, _upsert_subzone_config | El Servador/god_kaiser_server/src/services/subzone_service.py |
| get_subzone_by_gpio | El Servador/god_kaiser_server/src/db/repositories/subzone_repo.py |

Diese Detailanalyse kann 1:1 im auto-one Repo verwendet werden, um den Datenfluss zu prüfen und die genannten Fixes (subzone_id im Schema, Aufruf SubzoneService im create_or_update_sensor, GET-Anreicherung subzone_id) umzusetzen.

---

## 9. Codebase-Verifikation (Stand 2026-03-05)

Eine vollständige Codebase-Analyse (Frontend + Backend) wurde durchgeführt. **Ergebnis: Das Backend unterstützt `subzone_id` bereits vollständig.** Die in Abschnitt 6/7 beschriebenen Soll-Zustände sind im Code umgesetzt.

### 9.1 Backend: Sensor-Schema und Handler

| Komponente | Datei | Status | Zeilen (ca.) |
|------------|-------|--------|---------------|
| **SensorConfigCreate** | `El Servador/god_kaiser_server/src/schemas/sensor.py` | Feld **subzone_id** vorhanden | 218–221 |
| **create_or_update_sensor (Multi-Value)** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` | SubzoneService.assign_subzone / remove_gpio_from_all_subzones aufgerufen | 599–623 |
| **create_or_update_sensor (Single-Value)** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` | Subzone-Zuweisung nach DB-Commit | 794–824 |
| **get_sensor (GET)** | `El Servador/god_kaiser_server/src/api/v1/sensors.py` | subzone_id via **get_subzone_by_gpio** in Response | 435–441 |
| **get_subzone_by_gpio** | `El Servador/god_kaiser_server/src/db/repositories/subzone_repo.py` | Lookup (esp_id, gpio) → SubzoneConfig | 128 ff. |

- **SensorConfigCreate**: `subzone_id: Optional[str] = Field(None, max_length=50, description="Subzone ID to assign...")`
- **Single-Value-Pfad**: Nach `db.commit()` (Zeile 767) wird `SubzoneService.assign_subzone` (bei `request.subzone_id`) bzw. `remove_gpio_from_all_subzones` (bei leer) aufgerufen; danach wird `subzone_id_val` für die Response per `get_subzone_by_gpio` geholt.
- **GET**: `subzone = await subzone_repo.get_subzone_by_gpio(esp_id, gpio)`; `subzone_id_val = subzone.subzone_id if subzone else None`; wird in `_model_to_response(..., subzone_id=subzone_id_val)` übergeben.

**Fazit Backend:** Die in Abschnitt 6 beschriebenen Anpassungen (Schema, POST-Subzone-Logik, GET-Anreicherung) sind implementiert. Wenn „Dropdown bestehende Subzone + Speichern“ trotzdem nicht persistiert, kommen u. a. in Frage: Frontend sendet `subzone_id` nicht oder sendet einen Wert (z. B. `"__none__"`), den das Backend als „leer“ behandelt; oder ein anderer Fehler (Validierung, Rollback).

### 9.2 Frontend: Config-Bau und API

| Komponente | Datei | Verhalten |
|------------|-------|-----------|
| **handleSave** | `El Frontend/src/components/esp/SensorConfigPanel.vue` | `config.subzone_id = subzoneId.value \|\| null` (Zeile 303); bei **Mock-ESP** wird **kein** HTTP-Request ausgeführt, nur Toast. |
| **createOrUpdate** | `El Frontend/src/api/sensors.ts` | `POST /sensors/${espId}/${gpio}` mit Body inkl. `...config` (subzone_id wird mitgeschickt, wenn im config). |
| **SubzoneAssignmentSection** | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | NONE_OPTION = `"__none__"`; bei Auswahl „Keine Subzone“ wird `emit('update:modelValue', null)`; bei „+ Neue Subzone erstellen…“ wird **subzonesApi.assignSubzone** direkt aufgerufen (kein Haupt-Save). |

Für **Real-ESP** wird also `subzone_id` im Request-Body an `POST /sensors/{esp_id}/{gpio}` gesendet. Das Backend liest das Feld aus dem Schema. Wenn der User „Keine Subzone“ wählt, ist `subzoneId.value` laut Setter `null` – Backend erhält `null` und ruft `remove_gpio_from_all_subzones` auf.

### 9.3 Mögliche Restursachen falls Subzone-Speichern fehlschlägt

- **Mock vs. Real:** Bei Mock wird kein POST ausgelöst; Subzone-Änderung nur über „+ Neue Subzone erstellen…“ (assignSubzone) wirksam.
- **Normalisierung:** Backend könnte `subzone_id` format-validieren (z. B. nur `a-z0-9_`); Frontend sendet Subzone-IDs aus dem Dropdown (z. B. `reihe_1`), die mit den bestehenden IDs übereinstimmen müssen.
- **Fehlerbehandlung:** Bei SubzoneService-Exception wird im Backend teils nur `rollback` und Warning geloggt („Non-fatal“), Response könnte trotzdem 200 sein – dann wäre die Subzone nicht geändert, obwohl der Rest der Sensor-Config gespeichert wurde.

---

## 10. Playwright-Browser-Test (2026-03-05)

Ein manueller Ablauf mit dem Playwright MCP (Browser-Automation) wurde durchgeführt, um den Pfad zum Sensor-Konfigurationspanel und das Verhalten von Subzone-Dropdown und Speichern zu verifizieren.

### 10.1 Umgebung

- **Frontend:** http://localhost:5173 (Dev)
- **Login:** admin / Admin123#
- **Seite nach Login:** /hardware (Dashboard mit Zonen/ESPs)

### 10.2 Durchgeführter Flow

1. **browser_navigate** → http://localhost:5173/login  
2. **browser_fill_form** → Benutzername `admin`, Passwort `Admin123#`  
3. **browser_click** → „Anmelden“ → Weiterleitung nach /hardware  
4. **browser_click** → „Konfigurieren“ auf ESP-Karte „Mock #9FCB“ (Zone Test)  
5. Dialog „Geräte-Einstellungen“ öffnet sich (ESPSettingsSheet) mit Sektion „Sensoren (3)“  
6. **browser_click** → Sensor „pH Wassertank GPIO 32 7.0 pH“  
7. SlideOver **Sensor-Konfigurationspanel** öffnet sich (Dialog „pH“) mit:
   - Grundeinstellungen (Name, Beschreibung, Einheit, Sensor-Typ, Aktiv)
   - **Subzone** als **combobox** (ref=e714) mit Optionen: „Keine Subzone“, „Test“, „Reihe 1“, „Reihe 2“, „Test7“, „+ Neue Subzone erstellen…“
   - Schwellwerte, Kalibrierung, Hardware & Interface, Speichern-Button
8. **browser_select_option** → Subzone „Reihe 1“ ausgewählt  
9. **browser_click** → „Speichern“ (ref=e815)  
10. **Ergebnis:** Toast „Sensor-Konfiguration gespeichert“ (weil Mock-ESP: kein HTTP POST, nur lokaler Toast).

### 10.3 Netzwerk-Requests (Ausschnitt)

Erfasste Requests u. a.:  
- `GET /api/v1/subzone/devices/MOCK_95A49FCB/subzones` → 200 (Laden der Subzone-Liste für das Dropdown)  
- Kein `POST /api/v1/sensors/...` beim Speichern, da Mock (laut Frontend-Code erwartbar).

### 10.4 Fazit Playwright

- Login und Navigation zum Sensor-Config-Panel funktionieren.
- Subzone-Dropdown wird aus **GET /subzone/devices/{esp_id}/subzones** befüllt und zeigt bestehende Subzonen plus „+ Neue Subzone erstellen…“.
- Bei **Mock-ESP** führt „Speichern“ nur zu einem Toast; ein echter Subzone-Persist-Test über den Haupt-Save erfordert einen **Real-ESP** und ggf. Abgleich mit Backend-Logs/DB.

---

## 10.5 Playwright E2E: Monitor → Übersicht → Subzone ändern → Rückprüfung (2026-03-05)

Zweiter Durchlauf: Sensor im Monitor prüfen, in der Übersicht Subzone per Dropdown ändern, Speichern, dann im Monitor prüfen, ob die Änderung persistiert ist.

### Ablauf

1. **Monitor L1** (`/monitor`): Zone-Tiles sichtbar (FINALERTEST, Test, Testneu).  
2. **Klick auf Zone „Test“** → **Monitor L2** (`/monitor/test`): Subzone-Accordion mit Sensoren.
   - **Reihe 1** (7pH, 1 Sensor): **pH Wassertank** (7 pH, MOCK_95A49FCB, „Gerade eben“).
   - **Reihe 2** (0°C, 1 Sensor): Temp 0C79 (MOCK_95A49FCB).
   - **Test7** (35°C, 1 Sensor): SHT31_0 (MOCK_95A49FCB).
   - Weitere Gruppe „0°C · 36°C“ (2 Sensoren, MOCK_0CBACD10), **Keine Subzone** (1 Aktor).
3. **Navigation zur Übersicht:** Klick auf „Dashboard“ (Sidebar) → **Übersicht** (`/hardware`).
4. **ESP öffnen:** „Konfigurieren“ auf **Mock #9FCB** (Zone Test) → Dialog „Geräte-Einstellungen“.
5. **Sensor öffnen:** Klick auf „pH Wassertank GPIO 32 7.0 pH“ → **Sensor-Konfigurationspanel** (Dialog „pH“).
   - Subzone-Combobox (ref=e1190): Optionen „Keine Subzone“, „Test“, „Reihe 1“, „Reihe 2“, „Test7“, „+ Neue Subzone erstellen…“ (keine explizite Vorauswahl im Snapshot angezeigt; Monitor zeigte Sensor in Reihe 1).
6. **Subzone ändern:** **browser_select_option** → „Reihe 2“ ausgewählt.
7. **Speichern:** **browser_click** auf „Speichern“ (ref=e1291) → Toast **„Sensor-Konfiguration gespeichert“**.
8. **Rückprüfung Monitor:** **browser_navigate** → `/monitor/test`.

### Ergebnis

- **Monitor L2 nach der Änderung:**  
  - **Reihe 1** (7pH, 1 Sensor): **pH Wassertank** (7 pH, MOCK_95A49FCB) ist **weiterhin** in **Reihe 1**.  
  - **Reihe 2** (0°C, 1 Sensor): nur **Temp 0C79** (0 °C, MOCK_95A49FCB), **kein** pH-Sensor.

**Fazit:** Die im Config-Panel gewählte Subzone **„Reihe 2“** wurde **nicht** persistiert. Der Sensor bleibt in der Monitor-Ansicht unter **Reihe 1**. Ursache: **Mock-ESP** – `handleSave()` führt bei Mock **keinen** `POST /api/v1/sensors/...` aus, nur Toast. Die Subzone-Zuordnung liegt serverseitig in `subzone_configs`; ohne POST findet keine Backend-Aktualisierung statt.  
**Folgerung:** Um „Dropdown bestehende Subzone wählen + Speichern“ zu verifizieren, muss ein **Real-ESP** (oder ein Mock mit nachgebildetem Sensor-POST) verwendet werden; mit dem aktuellen Mock-ESP ist nur der Pfad „+ Neue Subzone erstellen…“ → Haken (direkt `POST /subzone/.../assign`) für eine sichtbare Änderung im Monitor wirksam.

---

## 11. Loki (Log-Abfrage)

- **Ziel:** Relevante Logs zum Fokusbereich (Sensor-Config, Subzone, POST /sensors) in Loki prüfen (z. B. `make loki-errors`, `make loki-trace CID=...`).
- **Durchführung:** In der verwendeten Umgebung (Windows, PowerShell) war das Skript `scripts/loki-query.sh` (bash) nicht ausführbar (kein Bash/WSL). Loki wurde daher **nicht** abgefragt.
- **Empfehlung:** In einer Umgebung mit laufendem Loki und bash: `make loki-errors` (letzte 5 Min.), nach einem Speicher-Versuch mit Real-ESP ggf. `make loki-trace CID=<id>` ausführen und Einträge zu `sensors`, `subzone` oder `create_or_update_sensor` prüfen. Referenz: `.claude/CLAUDE.md` Abschnitt „Loki-Debug“, `docs/debugging/logql-queries.md`.

---

## 12. Aktualisierte Checkliste (nach Verifikation)

- [x] **Backend:** SensorConfigCreate enthält **subzone_id** (schemas/sensor.py).
- [x] **Backend:** create_or_update_sensor (Single- und Multi-Value) ruft SubzoneService (assign / remove_gpio_from_all_subzones) auf.
- [x] **Backend:** GET /sensors/{esp_id}/{gpio} liefert **subzone_id** via get_subzone_by_gpio.
- [ ] **Frontend:** Sicherstellen, dass bei Real-ESP und „bestehende Subzone wählen“ der Wert (nicht `"__none__"` als String) als `subzone_id` gesendet wird und bei „Keine Subzone“ `null` ankommt.
- [ ] **Verifikation mit Real-ESP:** Dropdown „bestehende Subzone“ → Speichern → DB/Monitor L2 prüfen; Panel erneut öffnen → Subzone vorausgewählt.
- [ ] **Optional:** Loki bei nächster Gelegenheit für Fehler/Trace zum Sensor/Subzone-Flow abfragen.
