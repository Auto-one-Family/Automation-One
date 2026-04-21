# Welle 1 — Zusammenfassung & Offene Fragen (code-belegt)

> **Incident:** INC-2026-04-20-offline-mode-observability-hardening
> **Branch:** `auto-debugger/work` (kein Push)
> **Stand:** 2026-04-20 (nach Welle 1 + Docs-Nachzug)

---

## 1. Bereits durchgeführte Änderungen

### 1.1 Code-Commits (Welle 1)

| Commit | PKG | Datei | Diff | Verifikation (Sandbox) |
|--------|-----|-------|------|-------------------------|
| `7e7ae245` | PKG-01 | `El Servador/god_kaiser_server/src/mqtt/topics.py` | +54 / -0 | ruff ✓, AST ✓, Roundtrip ✓ |
| `2f0c5e3f` | PKG-02 | `El Servador/god_kaiser_server/src/services/logic/safety/conflict_manager.py` | +41 / -2 | ruff ✓, AST ✓ |
| `d5c77149` | PKG-06 | `El Servador/god_kaiser_server/src/mqtt/handlers/config_handler.py` | +9 / -0 | ruff ✓, AST ✓ |
| `bd5af70e` | PKG-07 | `El Servador/god_kaiser_server/src/core/esp32_error_mapping.py` | +4 / -1 | ruff ✓, AST ✓ |

**Welle 1 Pre-Check (read-only, ohne Commit):** ESP32-Firmware-Inventur für PKG-01a / PKG-03 (Konstanten, Hot-Path, TopicBuilder-Stil) — Ergebnis im Agent-Report dokumentiert.

### 1.2 Docs-Nachzug (updatedocs-Skill)

| Commit | PKG-Bezug | Datei | Was |
|--------|-----------|-------|-----|
| `d943aecd` | PKG-01 | `.claude/reference/api/MQTT_TOPICS.md` (v2.20→2.21) | `queue_pressure` in Quick-Lookup + Handler-Tabelle + neue Sektion 3.6a |
| `d943aecd` | PKG-01 | `El Trabajante/docs/Mqtt_Protocoll.md` (v2.3→2.4) | Neue Sektion 15a mit Payload/Hysterese/Publish-Route |
| `d943aecd` | PKG-01 | `.claude/skills/mqtt-development/SKILL.md` | Eintrag 14a in Topic-Schema |
| `d943aecd` | PKG-01 | `.claude/skills/esp32-development/SKILL.md` | `buildQueuePressureTopic()` in Quick-Ref |
| `d943aecd` | PKG-07 | `.claude/reference/errors/ERROR_CODES.md` (v1.6→1.7) | 4062 mit Subcategory `MQTT_PUBLISH_BACKPRESSURE` |
| `d943aecd` | PKG-02/06 | `.claude/reference/debugging/LOG_LOCATIONS.md` (v4.10→4.11) | Neue Sektion 2.3a mit `event_class`-Labels + Loki-Filter |

---

## 2. Offene Fragen — Code-belegte Empfehlungen

### 2.1 PKG-02 Nachbesserung (semantischer Befund beim Review)

**Problem:** Der Agent hat in beiden neuen Logs
`"result": "expected"` gesetzt.

CORRELATION-MAP Abschnitt E/F trennt aber klar:
- `result` = **Ergebnis** der Arbitration (`blocked` oder `applied`)
- Die Klassifikation "ist das erwartet?" ist eine **Meta-Ebene** (Abschnitt F → `"rule_arbitration expected"`)

**Code-Beleg (Commit `2f0c5e3f`):**
```python
# conflict_manager.py L252 (Warn-Log, Blockade):
extra={
  "event_class": "RULE_ARBITRATION",
  "result": "expected",        # <-- falsch: müsste "blocked" sein
  "policy": "first_wins",
  ...
}

# conflict_manager.py ~L275 (Info-Log nach ConflictInfo):
extra={
  "event_class": "RULE_ARBITRATION",
  "result": "expected",        # <-- falsch: müsste resolution.value sein
  ...
}
```

**Zweites Problem:** Ich habe in `LOG_LOCATIONS.md` 2.3a `event_class="rule_arbitration"` (lowercase) dokumentiert; der Agent hat aber `"RULE_ARBITRATION"` (uppercase) geschrieben. Nicht kritisch, aber inkonsistent mit `"CONFIG_GUARD"` (Server-Python-Konvention wäre einheitlich UPPER_SNAKE_CASE in beiden Fällen — ich passe die Docs an, nicht den Code).

**Drittes Problem:** Der Agent hat einen **zusätzlichen** `logger.info()` nach der `ConflictInfo`-Instanz eingefügt (Anti-Interpretation der Spec "L262 analog"). Das verdoppelt die Log-Zeilen pro Konflikt.

**Empfehlung:**

1. **`result`-Feld korrigieren** (Code-Fix):
   - Warn-Log: `"result": "blocked"`
   - Info-Log (wenn behalten): `"result": resolution.value` (dynamisch — bringt den tatsächlichen Ausgang)
   - Zusätzlich neues Feld `"classification": "expected"` für die Meta-Ebene (Filter für Grafana)

2. **Zusatz-Info-Log entfernen:** Die Warn-Zeile ist in jedem Konflikt-Pfad bereits aktiv; der zusätzliche `logger.info()` ist redundant und verdoppelt Log-Volumen. Revert empfohlen.

3. **Casing an Docs angleichen:** Docs auf `RULE_ARBITRATION` / `CONFIG_GUARD` umstellen (LOG_LOCATIONS.md), damit Loki-Filter-Beispiele stimmen. Der Code bleibt wie committet (UPPER_SNAKE).

**Mikro-Commit-Vorschlag:** `fix(server/conflict): correct RULE_ARBITRATION result field + drop redundant info log (PKG-02 follow-up)`.

---

### 2.2 B-QP-PERSIST-01 — Persistenz von queue_pressure-Events

**Kurzantwort:** **(a) Prometheus-only.** Kein `mqtt_errors`-Write.

**Begründung (code-belegt):**

1. **Existierende Metrik-Konvention** (`El Servador/god_kaiser_server/src/core/metrics.py`):
   - `MQTT_ERRORS_TOTAL` (L85–89): Counter mit Label `["direction"]` — aggregiert, **keine per-esp_id Cardinality**.
   - `ESP_ERRORS_TOTAL` (L185–189): Counter mit Label `["esp_id"]` — pro Device.
   - `HEARTBEAT_FIRMWARE_FLAG_TOTAL` (L337–341): Counter für Flag-Transitions (Toggle) — Prometheus-only, **exakt analog zu ENTER/RECOVERED**.
   Das bestehende Pattern "Flag-Toggles → Counter, keine DB" ist bereits etabliert.

2. **Existierender 4062-Flow**: 4062 geht heute über `error_handler.py:166–193` nach `AuditLog.log_mqtt_error()` (L196–225). Das bleibt **unverändert** — damit behält man den Audit-Trail für reale Fehler.
   Würden wir queue_pressure **zusätzlich** in `mqtt_errors` schreiben, verdoppeln wir den Eintrag pro Burst-Druck-Phase und blähen die Error-Statistik künstlich auf. Genau das bemängelt CORRELATION-MAP Abschnitt F.

3. **WS-Broadcast-Risiko**: `error_handler.py:245` ruft bei jedem persist-Schritt `serialize_error_event()` + `ws_manager.broadcast()` auf. Bei Hysterese-Toggle (ENTER/RECOVERED können minütlich kippen) wäre das UI-Spam.

4. **Cardinality**: Mit 1000+ Devices × Direction-Label für `MQTT_ERRORS_TOTAL` sind das 2 Serien. Mit `esp_id`-Label × 1000+ Devices × 2 Events = 2000 Serien. Letzteres ist noch akzeptabel, aber der Trend des Repos ist "aggregate wenn möglich".

**Umsetzung PKG-01b (Welle 2):**

Neuer Counter in `src/core/metrics.py` (analog L337):
```python
MQTT_QUEUE_PRESSURE_TOTAL = Counter(
    "god_kaiser_mqtt_queue_pressure_total",
    "Queue pressure state transitions (ENTER/RECOVERED) per ESP",
    ["esp_id", "event"],  # event in {"enter","recovered"}
)
```

Neuer Handler `src/mqtt/handlers/queue_pressure_handler.py` (Pattern aus `error_handler.py`):
- Parse via `TopicBuilder.parse_queue_pressure_topic()` (bereits committet)
- Validate payload → `increment_mqtt_queue_pressure(esp_id, event)`
- **Kein AuditLog-Write**, **kein WS-Broadcast** (erst in späteren Wellen, falls user_action_required)

Registrierung in `src/main.py` (siehe `main.py:293` als Pattern):
```python
_subscriber_instance.register_handler(
    "kaiser/+/esp/+/system/queue_pressure",
    queue_pressure_handler.handle_queue_pressure_event,
)
```

**Heartbeat-Erweiterung (separater Teil von PKG-01b):**
Felder `publish_queue_hwm`, `publish_queue_shed_count`, `publish_queue_drop_count` werden als Gauges/Counters in Prometheus abgebildet, **nicht** in DB persistiert (konsistent mit bestehendem `ESP_HEARTBEAT_*_GAUGE`-Stil).

---

### 2.3 B-WS-PATH-01 — WS-Pfad für Terminal-Authority-Guard-Event (PKG-04a)

**Kurzantwort:** **Kein neuer Endpoint.** Bestehende `ws_manager.broadcast()`-Route mit **neuem** `type="config_response_guard_replay"` nutzen. Wichtig: **Replay-Event existiert teilweise schon.**

**Code-Belege:**

1. **WS-Manager** `src/websocket/manager.py:210–255`:
   Envelope-Schema `{ "type": ..., "timestamp": ..., "data": {...}, "correlation_id": ... }`.
   Rate-Limit-Bypass-Liste (L49–58): `actuator_status`, `esp_health`, `notification_new`.

2. **Guard-Decision** `config_handler.py:162–181` (PKG-06 bereits commited):
   Strukturiertes Log `event_class="CONFIG_GUARD"` — aber **bisher kein WS-Broadcast** in diesem Skip-Zweig.

3. **Replay-Pfad existiert bereits** `config_handler.py:186–227`:
   Der normale Replay setzt `terminal_authority_replay: True` (L213) und broadcasted — ABER liefert `correlation_id_source` **nicht** mit. Genau das ist die Lücke, die PKG-04a schließen muss.

4. **Canonicalisierung** `device_response_contract.py:141–154`:
   Drei Fälle inline (kein Enum):
   - `"original"` — beide Felder da
   - `"request_id_fallback"` — nur `request_id` vorhanden
   - `"synthetic_cfg"` (Präfix `missing-corr:cfg:`) oder `"synthetic_act"` (Präfix `missing-corr:act:`)

**Empfehlung:**

- **Event-Type:** `"config_response_guard_replay"` (additiv, kein Rename)
- **Envelope:** identisch zu bestehenden Events
- **Neues Datenfeld:** `"correlation_id_source": "original" | "request_id_fallback" | "synthetic_cfg"` + `"authority_key"`
- **Broadcast-Call-Site:** innerhalb des bestehenden Replay-Blocks `config_handler.py:186–227` — additives Feld in `replay_payload`, nicht neuer Aufruf
- **Helper** (neu, entweder in `device_response_contract.py` oder `config_handler.py` lokal):
  ```python
  def _infer_correlation_source(
      final_id: str,
      original: str | None,
      request_id: str | None,
  ) -> str:
      if original:
          return "original"
      if request_id:
          return "request_id_fallback"
      if final_id.startswith("missing-corr:cfg:"):
          return "synthetic_cfg"
      return "synthetic_act"
  ```
- **Rate-Limit-Bypass** in `manager.py:49–58` um `"config_response_guard_replay"` ergänzen — das Event markiert terminale Zustände, darf nicht gedrosselt werden.

**Warum konsistent über alle Ebenen:**
- Server nutzt ausschließlich existierende Broadcast-Infra.
- FE bekommt einen Discriminated-Union-Typ dazu — keine Store-Shape-Änderung.
- Kein neuer Persistenz-Pfad, kein DB-Schema-Druck.

---

### 2.4 B-FE-WS-TYPE-01 — Frontend WS-Typ + Soft-Match (PKG-04b)

**Kurzantwort:** Additiver Typ, Wiederverwendung der bestehenden 3-stufigen Fallback-Lookup-Kette. Kein Intent-Schema-Break.

**Code-Belege:**

1. **WS-Service** `El Frontend/src/services/websocket.ts:21–26`:
   ```typescript
   export interface WebSocketMessage {
     type: MessageType | string
     timestamp: number
     data: Record<string, unknown>
     correlation_id?: string
   }
   ```
   Discriminator ist `type`.

2. **Store-Intent-Map** `actuator.store.ts` (L156 ff.):
   `IntentRecord` (L68–86) hat `correlationId`, `requestId`, `state`, `terminalSource`.
   Lookup-Funktionen:
   - `findIntent(type, subjectId, correlationId?)` (L170)
   - `findIntentByCorrelation(type, correlationId)` (L180 ca.)
   - `findIntentByRequest(type, requestId)` (L188–195)

3. **Bestehender Match-Pfad in `handleConfigResponse`** (L911–912):
   ```typescript
   const existing = findIntentByCorrelation('config', correlationId)
     ?? (requestId ? findIntentByRequest('config', requestId) : undefined)
   ```
   D. h. `request_id`-Fallback ist **bereits implementiert**. Soft-Match ist kein neues Konzept.

4. **Timeouts** L146–147 + L871–874:
   `CONFIG_RESPONSE_TIMEOUT_MS=45s`, `CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS=120s` — in `pendingConfigTimeouts`-Map gehalten (L422–443).

**Empfehlung:**

- **Neuer Typ** `ConfigResponseGuardReplayData` additiv in `types/websocket.ts` oder `types/events.ts` — `MessageType`-Union um `"config_response_guard_replay"` erweitern.
- **Neuer Handler** `handleConfigResponseGuardReplay` im selben Store (nicht neuer Store):
  - Nutzt `findIntentByCorrelation` → bei Miss zusätzlich `findIntentByRequest`.
  - Bei Miss + Status `success`/`partial_success`: **silent** (late-arrival nach Timeout — Intent bereits finalisiert).
  - Bei Miss + Status `error`: `notifyContractIssue(...)` mit dem neuen `correlation_id_source`-Kontext.
  - **Timeout-Shortcut:** `clearTimeout(pendingConfigTimeouts.get(key))` aufrufen, damit der Pending-Timer abgekürzt wird.
  - Finalisierung via existierende `finalizeConfigIntent(existing, status, terminalSource)` — `terminalSource="config_response_guard_replay"`.
- **Subscription** im Init-Pfad: `ws.on('config_response_guard_replay', handler)`.

**Warum konsistent:**
- Kein neues Feld in `IntentRecord` (nur ein neuer möglicher `terminalSource`-String-Wert).
- Keine Änderung in `pendingConfigTimeouts`-Lifecycle (nur neuer Clear-Point).
- Der Fallback-Pfad (`correlation → request_id`) ist schon etabliert; wir dokumentieren ihn nur jetzt auch für den Guard-Path.

---

### 2.5 B-MON-PATH-01 — Monitoring-Healthcheck-Filter (PKG-05)

**Code-Belege:**

- Compose-Mount: `docker-compose.yml:238` → `./docker/alloy/config.alloy:/etc/alloy/config.alloy:ro`
- Alloy-Config: `docker/alloy/config.alloy:242–257` enthält bereits einen Mosquitto-Drop-Filter-Block:
  ```river
  stage.match {
    selector = "{compose_service=\"mqtt-broker\"}"
    stage.drop { expression = ".*healthcheck.*"; drop_counter_reason = "mqtt_healthcheck_noise" }
    stage.drop { expression = ".*New connection from 127\\.0\\.0\\.1.*"; drop_counter_reason = "mqtt_healthcheck_noise" }
    stage.drop { expression = ".*Client <unknown> disconnected.*"; drop_counter_reason = "mqtt_healthcheck_noise" }
  ```

**Empfehlung:** Rein additive Erweiterung im selben Match-Block (Pattern aus Nachbarregel):
```river
    stage.drop {
      expression          = ".*New client connected as healthcheck.*"
      drop_counter_reason = "mqtt_healthcheck_noise"
    }
    stage.drop {
      expression          = ".*Client healthcheck disconnected.*"
      drop_counter_reason = "mqtt_healthcheck_noise"
    }
```
Der erste Filter (`.*healthcheck.*`, L247) würde zwar auch die neuen Zeilen fangen — explizite Filter sind aber robuster gegen spätere Generalisierung und liefern klare `drop_counter_reason`-Attribution in Grafana.

### 2.6 B-MQTT-VERSION-01 — Mosquitto-Konfig-Migration (PKG-08)

**Code-Belege:**

- Docker-Image: `docker-compose.yml:51` → `image: eclipse-mosquitto:2` (2.x-Serie).
- Konfig: `docker/mosquitto/mosquitto.conf:79` → `message_size_limit 262144` (deprecated seit 2.0).

**Empfehlung:** 1:1-Drop-in-Ersatz:
- Alte Zeile entfernen: `message_size_limit 262144`
- Neue Zeile: `max_packet_size 262144`

Semantik: identisch (max. erlaubte MQTT-Paketgröße in Bytes). Der Wert bleibt, nur der Options-Name ändert sich.

### 2.7 B-USER-DOCKER-01 — Restart-Procedure (Wellenabschluss)

**Code-Belege (`docker-compose.yml`):**
- `alloy` (L248-250): `depends_on: loki:service_healthy`. Keine Downstream-Service hängen daran.
- `mqtt-broker` (L50): keine `depends_on`. Downstream: `el-servador` (L144-145), `mosquitto-exporter` (L414-415, Profile `monitoring`).
- Persistenz (`docker/mosquitto/mosquitto.conf:36–37`): `persistence true` + `persistence_location /mosquitto/data/` → Retained-Messages/Sessions überleben Restart.

**Empfehlung:**

Für Alloy-Änderung (PKG-05):
```bash
docker compose restart alloy
```
Isoliert, keine Abhängigkeiten.

Für Mosquitto-Änderung (PKG-08):
```bash
docker compose restart mqtt-broker
docker compose restart el-servador
# Falls Profil "monitoring" aktiv:
docker compose restart mosquitto-exporter
```
Kein Datenverlust (Persistenz aktiv). ESP32-Firmware reconnectet automatisch (normaler MQTT-Reconnect-Handler).

---

## 3. Welle-2-Empfehlung (Reihenfolge)

Unter Annahme die obigen Entscheidungen werden übernommen:

1. **Mikro-Commit PKG-02 Follow-up** (fix `result`-Feld + drop redundant log) — reiner Code-Fix, keine neuen Abhängigkeiten.
2. **PKG-01b server-dev** (Queue-Pressure-Handler + Heartbeat-Felder, Prometheus-only) — entsperrt durch Empfehlung 2.2.
3. **PKG-01a esp32-dev** (Emit-Route in Firmware) — parallel zu 2, da disjunkt (ESP32-Firmware).
4. **PKG-04a server-dev** (Replay-Event + `correlation_id_source`) — entsperrt durch Empfehlung 2.3.
5. **PKG-04b frontend-dev** (WS-Typ + Soft-Match + Timeout-Shortcut) — sequenziell nach 4.
6. **PKG-03** (E2E-Latenzmarker) — nach 1-4 (braucht beide Pfade).
7. **PKG-08** (Mosquitto-Config) + **PKG-05** (Healthcheck-Filter) — am Ende; User-Freigabe für Docker-Restart.

---

## 4. Entscheidungs-Matrix (für Robin)

| # | Entscheidung | Empfehlung | Risiko bei Abweichung |
|---|--------------|------------|------------------------|
| 1 | PKG-02: result-Feld korrigieren + redundantes Log entfernen | **Ja, Mikro-Commit** | Grafana-Filter würde mit "expected" semantisch falsch suchen |
| 2 | B-QP-PERSIST-01 | **(a) Prometheus-only** | DB-Bloat, WS-Spam, künstliche Error-Statistik |
| 3 | B-WS-PATH-01 | **Additiver Event-Type `config_response_guard_replay`** | Neuer Pfad würde Rate-Limit-/Routing-Logik dupplizieren |
| 4 | B-FE-WS-TYPE-01 | **Additiver Typ, Wiederverwendung existierender Fallback-Chain** | Intent-Schema-Änderung würde alle bestehenden Flows tangieren |
| 5 | B-MON-PATH-01 | **2 zusätzliche `stage.drop` in `docker/alloy/config.alloy`** | Mosquitto-Config selbst ändern wäre invasiver |
| 6 | B-MQTT-VERSION-01 | **1:1-Rename `message_size_limit → max_packet_size`** | Keine Alternative; Image-Upgrade unnötig (v2.x reicht) |
| 7 | B-USER-DOCKER-01 | **Alloy: isoliert; Mosquitto: mit el-servador-Restart** | Servador-Subscriber reconnectet sonst ggf. erst nach Timeout |

---

*Quelle: Commits `7e7ae245`, `2f0c5e3f`, `d5c77149`, `bd5af70e`, `d943aecd` auf Branch `auto-debugger/work`.
Recherche via drei parallele Explore-Agenten am 2026-04-20, mit Zitaten aus
`src/core/metrics.py`, `src/mqtt/handlers/error_handler.py`, `src/websocket/manager.py`,
`src/mqtt/handlers/config_handler.py`, `src/core/device_response_contract.py`,
`El Frontend/src/services/websocket.ts`, `El Frontend/src/stores/actuator.store.ts`,
`docker-compose.yml`, `docker/alloy/config.alloy`, `docker/mosquitto/mosquitto.conf`.*
