# BERICHT: Lifecycle, Hintergrundzustand und Cross-Layer-Debug

## Steuerlauf-Kontext
- Laufmodus: `artefact_improvement`
- Run-ID: `lifecycle-background-state-crosslayer-debug-2026-04-14`
- Steuerdatei: `.claude/auftraege/auto-debugger/inbox/STEUER-lifecycle-background-state-crosslayer-debug-2026-04-14.md`
- Soll-Branch: `auto-debugger/work`
- Ist-Branch zum Laufstart: `auto-debugger/work`
- Fokus: Abmeldung/Entfernen vs. weiterlaufende Hintergrundpfade in Server, DB, Frontend, Firmware

## Kurzfazit (Evidence zuerst)
- Serverseitig laufen mehrere Hintergrundpfade nur mit globalem Shutdown-Stop (`LogicEngine`, MQTT-Subscriber, Reconnect-/Config-Tasks im Heartbeat-Handler); ein expliziter Device-/Sensor-spezifischer Cancel beim API-Delete ist nicht durchgängig sichtbar.
- Die Datenbank trennt klar zwischen Soft-Delete (`esp_devices.deleted_at`) und historischer Datenerhaltung; gleichzeitig existieren Query-Pfade ohne `deleted_at`-Filter (z. B. `SensorRepository.query_paginated`).
- Im Frontend ist die Delete-Kette für Geräte vorhanden (`HardwareView -> espStore.deleteDevice -> API`), aber der Route-Zustand kann nach Löschung auf L2 verbleiben, obwohl `selectedDevice` bereits `null` ist.
- In der Firmware blockiert das Registration-Gate Publishes bis zu einem gültigen Heartbeat-ACK; dadurch sind Handshake-Brüche klar sichtbar, aber nicht jede Widerrufsvariante ist gleichwertig instrumentiert.

## Server-Evidence (IST)
1. **Globaler Background-Task für LogicEngine**
   - `El Servador/god_kaiser_server/src/services/logic_engine.py`
   - `start()` nutzt `asyncio.create_task(self._evaluation_loop())`; `stop()` cancelt nur beim Engine-Stop.
2. **MQTT-Sensor-Ingest hängt an DB-Lookup + fire-and-forget Logic-Auswertung**
   - `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
   - Bei fehlendem ESP (`get_by_device_id`) Abbruch; bei validen Daten wird Logic-Auswertung asynchron gestartet.
3. **Heartbeat kann Soft-Delete-Tombstone wiederherstellen**
   - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
   - Wenn normales Lookup kein Gerät findet, erfolgt `include_deleted=True`; bei Tombstone wird Wiederherstellung angestoßen.
4. **Subscriber stoppt primär bei Prozess-Shutdown**
   - `El Servador/god_kaiser_server/src/mqtt/subscriber.py`
   - `_is_shutting_down` verhindert neue Verarbeitung nur im Shutdown-Fall.
5. **API-Delete soft-deletet Gerät, stoppt aber keine allgemeinen Async-Task-Lebenszyklen**
   - `El Servador/god_kaiser_server/src/api/v1/esp.py`
   - Soft-Delete + Alert-Resolve + optional Mock-Stop.
6. **Sensor-Delete räumt GPIO-bezogene Jobs/Config auf**
   - `El Servador/god_kaiser_server/src/api/v1/sensors.py`
   - Löscht SensorConfig, synchronisiert Subzone/Scheduler, pusht neue Config, sendet WS-Event.

## DB-Evidence (IST)
1. **Soft-Delete-SSOT für Geräte**
   - `El Servador/god_kaiser_server/src/db/repositories/esp_repo.py`
   - `_not_deleted()` filtert auf `deleted_at IS NULL`; `soft_delete()` setzt `deleted_at`, `deleted_by`, `status="deleted"`.
2. **Migration konserviert Historie statt Hard-Cascade**
   - `El Servador/god_kaiser_server/alembic/versions/soft_delete_devices_preserve_sensor_data.py`
   - Zeitreihen-FKs (`sensor_data`, `actuator_states`, etc.) auf `SET NULL`; `sensor_data.device_name` ergänzt.
3. **Sensor-Query-Pfad ohne Soft-Delete-Filter auf ESP**
   - `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
   - `query_paginated()` joint `ESPDevice`, filtert aber nicht explizit auf `ESPDevice.deleted_at IS NULL`.

## Frontend-Evidence (IST)
1. **Delete-Flow ist vorhanden**
   - `El Frontend/src/views/HardwareView.vue` -> `handleDelete()`
   - `El Frontend/src/stores/esp.ts` -> `deleteDevice()` -> API-Delete, anschließend lokale Listenbereinigung.
2. **Level-2 hängt an Route, Device-Objekt separat**
   - `El Frontend/src/views/HardwareView.vue`
   - `currentLevel` wird durch `route.params.espId` bestimmt; `selectedDevice` kann bereits `null` sein.
3. **WS-/Status-Cleanup vorhanden (composable-seitig)**
   - `El Frontend/src/composables/useWebSocket.ts` -> `cleanup()` in `onUnmounted()`.
4. **Kalibrierungs-WS wird beim Unmount sauber beendet**
   - `El Frontend/src/composables/useCalibrationWizard.ts` -> `cleanupWebSocketBindings()`.
5. **Event-Kette L1 Delete ist nicht überall symmetrisch dokumentiert**
   - `El Frontend/src/components/dashboard/ZonePlate.vue` definiert `device-delete`;
   - `El Frontend/src/components/dashboard/DeviceMiniCard.vue` deklariert nur `click` als `emit`.

## Firmware-Evidence (IST)
1. **Registration Gate blockiert Nicht-Heartbeat-Publishes**
   - `El Trabajante/src/services/communication/mqtt_client.cpp` -> `publish()`
   - Solange `registration_confirmed_ == false`, werden normale Publishes verworfen.
2. **Authoritative ACK-Validierung**
   - `El Trabajante/src/main.cpp` (Heartbeat-ACK Pfad)
   - `status` + `handover_epoch` müssen valide sein; erst dann `mqttClient.confirmRegistration()`.
3. **Serverstatus steuert Runtime-Übergang**
   - `approved/online` -> Richtung `STATE_OPERATIONAL`
   - `pending_approval` -> `STATE_PENDING_APPROVAL`
   - `rejected` -> `STATE_ERROR`
4. **Sensor-Command-Queue nutzt Admission-Gate pro Runtime-State**
   - `El Trabajante/src/tasks/sensor_command_queue.cpp` -> `shouldAcceptCommand(...)`

## SOLL vs IST: erwartetes Stoppsignal bei „Gerät/Sensor abgemeldet“

| Schicht | SOLL-Stopp-Signal | IST-Befund | Lücke |
|---|---|---|---|
| Server-Logic | Device-/Sensor-spezifischer Cancel oder Guard pro Tick | Primär globaler Stop/Cancel der Engine | Device-spezifischer Stop nicht durchgängig sichtbar |
| Server-MQTT-Ingest | Sofortiger Skip auf tombstoned/gelöschte IDs, inkl. eindeutiger Logmarker | ESP-Lookup-Fehler wird abgebrochen; Heartbeat kann Tombstone restaurieren | Delete-Intent vs. Re-Heartbeat kann kollidieren |
| DB | Einheitliche Filterung (`deleted_at IS NULL`) auf allen Runtime-Reads | Teilweise vorhanden, aber nicht in allen Join-Queries | Inkonsistente Sicht „aktiv vs historisch“ |
| Frontend | Nach Delete Route+Store konsistent auf L1/Liste zurückgeführt | Store bereinigt, Route kann auf L2 bleiben | UI-Zwischenzustand möglich |
| Firmware | Bei Rejection/Revocation klarer Runtime-Guard + Telemetriepfad | Rejection über ACK klar; Admission aktiv | Nicht alle Revocation-Fälle gleich granular |

## Matrix: Interner Ablauf ↔ externer Befehl/Infostrom

| # | Interner Ablauf | Externer Trigger/Flow | Source of Truth | Stop/Cancel-Bedingung (IST) | Fehlende Stop-Bedingung | Priorität |
|---|---|---|---|---|---|---|
| 1 | `LogicEngine.start()` Task | App-Startup | Prozesszustand + DB bei Evaluierung | `LogicEngine.stop()` / Shutdown | Kein device-spezifischer Cancel-Hook | P0 |
| 2 | `sensor_handler.handle_sensor_data` | MQTT Sensor-Publish | DB (`esp_devices`, `sensor_configs`) | Abbruch wenn ESP nicht gefunden | Race mit Re-Activation durch Heartbeat-Restore | P0 |
| 3 | Heartbeat Restore-Pfad | MQTT Heartbeat nach Delete | DB Tombstone (`include_deleted=True`) | Kein Restore wenn kein Tombstone | Delete-Intent wird nicht zwingend „final“ behandelt | P0 |
| 4 | Subscriber `_route_message` | MQTT Inbound | Inbound + Handler | `_is_shutting_down` nur bei Server-Shutdown | Kein „drop for deleted device“ im zentralen Dispatcher | P1 |
| 5 | `esp.py delete_device` | REST DELETE Gerät | DB Soft-Delete + Alerts | Commit nach `soft_delete` | Keine koordinierte Beendigung aller Hintergrund-Tasks | P0 |
| 6 | `sensors.py delete_sensor` | REST DELETE Sensor | DB SensorConfig + Scheduler | Entfernt Jobs/GPIO-Config bei Bedingungen | Bereits gestartete Async-Evaluationen werden nicht explizit gecancelt | P1 |
| 7 | Frontend `espStore.deleteDevice` | UI Delete + REST | Frontend Store | Entfernt Gerät lokal im `finally` | Route kann auf L2 verbleiben ohne Device | P1 |
| 8 | Frontend `useWebSocket.cleanup` | Route-/Komponentenwechsel | Composable State | `onUnmounted` cleanup | Nicht alle globalen Store-Subscriptions sind delete-scoped | P1 |
| 9 | Firmware `mqtt_client.publish` Gate | MQTT Publish-Versuch | Firmware Runtime-State | Blockt bis gültigem ACK | Kein separater Codepfad „approval revoked“ mit eigener Telemetrie | P1 |
| 10 | Firmware `processSensorCommandQueue` Admission | Sensor-Command | Runtime-State + admission | Reject bei disallowed states | Kein expliziter Bezug auf „server-seitig gelöscht“, nur State-abgeleitet | P1 |

## DB-vs-Runtime-Invarianten und Race-Szenarien

### Invarianten (Soll)
1. Ein Gerät mit `deleted_at IS NOT NULL` darf nicht als „aktiv“ in Runtime-Listen erscheinen.
2. Sensor-Processing darf keine neuen fachlichen Effekte auslösen, wenn Device/Sensor logisch entfernt ist.
3. Frontend-L2 darf nicht an einem gelöschten Gerät hängen bleiben.
4. Firmware darf ohne gültigen Server-ACK keine normalen Datenpublishes durchlassen.

### Nachgewiesene Race-/Bruchpunkte (IST)
1. **Delete vs Heartbeat-Restore**
   - API soft-deletet, späterer Heartbeat kann Tombstone wiederherstellen.
2. **Delete vs asynchron gestartete Evaluationspfade**
   - Bereits gestartete Tasks haben keinen dedizierten delete-scoped Cancel.
3. **Soft-Delete vs Query-Pfade ohne `deleted_at`-Filter**
   - Unterschiedliche Sicht auf „aktives“ Gerät/Sensor je Query.
4. **Store-Delete vs Route-L2**
   - Gerät aus Store entfernt, aber `route.params.espId` bleibt.

## Debugging-Playbook (IST-Instrumentierung zuerst)

### 1) Startpunkt: Korrelation setzen
1. Bei REST-Delete einen `request_id` erfassen (API-Gateway/Backend-Logs).
2. Im MQTT-Pfad den abgeleiteten Correlation-Kontext prüfen (`subscriber.py` erzeugt pro Nachricht eine MQTT-Correlation-ID).
3. Bei Frontend-Aktion Device-ID und Zeitfenster notieren (UI-Event -> API -> Store-Update).

### 2) Server-Check-Reihenfolge bei „Gerät weg, aber Aktivität läuft“
1. `api/v1/esp.py` prüfen: wurde `soft_delete` committed?
2. `heartbeat_handler.py` prüfen: gab es kurz danach Tombstone-Restore?
3. `sensor_handler.py` prüfen: wurden Sensor-Payloads trotz Delete weiter geliefert, und wie wurde auf fehlenden ESP reagiert?
4. `logic_engine.py` prüfen: liefen Evaluationspfade weiter, obwohl Device fachlich gelöscht sein sollte?
5. `mqtt/subscriber.py` prüfen: welche Topics wurden weiter geroutet?

### 3) DB-Check-Reihenfolge
1. `esp_devices`: `deleted_at`, `status`, `deleted_by`.
2. `sensor_configs`: sind Einträge weiterhin vorhanden/aktiv?
3. `sensor_data`: kommen neue Messpunkte nach Delete-Zeitpunkt?
4. Query-Pfade gegenprüfen, die Join ohne `deleted_at`-Filter verwenden.

### 4) Frontend-Check-Reihenfolge
1. Wurde `espStore.deleteDevice()` ausgeführt und Gerät lokal entfernt?
2. Ist Route weiterhin auf `espId` gesetzt (`currentLevel===2`)?
3. Sind WS-/Poll-Cleanups der betroffenen View/Composable aktiv geworden?
4. Reproduzierbar prüfen, ob L2 ohne `selectedDevice` hängenbleibt.

### 5) Firmware-Check-Reihenfolge
1. Heartbeat-ACK kontraktkonform (`status`, `handover_epoch`)?
2. Registration-Gate offen oder weiterhin geschlossen?
3. Admission in `sensor_command_queue` akzeptiert/rejected?
4. Runtime-State-Übergang (`PENDING_APPROVAL`, `ERROR`, `OPERATIONAL`) im selben Zeitfenster?

### 6) Loki-/Log-Filter (an vorhandene Tags/Felder angelehnt)
- Server:
  - `logic_engine` + `started|stopped`
  - `heartbeat_handler` + `restore|pending_approval|rejected|online`
  - `sensor_handler` + `ESP_DEVICE_NOT_FOUND|Saving data without config`
  - `subscriber` + `Dropping MQTT message during shutdown`
- Firmware:
  - `MQTT` + `Publish blocked (awaiting registration)`
  - `[SAFETY-P4]` + `Heartbeat ACK`
  - `DEVICE REJECTED BY SERVER`
  - `Sensor command blocked`

### 7) Fehlende Instrumentierung (messbar, minimal-invasiv)
1. Einheitlicher Logmarker `skip_deleted_device` im Server-Ingest und in Logic-Einstiegen.
2. Einheitliche Felder in kritischen Logs: `device_id`, `sensor_config_id`, `correlation_id`, `request_id`.
3. Frontend: gezielter Logeintrag, wenn Route-L2 auf nicht mehr vorhandenes Gerät zeigt.
4. Firmware: separater Outcome-Code für „approval revoked/device deleted upstream“.

## Handshake-Katalog (Soll-Übergang vs heutige Bruchstelle)

| Schritt | Erwarteter State-Übergang (SOLL) | Aktueller IST-Pfad | Mögliche Bruchstelle |
|---|---|---|---|
| Registrierung | `UNREGISTERED -> PENDING_APPROVAL` nach erstem gültigen Kontakt | Heartbeat-ACK validiert Kontrakt und öffnet Registrierung | ACK unvollständig -> Gate bleibt zu |
| Approval | `PENDING_APPROVAL -> OPERATIONAL` bei `approved/online` | `main.cpp` setzt `setDeviceApproved(true)` und ggf. `STATE_OPERATIONAL` | Verzögerte/fehlende ACK-Verarbeitung |
| Rejection | beliebiger aktiver Zustand -> `ERROR` | `status=rejected` führt zu `STATE_ERROR` | Keine feinere Revocation-Typisierung |
| Config-Push | `ACKED -> CONFIG_PENDING -> CONFIG_APPLIED` | Backend sendet nach CRUD, Firmware verarbeitet über Config-Queue | Queue voll / Contract-Fehler / stale Scope |
| Full-State nach Reconnect | `RECONNECTING -> SYNCED` | Heartbeat + Adoption/Push-Pfade im Server | Delete/restore Rennen beim gleichen Device |
| Sensor Delete | `ACTIVE_SENSOR -> REMOVED_SENSOR` ohne Ghost-Events | Backend löscht Config, pusht neue Config, WS `sensor_config_deleted` | Bereits gestartete Async-Pfade laufen noch |
| Device Delete | `ACTIVE_DEVICE -> TOMBSTONE` | Soft-Delete über API | Heartbeat-Restore kann Tombstone reaktivieren |
| Frontend Detail-View | `L2(device) -> L1(list)` nach Delete | Store löscht Gerät, Route evtl. unverändert | L2 ohne `selectedDevice` |

## P0/P1-Maßnahmenliste (chirurgisch)

### P0
1. Server: Guard/Skip-Logging für tombstoned Geräte direkt an den Eintrittspunkten von Ingest + Logic.
2. Server: klare Policy für „DELETE final“ vs „Heartbeat darf restaurieren“ (Feature-Flag/Policy-Check).
3. DB: harmonisierte Filterstrategie für aktive Geräte in allen Runtime-Queries.

### P1
1. Frontend: Auto-Route-Exit aus L2, wenn `selectedDevice === null`.
2. Frontend: konsistente Event-Definition für Delete zwischen ZonePlate und Kartenkomponenten.
3. Firmware: zusätzliche Outcome-Telemetrie für serverseitig widerrufene/gelöschte Kontexte.

## Nächste Schritte (Rollen-Handoff)
1. `server-dev`: P0-Guards + Restore-Policy.
2. `frontend-dev`: L2-Route-Guard + Event-Konsistenz.
3. `mqtt-dev`: Correlation-/Skip-Felder im MQTT-Ingest konsolidieren.
4. `esp32-dev`: revocation-spezifische Diagnosecodes im bestehenden Admission/Outcome-Muster.

