# INCIDENT-LAGEBILD — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Incident-ID:** `INC-2026-04-11-ea5484-mqtt-transport-keepalive`  
**Steuerdatei:** `.claude/auftraege/auto-debugger/inbox/STEUER-incident-ea5484-mqtt-transport-keepalive-tls-2026-04-11.md`  
**Primärquelle:** `docs/analysen/BERICHT-cluster-ESP_EA5484-kalibrierung-mqtt-offline-monitoring-2026-04-11.md`  
**Vorgänger-Incident (Mapping 6014):** `INC-2026-04-10-esp32-mqtt-tls-errtrak-6014` — dort abgeschlossen; **dieser Lauf** setzt bei **3014** und **Transport-/Keepalive-Muster** an.  
**Letzte Aktualisierung:** 2026-04-19

**Aktueller Git-Branch:** `auto-debugger/work`  
**Soll-Branch:** `auto-debugger/work`

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

## 3. Neue Live-Evidence (5-Minuten-Stresstest nach Reflash, COM4)

Quelle: `El Trabajante/logs/device-monitor-260417-133604.log`

- **Kein Crash-Muster im Fenster:** keine Treffer auf `Guru Meditation`, `WDT`,
  `watchdog`, `task_wdt`.
- **Transport-/Reconnect-Loop ab ~13:39:28:**  
  `MQTT_CLIENT: Writing didn't complete in specified timeout: errno=119` →
  `MQTT_EVENT_ERROR type=1` →
  wiederholtes
  `esp_tls_last=ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` →
  `MQTT_EVENT_DISCONNECTED`.
- **Managed-Reconnect bleibt in Schleife:** mehrfach
  `managed reconnect scheduled ... reason=mqtt_transport_error` und
  `... reason=mqtt_disconnected`, `attempt=3` bleibt über viele Zyklen.
- **Publish-Fehler parallel:** wiederholt `SafePublish failed after retry`.
- **Degraded-Heartbeat aktiv:** wiederholt
  `Heartbeat: skipping gpio_status due to low memory headroom`
  (`free_heap` ~42–46 kB, `max_alloc` 38900 B).
- **Safety-Folge bestätigt:** nach Grace
  `Grace period elapsed (30001ms) → OFFLINE_ACTIVE` und
  `Offline mode ACTIVE — rules=1 actuators GPIO [25]`.

**Interpretation (neu):**

1. **Hauptbild bestätigt:** Kein WDT/Guru, dafür reproduzierbarer MQTT-Transport-/TLS-Timeout-Loop.
2. **Transport + Degradation koppeln:** Heartbeat payload reduziert (gpio_status-Skips), aber
   Verbindung stabilisiert sich dadurch nicht; OFFLINE_ACTIVE bleibt Folge des Disconnect-Loops.
3. **Telemetry-Lücke im Counter-Pfad:** trotz `Writing didn't complete ... errno=119` bleiben in den
   reconnect-Logs `write_timeouts=0`, während `tls_timeouts` hochzählt.
4. **ACK/NVS-Thema bleibt relevant:** `setDeviceApproved(true, approval_ts)` ist weiterhin in der
   Heartbeat-ACK-Callsite aktiv; dedup in `ConfigManager` greift nicht, solange sich `approval_ts`
   bei jedem ACK ändert.

---

## 4. Hypothesen (H1–H5)

| ID | Hypothese | Stützung (Bericht + Live) | Widerlegung / Schwäche |
|----|-----------|-------------------|-------------------------|
| **H1** | Netz/Broker/TLS (WLAN, Broker-CPU, Docker-NAT `172.19.0.1`) | TLS-Timeout, Mosquitto `exceeded timeout` | Ohne parallele Broker-/Router-Logs keine harte RC |
| **H2** | Clientseitige Blockade länger als effektives Keepalive-Fenster (parallel Sensorarbeit, Kalibrier-**Burst** `measure`) | Burst `POST …/measure`, Schreib-Timeout kurz nach Lastspitze | Kausal **indirekt**; kein Beweis, dass allein Burst die Ursache ist |
| **H3** | „Zu viele Sensoren“ / Heap-Kollaps | — | Bericht: Heap ~41–57 kB frei, kein OOM-Muster → **schwach / eher widerlegt** |
| **H4** | ACK→NVS-Schreibmuster erzeugt unnötige Last und semantischen Drift im Approval-State | `main.cpp` ruft `setDeviceApproved(true, approval_ts)` auf jedem `online/approved` ACK; `approval_ts` ändert sich pro ACK | Verstärker/Qualitätsproblem; nicht alleinige Root-Cause für Transport-Timeouts |
| **H5** | Transport-Timeout-Telemetrie ist unvollständig (write-timeout-Counter blind) | Im Stresstest tritt `Writing didn't complete ... errno=119` auf, aber reconnect-Log zeigt `write_timeouts=0` bei steigenden `tls_timeouts` | Kann Diagnose verzerren; Ursache (Parsing/Event-Mapping) noch offen |

---

## 5. Code-Anker (Repo-Ist, esp32_dev / ESP-IDF-Pfad)

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

**Neuer Performance-Hotspot (ACK→NVS):**

```2219:2222:El Trabajante/src/main.cpp
        if (strcmp(status, "approved") == 0 || strcmp(status, "online") == 0) {
            time_t approval_ts = server_time > 0 ? (time_t)server_time : timeManager.getUnixTimestamp();
            configManager.setDeviceApproved(true, approval_ts);
```

```1291:1324:El Trabajante/src/services/config/config_manager.cpp
void ConfigManager::setDeviceApproved(bool approved, time_t timestamp) {
  bool current_approved = isDeviceApproved();
  time_t current_ts = getApprovalTimestamp();
  bool state_changed = (current_approved != approved);
  bool ts_changed = approved && timestamp > 0 && (time_t)current_ts != timestamp;
  if (!state_changed && !ts_changed) {
    return;  // Dedup aktiv, aber ts_changed kann bei jedem ACK wahr werden.
  }
  ...
}
```

---

## 6. Abgrenzung

- **Kein** erneutes Öffnen des abgeschlossenen **6014/UNKNOWN**-Mappings — außer Regressionstest.  
- **ISA-18.2 / NotificationRouter / WS `error_event`:** nur mit separater Evidence-Kette; hier nicht gemischt.  
- **GPIO 32 / ADC 4095:** Hardware-Signalproblem parallel im Bericht — **eigenes** Thema; Transportkette bleibt fokussiert auf MQTT/Timing.

---

## 7. Nächste messbare Schritte (Übergabe)

Siehe **`TASK-PACKAGES.md`** (nach Verify) und **`SPECIALIST-PROMPTS.md`**. Implementierung erst nach abgeschlossenem **`verify-plan`**-Gate und Branch **`auto-debugger/work`**.

---

## Eingebrachte Erkenntnisse

- **2026-04-17 5-Minuten-Stresstest (COM4):**
  Kein WDT/Guru; reproduzierbarer MQTT-TLS-Reconnect-Loop (`errno=119`,
  `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`, `MQTT_EVENT_DISCONNECTED`,
  `SafePublish failed after retry`), Heartbeat-Degradation aktiv
  (`skipping gpio_status due to low memory headroom`), danach `OFFLINE_ACTIVE`.
- **2026-04-17 Verify-Delta aus Live-Log:**
  Counter-Diskrepanz (`write_timeouts=0` trotz Write-Timeout-Evidence) als
  eigene Hypothese H5 und eigener Paketbedarf markiert.

- **2026-04-17 NEUE Ausprägung: OUTBOX-ENOMEM + Guru-Meditation-Crash (Core 0)** — *ergänzt zum 5-Minuten-Stresstest, andere Lastbedingung: Actuator-Command-Bursts*
  (Quelle: aktuelles Serial-Log des Users, post-Reflash, Kontext „Manueller Aktor-Toggle GPIO 25"):

  - Kette **unterscheidet sich** vom vorherigen TLS-Loop:  
    1) Heap-Baseline im COMM-Task: `free=47828 B, min=40820 B` (ok, aber knapp mit fragmentierter Spitze).  
    2) Nach Aktor-ON/OFF-Folge zeigt der IDF-Stack:
       `E (…) OUTBOX: outbox_enqueue(46): Memory exhausted` (mehrfach, 5–10 Hz).  
    3) Unmittelbar: `MQTT_CLIENT: Writing failed: errno=12` (**ENOMEM**, nicht wie bisher errno=119/Timeout) → `Poll read error: 9` (EBADF / Socket-abgerissen) → `MQTT_EVENT_DISCONNECTED`.  
    4) Erwartete Folge: `[SAFETY-P4] disconnect notified`, `2 actuator(s) set to safe state (default_state)`, `[SAFETY-M2] … no offline rules, setting actuators to safe state immediately` (korrektes Verhalten).  
    5) **Direkt danach:** dreimal `[ERROR] [ERRTRAK] <null>` (= `Logger::log()` Null-Fallback greift, Zeile `utils/logger.cpp:66`). Keine verwertbare Message → String-Konkatenation schlägt unter OOM still fehl, `String::c_str()` liefert leeren/ungültigen Buffer.  
    6) **Guru Meditation Error: Core 0 panic'ed (LoadProhibited). EXCCAUSE 0x1C, EXCVADDR 0x00000000.**  
       `PC 0x4008c304`, `A3 0x00000000`. Backtrace: `0x4008c301 → 0x4011d241 → 0x400f91e9 → 0x40116ecf`. ELF-SHA `ca6522f1d6c2df4f`.  
    7) Reboot, sauberer Boot-Start; vor Crash-Window `[SAFETY-M2]` als letzter App-Log → Crash **auf Core 0 (Comm-Task / `esp_mqtt_task`)**, nicht auf dem Safety-Task (Core 1).

  - **Korrektur gegenüber früherer Aussage:** Abschnitt 3 schreibt „Kein Crash-Muster im Fenster" — das gilt **nur** für den TLS-Reconnect-Loop-Test. Unter Aktor-Command-Burst ist ein Crash-Muster nachgewiesen.

  - **Hypothesen-Update:**
    - **H6 (neu, Root-Cause-Kandidat):** Unter OUTBOX-Erschöpfung fragmentiert der Heap so stark, dass Arduino-`String`-Concat-Operationen in Fehler-/Intent-Pfaden stumm fehlschlagen (`.c_str()` kann leeren/ungültigen Buffer liefern). Mehrere Aufrufer passen die Ergebnis-C-Strings **ohne Null-Check** an `strlen/strncpy/strcmp` weiter → LoadProhibited.  
      **Smoking Gun:** exakt drei `[ERRTRAK] <null>` unmittelbar vor Crash, entsprechend Logger-Fallback in `El Trabajante/src/utils/logger.cpp:66`.
    - **H7 (verschärft PKG-05):** Fehlendes `mqtt_cfg.outbox_limit` in `mqtt_client.cpp:310-338` → IDF-Outbox wächst unbegrenzt, wenn TCP-Socket stockt, bis `outbox_enqueue` ENOMEM liefert. Config aktuell nur `buffer_size=4096`, `out_buffer_size=8192`, kein Limit → bestätigt PKG-05-Bedarf **und** macht ihn dringlicher (Crash statt nur Degradation).

  - **Code-Anker (Null-Deref-Hotspots unter OOM, `El Trabajante/src/`):**
    1. `error_handling/error_tracker.cpp:256` — `strcmp(entry.message, message)` ohne Null-Guard auf `message`.  
    2. `error_handling/error_tracker.cpp:268` — `strncpy(error_buffer_[index].message, message, …)` ohne Null-Guard.  
    3. `tasks/publish_queue.cpp:65-66` — `strlen(topic)` / `strlen(payload)` ohne Null-Guard (beide Parameter werden aus Arduino-String `.c_str()` in `mqtt_client.cpp:596` befüllt).  
    4. `tasks/intent_contract.cpp:747` — `strncpy(entry.reason, reason.c_str(), …)` auf `const String& reason`, deren Herkunft bei `PUBLISH_OUTBOX_FULL`-Pfad eine unter OOM konstruierte Concat-Kette ist (`mqtt_client.cpp:632`: `String("ESP-IDF MQTT outbox full: ") + topic`).  
    5. `services/communication/mqtt_client.cpp:610` — `esp_mqtt_client_publish(..., length=0, …)` ruft intern `strlen(payload)` im IDF-Task auf; bei geleerter Arduino-Quelle droht derselbe Pfad.

  - **Abgrenzung:**  
    - Dies ist **nicht** der bereits dokumentierte TLS-Reconnect-Loop (H1/H2), sondern eine **ergänzende** Ausprägung unter Aktor-Burst + Heap-Fragmentierung.  
    - **GPIO 32 ADC-Warning** (`raw=0 disconnected or saturated`) im selben Log ist **parallel** und nicht kausal für den Crash — bleibt separates HW-Thema.  
    - Bisheriges **PKG-05** (AUT-55 Outbox Backpressure) ist korrekt vordimensioniert, aber muss um **`mqtt_cfg.outbox_limit`** und die **Null-Safety-Defensive** ergänzt werden — siehe **PKG-16 (neu)** in `TASK-PACKAGES.md`.

- **2026-04-19 Verify-Plan-Durchlauf (PKG-17, Heartbeat-Slimming Option 1):**
  Neue Hypothese **H8** ergänzt: Heartbeat-Payload ist ein Hauptfragmentierer und deckelt `max_alloc`, wodurch `tcp_write`/EAGAIN begünstigt wird.

  | Evidence | Befund | Relevanz |
  |---|---|---|
  | Runtime-Log 2026-04-17 | `free_heap` im Bereich ~42-49 kB, aber `max_alloc` bleibt bei ~38 900 B | Fragmentierungsbild statt reinem Free-Heap-Mangel |
  | Heartbeat-Degradation-Warnung | `Heartbeat: skipping gpio_status due to low memory headroom` triggert wiederholt | `gpio_status`-Block ist Hauptgewicht im Payload |
  | Disconnect-Kette | `tcp_write errno=11` + `classified=write_timeout` + Reconnect-Loop | Transportfehler korrelieren mit niedrigem zusammenhängendem Heap |
  | Code-Read Verify 2026-04-19 | `publishHeartbeat()` enthält großen `gpio_status`-Assembly-Block + `payload.reserve(1900)` + Queue-Limit 2048 bei `PUBLISH_QUEUE_SIZE=8` | Messbarer Hebel für Option-1-Slimming in PKG-17 |

  **Folgerung H8:** `gpio_status`-Payload-Teil + zu großes `PUBLISH_PAYLOAD_MAX_LEN` erzeugen vermeidbaren Heap-Druck. Daher PKG-17: `gpio_status`-Pfad entfernen, `reserve` reduzieren, `PUBLISH_PAYLOAD_MAX_LEN` halbieren, anschließend Runtime-DoD (`max_alloc >= 46000`, kein EAGAIN-Disconnect im 5-Min-Fenster).
