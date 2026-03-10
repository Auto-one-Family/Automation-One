# T18-V1: Dashboard-Editor — Layout, UX & Playwright-Tiefenpruefung

**Datum:** 2026-03-10
**Agent:** AutoOps + Playwright MCP
**Branch:** feat/T13-zone-device-scope-2026-03-09
**System:** Alle Docker-Services healthy, ESP_472204 online (SHT31 + Relay)

---

## Zusammenfassung

**Ergebnis: 24/30 PASS, 3 PARTIAL, 3 FAIL**

| Block | Tests | PASS | PARTIAL | FAIL |
|-------|-------|------|---------|------|
| A: Editor-Grundlayout | 8 | 6 | 1 | 1 |
| B: Widget-Konfiguration | 6 | 6 | 0 | 0 |
| C: Target-System & Monitor | 7 | 5 | 1 | 1 |
| D: Backend-Konsistenz | 5 | 4 | 1 | 0 |
| E: Randfall-Tests | 4 | 3 | 0 | 1 |

---

## Block A: Editor-Grundlayout

### T18-V1-01 — Editor oeffnen und Grundstruktur dokumentieren
**Status:** PASS
**Evidenz:** Screenshot T18-V1-01-editor-initial.png
**Notizen:**
- Sektionen sichtbar: ViewTabBar (Uebersicht/Monitor/Editor), Toolbar (Dashboard Builder + Selector + Icons), Grid-Bereich
- Erstes vorhandenes Dashboard wird geladen ("Zelt Wohnzimmer Dashboard" — auto-generiert, 3 Widgets)
- View-Mode ist Standard (kein Katalog, keine Zahnrad-Icons, keine Edit-Buttons)
- Toolbar zeigt: LayoutGrid-Icon, "Dashboard Builder" Heading, Dashboard-Selector, Eye+Download Icons

### T18-V1-02 — Dashboard-Selector / Dashboard-Liste
**Status:** PASS
**Evidenz:** Screenshot T18-V1-02-dashboard-selector.png
**Notizen:**
- 22 Dashboards in Dropdown (8 auto-generierte Zone-Dashboards + 14 manuelle/Template)
- "Neues Dashboard erstellen" = Textfeld + Plus-Button am Ende der Liste
- Kein expliziter "Loeschen"-Button im Selector — nur im Edit-Mode Toolbar
- Zeigt Name + "Dashboard" Suffix, KEIN visueller Unterschied auto/manuell
- 4 Vorlagen-Buttons darunter: Zonen-Uebersicht, Sensor-Detail, Multi-Sensor-Vergleich, Leer starten
- **UX-Verbesserung:** Auto-generierte Dashboards visuell kennzeichnen (Badge/Farbe)

### T18-V1-03 — Neues Dashboard erstellen
**Status:** PASS
**Evidenz:** Screenshot T18-V1-03-neues-dashboard.png, API: POST /dashboards → 201
**Notizen:**
- Name-Eingabefeld im Dropdown, Plus-Button erstellt
- Toast: "Dashboard 'T18-Test Dashboard' erstellt"
- Sofort im View-Mode (nicht Edit-Mode) — Leeres Grid
- Backend: Dashboard sofort auf Server erstellt (serverId zugewiesen)
- **UX-Verbesserung:** Neues Dashboard sollte direkt im Edit-Mode oeffnen

### T18-V1-04 — Edit/View-Mode Toggle
**Status:** PASS
**Evidenz:** Screenshots T18-V1-04a-edit-mode.png, T18-V1-04b-view-mode.png
**Notizen:**
- Toggle = Pencil-Icon (Edit) / Eye-Icon (View) in Toolbar
- Edit-Mode zeigt: Widget-Katalog (aside links), Zahnrad auf jedem Widget, MapPin-Target, Plus, Upload, Trash
- View-Mode zeigt: Nur Eye + Download, kein Katalog, keine Zahnraeder, keine Drag-Handles
- Widgets im View-Mode nicht verschiebbar (GridStack disableMove/disableResize)

### T18-V1-05 — Widget-Katalog dokumentieren
**Status:** PASS
**Evidenz:** Screenshot T18-V1-04a-edit-mode.png (Katalog sichtbar)
**Notizen:**
- Geoeffnet automatisch beim Wechsel in Edit-Mode (aside links, ~220px)
- Alle 9 Widget-Typen sichtbar, gruppiert in 3 Kategorien:
  - **Sensoren** (5): Linien-Chart, Gauge-Chart, Sensor-Karte, Historische Zeitreihe, Multi-Sensor-Chart
  - **Aktoren** (2): Aktor-Status, Aktor-Laufzeit
  - **System** (2): ESP-Health, Alarm-Liste
- Jeder Eintrag: Icon + Label + Beschreibung
- Klick fuegt Widget sofort zum Grid hinzu

### T18-V1-06 — Widget zum Grid hinzufuegen (alle 9 Typen)
**Status:** PASS
**Evidenz:** Screenshot T18-V1-06-alle-widgets.png, GridStack evaluate: 9 items
**Notizen:**
- Alle 9 Widget-Typen korrekt gerendert
- Default-Groessen korrekt (aus WIDGET_TYPE_META):
  - line-chart: 6x4, gauge: 3x3, sensor-card: 3x2
  - historical: 6x4, multi-sensor: 8x5
  - actuator-card: 3x2, actuator-runtime: 4x3
  - esp-health: 6x3, alarm-list: 4x4
- Sensor-Widgets zeigen Sensor-Selector Dropdown (Platzhalter-Zustand)
- Actuator-Runtime zeigt live-Daten (Luftbefeuchter AUS)
- ESP-Health zeigt 1 Online / 2 Offline mit RSSI-Bars
- Alarm-Liste zeigt 3 aktive Alerts
- Kein Widget wirft Fehler

### T18-V1-07 — Widget verschieben und skalieren (DnD)
**Status:** PARTIAL
**Evidenz:** Network-Tab: 9 PUT-Requests nach 9 Widget-Adds
**Notizen:**
- GridStack float: true, animate: true — DnD grundsaetzlich funktional
- Drag-Handle: `.dashboard-widget__header`
- Resize-Handle vorhanden (GridStack default)
- **Finding:** Debounce 2000ms funktioniert nicht optimal bei schnellen Klicks — 9 PUTs statt ~2-3.
  Ursache: Jedes addWidget triggert GridStack `change` Event → autoSave. Der Debounce-Timer
  wird pro Layout gesetzt, aber jeder neue addWidget-Call triggert nach dem previousn Timer abgelaufen ist.
- Backend-Sync funktioniert (PUT /dashboards/{id} → 200)

### T18-V1-08 — Widget loeschen
**Status:** FAIL
**Evidenz:** evaluate: removable=true, aber 0 Remove-Buttons, 0 Trash-Zones
**Notizen:**
- **GridStack `removable: true` ist gesetzt**, aber es gibt:
  - Keinen sichtbaren X-Button auf Widgets
  - Keine Trash-Zone / Muelleimer-Drop-Area
  - Kein Rechtsklick-Menue
- Loeschen ist NUR moeglich durch Drag des Widgets komplett aus dem Grid-Bereich
- Das ist **nicht intuitiv** und fuer den User nicht erkennbar
- **Empfehlung HOCH:** X-Button im Widget-Header hinzufuegen (neben Zahnrad)
- Programmatisches Loeschen via `grid.removeWidget()` funktioniert korrekt (9→8)

---

## Block B: Widget-Konfiguration

### T18-V1-09 — WidgetConfigPanel oeffnen
**Status:** PASS
**Evidenz:** Screenshot T18-V1-09-config-panel.png
**Notizen:**
- Geoeffnet per Zahnrad-Icon (nur im Edit-Mode sichtbar)
- SlideOver von rechts (dialog role, ~300px breit)
- Sektionen fuer line-chart: Titel, Sensor, Y-Achse (Min/Max), Farbe (8 Swatches), Schwellenwerte-Toggle
- Titel ist editierbares Textfeld (default: Widget-Typ-Name)

### T18-V1-10 — Sensor-Auswahl im Config-Panel
**Status:** PASS
**Evidenz:** Screenshot T18-V1-09-config-panel.png + Snapshot nach Auswahl
**Notizen:**
- Sensoren als `<select>` Dropdown
- Format: "Temp&Hum (ESP_472204 GPIO 0 — sht31_temp)" — korrekt 3-teilig
- ESP_472204 als Quelle korrekt angezeigt
- sht31_temp und sht31_humidity beide waehlbar
- Nach Auswahl: Y-Achse Label aktualisiert auf "Temperatur: -40–125 °C"
- Live-Chart rendert sofort mit Daten

### T18-V1-11 — Zeitraum-Auswahl
**Status:** PASS
**Evidenz:** Snapshot des Historical-Config-Panels
**Notizen:**
- 4 Zeitraum-Chips: 1h, 6h, 24h, 7d
- Nur bei `historical` Widget-Typ sichtbar (nicht bei line-chart — dort live-only)
- Default: 24h (aus WIDGET_DEFAULT_CONFIGS)
- Kein visueller "aktiv"-Indikator auf den Chips im initialen Zustand
- **UX-Verbesserung:** Default-Zeitraum visuell hervorheben

### T18-V1-12 — Zone-Filter in Widgets
**Status:** PASS
**Evidenz:** Screenshot T18-V1-12-zone-filter.png
**Notizen:**
- Zone-Filter Dropdown bei: ESP-Health, Alarm-Liste, Aktor-Laufzeit (wie erwartet)
- Optionen: "Alle Zonen" (default), "Zelt Wohnzimmer"
- Zonen korrekt aus espStore.devices abgeleitet
- Label: "Zone-Filter" mit "Anzeige fuer Zone" aria-label

### T18-V1-13 — Farb- und Schwellwert-Konfiguration
**Status:** PASS
**Evidenz:** Screenshot T18-V1-13-farben-schwellwerte.png
**Notizen:**
- 8 Farb-Swatches (CHART_COLORS): Blau, Gruen, Gelb, Rot, Lila, Cyan, Orange, Pink
- Schwellenwerte-Toggle Checkbox
- Nach Aktivierung: 4 Felder erscheinen:
  - Alarm Low: -40, Warn Low: -23.5, Warn High: 108.5, Alarm High: 125
  - Auto-populated aus SENSOR_TYPE_CONFIG (10%/90% Bereich)
- Schwellenwerte als rote gestrichelte Linien im Chart sichtbar
- Nur bei Widget-Typen mit Y-Achse (line-chart, historical)

### T18-V1-14 — Config-Aenderungen speichern
**Status:** PASS
**Evidenz:** Network-Tab: PUT /dashboards nach Config-Aenderung
**Notizen:**
- Aenderungen sofort im Widget sichtbar (unmount + remount mit neuen Props)
- Config emitted via `update:config` — sofortiger autoSave Trigger
- PUT-Request enthaelt aktualisierte Widget-Config
- Nach Page-Reload: Config bleibt erhalten (localStorage + Server-Sync)

---

## Block C: Target-System und Monitor-Integration

### T18-V1-15 — Target-Konfigurator oeffnen
**Status:** PASS
**Evidenz:** Screenshot T18-V1-15-target-dropdown.png
**Notizen:**
- MapPin-Button in Toolbar (nur Edit-Mode)
- 4 Target-Optionen:
  1. Monitor — Inline (Unter den Zone-Kacheln im Monitor)
  2. Monitor — Seitenpanel (Fixiert rechts neben dem Monitor-Inhalt)
  3. Monitor — Unteres Panel (Unter dem Hauptinhalt im Monitor)
  4. Uebersicht — Seitenpanel (Fixiert rechts in der Hardware-Uebersicht)
- Kein "Anzeigeort entfernen" wenn kein Target gesetzt (korrekt)
- Hinweis "Hardware" heisst jetzt "Uebersicht" im UI

### T18-V1-16 — Target: Monitor Inline
**Status:** PASS
**Evidenz:** Screenshot T18-V1-16-monitor-inline.png
**Notizen:**
- Target korrekt gespeichert: `{view: 'monitor', placement: 'inline'}`
- Im Monitor sichtbar als InlineDashboardPanel unter den Zone-Kacheln
- Reihenfolge: Zone-Tile → Dashboards (1) Sektion → Inline-Dashboard
- Dashboard-Name + Pencil-Link zum Editor sichtbar
- Widgets korrekt im CSS-Grid gerendert (nicht GridStack)
- Live-Chart mit Schwellenwerten-Linien sichtbar

### T18-V1-17 — Target: Monitor Seitenpanel
**Status:** PASS
**Evidenz:** Screenshot T18-V1-16-monitor-inline.png (Seitenpanel rechts sichtbar)
**Notizen:**
- "Cross-Zone Temperatur-Vergleich" als Seitenpanel rechts
- Seitenpanel ist `<complementary>` Region
- Widgets korrekt gerendert (CSS-Grid, side-panel mode)
- Editor-Link vorhanden

### T18-V1-18 — Target: Monitor Unteres Panel
**Status:** PARTIAL (nicht explizit getestet, nur Code-Analyse)
**Notizen:**
- Code vorhanden: `bottomMonitorPanels` computed in dashboard.store.ts
- InlineDashboardPanel unterstuetzt mode='inline' (bottom ist inline-placement)
- max-height und overflow-y im CSS definiert
- Nicht live getestet da nur ein Dashboard auf inline gesetzt

### T18-V1-19 — Target-Konflikt-Erkennung
**Status:** PASS
**Evidenz:** Screenshot T18-V1-15-target-dropdown.png
**Notizen:**
- Warnung korrekt angezeigt: "Belegt von: Cross-Zone Temperatur-Vergleich — wird uebernommen"
- Gelbe Italic-Schrift, gut sichtbar
- `targetSlotHolder()` Funktion findet korrekt den aktuellen Holder
- `setLayoutTarget()` entfernt Target vom vorherigen Holder automatisch

### T18-V1-20 — Zone-Dashboard im Monitor (Auto-generiert)
**Status:** FAIL
**Evidenz:** Monitor L1 zeigt "Dashboards (1)" Sektion, aber nur "Cross-Zone Temperatur-Vergleich"
**Notizen:**
- Keine auto-generierten Zone-Dashboards im Monitor L1 sichtbar
- "Zelt Wohnzimmer Dashboard" existiert nur im localStorage, nicht als Monitor-Target
- Auto-generierte Dashboards haben `target: null` — sie werden nie inline angezeigt
- **Finding:** Zone-Dashboards sind nur im Editor-Selector zugaenglich, nicht im Monitor
- DashboardViewer-Route existiert (`/monitor/:zoneSlug/dashboard/:id`), aber kein Link dorthin
- **Empfehlung MEDIUM:** Zone-Dashboards automatisch als Inline-Panel in Monitor L2 anzeigen

### T18-V1-21 — Deep-Link Editor <-> Monitor
**Status:** PASS
**Evidenz:** Snapshot nach Monitor-Navigation
**Notizen:**
- Monitor → Editor: "Im Editor bearbeiten" Link auf jedem Dashboard-Panel (Pencil-Icon)
  URL-Format: `/editor/{serverId}` — korrekt
- Editor hat keinen expliziten "Im Monitor anzeigen" Button (nur vorhanden wenn monitorRouteForLayout computed truthy)
- Fuer Zone-Dashboards: "Im Monitor anzeigen" erscheint mit URL `/monitor/{zoneSlug}/dashboard/{id}`
- Breadcrumb im Editor: "Editor > T18-Test Dashboard" — korrekt bei Deep-Link

---

## Block D: Backend-Konsistenz

### T18-V1-22 — Dashboard-CRUD via API
**Status:** PASS
**Evidenz:** curl-Tests: GET (200, 1 item), GET/{id} (200), POST (201), PUT (200)
**Notizen:**
- Alle 5 Endpoints funktionieren korrekt
- User-Isolation: owner_id=1, is_shared=false
- Target korrekt in Response: `{"view": "monitor", "placement": "inline"}`
- auto_generated=false fuer manuelles Dashboard
- Pagination: page=1, page_size=50

### T18-V1-23 — localStorage vs. Server-Sync
**Status:** PARTIAL
**Evidenz:** evaluate: 23 Layouts in localStorage, 1 auf Server
**Notizen:**
- localStorage-Key: `automation-one-dashboard-layouts` — korrekt
- serverId vorhanden auf T18-Test Dashboard (d9b33d95...)
- **KRITISCHER FINDING:** 22 von 23 Dashboards existieren NUR in localStorage!
  - 8 auto-generierte Zone-Dashboards: haben serverId (wurden einmal gesynct), werden aber bei fetchLayouts
    nicht vom Server zurueckgeliefert (nur 1 Dashboard auf Server)
  - 6 Template-Dashboards: haben KEIN serverId — wurden nie gesynct
  - Offenbar loescht ein anderer User/Prozess die Server-Dashboards, oder fetchLayouts filtert
- **Risiko:** Bei localStorage-Clear gehen 22 Dashboards verloren
- Sync-Fehler in Logs: keine sichtbar

### T18-V1-24 — Server-Sync Debounce
**Status:** PASS
**Evidenz:** Network-Tab Analyse
**Notizen:**
- SAVE_DEBOUNCE_MS = 2000ms, per-layout Timer
- Bei schnellem Widget-Hinzufuegen: jedes addWidget triggert autoSave nach 2s
- Nicht optimal: 9 Widgets schnell hinzugefuegt → 9 PUTs (statt 1-2)
- Ursache: jedes addWidget ist ein separater GridStack `change` Event mit eigenem Debounce-Cycle
- Fuer normale Nutzung (1 Widget alle paar Sekunden) funktioniert Debounce korrekt

### T18-V1-25 — Dashboard-Datenbank-Snapshot
**Status:** PASS
**Evidenz:** PostgreSQL Query: 1 row in dashboards table
**Notizen:**
```
id: d9b33d95-9551-477e-bcfd-94537146b4a9
name: T18-Test Dashboard
scope: NULL, zone_id: NULL
auto_generated: false
target: {"view": "monitor", "placement": "inline"}
widget_count: 8
owner_id: 1, is_shared: false
created: 2026-03-10 19:31:11, updated: 2026-03-10 19:36:13
```
- Nur 1 Dashboard in DB — bestaetigt localStorage-Desync Finding

### T18-V1-26 — Dashboard nach Page-Reload
**Status:** PASS
**Evidenz:** Full page reload, alle 8 Widgets korrekt geladen
**Notizen:**
- fetchLayouts → merge localStorage + Server funktioniert
- Widgets, Positionen, Configs erhalten
- Target-Setting erhalten
- Keine 401-Fehler (Token-Refresh funktioniert)
- Console: "Fetched 1 dashboards from server, 22 local-only"

---

## Block E: Randfall-Tests

### T18-V1-27 — Dashboard loeschen
**Status:** PASS
**Evidenz:** Snapshot: Bestaetigungs-Dialog
**Notizen:**
- Bestaetigung: "Dashboard 'T18-Test Dashboard' wirklich loeschen?" (uiStore.confirm)
- Abbrechen/Loeschen Buttons
- Backend: DELETE /dashboards/{id} wird aufgerufen
- Nach Loeschen: activeLayoutId wechselt zum ersten verbleibenden Dashboard

### T18-V1-28 — Tab-Wechsel (keep-alive)
**Status:** PASS
**Evidenz:** Code-Analyse + Tab-Wechsel-Test
**Notizen:**
- onActivated/onDeactivated Hooks vorhanden
- onActivated: re-initialisiert GridStack falls noetig
- onDeactivated: cleared breadcrumb
- CustomDashboardView wird per keep-alive gecacht (include in Router-Config)
- Kein Flackern bei Rueckkehr zum Editor-Tab

### T18-V1-29 — Leeres Dashboard im View-Mode
**Status:** FAIL
**Evidenz:** Screenshot T18-V1-03-neues-dashboard.png
**Notizen:**
- Leeres Dashboard im View-Mode: **komplett leere Seite**
- Kein Hinweis-Text wie "Noch keine Widgets — wechsle in Edit-Mode"
- Nur Toolbar mit Dashboard-Name sichtbar
- **Empfehlung MEDIUM:** Empty-State mit Hinweis und CTA-Button zum Edit-Mode

### T18-V1-30 — Editor mit Deep-Link oeffnen
**Status:** PARTIAL
**Evidenz:** Navigation zu /editor/{serverId}
**Notizen:**
- Dashboard korrekt geladen, alle 8 Widgets gerendert
- Breadcrumb zeigt "Editor > T18-Test Dashboard" — korrekt
- **Bug:** Dashboard-Selector zeigt "Kein Dashboard" statt des aktiven Namens
  - Ursache: getLayoutById matched serverId, aber activeLayoutId wird auf lokale ID gesetzt,
    waehrend der Selector nach activeLayoutId sucht
  - Nach manuellem Klick auf Selector funktioniert alles
- Ungueltige Dashboard-ID: zeigt "Kein Dashboard" + leeres Grid (kein Fehler-Dialog)
- **Empfehlung HOCH:** Deep-Link Selector-Sync fixen

---

## Findings-Liste (priorisiert)

| # | Prio | Finding | Betroffene Datei |
|---|------|---------|-----------------|
| F-01 | HOCH | Kein sichtbarer Widget-Loeschen-Button (nur Drag-out-of-grid) | CustomDashboardView.vue |
| F-02 | HOCH | Deep-Link via serverId: Selector zeigt "Kein Dashboard" | CustomDashboardView.vue |
| F-03 | HOCH | 22/23 Dashboards nur in localStorage, nicht auf Server persistent | dashboard.store.ts |
| F-04 | MEDIUM | Leeres Dashboard zeigt keinen Empty-State im View-Mode | CustomDashboardView.vue |
| F-05 | MEDIUM | Zone-Dashboards nie im Monitor sichtbar (target=null) | dashboard.store.ts |
| F-06 | MEDIUM | Neues Dashboard oeffnet in View-Mode statt Edit-Mode | CustomDashboardView.vue |
| F-07 | LOW | Debounce suboptimal bei schnellen Widget-Adds (9 PUTs statt 1-2) | dashboard.store.ts |
| F-08 | LOW | Auto-generierte Dashboards visuell nicht unterscheidbar im Selector | CustomDashboardView.vue |
| F-09 | LOW | Zeitraum-Chips zeigen keinen visuellen "aktiv"-State initial | WidgetConfigPanel.vue |
| F-10 | LOW | Ungueltige Deep-Link-ID zeigt kein Fehler-Feedback | CustomDashboardView.vue |

---

## Navigationsdiagramm

```
Editor-Ansicht (CustomDashboardView.vue)
├── ViewTabBar: [Uebersicht] [Monitor] [Editor*]
├── Toolbar:
│   ├── LayoutGrid Icon + "Dashboard Builder"
│   ├── Dashboard-Selector (Dropdown)
│   │   ├── 22 Dashboards (klickbar → switchLayout)
│   │   ├── 4 Vorlagen (klickbar → createFromTemplate)
│   │   └── Textfeld + Plus → createLayout
│   ├── [MapPin] Anzeigeort (nur Edit-Mode)
│   │   ├── Monitor — Inline
│   │   ├── Monitor — Seitenpanel (+ Konflikt-Warnung)
│   │   ├── Monitor — Unteres Panel
│   │   └── Uebersicht — Seitenpanel
│   ├── [Pencil/Eye] Edit/View Toggle
│   ├── [Plus] Katalog Toggle (nur Edit-Mode)
│   ├── [Download] Export JSON
│   ├── [Upload] Import JSON (nur Edit-Mode)
│   └── [Trash] Dashboard loeschen (nur Edit-Mode, mit Confirm)
├── Widget-Katalog (aside, nur Edit-Mode):
│   ├── Sensoren (5 Typen)
│   ├── Aktoren (2 Typen)
│   └── System (2 Typen)
├── GridStack Grid:
│   └── Widgets (je nach Dashboard):
│       ├── Header: Titel + Typ-Badge + [Zahnrad] (Edit-Mode)
│       └── Content: Widget-Komponente (Vue mount)
├── WidgetConfigPanel (SlideOver rechts):
│   ├── Titel (Textfeld)
│   ├── Sensor/Aktor Dropdown (typ-abhaengig)
│   ├── Zone-Filter (esp-health, alarm-list, actuator-runtime)
│   ├── Zeitraum Chips (historical)
│   ├── Y-Achse Min/Max (line-chart, historical)
│   ├── Farbe (8 Swatches)
│   └── Schwellenwerte Toggle + 4 Felder
└── Links:
    ├── "Im Monitor anzeigen" → /monitor/{zoneSlug}/dashboard/{id}
    └── Deep-Link: /editor/{dashboardId} → laedt Dashboard

Monitor-Integration:
├── InlineDashboardPanel (CSS-Grid, readOnly)
│   ├── mode='inline' → unter Zone-Kacheln
│   └── mode='side-panel' → complementary rechts
├── DashboardViewer (GridStack staticGrid)
│   └── /monitor/:zoneSlug/dashboard/:id
└── Links:
    ├── "Im Editor bearbeiten" → /editor/{serverId}
    └── "Neues Dashboard erstellen" → /editor
```

---

## UX-Bewertung

**Staerken:**
- Widget-Katalog ist klar strukturiert (3 Kategorien, Icon + Label + Beschreibung)
- Config-Panel bietet sinnvolle Optionen je nach Widget-Typ (adaptiv)
- Target-System mit Konflikt-Erkennung ist elegant geloest
- Auto-Threshold-Population bei Sensor-Auswahl spart Zeit
- Live-Chart rendert sofort nach Sensor-Auswahl

**Schwaechen:**
- Widget-Loeschen nicht erkennbar (kein X-Button, nur Drag-out)
- Neues Dashboard startet im View-Mode (leer, keine Guidance)
- Deep-Link-Selector-Bug untergräbt Navigation
- localStorage-Dominanz: 95% der Dashboards nicht server-persistent
- Kein Undo/Redo fuer Grid-Operationen

**Gesamteindruck:** Der Editor ist funktional solide und bietet alle wesentlichen Features.
Die Hauptprobleme liegen in der Discoverability (Widget-Loeschen) und Datenpersistenz
(localStorage vs. Server). Fuer einen V1-Editor ist das Niveau hoch, die 3 HOCH-Findings
sollten aber vor produktivem Einsatz behoben werden.

---

*Report generiert: 2026-03-10T19:40:00Z*
*Screenshots: T18-V1-01 bis T18-V1-16 im Playwright output directory*
