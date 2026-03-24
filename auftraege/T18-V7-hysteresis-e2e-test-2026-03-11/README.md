# T18-V7: Hysterese E2E-Test — Auftrag

**Datum:** 2026-03-11  
**Ziel:** Bestehende E2E-Tests so erweitern, dass die Hysterese-Logik der Logic Engine vollständig und reproduzierbar getestet werden kann.

---

## 1. Kontext

Die Hysterese verhindert Flattern (Oszillation) bei Schwellwert-Steuerung:

- **Kühlung:** `activate_above` + `deactivate_below` (z.B. Lüfter AN bei >28°C, AUS bei <24°C)
- **Heizung:** `activate_below` + `deactivate_above` (z.B. Heizung AN bei <18°C, AUS bei >22°C)

**Wesentliches Verhalten:** Zwischen den Schwellen bleibt der Zustand unverändert (kein ständiges Ein/Aus).

**Bestehende Infrastruktur:**

- `El Frontend/tests/e2e/scenarios/humidity-logic.spec.ts` — Vorlage für Logic-E2E (sensor_threshold)
- `El Frontend/tests/e2e/helpers/mqtt.ts` — `publishSensorData()`, `publishHeartbeat()`
- `El Frontend/tests/e2e/helpers/api.ts` — `createMockEspWithSensors()`, `deleteMockEsp()`
- `El Frontend/tests/e2e/helpers/websocket.ts` — `createWebSocketHelper()`, `waitForMessage()`, `waitForMessageMatching()`
- `El Servador/.../logic/conditions/hysteresis_evaluator.py` — Implementierung
- `El Servador/.../tests/unit/test_hysteresis_evaluator.py` — Unit-Tests (kein E2E)

---

## 2. Anforderungen an den Hysterese-E2E-Test

### 2.1 Basis-Setup (analog zu humidity-logic.spec.ts)

1. **Mock ESP** mit:
   - Temperatursensor: GPIO 4, Typ `ds18b20` (oder `DS18B20`)
   - Aktor: GPIO 16, Typ `relay` (Lüfter/Kühlung)

2. **Hysterese-Regel** (Kühlung):
   - Condition: `type: "hysteresis"`
   - `esp_id`, `gpio: 4`, `sensor_type: "ds18b20"`
   - `activate_above: 28.0`, `deactivate_below: 24.0`
   - Action: `set_actuator` relay ON

3. **API-Aufrufe:**
   - Regel erstellen: `POST /api/v1/logic/rules` (Payload siehe unten)
   - Regel löschen: `DELETE /api/v1/logic/rules/{id}`

### 2.2 Regel-Payload (Hysterese Kühlung)

```json
{
  "name": "E2E: Hysterese-Kühlung",
  "description": "Lüfter AN bei >28°C, AUS bei <24°C — verhindert Flattern",
  "enabled": true,
  "conditions": [
    {
      "type": "hysteresis",
      "esp_id": "<ESP_ID>",
      "gpio": 4,
      "sensor_type": "ds18b20",
      "activate_above": 28.0,
      "deactivate_below": 24.0
    }
  ],
  "logic_operator": "AND",
  "actions": [
    {
      "type": "set_actuator",
      "esp_id": "<ESP_ID>",
      "gpio": 16,
      "actuator_type": "relay",
      "command": "ON",
      "value": 1.0
    }
  ],
  "priority": 10,
  "cooldown_seconds": 5,
  "max_executions_per_hour": 20
}
```

**Hinweis:** Für Hysterese-Deaktivierung sendet die Engine intern `OFF` (T18-F2). Die Action definiert nur ON; OFF kommt automatisch bei Deaktivierung.

### 2.3 Sensor-Daten-Sequenz (MQTT)

`publishSensorData(espId, gpio, value, { sensorType: 'ds18b20' })` — Wert in °C (z.B. 25.0).

**Testsequenz (Kühlung):**

| Schritt | Temperatur | Erwartung | Prüfung |
|---------|------------|-----------|---------|
| 1 | 25°C | Inaktiv (zwischen 24–28) | Kein Relay |
| 2 | 29°C | **Aktivierung** | Relay ON, `logic_execution` |
| 3 | 26°C | **Bleibt aktiv** (Hysterese!) | Relay bleibt ON |
| 4 | 23°C | **Deaktivierung** | Relay OFF |
| 5 | 25°C | **Bleibt inaktiv** | Relay bleibt OFF |

### 2.4 Verifikation

- **WebSocket:** `logic_execution`, `actuator_status` oder `actuator_response`
- **Optional:** REST `POST /api/v1/logic/rules/{id}/test` mit `mock_sensor_values` — nur für Einzelwert-Auswertung; Hysterese-State ist sequenziell, daher E2E über MQTT sinnvoller.

---

## 3. Konkrete Anpassungen

### 3.1 Neue Datei: `humidity-logic.spec.ts` als Vorlage

**Option A:** Neue Datei `hysteresis-logic.spec.ts` (empfohlen)

- Kopiere die Struktur von `humidity-logic.spec.ts`
- Ersetze:
  - `createHumidityRule` → `createHysteresisCoolingRule(espId)`
  - Condition: `sensor_threshold` → `hysteresis` mit `activate_above`/`deactivate_below`
  - Sensor: SHT31/Humidity → DS18B20/Temperatur
  - GPIO: 21 → 4 (Temp), 16 bleibt Relay

**Option B:** Zusätzliche Tests in `humidity-logic.spec.ts`

- Neuer `test.describe('Hysteresis Logic: DS18B20 → Relay Cooling')`
- Eigene `createHysteresisRule()` und Testsequenz

### 3.2 Hilfsfunktion `createHysteresisRule()`

```typescript
async function createHysteresisCoolingRule(
  page: Page,
  request: APIRequestContext,
  espId: string,
  options?: {
    activateAbove?: number
    deactivateBelow?: number
    gpio?: number
    sensorType?: string
  }
): Promise<string> {
  const {
    activateAbove = 28.0,
    deactivateBelow = 24.0,
    gpio = 4,
    sensorType = 'ds18b20',
  } = options ?? {}

  const apiBase = `${getApiBase(page.url())}/api/v1`
  const token = await getToken(page)

  const rulePayload = {
    name: 'E2E: Hysterese-Kühlung',
    description: 'Lüfter AN bei >28°C, AUS bei <24°C',
    enabled: true,
    conditions: [
      {
        type: 'hysteresis',
        esp_id: espId,
        gpio,
        sensor_type: sensorType,
        activate_above: activateAbove,
        deactivate_below: deactivateBelow,
      },
    ],
    logic_operator: 'AND',
    actions: [
      {
        type: 'set_actuator',
        esp_id: espId,
        gpio: RELAY_GPIO,
        actuator_type: 'relay',
        command: 'ON',
        value: 1.0,
      },
    ],
    priority: 10,
    cooldown_seconds: 5,
    max_executions_per_hour: 20,
  }

  const response = await request.post(`${apiBase}/logic/rules`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    data: rulePayload,
    timeout: 15000,
  })

  if (!response.ok()) {
    const text = await response.text()
    throw new Error(`Failed to create hysteresis rule: ${response.status()} - ${text}`)
  }

  const data = (await response.json()) as { id: string }
  return data.id
}
```

### 3.3 Sensor-Publish für Temperatur

`publishSensorData` unterstützt bereits beliebige Werte. Für DS18B20:

```typescript
await publishSensorData(espId, TEMP_GPIO, 29.0, {
  sensorType: 'ds18b20',
})
```

Wert in °C (nicht raw×100). Server erwartet `raw` und `value` in gleicher Einheit bei `raw_mode: true`.

### 3.4 Testablauf (Schritt für Schritt)

1. Mock ESP anlegen (DS18B20 GPIO 4, Relay GPIO 16)
2. Heartbeat senden, ggf. 1–2 s warten
3. Hysterese-Regel erstellen
4. WebSocket-Helper verbinden (vor oder direkt nach Regel-Erstellung)
5. **Sequenz ausführen:**
   - `publishSensorData(espId, 4, 25.0, { sensorType: 'ds18b20' })` → `page.waitForTimeout(800)`
   - `publishSensorData(espId, 4, 29.0, { sensorType: 'ds18b20' })` → warte auf `logic_execution` oder `actuator_status` (Relay ON)
   - `publishSensorData(espId, 4, 26.0, { sensorType: 'ds18b20' })` → **kein** erneutes logic_execution (bleibt aktiv)
   - `publishSensorData(espId, 4, 23.0, { sensorType: 'ds18b20' })` → warte auf OFF
   - `publishSensorData(espId, 4, 25.0, { sensorType: 'ds18b20' })` → bleibt OFF
6. Assertions: mindestens 1× ON und 1× OFF, dazwischen kein Flattern bei 26°C

### 3.5 WebSocket-Events

- `logic_execution`: `data.success`, `data.action.command`
- `actuator_status`: `data.state` (true/false)
- `actuator_response`: Bestätigung vom Mock-ESP

`waitForMessageMatching` kann genutzt werden, um auf `logic_execution` oder `actuator_status` mit passendem `esp_id`/`gpio` zu warten.

---

## 4. Heizung-Modus (optional)

Für Heizung: `activate_below: 18.0`, `deactivate_above: 22.0`:

- 23°C → inaktiv
- 17°C → aktivieren (ON)
- 20°C → bleibt aktiv
- 23°C → deaktivieren (OFF)
- 20°C → bleibt inaktiv

Gleiche Struktur, andere Schwellen und Sequenz.

---

## 5. Bekannte Randbedingungen

1. **Hysterese-State:** In-Memory auf dem Server. Nach Server-Neustart ist State verloren (default: inaktiv).
2. **Mock ESP:** Muss online sein (Heartbeat). `createMockEspWithSensors` mit `auto_heartbeat: true` nutzen.
3. **sensor_type:** Case-insensitive (`ds18b20`/`DS18B20`). Regel und Publish sollten konsistent sein.
4. **Cooldown:** `cooldown_seconds: 5` für schnellere Tests; in Produktion ggf. höher.

---

## 6. Checkliste für die Implementierung

- [ ] Neue Datei `hysteresis-logic.spec.ts` oder neuer Block in bestehender Spec
- [ ] `createHysteresisCoolingRule()` implementieren
- [ ] Mock ESP mit DS18B20 (GPIO 4) + Relay (GPIO 16)
- [ ] Testsequenz: 25 → 29 → 26 → 23 → 25°C
- [ ] WebSocket-Assertions für ON bei 29°C und OFF bei 23°C
- [ ] Assertion: Bei 26°C kein erneutes logic_execution (Hysterese-Zone)
- [ ] Cleanup: Regel und Mock ESP löschen
- [ ] Optional: Heizung-Modus-Test

---

## 7. Referenzen

| Datei | Inhalt |
|-------|--------|
| `humidity-logic.spec.ts` | Vorlage, createHumidityRule, publishSensorData, WebSocket |
| `mqtt.ts` | publishSensorData, publishHeartbeat |
| `api.ts` | createMockEspWithSensors, deleteMockEsp |
| `websocket.ts` | createWebSocketHelper, waitForMessage, waitForMessageMatching |
| `hysteresis_evaluator.py` | Kühlung/Heizung-Logik, State |
| `logic_repo.py` | get_rules_by_trigger_sensor (hysteresis in SENSOR_CONDITION_TYPES) |
| `conftest_logic.py` | create_hysteresis_condition (Python-Fixture) |
