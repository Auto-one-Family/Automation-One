# CORRELATION-MAP — INC-2026-04-11-ea5484-mqtt-transport-keepalive

**Regel (Steuerung):** Korrelation mit **`esp_id` + engem Zeitfenster** und MQTT-/Broker-Zeilen. **HTTP `request_id`** nur bei nachgereichter Fundstelle — hier **nicht** verwendet.

---

## 1. Primärschlüssel

| Schlüssel | Wert |
|-----------|------|
| **esp_id** | `ESP_EA5484` |
| **Zeitfenster (Sample)** | Serial ↔ Server ↔ Broker im Bericht: **2026-04-10 ~22:41–22:44** **Container-Uhr** (`automationone-server`) — mit **Host-UTC** kalibrieren |

---

## 2. Schichtenweise Kette (gleiches Fenster)

| Schicht | Beobachtung (aus Bericht) | Korrelationsstatus |
|---------|---------------------------|---------------------|
| **Serial** | Schreib-Timeout errno 119 → ERROR → DISCONNECTED → 3014 → Reconnect TLS-Timeout | Innerhalb Firmware konsistent |
| **Broker** | `Client ESP_EA5484 … disconnected: exceeded timeout` | Konsistent mit fehlendem/verzögertem Keepalive-Traffic oder Socket-Stall |
| **Server** | `unexpected_disconnect` / LWT-Pfad für dasselbe **esp_id** | Konsistent mit Broker-Session-Ende |
| **HTTP** | Viele `POST /api/v1/sensors/ESP_EA5484/32/measure` im selben Episode-Kontext | **Kontextual** mit H2 (Lastspitze); **kein** `request_id` in dieser Map |
| **Serial (neu, 2026-04-17)** | Bei jedem Heartbeat-ACK unmittelbar `ConfigManager: Device approval saved (approved=true, ts=...)` bei stabiler Heap-Telemetrie | State-/Persistenz-Mismatch bestätigt: Liveness-ACK triggert wiederholte NVS-Writes |

### 2.1 Frische 5-Minuten-Korrelation (Monitor `device-monitor-260417-133604.log`)

| Zeit (lokal) | Schicht | Evidence | Korrelationsnotiz |
|--------------|---------|----------|-------------------|
| 13:39:28.754 | Serial/IDF | `Writing didn't complete in specified timeout: errno=119` | Einstieg in den neuen Fehlerzyklus |
| 13:39:28.797 | MQTT-App | `MQTT_EVENT_DISCONNECTED` | unmittelbare Folge in derselben Sekunde |
| 13:39:42.495 und fortlaufend | MQTT-App/ESP-TLS | `esp_tls_last=ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT` + weitere Disconnects | bestätigt TLS-Transport-Fehler als wiederkehrendes Muster |
| 13:39:28 bis 13:42:03 | MQTT-App | `SafePublish failed after retry` (mehrfach) | Publish-Pfad kollabiert parallel zum Reconnect-Loop |
| 13:39:28 bis 13:42:03 | Heartbeat | `skipping gpio_status due to low memory headroom` (mehrfach) | Heartbeat degradiert, aber Recovery bleibt aus |
| 13:39:58.855 | SAFETY-P4 | `Grace period elapsed ... → OFFLINE_ACTIVE` | erwartete Downstream-Folge des Disconnect-Loops |
| gesamtes 5-Min-Fenster | System | keine Treffer auf `Guru Meditation`/`WDT` | Crash/WDT als Primärursache im Fenster nicht gestützt |

---

## 3. MQTT-Topic-Felder (nur zur Einordnung, keine Vermischung)

- Sensor-Command/Messung: Schema `kaiser/{kaiser_id}/esp/{esp_id}/sensor/{gpio}/command` (QoS 2 serverseitig laut Projekt-SSOT) — Details `.claude/reference/api/MQTT_TOPICS.md`.  
- Heartbeat / Will: System-Topics — Broker-Timeout betrifft die **TCP/MQTT-Session**, nicht ein einzelnes GPIO-Topic.

---

## 4. BLOCKER für Tiefenkorrelation

| ID | Inhalt |
|----|--------|
| **B-NET-01** | Parallele **Rohzeilen** `docker logs automationone-mqtt --since …` und Router/WLAN zum exakt gleichen UTC-Schnitt (Robin/Infra). |
| **B-TLS-URI-01** | Feldgerät: tatsächliche **URI** (`mqtt://` vs `mqtts://`) und Port müssen zu den beobachteten `esp-tls`-Zeilen passen — **ohne** Secrets in Artefakten dokumentieren (nur Schema/Port-Klasse). |
| **B-SERIAL-01** | Vollständiger Serial-Export mit **Monoton-Uhr** (millis + SNTP), um Sub-Sekunden-Kette zu den Broker-Zeilen zu legen. |
| **B-ALLOY-01** | Monitoring-Profil/Alloy-Pipeline zeitgleich prüfen (`automationone-alloy`, `docker/alloy/config.alloy`), damit Korrelation nicht durch Ingestion-Lücke oder Noise-Filter verzerrt wird. |
| **B-ERRTRAK-01** | Im 5-Min-Monitor-Export keine explizite `ERRTRAK [3014]`-Zeile gefunden; wenn 3014 weiter als Pflichtsignal genutzt wird, vollständigen Loglevel/Exportmodus gegenprüfen (evtl. Throttling/Formatfilter). |

---

## 5. Neue Performance-Korrelation (ACK-Pfad)

| Kante | Evidence | Wirkung |
|------|----------|---------|
| Server Heartbeat ACK (`status=online/approved`) → Firmware ACK-Handler | `heartbeat_handler.py` sendet ACK inkl. `server_time` bei jedem Heartbeat | erwarteter Liveness-Kanal |
| Firmware ACK-Handler → NVS Write | `main.cpp` ruft bei `status in {approved, online}` jedes Mal `setDeviceApproved(true, approval_ts)` | unnötige Persistenz, potenzieller Jitter/Wear |
| NVS Write → Runtime | `config_manager.cpp` nutzt Transaction + Namespace + Write + Log | im Log sichtbar pro ACK-Zyklus, obwohl Approval-State unverändert |
