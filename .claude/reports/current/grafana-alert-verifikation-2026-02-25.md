# Grafana Alert & Dashboard Verifikation

**Datum:** 2026-02-25
**Agent:** auto-ops
**Stack:** Docker Compose (12 Services, all healthy)
**Grafana Version:** 11.5.2
**Alert-Dateien:** `docker/grafana/provisioning/alerting/alert-rules.yml` (28 Prometheus), `loki-alert-rules.yml` (5 Loki)

---

## Block A: Alert-Inventar

**Gesamtzahl:** 33 Alerts (API-verifiziert)

### Prometheus-Alerts (28)

| # | Title | UID | Rule Group | Severity | Eval |
|---|-------|-----|-----------|----------|------|
| 1 | Server Down | ao-server-down | automationone-critical | critical | 10s |
| 2 | MQTT Disconnected | ao-mqtt-disconnected | automationone-critical | critical | 10s |
| 3 | Database Down | ao-database-down | automationone-critical | critical | 10s |
| 4 | Loki Down | ao-loki-down | automationone-critical | critical | 10s |
| 5 | Alloy Down | ao-alloy-down | automationone-critical | critical | 10s |
| 6 | High Memory Usage | ao-high-memory | automationone-warnings | warning | 1m |
| 7 | ESP Devices Offline | ao-esp-offline | automationone-warnings | warning | 1m |
| 8 | High MQTT Error Rate | ao-high-mqtt-error-rate | automationone-warnings | warning | 1m |
| 9 | DB Query Slow | ao-db-query-slow | automationone-infrastructure | warning | 1m |
| 10 | DB Connections High | ao-db-connections-high | automationone-infrastructure | warning | 1m |
| 11 | cAdvisor Down | ao-cadvisor-down | automationone-infrastructure | critical | 1m |
| 12 | Temp Out of Range | ao-sensor-temp-range | automationone-sensor-alerts | warning | 30s |
| 13 | pH Out of Range | ao-sensor-ph-range | automationone-sensor-alerts | critical | 30s |
| 14 | Humidity Out of Range | ao-sensor-humidity-range | automationone-sensor-alerts | warning | 30s |
| 15 | EC Out of Range | ao-sensor-ec-range | automationone-sensor-alerts | warning | 30s |
| 16 | Sensor Data Stale | ao-sensor-stale | automationone-sensor-alerts | warning | 30s |
| 17 | Heartbeat Gap | ao-heartbeat-gap | automationone-device-alerts | warning | 30s |
| 18 | ESP Boot Loop | ao-esp-boot-loop | automationone-device-alerts | critical | 30s |
| 19 | Error Cascade | ao-esp-error-cascade | automationone-device-alerts | critical | 30s |
| 20 | ESP in Safe Mode | ao-esp-safe-mode | automationone-device-alerts | warning | 30s |
| 21 | WebSocket Disconnects | ao-ws-disconnects | automationone-application-alerts | warning | 30s |
| 22 | MQTT Backlog | ao-mqtt-message-backlog | automationone-application-alerts | warning | 30s |
| 23 | API Error Rate High | ao-api-errors-high | automationone-application-alerts | warning | 30s |
| 24 | Logic Engine Errors | ao-logic-engine-errors | automationone-application-alerts | warning | 30s |
| 25 | Actuator Timeout | ao-actuator-timeout | automationone-application-alerts | warning | 30s |
| 26 | Safety System Triggered | ao-safety-triggered | automationone-application-alerts | critical | 30s |
| 27 | MQTT Broker No Clients | ao-mqtt-broker-no-clients | automationone-mqtt-broker-alerts | critical | 30s |
| 28 | MQTT Broker Messages Stored High | ao-mqtt-broker-messages-stored | automationone-mqtt-broker-alerts | warning | 30s |

### Loki-Alerts (5)

| # | Title | UID | Severity |
|---|-------|-----|----------|
| 29 | Loki: Error Storm Detected | ao-loki-error-storm | warning |
| 30 | Loki: ESP Disconnect Wave | ao-loki-esp-disconnect-wave | warning |
| 31 | Loki: Database Connection Errors | ao-loki-db-connection-errors | warning |
| 32 | Loki: ESP Boot Loop Detected | ao-loki-esp-boot-loop | warning |
| 33 | Loki: Critical Error Burst | ao-loki-critical-burst | critical |

**Ergebnis:**
- [x] 28 Prometheus-Alerts vorhanden
- [x] 5 Loki-Alerts vorhanden
- [x] Keine verwaisten oder duplizierten Alerts
- [x] Legacy `ao-promtail-down` wird korrekt via `deleteRules` entfernt

---

## Block B: noDataState-Audit

### Bewertung

| Alert | noDataState aktuell | noDataState empfohlen | Bewertung |
|-------|--------------------|-----------------------|-----------|
| Server Down | Alerting | Alerting | OK — fehlende Metrik = Service offline |
| MQTT Disconnected | Alerting | Alerting | OK — fehlende Metrik = Verbindung weg |
| Database Down | Alerting | Alerting | OK — fehlende Metrik = DB offline |
| Loki Down | Alerting | Alerting | OK |
| Alloy Down | Alerting | Alerting | OK |
| High Memory Usage | OK | OK | OK — keine Daten = Server startet noch |
| ESP Devices Offline | OK | OK | OK — keine ESP-Daten = keine ESPs registered |
| High MQTT Error Rate | OK | OK | OK — keine Errors = gut |
| DB Query Slow | OK | OK | OK |
| DB Connections High | OK | OK | OK |
| cAdvisor Down | Alerting | Alerting | OK — fehlende Metrik = cAdvisor offline |
| Temp Out of Range | OK | OK | OK — keine Daten = kein Sensor aktiv |
| pH Out of Range | OK | OK | OK |
| Humidity Out of Range | OK | OK | OK |
| EC Out of Range | OK | OK | OK |
| Sensor Data Stale | OK | OK | OK |
| **Heartbeat Gap** | **OK** | **Alerting** | **PROBLEM** — fehlende Heartbeat-Metrik KANN bedeuten: ESP offline ODER keine ESPs registriert. Bei `noDataState: OK` wird ein komplett ausgefallener ESP32 (Metrik verschwindet) NICHT erkannt. Allerdings: Im aktuellen Setup feuert der Alert korrekt weil die Metrik mit altem Timestamp stehen bleibt, nicht verschwindet. `OK` ist daher akzeptabel solange die Metrik persistent ist. |
| ESP Boot Loop | OK | OK | OK — keine Boot-Counts = kein Problem |
| Error Cascade | OK | OK | OK |
| ESP in Safe Mode | OK | OK | OK |
| WebSocket Disconnects | OK | OK | OK |
| MQTT Backlog | OK | OK | OK |
| API Error Rate High | OK | OK | OK |
| Logic Engine Errors | OK | OK | OK |
| Actuator Timeout | OK | OK | OK |
| Safety System Triggered | OK | OK | OK |
| MQTT Broker No Clients | Alerting | Alerting | OK — fehlende Metrik = Exporter down = MQTT-Problem |
| MQTT Broker Messages Stored High | OK | OK | OK |
| Loki: Error Storm | OK | OK | OK |
| Loki: ESP Disconnect Wave | OK | OK | OK |
| Loki: DB Connection Errors | OK | OK | OK |
| Loki: ESP Boot Loop | OK | OK | OK |
| Loki: Critical Error Burst | OK | OK | OK |

**Ergebnis:**
- [x] Kein Sensor-Wert-Alert hat noDataState: Alerting (korrekt OK)
- [x] Alle Infrastruktur-"Down"-Alerts haben noDataState: Alerting (korrekt)
- [x] Alle Loki-Alerts haben noDataState: OK (korrekt)
- [~] Heartbeat Gap: `OK` ist grenzwertig aber funktional akzeptabel (Metrik bleibt persistent mit altem Timestamp)

---

## Block C: for-Duration-Audit

| Alert | for aktuell | Severity | Minimum empfohlen | Bewertung |
|-------|------------|----------|-------------------|-----------|
| Server Down | 1m | critical | 1m | OK |
| MQTT Disconnected | 1m | critical | 1m | OK |
| Database Down | 1m | critical | 1m | OK |
| Loki Down | 2m | critical | 1m | OK |
| Alloy Down | 2m | critical | 1m | OK |
| High Memory Usage | 5m | warning | 2m | OK |
| ESP Devices Offline | 3m | warning | 2m | OK |
| High MQTT Error Rate | 2m | warning | 2m | OK |
| DB Query Slow | 5m | warning | 2m | OK |
| DB Connections High | 3m | warning | 2m | OK |
| cAdvisor Down | 2m | critical | 1m | OK |
| Temp Out of Range | 2m | warning | 2m | OK |
| pH Out of Range | 1m | critical | 1m | OK |
| Humidity Out of Range | 2m | warning | 2m | OK |
| EC Out of Range | 2m | warning | 2m | OK |
| Sensor Data Stale | 5m | warning | 2m | OK |
| Heartbeat Gap | 2m | warning | 2m | OK |
| ESP Boot Loop | 1m | critical | 1m | OK |
| **Error Cascade** | **30s** | **critical** | **1m** | **PROBLEM — 30s ist unter dem empfohlenen Minimum. Bei 30s Eval-Intervall feuert der Alert nach einer einzigen Evaluation. Empfehlung: for: 1m** |
| ESP in Safe Mode | 1m | warning | 2m | GRENZWERTIG — warning mit nur 1m for. Da Safe-Mode ein bewusster Zustandswechsel ist, waere 2m sicherer. |
| WebSocket Disconnects | 2m | warning | 2m | OK |
| MQTT Backlog | 3m | warning | 2m | OK |
| API Error Rate High | 3m | warning | 2m | OK |
| Logic Engine Errors | 2m | warning | 2m | OK |
| Actuator Timeout | 2m | warning | 2m | OK |
| **Safety System Triggered** | **0s** | **critical** | **1m** | **DESIGN-ENTSCHEIDUNG — 0s ist beabsichtigt: Safety-Events erfordern sofortige Benachrichtigung. Kein False-Positive-Risiko weil Safety nur bei echtem Eingriff feuert. AKZEPTABEL.** |
| MQTT Broker No Clients | 2m | critical | 1m | OK |
| MQTT Broker Messages Stored High | 5m | warning | 2m | OK |
| Loki: Error Storm | 2m | warning | 2m | OK |
| Loki: ESP Disconnect Wave | 1m | warning | 2m | GRENZWERTIG — 1m unter Minimum fuer warning |
| Loki: DB Connection Errors | 1m | warning | 2m | GRENZWERTIG — 1m unter Minimum fuer warning |
| Loki: ESP Boot Loop | 2m | warning | 2m | OK |
| Loki: Critical Error Burst | 1m | critical | 1m | OK |

**Ergebnis:**
- [!] **1 Alert unter Minimum:** Error Cascade (30s, sollte 1m sein)
- [~] **3 Alerts grenzwertig:** ESP Safe Mode (1m statt 2m), ESP Disconnect Wave (1m statt 2m), DB Connection Errors (1m statt 2m)
- [x] Safety System Triggered (0s) ist bewusst so designed — akzeptabel
- [x] Alle anderen Alerts haben korrekte for-Duration

---

## Block D: Schwellwert-Plausibilitaet

### Sensor-Alerts

| Alert | PromQL Expression | Schwelle | Physikalischer Bereich | Bewertung |
|-------|------------------|----------|----------------------|-----------|
| Temp Out of Range | `sensor_value{type="temperature"} > 85 or < -40` | >85 / <-40 | DS18B20: -55 bis +125. SHT31: -40 bis +125 | OK — DS18B20-spezifisch. >85C ist Power-On-Reset-Wert (suspect). Sinnvoll. |
| pH Out of Range | `sensor_value{type="ph"} > 14 or < 0` | >14 / <0 | pH-Skala: 0-14 | OK — physikalische Grenzen korrekt |
| Humidity Out of Range | `sensor_value{type="humidity"} > 100 or < 0` | >100 / <0 | 0-100% | OK — physikalische Grenzen korrekt |
| EC Out of Range | `sensor_value{type="ec"} > 10000` | >10000 | 0-65535 uS/cm (typisch <5000) | OK — 10000 ist grosszuegig aber sinnvoll |
| Sensor Data Stale | `time() - sensor_last_update > 300` | >5min | - | OK — ESP sendet alle 30s, >5min = definitiv stale |
| Heartbeat Gap | `time() - esp_last_heartbeat > 120` | >2min | Heartbeat alle ~30s | OK — 4 verpasste Heartbeats bevor Alert |

### Infrastruktur-Alerts

| Alert | PromQL Expression | Schwelle | Bewertung |
|-------|------------------|----------|-----------|
| High Memory | `memory_percent` | >85% | OK — 5% Puffer vor "degraded" bei 90% |
| ESP Offline | `offline/total > 0.5 and online > 0` | >50% offline | OK — Guard gegen Pure-Mock-Daten vorhanden |
| High MQTT Error Rate | `increase(mqtt_errors_total[5m])` | >10 | OK — 2 Fehler/min Durchschnitt |
| DB Query Slow | `histogram_quantile(0.95, rate(db_query_duration_seconds_bucket[5m]))` | >1s | OK — P95 mit avg_over_time-Effekt durch rate() |
| DB Connections High | `pg_stat_database_numbackends` | >80 | OK — PostgreSQL default max_connections=100 |
| MQTT Broker No Clients | `broker_clients_connected` | <1 | OK |
| MQTT Broker Messages Stored | `broker_messages_stored` | >5000 | OK |

### Potenzielle False-Positive-Quellen bei Sensor-Alerts

**PROBLEM: Sensor-Alerts nutzen Rohwerte statt avg_over_time()**

Die PromQL-Expression fuer Sensor-Alerts ist z.B.:
```
god_kaiser_sensor_value{sensor_type="temperature"} > 85
```

Dies ist ein **Rohwert-Vergleich**. Ein einzelner fehlerhafter Messwert (Spike) kann den Alert triggern. Die `for: 2m` Duration schuetzt teilweise (Alert muss 2 Minuten in Folge erfuellt sein), aber da die Metrik nur den LETZTEN Wert speichert (nicht ein Sliding Window), reicht ein persistenter Fehlwert.

**Empfehlung:** `avg_over_time(god_kaiser_sensor_value{sensor_type="temperature"}[2m])` statt Rohwert. Da die `for: 2m` bereits vorhanden ist, ist das Risiko allerdings gering.

**Ergebnis:**
- [x] Schwellwerte physikalisch plausibel
- [~] Sensor-Alerts nutzen Rohwerte statt avg_over_time — geringes Risiko dank for-Duration
- [x] Infrastruktur-Alerts nutzen rate()/increase()/histogram_quantile() korrekt

---

## Block E: Actionability-Audit

### Alle Alerts haben severity-Label: JA (33/33 verifiziert)

### Actionability pro Alert

| Alert | Severity | Wer reagiert | Erste Aktion | Actionable? |
|-------|----------|-------------|-------------|-------------|
| Server Down | critical | Robin/DevOps | `docker compose logs el-servador --tail=50` dann `docker compose restart el-servador` | Ja |
| MQTT Disconnected | critical | Robin/DevOps | `docker compose logs mqtt-broker --tail=50` dann `docker compose restart mqtt-broker` | Ja |
| Database Down | critical | Robin/DevOps | `docker compose logs postgres --tail=50`, `docker exec automationone-postgres pg_isready` | Ja |
| Loki Down | critical | DevOps | `docker compose logs loki --tail=50` | Ja |
| Alloy Down | critical | DevOps | `docker compose logs alloy --tail=50` | Ja |
| High Memory Usage | warning | DevOps | `docker stats --no-stream`, Memory-Leaks pruefen | Ja |
| ESP Devices Offline | warning | Robin | ESP physisch pruefen, WiFi, MQTT-Broker | Ja |
| High MQTT Error Rate | warning | DevOps | Server-Logs nach Handler-Exceptions pruefen | Ja |
| DB Query Slow | warning | DevOps | `pg_stat_activity` pruefen, slow-query-Analyse | Ja |
| DB Connections High | warning | DevOps | Connection-Pool pruefen, Leaks suchen | Ja |
| cAdvisor Down | critical | DevOps | `docker compose restart cadvisor` | Ja |
| Temp Out of Range | warning | Robin | Sensor physisch pruefen, Verkabelung | Ja |
| pH Out of Range | critical | Robin | Sonde kalibrieren oder austauschen | Ja |
| Humidity Out of Range | warning | Robin | Sensor pruefen | Ja |
| EC Out of Range | warning | Robin | Sensor kalibrieren | Ja |
| Sensor Data Stale | warning | Robin/DevOps | ESP-Verbindung, MQTT, Handler pruefen | Ja |
| Heartbeat Gap | warning | Robin | ESP physisch pruefen, Reset | Ja |
| ESP Boot Loop | critical | Robin | Firmware, Stromversorgung, Watchdog pruefen | Ja |
| Error Cascade | critical | Robin/DevOps | Serial-Log + Server-Log korrelieren | Ja |
| ESP in Safe Mode | warning | Robin | Fehlerursache analysieren, Reset | Ja |
| WebSocket Disconnects | warning | DevOps | Server-Last, Netzwerk pruefen | Ja |
| MQTT Backlog | warning | DevOps | Subscriber-Gesundheit, Message-Rate pruefen | Ja |
| API Error Rate High | warning | DevOps | API-Endpunkte, Validierung pruefen | Ja |
| Logic Engine Errors | warning | DevOps | Regelkonfiguration, Sensordaten pruefen | Ja |
| Actuator Timeout | warning | Robin | ESP-Verbindung, GPIO pruefen | Ja |
| Safety System Triggered | critical | Robin | Sofort pruefen: Emergency-Stop, Rate-Limiter | Ja |
| MQTT Broker No Clients | critical | Robin/DevOps | MQTT-Broker, Netzwerk, alle Clients pruefen | Ja |
| MQTT Broker Messages Stored | warning | DevOps | Retained-Messages pruefen, Subscriber-Status | Ja |
| Loki: Error Storm | warning | DevOps | Server-Logs auf Error-Loop pruefen | Ja |
| Loki: ESP Disconnect Wave | warning | Robin/DevOps | Netzwerk, Broker, ESP-Firmware | Ja |
| Loki: DB Connection Errors | warning | DevOps | DB-Verbindung, Connection-Pool | Ja |
| Loki: ESP Boot Loop | warning | Robin | Serial-Log, Stromversorgung | Ja |
| Loki: Critical Error Burst | critical | Robin/DevOps | Alle Service-Logs pruefen, sofort | Ja |

**Ergebnis:**
- [x] Jeder Alert hat ein severity-Label
- [x] Jeder Alert hat eine dokumentierte Aktion (in annotations.description)
- [x] Alle Alerts sind actionable — kein "nur informativ" ohne Aktion

---

## Block F: Dashboard-Verifikation

### Dashboards

| Dashboard | UID | Panels | Template Vars | Status |
|-----------|-----|--------|--------------|--------|
| AutomationOne - Operations | automationone-system-health | 24 | service, interval | OK |
| Debug Console | debug-console | 6 | service, search, correlation_id, error_code | OK |

### Datasources

| Name | Type | URL | Status |
|------|------|-----|--------|
| Prometheus | prometheus | http://prometheus:9090 | Erreichbar (7 active targets, all UP) |
| Loki | loki | http://loki:3100 | Erreichbar (logs fliessen) |

### Prometheus Scrape Targets

| Job | Status |
|-----|--------|
| el-servador | UP |
| cadvisor | UP |
| loki | UP |
| alloy | UP |
| mqtt-broker | UP |
| postgres | UP |
| prometheus | UP |

**Ergebnis:**
- [x] Alle Dashboards laden ohne Fehler
- [x] Datasources (Prometheus + Loki) erreichbar
- [x] Debug-Console Dashboard hat 6 Panels und 4 Template-Variablen
- [x] 7/7 Prometheus Scrape Targets sind UP

---

## Block G: Fehlende Alerts (Gap-Analyse)

### Abdeckungsmatrix

| Fehlerzustand | Abgedeckt? | Alert-Name | Anmerkung |
|--------------|-----------|------------|-----------|
| Service crashed / Container down | Ja | Server Down, Database Down, Loki Down, Alloy Down, cAdvisor Down | 5 von 12 Services abgedeckt. Frontend und Prometheus NICHT abgedeckt. |
| ESP sendet nicht mehr | Ja | Heartbeat Gap, Sensor Data Stale | Doppelte Abdeckung, gut |
| MQTT-Broker unerreichbar | Ja | MQTT Disconnected, MQTT Broker No Clients | |
| DB-Connection-Pool voll | Ja | DB Connections High (>80) | |
| Disk-Space > 90% | **NEIN** | - | Kein node-exporter deployed, keine Host-Metriken. cAdvisor hat `container_fs_usage_bytes` aber kein Alert darauf. |
| Memory-Usage > 90% | Teilweise | High Memory Usage (>85%) | Nur Server-Prozess-Memory, NICHT Container- oder Host-Memory |
| Error-Storm (> 10 Errors/5min) | Teilweise | Loki: Error Storm | **PROBLEM:** Alert sucht `level="ERROR"`, aber Server loggt Uvicorn access-logs ohne level-Label. Nur structured Server-Logs (z.B. Exception-Handler) haben `level="ERROR"`. HTTP 4xx/5xx werden NICHT erkannt. |
| ESP Boot-Loop | Ja | ESP Boot Loop (Prometheus) + Loki: ESP Boot Loop (Loki) | Doppelt, gut |
| Sensor-Wert ausserhalb Range | Ja | Temp/pH/Humidity/EC Out of Range | 4 Sensortypen abgedeckt |
| Loki-Ingestion fehlgeschlagen | Teilweise | Loki Down (via `up{job="loki"}`) | Erkennt Loki-Crash, aber NICHT Ingestion-Backlog. Metrik `loki_ingester_wal_disk_full_failures_total` existiert, wird nicht ueberwacht. |
| Prometheus-Scrape fehlgeschlagen | **NEIN** | - | Kein generischer Scrape-Failure-Alert. Einzelne Targets (el-servador, cadvisor etc.) haben eigene Alerts, aber z.B. Prometheus-Exporter oder MQTT-Exporter scrape-failure wird nicht erkannt. |
| SSL-Zertifikat laeuft ab | N/A | - | Kein SSL im Development-Setup |

### Fehlende Alerts (Empfehlungen)

| Priority | Fehlender Alert | PromQL/LogQL | Begruendung |
|----------|----------------|-------------|-------------|
| **HOCH** | Prometheus Down (self-monitoring) | `up{job="prometheus"}` | Wenn Prometheus ausfaellt, feuert kein Alert mehr. Grafana sollte Prometheus ueberwachen. |
| **HOCH** | Frontend Down | `up{job="el-frontend"}` oder HTTP-Check | Frontend hat keinen Prometheus-Scrape-Target (kein /metrics Endpoint). Alternative: Loki-basiert oder externer HTTP-Check. |
| **MITTEL** | Container Restart Alert | `increase(container_restart_count[5m]) > 0` | Container-Restart-Loops erkennen (cadvisor-Metrik vorhanden) |
| **MITTEL** | Disk Space Alert | `container_fs_usage_bytes{id="/"} / container_fs_limit_bytes{id="/"} > 0.9` | Host-Disk 90% via cAdvisor root-filesystem-Metrik |
| **NIEDRIG** | Loki Ingestion Failure | `increase(loki_ingester_wal_disk_full_failures_total[5m]) > 0` | Loki-spezifisch |
| **NIEDRIG** | Prometheus Exporter Down (generisch) | `up == 0` ohne job-Filter | Generischer Catch-All fuer alle Targets |

### Metriken die nicht in Prometheus existieren

Die folgenden Metriken werden in Alerts referenziert, existieren aber NICHT in Prometheus:

| Metrik | Alert | Auswirkung |
|--------|-------|-----------|
| `god_kaiser_esp_boot_count` | ESP Boot Loop | Alert evaluiert zu NoData -> OK (noDataState: OK). **Alert ist effektiv inaktiv bis die Metrik implementiert wird.** |
| `god_kaiser_mqtt_errors_total` | High MQTT Error Rate | Gleich: NoData -> OK. **Alert ist effektiv inaktiv.** |

Diese Metriken muessen im Server-Code (`metrics.py`) implementiert werden, damit die Alerts funktionieren.

---

## Block H: Manueller Alert-Trigger-Test

### Test 1: Prometheus-Alert (MQTT Broker No Clients)

| Schritt | Zeitstempel | Ergebnis |
|---------|------------|----------|
| mosquitto-exporter gestoppt | 10:44:05 | Container stopped |
| Metrik `broker_clients_connected` verschwindet | ~10:47:00 | PromQL liefert leeres Ergebnis |
| Alert wechselt zu "Pending (NoData)" | 10:47:30 | noDataState: Alerting greift korrekt |
| Alert wechselt zu "Firing" | 10:49:30 | Nach 2m Pending (for: 2m) |
| mosquitto-exporter neu gestartet | 10:50:34 | Container restarted |
| Alert wechselt zu "Normal/Inactive" | ~10:51:00 | Recovery funktioniert |

**Ergebnis: ERFOLGREICH** — Voller Zyklus: Normal -> Pending -> Firing -> Recovery

### Test 2: Loki-Alert (Error Storm)

| Schritt | Zeitstempel | Ergebnis |
|---------|------------|----------|
| 15 HTTP 404 Requests gesendet | 10:43:54 | Keine ERROR-Level Logs in Loki |
| 40 HTTP 422 Requests gesendet | 10:48:24 | Keine ERROR-Level Logs in Loki |
| Alert-Status nach 7 Minuten | 10:51:00 | Inactive |

**Ergebnis: NICHT GETRIGGERT**

**Root-Cause:** Die Alloy-Pipeline extrahiert `level` nur aus dem structured Server-Log-Format:
```
YYYY-MM-DD HH:MM:SS - logger.name - LEVEL - [request_id] - message
```

Uvicorn access logs (HTTP 4xx/5xx) haben das Format:
```
INFO:     172.18.0.3:59152 - "GET /path HTTP/1.1" 404 Not Found
```

Diese matchen das Regex-Pattern NICHT und erhalten daher kein `level`-Label oder werden als `level="INFO"` klassifiziert. Die Loki-Error-Storm-Query `{compose_service="el-servador"} | level="ERROR"` findet daher NUR Logs aus Exception-Handlern, nicht HTTP-Fehler.

**Konsequenz:** Der Error-Storm-Alert feuert nur bei echten Python-Exceptions (Tracebacks), nicht bei HTTP-Error-Responses. Das ist funktional **eingeschraenkt aber nicht falsch** — HTTP 4xx sind Client-Fehler, keine Server-Fehler. Echte Server-Exceptions (500) erzeugen structured ERROR-Logs und wuerden den Alert triggern.

---

## Aktuell feuernde Alerts

| Alert | State | Instanzen | Begruendung |
|-------|-------|-----------|-------------|
| Heartbeat Gap | Firing | 5 ESP-Devices | 5 registrierte ESP32-Geraete haben seit >2 Minuten keinen Heartbeat gesendet. **Korrekt** — es sind aktuell keine ESP32 physisch verbunden. Dies sind Mock-/Test-Devices aus frueheren Sessions. |

---

## Fix-Liste (Priorisiert)

### HOCH (sollte vor Hardware-Test gefixt werden)

| # | Was | Datei | Aenderung |
|---|-----|-------|-----------|
| F1 | **Fehlende Metriken implementieren** | `El Servador/.../metrics.py` | `god_kaiser_esp_boot_count` (Counter) und `god_kaiser_mqtt_errors_total` (Counter) hinzufuegen. Ohne diese sind 2 Alerts (ESP Boot Loop, High MQTT Error Rate) effektiv inaktiv. |
| F2 | **Error Cascade: for zu kurz** | `alert-rules.yml:982` | `for: 30s` -> `for: 1m` (critical Alert sollte mindestens 1m pending sein) |

### MITTEL (sollte zeitnah gefixt werden)

| # | Was | Datei | Aenderung |
|---|-----|-------|-----------|
| F3 | **Loki ESP Disconnect Wave: for zu kurz** | `loki-alert-rules.yml:111` | `for: 1m` -> `for: 2m` (warning-Level Minimum) |
| F4 | **Loki DB Connection Errors: for zu kurz** | `loki-alert-rules.yml:158` | `for: 1m` -> `for: 2m` (warning-Level Minimum) |
| F5 | **ESP Safe Mode: for zu kurz** | `alert-rules.yml:1030` | `for: 1m` -> `for: 2m` (warning-Level Minimum) |
| F6 | **Fehlender Alert: Prometheus Down** | `alert-rules.yml` | Neuer Alert: `up{job="prometheus"} < 1`, noDataState: Alerting, for: 1m |
| F7 | **Sensor-Alerts: avg_over_time** | `alert-rules.yml` | Optional: Sensor-Queries auf `avg_over_time(...[2m])` umstellen fuer Spike-Schutz |

### NIEDRIG (nice-to-have)

| # | Was | Datei | Aenderung |
|---|-----|-------|-----------|
| F8 | Fehlender Alert: Container Restart | `alert-rules.yml` | Neuer Alert: `increase(container_restart_count[5m]) > 0` |
| F9 | Fehlender Alert: Disk Space | `alert-rules.yml` | Neuer Alert via cAdvisor `container_fs_usage_bytes` |
| F10 | Fehlender Alert: Frontend Down | - | Benoetigt entweder Frontend /metrics Endpoint oder Loki-basierte Health-Pruefung |
| F11 | Loki Error Storm Abdeckung erweitern | `loki-alert-rules.yml` | Zusaetzliche Query: `|~ "(?i)(exception|traceback|status_code=5)"` statt nur `level="ERROR"` |

---

## Zusammenfassung

| Kriterium | Status | Details |
|-----------|--------|---------|
| 33 Alerts inventarisiert | PASS | 28 Prometheus + 5 Loki |
| noDataState korrekt | PASS | Alle Kategorien korrekt gesetzt |
| for-Duration >= Minimum | WARN | 1 unter Minimum (Error Cascade: 30s), 3 grenzwertig |
| Schwellwerte plausibel | PASS | Physikalisch korrekt, rate()/histogram_quantile() wo sinnvoll |
| Severity-Labels vorhanden | PASS | 33/33 |
| Dashboards funktional | PASS | 2 Dashboards, 2 Datasources, 7 Targets |
| Fehlende Alerts identifiziert | PASS | 6 Empfehlungen (2 HOCH, 4 MITTEL/NIEDRIG) |
| Prometheus-Alert getriggert | PASS | MQTT Broker No Clients: voller Zyklus verifiziert |
| Loki-Alert getriggert | FAIL | Error Storm nicht triggerbar via HTTP-Fehler (Alloy level-Extraction) |
| **Fehlende Metriken** | **CRITICAL** | `god_kaiser_esp_boot_count` und `god_kaiser_mqtt_errors_total` existieren nicht -> 2 Alerts inaktiv |

**Gesamtbewertung:** Das Alerting-System ist solide aufgebaut. Die Pipeline-Architektur (A->B->C) ist konsistent. Die Haupt-Probleme sind: 2 fehlende Metriken (macht 2 Alerts wirkungslos), 1 zu kurze for-Duration, und die Loki-Error-Storm-Abdeckung ist auf structured ERROR-Logs beschraenkt. Vor dem Hardware-Test sollten mindestens F1 (fehlende Metriken) und F2 (Error Cascade for-Duration) behoben werden.
