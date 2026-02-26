# Auftrag: View-Architektur + Dashboard-Integration + Navigation

> **Datum:** 2026-02-25
> **Korrigiert:** 2026-02-26 (Code-Review Robin — 8 Korrekturen)
> **Korrigiert:** 2026-02-26 (Erstanalyse-Ergebnisse — 6 kritische Korrekturen, siehe unten)
> **Aktualisiert:** 2026-02-26 (IST-Analyse: Dead Code BEREITS geloescht, ESPCardBase+useESPStatus existieren, Routing dokumentiert)
> **Prioritaet:** P1 (Strukturell)
> **Aufwand:** ~14-18 Stunden (5 Bloecke) — Aufwand wird sich durch Korrekturen aendern
> **Voraussetzung:** `auftrag-hardware-tab-css-settings-ux.md` Block A (CSS) muss erledigt sein — **IST-Analyse: ~60% bereits erledigt**
> **Agent:** Frontend-Dev Agent (auto-one)
> **Branch:** `feature/view-architecture-dashboard`

---

## ⚠ ERSTANALYSE-KORREKTUREN (2026-02-26)

> Die Erstanalyse (`auftrag-dashboard-umbenennung-erstanalyse.md` Block C) hat 6 kritische Fehleinschaetzungen in diesem Auftrag aufgedeckt.
> **Dieser Auftrag muss ueberarbeitet werden bevor die Implementierung beginnt.**

| # | Fehleinschaetzung | Realitaet | Betroffene Bloecke |
|---|-------------------|-----------|-------------------|
| **C1** | `useZoomNavigation.ts` (354 Z.) existiert | **Existiert NICHT.** Navigation ist direkt in HardwareView.vue route-basiert (`currentLevel` computed). Funktioniert korrekt | A1, A3, B2.6 |
| **C2** | ZoneMonitorView.vue als Basis fuer useMonitorPerspective.ts | **Dead Code (0 Imports).** 633 Zeilen nie integriert. Kann nicht als Basis dienen | A1 (komplett umschreiben) |
| **C3** | Monitor ist flache Perspektive → als Query-Parameter integrierbar | **Hat eigenes 2-Level-System** (`/monitor`, `/monitor/:zoneId`). Integration deutlich komplexer als geplant | A1, A2 (Monitor-Strategie ueberdenken) |
| **C4** | Tab-Struktur [Hardware] [Dashboards] | **Empfehlung: [Uebersicht] [Monitor] [Editor]** — Monitor als eigenstaendiger Tab behalten | A2, B4, E1 |
| **C5** | Redundanzen nur dokumentieren | **~1969 Zeilen Dead Code** in 5 Dateien mit 0 Imports → Cleanup VOR Architektur-Umbau | Neuer Block 0 |
| **C6** | DashboardGalleryView als neue View | **Gallery als Start-Screen im Editor-Tab** — kein Route-Umbau noetig, ~2h statt ~4h | B1, B2 |

> **Empfohlene Reihenfolge:** Dead-Code-Cleanup → Tab-Umbenennung → Gallery-Integration → dann Bloecke A-E ueberarbeiten.
> **Details:** Siehe `auftrag-dashboard-umbenennung-erstanalyse.md` Block C (C1-C6).

---

## Kontext

Die aktuelle View-Architektur hat strukturelle UX-Probleme:

1. **~~Monitor-Tab ist redundant~~** *(KORREKTUR C3: Monitor hat eigenes 2-Level-System, ist NICHT einfach redundant — sondern eine daten-fokussierte Perspektive gegenueber der topologie-fokussierten HardwareView. Zusammenlegung ist komplexer als angenommen.)*
2. **Dashboard-Tab ist unklar:** "Dashboard" suggeriert eine fertige Ansicht, ist aber der Builder. Gespeicherte Dashboards haben keinen Ort wo sie angezeigt werden.
3. **5+ Klicks bis Sensor-Config:** User muss durch Zone→ESP→Sensor navigieren, nur um einen Schwellwert zu aendern.
4. **Kein persistenter Overview:** Beim Drill-Down in Level 2/3 verschwindet der Gesamtueberblick komplett ("Lost in Space"-Problem, Baudisch 2002).

## Wissensgrundlage

| Thema | Datei | Relevante Erkenntnis |
|-------|-------|---------------------|
| Overview+Detail | `wissen/iot-automation/dashboard-cognitive-load-overview-detail-pattern.md` | Focus+Context ueberlegen gegenueber reinem Zooming. Overview MUSS sichtbar bleiben beim Detail-Drill (Baudisch 2002, 275 cit.) |
| Situational Awareness | `wissen/iot-automation/realtime-dashboard-ux-enduser-forschung.md` | 3-Level SA (Endsley): Perception→Comprehension→Projection. Startseite = Level 2 (Gesamtzustand pro Zone), nicht 50 einzelne ESPs |
| Dashboard Builder/Viewer | `wissen/iot-automation/iot-device-config-panel-ux-patterns.md` | ThingsBoard: Expliziter Edit-Mode-Toggle. Azure: Dashboard-Katalog. Node-RED: Kein harter Moduswechsel |
| SPOG-Formel | `wissen/iot-automation/ki-frontend-antipatterns-konsolidierung-2026.md` | Right Info, Right Time, Right Person, Minimal Friction. Max 3 Navigationsebenen |
| 3-Klick-Regel | `ki-frontend-antipatterns-konsolidierung-2026.md` | Klick 1→Alert-Liste, Klick 2→Detail+Kontext, Klick 3→Source |
| Klick-Benchmarks | `dashboard-cognitive-load-overview-detail-pattern.md` | Gesamtstatus <3s, Device in max 2 Klicks, Sensorwert in max 3 Klicks |
| Frontend-Inventar | `arbeitsbereiche/automation-one/Dashboard_analyse.md` | 16 Views, 97 Komponenten, 14 Stores, Tab-System ViewTabBar.vue |

## Architektur-Entscheidungen (VORGESCHLAGEN)

### Neue Tab-Struktur

**VORHER:**
```
[Hardware] [Monitor] [Dashboard]
```

**NACHHER:**
```
[Hardware] [Dashboards]
```

- **Hardware** absorbiert Monitor-Funktionalitaet als Sub-Perspektive
- **Dashboards** (Plural!) = Dashboard-Katalog + Builder + Viewer
- System-Funktionen (SystemMonitorView, Settings, UserManagement) bleiben in der Sidebar

### Hardware-Tab Interne Struktur

```
/hardware                    → Level 1: Zone-Overview (ZonePlates + UnassignedBar)
/hardware?view=monitor       → Level 1 ALT: Sensor-Monitor-Perspektive (nach Subzone gruppiert)
/hardware/:zoneId            → Level 2: Zone-Detail (ESPs + Sensor-Aggregation)
/hardware/:zoneId/:espId     → Level 3: ESP-Detail (Orbital/Sensor/Aktor-Config)
```

Der `?view=monitor` Query-Parameter schaltet die Darstellung auf Level 1 um:
- **Default (kein Parameter):** ZonePlates mit ESP-MiniCards (wie jetzt)
- **`?view=monitor`:** Sensor-Liste nach Subzone gruppiert mit Live-Werten + Sparklines (bisheriger MonitorView-Inhalt)

Ein Toggle-Button (Icon: Grid vs. List) wechselt zwischen beiden Perspektiven.

### Dashboard-Tab Interne Struktur

```
/dashboards                  → Dashboard-Katalog (Gallery/Liste)
/dashboards/new              → Builder (leeres Dashboard)
/dashboards/:id              → Viewer (gespeichertes Dashboard, Read-Only)
/dashboards/:id/edit         → Builder (bestehendes Dashboard)
```

---

## Vorbedingungen (Abhaengigkeiten vor Implementierungsbeginn)

> **KORRIGIERT (2026-02-26):** Explizite Vorbedingungen eingefuegt nach Code-Review.

Bevor mit der Implementierung begonnen wird, muss geklaert sein:

- [ ] **AccordionSection.vue** aus `auftrag-hardware-tab-css-settings-ux.md` Block B muss existieren (wird in A1 wiederverwendet) — **IST-Analyse: existiert NOCH NICHT**
- [x] **useESPStatus.ts** ~~aus `auftrag-hardware-tab-css-settings-ux.md` Block C muss existieren~~ — **IST-Analyse: EXISTIERT BEREITS** (176 Z., `composables/useESPStatus.ts`, 6 Status-Werte, genutzt von DeviceMiniCard + ESPCardBase). KEIN Blocker mehr
- [x] **ESPCardBase.vue** — **IST-Analyse: EXISTIERT BEREITS** (274 Z., 4 Varianten, Named Slots, nutzt useESPStatus). Hat aber 0 Consumer — Adoption muss in hardware-tab-css Block C erfolgen
- [ ] **SensorsView.vue Abgrenzung** (siehe Abschnitt unten) ist konzeptionell geklaert: `/sensors` = CRUD-Management, `?view=monitor` = Live-Read-Only
- [ ] **Dashboard-Persistenz Backend** (`/v1/dashboards`) ist fuer Block C3 NICHT erforderlich — localStorage-Interim ist im Plan vorgesehen und korrekt

---

## SensorsView.vue (/sensors) — Abgrenzung zur Monitor-Perspektive

> **KORRIGIERT (2026-02-26):** SensorsView.vue war im urspruenglichen Plan komplett ignoriert. Sie muss explizit abgegrenzt werden.

### Was SensorsView.vue ist

SensorsView.vue (`/sensors`, Sidebar-Eintrag "Komponenten") ist ein ~67KB schwerer Management-View mit:
- Sensor + Actuator Tabs
- Umfangreiche Filterfunktion (Typ, Status, Zone, Suchfeld)
- Gruppierung nach Zone / Subzone / ESP mit Accordion
- Inline-Sparklines + Expand-Charts
- Sensor-Konfiguration per SlideOver
- Add / Edit / Delete Sensor + Actuator (vollstaendiger CRUD)

### Klare Abgrenzung

| Aspekt | `/sensors` (SensorsView) | `/hardware?view=monitor` (Monitor-Perspektive) |
|--------|--------------------------|------------------------------------------------|
| Zweck | **CRUD-Management** | **Live-Ueberwachung** |
| Modus | Read + Write | Read-Only |
| Aktionen | Add/Edit/Delete Sensor, Zone-Zuweisung | Wert lesen, Alert-Status sehen |
| Zielgruppe | Techniker beim Einrichten | Operator beim Betrieb |
| Sparklines | Ja (Expand-Chart) | Ja (Mini, letzte 15 Min) |
| Sensor hinzufuegen | Ja | Nein |
| Kalibrierung | Ja (Link zu CalibrationWizard) | Nein |

### Konsequenz fuer diesen Auftrag

SensorsView.vue bleibt unveraendert als dedizierter Management-View. Die Monitor-Perspektive in HardwareView ist eine **andere Zielgruppe mit anderem Workflow**. Kein Merge noetig.

Die Monitor-Perspektive (`useMonitorPerspective.ts`) kann Teile der Gruppierungs-Logik aus SensorsView.vue wiederverwenden (Subzone-Accordion), aber SensorsView.vue selbst wird nicht angefasst.

---

## Redundanz-Inventar

> **KORRIGIERT (2026-02-26):** Redundanzen explizit dokumentiert fuer spaetere Bereinigung.

| Komponente | Pfad | Redundant mit | Status (IST-Analyse 2026-02-26) |
|------------|------|---------------|--------------------------------|
| SensorSidebar.vue | ~~`components/dashboard/`~~ | ComponentSidebar.vue | **GELOESCHT** ✓ (nur Kommentar-Referenzen verbleiben) |
| ActuatorSidebar.vue | ~~`components/dashboard/`~~ | ComponentSidebar.vue | **GELOESCHT** ✓ (nur Kommentar-Referenzen verbleiben) |
| LevelNavigation.vue | ~~`components/dashboard/`~~ | ViewTabBar.vue | **GELOESCHT** ✓ |
| ZoomBreadcrumb.vue | ~~`components/dashboard/`~~ | TopBar.vue Breadcrumb (Zeilen 74-100) | **GELOESCHT** ✓ (nur Kommentar in TopBar.vue verbleibt) |
| ZoneMonitorView.vue | ~~`components/zones/`~~ | MonitorView Level 2 Logik | **GELOESCHT** ✓ |

**Update (2026-02-26):** Alle 5 Redundanzen sind BEREITS GELOESCHT (~1969 Zeilen entfernt). Kein separater Cleanup-Auftrag mehr noetig.

---

## Block A: Monitor-Integration in Hardware (~4h)

### A1: MonitorView-Inhalte als Perspektive

> **KORRIGIERT (2026-02-26):** ZoneMonitorView.vue als Basis fuer useMonitorPerspective.ts explizit erwaehnen.

**ZoneMonitorView.vue besteht bereits (634 Zeilen)** und ist eine sensor+actuator-zentrische Zone-View mit Subzone-Gruppierung. Sie deckt ~80% der Monitor-Perspektiven-Logik ab, wird aber aktuell weder in HardwareView noch in MonitorView verwendet.

**Vorgehen:** NICHT neu schreiben, sondern ZoneMonitorView.vue als Basis nutzen:

1. Logik aus ZoneMonitorView.vue (Sensor-Gruppierung nach Subzone, Live-Werte, Sparklines) in Composable extrahieren: `useMonitorPerspective.ts`
2. ZoneMonitorView.vue kann danach als duenne Wrapper-Komponente bestehen bleiben oder direkt in HardwareView eingebettet werden
3. In HardwareView.vue einen Perspektiven-Toggle einbauen (oben rechts, neben Level-1-Header)
4. `?view=monitor` Query-Parameter steuert die Perspektive

**Toggle-Implementierung:**
```vue
<div class="perspective-toggle">
  <button
    :class="{ active: perspective === 'zones' }"
    @click="setPerspective('zones')"
    title="Zonen-Uebersicht"
  >
    <GridIcon />
  </button>
  <button
    :class="{ active: perspective === 'monitor' }"
    @click="setPerspective('monitor')"
    title="Sensor-Monitor"
  >
    <ListIcon />
  </button>
</div>
```

**Monitor-Perspektive zeigt:**
- Sensoren gruppiert nach Zone → Subzone (Accordion-Sections, wiederverwendbar aus `auftrag-hardware-tab-css-settings-ux.md` Block B)
- Pro Sensor: Name, Live-Wert, Quality-Badge, Mini-Sparkline (letzte 15 Min)
- Klick auf Sensor → SensorConfigPanel SlideOver (wie auf Level 3)
- Filter: Sensortyp, Status, Zone

### A2: MonitorView Route entfernen

- `/monitor` Route entfernen aus `router/index.ts`
- MonitorView.vue behalten als interne Komponente (wird von HardwareView importiert)
- ViewTabBar.vue: Monitor-Tab entfernen

> **KORRIGIERT (2026-02-26):** "Sidebar: Monitor-Eintrag entfernen" wurde gestrichen. Monitor war NIE in der Sidebar — er existierte nur im ViewTabBar. Kein Sidebar-Aenderungsbedarf fuer diesen Schritt.

### A3: Breadcrumb mit Status-Kontext

> **KORRIGIERT (2026-02-26):** Kein neues BreadcrumbNav.vue erstellen. TopBar.vue hat bereits Breadcrumbs (Zeilen 74-100). ZoomBreadcrumb.vue existiert ebenfalls (aber ungenutzt in HardwareView). Beide werden nicht neu gebaut, sondern erweitert.
>
> ~~**ABHAENGIGKEIT:** `useESPStatus.ts` aus `auftrag-hardware-tab-css-settings-ux.md` Block C muss vorher existieren~~ — **IST-Analyse: EXISTIERT BEREITS** (176 Z., 6 Status-Werte). KEIN Blocker mehr.

**Problem:** Beim Drill-Down in Level 2/3 verliert der User den Gesamtueberblick.

**Loesung:** Bestehende TopBar-Breadcrumb-Logik (TopBar.vue Zeilen 74-100) um Mini-Status-Indikatoren erweitern:

```
Hardware > Zone A (3/5 ● OK) > ESP_472204 (● Online)
```

Jedes Breadcrumb-Segment zeigt:
- Zone: Aggregierten Status ("3/5 OK" = 3 von 5 ESPs online)
- ESP: Online/Offline-Status
- Klick auf jedes Segment navigiert zurueck

**Implementation:**
- TopBar.vue Breadcrumb-Abschnitt (Zeilen 74-100) erweitern — KEIN neues BreadcrumbNav.vue
- Daten aus `useESPStatus.ts` Composable — **EXISTIERT BEREITS** (keine Abhaengigkeit mehr)
- ZoomBreadcrumb.vue ist redundant zur TopBar-Breadcrumb — als veraltet markieren, nicht anfassen

### A4: Sensor-Quick-Access (Klick-Reduktion)

**Ziel: Sensor-Config in max 3 Klicks statt 5.**

**Neuer Pfad:** Level 1 (Sensor-Monitor-Perspektive) → Klick auf Sensor → SensorConfigPanel SlideOver

Das sind 2 Klicks statt 5 (Level 1 → Zone → ESP → Sensor → Config).

Technisch: SensorConfigPanel muss auch OHNE ESP-Detail-Kontext funktionieren. Es braucht nur `sensorId` als Prop, den Rest laedt es selbst.

```typescript
// Neuer Composable: useSensorQuickAccess.ts
export function useSensorQuickAccess() {
  const isOpen = ref(false)
  const selectedSensorId = ref<string | null>(null)

  function openSensorConfig(sensorId: string) {
    selectedSensorId.value = sensorId
    isOpen.value = true
  }

  return { isOpen, selectedSensorId, openSensorConfig }
}
```

**Commit:** `refactor(views): merge monitor into hardware as perspective toggle`

---

## Block B: Dashboard-Katalog (Gallery) (~3h)

### B1: DashboardGalleryView.vue

Neue View unter `/dashboards` die alle gespeicherten Dashboards als Karten zeigt:

```
┌────────────────────────────────────────────────┐
│  Meine Dashboards               [+ Neues Dashboard]  │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │ ████████    │  │ ████████    │  │ ████████    │  │
│  │ █ █ █ █    │  │ ██  ██     │  │ █████████   │  │
│  │             │  │             │  │             │  │
│  │ Gewaechs-  │  │ Server-    │  │ Zonen-     │  │
│  │ haus       │  │ Status     │  │ ueberblick │  │
│  │ Aktualisiert│  │ Aktualisiert│  │ Aktualisiert│  │
│  │ vor 2 Min  │  │ vor 5 Min  │  │ vor 1h     │  │
│  │ Bearbeiten  │  │ Bearbeiten  │  │ Bearbeiten  │  │
│  │ Kopieren    │  │ Kopieren    │  │ Kopieren    │  │
│  │ Loeschen    │  │ Loeschen    │  │ Loeschen    │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  │
└────────────────────────────────────────────────────────┘
```

**Karten-Inhalt:**
- Thumbnail/Preview (Mini-Rendering oder Platzhalter mit Widget-Count)
- Dashboard-Name (editierbar per Inline-Edit)
- "Aktualisiert vor X" Timestamp
- Actions: Bearbeiten (→ Builder), Duplizieren, Loeschen (mit Bestaetigung)
- Default-Badge (Stern) fuer das Standard-Dashboard

**Leerer Zustand:** "Noch keine Dashboards erstellt. [+ Erstes Dashboard erstellen]"

### B2: Dashboard-Routing Umbau

> **KORRIGIERT (2026-02-26):** Die bestehende Route heisst `/custom-dashboard` (router/index.ts Zeilen 75-79), nicht `/dashboard`. `/dashboard-legacy` existiert bereits als Redirect nach `/hardware`. Alle Route-Referenzen entsprechend korrigiert.

**Vorher:**
```
/custom-dashboard → CustomDashboardView.vue (Builder, immer Edit-Mode)
/dashboard-legacy → Redirect nach /hardware (existiert bereits)
```

**Nachher:**
```
/dashboards          → DashboardGalleryView.vue (NEU)
/dashboards/new      → CustomDashboardView.vue (Builder, Edit-Mode)
/dashboards/:id      → DashboardViewerView.vue (NEU, Read-Only)
/dashboards/:id/edit → CustomDashboardView.vue (Builder, Edit-Mode, laedt bestehendes Dashboard)
```

### B3: DashboardViewerView.vue (Read-Only)

Eine schlanke View die ein gespeichertes Dashboard im Read-Only-Modus rendert:

- Gleiche GridStack-Instanz wie der Builder, aber `static: true` (kein Drag/Resize)
- Toolbar: Dashboard-Name, Zeitbereich-Auswahl, "Bearbeiten"-Button, Fullscreen-Toggle
- Widgets rendern live Daten (via WebSocket — das ist der Bug 3b Fix aus `auftrag-dashboard-reaktivitaet-performance.md`)
- URL shareable: `/dashboards/:id` kann als Bookmark gespeichert werden

### B4: ViewTabBar Anpassung

```vue
<!-- VORHER -->
<ViewTabBar :tabs="['Hardware', 'Monitor', 'Dashboard']" />

<!-- NACHHER -->
<ViewTabBar :tabs="[
  { label: 'Hardware', route: '/hardware' },
  { label: 'Dashboards', route: '/dashboards' }
]" />
```

**Commit:** `feat(dashboards): add gallery view, viewer mode, route restructure`

---

## Block C: Dashboard Edit-Mode Toggle (~3h)

### C1: Edit/View-Mode-Trennung in CustomDashboardView

**IST-Zustand:** CustomDashboardView ist IMMER im Edit-Mode. Es gibt keinen View-Mode.

**SOLL-Zustand (ThingsBoard-Pattern):**

```
┌──────────────────────────────────────────────────┐
│  Dashboard: Gewaechshaus   [Bearbeiten] [Uhr] [Vollbild]  │  ← View-Mode
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Widget 1 │ │ Widget 2 │ │ Widget 3 │          │
│  │ (Live)   │ │ (Live)   │ │ (Live)   │          │
│  └──────────┘ └──────────┘ └──────────┘          │
└──────────────────────────────────────────────────┘

                     ↓ Klick "Bearbeiten"

┌──────────────────────────────────────────────────┐
│  Dashboard: Gewaechshaus   [Speichern] [Abbrechen]│  ← Edit-Mode
│  ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │ Widget 1 │ │ Widget 2 │ │ Widget 3 │          │
│  │ [Edit][X]│ │ [Edit][X]│ │ [Edit][X]│          │
│  └──────────┘ └──────────┘ └──────────┘          │
│                                                    │
│  [+Widget-Library Sidebar]                         │
└──────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
const isEditMode = ref(false)

// GridStack Konfiguration
const gridOptions = computed(() => ({
  staticGrid: !isEditMode.value,
  disableResize: !isEditMode.value,
  disableDrag: !isEditMode.value,
}))

// Widget-Actions nur im Edit-Mode sichtbar
// Widget-Library-Sidebar nur im Edit-Mode geoeffnet
```

### C2: Unsaved Changes Warning

Wenn der User im Edit-Mode Aenderungen gemacht hat und navigiert:
- `beforeRouteLeave` Guard: "Ungespeicherte Aenderungen. Speichern / Verwerfen / Abbrechen?"
- `beforeUnload` Browser-Event als Fallback

### C3: Dashboard-Persistenz-Anbindung

Dieser Block HAENGT AB von `auftrag-dashboard-persistenz.md` (Backend-Endpoint `/v1/dashboards`).

**Wenn Backend noch nicht fertig:** localStorage als Interim, aber mit klarer API-Abstraktionsschicht:

```typescript
// dashboard.service.ts
export interface DashboardService {
  list(): Promise<Dashboard[]>
  get(id: string): Promise<Dashboard>
  save(dashboard: Dashboard): Promise<Dashboard>
  delete(id: string): Promise<void>
  duplicate(id: string, newName: string): Promise<Dashboard>
}

// Zwei Implementierungen:
export const localStorageDashboardService: DashboardService = { ... }
export const apiDashboardService: DashboardService = { ... }
```

So kann spaeter von localStorage auf API umgeschaltet werden ohne Frontend-Aenderungen.

**Commit:** `feat(dashboards): edit/view mode toggle, unsaved changes guard`

---

## Block D: Click-Path-Optimierung (~2h)

### D1: Kontext-Menues statt Navigation

> **KORRIGIERT (2026-02-26):** useContextMenu.ts existiert bereits und arbeitet mit `uiStore.openContextMenu(x, y, items)`. Kein neues `v-context-menu` Directive oder neue ContextMenu.vue Komponente erstellen.

**Rechtsklick / Long-Press auf ESP-MiniCard (Level 1):**
```
├── Sensor-Monitor oeffnen
├── Einstellungen
├── Zone aendern...
├── ──────────────
└── Loeschen
```

Das spart den Umweg ueber Level 2/3 fuer haeufige Aktionen.

**Implementation:** Bestehenden `useContextMenu.ts` Composable nutzen (`uiStore.openContextMenu(x, y, items)`). Nur die ContextMenu-Item-Liste fuer ESP-MiniCards definieren — keine neue Infrastruktur.

### D2: Global-Search (Cmd+K / Ctrl+K)

> **KORRIGIERT (2026-02-26):** `useCommandPalette.ts` existiert bereits mit Fuzzy-Search, Kategorien (navigation, devices, actions, rules, sensors) und Keyboard-Navigation. AppShell.vue Zeilen 36-43 binden Ctrl+K bereits an `uiStore.toggleCommandPalette()`. Kein neues `useGlobalSearch.ts` erstellen.

Schnellzugriff auf jeden Sensor, Aktor oder ESP per Name:

```
┌────────────────────────────────────────┐
│ Suche nach Sensor, ESP oder Zone...    │
│                                        │
│ Sensoren:                              │
│   ● Gewaechshaus Temp (SHT31, 23.5°C) │
│   ● Bodenfeuchte Beet 3 (Analog, 45%) │
│                                        │
│ ESPs:                                  │
│   ● ESP_472204 (Zone A, Online)        │
│                                        │
│ Zonen:                                 │
│   ● Zone A (5 Devices, 3/5 OK)        │
└────────────────────────────────────────┘
```

**Implementation:** Bestehende Command Palette (`useCommandPalette.ts`) erweitern:
- Kategorie "sensors" um Live-Werte ergaenzen (aktueller Wert in der Suchergebnisliste)
- Kategorie "devices" um ESP-Status (Online/Offline) ergaenzen
- Neue Kategorie "zones" hinzufuegen (Zone → Level 2 Navigation)
- Klick-Handler: Sensor → SensorConfigPanel SlideOver, ESP → Level 3, Zone → Level 2

Ctrl+K Binding in AppShell.vue existiert bereits — KEIN neues Binding.

### D3: Click-Path-Metrik

Verifiziere nach Implementierung:

| Aktion | Vorher | Nachher | Ziel |
|--------|--------|---------|------|
| Gesamtstatus erfassen | ~3s | <3s | <3s (Baudisch) |
| ESP finden und oeffnen | 3-4 Klicks | 1-2 Klicks | max 2 (Benchmark) |
| Sensor-Config oeffnen | 5 Klicks | 2-3 Klicks | max 3 (Benchmark) |
| Alert anerkennen | 2 Klicks | 1 Klick | 1 Klick (ISA-18.2) |
| Dashboard wechseln | 3 Klicks | 1-2 Klicks | max 2 |

**Commit:** `feat(ux): context menus, global search, click-path reduction`

---

## Block E: Abschluss + Integration (~2h)

### E1: Sidebar aktualisieren

> **KORRIGIERT (2026-02-26):** Die Sidebar hatte nie 6 Eintraege mit Monitor und Dashboard. Die echten Eintraege sind 9 (inkl. Admin-Bereich). Monitor und Dashboard existierten NUR im ViewTabBar, nicht in der Sidebar. Die Korrektur besteht darin, nur `/custom-dashboard` auf `/dashboards` umzubenennen.

**Echte Sidebar-Eintraege VORHER (9 Eintraege):**
```
Hardware         (/hardware — Link aktiv fuer /hardware, /monitor UND /custom-dashboard)
Regeln           (/rules)
Komponenten      (/sensors)
Zeitreihen       (/sensor-history)
--- Admin-Bereich ---
System           (/system)
Benutzer         (/users)
Wartung          (/maintenance)
Kalibrierung     (/calibration)
--- ---
Einstellungen    (/settings)
```

**Sidebar-Aenderung NACHHER (8 Eintraege):**
```
Hardware         (/hardware — Link aktiv fuer /hardware UND /dashboards)
Regeln           (/rules)
Komponenten      (/sensors)
Zeitreihen       (/sensor-history)
--- Admin-Bereich ---
System           (/system)
Benutzer         (/users)
Wartung          (/maintenance)
Kalibrierung     (/calibration)
--- ---
Einstellungen    (/settings)
```

**Konkrete Aenderungen:**
- Hardware-Link-Aktivierung: `/custom-dashboard` aus der Aktivierungs-Liste entfernen, `/dashboards` hinzufuegen
- Kein Sidebar-Eintrag hinzufuegen oder entfernen (Monitor war nie dort, Dashboard war nie dort)
- Die Tabs [Hardware] [Monitor] [Dashboard] im ViewTabBar werden zu [Hardware] [Dashboards]

**Hinweis zu SensorHistoryView.vue (/sensor-history, Sidebar "Zeitreihen"):** Bleibt unveraendert als dedizierter View fuer tiefe Zeitreihen-Analyse. Ueberschneidung mit HistoricalChart in MonitorView ist gewollt — unterschiedliche Detailtiefe fuer unterschiedliche Anwendungsfaelle.

### E2: Default-Route

```
/ → /hardware (Default-Landingpage)
```

Wenn ein User ein Default-Dashboard konfiguriert hat, koennte optional:
```
/ → /dashboards/:defaultId (User-Dashboard als Startseite)
```
→ Das ist eine Erweiterung fuer spaeter, nicht jetzt.

### E3: 404-Handling fuer alte Routes

> **KORRIGIERT (2026-02-26):** `/dashboard-legacy` existiert bereits als Redirect nach `/hardware` (kein neuer Redirect noetig). `/custom-dashboard` wird auf `/dashboards` umgeleitet.

```typescript
// Redirect alte Routes
{ path: '/monitor', redirect: '/hardware?view=monitor' },
{ path: '/custom-dashboard', redirect: '/dashboards' },
// Hinweis: /dashboard-legacy → /hardware existiert bereits, NICHT erneut anlegen
```

### E4: Tests + Verifikation

- [ ] `npm run build` erfolgreich
- [ ] Alle bestehenden Tests gruen
- [ ] Route `/hardware` funktioniert (Level 1/2/3)
- [ ] Route `/hardware?view=monitor` zeigt Sensor-Monitor-Perspektive
- [ ] Route `/dashboards` zeigt Gallery (auch leer)
- [ ] Route `/dashboards/new` oeffnet Builder
- [ ] Breadcrumb-Navigation auf Level 2/3 korrekt (TopBar.vue erweitert)
- [ ] Kontext-Menu auf ESP-MiniCard funktional (useContextMenu.ts genutzt)
- [ ] Ctrl+K oeffnet Command Palette (existiert bereits, Kategorien erweitert)
- [ ] Alte Routes redirecten korrekt (`/custom-dashboard` → `/dashboards`)
- [ ] SensorsView.vue (`/sensors`) unveraendert und funktional
- [ ] SensorHistoryView.vue (`/sensor-history`) unveraendert und funktional

**Commit:** `feat(nav): update sidebar, redirects, final integration`

---

## Abhaengigkeiten zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| `auftrag-hardware-tab-css-settings-ux.md` | **VORHER (Block A CSS mindestens, Block C useESPStatus.ts fuer A3 BLOCKING).** AccordionSection.vue und ESPCardBase werden hier wiederverwendet |
| `auftrag-orbital-split.md` | **PARALLEL MOEGLICH.** HardwareView importiert ESPOrbitalLayout — Pfad-Aenderung noetig wenn Split vorher passiert |
| `auftrag-dashboard-persistenz.md` | **SYNERGIEN:** Block B+C setzen das Dashboard-Service-Interface. Backend-Auftrag implementiert die API-Seite |
| `auftrag-dashboard-reaktivitaet-performance.md` | **SYNERGIEN:** Bug 3b (keine Live-Daten) muss fuer DashboardViewerView geloest sein |
| `auftrag-dnd-konsolidierung-interaktion.md` | **DANACH fuer Dashboard-DnD.** GridStack-DnD im Builder profitiert von der Edit/View-Trennung |
| `auftrag-unified-monitoring-ux.md` | **SYNERGIEN:** SystemStatusBar kann in die neue Breadcrumb-Leiste integriert werden. Global-Search findet auch Alerts |

---

## Zusammenfassung der Ergebnisse

> **KORRIGIERT (2026-02-26):** Sidebar-Eintraege 9→8 (nicht 6→5). Tabs 3→2 bleibt korrekt.

| Metrik | Vorher | Nachher |
|--------|--------|---------|
| Haupt-Tabs (ViewTabBar) | 3 (Hardware, Monitor, Dashboard) | 2 (Hardware, Dashboards) |
| Sidebar-Eintraege | 9 | 8 (nur Hardware-Link-Aktivierung geaendert) |
| Klicks bis Sensor-Config | 5 | 2-3 |
| Klicks bis ESP finden | 3-4 | 1-2 (Command Palette — bereits vorhanden, erweitert) |
| Gespeicherte Dashboards sichtbar | Nein (nur localStorage) | Ja (Gallery + URLs) |
| Dashboard Edit/View getrennt | Nein | Ja (ThingsBoard-Pattern) |
| Breadcrumb mit Status | Nein | Ja (TopBar.vue erweitert) |
| Monitor als eigener Tab | Ja (redundant) | Nein (integriert in Hardware) |
| SensorsView.vue (/sensors) | Unveraendert | Unveraendert (dedizierter CRUD-View) |
| ZoneMonitorView.vue | Ungenutzt | Als Basis fuer useMonitorPerspective.ts |
| Neue Infrastruktur-Komponenten | — | Nur BreadcrumbNav-Erweiterung entfaellt (TopBar.vue erweitert), kein useGlobalSearch.ts (Command Palette erweitert), kein neues ContextMenu (useContextMenu.ts genutzt) |
| Dead-Code-Bereinigung (~1969 Z.) | Offen | **ERLEDIGT** ✓ (IST-Analyse 2026-02-26: alle 5 Dateien geloescht) |
| useESPStatus.ts (Blocker fuer A3) | Nicht existent | **EXISTIERT** (176 Z., kein Blocker mehr) |
| ESPCardBase.vue | Nicht existent | **EXISTIERT** (274 Z., aber 0 Consumer — Adoption pending) |
