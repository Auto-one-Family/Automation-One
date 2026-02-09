# Test-Zahlen Verifiziert

> Erstellt: 2026-02-06
> Methode: Direkte Dateizählung via `find` und Code-Analyse

---

## Zusammenfassung

| Bereich | Anzahl | Details |
|---------|--------|---------|
| **Wokwi Szenarien Gesamt** | **163** | Siehe Aufschlüsselung unten |
| **Wokwi CI-aktiv** | **138** | 12 Kategorien in ACTIVE_CATEGORIES, 5 NVS-Szenarien übersprungen |
| **Frontend Test-Dateien** | **10** | 5 E2E + 5 Unit |
| **Backend Unit** | **36** | tests/unit/ |
| **Backend Integration** | **44** | tests/integration/ |
| **Backend ESP32** | **19** | tests/esp32/ |
| **Backend E2E** | **6** | tests/e2e/ |
| **Backend Gesamt** | **105** | |

---

## Wokwi Szenarien pro Ordner

| Ordner | Anzahl | CI-Status |
|--------|--------|-----------|
| 01-boot | 2 | ✅ Aktiv |
| 02-sensor | 5 | ✅ Aktiv |
| 03-actuator | 7 | ✅ Aktiv |
| 04-zone | 2 | ✅ Aktiv |
| 05-emergency | 3 | ✅ Aktiv |
| 06-config | 2 | ✅ Aktiv |
| 07-combined | 2 | ✅ Aktiv |
| 08-i2c | 20 | ❌ Nicht in ACTIVE_CATEGORIES |
| 08-onewire | 29 | ✅ Aktiv |
| 09-hardware | 9 | ✅ Aktiv |
| 09-pwm | 18 | ✅ Aktiv |
| 10-nvs | 40 | ✅ Aktiv (5 übersprungen) |
| gpio | 24 | ✅ Aktiv |
| **Gesamt** | **163** | |

### ACTIVE_CATEGORIES (scripts/run-wokwi-tests.py)

```python
ACTIVE_CATEGORIES = [
    "01-boot", "02-sensor", "03-actuator", "04-zone",
    "05-emergency", "06-config", "07-combined",
    "08-onewire", "09-hardware", "09-pwm", "10-nvs", "gpio"
]
```

### SKIP_SCENARIOS

| Kategorie | Übersprungene Szenarien |
|-----------|-------------------------|
| 10-nvs | nvs_pers_bootcount, nvs_pers_reboot, nvs_pers_sensor, nvs_pers_wifi, nvs_pers_zone |
| 09-pwm | (keine) |

**Rechnung CI-aktiv:** 163 - 20 (08-i2c) - 5 (nvs skipped) = **138**

---

## Frontend Test-Dateien

### E2E (5 Dateien)

```
El Frontend/tests/e2e/scenarios/actuator.spec.ts
El Frontend/tests/e2e/scenarios/auth.spec.ts
El Frontend/tests/e2e/scenarios/device-discovery.spec.ts
El Frontend/tests/e2e/scenarios/emergency.spec.ts
El Frontend/tests/e2e/scenarios/sensor-live.spec.ts
```

### Unit (5 Dateien)

```
El Frontend/tests/unit/composables/useToast.test.ts
El Frontend/tests/unit/composables/useWebSocket.test.ts
El Frontend/tests/unit/stores/auth.test.ts
El Frontend/tests/unit/stores/esp.test.ts
El Frontend/tests/unit/utils/formatters.test.ts
```

---

## Backend Test-Dateien

### E2E (6 Dateien)

```
El Servador/god_kaiser_server/tests/e2e/test_actuator_alert_e2e.py
El Servador/god_kaiser_server/tests/e2e/test_actuator_direct_control.py
El Servador/god_kaiser_server/tests/e2e/test_logic_engine_real_server.py
El Servador/god_kaiser_server/tests/e2e/test_real_server_scenarios.py
El Servador/god_kaiser_server/tests/e2e/test_sensor_workflow.py
El Servador/god_kaiser_server/tests/e2e/test_websocket_events.py
```

### Verteilung

| Ordner | Anzahl |
|--------|--------|
| unit | 36 |
| integration | 44 |
| esp32 | 19 |
| e2e | 6 |
| **Gesamt** | **105** |

---

## CI-Workflow Jobs (wokwi-tests.yml)

| Job | Kategorien | Tier |
|-----|------------|------|
| boot-tests | 01-boot | QUICK |
| sensor-tests | 02-sensor | QUICK |
| mqtt-connection-test | Legacy | CORE |
| actuator-tests | 03-actuator (teilweise) | CORE |
| zone-tests | 04-zone | CORE |
| emergency-tests | 05-emergency | CORE |
| config-tests | 06-config | CORE |
| actuator-flow-tests | 03-actuator (E2E) | CORE |
| combined-flow-tests | 07-combined + 05-emergency | CORE |
| nvs-tests | 10-nvs | EXTENDED |
| gpio-extended-tests | gpio | EXTENDED |
| pwm-extended-tests | 09-pwm | EXTENDED |
| onewire-tests | 08-onewire | EXTENDED |
| hardware-tests | 09-hardware | EXTENDED |

---

*Keine Empfehlungen. Nur verifizierte Zahlen.*
