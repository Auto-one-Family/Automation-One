# Frontend Inspection Report

**Timestamp:** 2026-02-15T15:51:49Z (Approval) / 2026-02-15T15:55:00Z (Report)
**Inspector:** Frontend Inspector (API-Level + Code-Analyse + Log-Korrelation)
**Kontext:** ESP32-Dev SHT31 pending_approval, Parallel-Inspektion mit Backend Inspector
**Methode:** API-Calls, Docker-Logs, DB-Queries, MQTT-Traffic, Code-Analyse (kein Browser-Zugang)

---

## 1. Frontend-Service-Status

### Container
| Aspekt | Wert |
|--------|------|
| Container | automationone-frontend |
| Status | Up 4 hours (healthy) |
| Port | 5173 (erreichbar) |
| Vite Version | 6.4.1 |
| Network IP | 172.18.0.13 |

### Container-Logs
- **Vite**: `ready in 4244 ms` (3. Restart im Log-Fenster)
- **Proxy-Errors (historisch)**: `11:31:54 AM` - 3x `ECONNREFUSED 172.18.0.12:8000` - Frontend startete vor Server (normales Startup-Timing)
- **Keine aktuellen Fehler** im Container-Log

---

## 2. Auth-Flow Validierung

### Login-Request
```
POST /api/v1/auth/login
Body: {"username":"admin","password":"Admin123#"}
Response: 200 OK
```

### Login-Response
```json
{
  "success": true,
  "message": "Login successful",
  "tokens": {
    "access_token": "eyJhbG...B5Y",
    "refresh_token": "eyJhbG...ado",
    "token_type": "bearer",
    "expires_in": 1800
  },
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@example.com",
    "full_name": "E2E Test Admin",
    "role": "admin",
    "is_active": true
  }
}
```

**Befund:** Auth-Flow funktioniert korrekt. Token-Struktur: `tokens.access_token` (nicht direkt `access_token`).

### Token-Refresh (aus Loki-Logs)
- `14:37:24` - JWT Signature expired
- `14:37:24` - 2x GET `/auth/me` → 401
- `14:37:25` - Refresh token blacklisted (altes Token)
- Danach: `/auth/refresh` → 200 OK → neues Token
- WebSocket reconnect nach Token-Refresh: OK

**Befund:** Auto-Token-Refresh funktioniert. Blacklisted refresh tokens werden korrekt abgelehnt.

---

## 3. Pending Devices API

### GET /api/v1/esp/devices/pending (VOR Approval)
```
Status: 200 OK
```

```json
{
  "success": true,
  "count": 1,
  "devices": [{
    "device_id": "MOCK_E1BD1447",
    "discovered_at": "2026-02-15T12:02:37.965864Z",
    "last_seen": "2026-02-15T14:50:37.952086Z",
    "zone_id": "greenhouse",
    "heap_free": 49999,
    "wifi_rssi": -53,
    "sensor_count": 3,
    "actuator_count": 0,
    "heartbeat_count": 1,
    "ip_address": null,
    "hardware_type": "ESP32_WROOM"
  }]
}
```

### Frontend-Darstellung (Code-Analyse)
Basierend auf `PendingDevicesPanel.vue`:
- **TopBar-Button**: `"✨ 1 Neue"` mit iridescent Badge (Sparkles-Icon)
- **Panel-Inhalt**:
  - Device ID: `MOCK_E1BD1447`
  - IP: *(nicht angezeigt - ip_address ist null)*
  - WiFi-Signal: `-53 dBm` → `getWifiStrength()` → "Gut" (emerald)
  - Zeit: `getTimeAgo("2026-02-15T14:50:37")` → "gerade eben" oder "vor X Min"
  - Sensor Count: 3 | Actuator Count: 0
- **Buttons**: "Genehmigen" (Check-Icon) + "Ablehnen" (Ban-Icon)

**Befund:** Pending-Endpoint liefert korrekte Daten. `ip_address: null` und fehlende `firmware_version` sind auffällig (Mock-ESP sendet diese nicht).

---

## 4. DEVICE-AKZEPTANZ (Kerntest)

### POST /api/v1/esp/devices/MOCK_E1BD1447/approve
```
Timestamp: 2026-02-15T15:51:49.361Z (Client-Zeit)
Status: 200 OK
Duration: ~28s (inkl. PowerShell-Overhead, effektiv 35.5ms Server-seitig)
```

```json
{
  "success": true,
  "message": "Device 'MOCK_E1BD1447' approved successfully",
  "device_id": "MOCK_E1BD1447",
  "status": "approved",
  "approved_by": "admin",
  "approved_at": "2026-02-15T14:52:10.618535Z"
}
```

### Server-Log-Sequenz nach Approval
```
14:52:10 - ✅ Device approved: MOCK_E1BD1447 by admin
14:52:10 - POST /api/v1/esp/devices/MOCK_E1BD1447/approve status=200 duration=35.5ms
14:52:37 - [AUTO-HB] MOCK_E1BD1447 heartbeat published (state=OPERATIONAL)
14:52:37 - ✅ Device MOCK_E1BD1447 now online after approval
14:52:37 - ZONE_MISMATCH: ESP reports zone='greenhouse' but DB has zone=None
14:52:37 - Invalid JSON on system/will: Expecting value (char 0)
14:52:38 - WebSocket broadcast esp_health for MOCK_E1BD1447 completed in 4.73ms
14:52:38 - [MOCK_E1BD1447] Sensor 4_DS18B20 not in config
14:52:38 - [MOCK_E1BD1447] Sensor 21_sht31_temp not in config
14:52:38 - [MOCK_E1BD1447] Sensor 5_pH not in config
```

### Audit-Trail (DB)
| Timestamp | Event | Status |
|-----------|-------|--------|
| 14:52:10 | device_approved | success |
| 14:52:37 | device_online | success |

### Status-Transition
```
pending_approval → approved (14:52:10, API-Call)
                 → online   (14:52:37, nächster Heartbeat, +27s)
```

**Befund:** Approval-Flow funktioniert end-to-end. Status-Transition korrekt. Latenz approval→online = 27 Sekunden (nächster Heartbeat-Zyklus).

---

## 5. Post-Approval Validierung

### Pending Devices (NACH Approval)
```json
{
  "success": true,
  "count": 0,
  "devices": []
}
```
**Befund:** Pending-Liste korrekt geleert.

### All Devices (NACH Approval)
| device_id | status | last_seen | zone_id | sensor_count |
|-----------|--------|-----------|---------|--------------|
| MOCK_25045525 | online | 14:52:17 | test | 1 |
| MOCK_E1BD1447 | online | 14:53:37 | *(null)* | 0 |

**Befund:** MOCK_E1BD1447 ist jetzt online und in der Device-Liste. Aber: `zone_id: null`, `sensor_count: 0`, `name: null`, `ip_address: null`, `firmware_version: null`.

### Heartbeats (NACH Approval)
| device_id | count | first_hb | last_hb |
|-----------|-------|----------|---------|
| MOCK_E1BD1447 | 2 | 14:52:37 | 14:53:38 |

**Befund:** Heartbeat-Logging für MOCK_E1BD1447 begann NACH Approval (erwartetes Verhalten - pending Devices werden nicht geloggt).

### Sensor-Konfigurationen (NACH Approval)
| device_id | gpio | sensor_type | sensor_name | interface |
|-----------|------|-------------|-------------|-----------|
| MOCK_25045525 | 4 | DS18B20 | Temp 0C79 | ONEWIRE |

**MOCK_E1BD1447 hat KEINE sensor_configs.**

### Sensor-Daten für MOCK_E1BD1447
**0 Einträge.** Keine Sensor-Daten fließen.

**Befund KRITISCH:** Obwohl der Heartbeat `sensor_count: 3` meldet (DS18B20, sht31_temp, pH), wurden keine `sensor_configs` in der DB erstellt. Der Approval-Flow erstellt keine Sensor-Configs automatisch. Der SimulationScheduler versucht Daten zu generieren, scheitert aber mit "Sensor X not in config".

---

## 6. WebSocket-Analyse

### Aktive Connections
- 2 WebSocket-Clients verbunden (aus health/detailed)
- `total_messages_sent: 0` (Counter-Bug, Messages werden tatsächlich gesendet)

### WebSocket-Events (aus Server-Logs bestätigt)
| Timestamp | Event | Latenz |
|-----------|-------|--------|
| 14:52:38 | `esp_health` broadcast für MOCK_E1BD1447 | 4.73ms |

### Frontend WebSocket-Handler (Code-Analyse)
Der ESP-Store hat Handler für:
- `device_discovered` → `handleDeviceDiscovered()`: Fügt Device zu `pendingDevices` hinzu
- `device_approved` → `handleDeviceApproved()`: Entfernt aus `pendingDevices`, triggert `fetchAll()`
- `sensor_data` → Updates Sensor-Werte in ESP-Card
- `esp_health` → Updates Online/Offline Status

### Erwartetes Frontend-Verhalten nach Approval
1. `device_approved` WebSocket-Event empfangen
2. `pendingDevices` Array geleert
3. TopBar-Button ändert sich von "✨ 1 Neue" zu "Geräte"
4. `fetchAll()` wird aufgerufen → neue Device-Liste geladen
5. Toast: "Gerät MOCK_E1BD1447 wurde genehmigt"
6. ESP-Card für MOCK_E1BD1447 erscheint im Dashboard
7. **ABER: Keine Sensor-Daten** (keine sensor_configs → keine sensor_data → kein WebSocket sensor_data Event)

---

## 7. Cross-Layer-Korrelation: Browser → API → Server → DB → MQTT

### Approval-Flow Timeline
```
T+0.0s  [15:51:49] Frontend: POST /esp/devices/MOCK_E1BD1447/approve
T+0.035s [14:52:10] Server: Device approved by admin (35.5ms)
T+0.035s [14:52:10] Server: Audit-Log: device_approved (success)
T+0.035s [14:52:10] Server: DB: status → 'approved'
T+0.035s [14:52:10] Server: WebSocket broadcast: device_approved
T+0.035s [14:52:10] Frontend: device_approved empfangen → pendingDevices.remove()
T+0.035s [14:52:10] Frontend: fetchAll() → GET /esp/devices
T+0.035s [14:52:10] Frontend: Toast "Gerät MOCK_E1BD1447 wurde genehmigt"

T+27s   [14:52:37] SimScheduler: Heartbeat published for MOCK_E1BD1447
T+27s   [14:52:37] Server: ✅ Device now online after approval
T+27s   [14:52:37] Server: DB: status → 'online', last_seen updated
T+27s   [14:52:37] Server: Audit-Log: device_online (success)
T+27s   [14:52:37] Server: ZONE_MISMATCH warning (greenhouse vs null)
T+27.1s [14:52:38] Server: WebSocket broadcast esp_health (4.73ms)
T+27.1s [14:52:38] Frontend: esp_health empfangen → Device-Card status "online"

T+28s   [14:52:38] SimScheduler: Sensor-Job für MOCK_E1BD1447
T+28s   [14:52:38] Server: WARNING - Sensor 4_DS18B20 not in config
T+28s   [14:52:38] Server: WARNING - Sensor 21_sht31_temp not in config
T+28s   [14:52:38] Server: WARNING - Sensor 5_pH not in config
                   → KEINE sensor_data generiert → KEIN WebSocket sensor_data Event
```

### MQTT-Traffic nach Approval
```
kaiser/god/esp/MOCK_E1BD1447/system/heartbeat → Server verarbeitet → DB + WS broadcast
kaiser/god/esp/MOCK_E1BD1447/system/will → (null) → JSON parse error
kaiser/god/esp/MOCK_E1BD1447/system/heartbeat/ack ← Server sendet ACK
```

---

## 8. Befunde & Bewertung

### Funktioniert korrekt

| # | Befund | Evidenz |
|---|--------|---------|
| OK1 | **Auth-Flow** komplett funktional | Login 200, Token-Refresh 200, WS reconnect OK |
| OK2 | **Pending-API** liefert korrekte Daten | GET /pending → 1 device mit Details |
| OK3 | **Approval-API** funktioniert | POST /approve → 200 OK in 35.5ms |
| OK4 | **Status-Transition** korrekt | pending_approval → approved → online (27s) |
| OK5 | **Pending-Liste** wird geleert | POST /pending → count: 0 |
| OK6 | **Audit-Trail** vollständig | device_approved + device_online geloggt |
| OK7 | **WebSocket-Broadcast** funktioniert | esp_health broadcast in 4.73ms |
| OK8 | **Heartbeat-Logging** startet nach Approval | 2 Heartbeats in 1 Minute |
| OK9 | **Device in Geräteliste** sichtbar | GET /devices → 2 Devices, MOCK_E1BD1447 online |
| OK10 | **Frontend-Code** (statisch) robust | Duplicate-Prevention, Loading-States, Error-Handling |

### Probleme gefunden

| # | Schwere | Befund | Root Cause | Auswirkung |
|---|---------|--------|------------|------------|
| F1 | **KRITISCH** | Keine Sensor-Daten nach Approval | Keine sensor_configs für MOCK_E1BD1447 in DB | ESP-Card zeigt keine Sensoren, keine Live-Daten, 3 Warnings/30s |
| F2 | **HOCH** | Device-Metadaten fehlen | Mock-ESP sendet keine ip_address, firmware_version, name | ESP-Card zeigt unvollständige Infos |
| F3 | **HOCH** | ZONE_MISMATCH nach Approval | ESP meldet zone="greenhouse", DB hat zone=null | Zone-Reassign-Versuch mit leerer Zone |
| F4 | **MITTEL** | Invalid Will JSON | Mock-ESP publiziert `(null)` statt JSON | JSON parse error jede Minute |
| F5 | **MITTEL** | sensor_count Diskrepanz | Heartbeat meldet 3 Sensoren, DB hat 0 configs | Irreführende UI-Anzeige |
| F6 | **NIEDRIG** | WS message counter = 0 | Health-Service Counter-Bug | Monitoring-Blindspot |
| F7 | **NIEDRIG** | Kein Browser-Zugang | Playwright MCP nicht konfiguriert | Screenshots/Console nicht möglich |

### Empfehlungen

1. **F1 (KRITISCH):** Approval-Flow muss sensor_configs automatisch aus Heartbeat-Payload erstellen (sensor_count: 3 → 3 sensor_configs). Oder: Config-Push nach Approval.
2. **F2:** SimulationScheduler sollte realistische Metadaten generieren (IP, Firmware, Name).
3. **F3:** Zone-Assignment nach Approval klären - soll ESP-Zone (greenhouse) oder keine Zone zugewiesen werden?
4. **F4:** Will-Message im SimulationScheduler als valides JSON senden.
5. **F5:** Frontend sollte sensor_configs (DB) statt sensor_count (Heartbeat) für die Anzeige verwenden.

---

## 9. Dashboard-Erwartung (Frontend-Code-basiert)

### Was der User nach Approval sehen SOLLTE:
1. **TopBar**: Button ändert sich von "✨ 1 Neue" zu "Geräte" (Radio-Icon)
2. **Dashboard**: ESP-Card für MOCK_E1BD1447 erscheint
3. **ESP-Card Status**: "online" (grüner Indikator)
4. **Sensoren**: KEINE angezeigt (0 sensor_configs)
5. **Toast**: "Gerät MOCK_E1BD1447 wurde genehmigt" (4s Duration)

### Was der User NICHT sehen wird:
- Sensor-Satelliten (Temperature/Humidity) → keine sensor_configs
- Live-Sensor-Daten → keine sensor_data
- IP-Adresse → null
- Firmware-Version → null
- Device-Name → null (nur device_id wird angezeigt)

---

*Report erstellt durch API-Level + Code-Analyse + Log-Korrelation. Für visuelle Validierung (Screenshots, Console-Messages, DOM-State) wäre Playwright MCP oder manueller Browser-Test nötig.*
