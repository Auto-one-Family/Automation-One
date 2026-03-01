# Auftrag: Dashboard Editor — Polishing, Analyse & verbleibende Fixes

> **Erstellt:** 2026-03-01
> **Erstellt von:** Automation-Experte (Life-Repo)
> **Ziel-Repo:** auto-one
> **Kontext:** Der Dashboard Editor hat 4 Bug-Fixes erhalten (2026-03-01) + Layout-Persistenz bestaetigt. Charts sind jetzt reaktiv, Y-Achsen haben Smart Defaults, WidgetConfigPanel existiert, MultiSensorWidget ist integriert. Dieses Polishing adressiert die verbleibenden UX-Luecken und bereitet den Editor fuer seine Rolle als zentrales Konfigurationswerkzeug im neuen Monitor-Konzept vor.
> **Vorgaenger-Auftrag:** `fix-dashboard-editor-charts.md` (4 Bugs GEFIXT + 1 bestaetigt) ~~`auftrag-dashboard-editor-charts-debugging.md`~~
> **Prioritaet:** MITTEL — Editor funktioniert, braucht aber Polish fuer Produktivbetrieb
> **Status:** OFFEN — Anforderungen beschrieben, Ausarbeitung ausstehend

---

## Zusammenfassung: Was wurde bereits gefixt (2026-03-01)

| # | Fix | Datei |
|---|-----|-------|
| 1 | Charts reaktiv auf WebSocket (Watch auf `last_read`, lokaler `ref` State, GridStack init) | LiveLineChart.vue, CustomDashboardView.vue |
| 2 | Y-Achsen Smart Defaults (`SENSOR_TYPE_CONFIG`, suggestedMin/suggestedMax) | LiveLineChart.vue |
> **[verify-plan]** Fix #2 betrifft NUR `LiveLineChart.vue`. `MultiSensorChart.vue` nutzt KEIN `SENSOR_TYPE_CONFIG` — dort fehlt die Y-Achsen-Smart-Default-Integration noch.
| 3 | WidgetConfigPanel.vue SlideOver (Titel, Sensor, Farbe, Y-Range, Zeitraum, Schwellenwerte) | NEU: WidgetConfigPanel.vue |
| 4 | MultiSensorWidget mit Chip-basierter Sensor-Auswahl | NEU: MultiSensorWidget.vue |
| 5 | Layout-Persistenz (war bereits gefixt, Playwright-bestaetigt) | CustomDashboardView.vue |

---

## Verbleibende Anforderungen

### A: Widget-Katalog & Erstellungs-UX

**Was fehlt:** ~~Der User muss Widgets erstellen koennen mit klarer Auswahl aus allen 10 Widget-Typen. Aktuell ist unklar wie ein neues Widget hinzugefuegt wird und welche Typen verfuegbar sind.~~

> **[verify-plan IST-Zustand]** Widget-Katalog **EXISTIERT BEREITS** als Sidebar in `CustomDashboardView.vue` (Zeile 544-558). Toggle-Button (+) in Toolbar, Widgets gruppiert nach Kategorie (Sensoren/Aktoren/System), Klick fuegt Widget direkt auf Canvas ein via `addWidget()`. Es gibt **9 Widget-Typen** (nicht 10) — `WidgetConfigPanel` ist kein Widget-Typ sondern ein SlideOver-Konfigurationspanel. Die 9 Typen: `line-chart`, `gauge`, `sensor-card`, `historical`, `multi-sensor`, `actuator-card`, `actuator-runtime`, `esp-health`, `alarm-list`.
>
> **Verbleibendes Delta:** Katalog hat keine Beschreibungen/Previews pro Widget-Typ, keine Smart-Defaults basierend auf `SENSOR_TYPE_CONFIG` bei Widget-Erstellung.

**Robins Anforderung:**
- Klarer "Widget hinzufuegen" Button (+ Icon) im Editor-Modus
- Widget-Katalog als Grid oder Liste: Alle **9** Typen mit Icon, Name, kurzer Beschreibung
  - LineChart, Gauge, SensorCard, ActuatorCard, HistoricalChart, ESPHealth, AlarmList, ActuatorRuntime, MultiSensor
> **[verify-plan]** ~~Config-Panel~~ ist kein Widget-Typ. `WidgetConfigPanel.vue` ist ein SlideOver-Panel (Zahnrad-Icon), kein platzierbares Widget. `widgetComponentMap` hat exakt 9 Eintraege (Zeile 46-56 in `CustomDashboardView.vue`).
- Klick auf Widget-Typ → Widget erscheint auf dem Canvas mit Smart Defaults
- Smart Defaults basierend auf `SENSOR_TYPE_CONFIG` (aus Bug 2 Fix)
- Widget-Vorschau im Katalog (optional: kleines Preview-Bild)

**Pruefen VOR Implementierung:**
- ~~Wie werden Widgets aktuell erstellt? Gibt es bereits einen "Add Widget" Mechanismus?~~ (**[verify-plan]** Ja — Sidebar-Katalog mit `addWidget(type)`, gruppiert nach Kategorie.)
- Ist `widgetComponentMap` vollstaendig mit allen 9 Typen? (**[verify-plan]** Ja, alle 9 sind registriert.)
- Welche Default-Konfiguration bekommt jeder Widget-Typ?
> **[verify-plan]** Aktuell bekommt jeder Widget nur `{ title: widgetDef.label }` als Default-Config (Zeile 332). Keine sensorspezifischen Smart-Defaults bei Erstellung.

### B: Editor-Modus UX

**Was fehlt:** Klare Trennung zwischen View-Modus (Dashboard anschauen) und Edit-Modus (Dashboard bearbeiten). Der User muss wissen wann er bearbeitet und wann er betrachtet.

> **[verify-plan IST-Zustand]** Aktuell ist die View **IMMER im Edit-Modus**. GridStack ist permanent aktiv mit `float: true`, `animate: true`, `removable: true`. Widgets sind immer verschiebbar/resizebar, Zahnrad-Icon erscheint bei Header-Hover. Es gibt keinen `isEditing`/`editMode` State. Die gesamte Trennung muss NEU gebaut werden — das ist korrekt als Anforderung.

**Robins Anforderung:**
- Expliziter Edit-Mode-Toggle (wie ThingsBoard: "Bearbeiten" Button oben rechts)
- Im View-Modus: Widgets sind statisch, kein DnD, kein Resize, kein Zahnrad
- Im Edit-Modus: Widgets sind verschiebbar, resizebar, Zahnrad-Icon erscheint
- Visueller Unterschied: Leichte Border/Outline um Widgets im Edit-Modus
- "Fertig" / "Aenderungen speichern" Button um Edit-Modus zu verlassen

### C: Dashboard-Persistenz Server-API (Vorbereitung)

**Was fehlt:** Aktuell localStorage-only. Fuer den Produktivbetrieb braucht es eine Server-API damit Dashboards user-uebergreifend verfuegbar sind.

> **[verify-plan IST-Zustand]** Bestaetigt: Persistenz ist rein `localStorage` (`STORAGE_KEY = 'automation-one-dashboard-layouts'` in `dashboard.store.ts`). Server-seitig existiert **KEINE** Dashboard-Infrastruktur — kein Model, kein Router, kein Service, kein Alembic-Migration. `/api/v1/dashboards` ist in `REST_ENDPOINTS.md` nicht registriert. Das ist ein kompletter Neubau auf Backend-Seite.

**Robins Anforderung:**
- Backend-Endpoint: `POST/GET/PUT/DELETE /api/v1/dashboards`
- Dashboard-Modell: id, title, layout (JSON), owner_id, created_at, updated_at
- Alembic-Migration fuer `dashboards`-Tabelle
- Frontend: localStorage als Fallback, Server-API als primaere Persistenz
- Dashboard-Liste: Alle eigenen Dashboards + geteilte Dashboards anzeigen

**Hinweis:** Dieser Punkt ist Vorbereitung — die eigentliche Dashboard-Galerie kommt im Monitor-Konsolidierungs-Auftrag.

### D: Template-System

**Was fehlt:** Leeres Dashboard ist einschuechternd fuer neue User. Templates als Startpunkt senken die Einstiegshuerde um ~45% (Recherche-Erkenntnis).

> **[verify-plan IST-Zustand]** Kein Template-System vorhanden. `createLayout()` in `dashboard.store.ts` erstellt immer ein leeres Layout (`widgets: []`). Import-Funktion koennte als Basis dienen (Layouts aus JSON laden). Kein `templates/`-Ordner oder Template-Registry im Code.

**Robins Anforderung:**
- 3-4 vorgefertigte Templates:
  - "Zonen-Uebersicht" — 1 Gauge pro Zone, Temperaturen + Feuchtigkeit
  - "Sensor-Detail" — 1 grosses Line-Chart (24h), Y-Achse passend, Schwellenwerte
  - "Multi-Sensor-Vergleich" — 1 MultiSensorChart mit 2-3 Sensoren
  - "Leer starten" — Leeres Canvas
- Template-Auswahl beim Erstellen eines neuen Dashboards
- Templates nutzen `SENSOR_TYPE_CONFIG` Smart Defaults
- Templates passen sich automatisch an vorhandene Sensoren an (wenn moeglich)

### E: Zahlenwerte mit Kontext

**Was fehlt:** Charts zeigen nackte Zahlen ohne Kontext. "23.5" sagt nichts — "23.5°C (optimal: 20-25°C)" sagt alles.

> **[verify-plan IST-Zustand]** Teilweise vorhanden:
> - **Einheiten**: Werden bereits in allen Widgets angezeigt (`currentSensor.unit`) — SensorCardWidget, GaugeWidget, LineChartWidget, HistoricalChartWidget, MultiSensorWidget, AlarmListWidget.
> - **Kontext (min-max)**: Nur im `WidgetConfigPanel` als Y-Achse-Hint sichtbar (`sensorTypeConfig.label: min–max unit`), NICHT im Chart selbst.
> - **Threshold-Linien**: `LiveLineChart.vue` hat bereits `ThresholdConfig` Interface, `thresholdAnnotations` Computed und `showThresholds` Prop (Zeile 43-88, 121-126). Aber: Kein Widget uebergibt automatisch Schwellenwerte aus `SENSOR_TYPE_CONFIG` — der User muss manuell im ConfigPanel aktivieren, und es fehlt eine automatische Befuellung.
> - **Verbleibendes Delta**: Kontext-Labels IM Chart (nicht nur im Config-Panel), automatische Threshold-Befuellung aus SENSOR_TYPE_CONFIG, Farb-Kodierung (Gruen/Gelb/Rot).

**Robins Anforderung:**
- Sensor-Werte mit Einheit anzeigen (aus `SENSOR_TYPE_CONFIG`)
- Optionale Kontext-Anzeige: "23.5°C (optimal: 20-25°C)" im Tooltip oder als Subtitle
- Threshold-Linien aus WidgetConfigPanel korrekt im Chart rendern (gestrichelt, beschriftet)
- Farb-Kodierung: Gruen = OK, Gelb = Warnung, Rot = Alarm (nie Farbe allein — immer mit Label)

### F: Bestehende Bugs & Edge Cases pruefen

**Robins Anforderung — systematisch durchpruefen:**
- Widget loeschen: Funktioniert? Wird Layout korrekt aktualisiert?
> **[verify-plan]** `grid.on('removed')` Handler existiert (Zeile 129-141): unmountet Vue-Komponenten via `render(null, mountEl)` und ruft `autoSave()` auf. Grundmechanismus vorhanden.
- Widget resizen: Min/Max-Groessen beachtet? Chart skaliert korrekt?
> **[verify-plan]** `minW`/`minH` werden pro Widget-Typ definiert (Zeile 75-85) und an `grid.addWidget()` uebergeben. GridStack erzwingt Mindestgroessen.
- Leeres Dashboard laden: Zeigt es eine sinnvolle Empty-State-Anzeige?
> **[verify-plan]** Ja — `v-if="!dashStore.activeLayoutId"` zeigt LayoutGrid-Icon + "Erstelle ein neues Dashboard oder waehle ein bestehendes aus." (Zeile 562-565).
- Mehrere Dashboards: Kann der User zwischen verschiedenen Layouts wechseln?
> **[verify-plan]** Ja — Layout-Selector-Dropdown mit `switchLayout()` existiert (Zeile 489-518). Layouts werden in `dashboard.store.ts` verwaltet.
- Browser-Resize: Widgets responsive? GridStack breakpoints?
- Error States: Was passiert wenn Sensor offline? Wenn Backend nicht erreichbar?
- Memory Leaks: Chart.js Instanzen korrekt aufgeraeumt bei Widget-Loeschung?
> **[verify-plan]** `onUnmounted()` raeumt alle `mountedWidgets` via `render(null, el)` auf (Zeile 166-177). `grid.on('removed')` raeumt einzelne Widgets auf. Chart.js-Cleanup haengt davon ab, ob die Child-Komponenten (LiveLineChart, etc.) ihren eigenen `onUnmounted()` haben — muss geprueft werden.

---

## Betroffene Dateien

| Datei | Aenderungen |
|-------|-------------|
| `CustomDashboardView.vue` | Edit-Mode-Toggle, Widget-Katalog, Templates |
| `WidgetConfigPanel.vue` | Kontext-Anzeige, Threshold-Rendering |
| `LiveLineChart.vue` | Kontext-Labels, Threshold-Linien |
| `MultiSensorWidget.vue` | Edge-Cases, Error-States |
| `MultiSensorChart.vue` | **[verify-plan]** SENSOR_TYPE_CONFIG fuer Y-Achsen-Smart-Defaults (fehlt aktuell) |
| `dashboard.store.ts` | Server-Persistenz, Template-Logik, Edit-Mode-State |
| **Backend NEU:** `dashboards.py` | REST-Endpoints, DB-Modell, Migration |
> **[verify-plan]** Volle Pfade: `El Frontend/src/views/CustomDashboardView.vue`, `El Frontend/src/components/dashboard-widgets/WidgetConfigPanel.vue`, `El Frontend/src/components/charts/LiveLineChart.vue`, `El Frontend/src/components/dashboard-widgets/MultiSensorWidget.vue`, `El Frontend/src/components/charts/MultiSensorChart.vue`, `El Frontend/src/shared/stores/dashboard.store.ts`. Route: `/custom-dashboard`.

---

## Abgrenzung

**IN diesem Auftrag:**
- Dashboard-Editor interne UX-Verbesserungen
- Widget-Katalog und Erstellungs-Flow
- Edit-Mode / View-Mode Trennung
- Server-Persistenz Vorbereitung
- Template-System
- Edge-Case-Pruefung

**NICHT in diesem Auftrag:**
- Dashboard-Galerie im Monitor-Tab (→ `auftrag-monitor-komponentenlayout-erstanalyse.md`)
- Dashboards als Zonenebenen im Monitor einbetten (→ Monitor-Konsolidierung)
- Cross-Zone-Dashboards als LinkCards (→ Monitor-Konsolidierung)
- ECharts-Migration (→ separater Auftrag wenn Chart.js Grenzen erreicht)
- Event-Overlay / Rule-Execution-Annotationen (→ Logic Rules Live-Monitoring)
- ~~Dashboard-Export/Import JSON (→ spaeter)~~ **[verify-plan]** Export/Import ist **BEREITS IMPLEMENTIERT**: `handleExport()` (JSON-Download) und `handleImport()` (File-Upload mit JSON-Parse) in `CustomDashboardView.vue` Zeile 442-474. Download/Upload-Buttons in Toolbar vorhanden.

---

## Beziehung zu anderen Auftraegen

| Auftrag | Beziehung |
|---------|-----------|
| ~~`auftrag-dashboard-editor-charts-debugging.md`~~ → **`fix-dashboard-editor-charts.md`** | Vorgaenger — 4+1 Fixes bilden die Basis |
> **[verify-plan]** Dateiname korrigiert. Liegt in `.claude/reports/current/fix-dashboard-editor-charts.md`.
| `auftrag-monitor-komponentenlayout-erstanalyse.md` | Definiert wo/wie Dashboards im Monitor erscheinen |
| `auftrag-logic-rules-live-monitoring-integration.md` | Definiert wie Rule-Executions in Charts erscheinen |
| ~~`frontend-konsolidierung/auftrag-view-architektur-dashboard-integration.md`~~ → **`auftrag-view-architektur-dashboard-integration.md`** | Aelterer Auftrag — wird durch Monitor-Erstanalyse teilweise abgeloest |
| ~~`frontend-konsolidierung/auftrag-dashboard-umbenennung-erstanalyse.md`~~ | Tab-Umbenennung bereits umgesetzt |
| ~~`frontend-konsolidierung/auftrag-dashboard-reaktivitaet-performance.md`~~ → **`auftrag-dashboard-reaktivitaet-performance.md`** | Teilweise durch Bug-Fixes erledigt — Rest hier aufgenommen |
> **[verify-plan]** Pfad-Korrekturen: Es gibt KEINEN Unterordner `frontend-konsolidierung/`. Alle Dateien liegen flach in `.claude/reports/current/`. `auftrag-dashboard-umbenennung-erstanalyse.md` **EXISTIERT NICHT** im Repository.

---

## Wichtig: Editor als zentrales Konfigurationswerkzeug

Der Dashboard-Editor wird im neuen Monitor-Konzept (siehe `auftrag-monitor-komponentenlayout-erstanalyse.md`) eine zentrale Rolle spielen:

- Zonen-spezifische Dashboards werden IM EDITOR konfiguriert
- Cross-Zone-Dashboards werden IM EDITOR erstellt
- Auto-generierte Ansichten koennen IM EDITOR angepasst werden

Dieser Polishing-Auftrag stellt sicher dass der Editor DAFUER bereit ist — solide Grundfunktionalitaet, gute UX, saubere Persistenz. Die eigentliche Integration kommt im Monitor-Konsolidierungs-Auftrag.

> **[verify-plan Gesamtbewertung]** Der Editor hat bereits mehr Grundfunktionalitaet als der Plan annimmt:
> - Widget-Katalog (Sidebar + Kategorien + addWidget) — **existiert**
> - Export/Import JSON — **existiert**
> - Mehrere Dashboards + Switching — **existiert**
> - Empty-State-Anzeige — **existiert**
> - Widget-Loeschung mit Cleanup — **existiert**
> - Min/Max GridStack-Constraints — **existiert**
> - WidgetConfigPanel mit Sensor-Kontext — **existiert**
>
> **Echte Luecken die der Auftrag adressieren muss:**
> 1. Edit/View-Mode-Trennung (aktuell immer editierbar)
> 2. SENSOR_TYPE_CONFIG in MultiSensorChart.vue (Y-Achsen-Defaults fehlen)
> 3. Smart-Defaults bei Widget-Erstellung (aktuell nur `{ title }`)
> 4. Threshold-Linien automatisch aus SENSOR_TYPE_CONFIG befuellen
> 5. Template-System (komplett neu)
> 6. Server-API fuer Dashboard-Persistenz (komplett neu auf Backend-Seite)
> 7. Widget-Katalog: Beschreibungen und Preview pro Typ
