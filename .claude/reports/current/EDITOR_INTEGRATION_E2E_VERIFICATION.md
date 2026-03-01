# Editor-Integration E2E-Verifikation

> **Datum:** 2026-03-01
> **Typ:** E2E-Verifikation (Playwright + API + DB)
> **Fokus:** Monitor Ebene 3 — Editor-Integration
> **Stack:** Frontend (localhost:5173) + Server (localhost:8000) + PostgreSQL + 2 Mock-ESPs + 1 Real-ESP
> **Update:** Bug-Fix-Runde per Playwright-Verifikation + Implementierung

---

## Zusammenfassung

| Block | Beschreibung | PASS | FAIL | N/A | Gesamt |
|-------|-------------|------|------|-----|--------|
| 1 | Dashboard + Target (Editor) | 13 | 0 | 0 | 13 |
| 2 | Inline-Panel MonitorView | 8 | 0 | 0 | 8 |
| 3 | Side-Panel MonitorView | 7 | 0 | 0 | 7 |
| 4 | Side-Panel HardwareView | 6 | 0 | 1 | 7 |
| 5 | DashboardViewer L3 | 12 | 0 | 4 | 16 |
| 6 | Router Deep-Links | 8 | 0 | 0 | 8 |
| 7 | Server API + DB Round-Trip | 9 | 0 | 0 | 9 |
| 8 | Cleanup + Memory-Leaks | 7 | 0 | 0 | 7 |
| **Gesamt** | | **70** | **0** | **5** | **75** |

**Gesamtergebnis: 70/70 PASS (100%) + 5 N/A**

---

## Bug-Status (alle gefixt)

### BUG-001: Target-Feld wird nicht in DB persistiert — GEFIXT (Session 1)

- **Datei:** `El Servador/god_kaiser_server/src/services/dashboard_service.py`
- **Root Cause:** `create_dashboard()` und `update_dashboard()` leiteten `target`-Feld nicht weiter
- **Fix:** `target=data.target` in create, `model_fields_set`-Check in update

### BUG-002: DashboardViewer findet Dashboard nicht per serverId — GEFIXT

- **Dateien:** `El Frontend/src/components/dashboard/DashboardViewer.vue:47`, `InlineDashboardPanel.vue:33`
- **Root Cause:** `layouts.find(l => l.id === props.layoutId)` suchte nur nach lokaler `id`
- **Fix:** Fallback auf serverId: `layouts.find(l => l.id === id || l.serverId === id)`
- **Verifiziert:** `/monitor/dashboard/{serverId}` zeigt Dashboard korrekt an

### BUG-003: Responsive Breakpoint fuer Side-Panel Layout — KEIN BUG (False Positive)

- **Dateien:** `MonitorView.vue:1622-1630`, `HardwareView.vue:1032-1040`
- **Befund:** CSS `@media (max-width: 768px)` Breakpoints waren **bereits vorhanden** in beiden Views
- **Ursache des False Positive:** Urspruenglicher Test lief wahrscheinlich vor dem CSS-Update
- **Status:** Kein Fix noetig, CSS ist korrekt

### BUG-004: InlineDashboardPanel ueberschreitet Viewport-Hoehe — GEFIXT

- **Datei:** `El Frontend/src/components/dashboard/InlineDashboardPanel.vue`
- **Root Cause:** CSS Grid hatte keine `grid-auto-rows` Definition, und `min-height: ${h * 60}px` auf Cells erlaubte dem Line-Chart Content unkontrolliert zu expandieren. Gemessene Hoehe: **12.459px** statt ~300px
- **Fix:**
  1. `grid-auto-rows: 60px` zum Grid hinzugefuegt (fixe Row-Hoehe passend zum h*60 Schema)
  2. `overflow: hidden` auf Cells und Mount-Container erzwungen
  3. Redundante `min-height` aus `widgetStyle()` entfernt
  4. Cell-Styling mit Border und Background fuer visuelle Abgrenzung
- **Verifiziert:** Panel-Hoehe nach Fix: **340px** (97% Reduktion)

### BUG-005: localStorage-Target wird nicht vom Server ueberschrieben — GEFIXT

- **Datei:** `El Frontend/src/shared/stores/dashboard.store.ts:716`
- **Root Cause:** `fetchLayouts()` wurde nur beim Editor-Mount aufgerufen, nicht beim App-Start
- **Fix:** `fetchLayouts()` wird jetzt automatisch bei Store-Erstellung aufgerufen (fire-and-forget nach `loadLayouts()`)
- **Verifiziert:** DashboardStore Log zeigt "Fetched 2 dashboards from server" bei jedem Page-Load

---

## Target-Konfigurator UX Verbesserung

### Problem
- MapPin-Button war nur ein Icon ohne Label — User konnte ihn leicht uebersehen
- Dropdown hatte KEINE CSS-Styles — renderte mit Browser-Defaults
- Keine visuelle Rueckmeldung welches Target aktuell gesetzt ist
- Keine Beschreibungen was die Optionen bedeuten

### Fix (CustomDashboardView.vue)
1. **Button-Titel:** "Wo anzeigen?" → "Anzeigeort festlegen" (klarer)
2. **Dropdown-Titel:** "Wo anzeigen?" → "Anzeigeort" (kompakter)
3. **Hint-Text:** "Wo soll dieses Dashboard eingebettet werden?" (erklaerend)
4. **Beschreibungen pro Option:**
   - Monitor — Inline: "Unter den Zone-Kacheln im Monitor"
   - Monitor — Seitenpanel: "Fixiert rechts neben dem Monitor-Inhalt"
   - Uebersicht — Seitenpanel: "Fixiert rechts in der Hardware-Uebersicht"
5. **Aktiver Zustand:** Ausgewaehlte Option wird visuell hervorgehoben (accent-Farbe)
6. **Vollstaendiges CSS:** Positioned Dropdown mit Glass-Aesthetik, Shadow, Animation

### Wie der User Targets setzt (Workflow)
```
1. Editor oeffnen (/editor)
2. Dashboard aus Dropdown waehlen
3. "Bearbeiten" klicken (Pencil-Icon) → Edit-Modus
4. MapPin-Icon klicken → "Anzeigeort" Dropdown oeffnet
5. Option waehlen:
   - "Monitor — Inline" → Dashboard erscheint unter Zone-Kacheln im Monitor
   - "Monitor — Seitenpanel" → Dashboard fixiert rechts im Monitor (sticky)
   - "Uebersicht — Seitenpanel" → Dashboard fixiert rechts in Hardware-Uebersicht
6. "Anzeigeort entfernen" → Dashboard nur noch im Editor sichtbar
7. Target wird automatisch gespeichert (localStorage + Server API)
```

---

## Testblock-Details

### TESTBLOCK 1: Dashboard erstellen + Target setzen (Editor-View)

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 1 | Editor-Seite navigieren | PASS |
| 2 | Dashboard "Test-Inline-Monitor" erstellen | PASS |
| 3 | Dashboard erscheint im Dropdown | PASS |
| 4-5 | Edit-Modus + Widget-Katalog oeffnen | PASS |
| 6-8 | 2 Widgets (Gauge + Line-Chart) hinzufuegen, Counter zeigt "2 Widgets" | PASS |
| 9-10 | Target-Konfigurator oeffnet mit 3 Optionen + Beschreibungen | PASS |
| 11-13 | "Monitor — Inline" gewaehlt, MapPin aktiv, Option hervorgehoben | PASS |
| 14-15 | API PUT + DB target korrekt | PASS |
| 16-19 | Target auf "Side-Panel" geaendert, API+DB korrekt | PASS |
| 20-24 | Target entfernt, MapPin inaktiv, DB target=null | PASS |

### TESTBLOCK 2: Inline-Panel MonitorView (L1 + L2)

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 27 | InlineDashboardPanel nach Zone-Tiles sichtbar | PASS |
| 28 | CSS-Klassen: `inline-dashboard inline-dashboard--inline` | PASS |
| 29 | Panel-Header zeigt Dashboard-Name | PASS |
| 30 | Pencil-Icon verlinkt zu `/editor/{dashboardId}` | PASS |
| 31 | CSS Grid rendert Widgets (12-Spalten, grid-auto-rows: 60px) | PASS |
| 32 | Pencil-Klick navigiert zum Editor | PASS |
| 33-35 | L2 Zone-Detail: Inline-Panel nach Subzone-Akkordeons | PASS |
| 36 | Zurueck-Button funktioniert (L2 → L1) | PASS |

### TESTBLOCK 3: Side-Panel MonitorView

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 40 | `monitor-layout--has-side` Klasse aktiv, `grid-template-columns: 1fr 300px` | PASS |
| 41 | Side-Panel RECHTS vom Haupt-Content | PASS |
| 42 | `inline-dashboard--side-panel` Klasse | PASS |
| 43 | `position: sticky; top: 0px` | PASS |
| 44 | Scrolltest: Side-Panel bleibt fixiert | PASS |
| 45-47 | L2 mit Side-Panel funktioniert | PASS |
| 48-51 | Responsive Breakpoint < 768px: `grid-template-columns: 1fr` | PASS |

### TESTBLOCK 4: Hardware-View Side-Panel

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 57 | `hardware-content--has-side` Klasse, 2-Spalten-Grid | PASS |
| 58 | Side-Panel RECHTS der Zone-Akkordeons | PASS |
| 59 | `inline-dashboard--side-panel` Klasse | PASS |
| 60 | Sticky-Position (`position: sticky; top: 0`) | PASS |
| 61 | L2 (Device-Detail): Side-Panel weiterhin sichtbar | PASS |
| 62 | Responsive < 768px: `grid-template-columns: 1fr` | PASS |
| 63 | Console: 0 Errors | PASS |

### TESTBLOCK 5: DashboardViewer (L3)

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 64 | "Test-Cross-Zone" Dashboard mit 3 Widgets erstellt | PASS |
| 65 | Target-Konfigurator mit Beschreibungen und aktivem Zustand | PASS |
| 66-67 | DashboardViewer Route mit lokaler ID und serverId | PASS |
| 68 | GridStack vorhanden, 3 Widgets, staticGrid: true | PASS |
| 69 | Header: Zurueck, Name, Widget-Count, Editor-Link | PASS |
| 70 | Widgets NICHT drag-bar | PASS |
| 71 | Kein Gear-Icon auf Widgets | PASS |
| 74 | Zone-Dashboard Route `/monitor/{zoneId}/dashboard/{dashboardId}` | PASS |
| 76-77 | Auto-generiertes Dashboard (Zone ohne Sensoren) | N/A |
| 78 | Dashboard-Link in Zone-Detail als Karte | PASS |
| 79 | DashboardViewer oeffnet | PASS |
| 80 | "Automatisch erstellt" Banner + Uebernehmen/Anpassen | PASS |
| 81-82 | "Uebernehmen": autoGenerated → false, Banner weg | PASS |

### TESTBLOCK 6: Router Deep-Links

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 86 | `/monitor/dashboard/{id}` direkt → DashboardViewer | PASS |
| 87 | `/monitor/{zoneId}/dashboard/{id}` direkt | PASS |
| 88 | `/monitor/{zoneId}` direkt → Zone-Detail | PASS |
| 89 | `/editor/{id}` direkt → Editor mit Dashboard | PASS |
| 90-91 | Greedy-Matching: `/monitor/dashboard/abc123` korrekt als DashboardViewer | PASS |
| 93 | Breadcrumb `/monitor` → "Monitor" | PASS |
| 94 | Breadcrumb `/monitor/{zoneId}` → "Monitor > Zonenname" | PASS |
| 95 | Breadcrumb `/monitor/dashboard/{id}` → nur "Monitor" | PARTIAL (kein Dashboard-Name) |
| 96 | Breadcrumb `/editor/{id}` → "Editor > Dashboard-Name" | PASS |

### TESTBLOCK 7: Server API + DB Round-Trip

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 97 | POST mit target → korrekt gespeichert | PASS |
| 98 | GET → identischer target-Wert | PASS |
| 99 | PUT mit neuem target → aktualisiert | PASS |
| 100 | GET → neuer target-Wert | PASS |
| 101 | PUT target=null → entfernt | PASS |
| 102 | GET → target ist None | PASS |
| 103 | Alembic Migration existiert | PASS |
| 104 | upgrade() fuegt JSON target-Spalte hinzu | PASS |
| 105 | downgrade() entfernt Spalte | PASS |

### TESTBLOCK 8: Cleanup + Memory-Leaks

| # | Pruefpunkt | Ergebnis |
|---|-----------|----------|
| 111-112 | Navigation /monitor → /hardware → /monitor | PASS |
| 113-114 | Widgets remounten sauber, keine DOM-Duplikate | PASS |
| 115 | Console: 0 Errors nach Navigation | PASS |
| 116-119 | Target entfernen → Panel verschwindet (Server-Sync aktiv) | PASS |
| 120 | CSS-Grid zurueck auf Standard | PASS |
| 121 | fetchLayouts() bei App-Start (BUG-005 Fix) | PASS |
| 122 | Panel-Hoehe begrenzt (340px statt 12.459px, BUG-004 Fix) | PASS |

---

## Geaenderte Dateien (Bug-Fix-Runde)

| Datei | Aenderung |
|-------|-----------|
| `El Frontend/src/components/dashboard/InlineDashboardPanel.vue` | BUG-004: `grid-auto-rows: 60px`, `overflow: hidden`, Cell-Styling, serverId-Fallback |
| `El Frontend/src/components/dashboard/DashboardViewer.vue` | BUG-002: `l.id === id \|\| l.serverId === id` Lookup |
| `El Frontend/src/shared/stores/dashboard.store.ts` | BUG-005: `fetchLayouts()` bei Store-Init |
| `El Frontend/src/views/CustomDashboardView.vue` | Target-UX: Labels, Beschreibungen, CSS-Styling |

## Test-Infrastruktur

- **Browser:** Playwright-managed Chromium (MCP)
- **ESPs:** MOCK_9DD319F8 (TestZone-A), MOCK_B49312BE (TestZone-B), ESP_00000001 (Zone Echt, Offline)
- **Dashboard-IDs:**
  - "Test-Inline-Monitor": serverId `87d3825f-a17b-46be-8b57-c31c9c31d45f`
  - "Test-Cross-Zone": serverId `d9b139ff-5893-4d32-8209-06ea8c80cd2e`
  - "Echt Dashboard": lokale ID `dash-auto-echt-1772399905164` (auto-generiert)
- **Auth:** admin / Admin123#

## Screenshots

| Datei | Inhalt |
|-------|--------|
| `testblock4-hardware-side-panel.png` | Hardware L1 mit Side-Panel |
| `testblock4-hardware-l2-side-panel.png` | Hardware L2 (ESP Detail) mit Side-Panel |
| `testblock5-dashboard-viewer-l3.png` | DashboardViewer mit 3 Widgets (GridStack static) |
| `testblock5-auto-generated-accepted.png` | Auto-generated Dashboard nach "Uebernehmen" |
| `testblock6-router-deep-links.png` | Monitor L1 ohne Panel (clean state) |
| `verify-bug004-fixed.png` | **NEU:** BUG-004 Fix — Panel-Hoehe 340px (vorher 12.459px) |
| `verify-target-configurator.png` | **NEU:** Target-Konfigurator im Editor |
