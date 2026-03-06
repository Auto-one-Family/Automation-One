# AutoOps – Fehlerkette Systemanalyse (Loki + Log-Fallback)

**Datum:** 2026-03-06  
**Auftrag:** Komplette Kette mit Loki prüfen, alle Fehler zusammenfassen  
**Quellen:** Loki (nach system-control Prüfung erreichbar), Server-Log, AutoOps Health/Debug

---

## 1. Zusammenfassung

| Bereich | Status | Befund |
|--------|--------|--------|
| **Loki** | Erreichbar (nach Fix) | Container lief; Timeout war Windows localhost/WinHTTP – Skripte auf 127.0.0.1 + WebClient-Fallback umgestellt |
| **Server (El Servador)** | Fehler | 100+ ERROR in `logs/server/god_kaiser.log` – Sensor-Handler schlägt bei INSERT fehl (Schema) |
| **API** | Fehler | `GET /api/v1/sensors/` und `GET /api/v1/sensors/data` → **500** (INTERNAL_ERROR) |
| **AutoOps Health** | OK | 8/8 Checks bestanden (Server, Auth, DB, MQTT, Devices, Zones, Metrics) |
| **AutoOps Debug** | Teilweise | 14 Issues, 5 auto-fixed (Offline-Heartbeats), 9 verbleibend (u. a. Sensor-API 500) |

**Hauptursache:** Die Tabelle `sensor_data` hat **keine Spalten `zone_id` und `subzone_id`**. Der Code (Sensor-Handler, Sensor-API) erwartet diese Spalten. Die Migration `add_sensor_data_zone_subzone` existiert, wurde auf der laufenden Datenbank aber offenbar **nicht ausgeführt**.

---

## 2. Loki-Status (nach system-control Prüfung)

- **Container:** Loki läuft (`automationone-loki`, Up, healthy, Port 3100).
- **Ursache anfänglicher „nicht erreichbar“:** Vom Host (PowerShell) Timeout bei `http://localhost:3100` – Windows/WinHTTP-Proxy mit localhost.
- **Anpassung:** Skripte auf `http://127.0.0.1:3100` umgestellt; in `loki-query.ps1` WebClient-Fallback für Ready- und Query-Aufrufe. **Ergebnis:** `scripts/loki-query.ps1 health` → OK.
- **Aktive Streams in Loki:** alloy, cadvisor, el-frontend, el-servador, grafana, loki, mosquitto-exporter, mqtt-broker, mqtt-logger, postgres, postgres-exporter, prometheus.
- **Error Count (5 min)** in Loki sichtbar (u. a. el-servador mit vielen Errors – konsistent mit sensor_data/zone_id-Schema).

---

## 3. Fehler in der Kette (Server-Log)

### 3.1 Kritisch: Sensor-Handler (MQTT → DB)

| Log-Level | Logger | Meldung (Kern) |
|-----------|--------|----------------|
| **ERROR** | `src.mqtt.handlers.sensor_handler` | `column "zone_id" of relation "sensor_data" does not exist` |
| **WARNING** | `src.mqtt.subscriber` | `Handler returned False for topic kaiser/god/esp/.../sensor/.../data - processing may have failed` |

**SQL (Auszug):**  
`INSERT INTO sensor_data (..., zone_id, subzone_id) VALUES (..., $13::VARCHAR, $14::VARCHAR)`  
→ Die Tabelle `sensor_data` kennt die Spalten `zone_id` und `subzone_id` nicht.

**Betroffen:** Alle eingehenden Sensor-MQTT-Nachrichten (Mock- und echte ESPs). Keine Sensordaten werden in `sensor_data` persistiert, solange die Migration fehlt.

### 3.2 Volumen (Server-Log)

- **ERROR:** mind. 100 Einträge (Grep-Zählung in `logs/server/god_kaiser.log`)
- **WARNING:** u. a. wiederholte MQTT-Subscriber-Hinweise „Handler returned False“

### 3.3 Weitere Log-Quelle (älter)

- **El Servador/god_kaiser_server/logs/god_kaiser.log:** Überwiegend WARNING vom 2026-03-03 (Tests: `gpio_validation_service` „Unknown board_model MagicMock“, `src.schemas.esp` GPIO/count). Kein akuter Laufzeitfehler wie `zone_id`.

---

## 4. API-Fehler (REST)

| Endpoint | Status | Ursache |
|----------|--------|--------|
| `GET /api/v1/sensors/` | **500** | INTERNAL_ERROR – Abfrage/Join über `sensor_data` schlägt fehl (Schema) |
| `GET /api/v1/sensors/data` | **500** | Gleiche Schema-Abweichung |

Folge: Sensor-Listen und Sensor-Daten-Abfragen im Frontend bzw. durch AutoOps schlagen fehl.

---

## 5. AutoOps Debug – verbleibende Issues (9)

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| **Device (info)** | 7 | Device has no sensors or actuators configured → manuell Konfiguration ergänzen |
| **System (warning)** | 1 | `sensor_scan: Failed` – GET `/api/v1/sensors/` → 500 (siehe Abschnitt 4) |
| **Zone (info)** | 1 | 1 Device ohne Zone: `MOCK_0CBACD10` → Zone zuweisen |

Auto-fixed (5): Offline-Devices (MOCK_57A7B22F, MOCK_495D6D92, MOCK_10C0608E, MOCK_0CBACD10, MOCK_98D427EA) – Heartbeat per Debug-API ausgelöst.

---

## 6. Datenbank / Migration

- **Migration:** `alembic/versions/add_sensor_data_zone_subzone.py`  
  - Fügt `sensor_data.zone_id` und `sensor_data.subzone_id` (String, nullable) sowie Indizes hinzu.
- **Vermutung:** Migration auf der aktuell genutzten DB **nicht ausgeführt** (oder andere DB-Umgebung).
- **Prüfung:**  
  `cd "El Servador/god_kaiser_server"` → `poetry run alembic current` (zeigt aktuelle Revision).  
- **Fix (nach Projekt-Pattern):**  
  `cd "El Servador/god_kaiser_server"` → `poetry run alembic upgrade head`  
  (Docker: `docker exec <server-container> python -m alembic upgrade head`).  
  Danach Server neu starten; Sensor-Handler und `GET /api/v1/sensors/` bzw. `GET /api/v1/sensors/data` sollten wieder funktionieren.

---

## 7. Empfohlene Maßnahmen (Priorität)

1. **Migration ausführen (sofort):**  
   Im Projekt `El Servador/god_kaiser_server`: `poetry run alembic upgrade head` (oder mit Docker: `docker exec <server-container> python -m alembic upgrade head`).  
   Behebt den Sensor-Handler-INSERT und die 500er von `GET /api/v1/sensors/` und `GET /api/v1/sensors/data`. Anschließend Server neu starten.
2. **Loki für nächste Analyse:** `make monitor-up` starten, dann Fehlerkette erneut mit Loki prüfen (`make loki-errors`, pro Service).
3. **Verbleibende AutoOps-Issues:** Devices mit Sensoren/Aktoren konfigurieren, ein Device (MOCK_0CBACD10) einer Zone zuweisen.

---

## 8. Referenzen

- **Server-Log:** `logs/server/god_kaiser.log` (Docker Bind-Mount) bzw. `El Servador/god_kaiser_server/logs/god_kaiser.log`
- **Loki (wenn erreichbar):** `LOG_LOCATIONS.md` §12, `scripts/loki-query.ps1` (errors, health, trace, esp)
- **AutoOps Reports:**  
  - Health: `src/autoops/reports/autoops_session_56dd44a1_20260306_194028.md`  
  - Debug: `src/autoops/reports/autoops_session_a165f4ec_20260306_194035.md`
- **Migration:** `El Servador/god_kaiser_server/alembic/versions/add_sensor_data_zone_subzone.py`
