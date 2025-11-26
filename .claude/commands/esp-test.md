---
description: Führe ESP32 Tests aus (Server-orchestriert via pytest)
---

# ESP32 Test Suite

Führe die server-orchestrierten ESP32-Tests aus. Diese Tests laufen via MQTT-Mock und benötigen **keine echte Hardware**.

## Empfohlener Ansatz: Server-Tests (pytest)

```bash
cd "El Servador"
poetry install
poetry run pytest god_kaiser_server/tests/esp32/ -v
```

**Vorteile:**
- ✅ Hardware-unabhängig (MockESP32Client)
- ✅ Schnell (~140 Tests in <10s)
- ✅ CI/CD-ready
- ✅ Keine PlatformIO Build-Zeit

**Vollständige Dokumentation:** `El Servador/docs/ESP32_TESTING.md`

---

## Alternative: Legacy PlatformIO Tests (archiviert)

**Status:** Archiviert wegen PlatformIO-Linker-Problemen

**Für Legacy-Tests:**
```bash
cd "El Trabajante"
.\scripts\run-test-category.ps1 -Category <category>
```

Siehe: `.claude/commands/esp-test-category.md`

---

## Aufgabe (Server-Tests)

1. **Tests ausführen:**
   ```bash
   cd "El Servador"
   poetry run pytest god_kaiser_server/tests/esp32/ -v
   ```

2. **Ergebnisse interpretieren:**
   - **Alle grün:** ✅ Code ist OK
   - **Fehler vorhanden:** ❌ Fehler analysieren und fixen

## Test-Kategorien (~140 Tests)

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| **Communication** | ~20 | MQTT Connectivity, Ping/Pong |
| **Infrastructure** | ~30 | Config, Topics, System Status |
| **Actuator** | ~40 | Digital, PWM, Emergency Stop |
| **Sensor** | ~30 | Sensor Reading, Pi-Enhanced |
| **Integration** | ~20 | End-to-End Workflows |

## Spezifische Test-Kategorie ausführen

```bash
cd "El Servador"

# Communication Tests
poetry run pytest god_kaiser_server/tests/esp32/test_communication.py -v

# Actuator Tests
poetry run pytest god_kaiser_server/tests/esp32/test_actuator.py -v

# Sensor Tests
poetry run pytest god_kaiser_server/tests/esp32/test_sensor.py -v

# Integration Tests
poetry run pytest god_kaiser_server/tests/esp32/test_integration.py -v
```

## Mit Coverage

```bash
cd "El Servador"
poetry run pytest god_kaiser_server/tests/esp32/ --cov=god_kaiser_server/tests/esp32/mocks --cov-report=html
```

## Bei Fehlern

1. **Fehler analysieren:**
   - Pytest zeigt detaillierte Assertion-Fehler
   - Prüfe Stack-Trace
   - Check MockESP32Client State

2. **Häufige Probleme:**
   - Import-Errors: `poetry install`
   - Fixture-Errors: Check conftest.py
   - Assertion-Failures: Verifiziere MQTT-Protokoll

3. **Details konsultieren:**
   - **Vollständige Doku:** `El Servador/docs/ESP32_TESTING.md`
   - **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
   - **Test-Workflow:** `.claude/TEST_WORKFLOW.md`

## Empfohlene Nutzung

**Vor jedem Commit:**
```bash
/esp-test
# Bei allen Tests grün: Commit OK
# Bei Fehlern: Fixen und erneut testen
```

**Nach ESP32-Firmware-Änderungen:**
```bash
/esp-test
# Prüfe ob MQTT-Protokoll noch kompatibel ist
```

**Nach Server-Änderungen (MQTT-Handler):**
```bash
/esp-test
# Verifiziere dass ESP32-Kommunikation noch funktioniert
```

---

## Related Documentation

- **Vollständige Test-Doku:** `El Servador/docs/ESP32_TESTING.md`
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
- **Test Workflow:** `.claude/TEST_WORKFLOW.md`
- **Legacy Tests:** `.claude/commands/esp-test-category.md`
