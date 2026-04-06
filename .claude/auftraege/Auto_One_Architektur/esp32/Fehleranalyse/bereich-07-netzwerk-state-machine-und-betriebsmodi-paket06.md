# Bereich 07 - Netzwerk-State-Machine und Betriebsmodi (IST-Revision 2026-04-05)

> Fokus: Moduswechsel, ACK/Liveness-Semantik und Offline->Online-Rueckfuehrung.

## 1) Was war veraltet?

- Die alte Fassung war als reine FA-Liste ohne einheitliche Revisionsstruktur aufgebaut.
- Netzwerk-, Persistenz- und Betriebsmodusrisiken waren nicht als priorisierte Endlage konsolidiert.

## 2) Was ist jetzt der IST-Stand?

- `FA-NET-001`: Gate-Timeout **freigibt nicht** „ONLINE“ fuer Nicht-Heartbeat-Publishes: `MQTTClient::publish()` blockiert ohne `registration_confirmed_` dauerhaft (auch nach `REGISTRATION_TIMEOUT_MS` nur Log „gate remains CLOSED until valid heartbeat ACK“); Oeffnung nur via `confirmRegistration()` nach gueltigem Heartbeat-ACK (`El Trabajante/src/services/communication/mqtt_client.cpp`).
- `FA-NET-002`: `server/status` ist im Code als **Liveness-Hinweis** implementiert (`main.cpp`: Vorrangregel-Kommentar; bei `online` kein Registration-Gate-Oeffnen, bei `OFFLINE_ACTIVE` nur `onReconnect()` fuer Handover-Epoch bis zum autoritativen Heartbeat-ACK); **Restrisiko** bleibt semantisch (gleiches Wort `online` in zwei Payload-Kontexten, Logs/Monitoring), nicht als zweite ACK-Quelle fuer das Gate.
- `FA-NET-003`: Persistenzfehler im OFFLINE->ONLINE-Reset bleiben kritisch fuer Runtime/NVS-Konsistenz (`OfflineModeManager::setPersistenceDrift` u.a. bei NVS-Fehlern, sichtbar in Heartbeat-Metriken `degraded`/`persistence_drift_*`).
- `FA-NET-004`: Legacy-No-Task-Pfad bleibt nicht timing-aequivalent zum RTOS-Pfad (`delay()`/Tick-Abstand vs. Comm-Task; im Legacy-`loop()` fehlt `checkServerAckTimeout()` — P1-ACK-Timeout laeuft nur im Safety-Task; zudem kein `checkRegistrationTimeout()` im Legacy-Zweig PENDING_APPROVAL/CONFIG_PENDING wie im Comm-Task).
- `FA-NET-005`: Provisioning-Fallback kann bei Dauerinstabilitaet zu Flattern fuehren (Legacy: Disconnect-Debounce/Circuit-Breaker → Portal, Reconnect bei `isConnected() && isRegistrationConfirmed()` schliesst Portal wieder — bei Flap potenziell wiederholte Zyklen).

## 3) Welche Restluecken bleiben?

- **P0:** `FA-NET-003` (NVS/Persistenz/Drift); **P0 (Restrisiko):** semantische Zwei-Kanal-Verwechslung aus `FA-NET-002` (Betrieb/Monitoring, nicht Gate-Logik).
- **P1:** `FA-NET-005`.
- **P2:** `FA-NET-004`.
- **Geschlossen (Code-Verifikation 2026-04-05):** `FA-NET-001` (Registration-Gate fail-closed nach Timeout).

## 4) Was wurde in der Datei konkret angepasst?

- Datei auf das verbindliche 4-Block-IST-Format umgestellt.
- `FA-NET-*` Befunde als priorisierte Betriebsrisiken konsolidiert.
- Abnahmekriterien fuer Netzwerk-/ACK-Autoritaet ergaenzt.
- `FA-NET-001` bis `FA-NET-004` an `El Trabajante/src/main.cpp`, `mqtt_client.cpp`, `offline_mode_manager.cpp` und Task-Pfade angeglichen; Priorisierung in Abschnitt 3 aktualisiert.

## Abnahmekriterien (Schritt bestanden/nicht bestanden)

- **Bestanden**, wenn ACK-Autoritaet, Reset-Drift und Betriebsmodusrisiken getrennt priorisiert sind.
- **Nicht bestanden**, wenn Liveness- und Reconciliation-Pfade ohne klare Prioritaetsgates verbleiben.

