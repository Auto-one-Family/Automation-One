# Konsolidierter Report: Code-Qualitaet & Debug-Infrastruktur

**Erstellt:** 2026-02-11T14:45:00Z
**Branch:** feature/docs-cleanup
**Quellordner:** `.technical-manager/inbox/agent-reports/`
**Anzahl Reports:** 4

## Einbezogene Reports

| # | Report | Thema | Zeilen |
|---|--------|-------|--------|
| 1 | ki-debug-preparation-analysis-2026-02-10.md | ML-Readiness Analyse, 8 ML-Methoden, Infra-Check | 1040 |
| 2 | mqtt-debug-topic-analysis-2026-02-10.md | MQTT Debug-Topic Design (system/debug) | 298 |
| 3 | SER2NET_ANALYSIS.md | ESP32 Serial-to-Docker Monitoring Stack | 598 |
| 4 | server-development-2026-02-10.md | Zone-Kaiser Bugfixes (5 Bugs gefixt) | 282 |

---

## 1. KI-Debug Preparation Analysis (2026-02-10)

### 1.1 Executive Summary

**ML-Readiness Score: 4.5 / 10**

Solide Grundlage (strukturierte Logs, Error-Code-System, Monitoring-Stack), aber erhebliche Luecken bei Cross-Layer-Korrelation, Label-Taxonomie und ESP32-Metrik-Export. Groesste Staerke: laufendes Monitoring (Loki + Prometheus + Grafana). Groesste Schwaeche: keine durchgaengige Correlation-ID ueber MQTT-Grenzen.

### 1.2 Log-Formate pro Layer

| Layer | Format | ML-Bewertung | Schwachstelle |
|-------|--------|-------------|---------------|
| **El Servador** | JSON-structured (File), Text (Console) | 9/10 | request_id nur fuer HTTP, NICHT MQTT |
| **El Frontend** | JSON: `{level, component, message, timestamp}` | 8/10 | - |
| **ESP32** | Semi-structured: `[millis] [LEVEL] message` | 3/10 | Kein absoluter Timestamp, keine Device-ID |
| **MQTT Broker** | Mosquitto stdout mit ISO-Timestamps | 5-6/10 | Log-Types aktiv (connect/disconnect/subscribe) |

**KRITISCH:** Wokwi-Daten (`SIMULATION`) NIEMALS mit echten Produktionsdaten (`PRODUCTION`) fuer ML-Training mischen. Server hat `DataSource` Enum (`enums.py:10-26`).

### 1.3 Prometheus Metriken (IST-Zustand)

**Custom Server-Metriken (7):**
- `god_kaiser_uptime_seconds`, `god_kaiser_cpu_percent`, `god_kaiser_memory_percent`
- `god_kaiser_mqtt_connected`
- `god_kaiser_esp_total`, `god_kaiser_esp_online`, `god_kaiser_esp_offline`

**Auto-Instrumentator:** `http_requests_total`, `http_request_duration_seconds`, etc.
**PostgreSQL-Exporter:** `pg_stat_activity_*`, `pg_database_size_bytes`, etc.
**Mosquitto-Exporter:** `broker_clients_connected`, `broker_messages_received/sent`, etc.

**FEHLENDE Metriken (ML-kritisch):**
- ESP32 RSSI, Heap Free, Uptime (existieren im Heartbeat, nicht als Prometheus Gauges)
- Sensor Read Rate, Actuator Command Rate
- MQTT Message Latency
- Error-Code Rate
- Logic Engine Executions
- Container-Metriken (cAdvisor fehlt)

### 1.4 Correlation-IDs

| Kontext | ID vorhanden | Scope |
|---------|-------------|-------|
| HTTP Request | `request_id` (UUID v4) | Request-Lifecycle |
| Actuator Command | `correlation_id` (`cmd_abc123`) | Command-Response |
| MQTT Handler | **KEINE** | - |
| Sensor Data Flow | **KEINE** | - |
| Cross-Layer Flow | **KEINE** | - |

### 1.5 PATTERNS.yaml Schema-Entwurf

16 Patterns sofort ableitbar aus bestehendem Error-Code-System:

| Pattern-ID | Name | Error-Codes | Layer |
|------------|------|-------------|-------|
| PAT-HW-001 | DS18B20 Disconnect | 1060, 1063 | firmware |
| PAT-HW-002 | I2C Bus Error | 1010-1018 | firmware |
| PAT-HW-003 | OneWire Bus Failure | 1020-1029 | firmware |
| PAT-HW-004 | GPIO Conflict | 1002, 1053 | firmware |
| PAT-NET-001 | WiFi Disconnect Cascade | 3001-3005 | firmware, broker, backend |
| PAT-NET-002 | MQTT Broker Unreachable | 3010-3016, 5104-5106 | firmware, broker, backend |
| PAT-DB-001 | Database Connection Loss | 5301-5306 | backend, database |
| PAT-APP-001 | Watchdog Timeout | 4070-4072 | firmware |
| PAT-APP-002 | Memory Exhaustion | 4040-4042 | firmware |
| PAT-SEQ-001 | Actuator Lock Conflict | 5640-5642 | backend |

(Weitere 6 Patterns: PAT-HW-005, PAT-NET-003, PAT-SVC-001, PAT-SVC-002, PAT-APP-003, PAT-SEQ-002)

### 1.6 ML-Methoden Readiness

| # | ML-Methode | Readiness | Blocker |
|---|------------|-----------|---------|
| 1 | Log-Klassifikation | 5/10 | Labels, PATTERNS.yaml |
| 2 | Anomalie-Erkennung | 4/10 | ESP-Metriken, Baseline |
| 3 | Cross-Layer-Korrelation | 2/10 | Correlation-ID |
| 4 | Sequenz-Pattern-Mining | 3/10 | Timestamps, Correlation-ID |
| 5 | Predictive Failure | 3/10 | Mehr Metriken, historische Daten |
| 6 | Metrik-Korrelation | 4/10 | Mehr Custom-Metriken |
| 7 | Log-Clustering | 6/10 | Grunddaten vorhanden |
| 8 | Drift Detection | 3/10 | Baseline, ESP-Metriken |

### 1.7 Empfohlene Phasen

**Phase 1: Datenqualitaet (Wochen 1-2)**
1. ESP-Heartbeat-Metriken als Prometheus Gauges (Klein)
2. PATTERNS.yaml mit 16 Initial-Patterns (Mittel)
3. Label-Taxonomie finalisieren (Klein)
4. LogQL Recording Rules deployen (Klein-Mittel)
5. Error-Code-Label Mapping im Server (Klein)

**Phase 2: Korrelation (Wochen 3-4)**
6. trace_id in MQTT-Handlern (Mittel-Gross — betrifft ALLE Handler + DB Schema + WS)
7. Promtail Pipeline erweitern (Klein)
8. cAdvisor zum Docker Stack (Klein)
9. Logic Engine Execution Metrics (Klein)
10. Sensor/Actuator Message Rate Metriken (Klein)

**Phase 3: ML-Readiness (Wochen 5-8)**
11. Baseline-Definition fuer "gesundes System" (Mittel)
12. Retention-Verlaengerung 7d → 30d (Klein, Disk-Impact ~4x)
13. Datenexport-Pipeline Loki/Prometheus → Jetson (Gross)
14. MQTT Topic `ao/ml/*/results` (Mittel)
15. Grafana ML-Dashboard (Mittel)

### 1.8 System-Control Ergaenzungen (Infrastruktur-Faktencheck)

**Docker Stack:** 11 Services (4 core + 6 monitoring + 1 devtools), 7 Named Volumes
**Maximaler Docker-Log-Speicher:** ~210MB

**Grafana Dashboard "AutomationOne - Operations":**
- 26 Panels in 6 Rows
- 5 Alert Rules (3 critical, 2 warning)
- Alle nutzen korrekte 3-Stage Pipeline (A→B→C)

**Korrekturen zum Haupt-Report:**
1. Mosquitto-Logs haben `log_timestamp_format` — nicht voellig unstrukturiert (5-6/10 statt 4/10)
2. `docker/loki/rules/` hat keinen Bind-Mount — Recording Rules via Grafana deployen
3. Promtail Multiline-Stage fuer Python Tracebacks existiert (ML-kritisch, im Report fehlend)
4. PostgreSQL File-Logs (Slow Queries, Lock-Waits) werden nicht von Promtail erfasst
5. trace_id Aufwand eher Mittel-Gross als Mittel
6. Prometheus `rule_files:` Block fehlt in prometheus.yml

---

## 2. MQTT Debug-Topic Analysis (2026-02-10)

### 2.1 Executive Summary

**Ergebnis: Gruenes Licht. Keine Blocker. Implementation kann starten.**

Neues Topic `kaiser/{kaiser_id}/esp/{esp_id}/system/debug` (QoS 0, 60s + event-basiert) passt perfekt in bestehende Architektur.

**KRITISCHER Nebenfund:** `system/diagnostics` hat **KEINEN** Server-Handler. ESP32 HealthMonitor published seit Monaten ins Leere.

### 2.2 IST-Zustand MQTT

**ESP32 published 15 Topics:**
- sensor/{gpio}/data, sensor/batch, sensor/{gpio}/response
- actuator/{gpio}/status, actuator/{gpio}/response, actuator/{gpio}/alert
- system/heartbeat, system/diagnostics, system/error
- config_response, subzone/ack, subzone/status, status, safe_mode, zone/ack

**Server subscribed 14 Handler** — FEHLEND: system/diagnostics!

### 2.3 Diagnose-Daten (nicht erfasst, wertvoll)

| Daten | Quelle | Wert |
|-------|--------|------|
| Boot-Reason | esp_reset_reason() | Watchdog? Brownout? |
| Log-Buffer | logger.getLogs() | Letzte 50 Eintraege |
| Circuit-Breaker State | circuit_breaker_.getState() | OPEN/CLOSED/HALF_OPEN |
| NVS Usage | StorageManager | Speicherverbrauch |
| WiFi/MQTT Reconnect Count | WifiManager/reconnect_attempts_ | Stabilitaet |
| Offline Buffer Count | getOfflineMessageCount() | Puffer-Status |
| Task Stack Watermark | uxTaskGetStackHighWaterMark() | Stack-Safety |

### 2.4 Design: system/debug Topic

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/system/debug`

**Payload-Schema (~800 Bytes):**
```json
{
  "ts": 1735818000, "esp_id": "ESP_12AB34CD", "type": "log_batch",
  "data": {
    "logs": [{"ts_ms": 123456, "level": "WARNING", "message": "..."}],
    "metrics": {
      "heap_free": 180000, "heap_min_free": 150000, "heap_fragmentation_pct": 12,
      "wifi_rssi": -65, "wifi_reconnects": 2, "mqtt_reconnects": 1,
      "mqtt_offline_buffered": 0, "mqtt_circuit_breaker": "CLOSED",
      "error_count": 3, "uptime_s": 3600, "boot_reason": 1
    }
  }
}
```

**Frequenz:** 60s periodisch + Event-basiert (CRITICAL, Circuit-Breaker OPEN, auf Anfrage)
**Rate-Limiting:** Max 1 Debug-Publish pro 10s

**Performance-Impact:** +20-30% Messages/ESP, +800 Bytes/min, vernachlaessigbar

### 2.5 Implementierungsplan

| Phase | Datei | Aenderung |
|-------|-------|-----------|
| 1 (ESP32) | topic_builder.h + .cpp | buildSystemDebugTopic() |
| 1 (ESP32) | debug_publisher.h + .cpp | Neue Singleton-Klasse |
| 1 (ESP32) | main.cpp | debugPublisher.begin() + loop() |
| 2 (Server) | mqtt/topics.py | parse_system_debug_topic() |
| 2 (Server) | mqtt/handlers/debug_handler.py | Neuer Handler |
| 2 (Server) | main.py | Handler-Registrierung |
| 3 (Docs) | MQTT_TOPICS.md | Topic #33 + diagnostics deprecated |

### 2.6 Nebenfunde

1. **system/diagnostics: KEIN Server-Handler (KRITISCH)** — ESP32 published ins Leere
2. **127 temporaere Serial.print in mqtt_client.cpp** — aufraumen
3. **Logger Circular Buffer (50 Entries)** — bei hoher Frequenz ueberschreibt in <40ms
4. **Registration Gate Timing** — Event-Debug in ersten 10s nach Connect blockiert

---

## 3. ser2net Analysis (2026-02-10, konsolidiert)

### 3.1 Executive Summary

**Machbarkeit:** Ja, aber nicht mit ser2net direkt. **Empfehlung: Custom Python `pyserial` Container.**

**Kernproblem:** Docker Desktop WSL2 Backend unterstuetzt `--device` USB-Passthrough NICHT nativ. Workaround: `usbipd-win` + TCP-Bridge.

**3 FIRMWARE-BLOCKER** muessen VOR Integration gefixt werden (~55 min).

### 3.2 ESP32 Serial-Output (4 Formate)

| Format | Quelle | Vorkommen | Parsebarkeit |
|--------|--------|-----------|-------------|
| Custom Logger | LOG_* Makros | 1324 in 27 Dateien | Regex: `^\[\s*(\d+)\]\s+\[(\w+)\s*\]\s+(.*)$` |
| Direct Serial.print | Boot-Phase | 161 in 4 Dateien | Unstrukturiert |
| MQTT Debug JSON | mqtt_client.cpp | 127 (temporaer) | JSON mit [DEBUG] Prefix |
| ESP-IDF SDK | Interne Logs | Variabel | `<level> (<millis>) <tag>: <message>` |

### 3.3 Empfohlene Architektur

```
ESP32 → USB → usbipd → WSL2 /dev/ttyUSB0
                          |
              [socat in WSL2, TCP:3333]
                          |
            [Docker: esp32-serial-logger]
              Python + pyserial (TCP-Client)
                          |
                    stdout (JSON)
                          |
            [Promtail docker_sd_configs] → [Loki] → [Grafana]
```

**Neues Docker-Profil: `hardware`** — aktiv nur bei physischer ESP32-Hardware.

### 3.4 Firmware-Blocker

| # | Blocker | Schwere | Aufwand |
|---|---------|---------|---------|
| B1 | Log-Volumen: ~214 Zeilen/s uebersteigt Baud-Rate (14 LOG_INFO pro Loop) | BLOCKING | 5 min |
| B2 | MQTT Debug JSON: 127 fragmentierte Serial.print (0 println) | HIGH | 30 min |
| B3 | Keine Runtime Log-Level Steuerung | MEDIUM | 20 min |

**Fix B1:** 14x `LOG_INFO` auf `LOG_DEBUG` in main.cpp Loop
**Fix B2:** `#ifdef ENABLE_AGENT_DEBUG_LOGS` Guard um 13 Bloecke
**Fix B3:** `set_log_level` MQTT-Command (Pattern existiert in System-Command-Handler)

### 3.5 Performance & Risiken

**End-to-End Latenz:** ~5-15 Sekunden (Serial → Loki → Grafana)
**Bottleneck:** Promtail scrape interval (1-5s) + Loki batch push (1-5s)

**Risiken:** USB-Passthrough instabil (Mittel), ESP32 Reset bei Serial-Connect (Hoch, mitigierbar), WSL2 Device verschwindet (Mittel)

### 3.6 Implementierungsplan

| Phase | Aufwand | Agents |
|-------|---------|--------|
| 0: Firmware-Fixes (3 Blocker) | ~1h | esp32-dev |
| 1: Infrastructure (usbipd, socat) | ~3h | system-control (Robin manuell) |
| 2: Container + Monitoring | ~5-7h | server-dev, system-control |
| 3: Verification | ~1h | test-log-analyst |
| **Total** | **~10-12h** | |

---

## 4. Server Development: Zone-Kaiser Bugfixes (2026-02-10)

### 4.1 Executive Summary

**Alle 5 Bugs gefixt. Alle 9 Work Packages verifiziert. 5/5 E2E-Szenarien funktionieren.**

### 4.2 Gefundene und gefixte Bugs

| # | Datei | Problem | Kritikalitaet | Status |
|---|-------|---------|---------------|--------|
| Bug 1 | `esp.ts:1819-1841` | `handleZoneAssignment` fehlt `zone_removed` Branch | CRITICAL | GEFIXT |
| Bug 2 | `websocket-events.ts:587` | `ZoneAssignmentEvent.data.status` falsche Union-Types | CRITICAL | GEFIXT |
| Bug 3 | `heartbeat_handler.py:358` | `constants.get_kaiser_id()` aufgerufen, `constants` nie importiert | CRITICAL | GEFIXT |
| Bug 4 | `config_manager.cpp:356-376` | Zone-Validierung unvollstaendig (keine Laengen-Checks) | MEDIUM | GEFIXT |
| Bug 5 | `config_manager.cpp:392-429` | NVS-Rollback nur fuer `kaiser_`, nicht fuer `master_` | MEDIUM | GEFIXT |

### 4.3 Geaenderte Dateien

- `El Servador/.../heartbeat_handler.py` (+1 Import-Zeile)
- `El Frontend/src/stores/esp.ts` (+8 Zeilen Zone-Removed Branch)
- `El Frontend/src/types/websocket-events.ts` (+3 Felder, Status korrigiert)
- `El Trabajante/.../config_manager.cpp` (+33 Zeilen Validierung, +2 Zeilen Rollback)

**Gesamt:** 4 Dateien, ~45 neue Zeilen. Keine Breaking Changes.

### 4.4 E2E-Szenarien Status

| # | Szenario | VORHER | NACHHER |
|---|----------|--------|---------|
| 1 | Zone zuweisen → ACK → Frontend zeigt zone_name | Funktioniert | Funktioniert |
| 2 | Zone entfernen → ACK → Frontend aktualisiert | Frontend ignoriert | **GEFIXT** |
| 3 | Neuer ESP discovert → kaiser_id="god" in DB | Server crasht | **GEFIXT** |
| 4 | Subzone zuweisen → ACK → Frontend aktualisiert | Funktioniert | Funktioniert |
| 5 | Subzone entfernen → ACK → Frontend aktualisiert | Funktioniert | Funktioniert |

**Status: BEREIT FUER DEPLOYMENT**

---

## Priorisierte Problemliste

### KRITISCH
- **system/diagnostics hat KEINEN Server-Handler** — ESP32 published ins Leere seit Monaten
- **ML Cross-Layer Correlation-ID fehlt** — MQTT-Handler haben keine trace_id (ML-Readiness 2/10)
- **ESP32 Serial Log-Volumen** — 14 LOG_INFO pro Loop uebersteigt Baud-Rate (Blocker fuer ser2net)
- **127 temporaere Serial.print in mqtt_client.cpp** — fragmentieren Serial-Output

### WARNUNG
- **ESP32-Metriken nicht in Prometheus** — heap, rssi, uptime bleiben in DB
- **ESP32 Serial-Logs unstrukturiert** — relative millis(), kein Device-ID/Module
- **Keine Label-Taxonomie definiert** — Blocker fuer ML Log-Klassifikation
- **Keine PATTERNS.yaml** — Fehlermuster nicht katalogisiert
- **Keine Recording Rules** — weder LogQL noch PromQL
- **Kein cAdvisor** — Container-Metriken fehlen
- **Retention nur 7 Tage** — zu kurz fuer ML-Training
- **Prometheus `rule_files:` fehlt** in prometheus.yml
- **PostgreSQL File-Logs nicht in Loki** — Slow Queries/Lock-Waits gehen verloren

### INFO
- **ML-Readiness Score: 4.5/10** — Phase 1 (Datenqualitaet) sollte auf 6-7/10 bringen
- **Zone-Kaiser Bugs alle gefixt** — 5/5 E2E-Szenarien funktionieren
- **ser2net Aufwand: 10-12h** — inkl. Firmware-Fixes, empfohlen: Python pyserial Container
- **Grafana Dashboard hat 26 Panels + 5 Alert Rules** — Basis fuer ML-Dashboards vorhanden

---

## Quelldateien

- `ki-debug-preparation-analysis-2026-02-10.md` (1040 Zeilen, server-dev + system-control, 2026-02-10)
- `mqtt-debug-topic-analysis-2026-02-10.md` (298 Zeilen, esp32-dev + mqtt-debug, 2026-02-10)
- `SER2NET_ANALYSIS.md` (598 Zeilen, 5 Agents, 2026-02-10, bereits konsolidiert aus 2 Reports)
- `server-development-2026-02-10.md` (282 Zeilen, server-development, 2026-02-10)

*Konsolidiert am 2026-02-11. Alle Quelldateien archiviert.*
