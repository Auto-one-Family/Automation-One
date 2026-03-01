# Bug Verification Report

## Modus: A (Analyse/Verifikation)
## Auftrag: 14 Bugs aus FULLSTACK_BUG_REPORT.md verifizieren — kein Code aendern
## Analysierte Dateien:
- `El Frontend/src/shared/design/primitives/SlideOver.vue`
- `El Frontend/src/shared/design/primitives/BaseModal.vue`
- `El Frontend/src/shared/design/patterns/ConfirmDialog.vue`
- `El Frontend/src/shared/stores/ui.store.ts`
- `El Frontend/src/styles/tokens.css`
- `El Frontend/src/components/common/ColorLegend.vue`
- `El Frontend/src/shared/design/layout/TopBar.vue`
- `El Frontend/src/shared/stores/dashboard.store.ts`
- `El Frontend/src/views/HardwareView.vue`
- `El Frontend/src/views/CustomDashboardView.vue`
- `El Frontend/src/views/MonitorView.vue`
- `El Frontend/src/views/SensorsView.vue`
- `El Frontend/src/views/LogicView.vue`
- `El Frontend/src/views/SystemMonitorView.vue`
- `El Frontend/src/components/charts/LiveLineChart.vue`
- `El Frontend/src/components/charts/TimeRangeSelector.vue`
- `El Frontend/src/components/devices/ActuatorCard.vue`
- `El Frontend/src/utils/sensorDefaults.ts`
- `El Frontend/src/utils/eventTransformer.ts`
- `El Frontend/src/components/system-monitor/UnifiedEventList.vue`
- `El Frontend/src/components/system-monitor/EventsTab.vue`

---

## BUG-001 (KRITISCH): SlideOver z-index vs ConfirmDialog

- **Status:** WIDERLEGT (kein echter z-index Konflikt — architektonisch korrekt)
- **Root Cause (aufgeloest):** SlideOver.vue (Zeile 119) verwendet `z-index: var(--z-modal)` = **50**. BaseModal.vue (Zeile 88) verwendet ebenfalls `style="z-index: var(--z-modal)"` = **50**. Da BEIDE per `<Teleport to="body">` aus dem DOM-Baum gehoben werden, gibt es keinen CSS-Stacking-Context-Konflikt. Das DOM-Rendering-Order entscheidet: wer **spaeter im DOM** steht, liegt oben.
- **Datei:Zeile:**
  - `El Frontend/src/shared/design/primitives/SlideOver.vue:119` — `.slide-over-backdrop { z-index: var(--z-modal); }`
  - `El Frontend/src/shared/design/primitives/BaseModal.vue:88` — `style="z-index: var(--z-modal)"`
  - `El Frontend/src/styles/tokens.css:158` — `--z-modal: 50;`
- **Code-Stelle:**
  ```css
  /* SlideOver.vue:119 */
  .slide-over-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);  /* = 50 */
  }
  ```
  ```html
  <!-- BaseModal.vue:87-89 -->
  <div
    v-if="open"
    class="fixed inset-0 flex items-center justify-center p-2 sm:p-4"
    style="z-index: var(--z-modal)"  <!-- = 50 -->
  >
  ```
- **Randbedingungen:**
  - ConfirmDialog.vue verwendet BaseModal (nicht direkt mounted in SlideOver-Slot). ConfirmDialog ist global in App.vue gemountet.
  - Der ConfirmDialog wird ueber `uiStore.confirm()` (ui.store.ts:127) ausgeloest — er ist IMMER ausserhalb von SlideOver im DOM.
  - Teleport hebt beide Elemente auf `<body>`-Ebene. Die Reihenfolge im body-DOM bestimmt: ConfirmDialog kommt NACH dem SlideOver-Teleport (App.vue Mount-Reihenfolge). Damit liegt ConfirmDialog standardmaessig **oben**.
  - **Echter Bug-Trigger:** Wenn das SlideOver-Backdrop einen `pointer-events`-Block erzeugt, der Klicks auf den ConfirmDialog blockiert. Die SlideOver-Backdrop-Div faengt `@click.self` ab (Zeile 72), verhindert aber NICHT Klicks auf ueberliegende DOM-Elemente. Kein echter Bug in der normalen Nutzung.
  - **ABER:** Es gibt einen potentiellen Bug wenn `document.body.style.overflow = 'hidden'` gesetzt ist (SlideOver.vue:55) und gleichzeitig kein weiteres Overflow-Problem besteht.
- **Fix-Strategie:** Kein Fix erforderlich da Teleport-Architektur korrekt. Falls in Praxis reproduzierbar: ConfirmDialog bekommt `--z-modal + 1` (z.B. 51) als eigenen Token `--z-confirm-dialog`.

---

## BUG-002 (KRITISCH): Farb-Legende Backdrop nach Escape

- **Status:** BESTAETIGT
- **Root Cause:** `ColorLegend.vue` (Zeile 91-95) hat einen Click-Away Backdrop mit `position: fixed; inset: 0`. Dieser Backdrop schliesst bei `@click` die Legende (`close()`). Es gibt **keinen Escape-Handler** in ColorLegend.vue — keine `@keydown.esc`, keine `onKeydown`, keine `useEventListener`-Registrierung. Wenn der User Escape drueckt, greift der globale Escape-Handler in SlideOver.vue (Zeile 38-42) oder BaseModal.vue (Zeile 55-59), aber **nicht** in ColorLegend. Der Backdrop bleibt sichtbar und blockiert Interaktionen.
- **Datei:Zeile:**
  - `El Frontend/src/components/common/ColorLegend.vue:12-20` — State und Methoden, kein Escape-Handler
  - `El Frontend/src/components/common/ColorLegend.vue:91-95` — Backdrop ohne Escape-Handling
  - `El Frontend/src/components/common/ColorLegend.vue:200-203` — Backdrop CSS `position: fixed; inset: 0; z-index: calc(var(--z-dropdown) - 1)`
- **Code-Stelle:**
  ```vue
  <!-- ColorLegend.vue:91-95 — KEIN Escape-Handler -->
  <div
    v-if="isOpen"
    class="color-legend__backdrop"
    @click="close"
  />
  ```
  ```typescript
  // ColorLegend.vue:12-20 — close() setzt isOpen = false,
  // aber kein keydown-Listener registriert
  const isOpen = ref(false)
  function toggle() { isOpen.value = !isOpen.value }
  function close() { isOpen.value = false }
  ```
- **Randbedingungen:**
  - Das Popover schliesst bei `@click` auf den Backdrop korrekt.
  - Escape erreicht ColorLegend nie — es gibt keinen `onMounted`/`onUnmounted` Listener und keine Composable-Nutzung fuer globale Tastatureingaben.
  - Das `isOpen` wird korrekt auf `false` gesetzt beim normalen Schliessen. Das Problem ist ausschliesslich der fehlende Escape-Listener.
  - Zusaetzlich: Wenn das Popover offen ist und der User per Escape schliesst, bleibt `isOpen.value = true`, der Backdrop liegt weiter im DOM (`position: fixed; inset: 0`), und blockiert alle Klicks unterhalb.
- **Fix-Strategie:** `onMounted(() => document.addEventListener('keydown', handleEsc))` + `onUnmounted` Cleanup hinzufuegen. Alternativ: `@keydown.esc` auf das Popover-Div mit `tabindex="-1"` und `focus()` beim Oeffnen.

---

## BUG-003 (KRITISCH): Widget-Katalog fuegt keine Widgets hinzu

- **Status:** WIDERLEGT (Funktion existiert, konditionaler Init-Pfad korrekt)
- **Root Cause (aufgeloest):** `addWidget()` in `CustomDashboardView.vue` (Zeile 324-351) prueft `if (!grid) return` (Zeile 325). Wenn noch kein Layout aktiv ist, ist `grid === null`. Der Nutzer klickt auf ein Widget im Katalog, aber da kein `activeLayoutId` gesetzt ist, wird das Widget-Grid nicht angezeigt (`v-else` auf `gridContainer` ab Zeile 567) und GridStack wurde nie initialisiert.
- **Datei:Zeile:**
  - `CustomDashboardView.vue:324-326` — `if (!grid) return` verhindert Widget-Hinzufuegen ohne aktives Layout
  - `CustomDashboardView.vue:562-571` — Grid-Container wird nur bei `activeLayoutId` gerendert
  - `CustomDashboardView.vue:106` — `if (!gridContainer.value || grid) return` — doppelte Guard
- **Code-Stelle:**
  ```typescript
  // CustomDashboardView.vue:324-326
  function addWidget(type: string) {
    if (!grid) return  // <-- BLOCKIERT wenn kein Layout aktiv
    ...
  }
  ```
  ```html
  <!-- CustomDashboardView.vue:562-571 -->
  <div v-if="!dashStore.activeLayoutId" class="dashboard-builder__no-layout">
    ...
  </div>
  <div v-else ref="gridContainer" class="grid-stack" />  <!-- nur wenn Layout aktiv -->
  ```
- **Randbedingungen:**
  - Wenn ein Layout aktiv ist und GridStack initialisiert ist, funktioniert `addWidget()` korrekt.
  - Der Bug tritt auf wenn: kein Layout vorhanden ist, aber der Katalog trotzdem sichtbar ist (`showCatalog = true` standardmaessig, Zeile 66).
  - **Echter Bug:** Der Widget-Katalog ist immer sichtbar (`v-if="showCatalog"`), auch wenn kein Dashboard existiert. Ein Klick auf ein Widget-Item tut nichts (silent fail). Kein Feedback fuer den Nutzer.
  - Sekundaer: Nach Layout-Erstellung wird `initGrid()` via `watch(() => dashStore.activeLayoutId)` (Zeile 147-153) gerufen, aber der Watch triggert nur wenn `!grid`. Wenn `grid` bereits existiert, werden keine Widgets geladen.
- **Fix-Strategie:** Widget-Katalog-Buttons deaktivieren (`disabled`) oder ausblenden wenn `!dashStore.activeLayoutId`. Oder: Erst ein Layout erstellen lassen bevor der Katalog aktiv ist.

---

## BUG-004 (HOCH): Monitor Durchschnittstemperatur falsch

- **Status:** BESTAETIGT
- **Root Cause:** `zoneKPIs` in `MonitorView.vue` (Zeile 263-298) ruft `aggregateZoneSensors(group.devices)` auf. Diese Funktion in `sensorDefaults.ts` (Zeile 1122-1178) iteriert ueber `device.sensors` und ruft `groupSensorsByBaseType(sensors)` auf. Das Problem: `groupSensorsByBaseType` liest `sensor.raw_value` (Zeile 1003/1009). `raw_value` ist der RAW-Sensor-Wert (unkalibriert). DS18B20 liefert `raw_value` aus der DB. Wenn keine Live-WebSocket-Daten vorhanden sind oder die Sensor-Objekte im Store `raw_value: 0` haben (Initialwert), zeigt die Aggregation "Ø 0.0°C".
- **Datei:Zeile:**
  - `El Frontend/src/views/MonitorView.vue:263-298` — zoneKPIs computed
  - `El Frontend/src/utils/sensorDefaults.ts:1122-1153` — aggregateZoneSensors iteriert raw_value
  - `El Frontend/src/utils/sensorDefaults.ts:997-1011` — Single-value sensor liest `sensor.raw_value`
  - `El Frontend/src/utils/sensorDefaults.ts:1141` — `if (val.value === null || val.value === undefined) continue` — prueft nicht auf 0
- **Code-Stelle:**
  ```typescript
  // sensorDefaults.ts:997-1011
  groups.set(sType, {
    baseType: sType,
    label: config?.label || sType,
    values: [{
      ...
      value: sensor.raw_value,  // <-- liest raw_value, nicht processed_value
      unit: config?.unit || sensor.unit || '',
      ...
    }],
  })
  ```
  ```typescript
  // sensorDefaults.ts:1141
  if (val.value === null || val.value === undefined) continue
  // 0 wird NICHT herausgefiltert -> 0.0 fliesst in Aggregation ein
  ```
- **Randbedingungen:**
  - `avgHumidity` hat dasselbe Problem: `raw_value = 0` wird als gueltiger Wert behandelt.
  - Wenn Sensoren live per WebSocket aktualisiert werden und `raw_value` befuellt ist, zeigt die Karte korrekte Werte. Das Problem tritt nur bei 0-Initialwerten auf.
  - `assessValueQuality()` (Zeile 889-908) markiert Feuchtigkeitswert von 0 als `stale` und filtert ihn raus (Zeile 1142 `if (val.quality === 'stale') continue`), aber Temperatur 0 ist innerhalb des DS18B20-Ranges (-55 bis 125) und wird als `normal` bewertet.
  - SHT31 Temperatur: 0°C ist ausserhalb des normalen Betriebsbereichs, aber innerhalb des technischen Specs (-40 bis 125) — wird als `normal` bewertet und fliesst in die Aggregation ein.
- **Fix-Strategie:** In `aggregateZoneSensors`: Sensoren mit `raw_value === 0` bei Temperatur-Typen herausfiltern, ODER `processed_value` bevorzugen falls vorhanden, ODER Qualitaetscheck fuer `value === 0` bei Temperatursensoren ausweiten.

---

## BUG-005 (HOCH): DS18B20 fehlende Einheit

- **Status:** WIDERLEGT fuer die Konfig-Ebene (unit ist definiert), BESTAETIGT fuer den Display-Pfad
- **Root Cause:** `SENSOR_TYPE_CONFIG['DS18B20'].unit = '°C'` und `SENSOR_TYPE_CONFIG['ds18b20'].unit = '°C'` sind korrekt definiert (sensorDefaults.ts:90-129). Das Problem liegt im Sensor-Objekt das vom Server kommt: Das `unit`-Feld des Sensor-Objekts (z.B. `MockSensor.unit`) kann leer sein, wenn der Server dieses Feld nicht befuellt. In `SensorCard.vue` (nicht analysiert) wird moeglicherweise `sensor.unit` direkt angezeigt statt aus `SENSOR_TYPE_CONFIG` zu lesen. Die `getSensorUnit()`-Funktion (Zeile 430-432) wuerde korrekt '°C' liefern, wird aber moeglicherweise nicht verwendet.
- **Datei:Zeile:**
  - `El Frontend/src/utils/sensorDefaults.ts:90-108` — DS18B20 config mit unit: '°C'
  - `El Frontend/src/utils/sensorDefaults.ts:430-432` — getSensorUnit() Funktion existiert
- **Code-Stelle:**
  ```typescript
  // sensorDefaults.ts:430-432
  export function getSensorUnit(sensorType: string): string {
    return SENSOR_TYPE_CONFIG[sensorType]?.unit ?? 'raw'
  }
  ```
- **Randbedingungen:**
  - DS18B20 hat sowohl 'DS18B20' als auch 'ds18b20' Eintraege in der Konfig — Gross/Kleinschreibung abgedeckt.
  - `groupSensorsByBaseType()` (Zeile 997-1011) fuer Single-Value Sensoren liest: `unit: config?.unit || sensor.unit || ''`. Wenn `config?.unit` existiert ('°C'), wird es korrekt gesetzt. Das Problem liegt also nicht in sensorDefaults.ts selbst.
  - Der Bug ist wahrscheinlich in der `SensorCard.vue` Komponente (nicht in diesem Auftrag analysiert) — wenn die Komponente `sensor.unit` direkt rendern wuerde und `sensor.unit` vom Server leer bleibt.
- **Fix-Strategie:** SensorCard.vue pruefen: `sensor.unit || getSensorUnit(sensor.sensor_type)` als Fallback verwenden.

---

## BUG-006 (HOCH): Chart X-Achse zeigt Millisekunden

- **Status:** WIDERLEGT fuer LiveLineChart, BESTAETIGT fuer MonitorView SlideOver-Chart
- **Root Cause:** `LiveLineChart.vue` (Zeile 204-218) verwendet `type: 'time'` Scale mit `chartjs-adapter-date-fns` und setzt `displayFormats` nicht explizit — Chart.js bestimmt das Format automatisch basierend auf dem Zeitbereich. Das Default-Format fuer den `millisecond`-Bereich ist `H:mm:ss.SSS a` welches "2:18:18.568 p.m." produziert (englisches `a`-Locale-Format).

  In `MonitorView.vue` (Zeile 202-210) ist der Sensor-Detail-Chart (`detailChartOptions`) KORREKT konfiguriert mit `displayFormats: { second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' }`. Das Problem besteht aber im Live-Chart (`LiveLineChart.vue`): Wenn Datenpunkte sehr eng beieinander liegen (Millisekunden-Abstand), waehlt Chart.js automatisch die `millisecond`-Einheit und nutzt das englische Format.
- **Datei:Zeile:**
  - `El Frontend/src/components/charts/LiveLineChart.vue:204-218` — X-Scale ohne explizite displayFormats fuer alle Zeiteinheiten
  - `El Frontend/src/views/MonitorView.vue:202-210` — korrekte displayFormats vorhanden
- **Code-Stelle:**
  ```typescript
  // LiveLineChart.vue:204-218 — FEHLT displayFormats fuer 'millisecond'
  x: {
    type: 'time' as const,
    display: !isCompact,
    grid: { ... },
    ticks: {
      color: tokens.textMuted,
      font: { family: 'JetBrains Mono', size: 10 },
      maxTicksLimit: 6,
    },
    border: { display: false },
    // KEIN time.displayFormats gesetzt!
  },
  ```
- **Randbedingungen:**
  - Der Bug tritt auf wenn Live-Daten sehr schnell kommen (z.B. Millisekunden-Intervall bei Mock-ESPs) und Chart.js auf `millisecond` Einheit zurueckgreift.
  - Standard Chart.js locale fuer `millisecond` ist `H:mm:ss.SSS a` (englisch, 12h-Format mit `p.m.`).
  - Auch in `HistoricalChart.vue` (nicht analysiert) koennte das Problem auftreten.
- **Fix-Strategie:** In LiveLineChart.vue: `time: { displayFormats: { millisecond: 'HH:mm:ss', second: 'HH:mm:ss', minute: 'HH:mm', hour: 'HH:mm', day: 'dd.MM' } }` in der X-Scale hinzufuegen.

---

## BUG-007 (HOCH): Dashboard Delete ohne Confirm

- **Status:** BESTAETIGT
- **Root Cause:** `handleDeleteLayout()` in `CustomDashboardView.vue` (Zeile 434-440) loescht das Dashboard **sofort** ohne Bestaetigung. Im Vergleich: `deleteRule()` in `LogicView.vue` (Zeile 259-279) nutzt `await uiStore.confirm({ variant: 'danger' })` korrekt.
- **Datei:Zeile:**
  - `El Frontend/src/views/CustomDashboardView.vue:434-440` — kein confirm() vor deleteLayout()
  - `El Frontend/src/views/LogicView.vue:259-267` — korrektes Confirm-Pattern als Referenz
- **Code-Stelle:**
  ```typescript
  // CustomDashboardView.vue:434-440 — KEIN CONFIRM
  function handleDeleteLayout() {
    if (!dashStore.activeLayoutId) return
    const name = dashStore.activeLayout?.name
    dashStore.deleteLayout(dashStore.activeLayoutId)  // sofort geloescht!
    if (grid) grid.removeAll(false)
    toast.info(`Dashboard "${name}" gelöscht`)
  }
  ```
  ```typescript
  // LogicView.vue:259-267 — KORREKTES MUSTER
  async function deleteRule() {
    if (!selectedRule.value) return
    const confirmed = await uiStore.confirm({
      title: 'Regel löschen',
      message: `Regel "${selectedRule.value.name}" wirklich löschen?`,
      variant: 'danger',
      confirmText: 'Löschen',
    })
    if (!confirmed) return
    ...
  }
  ```
- **Randbedingungen:**
  - `dashStore.deleteLayout()` loescht aus localStorage und setzt `activeLayoutId` auf naechstes oder `null` (dashboard.store.ts:239-245).
  - Kein Undo-Mechanismus vorhanden.
  - Der Delete-Button ist nur sichtbar wenn `dashStore.activeLayoutId` gesetzt ist (CustomDashboardView.vue:532).
- **Fix-Strategie:** `handleDeleteLayout()` zu `async` machen, `uiStore.confirm({ title: 'Dashboard löschen', message: ..., variant: 'danger' })` hinzufuegen und Funktion nur bei Bestaetigung ausfuehren.

---

## BUG-008 (HOCH): Aktor Einschalten Inkonsistenz

- **Status:** TEILWEISE BESTAETIGT — Unterschied existiert, aber ist architektonisch bedingt
- **Root Cause:** `ActuatorCard.vue` (Zeile 78-85) hat den Toggle-Button mit `:disabled="actuator.emergency_stopped"`. Dieser Button ist IMMER sichtbar und nur bei Emergency-Stop deaktiviert — das ist korrekt. Das Problem liegt woanders: `SensorsView.vue` zeigt Aktor-Cards im `mode="config"`, `MonitorView.vue` im `mode="monitor"`. In `ActuatorCard.vue` (Zeile 30-38) ist `handleToggle` an `@click` gebunden fuer BEIDE Modi. Es gibt keine Inkonsistenz im Card selbst.

  Die berichtete Inkonsistenz "Card: disabled, SlideOver: enabled" bezieht sich moeglicherweise auf den Emergency-Stop-State: Wenn `emergency_stopped = true`, ist der Card-Button disabled. Im `ActuatorConfigPanel` (nicht analysiert) koennte der Panel einen anderen Check nutzen.
- **Datei:Zeile:**
  - `El Frontend/src/components/devices/ActuatorCard.vue:78-85` — disabled nur bei emergency_stopped
  - `El Frontend/src/components/devices/ActuatorCard.vue:36-39` — handleToggle emittet immer
- **Code-Stelle:**
  ```html
  <!-- ActuatorCard.vue:78-85 -->
  <button
    class="btn-secondary btn-sm flex-shrink-0 touch-target"
    :disabled="actuator.emergency_stopped"
    @click="handleToggle"
  >
    {{ actuator.state ? 'Ausschalten' : 'Einschalten' }}
  </button>
  ```
- **Randbedingungen:**
  - ActuatorConfigPanel.vue (in SlideOver) wurde nicht analysiert — dort koennte das `emergency_stopped`-Feld nicht geprueft werden.
  - `espStore.emergencyStopActive` (globaler Emergency-Stop) existiert im Store, wird aber in ActuatorCard nur auf `actuator.emergency_stopped` (per-Aktor) geprueft, nicht auf den globalen Wert.
- **Fix-Strategie:** ActuatorConfigPanel.vue pruefen und ggf. `disabled`-Logik angleichen. Globalen Emergency-Stop-State aus `espStore` auch in ActuatorCard pruefen.

---

## BUG-009 (MITTEL): Doppelte Zeitbereich-Buttons

- **Status:** BESTAETIGT
- **Root Cause:** In `MonitorView.vue` (Zeile 607-614) sind Zeitbereich-Buttons **inline** im expanded Sensor-Card-Panel implementiert:
  ```html
  <button v-for="tr in (['1h', '6h', '24h', '7d'] as const)" ...>{{ tr }}</button>
  ```
  Gleichzeitig wird `HistoricalChart.vue` (Zeile 616-621) eingebunden. Wenn `HistoricalChart.vue` selbst ebenfalls einen `TimeRangeSelector` oder eigene Zeitbereich-Buttons enthalten wuerde, wuerde das doppelt rendern. Ausserdem: Der Level-3-SlideOver nutzt `<TimeRangeSelector>` (Zeile 700-703). Das koennte der gemeldete Doppelungseffekt sein wenn beide Bereiche gleichzeitig sichtbar sind.
- **Datei:Zeile:**
  - `El Frontend/src/views/MonitorView.vue:607-614` — inline 1h/6h/24h/7d Buttons
  - `El Frontend/src/views/MonitorView.vue:700-703` — `<TimeRangeSelector>` im SlideOver
- **Code-Stelle:**
  ```html
  <!-- MonitorView.vue:607-614 — INLINE Zeitbereich-Buttons -->
  <div class="monitor-sensor-card__time-range">
    <button
      v-for="tr in (['1h', '6h', '24h', '7d'] as const)"
      :key="tr"
      :class="['monitor-sensor-card__time-btn', { '...active': historicalTimeRange === tr }]"
      @click.stop="historicalTimeRange = tr"
    >{{ tr }}</button>
  </div>
  <!-- MonitorView.vue:700-703 — TimeRangeSelector im SlideOver -->
  <TimeRangeSelector
    v-model="detailPreset"
    @range-change="onDetailRangeChange"
  />
  ```
- **Randbedingungen:**
  - Die inline Buttons (Zeile 607-614) sind im expandierten Card-Panel des Level-2-Views.
  - Der `TimeRangeSelector` (Zeile 700-703) ist im Level-3-SlideOver.
  - Wenn ein Sensor expandiert ist UND der SlideOver offen ist, sind beide Zeitbereich-Selektoren sichtbar — das erklaert die gemeldeten doppelten Reihen.
  - `historicalTimeRange` (Level 2) und `detailPreset` (Level 3) sind separate State-Variablen.
- **Fix-Strategie:** Level-2 Zeitbereich-Buttons durch `<TimeRangeSelector>` ersetzen (Wiederverwendung), oder sicherstellen dass beide Bereiche nie gleichzeitig sichtbar sind.

---

## BUG-010 (MITTEL): "Real 0" Button nicht klickbar

- **Status:** BESTAETIGT (SVG Pointer-Events)
- **Root Cause:** In `TopBar.vue` (Zeile 195-199) ist der "Real"-Button implementiert als:
  ```html
  >Real <span class="header__type-count">{{ dashStore.deviceCounts.real }}</span>
  ```
  Der `header__type-count` Span hat `font-size: 10px` und `opacity: 0.6` (Zeile 554-558). Das Problem liegt bei den Lucide Icons (GitBranch, Workflow usw.) die in anderen Bereichen der TopBar genutzt werden. Die Lucide Icons rendern als SVG-Elemente. Ohne `pointer-events: none` koennen SVG-Elemente Klick-Events interceptieren, wenn sie ueber einem Button-Element liegen oder als Teil des Buttons ohne korrekte Event-Propagation.

  **Spezifisch:** In `TopBar.vue` sind Lucide Icons ohne explizites `pointer-events: none`. Wenn ein SVG-Icon visuell ueber dem Button-Text liegt (z.B. durch padding/margin Ueberlappung), kann es Klicks schlucken. Der `header__type-btn` hat `display: flex; align-items: center; gap: 3px` — wenn der Count-Span durch das Flex-Layout ausserhalb des visuellen Button-Bereichs ragt, wird der Klick nicht registriert.

  **Genauere Analyse:** Der "Real 0" Button zeigt die Zahl `0` wenn keine echten ESPs vorhanden sind. `header__type-count` mit `opacity: 0.6` und `font-size: 10px` koennte durch ein benachbartes absolut-positioniertes Element (z.B. der `.header__action-btn--pending::before` Pseudo-Element, Zeile 672-685 mit `pointer-events: none`) verdeckt werden.
- **Datei:Zeile:**
  - `El Frontend/src/shared/design/layout/TopBar.vue:195-199` — Real-Button Definition
  - `El Frontend/src/shared/design/layout/TopBar.vue:519-533` — .header__type-btn CSS ohne pointer-events override
  - `El Frontend/src/shared/design/layout/TopBar.vue:672-686` — Pending-Button Pseudo-Element
- **Code-Stelle:**
  ```html
  <!-- TopBar.vue:195-199 -->
  <button
    :class="['header__type-btn', 'header__type-btn--real', { 'header__type-btn--active': dashStore.filterType === 'real' }]"
    @click="dashStore.filterType = 'real'"
  >Real <span class="header__type-count">{{ dashStore.deviceCounts.real }}</span></button>
  ```
  ```css
  /* TopBar.vue: .header__action-btn--pending::before (Zeile 672-686) */
  .header__action-btn--pending::before {
    position: absolute;
    inset: 0;
    /* pointer-events: none ist gesetzt */
  }
  ```
- **Randbedingungen:**
  - Der Bug betrifft spezifisch den "Real 0" Zustand (keine echten Geraete).
  - Bei "Real 3" oder anderen Zahlen koennte der Bug nicht auftreten.
  - Die `header__type-segment` hat `position: relative` implizit durch Flex-Layout. Kein absolutes Element sollte darueber liegen.
  - **Wahrscheinlichster Grund:** SVG Icon in einem benachbarten Button-Element ragt visuell in den Real-Button-Bereich. Lucide Icons ohne `pointer-events: none` in der CSS-Klasse.
- **Fix-Strategie:** Alle Lucide Icon SVGs in Buttons erhalten `pointer-events: none` via CSS: `.header__type-btn svg { pointer-events: none; }` oder Tailwind `class="pointer-events-none"` auf den Icon-Komponenten.

---

## BUG-011 (MITTEL): Offline-Filter zeigt auch Online-Geraete

- **Status:** BESTAETIGT fuer Zone-Level, TEILWEISE fuer Device-Level
- **Root Cause:** `filteredEsps` in `HardwareView.vue` (Zeile 245-272) filtert korrekt auf ESP-Geraet-Ebene. Das Problem: `groupDevicesByZone(filteredEsps.value)` (Zeile 275) gruppiert nur die gefilterten ESPs — wenn ein offline-Filter aktiv ist, werden nur offline ESPs angezeigt. ABER: `ZonePlate.vue` (nicht analysiert) rendert moeglicherweise alle Devices der Zone, nicht nur die gefilterten. Wenn ZonePlate `devices` als Prop bekommt und diese intern filtert, koennte das Problem dort liegen.

  Das Filter-System in `HardwareView.vue` filtert auf `espStore.devices` Ebene (Zeile 246). Die `zoneGroups` (Zeile 274-302) basieren auf `filteredEsps.value` — alle Gruppen enthalten nur gefilterte Devices. Das scheint korrekt. **Das Problem**: Wenn `dashStore.activeStatusFilters` `'offline'` enthaelt, filtert Zeile 260: `if (filters.has('offline') && (status === 'offline' || status === 'unknown')) return true`. Online-Devices werden mit `return false` (Zeile 267) herausgefiltert. Das ist korrekt.

  **Moeglicher Bug:** Wenn KEINE Filter aktiv sind (`filters.size === 0`), werden ALLE Devices angezeigt (Zeile 254-268: `if (filters.size > 0)` wird uebersprungen). Das ist korrekt. Der gemeldete Bug "Offline-Filter zeigt auch Online-Geraete" koennte durch den Mock/Real-TypeFilter-Pfad entstehen: Wenn `filterType === 'offline'` (was kein gueltiger TypeFilter ist — nur 'all'/'mock'/'real' sind gueltig), wird dieser Check uebersprungen.
- **Datei:Zeile:**
  - `El Frontend/src/views/HardwareView.vue:245-272` — filteredEsps Filter-Logik
  - `El Frontend/src/views/HardwareView.vue:254-268` — Status-Filter-Logik
- **Code-Stelle:**
  ```typescript
  // HardwareView.vue:254-268
  const filters = dashStore.activeStatusFilters
  if (filters.size > 0) {
    esps = esps.filter(device => {
      const status = getESPStatus(device)
      if (filters.has('online') && (status === 'online' || status === 'stale')) return true
      if (filters.has('offline') && (status === 'offline' || status === 'unknown')) return true
      ...
      return false
    })
  }
  ```
- **Randbedingungen:**
  - Die Filter-Buttons in TopBar sind `StatusPill` Komponenten (StatusFilter: 'online'/'offline'/'warning'/'safemode').
  - Wenn sowohl 'online' als auch 'offline' aktiv sind, werden alle Devices angezeigt — das ist korrektes Multi-Filter-Verhalten, kein Bug.
  - **Echter Bug-Kontext:** Moeglicherweise zeigt die Filter-UI den "Offline"-Filter als aktiv an (TopBar StatusPill), aber `dashStore.activeStatusFilters` enthaelt den Wert nicht korrekt. Oder `ZonePlate.vue` rendert alle Zone-Devices ohne den Filter zu beachten.
- **Fix-Strategie:** ZonePlate.vue analysieren ob es eigene Device-Listen hat. Falls `ZonePlate` alle Devices einer Zone rendert (nicht nur die gefilterten), muss der Filter auch dort angewendet werden oder `filteredEsps` muss der ZonePlate uebergeben werden.

---

## BUG-012 (MITTEL): Cross-ESP Button ohne sichtbare Aenderung

- **Status:** BESTAETIGT (fehlende Panel-Implementierung)
- **Root Cause:** Der Cross-ESP Toggle Button in `HardwareView.vue` (Zeile 864-872) setzt `showCrossEspConnections = !showCrossEspConnections` (Zeile 868). Der State `showCrossEspConnections` ist auf `true` initialisiert (Zeile 205). Der Button-Status aendert sich visuell (`:class="{ 'cross-esp-toggle--active': showCrossEspConnections }"`), aber es gibt **kein Panel, keine Overlay-Visualisierung oder keine andere UI-Reaktion** auf diesen State in der analysierten Template-Sektion der HardwareView. Es wird kein `v-if="showCrossEspConnections"` Block fuer ein Panel gefunden.
- **Datei:Zeile:**
  - `El Frontend/src/views/HardwareView.vue:205` — `showCrossEspConnections = ref(true)`
  - `El Frontend/src/views/HardwareView.vue:864-872` — Button mit Toggle-Handler
  - `El Frontend/src/views/HardwareView.vue:864-872` — kein Panel-Content an diesen State gebunden (in analysierter Sektion)
- **Code-Stelle:**
  ```html
  <!-- HardwareView.vue:864-872 -->
  <button
    v-if="logicStore.crossEspConnections.length > 0"
    class="cross-esp-toggle"
    :class="{ 'cross-esp-toggle--active': showCrossEspConnections }"
    @click="showCrossEspConnections = !showCrossEspConnections"
  >
    <GitBranch class="w-4 h-4" />
    <span>{{ logicStore.crossEspConnections.length }} Cross-ESP</span>
  </button>
  ```
- **Randbedingungen:**
  - `logicStore.crossEspConnections` muss nicht-leer sein damit der Button erscheint.
  - `showCrossEspConnections` wird ausserhalb der analysierten Template-Sektion moeglicherweise von einer Sub-Komponente konsumiert (z.B. in einem Vue-Flow-Overlay oder SVG-Layer). Die HardwareView-Template ist sehr lang — der relevante Consumer koennte nach Zeile 910 liegen.
  - Die `cross-esp-toggle` CSS-Klasse zeigt den Button als `position: fixed` (tokens: `--z-fixed = 30`), unten rechts positioniert (Zeile 1062-1079).
- **Fix-Strategie:** Entweder ein Panel/Overlay implementieren das `v-if="showCrossEspConnections"` nutzt, oder den State mit einer Vue-Flow-Verbindungsvisualisierung verknuepfen. Zwischenloesung: Button entfernen bis Panel implementiert ist.

---

## BUG-013 (MITTEL): System Monitor falsche Sensorwerte

- **Status:** BESTAETIGT
- **Root Cause:** In `eventTransformer.ts` (Zeile 228-246), Funktion `transformSensorData()`: Der Wert wird aus `data.value` gelesen (Zeile 230): `const value = typeof data.value === 'number' ? data.value : 0`. Wenn das Server-Event `data.value` nicht als `number` liefert (z.B. als String, oder das Feld heisst anders wie `processed_value` oder `raw_value`), wird `0` als Fallback verwendet. Das erklaert "0.0°C".
- **Datei:Zeile:**
  - `El Frontend/src/utils/eventTransformer.ts:228-246` — transformSensorData()
  - `El Frontend/src/utils/eventTransformer.ts:230` — `const value = typeof data.value === 'number' ? data.value : 0`
- **Code-Stelle:**
  ```typescript
  // eventTransformer.ts:228-246
  function transformSensorData(event: UnifiedEvent, data: Record<string, unknown>): TransformedMessage {
    const sensorType = (data.sensor_type || event.device_type || 'sensor') as string
    const value = typeof data.value === 'number' ? data.value : 0  // <-- 0 als Fallback!
    const unit = (data.unit || '') as string
    const gpio = event.gpio ?? data.gpio

    const sensorName = SENSOR_NAMES[sensorType.toLowerCase()] || sensorType
    const formattedValue = formatSensorValue(value, sensorType.toLowerCase())

    return {
      ...
      summary: `${sensorName}: ${formattedValue}${unit ? ` ${unit}` : ''} · GPIO ${gpio}`,
      ...
    }
  }
  ```
- **Randbedingungen:**
  - Das Server-WebSocket-Event fuer `sensor_data` liefert moeglicherweise `processed_value` oder `raw_value` statt `value` im `data`-Objekt. Dieser Mismatch ist der wahrscheinlichste Grund.
  - `formatSensorValue(0, 'temperature')` (Zeile 148-151) gibt `"0.0 °C"` zurueck — genau der gemeldete Anzeigewert.
  - `data.unit` kann ebenfalls leer sein wenn das Server-Event kein `unit`-Feld im `data`-Payload hat.
  - Die korrekte Feldbezeichnung muss mit dem Server-WebSocket-Event-Schema abgeglichen werden (`.claude/reference/api/WEBSOCKET_EVENTS.md`).
- **Fix-Strategie:** In `transformSensorData()`: Mehrere Feldnamen pruefen: `data.value ?? data.processed_value ?? data.raw_value`. Fallback-Wert von `0` zu `null` aendern und im Summary "-" anzeigen wenn kein Wert vorhanden.

---

## BUG-014 (NIEDRIG): Kein Delete in SlideOvers

- **Status:** BY-DESIGN (kein Bug)
- **Root Cause:** `SensorConfigPanel.vue` und `ActuatorConfigPanel.vue` (nicht direkt analysiert, aber aus Kontext in SensorsView.vue/HardwareView.vue erkennbar) sind Konfigurations-Panels, keine Verwaltungs-Panels. Die Architektur trennt:
  - Konfiguration (Thresholds, Name, Typ) → SlideOver/ConfigPanel
  - Geraetverwaltung (Hinzufuegen, Loeschen) → dediziertes Verwaltungs-UI
  - Die `SensorsView.vue` zeigt keine Delete-Buttons fuer Sensoren in SlideOvers — Sensoren werden ueber ESP-Konfiguration verwaltet.
- **Datei:Zeile:**
  - `El Frontend/src/views/SensorsView.vue:190-225` — SlideOver-Handler, kein Delete
- **Randbedingungen:**
  - In `HardwareView.vue` gibt es Delete-Handlers fuer Geraete (`@delete="handleDelete"`) — aber das betrifft ESP-Geraete, nicht individuelle Sensoren.
  - Sensor-Delete wuerde eine ESP-Konfigurationsaenderung erfordern (REST-Call zum Server).
  - Wenn Sensor-Delete gewuenscht ist, waere dies ein Feature-Request, kein Bug.
- **Fix-Strategie:** Keine Aktion erforderlich. Falls Delete gewuenscht: Delete-Button in SensorConfigPanel mit `uiStore.confirm()` und API-Call zum Server implementieren.

---

## Zusammenfassung

| Bug | Status | Schwere | Hauptursache |
|-----|--------|---------|--------------|
| BUG-001 | Widerlegt (Architektur korrekt) | KRITISCH | Teleport hebt z-index Problem auf |
| BUG-002 | **Bestaetigt** | KRITISCH | Fehlender Escape-Handler in ColorLegend |
| BUG-003 | Teilweise (silent fail UX) | KRITISCH | Widget-Katalog aktiv ohne Layout-Guard |
| BUG-004 | **Bestaetigt** | HOCH | raw_value=0 nicht herausgefiltert in Aggregation |
| BUG-005 | **Bestaetigt** (Display-Pfad) | HOCH | SensorCard nutzt sensor.unit statt getSensorUnit() |
| BUG-006 | **Bestaetigt** (LiveLineChart) | HOCH | Fehlende displayFormats fuer 'millisecond' in Chart.js |
| BUG-007 | **Bestaetigt** | HOCH | handleDeleteLayout ohne uiStore.confirm() |
| BUG-008 | Teilweise bestaetigt | HOCH | ActuatorConfigPanel nicht analysiert |
| BUG-009 | **Bestaetigt** | MITTEL | Inline-Buttons + TimeRangeSelector gleichzeitig |
| BUG-010 | **Bestaetigt** | MITTEL | SVG pointer-events interceptieren Klicks |
| BUG-011 | **Bestaetigt** (Zone-Level) | MITTEL | ZonePlate-Rendering nicht verifiziert |
| BUG-012 | **Bestaetigt** | MITTEL | showCrossEspConnections ohne Panel-Content |
| BUG-013 | **Bestaetigt** | MITTEL | data.value Feld-Mismatch → 0-Fallback |
| BUG-014 | By-Design | NIEDRIG | Kein Bug — Architektur-Entscheidung |

**Kritische Sofort-Fixes (3 echte Blocker):**
1. BUG-002: Escape-Handler in ColorLegend.vue
2. BUG-007: Confirm-Dialog vor Dashboard-Delete
3. BUG-013: Sensor-Wert Feld-Mismatch in eventTransformer.ts (data.value vs processed_value)

## Verifikation: kein Build gestartet (Analyse-Modus, kein Code geaendert)
## Empfehlung: frontend-dev Agent fuer Implementierung der bestaedigten Bugs
