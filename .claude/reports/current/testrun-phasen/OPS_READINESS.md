# Operationale Readiness - Phasenplan Validierung

> **Erfasst:** 2026-02-21
> **Aktualisiert:** 2026-03-02 (Codebase-Verifikation: 32 Alerts, AI Model existiert, Frontend MonitorView+SystemMonitor umfangreich)
> **Quelle:** SYSTEM_STATE.md + Live-Checks + Codebase-Verifikation
> **Zweck:** Bereitschaftsbewertung fuer Phase 0-4

---

## 1. Grafana Alert-System

### Aktive Alert-Regeln

| Alert-UID | Titel | Severity | Metrik | Status |
|-----------|-------|----------|--------|--------|
| ao-mqtt-disconnected | MQTT Broker disconnected | critical | god_kaiser_mqtt_connected | AKTIV |
| ao-high-memory | Server Memory > 90% | warning | god_kaiser_memory_percent | AKTIV |
| ao-high-mqtt-error-rate | MQTT Error Rate high | warning | god_kaiser_mqtt_errors_total | AKTIV |
| ao-db-query-slow | DB Queries slow | warning | god_kaiser_db_query_duration_seconds | AKTIV |
| ao-esp-offline | ESP devices offline | critical | god_kaiser_esp_online/offline | AKTIV |
| ao-server-down | Server unreachable | critical | up{job="god-kaiser"} | AKTIV |
| ao-cadvisor-down | cAdvisor unreachable | warning | up{job="cadvisor"} | AKTIV |
| ao-prometheus-down | Prometheus self-check | critical | up{job="prometheus"} | AKTIV |

**Gesamt: ~~8~~ → ~~26~~ → **32 aktive Regeln** (Ziel Phase 0: 28+ → **32 implementiert**, Ziel uebertroffen)

### Readiness-Bewertung (aktualisiert 2026-02-23)

- Alert-Pipeline funktioniert (3-Stage A→B→C korrekt)
- Evaluation-Intervalle korrekt (Vielfache von 10s)
- ~~**GAP:** 20 neue Alerts benoetigen 15 fehlende Metriken in metrics.py~~ ✅ **GELOEST**
- **ALLE 12 Phase-0 Metriken definiert UND in Handlern integriert**
- **32 Alerts** in `alert-rules.yml`, **7 Gruppen** (critical, warnings, infrastructure, sensor, device, application, mqtt-broker)

---

## 2. Loki Log-Ingestion

| Check | Status | Details |
|-------|--------|---------|
| Loki Container | HEALTHY | automationone-loki Up 2h+ |
| Alloy Container | HEALTHY | automationone-alloy Up 2h+ (Promtail durch Alloy ersetzt seit 2026-02-24) |
| Server-Logs in Loki | FUNKTIONIERT | `{compose_service="el-servador"}` liefert Ergebnisse |
| MQTT-Logs in Loki | FUNKTIONIERT | `{compose_service="mqtt-broker"}` liefert Ergebnisse |
| Frontend-Logs in Loki | FUNKTIONIERT | `{compose_service="el-frontend"}` liefert Ergebnisse |

**Bewertung:** Loki-Ingestion vollstaendig operativ. Alle Container-Logs werden erfasst.

---

## 3. Prometheus Scrape-Targets

| Target | Job-Name | Status | Endpoint |
|--------|----------|--------|----------|
| God-Kaiser Server | god-kaiser | UP | :8000/api/v1/health/metrics |
| cAdvisor | cadvisor | UP | :8080/metrics |
| Postgres-Exporter | postgres-exporter | UP | :9187/metrics |
| Mosquitto-Exporter | mosquitto-exporter | UNHEALTHY | :9234/metrics |
| Prometheus Self | prometheus | UP | :9090/metrics |

**Bewertung:** 4/5 Targets aktiv. Mosquitto-Exporter unhealthy hat keinen Einfluss auf Phase 0 Alerts (nutzen god_kaiser_* Metriken).

### Exponierte God-Kaiser Metriken (27 total — 15 alt + 12 Phase-0 neu)

**Bestehende Metriken (15):**

| Metrik | Typ | Wert |
|--------|-----|------|
| god_kaiser_uptime_seconds | Gauge | ~6000 |
| god_kaiser_cpu_percent | Gauge | 15.3 |
| god_kaiser_memory_percent | Gauge | 29.3 |
| god_kaiser_mqtt_connected | Gauge | 1.0 |
| god_kaiser_mqtt_messages_total | Counter | mit direction Label |
| god_kaiser_mqtt_errors_total | Counter | mit direction Label |
| god_kaiser_websocket_connections | Gauge | 0.0 |
| god_kaiser_db_query_duration_seconds | Histogram | sum=5.8, count=1554 |
| god_kaiser_esp_total | Gauge | 5.0 |
| god_kaiser_esp_online | Gauge | 1.0 |
| god_kaiser_esp_offline | Gauge | 2.0 |
| god_kaiser_esp_avg_heap_free_bytes | Gauge | 0.0 |
| god_kaiser_esp_min_heap_free_bytes | Gauge | 0.0 |
| god_kaiser_esp_avg_wifi_rssi_dbm | Gauge | 0.0 |
| god_kaiser_esp_avg_uptime_seconds | Gauge | 0.0 |

**Phase-0 Metriken (12 NEU — alle definiert + Handler-integriert):**

| Metrik | Typ | Labels | Handler-Integration |
|--------|-----|--------|---------------------|
| god_kaiser_sensor_value | Gauge | sensor_type, esp_id | ✅ sensor_handler.py |
| god_kaiser_sensor_last_update | Gauge | sensor_type, esp_id | ✅ sensor_handler.py |
| god_kaiser_esp_last_heartbeat | Gauge | esp_id | ✅ heartbeat_handler.py |
| god_kaiser_esp_boot_count | Gauge | esp_id | ✅ heartbeat_handler.py |
| god_kaiser_esp_errors_total | Counter | esp_id | ✅ error_handler.py |
| god_kaiser_esp_safe_mode | Gauge | esp_id | ✅ heartbeat_handler.py |
| god_kaiser_ws_disconnects_total | Counter | - | ✅ websocket/manager.py |
| god_kaiser_mqtt_queued_messages | Gauge | - | ✅ mqtt/client.py |
| god_kaiser_http_errors_total | Counter | status_class | ✅ middleware/request_id.py |
| god_kaiser_logic_errors_total | Counter | - | ✅ logic_engine.py |
| god_kaiser_actuator_timeouts_total | Counter | - | ✅ actuator_service.py |
| god_kaiser_safety_triggers_total | Counter | - | ✅ safety_service.py + logic_engine.py |

---

## 4. MQTT-Broker

| Check | Status | Details |
|-------|--------|---------|
| Broker Container | HEALTHY | automationone-mqtt Up 2h+ |
| Port 1883 | PUBLISHED | 0.0.0.0:1883->1883/tcp |
| Port 9001 (WebSocket) | PUBLISHED | 0.0.0.0:9001->9001/tcp |
| Server MQTT Connection | CONNECTED | god_kaiser_mqtt_connected = 1.0 |
| ESP32 Erreichbarkeit | BEREIT | Port published, Firewall offen |

**Bewertung:** MQTT-Broker vollstaendig operativ fuer ESP32-Anbindung.

---

## 5. DB-Schema: ai_predictions

| Check | Status | Details |
|-------|--------|---------|
| ai.py Model (AIPredictions) | ✅ VORHANDEN | 130 Zeilen, UUID PK, FK esp_devices, JSON-Felder, 4 Indizes |
| ai_repo.py | STUB | 2 Zeilen Docstring, keine Implementierung |
| ai_service.py | STUB | 1 Zeile Docstring, keine Implementierung |
| ai.py Router | STUB | 5 Endpoints geplant, 0 implementiert |
| ai_predictions Tabelle | ZU PRUEFEN | Model existiert, Alembic-Migration pruefen |

**Bewertung:** AI-Model vollstaendig implementiert ✅. Service/Repo/Router sind STUBS → Phase 3 Stufe 2 Blocker (aber Model-Basis vorhanden).

---

## 6. Readiness-Matrix (aktualisiert 2026-02-23)

| Phase | Readiness | Status | Verbleibende Schritte |
|-------|-----------|--------|----------------------|
| **Phase 0** | **100%** | ✅ ABGESCHLOSSEN | 32 Alerts aktiv (Ziel 28+), 27+ Metriken, Handler integriert |
| **Phase 1** | **100%** | ✅ ABGESCHLOSSEN | 7/7 Kriterien, CI gruen, Wokwi MCP dokumentiert |
| **Phase 2** | **90%** | ⚠️ CODE FERTIG | ~~Sidebar-Links~~ ✅, Stack-Deployment, ESP32-Hardware |
| **Phase 3** | **35%** | ⚠️ STUFE 1 AKTIV | Stufe 1 via 32 Alerts ✅. AI Model existiert ✅. Service/Repo/Router STUB. Dependencies fehlen |
| **Phase 4** | **40%** | ⚠️ BASIS DA | 2/5 Dashboards (system-health, debug-console). Frontend MonitorView+SystemMonitor umfangreich. PostgreSQL-Datasource fehlt |

### Kritischer Pfad (aktualisiert)

```
✅ Phase 0 (DONE) → ✅ Phase 1 (DONE)
                   → ⚠️ Phase 2 (Deploy + Hardware) → Phase 3 → Phase 4
```

### Verbleibende Aktionen fuer Testlauf-Start

| # | Aktion | Agent/Skill | Prioritaet | Status |
|---|--------|-------------|-----------|--------|
| ~~1~~ | ~~Sidebar-Links fuer /calibration + /sensor-history~~ | ~~frontend-dev~~ | ~~HOCH~~ | ✅ Seit 2026-02-24 |
| ~~2~~ | ~~Makefile Echo aktualisieren~~ | ~~Hauptkontext~~ | ~~NIEDRIG~~ | ✅ Korrekt |
| 3 | Grafana Reload verifizieren (32 Alerts aktiv) | system-control | MITTEL | 🔲 |
| 4 | Stack hochfahren + Health pruefen | system-control | HOCH | 🔲 |
| 5 | ESP32 flashen + konfigurieren | User (PowerShell) | HOCH | 🔲 |
| 6 | E2E Datenpfad verifizieren (ESP→MQTT→Server→DB→Frontend) | auto-ops | HOCH | 🔲 |
| 7 | PostgreSQL als Grafana-Datasource hinzufuegen | system-control | MITTEL | 🔲 (Phase 4 Vorbedingung) |
| 8 | AI-Service + Repo + Router implementieren (Phase 3 Stufe 2) | server-dev | MITTEL | 🔲 |

---

## 7. Logging-Readiness fuer Testlauf

### Agent-Log-Zugriff verifiziert

| Agent | Log-Quelle | Zugriffsmethode | Bereit |
|-------|-----------|----------------|--------|
| server-debug | `logs/server/god_kaiser.log` | Read (JSON, rotating 10MB×10) | ✅ |
| mqtt-debug | Docker stdout | `docker compose logs mqtt-broker` / Loki | ✅ |
| esp32-debug | `logs/current/esp32_serial.log` | Read (Text, User-Capture) | ⚠️ Nur mit Serial-Capture |
| frontend-debug | Docker stdout | `docker compose logs el-frontend` / Loki | ✅ |
| test-log-analyst | `logs/wokwi/reports/` | Read (JSON/XML) | ✅ |
| db-inspector | Docker: `postgres` logs / Loki | Bash docker compose logs (kein Bind-Mount!) | ⚠️ Nur via Docker/Loki |

### Loki-Integration (Monitoring-Profil erforderlich)

| Label | Service | Log-Format |
|-------|---------|-----------|
| `compose_service="el-servador"` | Server | JSON (level, logger extrahiert) |
| `compose_service="el-frontend"` | Frontend | JSON (level, component extrahiert) |
| `compose_service="mqtt-broker"` | MQTT | Text (raw stdout) |
| `compose_service="postgres"` | PostgreSQL | Text (raw stdout) |
| `compose_service="esp32-serial-logger"` | ESP32 Serial Bridge | JSON (level, device, component) |

### Voraussetzungen fuer vollstaendiges Logging

- [ ] Monitoring-Profil aktiv: `docker compose --profile monitoring up -d`
- [ ] ESP32 Serial-Capture eingerichtet (Wokwi: `--serial-log-file`, Real: `pio device monitor > log`)
- [ ] Session-Script ausgefuehrt: `scripts/debug/start_session.sh` (erstellt `logs/current/` Symlinks)

---

## 8. Empfehlung (aktualisiert)

**Naechste Schritte fuer Testlauf:**
1. ✅ ~~Error-Taxonomie Audit~~ ERLEDIGT
2. ✅ ~~Test-Error-Block 6000-6099~~ ERLEDIGT
3. ✅ ~~Metriken + Handler-Integration~~ ERLEDIGT (18 aktive Call-Sites)
4. ✅ ~~Grafana-Alerts~~ ERLEDIGT (32 Alerts, Ziel 28+ uebertroffen)
5. ✅ ~~Sidebar-Links~~ ERLEDIGT (seit 2026-02-24)
6. **Stack deployen + Grafana verifizieren** (system-control)
7. **ESP32 flashen + E2E pruefen** (User + auto-ops)
8. **PostgreSQL-Datasource in Grafana** (Vorbereitung fuer Phase 4 Dashboards)
9. **AI-Service implementieren** (Phase 3 Stufe 2 — Model existiert, Service/Repo fehlen)
