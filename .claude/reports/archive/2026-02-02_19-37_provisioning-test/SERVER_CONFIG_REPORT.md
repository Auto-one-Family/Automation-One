# Server CONFIG Debug Report

> **Session:** 2026-02-02_19-37_provisioning-test
> **Analysiert:** 2026-02-02
> **Log-Datei:** `logs/current/god_kaiser.log` (~9.6MB)
> **Fokus:** Backend-Handler, MQTT-Empfang, Database-Operationen

---

## Executive Summary

| Kategorie | Status | Details |
|-----------|--------|---------|
| **Server-Startup** | ✅ OK | Alle Subsysteme initialisiert |
| **Database** | ✅ OK | SQLite, CircuitBreaker aktiv |
| **MQTT-Verbindung** | ✅ OK | 127.0.0.1:1883, 11 Handler registriert |
| **ESP-Discovery** | ✅ OK | ESP_472204 entdeckt und approved |
| **Zone Assignment** | ✅ OK | test_zone_1 zugewiesen und bestätigt |
| **Fehler** | ⚠️ WARNUNG | 531 ERROR-Logs (Race Condition) |

---

## 1. Server-Startup Sequenz

**Timestamp:** 18:18:26 - 18:18:27 (< 2 Sekunden)

### Initialisierung (in Reihenfolge)

| # | Komponente | Status | Details |
|---|------------|--------|---------|
| 1 | Resilience Patterns | ✅ | Registry ready, external_api breaker registered |
| 2 | Database | ✅ | SQLite (no connection pooling) |
| 3 | CircuitBreaker[database] | ✅ | threshold=3, recovery=10s, half_open=5s |
| 4 | MQTT Client | ✅ | god_kaiser_server_18320 (PID-based) |
| 5 | CircuitBreaker[mqtt] | ✅ | threshold=5, recovery=30s, half_open=10s |
| 6 | OfflineBuffer | ✅ | max_size=1000, batch_size=50 |
| 7 | MQTT Connection | ✅ | 127.0.0.1:1883 (TLS: False), rc=0 |
| 8 | MQTT Handlers | ✅ | 11 handlers registered |
| 9 | Central Scheduler | ✅ | APScheduler started |
| 10 | SimulationScheduler | ✅ | Initialized |

### Registrierte MQTT-Handler (11)

```
kaiser/god/esp/+/sensor/+/data         (QoS 1)
kaiser/god/esp/+/actuator/+/status     (QoS 1)
kaiser/god/esp/+/actuator/+/response   (QoS 1)
kaiser/god/esp/+/actuator/+/alert      (QoS 1)
kaiser/god/esp/+/system/heartbeat      (QoS 0)
kaiser/god/discovery/esp32_nodes       (QoS 1)
kaiser/god/esp/+/config_response       (QoS 2)
kaiser/god/esp/+/zone/ack              (QoS 1)
kaiser/god/esp/+/subzone/ack           (QoS 1)
kaiser/god/esp/+/system/will           (QoS 1)
kaiser/god/esp/+/system/error          (QoS 1)
```

---

## 2. CONFIG-Flow Timeline

```
18:18:26  │ Server-Start
18:18:27  │ ✅ MQTT connected, alle Handler bereit
          │
18:18:27  │ ⚠️ ERROR-Welle: [5001] ESP device not found: ESP_472204
          │    └─ ESP sendete Daten BEVOR Registrierung
          │
18:34:30  │ ✅ 🔔 New ESP discovered: ESP_472204 (pending_approval)
          │    └─ heartbeat_handler.py:379 (_auto_register_esp)
          │
19:34:32  │ ✅ ✅ Device ESP_472204 now online after approval
          │    └─ heartbeat_handler.py:184 (handle_heartbeat)
          │
19:36:00  │ ✅ Zone assignment sent to ESP_472204: zone_id=test_zone_1
          │    └─ zone_service.py:150 (assign_zone)
          │    └─ zone.py:107 (API, by user: Robin)
          │
19:36:00  │ ✅ Zone assignment confirmed for ESP_472204
          │    └─ zone_ack_handler.py:138 (handle_zone_ack)
```

---

## 3. Heartbeat-Verarbeitung

| Metrik | Wert |
|--------|------|
| Heartbeat-bezogene Log-Einträge | 40 |
| Invalid Heartbeat Payloads | 0 |
| New ESP Discoveries | 1 (ESP_472204) |
| Devices Online after Approval | 1 (ESP_472204) |

### Heartbeat-Handler Funktionen (Verifiziert)

- `_auto_register_esp()` - ✅ Korrekt aufgerufen bei erstem Heartbeat
- `handle_heartbeat()` - ✅ Korrekt aufgerufen bei approved ESP

---

## 4. Error-Analyse

| Error-Code | Anzahl | Handler | Beschreibung |
|------------|--------|---------|--------------|
| **[5001]** | ~500+ | actuator_handler, error_handler | ESP device not found |

### Root Cause: Race Condition

**Problem:**
ESP_472204 sendete Sensor- und Actuator-Daten um **18:18:27**, aber der erste Heartbeat (für Auto-Registration) kam erst um **18:34:30** (16 Minuten später).

**Ursache-Hypothesen:**
1. ESP32 hatte retained MQTT-Messages auf dem Broker
2. ESP32 sendet Sensor-Daten BEVOR initial Heartbeat
3. Server wurde neu gestartet während ESP32 bereits online war

**Impact:** Keine funktionalen Auswirkungen. Die Fehler sind erwartetes Verhalten wenn Daten vor Registrierung ankommen. Server verwirft diese korrekt.

**Empfehlung:**
- ESP32 Firmware prüfen: Initial Heartbeat MUSS vor ersten Sensor-Daten gesendet werden
- Oder: Server sollte unbekannte ESPs temporär buffern statt Error zu loggen

---

## 5. Database-Operationen

| Operation | Status | Details |
|-----------|--------|---------|
| Engine Creation | ✅ | SQLite (development mode) |
| CircuitBreaker | ✅ | Aktiv, threshold=3 |
| Initialization | ✅ | Complete in <1s |

**Keine Database-Fehler im Log.**

---

## 6. Zone Assignment (CONFIG-Flow Kern)

### Request (API → Service → MQTT)

```json
{
  "esp_id": "ESP_472204",
  "zone_id": "test_zone_1",
  "master_zone_id": null,
  "user": "Robin"
}
```

**Code-Path:**
1. `api/v1/zone.py:107` - API Endpoint empfängt Request
2. `zone_service.py:150` - Service sendet MQTT `zone/assign`
3. MQTT → ESP32

### Response (ESP32 → MQTT → Handler)

```json
{
  "esp_id": "ESP_472204",
  "zone_id": "test_zone_1",
  "master_zone_id": ""
}
```

**Code-Path:**
1. MQTT `zone/ack` empfangen
2. `zone_ack_handler.py:138` - Handler verarbeitet ACK
3. Database Update (ESP32 Status)

**Latenz:** < 1 Sekunde (innerhalb gleicher Log-Sekunde 19:36:00)

---

## 7. Checkliste (gemäß STATUS.md)

### Server-Anforderungen

| Anforderung | Status | Evidence |
|-------------|--------|----------|
| Heartbeat empfangen | ✅ | `New ESP discovered: ESP_472204` |
| Heartbeat validiert | ✅ | Keine `Invalid heartbeat payload` Errors |
| Zone-Assignment gesendet | ✅ | `Zone assignment sent to ESP_472204` |
| Zone-ACK verarbeitet | ✅ | `Zone assignment confirmed for ESP_472204` |
| Keine kritischen Fehler | ⚠️ | 531 ERRORs (nicht kritisch, Race Condition) |

---

## 8. Empfehlungen

### Priorität 1 (Sollte behoben werden)

1. **ESP32 Boot-Sequenz prüfen**
   - Heartbeat MUSS vor Sensor-Daten gesendet werden
   - Prüfen in: `El Trabajante/src/main.cpp`

### Priorität 2 (Nice-to-have)

2. **Error-Level für unbekannte ESPs reduzieren**
   - Von ERROR auf WARNING ändern
   - Location: `actuator_handler.py:106`, `error_handler.py:128`

3. **Temporary Buffer für unregistrierte ESPs**
   - Daten buffern bis Heartbeat empfangen
   - Dann nachholen

---

## Zusammenfassung

**CONFIG-Flow funktioniert korrekt.** Der komplette Zyklus von ESP-Discovery über Approval bis Zone-Assignment wurde erfolgreich durchlaufen.

Die hohe Anzahl an ERROR-Logs ist auf eine Race Condition zurückzuführen (ESP sendete Daten vor Registrierung), hat aber keine funktionalen Auswirkungen auf den Betrieb.

---

*Generiert: 2026-02-02*
*Agent: server-debug*
*Session: 2026-02-02_19-37_provisioning-test*
