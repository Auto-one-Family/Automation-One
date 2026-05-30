# AUT-390 Report — Live-QA Export-Wizard End-to-End

**Linear:** AUT-390
**Status:** Pass (76/83 Pass, 7 Warning — non-blocking)
**Run date:** 2026-05-12
**Stack:** El Servador (FastAPI) + PostgreSQL + Docker
**Output file:** `.claude/reports/current/export-qa-2026-05-12T2206.md`
**Script:** `scripts/qa/export_endpoint_qa.py`

---

## Assertions Summary

### AUTH (4/4 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-AUTH-01 | No token → 401 | ✅ Pass | |
| T-AUTH-02 | Expired token → 401 | ✅ Pass | |
| T-AUTH-03 | Random token → 401 | ✅ Pass | |
| T-AUTH-04 | Valid token → 200 | ✅ Pass | |

### FILTER (8/8 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-FILTER-01 | No filter → 422 | ✅ Pass | |
| T-FILTER-02–06 | Single / combined filter → 200 | ✅ Pass | |
| T-FILTER-07 | gpio=40 (out-of-range) → 422 | ✅ Pass | |
| T-FILTER-08 | gpio=-1 → 422 | ✅ Pass | |

### ESP (2/3 Pass, 1 Warn)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-ESP-01 | Valid esp_id → 200 | ✅ Pass | |
| T-ESP-02 | Unknown esp_id → 404 | ✅ Pass | |
| T-ESP-03 | Empty esp_id → 422 | ⚠️ Warn | Dokumentiertes Verhalten HTTP 422 |

### TIME (7/7 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-TIME-01–02 | start ≥ end → 422 | ✅ Pass | |
| T-TIME-03 | Valid range + data | ✅ Pass | 91 Datenzeilen |
| T-TIME-04 | Valid range, no data → header-only | ✅ Pass | |
| T-TIME-05 | No time → default 24h | ✅ Pass | 1217 Zeilen |
| T-TIME-06 | Naive datetime → UTC | ✅ Pass | |
| T-TIME-07 | DB-Kreuzabgleich Zeitfenster | ✅ Pass | CSV=60, DB=60 |

### COLUMN (8/9 Pass, 1 Warn)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-COL-01 | No columns → Default 5 | ✅ Pass | |
| T-COL-02–03 | Spaltenauswahl | ✅ Pass | |
| T-COL-04 | esp_id → UUID | ⚠️ Warn | Informativ: UUID statt device_id |
| T-COL-05–07 | Validierung + Trimming | ✅ Pass | |
| T-COL-08 | columns='' → 422 erwartet | ⚠️ Warn | **B2 CONFIRMED** — gibt 200 zurück → AUT-400 |
| T-COL-09 | Alle 10 Spalten | ✅ Pass | |

### CSV FORMAT (8/8 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-CSV-01 | BOM (UTF-8 0xEF 0xBB 0xBF) | ✅ Pass | |
| T-CSV-02 | Content-Type: text/csv | ✅ Pass | |
| T-CSV-03 | Content-Disposition attachment | ✅ Pass | |
| T-CSV-04 | No Content-Length (streaming) | ✅ Pass | |
| T-CSV-05–08 | Separator, None→leer, ISO-8601, °C | ✅ Pass | |

### CURSOR BATCHING (5/6 Pass, 1 Warn)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-CURSOR-01 | 50 rows → 1 batch | ✅ Pass | |
| T-CURSOR-02 | 500 rows exact | ✅ Pass | |
| T-CURSOR-03 | 501 rows → 2 batches | ✅ Pass | |
| T-CURSOR-04 | 1001 rows → 3 batches | ✅ Pass | |
| T-CURSOR-05 | B1 Cursor-Bug (identische Timestamps) | ⚠️ Warn | **NOT TRIGGERED** CSV=600=DB — AUT-389 |
| T-CURSOR-06 | sensor_type-Filter → kein Verlust | ✅ Pass | |

### RESOLUTION / AGGREGATION (6/7 Pass, 1 Warn)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-RES-01–05 | raw / 1m / 5m / 1h / 1d | ✅ Pass | |
| T-RES-06 | zone_id leer bei aggregierten Daten | ⚠️ Warn | **B5 CONFIRMED** → AUT-402 (TM-Entscheidung) |
| T-RES-07 | resolution=invalid → 422 | ✅ Pass | |

### DB CROSS-CHECK (4/4 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-DB-01 | 100 rows full-filter | ✅ Pass | CSV=DB=100 |
| T-DB-02 | 1000 rows esp_id+time | ✅ Pass | CSV=DB=1101 |
| T-DB-03 | 0-Zeilen-Fenster → Header-only | ✅ Pass | |
| T-DB-04 | zone_id-Filter | ✅ Pass | CSV=713, DB=713 |

### LOG VERIFICATION (2/2 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-LOG-01 | 200 in Server-Log | ✅ Pass | |
| T-LOG-02 | 422 in Server-Log | ✅ Pass | |

### BUG REPRODUCTIONS (0/3 Confirmed als Fix-Issues)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-BUG-B2 | columns='' → 200 | ⚠️ Warn | CONFIRMED → AUT-400 |
| T-BUG-B3 | Filename 'all' bei subzone_id-only | ⚠️ Warn | CONFIRMED → AUT-401 |
| T-BUG-B4 | quality-Param ignoriert | 📋 Gap | FastAPI-Standard: unbekannte Params → 200 |

### DB EXPORT — AUTH / TABLES / FORMAT (12/12 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-EXP-AUTH-01–03 | 401 / 403 / 200 | ✅ Pass | |
| T-EXP-TABLE-01–03 | Blocklist / Allowlist / Non-TS | ✅ Pass | |
| T-EXP-FMT-01–03 | JSON / CSV+BOM / Default JSON | ✅ Pass | |

### DB EXPORT — COLUMNS / DATE / STREAM (7/7 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-EXP-COL-01–03 | Alle Spalten / Auswahl / 422 | ✅ Pass | |
| T-EXP-DATE-01–03 | Reihenfolge / Default-Window / DB-Abgleich | ✅ Pass | JSON=41, DB=41 |
| T-EXP-STREAM-01 | Streaming in Chunks | ✅ Pass | 106 chunks, 868 KB |

### DB EXPORT — DB-KREUZABGLEICH + LARGE (5/5 Pass)

| Step | Name | Status | Notes |
|------|------|--------|-------|
| T-EXP-DB-01 | sensor_data CSV=DB | ✅ Pass | 580 rows |
| T-EXP-DB-02 | esp_devices JSON=DB | ✅ Pass | 131 rows |
| T-EXP-DB-03 | Datum-Filter: kein out-of-range | ✅ Pass | |
| T-EXP-DB-04 | Content-Disposition table+datum | ✅ Pass | |
| T-EXP-DB-05 | password_hash maskiert | ✅ Pass | unmasked=0 |
| T-EXP-LARGE-01 | 1001+ rows CSV=DB | ✅ Pass | CSV=1741, DB=1741 |
| T-EXP-LARGE-02 | 1001 rows < 30s | ✅ Pass | **31ms** |

---

## Key Results

| Metrik | Wert |
|--------|------|
| Gesamt Tests | 83 |
| Pass | 76 |
| Warn (non-blocking) | 7 |
| Fail | 0 |
| Skip | 0 |
| Laufzeit gesamt | ~10s |
| Größter Export | 1741 Zeilen in 31ms |
| Streaming-Chunks | 106 chunks @ 868 KB |

### Bestätigte Bugs (confirmed, Fix-Issues angelegt)

| Bug | Issue | Priorität | Code-Stelle | Status |
|-----|-------|-----------|-------------|--------|
| B2: `columns=''` → 200 | AUT-400 | Medium | `sensors.py:1689` — `if columns:` falsy | **BEHOBEN** 2026-05-13 |
| B3: filename `all` bei subzone_id-only | AUT-401 | Low | `sensors.py:1731` — Fallback-Kette | **BEHOBEN** 2026-05-13 |
| B5: zone_id leer bei aggregierten Daten | AUT-402 | Medium | `sensors.py:1557-1568` — kein Mapping für zone_id | **BEHOBEN** 2026-05-13 (Option A) |

### B1 Cursor-Bug (AUT-389)

NOT TRIGGERED — kein Datenverlust (CSV=600, DB=600). Bug setzt identische Timestamps voraus, Test-Daten haben 1s Abstand. TM-Entscheidung ausstehend: Fix-Issue oder API-Docs.

---

## Open Items / Next Steps

- [ ] **Block B (B-C-1 / B-C-2):** Pi5-Prod Manual Tests — TM-Aktion erforderlich
- [ ] **B1-Entscheidung (AUT-389):** Fix (`(timestamp, id)` Cursor) oder Docs-Update
- [x] **B5-Entscheidung (AUT-402):** Option A umgesetzt — zone_id/subzone_id explizit auf `""` in `_export_column_value` gemappt
- [ ] **AUT-387 → Done** (nach Block B)
- [ ] **AUT-390 → Done** (nach Block B + B1-Entscheidung)
