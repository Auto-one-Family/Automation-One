# F06 — Hardware, Konfigurationspanels, DnD und Finalitaet

> **Typ:** Analysebericht
> **Erstellt:** 2026-04-06
> **Bereich:** AutomationOne / El Frontend
> **Status:** Abgeschlossen
> **Methodik:** Statische Code-Analyse aller relevanten Stores, Composables, API-Clients und Komponenten

---

## 1. Executive Summary

Die HardwareView-Architektur ist grundsaetzlich solide aufgebaut: Server-zentrisch, mit klarer Store-Hierarchie und einem WS-Dispatcher-Pattern im esp.store. Die Intent-Tracking-Logik im actuator.store ist die staerkste Komponente — sie verhindert zuverlaessig doppelte Terminal-Events und bietet echte Finalitaet.

**Kernbefunde:**

- **7 Aktionen** analysiert, davon **3 mit Finalitaetsproblemen**
- **Mock-vs-Real-Drift** in 4 von 7 Pfaden nachweisbar
- **DnD-System** funktional, aber mit 2 mittelschweren State-Leak-Risiken
- **Toast-Duplikation** durch Mehrfach-Delegation an Sub-Stores moeglich

---

## 2. End-to-End-Ketten je Kernaktion

### 2.1 Aktor-Kommando (ON/OFF/PWM)

```
Klick "ON"
  -> esp.store.sendActuatorCommand()
  -> [Mock] debugApi.setActuatorState() -> fetchDevice() -> FERTIG
  -> [Real] actuatorsApi.sendCommand()
         -> registerCommandIntent(correlationId) -> state="accepted"
         -> WS actuator_command -> handleActuatorCommand()
              -> state="pending", Toast "Befehl in Bearbeitung"
              -> setTimeout(10s) fuer Timeout-Warnung
         -> WS actuator_response(success=true)
              -> handleActuatorResponse() -> finalizeIntent()
              -> state="terminal_success", Toast "bestaetigt"
         ODER
         -> WS actuator_response(success=false) -> "terminal_failed"
         ODER
         -> WS actuator_command_failed -> "terminal_failed"
         ODER
         -> 10s Timeout -> appendNonTerminalHint() -> state bleibt "pending"
```

**Terminalnachweis:** `actuator_response` mit `success=true/false` — **vorhanden und korrekt**.

### 2.2 Sensor erstellen (SensorConfigPanel)

```
Klick "Sensor hinzufuegen"
  -> AddSensorModal oeffnet
  -> Submit -> SensorConfigPanel.handleSave()
  -> [Mock] debugApi.addSensor() -> espStore.fetchAll()
  -> [Real] sensorsApi.create() -> espStore.fetchAll()
  -> Toast success ODER error
  -> WS sensor_data beginnt (wenn ESP sendet)
```

**Terminalnachweis:** REST-Response + fetchAll() Refresh. **Kein WS-basierter Terminalnachweis** — REST-Erfolg wird als terminal behandelt.

### 2.3 Sensor loeschen

```
Klick "Loeschen" -> Confirm-Dialog
  -> sensorsApi.delete() -> espStore.fetchAll()
  -> Toast success
  -> WS sensor_config_deleted -> handleSensorConfigDeleted()
       -> Entfernt Sensor aus device.sensors, Info-Toast
```

**Terminalnachweis:** REST + fetchAll(). WS-Event ist **zusaetzliche Bestaetigung**, kann aber zu **doppeltem Toast** fuehren (REST-Erfolg + WS-Event).

### 2.4 Zone zuweisen (DnD)

```
Drag ESP-Card -> Drop auf Zone-Gruppe
  -> useZoneDragDrop.handleDeviceDrop()
  -> [Kein optimistisches Update!] isProcessing=true
  -> zonesApi.assignDevice(deviceId, zoneId)
  -> espStore.fetchAll() (vollstaendiger Refresh)
  -> Toast success, pushToHistory(undoStack)
  -> WS zone_assignment -> handleZoneAssignment()
       -> Patched device.zone_id, zone_name
```

**Terminalnachweis:** REST + fetchAll(). WS-Event ist **konfirmierend** aber nicht primary. **Kein optimistisches Update** — korrekte Design-Entscheidung fuer Server-Zentrisch.

### 2.5 Zone zuweisen (Dropdown)

```
ZoneAssignmentDropdown.handleSelect()
  -> Gleicher Pfad wie 2.4 (handleDeviceDrop)
  -> Identische API/Store/WS-Kette
```

### 2.6 Subzone zuweisen

```
SubzoneAssignmentSection -> Dropdown-Auswahl
  -> subzonesApi.assign(deviceId, sensorId, subzoneId)
  -> espStore.fetchAll()
  -> Toast success
  -> WS subzone_assignment -> handleSubzoneAssignment()
       -> Conditional fetchAll() (T14-Fix-F)
```

**Terminalnachweis:** REST + fetchAll(). WS hat **bedingten Refresh** — kann zu **zweitem fetchAll()** fuehren.

### 2.7 Config publizieren (Sensor/Aktor-Konfiguration)

```
Config-Aenderung -> Publish
  -> POST /config -> correlation_id
  -> WS config_published -> handleConfigPublished()
       -> createOrUpdateIntentPending() -> state="pending"
  -> WS config_response(status="success")
       -> handleConfigResponse() -> finalizeIntent()
       -> state="terminal_success"
  ODER
  -> WS config_failed -> handleConfigFailed()
       -> state="terminal_failed", Toast error
```

**Terminalnachweis:** `config_response` mit Correlation-Match — **vorhanden und korrekt**.

---

## 3. Finalitaetstabelle

| Aktion | Aktuelle Rueckmeldung | Echter Terminalnachweis | Fehlende Finalitaet | Risiko |
|--------|----------------------|------------------------|---------------------|--------|
| Aktor ON/OFF | Intent-State-Machine mit terminal_success/failed | actuator_response WS | Timeout bleibt "pending" ohne Terminal | **Mittel** — Nutzer sieht "Warnung" aber kein Endzustand |
| Sensor erstellen | REST 200 + fetchAll + Toast | Nur REST-Response | Kein WS-basierter Nachweis dass ESP Config erhalten hat | **Hoch** — Server-ACK ≠ ESP-Empfang |
| Sensor loeschen | REST 200 + Toast + WS sensor_config_deleted | REST + WS doppelt | Doppelter Toast moeglich | **Niedrig** — Funktional korrekt, UX-Noise |
| Zone zuweisen (DnD) | REST + fetchAll + Toast | REST + WS zone_assignment | WS-Event kann zweiten State-Patch ausloesen | **Niedrig** — Idempotent |
| Zone zuweisen (DD) | Identisch mit DnD | Identisch | Identisch | **Niedrig** |
| Subzone zuweisen | REST + fetchAll + Toast | REST + WS subzone_assignment | WS kann zweites fetchAll() triggern | **Niedrig** — Performance |
| Config publizieren | Intent-State-Machine | config_response WS | Korrekt implementiert | **Keine** |

---

## 4. Mock-vs-Real-Drift

| Pfad | Mock-Verhalten | Real-Verhalten | Drift |
|------|---------------|----------------|-------|
| **Aktor-Kommando** | `debugApi.setActuatorState()` -> sofortiger fetchDevice() -> kein Intent-Tracking | `actuatorsApi.sendCommand()` -> registerCommandIntent() -> WS-Lifecycle mit Terminal-State | **HOCH** — Mock zeigt sofort "fertig", Real hat mehrstufigen Lifecycle |
| **Sensor erstellen** | `debugApi.addSensor()` -> fetchAll() | `sensorsApi.create()` -> fetchAll() | **Niedrig** — Gleicher REST-basierter Flow |
| **Emergency Stop** | `debugApi.emergencyStop()` -> fetchDevice() | `actuatorsApi.emergencyStop()` -> kein Intent-Tracking | **Mittel** — Mock hat expliziten Refresh, Real verlaesst sich auf WS |
| **Heartbeat** | `debugApi.triggerHeartbeat()` + manueller useWebSocket-Fetch | Automatischer MQTT-Heartbeat | **Mittel** — Komplett anderer Mechanismus |
| **Device Approve** | N/A (Mock braucht keine Approval) | espApi.approveDevice() -> WS device_approved | **HOCH** — Pfad existiert nur fuer Real |
| **Config Publish** | Kein Config-Publish fuer Mock | Intent-State-Machine mit WS config_response | **HOCH** — Kein Mock-Aequivalent |
| **Zone Assignment** | Gleicher API-Pfad | Gleicher API-Pfad | **Keine** |

**Sichtbarkeit:** Mock-Interaktionen sind im UI **nicht als simuliert gekennzeichnet**. Es gibt keine visuelle Unterscheidung zwischen Mock- und Real-ESP-Aktionen fuer den Nutzer.

---

## 5. DnD-Analyse: Ereigniskette und Nebenwirkungen

### 5.1 Drag-Typen und Drop-Targets

| Drag-Typ | Quelle | Gueltige Targets | Ergebnis |
|----------|--------|-----------------|----------|
| SensorType | Sidebar | ESPOrbitalLayout | Oeffnet AddSensorModal |
| Sensor (Satellite) | ESP-Device | AnalysisDropZone | Fuegt Sensor zu Chart hinzu |
| ActuatorType | Sidebar | ESPOrbitalLayout | Oeffnet AddActuatorModal |
| DashboardWidget | FAB | Dashboard Grid | Erstellt Widget |
| ESPCard | ZoneAssignmentPanel | Zone-Gruppen | Zone-Zuweisung (VueDraggable) |

### 5.2 Identifizierte Risiken

#### R1: Modal-Dismiss raeumt Drag-State nicht auf (HOCH)

```
Drag SensorType -> Drop auf ESP -> AddSensorModal oeffnet
  -> Nutzer klickt "Abbrechen"
  -> Modal schliesst, droppedSensorType wird zurueckgesetzt
  -> ABER: dragState.isDraggingSensorType bleibt TRUE
  -> Naechste ESPOrbitalLayout zeigt weiterhin Drag-Over-Visuals
```

**Ursache:** `useOrbitalDragDrop` setzt nur lokalen State zurueck (Zeile 174-185), ruft aber **nicht** `dragStore.endDrag()` auf.

**Safety-Net:** Global dragend Listener (30s Timeout) raeumt irgendwann auf.

#### R2: Sensor-Drag kann Chart UND Modal oeffnen (MITTEL)

```
Drag Sensor-Satellite von ESP1 -> Hover ueber ESP1
  -> Watcher oeffnet automatisch Chart (analysisExpanded=true)
  -> Drop auf ESP1 (statt auf AnalysisDropZone)
  -> onDrop() loggt "should be handled by AnalysisDropZone"
  -> ABER: kein expliziter Return — Execution laeuft weiter
```

**Ursache:** Fehlender `return` in `useOrbitalDragDrop` Zeile 159-163.

#### R3: Toast-Duplikation bei Zone-DnD (MITTEL)

```
handleDeviceDrop() -> API-Erfolg -> Toast success
  -> espStore.fetchAll() triggered
  -> WS zone_assignment event -> handleZoneAssignment()
  -> Kein zweiter Toast (WS-Handler zeigt keinen Toast) ✓
```

**Aktueller Stand:** Toast-Duplikation bei Zone-DnD ist **nicht vorhanden** — der WS-Handler patched nur den Store ohne Toast. **Aber:** Bei Sensor-Loeschung ist sie vorhanden (REST-Toast + WS-Toast).

#### R4: Undo/Redo Race bei Schnellem Klick (NIEDRIG)

```
Undo() setzt isProcessing=true
  -> Zwischen setzen und canUndo-Recompute: zweiter Undo() moeglich
  -> Theoretisch parallele API-Calls
```

**Mitigation:** `canUndo` Computed prueft `!isProcessing`. UI sollte Button disablen.

### 5.3 DnD-Cleanup-Kette

```
1. Drop-Handler (Komponente) — SOLLTE endDrag() rufen, tut es aber NICHT immer
2. Global dragend Listener — 100ms Verzoegerung, dann endDrag() falls noch aktiv
3. Safety Timeout — 30s, automatischer Reset als letzte Verteidigung
```

---

## 6. WS-Dispatch: Duplikations- und Timing-Risiken

### 6.1 Duplikationsmatrix

| WS-Event | Store 1 | Store 2 | Toast-Duplikation? |
|----------|---------|---------|-------------------|
| error_event | esp.store (Dispatch) | notification.store (Toast) | Nein — nur notification.store zeigt Toast |
| config_published | actuator.store (Intent) | config.store (State) | **Moeglich** — beide koennten Toast zeigen |
| config_failed | actuator.store (Intent) | config.store (State) | **Moeglich** — error-Toast von beiden |
| sensor_config_deleted | esp.store (Array-Patch) | — | + REST-Erfolg-Toast = **Doppelt** |
| actuator_config_deleted | esp.store (Array-Patch) | — | + REST-Erfolg-Toast = **Doppelt** |

### 6.2 Timing-Risiken

| Szenario | Risiko | Schwere |
|----------|--------|---------|
| esp_health + device_approved gleichzeitig | Doppeltes fetchAll() | Mittel |
| actuator_status vor config_response | GPIO zeigt alten Wert bis Config-ACK | Niedrig |
| Offline-Device + verspaeteter actuator_status | State wird faelschlich restored | **Hoch** |
| Sequence-Step vor vorherigem actuator_status | Stale Actuator-State waehrend Sequenz | Niedrig |

### 6.3 useToast Dedup-Schutz

- **2-Sekunden-Fenster:** Identische Toasts (gleicher Text + Typ) innerhalb 2s werden dedupliziert
- **Max 20 Toasts** gleichzeitig, 10 persistent
- **Hilft bei:** sensor_config_deleted Doppel-Toast (wenn < 2s Abstand)
- **Hilft NICHT bei:** Unterschiedlicher Toast-Text (REST "Erfolgreich" vs. WS "Konfiguration geloescht")

---

## 7. Empfehlungen

### P1 — Sensor-Erstellen: Fehlende ESP-Bestaetigung

**Problem:** `sensorsApi.create()` -> REST 200 wird als terminal behandelt, obwohl die Config noch nicht beim ESP angekommen sein muss.

**Empfehlung:** Config-Publish-Flow (Intent-State-Machine) auch fuer Sensor-Create nutzen. Erst `config_response` als terminal werten.

### P1 — Aktor-Timeout: Kein Terminal-State

**Problem:** Nach 10s Timeout bleibt Intent in "pending". Nutzer sieht Warnung aber keinen Endzustand.

**Empfehlung:** Nach konfiguriertem Maximum (z.B. 30s) explizit `terminal_failed` setzen mit Retry-Action.

### P2 — Mock-Kennzeichnung

**Problem:** Mock-ESPs sind im UI nicht als solche sichtbar. Nutzer kann Mock-Aktionen mit echten verwechseln.

**Empfehlung:** Visueller Badge "MOCK" auf Device-Cards. Toast-Prefix "[Simulation]" bei Mock-Aktionen.

### P2 — DnD Modal-Dismiss Cleanup

**Problem:** `dragState.isDraggingSensorType` bleibt true nach Modal-Cancel.

**Empfehlung:** In `useOrbitalDragDrop` bei Modal-Close explizit `dragStore.endDrag()` rufen.

### P3 — Toast-Deduplikation bei Config-Delete

**Problem:** REST-Erfolg-Toast + WS sensor_config_deleted Toast = Doppel.

**Empfehlung:** WS-Handler fuer config_deleted keinen eigenen Toast zeigen (REST-Toast reicht) ODER REST-Seite keinen Toast zeigen (WS ist authoritative).

### P3 — Offline-Device + Verspaeteter actuator_status

**Problem:** Nach esp_health(offline) werden Aktoren zurueckgesetzt, aber ein verspaeteter actuator_status stellt faelschlich alten State wieder her.

**Empfehlung:** Timestamp-Vergleich in handleActuatorStatus: Nur patchen wenn `event.timestamp > device.last_offline_at`.

---

## 8. Akzeptanzkriterien-Check

| Kriterium | Status | Nachweis |
|-----------|--------|----------|
| Keine Kernaktion endet mit "gruen" wenn nur ACK vorliegt | **Teilweise erfuellt** | Aktor-Kommandos: ✓ (Intent-Machine). Sensor-Create: ✗ (REST-ACK = "fertig"). Config-Publish: ✓ |
| Mock-Pfade sichtbar als nicht-persistent | **Nicht erfuellt** | Keine visuelle Mock-Kennzeichnung vorhanden |
| DnD-Flow besitzt eindeutige, nicht doppelte Rueckmeldung | **Teilweise erfuellt** | Zone-DnD: ✓. Sensor-Delete: ✗ (Doppel-Toast). Config-Events: ✗ (Multi-Store-Toast) |

---

## 9. Dateien-Referenz

| Datei | Relevanz |
|-------|----------|
| `src/stores/esp.ts` | WS-Dispatcher, Mock-Detection, 37 Handler |
| `src/shared/stores/actuator.store.ts` | Intent-State-Machine, Command-Lifecycle |
| `src/shared/stores/zone.store.ts` | Zone/Subzone WS-Handler |
| `src/shared/stores/dragState.store.ts` | DnD-Koordination, Safety-Timeout |
| `src/composables/useZoneDragDrop.ts` | Zone-DnD, Undo/Redo |
| `src/composables/useOrbitalDragDrop.ts` | Sensor/Aktor-Drop, Chart-Auto-Open |
| `src/composables/useToast.ts` | Dedup-Logik (2s Fenster) |
| `src/components/esp/SensorConfigPanel.vue` | Sensor-CRUD UI |
| `src/components/esp/ActuatorConfigPanel.vue` | Aktor-CRUD UI |
| `src/services/websocket.ts` | WS-Singleton, Reconnect-Logik |

---

*Bericht erstellt durch statische Code-Analyse. Kein Laufzeit-Test durchgefuehrt.*
