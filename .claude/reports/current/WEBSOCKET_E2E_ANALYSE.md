# WebSocket E2E Tests – Implementierungsdokumentation

**Datum**: 2026-02-06
**Status**: ✅ IMPLEMENTIERT
**Agent**: WebSocket-E2E-Analyst

---

## Übersicht

| Aspekt | Status |
|--------|--------|
| E2EWebSocketClient Klasse | ✅ Implementiert ([conftest.py:1018-1211](El Servador/god_kaiser_server/tests/e2e/conftest.py#L1018-L1211)) |
| ws_client Fixture | ✅ Implementiert ([conftest.py:1214-1234](El Servador/god_kaiser_server/tests/e2e/conftest.py#L1214-L1234)) |
| test_websocket_events.py | ✅ Implementiert (7 Test-Klassen, 499 Zeilen) |
| Skip-Marker in test_logic_engine | ⚠️ Kann reaktiviert werden |

---

## 1. Architektur-Dokumentation

### 1.1 Auth-Kette: REST → JWT → WebSocket

**Vollständiger Flow:**

```
1. REST Login: POST /api/v1/auth/login
   - Request: {"username": "Robin", "password": "Robin123!"}
   - Response: {"tokens": {"access_token": "eyJ..."}}

2. JWT Access Token extrahieren
   - E2EAPIClient._auth_token speichert den Token
   - [conftest.py:319-321](El Servador/god_kaiser_server/tests/e2e/conftest.py#L319-L321)

3. WebSocket Connection mit Token als Query-Parameter
   - URL: ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}
   - [realtime.py:53-60](El Servador/god_kaiser_server/src/api/v1/websocket/realtime.py#L53-L60)
```

**Relevante Dateien:**

| Datei | Funktion | Zeilen |
|-------|----------|--------|
| [conftest.py](El Servador/god_kaiser_server/tests/e2e/conftest.py#L292-L368) | `E2EAPIClient.authenticate()` - REST Login | L292-368 |
| [security.py](El Servador/god_kaiser_server/src/core/security.py#L53-L94) | `create_access_token()` - JWT Erstellung | L53-94 |
| [security.py](El Servador/god_kaiser_server/src/core/security.py#L137-L170) | `verify_token()` - JWT Validierung | L137-170 |
| [realtime.py](El Servador/god_kaiser_server/src/api/v1/websocket/realtime.py#L53-L113) | WebSocket Auth - Token aus Query-Param | L53-113 |

### 1.2 WebSocket-Endpoint Implementation

**Endpoint:** `/api/v1/ws/realtime/{client_id}?token={jwt_token}`

**Server-seitige Auth-Logik ([realtime.py:53-116](El Servador/god_kaiser_server/src/api/v1/websocket/realtime.py#L53-L116)):**

```python
# 1. Token aus Query-Parameter extrahieren
query_params = dict(websocket.query_params)
token = query_params.get("token")

# 2. Token validieren
payload = verify_token(token, expected_type="access")
user_id_str = payload.get("sub")

# 3. Token-Blacklist prüfen
if await blacklist_repo.is_blacklisted(token):
    await websocket.close(code=4001, reason="Token has been revoked")

# 4. User existiert & ist aktiv
user = await user_repo.get_by_id(user_id)
if not user.is_active:
    await websocket.close(code=4001, reason="User account is disabled")

# 5. Connection akzeptieren
await manager.connect(websocket, client_id)
```

**WebSocket-Manager ([manager.py:179-261](El Servador/god_kaiser_server/src/websocket/manager.py#L179-L261)):**
- `broadcast()` L179-240 - Sendet Events an alle subscribed Clients
- `broadcast_threadsafe()` L242-261 - Thread-safe für MQTT-Callbacks
- Subscription-Filter: `types`, `esp_ids`, `sensor_types`

---

## 2. WebSocket-Event-Inventar (Vollständig)

**Quelle:** [WEBSOCKET_EVENTS.md](.claude/reference/api/WEBSOCKET_EVENTS.md)
**Gesamt:** 26 Event-Typen

### ESP/Device Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `esp_health` | Heartbeat | `esp_id, status, uptime, heap_free, wifi_rssi` |
| `device_discovered` | Heartbeat (neues ESP) | `esp_id, discovered_at, firmware_version, pending` |
| `device_rediscovered` | Heartbeat (offline→online) | `esp_id, previous_status, heap_free, wifi_rssi` |
| `device_approved` | Admin-Aktion | `device_id, approved_by, zone_id` |
| `device_rejected` | Admin-Aktion | `device_id, rejected_by, reason` |

### Sensor Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `sensor_data` | MQTT sensor/{gpio}/data | `esp_id, gpio, sensor_type, value, unit, quality` |
| `sensor_health` | Maintenance Job | `esp_id, gpio, health_status, last_reading` |

### Actuator Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `actuator_status` | MQTT actuator/{gpio}/status | `esp_id, gpio, state, pwm_value, runtime_ms` |
| `actuator_command` | REST /actuators/command | `esp_id, gpio, command, value, issued_by` |
| `actuator_command_failed` | Safety/MQTT Fehler | `esp_id, gpio, command, error` |
| `actuator_response` | MQTT actuator/{gpio}/response | `esp_id, gpio, command, success, error_code` |
| `actuator_alert` | MQTT actuator/{gpio}/alert | `esp_id, gpio, alert_type, severity, message` |

### Config Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `config_response` | ESP-ACK | `esp_id, config_id, config_applied` |
| `config_published` | Config gesendet | `esp_id, config_keys, correlation_id` |
| `config_failed` | Publish-Fehler | `esp_id, config_keys, error` |

### Zone Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `zone_assignment` | Zone ACK | `esp_id, zone_id, zone_name, success` |

### Logic/Automation Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `logic_execution` | Rule ausgeführt | `rule_id, rule_name, success, duration_ms` |
| `notification` | Rule-Notification | `title, message, priority, rule_id` |

### Sequence Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `sequence_started` | Sequence Start | `sequence_id, rule_id, total_steps` |
| `sequence_step` | Step Progress | `sequence_id, step, progress_percent, status` |
| `sequence_completed` | Sequence Ende | `sequence_id, success, duration_seconds` |
| `sequence_error` | Sequence Fehler | `sequence_id, error_code, message` |
| `sequence_cancelled` | Sequence Abbruch | `sequence_id, reason` |

### System Events

| Event | Trigger | Payload (Key Fields) |
|-------|---------|---------------------|
| `system_event` | Maintenance | `event_type, message, details` |
| `error_event` | ESP Error | `esp_id, error_code, category, message` |
| `events_restored` | Backup Restore | `backup_id, events_count, source` |

**WebSocket Message Format:**
```json
{
  "type": "sensor_data",
  "timestamp": 1706787600,
  "data": {
    "esp_id": "ESP_12AB34CD",
    "gpio": 4,
    ...
  }
}
```

---

## 3. Implementierte Test-Infrastruktur

### 3.1 E2EWebSocketClient Klasse

**Location:** [conftest.py:1018-1211](El Servador/god_kaiser_server/tests/e2e/conftest.py#L1018-L1211)

```python
class E2EWebSocketClient:
    """WebSocket client helper for E2E tests."""

    def __init__(self, config: E2EConfig, auth_token: str): ...

    @property
    def ws_url(self) -> str:
        """Build WebSocket URL with authentication token."""
        # URL: ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}

    async def connect(self, timeout: float = 10.0) -> bool: ...
    async def disconnect(self) -> None: ...
    async def subscribe(self, filters: dict) -> None: ...
    async def wait_for_event(self, event_type: str, timeout: float, match_fn: callable) -> Optional[dict]: ...
    async def wait_for_events(self, event_types: list, timeout: float, min_count: int) -> list: ...

    @property
    def received_messages(self) -> list: ...
    def clear_messages(self) -> None: ...
```

### 3.2 ws_client Fixture

**Location:** [conftest.py:1214-1234](El Servador/god_kaiser_server/tests/e2e/conftest.py#L1214-L1234)

```python
@pytest_asyncio.fixture
async def ws_client(
    e2e_config: E2EConfig,
    api_client: E2EAPIClient
) -> AsyncGenerator[E2EWebSocketClient, None]:
    """Create a WebSocket client for E2E tests with authentication."""
    if not api_client._auth_token:
        pytest.skip("WebSocket tests require authenticated API client")

    client = E2EWebSocketClient(e2e_config, api_client._auth_token)
    # ... connect, yield, disconnect
```

### 3.3 Dependencies

| Package | Version | Location |
|---------|---------|----------|
| `websockets` | ^12.0 | [pyproject.toml:44](El Servador/god_kaiser_server/pyproject.toml#L44) |
| `aiohttp` | ^3.9.3 | [pyproject.toml:41](El Servador/god_kaiser_server/pyproject.toml#L41) |

---

## 4. Implementierte Tests

### 4.1 test_websocket_events.py

**Location:** [test_websocket_events.py](El Servador/god_kaiser_server/tests/e2e/test_websocket_events.py)
**Zeilen:** 499
**Test-Klassen:** 7

| Test-Klasse | Test-Methode | Flow |
|-------------|--------------|------|
| `TestSensorDataWebSocketEvent` | `test_sensor_data_triggers_ws_event` | MQTT sensor → WS sensor_data |
| `TestDeviceDiscoveredWebSocketEvent` | `test_device_discovered_triggers_ws_event` | New ESP heartbeat → WS device_discovered |
| `TestActuatorResponseWebSocketEvent` | `test_actuator_response_triggers_ws_event` | MQTT response → WS actuator_response |
| `TestActuatorAlertWebSocketEvent` | `test_actuator_alert_triggers_ws_event` | MQTT alert → WS actuator_alert |
| `TestWebSocketAuthRejection` | `test_ws_connection_without_auth_rejected` | No token → 4001 rejection |
| `TestWebSocketEventFiltering` | `test_ws_receives_only_subscribed_events` | Filter → Only subscribed events |
| `TestESPHealthWebSocketEvent` | `test_esp_health_triggers_ws_event` | ESP heartbeat → WS esp_health |

### 4.2 Test-Ausführung

```bash
cd "El Servador/god_kaiser_server"
poetry run pytest tests/e2e/test_websocket_events.py --e2e -v
```

**Voraussetzungen:**
- Running Server (uvicorn)
- MQTT Broker (Mosquitto)
- PostgreSQL Database

---

## 5. WS-Referenzen in anderen E2E-Tests

| Test-Datei | WS-Fixture nutzbar? | Status | Hinweis |
|------------|---------------------|--------|---------|
| [test_sensor_workflow.py](El Servador/god_kaiser_server/tests/e2e/test_sensor_workflow.py) | ✅ Ja | Docstring erwähnt WS | Kann ws_client nutzen |
| [test_actuator_direct_control.py](El Servador/god_kaiser_server/tests/e2e/test_actuator_direct_control.py) | ✅ Ja | Kommentar L295 | Kann ws_client nutzen |
| [test_actuator_alert_e2e.py](El Servador/god_kaiser_server/tests/e2e/test_actuator_alert_e2e.py) | ✅ Ja | Kommentar L469-470 | Kann ws_client nutzen |
| [test_logic_engine_real_server.py](El Servador/god_kaiser_server/tests/e2e/test_logic_engine_real_server.py) | ⚠️ Skip | L1009-1017 skip-Marker | **Kann reaktiviert werden** |
| [test_real_server_scenarios.py](El Servador/god_kaiser_server/tests/e2e/test_real_server_scenarios.py) | ⚠️ Legacy | L571-605 ohne Token | Sollte ws_client nutzen |

### 5.1 Veralteter Skip-Marker

**Location:** [test_logic_engine_real_server.py:1009-1017](El Servador/god_kaiser_server/tests/e2e/test_logic_engine_real_server.py#L1009-L1017)

```python
@pytest.mark.skip(reason="WebSocket E2E requires authenticated WS connection - skipped for now")
async def test_websocket_broadcast(self):
    """E2E: Rule execution triggers WebSocket broadcast."""
    pass
```

**Status:** Dieser Skip-Marker ist **VERALTET** - die WS-Infrastruktur existiert jetzt. Der Test kann implementiert werden.

### 5.2 Legacy-Code in test_real_server_scenarios.py

**Location:** [test_real_server_scenarios.py:571-605](El Servador/god_kaiser_server/tests/e2e/test_real_server_scenarios.py#L571-L605)

```python
# VERALTET: Verbindung OHNE Token!
async with session.ws_connect(
    e2e_config.ws_url,  # ws://localhost:8000/ws (OHNE ?token=...)
    timeout=5.0
) as ws:
```

**Empfehlung:** Dieser Test sollte auf das `ws_client` Fixture umgestellt werden.

---

## 6. Gewählte Lösung: Token als Query-Parameter

### 6.1 Ansatz-Bewertung

| Ansatz | Server-kompatibel? | Empfehlung |
|--------|-------------------|------------|
| **A: Token als Query-Parameter** | ✅ JA | ✅ **IMPLEMENTIERT** |
| B: Token als Header | ❌ NEIN | ⛔ Nicht kompatibel |
| C: Cookie-Auth | ❌ NEIN | ⛔ Nicht kompatibel |
| D: Subprotocol | ❌ NEIN | ⛔ Nicht kompatibel |

### 6.2 URL-Format

```
ws://localhost:8000/api/v1/ws/realtime/{client_id}?token={jwt_token}
```

**Beispiel (aus E2EWebSocketClient):**
```python
base_url = self.config.server_url.replace("http://", "ws://").replace("https://", "wss://")
return f"{base_url}/api/v1/ws/realtime/{self._client_id}?token={self.auth_token}"
```

---

## 7. Nächste Schritte (Optional)

| Aufgabe | Priorität | Aufwand |
|---------|-----------|---------|
| Skip-Marker in test_logic_engine entfernen und Test implementieren | Niedrig | 30 min |
| test_real_server_scenarios.py auf ws_client umstellen | Niedrig | 15 min |
| WS-Assertions zu bestehenden Tests hinzufügen | Niedrig | 1-2 Std |
| Weitere Event-Typen testen (config_response, zone_assignment, etc.) | Optional | 2-3 Std |

---

## 8. Fazit

Die WebSocket E2E Test-Infrastruktur ist **vollständig implementiert**:

- ✅ `E2EWebSocketClient` Klasse mit allen Methoden (connect, subscribe, wait_for_event, etc.)
- ✅ `ws_client` Fixture mit Auth-Token-Integration
- ✅ 7 Test-Klassen in test_websocket_events.py
- ✅ Alle geplanten Tests (sensor_data, device_discovered, actuator_response, actuator_alert, auth_rejection, filtering, esp_health)
- ✅ Dependencies bereits in pyproject.toml vorhanden

**Test-Ausführung:**
```bash
cd "El Servador/god_kaiser_server"
poetry run pytest tests/e2e/test_websocket_events.py --e2e -v
```
