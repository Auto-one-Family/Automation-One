# QuickActionBall (FAB) — Vollstaendige IST-Analyse

**Datum:** 2026-03-07
**Analyst:** Claude (Frontend + Server Development Skill)
**Scope:** Reiner Analyse-Auftrag — kein Code geaendert

---

## 1. Architektur

### 1.1 Datei-Inventar (mit Zeilenzahlen)

| Datei | Zeilen | Beschreibung |
|-------|--------|-------------|
| `src/composables/useQuickActions.ts` | 278 | Route-Watcher + Action-Builder (Context + Global) |
| `src/shared/stores/quickAction.store.ts` | 173 | Pinia Store: Menu-State, Panels, Alert-Badge |
| `src/components/quick-action/QuickActionBall.vue` | 313 | Haupt-FAB-Komponente (Button + Panel-Routing) |
| `src/components/quick-action/QuickActionMenu.vue` | 240 | Menu-Panel (Context + Widget-Strip + Global) |
| `src/components/quick-action/QuickActionItem.vue` | 150 | Einzelnes Menu-Item (Icon + Label + Badge) |
| `src/components/quick-action/QuickAlertPanel.vue` | 926 | Alert-Sub-Panel (Top-5, Ack/Resolve/Snooze) |
| `src/components/quick-action/QuickNavPanel.vue` | 345 | Navigation-Sub-Panel (MRU + Favoriten + Search) |
| `src/components/quick-action/QuickWidgetPanel.vue` | 344 | Widget-Katalog-Sub-Panel (9 Typen, DnD) |
| `src/components/quick-action/QuickDashboardPanel.vue` | 416 | Dashboard-Hub-Sub-Panel (Cross-Zone + Zone) |
| `src/composables/useWidgetDragFromFab.ts` | 134 | Widget-DnD-Bridge (HTML5 Drag + GridStack) |
| `src/composables/useNavigationHistory.ts` | 251 | MRU-Tracking (localStorage, 20 Eintraege) |
| **Gesamt** | **3.570** | |

### 1.2 Action-Interface

Definiert in `quickAction.store.ts:19-35`:

```typescript
interface QuickAction {
  id: string                              // z.B. 'global-alerts', 'hw-live-monitor'
  label: string                           // z.B. 'Alert-Panel', 'Live-Monitor'
  icon: Component                         // Lucide-Vue-Next Komponente (markRaw)
  category: 'context' | 'global' | 'navigation'  // Gruppierung im Menu
  handler: () => void | Promise<void>     // Callback bei Klick
  shortcutHint?: string                   // z.B. 'Ctrl+K' (nur Anzeige)
  disabled?: boolean                      // Greyed out + cursor: not-allowed
  badge?: number                          // Dynamischer Zaehler
  badgeVariant?: 'critical' | 'warning' | 'info'  // Badge-Farbgebung
}
```

**Zusaetzliche Types:**

```typescript
type ViewContext = 'hardware' | 'monitor' | 'logic' | 'system-monitor'
                 | 'editor' | 'settings' | 'sensors' | 'plugins' | 'other'

type QuickActionPanel = 'menu' | 'alerts' | 'navigation' | 'widgets' | 'dashboards'
```

### 1.3 Registrierungs-Mechanismus

**Pattern:** Watcher-basiert (kein Registry)

1. `useQuickActions()` wird in `QuickActionBall.vue` aufgerufen (einmalig, im AppShell)
2. Ein `watch()` auf `route.path` loest bei jeder Navigation aus
3. `resolveViewContext(path)` mappt den Pfad auf einen `ViewContext` (startsWith-Matching)
4. `buildContextActions(view, router, store)` erstellt per `switch/case` die Context-Actions
5. `buildGlobalActions(router, store, uiStore)` erstellt die Global-Actions (immer gleich)
6. Beide Arrays werden per `store.setContextActions()` / `store.setGlobalActions()` gesetzt

**Wichtig:** Global Actions werden bei JEDEM Route-Wechsel komplett neu erstellt (keine Referenz-Stabilitaet). Das ist funktional korrekt, aber nicht optimal fuer Performance.

### 1.4 Store-Struktur

**State:**

| Property | Typ | Default | Beschreibung |
|----------|-----|---------|-------------|
| `isMenuOpen` | `ref<boolean>` | `false` | FAB-Menu offen/geschlossen |
| `activePanel` | `ref<QuickActionPanel>` | `'menu'` | Aktuelles Sub-Panel |
| `currentView` | `ref<ViewContext>` | `'other'` | Aktuelle View-Erkennung |
| `contextActions` | `ref<QuickAction[]>` | `[]` | Seitenspezifische Actions |
| `globalActions` | `ref<QuickAction[]>` | `[]` | Globale Actions |

**Computed:**

| Property | Typ | Beschreibung |
|----------|-----|-------------|
| `alertSummary` | `{ unreadCount, highestSeverity, badgeText }` | ISA-18.2: alertCenter > notificationInbox Fallback |
| `hasActiveAlerts` | `boolean` | `unreadCount > 0` |
| `isCritical` | `boolean` | `highestSeverity === 'critical'` |
| `isWarning` | `boolean` | `highestSeverity === 'warning'` |
| `allActions` | `QuickAction[]` | `[...contextActions, ...globalActions]` |

**Actions:**

| Method | Beschreibung |
|--------|-------------|
| `toggleMenu()` | Oeffnen oder schliessen (closeMenu resettet activePanel) |
| `openMenu()` | Nur oeffnen |
| `closeMenu()` | Schliessen + `activePanel = 'menu'` |
| `setActivePanel(panel)` | Panel setzen + Menu oeffnen wenn geschlossen |
| `setViewContext(view)` | ViewContext aktualisieren |
| `setContextActions(actions)` | Context-Actions setzen |
| `setGlobalActions(actions)` | Global-Actions setzen |
| `executeAction(actionId)` | Action finden + ausfuehren; schliesst Menu nur wenn Handler kein Panel oeffnet |

---

## 2. Globale Quick Actions

### 2.1 Implementierte Global Actions

| # | Action-ID | Label | Icon | Handler | Badge | Status |
|---|-----------|-------|------|---------|-------|--------|
| G1 | `global-alerts` | Alert-Panel | `Bell` | `store.setActivePanel('alerts')` — oeffnet QuickAlertPanel | Dynamisch: `store.alertSummary.unreadCount` (aus alertCenter/inbox), Variant: critical/warning/info | **Funktioniert** |
| G2 | `global-navigation` | Navigation | `Navigation` | `store.setActivePanel('navigation')` — oeffnet QuickNavPanel | Kein Badge | **Funktioniert** |
| G3 | `global-emergency` | Emergency Stop | `ShieldAlert` | `window.dispatchEvent(new CustomEvent('emergency-stop-trigger'))` | Kein Badge | **Funktioniert** (Event-basiert, EmergencyStopButton muss lauschen) |
| G4 | `global-search` | Quick-Search | `Search` | `uiStore.toggleCommandPalette()` | Kein Badge | **Funktioniert**, shortcutHint: `Ctrl+K` |
| G5 | `global-diagnose` | Diagnose starten | `Stethoscope` | Lazy-Import `diagnosticsStore.runDiagnostic()` | Kein Badge | **Funktioniert** |
| G6 | `global-last-report` | Letzter Report | `FileText` | `nav(router, '/system-monitor?tab=reports')` | Kein Badge | **Funktioniert** |
| G7 | `global-backup-create` | Backup erstellen | `Database` | Lazy-Import `backupsApi.createBackup()` | Kein Badge | **Funktioniert** (Fehler via API-Interceptor/Toast) |

**Anzahl:** 7 Global Actions

### 2.2 Fehlende Global Actions (Empfehlungen)

| # | Vorschlag | Icon | Begruendung | Prioritaet |
|---|-----------|------|-------------|-----------|
| F1 | System-Status (Health-Check) | `HeartPulse` | Schnellzugriff auf System-Gesundheit, ohne /system-monitor zu oeffnen. Koennnte in globalem Badge die Health-Farbe zeigen (gruen/gelb/rot) | Mittel |
| F2 | Notification-Drawer oeffnen | — | Bereits via `global-alerts` Footer ("Alle Alerts anzeigen") erreichbar. Alert-Panel ist die kompakte Version, Drawer ist die volle Ansicht. Kein separater Global-Action noetig | Nicht noetig |
| F3 | Dark Mode Toggle | — | Dark Theme ONLY (kein Light Mode implementiert). Nicht relevant | Nicht relevant |
| F4 | Sprache wechseln | — | Kein i18n vorhanden, hardcoded German. Nicht relevant | Nicht relevant |

---

## 3. Seitenspezifische Quick Actions

### 3.1 HardwareView (/hardware)

**ViewContext:** `'hardware'` (resolveViewContext: `path.startsWith('/hardware')`)

**Context Actions (2 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| H1 | `hw-live-monitor` | Live-Monitor | `Activity` | `nav(router, '/monitor')` | Cross-Link zum Monitor |
| H2 | `hw-widget-insert` | Widget hinzufuegen | `LayoutGrid` | `store.setActivePanel('widgets')` | Oeffnet QuickWidgetPanel |

**Level-Unterscheidung:** KEINE. Der Code prueft `path.startsWith('/hardware')` ohne Unterscheidung zwischen L1 (/hardware), L2 (/hardware/:zoneId), und L3 (/hardware/:zoneId/:espId). Alle 3 Levels zeigen die gleichen 2 Context Actions.

**Sub-Panels verfuegbar:**
- QuickWidgetPanel: Ja (via H2), aber zeigt Hint "Wechsle zum Dashboard Editor" wenn NICHT auf /editor
- QuickAlertPanel: Ja (via global-alerts)
- QuickNavPanel: Ja (via global-navigation)
- QuickDashboardPanel: Nein (kein Context-Action dafuer registriert)

**Fehlende Actions:**
- Zone erstellen/bearbeiten
- Device suchen (Ctrl+K deckt das ab)
- Pending Devices anzeigen (SlideOver)
- Zwischen Zonen wechseln

### 3.2 MonitorView (/monitor)

**ViewContext:** `'monitor'` (resolveViewContext: `path.startsWith('/monitor')`)

**Context Actions (1 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| M1 | `mon-dashboards` | Dashboards | `LayoutDashboard` | `store.setActivePanel('dashboards')` | Oeffnet QuickDashboardPanel |

**Level-Unterscheidung:** KEINE. Gleiche Action fuer /monitor (L1), /monitor/:zoneId (L2), /monitor/:zoneId/sensor/:sensorId (L3), und /monitor/dashboard/:dashboardId.

**Sub-Panels verfuegbar:**
- QuickDashboardPanel: Ja (via M1)
- QuickAlertPanel: Ja (via global-alerts)
- QuickNavPanel: Ja (via global-navigation)
- QuickWidgetPanel: Ja (via QuickActionMenu, `isWidgetCapableView` ist `true` fuer 'monitor')

**Fehlende Actions:**
- Zeitraum-Filter setzen (1h, 24h, 7d)
- CSV-Export (L3)
- Zone wechseln (L1→L2)
- Dashboard erstellen fuer aktuelle Zone (L2)

### 3.3 Dashboard Editor (/editor)

**ViewContext:** `'editor'` (resolveViewContext: `path.startsWith('/editor')`)

**Context Actions (1 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| E1 | `editor-add-widget` | Widget hinzufuegen | `LayoutGrid` | `store.setActivePanel('widgets')` | Oeffnet QuickWidgetPanel |

**Modus-Unterscheidung:** KEINE. Gleiche Action ob kein Dashboard geladen, Edit-Modus, oder View-Modus.

**Sub-Panels verfuegbar:**
- QuickWidgetPanel: Ja (via E1), zeigt vollen Widget-Katalog weil `isOnEditor = true`
- QuickAlertPanel: Ja (via global-alerts)
- QuickNavPanel: Ja (via global-navigation)
- QuickDashboardPanel: Nein (kein Context-Action dafuer)

**Fehlende Actions:**
- Dashboard speichern
- Layout exportieren/importieren
- Dashboard-Vorlagen oeffnen
- Dashboard loeschen

### 3.4 LogicView (/logic)

**ViewContext:** `'logic'` (resolveViewContext: `path.startsWith('/logic')`)

**Context Actions (1 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| L1 | `logic-execution-log` | Ausfuehrungslog | `FileText` | `nav(router, '/system-monitor?tab=events')` | Cross-Link zum Events-Tab |

**Editor-Unterscheidung:** KEINE. Gleiche Action ob auf Landing-Page (/logic) oder im Rule-Editor (/logic/:ruleId).

**Fehlende Actions:**
- Neue Regel erstellen
- Regel speichern (Editor)
- Undo/Redo (Editor — existiert per Keyboard, aber kein FAB-Zugang)
- Alle Regeln deaktivieren
- Node hinzufuegen (Editor)

### 3.5 SystemMonitorView (/system-monitor)

**ViewContext:** `'system-monitor'` (resolveViewContext: `path.startsWith('/system-monitor')`)

**Context Actions (3 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| S1 | `sys-log-search` | Log-Suche | `Search` | `nav(router, '/system-monitor?tab=logs')` | Navigiert zum Logs-Tab |
| S2 | `sys-health-check` | Health-Check | `Cpu` | `nav(router, '/system-monitor?tab=health')` | Navigiert zum Health-Tab |
| S3 | `ctx-full-diagnostic` | Volle Diagnose | `Stethoscope` | `diagnosticsStore.runDiagnostic()` | Startet Diagnose-Lauf |

**Tab-Unterscheidung:** KEINE. Alle 7 Tabs (events, logs, database, mqtt, health, diagnostics, reports) zeigen die gleichen 3 Context Actions.

**Fehlende tab-spezifische Actions:**
- Database-Tab: Backup erstellen (bereits global, aber hier kontextuell sinnvoll)
- MQTT-Tab: MQTT-Subscribe, Topic-Suche
- Events-Tab: Event-Filter-Presets
- Reports-Tab: Neuen Report erstellen/exportieren

### 3.6 SensorsView (/sensors)

**ViewContext:** `'sensors'` (resolveViewContext: `path.startsWith('/sensors')`)

**Context Actions (1 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| SE1 | `sensors-live-monitor` | Live-Monitor | `Activity` | `nav(router, '/monitor')` | Cross-Link zum Monitor |

**Fehlende Actions:**
- Sensor suchen/filtern
- Zur Hardware-Konfiguration springen
- Schema-Ansicht wechseln

### 3.7 PluginsView (/plugins)

**ViewContext:** `'plugins'` (resolveViewContext: `path.startsWith('/plugins')`)

**Context Actions (1 Stueck):**

| # | Action-ID | Label | Icon | Handler | Beschreibung |
|---|-----------|-------|------|---------|-------------|
| P1 | `ctx-healthcheck` | HealthCheck ausfuehren | `HeartPulse` | `pluginsStore.executePlugin('health_check')` | Fuehrt HealthCheck-Plugin aus |

**Status:** **Funktioniert** (Lazy-Import, Plugin muss 'health_check' ID haben)

### 3.8 SettingsView (/settings)

**ViewContext:** `'settings'` (resolveViewContext: `path.startsWith('/settings')`)

**Context Actions:** KEINE (0 Stueck). Der `switch/case` in `buildContextActions` hat keinen `case 'settings'` Block. Faellt in `default: return []`.

**Fehlende Actions:**
- Profil bearbeiten
- Notification-Einstellungen
- System-Config oeffnen

### 3.9 UsersView (/users)

**ViewContext:** `'other'` (resolveViewContext hat keinen Check fuer `/users`)

**Context Actions:** KEINE (0 Stueck). Faellt in `default: return []`.

**Fehlende Actions:**
- Benutzer hinzufuegen
- Rollen verwalten

### 3.10 CalibrationView (/calibration)

**ViewContext:** `'other'` (resolveViewContext hat keinen Check fuer `/calibration`)

**Context Actions:** KEINE (0 Stueck). Faellt in `default: return []`.

**Fehlende Actions:**
- Kalibrierung starten
- Sensor waehlen
- Letzte Ergebnisse anzeigen

### 3.11 MaintenanceView (/maintenance)

**Route:** Redirect zu `/system-monitor?tab=health` (kein eigener View mehr seit Phase 4D).

**ViewContext:** `'system-monitor'` (nach Redirect). Zeigt die SystemMonitor Context-Actions (S1-S3).

### 3.12 DashboardView (/) — Root/Home

**ViewContext:** `'other'` (resolveViewContext hat keinen Check fuer `/` — NUR `startsWith('/hardware')` etc.)

**Context Actions:** KEINE (0 Stueck). Faellt in `default: return []`.

**Anmerkung:** Die Hauptseite (Dashboard) hat keine kontextspezifischen Quick Actions. Nur die 7 Global Actions sind verfuegbar.

### 3.13 EmailPostfachView (/email)

**ViewContext:** `'other'`

**Context Actions:** KEINE (0 Stueck).

### 3.14 SystemConfigView (/system-config)

**ViewContext:** `'other'`

**Context Actions:** KEINE (0 Stueck).

### 3.15 LoadTestView (/load-test)

**ViewContext:** `'other'`

**Context Actions:** KEINE (0 Stueck).

---

## 4. Sub-Panel-Verfuegbarkeits-Matrix

Sub-Panels sind technisch auf JEDER Seite verfuegbar, weil sie ueber Global Actions (AlertPanel, NavPanel) oder Context Actions (WidgetPanel, DashboardPanel) geoeffnet werden.

**Legende:**
- **G** = Via Global Action (immer verfuegbar)
- **C** = Via Context Action (seitenspezifisch)
- **M** = Via QuickActionMenu Widget-Strip (automatisch bei editor/monitor Views)
- **—** = Nicht verfuegbar (keine Action fuehrt zum Panel)

| View/Route | AlertPanel | NavigationPanel | WidgetPanel | DashboardPanel |
|------------|:---------:|:---------------:|:-----------:|:--------------:|
| / (Dashboard) | G | G | — | — |
| /hardware (L1) | G | G | C | — |
| /hardware/:zoneId (L2) | G | G | C | — |
| /hardware/:zoneId/:espId (L3) | G | G | C | — |
| /monitor (L1) | G | G | M | C |
| /monitor/:zoneId (L2) | G | G | M | C |
| /monitor/:zoneId/sensor/:sensorId (L3) | G | G | M | C |
| /monitor/dashboard/:dashboardId | G | G | M | C |
| /editor | G | G | C | — |
| /editor/:dashboardId | G | G | C | — |
| /logic (Landing) | G | G | — | — |
| /logic/:ruleId (Editor) | G | G | — | — |
| /system-monitor (alle Tabs) | G | G | — | — |
| /sensors | G | G | — | — |
| /plugins | G | G | — | — |
| /settings | G | G | — | — |
| /users | G | G | — | — |
| /calibration | G | G | — | — |
| /email | G | G | — | — |
| /system-config | G | G | — | — |

**Widget-Strip im QuickActionMenu:**

Das QuickActionMenu zeigt einen Widget-DnD-Strip (`isWidgetCapableView`) NUR auf Views mit `currentView === 'editor'` oder `currentView === 'monitor'`. Dieser Widget-Strip ist kompakter als das volle QuickWidgetPanel und direkt im Menu eingebettet (keine separate Panel-Navigation).

**QuickWidgetPanel Verhalten auf Non-Editor-Routes:**

Wenn das QuickWidgetPanel auf einer Non-Editor-Route geoeffnet wird (z.B. /hardware via `hw-widget-insert`), zeigt es einen Hint: "Wechsle zum Dashboard Editor um Widgets per Drag & Drop zu platzieren" mit einem "Zum Editor"-Link.

---

## 5. Lueckenanalyse

### 5.1 Fehlende Actions (pro Seite)

| View | Fehlende Action | Prioritaet | Begruendung |
|------|----------------|-----------|-------------|
| / (Dashboard) | — | — | Hauptnavigation reicht ueber Global Actions |
| /hardware | Zone erstellen | Niedrig | Eher selten, Sidebar ausreichend |
| /hardware | Pending Devices anzeigen | Mittel | Haeufiger Workflow bei Hardware-Setup |
| /monitor L2 | Zeitraum-Filter (1h/24h/7d) | Hoch | Haeufigster Monitor-Workflow |
| /monitor L3 | CSV-Export | Mittel | Nur in SlideOver, FAB waere Abkuerzung |
| /editor | Dashboard speichern | Hoch | Primaere Editor-Aktion fehlt im FAB |
| /editor | Dashboard loeschen | Niedrig | Destruktiv, besser in Toolbar |
| /logic Landing | Neue Regel erstellen | Hoch | Primaere Aktion auf der Landing-Page |
| /logic Editor | Regel speichern | Hoch | Primaere Editor-Aktion |
| /system-monitor | Tab-spezifische Actions | Mittel | Diagnose/Logs/MQTT koennten Tab-sensitiv sein |
| /settings | Notification-Einstellungen | Niedrig | Selten genug fuer Sidebar-Navigation |
| /calibration | Kalibrierung starten | Mittel | Primaere Aktion der View |

### 5.2 Redundanzen

| Global Action | Context Action | View | Gewollt? |
|--------------|---------------|------|---------|
| `global-diagnose` (Stethoscope) | `ctx-full-diagnostic` (Stethoscope) | /system-monitor | **Redundanz.** Gleiche Funktion, gleiches Icon, aehnlicher Label. Beides fuehrt zu `diagnosticsStore.runDiagnostic()`. Context-Version ist kein Mehrwert |
| `global-search` (Search) | `sys-log-search` (Search) | /system-monitor | **Akzeptabel.** Verschiedene Ziele: CommandPalette vs. Log-Tab-Navigation. Aber gleiches Icon (Search) ist verwirrend |
| `global-backup-create` | — | /system-monitor?tab=database | Global Action existiert, aber kein Tab-spezifischer Shortcut. Kein Problem, Global reicht |

### 5.3 Konsistenz-Probleme

**Icon-Konsistenz:**

| Icon | Verwendung 1 | Verwendung 2 | Problem? |
|------|-------------|-------------|---------|
| `Search` | global-search (CommandPalette) | sys-log-search (Log-Tab) | **Ja** — gleiches Icon, verschiedene Ziele |
| `Stethoscope` | global-diagnose | ctx-full-diagnostic | **Ja** — Redundanz, exakt gleiche Funktion |
| `Activity` | hw-live-monitor | sensors-live-monitor | OK — gleiche Funktion (Cross-Link zu /monitor) |
| `LayoutGrid` | hw-widget-insert | editor-add-widget | OK — gleiche Funktion (Widget-Panel) |
| `FileText` | global-last-report | logic-execution-log | OK — verschiedene Ziele, aber gleiches Icon |

**Label-Konsistenz:**

- Labels sind durchgehend Deutsch — **konsistent**
- Format: Kurz (2-3 Woerter) — **konsistent**
- Keine Mischung Deutsch/Englisch in Labels (allerdings "Emergency Stop" ist Englisch) — **kleines Konsistenz-Problem**

**Placeholder/Stub Actions:**

- `global-emergency` Handler: Dispatcht nur ein CustomEvent. Ob `EmergencyStopButton` darauf reagiert, haengt davon ab ob die Komponente gemounted ist und den Event-Listener registriert hat. **Potentiell fragil.**

### 5.4 UX-Probleme

**1. Maximale Action-Anzahl:**

| View | Context | Global | Widget-Strip | Total |
|------|---------|--------|-------------|-------|
| /hardware | 2 | 7 | — | **9** |
| /monitor | 1 | 7 | Widget-Strip (9 Items) | **8 + DnD-Strip** |
| /editor | 1 | 7 | — | **8** |
| /system-monitor | 3 | 7 | — | **10** |
| /plugins | 1 | 7 | — | **8** |
| /logic | 1 | 7 | — | **8** |
| /sensors | 1 | 7 | — | **8** |
| /settings, /users, etc. | 0 | 7 | — | **7** |

**Problem:** System Monitor zeigt 10 Actions (3 Context + 7 Global). Bei 7+ Items wird das Menu lang, aber durch Sektionierung (Context oben, Global unten) bleibt es uebersichtlich.

**2. Sektionierung im Menu:**

Das Menu hat klare Sektionen mit Labels:
- Context-Section: Label zeigt den ViewContext (z.B. "hardware", "monitor")
- Widget-Strip: Nur bei editor/monitor, mit "Widgets" Label und "Auf Dashboard ziehen" Hint
- Global-Section: Label "Global"
- Separatoren (`qa-menu__separator`) zwischen Sektionen

**Gut geloest.** Labels koennten allerdings huebscher sein — z.B. "Hardware" statt raw "hardware".

**3. Responsive / Viewport:**

- FAB ist hidden bei `< 768px` (`@media (max-width: 767px) { display: none }`) — **korrekt laut Spezifikation**
- Zwischen 768-1024px: FAB sichtbar, Menu-Position `bottom: calc(100% + 8px); right: 0` — koennte am unteren Rand abgeschnitten werden bei vielen Actions
- Sub-Panels (Alert, Nav, Widget, Dashboard) haben `max-height: 420px` + `overflow-y: auto` — **korrekt, scrollbar bei Ueberlauf**

**4. Keyboard-Accessibility:**

| Feature | Status |
|---------|--------|
| Escape schliesst Menu | **Ja** (handleEscape in Ball.vue) |
| Click-Away schliesst Menu | **Ja** (handleClickAway in Ball.vue, capture phase) |
| Tab durch Menu-Items | **Teilweise** — Menu-Items sind `<button>` (focusable), aber keine explizite Tab-Reihenfolge oder Focus-Trap |
| Enter/Space auf Widget-Items | **Ja** (handleWidgetKeydown → announceWidget) |
| aria-label auf FAB-Button | **Ja** ("Quick Actions oeffnen/schliessen") |
| aria-expanded | **Ja** (store.isMenuOpen) |
| role="menu" auf QuickActionMenu | **Ja** |
| role="menuitem" auf QuickActionItem | **Ja** |
| Sub-Panels: role="region" + aria-label | **Ja** |
| Focus-Trap im geoeffneten Menu | **Nein** — Tab kann aus dem Menu hinaus navigieren |

**5. Kollisionen:**

- FAB Position: `fixed; bottom: 20px; right: 20px; z-index: var(--z-fab)` — **keine bekannte Kollision** mit Scrollbar, Footer oder anderen Elementen
- Sub-Panels oeffnen nach oben (`bottom: calc(100% + 8px)`) — koennte bei niedriger Viewport-Hoehe (<500px) abgeschnitten werden
- SlideOvers (SensorConfigPanel etc.) haben eigenen z-index — FAB bleibt sichtbar, aber Menu koennte unter SlideOver erscheinen

---

## 6. Zusammenfassung

### 6.1 Statistik

| Kategorie | Anzahl |
|-----------|--------|
| **Global Actions** | 7 |
| **Context Actions** | 10 (ueber 7 Views verteilt) |
| **Sub-Panels** | 5 (Menu, Alerts, Navigation, Widgets, Dashboards) |
| **Views OHNE Context Actions** | 8 (/, /settings, /users, /calibration, /email, /system-config, /load-test + Catch-All) |
| **Views MIT Context Actions** | 7 (hardware, monitor, editor, logic, system-monitor, sensors, plugins) |
| **Widget-Typen im DnD-Katalog** | 9 |
| **Fehlende sinnvolle Actions** | ~12 identifiziert |
| **Redundanzen** | 2 (diagnose, search-icon) |
| **Gesamt Codezeilen** | 3.570 |

### 6.2 Top-5 Empfehlungen

**1. Level/Tab-Awareness einfuehren (HOCH)**

Der FAB unterscheidet NICHT zwischen L1/L2/L3 innerhalb einer View. `resolveViewContext()` nutzt nur `startsWith` ohne Params-Check. Ein `route.params.zoneId` oder `route.query.tab` sollte in den Context einfliessen, um seitenspezifischere Actions zu zeigen:
- Monitor L2: "Dashboard erstellen", "Zone-Regeln anzeigen"
- System Monitor Logs-Tab: "Log herunterladen"
- Logic Editor: "Regel speichern", "Node hinzufuegen"

**2. Redundanz global-diagnose / ctx-full-diagnostic beseitigen (MITTEL)**

Beide fuehren zu `diagnosticsStore.runDiagnostic()`. Die Context-Version auf /system-monitor ist redundant. Entweder:
- Context-Version entfernen (Global reicht)
- Context-Version erweitern (z.B. "Diagnose mit aktuellem Tab-Fokus")

**3. Search-Icon Differenzierung (NIEDRIG)**

`global-search` (CommandPalette) und `sys-log-search` (Log-Tab) nutzen beide das `Search` Icon. Ersetze `sys-log-search` Icon durch `FileSearch` oder `ScrollText` fuer visuelle Differenzierung.

**4. Dashboard-Panel auf Editor-View verfuegbar machen (MITTEL)**

Das QuickDashboardPanel ist nur auf /monitor verfuegbar (via `mon-dashboards`). Auf /editor waere es nuetzlich um schnell zwischen Dashboards zu wechseln, ohne die Toolbar zu nutzen.

**5. Fehlende Primaer-Actions fuer Editor und Logic (HOCH)**

Die wichtigsten Aktionen auf den kreativen Views fehlen:
- Editor: "Dashboard speichern" fehlt als Quick Action
- Logic Landing: "Neue Regel erstellen" fehlt
- Logic Editor: "Regel speichern" fehlt

Diese sind die haeufigsten Nutzer-Aktionen auf diesen Views und sollten als Context Actions hinzugefuegt werden.

---

## Anhang A: Vollstaendige Action-ID-Uebersicht

```
GLOBAL:
  global-alerts          → Panel: alerts
  global-navigation      → Panel: navigation
  global-emergency       → CustomEvent: emergency-stop-trigger
  global-search          → uiStore.toggleCommandPalette()
  global-diagnose        → diagnosticsStore.runDiagnostic()
  global-last-report     → /system-monitor?tab=reports
  global-backup-create   → backupsApi.createBackup()

CONTEXT:
  hw-live-monitor        → /monitor
  hw-widget-insert       → Panel: widgets
  mon-dashboards         → Panel: dashboards
  editor-add-widget      → Panel: widgets
  logic-execution-log    → /system-monitor?tab=events
  sys-log-search         → /system-monitor?tab=logs
  sys-health-check       → /system-monitor?tab=health
  ctx-full-diagnostic    → diagnosticsStore.runDiagnostic()
  ctx-healthcheck        → pluginsStore.executePlugin('health_check')
  sensors-live-monitor   → /monitor
```

## Anhang B: QuickActionBall Einbindung

Der QuickActionBall ist in `AppShell.vue` (Zeile 100) eingebunden:

```vue
<QuickActionBall />
```

Er wird auf JEDER authentifizierten Route gerendert. Ausblendung erfolgt intern:
- `v-if="route.meta.requiresAuth !== false"` — versteckt auf /login und /setup
- `@media (max-width: 767px) { display: none }` — versteckt bei Mobile-Viewport

## Anhang C: Sub-Panel-Detailbeschreibung

### QuickAlertPanel (926 Zeilen)

**Datenquelle:** `notification-inbox.store` (Notifications) + `alert-center.store` (Ack/Resolve)
**Features:**
- Status-Filter: Aktiv / Gesehen / Alle (Chips)
- Batch-Acknowledge (>3 aktive Alerts)
- Alert-Items mit: Severity-Dot, Titel, Zone-Name, Zeitstempel
- Actions pro Alert: Ack (ShieldCheck), Resolve (CheckCheck), Navigate (ExternalLink), Details (Expand)
- Expand-Details: Body, Severity, Source, ESP-ID
- Snooze: 5 Presets (1h, 4h, 24h, 1w, Permanent) mit Countdown-Timer
- Footer: "Alle Alerts anzeigen" → NotificationDrawer
- Max 5 Alerts sichtbar (MAX_ALERTS = 5)

### QuickNavPanel (345 Zeilen)

**Datenquelle:** `useNavigationHistory` Composable (localStorage-backed)
**Features:**
- Quick Search Trigger (Ctrl+K via uiStore.toggleCommandPalette)
- Favoriten-Sektion (Star-Icon, Toggle)
- Zuletzt-Besucht-Sektion (max 5, MRU)
- Nav-Items mit: Icon, Label, Star-Toggle, ChevronRight
- 12 vordefinierte Route-Labels (ROUTE_META)

### QuickWidgetPanel (344 Zeilen)

**Datenquelle:** `useWidgetDragFromFab` Composable (statische WIDGET_DRAG_ITEMS)
**Features:**
- 9 Widget-Typen in 3 Kategorien (Sensoren: 5, Aktoren: 2, System: 2)
- HTML5 Drag-and-Drop (data-gs-* fuer GridStack)
- Keyboard-Alternative: Space/Enter → CustomEvent 'widget-place-announced'
- Non-Editor-Hint: "Wechsle zum Dashboard Editor" + Link
- GripVertical Handle fuer visuelle DnD-Affordance
- focus-visible Outline

### QuickDashboardPanel (416 Zeilen)

**Datenquelle:** `dashboard.store` (layouts, crossZoneDashboards)
**Features:**
- "Neues Dashboard" Button (Plus-Icon im Header)
- Cross-Zone-Dashboards Sektion
- Zone-spezifische Dashboards (gruppiert nach Zone)
- Pro Dashboard: Name, Widget-Count, Auto-Generated Badge (Sparkles)
- View-Link → /monitor/dashboard/:dashboardId
- Edit-Link → /editor/:dashboardId (Pencil Icon, Hover-Reveal)
- Empty State: "Noch keine Dashboards erstellt" + "Dashboard erstellen" Button
