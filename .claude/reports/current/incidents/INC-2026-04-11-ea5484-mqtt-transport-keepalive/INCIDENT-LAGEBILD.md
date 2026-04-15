# INCIDENT-LAGEBILD — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Incident-ID:** `INC-2026-04-11-ea5484-mqtt-transport-keepalive`  
**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`  
**Primärquelle:** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`  
**Vorgänger-Incident (Mapping 6014):** `INC-2026-04-10-esp32-mqtt-tls-errtrak-6014` — dort abgeschlossen; **dieser Lauf** setzt bei **3014** und **Transport-/Keepalive-Muster** an.  
**Letzte Aktualisierung:** 2026-04-11

---

## 1. Gerät und Scope

| Feld | Wert |
|------|------|
| **esp_id** | `ESP_EA5484` (MAC-Endung EA:54:84, ESP32 Dev/WROOM im Berichtskontext) |
| **Firmware-Pfad** | Standard-Build `esp32_dev` → **ESP-IDF** `esp_mqtt_client` (kein `MQTT_USE_PUBSUBCLIENT`) |
| **Ausfallbild** | MQTT-Schreib-Timeout → Disconnect → Broker `exceeded timeout` → LWT / Server `unexpected_disconnect` → nach Grace **OFFLINE_ACTIVE** |

---

## 2. Symptomkette (korrelierte Zeitleiste — Evidence aus Bericht §2)

Reihenfolge **nur** aus dem Cluster-Bericht; keine verkaufte Root Cause jenseits der Evidence.

1. **Serial (ESP-IDF / App):** Heartbeat/ACKs und Betrieb; manuelle Messung GPIO 32; Warnung `ADC rail on GPIO 32: raw=4095`.  
2. **Transport:** Meldung aus IDF-MQTT-Stack in der Art **`Writing didn't complete in specified timeout: errno=119`** → `MQTT_EVENT_ERROR` → `MQTT_EVENT_DISCONNECTED` → Circuit Breaker Failure.  
3. **ERRTRAK:** **`[3014] [COMMUNICATION]`** „MQTT connection lost“ — **erwartbar** nach PKG-01 des Vorgänger-Incidents (kein 6014/UNKNOWN).  
4. **Reconnect:** `esp-tls: select() timeout`, `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` (wenn TLS-Pfad aktiv; im **Repo-Default** für `esp32_dev` ist `mqtt://` in `mqtt_client.cpp` — Produktions-URI kann abweichen).  
5. **Broker:** `Client ESP_EA5484 … disconnected: exceeded timeout` — Session-Lebenszeichen nicht rechtzeitig (Keepalive/Ping oder Socket-Stall).  
6. **Server (Container-Uhr ~2026-04-10 22:41–22:44 im Sample):** `lwt_handler` / unerwarteter Disconnect für dasselbe Gerät; mit **Host-UTC** abgleichen.  
7. **Folge:** 30 s Grace → `OFFLINE_ACTIVE`, Offline-Regeln (z. B. Aktor GPIO 25) — **Policy-Folge**, nicht separater RC-Cluster.

---

## 3. Hypothesen (H1–H3)

| ID | Hypothese | Stützung (Bericht) | Widerlegung / Schwäche |
|----|-----------|-------------------|-------------------------|
| **H1** | Netz/Broker/TLS (WLAN, Broker-CPU, Docker-NAT `172.19.0.1`) | TLS-Timeout, Mosquitto `exceeded timeout` | Ohne parallele Broker-/Router-Logs keine harte RC |
| **H2** | Clientseitige Blockade länger als effektives Keepalive-Fenster (parallel Sensorarbeit, Kalibrier-**Burst** `measure`) | Burst `POST …/measure`, Schreib-Timeout kurz nach Lastspitze | Kausal **indirekt**; kein Beweis, dass allein Burst die Ursache ist |
| **H3** | „Zu viele Sensoren“ / Heap-Kollaps | — | Bericht: Heap ~41–57 kB frei, kein OOM-Muster → **schwach / eher widerlegt** |

---

## 4. Code-Anker (Repo-Ist, esp32_dev / ESP-IDF-Pfad)

**Keepalive 60 s** — `main.cpp` setzt `mqtt_config.keepalive = 60`; `platformio.ini` `[env:esp32_dev]` `-DMQTT_KEEPALIVE=60`.

**Broker-URI (Dev-Default):** `mqtt://host:port` — siehe `mqtt_client.cpp` `snprintf(broker_uri, … "mqtt://%s:%d", …)`.

**Disconnect → 3014:**

```1159:1179:El Trabajante/src/services/communication/mqtt_client.cpp
        case MQTT_EVENT_DISCONNECTED:
            ...
            errorTracker.logCommunicationError(ERROR_MQTT_DISCONNECT, "MQTT connection lost");
```

**MQTT_EVENT_ERROR (TCP/TLS-Details):**

```1249:1261:El Trabajante/src/services/communication/mqtt_client.cpp
        case MQTT_EVENT_ERROR:
            if (event->error_handle != nullptr) {
                ESP_LOGE(TAG, "MQTT_EVENT_ERROR type=%d", event->error_handle->error_type);
                if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
                    ESP_LOGE(TAG, "  TCP transport error: %d (esp_err=%s)",
                             event->error_handle->esp_transport_sock_errno,
                             esp_err_to_name(event->error_handle->esp_tls_last_esp_err));
```

**Mosquitto (Dev):** `docker/mosquitto/mosquitto.conf` — u. a. `max_keepalive 65535`, `max_inflight_messages 20`.

**LWT / Server:** `El Servador/god_kaiser_server/src/mqtt/handlers/lwt_handler.py` verarbeitet Will-Payload inkl. `reason` (canonical `unexpected_disconnect` über Contract — siehe `system_event_contract.py`).

---

## 5. Abgrenzung

- **Kein** erneutes Öffnen des abgeschlossenen **6014/UNKNOWN**-Mappings — außer Regressionstest.  
- **ISA-18.2 / NotificationRouter / WS `error_event`:** nur mit separater Evidence-Kette; hier nicht gemischt.  
- **GPIO 32 / ADC 4095:** Hardware-Signalproblem parallel im Bericht — **eigenes** Thema; Transportkette bleibt fokussiert auf MQTT/Timing.

---

## 6. Nächste messbare Schritte (Übergabe)

Siehe **`TASK-PACKAGES.md`** (nach Verify) und **`SPECIALIST-PROMPTS.md`**. Implementierung erst nach abgeschlossenem **`verify-plan`**-Gate und Branch **`auto-debugger/work`**.
