# Auftrag: Monitor-System Vollstaendige Verifikation & E2E-Tests

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Prioritaet:** HOCH — Alle 3 Monitor-Ebenen + Editor-Integration muessen verifiziert werden
> **Status:** E2E-BUGREPORT VOLLSTAENDIG
> **Typ:** Verifikation + E2E-Tests (Playwright + manuell)
> **Voraussetzung:** Monitor Ebene 1 (ABGESCHLOSSEN), Ebene 2 (ERLEDIGT), Ebene 3 Editor-Integration (ERLEDIGT)
> **Kontext:** Nach der Implementierung aller 3 Monitor-Ebenen und der Editor-Integration muss das gesamte System end-to-end verifiziert werden
> **Letzte Aktualisierung:** 2026-03-01 E2E-Playwright-Durchlauf + Code-Analyse

---

## E2E-Testdurchlauf Ergebnis

> **Methode:** Playwright Browser-Automation + Code-Analyse + Docker-Log-Auswertung
> **Screenshots:** e2e-monitor-L1.png, e2e-monitor-L2-zone-test.png, e2e-monitor-L2-expanded-panel.png, e2e-monitor-L3-slideover.png, e2e-monitor-L3-dashboardviewer.png, e2e-dashboard-not-found.png, e2e-editor-tab.png

### Block-Ergebnisse Uebersicht

| Block | Beschreibung | Status | Kritische Funde |
|-------|-------------|--------|-----------------|
| B1 | Build + Migration | TEILWEISE | Frontend Build OK, TypeScript OK, **Alembic Migration NICHT angewendet** |
| B2 | Router + Navigation | BESTANDEN | Alle 7 Routes registriert, L1→L2→L3→L2→L1 Flow OK |
| B3 | Monitor L1 | BESTANDEN | Zone-Cards rendern, KPIs korrekt |
| B4 | Monitor L2 | TEILWEISE | Accordions OK, **keine Sparklines**, **ActuatorCard Toggle sichtbar** |
| B5 | Monitor L3 Sensor | TEILWEISE | SlideOver OK, **Stats zeigen "—"**, TimeRange OK |
| B6 | Monitor L3 Dashboard | FEHLGESCHLAGEN | **Widgets im Edit-Modus**, **API 500** |
| B7 | Editor-Integration | FEHLGESCHLAGEN | **API 500 blockiert gesamten Flow** |
| B8 | Server-API | FEHLGESCHLAGEN | **`dashboards.target` Column fehlt** |
| B9 | Edge Cases | BESTANDEN | Nicht-existierende Ressourcen: Graceful Handling |
| B10 | TypeScript + Tests | BESTANDEN | `vue-tsc --noEmit` clean, `npm run build` 0 Errors |

---

## BLOCKER — Alembic Migration nicht angewendet

### BUG-BLOCKER-1: `dashboards.target` Column fehlt in der Datenbank

**Schweregrad:** BLOCKER
**Datei:** `El Servador/god_kaiser_server/alembic/versions/add_dashboard_target_field.py`
**DB-Schema verifiziert via:** `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db -c "\d dashboards"`

**Ist-Zustand der `dashboards`-Tabelle:**
```
id, name, description, owner_id, is_shared, widgets, scope, zone_id, auto_generated, sensor_id, created_at, updated_at
```
**Fehlend:** `target` (JSON, nullable)

**Alembic-Status:**
- `alembic heads` → `add_dashboard_target (head)` — Migration existiert
- `alembic current` → LEER — Migration wurde nie ausgefuehrt
- Server-Log: `column dashboards.target does not exist` → SQLAlchemy 500-Error

**Impact:**
- `GET /api/v1/dashboards` → 500 Internal Server Error
- Dashboard-Store kann keine Dashboards vom Server laden
- DashboardViewer Widgets zeigen Dropdowns statt Daten
- Editor-Tab ist leer
- Gesamte Dashboard-Target-Funktionalitaet (Monitor-Placement, Side-Panels, Inline-Panels) blockiert

**Fix:**
```bash
docker exec automationone-server alembic upgrade head
docker restart automationone-server
```

---

## Bugreport Block 11 — Vollstaendige E2E-Befunde

### Zusammenfassung

| Schweregrad | Anzahl | Davon NEU (E2E) |
|-------------|--------|-----------------|
| BLOCKER     | 1      | 1               |
| KRITISCH    | 4      | 1               |
| HOCH        | 7      | 1               |
| MITTEL      | 7      | 0               |
| NIEDRIG/UX  | 6      | 0               |

---

### KRITISCH — Blockiert grundlegende Funktionalitaet

#### BUG-K1: SensorCard zeigt KEINE Sparkline im Monitor-Modus

**Datei:** `El Frontend/src/components/devices/SensorCard.vue:87-105`
**E2E-Befund:** Screenshot `e2e-monitor-L2-zone-test.png` zeigt SensorCards NUR mit Name, Wert, ESP-ID. Keine Mini-Charts.
**Code-Beweis:** Monitor-Modus Template (Zeile 87-105) enthaelt: Header mit Name + Quality Dot, Value-Block, Footer mit ESP-ID + Status. **KEIN Sparkline-Element, kein Chart, kein sparkline-Prop.**
**Impact:** Das zentrale visuelle Feature von L2 — Live-Sparkline-Mini-Charts — existiert nicht.
**Fix:** SensorCard braucht `sparklineData?: ChartDataPoint[]` Prop + Mini-Chart-Element. MonitorView muss `sparklineCache.get(getSensorKey(sensor.esp_id, sensor.gpio))` uebergeben.

#### BUG-K2: SensorCard-Klick oeffnet NICHT direkt den L3 SlideOver

**Datei:** `El Frontend/src/views/MonitorView.vue` (toggleExpanded-Logik)
**E2E-Befund:** Klick auf SensorCard → Expanded-Panel mit 1h-Chart + 2 Buttons ("Zeitreihe anzeigen", "Konfiguration"). Erst 2. Klick auf "Zeitreihe anzeigen" → SlideOver.
**Screenshot:** `e2e-monitor-L2-expanded-panel.png`
**Impact:** 2-Klick statt 1-Klick. Architektur-Diskrepanz zum Plan.
**Entscheidung noetig:** Plan korrigieren auf 2-Klick-Flow ODER Expanded-Panel entfernen zugunsten direktem SlideOver.

#### BUG-K3: Breadcrumbs fehlen fuer Monitor-Dashboard-Routes

**Datei:** `El Frontend/src/shared/design/layout/TopBar.vue:101-115`
**E2E-Befund:** Screenshot `e2e-monitor-L3-dashboardviewer.png` — Breadcrumb zeigt "Monitor > Test" ohne Dashboard-Segment trotz URL `/monitor/test/dashboard/dash-auto-test-...`
**Code-Beweis:** TopBar generiert Breadcrumbs fuer `zoneId` und `sensorId` aber **nicht fuer `dashboardId`**. Kein `route.params.dashboardId` Check auf Monitor-Routes.
**Fix:** TopBar muss `route.params.dashboardId` pruefen und Dashboard-Name als Breadcrumb-Segment hinzufuegen.

#### BUG-K4: ActuatorCard hat Toggle-Button auch im Monitor-Modus

**Datei:** `El Frontend/src/components/devices/ActuatorCard.vue:78-84`
**E2E-Befund:** Screenshot `e2e-monitor-L2-zone-test.png` — "Einschalten"-Buttons sichtbar bei Aktoren im Monitor-Tab.
**Code-Beweis:** Toggle-Button wird in BEIDEN Modi gerendert. Kommentar Zeile 5-8: "Toggle button is visible in BOTH modes (actuator control is a command, not monitoring)".
**Entscheidung noetig:** (a) `v-if="mode === 'config'"` oder (b) Plan aendern: "Aktor-Steuerung auch im Monitor erlaubt".

#### BUG-K5 (NEU/E2E): DashboardViewer Widgets rendern im Edit-Modus

**Datei:** `El Frontend/src/components/dashboard/DashboardViewer.vue`
**E2E-Befund:** Screenshot `e2e-monitor-L3-dashboardviewer.png` — Alle 5 Widgets zeigen "Sensor auswaehlen:" / "Aktor waehlen" Dropdowns statt Live-Daten.
**Root Cause:** Zusammenspiel von zwei Problemen:
1. API 500 (BUG-BLOCKER-1) → Dashboard-Store hat keine Server-Dashboards
2. Auto-generierte Dashboards haben Widget-Config ohne gebundene Sensor-IDs
**Code-Beweis:** `useDashboardWidgets({ showConfigButton: false })` — View-Mode ist korrekt konfiguriert, aber Widgets haben keinen vorselektierten Sensor.
**Impact:** DashboardViewer ist visuell komplett defekt — zeigt nur Konfigurationsfelder.
**Fix:** (1) Alembic Migration anwenden. (2) Widget-Initialisierung pruefen: Auto-generierte Widgets brauchen `sensorId`/`actuatorId` in ihrer Config.

---

### HOCH — Funktioniert nicht wie erwartet

#### BUG-H1: DashboardViewer sucht Layout per lokaler ID, nicht per serverId

**Datei:** `El Frontend/src/components/dashboard/DashboardViewer.vue:46-48`
**Code:** `dashStore.layouts.find(l => l.id === props.layoutId)`
**Problem:** Nach `fetchLayouts()` werden Server-Dashboards mit UUID als ID gespeichert. Deep-Links mit lokaler ID koennten fehlschlagen.
**Fix:** `layouts.find(l => l.id === id || l.serverId === id)`

#### BUG-H2: InlineDashboardPanel Widget-Mount potenzielle ID-Duplikation

**Datei:** `El Frontend/src/components/dashboard/InlineDashboardPanel.vue:57-64`
**Problem:** `mountId` wird sowohl fuer Container-Div als auch Mount-Target verwendet. Bei Re-Renders koennte `appendChild()` ohne vorherigen `removeChild()` zu Duplikaten fuehren.
**Fix:** Separates `mountId` verwenden oder Mount-Logik mit Cleanup versehen.

#### BUG-H3: Side-Panel ignoriert panelWidth und panelPosition

**Datei:** `El Frontend/src/views/MonitorView.vue:1599-1603`
**Code:** `grid-template-columns: 1fr 300px` — hardcoded.
**Problem:** `target.panelPosition` und `target.panelWidth` werden gespeichert aber NIE ausgewertet.
**Fix:** Dynamische Grid-Columns basierend auf Panel-Config.

#### BUG-H4: InlineDashboardPanel anchor-Positionierung nicht implementiert

**Datei:** `El Frontend/src/views/MonitorView.vue:1214-1219, 1410-1415`
**Problem:** InlineDashboardPanels werden am Ende des L1/L2-Blocks gerendert. Keine Logik fuer `target.anchor` (z.B. 'zone-header', 'after-sensors').
**Fix:** Anchor-basierte Slots implementieren oder anchor aus Interface entfernen.

#### BUG-H5: `serverToLocal()` castet target mit `(dto as any).target`

**Datei:** `El Frontend/src/shared/stores/dashboard.store.ts:331`
**Code:** `target: (dto as any).target as DashboardTarget | undefined`
**Problem:** TypeScript-Sicherheit unterwandert durch unsafe cast.
**Fix:** `dto.target as DashboardTarget | undefined` (ohne `as any`).

#### BUG-H6: Cross-Zone-Dashboards auf L1 filtern NICHT nach target.view

**Datei:** `El Frontend/src/shared/stores/dashboard.store.ts:487-489`
**Code:** `crossZoneDashboards = computed(() => layouts.value.filter(l => l.scope === 'cross-zone'))`
**Problem:** Filtert nur nach `scope`, nicht nach `target.view`. Hardware-View-Dashboards tauchen auch im Monitor auf.
**Fix:** `&& (!l.target || l.target.view === 'monitor')` hinzufuegen.

#### BUG-H7 (NEU/E2E): SlideOver Stats zeigen "—" trotz 1297 Messungen

**Datei:** `El Frontend/src/views/MonitorView.vue:614-650`
**E2E-Befund:** Screenshot `e2e-monitor-L3-slideover.png` — Min: —, Max: —, Ø: —, aber Messungen: 1297.
**Problem:** `fetchDetailStats()` wird via `sensorsApi.getStats()` aufgerufen. Der Endpunkt liefert moeglicherweise keine Daten fuer Mock-ESPs, oder der catch-Block (Zeile 625) verschluckt Fehler ohne Logging.
**Impact:** User sieht keine Statistiken trotz vorhandener Datenpunkte.
**Fix:** Error-Logging im catch-Block hinzufuegen. Pruefen ob `/api/v1/sensors/:id/stats` fuer Mock-Daten funktioniert.

---

### MITTEL — Funktionseinschraenkung oder schlechte UX

#### BUG-M1: Auto-Generierung synced nicht zum Server

**Datei:** `El Frontend/src/shared/stores/dashboard.store.ts:659-661`
**Problem:** `generateZoneDashboard()` ruft `persistLayouts()` (localStorage) auf, aber NICHT `syncLayoutToServer()`.
**Vergleich:** `createLayout()` (Zeile 251-252) ruft korrekt `syncLayoutToServer()` auf.
**Fix:** `syncLayoutToServer(layout.id)` nach `persistLayouts()` aufrufen.

#### BUG-M2: Accordion-Persist Race Condition bei Deep-Link

**Datei:** `El Frontend/src/views/MonitorView.vue:949`
**Problem:** Bei F5 auf `/monitor/:zoneId` koennte `selectedZoneId` zum Mount-Zeitpunkt noch nicht gesetzt sein.
**Fix:** Zusaetzlich `watch(selectedZoneId)` fuer loadAccordionState.

#### BUG-M3: DashboardViewer watch auf `updatedAt` ist fragil

**Datei:** `El Frontend/src/components/dashboard/DashboardViewer.vue:118-122`
**Problem:** `watch(() => layout.value?.updatedAt, ...)` — Aenderungen am Widget-Array ohne `updatedAt`-Update werden nicht erkannt. `loadWidgets()` macht kompletten Rebuild (Flicker).
**Fix:** Tief-Watch auf `layout.value?.widgets` oder hash/version-counter.

#### BUG-M4: CSV-Export hat kein BOM fuer Excel-Kompatibilitaet

**Datei:** `El Frontend/src/views/MonitorView.vue:549-550`
**Code:** `new Blob([csv], { type: 'text/csv' })` — ohne UTF-8 BOM.
**Fix:** `new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })`.

#### BUG-M5: URL-Revoke nach Blob-Download fehlt Timeout

**Datei:** `El Frontend/src/views/MonitorView.vue:555-556`
**Problem:** `revokeObjectURL` synchron nach `click()`. Sporadisch fehlende Downloads.
**Fix:** `setTimeout(() => URL.revokeObjectURL(url), 1000)`.

#### BUG-M6: DashboardUpdate Schema — target-Loeschung unklar

**Datei:** `El Servador/god_kaiser_server/src/schemas/dashboard.py:175-178`
**Problem:** Ob `target: null` korrekt an die DB weitergegeben wird haengt von `exclude_unset` vs `exclude_none` ab.
**Fix:** Service-Code pruefen und sicherstellen dass explizites `null` gespeichert wird.

#### BUG-M7: Zone ohne Dashboards zeigt KEINEN "Dashboard erstellen"-Link

**Datei:** `El Frontend/src/views/MonitorView.vue:1247`
**Code:** `v-if="selectedZoneId && dashStore.zoneDashboards(selectedZoneId).length > 0"` — komplettes Ausblenden.
**Fix:** Else-Block mit `<router-link :to="{ name: 'editor' }">Dashboard erstellen</router-link>`.

---

### NIEDRIG / UX-Verbesserungen

#### UX-1: SensorCard zeigt keinen Sensor-Typ-Icon im Monitor-Modus

**Datei:** `El Frontend/src/components/devices/SensorCard.vue:87-105`
**E2E-Befund:** Alle SensorCards sehen identisch aus — nur Text unterscheidet sie.
**Fix:** SENSOR_TYPE_CONFIG icon-Mapping einbauen und als farbiges Icon links vom Namen anzeigen.

#### UX-2: Keine Bestaetigung bei Actuator-Toggle im Monitor

**Datei:** `El Frontend/src/views/MonitorView.vue:1014-1021`
**Problem:** `toggleActuator()` sendet sofort einen Command ohne Bestaetigung.
**Fix:** ConfirmDialog vor kritischen Aktor-Befehlen.

#### UX-3: Expanded-Panel Chart zeigt "Letzte Stunde ()" wenn Unit leer

**Datei:** `El Frontend/src/views/MonitorView.vue:156`
**Code:** `label: 'Letzte Stunde (${unit})'` — unit kann leer sein.
**Fix:** `label: unit ? 'Letzte Stunde (${unit})' : 'Letzte Stunde'`.

#### UX-4: "Dashboard nicht gefunden" hat keinen kontextuellen Back-Link

**Datei:** `El Frontend/src/components/dashboard/DashboardViewer.vue:179-182`
**E2E-Befund:** Screenshot `e2e-dashboard-not-found.png` — "Dashboard nicht gefunden." + generischer "Zurueck"-Button. Dashboard-ID nicht angezeigt.
**Fix:** Dashboard-ID anzeigen. `router.back()` durch `router.push({ name: 'monitor' })` ersetzen.

#### UX-5: Side-Panel hat kein Collapse/Resize-Handle

**Datei:** `El Frontend/src/views/MonitorView.vue:1425-1433`
**Problem:** Statisch 300px breit, kein Toggle.
**Fix:** Collapse-Toggle am Panel-Rand.

#### UX-6: Stale-Indikator in SensorCard basiert auf 120s, Zone-KPI auf 60s

**Datei:** `El Frontend/src/components/devices/SensorCard.vue:39` + `El Frontend/src/views/MonitorView.vue:729`
**Problem:** Verschiedene Stale-Definitionen fuehren zu Inkonsistenz zwischen L1 und L2.
**Fix:** Einheitlichen Stale-Threshold als shared Konstante.

---

## E2E-Test Checkliste (Playwright-verifiziert)

### Block 1: Build + Migration
- [x] `npm run build` erfolgreich (0 Errors)
- [x] `vue-tsc --noEmit` clean
- [x] Docker: Alle 12 Container healthy
- [ ] **Alembic Migration NICHT angewendet** → `dashboards.target` fehlt

### Block 2: Router + Navigation
- [x] `/monitor` → L1 Zonen-Uebersicht rendert
- [x] `/monitor/:zoneId` → L2 Zonenansicht rendert
- [x] `/monitor/:zoneId/sensor/:sensorId` → L3 SlideOver oeffnet
- [x] `/monitor/dashboard/:dashboardId` → DashboardViewer rendert (Widgets defekt)
- [x] `/monitor/:zoneId/dashboard/:dashboardId` → DashboardViewer rendert
- [x] `/editor` → CustomDashboardView rendert (leer wegen API 500)
- [x] Breadcrumb "Monitor" klick → zurueck zu L1
- [x] "Zurueck"-Button funktioniert korrekt
- [ ] **Breadcrumbs zeigen KEIN Dashboard-Segment** (BUG-K3)

### Block 3: Monitor L1
- [x] 2 Zonen als Cards angezeigt ("Test", "Testneu")
- [x] KPI: "Test" = 3/3 Sensoren, 0/2 Aktoren, Temperatur Ø 14.7°C, "Alles OK"
- [x] KPI: "Testneu" = 0/0 Sensoren, 0/1 Aktoren, "Alarm", "Keine Sensordaten"
- [x] Status-Dot korrekt (Gruen = OK, Rot = Alarm)
- [x] Klick auf Zone-Card → /monitor/:zoneId

### Block 4: Monitor L2
- [x] Subzone-Accordion "Keine Subzone" mit Toggle
- [x] 3 SensorCards sichtbar (GPIO 0, Temp 0C79, GPIO 0)
- [x] SensorCard zeigt: Name, Wert mit Einheit, ESP-ID
- [x] ESP offline Badge bei MOCK_95A49FCB korrekt
- [x] 2 ActuatorCards sichtbar (GPIO 18 pump, GPIO 13 pump)
- [x] Zone-Dashboard-Link "Test Dashboard" (5 Widgets, Auto)
- [x] "Anpassen"-Button fuer Auto-Dashboard sichtbar
- [ ] **KEINE Sparklines auf SensorCards** (BUG-K1)
- [ ] **Sensor-Typ-Icon fehlt** (UX-1)
- [ ] **Toggle-Button "Einschalten" auf ActuatorCards sichtbar** (BUG-K4)

### Block 5: Monitor L3 — Sensor-Detail
- [x] SlideOver oeffnet bei Klick auf "Zeitreihe anzeigen"
- [x] Titel: "SHT31", Wert: 22,0 °C
- [x] Stale-Badge "Veraltet" + "vor 5 Minuten"
- [x] TimeRangeSelector: 1 Std, 6 Std, 24 Std, 7 Tage, Benutzerdefiniert
- [x] "Vergleichen mit"-Section: Temp 0C79 °C, GPIO 0 °C
- [x] Zeitreihen-Chart rendert (24h, ~22°C Linie)
- [x] 1000 Datenpunkte geladen
- [x] CSV-Export Button vorhanden
- [x] Konfiguration Link vorhanden
- [x] Schliessen → zurueck zur Zonenansicht, URL korrekt
- [ ] **Min/Max/Ø zeigen "—" trotz 1297 Messungen** (BUG-H7)
- [ ] **2-Klick-Flow statt 1-Klick** (BUG-K2)

### Block 6: Monitor L3 — DashboardViewer
- [x] DashboardViewer-Seite rendert
- [x] Titel: "Test Dashboard", 5 Widgets
- [x] "Im Editor bearbeiten" Link vorhanden
- [x] Auto-generiert Banner: "Dieses Dashboard wurde automatisch erstellt."
- [x] "Uebernehmen" + "Anpassen" Buttons
- [x] "Zurueck"-Button → /monitor/:zoneId
- [ ] **Widgets zeigen "Sensor auswaehlen" Dropdowns statt Daten** (BUG-K5)
- [ ] **Breadcrumb zeigt kein Dashboard-Segment** (BUG-K3)

### Block 7: Editor-Integration
- [x] /editor Route erreichbar
- [x] "Dashboard Builder" Heading mit "Sensor-Analyse" Dropdown
- [ ] **Editor leer — Dashboard-API gibt 500** (BUG-BLOCKER-1)
- [ ] Dashboard Create → Target setzen → Monitor-View NICHT testbar (API blockiert)

### Block 8: Server-API
- [ ] **GET /api/v1/dashboards → 500** (`dashboards.target does not exist`)
- [ ] POST/PUT/DELETE NICHT testbar (API blockiert)
- [ ] **Root Cause: Alembic Migration `add_dashboard_target` nie ausgefuehrt**

### Block 9: Edge Cases
- [x] `/monitor/non-existent-zone` → "0 Sensoren · 0 Aktoren", "Keine Sensoren oder Aktoren in dieser Zone."
- [x] `/monitor/dashboard/non-existent-id` → "Dashboard nicht gefunden." + "Zurueck"-Button
- [x] Kein Crash, kein White-Screen bei ungueltigen URLs

### Block 10: TypeScript + Tests
- [x] `vue-tsc --noEmit` clean (0 Errors)
- [x] `npm run build` erfolgreich (6.24s)

---

## Kritische E2E-Pfade

| # | Pfad | Ergebnis | Details |
|---|------|----------|---------|
| 1 | L1 → L2 → L3 (Sensor) → L2 → L1 | BESTANDEN | Navigation + Breadcrumbs funktionieren (ausser Dashboard-Segment) |
| 2 | Dashboard Create → Target=Monitor → sichtbar | FEHLGESCHLAGEN | API 500 blockiert gesamten Flow |
| 3 | L2 → Dashboard-Link → DashboardViewer → Editor | TEILWEISE | DashboardViewer rendert, aber Widgets defekt |
| 4 | Auto-Generierung → Zone-Dashboard auf L2 | BESTANDEN | Auto-Dashboard erscheint mit "Auto" Badge |
| 5 | Alembic Migration hin/zurueck | FEHLGESCHLAGEN | Migration nie angewendet |

---

## Empfohlene Fix-Reihenfolge

### Prioritaet 1 — BLOCKER beheben
1. **Alembic Migration anwenden:** `docker exec automationone-server alembic upgrade head` + Server Restart
2. **Verifizieren:** Dashboard-API antwortet mit 200, `target` Feld in Response

### Prioritaet 2 — KRITISCH
3. BUG-K5: DashboardViewer Widget-Initialisierung (Auto-generierte Widgets brauchen sensorId in Config)
4. BUG-K1: SensorCard Sparkline implementieren
5. BUG-K3: TopBar Dashboard-Breadcrumb hinzufuegen
6. BUG-K2 + BUG-K4: Design-Entscheidungen treffen (1-Klick vs 2-Klick, Toggle im Monitor)

### Prioritaet 3 — HOCH
7. BUG-H7: Stats-API Fehler debuggen (Mock-ESP Kompatibilitaet)
8. BUG-H1: DashboardViewer serverId Fallback
9. BUG-H6: crossZoneDashboards target.view Filter
10. BUG-M1: Auto-Generierung → syncLayoutToServer

### Prioritaet 4 — MITTEL/NIEDRIG
11. BUG-M4: CSV UTF-8 BOM
12. BUG-M7: Zone ohne Dashboards Empty State
13. BUG-H3/H4: Side-Panel/Inline-Panel Config auswerten
14. Restliche UX-Bugs

---

## Abgrenzung (aus Original-Auftrag)

**IN diesem Auftrag:**
- Build-Verifikation (Frontend + Backend + Migration) ✓
- Router- und Navigations-Tests (alle 7 Routes) ✓
- Monitor L1/L2/L3 funktionale Pruefung ✓
- DashboardViewer/InlineDashboardPanel Rendering ✓
- Editor-Integration Cross-Flow (blockiert durch API 500) ✓
- Server-API CRUD mit Target-Feld (blockiert) ✓
- Edge Cases und Fehlerszenarien ✓
- TypeScript-Strenge und bestehende Tests ✓

**NICHT in diesem Auftrag:**
- Neues Feature-Development
- Mobile-Responsive Optimierung
- DnD-Vollpruefung
- Logic-Rules-Integration in Monitor
- Performance-Optimierung
