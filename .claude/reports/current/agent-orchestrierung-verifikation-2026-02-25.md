# Agent-Orchestrierung & MCP Tool-Chain Verifikation

**Datum:** 2026-02-25 10:50 UTC
**Agent:** auto-ops (Rolle 1: Operations)
**Auftrag:** MCP-Server-Health, Tool-Chain-Validierung, Report-Pfade, Delegation-Tiefe, auto-ops Playbook-Konsistenz
**Bezug:** auftrag-f4-implementierung.md, auftrag-f4-optimierung-final.md, iot-monitoring-verifikation-fallstricke-2026.md (A1-A5)

---

## Gesamt-Bewertung

| Bereich | Status | Fazit |
|---------|--------|-------|
| Block A: MCP-Server Health | PASS (mit Korrekturen) | Alle Services erreichbar. Auftrag hatte falsche Credentials/Container-Namen |
| Block B: Agent-Tool-Inventar | PASS | 396 Dateien referenzieren externe Tools, alle korrekt kategorisiert |
| Block C: mosquitto_sub Safety | WARN | 9 unsichere Aufrufe ohne -C/-W. Hook faengt Runtime ab, aber Doku ist inkonsistent |
| Block D: Report-Pfade | PASS | 14 eindeutige HW_TEST-Report-Namen, Pfade konsistent |
| Block E: Delegation-Tiefe | PASS | auto-ops delegiert korrekt, Debug-Agents nutzen KEIN Task-Tool |
| Block F: HW_TEST_STATE.json | WARN | In auto-ops definiert, aber hardware-test Skill referenziert es NICHT |
| Block G: Tool-Chain E2E | PASS | Grafana, Prometheus, Loki, MQTT Round-Trip, PostgreSQL alle funktional |
| Plugin Cache Sync | CRITICAL | auto-ops.md, docker-operations, loki-queries Source vs. Cache DESYNC |
| debug-status.ps1 | WARN | False Positives bei Server + Loki Health (zeigt critical, ist aber ok) |

---

## Block A: MCP-Server Health-Check

### Ergebnisse

| Service | Status | Details |
|---------|--------|---------|
| Docker Containers | OK | 11/11 running, alle healthy |
| Grafana (3000) | OK | v11.5.2, database ok |
| Prometheus (9090) | OK | Server is Ready |
| Loki (3100) | OK | ready, query_range funktional |
| MQTT Broker (1883) | OK | Pub/Sub funktional |
| PostgreSQL (5432) | OK | accepting connections, god_kaiser/god_kaiser_db |
| Server (8000) | OK | /api/v1/health/live = alive:true |
| Frontend (5173) | OK | Port erreichbar |

### Korrekturen am Auftrag

| Auftrag-Befehl | Problem | Korrekt |
|----------------|---------|---------|
| `docker exec automationone-mqtt-broker ...` (A5) | Container existiert nicht | `docker exec automationone-mqtt ...` |
| `pg_isready -U autoone` (A6) | User existiert nicht | `pg_isready -U god_kaiser -d god_kaiser_db` |
| `curl -sG .../query` (G, Loki instant) | Instant query not supported for log queries | `curl -sG .../query_range` mit start/end Parameter |

### Service-Name-Mapping (Referenz)

| Docker Compose Service | Container Name | Ports |
|------------------------|---------------|-------|
| mqtt-broker | automationone-mqtt | 1883, 9001 |
| el-servador | automationone-server | 8000 |
| el-frontend | automationone-frontend | 5173 |
| postgres | automationone-postgres | 5432 |
| grafana | automationone-grafana | 3000 |
| prometheus | automationone-prometheus | 9090 |
| loki | automationone-loki | 3100 |
| alloy | automationone-alloy | 12345 |
| cadvisor | automationone-cadvisor | 8080 |
| postgres-exporter | automationone-postgres-exporter | 9187 |
| mqtt-logger | automationone-mqtt-logger | - |

**Regel:** `docker compose` Befehle nutzen Service-Namen. `docker exec` nutzt Container-Namen.

---

## Block B: Agent-Tool-Inventar

396 Dateien in `.claude/` referenzieren externe Tools. Aufgeteilt nach Agent-Typ:

| Agent/Skill | mosquitto_sub | docker exec/compose | curl | psql | pio |
|-------------|:---:|:---:|:---:|:---:|:---:|
| esp32-debug | 6x | ja | ja | - | - |
| server-debug | 3x | ja | ja | ja | - |
| mqtt-debug | 18x | ja | ja | - | - |
| frontend-debug | 3x | ja | ja | - | - |
| system-control | 3x | ja | ja | ja | ja |
| auto-ops | 8x | ja | ja | ja | ja |
| backend-inspector | 1x (Regel) | ja | ja | ja | - |
| hardware-test Skill | 1x | ja | ja | ja | ja |

**Bewertung:** Vollstaendige Abdeckung. Jeder Agent hat die Tools die er fuer seine Rolle braucht.

---

## Block C: mosquitto_sub Safety

### PreToolUse Hook

```json
{
  "type": "command",
  "command": "... if mosquitto_sub without -C/-W → exit 2 (BLOCKED) ..."
}
```

**Hook funktioniert korrekt.** Alle Runtime-Aufrufe ohne `-C`/`-W` werden blockiert.

### Unsichere Referenzen in Dokumentation

9 Stellen in Agent/Skill-Dateien zeigen `mosquitto_sub`-Befehle ohne `-C` und `-W`:

| Datei | Zeile | Befehl | Typ |
|-------|-------|--------|-----|
| `.claude/skills/mqtt-debug/SKILL.md` | 238 | `mosquitto_sub -t $SYS/#` | Tabellen-Referenz |
| `.claude/skills/mqtt-debug/SKILL.md` | 327 | `mosquitto_sub --retained-only` | Prose-Referenz |
| `.claude/skills/mqtt-debug/SKILL.md` | 342 | `mosquitto_sub -t $SYS/#` | Tabellen-Referenz |
| `.claude/skills/mqtt-development/SKILL.md` | 662 | `mosquitto_sub -h localhost -t "kaiser/#" -v` | Code-Kommentar |
| `.claude/skills/system-control/SKILL.md` | 104 | `mosquitto_sub -t "kaiser/#" -v` | make-Target Beschreibung |
| `.claude/skills/system-control/SKILL.md` | 151 | `docker compose exec mqtt-broker mosquitto_sub -t "kaiser/#" -v` | make-Target Beschreibung |
| `.claude/commands/autoops/debug.md` | 67 | `mosquitto_sub -h localhost -t "kaiser/#" -v` | Quick-Reference |
| `.claude/local-marketplace/auto-ops/skills/mqtt-analysis/SKILL.md` | 200 | `mosquitto_sub --retained-only` | Tabellen-Referenz |
| `.claude/skills/esp32-debug/SKILL.md` | 282,365 | `mosquitto_sub` (generisch) | Tabellen-Referenz |

**Risiko:** Mittel. Hook schuetzt Runtime, aber Agents koennten die Doku-Beispiele als Vorlage kopieren und dann am Hook scheitern.

**Empfehlung:** Alle Doku-Referenzen mit `-C N -W N` Suffix ergaenzen, auch in Tabellen.

---

## Block D: Report-Pfade Konsistenz

### Definierte HW_TEST Report-Namen

| Report-Name | Definiert in | Phase |
|-------------|-------------|-------|
| `HW_TEST_PHASE_SETUP.md` | auto-ops + hw-test Skill | Phase 2 |
| `HW_TEST_PHASE_VERIFY.md` | auto-ops + hw-test Skill | Phase 4 |
| `HW_TEST_PHASE_STABILITY.md` | auto-ops + hw-test Skill | Phase 5 |
| `HW_TEST_ESP32_DEBUG.md` | auto-ops (Task-Prompt) | Phase 4 (bei Problemen) |
| `HW_TEST_SERVER_DEBUG.md` | auto-ops (Task-Prompt) | Phase 4 (bei Problemen) |
| `HW_TEST_MQTT_DEBUG.md` | auto-ops (Task-Prompt) | Phase 4 (bei Problemen) |
| `HW_TEST_FRONTEND_DEBUG.md` | auto-ops (Task-Prompt) | Phase 4 (bei Problemen) |
| `HW_TEST_META_ANALYSIS.md` | auto-ops (Task-Prompt) | Phase 6 |
| `HW_TEST_FINAL_REPORT.md` | hw-test Skill | Phase 6 |
| `HW_TEST_STATE.json` | auto-ops | Persistent State |

### Pfad-Konsistenz

Alle Pfade nutzen einheitlich `.claude/reports/current/HW_TEST_*`. Keine Abweichungen.

`HW_TEST_PHASE_M.md` und `HW_TEST_PHASE_N.md` sind Platzhalter in `HARDWARE_TEST_ORCHESTRATION_ARCHITECTURE.md` (Architektur-Beispiel), keine echten Report-Ziele.

**Bewertung:** PASS. Pfade sind konsistent.

---

## Block E: Delegation-Tiefe

### auto-ops Delegations-Map

```
auto-ops (Orchestrator)
  |-- Task(backend-inspector)     [Rolle 2]
  |-- Task(frontend-inspector)    [Rolle 3]
  |-- Task(system-control)        [hw-test Skill Phase 1]
  |-- Task(auto-ops)              [hw-test Skill Phase 2,4,5 - self-reference]
  |-- Task(esp32-debug)           [Rolle 5, Phase 4 bei Problemen]
  |-- Task(server-debug)          [Rolle 5, Phase 4 bei Problemen]
  |-- Task(mqtt-debug)            [Rolle 5, Phase 4 bei Problemen]
  |-- Task(frontend-debug)        [Rolle 5, Phase 4 bei Problemen]
  |-- Task(meta-analyst)          [Rolle 5, Phase 6]
```

### Debug-Agents: Task-Tool Check

| Agent-Datei | Referenziert Task()? | Status |
|-------------|---------------------|--------|
| `.claude/agents/esp32-debug.md` | NEIN | OK |
| `.claude/agents/server-debug.md` | NEIN | OK |
| `.claude/agents/mqtt-debug.md` | NEIN | OK |
| `.claude/agents/frontend-debug.md` | NEIN | OK |
| `.claude/agents/meta-analyst.md` | NEIN | OK |

**Bewertung:** PASS. Korrekte 1-Level-Delegation. Debug-Agents sind Leaf-Nodes.

---

## Block F: HW_TEST_STATE.json

### Definition in auto-ops.md

```json
{
  "profile_name": "sht31_basic",
  "session_start": "2026-02-24T14:30:00Z",
  "device_id": "ESP_ABC123",
  "current_phase": "verify",
  "phases": {
    "precheck": {"status": "completed", "timestamp": "..."},
    "setup": {"status": "completed", "timestamp": "...", "report": "HW_TEST_PHASE_SETUP.md"},
    "verify": {"status": "in_progress", "timestamp": "..."},
    "stability": {"status": "pending"},
    "meta": {"status": "pending"}
  },
  "debug_agents_invoked": ["esp32-debug", "server-debug"],
  "errors": []
}
```

### Inkonsistenz

| Quelle | Referenziert STATE.json? | Details |
|--------|------------------------|---------|
| `auto-ops.md` (Agent) | JA | Schema definiert, Regeln dokumentiert |
| `hardware-test/SKILL.md` (Skill) | NEIN | Kein Verweis auf STATE.json |

**Problem:** Der hw-test Skill ruft auto-ops mehrmals auf (Phase 2, 4, 5). Zwischen den Aufrufen geht der auto-ops Context verloren. STATE.json soll als Persistent State dienen, aber der Skill uebergibt den State-Pfad nicht explizit an auto-ops.

**Empfehlung:** In `hardware-test/SKILL.md` bei jeder Task(auto-ops)-Anweisung explizit hinzufuegen:
```
State-Datei: .claude/reports/current/HW_TEST_STATE.json
(Lesen bei Start, Aktualisieren nach Abschluss)
```

---

## Block G: Tool-Chain End-to-End

| Check | Ergebnis | Details |
|-------|----------|---------|
| Grafana Alert Rules | 33 | Alle provisioniert, erreichbar via `-u admin:admin` |
| Prometheus Targets | 7 up | Alle Scrape-Targets aktiv |
| Loki Query | success | `query_range` mit compose_service Label funktioniert |
| loki-query.sh health | OK | 11 active streams, ready |
| MQTT Round-Trip | OK | Pub -> Sub in <1s |
| PostgreSQL esp_devices | 6 Devices | Tabelle existiert, Daten vorhanden |
| Server /health/live | alive: true | Korrekt |

**Bewertung:** PASS. Gesamte Tool-Chain funktional.

---

## Plugin Cache Desync (CRITICAL)

### Betroffene Dateien

| Datei | Desync-Typ | Auswirkung |
|-------|-----------|------------|
| `agents/auto-ops.md` | Source hat dynamische Stabilitaetstest-Dauer + Grafana Auth + Range-Validierung. Cache hat hardcoded 6x5min. | **Hoch:** Stabilitaetstest ignoriert Profil-Dauer. Grafana-Query schlaegt fehl (keine Auth). |
| `skills/docker-operations/SKILL.md` | Source hat Alloy, Cache hat Promtail | **Mittel:** Falsche Service-Referenz bei Docker-Debugging |
| `skills/loki-queries/SKILL.md` | Source hat aktualisierte CLI-Referenzen + Makefile-Commands. Cache hat alte Version. | **Mittel:** Agent nutzt veraltete Query-Beispiele |

### Source-Verbesserungen (auto-ops.md, nicht im Cache)

1. **Dynamische Loop-Berechnung:** `ITERATIONS=$((DURATION_MIN / INTERVAL_MIN))` statt hardcoded `6`
2. **Device-spezifische DB-Queries:** `WHERE e.device_id = '${DEVICE_ID}'` statt `WHERE timestamp > NOW()`
3. **Grafana Auth:** `curl -s -u admin:admin http://localhost:3000/...` statt `curl -s http://localhost:3000/...`
4. **Range-Validierung:** Automatischer Vergleich gegen expected_ranges aus Profil
5. **Statistik-Aggregation:** Min/Max/Avg/StdDev SQL-Query nach Loop

### Fix

```bash
# Cache-Verzeichnis aktualisieren (MANUELL durch User)
cp -r .claude/local-marketplace/auto-ops/* ~/.claude/plugins/cache/automationone-local/auto-ops/2.0.0/
```

**ACHTUNG:** Cache wird bei Plugin-Reload/Session-Start ueberschrieben. Langfristige Loesung: Plugin-Version auf 2.0.1 hochsetzen.

---

## debug-status.ps1 False Positives

### Problem

Script zeigt `overall: critical` obwohl alle Services laufen:
- Server: `status: error, live: false` -- aber `curl` bestaetigt alive
- Loki: `status: error, ready: false` -- aber `curl` bestaetigt ready

### Root Cause Hypothese

1. **Server (Zeile 139):** `Invoke-WebRequest` in PowerShell 5.1 auf Windows nutzt `WinHTTP`. Moeglicher Proxy- oder TLS-Konfigurationsfehler. `Invoke-RestMethod` (Zeile 140, detailed) funktioniert aber auch nicht (kein uptime im Output).
2. **Loki (Zeile 218-219):** `$lokiReady.body -match "ready"` -- wenn `Invoke-WebRequest` den Body nicht als String zurueckgibt, schlaegt der Match fehl.

### Auswirkung

**Mittel:** Agents die Playbook 0 (Quick Start) ausfuehren, erhalten `critical` Status und starten unnoetige Diagnose-Routinen.

### Empfehlung

Refactoring von `Invoke-HttpCheck` fuer plain-text Responses oder Wechsel zu `curl`-basiertem Health-Check.

---

## Weitere Funde

### 1. Loki Instant Query vs. Range Query

Der Auftrag (Block G) verwendet:
```bash
curl -sG "http://localhost:3100/loki/api/v1/query" --data-urlencode 'query={compose_service=~".+"}'
```
Dies schlaegt fehl mit: `log queries are not supported as an instant query type`.

**Fix:** Immer `query_range` mit `start` und `end` nutzen. Das auto-ops Playbook (Zeile im System-Prompt) referenziert die korrekte Loki-Nutzung, aber die Skill-Dateien koennten konsistenter sein.

### 2. Grafana Auth in Playbooks

Das auto-ops Agent-Playbook (Zeile 531 in Source) wurde korrekt auf `-u admin:admin` aktualisiert. Der Cache hat noch die Version ohne Auth. Grafana 11.5.2 erfordert Auth fuer die Provisioning-API.

### 3. Hardware-Profil Validierung

3 Profile vorhanden: `sht31_basic.yaml`, `ds18b20_basic.yaml`, `sht31_ds18b20_relay.yaml`. Alle YAML-gueltig, GPIO-Nummern plausibel.

---

## Fix-Liste (Priorisiert)

| # | Prioritaet | Bereich | Fix | Aufwand |
|---|-----------|---------|-----|---------|
| 1 | CRITICAL | Plugin Cache | Source nach Cache kopieren ODER Version 2.0.1 deployen | 5 Min |
| 2 | HIGH | hw-test Skill | STATE.json-Referenz in alle Task(auto-ops)-Aufrufe einfuegen | 10 Min |
| 3 | HIGH | debug-status.ps1 | Server + Loki Health-Check fixen (PowerShell HTTP-Handling) | 30 Min |
| 4 | MEDIUM | mosquitto_sub Doku | 9 Stellen in Skills/Commands mit -C/-W ergaenzen | 15 Min |
| 5 | LOW | Auftrag-Template | Container-Namen, DB-Credentials, Loki-Query-Typ korrigieren | Info |

---

## Akzeptanzkriterien

| Kriterium | Status |
|-----------|--------|
| Alle MCP-Server erreichbar | PASS |
| Alle externen Tools (mosquitto_sub, curl, psql, docker, pio) funktional | PASS |
| mosquitto_sub-Aufrufe alle mit -C und -W (Runtime) | PASS (Hook schuetzt) |
| mosquitto_sub-Aufrufe alle mit -C und -W (Dokumentation) | WARN (9 Stellen offen) |
| Report-Pfade konsistent | PASS |
| Delegation korrekt (1-Level, keine Zyklen) | PASS |
| HW_TEST_STATE.json definiert und referenziert | WARN (fehlt in hw-test Skill) |
| Plugin Source = Plugin Cache | FAIL (3 Dateien desync) |
| Tool-Chain End-to-End funktional | PASS |
| debug-status.ps1 korrekt | WARN (False Positives) |

**Gesamt-Urteil:** Die Agent-Orchestrierung ist funktional korrekt konfiguriert. Alle Tools sind erreichbar und die Delegation funktioniert wie geplant. **3 Fixes erforderlich** bevor ein F4 Hardware-Test zuverlaessig laufen kann: (1) Plugin-Cache synchronisieren, (2) STATE.json in hw-test Skill referenzieren, (3) debug-status.ps1 False Positives beheben.
