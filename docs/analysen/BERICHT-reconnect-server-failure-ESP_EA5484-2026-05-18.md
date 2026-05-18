# ESP_EA5484 Reconnect-Forensik (Server-Reconnect-Ausfall)

## Kontext und Ziel
- Ziel: Forensische Einordnung, warum `ESP_EA5484` nach Disconnect nicht mehr sauber zum Server zurückkam.
- Randbedingung: Keine neue interaktive Serial-Session gestartet, um keinen unbeabsichtigten Reset zu provozieren.
- Fokus: Nur vorhandene Artefakte/Container-Logs/DB-Spuren.

## Verwendete Artefakte
- `logs/current/hardware/disconnect-repro/forensik_wifi_20260518T104516Z/mqtt_payload_capture.log`
- `logs/current/hardware/disconnect-repro/forensik_wifi_20260518T104516Z/esp32_serial.log`
- `logs/current/hardware/disconnect-repro/forensik_wifi_20260518T104516Z/automationone-server.log`
- `logs/current/hardware/disconnect-repro/live_offline_fix_20260518T125855Z/mqtt_payload_capture.log`
- Laufende Container-Logs: `automationone-server`, `automationone-esp32-serial`
- DB-Tabellen: `esp_devices`, `esp_heartbeat_logs`, `audit_logs`

## UTC-Zeitleiste (harter Befund)
- `13:02:39Z`: `session/announce` + `system/heartbeat` von `ESP_EA5484`.
- `13:02:39Z`: Server pusht `config` mit `reason_code=heartbeat_offline_rules_mismatch` (erwartetes Verhalten nach Offline-Rule-Drift).
- `13:03:39Z`: Heartbeat mit `offline_rule_count=1` (Offline-Rule-Resync erfolgreich angekommen).
- `13:05:55Z`: `system/will` (`unexpected_disconnect`) für `ESP_EA5484`.
- Danach im gleichen MQTT-Capture **kein** neues `session/announce`, **kein** neues `system/heartbeat`.
- DB bestätigt das Ende der Heartbeat-Spur:
  - Letzter Heartbeat in `esp_heartbeat_logs`: `2026-05-18 13:03:39.778177 UTC`.
  - `esp_devices`: `status=offline`, `updated_at=2026-05-18 13:05:55.611004 UTC`.

## Primärer Befund
- Der Offline-Manager/Offline-Rule-Resync-Pfad hat kurz zuvor funktioniert.
- Der aktuelle Fehler ist **kein** reiner Offline-Rule-Handover-Fehler mehr, sondern ein **Reconnect-Ausfall nach LWT**:
  - Broker/Server sehen den Disconnect (`LWT`), aber es kommt kein neuer MQTT-Connect/Handshake mehr an.

## Was die Spuren technisch bedeuten
- Wenn kein neues `session/announce` und kein Heartbeat nach LWT kommt, scheitert der Rückweg typischerweise **vor** oder **beim** MQTT-Connect:
  1) WiFi kommt nicht stabil zurück (häufigster Fall in den vorhandenen Logs mit `NO_AP_FOUND`-Phasen), oder
  2) MQTT-Client bleibt lokal im Retry/Disconnect-Loop ohne erfolgreichen CONNECT-Eintritt.

## Widerspruch/Unsicherheit (explizit markiert)
- In `esp32_serial.log` gibt es spätere Sequenzen mit periodischen `heartbeat ack accepted` bis ca. `13:39`.
- Gleichzeitig enden `mqtt_payload_capture.log` und DB-Herzschläge für `ESP_EA5484` bei `13:03/13:05`.
- Das ist ein Observability-Widerspruch zwischen Quellen. Mögliche Ursachen:
  - Stalled/inkonsistente Capture-Pipeline in einem Artefaktpfad.
  - Mischspur durch Neustarts/Rotation.
  - Teilweise Log-Latenz/Flush-Artefakte.
- Für Reconnect-Entscheidung wurde daher die härteste Kette priorisiert: `MQTT payload + DB + LWT-Audit`.

## Bewertung der Root Cause (aktuell)
- Bestätigt:
  - Reconnect-Regression aus der alten MQTT-Destroy-Logik wurde zuvor adressiert.
  - Offline-Rule-Resync wurde durch den Drift-Trigger (`offline_rule_count`) erfolgreich aktiviert.
- Offen (jetzt relevant):
  - Warum nach `13:05:55Z` kein neuer MQTT-Handshake mehr auftaucht.
  - Kandidaten sind aktuell primär WiFi-Rückkehrpfad vs. lokaler MQTT-Retry-Zustand.

## Präziser Hand-off für den nächsten Fix-Agenten
1. **Keine aktive Serial-Monitor-Session starten**, die Reset triggern kann.
2. Für einen neuen Repro-Lauf nur passive Korrelation:
   - Broker-Subscribe (`kaiser/god/esp/ESP_EA5484/#`)
   - Server-Logs
   - DB (`esp_heartbeat_logs`, `esp_devices`, `audit_logs`)
3. Nach exakt einem OFF/ON-Zyklus folgende Gates prüfen:
   - `system/will` gesehen?
   - Danach `session/announce` innerhalb 90s?
   - Danach `system/heartbeat` innerhalb 120s?
4. Falls Gate 2/3 fehlschlägt:
   - In `El Trabajante/src/services/communication/mqtt_client.cpp` nur Reconnect-State-Übergänge instrumentieren (keine neue Steuerlogik).
   - In `El Trabajante/src/services/communication/wifi_manager.cpp` nur WiFi-Reassociate-Pfad timestamped markieren.
5. Erst wenn Repro stabil ist: minimaler Fix (1-2 Änderungen), dann 2 Zyklen Verifikation.

## Bereits vorhandene relevante Codeänderungen (nicht zurückdrehen)
- `El Trabajante/src/services/communication/mqtt_client.cpp`: Heartbeat enthält `offline_rule_count`.
- `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`: Drift-Detection für `offline_rule_count==0` triggert bestehenden Auto-Config-Push.

## Exakte Change-Scope-Notizen (für sauberes Weiterarbeiten)
- Dieser Report betrifft **nur** den Reconnect-Ausfall nach LWT. Der nächste Agent darf nicht erneut am Offline-Rule-Fix "oben drauf" entwickeln.
- Gewollte, bereits aktive Verdrahtung:
  1) `MQTTClient::publishHeartbeat()` publiziert `offline_rule_count`.
  2) `HeartbeatHandler._has_pending_config(...)` berücksichtigt `esp_offline_rule_count` und triggert bei `0` gegen erwartete DB-Regeln den bestehenden Auto-Push (`reason_code=heartbeat_offline_rules_mismatch` / reconnect-Variante).
  3) `HeartbeatHandler._expected_offline_rule_count(...)` nutzt den bestehenden `ConfigPayloadBuilder` (kein paralleler Regelpfad eingeführt).
- Begründung dieser 3 Punkte:
  - Ohne Heartbeat-Feld erkennt der Server den Regelverlust auf ESP nicht deterministisch.
  - Mit Drift-Trigger wird ausschließlich der vorhandene Config-Mechanismus genutzt, daher keine neue Fachlogik im Offline-Manager.
  - Der Builder-basierte Erwartungswert verhindert Doppelquellen für Regelzählung.

## Wichtige Guardrails gegen Breaking Changes
- In beiden Dateien gibt es im Workspace auch weitere Änderungen aus früheren Schritten. Für den nächsten Agenten gilt:
  - **Nicht pauschal refactoren**, **nicht breit umstrukturieren**, **keine Reverts fremder Änderungen**.
  - Nur minimal in Reconnect-Pfad eingreifen:
    - ESP: `processManagedReconnect_`, Disconnect/Connect-Event-Übergänge, WiFi->MQTT Übergabekante.
    - Server: nur observability/readiness, keine neue Zustandsmaschine.
- "No stacking" Regel:
  - Keine zweite "Fallback-Logik" zusätzlich zur bestehenden managed reconnect policy.
  - Keine zweite Config-Resync-Heuristik neben `offline_rule_count`-Drift.
  - Keine Änderung an Offline-Manager-Fachlogik (`SAFETY-P4`/`SAFETY-M2`) solange nicht zwingend durch Evidenz widerlegt.

## Kurzfazit
- Offline-Manager-Übergabe ist inzwischen grundsätzlich wiederhergestellt.
- Das akute Problem ist jetzt ein separater Reconnect-Ausfall nach LWT, mit starker Evidenz in MQTT+DB.
- Für den nächsten Schritt ist eine saubere, passive Repro-Korrelation entscheidend, bevor erneut in Reconnect-Logik eingegriffen wird.
