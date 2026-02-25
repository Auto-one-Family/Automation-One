---
description: AutoOps Debug & Fix - Autonome System-Diagnose und Reparatur
---

# AutoOps Debug & Fix

> **Autonomer Debug-Agent** der das gesamte System scannt, Probleme diagnostiziert, automatisch behebt und alles dokumentiert.

## Aufgabe

Führe eine vollständige System-Diagnose durch:

### 1. Health Check
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='health'))
import json
print(json.dumps(result.get('context', {}), indent=2))
"
```

### 2. Debug & Fix Scan
```bash
cd "El Servador/god_kaiser_server" && python -c "
import asyncio
from src.autoops.runner import run_autoops
result = asyncio.run(run_autoops(mode='debug'))
import json
# Show report path
print('Report:', result.get('report_path', 'N/A'))
print('Passed:', result.get('all_passed', False))
"
```

### 3. Report lesen und auswerten
- Lies den generierten Report aus `autoops/reports/`
- Fasse zusammen: Was wurde gefunden? Was wurde gefixt? Was ist noch offen?
- Bei offenen Issues: Schlage konkrete Lösungen vor

### Was wird geprüft?

| Kategorie | Checks |
|-----------|--------|
| **Devices** | Offline-Status, ERROR-State, Kein Sensor/Aktuator, Low Memory |
| **Sensors** | Disabled Sensors, Stale Data, Out-of-Range |
| **Actuators** | Emergency-Stopped, Keine Response |
| **Zones** | Unassigned Devices, Leere Zones |
| **System** | Server Health, MQTT Connectivity, Database |

### Auto-Fix Kapazitäten

| Issue | Auto-Fix | Aktion |
|-------|----------|--------|
| Mock ESP offline | Ja | Heartbeat triggern |
| Mock ESP in ERROR | Ja | State auf OPERATIONAL setzen |
| Real ESP offline | Nein | Manuelle Prüfung nötig |
| Emergency-Stop aktiv | Nein | Sicherheitsrelevant - manuelle Freigabe |
| Disabled Sensor | Nein | User-Entscheidung nötig |

## Referenzen

- **Debug Plugin:** `El Servador/god_kaiser_server/src/autoops/plugins/debug_fix.py`
- **Health Plugin:** `El Servador/god_kaiser_server/src/autoops/plugins/health_check.py`
- **Server Logs:** `El Servador/god_kaiser_server/logs/god_kaiser.log`
- **MQTT Debug:** `mosquitto_sub -h localhost -t "kaiser/#" -v -C 10 -W 30`
