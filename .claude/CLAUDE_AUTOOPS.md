# AutoOps - Autonomous Operations Agent Framework

> **Für KI-Agenten:** Plugin-basierter autonomer Agent der ESP32-Geräte vollständig über die REST API konfiguriert, debuggt und dokumentiert.
> **Version:** 2.1.0
> **Erstellt:** 2026-02-15
> **Aktualisiert:** 2026-03-02

---

## 0. Quick Reference

| Ich will... | Command | Code-Location |
|-------------|---------|---------------|
| **ESP komplett konfigurieren** | `/autoops-run` | `autoops/plugins/esp_configurator.py` |
| **System debuggen & fixen** | `/autoops-debug` | `autoops/plugins/debug_fix.py` |
| **System-Status prüfen** | `/autoops-status` | `autoops/core/agent.py` |
| **System aufräumen** | via runner `--mode cleanup` | `autoops/plugins/system_cleanup.py` |
| **Eigenes Plugin schreiben** | Siehe Section 4 | `autoops/core/base_plugin.py` |
| **API Client nutzen** | Siehe Section 3 | `autoops/core/api_client.py` |
| **Reports lesen** | `autoops/reports/` | `autoops/core/reporter.py` |

---

## 1. Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ AutoOps Agent (Orchestrator)                                 │
│  ├─ PluginRegistry (Auto-Discovery, Singleton)               │
│  ├─ AutoOpsContext (Shared State, DeviceMode, Logging)       │
│  ├─ GodKaiserClient (REST API Client, Retry, Auth)           │
│  └─ AutoOpsReporter (Documentation Engine)                   │
├─────────────────────────────────────────────────────────────┤
│ Plugins (Capability Modules)                                 │
│  ├─ health_check      → VALIDATE, MONITOR                   │
│  ├─ esp_configurator   → CONFIGURE, VALIDATE                │
│  ├─ debug_fix          → DIAGNOSE, FIX, DOCUMENT            │
│  └─ system_cleanup     → CLEANUP, VALIDATE                  │
├─────────────────────────────────────────────────────────────┤
│ God-Kaiser REST API                                          │
│  ├─ /v1/esp/*       (Device Management + Registration)       │
│  ├─ /v1/sensors/*   (Sensor Configuration)                   │
│  ├─ /v1/actuators/* (Actuator Control)                       │
│  ├─ /v1/debug/*     (Mock ESP Management)                    │
│  ├─ /v1/zone/*      (Zone & Subzone Assignment)              │
│  ├─ /v1/health/*    (Health, Metrics, Liveness, Readiness)   │
│  ├─ /v1/debug/db/*  (Table Inspection)                       │
│  └─ /v1/audit/*     (Audit Logs)                             │
└─────────────────────────────────────────────────────────────┘
```

### Kern-Prinzipien

1. **API-First:** Alle Aktionen gehen durch die REST API (wie ein echter Frontend-User)
2. **Plugin-Based:** Jede Fähigkeit ist ein eigenständiges Plugin-Modul
3. **Self-Documenting:** Jede API-Aktion wird geloggt und in Reports dokumentiert
4. **Safe-by-Default:** Destruktive Aktionen nur bei Mock-Geräten, E-Stop wird nie auto-gefixt
5. **Universal:** Arbeitet mit beliebigen Sensor/Aktuator-Kombinationen
6. **DeviceMode-Aware:** Mock, Real und Hybrid Betrieb möglich
7. **Resilient:** Retry mit Exponential Backoff, Rollback bei kritischen Fehlern

---

## 2. Verzeichnisstruktur

```
El Servador/god_kaiser_server/src/autoops/
├── __init__.py                     # Package init, version
├── runner.py                       # CLI Runner, Presets, Entry Point
├── core/
│   ├── __init__.py                 # Core exports (alle Types)
│   ├── agent.py                    # AutoOpsAgent - Haupt-Orchestrator
│   ├── base_plugin.py              # AutoOpsPlugin ABC, PluginResult, PluginAction
│   ├── plugin_registry.py          # PluginRegistry (Singleton, Auto-Discovery)
│   ├── context.py                  # AutoOpsContext, DeviceMode, ESPSpec, SensorSpec
│   ├── api_client.py               # GodKaiserClient (REST API, Retry, 40+ Endpoints)
│   └── reporter.py                 # AutoOpsReporter (Markdown Reports)
├── plugins/
│   ├── __init__.py
│   ├── esp_configurator.py         # Autonome ESP-Konfiguration (Mock + Real)
│   ├── debug_fix.py                # Diagnose, Fix, Dokumentation
│   ├── health_check.py             # System-Gesundheitscheck (Metrics, Freshness)
│   └── system_cleanup.py           # Stale Cleanup, Orphan Detection, DB Health
└── reports/                        # Generierte Session-Reports
    └── autoops_session_*.md
```

---

## 3. API Client (GodKaiserClient)

Der API Client bildet alle Frontend-Aktionen nach, mit automatischem Retry und strukturiertem Logging.

### Authentifizierung & Konfiguration

```python
client = GodKaiserClient("http://localhost:8000")

# Standard-Credentials (oder via Env: AUTOOPS_PASSWORD)
await client.authenticate("admin", "Admin123#")

# Retry-Konfiguration (Default: 3 Retries, 1s Basis-Delay)
client = GodKaiserClient(
    "http://localhost:8000",
    max_retries=3,    # Anzahl Retry-Versuche
    retry_delay=1.0,  # Basis-Delay (verdoppelt sich pro Retry)
)
```

### Device Management (Mock)

```python
# Mock ESP erstellen (Debug-API, auto-generates MOCK_XXXXXX ID)
esp = await client.create_mock_esp(zone_name="Gewächshaus")

# Device-Liste
devices = await client.list_devices()

# Device-Details
device = await client.get_device("MOCK_ABC123")
gpio_status = await client.get_gpio_status("MOCK_ABC123")

# Mock ESP löschen
await client.delete_mock_esp("MOCK_ABC123")
```

### Device Management (Real)

```python
# Echtes Gerät registrieren (Device Registration API)
device = await client.register_real_device(
    device_id="ESP_12AB34CD",
    hardware_type="ESP32_WROOM",
    firmware_version="2.1.0",
)
```

### Sensor Management

```python
# Sensor konfigurieren
await client.add_sensor(
    esp_id="MOCK_ABC123", gpio=4,
    sensor_type="temperature", name="DS18B20",
    processing_mode="pi_enhanced",
    interface_type="ONEWIRE",
)

# Mock-Sensor-Wert setzen (Simulation)
await client.set_mock_sensor_value("MOCK_ABC123", gpio=4, raw_value=23.5)

# Sensor-Typ-Defaults abrufen
defaults = await client.get_sensor_type_defaults("temperature")

# Sensor-Daten lesen
data = await client.list_sensor_data(esp_id="MOCK_ABC123", limit=10)
```

### Actuator Management

```python
# Aktuator hinzufügen
await client.add_actuator(
    esp_id="MOCK_ABC123", gpio=16,
    actuator_type="relay", name="Water Pump",
)

# Kommando senden (ON/OFF/PWM)
await client.send_actuator_command("MOCK_ABC123", gpio=16, command="ON")
```

### Zone & Subzone Management

```python
# Zone erstellen (implizit durch Device-Zuweisung)
await client.assign_zone("MOCK_ABC123", zone_id="zone-1", zone_name="Gewächshaus")

# Subzone zuweisen
await client.assign_subzone("MOCK_ABC123", subzone_name="Bewässerung")

# Zonen auflisten (abgeleitet aus Device-Zuweisungen)
zones = await client.list_zones()

# Subzones auflisten (pro Device)
subzones = await client.list_subzones(esp_id="MOCK_ABC123")
```

### Health & Monitoring

```python
# Basis Health Check
health = await client.check_health()

# Detail-Health (mit Service-Statuses)
detailed = await client.get_server_health()

# Performance Metrics
metrics = await client.get_health_metrics()

# Liveness / Readiness (Kubernetes-kompatibel)
alive = await client.get_liveness()
ready = await client.get_readiness()

# Audit-Logs
logs = await client.list_audit_logs(limit=50)
```

### Hardware-Discovery (Real ESP)

```python
# OneWire Bus scannen
scan_result = await client.scan_onewire("ESP_12AB34CD")

# OneWire Devices auflisten
ow_devices = await client.get_onewire_devices("ESP_12AB34CD")
```

### Database Inspection

```python
# Tabellen auflisten
tables = await client.list_tables()

# Tabelle abfragen
data = await client.query_table("devices", limit=10)
```

### Vollständige API-Methoden

| Methode | Frontend-Äquivalent | API Endpoint |
|---------|---------------------|--------------|
| `authenticate()` | Login-Form | `POST /v1/auth/login` |
| `create_mock_esp()` | "Add Mock ESP" Button | `POST /v1/debug/mock-esp` |
| `delete_mock_esp()` | Delete Mock ESP | `DELETE /v1/debug/mock-esp/{id}` |
| `register_real_device()` | Device Registration | `POST /v1/esp/devices/register` |
| `list_devices()` | Dashboard Device-Liste | `GET /v1/esp/devices` |
| `get_device()` | ESPSettingsPopover | `GET /v1/esp/devices/{id}` |
| `get_gpio_status()` | GpioPicker | `GET /v1/esp/devices/{id}/gpio-status` |
| `add_sensor()` | Sensor-Config-Form | `POST /v1/sensors/{esp_id}/{gpio}` |
| `add_mock_sensor()` | Debug Mock-Sensor | `POST /v1/debug/mock-esp/{id}/sensors` |
| `set_mock_sensor_value()` | Mock Value Set | `POST /v1/debug/mock-esp/{id}/sensors/{gpio}/value` |
| `list_sensor_data()` | Sensor Data View | `GET /v1/sensors/data` |
| `get_sensor_type_defaults()` | Sensor Type Info | `GET /v1/sensors/type-defaults/{type}` |
| `add_actuator()` | Aktuator-Config-Form | `POST /v1/actuators/{esp_id}/{gpio}` |
| `send_actuator_command()` | ON/OFF Toggle | `POST /v1/actuators/{esp_id}/{gpio}/command` |
| `assign_zone()` | Zone-Assignment-Panel | `POST /v1/zone/devices/{id}/assign` |
| `list_zones()` | Zone-Liste | Derived from device data |
| `create_zone()` | Zone erstellen | Via `assign_zone()` (implicit) |
| `list_subzones()` | Subzone-Liste | `GET /v1/subzone/devices/{id}/subzones` |
| `assign_subzone()` | Subzone zuweisen | `POST /v1/subzone/devices/{id}/subzones/assign` |
| `trigger_heartbeat()` | Heartbeat-Button | `POST /v1/debug/mock-esp/{id}/heartbeat` |
| `set_auto_heartbeat()` | Auto-HB Toggle | `POST /v1/debug/mock-esp/{id}/auto-heartbeat` |
| `start_simulation()` | Start Simulation | `POST /v1/debug/mock-esp/{id}/simulation/start` |
| `check_health()` | Health Status | `GET /v1/health` |
| `get_server_health()` | Health Details | `GET /v1/health/detailed` |
| `get_health_metrics()` | Performance Metrics | `GET /v1/health/metrics` (Prometheus) |
| `get_liveness()` | Liveness Probe | `GET /v1/health/live` |
| `get_readiness()` | Readiness Probe | `GET /v1/health/ready` |
| `list_audit_logs()` | Audit Log View | `GET /v1/audit/` |
| `scan_onewire()` | OneWire Scan | `POST /v1/sensors/esp/{id}/onewire/scan` |
| `get_onewire_devices()` | OneWire Devices | `GET /v1/sensors/esp/{id}/onewire` |
| `list_tables()` | DB Explorer | `GET /v1/debug/db/tables` |
| `query_table()` | DB Table View | `GET /v1/debug/db/{name}` |
| `list_logic_rules()` | Logic Rules | `GET /v1/logic/rules` |

### Retry-Verhalten

Der API Client retried automatisch bei transienten Fehlern:

| HTTP Status | Bedeutung | Retry? |
|-------------|-----------|--------|
| 502 | Bad Gateway | Ja |
| 503 | Service Unavailable | Ja |
| 504 | Gateway Timeout | Ja |
| 429 | Too Many Requests | Ja |
| Andere 4xx/5xx | Client/Server Error | Nein |

Retry-Strategie: Exponential Backoff (`delay * 2^attempt`), max 3 Versuche.

---

## 4. Plugins schreiben

### Plugin-Basis-Klasse

```python
from autoops.core.base_plugin import AutoOpsPlugin, PluginCapability, PluginResult

class MyPlugin(AutoOpsPlugin):
    @property
    def name(self) -> str:
        return "my_plugin"  # Eindeutiger Name

    @property
    def description(self) -> str:
        return "Was mein Plugin tut"

    @property
    def capabilities(self) -> list[PluginCapability]:
        return [PluginCapability.VALIDATE]  # Was kann es?

    async def validate_preconditions(self, context, client) -> PluginResult:
        """Optional: Prüfe ob Plugin ausführbar ist."""
        return PluginResult.success_result("Ready")

    async def execute(self, context, client) -> PluginResult:
        """Haupt-Logik hier."""
        # context: AutoOpsContext mit Shared State
        # client: GodKaiserClient für API-Aufrufe
        result = await client.check_health()
        return PluginResult.success_result("All good", data=result)

    async def rollback(self, context, client, actions) -> PluginResult:
        """Optional: Rollback bei kritischen Fehlern."""
        # Wird automatisch vom Agent aufgerufen wenn execute() fehlschlägt
        return PluginResult.success_result("Rolled back")
```

### Plugin-Capabilities

| Capability | Bedeutung | Ausführungs-Reihenfolge |
|-----------|-----------|------------------------|
| `VALIDATE` | System-Validierung | 1. (zuerst) |
| `CONFIGURE` | Geräte konfigurieren | 2. |
| `DIAGNOSE` | Probleme diagnostizieren | 3. |
| `FIX` | Probleme beheben | 4. |
| `MONITOR` | System überwachen | 5. |
| `DOCUMENT` | Dokumentation erstellen | 6. |
| `TEST` | Tests ausführen | - |
| `CLEANUP` | Aufräumen | 7. (zuletzt) |

### Aktive Plugins

| Plugin | Capabilities | Beschreibung |
|--------|-------------|--------------|
| `health_check` | VALIDATE, MONITOR | System-Health, Metrics, Data Freshness, Zone Config |
| `esp_configurator` | CONFIGURE, VALIDATE | ESP-Konfiguration (Mock + Real, Rollback) |
| `debug_fix` | DIAGNOSE, FIX, DOCUMENT | Debug, Fix, Calibration Check, Freshness |
| `system_cleanup` | CLEANUP, VALIDATE | Stale Devices, Orphaned Configs, DB Health |

### Plugin auto-entdecken

Plugins in `autoops/plugins/` werden automatisch entdeckt wenn:
1. Die Datei nicht mit `_` beginnt
2. Die Klasse `AutoOpsPlugin` erweitert
3. Keine abstrakten Methoden fehlen

### PluginResult

```python
# Erfolg
PluginResult.success_result("ESP configured", data={"device_id": "..."})

# Fehler
PluginResult.failure("Config failed", errors=["GPIO conflict on pin 4"])

# User-Input benötigt
PluginResult.needs_input("Which sensors?", questions=[...])
```

### PluginAction (Dokumentation)

Jede Aktion wird dokumentiert:
```python
PluginAction.create(
    action="Add Sensor (DS18B20)",
    target="MOCK_ABC/GPIO:4",
    details={"sensor_type": "temperature", "gpio": 4},
    result="Added successfully",
    severity=ActionSeverity.SUCCESS,
    api_endpoint="/v1/sensors/MOCK_ABC/4",
    api_method="POST",
    api_response_code=200,
)
```

---

## 5. DeviceMode - Mock vs. Real vs. Hybrid

### Modi

| Modus | Beschreibung | Device API | Simulation |
|-------|-------------|------------|------------|
| `mock` (Default) | Mock ESPs über Debug-API | `POST /v1/debug/mock-esp` | Ja (Heartbeat, Sensor Values) |
| `real` | Echte ESP32 Hardware | `POST /v1/esp/devices/register` | Nein |
| `hybrid` | Gemischt (Mock + Real) | Beides | Nur für Mocks |

### Mock-Modus (Default)

- Erstellt Mock ESPs über die Debug-API
- Simuliert Heartbeats und Sensor-Werte
- Ideal für Entwicklung und Tests
- Kein physischer ESP32 nötig

### Real-Modus

- Registriert echte Geräte über Device Registration API
- Kein Heartbeat-Triggering (kommt vom echten ESP)
- Keine Sensor-Wert-Simulation (echte Daten via MQTT)
- Voraussetzung: ESP32 mit geflashter Firmware

### Hybrid-Modus

- Kann Mock und Real Devices gleichzeitig verwalten
- Per-Device `device_mode` in ESPSpec steuerbar
- Nützlich für schrittweise Migration Mock → Real

### Konfiguration

```python
# Via Runner
result = await run_autoops(
    mode='configure',
    device_mode='real',       # mock | real | hybrid
    device_id='ESP_12AB34CD', # Für real: bestehende Device-ID
    sensors_str='DS18B20,SHT31',
    actuators_str='RELAY',
)

# Via Agent direkt
agent = AutoOpsAgent(
    server_url="http://localhost:8000",
    device_mode="real",
)
```

---

## 6. ESP Configurator - GPIO-Zuweisungsstrategie

### ESP32 WROOM (Standard)

| Interface | GPIOs | Sensoren |
|-----------|-------|----------|
| OneWire | 4 | DS18B20 |
| I2C SDA | 21 | SHT31, BME280 |
| I2C SCL | 22 | (I2C Bus) |
| Analog (ADC1) | 32, 33, 34, 35, 36, 39 | pH, EC, Moisture, Light |
| Digital Out | 16, 17, 18, 19 | Relay, Valve |
| PWM | 25, 26, 27 | Fan, PWM Actuators |
| General | 5, 12, 13, 14, 15, 23 | Fallback |

### XIAO ESP32-C3

| Interface | GPIOs | Sensoren |
|-----------|-------|----------|
| I2C SDA | 6 | SHT31 |
| I2C SCL | 7 | (I2C Bus) |
| Analog | 2, 3, 4 | pH, EC |
| Digital | 5, 6, 7, 8, 9, 10 | Relay |

### Zuweisungslogik

1. Wenn User GPIO spezifiziert → diese verwenden
2. Sensor-Interface-Typ bestimmt GPIO-Pool
3. Aus Pool erste freie GPIO wählen
4. Fallback auf General-Purpose-Pins
5. Fehler wenn kein Pin verfügbar

### Rollback bei Fehler

Bei kritischen Fehlern während der Konfiguration:
1. Alle erstellten Devices werden gelöscht
2. Context wird bereinigt (created_devices, configured_sensors cleared)
3. Fehler wird im Report dokumentiert

---

## 7. Simulation Patterns

Für Mock-Devices können verschiedene Simulations-Muster gewählt werden:

| Pattern | Beschreibung | Anwendung |
|---------|-------------|-----------|
| `constant` | Fester Wert | Baseline-Tests |
| `sine` | Sinuswelle | Temperatur-Tageszyklus |
| `random` | Zufällige Schwankung | Noise-Simulation |
| `sawtooth` | Sägezahn | Langsamer Anstieg, schneller Abfall |
| `step` | Stufenweise | Diskrete Zustandswechsel |
| `realistic` | Realistisch mit Drift | Produktionsnahe Tests |

```python
from autoops.core.context import SensorSpec, SimulationPattern

sensor = SensorSpec(
    sensor_type="temperature",
    interface_type="ONEWIRE",
    raw_value=22.0,
    unit="°C",
    variation_pattern=SimulationPattern.REALISTIC,
    variation_range=2.0,  # +/- 2°C Schwankung
)
```

---

## 8. Runner & CLI

### Direkt aufrufen

```bash
cd "El Servador/god_kaiser_server"

# Vollständiger Workflow (Mock)
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(
    mode='full',
    sensors_str='DS18B20,SHT31,PH',
    actuators_str='RELAY,PUMP',
    zone='Gewächshaus',
))
print('Result:', 'SUCCESS' if result.get('all_passed') else 'FAILED')
"

# Real Hardware Workflow
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(
    mode='configure',
    device_mode='real',
    device_id='ESP_12AB34CD',
    sensors_str='DS18B20,SHT31',
    actuators_str='RELAY',
    zone='Gewächshaus',
))
"

# Nur Health Check
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='health'))
"

# Nur Debug & Fix
python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='debug'))
"
```

### CLI Argumente

| Argument | Default | Beschreibung |
|----------|---------|-------------|
| `--mode` | `full` | `health`, `configure`, `debug`, `full` |
| `--sensors` | - | Komma-getrennt: `DS18B20,SHT31,PH` |
| `--actuators` | - | Komma-getrennt: `RELAY,PUMP,FAN` |
| `--zone` | - | Zone-Name |
| `--device-mode` | `mock` | `mock`, `real`, `hybrid` |
| `--device-id` | - | Bestehende Device-ID (für real) |
| `--max-retries` | `3` | API Retry-Versuche |
| `--server` | `http://localhost:8000` | Server-URL |
| `--json` | `false` | JSON-Output statt Text |

### Environment Variables

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `AUTOOPS_SERVER` | `http://localhost:8000` | Server-URL |
| `AUTOOPS_USER` | `admin` | Login Username |
| `AUTOOPS_PASSWORD` | `Admin123#` | Login Passwort |

### Sensor-Presets

| Preset | sensor_type | Interface | Default-Wert |
|--------|------------|-----------|--------------|
| DS18B20 | temperature | ONEWIRE | 22.0°C |
| SHT31 | temperature + humidity | I2C | 22.0°C / 55% |
| PH | ph | ANALOG | 6.5 pH |
| EC | ec | ANALOG | 1.2 mS/cm |
| MOISTURE | moisture | ANALOG | 40% |
| CO2 | co2 | ANALOG | 400 ppm |
| LIGHT | light | ANALOG | 500 lux |

### Aktuator-Presets

| Preset | actuator_type | Interface |
|--------|--------------|-----------|
| RELAY | relay | Digital |
| PUMP | relay | Digital |
| VALVE | valve | Digital |
| FAN | pwm_fan | PWM |

---

## 9. Reports

Jede AutoOps-Session generiert einen Markdown-Report:

```
autoops/reports/autoops_session_{session_id}_{timestamp}.md
```

Report-Inhalt:
- Session-Zusammenfassung (ID, Zeitstempel, Status, DeviceMode)
- Plugin-Ergebnisse (pro Plugin: Actions, Errors, Warnings)
- Vollständiger API-Action-Log (jeder API-Call mit Timestamp, Method, Endpoint, Status)
- Cleanup-Zusammenfassung (entfernte Devices, gefundene Orphans)
- Finale Zusammenfassung (Passed/Failed, Error-Count)

---

## 10. Integration mit Claude Code

### Slash Commands

| Command | Beschreibung |
|---------|-------------|
| `/autoops-run` | Vollautonome ESP-Konfiguration mit Fallback-Fragen |
| `/autoops-debug` | System-Diagnose und Auto-Fix |
| `/autoops-status` | Plugin-Übersicht und letzte Reports |

### Workflow für Claude Code Agent

1. User sagt z.B. "Konfiguriere einen ESP mit DS18B20 und pH Sensor"
2. Agent nutzt `/autoops-run`
3. Falls Infos fehlen → `AskUserQuestion` für Sensor/Aktuator-Auswahl
4. Agent führt AutoOps Python-Framework aus
5. Liest generierten Report
6. Fasst Ergebnis für User zusammen

---

## 11. Erweiterbarkeit

### Neue Plugin-Ideen

| Plugin | Capabilities | Beschreibung |
|--------|-------------|--------------|
| `logic_configurator` | CONFIGURE | Automatische Cross-ESP Automation Rules |
| `load_tester` | TEST | Performance-Tests durchführen |
| `backup_restore` | CLEANUP | System-Backup und Restore |
| `documentation_gen` | DOCUMENT | Auto-Generate System-Dokumentation |
| `sensor_calibrator` | CONFIGURE | Sensor-Kalibrierung durchführen |
| `zone_optimizer` | CONFIGURE | Optimale Zone-Zuweisung berechnen |

### Integration mit KI_INTEGRATION_IMPLEMENTATION.md

AutoOps kann als Basis für die geplante KI-Integration dienen:
- Plugin-System → AI-Plugin-Registry (Phase 2)
- GodKaiserClient → AI-Service-Adapter Pattern (Phase 1)
- AutoOpsContext → AI-Context-System (Phase 10)
- Runner → Pipeline-Engine Pattern (Phase 6)

---

## 12. Changelog (v1.0 → v2.1)

| Bereich | v1.0 | v2.0 |
|---------|------|------|
| **DeviceMode** | Nur Mock | Mock, Real, Hybrid |
| **Plugins** | 3 (health, config, debug) | 4 (+system_cleanup) |
| **API Endpoints** | ~15 | 35+ |
| **Retry Logic** | Keine | Exponential Backoff (502/503/504/429) |
| **Rollback** | Keine | Automatisch bei kritischen Fehlern |
| **Logging** | Print-Statements | Strukturiertes Logging (get_logger) |
| **Health Check** | 5 Basis-Checks | 8+ Checks (Metrics, Freshness, Zones) |
| **Debug Plugin** | Basis-Scan | +Calibration, +Data Freshness per Device |
| **Cleanup** | Nicht vorhanden | Stale Devices, Orphans, DB Health |
| **CLI** | Basis-Argumente | +device-mode, +device-id, +max-retries |
| **Config** | Hardcoded | Environment Variables |
| **Passwort** | "admin" (falsch) | "Admin123#" (korrekt) |
| **Plattform** | Windows-Pfade | Linux-kompatibel |
| **SimulationPattern** | Nicht vorhanden | 6 Patterns (constant, sine, realistic...) |

### v2.0 → v2.1 (2026-03-02)

| Bereich | Änderung |
|---------|----------|
| **API Client** | `_request()` erkennt Content-Type (JSON vs Prometheus text/plain) |
| **Metrics** | `_parse_prometheus_metrics()` Parser für `/health/metrics` Endpoint |
| **Mock ESP** | `create_mock_esp()` sendet `esp_id` (Pflichtfeld), auto-generiert `MOCK_XXXXXX` |
| **Mock State** | `set_mock_state()` Feld `new_state` → `state`, `set_mock_sensor_value()` PUT → POST |
| **API Pfade** | 10+ Endpoint-Pfade korrigiert (`debug/db/*`, `logic/rules`, `sensors/type-defaults/*`) |
| **Plugin Registry** | Import-Fix: package-anchored `importlib.import_module` statt relativem Import |
| **Credentials** | `TestAdmin123!` → `Admin123#` (alle Stellen) |
| **Exception Handling** | Redundantes `except (APIError, Exception)` → `except Exception` |
| **Imports** | `import secrets` auf Top-Level verschoben (Pattern-Konformität) |
| **Reports** | `.gitignore` für Session-Reports, Test-Mock-Devices aus DB bereinigt |

---

**Letzte Aktualisierung:** 2026-03-02
**Version:** 2.1.0
