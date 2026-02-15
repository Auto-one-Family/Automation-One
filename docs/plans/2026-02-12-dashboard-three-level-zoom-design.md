# Dashboard Three-Level Zoom Design

> **Date:** 2026-02-12
> **Status:** PARTIALLY IMPLEMENTED (2026-02-15)
> **Scope:** Frontend — El Frontend Dashboard Redesign
> **Reviewed:** 2026-02-12 — gegen echte Codebase verifiziert, Architecture Dependencies ergänzt
> **Last Update:** 2026-02-15 — Implementation status update, revised level order
>
> ## ⚠️ IMPLEMENTATION NOTE (2026-02-15)
>
> The 3-level architecture was **implemented with a REVISED level order** based on user feedback:
>
> | Level | Original Design | **Implemented** |
> |-------|----------------|-----------------|
> | **L1 (default)** | Zone Overview | **ESP-Orbital-View**: ESPs with sensors/actuators, drag & drop |
> | **L2** | Zone Detail | **Komponentenübersicht**: ALL sensors + actuators WITHOUT ESPs |
> | **L3** | Device Detail | **Zonen-Navigator**: Zone/subzone overview with aggregated stats |
>
> ### Implemented Files
> - `src/composables/useZoomNavigation.ts` — Level state, CSS transitions, URL sync, keyboard (Escape)
> - `src/components/dashboard/LevelNavigation.vue` — Tab bar: ESPs | Komponenten | Zonen
> - `src/components/dashboard/ComponentCard.vue` — Sensor/actuator card (Level 2)
> - `src/components/dashboard/ZonePlate.vue` — Zone overview card with subzones (Level 3)
> - `src/components/esp/DeviceHeaderBar.vue` — Extracted from ESPOrbitalLayout
> - `src/views/DashboardView.vue` — Refactored with v-show-based 3-level containers
>
> ### NOT yet implemented from this doc
> - DeviceMiniCard (Level 1 uses existing ESPOrbitalLayout instead)
> - DeviceSummaryCard (Level 2 uses ComponentCard instead)
> - SubzoneArea (integrated into ZonePlate as inline subzone groups)
> - DeviceDetailView (Level 3 uses ZonePlate overview, not device detail)
> - Full ESPOrbitalLayout decomposition (SensorColumn, ActuatorColumn)

---

## Aesthetic Direction: "Deep Space Mission Control"

> **Tone:** Industrial Precision meets Cosmic Depth.
> The dashboard feels like looking through a spaceship viewport at your IoT infrastructure.
> Zooming in feels like navigating through layers of a space station — from orbital overview
> to sector detail to individual console.

**Visual Principles:**
- **Depth through darkness.** The void-black background (`#07070d`) is not emptiness — it's depth.
  Each zoom level gets progressively lighter: L1 uses `--color-bg-primary`, L2 uses `--color-bg-secondary`,
  L3 uses `--color-bg-tertiary`. This creates the sensation of "approaching" the subject.
- **Iridescent = alive.** The existing 4-color gradient (`iridescent-1` → `iridescent-4`) signals
  active, healthy, premium elements. Zone plates with all-online devices get a subtle iridescent
  top border. Warning zones get a warm amber glow instead.
- **Glass = surface.** Every interactive surface uses glassmorphism (`glass-bg`, `backdrop-filter: blur(12px)`).
  But NOT flat glass — each card has the `noise-overlay` texture for tactile depth.
- **Motion = intentional.** The existing easing tokens (`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`)
  are perfect for the zoom feel — fast start, soft landing. Zoom transitions use these exclusively.
  No bouncing, no spring — this is precision equipment, not a toy.
- **Typography = hierarchy through weight, not size.** Outfit (already loaded) handles display AND body.
  JetBrains Mono for device IDs and sensor values. Level headers use `--text-xl` + `font-weight: 600`.
  Sensor values use `--text-sm` + `font-mono` + `--color-text-primary` for maximum readability.

**Zoom Transition Feeling:**
- L1 → L2: Zone plate EXPANDS to fill the viewport. Other zones fade and shrink away.
  Like selecting a sector on a holographic map.
- L2 → L3: Device card rises from the grid and takes center stage.
  Surrounding cards slide to periphery and fade.
- Back: Reverse — the detail view CONTRACTS back to its origin position.
  The parent level fades back in from the edges.

---

## Problem

The current dashboard renders all devices in a flat zone-grouped list. When an ESP has more than 2 sensors or actuators, the overflow items disappear (CSS overflow bug in ESPOrbitalLayout). Additionally, the flat layout doesn't convey spatial relationships between zones, subzones, and devices.

### Architecture Context (Server-Zentrisch)

> **CRITICAL for agents:** AutomationOne is a server-centric IoT system. The frontend is a TOOL, not just a UI.
> All business logic lives on El Servador (FastAPI). ESP32 devices are "dumb agents."
> Zone data, device state, sensor values — ALL come from the server via REST API + WebSocket events.
> The frontend MUST NOT implement business logic. It displays server state and sends user actions to the server.
>
> ```
> El Frontend (Vue 3) ←HTTP/WS→ El Servador (FastAPI) ←MQTT→ El Trabajante (ESP32)
> ```
>
> **Zone data model:** Zones are NOT a separate entity. They are PROPERTIES on ESPDevice objects
> (`zone_id`, `zone_name`, `subzone_id`, `subzone_name`). Zone grouping is derived client-side
> via `useZoneDragDrop.groupDevicesByZone()` which reads `espStore.devices[].zone_id`.
> There is NO separate zones list endpoint or zones store with its own data.

## Solution: Three-Level Zoom Architecture

Three nested views connected by CSS zoom transitions:

```
Level 1: Zone Overview        -> All zones at a glance (compact cards)
   | Click zone (zoom in)
Level 2: Zone Detail          -> All devices of ONE zone (medium summary cards)
   | Click device (zoom in)
Level 3: Device Detail        -> One device with all sensors/actuators/charts (full page)
```

Browser back button and breadcrumb navigate up through levels.

**Rendering Strategy:** All three levels exist in the DOM simultaneously inside `DashboardView.vue`,
controlled by `v-show` (NOT `v-if`) to preserve scroll positions and component state. This means:
- No re-mount overhead when navigating back
- Scroll position preserved automatically
- WebSocket handlers stay connected (no re-subscription)
- Filter state persists across zoom levels
- Level 2/3 only render children when their respective selection refs are non-null

---

## Level 1 — Zone Overview (Bird's Eye)

Shows the entire system at a glance. This is the DEFAULT view when navigating to `/`.

### ZonePlate Component

Zones rendered as elevated glass rectangles ("plates") with iridescent styling for healthy zones.

```
+-- ZonePlate "Gewaechshaus A" --------------------------------+
|  +-- Header -----------------------------------------------+ |
|  |  * Gewaechshaus A          4/5 Online · 1 Warning       | |
|  +----------------------------------------------------------+ |
|                                                               |
|  +-- Subzone "Bewaesserung" (tinted area) -----------------+ |
|  |  [MiniCard ESP_01] [MiniCard ESP_02]                    | |
|  +----------------------------------------------------------+ |
|                                                               |
|  +-- Subzone "Beleuchtung" (tinted area) ------------------+ |
|  |  [MiniCard ESP_03]                                      | |
|  +----------------------------------------------------------+ |
|                                                               |
|  [MiniCard ESP_04] [MiniCard ESP_05]  <- no subzone          |
+---------------------------------------------------------------+
```

**File:** `src/components/dashboard/ZonePlate.vue`

**ZonePlate Props (TypeScript):**
```typescript
interface ZonePlateProps {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
  isDropTarget?: boolean  // visual feedback during drag
}
```

**ZonePlate Emits:**
```typescript
interface ZonePlateEmits {
  (e: 'click', payload: { zoneId: string; originRect: DOMRect }): void
  (e: 'device-dropped', payload: { device: ESPDevice; fromZoneId: string | null; toZoneId: string }): void
}
```

**ZonePlate CSS (exact tokens):**
```css
.zone-plate {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);      /* 16px */
  padding: var(--space-4);              /* 16px */
  box-shadow: var(--elevation-raised);
  cursor: pointer;
  transition: transform var(--transition-base), box-shadow var(--transition-base);
  position: relative;
  overflow: hidden;
}

.zone-plate::after {
  /* noise-overlay texture for depth — same SVG as glass.css */
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.zone-plate:hover {
  transform: translateY(-4px);
  box-shadow: var(--elevation-floating);
  border-color: var(--glass-border-hover);
}

/* Status-dependent top border */
.zone-plate--healthy {
  /* All devices online: iridescent top border */
  border-top: 2px solid transparent;
  border-image: var(--gradient-iridescent) 1;
}

.zone-plate--warning {
  border-top: 2px solid var(--color-warning);
  box-shadow: var(--elevation-raised), 0 -4px 20px rgba(251, 191, 36, 0.08);
}

.zone-plate--error {
  border-top: 2px solid var(--color-error);
  box-shadow: var(--elevation-raised), 0 -4px 20px rgba(248, 113, 113, 0.08);
}
```

**Zone-Grid layout:** `display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4)`

**Subzone rendering within ZonePlate:**
```css
.zone-plate__subzone {
  background: var(--glass-bg-light);     /* rgba(255,255,255,0.04) */
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);       /* 10px */
  padding: var(--space-3);               /* 12px */
  margin-top: var(--space-2);            /* 8px */
}

.zone-plate__subzone-label {
  font-size: var(--text-xs);             /* 11px */
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);  /* 0.04em */
  margin-bottom: var(--space-2);
  font-weight: 500;
}
```

#### Architecture Dependencies (ZonePlate)

> **Datenquelle:** `useZoneDragDrop().groupDevicesByZone(espStore.devices)` liefert `ZoneGrouping[]`.
> Jede Grouping hat `{ zoneId, zoneName, devices[] }`. Die Zone wird aus `device.zone_id` / `device.zone_name`
> ABGELEITET — es gibt KEINE Zone-Entity auf dem Server.
>
> **Subzone-Darstellung:** Im echten System sind Subzones PRO-DEVICE — `device.subzone_id` ist
> ein einziger Wert pro ESP. Die Subzone-Gruppen auf Level 1 werden über `device.subzone_id` gruppiert.
> ESPs ohne `subzone_id` kommen in den Bereich ohne Subzone-Label.
>
> **Migration von ZoneGroup.vue:** ZonePlate ersetzt `ZoneGroup.vue` (`components/zones/ZoneGroup.vue`).
> ZoneGroup hat bereits: Collapsible Header, Drag-Drop via `VueDraggable` mit `group="esp-devices"`,
> `device-dropped` Event, LocalStorage Persistence für Collapse-State.
> ZonePlate MUSS die gleiche `group="esp-devices"` Drag-Group verwenden.
> ZoneGroup bleibt als Datei bestehen — nur DashboardView wechselt den Import.
>
> **Bestehendes Pattern:** ZoneGroup nutzt `useDragStateStore()` für globales Drag-Feedback
> (`isDraggingEspCard`, `isAnyDragActive`). ZonePlate muss das gleiche Pattern verwenden.

### DeviceMiniCard Component (~120x56px)

```
+-----------------------------+
| * ESP_Temp_01    MOCK        |  <- Status dot + name + badge
|    23.1°C · 65%             |  <- 1-2 key sensor values
+-----------------------------+
```

**File:** `src/components/dashboard/DeviceMiniCard.vue`

**DeviceMiniCard Props:**
```typescript
interface DeviceMiniCardProps {
  device: ESPDevice
  isMock: boolean
}
```

**DeviceMiniCard Emits:**
```typescript
interface DeviceMiniCardEmits {
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
}
```

**DeviceMiniCard CSS:**
```css
.device-mini-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-2) var(--space-3);         /* 8px 12px */
  background: var(--color-bg-tertiary);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);                /* 6px */
  border-left: 3px solid var(--color-mock);       /* or --color-real */
  cursor: pointer;
  transition: all var(--transition-fast);
  min-width: 120px;
  max-width: 200px;
}

.device-mini-card:hover {
  background: var(--color-bg-quaternary);
  border-color: var(--glass-border-hover);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.device-mini-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-1);                            /* 4px */
}

.device-mini-card__status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.device-mini-card__name {
  font-size: var(--text-xs);                      /* 11px */
  font-weight: 500;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.device-mini-card__badge {
  font-size: 9px;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.device-mini-card__values {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

- Click: Zoom directly to Level 3 (device detail) — emits `click` with DOMRect
- Drag: Move device between zones (existing drag-drop behavior via VueDraggable)
- Left border color: `--color-mock` (#a78bfa violet) for Mock, `--color-real` (#22d3ee cyan) for Real
- Layout within zone: `display: flex; flex-wrap: wrap; gap: var(--space-2)` (8px)
- Sensor values: Show max 2 key values from `device.sensors` (first two with non-null `raw_value`)
- Sensor value formatting: `${value}${unit}` with `·` separator (e.g. "23.1°C · 65%")
- Fallback (no sensors array): Show `device.sensor_count` + " Sensoren" text

#### Architecture Dependencies (DeviceMiniCard)

> **Device ID:** Immer über `device.device_id || device.esp_id` auflösen (Pattern aus `espStore.getDeviceId()`).
> Mock-ESPs nutzen `ESP_MOCK_XXX` Format, Real-ESPs nutzen `ESP_XXXXXXXX` Format.
> Erkennung: `espApi.isMockEsp(deviceId)` — prüft auf `MOCK_` Prefix.
>
> **Sensor-Werte für 1-2 Key Values:** `device.sensors` ist ein Array von `MockSensor`-Objekten
> (Felder: `gpio`, `sensor_type`, `raw_value`, `unit`, `quality`, `name`).
> ABER: `device.sensors` ist nur bei Mock-ESPs immer gefüllt. Bei Real-ESPs kommen Sensor-Werte
> über WebSocket `sensor_data` Events und werden in `devices.value[idx]` gemergt.
> Prüfe ob `device.sensors` existiert und nicht leer ist, bevor Key Values angezeigt werden.
>
> **Status-Erkennung:** `device.status` kann sein: `online`, `offline`, `error`, `pending_approval`.
> Zusätzlich: `device.connected` (boolean). Mock-ESPs haben `device.system_state`
> (`BOOT`, `OPERATIONAL`, `SAFE_MODE`, `ERROR`). Pattern aus `DashboardView.vue:112-132`.
>
> **Drag-Handle:** DeviceMiniCard braucht ein `.esp-drag-handle` Element (CSS class) —
> VueDraggable in ZonePlate nutzt `handle=".esp-drag-handle"`.
> Der gesamte Card-Header ist das Handle-Element.

### Status Aggregation

Each ZonePlate header shows aggregated status only:
- Device count: "5 Geräte"
- Online/offline: "4/5 Online"
- Warnings: "1 Warning" (orange indicator)
- No live sensor values at this level

**Aggregation logic (computed in ZonePlate):**
```typescript
const stats = computed(() => {
  const total = props.devices.length
  const online = props.devices.filter(d =>
    d.status === 'online' || d.connected === true
  ).length
  const warnings = props.devices.filter(d => {
    const id = espStore.getDeviceId(d)
    if (espStore.isMock(id)) {
      const m = d as any
      return m.system_state === 'ERROR' || m.actuators?.some((a: any) => a.emergency_stopped)
    }
    return d.status === 'error'
  }).length
  return { total, online, warnings }
})
```

---

## Level 2 — Zone Detail

Shows all devices of a single zone in a spacious grid. Background shifts subtly lighter
to convey "closer" depth: Level 2 container uses `background: var(--color-bg-secondary)`.

### ZoneDetailView Component

```
+-- Breadcrumb: Dashboard > Gewaechshaus A -------------------+
|                                                              |
|  +-- Zone Header ----------------------------------------+  |
|  |  Gewaechshaus A     5 Geräte · 12 Sensoren · 4 Akt.  |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  +-- Subzone "Bewaesserung" (tinted area) ---------------+  |
|  |                                                       |  |
|  |  +-- SummaryCard ESP_01 -+  +-- SummaryCard ESP_02 -+ |  |
|  |  |  Name + Status        |  |  Name + Status        | |  |
|  |  |  Sensors: 3 (icons)   |  |  Sensors: 2 (icons)   | |  |
|  |  |  Actuators: 1 (icon)  |  |  Actuators: 2 (icons) | |  |
|  |  |  Last HB: 2 min       |  |  Last HB: 30 sec      | |  |
|  |  +------------------------+  +------------------------+ |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  +-- Devices without subzone --------------------------------+|
|  |  +-- SummaryCard ESP_04 -+  +-- SummaryCard ESP_05 -+    ||
|  |  |  ...                  |  |  ...                  |    ||
|  |  +------------------------+  +------------------------+   ||
|  +------------------------------------------------------------+|
+--------------------------------------------------------------+
```

**File:** `src/components/zones/ZoneDetailView.vue`

**ZoneDetailView Props:**
```typescript
interface ZoneDetailViewProps {
  zoneId: string
  zoneName: string
  devices: ESPDevice[]
}
```

**ZoneDetailView Emits:**
```typescript
interface ZoneDetailViewEmits {
  (e: 'device-click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'back'): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'delete', deviceId: string): void
  (e: 'settings', device: ESPDevice): void
}
```

### DeviceSummaryCard Component (~240x140px)

**File:** `src/components/zones/DeviceSummaryCard.vue`

Shows per device:
- Name, status indicator dot, mock/real badge
- WiFi signal strength (icon + bars via `getWifiStrength()` from `@/utils/wifiStrength`)
- Sensor count with sensor-type icons (Thermometer, Droplets, etc.)
- Actuator count with actuator-type icons (Zap, Fan, etc.)
- Last heartbeat timestamp (relative: "vor 2 Min." via `formatRelativeTime()` from `@/utils/formatters`)
- Quick-action buttons: Heartbeat (mock only), Settings (gear icon)

No individual sensor values — those are in Level 3.

**DeviceSummaryCard Props:**
```typescript
interface DeviceSummaryCardProps {
  device: ESPDevice
  isMock: boolean
}
```

**DeviceSummaryCard Emits:**
```typescript
interface DeviceSummaryCardEmits {
  (e: 'click', payload: { deviceId: string; originRect: DOMRect }): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'settings', device: ESPDevice): void
}
```

**DeviceSummaryCard CSS:**
```css
.device-summary-card {
  background: var(--glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-md);               /* 10px */
  padding: var(--space-4);                        /* 16px */
  border-left: 3px solid var(--color-mock);       /* or --color-real */
  cursor: pointer;
  transition: all var(--transition-base);
  position: relative;
  overflow: hidden;
  min-width: 200px;
}

.device-summary-card::after {
  /* noise-overlay for tactile depth */
  content: '';
  position: absolute;
  inset: 0;
  opacity: 0.015;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  pointer-events: none;
}

.device-summary-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--elevation-floating);
  border-color: var(--glass-border-hover);
}

.device-summary-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

.device-summary-card__name {
  font-size: var(--text-base);                    /* 14px */
  font-weight: 600;
  color: var(--color-text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-summary-card__meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2);
  font-size: var(--text-xs);                      /* 11px */
  color: var(--color-text-secondary);
}

.device-summary-card__meta-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.device-summary-card__meta-item svg {
  width: 12px;
  height: 12px;
  color: var(--color-text-muted);
}

.device-summary-card__actions {
  display: flex;
  gap: var(--space-1);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--glass-border);
}
```

**Layout within ZoneDetailView:** `display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-4)`

#### Architecture Dependencies (DeviceSummaryCard)

> **WiFi Signal:** `device.wifi_rssi` (number, dBm). Utility: `getWifiStrength()` aus
> `@/utils/wifiStrength`. Wird über `esp_health` WebSocket-Events aktualisiert.
>
> **Last Heartbeat:** `device.last_seen` (ISO string) oder `device.last_heartbeat`.
> Utility: `formatRelativeTime()` aus `@/utils/formatters`.
>
> **Sensor/Actuator Count:** `device.sensor_count` / `device.actuator_count` (numerisch),
> oder `device.sensors?.length` / `device.actuators?.length` wenn Arrays verfügbar.
>
> **Quick Actions — Heartbeat:** Nur für Mock-ESPs (`espStore.isMock(deviceId)`).
> Aufruf: `espStore.triggerHeartbeat(deviceId)`.
> **Quick Actions — Settings:** Emittiert `settings(device)` nach oben → DashboardView öffnet ESPSettingsSheet.
>
> **Drag-Drop:** DeviceSummaryCard braucht `data-device-id` Attribut.
> Drag-Gruppe: `group="esp-devices"`. Handle: `.esp-drag-handle` auf dem Card-Header.
> `force-fallback="true"` für VueDraggable.

### SubzoneArea Component

**File:** `src/components/zones/SubzoneArea.vue`

- Tinted background area within ZoneDetailView
- Dashed border, small label at top-left
- Groups DeviceSummaryCards visually by subzone
- Devices without subzone shown in a separate section below

**SubzoneArea Props:**
```typescript
interface SubzoneAreaProps {
  subzoneId: string
  subzoneName: string
  devices: ESPDevice[]
}
```

**SubzoneArea CSS:**
```css
.subzone-area {
  background: var(--glass-bg-light);              /* rgba(255,255,255,0.04) */
  border: 1px dashed var(--glass-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}

.subzone-area__label {
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  margin-bottom: var(--space-3);
  font-weight: 500;
}
```

#### Architecture Dependencies (SubzoneArea)

> **Subzones im AutomationOne-System sind PER-DEVICE** — `device.subzone_id` (ein einziger Wert).
> Die SubzoneArea gruppiert Devices nach `device.subzone_id`.
> ESPs ohne `subzone_id` kommen in die "Keine Subzone" Sektion.
>
> **Subzone API:** `subzonesApi` (`@/api/subzones.ts`) bietet `assignSubzone()`,
> `removeSubzone()`, `getSubzones()`. WebSocket-Event: `subzone_assignment`.

### Cross-ESP Connections on Level 2

**Entscheidung: NUR auf Level 3.** Die `CrossEspConnectionOverlay.vue` benötigt DOM-Attribute
(`data-esp-id`, `data-gpio`, `data-satellite-type`) auf `SensorSatellite`/`ActuatorSatellite`
Komponenten. Diese existieren NUR auf Level 3.

Level 2 zeigt stattdessen einen **dezenten Verbindungshinweis** in der ZoneDetailView Header:
"3 Cross-ESP Regeln aktiv" als Badge neben dem Zone-Titel, klickbar zu `/logic`.

---

## Level 3 — Device Detail

Full device view with all sensors, actuators, and charts. Solves the overflow bug by giving
the device unlimited vertical space. Background: `var(--color-bg-tertiary)` — the "closest" depth.

### DeviceDetailView Component

**File:** `src/components/esp/DeviceDetailView.vue`

```
+-- Breadcrumb: Dashboard > Gewaechshaus A > ESP_Temp_01 -----+
|                                                              |
|  +-- Device Header -----------------------------------------+|
|  |  ESP_Temp_01 (Mock)  * Online  WiFi: -42 dBm            ||
|  |  Zone: Gewaechshaus A — Subzone: Bewaesserung           ||
|  |  [Heartbeat] [Settings] [Delete]                        ||
|  +-----------------------------------------------------------+|
|                                                              |
|  +-----------+--------------------+-----------------+        |
|  | SENSORS   |  ANALYSIS AREA     | ACTUATORS       |        |
|  |           |                    |                 |        |
|  | [Temp 23] | +-- Chart ------+  | [Ventilator]    |        |
|  | [Hum 65%] | |               |  | [Lamp]          |        |
|  | [pH 6.2]  | | (sensor drop  |  | [Pump]          |        |
|  | [Lux 450] | |  target)      |  | [Heater]        |        |
|  | [CO2 800] | |               |  |                 |        |
|  | [Press 1k]| +--------------+   |                 |        |
|  |           |                    |                 |        |
|  | scrolls   |                    | scrolls at >4   |        |
|  | at >6     |                    |                 |        |
|  +-----------+--------------------+-----------------+        |
|                                                              |
|  +-- Cross-ESP Connections --------------------------------+  |
|  |  SVG overlay on sensors/actuators (if connections exist)|  |
|  +----------------------------------------------------------+ |
|                                                              |
|  +-- GPIO Configuration ------------------------------------+|
|  |  GPIO matrix / pin assignment                            ||
|  +-----------------------------------------------------------+|
+--------------------------------------------------------------+
```

**DeviceDetailView Props:**
```typescript
interface DeviceDetailViewProps {
  device: ESPDevice
  zoneId: string
  zoneName: string
}
```

**DeviceDetailView Emits:**
```typescript
interface DeviceDetailViewEmits {
  (e: 'back'): void
  (e: 'settings', device: ESPDevice): void
  (e: 'delete', deviceId: string): void
  (e: 'heartbeat', deviceId: string): void
  (e: 'name-updated', payload: { deviceId: string; name: string | null }): void
}
```

### Key Differences from Current ESPOrbitalLayout

- **No max-width on columns** — full page width available
- Sensor/actuator columns grow freely; `max-height: 60vh` with scroll for >8 sensors/actuators
- Analysis chart area is wider (`flex: 2` instead of `flex: 1`)
- GPIO configuration in a separate section below (not squeezed into center card)
- Cross-ESP overlay visible here (full sensor-granularity DOM attributes available)
- 3-column CSS: `display: grid; grid-template-columns: 1fr 2fr 1fr; gap: var(--space-4)`

### Component Decomposition of ESPOrbitalLayout (3,913 lines — verifiziert)

> **Hinweis:** Die Datei heißt `ESPOrbitalLayout.vue` aber intern beschreibt sie sich als
> "ESPHorizontalLayout Component (formerly ESPOrbitalLayout)". Der Dateiname ist maßgeblich.

The monolithic component gets split into:

| New Component | Extracted From | Lines (est.) | Responsibility |
|---------------|---------------|--------------|----------------|
| `DeviceDetailView.vue` | Layout orchestration | ~200 | 3-column layout, page structure, back-nav |
| `SensorColumn.vue` | Sensor rendering logic | ~300 | Sensor list, drag-drop target, add-sensor modal |
| `ActuatorColumn.vue` | Actuator rendering logic | ~250 | Actuator list, emergency stop, command buttons |
| `DeviceHeaderBar.vue` | Top section of ESP card | ~150 | Name, status, WiFi, quick actions, zone badge |

Existing `ESPOrbitalLayout.vue` remains UNTOUCHED for backward compatibility during migration.
Once DeviceDetailView is fully functional, DashboardView stops rendering ESPOrbitalLayout.

#### Architecture Dependencies (ESPOrbitalLayout Decomposition)

> **Emits die übernommen werden müssen:** ESPOrbitalLayout emittiert:
> - `heartbeat(device: ESPDevice)` — Mock-ESP Heartbeat trigger
> - `delete(device: ESPDevice)` — Device löschen (mit Confirm-Dialog)
> - `settings(device: ESPDevice)` — ESPSettingsSheet öffnen
> - `name-updated({ deviceId, name })` — Inline-Name-Edit
> - `sensorClick(gpio)`, `actuatorClick(gpio)` — Selection
> - `sensorDropped(sensor: ChartSensor)` — Sensor-Drop für Chart
>
> **Interne Imports die verteilt werden müssen:**
> - `SensorSatellite.vue`, `ActuatorSatellite.vue` → SensorColumn/ActuatorColumn
> - `AnalysisDropZone.vue` → DeviceDetailView (Mitte)
> - `GpioPicker.vue` → SensorColumn (Add-Sensor-Modal) und GPIO-Sektion
> - `ZoneAssignmentDropdown.vue` → DeviceHeaderBar
> - `Badge.vue` → DeviceHeaderBar
>
> **Store-Abhängigkeiten die verteilt werden:**
> - `useEspStore()` — alle Subkomponenten (Device-Daten, CRUD-Operationen)
> - `useDragStateStore()` — SensorColumn, ActuatorColumn (Drag-Feedback)
> - `useUiStore()` — DeviceHeaderBar (Confirm-Dialog über `uiStore.confirm()`)
> - `useToast()` — alle Subkomponenten (Fehler/Erfolgs-Meldungen)
> - `useZoneDragDrop()` — DeviceHeaderBar (Zone-Dropdown)
> - `useGpioStatus()` — GPIO-Sektion
>
> **Sensor-Hinzufügen Flow (KRITISCH — Server-Zentrisch):**
> 1. User zieht Sensor aus ComponentSidebar auf SensorColumn
> 2. `dragStateStore.isDraggingSensorType` aktiviert Drop-Zone Highlight
> 3. Drop öffnet Add-Sensor-Modal mit GPIO-Picker
> 4. Submit: `espStore.addSensor(deviceId, config)` → API-Call
> 5. Mock-ESP: `debugApi.addSensor()` → `/debug/mock-esp/{id}/sensors`
> 6. Real-ESP: `sensorsApi.createOrUpdate()` → `/sensors/{espId}/{gpio}`
> 7. Nach Erfolg: `espStore.fetchDevice(deviceId)` → UI Update
>
> **Actuator-Hinzufügen Flow:** Analoger Flow über `espStore.addActuator()`.
> Actuator-Commands (ON/OFF/PWM): `espStore.sendActuatorCommand()` →
> Real-ESP: `actuatorsApi.sendCommand()` → Server → MQTT → ESP.

---

## Zoom Transition (CSS-based)

No external library. Pure CSS transitions with JavaScript orchestration via `useZoomNavigation`.

### Mechanism — Detailed CSS Implementation

**New keyframes to add to `tailwind.config.js` keyframes object:**
```javascript
'zoom-in-exit': {
  '0%':   { opacity: '1', transform: 'scale(1)' },
  '100%': { opacity: '0', transform: 'scale(1.08)' },
},
'zoom-in-enter': {
  '0%':   { opacity: '0', transform: 'scale(0.92)' },
  '100%': { opacity: '1', transform: 'scale(1)' },
},
'zoom-out-exit': {
  '0%':   { opacity: '1', transform: 'scale(1)' },
  '100%': { opacity: '0', transform: 'scale(0.92)' },
},
'zoom-out-enter': {
  '0%':   { opacity: '0', transform: 'scale(1.08)' },
  '100%': { opacity: '1', transform: 'scale(1)' },
},
```

**New animations to add to `tailwind.config.js` animation object:**
```javascript
'zoom-in-exit':  'zoom-in-exit 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
'zoom-in-enter': 'zoom-in-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
'zoom-out-exit':  'zoom-out-exit 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
'zoom-out-enter': 'zoom-out-enter 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
```

**Transition Flow (L1 → L2):**
```
1. User clicks ZonePlate → emits { zoneId, originRect: getBoundingClientRect() }
2. useZoomNavigation.zoomToZone(zoneId, originRect) called
3. isTransitioning = true (pointer-events: none on all levels)
4. Level 1 gets CSS class → animation: zoom-in-exit (scale up + fade out, 250ms)
5. After 250ms: currentLevel = 2, selectedZoneId = zoneId, router.replace query
6. Level 2 gets CSS class → animation: zoom-in-enter (scale from 0.92 + fade in, 300ms)
7. After 300ms: isTransitioning = false, animation classes removed
```

**Transition Flow (Back: L2 → L1):**
```
1. User clicks breadcrumb "Dashboard" or presses Escape
2. useZoomNavigation.zoomOut() called
3. isTransitioning = true
4. Level 2 gets CSS class → animation: zoom-out-exit (scale down + fade out, 250ms)
5. After 250ms: currentLevel = 1, selectedZoneId = null, router.replace query
6. Level 1 gets CSS class → animation: zoom-out-enter (scale from 1.08 + fade in, 300ms)
7. After 300ms: isTransitioning = false
```

**CSS classes in DashboardView `<style scoped>`:**
```css
.zoom-level {
  display: none;
}

.zoom-level--active {
  display: block;
}

.zoom-level--exiting {
  display: block;
  pointer-events: none;
}

.zoom-level--entering {
  display: block;
}

/* Reduced motion: instant transition, no animation */
@media (prefers-reduced-motion: reduce) {
  .zoom-level--exiting,
  .zoom-level--entering {
    animation: none !important;
    transition: opacity 0.1s ease;
  }
}
```

### State Management — useZoomNavigation Composable

**File:** `src/composables/useZoomNavigation.ts`

```typescript
import { ref, computed, watch, nextTick, type Ref, type ComputedRef } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useEspStore } from '@/stores/esp'
import { useToast } from '@/composables/useToast'

export type ZoomLevel = 1 | 2 | 3

export interface UseZoomNavigationReturn {
  currentLevel: Ref<ZoomLevel>
  selectedZoneId: Ref<string | null>
  selectedDeviceId: Ref<string | null>
  isTransitioning: Ref<boolean>
  transitionDirection: Ref<'in' | 'out' | null>
  /** Computed CSS class for each level container */
  level1Class: ComputedRef<string>
  level2Class: ComputedRef<string>
  level3Class: ComputedRef<string>
  zoomToZone: (zoneId: string, originRect?: DOMRect) => void
  zoomToDevice: (deviceId: string, originRect?: DOMRect) => void
  zoomOut: () => void
}

export function useZoomNavigation(): UseZoomNavigationReturn {
  const router = useRouter()
  const route = useRoute()
  const espStore = useEspStore()
  const toast = useToast()

  const currentLevel = ref<ZoomLevel>(1)
  const selectedZoneId = ref<string | null>(null)
  const selectedDeviceId = ref<string | null>(null)
  const isTransitioning = ref(false)
  const transitionDirection = ref<'in' | 'out' | null>(null)
  const exitingLevel = ref<ZoomLevel | null>(null)
  const enteringLevel = ref<ZoomLevel | null>(null)

  // TRANSITION TIMING CONSTANTS
  const EXIT_DURATION = 250
  const ENTER_DURATION = 300

  // ... full implementation following the transition flow above
  // ... URL sync via watch(() => route.query)
  // ... Device deletion watcher
}
```

**Key implementation requirements:**
1. State initialized from URL query params on mount (`?zone=...&device=...`)
2. Every state change calls `router.replace()` to sync query params (NO pushState)
3. `watch(() => route.query)` reacts to browser back/forward
4. `zoomToDevice()` validates device still exists in `espStore.devices`
5. Transition timing: 250ms exit + 50ms buffer + 300ms enter = ~600ms total
6. `isTransitioning` blocks all click handlers during animation
7. Exposes computed CSS class strings for each level container

**Keyboard shortcut integration (in DashboardView.vue onMounted):**
```typescript
// Use existing useKeyboardShortcuts composable:
useKeyboardShortcuts([
  {
    key: 'Escape',
    handler: () => {
      if (zoomNav.currentLevel.value > 1 && !zoomNav.isTransitioning.value) {
        zoomNav.zoomOut()
      }
    },
    description: 'Zoom zurück zur Übersicht'
  }
])
```

#### Architecture Dependencies (useZoomNavigation)

> **Composable-Registrierung:** Muss in `composables/index.ts` exportiert werden:
> `export { useZoomNavigation } from './useZoomNavigation'`
> (Bestehende Composables: useModal, useSwipeNavigation, useZoneDragDrop, useToast,
> useWebSocket, useConfigResponse, useQueryFilters, useGpioStatus, useGrafana,
> useKeyboardShortcuts, useContextMenu)
>
> **Koexistenz mit `?openSettings=` Parameter:**
> - `/?openSettings=ESP_AB12CD` → Level 1 + Settings-Sheet (bestehendes Verhalten)
> - `/?zone=ID` → Level 2
> - `/?zone=ID&device=ID` → Level 3
> - `/?zone=ID&device=ID&openSettings=1` → Level 3 + Settings-Sheet

---

## ZoomBreadcrumb Component

**File:** `src/components/dashboard/ZoomBreadcrumb.vue`

Shows navigation path and allows click-to-navigate-up.

```
Level 1:  Dashboard
Level 2:  Dashboard  >  Gewaechshaus A
Level 3:  Dashboard  >  Gewaechshaus A  >  ESP_Temp_01
```

**Props:**
```typescript
interface ZoomBreadcrumbProps {
  level: ZoomLevel
  zoneName?: string
  deviceName?: string
}
```

**Emits:**
```typescript
interface ZoomBreadcrumbEmits {
  (e: 'navigate', level: ZoomLevel): void
}
```

**CSS:**
```css
.zoom-breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);            /* 12px */
  color: var(--color-text-muted);
  padding: var(--space-1) 0;
  margin-bottom: var(--space-3);
}

.zoom-breadcrumb__item {
  cursor: pointer;
  transition: color var(--transition-fast);
  white-space: nowrap;
}

.zoom-breadcrumb__item:hover {
  color: var(--color-accent-bright);
}

.zoom-breadcrumb__item--current {
  color: var(--color-text-primary);
  font-weight: 500;
  cursor: default;
}

.zoom-breadcrumb__separator {
  color: var(--color-text-muted);
  opacity: 0.5;
  font-size: var(--text-xs);
}
```

**Accessibility:**
```html
<nav aria-label="Zoom-Navigation">
  <ol role="list" class="zoom-breadcrumb">
    <li><button @click="emit('navigate', 1)">Dashboard</button></li>
    <li v-if="level >= 2" aria-hidden="true" class="zoom-breadcrumb__separator">›</li>
    <li v-if="level >= 2">
      <button
        :class="level === 2 ? 'zoom-breadcrumb__item--current' : 'zoom-breadcrumb__item'"
        @click="emit('navigate', 2)"
      >{{ zoneName }}</button>
    </li>
    <!-- Level 3 breadcrumb items ... -->
  </ol>
</nav>
```

---

## Drag & Drop

Uses `vue-draggable-plus` v0.6.x (already in `package.json:31`).

| Level | Drag Source | Drop Target | Action |
|-------|------------|-------------|--------|
| 1 | DeviceMiniCard | ZonePlate | Move device between zones |
| 2 | DeviceSummaryCard | SubzoneArea / UnassignedDropBar | Move between subzones or remove |
| 3 | ComponentSidebar items | SensorColumn / ActuatorColumn | Add sensor/actuator to device |

#### Architecture Dependencies (Drag & Drop)

> **Drag-Gruppe MUSS konsistent sein:** `group="esp-devices"` in:
> - `ZoneGroup.vue:448` (besteht weiterhin)
> - `UnassignedDropBar.vue:192` (bleibt)
> - `ZonePlate.vue` (NEU)
> - `ZoneDetailView.vue` (NEU)
>
> **Globaler Drag-State Store:** `useDragStateStore()` — alle neuen Komponenten reagieren
> auf `isAnyDragActive` für visuelles Feedback.
>
> **force-fallback:** ALLE VueDraggable-Container: `force-fallback="true"`.
>
> **Handle:** `handle=".esp-drag-handle"` — nur der Card-Header startet Drag.
>
> **Level 2 Subzone-Wechsel:** Eigene Drag-Logik — `subzonesApi.assignSubzone()`.
>
> **Level 3 Sensor/Actuator-Drag:** `application/json` dataTransfer via `dragStore.startSensorTypeDrag()`.

---

## Mobile & Responsive Strategy

**Breakpoints (existing tailwind config):**
- `< 640px` (mobile): Single-column, stacked cards
- `640-1024px` (tablet): 2-column zone/device grid
- `1024-1600px` (desktop): 3+ column auto-fit grid
- `> 1600px` (large): Auto-fit, wider minimum column widths (450px)

**Level 1 on Mobile:**
- ZonePlates stack vertically as full-width cards
- DeviceMiniCards: 2-per-row within ZonePlate (flex-wrap)
- Zone header: status text wraps below zone name
- Tap ZonePlate → zoom to Level 2

**Level 2 on Mobile:**
- DeviceSummaryCards stack vertically as full-width cards
- Breadcrumb: `‹ Gewaechshaus A` (chevron-left, truncated)
- Quick-action buttons: icon-only (no text labels)
- Swipe right → zoom out to Level 1 (uses existing `useSwipeNavigation`)

**Level 3 on Mobile:**
- 3-column layout → vertical stack: Header → Sensors → Chart → Actuators → GPIO
- Each section is a collapsible glass panel (touch-friendly 44px min target)
- Swipe right → zoom out to Level 2
- ComponentSidebar: hidden on mobile at all levels (too small for drag-drop)

**Touch gesture integration:**
```typescript
// In DashboardView.vue:
const { onSwipeRight } = useSwipeNavigation()
onSwipeRight(() => {
  if (zoomNav.currentLevel.value > 1 && !zoomNav.isTransitioning.value) {
    zoomNav.zoomOut()
  }
})
```

---

## Accessibility

**ARIA roles and labels:**
```html
<!-- ZonePlate -->
<article
  role="region"
  :aria-label="`Zone ${zoneName}: ${stats.online}/${stats.total} Geräte online`"
  tabindex="0"
  @keydown.enter="handleClick"
>

<!-- DeviceMiniCard / DeviceSummaryCard -->
<div
  role="button"
  :aria-label="`${device.name || deviceId}, Status: ${device.status}`"
  tabindex="0"
  @keydown.enter="handleClick"
>
```

**Focus management:**
- When zooming in: `nextTick(() => firstFocusable.focus())` on the new level's first element
- When zooming out: Focus returns to the breadcrumb of the parent level
- Tab order: breadcrumb → header → cards (natural DOM order)
- `aria-live="polite"` on status aggregation for screen reader updates

**Reduced motion:**
- `@media (prefers-reduced-motion: reduce)` disables zoom animations → instant opacity change
- Already specified in CSS above

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Zone/device not found (stale URL) | Fall back to Level 1 + toast "Gerät nicht mehr verfügbar" |
| WebSocket disconnect at Level 2/3 | Status indicators show stale state, data stays visible |
| Empty zone | Level 1: plate with "Keine Geräte". Level 2: EmptyState with drag hint |
| Device deleted while viewing L3 | Auto-navigate back to Level 2 + toast |
| Zone reassigned while viewing L2/L3 | Device verschwindet → zoomOut + Toast |
| API-Fehler bei Zone-Drag | `useZoneDragDrop` rollback via `espStore.fetchAll()` + Error-Toast |
| ESP geht offline während L3 | Status-Dot wechselt, data bleibt sichtbar |
| Rapid double-click on ZonePlate | `isTransitioning` ref blocks second click |

**Device-Removal Watcher (in useZoomNavigation):**
```typescript
watch(() => espStore.devices, (devices) => {
  if (currentLevel.value === 3 && selectedDeviceId.value) {
    const exists = devices.some(d => espStore.getDeviceId(d) === selectedDeviceId.value)
    if (!exists) {
      zoomOut()
      toast.warning('Gerät wurde entfernt')
    }
  }
}, { deep: false }) // shallow watch — espStore replaces array reference on fetchAll
```

#### Architecture Dependencies (Error Handling)

> **Toast-System:** `useToast()` aus `@/composables/useToast`.
> Varianten: `success()`, `error()`, `warning()`, `info()`.
>
> **Confirm-Dialog:** `uiStore.confirm({ title, message, variant, confirmText })`.
> Gibt `Promise<boolean>` zurück.
>
> **WebSocket-Reconnect:** `espStore.initWebSocket()` onConnect callback
> ruft `espStore.fetchAll()` auf → stellt nach Disconnect aktuellen State sicher.

---

## Performance Strategy

### v-show statt v-if/KeepAlive

```html
<!-- In DashboardView.vue template: All three levels always in DOM -->
<div v-show="zoomNav.currentLevel.value === 1" :class="zoomNav.level1Class.value">
  <!-- Level 1: Zone Overview -->
</div>
<div v-show="zoomNav.currentLevel.value === 2" :class="zoomNav.level2Class.value">
  <!-- Level 2: Zone Detail (only renders children when selectedZoneId is set) -->
</div>
<div v-show="zoomNav.currentLevel.value === 3" :class="zoomNav.level3Class.value">
  <!-- Level 3: Device Detail (only renders children when selectedDeviceId is set) -->
</div>
```

**Warum v-show statt v-if/KeepAlive:**
- `v-show` = `display: none` → kein Layout-Cost, keine Paint, kein Re-Mount
- Scroll-Positionen bleiben automatisch erhalten
- WebSocket-Handler bleiben verbunden
- Level 2/3 rendern ihre Kinder nur wenn Selection-Refs gesetzt sind (guard per v-if im Level-Container)

### Computed Caching

```typescript
// In DashboardView.vue — cached computeds for Level 2/3:
const zoneDevices = computed(() => {
  if (!zoomNav.selectedZoneId.value) return []
  return filteredEsps.value.filter(d => d.zone_id === zoomNav.selectedZoneId.value)
})

const selectedDevice = computed(() => {
  if (!zoomNav.selectedDeviceId.value) return null
  return espStore.devices.find(d =>
    espStore.getDeviceId(d) === zoomNav.selectedDeviceId.value
  ) ?? null
})

const selectedZoneName = computed(() => {
  if (!zoomNav.selectedZoneId.value) return ''
  const first = zoneDevices.value[0]
  return first?.zone_name || zoomNav.selectedZoneId.value
})
```

### Debouncing

- Zoom transitions: `isTransitioning` ref prevents rapid double-clicks (built into useZoomNavigation)
- Zone status aggregation: Efficient through Vue computed reactivity (no debounce needed)
- Sensor value updates on MiniCards: Already debounced by WebSocket batching on server side

### Lazy Loading

- Level 3 subcomponents (SensorColumn, ActuatorColumn, DeviceHeaderBar): Normal imports
  (NOT async) — they're small and frequently accessed
- `CrossEspConnectionOverlay`: `defineAsyncComponent()` — only needed when connections exist

---

## New Files

```
src/
  components/
    dashboard/
      ZonePlate.vue              <- Level 1: Zone as elevated glass plate (~200 lines)
      DeviceMiniCard.vue         <- Level 1: Compact device card (~100 lines)
      ZoomBreadcrumb.vue         <- Navigation breadcrumb for all levels (~80 lines)
    zones/
      ZoneDetailView.vue         <- Level 2: Zone detail with summary cards (~250 lines)
      DeviceSummaryCard.vue      <- Level 2: Medium device card (~180 lines)
      SubzoneArea.vue            <- Tinted subzone area (~60 lines)
    esp/
      DeviceDetailView.vue       <- Level 3: Full device detail layout (~300 lines)
      SensorColumn.vue           <- Extracted from ESPOrbitalLayout (~300 lines)
      ActuatorColumn.vue         <- Extracted from ESPOrbitalLayout (~250 lines)
      DeviceHeaderBar.vue        <- Extracted from ESPOrbitalLayout (~150 lines)
  composables/
    useZoomNavigation.ts         <- State + transition logic (~200 lines)
```

## Modified Files

| File | Change | Impact |
|------|--------|--------|
| `views/DashboardView.vue` | Major refactor: 3-level orchestration with v-show | ~90% rewritten |
| `composables/index.ts` | Add `useZoomNavigation` export | +1 line |
| `tailwind.config.js` | Add zoom keyframes + animations (4 keyframes, 4 animations) | +20 lines |
| `components/dashboard/ComponentSidebar.vue` | Add `v-show` prop controlled by parent | ~2 lines |

## Unchanged (verified)

- `espStore` (`stores/esp.ts`) — data layer stays the same (eigenständig, kein Wrapper)
- `logicStore` (`stores/logic.ts`) — re-export von `shared/stores/logic.store.ts`
- `useDragStateStore` — unchanged (`shared/stores/dragState.store.ts`)
- `useZoneDragDrop` composable — unchanged (Level 1 uses it for zone assignment)
- `ActionBar.vue` — stays at top, visible on all levels
- Rules Ribbon — stays at top, visible on all levels (currently inline in DashboardView template)
- `ESPSettingsSheet.vue` — still opens as slide-in from any level
- `ESPOrbitalLayout.vue` — untouched, stays in codebase as fallback during migration
- `UnassignedDropBar.vue` — visible on all levels (already fixed-position bottom)
- `PendingDevicesPanel.vue` — unchanged
- `CrossEspConnectionOverlay.vue` — unchanged, used on Level 3 only
- All backend code — purely frontend change
- All existing 1118+ Vitest tests — must still pass

#### Store Import Pattern

> **Neuer Code importiert von:**
> ```typescript
> import { useEspStore } from '@/stores/esp'         // eigenständig
> import { useDragStateStore } from '@/shared/stores' // shared
> import { useUiStore } from '@/shared/stores'         // shared
> ```

---

## WebSocket Events (Relevanz für Zoom)

| WS Event | Relevanz für Zoom |
|----------|-------------------|
| `esp_health` | Status auf allen Levels. L1: Aggregation. L2/L3: Status-Dot. |
| `sensor_data` | L1: MiniCard Key Values. L3: SensorColumn live values. |
| `actuator_status` | L3: ActuatorColumn state. |
| `actuator_alert` | L1/L2: Warning-Count. L3: Emergency stop. |
| `zone_assignment` | KRITISCH: Device wechselt Zone. L2: Device verschwindet/erscheint. |
| `subzone_assignment` | L2: SubzoneArea Gruppierung ändert sich. |
| `device_discovered` | ActionBar Badge (alle Levels). |
| `device_approved` | Device erscheint in Zone (alle Levels). |

---

## Communication Flows (Server-Zentrisch)

### Zone-Assignment Flow (Level 1 Drag-Drop)
```
User drags DeviceMiniCard to ZonePlate
  → ZonePlate.@device-dropped({ device, fromZoneId, toZoneId })
  → DashboardView.onDeviceDropped()
  → useZoneDragDrop.handleDeviceDrop()
  → zonesApi.assignZone(deviceId, { zone_id, zone_name })
  → POST /zone/devices/{deviceId}/assign
  → Server updates DB + publishes MQTT
  → WebSocket broadcast: zone_assignment
  → espStore → device.zone_id updated → Vue Reactivity → UI updates
```

### Sensor-Add Flow (Level 3 Drag-Drop)
```
User drags Sensor from ComponentSidebar onto SensorColumn
  → ComponentSidebar: dragStore.startSensorTypeDrag(payload)
  → SensorColumn: Drop detected via @drop + dataTransfer parse
  → Opens Add-Sensor-Modal with GpioPicker
  → User selects GPIO + confirms
  → espStore.addSensor(deviceId, config) → API-Call
  → espStore.fetchDevice(deviceId) → UI refreshes
```

---

## Testing Strategy

| Test Type | Target | Tool | Priority |
|-----------|--------|------|----------|
| Unit | `useZoomNavigation` (state, URL sync, transitions, device removal) | Vitest | P0 |
| Unit | `ZoomBreadcrumb` (rendering, click navigation) | Vitest + @vue/test-utils | P0 |
| Unit | `DeviceMiniCard` (rendering, status dot, sensor values) | Vitest + @vue/test-utils | P1 |
| Unit | `ZonePlate` (aggregation, subzone grouping, drag events) | Vitest + @vue/test-utils | P1 |
| Unit | `DeviceSummaryCard` (rendering, meta items, actions) | Vitest + @vue/test-utils | P1 |
| Integration | DashboardView 3-level navigation | Vitest + @vue/test-utils | P1 |
| Regression | All existing 1118+ tests pass | Vitest | P0 — Run before AND after |
| E2E | Full 3-level navigation with transitions | Playwright | P2 |

**Test file placement:** `ComponentName.test.ts` next to the component file.

**Mock-Pattern:** `vi.mock('@/stores/esp')` with `devices` ref containing test data.

---

## Implementation Sequence (Exakt ausführbar)

> Jede Phase ist ein eigenständiger, testbarer Schritt. Keine Phase hängt von einer
> späteren Phase ab. ESPOrbitalLayout bleibt während der gesamten Migration funktionsfähig.

### Phase 1: Fundament — useZoomNavigation + tailwind keyframes

**Erstellen:** `src/composables/useZoomNavigation.ts`
**Modifizieren:** `src/composables/index.ts` (+1 Export)
**Modifizieren:** `tailwind.config.js` (+4 keyframes, +4 animations)

**Implementierung:**
1. Alle Refs: `currentLevel`, `selectedZoneId`, `selectedDeviceId`, `isTransitioning`, `transitionDirection`
2. Computed CSS-Klassen: `level1Class`, `level2Class`, `level3Class`
3. URL-Sync: `watch(() => route.query)` liest `zone` + `device` Parameter beim Mount und bei Back/Forward
4. `zoomToZone(zoneId, originRect?)`: setzt Level 2, `router.replace({ query: { zone: zoneId } })`
5. `zoomToDevice(deviceId, originRect?)`: validiert Device existiert, setzt Level 3, pusht Query
6. `zoomOut()`: Level 3→2 oder 2→1, entfernt passende Query-Parameter
7. Transition-Timing: `setTimeout` Kette für exit→enter Sequenz
8. Device-Watcher: Device gelöscht während L3 → `zoomOut()` + Toast

**Tests:** `src/composables/useZoomNavigation.test.ts`
- State transitions: L1→L2→L3→L2→L1
- URL sync roundtrip: set state → check query, set query → check state
- zoomToDevice mit nicht-existierendem Device → bleibt auf aktuellem Level + Warning
- isTransitioning blockiert zoomToZone/zoomToDevice/zoomOut
- Device-Deletion Watcher triggers zoomOut

**Verifizierung:** `npx vitest run src/composables/useZoomNavigation.test.ts`

### Phase 2: UI Primitives — ZoomBreadcrumb + DeviceMiniCard

**Erstellen:**
- `src/components/dashboard/ZoomBreadcrumb.vue`
- `src/components/dashboard/DeviceMiniCard.vue`

**ZoomBreadcrumb:** Stateless. Props: `level`, `zoneName`, `deviceName`.
Rendert Breadcrumb-Items mit `›` Separator. Emittiert `navigate(level)`.
ARIA: `<nav aria-label="Zoom-Navigation">` mit `<ol role="list">`.

**DeviceMiniCard:** Props: `device`, `isMock`.
Rendert: Status-Dot (6px, color by status), Name (truncated), Mock/Real Badge,
1-2 Sensor-Values (from `device.sensors[0..1]`, `font-mono`).
Emittiert `click({ deviceId, originRect })`.
CSS class `.esp-drag-handle` auf dem Header für VueDraggable.

**Tests:**
- `src/components/dashboard/ZoomBreadcrumb.test.ts` — renders correct items per level, emits navigate
- `src/components/dashboard/DeviceMiniCard.test.ts` — renders status, values, mock/real badge

**Verifizierung:** `npx vitest run src/components/dashboard/ZoomBreadcrumb.test.ts src/components/dashboard/DeviceMiniCard.test.ts`

### Phase 3: Level 1 — ZonePlate

**Erstellen:** `src/components/dashboard/ZonePlate.vue`

**Implementierung:**
1. Glass-Panel Styling mit Status-Variante (healthy/warning/error)
2. Subzone-Gruppierung: `computed` das `devices` nach `device.subzone_id` gruppiert
3. DeviceMiniCards in `flex-wrap` Layout pro Subzone
4. VueDraggable: `group="esp-devices"`, `force-fallback="true"`, `handle=".esp-drag-handle"`
5. Click-Handler: `$event.currentTarget.getBoundingClientRect()` → emit `click({ zoneId, originRect })`
6. Status-Aggregation im Header (total, online, warnings computed)
7. Noise-overlay `::after` pseudo-element für Textur

**Tests:** `src/components/dashboard/ZonePlate.test.ts`
- Subzone grouping (devices with same subzone_id, devices without)
- Status aggregation (all online → healthy class, has warnings → warning class)
- Click emits zoneId + DOMRect
- Renders DeviceMiniCards for each device

**Verifizierung:** `npx vitest run src/components/dashboard/ZonePlate.test.ts`

### Phase 4: Level 2 — DeviceSummaryCard + SubzoneArea + ZoneDetailView

**Erstellen:**
- `src/components/zones/DeviceSummaryCard.vue`
- `src/components/zones/SubzoneArea.vue`
- `src/components/zones/ZoneDetailView.vue`

**DeviceSummaryCard:** Glass-Card mit Header (name, status, badge), Meta-Grid (2x2: sensor count,
actuator count, wifi signal, last heartbeat), Action-Buttons (heartbeat mock-only, settings).

**SubzoneArea:** Tinted background, dashed border, label, flex-wrap DeviceSummaryCards.

**ZoneDetailView:** Breadcrumb + Zone Header + SubzoneAreas + "Keine Subzone" Sektion.
Grid layout: `repeat(auto-fill, minmax(220px, 1fr))`.
Background: `var(--color-bg-secondary)`.

**Tests:**
- `src/components/zones/DeviceSummaryCard.test.ts` — renders meta items, actions, mock/real
- `src/components/zones/ZoneDetailView.test.ts` — renders subzone areas, emits device-click

**Verifizierung:** `npx vitest run src/components/zones/`

### Phase 5: Level 3 — ESPOrbitalLayout Decomposition

**Erstellen:**
- `src/components/esp/DeviceHeaderBar.vue`
- `src/components/esp/SensorColumn.vue`
- `src/components/esp/ActuatorColumn.vue`
- `src/components/esp/DeviceDetailView.vue`

**Extraktionsstrategie:**
1. `ESPOrbitalLayout.vue` LESEN (3,913 Zeilen) — NICHT modifizieren
2. Header-Sektion identifizieren → `DeviceHeaderBar` (Name-Edit, Status, WiFi, Zone-Badge, Actions)
3. Sensor-Rendering → `SensorColumn` (SensorSatellite Loop, Add-Sensor drop zone, Add-Sensor Modal)
4. Actuator-Rendering → `ActuatorColumn` (ActuatorSatellite Loop, Emergency Stop, Commands)
5. `DeviceDetailView`: 3-Column Grid (`grid-template-columns: 1fr 2fr 1fr`),
   imports DeviceHeaderBar + SensorColumn + AnalysisDropZone + ActuatorColumn
6. Jede Subkomponente bekommt nur die Props/Emits die sie braucht (nicht das gesamte ESPOrbitalLayout Interface)

**Tests:**
- `src/components/esp/DeviceDetailView.test.ts` — renders header + 3 columns with mock device

**Verifizierung:** `npx vitest run src/components/esp/DeviceDetailView.test.ts`

### Phase 6: Integration — DashboardView Refactor

**Modifizieren:** `src/views/DashboardView.vue` (Major Refactor)

**Schritte:**
1. Import `useZoomNavigation` + neue Komponenten (ZonePlate, ZoneDetailView, DeviceDetailView, ZoomBreadcrumb)
2. Initialisiere: `const zoomNav = useZoomNavigation()`
3. Behalte ALLE bestehenden refs und computeds (filterType, activeStatusFilters, etc.)
4. Füge hinzu: `zoneDevices`, `selectedDevice`, `selectedZoneName` computeds
5. Template: Drei `v-show`-Container mit `zoomNav.levelNClass` Bindings:
   - Level 1: ActionBar + Rules Ribbon + ZonePlate-Grid (ersetzt ZoneGroup-Loop)
   - Level 2: ZoomBreadcrumb + ZoneDetailView
   - Level 3: ZoomBreadcrumb + DeviceDetailView
6. `ComponentSidebar`: `v-show="zoomNav.currentLevel.value === 3"`
7. `UnassignedDropBar`: bleibt immer sichtbar (position: fixed)
8. Alle bestehenden Event-Handler bleiben (handleHeartbeat, handleDelete, etc.)
9. Neue Handler: `onZonePlateClick`, `onDeviceCardClick` → rufen `zoomNav.zoomToZone/Device`
10. Keyboard: Escape → `zoomNav.zoomOut()`
11. `onMounted()` / `onUnmounted()` Calls bleiben IDENTISCH
12. Entferne: ZoneGroup Import + Loop (ersetzt durch ZonePlate)
13. Behalte: ESPOrbitalLayout Import als NICHT-GENUTZT (wird erst in Phase 10 entfernt)

**KRITISCH:** Alle bestehenden Funktionalitäten müssen erhalten bleiben:
- Type/Status Filter (ActionBar)
- Create Mock ESP Modal
- Pending Devices Panel
- ESPSettingsSheet
- Cross-ESP Connection Toggle (nur auf Level 3 sichtbar)
- Rules Activity Ribbon (auf allen Levels)
- `?openSettings=` Query-Parameter Support

**Verifizierung:**
1. `npx vitest run` — alle 1118+ Tests müssen passieren
2. Manuell: Dashboard laden → Zones sehen → In Zone klicken → Devices sehen → In Device klicken → Full detail → Breadcrumb zurück → Escape zurück

### Phase 7: CSS Zoom Transitions + Polish

**Schritte:**
1. Zoom-Animationen in DashboardView `<style scoped>` verifizieren
2. Transition-Timing testen (250ms exit + 300ms enter)
3. Reduced-Motion testen: OS-Setting ändern → Animationen disabled
4. Mobile responsive CSS für alle drei Levels
5. Touch-Swipe-Back via `useSwipeNavigation`
6. Focus-Management: `nextTick(() => el.focus())` nach Zoom
7. Loading-Skeleton: Wenn espStore noch lädt und user direkt auf `/?zone=x` navigiert

### Phase 8: E2E Tests

**Erstellen:** Playwright E2E Tests für:
1. Lade Dashboard → Sehe ZonePlates
2. Klicke ZonePlate → Zoom to L2 → Sehe DeviceSummaryCards
3. Klicke DeviceSummaryCard → Zoom to L3 → Sehe Sensor/Actuator Columns
4. Klicke Breadcrumb "Dashboard" → Back to L1
5. Browser Back Button → navigiert korrekt
6. Escape-Key → zoomOut
7. Direct URL: `/?zone=ID&device=ID` → Springt direkt zu L3

> **WICHTIG:** ESPOrbitalLayout.vue bleibt während der gesamten Migration funktionsfähig.
> Erst wenn alle Tests bestehen, wird ESPOrbitalLayout aus DashboardView.vue entfernt.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| ESPOrbitalLayout Decomposition bricht Funktionalität | ESPOrbitalLayout bleibt unverändert. Neue Komponenten parallel gebaut. |
| 3,913-Zeilen Extraktion fehleranfällig | Jede Subkomponente isoliert getestet vor Integration. |
| Performance: 3 Levels gleichzeitig im DOM | v-show = display:none = keine Layout/Paint Kosten. |
| Drag-Drop Regression | Gleiche VueDraggable-Config (group, force-fallback, handle). |
| Mobile UX bei 3-Level-Tiefe | Swipe-Back + Breadcrumb + Escape. Breadcrumb IMMER sichtbar. |
| URL-Query-Konflikte | Koexistenz mit `?openSettings=` getestet in Phase 6. |
| Transition-Flicker bei langsamen Geräten | `will-change: transform, opacity` auf Zoom-Levels. Reduced-Motion Fallback. |
