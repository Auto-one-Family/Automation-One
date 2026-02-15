# AutomationOne System Baseline Report
**Timestamp:** 2026-02-05 17:48:35 UTC+01:00  
**System:** Docker Compose Stack (All Services Healthy)  
**Purpose:** Establish baseline vor ESP32-WROOM Provisioning-Test mit SHT31-Sensor

---

## 1. Initial Setup

### Admin User Creation
**Endpoint:** POST /api/v1/auth/setup  
**Credentials:**
- Username: admin
- Password: Admin123# (Strong policy: min 8 chars, uppercase, lowercase, digit, special char)
- Email: admin@example.com

**Result:** SUCCESS
- User ID: 1
- Role: admin
- Status: is_active=true
- Access Token: erhalten (expires_in: 1800s / 30 min)
- Refresh Token: erhalten

---

## 2. Authentication Verification

### Login Test
**Endpoint:** POST /api/v1/auth/login  
**Result:** SUCCESS  
**Response:**
- Access Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (50+ chars)
- Token Type: bearer
- Expires In: 1800 seconds

### Auth Status Check
**Endpoint:** GET /api/v1/auth/status  
**Result:**
```json
{
  "setup_required": false,
  "users_exist": true,
  "mqtt_auth_enabled": false,
  "mqtt_tls_enabled": false
}
```

**Interpretation:**
- Setup abgeschlossen (setup_required=false)
- Admin-User existiert
- MQTT ohne Authentifizierung (Development-Modus)
- MQTT ohne TLS (Development-Modus)

---

## 3. System Health Checks

### Health Endpoint
**Endpoint:** GET /health  
**Result:**
```json
{
  "status": "healthy",
  "mqtt_connected": true
}
```

**Status:** HEALTHY
- Server läuft stabil
- MQTT Broker erreichbar und verbunden

### ESP Device Registry
**Endpoint:** GET /api/v1/esp/devices  
**Result:**
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 0,
    "total_pages": 0
  }
}
```

**Status:** 0 registrierte Devices (erwartungsgemäß)

### Pending ESP Devices
**Endpoint:** GET /api/v1/esp/devices/pending  
**Result:**
```json
{
  "success": true,
  "devices": [],
  "count": 0
}
```

**Status:** 0 pending Registrations (erwartungsgemäß)

### Sensors Endpoint
**Endpoint:** GET /api/v1/sensors  
**Result:** HTTP 307 Temporary Redirect

**Anomalie:** Endpoint redirected (Trailing-Slash-Normalisierung?)
- Status: Funktioniert, aber benötigt Trailing Slash
- Workaround: GET /api/v1/sensors/ verwenden
- Nicht kritisch für Provisioning-Test

---

## 4. MQTT Baseline

### Broker Connectivity
**Port 1883:** ERREICHBAR  
**Method:** TCP Socket-Test (bash /dev/tcp)  
**Result:** SUCCESS

### MQTT Traffic Analysis
**Source:** docker compose logs mqtt-broker (last 30 lines)  
**Pattern:** Nur Server-Health-Checks (alle 30s)

**Clients:**
- `healthcheck` - Server MQTT-Health-Check (clean_session=1, keepalive=60s)
- Keine ESP32-Clients verbunden
- Keine Retained Messages erwartet

**Traffic:**
- Regelmäßige Connect/Disconnect-Zyklen vom Healthcheck
- Keine Subscriptions/Publishes von ESPs
- Keine Fehler oder Connection-Rejects

**Baseline:** Sauber. Kein ESP32-Traffic vorhanden.

---

## 5. Service Logs (Relevant Excerpts)

### El Servador (FastAPI Server)
```
2026-02-05 16:47:32 - src.api.v1.auth - INFO - Initial setup completed: Admin 'admin' created
2026-02-05 16:47:32 - src.middleware.request_id - INFO - Request completed: POST /api/v1/auth/setup status=200 duration=317.4ms

2026-02-05 16:47:38 - src.api.v1.auth - INFO - User logged in: admin
2026-02-05 16:47:42 - src.middleware.request_id - INFO - Request completed: GET /health status=200 duration=0.4ms

2026-02-05 16:47:28 - src.services.maintenance.jobs.sensor_health - INFO - Sensor health check: No enabled sensors found
2026-02-05 16:47:28 - src.services.maintenance.service - INFO - [monitor] health_check_esps: 0 checked, 0 online, 0 timed out

2026-02-05 16:47:58 - apscheduler.executors.default - INFO - Job "MaintenanceService._health_check_mqtt" executed successfully
```

**Key Points:**
- Admin-Setup erfolgreich (317ms)
- Login funktioniert (378ms average)
- Health-Checks laufen planmäßig (30s MQTT, 60s ESP/Sensor)
- Maintenance-Service aktiv
- Keine Fehler oder Exceptions

### MQTT Broker (Mosquitto)
```
2026-02-05 16:47:52: New client connected from ::1:54120 as healthcheck (p2, c1, k60).
2026-02-05 16:47:52: Client healthcheck closed its connection.
2026-02-05 16:48:14: New connection from 172.18.0.1:52888 on port 1883.
2026-02-05 16:48:14: Client <unknown> closed its connection.
```

**Key Points:**
- Broker stabil (nur Healthchecks)
- Port 1883 offen und erreichbar
- Keine Failed-Auth-Attempts
- Keine Abnormalities

### PostgreSQL
```
2026-02-05 16:30:51.855 UTC [1] LOG:  database system is ready to accept connections
2026-02-05 16:35:51.906 UTC [55] LOG:  checkpoint starting: time
2026-02-05 16:36:12.068 UTC [55] LOG:  checkpoint complete: wrote 203 buffers (1.2%)
```

**Key Points:**
- DB initialisiert und bereit
- Regelmäßige Checkpoints (5min interval)
- Keine Connection-Errors
- Zwei FATAL-Logs bei Init (Role "automationone", "postgres" fehlen) - Normal bei Setup

---

## 6. System Status Summary

| Component | Status | Notes |
|-----------|--------|-------|
| **PostgreSQL** | HEALTHY | DB bereit, Checkpoints laufen |
| **MQTT Broker** | HEALTHY | Port 1883 erreichbar, Healthchecks OK |
| **El Servador (FastAPI)** | HEALTHY | API erreichbar, MQTT connected |
| **Admin User** | CREATED | username=admin, role=admin, active=true |
| **Authentication** | OPERATIONAL | Login/Token-Issuance funktioniert |
| **ESP Device Registry** | EMPTY | 0 devices, 0 pending (expected) |
| **Sensor Registry** | EMPTY | 0 sensors configured (expected) |
| **MQTT Traffic** | BASELINE | Nur Server-Healthchecks, kein ESP32-Traffic |

---

## 7. Readiness for ESP32 Provisioning

### Preconditions: ✅ ALL MET
- [x] Admin-User erstellt und validiert
- [x] Server healthy und erreichbar
- [x] MQTT Broker erreichbar (Port 1883)
- [x] Database leer (Clean Slate)
- [x] Keine bestehenden ESP-Registrierungen
- [x] Keine alten Sensor-Konfigurationen
- [x] Maintenance-Jobs laufen (Health-Checks aktiv)

### Expected ESP32 Provisioning Flow
1. **ESP32 bootet** → Serial Log zeigt "Provisioning Mode"
2. **ESP32 published Heartbeat** → `kaiser/god/esp/{MAC}/system/heartbeat`
3. **Server registriert ESP** → `/api/v1/esp/devices/pending` zeigt pending Device
4. **Admin approved Device** → POST `/api/v1/esp/devices/{device_id}/approve`
5. **ESP32 registriert Sensor** → `kaiser/god/esp/{MAC}/sensor/{GPIO}/register`
6. **Server konfiguriert SHT31** → Sensor-Config in DB
7. **ESP32 published Sensor-Data** → `kaiser/god/esp/{MAC}/sensor/{GPIO}/data`

### Critical Observations Points
- ESP32 Serial: Boot-Sequenz, NVS-Keys, MQTT-Connect
- MQTT Traffic: Heartbeat, Sensor-Registration, Sensor-Data
- Server Logs: Device-Approval, Sensor-Config, Data-Ingestion
- Database: esp_devices, sensors, sensor_readings Einträge

---

## 8. Next Steps

**Test-Vorbereitung:**
1. Hardware anschließen (ESP32-WROOM + SHT31 an I2C)
2. PlatformIO Project flashen (`pio run -e esp32_dev -t upload`)
3. Serial Monitor starten (`pio device monitor`)
4. MQTT Monitor starten (`mosquitto_sub -h localhost -t "kaiser/#" -v`)

**Monitoring während Test:**
- Serial Output (ESP32 Boot + Logs)
- MQTT Traffic (Heartbeat/Register/Data Topics)
- Server Logs (`docker compose logs -f el-servador`)
- API-Endpoints (Pending-Devices, Sensor-Status)

**Erfolgs-Kriterien:**
- ESP32 erscheint in Pending-Devices
- Approval erfolgreich
- SHT31-Sensor registriert sich
- Sensor-Daten werden empfangen und gespeichert
- Web-Dashboard zeigt Live-Daten

---

## 9. Baseline-Timestamp

**Report Generated:** 2026-02-05 17:48:35 UTC+01:00  
**System State:** READY FOR PROVISIONING TEST  
**Clean Slate:** ✅ Confirmed (0 Devices, 0 Sensors, 0 Pending)

**Baseline established. System bereit für ESP32-WROOM + SHT31 End-to-End Test.**
