---
description: Führe ESP32 Tests aus (Server-orchestriert via pytest)
---

# ESP32 Test Suite

> **Kurze Anleitung** - Für vollständige Dokumentation siehe `/full-test` oder `El Servador/docs/ESP32_TESTING.md`

## Schnellstart

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

## Test-Kategorien (~140 Tests)

| Kategorie | Anzahl | Datei |
|-----------|--------|-------|
| **Communication** | ~20 | `test_communication.py` |
| **Infrastructure** | ~30 | `test_infrastructure.py` |
| **Actuator** | ~40 | `test_actuator.py` |
| **Sensor** | ~30 | `test_sensor.py` |
| **Integration** | ~20 | `test_integration.py` |
| **Cross-ESP** | ~15 | `test_cross_esp.py` |
| **Performance** | ~15 | `test_performance.py` |

## Spezifische Kategorie

```bash
cd "El Servador"
poetry run pytest god_kaiser_server/tests/esp32/test_<category>.py -v
```

## Mit Coverage

```bash
cd "El Servador"
poetry run pytest god_kaiser_server/tests/esp32/ --cov=god_kaiser_server/tests/esp32/mocks --cov-report=html
```

## Bei Fehlern

- Import-Errors: `poetry install`
- Fixture-Errors: Check `conftest.py`
- Assertion-Failures: Verifiziere MQTT-Protokoll

## Empfohlene Nutzung

**Vor jedem Commit:**
```bash
/esp-test
```

**Nach ESP32-Firmware-Änderungen:**
```bash
/esp-test
```

---

## Related Documentation

- **Vollständige Doku:** `/full-test` oder `El Servador/docs/ESP32_TESTING.md`
- **MQTT Protocol:** `El Trabajante/docs/Mqtt_Protocoll.md`
- **Legacy Tests:** `.claude/commands/esp32/test-category.md`
