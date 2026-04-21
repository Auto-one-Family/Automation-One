# CORRELATION-MAP — INC-2026-04-20-offline-mode-observability-hardening

> **Clustering-Reihenfolge (auto-debugger.md 1.3 Schritt 3):**
> 1) Notification-Felder (correlation_id, fingerprint, parent_notification_id) — **nicht im Fenster belegt**
> 2) HTTP `X-Request-ID` / `request_id` — **nicht im Fenster belegt** (Offline-Mode = kein HTTP-Ingress)
> 3) `esp_id` + Zeitfenster — **Primaerschluessel dieses Laufs**
> 4) MQTT-Log-Zeilen mit synthetischer CID (`missing-corr:cfg:...`, `missing-corr:act:...`)
> 5) Titel / Dedup-Schluessel (Rule-Name `TestTimmsRegen`) — **nur zuletzt**

---

## A. Primaere Zeitleiste (esp_id=ESP_EA5484, Fenster 16:59:51 — 17:02:51 UTC)

| Zeit (UTC) | Schicht | Quelle (Pfad / Topic) | Ereignis | Korrelations-Feld(er) |
|------------|---------|------------------------|----------|------------------------|
| 16:59:51 | Server | `conflict_manager.py:252` | `Conflict on ESP_EA5484:14 ... blocked ... (lower priority 50 vs 10)` | esp_id + actuator_key + rule_id |
| 16:59:51 | Server | `conflict_manager.py:262` | `Actuator conflict for rule TestTimmsRegen ... first_wins` | rule_id |
| 17:00:38 | Server | `config_handler.py` | `Config gebaut und publiziert (2 offline_rules)` | esp_id + config_type |
| 17:00:39 | Server | Intent-Pipeline | `flow=config outcome=accepted` -> `outcome=persisted` | correlation_id (falls vorhanden) |
| 17:00:39 | Server | `config_handler.py:168` | `Skipping stale config_response due to terminal authority guard` | authority_key (siehe Abschnitt C) |
| 17:02:40 | ESP32 | Topic `system/error` (QoS0 oder Error-Topic) | `error_code=4062`, `message="Publish queue full"` | esp_id + error_code |
| 17:02:40 | Server | `mqtt/handlers/error_handler.py` | `Error event saved ... error_code=4062` | esp_id + error_code |
| 17:02:40 | Server | Intent-Pipeline (GPIO 14) | `accepted` -> `applied` | intent_id + esp_id + gpio=14 |
| 17:02:40 | Server | Intent-Pipeline (GPIO 25) | `accepted` -> `applied` | intent_id + esp_id + gpio=25 |
| 17:02:40 | DB (PostgreSQL) | Table `mqtt_errors` | Row `mqtt_error` mit `failed`/Warntext | id + esp_id + error_code |
| 17:02:40+ | ESP32 Heartbeat | Heartbeat-Topic | `publish_queue_shed_count` 0->1, `publish_queue_drop_count` 0->1, `publish_queue_hwm` = 9 | esp_id + heartbeat seq |
| 17:02:51 | Server | Actuator-Response (GPIO 14) | Terminal state published | intent_id |
| 17:02:51 | Server | Actuator-Response (GPIO 25) | Terminal state published | intent_id |

---

## B. MQTT-Topics und Handler-Zuordnung

| Topic-Muster (schematisch, kein Secret) | Richtung | Handler (Pfad) | Relevanz |
|------------------------------------------|----------|----------------|----------|
| `kaiser/+/esp/+/system/error` | ESP32 -> Server | `mqtt/handlers/error_handler.py` | 4062-Events |
| `kaiser/+/esp/+/heartbeat` | ESP32 -> Server | `mqtt/handlers/heartbeat_handler.py` | Queue-Telemetrie (publish_queue_fill/hwm/shed/drop) |
| `kaiser/+/esp/+/config` | Server -> ESP32 | publish via `config_handler.py` | offline_rules Publish |
| `kaiser/+/esp/+/config_response` | ESP32 -> Server | `mqtt/handlers/config_handler.py` | Terminal-Authority-Guard, stale-Skip |
| `kaiser/+/esp/+/actuator/+/command` | Server -> ESP32 | publish via `actuator_handler.py` | Intent-Pipeline |
| `kaiser/+/esp/+/actuator/+/response` | ESP32 -> Server | `mqtt/handlers/actuator_response_handler.py` | Terminal-State |
| `kaiser/+/esp/+/lwt` | Mosquitto LWT | `mqtt/handlers/lwt_handler.py` | Offline-Erkennung |

**Hinweis:** Genaue Topic-Strings ueber `TopicBuilder` zu bauen (nicht hardcoded) — siehe
`api-rules.md` Abschnitt 9.

---

## C. Config-Authority-Guard — Detailzuordnung

**Server (`config_handler.py:138-168`):**

| Schritt | Code-Stelle | Verhalten |
|---------|-------------|-----------|
| 1 | `_build_terminal_authority_key(...)` (L138,348) | Schluessel aus `esp_id` + `config_type` + fenster-spezifischen Feldern |
| 2 | `upsert_terminal_event_authority(...)` (L147) | Idempotenz-Check; Rueckgabe `(_, was_stale)` |
| 3 | `if was_stale:` (L162) + `log Skipping stale config_response due to terminal authority guard` (L168) | Frueh-Return VOR WS-Broadcast -> UI sieht kein terminales Event ueber diesen Pfad |

**Frontend (`actuator.store.ts:875-901`):**

| Schritt | Code-Stelle | Verhalten |
|---------|-------------|-----------|
| 1 | `handleConfigResponse({ data })` (L875) | Erwartet matchbaren `correlation_id` |
| 2 | Wenn `correlation_id` fehlt: `notifyContractIssue({ details: "config_response ohne correlation_id ist nicht finalisierbar" })` (L892-894) | Contract-Issue, kein terminaler Match |
| 3 | Timeout-Pfad: `CONFIG_RESPONSE_TIMEOUT_MS` (L146) = 45s ODER `CONFIG_RESPONSE_TIMEOUT_WITH_OFFLINE_RULES_MS` (L147) = 120s | Terminal-Timeout-Fallback |

**Server-Correlation-Canonicalisation (`device_response_contract.py:141-154`):**

| Fall | Code-Stelle | Generierter Key |
|------|-------------|-----------------|
| `correlation_id` fehlt, `request_id` vorhanden | L143-147 | `correlation_id = request_id`, `contract_issues.append("correlation_id=missing_used_request_id")` |
| Beide fehlen (Config) | L148-155 | Synthetic: `missing-corr:cfg:{esp_id}:{config_type}:{ts_part}:{seq_token}` |
| Beide fehlen (Actuator) | L260-263 | Synthetic: `missing-corr:act:{topic_esp_id}:{ts}` |

**Kante (Cross-Layer):** Wenn Server den synthetischen Key nutzt, kann das Frontend diesen
nicht gegen einen im UI pending Intent matchen. Folge: UI laeuft in Timeout oder Contract-Issue,
waehrend Server bereits terminal entschieden hat.

---

## D. Publish-Queue-Pressure — Telemetriekette

**Firmware (`publish_queue.cpp`):**

| Zaehler / Struct-Feld | Code-Stelle | Erhoehung |
|-----------------------|-------------|-----------|
| `g_pq_shed_count` | L13, L133 | Bei proaktivem Sheden (Non-Critical) |
| `g_pq_drop_count` | L14, L102, L157 | Bei voller Queue oder OOM |
| `stats.shed_count` / `stats.drop_count` | L40-41 | Telemetry-Export an Heartbeat |
| `ERROR_TASK_QUEUE_FULL (4062)` | L104, L159 | Logged via `errorTracker.logApplicationError` |

**Firmware (`mqtt_client.cpp`):**

| Ereignis | Code-Stelle | Verhalten |
|----------|-------------|-----------|
| `msg_id == -2` aus `esp_mqtt_client_publish` | L637-638 | `MQTT Outbox full, message dropped: <topic>` |
| Drop-Kategorisierung in Telemetrie | L1134 | `drop_code = (msg_id == -2) ? "PUBLISH_OUTBOX_FULL" : "EXECUTE_FAIL"` |
| Heartbeat-Payload | L1409 | Publisht `publish_outbox_drop_count` |

**Server-Mapping (`esp32_error_mapping.py:1613-1626`):**

```
4062: {
    "category": "APPLICATION",
    "severity": "WARNING",
    "message_de": "FreeRTOS Task-Queue voll",
    ...
}
```

**Drift:** Firmware emittiert 4062 konkret aus Publish-Pfad, Mapping ist semantisch zu grob
("FreeRTOS Task-Queue voll" statt "MQTT Publish-Pfad unter Burst-Druck").

---

## E. Rule-Arbitration — Deterministisches first_wins

**Server (`conflict_manager.py`):**

| Zeile | Code | Bedeutung |
|-------|------|-----------|
| L29 | `FIRST_WINS = "first_wins"` | Enum `ConflictResolution` |
| L241 | `resolution = ConflictResolution.FIRST_WINS` (Gleichstand) | Tie-Break per `rule_id` (nicht FIFO-Zufall) |
| L249 | `resolution = ConflictResolution.FIRST_WINS` | Bei niedrigerer Prioritaet des neuen |
| L252 | `Conflict on {actuator_key}: {rule_id} blocked by {existing_lock.rule_id} (lower priority {new_prio} vs {existing_prio})` | Warn-Log (aktuell ohne "expected/deterministic" Label) |
| L262 | `message=f"Conflict on {actuator_key}: {resolution.value}"` | Wird als Error-Event / Log emittiert |

---

## F. Monitoring-Signal vs. Echter Fehler

| Signal | Quelle | Klassifikation | Handlung |
|--------|--------|-----------------|----------|
| `New client connected as healthcheck` + `Client healthcheck disconnected` alle 30s | `automationone-mqtt` | **Erwartet** (Healthcheck-Client trennt aktiv) | Monitoring-Filter (PKG-05) |
| `ERROR|Traceback|Exception` in Grafana-Query-URL | `automationone-grafana` | **Erwartet** (Alert-Query-Muster, `statusCode=200`) | Keine Aktion, ggf. Doku |
| `error inspecting Docker container ... connection reset by peer` | `automationone-alloy` | **Transient** (Container-Neustartfenster) | Kein dauerhafter Pipeline-Ausfall |
| `message_size_limit` -> `max_packet_size` | Mosquitto-Startlog | **Technical Debt** | PKG-08 |
| `Skipping stale config_response due to terminal authority guard` | `config_handler.py:168` | **Erwartet** (Idempotenz-Schutz) | Labelling als `expected_guard` (PKG-06) |
| `Conflict on ... blocked by ...` | `conflict_manager.py:252` | **Erwartet** (deterministische Arbitration) | Labelling als `rule_arbitration expected` (PKG-02) |
| `Publish queue full` / `ERROR_TASK_QUEUE_FULL (4062)` | `publish_queue.cpp:159` | **Betriebszustand unter Burst-Druck** (nicht Fehler im engeren Sinn) | Kontext-Anreicherung (PKG-01) + 4062-Mapping (PKG-07) |

---

## G. Nicht-verfuegbare Korrelations-Kanten (Dokumentation)

- **HTTP `X-Request-ID` / `request_id`:** Offline-Mode hat keinen REST-Ingress; Felder sind
  im 10-Min-Fenster nicht belegt. Falls in Runde 2 REST-/UI-Trigger nachgereicht werden,
  Kettenmarker `command -> applied -> published -> rendered` ist zu instrumentieren
  (PKG-03).
- **ISA-18.2 Notification-Kette:** Im Fenster keine Notifications in Inbox. **Nicht** mit
  WS `error_event` vermischen (auto-debugger.md 1.4).
