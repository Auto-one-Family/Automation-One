# Zonen & Subzonen — Vollanalyse-Bericht

> **Erstellt:** 2026-03-04  
> **Basis:** Auftrag `auftrag-zonen-subzonen-esp-server-frontend-vollanalyse.md`  
> **Codebase-Stand:** Aktuelle Codebase (El Trabajante, El Servador, El Frontend)  
> **Referenzen:** MQTT_TOPICS.md, REST_ENDPOINTS.md, WEBSOCKET_EVENTS.md, DATABASE_ARCHITECTURE.md

---

## 1. Executive Summary

Die Analyse bestätigt die Architektur: **ESP als Endpunkt**, **Server als zentrale Autorität**, **Frontend L1 (Zone) funktioniert**, **L2 (Subzone) und Monitor L2 haben identifizierte Bruchstellen**.

| Thema | Status | Bruchstelle |
|-------|--------|-------------|
| **L1 Zone** | ✅ Funktioniert | Keine — nicht kaputt machen |
| **L2 Subzone Frontend→Server** | ⚠️ Teilweise | B1: useSubzoneCRUD sendet `assigned_gpios: []` bei Create; espWithSubzone-Lookup fragwürdig |
| **Monitor L2 (HierarchyTab)** | ⚠️ Teilweise | B2: Hierarchy zeigt ESPs pro Subzone, nicht Sensoren/Aktoren pro Subzone |
| **Zone-Context 404** | ⚠️ Behandelt | B3: ZoneContextEditor fängt 404 ab; Backend liefert 404 (kein 200+leer) |
| **subzone/safe** | ✅ Gefixt (B4) | ESP subscribt + Handler (main.cpp) |
| **Mock Subzone** | ✅ Unterstützt | Backend akzeptiert MOCK_*/ESP_MOCK_*; DB-Upsert ohne MQTT |

---

## 2. Block 1: ESP (El Trabajante)

### 2.1 MQTT-Topics (Ein/Aus)

| Topic | Richtung | Handler | Datei:Zeile |
|-------|----------|---------|-------------|
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | Server→ESP | Zone Handler | main.cpp:1330-1558 |
| `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` | ESP→Server | zone_ack_handler.py | - |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | Server→ESP | Subzone Handler | main.cpp:1562-1667 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | Server→ESP | Subzone Handler | main.cpp:1671-1710 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | ESP→Server | subzone_ack_handler.py | - |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | Server→ESP | Subzone Safe-Mode Handler | main.cpp (B4 Fix 2026-03-04) |

**Status:** ESP subscribt seit B4-Fix zu `subzone/safe`. Handler: action enable/disable, gpioManager.enableSafeModeForSubzone/disableSafeModeForSubzone.

### 2.2 Payload-Schemata

**Zone ACK (ESP→Server):**
```json
{
  "esp_id": "...",
  "status": "zone_assigned" | "zone_removed" | "error",
  "zone_id": "...",
  "master_zone_id": "...",
  "ts": 1735818000,
  "seq": 1
}
```
Stimmt mit MQTT_TOPICS.md §5.2 überein (zone_name fehlt im Fallback-String, wird bei Erfolg gesendet).

**Subzone ACK (ESP→Server):**
```json
{
  "esp_id": "...",
  "subzone_id": "...",
  "status": "subzone_assigned" | "subzone_removed" | "error",
  "ts": 1735818000,
  "error_code": 2506,
  "message": "..."
}
```
Stimmt mit MQTT_TOPICS.md §5.5 überein. `action`-Feld fehlt; Server erwartet `status`.

**Subzone Assign (Server→ESP) — Server sendet:**
- `assigned_gpios` (Array)
- `subzone_id`, `subzone_name`, `parent_zone_id`, `safe_mode_active`, `timestamp`

**MQTT_TOPICS.md §5.3** nennt `gpio_pins` — Server nutzt `assigned_gpios`. ESP erwartet `assigned_gpios` (main.cpp:1574). ✅ Konsistent.

### 2.3 NVS-Keys

| Namespace | Key | Verwendung |
|-----------|-----|------------|
| Zone | `zone_id`, `master_zone_id`, `zone_name`, `zone_assigned`, `kaiser_id`, `kaiser_name`, `connected`, `id_generated`, `l_mz_id`, `l_mz_name`, `is_master_esp` | config_manager.cpp |
| Subzone | `sz_idx_map`, `sz_count`, `sz_%d_id`, `sz_%d_name`, `sz_%d_par`, `sz_%d_safe`, `sz_%d_ts`, `sz_%d_gpio` | config_manager.cpp |

### 2.4 Heartbeat

- Enthält: `zone_id`, `zone_assigned`, `master_zone_id` (mqtt_client.cpp:718-720)
- Enthält **keine** `subzone_id` oder Subzone-Liste

### 2.5 Validierung

- Zone: `configManager.validateZoneConfig()` vor Update
- Subzone: `subzone_id` required, `parent_zone_id` muss ESP-Zone entsprechen, Zone muss zugewiesen sein, `configManager.validateSubzoneConfig()`

### 2.6 Error-Codes (2500–2506)

| Code | Konstante | Verwendung |
|------|-----------|------------|
| 2500 | ERROR_SUBZONE_INVALID_ID | - |
| 2501 | ERROR_SUBZONE_GPIO_CONFLICT | - |
| 2502 | ERROR_SUBZONE_PARENT_MISMATCH | - |
| 2503 | ERROR_SUBZONE_NOT_FOUND | - |
| 2504 | ERROR_SUBZONE_GPIO_INVALID | - |
| 2505 | ERROR_SUBZONE_SAFE_MODE_FAILED | safety_controller.cpp, docs |
| 2506 | ERROR_SUBZONE_CONFIG_SAVE_FAILED | main.cpp:111 (sendSubzoneAck) |

### 2.7 Lücken

1. **subzone/safe:** ESP subscribt nicht. Server kann Safe-Mode nicht per MQTT an ESP senden.
2. **subzone/status:** ESP hat TopicBuilder, aber kein Handler; Server hat keinen Handler (MQTT_TOPICS.md: "Noch nicht implementiert").

---

## 3. Block 2: Server (El Servador)

### 3.1 Zone-Endpoints

| Methode | Pfad | Handler |
|---------|------|---------|
| POST | `/api/v1/zone/devices/{esp_id}/assign` | zone.py |
| DELETE | `/api/v1/zone/devices/{esp_id}/zone` | zone.py |
| GET | `/api/v1/zone/devices/{esp_id}` | zone.py |
| GET | `/api/v1/zone/{zone_id}/devices` | zone.py |
| GET | `/api/v1/zone/unassigned` | zone.py |

### 3.2 Subzone-Endpoints

| Methode | Pfad | Handler |
|---------|------|---------|
| POST | `/api/v1/subzone/devices/{esp_id}/subzones/assign` | subzone.py:106 |
| GET | `/api/v1/subzone/devices/{esp_id}/subzones` | subzone.py |
| GET | `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` | subzone.py |
| DELETE | `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}` | subzone.py |
| POST | `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | subzone.py |
| DELETE | `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | subzone.py |
| PATCH | `/api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}/metadata` | subzone.py |

**Path-Pattern esp_id:** `^(ESP_[A-F0-9]{6,8}|MOCK_[A-Z0-9]+|ESP_MOCK_[A-Z0-9]+)$` — Mock-IDs werden akzeptiert.

### 3.3 SubzoneAssignRequest (Pydantic)

- `subzone_id` (required, 1-32 chars)
- `subzone_name` (optional)
- `parent_zone_id` (optional)
- `assigned_gpios` (required, 0-20 GPIOs, 0-39)
- `safe_mode_active` (default True)
- `custom_data` (optional)

### 3.4 MQTT-Flow

- **Assign:** SubzoneService.assign_subzone() → TopicBuilder.build_subzone_assign_topic() → Publisher → ESP
- **Mock:** Kein MQTT; DB-Upsert direkt
- **ACK:** subzone_ack_handler.py → SubzoneService.handle_subzone_ack() → DB-Update → WebSocket `subzone_assignment`

### 3.5 Zone-Context

- GET `/api/v1/zone/context/{zone_id}` → 404 wenn kein Eintrag
- ZoneContextEditor fängt 404 ab (Zeile 88-91): `contextExists.value = false`, kein Fehlerlog

### 3.6 Bruchstelle B1 (Subzone Frontend→Server)

**Mögliche Ursachen (aus Code-Analyse):**

1. **useSubzoneCRUD.confirmCreateSubzone:** Sendet `assigned_gpios: []` — Subzone wird ohne GPIOs erstellt. Server akzeptiert (min_length=0). ESP erhält leere Liste; Subzone ist leer.
2. **useSubzoneCRUD.saveSubzoneName / deleteSubzone:** `espWithSubzone = espStore.devices.find(d => d.subzone_id === subzoneId)` — ESP-Devices haben `subzone_id` nur als optionales Feld; Semantik ist unklar (ein ESP hat mehrere Subzonen). **Falscher Lookup:** Sollte ESP finden, der Subzone X besitzt — dazu müsste man alle ESPs durchsuchen und `subzonesApi.getSubzones(espId)` prüfen, oder die Hierarchy-API nutzen.
3. **SubzoneAssignmentSection.confirmCreateSubzone:** Sendet `assigned_gpios: [props.gpio]` — korrekt, weist Sensor/Aktor-GPIO zu.

**Fazit B1:** Die Kommunikation Frontend→Server funktioniert technisch (API-Pfade, Body-Schema). Die **Logik** in useSubzoneCRUD ist fehlerhaft: Create mit leeren GPIOs, Rename/Delete mit fragwürdigem espWithSubzone-Lookup.

---

## 4. Block 3: Frontend (El Frontend)

### 4.1 Ebene 1 — Zoneneinstellung (funktioniert)

- **Komponenten:** HardwareView, ZonePlate, useZoneDragDrop, zonesApi
- **API:** POST `/zone/devices/{id}/assign`, DELETE `.../zone`
- **WebSocket:** `zone_assignment` → zoneStore.handleZoneAssignment() → espStore-Update
- **Nicht kaputt machen:** ZonePlate, useZoneDragDrop, zonesApi, zone.store, esp.store (handleZoneAssignment)

### 4.2 Ebene 2 — Subzone

- **Komponenten:** SubzoneAssignmentSection (in SensorConfigPanel, ActuatorConfigPanel), useSubzoneCRUD, ZonePlate
- **API:** subzonesApi.assignSubzone(), getSubzones(), removeSubzone()
- **SubzoneAssignmentSection:** Lädt Subzonen, erstellt mit GPIO; korrekt.
- **useSubzoneCRUD:** Create mit `assigned_gpios: []`; Rename/Delete mit `espWithSubzone`-Lookup — fehlerhaft.

### 4.3 Monitor L2 — HierarchyTab

- **Datenquelle:** GET `/kaiser/god/hierarchy`
- **Response-Struktur:** `zones[]` mit `subzones[]` und `devices[]` pro Zone/Subzone
- **Kaiser-Service-Logik:** Pro Zone werden Subzonen aus `subzone_configs` geladen; pro Subzone wird der **ganze ESP** unter `devices` gelistet (nicht einzelne Sensoren/Aktoren)
- **HierarchyTab-Rendering:** Zeigt Zone → Subzone (GPIO-Badge) → Devices (ESP-Liste)
- **Bruchstelle B2:** Die Hierarchy zeigt **ESPs pro Subzone**, nicht **Sensoren/Aktoren pro Subzone**. Semantik: "Dieser ESP hat diese Subzone mit diesen GPIOs." Die Anzeige ist konsistent mit der API — aber wenn der User "Sensoren/Aktoren in Subzonen" erwartet, fehlt die Granularität (welcher Sensor auf GPIO 4 ist in Subzone A).

---

## 5. Block 4: Wissensdatenbank

### 5.1 Zone-Context

- **API:** GET/PUT/PATCH `/zone/context/{zone_id}`
- **DB:** `zone_contexts` (zone_id, variety, substrate, growth_phase, cycle_history, custom_data)
- **Abgrenzung:** Konfiguration (esp_devices.zone_id) vs. Wissen (zone_contexts) — getrennte Tabellen, keine Blockade

### 5.2 Subzone-Wissen

- **Ort:** `subzone_configs.custom_data` (JSONB)
- **API:** PATCH `/subzone/devices/{esp_id}/subzones/{subzone_id}/metadata`
- **UI:** SubzoneContextEditor.vue

### 5.3 Konfliktvermeidung

- Keine gemeinsame Lock-Logik; Prozess A (Konfiguration) und B (Wissen) laufen parallel.

---

## 6. Bruchstellen-Tabelle (Block 5)

| ID | Beschreibung | Schicht | Vermutete Ursache | Konkreter Ort |
|----|----------------|--------|--------------------|---------------|
| B1 | Subzone Frontend→Server "funktioniert noch nicht richtig" | Frontend | useSubzoneCRUD: Create mit leeren GPIOs; espWithSubzone-Lookup falsch (d.subzone_id) | useSubzoneCRUD.ts:41-52, 82-87, 110-112 |
| B2 | Monitor L2: Sensoren/Aktoren nicht pro Subzone | Backend/Frontend | Hierarchy zeigt ESPs pro Subzone, nicht Sensor/Aktor-Granularität | kaiser_service.py:164-178, HierarchyTab.vue |
| B3 | Zone-Context 404 | Backend | 404 statt 200+leer | zone_context.py:89-90; ZoneContextEditor fängt 404 ab |
| B4 | subzone/safe nicht genutzt | ESP | ESP subscribt nicht zu subzone/safe | main.cpp:825-828 (nur assign, remove) |
| B5 | useSubzoneCRUD espWithSubzone | Frontend | ESP hat mehrere Subzonen; subzone_id auf Device ist nicht eindeutig | useSubzoneCRUD.ts:82, 110 |

---

## 7. Datenfluss (Block 5)

### Zone
```
User (L1) → zonesApi.assignZone(esp_id, payload)
  → POST /zone/devices/{id}/assign
  → ZoneService → DB + MQTT zone/assign
  → ESP → zone/ack → zone_ack_handler
  → WS zone_assignment → zoneStore.handleZoneAssignment → espStore
```

### Subzone
```
User (L2) → subzonesApi.assignSubzone(esp_id, payload)
  → POST /subzone/devices/{id}/subzones/assign
  → SubzoneService → (Mock: DB-Upsert) / (Real: MQTT subzone/assign)
  → ESP → subzone/ack → subzone_ack_handler
  → DB-Update + WS subzone_assignment → zoneStore.handleSubzoneAssignment
```

**B1:** useSubzoneCRUD sendet bei Create `assigned_gpios: []`; espWithSubzone für Rename/Delete ist falsch.

### Monitor L2 (Hierarchy)
```
GET /kaiser/god/hierarchy
  → KaiserService.get_hierarchy()
  → zones_map mit subzones (assigned_gpios, devices=ESP-Liste)
  → HierarchyTab.vue → Baum Zone→Subzone→Device
```

**B2:** devices pro Subzone = ESPs, die diese Subzone haben; keine Sensor/Aktor-Auflösung.

---

## 8. Eingriffspunkte (Block 6)

### 8.1 ESP (El Trabajante)

- `src/utils/topic_builder.cpp` — buildSubzoneSafeTopic vorhanden
- `src/main.cpp` — Zeilen 814-828 (Subscribe), 1560-1710 (Handler)
- `src/services/config/config_manager.cpp` — NVS-Keys Zone/Subzone
- **Optional:** Subscribe zu subzone/safe hinzufügen

### 8.2 Server (El Servador)

- `src/api/v1/subzone.py` — Path-Pattern, Endpoints
- `src/services/subzone_service.py` — Assign, Mock-Behandlung
- `src/mqtt/handlers/subzone_ack_handler.py` — DB-Update, WS
- `src/api/v1/zone_context.py` — 404 (optional: 200+leer)
- `src/api/v1/kaiser.py` — get_hierarchy
- `src/services/kaiser_service.py` — get_hierarchy (Subzone→Devices-Struktur)

### 8.3 Frontend (El Frontend)

- **L1 (nicht kaputt machen):** HardwareView, ZonePlate, useZoneDragDrop, zonesApi, zone.store
- **L2 Subzone:** SubzoneAssignmentSection.vue, useSubzoneCRUD.ts, subzones.ts
- **Monitor L2:** HierarchyTab.vue, api.get('/kaiser/god/hierarchy')
- **Wissen:** ZoneContextEditor, SubzoneContextEditor, inventoryApi.getZoneContext

### 8.4 Wissensdatenbank

- zone_contexts, subzone_configs.custom_data — getrennt von Konfiguration

---

## 9. Priorisierte Fix-Liste (Block 7)

| Prio | Fix | Beschreibung |
|------|-----|--------------|
| 1 | **B1: useSubzoneCRUD** | confirmCreateSubzone: assigned_gpios aus gewählten Sensoren/Aktoren; espWithSubzone: ESP über subzonesApi.getSubzones prüfen oder Hierarchy nutzen |
| 2 | **B2: Monitor L2** | Optional: Hierarchy erweitern um Sensor/Aktor-Liste pro Subzone (aus sensor_configs/actuator_configs mit subzone_id) |
| 3 | **B3: Zone-Context 404** | Optional: Backend 200 + leeres Objekt bei fehlendem Kontext; Frontend behandelt 404 bereits |
| 4 | **B4: subzone/safe** | ESP Subscribe zu subzone/safe hinzufügen; Handler implementieren |
| 5 | **B5: espWithSubzone** | Teil von B1; Lookup korrigieren |

---

## 10. Verifikations-Checkliste

- [x] Referenz-Dateien gelesen (MQTT_TOPICS, REST_ENDPOINTS, WEBSOCKET_EVENTS, DATABASE_ARCHITECTURE)
- [x] ESP topic_builder, main.cpp, config_manager geprüft
- [x] Server subzone.py, subzone_service, subzone_ack_handler, kaiser_service geprüft
- [x] Frontend subzones.ts, useSubzoneCRUD, SubzoneAssignmentSection, HierarchyTab, zone.store geprüft
- [x] API-Pfade gegen REST_ENDPOINTS.md geprüft
- [x] MQTT-Topics gegen MQTT_TOPICS.md geprüft

---

## 11. AutoOps Health-Check

Der AutoOps Health-Check wurde ausgeführt; der Server war nicht erreichbar (localhost:8000). Bei laufendem Stack:

```bash
cd "El Servador/god_kaiser_server"
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='health', server_url='http://localhost:8000'))
print('Health:', 'OK' if result.get('all_passed') else 'ISSUES')
"
```

---

## 12. Referenz-Aufträge

| Auftrag | Inhalt |
|---------|--------|
| auftrag-subzonen-mock-geraete-analyse-integration.md | Mock Subzone: Backend Path, Frontend Block |
| auftrag-layout-monitor-seite-ueberschriften-reihenfolge.md | Monitor L2 Überschriften, Zählung |
| trockentest-bericht-layout-zonen-komponenten-2026-03-03.md | F002 Zone-Context 404, F003, F004 |
