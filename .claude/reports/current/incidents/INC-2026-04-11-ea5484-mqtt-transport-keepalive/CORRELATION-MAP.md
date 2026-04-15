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
