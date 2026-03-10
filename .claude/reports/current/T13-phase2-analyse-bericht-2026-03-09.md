# T13-Phase2 Analysebericht: MQTT Communication Hardening

> **Datum:** 2026-03-09
> **Typ:** Vollstaendige Code-Analyse (kein Code geaendert)
> **Bezug:** T13-System-Konsolidierung, Phase 2
> **Ziel:** Implementierungsfertiger Analysebericht fuer MQTTCommandBridge

---

## Inhaltsverzeichnis

1. [MQTT-Publisher-Architektur](#1-mqtt-publisher-architektur)
2. [ACK-Handler-Flows](#2-ack-handler-flows)
3. [zone_service.assign_zone() Detailflow](#3-zone_serviceassign_zone-detailflow)
4. [Heartbeat-Handler Mismatch-Logik](#4-heartbeat-handler-mismatch-logik)
5. [asyncio und DI-Infrastruktur](#5-asyncio-und-di-infrastruktur)
6. [MQTT-Operations-Inventar](#6-mqtt-operations-inventar)
7. [Integrationsplan](#7-integrationsplan)

---

## 1. MQTT-Publisher-Architektur

### 1.1 Library und Protokoll

- **MQTT Library:** `paho-mqtt` direkt (NICHT gmqtt, NICHT fastapi-mqtt)
- **MQTT Version:** 3.1.1 (`mqtt.MQTTv311` in `client.py:245`)
- **Kein MQTT 5 Correlation Data** — Payload-basierte `correlation_id` ist der einzige Weg

### 1.2 MQTTClient — Singleton

**Datei:** `src/mqtt/client.py` (Klasse `MQTTClient`, Zeile 85)

```python
class MQTTClient:
    _instance: Optional["MQTTClient"] = None   # Singleton

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def get_instance(cls) -> "MQTTClient":    # Zeile 183
        ...
```

**Initialisierung:** `main.py:189-190`
```python
mqtt_client = MQTTClient.get_instance()
connected = mqtt_client.connect()   # SYNCHRON, blockiert max 10s
```

**Thread-Modell:** `self.client.loop_start()` (Zeile 278) startet einen paho-internen **Background-Thread** fuer die Netzwerk-IO. Der `_event_loop` (FastAPI-Loop) wird in `connect()` gespeichert:
```python
self._event_loop = asyncio.get_running_loop()   # Zeile 218
```

**publish() Signatur** (`client.py:413`):
```python
def publish(self, topic: str, payload: str, qos: int = 1, retain: bool = False) -> bool:
```
- **Synchron** (nicht async)
- **Payload als JSON-String** (bereits serialisiert)
- **Circuit Breaker:** `self._circuit_breaker.allow_request()` vor Publish
- **Offline Buffer:** Bei Disconnect wird Message in `MQTTOfflineBuffer` gepuffert

### 1.3 Publisher — Wrapper mit Retry

**Datei:** `src/mqtt/publisher.py` (Klasse `Publisher`, Zeile 28)

```python
class Publisher:
    def __init__(self, mqtt_client: Optional[MQTTClient] = None):
        self.client = mqtt_client or MQTTClient.get_instance()   # Zeile 41-48
```

**Instanziierung:**
- `api/deps.py:638-650`: `get_mqtt_publisher()` — module-level Singleton via `_publisher_singleton`
- Services (`zone_service.py:60`, `subzone_service.py:83`): `self.publisher = publisher or Publisher()`

**Kern-Methode** `_publish_with_retry()` (Zeile 355):
```python
def _publish_with_retry(self, topic: str, payload: Dict[str, Any], qos: int, retry: bool) -> bool:
```
- **Synchron** mit `time.sleep()` Backoff
- Exponential Backoff mit Jitter via `calculate_backoff_delay()`
- JSON-Serialisierung in dieser Methode

**KRITISCHER BEFUND:** Zone/Subzone-Services **umgehen** `_publish_with_retry()` und rufen direkt `self.publisher.client.publish()` auf — kein Retry fuer Zone/Subzone-Operationen!

### 1.4 TopicBuilder

**Datei:** `src/mqtt/topics.py` (Klasse `TopicBuilder`, statische Methoden)

**Topic-Schema** (`kaiser_id` default = `"god"`):

| Richtung | Methode | Topic-Format |
|----------|---------|--------------|
| Server→ESP | `build_zone_assign_topic(esp_id)` | `kaiser/{k}/esp/{esp_id}/zone/assign` |
| ESP→Server | `parse_zone_ack_topic(topic)` | `kaiser/{k}/esp/{ESP_ID}/zone/ack` |
| Server→ESP | `build_subzone_assign_topic(esp_id)` | `kaiser/{k}/esp/{esp_id}/subzone/assign` |
| Server→ESP | `build_subzone_remove_topic(esp_id)` | `kaiser/{k}/esp/{esp_id}/subzone/remove` |
| Server→ESP | `build_subzone_safe_topic(esp_id)` | `kaiser/{k}/esp/{esp_id}/subzone/safe` |
| ESP→Server | `parse_subzone_ack_topic(topic)` | `kaiser/{k}/esp/{ESP_ID}/subzone/ack` |
| ESP→Server | `parse_heartbeat_topic(topic)` | `kaiser/{k}/esp/{ESP_ID}/system/heartbeat` |
| Server→ESP | `build_heartbeat_ack_topic(esp_id)` | `kaiser/{k}/esp/{esp_id}/system/heartbeat/ack` |

**Topic-Parsing:** `parse_topic(topic)` (Zeile 915) probiert alle Parser sequentiell. Regex-Pattern: `r"kaiser/([a-zA-Z0-9_]+)/esp/([A-Z0-9_]+)/..."`. ESP-ID ist immer Gruppe 2.

**ESP-ID-Validierung:** `validate_esp_id()` (Zeile 958): `r"^ESP_[A-F0-9]{6,8}$"`

### 1.5 QoS-Konstanten

**Datei:** `src/core/constants.py:204-208`

| Konstante | Wert | Verwendung |
|-----------|------|------------|
| `QOS_SENSOR_DATA` | 1 | Zone/Subzone-Publishes |
| `QOS_ACTUATOR_COMMAND` | 2 | Actuator-Commands |
| `QOS_SENSOR_COMMAND` | 2 | Sensor-Trigger |
| `QOS_HEARTBEAT` | 0 | Heartbeat |
| `QOS_CONFIG` | 2 | Config-Push |

### 1.6 Fazit fuer MQTTCommandBridge

Die Bridge soll:
- Den `MQTTClient` Singleton nutzen (nicht den `Publisher`)
- `client.publish(topic, json.dumps(payload), qos=1)` aufrufen (gleicher Pfad wie zone/subzone-Services)
- Als **eigener Service neben dem Publisher** existieren (nicht als Wrapper)
- Die Bridge ist async, der `client.publish()` ist sync — Bridge-Methode wrapped den sync-Call

---

## 2. ACK-Handler-Flows

### 2.1 Zone-ACK-Handler

**Datei:** `src/mqtt/handlers/zone_ack_handler.py`
**Klasse:** `ZoneAckHandler` (Zeile 49)
**Entry-Point:** `handle_zone_ack(topic, payload) -> bool` (Zeile 306, module-level)
**Registrierung:** `main.py:248-250`, Pattern `"kaiser/+/esp/+/zone/ack"`

#### Flow (Schritt-fuer-Schritt):

| Schritt | Zeile | Aktion |
|---------|-------|--------|
| 1 | 86-94 | `TopicBuilder.parse_zone_ack_topic(topic)` → `esp_id_str` extrahieren |
| 2 | 99-108 | `_validate_payload(payload)` — Pflicht: `status`, `ts` |
| 3 | 111-115 | Felder extrahieren: `status`, `zone_id`, `master_zone_id`, `ts`, `message` |
| 4 | 118 | `async with resilient_session() as session:` |
| 5 | 122-128 | `esp_repo.get_by_device_id(esp_id_str)` |
| 6a | 131-148 | **`zone_assigned`:** `device.zone_id = zone_id`, `device.master_zone_id = master_zone_id`, loesche `pending_zone_assignment` aus `device_metadata` |
| 6b | 150-166 | **`zone_removed`:** `device.zone_id = None`, `.master_zone_id = None`, `.zone_name = None`, loesche `pending_zone_assignment` |
| 6c | 168-170 | **`error`:** nur `logger.error(error_message)`, KEIN DB-Update, pending bleibt |
| 7 | 175 | `await session.commit()` |
| 8 | 178-187 | `_broadcast_zone_update()` → WS `"zone_assignment"` Event |

#### Verifizierte Payload-Struktur (Zone-ACK):

```json
{
  "status": "zone_assigned" | "zone_removed" | "error",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "ts": 1741564800,
  "message": "..."
}
```

**KORREKTUR gegenueber Auftrag:** Feldname ist `"ts"` (NICHT `"timestamp"`). `"master_zone_id"` ist ein zusaetzliches Feld das im Auftrag fehlte.

#### Integrationspoint fuer resolve_ack()

**Einfuegen NACH Zeile 175 (commit), VOR Zeile 178 (broadcast):**
```python
await session.commit()      # Zeile 175 (bestehend)
# >>> EINFUEGEN: resolve_ack() <<<
if self._command_bridge:
    self._command_bridge.resolve_ack(
        ack_data={"status": status, "zone_id": zone_id, "esp_id": esp_id_str},
        esp_id=esp_id_str
    )
await self._broadcast_zone_update(...)  # Zeile 178 (bestehend)
```

Fuer `status == "error"` ebenfalls resolve_ack() aufrufen — die Future soll mit Error-Status aufgeloest werden, nicht endlos warten.

### 2.2 Subzone-ACK-Handler

**Datei:** `src/mqtt/handlers/subzone_ack_handler.py`
**Klasse:** `SubzoneAckHandler` (Zeile 41)
**Entry-Point:** `handle_subzone_ack(topic, payload) -> bool` (Zeile 159)
**Registrierung:** `main.py:252-254`, Pattern `"kaiser/+/esp/+/subzone/ack"`

#### Flow (Schritt-fuer-Schritt):

| Schritt | Zeile | Aktion |
|---------|-------|--------|
| 1 | 65-73 | `TopicBuilder.parse_subzone_ack_topic(topic)` → `esp_id` |
| 2 | 76-79 | `_validate_payload(payload)` via Pydantic `SubzoneAckPayload` |
| 3 | 81-84 | Logging |
| 4 | 87 | `async with resilient_session() as session:` |
| 5 | 88-98 | `SubzoneService.handle_subzone_ack(device_id, status, subzone_id, ...)` |
| 5a | (subzone_service.py:420) | **`subzone_assigned`:** `_confirm_subzone_assignment()` → `config.last_ack_at = now()` |
| 5b | (subzone_service.py:432) | **`subzone_removed`:** `_delete_subzone_config()` → DB-Row loeschen |
| 5c | (subzone_service.py:438) | **`error`:** nur `logger.error` |
| 6 | 101 | `await session.commit()` (nur bei success) |
| 7 | 103 | `_broadcast_subzone_update(ack_payload)` → WS `"subzone_assignment"` |

#### Verifizierte Payload-Struktur (Subzone-ACK):

```json
{
  "esp_id": "ESP_AB12CD34",
  "status": "subzone_assigned" | "subzone_removed" | "error",
  "subzone_id": "irrigation_section_A",
  "ts": 1741564800,
  "error_code": 2506,
  "message": "GPIO conflict"
}
```

**KORREKTUR:** Feldname ist `"ts"` (Pydantic alias, `subzone.py:249`). `error_code` und `message` sind optional. `esp_id` ist Pflichtfeld IM Payload (zusaetzlich zum Topic).

Gueltige Status-Werte (definiert in `src/schemas/subzone.py:271`):
```python
valid_statuses = {"subzone_assigned", "subzone_removed", "error"}
```

#### Integrationspoint fuer resolve_ack()

**Einfuegen NACH Zeile 101 (commit), VOR Zeile 103 (broadcast):**
```python
await session.commit()      # Zeile 101 (bestehend)
# >>> EINFUEGEN: resolve_ack() <<<
if self._command_bridge:
    self._command_bridge.resolve_ack(
        ack_data={
            "status": ack_payload.status,
            "subzone_id": ack_payload.subzone_id,
            "esp_id": esp_id,
            "error_code": ack_payload.error_code,
        },
        esp_id=esp_id
    )
await self._broadcast_subzone_update(...)  # Zeile 103 (bestehend)
```

### 2.3 Correlation-ID-Matching

Firmware sendet aktuell KEIN `correlation_id`. Fallback-Strategie:

1. **Exact Match:** `ack_data.get("correlation_id")` → pending Future
2. **Fallback:** `esp_id` (aus Topic geparst) + aelteste pending Future fuer diesen ESP

**Topic-Parsing Utilities existieren:** `TopicBuilder.parse_zone_ack_topic()` (Zeile 674) und `parse_subzone_ack_topic()` (Zeile 759) extrahieren `esp_id` aus dem Topic zuverlaessig.

**Concurrent Zone-Assigns fuer selben ESP:** Normalerweise nicht moeglich (ein ESP hat eine Zone). Aber: Schnelle UI-Klicks koennten theoretisch zwei `assign_zone()` Aufrufe in kurzer Folge ausloesen. Die Bridge sollte pro ESP nur **eine** pending Zone-Future erlauben (die aeltere wird cancelled).

---

## 3. zone_service.assign_zone() Detailflow

### 3.1 Signatur und Aufrufer

**Datei:** `src/services/zone_service.py`
**Klasse:** `ZoneService` (Konstruktor Zeile ~50)

```python
class ZoneService:
    def __init__(self, esp_repo: ESPRepository, publisher: Optional[Publisher] = None):
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()
        self.kaiser_id = constants.get_kaiser_id()
```

```python
async def assign_zone(
    self,
    device_id: str,
    zone_id: str,
    master_zone_id: Optional[str] = None,
    zone_name: Optional[str] = None,
    subzone_strategy: str = "transfer",
    changed_by: str = "system",
) -> ZoneAssignResponse:                    # Zeile 67-75
```

**Aufrufer:** Einziger direkter Aufrufer ist `src/api/v1/zone.py:80`:
```python
result = await zone_service.assign_zone(...)
```

Der API-Endpoint ruft danach `await db.commit()` auf (Zeile 89).

### 3.2 Aktueller Flow (mit Zeilennummern)

| # | Zeile | Aktion | Details |
|---|-------|--------|---------|
| 1 | 104-107 | ESP Lookup | `await self.esp_repo.get_by_device_id(device_id)` → ValueError wenn nicht gefunden |
| 2 | 110-123 | Zone-Validierung | `ZoneRepository(session)` → `get_by_zone_id(zone_id)` → ValueError wenn nicht gefunden ODER `status != "active"` |
| 3 | 126-137 | Subzone-Strategie | `await self._handle_subzone_strategy(...)` — NUR wenn `old_zone_id and old_zone_id != zone_id` |
| 4 | 140-154 | ESP-Felder setzen | `device.zone_id`, `.master_zone_id`, `.zone_name`, `.kaiser_id`, + `device_metadata["pending_zone_assignment"]` setzen |
| 5 | 157-166 | Audit-Log | `DeviceZoneChange(...)` → `session.add(audit_entry)` |
| 6 | 169-188 | MQTT Publish | `self._publish_zone_assignment(topic, payload)` — **fire-and-forget, synchron** |
| 7 | 191-197 | ZoneContext Sync | `ZoneContextService(session).sync_zone_name(zone_id, zone_name)` |
| 8 | 200-201 | Mock-ESP Update | `self._update_mock_esp_zone(...)` |

**WICHTIG:** DB-Writes (Schritte 4-5) liegen **VOR** MQTT-Publish (Schritt 6). Der `session.commit()` erfolgt erst im API-Endpoint **NACH** Return.

### 3.3 MQTT-Publish im Detail

**Methode:** `_publish_zone_assignment()` (`zone_service.py:533-555`)
```python
def _publish_zone_assignment(self, topic: str, payload: Dict[str, Any]) -> bool:
    payload_str = json.dumps(payload)
    qos = constants.QOS_SENSOR_DATA   # QoS 1
    success = self.publisher.client.publish(topic, payload_str, qos)
    return success
```

- **Synchron** (nicht async), kein `await`
- **Kein Retry** — umgeht `Publisher._publish_with_retry()`
- **Direkt `client.publish()`** — nur Circuit Breaker vom MQTTClient
- **Topic:** Hardcoded als `f"kaiser/{self.kaiser_id}/esp/{device_id}/zone/assign"` (Zeile 169, NICHT via TopicBuilder)
- Bei Failure: `logger.warning()`, Methode laeuft weiter, Return `ZoneAssignResponse(mqtt_sent=False)`

**Payload:**
```json
{
  "zone_id": "zone_b",
  "master_zone_id": "zone_master",
  "zone_name": "Zone B",
  "kaiser_id": "god",
  "timestamp": 1741564800
}
```

### 3.4 _handle_subzone_strategy()

**Signatur** (`zone_service.py:388`):
```python
async def _handle_subzone_strategy(
    self, device_id, old_zone_id, new_zone_id, strategy, subzone_repo
) -> List[dict]:
```

**Drei Strategien:**

| Strategie | Zeile | DB-Aktion | MQTT-Send? |
|-----------|-------|-----------|------------|
| `transfer` | 416-429 | `sz.parent_zone_id = new_zone_id` + flush | **NEIN** |
| `copy` | 431-459 | `subzone_repo.create_subzone()` (neue Eintraege) | **NEIN** |
| `reset` | 461-472 | Nichts (Subzones bleiben in old_zone als "orphaned") | **NEIN** |

**KRITISCHER BEFUND:** `_handle_subzone_strategy()` sendet **KEIN MQTT** an den ESP. Transferierte Subzones werden nur in der DB verschoben. Der ESP erhaelt **keine** `subzone/assign`-Nachrichten waehrend eines Zone-Wechsels!

Das bedeutet: Die im Auftrag beschriebene Race Condition (zone/assign gefolgt von subzone/assign) existiert im aktuellen Code **nicht**, weil es keinen Subzone-MQTT-Send gibt. Phase 2 muss diesen Send **HINZUFUEGEN** (nicht nur ACK-basiert machen).

### 3.5 remove_zone() Flow

**Signatur** (`zone_service.py:216`):
```python
async def remove_zone(self, device_id: str, changed_by: str = "system") -> ZoneRemoveResponse:
```

| # | Zeile | Aktion |
|---|-------|--------|
| 1 | 235-238 | ESP Lookup |
| 2 | 241-250 | Topic/Payload bauen (gleicher Topic `zone/assign`, leerer `zone_id`) |
| 3 | 253 | `old_zone_id` sichern |
| 4 | 256-263 | ESP-Felder loeschen: `zone_id=None`, `master_zone_id=None`, `zone_name=None` |
| 4a | 267-273 | `subzone_repo.delete_all_by_esp(device_id)` — Subzone-Cascade-Delete |
| 4b | 276-284 | Audit: `DeviceZoneChange(new_zone_id="", subzone_strategy="reset")` |
| 5 | 287-295 | MQTT Publish (fire-and-forget) via `_publish_zone_assignment()` |
| 6 | 298-299 | Mock-ESP Update |

**remove_zone sendet auf dem gleichen Topic** `zone/assign` — unterschieden durch leeren `zone_id`-Payload.

### 3.6 SOLL-Flow Uebergangsplan

Der aktuelle Flow muss wie folgt umgestellt werden:

```
AKTUELL (Zeile)                     → SOLL (Phase 2)
─────────────────────────────────────────────────────────────────
104-107: ESP Lookup                 → bleibt
110-123: Zone-Validierung           → bleibt
126-137: _handle_subzone_strategy   → bleibt (DB-only), ABER:
                                      Subzones die transferiert wurden merken (Return-Liste)
140-154: ESP-Felder setzen          → bleibt
         + pending_zone_assignment  → bleibt (bereits vorhanden!)
157-166: Audit-Log                  → bleibt
169-188: MQTT fire-and-forget       → ERSETZEN durch:
                                      ack = await command_bridge.send_and_wait_ack(topic, payload, esp_id=device_id)
                                      Bei Timeout: Error loggen, pending bleibt
NEU:                                → HINZUFUEGEN: Subzone-MQTT senden
                                      for sz in transferred_subzones:
                                          await command_bridge.send_and_wait_ack(
                                              subzone_assign_topic, sz_payload, esp_id=device_id
                                          )
                                          parent_zone_id LEER senden!
NEU:                                → pending_zone_assignment loeschen (bei Erfolg)
191-197: ZoneContext Sync           → bleibt
200-201: Mock-ESP Update            → bleibt (Mock-ESPs ueberspringen Bridge)
```

---

## 4. Heartbeat-Handler Mismatch-Logik

### 4.1 Handler-Struktur

**Datei:** `src/mqtt/handlers/heartbeat_handler.py`
**Klasse:** `HeartbeatHandler` (Zeile 46, zustandslos, kein `__init__`)
**Methode:** `async def handle_heartbeat(self, topic: str, payload: dict) -> bool` (Zeile 60)
**Topic:** `kaiser/{k}/esp/{ESP_ID}/system/heartbeat`
**Singleton:** `get_heartbeat_handler()` (Zeile 1361)

### 4.2 Heartbeat-Payload (Pflichtfelder)

| Feld | Typ | Validierung (Zeile 843) |
|------|-----|------------------------|
| `ts` | int | Pflicht, bei `ts <= 0` wird Server-Timestamp genommen |
| `uptime` | int | Pflicht |
| `heap_free` ODER `free_heap` | int | Pflicht (legacy-kompatibel) |
| `wifi_rssi` | int | Pflicht |

**Optionale Felder:** `zone_id`, `zone_assigned`, `master_zone_id`, `wifi_ip`, `sensor_count`, `actuator_count`, `gpio_status`, `boot_count`, `_source`, `error_count`

### 4.3 Zone-Mismatch-Szenarien

Alle Zone-Mismatch-Logik in `_update_esp_metadata()`, Zeilen 660-776.

**Vorbereitende Variablen (Zeilen 665-676):**
```python
heartbeat_zone_id = payload.get("zone_id", "")
heartbeat_zone_assigned = payload.get("zone_assigned", True)
db_zone_id = esp_device.zone_id or ""
esp_has_zone = bool(heartbeat_zone_id)
db_has_zone = bool(db_zone_id)
esp_lost_zone = not heartbeat_zone_assigned and db_has_zone
```

**Einstiegsbedingung (Zeile 678):**
```python
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
```

#### Szenario A: ESP hat Zone, DB hat NULL

**Zeilen:** 679-686
**Bedingung:** `if esp_has_zone and not db_has_zone:`
**Aktion:** Nur `logger.warning("ZONE_MISMATCH ... Consider re-sending zone removal")`
**Kein DB-Update, kein MQTT-Send, kein WS-Broadcast**

#### Szenario B: DB hat Zone, ESP hat keine (Auto-Resync)

**Zeilen:** 687-769
**Bedingung:** `elif (not esp_has_zone and db_has_zone) or esp_lost_zone:`

**Flow:**
1. **Zeile 696:** `logger.warning("ZONE_MISMATCH ... Auto-reassigning zone.")`
2. **Zeilen 705-717:** Cooldown-Check
   - `zone_resync_cooldown_seconds = 60` (Zeile 705)
   - Check: `current_metadata.get("zone_resync_sent_at")` → elapsed < 60 → skip
3. **Zeilen 720-738:** MQTT Send (wenn Cooldown OK)
   - Topic: `TopicBuilder.build_zone_assign_topic(device_id)`
   - Payload: `{zone_id, master_zone_id, zone_name, kaiser_id, timestamp}`
   - QoS 1
   - `current_metadata["zone_resync_sent_at"] = now_ts`
4. **Zeilen 749-763:** Mock-ESP Sonderfall (`SimulationScheduler.update_zone()`)

#### Szenario C: Beide haben Zone, aber verschieden

**Zeilen:** 770-776
**Bedingung:** Implizit `else` (esp_has_zone and db_has_zone and different)
**Aktion:** Nur `logger.warning("ZONE_MISMATCH ... Zone assignment may be inconsistent.")`
**Kein DB-Update, kein MQTT-Send, kein WS-Broadcast**

### 4.4 Cooldown-Mechanismus

- **Dauer:** 60 Sekunden (Zeile 705)
- **Speicherort:** `device_metadata["zone_resync_sent_at"]` (Unix-Timestamp int)
- **Persistiert in DB** (nicht In-Memory) — ueberlebt Server-Restarts
- **Separater Rejection-Cooldown:** `_check_rejection_cooldown()` (Zeile 485), 300 Sekunden, basiert auf `esp_device.last_rejection_at`

### 4.5 device_metadata Struktur

**Typ:** `JSON`-Spalte direkt auf `esp_devices` Model (`src/db/models/esp.py:191`):
```python
device_metadata: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
```

**Kein separates Model** — alles in einer JSON-Spalte.

**Bekannte Keys (vom Heartbeat-Handler gesetzt):**

| Key | Typ | Gesetzt in |
|-----|-----|-----------|
| `zone_id` | str | `_update_esp_metadata` Z.654 |
| `master_zone_id` | str | Z.656 |
| `zone_assigned` | bool | Z.658 |
| `zone_resync_sent_at` | int (Unix) | Z.739 |
| `zone_resync_reason` | str | Z.740 |
| `pending_zone_assignment` | — | Gesetzt in `zone_service.assign_zone()` Z.148, geloescht in `zone_ack_handler` Z.142/Z.160 |
| `heartbeat_count` | int | mehrere Stellen |
| `last_heap_free` | int | Z.779 |
| `last_wifi_rssi` | int | Z.780 |
| `last_uptime` | int | Z.785 |
| `last_heartbeat` | ISO-str | Z.792 |
| `discovery_source` | str | Z.403 |

**BEFUND:** `pending_zone_assignment` existiert bereits als Konzept! Es wird von `assign_zone()` gesetzt und vom `zone_ack_handler` geloescht. Aber: Es wird im Heartbeat-Handler **nicht geprueft** — Szenario B/C feuern trotzdem.

### 4.6 Offline-Erkennung

- **Feld:** `last_seen` auf `ESPDevice` Model (Zeile 147 in `esp.py`), `DateTime(timezone=True)`
- **Update:** `esp_repo.update_status(esp_id, "online", last_seen)` (heartbeat_handler.py:208)
- **Threshold:** `HEARTBEAT_TIMEOUT_SECONDS = 300` (5 Minuten, Zeile 43)
- **Check-Methode:** `check_device_timeouts()` (Zeile 1257) — periodischer Hintergrund-Task
- **Bei Timeout:** Status → `"offline"`, AuditLog, WS-Broadcast `"esp_health"`
- **Bei Reconnect:** Erster Heartbeat setzt automatisch `"online"` — kein expliziter Reconnect-Pfad

### 4.7 SOLL-Verhalten nach Phase 2.4

**Aenderung in `_update_esp_metadata()`, nach Zeile 678:**

```python
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
    # >>> NEU: pending-Check <<<
    pending = current_metadata.get("pending_zone_assignment")
    if pending:
        # Tolerant warten — Assignment laeuft noch
        logger.info(f"Zone mismatch for {esp_id} tolerated (pending assignment)")
        return  # KEIN Warning, kein Resync

    # ... bestehende Szenario-Logik A/B/C
```

**Empfehlung fuer pending-Flag Speicherort:** `device_metadata` JSON (bereits vorhanden und genutzt). Keine Migration noetig. Keys:
```json
{
  "pending_zone_assignment": {
    "target_zone_id": "zone_b",
    "requested_at": "2026-03-09T12:00:00Z",
    "requested_by": "admin"
  }
}
```

---

## 5. asyncio und DI-Infrastruktur

### 5.1 Event-Loop-Architektur

```
┌─────────────────────────────────────────────────┐
│  FastAPI Event Loop (main thread, asyncio)       │
│  ├── API Request Handlers                        │
│  ├── LogicEngine._evaluation_loop() (Task)       │
│  ├── LogicScheduler._scheduler_loop() (Task)     │
│  ├── WebSocket Manager                           │
│  └── MQTT Handler Coroutines (via run_coroutine_ │
│      threadsafe, dispatched from paho thread)    │
├─────────────────────────────────────────────────┤
│  paho-mqtt Network Thread (loop_start)           │
│  ├── TCP socket read/write                       │
│  ├── _on_message() callback                      │
│  └── → Subscriber._route_message()               │
│      → ThreadPool → run_coroutine_threadsafe()   │
│        → Handler laeuft auf FastAPI Event Loop    │
├─────────────────────────────────────────────────┤
│  ThreadPool ("mqtt_handler_*")                   │
│  └── _execute_handler() — Bridge zwischen        │
│      paho-Thread und FastAPI-Loop                │
└─────────────────────────────────────────────────┘
```

**Entscheidende Erkenntnis:** MQTT Handler (zone_ack_handler, subzone_ack_handler) laufen via `run_coroutine_threadsafe()` auf dem **FastAPI Event Loop** (nicht im paho-Thread). Das bedeutet:

- `asyncio.Future` erstellt auf dem FastAPI-Loop funktioniert korrekt
- `resolve_ack()` wird im selben Loop aufgerufen wie `send_and_wait_ack()` wartet
- **Kein `call_soon_threadsafe()` noetig** fuer die Future-Resolution — beide Seiten sind auf dem gleichen Loop
- `subscriber.py:212` setzt explizit: `_subscriber_instance.set_main_loop(asyncio.get_running_loop())`

**Beweis aus bestehendem Code:** `sensors.py:1722-1733` nutzt bereits das exakte Pattern:
```python
loop = asyncio.get_running_loop()
response_future: asyncio.Future = loop.create_future()
# ... callback setzt Future via loop.call_soon_threadsafe(response_future.set_result, payload)
result = await asyncio.wait_for(response_future, timeout=10.0)
```

### 5.2 Bestehende async Patterns

| Pattern | Verwendung | Datei:Zeile |
|---------|-----------|-------------|
| `asyncio.Future` + `wait_for` | OneWire Scan request/response | `sensors.py:1722-1770` |
| `asyncio.create_task()` | Logic Engine Eval-Loop | `logic_engine.py:115` |
| `asyncio.create_task()` | Logic Scheduler Loop | `logic_scheduler.py:47` |
| `asyncio.create_task()` | Auto-Push-Config nach Reconnect | `heartbeat_handler.py:1211` |
| `asyncio.wait_for(coro, timeout)` | Resilience Timeout-Decorator | `core/resilience/timeout.py:76` |
| `run_coroutine_threadsafe()` | Handler-Dispatch aus paho-Thread | `subscriber.py:287` |
| `loop.call_soon_threadsafe()` | Future-Resolution aus paho-Callback | `sensors.py:1733` |

### 5.3 DI-Patterns

**Zwei koexistierende Patterns:**

**Pattern A: FastAPI `Depends()` in API-Endpoints** (`src/api/deps.py`):
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]: ...
DBSession = Annotated[AsyncSession, Depends(get_db)]

# In zone.py:
async def assign_zone(esp_id: str, request: ZoneAssignRequest, db: DBSession, ...):
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo)    # Per-Request-Instanz
```

**Pattern B: Module-Level Globals im Lifespan** (`main.py`):
```python
_logic_engine: LogicEngine = None
_logic_scheduler: LogicScheduler = None
_websocket_manager: WebSocketManager = None
```

**Kein `app.state`** — nirgendwo im Codebase verwendet.

**Kein zentraler DI-Container** — Services werden manuell in Endpoints/Lifespan erstellt.

### 5.4 MQTTCommandBridge DI-Vorschlag

Die Bridge soll **Pattern B** folgen (Module-Level Global im Lifespan):

```python
# main.py — neue Globale:
_mqtt_command_bridge: MQTTCommandBridge = None

# Im Lifespan-Startup (nach Step 3, MQTT Handler registriert, ca. Zeile 270):
_mqtt_command_bridge = MQTTCommandBridge(mqtt_client)

# ACK-Handler bekommen Bridge-Referenz:
zone_ack_handler.set_command_bridge(_mqtt_command_bridge)
subzone_ack_handler.set_command_bridge(_mqtt_command_bridge)

# Zone/Subzone-Services bekommen Bridge per Constructor:
# In zone.py (API Router):
zone_service = ZoneService(esp_repo, command_bridge=_mqtt_command_bridge)
```

**Session-Factory-Pattern fuer Background-Nutzung:**
```python
# Falls Bridge eine DB-Session braucht (fuer pending-Flag):
bridge = MQTTCommandBridge(mqtt_client, session_factory=get_session)
```

### 5.5 Lifecycle-Management

**Startup:** Nach MQTT-Handler-Registrierung, vor `subscribe_all()` (ca. Zeile 560)
**Shutdown:** Zwischen SequenceActionExecutor und MaintenanceService (ca. Zeile 894)

```python
# main.py Shutdown (neuer Step):
if _mqtt_command_bridge:
    await _mqtt_command_bridge.shutdown()
```

Bestehende Shutdown-Reihenfolge:
1. LogicScheduler.stop() (Zeile 878)
2. LogicEngine.stop() (Zeile 884)
3. SequenceActionExecutor.shutdown() (Zeile 890)
4. **>>> MQTTCommandBridge.shutdown() <<<** (NEU, Zeile ~894)
5. MaintenanceService.stop() (Zeile 895)
6. SimulationScheduler.stop_all_mocks() (Zeile 908)
7. CentralScheduler.shutdown() (Zeile 917)
8. WebSocketManager.shutdown() (Zeile 929)
9. Subscriber.shutdown() (Zeile 935)
10. MQTTClient.disconnect() (Zeile 941)
11. DB dispose_engine() (Zeile 947)

---

## 6. MQTT-Operations-Inventar

### Vollstaendige Tabelle

| # | Operation | Datei:Zeile | Topic | QoS | Trigger | Bridge? |
|---|-----------|-------------|-------|-----|---------|---------|
| P1 | Zone Assign | `zone_service.py:548` | `.../zone/assign` | 1 | REST POST | **JA** |
| P2 | Zone Remove | `zone_service.py:287` | `.../zone/assign` (leer) | 1 | REST DELETE | **JA** |
| P3 | Zone Resync | `heartbeat_handler.py:734` | `.../zone/assign` | 1 | Heartbeat Mismatch (60s CD) | NEIN (F&F) |
| P4 | Subzone Assign | `subzone_service.py:567` | `.../subzone/assign` | 1 | REST / Sensor-Create | **JA** |
| P5 | Subzone Remove | `subzone_service.py:267` | `.../subzone/remove` | 1 | REST DELETE | **JA** |
| P6 | Safe-Mode Enable | `subzone_service.py:330` | `.../subzone/safe` | 1 | REST POST | NEIN (F&F) |
| P7 | Safe-Mode Disable | `subzone_service.py:384` | `.../subzone/safe` | 1 | REST POST | **JA (KRITISCH)** |
| P8 | LWT Clear | `heartbeat_handler.py:220` | `.../system/will` | 1, retain | Heartbeat Reconnect | NEIN (F&F) |
| P9 | Heartbeat ACK | `heartbeat_handler.py:1151` | `.../heartbeat/ack` | 0 | Jeder Heartbeat | NEIN (F&F) |

### Subscriptions (ACK-Topics)

| # | Pattern | Handler | QoS | Registrierung |
|---|---------|---------|-----|---------------|
| S1 | `kaiser/+/esp/+/zone/ack` | `zone_ack_handler.handle_zone_ack` | 1 | `main.py:248` |
| S2 | `kaiser/+/esp/+/subzone/ack` | `subzone_ack_handler.handle_subzone_ack` | 1 | `main.py:252` |

### Entscheidungs-Begruendungen

| # | Empfehlung | Begruendung |
|---|-----------|-------------|
| P1 | **Bridge** | Sequenz-Abhaengigkeit: Subzone-Assigns muessen nach Zone-ACK kommen |
| P2 | **Bridge** | Kein Auto-Resync fuer Removal-Failures (Szenario A loggt nur) |
| P3 | F&F | IST bereits der Korrekturmechanismus; naechster Heartbeat validiert |
| P4 | **Bridge** | Kein Subzone-Resync im Heartbeat; verlorene Messages nie wiederholt |
| P5 | **Bridge** | DB-Loeschung erst nach ACK — bei MQTT-Failure bleibt Zombie-Subzone |
| P6 | F&F | Safe-Mode Enable ist der sichere Default-Zustand |
| P7 | **Bridge** | Safety-kritisch: Disable ohne Bestaetigung = Desync mit Sicherheitsfolgen |
| P8 | F&F | Nur Broker-Cleanup |
| P9 | F&F | QoS 0, kein ACK erwartet |

### Kritische Befunde

1. **P1/P2 umgehen Publisher-Retry:** Direkter `client.publish()` Aufruf statt `Publisher._publish_with_retry()` — kein Exponential Backoff
2. **P2 hat keinen Heartbeat-Resync:** Szenario A (ESP hat Zone, DB hat NULL) wird nur geloggt — kein Auto-Fix
3. **P4 aus sensors.py aufgerufen:** `sensors.py:732` und `sensors.py:1004` loesen implizit Subzone-Assigns aus — Fehler sind non-fatal, Sensor wird trotzdem gespeichert → Desync
4. **Kein Subzone-Resync:** Im Gegensatz zu Zones (P3) gibt es keinen Auto-Resync-Mechanismus fuer Subzones im Heartbeat-Handler
5. **Kein Subzone-MQTT bei Zone-Transfer:** `_handle_subzone_strategy()` sendet kein MQTT — ESP erhaelt keine Subzone-Updates bei Zone-Wechsel

---

## 7. Integrationsplan

### 7.1 Neue Datei: `src/services/mqtt_command_bridge.py`

```python
"""ACK-gesteuerte MQTT-Command-Ausfuehrung.

Ergaenzt den bestehenden Publisher um ACK-Waiting fuer kritische Operationen.
Fire-and-forget bleibt ueber Publisher bestehen.
"""

import asyncio
import json
import logging
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from ..mqtt.client import MQTTClient
from ..core.constants import QOS_SENSOR_DATA

logger = logging.getLogger("god_kaiser.mqtt_command_bridge")


class MQTTACKTimeoutError(Exception):
    """Raised when no ACK is received within the timeout period."""
    pass


class MQTTCommandBridge:
    """ACK-gesteuerte MQTT-Command-Bridge.

    Verwendet asyncio.Future fuer ACK-Waiting. Laeuft auf dem FastAPI Event Loop.
    ACK-Handler (zone_ack_handler, subzone_ack_handler) rufen resolve_ack() auf.

    Thread-Safety: Alle Methoden muessen auf dem FastAPI Event Loop aufgerufen werden.
    resolve_ack() wird von MQTT-Handlern aufgerufen die via run_coroutine_threadsafe()
    bereits auf dem FastAPI Loop dispatched wurden.
    """

    def __init__(self, mqtt_client: MQTTClient):
        self._mqtt_client = mqtt_client
        self._pending: dict[str, asyncio.Future] = {}
        # Fallback-Index: (esp_id, command_type) -> deque[correlation_id]
        self._esp_pending: dict[tuple[str, str], deque[str]] = {}

    async def send_and_wait_ack(
        self,
        topic: str,
        payload: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",    # "zone" oder "subzone"
        timeout: float = 10.0,
    ) -> dict[str, Any]:
        """Publish MQTT message and wait for ACK.

        Args:
            topic: MQTT topic to publish to
            payload: Message payload (correlation_id will be added automatically)
            esp_id: ESP device_id for fallback matching
            command_type: "zone" or "subzone" for fallback matching
            timeout: Max seconds to wait for ACK

        Returns:
            ACK payload from ESP

        Raises:
            MQTTACKTimeoutError: If no ACK received within timeout
        """
        correlation_id = str(uuid4())
        payload["correlation_id"] = correlation_id

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[correlation_id] = future

        key = (esp_id, command_type)
        self._esp_pending.setdefault(key, deque()).append(correlation_id)

        # Synchroner publish (MQTTClient.publish ist sync)
        payload_str = json.dumps(payload)
        success = self._mqtt_client.publish(topic, payload_str, qos=QOS_SENSOR_DATA)

        if not success:
            self._cleanup(correlation_id, key)
            raise MQTTACKTimeoutError(f"MQTT publish failed for {topic}")

        try:
            return await asyncio.wait_for(future, timeout=timeout)
        except asyncio.TimeoutError:
            raise MQTTACKTimeoutError(
                f"No ACK for {correlation_id} on {topic} within {timeout}s"
            )
        finally:
            self._cleanup(correlation_id, key)

    def resolve_ack(
        self,
        ack_data: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",
    ) -> bool:
        """Resolve a pending Future with ACK data.

        Matching strategy:
        1. Exact match via correlation_id in ack_data
        2. Fallback: oldest pending Future for (esp_id, command_type)

        Returns True if a Future was resolved.
        """
        # Strategy 1: Exact correlation_id match
        cid = ack_data.get("correlation_id")
        if cid and cid in self._pending:
            future = self._pending[cid]
            if not future.done():
                future.set_result(ack_data)
                return True

        # Strategy 2: Fallback via esp_id + command_type (FIFO)
        key = (esp_id, command_type)
        pending_queue = self._esp_pending.get(key)
        if pending_queue:
            while pending_queue:
                oldest_cid = pending_queue[0]
                future = self._pending.get(oldest_cid)
                if future and not future.done():
                    future.set_result(ack_data)
                    pending_queue.popleft()
                    return True
                pending_queue.popleft()

        return False

    def has_pending(self, esp_id: str, command_type: str = "zone") -> bool:
        """Check if there are pending operations for an ESP."""
        key = (esp_id, command_type)
        queue = self._esp_pending.get(key)
        return bool(queue) and any(
            not self._pending.get(cid, asyncio.Future()).done()
            for cid in queue
        )

    async def shutdown(self) -> None:
        """Cancel all pending Futures on shutdown."""
        for cid, future in self._pending.items():
            if not future.done():
                future.cancel()
        self._pending.clear()
        self._esp_pending.clear()
        logger.info("MQTTCommandBridge shutdown complete")

    def _cleanup(self, correlation_id: str, key: tuple[str, str]) -> None:
        """Remove a correlation_id from pending tracking."""
        self._pending.pop(correlation_id, None)
        queue = self._esp_pending.get(key)
        if queue:
            try:
                queue.remove(correlation_id)
            except ValueError:
                pass
            if not queue:
                del self._esp_pending[key]
```

### 7.2 Aenderungsplan pro Datei

#### Datei 1: `src/main.py`

**Startup (nach Zeile ~270, nach Handler-Registrierung):**
```python
# Step 3.1: MQTTCommandBridge
from .services.mqtt_command_bridge import MQTTCommandBridge
_mqtt_command_bridge = MQTTCommandBridge(mqtt_client)
zone_ack_handler.set_command_bridge(_mqtt_command_bridge)
subzone_ack_handler.set_command_bridge(_mqtt_command_bridge)
```

**Shutdown (nach Zeile 893, nach SequenceActionExecutor):**
```python
if _mqtt_command_bridge:
    await _mqtt_command_bridge.shutdown()
```

**Neue Module-Level-Variable (Zeile ~84):**
```python
_mqtt_command_bridge: MQTTCommandBridge = None
```

---

#### Datei 2: `src/mqtt/handlers/zone_ack_handler.py`

**Neues Klassenattribut:**
```python
class ZoneAckHandler:
    _command_bridge: Optional["MQTTCommandBridge"] = None

    @classmethod
    def set_command_bridge(cls, bridge: "MQTTCommandBridge") -> None:
        cls._command_bridge = bridge
```

**Alternativ: Module-Level-Funktion** (konsistenter mit bestehendem Pattern):
```python
_command_bridge = None

def set_command_bridge(bridge):
    global _command_bridge
    _command_bridge = bridge
```

**Einfuegen nach Zeile 175 (commit), vor Zeile 178 (broadcast):**
```python
await session.commit()
# Resolve pending ACK Future (if any)
if _command_bridge:
    _command_bridge.resolve_ack(
        ack_data={"status": status, "zone_id": zone_id, "esp_id": esp_id_str, "ts": timestamp},
        esp_id=esp_id_str,
        command_type="zone",
    )
await self._broadcast_zone_update(...)
```

---

#### Datei 3: `src/mqtt/handlers/subzone_ack_handler.py`

**Gleiche Erweiterung wie zone_ack_handler.**

**Einfuegen nach Zeile 101 (commit), vor Zeile 103 (broadcast):**
```python
await session.commit()
if _command_bridge:
    _command_bridge.resolve_ack(
        ack_data={
            "status": ack_payload.status,
            "subzone_id": ack_payload.subzone_id,
            "esp_id": esp_id,
            "ts": ack_payload.timestamp,
            "error_code": ack_payload.error_code,
        },
        esp_id=esp_id,
        command_type="subzone",
    )
await self._broadcast_subzone_update(ack_payload)
```

---

#### Datei 4: `src/services/zone_service.py`

**Constructor erweitern:**
```python
def __init__(self, esp_repo, publisher=None, command_bridge=None):
    self.esp_repo = esp_repo
    self.publisher = publisher or Publisher()
    self.command_bridge = command_bridge      # NEU
    self.kaiser_id = constants.get_kaiser_id()
```

**assign_zone() Zeile 169-188 ersetzen:**
```python
# STATT fire-and-forget:
if self.command_bridge and not self._is_mock_esp(device_id):
    try:
        ack = await self.command_bridge.send_and_wait_ack(
            topic=topic,
            payload=payload,
            esp_id=device_id,
            command_type="zone",
            timeout=10.0,
        )
        mqtt_sent = True
        # Subzone-Transfer-MQTT (NEU — existiert im aktuellen Code nicht!)
        if transferred_subzones:
            for sz in transferred_subzones:
                sz_topic = TopicBuilder.build_subzone_assign_topic(device_id)
                sz_payload = {
                    "subzone_id": sz["subzone_id"],
                    "subzone_name": sz.get("subzone_name", ""),
                    "parent_zone_id": "",   # LEER — Firmware setzt aktuelle Zone
                    "assigned_gpios": sz.get("assigned_gpios", []),
                    "timestamp": int(datetime.now(timezone.utc).timestamp()),
                }
                await self.command_bridge.send_and_wait_ack(
                    topic=sz_topic,
                    payload=sz_payload,
                    esp_id=device_id,
                    command_type="subzone",
                    timeout=10.0,
                )
    except MQTTACKTimeoutError as e:
        logger.error(f"Zone assignment ACK timeout for {device_id}: {e}")
        mqtt_sent = False
        # pending_zone_assignment bleibt → Heartbeat korrigiert spaeter
else:
    # Fallback: fire-and-forget (Mock-ESPs, oder wenn keine Bridge)
    mqtt_sent = self._publish_zone_assignment(topic, payload)
```

**`_handle_subzone_strategy()` Return-Wert nutzen:** Die Methode gibt bereits `List[dict]` zurueck — diese Liste muss als `transferred_subzones` an den MQTT-Block weitergegeben werden.

---

#### Datei 5: `src/mqtt/handlers/heartbeat_handler.py`

**In `_update_esp_metadata()`, nach Zeile 678 (Mismatch-Einstieg):**
```python
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
    # NEU: pending-Assignment-Check
    pending = current_metadata.get("pending_zone_assignment")
    if pending:
        logger.info(
            f"Zone mismatch for {esp_id} tolerated "
            f"(pending assignment to {pending.get('target_zone_id', '?')})"
        )
        # Kein Warning, kein Resync — warten auf ACK
        pass  # Skip gesamten Mismatch-Block
    elif esp_has_zone and not db_has_zone:
        # Szenario A (bestehend)
        ...
```

---

#### Datei 6: `src/api/v1/zone.py`

**Endpoint `assign_zone` (Zeile ~69-89) — Bridge injizieren:**
```python
# Statt:
zone_service = ZoneService(esp_repo)
# Neu:
from ...services.mqtt_command_bridge import _mqtt_command_bridge  # oder via Depends
zone_service = ZoneService(esp_repo, command_bridge=_mqtt_command_bridge)
```

**Bevorzugt: Bridge als Import aus main.py** oder als FastAPI Dependency:
```python
# In deps.py:
def get_command_bridge():
    from ..main import _mqtt_command_bridge
    return _mqtt_command_bridge
```

### 7.3 Implementierungsreihenfolge

| Phase | Schritt | Beschreibung | Dateien | Aufwand |
|-------|---------|-------------|---------|---------|
| 2.1 | 1 | MQTTCommandBridge Klasse | `services/mqtt_command_bridge.py` (NEU) | ~2h |
| 2.1 | 2 | Unit-Tests fuer Bridge | `tests/unit/test_mqtt_command_bridge.py` (NEU) | ~1h |
| 2.2 | 3 | zone_ack_handler erweitern | `mqtt/handlers/zone_ack_handler.py` | ~30min |
| 2.2 | 4 | subzone_ack_handler erweitern | `mqtt/handlers/subzone_ack_handler.py` | ~30min |
| 2.2 | 5 | Bridge in main.py registrieren | `main.py` | ~30min |
| 2.3 | 6 | zone_service.assign_zone() umstellen | `services/zone_service.py` | ~2h |
| 2.3 | 7 | zone_service.remove_zone() umstellen | `services/zone_service.py` | ~30min |
| 2.3 | 8 | API-Router: Bridge-Injection | `api/v1/zone.py`, `api/deps.py` | ~30min |
| 2.3 | 9 | Subzone-MQTT bei Transfer HINZUFUEGEN | `services/zone_service.py` | ~1h |
| 2.4 | 10 | Heartbeat pending-Check | `mqtt/handlers/heartbeat_handler.py` | ~1h |
| — | 11 | Integrationstests | `tests/integration/` | ~2h |

**Gesamt-Aufwand:** ~10-12h

### 7.4 Risiken und Fallbacks

| # | Risiko | Geprueft | Ergebnis | Fallback |
|---|--------|----------|----------|----------|
| R1 | MQTT-Handler laeuft in anderem Thread | Aufgabe 5.1 | Handler laufen via `run_coroutine_threadsafe()` auf FastAPI-Loop → **KEIN Problem** | Nicht noetig |
| R2 | gmqtt und MQTT 5 Correlation Data | Aufgabe 1 | paho-mqtt mit MQTT 3.1.1 → **Kein MQTT 5** | Payload-basierte `correlation_id` (bereits im Design) |
| R3 | Concurrent Zone-Assigns fuer selben ESP | Aufgabe 3.1 | Ein ESP hat eine Zone → normalerweise nicht concurrent. Schnelle UI-Klicks moeglich. | Bridge erlaubt nur 1 pending Zone-Future pro ESP (aeltere wird cancelled) |
| R4 | ACK kommt nie an | Design | 10s Timeout → `MQTTACKTimeoutError` | pending_zone_assignment bleibt in DB → Heartbeat-Resync nach 60s |
| R5 | Server-Restart waehrend pending | Aufgabe 4.4 | pending_zone_assignment in `device_metadata` (DB) → ueberlebt Restart | Heartbeat-Handler prueft pending und raeumt ggf. auf |
| R6 | Subzone-Transfer ohne MQTT | **NEU aus Analyse** | `_handle_subzone_strategy` sendet KEIN MQTT → ESP weiss nicht von Transfer | Phase 2.3 Schritt 9: Subzone-MQTT explizit hinzufuegen |
| R7 | Publisher-Sync vs Bridge-Async | Aufgabe 1.2 | `MQTTClient.publish()` ist sync → Bridge wrapped sync-Call in async-Methode | `publish()` blockiert nur kurz (kein I/O wait — paho buffert intern) |
| R8 | Mock-ESPs brauchen kein MQTT | Aufgabe 3 | `_is_mock_esp()` Check existiert bereits | Bridge-Call nur fuer echte ESPs; Mock-ESPs nutzen weiterhin fire-and-forget |

---

## Anhang: Kritische Neuentdeckungen

### A. Fehlender Subzone-MQTT bei Zone-Transfer

**Problem:** `_handle_subzone_strategy()` (zone_service.py:388) aendert nur die DB (`sz.parent_zone_id = new_zone_id`), sendet aber **kein MQTT** an den ESP. Nach einem Zone-Transfer hat der ESP:
- Neue Zone-ID (via zone/assign MQTT)
- **Alte Subzone-Konfiguration** (parent_zone_id zeigt noch auf alte Zone in NVS)

Dies ist ein zusaetzlicher Bug der in Phase 2.3 Schritt 9 behoben werden muss.

### B. pending_zone_assignment existiert bereits

Der `zone_service.assign_zone()` setzt bereits `device_metadata["pending_zone_assignment"]` (Zeile 148), und der `zone_ack_handler` loescht es (Zeile 142). Aber: Der Heartbeat-Handler prueft es **nicht** — Mismatch-Warnings feuern trotzdem waehrend eines laufenden Assignments.

### C. remove_zone hat keinen Heartbeat-Resync

Szenario A (ESP hat Zone, DB hat NULL) wird nur geloggt. Es gibt keinen Auto-Resync wie bei Szenario B. Ein fehlgeschlagenes Zone-Removal wird nie automatisch wiederholt.

### D. Subzone-Assigns aus sensors.py

`sensors.py:732` und `sensors.py:1004` rufen `subzone_service.assign_subzone()` auf. Fehler sind non-fatal — der Sensor wird trotzdem gespeichert, aber die Subzone-Zuweisung fehlt am ESP.

---

## Akzeptanzkriterien-Checkliste

- [x] Alle 7 Analyse-Aufgaben vollstaendig beantwortet
- [x] Jede relevante Code-Stelle hat Dateiname + Zeilennummer
- [x] ACK-Payload-Strukturen gegen Server-Code verifiziert (Korrekturen: `ts` statt `timestamp`, `master_zone_id` zusaetzlich)
- [x] asyncio-Kompatibilitaet geklaert: Futures funktionieren, gleicher Event-Loop, Beweis via sensors.py:1722
- [x] DI-Pattern vorgeschlagen: Module-Level-Global + Constructor-Injection
- [x] Vollstaendiges MQTT-Operations-Inventar: 9 Publish-Ops, 2 Subscribe-Ops
- [x] Integrationsplan mit exakten Dateien, Zeilen, und Reihenfolge
- [x] Bericht ist implementierungsfertig — keine weitere Code-Exploration noetig
