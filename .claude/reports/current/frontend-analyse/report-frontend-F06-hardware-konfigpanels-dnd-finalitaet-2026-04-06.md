# Report F06: Hardware, Konfigurationspanels, DnD und Finalitaet

Datum: 2026-04-06  
Scope: `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/components/esp/SensorConfigPanel.vue`, `El Frontend/src/components/esp/ActuatorConfigPanel.vue`, `El Frontend/src/components/zones/ZoneAssignmentPanel.vue`, `El Frontend/src/composables/useZoneDragDrop.ts`, `El Frontend/src/composables/useOrbitalDragDrop.ts`, `El Frontend/src/composables/useToast.ts`, `El Frontend/src/components/dashboard/ZonePlate.vue`, `El Frontend/src/shared/stores/zone.store.ts`, `El Frontend/src/shared/stores/actuator.store.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/api/zones.ts`, `El Frontend/src/api/sensors.ts`, `El Frontend/src/api/actuators.ts`

## 1) End-to-End-Ketten je Kernaktion (`Klick -> API/WS -> Store -> sichtbarer Endzustand`)

### 1.1 Sensor-Aktionen (Hardware-Kontext)

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Sensor speichern | Klick `SensorConfigPanel.handleSave` -> `sensorsApi.createOrUpdate` -> `emit('saved')` -> `HardwareView` schliesst Panel + `espStore.fetchDevice` | Panel schliesst, Sensorwerte/Config werden nachgeladen |
| Sensor loeschen | Klick `SensorConfigPanel.confirmAndDelete` -> `sensorsApi.delete` (fallback mock: `espStore.removeSensor`) -> `emit('deleted')` -> `HardwareView` `fetchDevice` | Sensor verschwindet aus Device-Detail und Settings |

### 1.2 Aktor-Aktionen (Konfig + Schalten)

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Aktor speichern (real) | Klick `ActuatorConfigPanel.handleSave` -> `actuatorsApi.createOrUpdate` -> `emit('saved')` -> `HardwareView` `fetchDevice` | Panel schliesst, persistierte Konfig sichtbar |
| Aktor speichern (mock) | Klick `ActuatorConfigPanel.handleSave` -> kein Persistenz-API-Write, nur Toast + `emit('saved')` -> `HardwareView` `fetchDevice` | UI zeigt Erfolg, Persistenzgrad bleibt simuliert |
| Aktor ON/OFF/PWM (real) | Klick `toggleActuator`/`setPwmValue` -> `espStore.sendActuatorCommand` -> REST `actuatorsApi.sendCommand` (`correlation_id`) -> WS `actuator_command` (pending) -> WS `actuator_response` oder `actuator_command_failed` (terminal) | Lifecycle-Toastfolge, finaler Erfolg/Fehler erst bei terminalem WS-Event |
| Aktor ON/OFF/PWM (mock) | Klick `toggleActuator`/`setPwmValue` -> `debugApi.setActuatorState` -> `espStore.fetchDevice` | Sofortiger Simulationszustand ohne MQTT-ACK-Kette |
| Emergency-Stop (real) | Klick `ActuatorConfigPanel.emergencyStop` -> `actuatorsApi.emergencyStop` | Warn-Toast erscheint; finaler Aktorzustand folgt asynchron ueber Store/WS/Reload |

### 1.3 Zone-/Subzone-Aktionen (Settings + DnD)

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Zone zuweisen (Settings-Panel) | Klick `ZoneAssignmentPanel.saveZone` -> `zonesApi.assignZone` -> `espStore.updateDeviceZone` (optimistisch) -> State `pending_ack` bei `mqtt_sent && !isMock` -> Watch auf `currentZoneId` + WS `zone_assignment` -> `success`/`timeout` | Badge-Lifecycle (`sending/pending_ack/success/timeout/error`) + Device-Zone im UI |
| Zone entfernen (Settings-Panel) | Klick `ZoneAssignmentPanel.removeZone` -> `zonesApi.removeZone` -> `espStore.updateDeviceZone` (optimistisch) | Sofortige UI-Aenderung und Success-Banner, unabhaengig von spaeterem ACK |
| Zone zuweisen via DnD | Drag in `ZonePlate` -> `HardwareView.onDeviceDropped` -> `useZoneDragDrop.handleDeviceDrop` -> `zonesApi.assignZone` -> `espStore.fetchAll` -> Toast success -> spaeter WS `zone_assignment` -> `zone.store` Toast | Doppelte Rueckmeldung moeglich (REST + ACK) |
| Aus Zone entfernen via DnD | Drag in Unassigned-Bereich -> `handleRemoveFromZone` -> `zonesApi.removeZone` -> `fetchAll` -> Toast success -> spaeter WS `zone_assignment(zone_removed)` | Gleicher Doppel-Signal-Pfad |
| Subzone ACK | WS `subzone_assignment` -> `zone.store.handleSubzoneAssignment` -> optional `espStore.fetchAll` | Toast + Rehydrate; keine gemeinsame Intent-Lifecycle-Entitaet |

## 2) Echte Terminalnachweise pro Aktion (Ist)

| Aktion | Echter terminaler Nachweis | Bewertung |
|---|---|---|
| Aktor-Befehl | `actuator_response` oder `actuator_command_failed` (korrelationsbezogen) | Gut (contract-first, terminal klar) |
| Config-Lifecycle | `config_response` oder `config_failed` mit `correlation_id` | Gut (terminal klar, mismatch guard vorhanden) |
| Sequence-Lifecycle | `sequence_completed` / `sequence_error` / `sequence_cancelled` | Gut |
| Zone Settings (real) | `pending_ack` -> success nur bei WS-Zonenwechselbeobachtung, sonst timeout | Teilweise gut, nur in diesem UI-Pfad |
| Zone DnD | Erfolg bereits nach REST + `fetchAll`, nicht erst nach WS-Terminalbeleg | Schwach (voreilige Gruen-Signale) |
| Subzone | `subzone_assignment`-Event + optional `fetchAll` | Mittel (kein globales accepted/pending/terminal-Modell) |
| Sensor-/Aktor-Config Save | HTTP-Erfolg + Panel-Close + Reload | Technisch valide, aber kein lifecycle-basiertes Terminalmodell |

## 3) Mock-vs-Real-Drift je Pfad

| Pfad | Real | Mock | Drift-Risiko |
|---|---|---|---|
| Zone Settings | `mqtt_sent` fuehrt zu `pending_ack`, timeout moeglich | meist direkte success-Route | Unterschiedliche Erwartung an Finalitaet |
| Zone DnD | REST-Success + spaeter ACK-Toast | analoger UI-Erfolg, aber ohne echte MQTT-Bestaetigungspflicht | "Gruen" kann zu frueh wirken |
| Aktor Save | Persistenz ueber `actuatorsApi.createOrUpdate` | nur lokaler Erfolg ohne gleiche Persistenzkette | Simuliert wirkt wie produktiv persisted |
| Aktor Command | REST->MQTT->WS-terminal | Debug-API + lokaler Refresh | Lifecycle-Invariante nicht gleich stark |
| Sensor Save | API-path fuer beide (Single Source) | API-path fuer beide | Geringere Drift als bei Aktor-Save |
| Mock-Kennzeichnung | Device-Badges/Labels vorhanden | vorhanden | Kennzeichnung nicht in jeder Success-Meldung enthalten |

## 4) DnD-Reihenfolge und Nebenwirkungen (kausale Ereigniskette)

### 4.1 Ist-Kette bei Zone-DnD
1. `VueDraggable @add` in `ZonePlate` oder Unassigned-Sektion.
2. `HardwareView` ruft `handleDeviceDrop`/`handleRemoveFromZone`.
3. `useZoneDragDrop` macht REST (`assignZone`/`removeZone`).
4. Bei REST-success: `espStore.fetchAll` und sofortiger Success-Toast.
5. Asynchron folgt WS `zone_assignment`.
6. `zone.store.handleZoneAssignment` erzeugt erneut Success-/Error-Toast.

### 4.2 Nebenwirkungen
- Doppeltes Operator-Signal: einmal bei REST-success, einmal beim ACK-Event.
- Kausalitaet fuer Nutzer unscharf: erster Gruen-Toast kann als terminal interpretiert werden, obwohl Bestaetigung erst danach kommt.
- Bei hoher Eventdichte: Toast-Noise statt eindeutiger Aktion->Ende-Beziehung.

## 5) Tabelle `Aktion -> aktuelle Rueckmeldung -> fehlende Finalitaet -> Risiko`

| Aktion | Aktuelle Rueckmeldung | Fehlende Finalitaet | Risiko |
|---|---|---|---|
| Zone assign/remove via DnD | Sofortiger Success-Toast nach REST + spaeter ACK-Toast | Kein einheitlicher terminaler Gate vor Gruen | P1 |
| Zone assign via Settings | `sending/pending_ack/success/timeout/error` | Modell nicht ueber alle Zone-Pfade harmonisiert | P1 |
| Subzone assign/remove | ACK-Toast + ggf. Rehydrate | Kein zentraler Lifecycle-Record (`accepted/pending/terminal`) | P1 |
| Aktor command | accepted/pending/terminal via WS-Lifecycle | Startsignale doppelt moeglich (REST info + WS pending), aber terminal robust | P2 |
| Sensor-/Aktor-Config Save | HTTP-success + Reload | Kein explizites terminales Contract-Signal im UI-Fluss | P2 |
| Mock Aktor Save | Success-Toast trotz fehlender realer Persistenzroute | Simulationscharakter in Outcome nicht explizit genug | P1 |

## 6) Akzeptanzkriterien-Abgleich

### 6.1 Keine Kernaktion endet "gruen", wenn nur ACK vorliegt
- **Nicht erfuellt** fuer DnD: Gruen bereits bei REST-Erfolg, vor ACK-Terminalbeleg.

### 6.2 Mock-Pfade sichtbar als nicht-persistent
- **Teilweise erfuellt**: Mock-Badges existieren, aber nicht alle Erfolgs-Feedbacks markieren "simuliert".

### 6.3 DnD-Flow mit eindeutiger, nicht doppelter Rueckmeldung
- **Nicht erfuellt**: REST-Toast + ACK-Toast erzeugen doppelte Signalkette.

## 7) Zielbild fuer F06 (SOLL-Map)

1. Pro User-Aktion genau ein Lifecycle-Objekt: `accepted -> pending -> terminal_*`.
2. Zone/Subzone-Flows werden auf dasselbe Lifecycle-Modell wie Aktor/Config gehoben.
3. Gruen nur bei terminalem Endnachweis, nicht bei Dispatch/REST-Akzeptanz.
4. Mock-Responses tragen explizit "simuliert / nicht persistenzgleich".
5. Toasts werden pro Aktion dedupliziert (Action-ID/Korrelation statt Nachrichtentext).

## 8) Tests/Nachweise (auftragsspezifisch)

### E2E
- Zone/Subzone Assignment: Success, Timeout, Failure, Partial (DB gespeichert, ACK fehlt).
- DnD Zone->Zone und Zone->Unassigned: genau eine kausale Endrueckmeldung je Aktion.
- Mock vs Real: identische Lifecycle-Visualisierung, aber klar getrennte Persistenzaussage.

### Integration
- `sendActuatorCommand`: REST-accepted bis terminales WS-Event.
- ZoneAssignmentPanel: `pending_ack` geht nur bei echtem WS-Nachweis auf success.
- DnD: keine vorzeitige Terminalanzeige, wenn nur REST erfolgreich war.

## 9) Kurzfazit

Die technische Verkabelung im Hardware-Bereich ist belastbar, aber die Bediensemantik fuer Finalitaet ist derzeit uneinheitlich.  
Der Hauptgap in F06 ist nicht "fehlende API", sondern die inkonsistente Endzustandslogik zwischen DnD, Settings-Assignment und bestehendem Intent-Lifecycle.

## 10) Update 2026-04-06 (Fixstand nach Umsetzung)

### 10.1 Umgesetzte Haertungen

| Cluster | Umsetzung | Dateien |
|---|---|---|
| Aktor-Timeout terminalisieren | Pending-Intents werden nach 30s deterministisch als terminal fehlgeschlagen geschlossen (`actuator_timeout`) statt dauerhaft pending | `src/shared/stores/actuator.store.ts` |
| Offline/Stale-Guard | Aktor-Status-Events mit altem Timestamp werden nach Offline-Reset verworfen (Epoch-Guard) | `src/shared/stores/actuator.store.ts`, `src/stores/esp.ts` |
| DnD-Cleanup | Explizites `endDrag()` bei Modal-Cancel/Close und bei invaliden Drop-Payloads, fruehe Returns ohne Fallthrough | `src/composables/useOrbitalDragDrop.ts` |
| Doppelte Delete-Rueckmeldungen | Einheitliche Toast-Deduplizierung ueber `dedupeKey`; REST-Delete fuer real als accepted, finale Loeschsicht ueber WS | `src/composables/useToast.ts`, `src/stores/esp.ts`, `src/components/esp/SensorConfigPanel.vue`, `src/components/esp/ActuatorConfigPanel.vue` |
| Doppel-Refresh bei Subzone | WS-Delta-Patch bevorzugt; Full-Refresh nur noch als Fallback und debounced | `src/shared/stores/zone.store.ts`, `src/stores/esp.ts` |
| Mock-Sichtbarkeit | Explizite `[Simulation]`-Hinweise in Konfig-Panels und Mock-Aktions-Feedback | `src/components/esp/SensorConfigPanel.vue`, `src/components/esp/ActuatorConfigPanel.vue`, `src/stores/esp.ts` |

### 10.2 Aktualisierte Bewertung

| Kriterium | Stand |
|---|---|
| Kein Intent bleibt unbegrenzt pending | Erfuellt (Aktor-Intent-Timeout mit terminalem Endzustand) |
| DnD-Cleanup deterministisch | Erfuellt fuer Modal-Cancel/invalid drop |
| Delete-Feedback ohne Doppeltoast | Weitgehend erfuellt (dedupeKey-basiert) |
| Out-of-order-Resistenz nach Offline | Erfuellt fuer `actuator_status` |
| Sensor-Create nur mit echtem terminal-success | Teilweise: REST wird nicht mehr als finaler gruener Abschluss fuer real behandelt, terminale Endquelle im aktuellen UI-Pfad weiterhin als Integrationsluecke markiert |

### 10.3 Testnachweis (gezielt)

- Unit gruen: `tests/unit/stores/actuator.store.test.ts` (Timeout->terminal, stale-event-guard)
- Unit gruen: `tests/unit/composables/useOrbitalDragDrop.test.ts` (Cancel-Cleanup, unknown drop cleanup)
- Unit gruen: `tests/unit/composables/useToast.test.ts` (`dedupeKey`-basierte Deduplizierung)
- Regressionscheck gruen: `tests/unit/stores/esp.test.ts`

