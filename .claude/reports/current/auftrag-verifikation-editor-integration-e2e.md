# AutoOps Debug-Auftrag: E2E-Verifikation "Monitor Ebene 3 — Editor-Integration"

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Typ:** E2E-Verifikation (autoops:debug + Playwright)
> **Fokus:** NUR Editor-Integration — DashboardViewer, Inline/Side-Panels, Target-System, Router, API
> **Status:** OFFEN
> **Report-Output:** `/reports/current/EDITOR_INTEGRATION_E2E_VERIFICATION.md`
> **verify-plan:** 2026-03-01 — 8 Korrekturen, 15 Bugs, 9 fehlende Tests ergaenzt

---

## /verify-plan Ergebnis

**Geprueft gegen:** Router (index.ts), MonitorView.vue, HardwareView.vue, CustomDashboardView.vue,
DashboardViewer.vue, InlineDashboardPanel.vue, dashboard.store.ts, dashboards.ts (API),
dashboard.py (Model), dashboard.py (Schema), dashboards.py (Endpoints), TopBar.vue (Breadcrumbs),
add_dashboard_target_field.py (Migration)

### BUGS (im Code gefunden waehrend Verifikation)

| # | Severity | Komponente | Bug | Quelle |
|---|----------|------------|-----|--------|
| B1 | **HOCH** | `dashboard.store.ts:662` | `generateZoneDashboard()` ruft NICHT `syncLayoutToServer()` auf — auto-generierte Dashboards existieren NUR in localStorage, NICHT in der DB | store Zeile 648-662 |
| B2 | **HOCH** | `dashboard.store.ts:668-677` | `claimAutoLayout()` ruft NICHT `syncLayoutToServer()` auf — "Uebernehmen" schreibt nur localStorage, DB bleibt `auto_generated=true` oder hat keinen Eintrag | store Zeile 668-677 |
| B3 | **HOCH** | `TopBar.vue:84-131` | Breadcrumb fuer `/monitor/dashboard/:dashboardId` FEHLT — Route `monitor-dashboard` hat `dashboardId` param, aber TopBar prueft nur `route.params.zoneId` und `route.params.sensorId`. Ergebnis: Breadcrumb zeigt nur "Monitor" ohne Dashboard-Namen | TopBar Zeile 101-115 |
| B4 | **HOCH** | `TopBar.vue:84-131` | Breadcrumb fuer `/monitor/:zoneId/dashboard/:dashboardId` FEHLT — gleicher Grund. Zeigt "Monitor > {Zone}" aber NICHT den Dashboard-Namen | TopBar Zeile 101-115 |
| B5 | **MITTEL** | `dashboard.store.ts:696-699` | `hardwarePanels` computed filtert ALLE `target.view === 'hardware'` ohne `placement` zu unterscheiden — "Uebersicht — Inline" und "Uebersicht — Side-Panel" waeren identisch, aber es gibt NUR Side-Panel-Rendering in HardwareView | store Zeile 696-699, HardwareView Zeile 908-916 |
| B6 | **MITTEL** | `CustomDashboardView.vue:557-580` | Target-Konfigurator-Dropdown hat KEIN `onClickOutside` — Dropdown schliesst sich NUR durch erneuten Klick auf MapPin oder durch Auswahl einer Option. Klick ausserhalb laesst es offen | CDV Zeile 85-86, 557-580 |
| B7 | **MITTEL** | `CustomDashboardView.vue` | Kein UI-Element zum Setzen von `scope` (zone/cross-zone/sensor-detail) — Der "Im Monitor anzeigen" Button (MonitorPlay) erscheint NUR wenn `layout.scope` gesetzt ist, aber es gibt KEINE Moeglichkeit `scope` manuell zu setzen. Button ist fuer manuell erstellte Dashboards UNERREICHBAR | CDV Zeile 104-127 |
| B8 | **MITTEL** | `dashboard.store.ts:360-412` | Server-Sync Debounce-Timer ist GLOBAL (nicht per-Layout) — bei schnellem Target-Wechsel auf verschiedenen Dashboards wird nur das letzte synchronisiert | store Zeile 360 `_saveDebounceTimer` |
| B9 | **NIEDRIG** | `DashboardViewer.vue:154` | Editor-Link nutzt `layout.id` statt `layout.serverId` — fuer lokale Layouts (Format `dash-*`) funktioniert der Deep-Link nach Page-Reload nicht, weil `fetchLayouts()` Server-UUIDs bringt | DV Zeile 154 vs. InlineDashboardPanel Zeile 39-41 (dort korrekt: `serverId \|\| layoutId`) |
| B10 | **NIEDRIG** | `InlineDashboardPanel.vue:59` | Widget-Mount nutzt `document.getElementById(mountId)` mit generiertem ID — bei mehreren InlineDashboardPanels mit gleichem layoutId koennten ID-Kollisionen auftreten | IDP Zeile 58-59 |
| B11 | **NIEDRIG** | Kein Cross-Tab Sync | Target-Aenderung in Tab A (Editor) propagiert NICHT zu Tab B (Monitor) — localStorage-Aenderungen werden nicht live synchronisiert, erst bei Navigation weg+zurueck + Store-Reload | Architektur-Luecke |
| B12 | **NIEDRIG** | `DashboardUpdate` Schema | `target: Optional[dict] = None` — "nicht gesendet" und "explizit null" sind im Pydantic-Schema nicht unterscheidbar. `PUT` mit `target: null` koennte ignoriert werden falls Service `exclude_unset=True` nutzt | schema Zeile 175-178 |

### UX-PROBLEME (kein Bug, aber schlecht fuer den User)

| # | Bereich | Problem | Empfehlung |
|---|---------|---------|------------|
| U1 | Target-Konfigurator | Kein Toast/Feedback nach Target-Aenderung — User sieht nur subtile MapPin-Farbveraenderung | Toast: "Dashboard wird in Monitor als Inline-Panel angezeigt" |
| U2 | Target-Konfigurator | Option "Uebersicht — Inline" ist irrefuehrend — es gibt KEINE Inline-Darstellung in HardwareView, es rendert IMMER als Side-Panel | Option umbenennen zu "Uebersicht — Seitenpanel" ODER Inline-Rendering in HardwareView implementieren |
| U3 | Editor | Kein Widget-Counter in der Toolbar sichtbar — Plan behauptet "Widget-Counter im Header zeigt 2 Widgets" aber das existiert nur im DashboardViewer, nicht im Editor | Widget-Counter in Editor-Toolbar ergaenzen ODER Testplan anpassen |

---

## Kontext

Du pruefst JEDE Funktion der "Monitor Ebene 3 — Editor-Integration" End-to-End. Stack muss laufen (Frontend + Server + DB). Nutze Playwright fuer Browser-Interaktion, Server-Logs fuer API-Calls, DB-Queries fuer Persistenz-Checks.

## Voraussetzungen

- Stack laeuft: `docker compose up -d` (el-frontend, el-servador, postgres)
- Mindestens 2 Mock-ESPs mit Sensoren existieren, in verschiedenen Zonen zugewiesen
- Ein User ist eingeloggt
- **ACHTUNG:** Alembic Migration `add_dashboard_target` muss gelaufen sein (haengt ab von `add_dashboards`)
- **ACHTUNG:** Server-Sync ist DEBOUNCED (2000ms) — nach jeder Target-Aenderung mindestens 3 Sekunden warten bevor API-Check oder DB-Check

---

## TESTBLOCK 1: Dashboard erstellen + Target setzen (Editor-View)

### Schritt 1.1 — Dashboard anlegen

1. Navigiere zu `/editor`
2. Erstelle ein neues Dashboard mit Namen "Test-Inline-Monitor" (Layout-Dropdown → Input-Feld → Enter)
3. Verifiziere: Dashboard erscheint im Layout-Dropdown (Klasse `dashboard-builder__layout-item--active`)
4. Wechsle in Edit-Modus (Pencil-Icon klicken — Button-Klasse `dashboard-builder__tool-btn`)
5. Oeffne Widget-Katalog (Plus-Icon — nur sichtbar wenn `isEditing`)
6. Fuege ein Gauge-Widget und ein Line-Chart-Widget hinzu (aus Katalog-Sidebar klicken)
7. Verifiziere: Beide Widgets erscheinen im GridStack-Grid (DOM: `.grid-stack-item` Elemente zaehlen === 2)
8. ~~Verifiziere: Widget-Counter im Header zeigt "2 Widgets"~~ **[KORREKTUR]** Editor hat KEINEN Widget-Counter in der Toolbar. Stattdessen: Pruefe `.grid-stack-item` Anzahl im DOM === 2. Widget-Counter existiert nur im DashboardViewer-Header.

### Schritt 1.2 — Target-Konfigurator

9. Klicke auf das MapPin-Icon (Target-Konfigurator — Button in `dashboard-builder__target-wrapper`, NUR sichtbar wenn `dashStore.activeLayoutId && isEditing`)
10. Verifiziere: Dropdown oeffnet sich mit 3+1 Optionen:
    - "Monitor — Inline" → `setTarget('monitor', 'inline')`
    - "Monitor — Seitenpanel" → `setTarget('monitor', 'side-panel')`
    - "Uebersicht — Inline" → `setTarget('hardware', 'inline')` **[BUG B5: rendert trotzdem als Side-Panel]**
    - "Ziel entfernen" (NUR sichtbar wenn `activeTarget !== null`)
11. Klicke "Monitor — Inline"
12. Verifiziere: MapPin-Icon hat jetzt Klasse `dashboard-builder__tool-btn--active` (NICHT einfach `--active` — voller Klassenname pruefen)
13. Verifiziere: Dropdown schliesst sich (Variable `showTargetConfig = false`)
14. **API-Check:** **WARTE MINDESTENS 3 Sekunden** (Debounce: 2000ms). Dann: Server-Log muss `PUT /api/v1/dashboards/{serverId}` mit `target: { view: "monitor", placement: "inline" }` zeigen. **ACHTUNG:** Das Dashboard muss VORHER zum Server synchronisiert worden sein (serverId muss existieren). Falls neues Dashboard: Erster Sync ist ein `POST`, nicht `PUT`.
15. **DB-Check:** `SELECT target FROM dashboards WHERE name='Test-Inline-Monitor'` muss `{"view": "monitor", "placement": "inline"}` enthalten. **Falls kein Eintrag:** Server-Sync hat noch nicht stattgefunden — 5 Sekunden warten, erneut pruefen.

### Schritt 1.2b — Target-Dropdown Outside-Click (BUG B6)

15b. Oeffne Target-Dropdown erneut (MapPin klicken)
15c. Klicke AUSSERHALB des Dropdowns (z.B. auf den Grid-Bereich)
15d. **ERWARTUNG:** Dropdown schliesst sich. **BUG:** Dropdown bleibt offen — es fehlt `onClickOutside`.
15e. Verifiziere BUG B6: Dropdown schliesst sich NUR durch: (a) Klick auf MapPin, (b) Auswahl einer Option

### Schritt 1.3 — Target aendern auf Side-Panel

16. Klicke erneut auf MapPin-Icon
17. Klicke "Monitor — Seitenpanel"
18. **API-Check:** WARTE 3s. PUT mit `target: { view: "monitor", placement: "side-panel" }`
19. **DB-Check:** target-Feld jetzt `{"view": "monitor", "placement": "side-panel"}`

### Schritt 1.4 — Target entfernen

20. Klicke auf MapPin-Icon
21. Verifiziere: "Ziel entfernen" Button ist sichtbar (CSS-Klasse `dashboard-builder__target-option--clear`, `v-if="activeTarget"`)
22. Klicke "Ziel entfernen"
23. Verifiziere: MapPin-Icon verliert `dashboard-builder__tool-btn--active` Klasse
24. **DB-Check:** WARTE 3s. target-Feld ist jetzt `null`. **ACHTUNG BUG B12:** Pruefen ob `PUT` mit `target: null` tatsaechlich die Spalte auf NULL setzt oder ob sie unveraendert bleibt.

---

## TESTBLOCK 2: Inline-Panel in MonitorView (L1 + L2)

### Schritt 2.1 — Setup: Target auf "Monitor — Inline" setzen

25. Im Editor: Oeffne Target-Konfigurator, waehle "Monitor — Inline"
26. **WARTE 3 Sekunden** (Debounce), dann navigiere zu `/monitor`

### Schritt 2.2 — L1 Verifikation (Zone-Tiles)

27. Verifiziere: `InlineDashboardPanel` erscheint NACH der Cross-Zone-Dashboard-Sektion (`.monitor-dashboards`) und VOR dem `</template>` der L1-Sektion. **DOM-Position:** Innerhalb `<main class="monitor-layout__main">`, nach allen Zone-Tiles und Cross-Zone-Links.
28. Verifiziere: Panel hat CSS-Klasse `inline-dashboard` + `inline-dashboard--inline` (NICHT `--side-panel`). Pruefe: `document.querySelector('.inline-dashboard.inline-dashboard--inline')` !== null
29. Verifiziere: Panel-Header (`.inline-dashboard__header`) zeigt Dashboard-Namen "Test-Inline-Monitor" (`.inline-dashboard__name`)
30. Verifiziere: Pencil-Icon (`.inline-dashboard__edit-link`) verlinkt zu `/editor/{serverId||layoutId}` — Klasse `<RouterLink :to="editorRoute">`. **InlineDashboardPanel nutzt korrekt `serverId || layoutId`.**
31. Verifiziere: CSS Grid rendert Widgets korrekt — `.inline-dashboard__grid` hat `grid-template-columns: repeat(12, 1fr)`. Widgets haben `grid-column: X / span W` Positionen.
32. Klicke auf Pencil-Icon: Navigiert zum Editor mit korrektem Dashboard geladen. Verifiziere URL = `/editor/{dashboardId}` und `dashStore.activeLayoutId` stimmt.

### Schritt 2.3 — L2 Verifikation (Zone-Detail)

33. Klicke auf eine Zone-Tile um zu `/monitor/{zoneId}` zu navigieren
34. Verifiziere: Inline-Panel erscheint NACH den Subzone-Akkordeons + Sensor/Actuator-Cards und VOR dem Empty-State-Fallback
35. Verifiziere: Widgets rendern korrekt (gleicher Inhalt wie in L1 — gleiche Widgets, gleiche Grid-Positionen)
36. Verifiziere: "Zurueck"-Button (`.monitor-view__back`) funktioniert (navigiert zurueck zu L1 `/monitor`)
37. **60-Sekunden-Nachpruefung:** Bleibe auf L2, warte 60 Sekunden. Widgets muessen stabil bleiben (kein Memory-Leak, kein Flicker, keine DOM-Verwaisten). Pruefe Browser-Console auf Fehler.

### Schritt 2.4 — Widget-Mount-IDs auf Duplikate pruefen (BUG B10)

37b. Verifiziere: Widget-Mount-Container-IDs sind eindeutig. Format: `inline-{layoutId}-{widgetId}`. Falls zwei InlineDashboardPanels mit gleicher `layoutId` existieren (z.B. inline + side-panel fuer selbes Dashboard), koennen IDs kollidieren.

---

## TESTBLOCK 3: Side-Panel in MonitorView

### Schritt 3.1 — Setup: Target auf "Monitor — Seitenpanel" aendern

38. Navigiere zum Editor, aendre Target auf "Monitor — Seitenpanel"
39. **WARTE 3 Sekunden**, navigiere zurueck zu `/monitor`

### Schritt 3.2 — Layout-Verifikation L1

40. Verifiziere: CSS-Grid-Layout wechselt auf `grid-template-columns: 1fr 300px` (Klasse `monitor-layout--has-side` auf `.monitor-layout` Element)
41. Verifiziere: Side-Panel (`<aside class="monitor-layout__side">`) erscheint RECHTS vom Haupt-Content (`<main class="monitor-layout__main">`)
42. Verifiziere: InlineDashboardPanel hat `mode="side-panel"` → CSS-Klasse `inline-dashboard--side-panel` (Border nur links, kein border-radius)
43. Verifiziere: Side-Panel Container hat `position: sticky; top: 0; max-height: calc(100vh - 120px); overflow-y: auto`
44. Scrolle die Hauptseite (Zone-Tiles runter): Side-Panel bleibt fixiert oben rechts

### Schritt 3.3 — Layout-Verifikation L2

45. Navigiere zu `/monitor/{zoneId}`
46. Verifiziere: Side-Panel ist auch in L2 sichtbar (weil `<aside>` AUSSERHALB der L1/L2 `<template>` Wechsel liegt, innerhalb `.monitor-layout`)
47. Verifiziere: Gleiche Widgets wie in L1 (gleiche Instanz, kein Remount)

### Schritt 3.4 — Responsive Breakpoint

48. Resize Browser auf < 768px Breite
49. Verifiziere: Grid wechselt auf `grid-template-columns: 1fr` (CSS Media Query `@media (max-width: 768px)`)
50. Verifiziere: Side-Panel hat `position: static; max-height: none` (kein sticky mehr, normaler Flow)
51. Resize zurueck auf > 768px: Layout springt zurueck auf 2-Spalten-Grid + sticky

### Schritt 3.5 — 60-Sekunden-Nachpruefung

52. Bleibe auf `/monitor` mit Side-Panel sichtbar, warte 60 Sekunden
53. Pruefe Console: Keine Fehler, kein Widget-Remount-Zyklus (`cleanupAllWidgets` + re-mount Loop)
54. Pruefe Netzwerk: Keine unnoetige API-Call-Wiederholung (Dashboard-API wird NUR beim Store-Init gefetcht)

---

## TESTBLOCK 4: Hardware-View Side-Panel

### Schritt 4.1 — Setup: Target auf "Uebersicht — Inline" setzen

55. Im Editor: Target-Konfigurator → "Uebersicht — Inline"
56. **WARTE 3s**, navigiere zu `/hardware`

### Schritt 4.2 — Verifikation

57. Verifiziere: CSS-Grid-Layout wechselt auf `grid-template-columns: 1fr 300px` (Klasse `hardware-content--has-side` auf `.hardware-content` Element)
58. Verifiziere: Side-Panel (`<aside class="hardware-side-panel">`) erscheint RECHTS des `.hardware-main-layout` Containers
59. Verifiziere: InlineDashboardPanel hat `mode="side-panel"` — **OBWOHL** der User "Inline" gewaehlt hat. **[BUG B5]** Hardware-View rendert ALLE Hardware-Panels als Side-Panel, unabhaengig vom `placement`-Wert. Es gibt KEIN Inline-Rendering fuer Hardware-View.
60. Verifiziere: Panel bleibt sticky beim Scrollen (`.hardware-side-panel` hat `position: sticky; top: 0`)
61. Klicke auf ein ESP-Device (wechselt zu Level 2 / Orbital): Side-Panel muss auch in Level 2 sichtbar sein (weil `<aside>` innerhalb `.hardware-content` liegt, das sowohl L1 als auch L2 umschliesst)

### Schritt 4.2b — BUG B5 verifizieren: "Inline" Option hat keinen Effekt

61b. Vergleiche im Editor: Setze Target auf "Uebersicht — Inline" → navigiere zu `/hardware` → pruefe Rendering
61c. Zurueck zum Editor: Aendere zu "Monitor — Seitenpanel" (um Hardware-Panels zu leeren)
61d. In HardwareView: Panel verschwunden. **Fazit:** `hardwarePanels` computed filtert nur `target.view === 'hardware'` — `placement` wird ignoriert. "Uebersicht — Inline" und ein hypothetisches "Uebersicht — Side-Panel" waeren identisch.

### Schritt 4.3 — Responsive + 60-Sekunden-Check

62. Resize < 768px: Single-Column-Fallback (`.hardware-content--has-side` → `grid-template-columns: 1fr`, `.hardware-side-panel` → `position: static`)
63. Warte 60 Sekunden auf `/hardware`: Console clean, keine Widget-Fehler

---

## TESTBLOCK 5: DashboardViewer (L3 vollstaendige Ansicht)

### Schritt 5.1 — Cross-Zone Dashboard Route

64. **[KORREKTUR]** Der Editor hat KEIN UI zum Setzen von `scope`. **BUG B7.** Um ein Dashboard mit `scope: "cross-zone"` zu erstellen, muss man entweder:
    - (a) Per API: `POST /api/v1/dashboards` mit `scope: "cross-zone"` im Body
    - (b) Per localStorage-Manipulation: `layouts[].scope = 'cross-zone'` setzen
    - (c) Template "Zonen-Uebersicht" erzeugt KEIN scope — Templates setzen scope NICHT automatisch
    **Workaround fuer Test:** Dashboard via `curl -X POST /api/v1/dashboards -d '{"name":"Test-Cross-Zone","scope":"cross-zone","widgets":[...]}'` erstellen, dann `dashStore.fetchLayouts()` im Frontend aufrufen (Editor oeffnen).
65. Verifiziere: "Im Monitor anzeigen" Button (MonitorPlay-Icon, `.dashboard-builder__tool-btn--monitor`) erscheint NUR wenn `monitorRouteForLayout !== null` — dafuer MUSS `layout.scope` gesetzt sein. **BUG B7:** Fuer manuell erstellte Dashboards ist dieser Button UNSICHTBAR.
66. Klicke auf "Im Monitor anzeigen"
67. Verifiziere: Navigiert zu `/monitor/dashboard/{dashboardId}` (fuer cross-zone) ODER `/monitor/{zoneId}/dashboard/{dashboardId}` (fuer zone-scoped)
68. Verifiziere: DashboardViewer rendert mit GridStack (NICHT CSS-Grid) — pruefe DOM: `<div class="grid-stack dashboard-viewer__grid">` vorhanden
69. Verifiziere: Header (`.dashboard-viewer__header`) zeigt:
    - "Zurueck"-Button (`.dashboard-viewer__back`) — `<ArrowLeft>` + "Zurueck" Text
    - Dashboard-Name (`.dashboard-viewer__title`) — `{{ layout?.name || 'Dashboard' }}`
    - Widget-Count (`.dashboard-viewer__widget-count`) — `{{ layout?.widgets.length || 0 }} Widgets`
    - "Im Editor bearbeiten"-Link (`.dashboard-viewer__edit-btn`) — RouterLink zu `/editor/{layout.id}`
    **[BUG B9]**: Editor-Link nutzt `layout.id` (lokal) statt `layout.serverId` (UUID). Fuer Server-synced Layouts sind diese identisch, fuer lokale nicht.
70. Verifiziere: Widgets sind NICHT drag-bar (`staticGrid: true`, `disableDrag: true`, `disableResize: true` in GridStack-Init)
71. Verifiziere: Kein Gear-Icon auf Widgets (`showConfigButton: false` im Composable + CSS Safety Net `.dashboard-viewer__grid :deep(.dashboard-widget__gear-btn) { display: none }`)

### Schritt 5.2 — Zone-spezifisches Dashboard Route

72. **[KORREKTUR]** Nutze auto-generiertes Dashboard: Navigiere zu `/monitor/{zoneId}` fuer eine Zone mit Sensoren → `generateZoneDashboard` wird automatisch aufgerufen und erzeugt ein Dashboard mit `scope: 'zone'`
73. Navigiere zu `/monitor/{zoneId}/dashboard/{dashboardId}` (Dashboard-Link in L2 Zone-Dashboard-Sektion klicken)
74. Verifiziere: DashboardViewer rendert korrekt (GridStack, statisch, Widgets sichtbar)
75. Klicke "Zurueck" (`.dashboard-viewer__back`): Navigiert zurueck zur Zone-Detailansicht (`router.back()`)

### Schritt 5.3 — Auto-generiertes Dashboard

76. Navigiere zu `/monitor/{zoneId}` fuer eine Zone die noch kein Dashboard hat
77. Verifiziere: `generateZoneDashboard` wird aufgerufen. **[KORREKTUR + BUG B1]** Es gibt KEINEN `POST /api/v1/dashboards` — `generateZoneDashboard()` schreibt NUR nach localStorage via `persistLayouts()`. Kein Server-Sync. Pruefe stattdessen: `localStorage.getItem('automation-one-dashboard-layouts')` enthaelt neues Dashboard mit `autoGenerated: true`.
78. Verifiziere: Dashboard-Link erscheint in der Zone-Dashboard-Sektion (`.monitor-dashboards`) mit LayoutDashboard-Icon
79. Klicke auf Dashboard-Link: DashboardViewer oeffnet (URL: `/monitor/{zoneId}/dashboard/{dashboardId}`)
80. Verifiziere: Banner "Dieses Dashboard wurde automatisch erstellt." erscheint (`.dashboard-viewer__auto-banner`)
81. Klicke "Uebernehmen" (`.dashboard-viewer__claim-btn`): `autoGenerated` wechselt auf `false`, Banner verschwindet
82. **[KORREKTUR + BUG B2]** DB-Check ist NICHT moeglich — `claimAutoLayout()` schreibt NUR localStorage, KEIN Server-Sync. `auto_generated` in der DB wird NICHT geaendert (falls das Dashboard ueberhaupt in der DB existiert — siehe BUG B1). Pruefe stattdessen localStorage: `layouts[].autoGenerated === false`

### Schritt 5.4 — 60-Sekunden-Nachpruefung DashboardViewer

83. Bleibe 60 Sekunden auf der DashboardViewer-Seite
84. Pruefe: Widgets bleiben stabil, keine `onUnmounted`-Fehler, kein GridStack-Reflow
85. Navigiere weg und zurueck: Widgets remounten sauber (`cleanupAllWidgets` in `onUnmounted`, `initGrid` + `loadWidgets` in `onMounted`)

---

## TESTBLOCK 6: Router-Konsistenz + Deep-Links

### Schritt 6.1 — Direkte URL-Eingabe

86. Oeffne direkt `/monitor/dashboard/{existierende-dashboardId}` als URL → DashboardViewer muss rendern. Route: `monitor-dashboard` (router Zeile 67-70)
87. Oeffne direkt `/monitor/{zoneId}/dashboard/{dashboardId}` → DashboardViewer muss rendern. Route: `monitor-zone-dashboard` (router Zeile 85-89)
88. Oeffne direkt `/monitor/{zoneId}` → L2 Zone-Detail muss rendern. Route: `monitor-zone` (router Zeile 73-77)
89. Oeffne direkt `/editor/{dashboardId}` → Editor mit korrektem Dashboard geladen. Route: `editor-dashboard` (router Zeile 101-105). **Pruefe:** `dashStore.activeLayoutId === dashboardId` und Widgets im Grid geladen.

### Schritt 6.1b — Deep-Link mit lokalem vs. Server-ID

89b. Oeffne `/editor/dash-local-123` (lokales ID-Format) → Pruefe ob Dashboard gefunden wird
89c. Oeffne `/editor/{uuid-format}` (Server-ID-Format) → Pruefe ob Dashboard gefunden wird
89d. **Erwartung:** Beide Formate muessen funktionieren. `CustomDashboardView.onMounted` sucht `dashStore.layouts.find(l => l.id === dashboardIdFromUrl)` — lokale und Server-Layouts haben unterschiedliche ID-Formate. Nach `fetchLayouts()` haben Server-Layouts UUID-Format.

### Schritt 6.2 — Greedy-Matching-Pruefung

90. Navigiere zu `/monitor/dashboard/abc123` — DARF NICHT als `zoneId="dashboard"` interpretiert werden. Router-Reihenfolge in `router/index.ts` ist korrekt: `monitor/dashboard/:dashboardId` kommt VOR `monitor/:zoneId` (Zeile 67 vs. 73)
91. Verifiziere: `selectedDashboardId = "abc123"`, `isDashboardView = true`
92. Verifiziere: Es wird DashboardViewer gerendert (`.dashboard-viewer`), NICHT die Zone-Detail-Ansicht

### Schritt 6.3 — Breadcrumb-Verifikation

93. Auf `/monitor`: Breadcrumb zeigt "Monitor" (current: true). TopBar Zeile 103.
94. Auf `/monitor/{zoneId}`: Breadcrumb zeigt "Monitor > {Zonenname}". TopBar Zeile 104-110.
95. **[BUG B3]** Auf `/monitor/dashboard/{id}`: Breadcrumb zeigt **NUR "Monitor"** — Dashboard-Name FEHLT. TopBar hat KEINEN Handler fuer `route.params.dashboardId` im Monitor-Route-Bereich (nur im Editor-Bereich, Zeile 116-122). **Erwartung laut Plan:** "Monitor > {Dashboard-Name}" — SCHLAEGT FEHL.
95b. **[BUG B4]** Auf `/monitor/{zoneId}/dashboard/{id}`: Breadcrumb zeigt **"Monitor > {Zone}"** — Dashboard-Name FEHLT. **Erwartung:** "Monitor > {Zone} > {Dashboard-Name}" — SCHLAEGT FEHL.
96. Auf `/editor/{id}`: Breadcrumb zeigt "Editor > {Dashboard-Name}". TopBar Zeile 116-122. **KORREKT.**

---

## TESTBLOCK 7: Server-API + DB-Persistenz Round-Trip

### Schritt 7.1 — Target-Feld Round-Trip

97. Erstelle Dashboard via API: `POST /api/v1/dashboards` mit `target: { view: "monitor", placement: "inline" }`. **Auth erforderlich:** Bearer Token im Header.
98. Lade Dashboard: `GET /api/v1/dashboards/{id}` — target-Feld muss identisch zurueckkommen (Pydantic `DashboardResponse` hat `target: Optional[dict]`)
99. Update Target: `PUT /api/v1/dashboards/{id}` mit `target: { view: "hardware", placement: "side-panel", order: 2 }`
100. Lade erneut: target-Feld muss neuen Wert zeigen
101. Entferne Target: `PUT /api/v1/dashboards/{id}` mit `target: null`. **[ACHTUNG BUG B12]** Pruefen: Wird `target` tatsaechlich auf NULL gesetzt? Oder interpretiert Pydantic `target: null` als "Feld nicht mitgesendet" und ueberspringt es? **Workaround falls Bug:** Explizit `{ "target": null }` im Request-Body senden und pruefen ob Service `model_dump(exclude_unset=True)` nutzt.
102. Lade erneut: target-Feld muss `null` sein

### Schritt 7.2 — Alembic-Migration-Check

103. Verifiziere: `add_dashboard_target_field.py` Migration existiert unter `El Servador/god_kaiser_server/alembic/versions/`. **EXISTIERT.** Revision: `add_dashboard_target`, Abhaengigkeit: `add_dashboards`.
104. Verifiziere: `upgrade()` fuegt `target` JSON-Spalte hinzu (nullable=True). **KORREKT.**
105. Verifiziere: `downgrade()` entfernt die Spalte (`op.drop_column("dashboards", "target")`). **KORREKT.**

### Schritt 7.3 — localStorage ↔ Server Sync

106. Erstelle Dashboard lokal (im Editor — Neues Dashboard Name eingeben → Enter)
107. Verifiziere: localStorage (`automation-one-dashboard-layouts`) hat Layout mit target-Feld (initial `undefined`/nicht gesetzt)
108. Verifiziere: Nach Server-Sync (2s Debounce + Netzwerk-Zeit) hat die DB den gleichen Eintrag. **ACHTUNG:** Initial-Sync ist `POST` (kein `serverId`), danach hat Layout ein `serverId` Feld.
109. Aendere target im Editor (MapPin → Option waehlen)
110. Verifiziere: localStorage wird SOFORT aktualisiert (`persistLayouts()` synchron). DB wird NACH 2s Debounce aktualisiert (`syncLayoutToServer()` asynchron).

### Schritt 7.3b — Server-Sync Race Condition (BUG B8)

110b. Oeffne 3 verschiedene Dashboards schnell hintereinander und setze jeweils ein Target
110c. Pruefe: NUR das letzte Dashboard wird zum Server synchronisiert (weil `_saveDebounceTimer` global ist und bei jedem Aufruf resettet wird)
110d. **Erwartung:** Alle 3 sollten synchronisiert werden. **REALITAET:** Nur das letzte.

---

## TESTBLOCK 8: Cleanup + Memory-Leaks

### Schritt 8.1 — Widget Lifecycle

111. Navigiere zu `/monitor` (Inline-Panels sichtbar)
112. Navigiere weg zu `/hardware`
113. Navigiere zurueck zu `/monitor`
114. Verifiziere: Widgets remounten sauber, keine duplizierten DOM-Elemente. Pruefe: `document.querySelectorAll('[id^="inline-"]').length` stimmt mit erwarteter Widget-Anzahl ueberein.
115. Pruefe Console: Keine "Failed to unmount" oder Vue-Warnungen. InlineDashboardPanel hat `onUnmounted(() => cleanupAllWidgets())`.

### Schritt 8.2 — Target entfernen → Panel verschwindet

116. Waehrend `/monitor` offen ist, oeffne den Editor in einem neuen Tab
117. Entferne das Target (MapPin → "Ziel entfernen")
118. **[BUG B11]** Cross-Tab-Sync: localStorage-Aenderung in Tab A propagiert NICHT automatisch zum Pinia-Store in Tab B. Der Store liest localStorage nur bei Initialisierung (`loadLayouts()` im Store-Setup).
119. Navigiere im Monitor-Tab weg und zurueck zu `/monitor` (loest Store-Reload NICHT aus — Pinia holt nicht automatisch aus localStorage nach)
120. **Erwartung laut Plan:** InlineDashboardPanel ist NICHT mehr sichtbar. **WAHRSCHEINLICHES ERGEBNIS:** Panel ist NOCH sichtbar (Store-State unveraendert). Panel verschwindet erst nach: (a) Page-Reload, (b) Editor-Tab im selben Tab oeffnen, (c) `dashStore.loadLayouts()` manuell aufrufen.
120b. Verifiziere Workaround: Navigiere zu `/editor` und zurueck zu `/monitor` — jetzt sollte `fetchLayouts()` frische Daten vom Server holen und Store aktualisieren.

### Schritt 8.3 — Dashboard loeschen → Panel verschwindet

121. Setze Target auf "Monitor — Inline", Dashboard hat Widgets
122. Loesche das Dashboard im Editor (Trash2-Icon → Confirm-Dialog → "Loeschen")
123. Navigiere zu `/monitor`
124. Verifiziere: Kein Inline-Panel mehr sichtbar. `dashStore.inlineMonitorPanels` sollte leer sein (da das Layout aus `layouts[]` entfernt wurde).
125. **DB-Check:** Dashboard nicht mehr in `dashboards`-Tabelle. `deleteLayoutFromServer(serverId)` wird aufgerufen wenn `serverId` existiert. Falls nur lokal: kein DELETE Request.

---

## TESTBLOCK 9: Fehlende Scope-UI (BUG B7 — Neue Tests)

### Schritt 9.1 — Scope-Luecke verifizieren

126. Erstelle ein neues Dashboard im Editor
127. Verifiziere: Es gibt KEIN Dropdown/Selector fuer `scope` (zone/cross-zone/sensor-detail)
128. Verifiziere: "Im Monitor anzeigen" Button (MonitorPlay) ist NICHT sichtbar (weil `monitorRouteForLayout === null` wenn `layout.scope` nicht gesetzt)
129. **Fazit:** Manuell erstellte Dashboards koennen NICHT als "Im Monitor anzeigen"-Link navigiert werden

### Schritt 9.2 — Workaround: Scope via API setzen

130. Erstelle Dashboard via API mit `scope: "cross-zone"` und `widgets: [...]`
131. Oeffne Editor: Dashboard sollte in der Layout-Liste erscheinen (nach `fetchLayouts()`)
132. Verifiziere: "Im Monitor anzeigen" Button erscheint jetzt
133. Klicke: Navigiert korrekt zu `/monitor/dashboard/{dashboardId}`

---

## TESTBLOCK 10: Multi-Dashboard Edge Cases (Neue Tests)

### Schritt 10.1 — Zwei Dashboards mit gleichem Target

134. Erstelle Dashboard A mit Target "Monitor — Inline"
135. Erstelle Dashboard B mit Target "Monitor — Inline"
136. Navigiere zu `/monitor`
137. Verifiziere: BEIDE InlineDashboardPanels erscheinen (Reihenfolge nach `target.order`, default 0 → alphabetisch/Erstellungsreihenfolge)
138. Verifiziere: IDs sind eindeutig (kein DOM-Konflikt)
139. Entferne Target von Dashboard A
140. Verifiziere: Nur Dashboard B bleibt als Inline-Panel

### Schritt 10.2 — Inline + Side-Panel gleichzeitig

141. Erstelle Dashboard A mit Target "Monitor — Inline"
142. Erstelle Dashboard B mit Target "Monitor — Seitenpanel"
143. Navigiere zu `/monitor`
144. Verifiziere: Dashboard A erscheint als Inline-Panel im Main-Content
145. Verifiziere: Dashboard B erscheint als Side-Panel (`.monitor-layout__side`)
146. Verifiziere: CSS-Grid ist 2-Spalten (`monitor-layout--has-side`)
147. Verifiziere: Beide Dashboards rendern Widgets unabhaengig

### Schritt 10.3 — Dashboard ohne Widgets + Target

148. Erstelle ein leeres Dashboard (keine Widgets) mit Target "Monitor — Inline"
149. Navigiere zu `/monitor`
150. Verifiziere: InlineDashboardPanel wird NICHT gerendert (`v-if="layout && widgets.length > 0"` in InlineDashboardPanel Zeile 82). **ACHTUNG:** `inlineMonitorPanels` im Store filtert NICHT nach Widget-Anzahl — es liefert alle targeted Layouts. Das Panel-Component selbst filtert per `v-if`.
151. **UX-Frage:** Soll ein leeres targeted Dashboard im Store als Panel auftauchen (store sagt ja) aber nicht rendern (component sagt nein)? Das beeinflusst `monitor-layout--has-side` — die Klasse wird GESETZT (store hat Panel), aber das DOM-Element ist LEER (v-if falsch). **Potenzielle Layout-Stoerung.**

---

## TESTBLOCK 11: DashboardViewer Error States (Neue Tests)

### Schritt 11.1 — Nicht-existierende Dashboard-ID

152. Navigiere zu `/monitor/dashboard/non-existent-uuid`
153. Verifiziere: DashboardViewer zeigt Empty-State "Dashboard nicht gefunden." (`.dashboard-viewer__empty`)
154. Verifiziere: "Zurueck"-Button funktioniert (`router.back()`)

### Schritt 11.2 — Dashboard nach Laden loeschen

155. Oeffne `/monitor/dashboard/{id}` — Dashboard rendert korrekt
156. In anderem Tab: Loesche das Dashboard im Editor
157. Navigiere weg und zurueck zu `/monitor/dashboard/{id}`
158. Verifiziere: Empty-State erscheint (Layout aus Store entfernt)

---

## Zusammenfassung der Pruefpunkte pro Testblock

| Block | Was | Playwright | Server-Log | DB-Query | Bugs |
|-------|-----|-----------|------------|----------|------|
| 1 | Editor Target-Konfigurator | UI + Dropdown + Active-State | PUT /dashboards (3s Delay) | target-Spalte | B6, B12 |
| 2 | Inline-Panel MonitorView | DOM-Position + CSS-Grid + Widget-Render | - | - | B10 |
| 3 | Side-Panel MonitorView | Sticky + 2-Spalten-Grid + Responsive | - | - | - |
| 4 | Side-Panel HardwareView | Sticky + 2-Spalten-Grid + L1/L2 | - | - | B5 |
| 5 | DashboardViewer L3 | GridStack + Static + Banner + Routes | POST/PUT dashboards | auto_generated | B1, B2, B7, B9 |
| 6 | Router Deep-Links | URL → korrekter View | - | - | B3, B4 |
| 7 | Server API Round-Trip | - | GET/POST/PUT/DELETE | target CRUD | B8, B12 |
| 8 | Cleanup + Memory | DOM-Duplikate + Console clean | - | DELETE | B11 |
| 9 | Scope-Luecke | MonitorPlay-Button unsichtbar | - | - | B7 |
| 10 | Multi-Dashboard Edge | Mehrere Panels + Layout | - | - | Layout-Bug bei leerem Panel |
| 11 | Viewer Error States | Empty-State + Recovery | - | - | - |

**Gesamt:** 158 Pruefpunkte (125 original + 33 ergaenzt), 12 Bugs, 3 UX-Probleme

Jeder Block hat eine 60-Sekunden-Nachpruefung wo relevant (Bloecke 2, 3, 4, 5). Dabei Konsole pruefen auf: Vue-Warnings, Uncaught Errors, Widget-Remount-Zyklen.

---

## Bug-Prioritaet fuer Fix

| Prioritaet | Bugs | Grund |
|------------|------|-------|
| **P1 — Muss vor E2E** | B1, B2 | Auto-Dashboards existieren nur lokal — Server hat keine Daten, Cross-Session kaputt |
| **P1 — Muss vor E2E** | B3, B4 | Breadcrumbs falsch — User verliert Orientierung in Dashboard-Ansichten |
| **P2 — Sollte vor E2E** | B5 | "Uebersicht — Inline" Option ist funktionslos — verwirrend |
| **P2 — Sollte vor E2E** | B6 | Target-Dropdown bleibt offen — schlechte UX |
| **P2 — Sollte vor E2E** | B7 | Scope nicht setzbar — MonitorPlay-Button unerreichbar |
| **P2 — Sollte vor E2E** | B8 | Sync-Race bei schnellem Wechsel — Datenverlust |
| **P3 — Nice-to-have** | B9, B10, B11, B12 | Edge Cases, Cross-Tab, Pydantic-Semantik |

---

## Report-Output

`/reports/current/EDITOR_INTEGRATION_E2E_VERIFICATION.md` mit:
- Screenshot pro Testblock (1-11)
- Pass/Fail pro Pruefpunkt (158 Checks)
- Bei Fail: Erwartung vs. Realitaet + Screenshot + Netzwerk-Response + DB-Query-Ergebnis
- Bug-Tracker-Referenz (B1-B12) bei jedem betroffenen Check
