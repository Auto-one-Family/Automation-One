# Implementierungsauftrag T13-Phase2: MQTTCommandBridge — ACK-gesteuerte MQTT-Kommunikation

> **Bezug:** T13-System-Konsolidierung, Phase 2 (Roadmap Phase 2.1–2.4)
> **Typ:** IMPLEMENTIERUNG — Code schreiben, testen, committen
> **Prioritaet:** CRITICAL — loest Race Condition bei Zone-Wechsel + Subzone-Transfer
> **Voraussetzung:** Phase 1 (4 Bug-Fixes) ist abgeschlossen
> **Geschaetzter Umfang:** ~10-12 Stunden, 11 Schritte, 6 Dateien + 1 neue + Tests
> **Datum:** 2026-03-09

---

## Inhaltsverzeichnis

1. [Ziel und Problemstellung](#1-ziel-und-problemstellung)
2. [Systemkontext](#2-systemkontext)
3. [Was NICHT gemacht wird](#3-was-nicht-gemacht-wird)
4. [Schritt 1–2: MQTTCommandBridge Service + Tests](#4-schritt-1-2)
5. [Schritt 3–5: ACK-Handler + main.py Registration](#5-schritt-3-5)
6. [Schritt 6–9: zone_service Umstellung + Subzone-MQTT](#6-schritt-6-9)
7. [Schritt 10: Heartbeat pending-Check](#7-schritt-10)
8. [Schritt 11: Integrationstests](#8-schritt-11)
9. [Akzeptanzkriterien Gesamtsystem](#9-akzeptanzkriterien)
10. [Risiken und Fallbacks](#10-risiken)

---

<a name="1-ziel-und-problemstellung"></a>
## 1. Ziel und Problemstellung

### Was gebaut wird

Ein neuer Service **MQTTCommandBridge** der kritische MQTT-Operationen (Zone-Wechsel, Subzone-Transfer) von fire-and-forget auf ACK-gesteuertes Warten umstellt. Die Bridge nutzt `asyncio.Future` um auf ACK-Nachrichten vom ESP32 zu warten bevor der naechste Schritt ausgefuehrt wird.

### Das Problem das geloest wird

**Race Condition bei Zone-Wechsel mit Subzone-Transfer (Severity: CRITICAL)**

Wenn ein ESP32 die Zone wechselt (z.B. Zone A → Zone B) und dabei Subzones transferiert werden sollen, muss der Server zwei MQTT-Nachrichten senden:

1. `zone/assign` — ESP soll neue Zone uebernehmen
2. `subzone/assign` — ESP soll Subzones in der neuen Zone registrieren

Das Problem: Die ESP32-Firmware validiert bei `subzone/assign` ob die `parent_zone_id` mit der aktuellen Zone des ESP uebereinstimmt. Wenn die Subzone-Nachricht ankommt bevor der ESP die neue Zone in seinen NVS-Speicher geschrieben hat (dauert 10-50ms), wird sie abgelehnt:

```
ESP hat noch zone_id = A in RAM/NVS
subzone/assign kommt mit parent_zone_id = B
Firmware-Validierung: B != A → ABGELEHNT (ACK error "parent_zone_id mismatch")
```

**Zusaetzliches Problem (aus Analyse entdeckt):** Der aktuelle Code sendet bei Zone-Transfer ueberhaupt KEIN `subzone/assign` an den ESP. Die Methode `_handle_subzone_strategy()` aendert nur die DB (`parent_zone_id = neue_zone`), aber der ESP erfaehrt nie davon. Nach einem Zone-Transfer hat der ESP die neue Zone, aber die alte Subzone-Konfiguration im NVS.

### Die Loesung

1. **MQTTCommandBridge** wartet nach `zone/assign` auf den Zone-ACK vom ESP
2. Erst NACH dem ACK (= ESP hat neue Zone in NVS) werden `subzone/assign` Nachrichten gesendet
3. `parent_zone_id` wird in den Subzone-Nachrichten **LEER** gesendet — die Firmware setzt automatisch ihre aktuelle Zone ein (sicher, keine Race Condition)
4. Ein `pending_zone_assignment`-Flag im Heartbeat-Handler verhindert falsche Mismatch-Warnings waehrend eines laufenden Wechsels

---

<a name="2-systemkontext"></a>
## 2. Systemkontext

### AutomationOne 3-Schichten-Architektur

- **El Trabajante (ESP32, C++):** Sensoren auslesen, Aktoren schalten, Befehle vom Server empfangen. Bewusst "dumm" — alle Intelligenz auf dem Server.
- **El Servador (FastAPI, Python):** Zentrale Verarbeitung, PostgreSQL-DB, Logic Engine, MQTT-Broker (Mosquitto).
- **El Frontend (Vue 3):** Dashboard, Konfiguration. Nicht betroffen von diesem Auftrag.

### MQTT-Stack (IST-Zustand)

| Komponente | Details |
|-----------|---------|
| **Library** | `paho-mqtt` (NICHT gmqtt, NICHT fastapi-mqtt) |
| **Protokoll** | MQTT 3.1.1 (kein MQTT 5, kein natives Correlation Data) |
| **Client** | `src/mqtt/client.py` → Klasse `MQTTClient`, Singleton via `_instance` / `get_instance()` |
| **Thread-Modell** | paho laeuft in eigenem Background-Thread (`loop_start()`). MQTT-Handler werden via `run_coroutine_threadsafe()` auf dem FastAPI Event-Loop dispatched. |
| **Publisher** | `src/mqtt/publisher.py` → Klasse `Publisher`, hat `_publish_with_retry()` mit Exponential Backoff |
| **QoS** | Zone/Subzone: QoS 1 (`QOS_SENSOR_DATA` aus `core/constants.py:204`). Aktoren: QoS 2. Heartbeat: QoS 0 |

**Kritisch:** Zone- und Subzone-Services umgehen `Publisher._publish_with_retry()` und rufen direkt `self.publisher.client.publish()` auf — kein Retry fuer diese Operationen. Die Bridge behebt das indem sie ACK-Waiting statt Retry einfuehrt.

### MQTTClient.publish() Signatur

```python
# src/mqtt/client.py:413
def publish(self, topic: str, payload: str, qos: int = 1, retain: bool = False) -> bool:
```

- **Synchron** (nicht async) — blockiert nur kurz, paho buffert intern
- **Payload als JSON-String** (bereits serialisiert, NICHT als dict)
- **Circuit Breaker:** `self._circuit_breaker.allow_request()` prueft vor Publish
- **Offline Buffer:** Bei Disconnect wird Message in `MQTTOfflineBuffer` gepuffert
- **Return:** `True` bei Erfolg, `False` bei Failure

### Topic-Schema

```
kaiser/{kaiser_id}/esp/{device_id}/zone/assign      Server→ESP  QoS 1
kaiser/{kaiser_id}/esp/{device_id}/zone/ack          ESP→Server  QoS 1
kaiser/{kaiser_id}/esp/{device_id}/subzone/assign    Server→ESP  QoS 1
kaiser/{kaiser_id}/esp/{device_id}/subzone/remove    Server→ESP  QoS 1
kaiser/{kaiser_id}/esp/{device_id}/subzone/ack       ESP→Server  QoS 1
kaiser/{kaiser_id}/esp/{device_id}/system/heartbeat  ESP→Server  QoS 0
```

`kaiser_id` ist standardmaessig `"god"`, abgerufen via `constants.get_kaiser_id()`.

**TopicBuilder:** `src/mqtt/topics.py`, statische Methoden:
- `build_zone_assign_topic(esp_id)` → `kaiser/{k}/esp/{esp_id}/zone/assign`
- `build_subzone_assign_topic(esp_id)` → `kaiser/{k}/esp/{esp_id}/subzone/assign`
- `parse_zone_ack_topic(topic)` → extrahiert `esp_id` aus Topic
- `parse_subzone_ack_topic(topic)` → extrahiert `esp_id` aus Topic

### ACK-Payloads vom ESP

**Zone-ACK:**
```json
{
  "status": "zone_assigned" | "zone_removed" | "error",
  "zone_id": "greenhouse_zone_1",
  "master_zone_id": "greenhouse_master",
  "ts": 1741564800,
  "message": "optional error description"
}
```
Feldname ist `"ts"` (NICHT `"timestamp"`). `"master_zone_id"` ist immer enthalten. Kein `correlation_id` — die Firmware sendet aktuell keins.

**Subzone-ACK:**
```json
{
  "esp_id": "ESP_AB12CD34",
  "status": "subzone_assigned" | "subzone_removed" | "error",
  "subzone_id": "irrigation_section_A",
  "ts": 1741564800,
  "error_code": 2506,
  "message": "GPIO conflict"
}
```
`error_code` und `message` nur bei `status == "error"`. `esp_id` ist Pflichtfeld IM Payload. Gueltige Status-Werte definiert in `src/schemas/subzone.py:271`.

### Firmware-Verhalten (fuer Verstaendnis — keine Firmware-Aenderungen in diesem Auftrag)

- **Zone-Assign:** ESP empfaengt `zone/assign`, schreibt neue Zone in NVS (10-50ms), sendet ACK mit `status: "zone_assigned"`
- **Subzone-Assign:** ESP validiert `parent_zone_id == aktuelle zone_id` ODER `parent_zone_id == ""`. Bei leerem `parent_zone_id` setzt die Firmware automatisch ihre aktuelle `g_kaiser.zone_id` ein. Das ist der sicherste Weg — keine Race Condition moeglich weil die Zone zum Zeitpunkt des Subzone-Assigns bereits im NVS steht.
- **Subzone-Limit:** Max 8 Subzones pro ESP (hardcoded in Firmware)
- **Heartbeat-Intervall:** ~30 Sekunden, QoS 0
- **NVS-Keys Zone:** `zone_id`, `master_zone_id`, `zone_name`, `zone_assigned`, `kaiser_id`
- **NVS-Keys Subzone:** `sz_idx_map`, `sz_count`, `sz_{N}_id`, `sz_{N}_name`, `sz_{N}_par`, `sz_{N}_gpio`

### DB-Schema (relevante Tabellen)

```sql
-- esp_devices
id              UUID PK
device_id       String UNIQUE          -- "ESP_AB12CD34"
zone_id         String FK → zones.zone_id (ON DELETE SET NULL)
master_zone_id  String
zone_name       String
kaiser_id       String
device_metadata JSON                   -- Heartbeat-Daten, pending-Flags

-- subzone_configs
id                        UUID PK
subzone_id                String       -- Identifizierender Name
subzone_name              String
esp_id                    String       -- → esp_devices.device_id (String, NICHT UUID!)
parent_zone_id            String       -- Application-Level FK auf zones.zone_id
is_active                 Boolean      -- Default true
assigned_gpios            JSON Array   -- [2, 4, 15]
assigned_sensor_config_ids JSON Array  -- [uuid1, uuid2]
last_ack_at               DateTime     -- Gesetzt bei ACK-Empfang

-- zones
zone_id       String UNIQUE
status        String (active/archived/deleted)
deleted_at    DateTime nullable
```

**FK-Inkonsistenz beachten:** `subzone_configs.esp_id` ist ein String und referenziert `esp_devices.device_id` (String). `sensor_configs.esp_id` ist dagegen eine UUID und referenziert `esp_devices.id` (UUID). Bei Subzone-Operationen immer den `device_id`-String verwenden.

### Event-Loop-Architektur

```
FastAPI Event Loop (Haupt-Thread, asyncio)
  ├── API Request Handlers
  ├── LogicEngine._evaluation_loop() (Task)
  ├── LogicScheduler._scheduler_loop() (Task)
  ├── WebSocket Manager
  └── MQTT Handler Coroutines
      (via run_coroutine_threadsafe, dispatched aus paho-Thread)

paho-mqtt Network Thread (loop_start)
  ├── TCP socket read/write
  ├── _on_message() callback
  └── → Subscriber._route_message()
      → ThreadPool → run_coroutine_threadsafe()
        → Handler laeuft auf FastAPI Event Loop
```

**Entscheidend:** MQTT-Handler (zone_ack_handler, subzone_ack_handler) laufen via `run_coroutine_threadsafe()` auf dem **FastAPI Event Loop**. Das bedeutet:
- `asyncio.Future` erstellt auf dem FastAPI-Loop funktioniert korrekt
- `resolve_ack()` wird im selben Loop aufgerufen wie `send_and_wait_ack()` wartet
- **Kein `call_soon_threadsafe()` noetig** fuer die Future-Resolution

**Beweis:** `sensors.py:1722-1733` nutzt bereits das exakte Pattern (`asyncio.Future` + `wait_for` + `call_soon_threadsafe` fuer OneWire-Scan).

### DI-Pattern im Codebase

Es gibt zwei koexistierende Patterns:

**Pattern A: FastAPI Depends() in API-Endpoints** (`src/api/deps.py`):
```python
async def get_db() -> AsyncGenerator[AsyncSession, None]: ...
DBSession = Annotated[AsyncSession, Depends(get_db)]
```

**Pattern B: Module-Level Globals im Lifespan** (`main.py`):
```python
_logic_engine: LogicEngine = None
_logic_scheduler: LogicScheduler = None
_websocket_manager: WebSocketManager = None
```

Kein `app.state`, kein zentraler DI-Container. Services werden manuell in Endpoints/Lifespan erstellt.

Die MQTTCommandBridge folgt **Pattern B** (Module-Level Global) weil sie:
- Beim Startup einmal erstellt wird
- Von mehreren Stellen gebraucht wird (ACK-Handler, zone_service, zone.py API-Router)
- Den MQTT-Client Singleton braucht der ebenfalls als Global existiert

---

<a name="3-was-nicht-gemacht-wird"></a>
## 3. Was NICHT gemacht wird

- **Keine Firmware-Aenderungen** — alles ist server-seitig
- **Keine Frontend-Aenderungen** — kommt in Phase 4 (T13-R3)
- **Keine Aenderungen an `sensor_handler.py`** — Cache-Bypass Fix kommt in Phase 3.2
- **Keine Aenderungen an `subzone_service.py`** (ausser was direkt noetig ist) — GPIO-0-Filter kommt in Phase 3.3
- **Kein MQTT 5 Upgrade** — System bleibt auf MQTT 3.1.1 (paho-mqtt)
- **Keine Aenderung des Publisher-Retry-Mechanismus** — fire-and-forget Operationen (Heartbeat-ACK, Safe-Mode-Enable, LWT-Clear) bleiben beim bestehenden Publisher
- **Keine Logic-Engine-Aenderungen**
- **Kein Auto-Resync fuer Szenario A** (ESP hat Zone, DB hat NULL) — kommt spaeter
- **Keine Aenderungen an Subzone-Service Standalone-Operationen** — nur der Zone-Transfer-Flow wird um MQTT erweitert
- **Keine DB-Migration** — `pending_zone_assignment` existiert bereits als JSON-Key in `device_metadata`

---

<a name="4-schritt-1-2"></a>
## 4. Schritt 1–2: MQTTCommandBridge Service + Unit-Tests

### Schritt 1: Neue Datei `src/services/mqtt_command_bridge.py`

**Aufwand:** ~2 Stunden

Erstelle eine neue Datei `src/services/mqtt_command_bridge.py` mit der Klasse `MQTTCommandBridge`.

#### Konzept

Die Bridge ist ein duenner Layer zwischen den Services (zone_service) und dem MQTTClient. Sie:
1. Generiert eine `correlation_id` (UUID) und fuegt sie ins Payload ein
2. Erstellt eine `asyncio.Future` die auf den ACK wartet
3. Published die MQTT-Nachricht ueber `MQTTClient.publish()` (synchron)
4. Wartet mit `asyncio.wait_for()` auf die Future-Resolution (async, max 10s)
5. Wird vom ACK-Handler aufgerufen (`resolve_ack()`) um die Future aufzuloesen

Da die ESP-Firmware aktuell KEIN `correlation_id` im ACK zuruecksendet, gibt es eine Fallback-Matching-Strategie:
- **Primaer:** `correlation_id` im ACK-Payload → exakter Match
- **Fallback:** `esp_id` + `command_type` → aelteste pending Future (FIFO-Queue)

Der Fallback ist sicher weil normalerweise nur eine Zone-Operation pro ESP gleichzeitig laeuft. Falls doch zwei schnell hintereinander kommen: Die aeltere wird zuerst aufgeloest.

#### Vollstaendige Klasse

```python
"""ACK-gesteuerte MQTT-Command-Bridge fuer kritische Operationen.

Ergaenzt den bestehenden Publisher um ACK-Waiting fuer Zone/Subzone-Operationen.
Fire-and-forget bleibt ueber den Publisher fuer unkritische Nachrichten bestehen.

Thread-Safety: Alle Methoden muessen auf dem FastAPI Event Loop aufgerufen werden.
resolve_ack() wird von MQTT-Handlern aufgerufen die via run_coroutine_threadsafe()
bereits auf dem FastAPI Loop dispatched wurden — daher kein Thread-Problem.
"""

import asyncio
import json
import logging
from collections import deque
from typing import Any, Optional
from uuid import uuid4

from ..mqtt.client import MQTTClient
from ..core.constants import QOS_SENSOR_DATA

logger = logging.getLogger("god_kaiser.mqtt_command_bridge")


class MQTTACKTimeoutError(Exception):
    """No ACK received within the timeout period."""
    pass


class MQTTCommandBridge:
    """ACK-gesteuerte MQTT-Command-Bridge.

    Verwendet asyncio.Future fuer ACK-Waiting. Laeuft auf dem FastAPI Event Loop.
    ACK-Handler (zone_ack_handler, subzone_ack_handler) rufen resolve_ack() auf.
    """

    DEFAULT_TIMEOUT: float = 10.0

    def __init__(self, mqtt_client: MQTTClient):
        self._mqtt_client = mqtt_client
        self._pending: dict[str, asyncio.Future] = {}
        # Fallback-Index: (esp_id, command_type) → deque[correlation_id] (FIFO)
        self._esp_pending: dict[tuple[str, str], deque[str]] = {}
        logger.info("MQTTCommandBridge initialized")

    async def send_and_wait_ack(
        self,
        topic: str,
        payload: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",
        timeout: float = DEFAULT_TIMEOUT,
    ) -> dict[str, Any]:
        """Publish MQTT and wait for ACK from ESP.

        Args:
            topic: MQTT topic (z.B. kaiser/god/esp/ESP_AB12CD/zone/assign)
            payload: Message payload als dict. correlation_id wird automatisch eingefuegt.
            esp_id: ESP device_id String (z.B. "ESP_AB12CD34") fuer Fallback-Matching.
            command_type: "zone" oder "subzone" — bestimmt Fallback-Queue.
            timeout: Max Sekunden auf ACK warten. Default 10s.

        Returns:
            ACK-Payload als dict (z.B. {"status": "zone_assigned", "zone_id": "zone_b", ...})

        Raises:
            MQTTACKTimeoutError: Kein ACK innerhalb timeout.
            MQTTACKTimeoutError: MQTT Publish fehlgeschlagen (Circuit Breaker, Disconnect).
        """
        correlation_id = str(uuid4())
        payload["correlation_id"] = correlation_id

        loop = asyncio.get_running_loop()
        future = loop.create_future()
        self._pending[correlation_id] = future

        key = (esp_id, command_type)
        self._esp_pending.setdefault(key, deque()).append(correlation_id)

        logger.debug(
            f"Sending {command_type} command to {esp_id} "
            f"(correlation_id={correlation_id}, topic={topic})"
        )

        # MQTTClient.publish() ist synchron — blockiert nur kurz (paho buffert intern)
        payload_str = json.dumps(payload)
        success = self._mqtt_client.publish(topic, payload_str, qos=QOS_SENSOR_DATA)

        if not success:
            self._cleanup(correlation_id, key)
            raise MQTTACKTimeoutError(
                f"MQTT publish failed for {topic} (circuit breaker or disconnect)"
            )

        try:
            result = await asyncio.wait_for(future, timeout=timeout)
            logger.info(
                f"ACK received for {esp_id} {command_type} "
                f"(correlation_id={correlation_id}, status={result.get('status')})"
            )
            return result
        except asyncio.TimeoutError:
            logger.error(
                f"ACK timeout for {esp_id} {command_type} "
                f"(correlation_id={correlation_id}, timeout={timeout}s)"
            )
            raise MQTTACKTimeoutError(
                f"No ACK for {esp_id} {command_type} "
                f"(correlation_id={correlation_id}) within {timeout}s"
            )
        finally:
            self._cleanup(correlation_id, key)

    def resolve_ack(
        self,
        ack_data: dict[str, Any],
        esp_id: str,
        command_type: str = "zone",
    ) -> bool:
        """Resolve a pending Future with ACK data. Called by ACK-Handlers.

        Matching strategy (in order):
        1. Exact match via correlation_id in ack_data payload
        2. Fallback: oldest pending Future for (esp_id, command_type) — FIFO

        Der Fallback existiert weil die ESP-Firmware aktuell kein correlation_id
        im ACK zuruecksendet. Wenn eine zukuenftige Firmware-Version correlation_id
        unterstuetzt, wird automatisch Strategy 1 genutzt.

        Args:
            ack_data: ACK-Payload vom ESP (dict mit status, zone_id/subzone_id, etc.)
            esp_id: ESP device_id String (aus Topic geparst)
            command_type: "zone" oder "subzone"

        Returns:
            True wenn eine Future aufgeloest wurde, False wenn kein Match.
        """
        # Strategy 1: Exact correlation_id match
        cid = ack_data.get("correlation_id")
        if cid and cid in self._pending:
            future = self._pending[cid]
            if not future.done():
                future.set_result(ack_data)
                logger.debug(f"ACK resolved via correlation_id={cid}")
                return True

        # Strategy 2: Fallback via (esp_id, command_type) — aelteste pending Future
        key = (esp_id, command_type)
        pending_queue = self._esp_pending.get(key)
        if pending_queue:
            while pending_queue:
                oldest_cid = pending_queue[0]
                future = self._pending.get(oldest_cid)
                if future and not future.done():
                    future.set_result(ack_data)
                    pending_queue.popleft()
                    logger.debug(
                        f"ACK resolved via fallback for {esp_id}/{command_type} "
                        f"(correlation_id={oldest_cid})"
                    )
                    return True
                pending_queue.popleft()  # Stale entry, skip

        logger.debug(f"No pending Future for ACK from {esp_id}/{command_type}")
        return False

    def has_pending(self, esp_id: str, command_type: str = "zone") -> bool:
        """Check if there are pending (non-resolved) operations for an ESP.

        Useful for Heartbeat-Handler: Waehrend pending operations soll kein
        Zone-Mismatch-Warning gefeuert werden.
        """
        key = (esp_id, command_type)
        queue = self._esp_pending.get(key)
        if not queue:
            return False
        return any(
            cid in self._pending and not self._pending[cid].done()
            for cid in queue
        )

    async def shutdown(self) -> None:
        """Cancel all pending Futures. Called during server shutdown."""
        count = 0
        for cid, future in self._pending.items():
            if not future.done():
                future.cancel()
                count += 1
        self._pending.clear()
        self._esp_pending.clear()
        logger.info(f"MQTTCommandBridge shutdown complete ({count} pending cancelled)")

    def _cleanup(self, correlation_id: str, key: tuple[str, str]) -> None:
        """Remove a correlation_id from all tracking structures."""
        self._pending.pop(correlation_id, None)
        queue = self._esp_pending.get(key)
        if queue:
            try:
                queue.remove(correlation_id)
            except ValueError:
                pass
            if not queue:
                del self._esp_pending[key]
```

#### Design-Entscheidungen (Begruendung)

| Entscheidung | Begruendung |
|-------------|-------------|
| Bridge nutzt `MQTTClient` direkt, nicht `Publisher` | Zone/Subzone-Services umgehen bereits den Publisher und rufen `client.publish()` direkt auf. Bridge folgt demselben Pfad fuer Konsistenz. |
| `correlation_id` ins JSON-Payload, nicht als MQTT 5 Property | paho-mqtt nutzt MQTT 3.1.1 — keine MQTT 5 Properties verfuegbar. Payload-basiert ist der einzige Weg. |
| Fallback-Matching via `(esp_id, command_type)` FIFO | Normalerweise laeuft nur eine Zone-Operation pro ESP. FIFO stellt sicher dass bei schnellen Aufeinanderfolgenden die richtige Future aufgeloest wird. |
| `resolve_ack()` ist synchron (nicht async) | Wird im Context eines async Handlers aufgerufen. Future.set_result() ist synchron und muss auf dem gleichen Event-Loop laufen — das ist garantiert weil Handler via `run_coroutine_threadsafe()` dispatched werden. |
| `_cleanup()` in `finally`-Block | Verhindert Memory-Leaks: Auch bei Timeout oder Exception wird die correlation_id aus allen Tracking-Strukturen entfernt. |
| Eigene Exception `MQTTACKTimeoutError` | Aufrufer koennen Timeout gezielt fangen und Fallback-Logik ausfuehren (z.B. pending-Flag behalten, Heartbeat korrigiert spaeter). |

### Schritt 2: Unit-Tests `tests/unit/test_mqtt_command_bridge.py`

**Aufwand:** ~1 Stunde

Erstelle eine neue Test-Datei `tests/unit/test_mqtt_command_bridge.py`.

#### Zu testende Szenarien

**Test 1: Success — ACK innerhalb Timeout**
```python
async def test_send_and_wait_ack_success():
    """ACK kommt innerhalb Timeout → Future wird aufgeloest, Return ist ack_data."""
    mock_client = MagicMock()
    mock_client.publish.return_value = True
    bridge = MQTTCommandBridge(mock_client)

    # ACK simulieren: In separatem Task resolve_ack() aufrufen
    async def simulate_ack():
        await asyncio.sleep(0.05)  # 50ms — simuliert ESP NVS-Write
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_ack())
    result = await bridge.send_and_wait_ack(
        topic="kaiser/god/esp/ESP_TEST01/zone/assign",
        payload={"zone_id": "zone_b"},
        esp_id="ESP_TEST01",
        command_type="zone",
        timeout=2.0,
    )

    assert result["status"] == "zone_assigned"
    assert result["zone_id"] == "zone_b"
    assert mock_client.publish.called
    # correlation_id wurde ins Payload eingefuegt
    published_payload = json.loads(mock_client.publish.call_args[0][1])
    assert "correlation_id" in published_payload
```

**Test 2: Timeout — Kein ACK**
```python
async def test_send_and_wait_ack_timeout():
    """Kein ACK innerhalb Timeout → MQTTACKTimeoutError."""
    mock_client = MagicMock()
    mock_client.publish.return_value = True
    bridge = MQTTCommandBridge(mock_client)

    with pytest.raises(MQTTACKTimeoutError):
        await bridge.send_and_wait_ack(
            topic="kaiser/god/esp/ESP_TEST01/zone/assign",
            payload={"zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            timeout=0.1,  # 100ms Timeout fuer schnellen Test
        )
```

**Test 3: Publish-Failure**
```python
async def test_send_and_wait_ack_publish_failure():
    """MQTT Publish schlaegt fehl → sofort MQTTACKTimeoutError (kein Warten)."""
    mock_client = MagicMock()
    mock_client.publish.return_value = False  # Circuit Breaker oder Disconnect
    bridge = MQTTCommandBridge(mock_client)

    with pytest.raises(MQTTACKTimeoutError, match="publish failed"):
        await bridge.send_and_wait_ack(
            topic="...", payload={}, esp_id="ESP_TEST01",
        )
```

**Test 4: Fallback-Matching ohne correlation_id**
```python
async def test_resolve_ack_fallback_without_correlation_id():
    """ACK ohne correlation_id → Fallback auf (esp_id, command_type) FIFO."""
    mock_client = MagicMock()
    mock_client.publish.return_value = True
    bridge = MQTTCommandBridge(mock_client)

    async def simulate_ack():
        await asyncio.sleep(0.05)
        # ACK OHNE correlation_id (wie aktuelle Firmware)
        bridge.resolve_ack(
            ack_data={"status": "zone_assigned", "zone_id": "zone_b"},
            esp_id="ESP_TEST01",
            command_type="zone",
        )

    asyncio.create_task(simulate_ack())
    result = await bridge.send_and_wait_ack(
        topic="...", payload={"zone_id": "zone_b"},
        esp_id="ESP_TEST01", timeout=2.0,
    )
    assert result["status"] == "zone_assigned"
```

**Test 5: Concurrent — Zwei Commands fuer verschiedene ESPs**
```python
async def test_concurrent_different_esps():
    """Zwei parallele Commands fuer verschiedene ESPs → beide korrekt aufgeloest."""
    # Beide ESPs bekommen je ihren ACK
```

**Test 6: Error-ACK**
```python
async def test_resolve_ack_with_error_status():
    """ACK mit status=error → Future wird trotzdem aufgeloest (nicht Timeout)."""
    # Aufrufer muss status pruefen
```

**Test 7: Cleanup nach Timeout**
```python
async def test_cleanup_after_timeout():
    """Nach Timeout: correlation_id aus _pending und _esp_pending entfernt."""
    # Kein Memory-Leak
```

**Test 8: Shutdown cancelt Futures**
```python
async def test_shutdown_cancels_pending():
    """shutdown() cancelt alle pending Futures."""
```

**Test 9: has_pending()**
```python
async def test_has_pending():
    """has_pending() gibt True zurueck waehrend Command laeuft, False danach."""
```

#### Akzeptanzkriterien Schritt 1–2

- [ ] `src/services/mqtt_command_bridge.py` existiert mit `MQTTCommandBridge` und `MQTTACKTimeoutError`
- [ ] `send_and_wait_ack()` fuegt `correlation_id` ins Payload ein
- [ ] `send_and_wait_ack()` gibt ACK-Daten zurueck wenn ACK innerhalb Timeout
- [ ] `send_and_wait_ack()` wirft `MQTTACKTimeoutError` bei Timeout
- [ ] `send_and_wait_ack()` wirft `MQTTACKTimeoutError` bei Publish-Failure (sofort, kein Warten)
- [ ] `resolve_ack()` matcht via `correlation_id` (Primaer) oder `(esp_id, command_type)` FIFO (Fallback)
- [ ] `resolve_ack()` loest auch Error-ACKs auf (Future mit Error-Status, nicht Timeout)
- [ ] `has_pending()` gibt korrekten Boolean zurueck
- [ ] `shutdown()` cancelt alle pending Futures
- [ ] `_cleanup()` entfernt correlation_id aus `_pending` und `_esp_pending` (kein Memory-Leak)
- [ ] Alle Unit-Tests gruen
- [ ] Kein Import von Dateien die geaendert werden (zone_service, ACK-Handler) — Bridge ist eigenstaendig

---

<a name="5-schritt-3-5"></a>
## 5. Schritt 3–5: ACK-Handler + main.py Registration

### Schritt 3: `src/mqtt/handlers/zone_ack_handler.py` erweitern

**Aufwand:** ~30 Minuten

#### IST-Zustand

`ZoneAckHandler` (Zeile 49) verarbeitet Zone-ACKs. Der relevante Flow nach dem DB-Commit:

```python
# Zeile 175 (bestehend):
await session.commit()
# Zeile 178 (bestehend):
await self._broadcast_zone_update(...)
```

#### SOLL-Zustand

**Neue Module-Level-Variable und Setter-Funktion (am Anfang der Datei, nach Imports):**

```python
_command_bridge: Optional["MQTTCommandBridge"] = None

def set_command_bridge(bridge: "MQTTCommandBridge") -> None:
    """Set the MQTTCommandBridge reference. Called from main.py during startup."""
    global _command_bridge
    _command_bridge = bridge
```

Dieses Pattern (Module-Level-Variable + Setter) ist konsistent mit dem bestehenden Pattern im Codebase (`get_heartbeat_handler()` in heartbeat_handler.py verwendet dasselbe Konzept).

**Einfuegen NACH `await session.commit()` (Zeile 175), VOR `_broadcast_zone_update()` (Zeile 178):**

```python
await session.commit()

# Resolve pending ACK Future (if any)
if _command_bridge:
    _command_bridge.resolve_ack(
        ack_data={
            "status": status,
            "zone_id": zone_id,
            "master_zone_id": master_zone_id,
            "esp_id": esp_id_str,
            "ts": timestamp,
        },
        esp_id=esp_id_str,
        command_type="zone",
    )

await self._broadcast_zone_update(...)
```

**WICHTIG:** `resolve_ack()` muss auch bei `status == "error"` aufgerufen werden. Die Future soll mit dem Error-Status aufgeloest werden, damit der Aufrufer (`zone_service`) den Fehler behandeln kann statt bis zum Timeout zu warten. Die Logik dafuer:

```python
# Nach dem bestehenden if/elif/else fuer status (Zeilen 131-170):
# resolve_ack() IMMER aufrufen — auch bei error
if _command_bridge:
    _command_bridge.resolve_ack(
        ack_data={"status": status, "zone_id": zone_id, "esp_id": esp_id_str, "ts": timestamp},
        esp_id=esp_id_str,
        command_type="zone",
    )
```

#### Akzeptanzkriterien Schritt 3

- [ ] `set_command_bridge()` Funktion existiert
- [ ] `resolve_ack()` wird nach jedem erfolgreichen Commit aufgerufen
- [ ] `resolve_ack()` wird auch bei `status == "error"` aufgerufen
- [ ] Bestehende DB-Updates und WS-Broadcast bleiben unveraendert
- [ ] Bestehende Tests fuer zone_ack_handler bleiben gruen

### Schritt 4: `src/mqtt/handlers/subzone_ack_handler.py` erweitern

**Aufwand:** ~30 Minuten

Gleiche Erweiterung wie zone_ack_handler.

**Neue Module-Level-Variable + Setter:**

```python
_command_bridge: Optional["MQTTCommandBridge"] = None

def set_command_bridge(bridge: "MQTTCommandBridge") -> None:
    global _command_bridge
    _command_bridge = bridge
```

**Einfuegen NACH `await session.commit()` (Zeile 101), VOR `_broadcast_subzone_update()` (Zeile 103):**

```python
await session.commit()

if _command_bridge:
    _command_bridge.resolve_ack(
        ack_data={
            "status": ack_payload.status,
            "subzone_id": ack_payload.subzone_id,
            "esp_id": esp_id,
            "ts": ack_payload.timestamp,
            "error_code": getattr(ack_payload, "error_code", None),
        },
        esp_id=esp_id,
        command_type="subzone",
    )

await self._broadcast_subzone_update(ack_payload)
```

#### Akzeptanzkriterien Schritt 4

- [ ] `set_command_bridge()` Funktion existiert
- [ ] `resolve_ack()` wird nach jedem Commit aufgerufen (auch bei Error-ACKs)
- [ ] `command_type="subzone"` korrekt gesetzt (nicht "zone")
- [ ] Bestehende Logik unveraendert

### Schritt 5: `src/main.py` — Bridge registrieren

**Aufwand:** ~30 Minuten

#### Startup

**Neue Module-Level-Variable (bei den anderen Globals, ca. Zeile 84):**

```python
_mqtt_command_bridge: Optional["MQTTCommandBridge"] = None
```

**Im Lifespan-Startup, NACH Handler-Registrierung (ca. Zeile 270, nach "Step 3: MQTT Handler registered"), VOR `subscribe_all()` (ca. Zeile 560):**

```python
# Step 3.1: MQTTCommandBridge
from src.services.mqtt_command_bridge import MQTTCommandBridge
from src.mqtt.handlers.zone_ack_handler import set_command_bridge as set_zone_bridge
from src.mqtt.handlers.subzone_ack_handler import set_command_bridge as set_subzone_bridge

global _mqtt_command_bridge
_mqtt_command_bridge = MQTTCommandBridge(mqtt_client)
set_zone_bridge(_mqtt_command_bridge)
set_subzone_bridge(_mqtt_command_bridge)
logger.info("MQTTCommandBridge registered with ACK handlers")
```

#### Shutdown

**Nach SequenceActionExecutor.shutdown() (ca. Zeile 893), VOR MaintenanceService.stop() (ca. Zeile 895):**

```python
# Shutdown MQTTCommandBridge (cancel pending Futures)
if _mqtt_command_bridge:
    await _mqtt_command_bridge.shutdown()
```

Die Position ist wichtig: Die Bridge muss VOR dem MQTT-Client-Disconnect heruntergefahren werden (MQTTClient.disconnect() ist Zeile 941), aber NACH den Logic-Services die moeglicherweise noch MQTT nutzen.

#### Getter-Funktion fuer API-Router (deps.py Integration)

**In `src/api/deps.py` eine neue Dependency hinzufuegen:**

```python
def get_command_bridge() -> Optional["MQTTCommandBridge"]:
    """Get the MQTTCommandBridge instance. Returns None if not initialized."""
    from ..main import _mqtt_command_bridge
    return _mqtt_command_bridge
```

#### Akzeptanzkriterien Schritt 5

- [ ] `_mqtt_command_bridge` als Module-Level-Variable in main.py
- [ ] Bridge wird nach Handler-Registrierung, vor `subscribe_all()` erstellt
- [ ] Beide ACK-Handler bekommen Bridge-Referenz via `set_command_bridge()`
- [ ] Shutdown-Reihenfolge: Bridge VOR MQTTClient.disconnect()
- [ ] `get_command_bridge()` in deps.py verfuegbar
- [ ] Server startet fehlerfrei mit Bridge

---

<a name="6-schritt-6-9"></a>
## 6. Schritt 6–9: zone_service Umstellung + Subzone-MQTT

### Schritt 6: `src/services/zone_service.py` — Constructor + assign_zone()

**Aufwand:** ~2 Stunden

#### Constructor erweitern

**IST (ca. Zeile 50):**
```python
class ZoneService:
    def __init__(self, esp_repo: ESPRepository, publisher: Optional[Publisher] = None):
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()
        self.kaiser_id = constants.get_kaiser_id()
```

**SOLL:**
```python
class ZoneService:
    def __init__(
        self,
        esp_repo: ESPRepository,
        publisher: Optional[Publisher] = None,
        command_bridge: Optional["MQTTCommandBridge"] = None,
    ):
        self.esp_repo = esp_repo
        self.publisher = publisher or Publisher()
        self.command_bridge = command_bridge
        self.kaiser_id = constants.get_kaiser_id()
```

`command_bridge` ist optional — wenn `None`, wird auf fire-and-forget zurueckgefallen. Das stellt sicher dass bestehende Tests die `ZoneService` ohne Bridge instanziieren weiterhin funktionieren.

#### assign_zone() MQTT-Block umstellen

**IST (Zeile 169-188) — Fire-and-Forget:**
```python
# Zeile 169-188: MQTT publish fire-and-forget
topic = f"kaiser/{self.kaiser_id}/esp/{device_id}/zone/assign"
payload = {
    "zone_id": zone_id,
    "master_zone_id": master_zone_id or zone_id,
    "zone_name": zone_name or "",
    "kaiser_id": self.kaiser_id,
    "timestamp": int(datetime.now(timezone.utc).timestamp()),
}
mqtt_sent = self._publish_zone_assignment(topic, payload)
```

**SOLL — ACK-gesteuertes Warten mit Subzone-Transfer:**

```python
from ..mqtt.topics import TopicBuilder
from .mqtt_command_bridge import MQTTACKTimeoutError

# ... (Schritte 1-5 bleiben unveraendert: ESP-Lookup, Zone-Validierung,
#      _handle_subzone_strategy, ESP-Felder setzen, Audit-Log)

# MQTT Block: ACK-gesteuert oder fire-and-forget
topic = TopicBuilder.build_zone_assign_topic(device_id)
payload = {
    "zone_id": zone_id,
    "master_zone_id": master_zone_id or zone_id,
    "zone_name": zone_name or "",
    "kaiser_id": self.kaiser_id,
    "timestamp": int(datetime.now(timezone.utc).timestamp()),
}

if self.command_bridge and not self._is_mock_esp(device_id):
    # ACK-gesteuertes MQTT fuer echte ESPs
    try:
        zone_ack = await self.command_bridge.send_and_wait_ack(
            topic=topic,
            payload=payload,
            esp_id=device_id,
            command_type="zone",
            timeout=10.0,
        )
        mqtt_sent = True

        # Pruefen ob Zone-ACK Erfolg meldet
        if zone_ack.get("status") == "error":
            logger.error(
                f"ESP {device_id} rejected zone assignment: "
                f"{zone_ack.get('message', 'unknown error')}"
            )
            mqtt_sent = False
        elif transferred_subzones:
            # Subzone-Transfer-MQTT: ERST nach erfolgreichem Zone-ACK
            await self._send_transferred_subzones(device_id, transferred_subzones)

    except MQTTACKTimeoutError as e:
        logger.error(f"Zone assignment ACK timeout for {device_id}: {e}")
        mqtt_sent = False
        # pending_zone_assignment bleibt in device_metadata
        # → Heartbeat-Handler wird tolerant warten
        # → Nach Timeout raeumt der naechste Heartbeat-Cycle auf
else:
    # Fire-and-forget fuer Mock-ESPs oder wenn keine Bridge vorhanden
    mqtt_sent = self._publish_zone_assignment(topic, payload)
```

**Erlaeuterung `transferred_subzones`:** Die Variable kommt aus dem Return-Wert von `_handle_subzone_strategy()`. Diese Methode gibt bereits `List[dict]` zurueck — die Liste der betroffenen Subzones. Bei `strategy == "transfer"` enthaelt jedes dict die Subzone-Daten. Diese Liste muss VOR dem MQTT-Block gespeichert werden:

```python
# Zeile 126-137 (bestehend, leicht anpassen):
transferred_subzones = []
if old_zone_id and old_zone_id != zone_id:
    affected = await self._handle_subzone_strategy(...)
    if subzone_strategy == "transfer":
        transferred_subzones = affected  # Fuer Subzone-MQTT nach Zone-ACK
```

#### Neue private Methode: `_send_transferred_subzones()`

```python
async def _send_transferred_subzones(
    self,
    device_id: str,
    transferred_subzones: list[dict],
) -> None:
    """Send subzone/assign MQTT for each transferred subzone after zone ACK.

    Called ONLY after successful zone ACK — the ESP has the new zone in NVS.
    parent_zone_id is sent EMPTY — the firmware automatically uses its current
    zone_id (which is now the new zone after zone/assign was processed).
    This eliminates any race condition.
    """
    for sz in transferred_subzones:
        sz_topic = TopicBuilder.build_subzone_assign_topic(device_id)
        sz_payload = {
            "subzone_id": sz.get("subzone_id", ""),
            "subzone_name": sz.get("subzone_name", ""),
            "parent_zone_id": "",  # LEER — Firmware setzt aktuelle Zone ein
            "assigned_gpios": sz.get("assigned_gpios", []),
            "timestamp": int(datetime.now(timezone.utc).timestamp()),
        }

        # GPIO 0 rausfiltern (I2C-Placeholder, loest Error 2506 auf ESP)
        sz_payload["assigned_gpios"] = [
            g for g in sz_payload["assigned_gpios"] if g != 0
        ]

        try:
            sz_ack = await self.command_bridge.send_and_wait_ack(
                topic=sz_topic,
                payload=sz_payload,
                esp_id=device_id,
                command_type="subzone",
                timeout=10.0,
            )
            if sz_ack.get("status") == "error":
                logger.warning(
                    f"Subzone {sz['subzone_id']} transfer ACK error for {device_id}: "
                    f"code={sz_ack.get('error_code')}, msg={sz_ack.get('message')}"
                )
        except MQTTACKTimeoutError as e:
            logger.error(
                f"Subzone {sz['subzone_id']} transfer timeout for {device_id}: {e}"
            )
            # Weiter mit naechster Subzone — partial success ist besser als Abbruch
```

**Design-Entscheidung: Bei Subzone-Timeout weitermachen, nicht abbrechen.** Begruendung: Wenn von 3 Subzones die erste und dritte erfolgreich sind aber die zweite timeout hat, ist ein Partial-Success besser als wenn gar keine Subzone transferiert wird. Die fehlende Subzone wird beim naechsten Full-State-Push (Phase 3.1, spaeterer Auftrag) nachgeholt.

**Design-Entscheidung: GPIO 0 rausfiltern.** GPIO 0 ist ein I2C-Placeholder (SHT31, BMP280 etc.) der auf dem ESP keine physische Bedeutung hat. I2C-Sensor-Subzone-Zuordnung laeuft rein server-seitig ueber `assigned_sensor_config_ids`. GPIO 0 im `subzone/assign` Payload loest Error 2506 auf dem ESP aus. Das Filtern gehoert eigentlich in Phase 3.3, wird aber hier gleich miternommen weil die Subzone-MQTT-Nachrichten in diesem Schritt neu eingefuehrt werden.

### Schritt 7: `src/services/zone_service.py` — remove_zone() umstellen

**Aufwand:** ~30 Minuten

#### IST (Zeile 287-295):
```python
# Fire-and-forget
mqtt_sent = self._publish_zone_assignment(topic, payload)
```

#### SOLL:
```python
if self.command_bridge and not self._is_mock_esp(device_id):
    try:
        ack = await self.command_bridge.send_and_wait_ack(
            topic=topic,
            payload=payload,
            esp_id=device_id,
            command_type="zone",
            timeout=10.0,
        )
        mqtt_sent = True
        if ack.get("status") == "error":
            logger.error(f"ESP {device_id} rejected zone removal: {ack.get('message')}")
            mqtt_sent = False
    except MQTTACKTimeoutError as e:
        logger.error(f"Zone removal ACK timeout for {device_id}: {e}")
        mqtt_sent = False
else:
    mqtt_sent = self._publish_zone_assignment(topic, payload)
```

`remove_zone()` sendet auf demselben Topic (`zone/assign`) mit leerem `zone_id` im Payload. Die Bridge unterscheidet nicht zwischen Assign und Remove — der ACK-Handler matched via `esp_id`.

### Schritt 8: `src/api/v1/zone.py` — Bridge-Injection

**Aufwand:** ~30 Minuten

#### IST (Zeile ~69-89):
```python
async def assign_zone(esp_id: str, request: ZoneAssignRequest, db: DBSession, ...):
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo)
    result = await zone_service.assign_zone(...)
```

#### SOLL:
```python
from ..deps import get_command_bridge

async def assign_zone(esp_id: str, request: ZoneAssignRequest, db: DBSession, ...):
    esp_repo = ESPRepository(db)
    zone_service = ZoneService(esp_repo, command_bridge=get_command_bridge())
    result = await zone_service.assign_zone(...)
```

**Alle Stellen in `zone.py` wo `ZoneService` instanziiert wird muessen angepasst werden.** Das betrifft:
- `assign_zone` Endpoint
- `remove_zone` / `unassign_zone` Endpoint (falls vorhanden)
- Jeder andere Endpoint der `ZoneService(esp_repo)` aufruft

**Suche im Code:** `ZoneService(` in allen Dateien unter `src/api/` — es koennten weitere Stellen existieren.

### Schritt 9: `_handle_subzone_strategy()` Return-Wert anpassen

**Aufwand:** ~1 Stunde

#### IST-Verhalten

`_handle_subzone_strategy()` (Zeile 388) gibt `List[dict]` zurueck — die betroffenen Subzones. Pruefen was die dicts enthalten:

Bei `strategy == "transfer"`:
```python
affected.append({
    "subzone_id": sz.subzone_id,
    "action": "transferred",
    # ... weitere Felder?
})
```

#### SOLL-Verhalten

Die Return-Dicts muessen alle Felder enthalten die fuer `subzone/assign` MQTT noetig sind:

```python
affected.append({
    "subzone_id": sz.subzone_id,
    "subzone_name": sz.subzone_name or "",
    "assigned_gpios": sz.assigned_gpios or [],
    "action": "transferred",
})
```

**Pruefen und ggf. ergaenzen:** `subzone_name` und `assigned_gpios` muessen im dict enthalten sein. Falls sie fehlen, aus dem `SubzoneConfig`-Objekt (`sz`) auslesen und hinzufuegen.

Fuer `strategy == "copy"` und `strategy == "reset"` ist kein Subzone-MQTT noetig:
- **copy:** Neue Subzones werden in der DB erstellt, aber der ESP bekommt sie via den normalen Subzone-Assign-Flow (nicht via Zone-Transfer)
- **reset:** Subzones bleiben in der alten Zone, ESP bekommt keine neuen

#### Akzeptanzkriterien Schritt 6–9

- [ ] `ZoneService.__init__()` akzeptiert optionalen `command_bridge` Parameter
- [ ] `assign_zone()` nutzt Bridge fuer echte ESPs, fire-and-forget fuer Mock-ESPs
- [ ] `assign_zone()` wartet auf Zone-ACK (max 10s) bevor Subzone-Transfer-MQTT gesendet wird
- [ ] `_send_transferred_subzones()` sendet `parent_zone_id: ""` (LEER)
- [ ] `_send_transferred_subzones()` filtert GPIO 0 aus `assigned_gpios`
- [ ] `_send_transferred_subzones()` setzt bei Timeout fort (kein Abbruch bei Partial-Failure)
- [ ] `remove_zone()` nutzt Bridge fuer echte ESPs
- [ ] `zone.py` API-Router injected Bridge via `get_command_bridge()`
- [ ] `_handle_subzone_strategy("transfer")` gibt dicts mit `subzone_id`, `subzone_name`, `assigned_gpios` zurueck
- [ ] Zone-ACK mit `status == "error"` wird korrekt behandelt (kein Subzone-MQTT, Error geloggt)
- [ ] `MQTTACKTimeoutError` wird gefangen — kein unbehandelter Crash
- [ ] `pending_zone_assignment` bleibt bei Timeout in `device_metadata` (wird NICHT geloescht)
- [ ] Bestehende Tests fuer `assign_zone()` und `remove_zone()` bleiben gruen (weil `command_bridge=None` → fire-and-forget Fallback)
- [ ] TopicBuilder wird genutzt statt hardcoded Topic-Strings

---

<a name="7-schritt-10"></a>
## 7. Schritt 10: Heartbeat pending-Check

**Aufwand:** ~1 Stunde

### Datei: `src/mqtt/handlers/heartbeat_handler.py`

#### IST-Verhalten (Zeilen 678-776)

Die Methode `_update_esp_metadata()` erkennt Zone-Mismatches zwischen Heartbeat-Payload und DB. Bei Mismatch werden drei Szenarien durchlaufen:

```python
# Zeile 678:
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
    # Szenario A: ESP hat Zone, DB hat NULL → Warning-Log
    # Szenario B: DB hat Zone, ESP hat keine → Auto-Resync (zone/assign, 60s Cooldown)
    # Szenario C: Beide haben Zone, verschieden → Warning-Log
```

Das Problem: Waehrend eines laufenden Zone-Wechsels (Server hat DB schon aktualisiert, ESP hat MQTT noch nicht verarbeitet) feuert Szenario B oder C ein Warning. Das ist ein False-Positive — der ESP bekommt die neue Zone in wenigen Sekunden ueber MQTT.

#### SOLL-Verhalten

**Einfuegen als allererstes nach Zeile 678 (vor den Szenarien):**

```python
if heartbeat_zone_id != db_zone_id or esp_lost_zone:
    # Check: Laeuft gerade ein Zone-Assignment? Wenn ja → tolerant warten
    pending = current_metadata.get("pending_zone_assignment")
    if pending:
        pending_target = pending.get("target_zone_id", "?") if isinstance(pending, dict) else str(pending)
        logger.info(
            f"Zone mismatch for {device_id} tolerated "
            f"(pending assignment to {pending_target})"
        )
        # Kein Warning, kein Resync, kein DB-Update
        # Assignment laeuft — warten bis ACK eintrifft oder Timeout
        return

    # ... bestehende Szenario-Logik A/B/C bleibt unveraendert
    if esp_has_zone and not db_has_zone:
        # Szenario A (bestehend)
        ...
```

**Was `pending_zone_assignment` enthaelt (gesetzt in `zone_service.assign_zone()` Zeile 148):**

Es gibt zwei moegliche Formate (abhaengig von der bestehenden Implementierung):

Format A (dict):
```json
{"target_zone_id": "zone_b", "requested_at": "2026-03-09T12:00:00Z"}
```

Format B (boolean/truthy):
```python
device_metadata["pending_zone_assignment"] = True
```

Der Check `if pending:` funktioniert fuer beide Formate. Die `isinstance(pending, dict)` Pruefung stellt sicher dass auch bei einem einfachen `True`-Wert kein Fehler auftritt.

**Bestehende Cleanup:** `pending_zone_assignment` wird bereits vom `zone_ack_handler` geloescht (Zeile 142 bei `zone_assigned`, Zeile 160 bei `zone_removed`). Das ist korrekt — nach ACK-Empfang soll der Heartbeat-Handler wieder normal pruefen.

**Timeout-Safety:** Falls ein ACK nie ankommt (ESP offline, MQTT-Loss), bleibt `pending_zone_assignment` in der DB. Das ist akzeptabel fuer diesen Auftrag — der pending-Wert wird beim naechsten erfolgreichen Zone-ACK geloescht. Ein separater Cleanup-Mechanismus (z.B. pending > 5min → loeschen) kann spaeter ergaenzt werden.

#### Akzeptanzkriterien Schritt 10

- [ ] Heartbeat waehrend `pending_zone_assignment`: KEIN Warning, KEIN Resync
- [ ] Heartbeat OHNE `pending_zone_assignment` + Mismatch: Bestehende Szenarien A/B/C laufen normal
- [ ] `pending_zone_assignment` als dict UND als boolean/truthy funktioniert
- [ ] Bestehende Heartbeat-Tests bleiben gruen
- [ ] Info-Log statt Warning-Log bei pending Assignment

---

<a name="8-schritt-11"></a>
## 8. Schritt 11: Integrationstests

**Aufwand:** ~2 Stunden

### Testszenarien

**Szenario 1: Zone-Wechsel mit Transfer — Happy Path**

```
Setup: ESP_TEST01 in Zone A mit 2 Subzones (SZ1, SZ2)
Action: assign_zone(ESP_TEST01, zone_b, subzone_strategy="transfer")
Erwartung:
  1. DB: zone_id = zone_b, subzones parent_zone_id = zone_b
  2. MQTT Published: zone/assign mit zone_id=zone_b
  3. Zone-ACK simulieren: {"status": "zone_assigned", "zone_id": "zone_b"}
  4. MQTT Published: subzone/assign fuer SZ1 (parent_zone_id = "")
  5. MQTT Published: subzone/assign fuer SZ2 (parent_zone_id = "")
  6. Subzone-ACKs simulieren
  7. pending_zone_assignment geloescht
```

**Szenario 2: Zone-Wechsel — ACK Timeout**

```
Setup: ESP_TEST01 in Zone A
Action: assign_zone(ESP_TEST01, zone_b)
Erwartung:
  1. DB: zone_id = zone_b (optimistisch)
  2. MQTT Published: zone/assign
  3. KEIN ACK (Timeout 0.5s fuer Test)
  4. MQTTACKTimeoutError geworfen
  5. pending_zone_assignment BLEIBT in device_metadata
  6. KEINE Subzone-MQTT gesendet
```

**Szenario 3: Zone-Wechsel — Error-ACK**

```
Setup: ESP_TEST01 in Zone A
Action: assign_zone(ESP_TEST01, zone_b)
Erwartung:
  1. Zone-ACK: {"status": "error", "message": "NVS write failed"}
  2. Error geloggt
  3. KEINE Subzone-MQTT gesendet
  4. mqtt_sent = False im Response
```

**Szenario 4: Heartbeat waehrend pending Assignment**

```
Setup: ESP_TEST01 hat pending_zone_assignment in device_metadata
Action: Heartbeat mit zone_id = "zone_a" (alt), DB hat zone_id = "zone_b" (neu)
Erwartung:
  1. KEIN Warning-Log (Mismatch wird toleriert)
  2. KEIN Auto-Resync (kein erneutes zone/assign)
```

**Szenario 5: Mock-ESP ueberspringt Bridge**

```
Setup: Mock-ESP (device_id beginnt mit "MOCK_" oder _is_mock_esp() gibt True)
Action: assign_zone(MOCK_ESP01, zone_b)
Erwartung:
  1. Fire-and-forget (kein ACK-Wait)
  2. _publish_zone_assignment() aufgerufen (nicht command_bridge)
```

**Szenario 6: Zone-Removal ueber Bridge**

```
Setup: ESP_TEST01 in Zone A
Action: remove_zone(ESP_TEST01)
Erwartung:
  1. MQTT Published: zone/assign mit zone_id="" (leer)
  2. Zone-ACK simulieren: {"status": "zone_removed"}
  3. DB: zone_id = None
```

### Akzeptanzkriterien Schritt 11

- [ ] Alle 6 Szenarien als Tests implementiert
- [ ] Tests nutzen Mock-MQTT-Client (kein echter Broker noetig)
- [ ] Tests sind async (`@pytest.mark.asyncio`)
- [ ] ACK-Simulation via `asyncio.create_task()` + `bridge.resolve_ack()`
- [ ] Alle Tests gruen

---

<a name="9-akzeptanzkriterien"></a>
## 9. Akzeptanzkriterien Gesamtsystem

### Funktionale Kriterien

- [ ] **Kein fire-and-forget fuer Zone-Wechsel bei echten ESPs** — jeder Zone-Wechsel wartet auf ACK
- [ ] **Kein Subzone-Transfer ohne vorherigen Zone-ACK** — Sequenz garantiert
- [ ] **parent_zone_id in Subzone-Transfer-MQTT ist LEER** — keine Race Condition moeglich
- [ ] **GPIO 0 nicht in subzone/assign Payload** — kein Error 2506
- [ ] **Heartbeat waehrend pending Assignment: kein False-Positive-Warning**
- [ ] **Mock-ESPs nutzen weiterhin fire-and-forget** — kein Warten auf ACK das nie kommt
- [ ] **ACK-Timeout wird sauber behandelt** — pending bleibt, Error geloggt, kein Crash
- [ ] **Error-ACKs loesen Future auf** — Aufrufer kann reagieren statt auf Timeout zu warten
- [ ] **Bridge-Shutdown cancelt pending Futures** — sauberer Server-Stop

### Nicht-funktionale Kriterien

- [ ] **Keine Aenderung des bestehenden fire-and-forget Pfads** — Mock-ESPs und unkritische Operationen (Heartbeat-ACK, Safe-Mode-Enable, LWT-Clear) bleiben beim Publisher
- [ ] **Bestehende Tests bleiben gruen** — `command_bridge=None` Fallback stellt das sicher
- [ ] **Kein Memory-Leak** — `_cleanup()` in `finally`-Block, `shutdown()` beim Server-Stop
- [ ] **Kein Deadlock** — `asyncio.wait_for()` hat Timeout, `resolve_ack()` ist non-blocking
- [ ] **Logging auf richtiger Ebene** — DEBUG fuer normalen Flow, INFO fuer ACK-Success, ERROR fuer Timeout/Failure

### Test-Kriterien

- [ ] `pytest` komplett gruen (alle bestehenden + alle neuen Tests)
- [ ] Unit-Tests fuer MQTTCommandBridge (min. 9 Tests aus Schritt 2)
- [ ] Integrationstests fuer Zone-Wechsel-Szenarien (min. 6 Tests aus Schritt 11)

---

<a name="10-risiken"></a>
## 10. Risiken und Fallbacks

| # | Risiko | Status | Fallback |
|---|--------|--------|----------|
| R1 | MQTT-Handler in anderem Thread als Event-Loop | **Geklaert:** Handler laufen via `run_coroutine_threadsafe()` auf FastAPI-Loop | Nicht noetig |
| R2 | MQTT 5 Correlation Data nicht verfuegbar | **Geklaert:** paho-mqtt mit MQTT 3.1.1 | Payload-basierte `correlation_id` (im Design) |
| R3 | Concurrent Zone-Assigns fuer selben ESP | **Unwahrscheinlich** (ein ESP hat eine Zone) | FIFO-Queue loest aelteste Future zuerst |
| R4 | ACK kommt nie an | 10s Timeout | `pending_zone_assignment` bleibt → Heartbeat-Resync nach 60s |
| R5 | Server-Restart waehrend pending | pending in `device_metadata` (DB) ueberlebt Restart | Naechster Heartbeat loest Resync aus |
| R6 | Subzone-Transfer ohne MQTT | **Im Auftrag behoben:** `_send_transferred_subzones()` neu | Partial-Success bei Timeout |
| R7 | MQTTClient.publish() sync vs Bridge async | Publish blockiert nur kurz (paho buffert intern) | Kein Problem in Praxis |
| R8 | Mock-ESPs brauchen kein MQTT-ACK | `_is_mock_esp()` Check existiert | Bridge-Call nur fuer echte ESPs |

---

## Zusammenfassung: Was wird gebaut

### Neue Dateien

| Datei | Inhalt |
|-------|--------|
| `src/services/mqtt_command_bridge.py` | `MQTTCommandBridge` + `MQTTACKTimeoutError` |
| `tests/unit/test_mqtt_command_bridge.py` | 9+ Unit-Tests |
| `tests/integration/test_zone_bridge.py` | 6+ Integrationstests |

### Geaenderte Dateien

| Datei | Aenderung |
|-------|-----------|
| `src/main.py` | Bridge als Module-Level-Global, Startup/Shutdown |
| `src/mqtt/handlers/zone_ack_handler.py` | `set_command_bridge()`, `resolve_ack()` nach Commit |
| `src/mqtt/handlers/subzone_ack_handler.py` | `set_command_bridge()`, `resolve_ack()` nach Commit |
| `src/services/zone_service.py` | Constructor + Bridge, `assign_zone()` ACK-Wait, `_send_transferred_subzones()`, `remove_zone()` ACK-Wait |
| `src/api/v1/zone.py` | Bridge-Injection via `get_command_bridge()` |
| `src/api/deps.py` | `get_command_bridge()` Dependency |

### Nicht geaenderte Dateien (bewusst)

| Datei | Begruendung |
|-------|-------------|
| `src/mqtt/publisher.py` | Bridge ist ein eigener Service, nicht Publisher-Erweiterung |
| `src/mqtt/client.py` | Keine Aenderung am MQTT-Client noetig |
| `src/services/subzone_service.py` | Standalone Subzone-Ops bleiben vorerst fire-and-forget |
| `src/mqtt/handlers/sensor_handler.py` | Cache-Fix kommt in Phase 3.2 |
| ESP32-Firmware | Keine Firmware-Aenderungen — alles server-seitig |

### Reihenfolge

```
Schritt  1:  MQTTCommandBridge Klasse               (neue Datei)
Schritt  2:  Unit-Tests                              (neue Datei)
Schritt  3:  zone_ack_handler erweitern              (bestehende Datei)
Schritt  4:  subzone_ack_handler erweitern           (bestehende Datei)
Schritt  5:  main.py Registration + deps.py          (bestehende Dateien)
         → pytest — alles gruen? Weiter.
Schritt  6:  zone_service.assign_zone() umstellen    (bestehende Datei)
Schritt  7:  zone_service.remove_zone() umstellen    (bestehende Datei)
Schritt  8:  zone.py Bridge-Injection                (bestehende Datei)
Schritt  9:  _handle_subzone_strategy Return-Wert    (bestehende Datei)
         → pytest — alles gruen? Weiter.
Schritt 10:  heartbeat_handler pending-Check         (bestehende Datei)
Schritt 11:  Integrationstests                       (neue Datei)
         → pytest — alles gruen? FERTIG.
```
