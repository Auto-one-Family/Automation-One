# IST — ESP32 MQTT / NVS / Config Tracepoints

**Incident:** INC-ESP32-SERIAL-LOGGING-2026-04-11  
**Stand:** 2026-04-11 (nach Umsetzung Phase 1–2 laut STEUER)  
**Repo-Root:** `Auto-one`

## Repo-Belege (Auszug)

Ausgeführt im Repo-Root (Windows), exemplarisch:

- `rg -n "routeIncomingMessage|logMqttIngressDispatch" "El Trabajante/src/main.cpp"` → Einstieg Router + neuer Ingress-Log-Helfer.
- `rg -n "beginNamespace|beginTransaction" "El Trabajante/src/services/config/storage_manager.cpp"` → NVS-Session/Mutex.
- `rg -n "CFGRESP|s_cfgresp" "El Trabajante/src/services/config/config_response.cpp"` → Config-Response-Publish.
- `rg -n "processConfigUpdateQueue|handleSensorConfig" "El Trabajante/src/tasks/config_update_queue.cpp" "El Trabajante/src/main.cpp"` → Config-Pfad Core-0→1.

## Tracepoint-Tabelle (Pfad | Datei | Block | Task/Core | NVS | heutige Logs | Lücke)

| Pfad | Datei | Funktion/Block | Task/Core | NVS ja/nein | Heutige Logs (IST vor Erweiterung) | Lücke / Ergänzung (umgesetzt) |
|------|--------|------------------|-----------|--------------|-------------------------------------|------------------------------|
| MQTT Empfang → Router | `main.cpp` | `routeIncomingMessage` | Core 0 (ESP-IDF MQTT-Task) bzw. Core 1 (PubSubClient) | nein | `LOG_I` „MQTT message received“ + Topic; `LOG_D` volles Payload | **Ergänzt:** `logMqttIngressDispatch` — `[MQTTIN]` mit Länge, Topic-Tail, Payload-Vorschau **aus** für `/config` |
| MQTT Empfang (IDF) | `mqtt_client.cpp` | `mqtt_event_handler` → `routeIncomingMessage` | Core 0 | nein | Kommentar „Logging in routeIncomingMessage“ | Keine Doppelung — zentral in `main.cpp` |
| Config-Push MQTT | `main.cpp` | `topic == config_topic` … `queueConfigUpdateWithMetadata` | Core 0 → Queue | indirekt (später NVS auf Core 1) | `[CONFIG]` Truncation / Queue full | Korrelation bleibt in bestehenden Pfaden; `[MQTTIN]` deckt Ingress ab |
| Config-Drain | `config_update_queue.cpp` | `processConfigUpdateQueue` | Core 1 (Safety-Task) | ja (Handler) | diverse `LOG_*` / `CFGRESP` | Unverändert — siehe `handleSensorConfig` |
| Sensor-Config-Schleife | `main.cpp` | `handleSensorConfig` → `for (JsonObject sensorObj : sensors)` | Core 1 | ja (`saveSensorConfig`) | `LOG_I` „Handling sensor configuration“; Erfolg pro GPIO vereinzelt | **Ergänzt:** `[CFGIN]` pro Array-Index mit GPIO + `sensor_type` |
| Sensor anwenden | `main.cpp` | `parseAndConfigureSensorWithTracking` | Core 1 | ja | `LOG_I`/`LOG_E` pro Fehlerfall | Bereits dicht; Loop-Übersicht fehlte → `[CFGIN]` |
| Sensor RAM | `sensor_manager.cpp` | `configureSensor` | Core 1 | ja (persist) | Mutex + viele `LOG_*` | NVS-Mutex siehe `StorageManager` |
| Heartbeat ACK | `main.cpp` | Block `topic == heartbeat_ack_topic` | Core 0/1 je Broker-Pfad | ja (`setDeviceApproved` → NVS) | `LOG_D` „Heartbeat ACK received“; viele `SAFETY-P4` Warnungen | **Ergänzt:** `[HBINF]` unmittelbar vor/nach `setDeviceApproved(true, …)` |
| NVS Transaktion | `storage_manager.cpp` | `beginTransaction` / `endTransaction` | aufrufender Task | ja | nur `LOG_E` bei Lock-Timeout | **Ergänzt:** `[NVS] txn_begin ok` mit `lock_ms` + Task-Name; Timeout mit Präfix |
| NVS Namespace | `storage_manager.cpp` | `beginNamespace` | aufrufender Task | ja | `LOG_D` geöffnet; `LOG_E` Konflikt/Schreibfehler | **Ergänzt:** `[NVS] ns_open ok` mit `ro`, `lock_ms`, `owner`; Lock-Timeout mit Namespace-Kürzel |
| NVS Writes Sensor | `config_manager.cpp` | `saveSensorConfig` u. a. | gemischt | ja | bestehende Manager-Logs | über `beginNamespace` jetzt besser sichtbar |
| ConfigResponse Publish | `config_response.cpp` | `publish` / `publishWithFailures` | aufrufender Task | nein | `LOG_I` ohne Zähler | **Ergänzt:** atomare Zähler `mqtt_ok` / `fail` in Logzeile `[CFGRESP]` |
| Comm-Task | `communication_task.cpp` | WiFi/MQTT loop | Core 0 | nein | `COMM_TAG` Meldungen | Kein separater MQTT-Payload-Ingress (liegt in `mqtt_client`) |

## Kurznotiz Core-Zuordnung

- **Core 0:** `mqtt_client.cpp` (ESP-IDF) ruft `routeIncomingMessage` auf (Kommentar `main.cpp` ca. Zeile 3126ff.).
- **Core 1:** `processConfigUpdateQueue` / `handleSensorConfig` — siehe `config_update_queue.cpp` und Forward-Deklarationen in `main.cpp`.

## Änderungs-Set (Firmware, diese Session)

| Datei | Inhalt |
|-------|--------|
| `El Trabajante/src/main.cpp` | `[MQTTIN]`, `[CFGIN]`, `[HBINF]` |
| `El Trabajante/src/services/config/storage_manager.cpp` | `[NVS]` txn/ns |
| `El Trabajante/src/services/config/config_response.cpp` | `[CFGRESP]` + Zähler |

Verifikation Build: `pio run -e esp32_dev` → Exit 0 (lokal ausgeführt).

## PowerShell-Belege (repo-verifiziert)

Aus Repo-Root (`Select-String`):

**`El Trabajante/src/main.cpp`**

```
585:// MQTT ingress: one INFO line (grep [MQTTIN]); config topic = no payload preview (secrets/size).
586:static void logMqttIngressDispatch(const String& topic, const String& payload, bool hide_payload_preview) {
633:snprintf(line, sizeof(line), "[MQTTIN] len=%u tail=%s pvw=off", static_cast<unsigned>(plen), topic_tail);
635:snprintf(line, sizeof(line), "[MQTTIN] len=0 tail=%s", topic_tail);
637:snprintf(line, sizeof(line), "[MQTTIN] len=%u tail=%s pvw=%.40s", static_cast<unsigned>(plen), topic_tail, pv);
648:logMqttIngressDispatch(topic, payload, topic == config_topic);
2281:snprintf(hb, sizeof(hb), "[HBINF] pre setDeviceApproved st=%s epoch=%lu ts=%ld cfg=%d",
2287:LOG_I(TAG, "[HBINF] post setDeviceApproved approved=1");
3869:snprintf(cfgline, sizeof(cfgline), "[CFGIN] sensor item=%u gpio=%d type=%.20s",
```

**`El Trabajante/src/services/config/storage_manager.cpp`**

```
107:snprintf(msg, sizeof(msg), "[NVS] beginTransaction lock timeout wait_ms=%lu",
119:snprintf(msg, sizeof(msg), "[NVS] txn_begin ok lock_ms=%lu owner=%.10s",
181:snprintf(msg, sizeof(msg), "[NVS] beginNamespace lock timeout ns=%.15s wait_ms=%lu",
194:"[NVS] Session conflict - namespace '" + String(current_namespace_) +
223:snprintf(msg, sizeof(msg), "[NVS] ns_open FAIL write ns=%.15s",
246:snprintf(msg, sizeof(msg), "[NVS] ns_open ok ns=%.15s ro=%d lock_ms=%lu owner=%.10s",
```

**`El Trabajante/src/services/config/config_response.cpp`**

```
9:static std::atomic<uint32_t> s_cfgresp_mqtt_ok{0};
10:static std::atomic<uint32_t> s_cfgresp_mqtt_fail{0};
63:"[CFGRESP] mqtt_ok=%lu fail=%lu [%s] st=%s cnt=%u",
71:snprintf(log_buf, sizeof(log_buf), "[CFGRESP] publish FAIL #%lu ok=%lu topic=config_response",
152:"[CFGRESP] mqtt_ok=%lu fail=%lu [%s] st=%s ok_cnt=%u fail_cnt=%u",
160:snprintf(log_buf, sizeof(log_buf), "[CFGRESP] publish FAIL #%lu ok=%lu aggr type=sensor",
```
