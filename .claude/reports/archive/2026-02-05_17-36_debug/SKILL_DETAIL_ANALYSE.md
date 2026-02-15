# Skill-Detail-Analyse für TM

**Datum:** 2026-02-05 21:00 UTC
**Analyse-Typ:** Codebase-Deep-Dive für 7 Skill-Dokumentationen
**Status:** VOLLSTÄNDIG

---

## MQTT (Fragen 1-4)

### 1. Tatsächlich verwendete Topics

#### ESP32-Side (El Trabajante)

**Datei:** `El Trabajante/src/utils/topic_builder.cpp`

| Topic-Pattern | Methode | Zeile | QoS |
|---------------|---------|-------|-----|
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data` | `buildSensorDataTopic()` | 53 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/batch` | `buildSensorBatchTopic()` | 61 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` | `buildSensorCommandTopic()` | 70 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/response` | `buildSensorResponseTopic()` | 79 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command` | `buildActuatorCommandTopic()` | 87 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status` | `buildActuatorStatusTopic()` | 95 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/response` | `buildActuatorResponseTopic()` | 103 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/alert` | `buildActuatorAlertTopic()` | 111 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/actuator/emergency` | `buildActuatorEmergencyTopic()` | 119 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat` | `buildSystemHeartbeatTopic()` | 127 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack` | `buildSystemHeartbeatAckTopic()` | 136 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/command` | `buildSystemCommandTopic()` | 144 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/diagnostics` | `buildSystemDiagnosticsTopic()` | 152 | 0 |
| `kaiser/{kaiser_id}/esp/{esp_id}/system/error` | `buildSystemErrorTopic()` | 160 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config` | `buildConfigTopic()` | 168 | 2 |
| `kaiser/{kaiser_id}/esp/{esp_id}/config_response` | `buildConfigResponseTopic()` | 176 | 2 |
| `kaiser/broadcast/emergency` | `buildBroadcastEmergencyTopic()` | 184 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/assign` | `buildSubzoneAssignTopic()` | 192 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/remove` | `buildSubzoneRemoveTopic()` | 199 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/ack` | `buildSubzoneAckTopic()` | 206 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/status` | `buildSubzoneStatusTopic()` | 213 | 1 |
| `kaiser/{kaiser_id}/esp/{esp_id}/subzone/safe` | `buildSubzoneSafeTopic()` | 220 | 1 |

**Code-Ausschnitt (topic_builder.cpp:52-58):**
```cpp
// Pattern 1: kaiser/god/esp/{esp_id}/sensor/{gpio}/data
const char* TopicBuilder::buildSensorDataTopic(uint8_t gpio) {
  int written = snprintf(topic_buffer_, sizeof(topic_buffer_),
                         "kaiser/%s/esp/%s/sensor/%d/data",
                         kaiser_id_, esp_id_, gpio);
  return validateTopicBuffer(written);
}
```

#### Server-Side (El Servador)

**Datei:** `El Servador/god_kaiser_server/src/core/constants.py:14-56`

```python
MQTT_TOPIC_ESP_SENSOR_DATA = "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/data"
MQTT_TOPIC_ESP_ACTUATOR_STATUS = "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/status"
MQTT_TOPIC_ESP_CONFIG_RESPONSE = "kaiser/{kaiser_id}/esp/{esp_id}/config_response"
MQTT_TOPIC_ESP_HEARTBEAT = "kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat"
MQTT_TOPIC_ESP_ACTUATOR_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/actuator/{gpio}/command"
MQTT_TOPIC_ESP_SENSOR_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command"
MQTT_TOPIC_ESP_CONFIG = "kaiser/{kaiser_id}/esp/{esp_id}/config"
MQTT_TOPIC_ESP_SYSTEM_COMMAND = "kaiser/{kaiser_id}/esp/{esp_id}/system/command"
MQTT_TOPIC_ESP_HEARTBEAT_ACK = "kaiser/{kaiser_id}/esp/{esp_id}/system/heartbeat/ack"
```

#### Doku vs Code Vergleich

**Datei:** `.claude/reference/api/MQTT_TOPICS.md`

| Aspekt | Status | Detail |
|--------|--------|--------|
| Topic-Struktur | ✅ SYNCHRON | Alle Topics dokumentiert |
| Payload-Beschreibungen | ✅ VOLLSTÄNDIG | JSON-Schemas vorhanden |
| QoS-Levels | ✅ KORREKT | Zeile 29-62 |
| **Zeilennummern** | ⚠️ VERSETZT | ~13 Zeilen Offset zu topic_builder.cpp |

**Fehler in MQTT_TOPICS.md:**
- Zeile 126: referenziert `topic_builder.cpp:38` → tatsächlich **Zeile 53**
- Zeile 172: referenziert `topic_builder.cpp:50` → tatsächlich **Zeile 61**

---

### 2. Mosquitto-Konfiguration

**Datei:** `docker/mosquitto/mosquitto.conf` (71 Zeilen)

#### Listener-Konfiguration (Zeile 13-20)
```conf
# Listener: MQTT (Port 1883)
listener 1883
protocol mqtt

# Listener: WebSocket (Port 9001)
listener 9001
protocol websockets
```

| Listener | Port | Protokoll |
|----------|------|-----------|
| MQTT | 1883 | mqtt |
| WebSocket | 9001 | websockets |

#### Security Settings (Zeile 23-31)
```conf
allow_anonymous true
# allow_anonymous false
# password_file /mosquitto/config/passwd
# acl_file /mosquitto/config/acl
```

**Status:** ENTWICKLUNGS-MODUS - Auth deaktiviert, keine ACL

#### Persistence & Logging (Zeile 35-52)
```conf
persistence true
persistence_location /mosquitto/data/

log_dest file /mosquitto/log/mosquitto.log
log_dest stdout
log_type error
log_type warning
log_type notice
log_type information
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%S
```

#### Connection Limits (Zeile 57-70)
```conf
max_keepalive 65535          # Unlimited
max_connections -1           # Unlimited
max_inflight_messages 20     # In-flight message buffer
max_queued_messages 1000     # Offline message queue
message_size_limit 262144    # 256KB max payload
```

#### Bridge/ACL
**NICHT IMPLEMENTIERT** - Keine Bridge-Config, keine ACL-Datei vorhanden

---

### 3. MQTT Error-Handling

#### Error-Codes (aus .claude/reference/errors/ERROR_CODES.md)

**ESP32 MQTT Errors (3010-3016):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 3010 | MQTT_INIT_FAILED | Failed to initialize MQTT client |
| 3011 | MQTT_CONNECT_FAILED | MQTT broker connection failed |
| 3012 | MQTT_PUBLISH_FAILED | Failed to publish MQTT message |
| 3013 | MQTT_SUBSCRIBE_FAILED | Failed to subscribe to MQTT topic |
| 3014 | MQTT_DISCONNECT | MQTT disconnected from broker |
| 3015 | MQTT_BUFFER_FULL | MQTT offline buffer is full |
| 3016 | MQTT_PAYLOAD_INVALID | MQTT payload is invalid or malformed |

**Server MQTT Errors (5101-5107):**

| Code | Name | Beschreibung |
|------|------|--------------|
| 5101 | PUBLISH_FAILED | MQTT publish operation failed |
| 5102 | TOPIC_BUILD_FAILED | Failed to build MQTT topic |
| 5103 | PAYLOAD_SERIALIZATION_FAILED | Failed to serialize MQTT payload |
| 5104 | CONNECTION_LOST | MQTT connection lost |
| 5105 | RETRY_EXHAUSTED | MQTT retry attempts exhausted |
| 5106 | BROKER_UNAVAILABLE | MQTT broker is unavailable |
| 5107 | AUTHENTICATION_FAILED | MQTT authentication failed |

#### ESP32 Reconnect-Logic

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp:46-62`

```cpp
MQTTClient::MQTTClient()
    : mqtt_(wifi_client_),
      offline_buffer_count_(0),
      last_reconnect_attempt_(0),
      reconnect_attempts_(0),
      reconnect_delay_ms_(RECONNECT_BASE_DELAY_MS),
      circuit_breaker_("MQTT", 5, 30000, 10000),  // 5 Failures → OPEN
      // ...
{
  // Circuit Breaker configured:
  // - 5 failures → OPEN state
  // - 30s recovery timeout
  // - 10s half-open test timeout
}
```

**safePublish() mit Retry (mqtt_client.cpp:569-600):**
```cpp
bool MQTTClient::safePublish(const String& topic, const String& payload,
                              uint8_t qos, uint8_t retries) {
  if (circuit_breaker_.isOpen()) {
    return false;  // Circuit breaker blocks publish
  }

  if (publish(topic, payload, qos)) {
    return true;  // Success on first attempt
  }

  // Retry logic with exponential backoff
  for (uint8_t i = 1; i < retries; i++) {
    delay(50 * i);
    if (publish(topic, payload, qos)) {
      return true;
    }
  }
  return false;
}
```

#### Server Offline-Buffer

**Datei:** `El Servador/god_kaiser_server/src/mqtt/offline_buffer.py:120-145`

```python
async def add(self, topic: str, payload: str, qos: int = 1):
    """Add message to offline buffer for later delivery"""
    if self.is_full():
        raise OfflineBufferFullError()

    message = OfflineMessage(
        topic=topic,
        payload=payload,
        timestamp=datetime.now(),
        qos=qos,
    )
    self.messages.append(message)
```

---

### 4. QoS-Levels nach Topic

**Quellen:** `constants.py:195-199`, `MQTT_TOPICS.md:1044-1050`

| Topic-Kategorie | QoS | Grund | Code-Referenz |
|-----------------|-----|-------|---------------|
| **Sensor Daten** | **1** | At Least Once | constants.py:195 |
| sensor/{gpio}/data | 1 | Wichtig, toleriert Duplikate | mqtt_client.cpp:536 |
| sensor/batch | 1 | Batch-Daten | topic_builder.cpp:61 |
| **Actuator Befehle** | **2** | Exactly Once | constants.py:196 |
| actuator/{gpio}/command | 2 | KRITISCH - Duplikate gefährlich | publisher.py:99 |
| actuator/{gpio}/status | 1 | Status-Update | actuator_manager.cpp:822 |
| **System** | **Gemischt** | - | - |
| system/heartbeat | **0** | Fire-and-Forget | constants.py:198 |
| system/heartbeat/ack | **0** | Response zu Heartbeat | topic_builder.cpp:136 |
| system/command | **2** | Exactly Once | constants.py:199 |
| system/diagnostics | **0** | Telemetrie, Verlust OK | topic_builder.cpp:152 |
| system/error | **1** | Fehler-Meldung wichtig | topic_builder.cpp:160 |
| **Config** | **2** | Exactly Once | constants.py:199 |
| config | **2** | KRITISCH - Muss ankommen | publisher.py:176 |
| config_response | **2** | ACK zu Config | config_response.cpp:43 |
| **Subzone** | **1** | At Least Once | topic_builder.cpp:192-225 |
| **Broadcast** | **2** | Exactly Once | topic_builder.cpp:184 |

---

## System-Control (Fragen 5-7)

### 5. Make-Targets Detail

**Datei:** `Makefile` (Root)

| Target | Zeile | Befehl(e) | Prerequisites | Parameter |
|--------|-------|-----------|---------------|-----------|
| `up` | 24-25 | `docker compose up -d` | - | - |
| `down` | 27-28 | `docker compose down` | - | - |
| `dev` | 30-31 | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` | - | - |
| `dev-down` | 33-34 | `docker compose -f ... down` | - | - |
| `test` | 36-37 | `docker compose -f ... -f docker-compose.test.yml up -d` | - | - |
| `test-down` | 39-40 | `docker compose -f ... down -v` | - | - |
| `logs` | 42-43 | `docker compose logs -f --tail=100` | - | - |
| `logs-server` | 45-46 | `docker compose logs -f --tail=100 el-servador` | - | - |
| `logs-mqtt` | 48-49 | `docker compose logs -f --tail=100 mqtt-broker` | - | - |
| `shell-server` | 51-52 | `docker exec -it automationone-server /bin/bash` | - | - |
| `shell-db` | 54-55 | `docker exec -it automationone-postgres psql -U god_kaiser -d god_kaiser_db` | - | - |
| `db-migrate` | 57-58 | `docker exec ... python -m alembic upgrade head` | - | - |
| `db-rollback` | 60-61 | `docker exec ... python -m alembic downgrade -1` | - | - |
| `db-backup` | 63-65 | `./scripts/docker/backup.sh` | - | - |
| `db-restore` | 67-68 | `./scripts/docker/restore.sh $(FILE)` | - | **FILE=path** |
| `mqtt-sub` | 70-71 | `docker exec ... mosquitto_sub -h localhost -t "#" -v` | - | - |
| `status` | 73-74 | `docker compose ps` | - | - |
| `health` | 76-77 | `docker exec ... curl -s http://localhost:8000/api/v1/health/live` | - | - |
| `build` | 79-80 | `docker compose build` | - | - |
| `clean` | 82-83 | `docker compose down -v --remove-orphans` | - | - |

**Zusammenfassung:**
- **20 Targets** definiert
- **0 Targets** mit Prerequisites (keine Abhängigkeiten)
- **1 Target** mit Parameter: `db-restore FILE=<path>`

---

### 6. Health-Check Flow

#### Make Health (Makefile:76-77)
```makefile
health:
    @docker exec automationone-server curl -s http://localhost:8000/api/v1/health/live || echo "Server not responding"
```

#### Health-Endpoints (El Servador/god_kaiser_server/src/api/v1/health.py)

| Endpoint | Zeile | Auth | Response (healthy) | Response (unhealthy) |
|----------|-------|------|--------------------|--------------------|
| `GET /v1/health/` | 62-90 | Nein | `{"status": "healthy", "mqtt_connected": true}` | `{"status": "degraded", ...}` |
| `GET /v1/health/detailed` | 98-207 | **JA** | Status + DB/MQTT/WS Details | Warnings |
| `GET /v1/health/live` | 431-446 | Nein | `{"success": true, "alive": true}` | - (always true) |
| `GET /v1/health/ready` | 449-486 | Nein | `{"ready": true, "checks": {...}}` | HTTP 503 |
| `GET /v1/health/esp` | 215-343 | **JA** | Aggregate Counts + Devices | Errors |
| `GET /v1/health/metrics` | 351-423 | Nein | Prometheus-Format | - |

#### Docker Health-Checks (docker-compose.yml)

| Service | Zeile | Test | Intervall | Timeout | Retries | start_period |
|---------|-------|------|-----------|---------|---------|--------------|
| postgres | 30-34 | `pg_isready -U god_kaiser -d god_kaiser_db` | 10s | 5s | 5 | - |
| mqtt-broker | 52-56 | `mosquitto_sub -t "$SYS/#" -C 1 -i healthcheck -W 3` | 30s | 10s | 3 | - |
| el-servador | 99-104 | `curl -f http://localhost:8000/api/v1/health/live` | 30s | 10s | 3 | 30s |
| el-frontend | 133-138 | `fetch('http://localhost:5173')` | 30s | 10s | 3 | 30s |

---

### 7. Service-Abhängigkeiten

#### Startup-Order (docker-compose.yml:94-104)

```yaml
el-servador:
  depends_on:
    postgres:
      condition: service_healthy    # KRITISCH
    mqtt-broker:
      condition: service_healthy    # KRITISCH
```

**Abhängigkeitskette:**
```
Docker Startup:
  postgres (starts first)
    ↓ (waits für pg_isready)
  mqtt-broker (parallel zu postgres)
    ↓ (waits für mosquitto_sub)
  el-servador (nur wenn BEIDE healthy)
    ├─ init_db()
    ├─ MQTTClient.connect()
    └─ Services starten
  el-frontend (nur wenn el-servador läuft)
```

#### PostgreSQL Not Ready Scenario

**Datei:** `El Servador/god_kaiser_server/src/main.py:154-165`

```python
# Step 1: Initialize database
if settings.database.auto_init:
    logger.info("Initializing database...")
    await init_db()  # ← Blockiert bis DB ready
    logger.info("Database initialized successfully")
else:
    logger.info("Skipping database init (auto_init=False)")
    get_engine()

# Initialize database circuit breaker after DB is ready
init_db_circuit_breaker()
```

**Ergebnis:** Mit `service_healthy` Condition startet Server NICHT bevor DB ready ist.

---

## DB-Inspector (Fragen 8-10)

### 8. Letzte 5 Migrations

**Verzeichnis:** `El Servador/god_kaiser_server/alembic/versions/`

| # | Datei | Revision | Datum | Beschreibung |
|---|-------|----------|-------|--------------|
| 1 | `950ad9ce87bb_add_i2c_address_to_sensor_unique_.py` | 950ad9ce87bb | 2026-02-04 04:05 | UNIQUE erweitert: `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` |
| 2 | `add_token_version_to_user.py` | add_token_version | 2026-02-04 00:36 | `user_accounts.token_version` Column für Logout-All |
| 3 | `fix_sensor_unique_constraint_onewire.py` | fix_onewire | 2026-01-27 15:27 | UNIQUE: `(esp_id, gpio, sensor_type, onewire_address)` |
| 4 | `add_discovery_approval_fields.py` | add_discovery | 2026-01-27 11:01 | 5 Columns auf `esp_devices`: discovered_at, approved_at, etc. |
| 5 | `add_esp_heartbeat_logs.py` | add_heartbeat | 2026-01-24 19:59 | Neue Tabelle `esp_heartbeat_logs` mit 8 Indizes |

### Indizes (esp_heartbeat_logs)

**Datei:** `add_esp_heartbeat_logs.py:53-79`

| Index-Name | Spalten | Typ |
|------------|---------|-----|
| `ix_esp_heartbeat_logs_esp_id` | `esp_id` | Single |
| `ix_esp_heartbeat_logs_device_id` | `device_id` | Single |
| `ix_esp_heartbeat_logs_timestamp` | `timestamp` | Single |
| `ix_esp_heartbeat_logs_data_source` | `data_source` | Single |
| `idx_heartbeat_esp_timestamp` | `esp_id, timestamp` | **COMPOSITE** |
| `idx_heartbeat_device_timestamp` | `device_id, timestamp` | **COMPOSITE** |
| `idx_heartbeat_data_source_timestamp` | `data_source, timestamp` | **COMPOSITE** |
| `idx_heartbeat_health_status` | `health_status, timestamp` | **COMPOSITE** |

### Foreign Keys mit Cascades

**Datei:** `add_esp_heartbeat_logs.py:49-50`

```python
sa.ForeignKeyConstraint(['esp_id'], ['esp_devices.id'], ondelete='CASCADE'),
```

**Effekt:** ESP-Device gelöscht → ALLE Heartbeat-Logs gelöscht

---

### 9. Retention und Cleanup

#### Implementierung

**Datei:** `El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py:525-702`

**Klasse:** `HeartbeatLogCleanup`

| Parameter | Default | Beschreibung |
|-----------|---------|--------------|
| `heartbeat_log_retention_enabled` | **TRUE** | Cleanup aktiviert |
| `heartbeat_log_retention_days` | **7 days** | Retention-Zeit |
| `heartbeat_log_cleanup_dry_run` | **TRUE** | Dry-Run default ON |
| `heartbeat_log_cleanup_batch_size` | konfigurierbar | Records pro Batch |
| `heartbeat_log_cleanup_max_batches` | konfigurierbar | Max Batches pro Run |

#### Cleanup-Logic (DELETE-basiert, kein Partitioning)

**Zeile 580-702:**
```python
# Cutoff-Berechnung
cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

# Phase 1: Count
records_to_delete = SELECT COUNT(*) FROM esp_heartbeat_logs
                    WHERE timestamp < cutoff_date

# Phase 2: Check Dry-Run
if dry_run:
    return {"status": "dry_run", "records_found": records_to_delete}

# Phase 3: Batch DELETE
while batches_processed < max_batches:
    batch_ids = SELECT id FROM esp_heartbeat_logs
                WHERE timestamp < cutoff_date LIMIT batch_size

    DELETE FROM esp_heartbeat_logs WHERE id IN (batch_ids)
    await session.commit()  # Per-Batch Commit
```

#### Scheduler-Aufruf

**Datei:** `El Servador/god_kaiser_server/src/services/maintenance/service.py:76-100`

- **Zeitplan:** Täglich um **04:00 UTC**
- **Job-ID:** `cleanup_heartbeat_logs`
- **Category:** MAINTENANCE

---

### 10. Backup/Restore Detail

#### Backup-Script

**Datei:** `scripts/docker/backup.sh`

| Aspekt | Zeile | Detail |
|--------|-------|--------|
| Was wird gesichert | 10 | Schema + Daten (vollständiger pg_dump) |
| Kompression | 10 | GZ-komprimiert |
| Naming | 4-5 | `automationone_YYYYMMDD_HHMMSS.sql.gz` |
| Zielverzeichnis | 5,7 | `./backups/` |
| Retention | 14-15 | Letzte 7 Backups behalten |

**Code (Zeile 9-10):**
```bash
docker exec automationone-postgres pg_dump -U god_kaiser -d god_kaiser_db | gzip > "${BACKUP_FILE}"
```

#### Restore-Script

**Datei:** `scripts/docker/restore.sh`

| Aspekt | Zeile | Detail |
|--------|-------|--------|
| Eingabe | 4-11 | `FILE=path` oder `FILE=latest` |
| Safety-Check | 13-16 | Interaktive Bestätigung |
| Datenbank-Reset | 18-20 | Stop Server → DROP DB → CREATE DB |
| Restore | 21 | `gunzip -c \| psql` |
| Server-Neustart | 22 | `docker start` |

**Restore-Flow (Zeile 18-22):**
```bash
# Step 1: Stop server
docker stop automationone-server 2>/dev/null || true

# Step 2: Drop alte DB
docker exec automationone-postgres psql -U god_kaiser -d postgres \
  -c "DROP DATABASE IF EXISTS god_kaiser_db;"

# Step 3: Create neue DB
docker exec automationone-postgres psql -U god_kaiser -d postgres \
  -c "CREATE DATABASE god_kaiser_db OWNER god_kaiser;"

# Step 4: Restore
gunzip -c "$FILE" | docker exec -i automationone-postgres \
  psql -U god_kaiser -d god_kaiser_db

# Step 5: Start server
docker start automationone-server
```

---

## ESP32-Debug (Fragen 11-13)

### 11. Boot-Sequenz

**Datei:** `El Trabajante/src/main.cpp:127-800`

| Schritt | Zeile | Modul | Beschreibung |
|---------|-------|-------|--------------|
| 1 | 131-142 | Serial | UART Init (115200 bps), Wokwi +500ms delay |
| 2 | 147-152 | Boot Banner | Chip Model, CPU Freq, Free Heap |
| 3 | 155-167 | Watchdog Config | WDT-Mode bestimmt (DISABLED in Wokwi) |
| 4 | 170-242 | Boot-Button Check | GPIO 0 long-press (10s) = Factory Reset |
| 5 | **245-248** | **GPIO Safe-Mode** | `gpioManager.initializeAllPinsToSafeMode()` **KRITISCH, ZUERST!** |
| 6 | 251-255 | Logger System | `logger.begin()`, Level = LOG_INFO |
| 7 | 258-263 | Storage Manager | NVS-Access Layer |
| 8 | 266-278 | Config Manager | `loadAllConfigs()` + WiFi/Zone/System |
| 9 | 280-308 | Defensive Repair | Inconsistent state detection |
| 10 | 311-330 | Boot-Loop Detection | 3x reboot in <60s = safe-mode |
| 11 | 330-370 | Provisioning Check | Wenn keine Config: AP-Mode |
| 12 | 520-545 | Hardware Safe-Mode | LED blink 4× bei AP-Mode-Fehler → infinite loop |
| 13 | 552-562 | Provisioning Skip | Skip WiFi/MQTT wenn STATE_SAFE_MODE_PROVISIONING |
| 14 | 567-591 | Error Tracker | `errorTracker.begin()`, `TopicBuilder::setEspId()` |
| 15 | 600-650 | WiFi Manager | Circuit Breaker: 10 failures → 60s timeout |
| 16 | 700+ | MQTT Client | Circuit Breaker: 5 failures → 30s timeout |

#### SafeMode-Auslöser

| Trigger | Zeile | Beschreibung |
|---------|-------|--------------|
| Boot-Button 10s | 180 | GPIO 0 gedrückt → NVS löschen |
| Boot-Loop | 314 | 3× reboot in <60s |
| Inconsistent State | 292-308 | provisioning-safe-mode + valid config |
| WiFi Failure | 615 | Keine Verbindung → Provisioning Portal |
| AP-Mode Failure | 518 | LED blink 4× → infinite loop |

---

### 12. Buffer und Persistenz

#### Sensor-Daten Buffer

**Befund:** KEIN lokaler Ring-Buffer implementiert

**Datei:** `El Trabajante/src/services/sensor/sensor_manager.h`

- **Architektur:** Server-zentrisch - ESP32 sendet RAW-Werte direkt via MQTT
- **Datenfluss:** Sensor-Read → JSON → MQTT Publish (QoS 1)
- **Kein Caching:** Daten werden nicht lokal gespeichert

#### NVS Persistenz

**Datei:** `El Trabajante/src/services/config/config_manager.cpp`

| Namespace | Inhalt |
|-----------|--------|
| `wifi_config` | SSID, Password |
| `zone_config` | Zone-Zuordnung |
| `system_config` | ESP-ID, Kaiser-ID |
| `sensors_config` | Sensor-Definitionen |
| `actuators_config` | Actuator-Definitionen |

**Buffer-Überlauf:** Bei NVS voll → `ERROR_NVS_WRITE_FAILED` (2003)

---

### 13. Error-Code Mapping

**Datei:** `El Trabajante/src/models/error_codes.h` (396 Zeilen)

#### Hardware Errors (1000-1999)

| Range | Kategorie | Beispiele |
|-------|-----------|-----------|
| 1001-1006 | GPIO | RESERVED, CONFLICT, INIT_FAILED, READ_FAILED |
| 1007-1019 | I2C Bus | TIMEOUT, CRC_FAILED, DEVICE_NOT_FOUND, BUS_STUCK |
| 1020-1029 | OneWire | INIT_FAILED, NO_DEVICES, ROM_VALIDATION |
| 1040-1043 | Sensor | READ_FAILED, INIT_FAILED, NOT_FOUND, TIMEOUT |
| 1050-1053 | Actuator | SET_FAILED, INIT_FAILED, NOT_FOUND, CONFLICT |
| 1060-1063 | DS18B20 | SENSOR_FAULT, POWER_RESET, OUT_OF_RANGE |

#### Service Errors (2000-2999)

| Range | Kategorie |
|-------|-----------|
| 2001-2005 | NVS Storage |
| 2010-2014 | Config |
| 2500-2506 | Subzone Management |

#### Communication Errors (3000-3999)

| Range | Kategorie |
|-------|-----------|
| 3001-3005 | WiFi |
| 3010-3016 | MQTT |
| 3020-3023 | HTTP |

#### Application Errors (4000-4999)

| Range | Kategorie |
|-------|-----------|
| 4001-4003 | State Machine |
| 4070-4072 | Watchdog |
| 4200-4202 | Device Approval |

#### MQTT-Meldung von Errors

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/error`

**Payload-Format:**
```json
{
  "error_code": 1002,
  "severity": "error",
  "message": "GPIO 21 conflict",
  "timestamp": 1707158400
}
```

---

## Server-Debug (Fragen 14-16)

### 14. Logging-Setup

**Datei:** `El Servador/god_kaiser_server/src/core/logging_config.py`

| Aspekt | Konfiguration |
|--------|---------------|
| Format | JSON oder Text (`LOG_FORMAT` env) |
| Level | INFO default (`LOG_LEVEL` env) |
| File Output | RotatingFileHandler |
| Max Size | 10MB (`LOG_FILE_MAX_BYTES`) |
| Backup Count | 5 Dateien |
| Encoding | UTF-8 |

#### JSON-Format (Zeile 24-60)
```json
{
    "timestamp": "2026-02-05 20:45:00",
    "level": "INFO",
    "logger": "module.name",
    "message": "Processing request",
    "module": "filename",
    "function": "function_name",
    "line": 123,
    "request_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### RequestIdFilter (Zeile 16-21)
- Fügt `request_id` zu jedem Log-Record
- Ermöglicht Request-Tracing

#### External Library Noise (Zeile 148-150)
```python
logging.getLogger("paho.mqtt").setLevel(logging.WARNING)
logging.getLogger("urllib3").setLevel(logging.WARNING)
logging.getLogger("asyncio").setLevel(logging.WARNING)
```

---

### 15. Middleware-Chain

**Datei:** `El Servador/god_kaiser_server/src/main.py:84-300`

**Reihenfolge:**
```
Client Request
    ↓
1. RequestIdMiddleware (request_id generation)
    ↓
2. CORSMiddleware (Cross-Origin validation)
    ↓
3. Auth Middleware (JWT validation - in dependencies)
    ↓
4. Logging Middleware (request/response logging)
    ↓
5. Exception Handlers (global error handling)
    ↓
Endpoint Handler
```

#### RequestIdMiddleware (middleware/request_id.py:33-67)
```python
async def dispatch(self, request: Request, call_next: Callable) -> Response:
    # 1. Generate or extract request_id
    request_id = request.headers.get("X-Request-ID") or generate_request_id()

    # 2. Store in context
    set_request_id(request_id)

    # 3. Process request
    response = await call_next(request)

    # 4. Log + Add header
    response.headers["X-Request-ID"] = request_id

    return response
```

#### Global Exception Handlers (core/exception_handlers.py)

| Handler | Zeile | Exception | Response |
|---------|-------|-----------|----------|
| `automation_one_exception_handler` | 17-54 | GodKaiserException | `{"success": false, "error": {...}}` |
| `general_exception_handler` | 57-85 | Unerwartete Exceptions | Generic 500 |

---

### 16. Fehlerpfade

#### DB-Connection Wegbruch

**Datei:** `El Servador/god_kaiser_server/src/db/session.py`

- Circuit Breaker öffnet nach 5 Failures
- Alle API-Endpoints (außer Health) schlagen fehl
- MQTT-Handler können nicht in DB schreiben
- **Retry:** 30s OPEN → 10s HALF_OPEN

#### MQTT-Broker nicht erreichbar

**ESP32-Seite (mqtt_client.cpp):**
- Circuit Breaker: 5 failures → 30s OPEN
- Exponential backoff: 1s → 60s max
- Offline-Buffer: 256 Messages

**Server-Seite (mqtt/client.py):**
- Reconnect-Logic mit LWT (Last-Will-Testament)
- Server setzt ESP status = offline

#### Circuit Breaker Pattern

**Vorhanden in:**
- `El Trabajante/src/services/communication/mqtt_client.cpp`
- `El Servador/god_kaiser_server/src/db/session.py`
- `El Servador/god_kaiser_server/src/mqtt/client.py`

---

## Meta-Analyst (Fragen 17-18)

### 17. Report-Format-Vergleich

**Verzeichnis:** `.claude/reports/current/`

**Anzahl:** 22 Reports

#### Einheitliches Format

| Section | Inhalt | Vorhanden in |
|---------|--------|--------------|
| Header | Agent, Datum, Kontext | ALLE Reports |
| Executive Summary | Kurze Problem-Übersicht | ALLE Reports |
| Log-Analyse | Raw-Logs mit Kontext | Debug-Reports |
| Root-Cause | Problem-Diagnose | Debug-Reports |
| Code-Analyse | Source Code mit Pfad:Zeile | Dev-Reports |
| Recommendations | Lösungsvorschlag | ALLE Reports |

#### Severity-Schema (konsistent)

| Level | Symbol | Anwendung |
|-------|--------|-----------|
| KRITISCH | `[K1]`, `[K2]` | System-crashes, Watchdog, Data-loss |
| WARNUNG | `[W1]`, `[W2]` | Degraded service, Recovered errors |
| INFO | `[I1]`, `[I2]` | Status, Configuration |

---

### 18. Cross-Layer Trace

#### ESP32 → Server Korrelation

| ESP32 Error | MQTT Topic | Server Processing | Frontend Status |
|-------------|------------|-------------------|-----------------|
| 1002 (GPIO conflict) | system/error | error_handler.py | "config_failed" |
| 1007 (I2C timeout) | sensor/data missing | Timeout-Logic | "last_read: null" |
| 3011 (MQTT connect) | LWT | lwt_handler.py | "offline" |
| 4070 (Watchdog) | ERROR heartbeat | heartbeat_handler.py | "critical" |

#### Trace-ID Implementierung

**HTTP Request-ID:**
- Generiert: RequestIdMiddleware
- Format: UUID4
- Header: `X-Request-ID`
- Geloggt: JSON field `request_id`

**MQTT Message Correlation:**
- **KEINE explizite trace-id in MQTT-Payload**
- Implizite Korrelation via: `esp_id` + `gpio` + `timestamp`
- Future Enhancement: Config-Payload könnte `trace_id` enthalten

#### Cross-Layer Flow-Beispiel

```
1. Frontend: POST /api/v1/sensors/{esp_id}/21
   Header: X-Request-ID: xxxxxxxx

2. Server API: RequestIdMiddleware sets context

3. MQTT Publisher: kaiser/god/esp/ESP_472204/config
   Payload: { "sensors": [{"gpio": 21, ...}] }

4. ESP32: handleSensorConfig() → GPIO conflict
   Publishes: kaiser/god/esp/ESP_472204/config_response
   Payload: { "status": "error", "failures": [{"gpio": 21, "error_code": 1002}] }

5. Server: ConfigHandler receives, correlates via esp_id + gpio
   Updates: sensor.config_status = "FAILED"

6. Frontend WebSocket: Device state update
```

---

## Kritische Findings

### Lücken identifiziert

| Bereich | Problem | Empfehlung |
|---------|---------|------------|
| MQTT_TOPICS.md | Zeilennummern ~13 versetzt | Aktualisieren |
| Mosquitto | Auth deaktiviert | Production-Checklist |
| MQTT Trace-ID | Keine explizite Korrelation | `trace_id` in Payload |
| Bridge/ACL | NICHT IMPLEMENTIERT | Bei Multi-Instance nötig |

### Stärken

| Bereich | Detail |
|---------|--------|
| Pattern-Konsistenz | TopicBuilder auf ESP32 + Server |
| Circuit Breaker | Intelligente Fehlerbehandlung |
| QoS-Granularität | Korrekt nach Message-Importance |
| Health-Checks | service_healthy verhindert Race-Conditions |
| Retention | DELETE-basiert mit Dry-Run-Safety |
