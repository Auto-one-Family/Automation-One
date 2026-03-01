---
name: rest-api-reference
description: REST API Endpoints GET POST PUT DELETE ESP Sensor Actuator Zone
  Auth Login Token Frontend Server HTTP CRUD
allowed-tools: Read
---

# REST API Referenz

> **Version:** 2.5 | **Aktualisiert:** 2026-02-28
> **Base URL:** `/api/v1/`
> **Auth:** JWT Bearer Token (außer `/auth/status`, `/auth/setup`, `/health`)
> **Quellen:** Vollständige Codebase-Analyse aller Router in `El Servador/god_kaiser_server/src/api/v1/`
> **Endpoint-Anzahl:** ~170 Endpoints

---

## 0. Quick-Lookup (Alle Endpoints)

### Authentication (`/auth`) - 10 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/auth/status` | GET | - | System-Status (setup_required?) |
| `/auth/setup` | POST | - | Ersten Admin erstellen |
| `/auth/login` | POST | - | Login, JWT Token erhalten |
| `/auth/refresh` | POST | - | Token refresh |
| `/auth/register` | POST | JWT | Neuen User registrieren |
| `/auth/logout` | POST | JWT | Logout |
| `/auth/me` | GET | JWT | Aktuelle User-Info |
| `/auth/mqtt-credentials` | POST | Admin | MQTT-Credentials konfigurieren |
| `/auth/api-keys` | GET | JWT | API-Keys auflisten |
| `/auth/api-keys` | POST | JWT | API-Key erstellen |

### ESP Devices (`/esp`) - 15 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/esp/devices` | GET | JWT | Alle ESPs auflisten (ohne pending_approval) |
| `/esp/devices` | POST | Operator | Neues ESP registrieren |
| `/esp/devices/pending` | GET | Operator | **Pending Devices auflisten** |
| `/esp/devices/{esp_id}` | GET | JWT | ESP Details |
| `/esp/devices/{esp_id}` | PATCH | Operator | ESP aktualisieren |
| `/esp/devices/{esp_id}` | DELETE | Operator | ESP löschen (inkl. Sensoren/Aktoren) |
| `/esp/devices/{esp_id}/health` | GET | JWT | ESP Health Metrics |
| `/esp/devices/{esp_id}/config` | POST | Operator | Sensor/Actuator-Config senden |
| `/esp/devices/{esp_id}/restart` | POST | Operator | ESP neu starten |
| `/esp/devices/{esp_id}/reset` | POST | Operator | Factory Reset (confirm=true) |
| `/esp/devices/{esp_id}/gpio-status` | GET | JWT | GPIO-Status (bus-aware) |
| `/esp/devices/{esp_id}/assign_kaiser` | POST | Operator | Kaiser zuweisen |
| `/esp/devices/{esp_id}/approve` | POST | Operator | **Pending Device genehmigen** |
| `/esp/devices/{esp_id}/reject` | POST | Operator | **Pending Device ablehnen** |
| `/esp/discovery` | GET | JWT | Network Discovery Results |

### Sensors (`/sensors`) - 12 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sensors` | GET | JWT | Alle Sensoren |
| `/sensors/{sensor_id}` | GET | JWT | Sensor Details |
| `/sensors` | POST | JWT | Sensor erstellen |
| `/sensors/{sensor_id}` | DELETE | JWT | Sensor löschen |
| `/sensors/{sensor_id}/data` | GET | JWT | Sensor-Daten (historisch) |
| `/sensors/{sensor_id}/stats` | GET | JWT | Sensor-Statistiken |
| `/sensors/types` | GET | JWT | Alle Sensor-Typen |
| `/sensors/calibrate` | POST | JWT/API-Key | Sensor kalibrieren (body: esp_id, gpio, sensor_type, calibration_points) |
| `/sensors/{sensor_id}/process` | POST | JWT | Sensor-Wert verarbeiten |
| `/sensors/onewire/scan` | POST | JWT | OneWire-Bus scannen |
| `/sensors/{sensor_id}/trigger` | POST | JWT | Messung triggern |
| `/sensors/by-esp/{esp_id}` | GET | JWT | Sensoren nach ESP |

### Actuators (`/actuators`) - 8 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/actuators` | GET | JWT | Alle Actuators |
| `/actuators/{actuator_id}` | GET | JWT | Actuator Details |
| `/actuators/{actuator_id}/command` | POST | JWT | Actuator steuern |
| `/actuators/{actuator_id}/state` | POST | JWT | Actuator-State setzen |
| `/actuators/{actuator_id}/history` | GET | JWT | Actuator-History |
| `/actuators/emergency-stop` | POST | JWT | Global Emergency-Stop |
| `/actuators/{actuator_id}` | DELETE | JWT | Actuator löschen |
| `/actuators/by-esp/{esp_id}` | GET | JWT | Actuators nach ESP |

### Zones (`/zone`) - 5 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/zone/devices/{esp_id}/assign` | POST | Operator | ESP einer Zone zuweisen (MQTT) |
| `/zone/devices/{esp_id}/zone` | DELETE | Operator | Zone-Zuweisung entfernen |
| `/zone/devices/{esp_id}` | GET | JWT | Zone-Info für ESP |
| `/zone/{zone_id}/devices` | GET | JWT | Alle ESPs in Zone |
| `/zone/unassigned` | GET | JWT | ESPs ohne Zone-Zuweisung |

> **⚠️ HINWEIS:** Es gibt keinen `GET /zone` Endpoint für "alle Zonen".
> Zonen werden aus ESP-Daten extrahiert (zone_id/zone_name Felder).

### Subzones (`/subzone`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/subzone/devices/{esp_id}/subzones/assign` | POST | Operator | GPIOs einer Subzone zuweisen (MQTT) |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}` | DELETE | Operator | Subzone entfernen |
| `/subzone/devices/{esp_id}/subzones` | GET | JWT | Alle Subzones eines ESP |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}` | GET | JWT | Subzone Details |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | POST | Operator | Safe-Mode aktivieren |
| `/subzone/devices/{esp_id}/subzones/{subzone_id}/safe-mode` | DELETE | Operator | Safe-Mode deaktivieren |

> **Hinweis:** Subzone-Endpoints sind device-scoped (wie Zone-Endpoints).
> Subzones haben eine eigene `subzone_configs` DB-Tabelle (im Gegensatz zu Zonen, die String-Felder auf `esp_devices` sind).

### Logic/Automation (`/logic`) - 8 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/logic/rules` | GET | JWT | Automation Rules auflisten |
| `/logic/rules` | POST | Operator | Neue Rule erstellen |
| `/logic/rules/{rule_id}` | GET | JWT | Rule Details |
| `/logic/rules/{rule_id}` | PUT | Operator | Rule aktualisieren |
| `/logic/rules/{rule_id}` | DELETE | Operator | Rule löschen |
| `/logic/rules/{rule_id}/toggle` | POST | Operator | Rule aktivieren/deaktivieren |
| `/logic/rules/{rule_id}/test` | POST | Operator | Rule testen |
| `/logic/execution_history` | GET | JWT | Execution History |

### Sequences (`/sequences`) - 4 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sequences` | GET | JWT | Alle Sequences |
| `/sequences/stats` | GET | JWT | Sequence-Statistiken |
| `/sequences/{sequence_id}` | GET | JWT | Sequence Details |
| `/sequences/{sequence_id}/cancel` | POST | JWT | Sequence abbrechen |

### Sensor Type Defaults (`/sensor-type-defaults`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/sensor-type-defaults` | GET | JWT | Alle Defaults |
| `/sensor-type-defaults/{sensor_type}` | GET | JWT | Default für Typ |
| `/sensor-type-defaults` | POST | JWT | Default erstellen |
| `/sensor-type-defaults/{sensor_type}` | PATCH | JWT | Default aktualisieren |
| `/sensor-type-defaults/{sensor_type}` | DELETE | JWT | Default löschen |
| `/sensor-type-defaults/{sensor_type}/effective` | GET | JWT | Effektive Konfiguration |

### Debug/Mock-ESP (`/debug`) - ~60 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/debug/mock-esp` | POST | JWT | Mock-ESP erstellen |
| `/debug/mock-esp` | GET | JWT | Alle Mock-ESPs |
| `/debug/mock-esp/{esp_id}` | GET | JWT | Mock-ESP Details |
| `/debug/mock-esp/{esp_id}` | DELETE | JWT | Mock-ESP löschen |
| `/debug/mock-esp/{esp_id}` | PATCH | JWT | Mock-ESP aktualisieren |
| `/debug/mock-esp/{esp_id}/heartbeat` | POST | JWT | Heartbeat triggern |
| `/debug/mock-esp/{esp_id}/state` | POST | JWT | State setzen |
| `/debug/mock-esp/{esp_id}/sensors` | POST | JWT | Sensor hinzufügen |
| `/debug/mock-esp/{esp_id}/sensors/{gpio}` | POST | JWT | Sensor-Wert setzen |
| `/debug/mock-esp/{esp_id}/sensors/{gpio}` | DELETE | JWT | Sensor entfernen |
| `/debug/mock-esp/{esp_id}/actuators` | POST | JWT | Actuator hinzufügen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}` | POST | JWT | Actuator-State setzen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}` | DELETE | JWT | Actuator entfernen |
| `/debug/mock-esp/{esp_id}/actuators/{gpio}/command` | POST | JWT | Actuator-Command |
| `/debug/mock-esp/{esp_id}/emergency-stop` | POST | JWT | Emergency-Stop |
| `/debug/mock-esp/{esp_id}/clear-emergency` | POST | JWT | Emergency-Stop zurücksetzen |
| `/debug/mock-esp/{esp_id}/messages` | GET | JWT | MQTT Messages |
| `/debug/mock-esp/{esp_id}/auto-heartbeat` | POST | JWT | Auto-Heartbeat Toggle |
| `/debug/mock-esp/{esp_id}/batch-sensors` | POST | JWT | Batch Sensor-Werte |
| `/debug/mock-esp/{esp_id}/simulate-disconnect` | POST | JWT | Disconnect simulieren |
| `/debug/mock-esp/{esp_id}/simulate-reconnect` | POST | JWT | Reconnect simulieren |
| `/debug/mock-esp/{esp_id}/zone/ack` | POST | JWT | Zone ACK simulieren |
| `/debug/mock-esp/{esp_id}/subzone/ack` | POST | JWT | Subzone ACK simulieren |
| `/debug/mock-esp/{esp_id}/config-response` | POST | JWT | Config-Response simulieren |
| `/debug/db/tables` | GET | JWT | Alle Tabellen |
| `/debug/db/{table}/schema` | GET | JWT | Tabellen-Schema |
| `/debug/db/{table}` | GET | JWT | Tabellen-Daten |
| `/debug/db/{table}/{record_id}` | GET | JWT | Record Details |
| `/debug/db/{table}/{record_id}` | DELETE | JWT | Record löschen |
| `/debug/logs` | GET | JWT | Server-Logs |
| `/debug/logs/files` | GET | JWT | Log-Files |
| `/debug/logs/cleanup` | DELETE | JWT | Logs bereinigen |
| `/debug/logs/cleanup/preview` | GET | JWT | Cleanup-Preview |
| `/debug/mqtt/topics` | GET | JWT | MQTT-Topics |
| `/debug/mqtt/messages` | GET | JWT | MQTT-Messages (Cache) |
| `/debug/mqtt/publish` | POST | JWT | MQTT-Message senden |
| `/debug/health` | GET | JWT | Debug Health-Check |
| `/debug/config` | GET | JWT | Debug-Konfiguration |
| `/debug/stats` | GET | JWT | Debug-Statistiken |
| `/debug/cache/clear` | POST | JWT | Cache leeren |
| `/debug/scheduler/jobs` | GET | JWT | Scheduler-Jobs |
| `/debug/scheduler/jobs/{job_id}/run` | POST | JWT | Job manuell ausführen |
| `/debug/resilience/status` | GET | JWT | Resilience-Status |

### Logs (`/logs`) - 1 Endpoint

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/logs/frontend` | POST | None | Frontend Error Log Ingestion (fire-and-forget, rate-limited 10/min/IP) |

### Errors (`/errors`) - 4 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/errors` | GET | JWT | Error-Logs |
| `/errors/stats` | GET | JWT | Error-Statistiken |
| `/errors/codes` | GET | JWT | Error-Code-Liste |
| `/errors/codes/{code}` | GET | JWT | Error-Code Details |

### Audit (`/audit`) - 22 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/audit` | GET | Admin | Audit-Logs |
| `/audit/stats` | GET | Admin | Audit-Statistiken |
| `/audit/actions` | GET | Admin | Verfügbare Actions |
| `/audit/entity-types` | GET | Admin | Verfügbare Entity-Types |
| `/audit/users` | GET | Admin | Audit nach User |
| `/audit/timeline` | GET | Admin | Audit-Timeline |
| `/audit/search` | GET | Admin | Volltext-Suche |
| `/audit/export` | GET | Admin | Audit-Export |
| `/audit/retention` | GET | Admin | Retention-Einstellungen |
| `/audit/retention` | PUT | Admin | Retention aktualisieren |
| `/audit/cleanup` | POST | Admin | Manuelles Cleanup |
| `/audit/cleanup/preview` | GET | Admin | Cleanup-Preview |
| `/audit/cleanup/preview/detailed` | GET | Admin | Detaillierter Preview |
| `/audit/cleanup/stats` | GET | Admin | Cleanup-Statistiken |
| `/audit/auto-cleanup/status` | GET | Admin | Auto-Cleanup Status |
| `/audit/auto-cleanup/toggle` | POST | Admin | Auto-Cleanup Toggle |
| `/audit/backups` | GET | Admin | Backup-Liste |
| `/audit/backups` | POST | Admin | Backup erstellen |
| `/audit/backups/{backup_id}` | DELETE | Admin | Backup löschen |
| `/audit/backups/{backup_id}/restore` | POST | Admin | Backup wiederherstellen |
| `/audit/backups/{backup_id}/download` | GET | Admin | Backup herunterladen |
| `/audit/retention/auto` | PUT | Admin | Auto-Retention Toggle |

### Users (`/users`) - 7 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/users` | GET | Admin | Alle User |
| `/users` | POST | Admin | User erstellen |
| `/users/{user_id}` | GET | Admin | User Details |
| `/users/{user_id}` | PATCH | Admin | User bearbeiten |
| `/users/{user_id}` | DELETE | Admin | User löschen |
| `/users/{user_id}/reset-password` | POST | Admin | Passwort zurücksetzen |
| `/users/{user_id}/role` | PATCH | Admin | Rolle ändern |

### Health (`/health`) - 6 Endpoints

| Endpoint | Method | Auth | Beschreibung |
|----------|--------|------|--------------|
| `/health` | GET | - | Health Check |
| `/health/detailed` | GET | JWT | Detaillierter Health Check |
| `/health/database` | GET | JWT | Database Health |
| `/health/mqtt` | GET | JWT | MQTT Health |
| `/health/metrics` | GET | JWT | System Metrics |
| `/health/esps` | GET | JWT | ESP Health Summary |

---

## 1. Authentication (`/auth`)

### 1.1 GET /auth/status

Prüft System-Status (Initial Setup erforderlich?).

**Auth:** Nicht erforderlich

**Response 200:**
```json
{
  "success": true,
  "data": {
    "setup_required": true,
    "user_count": 0
  }
}
```

---

### 1.2 POST /auth/setup

Erstellt den ersten Admin-User (nur wenn `setup_required: true`).

**Auth:** Nicht erforderlich

**Request Body (SetupRequest):**
```json
{
  "username": "admin",
  "email": "admin@example.com",
  "password": "SecurePassword123",
  "full_name": "Administrator"
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Setup already completed |
| 422 | Validation Error |

---

### 1.3 POST /auth/login

Login mit Credentials.

**Auth:** Nicht erforderlich

**Request Body (LoginRequest):**
```json
{
  "username": "admin",
  "password": "SecurePassword123",
  "remember_me": false
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

**Error Responses:**
| Code | Reason |
|------|--------|
| 401 | Invalid credentials |
| 403 | Account disabled |

---

### 1.4 POST /auth/refresh

Erneuert Access-Token mit Refresh-Token.

**Request Body (RefreshTokenRequest):**
```json
{
  "refresh_token": "eyJ..."
}
```

**Response 200 (TokenResponse):**
```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer"
}
```

---

### 1.5 GET /auth/me

Holt aktuelle User-Informationen.

**Auth:** JWT Required

**Response 200:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "Administrator",
    "role": "admin",
    "is_active": true,
    "created_at": "2026-01-01T00:00:00Z"
  }
}
```

---

### 1.6 POST /auth/logout

Logout (optional alle Sessions).

**Auth:** JWT Required

**Request Body (LogoutRequest):**
```json
{
  "logout_all": false
}
```

---

## 2. ESP Devices (`/esp`)

### 2.1 GET /esp/devices

Alle ESP-Geräte auflisten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `zone_id` | string | - | Filter nach Zone |
| `status` | string | - | online, offline |
| `include_sensors` | bool | false | Sensoren inkludieren |
| `include_actuators` | bool | false | Actuators inkludieren |
| `page` | int | 1 | Seite (1-indexed) |
| `page_size` | int | 20 | Einträge pro Seite |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "esp_id": "ESP_12AB34CD",
      "name": "Greenhouse Sensor",
      "zone_id": "greenhouse",
      "zone_name": "Gewächshaus",
      "is_online": true,
      "last_heartbeat": "2026-02-01T10:00:00Z",
      "sensor_count": 3,
      "actuator_count": 2
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

---

### 2.2 GET /esp/devices/{esp_id}

Einzelnes ESP-Gerät mit Details.

**Auth:** JWT Required

**Path Parameters:**
| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `esp_id` | string | ESP Device ID |

**Response 200:**
```json
{
  "success": true,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "name": "Greenhouse Sensor",
    "zone_id": "greenhouse",
    "zone_name": "Gewächshaus",
    "master_zone_id": "main_zone",
    "is_online": true,
    "last_heartbeat": "2026-02-01T10:00:00Z",
    "uptime": 3600,
    "heap_free": 245760,
    "wifi_rssi": -65,
    "sensors": [...],
    "actuators": [...],
    "metadata": {...}
  }
}
```

---

### 2.3 POST /esp/devices

Neues ESP-Gerät manuell registrieren.

**Auth:** Operator Required

**Request Body (ESPDeviceCreate):**
```json
{
  "device_id": "ESP_12AB34CD",
  "name": "Greenhouse Sensor",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus",
  "hardware_type": "ESP32_WROOM"
}
```

---

### 2.4 GET /esp/devices/pending

Pending Devices auflisten (warten auf Genehmigung).

**Auth:** Operator Required

**Response 200 (PendingDevicesListResponse):**
```json
{
  "success": true,
  "devices": [
    {
      "device_id": "ESP_12AB34CD",
      "discovered_at": "2026-02-01T10:00:00Z",
      "last_seen": "2026-02-01T10:05:00Z",
      "zone_id": null,
      "heap_free": 245760,
      "wifi_rssi": -65,
      "sensor_count": 2,
      "actuator_count": 1,
      "heartbeat_count": 5
    }
  ],
  "count": 1
}
```

---

### 2.5 PATCH /esp/devices/{esp_id}

ESP-Gerät aktualisieren.

**Auth:** Operator Required

**Request Body (ESPDeviceUpdate):**
```json
{
  "name": "New Name",
  "zone_id": "new_zone"
}
```

---

### 2.6 DELETE /esp/devices/{esp_id}

ESP-Gerät löschen (inkl. zugehöriger Sensoren und Aktoren).

**Auth:** Operator Required

---

### 2.7 POST /esp/devices/{esp_id}/approve

Pending Device genehmigen.

**Auth:** Operator Required

**Request Body (ESPApprovalRequest):**
```json
{
  "name": "Gewächshaus Sensor 1",
  "zone_id": "greenhouse",
  "zone_name": "Gewächshaus"
}
```

**Response 200 (ESPApprovalResponse):**
```json
{
  "success": true,
  "message": "Device 'ESP_12AB34CD' approved successfully",
  "device_id": "ESP_12AB34CD",
  "status": "approved",
  "approved_by": "admin",
  "approved_at": "2026-02-01T10:10:00Z"
}
```

---

### 2.8 POST /esp/devices/{esp_id}/reject

Pending Device ablehnen.

**Auth:** Operator Required

**Request Body (ESPRejectionRequest):**
```json
{
  "reason": "Unknown device, not part of installation"
}
```

---

## 3. Sensors (`/sensors`)

### 3.1 GET /sensors

Alle Sensoren auflisten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `esp_id` | string | Filter nach ESP |
| `sensor_type` | string | Filter nach Typ |
| `active` | bool | Nur aktive Sensoren |
| `subzone_id` | string | Filter nach Subzone |

---

### 3.2 GET /sensors/{sensor_id}

Sensor-Details.

**Auth:** JWT Required

---

### 3.3 GET /sensors/{sensor_id}/data

Historische Sensor-Daten.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `start_time` | datetime | Startzeit (ISO) |
| `end_time` | datetime | Endzeit (ISO) |
| `limit` | int | Max. Anzahl Einträge |
| `aggregation` | string | none, hour, day |

**Response 200:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2026-02-01T10:00:00Z",
      "raw_value": 2150,
      "processed_value": 21.5,
      "unit": "°C",
      "quality": "good"
    }
  ]
}
```

---

### 3.4 GET /sensors/{sensor_id}/stats

Sensor-Statistiken.

**Auth:** JWT Required

**Response 200:**
```json
{
  "success": true,
  "data": {
    "min": 18.5,
    "max": 28.3,
    "avg": 22.1,
    "count": 1440,
    "period": "24h"
  }
}
```

---

## 4. Actuators (`/actuators`)

### 4.1 GET /actuators

Alle Actuators auflisten.

**Auth:** JWT Required

---

### 4.2 GET /actuators/{actuator_id}

Actuator-Details.

**Auth:** JWT Required

---

### 4.3 POST /actuators/{actuator_id}/command

Actuator steuern.

**Auth:** JWT Required

**Request Body (ActuatorCommand):**
```json
{
  "command": "ON",
  "value": 1.0,
  "duration": 60
}
```

**Commands:** `ON`, `OFF`, `PWM`, `TOGGLE`

**Response 200:**
```json
{
  "success": true,
  "message": "Command sent",
  "command_id": "cmd_12345"
}
```

---

### 4.4 POST /actuators/emergency-stop

Global Emergency-Stop für alle Actuators.

**Auth:** JWT Required

**Request Body (EmergencyStopRequest):**
```json
{
  "reason": "User request",
  "esp_id": "ESP_12AB34CD"
}
```

---

## 5. Logic/Automation (`/logic`)

### 5.1 GET /logic/rules

Automation Rules auflisten (paginiert, sortiert nach Priority aufsteigend — niedrigere Nummer = höhere Priorität).

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `enabled` | bool | - | Filter nach enabled Status |
| `page` | int | 1 | Seite (1-indexed) |
| `page_size` | int | 20 | Einträge pro Seite (max: 100) |

**Response 200 (LogicRuleListResponse):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "High pH Alert",
      "description": "Stop dosing pump when pH exceeds 7.5",
      "conditions": [
        {"type": "sensor", "esp_id": "ESP_12AB34CD", "gpio": 34, "operator": ">", "value": 7.5}
      ],
      "actions": [
        {"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}
      ],
      "logic_operator": "AND",
      "enabled": true,
      "priority": 80,
      "cooldown_seconds": 300,
      "max_executions_per_hour": null,
      "last_triggered": "2026-01-01T12:00:00Z",
      "execution_count": 15,
      "last_execution_success": true,
      "created_at": "2026-01-01T00:00:00Z",
      "updated_at": "2026-01-01T12:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 5,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  }
}
```

---

### 5.2 POST /logic/rules

Neue Rule erstellen.

**Auth:** Operator Required

**Request Body (LogicRuleCreate):**
```json
{
  "name": "High pH Alert",
  "description": "Stop dosing pump when pH exceeds 7.5",
  "conditions": [
    {
      "type": "sensor",
      "esp_id": "ESP_12AB34CD",
      "gpio": 34,
      "operator": ">",
      "value": 7.5,
      "sensor_type": "ph"
    },
    {
      "type": "time",
      "start_time": "06:00",
      "end_time": "22:00"
    }
  ],
  "actions": [
    {
      "type": "actuator",
      "esp_id": "ESP_AABBCCDD",
      "gpio": 5,
      "command": "OFF",
      "value": 0.0
    }
  ],
  "logic_operator": "AND",
  "enabled": true,
  "priority": 80,
  "cooldown_seconds": 300,
  "max_executions_per_hour": 10
}
```

**Condition Types:**

| type | Felder | Beschreibung |
|------|--------|--------------|
| `sensor` / `sensor_threshold` | esp_id, gpio, operator, value, sensor_type? | Sensor-Schwellwert |
| `time` / `time_window` | start_time (HH:MM), end_time (HH:MM), days_of_week? | Zeitfenster |
| `hysteresis` | esp_id, gpio, sensor_type?, activate_above?, deactivate_below?, activate_below?, deactivate_above? | Hysterese |
| `compound` | logic (AND/OR), conditions[] | Verschachtelte Bedingungen |

**Action Types:**

| type | Felder | Beschreibung |
|------|--------|--------------|
| `actuator` / `actuator_command` | esp_id, gpio, command (ON/OFF/PWM/TOGGLE), value?, duration? | Actuator steuern |
| `notification` | channel (email/webhook/websocket), target, message_template | Benachrichtigung |
| `delay` | seconds (1-3600) | Verzögerung |
| `sequence` | description?, abort_on_failure?, steps[] (name, action, delay_seconds?) | Verkettete Aktionen |

**Response 201 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Validation Error oder Duplicate Name |
| 422 | Unprocessable Entity |

---

### 5.3 GET /logic/rules/{rule_id}

Rule Details abrufen.

**Auth:** JWT Required

**Response 200 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 404 | Rule not found |

---

### 5.4 PUT /logic/rules/{rule_id}

Rule aktualisieren (alle Felder optional).

**Auth:** Operator Required

**Request Body (LogicRuleUpdate):**
```json
{
  "name": "Updated Name",
  "conditions": [...],
  "actions": [...],
  "priority": 90
}
```

**Response 200 (LogicRuleResponse):** Siehe GET /logic/rules Response-Objekt.

**Error Responses:**
| Code | Reason |
|------|--------|
| 400 | Validation Error |
| 404 | Rule not found |

---

### 5.5 DELETE /logic/rules/{rule_id}

Rule löschen.

**Auth:** Operator Required

**Response 200 (LogicRuleResponse):** Gibt die gelöschte Rule zurück.

**Error Responses:**
| Code | Reason |
|------|--------|
| 404 | Rule not found |

---

### 5.6 POST /logic/rules/{rule_id}/toggle

Rule aktivieren/deaktivieren.

**Auth:** Operator Required

**Request Body (RuleToggleRequest):**
```json
{
  "enabled": true,
  "reason": "Maintenance complete"
}
```

**Response 200 (RuleToggleResponse):**
```json
{
  "success": true,
  "message": "Rule 'High pH Alert' enabled",
  "rule_id": "uuid",
  "rule_name": "High pH Alert",
  "enabled": true,
  "previous_state": false
}
```

---

### 5.7 POST /logic/rules/{rule_id}/test

Rule testen/simulieren ohne Aktionen auszuführen.

**Auth:** Operator Required

**Request Body (RuleTestRequest):**
```json
{
  "mock_sensor_values": {"ESP_12AB34CD:34": 7.8},
  "mock_time": "14:30",
  "dry_run": true
}
```

**Response 200 (RuleTestResponse):**
```json
{
  "success": true,
  "rule_id": "uuid",
  "rule_name": "High pH Alert",
  "would_trigger": true,
  "condition_results": [
    {
      "condition_index": 0,
      "condition_type": "sensor",
      "result": true,
      "details": "ESP_12AB34CD:34 (7.8) > 7.5",
      "actual_value": 7.8
    }
  ],
  "action_results": [
    {
      "action_index": 0,
      "action_type": "actuator",
      "would_execute": true,
      "details": "ESP_AABBCCDD:5 OFF",
      "dry_run": true
    }
  ],
  "dry_run": true
}
```

---

### 5.8 GET /logic/execution_history

Execution History abfragen (nicht rule-scoped).

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Default | Beschreibung |
|-----------|-----|---------|--------------|
| `rule_id` | UUID | - | Filter nach Rule |
| `success` | bool | - | Filter nach Erfolg |
| `start_time` | datetime | -7 Tage | Start-Zeitraum (ISO) |
| `end_time` | datetime | jetzt | End-Zeitraum (ISO) |
| `limit` | int | 50 | Max Ergebnisse (1-100) |

**Response 200 (ExecutionHistoryResponse):**
```json
{
  "success": true,
  "entries": [
    {
      "id": "uuid",
      "rule_id": "uuid",
      "rule_name": "High pH Alert",
      "triggered_at": "2026-01-01T12:00:00Z",
      "trigger_reason": "ESP_12AB34CD:34 (7.8) > 7.5",
      "actions_executed": [
        {"type": "actuator", "esp_id": "ESP_AABBCCDD", "gpio": 5, "command": "OFF"}
      ],
      "success": true,
      "error_message": null,
      "execution_time_ms": 45.2
    }
  ],
  "total_count": 150,
  "success_rate": 0.95
}
```

---

## 6. Debug/Mock-ESP (`/debug`)

### 6.1 POST /debug/mock-esp

Mock-ESP erstellen.

**Auth:** JWT Required

**Request Body (MockESPCreate):**
```json
{
  "esp_id": "ESP_MOCK_001",
  "name": "Test ESP",
  "zone_id": "test_zone"
}
```

---

### 6.2 GET /debug/mock-esp/{esp_id}

Mock-ESP Details (Live aus Memory).

**Auth:** JWT Required

---

### 6.3 POST /debug/mock-esp/{esp_id}/sensors

Sensor zu Mock-ESP hinzufügen.

**Auth:** JWT Required

**Request Body (MockSensorConfig):**
```json
{
  "gpio": 4,
  "sensor_type": "DS18B20",
  "name": "Test Sensor",
  "initial_value": 20.0
}
```

---

### 6.4 POST /debug/mock-esp/{esp_id}/sensors/{gpio}

Sensor-Wert setzen.

**Auth:** JWT Required

**Request Body (SetSensorValueRequest):**
```json
{
  "raw_value": 2150,
  "quality": "good",
  "publish": true
}
```

---

## 7. Database Explorer (`/debug/db`)

### 7.1 GET /debug/db/tables

Alle Tabellen mit Schema.

**Auth:** JWT Required

---

### 7.2 GET /debug/db/{table}

Tabellen-Daten mit Filter/Pagination.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `page` | int | Seitennummer (1-indexed) |
| `page_size` | int | Records pro Seite (max: 500) |
| `sort_by` | string | Sortier-Spalte |
| `sort_order` | string | "asc" oder "desc" |
| `filters` | JSON | Filter-Objekt |

---

## 8. Logs (`/debug/logs`)

### 8.1 GET /debug/logs

Server-Logs mit Filter.

**Auth:** JWT Required

**Query-Parameter:**

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `level` | string | DEBUG, INFO, WARNING, ERROR, CRITICAL |
| `module` | string | Logger-Name |
| `start_time` | datetime | Startzeit (ISO) |
| `end_time` | datetime | Endzeit (ISO) |
| `search` | string | Volltext-Suche |
| `page` | int | Seite |
| `page_size` | int | Einträge pro Seite |

---

## 9. Health (`/health`)

### 9.1 GET /health

Health Check (keine Auth erforderlich).

**Response 200:**
```json
{
  "status": "healthy",
  "mqtt_connected": true
}
```

> **Hinweis:** `/health` gibt nur `status` und `mqtt_connected` zurück. Für Details `/health/detailed` nutzen.

---

## 10. Error Responses

### Standard-Error-Response

```json
{
  "success": false,
  "error": {
    "code": 5201,
    "message": "Invalid ESP device ID format",
    "details": {
      "esp_id": "invalid"
    }
  }
}
```

### HTTP Status Codes

| Code | Bedeutung |
|------|-----------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (Validation Error) |
| 401 | Unauthorized (Token fehlt/ungültig) |
| 403 | Forbidden (Keine Berechtigung) |
| 404 | Not Found |
| 409 | Conflict (Duplicate) |
| 422 | Unprocessable Entity |
| 500 | Internal Server Error |

---

## 11. Pydantic Schemas (Übersicht)

### Auth Schemas (`schemas/auth.py`)
- `SetupRequest`, `LoginRequest`, `TokenResponse`
- `RegisterRequest`, `RefreshTokenRequest`
- `UserBase`, `UserUpdate`, `PasswordChangeRequest`
- `LogoutRequest`, `MQTTAuthConfigRequest`
- `APIKeyCreate`, `APIKeyInfo`

### ESP Schemas (`schemas/esp.py`)
- `ESPDeviceBase`, `ESPDeviceUpdate`
- `GpioStatusItem`, `GpioStatusResponse`
- `ESPHealthMetrics`, `ESPHealthSummary`
- `ESPConfigUpdate`, `ESPRestartRequest`
- `PendingESPDevice`, `ESPApprovalRequest`

### Sensor Schemas (`schemas/sensor.py`)
- `SensorConfigBase`, `SensorConfigUpdate`
- `SensorReading`, `SensorDataQuery`, `SensorStats`
- `SensorProcessRequest`, `SensorCalibrateRequest`
- `OneWireDevice`, `OneWireScanRequest`

### Actuator Schemas (`schemas/actuator.py`)
- `ActuatorConfigBase`, `ActuatorConfigUpdate`
- `ActuatorCommand`, `ActuatorState`
- `EmergencyStopRequest`, `ActuatorHistoryEntry`

### Logic Schemas (`schemas/logic.py`)
- `SensorCondition`, `TimeCondition`, `HysteresisCondition`, `CompoundCondition`
- `ActuatorAction`, `NotificationAction`, `DelayAction`
- `LogicRuleBase`, `LogicRuleCreate`, `LogicRuleUpdate`
- `LogicRuleResponse`, `LogicRuleListResponse`
- `RuleToggleRequest`, `RuleToggleResponse`
- `RuleTestRequest`, `RuleTestResponse`, `ConditionResult`, `ActionResult`
- `ExecutionHistoryEntry`, `ExecutionHistoryQuery`, `ExecutionHistoryResponse`

### Debug Schemas (`schemas/debug.py`)
- `MockESPCreate`, `MockESPUpdate`, `MockESPResponse`
- `MockSensorConfig`, `SetSensorValueRequest`
- `MockActuatorConfig`, `ActuatorCommandRequest`

### Common Schemas (`schemas/common.py`)
- `APIResponse[T]`, `PaginatedResponse[T]`
- `BaseResponse`, `ErrorResponse`
- `PaginationParams`, `PaginationMeta`
- `TimeRangeFilter`, `ValidationError`

---

## 12. Code-Locations

### Frontend API-Module (`El Frontend/src/api/`)

| Modul | Datei | Beschreibung |
|-------|-------|--------------|
| auth | `auth.ts` | Authentication |
| esp | `esp.ts` | ESP Devices (Mock + Real) |
| sensors | `sensors.ts` | Sensor CRUD |
| actuators | `actuators.ts` | Actuator Control |
| zones | `zones.ts` | Zone Management |
| subzones | `subzones.ts` | Subzone Management |
| logic | `logic.ts` | Automation Rules |
| debug | `debug.ts` | Mock-ESP Simulation |
| database | `database.ts` | Database Explorer |
| logs | `logs.ts` | Log Viewer |
| audit | `audit.ts` | Audit Logs |
| users | `users.ts` | User Management |

### Backend Router (`El Servador/god_kaiser_server/src/api/v1/`)

| Router | Datei | Endpoints |
|--------|-------|-----------|
| auth | `auth.py` | 10 |
| esp | `esp.py` | 16 |
| sensors | `sensors.py` | 12 |
| actuators | `actuators.py` | 8 |
| zone | `zone.py` | 5 |
| subzone | `subzone.py` | 6 |
| logic | `logic.py` | 8 |
| sequences | `sequences.py` | 4 |
| sensor_type_defaults | `sensor_type_defaults.py` | 6 |
| debug | `debug.py` | ~60 |
| errors | `errors.py` | 4 |
| audit | `audit.py` | 22 |
| users | `users.py` | 7 |
| health | `health.py` | 6 |
| logs | `logs.py` | 1 |
| websocket | `websocket/realtime.py` | 1 |
| ai | `ai.py` | PLANNED (God Layer AI) |
| kaiser | `kaiser.py` | PLANNED (Kaiser Relay Node) |
| library | `library.py` | PLANNED (OTA Sensor Library) |
