---
description: AutoOps Status - Zeige AutoOps Plugin-Übersicht und letzte Reports
---

# AutoOps Status

> Zeigt den aktuellen Status des AutoOps Agent-Systems.

## Aufgabe

### 1. Plugin-Registry anzeigen
```bash
cd "El Servador/god_kaiser_server" && python -c "
from src.autoops.core.plugin_registry import PluginRegistry
registry = PluginRegistry()
discovered = registry.discover_plugins()
print(f'Discovered: {discovered} plugins')
for p in registry.list_plugins():
    print(f'  [{p[\"name\"]}] v{p[\"version\"]} - {p[\"description\"]}')
    print(f'    Capabilities: {p[\"capabilities\"]}')
"
```

### 2. Letzte Reports auflisten
```bash
ls -la "El Servador/god_kaiser_server/src/autoops/reports/" 2>/dev/null || echo "No reports yet"
```

### 3. Letzten Report lesen (wenn vorhanden)
Falls Reports existieren, lies den neuesten und fasse die Ergebnisse zusammen.

### 4. System-Übersicht
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.core.agent import AutoOpsAgent
agent = AutoOpsAgent()
async def check():
    init = await agent.initialize()
    scan = await agent.scan_system()
    await agent.cleanup()
    print('=== System Overview ===')
    print(f'Server: {init[\"health_status\"]}')
    print(f'Auth: {init[\"auth_status\"]}')
    print(f'Devices: {scan[\"devices\"]} ({scan[\"online\"]} online)')
    print(f'Sensors: {scan[\"sensors\"]}')
    print(f'Actuators: {scan[\"actuators\"]}')
    print(f'Zones: {scan[\"zones\"]}')
asyncio.run(check())
"
```

## Referenzen

- **AutoOps Framework:** `El Servador/god_kaiser_server/src/autoops/`
- **Reports:** `El Servador/god_kaiser_server/src/autoops/reports/`
