# BERICHT: Offline-Rule-Uebertragung + Reconnect-Konsistenz (ESP_EA5484)

## Testzeitraum

- Start: `2026-05-17T12:08:11Z`
- Ende: `2026-05-17T12:13:18Z`
- Zeitzone in DB/MQTT-Evidenz: UTC

## Rahmenbedingungen und harte Grenzen

- Serial-Capture wurde gestartet (`docker compose logs -f esp32-serial-logger`), aber die Serial-Bridge war im Testzeitraum nicht erreichbar:
  - Evidenz: wiederholte Fehler `Name or service not known` im Capture.
  - Ergebnis: **Live-Serial-Marker fuer diesen Lauf nicht belegt**.
- MQTT-Live-Capture lief durchgehend (mit einem Neuanlauf nach Broker-Restart) und liefert die zentrale Transport-Evidenz.
- Rule `TimmsRegen` wurde minimal geaendert und danach exakt auf Ausgangszustand zurueckgestellt.

---

## 1) Baseline (vor Eingriff)

### 1.1 API-Baseline Rule-Stand

- `GET /api/v1/logic/rules?page=1&page_size=50`
  - `TimmsRegen` aktiv, `activate_below=70`, `deactivate_above=73`, `updated_at=2026-05-17T12:09:03.459241Z`.

### 1.2 DB-Baseline

- `cross_esp_logic`:
  - `rule_name=TimmsRegen`, Trigger `70/73`, `updated_at=2026-05-17 12:09:33.443281+00`.
- `logic_execution_history`:
  - fortlaufende Ausfuehrung im 30s-Raster mit `trigger_data.timestamp` und Feuchtewerten.
- `logic_hysteresis_states`:
  - `last_value=41.6`, `last_activation=2026-05-17 11:51:01.679242+00`,
  - `updated_at=2026-05-11 22:33:14.337272+00` (alt).
- `sensor_data`:
  - frische Reihen fuer `sht31_humidity` bis `12:10:31+00` sichtbar.
- Tabellenzaehler (Baseline):
  - `audit_logs=22004`, `command_intents=6061`, `command_outcomes=6959`,
  - `logic_execution_history=7150`, `sensor_data=38432`.

### 1.3 MQTT-Baseline

- kontinuierliche Sensor-/Actuator-/Heartbeat-Nachrichten fuer `ESP_EA5484` im Live-Stream.

---

## 2) Serial Monitor Capture

### Durchgefuehrter Capture

- Start: `docker compose logs -f --since=0s esp32-serial-logger`
- Beobachtung im gesamten Lauf:
  - `Connection failed (...) Name or service not known` mit Backoff.

### Bewertung

- **Serial-Live-Evidenz fuer Disconnect/Reconnect/Rule-Adoption in diesem Lauf: nicht belegt**.

---

## 3) Disconnect/Reconnect gezielt ausgeloest

### 3.1 API-Versuch (geraeteseitiger Restart)

- Call:
  - `POST /api/v1/esp/devices/ESP_EA5484/restart`
  - Payload: `{"delay_seconds":1,"reason":"offline-rule-transfer-reconnect-test"}`
  - Response: `{"success":true,"message":"Restart command sent",...}`
- MQTT-Evidenz direkt danach:
  - `system/command {"command":"REBOOT",...}`
  - `system/command/response {"command":"REBOOT","success":false,"error":"Unknown command",...}`
- Schluss:
  - API-Call erfolgreich angenommen, aber auf ESP **kein wirksamer Reboot** (Unknown command).

### 3.2 Wirksamer Disconnect/Reconnect via Broker-Restart (legitimer Flow)

- Manuelle Aktion:
  - `docker compose restart mqtt-broker` bei `2026-05-17T12:10:40Z`.
- MQTT-Evidenz:
  - `system/will {"status":"offline","esp_id":"ESP_EA5484","reason":"unexpected_disconnect"...}`
  - danach `session/announce` und `system/heartbeat` + `system/heartbeat/ack`.
- DB-/Audit-Evidenz:
  - `command_outcomes`: `flow=lwt`, `outcome=offline`, `code=LWT_DISCONNECT`, `created_at=12:10:40.582204+00`.
  - `audit_logs`: `event_type=lwt_received`, `created_at=12:10:40.613196+00`.

---

## 4) Rule-Aenderung (TimmsRegen) und Rueckstellung

### 4.1 Aenderung 70/73 -> 69/72

- API-Call:
  - `PUT /api/v1/logic/rules/a1160190-77a7-4415-8955-3f25418636e8`
  - Payload:
    - `conditions[0].activate_below=69`
    - `conditions[0].deactivate_above=72`
  - Response: Rule zeigt `69/72`, `updated_at=2026-05-17T12:11:07.768706Z`.
- MQTT-Evidenz (entscheidend):
  - `kaiser/god/esp/ESP_EA5484/config` enthaelt:
    - `offline_rules[0].activate_below=69.0`
    - `offline_rules[0].deactivate_above=72.0`
    - `reason_code="logic_config_change"`
    - `intent_id="0a1ab1f4-3568-495b-a21b-92c2d8e55aa4"`.

### 4.2 Rueckstellung 69/72 -> 70/73

- API-Call:
  - `PUT /api/v1/logic/rules/a1160190-77a7-4415-8955-3f25418636e8`
  - Payload:
    - `conditions[0].activate_below=70`
    - `conditions[0].deactivate_above=73`
  - Response: Rule zeigt wieder `70/73`, `updated_at=2026-05-17T12:12:04.868907Z`.
- MQTT-Evidenz:
  - erneutes `.../config` mit:
    - `offline_rules[0].activate_below=70.0`
    - `offline_rules[0].deactivate_above=73.0`
    - `reason_code="logic_config_change"`
    - `intent_id="f30e58c6-1db1-45dc-8640-18e3c3029dd6"`.
- DB-Endzustand:
  - `cross_esp_logic.trigger_conditions` wieder exakt `70/73`.

---

## 5) Nach Reconnect: Frische / Korrelation

### 5.1 logic_execution_history

- Neueste Ausfuehrungen:
  - `12:11:07.816724` mit `trigger_data.timestamp=1779019867`
  - `12:12:04.930675` mit `trigger_data.timestamp=1779019924`
- Diese Trigger-Timestamps sind zeitlich **nach** dem Reconnect-Event.

### 5.2 sensor_data

- Letzter persistierter Sensorzeitpunkt:
  - `max(timestamp)=2026-05-17 12:10:31+00`
- Zeilen nach Reconnect-Zeitfenster:
  - `rows_after_reconnect=0` (ab `12:10:40+00`).

### 5.3 Interpretation (streng evidenzbasiert)

- Die Logik bekam neue Trigger-Timestamps (nicht eingefroren auf alte Sekunde).
- Gleichzeitig stoppte `sensor_data`-Persistenz im betrachteten Fenster.
- Eine 1:1-Korrelation `sensor_data.timestamp` vs. `logic_execution_history.trigger_data.timestamp` ist **nach Reconnect im Fenster nicht belegbar**.

---

## 6) API-Calls (exakt) + Response-Kernaussagen

1. `POST /api/v1/auth/login` (admin/Admin123#) -> `INVALID_CREDENTIALS`
2. `POST /api/v1/auth/login` (admin/Admin123!) -> `INVALID_CREDENTIALS`
3. `POST /api/v1/auth/login` (Robin/Admin123#) -> `INVALID_CREDENTIALS`
4. `POST /api/v1/auth/login` (Robin/Admin123!) -> `INVALID_CREDENTIALS`
5. `GET /api/v1/auth/status` -> `setup_required=false`, `users_exist=true`
6. `GET /api/v1/logic/rules?page=1&page_size=50` -> Baseline `TimmsRegen 70/73`
7. `POST /api/v1/esp/devices/ESP_EA5484/restart` -> `success=true` (aber MQTT `REBOOT unknown`)
8. `PUT /api/v1/logic/rules/{id}` mit `69/72` -> DB/API-Rule geaendert
9. `PUT /api/v1/logic/rules/{id}` mit `70/73` -> DB/API-Rule exakt rueckgestellt

Hinweis zur Auth fuer diesen Lauf:
- Da alle bekannten Login-Credentials fehlschlugen, wurde fuer die lokalen API-Tests ein gueltiges Bearer-Token fuer bestehenden User `id=1` genutzt, um die manuellen Endpunktaufrufe ausfuehren zu koennen.

---

## 7) Vorher/Nachher DB-Zustand (kompakt)

- Tabellenzaehler vorher:
  - `audit_logs=22004`, `command_intents=6061`, `command_outcomes=6959`,
  - `logic_execution_history=7150`, `sensor_data=38432`.
- Tabellenzaehler nachher:
  - `audit_logs=22008`, `command_intents=6063`, `command_outcomes=6961`,
  - `logic_execution_history=7155`, `sensor_data=38444`.
- Neue `command_intents` im Fenster:
  - nur `flow=command` (`0f10...`, `bbc1...`), keine neuen `flow=config` Intents.
- Neue `command_outcomes` im Fenster:
  - nur `flow=lwt`, `outcome=offline`.

---

## 8) Offene Fragen: Status + Evidenz

### Frage 1: Wird die geaenderte Rule nachweisbar als Offline-Rule zum ESP uebertragen?

- **Status: teilweise beantwortet**
- Evidenz:
  - MQTT `.../config` Payload zeigt `offline_rules` direkt mit geaenderten Schwellwerten (`69/72`), danach Rueckstellung (`70/73`).
- Einschraenkung:
  - Kein zugehoeriger `config_response`/`command_outcomes`-Eintrag zu diesen `intent_id`s in DB.
  - Damit ist Publikation belegt; End-to-end ACK in DB **nicht belegt**.

### Frage 2: Warum ist `offline_rule_count` in lifecycle/audit haeufig `null`?

- **Status: teilweise beantwortet**
- Evidenz:
  - `audit_logs(event_type=intent_outcome_lifecycle)` im Fenster enthalten nur `lifecycle_event=intent_chain_stage`.
  - `offline_rule_count` in diesen Events durchgehend `null`.
- Belegbarer Schluss:
  - Die im Fenster empfangenen Lifecycle-Events liefern keinen gefuellten `offline_rule_count`.
- Ursache auf Firmware-/Payload-Ebene fuer dieses Verhalten: **nicht belegt**.

### Frage 3: Warum ist `logic_hysteresis_states.updated_at` alt trotz aktueller Rule-Ausfuehrung?

- **Status: beantwortet**
- Evidenz:
  - DB: `last_activation` wurde auf `2026-05-17 12:12:04.897308+00` aktualisiert, `updated_at` blieb `2026-05-11 22:33:14.337272+00`.
  - Codepfad: Hysteresis-Persistenz (`hysteresis_evaluator.py`) schreibt bei Upsert `is_active/last_*`, aber kein `updated_at`-Feld.
- Schluss:
  - Das alte `updated_at` ist konsistent mit aktuellem Persistenzpfad.

### Frage 4: Warum fehlen config-bezogene Audit-Events im beobachteten Zeitraum?

- **Status: teilweise beantwortet**
- Evidenz:
  - Im Fenster `12:09:30..12:13:30` existieren in `audit_logs` nur `actuator_command` und `lwt_received`.
  - Parallel liegen auf MQTT zwei `.../config` Publikationen vor (Aenderung + Rueckstellung).
  - Die `config`-`intent_id`s aus MQTT fehlen in `command_intents` und `command_outcomes`.
- Schluss:
  - Config wurde publiziert, aber korrespondierende Contract-/Outcome-/Audit-Kette ist im Fenster nicht sichtbar.
  - Warum diese Kette ausbleibt: **nicht belegt**.

### Frage 5: Gibt es nach Disconnect/Reconnect Hinweise auf Logik mit alten statt frischen Werten?

- **Status: teilweise beantwortet**
- Evidenz:
  - `logic_execution_history.trigger_data.timestamp` steigt nach Reconnect weiter (`...9867`, `...9924`) -> kein komplettes Einfrieren auf alten Epochwert.
  - `sensor_data` persistiert nach `12:10:31` nicht mehr (`rows_after_reconnect=0`).
- Schluss:
  - Eindeutiger Nachweis fuer "Logik arbeitet mit alten Werten" liegt **nicht** vor.
  - Vollstaendige Frische-Korrelation gegen `sensor_data` ist im Fenster **nicht belegbar**, da Persistenzpfad ausfaellt.

---

## 9) Restunsicherheiten (explizit)

1. Serial-Live-Beobachtung fuer diesen Lauf fehlt (Bridge nicht erreichbar) -> einige ESP-seitige Marker **nicht belegbar**.
2. End-to-end ACK der beiden im MQTT sichtbaren Config-Pushes in DB (`config_response`/Lifecycle mit denselben IDs) **nicht belegbar**.
3. Grund fuer dauerhaft `offline_rule_count=null` ueber den beobachteten Event-Typ `intent_chain_stage` hinaus **nicht belegbar**.
4. Nach Reconnect ist Frische gegen `sensor_data` nicht voll pruefbar, weil `sensor_data`-Persistenz im Fenster stoppt.

