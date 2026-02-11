# Server Debug Report: Wokwi Live Interaction Session

> **Session:** 2026-02-11 08:20-08:29 UTC
> **Analysiert von:** server-debug
> **Bezugsdokument:** WOKWI_LIVE_INTERACTION_LOG.md

---

## Fokus 1: REST API Endpoint Gaps (404)

### Analysierte Endpoints

| Endpoint | Router-Datei | Existiert? | Tatsächlicher Pfad |
|----------|-------------|-----------|---------------------|
| `/debug/stats` | debug.py | **NEIN** | Kein Endpunkt - nicht implementiert |
| `/debug/health` | debug.py | **NEIN** | Verwechslung mit `/v1/health/detailed` (health.py) |
| `/debug/mqtt/topics` | debug.py | **NEIN** | Nicht implementiert |
| `/debug/mqtt/messages` | debug.py | **NEIN** | Nur `/v1/debug/mock-esp/{esp_id}/messages` existiert |
| `/debug/scheduler/jobs` | debug.py | **NEIN** | Nur `/v1/debug/maintenance/status` existiert |
| `/errors/stats` | errors.py | **NEIN** | Nur `/v1/errors/summary` existiert (Zeile 211) |
| `/esp/devices/{id}/config` | esp.py | **NEIN** | Nicht implementiert |
| `/subzone` POST | subzone.py | **NEIN** | Nur `/v1/subzone/devices/{esp_id}/subzones/assign` POST (Zeile 56) |

### Root Cause

Die Log-Session hat Endpoints angefragt, die **nie implementiert wurden**. Die Endpoint-Namen stammen vermutlich aus einer Planungsdokumentation, nicht aus dem echten API.

**debug.py** hat 55+ Endpoints (Zeile 76: prefix="/v1/debug"), aber ausschließlich:
- `/mock-esp/*` - Mock-ESP Management (15 Endpoints)
- `/db/*` - Database Explorer (4 Endpoints)
- `/logs/*` - Log Management (6 Endpoints)
- `/config` - Config Management (2 Endpoints)
- `/load-test/*` - Load Testing (4 Endpoints)
- `/cleanup/*` - Cleanup Utilities (2 Endpoints)
- `/libraries/*` - Library Management (2 Endpoints)
- `/data-source/*` - Data Source Detection (1 Endpoint)
- `/maintenance/*` - Maintenance Jobs (3 Endpoints)
- `/resilience/*` - Resilience/Circuit Breaker (7 Endpoints)

**errors.py** (Zeile 41: prefix="/v1/errors") hat nur:
- GET `/esp/{esp_id}` - Error-Events eines ESP
- GET `/summary` - Fehler-Zusammenfassung (NICHT `/stats`)
- GET `/codes` - Error-Code-Katalog
- GET `/codes/{error_code}` - Einzelner Error-Code

**subzone.py** (Zeile 46: prefix="/v1/subzone") hat nur:
- POST `/devices/{esp_id}/subzones/assign` (NICHT direkt POST `/subzone`)
- DELETE/GET Subzone-Operationen (immer unter `/devices/{esp_id}/subzones/...`)

### Empfehlung

1. **Dokumentation korrigieren** - Entfernen nicht-existierender Endpoints
2. **Alternativ-Endpoints** kommunizieren:
   - `/debug/stats` → `/v1/health/detailed` (auth required)
   - `/debug/health` → `/v1/health/ready` (no auth)
   - `/errors/stats` → `/v1/errors/summary`
   - `/debug/maintenance/status` statt `/debug/scheduler/jobs`
3. `/esp/devices/{id}/config` und `/debug/mqtt/*` sind Feature-Gaps für zukünftige Sprints

---

## Fokus 2: Zone Assignment Round-Trip

### Analyse

Die Zone-Assignment-Kette funktioniert **korrekt**:

```
REST POST /zone/devices/ESP_00000001/assign
  → zone_service.py:82 assign_zone()
  → DB Update: device.zone_id = "greenhouse" (Zeile 132-135)
  → MQTT Publish: kaiser/god/esp/ESP_00000001/zone/assign (Zeile 148)

ESP empfängt → Speichert in NVS → Sendet zone/ack

MQTT zone/ack empfangen:
  → zone_ack_handler.py:59 handle_zone_ack()
  → TopicBuilder.parse_zone_ack_topic() (Zeile 84)
  → Payload-Validierung (Zeile 97-106): status + ts required
  → ESP Lookup in DB (Zeile 120)
  → device.zone_id = zone_id (Zeile 131)
  → pending_zone_assignment gelöscht (Zeile 135-136)
  → WebSocket broadcast "zone_assignment" (Zeile 170-179, inkl. zone_name + kaiser_id)
  → session.commit() (Zeile 167)
```

### Befund

**Kein Bug.** Der Round-Trip ist vollständig implementiert und verifiziert:
- DB wird sofort beim REST-Call aktualisiert (optimistisch, Zeile 132)
- ACK bestätigt ESP-seitige Persistenz
- `pending_zone_assignment` Metadata wird bei ACK gelöscht
- WebSocket-Broadcast enthält zone_name + kaiser_id (WP4-Fix)
- `zone_removed` Status wird ebenfalls korrekt behandelt (Zeile 143-154)

### Einziges Risiko

`zone_service.py:132` aktualisiert DB **vor** MQTT-Bestätigung. Bei MQTT-Fehler:
- DB hat neue Zone, ESP hat alte Zone
- `pending_zone_assignment` bleibt in Metadata → Recovery möglich
- **Design-Entscheidung**, kein Bug (Mock-ESPs haben kein MQTT)

---

## Fokus 3: Retained MQTT Messages nach LWT

### Analyse

**Bestätigtes Problem.** Der Server löscht das retained LWT-Message **NICHT** nach ESP-Reconnect.

#### lwt_handler.py Verhalten (Zeile 50-183)

- Empfängt `system/will` retained Message
- Setzt ESP Status auf "offline" (Zeile 112)
- Loggt disconnect-reason in Metadata (Zeile 116-123)
- Broadcast WebSocket "esp_health" offline (Zeile 152-163)
- **Löscht NICHT** die retained Message vom Broker

#### heartbeat_handler.py Verhalten (Zeile 62-317)

- Empfängt ersten Heartbeat nach Reconnect
- Setzt Status auf "online" (Zeile 210)
- Sendet Heartbeat-ACK an ESP (Zeile 304-308)
- **Löscht NICHT** die retained LWT-Message

### Root Cause

**Fehlende "Retained-Clear"-Logik.** Nach ESP-Reconnect müsste der Server ein leeres retained Message auf `system/will` publizieren:

```python
# NICHT IMPLEMENTIERT - Sollte in heartbeat_handler.py sein:
mqtt_client.publish(
    f"kaiser/{kaiser_id}/esp/{esp_id}/system/will",
    payload="",  # Leeres Payload löscht retained Message
    qos=1,
    retain=True   # Überschreibt altes retained Message
)
```

### Impact

- Monitoring-Tools sehen **gleichzeitig** retained `offline` UND live `online` Heartbeats
- MQTT-Subscriber, die sich neu verbinden, erhalten zuerst das retained `offline` Message
- Frontend könnte kurzzeitig "offline" anzeigen bevor der erste Heartbeat kommt

### Empfehlung

In `heartbeat_handler.py` nach `update_status("online")` (Zeile 210) ein retained-clear einbauen:

```python
# Clear stale LWT retained message
mqtt_client.publish(
    TopicBuilder.build_lwt_topic(esp_id_str),
    payload="",
    qos=1,
    retain=True
)
```

---

## Fokus 4: Sensor Config Doku-Mismatch (Server-Seite)

### Analyse

Der **Server verwendet korrekt** `sensor_type` und `sensor_name`:

#### config_builder.py (Zeile 110-130)

```python
def build_sensor_payload(self, sensor: SensorConfig) -> Dict[str, Any]:
    """
    Default mappings:
    - sensor_name → sensor_name (direct)
    - sensor_type → sensor_type (direct)
    - gpio → gpio (direct)
    ...
    """
    return self.mapping_engine.apply_sensor_mapping(sensor)
```

Server-Seite sendet also `sensor_type` und `sensor_name` - **korrekt und konsistent mit ESP32**.

#### Mqtt_Protocoll.md - Doku-Mismatch

| Zeile | Bereich | Feldname | Korrekt? |
|-------|---------|----------|----------|
| 102 | Sensor Data Publish | `sensor_type` | KORREKT |
| 108 | Sensor Data Publish | `sensor_name` | KORREKT |
| 138 | Batch Sensor Data | `sensor_type` | KORREKT |
| 179 | Config Response | `sensor_type` | KORREKT |
| **1731** | **Config Subscribe** | **`type`** | **FALSCH** |
| **1732** | **Config Subscribe** | **`name`** | **FALSCH** |
| **2543** | **Wokwi Example** | **`type`** | **FALSCH** |

### Root Cause

Die Doku in `Mqtt_Protocoll.md` Zeile 1731-1732 (Config-Subscribe-Sektion) verwendet `type` und `name` statt `sensor_type` und `sensor_name`. Der Rest der Doku (Zeile 102, 108, 138) ist korrekt.

**Der Server baut korrekte Payloads** via ConfigPayloadBuilder. Das Problem tritt nur auf wenn jemand **manuell** Config-Messages sendet (wie in der Wokwi-Session) und sich an die falsche Doku-Sektion hält.

### Empfehlung

1. **Mqtt_Protocoll.md Zeile 1731-1732 korrigieren:**
   - `"type": "DS18B20"` → `"sensor_type": "DS18B20"`
   - `"name": "Boden Temp"` → `"sensor_name": "Boden Temp"`
2. **Mqtt_Protocoll.md Zeile 2543 korrigieren:**
   - `{"gpio": 4, "type": "DS18B20"}` → `{"gpio": 4, "sensor_type": "DS18B20"}`

---

## Zusammenfassung

| Fokus | Severity | Status | Aktion |
|-------|----------|--------|--------|
| REST API 404s | Medium | Doku-Problem | Endpoints existieren nicht, Doku korrigieren |
| Zone Round-Trip | - | **Funktioniert** | Kein Handlungsbedarf |
| Retained LWT | Medium | **Bug bestätigt** | heartbeat_handler muss retained clear senden |
| Sensor Config Doku | High | **Doku-Bug** | Mqtt_Protocoll.md Zeile 1731-1732, 2543 korrigieren |

### Cross-Layer-Korrelation mit ESP32-Debug

| Bug | ESP32-Seite | Server-Seite |
|-----|-------------|-------------|
| set_log_level params | **ESP32 Bug**: liest nur top-level `level` | Server nicht betroffen (keine set_log_level Logik) |
| Sensor Config Fields | **Doku-Mismatch**: ESP erwartet `sensor_type`/`sensor_name` | **Server korrekt**: ConfigPayloadBuilder sendet richtige Felder |
| GPIO Conflict | **ESP32 Design-Problem**: OneWire-Bus blockiert Config | Server nicht betroffen (sendet nur Config via MQTT) |
| Retained LWT | ESP32 setzt Will-Message korrekt | **Server Bug**: Löscht retained Message nicht bei Reconnect |
