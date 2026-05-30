# BELEG: Download-UI/UX Analyse — AUT-382

**Datum:** 2026-05-12
**Run-ID:** AUT-382
**Finding-ID:** download-analyse
**Analyst:** automation-experte
**Linear-Issue:** [AUT-382](https://linear.app/autoone/issue/AUT-382/si-n-download-uiux-analyse-monitor-l2-csv-system-db-json)
**Kategorie:** tracing-gap

---

## Ausgangssituation (Robin's Problemschilderung)

Es gibt zwei Download-Orte im Frontend die beide unfertig sind:

### Ort 1: Monitor Ebene 2 (L2) — CSV-Download
- IST: Nur CSV-Download möglich
- Fehlend: Kein Zeitraum-Filter (date_from / date_to)
- Fehlend: Keine Sensor-/Spalten-Auswahl
- SOLL: User wählt welche Sensordaten (ESP, GPIO, Sensortyp) und welchen Zeitraum. Nur relevante Betriebsdaten (Sensorwerte, Timestamps, Sensor-Metadaten) — keine Admin-DB-Dumps, aber konfigurierbar.

### Ort 2: Systemmonitor → Datenbanken — JSON-Download
- IST: Nur JSON-Download möglich
- Fehlend: Kein Zeitraum-Filter
- Fehlend: Keine Spaltenauswahl
- SOLL: Ganze Tabellen vollständig herunterladbar, aber mit Zeitraum-Filter und Spalten-Auswahl. Vollständige DB-Exports für Admin/Betrieb.

---

## Suchprotokoll (Search-vor-Create)

Folgende Suchen in Linear durchgeführt — keine relevanten Vorgänger-Issues gefunden:
- `download export csv` → 0 Treffer
- `monitor download sensor data` → 0 Treffer
- `system datenbank json export` → 0 Treffer
- `Zeitraum filter Daten` → 0 Treffer
- `download` (allgemein) → 3 Treffer (AUT-222, AUT-216, AUT-221 — alle MultispeQ, kein Bezug)

**Befund:** Keine duplizierten oder verwandten Issues vorhanden.

---

## Gelesene Hubs (Hub-First)

### C5 Frontend Operator-UX
- **Pfad:** `arbeitsbereiche/automation-one/architektur-autoone/frontend/hub-frontend-operator-ux.md`
- **Stand:** last_verified 2026-05-05
- **Relevante Erkenntnisse:**
  - Stack: Vue 3.5.13 + TypeScript + Pinia (23 Stores) + 148 Komponenten + 36 Composables
  - Monitor L1: MonitorView.vue — Zonen-Übersicht, nur Anzeige
  - Monitor L2: Device-Detail-Ebene (Konfiguration + Sensor-Live-Daten)
  - PB-04 CSV-Download als implementiert vermerkt (Phase 8.2 Tiefenanalyse) — unklar welche Komponente und welcher Endpoint
  - Chart.js (vue-chartjs) ist Chart-Bibliothek, kein ECharts
  - F11 Systembetrieb/Ops/Plugins ist der Frontend-Report für System-Tab

### C6 Observability / Logging / Monitoring
- **Pfad:** `wissen/iot-automation/hub-observability-logging-monitoring.md`
- **Stand:** last_verified 2026-04-26
- **Relevante Erkenntnisse:**
  - 58 Debug-Endpoints (22% aller 263 Endpoints) hinter AdminUser
  - audit_logs Tabelle existiert (Lücken bei ESP-Delete, Sensor-Config CRUD, Zone-Delete)
  - System-Tab ist Admin-Bereich

---

## Kontextwissen (eingebettet aus MEMORY.md)

- DB: `god_kaiser_db`, 34 Tabellen (31 aktiv)
- Auth-Tiers: kein Auth / ActiveUser-JWT / OperatorUser / AdminUser + API-Key
- Sensor-Daten-Endpoint bekannt: `GET /api/v1/sensors/{esp_id}/{gpio}/data`
- Stats-Endpoint: `GET /api/v1/sensors/{esp_id}/{gpio}/stats` — timeRange `'1h'|'6h'|'24h'|'7d'|'30d'|'custom'`
- `sensor_data` Tabelle: UNIQUE `uq_sensor_data_esp_gpio_type_timestamp`, FK sensor_configs SET NULL
- `sensor_configs`: esp_id, gpio, sensor_type, onewire_address, i2c_address
- 263 REST-Endpoints in 31 Router-Dateien
- REST-Prefix: `/api/v1/`

---

## Linear-Issue AUT-382 — Erstellt

**Titel:** `[SI-N] Download-UI/UX Analyse: Monitor-L2-CSV + System-DB-JSON`
**URL:** https://linear.app/autoone/issue/AUT-382/si-n-download-uiux-analyse-monitor-l2-csv-system-db-json
**Labels:** tracing-gap, auftragstyp:analyse, Cross-Layer, Frontend, Server
**Priorität:** High (2)
**Status:** Backlog

**Struktur des Auftrags:**
- Analyse-Scope 1: Monitor L2 CSV-Download (11 Frontend + Server Fragen + Screenshots)
- Analyse-Scope 2: System-Datenbanken JSON-Download (11 Frontend + Server Fragen + Screenshots)
- Gemeinsame Analyse (Fragen 12–16): Zeitraum-Mechanismus, Spalten-Auswahl, Export-Infrastruktur, Schichtkette, Auth
- TM-Entscheidungs-Block: 6 offene Fragen OQ-1 bis OQ-6
- Verify-Plan-Gate: Kein Code, keine Sub-Issues vor Report-Abnahme
- Output: 2 Bericht-MDs + Screenshots + Gap-Analyse

**Folge-Sub-Issues (nach Report-Abnahme):**
- S1: Monitor-L2-CSV Download-Verfeinerung (frontend-dev + server-dev)
- S2: System-Datenbanken JSON-Download-Verfeinerung (server-dev)

---

## Offene Fragen (TM-Entscheidungs-Block)

| OQ | Frage |
|----|-------|
| OQ-1 | Existiert der Monitor-L2-CSV-Endpoint bereits vollständig oder ist er ein Stub? |
| OQ-2 | Ist der System-DB-JSON-Export hinter AdminUser-Auth? |
| OQ-3 | Gibt es bereits eine `date_from`/`date_to`-Konvention in anderen Endpoints? |
| OQ-4 | Welche Tabellen sind im System-DB-Download tatsächlich enthalten? |
| OQ-5 | Gibt es StreamingResponse-Infrastruktur für große Exports? |
| OQ-6 | Ist der Download-Button im Monitor L2 direkt in MonitorView oder separater Komponente? |

---

## Folge-Issues — Erstellt 2026-05-12 (automation-experte)

Die Analyse-Ergebnisse wurden in 5 Linear-Issues überführt. Alle OQ-Fragen sind durch die Analyse beantwortet.

### OQ-Antworten (Zusammenfassung)

| OQ | Antwort (verifiziert) |
|----|----------------------|
| OQ-1 | FEHLT KOMPLETT — kein CSV-Endpoint, Export ist client-seitig (`MonitorView.vue:975`) |
| OQ-2 | JA — AdminUser auf `debug.py:2004`/`debug.py:2174`, keine Auth-Änderung nötig |
| OQ-3 | JA — als `start_time`/`end_time` in `sensors.py:1367–1368`, übertragbar |
| OQ-4 | 22 Tabellen (Server-Whitelist `debug_db.py:133–152`), 19 im Frontend sichtbar |
| OQ-5 | NEIN — kein StreamingResponse für Daten-Export, nur für AI-Streaming |
| OQ-6 | Direkt in `MonitorView.vue:2717` (SlideOver-Footer), NICHT L2 sondern L3-SlideOver |

### Issue-Struktur

| Issue | Titel | Schicht | Subagent | URL |
|-------|-------|---------|----------|-----|
| AUT-383 | Export-Wizard: Architektur + Implementierungsplan (Parent) | Cross-Layer | TM | https://linear.app/autoone/issue/AUT-383 |
| AUT-384 | S1: Export-API: Monitor Sensor-CSV-Endpoint | Server | server-dev | https://linear.app/autoone/issue/AUT-384 |
| AUT-385 | S2: Export-API: System DB-Table-Bulk-Export-Endpoint | Server | server-dev | https://linear.app/autoone/issue/AUT-385 |
| AUT-386 | S3: ExportWizard.vue Gemeinsame Wizard-Komponente | Frontend | frontend-dev | https://linear.app/autoone/issue/AUT-386 |
| AUT-387 | S4: Verify-Plan + QA Export-Wizard End-to-End | Cross-Layer | frontend-dev + db-inspector | https://linear.app/autoone/issue/AUT-387 |

### Begründung der Issue-Struktur

**Warum ein gemeinsamer Wizard (S3) statt zwei separate Sub-Issues:**
Die Analyse hat ein bereits existierendes aber ungenutztes Export-System aufgedeckt (`useExportCsv.ts` + `ExportCsvDialog.vue`). Ein dritter, separater Export-Pfad würde die Duplikat-Lage verschlechtern. Der gemeinsame `ExportWizard.vue` mit `mode`-Prop konsolidiert alle Export-Kontexte auf eine kanonische Stelle.

**Warum S1+S2 vor S3:**
S3 (Wizard) ruft S1/S2-Endpoints auf. Ohne implementierte Endpoints kann der Wizard nicht getestet werden. Abhängigkeit ist zwingend.

**Warum S4 als eigener Issue (nicht in S3 integriert):**
QA erfordert db-inspector (DB-Schema-Vergleich) und frontend-dev gleichzeitig. Separate Zuweisung ermöglicht parallele Prüfung durch verschiedene Subagents.

**Warum AUT-383 als Parent mit Verify-Plan-Gate:**
TM muss 5 Architektur-Entscheidungen (D-1 bis D-5) treffen bevor Code entsteht — insbesondere D-2 (Konsolidierung auf `useExportCsv.ts`) und D-3/D-4 (Endpoint-URLs) beeinflussen alle Sub-Issues. Ohne diesen Gate-Block könnten S1-S4 inkonsistent implementiert werden.

---

*Erstellt: 2026-05-12 | automation-experte | Life-Repo: c:\Users\robin\Documents\life*
*Aktualisiert: 2026-05-12 — Folge-Issues AUT-383 bis AUT-387 eingetragen*
*Nachgeschaerft: 2026-05-12 — Analyse-Erkenntnisse vollstaendig eingearbeitet (siehe unten)*

---

## Nachschaerfung: Issues AUT-383 bis AUT-387 (2026-05-12)

### Kritische Konsolidierungs-Entscheidung

**Kanonische Stelle:** `El Frontend/src/components/dashboard-widgets/ExportCsvDialog.vue`
**Promotion-Ziel:** `El Frontend/src/components/export/ExportDialog.vue`

`ExportCsvDialog.vue` + `useExportCsv.ts` existieren bereits und werden in
`HistoricalChartWidget.vue:100` + `MultiSensorWidget.vue:60` genutzt.
Neue Komponente = Promotion (verschieben + mode-Prop), KEINE Neuerfindung.

### Gap-Liste (Server, 5 Gaps)

| GAP | Beschreibung | Adressiert in |
|---|---|---|
| GAP-S1 | Kein CSV-Streaming-Endpoint Sensordaten (> 1000 Datenpunkte) | AUT-384 (S1) |
| GAP-S2 | Kein Bulk-Export-Endpoint DB-Tabellen | AUT-385 (S2) |
| GAP-S3 | Kein `fields[]`-Parameter in `GET /sensors/data` | AUT-384 (neuer Endpoint) |
| GAP-S4 | Kein StreamingResponse (aktuell in-memory JSON) | AUT-384 + AUT-385 |
| GAP-S5 | `resolution` fehlt in `fetchDetailData()` (`MonitorView.vue`) | AUT-386 (useExportCsv einbinden) |

### Gap-Liste (Frontend, 4 Gaps)

| GAP | Beschreibung | Adressiert in |
|---|---|---|
| GAP-F1 | `ExportCsvDialog.vue` ungenutzt in MonitorView (paralleles System) | AUT-386 (Promotion) |
| GAP-F2 | Kein Column-Picker im Monitor L3 SlideOver | AUT-386 (Stepper Schritt 2) |
| GAP-F3 | `exportDetailCsv()` + `exportToJson()` als Dead-Code nach S3 | AUT-386 (entfernen) |
| GAP-F4 | DatabaseTab hat kein date_from/date_to UI | AUT-386 (Stepper Schritt 1, mode='table') |

### Korrekturen pro Issue

**AUT-383 (Body-Update):**
- Konsolidierungs-Abschnitt ergaenzt (kanonische Stelle ExportCsvDialog.vue)
- D-2 mit Empfehlung (Promoten + Re-Export)
- D-3 Empfehlung: `GET /api/v1/sensors/export` (ohne /csv-Suffix)
- D-5 Empfehlung: `mode: 'sensor' | 'table'` statt `'production' | 'admin'`
- Komponentenname: `ExportDialog.vue` (promoted) statt `ExportWizard.vue` (neu)

**AUT-384 (Comment hinzugefuegt):**
- URL-Korrektur: `/sensors/export` statt `/sensors/export/csv` (TM entscheidet via D-3)
- Handler-Einfuegepunkt: nach `query_sensor_data()` in `sensors.py` explizit
- Batch-Groesse 500 explizit als Vorgabe
- `resolution`-Luecke in `fetchDetailData()` dokumentiert

**AUT-385 (Comment hinzugefuegt):**
- Handler-Einfuegepunkt: nach `query_table()` bei `debug.py:2167` explizit
- Streaming-Strategie: OFFSET-basiertes Batching 500/Batch (kein Cursor, Raw SQL)
- SQL-Injection-Schutz fuer `columns`-Parameter explizit gefordert
- NDJSON als bevorzugtes JSON-Streaming-Format

**AUT-386 (Comment hinzugefuegt -- KRITISCHE KORREKTUR):**
- Konsolidierungs-Pflicht: Promotion statt Neuerfindung
- Prop-Interface: `mode: 'sensor' | 'table'` (nicht `'production' | 'admin'`)
- Rueckwaertskompatibilitaet via Re-Export oder Import-Anpassung
- Einbindungspunkte Datei:Zeile vollstaendig

**AUT-387 (Comment hinzugefuegt):**
- A4: SQL-Injection-Safety columns-Parameter (Whitelist-Check vor SQL)
- A5: Index-Check sensor_data.timestamp, actuator_history.timestamp (EXPLAIN ANALYZE)
- A6: Performance-Test 213k Eintraege (Streaming-Start < 5s, kein OOM)
- B0: Konsolidierungs-Check (Promotion via git history verifizieren)
- B5: TypeScript mode: 'sensor' | 'table' und ExportParams-Interface
- C: Volumen-Ziele: > 1000 Zeilen beweist Streaming ueber Hard-Cap
