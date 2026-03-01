# Auftrag: Monitor-System Vollstaendige Verifikation & E2E-Tests

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Prioritaet:** HOCH — Alle 3 Monitor-Ebenen + Editor-Integration muessen verifiziert werden
> **Status:** OFFEN
> **Typ:** Verifikation + E2E-Tests (Playwright + manuell)
> **Voraussetzung:** Monitor Ebene 1 (ABGESCHLOSSEN), Ebene 2 (ERLEDIGT), Ebene 3 Editor-Integration (ERLEDIGT)
> **Kontext:** Nach der Implementierung aller 3 Monitor-Ebenen und der Editor-Integration muss das gesamte System end-to-end verifiziert werden

---

## Kontext: Was wurde implementiert

### Monitor 3-Level-Architektur

```
Ebene 1: Zonen-Uebersicht (/monitor)
  - Zone-Cards mit KPI-Zusammenfassung (Sensoren, Aktoren, Alarme, Temperatur)
  - Cross-Zone-Dashboard-Links (Dashboards mit scope='cross-zone')
  - Klick auf Zone → L2
    ↓
Ebene 2: Zonenansicht (/monitor/:zoneId)
  - Subzone-Accordions via useZoneGrouping.ts (ZoneGroup[]/SubzoneGroup[])
  - SensorCard/ActuatorCard im mode:'monitor' (Read-Only, Live-Wert, Sparkline)
  - Sparkline-Cache (useSparklineCache.ts, 5s-Deduplizierung)
  - Zone-Dashboard-Links (auto-generiert + user-erstellt)
  - Klick auf Sensor → L3 SlideOver
  - Klick auf Dashboard-Link → L3 DashboardViewer
    ↓
Ebene 3: Detail-Ebene
  a) Sensor-Detail-SlideOver (/monitor/:zoneId/sensor/:sensorId)
     - Zeitreihe (24h Default), TimeRangeSelector, CSV-Export
  b) DashboardViewer (/monitor/dashboard/:dashboardId ODER /monitor/:zoneId/dashboard/:dashboardId)
     - GridStack mit staticGrid: true (View-Only)
     - useDashboardWidgets.ts fuer Container-agnostic Widget mount/unmount
```

### Editor-Integration (Ebene 3)

```
Neue Dateien:
  - El Frontend/src/composables/useDashboardWidgets.ts (265 Zeilen)
  - El Frontend/src/components/dashboard/DashboardViewer.vue (367 Zeilen)
  - El Frontend/src/components/dashboard/InlineDashboardPanel.vue (165 Zeilen)
  - El Servador/.../alembic/versions/add_dashboard_target_field.py

Geaenderte Dateien:
  - El Frontend/src/router/index.ts (+2 Routes: monitor-dashboard, monitor-zone-dashboard)
  - El Frontend/src/views/MonitorView.vue (DashboardViewer branching, inline panels, side panels)
  - El Frontend/src/views/CustomDashboardView.vue (refactored, target config dropdown)
  - El Frontend/src/views/HardwareView.vue (side panel integration)
  - El Frontend/src/shared/stores/dashboard.store.ts (generateZoneDashboard, DashboardTarget, computeds)
  - El Frontend/src/api/dashboards.ts (target in DTO + Payloads)
  - El Servador/.../db/models/dashboard.py (target JSON column)
  - El Servador/.../schemas/dashboard.py (target in Create/Update/Response)
```

### DashboardTarget Interface

```typescript
interface DashboardTarget {
  view: 'monitor' | 'hardware'      // Ziel-Tab
  placement: 'page' | 'inline' | 'side-panel'  // Darstellungsart
  anchor?: string                     // Bei inline: Position (z.B. 'zone-header', 'after-sensors')
  panelPosition?: 'left' | 'right'   // Bei side-panel
  panelWidth?: number                 // In Spalten (1-4 von 12)
  order?: number                      // Reihenfolge
}
```

---

## Block 1: Build + Migration Verifikation

### B1.1: Frontend Build

```bash
cd "El Frontend"
npm run build
# Erwartung: Keine Fehler, keine Warnungen in neuen Dateien
# vue-tsc --noEmit fuer TypeScript-Pruefung
```

**Pruefe:**
- [ ] `npm run build` erfolgreich (0 Errors)
- [ ] `vue-tsc --noEmit` clean (keine Typ-Fehler in neuen/geaenderten Dateien)
- [ ] Keine unused imports in: useDashboardWidgets.ts, DashboardViewer.vue, InlineDashboardPanel.vue

### B1.2: Backend Build + Alembic Migration

```bash
cd "El Servador"
# Alembic Migration testen
alembic upgrade head
alembic downgrade -1
alembic upgrade head
# Erwartung: Migration laeuft fehlerfrei hin und zurueck
```

**Pruefe:**
- [ ] Alembic `upgrade head` erfolgreich
- [ ] Alembic `downgrade -1` erfolgreich (Rollback)
- [ ] Alembic `upgrade head` erneut erfolgreich (Idempotenz)
- [ ] `target` Column existiert auf `dashboards` Tabelle (JSON, nullable)
- [ ] Bestehende Dashboards haben `target = NULL` (kein Datenbrecher)

### B1.3: Docker Compose

```bash
docker compose up -d
# Erwartung: Alle Container healthy
docker compose ps
```

**Pruefe:**
- [ ] Alle Container healthy (Frontend, Backend, DB, MQTT, etc.)
- [ ] Backend startet ohne Fehler trotz neuer Migration
- [ ] Frontend-Container baut erfolgreich

---

## Block 2: Router + Navigation E2E

### B2.1: Route-Registrierung

**Playwright-Test (oder manuell):**

| Route | Name | Erwartung |
|-------|------|-----------|
| `/monitor` | `monitor` | L1 Zonen-Uebersicht rendert |
| `/monitor/:zoneId` | `monitor-zone` | L2 Zonenansicht rendert |
| `/monitor/:zoneId/sensor/:sensorId` | (Sensor-Detail) | L3 SlideOver oeffnet |
| `/monitor/dashboard/:dashboardId` | `monitor-dashboard` | DashboardViewer rendert (Cross-Zone) |
| `/monitor/:zoneId/dashboard/:dashboardId` | `monitor-zone-dashboard` | DashboardViewer rendert (Zone-spezifisch) |
| `/editor` | `editor` | CustomDashboardView rendert |
| `/editor/:dashboardId` | (Editor Detail) | Dashboard im Editor oeffnet |

**Pruefe:**
- [ ] Alle 7 Routes sind registriert und erreichbar
- [ ] Keine 404-Fehler bei direktem URL-Aufruf
- [ ] Route-Guards (falls vorhanden) blockieren nicht

### B2.2: Navigationsfluss L1 → L2 → L3

**Playwright-Szenario:**

```
1. /monitor laden
2. Zone-Card klicken → /monitor/:zoneId
3. SensorCard klicken → SlideOver oeffnet sich
4. SlideOver schliessen → zurueck auf /monitor/:zoneId
5. Dashboard-Link klicken → /monitor/:zoneId/dashboard/:dashboardId
6. Zurueck-Button → /monitor/:zoneId
7. Breadcrumb "Monitor" klicken → /monitor
```

**Pruefe:**
- [ ] Jeder Schritt navigiert korrekt
- [ ] Browser-Back-Button funktioniert an jedem Punkt
- [ ] Breadcrumbs zeigen korrekten Pfad (Monitor > Zone > Sensor/Dashboard)
- [ ] Kein Flash/Flicker bei Transitionen

### B2.3: Deep-Link-Verifikation

**Pruefe direkten URL-Aufruf (ohne vorherige Navigation):**
- [ ] `/monitor/dashboard/some-id` rendert DashboardViewer oder zeigt sinnvollen "nicht gefunden" State
- [ ] `/monitor/zone1/dashboard/some-id` rendert Zone-spezifisches Dashboard
- [ ] `/monitor/zone1/sensor/sensor1` oeffnet Sensor-Detail direkt

---

## Block 3: Monitor Ebene 1 Verifikation

### B3.1: Zone-Cards

**Pruefe:**
- [ ] Alle existierenden Zonen werden als Cards angezeigt
- [ ] KPI-Zusammenfassung pro Zone korrekt (Sensor-Count, Aktor-Count, Alarm-Count, Temperatur)
- [ ] Status-Dot/Ampel zeigt korrekten Zustand (Gruen = OK, Gelb = Warning, Rot = Alarm)
- [ ] Klick auf Zone-Card navigiert zu /monitor/:zoneId

### B3.2: Cross-Zone-Dashboard-Links

**Pruefe:**
- [ ] Dashboards mit `scope='cross-zone'` erscheinen auf L1
- [ ] Dashboards MIT `target.view='monitor'` + `target.placement='page'` erscheinen
- [ ] Klick navigiert korrekt zum DashboardViewer
- [ ] Empty State wenn keine Cross-Zone-Dashboards existieren

---

## Block 4: Monitor Ebene 2 Verifikation

### B4.1: Subzone-Accordions

**Pruefe:**
- [ ] `useZoneGrouping(zoneId)` liefert korrekte ZoneGroup[]/SubzoneGroup[]
- [ ] Subzone-Accordion-Headers zeigen Subzone-Name + Sensor-Count
- [ ] Accordion Toggle funktioniert (aufklappen/zuklappen)
- [ ] Accordion-State persistiert in localStorage (Seite neu laden → gleicher Zustand)
- [ ] "Unzugeordnet"-Gruppe fuer Sensoren ohne Subzone

### B4.2: SensorCard im Monitor-Modus

**Pruefe:**
- [ ] SensorCard mit `mode:'monitor'` zeigt: Sensor-Typ-Icon, aktueller Wert mit Einheit, Sparkline
- [ ] Sparkline zeigt letzte N Datenpunkte (aus useSparklineCache)
- [ ] Quality-Status korrekt (qualityToStatus: good→Gruen, warning→Gelb, alarm→Rot)
- [ ] ESP-Badge zeigt welcher ESP die Daten liefert
- [ ] Klick auf SensorCard → L3 Sensor-Detail-SlideOver
- [ ] KEIN Edit/Config-Button sichtbar (Monitor = Read-Only)
- [ ] Cursor: pointer (klickbar)

### B4.3: ActuatorCard im Monitor-Modus

**Pruefe:**
- [ ] ActuatorCard mit `mode:'monitor'` zeigt: Aktor-Typ-Icon, State (ON/OFF/PWM)
- [ ] ON = Gruener Badge, OFF = Grauer Badge, PWM = Blauer Badge mit Wert
- [ ] KEIN Toggle-Button (Monitor = Read-Only)
- [ ] ESP-Badge zeigt zugehoerigen ESP

### B4.4: Zone-Dashboard-Links

**Pruefe:**
- [ ] `zoneDashboards(zoneId)` Computed liefert korrekte Dashboards
- [ ] Auto-generierte Dashboards erkennbar (Badge/Tag)
- [ ] User-erstellte Dashboards erkennbar
- [ ] Klick navigiert zum DashboardViewer im Monitor (NICHT zum Editor-Tab)
- [ ] Empty State wenn keine Zone-Dashboards existieren

### B4.5: Sparkline-Cache Performance

**Pruefe:**
- [ ] useSparklineCache 5s-Deduplizierung funktioniert (gleicher Sensor nicht haeufiger als alle 5s aktualisiert)
- [ ] WebSocket sensor_data Events aktualisieren nur die betroffene SensorCard (keine Voll-Re-Renders)
- [ ] Bei >20 Sensoren pro Zone: Kein merkbares Lag

---

## Block 5: Monitor Ebene 3 — Sensor-Detail Verifikation

### B5.1: Sensor-Detail-SlideOver

**Pruefe:**
- [ ] SlideOver oeffnet sich bei Klick auf SensorCard (L2)
- [ ] Zeitreihe (Chart) rendert korrekt (24h Default)
- [ ] TimeRangeSelector funktioniert (1h, 6h, 12h, 24h, 7d)
- [ ] Schwellwert-Linien werden angezeigt (wenn konfiguriert)
- [ ] CSV-Export-Button funktioniert
- [ ] Breadcrumb zeigt: Monitor > Zone > Sensor
- [ ] Schliessen-Button → zurueck zur Zonenansicht (L2)

### B5.2: Sensor-Detail mit Mock-Daten

**Pruefe:**
- [ ] Bei Mock-ESP: Sensor zeigt simulierte Daten
- [ ] Bei Sensor ohne Daten: Sinnvoller Empty State (nicht leerer Chart)
- [ ] Zeitbereich-Wechsel laedt neue Daten (REST-Call an sensorsApi.queryData)

---

## Block 6: Monitor Ebene 3 — DashboardViewer Verifikation

### B6.1: DashboardViewer.vue Grundfunktion

**Pruefe:**
- [ ] GridStack initialisiert mit `staticGrid: true` (kein Drag, kein Resize, kein Remove)
- [ ] Alle Widget-Typen rendern korrekt im View-Mode:
  - [ ] `line-chart` — Zeitreihe mit Live-Updates
  - [ ] `gauge` — Aktueller Wert mit Bereich
  - [ ] `sensor-card` — Kompakte Sensor-Info
  - [ ] `historical` — Historische Zeitreihe (REST)
  - [ ] `multi-sensor` — Mehrere Sensoren vergleichen
  - [ ] `actuator-card` — Aktor-Status
  - [ ] `actuator-runtime` — Laufzeit-Tracking
  - [ ] `esp-health` — ESP-Verbindungsstatus
  - [ ] `alarm-list` — Alarm-Historie
- [ ] "Im Editor oeffnen" Button navigiert zum Editor (CustomDashboardView) mit Dashboard geladen
- [ ] Zurueck-Button navigiert zur vorherigen Route (L1 oder L2)

### B6.2: useDashboardWidgets.ts Composable

**Pruefe:**
- [ ] Container-agnostic: Funktioniert sowohl in DashboardViewer als auch in CustomDashboardView
- [ ] Widget mount: Widgets werden korrekt in GridStack-Zellen gerendert
- [ ] Widget unmount: Cleanup bei Navigation weg (keine Memory Leaks)
- [ ] Widget-Konfiguration: Widget-spezifische Props werden korrekt weitergegeben (sensorId, timeRange, etc.)

### B6.3: InlineDashboardPanel.vue

**Pruefe:**
- [ ] CSS-Grid-Layout (12 Spalten, KEIN GridStack)
- [ ] Widgets positioniert via `grid-column`/`grid-row`
- [ ] Responsiv: Bei schmalerem Viewport keine Ueberlappung
- [ ] Rendert innerhalb MonitorView.vue (nicht als eigene Seite)
- [ ] Dashboard mit `target.placement='inline'` + `target.anchor` korrekt positioniert

---

## Block 7: Editor-Integration Cross-Flow

### B7.1: Dashboard Create → View → Edit → View Lifecycle

**E2E-Szenario (WICHTIGSTER Test):**

```
1. /editor oeffnen
2. Neues Dashboard erstellen (Name: "Test-Dashboard")
3. 2-3 Widgets hinzufuegen (LineChart, Gauge)
4. Target setzen: view='monitor', placement='page'
5. Speichern
6. Zu /monitor navigieren
7. Dashboard-Link sollte sichtbar sein
8. Dashboard-Link klicken → DashboardViewer zeigt Dashboard korrekt
9. "Im Editor oeffnen" klicken → Editor oeffnet sich mit Dashboard
10. Widget aendern (z.B. Sensor wechseln)
11. Speichern
12. Zurueck zum Monitor → Aenderung sichtbar
```

**Pruefe:**
- [ ] Schritt 1-5: Dashboard erstellen mit Target funktioniert
- [ ] Schritt 6-7: Dashboard erscheint im Monitor (reaktiv via Pinia Store)
- [ ] Schritt 8: DashboardViewer rendert alle Widgets
- [ ] Schritt 9: Editor oeffnet mit korrekt geladenem Dashboard
- [ ] Schritt 10-12: Aenderungen werden sofort im Monitor sichtbar

### B7.2: Auto-Generierung

**Pruefe:**
- [ ] `generateZoneDashboard()` erstellt beim ersten Zonenbesuch ein Auto-Dashboard
- [ ] Sensor-Typ→Widget-Mapping korrekt:
  - Temperatur → LineChart
  - pH → Gauge
  - EC → Gauge
  - Feuchtigkeit → LineChart
- [ ] Auto-generiertes Dashboard hat `autoGenerated: true`
- [ ] `claimAutoLayout()` setzt `autoGenerated: false` (User uebernimmt)
- [ ] Nach Claim: Auto-Update stoppt (User-Modifikationen bleiben erhalten)

### B7.3: Target-Konfigurator im Editor

**Pruefe:**
- [ ] CustomDashboardView zeigt Target-Dropdown (Monitor/Hardware/Editor)
- [ ] Target-Aenderung wird gespeichert (localStorage + Server-API)
- [ ] `target.view = 'monitor'` + `target.placement = 'page'` → Dashboard erscheint als Monitor-Seite
- [ ] `target.view = 'monitor'` + `target.placement = 'inline'` → Dashboard erscheint als Inline-Panel
- [ ] `target.view = 'hardware'` + `target.placement = 'side-panel'` → Dashboard erscheint in HardwareView
- [ ] `target = undefined/null` → Dashboard nur im Editor-Tab (bisheriges Verhalten)

### B7.4: Side-Panels

**Pruefe:**
- [ ] MonitorView: Dashboards mit `target.view='monitor'` + `target.placement='side-panel'` rendern als Side-Panel
- [ ] HardwareView: Dashboards mit `target.view='hardware'` + `target.placement='side-panel'` rendern als Side-Panel
- [ ] Panel-Position (links/rechts) wird respektiert
- [ ] Panel-Breite (1-4 Spalten) wird respektiert
- [ ] Side-Panel beeintraechtigt nicht das Hauptlayout

---

## Block 8: Server-API Verifikation

### B8.1: Dashboard CRUD mit Target-Feld

**Pruefe (REST-API-Tests oder Playwright):**

```
POST /api/dashboards — Dashboard mit target erstellen
  Body: { name: "Test", widgets: [...], target: { view: "monitor", placement: "page" } }
  Erwartung: 201, target in Response enthalten

GET /api/dashboards — Alle Dashboards
  Erwartung: target-Feld in jedem Dashboard (null oder Object)

GET /api/dashboards/:id — Einzelnes Dashboard
  Erwartung: target-Feld vorhanden

PUT /api/dashboards/:id — Target aendern
  Body: { target: { view: "hardware", placement: "side-panel", panelPosition: "right", panelWidth: 3 } }
  Erwartung: 200, target aktualisiert

PUT /api/dashboards/:id — Target entfernen
  Body: { target: null }
  Erwartung: 200, target = null

DELETE /api/dashboards/:id — Dashboard loeschen
  Erwartung: 200/204, Dashboard + target geloescht
```

**Pruefe:**
- [ ] POST mit target → target gespeichert
- [ ] GET gibt target zurueck (auch null)
- [ ] PUT target update → target aktualisiert
- [ ] PUT target = null → target entfernt
- [ ] DELETE → Dashboard vollstaendig geloescht
- [ ] Schema-Validierung: Ungueltige target-Werte werden abgelehnt

### B8.2: Dashboard Store Sync

**Pruefe:**
- [ ] `fetchLayouts()` laedt Dashboards vom Server (inklusive target)
- [ ] Server-Dashboards mergen korrekt mit localStorage-Cache (Server hat Prioritaet)
- [ ] `syncLayoutToServer()` sendet target mit (debounced 2000ms)
- [ ] `setLayoutTarget(layoutId, target)` aktualisiert Store + Server

---

## Block 9: Edge Cases und Fehlerszenarien

### B9.1: Leere Zustaende

**Pruefe:**
- [ ] Zone ohne Sensoren: Sinnvoller Empty State auf L2
- [ ] Zone ohne Aktoren: Aktor-Sektion nicht angezeigt oder "Keine Aktoren"
- [ ] Zone ohne Dashboards: Empty State mit "Dashboard erstellen" Link
- [ ] Sensor ohne Daten: SlideOver zeigt "Keine Daten verfuegbar"
- [ ] Dashboard ohne Widgets: DashboardViewer zeigt "Dashboard ist leer"

### B9.2: Offline/Stale Szenarien

**Pruefe:**
- [ ] ESP offline: Sensoren dieses ESPs als "disconnected" markiert auf L2
- [ ] Sensor stale (>60s kein Update): Visueller Hinweis
- [ ] WebSocket-Verbindung unterbrochen: Graceful Degradation (letzte bekannte Werte bleiben sichtbar)

### B9.3: Nicht-existierende Ressourcen

**Pruefe:**
- [ ] `/monitor/non-existent-zone` → Sinnvoller Fehler oder Redirect zu L1
- [ ] `/monitor/dashboard/non-existent-id` → Sinnvoller Fehler
- [ ] Dashboard mit target auf geloeschte Zone → Graceful Handling

### B9.4: Gleichzeitige Nutzung

**Pruefe:**
- [ ] Dashboard im Editor bearbeiten + Monitor offen → Aenderungen via Store reaktiv
- [ ] Zwei Browser-Tabs: Monitor in Tab 1, Editor in Tab 2 → Konsistenz nach Speichern

---

## Block 10: TypeScript + Code-Qualitaet

### B10.1: TypeScript-Strenge

```bash
cd "El Frontend"
npx vue-tsc --noEmit
```

**Pruefe spezifisch:**
- [ ] `DashboardTarget` Interface korrekt typisiert (keine `any`)
- [ ] `useDashboardWidgets` Return-Type korrekt
- [ ] `DashboardViewer` Props korrekt typisiert
- [ ] `InlineDashboardPanel` Props korrekt typisiert
- [ ] Keine `@ts-ignore` in neuen Dateien

### B10.2: Bestehende Tests

```bash
cd "El Frontend"
npm run test
```

**Pruefe:**
- [ ] Alle bestehenden Tests bestehen (keine Regressionen)
- [ ] Keine neuen Flaky Tests
- [ ] Test-Count nicht gesunken

---

## Zusammenfassung: Kritische Test-Pfade

Die 5 wichtigsten E2E-Pfade die ZWINGEND funktionieren muessen:

| # | Pfad | Prioritaet |
|---|------|-----------|
| 1 | L1 → L2 → L3 (Sensor-Detail) → L2 → L1 | KRITISCH |
| 2 | Dashboard Create (Editor) → Target=Monitor → Dashboard sichtbar im Monitor | KRITISCH |
| 3 | L2 → Dashboard-Link → DashboardViewer → "Im Editor oeffnen" → Editor | KRITISCH |
| 4 | Auto-Generierung: Zone ohne Dashboard → generateZoneDashboard() → Auto-Dashboard auf L2 | HOCH |
| 5 | Alembic Migration: upgrade → downgrade → upgrade (Idempotenz) | HOCH |

---

## Abgrenzung

**IN diesem Auftrag:**
- Build-Verifikation (Frontend + Backend + Migration)
- Router- und Navigations-Tests (alle 7 Routes)
- Monitor L1/L2/L3 funktionale Pruefung
- DashboardViewer/InlineDashboardPanel Rendering
- Editor-Integration Cross-Flow (Create→View→Edit→View)
- Server-API CRUD mit Target-Feld
- Edge Cases und Fehlerszenarien
- TypeScript-Strenge und bestehende Tests

**NICHT in diesem Auftrag:**
- Neues Feature-Development
- Mobile-Responsive Optimierung (separater Auftrag)
- DnD-Vollpruefung (separater Auftrag)
- Logic-Rules-Integration in Monitor (separater Auftrag: `auftrag-logic-rules-live-monitoring-integration copy.md`)
- Performance-Optimierung (nur Verifikation dass es nicht offensichtlich langsam ist)

---

## Qualitaetskriterien (Auftrag gilt als ERLEDIGT wenn)

- [ ] Alle 10 Bloecke durchlaufen
- [ ] Alle 5 kritischen E2E-Pfade bestanden
- [ ] `npm run build` + `vue-tsc --noEmit` clean
- [ ] Alembic Migration hin und zurueck erfolgreich
- [ ] Bestehende Tests bestehen (keine Regressionen)
- [ ] Identifizierte Bugs als Issue dokumentiert (mit Schweregrad + betroffene Datei)
- [ ] Kein KRITISCHER Bug offen
