# AUT-255 — Alert-Suppression-Kaskade: Lückenanalyse & Implementierungsplan

**Datum:** 2026-05-06  
**Status:** In Review (nach 2 Commits; 2 Acceptance-Kriterien offen)  
**Branch:** `auto-debugger/work`

---

## 1. Was wurde umgesetzt (Evidenz aus Codebase)

### Commit aa872c60

| Teil | Datei | Umgesetzt |
|------|-------|-----------|
| Composable | `useAlertSuppression.ts` | Sensor + Device Kaskade → reaktives `SuppressionState` ViewModel |
| Part A+E | `AlertConfigSection.vue` | Suppression-Banner mit Quelle (`sensor`/`device`/`both`), `formatSuppressionReason()`, `formatDateTime()`, Hierarchie-Anzeige |
| Part B | `DeviceMiniCard.vue` | `🔕 Alerts pausiert` Pill in Status-Line, `isDeviceSuppressed` computed liest `device.alert_config.propagate_to_children` |
| Formatter | `formatters.ts` | `formatSuppressionReason()` + `formatDateTime()` |

### Commit 04794dd2

| Teil | Datei | Umgesetzt |
|------|-------|-----------|
| Part C (Prop) | `SensorCard.vue` | `isSuppressed?: boolean` + `suppressionTooltip?: string` Props; `🔕 paused`-Badge im Footer; CSS `.sensor-card__badge--suppressed` |
| Part D (UI) | `NotificationDrawer.vue` | `showSuppressed`-Checkbox + Hinweistext; AUT-255-Kommentar |
| Tests | `useAlertSuppression.test.ts` | 10 Vitest-Cases (none/sensor/device/both + effectiveUntil + 3× reactive) |

### Build
`npm run build` ✅ Exit-Code 0 nach beiden Commits.

---

## 2. Acceptance-Kriterien — Status

| # | Kriterium | Status |
|---|-----------|--------|
| AC1 | Sensor-Settings zeigt vererbte Suppression + Quelle + Re-Enable | ✅ AlertConfigSection Banner (Part A+E) |
| AC2 | Geraete-Card hat Suppression-Pill mit Countdown | ✅ DeviceMiniCard (Part B) |
| AC3 | Sensor-Tile hat 🔕 Indicator | ⚠️ Prop vorhanden, **nicht verdrahtet** (Part C offen) |
| AC4 | Alert-Panel hat Filter-Toggle "Auch unterdrueckte" | ⚠️ UI vorhanden, **ohne Store-Anbindung** (Part D offen) |
| AC5 | Effektive Suppression bei doppelter Suppression korrekt | ✅ useAlertSuppression `effectiveUntil` Logik |
| AC6 | Vitest: 4 Cases (sensor/device/both/none) | ✅ 10 Cases in useAlertSuppression.test.ts |
| AC7 | Vitest: Reaktiver Re-Enable-Countdown | ✅ 3× reactive Cases abgedeckt |

**Offen: AC3 + AC4**

---

## 3. Lückenanalyse

### 3.1 Gap C — SensorCard.isSuppressed: Prop-Wiring-Kette unterbrochen

**Symptom:** Die `🔕 paused`-Pill erscheint niemals, obwohl das Prop bereit ist.

**Root-Cause-Kette (3 Schichten):**

```
Server → ESPDevice.sensors[].alert_config
         ↓
    useZoneGrouping.ts → SensorWithContext    ← alert_config fehlt im Interface
         ↓                                       → Spread ...sensor trägt es NICHT durch
    MonitorView.vue → <SensorCard>           ← :isSuppressed und :suppressionTooltip
                                                  werden nicht übergeben
```

**Schicht 1 — `SensorWithContext`-Interface** ([useZoneGrouping.ts:25-48](El%20Frontend/src/composables/useZoneGrouping.ts#L25-L48)):

```typescript
// AKTUELL: kein alert_config-Feld
export interface SensorWithContext {
  gpio: number
  sensor_type: string
  // ... alle anderen Felder ...
  // ← alert_config FEHLT
  // ← device_suppression_active FEHLT
}
```

**Schicht 2 — flatMap-Sensor-Type-Cast** ([useZoneGrouping.ts:140-145](El%20Frontend/src/composables/useZoneGrouping.ts#L140-L145)):

```typescript
// AKTUELL: inline cast enthält alert_config nicht
const sensors = esp.sensors as {
  gpio: number; sensor_type: string; name: string | null;
  raw_value: number; unit: string; quality: QualityLevel;
  config_id?: string; last_read?: string | null;
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | 'VIRTUAL' | null
  // ← alert_config fehlt → kein Spread-Durchreichen
}[] | undefined
```

**Schicht 3 — MonitorView-Template** ([MonitorView.vue:2385-2405](El%20Frontend/src/views/MonitorView.vue#L2385-L2405)):

```vue
<!-- AKTUELL: isSuppressed + suppressionTooltip fehlen -->
<SensorCard
  :sensor="sensor"
  mode="monitor"
  :data-mode="monitorSensorCardDataMode"
  :trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"
  @click="toggleExpanded(...)"
>
```

**Warum braucht SensorCard zwei Suppression-Quellen:**

Laut Server-Vertrag (AUT-255 Issue):
- **Sensor-Level:** `SensorConfig.alert_config.alerts_enabled === false` ODER `suppression_until > now`
- **Device-Level:** `esp_device.alert_config.propagate_to_children === true`

Das Composable `useAlertSuppression` (bereits implementiert) aggregiert genau das zu einem `SuppressionState`. Aber es erwartet reaktive Refs. Für die MonitorView-Liste (viele Sensoren) brauchen wir eine synchrone Hilfsfunktion, kein reaktives Composable-Instanz-pro-Sensor.

---

### 3.2 Gap D — showSuppressed: Lokales Ref, nicht im Store

**Symptom:** Checkbox ist klickbar, ändert aber nichts an der angezeigten Liste.

**Root-Cause:**

```typescript
// NotificationDrawer.vue:41 — AKTUELL: nur lokales Ref
const showSuppressed = ref(false)
```

Die `groupedNotifications`-Computed im Store ([notification-inbox.store.ts:94](El%20Frontend/src/shared/stores/notification-inbox.store.ts#L94)) kennt `showSuppressed` nicht. Die Store-Filter-Logik:

```typescript
// AKTUELL in buildListFilters(): showSuppressed wird nicht an API weitergegeben
// AKTUELL in notificationMatchesCurrentFilters(): kein suppressed-Filter
```

Das bedeutet: Notifications mit `status: 'suppressed'` werden — je nach Server-Verhalten — entweder:
- (a) gar nicht zurückgegeben (Server filtert sie default aus), oder  
- (b) mitgeliefert, aber clientseitig nicht gefiltert

In beiden Fällen bewirkt die Checkbox aktuell nichts.

---

## 4. Implementierungsplan

### Plan-C: SensorCard.isSuppressed vollständig verdrahten

**Scope:** 2 Dateien, kein neues Composable, kein API-Aufruf.

---

#### C1 — `SensorWithContext` erweitern

**Datei:** [El Frontend/src/composables/useZoneGrouping.ts](El%20Frontend/src/composables/useZoneGrouping.ts)  
**Bereich:** Interface `SensorWithContext` (Z. 25–48)

```typescript
export interface SensorWithContext {
  gpio: number
  sensor_type: string
  name: string | null
  raw_value: number
  unit: string
  quality: QualityLevel
  config_id?: string
  esp_id: string
  esp_state?: string
  zone_id: string | null
  zone_name: string
  subzone_id: string | null
  subzone_name: string
  last_read?: string | null
  is_stale?: boolean
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | 'VIRTUAL' | null
  device_scope?: 'zone_local' | 'multi_zone' | 'mobile' | null
  assigned_zones?: string[]
  active_zone_id?: string | null
  context_since?: string | null
  // AUT-255: sensor-level alert suppression (from SensorConfig.alert_config)
  alert_config?: {
    alerts_enabled?: boolean
    suppression_until?: string | null
    suppression_reason?: string | null
  } | null
  // AUT-255: true when parent device has propagate_to_children=true
  device_suppression_active?: boolean
}
```

---

#### C2 — flatMap-Type-Cast + Spread erweitern

**Datei:** [El Frontend/src/composables/useZoneGrouping.ts](El%20Frontend/src/composables/useZoneGrouping.ts)  
**Bereich:** Z. 140–170

**Inline-Cast erweitern** (Z. 140–145):
```typescript
const sensors = esp.sensors as {
  gpio: number; sensor_type: string; name: string | null;
  raw_value: number; unit: string; quality: QualityLevel;
  config_id?: string; last_read?: string | null;
  interface_type?: 'I2C' | 'ONEWIRE' | 'ANALOG' | 'DIGITAL' | 'VIRTUAL' | null
  alert_config?: {
    alerts_enabled?: boolean
    suppression_until?: string | null
    suppression_reason?: string | null
  } | null
}[] | undefined
```

**Mapping erweitern** (Z. 162–170) — `device_suppression_active` einmal pro ESP statt pro Sensor ermitteln:

```typescript
// Vor dem sensors.map():
const deviceAlertCfg = (esp as unknown as { alert_config?: { propagate_to_children?: boolean } }).alert_config
const deviceSuppressed = deviceAlertCfg?.propagate_to_children === true

return sensors.map(sensor => {
  // ... bestehende subzone-Logik ...
  return {
    ...sensor,
    esp_id: espId,
    esp_state: esp.system_state,
    zone_id: zoneId,
    zone_name: zoneName,
    subzone_id: subzoneId,
    subzone_name: subzoneName,
    device_suppression_active: deviceSuppressed, // AUT-255
  }
})
```

Der `...sensor`-Spread trägt `alert_config` automatisch durch, da es nun im Type-Cast enthalten ist.

---

#### C3 — MonitorView: isSuppressed + tooltip berechnen und übergeben

**Datei:** [El Frontend/src/views/MonitorView.vue](El%20Frontend/src/views/MonitorView.vue)  
**Bereich:** Script-Block (Imports + Helper-Funktionen) + Template (Z. 2385)

**Import hinzufügen** (neben bestehenden formatter-Imports):
```typescript
import { formatSuppressionReason, formatDateTime } from '@/utils/formatters'
```

**Zwei Helper-Funktionen** (im `<script setup>`-Block, nach bestehenden Helper-Funktionen):

```typescript
function getSensorIsSuppressed(sensor: SensorWithContext): boolean {
  if (sensor.device_suppression_active) return true
  const cfg = sensor.alert_config
  if (!cfg) return false
  if (cfg.alerts_enabled === false) return true
  if (cfg.suppression_until != null && new Date(cfg.suppression_until) > new Date()) return true
  return false
}

function getSensorSuppressionTooltip(sensor: SensorWithContext): string {
  if (!getSensorIsSuppressed(sensor)) return ''
  const parts: string[] = ['Alerts unterdrückt']
  if (sensor.device_suppression_active) {
    parts.push('Quelle: Gerät (propagate_to_children)')
  }
  const cfg = sensor.alert_config
  if (cfg?.suppression_reason) {
    parts.push(`Grund: ${formatSuppressionReason(cfg.suppression_reason)}`)
  }
  if (cfg?.suppression_until) {
    parts.push(`Reaktivierung: ${formatDateTime(cfg.suppression_until)}`)
  }
  return parts.join('\n')
}
```

**Template-Aufruf** (Z. ~2385):
```vue
<SensorCard
  :sensor="sensor"
  mode="monitor"
  :data-mode="monitorSensorCardDataMode"
  :trend="getSensorTrend(sensor.esp_id, sensor.gpio, sensor.sensor_type)"
  :is-suppressed="getSensorIsSuppressed(sensor)"
  :suppression-tooltip="getSensorSuppressionTooltip(sensor)"
  @click="toggleExpanded(getSensorKey(sensor.esp_id, sensor.gpio, sensor.sensor_type))"
>
```

---

### Plan-D: showSuppressed in Store verdrahten

**Scope:** 2 Dateien. Kein neuer API-Endpunkt (reine Clientfilterung).

**Design-Entscheidung:** Suppressed-Notifications die der Server zurückliefert (`status: 'suppressed'`) werden clientseitig gefiltert — analog zu `notificationMatchesCurrentFilters`. So bleibt die Store-Paginierung unberührt.

---

#### D1 — `notification-inbox.store.ts` erweitern

**Datei:** [El Frontend/src/shared/stores/notification-inbox.store.ts](El%20Frontend/src/shared/stores/notification-inbox.store.ts)

**State hinzufügen** (nach `sourceFilter`, Z. ~68):
```typescript
const showSuppressed = ref(false)
```

**`notificationMatchesCurrentFilters` erweitern** (Z. 154–160):
```typescript
function notificationMatchesCurrentFilters(n: NotificationDTO): boolean {
  if (activeFilter.value !== 'all' && n.severity !== activeFilter.value) return false
  if (lifecycleFilter.value !== 'all' && n.status !== lifecycleFilter.value) return false
  if (sourceFilter.value === '__system__') {
    if (!n.source || !SYSTEM_SOURCES_SET.has(n.source)) return false
  } else if (sourceFilter.value && n.source !== sourceFilter.value) return false
  // AUT-255: Suppressed notifications ausblenden wenn Toggle inaktiv
  if (!showSuppressed.value && (n as NotificationDTO & { status?: string }).status === 'suppressed') return false
  return true
}
```

**`groupedNotifications` Computed anpassen** — filter `showSuppressed` clientseitig auf der Liste:
```typescript
const groupedNotifications = computed(() => {
  const filtered = showSuppressed.value
    ? notifications.value
    : notifications.value.filter(n => (n as any).status !== 'suppressed')
  // ... bestehende date-grouping Logik mit `filtered` statt `notifications.value` ...
})
```

**Store-Export** (Z. ~593):
```typescript
return {
  // ... bestehende exports ...
  showSuppressed,       // AUT-255
}
```

---

#### D2 — `NotificationDrawer.vue` auf Store-State umschalten

**Datei:** [El Frontend/src/components/notifications/NotificationDrawer.vue](El%20Frontend/src/components/notifications/NotificationDrawer.vue)

**Lokales Ref entfernen** (Z. 41):
```typescript
// ENTFERNEN:
// const showSuppressed = ref(false)
```

**Checkbox auf Store-Ref umverdrahten** (Z. ~300–313):
```vue
<div class="drawer__suppressed-toggle">
  <label class="drawer__suppressed-label">
    <input
      v-model="inboxStore.showSuppressed"
      type="checkbox"
      class="drawer__suppressed-checkbox"
      data-testid="notification-show-suppressed"
    />
    <BellOff :size="12" aria-hidden="true" class="drawer__suppressed-icon" />
    Auch unterdrückte Alerts anzeigen
  </label>
  <span v-if="inboxStore.showSuppressed" class="drawer__suppressed-hint">
    Alerts mit aktiver Suppression werden ausgegraut angezeigt (wenn vorhanden).
  </span>
</div>
```

---

## 5. Verträge — was NICHT geändert wird

- `useAlertSuppression.ts` bleibt unverändert (korrekte Implementierung)
- `AlertConfigSection.vue` bleibt unverändert
- `DeviceMiniCard.vue` bleibt unverändert  
- `SensorCard.vue` bleibt unverändert (Prop ist bereits opt-in)
- `NotificationDrawer.vue`-CSS bleibt unverändert
- Server-Kontrakt: kein neuer API-Endpunkt, kein WS-Event-Change

---

## 6. Betroffene Dateien gesamt

| Datei | Änderungstyp | Gap |
|-------|-------------|-----|
| `El Frontend/src/composables/useZoneGrouping.ts` | Interface + Type-Cast + Spread | C1+C2 |
| `El Frontend/src/views/MonitorView.vue` | 2 Helper-Funktionen + Template-Props | C3 |
| `El Frontend/src/shared/stores/notification-inbox.store.ts` | State + Filter-Logik + Export | D1 |
| `El Frontend/src/components/notifications/NotificationDrawer.vue` | Lokales Ref → Store-Ref | D2 |

---

## 7. Verifikation

```bash
cd "El Frontend" && npm run build
cd "El Frontend" && npx vue-tsc --noEmit
```

Erfolgskriterium:
- Exit-Code 0, keine TS-Errors
- `SensorCard` im MonitorView rendert `🔕 paused`-Badge wenn Sensor oder Parent-Device suppressed
- Checkbox im NotificationDrawer inkludiert/exkludiert Notifications mit `status: 'suppressed'`

---

## 8. Offene Frage (kein Blocker)

**OQ-1 (showSuppressed Persistenz):** `showSuppressed` ist aktuell flüchtiger State (Session). Bei Drawer-Close-Watch (Z. 208) wird kein Reset erzwungen. Wenn der Operator die Präferenz über Sessions hinweg behalten soll → localStorage-Persistenz via `useLocalStorage`. Aktuell kein Scope-Bestandteil.

**OQ-2 (HardwareView SensorTile):** AC3 bezieht sich auf "HardwareView L2 / Monitor". HardwareView-SensorTiles wurden in diesem Plan nicht behandelt. Sofern HardwareView `SensorWithContext` konsumiert (prüfen), ist der C3-Ansatz direkt übertragbar.
