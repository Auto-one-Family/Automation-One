# INCIDENT-LAGEBILD — INC-2026-04-11-ea5484-gpio32-soil-adc-signal

**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-gpio32-soil-adc-signal-2026-04-11.md`  
**Primärquelle:** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`  
**Git (Pflicht):** Arbeitsbranch zum Erstellzeitpunkt: **`auto-debugger/work`** (Soll-Branch für alle folgenden Produkt-Commits laut `.claude/agents/auto-debugger.md` 0a).

---

## 1. Symptom (IST)

- **Gerät:** `ESP_EA5484`  
- **Kanal:** Bodenfeuchte (Sensor-Typ `moisture`) auf **GPIO 32**  
- **Beobachtung:** Prozentanzeige springt stark; Server-Logs zeigen **Roh-ADC-Sprünge** auf demselben Pin (Beispiele aus Bericht: 2111 → 3706 → 1430) innerhalb kurzer Zeit.  
- **Firmware:** Warnung `ADC rail on GPIO 32: raw=4095 (disconnected or saturated)` während manueller Messung (Serial).  
- **Zeitraum (Evidenz):** laut Bericht Container-Uhr **2026-04-10 ca. 22:41–22:44** (Wanduhr mit Host-UTC abgleichen).

---

## 2. Abgrenzung (Pflicht laut Steuerdatei)

| Kette | Einordnung |
|--------|------------|
| **Signal / ADC / Verkabelung / Referenz** | **In Scope** dieses Incidents — Ursache der Rohwert-Instabilität und 4095-Rails. |
| **Kalibrierungs-Metadaten / Legacy-Schema / UI-Kalibrierflow** | **Out of Scope** hier — siehe Querverweis: Vollimplementierungs-STEUER Bodenfeuchte 2026-04-10 und `docs/analysen/VERIFIKATION-IST-SOLL-bodenfeuchte-kalibrierung-komplett-2026-04-10.md`. Keine Behauptung „Kalibrierung kaputt“ ohne DB-Stichprobe **und** Rohwert-Korrelation. |
| **MQTT/TLS/Keepalive-Disconnect** (3014, Broker `exceeded timeout`) | **Verwandt, separater Incident** — kausal eher **Nebenlinie** (Last durch Mess-Burst); nicht Root für 4095/ADC-Rail. |

**ISA-18.2 / NotificationRouter vs. WS `error_event`:** In den vorliegenden Quellen keine durchgängige `request_id`/Notification-Korrelation für die Feuchte-Sprünge — siehe `CORRELATION-MAP.md` (Felder markiert).

---

## 3. Repo-Anker (nach Verify, Kurz)

| Schicht | Pfad / Artefakt |
|---------|-----------------|
| Firmware ADC-Warnung | `El Trabajante/src/services/sensor/sensor_manager.cpp` — `validateAdcReading()`, `readRawAnalog()` |
| Firmware Transport (Nebenlinie) | `El Trabajante/src/services/communication/mqtt_client.cpp` |
| Server Feuchte-Verarbeitung | `El Servador/god_kaiser_server/src/sensors/sensor_libraries/active/moisture.py` (`MoistureSensorProcessor`) |
| Server Ingest | `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` |
| Kalibrierung | `…/mqtt/handlers/calibration_response_handler.py`, `…/services/calibration_service.py` |
| Mess-API | `El Servador/god_kaiser_server/src/api/v1/sensors.py` — `POST /{esp_id}/{gpio}/measure` (Router-Prefix `/v1/sensors`) |

---

## 4. Hypothesen (priorisiert)

1. **H1 (HW/Pfad):** Offener oder hochohmiger ADC-Pfad, schlechte Masse, ungeeigneter Spannungsteiler → **4095** und Rand-Samples erklärbar.  
2. **H2 (Umgebung):** Kapazitive Kopplung / lange Leitung / Versorgung → kurzzeitige Ausreißer ohne „falsche“ Kalibrierformel.  
3. **H3 (Software Glättung):** Optional **nach** HW-Gate — erhöhte Latenz/Telemetry-Verhalten absprechen; **kein** Ersatz für offenes Kabel.

---

## 5. Offene Punkte

- Exakte **Monotonie** Rohwert vs. Uhrzeit aus produktiven Logs (Host) — im Bericht paraphrasiert, keine Roh-Logfiles im Repo.  
- **DB-Stichprobe** `sensor_configs` für `ESP_EA5484` / GPIO 32 — optional über `db-inspector` (Read-only).  
- **Korrelation 4095-Serial ↔ einzelner Server-`raw`** im selben Sekundenfenster — ohne exportierte Logs nur qualitativ gesichert (Bericht §2).

---

## 6. Eingebrachte Erkenntnisse

| Timestamp (UTC) | Inhalt |
|-------------------|--------|
| 2026-04-11 | Orchestrierung: Lagebild aus Steuerdatei + Bericht + Repo-Verifikation (`verify-plan`-Gate); Pflichtartefakte unter `incidents/INC-2026-04-11-ea5484-gpio32-soil-adc-signal/`. |
