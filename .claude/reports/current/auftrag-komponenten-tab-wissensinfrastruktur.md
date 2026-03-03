# Auftrag: Komponenten-Tab → Hardware-Inventar & Wissens-Infrastruktur

**Ziel-Repo:** auto-one
**Kontext:** Der Komponenten-Tab (/sensors) wird von einer Zone-gruppierten Sensor-Ansicht zu einer flachen Hardware-Inventar-Ansicht mit erweiterbarem Metadaten-Modell umgebaut. Dieser Tab wird die Datenbasis fuer KI-Integration, Warenwirtschaft und betriebsspezifische Kontextdaten.
**Prioritaet:** Hoch (Baustein fuer MCP-Server + AI-Integration in Phase 4C+)
**Datum:** 2026-03-02
**Aufwand:** ~25-35h (4 Bloecke)
**Abhaengigkeiten:** Block 4A.8 (Hardware-Info + Runtime) muss VORHER oder PARALLEL fertig sein

---

## Robins Vision

> "Der Komponenten-Tab wird die Base dafuer dass KIs Informationen ueber Hardware bekommen oder zukuenftig auch andere Infos ueber bestimmte Einheiten aus der Produktion. Integration eines Warenwirtschaftssystems pro Zone: Pflanzenanzahl, Substrat, Arbeitszeiten, Sorten, Alter der Pflanzen — eine spezifische Wissensdatenbank fuer den Betrieb, um KIs gezielt, schnell und flexibel in das System zu integrieren."

---

## Ist-Zustand

### Was existiert

**SensorsView.vue (`El Frontend: src/views/SensorsView.vue`):**
- Zeigt Sensoren UND Aktoren, GRUPPIERT nach Zonen (Akkordeon-Ansicht)
- Nutzt `useZoneGrouping.ts` Composable → liefert `allSensors` und `allActuators` als FLACHE Arrays
- Keine Metadaten-Anzeige (nur Name, Typ, letzter Wert, Status)
- Keine Filterung, Sortierung oder Suche

**useZoneGrouping.ts (`El Frontend: src/composables/useZoneGrouping.ts`):**
- Aggregiert Daten aus espStore → stellt `allSensors`/`allActuators` als flache Arrays bereit
- Korrekt typisiert, reaktiv
- **Zentrale Datenquelle** — kein neues Data-Fetching noetig

**DataTable.vue (`El Frontend: src/components/database/DataTable.vue`):**
- [Korrektur] Pfad ist NICHT `shared/design/` sondern `components/database/`. Die Komponente ist an die DatabaseTab-View gekoppelt (importiert `ColumnSchema`/`SortOrder` aus `@/api/database`, hat DB-spezifische Logik wie UUID-Formatierung, max 8 Spalten hardcoded). Fuer das Inventar sollte eine EIGENE InventoryTable gebaut werden — DataTable ist NICHT generisch genug.
- Sortierung vorhanden (via emit), aber keine Pagination, kein Column-Visibility-Toggle, kein Conditional Styling

**JSONB-Felder (Backend):**
- `SensorConfig.thresholds` — JSON-Feld (Schwellenwerte, existiert)
- [Korrektur] `ESPDevice.runtime_stats` — existiert NICHT. `runtime_stats` existiert nur auf `SensorConfig` und `ActuatorConfig`, NICHT auf `ESPDevice`.
- [Korrektur] Feld-Namen heissen `sensor_metadata` (nicht `metadata`) auf SensorConfig, `actuator_metadata` auf ActuatorConfig, `device_metadata` auf ESPDevice. Alle existieren bereits als JSON-Felder.
- `SensorConfig.runtime_stats` / `ActuatorConfig.runtime_stats` — JSON-Felder (existieren, Phase 4A.8 Migration vorhanden)
- **Bereits vorhanden:** `DeviceMetadata` TypeScript-Interface in `El Frontend/src/types/device-metadata.ts` mit `manufacturer`, `model`, `serial_number`, `firmware_version`, `installation_date`, `notes`, `custom_fields` — das Schema-Registry-Konzept (K2) sollte darauf aufbauen.

### Was fehlt

1. **Flache Inventar-Ansicht** — Kein Tabellen-View fuer alle Geraete ueber Zonen hinweg
2. **Schema-Registry** — Kein System das definiert WELCHE Metadaten-Felder pro Geraetetyp angezeigt werden
3. **Zone-Context** — Keine betriebsspezifischen Daten pro Zone (Pflanzen, Substrat, Arbeitszeiten)
4. **AI-Export** — Keine maschinenlesbare Geraetebeschreibung fuer LLM-Konsum
5. **Erweiterbare Metadaten-Formulare** — Keine dynamische Formular-Generierung aus Schema

---

## Was getan werden muss

Robin bekommt einen vollstaendigen Hardware-Inventar-Tab der als Wissens-Infrastruktur fuer das gesamte System funktioniert:

**Block K1 — Flache Inventar-Tabelle:**
Flat Table View der alle Sensoren + Aktoren + ESPs in einer einzigen, durchsuchbaren und filterbaren Tabelle zeigt. Keine Zone-Gruppierung mehr als Standard — Zonen werden zum Filter.

**Block K2 — Schema-Registry & Erweiterbare Metadaten:**
Pro-Geraetetyp-Schemas die definieren welche Metadaten-Felder verfuegbar sind. JSON Schema → dynamische Formulare. User kann Felder befuellen, System validiert.

**Block K3 — Zone-Context Datenmodell:**
Pro-Zone betriebsspezifische Daten: Pflanzenanzahl, Sorte, Substrat, Wachstumsphase, Pflanzedatum, Arbeitszeiten. Als erweiterbare JSON-Struktur — nicht als starre Spalten.

**Block K4 — AI-Ready Export & MCP-Vorbereitung:**
Strukturierter JSON-Export pro Geraet + Zone im WoT-TD-inspirierten Format. API-Endpunkt der als Datenbasis fuer einen zukuenftigen MCP-Server dient.

**Erwartetes Ergebnis:** Robin oeffnet den Komponenten-Tab und sieht sofort ALLE Geraete als flache Liste. Er kann filtern (Zone, Typ, Status, Hersteller), sortieren (Name, Typ, Uptime, letzte Wartung), suchen (Freitext). Pro Geraet sieht er Hardware-Info + Runtime + Metadaten. Pro Zone kann er betriebsspezifische Daten pflegen (Pflanzen, Substrat, Sorten). Ein MCP-Server oder LLM-Agent kann diese Daten strukturiert abfragen: "Welche Sensoren sind in der Bluete-Zone? Welches Substrat wird verwendet? Wann ist die naechste Wartung faellig?"

---

## Technische Details

### Betroffene Schichten

- [x] Backend (El Servador) — 2 neue API-Endpunkte, 1 neue DB-Tabelle (zone_context), Schema-Registry-Config
- [ ] Firmware (El Trabajante) — NICHT betroffen
- [x] Frontend (El Frontend) — 1 View-Rewrite, 3 neue Komponenten, 1 neuer Store, Schema-Registry-Client

### Betroffene Module (Pfade relativ zum Subprojekt)

| Schicht | Modul | Aenderung |
|---------|-------|-----------|
| Backend | `El Servador/god_kaiser_server/src/db/models/zone_context.py` | **NEU** — Zone-Context DB-Modell |
| Backend | `El Servador/god_kaiser_server/src/schemas/zone_context.py` | **NEU** — Pydantic-Schemas |
| Backend | `El Servador/god_kaiser_server/src/api/v1/zone_context.py` | **NEU** — CRUD-API fuer Zone-Kontext-Daten |
| Backend | `El Servador/god_kaiser_server/src/api/v1/component_export.py` | **NEU** — AI-Ready Export-API |
| Backend | `El Servador/god_kaiser_server/src/api/v1/__init__.py` | **ERWEITERN** — Neue Router registrieren |
| Backend | `El Servador/god_kaiser_server/src/db/models/__init__.py` | **ERWEITERN** — ZoneContext-Model importieren |
| Backend | `El Servador/god_kaiser_server/alembic/versions/` | **NEU** — Migration fuer zone_context Tabelle |
| Frontend | `El Frontend: src/views/SensorsView.vue` | **REWRITE** → ComponentInventoryView.vue (Route bleibt /sensors fuer Kompatibilitaet) |
| Frontend | `El Frontend: src/components/inventory/InventoryTable.vue` | **NEU** — Flache Geraete-Tabelle |
| Frontend | `El Frontend: src/components/inventory/DeviceDetailPanel.vue` | **NEU** — Detail-Panel (SlideOver) |
| Frontend | `El Frontend: src/components/inventory/ZoneContextEditor.vue` | **NEU** — Zone-Kontext-Formular |
| Frontend | `El Frontend: src/components/inventory/SchemaForm.vue` | **NEU** — Dynamische Formulare aus JSON Schema |
| Frontend | `El Frontend: src/shared/stores/inventory.store.ts` | **NEU** — Inventory-spezifischer State |
| Frontend | `El Frontend: src/api/inventory.ts` | **NEU** — API-Client |
| Frontend | `El Frontend: src/config/device-schemas/` | **NEU** — JSON Schema Dateien pro Geraetetyp |

---

## Block K1: Flache Inventar-Tabelle (~8-10h)

### Forschungsbasis

ThingsBoard Entity Table Widget (28 Quellen-Recherche):
- Konfigurierbare Spalten (Entity Name, Type, Telemetry, Attributes, Actions)
- Full-Text-Suche, Pagination (Default 10/Seite)
- Default-Sortierung konfigurierbar, Conditional Row-Styling
- Column-Pinning und -Hiding

OpenRemote Asset-Modell:
- Beliebige Attributes pro Asset, Meta-Items steuern Verhalten
- Asset-Typen mit Vererbungshierarchie

### K1.1: SensorsView.vue → ComponentInventoryView.vue

**Rewrite** der bestehenden `SensorsView.vue`. Die Route bleibt `/sensors` (kein Breaking Change in der Navigation), aber der interne Komponentenname aendert sich.

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Komponenten-Inventar                          [+ Metadaten] │
├─────────────────────────────────────────────────────────────┤
│ [Suche...____________] [Zone ▼] [Typ ▼] [Status ▼] [⚙ Spalten] │
├─────────────────────────────────────────────────────────────┤
│ ● Name          │ Typ     │ Zone       │ Wert    │ Status  │
│ ──────────────────────────────────────────────────────────── │
│ ● SHT31-001     │ Sensor  │ Bluete-A   │ 24.3°C  │ ✓ Online│
│ ○ BME280-002    │ Sensor  │ Veg-B      │ —       │ ✗ Offline│
│ ● Pumpe-01      │ Aktor   │ Bluete-A   │ AN      │ ✓ Online│
│ ...             │         │            │         │         │
├─────────────────────────────────────────────────────────────┤
│ Seite 1 von 5  │ [◄] [1] [2] [3] [►] │ 10 / 50 pro Seite │
└─────────────────────────────────────────────────────────────┘
```

**Datenquelle:** `useZoneGrouping.ts` → `allSensors` + `allActuators` → vereinigen in ein `allComponents` Array.

[Korrektur] Die tatsaechlichen Felder in `SensorWithContext` und `ActuatorWithContext` weichen vom Plan ab:

| Plan-Feld | Echtes Feld | Status |
|-----------|-------------|--------|
| `s.id` | NICHT vorhanden | Sensor hat kein `id`-Feld — muss aus `esp_id + gpio` generiert werden |
| `s.latest_value` | `s.raw_value` | Feld heisst `raw_value` (number) |
| `s.is_online` | NICHT vorhanden | Muss aus `s.esp_state` abgeleitet werden (z.B. `esp_state === 'online'`) |
| `s.last_seen` | `s.last_read` | Feld heisst `last_read` (string \| null \| undefined) |
| `s.metadata` | NICHT vorhanden | Composable liefert KEINE metadata/runtime_stats — muss separat aus espStore geholt werden |
| `a.current_state` | `a.state` (boolean) + `a.pwm_value` | Aktor hat `state: boolean` und `pwm_value: number` |

**Empfehlung:** `useZoneGrouping.ts` erweitern oder ein neues `useInventoryData.ts` Composable erstellen, das die fehlenden Felder (`metadata`, `runtime_stats`) aus dem espStore-Device-Objekt mitliest. Die Sensoren/Aktoren im espStore sind verschachtelt in `esp.sensors[]` / `esp.actuators[]` und haben dort ggf. die JSON-Felder.

```typescript
// Korrigiertes Mapping basierend auf echten Feldern:
const allComponents = computed<ComponentItem[]>(() => {
  const sensors: ComponentItem[] = allSensors.value.map(s => ({
    id: `${s.esp_id}_gpio${s.gpio}`,  // Synthetische ID
    name: s.name ?? `${s.sensor_type} (GPIO ${s.gpio})`,
    type: 'sensor' as const,
    sensorType: s.sensor_type,
    zone: s.zone_name,
    zoneId: s.zone_id,
    espId: s.esp_id,
    gpio: s.gpio,
    currentValue: s.raw_value,
    unit: s.unit,
    quality: s.quality,
    status: s.esp_state === 'online' ? 'online' : 'offline',
    lastSeen: s.last_read ?? null,
    // metadata + runtimeStats muessen separat aus espStore geladen werden
  }))
  // ... analog fuer actuators mit state/pwm_value/emergency_stopped
  return [...sensors, ...actuators]
})
```

### K1.2: InventoryTable.vue

**Datei:** `El Frontend: src/components/inventory/InventoryTable.vue`
**Groesse:** ~300-350 Zeilen

Entweder bestehendes `DataTable.vue` erweitern oder spezialisierte Variante fuer das Inventar. Entscheidung beim Implementieren — abhaengig davon wie flexibel DataTable bereits ist.

**Spalten-Konfiguration:**

| Spalte | Key | Sortierbar | Default sichtbar | Beschreibung |
|--------|-----|------------|-------------------|-------------|
| Status | status | Nein | Ja | Farbiger Dot (gruen/rot/grau) |
| Name | name | Ja | Ja | Geraetename (klickbar → Detail) |
| Typ | type | Ja | Ja | "Sensor" / "Aktor" |
| Geraetetyp | sensorType | Ja | Ja | sht31, bme280, relay... |
| Zone | zone | Ja | Ja | Zone-Name |
| Aktueller Wert | currentValue | Ja | Ja | Letzter Messwert + Einheit |
| Hersteller | metadata.manufacturer | Ja | Nein | Aus Metadaten (4A.8) |
| Modell | metadata.model | Ja | Nein | Aus Metadaten (4A.8) |
| Uptime | runtimeStats.uptime_hours | Ja | Nein | Betriebsstunden |
| Naechste Wartung | runtimeStats.next_maintenance | Ja | Nein | Datum |
| Zuletzt gesehen | lastSeen | Ja | Nein | Relative Zeit |

**Spalten-Visibility:** Column-Selector (Zahnrad-Button rechts oben) mit Checkboxen. User-Praeferenz in `localStorage` persistieren. Key: `ao-inventory-columns`.

**Filter:**
- **Freitext-Suche:** Durchsucht Name, Typ, Zone, Hersteller, Modell (debounced 300ms)
- **Zone-Filter:** Multi-Select Dropdown aller Zonen
- **Typ-Filter:** Sensor / Aktor / Alle
- **Status-Filter:** Online / Offline / Alle / Wartung faellig

**Sortierung:** Klick auf Spalten-Header togglet asc → desc → none. Default: Name aufsteigend.

**Pagination:** 10 / 25 / 50 pro Seite. Default 25. Persistent in `localStorage`.

**Row-Klick:** Oeffnet `DeviceDetailPanel.vue` als SlideOver (rechts).

**Conditional Styling:**
- Offline-Geraete: Row leicht transparent (`opacity: 0.7`)
- Wartung faellig: Orange-Dot am Anfang der Row
- Critical-Alert aktiv: Roter Dot pulsierend

### K1.3: DeviceDetailPanel.vue

**Datei:** `El Frontend: src/components/inventory/DeviceDetailPanel.vue`
**Groesse:** ~200-250 Zeilen

Nutzt bestehendes `SlideOver.vue` Primitive (`width="lg"`).

**Inhalt (3 Sektionen):**

1. **Geraete-Info (immer sichtbar):**
   - Name, Typ, Zone (mit Link zum Monitor-Tab), ESP-ID
   - Aktueller Wert mit Mini-Sparkline (aus `useSparklineCache.ts`)
   - Status-Badge + letzte Aktivitaet

2. **Hardware & Runtime (Accordion, Default offen):**
   - Alle Felder aus Block 4A.8 (HardwareInfoSection + RuntimeMaintenanceSection)
   - Editierbar (Stift-Icon → Inline-Edit oder Formular)
   - Plus: Schema-basierte Custom-Felder (aus Schema-Registry, Block K2)

3. **Verlinkungen:**
   - → Monitor-Tab (Zone-Detail): `router.push({ name: 'monitor-zone', params: { zoneId } })`
   - → Config-Panel: Link zum SensorConfigPanel/ActuatorConfigPanel
   - → Zone-Context: Link/Inline-Anzeige der Zone-Daten (Block K3)
   - → Verknuepfte Regeln: Logic-Rules die diesen Sensor/Aktor referenzieren

### K1.4: Inventory Store

**Datei:** `El Frontend: src/shared/stores/inventory.store.ts`

```typescript
export const useInventoryStore = defineStore('inventory', () => {
  // Filterstate
  const searchQuery = ref('')
  const zoneFilter = ref<string[]>([])
  const typeFilter = ref<'all' | 'sensor' | 'actuator'>('all')
  const statusFilter = ref<'all' | 'online' | 'offline' | 'maintenance_due'>('all')
  const sortKey = ref<string>('name')
  const sortDirection = ref<'asc' | 'desc'>('asc')
  const pageSize = ref(25)
  const currentPage = ref(1)

  // Spalten-Sichtbarkeit
  const visibleColumns = ref<string[]>([
    'status', 'name', 'type', 'sensorType', 'zone', 'currentValue'
  ])

  // Detail-Panel
  const selectedDeviceId = ref<string | null>(null)
  const isDetailOpen = ref(false)

  // Gefilterte + sortierte Daten (computed, keine API — Daten kommen aus espStore)
  const filteredComponents = computed(() => { /* ... */ })
  const paginatedComponents = computed(() => { /* ... */ })
  const totalPages = computed(() => { /* ... */ })

  // Persistenz in localStorage
  watchEffect(() => {
    localStorage.setItem('ao-inventory-columns', JSON.stringify(visibleColumns.value))
    localStorage.setItem('ao-inventory-pagesize', String(pageSize.value))
  })

  return { /* ... */ }
})
```

**Registrierung nach Implementierung:**
- [ ] `El Frontend: src/components/inventory/` Verzeichnis erstellen
- [ ] SensorsView.vue rewriten (Route `/sensors` bleibt)
- [ ] InventoryTable in neuer View einbinden
- [ ] DeviceDetailPanel via SlideOver anbinden
- [ ] Store in `src/shared/stores/` anlegen
- [ ] API-Client in `src/api/inventory.ts`

---

## Block K2: Schema-Registry & Erweiterbare Metadaten (~6-8h)

### Forschungsbasis

OpenRemote Asset-Modell: Attribute-Deskriptoren mit type, constraints, format, units, optional, metaItems. Definiert WIE ein Feld angezeigt, validiert und verarbeitet wird.

JSON Schema → Form Generation: vue3-schema-forms (Vue 3 + Vuetify), @rjsf/core (React), json-schema-form-element (Web Components). Automatische UI-Formulare aus Schema-Definitionen.

W3C WoT Thing Model: Template-Konzept — definiert Daten-Schema ohne Kommunikationsdetails. Analog zu Device Profiles.

### K2.1: Schema-Registry (Frontend-Config)

**Konzept:** Pro Geraetetyp ein JSON Schema das definiert welche Metadaten-Felder dieses Geraet haben KANN. Die Schemas werden im Frontend als statische Config gehalten (kein eigener Backend-Service noetig).

**Verzeichnis:** `El Frontend: src/config/device-schemas/`

**Aufbau:**

[Korrektur] Sensor-Typen muessen der Server-Registry (`sensor_type_registry.py`) entsprechen. Die echten normalisierten Typen sind: `sht31_temp`, `sht31_humidity`, `bmp280_pressure`, `bmp280_temp`, `ds18b20`, `moisture`, `ph`, `ec`, `mhz19_co2`, `scd30_co2`, `light`, `flow`. Multi-Value-Devices: `sht31` (temp+humidity), `bmp280` (pressure+temp). Der Plan verwendet `bme280` — das heisst im System `bmp280`. `bh1750` wird als `light` normalisiert. Schema-Dateien sollten nach Device-Typ (nicht nach normalisiertem Sensor-Typ) benannt sein, also `sht31`, `bmp280`, `ds18b20` etc.

```
device-schemas/
├── index.ts           # Registry: deviceType → Schema Mapping
├── base.schema.json   # Basis-Schema (alle Geraete)
├── sensor/
│   ├── sht31.schema.json       # Temp + Humidity (I2C)
│   ├── bmp280.schema.json      # Pressure + Temp (I2C) [NICHT bme280!]
│   ├── ds18b20.schema.json     # Temperature (OneWire)
│   ├── moisture.schema.json    # Soil Moisture (Analog)
│   ├── ph.schema.json          # pH Sensor
│   ├── ec.schema.json          # EC Sensor
│   └── light.schema.json       # Light (bh1750/tsl2561)
├── actuator/
│   ├── relay.schema.json
│   ├── pwm.schema.json
│   └── servo.schema.json
└── esp/
    └── esp32.schema.json
```

**Basis-Schema (alle Geraete erben davon):**

```json
{
  "$id": "automationone://schemas/base",
  "type": "object",
  "properties": {
    "manufacturer": {
      "type": "string",
      "title": "Hersteller",
      "description": "Hersteller des Geraets"
    },
    "model": {
      "type": "string",
      "title": "Modell",
      "description": "Modellbezeichnung"
    },
    "serial_number": {
      "type": "string",
      "title": "Seriennummer"
    },
    "firmware_version": {
      "type": "string",
      "title": "Firmware-Version"
    },
    "installation_date": {
      "type": "string",
      "format": "date",
      "title": "Installationsdatum"
    },
    "datasheet_url": {
      "type": "string",
      "format": "uri",
      "title": "Datenblatt-Link"
    },
    "notes": {
      "type": "string",
      "title": "Notizen",
      "ui:widget": "textarea"
    }
  }
}
```

**Geraetetyp-spezifisches Schema (Beispiel SHT31):**

```json
{
  "$id": "automationone://schemas/sensor/sht31",
  "allOf": [
    { "$ref": "automationone://schemas/base" }
  ],
  "properties": {
    "i2c_address": {
      "type": "string",
      "title": "I2C-Adresse",
      "enum": ["0x44", "0x45"],
      "default": "0x44",
      "readOnly": true,
      "description": "Hardware-Adresse auf dem I2C-Bus"
    },
    "heater_enabled": {
      "type": "boolean",
      "title": "Heater aktiv",
      "default": false,
      "description": "Interner Heater fuer Kondensations-Schutz"
    },
    "accuracy_temperature": {
      "type": "string",
      "title": "Genauigkeit (Temperatur)",
      "default": "±0.3°C",
      "readOnly": true
    },
    "accuracy_humidity": {
      "type": "string",
      "title": "Genauigkeit (Luftfeuchte)",
      "default": "±2% RH",
      "readOnly": true
    },
    "calibration_offset_temp": {
      "type": "number",
      "title": "Kalibrierungs-Offset Temperatur",
      "default": 0,
      "description": "Manueller Offset in °C"
    },
    "calibration_offset_hum": {
      "type": "number",
      "title": "Kalibrierungs-Offset Feuchte",
      "default": 0,
      "description": "Manueller Offset in %RH"
    }
  }
}
```

### K2.2: Schema-Registry Index

**Datei:** `El Frontend/src/config/device-schemas/index.ts`

```typescript
import baseSchema from './base.schema.json'
import sht31Schema from './sensor/sht31.schema.json'
import bmp280Schema from './sensor/bmp280.schema.json'  // [Korrektur] bmp280, nicht bme280
import ds18b20Schema from './sensor/ds18b20.schema.json'
import moistureSchema from './sensor/moisture.schema.json'
import lightSchema from './sensor/light.schema.json'     // [Korrektur] bh1750 wird als 'light' normalisiert
import relaySchema from './actuator/relay.schema.json'
// ... weitere

export interface DeviceSchema {
  id: string
  schema: Record<string, unknown>  // JSON Schema object
  displayName: string
  category: 'sensor' | 'actuator' | 'esp'
}

const registry: Record<string, DeviceSchema> = {
  // Sensoren — IDs muessen zu sensor_type_registry.py passen
  sht31: { id: 'sht31', schema: sht31Schema, displayName: 'SHT31 (Temp/Hum)', category: 'sensor' },
  bmp280: { id: 'bmp280', schema: bmp280Schema, displayName: 'BMP280 (Pressure/Temp)', category: 'sensor' },  // [Korrektur]
  ds18b20: { id: 'ds18b20', schema: ds18b20Schema, displayName: 'DS18B20 (Temp)', category: 'sensor' },
  moisture: { id: 'moisture', schema: moistureSchema, displayName: 'Moisture (Boden)', category: 'sensor' },
  light: { id: 'light', schema: lightSchema, displayName: 'Lichtsensor (BH1750)', category: 'sensor' },  // [Korrektur]
  // Aktoren
  relay: { id: 'relay', schema: relaySchema, displayName: 'Relay', category: 'actuator' },
  // Fallback
  _default: { id: '_default', schema: baseSchema, displayName: 'Unbekannt', category: 'sensor' },
}

export function getSchemaForDevice(deviceType: string): DeviceSchema {
  return registry[deviceType] ?? registry['_default']
}

export function getAllSchemas(): DeviceSchema[] {
  return Object.values(registry).filter(s => s.id !== '_default')
}
```

### K2.3: SchemaForm.vue — Dynamische Formulare

**Datei:** `El Frontend: src/components/inventory/SchemaForm.vue`
**Groesse:** ~200-250 Zeilen

Generiert automatisch ein Formular aus einem JSON Schema. Keine externe Library noetig — AutomationOne nutzt nur einfache Feld-Typen (string, number, boolean, date, url, enum, textarea).

**Props:**
```typescript
interface Props {
  schema: Record<string, unknown>  // JSON Schema
  modelValue: Record<string, unknown>  // Aktuelle Werte (aus JSONB metadata)
  readonly?: boolean
}
```

**Feld-Mapping:**

| JSON Schema Type | Format/Keyword | Vue-Komponente |
|-----------------|----------------|----------------|
| string | — | `<input type="text">` |
| string | format: "date" | `<input type="date">` |
| string | format: "uri" | `<input type="url">` |
| string | ui:widget: "textarea" | `<textarea>` |
| string | enum: [...] | `<select>` |
| number | — | `<input type="number">` |
| boolean | — | `<input type="checkbox">` (Toggle-Style) |

**ReadOnly-Felder:** Wenn `readOnly: true` im Schema oder `readonly` Prop gesetzt → Wert als Text anzeigen, nicht als Input.

**Emit:** `update:modelValue` bei jeder Aenderung. Debounced (500ms) auto-save via API.

### K2.4: Backend-Integration

Die Metadaten werden im bestehenden `metadata` JSONB-Feld gespeichert (aus Block 4A.8). Das Schema validiert NUR im Frontend. Backend akzeptiert beliebiges JSON im `metadata` Feld — das ist beabsichtigt fuer Flexibilitaet.

**Warum keine Backend-Validierung:** User-definierbare Felder sollen ohne Backend-Deployment ergaenzt werden koennen. Neue Schemas → neues Frontend-Build. Backend bleibt schema-agnostisch.

**Spaetere Erweiterung (NICHT jetzt):** Schema-Validierung im Backend via JSON Schema Draft 2020-12 Library (`python-jsonschema`). Erst wenn User Custom-Schemas ueber die UI anlegen koennen.

**Registrierung nach Implementierung:**
- [ ] `El Frontend: src/config/device-schemas/` Verzeichnis erstellen
- [ ] Schemas fuer alle existierenden Geraetetypen anlegen (Agent prueft welche es gibt)
- [ ] SchemaForm.vue implementieren + in DeviceDetailPanel einbinden
- [ ] index.ts Registry befuellen

---

## Block K3: Zone-Context Datenmodell (~6-8h)

### Forschungsbasis

CEA Digital Twin Papers (P2, P3, P4): Konsistente 3-Ebenen-Modelle: Infrastruktur, Umwelt (Zone), Pflanzen. Zone-Level-Parameter als eigenstaendige Daten-Entitaet.

SAP/ThingWorx ERP-Integration: Pro-Asset Business-Metadaten neben technischen Daten. JSONB/JSON-Felder fuer flexible Erweiterbarkeit.

### K3.1: Datenbank-Schema

**Datei:** `El Servador/god_kaiser_server/src/db/models/zone_context.py`

```python
class ZoneContext(Base, TimestampMixin):
    """Betriebsspezifische Kontextdaten pro Zone.

    Ergaenzt die technischen Sensor-Daten um Business-Kontext:
    Pflanzen, Substrat, Arbeitszeiten, Sorten, Wachstumsphasen.
    Erweiterbar via JSONB custom_data Feld.
    """
    __tablename__ = "zone_context"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    zone_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    zone_name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Pflanzen-Daten
    plant_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    variety: Mapped[str | None] = mapped_column(String(255), nullable=True)
    substrate: Mapped[str | None] = mapped_column(String(255), nullable=True)
    growth_phase: Mapped[str | None] = mapped_column(String(50), nullable=True)  # seedling, vegetative, flower, harvest
    planted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expected_harvest: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Betriebsdaten
    responsible_person: Mapped[str | None] = mapped_column(String(255), nullable=True)
    work_hours_weekly: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Erweiterbare Daten (JSONB)
    custom_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default=text("'{}'"))

    # Historisierung: Letzter Snapshot (fuer Anbau-Zyklen)
    cycle_history: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'"))
```

**Enum fuer Wachstumsphasen:**
```python
GROWTH_PHASES = [
    "seedling",      # Saemling
    "vegetative",    # Vegetative Phase
    "flower_early",  # Fruehe Bluete
    "flower_mid",    # Mittlere Bluete
    "flower_late",   # Spaete Bluete
    "harvest",       # Ernte
    "drying",        # Trocknung
    "curing",        # Fermentierung
]
```

**Alembic-Migration:** Eine Migration fuer `zone_context` Tabelle. Naming: `add_zone_context_table.py`.

### K3.2: REST-API

**Datei:** `El Servador/god_kaiser_server/src/api/v1/zone_context.py` — `router = APIRouter(prefix="/v1/zones/context", tags=["zone-context"])`

[Korrektur] Bestehendes Pattern: Zone-API nutzt Prefix `/v1/zone` (Singular). Neuer Router sollte konsistent sein: `/v1/zone/context` (Singular) statt `/v1/zones/context` (Plural). Alternativ als Erweiterung des bestehenden zone.py Routers.

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | `/v1/zones/context` | Alle Zone-Kontexte (mit Pagination) |
| GET | `/v1/zones/context/{zone_id}` | Kontext einer Zone |
| PUT | `/v1/zones/context/{zone_id}` | Kontext erstellen/aktualisieren (Upsert) |
| PATCH | `/v1/zones/context/{zone_id}` | Einzelne Felder aktualisieren |
| POST | `/v1/zones/context/{zone_id}/archive-cycle` | Aktuellen Zyklus archivieren (in cycle_history) + Felder zuruecksetzen |
| GET | `/v1/zones/context/{zone_id}/history` | Anbau-Zyklen-Historik |

**Pydantic-Schema:**
```python
class ZoneContextUpdate(BaseModel):
    zone_name: str | None = None
    plant_count: int | None = None
    variety: str | None = None
    substrate: str | None = None
    growth_phase: str | None = None
    planted_date: date | None = None
    expected_harvest: date | None = None
    responsible_person: str | None = None
    work_hours_weekly: float | None = None
    notes: str | None = None
    custom_data: dict | None = None

class ZoneContextResponse(BaseModel):
    id: int
    zone_id: str
    zone_name: str
    plant_count: int | None
    variety: str | None
    substrate: str | None
    growth_phase: str | None
    planted_date: date | None
    expected_harvest: date | None
    responsible_person: str | None
    work_hours_weekly: float | None
    notes: str | None
    custom_data: dict
    cycle_history: list
    created_at: datetime
    updated_at: datetime

    # Berechnete Felder
    plant_age_days: int | None  # Berechnet aus planted_date
    days_to_harvest: int | None  # Berechnet aus expected_harvest
```

### K3.3: ZoneContextEditor.vue

**Datei:** `El Frontend: src/components/inventory/ZoneContextEditor.vue`
**Groesse:** ~250-300 Zeilen

Formular fuer die Zone-spezifischen Daten. Kann entweder:
- **Im DeviceDetailPanel** als Tab/Sektion (unter dem Geraet → Zone-Kontext anzeigen)
- **Als eigene Ansicht** erreichbar ueber Zone-Filter → Zone-Detail-Button

**Felder-Layout (2 Spalten wo sinnvoll):**

| Gruppe | Felder |
|--------|--------|
| **Pflanzen** | Anzahl, Sorte, Substrat, Wachstumsphase (Dropdown), Pflanzedatum, Ernte-Datum |
| **Betrieb** | Verantwortlicher, Wochenstunden, Notizen |
| **Berechnete KPIs** | Pflanzenalter (Tage), Tage bis Ernte, Phase-Progress-Bar |
| **Erweiterbare Felder** | Dynamisch aus `custom_data` (analog SchemaForm aus Block K2) |

**Anbau-Zyklus archivieren:** Button "Zyklus abschliessen" → Bestaetigungsdialog → POST `/archive-cycle` → Felder werden zurueckgesetzt, alter Zyklus geht in `cycle_history`. Kleine Timeline der vergangenen Zyklen als visuelles Element.

**Registrierung nach Implementierung:**
- [ ] Backend: ZoneContext Model, Schema, API-Router anlegen
- [ ] Backend: Router in `__init__.py` registrieren
- [ ] Backend: Alembic-Migration erstellen + ausfuehren
- [ ] Frontend: ZoneContextEditor implementieren
- [ ] Frontend: In DeviceDetailPanel oder als eigene Sektion einbinden
- [ ] Frontend: API-Client (`inventory.ts`) um Zone-Context-Endpoints erweitern

---

## Block K4: AI-Ready Export & MCP-Vorbereitung (~5-7h)

### Forschungsbasis

W3C WoT Thing Description 2.0: JSON-LD-basiertes Format mit Properties, Actions, Events. Maschinenlesbar, standardisiert.

IoT-MCP (arxiv 2510.01260): 100% Tool-Call-Erfolgsrate, 205ms Antwortzeit. Edge-Server uebersetzen Geraete-Metadaten in MCP-Tool-Beschreibungen.

dMCP Paper (WCSP 2025): LLM reasoned ueber Echtzeit-Kontext → generiert ausfuehrbare Policy-Vektoren ueber MCP-Interface.

Smart Districts Paper (2025): Sensor-Metadaten als Vector Index + Knowledge Graph → LLM-assisted Graph Query.

### K4.1: Component Export API

**Datei:** `El Servador/god_kaiser_server/src/api/v1/component_export.py` — `router = APIRouter(prefix="/v1/export", tags=["export"])`

| Methode | Endpoint | Beschreibung |
|---------|----------|-------------|
| GET | `/v1/export/components` | Alle Komponenten als AI-Ready JSON |
| GET | `/v1/export/components/{id}` | Einzelne Komponente |
| GET | `/v1/export/zones` | Alle Zonen mit Context |
| GET | `/v1/export/zones/{zone_id}` | Einzelne Zone mit allen Komponenten + Context |
| GET | `/v1/export/system-description` | Gesamtsystem als WoT System Description |

### K4.2: AI-Ready JSON Format

**Pro-Komponente:**
```json
{
  "@context": "automationone://schemas/component/v1",
  "id": "sensor_sht31_001",
  "type": "sensor",
  "deviceType": "sht31",
  "name": "SHT31 Bluete-A Decke",
  "hardware": {
    "manufacturer": "Sensirion",
    "model": "SHT31-D",
    "interface": "I2C",
    "address": "0x44",
    "firmware": "2.1.0",
    "installation_date": "2025-11-15"
  },
  "location": {
    "zone_id": "zone_bluete_a",
    "zone_name": "Bluete-Raum A",
    "esp_id": "ESP_472204",
    "position": "Deckenmitte"
  },
  "capabilities": {
    "measures": ["temperature", "humidity"],
    "units": {"temperature": "°C", "humidity": "%RH"},
    "ranges": {"temperature": [-40, 125], "humidity": [0, 100]},
    "accuracy": {"temperature": "±0.3°C", "humidity": "±2%RH"}
  },
  "current_state": {
    "status": "online",
    "last_seen": "2026-03-02T14:30:00Z",
    "values": {"temperature": 24.3, "humidity": 62.1}
  },
  "runtime": {
    "uptime_hours": 2400,
    "last_restart": "2026-02-28T03:00:00Z",
    "next_maintenance": "2026-04-01",
    "error_rate_24h": 0.001
  },
  "alerts": {
    "active_count": 0,
    "suppressed": false,
    "thresholds": {
      "temperature": {"warning_high": 30, "critical_high": 35, "warning_low": 18, "critical_low": 15},
      "humidity": {"warning_high": 75, "critical_high": 85, "warning_low": 40, "critical_low": 30}
    }
  },
  "metadata": {}
}
```

**Pro-Zone (mit Context):**
```json
{
  "@context": "automationone://schemas/zone/v1",
  "zone_id": "zone_bluete_a",
  "zone_name": "Bluete-Raum A",
  "context": {
    "plant_count": 24,
    "variety": "Wedding Cake",
    "substrate": "Coco/Perlite 70/30",
    "growth_phase": "flower_week_5",
    "planted_date": "2026-01-15",
    "expected_harvest": "2026-04-15",
    "plant_age_days": 46,
    "days_to_harvest": 44,
    "responsible_person": "Robin",
    "work_hours_weekly": 8.0
  },
  "components": [
    { "... Component-Export wie oben ..." }
  ],
  "environment_summary": {
    "temperature": {"current": 24.3, "avg_24h": 23.8, "trend": "stable"},
    "humidity": {"current": 62.1, "avg_24h": 61.5, "trend": "stable"},
    "vpd": {"current": 1.12, "target": 1.15, "deviation": -2.6}
  }
}
```

### K4.3: MCP-Vorbereitung (Doku, kein Code)

Der eigentliche MCP-Server kommt in Phase 4C (Plugin-System). Aber die Export-API in K4.1 ist so strukturiert, dass ein MCP-Server diese Endpunkte direkt als Tools exponieren kann:

| MCP Tool (zukuenftig) | Mapping auf Export-API |
|------------------------|----------------------|
| `get_all_components()` | GET `/v1/export/components` |
| `get_component(id)` | GET `/v1/export/components/{id}` |
| `get_zone_info(zone_id)` | GET `/v1/export/zones/{zone_id}` |
| `get_system_overview()` | GET `/v1/export/system-description` |
| `query_components(filter)` | GET `/v1/export/components?type=sensor&zone=bluete_a` |

**LLM-Nutzungsszenarien (aus Forschung bestaetigt):**
- "Welche Sensoren sind in der Bluete-Zone?" → `get_zone_info("zone_bluete_a")` → components
- "Wann ist die naechste Wartung faellig?" → `get_all_components()` → filter by next_maintenance
- "Welches Substrat wird in Zone Veg-B verwendet?" → `get_zone_info("zone_veg_b")` → context.substrate
- "Ist die Bewaesserung noetig?" → `get_zone_info(...)` → environment_summary + context + component states

**Registrierung nach Implementierung:**
- [ ] Backend: Export-API-Router anlegen und registrieren
- [ ] Backend: Serializer fuer AI-Ready JSON Format
- [ ] Dokumentation: MCP-Tool-Mapping in Roadmap-Dokument ergaenzen

---

## Abhaengigkeiten und Reihenfolge

```
VORAUSSETZUNG: Block 4A.8 (Hardware-Info + Runtime)
═══════════════════════════════════════════════════
4A.8.1 HardwareInfoSection       ← Liefert metadata JSONB
4A.8.2 RuntimeMaintenanceSection ← Liefert runtime_stats JSONB

KOMPONENTEN-TAB UMBAU
═════════════════════

Block K1 (Inventar-Tabelle):
├── K1.4 Inventory Store          ← ZUERST (Filter-State)
├── K1.1 ComponentInventoryView   ← NACH Store
├── K1.2 InventoryTable           ← Parallel zu K1.1
├── K1.3 DeviceDetailPanel        ← NACH K1.2 (Row-Click → Detail)
└── Frontend-Integration          ← ZULETZT (alles verbinden)

Block K2 (Schema-Registry):
├── K2.1 JSON Schemas erstellen   ← ZUERST (statische Dateien)
├── K2.2 Registry Index           ← NACH K2.1
├── K2.3 SchemaForm.vue           ← NACH K2.2
└── In DeviceDetailPanel einbinden ← ZULETZT

Block K3 (Zone-Context):
├── K3.1 Backend (DB + Migration) ← ZUERST
├── K3.2 REST-API                 ← NACH K3.1
├── K3.3 ZoneContextEditor.vue    ← NACH K3.2
└── In View einbinden             ← ZULETZT

Block K4 (AI-Export):
├── K4.1 Export-API               ← NACH K1 + K3 (braucht beide Datenmodelle)
├── K4.2 Serializer               ← Parallel zu K4.1
└── K4.3 Dokumentation            ← NACH K4.1

BLOCK-ABHAENGIGKEITEN
═════════════════════
K1 (Inventar-Tabelle)  ← Braucht 4A.8 (metadata Felder)
K2 (Schema-Registry)   ← Unabhaengig von K1, aber sinnvoll danach
K3 (Zone-Context)      ← Unabhaengig von K1/K2
K4 (AI-Export)         ← NACH K1 + K3 (braucht beide Datenquellen)

Empfohlene Reihenfolge:
4A.8 → K1 → K2 → K3 (parallel zu K2) → K4
```

---

## Akzeptanzkriterien

### Basis (MUSS)

- [ ] **Inventar-Tabelle:** Alle Sensoren + Aktoren in einer flachen Tabelle sichtbar
- [ ] **Suche:** Freitext-Suche findet Geraete nach Name, Typ, Zone, Hersteller
- [ ] **Filter:** Zone-, Typ- und Status-Filter funktionieren einzeln und kombiniert
- [ ] **Sortierung:** Klick auf Spalten-Header sortiert korrekt (asc/desc)
- [ ] **Detail-Panel:** Klick auf Geraet oeffnet SlideOver mit Hardware-Info + Runtime + Metadaten
- [ ] **Schema-Felder:** Pro Geraetetyp werden die richtigen Metadaten-Felder angezeigt
- [ ] **Metadaten speichern:** Eingegebene Metadaten werden im JSONB-Feld persistiert
- [ ] **Zone-Context:** Pro Zone koennen Pflanzen, Substrat, Sorte, Phase eingetragen werden
- [ ] **Zyklus-Archivierung:** "Zyklus abschliessen" archiviert und setzt Felder zurueck
- [ ] **Export-API:** GET `/v1/export/components` liefert valides AI-Ready JSON
- [ ] **Spalten-Persistenz:** Column-Visibility bleibt nach Page-Reload erhalten

### Erweitert (SOLL)

- [ ] **Responsive:** Tabelle auf Tablet nutzbar (horizontales Scrollen)
- [ ] **Pagination:** Page-Size-Auswahl (10/25/50) funktioniert
- [ ] **Conditional Styling:** Offline-Geraete visuell abgesetzt, Wartung-faellig markiert
- [ ] **Cross-Tab-Links:** Geraet → Monitor-Zone, Zone-Context → Zone-Monitor
- [ ] **Focus-Parameter:** Deep-Link mit `?focus=sensor_123` scrollt zum Geraet

---

## Offene Entscheidungen (Agent klaert bei Implementierung)

1. **DataTable.vue wiederverwenden oder neu?** [GEKLAERT durch verify-plan] DataTable.vue liegt in `components/database/` (nicht `shared/design/`), ist DB-spezifisch (UUID-Formatter, max 8 Spalten hardcoded, importiert aus `@/api/database`). Entscheidung: **Eigene InventoryTable bauen.** DataTable ist NICHT generisch genug.
2. **SchemaForm Library vs. Handgebaut?** Bei nur 7 Feldtypen (string, number, boolean, date, url, enum, textarea) ist handgebaut einfacher als eine Library-Dependency. Agent entscheidet.
3. **Zone-Context UI-Position:** Im DeviceDetailPanel als Tab? Als eigener Bereich in der Inventar-Ansicht? Als separater View? Am sinnvollsten: Zone-Header in der Tabelle klickbar → ZoneContextEditor als SlideOver.
4. **Custom-Data Schema fuer Zone-Context:** JSON Schema fuer `custom_data` analog zu Device-Schemas? Oder freiform? Empfehlung: Freiform fuer V1, Schema spaeter.

---

## Wissensbasis

Dieses Auftragsdokument basiert auf:

| Typ | Dokument | Pfad |
|-----|----------|------|
| Praxis-Recherche | IoT Component Inventory & AI-Ready Metadata (28 Quellen) | `wissen/iot-automation/iot-component-inventory-ai-metadata-infrastructure-2026.md` [TM-lokal, nicht im Repo] |
| Forschung | IoT Metadata, AI-Integration & CEA Digital Twins (8 Papers) | `wissen/iot-automation/forschung-iot-metadata-ai-integration-cea-2026.md` [TM-lokal, nicht im Repo] |
| Bestandswissen | IoT Device Config Panel UX Patterns | `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` [TM-lokal, nicht im Repo] |
| Abhaengigkeit | Phase 4A Block 4A.8 (Hardware-Info + Runtime) | `arbeitsbereiche/automation-one/hardware-tests/auftrag-phase4a-notification-stack.md` [TM-lokal, nicht im Repo] |
| Recherche-Bericht | Gesamtbericht der Recherche | `.claude/reports/current/recherche-bericht-component-inventory-ai-metadata-2026-03-02.md` [NICHT vorhanden im Repo] |

---

## /verify-plan Ergebnis

**Plan:** Komponenten-Tab Umbau zu Hardware-Inventar mit Schema-Registry, Zone-Context und AI-Export
**Geprueft:** 18 Pfade, 0 Agents, 2 Services (Backend/Frontend), 8 API-Endpunkte, 12 Sensor-Typen

### Bestaetigte Punkte

- SensorsView.vue existiert unter `El Frontend/src/views/SensorsView.vue` — Route `/sensors` mit `meta: { title: 'Komponenten' }`
- useZoneGrouping.ts existiert und liefert `allSensors`/`allActuators` als flache Arrays (korrekt beschrieben)
- SlideOver.vue existiert unter `El Frontend/src/shared/design/primitives/SlideOver.vue`
- useSparklineCache.ts existiert
- Backend-Modelle: `sensor_metadata` (SensorConfig), `actuator_metadata` (ActuatorConfig), `device_metadata` (ESPDevice) existieren als JSON-Felder
- `runtime_stats` existiert auf SensorConfig und ActuatorConfig (Phase 4A.8 Migration vorhanden)
- `alert_config` existiert auf allen drei Modellen (Phase 4A.7)
- API-Router-Pattern korrekt identifiziert (`APIRouter(prefix="/v1/...")`)
- Store-Pattern in `shared/stores/` korrekt (15 existierende Stores)
- API-Client-Pattern in `El Frontend/src/api/` korrekt (21 existierende API-Module)
- Alembic-Verzeichnis existiert mit 25+ Migrationen
- DeviceMetadata TypeScript-Interface existiert bereits in `types/device-metadata.ts`
- ESP hat `zone_id` und `zone_name` Felder — ZoneContext als eigene Tabelle ist korrekt
- Deprecated `/actuators` Route leitet auf `/sensors?tab=actuators` weiter — Route-Kompatibilitaet bestaetigt
- Keine Firmware-Aenderungen noetig (korrekt)

### Korrekturen (bereits inline im Plan markiert)

**1. Backend-Pfade: `El Servador: src/` → `El Servador/god_kaiser_server/src/`**
- Plan sagt: `El Servador: src/db/models/zone_context.py`
- System sagt: Voller Pfad ist `El Servador/god_kaiser_server/src/db/models/zone_context.py`
- Betrifft ALLE Backend-Pfade im Plan (7 Stellen) — in Modul-Tabelle korrigiert

**2. DataTable.vue: Falscher Pfad + nicht generisch**
- Plan sagt: `El Frontend: src/shared/design/` (generische Tabellenkomponente)
- System sagt: `El Frontend/src/components/database/DataTable.vue` (DB-spezifisch, max 8 Spalten, UUID-Logik)
- Empfehlung: Eigene InventoryTable bauen — in Plan korrigiert

**3. Feld-Namen: `metadata` → `sensor_metadata`/`actuator_metadata`/`device_metadata`**
- Plan sagt: `SensorConfig.metadata`, `ActuatorConfig.metadata`
- System sagt: Felder heissen `sensor_metadata`, `actuator_metadata`, `device_metadata`
- Empfehlung: Im Frontend beim Mapping die echten Feld-Namen verwenden

**4. ESPDevice.runtime_stats existiert NICHT**
- Plan sagt: `ESPDevice.runtime_stats` existiert seit 4A.8
- System sagt: `runtime_stats` existiert NUR auf SensorConfig und ActuatorConfig, NICHT auf ESPDevice
- Empfehlung: Im Export (K4) ESPDevice-Level runtime_stats NICHT referenzieren oder als Aggregat berechnen

**5. SensorWithContext-Felder weichen ab**
- Plan sagt: `s.id`, `s.latest_value`, `s.is_online`, `s.last_seen`, `s.metadata`
- System sagt: Kein `id`-Feld (synthetisch aus `esp_id_gpio`), `raw_value` statt `latest_value`, kein `is_online` (ableiten aus `esp_state`), `last_read` statt `last_seen`, kein `metadata`/`runtime_stats`
- Empfehlung: Neues Composable `useInventoryData.ts` das fehlende Felder aus espStore-Device-Objekt liest

**6. Sensor-Typen: `bme280` → `bmp280`, `bh1750` → `light`**
- Plan sagt: Schema-Dateien fuer `bme280`, `bh1750`
- System sagt: Registry verwendet `bmp280` (nicht `bme280`), `bh1750` wird als `light` normalisiert
- Empfehlung: Schema-Dateien nach Device-Typ benennen (sht31, bmp280, ds18b20, moisture, light)

**7. Zone-API-Prefix: Plural vs. Singular**
- Plan sagt: `prefix="/v1/zones/context"`
- System sagt: Bestehendes Pattern ist `/v1/zone` (Singular)
- Empfehlung: `/v1/zone/context` fuer Konsistenz

### Fehlende Vorbedingungen

- [ ] Pruefen ob `sensor_metadata`/`actuator_metadata`/`runtime_stats` bereits ueber die REST-API exponiert werden (GET /v1/sensors/... Response-Schema pruefen)
- [ ] Pruefen ob Frontend-Store (`esp.ts`) die metadata/runtime_stats Felder beim Device-Fetch speichert
- [ ] Alembic `head` pruefen — die neue zone_context Migration muss auf den aktuellen Head aufbauen (25+ bestehende Migrationen, potenzielle Multi-Head-Situation)

### Ergaenzungen

- **Bereits existiert:** `DeviceMetadata` Interface in `types/device-metadata.ts` mit `parseDeviceMetadata()`, `mergeDeviceMetadata()`, `getNextMaintenanceDate()`, `isMaintenanceOverdue()`. Das Schema-Registry-Konzept (K2) sollte dieses Interface als Basis nutzen statt es zu duplizieren.
- **Store-Registration:** Neuer `inventory.store.ts` muss in `shared/stores/index.ts` re-exportiert werden (Pattern: jeder Store wird dort registriert)
- **API-Client-Registration:** Neuer `inventory.ts` API-Client — pruefen ob `api/index.ts` einen zentralen Re-Export hat
- **Zone-ID-Format:** Bestehendes `zone_id` auf ESPDevice ist `String(100)`. ZoneContext.zone_id muss dasselbe Format verwenden. Es gibt KEIN separates Zone-Model — Zonen existieren nur als Felder auf ESPDevice.
- **DB-Typ:** Plan verwendet `JSONB` fuer `custom_data` und `cycle_history`, aber bestehende Modelle nutzen durchgehend `JSON` (nicht `JSONB`). Fuer PostgreSQL ist beides moeglich, aber fuer Konsistenz `JSON` verwenden (es sei denn GIN-Indizes auf custom_data geplant sind).
- **Alembic down_revision:** Aktuelle Head-Migration pruefen. Die letzte Migration ist `add_alert_config_and_runtime_stats` (rev `a4a7_alert_runtime`). Neue Migration muss darauf aufbauen (oder auf einen spaeteren Head falls weitere Migrationen existieren).
- **Monitor-Tab-Link:** Plan referenziert `router.push({ name: 'monitor-zone', params: { zoneId } })` — pruefen ob diese Route existiert

### Zusammenfassung fuer TM

Der Plan ist grundsaetzlich solide und gut durchdacht. Die Hauptprobleme sind:
1. **Alle Backend-Pfade** fehlten den `god_kaiser_server/`-Prefix (korrigiert)
2. **Feld-Namen** im Frontend weichen erheblich von der Annahme ab — `SensorWithContext` hat weder `id`, `metadata`, `runtime_stats`, `is_online` noch `latest_value`. Ein neues Composable ist noetig.
3. **DataTable.vue** ist nicht generisch — eigene InventoryTable ist die richtige Entscheidung
4. **Sensor-Typ-Bezeichnungen** muessen der Server-Registry folgen (`bmp280` statt `bme280`)

Der Plan ist ausfuehrbar nach diesen Korrekturen. Empfohlene Block-Reihenfolge bleibt korrekt: K1 → K2 → K3 → K4.

---

## Ausfuehrbarer Implementierungsplan (korrigiert)

### Vorbedingung: Daten-Lage pruefen (30 min)

Bevor Block K1 gestartet wird, muss ein Dev-Agent (frontend-dev oder server-dev) pruefen:
1. GET `/v1/sensors/{esp_id}` Response-Schema: Werden `sensor_metadata` und `runtime_stats` bereits zurueckgegeben?
2. `espStore.ts`: Werden `sensor_metadata`/`runtime_stats` beim Device-Fetch gespeichert oder verworfen?
3. Falls nein: Backend-Schema und Frontend-Store muessen ZUERST erweitert werden (Teil von 4A.8)

### Block K1: Inventar-Tabelle

**Agent:** `frontend-dev`
**Reihenfolge:**

```
Schritt 1: inventory.store.ts anlegen
  Pfad: El Frontend/src/shared/stores/inventory.store.ts
  Re-Export in: El Frontend/src/shared/stores/index.ts
  Inhalt: Filter-State, Pagination, Column-Visibility, selectedDeviceId

Schritt 2: useInventoryData.ts Composable erstellen (NEU — nicht im Original-Plan)
  Pfad: El Frontend/src/composables/useInventoryData.ts
  Aufgabe: Erweitert useZoneGrouping um metadata + runtime_stats aus espStore
  Liefert: allComponents: ComponentItem[] (unified sensors + actuators)
  Mapping: esp_id+gpio → id, raw_value → currentValue, esp_state → status,
           last_read → lastSeen, sensor_metadata/actuator_metadata → metadata

Schritt 3: InventoryTable.vue erstellen
  Pfad: El Frontend/src/components/inventory/InventoryTable.vue
  NICHT DataTable.vue erweitern — eigene Komponente
  Features: Column-Visibility, Sortierung, Pagination, Conditional Styling
  Basis-Primitives: BaseInput (Suche), BaseSelect (Filter)

Schritt 4: DeviceDetailPanel.vue erstellen
  Pfad: El Frontend/src/components/inventory/DeviceDetailPanel.vue
  Nutzt: SlideOver.vue (aus shared/design/primitives/)
  Nutzt: useSparklineCache.ts fuer Mini-Sparkline

Schritt 5: SensorsView.vue rewriten
  Pfad: El Frontend/src/views/SensorsView.vue (in-place rewrite)
  Route bleibt: /sensors (name: 'sensors')
  Interner Name: ComponentInventoryView

Schritt 6: API-Client erstellen
  Pfad: El Frontend/src/api/inventory.ts
  Endpoints: metadata PATCH, zone-context CRUD, export GET
```

### Block K2: Schema-Registry

**Agent:** `frontend-dev`
**Reihenfolge:**

```
Schritt 1: Verzeichnis + base.schema.json
  Pfad: El Frontend/src/config/device-schemas/
  Basis-Schema: Nutzt DeviceMetadata-Interface als Referenz

Schritt 2: Geraetetyp-Schemas erstellen
  Pro Typ: sht31, bmp280, ds18b20, moisture, ph, ec, light, relay, pwm
  Typen aus: sensor_type_registry.py MULTI_VALUE_SENSORS + SENSOR_TYPE_MAPPING

Schritt 3: Registry Index (index.ts)
  Device-Typ → Schema Mapping
  getSchemaForDevice() Funktion

Schritt 4: SchemaForm.vue
  Pfad: El Frontend/src/components/inventory/SchemaForm.vue
  Handgebaut (7 Feldtypen), keine externe Library

Schritt 5: In DeviceDetailPanel einbinden
```

### Block K3: Zone-Context

**Agent:** `server-dev` (Backend) → `frontend-dev` (Frontend)
**Reihenfolge:**

```
Backend (server-dev):
  Schritt 1: ZoneContext Model
    Pfad: El Servador/god_kaiser_server/src/db/models/zone_context.py
    JSON-Typ: JSON (nicht JSONB) fuer Konsistenz mit bestehenden Modellen
    Import in: El Servador/god_kaiser_server/src/db/models/__init__.py

  Schritt 2: Pydantic Schema
    Pfad: El Servador/god_kaiser_server/src/schemas/zone_context.py

  Schritt 3: Alembic Migration
    Pfad: El Servador/god_kaiser_server/alembic/versions/add_zone_context_table.py
    down_revision: Aktuellen Head ermitteln (wahrscheinlich a4a7_alert_runtime oder spaeter)

  Schritt 4: REST-API Router
    Pfad: El Servador/god_kaiser_server/src/api/v1/zone_context.py
    Prefix: /v1/zone/context (Singular, konsistent mit /v1/zone)
    Registrieren in: El Servador/god_kaiser_server/src/api/v1/__init__.py

Frontend (frontend-dev):
  Schritt 5: ZoneContextEditor.vue
    Pfad: El Frontend/src/components/inventory/ZoneContextEditor.vue

  Schritt 6: API-Client erweitern
    Pfad: El Frontend/src/api/inventory.ts (Zone-Context Endpoints hinzufuegen)
```

### Block K4: AI-Export

**Agent:** `server-dev`
**Reihenfolge:**

```
Schritt 1: Export-API Router
  Pfad: El Servador/god_kaiser_server/src/api/v1/component_export.py
  Prefix: /v1/export
  Registrieren in: El Servador/god_kaiser_server/src/api/v1/__init__.py

Schritt 2: Serializer-Funktionen
  Pro-Komponente und Pro-Zone JSON-Builder
  Aggregiert: SensorConfig + sensor_metadata + runtime_stats + ZoneContext

Schritt 3: Doku
  MCP-Tool-Mapping in Roadmap-Dokument
```

### Checkliste nach Abschluss

- [ ] `pio run` (ESP32 nicht betroffen, aber sicherheitshalber)
- [ ] `pytest El Servador/god_kaiser_server/tests/` (Backend-Tests)
- [ ] Alembic Migration testen: `alembic upgrade head` + `alembic downgrade -1`
- [ ] Frontend Build: `npm run build` im `El Frontend/`
- [ ] REST-API manuell testen: zone-context CRUD, export endpoints
- [ ] /updatedocs ausfuehren nach Abschluss
