# Analyse: Initiales Sensor-/Aktor-Konfigurationspanel

**Ziel-Repo:** Auto-one (El Frontend)  
**Erstellt:** 2026-03-05  
**Priorität:** HOCH  
**Typ:** Analyse (Ergebnis = Verständnis + Fix-Empfehlungen)

> **Update 2026-03-05 (Auftrag 3):** Subzone-Zustand in beiden Modals aktualisiert: SubzoneAssignmentSection (Dropdown) statt Freitext; subzone_id top-level in realConfig; OneWire-Bulk sendet subzone_id. Siehe VERIFIKATION_INITIALES_CONFIG_PANEL_SUBZONE.md.

---

## Kurzfassung

- **Initiale Panels:** `AddSensorModal.vue` und `AddActuatorModal.vue` — öffnen sich beim Drag & Drop eines Sensor-/Aktor-Typs aus der ComponentSidebar auf die ESP-Card im Orbital-Layout.
- **Subzone Sensor:** Im Formular vorhanden (seit Auftrag 3: SubzoneAssignmentSection Dropdown), wird korrekt an den Server übergeben (top-level `subzone_id`).
- **Subzone Aktor:** Im initialen Panel vorhanden (seit Auftrag 2/3: SubzoneAssignmentSection Dropdown); Backend unterstützt `subzone_id` im Create-Request.
- **OneWire-Bulk:** Beim bulk-add von DS18B20-Sensoren wird `subzone_id` mitgesendet (seit Auftrag 3: `normalizeSubzoneId(newSensor.subzone_id)`).
- **Nach Erstellen:** Es öffnet sich **kein** SensorConfigPanel/ActuatorConfigPanel automatisch; Nutzer muss die neue Card anklicken (Level-2-Flow). HINWEIS: Das Passt so. Wenn zusätzlich alert konfigs zum beispiel eingestellt werden, muss user das dann selber machen. er wird über frontend darüber ordentlich informiert. Das ist eine zusatzleistung des systems. Es gibt noch einige zusatz einstellungsmöglichkeiten die im nächsten auftrag dann genauer untersucht und jeweils konsolidiert werden müssen. Manches ist doppelt oder nicht an richtiger stelle. Kalibrierung als eigenen Task noch komplett verfeinern für sensoren spezifisch und mit echten messungen, keine voreinstellungen. 

---

## Teil 1: Komponenten identifizieren

### 1.1 Welche Komponenten öffnen sich bei Drag & Drop eines neuen Sensors/Aktors?

| Aktion | Geöffnete Komponente | Datei |
|--------|----------------------|--------|
| Sensor-Typ auf ESP ziehen & droppen | **AddSensorModal** | `src/components/esp/AddSensorModal.vue` |
| Aktor-Typ auf ESP ziehen & droppen | **AddActuatorModal** | `src/components/esp/AddActuatorModal.vue` |

Kein anderes Panel/Modal wird für die **initiale** Konfiguration (noch nicht in DB) verwendet.

### 1.2 Einbindung

- **useOrbitalDragDrop** (`src/composables/useOrbitalDragDrop.ts`):  
  - Hält den State: `showAddSensorModal`, `showAddActuatorModal`, `droppedSensorType`, `droppedActuatorType`.  
  - Bei `onDrop()`: Parst `application/json`-Payload; bei `action === 'add-sensor'` → `showAddSensorModal = true` und `droppedSensorType = payload.sensorType`, bei `action === 'add-actuator'` → entsprechend für Aktor.
- **ESPOrbitalLayout.vue**:  
  - Ruft `useOrbitalDragDrop(espId)` auf und bindet die Modals:
    - `<AddSensorModal v-model="showAddSensorModal" :esp-id="espId" :initial-sensor-type="droppedSensorType" @added="..." />`
    - `<AddActuatorModal v-model="showAddActuatorModal" :esp-id="espId" :initial-actuator-type="droppedActuatorType" @added="..." />`
- **ComponentSidebar.vue**:  
  - Setzt beim Drag `dataTransfer.setData('application/json', JSON.stringify({ action: 'add-sensor', sensorType })` bzw. `action: 'add-actuator', actuatorType`.

DeviceDetailView, SensorConfigPanel und ActuatorConfigPanel sind **nicht** am Öffnen der initialen Panels beteiligt; sie dienen der Konfiguration **bereits angelegter** Sensoren/Aktoren (Klick auf Card im Orbital-Layout).

### 1.3 Datenfluss nach Bestätigung

**Sensor:**

1. AddSensorModal → `espStore.addSensor(espId, sensorData)` (sensorData = Formular inkl. `subzone_id`, `operating_mode`, etc.).
2. ESP-Store:
   - **Mock-ESP:** `debugApi.addSensor(deviceId, config)` (Config 1:1 durchgereicht).
   - **Real-ESP:** Baut `SensorConfigCreate` (realConfig), ruft `sensorsApi.createOrUpdate(deviceId, config.gpio, realConfig)` → `POST /api/v1/sensors/{esp_id}/{gpio}`.
3. Subzone: Aktuell wird `config.subzone_id` nur in `realConfig.metadata.subzone_id` geschrieben, **nicht** in `realConfig.subzone_id` (siehe Teil 2).
4. Danach: `fetchDevice(deviceId)`, `fetchGpioStatus(espId)`; Modal schließt, `@added` wird emittiert.

**Aktor:**

1. AddActuatorModal → `espStore.addActuator(espId, newActuator.value)`.
2. ESP-Store:
   - **Mock-ESP:** `debugApi.addActuator(deviceId, config)`.
   - **Real-ESP:** Baut `ActuatorConfigCreate` **ohne** `subzone_id`, ruft `actuatorsApi.createOrUpdate(...)` → `POST /api/v1/actuators/{esp_id}/{gpio}`.
3. Danach: `fetchDevice`, `fetchGpioStatus`; Modal schließt.

Es gibt **keinen** expliziten Schritt „Subzone erstellen → dann Sensor/Aktor anlegen“. Das Backend erwartet beim Create eine optionale `subzone_id` und führt die Zuweisung über den SubzoneService (z. B. `assign_subzone(..., assigned_gpios=[gpio])`) selbst aus.

---

## Teil 2: Subzone im initialen Panel

### 2.1 IST-Zustand

**AddSensorModal:**

- Es gibt ein **Subzone-Feld** (optional): SubzoneAssignmentSection (Dropdown).
- **UI:** SubzoneAssignmentSection — „Keine Subzone“ + bestehende Subzonen + „Neue Subzone erstellen“ (seit Auftrag 3, 2026-03-05).
- Form-State: `newSensor.subzone_id` (string | null, anfangs `null`), wird in `addSensor()` mit `sensorData = { ...newSensor.value }` an den Store übergeben.
- **OneWire-Bulk** (`addMultipleOneWireSensors`): Der Payload enthält `subzone_id: normalizeSubzoneId(newSensor.subzone_id) ?? undefined` pro ROM.

**AddActuatorModal:**

- **Subzone-Feld:** SubzoneAssignmentSection (Dropdown), gleiche Logik wie AddSensorModal (seit Auftrag 2/3).

**Backend-Anbindung:**

- Backend (Sensor): `SensorConfigCreate` hat **top-level** `subzone_id`. Die Create-Route liest `request.subzone_id`.
- Backend (Aktor): `ActuatorConfigCreate` hat **top-level** `subzone_id`. Die Create-Route nutzt `request.subzone_id` für `subzone_service.assign_subzone(...)`.
- Frontend (esp.ts) **Sensor Real-ESP:** `realConfig` setzt `subzone_id: normalizeSubzoneId(config.subzone_id)` (top-level); metadata nur `created_via` (seit Auftrag 1/2).
- Frontend (esp.ts) **Aktor Real-ESP:** `realConfig` enthält `subzone_id: config.subzone_id ?? null` (top-level) (seit Auftrag 2).

### 2.2 SOLL vs. IST

- **SOLL:** Subzone soll **initial** einstellbar sein (vor Anlegen des Sensors/Aktors). Backend unterstützt das über top-level `subzone_id` im Create-Body.
- **IST (seit Auftrag 2/3):**
  - Sensor: SubzoneAssignmentSection (Dropdown), subzone_id top-level in realConfig, OneWire-Bulk sendet subzone_id.
  - Aktor: SubzoneAssignmentSection (Dropdown), subzone_id top-level in realConfig.

### 2.3 Wird subzone_id vom initialen Panel mitgesendet?

- **Sensor (Einzel):** Ja im Request-Body, aber **nur unter `metadata.subzone_id`**. Backend wertet nur **top-level** `request.subzone_id` aus → **effektiv nein**.
- **Sensor (OneWire-Bulk):** Nein, nicht im Payload.
- **Aktor:** Nein, weder im Formular noch im Store/API-Payload.

---

## Teil 3: Vollständigkeit der initialen Konfiguration

### 3.1 Felder im initialen Panel

**AddSensorModal (nicht-OneWire):**

- Sensor-Typ (Dropdown, durch Drag vorbelegt), Typ-Summary, GPIO (GpioPicker), Betriebsmodus, Timeout (bei continuous), Name, **Subzone (Text)**, Startwert, Einheit.  
  Bei I2C: I2C-Adresse statt GPIO.  
  Bei OneWire: Bus scannen, Pin, Geräte auswählen, Bulk-Hinzufügen (ohne Subzone/Name pro Gerät im gleichen Sinne wie beim Einzel-Sensor).

**AddActuatorModal:**

- GPIO, Aktor-Typ (durch Drag vorbelegt), Name, ggf. Aux-GPIO, PWM, max_runtime_seconds/cooldown_seconds (z. B. bei pump), inverted_logic.  
  **Kein** Subzone-Feld.

### 3.2 Werden alle gesetzten Werte an den Server gesendet?

- **Sensor:** Ja, außer dass `subzone_id` nur in metadata landet und vom Backend für die Subzone-Zuweisung nicht genutzt wird. OneWire-Bulk-Payload enthält keine Subzone.
- **Aktor:** Alle im Formular gesetzten Felder (inkl. max_runtime_seconds, cooldown_seconds) werden gesendet; subzone_id existiert im Flow nicht.

Hinweis Auftrag: Backend erwartet **max_runtime_seconds** und **cooldown_seconds** (nicht max_on_duration_ms). Das Frontend sendet bereits max_runtime_seconds und cooldown_seconds (AddActuatorModal + esp store).

### 3.3 Öffnet sich nach Erstellen das SensorConfigPanel/ActuatorConfigPanel?

**Nein.** Nach „Hinzufügen“ wird nur das Modal geschlossen, `@added` ausgelöst und die Liste/ESP-Daten aktualisiert. SensorConfigPanel/ActuatorConfigPanel öffnen sich ausschließlich beim **Klick auf eine bestehende** Sensor-/Aktor-Card (Level 2). Das initiale Panel ist also **nicht** „vollständig“ im Sinne aller erweiterten Einstellungen (Schwellwerte, Kalibrierung, Alert, Runtime etc.) – diese sind nur im nachgelagerten Config-Panel verfügbar.

---

## Teil 4: Bericht – Komponenten, Subzone-Flow, Lücken, Empfehlung

### 4.1 Komponenten-Übersicht

**AddSensorModal.vue**

- **Struktur:** BaseModal, Formular mit Sensor-Typ, type-aware Summary, OneWire-Bereich (Scan, Geräteliste, Bulk-Add), I2C-Adresse/GPIO, Betriebsmodus, Timeout, Name, Subzone (Text), Startwert/Einheit; Footer: Abbrechen, Hinzufügen.
- **Props:** `modelValue` (boolean), `espId` (string), `initialSensorType` (optional string | null).
- **Events:** `update:modelValue`, `added`.
- **Erstellen:** Einzel-Sensor: `espStore.addSensor(espId, sensorData)`. OneWire-Bulk: Schleife über ausgewählte ROMs, je `espStore.addSensor(espId, { sensor_type, gpio, onewire_address, ... })` ohne subzone_id.

**AddActuatorModal.vue**

- **Struktur:** BaseModal, Formular mit GPIO, Aktor-Typ, Name, optional Aux-GPIO, PWM, max_runtime/cooldown (z. B. bei pump), inverted_logic; Footer: Abbrechen, Hinzufügen.
- **Props:** `modelValue`, `espId`, `initialActuatorType` (optional string | null).
- **Events:** `update:modelValue`, `added`.
- **Erstellen:** `espStore.addActuator(espId, newActuator.value)`.

### 4.2 Subzone-Flow – initiale Zuweisung

- **Gewollt:** User wählt optional eine Subzone (oder „Keine“) im Add*Modal; beim Erstellen sendet das Frontend `subzone_id` im Create-Request; Backend ruft SubzoneService (assign_subzone mit `assigned_gpios=[gpio]`) auf.
- **Aktuell (seit Auftrag 2/3):**  
  - Sensor: subzone_id top-level in realConfig; SubzoneAssignmentSection (Dropdown).  
  - Aktor: SubzoneAssignmentSection (Dropdown), subzone_id in Create-Payload.  
  - OneWire-Bulk: subzone_id wird mitgegeben.

### 4.3 Lücken

1. **Sensor subzone_id:** ✅ Erledigt (Auftrag 1/2) — top-level in realConfig.
2. **Aktor subzone_id:** ✅ Erledigt (Auftrag 2/3) — Feld in AddActuatorModal, ActuatorConfigCreate, esp-Store.
3. **OneWire-Bulk:** ✅ Erledigt (Auftrag 3) — subzone_id wird mitgegeben.
4. **UX Subzone:** ✅ Erledigt (Auftrag 3) — SubzoneAssignmentSection (Dropdown) statt Freitext.
5. **Kein Auto-Open:** Nach Anlegen öffnet sich kein SensorConfigPanel/ActuatorConfigPanel; gewollt laut Architektur (Level-2-Klick), aber für „vollständige“ initiale Konfiguration müsste der User manuell die neue Card öffnen.

### 4.4 Empfehlung (konkrete Fix-Aufträge)

**P1 – Subzone Sensor Create (Backend-konform):**

- In `stores/esp.ts` bei Real-ESP-Sensor-Create: `realConfig` um **top-level** `subzone_id: config.subzone_id || null` ergänzen (optional `metadata.subzone_id` entfernen oder nur für created_via nutzen).
- Sicherstellen, dass AddSensorModal weiterhin `subzone_id` im Formular an den Store übergibt (bereits der Fall).

**P2 – Subzone Aktor initial:**

- `ActuatorConfigCreate` in `types/index.ts` um `subzone_id?: string | null` erweitern.
- In `stores/esp.ts` bei Real-ESP-Aktor-Create: `realConfig` um `subzone_id: config.subzone_id ?? null` ergänzen (dafür `MockActuatorConfig` bzw. den an addActuator übergebenen Typ um optionales `subzone_id` erweitern).
- In `AddActuatorModal.vue`: Subzone-Feld ins Formular aufnehmen (analog AddSensorModal; siehe P3 für UX).

**P3 – Subzone UX (optional, aber sinnvoll):**

- Subzone-Auswahl als **Dropdown**: `subzonesApi.getSubzones(espId)` beim Öffnen des Modals laden; Optionen: „Keine Subzone“, bestehende Subzonen (id + name), ggf. „Neue Subzone erstellen“ (eigenes kleines Flow/Modal). Für „Keine“ Sentinel `__none__` senden, Backend setzt bereits um (`_normalize_subzone_id`).
- In AddSensorModal und AddActuatorModal gleiche Subzone-UI verwenden (z. B. kleine Shared-Komponente oder Composable).

**P4 – OneWire-Bulk Subzone:**

- In `addMultipleOneWireSensors` (AddSensorModal): Optional ein gemeinsames Subzone-Feld (oder Übernahme von `newSensor.subzone_id`) und bei jedem `espStore.addSensor` den gleichen subzone_id-Wert mitgeben (sofern Backend pro Sensor subzone_id unterstützt, was der Fall ist).

---

## Referenzen

- Backend Sensor Create: `El Servador/god_kaiser_server/src/api/v1/sensors.py` (subzone_id top-level, SubzoneService.assign_subzone).
- Backend Actuator Create: `El Servador/god_kaiser_server/src/api/v1/actuators.py` (request.subzone_id).
- Frontend Store: `El Frontend/src/stores/esp.ts` (addSensor realConfig, addActuator realConfig).
- Subzone-API: `El Frontend/src/api/subzones.ts` (getSubzones(deviceId)).
- Schemas: `El Servador/.../schemas/sensor.py` (SensorConfigCreate), `.../schemas/actuator.py` (ActuatorConfigCreate).
