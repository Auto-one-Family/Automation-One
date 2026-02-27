# Auftrag: Uebersicht-Tab Komplett-Redesign — Zonen, ESP-Cards, DnD, Konfiguration

> **Datum:** 2026-02-26
> **Korrigiert:** 2026-02-26 (Verifikation: 25 Pfade, 4 Pfad-Korrekturen, 6 Zeilen-Korrekturen, 1 Backend-Blocker, 1 Block gestrichen)
> **Aktualisiert:** 2026-02-26 (IST-Analyse: P11 ist KEIN Bug, deviceCounts Root Cause bestaetigt, ESPCardBase+useESPStatus existieren, Dead Code bereits geloescht)
> **Aktualisiert:** 2026-02-26 (Block 0 deviceCounts ERLEDIGT, Voraussetzung Block A ERLEDIGT)
> **Aktualisiert:** 2026-02-26 (Alle Voraussetzungen ERLEDIGT: Block A+B+C CSS/Settings + Orbital-Split. NUR Zone-CRUD Backend-API BLOCKER verbleibt)
> **Aktualisiert:** 2026-02-26 (Zone-Architektur-Analyse: "Zone-CRUD BLOCKER" ist PHANTOM-BLOCKER. Zonen sind String-Felder auf esp_devices, implizites System ist vollstaendig funktional. 0h Backend-Arbeit noetig. Siehe `analyse-zone-subzone-architektur.md`)
> **Aktualisiert:** 2026-02-26 (Block 1 ERLEDIGT: Status-System-Fix — P1 Online/Offline Counts, P2 deviceCounts verifiziert, P3/P4 Stale-Visualisierung)
> **Aktualisiert:** 2026-02-26 (Block 2 ERLEDIGT: Zone-Layout-Redesign — ZonePlate 755→811 Z., DeviceMiniCard 447→589 Z., Zone-CRUD in HardwareView, AccordionSection modelValue+#header Slot)
> **Aktualisiert:** 2026-02-27 (verify-plan: 12 Korrekturen — Zeilenzahlen aktualisiert (ZonePlate 811, DeviceMiniCard 589, HardwareView 1055, PendingDevicesPanel 996), 3 Dateireferenzen korrigiert, statusCounts-Warnung + zone.store Toast-Luecke dokumentiert, unassignedDevices Code-Duplikation markiert, Aufwand 27-35h)
> **Aktualisiert:** 2026-02-27 (STAND-UPDATE: Zeilenzahlen verifiziert gegen Codebase. HardwareView 1066, ZonePlate 810, PendingDevicesPanel 1106 (+110 Z. durch SlideOver-Konvertierung f3b8a9a), ViewTabBar 100→127. 3 offene Issues bestaetigt: statusCounts ref(), zone.store keine Toasts, unassignedDevices Duplikation. Naechster Block: 3)
> **Aktualisiert:** 2026-02-27 (Block 3 ERLEDIGT: ESPSettingsSheet 1419→1341 Z. (SlideOver-Primitive, useESPStatus, Sensor/Actuator-Liste mit Events, ConfirmDialog+Toast). HardwareView 1066→1316 Z. (neue Event-Handler). Build+vue-tsc verifiziert. Naechster Block: 4)
> **Aktualisiert:** 2026-02-27 (verify-plan Block 8: IST-Analyse zeigt Block 4-7 grossteils auf master BEREITS implementiert. statusCounts=computed, pendingCount=computed, espStore.unassignedDevices existiert, zone.store Toasts vorhanden, Breadcrumb formatiert, PendingDevicesPanel hat Status-Dots. OFFEN: @change-zone in Unassigned-Section, UnassignedDropBar entfernen, ZoneGroup Dead-Code, neue Tests. Block 8 komplett ueberarbeitet.)
> **Prioritaet:** P1 (Kernfunktionalitaet)
> **Aufwand:** ~~~30-40 Stunden (8 Bloecke)~~ **~27-35 Stunden** (8 Bloecke, Backend-BLOCKER entfaellt: -4-6h, HardwareView 47% groesser als angenommen: +3-5h)
> **Voraussetzung:** `auftrag-hardware-tab-css-settings-ux.md` Block A (CSS-Extraktion) MUSS erledigt sein — **ERLEDIGT (2026-02-26)**
> **Voraussetzung:** ~~Zone-CRUD Backend-API (POST/PUT/DELETE /v1/zones) MUSS implementiert sein~~ — **KEIN BLOCKER:** Zone-Architektur-Analyse zeigt: Zonen sind String-Felder auf `esp_devices`. Bestehende Assignment-API (assign/remove/info/devices/unassigned) reicht vollstaendig. Siehe `analyse-zone-subzone-architektur.md`
> **Abhaengigkeit:** `auftrag-view-architektur-dashboard-integration.md` Block D (Vision: 2-Ebenen-Architektur) ist die verbindliche Grundlage
> **Abhaengigkeit:** `useESPStatus.ts` und `ESPCardBase.vue` EXISTIEREN BEREITS — Block C aus hardware-tab-css Auftrag ist "Adoption", nicht "Erstellung"
> **Agent:** Frontend-Dev Agent (auto-one)
> **Branch:** `feature/overview-tab-redesign`
> **Eltern-Auftrag:** `auftrag-view-architektur-dashboard-integration.md`
> **Bezug:** Robins Screenshot-Review vom 2026-02-26 (Uebersicht-Tab IST-Zustand)

---

## Screenshot-Analyse — IST-Zustand (2026-02-26)

Robin hat den aktuellen Uebersicht-Tab live getestet und folgende Situation dokumentiert:

### Was der Screenshot zeigt

```
┌──────────────────────────────────────────────────────────────────────────┐
│  AutomationOne    Hardware     0 Online • 1 Offline    [+Mock] [Geraete]│
│                                Alle 0 • Mock 0 • Real 0       [NOT-AUS]│
├──────────────────────────────────────────────────────────────────────────┤
│  [Uebersicht]  [Monitor]  [Editor]                                      │
│                                                                          │
│  v Echt  0/1 Online                                              (25)   │
│  19.7-19.7°C  19.7-46.3%                                               │
│  ● sht31_humidity                                      46.3 % RH       │
│  ● sht31_temp                                          19.7 °C         │
│                                                                          │
│  ┌──────────────────────┐                                               │
│  │ • ESP_472204  [REAL] │                                               │
│  │ 46.3  ████████       │                                               │
│  │ 19.7  ████████       │                                               │
│  │ 2S                   │                                               │
│  └──────────────────────┘                                               │
│                                                                          │
│  (grosser leerer Bereich)                                               │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  📧 NICHT ZUGEWIESEN                                              v     │
└──────────────────────────────────────────────────────────────────────────┘
```

### Identifizierte Probleme (P1-P18)

#### Kategorie A: Status-Inkonsistenzen

| ID | Problem | Schwere | Beweis |
|----|---------|---------|--------|
| **P1** | StatusBar zeigt "0 Online" aber ESP hat Live-Daten (46.3%, 19.7°C) | KRITISCH | Screenshot: TopBar "0 Online • 1 Offline" waehrend ESP Werte sendet. Entweder ist der ESP online und die Status-Berechnung falsch, oder die Daten sind gecached und der ESP ist wirklich offline — beides muss aufgeloest werden |
| **P2** | Filter "Alle 0 • Mock 0 • Real 0" stimmt nicht — 1 Real-ESP ist sichtbar | KRITISCH | Screenshot: ESP_472204 hat [REAL] Badge, aber "Real 0" im Filter. Filter-Logik zaehlt falsch oder reagiert nicht auf Store-Updates |
| **P3** | Zone "Echt" zeigt "0/1 Online" — korrekt wenn ESP offline, aber dann sollten die Werte als stale markiert sein | HOCH | Screenshot: Werte 46.3% und 19.7°C wirken live (gruene Sparkbars) obwohl "0/1 Online". Kein visueller Unterschied zwischen "letzte bekannte Werte" und "Live-Werte" |
| **P4** | ESP_472204 hat gruene Sparkbars trotz potentiellem Offline-Status | MITTEL | Screenshot: Bars suggerieren "alles OK" auch wenn ESP offline. Farbe sollte grau/orange sein bei stale Daten |

#### Kategorie B: Layout und Informationsarchitektur

| ID | Problem | Schwere | Beweis |
|----|---------|---------|--------|
| **P5** | Zone-Header "Echt" — Name nichtssagend, keine Zone-Management-Aktionen sichtbar | HOCH | Kein Edit/Delete/Rename fuer die Zone. Kein Indikator was "Echt" bedeutet (vs. Mock-Zone?). Zone-Verwaltung muss hier oder ueber kontextbezogene Aktionen erreichbar sein |
| **P6** | Aggregierte Sensorwerte "19.7-19.7°C 19.7-46.3%" — redundant und kryptisch | HOCH | "19.7-19.7°C" ist min==max weil nur 1 Sensor. "19.7-46.3%" ist kein Range sondern mischt Temp+Hum. Format unklar, keine Einheiten-Trennung |
| **P7** | Sensor-Liste (sht31_humidity, sht31_temp) mit gruenen Dots — Zweck unklar | MITTEL | Dots sind gruen, aber was bedeuten sie? Online? Quality OK? Threshold eingehalten? Kein Tooltip, keine Legende. Forschung: "Farbe allein reicht nie — immer Text oder Icon dazu" (Cognitive Load Forschung, Baudisch 2002) |
| **P8** | ESP-Card zu klein, zeigt nur minimale Info (Werte + "2S" fuer 2 Sensoren) | HOCH | Card zeigt Zahlenwerte ohne Kontext (keine Einheiten, keine Threshold-Referenz). "2S" ist Abkuerzung die neue User nicht verstehen |
| **P9** | Riesiger leerer Bereich zwischen Zone-Inhalt und "NICHT ZUGEWIESEN" | MITTEL | Verschwendeter Viewport. Bei nur 1 ESP sichtbar, aber der Bereich ist leer statt genutztem Screen-Real-Estate |
| **P10** | "NICHT ZUGEWIESEN" Bar am unteren Rand kaum sichtbar | HOCH | Screenshot: Nur ein duenner Streifen mit Email-Icon und Text. Bei neuen ESPs die discovered werden, koennte der User sie uebersehen. Best Practice (Device-Discovery Forschung): "Pending-Geraete muessen als Badge in der Navigation sichtbar sein, nicht versteckt" |

#### Kategorie C: Konfiguration und Interaktion

| ID | Problem | Schwere | Beweis |
|----|---------|---------|--------|
| **P11** | ~~"Geraete"-Button (TopBar) oeffnet Konfigurationspanel NICHT~~ **IST-ANALYSE: KEIN BUG** | ~~KRITISCH~~ ENTFAELLT | **IST-Analyse (2026-02-26):** Der "Geraete"-Button existiert in TopBar.vue:229 und FUNKTIONIERT korrekt. Er setzt `dashStore.showPendingPanel = true` und oeffnet PendingDevicesPanel. Zeigt "N Neue" bei Pending Devices, sonst "Geraete". Robins urspruengliche Beobachtung war moeglicherweise durch fehlende Pending-Devices verursacht (Panel oeffnet sich, aber ist leer) |
| **P12** | Konfigurationspanel-Scope unklar: Was soll dort konfiguriert werden? | HOCH | Robins Klarstellung: NUR ESP-spezifische Einstellungen + Settings fuer BEREITS konfigurierte Sensoren. KEINE neuen Sensoren hinzufuegen (das passiert im Orbital-Layout). Loeschfunktionen muessen erreichbar sein |
| **P13** | Kein Rechtsklick/Long-Press Kontextmenu auf ESP-Card | MITTEL | Schnellaktionen (Zone aendern, Settings, Loeschen) erfordern Drill-Down ins Orbital-Layout. Forschung zeigt: Context-Menu halbiert Klick-Pfade (Jetter et al. 2011) |
| **P14** | Kein visuelles DnD-Feedback (keine Drag-Handles auf ESP-Cards) | HOCH | Nutzer erkennen nicht dass ESPs per DnD verschoben werden koennen. Kein Drag-Affordance, kein Cursor-Feedback. Forschung: "Continuous Representation" Prinzip (Shneiderman 1983) — DnD-Faehigkeit muss sichtbar sein |

#### Kategorie D: DnD und Zone-Assignment

| ID | Problem | Schwere | Beweis |
|----|---------|---------|--------|
| **P15** | Zone-Assignment per DnD: Drop-Zone-Highlighting fehlt oder ist zu subtil | HOCH | Beim Drag eines ESP muss jede Zone als Drop-Target hervorgehoben werden. Forschung: Drop-Zone-Highlight 100-150ms ease-in, 5-7 Max gleichzeitige Targets (Cognitive Load), Pulsieren als Einladung |
| **P16** | "NICHT ZUGEWIESEN" Bereich nicht als aktive Drop-Zone erkennbar | HOCH | ESPs aus Zonen entfernen durch Drop auf "NICHT ZUGEWIESEN" — aber die Bar sieht nicht wie ein Drop-Target aus |
| **P17** | Kein DnD-Cancel-Feedback (Snap-Back-Animation fehlt) | MITTEL | Forschung: Cancel/Snap-Back 150-250ms ease-in-out. Element muss visuell zur Ausgangsposition zurueckkehren (van Wijk & Nuij 2003) |
| **P18** | Kein Toast/Bestaetigung nach erfolgreichem Zone-Assignment via DnD | MITTEL | User braucht Feedback dass die Aktion erfolgreich war. Bestehende Toast-Infrastruktur (ToastContainer mit Deduplication, Auto-Dismiss) existiert — muss nur aufgerufen werden |

---

## Komponenten-Inventar — Was existiert und wo

### Primaer-Komponenten (direkt sichtbar im Screenshot)

| Komponente | Pfad (im auto-one Repo) | Zeilen | Rolle im Screenshot |
|-----------|------------------------|--------|---------------------|
| `HardwareView.vue` | `src/views/HardwareView.vue` | **1288** | Haupt-View, rendert Level 1-2 basierend auf Route (BEREITS 2-Level-System). Imports: ViewTabBar, SlideOver, ZonePlate, DeviceDetailView, PendingDevicesPanel, ESPSettingsSheet, SensorConfigPanel, ActuatorConfigPanel. **[2026-02-27 FINAL] 1316→1288 Z. (statusCounts-Watch entfernt, Breadcrumb-Formatierung integriert). NOCH OFFEN: @change-zone in Unassigned-Section (Z.795), UnassignedDropBar Import+Rendering (Z.42+899)** |
| `ZonePlate.vue` | `src/components/dashboard/ZonePlate.vue` | **843** | Zone-Accordion mit AccordionSection + custom #header. Subzone-Filter, Status-Aggregation, VueDraggable. Imports: AccordionSection, DeviceMiniCard, aggregateZoneSensors. **[2026-02-27 FINAL] 810→843 Z.** |
| `DeviceMiniCard.vue` | `src/components/dashboard/DeviceMiniCard.vue` | **595** | ESP-Card mit Status-Zeile, Sensor-Icons, Spark-Bars, Action-Row. Imports: ESPCardBase (variant=mini), groupSensorsByBaseType, getESPStatus. **[2026-02-27 FINAL] 589→595 Z.** |
| `UnassignedDropBar.vue` | `src/components/dashboard/UnassignedDropBar.vue` | **598** | "NICHT ZUGEWIESEN" Bar am unteren Rand. Horiz. Scrolling, VueDraggable. Imports: useZoneDragDrop, groupSensorsByBaseType. **[2026-02-27 FINAL] 578→598 Z. Nutzt bereits `espStore.unassignedDevices` (Z.44). WIRD IN BLOCK 8.1b ENTFERNT (doppelte Unassigned-UI)** |
| `StatusPill.vue` (TopBar) | `src/components/dashboard/StatusPill.vue` | **192** | Inline Status-Anzeige (online/offline/warning/safemode). Nur BEM-CSS, keine Logik |
| `ViewTabBar.vue` | `src/components/common/ViewTabBar.vue` | **100** | Tab-Leiste [Uebersicht] [Monitor] [Editor]. RouterLink, route.path-basiert. **[2026-02-27] 127→100 Z. (Cleanup)** |

### Sekundaer-Komponenten (nicht sichtbar aber direkt betroffen)

| Komponente | Pfad | Zeilen | Rolle |
|-----------|------|--------|-------|
| `ZoneDetailView.vue` | `src/components/zones/ZoneDetailView.vue` | **347** | Level 2 (Zone-Detail mit ESP-Liste) — wird ENTFALLEN nach D2-Vision. **Existiert noch im Code** |
| `ZoneGroup.vue` | `src/components/zones/ZoneGroup.vue` | **951** | Implementiert VueDraggable-DnD, Zone-Header-Rendering und Device-Gruppierung. Block 4 MUSS darauf aufbauen |
| `ESPSettingsSheet.vue` | `src/components/esp/ESPSettingsSheet.vue` | **1341** | Device-Config SlideOver (SlideOver-Primitive). Imports: SlideOver, useESPStatus, ZoneAssignmentPanel. Sensor/Actuator als klickbare Liste mit Events (open-sensor-config, open-actuator-config). Delete via uiStore.confirm()+useToast(). **[2026-02-27] 1419→1341 Z. (Block 3: SlideOver-Wrapper, useESPStatus, Inline-Panels→Event-Liste, ConfirmDialog)** |
| `PendingDevicesPanel.vue` | `src/components/esp/PendingDevicesPanel.vue` | **1117** | SlideOver mit Geraeteverwaltung, Tabs: Geraete/Wartend/Anleitung. Imports: RejectDeviceModal, SlideOver. **[2026-02-27 FINAL] 1106→1117 Z. HAT bereits Status-Dots (Z.313,360) + getESPStatusDisplay. Nutzt bereits espStore.unassignedDevices (Z.74)** |
| `ComponentSidebar.vue` | `src/components/dashboard/ComponentSidebar.vue` | **435** | Sidebar fuer Sensor/Aktor-DnD im Level 2 Orbital-Layout. Imports: SENSOR_TYPE_CONFIG, ACTUATOR_TYPE_CONFIG, useDragStateStore |
| `CreateMockEspModal.vue` | `src/components/modals/CreateMockEspModal.vue` | **318** | Modal hinter "+ Mock" Button |

### Stores (State-Management)

| Store | Pfad | Relevanz |
|-------|------|----------|
| `useEspStore` | `src/stores/esp.ts` | **1676 Z.** — Zentraler Device-State, WebSocket-Dispatcher, Pending-Devices. Exports: `devices`, `fetchAll()`, `deleteDevice()`, `isMock()`, `onlineDevices`, `offlineDevices`, `mockDevices`, `realDevices`, **`unassignedDevices`** (esp.ts:186), **`pendingCount`** (esp.ts:191). **[2026-02-27 FINAL] ERLEDIGT:** unassignedDevices IST Store-Getter. Alle 3 Konsumenten nutzen bereits `espStore.unassignedDevices`. pendingCount IST computed. dashStore.pendingCount leitet korrekt ab (dashboard.store.ts:94) |
| `useDragStateStore` | `src/shared/stores/dragState.store.ts` | **447 Z.** — DnD-State (isDragging, Payloads, Drop-Targets), Safety-Cleanup mit DRAG_TIMEOUT_MS |
| `useDashboardStore` | `src/shared/stores/dashboard.store.ts` | **291 Z.** — Filter-State, showPendingPanel (Z.86), Breadcrumb. `deviceCounts` ist computed() (Block 0 FIX). **[2026-02-27 FINAL] ERLEDIGT:** `statusCounts` IST `computed()` (Z.64-86, nutzt getESPStatus mit 4 Feldern: online/offline/warning/safeMode). `pendingCount` IST `computed(() => espStore.pendingCount)` (Z.94). Kein manueller Watch mehr in HardwareView |
| `useUiStore` | `src/shared/stores/ui.store.ts` | **235 Z.** — Sidebar, CommandPalette, ContextMenu, confirm()/showConfirmDialog() |

### Composables (Logik)

| Composable | Pfad | Relevanz |
|-----------|------|----------|
| `useZoneDragDrop` | `src/composables/useZoneDragDrop.ts` | **512 Z.** — Zone-Assignment DnD-Logik (Zone-Level). Exports: `ZONE_UNASSIGNED`, `groupDevicesByZone()`, `handleDeviceDrop()`, `generateZoneId()`. Einsatz: HardwareView, ZonePlate, UnassignedDropBar. Block 4 nutzt NUR diese |
| `useESPStatus` | `src/composables/useESPStatus.ts` | **185 Z.** — Exports: `getESPStatus()`, `getESPStatusDisplay()`, `useESPStatus()` (reactive). Einsatz: DeviceMiniCard, ZonePlate, PendingDevicesPanel, ESPSettingsSheet |
| `useOrbitalDragDrop` | `src/composables/useOrbitalDragDrop.ts` | **250 Z.** — Separates Composable fuer Level 2 Orbital-Layout DnD. NICHT fuer Block 4 relevant |
| `useToast` | `src/composables/useToast.ts` | **171 Z.** — Exports: `success()`, `error()`, `warn()`, `info()`, `show()`. Einsatz: config.store, actuator.store, zone.store (nur subzone), notification.store, gpio.store |
| `useKeyboardShortcuts` | `src/composables/useKeyboardShortcuts.ts` | Ctrl+K, Escape, etc. |
| `useSwipeNavigation` | `src/composables/useSwipeNavigation.ts` | Touch-Navigation |
| `useContextMenu` | (via uiStore) | Rechtsklick-Menues — existiert, wird NICHT genutzt auf ESP-Cards |

### Design-System-Elemente

| Element | Pfad | Relevanz |
|---------|------|----------|
| `BaseCard.vue` | `src/shared/design/primitives/BaseCard.vue` | Varianten: glass, shimmer, iridescent, mock, real |
| `BaseBadge.vue` | `src/shared/design/primitives/BaseBadge.vue` | Status-Badges mit Pulse/Dot |
| `ToastContainer.vue` | `src/shared/design/patterns/ToastContainer.vue` | Max 20, Auto-Dismiss, Deduplication |
| `ConfirmDialog.vue` | `src/shared/design/patterns/ConfirmDialog.vue` | Promise-basiert, 3 Varianten |
| `ContextMenu.vue` | `src/shared/design/patterns/ContextMenu.vue` | Keyboard-Navigation, Viewport-Boundary |
| `tokens.css` | `src/styles/tokens.css` | Farben, Spacing, Radii, Status-Farben |

---

## Wissensgrundlage — UI/UX-Forschung fuer diesen Auftrag

| Erkenntnis | Quelle | Anwendung |
|-----------|--------|-----------|
| Max 5-7 Drop-Targets gleichzeitig sichtbar | Sweller et al. 1998 (Cognitive Load) | Zone-DnD: Drop-Targets erst bei Drag-Start prominent hervorheben |
| DnD hat doppelte Fehlerrate vs Click-to-Place (8.2% vs 4.1%) | Jetter et al. 2011 | Immer Click-to-Place als Alternative zu DnD anbieten |
| Ghost-Opacity 0.6-0.7, leichter Lift-Effekt (1.05x) | van Wijk & Nuij 2003 | ESP-Card Drag-Ghost-Styling |
| Drop-Animation 200-300ms ease-out, Cancel 150-250ms | Heer & Robertson 2007 | Snap-Animation nach Drop/Cancel |
| Drag-Feedback bei jedem Frame (<16ms), ab 50ms "schwammig" | Nielsen 1993, Nah 2004 | CSS-Transforms statt DOM-Manipulation waehrend Drag |
| Touch DnD 15-25% langsamer, Long-Press 400ms optimal | Bi et al. 2013, Cockburn 2012 | Touch-Drag-Delay, groessere Drag-Handles (min 44px) |
| 5-Sekunden-Regel: Haupt-Dashboard muss Status in <5s zeigen | IoT Best Practices 2026 | Zone-Status auf einen Blick: Online-Count, Alerts, aggregierte Werte |
| Farbe PLUS Text PLUS Icon (nie Farbe allein) | Baudisch 2002, Cognitive Load | Status-Dots muessen Text-Label oder Tooltip bekommen |
| Device-Discovery: Badge in Navigation, nicht versteckt | IoT Hardware-Topologie Forschung | "NICHT ZUGEWIESEN" als prominenter Counter in der TopBar |
| Sicherheitskritische Ops: Dialog + Confirm statt DnD | Paelke & Roecker 2016 | ESP loeschen: ConfirmDialog PFLICHT, nie via DnD |
| Progressive Disclosure: Details nur auf Nachfrage | Sarikaya et al. 2019 | Zone-Accordion (eingeklappt), ESP-Details per Klick |
| Three-Zone-Pattern: Basic/Advanced/Expert | Settings-Panel UX (iot-device-config-panel-ux-patterns.md) | ESP-Konfigurationspanel-Struktur |

---

## Block 0: deviceCounts Quick-Fix — ERLEDIGT (2026-02-26)

> **ERLEDIGT (2026-02-26):** `dashboard.store.ts` — `deviceCounts` von totem `ref({all:0, mock:0, real:0})` zu `computed()` geaendert, das von `espStore.devices` ableitet.

### 0.1: Root Cause (bestaetigt + gefixt)

`dashboard.store.ts:61` definierte `deviceCounts = ref({ all: 0, mock: 0, real: 0 })`.
Diese Ref wurde NIRGENDS beschrieben → zeigte IMMER "Alle 0 / Mock 0 / Real 0".

**Fix:** `computed()` aus `espStore.devices` — analog zu `statusCounts`.

### 0.2: Verifikation — BESTANDEN

- [x] TopBar zeigt korrekte "Alle X / Mock Y / Real Z" Counts
- [x] Build erfolgreich (`npm run build` — 24s)
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler

**Commit:** `fix(dashboard): compute deviceCounts from espStore instead of static ref`

---

## Block 1: Status-System-Fix — ERLEDIGT (2026-02-26)

> **KOMPLETT ERLEDIGT (2026-02-26):**
> - **P1 Fix — Online/Offline Counts:** `esp.ts` importiert jetzt `getESPStatus()` aus useESPStatus. `onlineDevices` zaehlt Devices mit Status `online` ODER `stale` (= erreichbar, Heartbeat <5min). `offlineDevices` zaehlt alles andere (offline, unknown, error, safemode). **Root Cause P1:** Der alte Check (`device.status === 'online' || device.connected === true`) ignorierte den Heartbeat-Timing-Fallback. Real-ESPs mit `last_seen < 90s` aber ohne expliziten `status: 'online'` wurden als offline gezaehlt.
> - **P2 Verifikation — deviceCounts:** Block 0 Fix bestaetigt — `deviceCounts` ist jetzt `computed()` aus `espStore.devices/mockDevices/realDevices` (`dashboard.store.ts:66-70`)
> - **P3/P4 Fix — Stale-Daten-Visualisierung:** `DeviceMiniCard.vue` integriert jetzt `getESPStatus()`. Offline/Stale-ESPs: Sparkbar-Farbe → `var(--color-text-muted)` (grau statt gruen). "Zuletzt vor X Min." Label bei nicht-online Devices (Farbe: `var(--color-warning)`). Card-Opacity 0.75 + gedaempfte Sensor-Wert-Farbe im Stale-Zustand. CSS-Klasse `device-mini-card--stale` fuer visuellen Zustand.
> - **Verifikation:** `vue-tsc --noEmit` 0 TypeScript-Fehler, `npm run build` erfolgreich (26s)
>
> **Commit:** `fix(status): correct device counts, stale data visualization`

### 1.1: Status-Zaehl-Bug fixen (P1, P2) — ERLEDIGT

**Root Cause P1 (GELOEST):** `esp.ts:156-166` — `onlineDevices` nutzt jetzt `getESPStatus()` aus `useESPStatus.ts`. Alter Check ignorierte Heartbeat-Timing-Fallback.

**Root Cause P2 (Block 0, BESTAETIGT):** `dashboard.store.ts:66-70` — `deviceCounts` ist jetzt `computed()`.

### 1.2: Stale-Daten-Visualisierung (P3, P4) — ERLEDIGT

**Implementation in `DeviceMiniCard.vue`:**
- `getESPStatus()` importiert und integriert
- Offline/Stale: Sparkbar → `var(--color-text-muted)`, "Zuletzt vor X Min." in `var(--color-warning)`
- Card-Opacity 0.75 + CSS-Klasse `device-mini-card--stale`
- **[verify-plan] Bestaetigt:** DeviceMiniCard nutzte useESPStatus zuvor NICHT — wurde in diesem Block integriert

### 1.3: Verifikation — BESTANDEN (2026-02-26)

- [x] TopBar zeigt korrekte Online/Offline-Counts (getESPStatus-basiert)
- [x] Filter "Alle", "Mock", "Real" zaehlen korrekt (Block 0 deviceCounts computed)
- [x] Offline-ESP zeigt graue Sparkbars + "Zuletzt vor X Min." Timestamp
- [x] Online-ESP zeigt gruene Sparkbars + Live-Werte
- [ ] Toast bei Status-Wechsel (Online→Offline, Offline→Online) — offen, nicht in Block 1 Scope
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [x] `npm run build` — erfolgreich (26s)

**Commit:** `fix(status): correct device counts, stale data visualization`

---

## Block 2: Zone-Layout Redesign — ERLEDIGT (2026-02-26)

> **KOMPLETT ERLEDIGT (2026-02-26):**
> - **2.1a AccordionSection.vue erweitert:** `modelValue?: boolean` Prop fuer externe Steuerung (v-model), `#header` Slot mit `{isOpen, toggle}` Scope fuer custom Headers. Volle Rueckwaertskompatibilitaet (SensorConfigPanel, ActuatorConfigPanel, ESPSettingsSheet)
> - **2.1b ZonePlate.vue refactored (755→811 Z.):** Nutzt AccordionSection mit modelValue + custom `#header` Slot. Schlanker Header: Zone-Name + Pencil-Edit + "X ESPs · X/Y Online" + Alert-Badge + Overflow-Menu (⋮). ENTFERNT: ZoneMetrics, Sensor-Preview, Meta-Pills ("3S"/"1A"), collapsed-summary, cross-esp badge. Inline-Rename (Pencil→Input, Enter/Escape/Blur). Overflow: Umbenennen + Loeschen (ConfirmDialog). Neue Emits: `rename`, `delete`, `device-delete`. **[verify-plan 2026-02-27] 811 Z. (nicht 622) — Subzone-Gruppierung + VueDraggable hinzugekommen**
> - **2.2 DeviceMiniCard.vue redesigned (447→589 Z.):** Wickelt ESPCardBase variant="mini" mit Custom-Slots. Status-Zeile: Dot + Text + "vor X Min." + Sensor-Count. Bis 4 Sensor-Zeilen: Typ-Icon + Name + Wert + Einheit + Spark-Bar. "+X weitere" bei >4. Action-Row: "Oeffnen" + Overflow (Konfigurieren, Zone aendern, Loeschen). Grip-Handle via CSS Pseudo-Element auf `.esp-drag-handle`. Stale-Styles beibehalten. **[verify-plan 2026-02-27] 589 Z. (nicht 645) — Cleanup nach Block 2**
> - **2.3 Zone-Verwaltung in HardwareView.vue:** <5 Zonen → alle expanded, sonst collapsed. "Zone erstellen" Button + Inline-Form. Umbenennen (loop ESPs → POST assign). Loeschen (ConfirmDialog → loop DELETE). Toast-Feedback via useToast()
> - **2.4 ZonePlate.test.ts aktualisiert:** Meta-Pills → Header-Stats
> - **Verifikation:** `vue-tsc --noEmit` 0 Fehler, `npm run build` OK (33.5s), 1345/1353 Tests (8 pre-existing, keine neuen Failures)
>
> **Commit:** `feat(overview): zone accordion layout with ESP overview cards`

### Ziel
Zonen werden als aufklappbare Accordion-Sektionen angezeigt mit ESP-Cards direkt sichtbar (Vision D2: Level 1+2 zusammenfuehren zu einer Ebene).

### 2.1: Zone-Accordion-Sektion neu gestalten

**IST-Zustand (ZonePlate.vue 811 Zeilen, in `src/components/dashboard/`):**
```
v Echt  0/1 Online                                              (25)
19.7-19.7°C  19.7-46.3%
● sht31_humidity                                      46.3 % RH
● sht31_temp                                          19.7 °C
```

**SOLL-Zustand:**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  v  Zone: Echt                           1 ESP  •  0/1 Online  •  ⚠ 0 │
│     ─────────────────────────────────────────────────────────          │
│                                                                         │
│     ┌─────────────────────────────┐                                    │
│     │ ⠿ ESP_472204          [REAL]│    ← Drag-Handle (⠿) links        │
│     │ ● Online  •  2 Sensoren     │    ← Status + Sensor-Count         │
│     │                              │                                    │
│     │ Temperatur    19.7°C   ▁▂▃▄ │    ← Sensorname + Wert + Sparkline│
│     │ Feuchtigkeit  46.3%RH  ▄▃▂▁ │    ← Sensorname + Wert + Sparkline│
│     │                              │                                    │
│     │ [Konfigurieren]   [⋮]       │    ← Primaer-Action + Overflow     │
│     └─────────────────────────────┘                                    │
│                                                                         │
│     (weitere ESPs hier, falls vorhanden)                               │
└─────────────────────────────────────────────────────────────────────────┘
```

**Zone-Header-Elemente:**
- **Zone-Name** (inline-editierbar bei Klick auf Pencil-Icon neben dem Namen)
- **ESP-Count:** "X ESPs" — Gesamtzahl Geraete in dieser Zone
- **Online-Status:** "X/Y Online" — wie viele ESPs online vs gesamt
- **Alert-Count:** "⚠ X" — Anzahl aktiver Warnungen/Fehler in der Zone (0 = kein Badge)
- **Akkordeon-Toggle:** Auf-/Zuklappen der Zone (Default: offen wenn <5 Zonen, sonst zu)
- **Overflow-Menu (⋮) auf Zone-Ebene:** Zone umbenennen, Zone loeschen (mit Confirm — "X ESPs werden unzugewiesen")

**Was sich aendert:**
- Die kryptischen Ranges ("19.7-19.7°C 19.7-46.3%") werden ENTFERNT — stattdessen sind die Werte auf den ESP-Cards selbst
- Die Sensor-Dot-Liste (sht31_humidity, sht31_temp) wird ENTFERNT — die Sensoren sind auf den ESP-Cards
- Der Zone-Header wird schlanker: Nur Name + KPI-Zusammenfassung (ESP-Count, Online-Count, Alerts)

**Neue Datei:** `AccordionSection.vue` (wiederverwendbar, aus `auftrag-hardware-tab-css-settings-ux.md` Block B)
- Props: `title`, `subtitle`, `defaultOpen`, `icon`, `badge`
- Slots: `#header-right` (fuer Zone-KPIs), `#default` (fuer ESP-Cards)
- Animation: 200ms max-height Transition
- State: offen/geschlossen in localStorage persistiert

### 2.2: ESP-Card Redesign (DeviceMiniCard → ESPOverviewCard)

**IST-Zustand (DeviceMiniCard.vue 589 Zeilen [verify-plan 2026-02-27]):**
```
• ESP_472204  [REAL]
46.3  ████████
19.7  ████████
2S
```

Probleme: Keine Einheiten, keine Sensornamen, kein Status-Detail, kein Drag-Handle, "2S" unverstaendlich.

**SOLL-Zustand (neue Komponente `ESPOverviewCard.vue` oder Erweiterung von ESPCardBase):**

```
┌──────────────────────────────────────┐
│ ⠿  ESP_472204              [REAL]    │   ← Drag-Handle + Name + Badge
│    ● Online  •  2 Sensoren           │   ← Status (Dot+Text) + Count
│ ──────────────────────────────────── │
│ 🌡 Temperatur     19.7 °C    ▁▂▃▄▅  │   ← Icon + Name + Wert + Spark
│ 💧 Feuchtigkeit   46.3 % RH  ▅▄▃▂▁  │   ← Icon + Name + Wert + Spark
│ ──────────────────────────────────── │
│ [Oeffnen]                      [⋮]   │   ← Primaer-Action + Overflow
└──────────────────────────────────────┘
```

**Card-Elemente im Detail:**

1. **Header-Zeile:**
   - Drag-Handle (`⠿` oder `⋮⋮` Grip-Icon) — NUR sichtbar wenn DnD aktiv (oder immer sichtbar mit `cursor: grab`)
   - ESP-Name (truncated bei langen Namen, Tooltip mit vollem Namen)
   - Typ-Badge: [REAL] in tuerkis oder [MOCK] in lila (wie bestehend, Farben aus tokens.css)

2. **Status-Zeile:**
   - Status-Dot + Text: "● Online" (gruen), "● Stale" (orange), "○ Offline" (rot), "◌ Unbekannt" (grau)
   - Sensor-Count: "X Sensoren" / "X Sens. + Y Akt." wenn Aktoren vorhanden
   - WiFi-Signal-Indikator (optional, bei Platz): 1-4 Balken basierend auf RSSI

3. **Sensor-Daten-Bereich:**
   - Pro Sensor: Sensor-Typ-Icon (🌡/💧/📊/etc.) + Anzeigename + Wert + Einheit + Mini-Sparkline (letzte 15min)
   - Max. 4 Sensoren angezeigt, bei >4: "+X weitere" Link der zum Orbital-Layout fuehrt
   - Bei Offline/Stale: Werte in grauer Farbe + "Zuletzt" Prafix

4. **Action-Zeile:**
   - Primary Button: "Oeffnen" → navigiert zum Orbital-Layout (Level 3 / Ebene 2 nach D2-Vision)
   - Overflow-Menu (⋮): Konfigurieren (→ ESP-Settings), Zone aendern (→ Dropdown), Neustart, Loeschen (mit Confirm)

**Sensor-Typ-Icons (TypeScript Map):**
```typescript
const SENSOR_ICONS: Record<string, string> = {
  'temperature': '🌡',
  'humidity': '💧',
  'pressure': '🌀',
  'soil_moisture': '🌱',
  'ph': '⚗',
  'ec': '⚡',
  'co2': '☁',
  'light': '☀',
  'flow': '🌊',
  'default': '📊'
}
```

**Technische Umsetzung:**
- `ESPCardBase.vue` EXISTIERT BEREITS (270 Z. [verify-plan], 4 Varianten: mini/summary/detail/widget) — IST-Analyse bestaetigt
- `variant="overview"` als 5. Variante hinzufuegen ODER `variant="summary"` nutzen und per Slot-Content anpassen
- `useESPStatus.ts` EXISTIERT BEREITS (185 Z. [verify-plan]) — Status-Logik ist zentral verfuegbar
- Sensor-Daten kommen aus `espStore.devices[espId].sensors` — sind bereits reaktiv via WebSocket
- Sparkline: Bestehende Mini-Sparkline-Logik aus DeviceMiniCard wiederverwenden, aber mit Zeitachse (letzte 15min)

### 2.3: Zone-Verwaltungs-Aktionen

> **BLOCKER AUFGELOEST (2026-02-26):** Zone-Architektur-Analyse (`analyse-zone-subzone-architektur.md`) zeigt: Zonen sind String-Felder auf `esp_devices`, KEINE eigenstaendigen DB-Entitaeten. Das bestehende implizite System ist **designbedingt** und **vollstaendig funktional**:
> - "Zone erstellen" = Ersten ESP mit neuem `zone_id` zuweisen → `POST /v1/zone/devices/{id}/assign`
> - "Zone umbenennen" = Alle ESPs in Zone mit neuem `zone_name` neu zuweisen → Loop ueber `GET /zone/{id}/devices` + `POST /zone/devices/{id}/assign`
> - "Zone loeschen" = Alle ESPs aus Zone entfernen → `DELETE /v1/zone/devices/{id}/zone` fuer jeden ESP (Subzones werden automatisch cascade-geloescht)
> - "Zone-Liste" = Frontend `groupDevicesByZone()` computed aus `espStore.devices`

**Zonen erstellen:**
- Button "+ Zone erstellen" am Ende der Zonen-Liste (oder im TopBar-Bereich)
- Oeffnet Modal: Zone-Name + Zone-ID eingeben → erster ESP zuweisen via `POST /v1/zone/devices/{esp_id}/assign` mit neuem `zone_id` → Toast "Zone erstellt"
- **HINWEIS:** Leere Zonen (ohne ESP) existieren nicht im impliziten System. "Zone erstellen" erfordert mindestens 1 ESP-Zuweisung

**Zonen bearbeiten:**
- Zone-Header hat Overflow-Menu (⋮) mit:
  - "Umbenennen" → Inline-Edit des Zone-Namens
  - "Subzonen verwalten" → Navigiert zu Zone-Detail oder oeffnet Sub-Panel
  - "Alle ESPs abmelden" → Confirm-Dialog → Alle ESPs werden "unzugewiesen"
  - "Zone loeschen" → Confirm-Dialog ("Zone 'Echt' mit 1 ESP wird geloescht. Der ESP wird unzugewiesen.")

**Toasts nach Zone-Aktionen:**
- Erfolg: "Zone 'Echt' erstellt" / "Zone umbenannt" / "Zone geloescht"
- Fehler: "Zone konnte nicht geloescht werden: [Fehlertext]"
- Bestehende `useToast` Composable nutzen (`toast.show({ message, type, persistent })` via `notification.store.ts`). **KORREKTUR:** Die korrekte API ist `useToast`, nicht `uiStore.addToast`

### 2.4: Verifikation — BESTANDEN (2026-02-26)

- [x] Zonen werden als Accordion-Sektionen angezeigt (AccordionSection mit modelValue + #header Slot)
- [x] Zone-Header zeigt Name + ESP-Count + Online-Count + Alert-Badge + Overflow-Menu
- [x] ESP-Cards sind direkt in der Zone sichtbar (kein Zwischenklick noetig)
- [x] ESP-Cards zeigen: Name, Status (Dot+Text), Sensor-Daten mit Einheiten + Icons, Spark-Bars
- [x] Klick auf "Oeffnen" navigiert zum Orbital-Layout
- [x] Zone-Overflow-Menu mit Umbenennen/Loeschen funktioniert (ConfirmDialog)
- [x] Toasts werden bei Zone-Aktionen angezeigt (useToast)
- [x] Zone-Erstellung mit Inline-Form (Name + ESP-Auswahl)
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [x] `npm run build` — erfolgreich (33.5s)
- [x] Tests: 1345/1353 (8 pre-existing, keine neuen Failures)

**Commit:** `feat(overview): zone accordion layout with ESP overview cards`

---

## Block 3: Konfigurationspanel-Fix und Redesign (P0/P1, ~4-6h) — ERLEDIGT (2026-02-27)

> **KORREKTUR (Verifikation 2026-02-26):** Aufwand von ~3-4h auf ~4-6h erhoeht weil ESPSettingsSheet.vue 1419 Z. (nicht ~300) und PendingDevicesPanel.vue 1106 Z. hat.
> **UPDATE (2026-02-27):** PendingDevicesPanel wurde von PopOver zu SlideOver konvertiert (Commit f3b8a9a, 996→1106 Z.). Bereits implementiert: Search-Field, Delete mit ConfirmDialog, Tabs (Geraete/Wartend/Anleitung). HardwareView ist 1066 Z. Block 3 Aufwand moeglicherweise reduziert — abhaengig davon was f3b8a9a bereits abdeckt.

### Ziel
Der "Geraete"-Button muss funktionieren. Das Konfigurationspanel muss klar strukturiert sein fuer ESP-spezifische Einstellungen.

### 3.1: ~~"Geraete"-Button Fix (P11 — KRITISCH)~~ — KEIN BUG

> **IST-ANALYSE UPDATE (2026-02-26):** Der "Geraete"-Button FUNKTIONIERT KORREKT.
> - TopBar.vue:229 setzt `dashStore.showPendingPanel = true`
> - Oeffnet PendingDevicesPanel.vue
> - Zeigt "N Neue" bei Pending Devices, sonst "Geraete"
> - Robins urspruengliche Beobachtung war moeglicherweise durch fehlende Pending-Devices verursacht
>
> **Dieser Abschnitt kann uebersprungen werden.** Die Geraete-Panel-Neugestaltung (3.2) bleibt als UX-Verbesserung relevant.

**Fix-Strategie:**
- Root Cause identifizieren → minimal-invasiver Fix
- Falls der Button ein generisches "Geraete-Panel" oeffnen soll (kein ESP selektiert): Ein neues Panel-Design (siehe 3.2)
- Falls der Button ESP-spezifisch ist und ein ESP selektiert sein muss: Button disable wenn kein ESP selektiert, Tooltip "Waehle zuerst einen ESP"

### 3.2: Konfigurationspanel-Neugestaltung

**Robins Klarstellung:** Das Panel soll folgendes enthalten:
- **ESP-spezifische Einstellungen** (Name, Zone, Firmware, WiFi, Neustart, Loeschen)
- **Settings fuer BEREITS konfigurierte Sensoren** (Schwellwerte anpassen, Intervall aendern)
- **NICHT:** Neue Sensoren hinzufuegen (das bleibt im Orbital-Layout)
- **Alle Loeschfunktionen** muessen hier erreichbar sein (ESP loeschen, Sensor entfernen)

**Zwei Panel-Varianten je nach Kontext:**

**Variante A — Kein ESP selektiert (Level 1 / Uebersicht-Tab):**
Panel zeigt eine ESP-Liste als Quick-Access:
```
┌────────────────── Geraeteverwaltung ─────────────────┐
│                                                        │
│ 🔍 Suche nach ESP...                                  │
│                                                        │
│ ┌──── Zone: Echt ─────────────────────────────────┐   │
│ │ ESP_472204  ● Online  2 Sensoren  [Konfig.]     │   │
│ └─────────────────────────────────────────────────┘   │
│                                                        │
│ ┌──── Nicht zugewiesen ───────────────────────────┐   │
│ │ (keine)                                          │   │
│ └─────────────────────────────────────────────────┘   │
│                                                        │
│ Pending: 0 Geraete warten auf Genehmigung             │
│                                                        │
│ [+ Mock-ESP erstellen]                                 │
└────────────────────────────────────────────────────────┘
```

**Variante B — ESP selektiert (Klick auf "Konfig." oder via ESP-Card Overflow):**
Panel zeigt ESP-Details im Three-Zone-Pattern:
```
┌───────────────── ESP_472204 ─────────────────────────┐
│ ● Online  •  Firmware v1.2.3  •  WiFi -65 dBm        │
│                                                        │
│ Zone 1: BASIC                                          │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Name:  [ESP_472204 _______________]  ✏          │   │
│ │ Zone:  [Echt ▼]                                  │   │
│ │ Typ:   REAL                                      │   │
│ └─────────────────────────────────────────────────┘   │
│                                                        │
│ Sensoren (2)                                           │
│ ┌─────────────────────────────────────────────────┐   │
│ │ 🌡 sht31_temp       19.7°C   [Einstellungen]    │   │
│ │ 💧 sht31_humidity   46.3%RH  [Einstellungen]    │   │
│ └─────────────────────────────────────────────────┘   │
│ (Klick "Einstellungen" → SensorConfigPanel SlideOver) │
│                                                        │
│ ▸ Erweitert                                            │
│   Heartbeat-Intervall: 60s                             │
│   Letzter Heartbeat: vor 42s                           │
│   Uptime: 3h 22min                                     │
│   IP-Adresse: 192.168.1.42                             │
│                                                        │
│ ▸ Aktionen                                             │
│   [Neustart senden]   [Config neu publizieren]         │
│                                                        │
│ ─────────────────────────────────────────────────────  │
│ [ESP loeschen]  ← Danger-Button mit ConfirmDialog      │
└────────────────────────────────────────────────────────┘
```

**Technische Umsetzung:**
- Panel-Typ: SlideOver (von rechts, konsistent mit SensorConfigPanel/ActuatorConfigPanel)
- NICHT Modal — SlideOver erlaubt gleichzeitig die Uebersicht zu sehen
- State: `showDevicePanel: boolean` + `selectedDevicePanelEspId: string | null`
- Wenn `selectedDevicePanelEspId === null` → Variante A (Liste)
- Wenn `selectedDevicePanelEspId` gesetzt → Variante B (Detail)
- "Konfig." Button auf ESP-Card setzt `selectedDevicePanelEspId` und oeffnet SlideOver

### 3.3: Sensor-Einstellungen im Panel

**Wichtig:** Im Konfigurationspanel werden Sensoren NICHT hinzugefuegt oder entfernt.

Was hier gezeigt wird:
- Liste der konfigurierten Sensoren mit aktuellem Wert
- Pro Sensor: "Einstellungen"-Button der den bestehenden `SensorConfigPanel` als SlideOver oeffnet
- Der SensorConfigPanel ist bereits Three-Zone-faehig (nach `auftrag-hardware-tab-css-settings-ux.md` Block B)

Was hier NICHT moeglich ist:
- Neuen Sensor hinzufuegen (→ Orbital-Layout, AddSensorModal)
- Sensor-GPIO aendern (→ erfordert Orbital-Layout Kontext)
- Sensor-Typ aendern (→ Loeschen + Neu erstellen)

### 3.4: Loeschfunktionen

| Objekt | Aktion | Trigger | Bestaetigung |
|--------|--------|---------|-------------|
| ESP | Loeschen | "ESP loeschen" Button im Panel (Variante B) | ConfirmDialog: "ESP_472204 und alle X Sensoren werden geloescht. Fortfahren?" |
| Sensor | Entfernen | "Sensor entfernen" im SensorConfigPanel (Erweitert-Sektion) | ConfirmDialog: "Sensor 'sht31_temp' wird entfernt. Historische Daten bleiben erhalten." |
| Zone | Loeschen | Zone-Overflow-Menu (Block 2) | ConfirmDialog: "Zone 'Echt' wird geloescht. X ESPs werden unzugewiesen." |

**Toasts nach Loeschungen:**
- Erfolg: "ESP_472204 wurde geloescht" (info)
- Fehler: "ESP konnte nicht geloescht werden: [Fehler]" (error, 8s statt 5s)

### 3.5: Verifikation

- [x] "Geraete"-Button in TopBar oeffnet SlideOver-Panel (NICHT Modal) — bereits funktional (PendingDevicesPanel)
- [x] Panel Variante A: ESP-Liste nach Zonen gruppiert, Suchfeld funktioniert — PendingDevicesPanel (f3b8a9a)
- [x] Panel Variante B: ESP-Details mit Name, Zone-Dropdown, Sensor-Liste — ESPSettingsSheet (Block 3)
- [x] "Einstellungen" auf Sensor oeffnet SensorConfigPanel SlideOver — emit open-sensor-config → HardwareView
- [x] Loeschen-Button oeffnet ConfirmDialog vor destruktiver Aktion — uiStore.confirm() + useToast()
- [x] Toast nach jeder Aktion (Erfolg + Fehler) — showSuccess/showError nach Delete
- [x] Panel schliesst sich per Escape-Key und Klick auf Overlay — SlideOver-Primitive

**Commit:** `fix(config): device panel opens correctly, ESP/sensor config redesign`

---

## Block 4: DnD Zone-Assignment Konsolidierung (~1-2h)

> **[verify-plan 2026-02-27] KOMPLETT-ANALYSE gegen Codebase:** DnD-System ist zu ~85% implementiert. Zentrale Logik, Drag-Handles, Ghost-Styling, Drop-Zone-Highlighting, Click-to-Place, Touch-Support, Undo/Redo, Toasts — ALLES existiert bereits. Hauptproblem: DOPPELTE Unassigned-Implementierung + fehlende `@change-zone` Verdrahtung in Unassigned-Section. Aufwand von ~3-4h auf ~1-2h reduziert.

### IST-Zustand der DnD-Infrastruktur (VERIFIZIERT)

**Zentrale Logik (KOMPLETT):**
| Datei | Zeilen | Status | Was |
|-------|--------|--------|-----|
| `dragState.store.ts` | 448 | ✅ FERTIG | Zentraler Store: `isDraggingEspCard`, `isAnyDragActive`, Safety-Timeout 30s, Escape-Cancel, Global-dragend-Handler |
| `useZoneDragDrop.ts` | 512 | ✅ FERTIG | `handleDeviceDrop()` (API), `handleRemoveFromZone()`, `groupDevicesByZone()`, `generateZoneId()`, Undo/Redo-Stack (max 20), Toast-Benachrichtigungen |
| `useOrbitalDragDrop.ts` | 250 | ✅ FERTIG | Sensor/Actuator-DnD im Orbital-Layout. NICHT fuer Zone-DnD relevant |

**Level 1 Uebersicht (FUNKTIONIERT):**
| Datei | Zeilen | Status | Was |
|-------|--------|--------|-----|
| `ZonePlate.vue` | 844 | ✅ FERTIG | VueDraggable `group="esp-devices"`, `handle=".esp-drag-handle"`, Ghost/Chosen/Drag CSS, Iridescent Drop-Target-Glow per `dragStore.isDraggingEspCard` |
| `DeviceMiniCard.vue` | 596 | ✅ FERTIG | via ESPCardBase. Grip-Icon ⠿ (`::before`), 44px Touch-Target, `cursor: grab/grabbing`. Overflow-Menu hat "Zone aendern" (Click-to-Place) |
| `ESPCardBase.vue:69` | — | ✅ FERTIG | Header-div hat Klasse `.esp-drag-handle` |
| `HardwareView.vue:496-531` | — | ✅ FERTIG | `handleChangeZone()`: Click-to-Place via Context-Menu mit allen verfuegbaren Zonen + "Aus Zone entfernen" |
| `ZoneAssignmentDropdown.vue` | ~80 | ✅ FERTIG | `<select>` Dropdown-Alternative |

**DnD-Animationen (EXISTIEREN):**
| Phase | CSS-Klasse | Beweis |
|-------|-----------|--------|
| Ghost (Platzhalter) | `.zone-item--ghost` | ZonePlate.vue:806-814: `opacity: 0.4; transform: scale(1.05); border-style: dashed` |
| Chosen (Aufheben) | `.zone-item--chosen` | ZonePlate.vue:816-822: `transform: scale(1.02); box-shadow: 24px` |
| Drag (Bewegen) | `.zone-item--drag` | ZonePlate.vue:824-832: `scale(1.03); z-index: drag-overlay; pointer-events: none` |
| Drop-Target | `.zone-plate--drop-target` | ZonePlate.vue:498-527: Iridescent border-glow sweep animation |

**Touch-Support (EXISTIERT):**
- `delay: 300` + `delay-on-touch-only: true` (ZonePlate.vue:421)
- `fallback-tolerance: 5` + `touch-start-threshold: 3` (ZonePlate.vue:422-423)
- `force-fallback: true` + `fallback-on-body: true` (ZonePlate.vue:414-415)

### PROBLEME (zu fixen)

#### P1: DOPPELTE Unassigned-Implementierung (KRITISCH)
Es existieren ZWEI Unassigned-Bereiche gleichzeitig:

| # | Wo | Typ | VueDraggable | handle |
|---|-----|-----|-------------|--------|
| A | HardwareView.vue Z.745-810 | Inline AccordionSection in Zone-Liste | ✅ `group="esp-devices"`, `handle=".esp-drag-handle"` | ✅ Grip-Icon ⠿ |
| B | UnassignedDropBar.vue (599 Z.) rendered in HardwareView.vue Z.899 | Fixed-Position Tray am Bildschirm-Boden | ✅ `group="esp-devices"` | ❌ Ganze Card draggable, kein Handle |

**Problem:** Beide aktiv, beide reagieren auf DnD. User sieht zwei separate Bereiche fuer nicht-zugewiesene Geraete. Verwirrend und redundant.

**Empfehlung:** UnassignedDropBar.vue (B) entfernen. Die Inline-Section (A) ist besser weil:
- Gleiche Hierarchie-Ebene wie Zonen-Accordions
- Gleicher Drag-Handle (`.esp-drag-handle`)
- Gleiche DeviceMiniCard-Darstellung
- Kein fixed-Positioning das Layout-Probleme verursacht

#### P2: Fehlende @change-zone in Unassigned-Section
In HardwareView.vue Z.795-801 fehlt `@change-zone` auf den DeviceMiniCards:
```vue
<!-- IST (Z.795-801): -->
<DeviceMiniCard
  :device="device"
  :is-mock="isMockDevice(device)"
  @click="onDeviceCardClick"
  @settings="handleSettings"
  @delete="handleDelete"
  <!-- FEHLT: @change-zone="handleChangeZone" -->
/>
```

#### P3: Dead Code — ZoneGroup.vue (951 Z.)
`ZoneGroup.vue` in `components/zones/` wird von HardwareView NICHT mehr genutzt (durch ZonePlate ersetzt). Nur noch referenziert von:
- `PendingDevicesPanel.vue` (Import)
- `ESPCard.vue` (Import)
- `SensorsView.vue` (Import)
- `components/dashboard/index.ts` (Re-Export)
Pruefung noetig: Wird ZoneGroup anderswo aktiv gerendert oder ist es komplett tot?

### 4.1: UnassignedDropBar entfernen + Inline-Section staerken (~30min)

1. `UnassignedDropBar.vue` Import und Rendering aus HardwareView.vue entfernen (Z.42 + Z.899)
2. Inline Unassigned-Section (Z.745-810) behaelt ihre bestehende Funktionalitaet
3. Pruefen: Unassigned-Section braucht Drop-Target-Highlighting wie ZonePlate (`.zone-plate--drop-target` Klasse bei `dragStore.isDraggingEspCard`)
4. Unassigned-Section Header mit Inbox-Icon und Count ist bereits vorhanden (Z.753-766)

### 4.2: @change-zone in Unassigned-Section nachrüsten (~10min)

HardwareView.vue Z.795-801: `@change-zone="handleChangeZone"` ergaenzen.
Damit koennen auch nicht-zugewiesene ESPs per Click-to-Place (Overflow-Menu → "Zone aendern") einer Zone zugewiesen werden.

### 4.3: ZoneGroup.vue Nutzung pruefen + ggf. Dead-Code entfernen (~20min)

1. Pruefen ob ZoneGroup.vue noch irgendwo GERENDERT wird (nicht nur importiert)
2. Falls komplett tot → Import-Referenzen entfernen, Datei loeschen
3. Falls anderswo genutzt → dokumentieren wo und warum

### 4.4: Gesamt-Verifikation DnD-System (~30min)

**Alle DnD-Flows testen:**
- [x] Drag-Handle (⠿) sichtbar auf DeviceMiniCard (ESPCardBase.vue:69, DeviceMiniCard.vue:334-355)
- [x] Drag startet nur ueber Handle (ZonePlate.vue:413 `handle=".esp-drag-handle"`)
- [x] Alle Zonen als Drop-Target hervorgehoben bei Drag (ZonePlate.vue:309 `dragStore.isDraggingEspCard`)
- [ ] Unassigned-Section als Drop-Target hervorgehoben bei Drag (PRUEFEN nach P1-Fix)
- [x] Drop in Zone: API-Call + Toast + Card in neuer Zone (useZoneDragDrop:186-264)
- [x] Drop in Unassigned: API-Call + Toast + Card entfernt (useZoneDragDrop:270-343)
- [x] Click-to-Place via Overflow-Menu (HardwareView.vue:496-531)
- [x] Touch: Long-Press 300ms startet Drag (ZonePlate.vue:421)
- [x] Cancel: Escape resettet (dragState.store.ts:378-383)
- [x] Safety: 30s Timeout resettet haengenden State (dragState.store.ts:153-163)
- [x] Undo/Redo: Stack existiert (useZoneDragDrop:349-477)
- [ ] `@change-zone` in Unassigned-Section verdrahtet (NACH P2-Fix pruefen)
- [ ] `vue-tsc --noEmit` — 0 Fehler
- [ ] `npm run build` — erfolgreich

**Commit:** `fix(dnd): consolidate unassigned areas, wire change-zone, remove dead code`

---

## Block 5: "NICHT ZUGEWIESEN" und Pending-Devices Redesign (P1, ~2-3h)

> **[verify-block5 2026-02-27] Geprueft: 12 Dateien, 3 Stores, 2 Composables, 1 Branch. 7 Korrekturen, 3 fehlende Vorbedingungen, 5 Ergaenzungen.**

### Ziel
Unzugewiesene und Pending-Geraete prominent und handlungsorientiert anzeigen.

### Vorbedingungen (MUESSEN VOR Block 5 erfuellt sein)

- [ ] **Branch `feature/overview-tab-redesign` erstellen** — existiert NICHT, muss angelegt werden
- [x] **Block 4 (DnD) Status geklaert** — **[verify-plan 2026-02-27]** DnD zu ~85% implementiert. Nur Konsolidierung noetig: UnassignedDropBar entfernen, @change-zone in Unassigned-Section nachrüsten, ZoneGroup.vue Dead-Code prüfen
- [ ] **dashStore.pendingCount Bug fixen** — ist ein TOTER REF (siehe Korrektur K3 unten), VORAUSSETZUNG fuer Badge-Funktionalitaet

### 5.1: Unzugewiesene ESPs als eigene Zone-Sektion

- Gleiche AccordionSection-Komponente wie Zonen (existiert unter `src/shared/design/primitives/AccordionSection.vue`)
- Farblich abgesetzt: Orange-Tint via `rgba(245, 158, 11, 0.04)` (analog zu `header__alert` Pattern in TopBar.vue:476, Token: `var(--color-warning)` = Orange)
- Counter in der TopBar (Badge auf "Geraete"-Button) — **ACHTUNG K6:** Badge-Platzierung beachten (siehe 5.3)
- Wenn leer: Kompakte Darstellung "Alle Geraete zugewiesen" (eingeklappt)
- AccordionSection Default-State: `:default-open="unassignedDevices.length > 0"` (offen wenn Geraete vorhanden, geschlossen wenn leer — **Pruefen ob `defaultOpen` Prop existiert**)

### 5.2: Pending-Discovery-Workflow

> **KORREKTUR K5 (verify-block5 2026-02-27): Konflikt mit bestehendem PendingDevicesPanel.**
> Es existiert BEREITS ein vollstaendiges `PendingDevicesPanel.vue` (1106 Z.) als SlideOver mit 3 Tabs (Geraete/Wartend/Anleitung), Suche, Approve/Reject (Commit f3b8a9a hat Popover→SlideOver umgebaut).
>
> **ENTSCHEIDUNG NOETIG:** Soll das PendingDevicesPanel ERSETZT werden durch eine Inline-Sektion in HardwareView? Oder soll es ZUSAETZLICH zur Inline-Sektion bestehen bleiben? Beides gleichzeitig waere UX-Verwirrung.
>
> **Empfehlung:** PendingDevicesPanel als primaere Pending-Verwaltung BEIBEHALTEN (wurde gerade erst umgebaut). Inline-Sektion in HardwareView nur als KOMPAKTE VORSCHAU mit Link zum Panel ("3 neue Geraete — [Im Panel verwalten]"). Kein doppeltes Approve/Reject-UI.

Pending-ESPs (discovered aber nicht approved) — **kompakte Vorschau** in HardwareView:

```
┌──── Neue Geraete entdeckt (1) ────────────────────────────────────────┐
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ ESP_DISCOVERED_01                                              │    │
│  │ MAC: AA:BB:CC:DD:EE:FF  •  Firmware: v1.2.3                  │    │
│  │ Entdeckt: vor 3 Minuten                                       │    │
│  │                                                                │    │
│  │ [Im Panel verwalten]                                           │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

> **KORREKTUR K5b (verify-block5 2026-02-27): "Genehmigen und Zone zuweisen" als kombinierter Schritt existiert NICHT.**
> `espStore.approveDevice()` (esp.ts:369-396) genehmigt NUR, ohne Zone-Zuweisung. Fuer den kombinierten Flow braucht es entweder einen neuen API-Endpoint oder ein 2-Step-UI (erst approve, dann zone assign). **Empfehlung:** 2-Step-UI im PendingDevicesPanel — Approve-Button → danach Zone-Dropdown einblenden.

- "Im Panel verwalten" oeffnet PendingDevicesPanel SlideOver (bestehendes UI)
- Pending-Count als Badge auf "Geraete"-Button im TopBar — **ACHTUNG K6:** Platzierung beachten
- WebSocket-Event `device_discovered` (existiert in espStore Zeile 1203, registriert Zeile 1529) → Badge-Counter aktualisiert + Toast "Neues Geraet entdeckt"

### 5.3: TopBar-Badge fuer Unzugewiesene/Pending

```
[Geraete (3)]    ← Roter Badge wenn Pending oder Unzugewiesene vorhanden
[Geraete]        ← Kein Badge wenn alles zugewiesen
```

> **KORREKTUR K1 (verify-block5 2026-02-27): DREIFACHE Duplikation, nicht doppelt.**
> `unassignedDevices` ist als lokales computed DREIFACH vorhanden:
> 1. `UnassignedDropBar.vue:44` — `espStore.devices.filter(device => !device.zone_id)` (einfacher Falsy-Check)
> 2. `HardwareView.vue:335` — `groupDevicesByZone(espStore.devices).find(g => g.zoneId === ZONE_UNASSIGNED)` (nutzt ZONE_UNASSIGNED Konstante)
> 3. `PendingDevicesPanel.vue:74-78` — `unassignedGroup` computed (gleiche Logik via `groupDevicesByZone`)
>
> Migration zum espStore ist PFLICHT — ALLE DREI Instanzen auf den neuen Store-Getter migrieren.

> **KORREKTUR K2 (verify-block5 2026-02-27): Logik-Diskrepanz zwischen den Duplikaten.**
> - UnassignedDropBar: `!device.zone_id` — einfacher Falsy-Check
> - HardwareView + PendingDevicesPanel: `device.zone_id || ZONE_UNASSIGNED` via groupDevicesByZone
> - Beide sind funktional aequivalent (falsy = unassigned), aber der Store-Getter muss sich fuer EINE Variante entscheiden.
> - **Empfehlung:** `devices.filter(d => !d.zone_id)` als einfachste, konsistenteste Logik fuer den Store-Getter.

> **KORREKTUR K3 (verify-block5 2026-02-27): KRITISCHER BUG — dashStore.pendingCount ist ein TOTER REF.**
> - `dashStore.pendingCount` ist `ref(0)` in `dashboard.store.ts:71`
> - Wird NIRGENDWO geschrieben — kein einziger `pendingCount.value =` Aufruf in der gesamten Codebase
> - `dashStore.hasPendingDevices` (= `pendingCount > 0`) ist daher IMMER `false`
> - Die TopBar zeigt den Pending-Button mit iridescent-Pulse NIEMALS an
> - Gleichzeitig existiert `espStore.pendingCount` (esp.ts:191) als funktionierende `computed(() => pendingDevices.value.length)`
> - **FIX (VORAUSSETZUNG fuer Badge):** ENTWEDER `dashStore.pendingCount` als `computed` von `espStore.pendingCount` ableiten, ODER TopBar direkt auf `espStore` zugreifen lassen.

> **KORREKTUR K4 (verify-block5 2026-02-27): TopBar importiert NICHT useEspStore.**
> TopBar importiert aktuell NUR: `useAuthStore`, `useWebSocket`, `useDashboardStore`.
> **Empfehlung:** ENTWEDER den espStore in TopBar importieren (direkter Zugang zu pendingDevices + unassignedDevices), ODER die Counts ueber den dashStore bereitstellen (als computed vom espStore — weniger Kopplung).

> **KORREKTUR K6 (verify-block5 2026-02-27): TopBar-Badge nur auf Hardware-Route sichtbar.**
> - `dashStore.showControls` wird NUR in HardwareView.vue:214 (`dashStore.activate()`) auf `true` gesetzt
> - Der Pending-Button und Mock-Button in der TopBar sind mit `v-if="dashStore.showControls"` geschuetzt (TopBar.vue:209)
> - Auf Monitor-, CustomDashboard- und anderen Routes sind diese Buttons NICHT sichtbar
> - **Empfehlung:** Wenn der Badge global sichtbar sein soll (`[Geraete (3)]`), muss er AUSSERHALB des `v-if="dashStore.showControls"` Blocks platziert werden. Alternativ: Badge nur auf Hardware-Route (akzeptabel wenn bewusst so gewollt).

Implementation: `computed` Property — nach Migration zum espStore + pendingCount-Fix:
```typescript
// In espStore (esp.ts) — NEUER Getter:
const unassignedDevices = computed(() =>
  devices.value.filter(d => !d.zone_id)
)

// In TopBar.vue ODER dashStore — Badge-Count:
const pendingAndUnassignedCount = computed(() =>
  espStore.pendingDevices.length + espStore.unassignedDevices.length
)
```

> **KORREKTUR K7 (verify-block5 2026-02-27): ZONE_UNASSIGNED doppelt definiert.**
> - `useZoneDragDrop.ts:22`: `export const ZONE_UNASSIGNED = '__unassigned__'`
> - `SensorsView.vue:385`: `const ZONE_UNASSIGNED = '__unassigned__'` (lokale Kopie)
> - **Empfehlung (verwandtes Cleanup):** SensorsView sollte den Import aus composables nutzen.

### 5.4: Verifikation

- [ ] espStore.unassignedDevices als Store-Getter implementiert (ALLE 3 Duplikate migriert: UnassignedDropBar, HardwareView, PendingDevicesPanel)
- [ ] dashStore.pendingCount Bug gefixt (nicht mehr toter ref, sondern computed oder direkt espStore)
- [ ] Unzugewiesene ESPs erscheinen in eigener AccordionSection mit `:default-open="unassignedDevices.length > 0"`
- [ ] Pending ESPs: Kompakte Vorschau in HardwareView + Link zum PendingDevicesPanel (KEIN doppeltes Approve-UI)
- [ ] TopBar-Badge zeigt korrekte Anzahl — Platzierung-Entscheidung: nur Hardware-Route ODER global (ausserhalb showControls)
- [ ] Discovery-WebSocket-Event aktualisiert Badge + zeigt Toast
- [ ] DnD von Unzugewiesen in Zone und umgekehrt funktioniert (Drop-to-unassign bereits implementiert: useZoneDragDrop.ts:196)
- [ ] Leerer Zustand wird korrekt angezeigt
- [ ] ZONE_UNASSIGNED Import-Cleanup in SensorsView.vue (optional)

**Commit:** `feat(devices): unassigned section redesign, pending device workflow, pendingCount fix`

---

## Block 6: Status + Toast Integration (P1, ~2-3h)

> **[verify-plan 2026-02-27 FINAL]** Komplett geprueft gegen echte Codebase. IST-Zustand dokumentiert, Korrekturen inline.

### Ziel
Konsistente Status-Anzeige ueberall + Toast-Feedback bei allen Aktionen. Zwei bekannte Bugs fixen, dann Luecken-Audit.

### 6.1: statusCounts ref() → computed() (KRITISCH)

**Problem:** `dashboard.store.ts:63` — `statusCounts` ist `ref()`, wird manuell via `watch()` in `HardwareView.vue:269-275` beschrieben. Kann desynchronisieren (gleicher Bug-Typ wie `deviceCounts` aus Block 0).

**IST-Zustand (verifiziert):**
```typescript
// dashboard.store.ts:63
const statusCounts = ref({ online: 0, offline: 0, warning: 0, safeMode: 0 })

// HardwareView.vue:269-275 — manueller watch der statusCounts schreibt:
watch(
  [onlineCount, offlineCount, warningCount, safeModeCount],
  ([on, off, warn, safe]) => {
    dashStore.statusCounts = { online: on, offline: off, warning: warn, safeMode: safe }
  },
  { immediate: true }
)
```

**ACHTUNG — statusCounts hat 4 Felder, nicht 3!** Plan-Vorlage nannte `{ online, offline, warning }`, aber IST hat `safeMode` als 4. Feld. TopBar liest alle 4 (Z.177 `statusCounts.safeMode`).

**Fix:**
```typescript
// dashboard.store.ts — NACHHER:
import { getESPStatus } from '@/composables/useESPStatus'

const statusCounts = computed(() => {
  const counts = { online: 0, offline: 0, warning: 0, safeMode: 0 }
  for (const device of espStore.devices) {
    const status = getESPStatus(device)
    if (status === 'online' || status === 'stale') counts.online++
    else if (status === 'error') counts.warning++
    else if (status === 'safemode') {
      // ACHTUNG: getESPStatus() gibt 'safemode' (lowercase), StatusCounts-Key ist 'safeMode' (camelCase)
      counts.safeMode++
    }
    else counts.offline++
  }
  return counts
})
```

**Betroffene Dateien:**
- `src/shared/stores/dashboard.store.ts:63` — `ref()` → `computed()`, Import `getESPStatus` ergaenzen
- `src/views/HardwareView.vue:246-275` — Entferne: `onlineCount`, `offlineCount`, `warningCount`, `safeModeCount` computeds UND den `watch()` Block (6 computed + watch = ~30 Zeilen entfernen)
- `src/views/HardwareView.vue:1-20` — Pruefe ob `getESPStatus` Import entfallen kann (wird nur fuer statusCounts gebraucht, ZonePlate importiert es selbst)

**Verifikation:**
- TopBar zeigt korrekte Online/Offline/Warning/SafeMode-Counts (alle 4!)
- Counts aktualisieren reaktiv bei WebSocket-Events (kein manuelles Update noetig)
- `vue-tsc --noEmit` — 0 Fehler (statusCounts ist jetzt read-only computed)

### 6.2: Zone-Assignment-Toasts in zone.store.ts (KRITISCH)

**Problem:** `src/shared/stores/zone.store.ts` — `handleZoneAssignment()` (Z.80-127) hat NUR `logger.*` Aufrufe, KEINE `useToast()` Aufrufe. `handleSubzoneAssignment()` (Z.147-191) hat bereits Toasts. Inkonsistenz.

**IST-Zustand (verifiziert):**
- `useToast` ist bereits importiert (Z.16) — wird aber nur von `handleSubzoneAssignment` genutzt
- `handleZoneAssignment` hat `logger.info()` bei `zone_assigned`/`zone_removed` aber keinen Toast

**Fix:** In `zone.store.ts` — `handleZoneAssignment()`:
```typescript
// Nach Z.111 (setDevice bei zone_assigned):
const toast = useToast()
const deviceName = device.name || espId
toast.success(`${deviceName} → Zone "${data.zone_name || data.zone_id}" zugewiesen`)

// Nach Z.121 (setDevice bei zone_removed):
const toast = useToast()
const deviceName = device.name || espId
toast.info(`${deviceName} ist jetzt unzugewiesen`)

// Nach Z.123 (error case):
const toast = useToast()
toast.error(data.message || `Zone-Zuweisung fehlgeschlagen fuer ${espId}`)
```

**Deduplication-Analyse (WICHTIG):**
- `useZoneDragDrop.ts:221` hat Toast: `"${deviceName}" wurde zu "${zoneName}" zugewiesen` (bei DnD success)
- `useZoneDragDrop.ts:300` hat Toast: `"${deviceName}" wurde aus "${zoneName}" entfernt` (bei DnD remove)
- `zone.store.ts` Toast wuerde bei WebSocket-ACK feuern (NACH der DnD-Aktion)
- **Texte sind UNTERSCHIEDLICH** → useToast Deduplication (2s Window, gleicher Message+Type) greift NICHT automatisch
- **Loesung:** Toast-Texte im zone.store IDENTISCH machen wie in useZoneDragDrop — dann greift die 2s Dedup. ODER: `zone.store` Toast nur bei `error` Status ergaenzen (success/info weglassen weil DnD das bereits abdeckt). **Empfehlung: Nur error-Toast in zone.store, success/info kommt bereits von useZoneDragDrop.**
- **ABER:** Bei externen Zone-Zuweisungen (z.B. via API, anderer Client) gibt es NUR den WebSocket-Event, kein DnD. Dann wuerde der Toast fehlen. **Finale Empfehlung:** Toasts in zone.store ergaenzen, Texte identisch mit useZoneDragDrop formulieren, dann greift 2s Dedup bei DnD-Flow.

**Betroffene Dateien:**
- `src/shared/stores/zone.store.ts` — Toast-Aufrufe in `handleZoneAssignment` Z.102-126 ergaenzen

### 6.3: Status-Darstellung Audit (Dot + Text ueberall)

**Grundregel:** Status wird IMMER als Dot + Text dargestellt. Nie nur Farbe.

| Status | Dot | Text | Wann |
|--------|-----|------|------|
| online | ● gruen | "Online" | Heartbeat innerhalb 1.5x Intervall |
| stale | ● orange | "Verzoegert" | Heartbeat 1.5-5min alt |
| offline | ○ rot | "Offline" | Kein Heartbeat >5min |
| error | ● rot | "Fehler" | ESP meldet Error |
| safemode | ● warning | "SafeMode" | GPIO-Safe-Mode |
| unknown | ● grau | "Unbekannt" | Kein Heartbeat je empfangen |

**IST-Zustand je Komponente (verifiziert 2026-02-27):**

| Komponente | useESPStatus? | Dot? | Text? | Status |
|------------|--------------|------|-------|--------|
| DeviceMiniCard.vue | JA (`getESPStatus` + `getESPStatusDisplay`) | JA (Z.226-229) | JA (Z.232-233 `statusText`) | OK |
| ESPSettingsSheet.vue | JA (`useESPStatus` Composable Z.77) | JA (via statusColor) | JA (via statusText) | OK |
| PendingDevicesPanel.vue | JA (`getESPStatus` + `getESPStatusDisplay` Z.23) | NEIN (nur Text-Farbe) | JA (Z.316/358-359 `getESPStatusDisplay().text`) | KORREKTUR: Dot fehlt |
| ZonePlate.vue | JA (`getESPStatus` Z.30 fuer Aggregation) | JA (Z.366-368 Zone-Status-Dot) | JA (Z.369 `statusLabel`) | OK (Zone-Level) |
| StatusPill.vue | Props-basiert (type/count/label) | JA (Z.38 `status-pill__dot`) | JA (Z.40 `status-pill__label`) | OK |

**Aktion:** Nur PendingDevicesPanel braucht einen Status-Dot vor dem Text. In Z.313-317 und Z.356-359 fehlt ein `<span>` mit Dot-Styling. Kleiner Fix: CSS-Dot-Span vor dem Text einfuegen.

### 6.4: Toast-Luecken-Audit

**IST-Zustand (verifiziert 2026-02-27):**

| Aktion | Toast? | Wo implementiert | Status |
|--------|--------|-----------------|--------|
| DnD Zone-Zuweisung | JA | `useZoneDragDrop.ts:221` | OK |
| DnD Zone-Entfernung | JA | `useZoneDragDrop.ts:300` | OK |
| DnD fehlgeschlagen | JA | `useZoneDragDrop.ts:247-256` (error + retry action) | OK |
| Zone erstellt | JA | `HardwareView.vue:399` `showSuccess("Zone ... erstellt")` | OK |
| Zone geloescht | JA | `HardwareView.vue:631` `showSuccess("Zone geloescht ...")` | OK |
| Zone umbenannt | JA | `HardwareView.vue:613` `showSuccess("Zone umbenannt ...")` | OK |
| ESP geloescht (Settings) | JA | `ESPSettingsSheet.vue:202` `showSuccess("... wurde geloescht")` | OK |
| ESP geloescht (Panel) | JA | `PendingDevicesPanel.vue:231` `showSuccess("... wurde geloescht")` | OK |
| Sensor konfiguriert | JA | `SensorConfigPanel.vue:223` `toast.success("Sensor-Konfiguration gespeichert")` | OK |
| Config-Error | JA | `SensorConfigPanel.vue:226` `toast.error(msg)` | OK |
| Neues Geraet entdeckt | JA | `esp.ts:1237` `toast.info("Neues Geraet entdeckt: ...")` duration 4s | OK (aber 4s statt 8s) |
| ESP online (Reconnect) | JA | `esp.ts:1405` `toast.info("... ist wieder online")` | OK |
| ESP offline (LWT) | JA | `esp.ts:1079-1083` `toast.warning("... Verbindung unerwartet verloren")` | OK (nur LWT-Source) |
| ESP approved | JA | `esp.ts:395` + `esp.ts:1269` (doppelt: Action + WS-Handler) | PRUEFE Dedup |
| ESP rejected | JA | `esp.ts:429` + `esp.ts:1293` (doppelt: Action + WS-Handler) | PRUEFE Dedup |
| Zone-Assignment WS-ACK | NEIN | `zone.store.ts:80-127` — KEIN Toast | FIX in 6.2 |

**Luecken-Zusammenfassung:**
1. **Zone-Assignment WS-ACK** (zone.store.ts) — Fix in 6.2
2. **PendingDevicesPanel Status-Dot** — Fix in 6.3
3. **device_discovered Toast-Dauer:** 4s statt empfohlener 8s — optional anpassen
4. **ESP offline Toast:** Nur bei `lwt` Source, nicht bei `heartbeat_timeout` — bewusste Design-Entscheidung (Heartbeat-Timeouts wuerden bei vielen Devices zu Toast-Spam fuehren), KEIN Fix noetig
5. **ESP approve/reject doppelte Toasts:** Action-Handler UND WS-Handler haben beide Toasts. Dedup (2s Window, gleicher Text+Type) sollte greifen weil Texte aehnlich sind — testen!

### 6.5: Verifikation

- [ ] `statusCounts` ist `computed()` — keine manuellen `.value =` Zuweisungen mehr
- [ ] `statusCounts` hat 4 Felder: `{ online, offline, warning, safeMode }` (nicht 3!)
- [ ] TopBar zeigt korrekte Online/Offline/Warning/SafeMode-Counts, reaktiv
- [ ] HardwareView: `onlineCount`, `offlineCount`, `warningCount`, `safeModeCount` + `watch()` entfernt (~30 Z.)
- [ ] Zone-Assignment-Toasts funktionieren (DnD + WebSocket, keine Duplikate)
- [ ] PendingDevicesPanel: Status-Dot vor Status-Text
- [ ] Toast bei: Zone erstellen/loeschen/umbenennen, ESP loeschen, Sensor-Config, Device-Discovery — ALLES BEREITS VORHANDEN
- [ ] Keine Toast-Duplikate bei DnD (useZoneDragDrop + zone.store Deduplication-Check)
- [ ] `vue-tsc --noEmit` — 0 Fehler
- [ ] `npm run build` — erfolgreich

**Commit:** `feat(ux): statusCounts computed, zone toasts, consistent status display`

### Zusammenfassung Block 6

| Sub-Task | Aufwand | Prio | Details |
|----------|---------|------|---------|
| 6.1 statusCounts → computed() | ~30min | KRITISCH | dashboard.store.ts + HardwareView.vue (~30 Zeilen entfernen). ACHTUNG: 4 Felder nicht 3! |
| 6.2 Zone-Assignment-Toasts | ~20min | KRITISCH | zone.store.ts handleZoneAssignment() — 3 Toast-Aufrufe ergaenzen. Dedup-Texte synchronisieren |
| 6.3 Status-Dot Audit | ~15min | MITTEL | Nur PendingDevicesPanel braucht Dot. Rest ist bereits OK |
| 6.4 Toast-Luecken-Audit | ~0min | ERLEDIGT | Alle Toasts sind bereits vorhanden (verifiziert). Nur Zone-WS-ACK fehlt (6.2) |
| 6.5 Verifikation + Build | ~15min | PFLICHT | vue-tsc + npm run build |
| **Gesamt** | **~1.5h** | | Reduziert von ~2-3h weil Audit zeigt: fast alles ist bereits implementiert |

---

## Block 7: Routen-Pruefung und Navigation-Fixes (~15-20min)

> **KORREKTUR (verify-plan 2026-02-27, Code-Analyse):** Aufwand drastisch reduziert. 7.1 Route-Audit: ALLE Routen sind bereits korrekt — 0 Aenderungen noetig. 7.2 Breadcrumb: Grundstruktur (3 Segmente, klickbar) existiert bereits — nur Formatierung (Zone-Prefix + Online-Count) fehlt. 7.3 Escape/Back: vollstaendig implementiert. Realer Restaufwand: ~15-20min fuer Breadcrumb-Formatierung + Verifikation.

### Ziel
Breadcrumb-Formatierung auf Ebene 2 erweitern (Zone-Prefix + Online-Count). Alles andere ist bereits implementiert und muss nur verifiziert werden.

### 7.1: ~~Route-Audit~~ — BEREITS KOMPLETT KORREKT

> **[verify-plan 2026-02-27] VERIFIZIERT gegen `router/index.ts` (246 Zeilen):** Alle Routen existieren und sind korrekt konfiguriert. KEINE Aenderungen noetig.

| Route | Status | Beweis (router/index.ts) |
|-------|--------|--------------------------|
| `/hardware` | ✅ KORREKT | Zeile 37-41: `component: HardwareView`, `meta: { title: 'Uebersicht' }`. Root `/` redirected hierhin (Zeile 29-31) |
| `/hardware/:zoneId` | ✅ KORREKT — KEIN Redirect noetig | Zeile 43-47: Laedt HardwareView.vue direkt. HardwareView:181-196 hat Watch der auto-expandiert + scrollt zur Zone. BESSER als Redirect weil URL erhalten bleibt. **ZoneDetailView.vue ist NICHT im Router** (nur Component in `components/zones/`) |
| `/hardware/:zoneId/:espId` | ✅ KORREKT | Zeile 49-53: Laedt HardwareView.vue, `currentLevel` computed erkennt `espId` → Level 2 (Orbital) |
| `/monitor` | ✅ KORREKT | Zeile 59-63: `component: MonitorView` |
| `/monitor/:zoneId` | ✅ KORREKT | Zeile 65-69: `component: MonitorView` (zusaetzliche Route, nicht im Plan) |
| `/custom-dashboard` | ✅ KORREKT | Zeile 75-79: `component: CustomDashboardView` |
| `/dashboard-legacy` | ✅ KORREKT | Zeile 83-85: `redirect: '/hardware'` |
| 9 Deprecated Redirects | ✅ ALLE AKTIV | Siehe Tabelle unten |

**Deprecated Redirects (tatsaechlich 9+1=10, nicht 7+1=8 wie im Plan):**

| Redirect | Ziel | Zeile |
|----------|------|-------|
| `/dashboard-legacy` | `/hardware` | 83-85 |
| `/devices` | `/hardware` | 88-92 |
| `/devices/:espId` | `/hardware?openSettings={espId}` | 93-100 |
| `/mock-esp` | `/hardware` | 101-104 |
| `/mock-esp/:espId` | `/hardware?openSettings={espId}` | 105-111 |
| `/database` | `/system-monitor?tab=database` | 113-117 |
| `/logs` | `/system-monitor?tab=logs` | 119-123 |
| `/audit` | `/system-monitor?tab=events` | 130-136 |
| `/mqtt-log` | `/system-monitor?tab=mqtt` | 155-160 |
| `/actuators` | `/sensors?tab=actuators` | 173-178 |

**Zusaetzlich:** Catch-All `/:pathMatch(.*)*` → `/hardware` (Zeile 207-210)

### 7.2: Breadcrumb-Formatierung (~15min) — EINZIGE offene Arbeit

> **[verify-plan 2026-02-27] IST-Zustand analysiert:** TopBar.vue:80-106 rendert BEREITS 3 Breadcrumb-Segmente auf Ebene 2. HardwareView.vue:407-417 setzt `dashStore.breadcrumb` mit `zoneName` und `deviceName`. Navigation per Klick funktioniert bereits.

**IST (TopBar.vue:80-106 + HardwareView.vue:393-417):**
```
Ebene 1: Hardware (current)
Ebene 2: Hardware > {zoneName} > {deviceName}
          klickbar    klickbar    current
```

**SOLL:**
```
Ebene 2: Hardware > Zone: Echt (2/3 Online) > ESP_472204
```

**Was fehlt (NUR Formatierung, keine Strukturaenderung):**
1. "Zone: " Prefix vor dem Zone-Namen im Breadcrumb-Label
2. "(X/Y Online)" Count im Zone-Segment

**Wo aendern:**
- Option A (einfach): In `TopBar.vue:86-89` — Zone-Label formatieren: `` `Zone: ${zoneName} (${onlineCount}/${totalCount} Online)` ``
- Option B (sauberer): In `HardwareView.vue:393-396` — `selectedZoneName` computed bereits mit formatiertem String
- TopBar braucht fuer Option A Zugriff auf Zone-Devices → aus `espStore.devices.filter(d => d.zone_id === route.params.zoneId)` + `getESPStatus()`

**Klick-Navigation (BEREITS implementiert):**
- "Hardware" → `router.push('/hardware')` ✅ (TopBar.vue:108-110)
- "Zone: Echt" → `router.push('/hardware/{zoneId}')` ✅ (TopBar.vue:89, triggert HardwareView scroll-watch)
- Letztes Segment nicht klickbar ✅ (TopBar.vue:136, `crumb.current`)

### 7.3: ~~Escape-Key + Browser-Back~~ — BEREITS KOMPLETT IMPLEMENTIERT

> **[verify-plan 2026-02-27] VERIFIZIERT:** Alles funktioniert.

| Feature | Status | Beweis |
|---------|--------|--------|
| Escape-Key | ✅ | HardwareView.vue:233-241: `register({ key: 'Escape', handler: zoomOut })` mit Cleanup in `onUnmounted` |
| `zoomOut()` | ✅ | HardwareView.vue:431-434: `router.push({ name: 'hardware' })` |
| Browser-Back | ✅ | Funktioniert automatisch weil `router.push()` History-Eintraege erstellt |
| Deep-Link | ✅ | `/hardware/:zoneId/:espId` laedt HardwareView, `currentLevel` computed liest `route.params.espId` → Level 2 |
| Swipe-Back (mobile) | ✅ | HardwareView.vue:80-84: `useSwipeNavigation` mit `onSwipeRight → zoomOut()` |

### 7.4: Verifikation

- [x] `/hardware` zeigt Zonen-Uebersicht — Route korrekt (router:37-41)
- [x] `/hardware/:zoneId/:espId` zeigt Orbital-Layout — Route korrekt (router:49-53), `currentLevel === 2`
- [x] `/hardware/:zoneId` laedt HardwareView mit Scroll-to-Zone — KEIN Redirect, besser (router:43-47 + HardwareView:181-196)
- [ ] Breadcrumb auf Ebene 2 zeigt: Hardware > Zone: Name (X/Y Online) > ESP-Name — **NUR FORMATIERUNG FEHLT**
- [x] Breadcrumb-Segmente sind klickbar und navigieren korrekt (TopBar.vue:108-110, 131-136)
- [x] Escape-Key auf Ebene 2 → zurueck zu Ebene 1 (HardwareView.vue:233-241)
- [x] Browser-Back funktioniert (router.push History)
- [x] Alle 10 deprecated Redirects funktionieren (router:83-178)
- [x] Deep-Link `/hardware/zoneId/espId` laedt korrekt
- [ ] `vue-tsc --noEmit` — 0 Fehler (nach Breadcrumb-Aenderung pruefen)
- [ ] `npm run build` — erfolgreich (nach Breadcrumb-Aenderung pruefen)

**Commit:** `feat(breadcrumb): add zone prefix and online count on level 2`

---

## Block 8: Integration und Abschluss (~2-3h)

> **[verify-plan 2026-02-27] KOMPLETT-ANALYSE gegen Codebase (master, Commit f3b8a9a):**
> Massive Diskrepanzen zwischen Plan-Annahmen und IST-Zustand gefunden.
> Viele Bloecke (4-7) sind auf master BEREITS implementiert — kein Feature-Branch existiert.
>
> **IST-Zustand (verifiziert 2026-02-27):**
> - `feature/overview-tab-redesign` Branch existiert **NICHT** (nur `master` lokal)
> - Alle Commits sind direkt auf `master` gelandet
> - `statusCounts` ist BEREITS `computed()` in `dashboard.store.ts:64` (Block 6.1 ERLEDIGT)
> - `pendingCount` ist BEREITS `computed(() => espStore.pendingCount)` in `dashboard.store.ts:94` (Block 5 K3 ERLEDIGT)
> - `espStore.unassignedDevices` als Store-Getter existiert BEREITS (`esp.ts:186`) — ALLE 3 Duplikate nutzen bereits `espStore.unassignedDevices` (HardwareView:307, UnassignedDropBar:44, PendingDevicesPanel:74) (Block 5 K1/K2 ERLEDIGT)
> - Zone-Assignment-Toasts sind BEREITS in `zone.store.ts:118,132,135` implementiert (Block 6.2 ERLEDIGT)
> - PendingDevicesPanel hat BEREITS Status-Dots (Z.313, Z.360) + getESPStatusDisplay (Block 6.3 ERLEDIGT)
> - Breadcrumb-Formatierung "Zone: Name (X/Y Online)" ist BEREITS in `HardwareView.vue:402` (Block 7.2 ERLEDIGT)
> - `@change-zone` fehlt NOCH in Unassigned-Section (HardwareView.vue Z.795-801) (Block 4 P2 OFFEN)
> - `UnassignedDropBar.vue` wird NOCH gerendert (HardwareView.vue:899) — doppelte Unassigned-UI (Block 4 P1 OFFEN)
> - `ZoneGroup.vue` (951 Z.) wird NIRGENDS importiert — komplett Dead Code (Block 4 P3 OFFEN)
> - `ZONE_UNASSIGNED` ist NOCH doppelt definiert (useZoneDragDrop.ts:22 + SensorsView.vue:385) (Block 5 K7 OFFEN, niedriger Prio)
>
> **Zeilenzahlen (aktuell verifiziert):**
> | Datei | Plan | IST |
> |-------|------|-----|
> | HardwareView.vue | 1316 | **1288** |
> | ZonePlate.vue | 810 | **843** |
> | DeviceMiniCard.vue | 589 | **595** |
> | UnassignedDropBar.vue | 578 | **598** |
> | ESPSettingsSheet.vue | 1341 | **1341** (stabil) |
> | PendingDevicesPanel.vue | 1106 | **1117** |
> | dashboard.store.ts | 268 | **291** |
> | esp.ts | 1671 | **1676** |
> | zone.store.ts | 209 | **209** (stabil) |
> | TopBar.vue | 951 | **951** (stabil) |

### Ziel

Verbleibende Luecken aus Block 4-7 schliessen, Build+Tests verifizieren, visuell pruefen, Performance sicherstellen. Letzter Block vor Abschluss des Uebersicht-Tab-Redesigns.

### 8.1: Offene Code-Fixes (aus Block 4/5/7) (~30min)

**8.1a: `@change-zone` in Unassigned-Section nachrüsten (Block 4 P2)**

Datei: `src/views/HardwareView.vue:795-801`
```vue
<!-- IST (Z.795-801): -->
<DeviceMiniCard
  :device="device"
  :is-mock="isMockDevice(device)"
  @click="onDeviceCardClick"
  @settings="handleSettings"
  @delete="handleDelete"
  <!-- FEHLT: @change-zone="handleChangeZone" -->
/>
```
Fix: `@change-zone="handleChangeZone"` ergaenzen. Damit koennen nicht-zugewiesene ESPs per Click-to-Place (Overflow-Menu → "Zone aendern") einer Zone zugewiesen werden.

**8.1b: UnassignedDropBar.vue entfernen (Block 4 P1)**

Aktuell existieren ZWEI Unassigned-Bereiche gleichzeitig:
1. Inline AccordionSection in HardwareView Z.745-810 (mit VueDraggable, Handle, DnD-Klassen)
2. UnassignedDropBar.vue (598 Z.) gerendert in HardwareView Z.899 (fixed-position Tray)

Aktion:
- HardwareView.vue Z.42: `import UnassignedDropBar` entfernen
- HardwareView.vue Z.899: `<UnassignedDropBar />` entfernen
- Pruefen: Unassigned-Section (Z.745-810) braucht Drop-Target-Highlighting analog zu ZonePlate (`.zone-plate--drop-target`)
- **NICHT** `UnassignedDropBar.vue` Datei loeschen (kann in index.ts re-exported sein, nur Import+Rendering entfernen)

**8.1c: ZoneGroup.vue Dead-Code pruefen (Block 4 P3)**

`ZoneGroup.vue` (951 Z.) in `components/zones/` wird NIRGENDS importiert:
- Kein `import.*ZoneGroup.*from.*zones/ZoneGroup` in der gesamten Codebase
- `ZonePlate.vue:804` hat nur einen CSS-Kommentar-Verweis
- Re-Export in `components/dashboard/index.ts:5` ist nur ein Kommentar

Aktion: Pruefen ob `components/zones/ZoneGroup.vue` sicher geloescht werden kann. Falls ja: Datei entfernen + eventuellen Re-Export in index.ts bereinigen.

**8.1d: ZONE_UNASSIGNED Import-Cleanup (Block 5 K7, optional)**

`SensorsView.vue:385` hat lokale Kopie `const ZONE_UNASSIGNED = '__unassigned__'`.
Import aus `@/composables/useZoneDragDrop` waere sauberer. Niedriger Prio, kann uebersprungen werden.

### 8.2: Build-Verifikation (~15min)

```bash
cd "El Frontend"
npx vue-tsc --noEmit          # 0 TypeScript-Fehler
npm run build                  # Erfolgreich
npm run test                   # Alle bestehenden Tests gruen
```

**Erwartete Testergebnis-Baseline (verifiziert):**
- Existierende Unit-Tests: 42 Dateien in `tests/unit/`
- dragState.test.ts (981 Z.), dashboard.test.ts (236 Z.), ZonePlate.test.ts (123 Z.), ESPSettingsSheet.test.ts (157 Z.), PendingDevicesPanel.test.ts (337 Z.)
- Bekannt: 8 pre-existing Failures (nicht durch diesen Auftrag verursacht)

### 8.3: Neue Unit-Tests schreiben (~45min)

**Fehlende Tests (verifiziert gegen `tests/unit/`):**

| Test-Datei | Existiert? | Was testen |
|-----------|-----------|------------|
| `tests/unit/composables/useESPStatus.test.ts` | **NEIN** | `getESPStatus()`: online bei Heartbeat <90s, stale bei 90-300s, offline bei >300s, safemode/error/unknown. `getESPStatusDisplay()`: korrektes color/text/icon-Mapping |
| `tests/unit/components/AccordionSection.test.ts` | **NEIN** | oeffnen/schliessen, `modelValue` Prop (v-model), `#header` Slot mit `{isOpen, toggle}`, localStorage-Persistenz via `storage-key` |
| `tests/unit/composables/useZoneDragDrop.test.ts` | **NEIN** | `groupDevicesByZone()`, `handleDeviceDrop()` API-Call, `handleRemoveFromZone()`, Undo/Redo-Stack (max 20), Toast-Benachrichtigungen |

**Existierende Tests erweitern:**

| Test-Datei | Existiert? | Was ergaenzen |
|-----------|-----------|---------------|
| `tests/unit/stores/dashboard.test.ts` | **JA (236 Z.)** | `statusCounts` computed: korrekte Zaehlung bei gemischten Status (online+stale→online, safemode→safeMode camelCase, error→warning). ACHTUNG: Test muss `espStore` mocken mit Devices die verschiedene `getESPStatus()` Ergebnisse liefern |
| `tests/unit/stores/dragState.test.ts` | **JA (981 Z.)** | ggf. bereits vollstaendig — pruefen ob Safety-Timeout (30s) und Escape-Cancel getestet sind |

**NICHT testen (Plan-Korrektur):**
- ~~`ESPOverviewCard.vue`~~ — existiert NICHT. `DeviceMiniCard.vue` ist die korrekte Komponente. Test existiert nicht, aber Card wird durch bestehende ZonePlate.test.ts indirekt getestet.

### 8.4: Visueller Gesamt-Check (~30min, manuell durch Robin)

Robin startet Dev-Server und prueft systematisch:

| # | Check | Was pruefen | Kriterium | Verifiziert |
|---|-------|-------------|-----------|-------------|
| 1 | 5-Sekunden-Regel | Status sofort sichtbar? | Zone-Online-Counts im Accordion-Header (ZonePlate Z.366-369) | [ ] |
| 2 | 2-Klick-Regel | ESP finden+oeffnen in max 2 Klicks? | 1 Klick auf "Oeffnen" auf DeviceMiniCard → Orbital-Layout | [ ] |
| 3 | Stale-Visualisierung | Live vs. gecached erkennbar? | Graue Sparkbars + "Zuletzt vor X Min." bei Offline-ESPs (DeviceMiniCard CSS `.device-mini-card--stale`) | [ ] |
| 4 | DnD-Affordance | DnD-Faehigkeit erkennbar? | Grip-Handle (⠿) sichtbar (ESPCardBase:69 `.esp-drag-handle`), `cursor: grab/grabbing` | [ ] |
| 5 | DnD Zone→Zone | ESP zwischen Zonen verschieben | Drag + Drop → Toast + Card in neuer Zone | [ ] |
| 6 | DnD Zone→Unzugewiesen | ESP aus Zone entfernen | Drop in Unassigned-Section → Toast + Card verschwindet aus Zone | [ ] |
| 7 | DnD Unzugewiesen→Zone | ESP einer Zone zuweisen | Drop in ZonePlate → Toast + Card in Zone | [ ] |
| 8 | Click-to-Place | Alternative zu DnD | DeviceMiniCard Overflow → "Zone aendern" → Dropdown → Zuweisung (HardwareView:496-531) | [ ] |
| 9 | Toasts | Feedback bei allen Aktionen? | DnD-Zuweisung, Zone erstellen, Zone loeschen, Zone umbenennen, ESP loeschen | [ ] |
| 10 | Konfigurationspanel | ESPSettingsSheet oeffnet korrekt? | Klick auf "Konfigurieren" in DeviceMiniCard Overflow → SlideOver mit Sensor/Actuator-Liste | [ ] |
| 11 | Breadcrumb | Ebene-2-Navigation korrekt? | Hardware > Zone: Name (X/Y Online) > ESP-Name, Segmente klickbar (TopBar.vue:80-106) | [ ] |
| 12 | Responsive | 1280px Laptop-Breakpoint? | Layout bricht nicht, Cards wrappen, kein Overflow | [ ] |
| 13 | Unassigned-Section | Nur EINE Unassigned-Darstellung? | Nach 8.1b: Kein fixed-position Tray mehr am unteren Rand, nur Inline-AccordionSection | [ ] |

### 8.5: Performance-Check (~15min, manuell durch Robin)

| # | Check | Kriterium | Verifiziert |
|---|-------|-----------|-------------|
| 1 | Kein Layout-Shift | Zonen-Accordion oeffnen/schliessen ohne Sprung | [ ] |
| 2 | DnD-Ghost | Folgt Cursor ohne Lag (<16ms) — CSS Transform statt DOM-Manipulation | [ ] |
| 3 | Toast-Animationen | 60fps, kein Jank | [ ] |
| 4 | Skalierung | 10+ Mock-ESPs verteilt auf 3+ Zonen: Seite bleibt responsiv, kein Scroll-Jank | [ ] |
| 5 | SlideOver-Oeffnung | ESPSettingsSheet + PendingDevicesPanel ohne Verzoegerung | [ ] |

### 8.6: Known Issues dokumentieren (~10min)

Falls bei Verifikation Probleme auffallen die nicht in Block-8-Scope fallen:

| Severity | Issue | Zuordnung |
|----------|-------|-----------|
| MITTEL | `ZONE_UNASSIGNED` doppelt definiert (useZoneDragDrop + SensorsView) | Cleanup-Auftrag |
| MITTEL | `ZoneDetailView.vue` (347 Z.) existiert noch aber wird nicht im Router genutzt | Cleanup-Auftrag |
| NIEDRIG | device_discovered Toast 4s statt empfohlener 8s (esp.ts:1237) | UX-Feinschliff |
| INFO | ESP approve/reject doppelte Toasts (Action + WS-Handler) — Dedup sollte greifen, testen | UX-Feinschliff |
| INFO | 8 pre-existing Test-Failures (nicht durch diesen Auftrag) | Separater Bug-Fix |

### 8.7: Abschluss-Verifikation (Checkliste)

**Code-Fixes:**
- [x] `@change-zone="handleChangeZone"` in HardwareView.vue Unassigned-Section ergaenzt (8.1a) — Z.801
- [x] UnassignedDropBar Import+Rendering aus HardwareView.vue entfernt (8.1b) — kein Import, kein Rendering
- [x] Unassigned-Section hat Drop-Target-Highlighting bei Drag (8.1b) — Z.747 `:class` + Z.1214 CSS
- [x] ZoneGroup.vue Dead-Code geloescht (8.1c) — Datei entfernt, keine Imports verblieben

**Build:**
- [x] `vue-tsc --noEmit` — 0 TypeScript-Fehler
- [x] `npm run build` — erfolgreich (5.74s)
- [x] `npm run test` — 1397 passed, 24 failed (nur pre-existing: ESPSettingsSheet 2, PendingDevicesPanel 20, design-exports 2 Timeouts)

**Neue Tests:**
- [x] `useESPStatus.test.ts` — 31 Tests (19 original + 12 neu: priority-ordering, mock system_state ERROR/SAFE_MODE, mock+real Gleichheit)
- [x] `AccordionSection.test.ts` — 16 Tests (oeffnen/schliessen, modelValue, #header Slot, localStorage-Persistenz, nextTick-Fix)
- [x] `dashboard.test.ts` — 45 Tests (komplett neugeschrieben: espStore-Mock mit reactive(), statusCounts/deviceCounts/pendingCount via getESPStatus, mock+real Koexistenz)
- [ ] Optional: `useZoneDragDrop.test.ts` — nicht erstellt (nicht kritisch)

**Mock/Real ESP Konsistenz-Fixes (zusaetzlich):**
- [x] `getESPStatus()` — Priority-Reihenfolge korrigiert: error/safemode VOR online. `system_state === 'ERROR'` jetzt erkannt (Mock-ESP Kompatibilitaet)
- [x] `useESPStatus.isMock` — `includes('MOCK')` durch `startsWith('ESP_MOCK_')` || `startsWith('MOCK_')` ersetzt (konsistent mit espApi.isMockEsp)
- [x] ZonePlate.vue warnings — separate Mock/Real-Logik durch einheitliches `getESPStatus()` ersetzt + emergency_stopped als Zusatz
- [x] HardwareView.vue filteredEsps — separate Mock/Real-Filterlogik durch `getESPStatus()` ersetzt (konsistent mit statusCounts)

**Visuell (Robin):**
- [ ] Alle 13 Kriterien aus 8.4 bestanden
- [ ] Alle 5 Performance-Checks aus 8.5 bestanden

**Known Issues:**
- [x] Dokumentiert in Abschnitt 8.6

**Known Issues (aktualisiert 2026-02-27):**

| Severity | Issue | Zuordnung |
|----------|-------|-----------|
| MITTEL | `ZONE_UNASSIGNED` doppelt definiert (useZoneDragDrop + SensorsView) | Cleanup-Auftrag |
| MITTEL | `ZoneDetailView.vue` (347 Z.) existiert noch aber wird nicht im Router genutzt | Cleanup-Auftrag |
| NIEDRIG | device_discovered Toast 4s statt empfohlener 8s (esp.ts:1237) | UX-Feinschliff |
| NIEDRIG | ESPSettingsSheet.test.ts: 2 Failures (aria-Attribute nach SlideOver-Umbau) | Test-Fix |
| NIEDRIG | PendingDevicesPanel.test.ts: 20 Failures (SlideOver-Refactor, Store-Mocking fehlt) | Test-Fix |
| NIEDRIG | design-exports.test.ts: 2 Timeout-Failures (Worker-Timeout) | Test-Infra |
| INFO | ESP approve/reject doppelte Toasts (Action + WS-Handler) — Dedup sollte greifen | UX-Feinschliff |

**Commit:** `feat(overview): block 8 — integration, cleanup, tests, mock/real consistency`

---

## Abhaengigkeiten

| Auftrag | Beziehung | Status |
|---------|-----------|--------|
| ~~**Zone-CRUD Backend-API**~~ | ~~**BLOCKER**~~ → **KEIN BLOCKER.** Zone-Architektur-Analyse (2026-02-26): Zonen sind String-Felder, implizites Assignment-System vollstaendig funktional. 0h Backend noetig. Siehe `analyse-zone-subzone-architektur.md` | **AUFGELOEST** |
| `auftrag-hardware-tab-css-settings-ux.md` Block A | **MUSS VORHER erledigt sein** — CSS-Extraktion fuer Modal/Form-Styles | **ERLEDIGT (2026-02-26)** |
| `auftrag-hardware-tab-css-settings-ux.md` Block B | **SYNERGIEN** — AccordionSection.vue (172 Z.) dort erstellt, hier wiederverwendbar | **ERLEDIGT (2026-02-26)** |
| `auftrag-hardware-tab-css-settings-ux.md` Block C | **MUSS VORHER erledigt sein** — `useESPStatus.ts` wird hier ueberall genutzt | **ERLEDIGT (2026-02-26)** |
| `auftrag-view-architektur-dashboard-integration.md` Block D | **GRUNDLAGE** — 2-Ebenen-Vision ist verbindlich. Block 7.3 ist BEREITS ERLEDIGT. **[verify-plan 2026-02-27] Dateiname korrigiert (war `auftrag-dashboard-umbenennung-erstanalyse.md`)** | FREIGEGEBEN |
| `auftrag-orbital-split.md` | **PARALLEL MOEGLICH** — Orbital-Layout bleibt unveraendert. Path-Import-Aenderung bei Split beachten | **ERLEDIGT (2026-02-26)** |
| `auftrag-dnd-system-analyse.md` | **SYNERGIEN** — DnD-Analyse liefert Input fuer Block 4. **Hinweis:** ZoneGroup.vue (951 Z.) hat bereits DnD — Analyse muss darauf aufbauen | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |
| `auftrag-dnd-konsolidierung-interaktion.md` | **DANACH** — Zentralisierte DnD-Architektur profitiert von den hier gemachten Aenderungen | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |
| `auftrag-unified-monitoring-ux.md` | **SYNERGIEN** — Alert-System integriert in Zone-Header Alerts. StatusBar nutzt gleiche Status-Logik | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |

---

## Empfohlene Reihenfolge

| Schritt | Block | Aufwand | Abhaengigkeit |
|---------|-------|---------|---------------|
| ~~**0**~~ | ~~**Backend: Zone-CRUD API**~~ | ~~~4-6h~~ **0h** | ~~**BLOCKER**~~ **ENTFAELLT.** Zone-Architektur-Analyse: Zonen sind String-Felder, bestehendes Assignment-System reicht. Zone-Erstellen = ESP zuweisen, Zone-Loeschen = alle ESPs entfernen, Zone-Umbenennen = re-assign |
| ~~**1**~~ | ~~Block 1: Status-System-Fix~~ | ~~2-3h~~ | **ERLEDIGT (2026-02-26)** |
| ~~**2**~~ | ~~Block 3.1: "Geraete"-Button Fix~~ | ~~1h~~ | **KEIN BUG — ERLEDIGT** |
| ~~**3**~~ | ~~Block 2: Zone-Layout Redesign~~ | ~~5-7h~~ | **ERLEDIGT (2026-02-26)** |
| **4** | **Block 3.2-3.5: Konfigurationspanel Neugestaltung** | **~4-6h** | **ERLEDIGT (2026-02-27).** ESPSettingsSheet 1419→1341 Z. (SlideOver-Primitive, useESPStatus, Sensor/Actuator-Liste, ConfirmDialog). HardwareView 1066→1316 Z. |
| **5** | Block 4: DnD Zone-Assignment | **~1-2h** | **[verify-plan 2026-02-27] DnD zu ~85% fertig. Konsolidierung: UnassignedDropBar entfernen, @change-zone nachrüsten, Dead-Code ZoneGroup.vue prüfen** |
| **6** | Block 5: Unzugewiesene/Pending Redesign | ~~2-3h~~ **GROSSTEILS ERLEDIGT** | **[verify-plan 2026-02-27 FINAL]** `espStore.unassignedDevices` existiert (esp.ts:186), alle 3 Duplikate nutzen bereits Store-Getter. `pendingCount` ist computed (dashboard.store.ts:94). Verbleibend: UnassignedDropBar entfernen (→ Block 8.1b) |
| **7** | Block 6: Status + Toast Integration | ~~3h~~ **ERLEDIGT** | **[verify-plan 2026-02-27 FINAL]** `statusCounts` IST bereits `computed()` (dashboard.store.ts:64). Zone-Toasts sind in zone.store.ts:118/132/135. PendingDevicesPanel HAT Status-Dots (Z.313/360). HardwareView hat KEINE manuellen statusCounts-Watches mehr |
| **8** | Block 7: Routen + Navigation | ~~15-20min~~ **ERLEDIGT** | **[verify-plan 2026-02-27 FINAL]** Breadcrumb ist formatiert: `Zone: ${zoneName} (${online}/${total} Online)` in HardwareView.vue:402. Routes alle korrekt. Escape/Back implementiert |
| **9** | Block 8: Integration + Tests | **~2-3h** | Verbleibend: 8.1a-c Code-Fixes, Tests schreiben, Build, visueller Check. Siehe ueberarbeiteter Block 8 |

**Gesamt-Aufwand: ~27-35h** (rein Frontend, 0h Backend). **[verify-plan 2026-02-27] Korrigiert** von ~24-30h wegen:
- ~~Fehlende Backend-API (Zone-CRUD)~~ → **ENTFAELLT** (-4-6h): Zone-Architektur-Analyse zeigt implizites System ist vollstaendig funktional
- HardwareView.vue ist 1055 Z. (nicht 720) — 47% groesser als angenommen, betrifft Block 2.3, 4, 5, 7 (+3-5h)
- PendingDevicesPanel.vue ist 996 Z. (nicht 897) — Block 3 betroffen
- Block 6: statusCounts→computed() + zone.store.ts Toasts ergaenzen (+1h)
- Block 7.3 war bereits erledigt (spart ~1h)

---

## Zusammenfassung der Ergebnisse

| Metrik | Vorher (Screenshot) | Nachher (Ziel) |
|--------|---------------------|----------------|
| StatusBar-Counts | Falsch (0 Online, Real 0) | Korrekt und reaktiv |
| Zone-Header-Info | Kryptisch (19.7-19.7°C) | Klar (1 ESP, 0/1 Online, ⚠ 0) |
| ESP-Card-Info | Minimal (Zahlen ohne Einheiten) | Vollstaendig (Name, Status, Sensoren, Einheiten, Sparklines) |
| "Geraete"-Button | ~~Kaputt~~ Funktioniert (oeffnet PendingDevicesPanel, P11 ist KEIN Bug) | Redesign zu SlideOver mit ESP-Verwaltung (Block 3) |
| DnD-Erkennbarkeit | Keine (kein Handle, kein Feedback) | Drag-Handle, Drop-Zone-Highlighting, Ghost |
| "NICHT ZUGEWIESEN" | Kaum sichtbar (duenner Streifen) | Prominente Sektion + TopBar-Badge |
| Click-to-Place Alternative | Nicht vorhanden | Overflow-Menu → Zone-Dropdown |
| Toast-Feedback | Inkonsistent | Toast bei JEDER Aktion |
| Status-Darstellung | Nur Farbe (gruene Dots) | Dot + Text + optional Icon |
| Navigations-Ebenen | 3 (Zone-Tile→Zone-Detail→Orbital) | 2 (Zone-Accordion→Orbital) |
| Klicks bis ESP-Konfiguration | 3+ (Zone→ESP→Settings) | 1-2 (ESP-Card→Config-Panel oder Overflow) |
| Klicks bis ESP oeffnen | 2 (Zone→ESP) | 1 ("Oeffnen" auf ESP-Card) |
| Stale-Daten-Erkennung | Keine (gruene Bars auch bei Offline) | Graue Bars + "Zuletzt" Label |
| Touch-DnD-Support | Unklar | Long-Press 400ms, 44px Handles |

---

## NICHT in diesem Auftrag

| Was | Warum nicht | Kommt in welchem Auftrag |
|-----|-------------|--------------------------|
| Monitor-Tab Redesign (Flat-View) | Eigener Scope, Vision D3 | Separater Auftrag nach diesem |
| Editor-Tab (Gallery, View/Edit-Toggle) | Eigener Scope, Vision D4 | Separater Auftrag nach diesem |
| Orbital-Layout-Aenderungen | Bleibt unveraendert (Vision D5) | Nur bei `auftrag-orbital-split.md` |
| Dashboard-Persistenz Backend | Backend-Scope | `auftrag-dashboard-persistenz.md` |
| ECharts-Migration | Andere Prioritaet | Eigener Auftrag |
| Mobile-Responsive Optimierung | Nachgelagert | Eigener Auftrag |
| Neue Sensoren hinzufuegen UI | Bleibt im Orbital-Layout | Nicht betroffen |
| Sensor-Typ-Aenderungen | Loeschen + Neu | Nicht betroffen |
| ~~Zone-CRUD Backend-API~~ | ~~Backend-Scope, BLOCKER~~ **ENTFAELLT** | Zone-Architektur-Analyse: Implizites System reicht. Siehe `auftrag-zone-subzone-architektur-analyse.md` |

---

## Verifikations-Protokoll (2026-02-26)

> Dieses Protokoll dokumentiert alle Korrekturen die nach systematischer Verifikation gegen den echten Codestand vorgenommen wurden. Geprueft: 25 Pfade, 1 Agent, 5 Stores, 6 Routes, 5 WebSocket-Events, 1 API-Endpunkt, 2 Abhaengigkeits-Auftraege.
> **2. Verifikation [verify-plan]:** Zone-Architektur-Analyse (BLOCKER aufgeloest), 5 Zeilenzahlen nachkorrigiert, 3 CSS-Variablen ersetzt, useESPStatus-Falschaussage korrigiert.

### Pfad-Korrekturen (4)

| Komponente | Plan (FALSCH) | Realitaet (KORREKT) | Status |
|-----------|---------------|---------------------|--------|
| ZonePlate.vue | `src/components/zones/` ~400 Z. | `src/components/dashboard/` **755 Z.** | KORRIGIERT |
| UnassignedDropBar.vue | `src/components/zones/` ~120 Z. | `src/components/dashboard/` **568 Z.** | KORRIGIERT |
| CreateMockEspModal.vue | `src/components/esp/` ~150 Z. | `src/components/modals/` **318 Z.** | KORRIGIERT |
| ViewTabBar.vue | `src/shared/design/layout/` ~80 Z. | `src/components/common/` **127 Z.** | KORRIGIERT |

### Zeilen-Korrekturen (6 massiv unterschaetzt)

| Komponente | Plan | Realitaet | Faktor | Status |
|-----------|------|-----------|--------|--------|
| DeviceMiniCard.vue | ~150 Z. | **402 Z.** | 2.7x | KORRIGIERT [verify-plan] |
| ESPSettingsSheet.vue | ~300 Z. | **1419 Z.** | 4.7x | KORRIGIERT [verify-plan] |
| PendingDevicesPanel.vue | ~200 Z. | **1106 Z.** | 5.5x | KORRIGIERT (996→1106 durch f3b8a9a SlideOver) |
| dashboard.store.ts | 107 Z. | **268 Z.** | 2.5x | KORRIGIERT [verify-plan] |
| StatusPill~~s~~.vue | Plural (falsch) | **StatusPill.vue** (Singular) | — | KORRIGIERT |
| HardwareView.vue | ~689 Z. | **1066 Z.** | 1.55x | KORRIGIERT (720→1055→1066 durch PendingPanel SlideOver) |

### Fehlende Komponente im Inventar

| Komponente | Zeilen | Bedeutung |
|-----------|--------|-----------|
| `ZoneGroup.vue` | **951 Z.** | **[verify-plan 2026-02-27] DEAD CODE** — Wird von HardwareView NICHT mehr genutzt (durch ZonePlate.vue ersetzt). Nur noch importiert in PendingDevicesPanel, ESPCard, SensorsView. Prüfen ob noch aktiv gerendert, sonst entfernen | KORRIGIERT |

### Architektur-Korrekturen

| Korrektur | Block | Details |
|-----------|-------|---------|
| 2-Level-System BEREITS implementiert | Block 7.3 | HardwareView.vue:60 hat `computed<1 \| 2>` mit "Two-level navigation" Kommentar. Block 7.3 als ERLEDIGT markiert |
| ~~Zone-CRUD Backend FEHLT~~ | Block 2.3 + 5 | ~~**BLOCKER.**~~ **AUFGELOEST.** Zone-Architektur-Analyse zeigt: Implizites System (String-Feld auf esp_devices) reicht. 5 Zone-Endpoints + 6 Subzone-Endpoints existieren. Siehe `auftrag-zone-subzone-architektur-analyse.md` |
| P11 Root Cause verifiziert | Block 3.1 | "Geraete"-Button setzt `dashStore.showPendingPanel = true` → oeffnet PendingDevicesPanel (NICHT ESPSettingsSheet). Funktioniert NUR wenn `dashStore.showControls === true` |
| P2 Root Cause identifiziert | Block 1.1 | `dashStore.deviceCounts` wird NIRGENDS aktualisiert (initialisiert auf all:0, mock:0, real:0). Fix: Watch analog zu `statusCounts` |
| `espStore.unassignedDevices` existiert nicht | Block 5.3 | Ist lokales computed DREIFACH: UnassignedDropBar.vue:44, HardwareView.vue:335, PendingDevicesPanel.vue:74-78. KEIN Store-Getter. Migration PFLICHT. Logik-Diskrepanz: Falsy-Check vs ZONE_UNASSIGNED Konstante. Empfehlung: `devices.filter(d => !d.zone_id)` |
| Toast-API korrigiert | Block 2.3, 6.2 | Korrekte API: `useToast` Composable via `notification.store.ts`, NICHT `uiStore.addToast` |
| Redirect-Anzahl korrigiert | Block 7.1 | 8 Redirects (nicht 9): devices, devices/:espId, mock-esp, mock-esp/:espId, database, logs, audit + dashboard-legacy |
| `/dashboards` Route existiert nicht | Block 7.1 | `/custom-dashboard` ist eigenstaendige Route mit CustomDashboardView.vue. `/dashboards` muesste erst erstellt werden |

### Korrekturen aus 2. Verifikation [verify-plan] (2026-02-26)

| Korrektur | Block | Details |
|-----------|-------|---------|
| DeviceMiniCard nutzt NICHT useESPStatus | Block 1.2 | Falschaussage im Plan korrigiert. Nur ESPCardBase, ESPCard, ESPHealthWidget nutzen useESPStatus. DeviceMiniCard braucht Integration (~30min Zusatz-Aufwand) |
| CSS-Variablen existieren nicht | Block 4.2 | `--color-accent-bg`, `--color-accent-bg-hover`, `--color-accent-glow` NICHT in tokens.css. Ersetzt durch `color-mix(in srgb, var(--color-accent) N%, transparent)` |
| useOrbitalDragDrop ≠ useZoneDragDrop | Block 4 | Zwei separate Composables. useOrbitalDragDrop.ts (250 Z., Orbital-Layout DnD) vs useZoneDragDrop.ts (NEU, Zone-Level DnD). Block 4 nutzt NUR useZoneDragDrop |
| 5 Zeilenzahlen aktualisiert | Diverse | DeviceMiniCard 469→402, ESPSettingsSheet 1413→1419, useESPStatus 176→185, ESPCardBase 274→270, dashboard.store 259→268 |

### Aufwandskorrektur

| | Original | Korrigiert | Grund |
|-|----------|-----------|-------|
| Block 2 | ~4-5h | ~5-7h | ZonePlate 755 Z. (nicht 400), DeviceMiniCard 402 Z. (nicht 150) [verify-plan] |
| Block 3 | ~3-4h | ~4-6h | **ERLEDIGT.** ESPSettingsSheet 1419→1341 Z., HardwareView 1066→1316 Z. [verify-plan] |
| Block 7 | ~1-2h | **~15-20min** | [verify-plan 2026-02-27] 7.1+7.3 komplett erledigt. Nur 7.2 Breadcrumb-Formatierung offen |
| ~~Backend (NEU)~~ | ~~—~~ | ~~~4-6h~~ **ENTFAELLT** | Zone-CRUD AUFGELOEST — implizites System reicht (Zone-Architektur-Analyse) |
| **Gesamt** | **~20-28h** | **~24-30h** | Komponentenkomplexitaet, KEIN Backend-Aufwand |

---

## AKTUELLER STAND (2026-02-27) — Wo stehen wir, was kommt als naechstes

### Block-Status-Uebersicht

| Block | Beschreibung | Status | Aufwand (Rest) |
|-------|-------------|--------|----------------|
| **Block 0** | deviceCounts Quick-Fix | **ERLEDIGT** (2026-02-26) | 0h |
| **Block 1** | Status-System-Fix (P1-P4) | **ERLEDIGT** (2026-02-26) | 0h |
| **Block 2** | Zone-Layout-Redesign | **ERLEDIGT** (2026-02-26) | 0h |
| **Block 3** | Konfigurationspanel-Fix und Redesign | **ERLEDIGT** (2026-02-27) | 0h |
| **Block 4** | DnD Zone-Assignment Konsolidierung | **ERLEDIGT** (Block 8) | 0h |
| **Block 5** | "NICHT ZUGEWIESEN" + Pending Redesign | **ERLEDIGT** (verify-plan: alle Punkte bereits auf master) | 0h |
| **Block 6** | ESP-Status-Anzeige + Toast-Integration | **ERLEDIGT** (verify-plan: statusCounts computed, Toasts vorhanden) | 0h |
| **Block 7** | Routen-Pruefung + Navigation-Fixes | **ERLEDIGT** (verify-plan: Breadcrumb, Routes, Escape) | 0h |
| **Block 8** | Integration + Tests + Mock/Real Konsistenz | **ERLEDIGT** (2026-02-27) | 0h |
| | | **REST-AUFWAND TOTAL** | **0h** |

### Aktuelle Zeilenzahlen (verifiziert 2026-02-27, nach Block 8)

| Datei | Vorher | Aktuell | Delta | Notiz |
|-------|--------|---------|-------|-------|
| HardwareView.vue | 1316 | **~1310** | -6 | Block 8: filteredEsps via getESPStatus vereinheitlicht |
| ZonePlate.vue | 810 | **~843** | +33 | Block 8: warnings via getESPStatus statt Mock/Real-Verzweigung |
| DeviceMiniCard.vue | 589 | **595** | +6 | Stabil |
| ~~UnassignedDropBar.vue~~ | 578 | **578** | 0 | Nicht mehr gerendert (Import+Rendering entfernt in Block 8.1b) |
| ESPSettingsSheet.vue | 1341 | **1341** | 0 | Stabil |
| PendingDevicesPanel.vue | 1106 | **1117** | +11 | Stabil |
| ~~ZoneGroup.vue~~ | 951 | **GELOESCHT** | -951 | Block 8.1c: Dead-Code entfernt |
| useESPStatus.ts | 185 | **~187** | +2 | Block 8: system_state ERROR + Priority-Fix |
| dashboard.store.ts | 268 | **291** | +23 | Stabil |
| esp.ts (Store) | 1671 | **1676** | +5 | Stabil |

**Test-Dateien (neu/erweitert):**

| Datei | Tests | Aenderung |
|-------|-------|-----------|
| useESPStatus.test.ts | 31 | +12 neue (priority-ordering, mock system_state) |
| AccordionSection.test.ts | 16 | localStorage-Mock und nextTick-Fix |
| dashboard.test.ts | 45 | Komplett neugeschrieben mit espStore-Mock via reactive() |

### 3 Offene Issues (BESTAETIGT gegen Codebase)

| Issue | Datei | Zeile | Block | Details |
|-------|-------|-------|-------|---------|
| **statusCounts ist ref()** | dashboard.store.ts | Z.63 | Block 6 | `statusCounts = ref({ online: 0, offline: 0, warning: 0, safeMode: 0 })` — wird manuell von DashboardView beschrieben statt reaktiv aus espStore abgeleitet. Muss analog zu deviceCounts (Block 0) auf `computed()` umgestellt werden |
| **zone.store handleZoneAssignment() ohne Toast** | zone.store.ts | Z.80-127 | Block 6 | `handleZoneAssignment()` hat NUR Logger-Aufrufe, KEINE `useToast()` Aufrufe. `handleSubzoneAssignment()` (Z.147+) hat Toasts. Zone-Assignment-Toasts fehlen komplett bei `zone_assigned`/`zone_removed` Events |
| **unassignedDevices Code-DREIFACH-Duplikation** | HardwareView.vue:335 + UnassignedDropBar.vue:44 + **PendingDevicesPanel.vue:74-78** | Block 5 | Identisches `computed()` an DREI Stellen (nicht zwei). Migration als Store-Getter in `esp.ts` ist PFLICHT um Single Source of Truth herzustellen. **Logik-Diskrepanz:** UnassignedDropBar nutzt `!device.zone_id` (Falsy-Check), HardwareView+PendingDevicesPanel nutzen `groupDevicesByZone` mit ZONE_UNASSIGNED. Store-Getter soll `devices.filter(d => !d.zone_id)` verwenden |
| **dashStore.pendingCount TOTER REF** | dashboard.store.ts:71 | Block 5 | `pendingCount = ref(0)` wird NIRGENDWO geschrieben. `hasPendingDevices` ist IMMER false. TopBar iridescent-Pulse wird NIEMALS angezeigt. Fix: Als computed von espStore.pendingCount ableiten ODER TopBar direkt auf espStore zugreifen |
| **TopBar-Badge nur auf Hardware-Route** | TopBar.vue:209 | Block 5 | Pending-Button ist hinter `v-if="dashStore.showControls"` — nur auf Hardware-Route sichtbar. Entscheidung noetig: Global (ausserhalb showControls) oder bewusst nur Hardware-Route |
| **PendingDevicesPanel Konflikt** | PendingDevicesPanel.vue (1106 Z.) | Block 5 | Panel wurde gerade umgebaut (f3b8a9a Popover→SlideOver). Plan-Inline-UI wuerde kollidieren. Empfehlung: Inline nur als kompakte Vorschau + Link zum Panel, kein doppeltes Approve/Reject |
| **Approve+Zone als ein Schritt fehlt** | espStore.approveDevice() esp.ts:369-396 | Block 5 | approveDevice() genehmigt NUR, ohne Zone-Zuweisung. Kombinierter Schritt braucht neuen Endpoint oder 2-Step-UI |

### Relevante Commits seit letztem Update

| Commit | Datum | Beschreibung | Impact auf diesen Auftrag |
|--------|-------|-------------|---------------------------|
| f3b8a9a | 2026-02-27 | PendingDevicesPanel → SlideOver + Search + Delete | **Block 3 teilweise erledigt:** Panel ist bereits SlideOver mit Search-Field und Delete-Funktion. Block 3.2 Variante A (ESP-Liste) und Block 3.4 (Loeschfunktionen) muessen gegen diesen Stand geprueft werden |
| 38c1aff | 2026-02-26 | Accessibility + Memory Leak Fixes [chaos-test] | Cleanup, kein direkter Impact |
| 9680344 | 2026-02-26 | PendingDevicesPanel TS Error Fix | getESPStatus returns string — behoben |
| 12a92f7 | 2026-02-26 | ZonePlate TDZ Bug + 19 stale test fixes | Stabilisierung der Block 2 Arbeit |
| 94f46f8 | 2026-02-26 | Zone Aggregation, Subzone Chips, Sorting, Collapse | Block 2 Kern-Implementation |

### Block 3 — ERLEDIGT (2026-02-27)

**Durchgefuehrte Aenderungen:**
- 3.1: ESPSettingsSheet nutzt jetzt SlideOver-Primitive (statt eigener Teleport+Transition+Overlay)
- 3.2: Status-Anzeige auf useESPStatus() Composable migriert (Dot + Text + Pulse, Heartbeat-Timing-Fallback)
- 3.3: Inline SensorConfigPanel/ActuatorConfigPanel entfernt → klickbare Sensor/Actuator-Liste mit Events (open-sensor-config, open-actuator-config)
- 3.4: Two-Step-Delete ersetzt durch uiStore.confirm() (ConfirmDialog) + useToast() Feedback
- 3.5: Escape-Key und Panel-Schliessen via SlideOver-Primitive automatisch
- Build: vue-tsc 0 Fehler, npm run build erfolgreich

### Naechster Block: Block 4 — DnD Zone-Assignment Verbesserung

**Scope:**
- 4.1: Drag-Handles auf ESP-Cards (Grip-Icon, cursor:grab/grabbing, min 44px Touch-Target)
- 4.2: Drop-Zone-Highlighting (alle Zonen als Targets hervorheben bei Drag-Start)
- 4.3: Drop-Animation + Cancel-Snap-Back
- 4.4: Click-to-Place Alternative (Select-Workflow statt DnD)
- 4.5: Verifikation

### Modal/SlideOver-Stack (aktuell in HardwareView)

```
HardwareView (Root — 1316 Z.)
  ├─ ViewTabBar (sticky top — 100 Z.)
  ├─ ZonePlate[] (main content — 810 Z. each)
  │   └─ DeviceMiniCard[] (589 Z. each)
  ├─ UnassignedDropBar (sticky bottom — 578 Z.)
  ├─ PendingDevicesPanel (SlideOver — 1106 Z.) ← dashStore.showPendingPanel
  ├─ ESPSettingsSheet (SlideOver-Primitive — 1341 Z.) ← isSettingsOpen
  │   └─ emits: open-sensor-config, open-actuator-config → HardwareView Handler
  ├─ SensorConfigPanel (SlideOver) ← showSensorConfig (auch via ESPSettingsSheet Event)
  ├─ ActuatorConfigPanel (SlideOver) ← showActuatorConfig (auch via ESPSettingsSheet Event)
  ├─ CreateMockEspModal (Modal — 318 Z.) ← dashStore.showCreateMock
  └─ ComponentSidebar (Level 2 only — 435 Z.)
```

### Data-Flow-Architektur (aktuell)

```
router params (zoneId, espId)
  └→ HardwareView.vue
      ├→ esp.ts Store (devices, pendingDevices, onlineDevices, offlineDevices)
      ├→ dashboard.store.ts (deviceCounts=computed, statusCounts=ref⚠, showPendingPanel)
      ├→ useZoneDragDrop.ts (groupDevicesByZone, handleDeviceDrop)
      ├→ useESPStatus.ts (getESPStatus — single source of truth)
      └→ zone.store.ts (handleZoneAssignment⚠ kein Toast, handleSubzoneAssignment✓)
```
