# ANALYSE-ED-2 — View-Modi, Dashboard-Platzierung & Navigation

> **Typ:** Reine Analyse (KEIN Code aendern)
> **Schicht:** Frontend (komplett)
> **Aufwand:** ~4-5h
> **Abhaengigkeit:** Keine
> **Roadmap:** `arbeitsbereiche/automation-one/roadmap-editor-dashboard-integration-2026-03-30.md` Block B
> **Geprueft:** 8 Dateipfade, 1 Router, 1 Roadmap-Referenz — alle verifiziert (2026-03-30)

---

## Kontext

AutomationOne hat drei Dashboard-bezogene Bereiche: den **Editor** (CustomDashboardView mit GridStack), den **Monitor** (MonitorView mit InlineDashboardPanels) und die **Uebersicht** (Dashboard-Tab). Der Editor hat zwei Modi: **Bearbeiten** (GridStack interaktiv, `isEditing === true`) und **Ansichtsmodus** (Vorschau, `isEditing === false`). Ausserdem gibt es "Im Monitor anzeigen" (Target-System). Das Dashboard-System hat ein `target`-Feld (JSON-Spalte, Server-seitig gespeichert) das steuert wo ein Dashboard angezeigt wird.

**Phase 7 D2:** Die Route `monitor-dashboard` (ohne zoneId) ist ein Redirect zum Editor. ABER die Route `monitor/:zoneId/dashboard/:dashboardId` (Name: `monitor-zone-dashboard`) ist NOCH AKTIV und fuehrt zu MonitorView.vue. InlineDashboardPanel wird nach D2 noch an **4 Stellen** in MonitorView genutzt:
1. Zone-Tiles Mini-Widgets (A1 Phase 3, extra-Slot)
2. L2 Inline-Panels
3. Bottom-Panels
4. Side-Panels

Die Target-Pipeline ist intakt — D2 hat nur die losgeloesten Cross-Zone-Panels auf L1 entfernt.

**Beobachtete Probleme:**
1. Der **Ansichtsmodus** (Auge-Icon in der Editor-Toolbar) zeigt die gleiche Darstellung wie der Editor — kein sichtbarer Unterschied fuer den User.
2. **"Im Monitor anzeigen"** (Pin-Icon) funktioniert nicht — es passiert nichts Sichtbares im Monitor.
3. Die **Dashboard-Cards** in der Uebersicht sind kleine, verwirrend formatierte Karten die schwer zu lesen und zu navigieren sind.

---

## Analyse-Punkte

### B1. Ansichtsmodus — IST-Zustand (60 min)

**Was:** Der Editor hat ein Auge-Icon in der Toolbar das den "Ansichtsmodus" aktiviert. Im Ansichtsmodus soll der User sehen wie das Dashboard tatsaechlich aussieht — ohne Editor-Werkzeuge.

**Bekannter State:** Der Ansichtsmodus wird durch die Ref `isEditing` (Zeile ~106 in CustomDashboardView.vue) gesteuert. Toggle-Funktion: `toggleEditMode()`. Ansichtsmodus = `isEditing === false`. Es gibt KEIN `isPreview`, KEIN `isViewMode`, KEIN `locked` — nur `isEditing`.

**ACHTUNG: CustomDashboardView.vue ist ~1935 Zeilen gross (nicht ~620 wie urspruenglich angenommen). Gruendlich durcharbeiten.**

**Pruefen:**
1. In `CustomDashboardView.vue`: Wie wird `isEditing` initial gesetzt? Wird es aus einer Route-Query oder aus dem Store geladen?
2. Was passiert visuell wenn `isEditing === false`?
   - Wird der Widget-Katalog (linke Seitenleiste) ausgeblendet?
   - Wird die Editor-Toolbar (oben) ausgeblendet oder reduziert?
   - Werden GridStack Drag-Handles und Resize-Handles deaktiviert? (Wird `grid.setStatic(true)` oder `grid.enableMove(false)` aufgerufen?)
   - Werden Widget-Hover-Toolbars (Gear/X-Buttons) deaktiviert?
3. Vergleich IST vs. SOLL:
   - **IST:** Was sieht der User wenn er den Ansichtsmodus aktiviert? Welche UI-Elemente verschwinden, welche bleiben?
   - **SOLL:** Der User sieht NUR die Widgets in ihrem Layout, ohne jegliche Editor-Elemente. Wie im Monitor oder als eigenstaendige Seite. Keine Interaktion ausser Hover/Tooltips auf Charts.
4. Hat `useDashboardWidgets.ts` eine `readOnly`-Option? Wird sie im Ansichtsmodus aktiviert? Was bewirkt sie genau?
5. Gibt es CSS-Klassen die den Modus steuern (z.B. `is-editing`, `view-mode`)? In 1935 Zeilen koennen mehrere CSS-basierte Modus-Switches stecken.

**Akzeptanz:** Exakter IST-Zustand dokumentiert (was passiert beim Toggle, was nicht). Root Cause warum es identisch zum Editor aussieht.

---

### B2. "Im Monitor anzeigen" — Target-System (75 min)

**Was:** Der Editor hat ein Pin/Location-Icon das ein Dashboard "im Monitor" platzieren soll. Dahinter steckt das `target`-System: Ein Dashboard hat ein `target`-Feld das definiert wo es angezeigt wird.

**Bekanntes DashboardTarget-Interface:**
```
DashboardTarget = {
  view: 'monitor' | 'hardware',
  placement: 'page' | 'inline' | 'side-panel' | 'bottom-panel',
  anchor?: string,
  panelPosition?: 'left' | 'right'
}
```
**ACHTUNG:** `scope` und `zoneId` liegen auf `DashboardLayout`, NICHT auf `DashboardTarget`. `scope: 'global'` existiert NICHT. Die gueltigen DashboardScope-Werte sind: `'zone' | 'zone-tile' | 'cross-zone' | 'sensor-detail'`.

**Pruefen:**
1. Welcher Button/Icon aktiviert "Im Monitor anzeigen"? Exakte Datei und Zeile in `CustomDashboardView.vue`.
2. Was passiert beim Klick? Wird `setLayoutTarget()` aufgerufen? Welcher Target-Wert wird gesetzt? Welcher Scope auf dem Layout?
3. Welche Target-Werte werden tatsaechlich im Code verwendet? Vollstaendige Liste aller `placement`- und `view`-Werte die gesetzt oder abgefragt werden.
4. Was macht der Server mit dem Target? Wird es gespeichert? Gibt es einen Endpunkt?
5. **Wie liest die MonitorView Targets?** Es gibt DREI Store-Computed-Properties die nach Target filtern:
   - `inlineMonitorPanels` (Alias fuer `inlineMonitorPanelsCrossZone`) — filtert nach welchem Target?
   - `sideMonitorPanels` — filtert nach `placement: 'side-panel'`?
   - `bottomMonitorPanels` — filtert nach `placement: 'bottom-panel'`?
   - MonitorView kombiniert diese in einer lokalen `inlineMonitorPanelsL2` Computed (cross-zone + zone-spezifisch). Wie genau?
6. **Alle 4 aktiven InlineDashboardPanel-Stellen in MonitorView dokumentieren:**
   - Zone-Tile Mini-Widget (A1 Phase 3)
   - L2 Inline-Panel
   - Bottom-Panel
   - Side-Panel
   Fuer jede Stelle: Welche Target-Werte werden erwartet? Welcher `mode`-Prop wird uebergeben?
7. Route-Analyse:
   - `monitor-dashboard` (ohne zoneId) → Redirect auf `/editor/:dashboardId` (D2)
   - `monitor-zone-dashboard` = `monitor/:zoneId/dashboard/:dashboardId` → NOCH AKTIV, geht zu MonitorView.vue
   - Was passiert wenn ein User die aktive Route `monitor-zone-dashboard` aufruft?
8. Was macht `QuickDashboardPanel.vue`? Es ist ein **Sub-Panel im FAB** (QuickActionBall), NICHT direkt in MonitorView eingebettet. Navigiert es zum Editor oder zum Monitor? Welche Route wird aufgerufen?

**Akzeptanz:** Vollstaendiger Datenfluss: Button-Klick → Target gesetzt → Store-Computed filtert → MonitorView rendert InlineDashboardPanel. Wenn die Kette unterbrochen ist: exakte Stelle wo sie bricht. Alle 3 Store-Computed-Properties (inline/side/bottom) dokumentiert.

---

### B3. Dashboard-Cards in der Uebersicht (30 min)

**Was:** Die Dashboard-Uebersicht (Tab "Uebersicht" oder "Dashboard" in der Navigation) zeigt Dashboard-Karten. Diese sind klein, verwirrend formatiert und schwer zu navigieren.

**Pruefen:**
1. Welche View zeigt die Dashboard-Uebersicht? `CustomDashboardView.vue` im Nicht-Bearbeitend-Modus (`isEditing === false`) oder eine separate Komponente?
2. Wie werden die Dashboard-Cards gerendert? Gibt es eine `DashboardCard.vue` Komponente?
3. Welche Informationen zeigt eine Card? (Name, Widget-Anzahl, Zone, Scope, Auto-Generiert-Badge, Letzte Aenderung?)
4. Wie gross sind die Cards? CSS-Analyse: Grid/Flex-Layout, min-width, max-width.
5. Gibt es Sortier- oder Filterfunktionen? (Nach Zone, nach Datum, Auto vs. Manuell?)
6. Wie navigiert man von einer Card zum Editor? Klick → welche Route?
7. D1 hat einen "Loeschen"-Button pro Card hinzugefuegt + Bulk-Cleanup-Button mit Checkbox-Liste — funktionieren sie?

**Akzeptanz:** Layout und Inhalt der Cards dokumentiert. Verbesserungsvorschlaege fuer Lesbarkeit und Navigation.

---

### B4. Modus-Wechsel-Workflow (45 min)

**Was:** Der User sollte ein Dashboard erstellen und es dann flexibel platzieren koennen: im Monitor (bei einer Zone), in der Uebersicht, oder als eigenstaendiges Dashboard. Aktuell gibt es keinen klaren Workflow dafuer.

**Pruefen:**
1. Welche Placements kennt das DashboardTarget-System? Vollstaendige Liste aus Code: `page`, `inline`, `side-panel`, `bottom-panel` — gibt es weitere?
2. Welche Scopes kennt DashboardLayout? `zone`, `zone-tile`, `cross-zone`, `sensor-detail` — gibt es weitere?
3. Kann ein Dashboard seinen Target/Scope aendern? Oder wird es bei Erstellung fixiert?
4. Gibt es ein UI-Element wo der User das Placement waehlen kann? (Target-Dropdown im Editor?)
5. Was passiert mit Auto-generierten Dashboards (via `generateZoneDashboard()`)? Haben sie ein festes Target und Scope?
6. Wie wird der User informiert wo sein Dashboard angezeigt wird? Gibt es visuelles Feedback?
7. Kann ein Dashboard gleichzeitig im Monitor UND als eigenstaendiges Dashboard sichtbar sein?

**Akzeptanz:** Workflow-Diagramm: Erstellen → Konfigurieren → Platzieren. Luecken und fehlende UI-Elemente identifiziert.

---

### B5. Navigation zwischen Editor, Monitor und Uebersicht (30 min)

**Was:** Der User braucht 3 Klicks um vom Monitor zum Editor zu kommen. Die Breadcrumbs sind verwirrend ("Editor > Zelt Wohnzimmer Dash..."). Es gibt keinen schnellen Hin-und-Her-Wechsel.

**Pruefen:**
1. Welche Routen gibt es fuer Dashboard-bezogene Views? Alle auflisten aus `router/index.ts`. Mindestens:
   - Editor-Route(n)
   - `monitor-dashboard` (Redirect)
   - `monitor-zone-dashboard` (AKTIV, geht zu MonitorView)
   - Dashboard-Uebersicht
2. Wie gelangt man vom Monitor L2 zum Editor eines bestimmten Dashboards?
3. Wie gelangt man vom Editor zurueck zum Monitor (zur Zone)?
4. Gibt es "Im Editor bearbeiten" und "Zurueck" Buttons? Wo genau?
5. Wie sieht die Breadcrumb-Navigation aus? (Top-Bar im Screenshot: "Editor > Zelt Wohnzimmer Dash...")
6. Gibt es Quick-Links zwischen den drei Tab-Modi (Uebersicht, Monitor, Editor)?

**Akzeptanz:** Navigations-Matrix: Von/Nach fuer alle 3+ Views. Fehlende Wege identifiziert.

---

### B6. InlineDashboardPanel im Monitor — Vollstaendige Bestandsaufnahme (45 min)

**Was:** InlineDashboardPanel wird nach D2 noch an **4 Stellen** in MonitorView genutzt. Die Target-Pipeline ist intakt. Die Frage ist: Welche Stellen funktionieren, welche nicht, und was fehlt fuer "Im Monitor anzeigen"?

**ACHTUNG: InlineDashboardPanel.vue ist ~424 Zeilen gross (nicht ~165 wie urspruenglich angenommen). Gruendlich durcharbeiten.**

**Pruefen:**
1. **Alle 4 Verwendungsstellen** in MonitorView.vue einzeln dokumentieren:
   - **Zone-Tile Mini-Widget** (A1 Phase 3): Welcher `mode`-Prop? Welches Dashboard wird geladen? Ueber `getZoneMiniPanelId()`?
   - **L2 Inline-Panel**: Welcher `mode`-Prop? Wie wird das Dashboard identifiziert? Ueber lokale `inlineMonitorPanelsL2` Computed?
   - **Bottom-Panel**: Welcher `mode`-Prop? Ueber `bottomMonitorPanels` aus Store?
   - **Side-Panel**: Welcher `mode`-Prop? Ueber `sideMonitorPanels` aus Store? `panelPosition: 'left'|'right'`?
2. Welche `mode`-Prop-Werte kennt InlineDashboardPanel? (Bekannt: `'view'`, `'manage'`, `'inline'`, `'side-panel'`). Welche Werte setzen die 4 Stellen?
3. Hat der `compact`-Prop (A1 Phase 3) Auswirkungen auf die Darstellung? Welche Widgets werden im Compact-Modus erlaubt? (`TILE_ALLOWED_WIDGET_TYPES`: gauge, sensor-card)
4. Kann InlineDashboardPanel ein **vollstaendiges** Dashboard (nicht nur Mini-Widgets) im Monitor rendern? Oder ist es auf bestimmte Widget-Typen/Groessen limitiert?
5. Was waere noetig um "Im Monitor anzeigen" zum Laufen zu bringen — ohne den D2-Cleanup rueckgaengig zu machen? Reicht es das Target korrekt zu setzen, oder fehlt UI-Code der das Target ausliest?

**Akzeptanz:** Pro Verwendungsstelle: mode-Prop, Dashboard-Source, funktioniert ja/nein. Klare Antwort ob die Target-Pipeline fuer "Im Monitor anzeigen" funktionsfaehig ist oder wo sie bricht.

---

## Ergebnis-Format

Die Analyse soll ein Markdown-Dokument liefern mit:

1. **IST-Zustand jedes Modus:** Ansichtsmodus (`isEditing`-Toggle), "Im Monitor anzeigen" (Target-System), Dashboard-Cards — was passiert genau?
2. **Target-System Dokumentation:** DashboardTarget-Interface (view, placement, anchor, panelPosition) + DashboardLayout-Felder (scope, zoneId). Datenfluss Client → Server → Client.
3. **InlineDashboardPanel Bestandsaufnahme:** Alle 4 Verwendungsstellen mit mode-Prop, Source, Status.
4. **Navigations-Matrix:** Von/Nach-Tabelle fuer alle Dashboard-bezogenen Views inkl. `monitor-zone-dashboard`.
5. **Broken-Chain-Analyse:** Wo genau bricht der Datenfluss bei jedem defekten Feature?
6. **Fix-Empfehlungen:** Pro Finding konkreter Vorschlag mit Datei, Stelle, Was aendern.
7. **Aufwand-Schaetzung:** Pro Fix-Empfehlung.

---

## Relevante Dateien

| Datei | Zeilen (ca.) | Relevanz |
|-------|-------------|----------|
| `CustomDashboardView.vue` | ~1935 | Editor-Container, `isEditing`-Toggle, Target-Dropdown |
| `MonitorView.vue` | ~3490 | Monitor L1/L2, 4x InlineDashboardPanel-Nutzung |
| `InlineDashboardPanel.vue` | ~424 | Inline-Dashboard-Rendering, mode/compact-Props |
| `DashboardViewer.vue` | ~367 | Standalone-Dashboard mit staticGrid |
| `dashboard.store.ts` | — | Layouts, Targets, generateZoneDashboard(), setLayoutTarget(), inlineMonitorPanels/side/bottom |
| `router/index.ts` | — | Dashboard-Routen, Redirects, monitor-dashboard, monitor-zone-dashboard |
| `QuickDashboardPanel.vue` | — | Sub-Panel im FAB (QuickActionBall), Dashboard-Navigation |
| `useDashboardWidgets.ts` | — | Widget-Mount/Unmount, readOnly-Option |

---

## Was NICHT analysiert wird

- Widget-Konfiguration (Range, Einheit, Titel) → ANALYSE-ED-1
- Aktor-Steuerung und Logic Rules → ANALYSE-ED-3
- GridStack DnD-Funktionalitaet (D5 optional, eigene Phase)
- Mobile-Responsive (spaeteres Thema)
