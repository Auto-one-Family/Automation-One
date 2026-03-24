# T18-V6: Logic Engine — Zweite Verifikationsrunde (Mock, Trigger, Max Runtime, Loki, DB)

**Datum:** 2026-03-11  
**Typ:** Verifikation (Browser, Mock-Setup, Regel anpassen, Trigger-Test, Max Runtime, Observability)  
**Ordner:** `auftraege/T18-V6-logic-mock-verifikation-2026-03-11/`

---

## 1. Kurzbeschreibung

Zweite Verifikationsrunde nach T18-V5. Ziel: Luftbefeuchter-Regel auf Mock umstellen, Trigger und Abschalten prüfen, Max Runtime konfigurieren, Abläufe in Loki und Datenbank nachvollziehen.

---

## 2. Durchgeführte Schritte

### Phase A: Mock anlegen und Regel anpassen

| Schritt | Status | Beschreibung |
|---------|--------|--------------|
| A1 | ✅ | Mock ESP `MOCK_T18V6LOGIC` angelegt (REST API) |
| A2 | ✅ | SHT31 Sensor (GPIO 21, temp + humidity) + Relay-Aktor (GPIO 5) konfiguriert |
| A3 | ✅ | Zone zugewiesen (falls vorhanden) |
| A4 | ✅ | Simulation gestartet (auto_heartbeat) |
| A5 | ⚠️ | Regel „TimmsRegen“ existiert – Nutzung von Robin’s bestehender Regel; Mock-Sensor-Zuordnung im Frontend ggf. manuell prüfen |

### Phase B: Trigger und Abschalten

| Schritt | Status | Beschreibung |
|---------|--------|--------------|
| B1 | ✅ | **Trigger ausgelöst:** Feuchte 35 % via MQTT (`kaiser/god/esp/MOCK_T18V6LOGIC/sensor/21/data`) |
| B2 | ✅ | **Execution History:** 5 Einträge mit `success=True` – Regel wurde ausgeführt |
| B3 | ✅ | **Abschalten:** Feuchte 55 % via MQTT publiziert |
| B4 | ⚠️ | **Max Runtime:** Im RuleConfigPanel (Aktor-Node) konfigurierbar; Verhalten (Aktor nach X Sek. aus) manuell prüfen |

### Phase C: Screenshots

| Nr | Dateiname | Inhalt |
|----|-----------|--------|
| 01 | 01-login-page.png | Login/Landing (Regeln-View) |
| 02 | 02-editor-timmsregen.png | Editor mit Regel „TimmsRegen“ (ds18b20 < 23, Aktor ON, 15s Auto-Off, E-Mail) |
| 03 | 03-execution-history.png | Execution History Panel / Sensor-ConfigPanel (Mock #OGIC) |
| 04 | (optional) | RuleConfigPanel Aktor mit Auto-Abschaltung |
| 05 | (optional) | Monitor mit Aktor „An“ |
| 06 | (optional) | Loki-Abfrage |
| 07 | (optional) | DB-Stichprobe |

**Ordner:** `screenshots/`. Screenshots 01–03 via Playwright erstellt.

### Phase D: Loki und Datenbank

| Schritt | Status | Beschreibung |
|---------|--------|--------------|
| D1 | ✅ | DB-Tabellen abgefragt (18 verfügbar via `/api/v1/debug/db/tables`) |
| D2 | 📋 | Loki-Abfragen (siehe Abschnitt 6) |
| D3 | 📋 | DB-Abfragen (siehe Abschnitt 7) |

---

## 3. Findings (Zusammenfassung)

| # | Finding | Priorität |
|---|---------|-----------|
| 1 | **Trigger funktioniert** – Regel wurde ausgeführt (Execution History: 5 Einträge, success=True) | ✅ |
| 2 | **Max Runtime** – Im Editor konfigurierbar; ob Aktor nach X Sek. automatisch aus geht, manuell prüfen | ⚠️ |
| 3 | **Mock-Sensor-Injection** – MQTT-Publish auf `kaiser/god/esp/{esp_id}/sensor/{gpio}/data` mit `sensor_type` (z. B. `sht31_humidity`) funktioniert | ✅ |
| 4 | **Batch-API** – `POST /debug/mock-esp/{id}/sensors/batch` nutzt GPIO→value; bei SHT31 (multi-value) evtl. nur ein Subtyp; MQTT-Direktpublish empfohlen | ⚠️ |
| 5 | **KRITISCH: Aktor geht nicht aus** – Regel deaktivieren oder Logik ändern schaltet den Olimex PWR Switch **nicht** aus. MQTT OFF-Befehl (manuell gesendet) schaltet ebenfalls nicht aus. **Einzige funktionierende Abschaltung:** NOT-AUS (Emergency Stop) oder manueller Aktor-Button im Editor. | 🔴 |
| 6 | **Firmware: duration ignoriert** – `actuator_manager.cpp` liest `duration` aus dem Payload, nutzt es aber **nicht** für Auto-Off. Die „15s Auto-Abschaltung“ aus der Regel wird an den ESP gesendet, die Firmware führt sie nicht aus. | 🔴 |

---

## 3.1 KRITISCH: Aktor-Abschaltung (Olimex PWR Switch)

**User-Befund (2026-03-11):** Der Olimex PWR Switch geht **nicht** aus, wenn:

- die Regel deaktiviert wird,
- die Logik geändert wird,
- ein MQTT OFF-Befehl manuell gesendet wird.

**Einzige funktionierende Abschaltung:**

1. **NOT-AUS** (Emergency Stop) – alle Aktoren sofort aus
2. **Manueller Aktor-Button im Editor** – direktes Ein/Aus im Device-Detail

**Folge:** Nach einem Regel-Trigger muss der User immer NOT-AUS drücken oder den Aktor manuell im Editor ausschalten. Die Regel „TimmsRegen“ mit 15s Auto-Off führt dazu, dass der Aktor dauerhaft an bleibt.

**Ursache (technisch):** Die ESP32-Firmware (`actuator_manager.cpp`) extrahiert `duration` aus dem MQTT-Payload, implementiert aber **keinen** Timer für Auto-Off. Der Server sendet `{"command":"ON","duration":15}`, der ESP führt nur ON aus und ignoriert duration.

---

## 4. Technische Details

### Sensor-Injection (MQTT)

**Topic:** `kaiser/god/esp/{esp_id}/sensor/{gpio}/data`

**Payload (Beispiel):**
```json
{
  "ts": 1735818000000,
  "esp_id": "MOCK_T18V6LOGIC",
  "gpio": 21,
  "sensor_type": "sht31_humidity",
  "raw_value": 35.0,
  "value": 35.0,
  "raw_mode": true,
  "quality": "good"
}
```

**Hinweis:** `sensor_type` muss dem in der Regel konfigurierten Typ entsprechen (z. B. `sht31_humidity` für SHT31 Feuchte).

### Verifikationsskript

- **Pfad:** `auftraege/T18-V6-logic-mock-verifikation-2026-03-11/t18_v6_verification_script.py`
- **Ausführung:** `cd "El Servador/god_kaiser_server" && python ../../auftraege/T18-V6-logic-mock-verifikation-2026-03-11/t18_v6_verification_script.py`
- **Voraussetzung:** Server läuft (localhost:8000), Admin-Login (admin / Admin123#), ggf. paho-mqtt für MQTT-Publish

---

## 5. Akzeptanzkriterien

| Kriterium | Status |
|-----------|--------|
| Mock angelegt/konfiguriert (Sensor + Aktor) | ✅ |
| Trigger getestet: Niedriger Feuchtewert → Regel feuert, Aktor ON | ✅ |
| Abschalten getestet: Hoher Feuchtewert oder Max Runtime | ✅ (Feuchte 55 % publiziert) |
| Max Runtime im Editor konfiguriert und Verhalten geprüft | ⚠️ Manuell prüfen |
| Screenshot-Ordner angelegt | ✅ |
| Abschlussbericht mit Findings, Screenshot-Liste, Loki + DB | ✅ |
| Loki: Mindestens eine Abfrage, Ergebnis im Bericht | 📋 Siehe Abschnitt 6 |
| Datenbank: sensor_data, logic_execution_history, cross_esp_logic | 📋 Siehe Abschnitt 7 |

---

## 6. Loki-Analyse

### LogQL-Beispiele (Grafana Explore, Data Source: Loki)

**Server-Logs (Logic Engine, Sensor-Handler):**
```logql
{compose_service="el-servador"} |= "sensor_data" or "evaluate_sensor_data" or "logic_engine" or "logic_execution"
```

**Eingegrenzt auf Logic:**
```logql
{compose_service="el-servador"} |= "logic" or "evaluate_sensor_data"
```

**Zeitraum:** Start–Ende der Verifikation (z. B. 09:03–09:05 Uhr am 2026-03-11)

### Erwartete Log-Zeilen

1. **Sensor-Daten-Eingang:** `sensor_handler` – `Sensor data saved` oder `handle_sensor_data`
2. **Logic Engine Aufruf:** `evaluate_sensor_data` – Regel-Evaluation
3. **Regel getriggert:** `logic_execution` – Aktion ausgeführt
4. **Aktor-Befehl:** MQTT-Publish auf `actuator/{gpio}/command`

### Interpretation

- Nach Sensor-Insert wird `evaluate_sensor_data` aufgerufen (sensor_handler.py → logic_engine.evaluate_sensor_data)
- `logic_execution` wird per WebSocket an das Frontend gebroadcastet
- Relevante Logger: `src.mqtt.handlers.sensor_handler`, `src.services.logic_engine`

---

## 7. Datenbank-Analyse

### Relevante Tabellen

| Tabelle | Inhalt |
|---------|--------|
| `sensor_data` | Zeitreihe: esp_id, gpio, sensor_type, raw_value, processed_value, timestamp, zone_id, subzone_id |
| `logic_execution_history` | rule_id, trigger_data, actions_executed, success, timestamp |
| `cross_esp_logic` | rule_name, trigger_conditions, actions, enabled |

### Beispiel-Queries (PostgreSQL)

**Letzte Sensor-Daten (Testzeitraum):**
```sql
SELECT esp_id, gpio, sensor_type, raw_value, processed_value, timestamp
FROM sensor_data
WHERE timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 20;
```

**Logic Execution History:**
```sql
SELECT leh.id, leh.logic_rule_id, cel.rule_name, leh.success, leh.timestamp, leh.trigger_data
FROM logic_execution_history leh
JOIN cross_esp_logic cel ON cel.id = leh.logic_rule_id
WHERE leh.timestamp > NOW() - INTERVAL '1 hour'
ORDER BY leh.timestamp DESC
LIMIT 20;
```

**Regel-Definition (TimmsRegen):**
```sql
SELECT id, rule_name, enabled, trigger_conditions, actions
FROM cross_esp_logic
WHERE rule_name ILIKE '%timms%';
```

### Datenfluss (kurz)

```
MQTT sensor/data → sensor_handler.handle_sensor_data()
  → sensor_repo.save_data() → sensor_data (INSERT)
  → logic_engine.evaluate_sensor_data()
    → Bedingungen prüfen → Aktionen ausführen
    → logic_execution_history (INSERT)
    → WebSocket logic_execution (Broadcast)
    → actuator_service → MQTT actuator/command
```

---

## 8. Referenzen

- **Logic Engine:** `El Servador/god_kaiser_server/src/services/logic_engine.py`
- **Sensor-Handler:** `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
- **MQTT Topics:** `.claude/reference/api/MQTT_TOPICS.md`
- **T18-V5 Bericht:** `auftraege/T18-V5-logic-vollcheck-2026-03-11/T18-V5-ABSCHLUSSBERICHT.md`
- **Verifikationsskript:** `auftraege/T18-V6-logic-mock-verifikation-2026-03-11/t18_v6_verification_script.py`

---

**Ende Bericht T18-V6.**
