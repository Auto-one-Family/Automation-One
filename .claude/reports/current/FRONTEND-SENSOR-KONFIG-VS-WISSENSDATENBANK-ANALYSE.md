# Frontend-Struktur: Sensor-Konfiguration vs. Wissensdatenbank — IST-Analyse

**Erstellt:** 2026-03-05  
**Ziel:** Klären, wie Sensor-Konfiguration und Wissensdatenbank im Frontend strukturiert sind, und ob die aktuelle Roadmap passt.

---

## Teil 1: Komponenten-Struktur

### 1.1 SensorConfigPanel

| Aspekt | Ergebnis |
|--------|----------|
| **Dateipfad** | `El Frontend/src/components/esp/SensorConfigPanel.vue` |
| **Ordner** | `components/esp/` |
| **Importe/Nutzer** | **Nur HardwareView.vue** (Zeile 34, 982–991) |

**Nutzer im Detail:**

| Nutzer | Datei | Kontext |
|--------|-------|---------|
| HardwareView | `src/views/HardwareView.vue` | Route `/hardware` (Übersicht L1/L2) |

**Öffnungs-Kontext:** SensorConfigPanel wird ausschließlich in der HardwareView (Übersicht) verwendet, nie in der SensorsView (Komponenten-Tab).

---

### 1.2 ActuatorConfigPanel

| Aspekt | Ergebnis |
|--------|----------|
| **Dateipfad** | `El Frontend/src/components/esp/ActuatorConfigPanel.vue` |
| **Ordner** | `components/esp/` |
| **Importe/Nutzer** | **Nur HardwareView.vue** (Zeile 35, 1002–1010) |

**Nutzer im Detail:** Identisch zu SensorConfigPanel — ausschließlich HardwareView.

---

### 1.3 components/-Ordnerstruktur (Übersicht)

| Ordner | Relevante Komponenten | Zweck |
|--------|----------------------|-------|
| `esp/` | SensorConfigPanel, ActuatorConfigPanel, ESPSettingsSheet, ESPOrbitalLayout, DeviceDetailView | **Produktive Sensor-/Aktor-Konfiguration**, ESP-Topologie |
| `inventory/` | DeviceDetailPanel, InventoryTable, SchemaForm, ZoneContextEditor | **Inventar/Wissensdatenbank** — Metadaten, Zone-Kontext, Schema-basierte Felder |
| `devices/` | AlertConfigSection, RuntimeMaintenanceSection, SubzoneAssignmentSection, LinkedRulesSection | Wiederverwendbare Sektionen für Config-Panels |
| `dashboard/` | ZonePlate, DeviceMiniCard, ComponentSidebar | Hardware-Übersicht, Zone-Accordion |
| `charts/`, `system-monitor/`, `rules/`, etc. | — | Andere Bereiche |

**Zuordnung:**

- **Produktive Sensor-Konfiguration:** SensorConfigPanel, ActuatorConfigPanel (Schwellwerte, Subzone, Kalibrierung, Alerts, Runtime)
- **Inventar/Metadaten:** DeviceDetailPanel (SchemaForm, ZoneContextEditor), InventoryTable

---

## Teil 2: Views und Routen

### 2.1 Routen-Übersicht

| Route | View | Meta-Titel |
|-------|------|------------|
| `/` | Redirect → `/hardware` | — |
| `/hardware` | HardwareView | Übersicht |
| `/hardware/:zoneId` | HardwareView | Übersicht |
| `/hardware/:zoneId/:espId` | HardwareView | Übersicht |
| `/sensors` | SensorsView | **Komponenten** |
| `/monitor`, `/monitor/:zoneId`, … | MonitorView | Monitor |
| `/editor`, `/editor/:dashboardId` | CustomDashboardView | Editor |
| `/logic`, `/logic/:ruleId` | LogicView | Automatisierung |
| `/system-monitor` | SystemMonitorView | System |
| `/calibration` | CalibrationView | Kalibrierung |
| … | … | … |

---

### 2.2 „Komponenten“-Tab

| Aspekt | Ergebnis |
|--------|----------|
| **Sidebar-Link** | `to="/sensors"` (Sidebar.vue Zeile 96–102) |
| **Route** | `/sensors` |
| **View** | **SensorsView.vue** |
| **Hauptkomponenten** | InventoryTable, DeviceDetailPanel (SlideOver) |

**Inhalt der SensorsView (Komponenten-Tab):**

- **InventoryTable** — flache, filterbare Tabelle aller Sensoren, Aktoren, ESPs
- **DeviceDetailPanel** — SlideOver beim Klick auf eine Tabellenzeile

**Öffnet die SensorsView ein SensorConfigPanel/ActuatorConfigPanel?**

**Nein.** Die SensorsView nutzt weder SensorConfigPanel noch ActuatorConfigPanel. Sie zeigt nur DeviceDetailPanel mit:

- Status, aktueller Wert, Zone, ESP ID, GPIO
- Typspezifische Metadaten (SchemaForm)
- Verknüpfte Regeln
- Zone-Kontext (ZoneContextEditor)
- **Link „Vollständige Konfiguration“** → `goToConfigPanel()` navigiert zu `/hardware?openSettings={espId}`

---

### 2.3 HardwareView / Übersicht

| Aspekt | Ergebnis |
|--------|----------|
| **Route** | `/hardware`, `/hardware/:zoneId`, `/hardware/:zoneId/:espId` |
| **Level-Struktur** | L1 = Zone-Accordion mit DeviceMiniCards, L2 = DeviceDetailView (ESPOrbitalLayout) |

**Wo wird SensorConfigPanel geöffnet?**

| Level | Trigger | Komponente |
|-------|---------|------------|
| **L1** | DeviceMiniCard → Settings (Zahnrad) → ESPSettingsSheet → Klick auf Sensor in Liste | ESPSettingsSheet (Zeile 641–645: `@click="openSensorConfig(sensor)"`) |
| **L2** | Klick auf Sensor-Satellite im Orbital-Layout | ESPOrbitalLayout → DeviceDetailView → `@sensor-click` → HardwareView |

**Komponenten-Kette:**

1. **L1:** ZonePlate → DeviceMiniCard → `@settings` → HardwareView öffnet ESPSettingsSheet  
2. ESPSettingsSheet: Sensor-Liste → `openSensorConfig(sensor)` → `emit('open-sensor-config', …)`  
3. HardwareView: `@open-sensor-config="handleSensorConfigFromSheet"` → `showSensorConfig = true`, `configSensorData = payload`  
4. **L2:** DeviceDetailView → ESPOrbitalLayout → SensorColumn → `@sensor-click` → `handleSensorClick` → `emit('sensorClick', gpio)`  
5. HardwareView: `@sensor-click="handleSensorClickFromDetail"` → `handleSensorClickFromDetail` setzt `configSensorData` und `showSensorConfig = true`

**Darstellung:** SlideOver mit `elevation="high"` (über ESPSettingsSheet), `width="lg"`.

---

## Teil 3: Datenfluss SensorConfigPanel

### 3.1 Öffnen

| Aspekt | Ergebnis |
|--------|----------|
| **Steuerung** | Lokale refs in HardwareView: `showSensorConfig`, `configSensorData` |
| **Übergebene Props** | `esp-id`, `gpio`, `sensor-type`, `unit`, `show-metadata` (optional, hier `false`) |
| **Konfigurationsdaten** | **API-Call beim Öffnen:** `onMounted` in SensorConfigPanel ruft `sensorsApi.get(espId, gpio)` auf |

**Datenquelle:**

- **Real-ESP:** `sensorsApi.get(espId, gpio)` — Server liefert aktuelle Konfiguration inkl. `subzone_id`
- **Mock-ESP:** Fallback aus `espStore.devices` → Sensor-Objekt (name, unit, subzone_id)

**Kein Store für Config:** Die Konfiguration wird beim Öffnen des Panels geladen, nicht aus einem zentralen Store.

---

### 3.2 Speichern

| Aspekt | Ergebnis |
|--------|----------|
| **API** | `sensorsApi.createOrUpdate(espId, gpio, config)` |
| **subzone_id** | **Ja, wird mitgesendet** |

**Quelle von subzone_id:**

- `SubzoneAssignmentSection` (Zeile 357–363) mit `v-model="subzoneId"`
- `subzoneId` wird in `handleSave()` (Zeile 277–282) normalisiert und als `config.subzone_id` gesendet
- „Keine Subzone“ → `null` (nicht `"__none__"`)

**Gesendete Felder (Auszug):** esp_id, gpio, sensor_type, name, description, unit, enabled, interface_type, threshold_min/max, warning_min/max, subzone_id, metadata, calibration (falls vorhanden).

---

## Teil 4: Zusammenfassung und Empfehlung

### 4.1 Tabelle: Wo wird SensorConfigPanel genutzt?

| Nutzer | Route | Trigger | Kontext |
|--------|-------|---------|---------|
| HardwareView (L1) | `/hardware` | DeviceMiniCard → Settings → ESPSettingsSheet → Klick auf Sensor in Liste | **Produktive Konfiguration** |
| HardwareView (L2) | `/hardware/:zoneId/:espId` | Klick auf Sensor-Satellite im Orbital-Layout | **Produktive Konfiguration** |

**Fazit:** SensorConfigPanel wird **nur** in der HardwareView (Übersicht) genutzt, **nie** im Komponenten-Tab (SensorsView).

---

### 4.2 Bewertung

**Entspricht die aktuelle Struktur den Anforderungen?**

| Anforderung | IST | Bewertung |
|-------------|-----|-----------|
| **Trennung Wissensdatenbank vs. Sensor-Konfiguration** | SensorsView = Inventar (DeviceDetailPanel mit Metadaten, Zone-Kontext). HardwareView = produktive Konfiguration (SensorConfigPanel). | ✅ **Erfüllt** |
| **Wissensdatenbank (Komponenten-Tab)** | SensorsView zeigt flache Inventar-Tabelle + DeviceDetailPanel (Metadaten, Schema, Zone-Kontext). Kein SensorConfigPanel. | ✅ **Erfüllt** |
| **Produktive Sensor-Konfiguration** | Nur in HardwareView, L1 (via ESPSettingsSheet) und L2 (via Orbital-Klick). | ✅ **Erfüllt** |
| **„Konfigurieren“-Link führt zur richtigen Stelle** | DeviceDetailPanel hat „Vollständige Konfiguration“ → `goToConfigPanel()` → `/hardware?openSettings={espId}`. Öffnet ESPSettingsSheet, von dort aus Sensor-Liste → SensorConfigPanel. | ✅ **Erfüllt** |
| **Konfiguration beim Öffnen angezeigt** | `onMounted` lädt `sensorsApi.get()` — aktuelle Konfiguration inkl. Subzone wird angezeigt. | ✅ **Erfüllt** |
| **Subzone beim Speichern mitgesendet** | `config.subzone_id` wird aus SubzoneAssignmentSection gesendet. | ✅ **Erfüllt** |

**Duplikate / widersprüchliche Einstiegspunkte?**

- **Keine Duplikate:** SensorConfigPanel existiert nur in HardwareView.
- **Ein Einstiegspunkt für produktive Konfiguration:** HardwareView (L1 oder L2).

**Passt die Annahme „Sensor-Konfiguration nur in HardwareView L1/L2“ zum Code?**

**Ja.** Der Code bestätigt diese Annahme. SensorConfigPanel wird ausschließlich in HardwareView verwendet.

---

### 4.3 Empfehlung

**Die Anforderungen sind im aktuellen Aufbau bereits erfüllt.** Es sind keine strukturellen Änderungen nötig.

**Mögliche Anpassungen:**

1. **Dokumentation:** Der Kommentar in DeviceDetailPanel.vue (Zeile 8–9) ist irreführend:
   > „Full device editing (AlertConfig, RuntimeMaintenance, DeviceMetadata) is done via SensorConfigPanel / ActuatorConfigPanel **in the /sensors view**.“

   **Korrektur:** „… in der **HardwareView** (Übersicht), nicht in der SensorsView.“ Die SensorsView öffnet SensorConfigPanel nicht; sie verlinkt nur dorthin.

2. **Roadmap:** Falls die Roadmap noch von „Sensor-Konfiguration im Komponenten-Tab“ ausgeht, kann sie auf den IST-Zustand angepasst werden: Sensor-Konfiguration erfolgt in der HardwareView, der Komponenten-Tab bleibt Wissensdatenbank/Inventar.

3. **Deep-Link aus Wissensdatenbank:** DeviceDetailPanel könnte optional einen Deep-Link anbieten, der direkt zum SensorConfigPanel führt (z.B. `/hardware?openSettings={espId}&focus=sensor-{gpio}`), falls der Server oder die HardwareView einen solchen Parameter unterstützt. Aktuell führt der Link zu ESPSettingsSheet; der User muss danach noch auf den Sensor klicken.

---

## Offene Punkte

| Punkt | Status |
|-------|--------|
| Deep-Link direkt zu SensorConfigPanel (ohne ESPSettingsSheet-Zwischenschritt) | Nicht implementiert; wäre eine optionale UX-Verbesserung |
| `focus=sensorId` / `sensor=espId-gpioX` in SensorsView | Bereits vorhanden (Zeile 66–87); öffnet DeviceDetailPanel, nicht SensorConfigPanel |
| DeviceDetailPanel: `sensor_metadata` vs. `metadata` in API | DeviceDetailPanel nutzt `sensor_metadata`/`actuator_metadata`; SensorConfigPanel nutzt `metadata` im Config-Objekt — unterschiedliche API-Felder, aber konsistent pro Kontext |

---

## Quellen (Dateipfade)

- `El Frontend/src/views/HardwareView.vue`
- `El Frontend/src/views/SensorsView.vue`
- `El Frontend/src/components/esp/SensorConfigPanel.vue`
- `El Frontend/src/components/esp/ActuatorConfigPanel.vue`
- `El Frontend/src/components/esp/ESPSettingsSheet.vue`
- `El Frontend/src/components/esp/ESPOrbitalLayout.vue`
- `El Frontend/src/components/esp/DeviceDetailView.vue`
- `El Frontend/src/components/inventory/DeviceDetailPanel.vue`
- `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
- `El Frontend/src/components/dashboard/ZonePlate.vue`
- `El Frontend/src/router/index.ts`
- `El Frontend/src/shared/design/layout/Sidebar.vue`
