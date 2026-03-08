# Frontend Dev Report: DS18B20 Add-Flow Analyse — Echter ESP

## Modus: A (Analyse)
## Auftrag: DS18B20-Add-Flow fuer echten ESP (Wokwi) vollstaendig analysieren. Warum schlaegt er fehl?

---

## Codebase-Analyse

### Analysierte Dateien
- `El Frontend/src/components/esp/AddSensorModal.vue` (825 Zeilen, vollstaendig gelesen)
- `El Frontend/src/components/esp/SensorConfigPanel.vue` (>53KB, gezielt gelesen)
- `El Frontend/src/api/sensors.ts` (vollstaendig gelesen)
- `El Frontend/src/stores/esp.ts` (>83KB, Zeilen 660-730 = `addSensor` Action gezielt gelesen)
- `El Frontend/src/api/esp.ts` (Zeilen 170-189 = `isMockEsp` gelesen)
- `El Frontend/src/shared/stores/gpio.store.ts` (Zeilen 260-360 = `scanOneWireBus` gelesen)
- `El Frontend/src/components/esp/DeviceDetailView.vue` (vollstaendig gelesen)
- `El Frontend/src/views/HardwareView.vue` (gezielt gegrept)
- `El Frontend/src/components/esp/ESPOrbitalLayout.vue` (gezielt gegrept)

---

## UI-Flow: DS18B20 bei echtem ESP hinzufuegen (vollstaendig dokumentiert)

### Einstiegspunkt
Der Nutzer gelangt ueber zwei moegliche Wege zum AddSensorModal:

**Weg A (Drag & Drop):** Sidebar-Komponente in Dashboard → Sensor-Typ auf ESPOrbitalLayout ziehen → `useOrbitalDragDrop` setzt `showAddSensorModal = true` und `droppedSensorType = 'ds18b20'`

**Weg B (Manuell):** "Sensor hinzufuegen"-Button in ESPCard/ESPOrbitalLayout → `showAddSensorModal = true` ohne vorselektierten Typ

Das `AddSensorModal` wird von `ESPOrbitalLayout.vue` (Zeile 394-395) und ueber `DeviceDetailView.vue → HardwareView.vue` gerendert.

### Schritt 1: Modal oeffnet sich
```
watch(props.modelValue) → resetForm() → Typ 'ds18b20' ist Default
```
- Form-State: `sensor_type = 'ds18b20'`, `gpio = oneWireScanPin.value (4)`
- Wenn `initialSensorType` gesetzt: Typ wird auf ds18b20 vorgewaehlt
- `isOneWireSensor = computed(() => sensor_type.includes('ds18b20'))` → true

### Schritt 2: OneWire-Scan-Sektion erscheint
- Template: `v-if="isOneWireSensor"` → Zeigt OneWire-Scan-Sektion
- User waehlt GPIO-Pin (Dropdown, Default GPIO 4)
- User klickt "Bus scannen"

### Schritt 3: Scan-Button → `handleOneWireScan()`
```
handleOneWireScan() → espStore.scanOneWireBus(espId, pin)
  → gpioStore.scanOneWireBus()
    → oneWireApi.scanBus(espId, pin)
      → POST /api/v1/sensors/esp/{esp_id}/onewire/scan?pin=4
```
Bei echtem ESP: Der Server sendet einen MQTT-Befehl zum ESP. ESP scannt den OneWire-Bus und antwortet. Das kann 1-10 Sekunden dauern.
Bei Wokwi-Simulation: Haengt davon ab, ob die Simulation OneWire-Scan-Befehle implementiert hat.

Kritischer Punkt — falls der ESP offline ist oder der MQTT-Scan fehlschlaegt:
- HTTP 503 → "ESP-Gerät ist offline"
- HTTP 504 → "ESP antwortet nicht (Timeout)"
- Fehler landet in `state.scanError` → UI zeigt Fehler-Banner

### Schritt 4: Scan-Ergebnisse
Falls Scan erfolgreich: Devices werden in der Liste angezeigt.
User waehlt ROM-Codes via Checkbox aus.

### Schritt 5: "N neue Sensoren hinzufuegen" → `addMultipleOneWireSensors()`
```typescript
// AddSensorModal.vue Zeilen 322-361
for (const romCode of romCodesToAdd) {
  const device = state.scanResults.find(d => d.rom_code === romCode)
  const autoName = `Temp ${romCode.slice(-4)}`
  const sensorData = buildSensorPayload({
    sensor_type: (device?.device_type || 'ds18b20').toUpperCase(),
    gpio: oneWireScanPin.value,
    onewire_address: romCode,
    interface_type: 'ONEWIRE',
    name: newSensor.value.name || autoName,
  })
  await espStore.addSensor(props.espId, sensorData)
}
```

`buildSensorPayload()` (Zeilen 229-243) nimmt alle User-Inputs und merged `overrides`:
```typescript
function buildSensorPayload(overrides) {
  return {
    sensor_type: newSensor.value.sensor_type,
    name: newSensor.value.name || undefined,    // User-Name-Input
    raw_value: newSensor.value.raw_value,
    unit: newSensor.value.unit,
    gpio: newSensor.value.gpio,
    quality: newSensor.value.quality,
    raw_mode: newSensor.value.raw_mode,
    operating_mode: newSensor.value.operating_mode,
    timeout_seconds: newSensor.value.timeout_seconds,
    subzone_id: normalizeSubzoneId(newSensor.value.subzone_id),
    ...overrides,
  }
}
```

### Schritt 6: ESP Store `addSensor()` — Real-ESP-Pfad

```typescript
// esp.ts Zeilen 683-723
if (isMock(deviceId)) {
  await debugApi.addSensor(deviceId, config)     // Mock-Pfad
} else {
  // REAL-ESP-Pfad
  const interfaceType = inferInterfaceType(config.sensor_type)
  const defaultI2CAddress = getDefaultI2CAddress(config.sensor_type)

  const realConfig: SensorConfigCreate = {
    esp_id: deviceId,
    gpio: config.gpio,
    sensor_type: config.sensor_type,
    name: config.name || null,
    enabled: true,
    subzone_id: normalizeSubzoneId(config.subzone_id),
    interface_type: config.interface_type || interfaceType,
    i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
    onewire_address: config.onewire_address || null,
    operating_mode: config.operating_mode || 'continuous',
    timeout_seconds: config.timeout_seconds ?? 180,
    // ...
  }
  await sensorsApi.createOrUpdate(deviceId, config.gpio, realConfig)
}
```

---

## Identifizierte Bugs und Probleme

### BUG-A (KRITISCH fuer I2C): `addSensor` fuer Real-ESP ignoriert User-gewaehlte I2C-Adresse

**Betrifft:** I2C-Sensoren (SHT31, BMP280) bei echten ESPs — nicht DS18B20.

**Ort:** `El Frontend/src/stores/esp.ts` Zeile 704
```typescript
// BUG: Nutzt IMMER defaultI2CAddress aus Registry, ignoriert config.i2c_address
i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
```
Der User waehlt im Modal eine I2C-Adresse (z.B. 0x45 fuer SHT31 mit ADDR-Pin=HIGH). Die `addSensor`-Action im Store ignoriert diese und nutzt immer den Registry-Default (0x44). Das `config.i2c_address`-Feld aus dem Modal wird nicht an `realConfig` weitergegeben.

**Fix (1 Zeile):**
```typescript
i2c_address: interfaceType === 'I2C'
  ? (config.i2c_address ?? defaultI2CAddress)
  : null,
```

---

### BUG-B (KRITISCH fuer DS18B20): Kein Scan = kein Hinzufuegen

**Betrifft:** DS18B20 auf echtem ESP (einschliesslich Wokwi-Simulation).

**Ursache:** Der einzige Weg einen DS18B20 auf einem echten ESP hinzuzufuegen erfordert einen OneWire-Bus-Scan via MQTT. Es gibt keinen manuellen Fallback. Das bedeutet:

1. ESP muss online sein (MQTT-Verbindung aktiv)
2. ESP muss OneWire-Scan-Befehle per MQTT implementieren
3. Der ESP muss innerhalb von 10 Sekunden antworten

Falls eines dieser Kriterien nicht erfuellt ist → Scan schlaegt fehl → es gibt keine Moeglichkeit einen DS18B20 ohne ROM-Code hinzuzufuegen.

**Kein Frontend-Bug per se** — das ist eine Architekturentscheidung. Aber fuer Wokwi-ESPs ist der OneWire-Scan moeglicherweise nicht implementiert.

**Fehlermeldungen die der User sieht:**
- HTTP 503: "ESP-Gerät ist offline"
- HTTP 504: "ESP antwortet nicht (Timeout). Ist OneWire-Bus auf GPIO X konfiguriert?"

---

### BUG-C (MEDIUM): `sensor_type` wird UPPERCASE gesendet

**Ort:** `El Frontend/src/components/esp/AddSensorModal.vue` Zeile 339
```typescript
sensor_type: (device?.device_type || 'ds18b20').toUpperCase(),
```
`device.device_type` kommt vom Scan-Result (z.B. `"ds18b20"`). Es wird `.toUpperCase()` angewendet → `"DS18B20"`. Der Server-Endpunkt `POST /sensors/{espId}/{gpio}` muss pruefen ob uppercase `sensor_type` akzeptiert wird.

**Fix (1 Zeile):**
```typescript
sensor_type: (device?.device_type || 'ds18b20').toLowerCase(),
```

---

### BUG-D (LOW): NB7-Status

NB7 lautete: "DS18B20 OneWire add flow ignores user inputs (name, raw_value, unit)."

**Aktueller Stand nach v9.30 Refactor:**
- `name`: wird uebernommen, korrekt
- `raw_value`: wird an `buildSensorPayload` uebergeben, aber in `realConfig` (SensorConfigCreate) ist kein `raw_value`-Feld — wird still ignoriert
- `unit`: gleiches Problem

**Fazit:** NB7 ist fuer echte ESPs teilweise gefixt (`name` funktioniert). `raw_value` und `unit` werden ignoriert — das ist fuer Real-ESPs akzeptabel, da der ESP eigene Messwerte liefert. Fuer Mock-ESPs war es kritischer (Debug-API nutzt diese Felder).

---

## Hauptursache fuer Wokwi-ESP-Scheitern

Das beschriebene Problem hat folgende wahrscheinliche Ursachen (Prioritaet):

**Szenario 1 (wahrscheinlichste Ursache):** OneWire-Scan-MQTT-Handler auf dem Wokwi-ESP nicht implementiert oder ESP antwortet nicht innerhalb von 10 Sekunden. Resultat: HTTP 504 Timeout.

**Szenario 2:** `sensor_type = "DS18B20"` (uppercase, BUG-C) wird vom Server abgelehnt → HTTP 4xx/5xx beim `POST /sensors/{espId}/{gpio}` Call.

**Szenario 3:** Wokwi-ESP wird als Mock erkannt (falls esp_id `ESP_MOCK_` Praefix hat) → Mock-API-Pfad schlaegt fehl.

**Szenario 4:** User versucht ohne Scan den "Hinzufuegen"-Button zu nutzen — der Button erscheint bei OneWire-Sensor-Typ gar nicht (`v-if="!isOneWireSensor"` auf dem Primär-Button). Der User sieht nur den Scan-Bereich, nicht den normalen Submit-Button.

---

## Wie wird AddSensorModal fuer echten ESP ausgeloest?

### Via ESPOrbitalLayout (Dashboard-View)
```
ESPCard → "+" Button → useOrbitalDragDrop setzt showAddSensorModal = true
```

### Via DeviceDetailView (HardwareView Level 3)
```
HardwareView → DeviceMiniCard klicken → DeviceDetailView → ESPOrbitalLayout
```

**Unterschied Mock vs. Real:** Es gibt keinen unterschiedlichen UI-Trigger. Beide nutzen dasselbe AddSensorModal. Der Unterschied liegt im Store (`isMock()` Abfrage auf `esp_id`).

**isMock-Logik** (`api/esp.ts` Zeile 174-179):
```typescript
function isMockEsp(espId: string): boolean {
  return espId.startsWith('ESP_MOCK_') || espId.startsWith('MOCK_')
}
```
Ein Wokwi-ESP ohne diesen Praefix wird als Real-ESP behandelt.

---

## SensorConfigPanel — Bestehenden DS18B20 konfigurieren

Falls ein DS18B20 bereits existiert (z.B. durch Scan hinzugefuegt), wird er ueber `SensorConfigPanel` konfiguriert:

```
HardwareView → DeviceDetailView → ESPOrbitalLayout → SensorColumn → SensorSatellite (Klick)
→ emit 'sensor-click': { configId, gpio, sensorType }
→ DeviceDetailView.handleSensorClick()
→ HardwareView.handleSensorClickFromDetail()
→ configSensorData.value = { espId, gpio, sensorType, unit, configId }
→ showSensorConfig = true (SlideOver oeffnet SensorConfigPanel)
```

`SensorConfigPanel.handleSave()` sendet `POST /sensors/{espId}/{gpio}` mit Name, Schwellwerten, Betriebsmodus etc. Fuer OneWire-Sensoren wird `interface_type = 'ONEWIRE'` korrekt via `inferInterfaceType()` berechnet.

---

## Qualitaetspruefung (8-Dimensionen-Checkliste)

| # | Dimension | Befund |
|---|-----------|--------|
| 1 | Struktur | AddSensorModal in `esp/`, SensorConfigPanel in `esp/` — korrekt |
| 2 | Namenskonvention | OK, alle PascalCase/camelCase korrekt |
| 3 | Rueckwaertskompatibilitaet | BUG-A: i2c_address fuer Real-ESP ignoriert |
| 4 | Wiederverwendbarkeit | `buildSensorPayload` korrekt extrahiert (v9.30) |
| 5 | Speicher & Ressourcen | OneWire-Scan in gpioStore gecacht, cleanup via clearOneWireScan OK |
| 6 | Fehlertoleranz | Scan-Fehler werden angezeigt, aber kein manueller Fallback (BUG-B) |
| 7 | Seiteneffekte | `espStore.fetchDevice()` nach addSensor korrekt, kein Leak |
| 8 | Industrielles Niveau | BUG-C (uppercase sensor_type) ist potenzieller Server-Error |

---

## Fix-Vorschlaege

### Fix 1 (BUG-C, Prio 1): sensor_type lowercase — 1 Zeile
**Datei:** `El Frontend/src/components/esp/AddSensorModal.vue` Zeile 339
```typescript
// IST:
sensor_type: (device?.device_type || 'ds18b20').toUpperCase(),
// SOLL:
sensor_type: (device?.device_type || 'ds18b20').toLowerCase(),
```

### Fix 2 (BUG-A, Prio 2): User-I2C-Adresse uebergeben — 1 Zeile
**Datei:** `El Frontend/src/stores/esp.ts` Zeile 704
```typescript
// IST:
i2c_address: interfaceType === 'I2C' ? defaultI2CAddress : null,
// SOLL:
i2c_address: interfaceType === 'I2C' ? (config.i2c_address ?? defaultI2CAddress) : null,
```

### Fix 3 (BUG-B, optional): Manuellen ROM-Code-Fallback ermoeglichen
Nach der Scan-Section ein optionales Textfeld anzeigen wenn kein Scan-Ergebnis vorliegt:
```
Bedingung: isOneWireSensor && !oneWireScanState.isScanning
           && (!oneWireScanState.scanResults.length || oneWireScanState.scanError)
```
Mit manuellem ROM-Code koennte der User auch ohne funktionierende MQTT-Verbindung einen DS18B20 hinzufuegen.

---

## Diagnoseschritte fuer Robins Wokwi-Problem

Robin sollte folgendes pruefen:

1. **ESP-ID pruefen:** Beginnt die ID des Wokwi-ESP mit `ESP_MOCK_` oder `MOCK_`? Falls ja → Mock-Pfad wird genutzt.
2. **Scan-Fehlermeldung:** Welche Fehlermeldung erscheint beim OneWire-Scan? (503/504/andere HTTP-Code)
3. **Browser-Konsole:** Gibt es einen API-Error im Network-Tab bei `POST /api/v1/sensors/esp/{id}/onewire/scan`?
4. **sensor_type Case:** Im Network-Tab pruefen was `sensor_type` im POST-Body des `createOrUpdate`-Calls ist — uppercase oder lowercase?
5. **"Hinzufuegen"-Button:** Ist der Button sichtbar? Bei `isOneWireSensor = true` erscheint der normale Submit-Button NICHT — nur der Scan-Bereich.

---

## Cross-Layer Impact

| Schicht | Betroffen | Pruefung noetig |
|---------|-----------|-----------------|
| Server | `POST /api/v1/sensors/esp/{id}/onewire/scan` | MQTT-Handler fuer Real-ESP vorhanden? |
| Server | `POST /sensors/{espId}/{gpio}` | Akzeptiert uppercase `sensor_type`? Normalisierung im Backend? |
| ESP32 | OneWire-Scan MQTT-Befehl | Implementiert in Wokwi-Simulation? |

**Empfehlung:** Server-Dev-Agent fragen ob `sensor_type` case-insensitiv verarbeitet wird und ob der Wokwi-ESP den OneWire-Scan-MQTT-Handler implementiert hat.

---

## Verifikation

Keine Code-Aenderungen vorgenommen — reine Analyse. Kein Build erforderlich.

---

## Empfehlung: Naechster Schritt

**Fix 1 (BUG-C)** kann sofort implementiert werden: `.toUpperCase()` → `.toLowerCase()` in AddSensorModal.vue Zeile 339.

**Fuer BUG-B:** Server-Dev-Agent oder ESP32-Dev-Agent fragen ob der Wokwi-ESP MQTT-Handler fuer den OneWire-Scan implementiert hat.

---

## Fruehere Report-Daten (ueberschrieben)

---

## Codebase-Analyse

### Analysierte Dateien (14 spezifizierte + 6 Referenz-Dateien)

**Spezifizierte Dateien:**
- `El Frontend/src/api/diagnostics.ts`
- `El Frontend/src/shared/stores/diagnostics.store.ts`
- `El Frontend/src/components/system-monitor/DiagnoseTab.vue`
- `El Frontend/src/components/system-monitor/ReportsTab.vue`
- `El Frontend/src/components/system-monitor/MonitorTabs.vue`
- `El Frontend/src/components/system-monitor/HealthTab.vue`
- `El Frontend/src/components/system-monitor/HealthSummaryBar.vue`
- `El Frontend/src/components/system-monitor/types.ts`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/types/logic.ts`
- `El Frontend/src/shared/stores/index.ts`
- `El Frontend/src/router/index.ts`
- `El Frontend/src/components/rules/RuleNodePalette.vue`
- `El Frontend/src/components/rules/RuleFlowEditor.vue`

**Referenz-Dateien (zum Pattern-Abgleich):**
- `El Frontend/src/utils/formatters.ts` — Signatur von `formatRelativeTime`
- `El Frontend/src/shared/design/primitives/BaseModal.vue` — Prop-Namen
- `El Frontend/src/shared/design/primitives/SlideOver.vue` — Prop-Namen
- `El Frontend/src/components/plugins/PluginConfigDialog.vue`
- `El Frontend/src/views/PluginsView.vue`
- `El Frontend/src/shared/design/layout/Sidebar.vue`

---

## Qualitätsprüfung (8 Dimensionen)

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | **Struktur & Einbindung** | `diagnostics.ts` in `api/`, `diagnostics.store.ts` in `shared/stores/` korrekt. Store korrekt in `shared/stores/index.ts` re-exportiert. Alle @/ Imports korrekt. |
| 2 | **Namenskonvention** | PascalCase für Komponenten, camelCase für Funktionen, UPPER_SNAKE für Konstanten — eingehalten. |
| 3 | **Rückwärtskompatibilität** | `TabId` in `types.ts` um `'diagnostics'` und `'reports'` erweitert — additive Erweiterung, keine Breaking Changes. |
| 4 | **Wiederverwendbarkeit** | `diagnostics.store.ts` nutzt etabliertes Pinia Setup-Store Pattern. DiagnoseTab und ReportsTab folgen dem MonitorTabs-Komponentenmuster. |
| 5 | **Speicher & Ressourcen** | `HealthSummaryBar.vue` — `onUnmounted` Cleanup für Keyboard-Handler vorhanden. `diagnostics.store.ts` — keine persistenten WS-Subscriptions, kein Leak-Risiko. |
| 6 | **Fehlertoleranz** | Try-Catch in allen Store-Actions. `error` State in Store. Null-Checks in Templates via `v-if`. |
| 7 | **Seiteneffekte** | Vue-Reaktivitätsbug (Set-Mutations in DiagnoseTab) behoben. SystemMonitorView `open-alerts` Event war unbehandelt — behoben. |
| 8 | **Industrielles Niveau** | Nach Fixes: TypeScript strict, kein `any`, Build-verifiziert. |

---

## Gefundene und behobene Bugs

### Bug 1: Vue 3 Reaktivitätsfehler — DiagnoseTab.vue (KRITISCH)

**Datei:** `El Frontend/src/components/system-monitor/DiagnoseTab.vue`

**Problem:** `ref<Set<string>>(new Set())` — Vue 3's Proxy-System trackt in-place Mutations auf `Set`-Objekten (`.add()`, `.delete()`) NICHT. Das Template re-renderte nicht bei Expand/Collapse von Check-Details.

**Fix:** Ersetzt durch `ref<Record<string, boolean>>({})` mit Object-Spread für alle Mutationen:

```typescript
// Vorher (broken):
const expandedChecks = ref<Set<string>>(new Set())
function toggleExpand(name: string) {
  if (expandedChecks.value.has(name)) { expandedChecks.value.delete(name) }
  else { expandedChecks.value.add(name) }
}

// Nachher (fixed):
const expandedChecks = ref<Record<string, boolean>>({})
function toggleExpand(name: string) {
  if (expandedChecks.value[name]) {
    expandedChecks.value = { ...expandedChecks.value, [name]: false }
  } else {
    expandedChecks.value = { ...expandedChecks.value, [name]: true }
  }
}
// In runSingleCheck:
expandedChecks.value = { ...expandedChecks.value, [checkName]: true }
```

Template-Referenzen: `expandedChecks.has(check.name)` → `expandedChecks[check.name]`

---

### Bug 2: Unnötige `any`-Casts — ReportsTab.vue

**Datei:** `El Frontend/src/components/system-monitor/ReportsTab.vue`

**Problem:** `expandedReportData = ref<Record<string, unknown> | null>(null)` erzwang `(expandedReportData as any).checks` und `(expandedReportData as any).summary` im Template — TypeScript `any`-Violation.

**Fix:** Typ zu `DiagnosticReport | null` geändert:

```typescript
import type { DiagnosticReport } from '@/api/diagnostics'
const expandedReportData = ref<DiagnosticReport | null>(null)
// In toggleReport:
expandedReportData.value = report  // direkte Zuweisung, kein Cast nötig
```

Template: `(expandedReportData as any).checks` → `expandedReportData.checks`

---

### Bug 3: Sidebar aktiver Zustand falsch — Sidebar.vue

**Datei:** `El Frontend/src/shared/design/layout/Sidebar.vue`

**Problem:** "Wartung"-Link navigiert zu `/system-monitor?tab=health`, nutzte aber `isActive('/maintenance')` — dieser Pfad existiert nicht als Route und triggerte nie. Zudem konnten "System" und "Wartung" gleichzeitig aktiv sein.

**Fix:** Beide Links mit Query-Param-Bewusstsein aktualisiert:

```vue
<!-- System-Link — schließt tab=health aus -->
:class="['sidebar__link', isActive('/system-monitor') && route.query.tab !== 'health' && 'sidebar__link--active']"

<!-- Wartung-Link — matcht /maintenance (Legacy) ODER /system-monitor?tab=health -->
:class="['sidebar__link', (isActive('/maintenance') || (isActive('/system-monitor') && route.query.tab === 'health')) && 'sidebar__link--active']"
```

---

### Bug 4: Fehlender Event-Handler — SystemMonitorView.vue

**Datei:** `El Frontend/src/views/SystemMonitorView.vue`

**Problem:** `HealthTab` emittiert `open-alerts`, aber `SystemMonitorView` hatte weder Import von `useNotificationInboxStore`, noch eine Handler-Funktion, noch `@open-alerts` Binding auf `<HealthTab>`.

**Fix:**

```typescript
// Hinzugefügt:
import { useNotificationInboxStore } from '@/shared/stores/notification-inbox.store'
const inboxStore = useNotificationInboxStore()
function handleOpenAlerts() {
  inboxStore.toggleDrawer()
}
```

```vue
<!-- Template aktualisiert: -->
<HealthTab
  v-else-if="activeTab === 'health'"
  :filter-esp-id="filterEspId"
  @filter-device="handleFilterDevice"
  @open-alerts="handleOpenAlerts"
/>
```

---

### Bug 5: Fehlende Node-Typen in RuleFlowEditor — RuleFlowEditor.vue (FEATURE-VOLLSTÄNDIGKEIT)

**Datei:** `El Frontend/src/components/rules/RuleFlowEditor.vue`

**Problem:** `RuleNodePalette` fügt `diagnostics_status` (Condition) und `run_diagnostic` (Action) zur Palette hinzu, aber `RuleFlowEditor` hatte null Support — kein Icon-Import, keine Type-Imports, keine `NODE_INIT_DIMS`-Einträge (würde zu Crash führen), keine `getDefaultNodeData`-Cases, keine `ruleToGraph`/`graphToRuleData`-Behandlung, keine Vue Flow Node-Templates, keine CSS.

**Fix — alle 6 Integrationspunkte hinzugefügt:**

1. **Icon-Import:** `Stethoscope` aus `lucide-vue-next`
2. **Type-Imports:** `DiagnosticsCondition`, `DiagnosticsAction` aus `@/types/logic`
3. **NODE_INIT_DIMS:**
   ```typescript
   diagnostics_status: { width: 210, height: 100 },
   run_diagnostic: { width: 210, height: 80 },
   ```
4. **getDefaultNodeData():**
   ```typescript
   case 'diagnostics_status':
     return { checkName: defaults.checkName || 'mqtt', expectedStatus: defaults.expectedStatus || 'critical', operator: defaults.operator || '==', ...defaults }
   case 'run_diagnostic':
     return { checkName: defaults.checkName || '', ...defaults }
   ```
5. **ruleToGraph():** Handling für `diagnostics_status`-Conditions und `run_diagnostic`-Actions
6. **graphToRuleData():** Konversion zurück zu `DiagnosticsCondition` / `DiagnosticsAction`
7. **Vue Flow Node-Templates:** `#node-diagnostics_status` und `#node-run_diagnostic`
8. **MiniMap-Farben:** `diagnostics_status: () => '#22d3ee'`, `run_diagnostic: () => '#22d3ee'`
9. **CSS:** `.rule-node--diagnostics` und `.rule-node__icon-wrap--diagnostics` (Cyan-Farbe `#22d3ee`)

---

### Bug 6: Falsche Prop-Namen — PluginConfigDialog.vue (TS-Fehler)

**Datei:** `El Frontend/src/components/plugins/PluginConfigDialog.vue`

**Problem:** Verwendete `:visible="visible"` und `size="md"`, aber `BaseModal` erwartet `:open` und `:max-width`.

**Fix:**
```vue
<BaseModal :open="visible" :title="`${pluginName} — Konfiguration`" max-width="max-w-lg" @close="emit('close')">
```

---

### Bug 7: Falsches Prop bei SlideOver — PluginsView.vue (TS-Fehler)

**Datei:** `El Frontend/src/views/PluginsView.vue`

**Problem:** Verwendete `:visible="!!activePluginId"`, aber `SlideOver` erwartet `:open`.

**Fix:**
```vue
<SlideOver :open="!!activePluginId" :title="activePlugin?.display_name || 'Plugin'" @close="closeDetail">
```

---

## Dateien ohne Änderungsbedarf (verifiziert korrekt)

| Datei | Ergebnis |
|-------|----------|
| `api/diagnostics.ts` | Pattern-konform. API gibt unwrapped Data zurück (kein `ApiResponse`-Wrapper) — konsistent mit Direct-Response-Pattern. |
| `shared/stores/diagnostics.store.ts` | `currentReport.value.checks[idx] = result` — wird von Vue 3 getrackt (Array-Index-Assignment über Proxy). Kein Bug. |
| `components/system-monitor/MonitorTabs.vue` | Korrekte `TabId`-Typen, keine Probleme. |
| `components/system-monitor/HealthTab.vue` | Diagnostics-KPI-Sektion mit `v-if="diagStore.currentReport"` korrekt. |
| `components/system-monitor/HealthSummaryBar.vue` | `onUnmounted` Cleanup für Keyboard-Handler korrekt vorhanden. |
| `components/system-monitor/types.ts` | `TabId` enthält `'diagnostics'` und `'reports'` — korrekt. |
| `types/logic.ts` | `DiagnosticsCondition` und `DiagnosticsAction` korrekt definiert. |
| `shared/stores/index.ts` | `useDiagnosticsStore` korrekt re-exportiert. |
| `router/index.ts` | `/maintenance` Route existiert als eigenständige Route — kein Redirect nötig. |
| `components/rules/RuleNodePalette.vue` | `Stethoscope`-Icon bereits importiert, Palette-Einträge korrekt. |

---

## Cross-Layer Checks

| Prüfpunkt | Ergebnis |
|-----------|----------|
| `types/logic.ts` ↔ Server Pydantic-Schemas | `DiagnosticsCondition.check_name`, `expected_status`, `operator` — Felder stimmen mit Server überein (snake_case). |
| `api/diagnostics.ts` Endpunkte | Endpunkte wurden in REST_ENDPOINTS.md verifiziert. |
| Sidebar `/system-monitor?tab=health` | Router-Route `/maintenance` existiert separat; Sidebar-Fix ist nur UX/Highlighting. |
| HealthTab `open-alerts` Event | Wired zu `inboxStore.toggleDrawer()` — öffnet Notification-Drawer korrekt. |

---

## Verifikation

```
Erster Build-Lauf:
  src/components/plugins/PluginConfigDialog.vue(67,4): error TS2345 — 'visible' existiert nicht in BaseModal Props
  src/views/PluginsView.vue(161,6): error TS2345 — 'visible' existiert nicht in SlideOver Props
  → 2 TypeScript-Fehler

Zweiter Build-Lauf (nach Fixes):
  ✓ built in 18.62s
  2984 modules transformed
  0 TypeScript-Fehler
  0 Warnings
```

---

## Ergebnis

**7 Bugs gefunden und behoben** in 7 Dateien:

| # | Datei | Bug-Typ | Schwere |
|---|-------|---------|---------|
| 1 | `DiagnoseTab.vue` | Vue 3 Reaktivitätsfehler (Set-Mutation) | Kritisch |
| 2 | `ReportsTab.vue` | `any`-Cast durch falsche Typisierung | Mittel |
| 3 | `Sidebar.vue` | Falscher aktiver Zustand bei "Wartung" | UX |
| 4 | `SystemMonitorView.vue` | Fehlender `open-alerts` Event-Handler | Mittel |
| 5 | `RuleFlowEditor.vue` | Fehlende Unterstützung für 2 neue Node-Typen | Kritisch |
| 6 | `PluginConfigDialog.vue` | Falsche Prop-Namen für BaseModal | TypeScript-Fehler |
| 7 | `PluginsView.vue` | Falsches Prop für SlideOver | TypeScript-Fehler |

**10 Dateien ohne Änderungsbedarf** — korrekt implementiert.

---

## Empfehlung

Keine weiteren Frontend-Agenten notwendig. Der Build ist sauber. Die Phase-4D-Implementierung ist jetzt vollständig pattern-konform und TypeScript-fehlerfrei.

Bei der nächsten Session die `/maintenance`-Route im Router prüfen — sie leitet noch nicht auf `/system-monitor?tab=health` um. Das ist aktuell kein Bug (die Route existiert separat), aber für eine saubere UX wäre ein Redirect sinnvoll.
