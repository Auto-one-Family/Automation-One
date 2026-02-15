# MQTT Live Session Report

> **Session:** 2026-02-02 Live Capture
> **Capture-Dauer:** ~15 Minuten (kumuliert)
> **Agent:** MQTT_DEBUG_AGENT v1.0

---

## 1. Executive Summary

| Metrik | Wert |
|--------|------|
| **Erfasste Messages** | 47 |
| **Aktive ESPs (Heartbeat)** | 1 (ESP_472204) |
| **Offline ESPs (LWT)** | 3 (ESP_00000001, ESP_D0B19C, ESP_472204-alt) |
| **Zone Kommunikation** | KEINE zone/assign oder zone/ack Messages |
| **Heartbeat/ACK Flow** | FUNKTIONIERT |
| **Diagnostics Messages** | 4 (alle 3 Minuten) |
| **Kritische Fehler** | 2 Actuator Command Failures (retained) |

---

## 2. Online ESPs

### ESP_472204 - ONLINE

| Feld | Wert | Bewertung |
|------|------|-----------|
| **Status** | online | OK |
| **Uptime** | 8s - 909s (~15 Min Session) | OK |
| **Heap Free** | 207.924 - 210.940 Bytes | OK (stabil) |
| **WiFi RSSI** | -51 bis -67 dBm | OK |
| **Sensor Count** | 0 | Keine Sensoren konfiguriert |
| **Actuator Count** | 0 | Keine Aktoren konfiguriert |
| **Zone Assigned** | false | ACHTUNG: Keine Zone zugewiesen |

**GPIO Status:**
| GPIO | Owner | Component | Mode |
|------|-------|-----------|------|
| 4 | sensor | OneWireBus | 2 |
| 21 | system | I2C_SDA | 2 |
| 22 | system | I2C_SCL | 2 |

**Config Status:**
- wifi_configured: true
- zone_assigned: false
- system_configured: true
- subzone_count: 0
- state: 0 -> 8 (PENDING_APPROVAL -> OPERATIONAL)

**Status-Transition beobachtet:**
```
uptime 8s:   state=0 (PENDING_APPROVAL), ACK: pending_approval
uptime 309s: state=0, ACK: "online" (Server hat approved!)
uptime 369s: state=8 (OPERATIONAL)
```

---

## 3. Offline ESPs (Last Will Messages)

| ESP ID | Timestamp | Reason |
|--------|-----------|--------|
| ESP_00000001 | 1769797963 | unexpected_disconnect |
| ESP_D0B19C | 1768891112 | unexpected_disconnect |
| ESP_472204 | 1770002179, 1770007327 | unexpected_disconnect (2x, alt) |

**Hinweis:** Diese LWT-Messages sind retained und stammen von frueheren Disconnects.

---

## 4. Message Flow Analyse

### 4.1 Heartbeat-Zyklus (ESP_472204)

```
TIMING ANALYSE (60-Sekunden-Intervall):
----------------------------------------
[ts:1770008158] Heartbeat -> uptime: 8s    ACK: pending_approval
[ts:1770008218] Heartbeat -> uptime: 68s   ACK: pending_approval
[ts:1770008278] Heartbeat -> uptime: 129s  ACK: pending_approval
[ts:1770008338] Heartbeat -> uptime: 189s  ACK: pending_approval
[ts:1770008398] Heartbeat -> uptime: 249s  ACK: pending_approval
[ts:1770008458] Heartbeat -> uptime: 309s  ACK: online         <-- APPROVED!
[ts:1770008518] Heartbeat -> uptime: 369s  ACK: online, state=8
[ts:1770008578] Heartbeat -> uptime: 429s  ACK: online
[ts:1770008638] Heartbeat -> uptime: 489s  ACK: online
[ts:1770008698] Heartbeat -> uptime: 549s  ACK: online
[ts:1770008758] Heartbeat -> uptime: 609s  ACK: online
[ts:1770008818] Heartbeat -> uptime: 669s  ACK: online
[ts:1770008878] Heartbeat -> uptime: 729s  ACK: online
[ts:1770008938] Heartbeat -> uptime: 789s  ACK: online
[ts:1770008998] Heartbeat -> uptime: 849s  ACK: online
[ts:1770009058] Heartbeat -> uptime: 909s  ACK: online
```

| Aspekt | Status | Bewertung |
|--------|--------|-----------|
| Heartbeat Intervall | ~60s | OK (erwartet: 30-60s) |
| ACK Latenz | <1s | OK |
| Status Transition | pending_approval -> online | OK |
| config_available | false (durchgehend) | ACHTUNG: Keine Config vom Server |

### 4.2 Diagnostics Messages (ESP_472204)

```
[ts:60]  heap_free:209880, heap_min:204620, frag:2%, state:PENDING_APPROVAL
[ts:360] heap_free:209912, heap_min:203596, frag:3%, state:OPERATIONAL
[ts:720] heap_free:209912, heap_min:203596, frag:3%, state:OPERATIONAL
[ts:900] heap_free:209912, heap_min:203596, frag:3%, state:OPERATIONAL
```

| Metrik | Trend | Bewertung |
|--------|-------|-----------|
| Heap Free | stabil ~209.9 KB | OK |
| Heap Min Free | 203.6 KB | OK |
| Fragmentation | 2-3% | OK (< 10% = gut) |
| Error Count | 0 | OK |

### 4.3 Actuator Responses (ESP_00000001 - historisch/retained)

| GPIO | Command | Success | Message |
|------|---------|---------|---------|
| 5 | ON | false | Command failed |
| 26 | OFF | true | Command executed |
| 13 | OFF | false | Command failed |

**WARNUNG:** 2 von 3 Actuator Commands sind fehlgeschlagen.

### 4.4 OneWire Scan (ESP_00000001 - historisch/retained)

```json
Topic: kaiser/god/esp/ESP_00000001/onewire/scan_result
Payload: {"devices":[],"found_count":0}
```
- Scan erfolgreich, aber keine Geraete gefunden (Pin 4).

### 4.5 Broadcast Emergency (historisch/retained)

```json
Topic: kaiser/broadcast/emergency
Payload: {
    "command": "EMERGENCY_STOP",
    "reason": "Phase 2 Test",
    "issued_by": "Robin",
    "timestamp": "2026-01-30T03:42:17.420950+00:00",
    "devices_stopped": 1,
    "actuators_stopped": 3
}
```
- Test-Emergency vom 2026-01-30.

---

## 5. Zone Kommunikation

### Erwartete Topics (NICHT GESEHEN):

| Topic Pattern | Richtung | Status |
|---------------|----------|--------|
| `kaiser/god/esp/+/zone/assign` | Server->ESP | NICHT VORHANDEN |
| `kaiser/god/esp/+/zone/ack` | ESP->Server | NICHT VORHANDEN |

### Analyse:

ESP_472204 zeigt `zone_assigned: false` in jedem Heartbeat. Der Server antwortet mit `config_available: false`.

**Wichtige Beobachtung:**
- ESP wurde vom Server approved (pending_approval -> online nach ~5 Min)
- ABER: Keine Zone wurde zugewiesen
- config_available bleibt false

**Moegliche Ursachen:**
1. Keine Zone im Server konfiguriert
2. Zone-Assignment wurde noch nicht getriggert (Frontend-Aktion erforderlich)
3. ESP ist einer Zone zugewiesen, aber Config-Push fehlt

---

## 6. Topic-Validierung

### Gesehene Topics:

| Topic | Schema-konform | Payload-valid | Count |
|-------|----------------|---------------|-------|
| `kaiser/god/esp/{id}/system/will` | OK | OK | 4 |
| `kaiser/god/esp/{id}/system/heartbeat` | OK | OK | 16 |
| `kaiser/god/esp/{id}/system/heartbeat/ack` | OK | OK | 16 |
| `kaiser/god/esp/{id}/system/diagnostics` | OK | OK | 4 |
| `kaiser/god/esp/{id}/system/command/response` | OK | OK | 1 |
| `kaiser/god/esp/{id}/onewire/scan_result` | OK | OK | 1 |
| `kaiser/god/esp/{id}/actuator/{gpio}/response` | OK | OK | 3 |
| `kaiser/broadcast/emergency` | OK | OK | 1 |

**Alle Topics entsprechen dem AutomationOne Schema.**

---

## 7. Anomalien & Warnungen

### 7.1 WARNUNG: Keine Zone-Zuweisung

- ESP_472204 laeuft seit ~15 Minuten ohne Zone-Assignment
- `config_available: false` vom Server
- Kein zone/assign Traffic gesehen

**Empfehlung:** Im Frontend pruefen, ob ESP einer Zone zugewiesen wurde.

### 7.2 INFO: Retained Messages von Offline-ESPs

- ESP_00000001, ESP_D0B19C: LWT Messages sind retained
- Actuator Responses von ESP_00000001 sind ebenfalls retained

**Dies ist normales Verhalten** - retained Messages bleiben bis zum naechsten Connect.

### 7.3 WARNUNG: Actuator Failures (historisch)

- GPIO 5 und GPIO 13 Commands fehlgeschlagen auf ESP_00000001
- Moegliche Ursache: Hardware nicht konfiguriert oder ESP offline

### 7.4 INFO: Approval Flow funktioniert

- ESP_472204 startete im `pending_approval` Status
- Nach ~5 Minuten wechselte Status zu `online`
- Server hat ESP automatisch oder manuell approved

---

## 8. Zusammenfassung

### Funktionierende Aspekte:

- [x] MQTT Broker erreichbar (localhost:1883)
- [x] Heartbeat/ACK Flow funktioniert (60s Intervall)
- [x] Topic-Schema korrekt
- [x] Payload-Strukturen valide
- [x] ESP_472204 online und stabil
- [x] Diagnostics werden gesendet (alle 3 Min)
- [x] Approval-Flow funktioniert (pending -> online)
- [x] Memory stabil (keine Leaks, low fragmentation)

### Offene Punkte:

- [ ] Zone-Assignment fuer ESP_472204 fehlt
- [ ] config_available = false (kein Config-Push)
- [ ] Keine aktiven Sensoren/Aktoren konfiguriert
- [ ] Alte Actuator-Failures von ESP_00000001 (retained)

### Naechste Schritte:

1. **ESP_472204 einer Zone zuweisen** (Frontend/API)
2. **Zone-Assignment triggern** um config_available=true zu erhalten
3. **Sensoren/Aktoren konfigurieren** nach Zone-Assignment
4. **ESP_00000001 pruefen** - warum offline?
5. **Retained Messages clearen** (optional) fuer sauberen Broker-State

---

*Report generiert: 2026-02-02*
*MQTT_DEBUG_AGENT v1.0*
