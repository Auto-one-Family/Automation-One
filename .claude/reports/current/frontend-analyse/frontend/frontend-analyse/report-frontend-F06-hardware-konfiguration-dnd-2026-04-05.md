# Report F06: HardwareView, Konfig-Panels, DnD-Fluesse

Datum: 2026-04-05  
Scope: `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/components/esp/**`, `El Frontend/src/components/dashboard/ZonePlate.vue`, DnD-nahe Composables/Stores (`useZoneDragDrop`, `useOrbitalDragDrop`, `dragState.store`)

## 1) Navigations- und Triggerkarte (3-Level)

### 1.1 Routenebenen
- `hardware` (`/hardware`) = Level 1, Zonen-Accordion mit Device-Karten.
- `hardware-zone` (`/hardware/:zoneId`) = Scroll-/Expand-Anchor fuer konkrete Zone.
- `hardware-esp` (`/hardware/:zoneId/:espId`) = Level 2, Device-Detail via `DeviceDetailView` + `ESPOrbitalLayout`.

Nachweis:
- Route-Definitionen in `router/index.ts` (`hardware`, `hardware-zone`, `hardware-esp`).
- Level-Bestimmung in `HardwareView.vue` ueber `route.params.espId`.

### 1.2 Triggerpfade (Klick -> Ziel)
- Device-Klick in `ZonePlate`/`DeviceMiniCard` -> `onDeviceCardClick()` -> `zoomToDevice()` -> Route `hardware-esp`.
- Zurueck aus Detail -> `zoomOut()` -> Route `hardware`.
- Query-basierte Oeffnung Sheet: `?openSettings={espId}` wird gewatched und oeffnet `ESPSettingsSheet`.
- Sensor/Aktor-Klick in Detail (`DeviceDetailView`/`ESPOrbitalLayout`) emittiert nach `HardwareView` und oeffnet `SensorConfigPanel`/`ActuatorConfigPanel` in eigenem `SlideOver`.

## 2) Panel-/Sheet-Flows (inkl. Form-Initialisierung)

### 2.1 ESPSettingsSheet (Level-1 Konfiguration/Device-Management)
- Oeffnung:
  - aus `DeviceMiniCard` (Settings-Button),
  - aus Pending-Panel (`@open-esp-config`),
  - aus Query `openSettings`.
- Inhalte:
  - Name editieren (`espStore.updateDevice`),
  - Zone-Zuweisung via `ZoneAssignmentPanel`,
  - Heartbeat/Auto-Heartbeat fuer Mock,
  - Device-Loeschung (`espStore.deleteDevice`),
  - Read-only Subzone-Gruppierung der Sensoren/Aktoren.

### 2.2 SensorConfigPanel
- Initialisierung:
  - Primaer ueber `configId` (`sensorsApi.getByConfigId`) oder Fallback `get(espId,gpio,sensorType)`.
  - Falls kein Persistenztreffer: Defaults/Fallback aus Store.
- Speichern:
  - `sensorsApi.createOrUpdate(...)` mit Schwellenwerten, Betriebsmodus, `schedule_config`, Interface-Feldern, Subzone-Normalisierung, Scope, Metadata, optional Kalibrierung.
- Loeschen:
  - Primaer `sensorsApi.delete(espId, configId)`, fallback fuer Mock ohne `configId` ueber `espStore.removeSensor`.

### 2.3 ActuatorConfigPanel
- Initialisierung:
  - Real: `actuatorsApi.get(espId,gpio)`.
  - Mock: Werte aus Store.
- Speichern:
  - Real: `actuatorsApi.createOrUpdate(...)` inkl. type-spezifischer Felder (Pump/Valve/PWM/Relay), Subzone normalisiert, Scope/Metadata.
  - Mock: nur UI-Bestaetigung (`toast.success`), keine REST-Persistenz dieser Felder.
- Loeschen:
  - `actuatorsApi.delete(espId,gpio)`.
- Laufzeitsteuerung:
  - ON/OFF/PWM via `espStore.sendActuatorCommand`,
  - Emergency-Stop via `espStore.emergencyStop` (Mock) oder `actuatorsApi.emergencyStop` (Real).

## 3) End-to-End-Nachweise: Klick/Drag -> API/WS -> Store -> UI

## A) Sensor-Konfiguration (Happy Path)
1. Klick auf Sensor in Detail (`ESPOrbitalLayout` -> `sensorClick`)  
2. `HardwareView.handleSensorClickFromDetail` setzt `configSensorData` und oeffnet `SlideOver`.  
3. Save in `SensorConfigPanel.handleSave()` -> `sensorsApi.createOrUpdate`.  
4. Bei Erfolg: `@saved` in `HardwareView` schliesst Panel und ruft `espStore.fetchDevice(espId)`.  
5. Sichtbare Wirkung: aktualisierte Sensorwerte/-meta in Detail und Zonenkarte nach Store-Refresh.

Stoerfall:
- API-Fehler -> `toast.error(detail)` im Panel, Panel bleibt offen, keine lokale Optimistik.
- Bei Delete ohne `configId` auf Real-ESP: harte Fehlermeldung (`Sensor-Config-ID fehlt`), kein Fallback.

## B) Aktor-Konfiguration (Happy Path)
1. Klick auf Aktor in Detail (`actuatorClick`) -> `HardwareView` oeffnet `ActuatorConfigPanel`.  
2. Save in `ActuatorConfigPanel.handleSave()` -> `actuatorsApi.createOrUpdate` (Real).  
3. `@saved` in `HardwareView` schliesst Panel + `espStore.fetchDevice(espId)`.  
4. Sichtbare Wirkung: aktualisierte Aktor-Konfig in Device-Detail.

Stoerfall:
- API-Fehler -> `toast.error(detail)`, Panel bleibt offen.
- Mock-Save ist nur UI-bestaetigt (kein API-Write) -> Risiko inkonsistenter Erwartung bei Reload.

## C) Aktor-Befehle (Realtime-Rueckmeldung)
1. UI-Befehl (`toggleActuator`/`setPwmValue`) -> `espStore.sendActuatorCommand`.  
2. Real-ESP: REST `/actuators/{esp}/{gpio}/command` + Intent-Registrierung (`registerCommandIntent`).  
3. WS-Lifecycle:
   - non-terminal: `actuator_command` -> pending timeout startet,
   - terminal success/fail: `actuator_response` oder `actuator_command_failed` -> Intent finalisiert, Toast final.
4. Sichtbare Wirkung: Aktorstatus, Toaster, Intent-Status in UI.

Stoerfall:
- Kein terminales WS-Event -> Timeout-Warnung ("Vorlaeufiger Hinweis..."), Intent bleibt non-terminal-hinweisbehaftet.
- Contract mismatch (`validateContractEvent`) erzeugt Integrationswarnungen statt stiller Fehler.

## D) Zone-Zuweisung aus Settings-Sheet (inkl. Teil-Erfolg/Timeout)
1. User aendert Zone in `ZoneAssignmentPanel`.  
2. Bei Zonewechsel mit bestehender Zone: `zone-before-save` -> `ESPSettingsSheet` oeffnet `ZoneSwitchDialog` (subzone_strategy `transfer|copy|reset`).  
3. Save -> `zonesApi.assignZone`.  
4. Sofortige Optimistik: `espStore.updateDeviceZone(...)` fuer direkte UI-Reaktivitaet.  
5. Wenn `mqtt_sent && !isMock`: Status `pending_ack`, Watch auf `currentZoneId` wartet auf WS-Bestaetigung.  
6. Bei ACK: `success`; bei 30s ohne ACK: `timeout` mit expliziter Meldung "DB gespeichert, ESP-Bestaetigung fehlt".

Stoerfall:
- API-Error/`response.success=false` -> `assignmentState=error`, Banner + Emit `zone-error`.
- Entfernen (`removeZone`) analog mit optimistischer Store-Aenderung.

## E) Zone-Zuweisung via Drag&Drop (Level 1)
1. Drag ESP-Karte (VueDraggable `group="esp-devices"`).  
2. Drop in andere `ZonePlate` -> `device-dropped` -> `HardwareView.onDeviceDropped` -> `useZoneDragDrop.handleDeviceDrop`.
3. API: `zonesApi.assignZone`.
4. Danach **immer** `espStore.fetchAll()` (kein lokaler Optimistic Write in diesem Pfad).
5. Sichtbare Wirkung: Device erscheint nach Reload in Zielzone.

Stoerfall:
- API-Fehler -> `fetchAll()` zur Ruecksynchronisierung + Error-Toast mit Retry-Action.
- Drop in Unassigned -> `handleRemoveFromZone` (DELETE) mit identischem Resync-Muster.

## 4) DnD-Interaktionen und Persistenzeffekte

## 4.1 Zone-Level DnD (`ZonePlate` + `HardwareView`)
- `ZonePlate`:
  - `@add` liest `data-device-id`, findet Device aus `espStore.devices`, emittiert `{device,fromZoneId,toZoneId}`.
  - Archivierte Zonen deaktivieren DnD (`:disabled="isArchived"`).
- `HardwareView`:
  - delegiert an `useZoneDragDrop`.
- Persistenz:
  - `assignZone`/`removeZone` per REST, Server/MQTT-Bruecke, danach Store-Refetch.

## 4.2 Unassigned-DnD
- Eigene `VueDraggable`-Section in `HardwareView`:
  - `@add` -> `handleUnassignedDragAdd` -> `handleRemoveFromZone(device)` falls vorher Zone gesetzt.
- Persistenz:
  - REST DELETE + `fetchAll()`.

## 4.3 Orbital DnD (Komponenten zur Laufzeit hinzufuegen)
- In `ESPOrbitalLayout` + `useOrbitalDragDrop`:
  - Drag aus Sidebar (`add-sensor`/`add-actuator`) -> Drop auf ESP-Container -> AddModal oeffnet.
  - Nach erfolgreichem Add: `espStore.fetchDevice(espId)` + `espStore.fetchGpioStatus(espId)`.
- Sensor-Satellite-Drag fuer Analyse:
  - Auto-Open `AnalysisDropZone` nur fuer Sensoren des selben ESP.

## 4.4 Globaler Drag-Sicherheitsmechanismus
- `dragState.store`:
  - zentraler Drag-State + `DRAG_TIMEOUT_MS=30000`,
  - globaler `dragend`/`Escape`-Fallback,
  - separates Handling fuer native HTML5-Drag vs. VueDraggable.

## 5) Happy Path vs. Stoerfall (kompakt)

| Flow | Happy Path | Stoerfall/Teil-Erfolg |
|---|---|---|
| Sensor Save | REST save -> Toast success -> Panel close -> `fetchDevice` | REST error -> Toast error, Panel offen |
| Aktor Save (Real) | REST save -> Toast success -> Panel close -> `fetchDevice` | REST error -> Toast error |
| Aktor Command | REST command + WS terminal -> final toast | fehlendes terminales Event -> Timeout-Warnung; publish/safety fail -> `actuator_command_failed` |
| Zone Save im Sheet | REST + optimistic store + optional ACK-Wait | ACK-Timeout (30s): DB ok, ESP unbestaetigt |
| Zone DnD | REST + `fetchAll` -> UI konsistent | API-Error -> rollback via `fetchAll` + Retry-Toast |
| Unassigned DnD | REST remove + `fetchAll` | API-Error -> Error-Toast + Resync |

## 6) DnD-Risiken (Akzeptanzkriterium)

### R1: Desync zwischen Optimistik und ACK
- Ort: `ZoneAssignmentPanel` nutzt optimistische Store-Aktualisierung vor ESP-ACK.
- Abfederung: expliziter `pending_ack`/`timeout`-State; WS-Ack-Listener.
- Restrisiko: Device wirkt bereits verschoben, obwohl Firmware evtl. nicht uebernommen hat.

### R2: Doppelte Rueckmeldung (UX-Noise)
- Ort: Zonenfluss gibt teils lokale Erfolgsmeldung plus spaetere WS-Toast aus `zone.store`.
- Auswirkung: doppelte Erfolgssignale moeglich.
- Risiko: niedrig-mittel (kein Datenverlust, aber Operator-Rauschen).

### R3: Ghost/Haengender Drag-State
- Ort: Komplexe Mischung aus VueDraggable + nativen Drags.
- Abfederung: `dragState` mit Timeout, globalem `dragend`, `Escape`, getrenntem EspCard-Handling.
- Risiko: niedrig (robust abgefedert).

### R4: Reihenfolge-/Datenquellen-Konflikt beim Drop
- Ort: `ZonePlate` bestimmt `fromZoneId` aus aktuellem `espStore.devices` statt Drag-Payload-Quelle.
- Auswirkung: bei sehr schneller Folge von Events theoretisch falsche "fromZone"-Historie/Toasttext.
- Risiko: mittel (fachlich meist korrekt wegen nachfolgendem `fetchAll`, aber Audit/History-Semantik kann unscharf sein).

### R5: Mock vs Real Konfig-Persistenz asymmetrisch
- Ort: `ActuatorConfigPanel.handleSave` fuer Mock nur lokale Erfolgsmeldung.
- Auswirkung: Erwartung "gespeichert" kann bei Reload brechen.
- Risiko: mittel (vor allem in Test-/Demo-Szenarien).

## 7) Bewertung gegen Akzeptanzkriterien

- **Kein Konfig-Trigger ohne E2E-Nachweis**: erfuellt (Sensor/Aktor Save/Delete, Aktor Command-Lifecycle, Zone-Sheet, Zone-DnD, Orbital-DnD).
- **DnD-Risiken bewertet (Desync/Ghost/Reihenfolge)**: erfuellt (Abschnitt 6 mit Abfederung + Restrisiko).
- **Happy Path vs. Stoerfall belegt**: erfuellt (Abschnitte 3 und 5).

## 8) Kurzfazit

Der Hardwarebereich ist technisch konsistent und robust gegen haengende Drag-Zustaende, mit klaren End-to-End-Flows ueber REST + WS. Die groessten fachlichen Risiken liegen aktuell nicht in fehlender Funktion, sondern in Rueckmeldesemantik (optimistische Zone-Updates vs. spaete ACK-Finalitaet) und inkonsistenten Persistenzpfaden zwischen Mock und Real.

