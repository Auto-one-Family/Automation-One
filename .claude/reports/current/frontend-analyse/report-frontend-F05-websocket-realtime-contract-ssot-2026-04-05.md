# Report Frontend F05: WebSocket, Realtime, Contract-SSOT

Datum: 2026-04-05  
Scope: `El Frontend/src/services/websocket.ts`, `El Frontend/src/composables/useWebSocket.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/stores/esp-websocket-subscription.ts`, `El Frontend/src/views/SystemMonitorView.vue`, `El Frontend/src/types/index.ts`, `El Frontend/src/utils/contractEventMapper.ts`, `El Frontend/src/utils/eventTypeLabels.ts`, `El Frontend/tests/mocks/websocket.ts`, `El Frontend/tests/mocks/handlers.ts`, `El Frontend/tests/unit/stores/esp-websocket-subscription.test.ts`, `El Frontend/tests/unit/utils/contractEventMapper.test.ts`, `.claude/reference/api/WEBSOCKET_EVENTS.md`

## 1) Kurzfazit

- Die Realtime-Kette ist funktional robust (Reconnect/Resubscribe, Connect-Refresh im `esp`-Store), aber **kein echtes SSOT**: Eventkatalog ist auf mindestens vier Artefakte verteilt (`types`, `contractEventMapper`, `eventTypeLabels`, `tests/mocks/websocket`).
- Es gibt nachweisbare Contract-Drifts mit produktiver Wirkung: einzelne Server-Events sind dokumentiert, aber nicht in Frontend-Types/Mapper verankert; andere sind im Mapper, aber nicht im Type-Vertrag.
- Startup ist in der Praxis meist stabil, aber **nicht deterministisch formalisiert**: Token-abhängige Erstverbindung und Handler-Registrierung sind entkoppelt; frühe Events werden teilweise über `fetchAll()` repariert statt garantiert verlustfrei konsumiert.
- Burst-Schutz ist aktuell primär beobachtend (Warn-Logging, Hard-Limits), nicht steuernd: kein Coalescing/Sampling/Priorisierung, und die `messageQueue` ist de facto ungenutzt.
- Für ein belastbares CI-Gate fehlt ein zentraler kanonischer Eventkatalog mit maschinenlesbarer Paritätsprüfung über `types` + runtime + `mocks`.

## 2) Event-SSOT Matrix (Source -> Mapper -> Handler -> UI Impact)

Legende Mutationstyp:
- `patch`: inkrementelle State-Änderung / Append.
- `replace`: vollständiger Austausch eines Zielobjekts.
- `refresh`: API-Rehydrate (`fetchAll`/Reload), nicht rein eventbasiert.
- `intent`: Lifecycle-/Signal-Fortschritt mit Korrelationsbezug.

| Eventtyp | Type-Quelle (`MessageType`) | Runtime-Quelle | Owner Handler | UI Impact | Mutation |
|---|---|---|---|---|---|
| `sensor_data` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `sensor.store` + SystemMonitor | Sensorwerte live, Timeline | patch |
| `sensor_health` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `sensor.store` + SystemMonitor | Sensor-Health/Timeout sichtbar | patch |
| `actuator_status` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Aktorzustand live | patch |
| `actuator_response` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Terminale Command-Rueckmeldung | intent |
| `actuator_alert` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Alarm/Notfall sichtbar | patch |
| `actuator_command` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Command-Start/Lifecycle | intent |
| `actuator_command_failed` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Command-Fehler, terminal | intent |
| `esp_health` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` + SystemMonitor | Device online/offline, runtime health | replace |
| `config_response` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `config.store`/`actuator.store` + SystemMonitor | Config ACK/finalisierung | intent |
| `config_published` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `config.store`/`actuator.store` + SystemMonitor | Config-Lifecycle start | intent |
| `config_failed` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `config.store`/`actuator.store` + SystemMonitor | Config terminal failed | intent |
| `sequence_started` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Sequence-Start | intent |
| `sequence_step` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Sequence-Fortschritt | intent |
| `sequence_completed` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Sequence terminal success | intent |
| `sequence_error` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Sequence terminal error | intent |
| `sequence_cancelled` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `actuator.store` + SystemMonitor | Sequence terminal cancel | intent |
| `device_discovered` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Pending-Gerät erscheint | patch |
| `device_rediscovered` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Pending/Online-Recovery | patch/refresh |
| `device_approved` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Pending->Approved, ggf. Liste neu laden | refresh |
| `device_rejected` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Pending entfernt + Toast | patch |
| `zone_assignment` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `zone.store` + SystemMonitor | Zone-ACK sichtbar | patch |
| `subzone_assignment` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `zone.store` + SystemMonitor | Subzone-ACK, danach ggf. Rehydrate | refresh |
| `device_scope_changed` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `zone.store` + SystemMonitor | Scope-Änderung, Rehydrate | refresh |
| `device_context_changed` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `zone.store`/`deviceContext.store` + SystemMonitor | Kontextwechsel, Rehydrate | refresh |
| `sensor_config_deleted` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Sensor aus Device-Liste entfernt | patch |
| `actuator_config_deleted` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` | Aktor aus Device-Liste entfernt | patch |
| `notification` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification.store` + SystemMonitor | Legacy-Notification | patch |
| `notification_new` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification-inbox.store` + SystemMonitor | Inbox-Eintrag neu | patch |
| `notification_updated` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification-inbox.store` + SystemMonitor | Inbox-Eintrag geändert | patch |
| `notification_unread_count` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification-inbox.store` + SystemMonitor | Badge/Unread Counter | patch |
| `logic_execution` | ja | `WS_EVENT_TYPES` | SystemMonitor | Logic-Execution Timeline | patch |
| `system_event` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification.store` + SystemMonitor | Betriebs-/Maintenance Event | patch |
| `error_event` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `notification.store` + SystemMonitor | Fehlerpfad, Alerts | patch |
| `intent_outcome` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `intentSignals.store` + SystemMonitor | Kanonischer Outcome-Fortschritt | intent |
| `intent_outcome_lifecycle` | ja | `WS_EVENT_TYPES` + ESP-Subscription | `esp.ts` -> `intentSignals.store` + SystemMonitor | Pending-Lifecycle | intent |
| `device_online` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Timeline Label/Icon vorhanden, kein Type-SSOT | patch |
| `device_offline` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Timeline Label/Icon vorhanden, kein Type-SSOT | patch |
| `lwt_received` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Disconnect-Signal in Timeline | patch |
| `plugin_execution_started` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Plugin-Lifecycle Start | patch |
| `plugin_execution_completed` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Plugin-Lifecycle Ende | patch |
| `service_start` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Service-Lifecycle | patch |
| `service_stop` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Service-Lifecycle | patch |
| `emergency_stop` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Safety-Ereignis | patch |
| `mqtt_error` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Infrastrukturfehler sichtbar | patch |
| `validation_error` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Validierungsfehler sichtbar | patch |
| `database_error` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | DB-Fehler sichtbar | patch |
| `login_success` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Auth-Audit Event | patch |
| `login_failed` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Auth-Audit Event | patch |
| `logout` | nein | `WS_EVENT_TYPES`/Mapper/Labels | SystemMonitor (generisch) | Auth-Audit Event | patch |
| `contract_mismatch` | nein | `WS_EVENT_TYPES` + Mapper-Signal | SystemMonitor | Integrationsproblem explizit sichtbar | patch |
| `contract_unknown_event` | nein | `WS_EVENT_TYPES` + Mapper-Signal | SystemMonitor | Unbekannter Eventtyp explizit sichtbar | patch |
| `events_restored` | nein | SystemMonitor-Spezialsubscription + Labels | `SystemMonitorView` spezial | Reload + Highlight restored IDs | refresh |

## 3) Contract-Drifts (mit konkreter Auswirkung)

### Drift A: `types` <-> runtime (`contractEventMapper`) nicht deckungsgleich

**Befund:** `MessageType` deckt mehrere runtime-relevante Typen nicht ab (`device_online`, `device_offline`, `lwt_received`, `plugin_execution_*`, `service_*`, `emergency_stop`, `*_error`, `login_*`, `logout`, `contract_*`).  
**Auswirkung:** Type-Sicherheit und SSOT-Versprechen brechen; neue Consumer landen bei `string`-Fallbacks, CI erkennt Drift nicht früh.

### Drift B: `events_restored` nur in Spezialpfad

**Befund:** `events_restored` ist in Labels und Monitor-Handler vorhanden, aber nicht im globalen Type-Vertrag und nicht im Mapper-Set.  
**Auswirkung:** Sonderfall-Event außerhalb des kanonischen Runtime-Katalogs; erhöhte Gefahr, bei Refactors vergessen zu werden.

### Drift C: Server-Referenz enthält Events ohne Frontend-Vertragsabbild

**Befund:** `.claude/reference/api/WEBSOCKET_EVENTS.md` führt u. a. `esp_diagnostics`, `esp_reconnect_phase`; diese sind weder in `MessageType` noch in `WS_EVENT_TYPES` abgebildet.  
**Auswirkung:** Dokumentierter Server-Contract kann im Frontend unbemerkt fehlen (keine Subscription/kein Handling/kein Testdruck).

### Drift D: `mocks` sind nicht parity-fähig

**Befund:** `tests/mocks/websocket.ts` nutzt einen eigenen, deutlich kleineren `MessageType`-Union (u. a. ohne `subzone_assignment`, `*_config_deleted`, `device_scope_changed`, `device_context_changed`, `notification_*`, `intent_outcome*`).  
**Auswirkung:** Unit-Tests laufen mit veraltetem Mock-Vertrag; Regressionslücken speziell bei neueren Realtime-Flows.

### Drift E: Labels/Icons/Transformer als vierte/fünfte Quellliste

**Befund:** Eventtypen sind zusätzlich in `eventTypeLabels`, `eventTypeIcons`, `eventTransformer` gepflegt.  
**Auswirkung:** UI kann Eventtypen kennen, die im Type-System nicht kanonisch erfasst sind (oder umgekehrt); semantische Drift über Zeit wahrscheinlich.

## 4) Startup-Race Analyse (Nachweis + Reihenfolge)

## 4.1 Aktuelle Reihenfolge (Ist)

1. `main.ts`: App + Pinia + Router initialisiert.  
2. `App.vue` erzeugt sofort `authStore` und `espStore` (Store-Instantiation noch vor `onMounted`).  
3. `espStore` erstellt `useWebSocket({ autoConnect: true, filters: ESP_STORE_WS_SUBSCRIPTION_TYPES })`.  
4. `useWebSocket.connect()` startet sofort; `websocketService.connect()` bricht ab, falls noch kein Token.  
5. `espStore.initWebSocket()` registriert alle `ws.on(...)` Handler.  
6. `App.vue onMounted`: `authStore.checkAuthStatus()`.

## 4.2 Nachgewiesene Lücken

- **Token-gesteuerter Erstconnect ist indirekt:** wenn der erste Auto-Connect mangels Token abbricht, gibt es keinen expliziten Auth-Transition-Hook im `espStore`, der garantiert direkt nach Login verbindet.  
- **Recovery statt deterministische Früh-Event-Garantie:** `websocketService.onConnect(() => fetchAll())` kompensiert verpasste Früh-Events durch Rehydrate (robust), beweist aber keine verlustfreie Event-Consumption ab erster Nachricht.
- **Monitor-spezifischer Sonderfall:** `events_restored` wird getrennt registriert; dieser Pfad hängt nicht am globalen Eventkatalog und ist damit nicht automatisch in Startup/Parity-Checks enthalten.

## 4.3 Soll-Reihenfolge (deterministisch)

1. Auth-Status und Token-Lage finalisieren.  
2. Alle Handler registrieren (ESP + SystemMonitor + spezielle Events).  
3. Erst dann `connect()`.  
4. Nach `connected`: 1x kontrollierter Rehydrate-Sync (`fetchAll`/`loadHistoricalEvents`) mit dedup.  
5. Realtime-Flow freigeben.

Damit ist die Handler-Luecke formal geschlossen und nicht nur operational abgefedert.

## 5) Burst-Szenarien: Ist vs Soll

## 5.1 Ist-Verhalten

- `websocket.ts`: `checkRateLimit()` loggt nur Warning bei >10 msg/s; keine aktive Drosselung.
- `messageQueue` wird begrenzt/verarbeitet, aber es gibt keinen belegbaren Enqueue-Pfad (`messageQueue.push` fehlt).
- `SystemMonitorView`: `MAX_EVENTS=5000` mit Safety-Cut; keine Event-Klassen-Priorisierung.
- ESP-/Domain-Stores verarbeiten Events direkt; kein Coalescing für hochfrequente `sensor_data`.

## 5.2 Risiko

- Burst von Sensorereignissen erzeugt unnötige Render-/Store-Last.
- Kritische Events konkurrieren mit Rausch-Events ohne Priorisierung.
- Beobachtung statt Steuerung: Lastspitzen werden protokolliert, aber nicht aktiv abgefangen.

## 5.3 Ziel-Policy (testbar)

- **Coalescing:** `sensor_data` pro `esp_id + gpio` im kurzen Fenster (z. B. 250ms) zusammenfassen.
- **Priority Queue:** `critical/error` und Lifecycle-terminale Events (`*_failed`, `*_response`, `sequence_*`, `intent_outcome*`) bevorzugt, niemals verwerfen.
- **Sampling:** Info-Events (`esp_health` online-stable) in Burst-Phasen ausdünnen.
- **Queue Policy:** feste Größe + Eviction nur für low-priority, inkl. Counter-Metriken (`dropped_low_priority`, `coalesced_count`).

## 6) CI-Gate Entwurf: `types` + `mapper` + `mocks`

## 6.1 Kanonisches Artefakt

Ein einziges maschinenlesbares Eventmanifest (z. B. `src/contracts/ws-events.ts` oder JSON), aus dem alle anderen Listen generiert bzw. validiert werden.

## 6.2 Parity-Prüfungen (statisch)

1. **`MessageType` parity:** Jeder kanonische Eventtyp muss in `MessageType` enthalten sein.  
2. **Mapper parity:** `WS_EVENT_TYPES` muss exakt kanonisch sein (kein Extra, kein Missing).  
3. **Mock parity:** `tests/mocks/websocket.ts` darf keine eigene Eventliste führen; stattdessen Import des kanonischen Typs.  
4. **Labels parity:** Für jeden kanonischen Typ muss UI-Label vorhanden sein (oder expliziter `noLabel`-Flag im Manifest).

## 6.3 CI-Testfälle (konkret)

- `tests/unit/contracts/ws-event-parity.test.ts`  
  - vergleicht Set-Gleichheit: `canonical == MessageType == WS_EVENT_TYPES == mockSupportedTypes`.
- `tests/unit/contracts/ws-event-ownership.test.ts`  
  - prüft für jeden Eventtyp `owner` und `mutation` laut Manifest (mindestens Monitor oder explizit `unhandled_allowed=false`).
- `tests/integration/realtime/reconnect-no-loss.test.ts`  
  - Szenario: connect -> disconnect -> reconnect -> resubscribe -> assert keine Lücke für kritische Eventtypen.

## 7) Akzeptanzkriterien-Check

- Kein Eventtyp existiert nur in einer von drei Quellen (`types`, runtime, `mocks`): **nicht erfüllt** (mehrere Drifts A-D).
- Startup-Sequenz ohne Handler-Luecke nachgewiesen: **teilweise erfüllt** (robuste Recovery, aber keine harte deterministische Reihenfolge mit explizitem Connect-Gate).
- Burst-Policy für kritische Events definiert und testbar: **nicht erfüllt** (derzeit primär Logging + Hard-Limit, keine Priorisierung/Coalescing).

## 8) Konkrete nächste Schritte (minimal-invasiv)

1. Kanonischen Eventkatalog einführen und daraus `MessageType`/Mapper/Mocks ableiten.  
2. `events_restored` und dokumentierte Server-Events (`esp_diagnostics`, `esp_reconnect_phase`) explizit kontraktieren (entweder unterstützen oder bewusst als out-of-scope markieren).  
3. Startup-Gate einziehen: `registerHandlers -> connect -> rehydrate`.  
4. Burst-Policy für `sensor_data` + kritische Events implementieren und mit Integrations-/Parity-Tests absichern.
