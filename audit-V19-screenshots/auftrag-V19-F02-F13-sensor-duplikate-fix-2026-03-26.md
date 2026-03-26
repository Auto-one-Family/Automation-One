# V19-F02+F13 — Sensor-Duplikate (VPD + SHT31) beseitigen

> **Typ:** Bugfix (Backend — Sensor-Erstellung / Duplikat-Pruefung)
> **Erstellt:** 2026-03-26
> **Prioritaet:** HIGH
> **Geschaetzter Aufwand:** ~2-3h
> **Abhaengigkeit:** Keine (kann parallel zu F01 bearbeitet werden)

---

## Kontext

### SHT31 Multi-Value-Architektur

Der SHT31 ist ein I2C-Sensor der Temperatur UND Luftfeuchtigkeit gleichzeitig misst. In AutomationOne wird er als Multi-Value-Sensor behandelt:

- Die Firmware sendet EINEN Datensatz, das Backend splittet via `expand_multi_value()` in `sensor_type_registry.py`.
- `MULTI_VALUE_SENSORS` Map (Zeile 88 in `sensor_type_registry.py`) definiert: `sht31 → [sht31_temp, sht31_humidity]`.
- Fuer jeden Sub-Type wird eine eigene `sensor_configs`-Row erstellt.
- Die `sensor_configs`-Tabelle hat einen UNIQUE-Constraint `unique_esp_gpio_sensor_interface` auf `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` — das SOLLTE Duplikate verhindern, tut es aber NICHT zuverlaessig (siehe Root Cause unten).

### VPD-Sensor-Erstellung

VPD-Sensoren werden automatisch vom Backend erstellt. Wenn `_try_compute_vpd()` in `sensor_handler.py` (Zeile 582) einen VPD-Wert berechnet, prueft es per Check-then-Insert Pattern (Zeile 668-685) ob bereits eine `sensor_configs`-Row mit `sensor_type='vpd'` fuer den betreffenden ESP und GPIO existiert. Falls nicht, erstellt es automatisch eine neue Row mit `interface_type='VIRTUAL'`. Dieses Pattern ist anfaellig fuer Race Conditions bei gleichzeitigen Aufrufen.

---

## IST-Zustand

### SHT31-Duplikate (F13)
Auf Monitor L2 erscheinen fuer die Subzone "Test 2 Sub" **vier** Sensor-Cards statt zwei:
- 2x `sht31_temp (Temperatur)` — beide zeigen 22°C, beide zeigen "Veraltet", beide gehoeren zu `MOCK_24557EC6`
- 2x `sht31_humidity (Luftfeuchte)` — beide zeigen 55 %RH, identische Metadaten

Die Komponenten-Tabelle zeigt ebenfalls jeweils 2 Zeilen pro Sub-Type.

### VPD-Duplikate (F02)
Auf Monitor L2 erscheinen **zwei** "VPD (berechnet)"-Sensor-Cards fuer `MOCK_T18V6LOGIC`:
- Beide zeigen identische Werte (aktuell "0 kPa" wegen F01)
- Beide haben identische Konfiguration

---

## SOLL-Zustand

- **Genau 1** `sht31_temp`-Row und **genau 1** `sht31_humidity`-Row pro ESP + GPIO + I2C-Adresse.
- **Genau 1** `vpd`-Row pro ESP + GPIO-Kombination.
- Monitor L2 zeigt pro Subzone nur die erwarteten Sensor-Cards ohne Duplikate.
- Komponenten-Tabelle zeigt keine Duplikat-Zeilen.

---

## Root Cause: NULL-in-UNIQUE — Primaere Ursache beider Duplikat-Arten

Der UNIQUE-Constraint `unique_esp_gpio_sensor_interface` auf `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` schuetzt **NICHT** zuverlaessig vor Duplikaten, weil `onewire_address` und `i2c_address` nullable sind.

**PostgreSQL-Regel:** `NULL != NULL` — zwei Rows mit identischen Nicht-NULL-Werten aber NULL in einer der nullable Spalten verletzen den Constraint NICHT.

### Konkret:
- **VPD:** Wird mit `i2c_address=NULL`, `onewire_address=NULL` erstellt → **unbegrenzt duplizierbar**, weil der Constraint nie greift.
- **SHT31:** Beide Erstellungspfade (Mock-Erstellung in `debug.py:308`, Simulation in `services/simulation/scheduler.py:1220`) uebergeben kein `i2c_address` → SHT31-Configs bekommen `NULL` statt der tatsaechlichen I2C-Adresse `0x44`. Dadurch greift der Constraint auch hier nicht.

### Warum das die primaere Ursache ist:
Die Ursachen A-C (unten) erklaeren, WARUM der Code doppelt aufgerufen wird — aber der UNIQUE-Constraint **haette** das trotzdem abfangen muessen. Tut er aber nicht wegen NULL. Selbst wenn man die doppelten Aufrufe eliminiert, bleibt das System ohne funktionierenden Constraint anfaellig fuer zukuenftige Duplikate.

### Fix-Strategie fuer den Constraint:
**Option 1 (bevorzugt):** COALESCE im Constraint — `UNIQUE(esp_id, gpio, sensor_type, COALESCE(onewire_address, ''), COALESCE(i2c_address, ''))`. In PostgreSQL als UNIQUE INDEX mit Expression umsetzen:
```sql
CREATE UNIQUE INDEX unique_esp_gpio_sensor_interface_v2
ON sensor_configs (esp_id, gpio, sensor_type, COALESCE(onewire_address, ''), COALESCE(i2c_address, ''));
```
**Option 2:** Partial Index fuer jeden Sonderfall (komplexer, weniger robust).

**Wichtig:** VOR dem Anlegen des neuen Index muessen bestehende Duplikate bereinigt werden (aeltere Row loeschen, `sensor_data`-Referenzen pruefen — FK ist SET NULL, also sicher).

---

## Vorbedingungen

- **Docker-Stack muss laufen** fuer die DB-Analyse (SQL-Queries in Schritt 1).
- Zugriff auf die PostgreSQL-Datenbank (z.B. ueber `docker exec` oder pgAdmin).

---

## Analyse-Leitfaden

### Schritt 1: DB-Zustand pruefen

```sql
-- Alle sensor_configs fuer den betroffenen ESP
SELECT id, esp_id, gpio, sensor_type, i2c_address, interface_type, created_at
FROM sensor_configs
WHERE esp_id = '<MOCK_24557EC6_UUID>'
ORDER BY sensor_type, gpio;

-- VPD-Duplikate
SELECT id, esp_id, gpio, sensor_type, created_at
FROM sensor_configs
WHERE sensor_type = 'vpd'
ORDER BY esp_id, gpio;
```

Erwartung: Es gibt tatsaechlich doppelte Rows in der DB. Wenn ja, muss die Erstellungslogik gefixt werden. Wenn nein, liegt das Problem im Frontend (doppeltes Rendering).

### Schritt 2: Duplikat-Ursache identifizieren

**Moegliche Ursache A — Mock-ESP-Erstellung:**
Mock-ESPs werden ueber die Simulation erstellt (`SimulationScheduler` in `services/simulation/scheduler.py`). Wenn `rebuild_simulation_config()` (lebt in `esp_repo.py:855`, wird vom Scheduler aufgerufen) ausgefuehrt wird, koennte es die `sensor_configs`-Rows doppelt anlegen. Pruefe ob die Mock-Erstellungslogik den UNIQUE-Constraint korrekt beachtet oder ob sie `ON CONFLICT DO NOTHING` nutzt. **Beachte:** Wegen des NULL-in-UNIQUE-Problems (siehe oben) wuerde der Constraint selbst bei korrektem Check nicht greifen.

**Moegliche Ursache B — SHT31-Split erzeugt doppelte VPD-Berechnung (Race Condition):**
Der SHT31 hat ZWEI Sub-Types (`sht31_temp`, `sht31_humidity`). Wenn `_try_compute_vpd()` (Zeile 582) bei BEIDEN Sub-Type-Saves getriggert wird, und das Check-then-Insert Pattern (Zeile 668-685) zwischen den beiden Saves eine Race Condition hat, koennten 2 VPD-Configs entstehen. Der UNIQUE-Constraint muesste das verhindern — tut er aber NICHT, weil VPD-Configs mit `i2c_address=NULL` erstellt werden (NULL-in-UNIQUE-Problem).

**Moegliche Ursache C — Fehlender Duplikat-Check bei sensor_configs-Erstellung:**
Es gibt keinen `sensor_config_service.py` — die Erstellung laeuft direkt ueber `SensorRepository.create()` in `sensor_repo.py:32`. Pruefe ob diese Methode vor dem INSERT prueft ob bereits eine Config mit demselben `(esp_id, gpio, sensor_type)` existiert, oder ob sie sich allein auf den (wirkungslosen) UNIQUE-Constraint verlaesst.

### Schritt 3: Frontend-Seitige Duplikate ausschliessen

Pruefe ob die API `GET /api/v1/sensors/` tatsaechlich doppelte Eintraege liefert, oder ob das Frontend die Liste doppelt rendert (z.B. durch doppelten API-Call oder fehlenden Key in v-for).

---

## Vorgehen

1. **DB-Analyse:** SQL-Queries oben ausfuehren (Docker-Stack muss laufen). Feststellen ob Duplikate in der DB existieren und ob `i2c_address` NULL ist wo sie es nicht sein sollte.
2. **UNIQUE-Constraint reparieren (primaer):**
   a. Bestehende Duplikate bereinigen — aeltere Rows loeschen (`sensor_data` FK ist SET NULL, also sicher).
   b. Alembic-Migration: Alten Constraint droppen, neuen Expression-basierten UNIQUE INDEX anlegen mit COALESCE (siehe Root-Cause-Sektion).
   c. `alembic check` ausfuehren um Migration-Integritaet zu pruefen.
3. **Erstellungslogik fixen (sekundaer):**
   a. SHT31-Erstellungspfade (`debug.py:308`, `services/simulation/scheduler.py:1220`) muessen `i2c_address=0x44` korrekt uebergeben.
   b. VPD Check-then-Insert in `sensor_handler.py:668-685` absichern — entweder `ON CONFLICT DO NOTHING` oder `get_or_create` Pattern.
   c. `SensorRepository.create()` in `sensor_repo.py:32` pruefen ob dort ein Duplikat-Check stattfindet.
4. **Falls Frontend-Duplikate (nach DB-Fix pruefen):**
   a. API-Response pruefen — liefert `GET /api/v1/sensors/` noch Duplikate?
   b. Falls ja: Backend-Query fixen (DISTINCT oder GROUP BY).
   c. Falls nein: Frontend v-for Key-Binding pruefen.
5. **Verifikation:** Monitor L2 und Komponenten-Tabelle zeigen keine Duplikate mehr. Neustart erzeugt keine neuen.

---

## Relevante Dateien

| Bereich | Dateien |
|---------|---------|
| SHT31-Split | `sensor_type_registry.py` → `expand_multi_value()` (Zeile 343), `MULTI_VALUE_SENSORS` (Zeile 88) |
| VPD-Auto-Create | `sensor_handler.py` → `_try_compute_vpd()` (Zeile 582), Check-then-Insert (Zeile 668-685) |
| Mock-Erstellung | `services/simulation/scheduler.py` (`SimulationScheduler`), `debug.py:308` |
| Config-Erstellung | `sensor_repo.py:32` → `SensorRepository.create()` (kein Service-Layer) |
| Rebuild | `esp_repo.py:855` → `rebuild_simulation_config()` (vom Scheduler aufgerufen) |
| DB-Constraint | `sensor_configs` Tabelle, UNIQUE `unique_esp_gpio_sensor_interface` auf `(esp_id, gpio, sensor_type, onewire_address, i2c_address)` — **wirkungslos bei NULL** |
| Frontend Sensor-Liste | Komponenten-View, Monitor L2 Sensor-Card-Rendering |

---

## Was NICHT geaendert werden darf

- Der SHT31-Multi-Value-Split-Mechanismus selbst — `expand_multi_value()` funktioniert korrekt.
- Das `sensorId`-Format (`espId:gpio:sensorType`) — ist korrekt und zentralisiert.
- Die VPD-Berechnungslogik — nur die Config-Erstellung (Duplikat-Check) fixen.
- Bestehende `sensor_data`-Rows — Messdaten NICHT loeschen, nur doppelte `sensor_configs` bereinigen.

---

## Akzeptanzkriterien

- [ ] UNIQUE-Constraint `unique_esp_gpio_sensor_interface` durch Expression-basierten Index mit COALESCE ersetzt (Alembic-Migration)
- [ ] Bestehende Duplikat-Rows in `sensor_configs` bereinigt (aeltere Row geloescht)
- [ ] SHT31 Mock-Erstellungspfade uebergeben `i2c_address=0x44` korrekt
- [ ] VPD-Config-Erstellung nutzt `ON CONFLICT DO NOTHING` oder `get_or_create` Pattern
- [ ] Keine doppelten `sensor_configs`-Rows fuer denselben `(esp_id, gpio, sensor_type)` in der DB
- [ ] Monitor L2 zeigt pro Subzone genau 1 Card pro Sensor-Typ (nicht 2x sht31_temp, nicht 2x vpd)
- [ ] Komponenten-Tabelle zeigt keine Duplikat-Zeilen
- [ ] Neustart des Systems erzeugt KEINE neuen Duplikate
- [ ] `alembic check` und Tests ohne Fehler
