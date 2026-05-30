# Auftrag: System-Datenbanken — JSON-Download vollständig analysieren, screenshotten und dokumentieren

**Datum:** 2026-05-15  
**Schicht:** El Frontend (Vue 3) + El Servador (FastAPI)  
**Typ:** Analyse + Dokumentation (kein Implementierungsauftrag)  
**Priorität:** Mittel

---

## Ziel

Den aktuellen Stand des JSON-Downloads im System-Monitor → Tab "Datenbank" vollständig dokumentieren: alle verfügbaren Tabellen, alle Download-Optionen, alle Konfigurationsmöglichkeiten, alle Grenzen. Der Agent geht dafür selbst per Browser auf das laufende Frontend, macht Screenshots aller relevanten Dialoge und Zustände und erstellt einen vollständigen Analysebericht.

---

## Ausgabe-Ordner

Alle Artefakte (Screenshots + Bericht) kommen in:

```
Auto-one/.claude/reports/current/download-analyse/system-db/
```

Dateien:
- `ANALYSE-system-db-download-<YYYY-MM-DD>.md` — vollständiger Analysebericht
- `screenshot-01-system-monitor-uebersicht.png` — System-Monitor-Startansicht
- `screenshot-02-datenbank-tab.png` — Tab "Datenbank" vollständig geöffnet
- `screenshot-03-tabellen-liste.png` — vollständige Liste aller angezeigten Tabellen mit Zeilenanzahl
- `screenshot-04-sensor-data-ansicht.png` — Tabelle `sensor_data` geöffnet (große Tabelle)
- `screenshot-05-json-button-aktiv.png` — JSON-Download-Button aktiv, direkt vor dem Klick
- `screenshot-06-filter-panel.png` — Filter-Panel geöffnet (falls vorhanden)
- `screenshot-07-audit-logs-ansicht.png` — Tabelle `audit_logs` / Ereignisprotokoll geöffnet
- `screenshot-08-pagination.png` — Paginierungs-UI sichtbar

Wenn das Frontend zusätzliche Optionen, Zeitraum-Picker, Spalten-Auswahl oder Export-Dialoge zeigt, die hier nicht aufgelistet sind, ebenfalls screenshotten und im Bericht dokumentieren.

---

## Bekannter Stand (Vorwissen aus Analyse vom 2026-05-12)

Das folgende Vorwissen wurde durch Code-Analyse gewonnen. Es kann seit 2026-05-12 bereits verändert worden sein — der Agent soll alle Punkte am laufenden Frontend verifizieren und bei Abweichungen im Bericht vermerken.

### Wo sich der Download befindet

Pfad im Frontend: System-Monitor → Tab "Datenbank" (`/system-monitor`)  
Komponente: `El Frontend/src/components/system-monitor/DatabaseTab.vue`

### JSON-Download-Button

`DatabaseTab.vue`, Zeilen 302–310 (Stand 2026-05-12):

```html
<button @click="exportToJson" :disabled="!store.currentData?.data?.length">
  <Download :size="14" />
  JSON
</button>
```

Im Frontend sichtbar als Icon-Button mit "JSON"-Label oben rechts neben "Aktualisieren".  
Deaktiviert wenn die aktuelle Tabelle keine Daten hat.

### Export-Funktion: client-seitig, nur aktuelle Seite

Die Funktion `exportToJson()` ist eine lokale Funktion in `DatabaseTab.vue` (Zeilen 218–238). Sie macht **keinen eigenen API-Call** — sie exportiert `store.currentData.data` (bereits im Memory, aktuelle Seite):

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

**Wichtig:** Exportiert **nur die aktuelle Seite** — bei `sensor_data` (213.860 Einträge) und Standard `page_size=50` sind das max 50 Einträge. Selbst mit `page_size=500` (Maximum) werden max 500 Einträge exportiert.

Spalten werden mit deutschen Labels aus `databaseColumnTranslator.ts` übersetzt (4 Tabellen haben konfigurierte Labels, 18 Tabellen haben raw column names).

### Tabellen im Frontend (Stand 2026-05-12)

19 Tabellen waren sichtbar. Die Einträge kommen dynamisch vom Endpoint `GET /api/v1/debug/db/tables`. Stand bei der letzten Analyse:

| Angezeigter Name | Interne Tabelle | Einträge (ca.) |
|-----------------|-----------------|----------------|
| Aktorkonfigurationen | actuator_configs | 4 |
| actuator_history | actuator_history | 18.338 |
| actuator_states | actuator_states | 14 |
| ai_predictions | ai_predictions | 0 |
| Ereignisprotokoll | audit_logs | 23.398 |
| cross_esp_logic | cross_esp_logic | 6 |
| ESP32-Geräte | esp_devices | 130 |
| esp_ownership | esp_ownership | 0 |
| kaiser_registry | kaiser_registry | 1 |
| library_metadata | library_metadata | 0 |
| logic_execution_history | logic_execution_history | 4.071 |
| Sensorkonfigurationen | sensor_configs | 14 |
| sensor_data | sensor_data | 213.860 |
| sensor_type_defaults | sensor_type_defaults | 14 |
| subzone_configs | subzone_configs | 2 |
| system_config | system_config | 6 |
| token_blacklist | token_blacklist | 261 |
| user_accounts | user_accounts | 2 |

Einträge wachsen mit der Zeit — bei `sensor_data` und `audit_logs` deutlich.

Die Server-Whitelist enthält **22 Tabellen** (`El Servador/god_kaiser_server/src/schemas/debug_db.py`, Zeilen 133–152). 3 Tabellen waren im Frontend nicht sichtbar.

### Server-Endpoint für Tabellen-Abfrage

`El Servador/god_kaiser_server/src/api/v1/debug.py`, Zeilen 2167–2337:

```
GET /api/v1/debug/db/{table_name}
Auth: AdminUser (JWT)
Response: TableDataResponse (paginiert, kein Streaming)
```

Alle Query-Parameter:

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

| Parameter | Vorhanden | Detail |
|-----------|-----------|--------|
| `page` | ✅ | Default 1 |
| `page_size` | ✅ | Default 50, Max 500 |
| `sort_by` | ✅ | Spaltenname |
| `sort_order` | ✅ | ASC/DESC |
| `filters` | ✅ | JSON, z.B. `{"timestamp__gte": "2026-01-01T00:00:00"}` |
| `date_from` / `date_to` explizit | ❌ | Nicht als benannte Parameter — nur via `filters` |
| `fields` / `columns` | ❌ | Fehlt komplett — immer `SELECT *` |

Der `filters`-Parameter unterstützt `__gte`, `__lte`, `__like`-Operatoren (debug.py, Zeilen 2257–2259) — aber das Frontend bietet **kein dediziertes UI** dafür (nur ein generisches Key-Value-Filterfeld).

**Auto-Default 24h** für Zeitreihen-Tabellen (debug.py, Zeilen 2229–2241): Automatisch für `sensor_data`, `actuator_history`, `logic_execution_history`, `audit_logs` — ohne expliziten Zeitraum wird immer die letzte 24h angezeigt.

### Internes Implementierungsdetail: Raw SQL im Handler

Der Query-Handler in `debug.py` nutzt Raw SQL ohne Repository-Layer (Zeilen 2220–2311):

```python
base_query = f"SELECT * FROM {table_name}"
# WHERE clauses als String-Konkatenation mit parametrisierten Werten
result = await db.execute(text(base_query), params)
rows = result.mappings().all()
```

Table-Whitelist verhindert SQL-Injection durch Tabellennamen. Sensitive Felder werden via `_mask_sensitive_fields()` vor Ausgabe maskiert.

Custom-Serializer `_serialize_value()` (debug.py, Zeilen 1950–1963) wandelt `datetime`, UUIDs, Enums etc. in Strings um.

### Zeitraum-Filter: nur via generisches Filter-Panel

Im DatabaseTab gibt es ein Filter-Panel (`DatabaseTab.vue:322–330`): ein generisches Key-Value-Eingabefeld (`{column}: {value}`). Damit ist technisch `{"timestamp__gte": "2026-01-01T00:00:00"}` möglich — aber es gibt **keinen dedizierten Datepicker** oder eine explizite Zeitraum-Auswahl im UI.

**Spalten-Auswahl:** Fehlt als interaktives Element. Es gibt statische `defaultVisible`-Flags per Spalte in `databaseColumnTranslator.ts`, aber kein UI-Toggle zur Laufzeit.

### Auth-Schutz

Alle DB-Explorer-Endpoints erfordern **AdminUser** (JWT-Auth):
- `GET /debug/db/tables` — debug.py, Zeile 2004
- `GET /debug/db/{table_name}` — debug.py, Zeile 2174

### Bekannte Gaps (Stand 2026-05-12)

| Gap | Beschreibung |
|-----|-------------|
| Nur aktuelle Seite exportierbar | `exportToJson()` exportiert immer nur die aktuelle Seite, max 500 Einträge |
| Kein Bulk-Export | Kein Endpoint der alle Einträge streamt (sensor_data hat 213k+ Einträge) |
| Kein Zeitraum-UI | Kein Datepicker für Zeitreihen-Tabellen — nur generisches Filter-Panel |
| Keine Spalten-Auswahl | Kein UI-Toggle für Spalten-Sichtbarkeit zur Laufzeit |
| Kein `date_from`/`date_to` als explizite Parameter | Nur via `filters`-JSON möglich |
| Raw SQL im Handler | Query direkt in debug.py, kein Repository-Layer |
| 18 Tabellen ohne Label-Mapping | Nur 4 Tabellen haben deutsche Spalten-Labels, 18 zeigen raw column names |

---

## Aufgaben für den Agent

### 1. Ordner anlegen

```
Auto-one/.claude/reports/current/download-analyse/system-db/
```

### 2. Frontend im Browser aufrufen und navigieren

1. Frontend starten (falls nicht läuft), als AdminUser einloggen
2. Zu `/system-monitor` navigieren
3. Tab "Datenbank" öffnen
4. Screenshots nach der Liste im Abschnitt "Ausgabe-Ordner" machen

**Besonders dokumentieren:**
- Vollständige Tabellen-Liste mit allen angezeigten Namen und Einträge-Zahl
- Filter-Panel: alle verfügbaren Felder und Optionen
- JSON-Button: aktiv, deaktiviert, Dateiname beim Download
- Inhalt einer heruntergeladenen JSON-Datei (Struktur, Spalten, erste Einträge von `sensor_data` und `audit_logs`)
- Paginierungs-UI: Seiten-Navigation, page_size-Einstellung (falls vorhanden)
- Spalten-Sichtbarkeit: Gibt es einen UI-Toggle?
- Zeitraum-Picker: Gibt es einen Datepicker für Zeitreihen-Tabellen?
- Ob seit 2026-05-12 neue Buttons, Dialoge oder Optionen hinzugekommen sind

### 3. Vorwissen verifizieren

Für jeden Punkt im Abschnitt "Bekannter Stand" prüfen:
- Stimmt die Tabellen-Liste noch (19 Tabellen)? Neue dazugekommen?
- Ist der JSON-Button noch oben rechts neben "Aktualisieren"?
- Exportiert die Funktion noch nur die aktuelle Seite?
- Gibt es inzwischen einen Datepicker oder Zeitraum-UI?
- Gibt es inzwischen eine Spalten-Auswahl?
- Wie viele Einträge hat `sensor_data` jetzt?
- Hat sich `page_size` verändert (Maximum war 500)?

### 4. Analysebericht erstellen

Datei: `Auto-one/.claude/reports/current/download-analyse/system-db/ANALYSE-system-db-download-<YYYY-MM-DD>.md`

Struktur des Berichts:
```
# System-DB JSON-Download — Analyse <DATUM>

## Tab-Position + Navigation (verifiziert)
## Tabellen-Liste: alle angezeigten Tabellen mit Zeilenanzahl (verifiziert + Screenshots)
## JSON-Button: Position + Verhalten (verifiziert + Screenshots)
## Export-Funktion: Verhalten (verifiziert)
## Filter-Panel: alle Optionen (verifiziert + Screenshots)
## Zeitraum-UI: vorhanden? Welche Optionen? (verifiziert)
## Spalten-Auswahl: vorhanden? (verifiziert)
## Paginierung: Optionen + page_size-Maximum (verifiziert)
## JSON-Datei: Struktur + Beispielinhalt
## Neu entdeckte Optionen / Abweichungen vom Vorwissen
## Gap-Analyse: Was fehlt / was ist unvollständig
## Offene Fragen für Robin
```

---

## Was dieser Auftrag NICHT tut

- **Kein Code ändern** — reine Analyse und Dokumentation
- **Keine Implementierung** der identifizierten Gaps — das ist ein Folgeauftrag
- **Keine Bewertung**, welche Gaps zuerst angegangen werden sollen — das entscheidet Robin anhand des Berichts
- **Kein Zugriff auf Produktionsdaten** — Analyse am Development-System

---

## Akzeptanzkriterium

- Ordner `Auto-one/.claude/reports/current/download-analyse/system-db/` existiert
- Mindestens 8 Screenshots vorhanden (alle Zustände aus der Liste)
- Analysebericht existiert mit allen Sektionen ausgefüllt
- Vollständige Tabellen-Liste im Bericht mit aktuellen Einträge-Zahlen
- Jede Abweichung vom Vorwissen ist im Bericht vermerkt
- Bericht ist ohne Zugriff auf das Life-Repo vollständig verständlich
