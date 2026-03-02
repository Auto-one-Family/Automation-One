# Auftrag: Monitor Tab-Navigation + Korrekte Verlinkungen

> **Typ:** Frontend-Fix (reine UX-Verbesserung)
> **Prioritaet:** HOCH — sofort spuerbare UX-Verbesserung, klein, unabhaengig
> **Geschaetzter Aufwand:** ~4-6 Stunden (3 Bloecke)
> **Betroffene Schichten:** NUR El Frontend
> **Erstellt:** 2026-03-02
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Voraussetzungen:** Keine — kann sofort umgesetzt werden
> **Branch:** `fix/monitor-navigation-links`

---

## Kontext

MonitorView L2 (`/monitor/:zoneId`) hat **keinen direkten Zone-Wechsel**. Um von Zone "Test" zu Zone "Testneu" zu wechseln: 2 Klicks + 2 Route-Wechsel ("Zurueck" → L1 → Zone auswaehlen → L2). Das sollte 1 Klick/Swipe/Taste sein.

Zusaetzlich gibt es systemweit **inkonsistente Cross-Tab-Navigation**: Links zwischen Uebersicht, Monitor und Komponenten fuehren nicht immer zum richtigen Ziel oder fehlen ganz.

---

## IST-Zustand (verifiziert via Playwright)

### Monitor L2 Navigation
- **"← Zurueck"-Button** oben links — einzige Navigation zurueck zu L1
- **Kein Prev/Next** — kein Zone-Wechsel auf L2-Ebene
- **Kein Keyboard-Support** — ArrowLeft/ArrowRight nicht registriert
- **Kein Swipe-Support** — `useSwipeNavigation.ts` existiert, wird aber NICHT in MonitorView genutzt
- **Zone-Liste ist sortiert** — `zoneKPIs` Computed (Z832-906) liefert geordnete Zone-IDs

### Cross-Tab Verlinkungen
> **[KORREKTUR]** ZonePlate ist ein **Accordion** (expand/collapse) — Zone-Klick navigiert NICHT zu einer Route, sondern klappt die Zone auf/zu. Es gibt keinen Route-Wechsel bei Klick. HardwareView selbst hat eine Zone-Detail-Route (`/hardware/:zoneId`), aber ZonePlate togglet nur den Accordion.
- **Uebersicht → Monitor:** Kein direkter Link von ZonePlate (Accordion) zum Monitor — muss erst hinzugefuegt werden
- **Monitor L2 → Komponenten:** Kein Link von Sensor in MonitorView zum Sensor im Komponenten-Tab
- **Komponenten → Monitor:** Kein Link vom Sensor-Inventar zur Live-Ansicht im Monitor
- **Monitor L1 → Monitor L2:** Funktioniert (Zone-Card-Klick)
- **Monitor L2 → L3 SlideOver:** Funktioniert (Sensor-Card-Klick)

---

## Block 1: Zone-zu-Zone-Navigation auf L2 (~2-3h)

### 1.1 Computed fuer Prev/Next Zone

**Datei:** `El Frontend/src/views/MonitorView.vue` (Script-Bereich)

Basis: `zoneKPIs` Computed (Z832-906) liefert bereits eine sortierte Liste aller Zonen mit KPI-Daten. Daraus lassen sich Prev/Next trivial ableiten.

```typescript
// Neue Computeds — direkt nach zoneKPIs
const sortedZoneIds = computed(() => zoneKPIs.value.map(z => z.zoneId))

const currentZoneIndex = computed(() => {
  if (!selectedZoneId.value) return -1
  return sortedZoneIds.value.indexOf(selectedZoneId.value)
})

// [KORREKTUR] NICHT `prevZoneId` nennen — Z1078 existiert bereits:
//   `const prevZoneId = ref<string | null>(null)` (Accordion-State-Tracking)
// Umbenennen zu `prevNavZoneId` / `nextNavZoneId` um Konflikt zu vermeiden.
const prevNavZoneId = computed(() => {
  const idx = currentZoneIndex.value
  return idx > 0 ? sortedZoneIds.value[idx - 1] : null
})

const nextNavZoneId = computed(() => {
  const idx = currentZoneIndex.value
  return idx >= 0 && idx < sortedZoneIds.value.length - 1
    ? sortedZoneIds.value[idx + 1]
    : null
})

const zonePositionLabel = computed(() => {
  if (currentZoneIndex.value < 0) return ''
  return `${currentZoneIndex.value + 1}/${sortedZoneIds.value.length}`
})
```

### 1.2 Navigations-Funktionen

```typescript
// [KORREKTUR] prevNavZoneId / nextNavZoneId statt prevZoneId / nextZoneId
function goToPrevZone() {
  if (prevNavZoneId.value) {
    router.replace({
      name: 'monitor-zone',
      params: { zoneId: prevNavZoneId.value }
    })
  }
}

function goToNextZone() {
  if (nextNavZoneId.value) {
    router.replace({
      name: 'monitor-zone',
      params: { zoneId: nextNavZoneId.value }
    })
  }
}
```

**WICHTIG:** `router.replace()` statt `router.push()` — Zone-Wechsel soll NICHT den Browser-History-Stack aufblaehen. Zurueck-Button fuehrt weiterhin zu L1, nicht durch alle besuchten Zonen.

### 1.3 Keyboard-Shortcuts registrieren

**Datei:** `El Frontend/src/views/MonitorView.vue`

`useKeyboardShortcuts.ts` ist bereits ein Singleton-Registry mit Scope-System.

> **[KORREKTUR] API ist anders als angenommen:**
> - `register(shortcut)` gibt eine **Unregister-Funktion `() => void`** zurueck — es gibt KEIN `unregister(key, scope)`!
> - Scopes muessen explizit via `activateScope(scope)` / `deactivateScope(scope)` aktiviert werden.
> - API: `const { register, activateScope, deactivateScope } = useKeyboardShortcuts()`

```typescript
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const { register, activateScope, deactivateScope } = useKeyboardShortcuts()

// Unregister-Funktionen speichern
let unregisterLeft: (() => void) | null = null
let unregisterRight: (() => void) | null = null

// Registrierung im L2-Modus (wenn selectedZoneId gesetzt)
watch(selectedZoneId, (zoneId) => {
  if (zoneId) {
    activateScope('monitor-zone')
    unregisterLeft = register({
      key: 'ArrowLeft',
      handler: goToPrevZone,
      description: 'Vorherige Zone',
      scope: 'monitor-zone'
    })
    unregisterRight = register({
      key: 'ArrowRight',
      handler: goToNextZone,
      description: 'Naechste Zone',
      scope: 'monitor-zone'
    })
  } else {
    deactivateScope('monitor-zone')
    unregisterLeft?.()
    unregisterRight?.()
    unregisterLeft = null
    unregisterRight = null
  }
})

onUnmounted(() => {
  deactivateScope('monitor-zone')
  unregisterLeft?.()
  unregisterRight?.()
})
```

### 1.4 Swipe-Navigation binden

**Datei:** `El Frontend/src/views/MonitorView.vue`

`useSwipeNavigation.ts` existiert bereits (nutzt `@vueuse/core` `useSwipe` intern).

> **[KORREKTUR] API hat KEIN `enabled` Parameter!**
> Signatur: `useSwipeNavigation(element: Ref<HTMLElement | null>, options: { threshold?, onSwipeLeft?, onSwipeRight?, onSwipeUp?, onSwipeDown?, preventDefault? })`
> L2-only Aktivierung: `ref` nur auf den L2-Container setzen (ist nur im DOM wenn `selectedZoneId` gesetzt). Alternativ: Callbacks mit Guard wrappen.

```typescript
import { useSwipeNavigation } from '@/composables/useSwipeNavigation'

const monitorContentRef = ref<HTMLElement | null>(null)

// Swipe nur auf L2-Container (ref nur im L2-Template gesetzt)
// Guard in Callbacks fuer zusaetzliche Sicherheit:
useSwipeNavigation(monitorContentRef, {
  onSwipeLeft: () => { if (selectedZoneId.value) goToNextZone() },
  onSwipeRight: () => { if (selectedZoneId.value) goToPrevZone() },
  threshold: 50
})
```

**Template:** `ref="monitorContentRef"` auf den L2-Content-Container setzen (innerhalb des `v-else` Blocks bei Z1332).

### 1.5 Template: Navigations-Pfeile im L2-Header

**Datei:** `El Frontend/src/views/MonitorView.vue` (Template-Bereich, ca. Z1334)

Bestehender "← Zurueck"-Button wird um Zone-Navigation ergaenzt:

```
Vorher:
┌────────────────────────────────────────┐
│ ← Zurueck                              │
│                                        │
│ [Zone-Content L2]                      │
└────────────────────────────────────────┘

Nachher:
┌────────────────────────────────────────┐
│ ← Zurueck        ‹ Test (1/2) ›       │
│                                        │
│ [Zone-Content L2]                      │
└────────────────────────────────────────┘
```

**Implementation:**

> **[KORREKTUR]** Bestehende Header-Klasse ist `monitor-view__header` (Z1333, CSS Z1807), NICHT `monitor-view__l2-header`.
> ArrowLeft nutzt `class="w-4 h-4"` (Tailwind), NICHT `:size="18"` — bestehendes Pattern beibehalten.
> `ChevronLeft` ist NICHT importiert — MonitorView importiert aber bereits `ChevronDown`, `ChevronUp`, `ChevronRight` (Z55).
> `ChevronLeft` muss zum Import hinzugefuegt werden (Z29/54).
> `prevZoneId`/`nextZoneId` → `prevNavZoneId`/`nextNavZoneId` (Namenskonflikt, siehe 1.1).
> Statt `getZoneName()` (existiert nicht) nutze `selectedZoneName` fuer aktuelle Zone; fuer Prev/Next-Tooltip eigene Helper-Fn oder inline.

```html
<!-- [KORREKTUR] Bestehenden monitor-view__header erweitern (Z1333-1353), NICHT ersetzen -->
<div class="monitor-view__header">
  <button class="monitor-view__back" @click="goBack">
    <ArrowLeft class="w-4 h-4" />
    <span>Zurück</span>
  </button>

  <!-- NEU: Zone-Navigation einfuegen -->
  <div class="monitor-view__zone-nav" v-if="selectedZoneId">
    <button
      class="monitor-view__zone-nav-btn"
      :disabled="!prevNavZoneId"
      @click="goToPrevZone"
    >
      <ChevronLeft class="w-4 h-4" />
    </button>

    <span class="monitor-view__zone-nav-label">
      {{ selectedZoneName }} ({{ zonePositionLabel }})
    </span>

    <button
      class="monitor-view__zone-nav-btn"
      :disabled="!nextNavZoneId"
      @click="goToNextZone"
    >
      <ChevronRight class="w-4 h-4" />
    </button>
  </div>

  <!-- Bestehende header-info BLEIBT (Z1338-1352) -->
  <div class="monitor-view__header-info">
    ...
  </div>
</div>
```

**CSS:**

> **[KORREKTUR] CSS-Variablen waren ALLE falsch.** tokens.css nutzt `--space-*` (NICHT `--spacing-*`), `--text-sm` (NICHT `--font-size-sm`).
> `--spacing-2xs` existiert gar nicht. Bestehende Header-CSS (Z1807) nutzt bereits `--space-3` als gap.
> transition: bestehender Code nutzt `var(--transition-fast)` statt hardcoded `0.15s`.

```css
/* NICHT .monitor-view__l2-header — bestehender .monitor-view__header (Z1807) erweitern */
/* .monitor-view__header hat bereits: display:flex, align-items:center, gap:var(--space-3) */
/* → nur justify-content ergaenzen: */
.monitor-view__header {
  justify-content: space-between; /* NEU — ergaenzt bestehendes flex Layout */
}

.monitor-view__zone-nav {
  display: flex;
  align-items: center;
  gap: var(--space-xs);           /* war: --spacing-xs */
}

.monitor-view__zone-nav-btn {
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
  padding: var(--space-xs);       /* war: --spacing-xs */
  cursor: pointer;
  color: var(--color-text-primary);
  transition: all var(--transition-fast);  /* war: 0.15s ease */
}

.monitor-view__zone-nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.monitor-view__zone-nav-btn:not(:disabled):hover {
  background: var(--color-surface-hover);
  border-color: var(--glass-border-hover);
}

.monitor-view__zone-nav-label {
  font-size: var(--text-sm);      /* war: --font-size-sm */
  color: var(--color-text-secondary);
  min-width: 80px;
  text-align: center;
}
```

### Verifikation Block 1

- [ ] Prev/Next-Buttons sichtbar auf L2, korrekt disabled bei erster/letzter Zone
- [ ] Klick auf Prev/Next wechselt Zone ohne Browser-History-Stack aufzublaehen
- [ ] ArrowLeft/ArrowRight wechseln Zone auf L2, haben KEINE Wirkung auf L1
- [ ] Swipe links/rechts auf L2-Content wechselt Zone (Touch + Mouse)
- [ ] Position-Label zeigt korrekt "Test (1/2)" bzw. "Testneu (2/2)"
- [ ] Zurueck-Button funktioniert weiterhin (zurueck zu L1)
- [ ] Keyboard-Shortcuts werden bei L1-Wechsel deregistriert (kein Leak)

---

## Block 2: Cross-Tab Verlinkungen (~1-2h)

### 2.1 Uebersicht → Monitor Quick-Link

**Datei:** `El Frontend/src/components/dashboard/ZonePlate.vue`

> **[KORREKTUR]** ZonePlate hat Props `zoneId` und `zoneName` (NICHT `zone.id`).
> ZonePlate ist ein Accordion (expand/collapse), KEIN Router-Link.
> `Activity` Icon ist NICHT importiert — muss zu den lucide-vue-next Imports hinzugefuegt werden (Z24).
> `router-link` benoetigt `useRouter` Import (aktuell nicht in ZonePlate).
> Alternativ: `RouterLink` Komponente (auto-registered by Vue Router).
> ZonePlate Header (Z320-350): ChevronDown, ZoneName (editable), Pencil, Stats, MoreVertical.

Im Zone-Header einen "Monitor"-Button hinzufuegen der direkt zur Monitor-Zone-Ansicht navigiert:

```html
<RouterLink
  :to="{ name: 'monitor-zone', params: { zoneId: zoneId } }"
  class="zone-plate__monitor-link"
  title="Im Monitor oeffnen"
  @click.stop
>
  <Activity :size="14" />
</RouterLink>
```

**Position:** Rechts im Zone-Header (Z320-350), nach den Status-Badges, vor dem MoreVertical-Button.
**WICHTIG:** `@click.stop` verhindert dass der Accordion-Toggle ausgeloest wird.

**CSS:** Subtle Icon-Button, gleicher Stil wie bestehende Header-Actions.

### 2.2 Monitor L2 → Komponenten-Tab Link

**Datei:** `El Frontend/src/views/MonitorView.vue` (L2 Sensor-Card-Bereich)

Bei jedem Sensor in der Monitor-L2-Ansicht einen kleinen "Info"-Button der zum Komponenten-Tab navigiert und dort den Sensor fokussiert:

```html
<router-link
  :to="{ name: 'sensors', query: { focus: sensor.id } }"
  class="sensor-card__component-link"
  title="Hardware-Details anzeigen"
>
  <Settings :size="12" />
</router-link>
```

**ACHTUNG:** Der Komponenten-Tab (`/sensors`) muss einen `focus` Query-Parameter unterstuetzen der den entsprechenden Sensor scrollt/highlighted. Aktuell existiert das NICHT — muss als Teil dieses Blocks implementiert werden:

```typescript
// In SensorsView.vue
const route = useRoute()

onMounted(() => {
  const focusId = route.query.focus as string
  if (focusId) {
    nextTick(() => {
      const el = document.getElementById(`sensor-${focusId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('sensor-row--highlighted')
        setTimeout(() => el.classList.remove('sensor-row--highlighted'), 3000)
      }
    })
  }
})
```

### 2.3 Komponenten → Monitor Quick-Link

**Datei:** `El Frontend/src/views/SensorsView.vue` (Sensor-Tabelle/Card)

Jeder Sensor/Aktor im Komponenten-Tab bekommt einen "Live"-Button der zur Monitor-Ansicht navigiert:

```html
<router-link
  :to="{ name: 'monitor-zone', params: { zoneId: sensor.zone_id } }"
  class="sensor-row__monitor-link"
  title="Live-Monitoring anzeigen"
>
  <Activity :size="12" />
</router-link>
```

**Nur anzeigen wenn `sensor.zone_id` gesetzt ist** — nicht-zugewiesene Sensoren haben keinen Monitor-Link.

### 2.4 Konsistente Icon-Sprache

| Aktion | Icon (lucide-vue-next) | Bedeutung |
|--------|----------------------|-----------|
| Zum Monitor | `Activity` | "Live-Daten sehen" |
| Zu Komponenten/Hardware-Details | `Settings` oder `Cpu` | "Hardware-Info sehen" |
| Zurueck | `ArrowLeft` | "Eine Ebene hoch" |
| Prev/Next Zone | `ChevronLeft` / `ChevronRight` | "Gleiche Ebene, andere Zone" |

### Verifikation Block 2

- [ ] ZonePlate hat Monitor-Link-Icon, navigiert korrekt zu `/monitor/:zoneId`
- [ ] Monitor L2 Sensor hat Settings-Icon, navigiert zu `/sensors?focus=:sensorId`
- [ ] SensorsView scrollt zum fokussierten Sensor und highlighted ihn 3 Sekunden
- [ ] Komponenten-Tab hat Activity-Icon pro Sensor, navigiert korrekt zu Monitor
- [ ] Alle Links nutzen konsistente Icons (Activity = Monitor, Settings = Hardware)
- [ ] Nicht-zugewiesene Sensoren haben KEINEN Monitor-Link (kein Crash)

---

## Block 3: Tab-Verhalten + Edge Cases (~1h)

### 3.1 ViewTabBar Aktiver-Tab-Highlighting

> **[KORREKTUR] Pfad FALSCH.** ViewTabBar liegt bei:
> `El Frontend/src/components/common/ViewTabBar.vue` (NICHT `shared/design/layout/`).
>
> **[KORREKTUR] Tabs FALSCH.** Die echten Tabs sind:
> - "Übersicht" → `/hardware`
> - "Monitor" → `/monitor`
> - "Editor" → `/editor`
>
> Es gibt KEINE Tabs "Komponenten" (`/sensors`) oder "Dashboards" (`/dashboards`) in der ViewTabBar!
> `/sensors` ist eine eigene Route (SensorsView), aber kein Tab in ViewTabBar.
>
> **[KORREKTUR] Kein Fix noetig.** ViewTabBar nutzt BEREITS `route.path.startsWith()` (Z23-29):
> `if (path.startsWith('/hardware')) return '/hardware'`
> `if (path.startsWith('/monitor')) return '/monitor'`
> Sub-Routes werden KORREKT erkannt. Kein Fix noetig.

**Datei:** `El Frontend/src/components/common/ViewTabBar.vue`

Pruefen und sicherstellen dass der aktive Tab korrekt highlighted ist:

- [x] Bei `/hardware` → "Übersicht" Tab aktiv (**bereits korrekt via startsWith**)
- [x] Bei `/hardware/:zoneId` → "Übersicht" Tab aktiv (**bereits korrekt**)
- [x] Bei `/monitor` → "Monitor" Tab aktiv (**bereits korrekt**)
- [x] Bei `/monitor/:zoneId` → "Monitor" Tab aktiv (**bereits korrekt**)
- [x] Bei `/editor` → "Editor" Tab aktiv (**bereits korrekt**)

**Ergebnis:** Kein Code-Fix noetig. Nur verifizieren dass bestehendes Verhalten nach Aenderungen weiterhin funktioniert.

### 3.2 Browser-Back-Button Verhalten

**Erwartetes Verhalten:**

```
User navigiert: /monitor → /monitor/test → /monitor/testneu (via Prev/Next)
Browser-Back: → /monitor (NICHT /monitor/test)
```

Dies wird durch `router.replace()` (statt `router.push()`) bei Zone-Wechsel sichergestellt (Block 1.2).

> **[KORREKTUR]** `goBack()` (Z1094) nutzt aktuell `router.push({ name: 'monitor' })`.
> Das ist KORREKT fuer goBack — push erzeugt einen History-Eintrag damit Browser-Forward funktioniert.
> NUR der Zone-Wechsel (goToPrevZone/goToNextZone) soll `replace` nutzen.
> goBack muss NICHT geaendert werden.

### 3.3 Deep-Link-Support

**Direkte URL-Eingabe muss funktionieren:**

- [ ] `/monitor/test` → L2 mit Zone "Test" geladen
- [ ] `/monitor/nonexistent` → Graceful Fallback (redirect zu L1 oder Fehlermeldung)
- [ ] `/sensors?focus=sensor-123` → Scroll zu Sensor oder stille Ignorierung wenn nicht gefunden

### 3.4 Responsive: Zone-Nav auf kleinen Screens

Auf Screens < 640px die Zone-Nav-Buttons verkleinern und Position-Label ausblenden:

```css
@media (max-width: 640px) {
  .monitor-view__zone-nav-label {
    display: none;
  }
  .monitor-view__zone-nav {
    gap: var(--space-1);  /* [KORREKTUR] --spacing-2xs existiert NICHT → --space-1 (4px) */
  }
}
```

Swipe-Navigation ist auf Touch-Devices das primaere Pattern — Buttons sind sekundaer.

### Verifikation Block 3

- [ ] ViewTabBar highlighted korrekt fuer alle Sub-Routes
- [ ] Browser-Back von L2 (nach Zone-Wechsel) geht zu L1, nicht zur vorherigen Zone
- [ ] Deep-Links funktionieren (direkte URL-Eingabe)
- [ ] Nicht-existente Zone-ID fuehrt zu Fallback
- [ ] Zone-Nav auf Mobile: Buttons sichtbar, Label ausgeblendet, Swipe funktioniert

---

## Betroffene Dateien (Zusammenfassung)

| Datei | Aenderung | Block |
|-------|-----------|-------|
| `El Frontend/src/views/MonitorView.vue` | Prev/Next Computeds + Funktionen + Keyboard + Swipe + Template | 1 |
| `El Frontend/src/components/dashboard/ZonePlate.vue` | Monitor-Link im Zone-Header | 2 |
| `El Frontend/src/views/SensorsView.vue` | focus-Parameter Support + Monitor-Links | 2 |
| `El Frontend/src/components/common/ViewTabBar.vue` | ~~Sub-Route Active-State Fix~~ **Bereits korrekt** — nur Verifikation | 3 |

**Keine neuen Dateien. Keine neuen Composables. Keine Backend-Aenderungen.**

---

## Abgrenzung

- **KEIN** Zone-Tab-Leiste am L2-Kopf (optional aus der TM-Analyse → vertagt, erst testen ob Prev/Next reicht)
- **KEIN** Umbau der Uebersicht (→ Auftrag 3: Uebersicht Cockpit)
- **KEIN** Umbau des Komponenten-Tabs (→ Auftrag 2: Komponenten-Tab)
- **KEINE** neuen Composables — alles in MonitorView lokal loesbar
- **KEINE** Backend-Aenderungen

---

## Empfohlene Reihenfolge

1. **Block 1** zuerst — Zone-Navigation ist der Kern
2. **Block 2** danach — Cross-Tab-Links profitieren sofort vom verbesserten Monitor
3. **Block 3** zum Schluss — Edge-Cases und Polish

**Gesamtaufwand:** ~4-6h, in einer Session machbar.
