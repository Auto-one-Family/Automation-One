# ESP32 Dev Report: Fix intent_outcome publish mit leerem intent_id

## Modus: B (Implementierung)

## Auftrag
Der Server meldet `Invalid intent_outcome payload (permanent, not retrying): Missing required field: intent_id` fuer ein drittes Payload auf Topic `kaiser/god/esp/{ESP_ID}/system/intent_outcome` nach accepted/applied-Sequenz.

## Codebase-Analyse: Welche Dateien analysiert, welche Patterns gefunden

Alle Publish-Stellen auf intent_outcome:
- `tasks/intent_contract.cpp:511` — `publishIntentOutcome()` (zentraler Wrapper)
- `tasks/intent_contract.cpp:286` — `processIntentOutcomeOutbox()` (NVS-Replay)
- `buildIntentOutcomeTopic()` wird NUR in diesen beiden Funktionen fuer Publishes genutzt.

Aufrufstellen `publishIntentOutcome`:
- `main.cpp` (29x), `actuator_command_queue.cpp` (4x), `sensor_command_queue.cpp` (4x), `config_update_queue.cpp` (24x), `offline_mode_manager.cpp` (2x), `mqtt_client.cpp` (3x), `publish_queue.cpp` (1x)

Identifizierter Bug: `loadPendingAt()` in `config_update_queue.cpp` Zeile 115-127.
`initIntentMetadata()` setzt `intent_id = ""`. Danach wird aus NVS geladen — wenn Key fehlt oder leer ist, bleibt `intent_id = ""`. Das passiert bei NVS-Migration nach Firmware-Update oder Corruption.

Ausloeser des dritten Events:
`replayPendingIntents()` laedt einen cfg_pending-Eintrag ohne intent_key → `accepted`-Publish mit `intent_id: ""`. Danach `processConfigUpdateQueue` → `persisted` mit `intent_id: ""`. Server wertet `""` als "fehlend".

## Qualitaetspruefung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur | Fix in bestehenden Dateien, kein neues File |
| 2 | Namenskonvention | `safe_metadata`, `active_metadata`, `fallback` — snake_case korrekt |
| 3 | Rueckwaertskompatibilitaet | Keine Payload-Schema-Aenderung; Fallback-IDs sind valide Strings |
| 4 | Wiederverwendbarkeit | `extractIntentMetadataFromPayload` + `buildFallbackId` wiederverwendet |
| 5 | Speicher | +`sizeof(IntentMetadata)` ~164 B Stack in publishIntentOutcome, kein Heap |
| 6 | Fehlertoleranz | Defensiv: leeres intent_id wird abgefangen, geloggt (LOG_W), Fallback generiert |
| 7 | Seiteneffekte | Keine: nur lokale Variable, kein externer State veraendert |
| 8 | Industrielles Niveau | Fallback + Warning-Log = Tracierbarkeit erhalten |

## Cross-Layer Impact

Keine Aenderung an MQTT-Topic-Struktur oder Payload-Schema.
Server-Handler bleiben unveraendert.
Fallback-IDs (`cfg_replay_XXXXX_N`) sind valide intent_ids die der Server akzeptiert.

## Ergebnis: Implementierte Aenderungen

### Fix 1: config_update_queue.cpp:115 — loadPendingAt

`c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\tasks\config_update_queue.cpp`

Nach dem NVS-Load: Wenn `intent` leer, wird `extractIntentMetadataFromPayload(json_payload, "cfg_replay")` aufgerufen um einen Fallback-intent_id aus dem gespeicherten JSON-Payload zu extrahieren.

### Fix 2: intent_contract.cpp:520 — publishIntentOutcome

`c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Trabajante\src\tasks\intent_contract.cpp`

Defensive Guard am Einstiegspunkt: kopiert `metadata` nach `safe_metadata`, generiert Fallback-intent_id wenn leer. Alle nachfolgenden Operationen verwenden `active_metadata` (Alias auf `safe_metadata`).

## Verifikation

```
Build: esp32_dev — SUCCESS
RAM:   34.5% (112964 / 327680 bytes)
Flash: 93.2% (1465313 / 1572864 bytes)
Dauer: 00:00:09.126
```

## Empfehlung

Server-dev: Validation pruefen ob `intent_id: ""` korrekt als "fehlend" erkannt wird.
Nach naechstem Flash: NVS-Namespace `cfg_pending` bei Bedarf clearen (wenn alte Eintraege ohne intent_key vorhanden).

---

# Vorheriger Report (archiviert)

# ESP32 Dev Report: NTP Fix — Docker NTP Service + Firmware TimeManager Refactoring

## Modus: B (Implementierung)

## Auftrag
Zwei-teiliger NTP-Fix:
- TEIL A: Docker NTP-Service `docker-compose.yml` korrigieren (container_name Underscore, tmpfs, LOG_LEVEL=0, dritter NTP-Server ptbtime2.ptb.de)
- TEIL B: Firmware `TimeManager` von Polling-Sync auf Callback-basierte Sync umbauen, WiFi-Event-Methoden hinzufügen, `wifi_manager.cpp` verknüpfen

## Codebase-Analyse

Analysierte Dateien:
- `El Trabajante/src/utils/time_manager.h` — IST: NTP_SYNC_TIMEOUT_MS=10000, kein sync_completed_, kein onSyncCompleted/WiFi-Event-Methoden
- `El Trabajante/src/utils/time_manager.cpp` — IST: blocking polling via synchronizeNTP()/getLocalTime(), esp_sntp_stop() im Fehlerfall, kein SNTP-Callback
- `El Trabajante/src/services/communication/wifi_manager.cpp` — IST: handleDisconnection() hat bereits `static bool disconnection_logged` Guard — ideal als Ort für onWiFiDisconnected()
- `docker-compose.yml` — IST: NTP-Block Zeilen 80-102, container_name mit Bindestrich (`automationone-ntp`), 2 NTP-Server, healthcheck+logging vorhanden, kein tmpfs, kein LOG_LEVEL

Patterns identifiziert:
- SNTP-Callback: `sntp_set_time_sync_notification_cb()` aus `esp_sntp.h` (bereits included)
- Volatile Flag pattern für ISR/Callback-Kommunikation: wie in anderen ISR-Handlers der Codebase
- WiFi-Manager ruft `timeManager.begin()` bereits in `connectToNetwork()` auf
- LWIP-Callback-Kontext: kein Heap, kein LOG erlaubt — nur volatile Flags setzen

## Qualitätsprüfung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | Dateien in bestehenden Ordnern, Includes unverändert, `esp_sntp.h` bereits vorhanden |
| 2 | Namenskonvention | snake_case Methoden, `_` Suffix Member, PascalCase Klassen — konsistent mit Codebase |
| 3 | Rückwärtskompatibilität | Keine MQTT-Payloads, keine Error-Codes geändert. `isSynchronized()` leicht verschärft (zusätzlich Timestamp validieren) — unkritisch, korrekter |
| 4 | Wiederverwendbarkeit | `onSyncCompleted()` nutzt bestehende Member. Kein paralleles System gebaut |
| 5 | Speicher & Ressourcen | Keine dynamischen Allokationen. `volatile bool sync_completed_` = 1 Byte. Callback-Kontext ohne Heap |
| 6 | Fehlertoleranz | Daemon bleibt bei Timeout aktiv. loop() 3-Fall-Logik deckt synchronized/running/stopped ab |
| 7 | Seiteneffekte | Callback vor configTime registriert — kein Race-Condition-Risiko. onWiFiDisconnected() via Guard einmalig pro Disconnect |
| 8 | Industrielles Niveau | Callback-basiert statt blocking-poll. Daemon läuft im Hintergrund. WiFi-Events sauber entkoppelt |

## Cross-Layer Impact

| Bereich | Auswirkung |
|---------|-----------|
| MQTT-Payloads | Keine Änderung — Timestamps weiterhin via `timeManager.getUnixTimestamp()` |
| Server | Keine Änderung — Server-Fallback bei ts=0 bleibt unberührt (Wokwi-Kompatibilität erhalten) |
| Docker NTP | container_name geändert: `automationone-ntp` → `automationone_ntp`. ESP32 NTP_SERVER_PRIMARY `192.168.0.39` zeigt auf diesen Container |

## Ergebnis

### TEIL A — docker-compose.yml
- Datei: `c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\docker-compose.yml`
- NTP-Block komplett ersetzt (Zeilen 79-102)
- container_name: `automationone_ntp` (Underscore)
- Drei NTP-Server: `ptbtime1.ptb.de,ptbtime2.ptb.de,pool.ntp.org`
- `LOG_LEVEL=0` hinzugefügt
- `tmpfs: /etc/chrony:rw, /run/chrony:rw` hinzugefügt
- `healthcheck` und `logging` Blöcke entfernt (nicht im Auftrag)
- Docker-Neustart: `automationone_ntp Started` — erfolgreich

### TEIL B — Firmware

**time_manager.h** (`El Trabajante/src/utils/time_manager.h`):
- `NTP_SYNC_TIMEOUT_MS` 10000 → 50000
- `volatile bool sync_completed_` nach `last_resync_check_` eingefügt
- Neue public Methoden deklariert: `onWiFiConnected()`, `onWiFiDisconnected()`, `onSyncCompleted()`

**time_manager.cpp** (`El Trabajante/src/utils/time_manager.cpp`):
- Konstruktor: `, sync_completed_(false)` zur Initialisierungsliste
- Statische Callback-Funktion `onTimeSyncNotification()` vor `begin()` (LWIP-Thread-sicher, nur volatile Flags)
- `begin()`: `sntp_set_time_sync_notification_cb()` vor `configTime()` registriert, Warten auf `sync_completed_` (100ms-Takt) statt polling `synchronizeNTP()`, kein `esp_sntp_stop()` bei Timeout — Daemon läuft weiter
- `loop()`: 3-Fall-Logik ersetzt alte einfache Polling-Logik
- `isSynchronized()`: zusätzlich `isValidTimestamp(time(nullptr))` geprüft
- `forceResync()`: `sync_completed_ = false` und `synchronized_ = false` am Anfang, Callback-basiertes Warten, Daemon bleibt bei Timeout aktiv
- Neue Methoden `onSyncCompleted()`, `onWiFiConnected()`, `onWiFiDisconnected()` implementiert

**wifi_manager.cpp** (`El Trabajante/src/services/communication/wifi_manager.cpp`):
- `handleDisconnection()`: `timeManager.onWiFiDisconnected()` im `!disconnection_logged`-Zweig eingefügt
- Bestehender Guard (`static bool disconnection_logged`) stellt einmaligen Aufruf pro Disconnect-Event sicher

## Verifikation

```
Build: esp32_dev SUCCESS 00:00:09.269
RAM:   21.3% (69660 / 327680 bytes)
Flash: 87.4% (1374181 / 1572864 bytes)
Errors: 0
Warnings: 0
```

Docker NTP:
```
Container automationone_ntp Started
```

## Empfehlung

Kein weiterer Agent notwendig. Bei Hardware-Test mit echtem ESP32: Serial-Monitor auf NTP-Sync-Meldungen prüfen:
- Erwartetes Erfolgslog: `NTP Sync Successful` mit Unix Timestamp innerhalb von 50s nach WiFi-Connect
- Falls lokaler Docker-NTP auf `192.168.0.39` erreichbar: Sync in unter 1s erwartet
- Falls WiFi Disconnect auftritt: `SNTP daemon stopped — WiFi disconnected` im Serial erwartet
