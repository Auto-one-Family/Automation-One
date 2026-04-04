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
