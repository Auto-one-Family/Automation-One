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
> - `arbeitsbereiche/automation-one/Dashboard_analyse.md` — Store-Architektur (13 Stores [Korrektur: 13, nicht 14]), WebSocket-Composable (337 Zeilen [Korrektur: 337, nicht 321]), Event-Inventar (26 Filter-Types, 25 .on()-Handler — `logic_execution` hat keinen Handler), CustomDashboardView-Analyse
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
1. `fetchAll()` wird nur aufgerufen wenn der Store leer ist — bei Navigation von einer anderen View sind Daten schon da, aber STALE ✅ KORREKT
2. ~~Widget-Props werden statisch gesetzt (Zeile 244-278), nicht als reaktive Computed~~ **[Korrektur: TEILWEISE FALSCH]** Die Props (sensorId, actuatorId etc.) sind KONFIGURATIONS-Props und SOLLEN statisch sein. Die LIVE-DATEN kommen aus den Widget-Komponenten selbst, die intern `useEspStore()` aufrufen und eigene `computed()` Properties erstellen (z.B. SensorCardWidget.vue:35 `currentSensor = computed(...)` liest direkt aus `espStore.devices`). Die Widgets SIND reaktiv fuer Store-Daten.
3. ~~Kein WebSocket-Listener fuer `sensor_data`, `esp_health`, `actuator_status` Events~~ **[Korrektur: FALSCH]** Der espStore HAT diese Listener (esp.ts:1520-1522: `ws.on('esp_health', handleEspHealth)`, `ws.on('sensor_data', handleSensorData)`, `ws.on('actuator_status', handleActuatorStatus)`). Die Daten kommen im Store an und die Widget-Computed-Properties reagieren darauf.
4. ~~GridStack-Widgets erhalten keinen Daten-Update nach Initial-Render~~ **[Korrektur: FALSCH]** Widgets erhalten Updates durch ihre internen computed-Properties die den Store lesen. Das TATSAECHLICHE Problem ist NUR Punkt 1 (stale REST-Daten bei fetchAll-Guard).

### SOLL-ZUSTAND

**Prinzip:** Der DashboardBuilder muss genauso reaktiv sein wie das Haupt-Dashboard (DashboardView). Daten kommen ueber den gleichen WebSocket-Kanal.

```typescript
// CustomDashboardView.vue — SOLL
import { useEspStore } from '@/stores/esp'
import { computed, watch, onMounted, onUnmounted } from 'vue'

const espStore = useEspStore()

// [Korrektur: DIESER SOLL-CODE IST UNNOETIG]
// espStore.getLatestSensorValue() EXISTIERT NICHT im Store (halluzinierte API).
// Die Widgets lesen Store-Daten SELBST ueber eigene computed() Properties.
// Beispiel SensorCardWidget.vue:
//   const currentSensor = computed(() => {
//     const [espId, gpioStr] = props.sensorId.split(':')
//     const device = espStore.devices.find(d => espStore.getDeviceId(d) === espId)
//     return device?.sensors?.find(s => s.gpio === gpio)
//   })
// → Widget ist BEREITS reaktiv. Kein widgetData-Computed in der Parent-View noetig.
//
// WAS TATSAECHLICH GEFIXT WERDEN MUSS:
// 1. fetchAll()-Guard in onMounted() entfernen/ersetzen durch Stale-Check (Block C)
// 2. Das ist der EINZIGE Bug im CustomDashboardView bzgl. Datenaktualitaet.
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

1. ~~**Widget-Data als Computed:** Statische Props → reaktive Computed-Properties die aus espStore lesen~~ **[Korrektur: ENTFAELLT]** Widgets lesen Store-Daten bereits selbst ueber interne computed(). Kein Widget-Data-Computed in der Parent-View noetig.
2. ~~**Watch mit GridStack-Update:** `watch(widgetData, ...)` aktualisiert GridStack-Widget-Inhalte~~ **[Korrektur: ENTFAELLT]** Widgets aktualisieren sich selbst.
3. **Kein neuer WS-Listener noetig:** ✅ KORREKT — espStore hat alle WS-Events.
4. **GridStack Layout-Persistenz:** ✅ KORREKT — `grid.on('change', autoSave)` existiert BEREITS (CustomDashboardView.vue:117-119). Layout wird via `dashStore.saveLayout()` in localStorage gespeichert.
5. ~~**Drag-and-Drop Event-Handling:** GridStack-Events an Vue-Komponenten weiterleiten~~ **[Korrektur: BEREITS IMPLEMENTIERT]** `grid.on('removed', ...)` existiert (Zeile 121-133) mit Cleanup und autoSave.

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

**[Korrektur: BEANTWORTET — Pattern ist BEREITS implementiert]**

Der Code nutzt WEDER `createApp` noch `v-for + Teleport`, sondern ein DRITTES Pattern:
**`h()` + `render()` mit geteiltem `appContext`** (CustomDashboardView.vue:244-278):

```typescript
// TATSAECHLICHES Pattern (bereits im Code):
function mountWidgetComponent(widgetId, mountId, type, config) {
  const WidgetComponent = widgetComponentMap[type]
  const mountEl = document.getElementById(mountId)
  const props = { /* sensorId, actuatorId, etc. aus config */ }

  // VNode mit h() erstellen
  const vnode = h(WidgetComponent, props)

  // AppContext teilen fuer Pinia/Router-Zugriff
  if (currentInstance?.appContext) {
    vnode.appContext = currentInstance.appContext
  }

  // Direkt rendern (KEIN createApp, KEIN Teleport)
  render(vnode, mountEl)
  mountedWidgets.set(widgetId, mountEl)  // Track fuer Cleanup
}
```

**Vorteile dieses Patterns:**
- Kein Multi-App-Problem (appContext wird geteilt → Pinia/Router verfuegbar)
- GridStack-kompatibel (DOM wird von GridStack verwaltet)
- Widgets haben vollen Store-Zugriff und sind reaktiv

**Cleanup BEREITS implementiert:**
- `onUnmounted()` (Zeile 137-148): `render(null, el)` + `mountedWidgets.clear()` + `grid.destroy()`
- `grid.on('removed', ...)` (Zeile 121-133): `render(null, mountEl)` + `mountedWidgets.delete()`

~~**→ Robin muss entscheiden oder Agent muss im Code pruefen welches Pattern aktuell verwendet wird.**~~ **[BEANTWORTET]**

### Implementierungs-Schritte

1. ~~**Analyse:** Aktuelles Widget-Mounting-Pattern im Code pruefen~~ **[Korrektur: ERLEDIGT]** Pattern ist `h()` + `render()` mit appContext-Sharing.
2. ~~**Cleanup:** onUnmounted() in CustomDashboardView muss ALLE Widget-Apps zerstoeren~~ **[Korrektur: BEREITS IMPLEMENTIERT]** Cleanup existiert in Zeile 137-148 und 121-133.
3. **DnD-Events:** GridStack 'dragstart', 'dragstop' Events an UI-Feedback koppeln — Noch nicht implementiert, GUELTIG.
4. ~~**Widget-Config-Persistenz:** Layout + Widget-Konfiguration in einem einzigen Objekt speichern~~ **[Korrektur: BEREITS IMPLEMENTIERT]** `autoSave()` (Zeile 313-333) speichert Layout + Config via `dashStore.saveLayout()`. Widget-Config wird per `widgetConfigs` Map verwaltet (Zeile 151) und in `onUpdate:config` Handler aktualisiert (Zeile 264-268).

**[FAZIT BLOCK B: Der Grossteil ist BEREITS implementiert. Block B kann auf DnD-Feedback (Schritt 3) reduziert werden oder entfallen. Geschaetzter Aufwand: 1-2h statt der im Plan implizierten 3-4h.]**

### Akzeptanzkriterien

- [x] ~~Widgets werden bei Hinzufuegen sofort reaktiv (Live-Daten)~~ **[BEREITS ERFUELLT]** Widgets nutzen Store-Computed intern
- [x] ~~Widgets werden bei Entfernen sauber un-mounted (kein Memory Leak)~~ **[BEREITS ERFUELLT]** render(null, el) in onUnmounted + removed-Event
- [x] ~~Drag-and-Drop aktualisiert Layout-State im Store~~ **[BEREITS ERFUELLT]** grid.on('change', autoSave)
- [ ] Browser-DevTools zeigen keine detached DOM Nodes nach Widget-Entfernung — **Noch zu verifizieren**

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
| SensorHistoryView | espStore | Historische Daten nicht automatisch aktualisiert |
| SystemMonitorView | espStore | Health-Tab zeigt stale Fleet-Data |
| UserManagementView | — | User-Liste nicht aktualisiert nach Rolle-Aenderung in anderer Session |

### Root Cause

Der esp.store.ts (1671 Zeilen [Korrektur: 1671, nicht 1645]) hat WebSocket-Subscriptions die IMMER laufen (gut!). Das Problem ist:
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
4. **Views:** ~~`onActivated()` (fuer KeepAlive-Views) oder~~ `onMounted()` mit `ensureFresh()` **[Korrektur: KeepAlive wird NICHT verwendet — kein `<KeepAlive>` im gesamten Frontend. `onActivated()` ist IRRELEVANT. Nur `onMounted()` nutzen.]**
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
- **Rate-Limiting Warnung:** useWebSocket hat `rateLimitWarning` ref (useWebSocket.ts:53)
- Bei 50 Devices x 3 Sensoren x Update alle ~~5s~~ **30s** [Korrektur: Default sensor_interval = 30000ms laut NVS_KEYS.md, konfigurierbar 1s-300s] = **~5 Updates/Sekunde** (bei Default). Bei minimaler Konfiguration (1s): 150/s moeglich.

### Performance-Probleme bei Skalierung

| Szenario | Messages/s | Problem |
|----------|-----------|---------|
| 10 Devices (30s default) | ~1/s | OK |
| 30 Devices (30s default) | ~3/s | OK |
| 50 Devices (30s default) | ~5/s | OK |
| 50 Devices (5s interval) | ~30/s | Re-Render-Storm, UI wird traege |
| 50 Devices + Alarm-Flood | ~80+/s | UI blockiert |

**[Korrektur: Die Tabelle war auf 5s-Intervall kalkuliert, aber Default ist 30s. Bei Default-Konfiguration ist das Problem weniger akut. Performance-Block D ist weiterhin sinnvoll als Praevention fuer Produktivbetrieb mit kurzen Intervallen.]**

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

**[Korrektur: Abhaengigkeits-Graph nach Reality-Check angepasst]**

```
Block A (fetchAll-Guard Fix) ─── einfacher als geplant (kein WS-Subscription-Umbau noetig)
                                      |
Block B (Widget-Lifecycle) ──────── GROESSTENTEILS BEREITS IMPLEMENTIERT (nur DnD-Feedback offen)
                                      |
Block C (Stale-Revalidate) ─────── KERN-FIX (useStaleWhileRevalidate Composable erstellen)
                                      |
Block D (Performance)      ─────── Praeventiv sinnvoll, aber weniger dringend als im Plan
                                    (Default 30s-Intervall = nur ~5 msg/s bei 50 Devices)
```

**Empfohlene Reihenfolge:** C → A → D (Block B kann auf Verifikation + DnD-Feedback reduziert werden)
**Geschaetzter Aufwand nach Korrektur:** ~6-10h statt 12-18h (Block A + B sind kleiner als angenommen)

---

## Offene Fragen

- [x] **GridStack Version:** ~~Welche gridstack.js Version ist aktuell installiert?~~ **[BEANTWORTET]** `gridstack@^12.4.2` (v12 — NICHT v5-v10. API-Dokumentation fuer v12 nutzen!)
- [x] **Widget-Mount-Pattern:** ~~createApp pro Widget oder v-for + Teleport?~~ **[BEANTWORTET]** WEDER NOCH — `h()` + `render()` mit `vnode.appContext` Sharing (CustomDashboardView.vue:244-278). Drittes Pattern, nicht in der Vergleichstabelle.
- [x] **KeepAlive:** ~~Werden Views mit `<KeepAlive>` gecacht?~~ **[BEANTWORTET]** NEIN. Kein `<KeepAlive>` im gesamten Frontend. Nur `onMounted()` relevant.
- [x] **LoadTestView:** ~~Kann fuer Performance-Testing genutzt werden?~~ **[BEANTWORTET]** Existiert unter `El Frontend/src/views/LoadTestView.vue` mit zugehoerigem API-Client `El Frontend/src/api/loadtest.ts`. Kann fuer Bulk-Mock-ESP Testing verwendet werden.
- [x] **WS-Rate bei 50 Devices:** ~~Wie oft sendet ein ESP32 sensor_data?~~ **[BEANTWORTET]** Default: alle 30s (`sensor_{i}_interval = 30000ms` in NVS_KEYS.md). Konfigurierbar: 1s-300s. Bei 50 Devices mit Default: ~5 msg/s. Bei 5s-Intervall: ~30 msg/s.

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

---

## /verify-plan Ergebnis (2026-02-27)

**Plan:** Dashboard-Reaktivitaet & Performance Bugfix (3b + 3c + Performance)
**Geprueft:** 8 Pfade, 0 Agents, 0 Services, 0 Endpoints, 5 offene Fragen, 4 Bloecke

### Bestaetigte Punkte
- Alle 4 Views existieren (CustomDashboardView, SensorHistoryView, SystemMonitorView, UserManagementView)
- espStore.ts existiert (1671 Zeilen, `ref<ESPDevice[]>([])` an Zeile 97)
- fetchAll()-Guard in CustomDashboardView.vue Zeile 93: `if (espStore.devices.length === 0)` — Bug bestaetigt
- GridStack v12.4.2 installiert — API-Kompatibilitaet gesichert
- 8 Widget-Komponenten existieren in `components/dashboard-widgets/`
- dashboard.store.ts existiert in `shared/stores/`
- LoadTestView existiert mit API-Client fuer Bulk-Mock-ESP
- useRAFBatch und useStaleWhileRevalidate existieren NICHT (muessen erstellt werden)
- Block C (Stale-Revalidate) ist der ECHTE Kern-Fix
- Block D (Performance/shallowRef/RAF-Batching) ist SINNVOLL als Praevention

### Kritische Korrekturen (im Dokument markiert)

1. **Block A/B MASSIV ueberschaetzt:** Widgets sind BEREITS reaktiv durch interne computed()-Properties die den Store lesen. Der Plan nahm faelschlich an, Widgets seien "statisch" — tatsaechlich nutzen sie `useEspStore()` intern (z.B. SensorCardWidget.vue:19-42). Block A reduziert sich auf den fetchAll-Guard-Fix. Block B ist zu 90% bereits implementiert.

2. **Halluzinierte API:** `espStore.getLatestSensorValue()` und `espStore.getLatestValues()` existieren NICHT im Store. Der SOLL-Code in Block A ist nicht umsetzbar wie geschrieben.

3. **WS-Listener FALSCH diagnostiziert:** espStore HAT `ws.on('sensor_data', ...)`, `ws.on('esp_health', ...)`, `ws.on('actuator_status', ...)` (Zeile 1520-1522). Die Diagnose "Kein WebSocket-Listener" war falsch.

4. **Widget-Mount-Pattern FALSCH klassifiziert:** Code nutzt `h()` + `render()` mit `vnode.appContext` (NICHT createApp, NICHT Teleport). Cleanup existiert bereits.

5. **Sensor-Intervall FALSCH:** Default ist 30s (nicht 5s). Performance-Tabelle war auf falscher Grundlage berechnet.

6. **Store-Anzahl:** 13 Stores (nicht 14). useWebSocket: 337 Zeilen (nicht 321). espStore: 1671 Zeilen (nicht 1645).

### Zusammenfassung fuer TM

Der Plan ist in seiner **Diagnose teilweise falsch**: Block A und B ueberschaetzen das Problem massiv, weil angenommen wurde, dass Widgets nicht reaktiv sind — sie SIND es, durch interne Store-Computed-Properties. Der **einzige echte Bug** im CustomDashboardView ist der `fetchAll()`-Guard (Block C Thema). Block D (Performance) ist als Praevention weiterhin sinnvoll, aber weniger dringend als dargestellt (Default-Intervall 30s statt angenommener 5s). **Geschaetzter Aufwand nach Korrektur: ~6-10h statt 12-18h.** Block B kann fast komplett entfallen. Der TM sollte den Plan auf Block C als Kern-Fix fokussieren und Block A auf den fetchAll-Guard-Fix reduzieren.
