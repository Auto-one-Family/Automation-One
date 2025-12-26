# Test-Infrastruktur Plan: ESP32 ↔ Server Integration

**Projekt:** AutomationOne Framework
**Status:** Phase 1-2 abgeschlossen, Phase 3-6 offen
**Ziel:** Industrietaugliche Test-Infrastruktur mit Mock/Test/Production-Unterscheidung

---

## WICHTIGE HINWEISE FÜR KI-AGENTEN

1. **Dokumentations-Workflow:** Erweitere `TEST_WORKFLOW.md` schrittweise - erstelle KEINE neuen Analyse-Dokumente
2. **Bestehende Infrastruktur nutzen:** MockESP32Client und Debug API sind bereits vollständig implementiert
3. **Tests modular halten:** User erstellt Mock ESP → fügt Sensoren/Aktoren hinzu → testet

---

## Status-Übersicht

| Phase | Status | Beschreibung |
|-------|--------|--------------|
| Phase 1 | ✅ DONE | DB Schema: DataSource enum + data_source Spalten |
| Phase 2 | ✅ DONE | Handler: _detect_data_source() in allen Handlern |
| Phase 3 | 📋 TODO | MockESP32Client: MQTT-Broker-Modus (opt-in) |
| Phase 4 | 📋 TODO | Repository: Filterung nach data_source |
| Phase 5 | 📋 TODO | Integration Tests mit modularer Sensor/Aktor-Erstellung |
| Phase 6 | 📋 TODO | Cleanup Service: Test-Daten automatisch löschen |

---

## Bestehende Infrastruktur (NUTZEN, NICHT NEU IMPLEMENTIEREN!)

### 1. MockESP32Client (1433 Zeilen) - BEREITS VOLLSTÄNDIG

**Location:** `El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py`

**Was bereits funktioniert:**
- Alle MQTT-Topics (sensor, actuator, heartbeat, zone, library)
- 12 System-States (BOOT → OPERATIONAL → SAFE_MODE etc.)
- Multi-Value-Sensoren (z.B. SHT31 mit Temperatur + Humidity)
- Actuator Response/Alert Topics
- Zone-Management und Subzone-Assignment
- Message-Tracking für Test-Assertions

**Wichtige Methoden:**
```python
# Sensor hinzufügen und Wert setzen
mock.set_sensor_value(gpio=4, raw_value=23.5, sensor_type="DS18B20")

# Multi-Value-Sensor (z.B. SHT31)
mock.set_multi_value_sensor(
    gpio=21,
    sensor_type="SHT31",
    primary_value=23.5,
    secondary_values={"humidity": 65.2}
)

# Actuator konfigurieren
mock.configure_actuator(gpio=5, actuator_type="relay", name="Pump")

# Command ausführen
response = mock.handle_command("actuator_set", {"gpio": 5, "value": 1})

# Published Messages abrufen
messages = mock.get_published_messages()
messages = mock.get_messages_by_topic_pattern("/sensor/")
```

### 2. Debug API - BEREITS VOLLSTÄNDIG

**Location:** `El Servador/god_kaiser_server/src/api/v1/debug.py`

**Endpoints für modulare Tests:**

```bash
# Mock ESP erstellen (registriert auch in DB!)
POST /v1/debug/mock-esp
{
    "esp_id": "ESP_MOCK_TEST01",
    "zone_id": "greenhouse_1",
    "zone_name": "Gewächshaus 1"
}

# Sensor zu Mock ESP hinzufügen
POST /v1/debug/mock-esp/{esp_id}/sensors
{
    "gpio": 4,
    "sensor_type": "DS18B20",
    "name": "Temperatur Boden"
}

# Sensor-Wert setzen (und MQTT publishen)
POST /v1/debug/mock-esp/{esp_id}/sensors/{gpio}
{
    "raw_value": 23.5,
    "quality": "good",
    "publish": true
}

# Actuator hinzufügen
POST /v1/debug/mock-esp/{esp_id}/actuators
{
    "gpio": 5,
    "actuator_type": "relay",
    "name": "Bewässerungspumpe"
}

# Sensor entfernen (Pin freigeben)
DELETE /v1/debug/mock-esp/{esp_id}/sensors/{gpio}

# Mock ESP löschen
DELETE /v1/debug/mock-esp/{esp_id}
```

### 3. DataSource Detection - BEREITS IMPLEMENTIERT

**Detection-Priorität (6 Stufen):**
```python
def _detect_data_source(esp_device, payload: dict) -> str:
    # 1. Explicit _test_mode flag → TEST
    if payload.get("_test_mode"):
        return DataSource.TEST.value

    # 2. Explicit _source field → use value
    if "_source" in payload:
        return DataSource(payload["_source"].lower()).value

    # 3. Device hardware_type == "MOCK_ESP32" → MOCK
    if esp_device.hardware_type == "MOCK_ESP32":
        return DataSource.MOCK.value

    # 4. Device capabilities.mock == True → MOCK
    if esp_device.capabilities.get("mock"):
        return DataSource.MOCK.value

    # 5. ESP ID prefix detection
    esp_id = payload.get("esp_id", "")
    if esp_id.startswith("MOCK_"): return DataSource.MOCK.value
    if esp_id.startswith("TEST_"): return DataSource.TEST.value
    if esp_id.startswith("SIM_"):  return DataSource.SIMULATION.value

    # 6. Default
    return DataSource.PRODUCTION.value
```

---

## Phase 3: MQTT-Broker-Modus (OPT-IN)

### Ziel

MockESP32Client soll optional echte MQTT-Messages an einen Broker senden können.

### Implementierung

**Datei:** `El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py`

**Änderungen (ERWEITERN, nicht ersetzen!):**

```python
from enum import Enum
from typing import Optional
import paho.mqtt.client as mqtt

class BrokerMode(str, Enum):
    DIRECT = "direct"   # Default: Handler direkt aufrufen (schnell)
    MQTT = "mqtt"       # Echte MQTT-Messages an Broker

class MockESP32Client:
    def __init__(
        self,
        esp_id: str = "ESP_TEST001",
        kaiser_id: str = "god",
        broker_mode: BrokerMode = BrokerMode.DIRECT,  # NEU
        mqtt_config: Optional[dict] = None,            # NEU
        auto_heartbeat: bool = False
    ):
        # Bestehende Initialisierung bleibt...
        self.broker_mode = broker_mode
        self._mqtt_client: Optional[mqtt.Client] = None
        self._mqtt_connected = False

        if broker_mode == BrokerMode.MQTT:
            self._connect_mqtt(mqtt_config or {"host": "localhost", "port": 1883})

    def _connect_mqtt(self, config: dict) -> bool:
        """Verbindung zum echten MQTT-Broker herstellen."""
        try:
            self._mqtt_client = mqtt.Client(client_id=f"mock_{self.esp_id}")
            self._mqtt_client.connect(config["host"], config.get("port", 1883))
            self._mqtt_client.loop_start()
            self._mqtt_connected = True
            return True
        except Exception as e:
            logger.warning(f"MQTT connection failed: {e}")
            return False

    def _publish_to_broker(self, topic: str, payload: dict):
        """Publish an echten Broker wenn im MQTT-Modus."""
        if self.broker_mode == BrokerMode.MQTT and self._mqtt_connected:
            self._mqtt_client.publish(topic, json.dumps(payload), qos=1)
        # published_messages wird IMMER befüllt (für Test-Assertions)
```

### Test-Fixtures

**Datei:** `El Servador/god_kaiser_server/tests/esp32/conftest.py`

**Hinzufügen:**

```python
import socket
import pytest
from tests.esp32.mocks.mock_esp32_client import MockESP32Client, BrokerMode

def is_mqtt_broker_available(host: str = "localhost", port: int = 1883) -> bool:
    """Prüft ob MQTT-Broker erreichbar ist."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except:
        return False

@pytest.fixture
def mock_esp32_with_broker():
    """Mock-ESP mit echter MQTT-Verbindung - überspringt wenn kein Broker."""
    if not is_mqtt_broker_available():
        pytest.skip("MQTT Broker nicht erreichbar auf localhost:1883")

    mock = MockESP32Client(
        esp_id=f"MOCK_BROKER_{int(time.time() * 1000) % 100000:05d}",
        broker_mode=BrokerMode.MQTT
    )

    yield mock

    if mock._mqtt_client:
        mock._mqtt_client.loop_stop()
        mock._mqtt_client.disconnect()
```

### Dokumentation aktualisieren

**Datei:** `.claude/TEST_WORKFLOW.md`

Füge hinzu:
- Section "MQTT-Broker-Tests" mit Fixture-Beschreibung
- Hinweis auf `pytest.skip` wenn Broker nicht verfügbar

---

## Phase 4: Repository-Filterung

### Ziel

Datenbank-Abfragen nach data_source filtern können.

### Implementierung

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`

**Hinzufügen:**

```python
from src.db.models.enums import DataSource

class SensorRepository:
    # ... bestehende Methoden ...

    async def get_by_source(
        self,
        source: DataSource,
        limit: int = 100,
        esp_id: Optional[uuid.UUID] = None
    ) -> List[SensorData]:
        """Sensor-Daten nach Quelle filtern."""
        query = select(SensorData).where(
            SensorData.data_source == source.value
        )
        if esp_id:
            query = query.where(SensorData.esp_id == esp_id)
        query = query.order_by(SensorData.timestamp.desc()).limit(limit)
        result = await self.session.execute(query)
        return result.scalars().all()

    async def get_production_only(self, limit: int = 100) -> List[SensorData]:
        """Nur Production-Daten (ohne Mock/Test)."""
        return await self.get_by_source(DataSource.PRODUCTION, limit)

    async def cleanup_test_data(self, older_than_hours: int = 24) -> int:
        """Test-Daten löschen die älter als X Stunden sind."""
        cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
        query = delete(SensorData).where(
            SensorData.data_source == DataSource.TEST.value,
            SensorData.timestamp < cutoff
        )
        result = await self.session.execute(query)
        await self.session.commit()
        return result.rowcount

    async def count_by_source(self) -> Dict[str, int]:
        """Zählt Einträge pro Daten-Quelle."""
        query = select(
            SensorData.data_source,
            func.count(SensorData.id)
        ).group_by(SensorData.data_source)
        result = await self.session.execute(query)
        return {row[0]: row[1] for row in result.all()}
```

**Datei:** `El Servador/god_kaiser_server/src/db/repositories/actuator_repo.py`

Gleiche Methoden für `ActuatorHistory`.

### API-Erweiterung

**Datei:** `El Servador/god_kaiser_server/src/api/v1/sensors.py`

**Hinzufügen:**

```python
@router.get("/data/by-source/{source}")
async def get_sensor_data_by_source(
    source: str,
    limit: int = Query(default=100, le=1000),
    current_user = Depends(require_auth),
    session = Depends(get_session)
):
    """Sensor-Daten nach Quelle gefiltert."""
    try:
        data_source = DataSource(source)
    except ValueError:
        raise HTTPException(400, f"Invalid source. Valid: {[e.value for e in DataSource]}")

    repo = SensorRepository(session)
    data = await repo.get_by_source(data_source, limit)
    return {"success": True, "source": source, "count": len(data), "data": data}
```

---

## Phase 5: Modulare Integration Tests

### Ziel

Tests die Mock ESPs dynamisch erstellen und Sensoren/Aktoren hinzufügen.

### Test-Pattern (WICHTIG!)

```python
"""
MODULARES TEST-PATTERN:
1. Mock ESP erstellen (via Debug API oder MockESP32Client)
2. Sensoren/Aktoren auf Pins hinzufügen
3. Werte setzen und MQTT-Messages triggern
4. Server-Verarbeitung validieren
5. Datenbank-Einträge prüfen
6. Cleanup
"""

import pytest
from tests.esp32.mocks.mock_esp32_client import MockESP32Client

class TestModularSensorIntegration:
    """Modulare Sensor-Tests mit dynamischer Pin-Konfiguration."""

    @pytest.mark.asyncio
    async def test_add_sensor_and_publish(self, db_session):
        """User erstellt Mock ESP, fügt Sensor hinzu, publiziert Daten."""
        # 1. Mock ESP erstellen
        mock = MockESP32Client(esp_id="MOCK_MODULAR_001")
        mock.configure_zone("test_zone", "master_zone", "subzone_a")

        # 2. Sensor auf GPIO 4 hinzufügen (DS18B20 Temperatur)
        mock.set_sensor_value(
            gpio=4,
            raw_value=23.5,
            sensor_type="DS18B20",
            name="Boden Temperatur",
            unit="°C",
            quality="good"
        )

        # 3. Sensor-Daten "publishen" (simuliert)
        response = mock.handle_command("sensor_read", {"gpio": 4})

        # 4. Assertions
        assert response["status"] == "ok"
        assert response["data"]["value"] == 23.5

        # 5. Published Messages prüfen
        messages = mock.get_messages_by_topic_pattern("/sensor/4/data")
        assert len(messages) >= 1
        assert messages[0]["payload"]["sensor_type"] == "DS18B20"

    @pytest.mark.asyncio
    async def test_multiple_sensors_different_types(self, db_session):
        """Mehrere Sensoren verschiedener Typen auf einem ESP."""
        mock = MockESP32Client(esp_id="MOCK_MULTI_SENSOR")
        mock.configure_zone("greenhouse", "main", "zone_a")

        # Temperatur-Sensor
        mock.set_sensor_value(gpio=4, raw_value=24.5, sensor_type="DS18B20")

        # Feuchtigkeits-Sensor (Multi-Value)
        mock.set_multi_value_sensor(
            gpio=21,
            sensor_type="SHT31",
            primary_value=25.0,
            secondary_values={"humidity": 68.5}
        )

        # pH-Sensor
        mock.set_sensor_value(gpio=34, raw_value=6.8, sensor_type="pH")

        # Batch-Read
        response = mock.handle_command("sensor_batch", {})

        assert response["status"] == "ok"
        assert response["data"]["count"] == 3

    @pytest.mark.asyncio
    async def test_actuator_with_sensor_feedback(self, db_session):
        """Actuator steuern und Sensor-Feedback prüfen."""
        mock = MockESP32Client(esp_id="MOCK_FEEDBACK")
        mock.configure_zone("irrigation", "main", "zone_b")

        # Pumpe konfigurieren
        mock.configure_actuator(gpio=5, actuator_type="pump", name="Bewässerung")

        # Feuchtigkeitssensor
        mock.set_sensor_value(gpio=34, raw_value=30.0, sensor_type="moisture")

        # Pumpe einschalten
        response = mock.handle_command("actuator_set", {
            "gpio": 5,
            "value": 1,
            "mode": "digital"
        })

        assert response["status"] == "ok"
        assert response["data"]["state"] is True

        # Status-Message wurde publiziert
        status_msgs = mock.get_messages_by_topic_pattern("/actuator/5/status")
        assert len(status_msgs) >= 1


class TestDataSourceTracking:
    """Tests für data_source Tracking in der Datenbank."""

    @pytest.mark.asyncio
    async def test_mock_data_marked_correctly(self, db_session):
        """Mock-Daten werden mit data_source='mock' gespeichert."""
        from src.db.repositories import SensorRepository
        from src.db.models.enums import DataSource

        # Mock ESP erstellen (hardware_type=MOCK_ESP32)
        # ... ESP in DB registrieren ...

        # Sensor-Daten speichern
        repo = SensorRepository(db_session)
        # ... Handler aufrufen ...

        # Prüfen dass data_source korrekt ist
        counts = await repo.count_by_source()
        assert DataSource.MOCK.value in counts

    @pytest.mark.asyncio
    async def test_production_filter_excludes_mock(self, db_session):
        """Production-Filter schließt Mock-Daten aus."""
        from src.db.repositories import SensorRepository

        repo = SensorRepository(db_session)

        # Nur Production-Daten abrufen
        prod_data = await repo.get_production_only(limit=100)

        for data in prod_data:
            assert data.data_source == "production"
            assert not data.esp_id.startswith("MOCK_")
```

### Test-Datei erstellen

**Datei:** `El Servador/god_kaiser_server/tests/integration/test_modular_esp_integration.py`

Enthält die oben gezeigten Test-Klassen.

---

## Phase 6: Test-Cleanup-Service

### Ziel

AuditRetentionService erweitern um Test-Daten automatisch zu löschen.

### Implementierung

**Datei:** `El Servador/god_kaiser_server/src/services/audit_retention_service.py`

**Erweitern:**

```python
from src.db.models.enums import DataSource

class AuditRetentionService:
    # ... bestehende Methoden ...

    # Retention-Policies für Test-Daten
    TEST_DATA_RETENTION = {
        DataSource.TEST: timedelta(hours=24),      # 24h
        DataSource.MOCK: timedelta(days=7),        # 7 Tage
        DataSource.SIMULATION: timedelta(days=30), # 30 Tage
        DataSource.PRODUCTION: None,               # Nie automatisch löschen
    }

    async def cleanup_test_sensor_data(self) -> Dict[str, int]:
        """Löscht alte Test/Mock/Simulation Sensor-Daten."""
        deleted = {}

        for source, retention in self.TEST_DATA_RETENTION.items():
            if retention is None:
                continue

            cutoff = datetime.utcnow() - retention

            query = delete(SensorData).where(
                SensorData.data_source == source.value,
                SensorData.timestamp < cutoff
            )
            result = await self.session.execute(query)
            deleted[source.value] = result.rowcount

        await self.session.commit()
        logger.info(f"Test data cleanup: {deleted}")
        return deleted

    async def cleanup_test_actuator_data(self) -> Dict[str, int]:
        """Löscht alte Test/Mock Actuator-History."""
        # Analog zu sensor data
        pass

    async def run_full_test_cleanup(self) -> Dict[str, Any]:
        """Führt komplette Test-Daten-Bereinigung durch."""
        sensor_result = await self.cleanup_test_sensor_data()
        actuator_result = await self.cleanup_test_actuator_data()

        return {
            "sensor_data": sensor_result,
            "actuator_history": actuator_result,
            "timestamp": datetime.utcnow().isoformat()
        }
```

### Debug-Endpoint

**Datei:** `El Servador/god_kaiser_server/src/api/v1/debug.py`

**Hinzufügen:**

```python
@router.delete("/test-data/cleanup")
async def cleanup_test_data(
    include_mock: bool = Query(default=False),
    current_user: AdminUser = None,
    session = Depends(get_session)
):
    """Test-Daten aus Datenbank löschen."""
    from src.services.audit_retention_service import AuditRetentionService

    service = AuditRetentionService(session)
    result = await service.run_full_test_cleanup()

    return {
        "success": True,
        "deleted": result,
        "include_mock": include_mock
    }
```

---

## Implementierungs-Reihenfolge

```
Phase 3: MockESP32Client Broker-Mode ──┐
                                       ├──► Phase 5: Integration Tests
Phase 4: Repository-Filterung ────────┘
                                           │
Phase 6: Cleanup-Service ──────────────────┘ (parallel möglich)
```

---

## Checkliste

### Phase 3: MockESP32Client Broker-Mode
- [ ] `BrokerMode` Enum hinzufügen
- [ ] `_connect_mqtt()` implementieren
- [ ] `_publish_to_broker()` in alle Publish-Methoden integrieren
- [ ] `mock_esp32_with_broker` Fixture erstellen
- [ ] `is_mqtt_broker_available()` Helper
- [ ] TEST_WORKFLOW.md aktualisieren

### Phase 4: Repository-Filterung
- [ ] `get_by_source()` in SensorRepository
- [ ] `get_production_only()` in SensorRepository
- [ ] `cleanup_test_data()` in SensorRepository
- [ ] `count_by_source()` in SensorRepository
- [ ] Gleiche Methoden in ActuatorRepository
- [ ] API-Endpoint `/data/by-source/{source}`

### Phase 5: Integration Tests
- [ ] `test_modular_esp_integration.py` erstellen
- [ ] Tests für dynamische Sensor-Erstellung
- [ ] Tests für Multi-Value-Sensoren
- [ ] Tests für Actuator mit Feedback
- [ ] Tests für data_source Tracking

### Phase 6: Cleanup-Service
- [ ] `TEST_DATA_RETENTION` Konfiguration
- [ ] `cleanup_test_sensor_data()` in AuditRetentionService
- [ ] `cleanup_test_actuator_data()` in AuditRetentionService
- [ ] Debug-Endpoint `/test-data/cleanup`

---

## Kritische Dateien

| Komponente | Datei |
|------------|-------|
| MockESP32Client | `tests/esp32/mocks/mock_esp32_client.py` |
| Debug API | `src/api/v1/debug.py` |
| Sensor Handler | `src/mqtt/handlers/sensor_handler.py` |
| Actuator Handler | `src/mqtt/handlers/actuator_handler.py` |
| DataSource Enum | `src/db/models/enums.py` |
| Sensor Repository | `src/db/repositories/sensor_repo.py` |
| Actuator Repository | `src/db/repositories/actuator_repo.py` |
| Audit Service | `src/services/audit_retention_service.py` |
| Test Fixtures | `tests/esp32/conftest.py` |

---

## Dokumentations-Workflow

**WICHTIG:** Bei jeder Phase-Fertigstellung:

1. `TEST_WORKFLOW.md` aktualisieren (nicht neues Dokument erstellen!)
2. Neue Fixtures und Patterns dokumentieren
3. Beispiel-Code hinzufügen

**TEST_WORKFLOW.md Struktur:**
```markdown
## 1. Server-Tests (pytest) - Produktionsreif ✅
   ### 1.x MQTT-Broker-Tests (Phase 3)
   ### 1.x+1 Data-Source-Filterung (Phase 4)
   ### 1.x+2 Modulare ESP-Tests (Phase 5)
```

---

**Letzte Aktualisierung:** 2025-12-24
**Version:** 2.0 (Angepasst an tatsächliche Code-Patterns)
