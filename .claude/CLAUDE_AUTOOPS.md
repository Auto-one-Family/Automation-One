# AutoOps - Autonomous Operations Agent Framework

> **Für KI-Agenten:** Plugin-basierter autonomer Agent der ESP32-Geräte vollständig über die REST API konfiguriert, debuggt und dokumentiert.
> **Version:** 1.0.0
> **Erstellt:** 2026-02-15

---

## 0. Quick Reference

| Ich will... | Command | Code-Location |
|-------------|---------|---------------|
| **ESP komplett konfigurieren** | `/autoops-run` | `autoops/plugins/esp_configurator.py` |
| **System debuggen & fixen** | `/autoops-debug` | `autoops/plugins/debug_fix.py` |
| **System-Status prüfen** | `/autoops-status` | `autoops/core/agent.py` |
| **Eigenes Plugin schreiben** | Siehe Section 4 | `autoops/core/base_plugin.py` |
| **API Client nutzen** | Siehe Section 3 | `autoops/core/api_client.py` |
| **Reports lesen** | `autoops/reports/` | `autoops/core/reporter.py` |

---

## 1. Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ AutoOps Agent (Orchestrator)                                 │
│  ├─ PluginRegistry (Auto-Discovery)                          │
│  ├─ AutoOpsContext (Shared State)                             │
│  ├─ GodKaiserClient (REST API Client)                        │
│  └─ AutoOpsReporter (Documentation Engine)                   │
├─────────────────────────────────────────────────────────────┤
│ Plugins (Capability Modules)                                 │
│  ├─ health_check    → VALIDATE, MONITOR                     │
│  ├─ esp_configurator → CONFIGURE, VALIDATE                  │
│  └─ debug_fix       → DIAGNOSE, FIX, DOCUMENT               │
├─────────────────────────────────────────────────────────────┤
│ God-Kaiser REST API                                          │
│  ├─ /v1/esp/*       (Device Management)                      │
│  ├─ /v1/sensors/*   (Sensor Configuration)                   │
│  ├─ /v1/actuators/* (Actuator Control)                       │
│  ├─ /v1/debug/*     (Mock ESP Management)                    │
│  ├─ /v1/zone/*      (Zone Assignment)                        │
│  └─ /v1/health/*    (Health Checks)                          │
└─────────────────────────────────────────────────────────────┘
```

### Kern-Prinzipien

1. **API-First:** Alle Aktionen gehen durch die REST API (wie ein echter Frontend-User)
2. **Plugin-Based:** Jede Fähigkeit ist ein eigenständiges Plugin-Modul
3. **Self-Documenting:** Jede API-Aktion wird geloggt und in Reports dokumentiert
4. **Safe-by-Default:** Destruktive Aktionen nur bei Mock-Geräten, E-Stop wird nie auto-gefixt
5. **Universal:** Arbeitet mit beliebigen Sensor/Aktuator-Kombinationen

---

## 2. Verzeichnisstruktur

```
El Servador/god_kaiser_server/src/autoops/
├── __init__.py                     # Package init, version
├── runner.py                       # CLI Runner, Presets, Entry Point
├── core/
│   ├── __init__.py                 # Core exports
│   ├── agent.py                    # ⭐ AutoOpsAgent - Haupt-Orchestrator
│   ├── base_plugin.py              # ⭐ AutoOpsPlugin ABC, PluginResult, PluginAction
│   ├── plugin_registry.py          # PluginRegistry (Singleton, Auto-Discovery)
│   ├── context.py                  # AutoOpsContext, ESPSpec, SensorSpec, ActuatorSpec
│   ├── api_client.py               # ⭐ GodKaiserClient (REST API Wrapper)
│   └── reporter.py                 # AutoOpsReporter (Markdown Reports)
├── plugins/
│   ├── __init__.py
│   ├── esp_configurator.py         # ⭐ Autonome ESP-Konfiguration
│   ├── debug_fix.py                # ⭐ Diagnose, Fix, Dokumentation
│   └── health_check.py             # System-Gesundheitscheck
└── reports/                        # Generierte Session-Reports
    └── autoops_session_*.md
```

---

## 3. API Client (GodKaiserClient)

Der API Client bildet alle Frontend-Aktionen nach:

### Device Management
```python
client = GodKaiserClient("http://localhost:8000")
await client.authenticate("admin", "admin")

# Wie "Add Mock ESP" im Frontend
esp = await client.create_mock_esp("Test ESP", hardware_type="ESP32_WROOM")

# Wie Device-Liste im Dashboard
devices = await client.list_devices()

# Wie ESPSettingsPopover
device = await client.get_device("MOCK_ABC123")
gpio_status = await client.get_gpio_status("MOCK_ABC123")
```

### Sensor Management
```python
# Wie Sensor-Konfiguration im Frontend
await client.add_sensor(
    esp_id="MOCK_ABC123", gpio=4,
    sensor_type="temperature", name="DS18B20",
    processing_mode="pi_enhanced",
    interface_type="ONEWIRE",
)

# Mock-Sensor-Wert setzen (Simulation)
await client.set_mock_sensor_value("MOCK_ABC123", gpio=4, raw_value=23.5)
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

### Vollständige API-Methoden

| Methode | Frontend-Äquivalent | API Endpoint |
|---------|---------------------|--------------|
| `authenticate()` | Login-Form | `POST /v1/auth/login` |
| `create_mock_esp()` | "Add Mock ESP" Button | `POST /v1/debug/mock-esp` |
| `list_devices()` | Dashboard Device-Liste | `GET /v1/esp/devices` |
| `get_device()` | ESPSettingsPopover | `GET /v1/esp/devices/{id}` |
| `get_gpio_status()` | GpioPicker | `GET /v1/esp/devices/{id}/gpio-status` |
| `add_sensor()` | Sensor-Config-Form | `POST /v1/sensors/{esp_id}/{gpio}` |
| `add_mock_sensor()` | Debug Mock-Sensor | `POST /v1/debug/mock-esp/{id}/sensors` |
| `add_actuator()` | Aktuator-Config-Form | `POST /v1/actuators/{esp_id}/{gpio}` |
| `send_actuator_command()` | ON/OFF Toggle | `POST /v1/actuators/{esp_id}/{gpio}/command` |
| `assign_zone()` | Zone-Assignment-Panel | `POST /v1/zone/devices/{id}/assign` |
| `trigger_heartbeat()` | Heartbeat-Button | `POST /v1/debug/mock-esp/{id}/heartbeat` |
| `set_auto_heartbeat()` | Auto-HB Toggle | `POST /v1/debug/mock-esp/{id}/auto-heartbeat` |
| `start_simulation()` | Start Simulation | `POST /v1/debug/mock-esp/{id}/simulation/start` |

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
```

### Plugin-Capabilities

| Capability | Bedeutung | Ausführungs-Reihenfolge |
|-----------|-----------|------------------------|
| `VALIDATE` | System-Validierung | 1. (zuerst) |
| `CONFIGURE` | Geräte konfigurieren | 2. |
| `DIAGNOSE` | Probleme diagnostizieren | 3. |
| `FIX` | Probleme beheben | 4. |
| `MONITOR` | System überwachen | 5. |
| `DOCUMENT` | Dokumentation erstellen | 6. (zuletzt) |
| `TEST` | Tests ausführen | - |
| `CLEANUP` | Aufräumen | - |

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

## 5. ESP Configurator - GPIO-Zuweisungsstrategie

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

---

## 6. Runner & CLI

### Direkt aufrufen
```bash
cd "El Servador"

# Vollständiger Workflow
poetry run python -m god_kaiser_server.src.autoops.runner \
    --mode full \
    --sensors DS18B20,SHT31,PH \
    --actuators RELAY,PUMP \
    --zone "Gewächshaus"

# Nur Health Check
poetry run python -m god_kaiser_server.src.autoops.runner --mode health

# Nur Debug
poetry run python -m god_kaiser_server.src.autoops.runner --mode debug

# JSON Output
poetry run python -m god_kaiser_server.src.autoops.runner --mode health --json
```

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

## 7. Reports

Jede AutoOps-Session generiert einen Markdown-Report:

```
autoops/reports/autoops_session_{session_id}_{timestamp}.md
```

Report-Inhalt:
- Session-Zusammenfassung (ID, Zeitstempel, Status)
- Plugin-Ergebnisse (pro Plugin: Actions, Errors, Warnings)
- Vollständiger API-Action-Log (jeder API-Call mit Timestamp, Method, Endpoint, Status)
- Finale Zusammenfassung (Passed/Failed, Error-Count)

---

## 8. Integration mit Claude Code

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

## 9. Erweiterbarkeit

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

**Letzte Aktualisierung:** 2026-02-15
**Version:** 1.0.0
