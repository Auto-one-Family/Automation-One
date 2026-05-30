# Monitor L3 CSV-Download — Analyse 2026-05-15

**Testumgebung:** Docker-Stack lokal (`el-frontend` Port 5173, `el-servador` Port 8000), eingeloggter User `admin`.  
**Nachweisführung:** Playwright-MCP (Browser-Automatisierung; kein Produktcode geändert).  
**Screenshots:** Relativ zu diesem Ordner `./` (gleiche Verzeichnisebene wie diese Datei).

| Datei | Inhalt |
|-------|--------|
| `screenshot-01-monitor-l1-zone-uebersicht.png` | Monitor L1, Zonenübersicht (`/monitor`) |
| `screenshot-02-monitor-l2-device-ebene.png` | L2 Gewächshaus, Sensor-Karte **expandiert**, Button **„Zeitreihe anzeigen“** sichtbar |
| `screenshot-03-monitor-l3-slideover-offen.png` | L3-SlideOver (Sensor-Detail) vollständig |
| `screenshot-04-monitor-l3-timerangeselector.png` | Ausschnitt Viewport mit **allen** Zeit-Presets der `TimeRangeSelector`-Leiste |
| `screenshot-05-monitor-l3-csv-button.png` | Footer-Bereich mit **„Export“** (Scroll zur Fußzeile des SlideOvers; Dateiname aus historischem Auftrag weiter „csv-button“ genannt) |
| `screenshot-06-monitor-l3-custom-range.png` | „Benutzerdefiniert“, Felder Von/Bis befüllt (vor **`Anwenden`** abgebildeter Zustand) |
| `screenshot-07-monitor-l3-nach-download.png` | L3 wieder geöffnet nach erfolgreichem Export-Durchlauf (Export-Wizard geschlossen) |
| `screenshot-09-extra-export-dialog-schritt1.png` | **Zusatz:** mehrstufiges Export-Wizard · Schritt **Zeitraum** (Presets Dropdown + Aggregation) |

---

## Level-Taxonomie (verifiziert)

- **L1** — Route `/monitor`: Zonen-Plate-Kacheln, Zonenwahl per Klick oder „Alle Zonen“.
- **L2** — Route `/monitor/:zoneId` (hier slug `gewaechshaus`): Geräte-/Subzonen-Ansicht, Sensor-**Cards** sind zunächst kollabiert.
- **L3** — Route `/monitor/:zoneId/sensor/:sensorId` mit `sensorId = {esp_id}-gpio{n}` (z. B. `ESP_EA5484-gpio4`): Sensor-Detail erscheint als **SlideOver** (`role="dialog"` mit Sensorname als Titel).

**Abweichung zum Vorwissen:** Der Eintrag über L3 „nur SlideOver ohne URL“ ist überholt — die URL wird per `router.replace` mitgeführt (`openSensorDetail` in `MonitorView.vue`).

**Zugang zu L3 im UI:** Der Link-Button **„Zeitreihe anzeigen“** sitzt erst in der **expandierten** Sensor-Karte (ein Klick auf die Karte öffnet den Inline-Zeitraum‑1h‑Chart-Block samt diesem Button).

---

## CSV-Button: Position + Verhalten (verifiziert + Screenshots)

**Große Abweichung zum Vorwissen (2026-05-12):**

1. Der Footer-Button heißt nicht mehr „CSV Export“, sondern **„Export“**.
2. Er startet **keinen** rein clientseitigen CSV-Blob aus `detailReadings`; es gibt keine Funktion `exportDetailCsv()` mehr in `MonitorView.vue`.
3. Klick öffnet den mehrstufigen **`ExportDialog`** (`mode="sensor"`), eingebunden neben dem SlideOver.

Footer (vereinfacht, Stand Code):

```2714:2737:c:\Users\robin\Documents\PlatformIO\Projects\Auto-one\El Frontend\src\views\MonitorView.vue
      <template #footer v-if="selectedDetailSensor">
        <div class="sensor-detail__actions">
          <button class="sensor-detail__action-btn" @click="openExportWizard" :disabled="!selectedDetailSensor">
            <Download :size="14" />
            Export
          </button>
        </div>
      </template>
    </SlideOver>

    <ExportDialog
      v-if="exportWizardSensorContext"
      mode="sensor"
      ...
      :default-start-time="detailStartTime"
      :default-end-time="detailEndTime"
      ...
    />
```

**Deaktivierungslogik:**

- Vorwissen: deaktiviert bei `detailReadings.length === 0`.
- **IST:** `:disabled="!selectedDetailSensor"` — der Export-Button ist **solange aktiv**, wie das SlideOver einen gewählten Sensor hat (**unabhängig** davon, ob die Chart-API Daten liefert). Bestätigt in Live-Session bei Meldung „Keine Daten für den gewählten Zeitraum.“

---

## Export-Funktion: Verhalten (verifiziert)

### A) Chart / Historie im SlideOver (unverändert limitiert)

`fetchDetailData()` ruft weiterhin `sensorsApi.queryData` mit **`limit: 1000`** auf — **ohne** `resolution`, **ohne** Cursor-Pagination. Das betrifft nur die **Anzeige** im Chart, nicht den Datei-Export über den Wizard.

### B) Datei-Export über „Export“-Wizard (neu, serverseitig)

Der Wizard ruft bei Download **`GET /api/v1/sensors/export`** mit Bearer-Token auf (Streaming-CSV). Relevante Query-Parameter (Frontend baut sie in `ExportDialog.vue` zusammen):

- `esp_id`, `gpio`, `sensor_type`
- `start_time`, `end_time` — aus gewähltem **Zeitraum-Preset des Wizards**
- optional `resolution` (sofern nicht `raw`)
- optional `columns` — kommagetrennte Spaltenliste

Der Server-Endpunkt existiert jetzt (**Widerspruch zum Vorwissen „kein CSV-Endpoint“**): Streaming, interne Batch-Größe 500 Zeilen, **ohne dokumentiertes hartes Gesamt-Limit** für die Streaming-Antwort.

**Beobachteter Download-Dateiname (Browser):**  
`sensor-export_ESP_EA5484_2026-05-14_2026-05-15.csv`  
Server setzt zusätzlich `Content-Disposition` mit Zeit-Infix im Format `%Y%m%dT%H%M%S` — kann von der **im Wizard angezeigten** Dateizeile (die nur Datum `YYYY-MM-DD` nutzt) abweichen.

**Stichprobe Inhalt:** Ein Test-Export im gewählten Fenster für den konkreten Sensor lieferte im Test **nur die Kopfzeile** (keine Datenzeilen) — konsistent zu leerem Verlauf in der UI für den kurzen Ausschnitt:

```text
timestamp,processed_value,unit,quality,sensor_type
```

Server-Defaults für Spalten (wenn kein `columns` übergeben): `timestamp`, `processed_value`, `unit`, `quality`, `sensor_type` (Quelle `sensors.py`).

### C) Wizard-Schritte (Sensor-Modus)

1. **Zeitraum:** Dropdown „Letzte 1/6/24/… Stunden/Tage“, plus **Aggregation** („Rohdaten“, „5 Minuten“, „1 Stunde“, „1 Tag“) mit dynamischer Auswahl wenn Preset groß (>24 h keine Rohdaten nach `availableResolutions`-Logik).
2. **Felder:** Checkboxen für Spalten (mind. 2 für Sensor-Modus); Default sichtbare Spalten laut Konstante `SENSOR_COLUMNS` in `ExportDialog.vue`.
3. **Format:** Buttons **CSV** und **JSON** — für `mode="sensor"` verweist `buildRequestUrl()` dennoch nur auf **`/api/v1/sensors/export`** (aktuell **`format`-Parameter nur CSV** seitens Backend). Risiko: Dateiendung `.json`, Inhalt weiter CSV — **befristet dokumentieren unter Gaps**.

---

## Zeitraum-Selektor im SlideOver: Alle Optionen (verifiziert + Screenshots)

Komponente `TimeRangeSelector.vue` (**unverändert** zum Vorwissen):

- Chips: **1 Std**, **6 Std**, **12 Std**, **24 Std** (Default), **7 Tage**, **Benutzerdefiniert**
- Custom: zwei Felder **`datetime-local`**, Submit **„Anwenden“**
- `range-change` setzt ISO-UTC `start`/`end` für `detailStartTime`/`detailEndTime` und triggert `fetchDetailData()`

**Neu gegenüber Vorwissen (Nebenschauplatz):** Im L3 gibt es zusätzlich **„Vergleichen mit:“** Overlay-Chips weiterer Sensoren gleicher Zone (Multi-Serie im Chart — **nicht Teil des CSV-Wizards**, nur Visualisierung).

**Wichtig:** Die **Zeitraum-Presets im Export-Wizard** (1/6/24 h, 7/30 Tage) sind **NICHT dieselbe Oberfläche** wie die `TimeRangeSelector`-Chips. Der Wizard ignoriert in der Implementation die Props `defaultStartTime` / `defaultEndTime` (sie werden im Script **nirgends gelesen**) — **Abweichung:** Der im Chart gewählte Zeitraum wird **nicht** automatisch in den Export übernommen.

---

## CSV-Datei: Spalten + Beispielinhalt

| Quelle | Spalten / Hinweis |
|--------|-------------------|
| **Server-Default** `GET /api/v1/sensors/export` | `timestamp`, `processed_value`, `unit`, `quality`, `sensor_type` |
| **Wizard wählbar** | u. a. `raw_value`, `esp_id`, `gpio`, `zone_id`, `subzone_id` (siehe Server `_EXPORT_ALLOWED_COLUMNS`) |
| **Encoding / Trennzeichen** | CSV-Stream `text/csv; charset=utf-8`, im Stichprobencode CRLF‑Zeilenenden |
| **Beispiel (leer)** | Nur Header-Zeile in der Sessions-Stichprobe (siehe oben). |

Die alte Vorwissens-Liste `timestamp,raw_value,processed_value,unit,quality` als **fest** für Monitor-Export ist **überholt**.

---

## Paralleles Export-System: Eingebunden? (ja/nein)

| Modul | In `MonitorView`? |
|-------|-------------------|
| `ExportDialog.vue` (`components/export`) | **Ja** — primärer Exportweg L3 footer |
| `useExportCsv` / `ExportCsvDialog` | **Nein** (keine Treffer in `MonitorView.vue`) |

---

## Neu entdeckte Optionen / Abweichungen vom Vorwissen

1. **Kein Inline-CSV** mehr aus `detailReadings`; **`exportDetailCsv` entfernt**.
2. **Server-Endpoint `GET /api/v1/sensors/export`** vorhanden (Streaming, Spalten- und Auflösungswahl).
3. **Mehrstufiger Export-Wizard** statt eines Klicks (Zeitraum, Felder, Format).
4. **Export aktiv auch ohne Datenpunkte** im Chart (solange Sensor ausgewählt).
5. **L2 UX:** Sensor-Karte **muss expanded** sein, um „Zeitreihe anzeigen“ zu sehen.
6. **L3 Zusatz-UI:** Multi-Sensor-Overlay („Vergleichen mit:“).
7. **Toter Code / Props:** `defaultStartTime`, `defaultEndTime` werden im `ExportDialog` **nicht** ausgewertet; `MonitorView` übergibt sie dennoch.
8. Auf **L1** gibt es weiterhin andere UI-Elemente mit Download-Icons (Dashboard-Kontext widgets) — **nicht identisch** mit L3 Sensor-CSV-Story (siehe Screenshot 01).

---

## Gap-Analyse: Was fehlt / was ist unvollständig

| Thema | Beschreibung |
|-------|--------------|
| **Zeitraum-Sync** | Chart-`TimeRangeSelector` und Export-Wizard sind **entkoppelt**; Defaults aus `detailStartTime`/`detailEndTime` werden **nicht** genutzt. |
| **Doppelte Konzepte** | Zwei verschiedene Preset-Sets (Chips vs. Wizard-Dropdown) verwirren operativ. |
| **JSON-Option Sensor** | UI bietet JSON; Server liefert nur CSV — potenziell inkonsistente Dateiendung/Inhalt. |
| **Chart vs. Export** | Chart weiter **1000 Punkte / kein resolution**; Export kann aggregieren & mehr Daten abdecken — Nutzer sieht das nicht erklärt. |
| **Dateiname UI vs. Server** | Angezeigter Name im Wizard (`YYYY-MM-DD`) vs. reale `Content-Disposition` mit Zeitstempel. |
| **Leere Exporte** | Technisch valide (nur Header), aber ohne UX-Hinweis „0 Zeilen“. |

---

## Offene Fragen für Robin

1. Soll der **Export-Wizard** den **aktiven Zeitraum der `TimeRangeSelector`** übernehmen (Props implementieren oder Context teilen)?
2. Soll die **JSON-Option** im Sensor-Export **entfernt** oder soll der Server **echtes JSON** streamen?
3. Wie soll die UI **Chart-Limit 1000** vs. **Export-Streaming** kommunizieren (Tooltip, Hinweis im Wizard)?
4. Bleibt der Dateiname **„screenshot-05-…-csv-button“** in internen Reports so gewollt, obwohl der Button jetzt **„Export“** heißt?

---

*Ende Bericht*
