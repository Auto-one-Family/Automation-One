# Log-Zugriff – Agent-Referenz

> **Version:** 1.4 | **Stand:** 2026-02-13
> **Zweck:** Zentrale Referenz für Log-Dateien, Prioritäten und Erstellung
> **Verknüpfung:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) für Pfade und Capture-Methoden

---

## 1. Agent → Log-Hierarchie (Priorität beim Lesen)

| Agent | Primär | Erweitert (wenn vorhanden) | Fallback |
|-------|--------|---------------------------|----------|
| server-debug | `logs/current/god_kaiser.log` | `logs/current/server_loki_errors.log`, `logs/current/server_api_filtered.log` | `logs/server/god_kaiser.log` |
| mqtt-debug | `logs/current/mqtt_traffic.log` | `logs/current/mqtt_broker_loki.log` | `docker compose logs mqtt-broker` / Loki (kein Bind-Mount) |
| frontend-debug | `logs/current/frontend_container.log` | `logs/current/frontend_loki.log` | Loki `compose_service=el-frontend` / `docker compose logs el-frontend` |
| esp32-debug | `logs/current/esp32_serial.log` | - | - |
| test-log-analyst | `logs/backend/`, `logs/frontend/`, `logs/wokwi/reports/`, `logs/server/` (Test-Outputs) | CI: `gh run view --log`, Artifacts nach Download | - |

**Regel:** Debug-Agents haben Terminal für vollen Stack-Zugriff (docker logs, curl). test-log-analyst hat gh CLI (CI-Logs). session.sh erstellt Logs bei Session-Start. **PowerShell:** `&&` funktioniert nicht – `;` verwenden (z.B. `cd path; docker compose logs --tail=100 mqtt-broker`). Siehe [LOG_LOCATIONS.md](LOG_LOCATIONS.md) Sektion 9.4.

---

## 2. Wer erstellt welche Dateien

| Quelle | Erstellt von | Zeitpunkt | Debug-Agent |
|-------|--------------|-----------|-------------|
| `logs/current/mqtt_traffic.log` | session.sh | Session-Start | mqtt-debug |
| `logs/current/god_kaiser.log` | session.sh (Symlink) | Session-Start | server-debug |
| `logs/current/esp32_serial.log` | User (Wokwi/Monitor) | Während Test | esp32-debug |
| `logs/current/frontend_container.log` | session.sh (Initial) + system-control (Refresh) | Start + Ende Test | frontend-debug |
| `logs/current/server_loki_errors.log` | session.sh | Session-Start (bei Monitoring) | server-debug |
| `logs/current/mqtt_broker_loki.log` | session.sh | Session-Start (bei Monitoring) | mqtt-debug |
| `logs/current/frontend_loki.log` | session.sh | Session-Start (bei Monitoring) | frontend-debug |
| `logs/current/STATUS.md` | session.sh | Session-Start | Alle (via SYSTEM_CONTROL_REPORT) |

---

## 3. Loki / Debug API Verfügbarkeit

| Quelle | Wann verfügbar | Nutzung |
|--------|----------------|---------|
| Loki (`localhost:3100`) | Nur bei `docker compose --profile monitoring up` | session.sh führt Loki-Queries bei Session-Start aus, schreibt Export in `logs/current/*_loki_*.log` |
| Debug API (`/api/v1/debug/logs`) | Immer wenn Server läuft | Optional: `level=ERROR` exportieren |

**Loki-Befehle (für session.sh):** [LOG_LOCATIONS.md](LOG_LOCATIONS.md) Sektion 12. Labels: `service` (Compose-Service: `el-servador`, `mqtt-broker`, `el-frontend`) oder `container` (Container-Name: `automationone-server`, `automationone-mqtt`, `automationone-frontend`). Windows: `curl.exe` statt `curl`.

> **Achtung:** Das Label `service_name` existiert ebenfalls (Docker SD Auto-Label), ist aber ambig (mischt Container- und Service-Namen). Stattdessen `service` verwenden.

**Hinweis:** Erweiterte Log-Dateien (Loki-Exports) existieren nur bei aktivem Monitoring-Profil.

---

## 4. Vollständige Stack-Nutzung

In Debug-Agent-Skills dokumentiert: Welche Dateien wann existieren (z.B. Loki-Exports nur bei `--profile monitoring`).

---

## 5. Verweis

- **Pfad-Details:** [LOG_LOCATIONS.md](LOG_LOCATIONS.md)
- **Flow-Kontext:** [flow_reference.md](../testing/flow_reference.md) F1.2–F1.4
- **Session-Script:** `scripts/debug/start_session.sh`
