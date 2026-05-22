# BERICHT: DB- und Rules-Praezisionscheck ESP_EA5484 (2026-05-17)

## Ziel und Scope

Dieser Bericht dokumentiert den **Ist-Stand in Datenbank und Echtzeit-MQTT** fuer `ESP_EA5484` mit Fokus auf:

1. Frische Sensorwerte nach Reconnect (kein blindes Schalten mit alten Werten).
2. Aktueller Rule-Stand (insbesondere Luftfeuchte-Hysterese).
3. Evidenz zur Uebertragung in `offline_rules`.
4. Klare Markierung offener Fragen ohne Annahmen.

Alle Aussagen unten basieren auf konkreten DB-Abfragen, MQTT-Live-Capture und Codepfaden.

---

## Messzeitpunkt

- Referenzzeit der Pruefung: `2026-05-17 11:58:08 UTC` (Abfragezeitpunkt).
- Spaetere Abfragen im selben Lauf zeigen Werte bis etwa `12:02:33 UTC`.

---

## 1) Geraetestatus und Live-Datenfluss

### 1.1 ESP-Stammdatensatz

Aus `esp_devices`:

- `device_id`: `ESP_EA5484`
- `status`: `online`
- `zone_id`: `tisch_1`
- `updated_at`: zuletzt `2026-05-17 11:58:04.5906+00`

### 1.2 MQTT-Live-Ingress (Broker)

Live-Capture auf Topic `kaiser/god/esp/ESP_EA5484/sensor/+/data` lieferte u. a.:

- `ds18b20` (`gpio=4`) mit `value=18.44`, `ts=1779019308`
- `sht31_temp` (`gpio=0`) mit `value=18.27`, `ts=1779019291`
- `sht31_humidity` (`gpio=0`) mit `value=42.20`, `ts=1779019291`

### 1.3 Persistenz in `sensor_data` (direkter Abgleich)

In den letzten Minuten liegen fortlaufend Datensaetze vor:

- `2026-05-17 12:01:31` `sht31_humidity=42.2`
- `2026-05-17 12:01:31` `sht31_temp=18.3`
- `2026-05-17 12:01:48` `ds18b20=18.44`

Der MQTT-Capture-Wert `sht31_humidity=42.20` (`ts=1779019291`) entspricht zeitlich den DB-Werten um `12:01:31 UTC`.

**Befund:** Broker-Ingress und DB-Persistenz sind fuer die betrachteten Live-Werte konsistent.

---

## 2) Rule-Stand (DB) und Frische der Ausfuehrungsdaten

### 2.1 Aktive Rule in `cross_esp_logic`

Es gibt aktuell genau eine aktive Rule:

- `rule_name`: `TimmsRegen`
- `enabled=true`, `priority=5`
- `trigger_conditions`:
  - `type=hysteresis`
  - `esp_id=ESP_EA5484`
  - `sensor_type=sht31_humidity`
  - `activate_below=70`
  - `deactivate_above=73`
- `actions`:
  - `type=actuator`, `esp_id=ESP_EA5484`, `gpio=14`, `command=ON`
- `updated_at`: zuletzt beobachtet `2026-05-17 12:02:33`

### 2.2 Rule-Execution-Historie (`logic_execution_history`)

Regelmaessige Ausfuehrung im 30s-Raster ist sichtbar, z. B.:

- `12:02:33` mit Triggerwert `sht31_humidity=42.1`, `timestamp=1779019353`
- `12:02:03` mit Triggerwert `42.3`
- `12:01:33` mit Triggerwert `42.2`
- `11:59:03` mit Triggerwert `42.6`

Zusaetzlich vorhanden:

- `11:51:01` Triggerdatensatz vom Typ `rule_update` fuer Rule-ID `a1160190-...`.

### 2.3 Frische gegen Sensor-Stream

Die Triggerwerte in `logic_execution_history` folgen denselben aktuellen Feuchtewerten wie `sensor_data` (z. B. 42.1/42.2/42.3 im selben Zeitfenster).

**Befund:** Die Server-Logik laeuft auf frischen, fortlaufend eingehenden Sensorwerten im geprueften Zeitraum; kein Nachweis fuer Stale-Input in diesem Fenster.

---

## 3) Rule-Aenderung (Luftfeuchte-Prozent) und Uebertragung in Offline-Rules

### 3.1 Sichtbare Rule-Aenderung in DB

Die Rule `TimmsRegen` steht aktuell auf:

- `activate_below=70`
- `deactivate_above=73`
- `updated_at=2026-05-17 12:02:33`

Damit ist die geaenderte Luftfeuchte-Schwelle in der Rule-Tabelle sichtbar.

### 3.2 Evidenz fuer Config-/Offline-Transfer im geprueften Fenster

In den relevanten Tabellen/Logs:

- `command_intents` (letzte 25 min): letzte `config`-Intents um `11:50:27` und `11:51:05`.
- `command_outcomes`: dazu passende `config_response success`/`config persisted`.
- `audit_logs`: `config_response`-Events mit Meldung `Configured 3 item(s) successfully` (Typ `sensor`, Count `3`).
- `intent_outcome_lifecycle`-Details enthalten Feld `offline_rule_count`, im geprueften Zeitraum aber durchgehend `null`.

Wichtig:

- Im geprueften DB-Ausschnitt **nach** beobachtetem Rule-`updated_at` (`12:02:33`) liegt **kein neuer** `config_response` fuer `ESP_EA5484` vor.
- Vorhandene `config_response`-Eintraege enthalten nur `config_type/count/message`; kein ausgegebenes `offline_rule_count` und keine Rule-ID-Liste.

**Befund (streng evidenzbasiert):**

- Rule-Aenderung in `cross_esp_logic` ist belegt.
- Direkter DB-Nachweis, dass genau diese neue Rule-Version bereits als `offline_rules` auf dem ESP bestaetigt wurde, ist im geprueften Zeitfenster **nicht vorhanden**.

---

## 4) Reconnect-/Intent-Kontext (nur DB-Fakten)

- `lwt` Offline-Events sind in `command_outcomes` vorhanden.
- Danach folgen erneut `command applied` und `config persisted` Ereignisse.
- Sensorfluss in `sensor_data` laeuft danach fort.

Zusaetzlicher technischer Hinweis aus DB:

- `logic_hysteresis_states` fuer Rule `a1160190-...` zeigt:
  - `is_active=true`, `last_value=41.6`, `last_activation=2026-05-17 11:51:01`
  - `updated_at=2026-05-11 22:33:14` (deutlich aelter als aktuelle Rule-Executions)

Das ist ein beobachteter Zustand, keine Interpretation.

---

## 5) Codepfad-Evidenz zu Offline-Rules (Server)

Aus Code:

- `config_builder.py` baut `offline_rules` aus aktivierten Logic-Rules (`_build_offline_rules`) und fuegt sie in Config-Payload ein.
- `esp_service.py` sendet diese Config ueber MQTT (`send_config`), entfernt nur `offline_rules_diagnostics` vor Wire-Payload.
- `intent_outcome_lifecycle_handler.py` schreibt `offline_rule_count` aus Firmware-Payload in Audit-Details.

Damit ist der technische Pfad vorhanden; die DB-Felder fuer explizite Runtime-Bestaetigung (`offline_rule_count`) sind im betrachteten Zeitraum aber `null`.

---

## Offene Fragen (explizit, ohne Annahmen)

1. **Offline-Rule-ACK nach letzter Rule-Aenderung (`updated_at=12:02:33`)**
   - Offen, weil im betrachteten Fenster kein neuer `config_response` mit Rule-bezogenen Details vorliegt.

2. **Warum `offline_rule_count` in Lifecycle-Events durchgehend `null` ist**
   - Offen, obwohl das Feld im Handler explizit aus Payload uebernommen wird.

3. **Warum `logic_hysteresis_states.updated_at` nicht mit aktueller Execution-Frequenz mitlaeuft**
   - Offen; die Tabelle zeigt aktive Rule-Executions, aber altes `updated_at`.

4. **Warum in `audit_logs` nur `config_response` als config-bezogenes Event auftaucht**
   - Offen; event types wie `config_published`/`config_failed` sind im aktuellen DB-Stand nicht sichtbar.

---

## Kurzfazit (nur belegte Aussagen)

- Sensorwerte fuer `ESP_EA5484` kommen live am Broker an und werden kontinuierlich in `sensor_data` persistiert.
- Die aktive Luftfeuchte-Rule (`TimmsRegen`) steht in DB auf den geprueften Schwellen (`70/73`) und wird fortlaufend mit aktuellen Sensorwerten ausgefuehrt.
- Ein **direkter** DB-Beleg, dass genau diese zuletzt geaenderte Rule bereits als `offline_rules` auf dem ESP bestaetigt wurde, liegt in den geprueften Datensaetzen derzeit nicht vor.
