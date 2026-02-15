# 🔴 KONSOLIDIERTER PROBLEM-KATALOG

**Session:** 2026-02-02_03-47_esp32-fulltest  
**ESP unter Test:** ESP_472204 (OPERATIONAL ✅)  
**Analysierte Reports:** 4 + Logs  
**Erstellt:** 2026-02-02 05:00

---

## Executive Summary

```
┌─────────────────────────────────────────────────────────────────┐
│  GESAMTBEWERTUNG: SYSTEM FUNKTIONIERT                          │
│                                                                 │
│  Boot:        ✅ ESP + Server erfolgreich                       │
│  Provisioning:✅ Vollständig                                    │
│  MQTT:        ✅ Kommunikation funktioniert                     │
│  Approval:    ✅ Device OPERATIONAL                             │
│                                                                 │
│  Aber: 2 Bugs + 3 Design-Issues + viel Log-Noise              │
└─────────────────────────────────────────────────────────────────┘
```

| Kategorie | Anzahl | Handlungsbedarf |
|-----------|--------|-----------------|
| 🔴 BUG (Code-Fix) | 2 | Ja |
| 🟠 DESIGN (Entscheidung) | 3 | Ja |
| 🟡 CLEANUP (Optional) | 4 | Empfohlen |
| ⚪ KNOWN (Akzeptiert) | 9 | Nein |
| **GESAMT** | **18** | **5 aktiv** |

---

## 🔴 BUGS - Code-Fix erforderlich

### BUG-001: WebSocketManager.broadcast() API Mismatch

| Attribut | Wert |
|----------|------|
| **Severity** | HIGH |
| **Quelle** | SERVER_BOOT_REPORT |
| **Datei** | `src/mqtt/handlers/zone_ack_handler.py:273` |
| **Häufigkeit** | Jeder Zone-ACK |

**Fehler:**
```python
WebSocketManager.broadcast() got an unexpected keyword argument 'event_type'
```

**Impact:**
- Frontend erhält KEINE Zone-Updates via WebSocket
- Realtime-Updates für Zone-Änderungen broken

**Fix:**
```python
# Prüfen: Signatur von WebSocketManager.broadcast()
# Entweder: event_type Parameter hinzufügen
# Oder: Aufruf in zone_ack_handler.py korrigieren
```

---

### BUG-002: NVS subzone_config ERROR-Spam

| Attribut | Wert |
|----------|------|
| **Severity** | MEDIUM |
| **Quelle** | ESP32_BOOT_REPORT, PROVISIONING_DEBUG_REPORT |
| **Datei** | `El Trabajante/src/services/storage/storage_manager.cpp` |
| **Häufigkeit** | Alle 60 Sekunden (bei jedem Heartbeat) |

**Fehler:**
```
[E][Preferences.cpp:50] begin(): nvs_open failed: NOT_FOUND
[ERROR] StorageManager: Failed to open namespace: subzone_config
```

**Impact:**
- Log-Verschmutzung: 60+ ERROR-Einträge pro Stunde
- Echte Errors könnten übersehen werden

**Fix:**
```cpp
// Vor NVS-Open prüfen oder NOT_FOUND graceful behandeln
bool StorageManager::loadSubzoneConfig() {
    if (!namespaceExists("subzone_config")) {
        LOG_DEBUG("No subzone config found (expected for new device)");
        return true;  // Nicht als Fehler behandeln
    }
    // ... rest
}
```

---

## 🟠 DESIGN-ISSUES - Entscheidung erforderlich

### DESIGN-001: Retained Error-Messages von Offline-ESPs

| Attribut | Wert |
|----------|------|
| **Severity** | MEDIUM |
| **Quelle** | SERVER_BOOT_REPORT, MQTT_BOOT_REPORT |
| **Betroffene Topics** | `config_response`, `actuator/+/response`, `actuator/+/alert` |

**Problem:**
Server verarbeitet bei jedem Start alte retained MQTT-Messages als neue Fehler:
```
Config FAILED on ESP_00000001: actuator - GPIO 13 (UNKNOWN_ERROR)
Actuator command failed: esp_id=ESP_00000001, gpio=5
```

ESP_00000001 ist seit Tagen offline - diese Errors sind historisch.

**Optionen:**

| Option | Pro | Contra |
|--------|-----|--------|
| A: Timestamp prüfen | Alte Messages ignorieren | Komplexität |
| B: Online-Check vor Verarbeitung | Einfach | Offline-ESP Errors gehen verloren |
| C: Als "historical" loggen | Vollständige Historie | Weiterhin Log-Noise |
| D: Retained Messages cleanen | Sauberer Broker | Manueller Aufwand |

**Empfehlung:** Option A oder B

---

### DESIGN-002: Emergency-Handler returned False

| Attribut | Wert |
|----------|------|
| **Severity** | MEDIUM |
| **Quelle** | SERVER_BOOT_REPORT |
| **Datei** | Emergency-Handler (Location unklar) |

**Log:**
```
Handler returned False for topic kaiser/broadcast/emergency - processing may have failed
```

**Frage:** Was bedeutet `return False` im Handler?
- Absichtlich (veraltete Emergency ignoriert)?
- Bug (Verarbeitung fehlgeschlagen)?

**Action:** Code-Review des Emergency-Handlers erforderlich

---

### DESIGN-003: Log-Messages bei unprovisioniertem Gerät irreführend

| Attribut | Wert |
|----------|------|
| **Severity** | LOW |
| **Quelle** | ESP32_BOOT_REPORT, PROVISIONING_DEBUG_REPORT |
| **Datei** | `config_manager.cpp` |

**Problem:**
```
[WARNING] ConfigManager: Some configurations failed to load
[WARNING] Some configurations failed to load - using defaults
```

Bei einem NEUEN Gerät ist "failed to load" irreführend. Es gibt keine Config zum Laden - das ist erwartetes Verhalten.

**Empfehlung:**
```cpp
// Statt "failed to load":
LOG_INFO("No existing config found - using defaults (expected for new device)");
```

---

## 🟡 CLEANUP - Optional aber empfohlen

### CLEAN-001: Alte Emergency Retained Message

| Attribut | Wert |
|----------|------|
| **Alter** | 3 Tage (2026-01-30) |
| **Topic** | `kaiser/broadcast/emergency` |
| **Impact** | Jeder neue ESP geht sofort in Safe-Mode |

**Fix (einmalig):**
```bash
mosquitto_pub -h 192.168.0.194 -t "kaiser/broadcast/emergency" -r -n
```

---

### CLEAN-002: Orphaned Mocks in Datenbank

| Mock-ID | Letztes Update |
|---------|----------------|
| MOCK_0D47C6D4 | 2026-01-27 (6 Tage) |
| MOCK_F7393009 | 2026-01-28 (5 Tage) |
| MOCK_067EA733 | 2026-01-30 (3 Tage) |

**Fix (einmalig oder permanent):**
```bash
# Einmalig via API oder DB
# Oder permanent:
export ORPHANED_MOCK_AUTO_DELETE=true
```

---

### CLEAN-003: Retained LWT und Response Messages

| ESP | Topic-Typ | Alter |
|-----|-----------|-------|
| ESP_00000001 | system/will | ~3 Tage |
| ESP_D0B19C | system/will | ~3 Tage |
| ESP_00000001 | actuator/+/response | ~3 Tage |
| ESP_00000001 | config_response | ~3 Tage |

**Fix:**
```bash
# Alle retained Messages für offline ESPs clearen
mosquitto_pub -h 192.168.0.194 -t "kaiser/god/esp/ESP_00000001/#" -r -n
mosquitto_pub -h 192.168.0.194 -t "kaiser/god/esp/ESP_D0B19C/#" -r -n
```

---

### CLEAN-004: Log-Symlink god_kaiser.log veraltet

| Attribut | Wert |
|----------|------|
| **Problem** | `logs/current/god_kaiser.log` wird nicht aktualisiert |
| **Ursache** | Symlink zeigt auf alte Kopie statt Live-Log |
| **Echte Log** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |

**Fix in start_session.sh:**
```bash
# Symlink zur echten Log erstellen
ln -sf "$PROJECT_ROOT/El Servador/god_kaiser_server/logs/god_kaiser.log" \
       "$PROJECT_ROOT/logs/current/god_kaiser.log"
```

---

## ⚪ KNOWN/ACCEPTED - Kein Handlungsbedarf

Diese sind dokumentiert aber erfordern KEINEN Fix:

| ID | Problem | Grund |
|----|---------|-------|
| KNOWN-001 | NVS wifi_config NOT_FOUND (Boot) | Erwartetes Verhalten vor Provisioning |
| KNOWN-002 | NVS getString Fehler für Config-Keys | ESP32 Preferences Library Logging |
| KNOWN-003 | Topic Match: NO für heartbeat/ack | Debug-Info, korrekt |
| KNOWN-004 | Sensor stale Warnings (8 Sensoren) | Alte Mocks, System erkennt korrekt |
| KNOWN-005 | Actuator Command Failed (retained) | Historische Messages |
| KNOWN-006 | CRITICAL Emergency Alerts (retained) | Historische Messages |
| KNOWN-007 | JWT Secret Key Default | Development-Modus OK |
| KNOWN-008 | MQTT TLS deaktiviert | Development-Modus OK |
| KNOWN-009 | Zone Assignment nicht erfolgt | Erwarteter Workflow-Step |

---

## Inkonsistenz (zur Klärung)

### INC-001: boot_count springt bei Approval

**Vor Approval:**
```json
{"config_status":{"boot_count":3,"state":0}}
```

**Nach Approval:**
```json
{"config_status":{"boot_count":0,"state":8}}
```

**Frage:** Ist das absichtliches Reset oder Bug?

---

## Action Plan

### Sofort (Blocker)

| # | Action | Datei | Aufwand |
|---|--------|-------|---------|
| 1 | BUG-001 fixen | `zone_ack_handler.py:273` | 15 min |

### Diese Woche (Quality)

| # | Action | Datei | Aufwand |
|---|--------|-------|---------|
| 2 | BUG-002 fixen | `storage_manager.cpp` | 30 min |
| 3 | DESIGN-002 klären | Emergency-Handler | Review |
| 4 | CLEAN-001 ausführen | MQTT Broker | 1 min |
| 5 | CLEAN-004 fixen | `start_session.sh` | 10 min |

### Backlog (Nice-to-have)

| # | Action | Aufwand |
|---|--------|---------|
| 6 | DESIGN-001 entscheiden | 1h Design |
| 7 | DESIGN-003 Log-Messages | 30 min |
| 8 | CLEAN-002/003 | 5 min |

---

## Metriken dieser Session

| Metrik | Wert |
|--------|------|
| Boot-Zeit (ESP32) | 8.0s ✅ |
| Boot-Zeit (Server) | 1.0s ✅ |
| WiFi-Connect | 1.5s ✅ |
| MQTT-Connect | 1.1s ✅ |
| Provisioning-Dauer | ~3 min |
| Approval-Dauer | ~6 min (manuell) |
| Heap-Verbrauch | 60KB (stabil) |
| WiFi-RSSI | -45 bis -56 dBm ✅ |

---

## Quellen

| Report | Status |
|--------|--------|
| ESP32_BOOT_REPORT.md | ✅ Analysiert |
| SERVER_BOOT_REPORT.md | ✅ Analysiert |
| MQTT_BOOT_REPORT.md | ✅ Analysiert |
| PROVISIONING_DEBUG_REPORT.md | ✅ Analysiert |
| esp32_serial.log | ✅ Aktuell |
| god_kaiser.log (Original) | ✅ Aktuell |
| mqtt_traffic.log | ✅ Aktuell |

---

## Fazit

```
┌─────────────────────────────────────────────────────────────────┐
│  ESP_472204 VOLLTEST: ✅ BESTANDEN                              │
│                                                                 │
│  • Boot-Sequenz: Vollständig erfolgreich                       │
│  • Provisioning: Funktioniert                                   │
│  • MQTT-Kommunikation: Stabil                                   │
│  • Device-Approval: Korrekt                                     │
│                                                                 │
│  Offene Punkte:                                                │
│  • 1 echter Bug (WebSocket broadcast)                          │
│  • 1 Log-Spam Bug (NVS subzone_config)                         │
│  • Housekeeping (alte retained messages, orphaned mocks)       │
│                                                                 │
│  Das System ist PRODUKTIONSBEREIT für Basis-Funktionalität.   │
│  Zone-Assignment und Sensor/Aktor-Config als nächste Schritte.│
└─────────────────────────────────────────────────────────────────┘
```

---

*Konsolidierter Katalog v1.0 | 2026-02-02*