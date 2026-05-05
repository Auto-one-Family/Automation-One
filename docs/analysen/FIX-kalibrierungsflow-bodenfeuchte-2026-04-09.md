# Fix: Kalibrierungsflow Bodenfeuchte (Schema-Alignment)

**Datum:** 2026-04-09  
**Kontext:** IST `docs/analysen/BERICHT-kalibrierungsflow-bodenfeuchte-oszillation-2026-04-09.md`

## Problem (kurz)

Kalibrier-Sessions fuer Bodenfeuchte lieferten mit `linear_2point` typischerweise `slope`/`offset` in `derived`, waehrend `MoistureSensorProcessor` fuer die Prozent-Umrechnung **`dry_value` / `wet_value`** erwartet. Ohne diese Keys griff die Verarbeitung auf Default-ADC (3200/1500) zurueck.

## Umsetzung

1. **Frontend:** `useCalibrationWizard` startet Feuchte-Kalibrierungen mit **`method: moisture_2point`** (statt `linear_2point`). `soil_moisture` wird weiter zu `moisture` normalisiert.
2. **Backend:** Fuer **legacy** Sessions mit `linear_2point` und Sensor-Typ **moisture** berechnet `finalize` nun dieselbe **`moisture_2point`-derived** (dry/wet/invert) wie bei `moisture_2point` — keine MQTT-/REST-Brueche.
3. **Processor:** `MoistureSensorProcessor` liest **`invert`** aus `calibration`, wenn `params` kein `invert` setzt; **`params.invert`** hat Vorrang.

## Operator-Hinweis

Sinnvolle **Prozent-Anzeige** im Pi-Enhanced-Rohpfad (`pi_enhanced` + `raw_mode`) wie bisher; ohne Pi-Enhanced kann weiterhin Roh-ADC angezeigt werden — kein Scope-Wechsel.

## Verifikation

- `poetry run pytest` (betroffene Unit-/Integrations-Tests)
- `npx vue-tsc --noEmit`, Vitest `useCalibrationWizard`

## Referenzen (Doku)

- API-Quick-Lookup: `.claude/reference/api/REST_ENDPOINTS.md` (Hinweis Calibration Sessions)
- Skills: `.claude/skills/frontend-development/SKILL.md`, `.claude/skills/server-development/SKILL.md` (Composables / Feuchte-Kalibrierung)
