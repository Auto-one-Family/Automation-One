# INCIDENT-LAGEBILD — INC-2026-04-10-esp32-mqtt-tls-errtrak-6014

**Incident-ID:** `INC-2026-04-10-esp32-mqtt-tls-errtrak-6014`  
**Modus:** `incident` (Steuerdatei `STEUER-incident-esp32-mqtt-tls-errtrak-6014-2026-04-10.md`)  
**Letzte Aktualisierung:** 2026-04-11

## 1. Symptom (Evidence aus Serial, ohne Secrets)

- `MQTT_EVENT_DISCONNECTED` in Schleife; CircuitBreaker `[MQTT]` protokolliert Failures.
- esp-tls: `select()` timeout; `TRANSPORT_BASE` / `MQTT_CLIENT` Transport-Fehler; `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` (TLS-Handshake/Netzpfad nicht rechtzeitig fertig).
- ERRTRAK: `[6014] [UNKNOWN]` mit Text „MQTT connection lost“ — Kategorie **UNKNOWN** widerspricht der erwarteten Einordnung als Kommunikation/MQTT.
- `SafePublish failed after retry`; Sensor Manager: MQTT nicht verbunden, Publish übersprungen (Folgezustand).
- Optional (Vorlauf): Schreib-Timeout auf MQTT-Socket; Heartbeat überspringt `gpio_status` bei niedrigem `max_alloc` — **Hypothese** Ressourcendruck, nicht im Repo allein belegbar.

## 2. Schichten und Rolle im Stack

| Schicht | Rolle im Incident |
|--------|-------------------|
| Infrastruktur (WLAN, Firewall, Broker, DNS, TLS-Zertifikat, Port 8883/1883) | **Primärer Kandidat** für echtes `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` — braucht Gegenprobe außerhalb des Firmware-Repo (Broker-Log, Erreichbarkeit vom gleichen Netzsegment). |
| Firmware El Trabajante (MQTT-Client, ErrorTracker) | **Bestätigter Software-Defekt** bei Anzeige 6014/UNKNOWN (siehe Abschnitt 4). |
| Server / Frontend | Nur relevant, wenn Robin Server-/WS-Evidence im gleichen UTC-Fenster nachreicht — aktuell **nicht** korrelierbar. |

## 3. Hypothesen (nur Hypothesen, keine verkaufte Root Cause)

- **H1:** TLS-Timeout = Broker nicht erreichbar, falsche URI/Port, Firewall, DNS, instabiles WLAN — mit Broker-/Netz-Gegenprobe zu stützen.
- **H2:** Anzeige `6014` entsteht durch **doppelte Baseline** bei `logCommunicationError(ERROR_MQTT_DISCONNECT, …)` — **im Repo verifiziert** (Abschnitt 4).
- **H3:** Heap-Knappheit (`max_alloc`) verschärft Timing — Messung auf Gerät nötig.

## 4. Bestätigte Software-Issues (mit Datei:Zeile)

### ISSUE-SW-01 — ERRTRAK 6014 und Kategorie UNKNOWN bei MQTT-Disconnect

**Ursache (Code):** `logCommunicationError` addiert immer `ERROR_COMMUNICATION` (3000) auf den übergebenen `code`. Alle Aufrufer übergeben aber **bereits absolute** Kommunikations-Codes aus `error_codes.h` (z. B. `ERROR_MQTT_DISCONNECT` = 3014). Ergebnis: `3000 + 3014 = 6014`.  
`getCategoryString` behandelt COMMUNICATION nur für `error_code >= 3000 && error_code < 4000`; **6014** fällt durch → `"UNKNOWN"`.

Belege:

```114:116:El Trabajante/src/error_handling/error_tracker.cpp
void ErrorTracker::logCommunicationError(uint16_t code, const char* message) {
  trackError(ERROR_COMMUNICATION + code, ERROR_SEVERITY_ERROR, message);
}
```

```275:286:El Trabajante/src/error_handling/error_tracker.cpp
const char* ErrorTracker::getCategoryString(uint16_t error_code) {
  if (error_code >= ERROR_APPLICATION && error_code < 5000) {
    return "APPLICATION";
  } else if (error_code >= ERROR_COMMUNICATION && error_code < 4000) {
    return "COMMUNICATION";
  } else if (error_code >= ERROR_SERVICE && error_code < 3000) {
    return "SERVICE";
  } else if (error_code >= ERROR_HARDWARE && error_code < 2000) {
    return "HARDWARE";
  } else {
    return "UNKNOWN";
  }
}
```

```1175:1179:El Trabajante/src/services/communication/mqtt_client.cpp
            self->circuit_breaker_.recordFailure();

            LOG_W(TAG, "MQTT disconnected");
            errorTracker.logCommunicationError(ERROR_MQTT_DISCONNECT, "MQTT connection lost");
```

**Fazit:** Das Serial-Muster `[6014] [UNKNOWN] MQTT connection lost` ist **konsistent mit diesem Defekt** und **unabhängig** davon, ob der Broker „wirklich“ weg ist — der Log kann bei jedem `MQTT_EVENT_DISCONNECTED` so erscheinen.  
**Nebenbefund:** `getCategory(6014)` fällt in den `else`-Zweig und liefert fälschlich `ERROR_HARDWARE` (nur intern), während `getCategoryString` „UNKNOWN“ liefert — beides Folge desselben falsch hohen numerischen Codes.

## 5. Infrastruktur / unklar (ohne externe Evidence nicht schließbar)

- **Warum** TLS timeout (H1): Kein Repo-Beweis; erfordert MQTT-Broker-Logs, Netztest, korrekte `mqtts://host:port`-Konfiguration (ohne Secrets im Report).
- **Zeilenreferenz MQTT_EVENT_ERROR:** Im ESP-IDF-Pfad protokolliert `MQTT_EVENT_ERROR` TCP/TLS-Details ca. bei `mqtt_client.cpp` 1249–1260 (nicht identisch mit der Disconnect-Zeile 1179).

```1249:1261:El Trabajante/src/services/communication/mqtt_client.cpp
        case MQTT_EVENT_ERROR:
            if (event->error_handle != nullptr) {
                ESP_LOGE(TAG, "MQTT_EVENT_ERROR type=%d", event->error_handle->error_type);
                if (event->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
                    ESP_LOGE(TAG, "  TCP transport error: %d (esp_err=%s)",
                             event->error_handle->esp_transport_sock_errno,
                             esp_err_to_name(event->error_handle->esp_tls_last_esp_err));
                } else if (event->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
                    ESP_LOGE(TAG, "  Connection refused, reason=%d",
                             event->error_handle->connect_return_code);
                }
            }
            break;
```

- **SafePublish / CircuitBreaker:** Erwartetes Verhalten bei Down-Link — siehe `mqtt_client.cpp` 564–586 (`SafePublish failed after retry`).

## 6. Eingebrachte Erkenntnisse (additiv)

| Timestamp (UTC-naiv) | Inhalt |
|----------------------|--------|
| 2026-04-11 | Orchestrierung: Lagebild initial; H2 durch Code-Lektüre **bestätigt**; Pfade `mqtt_client.cpp`, `error_tracker.cpp`, `error_codes.h` verifiziert; `pio run -e seeed` in Doku/AGENTS mit `seeed_xiao_esp32c3` aus `platformio.ini` abgeglichen (Verify-Delta). |
| 2026-04-11 | **PKG-01 umgesetzt** (Run `errtrak-convenience-baseline-2026-04-11`): `ErrorTracker`-Convenience-Methoden baseline-idempotent — absolute Codes aus `error_codes.h` werden nicht erneut mit `ERROR_*` addiert; erwartetes Serial-Muster bei Disconnect: **3014** + **COMMUNICATION** statt 6014/UNKNOWN. Verify-Report: `.claude/reports/current/auto-debugger-runs/errtrak-convenience-baseline-2026-04-11/VERIFY-PLAN-REPORT.md`. |
