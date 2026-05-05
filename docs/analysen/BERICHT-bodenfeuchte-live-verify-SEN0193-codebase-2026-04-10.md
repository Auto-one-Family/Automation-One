# Bericht — Bodenfeuchte: Live-Verifikation (30 Min) + Codebase-Abgleich (SEN0193-Symptom)

**Datum:** 2026-04-10  
**Typ:** Evidenzbasierter Analysebericht — **keine Produktänderungen** aus diesem Dokument (separates Gate für Fixes).  
**Git:** Branch `auto-debugger/work`, Commit `25739b4` (Referenz zum Zeitpunkt der Analyse).  
**Hinweis:** Die referenzierte Steuerdatei `.claude/auftraege/auto-debugger/inbox/STEUER-bodenfeuchte-live-verify-codebase-bericht-2026-04-10.md` lag im Workspace **nicht** vor; der Ablauf entspricht der Nutzeranweisung (Live → Codebase → Bericht).

---

## 1. Executive Summary

**Symptom (Ist-Schilderung):** Schwankung etwa **0–60 %** auch **in der Luft**, **100 % im Wasser** plausibel; Sensor **SEN0193** (handelsüblicher kapazitiver Bodenfeuchtesensor, oft „v1.2“-Familie — im Repo **kein** Literal `SEN0193`) kalibriert.

**Live-Evidenz (letzte 30 Minuten, PostgreSQL):**

- Es liegen **zwei parallele Datenquellen** für `sensor_type = moisture` auf **GPIO 32** vor: ein Gerät mit **`processing_mode = raw`** und konstantem Rohwert **40** (Mock/Test o. ä.), und ein Gerät mit **`pi_enhanced`** und **real schwankendem** Roh-ADC (**115–4095**). Die Aggregation über **beide** verwischt Roh-Min/Max; die **Einzelzeilen** sind eindeutig.
- Das Gerät mit **Pi-Enhanced** zeigt **Prozentwerte** im Bereich **0 % bis etwa 52 %** in der Luft, dazu wiederholt **Roh 4095** → **0 %**, `quality = poor` — typisch für **schwebenden / offenen Eingang** oder starkes Rauschen am ADC.
- **`sensor_configs.calibration_data`** für das Pi-Enhanced-Gerät enthält in der DB weiterhin ein abgeschlossenes Ergebnis mit **`derived.type: linear_2point`** (`slope`/`offset`), **ohne** `dry_value`/`wet_value`.

**Codebase (aktueller Stand im Tree):**

- `MoistureSensorProcessor` wendet **nur** dann die Zwei-Punkt-Kalibrierung an, wenn `calibration` **`dry_value` und `wet_value`** enthält; sonst **`_adc_to_moisture_default`** (fest **3200 / 1500** ADC).
- `resolve_calibration_for_processor` reicht **`derived`** flach an den Processor durch — ein **`linear_2point`-Derived** liefert **keine** `dry_value`/`wet_value` → effektiv **Default-Kennlinie**, nicht die Kalibrierpunkte aus der Session.
- **Frontend** startet neue Feuchte-Sessions mit **`moisture_2point`**; **Backend** mappt bei **`linear_2point`** und Sensor **`moisture`** auf **`_compute_moisture_from_role_points`** (→ `moisture_2point` mit dry/wet). **Die gespeicherte DB-Zeile** stammt den Metadaten nach vom **Finalize am 2026-04-09** und entspricht noch dem **alten** `linear_2point`-Derived — konsistent mit „Kalibrierung durchgeführt, aber Processor sieht sie nicht“.

**Dominante Ursachen (kombiniert):**

1. **Semantik / Persistenz:** Gespeichertes **`linear_2point`-Derived** ohne Umweg über **`moisture_2point`** führt dazu, dass der Feuchte-Processor **die Kalibrierpunkte ignoriert** und die **Default-ADC-Grenzen** nutzt — erklärt **große Prozent-Sprünge** bei moderatem ADC-Rauschen und Abweichung von 3200/1500.
2. **Hardware / ADC:** Wiederkehrendes **`raw = 4095`** mit **`poor`** — starkes Indiz für **kein stabiles Sensor-Signal** (Kabel, Kontakt, Modus, Referenz); trägt zu **0 %-Rattern** bei.
3. **Parallelbetrieb:** Zwei **ESP-Einträge** mit **gleichem `sensor_type`/GPIO** im Zeitfenster — für Auswertung immer **`esp_id`** und **`processing_mode`** trennen.

---

## 2. Live-Verifikation — letzte 30 Minuten (Roh + Prozent + Modus)

**Quelle:** `docker exec automationone-postgres psql -U god_kaiser -d god_kaiser_db`  
**Zeitfilter:** `timestamp >= NOW() - INTERVAL '30 minutes'`  
**Filter:** `sensor_type = 'moisture'`

### 2.1 Gesamtaggregation (alle ESPs)

| Metrik | Wert |
|--------|------|
| Anzahl Zeilen | 118 |
| `raw_value` min / max / avg | 40 / 4095 / 1486.14 |
| `processed_value` min / max / avg | 0 / 100 / 35.75 |

*Hinweis:* Durch **zwei Geräte** (siehe 2.2) ist die **globale** Aggregation für Diagnose **nur bedingt** aussagekräftig.

### 2.2 Pro ESP (trennend)

| `esp_id` | n | Roh min–max | Roh-Median | Prozent min–max | Bemerkung |
|----------|---|-------------|------------|-----------------|-----------|
| `63f776d4-d0fc-4191-b4e3-58c1d77ebb4d` | 59 | 115–4095 | 2659 | 0–100 | **pi_enhanced**, real schwankend; **4095**-Spitzen |
| `878e54ac-481f-4464-8b8d-620534ab761b` | 59 | 40–40 | 40 | 40–40 | **raw**, konstant (Mock/Second Path) |

### 2.3 Stichprobe chronologisch (Pi-Enhanced-Gerät)

Auszug (neueste zuerst): wiederholtes Muster **hoher ADC** (bis 4095) → **0 %** und `poor`; dazwischen **ca. 17–52 %** bei ADC rund **2300–2900**.

*Interpretation:* Das passt zu **Default-Kennlinie** (siehe Abschnitt 4) **plus** instabilem Rohsignal; **100 % Wasser** ist plausibel, wenn der ADC **in den nassen Bereich** (~Kalibrier-„wet“ oder darunter) kommt — unabhängig davon, ob die **gespeicherte** Session semantisch korrekt im Processor ankommt.

---

## 3. Kalibrier-Snapshot (`sensor_configs`)

Abfrage: `sensor_type IN ('moisture','soil_moisture')`, relevante Spalten.

| `esp_id` | `gpio` | `pi_enhanced` | Kurzbeschreibung `calibration_data` |
|----------|--------|---------------|--------------------------------------|
| `878e54ac-…` | 32 | **false** | `calibration_data` **leer** |
| `63f776d4-…` | 32 | **true** | Kanonisch mit **`method`: `linear_2point`**, Punkte **dry/wet** (Roh **2261** / **907**), **`derived`**: **`type`: `linear_2point`**, `slope`/`offset`, **keine** `dry_value`/`wet_value` |

**Kalibrierzeitpunkt (Metadata):** `calibrated_at` im Derived: **2026-04-09T20:34:17Z** (Finalize der Session).

---

## 4. Codebase-Analyse (relevant für Symptom)

### 4.1 Processor: nur `dry_value`/`wet_value` oder Default

```144:153:El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py
        if calibration and "dry_value" in calibration and "wet_value" in calibration:
            dry_value = calibration["dry_value"]
            wet_value = calibration["wet_value"]
            moisture = self._adc_to_moisture_calibrated(raw_value, dry_value, wet_value)
            calibrated = True
        else:
            # No calibration - use default linear mapping
            # Default: dry ~3200 ADC, wet ~1500 ADC
            moisture = self._adc_to_moisture_default(raw_value)
```

Default: **3200 / 1500** ADC (`_adc_to_moisture_default`).

### 4.2 Auflösung der gespeicherten Kalibrierung für den Processor

```108:124:El Servador/god_kaiser_server/src/services/calibration_payloads.py
def resolve_calibration_for_processor(payload: Any) -> dict | None:
    ...
    derived = payload.get("derived")
    if isinstance(derived, dict) and derived:
        return dict(derived)
```

Damit landet bei gespeichertem **`linear_2point`-Derived** ein Dict **mit** `slope`/`offset`, aber **ohne** `dry_value`/`wet_value` → Abschnitt 4.1 fällt in den **Else-Zweig** (Default).

### 4.3 Backend-Finalize: Feuchte + `linear_2point` → dry/wet (aktueller Code)

```769:775:El Servador/god_kaiser_server/src/services/calibration_service.py
        if method == "moisture_2point":
            return CalibrationService._compute_moisture(points)
        elif method in ("linear_2point", "linear"):
            # Legacy sessions: Feuchte mit linear_2point → gleiche derived-Form wie moisture_2point (dry/wet).
            if normalize_sensor_type(sensor_type or "") == "moisture":
                return CalibrationService._compute_moisture_from_role_points(points)
            return CalibrationService._compute_linear_2point(sensor_type, points)
```

**Folge für Neu-Finalizes:** Session mit **`moisture`** und **`linear_2point`** sollte **`moisture_2point`-Derived** mit **`dry_value`/`wet_value`** erzeugen — **die vorliegende DB-Zeile** ist mit einem **älteren Finalize** oder **anderem Code-Stand** vereinbar.

### 4.4 Frontend: neue Sessions mit `moisture_2point`

`useCalibrationWizard.ts` nutzt `calibrationApiMethodForSensorType`: für **`moisture`** → **`moisture_2point`** (Kommentar und Funktion im Tree ab Zeile ~178).

---

## 5. Synthese: passt das zum Symptom?

| Beobachtung | Erklärung |
|-------------|-----------|
| 0–60 % „in Luft“ | Roh-ADC bewegt sich zwischen **trocken-nah** (hoher ADC) und **mittlerem** Bereich; bei **Default 3200/1500** entstehen **steile Prozentänderungen**; dazu **4095**-Spitzen → **0 %** nach Clamp. |
| 100 % im Wasser „ok“ | ADC nahe **nasser** Referenz → Prozent geht gegen **100** auch mit Default, wenn der Messwert in den „nassen“ Bereich fällt; **bestätigt nicht** automatisch, dass **Ihre** Kalibrierpunkte (2261/907) aktiv sind. |
| SEN0193 kalibriert | Punkte in `calibration_data.points` sind konsistent mit Zwei-Punkt-Intent; **`derived`** ohne `dry_value`/`wet_value` erklärt, warum der **Processor** davon **keinen Gebrauch** macht. |

---

## 6. Empfehlungen (ohne Implementierung aus diesem Bericht)

1. **Betrieb:** Für das betroffene Gerät **`63f776d4-…`** nach gesichertem Deploy des aktuellen Stands **Kalibrierung erneut finalisieren** oder Session mit **`moisture_2point`** neu durchlaufen; danach **`derived`** in der DB prüfen: **`type`: `moisture_2point`** und **`dry_value`/`wet_value`** gesetzt.
2. **Hardware:** **4095**-Serien und `quality = poor` gezielt untersuchen (Verkabelung, 3,3 V, gemeinsame Masse, nur **ADC1**-GPIOs, keine schwebenden Eingänge).
3. **Mess-Setup:** Parallele **`moisture`-Streams** (Mock-Konstante 40 vs. Live) bei Auswertung **filtern** (`esp_id`), um keine falschen Aggregate zu sehen.
4. **Code-Änderungen:** Nur nach **separatem Gate** (z. B. Verify-Plan / Ticket) — wie von dir gefordert.

---

## 7. Reproduktion der SQL-Checks

```sql
-- Aggregation letzte 30 Min, nur moisture
SELECT esp_id::text, COUNT(*) n,
       MIN(raw_value)::int, MAX(raw_value)::int,
       MIN(processed_value), MAX(processed_value)
FROM sensor_data
WHERE timestamp >= NOW() - INTERVAL '30 minutes'
  AND sensor_type = 'moisture'
GROUP BY esp_id;

-- Kalibrierung
SELECT esp_id::text, gpio, pi_enhanced, calibration_data
FROM sensor_configs
WHERE sensor_type IN ('moisture','soil_moisture');
```

---

## 8. Akzeptanz (Selbstcheck)

- [x] Live-Fenster **30 Min**: Roh, Prozent, Modus pro Zeile / Aggregat dokumentiert  
- [x] Kalibrier-Snapshot aus **`sensor_configs`** zitiert  
- [x] Codepfad **Processor** + **`resolve_calibration_for_processor`** + **Finalize** abgebildet  
- [x] Keine Code-Fixes in diesem Schritt  
- [x] Pfade nur relativ zum Repo-Wurzelverzeichnis  

---

## 9. Referenz — Vorarbeit (Kontext)

Ausführliche historische IST-Analyse inkl. Hypothesenmatrix: `docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md`.  
Kurzbeschreibung der späteren Fix-Richtung: `docs/analysen/FIX-kalibrierungsflow-bodenfeuchte-2026-04-09.md`.
