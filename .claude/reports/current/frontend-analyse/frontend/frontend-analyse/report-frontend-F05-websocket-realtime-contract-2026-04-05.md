# Report F05: WebSocket, Realtime-Verarbeitung, Contract-Drift

Datum: 2026-04-05  
Scope: `El Frontend/src/services/websocket.ts`, `El Frontend/src/composables/useWebSocket.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/stores/esp-websocket-subscription.ts`, `El Frontend/src/types/index.ts`, `El Frontend/src/utils/contractEventMapper.ts`

## 1) Executive Result

- Realtime-Pfad ist technisch durchgaengig: WS Push -> `useWebSocket` -> Store-Handler -> Store-Mutation -> reaktives UI.
- Ownership ist fuer alle produktiven ESP-Store-Events vorhanden (35/35 Events aus `ESP_STORE_WS_ON_HANDLER_TYPES`).
- Reconnect-/Recovery-Verhalten ist robust (Exponential Backoff, Token-Refresh vor Reconnect, Re-Subscribe, Post-Connect `fetchAll()`).
- Es gibt eine klare Contract-Drift zwischen `MessageType` und Runtime-Eventinventar im `contractEventMapper` (51 vs. 35 Eventstrings, 16 nur im Mapper).
- Es bestehen 3 relevante Race-Risiken (Startup-Zeitfenster, Burst ohne echte Laststeuerung, fehlende Queue-Befuellung).

---

## 2) Event-Matrix (Producer, Consumer, Handler, Mutation, UI-Effekt)

Legende Mutationstyp:
- `direct patch`: gezielte In-Place/Objektersatz-Mutation im Store
- `delegated patch`: Handler delegiert an Domain-Store, dort Mutation
- `refresh`: kompletter State-Refresh ueber `fetchAll()` / API
- `intent-state`: Lifecycle-/Intent-Status in dediziertem Store
- `notify`: nur Notification/Toast/Eventfeed

| Event | Producer | Consumer | Handler | Mutationstyp | UI-Auswirkung | Ownership |
|---|---|---|---|---|---|---|
| `esp_health` | heartbeat/LWT pipeline (Server) | `esp.store` | `handleEspHealth` | direct patch / refresh | Device status, offline/online, KPI, badges | ESP Store |
| `sensor_data` | `sensor_handler.py` | `esp.store` -> `sensor.store` | `handleSensorData` | delegated patch | Live-Sensorwerte, Charts | Sensor Store |
| `actuator_status` | `actuator_handler.py` | `esp.store` -> `actuator.store` | `handleActuatorStatus` | delegated patch | Aktorzustand, card status | Actuator Store |
| `actuator_alert` | `actuator_alert_handler.py` | `esp.store` -> `actuator.store` | `handleActuatorAlert` | delegated patch / notify | Warnungen, Alert-UI | Actuator Store |
| `config_response` | `config_ack_handler.py` | `esp.store` -> `actuator.store` + `config.store` | `handleConfigResponse` | delegated patch | Config terminal state, feedback | Config + Actuator Store |
| `zone_assignment` | `zone_ack_handler.py` | `esp.store` -> `zone.store` | `handleZoneAssignment` | delegated patch | Zone-Zuordnung sichtbar | Zone Store |
| `subzone_assignment` | `subzone_ack_handler.py` | `esp.store` -> `zone.store` | `handleSubzoneAssignment` | delegated patch + refresh | Subzone-Zuordnung in Monitor/Hardware | Zone Store |
| `sensor_health` | maintenance/sensor health job | `esp.store` -> `sensor.store` | `handleSensorHealth` | delegated patch | stale/timeout indicators | Sensor Store |
| `sensor_config_deleted` | sensor delete pipeline | `esp.store` | `handleSensorConfigDeleted` | direct patch | Sensor verschwindet direkt aus UI | ESP Store |
| `actuator_config_deleted` | actuator delete pipeline | `esp.store` | `handleActuatorConfigDeleted` | direct patch | Aktor verschwindet direkt aus UI | ESP Store |
| `device_scope_changed` | sensor/actuator update API | `esp.store` -> `zone.store` | `handleDeviceScopeChanged` | delegated patch + refresh | Scope badges/filter | Zone Store |
| `device_context_changed` | device-context API | `esp.store` -> `zone.store` + `deviceContext.store` | `handleDeviceContextChanged` | delegated patch + refresh | aktive Zone/Subzone-Kontexte | Zone + DeviceContext Store |
| `device_discovered` | discovery flow | `esp.store` | `handleDeviceDiscovered` | direct patch | Pending-Devices Panel | ESP Store |
| `device_approved` | approval flow | `esp.store` | `handleDeviceApproved` | direct patch / refresh | pending -> approved visibility | ESP Store |
| `device_rejected` | approval flow | `esp.store` | `handleDeviceRejected` | direct patch | pending list update, toast | ESP Store |
| `device_rediscovered` | rediscovery flow | `esp.store` | `handleDeviceRediscovered` | direct patch / refresh | offline->online oder pending reentry | ESP Store |
| `actuator_response` | actuator response handler | `esp.store` -> `actuator.store` | `handleActuatorResponse` | delegated patch | command terminal feedback | Actuator Store |
| `actuator_command` | command lifecycle bridge | `esp.store` -> `actuator.store` | `handleActuatorCommand` | intent-state | pending command lifecycle | Actuator Store |
| `actuator_command_failed` | command lifecycle bridge | `esp.store` -> `actuator.store` | `handleActuatorCommandFailed` | intent-state | failed command UI/error states | Actuator Store |
| `config_published` | config publish pipeline | `esp.store` -> `actuator.store` + `config.store` | `handleConfigPublished` | intent-state | pending config progress | Config + Actuator Store |
| `config_failed` | config publish pipeline | `esp.store` -> `actuator.store` + `config.store` | `handleConfigFailed` | intent-state | terminal failed config | Config + Actuator Store |
| `sequence_started` | logic engine | `esp.store` -> `actuator.store` | `handleSequenceStarted` | intent-state | sequence progress start | Actuator Store |
| `sequence_step` | logic engine | `esp.store` -> `actuator.store` | `handleSequenceStep` | intent-state | step progress | Actuator Store |
| `sequence_completed` | logic engine | `esp.store` -> `actuator.store` | `handleSequenceCompleted` | intent-state | sequence terminal success | Actuator Store |
| `sequence_error` | logic engine | `esp.store` -> `actuator.store` | `handleSequenceError` | intent-state | sequence terminal error | Actuator Store |
| `sequence_cancelled` | logic engine | `esp.store` -> `actuator.store` | `handleSequenceCancelled` | intent-state | sequence cancelled state | Actuator Store |
| `intent_outcome` | canonical intent contract | `esp.store` -> `intentSignals.store` | `handleIntentOutcome` | intent-state | intent signal cards/status | IntentSignals Store |
| `intent_outcome_lifecycle` | canonical intent lifecycle | `esp.store` -> `intentSignals.store` | `handleIntentOutcomeLifecycle` | intent-state | intermediate lifecycle markers | IntentSignals Store |
| `notification` | logic/system events | `esp.store` -> `notification.store` | `handleNotification` | notify | toasts/notification feed | Notification Store |
| `notification_new` | notification router | `esp.store` -> `notification-inbox.store` | `handleNotificationNew` | notify | inbox list append | Notification Inbox Store |
| `notification_updated` | notification router | `esp.store` -> `notification-inbox.store` | `handleNotificationUpdated` | notify | inbox item update | Notification Inbox Store |
| `notification_unread_count` | notification router | `esp.store` -> `notification-inbox.store` | `handleNotificationUnreadCount` | notify | unread badge | Notification Inbox Store |
| `error_event` | error tracker | `esp.store` -> `notification.store` | `handleErrorEvent` | notify | error stream, badges | Notification Store |
| `system_event` | system event stream | `esp.store` -> `notification.store` | `handleSystemEvent` | notify | system stream visibility | Notification Store |

Fazit Ownership: alle produktiven Eventtypen im ESP-Realtime-Pfad haben klaren Handler + Zielstore.

---

## 3) Reconnect-/Subscription-Lebenszyklus (inkl. Filter und Re-Init)

## 3.1 Startup und Erstsubscription

1. `useEspStore()` erzeugt `ws = useWebSocket({ autoConnect: true, filters: { types: ESP_STORE_WS_SUBSCRIPTION_TYPES } })`.
2. `useWebSocket` startet `connect()` sofort (auch in Store-Kontext ohne Vue-Lifecycle).
3. Bei erfolgreichem `connect()` wird `subscribe(activeFilters)` ausgefuehrt.
4. `esp.store` ruft danach `initWebSocket()` auf und registriert alle `ws.on(...)` Handler.
5. Filter-Gating: nur Eventtypen in `ESP_STORE_WS_SUBSCRIPTION_TYPES` werden vom Server geliefert.

## 3.2 Laufzeitrouting

- WS-Nachricht -> `websocketService.handleMessage()`
- `routeMessage()` dispatcht auf aktive Subscriptions (Filter-Matching)
- Subscription-Callback (`useWebSocket`) dispatcht auf `messageHandlers` je `eventType`
- `ws.on(type, handler)` im ESP-Store triggert konkrete Handler
- Handler mutieren Store-Objekte oder delegieren in Domain-Stores
- Vue-Reaktivitaet rendert Delta

## 3.3 Disconnect, Fallback, Recovery

- Bei abnormalem Close (`code != 1000`): `scheduleReconnect()` mit exponential backoff + jitter.
- Vor Reconnect: `refreshTokenIfNeeded()` (60s pre-expiry window).
- Bei erfolgreichem Reconnect (`onopen`):
  - `resubscribeAll()` (merged filters)
  - `processPendingSubscriptions()`
  - `notifyConnectCallbacks()`
- ESP-Store registriert `websocketService.onConnect(() => fetchAll())`:
  - Recovery auf canonical API state
  - schliesst Event-Luecken waehrend Offline/Connecting

## 3.4 Subscription-Merging

- Mehrere Konsumenten werden serverseitig als merged Filter gesendet (`sendMergedSubscription()`).
- Verhindert "last writer wins"-Ueberschreiben bei unterschiedlichen Filtersets.
- `esp_ids` wird nur gesetzt, wenn *alle* aktiven Subscriptions scoped sind; sonst global.

---

## 4) Pflichtnachweis A: WS Push -> Handler -> Store -> gerenderte Aenderung

Beispiel `sensor_data`:

1. Server pusht `sensor_data`.
2. `websocketService` matched Filter `types`.
3. `useWebSocket` dispatcht auf `ws.on('sensor_data', handleSensorData)`.
4. `handleSensorData` delegiert nach `sensor.store.handleSensorData(...)`.
5. Sensorwerte werden im Store aktualisiert.
6. SensorCard/Monitor/Charts reagieren ohne Polling neu.

Beispiel `esp_health`:

1. Server pusht `esp_health`.
2. `handleEspHealth` ersetzt Device-Objekt reaktiv.
3. `status`, `last_seen`, `offlineInfo`, `runtime_health_view` werden aktualisiert.
4. Hardware/Monitor UI zeigt online/offline/stale Delta unmittelbar.

---

## 5) Pflichtnachweis B: WS-Ausfall -> Fallback/Status -> Recovery

Ausfallpfad:

1. WS disconnectt abnormal -> Status `disconnected`.
2. Auto-Reconnect startet mit Backoff (1s bis max 30s, jittered).
3. Token wird vor Reconnect validiert/refresht.
4. Bei Ausschopfung max attempts -> Status `error` (UI kann degradierte Verbindung markieren).

Recoverypfad:

1. Reconnect erfolgreich -> Resubscribe aller aktiven Filter.
2. `onConnect` Callback im ESP-Store triggert `fetchAll()`.
3. UI springt auf serverseitigen Ground Truth zurueck (auch nach Eventverlust).

---

## 6) Race-Risiken (Burst + Store-Init)

## R1: Startup-Zeitfenster zwischen Subscription und Handler-Registration

- Beobachtung: `useWebSocket(autoConnect=true)` startet Connect bereits vor vollstaendiger `ws.on(...)` Registrierung in `initWebSocket()`.
- Risiko: sehr fruehe Events koennen eintreffen, bevor Handler-Map voll ist.
- Aktuelle Mitigation: `onConnect -> fetchAll()` reduziert Persistenzschaden, aber transientes Event kann im UI kurz fehlen.
- Prioritaet: mittel.

## R2: Burst-Verkehr ohne echte Backpressure

- Beobachtung: `checkRateLimit()` loggt nur Warnung >10 msg/s; keine Drosselung, kein batching.
- Risiko: Main-Thread Last, potenzielle UI-Jitter bei Eventspitzen.
- Prioritaet: mittel.

## R3: Queue-Design unvollstaendig

- Beobachtung: `messageQueue`/`processMessageQueue()` existiert, aber es gibt keinen Pfad, der eingehende Messages in die Queue schreibt.
- Risiko: Erwartung "buffered processing" stimmt nicht mit Runtime ueberein; kann in Reviews falsch interpretiert werden.
- Prioritaet: niedrig bis mittel (Tech-Debt/Verstaendnisrisiko).

---

## 7) Contract-Drift (Runtime-Strings vs. Typsystem)

## 7.1 Gemessene Drift

Vergleich:
- `contractEventMapper.WS_EVENT_TYPES`: 51 Events
- `types/index.ts::MessageType`: 35 Events
- Nur im Mapper (16):
  - `contract_mismatch`, `contract_unknown_event`
  - `database_error`
  - `device_offline`, `device_online`
  - `emergency_stop`
  - `login_failed`, `login_success`, `logout`
  - `lwt_received`
  - `mqtt_error`
  - `plugin_execution_completed`, `plugin_execution_started`
  - `service_start`, `service_stop`
  - `validation_error`

## 7.2 Konkrete Auswirkung

- Compile-Time: Diese 16 Events sind nicht Teil von `MessageType`; typsichere WS-Filter/Handler koennen sie nicht sauber ausdruecken.
- Runtime: `websocketService.on(type: MessageType | string)` akzeptiert sie dennoch als String.
- Ergebnis: zwei Wahrheiten
  - Realtime-Typmodell (`MessageType`) enger
  - Contract-Monitoring/Eventfeed (`contractEventMapper`) breiter
- Betriebsfolge: hoehere Driftgefahr, wenn neue Eventtypen nur in einem Inventar gepflegt werden.

## 7.3 Weitere Driftbeobachtung

- `esp-websocket-subscription.ts` ist durch `satisfies readonly MessageType[]` gut abgesichert.
- Drift ist primar zwischen `MessageType` und `contractEventMapper.WS_EVENT_TYPES`, nicht innerhalb ESP-Store-Filterliste.

---

## 8) Folgeauftraege (konkret aus Drift/Risiko)

## F05-A: Event-SSOT vereinheitlichen (hoch)

- Ziel: ein zentrales Eventinventar fuer Realtime + Monitor.
- Vorschlag: `MessageType` in Basismenge + erweiterte `MonitorEventType`, beide aus gemeinsamer Quelle generiert.
- Akzeptanz: kein manueller Doppelabgleich mehr zwischen `index.ts` und `contractEventMapper.ts`.

## F05-B: Startup-Race schliessen (mittel)

- Ziel: Handler vor Erstsubscription aktiv.
- Optionen:
  - Connect erst nach `initWebSocket()`, oder
  - temporare pre-handler queue in `useWebSocket`.
- Akzeptanz: keine Eventverluste zwischen connect/open und Handler-Map init.

## F05-C: Burst-Schutz real machen (mittel)

- Ziel: planbares Verhalten bei >10 msg/s.
- Optionen: coalescing je `esp_id+gpio`, frame-batching (`requestAnimationFrame`), sampling fuer non-critical feeds.
- Akzeptanz: UI bleibt responsiv unter Lasttest-Burst.

## F05-D: Queue-Implementierung bereinigen (niedrig)

- Ziel: entweder echte Queue-Nutzung oder Entfernen toter Queue-Pfade.
- Akzeptanz: kein "dead buffering" Konzept im Code.

---

## 9) Endbewertung gegen Akzeptanzkriterien

- Kriterium "Jedes produktive Event hat klare Ownership": erfuellt (35/35 im ESP-Store-Pfad).
- Kriterium "Jede Driftstelle hat konkrete Auswirkung und Folgeauftrag": erfuellt (16 Drift-Events + 4 Folgeauftraege).
- Pflichtnachweise E2E und Recovery: erfuellt (Abschnitte 4 und 5).

