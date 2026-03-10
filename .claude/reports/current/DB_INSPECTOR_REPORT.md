# DB Inspector Report — T16-V2 Verifikation

**Erstellt:** 2026-03-10
**Modus:** B (Spezifisch: "T16-V2 Verifikation — Block A (Stale Actuator) + Block B (Notification Fingerprint)")
**Quellen:** actuator_configs, esp_devices, notifications, sensor_data, esp_heartbeat_logs, device_zone_changes, sensor_configs, notification_preferences, logic_rules

---

## 1. Zusammenfassung

Die DB-Verifikation deckt kritische Schema-Luecken fuer T16 auf: `actuator_configs` hat KEIN `current_state`-Feld — der "Stale Actuator State"-Block (V-SS-01) beruht damit auf einem nicht-existenten Datenbankfeld. Im Notification-System fehlt das `fingerprint`-Feld in allen 86 Rows (NULL), waehrend `correlation_id` korrekt befuellt ist. `logic_rules` existiert als Tabelle nicht in der Datenbank. `notification_preferences` ist vorhanden (1 Eintrag). ESP_00000001 zeigt kritische WiFi-RSSI-Schwankungen und `health_status: critical` in 7 von 10 Heartbeats — offline seit 2026-03-09 14:30 UTC.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| automationone-postgres | OK | Container healthy, Up 3 days |
| actuator_configs | OK (Schema-Luecke) | Kein current_state/current_value/state_updated_at/last_command_at |
| esp_devices | OK | 1 nicht-geloeschtes Device: ESP_472204, offline |
| notifications | OK | 86 total, source=grafana only |
| sensor_data | OK | ESP_00000001 aktiv bis 2026-03-10 09:06 UTC |
| esp_heartbeat_logs | OK | Spalte heisst `timestamp` (nicht `created_at`) |
| device_zone_changes | OK | esp_id ist varchar (nicht uuid) |
| sensor_configs | OK | alert_config: json vorhanden |
| notification_preferences | OK | 1 Eintrag fuer user_id=1 |
| logic_rules | FEHLT | Tabelle existiert nicht |

---

## 3. Befunde

### 3.1 V-SS-01: Actuator-State Schema — Kritische Luecke

- **Schwere:** Kritisch (fuer T16 Block A)
- **Detail:** `actuator_configs` hat KEIN `current_state`, KEIN `current_value`, KEIN `state_updated_at`, KEIN `last_command_at`. Der urspruengliche Query schlug mit `ERROR: column ac.current_state does not exist` fehl.

**Vollstaendiges actuator_configs Schema (22 Spalten):**

| Spalte | Typ |
|--------|-----|
| id | uuid |
| esp_id | uuid |
| gpio | integer |
| actuator_type | varchar |
| actuator_name | varchar |
| enabled | boolean |
| min_value | float |
| max_value | float |
| default_value | float |
| timeout_seconds | integer |
| safety_constraints | json |
| actuator_metadata | json |
| config_status | varchar |
| config_error | varchar |
| config_error_detail | varchar |
| created_at | timestamptz |
| updated_at | timestamptz |
| alert_config | json |
| runtime_stats | json |
| device_scope | varchar |
| assigned_zones | json |
| assigned_subzones | json |

**Kein `current_state`, kein `state_updated_at`, kein `last_command_at` vorhanden.**

**Einziger Actuator-Eintrag:**

| id | actuator_type | gpio | enabled | config_status | default_value | runtime_stats | device_id | status | last_seen |
|----|---------------|------|---------|---------------|---------------|---------------|-----------|--------|-----------|
| 0ca8acc5 | digital | 27 | true | applied | 0 | NULL | ESP_472204 | offline | 2026-03-10 09:42:37+00 |

- **Befund:** ESP_472204 ist offline. `runtime_stats` = NULL. Kein timestamp-basierter State vorhanden. "Stale Actuator State" kann aktuell nur ueber `esp_devices.last_seen` + `status=offline` abgeleitet werden, nicht ueber einen dedizierten Actuator-State-Timestamp.

---

### 3.2 V-AL-02: Notification-System + Fingerprint-Analyse

- **Schwere:** Mittel
- **Detail:** Das `fingerprint`-Feld in der Notifications-Tabelle ist in ALLEN 86 Rows NULL. Grafana sendet `correlation_id` (befuellt), aber keinen `fingerprint`.

**Notification-Uebersicht (86 total, nur source=grafana):**

| source | category | severity | title | cnt | first | last |
|--------|----------|----------|-------|-----|-------|------|
| grafana | connectivity | warning | ESP32 Heartbeat-Luecke | 21 | 2026-03-08 13:31 | 2026-03-10 09:58 |
| grafana | connectivity | info | ESP32 Heartbeat-Luecke | 14 | 2026-03-08 14:29 | 2026-03-10 10:03 |
| grafana | data_quality | warning | Sensordaten veraltet | 12 | 2026-03-08 13:34 | 2026-03-10 10:04 |
| grafana | infrastructure | warning | Frontend-Container nicht erreichbar | 10 | 2026-03-09 12:01 | 2026-03-10 09:23 |
| grafana | system | info | No Grafana webhooks received | 8 | 2026-03-09 05:54 | 2026-03-10 09:14 |
| grafana | system | warning | No Grafana webhooks received | 6 | 2026-03-09 08:24 | 2026-03-10 06:50 |
| grafana | data_quality | info | Sensordaten veraltet | 5 | 2026-03-09 05:53 | 2026-03-10 07:32 |
| grafana | infrastructure | critical | Critical errors detected across services | 2 | 2026-03-10 07:35 | 2026-03-10 09:09 |
| grafana | connectivity | warning | Haeufige WebSocket-Verbindungsabbrueche | 2 | 2026-03-09 17:44 | 2026-03-09 18:58 |
| grafana | connectivity | critical | MQTT-Broker hat keine verbundenen Clients | 1 | 2026-03-10 09:54 | (single) |
| (weitere 5 Einzel-Events) | | | | | | |

**Status-Verteilung:**

| is_read | is_archived | status | count |
|---------|-------------|--------|-------|
| false | false | resolved | 70 |
| false | false | active | 12 |
| true | false | resolved | 4 |

**Fingerprint-Analyse — KERNBEFUND:**

`fingerprint` = NULL in ALLEN 86 Rows. `correlation_id` ist befuellt (Format: `grafana_{16hex}`). 20 verschiedene correlation_ids entsprechen 20 verschiedenen Alert-Streams.

| correlation_id | cnt | avg_interval_sec | Kategorie |
|----------------|-----|-----------------|-----------|
| grafana_796869f4ea658850 | 11 | 15.502 (~4,3h) | Frontend-Container |
| grafana_bc4610db680147a5 | 11 | 10.093 (~2,8h) | Heartbeat-Luecke warning |
| grafana_d5ac2636f9178437 | 10 | 10.465 (~2,9h) | System-Webhook |
| grafana_a22fa2efc7b70869 | 9 | 19.992 (~5,5h) | Sensordaten veraltet |
| grafana_425a13e085bf2e2e | 8 | 20.707 (~5,7h) | Heartbeat-Luecke warning |
| grafana_4fa643ec059eb498 | 6 | 16.832 (~4,7h) | System-Webhook warning |
| grafana_c165daebc93775a4 | 5 | 39.866 (~11,1h) | Sensordaten veraltet |
| grafana_906bc66a0e901616 | 4 | 29.935 (~8,3h) | System info |
| grafana_a6825bde55884d94 | 4 | 29.804 (~8,3h) | System warning |
| grafana_75a24cd19e15b3eb | 3 | 42.561 (~11,8h) | Heartbeat info |
| grafana_ad6b8993b0637213 | 3 | 46.169 (~12,8h) | Sensordaten info |
| grafana_c79a7c6ad7aae4f3 | 2 | 4.410 (~1,2h) | WebSocket-Abbrueche |
| grafana_d9a879b4f8d95d99 | 2 | 85.862 (~23,8h) | Digest-Emails |
| grafana_ad1aadc54ad6ea76 | 2 | 5.640 (~1,6h) | Critical errors |
| (6 Einzel-Events) | 1 | — | Verschiedene |

- **Befund:** Kein Fingerprint-Dedup moeglich. Jedes Grafana-Firing erzeugt eine neue DB-Row. correlation_id ist die einzige Dedup-Grundlage. Fingerprint-Feld in der DB vorhanden (Spalte existiert), aber nie befuellt.

**Sources/Categories gesamt (nur grafana):**

| source | category | count |
|--------|----------|-------|
| grafana | connectivity | 39 |
| grafana | data_quality | 19 |
| grafana | infrastructure | 14 |
| grafana | system | 14 |

Einzige Source ist `grafana`. Kein autoops, server, mqtt als Source vorhanden.

---

### 3.3 V-SS-04: ESP_00000001 Anomalie

- **Schwere:** Hoch

**sensor_data (letzte 20 Eintraege, nur ds18b20):**

- Ausschliesslich `ds18b20`, `raw_value=360`, `processed_value=22.5` — statischer Mock-Wert
- Letzter Eintrag: 2026-03-10 09:06:59 UTC
- Auffaelligkeit: Zwischen 2026-03-09 14:30 und 2026-03-10 07:18 = ca. 17h Datenpause
- Vor 14:30 Uhr am 09.03.: rapide Eintraege im ~30-Sekunden-Takt (14:27 bis 14:30 UTC, 8 Eintraege)

**esp_heartbeat_logs — Schema-Korrektur:** Spalte heisst `timestamp`, nicht `created_at`.

| timestamp | wifi_rssi | health_status | uptime (s) |
|-----------|-----------|---------------|------------|
| 2026-03-09 14:30:04 | -95 | critical | 434 |
| 2026-03-09 14:29:04 | -95 | critical | 374 |
| 2026-03-09 14:28:05 | -66 | healthy | 314 |
| 2026-03-09 14:27:04 | -83 | critical | 254 |
| 2026-03-09 14:02:57 | -86 | critical | 194 |
| 2026-03-09 14:01:56 | -84 | critical | 134 |
| 2026-03-09 14:01:56 | -80 | degraded | 134 |
| 2026-03-09 14:00:55 | -70 | healthy | 74 |
| 2026-03-09 13:59:55 | -60 | healthy | 14 |
| 2026-03-09 11:27:14 | -85 | critical | 1095 |

- 7 von 10 Heartbeats = `critical`. RSSI schwankt stark (-60 bis -95 dBm).
- Zwei Rows mit identischem `uptime=134s` — potentielle Race Condition oder doppelter MQTT-Publish.
- Letzter Heartbeat: 2026-03-09 14:30 — seitdem offline (konsistent mit Datenpause in sensor_data).

**device_zone_changes — Schema-Korrektur:** `esp_id` ist varchar (nicht uuid).

| changed_at | change_type | old_zone | new_zone | changed_by |
|------------|-------------|----------|----------|------------|
| 2026-03-09 14:37:05 | zone_switch | zone_alpha | wokwi_testzone | admin |
| 2026-03-09 14:36:04 | zone_switch | wokwi_testzone | zone_alpha | admin |

- 2 manuelle Zone-Switches innerhalb von 63 Sekunden (Test-Session). `affected_subzones` enthaelt jeweils 1 Subzone (zeltnaerloesung, GPIO 4), `subzone_strategy=transfer`.

---

### 3.4 V-AK-01: Alert-Lifecycle Status

- **Schwere:** Niedrig

| status | count |
|--------|-------|
| resolved | 74 |
| active | 12 |

- 12 aktive, ungelesene Notifications. 70 resolved, ungelesen (`is_read=false`).

---

### 3.5 V-RE-02: Logic Engine

- **Schwere:** Kritisch (fehlende Tabelle)
- **Befund:** `ERROR: relation "logic_rules" does not exist` — Tabelle fehlt vollstaendig. Falls T16 Logic-Rules-Funktionalitaet erfordert, fehlt die DB-Grundlage.

---

### 3.6 V-AK-03: Notification-Preferences

- **Schwere:** Niedrig (vorhanden)
- **Befund:** Tabelle existiert, 1 Eintrag fuer user_id=1:

| Feld | Wert |
|------|------|
| websocket_enabled | true |
| email_enabled | false |
| email_address | (leer) |
| email_severities | ["critical", "warning"] |
| quiet_hours_enabled | false |
| quiet_hours_start | 22:00 |
| quiet_hours_end | 07:00 |
| digest_interval_minutes | 60 |
| browser_notifications | false |

---

### 3.7 V-AK-04: Alert-Config Schema

- **Schwere:** Info
- **sensor_configs:** `alert_config` (json) — vorhanden
- **actuator_configs:** `alert_config` (json) — vorhanden

Beide Tabellen haben das `alert_config`-JSON-Feld. Inhalt in actuator_configs: nicht befuellt (runtime_stats=NULL im einzigen Eintrag).

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| Container-Name | automationone-postgres (ohne -1 Suffix) |
| Queries gesamt | 20+ SQL-Statements erfolgreich ausgefuehrt |
| actuator_configs Schema | Kein current_state/current_value/state_updated_at/last_command_at |
| esp_heartbeat_logs Schema | `timestamp` statt `created_at` — initiale Query korrigiert |
| device_zone_changes.esp_id Typ | varchar statt uuid — Cast-Fehler erkannt und korrigiert |
| notifications.fingerprint | NULL in allen 86 Rows — Spalte existiert, wird nie befuellt |
| logic_rules Tabelle | ERROR: relation "logic_rules" does not exist |
| notification_preferences | Existiert, 1 Eintrag |

---

## 5. Bewertung & Empfehlung

### Root Causes

**Block A — Stale Actuator State (V-SS-01):**
- Schema hat keinen dedizierten Actuator-State-Timestamp. `current_state` und `last_command_at` fehlen.
- "Stale" kann nur indirekt ueber `esp_devices.last_seen` + `status=offline` detektiert werden.
- Falls T16 einen echten Actuator-State-Timestamp benoetigt: Migration fuer `actuator_configs.state_updated_at` oder `last_command_at` erforderlich.
- Alternativ ohne Schema-Aenderung: `runtime_stats`-JSON als Container fuer `last_command_at` nutzen (bereits vorhanden, aktuell NULL).

**Block B — Notification Fingerprint (V-AL-02):**
- `fingerprint`-Spalte in DB vorhanden, aber in 86 von 86 Rows NULL.
- Grafana sendet im Webhook keinen Fingerprint-Wert, oder der Server-Ingest schreibt ihn nicht.
- `correlation_id` ist befuellt und bleibt bei Re-Firing desselben Alerts gleich — das ist aktuell die einzige Dedup-Grundlage.
- Fingerprint-Generierung muss server-seitig beim Ingest implementiert werden (z.B. SHA256 aus source+category+title oder aus der Grafana Alert-Rule-ID).

**V-RE-02 — Logic Rules:**
- Tabelle `logic_rules` fehlt. Falls T16 sie benoetigt: Alembic-Migration erstellen.

**V-SS-04 — ESP_00000001:**
- Physikalisches WiFi-Problem (RSSI bis -95 dBm). Seit 2026-03-09 14:30 offline, keine Heartbeats mehr.
- Sensor-Daten zeigen statischen Wert (22.5 C, raw=360) — Wokwi-Simulation-Verhalten.
- Doppelter Heartbeat-Row (uptime=134s) deutet auf Race Condition im MQTT-Publish-Pfad.

### Naechste Schritte

1. **T16 Block A:** Schema-Migration fuer `actuator_configs.state_updated_at` (timestamptz) oder `last_command_at` (timestamptz) planen, falls echter State-Timestamp benoetigt. Alternativ: `runtime_stats` nutzen (kein Schema-Change, aber weniger sauber).
2. **T16 Block B:** Server-seitige Fingerprint-Generierung beim Grafana-Webhook-Ingest implementieren. SHA256 aus `correlation_id` oder aus `source+category+title` als stabiler Fingerprint.
3. **logic_rules:** Tabelle fehlt komplett. Alembic-Migration erstellen falls T16 dieses Feature erfordert.
4. **ESP_00000001 RSSI:** Physikalisches WiFi-Problem. RSSI-Threshold-Alerting pruefen (-85 dBm als Warning-Grenze).
5. **12 aktive Notifications:** Frontend-Badge pruefen, ob korrekt dargestellt. 70 resolved sind ungelesen — Bulk-Read-Funktion pruefen.
