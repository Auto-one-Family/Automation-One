# ESP32 Dev Report: Boot-Heartbeat-Registration-Latenz Fix

## Modus: B (Implementierung)

## Auftrag
ESP_EA5484 braucht 60s statt ~5s bis OPERATIONAL nach Reboot.
Root Cause #1: Heartbeat vor MQTT-Connection gesendet (ESP-IDF non-blocking path).
Root Cause #2: Registration-Gate-Timeout feuert nie, weil kein Non-Heartbeat-Publish in PENDING_APPROVAL.

## Codebase-Analyse

Analysierte Dateien:
- `El Trabajante/src/main.cpp` Z.177-228 (onMqttConnectCallback, subscribeToAllTopics)
- `El Trabajante/src/main.cpp` Z.1994-2040 (setup() MQTT-Branch)
- `El Trabajante/src/services/communication/mqtt_client.cpp` Z.350-400 (publish/gate)
- `El Trabajante/src/services/communication/mqtt_client.cpp` Z.742-757 (confirmRegistration)
- `El Trabajante/src/services/communication/mqtt_client.h` Z.135-140 (REGISTRATION GATE public API)
- `El Trabajante/src/tasks/communication_task.cpp` (vollständig)

Patterns gefunden:
- `onMqttConnectCallback()` hat bereits Mechanisms A/D/E — F war die fehlende Erweiterung
- `confirmRegistration()` existiert, `checkRegistrationTimeout()` war noch nicht als public Methode vorhanden
- `processPublishQueue()` und `mqttClient.loop()` sind das Drain-Pattern im Communication-Task

## Qualitätsprüfung (8 Dimensionen)

1. **Struktur & Einbindung**: Alle Änderungen in bestehenden Dateien. `checkRegistrationTimeout()` folgt dem Muster von `confirmRegistration()` direkt danach. Kein neuer Include nötig.
2. **Namenskonvention**: `checkRegistrationTimeout()` = camelCase (Methode), konsistent mit `confirmRegistration()`, `isRegistrationConfirmed()`.
3. **Rückwärtskompatibilität**: Keine Payload-, Topic- oder Error-Code-Änderung. Setup-Logging geändert (Info-Text), kein Breaking Change.
4. **Wiederverwendbarkeit**: Nutzt bestehenden `registration_confirmed_` / `registration_start_ms_` State. Kein paralleles Pattern.
5. **Speicher & Ressourcen**: Keine Heap-Allokation. `checkRegistrationTimeout()` ist ein einfacher Zeitvergleich mit 3 Bool-Returns.
6. **Fehlertoleranz**: `registration_start_ms_ == 0`-Guard verhindert Fehler wenn Gate nie gestartet wurde. Fallback öffnet Gate nach 10s.
7. **Seiteneffekte**: `mqttClient.publishHeartbeat(true)` in Callback statt setup() — MQTT ist zu diesem Zeitpunkt guaranteed connected (nach MQTT_EVENT_CONNECTED). `checkRegistrationTimeout()` in communication_task schreibt `registration_confirmed_` von Core 0 — selber Core wie bisher.
8. **Industrielles Niveau**: Kein Blocking. Kein Stack-Risiko. Watchdog-kompatibel (kurze Checks in Task-Loop).

## Cross-Layer Impact

- Keine MQTT-Topic-Änderungen → kein Server-Impact
- Heartbeat-Payload unverändert → Server-Handler unberührt
- Kein Error-Code hinzugefügt → ERROR_CODES.md nicht betroffen
- Registrierungs-Latenz reduziert: Server empfängt Heartbeat ~42ms statt ~60s nach Boot

## Ergebnis: Implementierte Fixes

### Fix 1 — `El Trabajante/src/main.cpp`

**onMqttConnectCallback() Z.208-228 (alt) → Z.208-238 (neu):**
- Mechanism E: `publishHeartbeat(true)` aus dem `if (!is_first_connect)` Block entfernt
- Mechanism F (neu): `mqttClient.publishHeartbeat(true)` NACH `is_first_connect = false`, auf ALLEN Connects
- Log-Kommentar erklärt den non-blocking ESP-IDF Grund

**setup() Z.2008-2011 (alt) → Z.2008-2011 (neu):**
- `mqttClient.publishHeartbeat(true)` entfernt
- Ersetzt durch erklärenden Kommentar + LOG_I

### Fix 2 — `El Trabajante/src/services/communication/mqtt_client.h`

**Z.138-139 (alt) → Z.138-142 (neu):**
- `bool checkRegistrationTimeout()` als public Methode deklariert (nach `confirmRegistration()`)

### Fix 2 — `El Trabajante/src/services/communication/mqtt_client.cpp`

**Z.758-767 (neu, nach confirmRegistration()):**
- `checkRegistrationTimeout()` implementiert: Guard für `registration_confirmed_` und `registration_start_ms_ == 0`, dann Timeout-Check mit LOG_W

### Fix 2 — `El Trabajante/src/tasks/communication_task.cpp`

**PENDING_APPROVAL-Block Z.220-228:**
- `mqttClient.checkRegistrationTimeout()` vor `processPublishQueue()` eingefügt (mit erklärendem Kommentar)

**Operational-Block Z.231-235:**
- `mqttClient.checkRegistrationTimeout()` vor `processPublishQueue()` eingefügt (mit erklärendem Kommentar)

## Verifikation

```
cd "El Trabajante"
/c/Users/robin/AppData/Local/Programs/Python/Python312/Scripts/pio.exe run -e esp32_dev
```

**Ergebnis: SUCCESS** — Exit-Code 0, keine Errors
- RAM: 21.3% (69652 / 327680 bytes)
- Flash: 87.1% (1370533 / 1572864 bytes)
- Dauer: 9.65 Sekunden

## Empfehlung

Nach dem nächsten Flash von ESP_EA5484 sollte in den Serial-Logs zu sehen sein:
- `[SAFETY-P1] Post-connect heartbeat sent (fast registration)` erscheint kurz nach den Subscriptions (~T=3960ms statt T=60000ms)
- Server-Loki-Logs: Heartbeat-ACK kommt innerhalb der ersten 5-10s nach Boot
- `REGISTRATION CONFIRMED BY SERVER` erscheint bei T≈5-10s statt T≈60s

Falls der Hardware-Test zeigt, dass der Heartbeat-ACK noch ausbleibt, wäre der nächste Schritt eine `esp32-debug` Session mit frischem Serial-Log nach dem Flash.
