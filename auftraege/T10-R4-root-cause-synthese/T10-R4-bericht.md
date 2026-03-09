# T10-R4 Root-Cause-Synthese — Ergebnisbericht

> **Datum:** 2026-03-08
> **Input:** T10-R1 (Bug-Verifikation), T10-R2 (System-Konsistenz), T10-R3 (Tiefenanalyse), T11 (Frontend-Audit), T11-R2 (Dev-Report)
> **Methode:** Synthese aller Berichte, Root-Cause-Konsolidierung, Abhaengigkeits-Analyse, Fix-Planung
> **Output:** 18 Root-Cause-Dateien, 4 Fix-Auftraege, Abhaengigkeits-Graph

---

## Statistik

| Metrik | Wert |
|--------|------|
| Bekannte Bugs (T10-R1) | 10 |
| Neue Bugs (T10-R3) | 6 (BUG-11 bis BUG-16) |
| Neue Bugs (T11-R2) | 2 (BUG-17, BUG-18) |
| **Gesamt-Bugs** | **18** |
| Root Cause gefunden | **18/18** (100%) |
| Exakte Datei+Zeile | 11/18 (T11 Deep Analysis) |
| Kausalketten identifiziert | **3** |
| Frontend-Luecken | 4 (FL-01 bis FL-04) |

## Severity-Verteilung

| Severity | Anzahl | Bugs | Fix-Runde |
|----------|--------|------|-----------|
| CRITICAL | 4 | BUG-02, BUG-05+06, BUG-08, BUG-11 | Runde 1 |
| HIGH | 2 | BUG-01, BUG-09 | Runde 2 |
| MEDIUM | 7 | BUG-03, BUG-04, BUG-12, BUG-13, BUG-15, BUG-17 | Runde 3 |
| LOW | 3 | BUG-07, BUG-10, BUG-14 | Runde 4 |
| INFO | 2 | BUG-16, BUG-18 | Runde 4 |

---

## Kausalketten

### KETTE 1: Wokwi Timestamp-Kaskade

```
BUG-05 (ts=0 Guard fehlt)
  │
  ├──→ sensor_handler speichert created_at=1970-01-01
  │      → BUG-14 (134 Epoch-Rows in DB, unsichtbar via API)
  │
  └──→ heartbeat_handler setzt last_seen=1970-01-01
         → Maintenance setzt status="offline"
           → BUG-06 (Flicker: online→offline→online jede 30s)
             → Config-Save blockiert (403 DEVICE_NOT_APPROVED)
               → Phase 6 (T11) komplett FAIL
```

**Root Cause:** `sensor_handler.py:329` und `heartbeat_handler.py:202` haben keinen Guard fuer `ts <= 0`. Wokwi hat keinen NTP-Sync → sendet `ts=0`.

**Fix:** Server-Timestamp-Fallback wenn `ts <= 0`. Loest BUG-05, BUG-06 UND BUG-14 gleichzeitig.

### KETTE 2: OneWire Multi-Sensor Datenverlust

```
BUG-08 (scalar_one_or_none ohne onewire_address)
  │
  ├──→ MultipleResultsFound Exception (110x/30min)
  │      → DS18B20 sensor_data wird NICHT gespeichert
  │        → BUG-09 (processed_value=null, raw_mode=True Default)
  │
  ├──→ BUG-12 (2 Configs gleicher Name im Monitor-Dropdown)
  │
  └──→ Alert-Storm ("Sensordaten veraltet" + "Error Storm")
         → 14 neue Alerts/Stunde
```

**Root Cause:** `sensor_repo.py:109` filtert nur nach `(esp_id, gpio, sensor_type)` — bei 2+ DS18B20 auf gleichem GPIO liefert die Query 2 Rows. Die korrekte 4-Way-Methode `get_by_esp_gpio_type_and_onewire()` existiert bereits auf Zeile 864, wird aber nicht aufgerufen.

**Fix:** Aufrufer in sensor_handler auf 4-Way-Methode umstellen. BUG-09 braucht zusaetzlich `raw_mode` Default-Korrektur.

### KETTE 3: Unabhaengige Bugs

```
BUG-02 (DateTime ohne timezone=True)  → STANDALONE, alle Subzone-ACKs blockiert
BUG-11 (.astext auf JSON statt JSONB) → STANDALONE, Device-Delete blockiert
BUG-03 (Double-UTF8 Encoding)         → STANDALONE, kosmetisch
BUG-01 (Actuator-Geister)             → TEILWEISE → BUG-04 (Actuator nicht im UI)
BUG-15 (Ghost-Device Scheduler)       → STANDALONE, Log-Spam
```

---

## Abhaengigkeits-Graph

```
                    ┌── BUG-14 (Epoch-Rows)
BUG-05 (ts=0) ─────┤
                    └── BUG-06 (Flicker/403)

                    ┌── BUG-09 (processed null) ← auch eigener Bug (raw_mode)
BUG-08 (scalar) ───┤
                    └── BUG-12 (Duplikate Monitor)

BUG-01 (Geister) ──→ BUG-04 (Config-Panel) ← auch eigener Frontend-Bug

BUG-03 (Encoding) ──→ BUG-13 (Unit-Display) ← auch eigener Frontend-Bug

BUG-11 (Delete)  ──→ STANDALONE
BUG-02 (Datetime) ──→ STANDALONE
BUG-07 (WiFi)    ──→ STANDALONE
BUG-10 (Count)   ──→ STANDALONE
BUG-15 (Ghost)   ──→ STANDALONE
BUG-16 (Polling) ──→ STANDALONE
BUG-17 (SubzName) ──→ STANDALONE
BUG-18 (Ack-Code) ──→ STANDALONE
```

---

## Fix-Reihenfolge (nach Severity + Abhaengigkeiten)

| Prio | Bug(s) | Severity | Fix-Beschreibung | Datei:Zeile | Aufwand |
|------|--------|----------|-----------------|-------------|---------|
| **P0** | BUG-08 | CRITICAL | `onewire_address` in sensor_repo Query | `sensor_repo.py:109` | 1h |
| **P0** | BUG-05+06 | CRITICAL | ts<=0 Guard → Server-Timestamp Fallback | `sensor_handler.py:329` + `heartbeat_handler.py:202` | 30 Min |
| **P0** | BUG-11 | CRITICAL | `.astext` → `cast(col, Text)` | `notification_repo.py:621` | 15 Min |
| **P0** | BUG-02 | CRITICAL | `DateTime(timezone=True)` + Alembic | `subzone.py:128` | 45 Min |
| **P1** | BUG-01 | HIGH | Eigene Session in `_auto_push_config` | `heartbeat_handler.py:1207` | 30 Min |
| **P1** | BUG-09 | HIGH | `raw_mode` Default `True` → `False` | `sensor_handler.py:718` | 15 Min |
| **P2** | BUG-04 | MEDIUM | `subzone_id` in MockActuator + Mapper | `types/index.ts:295` + `api/esp.ts:269` | 30 Min |
| **P2** | BUG-03 | MEDIUM | Unit-Encoding-Sanitizer | `sensor_handler.py:329` | 15 Min |
| **P2** | BUG-13 | MEDIUM | Unit statt sensor_type im Display | Frontend Komponenten-View | 15 Min |
| **P2** | BUG-12 | MEDIUM | Sensor-Disambiguierung (onewire_address) | Frontend Monitor/Dropdown | 30 Min |
| **P2** | BUG-15 | MEDIUM | Scheduler-Config gegen DB validieren | `simulation/scheduler.py` | 30 Min |
| **P2** | BUG-17 | MEDIUM | Subzone-Name bei Erstellung setzen | Config-Panel → API | 30 Min |
| **P3** | BUG-10 | LOW | `Math.max()` im sensorCount | `DeviceMiniCard.vue:154` | 5 Min |
| **P3** | BUG-07 | LOW | hardware_type Filter bei RSSI | `heartbeat_handler.py:1092` | 5 Min |
| **P3** | BUG-14 | LOW | Epoch-0 DB-Cleanup (einmalig) | SQL UPDATE | 5 Min |
| **P3** | BUG-16 | INFO | Notification-Polling deduplizieren | Frontend Stores | 30 Min |
| **P3** | BUG-18 | INFO | Acknowledged-Button pruefen/aktivieren | Frontend Alert-UI | 1h |

---

## Fix-Auftraege

### Fix-Runde 1: CRITICAL Backend (BUG-08, BUG-05+06, BUG-11, BUG-02)

**Auftrag:** `auftrag-T10-Fix-R1-critical-backend-2026-03-08.md`

4 unabhaengige Backend-Fixes, koennen parallel umgesetzt werden:
- BUG-08: sensor_repo Query um onewire_address erweitern
- BUG-05+06: ts<=0 Guard in sensor_handler + heartbeat_handler
- BUG-11: notification_repo JSON→JSONB oder cast-Fix
- BUG-02: DateTime(timezone=True) + Alembic-Migration

**Geschaetzter Aufwand:** ~2.5h
**Entsperrt:** DS18B20-Datenspeicherung, Wokwi-Workflow, Device-Delete, Subzone-ACKs

### Fix-Runde 2: HIGH Backend (BUG-01, BUG-09)

**Auftrag:** `auftrag-T10-Fix-R2-high-backend-2026-03-08.md`

2 Backend-Fixes, unabhaengig voneinander:
- BUG-01: _auto_push_config eigene Session
- BUG-09: raw_mode Default auf False

**Geschaetzter Aufwand:** ~45 Min
**Entsperrt:** Actuator-Config-Push, DS18B20-Processing

### Fix-Runde 3: MEDIUM Frontend + Backend (BUG-04, BUG-03, BUG-12, BUG-13, BUG-15, BUG-17)

**Auftrag:** `auftrag-T10-Fix-R3-medium-mixed-2026-03-08.md`

6 Fixes gemischt (3 Frontend, 2 Backend, 1 Fullstack):
- BUG-04: MockActuator subzone_id (Frontend)
- BUG-03: Encoding-Sanitizer (Backend)
- BUG-12: Monitor Duplikate-Disambiguierung (Frontend)
- BUG-13: Unit-Display korrigieren (Frontend)
- BUG-15: Ghost-Device Scheduler-Cleanup (Backend)
- BUG-17: Subzone-Name bei Erstellung (Fullstack)

**Geschaetzter Aufwand:** ~2.5h
**Entsperrt:** Korrekte Actuator-Gruppierung, Unit-Anzeige, Monitor-Sauberkeit

### Fix-Runde 4: LOW + INFO Cleanup (BUG-10, BUG-07, BUG-14, BUG-16, BUG-18)

**Auftrag:** `auftrag-T10-Fix-R4-low-cleanup-2026-03-08.md`

5 kleinere Fixes:
- BUG-10: MiniCard Count korrigieren (Frontend, Einzeiler)
- BUG-07: RSSI-Filter fuer Wokwi/Mock (Backend, Einzeiler)
- BUG-14: Epoch-0 DB-Cleanup (einmaliges SQL UPDATE)
- BUG-16: Notification-Polling deduplizieren (Frontend)
- BUG-18: Acknowledged-Status pruefen (Frontend)

**Geschaetzter Aufwand:** ~1.5h

---

## Geschaetzter Gesamt-Fix-Aufwand

| Runde | Bugs | Aufwand | Blockiert |
|-------|------|---------|-----------|
| 1 (CRITICAL) | BUG-08, 05+06, 11, 02 | ~2.5h | Runde 2+3 koennen parallel |
| 2 (HIGH) | BUG-01, 09 | ~45 Min | — |
| 3 (MEDIUM) | BUG-04, 03, 12, 13, 15, 17 | ~2.5h | — |
| 4 (LOW) | BUG-10, 07, 14, 16, 18 | ~1.5h | — |
| **Gesamt** | **18 Bugs** | **~7h** | |

**P0 (CRITICAL) allein: ~2.5h** — loest die 4 schwerwiegendsten Probleme und entsperrt den Wokwi-Workflow + DS18B20-Pipeline.

---

## Root-Cause-Dateien

Alle 18 Root-Cause-Dateien liegen in:
```
.claude/reports/current/T10-R4-root-cause-synthese/root-causes/
```

| Datei | Bug | Severity | Schicht |
|-------|-----|----------|---------|
| BUG-01-actuator-geister.md | Actuator auto-re-created | HIGH | Server |
| BUG-02-datetime-crash.md | Subzone-ACK Datetime | CRITICAL | Server + DB |
| BUG-03-unit-encoding.md | Double-UTF8 | MEDIUM | Server |
| BUG-04-config-panel-actuator.md | Actuators fehlen im UI | MEDIUM | Frontend |
| BUG-05-timestamp-epoch0.md | Wokwi ts=0 | CRITICAL | Server |
| BUG-06-status-desync.md | Online/Offline Flicker | CRITICAL | Server |
| BUG-07-wifi-spam.md | Weak WiFi Log-Noise | LOW | Server |
| BUG-08-scalar-crash.md | MultipleResultsFound | CRITICAL | Server |
| BUG-09-processed-null.md | DS18B20 processed null | HIGH | Server |
| BUG-10-minicard-count.md | Pending nicht gezaehlt | LOW | Frontend |
| BUG-11-delete-device-crash.md | Device-Delete 500 | CRITICAL | Server |
| BUG-12-duplikate-monitor.md | Doppelte Sensor-Eintraege | MEDIUM | Frontend |
| BUG-13-unit-display.md | sensor_type statt unit | MEDIUM | Frontend |
| BUG-14-epoch-timestamps.md | 134 Epoch-0-Rows | LOW | Server (Daten) |
| BUG-15-ghost-device.md | MOCK_D75008E2 Ghost | MEDIUM | Server |
| BUG-16-api-polling.md | Excessive Polling | INFO | Frontend |
| BUG-17-subzone-namen-null.md | Subzone-Namen NULL | MEDIUM | Fullstack |
| BUG-18-acknowledged-toter-code.md | ISA-18.2 ungenutzt | INFO | Frontend |

---

## Naechste Schritte nach Fixes

1. **Nach Fix-Runde 1 (CRITICAL):**
   - T11-Retest: Phasen 6 (Config-Edit), 10 (Device-Delete), 11 (Log-Analyse)
   - DS18B20-Datenspeicherung verifizieren (Loki: 0 MultipleResultsFound)
   - Wokwi-Flicker verifizieren (Status stabil "online")

2. **Nach Fix-Runde 2 (HIGH):**
   - Actuator-Config-Push testen (kein "Handler returned False")
   - DS18B20 Processing verifizieren (processed_value != null)

3. **Nach Fix-Runde 3 (MEDIUM):**
   - Cross-View-Konsistenz erneut pruefen (FL-03, Monitor-Duplikate)
   - Unit-Encoding in API pruefen

4. **Nach allen Fixes:**
   - T11 Full-Stack Frontend-Audit wiederholen (alle 12 Phasen)
   - Wokwi Full-Stack DS18B20 Triple-Test (T10 Original-Auftrag)
   - Monitor-Editor Phase 5-8 fortsetzen (Roadmap)

---

## Beziehung zu bestehenden Fix-Auftraegen

Die folgenden **alten T10-Fix-Auftraege werden ERSETZT** durch die neuen Fix-Runden:

| Alter Auftrag | Ersetzt durch | Grund |
|---------------|--------------|-------|
| auftrag-T10-fixA-sensor-lookup-config-id | Fix-Runde 1 (BUG-08) | Tiefere Root-Cause-Analyse, exakte Datei+Zeile |
| auftrag-T10-fixB-delete-pipeline-config-id | Fix-Runde 1 (BUG-11) | Anderer Root Cause (.astext statt config_id) |
| auftrag-T10-fixC-config-panel-i2c-routing | Fix-Runde 3 (BUG-04, BUG-12) | Breiter Scope, Frontend-Typ-Fix |
| auftrag-T10-fixD-minicard-livepreview | Fix-Runde 4 (BUG-10) | Minimal-Fix statt Feature |
| auftrag-T10-fixE-orphan-cleanup | Fix-Runde 3 (BUG-15) + Runde 4 (BUG-14) | Aufgeteilt nach Severity |

---

*Bericht erstellt: 2026-03-08 | Synthese aus T10-R1/R2/R3 + T11 + T11-R2 | 18 Bugs, 4 Fix-Runden, 3 Kausalketten*
