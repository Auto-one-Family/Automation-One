# Fix-N: Backend Heartbeat-Timeout-Konsistenz + MQTT-Bridge-Diagnose

> **Datum:** 2026-03-10
> **Quelle:** T15-V1 Findings F-H1 + F-H2, T14-V6 Finding V6-MQTT
> **Branch:** feat/T13-zone-device-scope-2026-03-09

---

## Aufgabe 1: Heartbeat-Handler Timeout konsolidieren (F-H1)

### Status: ERLEDIGT

**Aenderung:** 2 Stellen in `heartbeat_handler.py` von `timeout=10.0` auf `_command_bridge.DEFAULT_TIMEOUT` geaendert.

| Zeile | Vorher | Nachher |
|-------|--------|---------|
| ~1368 (Zone Push) | `timeout=10.0` | `timeout=_command_bridge.DEFAULT_TIMEOUT` |
| ~1402 (Subzone Push) | `timeout=10.0` | `timeout=_command_bridge.DEFAULT_TIMEOUT` |

**Ansatz:** `_command_bridge` ist bereits als module-level Variable verfuegbar und wird vor Verwendung auf `None` geprueft (Zeile 1317). `DEFAULT_TIMEOUT` ist ein Class-Attribut (`float = 15.0`), das auch ueber Instanzen zugreifbar ist. Kein neuer Import noetig.

**Konsistenz-Check:** `zone_service.py` nutzt `self.command_bridge.DEFAULT_TIMEOUT` korrekt in `assign_zone()` (Zeile 200). Zwei Stellen mit hardcoded `timeout=15.0` existieren noch in `remove_zone()` (Zeile 364) und `_send_transferred_subzones()` (Zeile 667) — funktional identisch, aber nicht ueber Konstante. Cleanup-Empfehlung fuer naechsten Commit.

---

## Aufgabe 3: MQTT-Bridge Connection-State Diagnose (V6-MQTT)

### Status: ERLEDIGT

### 3A. Startup-Diagnose erweitert

**Datei:** `mqtt_command_bridge.py` — `__init__()` erweitert:

```python
logger.info(
    "MQTTCommandBridge initialized (client_connected=%s, broker=%s:%s)",
    self._is_connected(), broker_host, broker_port,
)
```

Broker-Host/Port werden sicher aus `self._mqtt_client.settings.mqtt` ausgelesen.

### 3B. Sende-Verifikation (INFO-Level)

**Datei:** `mqtt_command_bridge.py` — nach erfolgreichem `publish()`:

```python
logger.info(
    "%s command SENT to %s (topic=%s, correlation_id=%s, client_connected=%s)",
    command_type, esp_id, topic, correlation_id, self._is_connected(),
)
```

### 3C. Reconnect-Verhalten — Analyse-Ergebnis

| Eigenschaft | Wert | Quelle |
|-------------|------|--------|
| MQTT Library | paho-mqtt | `client.py:22` |
| Protokoll | MQTT 3.1.1 | `client.py:246` (`protocol=mqtt.MQTTv311`) |
| `reconnect_delay_set()` | min=1s, max=60s | `client.py:270` |
| `loop_start()` | Ja (non-blocking) | `client.py:278` |
| `on_disconnect` Callback | Ja, mit Rate-Limiting | `client.py:576-636` |
| Circuit Breaker | Ja, registered | `client.py:147-170` |
| Offline Buffer | Ja, mit flush on reconnect | `client.py:172-181, 540-551` |

**Fazit:** Das Reconnect-System ist vollstaendig und robust implementiert:
- Auto-Reconnect mit exponential backoff (1s–60s)
- `on_disconnect` loggt Disconnect-Grund (rate-limited auf 1x/Min)
- Circuit Breaker schuetzt vor Ueberlastung
- Offline Buffer puffert Messages waehrend Disconnects
- Buffer wird bei Reconnect automatisch geflusht

**Health-Endpoint Empfehlung:** LOW Priority. Die bestehende Diagnose via Loki-Logs reicht fuer DEV. Ein `/api/v1/system/mqtt-status` Endpoint waere fuer Production sinnvoll (separate Aufgabe).

---

## Aufgabe 2: Zone-ACK-Timeout Root-Cause-Analyse (F-H2)

### Status: ROOT-CAUSE IDENTIFIZIERT

### Root-Cause: Reconnect-Detection zu aggressiv

**Problem:** `RECONNECT_THRESHOLD_SECONDS = 60` (heartbeat_handler.py:46) ist **kleiner** als das Heartbeat-Intervall (~120s).

**Kausalkette:**

```
1. ESP sendet Heartbeat alle ~120s
2. is_reconnect = (offline_seconds > 60) = (120 > 60) = True  ← JEDER Heartbeat
3. _handle_reconnect_state_push() wird getriggert
4. Cooldown STATE_PUSH_COOLDOWN_SECONDS = 120 ≈ Heartbeat-Intervall → kein effektives Rate-Limiting
5. Zone/assign wird gesendet → ACK-Timeout → Warning in Loki
6. Wiederholt sich bei jedem Heartbeat → "alle 2 Minuten"
```

### ACK-Pipeline Verifikation

Die gesamte ACK-Pipeline ist korrekt implementiert:

| Schritt | Implementiert | Datei |
|---------|--------------|-------|
| Server publishes `zone/assign` | Ja | `mqtt_command_bridge.py:89` |
| ESP subscribes `zone/assign` | Ja | `main.cpp:827` |
| ESP extracts `correlation_id` | Ja | `main.cpp:1414-1418` |
| ESP publishes `zone/ack` mit `correlation_id` | Ja | `main.cpp:1609-1629` |
| Server subscribes `kaiser/+/esp/+/zone/ack` | Ja | `main.py:250` |
| Server resolves Future via `resolve_ack()` | Ja | `zone_ack_handler.py:190-213` |

### Topic-Verifikation

| Seite | Topic Format | Match |
|-------|-------------|-------|
| Server publishes | `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | ✓ |
| ESP subscribes | `kaiser/{kaiser_id}/esp/{esp_id}/zone/assign` | ✓ |
| ESP publishes | `kaiser/{kaiser_id}/esp/{esp_id}/zone/ack` | ✓ |
| Server subscribes | `kaiser/+/esp/+/zone/ack` (Wildcard) | ✓ |

### Warum timeout der ACK trotzdem?

**Hypothese (verifizierbar nach Server-Neustart mit neuem Logging):**

Mit dem neuen INFO-Level Logging in `send_and_wait_ack()` wird sichtbar:
- `client_connected=True` → Message wurde gesendet, ESP empfaengt und ACKt normalerweise. Timeout moeglicherweise durch Netzwerk-Latenz oder ESP-seitige Verarbeitungszeit bei gleichzeitigem NVS-Write.
- `client_connected=False` → MQTT-Client nicht verbunden. paho queued die Message, sie wird nie tatsaechlich gesendet. → Fix: MQTT-Broker-Verbindung pruefen.

**Wahrscheinlichste Ursache:** Die Zone-Push-Messages werden korrekt gesendet und der ESP ACKt sie — aber da die `is_reconnect` Erkennung **jeden** Heartbeat als Reconnect wertet, wird EINE funktionierende ACK-Runde gefolgt von der naechsten Push-Runde 120s spaeter. Das Loki-Pattern zeigt die Faelle wo der ACK innerhalb des Timeouts (10s, jetzt 15s) nicht ankommt.

### Empfehlungen

#### Sofort (Backend-Fix, kein Firmware-Auftrag):

1. **RECONNECT_THRESHOLD anpassen:** `RECONNECT_THRESHOLD_SECONDS` von 60 auf **180** erhoehen (1.5x Heartbeat-Intervall). Dann werden nur echte Reconnects (>3 Minuten offline) erkannt, nicht regulaere Heartbeats.

2. **Cooldown erhoehen:** `STATE_PUSH_COOLDOWN_SECONDS` von 120 auf **300** (5 Minuten). Nach einem fehlgeschlagenen Push kein erneuter Versuch fuer 5 Minuten.

3. **Max-Retry-Counter einfuehren:** Nach 3 fehlgeschlagenen Zone-Push-Versuchen fuer denselben ESP pausieren (z.B. 30 Minuten). Verhindert dauerhaftes Loki-Spam.

#### Nicht noetig (Firmware):

ESP32 Zone-ACK ist korrekt implementiert. Kein Firmware-Auftrag noetig fuer die ACK-Logik.

---

## Code-Aenderungen

| Datei | Aenderung |
|-------|-----------|
| `heartbeat_handler.py:1368` | `timeout=10.0` → `timeout=_command_bridge.DEFAULT_TIMEOUT` |
| `heartbeat_handler.py:1402` | `timeout=10.0` → `timeout=_command_bridge.DEFAULT_TIMEOUT` |
| `mqtt_command_bridge.py:44-51` | Startup-Log erweitert um `broker=%s:%s` |
| `mqtt_command_bridge.py:~93` | INFO-Level Log nach erfolgreichem Publish |

## Follow-Up (Backlog)

- [ ] `RECONNECT_THRESHOLD_SECONDS` auf 180 erhoehen
- [ ] `STATE_PUSH_COOLDOWN_SECONDS` auf 300 erhoehen
- [ ] Max-Retry-Counter fuer Zone-Push einfuehren
- [ ] `zone_service.py:364,667` — hardcoded `timeout=15.0` auf `DEFAULT_TIMEOUT` umstellen
- [ ] Health-Endpoint `/api/v1/system/mqtt-status` (LOW prio, Production-Feature)
