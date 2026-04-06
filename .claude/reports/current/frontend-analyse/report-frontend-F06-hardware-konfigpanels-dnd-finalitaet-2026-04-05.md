# Report F06: Hardware, Konfigurationspanels, DnD und Finalitaet

Datum: 2026-04-05  
Scope: `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/components/esp/*.vue`, `El Frontend/src/components/zones/ZoneAssignmentPanel.vue`, `El Frontend/src/composables/useZoneDragDrop.ts`, `El Frontend/src/shared/stores/zone.store.ts`, `El Frontend/src/stores/esp.ts`, `El Frontend/src/utils/contractEventMapper.ts`, `El Frontend/src/shared/stores/intentSignals.store.ts`, `El Frontend/src/api/zones.ts`

## 1) End-to-End-Ketten je Kernaktion (`Klick -> API/WS -> Store -> sichtbarer Endzustand`)

### 1.1 Sensor-Konfiguration (HardwareView -> SensorConfigPanel)

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Sensor speichern | Klick `SensorConfigPanel.handleSave` -> `sensorsApi.createOrUpdate` -> `emit('saved')` -> `HardwareView` schliesst Panel und ruft `espStore.fetchDevice` | Panel schliesst, Device-Daten werden neu geladen |
| Sensor loeschen | Klick `SensorConfigPanel.confirmAndDelete` -> `sensorsApi.delete` (oder Mock-Fallback `espStore.removeSensor`) -> `emit('deleted')` -> `HardwareView` `espStore.fetchDevice` | Panel schliesst, Sensor aus Device entfernt |

### 1.2 Aktor-Konfiguration und Aktor-Befehl

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Aktor speichern (real) | Klick `ActuatorConfigPanel.handleSave` -> `actuatorsApi.createOrUpdate` -> `emit('saved')` -> `HardwareView` `espStore.fetchDevice` | Panel schliesst, Konfig im Device neu geladen |
| Aktor speichern (mock) | Klick `ActuatorConfigPanel.handleSave` -> kein Persistenz-API-Write (nur Toast + `emit('saved')`) -> `HardwareView` `espStore.fetchDevice` | Panel schliesst, UI wirkt gespeichert |
| Aktor schalten/PWM | Klick `toggleActuator`/`setPwmValue` -> `espStore.sendActuatorCommand` -> real: `actuatorsApi.sendCommand` + `registerCommandIntent` + WS-Events; mock: `debugApi.setActuatorState` + `fetchDevice` | Status in Karten/Panel wird via Store/WS sichtbar |
| Emergency Stop | Klick `ActuatorConfigPanel.emergencyStop` -> real: `actuatorsApi.emergencyStop`, mock: `espStore.emergencyStop` | Toast erscheint, real ohne expliziten Panel-Refresh |

### 1.3 Zone-/Subzone-Kontext (Settings-Panel und DnD)

| Aktion | Kette | Sichtbarer Endzustand |
|---|---|---|
| Zone zuweisen (Settings) | Klick `ZoneAssignmentPanel.executeSaveZone` -> `zonesApi.assignZone` -> optimistisches `espStore.updateDeviceZone` -> ggf. `pending_ack` -> WS `zone_assignment` patcht Device ueber `zone.store` | Badge/Status im Panel (`sending/pending_ack/success/timeout/error`), Geraetezuordnung aktualisiert |
| Zone zuweisen (DnD) | Drag `ZonePlate`/`Unassigned` -> `HardwareView.onDeviceDropped` -> `useZoneDragDrop.handleDeviceDrop` -> `zonesApi.assignZone/removeZone` -> `espStore.fetchAll` -> spaeter WS `zone_assignment` | Sofortiger Success-Toast nach REST plus spaeter ACK-Toast |
| Subzone bestaetigt (WS) | WS `subzone_assignment` -> `espStore.handleSubzoneAssignment` -> `zone.store.handleSubzoneAssignment` -> Rueckgabe `needsRefresh` -> `espStore.fetchAll` | Toast + nachgelagerter Voll-Refresh |

## 2) Echter Terminalnachweis pro Aktion (Ist)

| Aktion | Aktueller Terminalnachweis | Bewertung |
|---|---|---|
| Aktor-Befehl | `actuator_response` oder `actuator_command_failed` (Intent-Store/WS) | Gut, contract-nah |
| Config-Pfad (config events) | `config_response` oder `config_failed` mit `correlation_id` | Gut, contract-nah |
| Sequence | `sequence_completed` / `sequence_error` / `sequence_cancelled` | Gut, contract-nah |
| Zone DnD | REST `success` + spaeter optional `zone_assignment` | Inkonsistent, fruehe Gruen-Signale moeglich |
| Zone im Settings-Panel | eigener State `pending_ack` plus Watch auf `currentZoneId` und Timeout | Besser als DnD, aber nicht global vereinheitlicht |
| Subzone | WS `subzone_assignment` + `fetchAll`, kein einheitlicher Intent-Record | Teilweise, kein konsistentes accepted/pending/terminal-Modell |
| Sensor/Aktor-Konfig speichern | HTTP-Erfolg + Panel close + `fetchDevice`; kein eigener terminaler WS-Nachweis im UI-Flow | Semantisch "persisted", aber nicht als Lifecycle modelliert |

## 3) Mock-vs-Real-Drift je Pfad

| Pfad | Real | Mock | Drift-Risiko |
|---|---|---|---|
| Zone zuweisen (Settings) | `mqtt_sent` fuehrt zu `pending_ack` | sofortiger `success` | Unterschiedliches Finalitaetsverstaendnis |
| Zone zuweisen (DnD) | sofortiger Toast nach REST, spaeter WS-ACK | aehnlich, aber ohne echtes MQTT-Warten | DnD wirkt final, obwohl ACK spaeter/unsicher |
| Aktor speichern | Persistenz via `actuatorsApi.createOrUpdate` | nur kosmetischer Erfolg im Panel | Mock kann "persistiert" suggerieren |
| Aktor schalten | REST->MQTT->WS terminal | Debug-API + lokaler Refresh | Verhalten unterschiedlich belastbar |
| Mock-Markierung | Badge `MOCK/REAL` und Mock-Sektion in `ESPSettingsSheet` | vorhanden | Sichtbar im Sheet, nicht zwingend in jedem Action-Feedback |

## 4) DnD-Ereigniskette und Nebenwirkungen

### 4.1 Zone DnD Reihenfolge (beobachtet)
1. `VueDraggable` `@add` in `ZonePlate`/`UnassignedDropBar`
2. `HardwareView.onDeviceDropped`
3. `useZoneDragDrop.handleDeviceDrop` oder `handleRemoveFromZone`
4. REST `zonesApi.assignZone`/`removeZone`
5. `espStore.fetchAll` (voller Snapshot)
6. Success-Toast aus DnD-Composable
7. Spaeter WS `zone_assignment` -> `zone.store.handleZoneAssignment` -> erneute Toast-Rueckmeldung

### 4.2 Doppelte Signale (Toast-Noise)
- Signal 1: REST-Success-Toast in `useZoneDragDrop`.
- Signal 2: ACK-Toast in `zone.store` nach `zone_assignment`.
- Dedup in `useToast` greift nur bei exakt gleicher Message innerhalb 2s; ACK-Texte enthalten oft andere Inhalte (`reason_code`/Bridge-Line), daher kein robustes Deduplizieren.

## 5) Tabelle `Aktion -> aktuelle Rueckmeldung -> fehlende Finalitaet -> Risiko`

| Aktion | Aktuelle Rueckmeldung | Fehlende Finalitaet | Risiko |
|---|---|---|---|
| Zone DnD assign/remove | Sofortiger Gruen-Toast nach REST, spaeter ACK-Toast | Kein einheitlicher terminaler Gate fuer User-initiierte Aktion | P1 |
| Zone Settings assign | `sending/pending_ack/success/timeout/error` | Nicht auf alle Flows uebertragen (DnD hat anderes Modell) | P1 |
| Subzone ACK | Toast + `fetchAll` | Kein dedizierter accepted/pending/terminal Record | P1 |
| Aktor-Befehl | "gesendet" + WS terminal | Doppelte Startsignale (REST + WS start), aber terminal klar | P2 |
| Sensor/Aktor Config Save | HTTP-Erfolg + Panel close | Kein expliziter terminaler Lifecycle in UI | P2 |
| Mock-Aktor Save | Success-Toast ohne echte Persistenzrunde | Simuliert kann als real final missverstanden werden | P1 |

## 6) Abgleich gegen SOLL / Akzeptanzkriterien

### 6.1 SOLL `accepted/pending/terminal` einheitlich
- Ist nur partiell erreicht: stark in `actuator/config/sequence`, schwach bei `zone/subzone` und DnD.

### 6.2 "Keine Kernaktion endet gruen bei nur ACK"
- Nicht erfuellt fuer DnD-Flow: Gruen kommt bereits nach REST-`success`, bevor der asynchrone Bestaetigungspfad abgeschlossen ist.

### 6.3 "Mock-Pfade sichtbar als nicht-persistent"
- Teilweise erfuellt: `MOCK/REAL` sichtbar in `ESPSettingsSheet`; aber einige Erfolgs-Toasts (z. B. Mock-Aktor-Konfig) sind ohne klaren Persistenzhinweis.

### 6.4 "DnD eindeutig, nicht doppelt"
- Nicht erfuellt: REST-Toast plus ACK-Toast fuehren zu redundanter Rueckmeldung.

## 7) Empfohlene Absicherungen (zielgerichtet fuer F06)

1. Einheitliches Action-Lifecycle-Modell fuer Zone/Subzone analog zu Intent-Store (`accepted/pending/terminal`), inkl. zentraler Action-ID.
2. DnD-Erfolg nicht sofort als terminal "gruen" markieren, solange nur REST/Dispatch bestaetigt ist; stattdessen `accepted` oder `pending`.
3. Zone/Subzone-ACK in deduplizierte Rueckmeldung zusammenfuehren (eine Toast-Quelle pro Aktion).
4. Mock-Feedback explizit mit "simuliert/nicht persistent" markieren, speziell in Konfig-Save-Toasts.
5. Contract-Validierung erweitern: `zone_assignment` schema-strikt wie `subzone_assignment`.

## 8) Test-/Nachweisplan (gem. Auftrag)

### E2E
- Zone/Subzone Assignment: Success, Timeout, Partial (DB ok / ACK ausbleibt), Failure.
- DnD in beide Richtungen (Zone->Zone, Zone->Unassigned) mit Prüfung: genau eine eindeutige Rueckmeldung pro Aktion.

### Integration
- Command-Lifecycle von `sendActuatorCommand` bis terminaler Anzeige (`actuator_response`/`actuator_command_failed`).
- Zone-Lifecycle mit simulierten WS-Latenzen: keine voreilige terminale Gruen-Anzeige.
- Mock-vs-Real Assertions: gleiche UI-Transparenz ueber Persistenzstatus.

## 9) Kurzfazit

Die Hardware- und Panel-Kette ist technisch klar verdrahtet, aber Finalitaet ist heute domaenenabhängig umgesetzt.  
Fuer F06 ist der zentrale Gap nicht die API-Verkabelung, sondern die uneinheitliche Semantik zwischen DnD, Settings-Assignment und Intent-Contract-UI.

