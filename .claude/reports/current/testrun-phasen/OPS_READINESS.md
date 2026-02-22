# Operationale Readiness - Phasenplan Validierung

> **Erfasst:** 2026-02-21
> **Quelle:** SYSTEM_STATE.md + Live-Checks
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

**Gesamt: 8 aktive Regeln** (Ziel Phase 0: 28+)

### Readiness-Bewertung

- Alert-Pipeline funktioniert (3-Stage A→B→C korrekt)
- Evaluation-Intervalle korrekt (Vielfache von 10s)
- **GAP:** 20 neue Alerts benoetigen 15 fehlende Metriken in metrics.py

---

## 2. Loki Log-Ingestion

| Check | Status | Details |
|-------|--------|---------|
| Loki Container | HEALTHY | automationone-loki Up 2h+ |
| Promtail Container | HEALTHY | automationone-promtail Up 2h+ |
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

### Exponierte God-Kaiser Metriken (15 total)

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
| ai_prediction.py Model | FEHLT | Datei existiert nicht in src/db/models/ |
| ai_repo.py | STUB | 2 Zeilen Docstring, keine Implementierung |
| ai_service.py | STUB | 1 Zeile Docstring, keine Implementierung |
| ai_predictions Tabelle | ZU PRUEFEN | Ggf. durch fruehe Migration vorhanden |
| Alembic Migration | FEHLT | Keine Migration fuer ai_predictions |

**Bewertung:** AI-Infrastruktur komplett leer. Phase 3 Blocker.

---

## 6. Readiness-Matrix

| Phase | Readiness | Blocker | Naechster Schritt |
|-------|-----------|---------|-------------------|
| **Phase 0** | 70% | 15 fehlende Metriken, Test-Error-Block 6000 | server-dev: metrics.py erweitern |
| **Phase 1** | 90% | Error-Injection-Job + Nightly in CI | esp32-dev: Szenarien + CI-Config |
| **Phase 2** | 85% | Frontend-Luecken (Wizard + Zeitreihen) | frontend-dev + ESP32 flashen |
| **Phase 3** | 30% | AI-Service komplett leer | server-dev: Model + Repo + Service |
| **Phase 4** | 50% | Dashboards fehlen, Error-Report-Format | Nach Phase 0-3 |

### Kritischer Pfad

```
server-dev (Metriken) → Phase 0 → Phase 1+2 (parallel) → Phase 3 → Phase 4
```

### Sofort Machbare Phase-0-Alerts (ohne neue Metriken)

1. ao-db-query-slow (Histogram existiert)
2. ao-db-connections-high (pg_stat_activity via postgres-exporter)
3. ao-container-restart (container_restart_count via cAdvisor)
4. ao-cadvisor-down (up{job="cadvisor"}) - BEREITS AKTIV
5. ao-prometheus-down (up{job="prometheus"}) - BEREITS AKTIV

---

## 7. Empfehlung

**Phase 0 starten mit:**
1. Error-Taxonomie Audit (Sync-Luecken schliessen)
2. Test-Error-Block 6000-6099 definieren
3. 5 sofort machbare Alerts hinzufuegen
4. Dann: server-dev fuer 15 fehlende Metriken
5. Dann: Restliche 15 Alerts mit neuen Metriken
