# E3 — Server-Schicht (El Servador)

> **Stand:** 2026-04-26
> **Basis:** Direkte Code-Analyse von `El Servador/god_kaiser_server/src/`
> **Verifizierte Korrekturen (E0):** I3, I5, I7, I10, I11, I14

---

## 1. Überblick und Framework-Stack

Die Server-Schicht ist das Gehirn des AutomationOne-Systems. Alle Geschäftslogik, Kalibrierung, Regel-Auswertung und Geräte-Verwaltung laufen hier — ESP32-Geräte sind bewusst "dumme Agenten" ohne eigene Logik.

| Komponente | Version / Details |
|------------|-------------------|
| Framework | FastAPI 0.110+ |
| ORM | SQLAlchemy 2.0 (async) |
| Migrationen | Alembic |
| MQTT-Broker | Mosquitto (extern) |
| Datenbank | PostgreSQL |
| Scheduler | APScheduler (via `scheduler.py`) |
| Metriken | Prometheus (via `core/metrics.py`) |
| Logging | Loki-kompatibel via `core/logging_config.py` |
| Resilienz | Circuit Breaker via `core/resilience.py` |

**Ordnerstruktur (ca. 60.604 Zeilen gesamt):**

```
src/
├── main.py              (ca. 711 Zeilen)   FastAPI-App, Lifespan-Events
├── api/v1/              (ca. 12.210 Zeilen) 31 Router-Module
├── services/            (ca. 13.675 Zeilen) Business-Logic-Layer
├── mqtt/                (ca. 6.938 Zeilen)  Client, 17 Handler, Publisher
├── db/                  (ca. 6.942 Zeilen)  Models, Repositories
├── schemas/             (ca. 6.778 Zeilen)  Pydantic DTOs
├── sensors/             (ca. 3.728 Zeilen)  Sensor-Libraries, Registry
├── core/                (ca. 7.294 Zeilen)  Config, Security, Scheduler
└── websocket/                               WebSocket-Manager
```

---

## 2. App-Bootstrap und Middleware

**Datei:** `El Servador/god_kaiser_server/src/main.py`

### 2.1 Lifespan-Reihenfolge (Startup)

Die gesamte Initialisierung läuft in einem FastAPI `lifespan`-Kontextmanager. Die Reihenfolge ist sicherheitskritisch:

| Schritt | Aktion | Kritikalität |
|---------|--------|--------------|
| 0 | JWT-Secret-Validierung (Länge, Komplexität) | HALT in Produktion |
| 0.5 | Resilience Registry initialisieren | KRITISCH |
| 1 | Datenbank-Init (`create_all`) | KRITISCH |
| 2 | MQTT-Client verbinden | NON-FATAL (Betrieb ohne MQTT möglich) |
| 3 | MQTT-Handler registrieren (alle 17) | JA |
| 3.4 | Central Scheduler initialisieren | JA |
| 3.4.1 | Simulation-Scheduler starten | JA |
| 3.4.2 | Maintenance-Service starten | JA |
| 3.4.5 | Alert-Suppression-Scheduler | NON-FATAL |
| 3.5 | Mock-ESP Recovery nach Restart | NON-FATAL |
| 3.5.1 | `simulation_configs` Write-Through-Cache rebuild | NON-FATAL |
| 3.6 | Sensor-Type Auto-Registration | NON-FATAL |
| 3.7 | Sensor-Schedule Recovery | NON-FATAL |
| 4 | MQTT-Topics abonnieren | CONDITIONAL (nur wenn MQTT verbunden) |
| 5 | WebSocket-Manager initialisieren | KRITISCH |
| 6 | Services initialisieren (SafetyService → LogicEngine) | KRITISCH |
| 6.1 | Plugin-Sync (Registry → DB) | NON-FATAL |
| 6.2 | Daily-Diagnostic-Scheduler | NON-FATAL |
| 6.3 | Plugin-Schedule Registration (DB → APScheduler) | NON-FATAL |

### 2.2 Shutdown-Reihenfolge

| Priorität | Aktion |
|-----------|--------|
| FIRST | Logic-Scheduler und LogicEngine stoppen |
| EARLY | SequenceExecutor-Cleanup |
| EARLY | Maintenance- und Mock-ESP-Service stoppen |
| MIDDLE | WebSocket- und MQTT-Shutdown |
| LAST | Datenbank-Dispose |

### 2.3 Middleware-Stack

- **CORS-Middleware** — konfigurierbar via `CORS_ORIGINS`
- **Request-Context-Middleware** (`core/request_context.py`) — fügt `X-Request-ID` Header ein, macht Request-ID im Logging verfügbar
- **Exception-Handler** (`core/exception_handlers.py`) — wandelt `GodKaiserException` in strukturierte JSON-Responses um; loggt API-Fehler in `audit_logs`; inkrementiert Prometheus-Counter via `increment_api_error_code()`

---

## 3. MQTT-Schicht (17 Handler)

**Verzeichnis:** `El Servador/god_kaiser_server/src/mqtt/handlers/`

Die MQTT-Schicht empfängt alle Nachrichten von ESP32-Geräten. Der interne Flow ist:

```
MQTT-Broker → MQTTClient._route_message()
    ↓
JSON-Parse + TopicBuilder.matches_subscription()
    ↓
ThreadPool → Handler.handle_*() Methode
    ↓
DB-Persist (via resilient_session) → Logic Engine → WebSocket Broadcast
```

### 3.1 Handler-Übersicht (alle 17)

> [!ANNAHME] Exakte main.py-Zeilennummern für Handler-Registrierung
>
> **Basis:** SKILL.md nennt Zeilen 203-310 als Registrierungsbereich; die Positionen sind näherungsweise — die genauen Zeilen ändern sich bei Codeänderungen.
> **Zu verifizieren:** E11 sollte die aktuellen Zeilen aus main.py extrahieren.

| # | Handler-Klasse | Datei | Topic-Pattern | QoS | Funktion |
|---|----------------|-------|---------------|-----|----------|
| 1 | `SensorDataHandler` | `sensor_handler.py` | `kaiser/+/esp/+/sensor/+/data` | 1 | Sensordaten empfangen, verarbeiten, speichern |
| 2 | `ActuatorStatusHandler` | `actuator_handler.py` | `kaiser/+/esp/+/actuator/+/status` | 1 | Aktor-Zustandsänderungen empfangen |
| 3 | `ActuatorResponseHandler` | `actuator_response_handler.py` | `kaiser/+/esp/+/actuator/+/response` | 1 | Befehlsbestätigungen vom ESP verarbeiten |
| 4 | `ActuatorAlertHandler` | `actuator_alert_handler.py` | `kaiser/+/esp/+/actuator/+/alert` | 1 | Notfall- und Sicherheitsverletzungs-Alerts |
| 5 | `HeartbeatHandler` | `heartbeat_handler.py` | `kaiser/+/esp/+/system/heartbeat` | 0 | Heartbeat, Auto-Discovery, Drift-Erkennung |
| 6 | `DiscoveryHandler` | `discovery_handler.py` | `kaiser/god/discovery/esp32_nodes` | 1 | Legacy-Discovery (deprecated, für Rückwärtskompatibilität) |
| 7 | `ConfigHandler` | `config_handler.py` | `kaiser/+/esp/+/config_response` | 1 | Config-ACK vom ESP, Audit-Logging |
| 8 | `ZoneAckHandler` | `zone_ack_handler.py` | `kaiser/+/esp/+/zone/ack` | 1 | Zone-Assignment-Bestätigung vom ESP |
| 9 | `SubzoneAckHandler` | `subzone_ack_handler.py` | `kaiser/+/esp/+/subzone/ack` | 1 | Subzone-Assignment-Bestätigung |
| 10 | `LWTHandler` | `lwt_handler.py` | `kaiser/+/esp/+/system/will` | 0 | Last-Will-Testament: sofortige Offline-Erkennung |
| 11 | `ErrorEventHandler` | `error_handler.py` | `kaiser/+/esp/+/system/error` | 1 | ESP32-Fehlercodes empfangen, anreichern, loggen |
| 12 | `IntentOutcomeHandler` | `intent_outcome_handler.py` | `kaiser/+/esp/+/system/intent_outcome` | 1 | Intent-Ergebnisse des ESP (Config-Commit-Tracking) |
| 13 | `IntentOutcomeLifecycleHandler` | `intent_outcome_lifecycle_handler.py` | `kaiser/+/esp/+/system/intent_outcome/lifecycle` | 1 | CONFIG_PENDING Lifecycle-Events |
| 14 | `DiagnosticsHandler` | `diagnostics_handler.py` | `kaiser/+/esp/+/system/diagnostics` | 0 | HealthSnapshot: Heap, WiFi, WDT alle 60s |
| 15 | `HeartbeatMetricsHandler` | `heartbeat_metrics_handler.py` | `kaiser/+/esp/+/system/heartbeat_metrics` | 0 | Erweiterte Runtime-Metriken (AUT-121) |
| 16 | `CalibrationResponseHandler` | `calibration_response_handler.py` | `kaiser/+/esp/+/sensor/+/response` | 1 | Sensor-Antworten für Kalibrierungssitzungen |
| 17 | `QueuePressureHandler` | `queue_pressure_handler.py` | `kaiser/+/esp/+/system/queue_pressure` | 0 | Publish-Queue-Druck-Observability (PKG-01b) |

**Anmerkungen:**
- Handler 6 (`DiscoveryHandler`) ist explizit als **deprecated** markiert; primärer Discovery-Mechanismus ist der Heartbeat (Handler 5).
- Handler 15 (`HeartbeatMetricsHandler`) schreibt **nicht** in DB; puffert nur in TTLCache (120s TTL, 10.000 Einträge max). Die Daten werden beim nächsten Heartbeat vom `HeartbeatHandler` eingemergt.
- Handler 17 (`QueuePressureHandler`) schreibt ebenfalls **nicht** in DB; rein observability-getrieben (Prometheus-Counter + Loki-Log).

### 3.2 HeartbeatHandler (Drift-Erkennung, Resync)

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`

**Wichtige Konstanten:**

| Konstante | Wert | Bedeutung |
|-----------|------|-----------|
| `HEARTBEAT_TIMEOUT_SECONDS` | aus `settings.maintenance.heartbeat_timeout_seconds` | Schwellenwert für Offline-Erkennung im Health-Check |
| `RECONNECT_THRESHOLD_SECONDS` | 60 | Ab 60s Offline gilt Heartbeat als Reconnect |
| `STATE_PUSH_COOLDOWN_SECONDS` | 120 | Mindestabstand zwischen Full-State-Pushes |
| `CONFIG_PUSH_COOLDOWN_SECONDS` | 45 | Mindestabstand zwischen Auto-Config-Pushes |
| `ADOPTION_GRACE_SECONDS` | 2.0 | Wartezeit nach Reconnect für State-Adoption |

**Vollständiger Heartbeat-Algorithmus:**

```
handle_heartbeat(topic, payload)
    │
    ├─ 1. Payload kanonisieren (canonicalize_heartbeat)
    │       → contract_violation normalisieren + Metriken
    │
    ├─ 2. Topic parsen (TopicBuilder.parse_heartbeat_topic)
    │       → esp_id extrahieren
    │
    ├─ 3. Payload validieren (_validate_payload)
    │       → Bei Fehler: Error-ACK senden (SAFETY-P5 Fix-4)
    │
    ├─ 4. Heartbeat-Metrics einmergen (_merge_metrics_into_payload)
    │       → Daten aus HeartbeatMetricsHandler.TTLCache
    │
    ├─ 5. DB-Session öffnen (resilient_session)
    │
    ├─ 6. ESP-Device laden (ESPRepository.get_by_device_id)
    │
    ├─ [NEUES GERÄT] Auto-Discovery
    │       → _discover_new_device() mit Rate-Limiting
    │       → Status: pending_approval (echte Hardware) / online (MOCK_*)
    │       → ACK senden: status="pending_approval"
    │
    └─ [BESTEHENDES GERÄT] Status-basiertes Processing
            │
            ├─ Reconnect-Erkennung: offline_seconds > 60 → is_reconnect=True
            │       → StateAdoptionService.start_reconnect_cycle()
            │       → WS-Broadcast: reconnect_phase="adopting"
            │
            ├─ SAFETY-P5 Fix-3: FRÜH-ACK (vor DB-Schreiboperationen)
            │       → ACK mit zielstatus "online" (verhindert stale "offline" von ESP)
            │
            ├─ Status "rejected" → Cooldown prüfen → ggf. Rediscovery
            ├─ Status "pending_approval" → Heartbeat-Count aktualisieren + ACK
            ├─ Status "approved" → Status auf "online" setzen + Audit-Log
            │
            ├─ ESP-Status auf "online" setzen (update_status)
            ├─ Retained LWT-Message löschen (leeres Payload mit retain=True)
            ├─ Metadaten aktualisieren (_update_esp_metadata)
            ├─ Health-Metriken loggen (_log_health_metrics)
            ├─ Commit
            │
            ├─ LogicEngine.invalidate_offline_backoff(esp_id)
            ├─ Bei Reconnect: Adoption-Task + LogicEngine-Eval (background task)
            │
            ├─ Prometheus-Metriken aktualisieren
            ├─ Heartbeat-History loggen (ESPHeartbeatRepository, savepoint-geschützt)
            ├─ WS-Broadcast: esp_health-Event
            │
            └─ Config-Push prüfen (_has_pending_config)
                    → Bei Config-Push + Reconnect: Full-State-Push DEFERRED
                    → Bei Reconnect ohne Config-Push: _handle_reconnect_state_push()
```

**Drift-Erkennung:** Jedes Heartbeat mit `last_seen > 60s` in der Vergangenheit gilt als Reconnect. Es wird kein expliziter "Drift-Zähler" geführt — die Zeitspanne `offline_seconds` selbst ist das Kriterium. Die veraltete Doku-Aussage (I7), dass nur Totalverlust erkannt wird, ist **widerlegt**.

**Handover-Epoch-System:** Die `HeartbeatHandler`-Instanz hält ein `TTLCache` (`_handover_epoch_by_esp`, 24h TTL, 10.000 Einträge) für monoton steigende Epoch-Zähler pro ESP. Bei Reconnect wird der Counter inkrementiert. Der ESP kann seinen aktiven Epoch-Wert (`active_handover_epoch`) im Heartbeat-Payload mitschicken, um Konflikte zu vermeiden.

**Session-Announce:** Separat von Heartbeat — Topic `kaiser/+/esp/+/session/announce` wird durch `HeartbeatHandler.handle_session_announce()` verarbeitet (kein eigener Handler). Registriert Verbindungszeitpunkt für Startup-Reject-Fenster (1 Sekunde).

### 3.3 KaiserHandler

Die Bezeichnung "KaiserHandler" ist im Code so nicht als Handler-Klasse vorhanden. Der Kaiser-Begriff meint die Server-seitige **KaiserService**-Klasse sowie den **Kaiser REST-Router** (`api/v1/kaiser.py`):

**`KaiserService`** (`El Servador/god_kaiser_server/src/services/kaiser_service.py`):
- Verwaltet Kaiser-Relais-Knoten (Raspberry Pi Zero, für Skalierung über 50 ESPs)
- `GOD_KAISER_ID = "god"` — der Standard-Server-Kaiser
- `ensure_god_kaiser()` — erstellt den "god"-Kaiser beim Startup wenn nicht vorhanden
- `sync_god_kaiser_zones()` — synchronisiert zone_ids aus allen ESPs mit `kaiser_id='god'`
- `get_hierarchy(kaiser_id)` — traversiert Kaiser → Zones → Subzones → Devices

**Kaiser REST-Router** (`api/v1/kaiser.py`, Prefix `/v1/kaiser`):
- `GET /kaiser` — alle Kaiser-Knoten auflisten
- `GET /kaiser/{kaiser_id}` — Kaiser-Details mit Zonen
- `GET /kaiser/{kaiser_id}/hierarchy` — vollständiger Baum
- `POST /kaiser` — neuen Kaiser registrieren
- `PUT /kaiser/{kaiser_id}/zones` — verwaltete Zonen aktualisieren

> [!ANNAHME] KaiserHandler als MQTT-Handler
>
> **Basis:** In der SKILL.md wird "KaiserHandler" als MQTT-Handler erwähnt; im Code-Verzeichnis `mqtt/handlers/` existiert kein `kaiser_handler.py`. Die Kaiser-Logik läuft über REST + KaiserService, nicht über MQTT.
> **Zu verifizieren:** E11 soll prüfen, ob ein MQTT-Handler für Kaiser-Nachrichten in main.py registriert ist, der nicht als eigene Datei existiert.

### 3.4 SensorDataHandler

**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`

**Flow:**
1. Topic parsen → esp_id, gpio extrahieren
2. Payload validieren (Pflichtfelder: ts, esp_id, gpio, raw_value/value)
3. ESP-Device und SensorConfig laden (`resilient_session`)
4. Pi-Enhanced-Modus prüfen (falls aktiviert: Weiterleitung an externe Verarbeitung)
5. Physikalische Plausibilitätsgrenzen prüfen (nach Verarbeitung)
6. Daten in DB speichern (`SensorRepository`)
7. LogicEngine benachrichtigen
8. WebSocket-Broadcast

**Besonderheiten:**
- Nutzt `resilient_session()` mit Circuit Breaker
- Timeout-Schutz für den gesamten Handler-Aufruf
- WebSocket-Broadcast ist "best-effort" (kein Retry)
- Prometheus-Metrik `observe_sensor_e2e_latency_ms` für End-to-End-Latenzmessung
- `increment_sensor_implausible` bei Werten außerhalb physikalischer Grenzen

### 3.5 Weitere Handler (kompakt)

**LWTHandler** (`lwt_handler.py`):
- Sofortige Offline-Erkennung (vs. 300s Heartbeat-Timeout)
- Flapping-Erkennung: 2+ LWTs in 300s Fenster → `is_flapping: True` in Metadaten
- Räumt `CommandContractRepository` auf (blockierte ACK-Wartezeiten)
- WS-Broadcast: `esp_health`-Event mit `status="offline"`
- `FLAPPING_THRESHOLD = 2`, `FLAPPING_WINDOW_SECONDS = 300`

**ConfigHandler** (`config_handler.py`):
- Empfängt Config-ACK vom ESP (`config_response`)
- Unterstützt `partial_success` Status (manche Items OK, manche fehlgeschlagen)
- Aktualisiert `config_status` auf SensorConfig/ActuatorConfig in DB
- Löst ACK im `CommandContractRepository` auf

**ActuatorAlertHandler** (`actuator_alert_handler.py`):
- Severity-Mapping: `emergency_stop` → `critical`, `runtime_protection` → `warning`
- Speichert in AuditLog; löst Notification-Pipeline aus
- Nutzt `get_actuator_alert_info()` aus `esp32_error_mapping.py` für Klartext-Fehlerbeschreibungen

**ErrorEventHandler** (`error_handler.py`):
- Server vertraut ESP32-Fehlercodes **vollständig** (keine Re-Validierung)
- Anreicherung via `get_error_info()` aus `esp32_error_mapping.py`
- Unbekannte Error-Codes werden gespeichert (System bricht nie ab)
- Rohe ESP-Nachricht wird immer für Debugging bewahrt
- KI-Analyse via `ai_service.ErrorAnalysisRequest` (optional)

**DiagnosticsHandler** (`diagnostics_handler.py`):
- QoS 0 (best-effort, nicht kritische Telemetrie)
- Felder: `heap_free`, `heap_min_free`, `heap_fragmentation`, `uptime`, `error_count`, `wifi_rssi`, `wdt_mode`, `wdt_timeouts_24h`
- Speichert in `esp_devices.device_metadata` (kein eigenes Telemetrie-Modell)

**HeartbeatMetricsHandler** (`heartbeat_metrics_handler.py`):
- Reine Puffer-Schicht; kein DB-Schreiben, kein WS-Broadcast
- TTLCache: 120s TTL, max 10.000 Einträge
- Singleton via `get_heartbeat_metrics_handler()`
- Daten werden durch `HeartbeatHandler._merge_metrics_into_payload()` verbraucht

**QueuePressureHandler** (`queue_pressure_handler.py`):
- Reine Observability: Prometheus-Counter + Loki-Logging
- Events: `entered_pressure`, `recovered`
- Felder: `fill_level`, `high_watermark`, `shed_count`, `drop_count`

**CalibrationResponseHandler** (`calibration_response_handler.py`):
- Nur aktiv wenn aktive Kalibrierungssitzung für den Sensor existiert
- Punkt-Persistenz nur über Calibration-Session-Points-API (nicht direkt)
- WS-Broadcast der Messung für Frontend-Commit

---

## 4. REST-API-Schicht

**Verzeichnis:** `El Servador/god_kaiser_server/src/api/v1/`

### 4.1 Router-Übersicht (Tabelle)

Alle Router werden in `api/v1/__init__.py` über einen gemeinsamen `api_v1_router` zusammengeführt.

| Router-Modul | Prefix | Auth-Mindest-Level | Status |
|--------------|--------|--------------------|--------|
| `auth.py` | `/v1/auth` | Mixed (Public/Active) | IMPLEMENTIERT |
| `esp.py` | `/v1/esp` | Active / Operator | IMPLEMENTIERT |
| `sensors.py` | `/v1/sensors` | Active / Operator | IMPLEMENTIERT |
| `actuators.py` | `/v1/actuators` | Active / Operator | IMPLEMENTIERT |
| `logic.py` | `/v1/logic` | Operator+ | IMPLEMENTIERT |
| `health.py` | `/v1/health` | Mixed | IMPLEMENTIERT |
| `audit.py` | `/v1/audit` | Admin / Active | IMPLEMENTIERT |
| `debug.py` | `/v1/debug` | Admin | IMPLEMENTIERT |
| `zone.py` | `/v1/zone` | Operator+ | IMPLEMENTIERT |
| `zones.py` | `/v1/zones` | Operator+ | IMPLEMENTIERT |
| `subzone.py` | `/v1/subzone` | Operator+ | IMPLEMENTIERT |
| `users.py` | `/v1/users` | Admin | IMPLEMENTIERT |
| `errors.py` | `/v1/errors` | Active | IMPLEMENTIERT |
| `sensor_type_defaults.py` | `/v1/sensor-type-defaults` | Operator+ | IMPLEMENTIERT |
| `sequences.py` | `/v1/sequences` | Operator+ | IMPLEMENTIERT |
| `logs.py` | `/v1/logs` | Public | IMPLEMENTIERT |
| `notifications.py` | `/v1/notifications` | Active / Operator / Admin | IMPLEMENTIERT |
| `intent_outcomes.py` | `/v1/intent-outcomes` | Active | IMPLEMENTIERT |
| `diagnostics.py` | `/v1/diagnostics` | Operator / Active | IMPLEMENTIERT |
| `plugins.py` | `/v1/plugins` | Operator / Active | IMPLEMENTIERT |
| `device_context.py` | `/v1/device-context` | Operator+ | IMPLEMENTIERT |
| `webhooks.py` | `/v1/webhooks` | Public (Grafana) | IMPLEMENTIERT |
| `dashboards.py` | `/v1/dashboards` | Active | IMPLEMENTIERT |
| `backups.py` | `/v1/backups` | Admin | IMPLEMENTIERT |
| `zone_context.py` | `/v1/zone-context` | Operator+ | IMPLEMENTIERT |
| `component_export.py` | `/v1/component-export` | Operator+ | IMPLEMENTIERT |
| `schema_registry.py` | `/v1/schema-registry` | Operator+ | IMPLEMENTIERT |
| `calibration_sessions.py` | `/v1/calibration-sessions` | Operator+ | IMPLEMENTIERT |
| `ai.py` | `/v1/ai` | — | GEPLANT (Stub) |
| `kaiser.py` | `/v1/kaiser` | Active / Operator | IMPLEMENTIERT |

> [!INKONSISTENZ] Kaiser-Router als GEPLANT klassifiziert
>
> **Beobachtung:** In der SKILL.md ist `kaiser` als "PLANNED" gelistet; der Router `api/v1/kaiser.py` ist vollständig implementiert mit 5 Endpunkten (GET list, GET detail, GET hierarchy, POST register, PUT zones).
> **Korrekte Stelle:** [Abschnitt 4.1 dieser Datei](#41-router-übersicht-tabelle)
> **Empfehlung:** SKILL.md und MODULE_REGISTRY.md aktualisieren: Kaiser-Router als IMPLEMENTIERT kennzeichnen.
> **Erst-Erkennung:** E3, 2026-04-26

### 4.2 Auth-Matrix

| Dependency | Verwendung |
|------------|------------|
| `get_current_active_user` | Alle eingeloggten Benutzer |
| `get_current_operator_user` | Operator-Rolle + Admin |
| `get_current_admin_user` | Nur Admin |

**Standard-Response-Format:**

```python
# Erfolg
{"status": "success", "data": {...}}

# Fehler (via HTTPException oder GodKaiserException)
{"detail": "Fehlerbeschreibung"}

# Strukturierter GodKaiserException-Fehler
{
    "error": "KlassenName",
    "message": "...",
    "error_code": "STRING_CODE",
    "numeric_code": 5xxx,
    "details": {...}
}
```

---

## 5. Sensor-Registry und Config-Builder

### 5.1 sensor_type_registry.py

**Datei:** `El Servador/god_kaiser_server/src/sensors/sensor_type_registry.py`

> **I10 bestätigt:** Die Datei liegt unter `src/sensors/` — **nicht** unter `src/services/`. Imports müssen `from ..sensors.sensor_type_registry import ...` verwenden.

**Aufbau der zentralen Datenstrukturen:**

```python
# 1. Normalisierungs-Map: ESP32-Typ → Server-Prozessor-Typ
SENSOR_TYPE_MAPPING: Dict[str, str] = {
    "temperature_sht31": "sht31_temp",
    "humidity_sht31": "sht31_humidity",
    "ph_sensor": "ph",
    "soil_moisture": "moisture",   # Alias → normalisiert
    # ... 30+ Einträge
}

# 2. Virtuelle Sensor-Typen (server-only, nie an ESP32)
VIRTUAL_SENSOR_TYPES: set[str] = {"vpd"}

# 3. Multi-Value-Sensor-Definitionen
MULTI_VALUE_SENSORS: Dict[str, MultiValueSensorDefinition] = {
    "sht31": {
        "device_type": "i2c",
        "device_address": 0x44,
        "values": [
            {"sensor_type": "sht31_temp", "name": "Temperature", "unit": "°C"},
            {"sensor_type": "sht31_humidity", "name": "Humidity", "unit": "%RH"},
        ],
        "i2c_pins": {"sda": 21, "scl": 22},
    },
    "bmp280": { ... },
    "bme280": { ... },
}

# 4. Mock-Standardwerte
SENSOR_TYPE_MOCK_DEFAULTS: Dict[str, Dict] = {
    "sht31_temp":     {"raw_value": 22.0, "unit": "°C"},
    "vpd":            {"raw_value": 1.0,  "unit": "kPa"},
    # ... alle Sensor-Typen
}
```

**Öffentliche API:**

| Funktion | Signatur | Zweck |
|----------|----------|-------|
| `normalize_sensor_type` | `(sensor_type: str) -> str` | ESP32-Typ → Server-Typ normalisieren |
| `get_multi_value_sensor_def` | `(device_type: str) -> Optional[MultiValueSensorDefinition]` | SHT31/BMP280/BME280-Definition laden |
| `is_multi_value_sensor` | `(device_type: str) -> bool` | Prüft ob Gerät mehrere Werte liefert |
| `expand_multi_value` | `(base_type, user_name, **kwargs) -> List[dict]` | SHT31 → [sht31_temp, sht31_humidity] aufteilen |
| `get_mock_default_raw_value` | `(sensor_type, user_provided_raw) -> float` | Physikalisch plausible Standardwerte |
| `sanitize_unit_encoding` | `(unit: str) -> str` | Latin-1/UTF-8 Mojibake korrigieren |
| `get_i2c_address` | `(device_type, default_address) -> Optional[int]` | I2C-Adresse aus Registry |

**VIRTUAL-Typ-Definition:**

`VIRTUAL_SENSOR_TYPES = {"vpd"}` — definiert als Python `set`. Aktuell ist VPD der einzige virtuelle Sensor-Typ. Mock-Standardwert: `1.0 kPa` in `SENSOR_TYPE_MOCK_DEFAULTS`. Die Registry-Datei registriert keine Typen dynamisch; alle Typen sind statisch definiert.

### 5.2 VIRTUAL-Filter in build_combined_config()

**Datei:** `El Servador/god_kaiser_server/src/services/config_builder.py`

> **I5 bestätigt:** Es gibt **genau eine** Filterstelle für VIRTUAL-Sensoren.

**Code-Stelle (Zeilen 290–294 in config_builder.py):**

```python
# Filter out VIRTUAL sensors — computed server-side (e.g. VPD), never sent to ESP32
active_sensors = [
    s for s in active_sensors
    if not (getattr(s, "interface_type", None) or "").upper() == "VIRTUAL"
]
```

**Bedeutung:** Der Filter prüft das `interface_type`-Feld der `SensorConfig`, nicht den `sensor_type`-String. Virtuelle Sensoren müssen `interface_type="VIRTUAL"` (case-insensitive) in der DB haben, um herausgefiltert zu werden. Die `VIRTUAL_SENSOR_TYPES`-Menge aus `sensor_type_registry.py` wird **hier nicht verwendet**.

**Risiko bei neuen Callpoints (I5):**

Wenn `build_combined_config()` zukünftig an anderen Stellen aufgerufen wird, oder wenn andere Funktionen die Sensor-Liste ohne diesen Filter verwenden, könnten virtuelle Sensoren fälschlicherweise an den ESP32 gesendet werden. Der ESP32 kann VPD nicht verarbeiten (kein Sensor-Driver, keine Hardware).

**8 bekannte Callpoints** (verteilt über Services, API-Endpoints und Tests): Nur `build_combined_config()` filtert — alle anderen Callpoints erhalten ungefilterte Sensor-Listen aus der DB.

> [!INKONSISTENZ] VIRTUAL-Filter nutzt interface_type, nicht VIRTUAL_SENSOR_TYPES
>
> **Beobachtung:** `sensor_type_registry.py` definiert `VIRTUAL_SENSOR_TYPES = {"vpd"}` — diese Menge wird im VIRTUAL-Filter in `build_combined_config()` nicht verwendet. Der Filter prüft `interface_type == "VIRTUAL"`. Wenn ein neuer virtueller Sensor-Typ hinzugefügt wird, muss er in **beiden** Stellen eingetragen werden: Registry (`VIRTUAL_SENSOR_TYPES`) und als `interface_type="VIRTUAL"` in der DB-Migration.
> **Korrekte Stelle:** [Abschnitt 5.2 dieser Datei](#52-virtual-filter-in-build_combined_config)
> **Empfehlung:** Filter auf `normalize_sensor_type(s.sensor_type) in VIRTUAL_SENSOR_TYPES` umstellen, oder `VIRTUAL_SENSOR_TYPES` im Filter verwenden. Derzeit sind beide Quellen konsistent (VPD hat `interface_type="VIRTUAL"`), aber die Redundanz ist ein Wartungsrisiko.
> **Erst-Erkennung:** E3, 2026-04-26

---

## 6. Service-Layer

**Verzeichnis:** `El Servador/god_kaiser_server/src/services/`

### 6.1 Core-Services

| Service | Datei | Haupt-Methoden | Verantwortlichkeit |
|---------|-------|----------------|---------------------|
| `LogicEngine` | `logic_engine.py` | `start()`, `stop()`, `evaluate_sensor_data()`, `evaluate_timer_triggered_rules()` | Regel-Auswertung, Aktor-Befehle, Hysterese |
| `SafetyService` | `safety_service.py` | `validate_actuator_command()`, `emergency_stop_all()` | Safety-Gate für ALLE Aktor-Befehle |
| `SensorService` | `sensor_service.py` | `process_reading()`, `trigger_measurement()` | Sensor-Verarbeitung, Kalibrierung |
| `ActuatorService` | `actuator_service.py` | `send_command()` → `ActuatorSendCommandResult` | Aktor-Befehle via MQTT |
| `ESPService` | `esp_service.py` | `register()`, `approve()`, `reject()` | Geräte-Verwaltung |
| `ZoneService` | `zone_service.py` | `assign_zone()`, `remove_zone()` | Zone-Zuweisung mit DeviceZoneChange-Audit |
| `SubzoneService` | `subzone_service.py` | `assign_subzone()`, `remove_subzone()`, `set_safe_mode()` | Subzone-Verwaltung |
| `ConfigPayloadBuilder` | `config_builder.py` | `build_combined_config()`, `build_sensor_payload()`, `build_actuator_payload()` | ESP32-Config-Payload-Bau |
| `NotificationRouter` | `notification_router.py` | `route()` | Zentrale Notification-Pipeline |
| `AlertSuppressionService` | `alert_suppression_service.py` | `check_suppression()`, `expire_suppressions()` | ISA-18.2 Shelved Alarms |
| `DiagnosticsService` | `diagnostics_service.py` | `run_full_diagnostic()`, `cleanup_old_reports()` | 10 modulare System-Checks |
| `PluginService` | `plugin_service.py` | `execute_plugin()`, `sync_registry_to_db()` | Plugin Registry ↔ DB |
| `StateAdoptionService` | `state_adoption_service.py` | `start_reconnect_cycle()`, `is_adoption_completed()` | Reconnect-Handover-Gate |
| `DeviceScopeService` | `device_scope_service.py` | `get_active_context()`, `resolve_zone()` | 3-Way Zone-Resolution, 30s Cache |
| `MQTTCommandBridge` | `mqtt_command_bridge.py` | `send_and_wait_ack()`, `resolve_ack()` | ACK-getriebener Command-Sync |
| `MonitorDataService` | `monitor_data_service.py` | `get_zone_monitor_data()` | Subzone-Gruppierung für Monitor L2 |
| `KaiserService` | `kaiser_service.py` | `ensure_god_kaiser()`, `get_hierarchy()` | Kaiser-Knoten-Verwaltung |
| `MaintenanceService` | `maintenance/service.py` | `start()`, `stop()`, `register_jobs()` | Cleanup-Jobs (täglich/periodisch) |

### 6.2 Weitere Services (kompakt)

| Datei | Funktion |
|-------|----------|
| `health_service.py` | System-Health-Aggregation für `/v1/health` |
| `email_service.py` | E-Mail-Versand (SMTP, Provider-abstrakt) |
| `email_retry_service.py` | Retry-Logik für fehlgeschlagene E-Mails |
| `calibration_service.py` | Kalibrierungssitzungs-Verwaltung |
| `calibration_payloads.py` | Payload-Builder für Kalibrierungsbefehle |
| `sensor_scheduler_service.py` | APScheduler-Integration für Sensor-Zeitpläne |
| `alert_suppression_scheduler.py` | Stündliche Bereinigung abgelaufener Suppressions |
| `audit_retention_service.py` | Audit-Log-Retention (konfigurierbares Alter) |
| `audit_backup_service.py` | Audit-Log-Backup vor Retention-Löschung |
| `database_backup_service.py` | Vollständige DB-Backups |
| `logic_service.py` | CRUD für CrossESPLogic-Regeln (REST-Layer) |
| `logic_scheduler.py` | Timer-getriggerte Regel-Auswertung (APScheduler) |
| `vpd_calculator.py` | VPD-Berechnung aus Temperatur + Luftfeuchtigkeit |
| `zone_kpi_service.py` | Zone-KPI-Aggregation |
| `zone_context_service.py` | Zone-Kontext-Daten für Frontend |
| `runtime_state_service.py` | Runtime-State-Snapshot für Monitoring |
| `ai_service.py` | KI-Analyse-Integration (ErrorAnalysisRequest) |
| `ai_notification_bridge.py` | KI → Notification-Pipeline-Bridge |
| `god_client.py` | HTTP-Client für externe God-Layer-Calls |

### 6.3 LogicEngine-Architektur

```
LogicEngine
├── Condition Evaluators
│   ├── SensorConditionEvaluator    (Schwellenwerte, optional subzone_id)
│   ├── TimeConditionEvaluator      (Zeitfenster)
│   ├── HysteresisEvaluator         (DB-persistiert via logic_hysteresis_states)
│   └── CompoundConditionEvaluator  (AND/OR/NOT, condition_index pro Sub-Condition)
│
├── Action Executors
│   ├── ActuatorActionExecutor      (Befehle, Subzone-Matching)
│   ├── DelayActionExecutor         (Verzögerungen)
│   ├── NotificationActionExecutor  (WebSocket)
│   └── SequenceActionExecutor      (Sub-Aktionen in Reihenfolge)
│
└── Safety-Komponenten
    ├── ConflictManager    (Aktor-Konflikte erkennen)
    ├── RateLimiter        (max_executions_per_hour pro Regel)
    └── LoopDetector       (Feedback-Schleifen erkennen)
```

---

## 7. Exception-Hierarchie und Error-Codes

### 7.1 Custom-Exception-Hierarchie

**Datei:** `El Servador/god_kaiser_server/src/core/exceptions.py`

```
GodKaiserException (Basis, status=500)
├── DatabaseException
│   ├── RecordNotFoundException        (5307)
│   ├── DuplicateRecordException       (5308)
│   └── DatabaseConnectionException    (5304)
│
├── MQTTException
│   ├── MQTTConnectionException        (5104)
│   ├── MQTTPublishException           (5101)
│   └── MQTTSubscribeException         (5108)
│
├── AuthenticationException (status=401)
│   ├── InvalidCredentialsException    (5406)
│   ├── TokenExpiredException          (5407)
│   └── InvalidTokenException          (5408)
│
├── NotFoundError (status=404)
│   ├── ESP32NotFoundException         (5001)
│   ├── ESPNotFoundError               (5001) — Alias Paket-X
│   ├── SensorNotFoundException        (5210)
│   ├── ActuatorNotFoundException      (5211)
│   ├── RuleNotFoundException          (5700)
│   ├── SubzoneNotFoundException       (5780)
│   ├── SequenceNotFoundException      (5611)
│   ├── UserNotFoundException          (5414)
│   └── DashboardNotFoundException     (5750)
│
├── ESP32Exception
│   ├── ESP32OfflineException          (5007)
│   └── ESP32CommandFailedException    (5008)
│
├── DeviceOfflineError (status=409)    (5414)
├── DeviceNotApprovedError (status=403)(5405)
├── GpioConflictError (status=409)     (5208)
├── GatewayTimeoutError (status=504)   (5403)
│
├── ValidationException (status=400)   (5205)
│   └── SimulationNotRunningError      (5xxx)
│
├── LogicException
│   ├── RuleNotFoundException          (5700)
│   └── RuleValidationException        (5701)
│
├── NotificationException
│   ├── NotificationNotFoundException   (5850)
│   ├── NotificationSendFailedException (5851)
│   ├── EmailProviderUnavailableException (5852)
│   ├── EmailSendException              (5851)
│   ├── WebhookValidationException      (5857)
│   ├── AlertPreferenceNotFoundException (5859)
│   ├── NoEmailRecipientException       (5853)
│   └── AlertInvalidStateTransition     (5860)
│
└── ExternalServiceException
    ├── GodLayerException              (5410)
    └── KaiserCommunicationException   (5410)
```

### 7.2 Error-Code-Schema (5000–5999)

**Datei:** `El Servador/god_kaiser_server/src/core/error_codes.py`

| Bereich | Range | Klasse |
|---------|-------|--------|
| CONFIG_ERROR | 5000–5099 | `ConfigErrorCode` |
| MQTT_ERROR | 5100–5199 | `MQTTErrorCode` |
| VALIDATION_ERROR | 5200–5299 | `ValidationErrorCode` |
| DATABASE_ERROR | 5300–5399 | `DatabaseErrorCode` |
| SERVICE_ERROR | 5400–5499 | `ServiceErrorCode` |
| AUDIT_ERROR | 5500–5599 | `AuditErrorCode` |
| SEQUENCE_ERROR | 5600–5699 | `SequenceErrorCode` |
| LOGIC_ERROR | 5700–5749 | `LogicErrorCode` |
| DASHBOARD_ERROR | 5750–5779 | — |
| SUBZONE_ERROR | 5780–5799 | — |
| AUTOOPS_ERROR | 5800–5849 | — |
| NOTIFICATION_ERROR | 5850–5899 | `NotificationErrorCode` |
| PLUGIN_ERROR | 5900–5949 | — |
| RESERVED | 5950–5999 | — |

**ESP32-seitige Error-Codes (1000–4999):**

| Bereich | Range | Klasse |
|---------|-------|--------|
| HARDWARE | 1000–1999 | `ESP32HardwareError` |
| SERVICE | 2000–2999 | `ESP32ServiceError` |
| COMMUNICATION | 3000–3999 | `ESP32CommunicationError` |
| APPLICATION | 4000–4999 | `ESP32ApplicationError` |

**Exception-Handler-Integration:** `core/exception_handlers.py` fängt alle `GodKaiserException` ab:
- Wandelt in JSON-Response um (`to_dict()`)
- Loggt in `audit_logs` (fire-and-forget via eigener DB-Session)
- Inkrementiert Prometheus-Counter `increment_api_error_code()`

---

## 8. Notification-Pipeline (Überblick)

**Datei:** `El Servador/god_kaiser_server/src/services/notification_router.py`

Die `NotificationRouter.route()` ist die zentrale Eintrittspunkt für alle Benachrichtigungen:

```
NotificationCreate
    │
    ├─ [Broadcast ohne user_id]
    │   └─ Dedup via correlation_id → _broadcast_to_all()
    │
    └─ [User-spezifisch]
        │
        ├─ Schritt 0: Title-basierte Dedup (wenn kein fingerprint)
        │   └─ Fenster je nach source: 60s–300s
        │
        ├─ Schritt 1: DB-Persist (IMMER)
        │   └─ Fingerprint via ON CONFLICT (FIX-F5)
        │
        ├─ Schritt 2: User-Präferenzen laden
        │
        ├─ Schritt 3: WS-Broadcast → "notification_new"
        │
        └─ Schritt 4: E-Mail-Routing (Severity-basiert)
            ├─ critical → sofortiger Versand
            ├─ warning (1. des Tages) → sofort, danach → Digest-Queue
            └─ info → kein E-Mail
```

**Dedup-Fenster nach Source:**

| Source | Fenster |
|--------|---------|
| `mqtt_handler` | 300s |
| `sensor_threshold` | 120s |
| `device_event` | 300s |
| `logic_engine` | 120s |
| `system` | 300s |
| Standard | 60s |

**Details zu E-Mail, Digest-Service und Webhook:** → E8 (Notification-System-Detaildokumentation)

---

## 9. Bekannte Inkonsistenzen (inline)

### I3 (Tabellennamen) — Bestätigt

> [!INKONSISTENZ] Tabellennamen weichen von intuitiven Namen ab
>
> **Beobachtung:** Alte Dokumentation nannte `users` und `heartbeat_logs`. Korrekte Tabellennamen:
> - `User`-Model → Tabelle `user_accounts` (`db/models/user.py:30`)
> - `ESPHeartbeatLog`-Model → Tabelle `esp_heartbeat_logs` (aus Konvention; `db/models/esp_heartbeat.py`)
> - `ESPDevice`-Model → Tabelle `esp_devices` (`db/models/esp.py:41`)
> **Korrekte Stelle:** [Abschnitt 7 dieser Datei](#7-exception-hierarchie-und-error-codes) und Skill-Doku-Tabelle
> **Empfehlung:** In SKILL.md und MODULE_REGISTRY.md alle Model→Tabellen-Paare explizit dokumentieren.
> **Erst-Erkennung:** E0/E3, 2026-04-26

### I5 (VIRTUAL-Filter) — Bestätigt

Vollständig dokumentiert in [Abschnitt 5.2](#52-virtual-filter-in-build_combined_config).

**Code-Zeile:** `config_builder.py` Zeilen 290–294:
```python
active_sensors = [
    s for s in active_sensors
    if not (getattr(s, "interface_type", None) or "").upper() == "VIRTUAL"
]
```

**Risiko:** 8 bekannte Callpoints für Sensor-Listen; nur dieser eine filtert VIRTUAL-Typen. Neue Callpoints die `active_sensors` direkt aus der DB laden, müssen diesen Filter manuell ergänzen oder sicherstellen, dass nur `build_combined_config()` als einziger Einstiegspunkt für ESP32-Config-Payloads genutzt wird.

### I10 (sensor_type_registry.py Pfad) — Bestätigt

> [!INKONSISTENZ] sensor_type_registry.py liegt unter src/sensors/, nicht src/services/
>
> **Beobachtung:** Alter Pfad in mancher Doku: `src/services/sensor_type_registry.py`. Korrekt: `src/sensors/sensor_type_registry.py`.
> **Korrekte Stelle:** [Abschnitt 5.1 dieser Datei](#51-sensor_type_registrypy)
> **Empfehlung:** Alle Import-Statements in Services und Handlers prüfen — aktuell korrekt (`from ..sensors.sensor_type_registry import ...`).
> **Erst-Erkennung:** E0, 2026-04-26

### I11 (KaiserHandler vollständig implementiert) — Bestätigt

> [!INKONSISTENZ] Kaiser-Router in SKILL.md als PLANNED markiert, obwohl implementiert
>
> **Beobachtung:** `api/v1/kaiser.py` hat 5 vollständige Endpunkte; `KaiserService` ist funktional. SKILL.md listet `kaiser` mit Kommentar "PLANNED".
> **Korrekte Stelle:** [Abschnitt 4.1 dieser Datei](#41-router-übersicht-tabelle)
> **Empfehlung:** SKILL.md-Zeile für kaiser-Router aktualisieren.
> **Erst-Erkennung:** E0/E3, 2026-04-26

### I14 (i2c_address conditional gespeichert) — Bestätigt

Die `i2c_address` wird in `sensor_metadata` conditional gespeichert — das Muster `if i2c_address: sensor_metadata["i2c_address"] = i2c_address` ist korrekt. Der Unique Constraint in `sensor_configs` verwendet `COALESCE(i2c_address::text, '')` für NULL-sicheres Multi-Value-Sensor-Matching.

### Zusätzliche Beobachtung: DiscoveryHandler deprecated

> [!INKONSISTENZ] DiscoveryHandler aktiv registriert aber deprecated
>
> **Beobachtung:** `discovery_handler.py` trägt explizit das Kommentar "DEPRECATED" und "ESP32 v4.0+ uses heartbeat for discovery". Der Handler ist weiterhin in `main.py` registriert und aktiv.
> **Korrekte Stelle:** [Abschnitt 3.1 dieser Datei](#31-handler-übersicht-alle-17)
> **Empfehlung:** Solange ältere ESP32-Firmware existiert, muss der Handler registriert bleiben. Entfernung erst wenn alle Geräte auf v4.0+ aktualisiert sind.
> **Erst-Erkennung:** E3, 2026-04-26

---

*E3 abgeschlossen — 2026-04-26. Analysierte Dateien: 40+ Quelldateien direkt gelesen.*
