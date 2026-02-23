# Phase 2: Ausfuehrbarer Implementierungsplan

> **Erstellt:** 2026-02-21
> **Quelle:** PHASE_2_PRODUKTIONSTESTFELD.md + Codebase-Gegenpruefung
> **Erstellt von:** Agent-Manager (Modus 2)

---

## Gegenpruefungsergebnisse (Codebase vs. Plan)

### a) Docker-Stack (docker-compose.yml)

| Service | Container | Port | Health-Check | Profil |
|---------|-----------|------|--------------|--------|
| postgres | automationone-postgres | 5432 | pg_isready | core |
| mqtt-broker | automationone-mqtt | 1883, 9001 | mosquitto_sub -t $$SYS/# | core |
| el-servador | automationone-server | 8000 | curl /api/v1/health/live | core |
| el-frontend | automationone-frontend | 5173 | fetch HTTP 200 | core |
| grafana | automationone-grafana | 3000 | /api/health | monitoring |
| prometheus | automationone-prometheus | 9090 | /-/healthy | monitoring |
| loki | automationone-loki | 3100 | /ready | monitoring |
| promtail | automationone-promtail | - (9080 intern) | Port 9080 | monitoring |
| cadvisor | automationone-cadvisor | 8080 | /healthz | monitoring |
| postgres-exporter | automationone-postgres-exporter | 9187 (expose) | /metrics | monitoring |
| mosquitto-exporter | automationone-mosquitto-exporter | 9234 (expose) | /metrics | monitoring |
| pgadmin | automationone-pgadmin | 5050 | /misc/ping | devtools |
| esp32-serial-logger | automationone-esp32-serial | - | - | hardware |

**Korrekturen gegenueber Original-Plan:**
- adminer existiert NICHT — Compose hat pgadmin (Port 5050)
- serial-logger → Service: esp32-serial-logger, Container: automationone-esp32-serial
- Health-Check Server: /api/v1/health/live (nicht /health)

### b) Kalibrierung-Backend (sensor_processing.py)

- **Pfad:** POST /api/v1/sensors/calibrate (Router prefix /api/v1/sensors + Route /calibrate)
- **NICHT** /api/v1/sensors/process/calibrate (VERIFY-PLAN Korrektur war selbst fehlerhaft)
- **Auth:** X-API-Key Header (verify_api_key) — kein JWT
- **Request:** esp_id, gpio, sensor_type, calibration_points[{raw, reference}], method?, save_to_config
- **Response:** success, calibration{}, sensor_type, method, saved, message
- **Typen:** ph, ec, moisture, temperature, pressure, humidity, co2, light, flow

### c) Sensor-Data API (sensors.py)

- **Pfad:** GET /api/v1/sensors/data
- **Query-Params:** esp_id, gpio (0-39), sensor_type, start_time, end_time, quality, limit (1-1000)
- **Default:** start_time = now - 24h, end_time = now, limit = 100
- **Response:** SensorDataResponse mit readings[], count, time_range

### d) Frontend Charts

- **Existieren:** GaugeChart.vue, LiveLineChart.vue, StatusBarChart.vue, MultiSensorChart.vue
- **Dependencies:** chart.js ^4.5.0, chartjs-adapter-date-fns ^3.0.0, vue-chartjs ^5.3.2
- **Fehlt:** TimeRangeSelector.vue

### e) Frontend API-Clients

- **sensors.ts:** queryData() existiert — ruft GET /sensors/data
- **Fehlt:** calibration.ts (POST /api/v1/sensors/calibrate mit API-Key Auth)

### f) Frontend Views

- **Existieren:** 11 Views (Dashboard, Sensors, Logic, SystemMonitor, etc.)
- **Fehlt:** SensorHistoryView.vue

### g) Provisioning

- **SSID:** AutoOne-{ESP_ID} (z.B. AutoOne-ESP_D0B19C)
- **Password:** provision
- **Portal:** http://192.168.4.1
- **Felder:** WiFi SSID, WiFi Password, MQTT Broker IP

### h) Chaos-Tests Container-Namen

| Test | Korrekter Container |
|------|---------------------|
| Server Crash | automationone-server |
| DB Ausfall | automationone-postgres |
| MQTT Ausfall | automationone-mqtt (NICHT -mqtt-broker) |
| Latenz | automationone-server (tc/netem NICHT in Alpine) |
| RAM-Limit | automationone-server |

---

## Schritt 2.1: Docker-Stack verifizieren (Ops)

**Was:** Stack hochfahren, Health-Checks, Services bestaetigen
**Wer:** system-control / SKILL: system-control
**Dateien:** Keine Aenderung

**Befehl:**
```
Fuehre als system-control Ops-Modus aus:

1. Voraussetzungen:
   docker info
   docker compose ps

2. Core-Stack:
   docker compose up -d

3. Monitoring-Stack (nach Health ca. 30-60s):
   docker compose --profile monitoring up -d

4. Verifikation:
   curl -s http://localhost:8000/api/v1/health/live
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
   curl -s http://localhost:3000/api/health
   curl -s http://localhost:9090/-/healthy
   docker compose ps
```

**Verifikation:** docker compose ps → 11+ Services healthy/running
**Abhaengigkeit:** Keine (Phase 0 optional)

---

## Schritt 2.2: ESP32 flashen und konfigurieren (User manuell)

**Was:** Firmware flashen, Provisioning, Registrierung
**Wer:** KEIN Agent — User mit Anleitung
**Dateien:** Keine Aenderung

**PowerShell-Befehle (NICHT Git Bash):**
```powershell
cd "c:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev -t upload
~/.platformio/penv/Scripts/pio.exe device monitor -b 115200
```

**Provisioning:**
1. ESP32 startet in AP-Modus
2. WiFi: SSID AutoOne-{ESP_ID}, Passwort: provision
3. Browser: http://192.168.4.1
4. WiFi SSID + Passwort + MQTT Broker IP eingeben → Save → Reboot

**Verifikation Serial:** "MQTT connected", "Initial heartbeat sent", "Sensor data published"
**Abhaengigkeit:** Schritt 2.1

---

## Schritt 2.3a: Kalibrierungs-Wizard (Frontend)

**Was:** Kalibrierungs-Wizard fuer pH/EC 2-Punkt-Kalibrierung
**Wer:** frontend-dev / SKILL: frontend-development
**Dateien:**
- El Frontend/src/api/calibration.ts (neu)
- El Frontend/src/components/calibration/CalibrationWizard.vue (neu)
- El Frontend/src/components/calibration/CalibrationStep.vue (neu)
- El Frontend/src/router/index.ts (Route hinzufuegen)

**Befehl (eigenstaendig an frontend-dev):**
```
Implementiere den Kalibrierungs-Wizard fuer pH/EC 2-Punkt-Kalibrierung.

API (BINDEND):
- Endpoint: POST /api/v1/sensors/calibrate
- Auth: X-API-Key Header (NICHT JWT). Erstelle API-Client der den Key
  aus import.meta.env.VITE_CALIBRATION_API_KEY liest.
  Workaround: Swagger UI http://localhost:8000/docs

Request-Schema:
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "ph" | "ec" | "moisture" | "temperature",
  "calibration_points": [{"raw": number, "reference": number}, ...],
  "method": "linear" | "offset" (optional),
  "save_to_config": true
}

Response-Schema:
{ "success": true, "calibration": {...}, "sensor_type": "...", "method": "...",
  "saved": bool, "message": "..." }

Patterns:
- Component-Style: ZoneMonitorView.vue (Props, Emits, Computed)
- API-Client-Style: esp.ts (axios, api from ./index, Typen aus @/types)

Zu erstellen:
1. El Frontend/src/api/calibration.ts
2. El Frontend/src/components/calibration/CalibrationWizard.vue (Step-Wizard)
3. El Frontend/src/components/calibration/CalibrationStep.vue (Einzelschritt, Live-Rohwert)
4. Route /calibration in router/index.ts
```

**Verifikation:** npm run build OK; /calibration erreichbar
**Abhaengigkeit:** Schritt 2.1

---

## Schritt 2.3b: Zeitreihen-View (Frontend)

**Was:** Historische Sensor-Zeitreihen mit Chart und Zeitbereich-Selektor
**Wer:** frontend-dev / SKILL: frontend-development
**Dateien:**
- El Frontend/src/views/SensorHistoryView.vue (neu)
- El Frontend/src/components/charts/TimeRangeSelector.vue (neu)
- El Frontend/src/router/index.ts (Route hinzufuegen)

**Befehl (eigenstaendig an frontend-dev):**
```
Implementiere historische Zeitreihen-View fuer Sensordaten.

API (BINDEND):
- Endpoint: GET /api/v1/sensors/data
- Query-Params: esp_id, gpio, sensor_type, start_time, end_time, quality, limit (1-1000)
- Default: letzte 24h, limit 100
- Response: { success, esp_id, gpio, sensor_type,
  readings: [{timestamp, raw_value, processed_value, unit, quality}],
  count, time_range }

API-Client: sensorsApi.queryData() in sensors.ts — BEREITS VORHANDEN, nutzen.

Chart-Basis: LiveLineChart.vue, MultiSensorChart.vue (chart.js + vue-chartjs)
Typen: SensorReading, SensorDataQuery, SensorDataResponse, ChartSensor in @/types

Zu erstellen:
1. El Frontend/src/components/charts/TimeRangeSelector.vue (1h, 6h, 24h, 7d, Custom)
2. El Frontend/src/views/SensorHistoryView.vue (TimeRangeSelector + Sensor-Auswahl + Chart)
3. Route /sensor-history in router/index.ts

Optional: CSV-Export, Zoom/Pan
```

**Verifikation:** npm run build OK; /sensor-history zeigt Chart
**Abhaengigkeit:** Schritt 2.1, Sensordaten in DB (Schritt 2.2)

---

## Schritt 2.4: Kritischer Pfad verifizieren

**Was:** E2E Datenpfad ESP32 → MQTT → Server → DB → Frontend
**Wer:** auto-ops (backend-inspector)
**Befehl:** /auto-ops:ops-inspect-backend
**Verifikation:** sensor_data hat Eintraege; Dashboard zeigt Live-Werte
**Abhaengigkeit:** 2.1, 2.2, 2.3a/b

---

## Schritt 2.5: Chaos Engineering

**Was:** Resilienz-Tests nach Basis-Stabilitaet
**Wer:** User manuell (docker pause hook-blocked)
**Korrigierte Befehle:**

| # | Fehlertyp | Befehl |
|---|-----------|--------|
| 1 | Server Crash | docker pause automationone-server |
| 2 | DB Ausfall | docker stop automationone-postgres |
| 3 | MQTT Ausfall | docker pause automationone-mqtt |
| 4 | Latenz | Docker-Netzwerk-Disconnect (tc/netem nicht in Alpine) |
| 5 | RAM-Limit | docker update --memory 128m --memory-swap 128m automationone-server |

**Hinweis:** docker-Befehle sind hook-blocked → User fuehrt manuell aus
**Abhaengigkeit:** 2.1–2.4 stabil
