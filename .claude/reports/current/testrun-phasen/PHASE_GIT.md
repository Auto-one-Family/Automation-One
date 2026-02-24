# Auftrag: El Frontend — Phase 3 Analyse, Drag-and-Drop-Pruefung, verbleibende Widget-Typen

> **Erstellt:** 2026-02-23
> **Zuletzt aktualisiert:** 2026-02-23 (Reality-Check gegen Codebase)
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** auto-one
> **Branch:** `feature/frontend-consolidation` (76 Dateien, +8.648/-509 vs. master)
> **Kontext:** Phase 1 (Testlauf-Bereitschaft) und Phase 2 (Kundeneinsatz) der UX-Konsolidierung sind abgeschlossen. Phase 3 ist teilweise umgesetzt (Orbital-Split, Undo/Redo, Connection-Validierung). Dieser Auftrag definiert was NOCH zu tun ist.
> **Prioritaet:** MITTEL — Phase 3 (Vollstaendigkeit)
> **Empfohlene Agenten:** frontend-dev
> **Abhaengigkeiten:** Phase 1 + Phase 2 muessen abgeschlossen sein (sind sie)

---

## TEIL 0: Was wurde erledigt — Zusammenfassung Phase 1 + 2

### Phase 1 — Testlauf-Bereitschaft (ERLEDIGT)

| # | Aufgabe (Auftrag 5.x) | Status | Was genau |
|---|------------------------|--------|-----------|
| 5.1 | DashboardView-Legacy entfernen | TEILWEISE | `/` → `/hardware` Redirect implementiert. Route `dashboard-legacy` → `/hardware`. **ACHTUNG:** DashboardView.vue (955 Zeilen) existiert noch als ORPHANED Datei (kein Router-Eintrag). useZoomNavigation.ts existiert noch (importiert in DashboardView + HardwareView). Cleanup ausstehend |
| 5.4/5.5 | Config zentralisieren | ERLEDIGT | Sensor-/Aktor-Konfiguration ueberall via SensorConfigPanel/ActuatorConfigPanel im SlideOver (HardwareView, MonitorView, SensorsView). EditSensorModal aus ESPOrbitalLayout entfernt |
| 5.3 | Monitor-Charts | ERLEDIGT | MonitorView Level 2: Sparkline auf jeder Sensor-Card, expandierbares Panel mit GaugeChart + LiveLineChart + HistoricalChart (1h/6h/24h/7d) |
| 5.7 | Farb-Legende + Tooltips | ERLEDIGT | ColorLegend.vue Popover im TopBar, 6 Status-Farben. Alle Status-Dots/-Badges haben title-Attribute |
| 5.10 | CSS-Tokens | ERLEDIGT | cssTokens.ts Utility. ~100+ Hex-Farben in ~35 Dateien durch var(--color-*) / tokens.* ersetzt |

### Phase 2 — Kundeneinsatz (ERLEDIGT)

| # | Aufgabe (Auftrag 5.x) | Status | Was genau |
|---|------------------------|--------|-----------|
| 5.2 | Tab-System | ERLEDIGT | ViewTabBar.vue (Hardware / Monitor / Dashboard) auf allen drei Views, RouterLink-basiert |
| 5.6 | Dashboard-Widgets (4 von 8) | TEILWEISE | LineChart, Gauge, SensorCard, ActuatorCard als echte Komponenten. Via Vue h() + render() mit shared appContext fuer Pinia-Zugriff |
| 5.8 | Navigation | ERLEDIGT | Sidebar: Hardware, Regeln, Komponenten + Admin (System, Benutzer, Wartung) + Footer (Einstellungen) = 7 Links. Monitor/Dashboard ueber ViewTabBar |

### Neue Dateien (Phase 1 + 2 + teilweise Phase 3)

| Datei | Zweck | Zeilen |
|-------|-------|--------|
| `src/utils/cssTokens.ts` | Runtime CSS-Token-Zugriff fuer Chart.js | — |
| `src/components/common/ColorLegend.vue` | Farb-Legende Popover | — |
| `src/components/common/ViewTabBar.vue` | Tab-Navigation Hardware/Monitor/Dashboard | — |
| `src/components/dashboard-widgets/WidgetWrapper.vue` | Widget-Container | 137 |
| `src/components/dashboard-widgets/LineChartWidget.vue` | Echtzeit-Linien-Chart Widget | 126 |
| `src/components/dashboard-widgets/GaugeWidget.vue` | Gauge-Chart Widget | 101 |
| `src/components/dashboard-widgets/SensorCardWidget.vue` | Sensor-Wert-Karte Widget | 157 |
| `src/components/dashboard-widgets/ActuatorCardWidget.vue` | Aktor-Status-Karte Widget | 179 |
| `src/components/esp/SensorColumn.vue` | Orbital-Split: Sensor-Liste links | — |
| `src/components/esp/ActuatorColumn.vue` | Orbital-Split: Aktor-Liste rechts | — |
| `src/components/esp/ConnectionLines.vue` | Orbital-Split: SVG Overlay | 401 |
| `src/components/esp/AnalysisDropZone.vue` | Orbital-Split: Center mit Charts | 849 |
| `src/components/esp/SensorSatellite.vue` | Orbital-Split: Sensor-Satellit | 725 |
| `src/components/esp/ActuatorSatellite.vue` | Orbital-Split: Aktor-Satellit | 345 |
| `src/components/esp/SensorValueCard.vue` | Orbital-Split: Sensor-Wert-Anzeige | 538 |
| `src/components/esp/GpioPicker.vue` | GPIO-Auswahl-Komponente | 723 |
| `src/components/esp/LiveDataPreview.vue` | Live-Daten Vorschau | — |
| `src/components/esp/DeviceHeaderBar.vue` | Geraete-Headerleiste | — |
| `src/components/esp/ZoneAssignmentDropdown.vue` | Zone-Zuordnung Dropdown | — |
| `src/components/esp/PendingDevicesPanel.vue` | Ausstehende Geraete | 897 |
| `src/components/rules/RuleFlowEditor.vue` | Vue Flow Node-Editor | 1465 |
| `src/components/rules/RuleConfigPanel.vue` | Regel-Konfigurations-Panel | 958 |
| `src/components/rules/RuleTemplateCard.vue` | Regel-Vorlage-Karte | 119 |

---

## TEIL 1: Was noch erledigt werden muss

### 1.1 Verbleibende Aufgaben aus dem Original-Auftrag

| # | Aufgabe | Original-Ref | Prioritaet | Aufwand | Status | Details |
|---|---------|-------------|------------|---------|--------|---------|
| A | **ESPOrbitalLayout aufteilen** (3913→633 Zeilen) | 5.9 | HOCH | 8h | **WEITGEHEND ERLEDIGT** | 23 Sub-Komponenten in `components/esp/` (flat, nicht nested `orbital/`). ESPOrbitalLayout.vue: 633 Zeilen (Ziel <500 nicht erreicht). Einige Sub-Komponenten ueberschreiten 500 Zeilen (ESPCard: 1751, ESPSettingsSheet: 1413, SensorConfigPanel: 896, PendingDevicesPanel: 897). Funktionalitaet erhalten |
| B | **4 verbleibende Widget-Typen** (historical, esp-health, alarm-list, actuator-runtime) | 5.6 | HOCH | 10h | **OFFEN** | `widgetTypes` Array listet alle 8 Typen, aber `widgetComponentMap` hat nur 4 Eintraege. Die 4 fehlenden rendern als Placeholder-Divs (`dashboard-widget__placeholder`) ohne Vue-Komponente |
| C | **Dashboard-Persistenz Backend** (neuer Endpoint) | Phase 3 | MITTEL | 8h | **OFFEN** | Kein Backend-Endpoint fuer Dashboard-Layouts. Layouts nur in localStorage |
| D | **Sensor-Daten-Aggregation Backend** (resolution-Parameter) | Phase 3 | MITTEL | 6h | **OFFEN** | Kein `resolution`/`aggregate` Parameter in Backend-Routern gefunden |
| E | **Mobile-Responsive Optimierung** | Phase 3 | NIEDRIG | 12h | **OFFEN** | Keine responsive Breakpoint-Logik implementiert |
| F | **SettingsView erweitern** (Passwort, Notifications) | Phase 3 | NIEDRIG | 6h | **OFFEN** | SettingsView.vue nur 111 Zeilen: User-Info, Logout, API-URL. Kein Passwort-Change, keine Notification-Settings |

### 1.2 Bekannte Caveats aus Phase 1 + 2

| # | Caveat | Risiko | Handlung |
|---|--------|--------|----------|
| C1 | **Dashboard-Widget Pinia-Zugriff** via render() + appContext | Mittel — verschachtelte provide/inject (z.B. Router) koennten in seltenen Faellen fehlen | Pruefen ob Router-Navigation aus Widgets heraus funktioniert. Falls nicht: useRouter() Fallback oder explizites provide im Widget-Mount. **Aktuell nur 4 von 8 Widgets als Vue-Komponenten gemountet** — die 4 Placeholder-Widgets haben dieses Problem nicht |
| C2 | **Verbleibende Hex-Farben** (~30 Dateien) | Niedrig — sind ausschliesslich Farben ohne Token-Entsprechung (Pink, Orange, Custom-Shades), rgba()-Werte, oder Tailwind-Klassen | Kein Handlungsbedarf. Dokumentieren welche Farben bewusst kein Token haben |
| C3 | **CalibrationView / SensorHistoryView** | Info — im Original-Auftrag erwaehnt aber nicht Teil der Konsolidierung | Existieren im Code, funktionieren eigenstaendig. Kein Handlungsbedarf |
| C4 | **Dashboard localStorage** | Hoch fuer Multi-User — Layouts sind benutzerspezifisch aber nicht serverpersistiert | Phase 3, Aufgabe C |

### 1.3 Weitere offene Punkte (aus Dashboard_analyse.md und auftrag-dashboard-redesign.md)

| # | Punkt | Quelle | Prioritaet | Status |
|---|-------|--------|------------|--------|
| P1 | **Undo/Redo im Logic Rule Builder** | Dashboard_analyse Teil C | MITTEL | **ERLEDIGT** — `logic.store.ts` Zeilen 370-537: Command-Pattern mit `history`, `historyIndex`, `canUndo`, `canRedo`, `undo()`, `redo()`. Exportiert und nutzbar |
| P2 | **Verbindungs-Validierung im Logic Builder** (isValidConnection) | Dashboard_analyse Teil C | MITTEL | **ERLEDIGT** — `logic.store.ts:454` `isValidConnection()` implementiert. Genutzt in `RuleFlowEditor.vue:265` |
| P3 | **Hysterese-UI im Logic Builder** | auftrag-dashboard-redesign 5.4 | NIEDRIG | OFFEN |
| P4 | **BaseModal Focus-Trap** fehlt | Dashboard_analyse Teil F | NIEDRIG | OFFEN — kein `focusTrap` Code in `shared/design/` |
| P5 | **BaseSkeleton** ist kein Skeleton-Loader (ist ein Spinner) | Dashboard_analyse Teil F | NIEDRIG | OFFEN — `BaseSkeleton.vue` existiert weiterhin |
| P6 | **ESP-Discovery** — Dashboard_analyse Teil I bricht ab | Info | OFFEN — Discovery-Flow muss separat analysiert werden |
| P7 | **ECharts-Migration** — noch bei Chart.js geblieben? | auftrag-dashboard-redesign Teil 4 | ENTSCHIEDEN | **Chart.js beibehalten** — kein ECharts Import im Projekt. chart.js + chartjs-plugin-annotation aktiv |
| P8 | **Zeit-Synchronisation** zwischen Charts (connectCharts / sync) | auftrag-dashboard-redesign 2C | MITTEL | OFFEN |
| P9 | **Heatmap-Widget** (Temperatur-Verteilung ueber Zeit) | Dashboard_analyse Teil H | NIEDRIG | OFFEN — `heatmap` in WidgetType-Union definiert aber nicht implementiert |

---

## TEIL 2: Drag-and-Drop — Vollstaendige Pruefung aller Stellen

### 2.1 DnD-Inventar — Wo existiert Drag-and-Drop?

| # | Bereich | Mechanismus | Store | Was wird gezogen | Wohin | Verifiziert |
|---|---------|-------------|-------|------------------|-------|-------------|
| D1 | **HardwareView Level 1** | VueDraggable | dragState.store.ts (447 Zeilen) | ESP-Karten (DeviceMiniCard) | Zwischen ZonePlates + UnassignedDropBar | Code vorhanden |
| D2 | **HardwareView Level 3 (Orbital)** | useDragState + Custom | dragState.store.ts | Sensor-/Aktor-Typen aus ComponentSidebar | Auf ESP (Orbital) → Neuen Sensor/Aktor hinzufuegen | Code vorhanden |
| D3 | **CustomDashboardView** (723 Zeilen) | GridStack.js | dashboard.store.ts (259 Zeilen) | Widget-Typen aus Seitenleiste (8 Typen definiert) | Auf Dashboard-Grid → Widget platzieren | Code vorhanden |
| D4 | **CustomDashboardView** (Resize) | GridStack.js | dashboard.store.ts | Widget-Ecke | Resize in Grid | Code vorhanden |
| D5 | **CustomDashboardView** (Reorder) | GridStack.js | dashboard.store.ts | Platziertes Widget | Neue Position im Grid | Code vorhanden |
| D6 | **Logic Rule Builder** | Vue Flow native | logic.store.ts (544 Zeilen) | Node-Typen aus RuleNodePalette (532 Zeilen) | Auf Canvas via RuleFlowEditor (1465 Zeilen) → Node erstellen | Code vorhanden, isValidConnection implementiert |
| D7 | **Logic Rule Builder** (Edges) | Vue Flow native | logic.store.ts | Connection-Handle | Zu anderem Node → Edge erstellen. Validierung via `isValidConnection()` | **ERLEDIGT** (P2) |
| D8 | ~~DashboardView-Legacy~~ | ~~VueDraggable~~ | — | ~~ESP-Karten~~ | ~~Route entfernt (redirect → /hardware). Datei DashboardView.vue noch vorhanden als Orphan~~ | Route-Redirect OK, Datei-Cleanup ausstehend |

### 2.2 DnD-Pruefauftraege — Was der Agent pruefen und sicherstellen muss

**AUFGABE fuer den Agent: Jeden DnD-Bereich systematisch durchgehen und folgende Checkliste abarbeiten.**

#### D1: ESP Zone-Assignment (HardwareView Level 1)

```
Pruefpunkte:
[ ] ESP-Karte kann von Zone A in Zone B gezogen werden
[ ] ESP-Karte kann in UnassignedDropBar gezogen werden (Zone-Zuweisung entfernen)
[ ] ESP-Karte kann AUS UnassignedDropBar in eine Zone gezogen werden
[ ] Visuelles Feedback beim Drag: Ghost-Element, Drop-Zone-Highlight
[ ] API-Call wird korrekt ausgeloest: POST /v1/zone/{zone_id}/assign-esp
[ ] WebSocket-Event zone_assignment aktualisiert UI nach API-Response
[ ] Drag-Cancel (ESC oder ausserhalb droppen): Karte kehrt an Original-Position zurueck
[ ] Touch-Support: Funktioniert Drag auf Tablet? (VueDraggable + touch-action CSS)
[ ] Mehrere ESPs gleichzeitig: Kann man >1 ESP selektieren und gemeinsam verschieben?
    → Falls nein: Ist das ein sinnvolles Feature? (Batch-Zone-Assignment)
[ ] Scroll waehrend Drag: Wenn viele Zonen vorhanden sind und man scrollen muss
```

**UX-Verbesserungsvorschlaege:**
- Drop-Zone-Highlight: Beim Drag sollten alle gültigen Drop-Zonen visuell hervorgehoben werden (Border-Glow oder Background-Change)
- Drag-Preview: Statt dem Default VueDraggable Ghost ein kompakteres Preview-Element (nur ESP-Name + Status-Dot)
- Undo nach Drag: Nach Zone-Wechsel sollte ein Toast erscheinen "ESP verschoben → Zone B" mit "Rueckgaengig"-Button (5s Timeout)

#### D2: Sensor/Aktor hinzufuegen (HardwareView Level 3 / Orbital)

```
Pruefpunkte:
[ ] Sensor-Typ kann aus ComponentSidebar auf ESP gezogen werden
[ ] Aktor-Typ kann aus ComponentSidebar auf ESP gezogen werden
[ ] Drop auf ESP oeffnet SensorConfigPanel / ActuatorConfigPanel automatisch
[ ] GPIO-Pin wird im Panel vorgeschlagen (naechster freier Pin)
[ ] I2C-Sensoren zeigen Adress-Dropdown statt GPIO
[ ] Visuelles Feedback: Drop-Zone auf dem Orbital-Center leuchtet auf
[ ] Drag ueber nicht-droppable Bereiche: Kein Effekt, cursor: no-drop
[ ] ComponentSidebar: Ist sie sichtbar wenn der Orbital geoeffnet ist?
    → Desktop (>1280px): Dauerhaft sichtbar links
    → Tablet (<1280px): Toggle-Button zum Ein-/Ausblenden
[ ] Sensor-Typ-Icons im Drag-Preview: Korrekt und unterscheidbar?
[ ] Nach Drop + Config-Speichern: Neuer Satellit erscheint sofort im Orbital
```

**UX-Verbesserungsvorschlaege:**
- Drag-Indikator auf dem Orbital: Wenn ein Sensor-Typ gedraggt wird, sollte der Orbital-Ring eine "Drop here" Animation zeigen (pulsierender Ring)
- Sensor-Typ-Preview: Beim Hover ueber Sensor-Typ in der Sidebar → Tooltip mit Beschreibung (z.B. "pH-Sensor — Analog, ADC1, Messbereich 0-14 pH")
- Maximale Satellitenanzahl: Wenn ESP bereits 8 Sensoren hat → Warnung beim Drop "ESP hat bereits 8 Sensoren. Orbital-Layout wird unuebersichtlich."

#### D3/D4/D5: Dashboard Widget Builder (CustomDashboardView)

```
Pruefpunkte:
[ ] Widget-Typ aus Seitenleiste auf Grid ziehen → Widget wird erstellt
[ ] Widget im Grid repositionieren (Drag innerhalb Grid)
[ ] Widget resizen (Ecke ziehen) → Mindestgroesse wird respektiert
[ ] Widget-Mindestgroessen pro Typ:
    - LineChart: min 4x3 (4 Spalten, 3 Reihen = 240px Hoehe)
    - Gauge: min 2x3
    - SensorCard: min 2x2
    - ActuatorCard: min 2x2
    - Historical: min 6x4
    - ESP-Health: min 4x3
    - AlarmList: min 4x4
    - ActuatorRuntime: min 3x3
[ ] Grid-Snap: Widgets rasten an Grid-Positionen ein
[ ] Ueberlappungs-Schutz: Widgets koennen sich NICHT ueberlagern
[ ] Auto-Positioning: Wenn Widget aus Sidebar gezogen wird, findet GridStack automatisch freien Platz
[ ] Layout-Persistenz: Nach Drag/Resize wird Layout in localStorage aktualisiert
[ ] Widget-Entfernen: Delete-Button auf Widget-Header → Widget verschwindet, Grid passt sich an
[ ] Leeres Dashboard: "Dashboard ist leer. Ziehe Widgets aus der Seitenleiste hierher." Hinweis
[ ] Mobile: Auf kleinen Bildschirmen (<768px) — werden Widgets in eine Spalte gestapelt?
```

**UX-Verbesserungsvorschlaege:**
- Widget-Konfiguration beim Drop: Wenn ein SensorCard-Widget auf das Grid gezogen wird → sofort Dropdown "Welchen Sensor anzeigen?" (nicht erst ueber Config-Icon)
- Widget-Duplikation: Rechtsklick auf Widget → "Duplizieren" (gleiche Config, neue Position)
- Quick-Add: Doppelklick auf Widget-Typ in Sidebar → automatisch platziert am naechsten freien Platz
- Grid-Linien: Beim Drag-Start subtile Grid-Linien anzeigen (visueller Guide fuer Alignment)
- Drag-Handle: Widgets sollten NUR am Header draggbar sein (nicht im gesamten Body) — sonst interferiert Drag mit Chart-Interaktion (Zoom, Pan)

#### D6/D7: Logic Rule Builder (Nodes und Edges)

**Architektur:** RuleFlowEditor.vue (1465 Zeilen) + RuleNodePalette.vue (532 Zeilen) + RuleConfigPanel.vue (958 Zeilen) + logic.store.ts (544 Zeilen)

```
Pruefpunkte:
[ ] Node aus RuleNodePalette auf Canvas ziehen → Node wird erstellt
[ ] Node auf Canvas repositionieren
[x] Connection-Handle von Node A auf Node B ziehen → Edge wird erstellt
[x] Ungueltige Verbindungen: isValidConnection() in logic.store.ts:454 (P2 ERLEDIGT)
[ ] Edge loeschen: Klick auf Edge → Delete-Button oder Backspace
[ ] Node loeschen: Klick auf Node → Delete-Button oder Backspace
[ ] MiniMap: Zeigt Uebersicht des gesamten Canvas
[ ] Zoom/Pan: Scrollwheel zum Zoomen, Click+Drag auf Canvas zum Pannen
[ ] Snap-to-Grid: Nodes rasten an Grid ein
[ ] Auto-Layout: Bei Import einer Regel → automatische 3-Spalten-Anordnung
[ ] Touch-Support: Funktioniert Node-Drag auf Tablet?
```

**UX-Verbesserungsvorschlaege:**
- Connection-Preview: Beim Drag eines Connection-Handles → Linie zeigt sich in Echtzeit, Ziel-Handle leuchtet gruen (gueltig) oder rot (ungueltig)
- Quick-Connect: Nach Node-Erstellung → automatisch Connection-Modus aktiviert (naechster Klick verbindet)
- Node-Gruppierung: Mehrere Nodes selektieren (Shift+Click oder Lasso) → gemeinsam verschieben
- ~~Undo/Redo (P1): Ctrl+Z fuer letzten Schritt~~ **ERLEDIGT** — logic.store.ts hat undo()/redo()/canUndo/canRedo implementiert (Command Pattern, Zeilen 370-537)

### 2.3 DnD-Store-Analyse: dragState.store.ts

Der `dragState.store.ts` (447 Zeilen) ist der zentrale Store fuer komponentenuebergreifenden Drag-State. Er verwaltet:

```
dragState:
  isDraggingSensor: boolean
  isDraggingActuator: boolean
  isDraggingESP: boolean
  isDraggingWidget: boolean
  dragPayload: { type, data }
  dropTargets: Map<string, DropTarget>
  stats: { dragCount, dropCount, cancelCount }
```

**Pruefpunkte fuer den Agent:**
```
[ ] Werden alle DnD-Bereiche (D1-D7) korrekt durch dragState getrackt?
[ ] Wird der State zurueckgesetzt wenn Drag abbricht? (isDragging* → false)
[ ] Gibt es Race-Conditions bei schnellem Drag-Cancel-Drag?
[ ] Werden Drop-Targets korrekt registriert/deregistriert bei Komponentenwechsel?
[ ] Memory-Leaks: Werden Event-Listener in onUnmounted() aufgeraeumt?
```

---

## TEIL 3: Struktur- und Design-Anforderungen

### 3.1 Architektur-Prinzipien die beibehalten werden MUESSEN

| Prinzip | Beschreibung | Warum |
|---------|-------------|-------|
| **Serverzentrisch** | ESP32 → MQTT → Backend → WebSocket → Frontend. Frontend verbindet sich NIE direkt mit MQTT oder DB | Sicherheit, Validierung, Single Source of Truth |
| **Dispatcher-Pattern** | esp.store.ts empfaengt ALLE WebSocket-Events und delegiert an spezialisierte Stores | Entkopplung, ein Einstiegspunkt fuer alle Echtzeit-Daten |
| **SlideOver-Pattern** | Konfiguration IMMER als SlideOver von rechts (nicht Modal, nicht Inline) | Konsistenz, User kann Kontext im Hintergrund sehen |
| **CSS-Token-System** | Alle Farben ueber var(--color-*) aus tokens.css, Zugriff in JS ueber cssTokens.ts | Wartbarkeit, einheitliches Erscheinungsbild |
| **Route-basierte Navigation** | Views ueber Router, nicht ueber Composable-State. URL spiegelt Zustand wider | Browser-Back, Deep-Links, Bookmarks |
| **GridStack fuer Dashboard** | GridStack.js ist die Layout-Engine fuer CustomDashboardView (723 Zeilen). Nicht ersetzen | Stabilitaet, bereits integriert und getestet |
| **Vue Flow fuer Logic** | @vue-flow/core ist die Layout-Engine fuer RuleFlowEditor.vue (1465 Zeilen). Node-Editor mit isValidConnection, Undo/Redo | Stabilitaet, bereits integriert |

### 3.2 Design-System — Bestehende Bausteine

**9 Primitives** (in `src/shared/design/primitives/`):
- BaseBadge, BaseButton, BaseCard, BaseInput, BaseModal, BaseSelect, BaseSkeleton, BaseSpinner, BaseToggle

**5 Patterns** (in `src/shared/design/patterns/`):
- ConfirmDialog, ContextMenu, EmptyState, ErrorState, ToastContainer

**3 Layouts** (in `src/shared/design/layout/`):
- AppShell, Sidebar, TopBar

**Neue Komponenten aus Phase 1+2+3:**
- ColorLegend.vue, ViewTabBar.vue, WidgetWrapper.vue, 4 Widget-Komponenten
- Orbital-Split: SensorColumn, ActuatorColumn, ConnectionLines, AnalysisDropZone, SensorSatellite, ActuatorSatellite, SensorValueCard, GpioPicker, LiveDataPreview, DeviceHeaderBar, ZoneAssignmentDropdown, PendingDevicesPanel
- Rules: RuleFlowEditor (1465 Zeilen), RuleConfigPanel (958 Zeilen), RuleTemplateCard (119 Zeilen)

**Tokens** (tokens.css — Dark-Only Theme):
```css
/* Status-Farben */
--color-success: #34d399    /* gruen — OK */
--color-warning: #fbbf24    /* gelb — Warnung */
--color-error: #f87171      /* rot — Fehler */
--color-info: #60a5fa       /* blau — Info */
--color-mock: #a78bfa       /* violett — Test-Geraet */
--color-real: #22d3ee       /* cyan — Hardware-Geraet */

/* Glassmorphism */
--glass-bg, --glass-border, --glass-shadow

/* Spacing: 4px Grid */
/* Radii, Elevations, Z-Index, Typografie */
```

### 3.3 Design-Anforderungen fuer neue Arbeit

#### Widget-Komponenten (MUSS bei Aufgabe B beachtet werden)

Jedes Widget MUSS:
1. **WidgetWrapper.vue** als Container nutzen (Header + Body + Config-Icon + Remove-Button)
2. **Pinia-Zugriff** ueber den bestehenden render() + appContext Mechanismus (wie die 4 vorhandenen Widgets)
3. **WebSocket-reaktiv** sein — Daten kommen ueber den Store, nicht per direktem API-Poll
4. **Responsive innerhalb des Grid** — Widget passt sich an GridStack-Zellengroesse an (min-width/min-height respektieren)
5. **Loading-State** zeigen wenn Daten noch nicht geladen (BaseSkeleton/BaseSpinner)
6. **Error-State** zeigen wenn Datenquelle nicht erreichbar (ErrorState-Pattern)
7. **Config-Drawer** fuer Widget-spezifische Einstellungen (Sensor-Auswahl, Zeitbereich, etc.)

#### ESPOrbitalLayout-Split — IST-Zustand (Stand 2026-02-23)

**WEITGEHEND ERLEDIGT:** Die 3913-Zeilen-Monolith wurde auf 23 Sub-Komponenten in `components/esp/` (flat) aufgeteilt.

IST-Struktur (abweichend von Plan — flat statt nested `orbital/`):
```
components/esp/
  ESPOrbitalLayout.vue          (633 Zeilen — Ziel <500 NICHT erreicht)
  SensorColumn.vue              ✅
  ActuatorColumn.vue            ✅
  AnalysisDropZone.vue          (849 Zeilen — statt OrbitalCenter)
  ConnectionLines.vue           (401 Zeilen) ✅
  AddSensorModal.vue            (416 Zeilen — statt AddSensorFlow)
  AddActuatorModal.vue          (statt AddActuatorFlow)
  SensorConfigPanel.vue         (896 Zeilen)
  ActuatorConfigPanel.vue       (692 Zeilen)
  SensorSatellite.vue           (725 Zeilen)
  ActuatorSatellite.vue         (345 Zeilen)
  SensorValueCard.vue           (538 Zeilen)
  GpioPicker.vue                (723 Zeilen)
  ESPCard.vue                   (1751 Zeilen — groesste Komponente!)
  ESPSettingsSheet.vue          (1413 Zeilen)
  ESPConfigPanel.vue            (421 Zeilen)
  ZoneConfigPanel.vue
  PendingDevicesPanel.vue       (897 Zeilen)
  DeviceHeaderBar.vue
  ZoneAssignmentDropdown.vue
  LiveDataPreview.vue
  DeviceDetailView.vue
  EditSensorModal.vue
```

Verbleibende Optimierungen:
- ESPOrbitalLayout.vue von 633 → <500 Zeilen reduzieren
- ESPCard.vue (1751 Zeilen) ist der neue Monolith → sollte aufgeteilt werden
- ESPSettingsSheet.vue (1413 Zeilen) ebenso
- 500-Zeilen-Ziel fuer AnalysisDropZone (849), SensorConfigPanel (896), PendingDevicesPanel (897)

#### Responsive-Breakpoints (MUSS bei Aufgabe E beachtet werden)

| Viewport | Breite | Verhalten |
|----------|--------|-----------|
| Desktop | >=1280px | Volles Layout, Sidebar permanent, alle Features |
| Laptop | 1024-1279px | Sidebar collapsible, Content volle Breite |
| Tablet | 768-1023px | Sidebar Overlay, Widgets 2-spaltig statt 4-spaltig |
| Mobile | <768px | Sidebar Hamburger, Widgets 1-spaltig, Orbital → Accordion-Liste |

### 3.4 Farb-System — Was bewusst NICHT tokenisiert ist

Die ~30 Dateien mit verbleibenden Hex-Farben sind KEIN Bug:
- **Chart-Palette-Farben:** Individuelle Linien in Multi-Sensor-Charts brauchen 10+ unterschiedliche Farben — nicht im Token-System
- **rgba()-Transparenzen:** Glassmorphism-Overlays und Zone-Highlights
- **Tailwind-Klassen:** `bg-green-500/20` etc. — sind bereits tokenisiert ueber Tailwind-Config
- **Custom Accent-Farben:** Pink, Orange fuer spezielle UI-Elemente die kein Status-Mapping haben

---

## TEIL 4: Verbleibende 4 Widget-Typen — Spezifikation

### 4.1 HistoricalChartWidget

**Zweck:** Historische Sensor-Daten ueber waehlbaren Zeitraum
**Min-Groesse:** 6x4 (6 Spalten, 4 Reihen = 320px)

```
Config:
  sensorId: string (Dropdown mit allen Sensoren)
  timeRange: '1h' | '6h' | '24h' | '7d' (Default: 24h)
  showThresholds: boolean (Default: true)

Datenquelle:
  API: GET /v1/sensors/data?esp_id=...&gpio=...&start_time=...&end_time=...&limit=1000
  Live-Ergaenzung: sensor_data WebSocket-Event (neue Punkte am rechten Rand anhaengen)

UI:
  - TimeRangeSelector-Buttons oben (1h/6h/24h/7d)
  - HistoricalChart.vue als innere Komponente
  - Threshold-Linien wenn showThresholds=true
  - Tooltip mit exaktem Wert + Zeitstempel beim Hover
  - Leerer Zustand: "Keine Daten fuer den gewaehlten Zeitraum"
```

### 4.2 ESPHealthWidget

**Zweck:** Uebersicht aller ESP-Geraete mit Verbindungsstatus
**Min-Groesse:** 4x3

```
Config:
  zoneFilter: string | null (Dropdown: Alle Zonen / bestimmte Zone)
  showOfflineOnly: boolean (Default: false)

Datenquelle:
  Store: useEspStore().devices
  WebSocket: esp_health Events

UI:
  - Kompakte Liste aller ESPs
  - Pro ESP: Name, Status-Dot (gruen/rot/grau), RSSI-Balken (1-5), Uptime
  - Sortierung: Offline zuerst, dann nach Name
  - Klick auf ESP → navigiert zu /hardware/:zoneId/:espId
  - Summary-Bar oben: "12 Online / 2 Offline / 1 Warning"
  - Leerer Zustand: "Keine ESPs registriert"
```

### 4.3 AlarmListWidget

**Zweck:** Aktive Alarme und juengste Warnungen
**Min-Groesse:** 4x4

```
Config:
  maxItems: number (Default: 20)
  showResolved: boolean (Default: false)
  zoneFilter: string | null

Datenquelle:
  Store: useEspStore().devices → sensors mit quality === 'alarm' oder 'warning'
  WebSocket: sensor_health, actuator_alert Events

UI:
  - Chronologische Liste (neueste oben)
  - Pro Alarm-Eintrag:
    - Farb-Indikator (rot=Alarm, gelb=Warnung)
    - Sensor-Name + Wert + Schwellwert ("pH: 4.2 < 5.0")
    - Zone + Subzone
    - Zeitstempel ("vor 3 Min")
  - Klick auf Eintrag → oeffnet SensorConfigPanel
  - Badge im Widget-Header: Anzahl aktiver Alarme
  - Leerer Zustand: "Keine aktiven Alarme — alles im gruenen Bereich"
```

### 4.4 ActuatorRuntimeWidget

**Zweck:** Laufzeit-Statistik der Aktoren (letzte 24h)
**Min-Groesse:** 3x3

```
Config:
  zoneFilter: string | null
  actuatorFilter: string | null (einzelner Aktor oder alle)
  timeRange: '24h' | '7d' (Default: 24h)

Datenquelle:
  Store: useEspStore().devices → actuators
  API: Falls Backend-Endpoint fuer Aktor-Laufzeit-Stats existiert
  WebSocket: actuator_status Events (On/Off-Wechsel tracken)

UI:
  - StatusBarChart.vue als Basis (Horizontal-Balken)
  - Pro Aktor: Name + Balken (Laufzeit / Max-Laufzeit)
  - Farbkodierung: Gruen (<50% Max), Gelb (50-80% Max), Rot (>80% Max)
  - Tooltip: Exakte Laufzeit + Letzter Befehl + Quelle (Manual/Rule)
  - Leerer Zustand: "Keine Aktoren konfiguriert"
```

---

## TEIL 5: Pruefauftraege — Was der Agent jetzt tun soll

### Auftrag A: ESPOrbitalLayout aufteilen — **WEITGEHEND ERLEDIGT**

Der Monolith (3913 Zeilen) wurde auf 23 Sub-Komponenten in `components/esp/` aufgeteilt.
ESPOrbitalLayout.vue ist jetzt 633 Zeilen.

**Verbleibende Arbeit:**
1. ESPOrbitalLayout.vue von 633 → <500 Zeilen reduzieren
2. ESPCard.vue (1751 Zeilen) als neuen Monolith aufteilen
3. ESPSettingsSheet.vue (1413 Zeilen) aufteilen
4. Grosse Sub-Komponenten (>800 Zeilen) refactoren: AnalysisDropZone, SensorConfigPanel, PendingDevicesPanel

**Akzeptanzkriterien:**
- [x] ESPOrbitalLayout.vue massiv reduziert (3913 → 633)
- [ ] ESPOrbitalLayout.vue unter 500 Zeilen (noch 133 Zeilen zu viel)
- [x] Sub-Komponenten erstellt (23 Dateien in `components/esp/`)
- [ ] Keine Komponente ueber 500 Zeilen (6 Komponenten ueberschreiten das Ziel)
- [x] DnD fuer Sensor/Aktor-Hinzufuegen funktioniert weiterhin
- [x] Charts im Orbital-Center funktionieren weiterhin
- [x] Connection-Lines (SVG) rendern korrekt

### Auftrag B: 4 verbleibende Widget-Typen implementieren

1. HistoricalChartWidget.vue gemaess 4.1
2. ESPHealthWidget.vue gemaess 4.2
3. AlarmListWidget.vue gemaess 4.3
4. ActuatorRuntimeWidget.vue gemaess 4.4
5. Alle 4 in `dashboard-widgets/` ablegen
6. Widget-Registry in CustomDashboardView aktualisieren

**Akzeptanzkriterien:**
- [ ] 8 von 8 Widget-Typen rendern echte Daten (keine Platzhalter mehr)
- [ ] Alle Widgets aktualisieren sich ueber WebSocket-Events
- [ ] Widget-Config-Drawer funktioniert (Sensor-/Aktor-Auswahl)
- [ ] Min-Groessen werden von GridStack respektiert
- [ ] `npm run build` erfolgreich

### Auftrag C: Drag-and-Drop Vollpruefung

**Hinweis:** D7 (Connection-Validierung) ist durch P2 (isValidConnection) bereits ERLEDIGT.

1. JEDEN DnD-Bereich (D1-D6) aus TEIL 2 systematisch durchgehen
2. Checklisten-Punkte abarbeiten
3. UX-Verbesserungsvorschlaege bewerten und wo sinnvoll implementieren
4. Mindestens implementieren:
   - Drop-Zone-Highlighting bei ESP Zone-Assignment (D1)
   - Drag-Handle NUR am Widget-Header im Dashboard (D3) — falls noch nicht implementiert
   - Undo-Toast nach ESP Zone-Wechsel (D1)
5. Ergebnis als Bericht dokumentieren

**Akzeptanzkriterien:**
- [ ] Alle DnD-Bereiche funktionieren korrekt (keine Regression)
- [ ] Drop-Zonen visuell hervorgehoben beim Drag
- [ ] Dashboard-Widgets NUR am Header draggbar (nicht im Body — Charts brauchen Maus-Interaktion)
- [ ] dragState.store.ts (447 Zeilen) raeumt States korrekt auf bei Drag-Cancel
- [ ] Keine Memory-Leaks in DnD-Event-Listenern
- [x] Connection-Validierung in Logic Builder (D7/P2) — isValidConnection() implementiert

### Prioritaets-Reihenfolge (aktualisiert)

1. **Auftrag B** (4 Widgets) — hoechste Wirkung, Dashboard ist der User-Facing-Bereich. **OFFEN**
2. **Auftrag C** (DnD-Pruefung) — UX-Qualitaet sicherstellen. **OFFEN** (D7 erledigt)
3. **Auftrag A** (Orbital-Split Feinschliff) — Code-Qualitaet. **WEITGEHEND ERLEDIGT**, nur noch Feinschliff (>500-Zeilen Komponenten)
4. **Cleanup:** DashboardView.vue (Orphan) + useZoomNavigation.ts loeschen

---

## TEIL 6: Referenzen

### Life-Repo

| Datei | Inhalt |
|-------|--------|
| `arbeitsbereiche/automation-one/auftrag-frontend-ux-konsolidierung.md` | Original-Auftrag (Phase 1-3, 10 Aufgaben) |
| `arbeitsbereiche/automation-one/auftrag-dashboard-redesign.md` | Urspruenglicher Redesign-Plan (8 Teile) |
| `arbeitsbereiche/automation-one/Dashboard_analyse.md` | Vollstaendige Frontend-Analyse (2026-02-22) |
| `arbeitsbereiche/automation-one/STATUS.md` | Aktueller Stand (Frontend 90%) |
| `arbeitsbereiche/automation-one/roadmap.md` | Entwicklungsplan |
| `wissen/iot-automation/iot-dashboard-design-best-practices-2026.md` | Dashboard-UX-Recherche (18 Quellen) |

### Auto-One Repo

| Pfad | Relevanz |
|------|---------|
| `El Frontend/src/views/CustomDashboardView.vue` | Dashboard-Builder (723 Zeilen, GridStack.js, 4/8 Widget-Typen als Vue-Komponenten) |
| `El Frontend/src/views/DashboardView.vue` | **ORPHAN** (955 Zeilen) — nicht geroutet, Cleanup ausstehend |
| `El Frontend/src/components/dashboard-widgets/` | 5 Dateien: WidgetWrapper + 4 Widget-Komponenten (4 weitere fehlen) |
| `El Frontend/src/components/esp/` | 23 Dateien nach Orbital-Split (ESPOrbitalLayout 633 Zeilen) |
| `El Frontend/src/components/rules/` | 5 Dateien: RuleCard, RuleConfigPanel, RuleFlowEditor, RuleNodePalette, RuleTemplateCard |
| `El Frontend/src/shared/stores/dragState.store.ts` | Zentraler DnD-State (447 Zeilen) |
| `El Frontend/src/shared/stores/logic.store.ts` | Logic Rules mit Undo/Redo + isValidConnection (544 Zeilen) |
| `El Frontend/src/shared/stores/dashboard.store.ts` | Dashboard-Layouts + Widget-Typen (259 Zeilen) |
| `El Frontend/src/utils/cssTokens.ts` | CSS-Token Runtime-Zugriff |
| `El Frontend/src/components/common/ViewTabBar.vue` | Tab-Navigation (genutzt in 3 Views) |
| `El Frontend/src/components/common/ColorLegend.vue` | Farb-Legende |
| `El Frontend/src/styles/tokens.css` | Design-Tokens |
| `El Frontend/src/router/index.ts` | Route-Konfiguration (246 Zeilen, `/` → `/hardware`, Legacy-Redirects) |
