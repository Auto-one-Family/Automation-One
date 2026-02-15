# Problem-Katalog

**Session:** 2026-02-02 04:13 - 04:48
**Analysiert:** 2026-02-02 04:48
**Analyst:** Claude Agent (auf Anfrage von Robin)
**ESP unter Test:** ESP_472204 (OPERATIONAL)

---

## Zusammenfassung

| Kategorie | Anzahl | Kritisch | High | Medium | Low | Known/Accepted |
|-----------|--------|----------|------|--------|-----|----------------|
| Errors | 5 | 0 | 2 | 0 | 0 | 3 |
| Warnings | 8 | 0 | 0 | 1 | 1 | 6 |
| Anomalien | 1 | 0 | 0 | 1 | 0 | 0 |
| Inkonsistenzen | 1 | 0 | 0 | 1 | 0 | 0 |
| **GESAMT** | **15** | **0** | **2** | **3** | **1** | **9** |

**Neue Probleme die Aufmerksamkeit benötigen: 6**

---

## Errors (5)

### ERR-001: WebSocketManager.broadcast() falsches Argument

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | 2026-02-01 23:47:17 (wiederholt bei jedem Server-Start) |
| **Häufigkeit** | 5x (bei jedem Server-Neustart) |
| **Error-Code** | Python TypeError |
| **Kontext** | Nach zone_ack Handler, bei Broadcast-Versuch |

**Log-Eintrag:**
```json
{"level": "ERROR", "logger": "src.mqtt.handlers.zone_ack_handler", "message": "Failed to broadcast zone update: WebSocketManager.broadcast() got an unexpected keyword argument 'event_type'"}
```

**Beobachtung:**
Der `zone_ack_handler` ruft `WebSocketManager.broadcast()` mit einem `event_type` Parameter auf, den die Methode nicht akzeptiert. Dies ist ein Code-Bug - die Signatur der Methode stimmt nicht mit dem Aufruf überein.

**Auswirkung:**
Zone-Updates werden nicht per WebSocket an Frontend gebroadcasted. Frontend sieht Zone-Änderungen nicht in Echtzeit.

**Status:** **HIGH - Needs Fix**

---

### ERR-002: Actuator Config FAILED auf ESP_00000001

| Attribut | Wert |
|----------|------|
| **Quelle** | Server (via MQTT) |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | 2026-02-01 23:47:17, 2026-02-02 03:34:51, etc. |
| **Häufigkeit** | 5x (bei jedem Server-Start) |
| **Error-Code** | UNKNOWN_ERROR |
| **Kontext** | Retained MQTT Message von altem/offline ESP |

**Log-Eintrag:**
```json
{"level": "ERROR", "message": "Config FAILED on ESP_00000001: actuator - Failed to configure actuator on GPIO 13 (Error: UNKNOWN_ERROR - Ein unerwarteter Fehler ist auf dem ESP32 aufgetreten)"}
```

**MQTT-Eintrag (retained):**
```json
kaiser/god/esp/ESP_00000001/config_response {"status":"error","type":"actuator","count":0,"message":"Failed to configure actuator on GPIO 13","error_code":"UNKNOWN_ERROR"}
```

**Beobachtung:**
Dies ist eine **retained MQTT Message** von einem alten/offline ESP (ESP_00000001). Bei jedem Server-Start werden retained Messages empfangen und verarbeitet. Der Server behandelt diese wie aktuelle Fehler, obwohl sie historisch sind.

**Auswirkung:**
Log-Verschmutzung. Kein funktionaler Impact auf aktive ESPs. Könnte aber echte Fehler verschleiern.

**Status:** **HIGH - Needs Investigation**

**Frage:** Soll der Server retained error-messages ignorieren wenn das Gerät offline ist?

---

### ERR-003: NVS Namespace "subzone_config" nicht gefunden

| Attribut | Wert |
|----------|------|
| **Quelle** | ESP32 |
| **Log-Datei** | `logs/current/esp32_serial.log` |
| **Zeitstempel** | 04:16:18 - 04:48:19 (und fortlaufend) |
| **Häufigkeit** | Alle 60 Sekunden (bei jedem Heartbeat-Zyklus) |
| **Error-Code** | `nvs_open failed: NOT_FOUND` |
| **Kontext** | Vor Heartbeat-Versand |

**Log-Eintrag:**
```
[E][Preferences.cpp:50] begin(): nvs_open failed: NOT_FOUND
[ERROR] StorageManager: Failed to open namespace: subzone_config
```

**Beobachtung:**
Neues Gerät hat noch keine Subzones zugewiesen. Der NVS-Namespace existiert nicht, weil nie Subzones konfiguriert wurden. Der Code versucht bei jedem Heartbeat die Subzone-Config zu laden und loggt ERROR wenn nicht vorhanden.

**Auswirkung:**
Log-Verschmutzung (32+ ERROR-Einträge im Analysezeitraum). Funktional keine Auswirkung.

**Status:** Known/Accepted (dokumentiert in PROVISIONING_DEBUG_REPORT)

---

### ERR-004: NVS Namespace "wifi_config" nicht gefunden (Boot)

| Attribut | Wert |
|----------|------|
| **Quelle** | ESP32 |
| **Log-Datei** | `logs/current/esp32_serial.log` |
| **Zeitstempel** | 04:13:06 (Boot-Phase) |
| **Häufigkeit** | 2x bei Boot (einmalig pro Restart) |
| **Error-Code** | `nvs_open failed: NOT_FOUND` |
| **Kontext** | Während Config-Load beim Boot |

**Log-Eintrag:**
```
[E][Preferences.cpp:50] begin(): nvs_open failed: NOT_FOUND
[ERROR] StorageManager: Failed to open namespace: wifi_config
[ERROR] ConfigManager: Failed to open wifi_config namespace
```

**Beobachtung:**
Bei erstem Boot (vor Provisioning) existiert kein wifi_config. Dies ist erwartetes Verhalten für ein unprovisioniertes Gerät. Nach Provisioning wird der Namespace erstellt.

**Auswirkung:**
Keine. Erwartetes Verhalten. Gerät geht korrekt in AP-Mode.

**Status:** Known/Accepted

---

### ERR-005: NVS getString Fehler für Config-Keys (Boot)

| Attribut | Wert |
|----------|------|
| **Quelle** | ESP32 |
| **Log-Datei** | `logs/current/esp32_serial.log` |
| **Zeitstempel** | 04:13:06, 04:16:11 (Boot-Phasen) |
| **Häufigkeit** | ~20x bei Boot |
| **Error-Code** | `nvs_get_str len fail: NOT_FOUND` |
| **Kontext** | Config-Load beim Boot |

**Log-Eintrag:**
```
[E][Preferences.cpp:483] getString(): nvs_get_str len fail: zone_id NOT_FOUND
[E][Preferences.cpp:483] getString(): nvs_get_str len fail: master_zone_id NOT_FOUND
[E][Preferences.cpp:483] getString(): nvs_get_str len fail: zone_name NOT_FOUND
...
```

**Betroffene Keys:**
- zone_id, master_zone_id, zone_name
- kaiser_id, kaiser_name
- l_mz_id, legacy_master_zone_id, l_mz_name, legacy_master_zone_name
- safe_mode_reason

**Beobachtung:**
Neues/unprovisioniertes Gerät hat diese Config-Werte noch nicht gesetzt. Die ESP32 Preferences-Library loggt jeden fehlenden Key als Fehler. Dies ist Library-internes Logging, nicht vom Application-Code kontrolliert.

**Auswirkung:**
Log-Verschmutzung beim Boot. Funktional keine Auswirkung - der Code handhabt fehlende Keys graceful.

**Status:** Known/Accepted

---

## Warnings (8)

### WARN-001: Handler returned False für Emergency-Topic

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start (5x im Log) |
| **Häufigkeit** | 1x pro Server-Start |
| **Kontext** | Nach MQTT Subscribe, beim Empfang retained Emergency |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "Handler returned False for topic kaiser/broadcast/emergency - processing may have failed"}
```

**Beobachtung:**
Der Emergency-Handler gibt `False` zurück beim Verarbeiten der retained Emergency-Message. Dies könnte bedeuten:
1. Handler erkennt veraltete Emergency und ignoriert sie bewusst (→ False = "nicht relevant")
2. Handler hat tatsächlich einen Fehler

**Auswirkung:**
Unklar. Benötigt Code-Review um zu verstehen was "False" bedeutet.

**Status:** **MEDIUM - Needs Investigation**

---

### WARN-002: Actuator Command Failed (ESP_00000001)

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start |
| **Häufigkeit** | 2x pro Server-Start (GPIO 5, GPIO 13) |
| **Kontext** | Retained MQTT actuator response |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "Actuator command failed: esp_id=ESP_00000001, gpio=5, command=ON, error=Command failed"}
{"level": "WARNING", "message": "Actuator command failed: esp_id=ESP_00000001, gpio=13, command=OFF, error=Command failed"}
```

**Beobachtung:**
Retained MQTT Messages von altem ESP_00000001 (Wokwi-Test). Der ESP ist offline, aber seine letzten Actuator-Responses sind noch im Broker gespeichert. Server verarbeitet diese bei jedem Start.

**Auswirkung:**
Log-Verschmutzung. Keine funktionale Auswirkung.

**Status:** Known/Accepted (alte Test-Daten)

---

### WARN-003: LWT - ESP disconnected unexpectedly

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start |
| **Häufigkeit** | 2x pro Server-Start |
| **Kontext** | Retained LWT Messages |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "LWT received: ESP ESP_00000001 disconnected unexpectedly (reason: unexpected_disconnect)"}
{"level": "WARNING", "message": "LWT received: ESP ESP_D0B19C disconnected unexpectedly (reason: unexpected_disconnect)"}
```

**Beobachtung:**
Alte ESPs (ESP_00000001, ESP_D0B19C) haben retained LWT (Last Will and Testament) Messages im Broker. Bei Server-Start werden diese empfangen und als "Disconnect" interpretiert.

**Auswirkung:**
Log-Noise. Keine funktionale Auswirkung - Geräte sind bereits als offline markiert.

**Status:** Known/Accepted (alte Test-Daten)

---

### WARN-004: Sensor stale (alte Mock-Sensoren)

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Alle 60 Sekunden (Health-Check) |
| **Häufigkeit** | 8x pro Minute |
| **Kontext** | Maintenance Service Sensor Health Check |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "Sensor stale: ESP MOCK_067EA733 GPIO 4 (DS18B20) - no data for 261885s (timeout: 180s)"}
{"level": "WARNING", "message": "Sensor stale: ESP MOCK_067EA733 GPIO 22 (sht31_humidity) - no data for 261885s (timeout: 180s)"}
...
```

**Betroffene Sensoren:**
| ESP | GPIO | Typ | Letzte Daten |
|-----|------|-----|--------------|
| MOCK_067EA733 | 4 | DS18B20 | ~3 Tage |
| MOCK_067EA733 | 21 | sht31_temp, sht31_humidity | ~3 Tage |
| MOCK_067EA733 | 22 | sht31_temp, sht31_humidity | ~3 Tage |
| ESP_00000001 | 34 | ds18b20 | ~3 Tage |
| MOCK_E2ETEST01 | 4 | temperature | ~2.4 Tage |
| MOCK_E2ETEST01 | 22 | humidity | ~2.4 Tage |

**Beobachtung:**
Dies sind alte Mock- und Test-Sensoren die keine Daten mehr senden. Das System erkennt sie korrekt als "stale". Die Warnings sind funktional korrekt - sie zeigen dass das Monitoring funktioniert.

**Auswirkung:**
Log-Noise (8 Warnings pro Minute). Aber: System-Verhalten ist KORREKT.

**Status:** Known/Accepted (alte Test-Daten, erwartetes Verhalten)

---

### WARN-005: Orphaned Mocks gefunden

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start |
| **Häufigkeit** | 3x pro Server-Start |
| **Kontext** | OrphanedMocksCleanup Job |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "Old orphaned Mock found: MOCK_0D47C6D4 (last updated: 2026-01-27). Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete."}
{"level": "WARNING", "message": "Old orphaned Mock found: MOCK_F7393009 (last updated: 2026-01-28). Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete."}
{"level": "WARNING", "message": "Old orphaned Mock found: MOCK_067EA733 (last updated: 2026-01-30). Set ORPHANED_MOCK_AUTO_DELETE=true to auto-delete."}
```

**Beobachtung:**
Das System erkennt korrekt, dass es alte Mock-ESPs in der Datenbank gibt die keine Heartbeats mehr senden. Es bietet eine Cleanup-Option (`ORPHANED_MOCK_AUTO_DELETE=true`).

**Auswirkung:**
Keine. Dies ist ein Feature, nicht ein Problem. System arbeitet wie designed.

**Status:** Known/Accepted (Feature funktioniert korrekt)

---

### WARN-006: JWT Secret Key Default (Development)

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start |
| **Häufigkeit** | 1x pro Server-Start |
| **Kontext** | Security Config Check |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "SECURITY: Using default JWT secret key (OK for development only). Change JWT_SECRET_KEY in production!"}
```

**Beobachtung:**
Development-Warnung. Im Production-Deployment muss `JWT_SECRET_KEY` gesetzt werden.

**Auswirkung:**
Keine im Development. Security-Risk in Production.

**Status:** Known/Accepted (Development-Modus)

---

### WARN-007: MQTT TLS deaktiviert

| Attribut | Wert |
|----------|------|
| **Quelle** | Server |
| **Log-Datei** | `El Servador/god_kaiser_server/logs/god_kaiser.log` |
| **Zeitstempel** | Bei jedem Server-Start |
| **Häufigkeit** | 1x pro Server-Start |
| **Kontext** | Security Config Check |

**Log-Eintrag:**
```json
{"level": "WARNING", "message": "MQTT TLS is disabled. MQTT authentication credentials will be sent in plain text. Enable MQTT_USE_TLS for secure credential distribution."}
```

**Beobachtung:**
Development-Warnung. Im Production-Deployment sollte MQTT TLS aktiviert werden.

**Auswirkung:**
Keine im Development (lokales Netzwerk). Security-Risk in Production.

**Status:** Known/Accepted (Development-Modus)

---

### WARN-008: Broadcast Emergency-Stop empfangen (ESP32)

| Attribut | Wert |
|----------|------|
| **Quelle** | ESP32 |
| **Log-Datei** | `logs/current/esp32_serial.log` |
| **Zeitstempel** | 04:16:19 (einmalig bei MQTT-Connect) |
| **Häufigkeit** | 1x (bei MQTT Subscribe) |
| **Kontext** | Retained Emergency Message |

**Log-Eintrag:**
```
[WARNING] ╔════════════════════════════════════════╗
[WARNING] ║  BROADCAST EMERGENCY-STOP RECEIVED    ║
[WARNING] ╚════════════════════════════════════════╝
[WARNING] SafetyController emergency: Broadcast emergency (God-Kaiser)
```

**MQTT-Quelle:**
```json
kaiser/broadcast/emergency {"command": "EMERGENCY_STOP", "reason": "Phase 2 Test", "issued_by": "Robin", "timestamp": "2026-01-30T03:42:17.420950+00:00", "devices_stopped": 1, "actuators_stopped": 3}
```

**Beobachtung:**
Dies ist eine **retained MQTT Message** vom 2026-01-30 (3 Tage alt). Bei Subscribe wird sie automatisch zugestellt. ESP reagiert korrekt auf Emergency (Safety first).

**Auswirkung:**
ESP geht korrekt in Safe-Mode. Allerdings ist die Emergency 3 Tage alt und nicht mehr relevant.

**Status:** **LOW - Cleanup empfohlen**

**Empfehlung:**
```bash
mosquitto_pub -h 192.168.0.194 -t "kaiser/broadcast/emergency" -r -n
```

---

## Anomalien (1)

### ANOM-001: Config-Load "failed" aber System funktioniert

| Attribut | Wert |
|----------|------|
| **Quelle** | ESP32 |
| **Log-Datei** | `logs/current/esp32_serial.log` |
| **Zeitstempel** | 04:13:06 (Boot) |
| **Kontext** | Nach NVS-Errors |

**Log-Eintrag:**
```
[WARNING] ConfigManager: Some configurations failed to load
[WARNING] Some configurations failed to load - using defaults
```

**Aber dann:**
```
[INFO] AP-Mode gestartet
[INFO] Provisioning erfolgreich
[INFO] WiFi connected
[INFO] MQTT connected
```

**Beobachtung:**
Der ConfigManager meldet Fehler beim Laden, aber das System funktioniert danach einwandfrei. Dies zeigt:
1. Der "Fehler" ist erwartet (neues Gerät)
2. Das System hat gute Fallback-Logik
3. Aber: Die Log-Messages sind irreführend

**Auswirkung:**
Keine funktionale. Aber: Logs suggerieren Probleme wo keine sind.

**Status:** **MEDIUM - Log-Message-Qualität**

**Frage:** Sollte ein unprovisioniertes Gerät "failed to load" loggen, oder "no config found, using defaults"?

---

## Inkonsistenzen (1)

### INC-001: boot_count springt von 3 auf 0

| Attribut | Wert |
|----------|------|
| **Quelle A** | MQTT Heartbeat vor Approval |
| **Quelle B** | MQTT Heartbeat nach Approval |
| **Zeitpunkt A** | 04:22:19 (state: 0, boot_count: 3) |
| **Zeitpunkt B** | 04:23:19 (state: 8, boot_count: 0) |

**Heartbeat VOR Approval (04:22:19):**
```json
{"config_status":{"boot_count":3,"state":0}}
```

**Heartbeat NACH Approval (04:23:19):**
```json
{"config_status":{"boot_count":0,"state":8}}
```

**Beobachtung:**
Nach dem Approval-ACK ("online") springt der `boot_count` von 3 auf 0 und der `state` von 0 auf 8. Dies könnte sein:
1. Absichtliches Reset bei Approval (dann ist es kein Bug)
2. Ein Reset durch das Approval-Event
3. Ein Anzeige-Fehler

**Auswirkung:**
Unklar. Benötigt Review der `boot_count` und `state` Semantik.

**Status:** **MEDIUM - Needs Clarification**

**Frage:** Ist es erwartetes Verhalten dass `boot_count` bei Approval auf 0 gesetzt wird?

---

## Kritikalitäts-Matrix

### Sofortiger Handlungsbedarf (HIGH)

| ID | Problem | Typ | Empfehlung |
|----|---------|-----|------------|
| ERR-001 | WebSocketManager.broadcast() falsches Argument | Bug | Code-Fix erforderlich |
| ERR-002 | Retained Error-Messages werden verarbeitet | Design | Policy-Entscheidung |

### Untersuchung erforderlich (MEDIUM)

| ID | Problem | Typ | Empfehlung |
|----|---------|-----|------------|
| WARN-001 | Handler returned False für Emergency | Unklar | Code-Review |
| ANOM-001 | "Failed to load" bei neuem Gerät | UX | Log-Message verbessern |
| INC-001 | boot_count springt bei Approval | Unklar | Semantik klären |

### Optional/Cleanup (LOW)

| ID | Problem | Typ | Empfehlung |
|----|---------|-----|------------|
| WARN-008 | Alte Emergency retained | Hygiene | Topic clearen |

### Known/Accepted (kein Handlungsbedarf)

| IDs | Anzahl | Grund |
|-----|--------|-------|
| ERR-003, ERR-004, ERR-005 | 3 | Erwartetes Verhalten bei neuem Gerät |
| WARN-002, WARN-003, WARN-004, WARN-005 | 4 | Alte Test-Daten, System verhält sich korrekt |
| WARN-006, WARN-007 | 2 | Development-Warnungen |

---

## Empfehlungen für nächste Schritte

### 1. Code-Fix (ERR-001)

```python
# Datei: src/mqtt/handlers/zone_ack_handler.py, Zeile ~273
# Problem: WebSocketManager.broadcast() wird mit falschen Argumenten aufgerufen
# Lösung: Signatur der Methode oder des Aufrufs korrigieren
```

### 2. Design-Entscheidung (ERR-002)

Soll der Server:
- Retained error-messages von offline ESPs ignorieren?
- Oder sie verarbeiten aber als "historical" markieren?
- Oder den Timestamp prüfen und alte Messages verwerfen?

### 3. Cleanup (WARN-008)

```bash
# Alte Emergency-Message aus Broker entfernen
mosquitto_pub -h 192.168.0.194 -t "kaiser/broadcast/emergency" -r -n
```

### 4. Optional: Auto-Cleanup aktivieren

```env
# In .env oder Umgebungsvariablen
ORPHANED_MOCK_AUTO_DELETE=true
```

---

## Log-Validierung

| Log | Pfad | Letzter Eintrag | Status |
|-----|------|-----------------|--------|
| ESP32 Serial | `logs/current/esp32_serial.log` | 04:48:19 | AKTUELL |
| MQTT Traffic | `logs/current/mqtt_traffic.log` | 04:48:xx | AKTUELL |
| Server (Original) | `El Servador/.../god_kaiser.log` | 04:48:50 | AKTUELL |
| Server (Kopie) | `logs/current/god_kaiser.log` | 03:47:xx | VERALTET |

**Hinweis:** Die Server-Log-Kopie in `logs/current/` wird nicht aktualisiert. Immer das Original in `El Servador/god_kaiser_server/logs/` verwenden.

---

*Report erstellt: 2026-02-02 04:48 | Problem-Katalog v1.0*
*Keine Fixes vorgenommen - nur Dokumentation.*
