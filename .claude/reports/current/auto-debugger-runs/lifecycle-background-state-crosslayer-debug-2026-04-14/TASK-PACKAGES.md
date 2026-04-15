# TASK-PACKAGES

Run-ID: `lifecycle-background-state-crosslayer-debug-2026-04-14`  
Basis: `docs/analysen/BERICHT-lifecycle-background-state-handshake-crosslayer-debug-2026-04-14.md`

## PKG-01 (server-dev): Delete-Guard + Restore-Policy
- **Ziel:** Klar trennen zwischen legitimer Re-Discovery und expliziter Löschung.
- **Scope:**
  - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`
  - `El Servador/god_kaiser_server/src/api/v1/esp.py`
  - `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- **Änderungen (chirurgisch):**
  1. Strukturierte Skip-/Restore-Logs mit `device_id`, `correlation_id`.
  2. Policy-Check im Restore-Pfad (konfigurierbar/fallback-sicher), damit Delete-Intent bewusst behandelt wird.
  3. Guard im Sensor-Ingest, der tombstoned Kontexte explizit markiert.
- **Tests:**
  - Unit/Integration für Delete -> Heartbeat Verhalten.
  - Regression für normale Reconnect-Pfade ohne Delete.
- **Akzeptanzkriterien:**
  - Kein Breaking Change an MQTT/REST/WS Contracts.
  - Neue Logs sind eindeutig filterbar.
  - Änderungen und Commits nur auf `auto-debugger/work`.

## PKG-02 (server-dev): Runtime-Filter-Konvention bei Soft-Delete
- **Ziel:** Einheitliche „aktiv“-Sicht auf Geräte in Runtime-Queries.
- **Scope:**
  - `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
  - ggf. angrenzende Repositories/Service-Reads
- **Änderungen (chirurgisch):**
  1. Festlegen und anwenden, welche Query-Pfade `deleted_at IS NULL` erzwingen.
  2. Falls einzelne Endpunkte Historie brauchen, explizit als `include_deleted` markieren.
- **Tests:**
  - Query-Verhalten mit soft-deleted device.
  - API-Regressionen für bestehende Listen-Endpunkte.
- **Akzeptanzkriterien:**
  - Dokumentierte Filterlogik pro Pfad.
  - Keine unbeabsichtigte Änderung historischer Reports.
  - Änderungen und Commits nur auf `auto-debugger/work`.

## PKG-03 (frontend-dev): Route-Schutz nach Device-Delete
- **Ziel:** Kein L2-Leerzustand nach Löschung eines Geräts.
- **Scope:**
  - `El Frontend/src/views/HardwareView.vue`
  - optional `El Frontend/src/stores/esp.ts` (nur falls nötig)
- **Änderungen (chirurgisch):**
  1. Watch/Guard: Wenn `currentLevel===2` und `selectedDevice===null`, navigation zurück auf L1.
  2. Debug-Log für diesen Transition-Fall.
- **Tests:**
  - Unit-Test/Component-Test für Delete auf L2.
- **Akzeptanzkriterien:**
  - Keine visuellen Regressionen in L1/L2 Navigation.
  - Guard greift nur beim fehlenden Device.
  - Änderungen und Commits nur auf `auto-debugger/work`.

## PKG-04 (frontend-dev): Delete-Event-Kette konsolidieren
- **Ziel:** Konsistente Delete-Events zwischen ZonePlate und Device-Karten.
- **Scope:**
  - `El Frontend/src/components/dashboard/ZonePlate.vue`
  - `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
  - eventuell angrenzende Card/Wrapper-Komponenten
- **Änderungen (chirurgisch):**
  1. Event-Contract vereinheitlichen (`delete`/`device-delete`), kein stilles Divergieren.
  2. Bestehende Handler in `HardwareView` unverändert anschließbar halten.
- **Tests:**
  - Event-Emissionstests.
  - Klickpfad „Gerät löschen“ aus L1.
- **Akzeptanzkriterien:**
  - Eindeutige Emit-Signaturen.
  - Keine Doppeltrigger.
  - Änderungen und Commits nur auf `auto-debugger/work`.

## PKG-05 (esp32-dev + mqtt-dev): Revocation-Diagnose ergänzen
- **Ziel:** Revocation/Upstream-Delete besser von generischer Rejection unterscheidbar machen.
- **Scope:**
  - `El Trabajante/src/main.cpp`
  - `El Trabajante/src/services/communication/mqtt_client.cpp`
  - `El Trabajante/src/tasks/sensor_command_queue.cpp`
- **Änderungen (chirurgisch):**
  1. Outcome-Code/Logpfad für Widerrufsszenarien im bestehenden Admission/Intent-Muster.
  2. Zusätzliche Felder für Korrelation in relevanten Logs.
- **Tests:**
  - Simulationstest für ACK-Status-Übergänge.
  - Queue-/Admission-Outcome-Assertions.
- **Akzeptanzkriterien:**
  - Keine Änderung an Topic-Taxonomie.
  - Fail-closed Verhalten bleibt erhalten.
  - Änderungen und Commits nur auf `auto-debugger/work`.

## Paket-Reihenfolge und Abhängigkeiten
1. PKG-01
2. PKG-02 (kann parallel zu PKG-01 vorbereitet, aber erst nach dessen Policy-Klarheit finalisiert werden)
3. PKG-03 und PKG-04 (parallel möglich)
4. PKG-05 (nach Server-Policy-Festlegung, damit Semantik konsistent bleibt)

## Offene BLOCKER
- Produktive Restore-Policy (business-seitig): „Delete final“ vs. „Auto-Restore erlauben“ muss festgelegt sein.
- Für Firmware-Diagnose ggf. zusätzliche Error-Code-Dokumentation notwendig.

