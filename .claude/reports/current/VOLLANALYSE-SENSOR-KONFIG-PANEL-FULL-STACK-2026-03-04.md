# Vollanalyse: Sensor-Konfigurationspanel & Full-Stack — Konsolidierter Bericht

**Erstellt:** 2026-03-04  
**Grundlage:** Auftrag `auftrag-sensor-konfigurationspanel-einstellungsportal-vollanalyse.md`, AutoOps Debug, System-Control, DB-Inspector, Frontend/Server-Codeanalyse  
**Ziel:** Ein Bericht mit allen Ergebnissen aus Code, Logs, AutoOps und DB.

---

## 1. Executive Summary

| Bereich | Status | Wichtigste Befunde |
|--------|--------|---------------------|
| **Frontend-Log-Meldung** | Erklärt / Regel deaktiviert | Meldung stammt von Grafana/Loki-Alert; Regel ist in der Codebase deaktiviert (False Positives). |
| **AutoOps** | Bestanden | Health 8/9, Debug 10 Issues (3 auto-fixed, 7 manuell). |
| **Subzone im SensorConfigPanel** | Lücke (S1) | Frontend sendet `subzone_id`, Backend ignoriert ihn; nur „Neue Subzone erstellen“ funktioniert. **Zusätzlich:** GET /sensors liefert kein `subzone_id` → Subzone wird beim Laden nicht vorausgewählt. |
| **Backend SensorConfigCreate** | Kein subzone_id | Schema und create_or_update rufen SubzoneService nicht auf. |
| **sensorDbId (S10/S12)** | UX-Lücke | Nach erstem Save wird Response-`id` nicht in `sensorDbId` geschrieben → Alert/Runtime-Sektionen erst nach Panel-Reload sichtbar. |
| **i2c_address (S9)** | Potentieller Fehler | Frontend sendet String `"0x44"`, Backend erwartet `int` (0–127). |
| **DB** | Konsistent | Subzone nur in `subzone_configs.assigned_gpios`, nicht in `sensor_configs`. |

---

## 2. Frontend-Meldung: „Frontend-Container nicht erreichbar — keine Logs seit 5 Minuten“

### 2.1 Herkunft

- **Quelle:** Grafana-Alert, der als Notification an den Server gesendet wird (`notification_router`).
- **Server-Log:**  
  `"Notification created: ... title='Frontend-Container nicht erreichbar — keine Logs seit 5 Minuten'"`  
  (z. B. `logs/server/god_kaiser.log`, source=grafana).

### 2.2 Regel in der Codebase

- **Datei:** `docker/grafana/provisioning/alerting/loki-alert-rules.yml` (ca. Zeilen 271–297).
- **Status:** Die Regel „Loki: Frontend Down“ ist **auskommentiert (DEAKTIVIERT)**.
- **Begründung im Kommentar:**  
  Der Vite-Dev-Server (el-frontend) schreibt nur beim Start eine Zeile („VITE ready“), danach keine kontinuierlichen Logs.  
  `count_over_time({compose_service="el-frontend"} [5m])` ist daher fast immer 0 → der Alert würde ständig False Positives auslösen.

### 2.3 Warum die Meldung trotzdem erscheinen kann

1. **Früher aktiv:** Die Regel war ggf. früher aktiv; bestehende Alerts/Notifications bleiben sichtbar.
2. **Andere Alert-Definition:** In Grafana könnte eine weitere (manuell angelegte) Regel mit gleichem Titel existieren.
3. **Webhook:** Wenn ein anderer Alert denselben Titel/Text verwendet, erzeugt der Webhook dieselbe Notification.

### 2.4 Empfehlungen

| Option | Aktion |
|--------|--------|
| **A) Regel deaktiviert lassen (empfohlen)** | Nichts ändern. Status des Frontend-Containers stattdessen per `docker compose ps el-frontend` oder Docker-Healthcheck prüfen. |
| **B) Regel reaktivierbar machen** | Erst wenn das Frontend dauerhaft Logs schreibt (z. B. nginx Access-Logs oder periodisches Heartbeat-Logging), die Regel wieder einkommentieren. |
| **C) Alte Alerts prüfen** | In Grafana: Alerting → Alert Rules und Contact Points prüfen, ob eine aktive Regel denselben Titel/Message verwendet. |

**Fazit:** Die Log-Meldung kommt von einem Grafana-Alert. Die in der Codebase referenzierte Regel ist korrekt deaktiviert. Die Frontend-Logs sind nicht „unerreichbar“ – der Vite-Dev-Server produziert nur kaum Logs, was die Regel unbrauchbar macht.

---

## 3. AutoOps (Health + Debug)

### 3.1 Ausführung

- Health: `run_autoops(mode='health')`
- Debug: `run_autoops(mode='debug')`
- Reports:  
  - Health: `El Servador/god_kaiser_server/src/autoops/reports/autoops_session_274c0544_20260304_182057.md`  
  - Debug: `El Servador/god_kaiser_server/src/autoops/reports/autoops_session_7bd4bae4_20260304_182058.md`

### 3.2 Health Check

- **Ergebnis:** 8/9 Checks bestanden.
- **Checks:** Server healthy, Auth, Devices (5, 2 online, 3 offline), DB, MQTT, DB-Service, Performance-Metriken, Sensor-Daten-Frische, Zonen (3).

### 3.3 Debug & Fix

- **Ergebnis:** 10 Issues gefunden, 3 auto-fixed, 7 verbleibend.
- **Auto-Fix:** 3 Mock-ESPs (offline, last heartbeat: never) → Heartbeat getriggert (MOCK_0CBACD10, MOCK_57A7B22F, MOCK_98D427EA).
- **Verbleibend (manuell):**
  - 5× „Device has no sensors or actuators configured“ (verschiedene MOCK_*).
  - 2× „Sensor ph has no calibration data“ (info, zwei Sensor-Configs).

---

## 4. Sensor-Konfigurationspanel & Subzone (Auftrag S1–S3)

### 4.1 Frontend (SensorConfigPanel.vue)

- **Subzone-Bindung:** `subzoneId` ref, gebunden an `SubzoneAssignmentSection` (v-model), Zeile 286: `config.subzone_id = subzoneId.value` im Save-Payload.
- **Haupt-Save:** `sensorsApi.createOrUpdate(props.espId, props.gpio, config)`; Config enthält u. a. Schwellwerte, Metadata, Kalibrierung, **subzone_id**.
- **Typ:** `SensorConfigCreate` in `El Frontend/src/types/index.ts` enthält **kein** `subzone_id` (Zeilen 601–636) → Typ-Lücke, aber Laufzeit-Payload enthält das Feld.
- **Subzone-Laden (Code-Verifikation):** Zeilen 145–147 laden `config.subzone_id` aus `sensorsApi.get()`; Zeilen 184–196 Fallback auf `device.sensors[].subzone_id`. **Problem:** `GET /sensors/{esp_id}/{gpio}` liefert **kein** `subzone_id` (Backend `_model_to_response` fügt es nicht hinzu). Der Fallback nutzt `espStore.devices` – die Device-Liste stammt aus anderer Quelle (z. B. Kaiser/ESP-API); Sensoren in Subzonen haben dort nur indirekt Subzone-Kontext (über `subzone_configs.assigned_gpios`). **Ergebnis:** Subzone wird beim Öffnen des Panels für Real-ESPs praktisch nie korrekt vorausgewählt.

### 4.2 Backend (SensorConfigCreate + create_or_update_sensor)

- **Schema:** `El Servador/god_kaiser_server/src/schemas/sensor.py` – `SensorConfigCreate` hat **kein** Feld `subzone_id` (Zeilen 108–240).
- **Verarbeitung:** In `api/v1/sensors.py` wird `_schema_to_model_fields(request)` verwendet (Zeilen 154–199); dort kommt **kein** subzone_id vor.  
  Selbst wenn das Frontend subzone_id mitschickt: Pydantic v2 ignoriert unbekannte Felder (default), und die Logik nutzt sie nirgends.
- **create_or_update_sensor:** Ruft **keinen** SubzoneService auf (Zeilen 456–770). Subzone-Zuordnung wird beim „Haupt-Save“ also nicht übernommen.
- **GET /sensors/{esp_id}/{gpio}:** `_model_to_response()` (Zeilen 85–149) liefert **kein** `subzone_id`. Eine Anreicherung aus `subzone_configs` (GPIO → Subzone-Lookup) fehlt.

### 4.3 Subzone-Datenmodell (DB)

- **sensor_configs:** Keine Spalte `subzone_id`. Subzone-Zuordnung lebt ausschließlich in `subzone_configs.assigned_gpios` (esp_id + Liste GPIO).
- **MonitorDataService:** Liest Subzone aus `SubzoneConfig` und baut `gpio_to_subzone` aus `assigned_gpios` (monitor_data_service.py Zeilen 66–76). Korrekt.

### 4.4 SubzoneAssignmentSection („Neue Subzone erstellen“)

- **Flow:** Nutzer wählt „+ Neue Subzone erstellen…“, gibt Namen ein, dann `subzonesApi.assignSubzone(espId, { subzone_id, subzone_name, parent_zone_id, assigned_gpios: [props.gpio] })` (SubzoneAssignmentSection.vue Zeilen 92–96).
- **Backend:** `POST /subzone/devices/{esp_id}/subzones/assign` → SubzoneService.assign_subzone() → `subzone_configs` wird korrekt befüllt.
- **S2 bestätigt:** `assigned_gpios: [props.gpio]` wird korrekt gesendet.
- **Fazit:** „Neue Subzone erstellen“ und Zuweisung des aktuellen GPIO funktionieren. **Nur** die Auswahl einer **bestehenden** Subzone + Speichern über den Haupt-Save wird nicht persistiert (S1). Zusätzlich: **Subzone-Laden** beim Öffnen des Panels funktioniert für Real-ESPs nicht, da GET /sensors kein subzone_id zurückgibt.

### 4.5 Fix-Empfehlung S1 (Subzone beim Haupt-Save + Laden)

**Option A – Backend (empfohlen):**

1. In `schemas/sensor.py`: Optionales Feld `subzone_id: Optional[str] = None` zu `SensorConfigCreate` hinzufügen.
2. In `api/v1/sensors.py` in `create_or_update_sensor` **nach** dem erfolgreichen Speichern der Sensor-Config:
   - Wenn `request.subzone_id` gesetzt ist: SubzoneService aufrufen, um dieses (esp_id, gpio) der Subzone `request.subzone_id` zuzuordnen (GPIO in `assigned_gpios` der Subzone aufnehmen, aus anderen Subzonen entfernen).
   - Wenn `request.subzone_id` leer/null: GPIO aus allen Subzonen des ESP entfernen („Keine Subzone“).
3. **GET-Anreicherung:** In `get_sensor` bzw. `_model_to_response` (oder nach dem Response-Bau): SubzoneRepository/SubzoneService nutzen, um für (esp_id, gpio) die Subzone aus `subzone_configs.assigned_gpios` zu ermitteln und `subzone_id` dem Response hinzuzufügen (z. B. als zusätzliches Feld im Schema oder via `model_config` extra). So kann das Frontend die Subzone beim Öffnen korrekt laden.

**Option B – Frontend:**

- Nach dem Haupt-Save bei geänderter Subzone zusätzlich `subzonesApi.assignSubzone` bzw. einen „remove from subzone“-Call ausführen. Funktional möglich, aber doppelte Logik und fehleranfälliger.
- **Subzone-Laden:** Vor dem Öffnen oder in `onMounted` `subzonesApi.getSubzones(espId)` aufrufen und aus der Response (falls `assigned_gpios` pro Subzone enthalten) die Subzone für `props.gpio` auflösen. Aktuell liefert `get_esp_subzones` SubzoneInfo mit `assigned_gpios` – prüfen ob Frontend diese Daten nutzen kann.

Zusätzlich im Frontend: `SensorConfigCreate` in `types/index.ts` um `subzone_id?: string | null` ergänzen.

---

## 5. Weitere Auftragspunkte (Kurz)

| ID | Thema | Befund |
|----|--------|--------|
| **S2** | SubzoneAssignmentSection props.gpio / „Neue Subzone“ | `assigned_gpios: [props.gpio]` wird korrekt gesendet (SubzoneAssignmentSection.vue Zeile 96). |
| **S3** | Subzone-Liste für Mock-ESP | `subzonesApi.getSubzones(espId)` – Backend akzeptiert MOCK_* (ESP_ID_PATH_PATTERN); ggf. Frontend-Blockade in anderen Views prüfen (Auftrag subzonen-mock-geraete). |
| **S4–S5** | Schwellwerte Laden/Speichern | Beim Laden aus Config gesetzt (inkl. roundToDecimals, Zeilen 151–154); beim Save alle vier Werte in config (threshold_min/max, warning_min/max, Zeilen 265–268). |
| **S10, S12** | sensorDbId für Alert/Runtime | **Code-Verifikation:** `sensorDbId` wird aus `config.id` beim **Laden** gesetzt (Zeile 136), **nicht** aus der createOrUpdate-Response. Nach erstem Save wird die Response mit `id` nicht in `sensorDbId` geschrieben – die AccordionSections „Alert-Konfiguration“ und „Laufzeit & Wartung“ bleiben bis Panel-Neuladen ausgeblendet (`v-if="sensorDbId"`). **Fix:** Nach `createOrUpdate` Response auswerten und `sensorDbId.value = response.id` setzen. |
| **S22** | Sensor entfernen | Vorhanden: `confirmAndDelete()` (Zeilen 218–241) ruft `sensorsApi.delete(espId, gpio)` (Real) bzw. `espStore.removeSensor` (Mock). Button „Sensor entfernen“ mit ConfirmDialog. |
| **S23** | Subzone-Cleanup bei Sensor-Löschen | Backend `delete_sensor` (sensors.py Zeilen 790–854): Ruft nur `sensor_repo.delete(sensor.id)` – **kein** SubzoneService. GPIO bleibt in `subzone_configs.assigned_gpios`. Entweder in DELETE-Sensor-Logik SubzoneService anbinden (GPIO aus allen Subzonen des ESP entfernen) oder als separates Cleanup-Job dokumentieren. |
| **S9 (neu)** | i2c_address Format | Frontend sendet `i2c_address: i2cAddress.value` (Zeile 274) – Wert ist String `"0x44"`. Backend `SensorConfigCreate` erwartet `i2c_address: Optional[int]` (0–127). Pydantic-Validierung kann fehlschlagen. **Fix:** Vor dem Senden `parseInt(i2cAddress.value, 16)` oder `Number('0x' + i2cAddress.value.replace('0x',''))` verwenden. |
| **S16** | LinkedRulesSection | Filtert korrekt nach `sourceEspId/sourceGpio` (Sensor) bzw. `targetEspId/targetGpio` (Aktor) – `logicStore.connections` (LinkedRulesSection.vue Zeilen 26–32). Kein sensor_id nötig; (esp_id, gpio) ist ausreichend. |

---

## 6. DB-Inspector (Referenz)

- **DB_INSPECTOR_REPORT.md:** Schema aktuell (Migration `add_subzone_custom_data`), keine orphaned sensor_configs, Not-Aus-Persistenz-Fix (actuator_states) umgesetzt.
- **Subzone:** Nur `subzone_configs` (esp_id, subzone_id, assigned_gpios); `sensor_configs` ohne subzone_id. Keine Änderung am Schema für S1 nötig, nur API-/Service-Logik.

---

## 7. Verknüpfungsmatrix (Soll vs. Ist)

| Sektion | Speicherweg | API | Ist |
|---------|-------------|-----|-----|
| Grundeinstellungen | Haupt-Save | createOrUpdate | OK |
| Schwellwerte | Haupt-Save | createOrUpdate | OK |
| Kalibrierung | Haupt-Save | createOrUpdate | OK |
| Hardware/Interface | Haupt-Save | createOrUpdate | i2c_address als String „0x44“ statt int (S9) |
| Geräte-Informationen | Haupt-Save | createOrUpdate (metadata) | OK |
| Alert-Konfiguration | eigener Save | updateAlertConfig(sensorDbId) | sensorDbId erst nach Reload (S10) |
| Laufzeit & Wartung | eigener Save | updateRuntime(sensorDbId) | sensorDbId erst nach Reload (S12) |
| Verknüpfte Regeln | — | read-only (logicStore) | OK |
| Live-Vorschau | — | WebSocket/espStore | OK |
| **Subzone (bestehend)** | **Haupt-Save** | **createOrUpdate subzone_id** | **Backend ignoriert (S1)** |
| **Subzone (Laden)** | GET /sensors | get() | **Kein subzone_id in Response** |
| Subzone (neu) | SubzoneAssignmentSection | assignSubzone | OK |

---

## 8. Priorisierte Maßnahmen

1. **S1 (hoch):** Backend: `subzone_id` in SensorConfigCreate + nach create_or_update_sensor SubzoneService aufrufen; GET /sensors mit subzone_id anreichern; Frontend: `SensorConfigCreate` um `subzone_id` ergänzen.
2. **S10/S12 (mittel):** Nach createOrUpdate `sensorDbId.value = response.id` setzen, damit Alert/Runtime-Sektionen sofort sichtbar werden. Optional: Hinweis „Zuerst Sensor speichern“, wenn sensorDbId fehlt.
3. **S9 (mittel):** i2c_address vor dem Senden als Integer senden (`parseInt(value, 16)`); beim Laden Backend-Wert (int) in Hex-String für Select konvertieren.
4. **Frontend-Meldung:** In Grafana prüfen, ob eine aktive Regel den Titel „Frontend-Container nicht erreichbar…“ hat; Regel in Repo bleibt deaktiviert.
5. **S23 (niedrig):** Beim Sensor-Löschen GPIO aus subzone_configs.assigned_gpios entfernen (Backend oder Cleanup).

---

## 9. Referenzen

| Dokument/Datei | Inhalt |
|----------------|--------|
| `auftrag-sensor-konfigurationspanel-einstellungsportal-vollanalyse.md` | S1–S23, Verifikations-Checkliste |
| `docker/grafana/provisioning/alerting/loki-alert-rules.yml` | Frontend-Down-Regel (Zeilen 271–297 auskommentiert) |
| `El Servador/god_kaiser_server/src/schemas/sensor.py` | SensorConfigCreate (Zeilen 108–240, ohne subzone_id); i2c_address: int |
| `El Servador/god_kaiser_server/src/api/v1/sensors.py` | create_or_update_sensor (456–770), _schema_to_model_fields (154–199), get_sensor (366–438), delete_sensor (790–854) |
| `El Servador/god_kaiser_server/src/services/monitor_data_service.py` | gpio_to_subzone aus subzone_configs (66–76) |
| `El Servador/god_kaiser_server/src/services/subzone_service.py` | assign_subzone (95–150), get_esp_subzones |
| `El Frontend/src/components/esp/SensorConfigPanel.vue` | handleSave (246–307), subzoneId (70), SubzoneAssignmentSection (361–367), sensorDbId (61, 136), i2cAddress (76, 274) |
| `El Frontend/src/components/devices/SubzoneAssignmentSection.vue` | assignSubzone (92–96), getSubzones (66) |
| `El Frontend/src/types/index.ts` | SensorConfigCreate (601–637, ohne subzone_id) |
| AutoOps Reports | `El Servador/god_kaiser_server/src/autoops/reports/autoops_session_*_20260304_*.md` |
| DB_INSPECTOR_REPORT.md | Schema, Not-Aus, Orphan-Check |

---

## 10. Verifikation durch Code-Analyse (2026-03-04)

Die folgenden Aussagen wurden durch direkte Code-Inspektion verifiziert:

| Prüfpunkt | Datei | Zeilen | Ergebnis |
|-----------|-------|--------|----------|
| subzone_id im Save-Payload | SensorConfigPanel.vue | 286 | `config.subzone_id = subzoneId.value` |
| sensorDbId aus Response | SensorConfigPanel.vue | 296–298 | Kein `sensorDbId.value = response.id` nach createOrUpdate |
| Alert/Runtime v-if | SensorConfigPanel.vue | 513, 525 | `v-if="sensorDbId"` – Sektionen ausgeblendet wenn null |
| i2c_address Sendetyp | SensorConfigPanel.vue | 274 | `config.i2c_address = i2cAddress.value` (String) |
| Backend i2c_address Schema | schemas/sensor.py | 148–154 | `Optional[int]`, ge=0, le=127 |
| _schema_to_model_fields | sensors.py | 154–199 | Kein subzone_id |
| _model_to_response | sensors.py | 85–149 | Kein subzone_id in Response |
| delete_sensor SubzoneService | sensors.py | 790–854 | Kein Aufruf |
| assignSubzone assigned_gpios | SubzoneAssignmentSection.vue | 96 | `[props.gpio]` |
| LinkedRulesSection Filter | LinkedRulesSection.vue | 26–32 | sourceEspId/sourceGpio, targetEspId/targetGpio |
| Loki-Regel Status | loki-alert-rules.yml | 271–297 | Auskommentiert |

---

**Ende des Berichts.**
