# System-Datenbanken JSON-Download — Analyse-Report

**AUT-382** | Datum: 2026-05-12 | Analyst: auto-debugger  
**Kategorie:** tracing-gap  
**Screenshot:** `screenshot-system-db-download.png`

---

## Übersicht: IST-Stand

Der System-DB-Download befindet sich im System-Monitor unter dem Tab "Datenbank" (`/system-monitor`).  
Es gibt **keinen dedizierten Bulk-Export-Endpoint** — der JSON-Download exportiert immer nur die **aktuelle Seite** (max 500 Einträge) aus dem Paginierungs-View.

---

## Analyse-Scope 2: Frontend

### 1. Vue-Komponente für Datenbanken-Ansicht

**Datei:** `El Frontend/src/components/system-monitor/DatabaseTab.vue`  
Eingebunden in `SystemMonitorView.vue` (oder gleichwertiger View).

Der JSON-Download-Button befindet sich im Tabellen-Header-Bereich:  
`DatabaseTab.vue:302–310` (Button mit Download-Icon und Text "JSON"):

```html
<button @click="exportToJson" :disabled="!store.currentData?.data?.length">
  <Download :size="14" />
  JSON
</button>
```

Im Screenshot sichtbar als Icon-Button mit "JSON"-Label oben rechts neben "Aktualisieren".

### 2. Tabellen im Frontend aufgelistet und downloadbar

Tabellen kommen dynamisch vom Backend via `GET /api/v1/debug/db/tables`.  
**19 Tabellen** werden aktuell angezeigt (laut Playwright-Snapshot):

```
Aktorkonfigurationen (4) | actuator_history (18.338) | actuator_states (14)
ai_predictions (0) | Ereignisprotokoll (23.398) | cross_esp_logic (6)
ESP32-Geräte (130) | esp_ownership (0) | kaiser_registry (1)
library_metadata (0) | logic_execution_history (4.071) | Sensorkonfigurationen (14)
sensor_data (213.860) | sensor_type_defaults (14) | subzone_configs (2)
system_config (6) | token_blacklist (261) | user_accounts (2)
```

Alle angezeigten Tabellen haben einen aktiven JSON-Download-Button.

**4 Tabellen mit konfigurierten deutschen Labels** (`databaseColumnTranslator.ts:780–785`):
- `esp_devices` → "ESP32-Geräte"
- `sensor_configs` → "Sensorkonfigurationen"
- `actuator_configs` → "Aktorkonfigurationen"
- `audit_logs` → "Ereignisprotokoll"

Server-seitige Whitelist: **22 Tabellen** (`src/schemas/debug_db.py:133–152`).

### 3. Download-API-Call-Struktur

**KEIN eigener Download-Endpoint.** Der JSON-Download exportiert die aktuelle Seite aus dem Store:

Export-Funktion `DatabaseTab.vue:218–238`:

```typescript
function exportToJson(): void {
  if (!store.currentTable || !store.currentData?.data) return

  const exportData = store.currentData.data.map(row => {
    const translatedRow: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      const label = getColumnLabel(store.currentTable!, key)
      translatedRow[label] = formatCellValue(store.currentTable!, key, value)
    }
    return translatedRow
  })

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.currentTable}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

**Wichtig:** Exportiert **nur die aktuelle Seite**, nicht alle Einträge. Bei `sensor_data` (213.860 Einträge) und Standard `page_size=50` → max 50 Einträge pro Download.  
Spalten werden mit deutschen Labels aus `databaseColumnTranslator.ts` übersetzt.

**API-Call für Daten-Laden:** `El Frontend/src/api/database.ts:87–113`

```typescript
GET /api/v1/debug/db/{tableName}
  ?page={n}&page_size={n}&sort_by={col}&sort_order={asc|desc}&filters={json}
```

### 4. Zeitraum- oder Spalten-Auswahl-Elemente im Frontend

**Zeitraum-Auswahl:** **FEHLT KOMPLETT** — kein Datepicker, kein `date_from`/`date_to`-Input in DatabaseTab.  

**Spalten-Auswahl:** **FEHLT KOMPLETT** als interaktives Element.  
Es gibt nur statische `defaultVisible`-Flags per Spalte in `databaseColumnTranslator.ts`, aber kein UI-Element zur Laufzeit-Auswahl.

**Filter-Panel vorhanden** (`DatabaseTab.vue:322–330`): Generisches Key-Value-Filterfeld (`{column}: {value}`), aber keine zeitraum-spezifischen Eingaben.  
Der Server unterstützt `{"timestamp__gte": "..."}` via `filters`-Parameter, aber das Frontend bietet dafür **keine dedizierte UI**.

---

## Analyse-Scope 2: Server

### 5. Endpoint für Tabellen-Liste

**`El Servador/god_kaiser_server/src/api/v1/debug.py:1997–2089`**

```
GET /api/v1/debug/db/tables
Auth: AdminUser (Zeile 2004)
Response: TableListResponse
```

```python
async def list_database_tables(
    current_user: AdminUser, db: AsyncSession = Depends(_get_db_session)
) -> TableListResponse:
```

Gibt alle erlaubten Tabellen aus der `ALLOWED_TABLES`-Whitelist zurück (22 Tabellen, `debug_db.py:133–152`).

### 6. Endpoint für JSON-Export pro Tabelle

**`El Servador/god_kaiser_server/src/api/v1/debug.py:2167–2337`**

```
GET /api/v1/debug/db/{table_name}
Auth: AdminUser (Zeile 2174)
Response: TableDataResponse (paginiert, kein Streaming)
```

**Kein dedizierter `/db/{table}/download`-Endpoint.** Der Standard-Query-Endpoint gibt JSON zurück, das Frontend speichert es client-seitig.

### 7. Query-Parameter des Download-Endpoints

`debug.py:2173–2182`:

```python
async def query_table(
    table_name: str,
    current_user: AdminUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=500),
    sort_by: Optional[str] = None,
    sort_order: SortOrder = Query(default=SortOrder.DESC),
    filters: Optional[str] = None,     # JSON-encoded: {"col": "val", "col__gte": "val"}
    db: AsyncSession = Depends(_get_db_session),
) -> TableDataResponse:
```

| Parameter | Status |
|-----------|--------|
| `page` | ✅ vorhanden (Default 1) |
| `page_size` | ✅ vorhanden (Default 50, Max 500) |
| `sort_by` | ✅ vorhanden |
| `sort_order` | ✅ vorhanden (ASC/DESC) |
| `filters` | ✅ vorhanden (JSON, z.B. `{"timestamp__gte": "..."}`) |
| `date_from`/`date_to` explizit | ❌ FEHLT als benannte Parameter |
| `fields`/`columns` | ❌ FEHLT KOMPLETT |

### 8. DB-Abfrage-Aufbau

**Raw SQL** (kein ORM-Repository-Layer) direkt im Route-Handler: `debug.py:2220–2311`

```python
base_query = f"SELECT * FROM {table_name}"
# WHERE clauses als String-Konkatenation mit parametrisierten Werten
result = await db.execute(text(base_query), params)
rows = result.mappings().all()
```

**Verstößt gegen api-rules.md** — kein Repository-Layer, Abfrage direkt im Handler.  
Table-Whitelist `ALLOWED_TABLES` verhindert SQL-Injection durch Table-Name.

**Default 24h-Filter** für Zeitreihen-Tabellen: `debug.py:2229–2241`  
Automatisch für: `sensor_data`, `actuator_history`, `logic_execution_history`, `audit_logs`.

### 9. date_from / date_to / Spaltenfilter

| Feature | Status | Detail |
|---------|--------|--------|
| `date_from`/`date_to` als benannte Parameter | ❌ FEHLT | Keine expliziten Query-Parameter |
| Timestamp-Filter via `filters` JSON | ✅ vorhanden | `{"timestamp__gte": "2026-01-01"}` möglich (`debug.py:2257–2259`) |
| Auto-Default 24h für Zeitreihen | ✅ vorhanden | `sensor_data`, `actuator_history`, `logic_execution_history`, `audit_logs` |
| Spaltenfilter (`fields`/`columns`) | ❌ FEHLT KOMPLETT | Immer `SELECT *` |

### 10. JSON-Serialisierungs-Logik

Custom `_serialize_value()` Funktion: `debug.py:1950–1963`

```python
def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    elif hasattr(value, "__str__") and not isinstance(value, (str, int, float, bool, list, dict)):
        return str(value)   # UUID, Enums etc.
    elif isinstance(value, dict):
        return {k: _serialize_value(v) for k, v in value.items()}
    elif isinstance(value, list):
        return [_serialize_value(v) for v in value]
    return value
```

Angewendet in `debug.py:2316–2319`:
```python
for row in rows:
    record = {k: _serialize_value(v) for k, v in dict(row).items()}
    record = _mask_sensitive_fields(table_name, record)
    data.append(record)
```

**Kein StreamingResponse**, kein `jsonable_encoder` — plain Python-Dict, von FastAPI als JSON gerendert.  
Sensitive Felder werden vor Ausgabe maskiert (`_mask_sensitive_fields`).

### 11. Auth-Schutz

**`AdminUser`** auf allen DB-Explorer-Endpoints:

- `GET /debug/db/tables` — `debug.py:2004`
- `GET /debug/db/{table_name}` — `debug.py:2174`

Definition `AdminUser` in `src/api/deps.py`. Kein API-Key-Zugang, nur JWT-AdminUser.

---

## Gemeinsame Analyse (System-DB-Seite)

### 12. Zeitraum-Mechanismus

Der `filters`-Parameter (`{"timestamp__gte": "..."}`) ist der einzige Weg für Zeitraum-Filterung — aber:
- Kein Frontend-UI dafür
- Kein explizites `date_from`/`date_to` im Endpoint
- Nur für Tabellen mit `timestamp`-Spalte nutzbar (nicht für `esp_devices`, `sensor_configs` etc.)

**Bestehende Konvention** in anderen Endpoints: `start_time`/`end_time` (aus `sensors.py`). Übertragbar.

### 13. fields/columns-Parameter

**FEHLT KOMPLETT** im gesamten Server für alle Export-/Query-Endpoints.

### 14. Export-Format-Infrastruktur (System-DB-Seite)

| Infrastruktur | Status | Detail |
|---------------|--------|--------|
| Custom JSON-Serializer | ✅ vorhanden | `_serialize_value()` in `debug.py:1950` |
| Sensitive-Field-Masking | ✅ vorhanden | `_mask_sensitive_fields()` |
| `StreamingResponse` | ❌ FEHLT | Nur für AI (`ai.py:107`) |
| Bulk-Export-Endpoint | ❌ FEHLT | Nur paginierte Ansicht, max 500/Seite |
| Spaltenfilter | ❌ FEHLT | Immer `SELECT *` |

### 15. Vollständige Schichtkette

```
Frontend JSON-Button (DatabaseTab.vue:302)
  → exportToJson() — client-seitig, kein API-Call
  → store.currentData.data (bereits im Memory, aktuelle Seite)
  → Spalten mit deutschen Labels aus databaseColumnTranslator.ts übersetzen
  → Blob + URL.createObjectURL → Browser-Download
```

```
Datenladen (separat, für aktuelle Seite):
DatabaseTab.vue → databaseStore.fetchTableData()
  → GET /api/v1/debug/db/{table_name}?page=1&page_size=50
  → Route Handler query_table() (debug.py:2167)
  → Raw SQL: SELECT * FROM {table_name} WHERE ... LIMIT {page_size} OFFSET {(page-1)*page_size}
  → _serialize_value() + _mask_sensitive_fields()
  → TableDataResponse JSON (paginiert)
  → store.currentData gesetzt
```

### 16. Authentifizierung

`GET /debug/db/tables` + `GET /debug/db/{table_name}` → **`AdminUser`** (JWT).  
Sub-Issue S2 braucht **keine** Auth-Änderung, da bereits korrekte Tier.

---

## OQ-Antworten (Offene Fragen)

| OQ | Frage | Antwort |
|----|-------|---------|
| **OQ-2** | System-DB-JSON-Export hinter AdminUser-Auth? | **JA** — `AdminUser` auf allen DB-Explorer-Endpoints (`debug.py:2004`, `debug.py:2174`). Sub-Issue braucht keine Auth-Änderung. |
| **OQ-4** | Welche Tabellen tatsächlich enthalten? | **22 Tabellen** (Server-Whitelist in `debug_db.py`), 19 davon im Frontend sichtbar. Nicht alle 41 DB-Tabellen — explizit gefilterte Auswahl. Vollständige Liste in `ALLOWED_TABLES`. |
| **OQ-5** | `StreamingResponse`-Infrastruktur vorhanden? | **NEIN** für Daten-Export. Nur für AI-Chat-Streaming. Neu aufbauen erforderlich für Bulk-Exports großer Tabellen (z.B. `sensor_data` mit 213.860 Einträgen). |

---

## Gap-Analyse

### Was bereits implementiert ist (kein Aufwand)

- ✅ **Tabellen-Liste**: `GET /debug/db/tables` liefert alle 22 erlaubten Tabellen
- ✅ **Paginierter JSON-Query**: `GET /debug/db/{table_name}` mit `page`, `page_size`, `sort_by`, `sort_order`, `filters`
- ✅ **Filter-Mechanismus**: JSON-encoded `filters` mit `__gte`/`__lte`/`__like`-Operatoren
- ✅ **Auto-Default 24h** für Zeitreihen-Tabellen
- ✅ **Auth-Schutz**: AdminUser auf allen Endpoints
- ✅ **Custom Serializer**: `_serialize_value()` + `_mask_sensitive_fields()`
- ✅ **Frontend-Tabellen-View**: DatabaseTab mit Sortierung, Paginierung, Filter-Panel
- ✅ **Client-seitiger JSON-Export**: funktioniert für aktuelle Seite

### Was fehlt komplett (Neubau)

- ❌ **Bulk-Export-Endpoint** — Endpoint der alle Einträge (nicht paginiert) zurückgibt oder streamt
- ❌ **`date_from`/`date_to`-UI** im Frontend (Datepicker für zeitstempel-tragende Tabellen)
- ❌ **Spalten-Auswahl-UI** im Frontend
- ❌ **`fields`/`columns`-Parameter** im Server-Endpoint
- ❌ **`StreamingResponse`** für große Tabellen (z.B. `sensor_data` mit 213k Einträgen)
- ❌ **Export aller Seiten** — aktuell nur aktuelle Seite (max 500 Einträge)

### Was vorhanden aber unvollständig ist (Erweiterung)

- ⚠️ **`filters`-Parameter** unterstützt `timestamp__gte`/`timestamp__lte`, aber Frontend bietet dafür keine dedizierte Zeitraum-UI
- ⚠️ **`page_size`** max 500 — für vollständige Tabellen zu klein (sensor_data: 213k Einträge)
- ⚠️ **Kein Repository-Layer** für DB-Explorer — Query direkt im Handler (`debug.py`), widerspricht Architekturregeln
- ⚠️ **`databaseColumnTranslator`** — 4 Tabellen mit deutschen Labels konfiguriert, 18 Tabellen ohne Spalten-Label-Mapping (raw column names)
- ⚠️ **Spalten-Sichtbarkeit** — `defaultVisible`-Flag existiert statisch, aber kein UI-Toggle zur Laufzeit
