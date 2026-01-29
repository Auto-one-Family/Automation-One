# BUGBOT.md - AutomationOne Framework

> **Projekt:** Industrielles IoT-Framework für Gewächshaus-Automatisierung  
> **Version:** 1.0  
> **Letzte Aktualisierung:** 2026-01-29

---

## 1. Architektur-Überblick

```
ESP32 → MQTT → Server (FastAPI) → WebSocket → Frontend (Vue 3)
```

| Komponente | Pfad | Sprache | Rolle |
|------------|------|---------|-------|
| ESP32 Firmware | `El Trabajante/src/` | C++ | Sensor-Auslesung, Aktor-Steuerung |
| Server | `El Servador/god_kaiser_server/src/` | Python | Control Hub, Datenverarbeitung |
| Frontend | `El Frontend/src/` | TypeScript/Vue | UI, WebSocket-Client |
| Dokumentation | `.claude/` | Markdown | KI-Agenten-Referenz |

**Kern-Prinzip:** Server-Centric Design. ESP32 sendet RAW-Daten, Server verarbeitet intelligent.

---

## 2. Kritische Invarianten (IMMER PRÜFEN)

### 2.1 MQTT-Topics

**Format:** `kaiser/{kaiser_id}/esp/{esp_id}/{type}/{gpio}/{action}`

| Topic-Pattern | Richtung | Invariante |
|--------------|----------|------------|
| `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` | ESP → Server | `gpio` muss 0-39 sein |
| `kaiser/god/esp/{esp_id}/actuator/{gpio}/command` | Server → ESP | `value` bei PWM: 0.0-1.0 |
| `kaiser/god/esp/{esp_id}/system/heartbeat` | ESP → Server | Muss alle 60s gesendet werden |
| `kaiser/broadcast/emergency` | Server → alle ESPs | Darf NIE ohne Safety-Check publiziert werden |

**Fehler wenn:**
- `kaiser_id` fehlt oder leer ist
- `esp_id` nicht Pattern `ESP_[A-Z0-9]{8}` entspricht
- Topic-Segmente fehlen oder vertauscht sind

### 2.2 PWM-Werte

| Schicht | Wertebereich | Invariante |
|---------|--------------|------------|
| Frontend UI | 0-100 (Prozent) | Integer |
| REST API | 0.0-1.0 (Float) | Muss normalisiert sein |
| ESP32 intern | 0-255 (8-bit) | Wird intern konvertiert |

**Fehler wenn:**
- API-Wert > 1.0 oder < 0.0
- Frontend-Wert als Float an API gesendet wird
- Konvertierung fehlt

### 2.3 GPIO-Validierung

```
ESP32-WROOM verfügbar: 4, 5, 12-19, 21-23, 25-27, 32-33
ESP32-WROOM input-only: 34, 35, 36, 39
ESP32-WROOM reserviert: 0-3, 6-11 (Flash, Strapping)
```

**Fehler wenn:**
- Actuator auf input-only GPIO (34-39) konfiguriert wird
- GPIO 6-11 verwendet werden
- I2C-Adresse außerhalb 0x08-0x77

### 2.4 Error-Code-Ranges

| Range | Bereich | Invariante |
|-------|---------|------------|
| 1000-1999 | Hardware | GPIO, I2C, Sensor, Actuator |
| 2000-2999 | Service | NVS, Config, Storage |
| 3000-3999 | Communication | WiFi, MQTT, HTTP |
| 4000-4999 | Application | State, Command, Payload |

**Fehler wenn:**
- Neuer Error-Code außerhalb korrekter Range definiert wird
- Error-Code-String nicht mit Range übereinstimmt

### 2.5 Sensor-Payload (Phase 1+)

**Required Fields bei ESP → Server:**
```json
{
  "esp_id": "ESP_12AB34CD",   // REQUIRED
  "gpio": 4,                   // REQUIRED
  "sensor_type": "temp_ds18b20", // REQUIRED
  "raw": 2048,                 // REQUIRED (oder "raw_value")
  "ts": 1735818000,            // REQUIRED (oder "timestamp")
  "raw_mode": true,            // REQUIRED (immer true)
  "quality": "good"            // REQUIRED für Phase 1
}
```

**Phase 1 Fehlerwerte (DS18B20):**
- `-127.0°C` → Sensor disconnected (Error 1060)
- `85.0°C` → Power-On Reset (Error 1061)
- Diese Werte MÜSSEN als `quality: "error"` markiert werden

### 2.6 Safety-Constraints

**Emergency-Stop Invarianten:**
- `actuator->emergency_stopped == true` → ALLE Commands müssen blockiert werden
- Emergency-Stop darf NUR durch expliziten User-Reset aufgehoben werden
- `kaiser/broadcast/emergency` darf NUR bei echtem Emergency gesendet werden

**Timeout-Protection:**
- Actuator `MAX_RUNTIME` muss definiert sein
- Actuator muss nach Timeout automatisch abschalten

---

## 3. Kein Bug (Do Not Flag)

### 3.1 Test-Patterns

**Pfade ignorieren bei Style/Convention-Checks:**
```
El Servador/god_kaiser_server/tests/
El Trabajante/tests/
El Frontend/tests/
**/conftest.py
**/*_test.py
**/test_*.py
```

**Erlaubte Patterns in Tests:**
- `sqlite+aiosqlite:///:memory:` (In-Memory Test-DB)
- `@pytest.fixture` mit komplexen Mocks
- `MagicMock()`, `AsyncMock()`, `patch()`
- `assert` ohne Exception-Handling
- Hardcoded Test-Daten (ESP_00000001, GPIO 4, etc.)

### 3.2 Wokwi-Simulation

**Pfade:**
```
El Trabajante/tests/wokwi/
*.wokwi.yaml
*.wokwi-ci.yaml
```

**Erlaubt:**
- Simulierte GPIO/I2C-Werte
- Hardcoded WiFi-Credentials in Simulation
- Zeitraffer-Tests (Millisekunden statt Sekunden)

### 3.3 Mock-ESPs

**Erlaubt im Debug/Test-Kontext:**
- `ESP_00000001` bis `ESP_00000010` (Test-IDs)
- `POST /api/v1/debug/mock-esp` Endpoints
- Mock-Sensor-Daten mit festen Werten

### 3.4 Archiv-Ordner

**Komplett ignorieren:**
```
ARCHIV/
**/ARCHIV/
**/archive/
**/*.bak
```

### 3.5 CI/CD-Dateien

**Bekannte Patterns (keine False Positives):**
```
.github/workflows/*.yml
pyproject.toml
platformio.ini
alembic/
```

---

## 4. Domain-spezifische Checks

### 4.1 MQTT-Handler (Server)

**Bei Änderungen in `src/mqtt/handlers/` prüfen:**
- Topic-Pattern stimmt mit `constants.py` überein
- Payload-Validierung mit Pydantic-Schema
- Fehlerhafte Payloads werden geloggt, nicht gecrashed
- WebSocket-Broadcast bei relevanten Events

### 4.2 Sensor-Processing (Server)

**Bei Änderungen in `src/sensors/` prüfen:**
- `raw_mode: true` wird als Required behandelt
- Pi-Enhanced Processing nur wenn `sensor_config.pi_enhanced == True`
- Library-Loader nutzt Singleton-Pattern
- Processor gibt `quality` zurück

### 4.3 Actuator-Steuerung

**Bei Änderungen in `src/services/actuator_service.py` prüfen:**
- `SafetyService.validate_actuator_command()` wird VOR Publish aufgerufen
- Emergency-Stop-Check erfolgt
- PWM-Value ist im Bereich 0.0-1.0
- Timeout wird getrackt

### 4.4 ESP32-Firmware

**Bei Änderungen in `El Trabajante/src/` prüfen:**
- GPIO-Reservation vor Nutzung (`gpioManager.requestPin()`)
- Error-Code aus korrekter Range
- MQTT-Payload entspricht Server-Erwartung
- NVS-Keys folgen Konvention (max 15 chars)

### 4.5 Database-Migrations

**Bei Änderungen in `alembic/versions/` prüfen:**
- `upgrade()` und `downgrade()` sind beide implementiert
- Keine Daten-Löschung ohne expliziten Backup-Hinweis
- Foreign-Key-Constraints sind korrekt

---

## 5. Fokus-Prioritäten nach Phase

### Phase 1: Hardware Foundation (Aktuell)

**Besonders prüfen bei Änderungen:**
- `sensor_handler.py`: Quality-Feld, Error-Code-Mapping
- `i2c_bus.cpp/h`: Recovery-Logik, Bus-Stuck-Detection
- `onewire_bus.cpp/h`: DS18B20 Fehlerwert-Erkennung
- `error_codes.h`: Neue Codes in Range 1015-1018, 1060-1063

**Invarianten Phase 1:**
- `-127°C` muss Error-Code 1060 triggern
- `85°C` (Power-On) muss Error-Code 1061 triggern
- `quality: "error"` bei ungültigen Messwerten
- I2C-Recovery muss nach 3 Versuchen aufgeben

### Phase 2+: Erweiterungen

**Zukünftige Fokus-Bereiche (als Referenz):**
- Logic Engine: Rule-Evaluation, Cross-ESP-Commands
- Zone-Management: Zone-ID-Format, MQTT zone/assign
- Kaiser-Nodes: Selektives Download-System

---

## 6. Code-Konventionen

### Python (Server)

```python
# Korrekt:
def handle_sensor_data(self, topic: str, payload: dict) -> None:

# Falsch (kein Type-Hint):
def handle_sensor_data(self, topic, payload):
```

- Type-Hints sind REQUIRED für public Functions
- Pydantic-Schemas für API-Input/Output
- Async für I/O-Operations

### C++ (ESP32)

```cpp
// Korrekt - Singleton-Zugriff:
GPIOManager& gpioManager = GPIOManager::getInstance();

// Falsch - Direkte Instanziierung:
GPIOManager gpioManager;
```

- Singleton-Pattern für Manager-Klassen
- Error-Codes als `#define` in `error_codes.h`
- `constrain()` für Wertebereich-Validierung

### TypeScript (Frontend)

```typescript
// Korrekt:
const pwmValue: number = frontendPercent / 100;

// Falsch (keine Typen):
const pwmValue = frontendPercent / 100;
```

- Explizite Typen für alle Variablen
- Interfaces für API-Responses
- Pinia für State-Management

---

## 7. Severity-Hinweise

| Severity | Wann? |
|----------|-------|
| **High** | Safety-Constraint verletzt, Emergency-Stop umgangen, Daten-Korruption möglich |
| **Medium** | API-Contract gebrochen, Payload-Validierung fehlt, Error-Handling unvollständig |
| **Low** | Code-Konvention verletzt, Logging fehlt, Dokumentation veraltet |

---

## 8. Bekannte Patterns (Kein Bug)

| Pattern | Kontext | Warum kein Bug |
|---------|---------|----------------|
| `kaiser_id = "god"` | Überall | Standard-Wert, God-Kaiser fungiert als Kaiser |
| `raw_mode = true` | Sensor-Payload | Immer true, ESP sendet nur RAW-Daten |
| `QoS 2` für Config | MQTT | Garantierte Delivery für kritische Messages |
| `heap_free` vs `free_heap` | Heartbeat | Beide akzeptiert (Legacy-Kompatibilität) |
| `ts` vs `timestamp` | Payloads | Beide akzeptiert (Alias) |

---

**Ende BUGBOT.md**