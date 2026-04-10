# AutomationOne — 10 LogQL Debug-Queries

> Reference for the most common debug situations.
> All queries work in Grafana Explore, Debug-Console Dashboard, and via Loki API.
> See also: `scripts/loki-query.sh` for CLI usage, `docs/debugging/debug-workflow.md` for scenario-based debugging, **`docs/debugging/correlation-id-playbook.md`** for REST vs. MQTT IDs and copy-paste LogQL.

**Triage (A/B/C):** Sehr breite Queries (z. B. `level="ERROR"` über alle Services oder reiner Volltext `|= "error"`) ziehen oft **Klasse-C-Artefakte** mit — Feldnamen, JSON-Fragmente, harmloser Text. Treffer **pro Zeile** nach `docs/analysen/IST-docker-log-triage-observability-signal-vs-noise-2026-04-09.md` einordnen; die untenstehenden Einstiegs-Queries bleiben absichtlich breit und ersetzen keine strenge Produktpfad-Analyse.

---

## 1. Recent Errors — "What just happened?"

**Situation:** Something went wrong. First query to run — always.

```logql
{compose_service=~".+"} | level="ERROR" | line_format "{{.compose_service}} | {{.message}}"
```

**When:** As the very first step in any debug session.
**Expected:** List of recent errors across all services, formatted as `service | message`.

---

## 2. Service Errors — "Which service has problems?"

**Situation:** A specific service is misbehaving. Filter errors to one service.

```logql
{compose_service="$SERVICE"} | level=~"ERROR|CRITICAL"
```

Replace `$SERVICE` with: `el-servador`, `el-frontend`, `mqtt-broker`, `postgres`, `esp32-serial-logger`.

**When:** After Query 1 shows errors concentrated in one service.
**Expected:** All ERROR and CRITICAL logs from that service.

---

## 3. ESP Errors — "An ESP32 is acting up"

**Situation:** A specific ESP32 device sends wrong data, goes offline, or behaves unexpectedly.

```logql
{compose_service=~"el-servador|esp32-serial-logger"} |= "$ESP_ID" | level=~"ERROR|WARNING"
```

Replace `$ESP_ID` with the device identifier (e.g., `ESP_12AB34CD`, `esp32-xiao-01`).

**When:** ESP goes offline, sends wrong sensor values, or fails to respond to commands.
**Expected:** Cross-service errors mentioning the ESP — both server-side processing and serial output.

---

## 4. Correlation Trace — "Follow a data flow end-to-end"

**Situation:** Trace a single request or data flow from ESP through MQTT, server, and frontend.

```logql
{compose_service=~".+"} |= "$CORRELATION_ID"
```

Replace `$CORRELATION_ID` with the request_id from server logs or a known identifier.

**When:** A sensor value arrives wrong at the frontend — trace where it went wrong.
**Expected:** All log entries across all services that mention the correlation ID.

---

## Correlation-ID-Playbook (REST vs. MQTT)

**Kanonische Beschreibung** (Namenskonflikt `request_id`, drei LogQL-Grundszenarien, Verweise auf `request_context.py` / `subscriber.py`): **`docs/debugging/correlation-id-playbook.md`**.

Kurzfassung — **nicht** HTTP-UUID und MQTT-CID ohne Kontextprüfung kreuzen; Volltext IST: `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`.

- **REST-UUID:** `{compose_service="el-servador"} |= "$HTTP_REQUEST_UUID"`
- **MQTT-CID:** `{compose_service="el-servador"} |= "$MQTT_CID"`
- **Gerät + Zeitfenster:** `{compose_service=~"el-servador|esp32-serial-logger|mqtt-broker"} |= "$ESP_ID"` — Zeitrange in Grafana setzen.

**Parse-Fehler** (ohne Payload-CID, aber mit synthetischer `mqtt_parse_fail_id`): `{compose_service="el-servador"} |~ "mqtt_parse_fail_id"` — alternativ `|~ "Invalid JSON payload"`. Details: `docs/debugging/correlation-id-playbook.md` §3.

---

## 5. MQTT Issues — "ESPs can't connect or lose connection"

**Situation:** MQTT broker problems — devices disconnecting, auth failures, message drops.

```logql
{compose_service="mqtt-broker"} |~ "(?i)(disconnect|error|denied|refused)"
```

**When:** ESP heartbeats are missing, devices show as offline.
**Expected:** Disconnect events, auth denials, connection refused errors from Mosquitto.

---

## 6. Database Errors — "DB operations are failing"

**Situation:** Database connection issues, deadlocks, schema problems.

```logql
{compose_service=~"el-servador|postgres"} |~ "(?i)(database|postgres|sql|connection refused|deadlock|constraint)"
```

**When:** API returns 500 errors, data not persisting, migration failures.
**Expected:** DB connection errors from server, PostgreSQL error messages.

---

## 7. Sensor Processing Errors — "Sensor values are wrong or missing"

**Situation:** Sensor data arrives at the server but is not processed correctly.

```logql
{compose_service="el-servador"} |= "sensor" | level=~"ERROR|WARNING" | line_format "{{.logger}} | {{.message}}"
```

**When:** Sensor values in DB/frontend are missing, wrong, or stale.
**Expected:** Sensor handler errors with the Python module path for precise location.

---

## 8. WebSocket Issues — "Frontend gets no live updates"

**Situation:** Dashboard freezes, no real-time data, WebSocket disconnections.

```logql
{compose_service=~"el-servador|el-frontend"} |~ "(?i)(websocket|ws_|disconnect|reconnect)"
```

**When:** Dashboard shows stale data, "Disconnected" indicator, or no live sensor updates.
**Expected:** WebSocket connection/disconnection events from both server and frontend.

---

## 9. Error Code Lookup — "A specific error code appeared"

**Situation:** An alert, the frontend, or a log shows a numeric error code from the taxonomy.

```logql
{compose_service=~".+"} |~ "E:[0-9]{4}" | level=~"ERROR|WARNING"
```

For a specific error code (e.g., 3001):
```logql
{compose_service=~".+"} |= "3001" | level=~"ERROR|WARNING"
```

**When:** An alert fires with an error code, or the frontend shows an error badge.
**Expected:** All occurrences of that error code across services.
**Reference:** Error code ranges in `.claude/reference/errors/ERROR_CODES.md` (ESP32: 1000-4999, Server: 5000-5999).

---

## 10. ESP Boot Issues — "ESP32 won't come online after flash/reset"

**Situation:** An ESP32 was flashed or reset but doesn't appear online.

```logql
{compose_service="esp32-serial-logger"} |= "$ESP_ID" |~ "(?i)(boot|init|fail|crash|restart|watchdog)"
```

Replace `$ESP_ID` with the device identifier.

**When:** ESP doesn't appear in dashboard after flash, boot loop detected, watchdog resets.
**Expected:** Boot sequence messages, crash/restart events, watchdog triggers.

---

## Loki API Usage

All queries can be executed via the Loki HTTP API:

```bash
# Query range (last 5 minutes)
curl -sG "http://localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={compose_service=~".+"} | level="ERROR"' \
  --data-urlencode "start=$(($(date +%s) - 300))000000000" \
  --data-urlencode "end=$(date +%s)000000000" \
  --data-urlencode 'limit=50'

# Instant query (aggregate)
curl -sG "http://localhost:3100/loki/api/v1/query" \
  --data-urlencode 'query=count_over_time({compose_service=~".+"} | level="ERROR" [5m])'
```

**CLI-Wrapper:**
- Linux/Mac: `scripts/loki-query.sh` (Bash)
- Windows: `scripts/loki-query.ps1` (PowerShell) — `powershell -ExecutionPolicy Bypass -File scripts/loki-query.ps1 errors 5`

Beide unterstützen: `errors [min]`, `trace <cid>`, `esp <esp-id>`, `health`

---

## failure_class (Server logs, Pilot I08)

**Situation:** Filter MQTT-/sensor-related failures by a small stable taxonomy field (no PII in the field value).

**Wichtig (Docker stdout vs. Datei):** Der Container nutzt **TextFormatter** auf der Konsole — dort steht `failure_class=…` am **Zeilenende** (kein JSON pro Zeile). Die **Datei** `logs/server/god_kaiser.log` (Bind-Mount) nutzt bei `LOG_FORMAT=json` echtes **JSON** mit Schlüssel `"failure_class"`.

**Loki / Docker (Textzeilen):**

```logql
{compose_service="el-servador"} |= "failure_class"
```

Nur Parse-Fehler (Substring wie in den Logs):

```logql
{compose_service="el-servador"} |~ "failure_class=mqtt_json_parse"
```

**Datei-JSON oder rein JSON-prozessierte Zeilen** (wenn `| json` auf der Zeile funktioniert):

```logql
{compose_service="el-servador"} | json | failure_class=~"mqtt_json_parse|mqtt_route|sensor_payload_validation"
```

**Reference:** `El Servador/god_kaiser_server/src/core/logging_config.py` (Whitelist `_STRUCTURED_JSON_FIELDS`), Call-Sites: `mqtt/subscriber.py`, `mqtt/handlers/sensor_handler.py`.

---

## Structured Metadata Queries

With Alloy pipeline v2 (native config), additional fields are available as structured metadata:

```logql
# Filter by Python module (el-servador)
{compose_service="el-servador"} | logger="src.mqtt.handlers.sensor_handler"

# Optional: business correlation_id (Alloy extracts from log *message* when the line contains `correlation_id=…`;
# not every server line has it — REST-heavy paths often only have `request_id` metadata)
{compose_service="el-servador"} | correlation_id="$CID"

# Filter by Vue component (el-frontend)
{compose_service="el-frontend"} | component="SensorCard"

# Filter by ESP device (esp32-serial-logger)
{compose_service="esp32-serial-logger"} | device="esp32-xiao-01"

# Filter by error code (esp32-serial-logger)
{compose_service="esp32-serial-logger"} | error_code="3001"
```
