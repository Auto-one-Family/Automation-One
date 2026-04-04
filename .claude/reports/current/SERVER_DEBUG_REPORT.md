# Server Debug Report

**Erstellt:** 2026-04-03
**Modus:** B (Spezifisch: "Config-Push ESP_EA5484 — ESP32 empfängt nur 1 von 2 Aktoren, GPIO 25 fehlt")
**Quellen:**
- `El Servador/god_kaiser_server/src/services/config_builder.py` (vollständig, 750 Zeilen)
- `El Servador/god_kaiser_server/src/db/repositories/actuator_repo.py` (vollständig, 410 Zeilen)
- `El Servador/god_kaiser_server/src/services/esp_service.py` (Zeilen 350–540)
- `El Servador/god_kaiser_server/src/mqtt/publisher.py` (Zeilen 200–270)
- Grep-Suchen über `src/services/`, `src/mqtt/`, `src/api/v1/`

---

## 1. Zusammenfassung

Der Server-seitige Config-Builder enthält keinen strukturellen Bug, der einen Aktor selektiv ausschliessen würde. Das Repository-Query (`get_by_esp`) holt alle Aktoren ohne Filter oder LIMIT. Der einzige serverseitige Ausschluss-Mechanismus ist ein Python-seitiger `enabled`-Check (Zeile 276). Der Server loggt die Aktor-Anzahl explizit an drei Stellen vor dem MQTT-Publish — dieses Log ist die entscheidende Evidenz zur Eingrenzung. Die wahrscheinlichste Server-Seite-Ursache ist `enabled=False` für GPIO 25 in der DB. Falls das Log `2 actuators` zeigt, liegt die Ursache auf ESP32-Seite.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `config_builder.py` | Vollständig gelesen (750 Zeilen) | Alle Methoden analysiert |
| `actuator_repo.py` | Vollständig gelesen (410 Zeilen) | `get_by_esp` Zeile 107–111 |
| `esp_service.py` | Teilweise gelesen (Zeilen 350–540) | `send_config` vollständig |
| `publisher.py` | Teilweise gelesen (Zeilen 200–270) | `publish_config` vollständig |
| god_kaiser.log / Loki | Nicht abgefragt | Server läuft im Docker, Log-Abfrage nicht Teil des Auftrags |

---

## 3. Befunde

### 3.1 SERVER BACKEND ANALYSE

#### S1. config_builder.py — Methode für actuators-Sektion

**Methode:** `ConfigPayloadBuilder.build_combined_config()` — `config_builder.py`, Zeile 234

**Aufruf-Kette:**
```
build_combined_config(esp_device_id, db)
  1. esp_repo.get_by_device_id(esp_device_id)         # ESP-UUID ermitteln
  2. actuator_repo.get_by_esp(esp_device.id)           # Zeile 272 — alle Aktoren holen
  3. [a for a in actuators if a.enabled]               # Zeile 276 — Python-Filter
  4. GPIO-Konflikt-Check (Zeilen 306–314)              # ConfigConflictError wenn Konflikt
  5. build_actuator_payload(a) für jeden Aktor         # Zeile 321
```

**Repository-Query (`get_by_esp`, `actuator_repo.py` Zeile 107–111) — vollständiges Statement:**
```python
stmt = select(ActuatorConfig).where(ActuatorConfig.esp_id == esp_id)
result = await self.session.execute(stmt)
return list(result.scalars().all())
```

Entsprechendes SQL:
```sql
SELECT actuator_configs.*
FROM actuator_configs
WHERE actuator_configs.esp_id = :esp_id
-- Kein ORDER BY, kein LIMIT, kein weiterer Filter
```

**Alle Filter und Bedingungen in der Aufruf-Kette:**

| Filter | Ort | Bedingung |
|--------|-----|-----------|
| `esp_id` | DB (WHERE-Clause) | Muss zur internen UUID des ESPDevice passen |
| `enabled` | Python-seitig, `config_builder.py:276` | `a.enabled == True` |
| VIRTUAL | Python-seitig, `config_builder.py:279–281` | Nur für Sensoren, nicht für Aktoren |
| GPIO-Konflikt | Python-seitig, `config_builder.py:306–314` | Wirft `ConfigConflictError` — bricht den gesamten Build ab, kein selektiver Ausschluss |
| `actuator_type` | Nur in `query_paginated` (API-Listenendpoints) | Wird in `build_combined_config` NICHT verwendet |
| LIMIT | Nicht vorhanden | Weder im Repository noch im Builder |

**Würde das Query beide Aktoren (GPIO 14 + GPIO 25) für ESP_EA5484 liefern?**

Ja — vorausgesetzt, beide Aktoren haben in der DB `enabled=True`. Das Query holt bedingungslos alle Einträge der ESP-UUID. Der Python-seitige `enabled`-Filter ist der einzige Ausschluss-Mechanismus für Aktoren.

**Kritischer Hinweis — GPIO-Konflikt-Check:**
Falls GPIO 25 des Aktors mit einem Sensor auf demselben GPIO kollidiert, wirft der Code `ConfigConflictError`. Diese Exception bricht den gesamten `build_combined_config`-Aufruf ab. In diesem Fall würde auch GPIO 14 nicht gesendet — dieser Pfad erklärt den selektiven Ausfall eines einzelnen Aktors daher nicht.

#### S2. Payload-Aufbau — Reihenfolge der Sektionen

**Reihenfolge (Zeilen 320–331):**
1. `sensor_payloads` — alle enabled, nicht-VIRTUAL Sensoren (Zeile 320)
2. `actuator_payloads` — alle enabled Aktoren (Zeile 321)
3. `offline_rules` — Hysterese-Regeln für lokale ESP32-Ausführung (Zeile 324)

```python
config = {
    "sensors": sensor_payloads,
    "actuators": actuator_payloads,
    "offline_rules": offline_rules,
}
```

**Größenlimit oder Truncation:**

| Sektion | Limit | Truncation |
|---------|-------|------------|
| sensors | Keines | Nein |
| actuators | Keines | Nein |
| offline_rules | 8 (`MAX_OFFLINE_RULES`) | Ja, mit Warning-Log (Zeile 421–428) |
| Payload-Bytes gesamt | Keines | Nein |

Es gibt kein Byte-Limit oder JSON-Größenlimit in `publish_config` oder `send_config`. Die MQTT-Bibliothek (`paho-mqtt`) hat standardmäßig kein Payload-Limit unterhalb von 256 MB.

**Logging der Payload-Größe in Bytes:** Nein — wird nicht geloggt.

**Logging der Aktor-Anzahl:** Ja, an drei Stellen:

| Stelle | Datei:Zeile | Log-Text (Format) |
|--------|-------------|-------------------|
| `build_combined_config` | `config_builder.py:338–342` | `"Built config payload for {esp_id}: N sensors, N actuators, N offline_rules, zone=..."` |
| `send_config` | `esp_service.py:470–475` | `"Config sent to {esp_id}: N sensors, N actuators"` |
| `publish_config` | `publisher.py:252–254` | `"Publishing config to {esp_id}: N sensor(s), N actuator(s)"` |

Alle drei Logzeilen erscheinen für jeden erfolgreichen Config-Push. Sie sind die primäre Evidenzquelle.

#### S3. Root-Cause-Bewertung Server-Seite

**Kann das Problem (fehlender GPIO 25) auf Server-Seite liegen?**

Ja — mit einer einzigen plausiblen Ursache: **GPIO 25 hat `enabled=False` in der DB-Tabelle `actuator_configs`.**

Wenn `enabled=False`, wird der Aktor durch den Python-Filter in `config_builder.py:276` ausgeschlossen und erscheint nicht in `active_actuators`. Die Payload enthält dann nur GPIO 14.

**Alle anderen Server-seitigen Hypothesen sind ausgeschlossen:**

| Hypothese | Ausschluss-Grund |
|-----------|-----------------|
| LIMIT im Repository-Query | Kein LIMIT in `get_by_esp` (Zeile 107–111) |
| Paginierung | Nicht in `build_combined_config` implementiert |
| Byte-Truncation der Payload | Nicht in `publish_config` oder `send_config` implementiert |
| Falscher `esp_id`-Key | Würde alle Aktoren betreffen, nicht nur einen |
| GPIO-Konflikt-Check | Wirft Exception → bricht gesamten Build ab, kein selektiver Ausschluss |
| `actuator_type`-Filter | Nur in `query_paginated` (API-Listing), nicht in `build_combined_config` |
| `is_active`-Feld | Kein solches Feld im Actuator-Filter-Pfad, nur `enabled` |
| offline_rules LIMIT | Betrifft nur `offline_rules`, nicht `actuators`-Array |

**Welche Server-seitige Information fehlt zur endgültigen Klärung:**

Die Log-Zeile `"Built config payload for ESP_EA5484"` aus dem Produktiv-Test vom 2026-04-03. Diese Zeile enthält die Aktor-Anzahl zum Zeitpunkt des Config-Builds und ist der entscheidende Beweis.

**Such-Commands:**
```bash
# Lokale Log-Datei:
grep "Built config payload for ESP_EA5484" logs/server/god_kaiser.log

# Loki (wenn verfügbar):
curl -sG http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={compose_service="el-servador"} |= "Built config payload for ESP_EA5484"' \
  --data-urlencode 'limit=10'
```

**Interpretation:**
- Log zeigt `1 actuators` → `enabled=False` für GPIO 25 ist Root Cause (Server-Seite)
- Log zeigt `2 actuators` → Server hat korrekt gesendet, Problem liegt auf ESP32-Seite (Firmware-Parsing, Array-Index-Bug, NVS-Schreibfehler)

**Zusätzliche DB-Verifikation (nur SELECT):**
```sql
SELECT gpio, actuator_name, actuator_type, enabled
FROM actuator_configs
WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_EA5484')
ORDER BY gpio;
```

---

## 4. Extended Checks (eigenständig durchgeführt)

| Check | Ergebnis |
|-------|----------|
| `get_by_esp` vollständig analysiert | Kein LIMIT, kein `enabled`-Filter auf DB-Ebene — reine WHERE esp_id Abfrage |
| `build_combined_config` vollständig gelesen | Einziger Aktor-Filter: Python `a.enabled` (Zeile 276) |
| `esp_service.send_config` analysiert | Loggt `actuator_count` nach `build_combined_config`, vor MQTT-Publish |
| `publisher.publish_config` analysiert | Kein Byte-Limit, loggt Aktor-Anzahl, QoS 2 |
| Grep `build_combined_config` über gesamtes `src/` | 8 Aufrufstellen (2x actuators.py, 2x sensors.py, 1x heartbeat_handler.py, 1x debug.py) — alle nutzen denselben Builder-Pfad |
| `query_paginated` überprüft | Hat `actuator_type`- und `enabled`-Filter, wird aber NICHT von `build_combined_config` aufgerufen |
| Grep `payload.*len` in `config_builder.py` | Nur Aktor/Sensor-Anzahl in Strings, kein Byte-Limit-Check |

---

## 5. Bewertung & Empfehlung

**Root Cause (wahrscheinlichste Hypothese, noch nicht bewiesen):**
Aktor GPIO 25 für ESP_EA5484 hat `enabled=False` in der Tabelle `actuator_configs`. Der Python-seitige Filter in `config_builder.py:276` schliesst ihn aus der Payload aus.

**Beweis-Reihenfolge (nur lesende Operationen):**

1. Server-Log prüfen: Log-Zeile `"Built config payload for ESP_EA5484"` — zeigt die Aktor-Anzahl zum Zeitpunkt des Config-Push-Events
2. DB-Abfrage: `SELECT gpio, enabled FROM actuator_configs WHERE esp_id = (SELECT id FROM esp_devices WHERE device_id = 'ESP_EA5484') ORDER BY gpio` — direkte Verifikation des `enabled`-Status beider Aktoren
3. Falls Server-Log `2 actuators` zeigt und DB beide `enabled=True` hat: Ursache liegt auf ESP32-Seite, ESP32-Debug-Agent aktivieren

**Nächste Schritte (nur Analyse, kein Fix):**
- Produktiv-Log vom 2026-04-03 nach den drei Log-Zeilen für ESP_EA5484 filtern
- DB `enabled`-Status für GPIO 14 und GPIO 25 prüfen
- Bei Server-Bestätigung `2 actuators`: ESP32-seitiges Firmware-Parsing der `actuators`-JSON-Array analysieren (Firmware-Limit, Array-Index-Handling, NVS-Blob-Schreib-Verhalten)
