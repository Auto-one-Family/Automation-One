# Verifikationsauftrag: Device Lifecycle – Vollständige Systemprüfung
**Datum:** 2026-02-10
**Erstellt von:** Technical Manager
**Typ:** Verifikation nach Phase 1-3 Implementierung
**Status:** Alle drei Phasen implementiert, Gesamtprüfung erforderlich

---

## Gesamtkontext: Was wurde implementiert und warum

### Systemarchitektur (Kernprinzip)

AutomationOne ist **server-zentrisch**: ESP32-Devices sind "dumme Agenten", El Servador (FastAPI) enthält alle Business-Logik. Die Datenbank ist die **zentrale Wahrheit** für das Frontend. Kommunikationskette: ESP32 ↔ MQTT ↔ Server ↔ PostgreSQL ↔ Frontend (Vue 3).

### Der Device-Lifecycle (SOLL-Zustand nach Phase 1-3)

**Echter ESP (Production):**
```
1. ESP wird geflasht (frischer NVS, keine Config)
2. ESP erkennt: Keine Config → öffnet WiFi AP ("AutoOne-{ESP_ID}")
3. User verbindet sich zum AP, Captive Portal öffnet sich
4. User konfiguriert: WiFi-SSID, WiFi-Passwort, Server-IP, MQTT-Port (Kaiser-ID optional, default: "god")
5. ESP speichert Config in NVS, rebooted
6. ESP verbindet zu WiFi → dann zu MQTT Broker
7. ESP sendet Heartbeat
8. Server registriert Device in DB als "pending_approval"
9. Frontend zeigt Device in Pending-Liste, Admin akzeptiert oder lehnt ab
10. Nach Akzeptanz + nächstem Heartbeat: Device ist "online"
11. Sensor/Aktuator-Config möglich (nur für approved Devices)
```

**Wokwi (Simulation):**
```
1. Build mit WOKWI_SIMULATION=1 Flag
2. ConfigManager liefert Compile-Time Credentials (Wokwi-GUEST, host.wokwi.internal:1883)
3. config.configured = true → Captive Portal wird NICHT gestartet
4. ESP verbindet direkt zu WiFi → MQTT → sendet Heartbeat
5. Server findet pre-registered Device (status: "offline" via seed_wokwi_esp.py) → setzt direkt auf "online" (Approval-Flow ÜBERSPRUNGEN)
6. Ab hier: Device ist sofort online (KEIN pending_approval, KEIN Admin-Approve nötig)
```

**Captive Portal dient drei Zwecken:**
- **Ersteinrichtung:** Initiale Config bei neuem ESP
- **Rekonfiguration:** User kann Server/Ports wechseln (z.B. Serverumzug)
- **Recovery:** Portal öffnet sich wieder wenn Verbindung dauerhaft fehlschlägt

### Was in Phase 1-3 implementiert wurde

**Phase 1 (ESP-Firmware):**
- MQTT-Fehler bei Startup → Captive Portal Recovery (wie bei WiFi)
- MQTT-Fehler zur Runtime → nach 5 Min dauerhaftem Ausfall: NVS löschen, Reboot, Portal
- LED-Blink-Codes: 3× = ProvisionManager Init Failure (generisch), 4× = WiFi AP-Mode Start Failure, 5× = WiFi ProvisionManager Init Failure, 6× = MQTT ProvisionManager Init Failure (Codes signalisieren Portal-Init-Fehler, NICHT den Recovery-Prozess selbst)

**Phase 2 (Server):**
- Discovery-Handler: Neue Devices → `pending_approval` statt `online`
- Config-Endpoints: Guard prüft ob Device approved ist bevor Config erlaubt wird
- Write-after-Verification: Sensor/Aktuator-Config-Status bleibt `pending` bis ESP bestätigt
- Config-Handler: `_mark_config_applied()` setzt Status auf `applied` oder `failed` nach ESP-Antwort
- API-Responses + Frontend-Types erweitert um `config_status`, `config_error`

**Phase 3 (Wokwi):**
- War bereits vollständig implementiert: `#ifdef WOKWI_SIMULATION` Guards, Compile-Time Credentials, Captive Portal wird übersprungen

---

## Identifiziertes Risiko: Captive Portal Recovery zu aggressiv

### Das Problem

Phase 1 hat das WiFi-Recovery-Pattern 1:1 auf MQTT übertragen:
- WiFi falsch → NVS löschen → Portal öffnen ✅ (sinnvoll, User hat was Falsches eingegeben)
- MQTT kurz weg → 5 Min warten → NVS löschen → Reboot → Portal öffnen ❌ (zu aggressiv)

**Szenario:** Docker-Stack wird kurz neugestartet, MQTT-Broker ist 2 Minuten offline. Der ESP sollte:
1. Lokal weiterarbeiten (Sensoren lesen, Aktuator-States halten)
2. Im Hintergrund MQTT-Reconnect versuchen (Circuit Breaker macht das bereits)
3. Wenn MQTT zurückkommt: Nahtlos weitermachen
4. **NICHT** die komplette Config löschen und den User zur Neukonfiguration zwingen

### Kern-Unterscheidung die geprüft werden muss

| Situation | ESP hat Config? | Richtiges Verhalten |
|-----------|----------------|---------------------|
| Frisch geflasht, keine Config | Nein | Portal öffnen, User konfiguriert |
| Falsche WiFi-Credentials | Ja, aber falsch | Portal öffnen, NVS löschen, User korrigiert |
| WiFi OK, MQTT-Port falsch (noch nie verbunden) | Ja, aber falsch | Portal öffnen, User korrigiert |
| WiFi OK, MQTT war mal OK, Broker kurz offline | Ja, korrekt | Lokal weiterarbeiten, im Hintergrund reconnecten |
| WiFi OK, MQTT war mal OK, Broker dauerhaft weg | Ja, korrekt | Lokal weiterarbeiten, reconnecten, **irgendwann** Portal anbieten OHNE Config zu löschen |

**Entscheidende Frage:** Wie unterscheidet der ESP zwischen "Config ist falsch" (User hat Port/IP falsch eingegeben) und "Config ist richtig aber Service gerade nicht erreichbar"?

**Mögliches Kriterium:** War der ESP schon mal erfolgreich mit MQTT verbunden?
- **Nie verbunden gewesen** (nach frischer Config) → Config wahrscheinlich falsch → NVS löschen, Portal
- **War mal verbunden, jetzt nicht mehr** → Transientes Problem → weiterarbeiten, reconnecten

### Circuit Breaker Verhalten prüfen

Der bestehende Circuit Breaker (`mqttClient.loop()` → `reconnect()`) macht:
- 5 Failures → 30s OPEN → HALF_OPEN → Test → bei Erfolg: CLOSED, bei Fehler: wieder OPEN

**Muss geprüft werden:**
- Blockiert der Circuit Breaker auch lokale Funktionen? (Sensor-Reads, Aktuator-Steuerung, Logging)
- Oder blockiert er NUR den MQTT-Reconnect-Versuch?
- Die bestehende Code-Struktur und Patterns sehen lokale Weiterarbeit vor – das muss verifiziert werden
- Wenn der ESP im MQTT-OPEN-State ist: Laufen Sensor-Reads weiter? Werden Werte lokal gepuffert? Funktionieren Aktuator-Commands die lokal ausgelöst werden (z.B. Emergency)?

### Wokwi-spezifische Prüfung

- Wokwi nutzt denselben MQTT-Flow wie der echte ESP (nach dem Config-Bypass)
- Wenn MQTT-Broker im Docker-Stack nicht läuft, trifft Wokwi dasselbe Recovery-Problem
- Phase 3 Report empfiehlt: Bei Wokwi MQTT-Recovery per Guard überspringen, stattdessen Error-Log + Stop
- **Muss geprüft werden:** Ist das sinnvoll? Oder soll Wokwi sich identisch zum echten ESP verhalten (für realistische Tests)?
- Wokwi-Configs (diagram.json Sensoren, Build-Flags, ESP_ID) müssen gegen Server-Expectations geprüft werden

---

## Verifikationsbereich A: ESP/Wokwi → Server (Firmware-Seite)

**Agents:** verify-plan + esp32-dev
**Fokus:** Alles was auf dem ESP passiert, von Boot bis MQTT-Kommunikation

### A.1 Captive Portal Recovery – Vollständige Fehlermatrix

Jede Kombination durchgehen und den **exakten Code-Pfad** dokumentieren:

| # | Szenario | Erwartetes Verhalten | Code-Pfad prüfen |
|---|----------|---------------------|-------------------|
| 1 | Frisch geflasht, keine NVS-Config | Portal öffnet sich | main.cpp Provisioning-Check |
| 2 | WiFi-Credentials falsch | Verbindung fehlschlägt → Portal → NVS löschen | WiFi-Recovery in main.cpp |
| 3 | WiFi OK, MQTT-Port falsch, **noch nie verbunden** | MQTT-Connect fehlschlägt → Portal → NVS löschen | Phase-1-Code in main.cpp setup() |
| 4 | WiFi OK, Server-IP nicht erreichbar, **noch nie verbunden** | MQTT-Connect fehlschlägt → Portal → NVS löschen | Phase-1-Code in main.cpp setup() |
| 5 | WiFi OK, MQTT OK, Broker lehnt Verbindung ab | MQTT-Connect fehlschlägt → Portal → NVS löschen | Phase-1-Code in main.cpp setup() |
| 6 | Alles OK, ESP läuft normal, Broker geht kurz offline (< 5 Min) | Circuit Breaker macht Retry, lokal weiterarbeiten, KEIN Portal | Circuit Breaker + Phase-1 Runtime-Timer |
| 7 | Alles OK, ESP läuft normal, Broker geht lang offline (> 5 Min) | Lokal weiterarbeiten, Portal anbieten OHNE Config zu löschen | Phase-1 Runtime-Code – **HIER IST DAS PROBLEM** |
| 8 | WiFi geht kurz weg und kommt wieder | WiFi-Reconnect, MQTT-Reconnect, normaler Betrieb | WiFi-Manager Reconnect |
| 9 | WiFi geht dauerhaft weg | Portal öffnen | WiFi-Recovery |
| 10 | Wokwi-Build, MQTT-Broker nicht gestartet | Klarer Error, kein Portal (nutzlos in Simulation) | Wokwi-Guards |

**Für jedes Szenario dokumentieren:**
- Exakter Code-Pfad (Datei:Zeile → Datei:Zeile → ...)
- Was passiert mit NVS? Wird gelöscht, behalten, markiert?
- Was passiert mit lokalen Funktionen? (Sensoren, Aktuatoren, Logging)
- Was sieht der User? (LED-Codes, Serial-Output)
- Was sieht der Server? (Heartbeat-Ausfall, Status-Änderung)

### A.2 Circuit Breaker Auswirkung auf lokale Funktionen

**Zentraler Prüfpunkt:** Der Circuit Breaker schützt MQTT-Reconnect vor Überlastung. Aber was passiert mit dem Rest des ESP wenn MQTT im OPEN-State ist?

Zu prüfen:
1. **main.cpp Loop-Struktur:** Werden Sensor-Reads, Aktuator-Updates, Logging unabhängig von MQTT-Status ausgeführt? Oder gibt es Abhängigkeiten die alles blockieren?
2. **Sensor-Manager:** Liest der Sensor-Manager weiter wenn MQTT nicht verbunden ist? Werden Werte lokal gepuffert?
3. **Aktuator-Manager:** Halten Aktuatoren ihren letzten State? Funktionieren lokale Commands (Emergency)?
4. **Heartbeat:** Wird der Heartbeat-Timer weiter gezählt oder pausiert er bei MQTT-Fehler?
5. **Die bestehende Code-Struktur sieht lokale Weiterarbeit vor** – das muss verifiziert werden, nicht angenommen

### A.3 Unterscheidung: "Config falsch" vs. "Service temporär weg"

Prüfen ob der Code unterscheiden kann zwischen:
- **Erstverbindung fehlgeschlagen** (nach frischem Provisioning → Config wahrscheinlich falsch)
- **War verbunden, Verbindung verloren** (transient → Config ist korrekt, Service-Problem)

Mögliches Kriterium: Existiert ein Flag oder NVS-Eintrag der speichert ob die MQTT-Verbindung jemals erfolgreich war? Wenn ja, wo? Wenn nein, wie aufwändig wäre es das einzubauen?

Der Phase-1-Code behandelt aktuell beide Fälle gleich (NVS löschen). Das ist für Fall 1 richtig und für Fall 2 falsch.

### A.4 Wokwi Systemkonformität

Prüfen ob Wokwi sich nach dem Config-Bypass identisch zum echten ESP verhält:
1. **MQTT-Topics:** Sendet Wokwi dieselben Topics wie der echte ESP? Gleiche Payloads?
2. **Heartbeat:** Gleiche Frequenz, gleiches Format?
3. **Sensor-Daten:** Wokwi diagram.json definiert DS18B20, DHT22, Potentiometer – werden die korrekt gelesen und über MQTT gesendet?
4. **Server-Erwartungen:** Erwartet der Server bestimmte Felder im Heartbeat die Wokwi nicht liefert?
5. **Seed-Kompatibilität:** `seed_wokwi_esp.py` legt `ESP_00000001` an – matcht das mit dem Wokwi Build-Flag `WOKWI_ESP_ID`?
6. **Config-Push:** Wenn Server Config an Wokwi-ESP schickt, verarbeitet der Wokwi-ESP sie korrekt?

### Report zurück an
`.technical-manager/inbox/agent-reports/verification-A-esp-firmware-YYYY-MM-DD.md`

---

## Verifikationsbereich B: Server → DB → Frontend (Backend-Seite)

**Agents:** verify-plan + server-dev + db-inspector
**Fokus:** Alles was der Server mit den Daten macht, DB-Konsistenz, Frontend-Anbindung

### B.1 Device-Lifecycle State-Machine in DB

Den kompletten State-Flow durchgehen und an **jeder Stelle** prüfen ob der Code das tut was er soll:

```
                                    ┌─────────────┐
                              ┌────→│  rejected   │←────────────────────┐
                              │     └──────┬──────┘                     │
                              │            │ Heartbeat                  │ Reject-
                              │            │ (Rediscovery)              │ Endpoint
                              │            ↓                            │
┌──────────┐    ┌─────────────┴───┐    ┌──────────┐    ┌────────┐      │
│ (unknown)│───→│ pending_approval│───→│ approved │───→│ online │──────┘
└──────────┘    └─────────────────┘    └──────────┘    └────────┘
   Heartbeat    Admin: Approve              │ Heartbeat    Normal
   Discovery    (auch von rejected!)        │ nach Approv. Betrieb
                                            │                │
                                            ↓                ↓
                                       ┌─────────┐     ┌─────────┐
                                       │ rejected │     │ offline │
                                       └─────────┘     └────┬────┘
                                       Reject-Endpoint      │
                                                            │ Heartbeat
                                                            ↓
                                                       ┌────────┐
                                                       │ online │
                                                       └────────┘

Vollständige Übergänge:
- (unknown) → pending_approval     [Heartbeat-Handler: neues Device]
- pending_approval → approved      [Approve-Endpoint, esp.py:1132]
- pending_approval → rejected      [Reject-Endpoint]
- rejected → pending_approval      [Heartbeat-Handler: Rediscovery, heartbeat_handler.py:151]
- rejected → approved              [Approve-Endpoint, esp.py:1132]
- approved → online                [Heartbeat nach Approval]
- approved → rejected              [Reject-Endpoint, esp.py:1244]
- online → offline                 [Heartbeat-Timeout]
- online → rejected                [Reject-Endpoint, esp.py:1244]
- offline → online                 [Heartbeat von zuvor offline Device, heartbeat_handler.py:205-209]
```

**Für JEDEN Übergang prüfen:**
- Welcher Handler/Endpoint setzt den Status? (Datei:Zeile)
- Wird der Übergang validiert? (z.B. `pending_approval` ODER `rejected` → `approved` via esp.py:1132, nicht von `offline` → `approved`)
- Was passiert bei ungültigen Übergängen? (z.B. Heartbeat für rejected Device)
- Werden `approved_at`, `approved_by`, `rejection_reason`, `last_rejection_at` korrekt gesetzt/gelöscht?

### B.2 Sensor/Aktuator Config-Lifecycle in DB

```
┌─────────┐    ┌──────────────┐    ┌─────────┐
│ (create)│───→│   pending    │───→│ applied │
└─────────┘    └──────┬───────┘    └─────────┘
  API-Call       DB-Default        ESP bestätigt
                      │            config_handler
                      ↓
                 ┌─────────┐
                 │ failed  │
                 └─────────┘
                 ESP meldet Fehler
```

**Für JEDEN Schritt prüfen:**
1. **Create/Update Sensor:** Wird `config_status = "pending"` gesetzt? Werden alte Fehler gelöscht (`config_error = None`)?
2. **MQTT-Push an ESP:** Wird die Config korrekt über MQTT an den ESP geschickt?
3. **ESP-Antwort "success":** Ruft `_mark_config_applied()` auf? Setzt `config_status = "applied"`? Für alle Configs des ESP oder nur die betroffene?
4. **ESP-Antwort "error":** Setzt `config_status = "failed"`, `config_error`, `config_error_detail`? Korrekte Werte?
5. **ESP-Antwort "partial_success":** Erst `applied`, dann failures überschreiben? Reihenfolge korrekt?
6. **Guard:** Config-Endpoints prüfen ob Device `approved` oder `online` ist? HTTP 403 wenn nicht?
7. **Kein ESP-Antwort** (Timeout): Was passiert? Bleibt `config_status = "pending"` stehen? Gibt es einen Timeout-Mechanismus?

### B.3 DB-Schema-Validierung

db-inspector soll prüfen:
1. **Status-Werte:** Sind alle gültigen Status-Werte in Code und DB konsistent? (Enum/Constraint vorhanden?)
2. **Constraints:** Gibt es DB-Level-Constraints die ungültige States verhindern? (z.B. `approved_at` NOT NULL wenn status = `approved`)
3. **Orphaned Records:** Gibt es Sensor/Aktuator-Configs für Devices die `rejected` oder nie `approved` wurden?
4. **Migration-Status:** Alle Felder in DB vorhanden? Keine ausstehenden Migrationen?
5. **Default-Werte:** `config_status` Default = `"pending"` – stimmt das im Schema überein?

### B.4 Frontend-Anbindung

Prüfen ob das Frontend die neuen DB-States korrekt darstellt:
1. **Device-Liste:** Zeigt `pending_approval` Devices korrekt? Approve/Reject-Buttons funktional?
2. **Sensor/Aktuator-Anzeige:** Zeigt `config_status` an? Unterscheidet `pending`, `applied`, `failed`?
3. **API-Responses:** Liefern die erweiterten Schemas (`config_status`, `config_error`) korrekte Daten?
4. **Types:** Frontend-Types (`MockSensor`, `MockActuator`, `MockESP`) matchen Server-Schemas?
5. **WebSocket-Events:** `device_approved`, `config_response` – werden sie gesendet und im Frontend verarbeitet?

### B.5 Legacy Discovery-Handler

Phase 2 hat den Discovery-Handler auf `pending_approval` korrigiert. Prüfen:
1. Ist der Handler wirklich DEPRECATED und sollte entfernt werden?
2. Gibt es noch Code-Pfade die ihn nutzen?
3. Wenn ja: Funktioniert `pending_approval` dort korrekt?
4. Empfehlung: Entfernen oder behalten?

### Report zurück an
`.technical-manager/inbox/agent-reports/verification-B-server-db-frontend-YYYY-MM-DD.md`

---

## Phasen-Übergreifende Prüfpunkte

### End-to-End-Flow Validierung

Die Agents sollen neben ihrem Fokusbereich auch die **Schnittstellen** zum anderen Bereich prüfen:

**Bereich A prüft zusätzlich:**
- ESP Heartbeat-Payload: Enthält es alle Felder die der Server erwartet? (`esp_id`, `ts`, `uptime`, `heap_free`/`free_heap`, `wifi_rssi`, `sensor_count`, `actuator_count`, `gpio_status`, `gpio_reserved_count`) – Achtung: `firmware_version` und `hardware_type` sind NICHT im Heartbeat, sondern nur im Legacy-Discovery-Payload
- MQTT-Topic-Format: Stimmt `kaiser/god/esp/{esp_id}/system/heartbeat` überein? (Kein `ao/`-Prefix – existiert nicht im System)
- Config-Response-Format: Wenn Server Config schickt und ESP antwortet – stimmt das Payload-Format?

**Bereich B prüft zusätzlich:**
- Server Heartbeat-Handler: Verarbeitet er alle Felder die der ESP sendet?
- Server Config-Push: Schickt er das Format das der ESP erwartet?
- Timeout-Verhalten: Was passiert server-seitig wenn ESP nicht antwortet? Gibt es Timeout-Mechanismen für `config_status = "pending"`?

### Konsistenz zwischen echtem ESP und Wokwi

Beide Verification-Bereiche sollen bei ihrer Analyse notieren:
- Stellen wo Wokwi sich anders verhält als der echte ESP
- Ob diese Unterschiede gewollt sind (z.B. kein Watchdog) oder problematisch (z.B. fehlende Felder im Heartbeat)
- Ob Wokwi-Tests die Server-Logik vollständig exercisen oder ob es blinde Flecken gibt

---

## Zusammenfassung: Was die Agents tun sollen

| Bereich | Agents | Kern-Aufgabe |
|---------|--------|-------------|
| **A** | verify-plan + esp32-dev | Fehlermatrix für alle Szenarien (10 Fälle). Circuit Breaker vs. lokale Funktionen. "Config falsch" vs. "Service weg" Unterscheidung. Wokwi-Systemkonformität. |
| **B** | verify-plan + server-dev + db-inspector | Device State-Machine validieren. Sensor/Aktuator Config-Lifecycle. DB-Constraints + Schema. Frontend-Anbindung. Legacy Handler. |

**Output pro Bereich:** IST-Zustand mit Code-Referenzen. SOLL-Zustand gegenübergestellt. Konkrete Findings: Was funktioniert, was nicht, was muss angepasst werden. Implementierungsvorschläge wo nötig.

**Explizit KEIN neuer Code.** Analyse und Verifikation. Wo Anpassungen nötig sind: exakte Stelle benennen, Änderung beschreiben, Aufwand schätzen.
