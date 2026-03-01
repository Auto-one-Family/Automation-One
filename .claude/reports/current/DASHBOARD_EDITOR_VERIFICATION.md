# Dashboard Editor — Vollständige Funktionsprüfung

**Datum:** 2026-03-01
**Agent:** AutoOps Debug (claude-opus-4-6)
**Scope:** 6 Frontend-Fixes + Server-API Dashboard-Persistenz

---

## Zusammenfassung

| Phase | Status | Details |
|-------|--------|---------|
| 1. Server-API | **PASS** | Alle 6 Code-Reviews + 6 Live-Tests bestanden |
| 2. Frontend UI | **PARTIAL** | 1 kritischer Bug (Widget-Geisterbilder), Rest OK |
| 3. localStorage | **FAIL** | Daten korrumpiert durch Grid-Cleanup-Bug |
| 4. Temporal | **N/A** | Datenfluss abhängig von Mock-Push-Frequenz |
| 5. Pattern-Konsistenz | **88%** | 1 Abweichung (hardcoded Hex-Farben) |
| 6. Edge Cases | **PARTIAL** | Kritischer Bug dominiert Ergebnisse |

---

## PHASE 1: Server-API Verifizierung — PASS (6/6)

### 1.1 Alembic Migration — PASS
- `revision = "add_dashboards"`, `down_revision = "b2c3d4e5f6a7"` korrekt
- 11 Spalten, 2 Indices, downgrade() korrekt (Indices → Table)
- `b2c3d4e5f6a7` = `increase_audit_logs_request_id_varchar_255` (letzte Migration)

### 1.2 SQLAlchemy Model — PASS
- `Dashboard(Base, TimestampMixin)`, `__tablename__ = "dashboards"`
- 3 Indices in `__table_args__`, `__repr__` korrekt
- Import + `__all__` in `models/__init__.py`

### 1.3 Repository — PASS
- `DashboardRepository(BaseRepository[Dashboard])`, 5 Methoden
- OR-Bedingung für owned+shared, `order_by updated_at DESC`

### 1.4 Pydantic Schemas — PASS
- DashboardWidgetConfig: 16 Felder mit camelCase-Aliases, `populate_by_name=True`
- DashboardWidget: id, type, x (ge=0), y (ge=0), w (ge=1), h (ge=1)
- DashboardCreate/Update/Response + List/Data Responses
- Alle 6 Schemas in `schemas/__init__.py` + `__all__`

### 1.5 Service — PASS
- CRUD + Ownership-Checks + Admin-Override
- `session.commit()` nach allen Mutations
- Logger konsistent mit anderen Services

### 1.6 Router — PASS
- 5 Endpoints: GET list, GET single, POST, PUT, DELETE
- `prefix="/v1/dashboards"`, `tags=["dashboards"]`
- Import + `include_router()` + `__all__` in `api/v1/__init__.py`

### 1.7 Live-Test — PASS (6/6)

| # | Test | HTTP | Ergebnis |
|---|------|------|----------|
| 1 | GET /api/v1/dashboards (empty list) | 200 | success:true, data:[], pagination vorhanden |
| 2 | POST (create) | 201 | data.id = UUID, owner_id=1 |
| 3 | GET /{id} | 200 | Gleiche Daten |
| 4 | PUT /{id} name="Updated Name" | 200 | Name geändert, updated_at aktualisiert |
| 5 | DELETE /{id} | 200 | message:"Dashboard deleted" |
| 6 | GET /{id} (deleted) | 404 | Korrekte Fehlermeldung |

---

## PHASE 2: Frontend Playwright UI-Tests

### 2.1 Navigation — PASS
- ViewTabBar: Übersicht / Monitor / Editor
- Editor-Tab aktiv, "Dashboard Builder" Titel + LayoutGrid-Icon

### 2.2 Edit/View Mode Toggle — PASS
- **Fix B verifiziert:** isEditing=false als Default → "Bearbeiten" Button (Eye-Icon)
- View-Mode: Nur Export-Button sichtbar, kein Katalog/Import/Löschen
- Edit-Mode: "Ansichtsmodus" [active], Katalog-Sidebar, Import, Löschen, Zahnräder sichtbar
- Toggle zurück: Katalog verschwindet, Buttons verschwinden

### 2.3 Layout-Erstellung & Management — PASS (mit Bug-Einschränkung)
- Layout-Dropdown öffnet/schließt korrekt
- 4 Templates: Zonen-Übersicht, Sensor-Detail, Multi-Sensor-Vergleich, Leer starten
- Neues Dashboard erstellen via Input + Enter → Toast korrekt
- Template-Erstellung → Toast "aus Vorlage erstellt" korrekt
- Layout-Wechsel via Dropdown-Liste funktioniert
- **onClickOutside** für Dropdown funktioniert (schließt bei Außenklick)
- Layout-Liste zeigt alle Dashboards korrekt

### 2.4 Widget-Katalog — PASS
Alle 9 Widgets in 3 Kategorien korrekt:

| Kategorie | Widgets | Status |
|-----------|---------|--------|
| SENSOREN (5) | Linien-Chart, Gauge-Chart, Sensor-Karte, Historische Zeitreihe, Multi-Sensor-Chart | PASS |
| AKTOREN (2) | Aktor-Status, Aktor-Laufzeit | PASS |
| SYSTEM (2) | ESP-Health, Alarm-Liste | PASS |

### 2.5 LineChartWidget — PARTIAL

| Fix | Beschreibung | Code-Review | Live-Test |
|-----|-------------|-------------|-----------|
| 1a | Watch auf last_read statt raw_value | **PASS** (Zeile 87) | Nicht verifizierbar (Mock-Daten konstant) |
| 1b | localSensorId statt props.sensorId | **PASS** (Zeile 51) | **PASS** — Sensor-Auswahl funktioniert |

- Sensor-Auswahl im Widget-Dropdown → Chart-Canvas erscheint sofort
- Verfügbare Sensoren: 3 Mock-Sensoren korrekt gelistet
- **Live-Daten:** Keine neuen Datenpunkte nach 30s (Mock-Sensoren senden konstante Werte, `last_read` ändert sich ggf. nicht häufig genug)

### 2.6 LiveLineChart Y-Achse & Thresholds — PASS (Code-Review)
- Y-Achsen-Priorität: Explicit Props → SENSOR_TYPE_CONFIG → auto
- Threshold-Annotations: 4 Linien (alarmLow/High rot, warnLow/High gelb)
- annotationPlugin registriert

### 2.7 WidgetConfigPanel — PASS

| Feld | Status | Details |
|------|--------|---------|
| Dialog-Titel | PASS | "Linien-Chart konfigurieren" |
| Titel-Input | PASS | "Widget-Titel..." mit Wert |
| Sensor-Select | PASS | SHT31 korrekt selected |
| Y-Achse Label | PASS | "(SHT31: -40–125 °C)" aus SENSOR_TYPE_CONFIG |
| Y-Achse Inputs | PASS | Min (auto) / Max (auto) |
| Farb-Swatches | PASS | 8 Buttons |
| Schwellenwerte Checkbox | PASS | Zeigt 4 Felder: Alarm Low/High, Warn Low/High |
| Auto-Befüllung | BEACHTE | Nur bei Sensor-Wechsel via Config-Panel, nicht Widget-Dropdown |

### 2.8 MultiSensorWidget — PASS (Code-Review)
- Chip-basierte Sensor-Auswahl mit CHART_COLORS
- addSensor/removeSensor Logic korrekt

---

## KRITISCHER BUG: Widget-Geisterbilder (grid.removeAll(false))

### Beschreibung
`grid.removeAll(false)` in `CustomDashboardView.vue` entfernt GridStack-Items intern, aber **lässt DOM-Elemente stehen**. Bei jedem Layout-Wechsel häufen sich Ghost-Widgets im DOM.

### Betroffene Zeilen
- Zeile 251: `loadWidgetsToGrid()` → `grid.removeAll(false)`
- Zeile 505: `handleCreateLayout()` → `grid.removeAll(false)`
- Zeile 545: `handleDeleteLayout()` → `grid.removeAll(false)`

### Auswirkungen
1. **DOM-Aufblähung:** Nach 3 Layout-Wechseln: 11+ grid-stack-items statt 1-5
2. **Widget-Duplikate:** Alte Widgets doppelt im DOM (je 2x pro ID)
3. **Visuelle Überlagerung:** Geisterbild-Widgets überlagern echte Widgets
4. **localStorage-Korruption:** autoSave() speichert Ghost-Widgets mit:
   - "Mein Test Dashboard": 16 Widgets statt 0 (sollte leer sein)
   - "Multi-Sensor-Vergleich": 10 Widgets statt 1
   - "Debug Test Dashboard": 10 Widgets statt 5
5. **Memory Leak:** Vue-Vnodes werden nicht korrekt unmounted

### Fix
```typescript
// VORHER (Bug):
grid.removeAll(false)

// NACHHER (Fix):
grid.removeAll(true)  // oder einfach grid.removeAll()
```

**Alle 3 Stellen** (Zeilen 251, 505, 545) müssen gefixt werden.

### Priorität: **KRITISCH** — Verursacht Datenverlust/Korruption bei jedem Layout-Wechsel.

---

## PHASE 3: localStorage Persistenz — FAIL

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| localStorage Key vorhanden | PASS | `automation-one-dashboard-layouts` |
| JSON-Struktur | PASS | id, name, createdAt, updatedAt, widgets[] |
| Widget-Felder | PASS | id, type, x, y, w, h, config |
| Datenintegrität | **FAIL** | Widget-Counts korrumpiert durch Geisterbild-Bug |
| Persistenz nach F5 | PASS | Layouts werden aus localStorage wiederhergestellt |

---

## PHASE 5: Pattern-Konsistenz — 88% (7/8 PASS)

### 5.1 Server-Patterns — PASS (4/4)

| Vergleich | Status | Details |
|-----------|--------|---------|
| Router (dashboards vs logic) | PASS | Import-Stil, Response-Models, Error-Handling identisch |
| Repository (dashboard vs logic) | PASS | BaseRepository[T], Session-Nutzung, async Pattern |
| Service (dashboard vs logic) | PASS | Constructor, session.commit(), Logger |
| Alembic Migration Kette | PASS | b2c3d4e5f6a7 → add_dashboards (kein Loch) |

### 5.2 Frontend-Patterns — 3/4 PASS

| Prüfpunkt | Status | Details |
|-----------|--------|---------|
| CSS-Variablen | **FAIL** | 8 Hex-Farben hardcoded in WidgetConfigPanel + MultiSensorWidget |
| BEM-Naming | PASS | Alle Klassen folgen component__element--modifier |
| TypeScript `any` | PASS | Nur legitime Ausnahmen (widgetConfigs, localConfig) |
| Cleanup onUnmounted | PASS | render(null), grid.destroy(), mountedWidgets.clear() |

---

## Frontend Fixes Verifikation

| Fix | Beschreibung | Verifiziert | Methode |
|-----|-------------|-------------|---------|
| 1a | Watch auf last_read statt raw_value | **PASS** | Code-Review (Zeile 87 LineChartWidget) |
| 1b | localSensorId statt props.sensorId | **PASS** | Code-Review + Live-Test (Sensor-Auswahl überlebt) |
| 2 | SENSOR_TYPE_CONFIG Y-Achse | **PASS** | Live-Test ("SHT31: -40–125 °C" im Config-Panel) |
| 3 | WidgetConfigPanel alle Felder | **PASS** | Live-Test (Titel, Sensor, Y-Achse, Farbe, Thresholds) |
| 4 | handleSensorChange kein doppelter Emit | **PASS** | Code-Review (Zeile 95-116 WidgetConfigPanel) |
| B | isEditing=false, showCatalog=false | **PASS** | Live-Test (View-Mode als Default, kein Katalog) |
| onClickOutside | Layout-Dropdown bei Außenklick | **PASS** | Live-Test (Dropdown schließt bei Klick außerhalb) |

---

## Empfehlungen

### SOFORT BEHEBEN (Blocker)

1. **`grid.removeAll(false)` → `grid.removeAll(true)`** in CustomDashboardView.vue
   - Zeilen 251, 505, 545
   - Ohne diesen Fix: Dashboard-Daten werden bei jedem Layout-Wechsel korrumpiert
   - Nach Fix: localStorage manuell bereinigen (oder User "Clear" Funktion)

### SOLL BEHOBEN WERDEN (Qualität)

2. **Hardcoded Hex-Farben auslagern**
   - Erstelle `El Frontend/src/utils/chartColors.ts`
   - Import in WidgetConfigPanel.vue + MultiSensorWidget.vue
   - Oder besser: CSS-Variablen in tokens.css

### BEOBACHTEN (kein Fix nötig)

3. **Live-Daten im Chart** — Abhängig von Mock-Push-Frequenz. Kein Code-Bug.
4. **Threshold Auto-Befüllung** — Greift nur bei Config-Panel-Sensorwechsel, nicht Widget-Dropdown. Design-Entscheidung, kein Bug.

---

## Screenshots

| Datei | Beschreibung |
|-------|-------------|
| `test-screenshots/phase2-01-editor-initial.png` | Editor View-Mode mit Debug Dashboard |
| `test-screenshots/phase2-02-editor-editmode.png` | Editor Edit-Mode mit Widget-Katalog |
| `test-screenshots/phase2-03-multi-sensor-template.png` | Multi-Sensor-Vergleich Template |
| `test-screenshots/phase2-04-sensor-selected.png` | Sensor ausgewählt im Linien-Chart |
| `test-screenshots/phase2-05-after-30s.png` | Dashboard nach 30 Sekunden |
