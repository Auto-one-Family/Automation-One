# EC-Sensor zeigt 0.00 — Lagebild 2026-05-08

**Run-ID:** ec-ista-2026-05-08  
**Datum:** 2026-05-08  
**Device:** ESP_698EB4, GPIO 33, sensor_type=ec  
**Symptom:** Dashboard zeigt EC = 0.00 µS/cm, quality=poor

---

## Root Causes (3 Schichten)

### RC-1: Hardware — ADC liest raw=0.0 (primär)

```
[Pi-Enhanced] SUCCESS: esp_id=ESP_698EB4, gpio=33, sensor_type='ec'
  → raw=0.0 → processed=0.0 µS/cm, quality=poor
```

Der ESP_698EB4 sendet seit mindestens 30 Minuten raw=0.0 für GPIO33.
Ursache: DFR0300 EC-Probe nicht in Flüssigkeit getaucht oder Verkabelungsproblem (ADC liest 0V).
Mit raw=0.0 gilt: `voltage = 0V → EC = slope * 0V + 0 = 0.0` unabhängig von Kalibrierung.

**Operator-Aktion nötig:** EC-Probe in Kalibrierlösung / Messlösung tauchen.

### RC-2: Keine Kalibrierung gespeichert (sekundär)

```sql
SELECT esp_id, gpio, sensor_type, calibration_data FROM sensor_configs WHERE sensor_type='ec';
-- calibration_data = null
```

Ohne Kalibrierung verwendet der Prozessor den Default-Slope (6060 µS/cm/V).
Kalibrierung war nötig, konnte aber nicht abgeschlossen werden wegen RC-3.

### RC-3: CONFIG_PENDING_AFTER_RESET blockiert Kalibrierungsbefehle (Firmware-Bug)

```
[CONFIG] Pending exit blocked: MISSING_ACTUATORS (sensors=2, actuators=0, offline_rules=0)
[ADMISSION] Sensor command rejected: CONFIG_PENDING_AFTER_RESET
```

`runtime_readiness_policy.cpp` hatte `require_actuator = true`. ESP_698EB4 ist ein
Sensor-only-Device (nur GPIO32=pH + GPIO33=EC, keine Aktoren). Die Config-Pending-Exit-Logik
hat die 0-Aktoren als Fehler gewertet und den ESP in CONFIG_PENDING gehalten.
Alle `measure`-Befehle über `/api/v1/sensors/ESP_698EB4/33/measure` liefen in 503.

---

## Code-Inkonsistenzen (aktueller Fix 6dea3d91 — Nacharbeit)

### CI-1: Falsche Docstrings in calibration_service.py

`_compute_ec_1point` sagte `"Formula: EC = cell_factor * raw_value"` —
tatsächliche Implementierung berechnet aber `EC = slope * voltage + offset` (Voltage-basiert).

`_compute_ec_2point` sagte `"Formula: EC = slope * raw + offset"` —
tatsächliche Implementierung berechnet `EC = slope * voltage + offset`.

### CI-2: Duplizierte ADC-Konstanten mit inkonsistenten Namen

Drei Stellen im selben Modul definierten dieselben Werte lokal mit unterschiedlichen Namen:
- `_compute_ph_2point`: `_ADC_MAX = 4095.0`, `_VOLTAGE_RANGE = 3.3`
- `_compute_ec_1point`: `ADC_MAX_12BIT = 4095.0`, `ADC_VOLTAGE_3V3 = 3.3`
- `_compute_ec_2point`: `ADC_MAX_12BIT = 4095.0`, `ADC_VOLTAGE_3V3 = 3.3`

---

## Durchgeführte Fixes

### FIX-1: `El Trabajante/src/services/config/runtime_readiness_policy.cpp`

```cpp
// Vorher
policy.require_actuator = true;

// Nachher  
policy.require_actuator = false;
// Sensor-only devices (e.g. EC/pH probes without actuators) are valid configurations.
```

**Effekt:** ESP_698EB4 kann jetzt CONFIG_PENDING verlassen wenn ≥1 Sensor konfiguriert ist.
Kalibrierungsbefehle werden nicht mehr mit 503 abgelehnt.

### FIX-2: `El Servador/god_kaiser_server/src/services/calibration_service.py`

Modul-Level-Konstanten ergänzt:
```python
_ADC_MAX = 4095.0
_ADC_VOLTAGE = 3.3
```

Alle drei Kalibrierfunktionen (pH + EC 1-point + EC 2-point) nutzen jetzt diese
gemeinsamen Konstanten statt lokaler Magic Numbers.

Docstrings in `_compute_ec_1point` und `_compute_ec_2point` korrigiert:
- Formel auf `EC = slope * voltage + offset` aktualisiert
- Validierungsbereich auf `[0.1, 5.0]` aktualisiert

---

## Verifikation

| Check | Ergebnis |
|-------|----------|
| `pio run -e esp32_dev` | SUCCESS |
| `ruff check src/` | All checks passed |

---

## Operator-Handlungsschritte

1. **ESP_698EB4 neu flashen** (nach `pio run -e esp32_dev` Build auf diesem Branch)
2. **EC-Probe in Kalibrierlösung tauchen** (z.B. 1413 µS/cm KCl)
3. **Kalibrierung starten** (1-point ec_1point via Frontend SensorConfigPanel)
4. **Kalibrierung abschließen** — Kalibrierungsergebnis wird in `calibration_data` gespeichert
5. **Regelmäßige EC-Messung live prüfen** — raw > 0.0 erwartet bei eingetauchter Probe
