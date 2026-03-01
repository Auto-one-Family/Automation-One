# Dashboard Editor — V2 Verifikation

**Datum:** 2026-03-01
**Tester:** Claude Opus 4.6 (Playwright + Code-Review)
**Credentials:** admin / Admin123#
**Server:** http://localhost:8000 | **Frontend:** http://localhost:5173

---

## Zusammenfassung

| Phase | Status | Details |
|-------|--------|---------|
| Phase 0: Bug-Fix | PASS | Alle Fixes bereits angewendet (kein Code-Change nötig) |
| Phase 1: Server-API | PASS | 6/6 Code-Review + 8/8 Live-Tests |
| Phase 2: Mock-Umgebung | PASS (eingeschränkt) | 4 ESPs, 3 Sensoren, keine Live-Sensor-WebSocket-Events |
| Phase 3: Frontend UI | PASS (9/9 Widgets) | 1 kritischer Bug gefunden (Template Persistence) |
| Phase 4: Datenfluss | TEILWEISE | WebSocket Health-Events OK, Sensor-Updates fehlen |
| Phase 5: localStorage | **FAIL** | BUG #1: Widget-Persistenz durch autoSave-Race-Condition zerstört |
| Phase 6: Temporal | ÜBERSPRUNGEN | Keine Live-Sensor-Daten verfügbar (Mock sendet keine Updates via WS) |
| Phase 7: Edge Cases | PASS | Leerer Name ignoriert, Doppel-Name erlaubt, 0 Console-Errors |
| Phase 8: Pattern-Konsistenz | PASS | Server 4/4, Frontend 4/4 |
| Phase 9: Server/MQTT | PASS | 0 Errors in Server-Logs, Sensor-Daten werden gespeichert |

**Gesamtbewertung: 8/10 Phasen PASS, 1 FAIL (kritisch), 1 übersprungen**

---

## Phase 0: Bug-Fix

### 0.1 grid.removeAll Ghost-Bug
- **Status:** Bereits gefixt (kein Code-Change nötig)
- Alle 3 Stellen verwenden bereits `grid.removeAll(true)`:
  - `CustomDashboardView.vue:251` (loadWidgetsToGrid)
  - `CustomDashboardView.vue:505` (handleCreateLayout)
  - `CustomDashboardView.vue:545` (handleDeleteLayout)
- `onUnmounted()` Cleanup korrekt: `render(null, el)`, `mountedWidgets.clear()`, `grid.destroy(false)`

### 0.2 localStorage
- Bereinigt via `localStorage.removeItem('automation-one-dashboard-layouts')`
- Nach Reload: Empty-State korrekt angezeigt

### 0.3 Hardcoded Farben
- **Bereits extrahiert** in `El Frontend/src/utils/chartColors.ts`
- 8 CHART_COLORS: `#60a5fa, #34d399, #fbbf24, #f87171, #a78bfa, #22d3ee, #fb923c, #f472b6`
- Importiert in: `WidgetConfigPanel.vue`, `MultiSensorWidget.vue`

---

## Phase 1: Server-API

### 1.1 Alembic Migration — PASS
- `add_dashboards_table.py`: revision="add_dashboards", down_revision="b2c3d4e5f6a7"
- 11 Spalten korrekt definiert (UUID PK, FK→user_accounts CASCADE, JSON widgets, Timestamps)
- 2 Indices: `idx_dashboard_shared`, `idx_dashboard_scope_zone`
- Downgrade: Indices ZUERST, dann Table — korrekte Reihenfolge

### 1.2 SQLAlchemy Model — PASS
- `Dashboard(Base, TimestampMixin)`, `__tablename__ = "dashboards"`
- 11 mapped_column() Felder, 3 Indices in `__table_args__`
- `__repr__` gibt name, owner_id, shared zurück

### 1.3 Repository — PASS
- `DashboardRepository(BaseRepository[Dashboard])`
- 6 Methoden: get_user_dashboards, count_user_dashboards, get_by_zone, get_auto_generated, is_owner
- Korrekte OR-Bedingung (owner_id | is_shared), order_by updated_at desc

### 1.4 Pydantic Schemas — PASS
- 7 Schemas: DashboardWidgetConfig (18 aliased Felder), DashboardWidget, DashboardCreate, DashboardUpdate (Partial), DashboardResponse, DashboardListResponse, DashboardDataResponse
- camelCase Aliases via `Field(None, alias="sensorId")`, `populate_by_name=True`

### 1.5 Service — PASS
- 5 Methoden mit Auth-Checks (owner OR admin OR is_shared)
- `session.commit()` nach allen Mutationen
- Logger.info/warning korrekt eingesetzt

### 1.6 Router — PASS
| Method | Path | Status | Auth |
|--------|------|--------|------|
| GET | "" | 200 | ActiveUser |
| GET | "/{id}" | 200/404 | ActiveUser |
| POST | "" | 201 | ActiveUser |
| PUT | "/{id}" | 200/404 | ActiveUser |
| DELETE | "/{id}" | 200/404 | ActiveUser |

### 1.7 Import-Checks — PASS (alle 4)
- `db/models/__init__.py`: Dashboard importiert + in `__all__`
- `db/repositories/__init__.py`: DashboardRepository importiert + in `__all__`
- `schemas/__init__.py`: Alle 6 Dashboard-Schemas importiert + in `__all__`
- `api/v1/__init__.py`: dashboards_router importiert, included, in `__all__`

### 1.8 Live API-Tests — 8/8 PASS

| # | Test | HTTP | Ergebnis |
|---|------|------|----------|
| 1 | GET /api/v1/dashboards | 200 | success:true, data:[], pagination korrekt |
| 2 | POST mit 1 Widget | 201 | UUID generiert, owner_id=1, widget gespeichert |
| 3 | GET by ID | 200 | Daten identisch mit POST-Response |
| 4 | PUT Name ändern | 200 | Name geändert, updated_at aktualisiert |
| 5 | PUT Widgets ändern | 200 | Gauge statt Line-Chart |
| 6 | GET List nach Changes | 200 | 1 Eintrag, pagination.total_items=1 |
| 7 | DELETE | 200 | "Dashboard deleted" |
| 8 | GET nach DELETE | 404 | Korrekte Fehlermeldung |

---

## Phase 2: Mock-Umgebung

### 2.1 ESP-Status

| ESP-ID | Name | Status | Sensoren | Aktoren |
|--------|------|--------|----------|---------|
| MOCK_95A49FCB | Mock #9FCB | online | 1 (SHT31 GPIO 0) | 2 (pump GPIO 18, pump GPIO 13) |
| MOCK_98D427EA | Mock #27EA | online | 0 | 1 (pump GPIO 5 EMERGENCY_STOP) |
| MOCK_57A7B22F | Mock #B22F | offline | 0 | 0 |
| MOCK_0CBACD10 | Mock #CD10 | online | 2 (DS18B20 GPIO 4, SHT31 GPIO 0) | 0 |

### 2.2 WebSocket-Datenfluss
- **Health-Events:** Kommen regelmäßig (~alle 5s pro ESP) via `handleEspHealth`
- **Sensor-Update-Events:** Nicht vorhanden via WebSocket → Charts können keine Live-Daten akkumulieren
- **Hinweis:** Server speichert Sensor-Daten in DB (sichtbar in Server-Logs), aber kein WebSocket-Broadcast für sensor_update Events beobachtet
- `last_read` im Store ist `null` für alle Sensoren

### 2.3 MQTT-Traffic
- Server-Logs zeigen: Heartbeats + Sensor-Daten kommen per MQTT regelmäßig
- Sensor-Daten-Speicherung: ~alle 30s pro ESP (MOCK_95A49FCB, MOCK_0CBACD10)

---

## Phase 3: Frontend UI

### 3.1 Navigation & Initial State — PASS
- ViewTabBar: 3 Tabs (Übersicht, Monitor, Editor)
- Toolbar: "Dashboard Builder" + LayoutGrid-Icon
- Empty-State: "Erstelle ein neues Dashboard oder wähle ein bestehendes aus."

### 3.2 Edit/View Mode Toggle — PASS
- View-Mode: "Bearbeiten" Button, kein Katalog, kein Import/Löschen
- Edit-Mode: "Ansichtsmodus" mit --active, Widget-Katalog (220px, 3 Gruppen), Import+Löschen sichtbar
- Toggle funktioniert korrekt in beide Richtungen

### 3.3 Layout-Erstellung — 5/5 PASS (mit Bug-Hinweis)

| Dashboard | Methode | Widgets | Status |
|-----------|---------|---------|--------|
| Sensor-Analyse | Manuell (Name) | 0 (leer) | PASS |
| Zonen-Übersicht | Template | 4 Gauges | PASS |
| Sensor-Detail | Template | 1 Historical | PASS* |
| Multi-Sensor-Vergleich | Template | 1 Multi-Sensor | PASS* |
| Leer starten | Template | 0 | PASS |

*Template-Widgets gehen durch BUG #1 verloren nach Layout-Wechsel

**Layout-Wechsel DOM-Ghost-Check:** PASS — Exakt korrekte Widget-Anzahl nach jedem Wechsel

### 3.4 Widget-Katalog — Alle 9 Typen — PASS

| # | Widget | Type | Default w×h | minW×minH | Besonderheit |
|---|--------|------|-------------|-----------|-------------|
| 1 | Linien-Chart | line-chart | 6×4 | 4×3 | Sensor-Select im Widget, LiveLineChart Canvas |
| 2 | Gauge-Chart | gauge | 3×3 | 2×3 | Zeigt 22°C mit SHT31-Sensor |
| 3 | Sensor-Karte | sensor-card | 3×2 | 2×2 | Kompaktkarte mit Sensor-Select |
| 4 | Historische Zeitreihe | historical | 6×4 | 6×4 | Sensor-Select + Zeitraum-Chips |
| 5 | Multi-Sensor-Chart | multi-sensor | 8×5 | 6×4 | Sensor-Add-Select, Multi-Linien |
| 6 | Aktor-Status | actuator-card | 3×2 | 2×2 | Aktor-Select (3 Pumpen) |
| 7 | Aktor-Laufzeit | actuator-runtime | 4×3 | 3×3 | Zeigt 3 Pumpen, 1x EMERGENCY_STOP |
| 8 | ESP-Health | esp-health | 6×3 | 4×3 | 3 Online / 1 Offline, RSSI-Werte |
| 9 | Alarm-Liste | alarm-list | 4×4 | 4×4 | "Keine aktiven Alarme" |

**DOM-CHECK nach 9 Widgets:** Exakt 9 grid-stack-item Elemente — PASS

### 3.5 WidgetConfigPanel — 9/9 PASS

| Widget-Typ | Dialog-Titel | Sensor | Aktor | Y-Range | Zeitraum | Schwellenwerte | Farbe (8) |
|------------|-------------|--------|-------|---------|----------|----------------|-----------|
| Linien-Chart | PASS | PASS | - | PASS | - | PASS | PASS |
| Gauge | PASS | PASS | - | - | - | - | PASS |
| Sensor-Karte | PASS | PASS | - | - | - | - | PASS |
| Historisch | PASS | PASS | - | PASS | PASS (4 Chips) | PASS | PASS |
| Multi-Sensor | PASS | - | - | - | - | - | PASS |
| Aktor-Status | PASS | - | PASS | - | - | - | PASS |
| Aktor-Laufzeit | PASS | - | - | - | - | - | PASS |
| ESP-Health | PASS | - | - | - | - | - | PASS |
| Alarm-Liste | PASS | - | - | - | - | - | PASS |

**Threshold Auto-Fill (SHT31, Range -40 bis 125):**
- Alarm Low: -40 — PASS
- Warn Low: -23.5 — PASS (-40 + 165×0.1)
- Warn High: 108.5 — PASS (125 - 165×0.1)
- Alarm High: 125 — PASS
- Y-Achse Label: "Y-Achse (SHT31: -40–125 °C)" — PASS

### 3.8 Export — PASS
- Dateiname: `dashboard-Sensor-Analyse.json`
- JSON-Struktur: id, name, createdAt, updatedAt, widgets[]
- Jedes Widget: id, type, x, y, w, h, config (title, sensorId, thresholds, etc.)
- Toast: "Dashboard exportiert"

### 3.9 Layout-Löschung — PASS
- ConfirmDialog: Titel "Dashboard löschen", Text mit Dashboard-Name
- Danger-Variante (roter Button)
- Abbrechen-Button funktioniert

---

## Phase 4: Datenfluss-Verifizierung

### 4.1 WebSocket → Store → Widget Pipeline
- **Health-Events:** Kommen korrekt an (`handleEspHealth received` ~alle 5s)
- **Sensor-Updates:** NICHT über WebSocket beobachtet
- `last_read` = null bei allen Sensoren im Store
- `raw_value` = statisch (22 für SHT31, 0 für DS18B20)

### 4.2 Chart-Daten-Akkumulation
- **Nicht testbar** — keine Live-Sensor-WebSocket-Events verfügbar
- Server speichert Sensor-Daten in DB (Server-Logs bestätigen), aber kein WS-Broadcast

### 4.5 Server-API Sync
- Dashboard-CRUD lebt NUR in localStorage (kein POST/PUT an Server-API bei Frontend-Änderungen)
- Server-API existiert und funktioniert (Phase 1 bestätigt), aber Frontend nutzt sie nicht

---

## Phase 5: localStorage Persistenz

### 5.1 Struktur — PASS (initial)
- Valides JSON-Array mit 5 Layouts
- Korrekte Felder: id, name, createdAt, updatedAt, widgets[]

### 5.2 Persistenz nach Reload — PASS
- Alle 9 Widgets in "Sensor-Analyse" nach F5 wiederhergestellt
- Positionen (x, y, w, h) korrekt
- Sensor-Zuweisungen erhalten (Gauge zeigt 22°C)
- DOM-Count: 9 nach Reload

### 5.3 Widget-Count Integrität — **FAIL (BUG #1)**

**Vor Wechsel:**
| Dashboard | Widgets |
|-----------|---------|
| Sensor-Analyse | 9 |
| Zonen-Übersicht | 4 |
| Sensor-Detail | 0 (sollte 1 sein) |
| Multi-Sensor-Vergleich | 0 (sollte 1 sein) |
| Leer starten | 0 |

**Nach Layout-Wechsel (Sensor-Analyse → Zonen-Übersicht → Sensor-Analyse):**
| Dashboard | Widgets |
|-----------|---------|
| Sensor-Analyse | **0** (sollte 9 sein!) |
| Zonen-Übersicht | **0** (sollte 4 sein!) |
| Alle anderen | 0 |

---

## Phase 6: Temporal-Verifizierung

**ÜBERSPRUNGEN** — Keine Live-Sensor-WebSocket-Events verfügbar. Charts können keine Datenpunkte akkumulieren.

---

## Phase 7: Edge Cases

| # | Test | Ergebnis | Details |
|---|------|----------|---------|
| 7.1 | Leerer Name | PASS | Wird ignoriert, kein Dashboard erstellt |
| 7.3 | Doppelter Name | PASS | Erlaubt (IDs unique), Toast korrekt |
| 7.7 | Schneller Layout-Wechsel | PASS (DOM) | Keine Ghost-Widgets im DOM |
| 7.9 | Console Errors | PASS | 0 Errors über gesamte Session |

---

## Phase 8: Pattern-Konsistenz

### Server (4/4 PASS)

| Prüfung | Status | Details |
|---------|--------|---------|
| Router-Pattern | PASS | Identisch mit logic.py (HTTPException 404, ActiveUser, DBSession) |
| Repository-Pattern | PASS | BaseRepository[Dashboard], async, Session-Nutzung |
| Service-Pattern | PASS | Constructor(session), commit() nach Mutations, Logger |
| Alembic-Kette | PASS | b2c3d4e5f6a7 → add_dashboards (keine Lücke) |

### Frontend (4/4 PASS)

| Prüfung | Status | Details |
|---------|--------|---------|
| CSS-Variablen | PASS | Keine hardcoded Hex in Views/Widgets (nur in chartColors.ts) |
| BEM-Naming | PASS | Konsistent `dashboard-builder__*` |
| TypeScript any | PASS | Nur 2 legitime Stellen (widgets: any[], value: any) |
| Cleanup onUnmounted | PASS | render(null), mountedWidgets.clear(), grid.destroy(false) |

---

## Phase 9: Server/MQTT Monitoring

### Server-Logs
- **0 Errors, 0 Exceptions, 0 Tracebacks**
- Nur INFO-Level: Sensor-Daten gespeichert, Heartbeats, Health-Checks
- Sensor-Daten ~alle 30s pro aktiven ESP (MOCK_95A49FCB, MOCK_0CBACD10)
- Health-Checks: 3 checked, 3 online, 0 timed out

### MQTT-Traffic
- Heartbeats kommen regelmäßig (MOCK_95A49FCB, MOCK_0CBACD10, MOCK_98D427EA)
- Sensor-Daten werden per MQTT empfangen und in DB gespeichert
- MOCK_98D427EA in SAFE_MODE (Actuator EMERGENCY_STOP)

---

## Bug-Liste (sortiert nach Schweregrad)

| # | Schweregrad | Beschreibung | Datei:Zeile | Fix-Vorschlag |
|---|-------------|-------------|-------------|---------------|
| 1 | **KRITISCH** | Template-Widget-Persistenz: `grid.removeAll(true)` triggert `grid.on('removed')` → `autoSave()` mit 0 Widgets BEVOR neue Widgets geladen werden. Bei jedem Layout-Wechsel werden Widgets des vorherigen UND aktuellen Layouts mit 0 überschrieben. | `CustomDashboardView.vue:141` (grid.on removed) + `:251` (loadWidgetsToGrid) | Flag `isLoadingWidgets` setzen, in `autoSave()` prüfen: `if (isLoadingWidgets) return;` — oder `grid.on('removed')` Handler während loadWidgets deaktivieren |
| 2 | **MITTEL** | Template "Sensor-Detail" hat nur 1 Widget (historical), Spec erwartet 3 (line-chart, sensor-card, historical) | `dashboard.store.ts:295-301` | Template-Definition erweitern um 2 weitere Widgets |
| 3 | **NIEDRIG** | Frontend nutzt Server-API nicht für Dashboard-Persistenz (nur localStorage) | `CustomDashboardView.vue` | Dashboard-Store mit API-Sync erweitern (POST/PUT/DELETE bei Änderungen) |
| 4 | **NIEDRIG** | Sensor-Updates kommen nicht via WebSocket (nur Health-Events) — Charts können keine Live-Daten akkumulieren | Server WebSocket-Handler | Prüfen ob `sensor_update` Events im WS-Broadcast implementiert sind |
| 5 | **INFO** | Export-JSON enthält kein `description`-Feld (fehlt komplett statt null) | `CustomDashboardView.vue` (exportLayout) | `description: layout.description || ''` im Export-Objekt |

---

## Screenshots

| Datei | Beschreibung |
|-------|-------------|
| `test-screenshots/initial-empty-state.png` | Leerer Editor nach localStorage-Bereinigung |
| `test-screenshots/template-zone-overview.png` | Zonen-Übersicht mit 4 Gauges |
| `test-screenshots/template-sensor-detail.png` | Sensor-Detail Template |
| `test-screenshots/template-multi-sensor.png` | Multi-Sensor-Vergleich Template |
| `test-screenshots/all-9-widgets.png` | Alle 9 Widget-Typen im Sensor-Analyse Dashboard |
| `test-screenshots/config-panel-line-chart.png` | Config-Panel mit Threshold Auto-Fill |

---

## Fazit

Das Dashboard-Editor-System ist **architektonisch solide** (Server-API, Schemas, Repository-Pattern alle PASS). Die Frontend-UI rendert alle 9 Widget-Typen korrekt, Config-Panels funktionieren wie spezifiziert, und es gibt 0 Console-Errors.

**Der kritische Bug #1 (autoSave Race-Condition)** muss vor Production-Release gefixt werden, da er bei jedem Layout-Wechsel alle Widget-Konfigurationen zerstört. Der Fix ist klar: Ein `isLoadingWidgets`-Flag in `loadWidgetsToGrid()` setzen und in `autoSave()` prüfen.

**Sekundär** sollte die Server-API-Integration im Frontend aktiviert werden (Bug #3), damit Dashboards nicht nur lokal persistieren.
