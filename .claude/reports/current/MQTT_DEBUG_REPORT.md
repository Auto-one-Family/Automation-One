# MQTT Debug Report — Zone-Assignment Doppel-Sends

**Erstellt:** 2026-04-24  
**Modus:** B (Spezifisch: "Warum werden gleiche zone/assign Assignments wiederholt gesendet?")  
**Quellen:** Statische Code-Analyse (kein Live-Traffic verfügbar, kein System gestartet)  
**Scope:** Zone-Assignment Publish-Pfade, Dedupe-Logik, Cooldown-Guards, AUT-134 Kontext

---

## 1. Zusammenfassung

Es existieren **drei unabhängige Publish-Pfade** für `zone/assign`, deren Cooldown-Mechanismen **nicht koordiniert** sind. Speziell der **Mismatch-Resync (Pfad 2)** im Heartbeat-Handler ignoriert die Aktivität des **Full-State-Push (Pfad 3)** vollständig – obwohl der `MQTTCommandBridge.has_pending()`-Check dafür bereits vorhanden ist. Im AUT-134-Kontext (Config-Resync-Burst nach Count-Mismatch) kann die Kombination aus Config-Flood und fehlender Zone-Koordination zu mehreren zone/assign-Messages auf dem Wire führen, bevor die erste ACK verarbeitet wurde. Fehlende Idempotenz: kein Pfad prüft inhaltlich ob die ESP-seitige Zone bereits identisch ist.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `El Servador/god_kaiser_server/src/services/zone_service.py` | OK | Pfad 1 (REST-API-Assign) |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | OK | Pfad 2+3 (Mismatch-Resync, State-Push) |
| `El Servador/god_kaiser_server/src/services/mqtt_command_bridge.py` | OK | ACK-Bridge, has_pending() |
| `El Servador/god_kaiser_server/src/mqtt/handlers/zone_ack_handler.py` | OK | ACK-Processing |
| `El Servador/god_kaiser_server/src/mqtt/topics.py` | OK | TopicBuilder |
| Live-Traffic / Docker | NICHT VERFÜGBAR | Nur statische Analyse |

---

## 3. Exakter Publish-Pfad (Topic-Kette)

**Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` (QoS 1, retain=false)  
**ACK-Topic:** `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` (QoS 1, ESP→Server)

### TopicBuilder-Kette

```
TopicBuilder.build_zone_assign_topic(device_id)
  → constants.get_topic_with_kaiser_id(MQTT_TOPIC_ESP_ZONE_ASSIGN, esp_id=device_id)
  → "kaiser/{kaiser_id}/esp/{device_id}/zone/assign"
```

Konstante: `MQTT_TOPIC_ESP_ZONE_ASSIGN` (aus `core/constants.py`)

---

## 4. Die drei Publish-Pfade

### Pfad 1 — REST-API-Assign (`zone_service.py::assign_zone()`)

**Trigger:** HTTP-Request auf `PUT /v1/zones/{zone_id}/assign` oder `POST /v1/zones/assign`  
**Datei:** `El Servador/god_kaiser_server/src/services/zone_service.py`, Zeile 177  
**Transport:** `MQTTCommandBridge.send_and_wait_ack()` (ACK-gesteuert, Timeout 15s)  
**Dedupe-Guard:** `device.device_metadata["pending_zone_assignment"]` wird VOR Publish gesetzt  
**Cooldown:** Kein eigener; Guard via `pending_zone_assignment`-Key

```python
topic = TopicBuilder.build_zone_assign_topic(device_id)
# zone_service.py:177 — ACK-gesteuert via MQTTCommandBridge
zone_ack = await self.command_bridge.send_and_wait_ack(
    topic=topic, payload=payload, esp_id=device_id,
    command_type="zone", timeout=ack_timeout
)
```

**Status:** Korrekt implementiert. ACK-Matching via `correlation_id` (UUID4).

---

### Pfad 2 — Mismatch-Resync (`heartbeat_handler.py::_update_esp_metadata()`)

**Trigger:** ESP-Heartbeat meldet `zone_id != db_zone_id` ODER `zone_assigned=false` während DB `zone_id` gesetzt hat  
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, Zeilen 1110–1175  
**Transport:** `MQTTClient.get_instance().publish()` — **fire-and-forget, kein ACK-Wait**  
**Cooldown:** 60s via `device_metadata["zone_resync_sent_at"]`  
**Dedupe-Guard:** Nur für `pending_zone_assignment`-Key (Zeile 1092) — **nicht für State-Push-Aktivität**

```python
# heartbeat_handler.py:1154 — Fire-and-Forget, KEIN ACK-Wait
mqtt_client = MQTTClient.get_instance()
mqtt_client.publish(resync_topic, json.dumps(resync_payload), qos=1)
current_metadata["zone_resync_sent_at"] = now_ts  # Cooldown nach Send gesetzt
```

**Kritisch:** `command_bridge.has_pending(device_id, "zone")` wird hier **nicht** abgefragt, obwohl die Methode existiert (mqtt_command_bridge.py:240).

---

### Pfad 3 — Full-State-Push (`heartbeat_handler.py::_handle_reconnect_state_push()`)

**Trigger:** `is_reconnect=True` (ESP war >60s offline) + ESP hat `zone_id` in DB + kein `config_push_triggered`  
**Datei:** `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`, Zeilen 2065–2177  
**Transport:** `MQTTCommandBridge.send_and_wait_ack()` (ACK-gesteuert, Timeout 15s)  
**Cooldown:** 120s via `device_metadata["full_state_push_sent_at"]` — **gesetzt erst NACH erfolgreichem ACK**  
**Dedupe-Guard:** Zeile 2097: `if now_ts - last_push < STATE_PUSH_COOLDOWN_SECONDS: return`

```python
# heartbeat_handler.py:2114-2127 — ACK-gesteuert
await _command_bridge.send_and_wait_ack(
    topic=zone_topic, payload=zone_payload, esp_id=device_id,
    command_type="zone", timeout=_command_bridge.DEFAULT_TIMEOUT,
)
# Cooldown NUR nach erfolgreichem ACK:
metadata["full_state_push_sent_at"] = now_ts  # Zeile 2124
```

**Kritisch:** Cooldown-Key `full_state_push_sent_at` wird erst nach ACK-Empfang persistiert. Bei ACK-Timeout läuft der Cooldown **nicht** — nächster Reconnect-Heartbeat triggert sofort erneut.

---

## 5. Befunde — Potentielle Doppel-Trigger

### 5.1 Race: Pfad 2 ignoriert aktiven Pfad 3 (State-Push läuft)

**Schwere:** Hoch  
**Detail:** `_handle_reconnect_state_push()` läuft als `asyncio.Task` (create_tracked_task). Zwischen dem Start-Heartbeat (der Pfad 3 triggert) und dem nächsten Heartbeat (~60s später bei normaler Rate, aber auch schneller bei ESP-Boot) ist `full_state_push_sent_at` noch **nicht** in DB, weil der ACK noch aussteht. Kommt nun ein weiterer Heartbeat mit `is_reconnect=False` (ESP war <60s offline) und ESP meldet `zone_id=""` (oder `zone_assigned=false`), dann:

1. `_update_esp_metadata()` evaluiert Zone-Mismatch
2. `is_reconnect=False` → Pfad 3-Guard (Zeile 1086) greift **nicht**
3. `pending_zone_assignment` ist nicht gesetzt (Pfad 3 setzt das nicht) → Guard Zeile 1092 greift nicht
4. `zone_resync_sent_at` ist nicht gesetzt → kein 60s-Cooldown
5. **Pfad 2 feuert zone/assign fire-and-forget**
6. Gleichzeitig ist Pfad 3 noch aktiv via Bridge
7. → **2 zone/assign Messages gleichzeitig auf dem Wire**

**Evidenz:** `MQTTCommandBridge.has_pending()` (mqtt_command_bridge.py:240) existiert für exakt diesen Check, wird aber in Pfad 2 nicht aufgerufen.

---

### 5.2 ACK-Timeout-Loop bei Pfad 3 (Cooldown erst nach ACK)

**Schwere:** Mittel  
**Detail:** Wenn bei `_handle_reconnect_state_push()` der ACK-Timeout auftritt (Zeile 2129: `logger.warning("Zone ACK timeout during state push")`), wird Zeile 2124 (`full_state_push_sent_at = now_ts`) **nicht** ausgeführt. Der `except`-Block kehrt früh zurück ohne Cooldown-Persistierung. Beim nächsten Reconnect-Heartbeat fehlt der Cooldown → Pfad 3 feuert sofort wieder.

**Konsequenz:** Persistente ACK-Timeouts führen zu wiederholten zone/assign-Burst bei jedem Reconnect, ohne Backoff.

---

### 5.3 AUT-134-Korrelation: Config-Resync-Burst + Zone-Mismatch

**Schwere:** Hoch  
**Detail:** Im AUT-134-Kontext (Count-Mismatch nach Heartbeat-Burst):

- Config-Push wird getriggert (`_has_pending_config()` → `config_push_triggered=True`)
- Pfad 3 wird **korrekt deferred** (Zeile 716: `"State push deferred for %s: config push pending"`)
- **ABER:** Der `_update_esp_metadata()`-Aufruf (der Pfad 2 enthält) passiert **vor** dieser Entscheidung und ist **unabhängig** von `config_push_triggered`
- Wenn ESP nach Config-Oversize-Reject (AUT-134: Payload 4164/4096 Bytes) einen neuen Heartbeat sendet mit fehlender Zone (z.B. nach NVS-Verlust), dann:
  1. `config_push_triggered=True` → Pfad 3 deferred ✓
  2. Pfad 2 evaluiert Zone-Mismatch → **Cooldown nicht gesetzt → zone/assign fired**
  3. Jeder weitere Heartbeat im Config-Resync-Burst triggert Pfad 2 (bis 60s-Cooldown greift)

**Evidenz:** AUT-134-Symptom `heartbeat/config Trigger-Burst rund um Count-Mismatch` ist genau das Timing-Fenster, in dem mehrfache zone/assign möglich sind.

---

### 5.4 Fehlende inhaltliche Idempotenz

**Schwere:** Mittel  
**Detail:** Kein Pfad prüft vor dem Publish ob ESP-seitige Zone bereits mit DB-Zone übereinstimmt UND per ACK bestätigt wurde. Der `zone_ack_handler.py` cleared `pending_zone_assignment`, aber weder Pfad 2 noch Pfad 3 setzen diesen Key — weshalb der Guard in Zeile 1092 sie nicht erfasst.

Konkreter Mangel: Es gibt kein `last_confirmed_zone_id`-Feld das nach erfolgreichem ACK gesetzt und vor jedem Resync-Attempt geprüft wird.

---

## 6. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| Live MQTT-Traffic | NICHT VERFÜGBAR (kein System gestartet) |
| Docker-Status | NICHT GEPRÜFT (Analyse aus Code) |
| Loki verfügbar | NICHT GEPRÜFT |
| `MQTTCommandBridge.has_pending()` in Pfad 2 | FEHLT — existiert aber in mqtt_command_bridge.py:240 |
| `config_push_triggered` in `_update_esp_metadata()` | NICHT ÜBERGEBEN — Methode kennt diesen Wert nicht |
| Cooldown Pfad 2 (`zone_resync_sent_at`) | EXISTS — 60s, korrekt nach Send |
| Cooldown Pfad 3 (`full_state_push_sent_at`) | EXISTS — 120s, aber erst nach ACK |
| `pending_zone_assignment` Guard Abdeckung | NUR Pfad 1 (REST-API). Pfad 2 und 3 nicht abgedeckt |

---

## 7. Bewertung & Empfehlung

**Root Cause:** Pfad 2 (Mismatch-Resync, fire-and-forget) und Pfad 3 (State-Push, ACK-gesteuert) operieren mit **völlig unabhängigen Cooldown-Keys** und **kein gegenseitiger Sichtbarkeits-Check**. Der bereits existierende `has_pending()` aus der Bridge wird im Mismatch-Resync nicht konsultiert.

### Minimaler Pattern-konformer Fixpunkt

**Datei:** `heartbeat_handler.py::_update_esp_metadata()`, Zeile ~1144 (vor `if should_resync:`)

**Zwei Checks ergänzen** (nur Analyse, keine Implementierung):

```python
# FIX 1: Bridge-Check vor fire-and-forget
if should_resync and _command_bridge and _command_bridge.has_pending(esp_device.device_id, "zone"):
    should_resync = False
    logger.debug(
        "Zone resync skipped for %s: zone command already pending in bridge",
        esp_device.device_id,
    )

# FIX 2: Config-Push-Gate (AUT-134 Kontext)
# is_config_push_pending müsste als Parameter oder via _config_push_pending_esps-Set geprüft werden
if should_resync and esp_device.device_id in self._config_push_pending_esps:
    should_resync = False
    logger.debug(
        "Zone resync skipped for %s: config push pending (AUT-134 gate)",
        esp_device.device_id,
    )
```

**Hinweis zu Fix 2:** `_config_push_pending_esps` ist ein Set auf der `HeartbeatHandler`-Instanz. Der Aufruf von `_update_esp_metadata` ist eine Methode der gleichen Klasse, kann also direkt zugreifen.

**Optionaler Fix 3 (Pfad 3 Cooldown-Robustheit):** `full_state_push_sent_at` optimistisch bereits beim Send setzen (nicht erst nach ACK), mit einem separaten `full_state_push_acked_at` für den Erfolgsfall. Verhindert ACK-Timeout-Loops.

### Priorisierung

| Fix | Scope | Aufwand | Risiko |
|-----|-------|---------|--------|
| Fix 1 (Bridge-Check in Pfad 2) | 3 Zeilen in `_update_esp_metadata()` | Minimal | Sehr niedrig |
| Fix 2 (Config-Push-Gate) | 3 Zeilen in `_update_esp_metadata()` | Minimal | Sehr niedrig |
| Fix 3 (Cooldown optimistisch) | `_handle_reconnect_state_push()` | Klein | Niedrig |

**Keine der Fixes** erfordert Schema-Änderungen, API-Änderungen oder neue Topics.
