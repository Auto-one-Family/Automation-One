# Evidenz-Auszuege - Testfeld Live-System 2 Klima-Forensik

Diese Datei enthält nur die relevanten Kurz-Auszüge (keine Voll-12h-Rohlogs).

## A) Zeitbasis und NTP

```text
2026-04-22T07:52:29+02:00
Local time: Wed 2026-04-22 07:52:29 CEST
Universal time: Wed 2026-04-22 05:52:29 UTC
Time zone: Europe/Berlin (CEST, +0200)
System clock synchronized: yes
NTP service: active
```

## B) MQTT-Broker: Offline/Online von ESP_EA5484

Quelle: `/tmp/mqtt12h.log`

```text
2026-04-21T22:12:01Z: Client ESP_EA5484 [192.168.178.91:54753] disconnected: exceeded timeout.
2026-04-22T03:45:20Z: New client connected from 192.168.178.91:53518 as ESP_EA5484 (p4, c1, k60).
2026-04-22T03:45:21Z: ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/system/heartbeat/ack
```

## C) Server-Log: Nachtregel skippt Heizung wegen offline

Quelle: `logs/server/god_kaiser.log.1`, `logs/server/god_kaiser.log`

```text
2026-04-22 00:10:52 ... Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)
...
2026-04-22 03:29:56 ... Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)
```

Zusätzlicher Reconnect-Hinweis:

```text
2026-04-22 03:45:21 ... State adoption started for ESP_EA5484 (offline_seconds=19899.5)
2026-04-22 03:45:21 ... Heartbeat ACK sent to ESP_EA5484 ... (status=online)
```

## D) Rohdaten-Lücke (DB) vs. kontinuierlicher Vergleichssensor

### D1: Gemeldetes Intervall 00:10-05:30 (lokal)

SQL-Auswertung (`2026-04-21 22:10:00+00` bis `2026-04-22 03:30:00+00`)

```text
ESP_472204 sht31_temp/humidity: je 639 Punkte (kontinuierlich)
ESP_EA5484 sht31_temp/humidity: je 1 Punkt (nur um 22:10:11 UTC)
```

### D2: Größte Messlücke (ESP_EA5484, sht31_temp)

```text
prev_ts: 2026-04-21 22:10:11+00
curr_ts: 2026-04-22 03:45:47+00
gap:     05:35:36
```

### D3: Vergleich (ESP_472204, sht31_temp)

```text
max_gap: 00:01:00
avg_gap_seconds: 30.0459
```

## E) Heizaktor-Lücke (DB)

Größte Befehlslücke für `ESP_EA5484 GPIO25`:

```text
prev_ts: 2026-04-21 22:01:50.524355+00
curr_ts: 2026-04-22 03:45:23+00
gap:     05:43:32.475645
```

Stündliche Heizevents (`ESP_EA5484 GPIO25`) zeigen nachts Lücke:

```text
2026-04-22 00:00 local: ON=0, OFF=4
2026-04-22 01:00-04:00 local: keine Events
2026-04-22 05:00 local: ON=48, OFF=0
```

## F) Temperatur/rF-Verlauf (führender Sensor ESP_472204)

Nachtfenster (lokal 00:00-06:00) aus `sensor_data`:

```text
sht31_temp min: 19.8 C (2026-04-22 03:49:56+00 = 05:49:56 CEST)
sht31_humidity min/max: 66.8 .. 73.9 %
```

Stundenmittel (lokal) zeigen Abfall:

```text
00:00  temp_avg 24.32 C
01:00  temp_avg 22.25 C
02:00  temp_avg 21.43 C
03:00  temp_avg 20.82 C
04:00  temp_avg 20.37 C
05:00  temp_avg 20.06 C
```

## G) Regeldefinitionen (DB)

`cross_esp_logic`:

```text
Zeitfenster Nacht:
  trigger: ESP_472204 sht31_temp GPIO0 activate_below=22 deactivate_above=22.5
  time_window: 00:00-06:00 Europe/Berlin
  action: ESP_EA5484 GPIO25 ON

TimmsRegenReloaded:
  trigger: ESP_472204 sht31_humidity GPIO0 activate_below=68 deactivate_above=72
  action: ESP_472204 GPIO14 ON
```

## H) Code-Anker

- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` -> `handle_sensor_data()`
- `El Servador/god_kaiser_server/src/services/logic_engine.py` -> `_execute_actions()` (offline skip bei Aktor-Action)
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` -> `query_sensor_data()` (`GET /sensors/data`, inkl. `resolution`)
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` -> `query_data()` (raw vs aggregated)
- `El Frontend/src/components/charts/HistoricalChart.vue` -> `insertGapMarkers()`, Dataset `spanGaps: false`

## I) Screenshot-Alerts: direkte Zuordnung

### I1 Database connection errors (`grafana_bd75e17d646bfaa1`)

```text
Notification created: 2026-04-22 02:03:33 UTC (resolved 02:08:33 UTC)
Titel: Database connection errors detected in server logs (>2 in 5min)
```

Korrelierender Trigger:

```text
2026-04-22 02:00:00 ... Scheduled database backup failed:
pg_dump ... FATAL: password authentication failed for user "god_kaiser"
```

### I2 Safety-System aktiviert (`grafana_60213d4cf9f5896a`)

```text
Notification created: 2026-04-22 04:01:16 UTC (resolved 04:21:16 UTC)
Titel: Safety-System aktiviert
```

Korrelierender Trigger:

```text
2026-04-22 04:00:07 ... conflict_manager:
Conflict on ESP_EA5484:25 ... blocked ... (lower priority 50 vs 5)
2026-04-22 04:00:07 ... Actuator conflict for rule Zeitfenster: first_wins
```

### I3 ESP32 Error-Kaskade (`grafana_523710512a5bbf17`)

```text
Notification created: 2026-04-21 17:00:12 UTC (resolved 17:05:12 UTC)
Titel: ESP32 Error-Kaskade
extra_data.esp_id: ESP_EA5484
```
# Evidenz-Auszüge — Testfeld Live-System 2 Klima-Forensik

Diese Datei enthält nur die relevanten Kurz-Auszüge (keine Voll-12h-Rohlogs).

## A) Zeitbasis und NTP

```text
2026-04-22T07:52:29+02:00
Local time: Wed 2026-04-22 07:52:29 CEST
Universal time: Wed 2026-04-22 05:52:29 UTC
Time zone: Europe/Berlin (CEST, +0200)
System clock synchronized: yes
NTP service: active
```

## B) MQTT-Broker: Offline/Online von ESP_EA5484

Quelle: `/tmp/mqtt12h.log`

```text
2026-04-21T22:12:01Z: Client ESP_EA5484 [192.168.178.91:54753] disconnected: exceeded timeout.
2026-04-22T03:45:20Z: New client connected from 192.168.178.91:53518 as ESP_EA5484 (p4, c1, k60).
2026-04-22T03:45:21Z: ESP_EA5484 1 kaiser/god/esp/ESP_EA5484/system/heartbeat/ack
```

## C) Server-Log: Nachtregel skippt Heizung wegen offline

Quelle: `logs/server/god_kaiser.log.1`, `logs/server/god_kaiser.log`

```text
2026-04-22 00:10:52 ... Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)
...
2026-04-22 03:29:56 ... Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)
```

Zusätzlicher Reconnect-Hinweis:

```text
2026-04-22 03:45:21 ... State adoption started for ESP_EA5484 (offline_seconds=19899.5)
2026-04-22 03:45:21 ... Heartbeat ACK sent to ESP_EA5484 ... (status=online)
```

## D) Rohdaten-Lücke (DB) vs. kontinuierlicher Vergleichssensor

### D1: Gemeldetes Intervall 00:10-05:30 (lokal)

SQL-Auswertung (`2026-04-21 22:10:00+00` bis `2026-04-22 03:30:00+00`)

```text
ESP_472204 sht31_temp/humidity: je 639 Punkte (kontinuierlich)
ESP_EA5484 sht31_temp/humidity: je 1 Punkt (nur um 22:10:11 UTC)
```

### D2: Größte Messlücke (ESP_EA5484, sht31_temp)

```text
prev_ts: 2026-04-21 22:10:11+00
curr_ts: 2026-04-22 03:45:47+00
gap:     05:35:36
```

### D3: Vergleich (ESP_472204, sht31_temp)

```text
max_gap: 00:01:00
avg_gap_seconds: 30.0459
```

## E) Heizaktor-Lücke (DB)

Größte Befehlslücke für `ESP_EA5484 GPIO25`:

```text
prev_ts: 2026-04-21 22:01:50.524355+00
curr_ts: 2026-04-22 03:45:23+00
gap:     05:43:32.475645
```

Stündliche Heizevents (`ESP_EA5484 GPIO25`) zeigen nachts Lücke:

```text
2026-04-22 00:00 local: ON=0, OFF=4
2026-04-22 01:00-04:00 local: keine Events
2026-04-22 05:00 local: ON=48, OFF=0
```

## F) Temperatur/rF-Verlauf (führender Sensor ESP_472204)

Nachtfenster (lokal 00:00-06:00) aus `sensor_data`:

```text
sht31_temp min: 19.8 C (2026-04-22 03:49:56+00 = 05:49:56 CEST)
sht31_humidity min/max: 66.8 .. 73.9 %
```

Stundenmittel (lokal) zeigen Abfall:

```text
00:00  temp_avg 24.32 C
01:00  temp_avg 22.25 C
02:00  temp_avg 21.43 C
03:00  temp_avg 20.82 C
04:00  temp_avg 20.37 C
05:00  temp_avg 20.06 C
```

## G) Regeldefinitionen (DB)

`cross_esp_logic`:

```text
Zeitfenster Nacht:
  trigger: ESP_472204 sht31_temp GPIO0 activate_below=22 deactivate_above=22.5
  time_window: 00:00-06:00 Europe/Berlin
  action: ESP_EA5484 GPIO25 ON

TimmsRegenReloaded:
  trigger: ESP_472204 sht31_humidity GPIO0 activate_below=68 deactivate_above=72
  action: ESP_472204 GPIO14 ON
```

## H) Code-Anker

- `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py` -> `handle_sensor_data()`
- `El Servador/god_kaiser_server/src/services/logic_engine.py` -> `_execute_actions()` (offline skip bei Aktor-Action)
- `El Servador/god_kaiser_server/src/api/v1/sensors.py` -> `query_sensor_data()` (`GET /sensors/data`, inkl. `resolution`)
- `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py` -> `query_data()` (raw vs aggregated)
- `El Frontend/src/components/charts/HistoricalChart.vue` -> `insertGapMarkers()`, Dataset `spanGaps: false`

## I) Screenshot-Alerts: direkte Zuordnung

### I1 Database connection errors (`grafana_bd75e17d646bfaa1`)

```text
Notification created: 2026-04-22 02:03:33 UTC (resolved 02:08:33 UTC)
Titel: Database connection errors detected in server logs (>2 in 5min)
```

Korrelierender Trigger:

```text
2026-04-22 02:00:00 ... Scheduled database backup failed:
pg_dump ... FATAL: password authentication failed for user "god_kaiser"
```

### I2 Safety-System aktiviert (`grafana_60213d4cf9f5896a`)

```text
Notification created: 2026-04-22 04:01:16 UTC (resolved 04:21:16 UTC)
Titel: Safety-System aktiviert
```

Korrelierender Trigger:

```text
2026-04-22 04:00:07 ... conflict_manager:
Conflict on ESP_EA5484:25 ... blocked ... (lower priority 50 vs 5)
2026-04-22 04:00:07 ... Actuator conflict for rule Zeitfenster: first_wins
```

### I3 ESP32 Error-Kaskade (`grafana_523710512a5bbf17`)

```text
Notification created: 2026-04-21 17:00:12 UTC (resolved 17:05:12 UTC)
Titel: ESP32 Error-Kaskade
extra_data.esp_id: ESP_EA5484
```
