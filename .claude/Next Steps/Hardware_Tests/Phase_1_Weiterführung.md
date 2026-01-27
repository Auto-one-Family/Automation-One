# Phase 1 Weiterführung: Edge Cases & System-Robustheit

**Erstellt:** 2026-01-20
**Letzte Aktualisierung:** 2026-01-20 05:55 (Watchdog-Fixes, Firewall-Regel, Hardware-Test)
**Kontext:** Nach erfolgreichem Test-Durchlauf 1 (ESP_D0B19C) sind offene Fragen zur Robustheit aufgekommen
**Ziel:** Systematische Prüfung aller Edge Cases im Pending-Approval-Flow

---

## 0. Aktueller System-Status (Stand: 2026-01-20 05:55)

### Services

| Service | Status | Prüfbefehl |
|---------|--------|------------|
| **Server (FastAPI)** | ✅ Läuft | `netstat -ano \| findstr 8000` |
| **Server-Login** | ✅ Verifiziert | User: `Robin` / Passwort: `Robin123!` |
| **Datenbank** | ✅ SQLite | `god_kaiser_dev.db` (19 Tabellen) |
| **MQTT (Mosquitto)** | ✅ Läuft + Firewall OK | `netstat -ano \| findstr 1883` |

### Fixes implementiert (2026-01-20)

| Fix | Datei | Status |
|-----|-------|--------|
| **Watchdog-Bug #1** | `mqtt_client.cpp:729-743` | ✅ MAX_RECONNECT_ATTEMPTS entfernt |
| **Watchdog-Bug #2** | `main.cpp:1510-1523` | ✅ MQTT CB blockiert Watchdog nicht mehr |
| **Error-Codes** | `error_codes.py` | ✅ Alle 19 Codes vorhanden |
| **Windows Firewall** | Port 1883 | ✅ Eingehende Regel hinzugefügt |

### Watchdog-Bug #1 Details (mqtt_client.cpp)
- **Problem:** Kommentar behauptete "MAX_RECONNECT_ATTEMPTS entfernt", aber Check existierte noch
- **Kausal-Kette:**
  ```
  MQTT disconnect → 10 Reconnects → shouldAttemptReconnect()=false
  → MQTTClient stoppt Reconnects → CB bleibt OPEN → Watchdog blockiert → Reboot
  ```
- **Fix:** MAX_RECONNECT_ATTEMPTS-Check aus `shouldAttemptReconnect()` entfernt
- **Ergebnis:** ESP versucht jetzt unbegrenzt Reconnects (CB regelt Fehlerbehandlung)

### Watchdog-Bug #2 Details (main.cpp)
- **Problem:** MQTT Circuit Breaker OPEN → `feedWatchdog()` returns false → Reboot
- **Root-Cause:** Nach WiFi-Reconnect war MQTT-Broker kurzzeitig nicht erreichbar
- **Fix:** MQTT CB blockiert Watchdog nicht mehr - ESP läuft im "degraded mode" weiter
- **Logik:** WiFi CB OPEN = kritisch (Reboot), MQTT CB OPEN = degraded (kein Reboot)
- **Ergebnis:** ESP überlebt MQTT-Ausfälle ohne Reboot

### Windows Firewall Problem
- **Problem:** ESP konnte nicht zu Mosquitto verbinden (rc=-2 = Connection Timeout)
- **Root-Cause:** Windows Firewall blockierte eingehende Verbindungen auf Port 1883
- **Fix:** `netsh advfirewall firewall add rule name="Mosquitto MQTT" dir=in action=allow protocol=tcp localport=1883`
- **Status:** ✅ Regel aktiv, ESP kann jetzt verbinden

### Datenbank-Schnellprüfung

```bash
# Im Server-Verzeichnis ausführen:
cd "El Servador/god_kaiser_server"

# Tabellen auflisten
poetry run python -c "import sqlite3; c=sqlite3.connect('god_kaiser_dev.db'); print([r[0] for r in c.execute('SELECT name FROM sqlite_master WHERE type=\"table\"').fetchall()])"

# ESP Devices anzeigen (Spalte heißt device_id, NICHT esp_id!)
poetry run python -c "import sqlite3; c=sqlite3.connect('god_kaiser_dev.db'); print(c.execute('SELECT device_id, status, last_seen FROM esp_devices').fetchall())"

# Users anzeigen
poetry run python -c "import sqlite3; c=sqlite3.connect('god_kaiser_dev.db'); print(c.execute('SELECT username, is_active FROM user_accounts').fetchall())"
```

### Aktueller DB-Inhalt

| Tabelle | Inhalt |
|---------|--------|
| `user_accounts` | 1 User: "Robin" (aktiv) |
| `esp_devices` | 1 Device: ESP_D0B19C (offline seit 04:00:16) |
| `sensor_configs` | 0 (keine Sensoren konfiguriert) |
| `actuator_configs` | 0 (keine Aktoren konfiguriert) |

**ESP_D0B19C Details:**
- Approved by: `Robin` am `2026-01-20 03:29:03`
- Zone: `test` / `Test`
- Kaiser ID: `god`

---

## 1. Hintergrund

### Was ist Phase 1?
Phase 1 testet den **Pending-Approval-Flow** - den Prozess, wie ein neuer ESP32 vom System erkannt, in eine Warteschlange gestellt und von einem Administrator genehmigt wird.

**Aktueller Flow:**
```
ESP32 bootet → Sendet Heartbeat → Server erkennt unbekanntes Gerät
→ Gerät erscheint als "Pending" im Frontend → Admin genehmigt/lehnt ab
→ ESP empfängt ACK via Heartbeat → State-Transition zu OPERATIONAL
```

**Relevante Komponenten:**
| Komponente | Pfad | Funktion |
|------------|------|----------|
| Heartbeat Handler | `El Servador/.../mqtt/handlers/heartbeat_handler.py` | Verarbeitet ESP-Heartbeats, erkennt neue Geräte |
| ESP API | `El Servador/.../api/v1/esp.py` | Approve/Reject Endpoints, Pending-Liste |
| ESP Model | `El Servador/.../db/models/esp.py` | Database-Schema für ESP-Geräte |
| Frontend Panel | `El Frontend/.../components/esp/PendingDevicesPanel.vue` | UI für Pending-Geräte |
| ESP Store | `El Frontend/src/stores/esp.ts` | State-Management für ESP-Daten |

---

## 2. Offene Fragen: Edge Cases

### 2.1 Verbindungsverlust über längere Zeit

**Szenario:** ESP verliert für 5-10 Minuten die WiFi/MQTT-Verbindung und verbindet sich dann wieder.

**Zu prüfen:**
- [ ] Wird der ESP nach Timeout als "Offline" markiert?
- [ ] Welcher Timeout-Wert gilt? (Vermutung: 2x Heartbeat-Intervall = 120s)
- [ ] Was passiert mit dem `last_seen` Timestamp während Offline?
- [ ] Wird bei Reconnect der Status korrekt auf "Online" gesetzt?
- [ ] Erscheint der ESP wieder in der korrekten Liste (Pending vs. Approved)?
- [ ] Wird ein Disconnect-Event geloggt? Wo?

**Code-Stellen zum Prüfen:**
```python
# heartbeat_handler.py - Timeout-Logik
# esp_service.py - Online/Offline Status-Änderung
# Maintenance Jobs - ESP Timeout Detection
```

**Frontend-Verhalten:**
- [ ] Zeigt UI "Offline" korrekt an?
- [ ] Wechselt UI automatisch zu "Online" bei Reconnect (WebSocket)?
- [ ] Wird `last_seen` korrekt aktualisiert und angezeigt?

---

### 2.2 ESP löschen und neu verbinden

**Szenario:** Admin löscht einen ESP aus dem System, der ESP sendet aber weiter Heartbeats.

**Zu prüfen:**
- [ ] Kann ein ESP überhaupt gelöscht werden? (API Endpoint?)
- [ ] Was passiert mit bestehenden Sensor-Daten bei Löschung?
- [ ] Erscheint der gelöschte ESP wieder als "Pending" wenn er weiter sendet?
- [ ] Wird die alte ESP-ID wiederverwendet oder neu generiert?
- [ ] Bleiben historische Daten erhalten oder werden sie gelöscht?
- [ ] Cascade-Delete für Sensoren, Aktoren, Config?

**Datenbank-Fragen:**
```sql
-- Welche Tabellen haben Foreign Keys auf ESPDevice?
-- Was passiert bei DELETE CASCADE vs. RESTRICT?
-- sensors.esp_id → esp_devices.id
-- actuators.esp_id → esp_devices.id
-- sensor_data.sensor_id → sensors.id (indirekt)
```

---

### 2.3 Database-Logging & Audit-Trail

**Frage:** Wird der komplette Lifecycle eines ESP nachvollziehbar geloggt?

**Zu prüfen:**
- [ ] Wird `discovered_at` korrekt gesetzt (einmalig, beim ersten Heartbeat)?
- [ ] Wird `approved_at` mit Timestamp und User gespeichert?
- [ ] Wird `approved_by` (Username) persistiert?
- [ ] Gibt es ein Audit-Log für Status-Änderungen?
- [ ] Werden Reject-Ereignisse mit Reason geloggt?
- [ ] Können wir rekonstruieren: "ESP_X wurde am DD.MM um HH:MM von User Y genehmigt"?

**Gewünschter Audit-Trail:**
```
2026-01-20 04:30:00 | ESP_D0B19C | DISCOVERED | First heartbeat received
2026-01-20 04:31:00 | ESP_D0B19C | PENDING | Awaiting approval
2026-01-20 04:35:00 | ESP_D0B19C | APPROVED | By user "Robin"
2026-01-20 05:00:00 | ESP_D0B19C | OFFLINE | No heartbeat for 120s
2026-01-20 05:05:00 | ESP_D0B19C | ONLINE | Heartbeat resumed
```

**Relevante Felder im ESP Model:**
```python
# db/models/esp.py - Zu prüfen ob alle vorhanden:
discovered_at: datetime      # Wann erstmals gesehen
approved_at: datetime        # Wann genehmigt
approved_by: str             # Wer hat genehmigt (Username)
last_seen: datetime          # Letzter Heartbeat
status: str                  # pending/approved/rejected/offline
rejection_reason: str        # Falls abgelehnt
```

---

### 2.4 Pending-States bei Verbindungsproblemen

**Szenario:** ESP ist Pending, verliert Verbindung, kommt wieder, wird genehmigt, verliert wieder Verbindung.

**Zu prüfen:**
- [ ] Bleibt ein Pending-ESP "Pending" auch nach Disconnect?
- [ ] Kann ein Offline-Pending-ESP genehmigt werden?
- [ ] Was passiert wenn Approval-ACK den ESP nicht erreicht (ESP offline)?
- [ ] Retry-Mechanismus für Approval-ACK?
- [ ] Wird der ESP beim nächsten Heartbeat automatisch als "approved" markiert?

**Erwartetes Verhalten:**
```
ESP sendet Heartbeat → Server: "Du bist approved"
ESP empfängt ACK → Speichert in NVS → State: OPERATIONAL

ABER: Was wenn ACK verloren geht?
ESP sendet nächsten Heartbeat (noch PENDING_APPROVAL state)
Server: "Du bist bereits approved" → Sendet erneut ACK
```

---

### 2.5 Error-Codes: ESP → Server Synchronisation

**Status: GEPRÜFT (2026-01-20) - LÜCKEN GEFUNDEN!**

#### Vorhandene Dateien

| Datei | Pfad | Inhalt |
|-------|------|--------|
| **ESP32 Error-Codes** | `El Trabajante/src/models/error_codes.h` | Vollständig (70+ Codes) |
| **Server Error-Codes** | `El Servador/.../src/core/error_codes.py` | Teilweise synchronisiert |
| **OneWire Mapping** | `El Servador/.../src/core/esp32_error_mapping.py` | Nur 1023-1029 (mit Troubleshooting) |

#### Error-Code Bereiche (ESP32)

```cpp
// El Trabajante/src/models/error_codes.h
Hardware:      1000-1999  (GPIO, I2C, OneWire, PWM, Sensor, Actuator)
Service:       2000-2999  (NVS, Config, Logger, Storage, Subzone 2500-2599)
Communication: 3000-3999  (WiFi, MQTT, HTTP, Network)
Application:   4000-4999  (State, Operation, Command, Payload, Memory, System, Task, Watchdog 4070-4072, Discovery 4200-4202)
```

#### 🔴 FEHLENDE CODES IM SERVER (`error_codes.py`)

Diese ESP32-Codes sind **nicht** in `El Servador/.../src/core/error_codes.py` synchronisiert:

| Bereich | Codes | Beschreibung | Priorität |
|---------|-------|--------------|-----------|
| **OneWire ROM** | 1023-1029 | ROM Length/Format/CRC/Device Errors | MITTEL (separat in esp32_error_mapping.py) |
| **Subzone** | 2500-2506 | Subzone ID/GPIO/Config Errors | HOCH |
| **Watchdog** | 4070-4072 | Timeout, Feed Blocked | HOCH |
| **Discovery** | 4200-4202 | Rejected, Approval Timeout, Revoked | HOCH |

**Detaillierte Liste:**
```
1023 ERROR_ONEWIRE_INVALID_ROM_LENGTH
1024 ERROR_ONEWIRE_INVALID_ROM_FORMAT
1025 ERROR_ONEWIRE_INVALID_ROM_CRC
1026 ERROR_ONEWIRE_DEVICE_NOT_FOUND
1027 ERROR_ONEWIRE_BUS_NOT_INITIALIZED
1028 ERROR_ONEWIRE_READ_TIMEOUT
1029 ERROR_ONEWIRE_DUPLICATE_ROM

2500 ERROR_SUBZONE_INVALID_ID
2501 ERROR_SUBZONE_GPIO_CONFLICT
2502 ERROR_SUBZONE_PARENT_MISMATCH
2503 ERROR_SUBZONE_NOT_FOUND
2504 ERROR_SUBZONE_GPIO_INVALID
2505 ERROR_SUBZONE_SAFE_MODE_FAILED
2506 ERROR_SUBZONE_CONFIG_SAVE_FAILED

4070 ERROR_WATCHDOG_TIMEOUT
4071 ERROR_WATCHDOG_FEED_BLOCKED
4072 ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL

4200 ERROR_DEVICE_REJECTED
4201 ERROR_APPROVAL_TIMEOUT
4202 ERROR_APPROVAL_REVOKED
```

#### Zu prüfen (offen)
- [ ] Werden Error-Codes im Heartbeat mitgesendet?
- [ ] Werden Errors in der Datenbank persistiert?
- [ ] Können Errors im Frontend angezeigt werden?

---

### 2.6 Watchdog/CircuitBreaker Instabilität (~15 Minuten)

**Status: ✅ ROOT-CAUSE GEFUNDEN & FIX IMPLEMENTIERT (2026-01-20)**

**Symptom:** Nach ca. 15 Minuten Laufzeit tritt folgende Sequenz auf:
1. Watchdog aktiviert sich (Error 4070: WATCHDOG_TIMEOUT)
2. CircuitBreaker öffnet
3. System des ESP wird neu initialisiert
4. ESP verbindet sich korrekt neu (WiFi + MQTT)
5. **Problem:** Irgendetwas scheint nicht stabil zu laufen

#### ✅ ROOT-CAUSE ANALYSE (verifiziert)

**Der Widerspruch in `mqtt_client.cpp`:**
- Zeile 425: Kommentar behauptet `"IMPROVEMENT #3: MAX_RECONNECT_ATTEMPTS entfernt!"`
- Zeile 731: Der Check existierte noch: `if (reconnect_attempts_ >= MAX_RECONNECT_ATTEMPTS)`

**Kausal-Kette:**
```
MQTT disconnect (z.B. kurzer Netzwerkausfall)
→ 10 Reconnect-Versuche (~6-10 Min mit Exponential Backoff)
→ shouldAttemptReconnect() returns false (MAX_RECONNECT_ATTEMPTS=10 erreicht)
→ MQTTClient stoppt alle weiteren Reconnect-Versuche
→ MQTT Circuit Breaker bleibt OPEN (kann nie recovern)
→ feedWatchdog() returns false (main.cpp:1510-1517 prüft CB-State)
→ Watchdog Timeout nach 60s
→ ESP Reboot
```

#### ✅ FIX IMPLEMENTIERT

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp`
**Änderung:** MAX_RECONNECT_ATTEMPTS-Check aus `shouldAttemptReconnect()` entfernt

```cpp
// VORHER (Zeile 729-733):
bool MQTTClient::shouldAttemptReconnect() const {
    if (reconnect_attempts_ >= MAX_RECONNECT_ATTEMPTS) {
        return false;  // ← BUG: Stoppt Reconnect nach 10 Versuchen
    }
    ...
}

// NACHHER:
bool MQTTClient::shouldAttemptReconnect() const {
    // ✅ FIX: MAX_RECONNECT_ATTEMPTS-Check ENTFERNT (2026-01-20)
    // Der Circuit Breaker regelt die Fehlerbehandlung bereits ausreichend.

    // Wait for reconnect delay (exponential backoff)
    if (current_time - last_reconnect_attempt_ < reconnect_delay_ms_) {
        return false;
    }
    return true;
}
```

**Build-Status:** ✅ SUCCESS (26.32 seconds)

#### 🔄 NOCH ZU TESTEN (Hardware-Verifikation)

- [ ] ESP flashen mit neuem Build
- [ ] 20+ Minuten Laufzeit ohne Watchdog-Timeout
- [ ] MQTT-Disconnect simulieren → Reconnect sollte unbegrenzt versucht werden
- [ ] Circuit Breaker sollte nach Reconnect in CLOSED wechseln

**Relevante Code-Stellen:**
```cpp
// El Trabajante/src/models/error_codes.h
#define ERROR_WATCHDOG_TIMEOUT              4070
#define ERROR_WATCHDOG_FEED_BLOCKED         4071
#define ERROR_WATCHDOG_FEED_BLOCKED_CRITICAL 4072

// El Trabajante/src/main.cpp:1510-1517 - Watchdog Feed mit CB-Check
// El Trabajante/src/services/communication/mqtt_client.cpp:729-743 - shouldAttemptReconnect() [GEFIXT]
```

**MQTT-Befehl zum Beobachten:**
```bash
mosquitto_sub -h localhost -t "kaiser/god/esp/ESP_D0B19C/#" -v
```

---

## 3. Architektur-Observation: 60-Sekunden Heartbeat-Limit

### Problem
Der Heartbeat wird nur alle **60 Sekunden** gesendet. Das bedeutet:
- Status-Updates können bis zu 60s verzögert sein
- Bei schnellen Änderungen (Reboot, Config-Change) wartet man lange
- Echtzeit-Monitoring ist nicht möglich

### Betroffene Bereiche
| Bereich | Impact |
|---------|--------|
| Online/Offline Status | Bis zu 60s Verzögerung |
| Approval-Confirmation | ESP erfährt erst beim nächsten Heartbeat |
| Config-Changes | Keine sofortige Bestätigung |
| Debug/Troubleshooting | Langsames Feedback |

### Lösungsvorschlag für die Zukunft

**Option A: On-Demand Heartbeat (Server Pull)**
```
Server → MQTT → kaiser/god/esp/{id}/system/command
Payload: { "action": "heartbeat_now" }
ESP empfängt → Sendet sofort Heartbeat
```

**Option B: Event-Driven statt Polling**
```
ESP sendet sofort bei:
- State-Change (PENDING → OPERATIONAL)
- Error aufgetreten
- Config geändert
- Reconnect nach Disconnect
```

**Option C: Konfigurierbares Intervall**
```json
// Config an ESP senden:
{
  "heartbeat_interval_seconds": 60,      // Default
  "heartbeat_on_state_change": true,     // Sofort bei Änderung
  "heartbeat_on_error": true             // Sofort bei Error
}
```

**Empfehlung:**
- **Kurzfristig:** Option A (On-Demand) für Debug-Situationen
- **Langfristig:** Option B+C kombiniert für robustes System

---

## 4. Test-Plan für Edge Cases

### 4.1 Verbindungsverlust-Test
1. ESP normal laufen lassen (OPERATIONAL)
2. WiFi-Router ausschalten (oder ESP aus Reichweite)
3. 5 Minuten warten
4. Frontend beobachten → Wann wird "Offline" angezeigt?
5. Router wieder einschalten
6. Frontend beobachten → Wann wird "Online" angezeigt?
7. Server-Logs prüfen → Was wurde geloggt?

### 4.2 Delete & Reconnect Test
1. ESP genehmigen (APPROVED/OPERATIONAL)
2. ESP über Frontend/API löschen
3. ESP weiter laufen lassen (sendet Heartbeats)
4. Beobachten → Erscheint als Pending?
5. Erneut genehmigen
6. Prüfen ob alte Sensor-Configs noch vorhanden

### 4.3 Approval während Offline
1. ESP starten → Pending
2. ESP WiFi trennen
3. Im Frontend "Approve" klicken
4. ESP WiFi wieder verbinden
5. Beobachten → Wird OPERATIONAL erreicht?
6. Wie viele Heartbeats bis ACK ankommt?

---

## 5. Relevante Code-Referenzen

| Thema | Datei | Funktion/Bereich |
|-------|-------|------------------|
| Heartbeat-Verarbeitung | `heartbeat_handler.py` | `handle()` |
| Pending-Liste API | `esp.py` (API) | `list_pending_devices()` |
| Approval-Logik | `esp.py` (API) | `approve_device()` |
| ESP Model | `esp.py` (Model) | `ESPDevice` Klasse |
| Timeout-Detection | `maintenance/jobs/` | `esp_timeout_job` (falls vorhanden) |
| Frontend State | `stores/esp.ts` | `handleDeviceApproved()` |
| Audit-Log | `db/models/audit_log.py` | `AuditLog` Model |

---

## 6. Akzeptanzkriterien

Nach Abschluss dieser Phase sollten folgende Fragen beantwortet sein:

- [ ] **Robustheit:** System verkraftet Verbindungsabbrüche graceful
- [ ] **Nachvollziehbarkeit:** Jeder Status-Wechsel ist in DB/Logs dokumentiert
- [ ] **Konsistenz:** Nach Reconnect ist ESP-Status korrekt (nicht "stuck")
- [ ] **User Experience:** Frontend zeigt korrekten Status mit sinnvollen Zeitangaben
- [ ] **Error-Handling:** ESP-Errors sind im Server bekannt und dokumentiert
- [ ] **Erweiterbarkeit:** Plan für On-Demand/Realtime-Updates existiert

---

## 7. Nächste Schritte (Priorisiert)

### ✅ Erledigt (2026-01-20 06:05)

1. **~~Watchdog-Bug #1: MAX_RECONNECT_ATTEMPTS~~** ✅ GEFIXT
   - Root-Cause: Check in `shouldAttemptReconnect()` verhinderte unbegrenztes Reconnecting
   - Fix: `mqtt_client.cpp:729-743` - Check entfernt
   - Build: SUCCESS

2. **~~Watchdog-Bug #2: MQTT CB blockiert Watchdog~~** ✅ GEFIXT
   - Root-Cause: MQTT CB OPEN führte zu `feedWatchdog()=false` → Reboot
   - Fix: `main.cpp:1510-1523` - MQTT CB blockiert Watchdog nicht mehr
   - Build: SUCCESS
   - **Hardware-Test:** ESP läuft im "degraded mode" ohne Reboot ✅

3. **~~Fehlende Error-Codes synchronisieren~~** ✅ ERLEDIGT
   - Alle 19 Codes in `error_codes.py` vorhanden
   - Verifiziert: 1023, 1029, 2500-2506, 4070-4072, 4200-4202

4. **~~Windows Firewall für MQTT~~** ✅ GEFIXT
   - Problem: ESP konnte nicht zu Mosquitto verbinden (rc=-2)
   - Fix: Eingehende Regel für Port 1883 hinzugefügt
   - Befehl: `netsh advfirewall firewall add rule name="Mosquitto MQTT" dir=in action=allow protocol=tcp localport=1883`

5. **~~Race Condition: Exponential Backoff vs HALF_OPEN Timeout~~** ✅ GEFIXT
   - **Problem:** Nach vielen MQTT-Fehlern war `reconnect_delay_ms_` > 30s, aber HALF_OPEN Timeout nur 10s
   - **Symptom:** "HALF_OPEN test timed out → OPEN" ohne dass jemals ein Reconnect-Versuch stattfand
   - **Root-Cause:** `shouldAttemptReconnect()` blockierte wegen Backoff, obwohl CB in HALF_OPEN war
   - **Fix:** `mqtt_client.cpp:737-744` - Bei HALF_OPEN wird Backoff umgangen
   - **Build:** SUCCESS
   - **Code-Änderung:**
     ```cpp
     // ✅ FIX #2: HALF_OPEN bypasses exponential backoff
     if (circuit_breaker_.getState() == CircuitState::HALF_OPEN) {
         return true;  // Sofort versuchen, kein Backoff!
     }
     ```

### 🔄 In Arbeit
6. **Hardware-Test: MQTT-Reconnect nach Race Condition Fix**
   - ESP flashen mit neuem Build
   - WiFi-Disconnect simulieren
   - Erwartung: Bei HALF_OPEN sofort Reconnect-Versuch (kein 10s Timeout ohne Versuch)
   - Beobachten: "Attempting MQTT reconnection" direkt nach "Attempting recovery → HALF_OPEN"

### Hohe Priorität
7. **Langzeit-Test (30+ Minuten)**
   - ESP stabil mit MQTT-Verbindung laufen lassen
   - Keine Watchdog-Timeouts
   - Circuit Breaker Recovery funktioniert nach WiFi-Reconnect

### Mittlere Priorität
7. Edge-Case-Tests durchführen (Section 4)
8. Audit-Trail Vollständigkeit prüfen (Section 2.3)

### Niedrige Priorität
9. Architektur-Entscheidung für Realtime-Updates (Section 3)
