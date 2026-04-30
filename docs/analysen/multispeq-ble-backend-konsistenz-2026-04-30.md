# MultispeQ Backend-Konsistenz-Report (2026-04-30)

> **Zweck:** Evidenzbasierte Verifikation aller Issue-Claims (AUT-211..AUT-222) gegen echten Servercode + BLE-Plugin-Erweiterbarkeits-Bewertung
> **Basis:** meta-analyst Cross-Layer-Analyse, AutomationOne `auto-debugger/work`

---

## 1. Befunde je Issue-Claim

### 1.1 sensor_type_registry.py — VIRTUAL_SENSOR_TYPES und MULTI_VALUE_SENSORS (AUT-211, AUT-212)

**Status: BESTÄTIGT mit Lücke**

`VIRTUAL_SENSOR_TYPES` Zeile 89:
```python
VIRTUAL_SENSOR_TYPES: set[str] = {"vpd"}
```
Genau `{"vpd"}` — kein "multispeq". Korrekt wie in AUT-211 behauptet.

`MULTI_VALUE_SENSORS` (Zeilen 94–153): Enthält "sht31", "bmp280", "bme280". Kein "multispeq"-Eintrag.

**LÜCKE (AUT-212 nicht erwähnt):** `MultiValueSensorDefinition`-TypedDict hat `device_address: int` als Non-Optional.
Für MultispeQ gibt es keine I2C-Adresse → muss zu `Optional[int]` werden. Alle bestehenden Consumers von `get_i2c_address()` müssen geprüft werden.

---

### 1.2 heartbeat_handler.py — Virtual-ESP-Filter (AUT-211)

**Status: ABWEICHUNG BESTÄTIGT**

`check_device_timeouts()` (Zeile ~2223): Ruft `esp_repo.get_by_status("online")` auf.
`get_by_status()` in `esp_repo.py` Zeile 167 filtert nur `ESPDevice.status == status` ohne Virtual-Ausschluss.

→ Ein virtueller ESP mit `status="online"` würde Heartbeat-Timeout-Check durchlaufen, kann nie Heartbeat senden und würde fälschlicherweise auf "offline" gesetzt.

**Syntax-Fehler bei Zeile ~2265 (TM-Notiz):** Kein Syntax-Fehler gefunden. Zeilen 2263–2269 zeigen sauberen Code. TM-Claim war wahrscheinlich falsch oder bereits behoben.

---

### 1.3 config_builder.py — CALIBRATION_REQUIRED_SENSOR_TYPES (AUT-211)

**Status: VOLLSTÄNDIG BESTÄTIGT**

Zeile 163: `CALIBRATION_REQUIRED_SENSOR_TYPES = {"ph", "ec", "moisture", "soil_moisture"}` — exakt wie behauptet. Verwendungsstellen Zeilen 715 und 833 bestätigt. Keine Änderung für MultispeQ nötig.

---

### 1.4 esp.py — status-Feld (AUT-211)

**Status: BESTÄTIGT mit Dokumentations-Lücke**

Zeile 139: Plain `String(20)` ohne CHECK-Constraint — kein Enum. Korrekt.

Bestehende Doc-Werte: `"online, offline, error, unknown, pending_approval, approved, rejected"` — "virtual" fehlt im Docstring. Muss in AUT-211 explizit ergänzt werden (keine DB-Migration, nur Code-Kommentar).

---

### 1.5 sensor_repo — create_if_not_exists() (AUT-217)

**Status: BESTÄTIGT — sensor_kind fehlt im Model**

`create_if_not_exists()` existiert, Signatur: `async def create_if_not_exists(self, **fields) -> tuple[SensorConfig, bool]:`

Nimmt beliebige `**fields` → technisch erweiterbar. ABER: `SensorConfig`-Model hat **kein `sensor_kind`-Feld**. Ein Aufruf `create_if_not_exists(sensor_kind="snapshot", ...)` würde mit SQLAlchemy-TypeError scheitern bis die Migration + Model-Änderung aus AUT-211 deployed ist.

VPD-Referenz-Aufruf (sensor_handler.py Zeile 773–782):
```python
await sensor_repo.create_if_not_exists(
    esp_id=esp_device.id, gpio=0, sensor_type="vpd",
    sensor_name="VPD (berechnet)", interface_type="VIRTUAL",
    enabled=True, pi_enhanced=False, config_status="active",
)
```
Kein `sensor_kind`-Parameter — erst nach Migration ergänzen.

---

### 1.6 sensor_handler.py — VPD-Pattern (AUT-211, AUT-217)

**Status: REFERENZ VOLLSTÄNDIG BESTÄTIGT**

`_try_compute_vpd()` Signatur (Zeilen 686–697) — vollständige Implementation vorhanden, kein `sensor_kind`-Parameter. Das Pattern ist für MultispeQ analog anwendbar, Einstiegspunkt ist aber HTTP POST statt MQTT.

---

### 1.7 API v1 Router-Struktur (AUT-217)

**Status: BESTÄTIGT**

23 registrierte Router in `api/v1/__init__.py` (Zeilen 14–79). Kein `multispeq_router`. Pattern für Hinzufügung klar.

**Hinweis:** Es gibt einen `plugins_router` in der bestehenden API-Struktur, und `src/autoops/core/base_plugin.py` enthält eine `AutoOpsPlugin`-ABC mit `PluginCapability`-Enum. AUT-217 muss klären, ob MultispeQ als separater Router oder als Plugin-Endpunkt läuft — beide Varianten sind möglich.

---

### 1.8 Alembic-Migrationen (AUT-211)

**Status: ABWEICHUNG — AUT-211-Claim ist FALSCH**

AUT-211 behauptet: letzte Migration = `soft_delete_devices_preserve_sensor_data.py`
Tatsächlich gibt es ca. 10 neuere Migrationen (u.a. `add_sensor_lifecycle_columns.py`, `add_critical_rule_degraded_fields.py`, `ea85866bc66e_add_calibration_sessions_table.py`).

Die neue Migration `add_multispeq_sensor_kind_virtual_status.py` muss `Revises:` auf den **echten HEAD** zeigen → `db-inspector` muss `alembic heads` ausführen vor Implementierung.

---

### 1.9 src/integrations/ — existiert nicht (AUT-212)

**Status: BESTÄTIGT — muss angelegt werden**

Bestehende Top-Level-Verzeichnisse: `api/`, `autoops/`, `core/`, `db/`, `middleware/`, `mqtt/`, `schemas/`, `sensors/`, `services/`, `utils/`, `websocket/`

`src/integrations/` existiert nicht. `src/autoops/` als Referenz-Muster vorhanden (mit `core/`, `plugins/`, `reports/`, `runner.py`).

---

### 1.10 logic_engine.py — evaluate_sensor_data() (AUT-217)

**Status: BESTÄTIGT — keine Änderung nötig**

Signatur:
```python
async def evaluate_sensor_data(
    self, esp_id: str, gpio: int, sensor_type: str,
    value: float, zone_id: Optional[str] = None, subzone_id: Optional[str] = None,
) -> None:
```
Kein `sensor_kind`-Parameter nötig — pro Messwert (Phi2, LEF, etc.) ein separater Call mit `sensor_type` reicht. Die bestehende Signatur ist ausreichend.

---

## 2. BLE-Plugin-Erweiterbarkeits-Analyse

### Was die geplante Architektur richtig macht

- Transportagnostische `parser.py` als Idee ist konsistent mit Codebase-Pattern (`sensor_type_registry.py` = pure Daten/Logik)
- `src/integrations/<vendor>/` als Pfad trennt klar von MQTT-Schicht
- CSV → HTTP POST und BLE → WebBluetooth/GATT teilen sich dieselbe Parsing-Logik

### Kein BLE-Bezug im Codebase

Grep über alle `.py`-Dateien: null Treffer auf "ble", "bluetooth", "BLE". Codebase ist BLE-naiv — kein Conflict, aber auch kein Scaffold.

### Was für BLE fehlt (nicht in den Issues adressiert)

**1. Kein Interface/ABC für Transport-Layer**
Die Issues definieren keine `AbstractTransport`-Klasse oder Protocol. Ohne das hat `parser.py` keinen definierten Contract, den `ble_transport.py` und `csv_transport.py` beide erfüllen müssten. Referenz: `AutoOpsPlugin`-ABC in `autoops/core/base_plugin.py`.

**2. Fehlender gemeinsamer Persistenz-Layer (`ingest.py`)**
Ohne gemeinsamen Layer würden CSV-Upload und BLE-Transport dieselbe `sensor_repo` + `logic_engine` Aufruf-Sequenz duplizieren. Das verletzt DRY und macht BLE-Erweiterung aufwändiger.

**3. Kein `DataSource`-Enum-Wert für MultispeQ**
`SensorData.data_source` hat einen Enum. Weder "multispeq_csv" noch "multispeq_ble" sind geplant — Nachverfolgbarkeit fehlt.

**4. BLE-Session-Lifecycle nicht adressiert**
BLE benötigt Connection Management (connect, disconnect, reconnect-Strategie) — fundamental anders als HTTP POST. AUT-212 sagt nur "Stufe 2a = future" ohne Interface-Contract zu definieren.

### Empfohlene Verzeichnisstruktur für echte Transportagnostik

```
src/integrations/
  __init__.py
  multispeq/
    __init__.py
    models.py          # MultispeQSnapshot dataclass, MultispeQMeasurement
    parser.py          # pure: parse(raw: bytes | str | dict) -> MultispeQSnapshot (keine I/O)
    ingest.py          # ingest_snapshot(snapshot, esp_id, session) -> list[SensorData]
                       # kapselt sensor_repo + logic_engine Calls — gemeinsamer Layer
    csv_transport.py   # liest File, ruft parser.parse(), ruft ingest.ingest()
    # Stufe 2a (future):
    # ble_transport.py # connect(), stream(), ruft parser.parse(), ruft ingest.ingest()
```

`ingest.py` ist der fehlende Mittler zwischen Transport und Persistenz.

---

## 3. Kritische Lücken (blockierend für Implementierung)

| ID | Issue | Befund | Handlung |
|----|-------|--------|----------|
| **L1** | AUT-211/217 | `SensorConfig`-Model hat kein `sensor_kind`-Feld — AUT-217-Calls schlagen fehl | Migration + Model-Änderung vor jedem anderen Issue |
| **L2** | AUT-211 | `check_device_timeouts()` filtert status='virtual' nicht — False-Positive-Alerts | `esp_repo.py` braucht `get_all_online_non_virtual()` oder Filter |
| **L3** | AUT-212 | `MultiValueSensorDefinition.device_address: int` ist non-optional — MultispeQ hat keine I2C-Adresse | TypedDict auf `Optional[int]`, `get_i2c_address()`-Consumer prüfen |
| **L4** | AUT-211 | Letzter Migrations-Claim (`soft_delete_devices_preserve_sensor_data`) ist falsch — ~10 neuere existieren | `db-inspector` muss `alembic heads` ausführen für korrekten `Revises:`-Wert |
| **L5** | AUT-212 | Kein `ingest.py` geplant — BLE-Erweiterung würde repo-Logik duplizieren | `ingest.py` als eigene Datei in `integrations/multispeq/` ergänzen |

---

## 4. Handoff-Pakete

### server-dev Auftrag (nach db-inspector Schritt 1)

**Scope:** MultispeQ virtuellen Sensor — Stufe 1 (CSV/JSON-Upload)

**Betroffene Dateien:**
- `src/sensors/sensor_type_registry.py` — `VIRTUAL_SENSOR_TYPES`, `MULTI_VALUE_SENSORS["multispeq"]`, `SENSOR_TYPE_MAPPING` ergänzen; `MultiValueSensorDefinition.device_address` → `Optional[int]`
- `src/db/models/sensor.py` — `sensor_kind: Mapped[str | None]` hinzufügen
- `src/db/models/esp.py` — Docstring `status` um "virtual" ergänzen
- `src/mqtt/handlers/heartbeat_handler.py` — `check_device_timeouts()`: Virtual-Filter einbauen
- `src/db/repositories/esp_repo.py` — `get_by_status("online")` um `ESPDevice.status != "virtual"` ergänzen
- Neu: `src/integrations/multispeq/__init__.py`, `models.py`, `parser.py`, `ingest.py`
- Neu: `src/api/v1/multispeq.py` (Router + Endpoint)
- `src/api/v1/__init__.py` — Router registrieren

**Abhängigkeit:** db-inspector muss Migration zuerst liefern (L4).

### db-inspector Auftrag

**Scope:** Neue Alembic-Migration erstellen

1. `alembic heads` ausführen → echten HEAD ermitteln
2. Migration `add_multispeq_sensor_kind_virtual_status.py` erstellen:
   - `sensor_configs`: Spalte `sensor_kind VARCHAR(20) NULL DEFAULT 'continuous'` + CHECK IN ('continuous', 'snapshot')
   - `Revises:` auf echten HEAD setzen
3. Up/Down testen

---

*Report erstellt: 2026-04-30 | Basis: meta-analyst Cross-Layer-Analyse*
