# Bugbot Rules – AutomationOne Framework

> **Zweck:** Bugbot mit Projekt-Kontext versorgen, damit Reviews gezielter und mit weniger False Positives laufen.
> **Referenz:** `Hierarchie.md`, `.claude/CLAUDE.md`, `.claude/CLAUDE_SERVER.md`, `.claude/CLAUDE_FRONTEND.md`

---

## 1. Projekt-Architektur (Kurz)

**4-Layer-System:**
- **El Frontend** (Vue 3) → HTTP REST + WebSocket → **God-Kaiser Server** (FastAPI)
- **God-Kaiser Server** → MQTT (TLS 8883) → **ESP32-Agenten** (C++ Firmware)

**Wichtige Konzepte:**
- `kaiser_id="god"` – God-Kaiser steuert ESPs direkt (keine Kaiser-Nodes)
- MQTT-Topics: `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`, `.../actuator/{gpio}/command`
- ESP-ID-Format: `ESP_{6-8 hex chars}` (z.B. `ESP_D0B19C`)
- Zone-System: Master Zone → Zone → SubZone (Sensor/Aktor-Level)

---

## 2. Test-Infrastruktur – Bitte nicht als Bugs melden

### 2.1 Server-Tests (pytest)

**Pfade:** `El Servador/god_kaiser_server/tests/`

| Kategorie | Pfad | Hinweis |
|-----------|------|---------|
| Unit | `tests/unit/` | Mocks, Fixtures, SQLite in-memory |
| Integration | `tests/integration/` | MockESP32Client, async Tests |
| ESP32-Mock | `tests/esp32/` | MockESP32Client (~1400 Zeilen), MQTT-Simulation |
| E2E | `tests/e2e/` | End-to-End-Workflows |

**Typische Patterns (keine Bugs):**
- `conftest.py` – pytest Fixtures, `sys.path`-Manipulation für Imports
- `MockESP32Client` – Hardware-Simulation, `handle_command()`, `get_published_messages()`
- `sqlite+aiosqlite:///:memory:` – bewusst für Tests, kein PostgreSQL
- `@pytest.mark.esp32`, `@pytest.mark.integration` – Marker für Test-Kategorien
- `data_source=DataSource.MOCK` – Test-Daten mit Source-Tracking

### 2.2 Wokwi ESP32-Simulation

**Pfade:** `El Trabajante/tests/wokwi/`, `El Trabajante/tests/wokwi/scenarios/`

- YAML-Szenarien mit `wait-serial`-Steps (Wokwi CLI Format)
- Keine Python/JS-Logik – nur Serial-Output-Erwartungen
- Szenarien: boot, sensor, actuator, zone, emergency, config, gpio, onewire, i2c, nvs, pwm

### 2.3 CI/CD

**Pfade:** `.github/workflows/`

- `esp32-tests.yml` – MockESP32Client-Tests
- `server-tests.yml` – pytest Unit + Integration
- `wokwi-tests.yml` – Wokwi CLI Simulation
- `pr-checks.yml` – Build-Validierung

---

## 3. Fokus-Bereiche für Reviews

**Priorität hoch (Production-Code):**
- `El Servador/god_kaiser_server/src/` – API, MQTT-Handler, Services, DB
- `El Trabajante/src/` – Firmware, MQTT, Sensor/Actuator-Manager
- `El Frontend/src/` – Vue-Komponenten, API-Calls, WebSocket

**Priorität mittel:**
- Sicherheit: JWT, Passwort-Hashing, MQTT TLS
- Error-Handling: Circuit Breaker, Retry, Timeout
- Datenvalidierung: Pydantic-Schemas, GPIO-Bounds

---

## 4. Bekannte Patterns (keine Bugs)

- **ESP32:** `wokwi_simulation` Env-Variable – Wokwi-Modus, kein echtes Hardware-Verhalten
- **Server:** `HierarchySettings.kaiser_id = "god"` – Default, kein Tippfehler
- **Frontend:** `isMockEsp(espId)` – Mock-ESPs haben spezielle IDs
- **MQTT:** `raw_mode: true` im Payload – Pi-Enhanced-Processing aktivieren
- **Tests:** `IGNORE` in Unity-Tests – Graceful Degradation bei fehlender Hardware

---

## 5. Zu ignorierende Pfade

- `ARCHIV/`, `El Trabajante/test/_archive/` – archivierter Code
- `*.pyc`, `__pycache__/`, `.pio/`, `node_modules/`
- `El Servador/god_kaiser_server/backups/`
- `.claude/reports/` – Analyse-Reports, keine Produktions-Logik

---

## 6. Domain-spezifische Prüfungen

**Sinnvolle Checks:**
- MQTT-Topic-Konsistenz mit `El Trabajante/docs/Mqtt_Protocoll.md`
- GPIO-Bounds (ESP32: 0–39), PWM 0.0–1.0
- Emergency-Stop: Muss Actuator-Commands blockieren
- Sensor `raw_mode` vs. `processed` – korrekte Verarbeitung

---

*Letzte Aktualisierung: 2026-01-29*
