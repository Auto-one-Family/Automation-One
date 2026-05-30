# Auftrag: Monitor L3 — CSV-Download vollständig analysieren, screenshotten und dokumentieren

**Datum:** 2026-05-15  
**Schicht:** El Frontend (Vue 3)  
**Typ:** Analyse + Dokumentation (kein Implementierungsauftrag)  
**Priorität:** Mittel

---

## Ziel

Den aktuellen Stand des CSV-Downloads im Monitor vollständig dokumentieren:  
alle Optionen, alle Einstellungen, alle Grenzen. Der Agent geht dafür selbst per Browser auf das laufende Frontend, macht Screenshots aller relevanten Dialoge und Zustände und erstellt einen vollständigen Analysebericht.

---

## Ausgabe-Ordner

Alle Artefakte (Screenshots + Bericht) kommen in:

```
Auto-one/.claude/reports/current/download-analyse/monitor-l3/
```

Dateien:
- `ANALYSE-monitor-l3-download-<YYYY-MM-DD>.md` — vollständiger Analysebericht
- `screenshot-01-monitor-l1-zone-uebersicht.png` — L1-Ansicht mit Zonenübersicht
- `screenshot-02-monitor-l2-device-ebene.png` — L2 mit Sensor-Cards + "Zeitreihe anzeigen"-Button
- `screenshot-03-monitor-l3-slideover-offen.png` — L3-SlideOver vollständig offen
- `screenshot-04-monitor-l3-timerangeselector.png` — alle Zeitraum-Presets sichtbar
- `screenshot-05-monitor-l3-csv-button.png` — CSV-Export-Button im SlideOver-Footer
- `screenshot-06-monitor-l3-custom-range.png` — benutzerdefinierten Zeitraum eingestellt
- `screenshot-07-monitor-l3-nach-download.png` — Zustand nach ausgelöstem Export

Wenn das Frontend zusätzliche Optionen oder Dialoge zeigt, die hier nicht aufgelistet sind, ebenfalls screenshotten und im Bericht dokumentieren.

---

## Bekannter Stand (Vorwissen aus Analyse vom 2026-05-12)

Das folgende Vorwissen wurde durch Code-Analyse gewonnen. Es kann seit 2026-05-12 bereits verändert worden sein — der Agent soll alle Punkte am laufenden Frontend verifizieren und bei Abweichungen im Bericht vermerken.

### Level-Taxonomie im Monitor

- **L1** = `/monitor` — Zonenübersicht mit ZonePlate-Kacheln  
- **L2** = `/monitor/{zone_slug}` — Device-Ebene mit Sensor-Cards pro ESP  
- **L3** = `/monitor/{zone_slug}/sensor/{esp_id}-gpio{gpio}` — Sensor-Detail-SlideOver

Der CSV-Export-Button erscheint **nur im L3-SlideOver**, nicht auf L1 oder L2.

### Wo der Download-Button sitzt

Datei: `El Frontend/src/views/MonitorView.vue`, Bereich Zeilen 2717–2723 (Stand 2026-05-12):

```html
<template #footer v-if="selectedDetailSensor">
  <div class="sensor-detail__actions">
    <button class="sensor-detail__action-btn"
            @click="exportDetailCsv"
            :disabled="detailReadings.length === 0">
      <Download :size="14" />
      CSV Export
    </button>
  </div>
</template>
```

Der Button ist im `<SlideOver>`-Footer. Er ist deaktiviert wenn keine Readings geladen sind (`detailReadings.length === 0`).

Der L3-SlideOver öffnet sich über diesen Button auf L2 (Zeile ~2445):
```html
<button class="monitor-sensor-card__detail-btn"
        @click.stop="openSensorDetail(sensor)">
  <ChevronRight class="w-4 h-4" />
  <span>Zeitreihe anzeigen</span>
</button>
```

### Export-Funktion: client-seitig, kein API-Call

Die Funktion `exportDetailCsv()` ist eine lokale Funktion in `MonitorView.vue` (Zeilen ~975–993). Sie macht **keinen eigenen API-Call** — sie exportiert die bereits geladenen Daten aus dem lokalen State `detailReadings.value`:

```typescript
function exportDetailCsv() {
  if (!detailReadings.value.length) return
  const sensor = selectedDetailSensor.value
  const unit = sensor?.unit || ''
  const header = 'timestamp,raw_value,processed_value,unit,quality'
  const rows = detailReadings.value.map(r => {
    const processedVal = r.processed_value ?? r.raw_value
    const rowUnit = r.unit || unit
    return `${r.timestamp},${r.raw_value},${processedVal},${rowUnit},${r.quality}`
  })
  const csv = [header, ...rows].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `sensor-data_${sensor?.espId}_gpio${sensor?.gpio}_${Date.now()}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
```

**Fixe CSV-Spalten:** `timestamp,raw_value,processed_value,unit,quality`  
**Keine Spaltenauswahl** — immer diese 5 Spalten, keine Möglichkeit das zu konfigurieren.

### Datenladen: separater API-Call mit Limit 1000

Die Daten für den SlideOver werden via `fetchDetailData()` geladen (Zeilen ~720–741):

```typescript
async function fetchDetailData() {
  if (!selectedDetailSensor.value) return
  const response = await sensorsApi.queryData({
    esp_id: selectedDetailSensor.value.espId,
    gpio: selectedDetailSensor.value.gpio,
    sensor_type: selectedDetailSensor.value.sensorType || undefined,
    start_time: detailStartTime.value,
    end_time: detailEndTime.value,
    limit: 1000,     // Hard-Cap: max 1000 Datenpunkte
  })
  detailReadings.value = response.readings ?? []
}
```

- Methode: GET  
- URL: `/api/v1/sensors/data` (via `El Frontend/src/api/sensors.ts`, Zeilen ~115–119)  
- Parameter: `esp_id`, `gpio`, `sensor_type`, `start_time`, `end_time`, `limit: 1000`  
- **Kein `resolution`-Parameter** (Aggregation nicht konfigurierbar)  
- **Kein `offset`-Parameter** — max 1000 Punkte absolut

### Server-Endpoint: kein CSV-Support

Der Server-Endpoint `GET /api/v1/sensors/data` (Handler in `El Servador/god_kaiser_server/src/api/v1/sensors.py`, Zeilen ~1355–1389) gibt **JSON zurück, kein CSV**. Alle verfügbaren Query-Parameter:

| Parameter | Vorhanden | Detail |
|-----------|-----------|--------|
| `esp_id` | ✅ | Pflichtfilter |
| `gpio` | ✅ | ge=0, le=39 |
| `sensor_type` | ✅ | Optional |
| `start_time` | ✅ | ISO-Datetime, äquivalent zu `date_from` |
| `end_time` | ✅ | ISO-Datetime, äquivalent zu `date_to` |
| `limit` | ✅ | ge=1, le=1000 — max 1000 |
| `resolution` | ✅ | `raw|1m|5m|1h|1d` — vorhanden, aber `fetchDetailData()` nutzt es nicht |
| `before_timestamp` | ✅ | Cursor-Pagination |
| `quality` | ✅ | Filter auf Qualitätsstufe |
| `zone_id` / `subzone_id` | ✅ | Optional |
| `offset` | ❌ | Fehlt — nur Cursor-Pagination |

Server-seitig existiert **kein dedizierter CSV-Endpoint** im gesamten Servador (Stand 2026-05-12).

### Zeitraum-Selektor: aktiv und vollständig implementiert

`TimeRangeSelector`-Komponente ist im SlideOver aktiv (`MonitorView.vue:2617–2620`):

```html
<TimeRangeSelector
  v-model="detailPreset"
  @range-change="onDetailRangeChange"
/>
```

Verfügbare Presets (aus `TimeRangeSelector.vue`):  
`1 Std` | `6 Std` | `12 Std` | `24 Std` (Default) | `7 Tage` | `Benutzerdefiniert`

Bei "Benutzerdefiniert" erscheint ein `<input type="datetime-local">`.  
Der gewählte Zeitraum steuert `detailStartTime` / `detailEndTime` → direkt in `fetchDetailData()` → der CSV-Export exportiert implizit den gewählten Zeitraum.

### Paralleles Export-System (wird in MonitorView nicht genutzt)

Im Frontend existiert ein saubereres Export-System, das in MonitorView ignoriert wird:
- `El Frontend/src/composables/useExportCsv.ts` — mit `resolution`-Parameter, eigener API-Call, nicht auf geladene Daten angewiesen
- `El Frontend/src/components/dashboard-widgets/ExportCsvDialog.vue` — vollständiger Dialog mit Zeitraum + Resolution-Auswahl

Dieses System wird nur in `HistoricalChartWidget.vue` (Zeile ~100) und `MultiSensorWidget.vue` (Zeile ~60) verwendet — **nicht in MonitorView**.

### Bekannte Gaps (Stand 2026-05-12)

| Gap | Beschreibung |
|-----|-------------|
| Max 1000 Datenpunkte | Hard-Cap in `fetchDetailData()` — bei langen Zeiträumen unvollständige Daten |
| Kein `resolution`-Parameter | `fetchDetailData()` nutzt keinen Aggregations-Parameter, obwohl Server ihn unterstützt |
| Kein Bulk-Export | Kein server-seitiger CSV-Endpoint, kein Streaming |
| Keine Spaltenauswahl | Immer `timestamp,raw_value,processed_value,unit,quality` |
| Impliziter Zeitraum | Exportierter Zeitraum nicht explizit im UI kommuniziert |
| Konsolidierungspotenzial | `useExportCsv` + `ExportCsvDialog` existieren als sauberere Alternative, werden aber in MonitorView nicht genutzt |

---

## Aufgaben für den Agent

### 1. Ordner anlegen

```
Auto-one/.claude/reports/current/download-analyse/monitor-l3/
```

### 2. Frontend im Browser aufrufen und navigieren

1. Frontend starten (falls nicht läuft)
2. Zu `/monitor` navigieren (L1)
3. Eine Zone mit aktiven Sensoren auswählen → L2
4. Einen Sensor anklicken ("Zeitreihe anzeigen") → L3-SlideOver öffnet sich
5. Screenshots nach der Liste im Abschnitt "Ausgabe-Ordner" machen — alle Zustände durchgehen

**Besonders dokumentieren:**
- Alle Optionen des TimeRangeSelectors (jeden Preset einzeln)
- Den "Benutzerdefiniert"-Zustand mit ausgefüllten Datumsfeldern
- Den CSV-Button im deaktivierten Zustand (wenn keine Daten geladen)
- Den CSV-Button im aktiven Zustand (wenn Daten geladen)
- Den Dateinamen der heruntergeladenen CSV-Datei
- Den Inhalt der CSV-Datei (Spalten, erste Zeilen)
- Ob es noch weitere Buttons, Optionen oder Dialoge gibt, die im Vorwissen nicht dokumentiert sind

### 3. Vorwissen verifizieren

Für jeden Punkt im Abschnitt "Bekannter Stand" prüfen:
- Stimmt die Level-Taxonomie noch?
- Ist der CSV-Button noch im SlideOver-Footer?
- Sind die Spalten der CSV noch dieselben?
- Gibt es neue Optionen oder Einstellungen?
- Hat sich der TimeRangeSelector verändert?
- Wurde `useExportCsv` / `ExportCsvDialog` inzwischen in MonitorView eingebunden?

### 4. Analysebericht erstellen

Datei: `Auto-one/.claude/reports/current/download-analyse/monitor-l3/ANALYSE-monitor-l3-download-<YYYY-MM-DD>.md`

Struktur des Berichts:
```
# Monitor L3 CSV-Download — Analyse <DATUM>

## Level-Taxonomie (verifiziert)
## CSV-Button: Position + Verhalten (verifiziert + Screenshots)
## Export-Funktion: Verhalten (verifiziert)
## Zeitraum-Selektor: Alle Optionen (verifiziert + Screenshots)
## CSV-Datei: Spalten + Beispielinhalt
## Paralleles Export-System: Eingebunden? (ja/nein)
## Neu entdeckte Optionen / Abweichungen vom Vorwissen
## Gap-Analyse: Was fehlt / was ist unvollständig
## Offene Fragen für Robin
```

---

## Was dieser Auftrag NICHT tut

- **Kein Code ändern** — reine Analyse und Dokumentation
- **Keine Implementierung** der identifizierten Gaps — das ist ein Folgeauftrag
- **Keine Bewertung**, welche Gaps zuerst angegangen werden sollen — das entscheidet Robin anhand des Berichts

---

## Akzeptanzkriterium

- Ordner `Auto-one/.claude/reports/current/download-analyse/monitor-l3/` existiert
- Mindestens 7 Screenshots vorhanden (alle Zustände aus der Liste)
- Analysebericht existiert mit allen Sektionen ausgefüllt
- Jede Abweichung vom Vorwissen ist im Bericht vermerkt
- Bericht ist ohne Zugriff auf das Life-Repo vollständig verständlich
