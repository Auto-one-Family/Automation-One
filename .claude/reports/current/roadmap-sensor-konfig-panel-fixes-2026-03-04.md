# Roadmap: Sensor-Konfigurationspanel — Schritt-für-Schritt Fixes

> **Erstellt:** 2026-03-04  
> **Basis:** VOLLANALYSE-SENSOR-KONFIG-PANEL-FULL-STACK-2026-03-04.md  
> **Ziel:** Jeden Fehler exakt einarbeiten und Punkt für Punkt abarbeiten  
> **Ziel-Repo:** auto-one (El Frontend + El Servador)  
> **Verify-Plan:** 2026-03-04 — Pfade, APIs und Referenzen gegen Codebase validiert

---

## Code-Pfad: Subzone-Konfiguration im Sensor-Config-Panel

> **Stand:** 2026-03-05 — Vollständige Analyse Frontend → Backend  
> **Ziel:** Exakte Code-Locations und Datenfluss für den einzigen funktionierenden Weg dokumentieren

### 1. Frontend: Wo liegt das Subzone-Dropdown?

| Komponente | Datei | Zeilen | Beschreibung |
|------------|-------|--------|--------------|
| **SensorConfigPanel** | `El Frontend/src/components/esp/SensorConfigPanel.vue` | 373–380 | Einbindung der Subzone-Sektion |
| **SubzoneAssignmentSection** | `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | 1–263 | **Drop-down + „Neue Subzone erstellen“-Logik** |

**Exakte Stelle des Dropdowns:**

```138:147:El Frontend/src/components/devices/SubzoneAssignmentSection.vue
      <select
        v-model="selectedValue"
        class="subzone-assignment__select"
        :disabled="disabled || isLoading"
      >
        <option v-for="opt in selectOptions" :key="String(opt.value)" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
```

**Optionen im Dropdown (Zeilen 63–70):**

```63:70:El Frontend/src/components/devices/SubzoneAssignmentSection.vue
const selectOptions = computed(() => {
  const opts = [
    { value: NONE_OPTION, label: 'Keine Subzone' },
    ...availableSubzones.value.map((sz) => ({ value: sz.id, label: sz.name })),
    { value: CREATE_OPTION, label: '+ Neue Subzone erstellen...' },
  ]
  return opts
})
```

- `NONE_OPTION` = `__none__` (interner Sentinel)
- `CREATE_OPTION` = `__create_new__` (interner Sentinel)
- `availableSubzones` = Liste aus `GET /api/v1/subzone/devices/{esp_id}/subzones`

### 2. Der funktionierende Workaround (einziger Weg bisher)

**Ablauf:** Nutzer wählt „+ Neue Subzone erstellen…“ und gibt den **exakt gleichen Namen** wie eine bestehende Subzone ein. Beide Sensoren landen in derselben Subzone.

| Schritt | Code-Location | Aktion |
|---------|---------------|--------|
| 1 | `SubzoneAssignmentSection.vue` Z. 51–52 | Nutzer wählt `CREATE_OPTION` → `isCreating.value = true` |
| 2 | Z. 147–157 | Eingabefeld erscheint, Placeholder: „Subzone-Name eingeben…“ |
| 3 | Z. 88–118 | `confirmCreateSubzone()` wird aufgerufen (Enter oder Haken-Button) |
| 4 | Z. 96–100 | Name → `subzone_id`: `toLowerCase()`, Leerzeichen→`_`, nur `a-z0-9_` |
| 5 | Z. 101–108 | **Direkter Aufruf Subzone-API** (nicht Sensor-Save): `subzonesApi.assignSubzone(espId, { subzone_id, subzone_name, parent_zone_id, assigned_gpios: [gpio] })` |
| 6 | Z. 109–110 | `espStore.fetchAll()` + `loadSubzones()` |
| 7 | Z. 111 | `emit('update:modelValue', subzoneId)` → Parent aktualisiert `subzoneId` |

**Warum es funktioniert:** Die Subzone-API wird direkt aufgerufen. Wenn der normalisierte Name mit einer bestehenden Subzone übereinstimmt, findet `_upsert_subzone_config` den Eintrag und **merged** den GPIO in die bestehende Liste (statt zu ersetzen).

### 3. Datenfluss „Neue Subzone erstellen“ → Backend

```
SubzoneAssignmentSection.confirmCreateSubzone()
    ↓
subzonesApi.assignSubzone(espId, { subzone_id, subzone_name, parent_zone_id, assigned_gpios: [gpio] })
    ↓
POST /api/v1/subzone/devices/{esp_id}/subzones/assign
    ↓
El Servador/god_kaiser_server/src/api/v1/subzone.py
    assign_subzone() Z. 105–166
    ↓
SubzoneService.assign_subzone() → _upsert_subzone_config()
    ↓
El Servador/god_kaiser_server/src/services/subzone_service.py
    _upsert_subzone_config() Z. 579–659
    - Bestehende Subzone: MERGE (current | assigned_gpios), Z. 610–618
    - Neue Subzone: CREATE + GPIO aus anderen Subzonen entfernen, Z. 635–656
```

**Backend-Dateien:**

| Datei | Zeilen | Funktion |
|-------|--------|----------|
| `api/v1/subzone.py` | 105–166 | `assign_subzone` Endpoint |
| `services/subzone_service.py` | 95–176 | `assign_subzone` (MQTT oder DB-only für Mock) |
| `services/subzone_service.py` | 579–659 | `_upsert_subzone_config` (Merge-Logik) |

### 4. Der nicht funktionierende Pfad: Dropdown-Auswahl bestehender Subzone

**Erwarteter Ablauf:** Nutzer wählt eine bestehende Subzone im Dropdown und klickt „Speichern“.

| Schritt | Code-Location | Erwartung |
|---------|---------------|-----------|
| 1 | `SubzoneAssignmentSection.vue` Z. 45–59 | `selectedValue.set(v)` mit `v = subzone_id` (z.B. `becken_ost`) |
| 2 | Z. 54–56 | `emit('update:modelValue', subzoneId)` → `subzoneId` im Parent |
| 3 | `SensorConfigPanel.vue` Z. 295–296 | `config.subzone_id = subzoneId.value` beim Speichern |
| 4 | Z. 306 | `sensorsApi.createOrUpdate(espId, gpio, config)` |
| 5 | Backend `sensors.py` Z. 803–813 | `SubzoneService.assign_subzone()` bei `request.subzone_id` |

**Backend ist vorbereitet:** `create_or_update_sensor` ruft bei gesetztem `request.subzone_id` den SubzoneService auf (sensors.py Z. 800–816). Theoretisch sollte der Dropdown-Pfad funktionieren.

**Mögliche Ursachen, warum es trotzdem nicht funktioniert:**

1. **Subzone-Liste leer:** `loadSubzones()` (Z. 72–86) holt Subzonen von `GET /subzone/devices/{esp_id}/subzones`. Wenn die Liste leer ist, erscheinen keine bestehenden Subzonen im Dropdown.
2. **ESP-ID-Mismatch:** Mock-ESP vs. echte ESP-ID (z.B. `MOCK_608E` vs. `ESP_MOCK_608E`) kann dazu führen, dass die Subzone-API andere Daten liefert.
3. **Kein Speichern:** Wenn der Nutzer nur die Subzone wechselt, aber nicht auf „Speichern“ klickt, wird `subzone_id` nicht ans Backend gesendet.
4. **v-model / Reaktivität:** Möglicherweise wird `subzoneId` beim Dropdown-Wechsel nicht korrekt aktualisiert.

### 5. API-Übersicht

| API | Endpoint | Verwendung |
|-----|----------|------------|
| **Subzone-Liste** | `GET /api/v1/subzone/devices/{esp_id}/subzones` | `subzonesApi.getSubzones()` → Dropdown-Optionen |
| **Subzone zuweisen** | `POST /api/v1/subzone/devices/{esp_id}/subzones/assign` | Workaround: `confirmCreateSubzone()` |
| **Sensor speichern** | `POST /api/v1/sensors/{esp_id}/{gpio}` | Dropdown-Pfad: `handleSave()` mit `config.subzone_id` |

### 6. Zusammenfassung

- **Funktionierender Weg:** „+ Neue Subzone erstellen…“ → Name eingeben (ggf. identisch mit bestehender Subzone) → Bestätigen. Ruft direkt die Subzone-API auf.
- **Nicht funktionierender Weg:** Bestehende Subzone im Dropdown wählen → „Speichern“. Sollte über die Sensor-API laufen; Backend ist verdrahtet, Ursache vermutlich im Frontend oder Datenfluss.

---

## Vorbedingungen (vor Start prüfen)

- [ ] Docker-Stack läuft: `make status` → postgres, mqtt-broker, el-servador, el-frontend
- [ ] Backend erreichbar: `make health` oder `curl http://localhost:8000/api/v1/health/live`
- [ ] Admin-User existiert (falls Tests manuell)
- [ ] Vollanalyse-Dokumente vorhanden: VOLLANALYSE-SENSOR-KONFIG-PANEL-FULL-STACK-2026-03-04.md, auftrag-sensor-konfigurationspanel-einstellungsportal-vollanalyse.md

---

## Übersicht

| Phase | Schritte | Priorität |
|-------|----------|-----------|
| **Phase 1** | Subzone — Haupt-Save + Laden + Validierung (S1, S1b) | KRITISCH |
| **Phase 2** | sensorDbId + i2c_address (S10, S12, S9) | HOCH |
| **Phase 3** | Subzone-Cleanup bei Sensor-Löschen (S23) | MITTEL |
| **Phase 4** | Frontend-Meldung / Grafana (optional) | NIEDRIG |

---

## Phase 1: Subzone — Vollständig funktional

### Schritt 1.1 — Backend: SubzoneService-Logik prüfen und fixen (S1b NEU)

**Problem:**  
Bei Zuweisung eines Sensors zu einer **bestehenden** Subzone wird die Subzone überschrieben: Der bisherige Sensor verliert die Subzone, nur der neue hat sie. Erwartung: **Hinzufügen** zum bestehenden `assigned_gpios`, nicht Ersetzen.

**Dateien (validiert):**
- `El Servador/god_kaiser_server/src/services/subzone_service.py` — Methode `_upsert_subzone_config` (Zeilen 579–659)
- `El Servador/god_kaiser_server/src/api/v1/subzone.py` — Endpoint `POST /v1/subzone/devices/{esp_id}/subzones/assign`

**IST-Zustand (Codebase 2026-03-05):**  
`_upsert_subzone_config` Z. 610–618: **MERGE bereits implementiert** — `current = set(existing.assigned_gpios or [])`, `merged = current | set(assigned_gpios)`, `final_gpios = sorted(merged)`. Bei Zuweisung aus SubzoneAssignmentSection mit `[gpio]` werden bestehende GPIOs erhalten. Siehe Code-Pfad oben.

**Zu prüfen:**
1. Wie verhält sich `assign_subzone`, wenn `subzone_id` bereits existiert? → Ruft `_upsert_subzone_config` mit der übergebenen Liste auf.
2. Ersetzt `assigned_gpios` die bestehende Liste? → **Ja** (Zeile 455).
3. Gilt dasselbe für den Aufruf aus dem **Sensors-API** (nach Schritt 1.2)? → Ja, wenn dort SubzoneService genutzt wird.

**Soll-Logik (stabil, validiert):**
- **Zuweisung zu bestehender Subzone:** `assigned_gpios` = bestehende Liste + neuer GPIO (wenn nicht schon enthalten). Entferne diesen GPIO aus allen anderen Subzonen desselben ESP.
- **Zuweisung „Keine Subzone“:** Entferne diesen GPIO aus allen Subzonen des ESP.
- **Neue Subzone erstellen:** `assigned_gpios: [gpio]` ist korrekt (keine Merge nötig).

**Aktionen:**
- [x] SubzoneService._upsert_subzone_config anpassen: Bei bestehender Subzone Merge statt Replace (bestehende assigned_gpios laden, neuen GPIO hinzufügen, aus anderen Subzonen entfernen).
- [ ] Oder: Neue Methode `add_gpio_to_subzone(esp_id, subzone_id, gpio)` und Aufrufer anpassen.
- [ ] Unit-Test: Subzone A hat [4]; Sensor auf GPIO 5 zu Subzone A zuweisen → A hat [4, 5].

**Agent:** server-dev (Backend-Änderungen)

---

### Schritt 1.2 — Backend: subzone_id in SensorConfigCreate + create_or_update_sensor (S1)

**Problem:**  
Frontend sendet `subzone_id`, Backend ignoriert es. Subzone-Zuweisung über Haupt-Save funktioniert nicht.

**Dateien (validiert):**
- `El Servador/god_kaiser_server/src/schemas/sensor.py` — `SensorConfigCreate` (Zeilen 106–238, aktuell **kein** subzone_id)
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — `create_or_update_sensor` (ab Zeile 456), `_schema_to_model_fields` (Zeile 153)

**API-Route:** `POST /api/v1/sensors/{esp_id}/{gpio}` (Router-Prefix: `/v1/sensors`)

**Aktionen:**
- [x] In `schemas/sensor.py`: Optionales Feld `subzone_id: Optional[str] = None` zu `SensorConfigCreate` hinzufügen.
- [ ] In `sensors.py` in `create_or_update_sensor` **nach** erfolgreichem Speichern der Sensor-Config (vor `return _model_to_response`):
  - Wenn `request.subzone_id` gesetzt: SubzoneService aufrufen (Merge-Logik aus Schritt 1.1). SubzoneService benötigt `session` — `get_subzone_service` oder direkte Instanziierung mit `db` prüfen.
  - Wenn `request.subzone_id` leer/null: GPIO aus allen Subzonen des ESP entfernen (SubzoneRepository.remove_gpio_from_all oder neue Service-Methode).
- [ ] Validierung: Subzone muss existieren und zu derselben Zone gehören wie der ESP. SubzoneRepository.get_by_esp_and_subzone + ESP.zone_id prüfen. Bei ungültiger subzone_id: 400 mit Fehlermeldung.

**Agent:** server-dev

---

### Schritt 1.3 — Backend: GET /sensors mit subzone_id anreichern (S1)

**Problem:**  
`GET /api/v1/sensors/{esp_id}/{gpio}` liefert kein `subzone_id`. Beim Öffnen des Panels wird die Subzone nicht vorausgewählt.

**Dateien (validiert):**
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — `get_sensor` (Zeile 375), `_model_to_response` (Zeilen 85–149)
- `El Servador/god_kaiser_server/src/db/repositories/subzone_repo.py` — **SubzoneRepository.get_subzone_by_gpio(esp_id, gpio)** existiert bereits (Zeilen 128–143)

**IST-Zustand:**  
`SensorConfigResponse` (schemas/sensor.py Zeile 285) und `_model_to_response` enthalten **kein** subzone_id.

**Aktionen:**
- [x] `SensorConfigResponse` in `schemas/sensor.py` um `subzone_id: Optional[str] = None` erweitern.
- [ ] In `get_sensor` (oder in `_model_to_response` mit zusätzlichem Parameter): SubzoneRepository.get_subzone_by_gpio(esp_id, gpio) aufrufen. esp_id aus Request; gpio aus Sensor-Config. SubzoneRepository benötigt `session` — aus `db` (DBSession) verfügbar.
- [ ] Rückgabe: `subzone_id=subzone.subzone_id` wenn gefunden, sonst `subzone_id=None`.
- [ ] Wenn GPIO in keiner Subzone: `subzone_id: null`.

**Agent:** server-dev

---

### Schritt 1.4 — Frontend: SensorConfigCreate + Subzone-Laden (S1)

**Dateien (validiert):**
- `El Frontend/src/types/index.ts` — `SensorConfigCreate` (Zeilen 601–637, aktuell **kein** subzone_id)
- `El Frontend/src/components/esp/SensorConfigPanel.vue` — Subzone-Laden Zeilen 145–147 (config.subzone_id), Fallback Zeilen 184–196 (device.sensors für Mock)
- `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` — Dropdown + „Neue Subzone erstellen“ (siehe Code-Pfad oben)

**IST-Zustand:**  
Frontend sendet bereits `config.subzone_id` (Zeile 295–296). Beim Laden: Zeile 148–150 prüft `config.subzone_id` — funktioniert nach Backend-Fix 1.3. Fallback 188–199 nutzt device.sensors für Mock (BUG-2: device.subzone_id wäre falsch, sensor-level ist korrekt).

**Dropdown vs. Workaround:**  
- **Workaround (funktioniert):** SubzoneAssignmentSection → „+ Neue Subzone erstellen…“ → Name eingeben → `confirmCreateSubzone()` ruft direkt `subzonesApi.assignSubzone()` auf.
- **Dropdown (sollte funktionieren):** Auswahl bestehender Subzone → `emit('update:modelValue', subzoneId)` → SensorConfigPanel speichert via `sensorsApi.createOrUpdate()` mit `config.subzone_id`. Backend sensors.py Z. 803–813 ruft SubzoneService auf. Wenn Dropdown-Auswahl nicht persistiert: Prüfen ob `loadSubzones()` Subzonen liefert, ob `selectedValue` korrekt propagiert, ob Nutzer „Speichern“ klickt.

**Aktionen:**
- [ ] In `types/index.ts`: `SensorConfigCreate` um `subzone_id?: string | null` ergänzen (Typ-Sicherheit).
- [ ] SensorConfigPanel: Keine Änderung nötig für Laden — nach Backend-Fix (1.3) liefert `sensorsApi.get()` subzone_id. Fallback (device.sensors) für Mock beibehalten.
- [ ] Optional: `(config as any)` durch typisierten Zugriff ersetzen, wenn SensorConfigResponse in types erweitert wird.
- [ ] Debug: Dropdown-Auswahl bestehender Subzone — Netzwerk-Tab prüfen ob `POST /sensors/{esp_id}/{gpio}` mit `subzone_id` gesendet wird.

**Agent:** frontend-dev

---

### Schritt 1.5 — Verifikation Phase 1

- [ ] Sensor zu bestehender Subzone zuweisen: Beide Sensoren (alter + neuer) bleiben in der Subzone.
- [ ] Sensor von Subzone zu „Keine Subzone“ wechseln: Nur dieser Sensor verliert Subzone.
- [ ] Panel öffnen: Subzone wird korrekt vorausgewählt.
- [ ] Neue Subzone erstellen: Funktioniert weiterhin (assigned_gpios: [gpio]).

---

## Phase 2: sensorDbId + i2c_address

### Schritt 2.1 — Frontend: sensorDbId aus Response setzen (S10, S12)

**Problem:**  
Nach erstem Save eines neuen Sensors werden Alert-Konfiguration und Laufzeit & Wartung erst nach Panel-Reload sichtbar.

**Datei (validiert):** `El Frontend/src/components/esp/SensorConfigPanel.vue` — handleSave Zeile 299: `await sensorsApi.createOrUpdate(...)` ohne Response-Auswertung

**IST-Zustand:**  
- Backend `create_or_update_sensor` gibt `_model_to_response(sensor, esp_id)` zurück (Zeile 771) — enthält `id` (Zeile 118).
- Frontend `sensorsApi.createOrUpdate` gibt `response.data` zurück (sensors.ts Zeile 26) — Typ `SensorConfigResponse` mit `id`.
- SensorConfigPanel ignoriert die Response; `sensorDbId` wird nur beim Laden gesetzt (Zeile 136).

**Aktionen:**
- [ ] Nach `const result = await sensorsApi.createOrUpdate(...)`: `if (result?.id) sensorDbId.value = String(result.id)`.
- [ ] Backend liefert bereits `id` — keine API-Änderung nötig.
- [ ] Optional: Hinweis „Zuerst Sensor speichern“ anzeigen, wenn `sensorDbId` fehlt und User Alert/Runtime öffnet (AlertConfigSection, RuntimeMaintenanceSection haben `v-if="sensorDbId"` — Zeilen 677, 691).

**Agent:** frontend-dev

---

### Schritt 2.2 — Frontend: i2c_address als Integer senden (S9)

**Problem:**  
Frontend sendet `i2c_address: "0x44"` (String), Backend erwartet `int` (0–127). Pydantic-Validierung kann 422 liefern.

**Datei (validiert):** `El Frontend/src/components/esp/SensorConfigPanel.vue` — config-Bau Zeilen 272–275: `config.i2c_address = i2cAddress.value` (String)

**IST-Zustand:**  
- Backend `SensorConfigCreate` (schemas/sensor.py Zeile 148): `i2c_address: Optional[int] = Field(None, ge=0, le=127)`.
- Frontend: `i2cAddress.value` ist String (z. B. `"0x44"`), wird unverändert gesendet.

**Aktionen:**
- [ ] Vor dem Senden (Zeile 273): `config.i2c_address = i2cAddress.value != null ? parseInt(String(i2cAddress.value).replace(/^0x/i, ''), 16) : null`
- [ ] Beim Laden (Zeile 141): Backend liefert `i2c_address` als int — bereits `(config as any).i2c_address || '0x44'`. Prüfen: Wenn int, konvertieren zu `'0x' + value.toString(16)` für Select/Input.
- [ ] Validierung: parseInt mit radix 16; NaN abfangen → null senden.

**Agent:** frontend-dev

---

### Schritt 2.3 — Verifikation Phase 2

- [ ] Neuer Sensor speichern: Alert- und Runtime-Sektionen sofort sichtbar.
- [ ] I2C-Sensor (z. B. SHT31): Speichern ohne 422-Fehler; Roundtrip OK.

---

## Phase 3: Subzone-Cleanup bei Sensor-Löschen (S23)

**Problem:**  
Beim Löschen eines Sensors bleibt sein GPIO in `subzone_configs.assigned_gpios` → verwaiste Einträge.

**Datei (validiert):** `El Servador/god_kaiser_server/src/api/v1/sensors.py` — `delete_sensor` (Zeilen 866–938)

**IST-Zustand:**  
[Korrektur] Implementierung bereits vorhanden. Nach `sensor_repo.delete(sensor.id)` (Zeile 896) wird `SubzoneService.remove_gpio_from_all_subzones(esp_id, gpio)` aufgerufen (Zeilen 897–905), vor `db.commit()` (Zeile 906).

**Aktionen:**
- [x] Neue Methode: `SubzoneService.remove_gpio_from_all_subzones(esp_id, gpio)` — implementiert in `subzone_service.py` Z. 719–733.
- [x] In `delete_sensor` **nach** `sensor_repo.delete(sensor.id)` (vor commit): SubzoneService aufrufen, GPIO aus allen Subzonen des ESP entfernen.
- [x] Subzone mit leerem `assigned_gpios`: Leer lassen (empfohlen) — Nutzer kann Subzone manuell löschen.

**Agent:** server-dev

---

### Verifikation Phase 3

- [x] Sensor in Subzone löschen: GPIO aus Subzone entfernt; andere Sensoren in Subzone unverändert.
- [x] Integration-Test: `test_delete_sensor_removes_gpio_from_subzones` in `test_api_sensors.py`

**End-to-End-Checkliste (manuell):**

| Schritt | Erwartung |
|---------|-----------|
| Panel öffnen | Konfiguration (inkl. Subzone) wird geladen |
| Dropdown „bestehende Subzone“ → Speichern | Alle Daten inkl. Subzone am Server |
| Sensor in Subzone löschen | GPIO nicht mehr in `subzone_configs.assigned_gpios`, andere Sensoren unverändert |

---

## Phase 4: Frontend-Meldung / Grafana (optional)

**Problem:**  
Meldung „Frontend-Container nicht erreichbar — keine Logs seit 5 Minuten“ erscheint.

**Datei (validiert):** `docker/grafana/provisioning/alerting/loki-alert-rules.yml` — Zeilen 271–297: Rule 6 „Loki: Frontend Down“ ist **auskommentiert** (Zeilen 277–297). Der Alert-Text steht in Zeile 294.

**Hintergrund:** Der Vite-Dev-Server schreibt nur beim Start eine Log-Zeile; `count_over_time(...[5m])` liefert daher fast immer 0 → False Positives. Regel wurde deaktiviert.

**Aktionen:**
- [ ] In Grafana UI: Alerting → Alert Rules prüfen, ob eine **aktive** Regel denselben Titel/Message verwendet (evtl. alte Provisionierung).
- [ ] Repo-Regel bleibt deaktiviert (auskommentiert). Bei Reaktivierung: Frontend müsste periodisches Heartbeat-Logging oder nginx Access-Logs haben.
- [ ] Alte Notifications in Grafana Inbox löschen.

---

## Checkliste aller Fix-Punkte (aus Vollanalyse)

| ID | Fix | Phase | Status |
|----|-----|-------|--------|
| **S1** | Backend: subzone_id in Schema + create_or_update + SubzoneService | 1.2 | [ ] |
| **S1b** | SubzoneService: Merge statt Replace bei bestehender Subzone | 1.1 | [ ] |
| **S1 (Laden)** | GET /sensors mit subzone_id anreichern | 1.3 | [ ] |
| **S1 (Frontend)** | SensorConfigCreate Typ + Subzone-Laden | 1.4 | [ ] |
| **S2** | SubzoneAssignmentSection assigned_gpios: [gpio] | — | OK (bereits korrekt) |
| **S3** | Subzone-Liste für Mock-ESP | — | Optional prüfen |
| **S4–S5** | Schwellwerte Laden/Speichern | — | OK (bereits korrekt) |
| **S9** | i2c_address als Integer senden (Frontend) | 2.2 | [ ] |
| **S10, S12** | sensorDbId aus Response setzen | 2.1 | [ ] |
| **S16** | LinkedRulesSection | — | OK (bereits korrekt) |
| **S22** | Sensor entfernen | — | OK (Button + API vorhanden) |
| **S23** | Subzone-Cleanup bei Sensor-Löschen | 3 | [x] |
| **Frontend-Meldung** | Grafana-Regel prüfen | 4 | [ ] |

---

## Abhängigkeiten

```
1.1 (SubzoneService Merge) ──┬──► 1.2 (Backend subzone_id)
                             │
1.2 ─────────────────────────┼──► 1.3 (GET subzone_id)
                             │
1.3 ─────────────────────────┴──► 1.4 (Frontend)

2.1, 2.2, 3, 4 — unabhängig voneinander
```

**Empfohlene Reihenfolge:** 1.1 → 1.2 → 1.3 → 1.4 → 2.1 → 2.2 → 3 → 4

---

## Verifikation nach Implementierung

| Bereich | Befehl | Zweck |
|---------|--------|-------|
| Backend | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -k sensor -v` | Sensor-bezogene Tests |
| Backend | `cd "El Servador/god_kaiser_server" && poetry run pytest tests/ -k subzone -v` | Subzone-Tests (falls vorhanden) |
| Frontend | `cd "El Frontend" && npx vue-tsc --noEmit` | TypeScript-Check |
| Frontend | `cd "El Frontend" && npx vitest run --testPathPattern=SensorConfig` | SensorConfigPanel-Tests (falls vorhanden) |

---

## Referenzen

| Dokument | Pfad | Inhalt |
|----------|------|--------|
| **Code-Pfad Subzone** | Dieses Dokument, Abschnitt oben | Subzone-Dropdown, Workaround, Backend-Kette |
| VOLLANALYSE-SENSOR-KONFIG-PANEL-FULL-STACK-2026-03-04.md | `.claude/reports/current/` | Vollständige Analyse |
| auftrag-sensor-konfigurationspanel-einstellungsportal-vollanalyse.md | `.claude/reports/current/` | S1–S23, Verifikations-Checkliste |
| zonen-subzonen-vollanalyse-bericht-2026-03-04.md | `.claude/reports/current/` | B1, B2, B5, Datenstruktur |
| REST_ENDPOINTS.md | `.claude/reference/api/` | Sensor-Endpoints (Quick-Lookup evtl. veraltet, Code in sensors.py maßgeblich) |

---

## Debug-Hinweise (Bugs finden)

| Symptom | Prüfen | Log/API |
|---------|--------|---------|
| Subzone wird nicht gespeichert | Backend: subzone_id in Request? create_or_update_sensor ruft SubzoneService? | `logs/server/god_kaiser.log` oder Loki |
| Subzone wird beim zweiten Sensor überschrieben | SubzoneService._upsert_subzone_config: Merge oder Replace? | DB: `subzone_configs.assigned_gpios` |
| Subzone nicht vorausgewählt | GET /sensors/{esp_id}/{gpio} liefert subzone_id? | Browser DevTools Network, Response prüfen |
| **Dropdown-Auswahl funktioniert nicht** | 1) GET /subzone/devices/{esp_id}/subzones liefert Subzonen? 2) POST /sensors/{esp_id}/{gpio} enthält subzone_id? 3) selectedValue in SubzoneAssignmentSection propagiert? | Network-Tab: Request Payload bei Speichern prüfen |
| **Workaround funktioniert** | Bestätigt: „Neue Subzone erstellen“ + gleicher Name → POST /subzone/.../assign direkt | SubzoneAssignmentSection.confirmCreateSubzone() Z. 88–118 |
| Alert/Runtime nach Save nicht sichtbar | sensorDbId nach createOrUpdate gesetzt? Response.id vorhanden? | Vue DevTools, sensorDbId ref |
| 422 bei I2C-Sensor Save | Request-Body: i2c_address als int oder string? | Browser DevTools Network, Request Payload |
| Verwaiste GPIO in Subzone nach Sensor-Löschen | delete_sensor ruft Subzone-Cleanup? | DB: `subzone_configs` prüfen, ob gelöschter GPIO noch in `assigned_gpios` |
