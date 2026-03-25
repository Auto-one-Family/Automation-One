# Auftrag 6.7 — Cross-Zone + Mobile Sensor Grundlagen (Frontend)

> **Erstellt:** 2026-03-25
> **Geprüft:** 2026-03-25 (12 Pfade, 3 API-Endpoints, 1 WS-Event, 6 Dateien verifiziert)
> **Typ:** Frontend-Implementierung — rein Vue 3 / TypeScript, kein Backend-Code
> **Aufwand:** ~3-4h gesamt (reduziert — Types + WS-Handler existieren bereits)
> **Prioritaet:** MITTEL — Voraussetzung: 6.1 + 6.2 implementiert (beides DONE)
> **Branch:** Feature-Branch von main, z.B. `feature/6.7-cross-zone-mobile`

---

## Kontext — Warum dieser Schritt

Das Backend kennt bereits zwei Klassen von Geraeten die nicht einfach "einer Zone gehoeren":

**Mobile Sensoren** werden physisch zwischen Zonen bewegt. Ein tragbarer pH-Tester misst heute in Zone A, morgen in Zone B. Der Nutzer hat im Backend den "Active Context" gesetzt — `device_active_context.active_zone_id`. Bisher ignoriert das Frontend diesen Kontext vollstaendig. Das fuehrt dazu dass ein mobiler Sensor in seiner "Heimzone" gezaehlt wird, obwohl er physisch gerade in einer anderen Zone arbeitet.

**Shared Devices** stehen physisch an einem Ort (z.B. Technikzone) und bedienen logisch mehrere Zonen. Die Duengerpumpe im Technikraum versorgt Zone A, B und C. Die pH/EC-Sensoren im Mischbehaelter liefern Werte fuer alle bepflanzten Zonen. Im Backend ist `sensor_configs.device_scope = 'multi_zone'` und `sensor_configs.assigned_zones = ["zone_a", "zone_b"]` gesetzt. Das Frontend zeigt diese Sensoren aber nur in der physischen Heimzone — Zonen A, B und C sehen den Shared Sensor nicht.

Dieser Auftrag bringt das Frontend auf den Wissensstand des Backends. Es werden **keine neuen Backend-Endpoints benoetigt** — alles was noetig ist, existiert bereits in der API.

---

## Was NICHT gemacht wird

- Kein Backend-Code. Kein Python. Keine Migrationen.
- Kein neues Routing-Konzept. `device_scope = 'zone_local'` bleibt unveraendert (Default fuer 95% aller Geraete).
- Keine Stations-Queue, keine Sequenzierungs-Logik fuer Ventilmatrix/Fertigation.
- Keine NFC/GPS-Integration fuer automatischen Kontext-Wechsel.
- Keine Konfiguration der `device_scope`/`assigned_zones` Felder (das gehoert ins HardwareView Config-Panel, ist ein separater Auftrag).
- Keine Aenderungen an `device_zone_changes` Audit-Trail (Backend-seitig vollstaendig).
- Kein Umbau des WS-Handlings. Der `device_context_changed` Event wird bereits empfangen und verarbeitet (siehe IST-Zustand).

---

## Hintergrundinformation: Backend-Datenmodell (existiert bereits)

Der Agent muss diese Strukturen NICHT neu bauen — sie sind vorhanden und muss sie nur lesen:

### sensor_configs / actuator_configs

Relevante Felder (Pfad: `src/db/models/sensor.py`, `src/db/models/actuator.py`):

```
device_scope: VARCHAR(20), NOT NULL, DEFAULT 'zone_local'
              Werte: 'zone_local' | 'multi_zone' | 'mobile'

assigned_zones: JSON, NULL, DEFAULT []
                Array von zone_ids. Bei zone_local: leer.
                Bei multi_zone: Zonen die das Geraet bedient.
                Bei mobile: Zonen in denen das Geraet eingesetzt werden darf.

assigned_subzones: JSON, NULL, DEFAULT []
                   Analog fuer Subzonen.
```

### device_active_context

Tabelle: `src/db/models/device_context.py`

```
config_type: VARCHAR(20)       -- 'sensor' oder 'actuator'
config_id:   UUID              -- FK auf sensor_configs.id / actuator_configs.id
active_zone_id:    VARCHAR(50) -- Welche Zone GERADE aktiv ist (NULL = keine)
active_subzone_id: VARCHAR(50) -- Optional: Welche Subzone aktiv
context_source: VARCHAR(20)    -- 'manual' | 'sequence' | 'mqtt'
context_since:  DateTime(tz)   -- Seit wann dieser Kontext gilt
```

UNIQUE auf (config_type, config_id) — pro Sensor/Aktor genau ein Kontext-Eintrag.

### API-Endpoints (existieren, kein neuer Code noetig)

```
GET  /api/v1/device-context/{config_type}/{config_id}
     Auth: OperatorUser
     Response: { active_zone_id, active_subzone_id, context_source, context_since }

PUT  /api/v1/device-context/{config_type}/{config_id}
     Auth: OperatorUser
     Body: { active_zone_id: string | null, active_subzone_id: string | null }
     Sendet WS-Event: device_context_changed

DELETE /api/v1/device-context/{config_type}/{config_id}
       Auth: OperatorUser
       Setzt active_zone_id = NULL. Sendet WS-Event: device_context_changed
```

### WS-Event (existiert bereits, wird schon empfangen)

```
Event-Name: device_context_changed
Payload: {
  config_type: 'sensor' | 'actuator',
  config_id: string,
  active_zone_id: string | null,
  active_subzone_id: string | null
}
```

### Wichtige Geschaeftsregeln (aus professionellen Fertigation-Systemen abgeleitet)

1. **Zone-Kontext zum Messzeitpunkt:** Sensor-Daten in `sensor_data` bekommen die `zone_id` aus `device_active_context.active_zone_id` zum Moment der Messung. Das Backend macht das bereits. Historische Daten aendern sich NICHT wenn der Kontext wechselt.
2. **zone_local bleibt Default:** 95%+ aller Geraete sind `zone_local`. Das bisherige Verhalten aendert sich fuer diese Geraete nicht.
3. **Heimzone vs. Active Zone:** Die "Heimzone" eines Sensors ist die Zone des ESPs (`esp_devices.zone_id`). Die "Aktive Zone" ist `device_active_context.active_zone_id`. Bei `zone_local` sind beide gleich. Bei `mobile` koennen sie abweichen.

---

## IST-Zustand (Frontend) — verifiziert 2026-03-25

**Wo schauen:** `src/stores/esp.ts`, `src/views/MonitorView.vue`, `src/components/devices/SensorCard.vue`, `src/components/devices/ActuatorCard.vue`, `src/composables/useZoneGrouping.ts`

1. **Types existieren BEREITS.** `DeviceScope` Type (`'zone_local' | 'multi_zone' | 'mobile'`) ist in `src/types/index.ts:990` definiert. `DeviceContextSet` und `DeviceContextResponse` Interfaces existieren in `src/types/index.ts:992-1006`. `SensorConfigCreate`, `SensorConfigResponse`, `ActuatorConfigCreate`, `ActuatorConfigResponse` haben `device_scope` und `assigned_zones` bereits. **Einzige Luecke:** `assigned_subzones` fehlt im Frontend (existiert im Backend).

2. **SensorCard kennt device_scope bereits.** `SensorCard.vue` hat ein `scopeBadge` Computed und ein `mode: 'monitor' | 'config'` Prop. Aber: kein Badge fuer "Aktiv in Zone X", kein Hinweis auf `context_since`, kein Kontext-Wechsel-Dropdown.

3. **SensorWithContext** in `src/composables/useZoneGrouping.ts` enthaelt bereits `device_scope` und `assigned_zones`, aber NICHT `active_zone_id` oder `context_since`. Dieses Interface muss erweitert werden fuer Block B.

4. **DeviceScopeSection.vue** existiert bereits in `src/components/devices/` — pruefen ob wiederverwendbar oder Ueberlappung mit dem geplanten Kontext-Badge/Dropdown.

5. `computeZoneKPIs` und `filteredZoneKPIs` existieren in MonitorView.vue. KPI-Zaehlung basiert ausschliesslich auf ESP-Zonen-Zuordnung. Kein mobile-Bewusstsein.

6. `filteredZoneKPIs` filtert leere Zonen (`totalDevices > 0`). Dieses Filter-Verhalten bleibt unveraendert.

7. **WS-Handler existiert BEREITS und ist aktiv.** `device_context_changed` wird in `src/stores/esp.ts:1237` empfangen und an `zone.store.ts:handleDeviceContextChanged()` delegiert. Dort wird `espStore.fetchAll()` aufgerufen und ein Toast gezeigt. Es gibt also bereits einen vollstaendigen Refresh-Mechanismus — kein "nichts passiert".

8. **Zone-Daten:** Zonen kommen aus `allZones` (ein lokaler `ref<ZoneListEntry[]>` in MonitorView.vue) oder aus `useZoneStore()` in `src/shared/stores/zone.store.ts`. Es gibt KEIN `espStore.zones` Getter.

---

## Block A: Type-Delta + Context-Store (~45 min)

### A.0 — Vorbedingung: Backend-API pruefen

**ZUERST** pruefen ob die Backend-Endpoints `/api/v1/zone/{zone_id}/monitor-data` und `/api/v1/sensors/{esp_id}` die Felder `active_zone_id` und `context_since` bereits in der Sensor-Response mitliefern. Das entscheidet ob A.2 noetig ist:

- **Falls JA** (aktiver Kontext kommt mit der Sensor-Response): Kein separater Store noetig. `SensorWithContext` in `useZoneGrouping.ts` um `active_zone_id?: string` und `context_since?: string` erweitern. Der bestehende `fetchAll()`-Mechanismus (ausgeloest durch WS-Event `device_context_changed` in `esp.ts:1237` → `zone.store.ts:handleDeviceContextChanged()`) liefert automatisch aktualisierte Daten. → **Weiter mit A.1, dann direkt Block B.**
- **Falls NEIN** (aktiver Kontext muss separat via `GET /api/v1/device-context/{config_type}/{config_id}` geholt werden): A.2 wird benoetigt. → **Weiter mit A.1, dann A.2.**

### A.1 — Type-Delta

**Datei:** `src/types/index.ts`

Die meisten Types existieren BEREITS (verifiziert):
- `DeviceScope` = `'zone_local' | 'multi_zone' | 'mobile'` (Zeile ~990)
- `DeviceContextSet` + `DeviceContextResponse` (Zeile ~992-1006)
- `device_scope` + `assigned_zones` auf `SensorConfigCreate/Response` + `ActuatorConfigCreate/Response`

**Einziger Delta:** `assigned_subzones` fehlt im Frontend. Hinzufuegen an:
- `SensorConfigCreate` und `SensorConfigResponse`
- `ActuatorConfigCreate` und `ActuatorConfigResponse`

```typescript
assigned_subzones?: string[]  // Optional — Backend hat es, Frontend nutzt es noch nicht aktiv
```

**Zusaetzlich** in `src/composables/useZoneGrouping.ts` das `SensorWithContext` Interface erweitern:

```typescript
interface SensorWithContext {
  // ... bestehende Felder (inkl. device_scope, assigned_zones) ...
  active_zone_id?: string | null   // NEU: Aus device_active_context oder Sensor-Response
  context_since?: string | null     // NEU: ISO DateTime, wann Kontext gesetzt wurde
}
```

### A.2 — Context-Store (NUR wenn A.0 ergibt: Kontext kommt NICHT mit Sensor-Response)

**Neue Datei:** `src/shared/stores/deviceContext.store.ts` (NICHT `src/stores/` — Shared-Stores liegen in `src/shared/stores/`, Konsistenz mit `zone.store.ts`)

Dieser Store haelt den aktiven Kontext fuer alle mobile/multi_zone Geraete. Er ist bewusst KLEIN gehalten — kein eigener Store fuer zone_local-Geraete. Nutzt das existierende `DeviceContextResponse` Interface aus `src/types/index.ts`.

```typescript
// Schnittstelle
export const useDeviceContextStore = defineStore('deviceContext', () => {
  // Map: config_id -> DeviceContextResponse
  const contexts = ref<Map<string, DeviceContextResponse>>(new Map())

  // Laedt alle Kontexte fuer mobile/multi_zone Geraete (Bulk-Load beim MonitorView Mount)
  async function loadAllContexts(): Promise<void>

  // Setzt neuen Kontext (PUT /api/v1/device-context/...)
  async function setContext(
    configType: 'sensor' | 'actuator',
    configId: string,
    activeZoneId: string | null,
    activeSubzoneId: string | null
  ): Promise<void>

  // Loescht Kontext (DELETE /api/v1/device-context/...)
  async function clearContext(configType: 'sensor' | 'actuator', configId: string): Promise<void>

  // Reaktion auf WS-Event device_context_changed — nur lokaler Store-Update, kein API-Call
  function handleContextChanged(payload: {
    config_type: 'sensor' | 'actuator',
    config_id: string,
    active_zone_id: string | null,
    active_subzone_id: string | null
  }): void

  // Helper: Gibt aktive Zone-ID zurueck (oder null)
  function getActiveZoneId(configId: string): string | null

  return { contexts, loadAllContexts, setContext, clearContext, handleContextChanged, getActiveZoneId }
})
```

**Wichtig:** `setContext` sendet PUT an Backend. `handleContextChanged` aktualisiert nur den lokalen Store ohne API-Call (kommt vom WS). Beide Pfade muessen existieren.

### A.3 — WS-Handler erweitern (NUR wenn A.2 angelegt wurde)

**Datei:** `src/stores/esp.ts` (Zeile ~1237, wo `device_context_changed` behandelt wird)

**IST:** `device_context_changed` wird empfangen und an `zone.store.ts:handleDeviceContextChanged()` delegiert. Dort wird `espStore.fetchAll()` aufgerufen + Toast gezeigt. Das ist ein vollstaendiger Refresh.

**SOLL:** Zusaetzlich zum bestehenden `fetchAll()` auch `deviceContextStore.handleContextChanged(payload)` aufrufen, damit der granulare Store sofort aktuell ist (ohne auf den fetchAll()-Response zu warten).

```typescript
// In esp.ts, beim bestehenden device_context_changed Handler:
// BESTEHEND: zone.store handleDeviceContextChanged() → fetchAll() + Toast (NICHT entfernen!)
// NEU HINZUFUEGEN:
deviceContextStore.handleContextChanged(payload)
```

**NICHT** den bestehenden Handler ersetzen — nur ergaenzen. Der fetchAll() bleibt als Fallback fuer Konsistenz.

---

## Block B: Monitor L1 — Mobile Sensoren korrekt zaehlen (~1.5h)

### B.1 — KPI-Berechnung anpassen

**Datei:** `src/views/MonitorView.vue`

**Funktion suchen:** `computeZoneKPIs` (oder equivalent — die Funktion die pro Zone `totalDevices`, `onlineSensors` etc. berechnet).

**IST:** Sensoren/Aktoren werden NUR ihrer ESP-Zone zugeordnet. Ein Sensor mit `device_scope = 'mobile'` und `active_zone_id = 'zone_b'` wird in `zone_a` (Heimzone des ESPs) gezaehlt, nicht in `zone_b`.

**SOLL:** Bei mobilen Sensoren gilt die aktive Zone fuer die Zaehlung:

```typescript
// Pseudocode fuer die erweiterte KPI-Berechnung
// active_zone_id kommt entweder aus SensorWithContext (wenn A.0 = JA)
// oder aus deviceContextStore.getActiveZoneId() (wenn A.0 = NEIN)
function getEffectiveZoneId(sensor: SensorWithContext, espZoneId: string): string {
  if (sensor.device_scope === 'mobile') {
    const activeZoneId = sensor.active_zone_id  // oder deviceContextStore.getActiveZoneId(sensor.id)
    return activeZoneId ?? espZoneId  // Fallback auf Heimzone wenn kein Kontext
  }
  return espZoneId  // zone_local und multi_zone: Heimzone bleibt Heimzone
}
```

Bei `multi_zone` Sensoren: Diese erscheinen in der KPI-Zaehlung in ihrer Heimzone (ESP-Zone). In Block C werden sie zusaetzlich als Referenz in den bedienten Zonen angezeigt. Doppelzaehlung wird VERHINDERT — kein Sensor erscheint zweimal in `totalDevices`.

**Beruecksichtigen:** `filteredZoneKPIs` filtert Zonen mit `totalDevices === 0` heraus. Diese Logik bleibt unveraendert. Eine Zone die nur durch mobile Sensoren "belebt" wird, soll sichtbar sein.

### B.2 — L1 Tile: Mobiler Sensor Hinweis

**Datei:** `src/views/MonitorView.vue` (Template-Teil, Zone-Tile)

Wenn eine Zone mindestens einen mobilen Sensor enthalt der von einer anderen Zone zu ihr gewechselt ist, zeigt die KPI-Tile einen subtilen Hinweis: "inkl. X mobiler Sensor(en)". Das ist kein Alert, nur ein informativer Text.

```html
<!-- Nur anzeigen wenn mobileGuestCount > 0 -->
<span v-if="zone.mobileGuestCount > 0" class="zone-tile__mobile-hint">
  + {{ zone.mobileGuestCount }} mobil
</span>
```

Styling: `--text-xs`, `--color-text-secondary`, kein eigenes Token benoetigt.

`mobileGuestCount` = Anzahl Sensoren deren `device_scope === 'mobile'` UND `active_zone_id === zone.id` UND `active_zone_id !== esp.zone_id` (also wirklich "zu Gast").

---

## Block C: Monitor L2 — Shared Device Referenz-Karten (~1.5h)

### C.1 — Darstellungs-Logik in MonitorView L2

**Datei:** `src/views/MonitorView.vue` (der L2-Teil — ab Zeile ~700 wenn die Zone-Detail-Ansicht beginnt)

**Ziel:** Wenn Zone X einen `multi_zone`-Sensor bedient (also `sensor.assigned_zones` enthaelt `zone_x_id`), erscheint in Zone X eine kompakte Referenz-Card fuer diesen Sensor.

**Wichtige Regeln:**

1. Die Referenz-Card erscheint NICHT in der physischen Heimzone des Sensors (das waere Duplikation). Sie erscheint NUR in den `assigned_zones` ausser der Heimzone.
2. Referenz-Cards stehen NICHT in einer Subzone-Accordion. Sie stehen in einer separaten Sektion "Shared Equipment" am Ende der Zone-Ansicht — nach allen Subzone-Accordions, VOR den Inline-Dashboard-Panels.
3. Die Sektion "Shared Equipment" erscheint nur wenn die Zone mindestens eine Referenz-Card hat (`v-if="sharedRefs.length > 0"`).

**Computed Property:**

```typescript
// In MonitorView L2, berechnet fuer die aktuell angezeigte Zone
const sharedSensorRefs = computed(() => {
  if (!currentZone.value) return []

  const zoneId = currentZone.value.zone_id
  const result: SensorConfig[] = []

  // Alle ESPs durchsuchen — nicht nur die in dieser Zone
  for (const esp of espStore.devices) {
    for (const sensor of esp.sensors) {
      if (
        sensor.device_scope === 'multi_zone' &&
        sensor.assigned_zones?.includes(zoneId) &&
        esp.zone_id !== zoneId  // Nicht in der Heimzone doppeln
      ) {
        result.push({ ...sensor, _homeZoneName: esp.zone_name ?? esp.zone_id })
      }
    }
  }
  return result
})
```

### C.2 — SharedSensorRefCard Komponente

**Neue Datei:** `src/components/devices/SharedSensorRefCard.vue`

Diese Karte ist KOMPAKT — nicht die volle SensorCard. Zeigt:

```
┌────────────────────────────────────┐
│ [Icon] pH-Sensor     [Shared-Badge] │
│ 6.24 pH               via Technikzone│
│                 → Zur Heimzone      │
└────────────────────────────────────┘
```

Props:
```typescript
defineProps<{
  sensor: SensorConfig & { _homeZoneName?: string }
  currentValue?: number | null
  unit?: string
  homeZoneId: string
}>()
```

Verhalten:
- Zeigt `sensor.sensor_name || sensor.sensor_type` als Titel
- Zeigt `currentValue` und `unit` wenn verfuegbar (aus `espStore` oder WS-State)
- Zeigt "via [_homeZoneName]" als sekundaere Info
- Badge mit Text "Shared" (Styling: analog zu bestehenden Status-Badges in tokens.css — `--color-status-info` Hintergrund, `--text-xs`)
- Klick auf "→ Zur Heimzone" navigiert zu `homeZoneId` in Monitor L2: `router.push({ name: 'monitor-zone', params: { zoneId: homeZoneId } })` (Route-Name ist `monitor-zone`, Pfad: `monitor/:zoneId` — verifiziert)
- Read-Only: kein Config-Button, kein Loeschen

**Zu KEINER Zeit** soll diese Karte einen Toggle oder eine Aktion anbieten (Monitor = Read-Only, 6.3 ist bereits implementiert).

### C.3 — Sektion in MonitorView L2 Template

```html
<!-- Nach den Subzone-Accordions, vor den Inline-Dashboard-Panels -->
<section v-if="sharedSensorRefs.length > 0" class="zone-detail__shared-equipment">
  <h3 class="zone-detail__section-title">
    Shared Sensors
    <span class="zone-detail__section-count">{{ sharedSensorRefs.length }}</span>
  </h3>
  <div class="zone-detail__shared-grid">
    <SharedSensorRefCard
      v-for="sensor in sharedSensorRefs"
      :key="sensor.id"
      :sensor="sensor"
      :homeZoneId="getEspZoneId(sensor)"
    />
  </div>
</section>
```

Styling: Nutze bestehende CSS-Klassen aus MonitorView. Kein neues CSS-Token noetig. Das Grid kann `display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--space-3)` verwenden — analog zu bestehenden Card-Grids in der Datei.

---

## Block D: SensorCard — Kontext-Badge (~30 min)

**Datei:** `src/components/devices/SensorCard.vue`

SensorCard wird in L2 (innerhalb der Subzone-Accordions) fuer zone_local Sensoren angezeigt. Wenn ein Sensor `device_scope === 'mobile'` ist, zeigt die SensorCard im Monitor-Modus einen Hinweis.

**SOLL:** Im Monitor-Modus (`mode === 'monitor'`), wenn `sensor.device_scope === 'mobile'` und `activeContext` vorhanden:

```html
<!-- Unterhalb der Meta-Zeile, nur im Monitor-Modus -->
<div
  v-if="mode === 'monitor' && sensor.device_scope === 'mobile' && activeContext"
  class="sensor-card__context-hint"
>
  Aktiv in Zone {{ activeZoneName }} seit {{ formatRelativeTime(activeContext.context_since) }}
</div>
```

- `activeContext`: Entweder aus `sensor.active_zone_id` (wenn A.0 = JA) oder aus `deviceContextStore.contexts.get(sensor.id)` (wenn A.0 = NEIN)
- `activeZoneName`: Zone-Name-Lookup ueber `useZoneStore()` aus `src/shared/stores/zone.store.ts` oder ueber den lokalen `allZones` ref in MonitorView. **NICHT** `espStore.zones` — das existiert nicht.
- `formatRelativeTime` existiert bereits in `@/utils/formatters` und wird breit genutzt (verifiziert)
- Wenn `device_scope === 'zone_local'` (Default): Kein Hinweis, keine Aenderung am bestehenden Verhalten

Styling: `--text-xs`, `--color-text-secondary`. Ein neues CSS-Token wird NICHT angelegt.

---

## Block E: Kontext-Wechsel Button in L2 SensorCard (~30 min)

**Nur fuer mobile Sensoren, nur im Monitor-Modus.**

Wenn ein Sensor `device_scope === 'mobile'` ist, zeigt die SensorCard im Monitor-Modus einen "Zone wechseln" Button. Dieser oeffnet ein kleines Dropdown oder eine Zone-Auswahl.

**UX-Pattern (Tap-to-Assign, aus Recherche zu Fulcrum/ArcGIS Field Maps abgeleitet):** Der Nutzer traegt den Sensor von Zone zu Zone und sagt dem System mit einem Klick: "Jetzt messe ich hier." Dies ist der einfachste Einstieg ohne GPS oder NFC — maximale Kontrolle, minimale Implementierung.

```html
<div
  v-if="mode === 'monitor' && sensor.device_scope === 'mobile'"
  class="sensor-card__context-controls"
>
  <select
    :value="activeContext?.active_zone_id ?? ''"
    @change="handleZoneContextChange($event)"
    class="sensor-card__zone-select"
  >
    <option value="">Keine Zone (unzugewiesen)</option>
    <option
      v-for="zone in availableZones"
      :key="zone.zone_id"
      :value="zone.zone_id"
    >
      {{ zone.name }}
    </option>
  </select>
</div>
```

`availableZones`: Wenn `sensor.assigned_zones.length > 0`, nur diese Zonen anzeigen. Sonst alle Zonen aus `useZoneStore()` (aus `src/shared/stores/zone.store.ts`) oder dem lokalen `allZones` ref. **NICHT** `espStore.zones` — das existiert nicht.

`handleZoneContextChange`: Ruft `deviceContextStore.setContext('sensor', sensor.id, newZoneId, null)` auf (wenn A.2 angelegt) oder sendet direkt PUT an `/api/v1/device-context/sensor/{sensor.id}` (wenn kein separater Store). Bei `newZoneId === ''` → `clearContext` bzw. DELETE.

**Fehlerfall:** Bei API-Fehler: `useToast()` aus `@/composables/useToast.ts` (existiert, verifiziert) nutzen — "Zone konnte nicht gewechselt werden".

---

## Verifikation

Nach der Implementierung folgende manuelle Tests durchfuehren (System muss laufen, MockESP genuegt):

### Test V1: zone_local bleibt unveraendert
- [ ] Normaler Sensor (device_scope = 'zone_local') zeigt kein 'mobile'-Hint, kein 'Shared'-Badge
- [ ] Monitor L1 Zaehlung unveraendert fuer zone_local Sensoren
- [ ] `npm run build` ohne Fehler, `vue-tsc --noEmit` ohne Fehler

### Test V2: Shared Sensor Referenz-Card
- [ ] Sensor in MockESP manuell auf `device_scope = 'multi_zone'` und `assigned_zones = ['<andere_zone_id>']` setzen (direkt in DB oder via Debug-API)
- [ ] Monitor L2 der anderen Zone anzeigen → "Shared Sensors" Sektion erscheint mit Referenz-Card
- [ ] Referenz-Card zeigt Sensorname + "via [Heimzone]"
- [ ] "→ Zur Heimzone" navigiert korrekt

### Test V3: Mobiler Sensor Kontext-Wechsel
- [ ] Sensor auf `device_scope = 'mobile'` setzen
- [ ] Auf Monitor L2 im Zone-Dropdown "Zone B" waehlen → PUT an Backend, Toast "Kontext gesetzt"
- [ ] Monitor L1: Zone B zaehlt den Sensor jetzt (mobileGuestCount + 1)
- [ ] SensorCard in Zone B (Heimzone) zeigt "Aktiv in Zone B seit..."
- [ ] WS-Event `device_context_changed` kommt → Store-Update ohne manuellen Reload

### Test V4: TypeScript-Sauberkeit + Konventionen
- [ ] Alle neuen Interfaces haben keine `any`-Typen
- [ ] Falls deviceContext-Store angelegt: liegt in `src/shared/stores/` (NICHT `src/stores/` — Konvention)
- [ ] Falls deviceContext-Store angelegt: hat keinen Zugriff auf `espStore` innerhalb des Stores (einseitige Abhaengigkeit ist OK: MonitorView kennt beide Stores)
- [ ] Zone-Lookups nutzen `useZoneStore()` oder lokalen `allZones` ref — NICHT `espStore.zones` (existiert nicht)

---

## Datei-Uebersicht

| Datei | Aktion | Status |
|-------|--------|--------|
| `src/types/index.ts` | `assigned_subzones?: string[]` an 4 Interfaces hinzufuegen | Delta — Types existieren groesstenteils |
| `src/composables/useZoneGrouping.ts` | `SensorWithContext` um `active_zone_id?` + `context_since?` erweitern | Delta |
| `src/shared/stores/deviceContext.store.ts` | NEU — Context-Store (NUR wenn A.0 = NEIN) | Bedingt |
| `src/stores/esp.ts` (Zeile ~1237) | `deviceContextStore.handleContextChanged()` ergaenzen (NUR wenn A.2) | Bedingt |
| `src/views/MonitorView.vue` | `computeZoneKPIs` mobile-aware, `sharedSensorRefs` Computed, Shared-Equipment-Sektion, `mobileGuestCount` | Kernarbeit |
| `src/components/devices/SharedSensorRefCard.vue` | NEU — Kompakte Referenz-Karte fuer Shared Sensors | Neu |
| `src/components/devices/SensorCard.vue` | Kontext-Hint + Zone-Wechsel-Dropdown fuer mobile Sensoren | Erweitern |

**Pruefen vor Start:** `DeviceScopeSection.vue` in `src/components/devices/` — moeglicherweise wiederverwendbar fuer Kontext-Badge/Dropdown (Ueberlappung vermeiden).

---

## Akzeptanzkriterien (Gesamt)

- [ ] `device_scope = 'zone_local'` Sensoren: KEIN veraendertes Verhalten, KEIN neuer Badge
- [ ] `device_scope = 'mobile'` Sensoren: SensorCard zeigt aktiven Zone-Kontext + Wechsel-Dropdown
- [ ] `device_scope = 'multi_zone'` Sensoren: In bedienten Zonen erscheint Referenz-Card in "Shared Sensors" Sektion
- [ ] Monitor L1: Mobiler Sensor wird in aktiver Zone gezaehlt (nicht in Heimzone)
- [ ] `device_context_changed` WS-Event triggert UI-Update ohne manuellen Reload
- [ ] `npm run build` ohne Fehler
- [ ] `vue-tsc --noEmit` ohne TypeScript-Fehler
- [ ] Kein Backend-Code veraendert
