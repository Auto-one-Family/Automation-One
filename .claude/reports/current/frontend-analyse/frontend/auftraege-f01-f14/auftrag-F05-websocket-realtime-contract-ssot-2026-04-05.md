# Auftrag F05: WebSocket, Realtime, Contract-SSOT

> **Typ:** Analyseauftrag  
> **Erstellt:** 2026-04-05  
> **Bereich:** AutomationOne / El Frontend / F05  
> **Prioritaet:** P1

## Relevantes Wissen (kompakt und verbindlich)
- Realtime ist der Wahrnehmungskern des Operator-Systems; Drift zwischen Eventtypen und Handlern erzeugt direkte Fehlinterpretation.
- Startup-Reihenfolge entscheidet, ob fruehe Events verloren oder doppelt verarbeitet werden.
- Ohne Backpressure/Coalescing wird Lastspitze zur UI-Belastung und Signalrauschen.
- SSOT fuer Eventtypen muss in Types, Mapper und Subscription identisch sein.

## IST-Befund
- Realtime-Kette ist grundsaetzlich robust (Reconnect, Resubscribe, Refresh).
- Contract-Drift zwischen Eventquellen ist nachweisbar.
- Queue-/Rate-Limit-Mechanismen sind teilweise beobachtend statt steuernd.
- Startup ist teilweise abgesichert (`pendingSubscriptions`, `onConnect -> fetchAll`), aber kein expliziter Nachweis fuer "handler-ready-before-first-event" dokumentiert.

## Verifizierter Code-Kontext (IST)
- WS Runtime Service: `El Frontend/src/services/websocket.ts`
- WS Composable + Subscription-Pfad: `El Frontend/src/composables/useWebSocket.ts`
- ESP Store Registration + Handler-Liste: `El Frontend/src/stores/esp.ts`
- Kanonische ESP-Store-Filterliste: `El Frontend/src/stores/esp-websocket-subscription.ts`
- Contract Mapper + bekannte Event-Liste: `El Frontend/src/utils/contractEventMapper.ts`
- Event-Typdefinitionen (typed contract): `El Frontend/src/types/websocket-events.ts`
- Frontend MessageType-Union (runtime-typed): `El Frontend/src/types/index.ts`
- Referenzkatalog (serverseitig + frontend-intern): `.claude/reference/api/WEBSOCKET_EVENTS.md`
- Unit Tests (bereits vorhanden):
  - `El Frontend/tests/unit/stores/esp-websocket-subscription.test.ts`
  - `El Frontend/tests/unit/utils/contractEventMapper.test.ts`
  - `El Frontend/tests/unit/composables/useWebSocket.test.ts`
  - `El Frontend/tests/unit/stores/intent-contract-matrix.test.ts`
- Mocks:
  - `El Frontend/tests/mocks/websocket.ts`
  - `El Frontend/tests/mocks/handlers.ts`

## SOLL-Zustand
- Ein kanonischer Eventkatalog als einziges Vertragsartefakt.
- Deterministische Startup-Sequenz: Handler bereit vor Eventfluss.
- Lastspitzen werden kontrolliert (coalescing, sampling, queue policy) statt nur protokolliert.

## Analyseauftrag
1. Event-SSOT erstellen: `type source -> runtime mapper -> store handler -> ui impact` auf realen Dateien.
2. Startup-Race pruefen und Reihenfolge mit Nachweis spezifizieren (inkl. "erste Nachricht nach Connect").
3. Burstszenarien mit aktuellen und gewuenschten Schutzmassnahmen dokumentieren (10 msg/s + Queue).
4. Parity-Checks fuer `types`, `mapper`, `mocks` als CI-Gate entwerfen und konkrete Testdateien benennen.

## Festgestellte Contract-Drifts (bereits verifiziert, zwingend einarbeiten)
- `src/types/websocket-events.ts` und `src/types/index.ts (MessageType)` sind nicht deckungsgleich.
  - In `websocket-events.ts` vorhanden, aber nicht in `MessageType`/ESP-Subscription: z. B. `server_log`, `db_record_changed`.
  - In `MessageType`/`contractEventMapper`/Referenz vorhanden, aber in `websocket-events.ts` nicht als eigene Event-Interfaces modelliert: z. B. `notification_new`, `notification_updated`, `notification_unread_count`, `device_scope_changed`, `device_context_changed`, `sensor_config_deleted`, `actuator_config_deleted`, `plugin_execution_started`, `plugin_execution_completed`.
- `tests/mocks/websocket.ts` bildet nur einen Teil der produktiven Eventtypen ab (Mock-Drift).
- `contractEventMapper.ts` fuehrt eine eigene kanonische Eventliste (`WS_EVENT_TYPES`), die derzeit nicht automatisch gegen `MessageType`/`websocket-events.ts` geprueft wird.

## Korrigierter Ausfuehrungsauftrag (fuer Dev-Agent direkt umsetzbar)
1. SSOT-Artefakt erstellen:
   - Primare Quelle fuer Eventtypen festlegen (empfohlen: `src/types/index.ts -> MessageType` ODER dediziertes `src/types/ws-event-catalog.ts`).
   - Alle konsumierenden Stellen auf diese Quelle ausrichten:
     - `src/stores/esp-websocket-subscription.ts`
     - `src/utils/contractEventMapper.ts`
     - `src/types/websocket-events.ts` (Union/Interfaces)
     - `tests/mocks/websocket.ts`
2. Startup-Sequenz beweisbar machen:
   - Reihenfolge dokumentieren: `useWebSocket(autoConnect)` -> `initWebSocket()` -> `ws.on(...)` -> `onConnect(fetchAll)`.
   - Testfall hinzufuegen: fruehes Event unmittelbar nach Connect darf nicht verloren gehen (oder wird durch `fetchAll` konsistent geheilt).
3. Burst-Verhalten absichern:
   - Ist dokumentieren: Warnung >10 msg/s, Queue-Limit 1000, kein echtes Coalescing.
   - Soll als Ticket-fertige Empfehlung: event-klassenspezifisches Coalescing (z. B. `sensor_data`, `esp_health`) und harte Drop-Policy mit Metrik.
4. CI-Gates konkret implementieren:
   - Parity Test 1: `MessageType` == `ESP_STORE_WS_ON_HANDLER_TYPES` (bereits teilweise da, erweitern).
   - Parity Test 2: `MessageType` <-> `WS_EVENT_TYPES` (`contractEventMapper`) bidirektional.
   - Parity Test 3: `MessageType` <-> `tests/mocks/websocket.ts` MessageType.
   - Optional Parity Test 4: Eventtypen in `.claude/reference/api/WEBSOCKET_EVENTS.md` gegen Code-SSOT diffen (warnend, nicht blockierend).

## Scope
- **In Scope:** WS-Service, Store-Subscription, Type-Vertrag, Burst-Verhalten.
- **Out of Scope:** Serverseitige Event-Neuarchitektur.

## Nachweise
- Vollstaendige Event-Matrix mit Ownership und Mutationstyp (`patch|replace|refresh|intent`).
- Liste aller Contract-Drifts mit konkreter Auswirkung.
- Explizite Tabelle "heute vs. nach Fix" fuer die vier Paritaetsquellen:
  - `MessageType`
  - `ESP_STORE_WS_SUBSCRIPTION_TYPES`
  - `WS_EVENT_TYPES` (mapper)
  - `tests/mocks/websocket.ts`
- Startup-Sequenz-Diagramm mit konkreten Symbolen/Funktionen (`connect`, `resubscribeAll`, `processPendingSubscriptions`, `notifyConnectCallbacks`, `fetchAll`).

## Akzeptanzkriterien
- Kein Eventtyp existiert nur in einer von drei Quellen (`types`, runtime, tests/mocks).
- Startup-Sequenz ist ohne Handler-Luecke nachgewiesen.
- Burst-Policy ist fuer kritische Events definiert und testbar.
- SSOT-Quelle ist eindeutig benannt und in allen betroffenen Modulen verwendet.
- Fuer erkannte Drift-Typen existieren reproduzierbare Regression-Tests.
- Keine stillen Unknown-Events im Runtime-Pfad: unbekannte Typen werden kontrolliert als Integrationssignal sichtbar.

## Tests/Nachweise
- Contract-Parity-Test (statisch).
- Integration: Reconnect + resubscribe + no event loss in Kernpfaden.
- Unit:
  - `tests/unit/stores/esp-websocket-subscription.test.ts` erweitern (vollstaendige Paritaet zu `MessageType`).
  - Neuer/erweiterter Test fuer `tests/unit/utils/contractEventMapper.test.ts` (bidirektionale Eventlisten-Paritaet).
  - Neuer Test fuer `tests/mocks/websocket.ts` gegen produktive Eventliste.
- Integration:
  - `tests/unit/composables/useWebSocket.test.ts`: fruehe Message nach Connect + Filterpfad.
  - `tests/unit/stores/esp.test.ts`: Reconnect + `onConnect(fetchAll)` heilt verpasste Heartbeats.

## Vorbedingungen zur Ausfuehrung
- Arbeitsbereich: `El Frontend/`
- Pflichtchecks nach Umsetzung:
  - `npx vitest run tests/unit/stores/esp-websocket-subscription.test.ts tests/unit/utils/contractEventMapper.test.ts tests/unit/composables/useWebSocket.test.ts`
  - `npx vue-tsc --noEmit`
