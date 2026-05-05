# Operator-Hinweis: Bodenfeuchte-Kalibrierung — Altdaten (`linear_2point` ohne dry/wet)

**Datum:** 2026-04-10  
**Bezug:** `docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md`

## Kontext

Kanonisch persistiert die Session nach erfolgreichem Apply **`derived.type = moisture_2point`** mit **`dry_value`** / **`wet_value`** für den `MoistureSensorProcessor`. Ältere Einträge können noch **`derived.type = linear_2point`** bei Sensor `moisture` / `soil_moisture` zeigen, **ohne** die für die Verarbeitung nötigen **`dry_value`/`wet_value`** — dann liefert `resolve_calibration_for_processor` keine brauchbare Flach-Struktur.

## Read-only SQL (PostgreSQL) — Template

Platzhalter `<schema>` bei Bedarf setzen. Keine Produktiv-IDs aus diesem Beispiel übernehmen.

```sql
SELECT
  sc.id,
  sc.esp_id,
  sc.gpio,
  sc.sensor_type,
  sc.calibration_data
FROM sensor_configs AS sc
WHERE sc.sensor_type IN ('moisture', 'soil_moisture')
  AND sc.calibration_data->'derived'->>'type' = 'linear_2point'
  AND (
    sc.calibration_data->'derived'->>'dry_value' IS NULL
    OR sc.calibration_data->'derived'->>'wet_value' IS NULL
  );
```

## Handlungsempfehlung

1. **Bevorzugt:** Neu-Kalibrierung über den UI-Wizard (Hardware → Sensor), damit eine vollständige Session **`moisture_2point`** geschrieben wird.
2. **Manuelles JSON-Update** auf Produktionsdatenbanken nur mit Backup, Review und explizitem Freigabe-Gate — nicht empfohlen als Routine.
3. **Pi-Enhanced / Prozent:** Sinnvolle Prozent-Anzeige nur mit **`pi_enhanced`** und konsistentem Rohdatenpfad (siehe IST-Verifikationsdokument und Sensor-Doku).
