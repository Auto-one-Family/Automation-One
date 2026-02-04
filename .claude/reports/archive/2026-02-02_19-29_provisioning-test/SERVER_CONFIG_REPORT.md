# Server CONFIG Debug Report

> **Session:** 2026-02-02_19-29_provisioning-test
> **Analysiert:** 2026-02-02 19:45 (aktualisiert)
> **Agent:** server-debug
> **Log-Datei:** `logs/current/god_kaiser.log` (33.561 Zeilen, ~9.5MB)
> **Zeitraum:** 17:55:32 - 19:29:57

---

## Executive Summary

| Aspekt | Status | Details |
|--------|--------|---------|
| **Server** | ✅ LÄUFT | Restart um 18:18:26, Maintenance-Jobs aktiv |
| **ESP Discovery** | ✅ OK | ESP_472204 entdeckt (pending_approval) |
| **Heartbeat Handling** | ✅ OK | 13 Heartbeats vor Restart, Wiederentdeckung nach Restart |
| **Zone Assignment** | ⚠️ FEHLGESCHLAGEN | Zone ACK von unbekanntem Device |
| **Error Flood** | 🔴 KRITISCH | 31.404 error_code=1023 Events (94% des Logs!) |
| **Server Restart** | ⚠️ BEACHTEN | ESP Session ging verloren |
| **Login** | ✅ ERFOLGREICH | Um 18:18:42 nach Server-Restart |

---

## 1. Server-Lifecycle Events

### 1.1 Server Restart (18:18:26)

**⚠️ WICHTIG:** Server wurde um 18:18:26 neu gestartet!

```json
{
  "timestamp": "2026-02-02 18:18:26",
  "level": "WARNING",
  "message": "SECURITY: Using default JWT secret key (OK for development only)"
}
```

**Security Warnings beim Start:**
- ⚠️ `Using default JWT secret key` - Nur für Development!
- ⚠️ `MQTT TLS is disabled` - Credentials werden unverschlüsselt übertragen

### 1.2 ESP Session-Verlust (18:18:27)

Direkt nach dem Server-Restart:

```json
{
  "timestamp": "2026-02-02 18:18:27",
  "level": "WARNING",
  "logger": "src.mqtt.handlers.lwt_handler",
  "message": "LWT received: ESP ESP_472204 disconnected unexpectedly (reason: unexpected_disconnect)"
}
```

**Folge-Probleme:**
| Zeitpunkt | Problem |
|-----------|---------|
| 18:18:27 | `[5001] Zone ACK from unknown device: ESP_472204` |
| 18:18:27 | `[5001] LWT for unknown device ESP_472204 - ignoring` |
| 18:18:27 | Handler returned False für `actuator/26/status` |
| 18:18:27 | Handler returned False für `zone/ack` |
| 18:18:27 | Handler returned False für `system/error` (mehrfach) |

**Analyse:**
- Server-Restart löschte ESP-Registrierung aus dem Speicher
- ESP_472204 sendete weiterhin Messages
- Server konnte ESP nicht mehr zuordnen → Handler failures
- ESP wurde erst um 18:34:30 neu entdeckt (16 Minuten später)

---

## 2. Handler-Analyse

### 2.1 Heartbeat Handler

**Vor Server-Restart (17:55:49 - 18:07:49):**

| Metrik | Wert |
|--------|------|
| **Heartbeats empfangen** | 13 |
| **Intervall** | ~60 Sekunden |
| **WebSocket Broadcast** | 0.20ms - 0.57ms |
| **ESP Status in DB** | online |

**Nach Server-Restart (18:34:30):**

```json
{
  "timestamp": "2026-02-02 18:34:30",
  "message": "🔔 New ESP discovered: ESP_472204 (pending_approval) (Zone: unassigned, Sensors: 0, Actuators: 0)"
}
```

- ✅ ESP wurde nach Restart neu entdeckt
- ✅ `device_discovered` WebSocket-Broadcast gesendet
- ⚠️ ESP wieder als `pending_approval` (Zustand verloren)

---

### 2.2 Error Handler

| Metrik | Wert |
|--------|------|
| **Error Events** | 31.404 |
| **Error Code** | 1023 (ONEWIRE_INVALID_ROM_LENGTH) |
| **ESP** | ESP_472204 |
| **Severity** | error |

**🔴 KRITISCHES PROBLEM:**

```
Error code 1023 = ONEWIRE_INVALID_ROM_LENGTH
→ "OneWire ROM-Code must be 16 hex characters"
```

**Rate:** ~42 Error-Events pro Sekunde über ca. 12 Minuten!

**Auswirkung:**
- 94% des Server-Logs sind Error-Events
- Log-Datei: 9.5MB in ~90 Min
- Database wird mit Error-Events geflutet

---

### 2.3 Actuator Handler

**Vor Server-Restart (17:55:44 - 18:07:44):**

| Metrik | Wert |
|--------|------|
| **Status Updates** | ~26 (alle 30 Sekunden) |
| **GPIO** | 26 |
| **State** | off |
| **Value** | 0.0 |
| **Actuator ID** | 98f0b7a9-1a8e-4590-84a1-65361d6aa601 |

**⚠️ WARNING bei jeder Message:**
```
Actuator config not found: esp_id=ESP_472204, gpio=26. Updating state without config.
```

**Nach Server-Restart:**
```
Handler returned False for topic kaiser/god/esp/ESP_472204/actuator/26/status
```
→ Handler konnte ESP nicht mehr zuordnen

---

### 2.4 Zone ACK Handler

**⚠️ Zone Assignment fehlgeschlagen:**

```json
{
  "timestamp": "2026-02-02 18:18:27",
  "level": "WARNING",
  "message": "[5001] Zone ACK from unknown device: ESP_472204"
}
```

**Analyse:**
- ESP sendete Zone ACK nach Server-Restart
- Server kannte ESP_472204 nicht mehr
- Zone Assignment ging verloren

---

### 2.5 LWT Handler

```json
{
  "timestamp": "2026-02-02 18:18:27",
  "level": "WARNING",
  "message": "LWT received: ESP ESP_472204 disconnected unexpectedly (reason: unexpected_disconnect)"
}
```

Gefolgt von:
```
[5001] LWT for unknown device ESP_472204 - ignoring
```

---

### 2.6 Actuator Response Handler

**⚠️ Unbekanntes Device:**
```
ESP device not found for response: ESP_00000001. Response will be logged without device reference.
```
→ Retained Messages von einem nicht mehr existierenden Mock-ESP

---

## 3. Zone Assignment Flow

### 3.1 Status

| Schritt | Status | Details |
|---------|--------|---------|
| Zone Assign gesendet (vor Restart) | ⚠️ VERMUTLICH | ESP sendete ACK |
| Zone ACK empfangen | ⚠️ IGNORIERT | `[5001] unknown device` |
| ESP Zone Status (aktuell) | unassigned | Nach Wiederentdeckung |

**Timeline:**
1. **Vor 18:18:26:** ESP hatte Zone Assignment (sendete ACK)
2. **18:18:26:** Server Restart → ESP-Registrierung verloren
3. **18:18:27:** Zone ACK angekommen → `[5001] unknown device`
4. **18:34:30:** ESP neu entdeckt als `pending_approval`, Zone: `unassigned`

---

## 4. API/HTTP Requests

### 4.1 Nach Server-Restart (18:18:30 - 18:19:15)

| Zeit | Endpoint | Status | Bemerkung |
|------|----------|--------|-----------|
| 18:18:30 | POST /api/v1/auth/login | 422 | Validation error |
| 18:18:37 | POST /api/v1/auth/login | 422 | Validation error |
| 18:18:42 | POST /api/v1/auth/login | **200** | ✅ Login erfolgreich |
| 18:18:58 | GET /api/v1/esp/devices | 200 | ✅ |
| 18:18:58 | GET /api/v1/sensors | 307 | Redirect |
| 18:18:58 | GET /api/v1/actuators | 307 | Redirect |
| 18:18:59 | GET /api/v1/logic/rules | 200 | ✅ |
| 18:19:07 | GET /api/v1/esp/devices | 200 | ✅ |
| 18:19:07 | GET /api/v1/sensors/ | 200 | ✅ (37.5ms) |
| 18:19:07 | GET /api/v1/actuators/ | 200 | ✅ |

### 4.2 Aktuelle Session (19:25:57+)

| Zeit | Endpoint | Status | Bemerkung |
|------|----------|--------|-----------|
| 19:25:57 | GET /api/v1/esp/pending | 404 | Endpoint existiert nicht |
| 19:25:59 | GET /api/v1/esp/devices | 401 | No auth token |
| 19:26:01 | GET /health | 200 | ✅ |
| 19:26:18 | GET /api/v1/auth/status | 200 | ✅ |
| 19:26:24-55 | POST /api/v1/auth/login | 401/422 | Mehrere Fehlversuche |

**Auffälligkeiten:**
- ⚠️ `/api/v1/esp/pending` gibt 404 → Endpoint existiert nicht
- ⚠️ Mehrere fehlgeschlagene Login-Versuche für "admin"

---

## 5. Maintenance Jobs

| Job | Intervall | Status |
|-----|-----------|--------|
| `_health_check_mqtt` | 30s | ✅ OK |
| `_health_check_esps` | 60s | ✅ OK (0 online) |
| `_check_sensor_health` | 60s | ✅ OK (keine Sensoren) |
| `_cleanup_orphaned_mocks` | 1h | ✅ OK |
| `_aggregate_stats` | 1h | ✅ OK |

```
health_check_esps: 0 checked, 0 online, 0 timed out
```
→ ESP_472204 ist in `pending_approval` und wird nicht als "online" gezählt

---

## 6. Checkliste CONFIG-Flow

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| ✅ Server läuft | OK | Seit 18:18:26 |
| ✅ MQTT Health Check | OK | Alle 30s |
| ✅ Heartbeat empfangen | OK | 13 vor Restart + Wiederentdeckung |
| ✅ ESP Discovery | OK | ESP_472204 um 18:34:30 |
| ⚠️ Zone Assignment | VERLOREN | Nach Server-Restart |
| ❌ ESP Approval | AUSSTEHEND | Manuell erforderlich |
| ❌ Config Push | NICHT GESTARTET | Warten auf Approval |

---

## 7. Kritische Findings

### 7.1 🔴 Error-Flood (KRITISCH)

| Aspekt | Details |
|--------|---------|
| **Problem** | 31.404 ONEWIRE_INVALID_ROM_LENGTH Errors |
| **Impact** | Log-Overflow, DB-Belastung, 94% des Logs |
| **Root Cause** | ESP32 sendet ungültige OneWire ROM-Codes |
| **Action** | ESP32-Logs prüfen, Rate-Limiting implementieren |

### 7.2 ⚠️ Server-Restart Session-Verlust

| Aspekt | Details |
|--------|---------|
| **Problem** | ESP-Registrierung ging bei Restart verloren |
| **Impact** | Zone Assignment verloren, 16 Min bis Wiederentdeckung |
| **Root Cause** | Kein persistenter ESP-State |
| **Action** | ESP_472204 erneut approven und Zone zuweisen |

### 7.3 ⚠️ Security Warnings

| Warning | Impact |
|---------|--------|
| Default JWT Secret | Nur für Development akzeptabel |
| MQTT TLS disabled | Credentials unverschlüsselt |

### 7.4 ⚠️ Fehlende Actuator Config

| Aspekt | Details |
|--------|---------|
| **Problem** | GPIO 26 ohne Server-Config |
| **Impact** | Gering (graceful degradation) |
| **Action** | Actuator-Konfiguration erstellen |

### 7.5 ⚠️ Handler Failures nach Restart

| Topic | Problem |
|-------|---------|
| `actuator/26/status` | Handler returned False |
| `zone/ack` | Handler returned False |
| `system/error` | Handler returned False (mehrfach) |

---

## 8. Empfehlungen

### Sofort:
1. **ESP32-Logs analysieren** (esp32-debug) für OneWire-Fehlerursache
2. **ESP_472204 approven** um CONFIG-Flow zu starten
3. **Zone neu zuweisen** (ging bei Restart verloren)

### Kurzfristig:
4. Rate-Limiting für Error-Events implementieren
5. Error-Event Retention/Cleanup konfigurieren
6. Actuator-Konfiguration für GPIO 26 erstellen

### Mittelfristig:
7. Persistenten ESP-State implementieren (überlebt Server-Restart)
8. JWT Secret für Production ändern
9. MQTT TLS aktivieren

---

## 9. Timeline Zusammenfassung

| Zeit | Event |
|------|-------|
| 17:55:32 | Log-Start, Error-Flood beginnt (1023) |
| 17:55:44 | Erste Actuator-Status Messages (GPIO 26) |
| 17:55:49 | Erster Heartbeat (ESP_472204 online) |
| 18:07:49 | Letzter Heartbeat vor Restart |
| **18:18:26** | **SERVER RESTART** |
| 18:18:27 | LWT: ESP disconnected unexpectedly |
| 18:18:27 | Zone ACK failed: unknown device |
| 18:18:42 | Login erfolgreich |
| 18:34:30 | ESP_472204 neu entdeckt (pending_approval) |
| 19:25:57 | Aktuelle Session beginnt |
| 19:29:57 | Log-Ende |

---

*Report generiert: 2026-02-02 19:45*
*Agent: server-debug v1.1*
*Aktualisiert mit Server-Restart Analyse*
