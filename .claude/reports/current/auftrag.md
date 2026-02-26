# Auftrag: Uebersicht-Tab Komplett-Redesign — Zonen, ESP-Cards, DnD, Konfiguration

> **Datum:** 2026-02-26
> **Korrigiert:** 2026-02-26 (Verifikation: 25 Pfade, 4 Pfad-Korrekturen, 6 Zeilen-Korrekturen, 1 Backend-Blocker, 1 Block gestrichen)
> **Aktualisiert:** 2026-02-26 (IST-Analyse: P11 ist KEIN Bug, deviceCounts Root Cause bestaetigt, ESPCardBase+useESPStatus existieren, Dead Code bereits geloescht)
> **Aktualisiert:** 2026-02-26 (Block 0 deviceCounts ERLEDIGT, Voraussetzung Block A ERLEDIGT)
> **Aktualisiert:** 2026-02-26 (Alle Voraussetzungen ERLEDIGT: Block A+B+C CSS/Settings + Orbital-Split. NUR Zone-CRUD Backend-API BLOCKER verbleibt)
> **Aktualisiert:** 2026-02-26 (Zone-Architektur-Analyse: "Zone-CRUD BLOCKER" ist PHANTOM-BLOCKER. Zonen sind String-Felder auf esp_devices, implizites System ist vollstaendig funktional. 0h Backend-Arbeit noetig. Siehe `auftrag-zone-subzone-architektur-analyse.md`)
> **Aktualisiert:** 2026-02-26 (Block 1 ERLEDIGT: Status-System-Fix — P1 Online/Offline Counts, P2 deviceCounts verifiziert, P3/P4 Stale-Visualisierung)
> **Aktualisiert:** 2026-02-26 (Block 2 ERLEDIGT: Zone-Layout-Redesign — ZonePlate 755→622 Z., DeviceMiniCard 447→645 Z., Zone-CRUD in HardwareView, AccordionSection modelValue+#header Slot)
> **Prioritaet:** P1 (Kernfunktionalitaet)
> **Aufwand:** ~~~30-40 Stunden (8 Bloecke)~~ **~24-30 Stunden** (8 Bloecke, Backend-BLOCKER entfaellt: -4-6h)
> **Voraussetzung:** `auftrag-hardware-tab-css-settings-ux.md` Block A (CSS-Extraktion) MUSS erledigt sein — **ERLEDIGT (2026-02-26)**
> **Voraussetzung:** ~~Zone-CRUD Backend-API (POST/PUT/DELETE /v1/zones) MUSS implementiert sein~~ — **KEIN BLOCKER:** Zone-Architektur-Analyse zeigt: Zonen sind String-Felder auf `esp_devices`. Bestehende Assignment-API (assign/remove/info/devices/unassigned) reicht vollstaendig. Siehe `auftrag-zone-subzone-architektur-analyse.md`
> **Abhaengigkeit:** `auftrag-dashboard-umbenennung-erstanalyse.md` Block D (Vision: 2-Ebenen-Architektur) ist die verbindliche Grundlage
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
| `HardwareView.vue` | `src/views/HardwareView.vue` | **975** | Haupt-View, rendert Level 1-2 basierend auf Route (BEREITS 2-Level-System). [verify-plan 2026-02-26: 720→975 Z., +255 Z. durch Block 2 Arbeit] |
| `ZonePlate.vue` | `src/components/dashboard/ZonePlate.vue` | **622** | Zone-Accordion mit AccordionSection + custom #header. **Block 2:** 755→622 Z. (ZoneMetrics, Sensor-Preview, Meta-Pills entfernt, Inline-Rename + Overflow-Menu hinzugefuegt) |
| `DeviceMiniCard.vue` | `src/components/dashboard/DeviceMiniCard.vue` | **645** | ESP-Card mit Status-Zeile, Sensor-Icons, Spark-Bars, Action-Row. **Block 1+2:** 402→645 Z. (Stale-Visualisierung + Sensor-Detail + Overflow-Menu hinzugefuegt) |
| `UnassignedDropBar.vue` | `src/components/dashboard/UnassignedDropBar.vue` | **568** | "NICHT ZUGEWIESEN" Bar am unteren Rand. **KORREKTUR:** War faelschlich unter `zones/` mit ~120 Z. angegeben — tatsaechlich unter `dashboard/`, 4.7x groesser |
| `StatusPill.vue` (TopBar) | `src/components/dashboard/StatusPill.vue` | — | "0 Online • 1 Offline • Alle 0 • Mock 0 • Real 0". **KORREKTUR:** Name ist Singular (StatusPill), nicht Plural (StatusPills) |
| `ViewTabBar.vue` | `src/components/common/ViewTabBar.vue` | **127** | Tab-Leiste [Uebersicht] [Monitor] [Editor]. **KORREKTUR:** War faelschlich unter `shared/design/layout/` mit ~80 Z. angegeben |

### Sekundaer-Komponenten (nicht sichtbar aber direkt betroffen)

| Komponente | Pfad | Zeilen | Rolle |
|-----------|------|--------|-------|
| `ZoneDetailView.vue` | `src/components/zones/ZoneDetailView.vue` | 347 | Level 2 (Zone-Detail mit ESP-Liste) — wird ENTFALLEN nach D2-Vision |
| `ZoneGroup.vue` | `src/components/zones/ZoneGroup.vue` | **951** | **FEHLTE IM INVENTAR.** Implementiert bereits VueDraggable-DnD, Zone-Header-Rendering und Device-Gruppierung. Wird von ZonePlate genutzt. Block 4 MUSS darauf aufbauen |
| `ESPSettingsSheet.vue` | `src/components/esp/ESPSettingsSheet.vue` | **1419** | Das Modal/Sheet das sich bei "Geraete"-Klick oeffnen SOLLTE — P11. **KORREKTUR:** War mit ~300 Z. angegeben — tatsaechlich 4.7x groesser. Block 3 Aufwand betroffen. [verify-plan 1419 Z.] |
| `PendingDevicesPanel.vue` | `src/components/esp/PendingDevicesPanel.vue` | **996** | Panel fuer discovered-but-not-approved ESPs. Wird von TopBar-Button `dashStore.showPendingPanel` gesteuert. **KORREKTUR:** War mit ~200 Z. angegeben — tatsaechlich 5x groesser. [verify-plan 2026-02-26: 897→996 Z., +99 Z. seit letzter Zaehlung] |
| `ComponentSidebar.vue` | `src/components/dashboard/ComponentSidebar.vue` | ~350 | Sidebar fuer Sensor/Aktor-DnD im Orbital-Layout |
| `CreateMockEspModal.vue` | `src/components/modals/CreateMockEspModal.vue` | **318** | Modal hinter "+ Mock" Button. **KORREKTUR:** War faelschlich unter `esp/` mit ~150 Z. angegeben — tatsaechlich unter `modals/`, doppelte Groesse |

### Stores (State-Management)

| Store | Pfad | Relevanz |
|-------|------|----------|
| `useEspStore` | `src/stores/esp.ts` | **1671 Z.** — Zentraler Device-State, WebSocket-Dispatcher, Pending-Devices. **Hinweis:** `unassignedDevices` ist KEIN Store-Getter — lokales computed in UnassignedDropBar.vue:45 UND HardwareView.vue:255. [verify-plan 2026-02-26: 1668→1671 Z.] |
| `useDragStateStore` | `src/shared/stores/dragState.store.ts` | 447 Z. — DnD-State (isDragging, Payloads, Drop-Targets) |
| `useDashboardStore` | `src/shared/stores/dashboard.store.ts` | **268 Z.** — Filter-State (statusCounts, deviceCounts), showControls, showPendingPanel (Z.86), Breadcrumb. **KORREKTUR:** War mit 107 Z. angegeben — tatsaechlich 2.5x groesser. **ACHTUNG:** `deviceCounts` ~~wird auf `{ all: 0, mock: 0, real: 0 }` initialisiert aber NIRGENDS aktualisiert~~ ist jetzt computed() (Block 0 ERLEDIGT). [verify-plan 268 Z.] |
| `useUiStore` | `src/shared/stores/ui.store.ts` | 235 Z. — Sidebar, CommandPalette, ContextMenu |

### Composables (Logik)

| Composable | Pfad | Relevanz |
|-----------|------|----------|
| `useZoneDragDrop` | `src/composables/useZoneDragDrop.ts` | Zone-Assignment DnD-Logik (Zone-Level). **[verify-plan] Achtung:** `useOrbitalDragDrop.ts` existiert separat fuer Orbital-Layout-DnD. Block 4 nutzt NUR `useZoneDragDrop` |
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
> - **2.1b ZonePlate.vue refactored (755→622 Z.):** Nutzt AccordionSection mit modelValue + custom `#header` Slot. Schlanker Header: Zone-Name + Pencil-Edit + "X ESPs · X/Y Online" + Alert-Badge + Overflow-Menu (⋮). ENTFERNT: ZoneMetrics, Sensor-Preview, Meta-Pills ("3S"/"1A"), collapsed-summary, cross-esp badge. Inline-Rename (Pencil→Input, Enter/Escape/Blur). Overflow: Umbenennen + Loeschen (ConfirmDialog). Neue Emits: `rename`, `delete`, `device-delete`
> - **2.2 DeviceMiniCard.vue redesigned (447→645 Z.):** Wickelt ESPCardBase variant="mini" mit Custom-Slots. Status-Zeile: Dot + Text + "vor X Min." + Sensor-Count. Bis 4 Sensor-Zeilen: Typ-Icon + Name + Wert + Einheit + Spark-Bar. "+X weitere" bei >4. Action-Row: "Oeffnen" + Overflow (Konfigurieren, Zone aendern, Loeschen). Grip-Handle via CSS Pseudo-Element auf `.esp-drag-handle`. Stale-Styles beibehalten
> - **2.3 Zone-Verwaltung in HardwareView.vue:** <5 Zonen → alle expanded, sonst collapsed. "Zone erstellen" Button + Inline-Form. Umbenennen (loop ESPs → POST assign). Loeschen (ConfirmDialog → loop DELETE). Toast-Feedback via useToast()
> - **2.4 ZonePlate.test.ts aktualisiert:** Meta-Pills → Header-Stats
> - **Verifikation:** `vue-tsc --noEmit` 0 Fehler, `npm run build` OK (33.5s), 1345/1353 Tests (8 pre-existing, keine neuen Failures)
>
> **Commit:** `feat(overview): zone accordion layout with ESP overview cards`

### Ziel
Zonen werden als aufklappbare Accordion-Sektionen angezeigt mit ESP-Cards direkt sichtbar (Vision D2: Level 1+2 zusammenfuehren zu einer Ebene).

### 2.1: Zone-Accordion-Sektion neu gestalten

**IST-Zustand (ZonePlate.vue 755 Zeilen, in `src/components/dashboard/`):**
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

**IST-Zustand (DeviceMiniCard.vue 402 Zeilen [verify-plan] — ~2.7x groesser als angenommen, schrittweises Refactoring statt Ersetzen empfohlen):**
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

> **BLOCKER AUFGELOEST (2026-02-26):** Zone-Architektur-Analyse (`auftrag-zone-subzone-architektur-analyse.md`) zeigt: Zonen sind String-Felder auf `esp_devices`, KEINE eigenstaendigen DB-Entitaeten. Das bestehende implizite System ist **designbedingt** und **vollstaendig funktional**:
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

## Block 3: Konfigurationspanel-Fix und Redesign (P0/P1, ~4-6h)

> **KORREKTUR (Verifikation 2026-02-26):** Aufwand von ~3-4h auf ~4-6h erhoeht weil ESPSettingsSheet.vue 1419 Z. (nicht ~300) und PendingDevicesPanel.vue **996 Z.** (nicht ~200) hat. [verify-plan 2026-02-26: PendingDevicesPanel ist nochmal 99 Z. groesser als letzte Zaehlung]

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

- [ ] "Geraete"-Button in TopBar oeffnet SlideOver-Panel (NICHT Modal)
- [ ] Panel Variante A: ESP-Liste nach Zonen gruppiert, Suchfeld funktioniert
- [ ] Panel Variante B: ESP-Details mit Name, Zone-Dropdown, Sensor-Liste
- [ ] "Einstellungen" auf Sensor oeffnet SensorConfigPanel SlideOver
- [ ] Loeschen-Button oeffnet ConfirmDialog vor destruktiver Aktion
- [ ] Toast nach jeder Aktion (Erfolg + Fehler)
- [ ] Panel schliesst sich per Escape-Key und Klick auf Overlay

**Commit:** `fix(config): device panel opens correctly, ESP/sensor config redesign`

---

## Block 4: DnD Zone-Assignment Verbesserung (P1, ~3-4h)

### Ziel
DnD fuer Zone-Zuweisung mit korrektem visuellem Feedback, Click-to-Place-Alternative und Touch-Support.

### 4.0: Bestehende DnD-Infrastruktur (ZoneGroup.vue)

> **KORREKTUR (Verifikation 2026-02-26):** `ZoneGroup.vue` (951 Z.) in `src/components/zones/` implementiert BEREITS VueDraggable-DnD mit Zone-Header-Rendering und Device-Gruppierung. Diese Komponente wird von ZonePlate genutzt. **Block 4 muss darauf aufbauen, nicht von Null starten.** Vor Beginn: ZoneGroup.vue komplett lesen und bestehende DnD-Logik identifizieren.

### 4.1: Drag-Handle auf ESP-Cards

**ESP-Cards muessen als draggable erkennbar sein:**
- Drag-Handle-Icon (⠿ oder ⋮⋮) links auf der ESP-Card
- `cursor: grab` auf dem Handle-Bereich (nicht auf der ganzen Card — Klick muss weiterhin fuer Navigation funktionieren)
- `cursor: grabbing` waehrend Drag
- Handle-Groesse: Min. 44x44px (Touch-Target nach Parhi et al. 2006)

**Implementation mit bestehendem VueDraggable:**
```vue
<VueDraggable
  v-model="zoneDevices"
  :group="{ name: 'devices', pull: 'clone', put: true }"
  handle=".drag-handle"
  :animation="200"
  ghost-class="esp-card-ghost"
  chosen-class="esp-card-chosen"
  drag-class="esp-card-dragging"
>
  <ESPOverviewCard
    v-for="device in zoneDevices"
    :key="device.id"
    :esp="device"
  >
    <template #drag-handle>
      <div class="drag-handle">⠿</div>
    </template>
  </ESPOverviewCard>
</VueDraggable>
```

### 4.2: Drop-Zone-Highlighting

**Beim Drag-Start muessen ALLE Zonen als Drop-Targets hervorgehoben werden:**

```css
/* [verify-plan] Nur --color-accent, --color-accent-bright, --color-accent-dim
   existieren in tokens.css. --color-accent-bg/hover/glow NICHT vorhanden.
   Loesung: color-mix() fuer abgeleitete Farben. */

/* Zone-Accordion im Normal-Zustand */
.zone-section { border: 2px solid transparent; }

/* Zone als Drop-Target waehrend Drag */
.zone-section--drop-target {
  border: 2px dashed var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 8%, transparent);
  transition: border 100ms ease-in, background 100ms ease-in;
}

/* Zone als aktives Drop-Ziel (Hover waehrend Drag) */
.zone-section--drop-active {
  border: 2px solid var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 15%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--color-accent) 30%, transparent);
}
```

**State-Management via dragStateStore:**
```typescript
// Beim Drag-Start: Alle Zonen als Drop-Targets markieren
dragStateStore.startDrag({ type: 'device', payload: device })

// Jede Zone-Section lauscht auf dragStateStore.isDragging:
const isDropTarget = computed(() =>
  dragStateStore.isDragging && dragStateStore.dragPayload?.type === 'device'
)
```

### 4.3: "NICHT ZUGEWIESEN" Bereich Redesign (P10, P16)

**IST-Zustand:** `UnassignedDropBar.vue` (568 Z., `src/components/dashboard/`) — Duenner Streifen am unteren Rand mit Email-Icon. Deutlich komplexer als angenommen (4.7x der geschaetzten Zeilen), enthaelt bereits DnD-Drop-Logik.

**SOLL-Zustand:**
```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◻ Nicht zugewiesen  (2 ESPs)                                    [▲/▼] │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌──────────────────┐  ┌──────────────────┐                           │
│  │ ESP_NEW_01       │  │ ESP_NEW_02       │                           │
│  │ ○ Pending        │  │ ● Online         │                           │
│  │ [Genehmigen]     │  │ [In Zone ziehen] │                           │
│  └──────────────────┘  └──────────────────┘                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Aenderungen:**
- **Prominenter Counter in TopBar:** Neben dem "Geraete"-Button ein Badge mit Anzahl unzugewiesener/pending ESPs: `[Geraete (2)]`
- **Eigene Sektion** statt duenner Bar — auf gleicher Hierarchie-Ebene wie Zonen (AccordionSection)
- **Default offen** wenn Geraete vorhanden, Default geschlossen wenn leer
- **Drop-Target:** Gleiche Hervorhebung wie Zonen beim DnD — ESP hierher droppen = aus Zone entfernen
- **Pending-ESPs:** Mit "Genehmigen"/"Ablehnen" Buttons (Discovery-Workflow)
- **Unzugewiesene ESPs:** Mit DnD-Handle zum Ziehen in Zonen ODER "Zone zuweisen" Button mit Dropdown

### 4.4: Click-to-Place als DnD-Alternative

**Forschung zeigt: DnD hat doppelte Fehlerrate (8.2% vs 4.1%).** Click-to-Place als Alternative:

1. Klick auf ESP-Card Overflow-Menu (⋮)
2. "Zone aendern..." auswaehlen
3. Dropdown mit allen verfuegbaren Zonen + "Keine Zone (Unzugewiesen)"
4. Auswahl → API-Call → Toast "ESP_472204 zu Zone 'Echt' zugewiesen"

Das ist besonders wichtig fuer Touch-Geraete und fuer User die DnD nicht intuitiv nutzen.

### 4.5: DnD-Animationen und Feedback

| Phase | Animation | Dauer | Easing | Details |
|-------|----------|-------|--------|---------|
| Drag-Start | Card leichter Lift (1.05x, Schatten) + Ghost (0.65 Opacity) | sofort (<16ms) | — | CSS Transform, kein DOM-Clone |
| Drag-Over (Zone) | Zone-Rand pulsiert, leichter Glow | 100ms | ease-in | Signalisiert "kann hier droppen" |
| Drop (Erfolg) | Card gleitet in neue Position | 200ms | ease-out (0,0,0.2,1) | GridStack-artige Snap-Animation |
| Cancel | Card gleitet zurueck zur Ausgangsposition | 200ms | ease-in-out | Snap-Back signalisiert "nichts passiert" |
| API-Bestaetig. | Toast "ESP zu Zone zugewiesen" | — | — | Erfolg/Fehler-Toast |

**Ghost-Styling:**
```css
.esp-card-ghost {
  opacity: 0.65;
  transform: scale(1.05);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  border: 2px dashed var(--color-accent);
  transition: none; /* Kein Lag beim Folgen des Cursors */
}
```

### 4.6: Touch-Support

- **Long-Press 400ms** um Drag zu starten (verhindert versehentliche Drags beim Scrollen)
- **Visuelles Feedback waehrend Long-Press:** Card pulsiert/skaliert leicht hoch (200ms)
- **Drag-Handle mind. 44px** (Parhi et al. 2006)
- **Max Drag-Distanz auf Tablet: ~600px** — bei langen Seiten Scrolling ermoglichen waehrend Drag

### 4.7: Verifikation

- [ ] ESP-Cards haben sichtbaren Drag-Handle
- [ ] Drag startet nur ueber Handle (Klick auf Card-Body navigiert weiterhin)
- [ ] Alle Zonen werden als Drop-Target hervorgehoben bei Drag
- [ ] "NICHT ZUGEWIESEN" wird als Drop-Target hervorgehoben bei Drag
- [ ] Drop in Zone: API-Call + Toast + Card erscheint in neuer Zone
- [ ] Drop in "NICHT ZUGEWIESEN": API-Call + Toast + Card verschwindet aus Zone
- [ ] Click-to-Place via Overflow-Menu → "Zone aendern" → Dropdown funktioniert
- [ ] Touch: Long-Press startet Drag, Scroll funktioniert weiterhin
- [ ] Cancel (Escape, ausserhalb droppen): Card kehrt zur Ausgangsposition zurueck
- [ ] dragStateStore wird nach Drop/Cancel zuverlaessig zurueckgesetzt (kein Zombie-State)

**Commit:** `feat(dnd): drag handles, drop zone highlighting, click-to-place alternative`

---

## Block 5: "NICHT ZUGEWIESEN" und Pending-Devices Redesign (P1, ~2-3h)

### Ziel
Unzugewiesene und Pending-Geraete prominent und handlungsorientiert anzeigen.

### 5.1: Unzugewiesene ESPs als eigene Zone-Sektion

- Gleiche AccordionSection-Komponente wie Zonen
- Farblich abgesetzt (z.B. leichter Orange-Tint als Hinweis "hier muss noch was passieren")
- Counter in der TopBar (Badge auf "Geraete"-Button)
- Wenn leer: Kompakte Darstellung "Alle Geraete zugewiesen ✓" (eingeklappt)

### 5.2: Pending-Discovery-Workflow

Pending-ESPs (discovered aber nicht approved) muessen sichtbar sein:

```
┌──── Neue Geraete entdeckt (1) ────────────────────────────────────────┐
│                                                                        │
│  ┌───────────────────────────────────────────────────────────────┐    │
│  │ ESP_DISCOVERED_01                                              │    │
│  │ MAC: AA:BB:CC:DD:EE:FF  •  Firmware: v1.2.3                  │    │
│  │ Entdeckt: vor 3 Minuten                                       │    │
│  │                                                                │    │
│  │ [Genehmigen und Zone zuweisen]  [Ablehnen]                    │    │
│  └───────────────────────────────────────────────────────────────┘    │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

- "Genehmigen" oeffnet Mini-Dialog: Zone-Auswahl + optionaler ESP-Name
- "Ablehnen" → ConfirmDialog → Toast
- Pending-Count als Badge auf "Geraete"-Button im TopBar
- WebSocket-Event `device_discovered` → Badge-Counter aktualisiert + Toast "Neues Geraet entdeckt"

### 5.3: TopBar-Badge fuer Unzugewiesene/Pending

```
[Geraete (3)]    ← Roter Badge wenn Pending oder Unzugewiesene vorhanden
[Geraete]        ← Kein Badge wenn alles zugewiesen
```

> **KORREKTUR (Verifikation 2026-02-26):** `espStore.unassignedDevices` existiert NICHT als Store-Getter. `unassignedDevices` ist ein lokales computed in `UnassignedDropBar.vue:45`. Entweder muss `unassignedDevices` als Getter zum espStore migriert werden (empfohlen — wird an mehreren Stellen gebraucht), oder die Berechnung hier dupliziert werden.

Implementation: `computed` Property — nach Migration zum espStore:
```typescript
const pendingAndUnassignedCount = computed(() =>
  espStore.pendingDevices.length + espStore.unassignedDevices.length  // unassignedDevices muss zuerst als Store-Getter existieren
)
```

### 5.4: Verifikation

- [ ] Unzugewiesene ESPs erscheinen in eigener AccordionSection
- [ ] Pending ESPs erscheinen in separater Sektion mit Genehmigen/Ablehnen
- [ ] TopBar-Badge zeigt korrekte Anzahl
- [ ] Discovery-WebSocket-Event aktualisiert Badge + zeigt Toast
- [ ] DnD von Unzugewiesen in Zone und umgekehrt funktioniert
- [ ] Leerer Zustand wird korrekt angezeigt

**Commit:** `feat(devices): unassigned section redesign, pending device workflow`

---

## Block 6: ESP-Status-Anzeige und Toast-Integration (P1, ~2h)

### Ziel
Konsistente Status-Anzeige ueberall + korrekte Toast-Nutzung bei allen Aktionen.

### 6.1: Einheitliche Status-Darstellung

**Grundregel:** Status wird IMMER als Dot + Text + optional Icon dargestellt. Nie nur Farbe.

| Status | Dot | Text | Icon | Verwendung |
|--------|-----|------|------|-----------|
| online | ● (gruen) | "Online" | ✓ | ESP sendet Heartbeats innerhalb 1.5x Intervall |
| stale | ● (orange) | "Verzoegert" | ⏳ | Letzter Heartbeat 1.5-5min alt |
| offline | ○ (rot) | "Offline" | ✕ | Kein Heartbeat seit >5min |
| pending | ◌ (blau) | "Warte auf Genehmigung" | ⏳ | Discovery empfangen, nicht approved |
| unknown | ◌ (grau) | "Unbekannt" | ? | Kein Heartbeat empfangen (neues Geraet) |
| error | ● (rot pulsierend) | "Fehler" | ⚠ | ESP meldet Error-Event |
| safe_mode | ● (gelb pulsierend) | "Safe-Mode" | 🛡 | ESP im GPIO-Safe-Mode |

**Konsistenz-Regel:** ALLE ESP-Darstellungen (ESP-Card auf Uebersicht, Orbital-Layout-Zentrum, ESPHealthWidget, Config-Panel) nutzen den gleichen `useESPStatus.ts` Composable. Keine eigene Status-Berechnung pro Komponente.

### 6.2: Toast-Integration bei allen Aktionen

**Bestehende Toast-Infrastruktur:** ToastContainer.vue mit Deduplication (2s Window), Auto-Dismiss (5s normal, 8s error), max 20 Stacking.

| Aktion | Toast-Typ | Text | Dauer |
|--------|-----------|------|-------|
| ESP Zone zugewiesen (DnD) | success | "ESP_472204 → Zone 'Echt' zugewiesen" | 5s |
| ESP Zone entfernt (DnD) | info | "ESP_472204 ist jetzt unzugewiesen" | 5s |
| ESP online geworden | success | "ESP_472204 ist online" | 5s |
| ESP offline geworden | warning | "ESP_472204 ist offline" | 8s |
| ESP geloescht | info | "ESP_472204 wurde geloescht" | 5s |
| Zone erstellt | success | "Zone 'Gewaechshaus' erstellt" | 5s |
| Zone geloescht | info | "Zone 'Echt' geloescht (1 ESP unzugewiesen)" | 5s |
| Sensor konfiguriert | success | "Schwellwerte fuer sht31_temp gespeichert" | 5s |
| Config-Error | error | "Konfiguration fehlgeschlagen: [Details]" | 8s |
| Neues Geraet entdeckt | info | "Neues Geraet entdeckt: ESP_NEW_01" + [Genehmigen]-Link | 8s |
| DnD-Drop fehlgeschlagen | error | "Zuweisung fehlgeschlagen: [Fehlertext]" | 8s |

**WebSocket-Events die Toasts ausloesen SOLLEN:**
- `device_discovered` → "Neues Geraet entdeckt"
- `esp_health` mit Status-Wechsel → "Online/Offline"-Toast (ABER: Deduplication beachten, nicht bei jedem Heartbeat)
- `zone_assignment` → "Zone zugewiesen"-Toast
- `config_response` → "Konfiguration gespeichert"
- `config_failed` → "Konfiguration fehlgeschlagen"

**Pruefung:** Agent muss verifizieren dass die WebSocket-Handler in den Stores (esp.store.ts, zone.store.ts, config.store.ts) Toasts aufrufen. Falls nicht → hinzufuegen.

> **[verify-plan 2026-02-26] IST-Zustand Toast-Integration:**
> - `esp.ts`: ✅ Toasts fuer device_discovered (Z.1233), device_approved (Z.1265), device_rejected (Z.1289), device_rediscovered (Z.1401), esp_health Status-Wechsel (Z.1075), config_failed (Z.1462)
> - `config.store.ts`: ✅ Toasts fuer config_response (Z.49/56/66/83), config_published (Z.138), config_failed (Z.157)
> - `zone.store.ts`: ⚠️ Toasts NUR fuer **subzone_assignment** (Z.176/184/187). **KEINE Toasts fuer zone_assignment** — handleZoneAssignment (Z.80-127) nutzt nur logger, keine Toast-Aufrufe. Block 6 MUSS hier Toasts hinzufuegen fuer zone_assigned/zone_removed/error.

### 6.3: Verifikation

- [ ] Status-Dot + Text auf ESP-Cards (Uebersicht)
- [ ] Status-Dot + Text im Config-Panel
- [ ] Status-Dot + Text im Orbital-Layout
- [ ] Toasts bei: DnD Zone-Zuweisung, Zone erstellen/loeschen, ESP loeschen, Config-Aenderung
- [ ] Toast bei Device-Discovery (WebSocket-Event)
- [ ] Toast bei Status-Wechsel (Online→Offline und umgekehrt)
- [ ] Keine Toast-Duplikate (Deduplication Window 2s)

**Commit:** `feat(ux): consistent status display, toast integration for all actions`

---

## Block 7: Routen-Pruefung und Navigation-Fixes (~0.5-1h)

> **KORREKTUR (Verifikation 2026-02-26):** Aufwand von ~1-2h auf ~0.5-1h reduziert weil Block 7.3 (2-Level-Refactoring) bereits erledigt ist. Nur Route-Audit + Breadcrumb-Erweiterung verbleiben.

### Ziel
Alle Routen die den Uebersicht-Tab betreffen muessen korrekt sein. Veraltete Routen muessen identifiziert und migriert werden.

### 7.1: Route-Audit

Der Agent muss `router/index.ts` komplett lesen und folgende Fragen beantworten:

| Route | Frage | Erwartetes Ergebnis |
|-------|-------|---------------------|
| `/hardware` | Existiert? Laedt HardwareView? | Ja, Default-Route |
| `/hardware/:zoneId` | Existiert? Wird gebraucht nach D2-Vision? | **ENTFAELLEN** — Level 2 wird in Level 1 integriert. Route als Redirect behalten: `/hardware/:zoneId` → `/hardware` mit Zone-Scroll-Anker |
| `/hardware/:zoneId/:espId` | Existiert? Laedt Orbital-Layout? | Ja, Ebene 2 nach D2-Vision |
| `/monitor` | Existiert als eigene Route? | Ja, Monitor-Tab |
| `/custom-dashboard` | Existiert als eigenstaendige Route? | Ja, zeigt `CustomDashboardView.vue`. **KORREKTUR:** `/dashboards` existiert NICHT als Route. `/custom-dashboard` ist eigenstaendig, kein Redirect noetig solange Editor-Tab darauf zeigt |
| `/dashboard-legacy` | Existiert? Redirect auf `/hardware`? | Muss redirecten (sollte bereits existieren) |
| Deprecated Redirects (**10**) | Alle noch aktiv? | Pruefen ob alle 10 Redirects funktionieren: `/dashboard-legacy`, `/devices`, `/devices/:espId`, `/mock-esp`, `/mock-esp/:espId`, `/database`, `/logs`, `/audit`, `/mqtt-log`, `/actuators`. [verify-plan 2026-02-26: Plan sagte 8, tatsaechlich 10 deprecated Redirects in router/index.ts] |

### 7.2: Navigation innerhalb des Uebersicht-Tabs

**Breadcrumb-Verhalten nach D2-Vision:**

```
Ebene 1 (Uebersicht):
  Dashboard > Uebersicht

Ebene 2 (Orbital-Layout nach Klick auf ESP):
  Dashboard > Uebersicht > Zone: Echt > ESP_472204
```

- Klick auf "Uebersicht" im Breadcrumb → zurueck zu Ebene 1
- Klick auf "Zone: Echt" → Scrollt zur Zone in Ebene 1 (kein eigener View!)
- Escape-Key → zurueck zu Ebene 1

**TopBar-Breadcrumb-Erweiterung:**
- Auf Ebene 2 (Orbital): Zone-Name + Zone-Online-Count anzeigen ("Zone: Echt (0/1 Online)")
- Klickbar: Jedes Segment navigiert zurueck

### 7.3: ~~HardwareView-Refactoring fuer 2-Ebenen-System~~ — BEREITS ERLEDIGT

> **KORREKTUR (Verifikation 2026-02-26):** HardwareView.vue:60 hat BEREITS `computed<1 | 2>` mit Kommentar "Two-level navigation". Das 2-Ebenen-System ist bereits implementiert. Route `/hardware/:zoneId` funktioniert bereits als Scroll-Anchor (Zeile 5). **Dieser Abschnitt kann uebersprungen werden.**

**AKTUELLER Stand (HardwareView.vue **975** Zeilen) [verify-plan 2026-02-26: 720→975 Z.]:**
```typescript
// HardwareView.vue:60 — BEREITS 2-Level-System
const currentLevel = computed<1 | 2>(() => {
  if (route.params.espId) return 2  // Orbital-Layout
  return 1                           // Zonen-Uebersicht
})
```

**Was noch zu tun ist (nicht hier, sondern in Block 2):**
- Level 1 muss die ESP-Cards direkt in Zonen-Accordions zeigen (bisher nur Zone-Tiles)
- ZoneDetailView.vue (347 Z.) Logik in ZonePlate integrieren
- Route `/hardware/:zoneId` als Scroll-Anker beibehalten (funktioniert bereits)

### 7.4: Verifikation

- [ ] `/hardware` zeigt Zonen-Uebersicht mit ESP-Cards
- [ ] `/hardware/:zoneId/:espId` zeigt Orbital-Layout
- [ ] `/hardware/:zoneId` redirected zu `/hardware` mit korrektem Scroll
- [ ] Breadcrumb navigiert korrekt zurueck
- [ ] Escape-Key funktioniert auf Ebene 2
- [ ] Browser-Back funktioniert
- [ ] Alle deprecated Redirects funktionieren noch
- [ ] Deep-Link zu ESP funktioniert: `/hardware/zone123/esp456` laedt korrekt

**Commit:** `refactor(routes): 2-level navigation, zone route redirect`

---

## Block 8: Integration und Abschluss (~2h)

### 8.1: Zusammenfuehrung aller Bloecke

- Alle 7 Bloecke in einem Feature-Branch zusammenfuehren
- Konflikt-Check mit parallel laufenden Auftraegen (Orbital-Split, DnD-Konsolidierung)

### 8.2: Visueller Gesamt-Check

Der Agent oeffnet die Anwendung und prueft:

| Check | Was | Kriterium |
|-------|-----|-----------|
| 5-Sekunden-Regel | Kann man in <5s erkennen ob alles OK ist? | Zone-Online-Counts sofort sichtbar |
| 2-Klick-Regel | ESP finden und oeffnen in max 2 Klicks? | 1 Klick auf "Oeffnen" auf der ESP-Card |
| Stale-Visualisierung | Erkennt man sofort ob Daten live oder gecached sind? | Graue Sparkbars + "Zuletzt" bei Offline |
| DnD-Affordance | Ist klar dass ESPs per DnD verschoben werden koennen? | Grip-Handle sichtbar, Cursor ändert sich |
| Toasts | Kommen Toasts bei jeder Aktion? | Stichproben: DnD, Zone erstellen, ESP loeschen |
| Responsive | Funktioniert auf 1280px Laptop? | Layout bricht nicht, Cards wrappen |

### 8.3: Test-Suite

- [ ] `npm run build` erfolgreich
- [ ] `npm run test` — alle bestehenden Tests gruen
- [ ] Neue Unit-Tests fuer:
  - `useESPStatus.ts` (Status-Berechnung bei verschiedenen Heartbeat-Altern)
  - `AccordionSection.vue` (oeffnen/schliessen/localStorage-Persist)
  - `ESPOverviewCard.vue` (Rendering bei Online/Offline/Stale)
  - Zone-Assignment DnD (dragStateStore Lifecycle)
- [ ] E2E-Tests (Playwright, falls vorhanden):
  - ESP von Zone A nach Zone B ziehen
  - ESP in "NICHT ZUGEWIESEN" droppen
  - "Geraete"-Button oeffnet Panel

### 8.4: Performance-Check

- [ ] Kein Layout-Shift beim Oeffnen/Schliessen von Zonen-Accordions
- [ ] DnD-Ghost folgt Cursor ohne Lag (<16ms)
- [ ] Toast-Animationen fluessig (60fps)
- [ ] Bei 10+ Zonen mit je 5+ ESPs: Seite bleibt responsiv

**Commit:** `feat(overview): integration, tests, performance verification`

---

## Abhaengigkeiten

| Auftrag | Beziehung | Status |
|---------|-----------|--------|
| ~~**Zone-CRUD Backend-API**~~ | ~~**BLOCKER**~~ → **KEIN BLOCKER.** Zone-Architektur-Analyse (2026-02-26): Zonen sind String-Felder, implizites Assignment-System vollstaendig funktional. 0h Backend noetig. Siehe `auftrag-zone-subzone-architektur-analyse.md` | **AUFGELOEST** |
| `auftrag-hardware-tab-css-settings-ux.md` Block A | **MUSS VORHER erledigt sein** — CSS-Extraktion fuer Modal/Form-Styles | **ERLEDIGT (2026-02-26)** |
| `auftrag-hardware-tab-css-settings-ux.md` Block B | **SYNERGIEN** — AccordionSection.vue (151 Z.) dort erstellt, hier wiederverwendbar | **ERLEDIGT (2026-02-26)** |
| `auftrag-hardware-tab-css-settings-ux.md` Block C | **MUSS VORHER erledigt sein** — `useESPStatus.ts` wird hier ueberall genutzt | **ERLEDIGT (2026-02-26)** |
| `auftrag-dashboard-umbenennung-erstanalyse.md` Block D | **GRUNDLAGE** — 2-Ebenen-Vision ist verbindlich. Block 7.3 ist BEREITS ERLEDIGT | FREIGEGEBEN |
| `auftrag-orbital-split.md` | **PARALLEL MOEGLICH** — Orbital-Layout bleibt unveraendert. Path-Import-Aenderung bei Split beachten | **ERLEDIGT (2026-02-26)** |
| `auftrag-dnd-system-analyse.md` | **SYNERGIEN** — DnD-Analyse liefert Input fuer Block 4. **Hinweis:** ZoneGroup.vue (951 Z.) hat bereits DnD — Analyse muss darauf aufbauen | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |
| `auftrag-dnd-konsolidierung-interaktion.md` | **DANACH** — Zentralisierte DnD-Architektur profitiert von den hier gemachten Aenderungen | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |
| `auftrag-unified-monitoring-ux.md` | **SYNERGIEN** — Alert-System integriert in Zone-Header Alerts. StatusBar nutzt gleiche Status-Logik | Noch nicht gestartet. **[verify-plan] Datei existiert nicht im Dateisystem** |

---

## Empfohlene Reihenfolge

| Schritt | Block | Aufwand | Abhaengigkeit |
|---------|-------|---------|---------------|
| ~~**0**~~ | ~~**Backend: Zone-CRUD API**~~ | ~~~4-6h~~ **0h** | ~~**BLOCKER**~~ **ENTFAELLT.** Zone-Architektur-Analyse: Zonen sind String-Felder, bestehendes Assignment-System reicht. Zone-Erstellen = ESP zuweisen, Zone-Loeschen = alle ESPs entfernen, Zone-Umbenennen = re-assign |
| **1** | Block 1: Status-System-Fix | ~2-3h | `useESPStatus.ts` (aus CSS-Auftrag Block C). P2-Fix (`deviceCounts`-Watch) ist einfach (~30min) |
| **2** | Block 3.1: "Geraete"-Button Fix | ~1h | Keine — sofortiger Fix. Erste Pruefung: `dashStore.showControls` |
| **3** | Block 2: Zone-Layout Redesign | ~5-7h | AccordionSection.vue (aus CSS-Auftrag Block B). **Korrigiert:** ZonePlate ist 755 Z. (nicht 400), DeviceMiniCard 469 Z. (nicht 150) — mehr Refactoring-Aufwand |
| **4** | Block 3.2-3.5: Konfigurationspanel Neugestaltung | ~3-4h | Block 2. **Korrigiert:** ESPSettingsSheet 1413 Z. (nicht 300), PendingDevicesPanel 897 Z. (nicht 200) |
| **5** | Block 4: DnD Zone-Assignment | ~3-4h | Block 2. **Hinweis:** ZoneGroup.vue (951 Z.) hat bereits VueDraggable-DnD — darauf aufbauen, nicht von Null |
| **6** | Block 5: Unzugewiesene/Pending Redesign | ~2-3h | Block 4. ~~Zone-CRUD Backend Schritt 0~~ ENTFAELLT. `espStore.unassignedDevices` muss als Store-Getter migriert werden. Zone-Entfernung via `DELETE /v1/zone/devices/{id}/zone` |
| **7** | Block 6: Status + Toast Integration | ~2h | Block 1-5. Toast-API: `useToast` Composable (nicht uiStore.addToast) |
| **8** | Block 7: Routen + Navigation | ~0.5-1h | Block 2. **Korrigiert:** Block 7.3 (2-Level-Refactoring) ist BEREITS ERLEDIGT → nur noch Route-Audit + Breadcrumb (~50% weniger Aufwand) |
| **9** | Block 8: Integration + Tests | ~2-3h | Alle Bloecke |

**Gesamt-Aufwand: ~24-30h** (rein Frontend, 0h Backend). **Korrigiert** von ~30-40h wegen:
- ~~Fehlende Backend-API (Zone-CRUD)~~ → **ENTFAELLT** (-4-6h): Zone-Architektur-Analyse zeigt implizites System ist vollstaendig funktional
- 6 massiv unterschaetzte Komponentengroessen (ESPSettingsSheet 4.7x, PendingDevicesPanel 4.5x, UnassignedDropBar 4.7x, DeviceMiniCard 3x, ZonePlate 1.9x, dashboard.store 2.4x)
- Block 7.3 war bereits erledigt (spart ~1h)

---

## Zusammenfassung der Ergebnisse

| Metrik | Vorher (Screenshot) | Nachher (Ziel) |
|--------|---------------------|----------------|
| StatusBar-Counts | Falsch (0 Online, Real 0) | Korrekt und reaktiv |
| Zone-Header-Info | Kryptisch (19.7-19.7°C) | Klar (1 ESP, 0/1 Online, ⚠ 0) |
| ESP-Card-Info | Minimal (Zahlen ohne Einheiten) | Vollstaendig (Name, Status, Sensoren, Einheiten, Sparklines) |
| "Geraete"-Button | Kaputt (tut nichts) | Oeffnet SlideOver mit ESP-Verwaltung |
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
| PendingDevicesPanel.vue | ~200 Z. | **897 Z.** | 4.5x | KORRIGIERT |
| dashboard.store.ts | 107 Z. | **268 Z.** | 2.5x | KORRIGIERT [verify-plan] |
| StatusPill~~s~~.vue | Plural (falsch) | **StatusPill.vue** (Singular) | — | KORRIGIERT |
| HardwareView.vue | ~689 Z. | **720 Z.** | 1.04x | KORRIGIERT |

### Fehlende Komponente im Inventar

| Komponente | Zeilen | Bedeutung |
|-----------|--------|-----------|
| `ZoneGroup.vue` | **951 Z.** | Implementiert bereits VueDraggable-DnD, Zone-Header, Device-Gruppierung. Wird von ZonePlate genutzt. Block 4 muss darauf aufbauen | KORRIGIERT — ins Inventar aufgenommen |

### Architektur-Korrekturen

| Korrektur | Block | Details |
|-----------|-------|---------|
| 2-Level-System BEREITS implementiert | Block 7.3 | HardwareView.vue:60 hat `computed<1 \| 2>` mit "Two-level navigation" Kommentar. Block 7.3 als ERLEDIGT markiert |
| ~~Zone-CRUD Backend FEHLT~~ | Block 2.3 + 5 | ~~**BLOCKER.**~~ **AUFGELOEST.** Zone-Architektur-Analyse zeigt: Implizites System (String-Feld auf esp_devices) reicht. 5 Zone-Endpoints + 6 Subzone-Endpoints existieren. Siehe `auftrag-zone-subzone-architektur-analyse.md` |
| P11 Root Cause verifiziert | Block 3.1 | "Geraete"-Button setzt `dashStore.showPendingPanel = true` → oeffnet PendingDevicesPanel (NICHT ESPSettingsSheet). Funktioniert NUR wenn `dashStore.showControls === true` |
| P2 Root Cause identifiziert | Block 1.1 | `dashStore.deviceCounts` wird NIRGENDS aktualisiert (initialisiert auf all:0, mock:0, real:0). Fix: Watch analog zu `statusCounts` |
| `espStore.unassignedDevices` existiert nicht | Block 5.3 | Ist lokales computed in UnassignedDropBar.vue:45, KEIN Store-Getter. Migration empfohlen |
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
| Block 3 | ~3-4h | ~4-6h | ESPSettingsSheet 1419 Z. (nicht 300), PendingDevicesPanel 897 Z. (nicht 200) [verify-plan] |
| Block 7 | ~1-2h | ~0.5-1h | Block 7.3 bereits erledigt |
| ~~Backend (NEU)~~ | ~~—~~ | ~~~4-6h~~ **ENTFAELLT** | Zone-CRUD AUFGELOEST — implizites System reicht (Zone-Architektur-Analyse) |
| **Gesamt** | **~20-28h** | **~24-30h** | Komponentenkomplexitaet, KEIN Backend-Aufwand |
