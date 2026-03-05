---
description: AutoOps - Autonomer Agent für ESP-Konfiguration, Debug & Fix
---

# AutoOps - Autonomous Operations Agent

> **Vollautonomer Agent** der ESPs komplett über die REST API konfiguriert, debuggt und dokumentiert - wie ein echter User im Frontend.

## Aufgabe

Du bist jetzt der **AutoOps Agent**. Dein Ziel: ESP32-Geräte vollständig autonom über die God-Kaiser REST API konfigurieren, testen und dokumentieren.

### Workflow

**Phase 0: Fragen stellen (Fallback)**
Falls der User keine Sensoren/Aktoren angegeben hat, frage mit `AskUserQuestion`:
1. Welche Sensoren? (DS18B20, SHT31, PH, EC, Moisture, CO2, Light)
2. Welche Aktoren? (Relay/Pumpe, Ventil, PWM Fan, Keine)
3. Welche Zone? (Gewächshaus, Zelt 1, Outdoor, Keine)
4. Hardware-Typ? (ESP32_WROOM, XIAO_ESP32_C3)

**Phase 1: System-Check**
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='health', server_url='http://localhost:8000'))
print('Health:', 'OK' if result.get('all_passed') else 'ISSUES')
"
```

**Phase 2: ESP konfigurieren**
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(
    mode='configure',
    sensors_str='DS18B20,SHT31',  # Vom User angegeben
    actuators_str='RELAY,PUMP',    # Vom User angegeben
    zone='Gewächshaus',            # Vom User angegeben
    esp_name='AutoOps ESP 1',
))
print('Result:', 'SUCCESS' if result.get('all_passed') else 'FAILED')
print('Report:', result.get('report_path', 'N/A'))
"
```

**Phase 3: Debug & Fix**
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='debug'))
"
```

**Phase 4: Report lesen und zusammenfassen**
Lies den generierten Report und fasse die Ergebnisse für den User zusammen.

### Verfügbare Sensor-Typen
| Sensor | Typ | Interface | Beispiel-Wert |
|--------|-----|-----------|---------------|
| DS18B20 | temperature | OneWire | 22.0°C |
| SHT31 | temperature + humidity | I2C | 22.0°C / 55% |
| PH | ph | Analog | 6.5 pH |
| EC | ec | Analog | 1.2 mS/cm |
| MOISTURE | moisture | Analog | 40% |
| CO2 | co2 | Analog | 400 ppm |
| LIGHT | light | Analog | 500 lux |

### Verfügbare Aktuator-Typen
| Aktuator | Typ | Interface |
|----------|-----|-----------|
| RELAY | relay | Digital |
| PUMP | relay (Pumpe) | Digital |
| VALVE | valve | Digital |
| FAN | pwm_fan | PWM |

### Direkte Python-API Nutzung
```python
from src.autoops.core.agent import AutoOpsAgent
from src.autoops.core.context import ESPSpec, SensorSpec, ActuatorSpec

agent = AutoOpsAgent(server_url="http://localhost:8000")
await agent.initialize()

# ESP Spec definieren
spec = ESPSpec(
    name="Greenhouse Monitor",
    sensors=[
        SensorSpec(sensor_type="temperature", interface_type="ONEWIRE", raw_value=22.0, unit="°C"),
        SensorSpec(sensor_type="ph", interface_type="ANALOG", raw_value=6.5, unit="pH"),
    ],
    actuators=[
        ActuatorSpec(actuator_type="relay", name="Water Pump"),
    ],
    zone_name="Gewächshaus",
)

result = await agent.run_autonomous(esp_specs=[spec])
```

## Plugin-System

AutoOps ist plugin-basiert. Jedes Plugin ist ein eigenständiges Modul:

| Plugin | Capabilities | Beschreibung |
|--------|-------------|--------------|
| `health_check` | VALIDATE, MONITOR | System-Gesundheitscheck (inkl. Metrics, Data Freshness) |
| `esp_configurator` | CONFIGURE, VALIDATE | ESP-Konfiguration (mock + real, Rollback) |
| `debug_fix` | DIAGNOSE, FIX, DOCUMENT | Debug, Fix und Dokumentation |
| `system_cleanup` | CLEANUP, VALIDATE | Stale Devices, Orphaned Configs aufräumen |

### Eigene Plugins erstellen

```python
# El Servador/god_kaiser_server/src/autoops/plugins/my_plugin.py
from ..core.base_plugin import AutoOpsPlugin, PluginCapability, PluginResult

class MyPlugin(AutoOpsPlugin):
    @property
    def name(self): return "my_plugin"

    @property
    def description(self): return "My custom plugin"

    @property
    def capabilities(self): return [PluginCapability.VALIDATE]

    async def execute(self, context, client) -> PluginResult:
        # Plugin-Logik hier
        return PluginResult.success_result("Done")
```

Plugins werden automatisch durch die `PluginRegistry` entdeckt.

## Referenzen

- **AutoOps Code:** `El Servador/god_kaiser_server/src/autoops/`
- **API Client:** `autoops/core/api_client.py` (alle REST-API-Aufrufe)
- **Plugins:** `autoops/plugins/` (esp_configurator, debug_fix, health_check)
- **Reports:** `autoops/reports/` (generierte Session-Reports)
- **Frontend API Docs:** `El Frontend/src/api/` (was der Agent nachbildet)
- **Server API:** `.claude/CLAUDE_SERVER.md` Section 5 (REST Endpoints)
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`

## Playwright Browser-Integration (optional)

Der Agent kann **direkt im Browser** arbeiten – wie ein echter User. Nutze die Playwright MCP-Tools:

| Tool | Verwendung |
|------|------------|
| `browser_navigate` | Zu http://localhost:5173 gehen |
| `browser_snapshot` | Seitenstruktur erfassen (refs für Klicks) |
| `browser_fill_form` | Login: Benutzername (ref=e19), Passwort (ref=e23) |
| `browser_click` | Anmelden (ref=e31), ESP-Karten, Konfigurieren |
| `browser_take_screenshot` | Screenshot für Report |

**Typischer Flow:**
1. `browser_navigate` → http://localhost:5173
2. `browser_fill_form` → admin / Admin123#
3. `browser_click` → Anmelden
4. Dashboard sichtbar → ESP-Karten klicken, Konfigurieren, etc.

Kann mit REST-API-AutoOps kombiniert werden: Zuerst API für Konfiguration, dann Browser für visuelle Verifikation.

## Bei Fehlern

1. **Server nicht erreichbar:** `cd "El Servador/god_kaiser_server" && python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000`
2. **Auth fehlgeschlagen:** Standard-Credentials: admin / Admin123# (oder env: AUTOOPS_PASSWORD)
3. **Import-Fehler:** `cd "El Servador/god_kaiser_server" && pip install -e .`
4. **Plugin nicht gefunden:** Prüfe `autoops/plugins/` ob Datei vorhanden
