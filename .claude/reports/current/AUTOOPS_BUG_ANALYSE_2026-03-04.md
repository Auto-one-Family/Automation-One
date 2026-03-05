# AutoOps Bug-Analyse – 2026-03-04 (Aktualisiert)

**Erstellt:** 2026-03-04  
**Quellen:** User-Logs, AutoOps Health-Check, Server-Logs, DB-Inspector, Code-Analyse

---

## 1. Executive Summary

| Kategorie | Anzahl | Schwere | Status |
|-----------|--------|---------|--------|
| **Behobene Bugs** | 3 | Mittel | Fix implementiert |
| **Warnungen (wiederkehrend)** | 1 | Mittel | Fix implementiert |
| **Transiente Alerts** | 4 | Info | Erwartet bei Restart |
| **Info** | 2 | Niedrig | Dokumentiert |

**Aktueller Systemstatus:** ✅ Alle Container healthy, AutoOps Health OK, DB-Inspector: Keine kritischen Befunde.

---

## 2. Behobene Bugs (Implementiert)

### BUG-001: APScheduler Job-Miss (misfire_grace_time) – **FIXED**

**Quelle:** `src/core/scheduler.py`, Logs `grep "missed"`

**Symptom:**
```
Run time of job "MaintenanceService._health_check_esps" was missed by 0:00:30.502886
Job mock_mock_MOCK_95A49FCB_heartbeat missed scheduled run
```

**Ursache:** `misfire_grace_time=30` war zu kurz. Bei Event-Loop-Blockierung (viele gleichzeitige Jobs) werden Jobs oft um 30–50 Sekunden verpasst.

**Fix:** `misfire_grace_time` von 30 auf **120 Sekunden** erhöht.

---

### BUG-002: AutoOps Sensor Data Freshness – Falscher Response-Key – **FIXED**

**Quelle:** `src/autoops/plugins/health_check.py`

**Symptom:** Health-Check meldet „No recent sensor data“ obwohl 56+ Einträge in DB.

**Ursache:** Die API `/api/v1/sensors/data` liefert `SensorDataResponse` mit Key **`readings`**, der Health-Check suchte nach `data` oder `items`.

**Fix:** `data_items = sensor_data.get("readings", sensor_data.get("data", ...))` – `readings` als primären Key verwendet.

---

### BUG-003: Debug-Fix Plugin – Gleicher Response-Key – **FIXED**

**Quelle:** `src/autoops/plugins/debug_fix.py`

**Symptom:** Debug-Fix konnte Sensor-Daten nicht korrekt auswerten.

**Fix:** Gleicher Key-Wechsel auf `readings`. Zusätzlich: `devices_without_data`-Check nur ausführen, wenn `devices_with_data` ermittelbar ist (readings mit esp_id), um False-Positives zu vermeiden.

---

## 3. Bereits behoben (historisch)

### BUG-002-DB: alert_config fehlte (2026-03-02)

**Status:** ✅ Behoben – Spalte existiert (DB-Inspector verifiziert).

---

## 4. Transiente / Design-Themen (kein Code-Fix)

### Grafana-Alerts bei Stack-Restart

**Symptom:** Während Server-Restart feuern 4–6 Alerts (Alloy, Prometheus, MQTT, Heartbeat).

**Empfehlung:** `noDataState` oder `for`-Dauer in Alert-Rules prüfen; Dokumentation für erwartetes Verhalten bei Restart.

### Sensor Data Freshness (INFO)

**Symptom:** AutoOps 7/9 Checks – einer ist INFO (kein Fehler).

**Status:** Nach BUG-002-Fix sollte Sensor Data Freshness jetzt SUCCESS liefern (8/9 oder 9/9).

---

## 5. DB-Inspector Befunde (2026-03-04)

| Check | Ergebnis |
|-------|----------|
| pg_isready | OK |
| alembic current | add_subzone_custom_data (head) |
| Orphaned sensor_configs | 0 |
| alert_config in esp_devices | Vorhanden |
| sensor_data (letzte Stunde) | 56 Einträge |

---

## 6. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `src/core/scheduler.py` | misfire_grace_time: 30 → 120 |
| `src/autoops/plugins/health_check.py` | Response-Key: data/items → readings |
| `src/autoops/plugins/debug_fix.py` | Response-Key: data/items → readings, devices_without_data-Logik angepasst |

---

## 7. Verifikation

```bash
# AutoOps Health erneut ausführen (erwartet 8/9 oder 9/9)
cd "El Servador/god_kaiser_server"
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='health', server_url='http://localhost:8000'))
print('Health:', 'OK' if result.get('all_passed') else 'ISSUES')
"
```

---

## 8. Referenzen

- **DB-Inspector:** `.claude/reports/current/DB_INSPECTOR_REPORT.md`
- **Server-Debug:** `.claude/skills/server-debug/SKILL.md`
- **DB-Inspector Skill:** `.claude/skills/db-inspector/SKILL.md`
