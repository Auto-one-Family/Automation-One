# VERIFY-PLAN-REPORT — implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11

**Gate:** Skill `.claude/skills/verify-plan/SKILL.md`  
**Plan-Datei:** `.claude/auftraege/auto-debugger/inbox/implementierungsplan-PKG-NVS-CONFIG-FULLSTACK-2026-04-11.md`  
**Gebundener Ordner:** `.claude/reports/current/incidents/INC-NVS-CONFIG-CONSISTENCY-2026-04-11/`

---

## /verify-plan Ergebnis

**Plan:** Multi-Layer NVS/Config/DELETE/UI-Konsistenz mit Firmware-, Server-, Frontend- und OBS-Paketen.  
**Geprüft:** Pfade (Stichprobe), Docker-Service-Namen, Agent-Pfade, Test-Kommandos, `platformio.ini`-Envs.

### Bestätigt

- Pfade `El Trabajante/src/services/config/storage_manager.cpp`, `config_manager.cpp`, `main.cpp`, `El Servador/god_kaiser_server/src/api/v1/sensors.py`, `schemas/sensor.py`, `mqtt/handlers/sensor_handler.py`, `El Frontend/src/shared/stores/config.store.ts`, `esp32_error_mapping.py` existieren und stimmen mit Plan-Zitaten überein.  
- `docker compose ps` im Repo-Root: Services `postgres`, `mqtt-broker`, `el-servador`, `el-frontend` heißen **so** in `docker-compose.yml` (nicht `mqtt`/`server`).  
- PlatformIO: `[env:seeed_xiao_esp32c3]` und `[env:esp32_dev]` existieren in `El Trabajante/platformio.ini`.  
- `tests/integration/test_api_sensors.py` existiert (Integration DELETE-Szenarien erweiterbar).  
- WebSocket `sensor_config_deleted` sendet `str(config_id)` — gut für JSON.

### Korrekturen nötig (in TASK-PACKAGES übernommen)

**[Agents]: Dev-Agent-Pfade**  
- Plan/Fließtext erwähnt generisch „server-dev“ — **IST-Datei:** `.claude/agents/server/server_dev_agent.md` (snake_case). Analog `esp32-dev` → `.claude/agents/esp32/esp32-dev-agent.md`, `frontend-dev` → `.claude/agents/frontend/frontend_dev_agent.md`.

**[Tests]: pytest-Kontext**  
- `pytest` muss aus `El Servador/god_kaiser_server` mit `poetry run pytest` gestartet werden (nicht Repo-Root ohne Poetry).  
- **Windows-IST (Robin-VM):** `poetry` steht ggf. nicht im PATH — Fallback verifiziert:  
  `cd "...\god_kaiser_server"; .\.venv\Scripts\pytest.exe tests/integration/test_api_sensors.py -q` (Exit 0 am 2026-04-11).

**[Firmware]: Wokwi-Hinweis**  
- NVS in Wokwi eingeschränkt — Hardware- oder gezielte Serial-Verifikation für PKG-A nicht durch Wokwi allein ersetzen.

### Fehlende Vorbedingungen

- [ ] Reproduzierender Stacktrace für UUID-`TypeError` (Server-Log oder pytest), falls Problem noch aktiv.  
- [ ] Optional: `curl` DELETE gegen laufenden Stack mit gültigem JWT für manuelle HTTP-Body-Prüfung.

### Ergänzungen

- Health-Check für API: `/api/v1/health/live` (Port 8000) laut Referenz/AGENTS.md.  
- Korrelation: `request_id`-Middleware ist im Server aktiv (siehe geänderte Dateien im Working Tree) — OBS-Paket kann darauf aufsetzen.

### Zusammenfassung für TM

Der Plan ist **ausführbar**; Pfade und Compose-Namen passen zur Codebase. Anpassungen: **konkrete Agent-Dateipfade**, **pytest immer unter `god_kaiser_server`**, **Wokwi-Grenze** für NVS explizit kommunizieren. UUID-Fehler bleibt bis zum grünen Regressionstest eine **Hypothese** mit Backend-Fokus.

---

## OUTPUT FÜR ORCHESTRATOR (auto-debugger)

### PKG → Delta
| PKG | Delta (Pfad, Testbefehl/-pfad, Reihenfolge, Risiko, HW-Gate, verworfene Teile) |
|-----|-----------------------------------------------------------------------------------|
| PKG-01 | Firmware-Pfade bestätigt; Verify `pio run -e seeed_xiao_esp32c3` aus `El Trabajante`; HW-Gate: echte Serial-NVS unter Last; Wokwi nur eingeschränkt. |
| PKG-02 | pytest-Pfad: `cd "...\god_kaiser_server"; poetry run pytest tests/integration/test_api_sensors.py -q`; bei UUID-Fehler Stack erfassen; WS-Payload ist bereits str — Fokus HTTP/Logging. |
| PKG-03 | Frontend: `config.store.ts` + Server `esp32_error_mapping.py`; Verify `npx vue-tsc --noEmit` + `npx vitest run`. |
| PKG-04 | OBS: `config_handler.py`/`esp_service.py`; Verify gezielte `pytest tests/unit/...`. |
| PKG-05 | Doku nur nach Freeze; keine verworfenen Pakete. |

### PKG → empfohlene Dev-Rolle
| PKG | Rolle |
|-----|--------|
| PKG-01 | esp32-dev |
| PKG-02 | server-dev |
| PKG-03 | frontend-dev (+ server-dev für Mapping-Texte) |
| PKG-04 | server-dev |
| PKG-05 | TM / Docs |

### Cross-PKG-Abhängigkeiten
- PKG-01 → PKG-03: UI-Texte zu NVS sinnvoll erst, wenn Firmware Unterscheidung liefert oder Server-Texte angepasst wurden.  
- PKG-02 → PKG-03: stabile DELETE-Response verhindert irreführende Fehler-Cascaden in der UI.

### BLOCKER
- Kein technischer Blocker für Start; **HW-Evidenz** für NVS-Race weiterhin empfohlen (`BLOCKER` nur wenn kein physischer ESP verfügbar).
