# Auftrag: Uebersicht-Tab Aufwertung

**Ziel-Repo:** auto-one
**Agent:** `frontend-dev`
**Kontext:** Der Uebersicht-Tab (/hardware) funktioniert bereits gut. Das bestehende Layout (ZonePlate + DeviceMiniCard + UnassignedDropBar) bleibt erhalten und wird gezielt aufgewertet: bessere Actions, erklaerende Labels, bidirektionale Navigation zum Monitor.
**Prioritaet:** Mittel (nach Komponenten-Tab und Phase 4A)
**Datum:** 2026-03-02
**Verifiziert:** 2026-03-02 (verify-plan gegen Codebase)
**Status:** AUSFUEHRBAR — Bloecke U1-U3 eigenstaendig, U4-U5 haben externe Abhaengigkeiten

---

## ROBINS VORGABE (Verifikation 2026-03-02)

> "Das jetzige Interface ist nicht schlecht. Was hier vorgeschlagen wird, waere Refactoring."
> "ESP Cards behalten, Sensorwert-Zusammenfassungen duerfen so angezeigt werden."
> "Es soll zielgerichteter und erklaerenderender sein. MiniCards sollen Actions bieten."
> "Ideen in vorhandenes Layout einarbeiten, Design aufarbeiten, sinnvoll mit Monitor verbinden."

### Resultat: Kein Neubau, sondern Evolution

| Verworfen (alter Outline) | Stattdessen |
|---------------------------|-------------|
| System-Health-Banner (neue Sektion) | QAB uebernimmt Alert-Zusammenfassung (Phase 4A) |
| Infrastruktur-KPI-Karten (neue Sektion) | Zone-Header zeigt bereits ESP-Count + Online-Status |
| ZoneSummaryCard (neue Komponente, ersetzt ZonePlate) | **ZonePlate bleibt**, bekommt Zone-Context-Teaser |
| Handlungsbedarf-Sektion ("Needs Attention") | QAB + Notification Drawer (Phase 4A) |
| Quick-Navigation-Sektion | QAB Block 4A.6 hat MRU-Navigation + Favoriten |
| Sensor-Messwerte entfernen | **Sensor-Messwerte BLEIBEN** auf der Uebersicht |

---

## IST-Zustand (verifiziert 2026-03-02)

### ZonePlate.vue (881 Zeilen)

- **Pfad:** `El Frontend/src/components/dashboard/ZonePlate.vue`
- AccordionSection mit custom `#header` Slot
- Zone-Header: Zone-Name + Pencil-Edit + "X ESPs . X/Y Online" + Alert-Badge (⚠) + Monitor-Link (Activity-Icon) + Overflow-Menu
- Inline-Rename (Pencil→Input, Enter/Escape/Blur)
- Overflow: Umbenennen + Loeschen (via `uiStore.openContextMenu`)
- Emits: `update:isExpanded`, `device-dropped`, `device-click`, `settings`, `rename`, `delete`, `change-zone`, `device-delete`
- **Activity RouterLink** zu `{ name: 'monitor-zone', params: { zoneId } }` (Zeilen 379-386)
- **EmptyState** bei 0 Devices: "Keine Geraete zugewiesen" + DnD-Hinweis (Zeilen 454-462)
- Imports: `aggregateZoneSensors`, `formatAggregatedValue` aus `@/utils/sensorDefaults`

### DeviceMiniCard.vue (595 Zeilen)

- **Pfad:** `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
- ESPCardBase variant="mini" mit Custom-Slots
- **Gesamte Card ist klickbar** (→ emit `click` → HardwareView `zoomToDevice()` → Level 2 Orbital)
- **KEIN "Oeffnen"-Button** — Navigation erfolgt ueber Klick auf die gesamte Card
- **Header #actions Slot:** Settings-Gear-Button (→ emit `settings`)
- Status-Zeile: Dot + Text + "vor X Min." + Sensor-Count (Zeilen 225-236)
- Bis 4 Sensor-Zeilen: Typ-Icon + Label + Wert + Einheit — **KEINE Spark-Bars** (Zeile 243: Kommentar "no spark-bars")
- "+X weitere" bei >4 Sensoren (Zeilen 255-257)
- **Drill-Down-Bereich** (Zeilen 266-275): Overflow-Button (MoreVertical) + ChevronRight-Hint
- Context-Menu (via `uiStore.openContextMenu`, Zeilen 178-198): Konfigurieren, Zone aendern, Loeschen
- `qualityToValueColor()` (Zeilen 96-101): normal/warning/stale/unknown → CSS-Variablen
- Sensor-Labels kommen aus `groupSensorsByBaseType()` — zeigt bereits menschenlesbare Namen (z.B. "Temperatur" statt "sht31_temp")
- Emits: `click`, `settings`, `delete`, `change-zone`

### UnassignedDropBar.vue (598 Zeilen)

- **Pfad:** `El Frontend/src/components/dashboard/UnassignedDropBar.vue`
- "NICHT ZUGEWIESEN" Bar am unteren Rand
- Drop-Target fuer Zone-Unassignment via DnD

### HardwareView.vue (1345 Zeilen)

- **Pfad:** `El Frontend/src/views/HardwareView.vue`
- Haupt-View, rendert Level 1 (Zone Accordion) und Level 2 (ESP Orbital) basierend auf Route
- Routes: `/hardware` (L1), `/hardware/:zoneId` (L1 + auto-expand + scroll), `/hardware/:zoneId/:espId` (L2)
- **Auto-Expand + Scroll** bei `/hardware/:zoneId` (Zeilen 177-201): setzt Zone expanded, scrollt hin, ersetzt Route zu `/hardware`
- ESPSettingsSheet (1341 Zeilen): Geoeffnet via `settingsDevice` ref, NICHT ueber `dashStore`
- Breadcrumb-Sync zu `dashStore.breadcrumb` (Zeilen 416-434)
- `onDeviceCardClick()` (Zeile 455): Ruft `zoomToDevice()` → `router.push({ name: 'hardware-esp', params: { zoneId, espId } })`

### Breadcrumb-Infrastruktur (EXISTIERT)

- **TopBar.vue** (`El Frontend/src/shared/design/layout/TopBar.vue`): Route-basierte Breadcrumbs fuer Hardware + Monitor + Editor + Logic (Zeilen 85-140)
- **dashStore.breadcrumb** (`El Frontend/src/shared/stores/dashboard.store.ts:132-147`): State mit `level`, `zoneName`, `deviceName`, `sensorName`, `ruleName`, `dashboardName`
- Hardware-Breadcrumb: "Hardware > [Zone] > [Device]" — klickbar, navigiert zurueck
- Monitor-Breadcrumb: "Monitor > [Zone] > [Sensor/Dashboard]"
- KEINE separate Breadcrumb-Komponente noetig — TopBar rendert inline

### Sensor-Name-Mapping (EXISTIERT)

- **sensorDefaults.ts** (`El Frontend/src/utils/sensorDefaults.ts`): Vollstaendiges Mapping
- Jeder Sensor-Typ hat `label`-Feld: `sht31_temp` → "Temperatur", `sht31_humidity` → "Luftfeuchtigkeit" etc.
- `groupSensorsByBaseType()` liefert bereits menschenlesbare Labels an DeviceMiniCard
- DeviceMiniCard zeigt BEREITS `sensor.label` (nicht den technischen Namen)

### Router (verifiziert)

| Route | Name | View |
|-------|------|------|
| `/hardware` | `hardware` | HardwareView |
| `/hardware/:zoneId` | `hardware-zone` | HardwareView (auto-expand) |
| `/hardware/:zoneId/:espId` | `hardware-esp` | HardwareView (L2 Orbital) |
| `/monitor` | `monitor` | MonitorView |
| `/monitor/:zoneId` | `monitor-zone` | MonitorView (Zone-Detail) |
| `/monitor/:zoneId/sensor/:sensorId` | `monitor-sensor` | MonitorView (Sensor-Detail) |
| `/monitor/:zoneId/dashboard/:dashboardId` | `monitor-zone-dashboard` | MonitorView |

**Kein `?esp=` Query-Parameter** auf Monitor-Routes — muesste implementiert werden fuer ESP-Fokus.

---

## Ausfuehrbare Bloecke

### Reihenfolge & Abhaengigkeiten

```
U1 (Action Row) ──→ U3 (Monitor-Button-Navigation) ──→ U5 (Cross-Tab-Breadcrumbs)
                                                           ↑
U2 (Empty States) ── eigenstaendig                         │
U4 (Zone-Context) ── BLOCKIERT bis K3-API existiert ───────┘
```

**Empfohlene Reihenfolge:** U2 → U1 → U3 → U5 → U4 (wenn K3 da)

---

### Block U1: DeviceMiniCard Action Row neu gestalten

**Agent:** `frontend-dev`
**Datei:** `El Frontend/src/components/dashboard/DeviceMiniCard.vue`
**Aufwand:** ~2-3h

#### ROBIN-ENTSCHEIDUNG NOETIG

Welche Variante fuer die Action Row?

```
IST-Zustand (kein expliziter Button, ganze Card klickbar):
┌────────────────────────────────┐
│ ESP_472204           ⚙        │  ← Settings-Gear im Header
│ ● Online · 4S                  │
│ 🌡 Temperatur    22.1 °C      │
│ 💧 Luftfeucht.   58 %         │
│                    [⋮] [>]     │  ← Overflow + Chevron-Hint
└────────────────────────────────┘

Variante A (Icon-Buttons in expliziter Action Row):
┌────────────────────────────────┐
│ ESP_472204           ⚙        │
│ ● Online · 4S                  │
│ 🌡 Temperatur    22.1 °C      │
│ 💧 Luftfeucht.   58 %         │
│ [📊 Monitor] [⚙ Konfig] [⋮]  │  ← Neue Action Row
└────────────────────────────────┘

Variante B (Primary + Subtle Secondary):
┌────────────────────────────────┐
│ ESP_472204           ⚙        │
│ ● Online · 4S                  │
│ 🌡 Temperatur    22.1 °C      │
│ 💧 Luftfeucht.   58 %         │
│ [→ Monitor]        [⚙] [⋮]   │  ← Primary + Icon-Buttons
└────────────────────────────────┘
```

#### Implementierung (nach Robin-Entscheidung)

**Schritt 1: Action Row hinzufuegen**

In `DeviceMiniCard.vue` den Drill-Down-Bereich (Zeilen 266-275) ersetzen:

```vue
<!-- Aktuell (ersetzen): -->
<div class="device-mini-card__drill-down">
  <button class="device-mini-card__overflow-btn" ...>
    <MoreVertical ... />
  </button>
  <ChevronRight class="device-mini-card__chevron-hint" />
</div>

<!-- Neu (Action Row): -->
<div class="device-mini-card__actions" @click.stop>
  <button
    class="device-mini-card__action-btn device-mini-card__action-btn--primary"
    title="Im Monitor anzeigen"
    @click="handleMonitorNav"
  >
    <Activity :size="14" />
    <span>Monitor</span>
  </button>
  <button
    class="device-mini-card__action-btn"
    title="Konfigurieren"
    @click="handleSettings($event)"
  >
    <Settings2 :size="14" />
  </button>
  <button
    class="device-mini-card__overflow-btn"
    title="Weitere Aktionen"
    @click.stop="openCardMenu($event)"
  >
    <MoreVertical class="device-mini-card__overflow-icon" />
  </button>
</div>
```

**Schritt 2: Neuen Emit + Handler hinzufuegen**

```typescript
// Neuer Emit in defineEmits:
(e: 'monitor-nav', device: ESPDevice): void

// Neuer Handler:
function handleMonitorNav(event: MouseEvent) {
  event.stopPropagation()
  emit('monitor-nav', props.device)
}
```

**Schritt 3: HardwareView.vue Event-Handler**

In `HardwareView.vue` den neuen Event behandeln:

```typescript
// Neuer Handler (nach onDeviceCardClick, ca. Zeile 458):
function onDeviceMonitorNav(device: ESPDevice) {
  const zoneId = device.zone_id || 'unknown'
  router.push({ name: 'monitor-zone', params: { zoneId } })
}
```

Event-Binding an ZonePlate und DeviceMiniCard weiterleiten:
- ZonePlate.vue muss `monitor-nav` Event von DeviceMiniCard nach oben propagieren
- Alternativ: DeviceMiniCard navigiert direkt (per `useRouter()`) — einfacher, aber bricht das Pattern

**Schritt 4: Gesamte Card bleibt klickbar**

Die Card-Click-Navigation zu Level 2 Orbital BLEIBT bestehen. Die Action Row Buttons haben `@click.stop` um Bubble-Up zu verhindern.

**Schritt 5: CSS**

```css
.device-mini-card__actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-subtle);
  margin-top: auto;
}

.device-mini-card__action-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}

.device-mini-card__action-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.device-mini-card__action-btn--primary {
  color: var(--color-accent);
}

.device-mini-card__action-btn--primary:hover {
  background: color-mix(in srgb, var(--color-accent) 10%, transparent);
}
```

**Schritt 6: Context-Menu anpassen**

Context-Menu (Zeilen 178-198) reduzieren — "Konfigurieren" raus (jetzt in Action Row):

```typescript
uiStore.openContextMenu(rect.right, rect.bottom, [
  {
    id: 'change-zone',
    label: 'Zone ändern',
    icon: ArrowRightLeft,
    action: () => emit('change-zone', props.device),
  },
  {
    id: 'delete',
    label: 'Löschen',
    icon: Trash2,
    variant: 'danger',
    action: () => emit('delete', deviceId.value),
  },
])
```

**Verifizierung:**
- `npm run build` (TypeScript-Check)
- Visuell: Card zeigt Action Row mit Monitor + Konfig + Overflow
- Klick auf Card → Level 2 Orbital (unveraendert)
- Monitor-Button → navigiert zu Monitor-Zone
- Konfig-Button → oeffnet ESPSettingsSheet
- Overflow → Zone aendern, Loeschen

---

### Block U2: Empty States verbessern

**Agent:** `frontend-dev`
**Dateien:** `El Frontend/src/components/dashboard/ZonePlate.vue`, `El Frontend/src/components/dashboard/UnassignedDropBar.vue`
**Aufwand:** ~1h
**Abhaengigkeiten:** Keine — eigenstaendig ausfuehrbar

#### Schritt 1: ZonePlate EmptyState verbessern

Der EmptyState existiert bereits (Zeilen 454-462). Text anpassen:

```
Aktuell:
  title="Keine Geräte zugewiesen"
  description="Ziehe Geräte aus der Leiste unten in diese Zone"

Neu:
  title="Keine Geräte in dieser Zone"
  description="Weise ESPs über Drag & Drop zu — ziehe sie aus der Leiste unten oder aus einer anderen Zone."
```

In `ZonePlate.vue` Zeilen 455-461 anpassen:

```vue
<EmptyState
  v-if="devices.length === 0"
  :icon="PackageOpen"
  title="Keine Geräte in dieser Zone"
  description="Weise ESPs über Drag & Drop zu — ziehe sie aus der Leiste unten oder aus einer anderen Zone."
  :show-action="false"
  class="zone-plate__empty"
/>
```

#### Schritt 2: UnassignedDropBar visueller Hint

In `UnassignedDropBar.vue` einen Pulsing-Indicator hinzufuegen wenn unassigned ESPs vorhanden sind:

```vue
<!-- Badge mit Anzahl unassigned ESPs neben dem Titel -->
<span v-if="unassignedCount > 0" class="unassigned-drop-bar__badge">
  {{ unassignedCount }}
</span>
```

```css
.unassigned-drop-bar__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 var(--space-1);
  border-radius: var(--radius-full);
  background: var(--color-warning);
  color: var(--color-bg-primary);
  font-size: var(--text-xs);
  font-weight: 600;
  animation: animate-breathe 3s ease-in-out infinite;
}
```

**Verifizierung:**
- Zone ohne Geraete zeigt neuen EmptyState-Text
- UnassignedDropBar zeigt Badge mit Anzahl wenn ESPs vorhanden

---

### Block U3: DeviceMiniCard → Monitor Navigation

**Agent:** `frontend-dev`
**Dateien:** `El Frontend/src/views/HardwareView.vue`, `El Frontend/src/components/dashboard/ZonePlate.vue`
**Aufwand:** ~1-2h
**Abhaengigkeit:** Block U1 (Monitor-Button muss existieren)

#### Schritt 1: Event-Propagation durch ZonePlate

ZonePlate muss `monitor-nav` Event von DeviceMiniCard nach oben weiterleiten.

In `ZonePlate.vue`:

```typescript
// Emit hinzufuegen:
(e: 'monitor-nav', device: ESPDevice): void

// Handler:
function onDeviceMonitorNav(device: ESPDevice) {
  emit('monitor-nav', device)
}
```

Im Template wo DeviceMiniCard gerendert wird, Event binden:

```vue
<DeviceMiniCard
  :device="device"
  ...
  @monitor-nav="onDeviceMonitorNav"
/>
```

#### Schritt 2: HardwareView Handler

In `HardwareView.vue` (nach `onDeviceCardClick`, ca. Zeile 458):

```typescript
function onDeviceMonitorNav(device: ESPDevice) {
  const zoneId = device.zone_id
  if (zoneId) {
    router.push({ name: 'monitor-zone', params: { zoneId } })
  }
}
```

Event-Binding an ZonePlate:

```vue
<ZonePlate
  ...
  @monitor-nav="onDeviceMonitorNav"
/>
```

#### Schritt 3: ZonePlate Activity-Link aufwerten

Der bestehende Activity-Link (Zeilen 379-386) ist nur ein kleines Icon. Optional: Tooltip verbessern.

```vue
<!-- Aktuell: -->
<RouterLink
  :to="{ name: 'monitor-zone', params: { zoneId: zoneId } }"
  class="zone-plate__monitor-link"
  title="Im Monitor öffnen"
  @click.stop
>
  <Activity class="zone-plate__monitor-icon" />
</RouterLink>
```

Text "Aktivität" als Label neben dem Icon zeigen wenn Platz vorhanden (responsive):

```vue
<RouterLink
  :to="{ name: 'monitor-zone', params: { zoneId: zoneId } }"
  class="zone-plate__monitor-link"
  title="Zone im Monitor anzeigen"
  @click.stop
>
  <Activity class="zone-plate__monitor-icon" />
  <span class="zone-plate__monitor-label">Monitor</span>
</RouterLink>
```

```css
.zone-plate__monitor-label {
  font-size: var(--text-xs);
  display: none;
}

@media (min-width: 768px) {
  .zone-plate__monitor-label {
    display: inline;
  }
}
```

**Verifizierung:**
- Monitor-Button in DeviceMiniCard → navigiert zu `/monitor/:zoneId`
- Activity-Link in ZonePlate → zeigt "Monitor" Label ab 768px
- Breadcrumb in TopBar zeigt korrekt "Monitor > [Zone]" nach Navigation

---

### Block U4: Zone-Context-Teaser (BLOCKIERT)

**Agent:** `frontend-dev`
**Datei:** `El Frontend/src/components/dashboard/ZonePlate.vue`
**Aufwand:** ~2-3h
**BLOCKIERT bis:** Komponenten-Tab Auftrag Block K3 (`/v1/zone/{zone_id}/context` API) existiert

#### ROBIN-ENTSCHEIDUNG NOETIG

Umfang des Zone-Context-Teasers:
- **Minimal:** Sorte + Phase (1 Zeile)
- **Erweitert:** Sorte + Phase + Woche (1 Zeile)
- **Voll:** Sorte + Phase + Woche + Substrat (evtl. 2 Zeilen)

#### Konzept (ausfuehren wenn K3 existiert)

Zone-Header bekommt eine Unterzeile mit Context-Daten:

```
v  Zone: Echt       1 ESP . 0/1 Online . ⚠ 0    Monitor
   White Widow · Blüte · Woche 6
```

**Implementierung:**

In ZonePlate.vue, nach dem Zone-Header-Content (nach Zeile 396):

```vue
<!-- Zone Context Teaser (only if context data available) -->
<div v-if="zoneContext" class="zone-plate__context-teaser">
  <span v-if="zoneContext.strain">{{ zoneContext.strain }}</span>
  <span v-if="zoneContext.phase" class="zone-plate__context-sep">· {{ zoneContext.phase }}</span>
  <span v-if="zoneContext.week" class="zone-plate__context-sep">· Woche {{ zoneContext.week }}</span>
</div>
```

**Datenquelle:** Noch zu definieren (K3-API). Prop oder Store-basiert — Pattern wird von K3-Implementierung bestimmt.

**Nicht implementierbar bis:** `/v1/zone/{zone_id}/context` API + Frontend-Store existieren.

---

### Block U5: Cross-Tab Breadcrumb-Navigation

**Agent:** `frontend-dev`
**Dateien:** `El Frontend/src/shared/design/layout/TopBar.vue`, `El Frontend/src/views/MonitorView.vue`
**Aufwand:** ~2-3h
**Abhaengigkeit:** Keine (nutzt bestehende Breadcrumb-Infrastruktur)

#### Schritt 1: Monitor → Hardware Cross-Link

In `TopBar.vue` (Zeilen 102-122): Die Monitor-Breadcrumbs haben bereits "Monitor > [Zone]". Fehlend: Cross-Link zu Hardware.

Idee: Wenn User in Monitor ist, den Zone-Breadcrumb-Eintrag mit einem Hardware-Link ergaenzen — oder ein kleines Icon neben dem Zone-Name das zu `/hardware/:zoneId` navigiert.

**Option A: Breadcrumb-Eintrag ergaenzen**

Im Monitor-Breadcrumb den Zone-Eintrag doppelt verlinken:
- Klick auf Zone-Name → bleibt `/monitor/:zoneId` (Standard)
- Kleines Hardware-Icon daneben → `/hardware/:zoneId` (Cross-Link)

```vue
<!-- In TopBar.vue, im Monitor-Breadcrumb-Bereich: -->
<template v-if="isMonitorRoute && route.params.zoneId">
  <RouterLink
    :to="`/hardware/${route.params.zoneId}`"
    class="header__cross-link"
    title="In der Übersicht anzeigen"
  >
    <LayoutGrid :size="12" />
  </RouterLink>
</template>
```

**Option B: Separate "Zurueck zur Uebersicht"-Aktion**

Einfacher: Im Monitor L2 einen Link "Zur Übersicht" im Header oder Toolbar.

#### Schritt 2: Hardware → Monitor schon bestehend

Bereits vorhanden:
- ZonePlate Activity-Icon → `/monitor/:zoneId` (Zeilen 379-386)
- DeviceMiniCard Monitor-Button (nach Block U1) → `/monitor/:zoneId`

#### Schritt 3: Komponenten-Tab Cross-Links (OPTIONAL)

Erst ausfuehrbar wenn Komponenten-Tab mit InventoryTable (Block K1) implementiert ist. Hier nur Platzhalter.

**Verifizierung:**
- Von Monitor-Zone: Cross-Link zu Hardware zeigt Zone expanded
- Von Hardware-Zone: Activity-Link zeigt Zone im Monitor
- Breadcrumbs in TopBar konsistent bei Cross-Tab-Navigation

---

## Was NICHT in diesem Auftrag passiert

| Was | Warum nicht | Wo stattdessen |
|-----|-------------|----------------|
| System-Health-Aggregation | QAB + Alert Center (Phase 4B) decken das ab | Phase 4B |
| KPI-Dashboard-Widgets | Editor-Tab hat eigene DnD-Widgets | Eigener Auftrag |
| Alert-Liste auf der Uebersicht | QAB + Notification Drawer | Phase 4A Bloecke 4A.4-4A.6 |
| DnD-Verbesserungen | Eigener Auftrag (Redesign Block 4-7) | `auftrag-uebersicht-tab-redesign.md` Bloecke 4-7 |
| Neues Layout/Grid | Bestehendes Accordion-Layout bleibt | Kein Auftrag noetig |
| Per-Sensor Status-Labels "(OK)/(Warnung)" | Braucht Threshold-Daten aus Phase 4A Block 4A.7 | Block 4A.7 als Voraussetzung |
| Sensor-Name-Mapping | **Bereits implementiert** — `sensorDefaults.ts` hat vollstaendiges Label-System | Kein Auftrag noetig |

---

## Abgrenzung zu bestehenden Auftraegen

| Auftrag | Repo-Pfad | Ueberschneidung |
|---------|-----------|-----------------|
| Uebersicht-Tab Redesign (Bloecke 0-2 ERLEDIGT) | `.claude/reports/current/auftrag-uebersicht-tab-redesign.md` | Bloecke 3-7 OFFEN (DnD, Config). Dieser Auftrag aendert NUR Actions + Labels + Navigation |
| Monitor-Navigation | `.claude/reports/current/auftrag-monitor-navigation-und-verlinkungen.md` | Block U5 hier ERSETZT Block 2 von Monitor-Navigation (umfassender) |
| Komponenten-Tab | `.claude/reports/current/auftrag-komponenten-tab-wissensinfrastruktur.md` | K3 (Zone-Context) ist Voraussetzung fuer Block U4 |
| Phase 4A Notification-Stack | `.claude/reports/current/auftrag-phase4a-notification-stack.md` | Block 4A.7 (Per-Sensor-Alert-Config) ist Voraussetzung fuer zukuenftiges Status-Label-Feature |

---

## Offene Robin-Entscheidungen

| # | Frage | Optionen | Block |
|---|-------|----------|-------|
| 1 | Action-Button-Layout | Variante A (3 gleichwertige Icon-Buttons) vs. Variante B (Primary "Monitor" + sekundaere Icons) | U1 |
| 2 | Zone-Context-Teaser-Umfang | Minimal (Sorte + Phase) vs. Erweitert (+ Woche) vs. Voll (+ Substrat) | U4 |

### Bereits durch Codebase-Analyse beantwortet

| Frage aus Outline | Antwort |
|-------------------|---------|
| Existiert Sensor-Name-Mapping `sht31_temp` → "Temperatur"? | **JA** — `sensorDefaults.ts` hat vollstaendiges Label-System. DeviceMiniCard zeigt bereits menschenlesbare Labels |
| Existiert eine Breadcrumb-Komponente? | **JA** — Inline in `TopBar.vue` (Zeilen 85-140) + State in `dashStore.breadcrumb`. Keine separate Komponente noetig |
| Query-Parameter fuer Cross-Tab-Navigation? | **NICHT NOETIG** — `/hardware/:zoneId` Route existiert bereits mit auto-expand + scroll (HardwareView Zeilen 177-201). Kein `?zone=&expanded=` noetig |
| Monitor-Navigation-Ziel? | Monitor-Button navigiert zu `/monitor/:zoneId` (Zone-Ebene). ESP-spezifischer Fokus (`?esp=`) existiert NICHT im MonitorView und waere Zusatzaufwand — erstmal Zone-Ebene reicht |

---

## Zusammenfassung fuer Agent-Ausfuehrung

```
Block U2 (Empty States)       → Eigenstaendig, ~1h, SOFORT ausfuehrbar
Block U1 (Action Row)         → Braucht Robin-Entscheidung Variante A/B, ~2-3h
Block U3 (Monitor-Navigation) → Abhaengig von U1, ~1-2h
Block U5 (Cross-Tab Breadcrumbs) → Eigenstaendig, ~2-3h
Block U4 (Zone-Context)       → BLOCKIERT bis K3-API, ~2-3h

Gesamt: ~8-12h (nach Robin-Entscheidungen)
```

**Agent-Befehl-Template:**

```
KONTEXT: Uebersicht-Tab Aufwertung, Block U[X].
AUFTRAG: [Beschreibung aus Block]
DATEIEN: [Exakte Pfade aus Block]
PATTERN: Bestehende Patterns in DeviceMiniCard/ZonePlate erweitern.
         CSS: Design Tokens aus tokens.css. Icons: lucide-vue-next.
         Events: emit Pattern + uiStore.openContextMenu Pattern beibehalten.
VERIFIZIERUNG: npm run build + visueller Check
OUTPUT: Kurzer Bericht was geaendert wurde
```
