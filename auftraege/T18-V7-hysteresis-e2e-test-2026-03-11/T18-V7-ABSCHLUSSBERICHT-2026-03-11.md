# T18-V7: Hysterese E2E-Test — Abschlussbericht

**Datum:** 2026-03-11  
**Status:** ✅ Abgeschlossen (3/3 Tests bestanden)

---

## 1. Zusammenfassung

Der Hysterese-E2E-Test wurde vollständig durchgeführt und alle Findings behoben. Die Test-Suite `hysteresis-logic.spec.ts` deckt nun die komplette Hysterese-Logik ab:

- Mock ESP mit DS18B20 + Relay
- Hysterese-Regel (Kühlung: AN >28°C, AUS <24°C)
- Vollständige Sequenz 25→29→26→23→25°C mit Verifikation

---

## 2. Durchgeführte Tests

| Test | Beschreibung | Status |
|------|--------------|--------|
| should create mock ESP with DS18B20 and relay | Mock ESP anlegen, Heartbeat, Hardware-View | ✅ |
| should create hysteresis cooling rule | Regel via API erstellen | ✅ |
| should run full hysteresis sequence 25→29→26→23→25°C | Vollständige Sequenz mit Execution-History-Verifikation | ✅ |

---

## 3. Findings und Fixes

### 3.1 Zone-FK-Verletzung (behoben)

**Symptom:** `ForeignKeyViolationError: Key (zone_id)=(e2e_hysteresis_zone) is not present in table "zones"`

**Ursache:** E2E-DB ist frisch (tmpfs), keine Zonen vordefiniert. Mock-ESP-Erstellung mit `zone_id` schlägt fehl.

**Fix:** `zone_id` und `zone_name` in allen drei Tests weggelassen. Die Hysterese-Logik benötigt keine Zone (ESP + GPIO + Sensor reichen).

**Datei:** `El Frontend/tests/e2e/scenarios/hysteresis-logic.spec.ts`

---

### 3.2 Regel-Namenskonflikt (behoben)

**Symptom:** `Rule with name 'E2E: Hysterese-Kühlung' already exists` (5701)

**Ursache:** Parallele Testausführung erzeugt mehrere Regeln mit gleichem Namen.

**Fix:** `name: \`E2E: Hysterese-Kühlung ${Date.now()}\`` für eindeutige Namen pro Testlauf.

**Datei:** `El Frontend/tests/e2e/scenarios/hysteresis-logic.spec.ts`

---

### 3.3 OFF-Execution nicht geloggt (behoben)

**Symptom:** `expect(countAfter23).toBeGreaterThan(countAfter26)` — nur 1 Eintrag im Execution History (ON), keine OFF-Log.

**Ursache:** Bei Hysterese-Deaktivierung wurde OFF zwar gesendet, aber nicht in `logic_execution_history` geloggt.

**Fix:** `logic_repo.log_execution()` für Hysterese-Deaktivierung ergänzt (Audit-Trail).

**Datei:** `El Servador/god_kaiser_server/src/services/logic_engine.py`

---

### 3.4 Cooldown blockierte OFF-Ausführung (behoben)

**Symptom:** Bei 23°C wurde kein OFF gesendet, obwohl Hysterese korrekt deaktivierte.

**Ursache:** Cooldown-Check (5 s) lief vor der Condition-Auswertung. Sequenz 29°C → 26°C → 23°C liegt innerhalb von ~3,5 s. Beim 23°C-Trigger war die letzte Execution (ON bei 29°C) < 5 s her → Cooldown blockierte, bevor die Hysterese-Deaktivierung überhaupt geprüft wurde.

**Fix:** Condition-Auswertung vor Cooldown. Hysterese-Deaktivierung (OFF) umgeht Cooldown, da OFF zeitkritisch ist und kein „Re-Trigger“ darstellt.

**Datei:** `El Servador/god_kaiser_server/src/services/logic_engine.py`

---

## 4. Architektur-Überblick (frontend-debug)

| Komponente | Rolle |
|------------|-------|
| **MQTT** | `publishSensorData()`, `publishHeartbeat()` → `kaiser/god/esp/{id}/sensor/4/data` |
| **Sensor-Handler** | Empfängt MQTT, speichert Daten, ruft `logic_engine.evaluate_sensor_data()` auf |
| **Logic Engine** | `get_rules_by_trigger_sensor()` → `HysteresisConditionEvaluator` → ON/OFF |
| **Execution History** | `GET /api/v1/logic/execution_history?rule_id=...` |
| **WebSocket** | `logic_execution`, `actuator_status` (optional für UI-Verifikation) |

---

## 5. Testablauf (verifiziert)

1. **25°C** → Inaktiv (zwischen 24–28), keine Execution
2. **29°C** → Aktivierung, Relay ON, 1× `logic_execution` geloggt
3. **26°C** → Bleibt aktiv (Hysterese-Zone), keine neue Execution
4. **23°C** → Deaktivierung, Relay OFF, 1× `logic_execution` geloggt
5. **25°C** → Bleibt inaktiv, keine neue Execution

---

## 6. Empfehlungen

1. **Zone-Setup für E2E:** Optional `beforeAll` mit `POST /api/v1/zones` ergänzen, wenn Hardware-View-Zonen-Assertions benötigt werden.
2. **WebSocket-Assertions:** Optional `createWebSocketHelper` + `waitForMessageMatching` für `logic_execution`/`actuator_status` nutzen (analog `humidity-logic.spec.ts`).
3. **Heizung-Modus:** Optional zweiten Testblock für `activate_below`/`deactivate_above` hinzufügen (siehe README §4).

---

## 7. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `El Frontend/tests/e2e/scenarios/hysteresis-logic.spec.ts` | Zone entfernt, Regel-Name eindeutig |
| `El Servador/god_kaiser_server/src/services/logic_engine.py` | Condition vor Cooldown, OFF-Logging, Hysterese-Deaktivierung umgeht Cooldown |

---

## 8. Ausführung

```bash
# Stack starten
make e2e-up   # oder: docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --wait

# Tests ausführen
cd "El Frontend"
npx playwright test tests/e2e/scenarios/hysteresis-logic.spec.ts --project=chromium
```

**Ergebnis:** 3 passed (15.8s)
