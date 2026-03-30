# Auftrag ED-2-FIX — View-Modi, Dashboard-Platzierung & Navigation

> **Typ:** Fix-Implementierung (9 Bugs aus ANALYSE-ED-2)
> **Schicht:** Frontend (El Frontend) — ausschliesslich
> **Grundlage:** ANALYSE-ED-2-Bericht 2026-03-30 (vollstaendige Analyse aller Dateien)
> **Geschaetzter Aufwand:** ~9-12h (Block 1+2+3+4 zusammen; Block 5 optional)
> **Abhaengigkeit:** Keine (unabhaengig von ED-1 und ED-3)
> **Roadmap:** `roadmap-editor-dashboard-integration-2026-03-30.md` Block B

---

## Kontext

AutomationOne hat einen Dashboard-Editor (`CustomDashboardView.vue`, ~1935 Zeilen) mit
zwei Modi: **Edit-Modus** (`isEditing === true`) und **Ansichtsmodus** (`isEditing === false`).
Der Editor ermoeglicht es, Dashboards im Monitor-View (`MonitorView.vue`) zu platzieren,
gesteuert durch das `target`-System auf `DashboardLayout`.

Die ANALYSE-ED-2 hat 9 Bugs identifiziert. Die meisten sind **keine Logik-Fehler** — das
Target-System und die InlineDashboardPanel-Pipeline sind technisch korrekt. Die Bugs sind
UX-Probleme (fehlende visuelle Differenzierung, fehlende Discoverability, fehlendes Feedback)
und totes Interface-Code (nie implementierte Felder, nie genutzte Modi).

**Was NICHT geaendert wird:**
- GridStack.js-Integration
- Chart.js / vue-chartjs (keine andere Bibliothek)
- Die 10 Widget-Typen (keine neuen, keine Entfernung)
- `tokens.css`-Tokens (nicht umbenennen, nicht entfernen)
- Backend-API-Contracts
- Firmwareschicht
- Phase-7 D1-D4-Implementierungen (Bulk-Cleanup, FAB, D2-Redirect bleiben)

---

## Dateien-Referenz

| Datei | Bekannte Groesse | Funktion im Kontext |
|-------|-----------------|---------------------|
| `CustomDashboardView.vue` (CDV) | ~1935 Zeilen | Editor-Container, `isEditing`-Toggle, Target-Dropdown |
| `MonitorView.vue` (MV) | ~3490 Zeilen | Monitor L1/L2, 4x InlineDashboardPanel |
| `InlineDashboardPanel.vue` (IDP) | ~424 Zeilen | Inline-Rendering, mode/compact Props |
| `dashboard.store.ts` | — | DashboardTarget Interface, Store-Computeds |

---

## Block 1 — Quick Wins (F2 + F3 + F8) — ~1.5h

Diese drei Fixes sind voneinander unabhaengig, benoetigen keine Architektur-Aenderungen
und koennen in beliebiger Reihenfolge umgesetzt werden.

---

### Fix F2 — MapPin immer sichtbar machen

**Problem (IST):**
Der MapPin-Button (der "Im Monitor anzeigen"-Konfigurator) ist nur im Edit-Modus sichtbar.
Zeile CDV:858: `v-if="dashStore.activeLayoutId && isEditing"`. Da `isEditing` beim Oeffnen
des Editors standardmaessig `false` ist, muss der User zuerst aktiv in den Edit-Modus
wechseln — ein nicht-offensichtlicher Schritt den viele User nicht kennen.

Das ist ein Discoverability-Problem: Die wichtigste Platzierungsfunktion versteckt sich
hinter einem Zustand der nicht intuitiv ist. Faustregel: Kernfunktionen gehoeren dauerhaft
erreichbar, nicht hinter Modi versteckt.

**SOLL:**
Der MapPin-Button ist immer sichtbar wenn ein Dashboard geladen ist (`activeLayoutId` gesetzt),
unabhaengig vom Edit/View-Modus.

**Aenderung (CDV:869):** <!-- [Korrektur verify-plan] Plan hatte :858 — tatsächliche Zeile ist 869. Zeile 858 ist der MonitorPlay router-link. Der Target-Wrapper-Div mit MapPin ist bei Zeile 869. -->

```vue
<!-- IST: -->
<div v-if="dashStore.activeLayoutId && isEditing" class="dashboard-builder__target-wrapper">

<!-- SOLL: -->
<div v-if="dashStore.activeLayoutId" class="dashboard-builder__target-wrapper">
```

Nur diese eine Stelle aendern. Das Dropdown-Innenleben (`setTarget()`, `clearTarget()`,
Zone-Scope-Selector) bleibt unveraendert.

**Akzeptanzkriterien:**
- MapPin-Icon ist sichtbar wenn ein Dashboard geladen ist, unabhaengig ob `isEditing` true oder false
- Im View-Modus (Eye-Icon aktiv) ist der MapPin sichtbar und klickbar
- Im Edit-Modus (Pencil aktiv) ist der MapPin weiterhin sichtbar
- MapPin verschwindet wenn kein Dashboard geladen ist (`activeLayoutId === null`) — unveraendert
- Alle anderen Toolbar-Elemente verhalten sich unveraendert

---

### Fix F3 — Toast-Feedback nach Target-Setzen

**Problem (IST):**
Nach dem Auswaehlen einer Platzierungsoption ("Monitor — Inline", "Monitor — Seitenpanel",
"Monitor — Unteres Panel") schliesst das Dropdown, aber der User erhaelt keinerlei Rueckmeldung.
Er weiss nicht: Wurde die Aenderung gespeichert? Wo kann er das Ergebnis sehen?

`setTarget()` (CDV:176–181) setzt `showTargetConfig.value = false` — das ist alles.
`clearTarget()` (CDV:197–203) analog.

Noch irritierender: "Monitor — Inline" bedeutet dass das Dashboard auf L2 (/monitor/:zoneId)
erscheint, aber NICHT auf L1 (/monitor). Der User navigiert zu /monitor und sieht nichts —
keine Erklaerung warum.

Sofortiges Feedback ist ein UX-Grundprinzip: Jede Zustandsaenderung braucht eine visuelle
Bestaetigung. Ohne Feedback entsteht Unsicherheit ("Hat das funktioniert?").

**SOLL:**
Nach `setTarget()` erscheint ein Toast mit:
- Text der die gesetzte Platzierung beschreibt (z.B. "Dashboard wird in Monitor — Inline angezeigt")
- Fuer `placement='inline'`: Hinweis "Sichtbar in der Zonen-Detailansicht (/monitor/:zone)"
- Fuer `placement='side-panel'` und `placement='bottom-panel'`: Hinweis "Sichtbar im Monitor-Layout"
- Fuer `view='hardware'`: Hinweis "Sichtbar in der Geraete-Uebersicht"

Nach `clearTarget()` erscheint ein Toast "Anzeigeort entfernt".

**Hinweis zur Toast-Bibliothek:** Das Projekt hat bereits eine Toast/Notification-Infrastruktur
(aus Phase 4 Notification-Stack). Bestehende Toast-Utility verwenden, keine neue npm-Bibliothek.

**Aenderung (CDV:176–203):**

```typescript
// IST:
function setTarget(view: 'monitor' | 'hardware', placement: string) {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, { view, placement })
  showTargetConfig.value = false
}

// SOLL:
function setTarget(view: 'monitor' | 'hardware', placement: string) {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, { view, placement })
  showTargetConfig.value = false

  const placementLabels: Record<string, string> = {
    'inline': 'Inline (Zonen-Detailansicht)',
    'side-panel': 'Seitenpanel',
    'bottom-panel': 'Unteres Panel',
  }
  const viewLabels: Record<string, string> = {
    'monitor': 'Monitor',
    'hardware': 'Geraete-Uebersicht',
  }
  const locationHints: Record<string, string> = {
    'monitor:inline': 'Sichtbar wenn du eine Zone im Monitor oeffnest (/monitor/:zone)',
    'monitor:side-panel': 'Sichtbar als Seitenleiste im Monitor-Layout',
    'monitor:bottom-panel': 'Sichtbar als unteres Panel im Monitor-Layout',
    'hardware:side-panel': 'Sichtbar in der Geraete-Uebersicht',
  }
  const hint = locationHints[`${view}:${placement}`] ?? ''
  showToast(`Dashboard wird angezeigt: ${viewLabels[view] ?? view} — ${placementLabels[placement] ?? placement}`, { subtitle: hint })
}

function clearTarget() {
  const layoutId = dashStore.activeLayoutId
  if (!layoutId) return
  dashStore.setLayoutTarget(layoutId, null)
  selectedZoneId.value = null
  showTargetConfig.value = false
  showToast('Anzeigeort entfernt')
}
```

<!-- [Korrektur verify-plan] Es gibt KEINE `showToast()`-Funktion. CDV hat bereits `const toast = useToast()` (CDV:43, `import { useToast } from '@/composables/useToast'`). Die korrekte API: `toast.info(message)`, `toast.success(message)` etc. `ToastOptions` hat KEIN `subtitle`-Feld — den Hint direkt in die message integrieren (Zeilenumbruch mit `\n` oder per Leerzeichen). Dedup gegen schnelles Klicken ist bereits eingebaut (DEDUP_WINDOW_MS=2000). -->
Die konkrete Toast-API verwenden: `toast.info(...)` / `toast.success(...)` aus dem bereits vorhandenen `const toast = useToast()` (CDV:43). Kein `subtitle`-Parameter — Hinweis direkt in den Message-String integrieren.

**Akzeptanzkriterien:**
- Nach Auswaehlen von "Monitor — Inline" erscheint ein Toast mit dem Hinweis auf Zonen-Detailansicht
- Nach Auswaehlen von "Monitor — Seitenpanel" erscheint ein Toast mit entsprechendem Hinweis
- Nach Auswaehlen von "Monitor — Unteres Panel" erscheint ein Toast
- Nach Auswaehlen von "Uebersicht — Seitenpanel" erscheint ein Toast
- Nach "Anzeigeort entfernen" erscheint ein "Entfernt"-Toast
- Toast ist kurz (max 4-5 Sekunden), nicht blockierend
- Keine doppelten Toasts bei schnellem Klicken

---

### Fix F8 — zoneId an Bottom/Side-Panels uebergeben

**Problem (IST):**
MonitorView hat vier Verwendungsstellen von `InlineDashboardPanel`. Nur Stelle 2 (L2-Inline-Panel)
uebergibt `zoneId`. Stelle 3 (Bottom-Panel, MV:2074) und Stelle 4 (Side-Panel, MV:2085)
uebergeben kein `zoneId`-Prop.

Das bedeutet: Widgets in Bottom- und Side-Panels haben keinen Zone-Context. Ein `SensorCard`-Widget
oder `GaugeWidget` in einem Side-Panel weiss nicht in welcher Zone es sich befindet und kann
keine zonenspezifischen Daten laden.

`InlineDashboardPanel` leitet `zoneId` an `useDashboardWidgets` weiter, der es an jedes
Widget-Props-Objekt uebergibt. `zoneId` ist ein optionales Prop (`zoneId?: string`) — das
Uebergeben von `undefined` ist sicher und veraendert nichts wenn kein Zone-Context vorhanden ist.

**SOLL:**
Bottom-Panel und Side-Panel erhalten `selectedZoneId ?? undefined` analog zu Stelle 2.

**Aenderung (MV:2074–2092):**

```html
<!-- IST Stelle 3 (Bottom-Panel, MV:2074-2081): -->
<InlineDashboardPanel
  v-for="panel in dashStore.bottomMonitorPanels"
  :layoutId="panel.id"
  mode="manage"
/>

<!-- SOLL Stelle 3: -->
<InlineDashboardPanel
  v-for="panel in dashStore.bottomMonitorPanels"
  :layoutId="panel.id"
  mode="manage"
  :zone-id="selectedZoneId ?? undefined"
/>

<!-- IST Stelle 4 (Side-Panel, MV:2085-2092): -->
<InlineDashboardPanel
  v-for="panel in dashStore.sideMonitorPanels"
  :layoutId="panel.id"
  mode="side-panel"
/>

<!-- SOLL Stelle 4: -->
<InlineDashboardPanel
  v-for="panel in dashStore.sideMonitorPanels"
  :layoutId="panel.id"
  mode="side-panel"
  :zone-id="selectedZoneId ?? undefined"
/>
```

`selectedZoneId` ist in MonitorView bereits vorhanden und wird fuer Stelle 2 genutzt.

**Akzeptanzkriterien:**
- `InlineDashboardPanel` an Stelle 3 und Stelle 4 hat `zoneId`-Prop gesetzt wenn eine Zone
  im Monitor gewaehlt ist (`selectedZoneId !== null`)
- Wenn keine Zone gewaehlt ist (L1), bleibt `zoneId` `undefined` — kein Fehler
- Stelle 1 (Zone-Tile) und Stelle 2 (L2-Inline) bleiben unveraendert
- Keine TypeScript-Fehler (`vue-tsc` bleibt clean)

---

## Block 2 — Ansichtsmodus als echter Preview (F1) — ~4-6h

### Fix F1 — View-Modus auf InlineDashboardPanel umschalten

**Problem (IST):**
Der Ansichtsmodus (Eye-Icon in der Toolbar, `isEditing === false`) ist der **Default-Zustand**
beim Oeffnen des Editors. Er deaktiviert GridStack-Interaktion (`grid.enableMove(false)`,
`grid.enableResize(false)`) und blendet Editor-Werkzeuge aus (Katalog, Import, Delete).
Aber: Der GridStack-Container wird weiterhin identisch gerendert.

Es gibt kein `v-if/v-else` das im View-Modus auf eine andere Darstellung umschaltet. Konsequenz:
Der User sieht beim Oeffnen des Editors exakt das gleiche wie im Edit-Modus — nur die Toolbar
ist kleiner. Es gibt kein erkennbares Signal "du bist jetzt im Vorschau-Modus".

Das verletzt das UX-Prinzip der klaren Mode-Differenzierung: Unterschiedliche Modi muessen
sich visuell unterscheiden. Der User muss sofort erkennen: "Ich kann hier nichts bearbeiten"
oder "Ich bin im Bearbeitungsmodus".

**Loesungsansatz:**
`InlineDashboardPanel` existiert bereits als vollstaendiger Dashboard-Renderer mit `readOnly: true`.
Alle 10 Widget-Typen werden darin korrekt gerendert. Es hat keinen GridStack-Overhead.
Im View-Modus wird statt des GridStack-Containers ein `InlineDashboardPanel` mit dem
aktuellen `activeLayoutId` gerendert.

**SOLL:**
Wenn `isEditing === false` UND ein Dashboard geladen ist (`activeLayoutId !== null`):
- GridStack-Container wird NICHT gerendert (oder ist hidden)
- Stattdessen: `<InlineDashboardPanel>` mit dem aktiven Layout-ID und `mode="view"`
- Toolbar ist auf das Minimum reduziert: Layout-Selector, MonitorPlay-Button, MapPin-Button,
  Edit-Toggle (Pencil-Icon mit Tooltip "Bearbeiten")
- Export-Button bleibt (read-only Funktion, passt zum View-Modus)

**Aenderung in CustomDashboardView.vue — Render-Bereich:**

<!-- [Korrektur verify-plan] CDV:1031–1039 ist NICHT der GridStack-v-else — das ist ein v-else-if Empty-State-Block (widgets.length===0 && !isEditing). Der tatsächliche v-else-GridStack-Block ist bei CDV:1042–1050. Die Blockstruktur vor dem v-else ist: v-if (Loader/Fehler) → v-else-if (Empty-State) → v-else (GridStack). Fix F1 muss den v-else bei CDV:1042 ansetzen, nicht 1031. Die Empty-State-Logik bleibt davon unberührt — im View-Modus ohne Widgets greift weiterhin der Empty-State v-else-if. -->
Der aktuelle Render-Bereich ist ein `v-else`-Block (CDV:1042–1050), dem ein `v-else-if`-Empty-State bei CDV:1027–1040 vorausgeht:
```vue
<!-- IST (v-else bei CDV:1042): -->
<div
  v-else
  ref="gridContainer"
  :class="[
    'grid-stack',
    { 'grid-stack--editing': isEditing },
    { 'grid-stack--drop-target': isEditing && dragStore.isDraggingDashboardWidget },
  ]"
/>

<!-- SOLL — GridStack v-else durch zwei Zweige ersetzen (CDV:1042). -->
<!-- [Korrektur verify-plan] `mode="view"` wird durch Fix F9 aus der Union entfernt. -->
<!-- Hier MUSS `mode="inline"` verwendet werden (kanonischer Modus nach F9). -->
<!-- Reihenfolge: F9 VOR oder ZUSAMMEN mit F1 implementieren, sonst TS-Fehler. -->
<div
  v-else-if="!isEditing"
  class="dashboard-builder__preview">
  <InlineDashboardPanel
    :layout-id="dashStore.activeLayoutId!"
    mode="inline"
  />
</div>

<!-- Edit-Modus: GridStack wie bisher (v-show statt v-if empfohlen) -->
<div
  v-show="isEditing"
  ref="gridContainer"
  :class="[
    'grid-stack',
    { 'grid-stack--editing': isEditing },
    { 'grid-stack--drop-target': isEditing && dragStore.isDraggingDashboardWidget },
  ]"
/>
```

**Wichtig zu beachten:**
- `InlineDashboardPanel` ist in `MonitorView` bereits importiert und genutzt — in `CustomDashboardView`
  muss es neu importiert werden (`import InlineDashboardPanel from '@/components/...`).
- Der GridStack-Container (`gridContainer` ref) muss WEITERHIN gerendert werden, da `useDashboardWidgets`
  ihn beim Initialisieren benoetigt. Loesungen: (a) `v-show` statt `v-if` auf dem GridStack-Container
  (bleibt im DOM, aber unsichtbar), oder (b) GridStack-Initialisierung nur wenn `isEditing=true`.
  **Empfehlung: `v-show` nutzen** um den bereits funktionierenden GridStack-Lifecycle nicht zu brechen.

```vue
<!-- Mit v-show (empfohlen): -->
<div v-else>
  <div v-if="!isEditing && dashStore.activeLayoutId"
       class="dashboard-builder__preview">
    <InlineDashboardPanel
      :layout-id="dashStore.activeLayoutId"
      mode="view"
    />
  </div>
  <div v-show="isEditing"
       ref="gridContainer"
       :class="['grid-stack',
         { 'grid-stack--editing': isEditing },
         { 'grid-stack--drop-target': isEditing && dragStore.isDraggingDashboardWidget }
       ]"
  />
</div>
```

**Toolbar-Reduktion im View-Modus:**

Die Toolbar-Elemente die im View-Modus ausgeblendet werden (aktuell korrekt implementiert
mit `v-if="isEditing"`): Plus-Button, Import-Button, Delete-Button.

Die Toolbar-Elemente die im View-Modus sichtbar bleiben sollen: Layout-Selector, Export-Button,
MonitorPlay-Link (nach F4-Fix auch fuer cross-zone), MapPin (nach F2-Fix), Edit-Toggle.

Neu: Ein visueller Hinweis "Vorschau-Modus" damit der User versteht warum er nichts
bearbeiten kann. Moeglichkeiten:
- Badge/Label "Vorschau" neben dem Titel oder im Layout-Selector-Bereich
- Tooltip auf dem Eye-Icon: "Vorschau-Modus aktiv — klicke auf Bearbeiten um das Dashboard
  zu bearbeiten"

**CSS fuer `.dashboard-builder__preview`:**
```css
.dashboard-builder__preview {
  width: 100%;
  min-height: 400px;
  padding: var(--space-4);
}
```

**Akzeptanzkriterien:**
- Beim Oeffnen des Editors (isEditing=false, Default) wird InlineDashboardPanel statt
  GridStack-Container angezeigt
- Die Widgets sind sichtbar und zeigen Live-Daten (Sensor-Readings, Charts)
- Keine GridStack-Handles (Resize, Move) sichtbar
- Beim Klick auf Pencil-Icon (Edit-Toggle): GridStack-Container erscheint,
  InlineDashboardPanel verschwindet
- Beim Klick auf Eye-Icon: zurueck zu InlineDashboardPanel-Ansicht
- `vue-tsc` bleibt fehlerfrei
- Browser-Konsole hat keine neuen Fehler beim Modus-Wechsel
- Widget-Katalog-Sidebar erscheint nur im Edit-Modus (unveraendert)
- Wenn kein Dashboard geladen ist (activeLayoutId = null): weder GridStack noch
  InlineDashboardPanel — bestehender Empty-State bleibt unveraendert

---

## Block 3 — Navigation & MonitorPlay (F4) — ~1h

### Fix F4 — MonitorPlay-Fallback fuer cross-zone und scope=undefined

**Problem (IST):**
`monitorRouteForLayout` (CDV:217–237) gibt `null` zurueck fuer:
- `scope === undefined` (Dashboard ohne gesetzten Scope)
- `scope === 'cross-zone'`
- `scope === 'zone-tile'`

Wenn die Funktion `null` zurueckgibt, ist der MonitorPlay-Link-Button (`v-if="monitorRouteForLayout"`)
komplett unsichtbar. Der User eines cross-zone Dashboards sieht keinen "Im Monitor anzeigen"-Button.

Cross-zone Dashboards sind explizit dafuer gebaut, mehrere Zonen uebergreifend zu zeigen —
sie gehoeren auf L1 (/monitor), die Zonen-Uebersicht.

Dashboards ohne Scope sind oft neu erstellte Dashboards die der User noch nicht konfiguriert hat.
Hier ist ein Toast sinnvoller als ein kaputt-wirkender fehlender Button.

**SOLL:**
- `scope === 'cross-zone'`: MonitorPlay-Button sichtbar, fuehrt zu Route `monitor` (L1)
- `scope === undefined`: MonitorPlay-Button sichtbar, Klick zeigt Toast "Setze zuerst einen
  Scope um das Dashboard im Monitor anzuzeigen. Oeffne das Target-Dropdown (Pin-Icon)."
- `scope === 'zone-tile'`: bleibt wie bisher (`null`) — Zone-Tile-Dashboards sind Mini-Widgets,
  kein direkter Monitor-Link noetig

**Aenderung (`monitorRouteForLayout` computed, CDV:217–237):**

```typescript
// IST (vereinfacht):
const monitorRouteForLayout = computed(() => {
  if (!activeLayout.value) return null
  const { scope, zoneId } = activeLayout.value
  if (scope === 'zone' && zoneId) return { name: 'monitor-zone-dashboard', ... }
  if (scope === 'sensor-detail' && ...) return { name: 'monitor-sensor', ... }
  return null  // cross-zone, undefined, zone-tile -> null
})

// SOLL: <!-- [Korrektur verify-plan] Lokale Variable ist `layout` (nicht `activeLayout.value`). -->
// Actual IST-Pattern: `const layout = dashStore.activeLayout` + früher Null-Check auf `layout?.scope`.
// SOLL entsprechend mit derselben Variable-Konvention:
const monitorRouteForLayout = computed(() => {
  const layout = dashStore.activeLayout
  if (!layout) return null
  const { scope, zoneId } = layout
  if (scope === 'zone' && zoneId) return { name: 'monitor-zone-dashboard', params: { zoneId, dashboardId: layout.id } }
  if (scope === 'sensor-detail' && zoneId && layout.sensorId)
    return { name: 'monitor-sensor', params: { zoneId, sensorId: layout.sensorId } }
  if (scope === 'cross-zone') return { name: 'monitor' }  // L1 fuer cross-zone
  if (!scope) return 'no-scope-hint'  // Sentinel-Wert: Button sichtbar, aber zeigt Hinweis
  return null  // zone-tile bleibt unsichtbar
})
```

Alternativ statt Sentinel-Wert: eine separate `showMonitorPlayHint = computed(() => !activeLayout.value?.scope && !!activeLayout.value)` Ref, und der MonitorPlay-Button hat zwei v-if-Zweige:

```vue
<!-- Normaler Link (scope gesetzt): -->
<router-link
  v-if="monitorRouteForLayout && monitorRouteForLayout !== 'no-scope-hint'"
  :to="monitorRouteForLayout"
  title="Im Monitor anzeigen"
>
  <MonitorPlay class="w-4 h-4" />
</router-link>

<!-- Hint-Button (kein scope): -->
<button
  v-else-if="activeLayout && !activeLayout.scope"
  @click="showToast('Kein Scope gesetzt. Waehle zuerst einen Scope oder setze einen Anzeigeort ueber das Pin-Icon.')"
  title="Scope fehlt — Im Monitor anzeigen nicht moeglich"
  class="dashboard-builder__tool-btn dashboard-builder__tool-btn--disabled"
>
  <MonitorPlay class="w-4 h-4 opacity-50" />
</button>
```

Die zweite Variante (separater Button) ist sauberer — keine Typ-Aenderung von `monitorRouteForLayout`.
Beide Varianten sind akzeptabel; die sauberere waehlen.

**Akzeptanzkriterien:**
- Fuer ein Dashboard mit `scope='cross-zone'`: MonitorPlay-Button sichtbar, Klick navigiert
  zu `/monitor` (L1)
- Fuer ein Dashboard mit `scope=undefined`: Ein MonitorPlay-Button ist sichtbar (ggf. ausgegraut),
  Klick zeigt einen Toast mit Erklaerung
- Fuer `scope='zone'` und `scope='sensor-detail'`: Verhalten unveraendert
- Fuer `scope='zone-tile'`: MonitorPlay bleibt unsichtbar — unveraendert
- Router-Navigation zu `monitor` funktioniert (kein 404, kein leerer Screen)

---

## Block 4 — Interface Cleanup (F5 + F6 + F9) — ~1h

Diese drei Fixes bereinigen toten Code. Das Prinzip: Code der nie genutzt wird und keine
Zukunftsplanung hat erzeugt kognitive Last und falsche Erwartungen. Entfernen ist besser als
Kommentieren.

---

### Fix F5 — `page`-Placement aus DashboardTarget entfernen

**Problem (IST):**
`DashboardTarget.placement` hat `'page'` als Union-Option (store:88):
```typescript
placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'
```
`'page'` wird nie im Editor-Dropdown angeboten, nie in `monitorRouteForLayout` behandelt,
und es gibt keinen InlineDashboardPanel-Slot dafuer in MonitorView.

Das Konzept "page" macht im aktuellen System keinen Sinn: Dashboards sind entweder inline
in MonitorView eingebettet (inline/side-panel/bottom-panel) oder als eigenstaendige View
aufgerufen (DashboardViewer via `monitor-zone-dashboard`). Ein drittes "page"-Konzept waere
eine eigene Route — die gibt es nicht und ist nicht geplant.

**SOLL:**
`'page'` aus der Union entfernen.

**Aenderung (dashboard.store.ts, Interface `DashboardTarget`):**
```typescript
// IST:
placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'

// SOLL:
placement: 'inline' | 'side-panel' | 'bottom-panel'
```

Nach der Typanpassung: TypeScript-Compiler via `vue-tsc` pruefen — alle Stellen die
`placement === 'page'` abfragen sind ebenfalls zu entfernen (sollte es keine geben).

**Akzeptanzkriterien:**
- `DashboardTarget.placement` Union enthaelt `'page'` nicht mehr
- `vue-tsc` ohne Fehler
- Keine existierenden DB-Datensaetze mit `placement: 'page'` werden beschaedigt
  (das Interface ist client-seitig; Server speichert JSON ohne Schema-Validation)

---

### Fix F6 — Ungenutzte Felder aus DashboardTarget entfernen

**Problem (IST):**
`DashboardTarget` Interface (store:85–92) hat drei Felder die in keiner Computed-Property,
in keinem Template, in keiner Filter-Logik jemals genutzt werden:
```typescript
anchor?: string
panelPosition?: 'left' | 'right'
panelWidth?: number
```
Das Side-Panel hat keine `panelPosition`-Unterscheidung (immer rechts, CSS-Grid mit
`grid-template-columns: 1fr 300px`). `panelWidth` wird nirgends in CSS oder Props genutzt.
`anchor` hat keine semantische Verwendung.

Diese Felder erzeugen falsche Erwartungen: Ein anderer Entwickler oder Auto-one-Agent
koennte annehmen dass `panelPosition: 'left'` das Panel links positioniert — tut es nicht.

**SOLL:**
Alle drei ungenutzten Felder entfernen. Wenn zukuenftig ein linkes Side-Panel gebraucht wird,
wird das Feld dann hinzugefuegt wenn es auch implementiert ist.

**Aenderung (dashboard.store.ts):**
```typescript
// IST:
interface DashboardTarget {
  view: 'monitor' | 'hardware'
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel'
  anchor?: string
  panelPosition?: 'left' | 'right'
  panelWidth?: number
  order?: number
}

// SOLL (nach F5 + F6):
interface DashboardTarget {
  view: 'monitor' | 'hardware'
  placement: 'inline' | 'side-panel' | 'bottom-panel'
  order?: number
}
```

`order` bleibt — wird fuer die Sortierung in `sideMonitorPanels` und `bottomMonitorPanels`
aktiv genutzt (store-interne `sort()`-Aufrufe).

**Akzeptanzkriterien:**
- `anchor`, `panelPosition`, `panelWidth` nicht mehr im Interface
- `vue-tsc` ohne Fehler
- `order` bleibt erhalten

---

### Fix F9 — `mode='view'` in InlineDashboardPanel dokumentieren oder vereinheitlichen

**Problem (IST):**
`InlineDashboardPanel` akzeptiert `mode?: 'view' | 'manage' | 'inline' | 'side-panel'` (IDP:28–40).
`mode='view'` und `mode='inline'` verhalten sich identisch — es gibt kein `isViewMode`-Computed
und keinen Code-Unterschied. Nur `isSidePanel` und `isManageMode` werden computed (IDP:59–66).

Das erzeugt eine semantisch falsche API: Wer `mode='view'` nutzt (Stelle 1, Zone-Tile) tut
dasselbe wie `mode='inline'` — aber das ist aus dem Code nicht ersichtlich.

**SOLL:**
Einen der beiden Modi als kanonisch festlegen und im Code markieren. Empfehlung:
`mode='inline'` als Default (ist bereits der Interface-Default) belassen. `mode='view'`
entweder:
- (a) Per JSDoc-Kommentar als Alias fuer `inline` dokumentieren, oder
- (b) Alle Verwendungen von `mode='view'` auf `mode='inline'` aendern und `'view'`
  aus der Union entfernen

Option (b) ist sauberer. Einzige Verwendung ist Stelle 1 (MV:1756) — eine Stelle aendern.

**Aenderung Option (b):**

In `InlineDashboardPanel.vue` (IDP:28–40) Interface:
```typescript
// IST:
mode?: 'view' | 'manage' | 'inline' | 'side-panel'

// SOLL:
mode?: 'manage' | 'inline' | 'side-panel'
// Default bleibt 'inline'
```

In `MonitorView.vue` (MV:1756):
```html
<!-- IST: -->
<InlineDashboardPanel ... mode="view" ... />

<!-- SOLL: -->
<InlineDashboardPanel ... mode="inline" ... />
```

**Akzeptanzkriterien:**
- `mode='view'` ist entweder aus dem Union entfernt (Option b) oder per JSDoc klar
  als Alias dokumentiert (Option a)
- Zone-Tile Mini-Widget (Stelle 1) funktioniert unveraendert
- `vue-tsc` ohne Fehler
- Verhalten der Zone-Tile-Darstellung identisch zum IST-Zustand

---

## Block 5 (Optional) — Dashboard-Dropdown um Metadaten erweitern (F7) — ~4-6h

**Status:** Optional. Nur umsetzen wenn Block 1-4 abgeschlossen und verifiziert sind.
Aufwandschaetzung aus ANALYSE-ED-2: 6-10h fuer eigene View. Hier konservativer Ansatz:
Metadaten ins bestehende Dropdown einbauen (~4-6h), keine neue View.

**Problem (IST):**
Die Dashboard-Uebersicht ist ein kompaktes Dropdown des Layout-Selectors (CDV:788–843).
Pro Dashboard-Eintrag wird nur gezeigt: `[Checkbox] [Name] [Auto-Badge] [Trash-Icon]`.

Fehlende Metadaten die ein User braucht um Dashboards zu unterscheiden:
- Widget-Anzahl ("3 Widgets")
- Scope-Badge (zone / cross-zone / zone-tile / kein Scope)
- Zone-Name wenn scope='zone' (welche Zone?)
- Target-Platzierung (wo wird es angezeigt? Monitor-Inline / kein Ort)

**SOLL:**
Das Dropdown bleibt ein Dropdown (keine neue View). Jeder Eintrag erhaelt eine zweite Zeile
mit Metadaten:

```
[Checkbox] [Name]                    [Auto-Badge] [Trash]
           [zone-badge] Zelt Zone · 3 Widgets · Monitor Inline
```

**Aenderung (CDV:788–843, Layout-Liste im Dropdown):**

Fuer jeden `layout` in `dashStore.layouts` eine zweite Zeile mit:
1. Scope-Badge: `scope='zone'` → kleines Badge "Zone", `scope='cross-zone'` → "Cross-Zone",
   `scope='zone-tile'` → "Kachel", `undefined` → "Kein Scope"
2. Zone-Name: wenn `layout.zoneId`, Namen aus `zoneStore` oder `dashStore` laden —
   `getZoneName(layout.zoneId)` Helper nutzen (oder `zones.find(z => z.id === layout.zoneId)?.name`)
3. Widget-Anzahl: `layout.widgets.length` Widgets
4. Target-Kurztext: wenn `layout.target`:
   `${layout.target.view === 'monitor' ? 'Monitor' : 'Geraete'}
    ${placement === 'inline' ? 'Inline' : placement === 'side-panel' ? 'Seite' : 'Unten'}`
   Sonst: "Kein Anzeigeort"

CSS-Aenderung: Die Dropdown-Eintraege erhalten mehr hoehe (`min-height: 52px` statt `40px`).
Text-overflow ellipsis auf Name beibehalten.

**Akzeptanzkriterien:**
- Jeder Dashboard-Eintrag im Dropdown zeigt Scope, Zone-Name (wenn vorhanden),
  Widget-Anzahl und Target-Platzierung
- Dropdown-Breite passt sich dem Inhalt an (kein horizontales Scrolling)
- D1-Features (Einzelloeschen, Bulk-Cleanup) funktionieren unveraendert
- Lange Namen werden weiterhin per ellipsis gekuerzt
- Erstellen, Importieren, Vorlagen-Sektion im Dropdown funktionieren unveraendert

---

## Reihenfolge und Abhaengigkeiten

```
Block 1 (F2 + F3 + F8) — ZUERST: Quick Wins, unabhaengig, ~1.5h
        |
        v
Block 2 (F1) — DANACH: braucht F2 fertig (MapPin soll auch im Preview sichtbar sein), ~4-6h
        |
        v
Block 3 (F4) + Block 4 (F5+F6+F9) — PARALLEL: unabhaengig voneinander, ~1h + ~1h
        |
        v
Block 5 (F7) — OPTIONAL: erst wenn Block 1-4 verifiziert, ~4-6h
```

**Grund fuer Reihenfolge Block 1 vor Block 2:**
F1 (View-Modus) rendert InlineDashboardPanel wenn `isEditing=false`. F2 macht den MapPin
auch im View-Modus erreichbar. Beide zusammen ergeben erst die vollstaendige UX:
Nutzer oeffnet Editor → sieht Preview → kann MapPin direkt anklicken ohne erst in Edit-Modus
wechseln zu muessen.

---

## Gemeinsame Akzeptanzkriterien (alle Bloecke)

- `vue-tsc --noEmit` laeuft ohne neue Fehler nach JEDEM Block
- `npm run build` (oder aequivalentes Build-Kommando) erfolgreich
- Browser-Konsole nach dem Build ohne neue Vue-Warnungen oder TypeScript-Fehler
- Keine bestehenden Tests (Vitest + Playwright) werden durch die Aenderungen gebrochen
- Alle Aenderungen sind auf die genannten Dateien beschraenkt:
  `CustomDashboardView.vue`, `MonitorView.vue`, `InlineDashboardPanel.vue`,
  `dashboard.store.ts`
- Keine neuen npm-Pakete ausser wenn zwingend noetig (Toast-Bibliothek: bestehende nutzen)

---

## Nicht in diesem Auftrag

- Widget-Konfiguration (Range, Einheit, Titel bei Sensor-Wechsel) → ANALYSE-ED-1 / ED-1-FIX
- Aktor-Steuerung und Logic-Rules-Integration → ANALYSE-ED-3 / ED-3-FIX
- GridStack DnD-Verbesserungen → eigene Phase (D5 optional)
- Mobile-Responsive Dashboard-Layout → spaeteres Thema
- Backend-API-Aenderungen
- Neue Dashboard-View als eigene Route (F7 bleibt Dropdown-Erweiterung, keine neue Page)
- `inlineMonitorPanels` Alias-Assignment (Bug 9 aus dem Bericht): Das ist ein kosmetisches
  Problem ohne funktionale Auswirkung. Kein Refactoring im Rahmen dieses Auftrags.
