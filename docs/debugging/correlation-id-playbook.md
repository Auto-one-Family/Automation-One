# Correlation-ID-Playbook — REST vs. MQTT (AutomationOne)

**Zweck:** Gleiche Feldnamen in Logs **nicht** falsch zusammenführen. Operativ ergänzend zu `docs/debugging/logql-queries.md` und `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md`.

---

## 1. Zwei ID-Welten: `X-Request-ID` / UUID vs. MQTT-synthetische CID

| Quelle | Format / Erzeugung | Typische Nutzung |
|--------|-------------------|------------------|
| **REST (HTTP)** | UUID (v4), aus Header `X-Request-ID` oder vom Server generiert | Browser-Netzwerk-Tab, API-Audit, strukturierte Server-Logs mit HTTP-Kontext |
| **MQTT (Subscriber)** | Menschenlesbare Zeichenkette `{esp_id}:{topic_suffix}:{seq oder no-seq}:{timestamp_ms}` | Nachrichtenfluss ESP → Broker → Handler; wird in dieselbe logische Spur wie `request_id` geschrieben wie bei HTTP, **semantisch aber MQTT** |

**Verwechslungswarnung:** In strukturierten Server-Logs taucht oft ein Feld **`request_id`** auf. Das kann die **HTTP-UUID** sein **oder** die **MQTT-CID**, weil beides über dieselbe `ContextVar` laufen kann (`set_request_id` im MQTT-Handler). Eine Loki-Suche nach einer UUID aus dem Browser **kreuzt nicht zuverlässig** mit einer MQTT-Zeile im Format `ESP_…:data:…` — erst den **Kontext** klären (REST-Call vs. MQTT-Ingest), dann die passende Query wählen.

**Implementierung (Repo):**

- `El Servador/god_kaiser_server/src/core/request_context.py` — `generate_request_id()`, `generate_mqtt_correlation_id()`, Docstring zu den beiden ID-Typen.
- `El Servador/god_kaiser_server/src/mqtt/subscriber.py` — in `_route_message` wird `correlation_id` aus Topic/Payload gebaut; in `_run_handler_with_cid` wird `set_request_id(correlation_id)` im **Main-Event-Loop** gesetzt (Thread-Grenze / ContextVar).
- **Optional (nur REST):** Sendet der Client den Header `traceparent` (W3C Trace Context), reicht die Middleware ihn in der Response mit und schreibt bei JSON-Logging ein Feld `traceparent` — **unabhängig** von MQTT und ohne Pflicht für Firmware/Frontend.

---

## 2. Drei Copy-Paste-LogQL-Szenarien (ohne Secrets)

Platzhalter nur durch **eigene** IDs aus eurer Umgebung ersetzen (keine Passwörter/Token in Queries).

### Szenario A — REST-Audit (HTTP-`X-Request-ID` / UUID)

Ein konkreter Browser- oder Client-Request soll in **el-servador** nachverfolgt werden.

```logql
{compose_service="el-servador"} |= "$HTTP_REQUEST_UUID"
```

`$HTTP_REQUEST_UUID`: Wert aus Response-Header `x-request-id` oder aus dem Browser-Netzwerk-Tab (DevTools).

### Szenario B — MQTT-Ingest mit synthetischer CID (Handler-Pfad)

Die vollständige MQTT-Korrelationszeichenkette aus Server-Logs steht fest (Format mit Doppelpunkten).

```logql
{compose_service="el-servador"} |= "$MQTT_CID"
```

`$MQTT_CID`: z. B. `ESP_12AB34CD:data:142:1708704000000` (Schema siehe `generate_mqtt_correlation_id` in `request_context.py`).

### Szenario C — Gerät + Zeitfenster (keine vollständige CID)

Nur **Geräte-ID** und ungefähres **Zeitfenster** (Störung, Offline-Phase) — enger fahren über Grafana-Zeitauswahl (oberes rechtes Eck), nicht über eine erfundene CID.

```logql
{compose_service=~"el-servador|esp32-serial-logger|mqtt-broker"} |= "$ESP_ID"
```

`$ESP_ID`: z. B. `ESP_12AB34CD`. Bei Bedarf `level=~"ERROR|WARNING"` ergänzen oder mit Query „Structured Metadata“ in `logql-queries.md` kombinieren.

---

## 3. Sonderfall: Ungültiges JSON auf MQTT (keine MQTT-CID aus Payload)

Wenn `json.loads` in `_route_message` fehlschlägt, läuft **keine** `generate_mqtt_correlation_id` aus dem Payload — Handler werden nicht aufgerufen. Stattdessen schreibt der Subscriber eine **ERROR**-Zeile mit **`topic=…`** und einer synthetischen Kennung **`mqtt_parse_fail_id=parse-fail:<hex>`** (eine UUID ohne Bindestriche im Präfix `parse-fail:`). Das ist **nicht** dieselbe Semantik wie die MQTT-CID nach erfolgreichem Parse; für Loki/Forensik die Zeile über `mqtt_parse_fail_id` oder `parse-fail:` suchen.

```logql
{compose_service="el-servador"} |~ "mqtt_parse_fail_id"
```

Alternativ (trifft auch ältere/nebenstehende Meldungen zu):

```logql
{compose_service="el-servador"} |~ "Invalid JSON payload"
```

---

## 4. Querverweise

| Dokument / Modul | Inhalt |
|------------------|--------|
| `docs/debugging/logql-queries.md` | Weitere Standard-Queries (Fehler, WS, DB, …) |
| `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` | Clustering-Reihenfolge, ISA-Inbox vs. WS-`error_event` |
| `El Servador/god_kaiser_server/src/core/request_context.py` | ID-Generierung und -Semantik |
| `El Servador/god_kaiser_server/src/mqtt/subscriber.py` | MQTT-Routing, CID, `set_request_id` im Handler |
