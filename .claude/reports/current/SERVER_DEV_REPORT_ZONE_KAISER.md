# Server Dev Report: Zone & Kaiser Konsistenz – Phase A Implementierung

## Modus: B (Implementierung)

## Auftrag

Implementiere Phase A SERVER-SEITE aus ZONE_KAISER_IMPLEMENTATION_PLAN.md:
- **WP2 – Kaiser-ID Konsistenz:** 5 Fixes für konsistente kaiser_id Speicherung
- **WP1 – Zone-Removal Server-Teil:** 2 Fixes für "zone_removed" Status-Handling

## Codebase-Analyse

**Analysierte Dateien:**
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Zeile 321-390)
- `El Servador/god_kaiser_server/src/services/esp_service.py` (Zeile 692-839)
- `El Servador/god_kaiser_server/src/services/zone_service.py` (Zeile 70-90)
- `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py` (Zeile 45-71)
- `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py` (Zeile 120-270)
- `El Servador/god_kaiser_server/src/core/constants.py` (Zeile 76-97)

**Gefundene Patterns:**
- **Repository Pattern:** `async def get_by_zone(zone_id)` als Vorlage für neue Methoden
- **Config Access:** `constants.get_kaiser_id()` ist der RICHTIGE Weg (SubzoneService macht es richtig)
- **ACK Status Handling:** zone_ack_handler.py:128-152 zeigt if/elif/else Pattern für Status-Branches
- **DB-Spalte + Metadata:** Dual-Storage Pattern in assign_to_kaiser() gefunden (metadata-only, falsch)

## Qualitätsprüfung: 8-Dimensionen Checkliste

| # | Dimension | Prüfung | Status |
|---|-----------|---------|--------|
| 1 | Struktur & Einbindung | Alle Dateien in existierenden Services/Handlers/Repos ✓ | ✅ |
| 2 | Namenskonvention | snake_case für neue Methode get_by_kaiser() ✓ | ✅ |
| 3 | Rückwärtskompatibilität | Keine REST/MQTT/WS API Änderungen, nur DB-interne Logik ✓ | ✅ |
| 4 | Wiederverwendbarkeit | Nutzt constants.get_kaiser_id() (shared), Repository-Pattern ✓ | ✅ |
| 5 | Speicher & Ressourcen | Async DB-Queries, keine neuen Long-Running-Services ✓ | ✅ |
| 6 | Fehlertoleranz | ACK Error-Branches unverändert, neue "zone_removed" mit Logger ✓ | ✅ |
| 7 | Seiteneffekte | Keine Änderung an Safety/Logic, nur Discovery+ACK Handling ✓ | ✅ |
| 8 | Industrielles Niveau | Vollständig implementiert, keine TODOs, konsistente Patterns ✓ | ✅ |

## Cross-Layer Impact

| Bereich | Betroffen? | Prüfung |
|---------|-----------|---------|
| REST API | ❌ NEIN | Keine Response-Änderungen |
| MQTT Payload | ❌ NEIN | zone_ack_handler empfängt "zone_removed" (wird von ESP gesendet) |
| WebSocket | ❌ NEIN | Broadcast-Format unverändert |
| Frontend Types | ❌ NEIN | Keine neuen Event-Typen |
| DB Schema | ❌ NEIN | Spalten existieren bereits, nur USAGE-Fix |

## Ergebnis: Implementierung mit Dateipfaden

### WP2 – Kaiser-ID Konsistenz (5 Fixes)

#### Fix 1: Discovery setzt kaiser_id in DB-Spalte
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
**Zeile:** 357 (ESPDevice Constructor)
**Änderung:** `kaiser_id=constants.get_kaiser_id()` hinzugefügt

**IST (vor Fix):**
```python
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",
    status="pending_approval",
    discovered_at=datetime.now(timezone.utc),
    # kaiser_id NICHT gesetzt → bleibt None
    capabilities={...},
    device_metadata={...},
    last_seen=datetime.now(timezone.utc),
)
```

**SOLL (nach Fix):**
```python
new_esp = ESPDevice(
    device_id=esp_id,
    hardware_type="ESP32_WROOM",
    status="pending_approval",
    discovered_at=datetime.now(timezone.utc),
    kaiser_id=constants.get_kaiser_id(),  # WP2-Fix1: Default kaiser_id from config
    capabilities={...},
    device_metadata={...},
    last_seen=datetime.now(timezone.utc),
)
```

#### Fix 2: Approval setzt kaiser_id Default
**Datei:** `El Servador/god_kaiser_server/src/services/esp_service.py`
**Zeile:** 838-841
**Änderung:** `if not device.kaiser_id: device.kaiser_id = constants.get_kaiser_id()` hinzugefügt

**IST (vor Fix):**
```python
if name:
    device.name = name
if zone_id:
    device.zone_id = zone_id
if zone_name:
    device.zone_name = zone_name
# kaiser_id wird NICHT gesetzt

logger.info(f"Device approved: {device_id} by {approved_by}")
return device
```

**SOLL (nach Fix):**
```python
if name:
    device.name = name
if zone_id:
    device.zone_id = zone_id
if zone_name:
    device.zone_name = zone_name

# WP2-Fix2: Set kaiser_id if not already set
if not device.kaiser_id:
    from ..core import constants
    device.kaiser_id = constants.get_kaiser_id()

logger.info(f"Device approved: {device_id} by {approved_by}")
return device
```

#### Fix 3: ZoneService nutzt get_kaiser_id()
**Datei:** `El Servador/god_kaiser_server/src/services/zone_service.py`
**Zeile:** 75
**Änderung:** `self.kaiser_id = constants.get_kaiser_id()` ersetzt `getattr(constants, "KAISER_ID", "god")`

**IST (vor Fix):**
```python
self.esp_repo = esp_repo
self.publisher = publisher or Publisher()
# Get kaiser_id from constants (default: "god")
self.kaiser_id = getattr(constants, "KAISER_ID", "god")  # FALSCH: getattr findet "KAISER_ID" nicht
```

**SOLL (nach Fix):**
```python
self.esp_repo = esp_repo
self.publisher = publisher or Publisher()
# WP2-Fix3: Get kaiser_id from config (default: "god")
self.kaiser_id = constants.get_kaiser_id()  # RICHTIG: nutzt settings.hierarchy.kaiser_id
```

#### Fix 4: assign_to_kaiser() nutzt DB-Spalte
**Datei:** `El Servador/god_kaiser_server/src/services/esp_service.py`
**Zeile:** 712-717
**Änderung:** `device.kaiser_id = kaiser_id` vor metadata-Update hinzugefügt

**IST (vor Fix):**
```python
device = await self.esp_repo.get_by_device_id(device_id)
if not device:
    return False

metadata = device.device_metadata or {}
metadata["kaiser_id"] = kaiser_id  # NUR metadata, NICHT DB-Spalte!
device.device_metadata = metadata

logger.info(f"ESP {device_id} assigned to Kaiser {kaiser_id}")
return True
```

**SOLL (nach Fix):**
```python
device = await self.esp_repo.get_by_device_id(device_id)
if not device:
    return False

# WP2-Fix4: Set kaiser_id in DB column (indexed, queryable)
device.kaiser_id = kaiser_id
# Also update metadata for backward compatibility
metadata = device.device_metadata or {}
metadata["kaiser_id"] = kaiser_id
device.device_metadata = metadata

logger.info(f"ESP {device_id} assigned to Kaiser {kaiser_id}")
return True
```

#### Fix 5a: ESPRepository - neue Methode get_by_kaiser()
**Datei:** `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py`
**Zeile:** 73-91 (neu eingefügt nach get_by_master_zone)
**Änderung:** Neue Methode mit WHERE-Query statt Full-Table-Scan

**SOLL (neu):**
```python
async def get_by_kaiser(self, kaiser_id: str) -> list[ESPDevice]:
    """
    Get all ESP devices assigned to a Kaiser node.

    WP2-Fix5a: DB-Query via indexed kaiser_id column instead of metadata filter.

    Args:
        kaiser_id: Kaiser node identifier

    Returns:
        List of ESPDevice instances
    """
    stmt = select(ESPDevice).where(ESPDevice.kaiser_id == kaiser_id)
    result = await self.session.execute(stmt)
    return list(result.scalars().all())
```

#### Fix 5b: ESPService - get_devices_by_kaiser() nutzt Repository
**Datei:** `El Servador/god_kaiser_server/src/services/esp_service.py`
**Zeile:** 730
**Änderung:** `return await self.esp_repo.get_by_kaiser(kaiser_id)` ersetzt Full-Table-Scan

**IST (vor Fix):**
```python
async def get_devices_by_kaiser(self, kaiser_id: str) -> List[ESPDevice]:
    """Get all ESP devices assigned to a Kaiser node."""
    all_devices = await self.esp_repo.get_all()  # FULL-TABLE-SCAN!
    return [
        d for d in all_devices
        if d.device_metadata and d.device_metadata.get("kaiser_id") == kaiser_id
    ]  # Python-Filter statt SQL WHERE
```

**SOLL (nach Fix):**
```python
async def get_devices_by_kaiser(self, kaiser_id: str) -> List[ESPDevice]:
    """
    Get all ESP devices assigned to a Kaiser node.

    WP2-Fix5b: Use DB-Query via Repository instead of full-table-scan.
    """
    return await self.esp_repo.get_by_kaiser(kaiser_id)
```

### WP1 – Zone-Removal Server-Teil (2 Fixes)

#### Fix 6: zone_ack_handler - "zone_removed" Status-Handling
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`
**Zeile:** 143-158 (neuer elif-Branch)
**Änderung:** Neuer Status "zone_removed" zwischen "zone_assigned" und "error"

**IST (vor Fix):**
```python
if status == "zone_assigned":
    device.zone_id = zone_id if zone_id else None
    device.master_zone_id = master_zone_id if master_zone_id else None
    # ...
    logger.info(f"Zone assignment confirmed for {esp_id_str}: ...")

elif status == "error":
    logger.error(f"Zone assignment failed for {esp_id_str}: {error_message}")

else:
    logger.warning(f"Unknown zone ACK status from {esp_id_str}: {status}")
```

**SOLL (nach Fix):**
```python
if status == "zone_assigned":
    device.zone_id = zone_id if zone_id else None
    device.master_zone_id = master_zone_id if master_zone_id else None
    # ...
    logger.info(f"Zone assignment confirmed for {esp_id_str}: ...")

elif status == "zone_removed":
    # WP1-Fix6: Handle zone removal confirmation
    device.zone_id = None
    device.master_zone_id = None
    device.zone_name = None
    # device.kaiser_id remains unchanged (by design, F24)

    # Clear pending assignment from metadata
    if device.device_metadata and "pending_zone_assignment" in device.device_metadata:
        del device.device_metadata["pending_zone_assignment"]

    logger.info(f"Zone removal confirmed for {esp_id_str}")

elif status == "error":
    logger.error(f"Zone assignment failed for {esp_id_str}: {error_message}")

else:
    logger.warning(f"Unknown zone ACK status from {esp_id_str}: {status}")
```

#### Fix 7: zone_ack_handler - Validation erweitern
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py`
**Zeile:** 213
**Änderung:** Validation-Tuple um "zone_removed" erweitert

**IST (vor Fix):**
```python
status = payload.get("status")
if status not in ("zone_assigned", "error"):
    return {
        "valid": False,
        "error": f"Invalid status value: {status}",
        "error_code": ValidationErrorCode.INVALID_PAYLOAD_FORMAT,
    }
```

**SOLL (nach Fix):**
```python
status = payload.get("status")
if status not in ("zone_assigned", "zone_removed", "error"):  # WP1-Fix7: added "zone_removed"
    return {
        "valid": False,
        "error": f"Invalid status value: {status}",
        "error_code": ValidationErrorCode.INVALID_PAYLOAD_FORMAT,
    }
```

## Verifikation

**Test-Status:** NICHT getestet (gemäß Auftrag: "Teste NICHTS. Nur implementieren und dokumentieren.")

**Empfohlene Verifikation (für später):**
1. **WP2 Fix 1:** Discovery via Heartbeat → DB-Query `SELECT kaiser_id FROM esp_devices WHERE device_id = 'ESP_TEST01'` → Erwartet: `"god"` (nicht NULL)
2. **WP2 Fix 2:** Device approval → DB prüfen: kaiser_id gesetzt
3. **WP2 Fix 3:** ZoneService instanziieren → `self.kaiser_id` prüfen (sollte aus Settings kommen)
4. **WP2 Fix 4+5:** `assign_to_kaiser("ESP_TEST01", "node_alpha")` → DB-Query `WHERE kaiser_id='node_alpha'` findet Device
5. **WP1 Fix 6+7:** MQTT-Message `{"esp_id":"ESP_TEST01","status":"zone_removed","ts":...}` auf `kaiser/god/esp/ESP_TEST01/zone/ack` → DB prüfen: `zone_id=None`, Log enthält "Zone removal confirmed"

**pytest-Testdateien zu erweitern:**
- `tests/unit/services/test_esp_service.py` (approve_device setzt kaiser_id, get_by_kaiser nutzt Repo)
- `tests/unit/services/test_zone_service.py` (__init__ nutzt get_kaiser_id)
- `tests/integration/mqtt/test_heartbeat_handler.py` (Discovery setzt kaiser_id)
- `tests/integration/mqtt/test_zone_ack_handler.py` (zone_removed Status wird verarbeitet)

## Empfehlung

**Nächster Agent:** `esp32-dev` für WP1 ESP-Seite (Zone-Removal Handler in main.cpp:1246-1309)

**Nächste Phase:** Nach esp32-dev WP1 → **Verifikation** durch Wokwi-Simulation:
1. Zone zuweisen → ESP ACK → Zone entfernen → ESP ACK "zone_removed" → DB prüfen
2. Discovery mit Heartbeat → DB prüfen: kaiser_id="god"

**Cross-Layer Check:** KEINE weiteren Änderungen nötig. Frontend/MQTT/REST-API unverändert.

**Dokumentation aktualisiert:** ZONE_KAISER_IMPLEMENTATION_PLAN.md Changelog (Zeile 1737-1746)

---

**Zusammenfassung:**
- **7 Fixes implementiert** (5x WP2, 2x WP1)
- **5 Dateien geändert** (heartbeat_handler, esp_service, zone_service, esp_repo, zone_ack_handler)
- **Pattern-konform:** Repository-Pattern, Config-Access via get_kaiser_id(), ACK Status-Branches
- **Keine Breaking Changes:** DB-Schema unverändert, API unverändert, nur interne Logik
- **Bereit für:** ESP32-seitige Implementation (WP1 Zone-Removal Handler)
