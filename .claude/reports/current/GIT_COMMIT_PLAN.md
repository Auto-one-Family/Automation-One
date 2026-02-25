# Git Commit Plan
**Erstellt:** 2026-02-25
**Branch:** master
**Ungepushte Commits:** 0
**Änderungen gesamt:** 42 modified, ~32 untracked, 0 staged

---

## Überblick

Vier zusammenhängende Feature-Bereiche plus Infrastruktur und Doku-Updates:

1. **Alloy Native Migration** — Docker/Loki Monitoring-Stack auf native River-Config
2. **Cross-Layer Correlation** — `seq` Counter (ESP32) + Correlation-ID (Server) + X-Request-ID (Frontend)
3. **Multi-Value Sensor Splitting** — SHT31/BMP280/BME280 Base-Type → Sub-Types (Server + Firmware + Frontend)
4. **Hardware-Test F4 Flow** — Neuer Skill, Hardware-Profile, Session-Script hw-test Modus

---

## Commit 1: chore(docker): migrate Alloy to native River config with structured metadata

**Was:** Alloy von `--config.format=promtail` (Promtail-YAML) auf native River-Config migriert. Loki bekommt `allow_structured_metadata: true` für erweiterte Labels (logger, request_id, component, device, error_code). Neue Loki Alert Rules (5 log-pattern-basierte Alerts) und Debug Console Grafana Dashboard hinzugefügt. Alte Promtail-Config archiviert.

**Dateien:**
- `docker-compose.yml` — Alloy volumes/command auf `config.alloy` umgestellt
- `docker/alloy/config.alloy` — **NEU** Native Alloy River-Format (304 Zeilen)
- `docker/loki/loki-config.yml` — `allow_structured_metadata: true` hinzugefügt
- `docker/promtail/config.yml` — Archived-Header (nicht mehr aktiv)
- `docker/promtail/config.yml.archive` — **NEU** Backup der alten Config
- `docker/grafana/provisioning/alerting/loki-alert-rules.yml` — **NEU** 5 Loki-basierte Alert Rules
- `docker/grafana/provisioning/dashboards/debug-console.json` — **NEU** Debug Console Dashboard

**Befehle:**
```bash
git add docker-compose.yml docker/alloy/ docker/loki/loki-config.yml docker/promtail/config.yml docker/promtail/config.yml.archive docker/grafana/provisioning/alerting/loki-alert-rules.yml docker/grafana/provisioning/dashboards/debug-console.json
git commit -m "$(cat <<'EOF'
chore(docker): migrate Alloy to native River config with structured metadata

Replace --config.format=promtail with native config.alloy (River format).
Enable Loki structured metadata (logger, request_id, component, device,
error_code). Add 5 Loki-based alert rules and Debug Console dashboard.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 2: feat(scripts): add Loki debug queries, workflow docs and CLI tools

**Was:** Loki-Query-Helfer-Script (`loki-query.sh`) für CLI-Zugriff auf häufige Debug-Queries. Vier Makefile-Targets (`loki-errors`, `loki-trace`, `loki-esp`, `loki-health`). Zwei neue Doku-Dateien: 10 LogQL-Referenz-Queries und 10 Debug-Szenarien mit Root-Cause-Matrix.

**Dateien:**
- `scripts/loki-query.sh` — **NEU** CLI Wrapper für Loki API (96 Zeilen)
- `Makefile` — 4 neue Targets + Help-Text aktualisiert
- `docs/debugging/logql-queries.md` — **NEU** 10 LogQL Debug-Queries Referenz
- `docs/debugging/debug-workflow.md` — **NEU** 10 Debug-Szenarien mit Root-Cause-Matrix

**Befehle:**
```bash
git add scripts/loki-query.sh Makefile docs/debugging/
git commit -m "$(cat <<'EOF'
feat(scripts): add Loki debug queries, workflow docs and CLI tools

Add loki-query.sh helper script with 4 Makefile targets (loki-errors,
loki-trace, loki-esp, loki-health). Document 10 LogQL queries and
10 debug scenarios with root-cause matrix.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 3: feat(server): add MQTT correlation ID and multi-value sensor splitting

**Was:** MQTT-Handler generieren jetzt menschenlesbare Correlation-IDs (`{esp_id}:{topic}:{seq}:{ts_ms}`) statt `-`. WebSocket-Broadcasts propagieren die Correlation-ID zum Frontend. Sensor-API splittet Multi-Value-Sensoren (z.B. "sht31" → "sht31_temp" + "sht31_humidity") in separate Config-Einträge. GPIO-Konflikt-Check überspringt I2C/OneWire-Sensoren (Bus-Sharing). AutoOps API Client bekommt `approve_device()` und neuen Hardware-Profil-Validator.

**Dateien:**
- `El Servador/god_kaiser_server/src/core/request_context.py` — `generate_mqtt_correlation_id()` Funktion
- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` — Refactored auf `generate_mqtt_correlation_id()`
- `El Servador/god_kaiser_server/src/websocket/manager.py` — `correlation_id` Parameter in `broadcast()`/`broadcast_threadsafe()`
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` — Multi-value sensor splitting Logik
- `El Servador/god_kaiser_server/src/services/config_builder.py` — I2C/OneWire GPIO-Konflikt-Ausnahme
- `El Servador/god_kaiser_server/src/autoops/core/api_client.py` — `approve_device()` Methode
- `El Servador/god_kaiser_server/src/autoops/core/profile_validator.py` — **NEU** Hardware-Profil-Validation

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/src/core/request_context.py" "El Servador/god_kaiser_server/src/mqtt/subscriber.py" "El Servador/god_kaiser_server/src/websocket/manager.py" "El Servador/god_kaiser_server/src/api/v1/sensors.py" "El Servador/god_kaiser_server/src/services/config_builder.py" "El Servador/god_kaiser_server/src/autoops/core/api_client.py" "El Servador/god_kaiser_server/src/autoops/core/profile_validator.py"
git commit -m "$(cat <<'EOF'
feat(server): add MQTT correlation ID and multi-value sensor splitting

Generate human-readable correlation IDs for MQTT messages
({esp_id}:{topic}:{seq}:{ts_ms}) and propagate through WebSocket
broadcasts. Split multi-value sensor types (sht31, bmp280, bme280)
into individual sub-type configs. Skip I2C/OneWire in GPIO conflict
check. Add approve_device API and hardware profile validator.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 4: feat(firmware): add seq counter to all MQTT payloads and base sensor types

**Was:** Jede MQTT-Publish-Nachricht vom ESP32 enthält jetzt ein `"seq"` Feld (monoton steigend via `mqttClient.getNextSeq()`). Betrifft: Heartbeat, Sensor-Data, Actuator-Status/Response/Alert, Config-Response, Zone-ACK, Emergency, OneWire-Scan, System-Commands. Sensor-Registry bekommt Base-Type-Entries (sht31, bmp280, bme280) für Server-Config-Kompatibilität.

**Dateien:**
- `El Trabajante/src/main.cpp` — `seq` in ~20 Publish-Stellen hinzugefügt
- `El Trabajante/src/services/actuator/actuator_manager.cpp` — `seq` in Status, Response, Alert
- `El Trabajante/src/services/config/config_response.cpp` — `seq` in Config-Response
- `El Trabajante/src/models/sensor_registry.cpp` — Base-Type Capabilities (SHT31, BMP280, BME280)

**Befehle:**
```bash
git add "El Trabajante/src/main.cpp" "El Trabajante/src/services/actuator/actuator_manager.cpp" "El Trabajante/src/services/config/config_response.cpp" "El Trabajante/src/models/sensor_registry.cpp"
git commit -m "$(cat <<'EOF'
feat(firmware): add seq counter to all MQTT payloads and base sensor types

Add monotonic seq field to every MQTT publish (heartbeat, sensor data,
actuator status/response/alert, config response, zone ACK, emergency,
onewire scan, system commands). Register base type capabilities for
sht31, bmp280, bme280 multi-value sensors.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 5: feat(frontend): add correlation tracing and multi-value sensor support

**Was:** Axios Request-Interceptor generiert `X-Request-ID` Header (UUID) für jede HTTP-Anfrage und loggt die Server-Response-ID. WebSocket-Messages parsen `correlation_id` Feld für Cross-Layer-Tracing. AddSensorModal zeigt passende Toast-Nachricht für Multi-Value-Sensoren.

**Dateien:**
- `El Frontend/src/api/index.ts` — `X-Request-ID` Header + Logging
- `El Frontend/src/services/websocket.ts` — `correlation_id` in WebSocketMessage Interface + Log
- `El Frontend/src/components/esp/AddSensorModal.vue` — Multi-Value-Sensor Toast-Feedback

**Befehle:**
```bash
git add "El Frontend/src/api/index.ts" "El Frontend/src/services/websocket.ts" "El Frontend/src/components/esp/AddSensorModal.vue"
git commit -m "$(cat <<'EOF'
feat(frontend): add correlation tracing and multi-value sensor support

Generate X-Request-ID header on every HTTP request for cross-layer
tracing. Parse correlation_id from WebSocket messages. Show appropriate
toast feedback for multi-value sensors (sht31, bmp280, bme280).

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 6: test(correlation): add cross-layer correlation test suite

**Was:** Neue Test-Suite für das Correlation-ID-System über alle drei Layer. Server: 14 Unit-Tests für ID-Generierung + 4 Integration-Tests für WebSocket-Propagation. Frontend: Vitest für X-Request-ID Interceptor. Wokwi: 5 Szenarien für seq-Counter (Inkrement, MQTT-Reconnect-Survival, Reboot-Reset, All-Payloads, Error-Messages).

**Dateien:**
- `El Servador/god_kaiser_server/tests/unit/test_correlation_id.py` — **NEU** 14 Unit-Tests
- `El Servador/god_kaiser_server/tests/integration/test_websocket_correlation.py` — **NEU** 4 Integration-Tests
- `El Frontend/tests/unit/config/correlation.test.ts` — **NEU** Frontend Correlation-Tests
- `El Trabajante/tests/wokwi/scenarios/12-correlation/` — **NEU** 5 Wokwi-Szenarien

**Befehle:**
```bash
git add "El Servador/god_kaiser_server/tests/unit/test_correlation_id.py" "El Servador/god_kaiser_server/tests/integration/test_websocket_correlation.py" "El Frontend/tests/unit/config/correlation.test.ts" "El Trabajante/tests/wokwi/scenarios/12-correlation/"
git commit -m "$(cat <<'EOF'
test(correlation): add cross-layer correlation test suite

Add 14 unit tests for MQTT correlation ID generation, 4 integration
tests for WebSocket propagation, frontend tests for X-Request-ID
interceptor, and 5 Wokwi scenarios for ESP32 seq counter behavior.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 7: feat(skills): add hardware-test skill with profiles and session support

**Was:** Neuer hardware-test Skill (F4 Flow) für Agent-orchestrierte Hardware-Tests. Drei YAML-Profile (sht31_basic, ds18b20_basic, sht31_ds18b20_relay) definieren Sensor/Aktor-Setups. `start_session.sh` unterstützt `--mode hw-test` mit Profil-Auswahl und STATUS.md-Embedding.

**Dateien:**
- `.claude/skills/hardware-test/SKILL.md` — **NEU** F4 Hardware-Test Skill (261 Zeilen)
- `.claude/hardware-profiles/README.md` — **NEU** Profil-Format-Dokumentation
- `.claude/hardware-profiles/sht31_basic.yaml` — **NEU** SHT31 Einzelsensor-Profil
- `.claude/hardware-profiles/ds18b20_basic.yaml` — **NEU** DS18B20 Einzelsensor-Profil
- `.claude/hardware-profiles/sht31_ds18b20_relay.yaml` — **NEU** Kombinations-Profil
- `scripts/debug/start_session.sh` — hw-test Modus mit Profil-Handling

**Befehle:**
```bash
git add .claude/skills/hardware-test/ .claude/hardware-profiles/ scripts/debug/start_session.sh
git commit -m "$(cat <<'EOF'
feat(skills): add hardware-test skill with profiles and session support

Add F4 hardware-test skill for agent-orchestrated hardware testing.
Define 3 YAML profiles (sht31_basic, ds18b20_basic, sht31_ds18b20_relay).
Extend start_session.sh with --mode hw-test and profile embedding.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 8: docs(agents): update agents and references for Loki integration and HW-Test

**Was:** Alle 8 Debug/System-Agents bekommen Loki-first Analyse-Strategie und Write-Tool. DB-Queries in Skills korrigiert (richtige Spalten, JOINs statt falsche `esp_device_id`). CLAUDE.md Router erweitert (hardware-test Trigger, Loki-Debug Sektion). 12 Reference-Docs aktualisiert für Alloy native Config, Structured Metadata, und F4 Flow.

**Dateien:**
- `.claude/CLAUDE.md` — hardware-test Skill + Loki-Debug Sektion + docs/debugging Referenz
- `.claude/agents/db-inspector.md` — Write tool
- `.claude/agents/esp32-debug.md` — Loki cross-layer queries, DB-Query fixes, Write tool
- `.claude/agents/frontend-debug.md` — Playwright-Alternative Hinweis, Write tool
- `.claude/agents/meta-analyst.md` — Write tool, Report-Schreiberlaubnis
- `.claude/agents/mqtt-debug.md` — Loki-first Analyse, Write tool
- `.claude/agents/server-debug.md` — Loki-first Analyse, Write tool
- `.claude/agents/system-control.md` — HW-Test-Briefing, Credentials/Commands korrigiert
- `.claude/agents/test-log-analyst.md` — Write tool
- `.claude/skills/esp32-debug/SKILL.md` — DB-Tabellen korrigiert (korrekte Spalten/JOINs)
- `.claude/skills/server-debug/SKILL.md` — MQTT Correlation Format, DB-Tabellen korrigiert
- `.claude/reference/ROADMAP_KI_MONITORING.md` — Structured Metadata Felder, native River
- `.claude/reference/api/WEBSOCKET_EVENTS.md` — Minor update
- `.claude/reference/debugging/ACCESS_LIMITATIONS.md` — Loki/Alloy update
- `.claude/reference/debugging/LOG_ACCESS_REFERENCE.md` — Loki/Alloy update
- `.claude/reference/debugging/LOG_LOCATIONS.md` — Loki/Alloy update
- `.claude/reference/infrastructure/DOCKER_AKTUELL.md` — Alloy native config
- `.claude/reference/infrastructure/DOCKER_REFERENCE.md` — Alloy native config
- `.claude/reference/patterns/COMMUNICATION_FLOWS.md` — Minor update
- `.claude/reference/testing/SYSTEM_OPERATIONS_REFERENCE.md` — Loki/Alloy update
- `.claude/reference/testing/TEST_WORKFLOW.md` — Minor update
- `.claude/reference/testing/WOKWI_TESTING.md` — Minor update
- `.claude/reference/testing/agent_profiles.md` — F4 Flow update
- `.claude/reference/testing/flow_reference.md` — F4 Flow update

**Befehle:**
```bash
git add .claude/CLAUDE.md .claude/agents/ .claude/skills/esp32-debug/SKILL.md .claude/skills/server-debug/SKILL.md .claude/reference/
git commit -m "$(cat <<'EOF'
docs(agents): update agents and references for Loki and HW-Test

Add Loki-first analysis strategy and Write tool to all 8 debug/system
agents. Fix DB queries in skills (correct column names, JOINs). Update
CLAUDE.md router with hardware-test trigger and Loki-Debug section.
Refresh 12 reference docs for Alloy native config and F4 flow.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Commit 9: chore(scripts): add lifecycle cleanup script

**Was:** Python-Script für DB-Cleanup nach Device/Sensor-Lifecycle-Fix. Entfernt verwaiste Mock-ESPs und stale Daten.

**Dateien:**
- `scripts/cleanup_lifecycle.py` — **NEU** DB Cleanup Script (111 Zeilen)

**Befehle:**
```bash
git add scripts/cleanup_lifecycle.py
git commit -m "$(cat <<'EOF'
chore(scripts): add lifecycle cleanup script

Add database cleanup script for stale mock ESP devices and orphaned
sensor data after device/sensor lifecycle fix.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## NICHT COMMITTEN (Session-Artefakte)

Diese Dateien sind Session-spezifische Reports/Artefakte und sollten **nicht** committed werden:

| Datei | Grund |
|-------|-------|
| `.claude/reports/current/ESP32_DEV_REPORT.md` | Session Report |
| `.claude/reports/current/F4_AGENT_VERIFICATION.md` | Session Report |
| `.claude/reports/current/F4_COMPLETE_OVERVIEW.md` | Session Report |
| `.claude/reports/current/F4_IMPLEMENTATION_STATUS.md` | Session Report |
| `.claude/reports/current/F4_VERIFICATION_REPORT.md` | Session Report |
| `.claude/reports/current/HARDWARE_TEST_ORCHESTRATION_ARCHITECTURE.md` | Session Report |
| `.claude/reports/current/SHT31_ANALYSIS_REPORT.md` | Session Report |
| `.claude/reports/current/loki-debug-flow-verifikation-2026-02-25.md` | Session Report |
| `.claude/worktrees/` | Worktree-Artefakte (ggf. `.gitignore`) |
| `DEVICE_SENSOR_LIFECYCLE_REPORT.md` | Root-Level Report (verschieben/löschen) |

---

## Abschluss

**Nach allen Commits:**
```bash
# Status prüfen
git status

# Push
git push origin master
```

**Zusammenfassung:**

| # | Commit | Dateien | Typ |
|---|--------|---------|-----|
| 1 | `chore(docker): migrate Alloy to native River config with structured metadata` | 7 | chore |
| 2 | `feat(scripts): add Loki debug queries, workflow docs and CLI tools` | 4 | feat |
| 3 | `feat(server): add MQTT correlation ID and multi-value sensor splitting` | 7 | feat |
| 4 | `feat(firmware): add seq counter to all MQTT payloads and base sensor types` | 4 | feat |
| 5 | `feat(frontend): add correlation tracing and multi-value sensor support` | 3 | feat |
| 6 | `test(correlation): add cross-layer correlation test suite` | 8 | test |
| 7 | `feat(skills): add hardware-test skill with profiles and session support` | 6 | feat |
| 8 | `docs(agents): update agents and references for Loki and HW-Test` | 24 | docs |
| 9 | `chore(scripts): add lifecycle cleanup script` | 1 | chore |
| **Σ** | | **64** | |

**Hinweise:**
- Reihenfolge ist wichtig: Infrastruktur (1-2) vor Code (3-5) vor Tests (6) vor Meta (7-9)
- Commit 3+4+5 bilden zusammen das Correlation-ID Feature über alle 3 Layer
- Commit 8 ist bewusst groß (24 Dateien) — alles reine Doku-Updates die zusammengehören
- Reports in `.claude/reports/current/` und `.claude/worktrees/` NICHT committen
- `DEVICE_SENSOR_LIFECYCLE_REPORT.md` im Root sollte nach `.claude/reports/` verschoben oder gelöscht werden
