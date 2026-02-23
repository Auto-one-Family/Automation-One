# Phase 0: Error-Taxonomie & Grafana-Alerts

> **Voraussetzung:** Docker-Stack laeuft (12/13 healthy)
> **Abhaengigkeit:** Keine — Fundament fuer alle Phasen
> **Nachfolger:** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md), [Phase 2](./PHASE_2_PRODUKTIONSTESTFELD.md) (parallel)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 0"

---

## Ziel

Einheitliches Fehlersystem das BEIDE Spuren (Wokwi + Produktion) nutzen. Grafana-Alert-Regeln von 8 auf 28+ erweitern. KI-Error-Analyse Stufe 1 (rule-based) konfigurieren.

---

## Schritt 0.1: Error-Taxonomie Audit

### Ist-Zustand pruefen

**Agent:** `system-control` (Briefing-Modus)
**Skill:** `/system-control`

| Pruefung | Datei | Erwartung |
|----------|-------|-----------|
| ESP32 Error-Codes vollstaendig | `El Trabajante/src/models/error_codes.h` | Codes 1000-4999 definiert |
| Server Error-Codes vollstaendig | `El Servador/god_kaiser_server/src/core/error_codes.py` | Codes 5000-5699 definiert |
| Error-Code-Referenz aktuell | `.claude/reference/errors/ERROR_CODES.md` | Matches Source-Dateien |
| Audit-Log-Tabelle Schema | `El Servador/god_kaiser_server/src/db/models/audit_log.py` | event_type, severity, error_code Felder |

> **[VERIFY-PLAN] Alle 4 Pfade verifiziert — existieren und enthalten erwartete Inhalte.**
> - error_codes.h: 100 Codes (1000-4202) ✅
> - error_codes.py: 55 Server-Codes (5001-5642) + ESP32-Mirror ✅
> - ERROR_CODES.md: Version 1.1, aktuell ✅
> - audit_log.py: event_type, severity, error_code Felder vorhanden ✅
>
> **Bekannte Sync-Luecken (ESP32 → Python Mirror):**
> - DS18B20 (1060-1063): In error_codes.h, FEHLT in ESP32HardwareError IntEnum
> - I2C Bus-Recovery (1015-1018): In error_codes.h, FEHLT in ESP32HardwareError IntEnum

### Aktionen

1. **Quell-Dateien lesen und vergleichen:**
   - `El Trabajante/src/models/error_codes.h` (ESP32)
   - `El Servador/god_kaiser_server/src/core/error_codes.py` (Server)
   - `.claude/reference/errors/ERROR_CODES.md` (Referenz-Dok)

2. **Luecken identifizieren:**
   - Fehlende Codes in Referenz-Dok
   - Codes die in Source existieren aber nicht dokumentiert
   - Inkonsistenzen zwischen ESP32 und Server Kategorien

3. **Referenz-Dok aktualisieren** falls Abweichungen gefunden

### Verifikation

```bash
# ESP32 Error-Codes zaehlen
grep -c "ERROR_" "El Trabajante/src/models/error_codes.h"

# Server Error-Codes zaehlen
grep -c "= 5" "El Servador/god_kaiser_server/src/core/error_codes.py"
```

---

## Schritt 0.2: Test-Error-Block 6000-6099 definieren

### Motivation

Der Master-Plan identifiziert: Test-spezifische Fehler (Wokwi-Timeout, Mock-ESP-Config-Fehler) sind aktuell NICHT abgedeckt. Block 6000-6099 fuer Testinfrastruktur-Fehler einfuehren.

### Vorgeschlagene Codes

| Code | Name | Beschreibung | Kontext |
|------|------|-------------|---------|
| 6000 | `TEST_WOKWI_TIMEOUT` | Wokwi-Simulation Timeout ueberschritten | CI/CD + Lokal |
| 6001 | `TEST_WOKWI_BOOT_INCOMPLETE` | ESP32-Boot in Simulation unvollstaendig | CI/CD |
| 6002 | `TEST_MOCK_ESP_CONFIG_INVALID` | Mock-ESP Konfiguration ungueltig | Seed-Script |
| 6010 | `TEST_SCENARIO_ASSERTION_FAILED` | Wokwi-Szenario Assertion fehlgeschlagen | pytest |
| 6011 | `TEST_SCENARIO_NOT_FOUND` | Referenziertes Szenario existiert nicht | CI/CD |
| 6020 | `TEST_MQTT_INJECTION_FAILED` | MQTT-Inject im Test fehlgeschlagen | Wokwi CI |
| 6021 | `TEST_MQTT_BROKER_UNAVAILABLE` | Test-Broker nicht erreichbar | CI/CD |
| 6030 | `TEST_DOCKER_SERVICE_UNHEALTHY` | Docker-Service unhealthy waehrend Test | E2E |
| 6031 | `TEST_DB_SEED_FAILED` | Testdaten-Seeding fehlgeschlagen | E2E |
| 6040 | `TEST_PLAYWRIGHT_TIMEOUT` | Frontend E2E Test Timeout | Playwright |
| 6041 | `TEST_PLAYWRIGHT_ELEMENT_NOT_FOUND` | UI-Element nicht gefunden | Playwright |
| 6050 | `TEST_SERIAL_LOG_MISSING` | Expected Serial-Log Pattern nicht gefunden | Wokwi |

### Implementierung

**Agent:** `server-dev`

**Datei:** `El Servador/god_kaiser_server/src/core/error_codes.py`

> **[VERIFY-PLAN] Klasse sollte IntEnum verwenden (Pattern der bestehenden Klassen in error_codes.py).**
> TestErrorCodes erbt NICHT von IntEnum — alle anderen Klassen (ESP32HardwareError, etc.) nutzen IntEnum.
> Empfehlung: `class TestErrorCodes(IntEnum):` fuer Konsistenz.
> Zusaetzlich: `get_error_code_range()` muss um Range 6000-6099 erweitert werden.

```python
# Test Infrastructure Errors (6000-6099) — only used in test reports, NOT in production
class TestErrorCodes(IntEnum):
    WOKWI_TIMEOUT = 6000
    WOKWI_BOOT_INCOMPLETE = 6001
    MOCK_ESP_CONFIG_INVALID = 6002
    SCENARIO_ASSERTION_FAILED = 6010
    SCENARIO_NOT_FOUND = 6011
    MQTT_INJECTION_FAILED = 6020
    MQTT_BROKER_UNAVAILABLE = 6021
    DOCKER_SERVICE_UNHEALTHY = 6030
    DB_SEED_FAILED = 6031
    PLAYWRIGHT_TIMEOUT = 6040
    PLAYWRIGHT_ELEMENT_NOT_FOUND = 6041
    SERIAL_LOG_MISSING = 6050
```

**Referenz-Dok updaten:** `.claude/reference/errors/ERROR_CODES.md` — neuer Abschnitt "6. Test Infrastructure Errors (6000-6099)"

### Verifikation

```bash
# Neue Codes in error_codes.py pruefen
grep "600" "El Servador/god_kaiser_server/src/core/error_codes.py"
```

---

## Schritt 0.3: Grafana-Alert-Regeln erweitern (8 → 28+)

### Ist-Zustand

**Datei:** `docker/grafana/provisioning/alerting/alert-rules.yml`
**Aktuell 8 Regeln:**
- 5 Critical: server-down, mqtt-disconnected, database-down, loki-down, promtail-down
- 3 Warning: high-memory, esp-devices-offline, high-mqtt-error-rate

**Pattern (MUSS beibehalten werden):**
```yaml
# 3-Stage Pipeline: A(PromQL) → B(Reduce:last) → C(Threshold)
# Evaluation interval: Vielfaches von 10s
# datasourceUid: prometheus (Metriken), __expr__ (Reduce/Threshold)
# Condition: C
```

### Neue Alert-Regeln (20 zusaetzlich)

#### Gruppe: automationone-sensor-alerts (30s Evaluation)

| # | UID | Title | PromQL | Threshold | Severity | for |
|---|-----|-------|--------|-----------|----------|-----|
| 9 | ao-sensor-temp-range | Temp Out of Range | `god_kaiser_sensor_value{sensor_type="temperature"} > 85 or god_kaiser_sensor_value{sensor_type="temperature"} < -40` | gt 0.5 | warning | 2m |
| 10 | ao-sensor-ph-range | pH Out of Range | `god_kaiser_sensor_value{sensor_type="ph"} > 14 or god_kaiser_sensor_value{sensor_type="ph"} < 0` | gt 0.5 | critical | 1m |
| 11 | ao-sensor-humidity-range | Humidity Out of Range | `god_kaiser_sensor_value{sensor_type="humidity"} > 100 or god_kaiser_sensor_value{sensor_type="humidity"} < 0` | gt 0.5 | warning | 2m |
| 12 | ao-sensor-ec-range | EC Out of Range | `god_kaiser_sensor_value{sensor_type="ec"} > 10000` | gt 0.5 | warning | 2m |
| 13 | ao-sensor-stale | Sensor Data Stale | `time() - god_kaiser_sensor_last_update > 300` | gt 0.5 | warning | 5m |

#### Gruppe: automationone-device-alerts (30s Evaluation)

| # | UID | Title | PromQL | Threshold | Severity | for |
|---|-----|-------|--------|-----------|----------|-----|
| 14 | ao-heartbeat-gap | Heartbeat Gap | `time() - god_kaiser_esp_last_heartbeat > 120` | gt 0.5 | warning | 2m |
| 15 | ao-esp-boot-loop | ESP Boot Loop | `increase(god_kaiser_esp_boot_count[10m]) > 3` | gt 0.5 | critical | 1m |
| 16 | ao-esp-error-cascade | Error Cascade | `increase(god_kaiser_esp_errors_total[60s]) > 3` | gt 0.5 | critical | 30s |
| 17 | ao-esp-safe-mode | ESP in Safe Mode | `god_kaiser_esp_safe_mode > 0` | gt 0.5 | warning | 1m |

#### Gruppe: automationone-infrastructure-alerts (1m Evaluation)

| # | UID | Title | PromQL | Threshold | Severity | for |
|---|-----|-------|--------|-----------|----------|-----|
| 18 | ao-db-query-slow | DB Query Slow | `histogram_quantile(0.95, rate(god_kaiser_db_query_duration_seconds_bucket[5m])) > 1` | gt 0.5 | warning | 5m |
| 19 | ao-db-connections-high | DB Connections High | `pg_stat_activity_count > 80` | gt 0.5 | warning | 3m |
| 20 | ao-disk-usage-high | Disk Usage High | `(node_filesystem_size_bytes - node_filesystem_avail_bytes) / node_filesystem_size_bytes > 0.8` | gt 0.5 | warning | 10m | **[VERIFY-PLAN] BLOCKIERT: node_filesystem_* braucht Node Exporter — NICHT im Docker-Stack! Entweder Node Exporter hinzufuegen oder Alert streichen.** |
| 21 | ao-container-restart | Container Restart | `increase(container_restart_count[10m]) > 0` | gt 0.5 | warning | 1m |
| 22 | ao-cadvisor-down | cAdvisor Down | `up{job="cadvisor"}` | lt 1 | critical | 2m |

#### Gruppe: automationone-application-alerts (30s Evaluation)

| # | UID | Title | PromQL | Threshold | Severity | for |
|---|-----|-------|--------|-----------|----------|-----|
| 23 | ao-ws-disconnects | WebSocket Disconnects | `increase(god_kaiser_ws_disconnects_total[5m]) > 5` | gt 0.5 | warning | 2m |
| 24 | ao-mqtt-message-backlog | MQTT Backlog | `god_kaiser_mqtt_queued_messages > 1000` | gt 0.5 | warning | 3m |
| 25 | ao-api-errors-high | API Error Rate High | `rate(god_kaiser_http_errors_total[5m]) > 0.1` | gt 0.5 | warning | 3m |
| 26 | ao-logic-engine-errors | Logic Engine Errors | `increase(god_kaiser_logic_errors_total[5m]) > 0` | gt 0.5 | warning | 2m |
| 27 | ao-actuator-timeout | Actuator Timeout | `increase(god_kaiser_actuator_timeouts_total[5m]) > 0` | gt 0.5 | warning | 2m |
| 28 | ao-safety-triggered | Safety System Triggered | `increase(god_kaiser_safety_triggers_total[5m]) > 0` | gt 0.5 | critical | 0s |

### Voraussetzung: Prometheus-Metriken pruefen

**WICHTIG:** Bevor Alert-Regeln geschrieben werden, MUSS geprueft werden welche `god_kaiser_*` Metriken der Server tatsaechlich exponiert.

**Agent:** `system-control` (Ops-Modus)

```bash
# Metriken-Endpoint abfragen (Server muss laufen)
curl -s http://localhost:8000/api/v1/health/metrics | grep "god_kaiser_"
```

> **[VERIFY-PLAN] KRITISCH: `prometheus_middleware.py` existiert NICHT. Metriken sind in `metrics.py`.**
> Korrekte Quelle: `El Servador/god_kaiser_server/src/core/metrics.py`

**Tatsaechlich exponierte Metriken (aus metrics.py verifiziert):**
- `god_kaiser_uptime_seconds` (Gauge) ✅
- `god_kaiser_cpu_percent` (Gauge) ✅
- `god_kaiser_memory_percent` (Gauge) ✅
- `god_kaiser_mqtt_connected` (Gauge) ✅
- `god_kaiser_mqtt_messages_total` (Counter, direction Label) ✅
- `god_kaiser_mqtt_errors_total` (Counter, direction Label) ✅
- `god_kaiser_websocket_connections` (Gauge) ✅
- `god_kaiser_db_query_duration_seconds` (Histogram) ✅
- `god_kaiser_esp_total` / `god_kaiser_esp_online` / `god_kaiser_esp_offline` (Gauges) ✅
- `god_kaiser_esp_avg_heap_free_bytes` / `_min_heap_free_bytes` / `_avg_wifi_rssi_dbm` / `_avg_uptime_seconds` (Gauges) ✅

> **[VERIFY-PLAN] KRITISCH: 15 Metriken aus den geplanten Alerts existieren NICHT:**
> - `god_kaiser_sensor_value` — FEHLT (Rules 9-12 blockiert)
> - `god_kaiser_sensor_last_update` — FEHLT (Rule 13 blockiert)
> - `god_kaiser_esp_last_heartbeat` — FEHLT (Rule 14 blockiert)
> - `god_kaiser_esp_boot_count` — FEHLT (Rule 15 blockiert)
> - `god_kaiser_esp_errors_total` — FEHLT (Rule 16 blockiert)
> - `god_kaiser_esp_safe_mode` — FEHLT (Rule 17 blockiert)
> - `god_kaiser_ws_disconnects_total` — FEHLT (Rule 23 blockiert)
> - `god_kaiser_mqtt_queued_messages` — FEHLT (Rule 24 blockiert)
> - `god_kaiser_http_errors_total` — FEHLT (Rule 25 blockiert)
> - `god_kaiser_logic_errors_total` — FEHLT (Rule 26 blockiert)
> - `god_kaiser_actuator_timeouts_total` — FEHLT (Rule 27 blockiert)
> - `god_kaiser_safety_triggers_total` — FEHLT (Rule 28 blockiert)
>
> **Empfehlung:** Schritt 0.3 in zwei Sub-Schritte teilen:
> 1. **0.3a:** 5 sofort machbare Alerts (ao-db-query-slow, ao-db-connections-high, ao-container-restart, ao-cadvisor-down = existierende Metriken)
> 2. **0.3b:** server-dev implementiert 15 fehlende Metriken in `metrics.py`
> 3. **0.3c:** Restliche 15 Alerts mit neuen Metriken

**Fehlende Metriken MUESSEN ZUERST via `server-dev` in metrics.py implementiert werden**

### Implementierung

**Datei:** `docker/grafana/provisioning/alerting/alert-rules.yml`

Jede neue Regel MUSS dem 3-Stage-Pipeline-Pattern folgen:

```yaml
- uid: ao-RULE-NAME
  title: "Rule Title"
  condition: C
  data:
    - refId: A
      relativeTimeRange: { from: RANGE, to: 0 }
      datasourceUid: prometheus
      model:
        expr: "PROMQL_EXPRESSION"
        intervalMs: 15000
        maxDataPoints: 43200
        refId: A
    - refId: B
      relativeTimeRange: { from: 0, to: 0 }
      datasourceUid: '__expr__'
      model:
        type: reduce
        expression: "A"
        reducer: last
        refId: B
    - refId: C
      relativeTimeRange: { from: 0, to: 0 }
      datasourceUid: '__expr__'
      model:
        type: threshold
        expression: "B"
        conditions:
          - evaluator:
              type: gt|lt
              params: [VALUE]
        refId: C
  noDataState: OK|Alerting
  execErrState: Alerting
  for: DURATION
  annotations:
    summary: "..."
    description: "..."
  labels:
    severity: critical|warning
    component: COMPONENT
```

### Verifikation

```bash
# YAML-Syntax pruefen
python -c "import yaml; yaml.safe_load(open('docker/grafana/provisioning/alerting/alert-rules.yml'))"

# Grafana Container neu laden (restart ist Hook-blockiert!)
docker compose up -d --force-recreate grafana

# Grafana Alert-Regeln via API pruefen
curl -s -u admin:Admin123# http://localhost:3000/api/v1/provisioning/alert-rules | python -m json.tool | grep title
```

---

## Schritt 0.4: KI-Error-Analyse Stufe 1 konfigurieren

### Plausibilitaets-Grenzen in Grafana

Die wissenschaftlich fundierten Sensor-Plausibilitaetsgrenzen werden als Grafana-Alert-Regeln implementiert (Schritt 0.3 deckt das bereits ab).

**Grenzen (aus Master-Plan, Quelle: ki-error-analyse-iot.md):**

```python
PLAUSIBILITY_RANGES = {
    "temperature": (-40, 85),      # DS18B20 Messbereich
    "humidity": (0, 100),           # Physikalische Grenze
    "ph": (0, 14),                  # pH-Skala
    "ec": (0, 10000),              # uS/cm
    "soil_moisture": (0, 100),     # Prozent
    "pressure": (300, 1100),       # hPa
    "co2": (0, 5000),             # ppm
    "light": (0, 200000),         # Lux
    "flow": (0, 100)              # L/min
}
```

> **[VERIFY-PLAN] Prometheus Job-Name Korrektur:**
> prometheus.yml hat `job_name: 'el-servador'` (NICHT `god-kaiser`).
> Alert ao-server-down nutzt korrekt `up{job="el-servador"}` ✅
> Alert ao-cadvisor-down nutzt korrekt `up{job="cadvisor"}` ✅

### Log-Pattern-Matching via LogQL

**Ergaenzung zu Grafana Alerting:** LogQL-basierte Regeln fuer Loki.

| Pattern | LogQL | Was wird erkannt |
|---------|-------|------------------|
| MQTT Handler Exception | `{compose_service="el-servador"} \|= "MQTT_HANDLER_EXCEPTION"` | Server MQTT-Fehler |
| Emergency Stop | `{compose_service="el-servador"} \|= "EMERGENCY_STOP"` | Safety-System aktiviert |
| Circuit Breaker Open | `{compose_service="el-servador"} \|= "circuit_breaker" \|= "OPEN"` | Resilience-System |
| DB Connection Failed | `{compose_service="el-servador"} \|= "DB_CONNECTION" \|= "failed"` | Datenbank-Probleme |
| ESP Boot Loop | `{compose_service="el-servador"} \|= "boot_count" \|~ "boot_count.*(3\|4\|5)"` | ESP32 instabil |

**ACHTUNG:** LogQL-Alerts brauchen `datasourceUid: loki` statt `prometheus`. Die 3-Stage-Pipeline gilt NICHT fuer LogQL — hier wird direkt ein Log-basierter Alert konfiguriert (anderes Grafana-Pattern).

> **[VERIFY-PLAN] LogQL-Alert YAML-Template fehlt.**
> Der Plan beschreibt LogQL-Patterns aber nicht das YAML-Format fuer Loki-Alerts in Grafana.
> Grafana Loki-Alerts nutzen `datasourceUid: loki` und `queryType: range`/`instant`.
> Empfehlung: YAML-Template fuer LogQL-Alerts ergaenzen oder als separaten Schritt 0.3d definieren.

### auto-ops Integration

**Skill:** `/auto-ops:ops`

Das auto-ops Plugin hat bereits:
- Loki-Queries (`auto-ops:loki-queries` Skill)
- Error-Code-Referenz (`auto-ops:error-codes` Skill)
- System-Health Checks (`auto-ops:system-health` Skill)

**Erweiterung fuer Phase 0:**
- Alert-Status-Aggregation: auto-ops soll den aktuellen Grafana-Alert-Status abfragen und zusammenfassen koennen
- Error-Code → Alert Mapping: Welcher Error-Code loest welchen Alert aus

### Verifikation

```bash
# Grafana Alert-Status pruefen
curl -s -u admin:Admin123# http://localhost:3000/api/v1/provisioning/alert-rules | python -m json.tool | wc -l

# Loki Logs verfuegbar pruefen
curl -s http://localhost:3100/loki/api/v1/labels
```

---

## Akzeptanzkriterien Phase 0

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | Error-Code-Referenz aktuell und vollstaendig | Diff gegen Source-Dateien = 0 Abweichungen |
| 2 | Test-Error-Block 6000-6099 definiert | `grep "600" error_codes.py` findet 12 Codes |
| 3 | Grafana hat 28+ Alert-Regeln | Grafana API gibt 28+ Rules zurueck |
| 4 | 3-Stage-Pipeline-Pattern fuer alle Regeln | YAML-Validierung besteht |
| 5 | Plausibilitaets-Alerts fuer Sensor-Typen | Temp, pH, Humidity, EC Regeln aktiv |
| 6 | alert-rules.yml YAML-valide | `python -c "import yaml; ..."` erfolgreich |
| 7 | Grafana Container laeuft nach Reload | `docker compose ps grafana` → healthy |

---

## Uebergang zu Phase 1 und Phase 2

Phase 0 ist das Fundament. Nach Abschluss koennen Phase 1 (Wokwi) und Phase 2 (Produktion) **parallel** gestartet werden:

- **→ [Phase 1: Wokwi-Simulation](./PHASE_1_WOKWI_SIMULATION.md):** Nutzt Error-Taxonomie fuer Wokwi-Szenario-Reports
- **→ [Phase 2: Produktionstestfeld](./PHASE_2_PRODUKTIONSTESTFELD.md):** Nutzt Grafana-Alerts fuer Live-Monitoring

Beide Phasen referenzieren die in Phase 0 definierten Error-Codes und Alert-Regeln.

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| 0.1 | `system-control` | Stack-Status pruefen, Error-Code-Audit |
| 0.2 | `server-dev` | Test-Error-Block implementieren |
| 0.2 | `/updatedocs` | ERROR_CODES.md aktualisieren |
| 0.3 | `system-control` | Prometheus-Metriken pruefen |
| 0.3 | Manuell / Hauptkontext | alert-rules.yml erweitern |
| 0.4 | `/auto-ops:ops` | auto-ops Alert-Integration pruefen |
| 0.3 | `server-dev` | **[VERIFY-PLAN] FEHLEND:** 15 Metriken in metrics.py implementieren (Phase 0 Blocker!) |
| Ende | `/verify-plan` | Phase 0 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 0)

**Plan:** Error-Taxonomie konsolidieren, Test-Codes 6000-6099, Grafana-Alerts 8→28+
**Geprueft:** 8 Pfade, 4 Agents, 2 Services, 3 Endpoints, 15 Metriken

### Bestaetigt
- Alle referenzierten Dateipfade existieren und enthalten erwartete Inhalte ✅
- Agent-Referenzen (system-control, server-dev) korrekt ✅
- Skill-Referenzen (/system-control, /auto-ops:ops, /updatedocs, /verify-plan) korrekt ✅
- 3-Stage-Pipeline-Pattern korrekt dokumentiert ✅
- 8 existierende Alert-Regeln korrekt gelistet ✅
- Prometheus Job-Namen stimmen mit prometheus.yml ueberein ✅
- Audit-Log Model hat alle erwarteten Felder ✅

### Korrekturen noetig

**Metrik-Quelle falsch:** Plan referenziert `prometheus_middleware.py` — existiert nicht. Korrekt: `metrics.py`
**TestErrorCodes Klasse:** Sollte `IntEnum` erben (Pattern-Konsistenz)
**15 Metriken fehlen:** Groesster Blocker — 15 von 20 neuen Alerts brauchen Metriken die noch nicht implementiert sind
**Node Exporter fehlt:** ao-disk-usage-high braucht node_filesystem_* — Node Exporter nicht im Stack
**docker compose restart:** Hook-blockiert, `docker compose up -d --force-recreate` nutzen
**LogQL-Alert-Template:** Fehlt komplett — nur Patterns beschrieben, kein YAML-Template

### Fehlende Vorbedingungen
- [ ] 15 Prometheus-Metriken in metrics.py implementieren (server-dev)
- [ ] Node Exporter zum Docker-Stack hinzufuegen ODER ao-disk-usage-high streichen
- [ ] LogQL-Alert YAML-Template erstellen oder als eigenen Schritt definieren
- [ ] ESP32↔Python Error-Code Sync-Luecken schliessen (DS18B20 1060-1063, I2C 1015-1018)

### Zusammenfassung
Plan ist strukturell solide und korrekt referenziert. **Hauptblocker: 15 fehlende Metriken in metrics.py.** Empfehlung: Schritt 0.3 in drei Sub-Schritte teilen (sofort machbare Alerts → Metriken implementieren → restliche Alerts). Der Plan ist nach diesen Korrekturen ausfuehrbar.
