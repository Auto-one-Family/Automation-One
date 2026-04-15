# CORRELATION-MAP — INC-2026-04-10-esp32-mqtt-tls-errtrak-6014

**Regel:** Keine Vermischung von `request_id`/HTTP mit MQTT ohne Fundstelle. Korrelation nur mit klaren Feldern.

## 1. Primärkorrelation (innerhalb Firmware-Logs)

| Feld / Reihenfolge | Inhalt | Status |
|--------------------|--------|--------|
| Log-TAG | `MQTT_CLIENT` / `esp-tls` / `TRANSPORT_BASE` / `ERRTRAK` | Seriell beobachtbar |
| Ablauf | TLS/Transport-Fehler → (Disconnect) → `MQTT_EVENT_DISCONNECTED` → CircuitBreaker Failure → `logCommunicationError` → Throttle „6014 … suppressed“ | Logisch konsistent |
| ERRTRAK-Code | Angezeigt `6014` = `3000 + ERROR_MQTT_DISCONNECT(3014)` | **Repo-bewiesen** (ISSUE-SW-01) |

## 2. esp_id + Zeitfenster

- **esp_id:** Aus Steuerung „ESP_EA5484“ genannt — für Server/Broker-Korrelation `esp_id` + **UTC-Zeitfenster** nachreichen (Robin optional).
- Ohne UTC und Broker-Log: **keine** Cross-Layer-Korrelation.

## 3. MQTT vs. NotificationRouter / WS

- ERRTRAK-Serialausgabe ist **lokal** (`ErrorTracker::logErrorToLogger`).
- Server-`NotificationRouter` / DB-Notifications **nicht** in diesem Lauf angenommen — keine falsche Zuordnung ISA-18.2 vs. `error_event`.

## 4. Offene Korrelations-Blocker

| BLOCKER | Was fehlt |
|---------|-----------|
| B-NET-01 | Broker-Log oder `mosquitto_sub`/`openssl s_client` vom gleichen Segment zum Zeitpunkt der Disconnects (ohne Credentials im Artefakt). |
| B-HEAP-01 | Snapshot `max_alloc` / Heap-Telemetry zum Disconnect-Zeitpunkt (Gerät). |
