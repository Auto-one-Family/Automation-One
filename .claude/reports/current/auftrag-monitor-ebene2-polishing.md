# Auftrag: Monitor Ebene 2 — Analyse + Polishing der Zonenansicht

> **Erstellt:** 2026-03-01
> **Ziel-Repo:** auto-one
> **Reihenfolge:** 2 von 3 (Monitor-Polishing-Serie)
> **Prioritaet:** HOCH — Zonenansicht ist der zentrale Arbeitsbereich fuer den taeglichen Betrieb
> **Status:** PHASE 1 ABGESCHLOSSEN — IST-Analyse komplett, Entscheidungen getroffen, bereit fuer Phase 2
> **Typ:** Erstanalyse + Polishing (Frontend)
> **Voraussetzung:** `auftrag-monitor-ebene1-polishing.md` — L1 muss stabil und polished sein
> **Voraussetzung:** Konsolidierung Phase 1–3 ABGESCHLOSSEN
> **Nachfolger:** `auftrag-monitor-ebene3-editor-integration.md` (L3 baut auf L2-Sensor-Klick auf)

---

## ANALYSE-REPORT (2026-03-01, autoops:debug + Playwright)

### Visueller IST-Zustand (8 Screenshots in `test-screenshots/monitor-l2/`)

| # | Screenshot | Beschreibung | Ergebnis |
|---|-----------|--------------|----------|
| 1 | `01-monitor-l1-initial.png` | L1 Zone-Overview (Desktop 1280px) | OK — 2 Zonen (Test, Testneu), KPIs korrekt |
| 2 | `02-l2-desktop-1280.png` | L2 "Test" Zone (Desktop 1280px) | OK — Sensoren (3) + Aktoren (2) mit Subzone-Accordion |
| 3 | `03-l2-tablet-768.png` | L2 "Test" Zone (Tablet 768px) | OK — Responsive Grid 2→1 Spalte, Cards umbrechen |
| 4 | `04-l2-mobile-375.png` | L2 "Test" Zone (Mobile 375px) | OK — Sparklines sichtbar, Cards full-width |
| 5 | `05-l2-sensor-expanded.png` | Sensor-Card Expanded Panel (Desktop) | OK — Gauge + LiveChart + HistoricalChart + Actions |
| 6 | `06-l3-slideover.png` | L3 Sensor-Detail SlideOver | OK — 964 Datenpunkte, 24h Chart, CSV Export |
| 7 | `07-l2-accordion-collapsed.png` | Accordion zugeklappt | OK — Chevron dreht, Cards versteckt |
| 8 | `08-l2-testneu-zone.png` | "Testneu" Zone (nur 1 Aktor) | OK — Aktoren mit Not-Stopp, disabled Button |

### Datenfluss-Trace (4 Ketten)

| Kette | Status | Details |
|-------|--------|---------|
| Sensordaten (WS → espStore → useZoneGrouping → SensorCard → Sparkline) | VERIFIZIERT | Sparklines in Mobile+Desktop sichtbar, 86+ Datenpunkte |
| Aktordaten (WS → espStore → useZoneGrouping → ActuatorCard → State-Badge) | VERIFIZIERT | Not-Stopp-Badge rot, Einschalten disabled |
| Dashboard-Links (dashboardStore → zoneDashboards → Template) | VERIFIZIERT (KEINE DATEN) | Code korrekt, aber keine Zone-Dashboards in Mock-Daten |
| Auto-Generierung (generateZoneDashboard) | NICHT AKTIV | Funktion existiert, wird aber nirgends aufgerufen |

### Funktionale Pruefung (8 Tests)

| # | Test | Ergebnis |
|---|------|----------|
| 1 | Subzone-Accordion Toggle | PASS — Chevron rotiert, Cards versteckt, localStorage-Persistenz |
| 2 | SensorCard → Expanded Panel | PASS — Gauge + LiveChart + HistoricalChart + Actions |
| 3 | Expanded → L3 SlideOver | PASS — URL-Sync, 964 Datenpunkte, CSV Export, Breadcrumb korrekt |
| 4 | ActuatorCard Anzeige | PASS mit WARNUNG — Toggle-Button in BEIDEN Modi sichtbar |
| 5 | Zurueck-Navigation | PASS — Korrekt zu L1 |
| 6 | Stale-Sensor | NICHT IMPLEMENTIERT — Utilities existieren, nicht eingebunden |
| 7 | Leere Zone | PASS — Sensoren-Sektion ausgeblendet per v-if |
| 8 | ESP offline Markierung | NICHT IMPLEMENTIERT — esp_state verfuegbar, nicht angezeigt |

### Identifizierte Probleme (10 Stueck)

| ID | Problem | Schweregrad | Aufwand | Entscheidung |
|----|---------|-------------|---------|-------------|
| P2.1 | ActuatorCard Toggle im Monitor sichtbar | ~~HOCH~~ | ~~Klein~~ | **ERLEDIGT — Toggle BEWUSST beibehalten (E1)** |
| P2.2 | Zone-Dashboard-Links nicht sichtbar (generateZoneDashboard nie aufgerufen) | HOCH | Klein | Muss aktiviert werden |
| P2.3 | Kein Stale-Indikator (getDataFreshness/getFreshnessInfo nicht genutzt) | MITTEL | Klein | Muss eingebaut werden |
| P2.4 | Kein ESP-Offline-Indikator (esp_state verfuegbar, nicht angezeigt) | MITTEL | Klein | Muss eingebaut werden |
| P2.5 | SensorCard "Temp 0C79" zeigt Wert "0" ohne Einheit | MITTEL | Debugging | Muss untersucht werden |
| P2.6 | Subzone-Header ohne KPIs (nur Name + Count) | NIEDRIG | Mittel | Muss ergaenzt werden |
| P2.7 | Zone-Header ohne KPI-Zusammenfassung | NIEDRIG | Klein | Muss ergaenzt werden |
| P2.8 | Dashboard-Links VOR Sensoren positioniert (statt NACH) | ~~NIEDRIG~~ | ~~Klein~~ | **ERLEDIGT — VOR BEWUSST beibehalten (E3)** |
| P2.9 | LinkedRulesSection nicht in MonitorView integriert | NIEDRIG | Mittel | Muss ergaenzt werden |
| P2.10 | Doppelte Time-Range-Buttons im Expanded Panel | ~~NIEDRIG~~ | ~~Klein~~ | **ERLEDIGT — Expanded Panel wird radikal vereinfacht (E2)** |
| P2.11 | **NEU:** Sparkline in SensorCard redundant/nutzlos | HOCH | Klein | **Sparkline ENTFERNEN (E2)** |
| P2.12 | **NEU:** Gauge + HistoricalChart im Expanded Panel redundant | HOCH | Mittel | **ENTFERNEN, durch 1h-Chart mit Fetch ersetzen (E2)** |
| P2.13 | **NEU:** L3 SlideOver ohne Multi-Sensor-Overlay | MITTEL | Mittel | **Zone-Sensoren hinzumischbar machen (E2)** |

### 3 Entscheidungen — ALLE GETROFFEN

| # | Entscheidung | Ergebnis | Details |
|---|-------------|----------|---------|
| E1 | ActuatorCard Toggle | **BEIBEHALTEN** | Toggle bleibt im Monitor — Quick-Access fuer Pumpe ein-/ausschalten |
| E2 | SensorCard Klick-Pattern | **2-Stufen, ABER Expanded Panel radikal vereinfacht** | Siehe Redesign-Spezifikation unten |
| E3 | Dashboard-Links Position | **VOR Sensor/Aktor (IST beibehalten)** | Navigation oben, Content unten |

#### E2 Redesign-Spezifikation: Expanded Panel + SensorCard Sparkline

**Problem (IST-Zustand):** Dreifache Redundanz in der Diagramm-Kette:
1. SensorCard zeigt Mini-Sparkline (nur Linie, kaum aussagekraeftig)
2. Expanded Panel zeigt Gauge (= gleicher Wert wie Card-Anzeige) + LiveChart (= gleiche Daten wie Sparkline) + HistoricalChart (= gleiche Darstellung wie L3 SlideOver)
3. L3 SlideOver zeigt Zeitreihe (der eigentliche Detail-View)

**Loesung (SOLL):**

**SensorCard (zugeklappt):**
- Sparkline zeigt entweder ein ORDENTLICHES Mini-Chart (mit Y-Achse-Kontext, nicht nur Linie) ODER wird ganz entfernt und das Chart nur im Expanded Panel gezeigt
- **Entscheidung:** Sparkline in Card ENTFERNEN. Die reine Linie ohne Kontext bringt keinen Mehrwert.
- Card zeigt: Name, Wert+Einheit, Quality-Dot, ESP-ID — kompakt und klar

**Expanded Panel (aufgeklappt, Card-Klick):**
- **ENTFERNT:** Gauge Chart (redundant zur Wert-Anzeige in der Card)
- **ENTFERNT:** HistoricalChart (redundant zu L3 SlideOver)
- **ENTFERNT:** Doppelte Time-Range-Buttons
- **BEHALTEN:** EIN Chart — zeigt die letzte Stunde (1h) mit vorgeladenen Daten, sodass beim Aufklappen sofort Daten sichtbar sind (NICHT nur Live-Daten die erst reinkommen muessen)
- **BEHALTEN:** "Zeitreihe anzeigen" Button → oeffnet L3 SlideOver
- **BEHALTEN:** "Konfiguration" Button → navigiert zu `/sensors`

**L3 SlideOver (Seitenpanel):**
- Zeitreihen-Detail mit TimeRangeSelector (1h/6h/24h/7d/Custom)
- **NEU:** Moeglichkeit weitere Sensoren aus derselben Zone hinzuzumischen (Multi-Sensor-Overlay). Nutzt vorhandene Logik — `useZoneGrouping` liefert bereits alle Sensoren der Zone. User kann per Dropdown/Chips weitere Sensoren zum Chart hinzufuegen.
- CSV-Export wie bisher

**Implementierungs-Hinweise:**
- Das 1h-Chart im Expanded Panel braucht einen initialen Daten-Fetch (`sensorsApi.queryData` mit `start_time = now - 1h`), nicht nur Live-WebSocket-Daten
- `useSparklineCache` kann als Fallback dienen bis der Fetch zurueckkommt
- Das Multi-Sensor-Feature in L3 nutzt `sensorsApi.queryData` pro hinzugefuegtem Sensor und legt mehrere Datasets in den Chart

### Was funktioniert (10 Punkte):

1. L1 → L2 Navigation via Zone-Card-Klick
2. Subzone-Accordion mit localStorage-Persistenz
3. SensorCard mode:'monitor' mit Live-Wert, Einheit, Quality-Dot, Sparkline, ESP-ID
4. Expanded Panel: Gauge + LiveChart + HistoricalChart + Actions
5. L3 SlideOver mit URL-Sync, Breadcrumb, Zeitreihe, CSV-Export
6. ActuatorCard State-Badge (Ein/Aus), Not-Stopp-Badge
7. Aktoren als separate Sektion mit eigenem Accordion
8. Breadcrumb "Monitor > Test > SHT31"
9. Responsive Layout: Desktop 3-spaltig, Tablet 2-spaltig, Mobile 1-spaltig
10. Zurueck-Navigation funktioniert korrekt

---

## Kontext: Warum braucht Ebene 2 eine grundlegende Analyse?

Ebene 2 hat durch die Konsolidierung Phase 1 die **groesste strukturelle Veraenderung** erfahren:
- VORHER: Flache Sensor-Liste pro Zone (keine Subzonen)
- NACHHER: Subzone-Accordion → Sensor/Aktor-Cards via `useZoneGrouping.ts`

Diese Transformation wurde implementiert, aber noch **nicht visuell und funktional verifiziert**. Bevor wir Polishing-Details festlegen koennen, muessen wir den IST-Zustand nach der Konsolidierung GENAU analysieren:

1. **Rendert die Subzone-Gruppierung korrekt?** (useZoneGrouping.ts liefert die Daten, aber Template-Binding muss stimmen)
2. **Sind die SensorCard/ActuatorCard Komponenten im mode:'monitor' korrekt integriert?** (Cards haben zwei Modi — config und monitor)
3. **Funktioniert die Sparkline-Anzeige in den neuen Cards?** (useSparklineCache.ts mit 5s-Deduplizierung)
4. **Sind die Zone-Dashboard-Links auf L2 sichtbar und klickbar?** (Auto-generierte + User-erstellte)
5. **Funktioniert der Klick auf Sensor → L3 Sensor-Detail-SlideOver?**
6. **Ist die ConfigPanel-Entfernung vollstaendig?** (Monitor = Read-Only, keine CRUD-SlideOvers)

**Daher: Dieser Auftrag beginnt ZWINGEND mit einer autoops:debug + Playwright-Analyse.**

---

## IST-Zustand: Was die Konsolidierung auf L2 gebaut hat

### Strukturelle Aenderungen (aus `auftrag-monitor-konsolidierung-implementierung.md`)

**Subzone-Gruppierung (Block 1):**
- `useZoneGrouping.ts` Composable: Liefert `ZoneGroup[]` mit `SubzoneGroup[]` Nesting
- Interfaces: `SensorWithContext`, `ActuatorWithContext`, `ZoneGroup`, `SubzoneGroup`
- Accordion-State auf localStorage (nicht mehr in-memory Set)
- ConfigPanels aus MonitorView ENTFERNT (Read-Only)
- Daten-Anzeige: Aktueller Wert, Sparkline, Status-Dot+Text, ESP-Badge

**Sparkline-Cache (Block 1):**
- `useSparklineCache.ts` Composable: Konfigurierbarer `maxPoints`, 5s-Deduplizierung
- Shared zwischen MonitorView und SensorsView

**Zone-Dashboard-Links (Block 3):**
- `zoneDashboards(zoneId)` **[KORREKTUR: ist eine regulaere Funktion, KEIN Computed]** (`dashboard.store.ts:344`): Filtert Layouts mit `scope === 'zone' && zoneId === current`. Wird bei jedem Template-Render neu aufgerufen — Reaktivitaet durch `layouts` ref gesichert, aber kein Caching.
- Sektion "Zone-Dashboards" am Ende der L2-Ansicht
- Auto-generierte (`autoGenerated: true`) + User-erstellte Dashboards

**Sensor-Detail als L3 (Block 4):**
- Klick auf Sensor → SlideOver mit Zeitreihe (aus SensorHistoryView Logik)
- Route: `/monitor/:zoneId/sensor/:sensorId`
- Breadcrumb: Monitor → Zone → Sensor
- TimeRangeSelector + vue-chartjs + CSV-Export

**Auto-Generierung (Block 5):**
- `generateZoneDashboard()` in dashboard.store.ts
- Sensor-Typ→Widget-Mapping (Temperatur → Line-Chart, pH → Gauge etc.)
- `claimAutoLayout()` — User uebernimmt Auto-Layout (wird `autoGenerated: false`)
- Auto-Layouts aktualisieren sich NUR wenn User nicht modifiziert hat

### Neue Shared-Komponenten (aus `auftrag-komponenten-tab-transformation.md`)

| Komponente | Pfad | Relevanz fuer L2 |
|------------|------|-------------------|
| `SensorCard.vue` | `components/devices/SensorCard.vue` | Unified Card mit `mode: 'monitor'` — zeigt Live-Wert, Sparkline, Status, ESP-Badge |
| `ActuatorCard.vue` | `components/devices/ActuatorCard.vue` | Unified Card mit `mode: 'monitor'` — zeigt State (ON/OFF/PWM), ESP-Badge |
| `DeviceMetadataSection.vue` | `components/devices/DeviceMetadataSection.vue` | Metadata-Anzeige (Hersteller, Dokumentation) — auf L2 als Quick-Info? |
| `LinkedRulesSection.vue` | `components/devices/LinkedRulesSection.vue` | Verknuepfte Logic Rules pro Sensor/Aktor — Deep-Link zu `/logic/:ruleId` |

### Cross-View-Links auf L2 (aus `auftrag-navigation-routing-finalisierung.md`)

| Von (L2) | Nach | Mechanismus |
|----------|------|-------------|
| SensorCard (mode: 'monitor') Klick | **[ENTSCHIEDEN]** Expanded Panel (1h-Chart, Actions), dann "Zeitreihe anzeigen" → L3 SlideOver. Gauge + HistoricalChart ENTFERNT. | `toggleExpanded()` → `openSensorDetail()` (2-Stufen-Pattern) |
| SensorCard "Profil" Button | Komponenten `/sensors` mit Sensor selektiert | router.push mit Query-Parameter |
| ActuatorCard "Profil" Button | Komponenten `/sensors?tab=actuators` mit Aktor selektiert | router.push mit Query-Parameter |
| LinkedRulesSection Rule-Klick | Logic `/logic/:ruleId` | Deep-Link |
| Zone-Dashboard LinkCard | Editor `/editor/:dashboardId` | router.push |
| "Zurueck" | Monitor L1 `/monitor` | router.back() oder router.push |

---

## Phase 1: Grundlegende Analyse (autoops:debug + Playwright)

### A1: Visueller IST-Zustand nach Konsolidierung

**Playwright-Screenshots (PFLICHT — alle muessen dokumentiert werden):**

```
Fuer jede existierende Zone (im Mock-Modus):
1. /monitor/:zoneId — Zonenansicht Gesamtbild (Desktop 1280px)
2. /monitor/:zoneId — Zonenansicht (Tablet 768px)
3. /monitor/:zoneId — Zonenansicht (Mobile 375px)
4. /monitor/:zoneId — Subzone-Accordion aufgeklappt (alle Subzonen)
5. /monitor/:zoneId — Subzone-Accordion zugeklappt (alle Subzonen)
6. /monitor/:zoneId — Sensor-Card im Hover/Focus-Zustand
7. /monitor/:zoneId — Aktor-Card im Hover/Focus-Zustand
8. /monitor/:zoneId — Zone-Dashboard-Links Sektion
```

### A2: Datenfluss-Trace

**autoops:debug muss folgende Ketten verifizieren:**

```
Sensordaten-Kette:
WebSocket sensor_data → espStore.devices Update → useZoneGrouping(zoneId) →
SubzoneGroup[] → SensorCard props → Sparkline-Anzeige

Aktor-Kette:
WebSocket actuator_state → espStore.devices Update → useZoneGrouping(zoneId) →
SubzoneGroup[] → ActuatorCard props → State-Anzeige (ON/OFF/PWM)

Dashboard-Links-Kette:
dashboardStore.layouts → zoneDashboards(zoneId) computed → LinkCards Template

Auto-Generierungs-Kette:
Zone oeffnen → generateZoneDashboard() pruefen → Auto-Layout erstellen/laden → Dashboard-Link anzeigen
```

### A3: Funktionale Pruefung

**Playwright E2E Tests:**

| Test | Erwartung | Pruefe |
|------|-----------|--------|
| Subzone-Accordion Toggle | Klick klappt Subzone auf/zu, State persistiert in localStorage | Accordion-State |
| SensorCard Klick | Sensor-Detail SlideOver oeffnet sich (L3) mit korrektem Sensor | Navigation |
| ActuatorCard Anzeige | State (ON/OFF) wird korrekt angezeigt, KEIN Toggle-Button (Read-Only) | Read-Only |
| Zone-Dashboard-Link Klick | Navigiert zum Editor mit Dashboard geladen | Navigation |
| Zurueck-Navigation | Zurueck-Button oder Breadcrumb → L1 | Navigation |
| Stale-Sensor | Sensor ohne Updates >60s wird visuell markiert | Stale-Check |
| Leere Zone | Zone ohne Sensoren/Aktoren zeigt sinnvollen Empty State | Edge Case |
| ESP offline | Sensoren von offline ESP werden als "disconnected" markiert | Status |

### A4: Identifizierte Probleme dokumentieren

Jedes gefundene Problem als `P2.X` nummerieren (P2 = Polishing Ebene 2):
- Screenshot des Problems
- Betroffene Datei(en) + Zeilennummer(n)
- Schweregrad: KRITISCH / HOCH / MITTEL / NIEDRIG
- Vorgeschlagener Fix

---

## Phase 2: Polishing (basierend auf Analyse-Ergebnissen)

### P2.1: Subzone-Gruppierung UX

**Anforderung (vorbehaltlich Analyse-Ergebnisse):**
- **Accordion-Header:** Subzone-Name + Sensor-Count + Zusammenfassungs-KPI
  - Beispiel: "▼ Hauptraum (4 Sensoren · 23.5°C · 65%)"
  - Wenn alle Sensoren OK → Gruener Status-Dot im Header
  - Wenn mindestens 1 Alarm → Gelber/Roter Status-Dot
- **Accordion-State Persistenz:** localStorage-Key pro Zone
  - **[KORREKTUR]** Tatsaechlicher Key: `ao-monitor-subzone-collapse-${zoneId}` (NICHT `monitor-accordion-${zoneId}`, siehe `MonitorView.vue:512`). Speichert welche Subzones COLLAPSED sind (inverse Logik: Set enthaelt kollabierte Keys).
  - Default: Alle Subzonen aufgeklappt (erster Besuch) — **[BESTAETIGT]** (`MonitorView.vue:517`)
  - Danach: User-Praeferenz merken — **[BESTAETIGT]** (`MonitorView.vue:524-533`)
- **Sortierung:** Subzonen alphabetisch, Sensoren innerhalb einer Subzone nach Typ gruppiert
- **"Unzugeordnet" Subzone:** Sensoren ohne Subzone erscheinen in einer eigenen Gruppe
  - **[KORREKTUR]** Aktuell heisst die Gruppe `"Keine Subzone"` (wenn Zone zugewiesen, `useZoneGrouping.ts:162`) oder leerer String (wenn Zone-unassigned). NICHT "Unzugeordnet"/"Allgemein". Subzones ohne ID werden ans Ende sortiert (`useZoneGrouping.ts:171-174`).

### P2.2: SensorCard im Monitor-Modus — **[ENTSCHEIDUNG GETROFFEN]**

**Card (zugeklappt):**
- **Primaer-Anzeige:** Sensor-Name + Aktueller Wert mit Einheit + Quality-Dot
  - Wert-Format: "23.5°C" (nicht "23.5 °C" — kein Leerzeichen vor Grad)
  - Trend-Indikator: ↑↓→ basierend auf letzten 5 Datenpunkten
- **Sekundaer-Anzeige:** ESP-Badge (welcher ESP liefert die Daten)
  - Quality via `qualityToStatus()` aus `formatters.ts`: good → Gruen, warning → Gelb, alarm → Rot, offline → Grau
  - Doppelte Kodierung: Status-Dot + Text-Label
- **Sparkline: ENTFERNT** — Die reine Linie ohne Y-Achse/Kontext bringt keinen Mehrwert. Das richtige Chart kommt erst im Expanded Panel.
  - Aenderung: `SensorCard.vue` sparkline-Sektion ausblenden im Monitor-Modus
  - Aenderung: `MonitorView.vue` `:sparkline-data` Prop nicht mehr uebergeben
- **Stale-Indikator:** Wenn letztes Update >60s → Visueller Hinweis (z.B. pulsierender Rahmen, "Letzte Daten: vor 2 Min.")
  - **[HINWEIS]** `formatters.ts` hat BEREITS `getDataFreshness()` (Zeile 465) und `getFreshnessInfo()` (Zeile 485) mit Schwellwerten live/recent/stale und passenden Labels+ColorClasses. Diese EXISTIERENDEN Utilities nutzen, statt neue Logik zu bauen.
  - `SensorWithContext` hat `last_read` Property — kann fuer Stale-Check verwendet werden.

**Expanded Panel (aufgeklappt, Card-Klick):** — **[RADIKAL VEREINFACHT]**
- **ENTFERNT:** GaugeChart (zeigt gleichen Wert wie Card-Anzeige — redundant)
- **ENTFERNT:** HistoricalChart (zeigt gleiche Darstellung wie L3 SlideOver — redundant)
- **ENTFERNT:** Doppelte Time-Range-Buttons (IST: zwei Reihen 1h/6h/24h/7d)
- **EIN Chart:** Letzte 1 Stunde, mit initialem Daten-Fetch (`sensorsApi.queryData`, start = now-1h). Dadurch sind beim Aufklappen sofort Daten da, nicht nur Live-WebSocket-Punkte die erst reinkommen muessen.
  - Chart: Ordentliche Y-Achse, Grid, Tooltips — nicht nur nackte Linie
  - Datenquelle: Initial-Fetch + danach Live-Updates via `useSparklineCache` anhaengen
- **Action-Buttons (beibehalten):**
  - "Zeitreihe anzeigen" → oeffnet L3 SlideOver mit vollem Zeitreihen-Detail
  - "Konfiguration" → `/sensors` mit Sensor vorselektiert (Pattern: `{ name: 'sensors', query: { sensor: '${espId}-gpio${gpio}' } }`)

**L3 SlideOver — [ERWEITERUNG: Multi-Sensor-Overlay]:**
- Zeitreihen-Detail mit TimeRangeSelector (1h/6h/24h/7d/Custom) — wie bisher
- **NEU: Multi-Sensor-Overlay** — User kann weitere Sensoren aus derselben Zone zum Chart hinzumischen
  - Dropdown/Chips Selektor zeigt alle Sensoren der Zone (aus `useZoneGrouping`)
  - Pro hinzugefuegtem Sensor: `sensorsApi.queryData` Fetch, neues Dataset im Chart (andere Farbe)
  - Nutzt vorhandene `detailChartData` Logik, erweitert um Array von Sensoren
  - Max 4-5 Sensoren gleichzeitig (Chart-Lesbarkeit)
- CSV-Export wie bisher
- **[ABGRENZUNG]** Multi-Sensor-Overlay Implementierung kann auch in `auftrag-monitor-ebene3-editor-integration.md` verschoben werden wenn Aufwand zu gross

### P2.3: ActuatorCard im Monitor-Modus — **[ENTSCHEIDUNG GETROFFEN]**

**Anforderung:**
- **Primaer-Anzeige:** Aktor-Typ-Icon + Aktueller State (ON/OFF/PWM-Wert)
  - ON: Gruener Badge "EIN"
  - OFF: Grauer Badge "AUS"
  - PWM: Blauer Badge "PWM 80%" (mit Wert)
- **Sekundaer-Anzeige:** ESP-Badge + letzte State-Aenderung Timestamp
- **Toggle-Button: BEIBEHALTEN** — Bewusste Entscheidung: Aktor-Toggle ist Quick-Access fuer Pumpe ein-/ausschalten ohne Config-Seite. Der Toggle-Button bleibt in BEIDEN Modi sichtbar.
  - `toggleActuator()` in MonitorView und `@toggle` Binding bleiben bestehen
  - Kein Code-Umbau noetig — IST-Zustand ist SOLL-Zustand
- **Verknuepfte Rules:** `LinkedRulesSection.vue` zeigt welche Rules diesen Aktor steuern
  - Kompakte Darstellung: Rule-Name als Link → `/logic/:ruleId`
  - Max 3 Rules sichtbar, "X weitere" wenn >3
  - **[HINWEIS]** LinkedRulesSection wird AKTUELL NICHT in MonitorView verwendet. Muss explizit importiert und pro ActuatorCard eingebunden werden. LinkedRulesSection nutzt `logicStore.connections` — Store muss ggf. rules fetchen (`logicStore.fetchRules()`).
  - **[HINWEIS]** LinkedRulesSection hat aktuell KEINE "max 3 Rules"-Begrenzung — zeigt ALLE verknuepften Rules. Max-3-Logik muss ergaenzt werden.
- **Cross-Link:** "Konfigurieren" Icon-Button → `/sensors?tab=actuators` mit Aktor vorselektiert
  - **[HINWEIS]** ActuatorCard hat KEINEN click-Emit im Monitor-Modus (`handleClick()` Zeile 30-34: nur im config-Modus aktiv). Fuer Cross-Link muss ein separater Button/Icon ergaenzt werden.

### P2.4: Zone-Dashboard-Links auf L2 — **[ENTSCHEIDUNG GETROFFEN]**

**Anforderung:**
- **Positionierung: VOR den Sensor/Aktor-Sektionen (IST beibehalten)** — Dashboard-Links sind Navigation, nicht Content. Navigation gehoert nach oben.
  - Kein Template-Umbau noetig — IST-Position (`MonitorView.vue:729-760`) bleibt.
- **Auto-generierte Dashboards:**
  - Badge: "Auto-generiert" (dezent, z.B. kleiner Tag)
  - Klick → Dashboard im View-Mode oeffnen (Editor Route mit View-Mode)
  - "Im Editor bearbeiten" Sekundaer-Link → `/editor/:dashboardId` im Edit-Mode
  - "Uebernehmen" Button → `claimAutoLayout()` — Dashboard wird User-eigen
- **User-erstellte Dashboards:**
  - Badge: "Benutzerdefiniert" (dezent)
  - Klick → Dashboard im View-Mode oeffnen
  - "Bearbeiten" Link → `/editor/:dashboardId` im Edit-Mode
- **Empty State:** Wenn weder Auto- noch User-Dashboards existieren:
  - "Noch keine Zone-Dashboards. Dashboard erstellen →" mit Link zum Editor
  - Auto-Generierung sollte beim ersten Zonenbesuch ein Default-Dashboard anlegen (via `generateZoneDashboard()`)
  - **[HINWEIS]** `generateZoneDashboard()` wird AKTUELL NIRGENDS in MonitorView aufgerufen. Es existiert nur in `dashboard.store.ts:353`. Fuer automatische Generierung beim Zonenbesuch muss ein Aufruf in MonitorView ergaenzt werden (z.B. in `watch(selectedZoneId)` oder `onMounted`). Die Funktion braucht 3 Parameter: `(zoneId, devices[], zoneName)`.
- **Abhaengigkeit Editor View/Edit-Mode:** `auftrag-dashboard-editor-polishing copy.md` Punkt B

### P2.5: Aktor-Sektion Trennung

**Anforderung:**
- Aktoren als SEPARATE Sektion unter den Sensor-Subzonen (nicht innerhalb der Subzone-Accordions gemischt)
- Header: "Aktoren (X)" mit Status-Zusammenfassung
- Grund: Aktoren haben andere Informationsbeduerfnisse als Sensoren (State statt Messwert, Rules statt Sparklines)
- Alternative (Analyse entscheidet): Aktoren INNERHALB der Subzonen gemischt — wenn Subzone-Zuordnung fuer Aktoren sinnvoll ist
- **[BESTAETIGT]** IST-Zustand: Aktoren sind BEREITS als SEPARATE Sektion implementiert (`MonitorView.vue:874-912`). Eigene `<section>` mit Header "Aktoren (X)" und eigenem Subzone-Accordion ueber `zoneActuatorGroup.subzones`. `useZoneGrouping.ts` liefert separate `actuatorsByZone` Daten. Kein struktureller Umbau noetig — nur visuelles Polishing.

### P2.6: Zone-Header und Navigation

**Anforderung:**
- **Zone-Name als Header:** Prominent, mit Zurueck-Pfeil ("← Alle Zonen")
- **Zone-KPI-Zusammenfassung im Header:** "{X} Sensoren · {Y} Aktoren · {N} Alarme"
  - Status-Ampel der Zone (gleiche Logik wie L1 Zone-Card, konsistent)
- **Breadcrumb:** "Monitor > {Zone-Name}" (via TopBar.vue Breadcrumbs) — **[BEREITS IMPLEMENTIERT]** `TopBar.vue:101-115` rendert Breadcrumb via `routeBreadcrumbs` computed. `MonitorView.vue:498-502` setzt `dashStore.breadcrumb.zoneName` reaktiv. Kein Polishing hier noetig.
- **"Konfigurieren" Button:** Kleiner Gear-Icon → Navigiert zu Komponenten-Tab mit Zone-Filter
  - `/sensors?zone=${zoneId}` (wenn SensorsView Zone-Filter unterstuetzt)
  - Oder: `/hardware/:zoneId` (Uebersicht-Tab Zone-Detail)
  - **Analyse muss klaeren** welcher Link sinnvoller ist

### P2.7: Performance und Reaktivitaet auf L2

**Anforderung:**
- **WebSocket-Updates:** Einzelne SensorCards aktualisieren sich OHNE dass die gesamte L2-View re-rendert
  - Vue 3 sollte dies durch reaktive Props automatisch loesen, aber verifizieren
- **useZoneGrouping Neuberechnung:** Nur wenn sich die Zone-Zuordnung aendert (zone_assignment WS-Event), nicht bei jedem sensor_data
  - **[KORREKTUR]** `useZoneGrouping` basiert auf `espStore.devices` (computed). Jedes `sensor_data` WebSocket-Event, das `raw_value` oder `quality` aendert, triggert eine Neuberechnung von `allSensors` und damit `sensorsByZone`. Das ist Vue-Reaktivitaets-Verhalten — die Grouping-Struktur aendert sich nicht, aber die Sensor-Werte darin schon. Vue optimiert das DOM-Update per Virtual-DOM-Diff.
- **Sparkline-Cache:** 5s-Deduplizierung aus useSparklineCache verhindert excessive Redraws
- **Accordion-Animation:** Smooth Transition (max 200ms) — keine ruckelnden Aufklapp-Effekte

---

## Betroffene Dateien

| Datei | Pfad | Aenderungen |
|-------|------|-------------|
| `MonitorView.vue` | `El Frontend/src/views/MonitorView.vue` | L2-Template Polishing (Subzone-Accordion, Cards, Dashboard-Links, Zone-Header) |
| `SensorCard.vue` | `El Frontend/src/components/devices/SensorCard.vue` | Monitor-Modus UX (Sparkline, Trend, Stale-Indikator, Cross-Link) |
| `ActuatorCard.vue` | `El Frontend/src/components/devices/ActuatorCard.vue` | Monitor-Modus UX (State-Badge, Rules-Link, Cross-Link) |
| `LinkedRulesSection.vue` | `El Frontend/src/components/devices/LinkedRulesSection.vue` | Kompakte Darstellung auf L2, Deep-Links pruefen |
| `useZoneGrouping.ts` | `El Frontend/src/composables/useZoneGrouping.ts` | Ggf. Sortierung, "Unzugeordnet" Subzone, KPI-Aggregation pro Subzone |
| `useSparklineCache.ts` | `El Frontend/src/composables/useSparklineCache.ts` | Performance-Verifikation, ggf. Tuning |
| `dashboard.store.ts` | `El Frontend/src/shared/stores/dashboard.store.ts` | zoneDashboards Computed, generateZoneDashboard() Polishing |
| `formatters.ts` | `El Frontend/src/utils/formatters.ts` | qualityToStatus() fuer Subzone-Level-Aggregation |
| `TopBar.vue` | `El Frontend/src/shared/design/layout/TopBar.vue` | Breadcrumb "Monitor > Zone-Name" — **[BEREITS IMPLEMENTIERT]** TopBar hat Monitor-Breadcrumb bereits (Zeile 101-115): `Monitor › ZoneName › SensorName`. Kein Polishing an TopBar noetig |

---

## Abgrenzung

**IN diesem Auftrag:**
- Grundlegende autoops:debug + Playwright-Analyse des L2 IST-Zustands nach Konsolidierung
- Subzone-Accordion UX (Header, Sortierung, Persistenz, Unzugeordnet)
- SensorCard Monitor-Modus Polishing (Sparkline, Trend, Stale, Cross-Link)
- ActuatorCard Monitor-Modus Polishing (State-Badge, Rules, Cross-Link)
- Zone-Dashboard-Links auf L2 (Auto/User, Empty State, Claim-Flow)
- Aktor-Sektion Positionierung (getrennt vs. gemischt — Analyse entscheidet)
- Zone-Header und Navigation (Breadcrumb, Zurueck, KPI)
- Performance-Verifikation (WS-Updates, Reactive-Ketten)

**NICHT in diesem Auftrag:**
- Alles was auf L1 passiert → `auftrag-monitor-ebene1-polishing.md`
- Sensor-Detail SlideOver (L3 Content) → `auftrag-monitor-ebene3-editor-integration.md`
- User-Dashboard-Embedding → `auftrag-monitor-ebene3-editor-integration.md`
- Logic Rules in L2 einbetten → `auftrag-logic-rules-live-monitoring-integration copy.md`
  - **Aber:** LinkedRulesSection.vue pro Sensor/Aktor wird in P2.3 polished (das ist Card-Level, nicht Zone-Level Rules)
- Dashboard-Editor internes Polishing → `auftrag-dashboard-editor-polishing copy.md`
- Metadata-System Erweiterung → `auftrag-komponenten-tab-transformation.md` (ABGESCHLOSSEN, Grundstein gelegt)
- Unified Alert-System → `auftrag-unified-monitoring-ux.md`

---

## Abhaengigkeiten und Querverweise

### Direkte Abhaengigkeiten (muss vorher fertig sein)

| Auftrag | Was wird gebraucht | Status |
|---------|-------------------|--------|
| `auftrag-monitor-konsolidierung-implementierung.md` | useZoneGrouping, useSparklineCache, L2 Subzone-Template, Zone-Dashboards, generateZoneDashboard() | ABGESCHLOSSEN |
| `auftrag-komponenten-tab-transformation.md` | SensorCard.vue, ActuatorCard.vue (mode:'monitor'), LinkedRulesSection.vue | ABGESCHLOSSEN |
| `auftrag-navigation-routing-finalisierung.md` | Cross-View-Links, Breadcrumbs, Deep-Links | ABGESCHLOSSEN |
| `auftrag-monitor-ebene1-polishing.md` | L1 muss stabil sein — Zone-Card-Klick muss korrekt zu L2 navigieren | OFFEN (Vorgaenger) |

### Parallele Auftraege (koennen gleichzeitig laufen)

| Auftrag | Beruehrungspunkte |
|---------|-------------------|
| `auftrag-dashboard-editor-polishing copy.md` | View/Edit-Mode beeinflusst Zone-Dashboard-Link-Verhalten auf L2, Template-System fuer Auto-Generierung |
| `auftrag-logic-rules-editor-polishing copy.md` | Schema-Fixes ermoeglichen korrekte Logic-Store-Daten → LinkedRulesSection auf L2 |

### Nachfolger (wartet auf diesen Auftrag)

| Auftrag | Was er von hier braucht |
|---------|------------------------|
| `auftrag-monitor-ebene3-editor-integration.md` | SensorCard-Klick → L3 SlideOver muss funktionieren, Zone-Dashboard-Links muessen stabil navigieren |
| `auftrag-logic-rules-live-monitoring-integration copy.md` | L2 Zone-Header und Subzone-Struktur muessen stabil sein fuer Rule-Integration |

### Cross-View-Links die von L2 ausgehen

| Von (L2) | Nach | Mechanismus | Status |
|----------|------|-------------|--------|
| SensorCard Klick | **[KORREKTUR]** Expanded Inline-Panel → dann Button → L3 SlideOver (`/monitor/:zoneId/sensor/:sensorId`) | `toggleExpanded()` / `openSensorDetail()` | Implementiert, 2-Stufen-Pattern |
| SensorCard "Konfigurieren" | Komponenten `/sensors` | router.push | **[KORREKTUR]** Nur im Expanded-Panel vorhanden (`MonitorView.vue:858-864`), NICHT auf Card-Level direkt |
| ActuatorCard "Konfigurieren" | Komponenten `/sensors?tab=actuators` | router.push | **[KORREKTUR]** NICHT implementiert — ActuatorCard hat keinen Konfigurieren-Link im Monitor-Modus |
| LinkedRulesSection Rule-Klick | Logic `/logic/:ruleId` | Deep-Link | Aus Routing-Auftrag, verifizieren |
| Zone-Dashboard-Link | Editor `/editor/:dashboardId` | router.push | Aus Konsolidierung, verifizieren |
| "Zurueck" | Monitor L1 `/monitor` | router.back() | Standard |
| Zone-Header "Konfigurieren" | Uebersicht oder Komponenten (Analyse klaert) | router.push | NEU zu definieren |

---

## Qualitaetskriterien

### Phase 1 (Analyse): ABGESCHLOSSEN 2026-03-01
- [x] Alle 8+ Playwright-Screenshots dokumentiert (8 Screenshots in `test-screenshots/monitor-l2/`)
- [x] Datenfluss-Trace fuer alle 4 Ketten verifiziert (2 aktiv, 1 ohne Daten, 1 nicht aktiv)
- [x] Alle 8+ E2E-Tests durchgefuehrt (6 PASS, 2 NICHT IMPLEMENTIERT)
- [x] Identifizierte Probleme als P2.X nummeriert mit Schweregrad (10 Probleme: 2 HOCH, 3 MITTEL, 5 NIEDRIG)

### Phase 2 (Polishing):
- [ ] Subzone-Accordions zeigen Header-KPIs und Status-Dot
- [ ] Subzone-Accordion-State persistiert in localStorage
- [ ] SensorCard zugeklappt: Name + Wert + Einheit + Quality-Dot + ESP-ID (KEIN Sparkline)
- [ ] SensorCard Expanded Panel: EIN 1h-Chart mit Initial-Fetch + "Zeitreihe"/"Konfiguration" Buttons (KEIN Gauge, KEIN HistoricalChart)
- [ ] L3 SlideOver: Multi-Sensor-Overlay (weitere Zone-Sensoren hinzumischbar)
- [ ] ActuatorCards im mode:'monitor' zeigen State-Badge (ON/OFF/PWM) MIT Toggle-Button (bewusst)
- [ ] LinkedRulesSection zeigt max 3 Rules kompakt mit Deep-Links
- [ ] Zone-Dashboard-Links unterscheiden Auto-generiert vs. User-erstellt
- [ ] Empty State fuer Zone-Dashboards zeigt Erstellen-Aufforderung
- [ ] generateZoneDashboard() erstellt beim ersten Zonenbesuch ein Default-Dashboard
- [ ] Stale-Sensoren (>60s kein Update) werden visuell markiert
- [ ] Dashboard-Links bleiben VOR den Sensor/Aktor-Sektionen (IST beibehalten)
- [ ] Alle Cross-View-Links funktionieren (6 Navigationspfade verifiziert)
- [ ] Breadcrumb zeigt "Monitor > Zone-Name"
- [ ] Performance: Keine vollstaendigen Re-Renders bei einzelnen sensor_data Events

---

## UX-Prinzipien (eingebettet — nicht extern referenziert)

| Prinzip | Anwendung auf Ebene 2 |
|---------|----------------------|
| **Shneiderman-Mantra** | "Zoom and filter" — L2 zeigt Zone-Detail nach L1-Overview |
| **5-Sekunden-Regel** | Subzone-Header-KPIs geben sofortige Antwort: "Ist diese Subzone OK?" |
| **Focus+Context** | Breadcrumb + Zone-Header behalten L1-Kontext sichtbar waehrend L2 im Fokus |
| **Doppelte Kodierung** | Alle Status-Anzeigen: Farbe + Text + Icon (nie Farbe allein) |
| **Progressive Disclosure** | L2 zeigt Sensor-Cards, L3 zeigt Sensor-Detail (Klick fuer mehr) |
| **Component-Sprawl #6** | SensorCard/ActuatorCard sind EINE Komponente mit mode-Prop, nicht separate Monitor-Varianten |
| **SPOG-Formel** | Jeder Sensor/Aktor zeigt genau die Information die der Operator jetzt braucht — nicht mehr, nicht weniger |
| **Kontext statt Zahlen** | "23.5°C ↑" statt "23.5", "EIN seit 14:32" statt "EIN" |

---

## /verify-plan Ergebnis (2026-03-01)

**Plan:** Monitor Ebene 2 Zonenansicht Polishing — Subzone-Accordion, SensorCard/ActuatorCard Monitor-Modus, Zone-Dashboards, Navigation
**Geprueft:** 9 Dateipfade, 0 Agents, 0 Services, 6 Cross-View-Links, 4 Composables, 1 Store

### BESTAETIGT

- Route `/monitor/:zoneId` existiert und laedt MonitorView korrekt
- Route `/monitor/:zoneId/sensor/:sensorId` existiert mit Deep-Link Support
- `useZoneGrouping.ts` liefert `ZoneGroup[]` + `ActuatorZoneGroup[]` mit Subzone-Nesting — IST wie Plan
- `useSparklineCache.ts` mit 5s-Deduplizierung und konfigurierbarem `maxPoints` — IST wie Plan
- `SensorCard.vue` hat `mode: 'monitor' | 'config'` Prop — IST wie Plan
- `ActuatorCard.vue` hat `mode: 'monitor' | 'config'` Prop — IST wie Plan
- Accordion-State localStorage-Persistenz implementiert (pro Zone)
- `generateZoneDashboard()` existiert in dashboard.store.ts mit Sensor-Typ→Widget-Mapping
- `claimAutoLayout()` existiert in dashboard.store.ts
- `qualityToStatus()` existiert in formatters.ts
- Aktoren sind BEREITS als separate Sektion implementiert
- Breadcrumb in TopBar BEREITS implementiert fuer Monitor-Route

### KORREKTUREN NOETIG

| # | Kategorie | Plan sagt | System sagt | Fix |
|---|-----------|-----------|-------------|-----|
| K1 | **Dateipfad** | `components/common/TopBar.vue` | `shared/design/layout/TopBar.vue` | Pfad im Plan korrigiert |
| K2 | **SensorCard Klick** | "Gesamte Card klickbar → L3 SlideOver" | Card-Klick → Expanded Inline-Panel, L3 erst via Button darin | **ENTSCHIEDEN**: 2-Stufen beibehalten, Expanded Panel radikal vereinfacht (nur 1h-Chart + Actions) |
| K3 | **ActuatorCard Toggle** | "KEIN Toggle-Button, Read-Only" | Toggle-Button in BEIDEN Modi sichtbar + `toggleActuator()` in MonitorView gebunden | **ENTSCHIEDEN**: Toggle BEIBEHALTEN — Quick-Access fuer Pumpensteuerung |
| K4 | **Dashboard-Links Position** | "NACH den Subzone-Accordions" | Aktuell VOR den Sensor/Aktor-Sektionen | **ENTSCHIEDEN**: VOR beibehalten (IST = SOLL) |
| K5 | **localStorage Key** | `monitor-accordion-${zoneId}` | `ao-monitor-subzone-collapse-${zoneId}` | Im Plan korrigiert |
| K6 | **zoneDashboards** | "Computed" | Regulaere Funktion (kein Caching) | Im Plan korrigiert |
| K7 | **Subzone-Naming** | "Unzugeordnet" oder "Allgemein" | "Keine Subzone" | Im Plan korrigiert |

### FEHLENDE VORBEDINGUNGEN

- [ ] `generateZoneDashboard()` wird nirgends in MonitorView aufgerufen — muss ergaenzt werden fuer Auto-Generierung beim Zonenbesuch
- [ ] `LinkedRulesSection.vue` wird nicht in MonitorView importiert — muss fuer P2.3 ergaenzt werden
- [ ] `LinkedRulesSection` hat keine "max 3 Rules"-Begrenzung — muss ergaenzt werden
- [ ] ActuatorCard hat keinen Click-Emit im Monitor-Modus — "Konfigurieren"-Link muss separat ergaenzt werden

### ERGAENZUNGEN

- **Expanded Inline-Panel — REDESIGN**: IST hat Gauge + LiveChart + HistoricalChart + doppelte TimeRange-Buttons. **SOLL (entschieden):** Nur EIN 1h-Chart mit Initial-Fetch + "Zeitreihe anzeigen" + "Konfiguration" Buttons. Gauge und HistoricalChart werden entfernt (redundant). SensorCard-Sparkline wird ebenfalls entfernt (nackte Linie ohne Kontext bringt nichts).
- **Multi-Sensor-Overlay in L3**: NEU — L3 SlideOver bekommt Dropdown/Chips um weitere Sensoren aus derselben Zone hinzuzumischen. Nutzt vorhandene `useZoneGrouping` + `sensorsApi.queryData`. Kann bei Aufwand-Ueberschreitung nach `auftrag-monitor-ebene3-editor-integration.md` verschoben werden.
- **Existierende Stale-Utilities**: `formatters.ts` hat `getDataFreshness()` und `getFreshnessInfo()` mit fertigen Schwellwerten und Labels. Sollten fuer Stale-Indikator wiederverwendet werden statt neue Logik.
- **toggleActuator() BLEIBT**: Bewusste Entscheidung — Toggle im Monitor ist Quick-Access.
- **Sensor "Konfigurieren" Link**: Bleibt im Expanded-Panel (`MonitorView.vue:858-864`), nutzt `{ name: 'sensors', query: { sensor: '${espId}-gpio${gpio}' } }`.

### Zusammenfassung fuer TM

**Alle 3 Entscheidungen getroffen. Bereit fuer Phase 2 Implementierung.**

1. **E1 ActuatorCard Toggle:** BEIBEHALTEN — Quick-Access
2. **E2 SensorCard/Expanded Panel:** 2-Stufen beibehalten, aber Expanded Panel radikal vereinfacht: Gauge + HistoricalChart + doppelte Buttons ENTFERNT, nur 1h-Chart mit Initial-Fetch + Action-Buttons. SensorCard-Sparkline ebenfalls ENTFERNT.
3. **E3 Dashboard-Links:** VOR Sensoren beibehalten (IST = SOLL)
4. **NEU: Multi-Sensor-Overlay** in L3 SlideOver (Zone-Sensoren hinzumischbar)

**Implementierungs-Reihenfolge Phase 2:**
1. SensorCard Sparkline entfernen, Card kompakter machen
2. Expanded Panel vereinfachen (Gauge + HistoricalChart + doppelte Buttons entfernen)
3. 1h-Chart im Expanded Panel mit Initial-Fetch implementieren
4. generateZoneDashboard() beim Zonenbesuch aktivieren
5. Stale-Indikator + ESP-Offline-Indikator einbauen
6. Subzone-Header KPIs + Zone-Header KPIs ergaenzen
7. L3 Multi-Sensor-Overlay (wenn Aufwand im Rahmen)
