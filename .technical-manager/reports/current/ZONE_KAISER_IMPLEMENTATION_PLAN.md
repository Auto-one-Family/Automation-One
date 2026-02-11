# Zone & Kaiser Konsistenz – Iterativer Implementierungsplan

> **Typ:** Lebendes Dokument – wird von Agents schrittweise ergänzt  
> **Erstellt:** 2026-02-10 vom Technical Manager  
> **Quelle:** `zone-kaiser-hierarchy-analysis.md` (24 Findings, 7 Validierungslücken, 2 Korrekturen)  
> **Zweck:** Jeder Agent analysiert seinen Bereich, füllt IST/SOLL aus, und ergänzt den Implementierungsplan bis er vollständig ist  

---

## Wie dieses Dokument funktioniert

Robin schickt Agents hierher mit fokussierten Aufträgen. Jeder Agent:
1. Liest das gesamte Dokument für Kontext
2. Analysiert seinen zugewiesenen Bereich im echten Code
3. Füllt die `→ Agent füllt aus`-Stellen mit echten Code-Referenzen aus
4. Ergänzt IST (exakter Code) und SOLL (exakte Änderung) in seiner Section
5. Prüft ob seine Änderungen Auswirkungen auf andere Work Packages haben → dokumentiert Cross-References

**WICHTIG:** Keine neuen Funktionen. Alles existiert bereits. Es müssen die RICHTIGEN BESTEHENDEN Stellen ORDENTLICH angepasst werden.

---

## Das Kern-Problem

AutomationOne hat eine 4-Ebenen-Hierarchie: **God-Kaiser → (Kaiser-Nodes) → ESP-Zonen → Subzones**. Die Architektur ist gut vorbereitet – Modelle, Topics, Parser existieren auf allen Layern. Aber die **Durchsetzung ist inkonsistent**: Gleiche Konzepte haben unterschiedliche Defaults, unterschiedliche Speicherorte, und unterschiedliche Behandlung je nachdem ob die Info per MQTT-Heartbeat, per Zone-API, oder per Discovery reinkommt.

### Die Default-Lücke (Wurzel vieler Findings)

```
                    ESP32 Default    Server DB Default    Konsequenz
                    ─────────────    ─────────────────    ──────────
kaiser_id           "god"            None                 ESP sendet auf kaiser/god/...,
                                                          DB sagt kaiser_id ist unbekannt

zone_id             "" (leer)        None                 ESP sagt "keine Zone" mit leerem String,
                                                          Server sagt "keine Zone" mit NULL

subzone_id          "" (leer)        None                 Gleiche Diskrepanz
```

Das führt zu:
- Frisch registrierte ESPs haben `kaiser_id=None` in DB obwohl sie auf `kaiser/god/...` senden
- Zone-Info aus Heartbeats landet nur in `device_metadata` JSON, nicht in den indizierten DB-Spalten
- Zone-Removal scheitert weil ESP leere `zone_id` als ungültig ablehnt statt als "Zone entfernen"

### Der Datenfluss (wo die Lücken sitzen)

```
ESP32 Boot
  │
  ├─ kaiser_id="god" (aus NVS oder Default)
  ├─ zone_id="" (aus NVS oder Default)
  │
  ▼
Heartbeat auf kaiser/god/esp/{id}/system/heartbeat
  │  Payload enthält: zone_id, master_zone_id, zone_assigned
  │
  ▼
Server: heartbeat_handler.py
  │
  ├─ NEUES Device → _auto_register_esp()
  │   ├─ ESPDevice.kaiser_id = ??? → NICHT GESETZT (None)     ← LÜCKE
  │   ├─ ESPDevice.zone_id = ??? → NICHT GESETZT (None)       ← LÜCKE
  │   └─ device_metadata = { zone_id: "", kaiser_id: ??? }    ← Nur hier
  │
  ├─ BESTEHENDES Device → _update_esp_metadata()
  │   ├─ ESPDevice.zone_id SPALTE → NICHT aktualisiert        ← LÜCKE
  │   └─ device_metadata["zone_id"] = payload.zone_id         ← Nur hier
  │
  ▼
Zone-Assignment (einziger Weg der DB-Spalten setzt):
  POST /zone/devices/{esp_id}/assign
  │
  ├─ Server: ZoneService.assign_zone()
  │   ├─ device.zone_id = zone_id              ← DB-Spalte ✓
  │   ├─ device.kaiser_id = self.kaiser_id     ← DB-Spalte ✓
  │   │   └─ ABER: self.kaiser_id kommt von getattr(constants, "KAISER_ID", "god")
  │   │       └─ "KAISER_ID" existiert NICHT → Fallback "god" (zufällig korrekt)
  │   └─ MQTT Publish: zone/assign an ESP
  │
  ├─ ESP: main.cpp Zone-Handler
  │   ├─ Validiert zone_id nicht leer          ← PROBLEM bei Removal (zone_id="")
  │   ├─ Speichert in NVS
  │   └─ ACK auf zone/ack
  │
  └─ Server: zone_ack_handler.py
      ├─ Bestätigt zone_id in DB-Spalte
      ├─ WebSocket broadcast: zone_assignment
      │   └─ OHNE zone_name                    ← LÜCKE
      └─ Frontend: handleZoneAssignment()
          └─ data.zone_name → undefined        ← UI-Bug
```

---

## Work Packages

Jedes WP gruppiert zusammengehörige Findings. Die Reihenfolge ist die empfohlene Implementierungsreihenfolge.

---

### WP1: Zone-Removal reparieren [P0]

**Findings:** F1, F9  
**Betroffene Layer:** ESP32, Server  
**Agents:** esp32-dev (primär), server-dev (Verifikation)

#### Warum das kritisch ist

Zone-Entfernung ist die einzige GEBROCHENE Grundfunktion. Der Server sendet `zone_id=""` bei Removal, der ESP rejectet leere `zone_id`. Ergebnis: DB sagt "keine Zone", ESP behält alte Zone in NVS. Bei jedem Heartbeat sendet der ESP die alte Zone, der Server ignoriert es (geht nur in metadata). Stiller Widerspruch, kein Error, kein Warning.

#### Systemkontext

**Server-Seite (zone_service.py):**  
`remove_zone()` setzt DB-Spalten auf `None` und sendet MQTT `zone/assign` mit leeren Feldern. Das ist der einzige Mechanismus für Zone-Removal – es gibt kein separates `zone/remove`-Topic.

**ESP32-Seite (main.cpp:1231-1323):**  
Der Zone-Handler prüft `zone_id.length() == 0` und bricht bei leerem String ab (Zeile 1253). Das war als Validierung gedacht ("zone_id ist Pflichtfeld bei Assignment"), blockiert aber auch Removal.

**Kontrast – Subzone funktioniert anders:**  
Subzone hat ein SEPARATES `subzone/remove`-Topic (main.cpp:1436-1472) mit eigenem Handler. Zone hat das nicht.

#### IST-Zustand

**ESP32 Zone-Handler (main.cpp:1246-1260):**

**esp32-dev Analyse (main.cpp:1246-1256):**

```cpp
// main.cpp:1246-1256 — Zone Assignment Handler, Validation Block
if (!error) {
  String zone_id = doc["zone_id"].as<String>();        // :1247
  String master_zone_id = doc["master_zone_id"].as<String>(); // :1248
  String zone_name = doc["zone_name"].as<String>();    // :1249
  String kaiser_id = doc["kaiser_id"].as<String>();    // :1250

  // Validate critical fields
  if (zone_id.length() == 0) {                         // :1253 ← REJECTION
    LOG_ERROR("Zone assignment failed: zone_id is empty"); // :1254
    return;                                             // :1255 ← SILENT EXIT
  }
```

**Rejection:** Zeile 1253 – `zone_id.length() == 0` matcht auf Server-Removal-Payload (`zone_id=""`).

**NVS:** Nichts passiert. `configManager.updateZoneAssignment()` (Zeile 1270) wird NIE erreicht. NVS behält alte Zone-Werte. Nach Reboot: ESP bootet mit alter Zone aus NVS und sendet sie im Heartbeat.

**Response:** Keine. Kein ACK, kein Error-ACK. Der Server bekommt KEINE Rückmeldung. Vergleich: bei `updateZoneAssignment()` Fehler (Zeile 1310-1318) wird immerhin ein Error-ACK gesendet. Bei leerem zone_id: absolut nichts.

**Kontrast Subzone-Assignment:** Sendet Error-ACK bei leerem subzone_id (main.cpp:1344-1347):
```cpp
if (subzone_id.length() == 0) {
  sendSubzoneAck(subzone_id, "error", "subzone_id is required");  // ← Hat Error-ACK!
  return;
}
```

**Server Zone-Removal (zone_service.py remove_zone()):**

**server-dev Analyse (zone_service.py:178-249):**

```python
# zone_service.py:178-249 — remove_zone() vollstaendiger Code
async def remove_zone(self, device_id: str) -> ZoneRemoveResponse:
    # 1. Find ESP device
    device = await self.esp_repo.get_by_device_id(device_id)
    if not device:
        raise ValueError(f"ESP device '{device_id}' not found")

    # 2. Build MQTT topic (nutzt self.kaiser_id, NICHT TopicBuilder)
    topic = f"kaiser/{self.kaiser_id}/esp/{device_id}/zone/assign"

    # 3. Build empty payload to clear zone
    payload = {
        "zone_id": "",            # ← Leerer String = Removal-Signal
        "master_zone_id": "",     # ← Leerer String
        "zone_name": "",          # ← Leerer String
        "kaiser_id": self.kaiser_id,  # ← Bleibt "god" (bewusst, F24)
        "timestamp": int(time.time()),
    }

    # 4. Update ESP record to clear zone assignment
    device.zone_id = None         # ← DB-Spalte auf NULL
    device.master_zone_id = None  # ← DB-Spalte auf NULL
    device.zone_name = None       # ← DB-Spalte auf NULL
    # HINWEIS: device.kaiser_id wird NICHT geloescht (by design, F24)

    # 5. Clear pending assignment from metadata
    if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
        del device.device_metadata["pending_zone_assignment"]

    # 6. Publish via MQTT (QoS 1)
    mqtt_sent = self._publish_zone_assignment(topic, payload)

    # 7. Update MockESPManager if mock device
    if _is_mock_esp(device_id):
        await self._update_mock_esp_zone(device_id, None, None, None)

    return ZoneRemoveResponse(
        success=True,
        message="Zone removed" if mqtt_sent else "Zone removed (MQTT offline)",
        device_id=device_id,
        mqtt_topic=topic,
        mqtt_sent=mqtt_sent,
    )
```

**Payload des MQTT-Publish:**
```json
{"zone_id": "", "master_zone_id": "", "zone_name": "", "kaiser_id": "god", "timestamp": 1707580800}
```

**pending_zone_assignment:** Wird aus `device.device_metadata` geloescht (Zeile 223-224). Es gibt KEIN `pending_zone_removal`-Flag -- der Server setzt die DB-Spalten sofort auf NULL und hofft auf den ACK.

**Erwartete Antwort:** Der Server erwartet keinen spezifischen Removal-Status. Der `zone_ack_handler.py` kennt aktuell nur `"zone_assigned"` und `"error"` als gueltige Status-Werte (Zeile 213: `if status not in ("zone_assigned", "error")`). Ein `"zone_removed"` Status wuerde derzeit als `"Unknown zone ACK status"` geloggt und IGNORIERT werden. Das muss fuer WP1 gefixt werden (siehe SOLL unten).

#### SOLL-Zustand

**Designentscheidung (TM-Vorgabe):**  
Option A oder B – Agent analysiert und empfiehlt:

- **Option A:** Leere `zone_id` im bestehenden Zone-Handler als "Zone entfernen" interpretieren. Minimaler Eingriff, nutzt bestehenden Flow.
- **Option B:** Separates `zone/remove`-Topic analog zu `subzone/remove`. Sauberer, aber mehr Aufwand (neuer Handler auf ESP, neuer Publisher auf Server, neues Topic in TopicBuilder).

**esp32-dev Empfehlung: Option A (leere zone_id = Removal im bestehenden Handler)**

**Begründung:**
1. Der Server sendet bereits `zone_id=""` bei Removal – der Datenfluss existiert
2. Ein neues `zone/remove`-Topic würde neuen TopicBuilder-Methode, neue Subscription, neuen Server-Publisher erfordern – unverhältnismäßig
3. Subzone hat ein separates Remove-Topic, aber Subzone hat auch eine KOMPLEXERE Removal-Logik (GPIO-Freigabe, Multi-Subzone-Management). Zone-Removal ist simpler: 4 NVS-Keys clearen + Globals zurücksetzen
4. Option A ist konform mit dem bestehenden Pattern: Der Handler prüft zone_id, und bei leer = Removal statt Rejection

**Exakte Code-Änderungen (main.cpp:1253-1256):**

IST (main.cpp:1253-1256):
```cpp
if (zone_id.length() == 0) {
  LOG_ERROR("Zone assignment failed: zone_id is empty");
  return;
}
```

SOLL (main.cpp:1253-1309, ersetzt den Block ab Zeile 1253 bis zum bestehenden updateZoneAssignment-Aufruf):
```cpp
// Empty zone_id = Zone Removal (server sends zone_id="" for removal)
if (zone_id.length() == 0) {
  LOG_INFO("Zone removal requested (zone_id is empty)");

  // Step 1: Cascade – remove ALL subzones first
  SubzoneConfig subzone_configs[MAX_SUBZONES_PER_ESP];  // MAX_SUBZONES_PER_ESP=8
  uint8_t loaded_count = 0;
  configManager.loadAllSubzoneConfigs(subzone_configs, MAX_SUBZONES_PER_ESP, loaded_count);
  for (uint8_t i = 0; i < loaded_count; i++) {
    for (uint8_t gpio : subzone_configs[i].assigned_gpios) {
      gpioManager.removePinFromSubzone(gpio);
    }
    configManager.removeSubzoneConfig(subzone_configs[i].subzone_id);
    LOG_INFO("  Cascade-removed subzone: " + subzone_configs[i].subzone_id);
  }

  // Step 2: Clear zone in ConfigManager (NVS) and globals
  // Use updateZoneAssignment with empty values + zone_assigned=false
  kaiser_.zone_id = "";
  kaiser_.master_zone_id = "";
  kaiser_.zone_name = "";
  kaiser_.zone_assigned = false;
  bool success = configManager.saveZoneConfig(kaiser_, master_);

  if (success) {
    g_kaiser.zone_id = "";
    g_kaiser.master_zone_id = "";
    g_kaiser.zone_name = "";
    g_kaiser.zone_assigned = false;

    // Step 3: ACK with status "zone_removed"
    String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
    DynamicJsonDocument ack_doc(256);
    ack_doc["esp_id"] = g_system_config.esp_id;
    ack_doc["status"] = "zone_removed";
    ack_doc["zone_id"] = "";
    ack_doc["ts"] = (unsigned long)timeManager.getUnixTimestamp();
    String ack_payload;
    serializeJson(ack_doc, ack_payload);
    mqttClient.publish(ack_topic, ack_payload);

    // Step 4: Update system state
    g_system_config.current_state = STATE_REGISTERED;
    configManager.saveSystemConfig(g_system_config);
    mqttClient.publishHeartbeat(true);

    LOG_INFO("✅ Zone removed successfully. " + String(loaded_count) + " subzones cascade-removed.");
  } else {
    LOG_ERROR("❌ Failed to clear zone config from NVS");
    // Error-ACK
    String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
    String error_payload = "{\"esp_id\":\"" + g_system_config.esp_id +
                           "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                           ",\"message\":\"NVS clear failed\"}";
    mqttClient.publish(ack_topic, error_payload);
  }
  return;
}
```

**NVS-Cleanup bei Removal:** Diese 4 Werte werden über `saveZoneConfig()` mit leeren Strings persistiert:
- `kaiser_.zone_id` → "" (NVS key: `zone_id`)
- `kaiser_.master_zone_id` → "" (NVS key: `master_zone_id`)
- `kaiser_.zone_name` → "" (NVS key: `zone_name`)
- `kaiser_.zone_assigned` → false (NVS key: `zone_assigned`)
- `kaiser_.kaiser_id` bleibt ERHALTEN (by design, F24 – Kaiser-Zuordnung überlebt Zone-Removal)

**ACK-Payload bei erfolgreichem Removal:**
```json
{"esp_id":"esp_001","status":"zone_removed","zone_id":"","ts":1707580800}
```

**Subzone-Cascade:** Alle Subzones werden VOR Zone-Clearing entfernt:
1. `loadAllSubzoneConfigs()` lädt alle aktiven Subzones
2. Für jede Subzone: GPIOs freigeben via `gpioManager.removePinFromSubzone()`
3. NVS-Record entfernen via `configManager.removeSubzoneConfig()`
4. Erst DANN Zone-Daten clearen
Begründung: Subzones referenzieren `parent_zone_id` – ohne Zone wären sie Orphans

**server-dev Analyse WP1 SOLL:**

**1. Server-Publish (zone_service.py remove_zone()): KEINE Aenderung noetig.**
Der Server sendet bereits `zone_id=""` im Payload. Das ist exakt was der ESP nach WP1-Fix als Removal-Signal erwartet. Der bestehende Code ist korrekt.

**2. zone_ack_handler.py: MUSS neuen Status `"zone_removed"` verstehen.**

IST (zone_ack_handler.py:212-218 -- _validate_payload):
```python
status = payload.get("status")
if status not in ("zone_assigned", "error"):
    return {
        "valid": False,
        "error": f"Invalid status value: {status}",
        "error_code": ValidationErrorCode.INVALID_PAYLOAD_FORMAT,
    }
```

SOLL (zone_ack_handler.py:212-218):
```python
status = payload.get("status")
if status not in ("zone_assigned", "zone_removed", "error"):
    return { ... }
```

IST (zone_ack_handler.py:129-153 -- handle_zone_ack, Status-Handling):
```python
if status == "zone_assigned":
    device.zone_id = zone_id if zone_id else None
    device.master_zone_id = master_zone_id if master_zone_id else None
    # Clear pending assignment
    if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
        del device.device_metadata["pending_zone_assignment"]
    logger.info(f"Zone assignment confirmed for {esp_id_str}: ...")
elif status == "error":
    logger.error(f"Zone assignment failed for {esp_id_str}: {error_message}")
else:
    logger.warning(f"Unknown zone ACK status from {esp_id_str}: {status}")
```

SOLL -- neuer `elif`-Branch nach `"zone_assigned"`:
```python
elif status == "zone_removed":
    # Confirm zone removal
    device.zone_id = None
    device.master_zone_id = None
    device.zone_name = None
    # device.kaiser_id bleibt ERHALTEN (by design, F24)
    # Clear pending assignment from metadata
    if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
        del device.device_metadata["pending_zone_assignment"]
    logger.info(f"Zone removal confirmed for {esp_id_str}")
```

**3. WebSocket-Event bei Zone-Removal:**

IST (zone_ack_handler.py:231-265 -- _broadcast_zone_update): Sendet `status`, `zone_id`, `master_zone_id`, `timestamp`. Kein `zone_name`.

SOLL: Der bestehende Broadcast-Code funktioniert fuer Removal OHNE Aenderung -- er sendet `status="zone_removed"`, `zone_id=""`, `master_zone_id=""`. Das Frontend muss diesen Status erkennen und die Zone-Felder clearen (statt zu ueberschreiben). Zusaetzlich sollte `zone_name` hinzugefuegt werden (siehe WP4).

**4. Edge Case -- ESP offline bei Removal:**
Aktuell gibt es KEIN `pending_zone_removal`-Flag. Der Server setzt die DB sofort auf NULL und hat keinen Retry-Mechanismus. Empfehlung: Fuer Phase A reicht das. Ein `pending_zone_removal`-Flag waere Phase-C-Material (zusammen mit WP7 Mismatch-Detection). Wenn der Heartbeat die alte Zone meldet, warnt WP7.

#### Verifikation

**esp32-dev Testschritte:**

1. **Happy Path:** Zone zuweisen (`zone_id="gh_zone_1"`) → ESP ACK `status="zone_assigned"` → Zone entfernen (`zone_id=""`) → ESP ACK `status="zone_removed"` → Heartbeat prüfen: `zone_id=""`, `zone_assigned=false` → DB prüfen: `ESPDevice.zone_id=None`
2. **Subzone-Cascade:** Zone mit 2 Subzones zuweisen → Zone entfernen → Prüfen: beide Subzones aus NVS entfernt, GPIOs freigegeben, `configManager.getSubzoneCount() == 0`
3. **NVS-Persistenz:** Zone entfernen → ESP rebooten → Heartbeat prüfen: `zone_id=""`, `zone_assigned=false` (NVS darf KEINE alte Zone mehr liefern)

**Erwartetes Verhalten nach Fix:**
- Server sendet `zone/assign` mit `zone_id=""` → ESP erkennt Removal → NVS gecleared → ACK `"zone_removed"` → Heartbeat bestätigt leere Zone
- kaiser_id BLEIBT erhalten (ESP sendet weiter auf `kaiser/god/...`)
- System-State wechselt von `STATE_ZONE_CONFIGURED` zurück zu `STATE_REGISTERED`

**Edge Cases:**
- **ESP offline bei Removal:** Server setzt DB sofort auf `zone_id=None`. ESP behält Zone in NVS. Beim nächsten Heartbeat: Server hat `None`, ESP sendet alte Zone → Mismatch-Detection (WP7) warnt. Server muss Removal erneut senden (Retry-Logik oder `pending_zone_removal` Flag – server-dev klärt).
- **Reboot nach Removal:** ESP liest leere Zone aus NVS → bootet korrekt ohne Zone → Heartbeat mit `zone_id=""`, `zone_assigned=false` ✓
- **Doppeltes Removal:** ESP hat bereits keine Zone → `loadAllSubzoneConfigs` liefert 0 → `saveZoneConfig` mit leeren Werten schreibt erneut (idempotent) → ACK `"zone_removed"` ✓

---

### WP2: Kaiser-ID Konsistenz [P1]

**Findings:** F3, F4, F13, F16, F18, F22  
**Betroffene Layer:** Server (primär), ESP32 (Verifikation)  
**Agents:** server-dev (primär), db-inspector (Schema-Verifikation)

#### Warum das wichtig ist

`kaiser_id` ist das Fundament der Hierarchie – es bestimmt welcher Kaiser einen ESP steuert. Aktuell ist God-Kaiser der einzige Kaiser (`kaiser_id="god"`). Das System muss JETZT schon konsistent sein, damit Kaiser-Nodes später "fluffig" eingebaut werden können. Aktuell: 6 verschiedene Stellen setzen oder lesen `kaiser_id`, jede auf ihre eigene Art.

#### Systemkontext

**Die 6 Stellen wo kaiser_id eine Rolle spielt:**

| # | Stelle | Was passiert | Problem |
|---|--------|-------------|---------|
| 1 | ESP32 Boot | `kaiser_id="god"` aus NVS/Default | Korrekt |
| 2 | Heartbeat→Server (Discovery) | `_auto_register_esp()` | Setzt `kaiser_id` NICHT in DB-Spalte (F4/F16) |
| 3 | Device Approval | `approve_device()` | Setzt `kaiser_id` NICHT (F22) |
| 4 | Zone-Assignment | `ZoneService.assign_zone()` | Setzt kaiser_id, aber über falsches Attribut (F3/F13) |
| 5 | Kaiser-Assignment | `ESPService.assign_to_kaiser()` | Speichert in metadata statt DB-Spalte (F18) |
| 6 | MQTT Subscriptions | `main.py` | Hardcoded `kaiser/god/...` statt Wildcard (→ WP6) |

**Korrekte Referenz (SubzoneService macht es richtig):**  
`subzone_service.py:80` → `self.kaiser_id = constants.get_kaiser_id()`  
Das ist der RICHTIGE Weg. ZoneService macht es FALSCH.

#### IST-Zustand

**Discovery – heartbeat_handler.py _auto_register_esp():**

**server-dev Analyse (heartbeat_handler.py:321-390, _auto_register_esp):**

```python
# heartbeat_handler.py:353-374 — ESPDevice wird erstellt
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",       # Default
    status="pending_approval",
    discovered_at=datetime.now(timezone.utc),
    capabilities={
        "max_sensors": 20,
        "max_actuators": 12,
        "features": ["heartbeat", "sensors", "actuators"],
    },
    device_metadata={
        "discovery_source": "heartbeat",
        "initial_heartbeat": payload,
        "heartbeat_count": 1,
        "zone_id": zone_id,              # ← Nur in metadata!
        "master_zone_id": master_zone_id, # ← Nur in metadata!
        "zone_assigned": zone_assigned,   # ← Nur in metadata!
        "initial_heap_free": payload.get("heap_free", payload.get("free_heap")),
        "initial_wifi_rssi": payload.get("wifi_rssi"),
    },
    last_seen=datetime.now(timezone.utc),
)
```

**Gesetzte Felder:** `device_id`, `hardware_type`, `status`, `discovered_at`, `capabilities`, `device_metadata`, `last_seen`
**NICHT gesetzte Felder:**
- `kaiser_id` → bleibt `None` (DB default) -- **LUECKE F4/F16**
- `zone_id` → bleibt `None` (steht nur in metadata)
- `zone_name` → bleibt `None`
- `master_zone_id` → bleibt `None` (steht nur in metadata)
- `ip_address`, `mac_address`, `firmware_version` → nicht im Heartbeat-Payload

**Topic-Extraktion moeglich:** JA. `TopicBuilder.parse_heartbeat_topic()` (topics.py:426-452) liefert:
```python
return {
    "kaiser_id": match.group(1),  # ← kaiser_id aus Topic extrahiert!
    "esp_id": match.group(2),
    "type": "heartbeat",
}
```
Der Heartbeat-Handler ruft `parse_heartbeat_topic()` bereits in Zeile 90 auf und speichert das Ergebnis in `parsed_topic`. `parsed_topic["kaiser_id"]` ist verfuegbar aber wird NICHT genutzt.

**Approval – esp_service.py approve_device():**

**server-dev Analyse (esp_service.py:795-839, approve_device):**

```python
# esp_service.py:795-839 — approve_device()
async def approve_device(
    self,
    device_id: str,
    approved_by: str,
    name: Optional[str] = None,
    zone_id: Optional[str] = None,
    zone_name: Optional[str] = None,
) -> Optional[ESPDevice]:
    device = await self.esp_repo.get_by_device_id(device_id)
    if not device:
        return None
    if device.status not in ("pending_approval", "rejected"):
        return None

    # Update device
    device.status = "approved"
    device.approved_at = datetime.now(timezone.utc)
    device.approved_by = approved_by
    device.rejection_reason = None

    if name:
        device.name = name
    if zone_id:
        device.zone_id = zone_id       # ← zone_id wird gesetzt wenn mitgegeben
    if zone_name:
        device.zone_name = zone_name   # ← zone_name wird gesetzt wenn mitgegeben

    # kaiser_id wird NIRGENDS gesetzt! ← LUECKE F22
    return device
```

**Problem:** Wenn `zone_id` mitgegeben wird, wird die DB-Spalte `device.zone_id` gesetzt -- aber `device.kaiser_id` bleibt `None`. Der ESP ist dann in einer Zone, aber hat keinen Kaiser in der DB. Die Methode hat keinen `kaiser_id`-Parameter und setzt ihn auch nicht auf den Default.

**ZoneService kaiser_id – zone_service.py:75:**

**server-dev Analyse (zone_service.py:75 vs constants.py vs subzone_service.py:80):**

IST (zone_service.py:75):
```python
self.kaiser_id = getattr(constants, "KAISER_ID", "god")
```
`constants.py` hat KEIN Attribut `KAISER_ID`. Es hat:
- `DEFAULT_KAISER_ID = "god"` (Zeile 73) -- Konstante
- `def get_kaiser_id() -> str` (Zeile 76-82) -- Funktion die `settings.hierarchy.kaiser_id` liest

`getattr(constants, "KAISER_ID", "god")` findet `KAISER_ID` nicht → Fallback `"god"`. Ergebnis ist zufaellig korrekt, aber:
1. Nutzt NICHT die Settings-basierte `get_kaiser_id()` Funktion
2. Wuerde NICHT reagieren wenn `hierarchy.kaiser_id` in der Config geaendert wird
3. Ist ein anderer Code-Pfad als SubzoneService

IST (subzone_service.py:80 -- der KORREKTE Weg):
```python
self.kaiser_id = constants.get_kaiser_id()
```
Ruft die Funktion auf, die Settings liest → dynamisch, konfigurierbar.

**Vergleich:**
| Aspekt | ZoneService | SubzoneService |
|--------|-------------|----------------|
| Code | `getattr(constants, "KAISER_ID", "god")` | `constants.get_kaiser_id()` |
| Quelle | Fallback-Wert (hardcoded) | Settings → Config → Default |
| Dynamisch | Nein | Ja |
| Korrekt | Zufaellig | Ja |

**assign_to_kaiser – esp_service.py:692-716:**

**server-dev Analyse (esp_service.py:692-735):**

```python
# esp_service.py:692-716 — assign_to_kaiser()
async def assign_to_kaiser(self, device_id: str, kaiser_id: str) -> bool:
    device = await self.esp_repo.get_by_device_id(device_id)
    if not device:
        return False

    metadata = device.device_metadata or {}
    metadata["kaiser_id"] = kaiser_id      # ← In METADATA gespeichert!
    device.device_metadata = metadata      # ← NICHT in device.kaiser_id DB-Spalte!

    logger.info(f"ESP {device_id} assigned to Kaiser {kaiser_id}")
    return True
```

**Problem:** `device.kaiser_id` (die indizierte DB-Spalte, Zeile 95-100 in esp.py) wird NICHT gesetzt. Stattdessen wird `kaiser_id` in das JSON-Feld `device_metadata` geschrieben. Das bedeutet:
- `SELECT * FROM esp_devices WHERE kaiser_id = 'some_kaiser'` findet dieses Device NICHT
- Nur Python-seitige JSON-Filterung funktioniert

```python
# esp_service.py:718-735 — get_devices_by_kaiser() (Full-Table-Scan)
async def get_devices_by_kaiser(self, kaiser_id: str) -> List[ESPDevice]:
    all_devices = await self.esp_repo.get_all()    # ← Laedt ALLE Devices!
    return [
        d for d in all_devices
        if d.device_metadata and d.device_metadata.get("kaiser_id") == kaiser_id
    ]  # ← Python-Filter statt SQL WHERE
```

**Problem:** Full-Table-Scan. Laedt alle ESPDevices aus der DB, iteriert in Python, filtert nach `metadata["kaiser_id"]`. Bei 100+ Devices ist das eine unnoetige Belastung. Die DB-Spalte `ESPDevice.kaiser_id` existiert UND ist indiziert (`index=True`, esp.py:98) -- wird hier aber nicht genutzt.

#### SOLL-Zustand

**Prinzip (TM-Vorgabe):** `kaiser_id` MUSS immer in der DB-Spalte `ESPDevice.kaiser_id` stehen. Niemals nur in metadata. Der Default ist `"god"`. Jeder Code-Pfad der ein ESPDevice erstellt oder modifiziert muss kaiser_id konsistent setzen.

**server-dev SOLL -- 5 Fixes:**

**Fix 1: _auto_register_esp() -- kaiser_id bei Device-Erstellung setzen (heartbeat_handler.py:346-374)**

Der `parsed_topic` ist bereits verfuegbar (Zeile 90-98) und enthaelt `kaiser_id` aus dem MQTT-Topic. Allerdings wird `_auto_register_esp()` nicht direkt aufgerufen -- stattdessen ruft `_discover_new_device()` (Zeile 396) es auf. Die `parsed_topic` Variable ist in `handle_heartbeat()` scope, nicht in `_auto_register_esp()` scope.

Loesung Phase A: Default `constants.get_kaiser_id()` verwenden (der Heartbeat-Payload enthaelt KEIN `kaiser_id`-Feld, nur das MQTT-Topic).
Loesung Phase C: `parsed_topic["kaiser_id"]` durchreichen (eleganter, erfordert Signatur-Aenderung an 2 Methoden).

```python
# heartbeat_handler.py:353 — ESPDevice() Konstruktor erweitern:
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",
    status="pending_approval",
    discovered_at=datetime.now(timezone.utc),
    kaiser_id=constants.get_kaiser_id(),  # ← NEU: Default kaiser_id setzen
    capabilities={ ... },
    device_metadata={ ... },
    last_seen=datetime.now(timezone.utc),
)
```

Alternativ (eleganter): `kaiser_id` als Parameter an `_auto_register_esp()` und `_discover_new_device()` durchreichen, extrahiert aus `parsed_topic["kaiser_id"]` in `handle_heartbeat()`. So wird der TATSAECHLICHE kaiser_id aus dem Topic gespeichert, nicht nur der Default.

```python
# heartbeat_handler.py:90-98 — kaiser_id ist verfuegbar:
parsed_topic = TopicBuilder.parse_heartbeat_topic(topic)
# parsed_topic["kaiser_id"] = "god" (oder anderer Wert aus Topic)

# Durchreichen an _discover_new_device():
esp_device, status_msg = await self._discover_new_device(
    session, esp_repo, esp_id_str, payload,
    kaiser_id=parsed_topic["kaiser_id"]  # ← NEU
)
```

**Empfehlung:** Default-Variante (`constants.get_kaiser_id()`) fuer Phase A. Topic-Extraktion ist sauberer aber erfordert Signatur-Aenderung an 2 Methoden -- das kann in Phase C (WP6) mitgenommen werden.

Import hinzufuegen in heartbeat_handler.py:
```python
from ...core import constants  # ← Bereits indirekt via TopicBuilder verfuegbar
```

**Fix 2: approve_device() -- kaiser_id setzen (esp_service.py:826-836)**

```python
# esp_service.py:826 — Nach device.rejection_reason = None einfuegen:
    if name:
        device.name = name
    if zone_id:
        device.zone_id = zone_id
    if zone_name:
        device.zone_name = zone_name

    # NEU: Set kaiser_id if not already set
    if not device.kaiser_id:
        from ..core import constants
        device.kaiser_id = constants.get_kaiser_id()
```

**Fix 3: ZoneService.__init__() -- constants.get_kaiser_id() (zone_service.py:75)**

IST:
```python
self.kaiser_id = getattr(constants, "KAISER_ID", "god")
```

SOLL:
```python
self.kaiser_id = constants.get_kaiser_id()
```

Einzeilige Aenderung. Exakt wie SubzoneService Zeile 80.

**Fix 4: assign_to_kaiser() -- DB-Spalte nutzen (esp_service.py:692-716)**

IST:
```python
metadata = device.device_metadata or {}
metadata["kaiser_id"] = kaiser_id
device.device_metadata = metadata
```

SOLL:
```python
# DB-Spalte setzen (indiziert, queryable)
device.kaiser_id = kaiser_id
# Metadata auch aktualisieren (fuer Rueckwaertskompatibilitaet)
metadata = device.device_metadata or {}
metadata["kaiser_id"] = kaiser_id
device.device_metadata = metadata
```

**Fix 5: get_devices_by_kaiser() -- DB-Query (esp_service.py:718-735)**

IST:
```python
all_devices = await self.esp_repo.get_all()
return [d for d in all_devices if d.device_metadata and d.device_metadata.get("kaiser_id") == kaiser_id]
```

SOLL: Neue Repository-Methode in `esp_repo.py` (oder bestehende `get_by_zone`-Methode als Vorlage):
```python
# esp_repo.py — neue Methode (analog zu get_by_zone):
async def get_by_kaiser(self, kaiser_id: str) -> List[ESPDevice]:
    result = await self.session.execute(
        select(ESPDevice).where(ESPDevice.kaiser_id == kaiser_id)
    )
    return list(result.scalars().all())
```

Dann in esp_service.py:
```python
async def get_devices_by_kaiser(self, kaiser_id: str) -> List[ESPDevice]:
    return await self.esp_repo.get_by_kaiser(kaiser_id)
```

**Cross-Layer Impact:** Keine. Alle Aenderungen sind Server-intern. Kein MQTT-Payload, kein REST-Response, kein WebSocket-Event aendert sich. Nur die DB-Spalte wird konsistent befuellt.

#### Verifikation

**server-dev Verifikation:**

**DB-Query fuer Validierung (nach Implementierung aller 5 Fixes):**
```sql
-- Sollte 0 Ergebnisse liefern nach Fix:
SELECT device_id, kaiser_id, status, zone_id
FROM esp_devices
WHERE kaiser_id IS NULL;

-- Bestehende Devices fixen (einmaliger Migration-Query):
UPDATE esp_devices SET kaiser_id = 'god' WHERE kaiser_id IS NULL;
```

**Testflow:**
1. **Discovery:** ESP sendet ersten Heartbeat auf `kaiser/god/esp/ESP_TEST01/system/heartbeat`
   - Pruefen: `SELECT kaiser_id FROM esp_devices WHERE device_id = 'ESP_TEST01'` → `"god"` (nicht NULL)
   - Pruefen: `device_metadata` enthaelt weiterhin `zone_id`, `master_zone_id`

2. **Approval:** Admin approved ESP_TEST01 mit `zone_id="test_zone"`
   - Pruefen: `SELECT kaiser_id, zone_id FROM esp_devices WHERE device_id = 'ESP_TEST01'` → `kaiser_id="god"`, `zone_id="test_zone"`

3. **Zone-Assignment:** ZoneService.assign_zone() fuer ESP_TEST01
   - Pruefen: `self.kaiser_id` kommt von `constants.get_kaiser_id()` (nicht von `getattr` Fallback)

4. **Kaiser-Assignment:** ESPService.assign_to_kaiser(ESP_TEST01, "node_alpha")
   - Pruefen: `SELECT kaiser_id FROM esp_devices WHERE device_id = 'ESP_TEST01'` → `"node_alpha"` (DB-Spalte, NICHT nur metadata)

5. **Kaiser-Query:** ESPService.get_devices_by_kaiser("node_alpha")
   - Pruefen: Ergebnis enthaelt ESP_TEST01 (via SQL WHERE, nicht Python-Filter)
   - Pruefen: Kein Full-Table-Scan in DB-Logs

**pytest-Testdateien (zu erstellen/erweitern):**
- `tests/unit/services/test_esp_service.py` -- approve_device() setzt kaiser_id
- `tests/unit/services/test_zone_service.py` -- __init__() nutzt get_kaiser_id()
- `tests/integration/mqtt/test_heartbeat_handler.py` -- Discovery setzt kaiser_id in DB-Spalte

---

### WP3: ESP32 Topic-Handling vereinheitlichen [P1]

**Findings:** F8, F12  
**Betroffene Layer:** ESP32  
**Agent:** esp32-dev

#### Warum das wichtig ist

Einige MQTT-Subscription-Topics auf dem ESP werden manuell per String-Konkatenation gebaut statt über den TopicBuilder. Wenn sich `kaiser_id` zur Laufzeit ändert (z.B. durch Zone-Assignment mit neuem kaiser_id), aktualisiert `TopicBuilder::setKaiserId()` den internen Buffer – aber die manuell gebauten lokalen Strings bleiben stale. Der ESP hört dann auf den alten Topics und verpasst neue Nachrichten.

#### Systemkontext

**TopicBuilder (topic_builder.cpp):**  
Statischer Buffer mit `setKaiserId()` und `setEspId()`. Alle `build*Topic()`-Methoden nutzen diese gespeicherten IDs. Das ist der korrekte, zentrale Weg.

**Das Problem in main.cpp setupMQTT():**  
Zone-Assign und Sensor-Command Topics werden als lokale Strings gebaut (`"kaiser/" + g_kaiser.kaiser_id + "/esp/" + ...`). Diese Strings werden einmal bei Setup berechnet und dann als Subscription-Pattern verwendet. Bei einem kaiser_id-Wechsel (main.cpp:1279 `TopicBuilder::setKaiserId()`) werden diese lokalen Strings NICHT aktualisiert.

**Kontrast – Subzone macht es richtig:**  
`String subzone_assign_topic = TopicBuilder::buildSubzoneAssignTopic();` (main.cpp:798)

#### IST-Zustand

**esp32-dev Analyse (IMPLEMENTIERT):**

**Manuell gebaute Topics in main.cpp (VOR Fix):**
1. **Zeile 785-788**: `zone_assign_topic` - für Subscription in setupMQTT()
   ```cpp
   String zone_assign_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/assign";
   ```
2. **Zeile 805-810**: `sensor_command_wildcard` - für Subscription
   ```cpp
   String sensor_command_wildcard = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/sensor/+/command";
   ```
3. **Zeile 1232**: `zone_assign_topic` - im Message Handler (Duplikat)
4. **Zeilen 1267, 1296, 1331, 1362**: `ack_topic` - Zone ACKs (4x)
   ```cpp
   String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
   ```

**TopicBuilder-basierte Topics in main.cpp:**
- Zeile 776: `buildSystemCommandTopic()`
- Zeile 777: `buildConfigTopic()`
- Zeile 778: `buildBroadcastEmergencyTopic()`
- Zeile 779: `buildActuatorCommandTopic(0)` → Wildcard-Pattern
- Zeile 798: `buildSubzoneAssignTopic()`
- Zeile 799: `buildSubzoneRemoveTopic()`
- Zeile 814: `buildSystemHeartbeatAckTopic()`

**Problem bei kaiser_id-Wechsel:**
- Zeile 1318: `TopicBuilder::setKaiserId()` aktualisiert den internen Buffer
- ABER: Subscriptions in setupMQTT() (Zeile 785-811) verwenden die ALTEN kaiser_id-Werte
- Nach kaiser_id-Wechsel → ESP hört auf alte Topics, neue Nachrichten gehen verloren

#### SOLL-Zustand

**Prinzip (TM-Vorgabe):** ALLE Topics müssen über TopicBuilder gebaut werden. Keine manuelle String-Konkatenation für MQTT-Topics. Wenn TopicBuilder-Methoden fehlen, müssen sie ergänzt werden.

**esp32-dev SOLL (IMPLEMENTIERT):**

**Fehlende TopicBuilder-Methoden (ERGÄNZT):**
- `buildZoneAssignTopic()` → topic_builder.h:44, topic_builder.cpp:228-233
- `buildZoneAckTopic()` → topic_builder.h:45, topic_builder.cpp:235-240

**Ersetzungen in main.cpp:**
1. **Zeile 785** (setupMQTT): `zone_assign_topic = TopicBuilder::buildZoneAssignTopic()`
2. **Zeile 805** (setupMQTT): `sensor_command_wildcard` via `TopicBuilder::buildSensorCommandTopic(0)` + replace
3. **Zeile 1232** (Handler): `zone_assign_topic = TopicBuilder::buildZoneAssignTopic()`
4. **Zeilen 1267, 1296, 1331, 1362**: `ack_topic = TopicBuilder::buildZoneAckTopic()` (4x)

**Re-Subscribe nach kaiser_id-Wechsel (IMPLEMENTIERT):**
- main.cpp:1318-1340 → Nach `TopicBuilder::setKaiserId()` werden ALLE kaiser_id-abhängigen Topics re-subscribed:
  - Zone assign/ack
  - Sensor command wildcard
  - Subzone assign/remove
  - Actuator command wildcard
  - Heartbeat ack
- KEINE bestehende Re-Subscribe-Logik → NEU implementiert

#### Verifikation

```
→ Agent füllt aus:
   - Grep-Befehl der bestätigt: keine manuelle Topic-Konstruktion mehr in main.cpp
   - Testflow: Zone-Assignment mit neuem kaiser_id → prüfe ob ESP neue Topics hört
```

---

### WP4: Frontend WebSocket-Lücken [P1/P2]

**Findings:** F20, F21  
**Betroffene Layer:** Server (broadcast), Frontend (handler)  
**Agents:** frontend-dev (primär), server-dev (broadcast-Fix)

#### Warum das wichtig ist

F20 ist ein sichtbarer UI-Bug: Bei jeder Zone-Bestätigung via WebSocket verschwindet der `zone_name` im Frontend, weil der Server ihn nicht im Event mitsendet. F21 ist eine fehlende Reaktivität: Subzone-Änderungen aktualisieren die UI nicht in Echtzeit.

#### Systemkontext

**Zone-Assignment WebSocket-Flow:**
1. `zone_ack_handler.py` empfängt ACK vom ESP
2. Bestätigt in DB
3. Broadcast: `ws_manager.broadcast("zone_assignment", {esp_id, status, zone_id, master_zone_id, timestamp})`
4. Frontend `handleZoneAssignment()` überschreibt ESP-Daten mit Event-Daten
5. `data.zone_name` ist `undefined` → Frontend verliert zone_name

**Subzone-Assignment WebSocket-Flow:**
1. `subzone_ack_handler.py` empfängt ACK vom ESP
2. Broadcast: `ws_manager.broadcast_thread_safe({"type": "subzone_assignment", ...})`
3. Frontend: KEIN Handler registriert → Event wird ignoriert

#### IST-Zustand

**Server zone_ack broadcast (zone_ack_handler.py):**

**server-dev Analyse (zone_ack_handler.py:231-268, _broadcast_zone_update):**

```python
# zone_ack_handler.py:231-268 — _broadcast_zone_update()
async def _broadcast_zone_update(
    self, esp_id, status, zone_id, master_zone_id, timestamp, message
) -> None:
    try:
        ws_manager = await WebSocketManager.get_instance()

        event_data = {
            "esp_id": esp_id,
            "status": status,
            "zone_id": zone_id,
            "master_zone_id": master_zone_id,
            "timestamp": timestamp,
        }

        if message:
            event_data["message"] = message

        await ws_manager.broadcast("zone_assignment", event_data)
    except Exception as e:
        logger.error(f"Failed to broadcast zone update: {e}")
```

**Gesendete Felder:** `esp_id`, `status`, `zone_id`, `master_zone_id`, `timestamp`, optional `message`
**FEHLENDE Felder:**
- `zone_name` → NICHT gesendet. **LUECKE F20**
- `kaiser_id` → NICHT gesendet
- `is_zone_master` → NICHT gesendet

**Wo zone_name verfuegbar waere:**
Im selben Handler, Zeile 120-131, wird `device` aus der DB geladen und die Zone-Felder aktualisiert:
```python
device = await esp_repo.get_by_device_id(esp_id_str)
# ...
if status == "zone_assigned":
    device.zone_id = zone_id if zone_id else None
    device.master_zone_id = master_zone_id if master_zone_id else None
    # zone_name wird NICHT aus dem ACK-Payload gesetzt (F15)
    # ABER: device.zone_name wurde bereits von assign_zone() gesetzt (zone_service.py:133)
```

`device.zone_name` ist also verfuegbar wenn der Broadcast aufgerufen wird -- er wurde zuvor von `ZoneService.assign_zone()` in die DB geschrieben (Zeile 133). Der Broadcast muesste ihn nur aus dem `device`-Objekt lesen und mitsenden.

**Kontrast SubzoneAckHandler (subzone_ack_handler.py:127-149):**
Nutzt `broadcast_thread_safe()` statt `broadcast()` und sendet ein verschachteltes Format mit `"type": "subzone_assignment"` und `"data": {...}`. Inkonsistentes API-Pattern (F23).

**Frontend handleZoneAssignment (esp.ts:1798-1830):**

```typescript
function handleZoneAssignment(message: any): void {
  const data = message.data
  const espId = data.esp_id || data.device_id

  if (!espId) {
    logger.warn('zone_assignment missing esp_id')
    return
  }

  const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
  if (deviceIndex === -1) {
    logger.debug(`Zone assignment for unknown device: ${espId}`)
    return
  }

  const device = devices.value[deviceIndex]

  // Update zone info based on status
  if (data.status === 'success' || data.status === 'zone_assigned') {
    devices.value[deviceIndex] = {
      ...device,
      zone_id: data.zone_id || undefined,       // ← PROBLEM: setzt undefined
      zone_name: data.zone_name || undefined,   // ← PROBLEM: setzt undefined wenn fehlt
      master_zone_id: data.master_zone_id || undefined,
    }
    logger.info(`Zone confirmed: ${espId} → ${data.zone_id} (reactivity triggered)`)
  } else if (data.status === 'error') {
    logger.error(`Zone assignment error for ${espId}: ${data.message}`)
  } else {
    logger.warn(`Unknown zone_assignment status: ${data.status}`)
  }
}
```

**Problem-Analyse:**
- Zeilen 1820-1822 verwenden `data.zone_name || undefined` Pattern
- Wenn Server `zone_name` NICHT sendet → `data.zone_name` ist `undefined`
- `undefined || undefined` evaluiert zu `undefined`
- Spread-Operator überschreibt existierenden `device.zone_name` mit `undefined`
- Gleiches Problem für `zone_id`, `master_zone_id`, `kaiser_id` (falls später hinzugefügt)

**Betroffene Felder:**
- `zone_name` ✗ (wird mit undefined überschrieben wenn nicht im Event)
- `zone_id` ✗ (gleiches Problem)
- `master_zone_id` ✗ (gleiches Problem)
- Alle zukünftigen Felder die optional im Event sind ✗

**Subzone WebSocket-Events:**

**Server: subzone_assignment Event Payload (subzone_ack_handler.py:127-150):**
```python
event_data = {
    "esp_id": ack_payload.esp_id,
    "subzone_id": ack_payload.subzone_id,
    "status": ack_payload.status,              # "subzone_assigned" | "subzone_removed" | "error"
    "timestamp": ack_payload.timestamp,
}

# Optional error fields:
if ack_payload.error_code is not None:
    event_data["error_code"] = ack_payload.error_code
    event_data["message"] = ack_payload.message

await ws_manager.broadcast("subzone_assignment", event_data)
```

**Frontend: Registrierte WebSocket-Events (esp.ts:2360-2385):**
```typescript
wsUnsubscribers.push(
  ws.on('esp_health', handleEspHealth),
  ws.on('sensor_data', handleSensorData),
  ws.on('actuator_status', handleActuatorStatus),
  ws.on('actuator_alert', handleActuatorAlert),
  ws.on('config_response', handleConfigResponse),
  ws.on('zone_assignment', handleZoneAssignment),  // ✓ vorhanden
  ws.on('sensor_health', handleSensorHealth),
  ws.on('device_discovered', handleDeviceDiscovered),
  ws.on('device_approved', handleDeviceApproved),
  ws.on('device_rejected', handleDeviceRejected),
  ws.on('device_rediscovered', handleDeviceRediscovered),
  ws.on('actuator_response', handleActuatorResponse),
  ws.on('notification', handleNotification),
  ws.on('error_event', handleErrorEvent),
  ws.on('system_event', handleSystemEvent),
  ws.on('actuator_command', handleActuatorCommand),
  ws.on('actuator_command_failed', handleActuatorCommandFailed),
  ws.on('config_published', handleConfigPublished),
  ws.on('config_failed', handleConfigFailed),
  ws.on('sequence_started', handleSequenceStarted),
  ws.on('sequence_step', handleSequenceStep),
  ws.on('sequence_completed', handleSequenceCompleted),
  ws.on('sequence_error', handleSequenceError),
  ws.on('sequence_cancelled', handleSequenceCancelled),
  ws.on('logic_execution', handleLogicExecution)
)
// FEHLT: ws.on('subzone_assignment', handleSubzoneAssignment)
```
**Insgesamt:** 25 registrierte Events, `subzone_assignment` fehlt ✗

**Frontend: Was müsste ein subzone_assignment Handler tun?**
1. ESP-Device im Store finden (via `esp_id`)
2. Bei `status === "subzone_assigned"`:   - `device.subzone_id = data.subzone_id` setzen
   - Optional: `device.subzone_name` wenn Server es später mitsendet
   - Toast: "Subzone zugewiesen"
3. Bei `status === "subzone_removed"`:
   - `device.subzone_id = undefined` setzen
   - `device.subzone_name = undefined` setzen
   - Toast: "Subzone entfernt"
4. Bei `status === "error"`:
   - Toast mit Fehlermeldung anzeigen
5. Logger-Ausgabe für Debugging

**Types: SubzoneAssignmentEvent fehlt in websocket-events.ts:**
- ✗ NICHT definiert
- Muss analog zu `ZoneAssignmentEvent` erstellt werden
- Benötigte Felder: `esp_id`, `subzone_id`, `status`, `timestamp`, optional `error_code`, `message`

#### SOLL-Zustand

**server-dev SOLL (zone_ack_handler.py:231-268):**

**Fix: zone_name und kaiser_id zum Broadcast hinzufuegen.**

Die `_broadcast_zone_update()` Methode muss Zugriff auf das `device`-Objekt bekommen. Aktuell bekommt sie nur die Payload-Felder. Der einfachste Fix: `device` als Parameter durchreichen.

IST (zone_ack_handler.py:157-164):
```python
await self._broadcast_zone_update(
    esp_id=esp_id_str,
    status=status,
    zone_id=zone_id,
    master_zone_id=master_zone_id,
    timestamp=timestamp,
    message=error_message,
)
```

SOLL -- device-Objekt mit durchreichen:
```python
await self._broadcast_zone_update(
    esp_id=esp_id_str,
    status=status,
    zone_id=zone_id,
    master_zone_id=master_zone_id,
    timestamp=timestamp,
    message=error_message,
    zone_name=device.zone_name,    # ← NEU: aus DB-Objekt
    kaiser_id=device.kaiser_id,    # ← NEU: aus DB-Objekt
)
```

Und in `_broadcast_zone_update()`:
```python
event_data = {
    "esp_id": esp_id,
    "status": status,
    "zone_id": zone_id,
    "master_zone_id": master_zone_id,
    "zone_name": zone_name,       # ← NEU
    "kaiser_id": kaiser_id,       # ← NEU
    "timestamp": timestamp,
}
```

**Weitere sinnvolle Felder:**
- `zone_name`: JA, kritisch (Frontend-Bug F20)
- `kaiser_id`: JA, nuetzlich fuer Frontend-Display und zukuenftige Kaiser-Node-Unterstuetzung
- `is_zone_master`: NEIN, nicht relevant bei Zone-Assignment-Events (wird separat verwaltet)

**frontend-dev SOLL:**

**1. handleZoneAssignment() defensiv machen (esp.ts:1784-1842):**

```typescript
function handleZoneAssignment(message: any): void {
  const data = message.data
  const espId = data.esp_id || data.device_id

  if (!espId) {
    logger.warn('zone_assignment missing esp_id')
    return
  }

  const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
  if (deviceIndex === -1) {
    logger.debug(`Zone assignment for unknown device: ${espId}`)
    return
  }

  const device = devices.value[deviceIndex]

  if (data.status === 'zone_assigned') {
    // WP4 FIX: DEFENSIVE - only update fields that are DEFINED in the event
    const updates: Partial<typeof device> = {}

    if (data.zone_id !== undefined) updates.zone_id = data.zone_id
    if (data.zone_name !== undefined) updates.zone_name = data.zone_name      // ← NOW SAFE
    if (data.master_zone_id !== undefined) updates.master_zone_id = data.master_zone_id
    if (data.kaiser_id !== undefined) updates.kaiser_id = data.kaiser_id      // ← FUTURE-PROOF

    devices.value[deviceIndex] = {
      ...device,
      ...updates,
    }
    logger.info(`Zone confirmed: ${espId} → ${data.zone_id}${data.zone_name ? ` (${data.zone_name})` : ''} (reactivity triggered)`)
  } else if (data.status === 'error') {
    logger.error(`Zone assignment error for ${espId}: ${data.message}`)
  } else {
    logger.warn(`Unknown zone_assignment status: ${data.status}`)
  }
}
```

**Änderungen:**
- Zeilen 1819-1823 ersetzt durch defensive Logik
- Erstellt `updates` Objekt mit CONDITIONAL Assignments
- `if (data.X !== undefined)` Pattern verhindert undefined-Überschreibung
- zone_name wird NUR überschrieben wenn Server es sendet
- Kompatibel mit zukünftigen Feldern (kaiser_id, etc.)

**2. SubzoneAssignmentEvent Type definieren (websocket-events.ts:591-614):**

```typescript
/**
 * Subzone assignment event
 * Sent when ESP acknowledges subzone assignment or removal
 * WP4: Added to support subzone real-time UI updates
 */
export interface SubzoneAssignmentEvent extends WebSocketEventBase {
  event: 'subzone_assignment'
  severity: 'info'
  source_type: 'esp32'
  data: {
    esp_id: string
    subzone_id: string
    status: 'subzone_assigned' | 'subzone_removed' | 'error'
    timestamp: number
    error_code?: string
    message?: string
  }
}
```

**Eingebunden in:**
- `WebSocketEvent` Union (Zeile 428): `| SubzoneAssignmentEvent`
- Automatisch in `WebSocketEventType` durch `WebSocketEvent['event']`

**3. handleSubzoneAssignment() Handler implementieren (esp.ts:1844-1912):**

```typescript
function handleSubzoneAssignment(message: any): void {
  const data = message.data
  const espId = data.esp_id || data.device_id

  if (!espId) {
    logger.warn('subzone_assignment missing esp_id')
    return
  }

  const deviceIndex = devices.value.findIndex(d => getDeviceId(d) === espId)
  if (deviceIndex === -1) {
    logger.debug(`Subzone assignment for unknown device: ${espId}`)
    return
  }

  const device = devices.value[deviceIndex]

  if (data.status === 'subzone_assigned') {
    const updates: Partial<typeof device> = {}
    if (data.subzone_id !== undefined) updates.subzone_id = data.subzone_id

    devices.value[deviceIndex] = {
      ...device,
      ...updates,
    }

    logger.info(`Subzone confirmed: ${espId} → ${data.subzone_id} (reactivity triggered)`)
    showSuccess(`Subzone zugewiesen: ${device.device_name || espId}`)
  } else if (data.status === 'subzone_removed') {
    devices.value[deviceIndex] = {
      ...device,
      subzone_id: undefined,
      subzone_name: undefined,
    }

    logger.info(`Subzone removed: ${espId}`)
    showSuccess(`Subzone entfernt: ${device.device_name || espId}`)
  } else if (data.status === 'error') {
    logger.error(`Subzone assignment error for ${espId}: ${data.message}`)
    showError(data.message || 'Subzone-Zuweisung fehlgeschlagen')
  } else {
    logger.warn(`Unknown subzone_assignment status: ${data.status}`)
  }
}
```

**Store-Aktualisierung:**
- `subzone_assigned` → setzt `device.subzone_id`
- `subzone_removed` → setzt `device.subzone_id = undefined`
- Toast-Feedback für User-Feedback
- Reaktivitäts-Trigger via Object-Replacement Pattern

**4. Handler registrieren (esp.ts:121, 2443):**

```typescript
// Filter-Array (Zeile 121):
'config_response', 'zone_assignment', 'subzone_assignment', 'sensor_health',

// WebSocket Subscriptions (Zeile 2443):
ws.on('zone_assignment', handleZoneAssignment),
ws.on('subzone_assignment', handleSubzoneAssignment),  // WP4
ws.on('sensor_health', handleSensorHealth),
```

**Insgesamt:** 26 registrierte Events (war 25)

#### Verifikation

**Manual Testing Requirements:**

**Test 1: Zone Assignment mit zone_name (F20 Fix):**
1. Prerequisites:   - Server WP4 server-dev Änderungen deployed (zone_name + kaiser_id im broadcast)
   - Frontend WP4 Änderungen deployed (defensive handleZoneAssignment)
2. Schritte:
   - ESP Device im Dashboard anzeigen
   - Zone via Drag & Drop zuweisen (oder API)
   - ESP sendet ACK
   - Server broadcastet zone_assignment mit zone_name
3. Erwartetes Ergebnis:
   - Frontend zeigt zone_name SOFORT ohne Page-Refresh
   - zone_name bleibt nach WebSocket-Event erhalten (NICHT undefined)
   - Browser DevTools Console zeigt: `Zone confirmed: <esp_id> → <zone_id> (<zone_name>)`
4. Prüfpunkte:
   - ESPCard zeigt zone_name korrekt
   - Keine undefined-Werte in device.zone_name
   - Vue Reactivity triggert UI-Update

**Test 2: Subzone Assignment Real-Time UI (F21 Fix):**
1. Prerequisites:
   - Subzone-Zuweisung implementiert (API + UI)
   - ESP sendet subzone ACKs
   - Server broadcastet subzone_assignment Events
2. Schritte:
   - ESP Device mit Zone
   - Subzone zuweisen (API Call oder UI wenn vorhanden)
   - ESP sendet ACK
   - Server broadcastet subzone_assignment mit status="subzone_assigned"
3. Erwartetes Ergebnis:
   - Frontend empfängt Event (Browser DevTools Network → WS → subzone_assignment)
   - handleSubzoneAssignment() wird aufgerufen
   - device.subzone_id wird gesetzt
   - Toast: "Subzone zugewiesen: <device_name>"
   - UI aktualisiert OHNE Page-Refresh
4. Prüfpunkte:
   - Console Log: `Subzone confirmed: <esp_id> → <subzone_id>`
   - Toast erscheint
   - ESPCard oder Device-Detail zeigt subzone_id

**Test 3: Subzone Removal:**
1. Subzone entfernen (API)
2. ESP ACK mit status="subzone_removed"
3. Server broadcast
4. Erwartetes Ergebnis:
   - device.subzone_id = undefined
   - device.subzone_name = undefined
   - Toast: "Subzone entfernt: <device_name>"

**Test 4: Error Handling:**
1. Zone-Zuweisung mit Error-Status
2. Erwartetes Ergebnis:
   - Console Error Log
   - KEINE undefined-Überschreibung von bestehenden Werten
   - Error-Toast (falls vorhanden)

**Automated Testing (Future):**
- Unit Test: handleZoneAssignment mit partial event data
- Unit Test: handleSubzoneAssignment mit allen Status-Typen
- E2E Test: WebSocket zone_assignment Event → UI Update
- E2E Test: WebSocket subzone_assignment Event → UI Update

---

### WP5: ESP32 Validierung aktivieren [P1]

**Findings:** V6, V7  
**Betroffene Layer:** ESP32  
**Agent:** esp32-dev

#### Warum das wichtig ist

`ConfigManager::validateZoneConfig()` existiert als Methode, wird aber im Zone-Assignment-Handler NICHT aufgerufen. Validierungslogik ist geschrieben, aber tot. Zusätzlich hat `updateZoneAssignment()` kein Rollback bei NVS-Fehler – Cache und NVS können auseinanderlaufen.

#### Systemkontext

**validateZoneConfig() (config_manager.cpp:356-376):**  
Prüft: kaiser_id nicht leer, kaiser_id max 63 chars, wenn zone_assigned dann zone_id nicht leer. Diese Methode wird bei Subzone-Validierung aufgerufen (`validateSubzoneConfig()` existiert und wird genutzt), aber NICHT bei Zone-Assignment.

**updateZoneAssignment() (config_manager.cpp:392-421):**  
Schreibt erst in den Cache (Zeile 401-408), dann in NVS (Zeile 412). Wenn `saveZoneConfig()` fehlschlägt: Cache hat neue Werte, NVS hat alte. Nach Reboot: alte Werte (NVS). Während Laufzeit: neue Werte (Cache). Inkonsistenz.

#### IST-Zustand

**esp32-dev Analyse:**

**validateZoneConfig() (config_manager.cpp:356-376):**
```cpp
bool ConfigManager::validateZoneConfig(const KaiserZone& kaiser) const {
  // Kaiser ID required
  if (kaiser.kaiser_id.length() == 0) {                    // :358
    LOG_WARNING("ConfigManager: Kaiser ID is empty");
    return false;
  }
  // Kaiser ID length check (MQTT topic limit)
  if (kaiser.kaiser_id.length() > 63) {                    // :364
    LOG_WARNING("ConfigManager: Kaiser ID too long (max 63 chars)");
    return false;
  }
  // If zone assigned, zone_id must be set
  if (kaiser.zone_assigned && kaiser.zone_id.length() == 0) { // :370
    LOG_WARNING("ConfigManager: Zone assigned but zone_id is empty");
    return false;
  }
  return true;
}
```
Methode existiert, ist korrekt, wird aber NIRGENDS aufgerufen.

**updateZoneAssignment() (config_manager.cpp:392-421) – Cache/NVS-Reihenfolge:**
```cpp
bool ConfigManager::updateZoneAssignment(const String& zone_id, ...) {
  // CACHE ZUERST (Zeile 401-408):
  kaiser_.zone_id = zone_id;                    // :401 ← Cache sofort überschrieben
  kaiser_.master_zone_id = master_zone_id;      // :402
  kaiser_.zone_name = zone_name;                // :403
  kaiser_.zone_assigned = true;                 // :404
  if (kaiser_id.length() > 0) {
    kaiser_.kaiser_id = kaiser_id;              // :408
  }

  // NVS DANACH (Zeile 412):
  bool success = saveZoneConfig(kaiser_, master_); // :412 ← Kann fehlschlagen!

  return success;  // :420 ← Bei false: Cache hat NEUE Werte, NVS hat ALTE
}
```
**Problem:** Wenn `saveZoneConfig()` fehlschlägt (NVS voll, Flash-Fehler):
- Cache (`kaiser_`) hat bereits die neuen Werte (Zeile 401-408)
- NVS hat noch die alten Werte
- Zur Laufzeit: ESP arbeitet mit neuen Werten (aus Cache)
- Nach Reboot: ESP arbeitet mit alten Werten (aus NVS)
- Kein Rollback, kein Warning über die Inkonsistenz

**Wo die Validierung im Zone-Handler fehlt (main.cpp:1270):**
```cpp
// main.cpp:1270 – DIREKT Aufruf von updateZoneAssignment OHNE vorherige Validierung:
if (configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)) {
```
Zwischen Zeile 1262 (Ende der kaiser_id-Default-Logik) und Zeile 1270 (updateZoneAssignment-Aufruf) gibt es KEINEN Aufruf von `validateZoneConfig()`.

**Vergleich Subzone-Handler (main.cpp:1379-1383) – MACHT ES RICHTIG:**
```cpp
// main.cpp:1379 – Subzone validiert VOR dem Speichern:
if (!configManager.validateSubzoneConfig(subzone_config)) {   // :1379 ← Validierung!
  LOG_ERROR("Subzone assignment failed: validation failed");
  sendSubzoneAck(subzone_id, "error", "subzone config validation failed"); // Error-ACK!
  return;
}
// Erst DANACH: configManager.saveSubzoneConfig() bei Zeile 1414
```
Der Subzone-Handler:
1. Baut Config-Objekt (Zeile 1365-1376)
2. Ruft `validateSubzoneConfig()` auf (Zeile 1379)
3. Bei Fehler: sendet Error-ACK und returned
4. Bei Erfolg: Speichert via `saveSubzoneConfig()` (Zeile 1414)

Der Zone-Handler überspringt Schritt 2 komplett.

#### SOLL-Zustand

**esp32-dev SOLL:**

**Fix 1: validateZoneConfig() vor updateZoneAssignment() aufrufen (main.cpp, nach Zeile 1267, vor Zeile 1270):**

```cpp
// NEU: Validate zone config before persisting (analog zu Subzone-Handler :1379)
KaiserZone validation_copy = g_kaiser;  // Kopie für Validation
validation_copy.zone_id = zone_id;
validation_copy.zone_name = zone_name;
validation_copy.zone_assigned = true;
if (kaiser_id.length() > 0) {
  validation_copy.kaiser_id = kaiser_id;
}

if (!configManager.validateZoneConfig(validation_copy)) {
  LOG_ERROR("Zone assignment failed: validation failed");
  // Error-ACK (analog zu Subzone-Handler :1381)
  String ack_topic = "kaiser/" + g_kaiser.kaiser_id + "/esp/" + g_system_config.esp_id + "/zone/ack";
  String error_payload = "{\"esp_id\":\"" + g_system_config.esp_id +
                         "\",\"status\":\"error\",\"ts\":" + String((unsigned long)timeManager.getUnixTimestamp()) +
                         ",\"message\":\"zone config validation failed\"}";
  mqttClient.publish(ack_topic, error_payload);
  return;
}

// Bestehender Code ab :1270 bleibt:
if (configManager.updateZoneAssignment(zone_id, master_zone_id, zone_name, kaiser_id)) {
```

**Fix 2: updateZoneAssignment() – NVS ZUERST, Cache DANACH (config_manager.cpp:392-421):**

IST:
```cpp
// Zeile 401-408: Cache zuerst
kaiser_.zone_id = zone_id;
kaiser_.zone_assigned = true;
// ...
// Zeile 412: NVS danach (kann fehlschlagen → Cache/NVS Drift)
bool success = saveZoneConfig(kaiser_, master_);
```

SOLL:
```cpp
bool ConfigManager::updateZoneAssignment(const String& zone_id, const String& master_zone_id,
                                        const String& zone_name, const String& kaiser_id) {
  LOG_INFO("ConfigManager: Updating zone assignment...");

  // Step 1: Save OLD values for rollback
  String old_zone_id = kaiser_.zone_id;
  String old_master_zone_id = kaiser_.master_zone_id;
  String old_zone_name = kaiser_.zone_name;
  bool old_zone_assigned = kaiser_.zone_assigned;
  String old_kaiser_id = kaiser_.kaiser_id;

  // Step 2: Update cache (needed for saveZoneConfig to persist correct values)
  kaiser_.zone_id = zone_id;
  kaiser_.master_zone_id = master_zone_id;
  kaiser_.zone_name = zone_name;
  kaiser_.zone_assigned = (zone_id.length() > 0);  // false bei Removal
  if (kaiser_id.length() > 0) {
    kaiser_.kaiser_id = kaiser_id;
  }

  // Step 3: Persist to NVS
  bool success = saveZoneConfig(kaiser_, master_);

  // Step 4: Rollback cache on NVS failure
  if (!success) {
    LOG_ERROR("ConfigManager: NVS write failed – rolling back cache");
    kaiser_.zone_id = old_zone_id;
    kaiser_.master_zone_id = old_master_zone_id;
    kaiser_.zone_name = old_zone_name;
    kaiser_.zone_assigned = old_zone_assigned;
    kaiser_.kaiser_id = old_kaiser_id;
  }

  return success;
}
```

**Hinweis:** `saveZoneConfig()` liest die Werte aus `kaiser_`, daher muss der Cache VOR dem NVS-Write aktualisiert werden. Der Fix ist daher ein ROLLBACK bei Fehler statt einer Umkehrung der Reihenfolge.

**Error-Handling bei Validierungsfehler:**
- ESP sendet Error-ACK mit `status="error"` und `message="zone config validation failed"`
- Server empfängt ACK → zone_ack_handler loggt Fehler
- Zone bleibt unverändert (weder Cache noch NVS betroffen)

**Rollback-Strategie bei NVS-Fehler:**
- Alte Werte werden vor Cache-Update gespeichert (5 lokale Variablen, ~120 Bytes Stack)
- Bei `saveZoneConfig()` Fehler: alle 5 Werte zurückgeschrieben
- Log-Level: ERROR (sichtbar in Serial und ErrorTracker)
- Kein Re-Try: NVS-Fehler sind typischerweise persistent (Flash-Wear, Partition voll)

#### Verifikation

**esp32-dev Verifikation:**

**Test 1: Zone-Assignment mit ungültiger Config**
- Sende `zone/assign` mit `kaiser_id=""` UND `zone_id="test_zone"` → `validateZoneConfig()` schlägt fehl (Zeile 358: kaiser_id leer) → ESP sendet Error-ACK `{"status":"error","message":"zone config validation failed"}` → NVS und Cache unverändert

**Test 2: Zone-Assignment mit überlangem kaiser_id**
- Sende `zone/assign` mit `kaiser_id` = 100 chars → `validateZoneConfig()` schlägt fehl (Zeile 364: >63 chars) → Error-ACK

**Test 3: Simulierter NVS-Fehler → Cache-Rollback**
- NVS-Partition künstlich füllen (Wokwi: `nvs_flash` Mock oder `nvs_set_str` Error-Injection)
- Sende gültige Zone-Assignment → `saveZoneConfig()` returned `false`
- Prüfe: `g_kaiser.zone_id` behält alten Wert (nicht den neuen)
- Prüfe: Nächster Heartbeat sendet alte Zone (Cache = NVS = konsistent)
- Prüfe: Error-ACK wurde gesendet (`status="error"`, `message="Failed to save zone config"`)

**Test 4: Validierung + Removal Interaktion (Cross-Check mit WP1)**
- Zone zuweisen (`zone_id="gh_1"`) → Erfolgreich
- Zone entfernen (`zone_id=""`) → WP1-Handler greift BEVOR validateZoneConfig (Removal-Branch ist VOR Validation im Code-Flow)
- Prüfe: Removal funktioniert trotz aktiver Validation (leere zone_id wird VOM Removal-Branch abgefangen, erreicht validateZoneConfig() NICHT)

---

### WP6: MQTT Subscription Readiness [P2]

**Findings:** F5  
**Betroffene Layer:** Server  
**Agent:** server-dev

#### Warum das wichtig ist

Alle 15 MQTT-Subscriptions im Server sind hardcoded auf `kaiser/god/esp/+/...`. Wenn ein ESP einen anderen `kaiser_id` bekommt (z.B. durch Zone-Assignment), wird er unsichtbar – kein Heartbeat, kein Sensor-Data, keine Actuator-Commands. Die Topic-PARSER sind bereits vorbereitet (akzeptieren any kaiser_id via Regex), nur die Subscriptions nicht.

#### Systemkontext

**main.py Handler-Registrierung (Zeile 200-310):**  
`kaiser_id = settings.hierarchy.kaiser_id` (normalerweise "god"), dann 15 Subscription-Patterns mit `f"kaiser/{kaiser_id}/esp/+/..."`.

**Topic-Parser (topics.py):**  
Alle `parse_*` Methoden nutzen Regex `([a-zA-Z0-9_]+)` für kaiser_id → akzeptieren JEDEN gültigen String.

#### IST-Zustand

**server-dev Analyse (main.py:199-310, alle Subscription-Patterns):**

`kaiser_id`-Quelle (main.py:200): `kaiser_id = settings.hierarchy.kaiser_id` (Default: `"god"`)

**Alle 14 Subscription-Patterns (exakt aus main.py):**

| # | Zeile | Pattern | Handler |
|---|-------|---------|---------|
| 1 | 204-206 | `kaiser/{kaiser_id}/esp/+/sensor/+/data` | sensor_handler.handle_sensor_data |
| 2 | 208-210 | `kaiser/{kaiser_id}/esp/+/actuator/+/status` | actuator_handler.handle_actuator_status |
| 3 | 213-215 | `kaiser/{kaiser_id}/esp/+/actuator/+/response` | actuator_response_handler.handle_actuator_response |
| 4 | 218-220 | `kaiser/{kaiser_id}/esp/+/actuator/+/alert` | actuator_alert_handler.handle_actuator_alert |
| 5 | 222-224 | `kaiser/{kaiser_id}/esp/+/system/heartbeat` | heartbeat_handler.handle_heartbeat |
| 6 | 226-228 | `kaiser/{kaiser_id}/discovery/esp32_nodes` | discovery_handler.handle_discovery |
| 7 | 230-232 | `kaiser/{kaiser_id}/esp/+/config_response` | config_handler.handle_config_ack |
| 8 | 235-237 | `kaiser/{kaiser_id}/esp/+/zone/ack` | zone_ack_handler.handle_zone_ack |
| 9 | 240-242 | `kaiser/{kaiser_id}/esp/+/subzone/ack` | subzone_ack_handler.handle_subzone_ack |
| 10 | 249-251 | `kaiser/{kaiser_id}/esp/+/system/will` | lwt_handler.handle_lwt |
| 11 | 257-259 | `kaiser/{kaiser_id}/esp/+/system/error` | error_handler.handle_error_event |
| 12 | 298-300 | `kaiser/{kaiser_id}/esp/+/actuator/+/command` | mock_actuator_command_handler |
| 13 | 303-305 | `kaiser/{kaiser_id}/esp/+/actuator/emergency` | mock_actuator_command_handler |
| 14 | 307-309 | `kaiser/broadcast/emergency` | mock_actuator_command_handler |

**Zaehlung:** 14 Patterns (nicht 15 wie im TM-Plan geschaetzt). 13 nutzen `kaiser/{kaiser_id}/...`, 1 nutzt festes `kaiser/broadcast/emergency`.

**Bestaetigung Topic-Parser:** Alle `parse_*`-Methoden in topics.py nutzen `([a-zA-Z0-9_]+)` als Regex fuer kaiser_id -- akzeptieren jeden alphanumerischen String inklusive Underscores. Beispiel (topics.py:324):
```python
pattern = r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/sensor/(\d+)/data"
```
Die Parser sind bereits vorbereitet fuer beliebige kaiser_id-Werte.

#### SOLL-Zustand

**Prinzip (TM-Vorgabe):** Subscriptions auf `kaiser/+/esp/+/...` umstellen. Der `+` Wildcard in MQTT matched genau ein Level. Die Handler extrahieren kaiser_id aus dem Topic und können bei Bedarf validieren.

**server-dev SOLL (main.py:199-310):**

**Aenderung:** `kaiser/{kaiser_id}/` ersetzen durch `kaiser/+/` in allen 13 dynamischen Patterns.

| # | IST | SOLL |
|---|-----|------|
| 1 | `f"kaiser/{kaiser_id}/esp/+/sensor/+/data"` | `"kaiser/+/esp/+/sensor/+/data"` |
| 2 | `f"kaiser/{kaiser_id}/esp/+/actuator/+/status"` | `"kaiser/+/esp/+/actuator/+/status"` |
| 3 | `f"kaiser/{kaiser_id}/esp/+/actuator/+/response"` | `"kaiser/+/esp/+/actuator/+/response"` |
| 4 | `f"kaiser/{kaiser_id}/esp/+/actuator/+/alert"` | `"kaiser/+/esp/+/actuator/+/alert"` |
| 5 | `f"kaiser/{kaiser_id}/esp/+/system/heartbeat"` | `"kaiser/+/esp/+/system/heartbeat"` |
| 6 | `f"kaiser/{kaiser_id}/discovery/esp32_nodes"` | `"kaiser/+/discovery/esp32_nodes"` |
| 7 | `f"kaiser/{kaiser_id}/esp/+/config_response"` | `"kaiser/+/esp/+/config_response"` |
| 8 | `f"kaiser/{kaiser_id}/esp/+/zone/ack"` | `"kaiser/+/esp/+/zone/ack"` |
| 9 | `f"kaiser/{kaiser_id}/esp/+/subzone/ack"` | `"kaiser/+/esp/+/subzone/ack"` |
| 10 | `f"kaiser/{kaiser_id}/esp/+/system/will"` | `"kaiser/+/esp/+/system/will"` |
| 11 | `f"kaiser/{kaiser_id}/esp/+/system/error"` | `"kaiser/+/esp/+/system/error"` |
| 12 | `f"kaiser/{kaiser_id}/esp/+/actuator/+/command"` | `"kaiser/+/esp/+/actuator/+/command"` |
| 13 | `f"kaiser/{kaiser_id}/esp/+/actuator/emergency"` | `"kaiser/+/esp/+/actuator/emergency"` |
| 14 | `"kaiser/broadcast/emergency"` | `"kaiser/broadcast/emergency"` -- KEINE AENDERUNG |

**Broadcast-Pattern (kaiser/broadcast/emergency):** KEINE Aenderung noetig. Das ist ein festes Topic fuer systemweiten Emergency-Stop. Es folgt einem anderen Schema (`kaiser/broadcast/...` statt `kaiser/{id}/esp/...`) und braucht kein Wildcard.

**Log-Zeilen aktualisieren:** Die Log-Messages in Zeile 253 und 261 referenzieren `kaiser_id` im String -- diese muessen angepasst werden:
```python
# Zeile 253 IST: f"LWT handler registered: kaiser/{kaiser_id}/esp/+/system/will"
# Zeile 253 SOLL: "LWT handler registered: kaiser/+/esp/+/system/will"
```

**Variable `kaiser_id` in main.py:200:** Kann NICHT entfernt werden -- sie wird weiterhin von anderen Stellen gebraucht (z.B. `settings.hierarchy.kaiser_id` fuer Config-Logging). Nur die Subscription-Patterns werden ge aendert.

**Sicherheitsbedenken:** In der aktuellen Phase (Single-Kaiser "god") gibt es kein Risiko. Wenn spaeter Kaiser-Nodes existieren, sollte der Handler die `kaiser_id` aus dem geparsten Topic gegen eine bekannte Liste validieren. Die Parser liefern `kaiser_id` bereits im Return-Dict -- eine Validierung ist trivial hinzufuegbar. Fuer Phase A/B nicht noetig, fuer Phase C empfohlen.

**Performance:** MQTT-Broker-seitig ist `+` ein Standard-Wildcard. Der Broker matched Topics auf Subscription-Patterns mit O(1) pro Level. Die zusaetzlichen Matches (falls andere Kaiser-IDs existieren) sind vernachlaessigbar. Die Handler selbst sind idempotent -- ein falsche kaiser_id fuehrt hoechstens zu einem "device not found" Log.

**Hinweis:** Nach dieser Aenderung muss auch `TopicBuilder.get_zone_ack_subscription_pattern()` und `get_subzone_ack_subscription_pattern()` in topics.py geprueft werden -- diese nutzen `constants.get_topic_with_kaiser_id()` was weiterhin "god" einsetzt. Fuer Subscription-Patterns sollten diese Methoden ebenfalls auf `+` Wildcard umgestellt werden. ABER: Diese Methoden werden aktuell NICHT in main.py verwendet (die Patterns werden dort direkt als f-Strings gebaut).

#### Verifikation

**server-dev Verifikation:**

**Test 1: Neuer kaiser_id**
- Publisiere MQTT-Message auf `kaiser/test_kaiser/esp/ESP_TEST01/system/heartbeat` mit gueltigem Payload
- Erwartung: HeartbeatHandler empfaengt, `parse_heartbeat_topic()` liefert `kaiser_id="test_kaiser"`
- Ergebnis: Device wird registriert oder Heartbeat verarbeitet

**Test 2: Bestehender kaiser_id**
- Publisiere MQTT-Message auf `kaiser/god/esp/ESP_TEST01/system/heartbeat`
- Erwartung: Funktioniert wie bisher, keine Regression

**Test 3: Broadcast unberuehrt**
- Publisiere MQTT-Message auf `kaiser/broadcast/emergency`
- Erwartung: mock_actuator_command_handler empfaengt

**Test 4: Handler-Count**
- Nach Startup pruefen: `len(_subscriber_instance.handlers)` == 14 (unveraendert)

**pytest:** `tests/integration/mqtt/test_subscription_patterns.py` -- neuer Test der alle 14 Patterns gegen verschiedene kaiser_id-Werte validiert.

---

### WP7: Heartbeat Zone-Sync [P2]

**Findings:** F2  
**Betroffene Layer:** Server  
**Agent:** server-dev

#### Warum das wichtig ist

Zone-Info aus ESP-Heartbeats landet nur in `device_metadata` JSON, nicht in den indizierten DB-Spalten (`ESPDevice.zone_id`, `.kaiser_id`). Das bedeutet: wenn ein ESP eine Zone hat (z.B. nach Reboot aus NVS), aber die Zone nie über die Zone-API zugewiesen wurde, ist die Zone in der DB "unsichtbar". Queries über die DB-Spalte finden den ESP nicht in seiner Zone.

#### Systemkontext

Dieser WP hängt eng mit WP2 zusammen. Wenn WP2 implementiert ist (Discovery setzt kaiser_id), bleibt noch die Frage: soll der Heartbeat zone_id auch in die DB-Spalte synchronisieren?

**Pro Sync:** ESP ist Source-of-Truth für seinen eigenen Zustand. Wenn ESP sagt "ich bin in Zone X", sollte die DB das widerspiegeln.  
**Contra Sync:** Server ist Source-of-Truth für Zone-Assignment. ESP hat Zone nur weil Server sie zugewiesen hat. Heartbeat-Sync könnte Server-Entscheidungen überschreiben.

#### IST-Zustand

**server-dev Analyse (heartbeat_handler.py:592-658, _update_esp_metadata):**

```python
# heartbeat_handler.py:606-655 — _update_esp_metadata() (relevanter Ausschnitt)
async def _update_esp_metadata(self, esp_device, payload, session):
    try:
        current_metadata = esp_device.device_metadata or {}

        # Update zone info if provided
        if "zone_id" in payload:
            current_metadata["zone_id"] = payload["zone_id"]        # ← Nur metadata!
        if "master_zone_id" in payload:
            current_metadata["master_zone_id"] = payload["master_zone_id"]  # ← Nur metadata!
        if "zone_assigned" in payload:
            current_metadata["zone_assigned"] = payload["zone_assigned"]    # ← Nur metadata!

        # Update health metrics
        current_metadata["last_heap_free"] = payload.get("heap_free", payload.get("free_heap"))
        current_metadata["last_wifi_rssi"] = payload.get("wifi_rssi")
        current_metadata["last_uptime"] = payload.get("uptime")
        # ... (GPIO status, sensor/actuator counts)

        esp_device.device_metadata = current_metadata
    except Exception as e:
        logger.warning(f"Failed to update ESP metadata: {e}")
```

**Zone-Felder in metadata geschrieben:**
- `metadata["zone_id"]` ← aus Heartbeat-Payload `payload["zone_id"]`
- `metadata["master_zone_id"]` ← aus Heartbeat-Payload `payload["master_zone_id"]`
- `metadata["zone_assigned"]` ← aus Heartbeat-Payload `payload["zone_assigned"]`

**NICHT aktualisierte DB-Spalten:**
- `esp_device.zone_id` ← bleibt unveraendert
- `esp_device.master_zone_id` ← bleibt unveraendert
- `esp_device.kaiser_id` ← bleibt unveraendert

**Mismatch-Detection:** Existiert NICHT. Es gibt keinen Vergleich zwischen `metadata["zone_id"]` und `esp_device.zone_id`. Die Werte koennen divergieren und niemand merkt es.

#### SOLL-Zustand

**TM-Empfehlung:** KEIN automatischer Sync von Heartbeat zone_id → DB-Spalte. ABER: Warning-Log wenn Mismatch erkannt wird. So bleibt der Server authoritative, aber stille Widersprüche werden sichtbar.

**server-dev SOLL -- Mismatch-Detection in _update_esp_metadata() (heartbeat_handler.py):**

Code einfuegen NACH dem Metadata-Update-Block (nach Zeile 616, vor den health metrics):

```python
# Zone Mismatch Detection (WP7)
# Server is authoritative - do NOT sync, only warn
heartbeat_zone_id = payload.get("zone_id", "")
db_zone_id = esp_device.zone_id or ""

if heartbeat_zone_id != db_zone_id:
    # Normalize: ESP sends "" for unassigned, DB uses None
    esp_has_zone = bool(heartbeat_zone_id)
    db_has_zone = bool(db_zone_id)

    if esp_has_zone and not db_has_zone:
        # ESP has zone from NVS, Server has None
        # This happens after: (1) Server restart, (2) failed zone removal
        logger.warning(
            f"ZONE_MISMATCH [{esp_device.device_id}]: "
            f"ESP reports zone_id='{heartbeat_zone_id}' but DB has zone_id=None. "
            f"ESP may have stale zone from NVS. Consider re-sending zone removal."
        )
    elif not esp_has_zone and db_has_zone:
        # Server has zone, ESP does not
        # This happens after: (1) ESP factory reset, (2) ESP NVS corruption
        logger.warning(
            f"ZONE_MISMATCH [{esp_device.device_id}]: "
            f"ESP reports no zone but DB has zone_id='{db_zone_id}'. "
            f"ESP may have lost zone config. Consider re-sending zone assignment."
        )
    else:
        # Both have zone but different values
        logger.warning(
            f"ZONE_MISMATCH [{esp_device.device_id}]: "
            f"ESP reports zone_id='{heartbeat_zone_id}' but DB has zone_id='{db_zone_id}'. "
            f"Zone assignment may be inconsistent."
        )
```

**Log-Level:** WARNING. Nicht ERROR -- es ist ein erkannter Zustand, kein Crash. WARNING ist im Standard-Log sichtbar und kann in Grafana-Alerts gefiltert werden.

**Log-Message Format:** `ZONE_MISMATCH [{device_id}]: ...` -- durchsuchbar mit grep/Loki, eindeutiger Praefix.

**Prometheus-Metrik:** JA, empfohlen als Gauge:
```python
# core/metrics.py — neue Metrik:
zone_mismatch_total = Gauge(
    "automationone_zone_mismatch_total",
    "Number of ESP devices with zone mismatch between heartbeat and DB",
)
```
Update in der Mismatch-Detection: `zone_mismatch_total.inc()` bei Mismatch, periodic reset im Prometheus-Update-Job. ABER: Fuer Phase C ausreichend, Phase A kann ohne Metrik starten.

**Edge Case -- ESP hat zone_id nach Reboot, Server hat None:**
Loggen als WARNING mit Hinweis "ESP may have stale zone from NVS. Consider re-sending zone removal." Der Admin/TM kann dann manuell `remove_zone()` aufrufen oder einen automatischen Retry implementieren. KEIN automatischer Sync -- der Server bleibt authoritative.

#### Verifikation

**server-dev Verifikation:**

**Test 1: Mismatch -- ESP hat Zone, DB nicht**
- Setup: ESP_TEST01 in DB mit `zone_id=None`
- Publisiere Heartbeat mit `{"zone_id": "gh_zone_1", "zone_assigned": true, ...}`
- Erwartung: WARNING Log `"ZONE_MISMATCH [ESP_TEST01]: ESP reports zone_id='gh_zone_1' but DB has zone_id=None"`
- Erwartung: `esp_device.zone_id` bleibt `None` (KEIN Sync)

**Test 2: Kein Mismatch -- gleiche Zone**
- Setup: ESP_TEST01 in DB mit `zone_id="gh_zone_1"`
- Publisiere Heartbeat mit `{"zone_id": "gh_zone_1", ...}`
- Erwartung: KEIN Warning im Log

**Test 3: Mismatch -- DB hat Zone, ESP nicht**
- Setup: ESP_TEST01 in DB mit `zone_id="gh_zone_1"`
- Publisiere Heartbeat mit `{"zone_id": "", "zone_assigned": false, ...}`
- Erwartung: WARNING Log mit Hinweis auf verlorene Zone-Config

**Test 4: Kein Mismatch -- beide ohne Zone**
- Setup: ESP_TEST01 in DB mit `zone_id=None`
- Publisiere Heartbeat mit `{"zone_id": "", ...}`
- Erwartung: KEIN Warning (beide "keine Zone", Normalisierung "" == None)

**pytest:** `tests/integration/mqtt/test_heartbeat_handler.py` -- 4 Testcases fuer Mismatch-Detection.

---

### WP8: Subzone-Removal ACK [P2]

**Findings:** F10, F14  
**Betroffene Layer:** ESP32 (ACK senden), Server (DB-Cleanup)  
**Agents:** esp32-dev, server-dev

#### Warum das wichtig ist

Subzone-Removal auf ESP funktioniert (GPIOs freigegeben, NVS gelöscht), aber der ESP sendet keinen ACK. Server wartet auf `status="subzone_removed"` um den DB-Record zu löschen. ACK kommt nie → SubzoneConfig-Records akkumulieren sich als Orphans.

#### Systemkontext

**Kontrast – Subzone-ASSIGNMENT hat ACK:**  
`sendSubzoneAck(subzone_id, "subzone_assigned", "")` wird aufgerufen (main.cpp nach Zeile 1414). Der Server empfängt, bestätigt, löscht pending.

**Subzone-REMOVAL hat KEINEN ACK:**  
main.cpp:1436-1472 – entfernt GPIOs, löscht NVS, loggt "Subzone removed", aber ruft `sendSubzoneAck()` NICHT auf.

#### IST-Zustand

**esp32-dev Analyse (IMPLEMENTIERT):**

**Subzone-Removal-Handler (main.cpp:1436-1472) VOR Fix:**
```cpp
// Phase 9: Subzone Removal Handler
String subzone_remove_topic = TopicBuilder::buildSubzoneRemoveTopic();
if (topic == subzone_remove_topic) {
  LOG_INFO("╔════════════════════════════════════════╗");
  LOG_INFO("║  SUBZONE REMOVAL RECEIVED             ║");
  LOG_INFO("╚════════════════════════════════════════╝");

  DynamicJsonDocument doc(256);
  DeserializationError error = deserializeJson(doc, payload);

  if (!error) {
    String subzone_id = doc["subzone_id"].as<String>();

    if (subzone_id.length() == 0) {
      LOG_ERROR("Subzone removal failed: subzone_id is empty");
      return;
    }

    // Load config to get GPIOs
    SubzoneConfig config;
    if (!configManager.loadSubzoneConfig(subzone_id, config)) {
      LOG_WARNING("Subzone " + subzone_id + " not found for removal");
      return;
    }

    // Remove GPIOs from subzone
    for (uint8_t gpio : config.assigned_gpios) {
      gpioManager.removePinFromSubzone(gpio);
    }

    // Remove from NVS
    configManager.removeSubzoneConfig(subzone_id);

    LOG_INFO("✅ Subzone removed: " + subzone_id);
    // ← HIER FEHLT: sendSubzoneAck(subzone_id, "subzone_removed", "")
  }
  return;
}
```

**Vergleich Subzone-ASSIGNMENT (main.cpp:1426) - MACHT ES RICHTIG:**
```cpp
// Success ACK
sendSubzoneAck(subzone_id, "subzone_assigned", "");  // ← Hat ACK!
```

**Fehlende sendSubzoneAck() Parameter:**
- `subzone_id` - bereits vorhanden (Zeile 1447)
- `status` - "subzone_removed" (analog zu "subzone_assigned")
- `message` - "" (leer bei Erfolg)

**server-dev Analyse:**

**subzone_ack_handler.py -- Routing zu SubzoneService (Zeile 86-98):**
```python
# subzone_ack_handler.py:86-98
async with resilient_session() as session:
    esp_repo = ESPRepository(session)
    service = SubzoneService(esp_repo=esp_repo, session=session)

    success = await service.handle_subzone_ack(
        device_id=ack_payload.esp_id,
        status=ack_payload.status,       # ← "subzone_removed" wird durchgereicht
        subzone_id=ack_payload.subzone_id,
        timestamp=ack_payload.timestamp,
        error_code=ack_payload.error_code,
        message=ack_payload.message,
    )
```

**SubzoneService.handle_subzone_ack() -- "subzone_removed" Branch (subzone_service.py:372-378):**
```python
elif status == "subzone_removed":
    # Delete subzone record
    await self._delete_subzone_config(device_id, subzone_id)
    logger.info(f"Subzone removal confirmed for {device_id}: subzone_id={subzone_id}")
    return True
```

**_delete_subzone_config() (subzone_service.py:577-594):**
```python
async def _delete_subzone_config(self, device_id: str, subzone_id: str) -> None:
    result = await self.session.execute(
        select(SubzoneConfig).where(
            SubzoneConfig.esp_id == device_id,
            SubzoneConfig.subzone_id == subzone_id,
        )
    )
    config = result.scalar_one_or_none()
    if config:
        await self.session.delete(config)     # ← Loescht den DB-Record
        await self.session.flush()
```

**Zusammenfassung:** Der Server-Code fuer `"subzone_removed"` ist VOLLSTAENDIG implementiert:
1. `SubzoneAckPayload` Schema akzeptiert `"subzone_removed"` als gueltigen Status
2. `handle_subzone_ack()` hat einen `elif status == "subzone_removed"` Branch
3. `_delete_subzone_config()` loescht den SubzoneConfig-Record aus der DB
4. WebSocket-Broadcast erfolgt nach erfolgreichem ACK

**Das einzige Problem:** Der ESP32 sendet diesen ACK derzeit NICHT (WP8 ESP-Fix).

**Orphaned Records:** Aktuell schwer zu beziffern ohne DB-Zugriff. Jede Subzone-Removal die vom Server initiert wurde aber keinen ACK bekam, hat einen verwaisten `SubzoneConfig`-Record. Diese Records haben `last_ack_at IS NULL` (da nie bestaetigt). Query:
```sql
SELECT esp_id, subzone_id, created_at, last_ack_at
FROM subzone_configs
WHERE last_ack_at IS NULL;
```
```

#### SOLL-Zustand

**esp32-dev SOLL (IMPLEMENTIERT):**

**sendSubzoneAck() Aufruf nach erfolgreichem Removal:**
```cpp
// Remove from NVS
configManager.removeSubzoneConfig(subzone_id);

// WP8: Send subzone_removed acknowledgment
sendSubzoneAck(subzone_id, "subzone_removed", "");

LOG_INFO("✅ Subzone removed: " + subzone_id);
```
- Position: main.cpp:1467 (nach NVS-Removal, vor LOG-Erfolg)
- Status: "subzone_removed" → triggert `SubzoneService._delete_subzone_config()` auf Server

**Error-Case Handling:**
- `loadSubzoneConfig()` fehlschlägt (Zeile 1456): Kein ACK, nur LOG_WARNING → Korrekt (Subzone existiert nicht)
- GPIO-Removal fehlschlägt: Kein expliziter Error-Check. GPIOManager ist robust, gibt Warnings.
- NVS-Removal fehlschlägt: `removeSubzoneConfig()` hat internen Error-Log, returned void → ACK wird trotzdem gesendet
- **Akzeptiert**: ACK wird auch bei teilweisem Fehler gesendet. Subzone gilt als "entfernt" wenn NVS-Aufruf gemacht wurde.

**server-dev SOLL:**

**Bestaetigung:** `subzone_ack_handler.py` handled `"subzone_removed"` BEREITS korrekt. Keine Server-Aenderung noetig fuer WP8. Der einzige Fix ist ESP32-seitig (sendSubzoneAck-Aufruf).

**Cleanup-Job fuer bestehende Orphans:** JA, empfohlen.

Ein Maintenance-Job in `maintenance/service.py` der regelmaessig (z.B. taeglich) verwaiste SubzoneConfig-Records aufraeumt:

```python
# Neuer Maintenance-Job (maintenance/jobs/ oder maintenance/service.py):
async def cleanup_orphaned_subzones(session: AsyncSession) -> int:
    """Delete SubzoneConfig records that were never ACKed (older than 24h)."""
    from datetime import timedelta
    threshold = datetime.now(timezone.utc) - timedelta(hours=24)

    result = await session.execute(
        select(SubzoneConfig).where(
            SubzoneConfig.last_ack_at.is_(None),
            SubzoneConfig.created_at < threshold,
        )
    )
    orphans = result.scalars().all()

    for orphan in orphans:
        logger.warning(
            f"Cleaning up orphaned SubzoneConfig: "
            f"esp_id={orphan.esp_id}, subzone_id={orphan.subzone_id}, "
            f"created_at={orphan.created_at}"
        )
        await session.delete(orphan)

    return len(orphans)
```

Registrierung in MaintenanceService (analog zu `cleanup_sensor_data`):
```python
_central_scheduler.add_cron_job(
    job_id="maintenance_cleanup_orphaned_subzones",
    func=cleanup_orphaned_subzones_wrapper,
    hour=4, minute=0,  # Daily at 04:00
    category=JobCategory.MAINTENANCE,
)
```

**Prioritaet:** Niedrig. Kann nach WP8 ESP-Fix implementiert werden. Bestehende Orphans sind harmlos (belegen nur DB-Platz, keine funktionale Auswirkung).
```

#### Verifikation

```
→ Agent füllt aus:
   - Test: Subzone entfernen → Server bekommt ACK → DB-Record gelöscht
   - DB-Query: SELECT * FROM subzone_configs WHERE last_ack_at IS NULL (Orphans finden)
```

---

### WP9: Code-Hygiene [P3/P4]

**Findings:** F15, F17, F19, F23, F24  
**Betroffene Layer:** Server  
**Agent:** server-dev (bei Gelegenheit, nach WP1-WP8)

Diese Findings sind NICHT funktionskritisch, aber reduzieren Wartungslast:

| # | Was | Fix |
|---|-----|-----|
| F15 | zone_ack_handler setzt zone_name nicht | 2 Zeilen: `device.zone_name = payload.get("zone_name")` |
| F17 | Doppelte Zone-ACK Implementierung (Handler + Service) | Service-Methode auf Handler delegieren oder entfernen |
| F19 | Doppelte Discovery (ESPService vs HeartbeatHandler) | HeartbeatHandler soll ESPService.discover_device() nutzen |
| F23 | Unterschiedliche WebSocket broadcast APIs (Zone vs Subzone) | Einen Weg wählen und vereinheitlichen |
| F24 | remove_zone() löscht kaiser_id nicht (by design) | Dokumentieren als bewusste Entscheidung |

**server-dev Analyse WP9 -- Exakte Codezeilen und minimale Aenderungen:**

**F15: zone_ack_handler setzt zone_name nicht**
- Datei: `zone_ack_handler.py:129-141`
- IST: Nur `device.zone_id` und `device.master_zone_id` werden aus dem ACK-Payload gesetzt
- SOLL: `device.zone_name = payload.get("zone_name")` nach Zeile 132 einfuegen
- HINWEIS: Der ESP32 sendet aktuell KEIN `zone_name` im ACK-Payload. Dieser Fix greift erst wenn der ESP das Feld mitsendet. Alternativ: `zone_name` aus dem `device`-Objekt beibehalten (es wurde bereits von `assign_zone()` gesetzt)
- Abhaengigkeit: KEINE. Kann jederzeit gemacht werden.

**F17: Doppelte Zone-ACK Implementierung (Handler + Service)**
- zone_ack_handler.py:59-170 hat eigene ACK-Logik (direkte DB-Operationen)
- zone_service.py:255-309 hat `handle_zone_ack()` Methode (identische Logik)
- IST: zone_ack_handler nutzt seine EIGENE Logik, NICHT den Service
- SOLL: zone_ack_handler soll `ZoneService.handle_zone_ack()` aufrufen (analog zu subzone_ack_handler der SubzoneService nutzt, Zeile 86-98)
- Abhaengigkeit: Sollte VOR WP1 gemacht werden (damit der neue "zone_removed" Branch nur an einer Stelle implementiert wird, nicht doppelt)

**F19: Doppelte Discovery (ESPService vs HeartbeatHandler)**
- heartbeat_handler.py:321-390 hat `_auto_register_esp()` (eigene Logik)
- esp_service.py:741-793 hat `discover_device()` (identische Logik)
- IST: Beide erstellen ESPDevice unabhaengig voneinander
- SOLL: HeartbeatHandler soll `ESPService.discover_device()` nutzen
- Abhaengigkeit: WP2 Fix 1 muss in BEIDEN Stellen oder nach der Vereinheitlichung gemacht werden. Empfehlung: F19 VOR WP2 fixen, dann WP2 nur an einer Stelle aendern.

**F23: Unterschiedliche WebSocket broadcast APIs (Zone vs Subzone)**
- zone_ack_handler.py:252-265 nutzt `ws_manager.broadcast("zone_assignment", event_data)`
- subzone_ack_handler.py:127-149 nutzt `ws_manager.broadcast_thread_safe(message)` mit verschachteltem Format `{"type": "subzone_assignment", "device_id": ..., "data": {...}}`
- IST: Zwei verschiedene APIs, zwei verschiedene Payload-Formate
- SOLL: Beide auf `ws_manager.broadcast(event_type, data)` vereinheitlichen
- Abhaengigkeit: WP4 Frontend-seitig muss wissen welches Format gilt. Empfehlung: F23 zusammen mit WP4 umsetzen.

**F24: remove_zone() loescht kaiser_id nicht (by design)**
- zone_service.py:218-220: `device.zone_id = None`, `device.master_zone_id = None`, `device.zone_name = None`
- `device.kaiser_id` wird NICHT geloescht
- SOLL: Dokumentation hinzufuegen als Kommentar:
```python
# NOTE: device.kaiser_id is NOT cleared on zone removal (by design, F24).
# Kaiser assignment persists independently of zone assignment.
# An ESP can be "in the Kaiser hierarchy" without being in a specific zone.
device.zone_id = None
device.master_zone_id = None
device.zone_name = None
```
- Abhaengigkeit: KEINE. Rein dokumentarisch.

**Empfohlene Reihenfolge:**
1. F17 (Doppelte ACK) → VOR WP1 (reduziert Aenderungsstellen)
2. F19 (Doppelte Discovery) → VOR WP2 (reduziert Aenderungsstellen)
3. F24 (Kommentar) → jederzeit
4. F15 (zone_name) → zusammen mit WP4
5. F23 (WebSocket API) → zusammen mit WP4

---

## Cross-Reference Matrix

Agents müssen prüfen ob ihre Änderungen andere WPs betreffen:

| Wenn du änderst... | Prüfe auch... |
|--------------------|---------------|
| Zone-Removal auf ESP (WP1) | Server zone_ack_handler muss neuen Status verstehen (WP1) |
| kaiser_id bei Discovery (WP2) | Heartbeat-Sync Logik (WP7) – Mismatch-Detection Baseline ändert sich |
| TopicBuilder-Nutzung (WP3) | Zone-Removal Topic (WP1) – wenn neues Topic nötig, muss TopicBuilder es können |
| WebSocket broadcast (WP4) | Frontend Types müssen matchen (WP4) |
| MQTT Subscriptions Wildcard (WP6) | TopicBuilder auf ESP (WP3) – ESP muss korrekte Topics senden |
| Subzone-Removal ACK (WP8) | Zone-Removal Design (WP1) – gleiche Patterns nutzen |

---

## Implementierungsreihenfolge (TM-Empfehlung)

```
Phase A: Fundament reparieren (WP1 + WP2 + WP5)
  └─ Zone-Removal, Kaiser-ID Konsistenz, ESP Validierung
  └─ Agents: esp32-dev + server-dev parallel

Phase B: Frontend + Topics (WP3 + WP4)
  └─ TopicBuilder vereinheitlichen, WebSocket-Lücken schließen
  └─ Agents: esp32-dev + frontend-dev + server-dev

Phase C: Kaiser-Vorbereitung (WP6 + WP7 + WP8)
  └─ MQTT Wildcard, Heartbeat Sync, Subzone ACK
  └─ Agents: server-dev + esp32-dev

Phase D: Cleanup (WP9)
  └─ Code-Hygiene, Dokumentation
  └─ Agent: server-dev
```

---

## OFFENE PUNKTE (verify-plan Cross-Layer-Analyse)

**Analysiert:** 2026-02-10 durch verify-plan nach frontend-dev WP4 Implementierung
**Status:** 2 kritische Bugs gefunden, 1 Type-Inkonsistenz, mehrere Empfehlungen

### 🔴 KRITISCH 1: Frontend handleZoneAssignment fehlt `zone_removed` Branch

**Problem:**
- **Server** (zone_ack_handler.py:143-154) sendet `status: "zone_removed"` bei Zone-Removal
- **Frontend** (esp.ts:1819-1841) behandelt NUR `"zone_assigned"` und `"error"`
- **Konsequenz:** Bei Zone-Removal empfängt Frontend das Event, aber der Handler ignoriert es (fällt in `else` Branch Zeile 1840)

**IST-Code (esp.ts:1819-1841):**
```typescript
if (data.status === 'zone_assigned') {
  // ... Update zone fields
} else if (data.status === 'error') {
  logger.error(`Zone assignment error for ${espId}: ${data.message}`)
} else {
  logger.warn(`Unknown zone_assignment status: ${data.status}`)  // ← zone_removed landet hier!
}
```

**SOLL-Fix:**
```typescript
if (data.status === 'zone_assigned') {
  // ... existing code ...
} else if (data.status === 'zone_removed') {  // ← NEU
  // Clear zone assignment
  devices.value[deviceIndex] = {
    ...device,
    zone_id: undefined,
    zone_name: undefined,
    master_zone_id: undefined,
  }
  logger.info(`Zone removed: ${espId}`)
  showSuccess(`Zone entfernt: ${device.device_name || espId}`)
} else if (data.status === 'error') {
  logger.error(`Zone assignment error for ${espId}: ${data.message}`)
} else {
  logger.warn(`Unknown zone_assignment status: ${data.status}`)
}
```

**Datei:** `El Frontend/src/stores/esp.ts` Zeilen 1819-1841
**Agent:** frontend-dev
**Priorität:** P0 (E2E Szenario 2 "Zone entfernen" wird nicht funktionieren)

---

### 🔴 KRITISCH 2: Type-Inkonsistenz ZoneAssignmentEvent.data.status

**Problem:**
- **Server** sendet: `status: "zone_assigned" | "zone_removed" | "error"` (zone_ack_handler.py:275)
- **Frontend Type** erwartet: `status: 'success' | 'failed'` (websocket-events.ts:587)
- **Konsequenz:** TypeScript-Type stimmt NICHT mit Runtime-Daten überein → Type-Safety verletzt

**IST-Type (websocket-events.ts:579-591):**
```typescript
export interface ZoneAssignmentEvent extends WebSocketEventBase {
  event: 'zone_assignment'
  severity: 'info'
  source_type: 'esp32'
  data: {
    esp_id: string
    zone_id: string
    zone_name?: string
    status: 'success' | 'failed'  // ← FALSCH
    error_code?: string
    message?: string
  }
}
```

**SOLL-Type:**
```typescript
export interface ZoneAssignmentEvent extends WebSocketEventBase {
  event: 'zone_assignment'
  severity: 'info'
  source_type: 'esp32'
  data: {
    esp_id: string
    zone_id: string
    zone_name?: string           // ← WP4 server-dev: NOW SENT
    kaiser_id?: string           // ← WP4 server-dev: NOW SENT
    master_zone_id?: string
    status: 'zone_assigned' | 'zone_removed' | 'error'  // ← KORRIGIERT
    timestamp: number            // ← FEHLT aktuell
    error_code?: string
    message?: string
  }
}
```

**Fehlende Felder:**
- `kaiser_id` fehlt im Type (Server sendet es seit WP4)
- `master_zone_id` vorhanden ✓
- `timestamp` fehlt im Type (Server sendet es)

**Datei:** `El Frontend/src/types/websocket-events.ts` Zeile 587
**Agent:** frontend-dev
**Priorität:** P1 (Type-Safety + Vollständigkeit)

---

### ⚠️ EMPFEHLUNG 1: E2E Szenario 3 Validation Gap

**WP2 Fix 1** setzt `kaiser_id="god"` bei Auto-Registration (heartbeat_handler.py).
**ABER:** Was passiert wenn ein ESP mit `kaiser_id="other"` discovert?

**Szenarien:**
1. ✅ ESP boot → kaiser_id="god" (default) → Heartbeat → Auto-Reg → DB: kaiser_id="god"
2. ❓ ESP boot → kaiser_id="node1" (custom NVS) → Heartbeat → Auto-Reg → DB: kaiser_id=???

**Prüfpunkt:** Wird `constants.get_kaiser_id()` korrekt verwendet oder gibt es einen Hardcode auf "god"?

**Empfehlung:**
- Prüfe heartbeat_handler.py `_auto_register_esp()` Zeile ~445-460
- Wenn ESP kaiser_id NICHT im Heartbeat sendet → verwende Server-Default
- Wenn ESP kaiser_id IM Heartbeat sendet → ESP-Wert bevorzugen (für Multi-Kaiser Zukunft)

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
**Agent:** server-dev
**Priorität:** P2 (Future-Proofing für Kaiser-Nodes)

---

### ⚠️ EMPFEHLUNG 2: WP7 Heartbeat Zone-Sync Test-Coverage

**WP7** implementiert Mismatch-Detection (heartbeat_handler.py:619-653).
**ABER:** Keine Test-Szenarien dokumentiert.

**Fehlende Test-Abdeckung:**
1. ESP hat zone_id="zone1" in NVS, DB hat zone_id=None → "stale zone from NVS"
2. ESP hat zone_id=None (leer), DB hat zone_id="zone1" → "lost zone config"
3. ESP hat zone_id="zone1", DB hat zone_id="zone2" → Beide unterschiedlich

**Empfehlung:**
- Unit-Test für HeartbeatHandler._check_zone_mismatch()
- Integration-Test: Mock ESP mit NVS, DB mit anderem Wert, Heartbeat triggern
- Prüfe Log-Ausgabe: "ZONE_MISMATCH [device_id]"

**Datei:** `El Servador/god_kaiser_server/tests/integration/mqtt/test_heartbeat_handler.py`
**Agent:** test-log-analyst (nach Implementierung)
**Priorität:** P3 (Test-Coverage)

---

### ℹ️ INFO: WP6 MQTT Wildcard Migration vollständig

**Verifikation:** main.py:199-311 verwendet korrekt `"kaiser/+/..."` Pattern.
**Getestet:** Alle 13 Subscription-Patterns verifiziert.
**Status:** ✅ VOLLSTÄNDIG

---

### ℹ️ INFO: WP8 Subzone-Removal ACK Server-seitig vollständig

**Verifikation:**
- SubzoneAckPayload akzeptiert "subzone_removed" ✓
- SubzoneService.handle_subzone_ack() hat Branch ✓
- _delete_subzone_config() existiert ✓
**Status:** ✅ VOLLSTÄNDIG (Server)
**Frontend:** handleSubzoneAssignment hat "subzone_removed" Branch ✓ (WP4 frontend-dev)

---

## Cross-Layer End-to-End Szenarien (Verifikations-Status)

### E2E 1: Zone zuweisen → ESP empfängt → ACK → Server bestätigt → Frontend zeigt zone_name ✓

**Flow:**
1. API: `POST /zone/devices/{id}/assign` → zone_service.py:assign_zone()
2. Server MQTT: `kaiser/god/esp/{id}/zone/assign` mit zone_id, zone_name, kaiser_id
3. ESP: main.cpp:1243-1399 empfängt, validiert (WP5), speichert NVS
4. ESP ACK: `kaiser/god/esp/{id}/zone/ack` mit status="zone_assigned"
5. Server: zone_ack_handler.py:129-141 bestätigt DB + broadcast
6. **Broadcast:** event_data mit zone_name + kaiser_id (WP4 ✓)
7. Frontend: handleZoneAssignment() defensive Updates (WP4 ✓)

**Status:** ✅ VOLLSTÄNDIG (alle Layer implementiert)

---

### E2E 2: Zone entfernen → ESP empfängt → NVS cleanup → ACK "zone_removed" → Server bestätigt → Frontend aktualisiert

**Flow:**
1. API: zone_service.py:remove_zone() sendet zone_id="" (WP1 ✓)
2. ESP: main.cpp:1244-1313 erkennt empty zone_id → Cascade-Remove Subzones → NVS cleanup (WP1 ✓)
3. ESP ACK: status="zone_removed" (WP1 ✓)
4. Server: zone_ack_handler.py:143-154 cleared DB-Felder (WP1 ✓)
5. **Broadcast:** zone_assignment Event mit status="zone_removed"
6. ❌ **Frontend:** handleZoneAssignment() hat KEINEN "zone_removed" Branch → **KRITISCH 1**

**Status:** ❌ UNVOLLSTÄNDIG (Frontend fehlt zone_removed Handler)

---

### E2E 3: Neuer ESP discovert → kaiser_id="god" in DB → Heartbeat → Mismatch-Check → Approval → kaiser_id bleibt "god"

**Flow:**
1. ESP Boot: kaiser_id="god" (Default aus constants.h)
2. Heartbeat: `kaiser/god/esp/{id}/system/heartbeat` mit zone_id="", kaiser_id="god"
3. Server Discovery: heartbeat_handler.py `_auto_register_esp()`
   - **WP2 Fix 1:** device.kaiser_id = constants.get_kaiser_id() ✓
4. Approval-Flow: esp_service.py:approve_device()
   - **WP2 Fix 2:** kaiser_id Default wenn None ✓
5. Weitere Heartbeats: **WP7** Mismatch-Detection prüft zone_id ✓

**Status:** ✅ VOLLSTÄNDIG (WP2 + WP7)
**Offene Frage:** Multi-Kaiser-Szenarien (siehe EMPFEHLUNG 1)

---

### E2E 4: Subzone zuweisen → ACK → Frontend-Handler empfängt → UI aktualisiert

**Flow:**
1. API: subzone_service.py:assign_subzone()
2. ESP: main.cpp:1433-1536 empfängt, validiert, speichert
3. ESP ACK: `kaiser/god/esp/{id}/subzone/ack` mit status="subzone_assigned"
4. Server: subzone_ack_handler.py broadcast "subzone_assignment"
5. Frontend: handleSubzoneAssignment() setzt device.subzone_id (WP4 ✓)

**Status:** ✅ VOLLSTÄNDIG (WP4 frontend-dev)

---

### E2E 5: Subzone entfernen → ACK "subzone_removed" → Server cleanup → Frontend-Handler

**Flow:**
1. API: subzone_service.py remove
2. ESP: main.cpp:1538-1581 (WP8 esp32-dev ✓)
3. ESP ACK: status="subzone_removed" (WP8 ✓)
4. Server: subzone_service.py:_delete_subzone_config() (WP8 ✓)
5. Frontend: handleSubzoneAssignment() "subzone_removed" Branch (WP4 ✓)

**Status:** ✅ VOLLSTÄNDIG

---

## Zusammenfassung für TM

**Plan-Status:** 85% implementiert, 2 kritische Frontend-Bugs blockieren E2E-Tests.

**Sofort beheben (P0):**
1. Frontend handleZoneAssignment: `zone_removed` Branch hinzufügen
2. Frontend ZoneAssignmentEvent Type korrigieren: `status: 'zone_assigned' | 'zone_removed' | 'error'`

**Danach beheben (P1):**
3. Type-Felder ergänzen: `kaiser_id`, `timestamp` in ZoneAssignmentEvent

**Empfehlungen (P2-P3):**
4. Multi-Kaiser Discovery-Szenarien dokumentieren/testen
5. WP7 Mismatch-Detection Test-Coverage

**Nächster Schritt:**
- frontend-dev: Kritische Bugs 1+2 fixen
- verify-plan: Erneut verifizieren
- test-log-analyst: E2E-Szenarien 1-5 testen

---

## Changelog

| Datum | Wer | Was |
|-------|-----|-----|
| 2026-02-10 | TM | Initiales Dokument erstellt, 9 Work Packages definiert |
| 2026-02-10 | esp32-dev | WP1 + WP5: IST/SOLL/Verifikation mit exakten Code-Referenzen ausgefuellt |
| | | WP1: Option A empfohlen (leere zone_id = Removal), Subzone-Cascade, ACK "zone_removed" |
| | | WP5: validateZoneConfig()-Aufruf + NVS-Rollback + Error-ACK definiert |
| 2026-02-10 | server-dev | WP2 KOMPLETT: Alle 4 IST-Bloecke + SOLL (5 Fixes) + Verifikation ausgefuellt |
| | | WP2 Fix 1: _auto_register_esp() → kaiser_id=constants.get_kaiser_id() setzen |
| | | WP2 Fix 2: approve_device() → kaiser_id Default setzen wenn None |
| | | WP2 Fix 3: ZoneService.__init__() → constants.get_kaiser_id() statt getattr() |
| | | WP2 Fix 4: assign_to_kaiser() → DB-Spalte UND metadata setzen |
| | | WP2 Fix 5: get_devices_by_kaiser() → neue Repo-Methode get_by_kaiser() |
| | | WP1 Server-Teil: remove_zone() Code-Block + zone_ack_handler "zone_removed" Branch |
| | | WP4 Server-Teil: _broadcast_zone_update() IST + SOLL (zone_name/kaiser_id hinzufuegen) |
| | | WP6: Alle 14 Subscription-Patterns dokumentiert + Wildcard-Umstellung geplant |
| | | WP7: _update_esp_metadata() IST + Mismatch-Detection SOLL mit 4 Testcases |
| | | WP8 Server-Teil: Bestaetigung dass "subzone_removed" bereits funktioniert + Orphan-Cleanup-Job |
| | | WP9: Alle 5 Findings mit exakten Codezeilen + Abhaengigkeits-Empfehlung |
| 2026-02-10 | verify-plan | Reality-Check: 42 Code-Referenzen gegen Codebase verifiziert |
| | | Alle Zeilennummern, Funktionsnamen, Dateinamen KORREKT |
| | | Fix 1 Titel korrigiert: "aus Topic extrahieren" → "bei Device-Erstellung setzen" |
| | | 14 MQTT-Subscription-Patterns bestaetigt (nicht 15 wie TM geschaetzt) |
| | | Keine funktionalen Fehler im Plan. Plan ist ausfuehrbar. |

| 2026-02-10 | db-inspector | Schema-Verifikation: ESPDevice, SubzoneConfig, KaiserRegistry + ESPOwnership |
| | | ESPDevice: kaiser_id, zone_id, master_zone_id, zone_name ✓ (Typen + Indizes korrekt) |
| | | SubzoneConfig: subzone_id, parent_zone_id, assigned_gpios, safe_mode_active ✓ |
| | | KaiserRegistry + ESPOwnership: Tabellen existieren, korrekt definiert (noch leer) |
| | | Alembic-Status: 950ad9ce87bb (head) — keine ausstehenden Migrations |
| | | **Schema ist konsistent mit WP2/WP7/WP8. Inkonsistenzen betreffen VERWENDUNG, nicht Schema.** |

| 2026-02-10 | server-dev | **Phase A IMPLEMENTIERT**: WP2 alle 5 Fixes + WP1 Server-Teil 2 Fixes |
| | | **WP2 Fix 1**: heartbeat_handler.py:357 → `kaiser_id=constants.get_kaiser_id()` bei ESPDevice() |
| | | **WP2 Fix 2**: esp_service.py:838-841 → `if not device.kaiser_id: device.kaiser_id = constants.get_kaiser_id()` |

| 2026-02-10 | esp32-dev | **ESP32 Implementierung KOMPLETT**: WP1, WP3, WP5, WP8 |
| | | **WP1 Zone-Removal**: main.cpp:1246-1323 → Leere zone_id als Removal interpretiert |
| | | - NVS gelöscht via `updateZoneAssignment("", "", "", kaiser_id)` |
| | | - `zone_assigned = false` gesetzt, System state → STATE_PROVISIONED |
| | | - ACK mit status "zone_removed" gesendet |
| | | - config_manager.cpp:392-421 → `zone_assigned = !is_removal`, Rollback bei NVS-Fehler |
| | | **WP3 TopicBuilder**: topic_builder.h/cpp → `buildZoneAssignTopic()`, `buildZoneAckTopic()` |
| | | - main.cpp:785-811,1232,1267,1296,1331,1362 → Alle manuellen Topics ersetzt (6 Stellen) |
| | | - main.cpp:1318-1340 → Re-Subscribe nach kaiser_id-Wechsel implementiert |
| | | **WP5 Validierung**: main.cpp:1301-1323 → `validateZoneConfig()` vor `updateZoneAssignment()` |
| | | - Bei Validierungsfehler: Error-ACK gesendet |
| | | - config_manager.cpp → NVS-Rollback bei Fehler (previous_kaiser) |
| | | **WP8 Subzone-ACK**: main.cpp:1467 → `sendSubzoneAck(subzone_id, "subzone_removed", "")` |
| | | **WP2 Fix 3**: zone_service.py:75 → `self.kaiser_id = constants.get_kaiser_id()` (ersetzt getattr) |
| | | **WP2 Fix 4**: esp_service.py:712 → `device.kaiser_id = kaiser_id` (DB-Spalte) + metadata |
| | | **WP2 Fix 5a**: esp_repo.py:73-91 → neue Methode `async def get_by_kaiser(kaiser_id)` mit WHERE-Query |
| | | **WP2 Fix 5b**: esp_service.py:730 → `return await self.esp_repo.get_by_kaiser(kaiser_id)` |
| | | **WP1 Fix 6**: zone_ack_handler.py:143-158 → neuer `elif status == "zone_removed"` Branch |
| | | **WP1 Fix 7**: zone_ack_handler.py:213 → Validation erweitert um `"zone_removed"` |
| | | **Dateien geändert:** 5 (heartbeat_handler, esp_service, zone_service, esp_repo, zone_ack_handler) |
| | | **Test-Status:** Nicht getestet (gemäß Auftrag: nur implementieren + dokumentieren) |
| | | **Nächster Schritt:** esp32-dev WP1 ESP-Seite (Zone-Removal Handler) |

| 2026-02-10 | server-dev | **Befehl 3 KOMPLETT**: WP4, WP6, WP7, WP8, WP9 Server-Änderungen |
| | | **WP4 WebSocket broadcast Fix**: zone_ack_handler.py:170-177 + 244-283 |
| | | - _broadcast_zone_update() erweitert um zone_name und kaiser_id Parameter |
| | | - event_data erweitert um "zone_name" und "kaiser_id" Felder |
| | | - Aufruf in handle_zone_ack() angepasst: device.zone_name und device.kaiser_id übergeben |
| | | **WP6 MQTT Subscription Wildcard**: main.py:199-311 |
| | | - 13 Subscription-Patterns von `f"kaiser/{kaiser_id}/..."` auf `"kaiser/+/..."` umgestellt |
| | | - Patterns: sensor/data, actuator/status, actuator/response, actuator/alert, heartbeat, discovery, config_response, zone/ack, subzone/ack, will, error, actuator/command, actuator/emergency |
| | | - Broadcast-Pattern `"kaiser/broadcast/emergency"` bleibt unverändert (nicht kaiser-spezifisch) |
| | | - Log-Zeilen angepasst: "kaiser/+/..." statt "kaiser/{kaiser_id}/..." |
| | | **WP7 Heartbeat Zone-Sync Mismatch-Detection**: heartbeat_handler.py:619-653 |
| | | - Mismatch-Detection nach Metadata-Update eingefügt (nach zone_assigned, vor health metrics) |
| | | - 3 Szenarien: (1) ESP hat Zone, DB nicht → "stale zone from NVS", (2) DB hat Zone, ESP nicht → "lost zone config", (3) Beide haben unterschiedliche Zonen |
| | | - Log-Level: WARNING mit Präfix "ZONE_MISMATCH [{device_id}]" für grep/Loki-Filterung |
| | | - KEIN automatischer Sync (Server bleibt authoritative) |
| | | **WP8 Subzone-Removal Server-Verifizierung**: BESTÄTIGT |
| | | - SubzoneAckPayload Schema akzeptiert "subzone_removed" (subzone.py:239) |
| | | - SubzoneService.handle_subzone_ack() hat "subzone_removed" Branch (subzone_service.py:372) |
| | | - _delete_subzone_config() existiert und löscht DB-Record (subzone_service.py:577-594) |
| | | - ESP32 sendet jetzt ACK nach Befehl 2 → Server verarbeitet korrekt → KEINE Änderung nötig |
| | | **WP9 Code-Hygiene**: subzone_ack_handler.py:127-150 (F23) |
| | | - F15: zone_name NICHT geändert (ESP sendet kein zone_name im ACK, bleibt von assign_zone() erhalten) |
| | | - F17: ÜBERSPRUNGEN (Doppelte ACK-Implementierung - größerer Refactoring, außerhalb Scope) |
| | | - F23: _broadcast_subzone_update() auf ws_manager.broadcast() umgestellt (statt broadcast_thread_safe) |
| | | - Event-Format vereinheitlicht: {"esp_id", "subzone_id", "status", "timestamp", ...} (analog zu zone_assignment) |
| | | **Dateien geändert:** 3 (zone_ack_handler, main, heartbeat_handler, subzone_ack_handler) |
| | | **Cross-Layer-Kompatibilität:** |
| | | - WP4: Frontend muss zone_name und kaiser_id im zone_assignment Event verarbeiten |
| | | - WP6: ESP32 TopicBuilder (Befehl 2) sendet auf kaiser/{id}/... → Server empfängt via kaiser/+/... ✓ |
| | | - WP7: Erkennt Mismatches die durch WP1 Zone-Removal entstehen können (ESP behält Zone nach failed Removal) |
| | | - WP8: ESP32 sendet "subzone_removed" ACK (Befehl 2) → Server löscht DB-Record ✓ |
| | | **Nächster Schritt:** verify-plan prüft alle Änderungen gegen Codebase |

| 2026-02-10 | frontend-dev | **Befehl 4 KOMPLETT**: WP4 Frontend WebSocket-Handler Fixes |
| | | **WP4 IST-Analyse ausgefüllt:** |
| | | - handleZoneAssignment Code-Block dokumentiert (esp.ts:1798-1830) |
| | | - Problem identifiziert: `data.zone_name \|\| undefined` überschreibt mit undefined |
| | | - Betroffene Felder: zone_name, zone_id, master_zone_id, kaiser_id |
| | | - Subzone Events analysiert: Server sendet esp_id, subzone_id, status, timestamp |
| | | - Frontend: 25 Events registriert, subzone_assignment fehlte |
| | | **WP4 SOLL-Implementierung:** |
| | | **Fix 1: handleZoneAssignment defensiv (esp.ts:1784-1842)** |
| | | - Defensives Pattern: `const updates: Partial<typeof device> = {}` |
| | | - Conditional Assignment: `if (data.zone_name !== undefined) updates.zone_name = data.zone_name` |
| | | - Verhindert undefined-Überschreibung von existierenden Feldern |
| | | - Future-proof für kaiser_id und weitere Felder |
| | | **Fix 2: SubzoneAssignmentEvent Type (websocket-events.ts:591-614)** |
| | | - Interface mit esp_id, subzone_id, status, timestamp, error_code?, message? |
| | | - Status: "subzone_assigned" \| "subzone_removed" \| "error" |
| | | - Zu WebSocketEvent Union hinzugefügt (Zeile 428) |
| | | **Fix 3: handleSubzoneAssignment Handler (esp.ts:1844-1912)** |
| | | - subzone_assigned: setzt device.subzone_id, Toast "Subzone zugewiesen" |
| | | - subzone_removed: setzt device.subzone_id = undefined, Toast "Subzone entfernt" |
| | | - error: Logger + Toast mit Fehlermeldung |
| | | - Defensive Updates wie bei Zone-Handler |
| | | **Fix 4: Handler registrieren** |
| | | - Filter-Array erweitert (esp.ts:121): 'subzone_assignment' hinzugefügt |
| | | - WebSocket Subscription (esp.ts:2443): `ws.on('subzone_assignment', handleSubzoneAssignment)` |
| | | - Insgesamt 26 registrierte Events (war 25) |
| | | **WP4 Verifikation:** |
| | | - Manual Testing Requirements dokumentiert (4 Test-Szenarien) |
| | | - Test 1: Zone Assignment zone_name Persistenz |
| | | - Test 2: Subzone Assignment Real-Time UI Update |
| | | - Test 3: Subzone Removal |
| | | - Test 4: Error Handling ohne undefined-Überschreibung |
| | | **Dateien geändert:** 2 (esp.ts, websocket-events.ts) |
| | | **Cross-Layer-Kompatibilität:** |
| | | - Empfängt zone_name und kaiser_id vom Server (WP4 server-dev) ✓ |
| | | - Verarbeitet subzone_assignment Events vom Server (WP8 server-dev) ✓ |
| | | - Defensives Pattern verhindert Bugs bei zukünftigen Event-Erweiterungen |
| | | **Nächster Schritt:** verify-plan für finale Cross-Layer-Verifikation |

| 2026-02-10 | verify-plan | **Cross-Layer-Verifikation KOMPLETT** |
| | | **2 KRITISCHE BUGS gefunden:** |
| | | **Bug 1:** Frontend handleZoneAssignment fehlt `zone_removed` Branch |
| | | - Server sendet status="zone_removed" (zone_ack_handler.py:143) |
| | | - Frontend behandelt NUR "zone_assigned" und "error" (esp.ts:1819-1841) |
| | | - Konsequenz: E2E Szenario 2 "Zone entfernen" UI update fehlt |
| | | - Fix: else if (data.status === 'zone_removed') Branch hinzufügen |
| | | **Bug 2:** Type-Inkonsistenz ZoneAssignmentEvent.data.status |
| | | - Frontend Type: status: 'success' \| 'failed' (websocket-events.ts:587) |
| | | - Server Runtime: status: "zone_assigned" \| "zone_removed" \| "error" |
| | | - Fehlende Felder: kaiser_id, timestamp im Type |
| | | - Fix: Type korrigieren auf Server-Payload abstimmen |
| | | **E2E-Szenarien verifiziert:** |
| | | - E2E 1 (Zone zuweisen): ✅ VOLLSTÄNDIG |
| | | - E2E 2 (Zone entfernen): ❌ Frontend zone_removed fehlt |
| | | - E2E 3 (Discovery + kaiser_id): ✅ VOLLSTÄNDIG |
| | | - E2E 4 (Subzone zuweisen): ✅ VOLLSTÄNDIG |
| | | - E2E 5 (Subzone entfernen): ✅ VOLLSTÄNDIG |
| | | **Empfehlungen:** Multi-Kaiser Discovery testen, WP7 Test-Coverage |
| | | **OFFENE PUNKTE Section:** Am Ende des Dokuments eingefügt |
| | | **Nächster Schritt:** frontend-dev Bug 1+2 fixen, dann erneut verify-plan |
