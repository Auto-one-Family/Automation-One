# Deep Dive Analyse: Zone & Kaiser Hierarchie – Vollständige Systemprüfung
**Datum:** 2026-02-10
**Erstellt von:** Technical Manager
**Analysiert von:** verify-plan + esp32-development + db-inspector (VS Code Claude Code)
**Typ:** Codebase-Analyse mit direkter Beantwortung im Dokument
**Agents:** verify-plan + esp32-development + server-development + db-inspector (alle abgeschlossen, db-inspector Cross-Layer-Verifikation 2026-02-10)
**Fokus:** Geräte-Zonierung über alle Layer, Kaiser-Vorbereitung, Konsistenz

---

## Auftrag

Dieses Dokument ist gleichzeitig Analyseanleitung UND Ergebnis-Dokument. Die Agents füllen jede Section direkt aus – mit Code-Referenzen, IST-Zustand, Findings und konkreten Anpassungsvorschlägen. Robin kann das Dokument über mehrere Sessions iterativ vertiefen.

**WICHTIG:** Es geht NICHT um neue Funktionen. Die Architektur ist vorbereitet. Es geht um:
- Vollständige Konsistenzprüfung der bestehenden Zone/Kaiser-Implementierung
- Stellen finden wo die Vorbereitung inkonsistent oder unvollständig durchgesetzt ist
- Sicherstellen dass das System in JEDER Kombination robust funktioniert
- Kaiser-Integration so vorbereitet dass sie "fluffig" eingebaut werden kann

---

## 1. System-Hierarchie: Das Gesamtbild

### 1.1 Die 4 Ebenen (alle OPTIONAL, alle FLEXIBEL)

```
┌─────────────────────────────────────────────────────────────────┐
│  EBENE 1: God-Kaiser (El Servador)                              │
│  kaiser_id = "god" (Default, immer vorhanden)                   │
│  Fungiert als Kaiser UND als zentraler Server                   │
│  Single Source of Truth für alles                               │
│  Config: HierarchySettings.kaiser_id, HierarchySettings.god_id │
│  Code: src/core/config.py, src/core/constants.py                │
└──────────────────────────────┬──────────────────────────────────┘
                               │ MQTT: kaiser/{kaiser_id}/...
                               │ (aktuell: kaiser/god/...)
┌──────────────────────────────┴──────────────────────────────────┐
│  EBENE 2: Kaiser-Nodes (ZUKUNFT, OPTIONAL)                      │
│  kaiser_id = "kaiser_01", "kaiser_02", etc.                     │
│  Jeder Kaiser verwaltet eine oder mehrere Zonen                 │
│  Mehrere Kaiser können sich eine Zone TEILEN                    │
│  Kaiser OHNE Zone = gültiger Zustand (noch nicht zugewiesen)    │
│  Kaiser mit falscher Config = Error-State, muss gehandelt werden│
│  DB: KaiserRegistry.zone_ids (JSON Array), ESPOwnership         │
│  Code: src/db/models/kaiser.py, src/services/kaiser_service.py  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│  EBENE 3: ESP-Zonen                                             │
│  Jeder ESP hat zone_id + zone_name (optional)                   │
│  Mehrere ESPs können dieselbe zone_id teilen                    │
│  ESP OHNE Zone = gültiger Zustand (unassigned)                  │
│  Zone-Assignment via MQTT (Server→ESP) oder REST API            │
│  ESP32: system_types.h → KaiserZone { zone_id, zone_name,      │
│         master_zone_id, kaiser_id }                             │
│  Server: ESPDevice.zone_id, ESPDevice.zone_name                 │
│  Frontend: Zone Drag&Drop, ZoneAssignmentPanel                  │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│  EBENE 4: Subzones (Pin-Level)                                  │
│  Jeder Sensor/Aktuator hat subzone_id (optional)                │
│  SubZones gehören zu Sensoren/Aktoren, NICHT direkt zu ESPs     │
│  Mehrere Pins können dieselbe subzone_id teilen                 │
│  Pin OHNE Subzone = gültiger Zustand                            │
│  Subzone wird in MQTT-Payloads übertragen                       │
│  ESP32: SensorConfig.subzone_id, ActuatorConfig.subzone_id      │
│  Server: SensorConfig.subzone_id, ActuatorConfig.subzone_id     │
│  REST: /subzone CRUD + Sensor-Assignment                        │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Gültige Kombinationen (ALLE müssen funktionieren)

| # | Kaiser | ESP Zone | Pin Subzone | Status | Erwartung |
|---|--------|----------|-------------|--------|-----------|
| 1 | god (default) | keine | keine | Minimal-Setup | System funktioniert komplett |
| 2 | god | zugewiesen | keine | ESP hat Zone, Pins nicht | Funktioniert, Subzones optional |
| 3 | god | zugewiesen | zugewiesen | Voll konfiguriert | Alles sichtbar, filterbar |
| 4 | god | keine | zugewiesen | Pins haben Subzone, ESP nicht | Muss funktionieren (Pin-Level unabhängig) |
| 5 | kaiser_01 (Zukunft) | zugewiesen | zugewiesen | Volle Kaiser-Hierarchie | System muss vorbereitet sein |
| 6 | kaiser_01 | keine | keine | Kaiser ohne Zonen-Zuweisung | Gültiger Zustand |
| 7 | — (falsche Config) | — | — | Error-State | Graceful handling, kein Crash |
| 8 | god | mehrere ESPs, gleiche Zone | verschieden | Zone-Sharing | Filter zeigt alle ESPs der Zone |

---

## 2. ANALYSE: ESP32-Seite (El Trabajante)

**Agent: verify-plan (Codebase-Analyse)**

### 2.1 Zone-Datenmodelle auf ESP

**Analysiert:** `El Trabajante/src/models/system_types.h`

**KaiserZone (system_types.h:34-47):**
```cpp
struct KaiserZone {
  // Primary Zone Identification (Phase 7)
  String zone_id = "";              // Primary zone identifier (line 36)
  String master_zone_id = "";       // Parent zone for hierarchy (line 37)
  String zone_name = "";            // Human-readable zone name (line 38)
  bool zone_assigned = false;       // Zone configuration status (line 39)

  // Kaiser Communication
  String kaiser_id = "god";         // ID of the parent Kaiser (line 42) ← DEFAULT "god"
  String kaiser_name = "";          // Optional (line 43)
  String system_name = "";          // Optional (line 44)
  bool connected = false;           // MQTT connection status (line 45)
  bool id_generated = false;        // Kaiser ID generation flag (line 46)
};
```

**MasterZone (system_types.h:51-56):**
```cpp
struct MasterZone {
  String master_zone_id = "";       // (line 52)
  String master_zone_name = "";     // (line 53)
  bool assigned = false;            // (line 54)
  bool is_master_esp = false;       // (line 55)
};
```

**SubzoneConfig (system_types.h:61-70):**
```cpp
struct SubzoneConfig {
  String subzone_id = "";                     // Unique identifier (line 62)
  String subzone_name = "";                   // Human-readable name (line 63)
  String parent_zone_id = "";                 // Parent zone link (line 64)
  std::vector<uint8_t> assigned_gpios;        // GPIO-Pins (line 65)
  bool safe_mode_active = true;               // Safe-Mode default ON (line 66)
  uint32_t created_timestamp = 0;             // (line 67)
  uint8_t sensor_count = 0;                   // Auto-calculated (line 68)
  uint8_t actuator_count = 0;                 // Auto-calculated (line 69)
};
```

**SensorConfig.subzone_id (sensor_types.h:19):**
```cpp
String subzone_id = "";  // Subzone-Zuordnung
```

**ActuatorConfig.subzone_id (actuator_types.h:43):**
```cpp
String subzone_id = "";  // Subzone assignment (optional, sensor/actuator level)
```

**Fragen beantwortet:**
1. **Alle Zone-Felder optional?** JA - alle Strings default `""`, bools default `false`. Leer = gültig.
2. **Default wenn keine Zone?** Leerer String `""`. ESP prüft `zone_assigned` Flag (nicht den String-Wert).
3. **master_zone_id implementiert?** JA, vollständig. Wird in NVS persistiert, im Heartbeat gesendet, bei Zone-Assignment gesetzt.
4. **ESP bei leerem kaiser_id?** Fallback auf "god" in Topic-Konstruktion (main.cpp:786-788, 808-809). Kein Crash.
5. **zone_id in NVS persistiert?** JA - via `configManager.saveZoneConfig()` und `updateZoneAssignment()`. Überlebt Reboot.

### 2.2 Zone-Assignment Flow auf ESP

**Analysiert:** `El Trabajante/src/main.cpp` Zeilen 784-1322

1. **MQTT-Empfang:**
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` (main.cpp:785)
   - Fallback: `kaiser/god/esp/{esp_id}/zone/assign` wenn kaiser_id leer (main.cpp:787)
   - Subscription in setupMQTT() (main.cpp:795)

2. **Payload-Verarbeitung (main.cpp:1231-1323):**
   - Parst zone_id, master_zone_id, zone_name, kaiser_id aus JSON
   - Validiert: zone_id darf NICHT leer sein (main.cpp:1253) ← **BUG bei Zone-Removal!**
   - Fallback: kaiser_id leer → "god" (main.cpp:1258-1262)
   - Speichert via `configManager.updateZoneAssignment()` in NVS
   - Aktualisiert g_kaiser Globals (main.cpp:1272-1280)
   - Wenn kaiser_id geändert → `TopicBuilder::setKaiserId()` (main.cpp:1279)

3. **ACK (main.cpp:1283-1299):**
   - Topic: `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack`
   - Payload: `{esp_id, status:"zone_assigned", zone_id, master_zone_id, ts}`
   - Auch Error-ACK bei Fehler (main.cpp:1314-1318)

4. **Provisioning:** Zone wird NICHT im Captive Portal konfiguriert. Zone-Assignment ist ausschließlich über MQTT (server-gesteuert).

5. **Wokwi:** Wokwi-Build hat keine vorkonfigurierte zone_id. Zone bleibt leer bis Server zuweist.

**Vollständiger Code-Pfad:**
```
main.cpp:795     → Subscribe zone/assign
main.cpp:1231    → Topic-Match prüfen
main.cpp:1246    → JSON parsen
main.cpp:1253    → Validate zone_id nicht leer
main.cpp:1270    → configManager.updateZoneAssignment() → NVS
main.cpp:1272-80 → g_kaiser Globals aktualisieren
main.cpp:1279    → TopicBuilder::setKaiserId() (wenn geändert)
main.cpp:1283-99 → ACK publizieren
main.cpp:1305    → STATE_ZONE_CONFIGURED
main.cpp:1309    → Forced Heartbeat
```

### 2.3 Zone in MQTT-Topics und Payloads

**Analysiert:** `El Trabajante/src/utils/topic_builder.cpp`

1. **Topic-Struktur:** `kaiser/{kaiser_id}/esp/{esp_id}/...`
   - kaiser_id kommt aus globaler Variable, gesetzt bei Boot aus NVS (configManager.loadZoneConfig)
   - TopicBuilder speichert kaiser_id und esp_id statisch und nutzt sie für alle Topics

2. **Sensor-Payloads:** Enthält `subzone_id` aus SensorConfig (sensor_manager.cpp:1246, Feld "subzone_id"). Wird nur gesetzt wenn in SensorConfig konfiguriert (leerer String wird mitgesendet).

3. **Actuator-Status:** Enthält `zone_id` aus g_kaiser.zone_id und `subzone_id` aus ActuatorConfig (actuator_manager.cpp:778).

4. **Heartbeat (mqtt_client.cpp:621ff):** Enthält:
   - `zone_id` = g_kaiser.zone_id
   - `master_zone_id` = g_kaiser.master_zone_id
   - `zone_assigned` = g_kaiser.zone_assigned
   - KEIN kaiser_id im Payload (steckt im Topic)
   - KEIN subzone_id (Heartbeat ist ESP-Level, nicht Pin-Level)

5. **Was bei leerem kaiser_id?** Fallback auf "god" in Topic-Konstruktion (main.cpp:786-788). Topic bleibt gültig.

6. **Was bei leerer zone_id?** Wird als leerer String `""` in Payloads gesendet. Server interpretiert als "unassigned". Kein Crash.

### 2.4 ConfigManager Zone-Handling

**Analysiert:** `El Trabajante/src/services/config/config_manager.h` + `.cpp`

1. **loadAllConfigs():** Lädt Zone-Config aus NVS via `loadZoneConfig(KaiserZone&, MasterZone&)`. Bei leerem NVS: Defaults greifen (zone_id="", kaiser_id="god").

2. **saveZoneConfig():** Existiert (config_manager.h:29). Speichert KaiserZone + MasterZone in NVS.

3. **updateZoneAssignment():** Phase 7 Methode (config_manager.h:32-33). Nimmt zone_id, master_zone_id, zone_name, kaiser_id. Speichert in NVS und aktualisiert Cached Configs.

4. **resetWiFiConfig():** Löscht WiFi-Config aus NVS. Zone-Config wird NICHT gelöscht (separate NVS-Keys).

5. **Wokwi-Modus:** Keine spezielle Zone-Handling. Zone bleibt leer (Defaults). Zone wird erst bei Runtime via MQTT zugewiesen.

6. **Subzone-NVS:** `saveSubzoneConfig()` und `validateSubzoneConfig()` existieren (config_manager.h:35-36). Subzones werden in NVS persistiert.

---

## 3. ANALYSE: Server-Seite (El Servador)

**Agent: verify-plan (Codebase-Analyse)**

### 3.1 DB-Modelle für Zonen

**ESPDevice (esp.py:22-224):**

| Feld | Typ | Nullable | Default | Index | Constraint |
|------|-----|----------|---------|-------|------------|
| `zone_id` | String(50) | YES | None | YES | Kein FK |
| `zone_name` | String(100) | YES | None | NO | - |
| `master_zone_id` | String(50) | YES | None | YES | Kein FK |
| `is_zone_master` | Boolean | NO | False | NO | - |
| `kaiser_id` | String(50) | YES | None | YES | Kein FK |

**Kritisch:** KEIN Foreign Key auf Zone-Tabelle (es gibt keine Zone-Tabelle!). Zonen sind nur String-Felder in ESPDevice. Zone existiert implizit wenn mindestens ein ESP diese zone_id hat.

**KaiserRegistry (kaiser.py:16-112):**

| Feld | Typ | Nullable | Default | Index |
|------|-----|----------|---------|-------|
| `kaiser_id` | String(50) | NO | - | YES (unique) |
| `ip_address` | String(45) | YES | None | NO |
| `mac_address` | String(17) | YES | None | YES (unique) |
| `zone_ids` | JSON (Array) | NO | [] | NO |
| `status` | String(20) | NO | "offline" | YES |
| `last_seen` | DateTime | YES | None | YES |
| `capabilities` | JSON | NO | {} | NO |
| `kaiser_metadata` | JSON | NO | {} | NO |

Tabelle existiert, Modell ist vollständig. **Aber:** Keine Service-Logik, keine API-Endpoints, keine Handler nutzen diese Tabelle. Sie ist LEER im laufenden System.

**ESPOwnership (kaiser.py:125-198):**

| Feld | Typ | Nullable | FK |
|------|-----|----------|-----|
| `kaiser_id` | UUID | NO | `kaiser_registry.id` (CASCADE) |
| `esp_id` | UUID | NO | `esp_devices.id` (CASCADE) |
| `assigned_at` | DateTime | NO | - |
| `priority` | Integer | NO | 100 |
| `ownership_metadata` | JSON | NO | {} |

UniqueConstraint auf (kaiser_id, esp_id). Vorbereitung für Failover. **Aber:** Nicht genutzt.

**⚠️ KORREKTUR (db-inspector, 2026-02-10):** Die DB-Modelle `SensorConfig` und `ActuatorConfig` haben **KEIN** `subzone_id` Feld. Die Subzone-Zuordnung wird über die **separate `subzone_configs` Tabelle** verwaltet (`db/models/subzone.py`), die FK auf `esp_devices.device_id` hat und `subzone_id`, `parent_zone_id`, `assigned_gpios` (JSON) enthält. Section 3.7 referenziert diese Tabelle korrekt. Die bisherige Aussage "Es gibt KEINE separate Subzone-DB-Tabelle" war **FALSCH**.

### 3.2 Zone-API-Endpoints

**Zone-Router (zone.py):**

| Endpoint | Method | Was tut er? | DB-Operationen | MQTT-Messages |
|----------|--------|-------------|----------------|---------------|
| `POST /zone/devices/{esp_id}/assign` | POST | Zone zuweisen | ESPDevice.zone_id/zone_name/master_zone_id/kaiser_id UPDATE | `kaiser/{id}/esp/{esp_id}/zone/assign` QoS 1 |
| `DELETE /zone/devices/{esp_id}/zone` | DELETE | Zone entfernen | ESPDevice.zone_id/zone_name/master_zone_id → NULL | `kaiser/{id}/esp/{esp_id}/zone/assign` mit leeren Feldern |
| `GET /zone/devices/{esp_id}` | GET | Zone-Info | SELECT ESPDevice WHERE device_id | Keine |
| `GET /zone/{zone_id}/devices` | GET | ESPs in Zone | SELECT ESPDevice WHERE zone_id | Keine |
| `GET /zone/unassigned` | GET | ESPs ohne Zone | SELECT ESPDevice WHERE zone_id IS NULL | Keine |

**Subzone-Router (subzone.py):**

| Endpoint | Method | Was tut er? | DB-Operationen | Validierungen |
|----------|--------|-------------|----------------|---------------|
| `GET /subzone` | GET | Alle Subzones | Aggregation aus Sensor/Actuator subzone_id | - |
| `GET /subzone/{subzone_id}` | GET | Subzone Details | Filter Sensors/Actuators by subzone_id | - |
| `POST /subzone` | POST | Subzone erstellen | Sensor/Actuator subzone_id UPDATE | subzone_id Format |
| `DELETE /subzone/{subzone_id}` | DELETE | Subzone löschen | Sensor/Actuator subzone_id → NULL + MQTT Remove | - |
| `POST /subzone/{subzone_id}/sensors/{sensor_id}` | POST | Sensor zuweisen | Sensor.subzone_id UPDATE | Sensor existiert |
| `DELETE /subzone/{subzone_id}/sensors/{sensor_id}` | DELETE | Sensor entfernen | Sensor.subzone_id → NULL | - |

**Kritische Frage:** Es gibt keinen `GET /zone` (alle Zonen). Zonen werden aus ESP-Daten extrahiert. Wenn eine Zone existiert aber kein ESP zugewiesen ist → Zone ist "verschwunden". Das ist **by-design** (Zonen haben kein eigenes Lifecycle), aber es kann verwirrend sein.

### 3.3 Kaiser-Service Analyse

**Analysiert:** `El Servador/god_kaiser_server/src/services/kaiser_service.py`

**ERGEBNIS: KOMPLETT LEER. Nur 1 Zeile:**
```python
"""Kaiser Node Management Service - Phase 3 - Priority: HIGH - Status: PLANNED"""
```

- Kein `assign_esp_to_kaiser()`
- Keine Validierung von kaiser_id
- Keine Logik für Kaiser-Registrierung, -Heartbeat, -Ownership
- Die KaiserRegistry und ESPOwnership DB-Modelle existieren, aber NICHTS nutzt sie

**Kaiser API Router (kaiser.py):** Ebenfalls LEER:
```python
router = APIRouter(prefix="/kaiser", tags=["kaiser"])
# Keine Endpoints implementiert
```

**Was passiert wenn ESP mit kaiser_id != "god" Heartbeat sendet?**
- Server subscribed NUR auf `kaiser/god/esp/+/system/heartbeat`
- Ein ESP mit kaiser_id="kaiser_01" sendet auf `kaiser/kaiser_01/esp/{id}/system/heartbeat`
- Server empfängt das NICHT → ESP wird als offline betrachtet → Kein Discovery

### 3.4 Zone-Assignment MQTT-Flow (Server→ESP)

**Analysiert:** zone_service.py + zone.py + main.cpp

**Vollständiger Flow:**

```
Frontend: POST /api/v1/zone/devices/{esp_id}/assign
  Body: { zone_id, master_zone_id?, zone_name? }
         │
         ▼
Server (zone.py:70-119):
  1. ESPRepository.get_by_device_id(esp_id) → Validate exists
  2. ZoneService.assign_zone():
     a. device.zone_id = zone_id          → DB Update (sofort)
     b. device.master_zone_id = ...
     c. device.zone_name = ...
     d. device.kaiser_id = self.kaiser_id  → Setzt "god"
     e. device.device_metadata["pending_zone_assignment"] = {...}
     f. MQTT Publish: kaiser/god/esp/{esp_id}/zone/assign
        Payload: { zone_id, master_zone_id, zone_name, kaiser_id, timestamp }
  3. db.commit()
         │
         ▼
ESP (main.cpp:1231-1323):
  1. Topic-Match → zone_assign_topic
  2. JSON Parse → zone_id, master_zone_id, zone_name, kaiser_id
  3. Validate zone_id nicht leer
  4. configManager.updateZoneAssignment() → NVS Save
  5. g_kaiser.* Globals aktualisieren
  6. TopicBuilder::setKaiserId() wenn geändert
  7. ACK publizieren: kaiser/{kaiser_id}/esp/{esp_id}/zone/ack
     Payload: { esp_id, status:"zone_assigned", zone_id, master_zone_id, ts }
  8. STATE_ZONE_CONFIGURED
  9. Forced Heartbeat
         │
         ▼
Server (zone_service.py:255-309):
  handle_zone_ack():
  1. device = ESPRepository.get_by_device_id(esp_id)
  2. if status == "zone_assigned":
     a. device.zone_id = zone_id     → DB Bestätigung
     b. device.master_zone_id = ...
     c. Clear pending_zone_assignment aus metadata
         │
         ▼
Frontend (WebSocket: "zone_assignment" Event):
  esp.ts handleZoneAssignment()
```

**Timeout?** Kein expliziter Timeout implementiert. Die "pending_zone_assignment" in metadata bleibt bestehen bis ACK kommt oder manuell gelöscht wird.

**Reject?** ESP sendet Error-ACK (`status: "error"`) bei NVS-Save-Fehler oder JSON-Parse-Fehler. Server loggt aber löscht pending NICHT.

### 3.5 Heartbeat und Zone-Informationen

**Analysiert:** heartbeat_handler.py

1. **Heartbeat enthält Zone-Info:** JA
   - `zone_id` (payload.get("zone_id", ""))
   - `master_zone_id` (payload.get("master_zone_id", ""))
   - `zone_assigned` (payload.get("zone_assigned", False))

2. **Wo werden Zone-Infos gespeichert?**
   - **BEI NEUEM DEVICE (Discovery, heartbeat_handler.py:348-369):**
     Zone-Info geht in `device_metadata` JSON, NICHT in ESPDevice.zone_id Spalte!
   - **BEI BESTEHENDEM DEVICE (heartbeat_handler.py:608-616):**
     Zone-Info geht in `device_metadata` JSON, NICHT in ESPDevice.zone_id Spalte!

3. **⚠️ INKONSISTENZ:** Heartbeat aktualisiert `device_metadata["zone_id"]` aber NICHT `ESPDevice.zone_id`.
   Die ESPDevice.zone_id Spalte wird NUR über die Zone-API aktualisiert.
   Das bedeutet: Wenn ein ESP eine Zone hat (aus NVS/Boot) die NICHT über die Zone-API zugewiesen wurde, sieht der Server diese Zone NUR in metadata, nicht in der zone_id Spalte.

4. **Widerspruch ESP vs DB:** ESP sendet `zone_id="X"` im Heartbeat, DB hat `zone_id=None`.
   Server ignoriert den Heartbeat-Wert für die Spalte. Kein Sync. Kein Warning.

5. **Pending Device mit Zone:** Wenn ein neuer ESP zone_id im Heartbeat mitsendet, wird es in metadata gespeichert aber ESPDevice.zone_id bleibt NULL bis Zone-API aufgerufen wird.

**Exakter Code-Pfad Heartbeat Zone-Verarbeitung (heartbeat_handler.py):**
```
heartbeat_handler.py:61    → handle_heartbeat(topic, payload)
heartbeat_handler.py:90    → TopicBuilder.parse_heartbeat_topic(topic) → extract esp_id
heartbeat_handler.py:103   → _validate_payload(payload) → ts, uptime, heap_free, wifi_rssi required
heartbeat_handler.py:117   → esp_repo.get_by_device_id(esp_id_str)
                            ↓ (Wenn NEUES Device)
heartbeat_handler.py:123   → _discover_new_device() → _auto_register_esp()
heartbeat_handler.py:353   →   ESPDevice(status="pending_approval", device_metadata={
heartbeat_handler.py:367   →     "zone_id": payload.get("zone_id", ""),      ← NUR in metadata!
heartbeat_handler.py:368   →     "master_zone_id": payload.get("master_zone_id", ""),
heartbeat_handler.py:369   →     "zone_assigned": payload.get("zone_assigned", False),
                            →   })  ← ESPDevice.zone_id = None (nicht gesetzt!)
                            →   ← ESPDevice.kaiser_id = None (nicht gesetzt!)
heartbeat_handler.py:136   → _send_heartbeat_ack(status="pending_approval")
                            ↓ (Wenn BESTEHENDES Device online/approved)
heartbeat_handler.py:209   → esp_repo.update_status(esp_id_str, "online", last_seen)
heartbeat_handler.py:212   → _update_esp_metadata(esp_device, payload, session)
heartbeat_handler.py:611   →   current_metadata["zone_id"] = payload["zone_id"]      ← NUR metadata!
heartbeat_handler.py:613   →   current_metadata["master_zone_id"] = payload["master_zone_id"]
heartbeat_handler.py:615   →   current_metadata["zone_assigned"] = payload["zone_assigned"]
                            →   ← ESPDevice.zone_id Spalte wird NICHT aktualisiert
heartbeat_handler.py:275   → ws_manager.broadcast("esp_health", {...})  ← zone_id NICHT im Broadcast
heartbeat_handler.py:303   → _send_heartbeat_ack(status="online")
```

**⚠️ Kritisches Detail:** Weder Discovery noch laufender Heartbeat setzt `ESPDevice.kaiser_id` oder `ESPDevice.zone_id` (die DB-Spalten). Diese werden AUSSCHLIESSLICH über die Zone-API (`ZoneService.assign_zone()`) gesetzt. Das `esp_health` WebSocket-Event enthält auch KEINE zone_id – das Frontend bekommt Zone-Changes nur über das `zone_assignment` Event nach einem Zone-ACK.

### 3.6 MQTT-Topic-Subscription und Kaiser-Wildcard

**Analysiert:** main.py Handler-Registrierung + constants.py + subscriber.py

**Subscription-Patterns (main.py:203-308):**
```python
kaiser_id = constants.get_kaiser_id()  # → "god" (aus HierarchySettings oder Default)

# Alle Patterns nutzen f"kaiser/{kaiser_id}/esp/+/..."
# Beispiel:
_subscriber_instance.register_handler(
    f"kaiser/{kaiser_id}/esp/+/sensor/+/data",    # → kaiser/god/esp/+/sensor/+/data
    sensor_handler.handle_sensor_data
)
_subscriber_instance.register_handler(
    f"kaiser/{kaiser_id}/esp/+/system/heartbeat",  # → kaiser/god/esp/+/system/heartbeat
    heartbeat_handler.handle_heartbeat
)
# ... alle 13+ Subscriptions
```

**Ergebnis:**
1. Server subscribed auf `kaiser/god/esp/+/...` (HARDCODED via get_kaiser_id() → "god")
2. **NICHT** auf `kaiser/+/esp/+/...` (Wildcard) → ESPs mit kaiser_id != "god" werden NICHT gehört
3. Topic-Parser (`topics.py`) akzeptieren ANY kaiser_id via Regex `([a-zA-Z0-9_]+)` → Parser-Seite ist vorbereitet
4. Subscription-Seite ist NICHT vorbereitet → Muss geändert werden für Kaiser-Nodes

**get_kaiser_id() (constants.py:76-82):**
```python
def get_kaiser_id() -> str:
    try:
        from .config import get_settings
        return get_settings().hierarchy.kaiser_id  # Default: "god"
    except Exception:
        return DEFAULT_KAISER_ID  # "god"
```

**⚠️ ZoneService Kaiser-ID Bug (zone_service.py:75):**
```python
self.kaiser_id = getattr(constants, "KAISER_ID", "god")
```
`KAISER_ID` existiert NICHT in constants.py (es heißt `DEFAULT_KAISER_ID`). `getattr()` gibt immer den Fallback "god" zurück. Funktioniert zufällig, nutzt aber NICHT die konfigurierte HierarchySettings. Sollte `constants.get_kaiser_id()` verwenden.

**⚠️ Kontrast: SubzoneService macht es RICHTIG (subzone_service.py:80):**
```python
self.kaiser_id = constants.get_kaiser_id()
```
SubzoneService nutzt die korrekte Helper-Funktion. ZoneService (älter, Phase 7) nutzt den falschen Weg. SubzoneService (neuer, Phase 9) nutzt den korrekten Weg.

### 3.7 Subzone-Service: Exakter Flow (Server-Seite)

**Agent: esp32-development (Server-seitige Ergänzung)**

**Analysiert:** `subzone_service.py`, `subzone.py` (Router), `subzone_ack_handler.py`

**Subzone-Assignment Vollständiger Flow:**

```
Frontend: POST /api/v1/subzone/devices/{esp_id}/subzones/assign
  Body: { subzone_id, assigned_gpios: [4, 5], subzone_name?, parent_zone_id?, safe_mode_active? }
         │
         ▼
Server (subzone.py:89-136):
  1. ESP-ID Format-Validierung (Path: regex ^ESP_[A-F0-9]{6,8}$)
  2. SubzoneService(esp_repo, session, publisher)
         │
         ▼
SubzoneService.assign_subzone() (subzone_service.py:86-196):
  1. esp_repo.get_by_device_id(device_id) → Validate ESP existiert
  2. Prüfe device.zone_id existiert → ValueError wenn None
     ← UNTERSCHIED zu ZoneService: Subzone erfordert Zone!
  3. parent_zone_id = parent_zone_id or device.zone_id
  4. Validate parent_zone_id == device.zone_id (muss matchen)
  5. topic = TopicBuilder.build_subzone_assign_topic(device_id)
     → kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign
     ← Nutzt constants.get_kaiser_id() (KORREKT, im Gegensatz zu ZoneService)
  6. MQTT Publish (QoS 1): Payload = {
       subzone_id, subzone_name, parent_zone_id,
       assigned_gpios: [4, 5], safe_mode_active: true,
       sensor_count: 0, actuator_count: 0, timestamp
     }
  7. Wenn MQTT erfolgreich:
     _upsert_subzone_config() → SubzoneConfig in DB (subzone_configs Tabelle)
     ← UNTERSCHIED zu ZoneService: Zone hat KEINE eigene Tabelle!
  8. session.commit() (im Router, subzone.py:120)
         │
         ▼
ESP (main.cpp:1326-1433):
  1. Topic-Match: TopicBuilder::buildSubzoneAssignTopic() (per TopicBuilder!)
  2. JSON Parse → subzone_id, subzone_name, parent_zone_id, assigned_gpios, safe_mode_active
  3. Validierung:
     a. subzone_id nicht leer (main.cpp:1344)
     b. parent_zone_id == g_kaiser.zone_id wenn gesetzt (main.cpp:1351)
     c. g_kaiser.zone_assigned == true (main.cpp:1358) ← SUBZONE ERFORDERT ZONE!
  4. configManager.validateSubzoneConfig() (main.cpp:1379)
  5. gpioManager.assignPinToSubzone() für jeden GPIO (main.cpp:1387-1399)
     → Rollback bei Fehler (alle bereits zugewiesenen werden zurückgesetzt)
  6. gpioManager.enableSafeModeForSubzone() wenn safe_mode_active (main.cpp:1407-1411)
  7. configManager.saveSubzoneConfig() → NVS (main.cpp:1414)
  8. sendSubzoneAck(subzone_id, "subzone_assigned", "")  ← ACK auf subzone/ack
         │
         ▼
Server (subzone_ack_handler.py:53-107):
  1. TopicBuilder.parse_subzone_ack_topic(topic) → extract esp_id
  2. SubzoneAckPayload.model_validate(payload) → Pydantic-Validierung
  3. SubzoneService.handle_subzone_ack():
     status == "subzone_assigned" → _confirm_subzone_assignment(device_id, subzone_id)
       → SubzoneConfig.last_ack_at = now (subzone_service.py:574)
     status == "subzone_removed" → _delete_subzone_config()
     status == "error" → log, keep record
  4. session.commit()
  5. WebSocket broadcast: "subzone_assignment" Event
         │
         ▼
Frontend (WebSocket: "subzone_assignment" Event):
  Aktualisiert Subzone-UI
```

**Subzone-Removal Vollständiger Flow:**

```
Frontend: DELETE /api/v1/subzone/devices/{esp_id}/subzones/{subzone_id}
         │
         ▼
SubzoneService.remove_subzone() (subzone_service.py:198-245):
  1. esp_repo.get_by_device_id(device_id) → Validate
  2. topic = TopicBuilder.build_subzone_remove_topic(device_id)
  3. MQTT Publish (QoS 1): { subzone_id, reason: "manual", timestamp }
  ← DB-Record wird NICHT gelöscht (wartet auf ACK)
         │
         ▼
ESP (main.cpp:1436-1472):
  1. Topic-Match: TopicBuilder::buildSubzoneRemoveTopic()
  2. JSON Parse → subzone_id
  3. configManager.loadSubzoneConfig(subzone_id, config) → GPIOs laden
  4. gpioManager.removePinFromSubzone(gpio) für jeden GPIO
  5. configManager.removeSubzoneConfig(subzone_id) → NVS
  6. LOG_INFO("Subzone removed")
  ← ⚠️ KEIN ACK! (F10) Server bekommt keine Bestätigung
         │
         ▼ (SOLLTE passieren, aber fehlt)
Server wartet auf subzone/ack mit status="subzone_removed"
  → SubzoneService.handle_subzone_ack() → _delete_subzone_config()
  → ABER: ACK kommt NIE → SubzoneConfig bleibt in DB
```

**⚠️ F14 (NEU): Subzone-Removal DB-Cleanup Deadlock**
Server-Seite wartet auf ACK (subzone_ack_handler:14, status "subzone_removed") um SubzoneConfig aus DB zu löschen. ESP sendet aber kein ACK (F10). Ergebnis: SubzoneConfig-Records in DB akkumulieren sich nach Removals.

### 3.8 MQTT Handler-Registrierung: Exakte Liste (main.py:204-310)

**Agent: esp32-development (Server-seitige Ergänzung)**

**Alle 15 registrierten Handler (main.py):**

| # | Zeile | Subscription Pattern | Handler | Typ |
|---|-------|---------------------|---------|-----|
| 1 | 204 | `kaiser/{id}/esp/+/sensor/+/data` | `sensor_handler.handle_sensor_data` | ESP→Server |
| 2 | 208 | `kaiser/{id}/esp/+/actuator/+/status` | `actuator_handler.handle_actuator_status` | ESP→Server |
| 3 | 213 | `kaiser/{id}/esp/+/actuator/+/response` | `actuator_response_handler.handle_actuator_response` | ESP→Server |
| 4 | 218 | `kaiser/{id}/esp/+/actuator/+/alert` | `actuator_alert_handler.handle_actuator_alert` | ESP→Server |
| 5 | 222 | `kaiser/{id}/esp/+/system/heartbeat` | `heartbeat_handler.handle_heartbeat` | ESP→Server |
| 6 | 226 | `kaiser/{id}/discovery/esp32_nodes` | `discovery_handler.handle_discovery` | ESP→Server (DEPRECATED) |
| 7 | 230 | `kaiser/{id}/esp/+/config_response` | `config_handler.handle_config_ack` | ESP→Server |
| 8 | 235 | `kaiser/{id}/esp/+/zone/ack` | `zone_ack_handler.handle_zone_ack` | ESP→Server |
| 9 | 240 | `kaiser/{id}/esp/+/subzone/ack` | `subzone_ack_handler.handle_subzone_ack` | ESP→Server |
| 10 | 249 | `kaiser/{id}/esp/+/system/will` | `lwt_handler.handle_lwt` | Broker→Server (LWT) |
| 11 | 257 | `kaiser/{id}/esp/+/system/error` | `error_handler.handle_error_event` | ESP→Server |
| 12 | 298 | `kaiser/{id}/esp/+/actuator/+/command` | `mock_actuator_command_handler` | Server→Mock-ESP |
| 13 | 303 | `kaiser/{id}/esp/+/actuator/emergency` | `mock_actuator_command_handler` | Server→Mock-ESP |
| 14 | 307 | `kaiser/broadcast/emergency` | `mock_actuator_command_handler` | Broadcast |
| 15 | — | (sensor batch, pi_enhanced, etc. via inline handlers) | diverse | — |

**kaiser_id-Quelle (main.py:200):**
```python
kaiser_id = settings.hierarchy.kaiser_id  # Aus HierarchySettings, Default: "god"
```
Alle 14 Subscriptions nutzen `f"kaiser/{kaiser_id}/..."` → alle HARDCODED auf den Wert von `settings.hierarchy.kaiser_id` (normalerweise "god").

**⚠️ Bestätigung F5:** Wenn ein ESP Topics auf `kaiser/kaiser_01/...` sendet, empfängt KEIN Handler diese Messages. Subscription ist `kaiser/god/...`.

### 3.9 Zone-Ack Handler: Exakter Flow (Server-Seite)

**Analysiert:** `zone_ack_handler.py`

**Vollständiger Code-Pfad:**
```
zone_ack_handler.py:59    → handle_zone_ack(topic, payload)
zone_ack_handler.py:84    → TopicBuilder.parse_zone_ack_topic(topic) → {kaiser_id, esp_id, type}
zone_ack_handler.py:97    → _validate_payload(payload)
                            → Required: status ∈ {"zone_assigned", "error"}, ts (int|float)
zone_ack_handler.py:116   → resilient_session()
zone_ack_handler.py:120   → esp_repo.get_by_device_id(esp_id_str)
                            → Wenn nicht gefunden: return False (Warning log)
                            ↓ (status == "zone_assigned")
zone_ack_handler.py:131   → device.zone_id = zone_id if zone_id else None
zone_ack_handler.py:132   → device.master_zone_id = master_zone_id if master_zone_id else None
                            → ⚠️ zone_name wird NICHT aktualisiert (nur zone_id + master_zone_id)
zone_ack_handler.py:135   → del device.device_metadata["pending_zone_assignment"]
zone_ack_handler.py:154   → session.commit()
zone_ack_handler.py:157   → _broadcast_zone_update()
zone_ack_handler.py:265   →   ws_manager.broadcast("zone_assignment", {
                            →     esp_id, status, zone_id, master_zone_id, timestamp
                            →   })
```

**⚠️ Detail: zone_ack_handler vs ZoneService.handle_zone_ack()**
Es gibt ZWEI Implementierungen:
1. `zone_ack_handler.py` (MQTT Handler, registriert in main.py:235) → WIRD BENUTZT
2. `zone_service.py:255-309` (Service-Methode) → wird NICHT direkt von MQTT aufgerufen

Die MQTT-registrierte Version (`zone_ack_handler.py`) macht die eigentliche Arbeit. Die Service-Version existiert als Alternative (z.B. für Tests), wird aber im MQTT-Flow nicht verwendet. Beide haben identische Logik.

### 3.10 Discovery und Zone: Exakter Flow

**Analysiert:** `heartbeat_handler.py`, `discovery_handler.py`

**Heartbeat-Discovery (primär, heartbeat_handler.py:321-390):**
```
ESP Boot → Erster Heartbeat auf kaiser/god/esp/{esp_id}/system/heartbeat
         │
Server (heartbeat_handler.py:119):
  esp_device = None → Neues Device!
         │
heartbeat_handler.py:123 → _discover_new_device()
heartbeat_handler.py:415 →   _discovery_rate_limiter.can_discover(esp_id) → Rate-Limit Check
heartbeat_handler.py:423 →   _auto_register_esp(session, esp_repo, esp_id, payload)
heartbeat_handler.py:353 →     new_esp = ESPDevice(
                            →       device_id = esp_id
                            →       hardware_type = "ESP32_WROOM"    ← HARDCODED Default
                            →       status = "pending_approval"
                            →       device_metadata = {
                            →         "zone_id": payload.zone_id,     ← In metadata
                            →         "master_zone_id": payload.master_zone_id,
                            →         "zone_assigned": payload.zone_assigned,
                            →       }
                            →       kaiser_id = ??? → NICHT GESETZT → None!
                            →       zone_id = ??? → NICHT GESETZT → None!
                            →     )
heartbeat_handler.py:136 → _send_heartbeat_ack(status="pending_approval")
```

**⚠️ F16 (NEU): Discovery setzt weder kaiser_id noch zone_id auf DB-Spalte**
- `ESPDevice.kaiser_id` → None (obwohl ESP `kaiser_id="god"` im Topic hat)
- `ESPDevice.zone_id` → None (obwohl ESP evtl. `zone_id` im Payload hat)
- Zone-Info geht NUR in `device_metadata` JSON (nicht queryable als DB-Spalte)
- Erst `ZoneService.assign_zone()` setzt die DB-Spalten

**Legacy-Discovery (DEPRECATED, discovery_handler.py:44-150):**
- Topic: `kaiser/god/discovery/esp32_nodes`
- Erstellt ESPDevice mit status="pending_approval"
- kaiser_id und zone_id werden ebenfalls NICHT gesetzt (gleiche Lücke)
- IP, MAC, firmware_version werden gesetzt (Heartbeat-Discovery setzt diese NICHT)

### 3.11 Sensor-Data-Pipeline und Zone-Kontext

**Analysiert:** `sensor_handler.py`

Der sensor_handler verarbeitet `kaiser/{id}/esp/{esp_id}/sensor/{gpio}/data`:
1. Parst Topic → `esp_id`, `gpio`
2. Lookup Sensor in DB (via esp_id + gpio)
3. Speichert Sensor-Reading mit `raw_value`, `processed_value`, etc.
4. **Zone-Kontext:** Der Sensor-Handler selbst hat KEINEN Zone-Kontext. Er kennt nur `esp_id` und `gpio`.

Die Zone-Zuordnung wird IMPLIZIT über die ESPDevice-Zugehörigkeit hergestellt:
- Sensor → SensorConfig → esp_device_id → ESPDevice → zone_id
- Es gibt keine direkte `zone_id` im Sensor-Data-Topic

**Subzone im Sensor-Payload:**
Das ESP32 sendet `subzone_id` im Sensor-Data-Payload (sensor_manager.cpp). Der Server speichert diesen Wert wenn die SensorConfig ein `subzone_id` Feld hat. Die Zuordnung ist:
- Sensor → SensorConfig.subzone_id (DB-Spalte)
- Actuator → ActuatorConfig.subzone_id (DB-Spalte)

---

## 4. ANALYSE: Frontend-Seite (El Frontend)

**Agent: verify-plan (Codebase-Analyse)**

### 4.1 Zone-Types und Stores

1. **Types (El Frontend/src/types/index.ts):**
   - `ESPDevice` Interface (Zeile ~284): `zone_id: string | null`, `zone_name: string | null`, `master_zone_id: string | null`, `subzone_id: string | null`
   - `MockESPCreate` (Zeile ~304): `zone_id?: string`, `zone_name?: string`, `master_zone_id?: string`, `subzone_id?: string`
   - `ZoneAssignRequest` (Zeile ~845): `zone_id: string` (required!), `master_zone_id?: string`, `zone_name?: string`
   - `ZoneInfo` (Zeile ~879): `zone_id: string | null`, `master_zone_id: string | null`, `zone_name: string | null`, `is_zone_master: boolean`, `kaiser_id: string | null`
   - `SubzoneInfo` (Zeile ~906): `subzone_id: string`, `subzone_name: string | null`, `parent_zone_id: string`, `assigned_gpios: number[]`, `safe_mode_active: boolean`
   - Vollständige Subzone CRUD Types: `SubzoneAssignRequest`, `SubzoneAssignResponse`, `SubzoneRemoveResponse`, `SubzoneListResponse`, `SubzoneUpdate`, `SubzoneSafeResponse`

2. **ESP-Store:** ESP-Geräte werden im Pinia-Store gehalten. Zone-Filterung über `zone_id` Feld. `handleZoneAssignment()` Handler bei WebSocket Event `zone_assignment` (esp.ts:1782).

3. **Zone-Drag&Drop:** `useZoneDragDrop` Composable existiert für Zone-Zuordnung per Drag&Drop im Dashboard.

4. **Filter:** Frontend kann nach zone_id filtern (ZoneGroup Komponente). Subzone-Filterung über subzone_id in Sensor/Actuator-Daten.

5. **"Unassigned" Darstellung:** ESPs ohne zone_id werden in einer separaten "Unassigned" Gruppe angezeigt.

### 4.2 Zone-Assignment UI

1. **ZoneAssignmentPanel (590 Zeilen):** State-Machine mit 6 States (idle/sending/pending_ack/success/timeout/error). Ruft `POST /api/v1/zone/devices/{esp_id}/assign` auf. Zeigt MQTT-Status (mqtt_sent). **30s ACK-Timeout**. Zone-ID wird Auto-Generiert aus Zone-Name ("Gewächshaus Nord" → "gewaechshaus_nord").
2. **ZoneGroup (921 Zeilen):** VueDraggable mit `force-fallback`. Gruppiert ESPs nach zone_id. Zeigt Zone-Name als Header. LocalStorage für Collapse-State. Empty Drop-Target für neue ESPs.
3. **useZoneDragDrop (513 Zeilen):** Undo/Redo History-Stack (max 20). Optimistic Updates (UI aktualisiert sofort, WebSocket-ACK in Background). Error-Handling mit Toast-Feedback.
4. **Pending Devices:** Zone kann NICHT vor Approval zugewiesen werden (API prüft device existence, pending devices werden separiert).
5. **Subzone-Management:** ⚠️ **API-ONLY, KEINE UI!** API-Client `subzones.ts` (155 Zeilen) mit 6 Funktionen (assign, remove, list, safe-mode, sensor-assign, sensor-remove). Types vollständig. Aber: KEINE Subzone-Komponenten, KEINE Composables, KEIN WebSocket-Handler.

### 4.3 Frontend-Implementierungsmatrix (db-inspector + frontend-development, 2026-02-10)

| Feature | Types | API-Client | UI-Komponente | WebSocket-Handler | Status |
|---------|-------|------------|---------------|-------------------|--------|
| Zone-Assignment | ✅ | ✅ `zones.ts` (85Z) | ✅ `ZoneAssignmentPanel` (590Z) | ✅ `zone_assignment` | **PRODUCTION READY** |
| Zone-Removal | ✅ | ✅ `zones.ts` | ✅ ZoneGroup context menu | ✅ via zone_assignment | **PRODUCTION READY** |
| Zone-Drag&Drop | ✅ | ✅ via zones.ts | ✅ `ZoneGroup` + `useZoneDragDrop` | ✅ | **PRODUCTION READY** |
| Subzone-Assignment | ✅ | ✅ `subzones.ts` (155Z) | ❌ KEINE | ❌ KEIN Handler (F21) | **API-ONLY** |
| Subzone-Removal | ✅ | ✅ `subzones.ts` | ❌ KEINE | ❌ KEIN Handler | **API-ONLY** |
| Subzone-SafeMode | ✅ | ✅ `subzones.ts` | ❌ KEINE | ❌ | **API-ONLY** |
| Kaiser-Management | ⚠️ Felder only | ❌ KEIN Client | ❌ KEINE | ❌ | **NOT IMPLEMENTED** |

### 4.4 WebSocket Event-Registrierung (esp.ts:2356-2388)

**Alle registrierten Handler (24 Events):**
```
esp_health, sensor_data, actuator_status, actuator_alert,
config_response, zone_assignment, sensor_health, device_discovered,
device_approved, device_rejected, actuator_response, notification,
error_event, system_event, actuator_command, actuator_command_failed,
config_published, config_failed, device_rediscovered, sequence_started,
sequence_step, sequence_completed, sequence_error, sequence_cancelled
```

**⚠️ FEHLEND:** `subzone_assignment` – Server sendet, Frontend ignoriert (F21)

**⚠️ websocket-events.ts:** Definiert `ZoneAssignmentEvent` (Zeile 578-590) aber **KEIN** `SubzoneAssignmentEvent`. Der Event-Type fehlt komplett in der Type-Definition.

### 4.5 Zone-API-Client Details (zones.ts)

| Funktion | Endpoint | Was |
|----------|----------|-----|
| `assignZone(espId, req)` | `POST /zone/devices/{id}/assign` | Zone zuweisen |
| `removeZone(espId)` | `DELETE /zone/devices/{id}/zone` | Zone entfernen |
| `getZoneInfo(espId)` | `GET /zone/devices/{id}` | Zone-Info abfragen |
| `getZoneDevices(zoneId)` | `GET /zone/{id}/devices` | Alle ESPs in Zone |
| `getUnassignedDevices()` | `GET /zone/unassigned` | ESPs ohne Zone |

### 4.6 Subzone-API-Client Details (subzones.ts)

| Funktion | Endpoint | Was |
|----------|----------|-----|
| `assignSubzone(espId, req)` | `POST /subzone/devices/{id}/subzones/assign` | Subzone zuweisen |
| `removeSubzone(espId, subzoneId)` | `DELETE /subzone/devices/{id}/subzones/{sid}` | Subzone entfernen |
| `getSubzones(espId)` | `GET /subzone/devices/{id}/subzones` | Alle Subzones eines ESP |
| `setSafeMode(espId, subzoneId, active)` | `POST /subzone/devices/{id}/subzones/{sid}/safe` | Safe-Mode toggle |
| `assignSensor(subzoneId, sensorId)` | `POST /subzone/{sid}/sensors/{id}` | Sensor zu Subzone |
| `removeSensor(subzoneId, sensorId)` | `DELETE /subzone/{sid}/sensors/{id}` | Sensor aus Subzone |

---

## 5. KONSISTENZPRÜFUNG: Cross-Layer

### 5.1 Zone-ID Konsistenz

| Stelle | Typ | Nullable? | Default | Format-Validierung? |
|--------|-----|-----------|---------|---------------------|
| system_types.h KaiserZone.zone_id | String | Ja (leer="") | `""` | Nein |
| ESPDevice.zone_id (DB Model) | String(50) | Ja (NULL) | `None` | Nein (nur Länge) |
| Heartbeat-Payload zone_id | JSON string | Ja (key optional) | `""` | Nein |
| Sensor-Payload subzone_id | JSON string | Ja (key optional) | `""` | Nein |
| Actuator-Status zone_id | JSON string | Ja | `""` | Nein |
| Zone-Router Request body | Pydantic str | NEIN (required) | - | Pydantic String |
| Frontend ESP Type zone_id | `string \| null` | Ja | `null` | Nein |

**⚠️ Inkonsistenz:** ESP32 benutzt `""` (leerer String) für "keine Zone", Server benutzt `None`/`NULL` für "keine Zone". Der Heartbeat sendet `""`, der Server speichert `None`. Zone-API prüft `if not esp.zone_id` was beides matcht, aber die Datenrepräsentation ist unterschiedlich.

### 5.2 Kaiser-ID Konsistenz

| Stelle | Typ | Default | Was bei leer/null? | Was bei unbekannt? |
|--------|-----|---------|--------------------|--------------------|
| system_types.h KaiserZone.kaiser_id | String | `"god"` | Fallback "god" (main.cpp:787) | Wird akzeptiert, Topic ändert sich |
| ESPDevice.kaiser_id (DB Model) | String(50), nullable | `None` | Bleibt None bis Zone-Assign | Wird gespeichert (kein FK) |
| TopicBuilder (ESP32) | char[] | g_kaiser.kaiser_id | "god" Fallback | Neues Topic-Prefix |
| Topic-Parser (Server) | Regex `[a-zA-Z0-9_]+` | N/A | Kein Match → None | Match → Extracted |
| MQTT Subscription Pattern | String | get_kaiser_id() → "god" | "god" | **NICHT subscribed!** |
| HierarchySettings.kaiser_id | str | `"god"` (ENV: KAISER_ID) | "god" | Wird verwendet |
| Constants.DEFAULT_KAISER_ID | str | `"god"` | - | - |

**⚠️ Kritische Inkonsistenz:** ESP32 defaults kaiser_id zu `"god"`. DB defaults kaiser_id zu `None`. Ein frisch registrierter ESP hat kaiser_id=None in DB aber sendet Topics auf `kaiser/god/...`. Erst nach Zone-Assignment wird kaiser_id in DB gesetzt.

### 5.3 Subzone-ID Konsistenz

| Stelle | Typ | Nullable? | Default | Validierung? |
|--------|-----|-----------|---------|--------------|
| SensorConfig (ESP32) | String | Ja | `""` | Nein |
| ActuatorConfig (ESP32) | String | Ja | `""` | Nein |
| Sensor-Payload MQTT | JSON string | Optional key | `""` | Nein |
| ~~SensorConfig (DB)~~ | ~~String, nullable~~ | — | — | **EXISTIERT NICHT** (db-inspector Korrektur) |
| ~~ActuatorConfig (DB)~~ | ~~String, nullable~~ | — | — | **EXISTIERT NICHT** (db-inspector Korrektur) |
| **SubzoneConfig (DB)** | String(50), NOT NULL | NEIN | - | UniqueConstraint(esp_id, subzone_id) |
| Subzone-Router | Pydantic str | Required (in create) | - | Format: 1-32 chars, alnum + underscore |
| Frontend Types | `string \| null` | Ja | null | Nein |

**⚠️ KORREKTUR (db-inspector, 2026-02-10):** Server-DB hat **KEIN** `subzone_id` Feld in SensorConfig oder ActuatorConfig. Subzone-Zuordnung läuft über separate `subzone_configs` Tabelle (ESP→GPIO-Gruppen-Ebene). ESP32-seitig haben SensorConfig und ActuatorConfig das Feld direkt.

---

## 6. SZENARIO-TESTS (Gedankenexperimente gegen Code)

### 6.1 Minimales Setup (kein Zone, kein Subzone, nur God-Kaiser)

```
ESP startet → kaiser_id="god", zone_id="", subzone_id=""
→ MQTT Topics korrekt? JA - kaiser/god/esp/{id}/...
→ Server verarbeitet korrekt? JA - zone_id="" im Heartbeat → metadata, ESPDevice.zone_id=None
→ Frontend zeigt ESP unter "Unassigned"? JA - zone_id ist null/leer
```
**→ FUNKTIONIERT. Keine Probleme.**

### 6.2 Zone zuweisen (Server→ESP)

```
Admin klickt "Zone zuweisen" im Frontend
→ REST API Call: POST /zone/devices/{esp_id}/assign → ZoneService.assign_zone()
→ DB wird sofort aktualisiert (zone_id, zone_name, master_zone_id, kaiser_id)
→ MQTT Publish: kaiser/god/esp/{esp_id}/zone/assign
→ ESP empfängt, validiert zone_id nicht leer → OK
→ configManager.updateZoneAssignment() → NVS Save
→ ACK: kaiser/god/esp/{esp_id}/zone/ack
→ Server handle_zone_ack(): Bestätigt in DB, löscht pending_zone_assignment
→ WebSocket: zone_assignment Event → Frontend aktualisiert
```
**→ FUNKTIONIERT. Vollständiger Round-Trip implementiert.**

### 6.3 Zone entfernen

```
Admin entfernt Zone-Zuweisung
→ REST API Call: DELETE /zone/devices/{esp_id}/zone → ZoneService.remove_zone()
→ DB: zone_id=None, master_zone_id=None, zone_name=None
→ MQTT Publish: kaiser/god/esp/{esp_id}/zone/assign mit zone_id=""
```
**⚠️ BUG: ESP32 (main.cpp:1253) REJECTET leere zone_id!**
```cpp
if (zone_id.length() == 0) {
    LOG_ERROR("Zone assignment failed: zone_id is empty");
    return;  // ← ABBRUCH, kein ACK
}
```
**→ Zone wird in DB gelöscht aber ESP behält alte Zone in NVS!**
**→ Nächster Heartbeat: ESP sendet alte zone_id, DB hat None. WIDERSPRUCH.**
**→ SEVERITY: HOCH. Zone-Removal ist für echte ESPs GEBROCHEN.**

### 6.4 Subzone einem Sensor zuweisen

```
Admin weist Sensor (GPIO 4) eine Subzone zu
→ REST API Call: POST /subzone/{subzone_id}/sensors/{sensor_id}
→ DB: SensorConfig.subzone_id = subzone_id
→ Config-Push an ESP: kaiser/god/esp/{esp_id}/subzone/assign
  Payload: { subzone_id, subzone_name, assigned_gpios: [4], parent_zone_id }
→ ESP Validation: zone_assigned muss true sein (main.cpp:1358)
→ ESP: GPIOManager.assignPinToSubzone(gpio, subzone_id)
→ ESP: configManager.saveSubzoneConfig() → NVS
→ ACK: subzone/ack
→ Nächster Sensor-Read: subzone_id aus SensorConfig in Payload
```
**→ FUNKTIONIERT, aber Voraussetzung: ESP muss Zone haben (zone_assigned=true).**
**→ Szenario 4 (Pin mit Subzone aber ESP ohne Zone) wird vom ESP REJECTED.**

### 6.5 ESP mit kaiser_id != "god" (Kaiser-Vorbereitung)

```
Gedankenexperiment: ESP hat kaiser_id="kaiser_01" (z.B. via Zone-Assignment mit kaiser_id)
→ MQTT Topic: kaiser/kaiser_01/esp/{esp_id}/system/heartbeat
→ Server Subscription: kaiser/god/esp/+/system/heartbeat → KEIN MATCH
```
**→ ERGEBNIS: Server empfängt NICHTS. ESP ist "unsichtbar".**
**→ Keine Discovery, kein Heartbeat, kein Sensor-Data, keine Actuator-Commands.**
**→ Topic-Parser sind vorbereitet (akzeptieren any kaiser_id), aber Subscriptions NICHT.**

### 6.6 Mehrere ESPs in gleicher Zone

```
ESP_A und ESP_B haben zone_id="greenhouse"
→ GET /zone/greenhouse/devices → gibt beide zurück? JA (ESPRepository.get_by_zone)
→ Frontend ZoneGroup zeigt beide? JA (gruppiert nach zone_id)
→ Emergency Stop für Zone → erreicht beide?
```
**→ Emergency Stop geht über Broadcast (kaiser/broadcast/emergency) → erreicht ALLE ESPs.**
**→ Zone-spezifischer Emergency: NICHT implementiert. Es gibt kein `kaiser/broadcast/zone/{zone_id}/emergency`.**
**→ Broadcast-Zone Topic existiert (`MQTT_TOPIC_BROADCAST_ZONE = "kaiser/broadcast/zone/{zone_id}"`), aber kein Handler auf ESP-Seite.**

### 6.7 Falsche/ungültige Zone-Config

```
ESP hat zone_id="invalid_zone_xyz" die serverseitig nicht existiert
→ Heartbeat wird verarbeitet? JA (zone_id geht in metadata)
→ DB speichert den Wert? In metadata JA, in ESPDevice.zone_id NUR wenn via Zone-API zugewiesen
→ Frontend zeigt was? ESP mit zone_id wird in Zone gruppiert. Neue "Zone" wird implizit erstellt.
→ Error-State? NEIN. Keine Validierung ob Zone "bekannt" ist.
→ Logging? Nein.
```
**→ Aktuelles Verhalten: Jeder String wird als gültige zone_id akzeptiert. Keine Validierung.**
**→ Empfohlenes Verhalten: Akzeptabel für Phase 7 (Zonen sind dynamisch, keine Zone-Tabelle). Problematisch wenn Zone-Management formalisiert wird.**

### 6.8 Zone-Wechsel (ESP von Zone A nach Zone B)

```
ESP war in zone_id="zone_a", wird nach "zone_b" verschoben
→ POST /zone/devices/{esp_id}/assign { zone_id: "zone_b" }
→ DB: zone_id="zone_b" (sofort)
→ MQTT: zone/assign mit zone_id="zone_b"
→ ESP: Überschreibt NVS, ACK
→ Alte Zone: ESP verschwindet aus GET /zone/zone_a/devices ✓
→ Neue Zone: ESP erscheint in GET /zone/zone_b/devices ✓
→ MQTT Topics: kaiser_id ändert sich NICHT (bleibt "god")
→ Sensor-Daten: Nächster Heartbeat hat zone_id="zone_b" ✓
→ Subzones: BLEIBEN ERHALTEN auf ESP-Seite (NVS nicht gelöscht)
```
**→ FUNKTIONIERT. Aber Subzones bleiben erhalten, was bei parent_zone_id Mismatch zu Validation-Fehlern führen kann.**

---

## 7. KAISER-VORBEREITUNG: Gap-Analyse

### 7.1 Was ist schon da?

| Komponente | Status | Code-Location | Anmerkung |
|------------|--------|---------------|-----------|
| KaiserRegistry DB Model | ✅ VOLL | `db/models/kaiser.py:16-112` | Tabelle existiert, alle Felder definiert |
| ESPOwnership DB Model | ✅ VOLL | `db/models/kaiser.py:125-198` | FK zu Kaiser+ESP, Priority für Failover |
| kaiser_service.py | ❌ LEER | `services/kaiser_service.py:1` | Nur Docstring "Status: PLANNED" |
| kaiser.py API Router | ❌ LEER | `api/v1/kaiser.py:30` | Nur Prefix, keine Endpoints |
| ESP assign_kaiser Endpoint | ✅ EXISTS | `api/v1/esp.py` (GET /esp/devices/{esp_id}/assign_kaiser) | Endpoint registriert |
| ESPService.assign_to_kaiser() | ⚠️ BUGGY | `esp_service.py:692-716` | Speichert in metadata statt DB-Spalte (F18) |
| ESPService.get_devices_by_kaiser() | ⚠️ BUGGY | `esp_service.py:718-735` | Full-Table-Scan über metadata, kein DB-Index (F18) |
| KaiserZone auf ESP32 | ✅ VOLL | `system_types.h:34-47` | kaiser_id mit Default "god", alle Felder |
| kaiser_id in MQTT Topics | ✅ VOLL | `topic_builder.cpp`, `constants.py` | Alle Topics parametrisiert |
| HierarchySettings | ✅ VOLL | `config.py:130-136` | kaiser_id via ENV konfigurierbar |
| Topic-Parser (Server) | ✅ VOLL | `topics.py` (alle parse_* Methoden) | Akzeptieren any kaiser_id |
| MQTT Subscriptions | ❌ BLOCKED | `main.py:203-308` | Hardcoded `kaiser/god/...`, kein Wildcard |
| ESP TopicBuilder.setKaiserId() | ✅ VOLL | main.cpp:1279 | Dynamisch bei Zone-Assignment |

### 7.2 Was fehlt für "fluffige" Kaiser-Integration?

| # | Gap | Aufwand | Priorität |
|---|-----|---------|-----------|
| 1 | **MQTT Subscription auf `kaiser/+/esp/+/...`** statt `kaiser/god/esp/+/...` | Klein (1 Zeile pro Pattern) | KRITISCH |
| 2 | **kaiser_service.py implementieren** (Register, Heartbeat, Assign ESP) | Mittel (200-400 Zeilen) | HOCH |
| 3 | **Kaiser API Endpoints implementieren** (6 geplante Endpoints) | Mittel (150-300 Zeilen) | HOCH |
| 4 | **Kaiser-Heartbeat Handler** (Kaiser sendet eigene Heartbeats) | Klein (50 Zeilen) | MITTEL |
| 5 | **Zone-Removal Fix** (ESP32 akzeptiert leere zone_id nicht) | Klein (5 Zeilen) | KRITISCH (auch ohne Kaiser) |
| 6 | **Heartbeat zone_id Sync zu DB-Spalte** | Klein (10 Zeilen) | MITTEL |
| 7 | **ZoneService.kaiser_id Fix** (nutze get_kaiser_id() statt getattr) | Trivial (1 Zeile) | NIEDRIG |
| 8 | **Zone-spezifischer Emergency Stop** (Broadcast per Zone) | Mittel (ESP-seitig + Server) | NIEDRIG |

### 7.3 MQTT-Subscription Readiness

**Kann der Server HEUTE schon Messages von `kaiser/{irgendwas}/esp/...` verarbeiten?**

**NEIN.** Der Server subscribed ausschließlich auf `kaiser/god/esp/+/...`. Messages auf `kaiser/kaiser_01/esp/...` werden vom Broker nicht an den Server geroutet.

**Was müsste geändert werden:**

1. **Option A (Minimal, empfohlen):** Alle Subscription-Patterns in main.py von `kaiser/{kaiser_id}/...` auf `kaiser/+/...` ändern:
   ```python
   # Statt:
   f"kaiser/{kaiser_id}/esp/+/sensor/+/data"
   # Nutze:
   "kaiser/+/esp/+/sensor/+/data"
   ```
   Die Topic-Parser extrahieren bereits kaiser_id aus dem Topic – diese Änderung ist rein subscription-seitig.

2. **Option B (Sicherer):** kaiser_id aus Topic extrahieren und gegen KaiserRegistry validieren. Unbekannte Kaiser werden geloggt aber trotzdem verarbeitet (Graceful Degradation).

**Aufwand Option A:** ~15 Minuten, 13 Zeilen ändern in main.py.

---

## 8. FINDINGS & ANPASSUNGEN

### 8.1 Inkonsistenzen gefunden

| # | WO | WAS | AUSWIRKUNG | FIX |
|---|-----|-----|-----------|-----|
| F1 | main.cpp:1253 | Zone-Removal: ESP rejectet leere zone_id | Zone-Removal funktioniert nicht auf echten ESPs. DB sagt "keine Zone", ESP behält alte Zone. | ESP: leere zone_id als "Zone entfernen" interpretieren (5 Zeilen) |
| F2 | heartbeat_handler.py:608-616 | Zone-Info aus Heartbeat geht nur in metadata, nicht in ESPDevice.zone_id | Widerspruch: ESP hat Zone, DB-Spalte ist leer. Nur über Zone-API synchronisierbar. | heartbeat_handler: optional zone_id in DB-Spalte synchronisieren (10 Zeilen) |
| F3 | zone_service.py:75 | `getattr(constants, "KAISER_ID", "god")` - KAISER_ID existiert nicht | Nutzt nicht die konfigurierte HierarchySettings. Funktioniert zufällig weil Fallback="god". | `self.kaiser_id = constants.get_kaiser_id()` (1 Zeile) |
| F4 | esp.py:95 vs system_types.h:42 | DB: kaiser_id=None (default), ESP: kaiser_id="god" (default) | Frisch registrierte ESPs haben kaiser_id=None in DB aber "god" auf ESP. | Bei Discovery/Heartbeat: ESPDevice.kaiser_id="god" setzen (3 Zeilen) |
| F5 | main.py:203-308 | Alle MQTT-Subscriptions hardcoded auf "god" | ESPs mit anderem kaiser_id sind unsichtbar | Wildcard `kaiser/+/...` verwenden (13 Zeilen) |
| F6 | zone.py:10 | DELETE Endpoint heißt `/zone/devices/{esp_id}/assign` (POST-Name) | REST-API Doku sagt `/zone/devices/{esp_id}/zone`. Code hat `/zone/devices/{esp_id}/zone` (korrekt, Kommentar irreführend) | Docstring korrigieren (1 Zeile) |
| F7 | main.cpp:1358 | Subzone-Assignment erfordert zone_assigned=true | Szenario 4 (Subzone ohne Zone) wird rejected | Design-Entscheidung, kein Bug. Dokumentieren. |

### 8.2 Fehlende Validierungen

| # | Stelle | Was fehlt |
|---|--------|-----------|
| V1 | ~~Zone-Router (zone.py)~~ | ~~Keine Format-Validierung~~ **KORRIGIERT:** `schemas/zone.py:65-71` hat `validate_zone_id_format()` (alnum + _ + -, max 50, lowercased). Validierung existiert auf Schema-Ebene. |
| V2 | Zone-Router (zone.py) | Keine Prüfung ob ESP "approved" ist bevor Zone zugewiesen wird |
| V3 | Heartbeat-Handler | Keine Warnung wenn ESP zone_id != DB zone_id (Widerspruch still ignoriert) |
| V4 | ZoneService | Kein Timeout-Handling für pending_zone_assignment (bleibt ewig) |
| V5 | ESP main.cpp:1250 | kaiser_id aus Zone-Assign Payload wird akzeptiert ohne Validierung (jeder String) |

### 8.3 Empfohlene Anpassungen (priorisiert)

| Prio | Anpassung | Bereich | Aufwand | Begründung |
|------|-----------|---------|---------|------------|
| **P0** | **F1: Zone-Removal Fix auf ESP32** | ESP32 | 5 Zeilen | Zone-Entfernung ist GEBROCHEN. Leere zone_id muss als "entferne Zone" interpretiert werden. |
| **P1** | **F3: ZoneService.kaiser_id Fix** | Server | 1 Zeile | Falsche Attribut-Referenz. Trivial zu fixen. |
| **P1** | **F4: kaiser_id bei Discovery setzen** | Server | 3 Zeilen | Konsistenz ESP↔DB. Einfach. |
| **P2** | **F2: Heartbeat zone_id Sync** | Server | 10 Zeilen | Vermeidet Widersprüche. Optionaler Warning-Log bei Mismatch. |
| **P2** | **F5: MQTT Wildcard Subscriptions** | Server | 13 Zeilen | Vorbereitung für Kaiser-Nodes. Kein Schaden im aktuellen System. |
| **P3** | **V1: zone_id Format-Validierung** | Server | 5 Zeilen | Defensive Programmierung. Verhindert exotische Strings. |
| **P3** | **V4: Pending Assignment Timeout** | Server | 20 Zeilen | Aufräumen von stuck pending assignments (z.B. 5min Timeout). |
| **P4** | **V3: Heartbeat Mismatch Warning** | Server | 5 Zeilen | Observability. Hilft bei Debugging. |

### 8.4 Server-Tiefenanalyse Ergänzungen (esp32-development + server-development Skill)

**Zusätzliche Findings aus der Server-spezifischen Code-Analyse:**

#### F13: ZoneService vs SubzoneService kaiser_id-Handling (Inkonsistenz)

**Stellen:** `zone_service.py:75` vs `subzone_service.py:80`

```python
# ZoneService (Phase 7, FALSCH):
self.kaiser_id = getattr(constants, "KAISER_ID", "god")  # KAISER_ID existiert nicht!

# SubzoneService (Phase 9, RICHTIG):
self.kaiser_id = constants.get_kaiser_id()  # Nutzt Helper-Funktion
```

SubzoneService wurde NACH ZoneService implementiert und nutzt den korrekten Weg. Bestätigt F3, zeigt aber auch dass die korrekte Lösung bereits im Projekt existiert.

#### F14: Subzone-Removal DB-Cleanup hängt an fehlendem ACK

**Stellen:** `subzone_service.py:198-245` + `subzone_ack_handler.py:14` + `main.cpp:1436-1472`

Server-seitiger Flow:
1. `SubzoneService.remove_subzone()` sendet MQTT removal (subzone_service.py:231)
2. DB-Record wird NICHT gelöscht – wartet auf ACK mit `status="subzone_removed"` (subzone_ack_handler.py:14)
3. `SubzoneService.handle_subzone_ack()` → `_delete_subzone_config()` (subzone_service.py:374-378)
4. **ABER:** ESP sendet KEIN ACK (F10, main.cpp:1446-1470)

**Auswirkung:** SubzoneConfig-Records in der `subzone_configs` DB-Tabelle akkumulieren sich nach Removals. Der Server glaubt, die Subzone existiert noch. Kein Cleanup-Mechanismus.

**Schweregrad:** P2 – Orphaned Records, kein funktionaler Schaden, aber DB-Hygiene-Problem.

#### F15: zone_ack_handler ignoriert zone_name

**Stelle:** `zone_ack_handler.py:131-132`

```python
device.zone_id = zone_id if zone_id else None
device.master_zone_id = master_zone_id if master_zone_id else None
# ← zone_name wird NICHT aus ACK extrahiert/aktualisiert
```

Kein akuter Bug, da `zone_name` bereits in `ZoneService.assign_zone()` (zone_service.py:133) gesetzt wird und der ACK den Wert nicht ändert. Aber: Die Bestätigung ist unvollständig – wenn der ESP zone_name theoretisch modifizieren würde, erfährt der Server nie davon.

#### F16: Discovery setzt weder kaiser_id noch zone_id auf DB-Spalte

**Stellen:** `heartbeat_handler.py:353-373` + `discovery_handler.py:120-135`

Bei Auto-Discovery (sowohl Heartbeat als auch Legacy):
- `ESPDevice.kaiser_id` → wird NICHT gesetzt (bleibt None)
- `ESPDevice.zone_id` → wird NICHT gesetzt (bleibt None)
- Zone-Info geht NUR in `device_metadata` JSON

**Kontrast:** ESP sendet Heartbeat auf `kaiser/god/esp/{id}/...` – der kaiser_id ist "god" im Topic. Server könnte ihn aus dem Topic extrahieren (`TopicBuilder.parse_heartbeat_topic()` liefert `kaiser_id`), tut es aber nicht.

**Auswirkung:** Frisch entdeckte ESPs haben `kaiser_id=None` in der DB, obwohl sie faktisch unter `kaiser/god/` operieren. Erst `ZoneService.assign_zone()` setzt `kaiser_id="god"`. Frontend zeigt `kaiser_id: null` bis Zone zugewiesen wird.

#### F17: Doppelte Zone-ACK Implementierung

**Stellen:** `zone_ack_handler.py` (MQTT Handler) + `zone_service.py:255-309` (Service-Methode)

Es existieren ZWEI separate Implementierungen für Zone-ACK-Handling:
1. `zone_ack_handler.py` → wird vom MQTT-Subscriber aufgerufen (main.py:237)
2. `ZoneService.handle_zone_ack()` → Service-Methode, wird von MQTT NICHT aufgerufen

Beide haben fast identische Logik. Die Service-Methode ist Dead Code im MQTT-Flow.

**Auswirkung:** Kein funktionaler Bug. Aber Wartungslast: Änderungen müssen in beiden Stellen gemacht werden (oder die Service-Methode sollte entfernt/konsolidiert werden).

#### F18: ESPService.assign_to_kaiser() speichert in metadata statt DB-Spalte

**Stellen:** `esp_service.py:692-716` + `esp_service.py:718-735`

```python
# assign_to_kaiser() (esp_service.py:692):
metadata = device.device_metadata or {}
metadata["kaiser_id"] = kaiser_id     # ← In metadata JSON!
device.device_metadata = metadata     # ← NICHT in ESPDevice.kaiser_id Spalte!

# get_devices_by_kaiser() (esp_service.py:718):
return [d for d in all_devices
    if d.device_metadata and d.device_metadata.get("kaiser_id") == kaiser_id]
# ← Filtert über metadata, nicht über DB-Spalte → kein DB-Index!
```

**Problem:** Die `ESPDevice.kaiser_id` DB-Spalte (String(50), indexed, nullable) existiert, wird aber von `assign_to_kaiser()` NICHT verwendet. Stattdessen wird kaiser_id in `device_metadata` JSON gespeichert, was:
1. Keinen DB-Index nutzt (Full-Table-Scan bei `get_devices_by_kaiser()`)
2. Inkonsistent mit `zone_id` ist (ZoneService setzt `ESPDevice.zone_id` Spalte)
3. Die DB-Spalte `kaiser_id` bleibt immer `None`

**Schweregrad:** P2 – Funktioniert, aber Architektur-Inkonsistenz. Bei Kaiser-Service-Implementierung MUSS die DB-Spalte genutzt werden.

#### F19: discover_device() (esp_service.py:741-793) vs _auto_register_esp() (heartbeat_handler.py:353)

**Stellen:** `esp_service.py:741-793` + `heartbeat_handler.py:353-390`

Es gibt ZWEI separate Discovery-Implementierungen:
1. `ESPService.discover_device()` (esp_service.py:741) – mit Rate-Limiter, zone_id/master_zone_id aus Payload
2. `HeartbeatHandler._auto_register_esp()` (heartbeat_handler.py:353) – eigene Implementierung

Heartbeat-Handler nutzt NICHT `ESPService.discover_device()`, sondern baut sein eigenes `ESPDevice` direkt. Beide erstellen `status="pending_approval"` Devices mit `device_metadata`, aber mit unterschiedlichen Feld-Sets.

**Auswirkung:** Wartungslast, fehlende Zentralisierung. Änderungen am Discovery-Flow müssen in beiden Stellen gemacht werden.

### 8.4.1 DB-Inspector + Frontend-Verifikation Ergänzungen (db-inspector, 2026-02-10)

**Zusätzliche Findings aus Cross-Layer Code-Verifikation (DB-Schema + Server + Frontend):**

#### C1: Dokument-Korrektur – Subzone-DB-Tabelle existiert

**Stellen:** `db/models/subzone.py` (SubzoneConfig)

Section 3.1 behauptete: "Es gibt KEINE separate Subzone-DB-Tabelle". Das ist **FALSCH**.
- `subzone_configs` Tabelle existiert (`__tablename__ = "subzone_configs"`)
- FK auf `esp_devices.device_id` (CASCADE)
- Felder: `subzone_id` (String 50, NOT NULL), `parent_zone_id`, `assigned_gpios` (JSON), `safe_mode_active`, `sensor_count`, `actuator_count`, `last_ack_at`
- UniqueConstraint: `(esp_id, subzone_id)`
- Relationship: `ESPDevice.subzones` (back_populates)

#### C2: Dokument-Korrektur – Kein subzone_id in SensorConfig/ActuatorConfig DB-Modellen

**Stellen:** `db/models/sensor.py`, `db/models/actuator.py`

Section 3.1 und 5.3 behaupteten: "subzone_id ist String-Feld in den Sensor/Actuator-Tabellen". Das ist **FALSCH**.
- `SensorConfig` (DB): Hat **KEIN** `subzone_id` Feld
- `ActuatorConfig` (DB): Hat **KEIN** `subzone_id` Feld
- `sensor_handler.py`: Verarbeitet **KEIN** `subzone_id` aus MQTT-Payloads
- `schemas/sensor.py`: Enthält **KEIN** `subzone_id`
- Nur `schemas/debug.py` hat `subzone_id` (für Debug-Endpoints)

**Architektur-Klarstellung:** Server-seitig wird Subzone-Zuordnung über `subzone_configs` Tabelle auf ESP-GPIO-Gruppen-Ebene verwaltet, NICHT auf Sensor/Actuator-Ebene. ESP32-seitig haben `SensorConfig.subzone_id` und `ActuatorConfig.subzone_id` die Info direkt.

#### F20: Frontend handleZoneAssignment liest zone_name, Server sendet es nie

**Stellen:** `zone_ack_handler.py:254-265` + `esp.ts:1818-1823`

Server zone_ack_handler broadcast:
```python
event_data = {
    "esp_id": esp_id, "status": status, "zone_id": zone_id,
    "master_zone_id": master_zone_id, "timestamp": timestamp,
}
# ← KEIN zone_name!
```

Frontend handleZoneAssignment:
```typescript
devices.value[deviceIndex] = {
    ...device,
    zone_id: data.zone_id || undefined,
    zone_name: data.zone_name || undefined,  // ← IMMER undefined!
    master_zone_id: data.master_zone_id || undefined,
}
```

**Auswirkung:** Nach jeder Zone-Assignment-Bestätigung via WebSocket verliert das Frontend den `zone_name`. Der Wert wird auf `undefined` überschrieben, obwohl die DB den korrekten zone_name hat. User sieht Zone-Name verschwinden bis zum nächsten Page-Refresh.

**Schweregrad:** P1 – UI-Bug. Frontend verliert Daten bei jedem Zone-ACK Event.

#### F21: Kein subzone_assignment WebSocket-Handler im Frontend

**Stellen:** `subzone_ack_handler.py:134-149` + `esp.ts` (Store)

Server sendet `subzone_assignment` Events via WebSocket:
```python
message = {"type": "subzone_assignment", "device_id": ..., "data": {...}}
await self.ws_manager.broadcast_thread_safe(message)
```

Frontend hat **KEINEN** Handler registriert:
- `esp.ts:2366`: Nur `zone_assignment` Handler registriert
- Kein `subzone_assignment` in WebSocket-Event-Registrierung
- `subzones.ts:34` erwähnt es nur im Kommentar

**Auswirkung:** Frontend bekommt keine Echtzeit-Updates bei Subzone-Zuweisungen. Subzone-UI aktualisiert sich erst bei manuellem Page-Refresh oder explizitem API-Call.

**Schweregrad:** P2 – Funktional, aber UI nicht reaktiv für Subzone-Änderungen.

#### F22: approve_device() setzt kaiser_id nicht

**Stelle:** `esp_service.py:825-836`

```python
device.status = "approved"
device.approved_at = datetime.now(timezone.utc)
if zone_id: device.zone_id = zone_id
if zone_name: device.zone_name = zone_name
# ← kaiser_id wird NICHT gesetzt!
```

**Auswirkung:** Nach Device-Approval bleibt `kaiser_id=None` in DB, auch wenn Zone zugewiesen wird. Erst `ZoneService.assign_zone()` setzt kaiser_id. Approval mit Zone-Zuweisung (`approve_device(zone_id="x")`) erzeugt inkonsistenten Zustand: zone_id gesetzt, kaiser_id=None.

**Schweregrad:** P2 – Edge-Case. Approval mit Zone-Parameter wird selten genutzt.

#### F23: WebSocket-Broadcast Format-Inkonsistenz (Zone vs Subzone)

**Stellen:** `zone_ack_handler.py:265` vs `subzone_ack_handler.py:149`

```python
# Zone-ACK Handler:
await ws_manager.broadcast("zone_assignment", event_data)  # ← Standard-API

# Subzone-ACK Handler:
await self.ws_manager.broadcast_thread_safe(message)  # ← Thread-safe + manuelles Wrapping
```

Zone-Handler nutzt `broadcast()` (standard), Subzone-Handler nutzt `broadcast_thread_safe()` mit manuell konstruiertem Message-Wrapper (`{type, device_id, data}`). Unterschiedliche API-Nutzung für gleiche Funktionalität.

**Schweregrad:** P4 – Keine funktionale Auswirkung, aber Inkonsistenz im Codebase.

#### F24: zone_service.remove_zone() löscht kaiser_id nicht

**Stelle:** `zone_service.py:218-221`

```python
device.zone_id = None
device.master_zone_id = None
device.zone_name = None
# ← kaiser_id bleibt erhalten!
```

Zone-Removal löscht zone_id, master_zone_id, zone_name aber **NICHT** kaiser_id. Vermutlich beabsichtigt (Kaiser-Zuweisung ist separat von Zone), aber nicht dokumentiert. ESP-seitig bleibt kaiser_id ebenfalls erhalten (F1: zone removal wird ohnehin rejected).

**Schweregrad:** P4 – Design-Entscheidung, kein Bug. Dokumentieren.

### 8.5 ESP32-Tiefenanalyse Ergänzungen (esp32-development Skill)

**Zusätzliche Findings aus der ESP32-spezifischen Code-Analyse:**

#### F8: KRITISCH – Zone-Assignment Subscriptions NICHT per TopicBuilder (Inkonsistenz)

**Stelle:** `main.cpp:785-788` vs `main.cpp:798-801`

```cpp
// Zone-Assignment: MANUELL gebaut (INKONSISTENT)
String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/assign";
if (g_kaiser.kaiser_id.length() == 0) {
  zone_assign_topic = "kaiser/god/esp/" + g_system_config.esp_id + "/zone/assign";
}

// Subzone-Assignment: PER TOPICBUILDER (KORREKT)
String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();
```

**Problem:** Zone-Assign/Sensor-Command Topics werden per String-Konkatenation gebaut, während Subzone-Topics den TopicBuilder nutzen. Bei einem kaiser_id-Wechsel (via Zone-Assignment) werden die manuell gebauten Topics nicht automatisch aktualisiert, da sie lokale Variablen im Subscription-Block sind, nicht TopicBuilder-basiert.

**Auswirkung:** Wenn ein ESP per Zone-Assignment einen neuen kaiser_id bekommt (z.B. "kaiser_01"), aktualisiert `TopicBuilder::setKaiserId()` (main.cpp:1279) den statischen Buffer. Aber die Subscriptions für zone/assign und sensor/+/command bleiben auf dem ALTEN kaiser_id stehen, weil sie als lokale Strings subscribed wurden.

**Schweregrad:** P1 – Nach Kaiser-Wechsel sind Zone-Re-Assignment und On-Demand-Sensor-Befehle unhörbar.

**Fix:** Alle Topics per TopicBuilder bauen ODER nach kaiser_id-Wechsel Re-Subscribe auf neue Topics.

#### F9: Kein Zone-Removal-Topic auf ESP32-Seite

**Stelle:** Gesamte Codebase `El Trabajante/src/`

Es existiert `subzone/remove` (main.cpp:1437, topic_builder.cpp:199-203), aber KEIN `zone/remove`-Handler auf ESP32-Seite. Der Server kann via `zone_service.remove_zone()` eine Zone entfernen und sendet dafür `zone_id=""` auf `zone/assign`. Aber wie in F1 dokumentiert, rejectet der ESP leere zone_ids.

**Konsequenz:** Es gibt keine Möglichkeit, einem ESP seine Zone per MQTT zu entziehen. Einzige Workarounds:
- Factory-Reset des ESP
- Manuelles Provisioning-Erneuerung
- System-Command mit custom payload

**Empfehlung:** Entweder separates `zone/remove`-Topic erstellen (analog zu `subzone/remove`) ODER den F1-Fix implementieren (leere zone_id als Removal akzeptieren).

#### F10: Subzone-Removal sendet KEIN ACK

**Stelle:** `main.cpp:1436-1472`

Der Subzone-Removal-Handler (main.cpp:1446-1470) entfernt GPIOs und NVS-Daten erfolgreich, sendet aber **kein ACK** an den Server. Vergleich:
- Subzone-Assignment: `sendSubzoneAck(subzone_id, "subzone_assigned", "")` ✅
- Subzone-Removal: Kein ACK ❌

**Auswirkung:** Server weiß nicht ob Subzone-Removal erfolgreich war. Kein Feedback-Loop.

#### F11: topic_buffer_ Shared Buffer – Race Condition bei schnellen Aufrufen

**Stelle:** `topic_builder.cpp:7` + `topic_builder.h:43`

```cpp
char TopicBuilder::topic_buffer_[256];  // SINGLE static buffer
```

Alle `build*Topic()`-Methoden schreiben in denselben 256-Byte-Buffer. In `main.cpp:776-811` werden 10+ Topics nacheinander in lokale Strings kopiert. Das ist aktuell SICHER, weil:
1. ESP32 ist Single-Threaded in setup()
2. Strings werden sofort kopiert (`String xyz = TopicBuilder::build...()`)

**Aber:** Wenn jemals aus einem MQTT-Callback heraus Topics gebaut werden (z.B. für dynamische Responses), kann der Buffer überschrieben werden bevor der String kopiert ist. Der aktuelle Code ist safe, aber fragil.

**Empfehlung:** Dokumentieren als "known limitation" - kein Fix nötig, aber Awareness wichtig.

#### F12: Sensor-Command Wildcard manuell gebaut (wie F8)

**Stelle:** `main.cpp:805-810`

```cpp
String sensor_command_wildcard = "kaiser/" + g_kaiser.kaiser_id +
                                 "/esp/" + g_system_config.esp_id +
                                 "/sensor/+/command";
if (g_kaiser.kaiser_id.length() == 0) {
  sensor_command_wildcard = "kaiser/god/esp/" + g_system_config.esp_id + "/sensor/+/command";
}
```

Identisches Problem wie F8: Manuell gebaut statt TopicBuilder, nach kaiser_id-Wechsel stale.

#### V6: Zone-Assignment updateZoneAssignment() hat kein Rollback

**Stelle:** `config_manager.cpp:392-421`

`updateZoneAssignment()` schreibt zuerst in den `kaiser_`-Cache (Zeile 401-408), dann in NVS (Zeile 412). Wenn `saveZoneConfig()` fehlschlägt, bleibt der Cache mit den neuen Werten, aber NVS hat die alten. Nach Reboot: alte Werte. Während Laufzeit: neue Werte. **Inkonsistenz.**

**Fix:** Cache erst nach erfolgreichem NVS-Write aktualisieren (oder Rollback).

#### V7: validateZoneConfig() wird bei Zone-Assignment NICHT aufgerufen

**Stelle:** `config_manager.cpp:356-376` (die Methode existiert) vs `main.cpp:1270` (ruft nur `updateZoneAssignment()`)

Die Methode `ConfigManager::validateZoneConfig()` validiert:
- kaiser_id nicht leer
- kaiser_id max 63 chars
- Wenn zone_assigned, dann zone_id nicht leer

Aber der Zone-Assignment-Handler in main.cpp ruft sie nie auf. Nur `updateZoneAssignment()` wird aufgerufen, das keine Validierung enthält.

### 8.6 Aktualisierte Gesamtprioritätenliste (ESP32 + Server Findings)

| Prio | # | Anpassung | Bereich | Aufwand | Begründung |
|------|---|-----------|---------|---------|------------|
| **P0** | F1/F9 | **Zone-Removal auf ESP32 ermöglichen** | ESP32 | 10-20 Zeilen | Zone-Entfernung ist GEBROCHEN |
| **P1** | F8/F12 | **Subscription-Topics per TopicBuilder bauen** | ESP32 | 15 Zeilen | Nach Kaiser-Wechsel stale Subscriptions |
| **P1** | F3/F13 | **ZoneService.kaiser_id Fix** (nutze `get_kaiser_id()` wie SubzoneService) | Server | 1 Zeile | Falsche Attribut-Referenz |
| **P1** | F4/F16 | **kaiser_id bei Discovery auf "god" setzen** | Server | 3 Zeilen | Konsistenz ESP↔DB, kaiser_id=None vs "god" |
| **P1** | V7 | **validateZoneConfig() im Zone-Handler aufrufen** | ESP32 | 5 Zeilen | Toter Code, existiert aber nicht genutzt |
| **P1** | V6 | **updateZoneAssignment() Rollback bei NVS-Fehler** | ESP32 | 10 Zeilen | Cache/NVS Inkonsistenz bei Fehler |
| **P2** | F2 | **Heartbeat zone_id Sync zu DB-Spalte** | Server | 10 Zeilen | Stille Widersprüche metadata vs Spalte |
| **P2** | F5 | **MQTT Wildcard Subscriptions** (`kaiser/+/...`) | Server | 13 Zeilen | Vorbereitung Kaiser-Nodes |
| **P2** | F10/F14 | **Subzone-Removal ACK senden + DB-Cleanup** | ESP32+Server | 12 Zeilen | Orphaned Records in DB |
| ~~P3~~ | ~~V1~~ | ~~zone_id Format-Validierung~~ **EXISTIERT** (schemas/zone.py:65-71) | — | — | Bereits implementiert |
| **P3** | V4 | **Pending Assignment Timeout** | Server | 20 Zeilen | Aufräumen von stuck pendings |
| **P3** | F17 | **Doppelte Zone-ACK Implementierung konsolidieren** | Server | 15 Zeilen | Wartungslast reduzieren |
| **P4** | F11 | **TopicBuilder Buffer-Limitation dokumentieren** | Docs | 3 Zeilen | Awareness |
| **P4** | V3 | **Heartbeat Mismatch Warning** | Server | 5 Zeilen | Observability |
| **P4** | F15 | **zone_name in zone_ack_handler setzen** | Server | 2 Zeilen | Vollständigkeit |
| **P2** | F18 | **assign_to_kaiser() soll DB-Spalte statt metadata nutzen** | Server | 5 Zeilen | Architektur-Konsistenz, DB-Index nutzen |
| **P1** | F20 | **zone_name in WebSocket zone_assignment broadcast senden** | Server | 3 Zeilen | Frontend verliert zone_name bei jedem Zone-ACK |
| **P2** | F21 | **subzone_assignment WebSocket-Handler im Frontend registrieren** | Frontend | 20 Zeilen | Subzone-UI nicht reaktiv |
| **P2** | F22 | **approve_device() soll kaiser_id="god" setzen** | Server | 2 Zeilen | Inkonsistenter Zustand nach Approval mit Zone |
| **P3** | F19 | **Discovery-Code zentralisieren (ESPService.discover_device() nutzen)** | Server | 20 Zeilen | Wartungslast, doppelte Implementierung |
| **P4** | F23 | **WebSocket broadcast Format vereinheitlichen (Zone vs Subzone)** | Server | 5 Zeilen | Inkonsistente API-Nutzung |
| **P4** | F24 | **zone_service.remove_zone() kaiser_id Verhalten dokumentieren** | Docs | 2 Zeilen | Design-Entscheidung dokumentieren |

---

## Zusammenfassung für Agents

**Was gemacht wurde:**
1. Dokument vollständig durchgearbeitet (verify-plan)
2. Jede `→ Agent füllt aus` Stelle mit echten Code-Referenzen ausgefüllt
3. IST-Zustand präzise dokumentiert (Datei:Zeile)
4. 7 Inkonsistenzen gefunden und dokumentiert (F1-F7) (verify-plan)
5. 5 fehlende Validierungen identifiziert (V1-V5) (verify-plan)
6. Section 8 als Zusammenfassung aller Findings ausgefüllt
7. **ESP32-Tiefenanalyse (esp32-development Skill):** 5 zusätzliche Findings (F8-F12) und 2 Validierungen (V6-V7)
8. **Server-Tiefenanalyse (esp32-development + server-development):** 7 zusätzliche Findings (F13-F19)
9. **Server-Flows End-to-End dokumentiert (Section 3.7-3.11):**
   - Subzone-Service kompletter Flow (Assign + Remove)
   - MQTT Handler-Registrierung (alle 15 Handler exakt)
   - Zone-ACK Handler exakter Code-Pfad
   - Discovery-Flow mit Zone-Handling
   - Heartbeat Zone-Verarbeitung mit exakten Zeilen
   - Sensor-Data-Pipeline und Zone-Kontext
10. Aktualisierte Gesamtpriorität mit **18 Anpassungen** (Section 8.6)
11. **DB-Inspector + Frontend-Verifikation (2026-02-10):** 2 Dokument-Korrekturen (C1, C2) und 5 zusätzliche Findings (F20-F24)
12. **Frontend-Tiefenanalyse (frontend-development, 2026-02-10):**
    - Section 4 komplett überarbeitet (4.2-4.6 neu)
    - Frontend-Implementierungsmatrix (4.3): Zone=PRODUCTION READY, Subzone=API-ONLY, Kaiser=NOT IMPLEMENTED
    - WebSocket-Event-Registrierung vollständig dokumentiert (24 Events, `subzone_assignment` fehlt)
    - Zone-API-Client (5 Endpoints) und Subzone-API-Client (6 Endpoints) exakt dokumentiert
    - ZoneAssignmentPanel State-Machine (6 States, 30s Timeout), ZoneGroup VueDraggable Details
    - useZoneDragDrop Undo/Redo Stack (max 20), Optimistic Updates
    - F20 + F21 verifiziert mit exakten Zeilen-Referenzen
    - Separater Report: `.claude/reports/current/FRONTEND_ZONE_KAISER_ANALYSIS.md`
13. **Aktualisierte Gesamtpriorität:** Nun **23 Anpassungen** in Section 8.6

**Kern-Findings (24 total: F1-F24 + V1-V7 + C1-C2):**

| Kategorie | Findings | Schwerstes |
|-----------|----------|------------|
| **Zone-Removal GEBROCHEN** | F1, F9 | P0 – ESP rejectet leere zone_id, kein zone/remove Topic |
| **ESP32 Topic-Inkonsistenz** | F8, F12 | P1 – Manuell gebaute Topics stale nach Kaiser-Wechsel |
| **Kaiser-ID Inkonsistenz** | F3, F4, F13, F16, F18, F22 | P1 – ZoneService falsch, Discovery setzt nichts, approve_device vergisst kaiser_id |
| **Frontend WebSocket Lücken** | F20, F21 | P1 – zone_name verschwindet, Subzone-UI nicht reaktiv |
| **ESP32 Validierungslücken** | V6, V7 | P1 – validateZoneConfig() nie aufgerufen, kein Rollback |
| **Heartbeat-DB-Sync** | F2 | P2 – Zone-Info nur in metadata, nicht in DB-Spalte |
| **MQTT Subscriptions** | F5 | P2 – Hardcoded "god", blockt Kaiser-Vorbereitung |
| **Subzone-Removal** | F10, F14 | P2 – Kein ACK → Orphaned DB Records |
| **Dokument-Korrekturen** | C1, C2 | — – subzone_configs Tabelle existiert, kein subzone_id in Sensor/Actuator DB-Modellen |
| **Code-Hygiene** | F15, F17, F19, F23, F24 | P3-P4 – Doppelte Implementierungen, Format-Inkonsistenzen |
| **Kaiser-Service** | 7.1 | EMPTY – Modelle existieren, Service/API komplett leer |

**Cross-Layer Konsistenz-Matrix:**

| Feld | ESP32 Default | Server DB Default | MQTT Payload | Gleich? |
|------|---------------|-------------------|--------------|---------|
| kaiser_id | `"god"` | `None` | im Topic | ❌ NEIN |
| zone_id | `""` (leer) | `None` | `""` oder missing | ❌ NEIN |
| subzone_id | `""` (leer) | `None` | `""` oder missing | ❌ NEIN |
| zone_assigned | `false` | N/A (kein Feld) | `true/false` | N/A |

**Was NICHT getan wurde:**
- Keinen Code geändert
- Keine neuen Funktionen vorgeschlagen
- Keine Architektur umgebaut

### Report zurück an
`.technical-manager/inbox/agent-reports/zone-kaiser-hierarchy-analysis-2026-02-10.md`
(Oder direkt in diesem Dokument ausgefüllt – Robin entscheidet)
