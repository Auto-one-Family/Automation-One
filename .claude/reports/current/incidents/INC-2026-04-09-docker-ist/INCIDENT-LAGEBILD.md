# INCIDENT-LAGEBILD — Docker-Stack IST-Stichprobe

**Incident-ID:** `INC-2026-04-09-docker-ist`  
**Stichprobe (lokal):** 2026-04-09, ca. 20:22–20:23 UTC (Docker-Logs)  
**Git:** Branch **`auto-debugger/work`** (Soll-Branch für auto-debugger; verifiziert beim Lauf).

---

## 1. Kurzfassung

Der lokale Docker-Stack zeigt **gesunden Betrieb**: Kern-Container **healthy** bzw. **Up**, Health-Endpoints des Servers **HTTP 200**, MQTT-Broker mit periodischen **healthcheck**-Clients ohne Fehlzeilen in der Stichprobe, Vite-Frontend **ready** auf Port 5173, PostgreSQL mit normalem Betrieb (Checkpoint, `execute`/`INSERT`/`UPDATE` auf `sensor_data` / `sensor_configs`) **ohne FATAL** in der Stichprobe.

---

## 2. Geprüfte Container (Auszug)

| Container-Name | Status (Stichprobe) | Anmerkung |
|----------------|---------------------|-----------|
| `automationone-server` | Up (healthy) | 8000/tcp |
| `automationone-frontend` | Up (healthy) | 5173/tcp |
| `automationone-postgres` | Up (healthy) | 5432/tcp |
| `automationone-mqtt` | Up (healthy) | 1883, 9001/tcp |

Weitere Stack-Container (Grafana, Prometheus, Loki, Alloy, cAdvisor, …) liefen in derselben `docker ps`-Stichprobe ebenfalls **Up** mit **healthy** wo vorgesehen.

---

## 3. Log-Stichprobe (kein ERROR/FATAL in den gezogenen Tails)

**Server (`automationone-server`, Tail ~40):**

- `GET /api/v1/health/live` und `GET /api/v1/health/metrics` → **200 OK**
- MQTT: Publish/Receive auf `kaiser/god/esp/MOCK_BEAA9D/sensor/.../data`, `sensor_handler` verarbeitet, **Sensor data saved** mit UUIDs
- Heartbeat-Zeile: `esp_id=ESP_EA5484` (Uptime/Heap)
- Keine Zeile mit **ERROR** oder **FATAL** im Tail

**MQTT (`automationone-mqtt`, Tail ~30):**

- Wiederkehrende **healthcheck**-Verbindungen auf 1883, `$SYS/#`, sauberes Disconnect — **keine** Fehlerzeilen im Tail

**Frontend (`automationone-frontend`, Tail):**

- **VITE v6.4.1 ready**, Local/Network URLs — **kein** Build-Fehler in der Stichprobe

**PostgreSQL (`automationone-postgres`, Tail):**

- `LOG: checkpoint complete`, `execute` mit **INSERT** `sensor_data` und **UPDATE** `sensor_configs` (asyncpg), Verbindungen — **kein FATAL** im Tail  
- *Hinweis PowerShell:* `docker logs` kann erste Zeilen als `NativeCommandError` markieren; Inhalt ist normales Postgres-`LOG:`.

---

## 4. Produktiver / simulierter Traffic — `esp_id`

| esp_id | Rolle in Stichprobe |
|--------|---------------------|
| **MOCK_BEAA9D** | Simulation/Publish und `sensor_handler` → DB-Persistenz (`sensor_data`, `data_source=mock`) |
| **ESP_EA5484** | Heartbeat im Server-Log (reale/mock je nach Registrierung — nur Heartbeat-Zeile im Tail) |

---

## 5. Pattern-Scan (Minimal, Scope Docker/IST)

- **Backend:** Sensordatenpfad entspricht bestehendem **`sensor_handler`** + Simulation (`simulation.scheduler` für MOCK) — keine zweite parallele Welt erkennbar.
- **Schnittstellen:** Keine Abweichung von REST-Health oder MQTT-Topic-Schema in der Stichprobe festgestellt.

---

## 6. Risiko / Annahmen

- Stichprobe ist **zeitlich begrenzt**; historische Fehler oder seltene Race-Conditions sind nicht ausgeschlossen.
- Vollständige Korrelation über Notification-Router vs. WS-`error_event` war **nicht** Gegenstand dieser Docker-IST-Stichprobe.

---

## 7. Eingebrachte Erkenntnisse

| Timestamp (UTC) | Inhalt |
|-------------------|--------|
| 2026-04-09 ~20:23 | Stichprobe per `docker ps` + `docker logs --tail` auf Server/MQTT/Frontend/Postgres; Stack grün, MOCK_BEAA9D Sensorpfad und ESP_EA5484 Heartbeat sichtbar. |
