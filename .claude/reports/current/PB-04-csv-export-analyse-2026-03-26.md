# PB-04 Analyse: CSV-Export — Sensordaten herunterladen

> **Datum:** 2026-03-26
> **Typ:** Analyse-Bericht (kein Code)
> **Status:** Abgeschlossen

---

## 1. Bestandsaufnahme

### 1.1 Backend: Kein CSV-Export-Endpoint vorhanden

Es gibt **keinen** Endpoint fuer Sensor-Daten-Export als CSV/XLSX.

Bestehende Download-Endpoints (nicht relevant fuer Sensor-Export):
| Endpoint | Format | Auth | Zweck |
|----------|--------|------|-------|
| `GET /api/v1/export/components` | JSON | ActiveUser | WoT-TD Komponenten-Metadaten |
| `GET /api/v1/export/zones` | JSON | ActiveUser | Zone-Metadaten mit Counts |
| `GET /api/v1/backups/database/{id}/download` | .sql.gz | AdminUser | DB-Backup |
| `GET /api/v1/debug/logs/backup/{id}` | .zip | AdminUser | Log-Archiv |

**Fazit:** Sensor-Zeitreihen-Export muss neu gebaut werden.

### 1.2 Frontend: CSV-Export existiert BEREITS (2 Stellen)

| Datei | Zeile | Kontext | Format |
|-------|-------|---------|--------|
| `MonitorView.vue` | 666–684 | L3 SlideOver Footer | CSV mit BOM (`\uFEFF`) |
| `SensorHistoryView.vue` | 249–263 | View-eigener Button | CSV ohne BOM |

**Pattern:** Beide nutzen dasselbe Inline-Muster:
```
Blob + URL.createObjectURL + temporaeres <a>-Element + .click()
```

**Felder im bestehenden CSV:**
```
timestamp,raw_value,processed_value,unit,quality
```

**Was fehlt im bestehenden Export:**
- Kein Zone-/Subzone-Name (nicht in API-Response enthalten, nur IDs)
- Kein Sensor-Name/Sensor-Type als Spalte
- Kein konfigurierbarer Zeitraum VOR dem Export (exportiert was gerade geladen ist)
- Kein Multi-Sensor-Export
- Limit auf 1000 Datenpunkte (API-Limit)

### 1.3 Sensor-Data API als Export-Quelle

**Endpoint:** `GET /api/v1/sensors/data`

| Parameter | Wert | Relevant fuer Export |
|-----------|------|---------------------|
| `limit` | max 1000 (raw), 10000 (aggregated) | **Bottleneck fuer grosse Exporte** |
| `resolution` | `raw`, `1m`, `5m`, `1h`, `1d` | Reduziert Datenmenge |
| `start_time`, `end_time` | datetime | Zeitraum-Filter |
| `zone_id`, `subzone_id` | string | Zone-Filter |
| `sensor_config_id` | UUID | Einzelsensor-Filter |

**Response-Schema (`SensorReading`):**

| Feld | Typ | Im Export? |
|------|-----|-----------|
| `timestamp` | datetime | Ja |
| `raw_value` | float | Ja |
| `processed_value` | float? | Ja |
| `unit` | string? | Ja |
| `quality` | string | Ja |
| `sensor_type` | string? | Ja |
| `zone_id` | string? | Nur ID, kein Name |
| `subzone_id` | string? | Nur ID, kein Name |
| `min_value` | float? | Nur aggregiert |
| `max_value` | float? | Nur aggregiert |
| `sample_count` | int? | Nur aggregiert |

**PROBLEM: `zone_name` und `subzone_name` fehlen in der Response.**
Nur `zone_id` und `subzone_id` sind vorhanden. Fuer menschenlesbare CSV muesste:
- Frontend: Zone-Name aus `espStore` / `zonesApi` resolven (verfuegbar)
- ODER Backend: JOIN im Export-Endpoint

---

## 2. Architektur-Empfehlung

### Bewertung der 3 Optionen

| Kriterium | A) Backend CSV-Endpoint | B) Frontend-Generierung | C) Hybrid (Frontend + Aggregation) |
|-----------|------------------------|------------------------|-----------------------------------|
| **Aufwand** | ~4h (neuer Endpoint + StreamingResponse) | ~2h (bestehenden Code erweitern) | ~2h (wie B, mit resolution-Parameter) |
| **30d Raw-Export (1 Sensor, 1min-Intervall)** | ~43.200 Zeilen, ~2MB, serverseitig gestreamt | API-Limit 1000 → **unmoeglich ohne Paginierung** | 1h-Aggregation: 720 Zeilen, kein Problem |
| **Browser-Speicher** | Kein Problem (Stream) | ~2MB OK, >10MB riskant | Kein Problem |
| **Abhaengigkeit** | Neuer Endpoint, neues Schema | Nur Frontend-Code | Nur Frontend-Code |
| **Zone-Name-Aufloesung** | Server-JOIN moeglich | Frontend-Lookup aus Store | Frontend-Lookup aus Store |

### Empfehlung: Option C (Hybrid) fuer MVP, Option A fuer v2

**MVP (Option C):**
- Frontend generiert CSV clientseitig aus bestehender API
- Nutzt `resolution`-Parameter (`1h` oder `1d`) um Datenmenge zu reduzieren
- Zone/Subzone-Name wird aus `espStore.devices` aufgeloest (bereits im Frontend verfuegbar)
- Kein Backend-Aenderung noetig
- Limit: ~720 Datenpunkte bei 30d/1h-Aufloesung → weit unter API-Limit

**v2 (Option A) — spaeter bei Bedarf:**
- Backend-Endpoint `GET /api/v1/sensors/data/export` mit `StreamingResponse`
- Fuer Raw-Daten-Export >1000 Zeilen (Forschung, Compliance)
- Server-seitiger JOIN fuer Zone/Subzone-Namen
- Kein Browser-Limit

**Begruendung:** Der MVP deckt 90% der Use-Cases ab (Gaertner will Wochenverlauf, Student will Monatsdaten — beides mit Stunden-Aggregation handhabbar). Raw-Export fuer Forschung ist Nische und kann spaeter kommen.

---

## 3. CSV-Format-Definition

### MVP-Format (Einzelsensor-Export)

```csv
timestamp,sensor_type,value,unit,quality
2026-03-26T10:00:00+00:00,sht31_temp,22.4,°C,good
2026-03-26T11:00:00+00:00,sht31_temp,23.1,°C,good
```

### Erweitert (bei aggregiertem Export, resolution != raw)

```csv
timestamp,sensor_type,avg_value,min_value,max_value,sample_count,unit,quality
2026-03-26T10:00:00+00:00,sht31_temp,22.4,21.8,23.1,12,°C,good
```

### Format-Details

| Aspekt | Entscheidung | Begruendung |
|--------|-------------|-------------|
| **Encoding** | UTF-8 mit BOM (`\uFEFF`) | Excel oeffnet CSV mit BOM korrekt (Umlaute in Zone-Namen) |
| **Separator** | Komma (`,`) | Standard, Excel-kompatibel |
| **Timestamps** | ISO 8601 mit Zeitzone (`+00:00`) | Eindeutig, maschinenlesbar |
| **Zeitzone** | UTC | Konsistent mit DB-Speicherung. Lokale Umrechnung = User-Verantwortung |
| **Dezimaltrennzeichen** | Punkt (`.`) | Internationaler CSV-Standard |
| **Wert-Spalte** | `processed_value` (Fallback: `raw_value`) | User will kalibrierte Werte |
| **Dateiname** | `{sensor_type}_{YYYY-MM-DD}_{YYYY-MM-DD}.csv` | Beispiel: `sht31_temp_2026-03-19_2026-03-26.csv` |

### Zone/Subzone-Name im MVP

**NICHT im MVP-CSV enthalten.** Begruendung:
- Einzelsensor-Export → Zone ist implizit klar (User hat den Sensor ausgewaehlt)
- Zone-Name-Aufloesung erfordert Mapping zone_id → zone_name (moeglich aber unnoetig fuer v1)
- Spaeter bei Multi-Sensor-Export relevant

---

## 4. UI-Platzierung

### MVP: Export im bestehenden L3 SlideOver (MonitorView)

**Der Export-Button existiert bereits** in [MonitorView.vue:2121-2128](El Frontend/src/views/MonitorView.vue#L2121-L2128).

Was geaendert werden muss:
1. **Vor dem Export: Zeitraum-Auswahl respektieren** — Der bestehende Button exportiert nur die aktuell geladenen Daten (was im Chart sichtbar ist). Das ist bereits korrekt, da der User im `TimeRangeSelector` (Zeile 2004-2026) den Zeitraum waehlt.
2. **Resolution-Auswahl hinzufuegen** — Checkbox oder Dropdown: "Aggregiert (1h)" vs "Rohdaten"
3. **Mehr Spalten** — `sensor_type` und ggf. `quality` hinzufuegen

**Kein neuer Dialog noetig fuer MVP** — Der TimeRangeSelector im SlideOver IS der Zeitraum-Dialog. User waehlt Zeitraum → sieht Chart → klickt Export → bekommt CSV fuer genau diesen Zeitraum.

### Spaeter (v2): Widget-Header Export-Button

Neuer Download-Button in [WidgetWrapper.vue](El Frontend/src/components/dashboard-widgets/WidgetWrapper.vue) als drittes Icon neben Settings und X:
- Icon: `Download` aus `lucide-vue-next` (bereits importiert in MonitorView)
- Position: links vom Settings-Icon
- Emittet `export`-Event, Widget-Komponente handelt den Export

### Spaeter (v3): Zone-Export in MonitorView L2

Export-Button im L2-Header neben dem Settings-Link. Exportiert alle Sensoren einer Zone in eine Multi-Sensor-CSV.

---

## 5. Betroffene Dateien

### MVP (reine Frontend-Aenderung)

| Datei | Aenderung |
|-------|----------|
| `El Frontend/src/views/MonitorView.vue` | `exportDetailCsv()` erweitern: mehr Spalten, aggregierte Felder, BOM konsistent |
| `El Frontend/src/views/SensorHistoryView.vue` | `exportCsv()` analog anpassen (Konsistenz) |

### Optional: Shared Utility extrahieren

| Datei | Aenderung |
|-------|----------|
| `El Frontend/src/composables/useCSVExport.ts` | **Neu:** Shared CSV-Generierung + Download-Trigger |

Begruendung: Zwei Views haben identischen Export-Code. Ein Composable vermeidet Duplikation:
```typescript
export function useCSVExport() {
  function downloadCSV(readings: SensorReading[], filename: string, options?: { resolution?: string }) { ... }
  return { downloadCSV }
}
```

### v2 (Backend + Frontend)

| Datei | Aenderung |
|-------|----------|
| `El Servador/.../api/v1/sensors.py` | Neuer Endpoint `GET /sensors/data/export` |
| `El Servador/.../repos/sensor_repo.py` | Query ohne Limit, mit StreamingResponse |
| `El Frontend/src/api/sensors.ts` | Neue Methode `getExportUrl()` |
| `El Frontend/src/components/dashboard-widgets/WidgetWrapper.vue` | Download-Button + emit |

---

## 6. Aufwand-Schaetzung

| Phase | Aufwand | Was |
|-------|---------|-----|
| **MVP** | ~1-2h | `exportDetailCsv()` verbessern, BOM+Spalten konsistent, optional `useCSVExport` Composable |
| **v2** | ~3-4h | Backend StreamingResponse-Endpoint, Widget-Header-Button |
| **v3** | ~2-3h | Multi-Sensor-Export, Zone-Level-Export in L2, Export-Dialog mit Format-Auswahl |

### MVP-Scope (minimal)

1. Bestehenden `exportDetailCsv()` in MonitorView L3 verbessern:
   - Spalten: `timestamp,sensor_type,value,unit,quality`
   - Bei aggregierten Daten: `timestamp,sensor_type,avg_value,min_value,max_value,sample_count,unit`
   - BOM konsistent (`\uFEFF`)
   - Dateiname: `{sensor_type}_{from}_{to}.csv`
2. `SensorHistoryView.exportCsv()` analog anpassen
3. Optional: Shared Composable `useCSVExport.ts`

**Kein Backend-Aenderung. Kein neuer Dialog. Kein Multi-Sensor-Export.**

---

## 7. Offene Fragen fuer Robin

1. **Resolution im Export:** Soll der User vor dem Export waehlen ob Raw oder Aggregiert? Oder reicht es, die gleiche Resolution zu nehmen die im Chart angezeigt wird?
2. **Dateiname:** `{sensor_type}_{from}_{to}.csv` oder `{zone}_{sensor_type}_{from}_{to}.csv`?
3. **SensorHistoryView:** Soll dort der gleiche Export verbessert werden, oder ist MonitorView L3 der Haupt-Einstieg?
4. **Prioritaet v2:** Wie wichtig ist Raw-Export >1000 Zeilen fuer die Bachelorarbeit?
