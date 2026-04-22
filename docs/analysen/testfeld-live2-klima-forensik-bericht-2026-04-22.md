# Testfeld Live-System 2 - Klima-Forensik (12h)

- Erstellt am: 2026-04-22
- Auswertezeitpunkt: 2026-04-22 07:52:29 CEST / 05:52:29 UTC
- Analysefenster: letzte 12h bis Auswertezeitpunkt (ca. 2026-04-21 19:52 CEST bis 2026-04-22 07:52 CEST)
- Zeitzone: `Europe/Berlin` (NTP aktiv und synchronisiert)

## 1) Architektur und Zuordnung im Testfeld

### Geräte und Rollen (IST aus DB)

- `ESP_472204` (Zone `table_research`): Klima-Sensorik + Luftbefeuchter (`GPIO14`)
  - Sensoren: `sht31_temp` (`GPIO0`), `sht31_humidity` (`GPIO0`), `vpd`
  - Aktor: `GPIO14`, Name `Luftbefeuchter`
- `ESP_EA5484` (Zone `table_research`): Heizung (`GPIO25`) + eigene Sensorik (`sht31_*`, `ds18b20`)
  - Aktoren: `GPIO25` (`Heizung`), `GPIO14` (`Befeuchter 2`)

### Regeln (IST aus `cross_esp_logic`)

- `TimmsRegenReloaded`:
  - Trigger: `ESP_472204` `sht31_humidity` auf `GPIO0`, Hysterese `activate_below=68`, `deactivate_above=72`
  - Action: `ESP_472204 GPIO14` `ON`
- `Zeitfenster Nacht`:
  - Trigger: `ESP_472204` `sht31_temp` auf `GPIO0`, Hysterese `activate_below=22`, `deactivate_above=22.5`
  - plus Time-Window `00:00-06:00 Europe/Berlin`
  - Action: `ESP_EA5484 GPIO25` `ON` (Heizung)
- `Zeitfenster` (Tag):
  - Time-Window `06:00-00:00 Europe/Berlin`
  - Temp-Hysterese mit höherem Schaltpunkt (`27/27.3`)
  - Action: `ESP_EA5484 GPIO25` `ON`

## 2) Zeitleiste (Tag/Nacht) mit Befunden

## Nachtkritischer Abschnitt (lokal 00:00-06:00)

- 00:12 UTC (02:12 CEST) bis 03:45 UTC (05:45 CEST): in MQTT-Logs klarer Offline-Abschnitt von `ESP_EA5484`
  - Disconnect: `Client ESP_EA5484 ... disconnected: exceeded timeout`
  - Reconnect: `New client connected ... as ESP_EA5484`
- In derselben Phase meldet der Server fortlaufend:
  - `Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)`
- Für den Heizaktor `ESP_EA5484 GPIO25` entsteht eine große Befehlslücke:
  - größte Lücke in `actuator_history`: `22:01:50 UTC -> 03:45:23 UTC` (`05:43:32`)
- Temperaturführende Sensorik auf `ESP_472204` lief weiter:
  - im gemeldeten Intervall `00:10-05:30` (lokal) wurden kontinuierlich Punkte geschrieben
  - mittlere Sampling-Lücke bei `sht31_temp`: ~30s, max 60s
- Nacht-Temperatur fiel trotzdem deutlich:
  - `ESP_472204/sht31_temp` Minimum nachts: `19.8 C` (05:49 CEST)
  - entspricht Beobachtung "nahe 19 C bei 22 C Soll"

## Tag-/Morgenübergang

- ab ~05:45 CEST (Reconnect von `ESP_EA5484`) wieder regelmäßige Heiz-`ON`-Events auf `GPIO25`
- danach Temperaturanstieg sichtbar (Stundenmittel steigt von ~20 C auf >24 C)

## 3) Datenlücke 00:10-05:30 - ja/nein und Ketteneinordnung

## Befund

- **Ja, echte Rohdatenlücke** für mindestens einen Sensorpfad (`ESP_EA5484/sht31_temp`):
  - größte Messlücke in `sensor_data`: `22:10:11 UTC -> 03:45:47 UTC` (`05:35:36`)
  - das entspricht lokal ungefähr `00:10 -> 05:45`, also nahe der gemeldeten UI-Lücke
- **Nein, keine generelle Systemlücke**:
  - `ESP_472204` lieferte im selben Intervall kontinuierlich Daten

## Ketteneingrenzung (ESP -> MQTT -> Ingest -> DB -> API -> UI)

- **ESP/MQTT-Schicht:** klarer Disconnect/Timeout bei `ESP_EA5484` im Broker-Log
- **Server-Logikschicht:** Rule-Engine erkennt `ESP_EA5484` als offline und überspringt Heiz-Aktionen
- **DB-Schicht:** Sensor- und Heiz-Aktionslücken für `ESP_EA5484` belegt
- **API/UI-Schicht:** `/sensors/data` liefert vorhandene Punkte; `HistoricalChart` kann bei sehr wenigen Punkten eine optisch "gerade" Verbindung zeigen

=> Primäre Ursache der Lücke liegt in der Geräte-/Verbindungsschicht von `ESP_EA5484` (nicht in reiner UI-Aggregation).

## 4) Temperaturabweichung (19 C vs. 22 C Soll) - Befund und Hypothesen

## Befund

- Nachtregel mit 22/22.5 C war aktiv und wurde häufig evaluiert.
- Während des Offline-Fensters von `ESP_EA5484` konnte die Heizung trotz Trigger nicht angesteuert werden (Rule-Engine skippt bewusst offline-Geräte).
- Temperatur sank in der Nacht bis 19.8 C.

## Hypothesenbewertung

- **H1: Regel nicht aktiv** -> eher verworfen (Regel-Ausführungen vorhanden, inkl. `Zeitfenster Nacht`)
- **H2: Soll nicht am Heiz-ESP angekommen** -> **stark gestützt** (offline/timeout von `ESP_EA5484`, skip-Logs, Aktorlücke)
- **H3: Aktor begrenzt/zu schwach** -> offen (nicht separat hardwareseitig getestet)
- **H4: Sensorposition vs. Raummitte / Wärmeverluste** -> offen, physikalisch plausibel
- **H5: Konkurrenz zweiter Kreis** -> teilweise plausibel (Luftfeuchtekreis aktiv), aber Hauptdefizit bleibt Heiz-Offlinephase

## 5) rF-Aussteuern: Kopplung vs Regel vs Hardware

- **Physik/Kopplung:** Temperaturabfall und rF-Verlauf sind plausibel gekoppelt; rF-Schwankung allein ist kein Sensorfehler.
- **Regel TimmsRegenReloaded:** aktiv, mit hoher Schaltaktivität (`ESP_472204 GPIO14`, stündlich viele ON/OFF-Events nachts).
- **Hardwaredefekt rF-Sensor/Aktor:** aktuell nicht durch harte Evidenz belegt; Datenfluss des Führungs-ESP (`ESP_472204`) war durchgehend vorhanden.

## 6) Code- und Architekturverankerung (Repo)

- Ingest Sensorpfad:
  - `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
  - Funktion `handle_sensor_data()` parst MQTT-Topic, validiert Payload und persistiert über Repository.
- Timeseries/API:
  - `El Servador/god_kaiser_server/src/api/v1/sensors.py`
  - Endpoint `query_sensor_data()` (`GET /sensors/data`) mit optionaler Auflösung (`raw`, `1m`, `5m`, ...).
  - `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
  - `query_data()` nutzt raw/aggregated Pfad (inkl. date_trunc-Bucketing).
- Rule-Engine / Offline-Gate:
  - `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - `_execute_actions()` enthält expliziten Offline-Check und Logging `skipping actuator action`.
- Frontend-Chartdarstellung:
  - `El Frontend/src/components/charts/HistoricalChart.vue`
  - `insertGapMarkers()` setzt Null-Marker nur bei ausreichend Referenzabständen.
  - Dataset nutzt `spanGaps: false`; bei sehr wenigen Punkten kann dennoch eine gerade Verbindung entstehen.

## 7) Evidenztabelle

| Befund | Evidenz | Bewertung |
|---|---|---|
| `ESP_EA5484` nachts offline | MQTT-Broker: `disconnected: exceeded timeout` (22:12 UTC), Reconnect 03:45 UTC | Infrastruktur/Verbindung |
| Heizung nachts nicht angesteuert | Server-Log: `Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)` | Datenkette bis Rule-Dispatch belegt |
| Rohdatenlücke exakt vorhanden | SQL `sensor_data`: Gap `22:10:11 -> 03:45:47 UTC` für `ESP_EA5484/sht31_temp` | echte Datenlücke, nicht nur UI |
| Führungs-Sensor lief weiter | SQL `sensor_data`: `ESP_472204` kontinuierlich im selben Zeitfenster | keine globale Pipeline-Störung |
| Temperatur fiel trotz Nacht-Soll | SQL Stundenwerte: bis `19.8 C` Minimum bei aktiver Nachtlogik | plausibel durch Heizausfall + Physik |
| rF-Regel aktiv | `actuator_history` `ESP_472204 GPIO14` mit hoher Nacht-Schaltzahl | Regel aktiv, kein klarer Totalausfall |

## 8) Zusatzkorrelation zu den UI-Meldungen (Screenshot)

Im Nachgang wurden die im Screenshot sichtbaren Alerts gegen Logs und DB-Notifications korreliert.

### A) `Database connection errors detected in server logs (>2 in 5min)`

- Correlation-ID: `grafana_bd75e17d646bfaa1`
- Notification-Zeit: `2026-04-22 02:03:33 UTC` (resolved `02:08:33 UTC`)
- Technischer Trigger in Server/Postgres-Logs:
  - geplanter Backup-Job um `02:00:00 UTC`
  - `pg_dump failed ... FATAL: password authentication failed for user "god_kaiser"`
- Einordnung:
  - **nicht primäre Ursache** der Klima-Lücke
  - betrifft den Backup-Pfad (Credentials/Backup-Konfiguration), nicht den laufenden Sensor-Ingest
  - parallel liefen Health- und Sensorpfade weiter

### B) `Safety-System aktiviert`

- Correlation-ID: `grafana_60213d4cf9f5896a`
- Notification-Zeit: `2026-04-22 04:01:16 UTC` (resolved `04:21:16 UTC`)
- Technischer Trigger im Server-Log:
  - wiederholte Konfliktauflösung im `conflict_manager`
  - Beispiel: `Conflict on ESP_EA5484:25 ... blocked ... (lower priority 50 vs 5)`
  - gleichzeitig: `Actuator conflict for rule Zeitfenster: ... first_wins`
- Einordnung:
  - **sekundär/erwartbar** beim Nacht-Tag-Übergang und konkurrierenden Regeln (`Zeitfenster Nacht` vs. `Zeitfenster`)
  - kein Hinweis auf DB-/MQTT-Ausfall in diesem Zeitpunkt
  - nicht der Auslöser der nächtlichen 00:10-05:30 Datenlücke (die begann deutlich früher mit `ESP_EA5484`-Offlinephase)

### C) `ESP32 Error-Kaskade`

- Correlation-ID: `grafana_523710512a5bbf17`
- Notification-Zeit: `2026-04-21 17:00:12 UTC` (resolved `17:05:12 UTC`)
- Ziel laut `extra_data`: `esp_id=ESP_EA5484`
- Einordnung:
  - liegt **knapp vor** dem 12h-Hauptfenster, aber auf demselben Gerät
  - als **Vorläufer-Indiz** für Instabilität von `ESP_EA5484` relevant
  - allein kein Beweis für die konkrete Nachtlücke, aber konsistent mit dem späteren Offline-Verhalten

### Gesamtbewertung zur Screenshot-Korrelation

- Hauptursache der Nachtabweichung bleibt: **lange Offlinephase von `ESP_EA5484`** mit ausgefallener Heiz-Nachführung.
- Die zwei Screenshot-Meldungen innerhalb des Fensters sind eher:
  - ein **separates Infrastrukturthema** (Backup-Auth-Fehler),
  - plus **Safety-Arbitration** bei Regelkonflikt (funktionale Schutzreaktion).
- Damit stehen die Meldungen **im Zusammenhang mit dem Gesamtsystemzustand**, aber **nicht als Primärursache** der 00:10-05:30 Messlücke.

## 9) Abschluss (IST-Satz + nächste Schritte)

**IST-Zustand in einem Satz:** Das Live-Testfeld zeigt keine generelle Datenpipeline-Störung, sondern eine längere nächtliche Offlinephase von `ESP_EA5484`, wodurch die Heizung im Nachtfenster faktisch nicht nachgeführt wurde und die Temperatur auf ~19.8 C fiel, während der rF-Kreis auf dem zweiten ESP weiterarbeitete.

## Empfohlene nächste Schritte

1. Monitoring-Alarm auf "Heiz-ESP offline im Nachtfenster > X min" plus korrelierter Hinweis "Nachtregel skippt wegen offline".
2. Für `ESP_EA5484` Verbindungsstabilität prüfen (WLAN, Stromversorgung, MQTT keepalive/Session-Takeover-Muster).
3. Nachtregel-Beobachtung erweitern: Dashboard-Kachel mit Soll/IST/Offline-State/Aktor-Dispatch pro Minute.
4. Frontend-Hinweis für "Punktlücke > N x Medianintervall" prominenter markieren, damit Gerade nicht als physischer Verlauf missverstanden wird.
5. Hardwaretausch erst nach Stabilisierung/Beobachtung; aktuell liegt primäre Evidenz auf Verbindungs- bzw. Verfügbarkeitsseite.

## Verweis auf Detail-Evidenz

- `docs/analysen/testfeld-live2-klima-forensik-evidenz-2026-04-22.md`
# Testfeld Live-System 2 — Klima-Forensik (12h)

- Erstellt am: 2026-04-22
- Auswertezeitpunkt: 2026-04-22 07:52:29 CEST / 05:52:29 UTC
- Analysefenster: letzte 12h bis Auswertezeitpunkt (ca. 2026-04-21 19:52 CEST bis 2026-04-22 07:52 CEST)
- Zeitzone: `Europe/Berlin` (NTP aktiv und synchronisiert)

## 1) Architektur und Zuordnung im Testfeld

### Geräte und Rollen (IST aus DB)

- `ESP_472204` (Zone `table_research`): Klima-Sensorik + Luftbefeuchter (`GPIO14`)
  - Sensoren: `sht31_temp` (`GPIO0`), `sht31_humidity` (`GPIO0`), `vpd`
  - Aktor: `GPIO14`, Name `Luftbefeuchter`
- `ESP_EA5484` (Zone `table_research`): Heizung (`GPIO25`) + eigene Sensorik (`sht31_*`, `ds18b20`)
  - Aktoren: `GPIO25` (`Heizung`), `GPIO14` (`Befeuchter 2`)

### Regeln (IST aus `cross_esp_logic`)

- `TimmsRegenReloaded`:
  - Trigger: `ESP_472204` `sht31_humidity` auf `GPIO0`, Hysterese `activate_below=68`, `deactivate_above=72`
  - Action: `ESP_472204 GPIO14` `ON`
- `Zeitfenster Nacht`:
  - Trigger: `ESP_472204` `sht31_temp` auf `GPIO0`, Hysterese `activate_below=22`, `deactivate_above=22.5`
  - plus Time-Window `00:00-06:00 Europe/Berlin`
  - Action: `ESP_EA5484 GPIO25` `ON` (Heizung)
- `Zeitfenster` (Tag):
  - Time-Window `06:00-00:00 Europe/Berlin`
  - Temp-Hysterese mit höherem Schaltpunkt (`27/27.3`)
  - Action: `ESP_EA5484 GPIO25` `ON`

## 2) Zeitleiste (Tag/Nacht) mit Befunden

## Nachtkritischer Abschnitt (lokal 00:00-06:00)

- 00:12 UTC (02:12 CEST) bis 03:45 UTC (05:45 CEST): in MQTT-Logs klarer Offline-Abschnitt von `ESP_EA5484`
  - Disconnect: `Client ESP_EA5484 ... disconnected: exceeded timeout`
  - Reconnect: `New client connected ... as ESP_EA5484`
- In derselben Phase meldet der Server fortlaufend:
  - `Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)`
- Für den Heizaktor `ESP_EA5484 GPIO25` entsteht eine große Befehlslücke:
  - größte Lücke in `actuator_history`: `22:01:50 UTC -> 03:45:23 UTC` (`05:43:32`)
- Temperaturführende Sensorik auf `ESP_472204` lief weiter:
  - im gemeldeten Intervall `00:10-05:30` (lokal) wurden kontinuierlich Punkte geschrieben
  - mittlere Sampling-Lücke bei `sht31_temp`: ~30s, max 60s
- Nacht-Temperatur fiel trotzdem deutlich:
  - `ESP_472204/sht31_temp` Minimum nachts: `19.8 C` (05:49 CEST)
  - entspricht Beobachtung "nahe 19 C bei 22 C Soll"

## Tag-/Morgenübergang

- ab ~05:45 CEST (Reconnect von `ESP_EA5484`) wieder regelmäßige Heiz-`ON`-Events auf `GPIO25`
- danach Temperaturanstieg sichtbar (Stundenmittel steigt von ~20 C auf >24 C)

## 3) Datenlücke 00:10-05:30 — ja/nein und Ketteneinordnung

## Befund

- **Ja, echte Rohdatenlücke** für mindestens einen Sensorpfad (`ESP_EA5484/sht31_temp`):
  - größte Messlücke in `sensor_data`: `22:10:11 UTC -> 03:45:47 UTC` (`05:35:36`)
  - das entspricht lokal ungefähr `00:10 -> 05:45`, also nahe der gemeldeten UI-Lücke
- **Nein, keine generelle Systemlücke**:
  - `ESP_472204` lieferte im selben Intervall kontinuierlich Daten

## Ketteneingrenzung (ESP -> MQTT -> Ingest -> DB -> API -> UI)

- **ESP/MQTT-Schicht:** klarer Disconnect/Timeout bei `ESP_EA5484` im Broker-Log
- **Server-Logikschicht:** Rule-Engine erkennt `ESP_EA5484` als offline und überspringt Heiz-Aktionen
- **DB-Schicht:** Sensor- und Heiz-Aktionslücken für `ESP_EA5484` belegt
- **API/UI-Schicht:** `/sensors/data` liefert vorhandene Punkte; `HistoricalChart` kann bei sehr wenigen Punkten eine optisch "gerade" Verbindung zeigen

=> Primäre Ursache der Lücke liegt in der Geräte-/Verbindungsschicht von `ESP_EA5484` (nicht in reiner UI-Aggregation).

## 4) Temperaturabweichung (19 C vs. 22 C Soll) — Befund und Hypothesen

## Befund

- Nachtregel mit 22/22.5 C war aktiv und wurde häufig evaluiert.
- Während des Offline-Fensters von `ESP_EA5484` konnte die Heizung trotz Trigger nicht angesteuert werden (Rule-Engine skippt bewusst offline-Geräte).
- Temperatur sank in der Nacht bis 19.8 C.

## Hypothesenbewertung

- **H1: Regel nicht aktiv** -> eher verworfen (Regel-Ausführungen vorhanden, inkl. `Zeitfenster Nacht`)
- **H2: Soll nicht am Heiz-ESP angekommen** -> **stark gestützt** (offline/timeout von `ESP_EA5484`, skip-Logs, Aktorlücke)
- **H3: Aktor begrenzt/zu schwach** -> offen (nicht separat hardwareseitig getestet)
- **H4: Sensorposition vs. Raummitte / Wärmeverluste** -> offen, physikalisch plausibel
- **H5: Konkurrenz zweiter Kreis** -> teilweise plausibel (Luftfeuchtekreis aktiv), aber Hauptdefizit bleibt Heiz-Offlinephase

## 5) rF-Aussteuern: Kopplung vs Regel vs Hardware

- **Physik/Kopplung:** Temperaturabfall und rF-Verlauf sind plausibel gekoppelt; rF-Schwankung allein ist kein Sensorfehler.
- **Regel TimmsRegenReloaded:** aktiv, mit hoher Schaltaktivität (`ESP_472204 GPIO14`, stündlich viele ON/OFF-Events nachts).
- **Hardwaredefekt rF-Sensor/Aktor:** aktuell nicht durch harte Evidenz belegt; Datenfluss des Führungs-ESP (`ESP_472204`) war durchgehend vorhanden.

## 6) Code- und Architekturverankerung (Repo)

- Ingest Sensorpfad:
  - `El Servador/god_kaiser_server/src/mqtt/handlers/sensor_handler.py`
  - Funktion `handle_sensor_data()` parst MQTT-Topic, validiert Payload und persistiert über Repository.
- Timeseries/API:
  - `El Servador/god_kaiser_server/src/api/v1/sensors.py`
  - Endpoint `query_sensor_data()` (`GET /sensors/data`) mit optionaler Auflösung (`raw`, `1m`, `5m`, ...).
  - `El Servador/god_kaiser_server/src/db/repositories/sensor_repo.py`
  - `query_data()` nutzt raw/aggregated Pfad (inkl. date_trunc-Bucketing).
- Rule-Engine / Offline-Gate:
  - `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - `_execute_actions()` enthält expliziten Offline-Check und Logging `skipping actuator action`.
- Frontend-Chartdarstellung:
  - `El Frontend/src/components/charts/HistoricalChart.vue`
  - `insertGapMarkers()` setzt Null-Marker nur bei ausreichend Referenzabständen.
  - Dataset nutzt `spanGaps: false`; bei sehr wenigen Punkten kann dennoch eine gerade Verbindung entstehen.

## 7) Evidenztabelle

| Befund | Evidenz | Bewertung |
|---|---|---|
| `ESP_EA5484` nachts offline | MQTT-Broker: `disconnected: exceeded timeout` (22:12 UTC), Reconnect 03:45 UTC | Infrastruktur/Verbindung |
| Heizung nachts nicht angesteuert | Server-Log: `Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)` | Datenkette bis Rule-Dispatch belegt |
| Rohdatenlücke exakt vorhanden | SQL `sensor_data`: Gap `22:10:11 -> 03:45:47 UTC` für `ESP_EA5484/sht31_temp` | echte Datenlücke, nicht nur UI |
| Führungs-Sensor lief weiter | SQL `sensor_data`: `ESP_472204` kontinuierlich im selben Zeitfenster | keine globale Pipeline-Störung |
| Temperatur fiel trotz Nacht-Soll | SQL Stundenwerte: bis `19.8 C` Minimum bei aktiver Nachtlogik | plausibel durch Heizausfall + Physik |
| rF-Regel aktiv | `actuator_history` `ESP_472204 GPIO14` mit hoher Nacht-Schaltzahl | Regel aktiv, kein klarer Totalausfall |

## 8) Zusatzkorrelation zu den UI-Meldungen (Screenshot)

Im Nachgang wurden die im Screenshot sichtbaren Alerts gegen Logs und DB-Notifications korreliert.

### A) `Database connection errors detected in server logs (>2 in 5min)`

- Correlation-ID: `grafana_bd75e17d646bfaa1`
- Notification-Zeit: `2026-04-22 02:03:33 UTC` (resolved `02:08:33 UTC`)
- Technischer Trigger in Server/Postgres-Logs:
  - geplanter Backup-Job um `02:00:00 UTC`
  - `pg_dump failed ... FATAL: password authentication failed for user "god_kaiser"`
- Einordnung:
  - **nicht primäre Ursache** der Klima-Lücke
  - betrifft den Backup-Pfad (Credentials/Backup-Konfiguration), nicht den laufenden Sensor-Ingest
  - parallel liefen Health- und Sensorpfade weiter

### B) `Safety-System aktiviert`

- Correlation-ID: `grafana_60213d4cf9f5896a`
- Notification-Zeit: `2026-04-22 04:01:16 UTC` (resolved `04:21:16 UTC`)
- Technischer Trigger im Server-Log:
  - wiederholte Konfliktauflösung im `conflict_manager`
  - Beispiel: `Conflict on ESP_EA5484:25 ... blocked ... (lower priority 50 vs 5)`
  - gleichzeitig: `Actuator conflict for rule Zeitfenster: ... first_wins`
- Einordnung:
  - **sekundär/erwartbar** beim Nacht-Tag-Übergang und konkurrierenden Regeln (`Zeitfenster Nacht` vs. `Zeitfenster`)
  - kein Hinweis auf DB-/MQTT-Ausfall in diesem Zeitpunkt
  - nicht der Auslöser der nächtlichen 00:10-05:30 Datenlücke (die begann deutlich früher mit `ESP_EA5484`-Offlinephase)

### C) `ESP32 Error-Kaskade`

- Correlation-ID: `grafana_523710512a5bbf17`
- Notification-Zeit: `2026-04-21 17:00:12 UTC` (resolved `17:05:12 UTC`)
- Ziel laut `extra_data`: `esp_id=ESP_EA5484`
- Einordnung:
  - liegt **knapp vor** dem 12h-Hauptfenster, aber auf demselben Gerät
  - als **Vorläufer-Indiz** für Instabilität von `ESP_EA5484` relevant
  - allein kein Beweis für die konkrete Nachtlücke, aber konsistent mit dem späteren Offline-Verhalten

### Gesamtbewertung zur Screenshot-Korrelation

- Hauptursache der Nachtabweichung bleibt: **lange Offlinephase von `ESP_EA5484`** mit ausgefallener Heiz-Nachführung.
- Die zwei Screenshot-Meldungen innerhalb des Fensters sind eher:
  - ein **separates Infrastrukturthema** (Backup-Auth-Fehler),
  - plus **Safety-Arbitration** bei Regelkonflikt (funktionale Schutzreaktion).
- Damit stehen die Meldungen **im Zusammenhang mit dem Gesamtsystemzustand**, aber **nicht als Primärursache** der 00:10-05:30 Messlücke.

## 9) Abschluss (IST-Satz + nächste Schritte)

**IST-Zustand in einem Satz:** Das Live-Testfeld zeigt keine generelle Datenpipeline-Störung, sondern eine längere nächtliche Offlinephase von `ESP_EA5484`, wodurch die Heizung im Nachtfenster faktisch nicht nachgeführt wurde und die Temperatur auf ~19.8 C fiel, während der rF-Kreis auf dem zweiten ESP weiterarbeitete.

## Empfohlene nächste Schritte

1. Monitoring-Alarm auf "Heiz-ESP offline im Nachtfenster > X min" plus korrelierter Hinweis "Nachtregel skippt wegen offline".
2. Für `ESP_EA5484` Verbindungsstabilität prüfen (WLAN, Stromversorgung, MQTT keepalive/Session-Takeover-Muster).
3. Nachtregel-Beobachtung erweitern: Dashboard-Kachel mit Soll/IST/Offline-State/Aktor-Dispatch pro Minute.
4. Frontend-Hinweis für "Punktlücke > N x Medianintervall" prominenter markieren, damit Gerade nicht als physischer Verlauf missverstanden wird.
5. Hardwaretausch erst nach Stabilisierung/Beobachtung; aktuell liegt primäre Evidenz auf Verbindungs- bzw. Verfügbarkeitsseite.

## Verweis auf Detail-Evidenz

- `docs/analysen/testfeld-live2-klima-forensik-evidenz-2026-04-22.md`
