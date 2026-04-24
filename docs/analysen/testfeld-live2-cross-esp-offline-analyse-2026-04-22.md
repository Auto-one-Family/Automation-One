# Testfeld Live-System 2 - Cross-ESP Offline-Analyse

- Erstellt am: 2026-04-22
- Fokus: Kausalrekonstruktion des Nacht-Ausfalls bei Cross-ESP-Logik (ohne Scope-Erweiterung auf Offline-Cross-ESP)
- Bezug: baut auf `docs/analysen/testfeld-live2-klima-forensik-bericht-2026-04-22.md` auf, vertieft aber gezielt den Cross-ESP-Mechanismus

## 1) Kurzfazit

Der naechtliche Ausfall ist konsistent mit einem Cross-ESP-Abhaengigkeitsbruch:

- Die Regel `Zeitfenster Nacht` wurde nachts durch Sensordaten von `ESP_472204` getriggert.
- Dieselbe Regel sollte die Heizung auf `ESP_EA5484 GPIO25` schalten.
- `ESP_EA5484` war im kritischen Fenster offline (`MQTT timeout`), daher blockte die Rule-Engine den Aktor-Dispatch bewusst.
- Ergebnis: sichere Nicht-Ansteuerung statt unsicherer Blind-Schaltung; gleichzeitig fehlte dadurch die Heiz-Nachfuehrung.

Damit ist der Zusammenhang zum vorherigen Bericht praezisiert: Nicht nur "ESP offline", sondern "Cross-ESP-Regel + Offline des Ziel-ESP" war der operative Ausfallpfad.

## 2) Rekonstruktion der Kausalkette (IST)

### A) Cross-ESP-Trigger war zum Vorfallszeitpunkt aktiv

Historische Ausfuehrungen der Nachtregel zeigen als Triggerquelle `ESP_472204`:

```text
2026-04-21 23:47:55.239865+00 | trigger_data:
{"esp_id":"ESP_472204","gpio":0,"sensor_type":"sht31_temp","value":21.9,...}
```

Gleichzeitig enthaelt `actions_executed` fuer dieselbe Regel als Ziel:

```text
{"type":"actuator","esp_id":"ESP_EA5484","gpio":25,"command":"ON","value":1}
```

=> Die Wirkkette war explizit Cross-ESP (Sensor auf `ESP_472204`, Aktor auf `ESP_EA5484`).

### B) Ziel-ESP ging offline (MQTT/LWT)

MQTT-Broker:

```text
2026-04-21T22:12:01Z: Client ESP_EA5484 ... disconnected: exceeded timeout.
2026-04-22T03:45:20Z: New client connected ... as ESP_EA5484 (p4, c1, k60).
```

Server/LWT:

```text
LWT received: ESP ESP_EA5484 disconnected unexpectedly (... flapping=False)
```

Reconnect-Adoption:

```text
2026-04-22 03:45:21 ... State adoption started for ESP_EA5484 (offline_seconds=19899.5)
```

### C) Rule-Engine lief weiter, blockte aber Aktorzugriff auf offline ESP

Waehrend der Offlinephase wurden fuer `Zeitfenster Nacht` weiterhin Ausfuehrungen protokolliert, aber der Aktor-Dispatch wurde verworfen:

```text
Rule Zeitfenster Nacht: ESP ESP_EA5484 is offline, skipping actuator action (GPIO 25)
```

Beobachtet im Kernfenster (00-03 UTC):

- `logic_execution_history` fuer `Zeitfenster Nacht`: `682` Ausfuehrungen, alle `success=true`, `error_message=NULL`
- Skip-Warnungen in Server-Logs: `310` Eintraege

Interpretation:

- `success=true` bedeutet hier erfolgreiche Regel-Evaluation, nicht erfolgreiche physische Aktorwirkung.
- Die physische Wirkung blieb aus, weil der Zielpfad absichtlich gesperrt wurde.

### D) Sicherheitsverhalten war aktiv (Fail-safe statt Fehlansteuerung)

Der Codepfad in `logic_engine._execute_actions()` prueft vor Aktor-Dispatch explizit den Online-Zustand:

- Bei offline: Warnung + `continue` (kein Dispatch).
- Damit wird kein "blindes" Schalten in ein nicht verfuegbares Geraet erzwungen.

Das passt zu deinem Befund "Heizung wurde sicher abgeschaltet/nicht weitergefuehrt", sobald das Ziel-ESP weg war.

## 3) Zusatzbefunde zum ausgefallenen ESP (`ESP_EA5484`)

### A) Instabilitaetsmuster ueber den Tag

Ueber die rotierenden Server-Logs hinweg wurden fuer `ESP_EA5484` mehrfach LWT-Events beobachtet:

- `LWT received ... ESP_EA5484 disconnected unexpectedly`: insgesamt 28 Treffer
- davon mit `flapping=True`: 7 Treffer

Zusaetzlich im MQTT-Log vor dem langen Nacht-Ausfall:

```text
2026-04-21T18:34:15Z ... disconnected: session taken over
2026-04-21T18:34:51Z ... disconnected: connection closed by client
```

=> Das stuetzt die These einer Verbindungs-/Client-Stabilitaetsproblematik auf genau diesem ESP.

### B) Datengap am Ziel-ESP bestaetigt, Quell-ESP lief weiter

`ESP_EA5484` Sensoren:

```text
prev_ts 2026-04-21 22:10:11+00 -> curr_ts 2026-04-22 03:45:47+00
gap 05:35:36 (u.a. sht31_temp, ds18b20, sht31_humidity)
```

`ESP_472204` (`sht31_temp`) im gleichen Fenster:

```text
gaps > 90s: 0
max_gap: 00:01:00
```

=> Trigger-Seite war da, Ziel-Seite nicht.

### C) Telemetrie-Limitierung

In `esp_heartbeat_logs` liegen fuer `ESP_EA5484` im untersuchten Nachtfenster keine verwertbaren Heartbeat-Telemetriedaten vor (Tabelle enthaelt in diesem Stand nur Alt-/Teilbestand).

=> Fuer Root-Cause auf Firmware-/Power-/WLAN-Layer ist zusaetzliche Geraete- oder Serial-Telemetrie noetig; fuer die Cross-ESP-Ausfallkette reichen die vorhandenen MQTT/Server/DB-Belege jedoch aus.

## 4) Codeverankerung (warum Offline-Cross-ESP aktuell nicht abgefangen wird)

### A) Runtime-Dispatch (Server)

- `El Servador/god_kaiser_server/src/services/logic_engine.py`
  - `_execute_actions()`: Online-Gate vor Aktoraktion; bei offline wird Aktion uebersprungen.

### B) Offline-Regeln (Firmware-Konfigpfad) sind absichtlich lokal

- `El Servador/god_kaiser_server/src/services/config_builder.py`
  - `_extract_offline_rule()`: beruecksichtigt nur Aktoraktionen mit `action["esp_id"] == esp_id`.
  - Cross-ESP-Aktionen werden fuer Offline-Regeln ausgelassen (`continue` bei Cross-ESP).

Damit ist der aktuelle Architekturzustand konsistent mit deiner Aussage:

- Cross-ESP funktioniert online ueber Server-Rule-Engine.
- Offline-Fallback fuer Cross-ESP ist derzeit nicht Teil des implementierten Verhaltens.

## 5) Zusammenhang zum vorherigen Bericht

Der vorherige Forensik-Bericht bleibt sachlich korrekt (lange Offlinephase `ESP_EA5484` als Primaerursache der naechtlichen Temperaturabweichung).
Dieser neue Bericht praezisiert die operative Ursache auf Regel-Ebene:

- Der Ausfall traf nicht nur "die Heizung allgemein", sondern eine aktive Cross-ESP-Regelkette.
- Dadurch entstand bei Ziel-ESP-Offline ein deterministischer Wirkverlust trotz weiterlaufender Triggerseite.

Zusatzhinweis zur Konfiguration:

- In aktuellen `cross_esp_logic`-Regeldaten ist `Zeitfenster Nacht` inzwischen anders hinterlegt als im Vorfallszeitraum (u.a. lokaler Trigger `ESP_EA5484/ds18b20`, Schwelle `23/23.5`).
- Die Kausalanalyse oben stuetzt sich deshalb auf historische Ausfuehrungsdaten/Logs aus dem Vorfallsfenster, nicht auf den aktuellen Rule-Snapshot allein.

## 6) Absicherungsempfehlungen (ohne Offline-Cross-ESP-Implementierung)

1. **Verbindungsstabilitaet als harte Betriebsanforderung**
   - Alert: `ESP_EA5484 offline > X min` + separate Eskalation bei `session taken over`/`flapping=True`.
   - Ziel: primaere Ursache eliminieren (deckt deinen ersten Auftrag).

2. **Cross-ESP-Abhaengigkeit sichtbar machen**
   - Monitoring-Kachel pro Regel: Trigger-ESP, Ziel-ESP, letzter Trigger, letzter erfolgreicher Aktordispatch, aktuelle Offline-/Config-Pending-Flags.

3. **Kopplungsalarm statt nur Einzelalarm**
   - Alarmbedingung: "Regel wird ausgefuehrt, aber Ziel-ESP offline-skippt > N mal in M Minuten".
   - Damit wird genau der hier beobachtete Ausfallmodus direkt erkannt.

4. **Pre-Flight-Validierung vor Aktivierung kritischer Regeln**
   - Bei Cross-ESP-Regeln Aktivierung nur mit expliziter Warnung/Risikobestaetigung, solange kein Offline-Cross-ESP-Fallback existiert.

5. **Sicherheitsnachweis regelmaessig pruefen**
   - Testfall im Nachtfenster: Ziel-ESP kurz trennen, verifizieren:
     - keine Fehlansteuerung,
     - klare Alarmierung,
     - eindeutige Operator-Hinweise.

## 7) Evidenz-Referenzen (Kurzliste)

- MQTT-Broker: `/tmp/mqtt12h.log`
- Server-Logs: `logs/server/god_kaiser.log*`
- DB: `logic_execution_history`, `cross_esp_logic`, `sensor_data`, `actuator_history`, `esp_heartbeat_logs`
- Vorbericht (Kontext): `docs/analysen/testfeld-live2-klima-forensik-bericht-2026-04-22.md`
