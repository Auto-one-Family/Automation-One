# Auftrag PB-01: VPD-Widget — Zeitreihe + Backend-Persistierung

**Ziel-Repo:** auto-one
**Kontext:** VPD (Vapor Pressure Deficit) ist der Leit-Parameter im professionellen Gartenbau. AutomationOne hat SHT31-Daten (Temperatur + Luftfeuchtigkeit) und berechnet VPD bereits als Momentaufnahme in `zone_kpi_service.py`, persistiert ihn aber nicht. Damit ist keine Zeitreihe moeglich. Das ist die groesste Luecke gegenueber Profi-Tools wie AROYA oder Pulse Pro.
**Bezug:** Editor Phase B — Analyseauftraege (PB-01, erstes Feature nach D1-D4 Abschluss)
**Prioritaet:** Hoch
**Datum:** 2026-03-26
**Status:** ERLEDIGT (2026-03-26) — ruff check + vue-tsc + npm build BESTANDEN

### Implementierungs-Abweichungen vom Auftrag

| Punkt | Auftrag | Implementierung | Begruendung |
|-------|---------|-----------------|-------------|
| GPIO fuer VPD | `gpio=0` hardcoded | GPIO vom Trigger-Sensor uebernommen | SHT31 temp+humidity teilen gleichen GPIO — korrekt unabhaengig vom GPIO-Wert |
| data_source | `DataSource.PRODUCTION` hardcoded | Vom Original-Sensor uebernommen (production/mock/test) | Mock-Daten erzeugen Mock-VPD — konsistenter |
| processing_mode | nicht spezifiziert | `"computed"` | Macht VPD als berechneten Wert erkennbar |
| Block 7 (Sensor-Dropdown) | Zwei Optionen (Frontend/Backend) | Backend-Ansatz: SensorConfig-Row automatisch erstellt (`interface_type='VIRTUAL'`) | Keine Frontend-Aenderung in useSensorOptions noetig |

---

## Ist-Zustand

- **Backend:** `zone_kpi_service.py` berechnet VPD live aus letzten Sensorwerten. Ergebnis geht nur in Zone-KPI-Antwort — keine `sensor_data`-Row, keine Zeitreihe.
- **Frontend:** Kein VPD-Widget im Editor. VPD erscheint nur als KPI-Zahl in Zone-Tiles (MonitorView L1) — nicht konfigurierbar, nicht historisch.
- **SHT31 Multi-Value:** `expand_multi_value()` in `sensor_type_registry.py` splittet SHT31 in `sht31_temp` + `sht31_humidity`. Beide Zeitreihen liegen in `sensor_data`. Das sind die Eingangswerte fuer die VPD-Berechnung.
- **Widget-System:** 9 Widget-Typen mit 4-Stellen-Registrierung. Bestehende Widget-Typen (`historical-chart`, `gauge`, `line-chart`, `multi-sensor`) koennen VPD-Daten anzeigen sobald VPD als `sensor_data`-Row mit `sensor_type='vpd'` gespeichert wird. KEIN neuer Widget-Typ noetig.
- **Server-Aggregation:** Das Backend unterstuetzt `resolution`-Parameter (1m/5m/1h/1d) fuer alle `sensor_data`-Abfragen. Dieses Feature funktioniert fuer VPD ohne Anpassung, sobald VPD persistiert wird.
- **WebSocket:** Das `sensor_data` Event-System propagiert Daten ans Frontend. **ACHTUNG:** Der WS-Broadcast in `sensor_handler.py` (Zeile ~459-494) passiert innerhalb `handle_sensor_data()` fuer den ORIGINALEN Sensor. Ein VPD-Hook muss den WS-Broadcast **separat** triggern — er wird nicht automatisch durch `save_data()` ausgeloest.

---

## Was getan werden muss

VPD soll bei jedem eingehenden SHT31-Datenpunkt event-driven berechnet, als `sensor_data`-Row persistiert und damit in allen bestehenden Widgets anzeigbar sein. Das Frontend braucht dafuer nur einen neuen Eintrag in `sensorDefaults.ts` und Box-Annotations im `HistoricalChart`.

**Ziel aus Nutzersicht:** Im Dashboard-Editor einen VPD-Zeitverlauf (HistoricalChart) oder Gauge-Widget konfigurieren, genau wie bei Temperatur oder CO2. Der Sensor-Dropdown zeigt VPD unter dem jeweiligen ESP. VPD-Zonen (zu niedrig / optimal / zu hoch) sind als farbige Hintergrundbaender im Chart sichtbar.

---

## Architektur-Entscheidung: Server-Persistierung (Option A)

VPD wird als `sensor_data`-Row gespeichert — identisch zu physischen Sensoren. Begruendung:

- Alle bestehenden Widget-Typen, REST-Endpoints, Server-Aggregation und WebSocket-Events funktionieren sofort ohne Anpassung.
- Die `sensor_data`-Tabelle hat ein `data_source`-Feld (Enum: `PRODUCTION`, `MOCK`, `TEST`, `SIMULATION`). VPD wird mit `data_source=DataSource.PRODUCTION` gespeichert — VPD ist aus Produktionsdaten abgeleitet, kein Mock/Test. Die Identifikation als berechneter Wert erfolgt ueber `sensor_type='vpd'` (kein physischer Sensor hat diesen Typ). **Kein neuer Enum-Wert, keine Alembic-Migration.**
- `gpio=0` ist der etablierte Fallback fuer virtuelle/I2C-Sensoren. `gpio=0` wird bei `subzone_configs.assigned_gpios` ignoriert — kein Seiteneffekt.
- Der UNIQUE-Constraint `(esp_id, gpio, sensor_type, timestamp)` verhindert Duplikate. Duplikate werden via IntegrityError catch + rollback behandelt (bestehendes Pattern in `save_data()`).
- Event-driven ist effizienter als ein periodischer Background-Service: VPD wird nur berechnet wenn tatsaechlich neue T/RH-Daten eingehen.

**Nicht gewaehlt:** Option B (On-the-fly API) — nicht mit bestehenden Widgets kompatibel. Option C (Frontend-Berechnung) — doppelter Datentransfer, Komplexitaet im Widget.

---

## Technische Details

**Betroffene Schichten:**
- [x] Backend (El Servador) — neue Datei + Hook in sensor_handler + Refactor zone_kpi_service
- [ ] Firmware (El Trabajante) — KEIN CHANGE. VPD ist reine Backend-Berechnung.
- [x] Frontend (El Frontend) — sensorDefaults.ts + HistoricalChart Box-Annotations
- [ ] Monitoring — KEIN CHANGE

---

## Block 1: Backend — VPD Calculator Modul

**Datei:** `src/services/vpd_calculator.py` (NEU)

Extrahiere die VPD-Berechnung aus `zone_kpi_service.py` in ein eigenstaendiges Modul. Damit gibt es keine Logik-Duplikation wenn `zone_kpi_service.py` weiterhin VPD fuer die Momentaufnahme braucht.

**VPD-Formel (Air-VPD, Magnus-Tetens):**
```
SVP(T) = 0.6108 * exp((17.27 * T) / (T + 237.3))   [kPa]
AVP(T, RH) = SVP(T) * (RH / 100)
VPD = SVP(T) - AVP(T, RH)
```

Kein Leaf-Offset. Leaf-VPD (braucht Blatttemperatur-Scattersensor) ist Phase C.

**Implementierung:**

```python
# src/services/vpd_calculator.py

import math

def calculate_vpd(temperature_c: float, humidity_rh: float) -> float | None:
    """
    Calculate Air-VPD (Vapor Pressure Deficit) using Magnus-Tetens formula.
    Returns VPD in kPa, or None if inputs are out of plausible range.
    Inputs:
        temperature_c: air temperature in degrees Celsius
        humidity_rh:   relative humidity in percent (0-100)
    """
    if not (0 <= humidity_rh <= 100):
        return None
    if not (-40 <= temperature_c <= 80):
        return None
    svp = 0.6108 * math.exp((17.27 * temperature_c) / (temperature_c + 237.3))
    avp = svp * (humidity_rh / 100.0)
    vpd = svp - avp
    return round(vpd, 4)
```

**Einschraenkungen:**
- Nur diese eine Funktion in dieser Datei. Kein Import-Overhead, kein Klassen-Overhead.
- Kein Logging in dieser Funktion — der Aufrufer loggt.

---

## Block 2: Backend — sensor_handler.py Hook

**Datei:** `src/mqtt/handlers/sensor_handler.py`

Der `SensorDataHandler` verarbeitet eingehende MQTT-Sensor-Nachrichten in der Methode `handle_sensor_data()` (Zeile ~119-530). **ACHTUNG:** Es gibt keine `_process_sensor_data()` Methode — der gesamte Flow laeuft in `handle_sensor_data()`.

**Einfuegepunkt:** Der VPD-Hook wird **nach Step 9 (save_data, Zeile ~380-397)** und **vor dem WebSocket-Broadcast (Zeile ~459)** eingefuegt. Zu diesem Zeitpunkt sind `esp_device.id` (UUID) und `esp32_timestamp` bereits verfuegbar.

**Wichtig — sensor_handler importiert SensorRepository bereits.** Kein neuer Import fuer den Repo-Zugriff noetig. Neuer Import: `from src.services.vpd_calculator import calculate_vpd`.

**Hook-Logik (Pseudocode):**

```python
# Nach save_data() fuer den aktuellen Sensor (Zeile ~397), vor WebSocket-Broadcast (Zeile ~459):
if sensor_type in ('sht31_temp', 'sht31_humidity'):
    await self._try_compute_vpd(esp_device, timestamp, session)

async def _try_compute_vpd(
    self,
    esp_device,          # esp_device Objekt (hat .id als uuid.UUID)
    timestamp: datetime,
    session: AsyncSession
):
    """Attempt to compute and persist VPD if both T and RH are available."""

    # --- Werte lesen ---
    # ACHTUNG: get_latest_value() existiert NICHT.
    # Verwende get_latest_reading(esp_id: UUID, gpio: int, sensor_type: str)
    # Die Methode gibt Optional[SensorData] zurueck, nicht float.
    temp_reading = await sensor_repo.get_latest_reading(
        esp_id=esp_device.id,   # uuid.UUID, NICHT str!
        gpio=0,
        sensor_type='sht31_temp'
    )
    rh_reading = await sensor_repo.get_latest_reading(
        esp_id=esp_device.id,
        gpio=0,
        sensor_type='sht31_humidity'
    )

    if temp_reading is None or rh_reading is None:
        return  # Noch kein Wertepaar — stille skippen

    # --- Max-Age-Check (60 Sekunden) ---
    # get_latest_reading() hat KEINEN max_age_seconds Parameter.
    # Manueller Timestamp-Vergleich:
    max_age = timedelta(seconds=60)
    if (timestamp - temp_reading.timestamp) > max_age:
        return  # Temperatur zu alt
    if (timestamp - rh_reading.timestamp) > max_age:
        return  # Feuchte zu alt

    # --- VPD berechnen ---
    # .processed_value extrahieren (nicht .raw_value — processed ist kalibriert)
    vpd = calculate_vpd(
        temperature_c=temp_reading.processed_value,
        humidity_rh=rh_reading.processed_value
    )
    if vpd is None:
        return  # Plausibilitaetsfehler

    # --- Speichern ---
    # save_data() nimmt Keyword-Argumente, KEIN Pydantic-Model (SensorDataCreate existiert nicht).
    # esp_id ist uuid.UUID (esp_device.id), NICHT der String esp_id_str.
    # Felder: raw_value + processed_value (NICHT "value").
    await sensor_repo.save_data(
        esp_id=esp_device.id,     # uuid.UUID
        gpio=0,
        sensor_type='vpd',
        raw_value=vpd,            # VPD hat keine Kalibrierung → raw == processed
        processed_value=vpd,
        unit='kPa',
        data_source=DataSource.PRODUCTION,  # Enum aus enums.py, NICHT String
        timestamp=timestamp,
    )
    # Duplikate: save_data() behandelt IntegrityError intern (catch + rollback)

    # --- WebSocket-Broadcast ---
    # ACHTUNG: Der WS-Broadcast in sensor_handler.py (Zeile ~459-494) passiert
    # innerhalb handle_sensor_data() fuer den ORIGINALEN Sensor, NICHT automatisch
    # fuer den hier gespeicherten VPD-Wert. Der VPD-Hook muss den WS-Broadcast
    # SEPARAT triggern. Verwende den gleichen WebSocket-Manager wie handle_sensor_data():
    await ws_manager.broadcast_sensor_data(
        esp_id=str(esp_device.id),
        gpio=0,
        sensor_type='vpd',
        value=vpd,
        unit='kPa',
        timestamp=timestamp
    )
```

**Prioritaet der Eingangswerte (V1 — nur SHT31):**
- Temperatur: `sht31_temp` (gpio=0). Kein Fallback auf bmp280/ds18b20 in V1.
- Feuchte: `sht31_humidity` (gpio=0). Kein Fallback auf bmp280 in V1.
- Wenn kein Wertepaar verfuegbar: VPD stille skippen (kein Error-Log, nur Debug).
- Fallback auf bmp280_temp/ds18b20 ist eine optionale Erweiterung fuer V2.

**Kritische Regeln:**
- **UNIQUE-Constraint:** `(esp_id, gpio, sensor_type, timestamp)`. Duplikate werden via IntegrityError catch + rollback behandelt (bestehendes Pattern in `save_data()`).
- **esp_id Typ:** `uuid.UUID` Objekt aus `esp_device.id`, NICHT der String `esp_id_str`. Die gesamte Repository-Schicht arbeitet mit UUID-Objekten.
- **DataSource Enum:** `DataSource.PRODUCTION` aus `src/db/enums.py`. Die 4 gueltigen Werte sind: `PRODUCTION`, `MOCK`, `TEST`, `SIMULATION`. Es gibt KEIN `COMPUTED`.

**Einschraenkungen:**
- Kein neuer Background-Service. Event-driven: Hook laeuft im selben Request-Kontext wie die Sensor-Verarbeitung.
- Keine zusaetzlichen MQTT-Topics.
- Kein Firmware-Code anfassen. VPD ist 100% Backend.
- WebSocket-Broadcast muss SEPARAT getriggert werden (siehe Pseudocode oben).

---

## Block 3: Backend — zone_kpi_service.py Refactor

**Datei:** `src/services/zone_kpi_service.py`

Der Service hat aktuell eine `_calculate_vpd`-Methode (oder inline-Logik). Diese soll auf `vpd_calculator.calculate_vpd()` umgestellt werden.

**IST:** Inline-Formel oder private Methode in `zone_kpi_service.py`
**SOLL:** Import und Aufruf von `vpd_calculator.calculate_vpd(temperature_c, humidity_rh)`

Das ist ein reines Refactoring — kein Verhalten aendert sich. Der Zone-KPI zeigt danach exakt den gleichen VPD-Wert wie vorher. Die Momentaufnahme im Zone-Tile bleibt erhalten.

---

## Block 4: Backend — sensor_type_registry.py (Optional, empfohlen)

**Datei:** `src/sensors/sensor_type_registry.py`

Pruefe ob `SENSOR_TYPE_MAPPING`, `MULTI_VALUE_SENSORS` oder `SENSOR_TYPE_MOCK_DEFAULTS` Eintraege fuer `vpd` benoetigen.

**Empfehlung:** Einen Mock-Default-Wert eintragen damit Simulation funktioniert.

**ACHTUNG:** Die Struktur von `SENSOR_TYPE_MOCK_DEFAULTS` ist `Dict[str, Dict[str, object]]`, NICHT `Dict[str, float]`. Jeder Eintrag ist ein Dict mit `raw_value` und `unit`:

```python
SENSOR_TYPE_MOCK_DEFAULTS = {
    ...
    'vpd': {"raw_value": 1.0, "unit": "kPa"},  # Optimaler Bereich
}
```

Vergleich mit bestehendem Eintrag: `'sht31_temp': {"raw_value": 22.0, "unit": "°C"}` — gleiches Pattern.

`vpd` gehoert NICHT in `MULTI_VALUE_SENSORS` (kein Split-Sensor).
`vpd` gehoert NICHT in `MULTI_VALUE_TYPES` — es ist ein berechneter Single-Value.

---

## Block 5: Frontend — sensorDefaults.ts

**Datei:** `src/utils/sensorDefaults.ts` (oder vergleichbare Datei mit `SENSOR_TYPE_CONFIG`)

Fuege einen neuen Eintrag fuer `vpd` in `SENSOR_TYPE_CONFIG` hinzu. Dieses Objekt definiert Label, Einheit, Min/Max und Icon pro Sensor-Typ. Ohne diesen Eintrag erscheint VPD im Dropdown ohne Beschriftung/Einheit.

**IST:** Kein `vpd`-Eintrag vorhanden.
**SOLL:** Neuer Eintrag. **ACHTUNG:** Das Interface `SensorTypeConfig` in `sensorDefaults.ts` (Zeile ~10-49) hat Pflichtfelder die ueber label/unit/min/max hinausgehen: `decimals` (number), `defaultValue` (number), `category` (SensorCategoryId). `description` ist optional.

```typescript
vpd: {
  label: 'VPD',
  unit: 'kPa',
  min: 0.0,
  max: 3.0,
  decimals: 2,          // PFLICHT — 2 Nachkommastellen (z.B. "0.95 kPa")
  defaultValue: 1.0,    // PFLICHT — Standardwert fuer Simulation/Platzhalter
  category: 'air',      // PFLICHT — SensorCategoryId: VPD ist Luft-Klima-Parameter
  icon: 'Droplets',     // Lucide-Icon — passt zu Dampfdruck/Feuchtigkeit
  description: 'Vapor Pressure Deficit',  // Optional
},
```

**Warum min=0, max=3:** VPD unter 0 ist physikalisch unmoeglich. Ueber 3 kPa sind selbst Wuestenklimate. Fuer Gartenbau-Kontext (0-2 kPa) ist das ein sinnvoller Display-Bereich.

**Case-Sensitivity:** Bestehende Keys in `SENSOR_TYPE_CONFIG` nutzen gemischte Schreibweise (z.B. `'DS18B20'`, `'sht31_temp'`). VPD wird als `'vpd'` (lowercase) eingetragen, da der Server `sensor_type.lower()` normalisiert.

---

## Block 6: Frontend — HistoricalChart.vue Box-Annotations

**Datei:** `src/components/charts/HistoricalChart.vue`

Wenn `sensor_type === 'vpd'`, sollen farbige Hintergrundbaender (Box-Annotations) die VPD-Zonen markieren. `chartjs-plugin-annotation` v3.1.0 ist bereits installiert und registriert.

**VPD-Zonen (Default, ohne Wachstumsphasen-Kontext):**
| Zone | Von | Bis | Farbe | Bedeutung |
|------|-----|-----|-------|-----------|
| zu niedrig | 0.0 | 0.4 kPa | rot (alpha 0.08) | Kondenswasser, Pilzrisiko |
| niedrig | 0.4 | 0.8 kPa | gelb (alpha 0.08) | suboptimal |
| optimal | 0.8 | 1.2 kPa | gruen (alpha 0.10) | Zielbereich Standard |
| hoch | 1.2 | 1.6 kPa | gelb (alpha 0.08) | suboptimal |
| zu hoch | 1.6 | 3.0 kPa | rot (alpha 0.08) | Trockenstress |

**Implementierung (Box-Annotation fuer jede Zone):**

```typescript
// Computed: VPD-Zonen-Annotations — nur aktiv wenn sensor_type === 'vpd'
const vpdZoneAnnotations = computed(() => {
  if (props.sensorType !== 'vpd') return {}
  return {
    vpdZoneLow: {
      type: 'box' as const,
      yMin: 0.0, yMax: 0.4,
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 0,
      label: { display: false }
    },
    vpdZoneSubLow: {
      type: 'box' as const,
      yMin: 0.4, yMax: 0.8,
      backgroundColor: 'rgba(234,179,8,0.08)',
      borderWidth: 0,
      label: { display: false }
    },
    vpdZoneOptimal: {
      type: 'box' as const,
      yMin: 0.8, yMax: 1.2,
      backgroundColor: 'rgba(34,197,94,0.10)',
      borderWidth: 0,
      label: { display: false }
    },
    vpdZoneSubHigh: {
      type: 'box' as const,
      yMin: 1.2, yMax: 1.6,
      backgroundColor: 'rgba(234,179,8,0.08)',
      borderWidth: 0,
      label: { display: false }
    },
    vpdZoneHigh: {
      type: 'box' as const,
      yMin: 1.6, yMax: 3.0,
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderWidth: 0,
      label: { display: false }
    }
  }
})
```

Die `vpdZoneAnnotations` werden mit den bestehenden `annotations` (Threshold-Lines) gemergt:
```typescript
annotations: { ...buildAnnotations(config), ...vpdZoneAnnotations.value }
```

**Wichtige Regel — Annotations beeinflussen die Y-Achse nicht:** Box-Annotations strecken die Y-Achse nicht auf `yMax: 3.0` wenn die echten Daten nur bis 1.5 gehen. Die Y-Achse bleibt daten-basiert (Chart.js auto-scaling). Deshalb darf `suggestedMin`/`suggestedMax` der Y-Achse NICHT auf die Box-Grenzen gesetzt werden — nur auf den Datenbereich.

**Design-Token-Regel:** AutomationOne nutzt semantische CSS-Token-Prefixes (`--color-*`, `--glass-*`, `--space-*`). Es gibt KEIN `--ao-*` Prefix. Die rgba-Werte direkt im JS-Config-Objekt sind korrekt (Chart.js erwartet CSS-Werte, keine Token-Referenzen im JS).

---

## Block 7: Frontend — useSensorOptions.ts (ZWINGEND)

**Datei:** `src/composables/useSensorOptions.ts`

**Kritischer Befund: Block 7 ist NICHT optional — er ist zwingend erforderlich.**

**Problem:** `useSensorOptions.ts` baut den Sensor-Dropdown aus `device.sensors` auf — das sind Eintraege aus der `sensor_configs` DB-Tabelle (SensorConfig), NICHT aus `sensor_data`. VPD hat keinen physischen Sensor und damit keine SensorConfig in der DB. Das bedeutet: Auch wenn der Backend-Hook (Block 2) korrekt VPD-Rows in `sensor_data` speichert, erscheint VPD **NICHT** automatisch im Sensor-Dropdown.

**Loesung — Virtuelle Sensoren in useSensorOptions.ts:**

Das Composable muss um "virtuelle Sensoren" erweitert werden. Wenn ein ESP VPD-Daten in `sensor_data` hat (erkennbar an `sensor_type='vpd'`), soll VPD als auswaehlbare Option im Dropdown erscheinen — auch ohne SensorConfig.

**Implementierungsansaetze (Agent waehlt den passenden):**

1. **Frontend-Ansatz:** Nach dem Laden der physischen Sensoren aus `device.sensors` pruefen ob fuer diesen ESP VPD-Daten existieren (z.B. via neuen API-Call oder vorhandene `sensor_data` Query). Falls ja: VPD als virtuelle Option in die `groupedSensorOptions` einfuegen.

2. **Backend-Ansatz (bevorzugt, weniger Frontend-Komplexitaet):** Der Backend-Hook (Block 2) erstellt beim ersten VPD-Speichern auch eine `sensor_configs`-Row fuer VPD:
   - `esp_id` = ESP UUID
   - `gpio` = 0
   - `sensor_type` = 'vpd'
   - `sensor_name` = 'VPD (berechnet)'
   - `is_active` = true
   Damit erscheint VPD automatisch in `device.sensors` → `useSensorOptions` braucht keine Aenderung.
   **ACHTUNG:** Pruefe ob die SensorConfig-Erstellung Seiteneffekte hat (z.B. Heartbeat-Mismatch-Check, Subzone-Zuordnung). `sensor_configs` mit `gpio=0` sollte sicher sein (wird bei assigned_gpios ignoriert).

**sensorId-Format:** Alle 6 Widgets nutzen 3-teilige IDs `espId:gpio:sensorType`. VPD wird damit als `ESP_472204:0:vpd` adressiert. Das ist konsistent mit dem bestehenden System (gpio=0 ist der etablierte Wert fuer I2C-Sensoren).

---

## Betroffene Dateien (Zusammenfassung)

### Backend
| Datei | Aenderung |
|-------|----------|
| `src/services/vpd_calculator.py` | NEU — `calculate_vpd(temperature_c, humidity_rh) -> float | None` |
| `src/mqtt/handlers/sensor_handler.py` | Hook nach sht31_temp/sht31_humidity Verarbeitung → `_try_compute_vpd()` |
| `src/services/zone_kpi_service.py` | Refactor: `_calculate_vpd` → Import `vpd_calculator.calculate_vpd()` |
| `src/sensors/sensor_type_registry.py` | Optional: `SENSOR_TYPE_MOCK_DEFAULTS['vpd'] = {"raw_value": 1.0, "unit": "kPa"}` |

### Frontend
| Datei | Aenderung |
|-------|----------|
| `src/utils/sensorDefaults.ts` | Neuer Eintrag `vpd: { label, unit, min, max, decimals, defaultValue, category, icon }` |
| `src/components/charts/HistoricalChart.vue` | VPD Box-Annotations via `chartjs-plugin-annotation` (type: 'box') |
| `src/composables/useSensorOptions.ts` | **ZWINGEND:** Virtuelle VPD-Sensoren im Dropdown (useSensorOptions liest aus SensorConfig, nicht sensor_data) |

### Nicht anfassen
- Keine Firmware-Dateien
- Keine DB-Migration (kein Schema-Change, DataSource bleibt `PRODUCTION`)
- Keine neuen Widget-Typen (bestehende HistoricalChart, Gauge, MultiSensor reichen)
- Keine neuen REST-Endpoints (alle bestehenden Sensor-Data-Endpoints funktionieren fuer VPD)
- `chartjs-chart-matrix` NICHT installieren (VPD-Heatmap ist Phase C)

---

## Akzeptanzkriterien

### Backend
- [ ] `vpd_calculator.calculate_vpd(21.0, 60.0)` gibt `0.8322` kPa (+-0.01) zurueck
- [ ] `vpd_calculator.calculate_vpd(21.0, 110.0)` gibt `None` zurueck (RH > 100)
- [ ] Nach einem SHT31-MQTT-Event existiert eine neue `sensor_data`-Row mit `sensor_type='vpd'`, `gpio=0`, `data_source=DataSource.PRODUCTION`, `raw_value=<vpd>`, `processed_value=<vpd>` fuer den betroffenen ESP
- [ ] Kein Duplikat-Fehler bei zwei aufeinanderfolgenden SHT31-Events mit gleichem Timestamp (IntegrityError catch + rollback greift)
- [ ] `zone_kpi_service.py` berechnet VPD via `vpd_calculator.calculate_vpd()` — Formel ist nicht mehr dupliziert
- [ ] Wenn nur `sht31_temp` eingeht (noch kein `sht31_humidity`): kein Error-Log, kein Absturz, VPD stille geskippt
- [ ] VPD-Row wird mit `esp_device.id` (uuid.UUID) gespeichert, nicht mit dem String `esp_id_str`
- [ ] WebSocket-Broadcast fuer VPD wird separat getriggert (nicht automatisch durch save_data)

### Frontend
- [ ] `SENSOR_TYPE_CONFIG['vpd']` existiert mit `unit: 'kPa'`, `min: 0`, `max: 3`, `decimals: 2`, `defaultValue: 1.0`, `category: 'air'`
- [ ] Ein HistoricalChart-Widget mit `sensorType='vpd'` zeigt 5 farbige Hintergrundbaender (rot/gelb/gruen/gelb/rot)
- [ ] Die Y-Achse des Charts skaliert nach den echten VPD-Daten (0.8-1.2), NICHT nach dem Box-Annotation-Maximum (3.0)
- [ ] VPD erscheint im Sensor-Dropdown des WidgetConfigPanel unter dem ESP der SHT31-Daten liefert (Block 7 — useSensorOptions)
- [ ] Ein bestehendes Gauge-Widget kann VPD anzeigen (kein extra Code noetig — nur Sensor auswaehlen)

### End-to-End
- [ ] SHT31-Sensor sendet Daten → VPD wird berechnet → VPD erscheint in `sensor_data` → **separater** WebSocket-Broadcast → Dashboard-Chart aktualisiert sich live

---

## Empfohlene Ausfuehrungs-Reihenfolge

1. Block 1 (vpd_calculator.py) — Basis fuer alle anderen Bloecke
2. Block 3 (zone_kpi_service.py Refactor) — nutzt Block 1, kein Risiko
3. Block 2 (sensor_handler.py Hook) — nutzt Block 1, Kern-Feature. Inkl. separater WS-Broadcast.
4. Block 7 (useSensorOptions.ts) — **ZWINGEND**, sonst erscheint VPD nicht im Dropdown
5. Block 4 (sensor_type_registry.py) — optional, kann parallel
6. Block 5 (sensorDefaults.ts) — unabhaengig vom Backend
7. Block 6 (HistoricalChart.vue) — unabhaengig vom Backend, nutzt Block 5

---

## Nicht in diesem Auftrag

- Leaf-VPD (braucht Blatttemperatur-Offset via externen Temperatursensor)
- VPD-Heatmap (`chartjs-chart-matrix`, Phase C)
- Wachstumsphasen-System (Growth-Phase per Zone, Phase C)
- DLI, GDD, Dew Point (Phase C)
- VPD-basierte Automations-Regeln in der Logic Engine (separater Auftrag)
- Alarmierung auf VPD-Ausreisser (separater Auftrag)

---

## Offene Punkte

- **Sensor-Lookup-Performance:** `_try_compute_vpd()` macht einen DB-Read (`get_latest_reading()`) pro eingehenden SHT31-Wert. Bei hoeher taktendem System (>1/s) koennte das ein Bottleneck werden. Falls beobachtet: In-Memory-Cache fuer letzten T/RH-Wert pro ESP einfuehren (max 60s TTL).
- **Fallback-Sensoren:** V1 unterstuetzt nur `sht31_temp` + `sht31_humidity`. Fallback auf bmp280/ds18b20 ist V2.
- **WebSocket-Broadcast-API:** Der Pseudocode in Block 2 zeigt `ws_manager.broadcast_sensor_data()`. Der Agent muss pruefen wie der bestehende WS-Broadcast in `handle_sensor_data()` (Zeile ~459-494) aufgerufen wird und das gleiche Pattern verwenden. Moegliche Alternative: den WS-Broadcast-Code in eine wiederverwendbare Methode extrahieren.

---

## Verifikations-Log

> Code-Verifikation durchgefuehrt am 2026-03-26 gegen das auto-one Repo.

| Punkt | Status | Korrektur |
|-------|--------|-----------|
| 7 referenzierte Pfade | **BESTAETIGT** | Alle existieren |
| `_calculate_vpd()` in zone_kpi_service.py:33 | **BESTAETIGT** | Refactoring (Block 3) korrekt |
| chartjs-plugin-annotation v3.1.0 | **BESTAETIGT** | In package.json + HistoricalChart.vue:29 registriert |
| DataSource Enum | **KORRIGIERT** | `COMPUTED` existiert nicht → `PRODUCTION` verwenden |
| `save_data()` Signatur | **KORRIGIERT** | `raw_value` + `processed_value`, `esp_id` als uuid.UUID |
| `get_latest_value()` | **KORRIGIERT** | Existiert nicht → `get_latest_reading()` + manueller max_age Check |
| `SensorDataCreate` Pydantic-Model | **KORRIGIERT** | Existiert nicht → direkte Keyword-Argumente |
| `SENSOR_TYPE_CONFIG` Felder | **KORRIGIERT** | `decimals`, `defaultValue`, `category` sind Pflicht |
| `SENSOR_TYPE_MOCK_DEFAULTS` Struktur | **KORRIGIERT** | `Dict[str, Dict]`, nicht `Dict[str, float]` |
| useSensorOptions Dropdown | **KORRIGIERT** | Block 7 von optional zu ZWINGEND hochgestuft |
| WebSocket-Broadcast | **KORRIGIERT** | Muss separat getriggert werden |
| Hook-Einfuegepunkt | **KORRIGIERT** | `handle_sensor_data()`, nicht `_process_sensor_data()` |
