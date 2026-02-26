# Dashboard-Reaktivitaet & Performance — Bugfix-Auftrag

> **Typ:** Bugfix (architektonisch) + Performance-Optimierung
> **Prioritaet:** HOCH (Dashboard-Builder unbenutzbar ohne Live-Updates, Store-Stale betrifft alle Views)
> **Geschaetzter Aufwand:** ~12-18 Stunden (4 Bloecke)
> **Betroffene Schichten:** El Frontend (CustomDashboardView, esp.store, useWebSocket, Router, mehrere Views)
> **Erstellt:** 2026-02-25
> **Quelle:** Robin's HW-Test Bug-Report (Bug 3b + 3c)
> **Status:** OFFEN
>
> **Wissensgrundlage:**
> - `arbeitsbereiche/automation-one/Dashboard_analyse.md` — Store-Architektur (14 Stores), WebSocket-Composable (337 Zeilen, nicht 321), Event-Inventar (26 Events), CustomDashboardView-Analyse
> - `wissen/iot-automation/vue3-pinia-health-aggregation-store-pattern.md` — Ready-Gate, shallowRef, Event-Queue, Ring-Buffer (1077 Zeilen)
> - `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` — Anti-Pattern #4 (redundante Datenquellen), #12 (Performance-Blindspots)
> - `wissen/iot-automation/vue3-gridstack-reactive-dashboard-pattern.md` — makeWidget vs addWidget, nextTick, Layout-Persistenz, Batch-Updates (7 Quellen)
> - `wissen/iot-automation/vue3-websocket-performance-batching-pattern.md` — shallowRef, RAF-Batching, Selector-Pattern, 80-95% Re-Render-Reduktion (8 Quellen)
> - `wissen/iot-automation/realtime-dashboard-ux-enduser-forschung.md` — Endsley 3-Level SA, 7-Sekunden-Regel, Alert-Fatigue (10 Papers)
> - `wissen/iot-automation/websocket-reactive-ui-performance-forschung.md` — Batching 70% CPU-Reduktion, Glitch-Freedom, Latenz-Schwellen (11 Papers)

---

## Uebersicht: 2 Bugs, 4 Arbeitsbloecke

| # | Bug | Schwere | Aufwand | Bloecke |
|---|-----|---------|---------|---------|
| 3b | DashboardBuilder — Keine Live-Updates | Hoch | 6-8h | Block A + B |
| 3c | Generelle Store-Reaktivitaet bei Route-Wechsel | Mittel-Hoch | 4-6h | Block C |
| — | Performance bei 50 Devices | Mittel | 2-4h | Block D |

**Zusammenhang:** Alle drei betreffen die Echtzeit-Datenpipeline: WebSocket → Store → View. Bug 3b ist der offensichtlichste (DashboardBuilder zeigt statische Daten), Bug 3c der verbreitetste (betrifft mehrere Views), Performance-Block D ist praeventiv fuer den Produktivbetrieb mit 50 Devices.

---

## Block A: CustomDashboardView — WebSocket-Subscription (Bug 3b) — KRITISCH

### IST-ZUSTAND (verifiziert)

**Datei:** `El Frontend/src/views/CustomDashboardView.vue`

> [verify-plan] Zeilen-Referenz korrekt (onMounted Zeile 91-135). Store ist `@/stores/esp` (1671 Zeilen, nicht 1645).

```typescript
// Zeile 91-135 — Daten werden EINMALIG geladen
onMounted(() => {
  if (espStore.devices.length === 0) {
    espStore.fetchAll()  // EINMALIG, kein Watch/Subscribe
  }
  // GridStack init mit statischen Props
})
```

**Probleme:**
1. `fetchAll()` wird nur aufgerufen wenn der Store leer ist — bei Navigation von einer anderen View sind Daten schon da, aber STALE
2. Widget-Props werden statisch gesetzt (Zeile 244-278), nicht als reaktive Computed
3. Kein WebSocket-Listener fuer `sensor_data`, `esp_health`, `actuator_status` Events
4. GridStack-Widgets erhalten keinen Daten-Update nach Initial-Render

> [verify-plan] WARNUNG zu Punkt 2+3: Die 8 Widget-Komponenten (SensorCardWidget, GaugeWidget, etc.) nutzen INTERN `useEspStore()` und lesen `espStore.devices` via `computed()`. Der espStore hat WS-Subscriptions fuer alle 26 Events (Zeile 1520-1522). Die Widgets SOLLTEN reaktiv sein — die `render()` + `appContext`-Methode teilt die Pinia-Instanz korrekt. Die Root-Cause-Analyse muss pruefen ob: (a) `render()` mit `h()` korrekt reaktive Effekte erzeugt, (b) die In-Place-Mutation von `devices.value[].sensors[]` die Vue-Proxy-Detection triggert, oder (c) der Bug woanders liegt (z.B. WS-Verbindung nicht aktiv auf der CustomDashboard-Route).

### SOLL-ZUSTAND

**Prinzip:** Der DashboardBuilder muss genauso reaktiv sein wie das Haupt-Dashboard (DashboardView). Daten kommen ueber den gleichen WebSocket-Kanal.

```typescript
// CustomDashboardView.vue — SOLL
import { useEspStore } from '@/stores/esp'
import { computed, watch, onMounted, onUnmounted } from 'vue'

const espStore = useEspStore()

// Reaktive Daten fuer Widgets (COMPUTED, nicht statisch)
const widgetData = computed(() => {
  return currentLayout.value.widgets.map(widget => ({
    ...widget,
    // Live-Daten aus Store ableiten
    deviceData: espStore.devices.find(d => d.device_id === widget.deviceId),
    sensorValue: espStore.getLatestSensorValue(widget.deviceId, widget.sensorType),
    // [verify-plan] FEHLER: `espStore.getLatestSensorValue()` existiert NICHT im espStore!
    // Tatsaechlich verfuegbare Methoden: fetchAll(), getDeviceId(), sendActuatorCommand(), etc.
    // Sensor-Daten liegen auf `device.sensors[]` (Array von MockSensor mit raw_value, quality, unit).
    // Korrekt waere: `espStore.devices.find(d => d.device_id === widget.deviceId)?.sensors?.find(s => s.sensor_type === widget.sensorType)?.raw_value`
  }))
})

// Watch fuer GridStack-Widget-Updates
watch(widgetData, (newData) => {
  // GridStack-Widgets mit neuen Daten aktualisieren
  updateGridStackWidgets(newData)
}, { deep: false })  // [verify-plan] HINWEIS: devices ist aktuell ref() NICHT shallowRef(). deep:false hier wuerde KEINE Aenderungen erkennen bei In-Place-Mutation!
```

### GridStack + Vue 3 Reaktivitaets-Pattern

**Kernproblem:** GridStack verwaltet sein eigenes DOM. Vue 3 Reactivity und GridStack's DOM-Manipulation muessen koexistieren ohne sich zu stoeren.

**Loesung: Separation of Concerns**
```
Vue 3 (Daten + State)          GridStack (Layout + Drag-and-Drop)
        |                                    |
        v                                    v
  Pinia Store → computed()      GridStack.init() → grid.save()
        |                                    |
        +------------ Widget ----------------+
                   (Vue-Komponente als
                    GridStack-Content)
```

**GridStack Drag-and-Drop Integration:**
- `gridstack.on('change', ...)` → Store-Update (Layout persistieren)
- `gridstack.on('added', ...)` → Vue-Komponente in neues Grid-Item mounten
- `gridstack.on('removed', ...)` → Vue-Komponente unmoisten
- **WICHTIG:** `gridstack.batchUpdate()` nutzen bei mehreren Aenderungen (verhindert Flicker)

### Implementierungs-Schritte

1. **Widget-Data als Computed:** Statische Props → reaktive Computed-Properties die aus espStore lesen
2. **Watch mit GridStack-Update:** `watch(widgetData, ...)` aktualisiert GridStack-Widget-Inhalte
3. **Kein neuer WS-Listener noetig:** espStore hat bereits ALLE 26 WS-Events — die Daten sind da, nur die View nutzt sie nicht
   > [verify-plan] KORREKT. espStore Zeile 1520-1522 subscribt sensor_data, esp_health, actuator_status. Die Widget-Komponenten lesen via computed() aus dem Store. Das Problem liegt vermutlich bei render()/h()-Mounting, nicht bei fehlenden WS-Listenern.
4. **GridStack Layout-Persistenz:** `gridstack.on('change', callback)` speichert Layout in Store/LocalStorage
5. **Drag-and-Drop Event-Handling:** GridStack-Events an Vue-Komponenten weiterleiten

### Akzeptanzkriterien

- [ ] Sensor-Werte in Dashboard-Widgets aktualisieren sich in Echtzeit (via WebSocket)
- [ ] Device-Status (online/offline) wird live aktualisiert
- [ ] Drag-and-Drop von Widgets funktioniert weiterhin
- [ ] Layout wird bei Page-Reload wiederhergestellt (localStorage oder API)
- [ ] Kein Flicker bei Widget-Updates (GridStack batchUpdate)
- [ ] Performance: <16ms Render-Time pro Widget-Update (60fps)

---

## Block B: GridStack Widget-Lifecycle (Bug 3b Fortsetzung)

### Problem

Wenn GridStack Widgets hinzufuegt, entfernt oder per Drag verschiebt, muessen die Vue-Komponenten korrekt ge-mounted und un-mounted werden. Sonst entstehen Memory Leaks (Event-Listener bleiben haengen) oder Zombie-Widgets (gerendert aber nicht reaktiv).

### Widget-Mounting Pattern

```typescript
// Pattern: Vue-Komponente in GridStack-Widget mounten
import { createApp, h } from 'vue'

function mountWidgetComponent(
  gridElement: HTMLElement,
  widgetConfig: WidgetConfig
): () => void {
  const contentEl = gridElement.querySelector('.grid-stack-item-content')
  if (!contentEl) return () => {}

  // Vue Mini-App fuer dieses Widget
  const app = createApp({
    render: () => h(resolveWidgetComponent(widgetConfig.type), {
      deviceId: widgetConfig.deviceId,
      sensorType: widgetConfig.sensorType,
      // Reactive props via store
    })
  })

  // Pinia Store teilen
  app.use(pinia)
  app.mount(contentEl)

  // Cleanup-Funktion zurueckgeben
  return () => app.unmount()
}
```

**Alternative (empfohlen):** Statt createApp pro Widget → Vue Teleport oder dynamische Komponenten mit `<component :is="...">` und `v-for` ueber die Widget-Liste. Das ist Vue-nativer und vermeidet die Multi-App-Problematik.

> [verify-plan] AKTUELLER IST-ZUSTAND: CustomDashboardView nutzt WEDER createApp NOCH v-for/Teleport. Es nutzt Vue 3's low-level `render(h(Component, props), mountEl)` mit `vnode.appContext = currentInstance.appContext` (Zeile 270-276). Das ist ein DRITTER Ansatz (render-API mit AppContext-Sharing). Die Tabelle unten muss um diesen Ansatz ergaenzt werden.

### OFFEN: Welches Pattern waehlen?

| Ansatz | Vorteile | Nachteile |
|--------|----------|-----------|
| **createApp pro Widget** | Isoliert, GridStack-kompatibel | Multi-App (kein geteilter State ohne explizites Pinia-Sharing) |
| **v-for + Teleport** | Vue-nativ, Store-Zugriff einfach | GridStack DOM-Manipulation kann Vue-Teleport stoeren |
| **v-for + absolute Positioning** | Volle Vue-Kontrolle | GridStack nur fuer Layout-Berechnung, Custom DnD |
| **render() + h() + appContext** (**IST**) | Kein Multi-App, Store geteilt via appContext | Props statisch bei Mount, Re-Render unklar |

> [verify-plan] BEANTWORTET: Aktuelles Pattern ist `render(h(Component, props), mountEl)` mit `vnode.appContext`. Siehe CustomDashboardView.vue Zeile 244-278. Cleanup in onUnmounted Zeile 137-148 via `render(null, el)`. Das "OFFEN" ist damit geklaert.

### Implementierungs-Schritte

1. **Analyse:** Aktuelles Widget-Mounting-Pattern im Code pruefen
2. **Cleanup:** onUnmounted() in CustomDashboardView muss ALLE Widget-Apps zerstoeren
3. **DnD-Events:** GridStack 'dragstart', 'dragstop' Events an das UI-Feedback koppeln
4. **Widget-Config-Persistenz:** Layout + Widget-Konfiguration in einem einzigen Objekt speichern

### Akzeptanzkriterien

- [ ] Widgets werden bei Hinzufuegen sofort reaktiv (Live-Daten)
- [ ] Widgets werden bei Entfernen sauber un-mounted (kein Memory Leak)
- [ ] Drag-and-Drop aktualisiert Layout-State im Store
- [ ] Browser-DevTools zeigen keine detached DOM Nodes nach Widget-Entfernung

---

## Block C: Store-Initialisierung bei Route-Wechsel (Bug 3c)

### IST-ZUSTAND (verifiziert)

Stores laden Daten nicht neu wenn der User zwischen Views navigiert:
- Filter sind global statt View-spezifisch
- Kein `fetchAll()` bei Route-Wechsel
- Stale Daten bleiben im Store bis manueller Refresh

**Betroffene Views (Symptome):**

| View | Store | Problem |
|------|-------|---------|
| CustomDashboardView | espStore | `fetchAll()` nur in onMounted, ueberspringt wenn Daten vorhanden |
| SensorHistoryView | espStore | Kein `fetchAll()` und kein `onMounted` — nutzt nur `espStore.devices` via computed (Zeile 65) |
| SystemMonitorView | espStore | ~~Health-Tab zeigt stale Fleet-Data~~ |
| UserManagementView | — | User-Liste nicht aktualisiert nach Rolle-Aenderung in anderer Session |

> [verify-plan] KORREKTUR SystemMonitorView: Ruft `espStore.fetchAll()` BEDINGUNGSLOS in onMounted auf (Zeile 1281)! Kein Guard, kein `devices.length === 0` Check. SystemMonitorView ist NICHT stale-anfaellig fuer ESP-Daten. Das Health-Problem koennte aber bei healthData (loadHealthData Zeile 1285) liegen — das ist ein separater API-Call, nicht espStore.
> [verify-plan] KORREKTUR SensorHistoryView: Hat KEINEN fetchAll()-Call und KEINEN onMounted-Hook. Nutzt nur `espStore.devices` readonly. Ist tatsaechlich stale-anfaellig — aber fuer die Device-LISTE, nicht fuer historische Daten (die kommen via `sensorsApi.queryData()`).

### Root Cause

Der esp.store.ts (1671 Zeilen) hat WebSocket-Subscriptions die IMMER laufen (gut!). Das Problem ist:
1. **REST-Daten (Initial-Load) werden nie invalidiert** — `fetchAll()` wird nur aufgerufen wenn `devices.length === 0`
2. **Kein Stale-Detection:** Store weiss nicht ob Daten 5 Sekunden oder 5 Minuten alt sind
3. **Kein Route-basierter Refresh:** Views rufen Daten nicht neu ab bei Navigation

### SOLL-ZUSTAND — 3 Strategien

**Strategie 1: Stale-While-Revalidate (EMPFOHLEN fuer REST-Daten)**

```typescript
// Composable: useStaleWhileRevalidate
const STALE_THRESHOLD_MS = 30_000  // 30 Sekunden

function useStaleWhileRevalidate<T>(
  fetchFn: () => Promise<T>,
  currentData: Ref<T>,
  lastFetchedAt: Ref<number>
) {
  async function ensureFresh(): Promise<void> {
    const isStale = Date.now() - lastFetchedAt.value > STALE_THRESHOLD_MS
    if (isStale || !currentData.value) {
      await fetchFn()
      lastFetchedAt.value = Date.now()
    }
  }

  return { ensureFresh }
}
```

**Strategie 2: WebSocket als Single Source of Truth (fuer Live-Daten)**

Der espStore bekommt bereits ALLE Updates ueber WebSocket. Das Problem ist dass REST-only-Daten (Health-Summary, User-Liste, historische Daten) nicht gepusht werden.

**Loesung:** Fuer Live-Daten (Sensor-Werte, Device-Status) → Store ist immer aktuell via WS. Fuer Snapshot-Daten (Health-Details, User-Liste) → Stale-While-Revalidate bei View-Mount.

**Strategie 3: Router-Hook fuer View-spezifische Initialisierung**

```typescript
// router/index.ts — Route-Meta mit Store-Dependencies
{
  path: '/system-monitor',
  component: SystemMonitorView,
  meta: {
    requiresAuth: true,
    storeInit: ['systemHealth']  // Stores die frisch sein muessen
  }
}

// Guard
router.afterEach((to) => {
  if (to.meta.storeInit) {
    for (const storeKey of to.meta.storeInit) {
      storeRegistry[storeKey].ensureFresh()
    }
  }
})
```

### Implementierungs-Schritte

1. **Composable:** `useStaleWhileRevalidate` erstellen
2. **espStore:** `lastFetchedAt` Timestamp einfuehren
3. **espStore.fetchAll():** Guard aendern von `devices.length === 0` zu `isStale()`
4. **Views:** `onActivated()` (fuer KeepAlive-Views) oder `onMounted()` mit `ensureFresh()`
5. **NICHT:** Doppeltes Fetching — WebSocket-Daten sind aktuell, nur REST-Snapshots brauchen Refresh

### Akzeptanzkriterien

- [ ] Route-Wechsel zu SystemMonitorView zeigt aktuelle Health-Daten
- [ ] Route-Wechsel zu CustomDashboardView zeigt aktuelle Device-Daten
- [ ] Kein unnoetigesAPP-Call wenn Daten < 30s alt sind
- [ ] WebSocket-Daten (sensor_data, esp_health) sind IMMER aktuell (keine Aenderung noetig)

---

## Block D: Performance-Optimierung fuer 50 Devices

### IST-ZUSTAND (verifiziert)

Aus Dashboard-Analyse:
- **Kein Message-Batching:** Jedes WS-Event loest sofort Store-Update + Re-Render aus
- **Rate-Limiting Warnung:** useWebSocket hat Warnung bei >10 Messages/Sekunde
- Bei 50 Devices x 3 Sensoren x Update alle 5s = **30 Updates/Sekunde** moeglich

### Performance-Probleme bei Skalierung

| Szenario | Messages/s | Problem |
|----------|-----------|---------|
| 10 Devices | ~6/s | OK |
| 30 Devices | ~18/s | Spuerbar (Chart-Flicker) |
| 50 Devices | ~30/s | Re-Render-Storm, UI wird traege |
| 50 Devices + Alarm-Flood | ~80+/s | UI blockiert |

### SOLL-ZUSTAND — 4 Optimierungen

**Optimierung 1: requestAnimationFrame-Batching**

```typescript
// composable: useRAFBatch
function useRAFBatch<T>(applyFn: (batch: T[]) => void) {
  let pending: T[] = []
  let rafId: number | null = null

  function add(item: T): void {
    pending.push(item)
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        const batch = pending
        pending = []
        rafId = null
        applyFn(batch)  // Alle gesammelten Updates auf einmal
      })
    }
  }

  function cleanup(): void {
    if (rafId !== null) cancelAnimationFrame(rafId)
    pending = []
  }

  return { add, cleanup }
}
```

**Optimierung 2: shallowRef konsequent nutzen**

```typescript
// espStore — IST
const devices = ref<ESPDevice[]>([])  // Deep reactivity auf ALLE nested fields

// espStore — SOLL
const devices = shallowRef<ESPDevice[]>([])  // Nur Array-Referenz-Aenderung trackt
// Update via:
devices.value = [...devices.value]  // Neue Array-Referenz
// ODER:
triggerRef(devices)  // Expliziter Trigger nach Mutation
```

**Optimierung 3: Computed mit Selector-Pattern**

```typescript
// Statt: Gesamte Device-Liste in jeder Komponente
const allDevices = computed(() => espStore.devices)

// Besser: Nur relevante Daten selektieren
const myDeviceSensor = computed(() => {
  const device = espStore.devices.find(d => d.device_id === props.deviceId)
  return device?.sensors?.find(s => s.type === props.sensorType)?.value
})
```

**Optimierung 4: watchEffect mit `flush: 'post'`**

```typescript
// Chart-Updates erst NACH DOM-Update
watchEffect(() => {
  chart.update(espStore.getLatestValues(deviceId))
  // [verify-plan] FEHLER: `espStore.getLatestValues()` existiert NICHT!
  // Sensor-Daten liegen auf device.sensors[].raw_value. Korrekt waere z.B.:
  // const device = espStore.devices.find(d => getDeviceId(d) === deviceId)
  // chart.update(device?.sensors?.map(s => s.raw_value) ?? [])
}, { flush: 'post' })  // Wartet auf naechsten DOM-Update-Zyklus
```

### Implementierungs-Schritte

1. **useRAFBatch Composable:** Erstellen in `El Frontend/src/composables/`
2. **espStore:** WebSocket-Handler durch RAF-Batch leiten
3. **espStore:** `ref()` → `shallowRef()` fuer `devices`, `pendingDevices`
4. **Views:** Chart-Updates auf `flush: 'post'` umstellen
5. **Messen:** Performance-Tab in DevTools — vor und nach Optimierung vergleichen

### Akzeptanzkriterien

- [ ] 50 Mock-Devices gleichzeitig aktiv → UI bleibt fluessig (60fps)
- [ ] Sensor-Updates kommen in <100ms im UI an (trotz Batching)
- [ ] Kein Chart-Flicker bei schnellen aufeinanderfolgenden Updates
- [ ] Memory-Verbrauch steigt NICHT linear mit Device-Anzahl (shallowRef)
- [ ] Performance-Messung dokumentiert (vorher/nachher)

---

## Abhaengigkeiten

```
Block A (WS-Subscription) ──→ Block B (Widget-Lifecycle)
                                      |
Block C (Stale-Revalidate) ─────────── (unabhaengig)
                                      |
Block D (Performance)      ────────── Block A muss zuerst (sonst optimiert man toten Code)
```

**Empfohlene Reihenfolge:** C → A → B → D

---

## Offene Fragen

- [x] **GridStack Version:** ~~Welche gridstack.js Version ist aktuell installiert?~~ → **v12.4.2** (package.json Zeile 38: `"gridstack": "^12.4.2"`). Aktuelle API, keine v5-v10-Kompatibilitaetsprobleme.
- [x] **Widget-Mount-Pattern:** ~~createApp pro Widget oder v-for + Teleport?~~ → **KEINS VON BEIDEN.** Nutzt `render(h(Component, props), mountEl)` mit `vnode.appContext = currentInstance.appContext` (Zeile 270-276). Cleanup via `render(null, el)` in onUnmounted (Zeile 137-148).
- [x] **KeepAlive:** ~~Werden Views mit `<KeepAlive>` gecacht?~~ → **NEIN.** Kein `<KeepAlive>` im gesamten Projekt. `onActivated()` ist nicht relevant — nur `onMounted()` zaehlt.
- [ ] **LoadTestView:** Kann fuer Performance-Testing genutzt werden? (Bulk-Mock-ESP)
- [ ] **WS-Rate bei 50 Devices:** Wie oft sendet ein ESP32 sensor_data? (alle 5s? 10s? konfigurierbar?)

---

## Referenzen

### Bestehende Wissensbasis
- `arbeitsbereiche/automation-one/Dashboard_analyse.md` — Teil D (WS-Events), Teil E (Store-Architektur), Teil H (Charts)
- `wissen/iot-automation/vue3-pinia-health-aggregation-store-pattern.md` — Ready-Gate, shallowRef, Event-Queue
- `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` — Anti-Pattern #4, #12

### Recherche-Ergebnisse (2026-02-25)
- `wissen/iot-automation/vue3-gridstack-reactive-dashboard-pattern.md` — nextTick+makeWidget, v-for Pattern, Layout-Persistenz
- `wissen/iot-automation/vue3-websocket-performance-batching-pattern.md` — shallowRef, RAF-Batching, Selector-Pattern
- `wissen/iot-automation/vue3-auth-guard-race-condition-patterns.md` — Stale-While-Revalidate Composable (Markus Oberlehner)

### Forschungs-Ergebnisse (2026-02-25)
- `wissen/iot-automation/websocket-reactive-ui-performance-forschung.md` — Batching 70% CPU-Reduktion, Glitch-Freedom, Latenz <100ms
- `wissen/iot-automation/realtime-dashboard-ux-enduser-forschung.md` — Endsley 3-Level SA, 7-Sekunden-Regel, Alert-Fatigue-Praevention
