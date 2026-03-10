# AutoOps Deep Inspection Report
**Datum:** 2026-03-10 12:50-13:00 UTC
**Branch:** feat/T13-zone-device-scope-2026-03-09
**Methode:** Docker-Rebuild, DB-Analyse, aktive API-Tests, Loki-Log-Korrelation

---

## Executive Summary

System grundsaetzlich funktional. 5 Bugs/Luecken identifiziert, davon 2 HIGH, 2 MEDIUM, 1 LOW.
Staerkste Bereiche: Zone-Switch mit Subzone-Transfer, Loki-Pipeline, Notification-System.
Schwaechste Bereiche: Audit-Trail, Sensor-Data-Duplikate, Subzone-Stamping auf sensor_data.

---

## 1. System-Gesundheit

| Komponente | Status | Details |
|---|---|---|
| Server (God-Kaiser) | HEALTHY | Startup 1.1s, 12 MQTT-Handler, 3 Circuit Breakers closed |
| MQTT (Mosquitto) | HEALTHY | god_kaiser_server_1 connected, 15 Subscriptions |
| PostgreSQL | HEALTHY | 17 MB, 31 Tabellen, Pool 10+20 |
| Loki | HEALTHY | Alerts evaluieren alle 60s, 5 LogQL-Regeln aktiv |
| Frontend | HEALTHY | Rebuild cached, Container restarted |
| Prometheus | HEALTHY | Metrics-Job alle 15s |

**Warnings:**
- MQTT TLS disabled (expected in dev)
- Email template directory not found: /app/templates/email
- LWT-Events fuer ESP_472204 bei jedem Server-Restart (retained LWT)

---

## 2. Datenbank-Zustand

### 2.1 Tabellen-Uebersicht (Top)
| Tabelle | Rows | Groesse | Bemerkung |
|---|---|---|---|
| sensor_data | 5.796 | 4.2 MB | Groesste Tabelle |
| esp_heartbeat_logs | 2.175 | 1.6 MB | |
| audit_logs | 475 | 656 KB | NUR LWT-Events! |
| notifications | 103 | 280 KB | |
| device_zone_changes | 52 | 96 KB | Vollstaendig |
| esp_devices | 3 | 216 KB | 2 online, 1 offline |
| zones | 11 | 64 KB | 2 aktiv, 9 soft-deleted |
| subzone_configs | 2 | 128 KB | |
| sensor_configs | 3 | 152 KB | |

### 2.2 Devices
| Device | Status | Zone | Sensors | Actuators | Last Seen |
|---|---|---|---|---|---|
| MOCK_24557EC6 | online | wokwi_testzone | 0 | 1 | aktuell |
| ESP_472204 | online | echter_esp | 2 (SHT31) | 1 (digital) | aktuell |
| ESP_00000001 | offline | wokwi_testzone | 1 (DS18B20) | 0 | 2026-03-09 14:32 |

### 2.3 Sensor-Data Freshness
| ESP | Sensor | Datenpunkte | Letzter Wert | Intervall |
|---|---|---|---|---|
| ESP_472204 | sht31_temp | 2.864 | 19.4 C | ~30s |
| ESP_472204 | sht31_humidity | 2.868 | 43.3 %RH | ~30s |
| ESP_00000001 | ds18b20 | 62 | - | offline |

### 2.4 Heartbeat-Analyse (24h)
| Device | Count | Intervall | Bemerkung |
|---|---|---|---|
| MOCK_24557EC6 | 1.021 | ~19s | Korrekt (15s config) |
| ESP_472204 | 748 | ~115s | HOCH - echtes ESP mit 30s Heartbeat |
| ESP_00000001 | 9 | - | Offline seit gestern |

---

## 3. Aktive Tests - Lifecycle

### 3.1 Zone-Lifecycle (PASS)
| Schritt | Ergebnis | Dauer |
|---|---|---|
| Zone erstellen | OK (201) | 10.5ms |
| Zone listen (nur aktive) | OK - 3 von 13 | 4.3ms |
| Zone soft-delete | OK | 26.2ms |
| Zone reactivate (deleted) | FAIL - "Only archived zones" | 8.3ms |
| Zone archivieren | OK | 20.0ms |
| Zone reactivate (archived) | OK | 14.7ms |

**FINDING:** Soft-Delete ist IRREVERSIBEL via API. Nur Archive -> Reactivate funktioniert.
Kein API-Endpunkt zum Wiederherstellen geloeschter Zonen.

### 3.2 ESP Zone-Assignment (PASS)
| Schritt | Ergebnis | Dauer |
|---|---|---|
| ESP zu Zone zuweisen | OK, MQTT sent | 24.4ms |
| Zone-Switch mit Subzone | OK, 1 Subzone transferred | 26.0ms |
| Zone-Change-History | Vollstaendig mit affected_subzones JSON | - |
| sensor_data zone_id | Sofort aktualisiert ab naechstem Datenpunkt | - |

### 3.3 Sensor-Erstellung (PARTIAL PASS)
| Schritt | Ergebnis |
|---|---|
| DS18B20 hinzufuegen | OK - 1 Config, 1 Job, sofort published |
| SHT31 hinzufuegen | OK - 2 Configs (temp+hum), Split korrekt |
| SHT31 Initial-Publish | **BUG** - 2x aktiviert, Duplikat-Daten |

### 3.4 Subzone-Lifecycle (PARTIAL PASS)
| Schritt | Ergebnis |
|---|---|
| Subzone erstellen | OK - sensor_count=3, gpios=[4,0] |
| assigned_sensor_config_ids | **LEER** obwohl sensor_count=3 |
| subzone_id auf sensor_data (DS18B20) | OK - korrekt gestampt |
| subzone_id auf sensor_data (SHT31) | **BUG** - NIE gestampt |
| Subzone loeschen | OK - HARD-DELETE (inkonsistent mit Zone soft-delete) |

### 3.5 Actuator (PASS)
| Schritt | Ergebnis |
|---|---|
| Actuator hinzufuegen | OK, runtime synced |
| Command ON | OK, state=true, pwm_value=255 |
| Status-Updates via MQTT | OK (ESP_472204 Actuator-State tracked) |

---

## 4. Findings (nach Prioritaet)

### F1 [HIGH] Audit-Trail lueckenhaft
**Problem:** `audit_logs` enthaelt NUR `lwt_received`-Events (ESP-Disconnects).
Keine Eintraege fuer: Zone-Create/Delete/Archive, ESP-Assignment, Sensor-Add/Remove,
Actuator-Commands, Subzone-Create/Delete, Scope-Changes.

**Impact:** Keine Nachvollziehbarkeit von Konfigurationsaenderungen.
475 Audit-Eintraege = alles LWT-Disconnects.

**Wo:** Server-seitige API-Handler schreiben nicht in audit_logs.
Loki hat die Logs, aber kein strukturierter DB-Audit-Trail.

### F2 [HIGH] SHT31 Sensor-Daten Duplikat bei Erstellung
**Problem:** Bei Erstellung eines SHT31-Sensors wird die `sensor_config` 2x aktiviert
(pending -> active) und es werden 2 identische Datenpunkte pro Typ gespeichert.

**Beweis:** `sht31_temp: raw=22, zone=autoops_test_zone, ts=12:55:23` existiert 2x.
Log zeigt: "Sensor config activated: sht31_temp, pending -> active" 2x hintereinander.

**Ursache:** Race Condition zwischen "immediate publish" und Scheduler-Job bei Multi-Value-Sensoren.
DS18B20 (Single-Value) ist nicht betroffen.

**Impact:** Doppelte Datenpunkte bei jeder SHT31-Sensor-Erstellung. Nicht bei regulaerer
30s-Datenerfassung (nur beim initialen Publish).

### F3 [MEDIUM] subzone_id wird nicht auf SHT31 sensor_data gestampt
**Problem:** Obwohl GPIO 0 (SHT31) der Subzone `autoops_sz_temp` zugewiesen ist (assigned_gpios=[4,0]),
erhalten nur DS18B20-Daten (GPIO 4) die subzone_id. SHT31-Daten behalten subzone_id=NULL.

**Beweis:** 15 sensor_data-Eintraege geprueft:
- ds18b20 (GPIO 4): subzone_id = "autoops_sz_temp" (korrekt)
- sht31_temp (GPIO 0): subzone_id = NULL (falsch)
- sht31_humidity (GPIO 0): subzone_id = NULL (falsch)

**Ursache:** sensor_handler lookup fuer subzone_id wahrscheinlich nur ueber gpio_pin,
und SHT31 Multi-Value Sensoren haben GPIO 0 (I2C) was moeglicherweise nicht korrekt zugeordnet wird.

### F4 [MEDIUM] Inkonsistente Loesch-Strategien
**Problem:**
- Zones: Soft-Delete (status=deleted, deleted_at gesetzt) - NICHT wiederherstellbar
- Zones: Archive (status=archived) - wiederherstellbar via reactivate
- Subzones: Hard-Delete (Row geloescht) - NICHT wiederherstellbar
- ESP Devices: Soft-Delete (deleted_at) - manuell wiederherstellbar?

**Impact:** Kein konsistentes Recovery-Modell. User koennte versehentlich Zone loeschen
und hat keinen API-Weg zur Wiederherstellung (Daten existieren noch in DB).

### F5 [LOW] assigned_sensor_config_ids leer auf subzone_configs
**Problem:** Subzone `autoops_sz_temp` hat sensor_count=3 aber assigned_sensor_config_ids=[].
Die Sensor-Config-UUIDs werden nicht in die Subzone-Konfiguration eingetragen.

**Impact:** Subzone weiss welche GPIOs zugewiesen sind, aber nicht welche Sensor-Configs.
Bei GPIO-Aenderungen oder Multi-Sensor-GPIOs fehlt die praezise Zuordnung.

---

## 5. Loki & Monitoring

### 5.1 Loki-Pipeline (PASS)
- Alle Server-Logs korrekt in Loki indexiert
- Zone-Operationen, Sensor-Handler, MQTT-Events nachvollziehbar
- 5 Alert-Regeln aktiv (Error Storm, Disconnect Wave, DB Errors, Boot Loop, Critical Burst)
- Evaluation-Intervall: 60s

### 5.2 Notifications (PASS)
- 103 Notifications in DB, alle via WebSocket-Channel
- Kategorien: connectivity, data_quality, infrastructure, system
- Heartbeat-Luecken, Sensor-Staleness, Disconnect-Waves korrekt erkannt
- Emergency-Stop Notification vorhanden

### 5.3 Grafana Alerts
- 5 Loki-basierte + 32 Prometheus-basierte Alerting-Regeln
- Frontend-Down Alert deaktiviert (Vite Dev-Server False Positives)

---

## 6. Maintenance & Backups

### 6.1 Maintenance-Service
| Job | Intervall | Status |
|---|---|---|
| Sensor Data Cleanup | DISABLED | Unlimited retention |
| Command History Cleanup | DISABLED | Unlimited retention |
| Orphaned Mocks Cleanup | hourly | WARN ONLY (no deletion) |
| Heartbeat Log Cleanup | daily 03:15 | DRY-RUN (365 days retention) |
| ESP Health Check | 60s | Active |
| MQTT Health Check | 30s | Active |
| Sensor Health Check | 60s | Active |
| Aggregate Stats | 60min | Active |

**Bewertung:** Alle Cleanup-Jobs sind entweder DISABLED oder DRY-RUN.
Fuer Development OK, aber 9 soft-deleted Zones + 2.175 Heartbeat-Logs wachsen unbegrenzt.

### 6.2 Backups
| Backup | Datum | Groesse | Typ |
|---|---|---|---|
| automationone_pre_cleanup_20260307.sql | 2026-03-07 | 6.6 MB | Manuell (vor Cleanup) |
| automationone_pre_cleanup_20260307.sql.gz | 2026-03-07 | 1.3 MB | Komprimiert |
| manual_test_backup.dump | 2026-03-10 | 400 KB | Manuell |

**FINDING:** Kein automatisiertes Backup-Schedule. Backups nur manuell erstellt.
Volume-Mount existiert (`./backups:/app/backups`), aber kein Cron-Job.

---

## 7. Timing & Performance

| Operation | Dauer | Bewertung |
|---|---|---|
| Zone erstellen | 10.5ms | Gut |
| Zone loeschen | 26.2ms | Gut |
| ESP Zone-Assignment (mit MQTT) | 24.4ms | Gut |
| Zone-Switch mit Subzone-Transfer | 26.0ms | Gut |
| Sensor hinzufuegen (DS18B20) | 33.3ms | OK |
| Sensor hinzufuegen (SHT31 split) | 34.8ms | OK |
| Actuator hinzufuegen | 22.8ms | Gut |
| Subzone erstellen | 29.0ms | Gut |
| Subzone loeschen | 26.0ms | Gut |
| Heartbeat Publish (Mock) | ~15s Intervall | Korrekt |
| Sensor Publish (30s cycle) | ~30s | Korrekt |
| Health-Check API | 7.6ms | Gut |

**Keine unnoetige Duplizierung bei normalen Operationen.**
Einzige Duplikation: SHT31 initial publish (siehe F2).

---

## 8. Zone/Subzone Handling - Detailbewertung

### Was korrekt funktioniert:
1. Zone-Erstellung mit zone_id, name, description
2. Zone-Listing filtert soft-deleted korrekt heraus
3. Zone-Switch: Device, Subzones und MQTT-Topic werden atomisch aktualisiert
4. device_zone_changes: Vollstaendige History mit affected_subzones JSON
5. sensor_data.zone_id: Wird korrekt mit aktuellem zone_id gestampt
6. Historische sensor_data behaelt alten zone_id (korrekt fuer History)
7. Archive -> Reactivate Lifecycle vollstaendig
8. Multi-Value Sensor Split (SHT31 -> sht31_temp + sht31_humidity)
9. Subzone-Transfer bei Zone-Switch
10. Notification-System reagiert auf Heartbeat-Gaps und Sensor-Staleness

### Was NICHT korrekt funktioniert:
1. **F1:** Kein Audit-Trail fuer Config-Aenderungen
2. **F2:** SHT31 Duplikat-Daten bei Erstellung
3. **F3:** subzone_id nicht auf SHT31 sensor_data gestampt
4. **F4:** Inkonsistente Loesch-Strategien (Soft/Hard/Archive)
5. **F5:** assigned_sensor_config_ids nicht befuellt
6. **873 sensor_data Rows** mit veralteten zone_ids (wokwi_testzone, v2r_alpha etc.)
   - Dies ist BY DESIGN (historische Daten), aber zone-basierte Aggregation muss das beruecksichtigen.

---

## 9. Empfehlungen (Prioritaet)

1. **[P0] Audit-Trail erweitern**: Zone/Subzone/Sensor/Actuator-Operationen in audit_logs schreiben
2. **[P1] SHT31 Duplikat-Fix**: Race Condition bei initial publish beheben (Dedup oder Guard)
3. **[P1] subzone_id Stamping**: sensor_handler muss GPIO-to-Subzone Lookup auch fuer I2C/Multi-Value
4. **[P2] Loesch-Strategien vereinheitlichen**: Archive-First Policy oder Soft-Delete wiederherstellbar machen
5. **[P2] Automatisches DB-Backup**: Cron-Job fuer taegliches pg_dump einrichten
6. **[P3] assigned_sensor_config_ids befuellen**: Bei Subzone-Erstellung oder Sensor-Zuweisung

---

*Report erstellt durch AutoOps Deep Inspection. Alle Tests gegen Live-Docker-System ausgefuehrt.*
