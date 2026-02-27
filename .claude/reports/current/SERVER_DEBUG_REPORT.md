# Server Debug Report

**Erstellt:** 2026-02-27
**Modus:** B (Spezifisch: "Vollstaendige Code-Analyse des God-Kaiser Servers - Imports, Abhaengigkeiten, AutoOps, Fehler")
**Quellen:** `src/main.py`, `src/autoops/` (alle Dateien), `src/api/v1/__init__.py`, `src/mqtt/handlers/__init__.py`, `src/db/repositories/__init__.py`, `pyproject.toml`, `logs/server/god_kaiser.log`

---

## 1. Zusammenfassung

Die Code-Analyse des God-Kaiser Servers zeigt **4 Probleme unterschiedlicher Schwere**: Eine fehlende Abhaengigkeit (`PyYAML`) in `pyproject.toml`, drei nicht ins Routing eingebundene API-Router (`ai`, `kaiser`, `library`), ein sich wiederholendes ZONE_MISMATCH-Problem fuer Mock-ESPs (73 Eintraege im Log), sowie einen leeren `kaiser_handler.py` (PLANNED-Status). Der Server startet und laeuft stabil - keine CRITICAL- oder ERROR-Level-Eintraege im Log. Handlungsbedarf fuer die fehlende Abhaengigkeit und die nicht eingebundenen Router.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `src/main.py` | OK | 767 Zeilen, vollstaendige Startup-Sequenz |
| `pyproject.toml` | PROBLEM | `yaml` wird importiert, `PyYAML` fehlt in Dependencies |
| `src/autoops/` (7 Module) | OK mit Ausnahme | Struktur vollstaendig, ein fehlender Dep |
| `src/api/v1/__init__.py` | PROBLEM | 3 Router nicht eingebunden (ai, kaiser, library) |
| `src/mqtt/handlers/__init__.py` | OK | Alle 12 Handler korrekt registriert |
| `src/db/repositories/__init__.py` | OK | Alle 12 Repositories korrekt exportiert |
| `src/core/resilience/__init__.py` | OK | Vollstaendig |
| `logs/server/god_kaiser.log` | OK | 7029 Zeilen, kein ERROR/CRITICAL |
| `src/mqtt/handlers/kaiser_handler.py` | HINWEIS | Leere Datei (PLANNED, noch nicht implementiert) |

---

## 3. Befunde

### 3.1 Fehlende Abhaengigkeit: PyYAML

- **Schwere:** Hoch
- **Datei:** `src/autoops/core/profile_validator.py`, Zeile 6
- **Detail:** `import yaml` wird importiert, aber `PyYAML` (oder `pyyaml`) ist **nicht** in `pyproject.toml` unter `[tool.poetry.dependencies]` aufgefuehrt. Der Import wird beim Laden des AutoOps-Moduls ausgefuehrt. Wenn `profile_validator.py` importiert wird (auch transitiv), faellt der Server mit `ModuleNotFoundError` aus - es sei denn, PyYAML ist durch eine andere transitive Abhaengigkeit installiert.
- **Evidenz:**
  ```
  src/autoops/core/profile_validator.py:6: import yaml
  pyproject.toml: kein Eintrag fuer pyyaml oder PyYAML
  ```
- **Einschraenkung:** `profile_validator.py` wird nicht in `__init__.py` der autoops-Module importiert und wird nur bei direktem Aufruf genutzt (F4 Hardware-Test-Flow). Der Fehler tritt daher nicht im normalen Server-Betrieb auf, wohl aber beim Hardware-Test.

### 3.2 Drei Nicht-Eingebundene API-Router

- **Schwere:** Mittel
- **Detail:** Die folgenden drei Dateien in `src/api/v1/` definieren einen `router`, der aber **nicht** in `src/api/v1/__init__.py` importiert und nicht in den `api_v1_router` eingebunden wird. Die Endpoints sind daher im laufenden Server nicht erreichbar:
  - `src/api/v1/ai.py` - Router prefix `/ai`, tags=`["ai"]`
  - `src/api/v1/kaiser.py` - Router prefix `/kaiser`, tags=`["kaiser"]`
  - `src/api/v1/library.py` - Router prefix `/library`, tags=`["library"]`
- **Evidenz:**
  ```python
  # src/api/v1/ai.py:32
  router = APIRouter(prefix="/ai", tags=["ai"])

  # src/api/v1/kaiser.py:30
  router = APIRouter(prefix="/kaiser", tags=["kaiser"])

  # src/api/v1/library.py:33
  router = APIRouter(prefix="/library", tags=["library"])

  # src/api/v1/__init__.py: Kein Import fuer ai, kaiser oder library
  ```
- **Kontext:** `kaiser.py` enthaelt vermutlich Kaiser-Node-Management. `ai.py` und `library.py` haben Implementierungen, sind aber nicht erreichbar. Die zugehoerigen DB-Repositories `ai_repo.py`, `kaiser_repo.py` und `library_repo.py` existieren ebenfalls, werden aber nicht in `src/db/repositories/__init__.py` exportiert.

### 3.3 Leerer kaiser_handler.py (PLANNED)

- **Schwere:** Niedrig (Dokumentiert)
- **Datei:** `src/mqtt/handlers/kaiser_handler.py`
- **Detail:** Die Datei enthaelt nur einen Docstring und keine Implementierung. Status ist explizit als "PLANNED" markiert. Der Handler ist korrekt **nicht** in `src/mqtt/handlers/__init__.py` eingebunden.
- **Evidenz:**
  ```python
  # src/mqtt/handlers/kaiser_handler.py - nur Docstring, keine Funktionen
  # Status: PLANNED - To be implemented
  ```

### 3.4 ZONE_MISMATCH - Endlosschleife fuer Mock-ESPs

- **Schwere:** Mittel (Funktional korrekt, aber Log-Spam)
- **Detail:** Mock-ESPs senden in jedem Heartbeat `zone_assigned=false`, da sie keine echte NVS-Persistenz haben. Der Server erkennt dies als Zone-Verlust und sendet alle 60 Sekunden einen Reassign-Befehl. Da Mock-ESPs diesen Befehl nie bestaetigen (kein ACK-Mechanismus fuer die Simulation), wiederholt sich der Zyklus indefinit. Im Log finden sich **73 ZONE_MISMATCH-Eintraege** fuer ein und dieselbe ESP-ID (`MOCK_0CBACD10` und spaeter `MOCK_95A49FCB`).
- **Evidenz:**
  ```json
  {"level": "WARNING", "message": "ZONE_MISMATCH [MOCK_0CBACD10]: ESP lost zone config (zone_assigned=false). DB has zone_id='test'. Auto-reassigning zone."}
  // Wiederholung: 73 mal, jede 60 Sekunden
  ```
- **Ursache:** Mock-ESP-Simulation sendet keine `zone_assigned=true` im naechsten Heartbeat, da die SimulationScheduler-Heartbeat-Payloads immer den Default `zone_assigned=false` enthalten.

### 3.5 APScheduler Missed-Job Warnungen

- **Schwere:** Niedrig (Operational)
- **Detail:** APScheduler meldet mehrfach verpasste Job-Ausfuehrungen. Dies geschieht bei Server-Neustarts (Jobs werden geplant, aber verpasst, weil der Event-Loop kurz blockiert). Kein Datenverlust.
- **Evidenz:**
  ```json
  {"level": "WARNING", "message": "Run time of job 'MaintenanceService._health_check_esps ...' was missed by 0:00:44.997361"}
  {"level": "WARNING", "message": "Job monitor_health_check_esps missed scheduled run"}
  ```

### 3.6 Orphaned Mock Detection - Zustandsinkonsistenz

- **Schwere:** Niedrig (Informativ)
- **Detail:** `MOCK_0CBACD10` wurde als "Orphaned Mock" erkannt: DB-Status war `running`, aber kein aktiver Simulator war vorhanden. Korrektur erfolgte automatisch (Status auf `stopped` gesetzt).
- **Evidenz:**
  ```json
  {"level": "WARNING", "message": "Orphaned Mock detected: MOCK_0CBACD10 - State was 'running' but no active simulation found. Set to 'stopped'."}
  ```

### 3.7 JWT Token Expiry - Erwartetes Verhalten

- **Schwere:** Keine (Normal)
- **Detail:** Mehrfache JWT-Ablauf-Warnungen (`Signature has expired`) und ein `Refresh token is blacklisted`. Dies ist normales Verhalten bei Browser-Session-Neustarts.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Grep: `import yaml` in src/ | 1 Treffer: `profile_validator.py:6` |
| Grep: `pyyaml` in pyproject.toml | Kein Treffer - Abhaengigkeit fehlt |
| Grep: `kaiser_handler` in main.py | Kein Treffer - korrekt nicht verwendet |
| Grep: `ai.py/kaiser.py/library.py` Router in `__init__.py` | Kein Treffer - Router nicht eingebunden |
| Log: `"level": "ERROR"` | 0 Treffer |
| Log: `"level": "CRITICAL"` | 0 Treffer |
| Log: `"level": "WARNING"` | 73x ZONE_MISMATCH, 7x APScheduler missed, 6x JWT expired, 1x Orphaned Mock |
| Startup-Sequenz vollstaendig | Ja: alle 20+ Steps in Log bestaetigt |
| MQTT-Handler registriert | 12 Handler (15 inkl. Mock-ESP) - bestaetigt im Log |
| DB-Circuit-Breaker | Initialisiert: threshold=3, recovery=10s |
| Zirkulaere Imports | Keine gefunden - AutoOps nutzt korrekte relative Imports |
| Third-Party: `httpx` | `src/autoops/core/api_client.py` - In pyproject.toml: Ja (`^0.26.0`) |
| Third-Party: `yaml` | `src/autoops/core/profile_validator.py` - In pyproject.toml: **NEIN** → Risiko bei F4 |
| Third-Party: `fastapi`, `pydantic`, `sqlalchemy` | Alle in pyproject.toml vorhanden |
| Third-Party: `paho-mqtt`, `apscheduler`, `prometheus_client` | Alle in pyproject.toml vorhanden |
| Third-Party: `psutil`, `passlib`, `python-jose` | Alle in pyproject.toml vorhanden |
| AutoOps-Modul Vollstaendigkeit | 4 Plugins (health_check, esp_configurator, debug_fix, system_cleanup) - komplett |
| AutoOps-Problem | `profile_validator.py` - yaml Import ohne Abhaengigkeit |

### 4.1 AutoOps-Modul Struktur

```
src/autoops/
  __init__.py              OK - Version definiert
  runner.py                OK - CLI Entry Point
  core/
    __init__.py            OK - Alle Exports vollstaendig
    agent.py               OK
    api_client.py          OK - httpx korrekt importiert
    base_plugin.py         OK
    context.py             OK
    plugin_registry.py     OK
    profile_validator.py   PROBLEM - yaml Import ohne Abhaengigkeit
    reporter.py            OK
  plugins/
    __init__.py            OK
    debug_fix.py           OK
    esp_configurator.py    OK
    health_check.py        OK
    system_cleanup.py      OK
```

---

## 5. Bewertung & Empfehlung

**Gesamt-Bewertung:** Server ist funktional stabil. Kein einziger ERROR- oder CRITICAL-Eintrag im gesamten Log. Die gefundenen Probleme betreffen Vollstaendigkeit und zukuenftige Erweiterungen.

**Root Causes:**

1. **PyYAML fehlt in pyproject.toml** - Wurde bei der Implementierung von `profile_validator.py` vergessen. Tritt nur bei F4 Hardware-Test auf, nicht im normalen Server-Betrieb.

2. **Drei Orphan-Router** - `ai.py`, `kaiser.py`, `library.py` wurden implementiert aber nie in das Routing eingebunden. Mouglicherweise unfertige Features.

3. **ZONE_MISMATCH-Schleife** - Mock-ESP-Simulation sendet keinen `zone_assigned=true` nach Empfang des Reassign-Befehls. Die Heartbeat-Payload-Template der SimulationScheduler setzt `zone_assigned` nicht dynamisch basierend auf dem aktuellen ESP-Zustand.

**Naechste Schritte:**

| Prioritaet | Massnahme | Datei |
|-----------|-----------|-------|
| 1 (Hoch) | `pyyaml = "^6.0"` in `pyproject.toml` ergaenzen | `pyproject.toml` |
| 2 (Mittel) | `ai_router`, `kaiser_router`, `library_router` in `api/v1/__init__.py` einbinden ODER als deprecated markieren | `src/api/v1/__init__.py` |
| 3 (Mittel) | SimulationScheduler Heartbeat-Payload: `zone_assigned` dynamisch aus ESP-DB-Zustand befuellen, um ZONE_MISMATCH-Schleife zu beenden | `src/services/simulation/scheduler.py` |
| 4 (Niedrig) | `kaiser_handler.py` implementieren oder als Feature-Placeholder dokumentieren | `src/mqtt/handlers/kaiser_handler.py` |
