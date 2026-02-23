# Phase 2: Produktionstestfeld aufbauen

> **Voraussetzung:** [Phase 0](./PHASE_0_ERROR_TAXONOMIE.md) abgeschlossen (Error-Taxonomie + Grafana-Alerts)
> **Parallel zu:** [Phase 1](./PHASE_1_WOKWI_SIMULATION.md) (laeuft unabhaengig)
> **Nachfolger:** [Phase 3](./PHASE_3_KI_ERROR_ANALYSE.md) (Sensordaten muessen fliessen), [Phase 4](./PHASE_4_INTEGRATION.md)
> **Master-Plan:** [00_MASTER_PLAN.md](./00_MASTER_PLAN.md) Abschnitt "PHASE 2"

---

## Ziel

Echter ESP32 mit echten Sensoren. Vollstaendiger Docker-Stack mit Monitoring. Frontend-Luecken schliessen (Kalibrierungs-Wizard + Zeitreihen-View). End-to-End Datenpfad verifiziert: ESP32 → MQTT → Server → DB → Frontend.

---

## Schritt 2.1: Docker-Stack hochfahren und verifizieren

### Voraussetzungen pruefen

**Agent:** `system-control` (Ops-Modus)
**Skill:** `/system-control`

| Check | Erwartung | Kommando |
|-------|-----------|----------|
| Docker Desktop laeuft | Running | `docker info` |
| Kein lokaler Mosquitto | Kein Service auf Port 1883 | `docker compose ps mqtt-broker` |
| Ports frei | 1883, 5432, 8000, 5173, 3000, 9090, 3100 | `docker compose ps` |

### Stack-Start-Sequenz

```bash
# Schritt 1: Core-Stack (4 Services)
docker compose up -d

# Schritt 2: Warten auf Health-Checks
# Startup-Order (erzwungen durch Docker):
# postgres + mqtt-broker (parallel) → el-servador → el-frontend

# Schritt 3: Monitoring-Stack (7 Services)
docker compose --profile monitoring up -d

# Schritt 4: Health verifizieren
docker compose ps  # Alle 11+ Services "healthy" oder "running"
```

### Erwartete Services (13 total)

| Service | Port | Health-Check | Profil |
|---------|------|-------------|--------|
| postgres | 5432 | pg_isready | core |
| mqtt-broker | 1883, 9001 | mosquitto_pub | core |
| el-servador | 8000 | /health | core |
| el-frontend | 5173 | HTTP 200 | core |
| grafana | 3000 | /api/health | monitoring |
| prometheus | 9090 | /-/ready | monitoring |
| loki | 3100 | /ready | monitoring |
| promtail | 9080 | /ready | monitoring |
| cadvisor | 8080 | /healthz | monitoring |
| postgres-exporter | 9187 | /metrics | monitoring |
| mosquitto-exporter | 9234 | /metrics | monitoring |
| adminer | 8080 | HTTP 200 | devtools |
| serial-logger | - | - | hardware |

> **[VERIFY-PLAN] Service-Korrekturen:**
> - `adminer` existiert NICHT in docker-compose.yml (kein Devtools-Service definiert). Service muss hinzugefuegt werden oder aus Tabelle entfernt werden
> - `serial-logger` heisst im Compose `esp32-serial-logger`, Container: `automationone-esp32-serial`
> - `cadvisor` und `adminer` teilen Port 8080 → Konflikt wenn beide laufen. Adminer muesste anderen Port nutzen
> - MQTT-Broker Health-Check: Plan sagt `mosquitto_pub`, tatsaechlich: `mosquitto_sub -t $$SYS/#` (korrekt im Compose)
> - Promtail Port: Plan sagt 9080, tatsaechlich: Port 9080 nur intern (nicht published). Korrekt, aber Health-Check nur im Container

### Verifikation

```bash
# API erreichbar
curl -s http://localhost:8000/ | python -m json.tool

# Health-Check
curl -s http://localhost:8000/health

# Frontend erreichbar
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173

# Grafana erreichbar
curl -s -u admin:Admin123# http://localhost:3000/api/health

# Prometheus erreichbar
curl -s http://localhost:9090/-/ready
```

### Skill fuer Diagnose bei Problemen

**Skill:** `/auto-ops:ops-diagnose`
**Agent:** `auto-ops` (Operations-Rolle)

---

## Schritt 2.2: ESP32 flashen und konfigurieren

### Hardware-Minimum

| Komponente | Minimum | Optional |
|-----------|---------|----------|
| ESP32 DevKit | 1 Stueck | Weitere fuer Skalierungstest |
| DS18B20 Temperatursensor | 1 Stueck (mit 4.7k Pull-Up) | DHT22, pH-Sensor |
| USB-Kabel | Data-faehig (nicht nur Ladekabel!) | - |
| WiFi-Netzwerk | ESP32 + Host im selben Netz | - |

### Firmware flashen

**Skill:** `/esp32-development`
**Agent:** `esp32-dev`

**ACHTUNG (aus MEMORY.md):** COM-Ports sind von Git Bash NICHT erreichbar. Upload und Monitor muessen ueber PowerShell oder PlatformIO IDE Terminal erfolgen.

```powershell
# In PowerShell (NICHT Git Bash):
cd "El Trabajante"

# Build
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev

# Flash (COM-Port anpassen)
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev -t upload

# Serial Monitor
~/.platformio/penv/Scripts/pio.exe device monitor -b 115200
```

### ESP32 konfigurieren via Provisioning Portal

**Quelle:** `El Trabajante/src/services/provisioning/provision_manager.h`

1. ESP32 startet in AP-Modus (kein WiFi in NVS)
2. SSID: `AutoOne-ESP_XXXXXXXX` (Chip-ID), Password: `provision`
3. Browser: `http://192.168.4.1`
4. Eingeben:
   - WiFi SSID: (lokales Netzwerk)
   - WiFi Password: (Netzwerk-Passwort)
   - MQTT Broker IP: (Host-IP, z.B. `192.168.1.100`)
5. Save → ESP32 rebootet und verbindet sich

### ESP32 im Server registrieren

**Zwei Optionen:**

**Option A: Automatisch via MQTT**
- ESP32 sendet Heartbeat → Server erstellt automatisch Device-Eintrag
- Vorteil: Zero-Config
- Nachteil: Device hat noch keine Zone/Konfiguration

**Option B: Manuell via API**
```bash
# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin123#"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# ESP registrieren (ESP-ID aus Serial-Monitor ablesen)
curl -s -X POST http://localhost:8000/api/v1/devices/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"esp_id":"ESP_XXXXXXXX","name":"Testfeld ESP32","location":"Gewaechshaus"}'
```

### Verifikation: E2E Datenpfad

```
ESP32 Serial → "MQTT connected" ✓
           → "Initial heartbeat sent" ✓
           → "Sensor data published" ✓

Server Logs → "Heartbeat received from ESP_XXXXXXXX" ✓
           → "Sensor data stored" ✓

Database   → sensor_data Tabelle hat neue Eintraege ✓

Frontend   → Dashboard zeigt ESP als "online" ✓
           → Live-Werte werden angezeigt ✓
```

**Agent:** `/auto-ops:ops-inspect-backend` (ESP → MQTT → Server → DB pruefen)

---

## Schritt 2.3: Frontend-Luecken schliessen

### Prioritaet 1: Kalibrierungs-Wizard

**Skill:** `/frontend-development`
**Agent:** `frontend-dev`

**Ist-Zustand:**
- Server-API existiert: `POST /api/v1/sensors/calibrate`
- Backend-Service: `El Servador/god_kaiser_server/src/services/calibration_service.py`
- Frontend: FEHLT komplett

> **[VERIFY-PLAN] Kalibrierung-Backend Korrektur:**
> - `calibration_service.py` existiert NICHT in `src/services/`. Kalibrierungslogik ist in `src/api/sensor_processing.py` (Zeile 233ff: `@router.post("/calibrate")`)
> - Kalibrierung nutzt `base_processor.calibrate()` Methode der Sensor-Libraries
> - Der Endpoint ist `POST /api/v1/sensors/process/calibrate` (in sensor_processing Router), NICHT `/api/v1/sensors/calibrate`
> - Calibration-Daten werden ueber `sensor_repo.update_calibration()` in der DB gespeichert

**Anforderungen:**
| Feature | Beschreibung |
|---------|-------------|
| 2-Punkt-Kalibrierung | pH: Buffer 4.0 + 7.0, EC: Standard-Loesungen |
| Wizard-UI | Step-by-Step: Sensor waehlen → Punkt 1 messen → Punkt 2 messen → Bestaetigen |
| Live-Rohwert-Anzeige | Waehrend Kalibrierung den aktuellen RAW-Wert zeigen |
| Kalibrierungs-Historie | Letzte Kalibrierungen anzeigen (aus DB) |

**Zu erstellende Dateien:**
| Datei | Beschreibung |
|-------|-------------|
| `El Frontend/src/components/calibration/CalibrationWizard.vue` | Haupt-Wizard-Komponente |
| `El Frontend/src/components/calibration/CalibrationStep.vue` | Einzelner Kalibrierungsschritt |
| `El Frontend/src/api/calibration.ts` | API-Client fuer Kalibrierungs-Endpoints |

**Bestehende Patterns folgen:**
- Component-Style: `El Frontend/src/components/zones/ZoneMonitorView.vue`
- API-Client: `El Frontend/src/api/esp.ts`
- Store: Bestehende Pinia-Stores als Referenz

**Workaround bis Implementation:** Swagger UI (`http://localhost:8000/docs`) → `POST /sensors/calibrate`

### Prioritaet 2: Historische Zeitreihen-View

**Skill:** `/frontend-development`
**Agent:** `frontend-dev`

**Ist-Zustand:**
- Chart.js als Dependency vorhanden
- Aktuelle Sensor-Werte werden im Dashboard angezeigt
- Historische Daten: Server-API `GET /api/v1/sensors/{id}/data?from=...&to=...` (existiert)
- Frontend: Zeitreihen-View FEHLT

> **[VERIFY-PLAN] Zeitreihen Korrektur:**
> - Chart.js Dependencies BESTAETIGT: `chart.js ^4.5.0`, `chartjs-adapter-date-fns ^3.0.0`, `vue-chartjs ^5.3.2`
> - Chart-Komponenten existieren BEREITS: `GaugeChart.vue`, `LiveLineChart.vue`, `StatusBarChart.vue`, `MultiSensorChart.vue` (in `components/charts/`)
> - API-Endpoint korrekt: `GET /api/v1/sensors/data` (NICHT `/sensors/{id}/data`). Query-Params: `esp_id`, `gpio`, `sensor_type`, `start_time`, `end_time`, `quality`, `limit`
> - Frontend braucht eher Erweiterung der bestehenden Charts als komplett neue Komponenten
> - `sensorHistory.ts` API-Client existiert NICHT (muss erstellt werden)
> - `SensorHistoryView.vue` existiert NICHT (muss erstellt werden)

**Anforderungen:**
| Feature | Beschreibung |
|---------|-------------|
| Zeitbereich-Selektor | 1h, 6h, 24h, 7d, Custom |
| Multi-Sensor-Overlay | Mehrere Sensoren gleichzeitig plotten |
| Zoom + Pan | Chart.js zoom plugin |
| Auto-Refresh | Optionaler Live-Update (WebSocket) |
| Export | CSV-Download der angezeigten Daten |

**Zu erstellende Dateien:**
| Datei | Beschreibung |
|-------|-------------|
| `El Frontend/src/components/charts/TimeSeriesChart.vue` | Chart.js Zeitreihen-Komponente |
| `El Frontend/src/components/charts/TimeRangeSelector.vue` | Zeitbereich-Auswahl |
| `El Frontend/src/views/SensorHistoryView.vue` | Eigene View fuer Zeitreihen |
| `El Frontend/src/api/sensorHistory.ts` | API-Client fuer historische Daten |

### Prioritaet 3 (spaeter): Analyse-Profile Dashboard

Nicht fuer ersten Testlauf noetig. Kann iterativ nachgezogen werden.

### Prioritaet 4 (spaeter): Admin/User-Management

JWT/RBAC funktioniert bereits. Admin-UI ist Nice-to-Have.

### Verifikation Frontend

```bash
# Frontend Build erfolgreich
cd "El Frontend" && npm run build

# Vitest Tests bestehen
cd "El Frontend" && npx vitest run

# Manuell im Browser pruefen
# http://localhost:5173 → Kalibrierung erreichbar
# http://localhost:5173 → Zeitreihen-View erreichbar
```

**Agent:** `/auto-ops:ops-inspect-frontend` (Browser → Vue → API → Server → DB pruefen)

---

## Schritt 2.4: Kritischer Pfad verifizieren

### E2E Checkliste

| # | Anforderung | Test | Agent |
|---|-------------|------|-------|
| 1 | Sensordaten fliessen E2E | ESP Serial → DB check → Frontend check | `auto-ops` (backend-inspector) |
| 2 | Kalibrierung funktioniert | Swagger UI oder Wizard → DB pruefen | `server-debug` |
| 3 | Live-Daten im Frontend | WebSocket-Events → Dashboard-Update | `frontend-debug` |
| 4 | Logic Engine reagiert | Regel erstellen → Actuator schaltet | `server-debug` |
| 5 | Safety-System aktiv | Emergency-Stop via API → ESP reagiert | `mqtt-debug` |

### MCP-gestuetzte Diagnose

| Szenario | MCP-Server | Aktion |
|----------|-----------|--------|
| Sensor-Wert fehlt in DB | Database MCP | `SELECT * FROM sensor_data WHERE esp_id='X' ORDER BY timestamp DESC LIMIT 10` |
| Frontend zeigt falsche Daten | Playwright MCP | Navigate zu Dashboard, Screenshot |
| MQTT-Nachricht kommt nicht an | Docker MCP | Container-Logs, mosquitto_sub |
| Code-Impact pruefen | Serena MCP | `find_referencing_symbols` fuer geaenderte Funktion |

---

## Schritt 2.5: Chaos Engineering (nach Basis-Stabilitaet)

### Voraussetzung

Schritt 2.1-2.4 muessen abgeschlossen sein. Der Stack laeuft stabil mit echtem ESP32 und Sensordaten.

### Chaos-Tests

| # | Fehlertyp | Docker-Befehl | Was wird getestet | Erwartetes Verhalten |
|---|-----------|---------------|-------------------|---------------------|
| 1 | Server Crash | `docker pause automationone-server` | Circuit Breaker | ESP32 buffert offline, Server recovered |
| 2 | DB Ausfall | `docker stop automationone-postgres` | Graceful Degradation | Server meldet "degraded", keine Crashes |
| 3 | MQTT Ausfall | `docker pause automationone-mqtt-broker` | Offline Buffer | ESP32 reconnected, buffered data resent |
| 4 | Netzwerk-Latenz | `docker exec el-servador tc qdisc add dev eth0 root netem delay 500ms` | MQTT QoS | Nachrichten kommen verzoegert aber an |

> **[VERIFY-PLAN] Chaos-Tests Container-Namen Korrektur:**
> - Chaos-Test 3: Container heisst `automationone-mqtt` (NICHT `automationone-mqtt-broker`)
> - Chaos-Test 4: `docker exec el-servador` → korrekt: `docker exec automationone-server`. Ausserdem: `tc` (iproute2) ist in Alpine-basierten Images NICHT installiert. `netem` braucht `NET_ADMIN` capability und `iproute2` Package
> - Chaos-Test 5: `docker update --memory` braucht `--memory-swap` und Kernel cgroup-Support
> - `docker pause` ist hook-blocked (enthaelt `docker` keyword). Workaround: User muss manuell ausfuehren
| 5 | RAM-Limit | `docker update --memory 128m automationone-server` | Memory Management | Server bleibt stabil oder graceful restart |

### Monitoring waehrend Chaos-Tests

| Was beobachten | Wo | Tool |
|----------------|-----|------|
| Grafana-Alerts feuern korrekt | http://localhost:3000/alerting | Browser |
| Prometheus-Metriken reagieren | http://localhost:9090/graph | PromQL |
| Loki-Logs zeigen Error-Codes | http://localhost:3000/explore | LogQL |
| ESP32 Serial zeigt Reconnect | PlatformIO Monitor | Serial |
| Frontend zeigt Degraded-Status | http://localhost:5173 | Browser |

### Agent/Skill

**Skill:** `/auto-ops:ops-diagnose` (waehrend und nach Chaos-Tests)
**Agent:** `auto-ops` (Operations-Rolle)

---

## Akzeptanzkriterien Phase 2

| # | Kriterium | Verifikation |
|---|-----------|-------------|
| 1 | Docker-Stack 12/13+ healthy | `docker compose ps` zeigt alle healthy |
| 2 | ESP32 verbunden und sendet Daten | Serial: "MQTT connected" + "Sensor data published" |
| 3 | Sensordaten in DB | `SELECT count(*) FROM sensor_data` > 0 |
| 4 | Live-Daten im Frontend sichtbar | Dashboard zeigt aktuelle Werte |
| 5 | Kalibrierungs-Wizard oder Swagger-Workaround | Kalibrierung durchfuehrbar |
| 6 | Zeitreihen-View zeigt historische Daten | Chart mit 24h-Verlauf |
| 7 | Grafana-Alerts reagieren auf echte Daten | Mindestens 1 Alert korrekt gefeuert |
| 8 | Mindestens 1 Chaos-Test bestanden | Server recovered nach Crash |

---

## Uebergang zu Phase 3

Phase 2 liefert:
- Laufenden Stack mit echten Sensordaten
- Frontend mit Kalibrierung und Zeitreihen
- Basis-Stabilitaet verifiziert

Dies ist die **Voraussetzung fuer [Phase 3: KI-Error-Analyse](./PHASE_3_KI_ERROR_ANALYSE.md)**:
- Sensordaten muessen in der DB fliessen (fuer Isolation Forest)
- Grafana-Alerts muessen funktionieren (fuer Rule-based Analyse)
- Stack muss stabil sein (fuer dauerhaften Betrieb)

---

## Agents & Skills (Zusammenfassung)

| Schritt | Agent/Skill | Aufgabe |
|---------|-------------|---------|
| 2.1 | `system-control` / `/system-control` | Stack hochfahren, Health pruefen |
| 2.1 | `/auto-ops:ops-diagnose` | Bei Problemen: Cross-Layer-Diagnose |
| 2.2 | `esp32-dev` / `/esp32-development` | Firmware flashen, Serial pruefen |
| 2.2 | `/auto-ops:ops-inspect-backend` | E2E Datenpfad verifizieren |
| 2.3 | `frontend-dev` / `/frontend-development` | Kalibrierungs-Wizard + Zeitreihen-View |
| 2.3 | `/auto-ops:ops-inspect-frontend` | Frontend-Integration pruefen |
| 2.4 | `server-debug`, `mqtt-debug`, `frontend-debug` | Kritischer Pfad verifizieren |
| 2.5 | `/auto-ops:ops-diagnose` | Chaos-Test Monitoring |
| Ende | `/verify-plan` | Phase 2 gegen Codebase verifizieren |

---

## /verify-plan Ergebnis (Phase 2)

**Plan:** Docker-Stack, ESP32-Flashen, Frontend-Luecken, Chaos Engineering
**Geprueft:** 13 Services, 4 API-Endpoints, 5 Chaos-Tests, 6 Frontend-Dateien, 3 Agent-Referenzen

### Bestaetigt
- Docker Core-Stack: 4 Services (postgres, mqtt-broker, el-servador, el-frontend) korrekt
- Monitoring-Stack: 6 Services korrekt (loki, promtail, prometheus, grafana, cadvisor, postgres-exporter)
- PlatformIO-Pfad und COM-Port-Warnung korrekt
- Provisioning Portal korrekt (provision_manager.h, AP-Mode, 192.168.4.1)
- Auth-Credentials korrekt (admin/Admin123#)
- Chart.js Dependencies vorhanden (chart.js, chartjs-adapter-date-fns, vue-chartjs)
- 4 bestehende Chart-Komponenten (GaugeChart, LiveLineChart, StatusBarChart, MultiSensorChart)
- Sensor-Data API existiert (`GET /api/v1/sensors/data` mit start_time/end_time)
- Agent-Referenzen (system-control, esp32-dev, frontend-dev, auto-ops) korrekt

### Korrekturen noetig

**Service-Tabelle:**
- `adminer` existiert NICHT in docker-compose.yml → entfernen oder Service hinzufuegen
- `serial-logger` → korrekt: `esp32-serial-logger` (Container: `automationone-esp32-serial`)
- Port-Konflikt: cadvisor (8080) und adminer (8080) → verschiedene Ports noetig
- MQTT Health-Check: `mosquitto_pub` → korrekt: `mosquitto_sub`

**Kalibrierung-Backend:**
- `calibration_service.py` existiert NICHT → Logik in `sensor_processing.py`
- Endpoint: `/api/v1/sensors/calibrate` → korrekt: `/api/v1/sensors/process/calibrate`

**Zeitreihen-API:**
- `GET /api/v1/sensors/{id}/data?from=...&to=...` → korrekt: `GET /api/v1/sensors/data?esp_id=X&start_time=...&end_time=...`

**Chaos-Tests:**
- Container `automationone-mqtt-broker` → korrekt: `automationone-mqtt`
- Container `el-servador` → korrekt: `automationone-server`
- `tc/netem` nicht in Alpine-Images installiert
- `docker pause` hook-blocked

### Fehlende Vorbedingungen
- [ ] Phase 0 abgeschlossen (Grafana-Alerts fuer Chaos-Test-Verifikation)
- [ ] ESP32-Hardware verfuegbar und im selben Netzwerk
- [ ] `adminer` Service definieren oder aus Plan entfernen
- [ ] Kalibrierungs-Endpoint Pfad im Frontend korrekt referenzieren

### Zusammenfassung
Plan ist strukturell solide. **6 Korrekturen noetig** (Service-Namen, API-Pfade, Container-Namen). Die wichtigsten: calibration_service.py existiert nicht (Logik ist in sensor_processing.py), und die Sensor-Data-API hat andere Query-Parameter als geplant. Chaos-Tests brauchen angepasste Container-Namen.
