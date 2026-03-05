# ESPSettingsSheet Bereinigung — Analyse

**Erstellt:** 2026-03-05  
**Agent:** frontend-dev (Modus A: Analyse & Plan)  
**Skill:** `.claude/skills/frontend-development/SKILL.md`  
**Ziel:** ESPSettingsSheet als reines Informations-Panel; Konfiguration nur über Level 2 (Orbital) → SensorConfigPanel/ActuatorConfigPanel.

---

## 1. IST-Zustand

### 1.1 Analysierte Dateien (vollständige Pfade)

| Datei | Rolle |
|-------|--------|
| `El Frontend/src/components/esp/ESPSettingsSheet.vue` | Hauptkomponente (SlideOver) |
| `El Frontend/src/views/HardwareView.vue` | Parent, rendert Sheet + Event-Handler für Config-Panels |
| `El Frontend/src/components/esp/ESPOrbitalLayout.vue` | Level 2: Konfig-Ort (sensorClick/actuatorClick → HardwareView) |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | Referenz: Subzone-Gruppierung (device.subzone_id/subzone_name) |
| `El Frontend/src/stores/esp.ts` | espStore; Device-Daten (sensors/actuators) |

---

### 1.2 ESPSettingsSheet.vue — Sektionen/Blöcke (IST)

| Sektion | Zeilen (Template) | Inhalt |
|---------|--------------------|--------|
| **IDENTIFICATION** | 318–391 | Name (editierbar), ESP-ID, Typ (MOCK/REAL) |
| **STATUS** | 393–441 | Verbindung (Dot + Text), Heartbeat, Accordion „Status-Details“ (WiFi, Speicher, Uptime) |
| **ZONE** | 443–472 | zoneDisplay, ZoneAssignmentPanel (Anzeige + Bearbeitung), Hinweis Drag & Drop |
| **SENSOR LIST** | 474–505 | Flache Liste Sensoren; **jede Zeile = Button** → `openSensorConfig(sensor)` → Emit `open-sensor-config` |
| **ACTUATOR LIST** | 427–460 | Flache Liste Aktoren; **jede Zeile = Button** → `openActuatorConfig(actuator)` → Emit `open-actuator-config` |
| **MOCK CONTROLS** | 440–501 | Heartbeat senden, Auto-Heartbeat Toggle + Intervall (nur bei isMock) |
| **REAL ESP INFO** | 503–513 | Kurzinfo zu Heartbeat/MQTT (nur bei !isMock) |
| **DANGER ZONE** | 515–529 | Button „Gerät löschen“ (ConfirmDialog + Toast) |

**Subzonen im Sheet (IST):** Keine eigene Subzone-Sektion. Nur flache Listen `sensors` / `actuators` aus `props.device`; Subzonen werden **nicht** angezeigt.

---

### 1.3 Konfiguration öffnen (IST)

- **Sensor-Liste:**  
  - Zeilen 479–502: `<button class="config-list-item" @click="openSensorConfig(sensor)">`  
  - `openSensorConfig()` Zeilen 214–221 → `emit('open-sensor-config', { espId, gpio, sensorType, unit })`  
  - Emits definiert: Zeilen 63–64; ausgelöst: Zeile 218.

- **Aktor-Liste:**  
  - Zeilen 431–434: `<button class="config-list-item" @click="openActuatorConfig(actuator)">`  
  - `openActuatorConfig()` Zeilen 223–229 → `emit('open-actuator-config', { espId, gpio, actuatorType })`  
  - Emits definiert: Zeilen 63–64; ausgelöst: Zeile 227.

- **Affordance:** Gesamte Zeile ist klickbar (Button + ChevronRight); funktional gleichbedeutend mit „Einstellungen/Konfigurieren“ pro Sensor/Aktor.

---

### 1.4 Zone- und Subzone-Darstellung (IST)

- **Zone:**  
  - `zoneDisplay` (Zeile 147–149), ZoneAssignmentPanel (616–625 im Kontext Script: Zeilen 451–461).  
  - Anzeige + Bearbeitung — **soll unverändert bleiben.**

- **Subzonen:**  
  - **IST: nicht dargestellt.**  
  - Datenmodell:  
    - **ESPDevice** (`api/esp.ts` 69–70): `subzone_id`, `subzone_name` (auf Geräteebene).  
    - **MockSensor** (`types/index.ts` 254): `subzone_id?: string | null` (pro Sensor).  
    - **MockActuator** (`types/index.ts` 285–297): **kein** `subzone_id` in der Schnittstelle; in `useZoneGrouping` wird für Aktoren fallback `esp.subzone_id` verwendet.  
  - Für SOLL: Sensoren nach `sensor.subzone_id` gruppierbar; Aktoren nach `device.subzone_id` (oder zukünftig `actuator.subzone_id`, falls API erweitert wird).

---

### 1.5 Datenfluss

- **Device-Quelle:** Device (inkl. `sensors`, `actuators`) kommt als **Prop** von HardwareView (`settingsDevice`).  
- Beim Öffnen des Sheets: **kein zusätzlicher API-Call**; Daten liegen bereits im Device-Objekt.  
- **API für Device by ID:** `espStore` befüllt `devices` via `fetchAll()`; Einzelgerät z. B. über `espStore.devices.find()` bzw. `espStore.fetchDevice(id)` (z. B. nach Config-Save). Device-Struktur mit `sensors`/`actuators` kommt von Backend (z. B. GET `/esp/devices`, Debug-API für Mocks).

---

### 1.6 Event-Kette (IST)

**In ESPSettingsSheet emittierte Events:**

| Event | Zeilen (Def/Aufruf) | Verwendung |
|-------|----------------------|------------|
| `close` | 58, 168–169 | SlideOver schließen |
| `update:isOpen` | 59, 169 | v-model HardwareView |
| `name-updated` | 59 | Name gespeichert |
| `zone-updated` | 60, 302–307 | Zone geändert |
| `deleted` | 61, 199 | Gerät gelöscht |
| `heartbeat-triggered` | 62, 177 | Mock Heartbeat |
| **`open-sensor-config`** | **63, 217** | **→ HardwareView: SensorConfigPanel öffnen** |
| **`open-actuator-config`** | **64, 227** | **→ HardwareView: ActuatorConfigPanel öffnen** |

**HardwareView:**

- Bindungen: Zeilen 970–971:  
  `@open-sensor-config="handleSensorConfigFromSheet"`  
  `@open-actuator-config="handleActuatorConfigFromSheet"`
- Handler:  
  - `handleSensorConfigFromSheet` (678–684): setzt `configSensorData`, `showSensorConfig = true`, schließt Settings-Sheet.  
  - `handleActuatorConfigFromSheet` (686–692): setzt `configActuatorData`, `showActuatorConfig = true`, schließt Settings-Sheet.

**Konfig-Panels werden also von zwei Stellen geöffnet:**

1. **Level 2 (Orbital):** DeviceDetailView → `@sensor-click` / `@actuator-click` → `handleSensorClickFromDetail` / `handleActuatorClickFromDetail` (HardwareView 645–672). **Bleibt.**  
2. **ESPSettingsSheet:** `open-sensor-config` / `open-actuator-config` → `handleSensorConfigFromSheet` / `handleActuatorConfigFromSheet`. **Soll weg.**

---

## 2. SOLL-Zustand

| Element | SOLL |
|---------|------|
| **Zone** | Unverändert. Anzeige + Bearbeitung (ZoneAssignmentPanel). |
| **Subzonen** | Sensoren und Aktoren **zusammen** nach Subzone gruppiert. Pro Subzone: Überschrift + Liste (Name, Typ, ggf. GPIO). **Keine** Konfig-Buttons. |
| **Sensor-/Aktor-Konfiguration** | **Entfernt.** Keine Links zum SensorConfigPanel, keine „Einstellungen“-Buttons. |
| **Deep-Links** | **Entfernt.** Keine Navigation zu SensorConfigPanel/ActuatorConfigPanel aus dem Sheet. |
| **Inhalt** | Nur Übersicht: welche Sensoren/Aktoren angebunden sind, gruppiert nach Subzone (oder „Keine Subzone“), plus Zone-Info. |

**Beispiel SOLL-Layout:**

```
ESP: [Name]  Zone: [Zone-Name] (editierbar)

Subzone: Becken Ost
  - sht31_temp (Temperatur)
  - sht31_humidity (Feuchtigkeit)
  - Pumpe 1 (Relay)

Subzone: Vorraum
  - ds18b20_1 (Temperatur)

Keine Subzone
  - pump_aux (Relay)
```

Keine Buttons, keine Links. Reine Anzeige.

---

## 3. Gap-Analyse

### 3.1 Entfernen (Datei + Zeilen)

| Datei | Betroffene Stellen | Aktion |
|-------|--------------------|--------|
| **ESPSettingsSheet.vue** | Zeilen 63–64 | Emits `open-sensor-config`, `open-actuator-config` aus `defineEmits` entfernen. |
| **ESPSettingsSheet.vue** | Zeilen 210–229 | Funktionen `openSensorConfig`, `openActuatorConfig` entfernen. |
| **ESPSettingsSheet.vue** | Zeilen 231–236 | `formatSensorValue` nur noch nutzen, wenn Anzeige „Wert“ in reiner Leseliste gewünscht; sonst optional entfernen oder behalten. |
| **ESPSettingsSheet.vue** | Zeilen 474–505 | Sektion „SENSOR LIST“: `<button>` und `@click="openSensorConfig(sensor)"` entfernen; durch reine Anzeige (z. B. `<div>`) ersetzen, ohne Klick-Handler. ChevronRight entfernen. |
| **ESPSettingsSheet.vue** | Zeilen 427–460 | Sektion „ACTUATOR LIST“: `<button>` und `@click="openActuatorConfig(actuator)"` entfernen; durch reine Anzeige ersetzen, ChevronRight entfernen. |
| **ESPSettingsSheet.vue** | Zeilen 31 | Import `ChevronRight` entfernen, falls nirgends mehr genutzt. |
| **ESPSettingsSheet.vue** | Zeilen 643–677 (CSS) | `.config-list-item`-Styles: Beibehalten für neue reine Listen-Darstellung (ohne cursor/pointer/hover als „Button“), oder durch schlankere Lesestyles ersetzen. |
| **HardwareView.vue** | Zeilen 970–971 | Bindungen `@open-sensor-config="handleSensorConfigFromSheet"` und `@open-actuator-config="handleActuatorConfigFromSheet"` entfernen. |
| **HardwareView.vue** | Zeilen 678–692 | Funktionen `handleSensorConfigFromSheet` und `handleActuatorConfigFromSheet` entfernen. |

### 3.2 Umbauen (Subzone-Darstellung)

- **IST:** Keine Subzone-Anzeige im Sheet; nur flache Sensor-/Aktor-Listen.  
- **SOLL:**  
  - Eine neue **Subzone-Sektion**: Sensoren und Aktoren **zusammen** nach Subzone gruppieren.  
  - **Datenquelle Subzone:**  
    - Sensoren: `sensor.subzone_id` / optional `sensor.subzone_name` (MockSensor hat `subzone_id`).  
    - Aktoren: aktuell nur `device.subzone_id` / `device.subzone_name` (MockActuator ohne subzone_id); alle Aktoren eines ESP dann einer Subzone zuordnen oder „Keine Subzone“.  
  - **Pattern:** Anlehnung an `ZonePlate.vue`:  
    - `subzoneGroups`-ähnliches Computed (Zeilen 179–204 in ZonePlate): Gruppierung nach `subzone_id` (und „Keine Subzone“ für `null`).  
    - Im Sheet: Pro Gruppe eine Überschrift (Subzone-Name) + Liste Einträge (Name, Typ, ggf. GPIO) — nur Text, keine Buttons.  
  - **Reihenfolge:** Z. B. benannte Subzonen zuerst, „Keine Subzone“ am Ende (wie in ZonePlate).

### 3.3 Abhängigkeiten

- **HardwareView:**  
  - Die beiden Listener `@open-sensor-config` und `@open-actuator-config` sowie die Handler `handleSensorConfigFromSheet` und `handleActuatorConfigFromSheet` werden **nur** vom ESPSettingsSheet genutzt.  
  - DeviceDetailView (Level 2) nutzt ausschließlich `@sensor-click` / `@actuator-click` → `handleSensorClickFromDetail` / `handleActuatorClickFromDetail`.  
  - **Folge:** Bindungen und Sheet-spezifische Handler können ohne Auswirkung auf Level 2 entfernt werden.  
- **ESPSettingsSheet:** Wird nur in HardwareView verwendet (Zeilen 960–972).

---

## 4. Umsetzungsauftrag (konkret)

### 4.1 Dateien und Zeilen (Übersicht)

| Datei | Zeilen/Stellen |
|-------|-----------------|
| **ESPSettingsSheet.vue** | Emits 63–64; Methoden 210–229; Template SENSOR LIST 474–505; ACTUATOR LIST 507–438; ggf. Import ChevronRight 31; CSS .config-list-item 643–677 (anpassen oder ersetzen). |
| **HardwareView.vue** | Bindungen 970–971; Handler 678–692. |

### 4.2 Schritte (Schritt-für-Schritt)

1. **ESPSettingsSheet.vue — Konfig-Öffnung entfernen**  
   - In `defineEmits`: `open-sensor-config` und `open-actuator-config` entfernen (Zeilen 63–64).  
   - Funktionen `openSensorConfig` und `openActuatorConfig` löschen (Zeilen 214–229).  
   - Optional: `formatSensorValue` beibehalten, wenn Wert in der neuen reinen Liste angezeigt werden soll.

2. **ESPSettingsSheet.vue — SENSOR LIST auf reine Anzeige umstellen**  
   - Sektion „SENSOR LIST“ (ca. 474–505):  
     - `<button class="config-list-item" @click="openSensorConfig(sensor)">` durch nicht klickbares Element ersetzen (z. B. `<div class="device-list-item">` oder Design-Primitive).  
     - Inhalt: Name, Typ (getSensorLabel), GPIO, optional Wert+Unit (formatSensorValue/getSensorUnit).  
     - ChevronRight und alle Klick-Handler entfernen.

3. **ESPSettingsSheet.vue — ACTUATOR LIST auf reine Anzeige umstellen**  
   - Sektion „ACTUATOR LIST“ (ca. 427–460):  
     - `<button class="config-list-item" @click="openActuatorConfig(actuator)">` durch reine Anzeige ersetzen.  
     - Inhalt: Name, Typ, GPIO, optional Status (AN/AUS).  
     - ChevronRight und Klick-Handler entfernen.

4. **ESPSettingsSheet.vue — Subzone-Sektion neu**  
   - Computed einführen: Gruppierung von `sensors` und `actuators` nach Subzone (analog ZonePlate/useZoneGrouping).  
     - Sensoren: `sensor.subzone_id ?? null`; Subzone-Name: aus erstem Sensor der Gruppe oder `device.subzone_name` / Fallback „Keine Subzone“.  
     - Aktoren: `device.subzone_id` / `device.subzone_name` (ein ESP = eine Subzone für alle Aktoren, oder „Keine Subzone“).  
   - Eine Sektion „Geräte nach Subzone“ (oder „Sensoren & Aktoren“):  
     - Pro Gruppe: Überschrift (Subzone-Name), darunter Liste aller Sensoren und Aktoren dieser Gruppe (Name, Typ, GPIO; nur Text).  
   - Keine Buttons/Links.  
   - Optional: Alte getrennte Sektionen „SENSOR LIST“ und „ACTUATOR LIST“ durch diese eine Subzone-Sektion ersetzen.

5. **ESPSettingsSheet.vue — Imports/CSS aufräumen**  
   - `ChevronRight` aus Import entfernen, falls nicht mehr verwendet.  
   - `.config-list-item` entweder umbenennen/anschlankern für reine Leseliste (kein cursor: pointer, kein hover als Button) oder durch Design-Primitive ersetzen.

6. **HardwareView.vue — Sheet-spezifische Config-Handler entfernen**  
   - Zeilen 970–971: `@open-sensor-config` und `@open-actuator-config` von `<ESPSettingsSheet>` entfernen.  
   - Zeilen 678–692: `handleSensorConfigFromSheet` und `handleActuatorConfigFromSheet` löschen.

### 4.3 Design-System

- Nur Primitives aus `El Frontend/src/shared/design/` verwenden (z. B. keine neuen Buttons für Sensor/Aktor-Zeilen).  
- Listen: einfache Text-/Listen-Darstellung (z. B. `info-row`-ähnlich oder schlanke Listen-Komponente), keine interaktiven Elemente für Konfig.

### 4.4 Datenquelle Subzone im Device

- **Sensoren:** `MockSensor` hat `subzone_id` (`types/index.ts` 254). Backend/Config liefert pro Sensor Subzone.  
- **Aktoren:** `MockActuator` hat aktuell kein `subzone_id`; Nutzung von `device.subzone_id` / `device.subzone_name` für alle Aktoren des ESP ist ausreichend für die Übersicht. Falls Backend später pro Aktor Subzone liefert, kann die Gruppierung erweitert werden.

---

*Ende der Analyse. Keine Implementierung in diesem Auftrag — Ergebnis ist strukturierter Bericht + konkreter Umsetzungsauftrag.*
