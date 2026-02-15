# Server E2E Debug Report

> **Session:** 2026-02-03_21-13_onewire-e2e-test
> **Analysiert:** 2026-02-03
> **Log:** logs/current/god_kaiser.log (~764KB)
> **Agent:** server-debug

---

## Executive Summary

| Bereich | Status | Bemerkung |
|---------|--------|-----------|
| Server Startup | ✅ OK | 21:13:18 - Vollständiger Start |
| ESP Discovery | ✅ OK | ESP_472204 entdeckt |
| Zone Assignment | ✅ OK | test_zone zugewiesen |
| Sensor Config | 🔴 FAIL | GPIO_CONFLICT auf GPIO 4 |
| Sensor Data | 🔴 FAIL | Keine Daten empfangen |
| Actuator Config | ⚠️ PARTIAL | Funktioniert, aber mit Warnings |
| Actuator Commands | ✅ OK | ON/OFF Commands erfolgreich |

**Gesamtbewertung:** 🔴 **NICHT PRODUKTIONSBEREIT** - Kritischer Sensor-Bug

---

## 1. Timeline der Server-Events

### Session-Start (21:13:18)

```
21:13:18 | INFO  | God-Kaiser Server Starting...
21:13:18 | WARN  | SECURITY: Using default JWT secret key
21:13:18 | WARN  | MQTT TLS is disabled
21:13:18 | INFO  | Security validation complete
21:13:19 | INFO  | MQTT client connected to localhost:1883
21:13:19 | INFO  | Subscribed to all topics (QoS 1)
21:13:19 | INFO  | Zone ACK: ESP_472204 -> test_zone (retained message)
```

### Frühere Events (aus Log-Historie)

```
00:08:00 | INFO  | 🔔 New ESP discovered: ESP_472204 (pending_approval)
00:09:59 | INFO  | Zone assignment sent to ESP_472204: zone_id=test_zone
00:10:00 | INFO  | ✅ Device ESP_472204 now online after approval
00:10:00 | INFO  | Zone assignment confirmed for ESP_472204: zone_id=test_zone
```

---

## 2. Heartbeat-Verarbeitung

### Erfolgreiche Discovery

| Timestamp | Event | Details |
|-----------|-------|---------|
| 00:08:00 | NEW ESP | `ESP_472204 (pending_approval)` |
| 00:10:00 | ONLINE | `Device ESP_472204 now online after approval` |

### 🔴 BUG: Timestamp-Anomalie

**Entdeckt:** Ab 00:45:28 zeigt `last_seen` einen Epoch-Wert (1970-01-01)

```json
// VORHER (korrekt):
{"message": "...last_seen: 2026-02-02 23:44:00+00:00..."}

// NACHHER (Bug):
{"message": "...last_seen: 1970-01-01 00:00:00+00:00..."}
```

**Root Cause:** Vermutlich Timestamp-Konvertierungsproblem oder DB-Update-Fehler.

**Severity:** Medium - Heartbeat funktioniert, aber `last_seen` wird nicht korrekt aktualisiert.

---

## 3. Config-Push Analyse

### 3.1 Sensor Config

**Ziel:** DS18B20 OneWire Temperatur auf GPIO 4

| Timestamp | Action | Result |
|-----------|--------|--------|
| 00:16:07 | Config Published | 1 sensor(s), 0 actuator(s) |
| 00:16:08 | ESP Response | 🔴 **FAILED** |

### 🔴 BUG: GPIO_CONFLICT (Kritisch)

**Wiederholte Fehler im Log:**

```
❌ Config FAILED on ESP_472204: sensor - All 1 item(s) failed to configure
   ↳ GPIO 4: GPIO_CONFLICT - GPIO 4 already used by sensor (OneWireBus)
```

**Auftreten:**
- 00:16:08, 00:16:17 (erste Session)
- 00:56:44, 00:56:54, 00:57:08 (spätere Versuche)

**Root Cause Analyse:**
1. ESP32 meldet bereits einen OneWireBus auf GPIO 4
2. Server versucht erneut, denselben GPIO zu konfigurieren
3. ESP32 lehnt ab, weil GPIO bereits reserviert

**Mögliche Ursachen:**
- Config wird mehrfach gesendet ohne Reset
- ESP32 hat bereits einen persistenten Sensor auf GPIO 4
- Fehlende "Clear Config"-Logik vor Re-Konfiguration

### 3.2 OneWire-Adresse im Payload

**Suche nach `onewire_address` im Config-Payload:**

```
00:16:07 | Generated placeholder OneWire address: AUTO_B9421D7633DF3991
```

**Ergebnis:** 🔴 **Placeholder-Adresse wird generiert**

Der Server generiert eine `AUTO_`-Platzhalter-Adresse, da keine echte OneWire-ROM-Adresse bekannt ist. Das bedeutet:
- Der ESP32 muss den DS18B20 scannen
- Die echte ROM-Adresse muss zurück an den Server gemeldet werden
- Aktuell fehlt dieser Feedback-Loop

---

## 4. Sensor-Daten Analyse

### 🔴 BUG: Keine Sensor-Daten empfangen

**Wiederholte Warnung (alle 60 Sekunden):**

```
Sensor stale: ESP ESP_472204 GPIO 4 (ds18b20) - no data for never (timeout: 180s)
```

**Zeitraum:** 00:16:27 bis mindestens 01:03:27 (kontinuierlich)

**Konsequenzen:**
- API-Abfragen für Sensor-Daten → `status=404`
- Sensor-Health-Check schlägt permanent an
- Keine Temperatur-Readings in der Datenbank

**Root Cause:**
1. Sensor-Config auf ESP32 fehlgeschlagen (GPIO_CONFLICT)
2. Ohne erfolgreiche Config → ESP32 sendet keine Daten
3. Ohne Daten → Server markiert Sensor als "stale"

---

## 5. Actuator Analyse

### 5.1 Config

| Timestamp | Action | Result |
|-----------|--------|--------|
| 00:16:17 | Actuator created | ESP_472204 GPIO 26 by Robin |
| 00:16:17 | Config Published | 1 sensor(s), 1 actuator(s) |

**Status:** ✅ Actuator-Config erfolgreich erstellt

### 5.2 Commands

| Timestamp | Command | Response |
|-----------|---------|----------|
| 00:16:37 | ON (value=1.0) | ✅ Confirmed, state=on, value=255.0 |
| 00:16:58 | OFF (value=0.0) | ✅ Confirmed, state=off, value=0.0 |
| 00:27:46 | ON (value=1.0) | ✅ Confirmed |

**Status:** ✅ Actuator-Commands funktionieren

### 5.3 Warnings

```
Handler returned False for topic kaiser/god/esp/ESP_472204/actuator/26/command
  - processing may have failed
```

**Bewertung:** ⚠️ Warning, aber Command wird trotzdem bestätigt. Möglicherweise redundanter Handler oder Race Condition.

---

## 6. Error-Zusammenfassung

### Kritische Fehler (ERROR Level)

| Count | Error | Module |
|-------|-------|--------|
| 5+ | GPIO_CONFLICT - GPIO 4 already used | config_handler |
| 3+ | Config FAILED: sensor - All items failed | config_handler |
| 3 | Config FAILED: actuator - array empty | config_handler |

### Warnungen (WARNING Level)

| Count | Warning | Module |
|-------|---------|--------|
| ~50 | Sensor stale: no data for never | sensor_health |
| 3 | Handler returned False for topic | subscriber |
| 3 | Actuator config not found (after delete) | actuator_handler |

---

## 7. Diagnose

### Hauptproblem: Sensor-Konfiguration scheitert

```
┌────────────────────────────────────────────────┐
│  Server sendet Config mit GPIO 4 (DS18B20)     │
└─────────────────────┬──────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  ESP32: "GPIO 4 ist bereits durch OneWireBus   │
│         reserviert - GPIO_CONFLICT"            │
└─────────────────────┬──────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Config ACK mit Fehler zurück an Server        │
└─────────────────────┬──────────────────────────┘
                      │
                      ▼
┌────────────────────────────────────────────────┐
│  Kein Sensor aktiv → Keine Daten → Stale       │
└────────────────────────────────────────────────┘
```

### Sekundärproblem: Timestamp-Bug

Der `last_seen`-Wert wird ab einem bestimmten Zeitpunkt auf Epoch (0) zurückgesetzt.

---

## 8. Empfohlene Aktionen

### Sofort (Blocker für E2E-Test)

1. **GPIO-Konflikt lösen:**
   - ESP32 NVS löschen (`pio run -t erase`)
   - Oder: Server muss "Clear Config" vor Re-Config senden
   - Oder: ESP32 muss GPIO freigeben bei neuem Config-Push

2. **OneWire-Adresse:**
   - Echter ROM-Scan auf ESP32 → Adresse an Server melden
   - Server speichert echte Adresse statt Placeholder

### Mittelfristig

3. **Timestamp-Bug untersuchen:**
   - Heartbeat-Handler: Warum wird `last_seen` auf 0 gesetzt?
   - DB-Repository: Timestamp-Konvertierung prüfen

4. **Handler-Warning beheben:**
   - Subscriber: Warum gibt Actuator-Command-Handler `False` zurück?

---

## 9. Betroffene Code-Locations

| Issue | File | Line |
|-------|------|------|
| Config ACK Error | `config_handler.py` | 152, 160 |
| Sensor Stale | `sensor_health.py` | 338 |
| Heartbeat last_seen | `heartbeat_handler.py` | 249 |
| Actuator Status | `actuator_handler.py` | 118, 182 |
| OneWire Placeholder | `sensors.py` | 1455 |

---

## 10. Checkliste (Server-Perspektive)

### Boot & Connection ✓
- [x] Server gestartet
- [x] MQTT verbunden
- [x] Topics subscribed
- [x] Heartbeat empfangen

### Device Registration ✓
- [x] ESP discovered (pending_approval)
- [x] Approval durchgeführt
- [x] Status: ONLINE

### Sensor Flow ✗
- [x] Sensor-Config gesendet
- [ ] **Config erfolgreich applied** ← 🔴 FAILED
- [ ] **ROM-Code erkannt** ← 🔴 NOT REACHED
- [ ] **Temperatur-Readings empfangen** ← 🔴 NONE

### Actuator Flow ✓
- [x] Actuator-Config gesendet
- [x] GPIO 26 reserviert
- [x] ON-Command → Confirmed
- [x] OFF-Command → Confirmed
- [x] Status-Updates empfangen

### Error-Free ✗
- [ ] **Keine ERRORs nach Config** ← 🔴 GPIO_CONFLICT
- [ ] **Keine Stale-Warnings** ← 🔴 Permanent

---

*Report generiert: 2026-02-03*
*Agent: server-debug*
*Session: 2026-02-03_21-13_onewire-e2e-test*
