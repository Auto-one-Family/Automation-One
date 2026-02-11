# Phase 2: Debug-Infrastruktur — Vollständiger Plan

**Datum:** 2026-02-11 | **Basis:** KI-Audit gegen echte Codebase (2026-02-11)
**Letzte Verifizierung:** 2026-02-11 via /verify-plan — Zeilennummern, Zählungen und CI-Szenarien gegen Codebase geprüft
**Phase-Status:** ~55% abgeschlossen — Observability weitgehend fertig, ESP32-Debug und Tests offen

---

## Was Phase 2 erreichen soll

Phase 1 hat den Monitoring-Stack gebaut: Loki, Promtail, Prometheus, Grafana — alles läuft, Logs fließen, Metriken werden gescrapt, Dashboard zeigt Panels. Das System ist **sichtbar**.

Phase 2 macht das System **debugbar**. Das bedeutet konkret:

- Du kannst ESP32-Probleme über drei Kanäle diagnostizieren (Simulation, MQTT-Live, Serial-Hardware)
- Alerts erreichen dich aktiv, nicht nur wenn du zufällig Grafana offen hast
- Gelöste Probleme werden zu strukturiertem Wissen statt zu vergessenem Terminal-Output
- Tests laufen zuverlässig auf allen Layern, sodass jede Änderung abgesichert ist

Phase 2 ist in **vier Bereiche** gegliedert. Die Bereiche haben Abhängigkeiten untereinander — die Reihenfolge ist nicht beliebig.

---

## Bereich 1: ESP32 Debugging

**Ziel:** Drei unabhängige Kanäle um ESP32-Verhalten zu beobachten und Probleme zu diagnostizieren.

### Kanal 1: Wokwi-Simulation

**Aktueller Stand:** 163 Szenarien in 13 Kategorien existieren. CI-Workflow läuft mit 16 Jobs (14 Test-Jobs + build-firmware + test-summary) und deckt 42 Szenarien ab. Die Coverage ist ungleich verteilt:
> [verify-plan Korrektur: 163, nicht 165. Verifiziert via Glob auf `El Trabajante/tests/wokwi/scenarios/`]

| Kategorie | Szenarien | In CI | Coverage |
|-----------|-----------|-------|----------|
| 01-boot | 2 | 2 | 100% |
| 02-sensor | 5 | 5 | 100% |
| 03-actuator | 7 | 7 | 100% |
| 04-zone | 2 | 2 | 100% |
| 05-emergency | 3 | 3 | 100% |
| 06-config | 2 | 2 | 100% |
| 07-combined | 2 | 2 | 100% |
| 08-i2c | 20 | 5 | 25% |
| 08-onewire | 29 | 0 | **0%** |
| 09-hardware | 9 | 0 | **0%** |
| 09-pwm | 18 | 3 | 17% |
| 10-nvs | 40 | 5 | 13% |
| gpio (kein Prefix) | 24 | 5 | 21% |

> **Hinweis:** Duplikat-Prefixe bei 08 und 09. 2 Root-Level YAML-Dateien existieren zusätzlich (`boot_test.yaml`, `mqtt_connection.yaml` — Legacy). Alle 3 PWM-CI-Tests referenzieren existierende Dateien (`pwm_duty_percent_50.yaml`, `pwm_frequency_change.yaml`, `pwm_resolution_verify.yaml`) — kein CI-Bug vorhanden.
> [verify-plan Korrektur: CI verwendet korrekt `pwm_duty_percent_50.yaml`, nicht `pwm_duty_cycle.yaml`. Verifiziert in `.github/workflows/wokwi-tests.yml:1371`]

Infrastrukturell existieren 3 Wokwi-Environments (wokwi_esp01/02/03) und Makefile-Targets dafür, aber CI nutzt ausschließlich ESP_00000001. Das Makefile `wokwi-test-full` Target listet 22 Szenarien (echo sagt 22, help sagt 23 — help-Bug), CI hat 42 (zusätzlich: 5 GPIO, 5 I2C, 5 NVS, 3 PWM, 1 mqtt_connection, 1 actuator_pwm). CI-Workflow hat 16 Jobs (14 Test-Jobs + build-firmware + test-summary).
> [verify-plan 2026-02-11] **CI-Bug entdeckt:** `wokwi-tests.yml:1309` referenziert `nvs_rst_factory.yaml` — Datei existiert NICHT. Richtig: `nvs_del_factory.yaml`. Dieses Szenario wird in CI immer fehlschlagen.

**Was noch fehlt:**

- **CI-Bug fixen (NEU):** `wokwi-tests.yml:1309` referenziert `nvs_rst_factory.yaml` — Datei existiert nicht. Richtig: `nvs_del_factory.yaml`. Schnellfix, 5min.
- **CI-Expansion:** 08-onewire (29) und 09-hardware (9) haben 0% Coverage. GPIO, I2C, PWM, NVS haben 13-25%. Ziel: Mindestens die kritischsten Szenarien jeder Kategorie in CI bringen.
- **Multi-Device-Testing:** Kein einziges Szenario testet mehrere ESP32s gleichzeitig. Die Infrastruktur (3 Envs) existiert, wird aber nicht genutzt.
- **Makefile aktualisieren:** Szenario-Liste auf CI-Stand bringen (22 → 42).
- ~~**CI-Bug fixen:** `pwm_duty_cycle.yaml` durch existierendes Szenario ersetzen.~~ [verify-plan: ENTFERNT — CI nutzt bereits korrekt `pwm_duty_percent_50.yaml`]

### Kanal 2: MQTT Debug-Topic (Live-Debugging)

**Aktueller Stand:** Teilweise vorhanden. `system/diagnostics` Topic ist bereits definiert:

- **ESP32:** `topic_builder.cpp:182` → `buildSystemDiagnosticsTopic()` existiert
- **Server:** `topics.py:865` → `build_system_diagnostics_topic()` existiert
- **Server:** `diagnostics_handler.py` existiert und ist registriert in `main.py:266-271`
- **Dokumentation:** `MQTT_TOPICS.md` Section 3.5 dokumentiert das Topic korrekt

Der system/diagnostics Kanal ist also **infrastrukturell vorhanden**. Was fehlt, ist die Verifikation, dass der gesamte Flow end-to-end funktioniert (ESP32 sendet → Server empfängt → Daten werden verarbeitet/gespeichert).

**Was zu prüfen/implementieren ist:**

1. **End-to-End-Test:** Verifizieren dass die bestehende diagnostics_handler-Implementierung die Payloads korrekt verarbeitet. Dafür einen Wokwi-Szenario oder MQTT-CLI-Test durchführen.
2. **Payload-Erweiterung prüfen:** Welche Daten schickt die ESP32-Firmware tatsächlich im diagnostics-Payload? Reicht das für Debug-Zwecke oder fehlen Felder (z.B. Boot-Reason, Circuit-Breaker-State)?
3. **Grafana-Visualisierung:** Falls diagnostics-Daten im Server ankommen und in die DB geschrieben werden, fehlt ein Grafana-Panel dafür.

> **Hinweis:** Neben `system/diagnostics` haben weitere in MQTT_TOPICS.md dokumentierte Topics keinen Server-Handler: `sensor/batch`, `system/response`, `status`, `safe_mode`, `sensor/+/response`. Für Kanal 2 nicht blockierend, aber der TM sollte diese Lücken kennen.

### Kanal 3: Serial-Bridge (Hardware-Debugging)

**Aktueller Stand:** Container vollständig vorbereitet, Firmware ready. Kanal 3 Code-Audit 2026-02-11 abgeschlossen.

Datenfluss:
```
ESP32 → USB → usbipd → WSL2 /dev/ttyUSB0 → socat TCP:3333 →
Docker esp32-serial-logger (socket TCP) → stdout JSON →
Promtail → Loki → Grafana
```

Der esp32-serial-logger Service existiert in docker-compose.yml (Profil: hardware). Promtail hat Pipeline-Stage 4 dafür (`config.yml:118-139`, verifiziert 2026-02-11). Container-Dateien komplett: Dockerfile, serial_logger.py, requirements.txt, README.md, .dockerignore.

> [verify-plan 2026-02-11] Datenfluss korrigiert: `serial_logger.py` nutzt `socket` (stdlib TCP), NICHT pyserial.
> [code-audit 2026-02-11] `requirements.txt` bereits bereinigt (nur stdlib-Kommentar). `pyserial` entfernt.

**Was bereits vorhanden ist:**

- ✅ **MQTT Log-Level Control:** `set_log_level` Command in `main.cpp:1220-1264` — vollständig implementiert. Empfängt `{"command":"set_log_level","level":"DEBUG"}`, setzt `logger.setLogLevel()`, sendet JSON-Response. Funktioniert über `kaiser/{id}/esp/{id}/system/command` Topic.
- ✅ **usbipd-Runbook:** `docker/esp32-serial-logger/README.md` enthält vollständige Dokumentation: Installation (winget), Bind, Attach, Auto-Attach, VID:PID für 3 Board-Typen, WSL2-Verifikation, socat TCP-Bridge, systemd Auto-Start, Multi-Device-Setup, Troubleshooting (DTR/RTS, USB-Disconnect).
- ✅ **Promtail-Kompatibilität:** Jeder `ENABLE_AGENT_DEBUG_LOGS`-Block terminiert mit `\n` (Format: `[DEBUG]{...json...}\n`). `serial_logger.py:PATTERN_MQTT_DEBUG` parst dieses Format korrekt → `format: mqtt_debug_json`.

**Was bereits erledigt (Code-Audit 2026-02-11):**

- ~~**Serial.print()-Konsolidierung:**~~ [code-audit: DONE] Alle 13 `#ifdef ENABLE_AGENT_DEBUG_LOGS` Blöcke in `mqtt_client.cpp` nutzen bereits `snprintf()` + `Serial.println()` Pattern. `feature_flags.h:16` — Macro ist aktuell auskommentiert (`// #define ENABLE_AGENT_DEBUG_LOGS`), Kommentar korrekt ("safe for ser2net/Promtail").
- ~~**NVS-Persistenz für Log-Level:**~~ [code-audit: DONE] Vollständig implementiert:
  - Save: `main.cpp:1254-1258` via `storageManager.putUInt8("log_level", ...)` im `set_log_level` Handler
  - Load: `main.cpp:266-277` STEP 5.1 via `storageManager.getUInt8("log_level", LOG_INFO)`
  - Namespace: `"system_config"` konsistent. Validierung: `saved_level <= LOG_CRITICAL` (main.cpp:271). Thread-safe (Mutex).
  - Fix applied: Boot-Log-Meldung von `LOG_INFO()` zu `Serial.printf()` geändert (main.cpp:274 — war unsichtbar bei Level > INFO)
- ~~**pyserial entfernen:**~~ [code-audit: DONE] `requirements.txt` enthält nur stdlib-Kommentar, keine Dependencies.
- ~~**usbipd-Runbook:**~~ [verify-plan: DONE]

**Verbesserungen implementiert (Code-Audit 2026-02-11):**

- **Exponentielles Backoff:** `serial_logger.py` hatte festes 5s Reconnect-Delay. Jetzt exponentieller Backoff (5s → 10s → 20s → 40s → 60s cap), Reset bei Erfolg.
- **NVS-Restore Sichtbarkeit:** `main.cpp:274` nutzt jetzt `Serial.printf()` statt `LOG_INFO()` für die Boot-Meldung. Garantiert Sichtbarkeit auch wenn gespeichertes Level > INFO.

**Container-Test abgeschlossen (2026-02-11):**

- ~~**Container testen:**~~ [code-audit: DONE] Image gebaut, gegen simulierten TCP-Echo-Server getestet.
  - Alle 5 Log-Formate korrekt geparst: Custom Logger, MQTT Debug JSON, ESP-IDF, Plaintext, Internal
  - Exponentielles Backoff verifiziert: 2s → 4s → 8s → 16s → 32s (korrekte Verdopplung)
  - Graceful Disconnect-Handling funktioniert
  - **Kanal 3 ist code-komplett. Nur Produktiv-Test mit echtem ESP32-Hardware steht noch aus.**

### ESP32 Native Tests

**Aktueller Stand:** 2 aktive Tests (test_topic_builder.cpp mit 12 Tests, test_gpio_manager_mock.cpp mit 10 Tests = 22 Native-Tests). PlatformIO [env:native] existiert. Mock-Infrastruktur vorhanden (test/mocks/, test/helpers/). GPIO-HAL existiert (igpio_hal.h + esp32_gpio_hal.h).

**Was noch fehlt:**

- **21 archivierte Tests:** Unter test/_archive/ liegen 21 .cpp Dateien — deaktiviert wegen vermuteter API-Änderungen. Müssen einzeln geprüft und nach test/ migriert werden.
- **3 HAL-Interfaces:** II2CBus, IOneWireBus, IStorageManager fehlen. Ohne sie können weitere Hardware-abhängige Klassen nicht isoliert getestet werden.

---

## Bereich 2: Observability vervollständigen

**Ziel:** Die letzten Lücken im Monitoring-Stack schließen.

### Bereits erledigt (Phase 1 / bisherige Arbeit)

Die folgenden Punkte sind **bereits implementiert** und brauchen keine weitere Arbeit:

| Was | Status | Nachweis |
|-----|--------|----------|
| **cAdvisor** | Läuft | `docker-compose.yml` (Profil: monitoring), Port 8080, Prometheus scrape job `cadvisor` |
| **Prometheus: Loki + Promtail** | Gescrapt | `prometheus.yml` Jobs `loki` (3100) und `promtail` (9080) |
| **MQTT-Counter (Server-seitig)** | Implementiert | `metrics.py:51-61` — `MQTT_MESSAGES_TOTAL` (Counter, Labels: received/published) + `MQTT_ERRORS_TOTAL` |
| **WebSocket-Connections** | Implementiert | `metrics.py:67-70` — `WEBSOCKET_CONNECTIONS_GAUGE`, updated via `update_websocket_metrics()` |
| **DB-Query-Duration** | Implementiert | `metrics.py:76-80` — `DB_QUERY_DURATION` (Histogram, 10 Buckets) |
| **ESP Device Gauges** | Implementiert | `metrics.py:86-99` — 3 Gauges (esp_total, esp_online, esp_offline) |
| **ESP Heartbeat Gauges** | Implementiert | `metrics.py:105-123` — 4 aggregierte Gauges (avg_heap_free, min_heap_free, avg_wifi_rssi, avg_uptime). Kardinalitäts-Entscheidung: Aggregiert (keine per-ESP Labels) |
| **Prometheus Scrape-Jobs** | 7 Jobs | el-servador, postgres, prometheus, mqtt-broker, cadvisor, loki, promtail |
| **Alert Rules** | 8 Rules | 5 critical (server-down, mqtt-disconnected, database-down, loki-down, promtail-down) + 3 warning (high-memory, esp-offline, high-mqtt-error-rate) |

**Aktuelle Metriken-Übersicht in `metrics.py`:** 12 Gauges (3 Server: uptime/cpu/memory, 1 MQTT: connected, 1 WS: connections, 3 ESP: total/online/offline, 4 Heartbeat: heap_avg/heap_min/rssi_avg/uptime_avg) + 2 Counters (MQTT messages + errors) + 1 Histogram (DB query duration) = **15 Custom Metrics**, plus HTTP Auto-Metrics via prometheus-fastapi-instrumentator.

### Was tatsächlich noch fehlt

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 2.1 | Dashboard: cAdvisor-Panels (CPU/RAM/I/O pro Container) | 2h | — |
| 2.2 | Dashboard: HTTP-Latency Panel (RED-Methode vervollständigen) | 1h | — |
| 2.3 | Dashboard: Panels für ESP Heartbeat Gauges (Heap/RSSI/Uptime Trend) | 1-2h | — |
| 2.4 | LogQL Recording Rules definieren + Loki `ruler`-Section aktivieren | 3-4h | Label-Taxonomie (3.2) |
| 2.5 | Alert: Webhook Contact Point → El Servador → Frontend Notification | 3-4h | — |
| 2.6 | Alert: Weitere Rules (Disk Full, DB Connection Saturation) | 1-2h | — |

> **Blocker für 2.4:** `loki-config.yml` hat keinen `ruler`-Abschnitt. Ohne aktivierten ruler-Component werden Recording Rules nicht evaluiert. Prerequisite: `ruler`-Section in loki-config.yml hinzufügen (alert_manager_url, storage, ring).

> **Doku-Inkonsistenz:** `DOCKER_REFERENCE.md` Section 1.4 listet `./logs/mqtt/` als aktiven Bind-Mount, aber `docker-compose.yml:60-62` hat ihn kommentiert. Bei nächstem `/updatedocs` korrigieren.

**Bereich 2 Gesamtaufwand: ~11-15h** (statt zuvor geschätzte 22-32h — Großteil bereits erledigt)

---

## Bereich 3: Debug-Wissensbasis

**Ziel:** Gelöste Probleme werden zu strukturiertem Wissen. Das dient den Debug-Agents als Referenz, den Alert Rules als Grundlage, und langfristig als ML-Trainingsdaten.

### PATTERNS.yaml

**Aktueller Stand:** Schema entworfen, 16 initiale Patterns identifiziert (aus bisherigen Debugging-Sessions). Zielformat pro Eintrag:

```yaml
- id: MQTT_RECONNECT_LOOP
  symptoms:
    - container: mqtt-broker
      pattern: "socket error on client esp32_01, disconnecting"
      frequency: ">3x in 60s"
    - container: el-servador
      pattern: "MQTT client esp32_01 went offline"
  root_cause: "ESP32 WiFi-Interferenz bei schwachem Signal"
  solution: "WiFi TX-Power anpassen oder Reconnect-Backoff erhöhen"
  layers: [firmware, broker, backend]
  severity: warning
  correlation_window: "±10s"
```

**Was fehlt:** Die Datei existiert nicht. Keiner der 16 Patterns ist geschrieben. Vorgesehener Pfad: `.claude/reference/errors/PATTERNS.yaml`.

### Label-Taxonomie

**Was fehlt:** Ein Dokument das definiert:
- Pflicht-Labels pro Layer (Firmware / Backend / Frontend / Broker / DB)
- Gültige Werte pro Label (z.B. level: DEBUG|INFO|WARNING|ERROR|CRITICAL)
- Mapping ESP32-Level → Loki-Level
- Labels die für späteres ML-Training gebraucht werden

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 3.1 | PATTERNS.yaml erstellen mit 16 initialen Patterns | 3-4h | — |
| 3.2 | Label-Taxonomie Dokument erstellen | 2-3h | — |
| 3.3 | PATTERNS.yaml in Agent-Referenzen einbinden | 1h | 3.1 |

**Bereich 3 Gesamtaufwand: ~6-8h**

---

## Bereich 4: Test-Stabilisierung

**Ziel:** Alle drei Layer haben lauffähige, aussagekräftige Tests. Das ist die Absicherung für alles was in Bereich 1-3 implementiert wird.

### Backend (pytest)

**Aktueller Stand:** 106 Test-Dateien, 5 conftest-Dateien (4× conftest.py + 1× conftest_logic.py), 1791 Tests collected, 759 Unit-Tests bestehen. 26 Marker registriert (pyproject.toml:134-161), --strict-markers aktiv. E2EWebSocketClient implementiert. MockESP32Client exzellent (1000+ Zeilen). Pydantic V2 Migration zu 97% abgeschlossen (nur 3 Legacy class Config übrig).
> [verify-plan 2026-02-11] test_diagnostics_handler.py hinzugekommen → 106 statt 105. conftest_logic.py in tests/integration/ mitgezählt → 5 statt 4.

**Verbleibende Lücken:**

- **Neue Features ungetestet:** kaiser.py, ai.py, sequences.py und ihre Services (kaiser_service.py, ai_service.py, health_service.py) haben keine Tests.
- **Bekannter Bug:** DS18B20 off-by-one — test_quality_mapping_raw_mode[1360-good] schlägt fehl (< statt <= im Processor).
- **3 Pydantic Legacy-Stellen:** api_response.py (x2), sequence.py (x1) nutzen noch class Config statt model_config = ConfigDict.

### Frontend (Vitest / Playwright)

**Aktueller Stand:** Dependencies installiert (vitest ^3.0.0, msw ^2.7.0, @vitest/coverage-v8). 26 Test-Dateien (21 Unit + 5 E2E-Specs). Alle 5 Stores getestet. 2 Composables getestet. 14 Utility-Test-Dateien. MSW handlers.ts mit ~80% API-Coverage.

**Verbleibende Lücken:**

- **6 von 8 Composables ungetestet** (useModal, useSwipeNavigation, useGpioStatus, useQueryFilters, useZoneDragDrop, useConfigResponse)
- **0 von 67 Components getestet** — keine einzige Komponente hat Unit-Tests
- **0 Integration-Tests** — Store-API-Interaktion ungetestet
- **Playwright nicht in CI** — 5 E2E-Specs existieren, CI-Workflow fehlt

### ESP32 (PlatformIO)

**Aktueller Stand:** 2 aktive Tests (22 Assertions), GPIO-HAL existiert, Mock-Infrastruktur vorhanden.

**Verbleibende Lücken:**

- **21 archivierte Tests migrieren** — einzeln prüfen, an aktuelle API anpassen, nach test/ verschieben
- **3 HAL-Interfaces erstellen** — II2CBus, IOneWireBus, IStorageManager

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 4.1 | Backend: Tests für kaiser.py + kaiser_service.py | 2-3h | — |
| 4.2 | Backend: Tests für ai.py + ai_service.py | 2-3h | — |
| 4.3 | Backend: Tests für sequences.py API-Router (`test_sequence_executor.py` existiert bereits für SequenceActionExecutor) | 1-2h | — |
| 4.4 | Backend: DS18B20 off-by-one Bug fixen | 15min | — |
| 4.5 | Backend: 3 Pydantic V2 Legacy-Stellen migrieren | 30min | — |
| 4.6 | Frontend: Composable-Tests (6 fehlende: useModal, useSwipeNavigation, useGpioStatus, useQueryFilters, useZoneDragDrop, useConfigResponse) | 4-8h | — |
| 4.7 | Frontend: Component-Tests anfangen (kritische zuerst: ESPCard, ZoneGroup, PendingDevicesPanel) | 5-8h | — |
| 4.8 | Frontend: Integration-Tests (Store-API via MSW) | 3-5h | 4.7 teilweise |
| 4.9 | Frontend: Playwright CI-Workflow erstellen | 2h | — |
| 4.10 | ESP32: 21 archivierte Tests migrieren | 6-10h | fortlaufend |
| 4.11 | ESP32: 3 HAL-Interfaces erstellen | 8-12h | 4.10 teilweise |

**Bereich 4 Gesamtaufwand: ~33-52h**

---

## Abhängigkeiten zwischen den Bereichen

```
Bereich 4 (Tests) ───────────────────────────────────────────┐
  Absicherung für alles was in 1-3 implementiert wird         │
                                                               │
Bereich 1 (ESP32 Debug) ─────────────────────────────────────┤
  Diagnostics E2E-Test braucht laufenden Server               │
  Serial-Bridge braucht Firmware-Prüfung                      │
  Wokwi-Expansion braucht stabile CI                          │
                                                               │
Bereich 2 (Observability) ───────────────────────────────────┤
  LogQL Recording Rules brauchen Label-Taxonomie (→ B3)       │
  Neue Alert Rules brauchen die Dashboard-Panels              │
                                                               │
Bereich 3 (Wissensbasis) ───────────────────────────────────┘
  PATTERNS.yaml hat keine technische Abhängigkeit
  Label-Taxonomie wird von LogQL Recording Rules gebraucht
```

**Empfohlene Reihenfolge:**

1. **Zuerst Bereich 4** — Test-Stabilisierung. Ohne lauffähige Tests ist jede Änderung ein Risiko. Kritische Lücken zuerst: Backend neue Features, Frontend Components anfangen, ESP32 Archive migrieren.

2. **Parallel Bereich 3** — PATTERNS.yaml und Label-Taxonomie haben keine Code-Abhängigkeiten. Das sind Dokumentationsaufgaben die sofort beginnen können.

3. **Dann Bereich 1** — ESP32 Debug-Kanäle. Diagnostics E2E-Test zuerst (verifiziert bestehende Infrastruktur), dann Wokwi-CI-Expansion, dann Serial-Bridge.

4. **Dann Bereich 2** — Die verbliebenen Observability-Lücken (Dashboards, Recording Rules, Webhook).

---

## Vollständige Aufgabenliste

### Bereich 1: ESP32 Debugging

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 1.1 | Diagnostics E2E-Test: Verifizieren dass system/diagnostics end-to-end funktioniert | 2-3h | — |
| 1.2 | Diagnostics Payload-Erweiterung prüfen (fehlen Boot-Reason, Circuit-Breaker-State?) | 1-2h | 1.1 |
| 1.3 | Verwaiste Topics inventarisieren: sensor/batch, system/response, status, safe_mode, sensor/+/response | 1h | — |
| ~~1.4~~ | ~~Firmware: Serial.print()-Konsolidierung + feature_flags.h~~ [code-audit 2026-02-11: DONE — bereits snprintf+println] | — | — |
| ~~1.5a~~ | ~~Firmware: MQTT Log-Level Control~~ [verify-plan: DONE] | — | — |
| ~~1.5b~~ | ~~Firmware: NVS-Persistenz für Log-Level~~ [code-audit 2026-02-11: DONE — Save+Load+Validierung+Boot-Log-Fix] | — | — |
| ~~1.6~~ | ~~Serial-Bridge: Container testen~~ [code-audit 2026-02-11: DONE — gebaut, alle 5 Formate geparst, Backoff verifiziert] | — | — |
| ~~1.7~~ | ~~Serial-Bridge: usbipd-Runbook dokumentieren~~ [verify-plan: DONE — `docker/esp32-serial-logger/README.md` vollständig] | — | — |
| ~~1.8~~ | ~~Wokwi: CI-Bug fixen~~ [verify-plan: ENTFERNT — CI nutzt bereits `pwm_duty_percent_50.yaml`] | — | — |
| 1.9 | Wokwi: Makefile-Szenario-Liste aktualisieren (22 → 42) + Help-Echo-Bug fixen (sagt 23, sind 22) | 1h | — |
| 1.9b | **Wokwi: CI-Bug fixen** — `wokwi-tests.yml:1309` referenziert `nvs_rst_factory.yaml` (existiert nicht). Richtig: `nvs_del_factory.yaml` | 5min | — |
| 1.10 | Wokwi: CI-Expansion — onewire (29) + hardware (9) Szenarien integrieren | 2-3h | — |
| 1.11 | Wokwi: CI-Expansion — gpio/i2c/pwm/nvs Coverage erhöhen | 3-4h | — |
| 1.12 | Wokwi: Multi-Device-Szenarien erstellen (ESP_00000002/03 in CI) | 4-6h | — |
| 1.13 | ESP32: Archivierte Tests migrieren (21 Dateien) | 6-10h | fortlaufend |
| 1.14 | ESP32: HAL-Interfaces (II2CBus, IOneWireBus, IStorageManager) | 8-12h | 1.13 teilweise |

**Bereich 1 Gesamtaufwand: ~30-44h** (korrigiert: 1.5a + 1.7 = DONE, spart ~3-4h)
> [verify-plan 2026-02-11] Kanal-3-Aufwand reduziert von ~7-8h auf ~4-5h. MQTT-Log-Level und usbipd-Runbook existieren bereits.

### Bereich 2: Observability (nur verbleibende Lücken)

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 2.1 | Dashboard: cAdvisor-Panels (CPU/RAM/I/O pro Container) | 2h | — |
| 2.2 | Dashboard: HTTP-Latency Panel (RED vervollständigen) | 1h | — |
| 2.3 | Dashboard: Panels für ESP Heartbeat Gauges (Heap/RSSI/Uptime) | 1-2h | — |
| 2.4 | Loki `ruler`-Section aktivieren + LogQL Recording Rules | 3-4h | Label-Taxonomie (3.2) |
| 2.5 | Alert: Webhook Contact Point → El Servador → Frontend Notification | 3-4h | — |
| 2.6 | Alert: Weitere Rules (Disk Full, DB Connection Saturation) | 1-2h | — |

**Bereich 2 Gesamtaufwand: ~11-15h**

### Bereich 3: Debug-Wissensbasis

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 3.1 | PATTERNS.yaml erstellen mit 16 initialen Patterns | 3-4h | — |
| 3.2 | Label-Taxonomie Dokument erstellen | 2-3h | — |
| 3.3 | PATTERNS.yaml in Agent-Referenzen einbinden | 1h | 3.1 |

**Bereich 3 Gesamtaufwand: ~6-8h**

### Bereich 4: Test-Stabilisierung

| # | Aufgabe | Aufwand | Abhängig von |
|---|---------|---------|--------------|
| 4.1 | Backend: Tests für kaiser.py + kaiser_service.py | 2-3h | — |
| 4.2 | Backend: Tests für ai.py + ai_service.py | 2-3h | — |
| 4.3 | Backend: Tests für sequences.py API-Router (`test_sequence_executor.py` existiert bereits) | 1-2h | — |
| 4.4 | Backend: DS18B20 off-by-one Bug fixen | 15min | — |
| 4.5 | Backend: 3 Pydantic V2 Legacy-Stellen migrieren | 30min | — |
| 4.6 | Frontend: Composable-Tests (6 fehlende: useModal, useSwipeNavigation, useGpioStatus, useQueryFilters, useZoneDragDrop, useConfigResponse) | 4-8h | — |
| 4.7 | Frontend: Component-Tests anfangen (ESPCard, ZoneGroup, PendingDevicesPanel) | 5-8h | — |
| 4.8 | Frontend: Integration-Tests (Store-API via MSW) | 3-5h | 4.7 teilweise |
| 4.9 | Frontend: Playwright CI-Workflow erstellen | 2h | — |
| 4.10 | ESP32: 21 archivierte Tests migrieren | 6-10h | fortlaufend (= 1.13) |
| 4.11 | ESP32: 3 HAL-Interfaces erstellen | 8-12h | fortlaufend (= 1.14) |

> **Hinweis:** 4.10 und 4.11 sind identisch mit 1.13 und 1.14. Sie erscheinen in beiden Bereichen, weil sie sowohl dem ESP32-Debug-Kanal als auch der Test-Stabilisierung dienen. In der Gesamtrechnung nur einmal gezählt.

**Bereich 4 Gesamtaufwand: ~33-52h** (4.10 + 4.11 überlappen mit Bereich 1)

---

## Phase 2 Gesamtaufwand

| Bereich | Aufwand | Status |
|---------|---------|--------|
| 1 — ESP32 Debugging | 30-44h | ~30% (Kanal 3: KOMPLETT — alle Tasks DONE inkl. Container-Test. Kanal 1 (Wokwi) + Kanal 2 (Diagnostics E2E) + Native Tests offen) |
| 2 — Observability | 11-15h | ~70% (Metriken + Scraping fertig, Dashboards + Rules offen) |
| 3 — Wissensbasis | 6-8h | ~10% (Schema entworfen, nichts geschrieben) |
| 4 — Test-Stabilisierung | 33-52h | ~40% (Backend funktioniert, Frontend + ESP32 Lücken) |
| **Gesamt (bereinigt um Überlappung 1<>4)** | **~66-101h** | **~37-42%** |

---

## Erledigungskriterien — Wann ist Phase 2 fertig?

Phase 2 ist abgeschlossen wenn:

1. **system/diagnostics** end-to-end verifiziert (ESP32 sendet → Server empfängt → Daten verarbeitet)
2. ~~**Serial-Bridge** getestet und mit Runbook dokumentiert ist~~ ✅ DONE (Code-Audit 2026-02-11: Container gebaut+getestet, Runbook in README.md)
3. **Wokwi CI** mindestens 60% der Szenarien abdeckt, inklusive mindestens 1 Multi-Device-Szenario (aktuell: 42/163 = **25.8%**)
4. **Grafana-Dashboards** für cAdvisor, HTTP-Latency und ESP-Heartbeat existieren
5. **Alert Webhook** funktioniert (Grafana → El Servador → Frontend)
6. **LogQL Recording Rules** aktiv (Loki ruler konfiguriert)
7. **PATTERNS.yaml** existiert mit mindestens 16 Einträgen
8. **Label-Taxonomie** definiert und dokumentiert
9. **Backend-Tests** für kaiser/ai/sequences existieren
10. **Frontend-Tests** für mindestens 10 Components existieren und Playwright in CI läuft
11. **ESP32 Native-Tests** mindestens 10 der 21 archivierten Tests migriert
