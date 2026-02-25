---
name: hardware-test
description: |
  Universeller Hardware-Test-Flow (F4) fuer AutomationOne.
  Orchestriert den gesamten Testlauf: Profil laden, Stack pruefen, Device Setup,
  Robin verbindet Hardware, Live-Verifikation, Stabilitaetstest, Meta-Analyse.
  Trigger: "hardware-test", "hw-test", "sensor testen", "hardware pruefen",
  "Hardware-Test mit {Sensor}", "hw-test --profile {name}"
  NICHT verwenden fuer: Software-Tests (pytest/vitest), CI-Analyse, Docker-Setup.
allowed-tools: Read, Write, Bash, Grep, Glob, Task
user-invocable: true
---

# Hardware-Test Skill (F4 Flow)

> **Zweck:** Orchestriert den universellen Hardware-Test-Flow. Robin muss nur fuer physische Schritte eingreifen.

---

## Profil-Erkennung

Der Profil-Name kommt aus dem User-Input:
- "hw-test --profile sht31_basic" -> Profil: `sht31_basic`
- "Hardware-Test mit SHT31" -> Profil: `sht31_basic` (Matching ueber Sensor-Typ)
- "hardware-test" (ohne Profil) -> Verfuegbare Profile auflisten, User waehlen lassen

**Profil-Verzeichnis:** `.claude/hardware-profiles/`
**Profil laden:** YAML-Datei lesen und validieren.

---

## Workflow (6 Phasen)

### Phase 0: Profil & Pre-Check

1. **Profil laden:** `.claude/hardware-profiles/{name}.yaml` lesen
2. **Profil validieren:**
   - Board-Typ bekannt (ESP32_WROOM oder XIAO_ESP32_C3)
   - GPIO-Nummern gueltig (nicht auf System-Pins 0,1,2,3,6-12)
   - Sensor-Typen firmware-registriert (ds18b20, sht31, bmp280, bme280, ph, ec, moisture)
   - Keine GPIO-Konflikte
3. **Stack Pre-Check:**
   - Alle Docker Container laufen: `docker compose ps` (4 core: postgres, mqtt, server, frontend)
   - Server erreichbar: `curl -sf http://localhost:8000/api/v1/health/live`
   - MQTT Broker aktiv: `mosquitto_sub -h localhost -t '$SYS/broker/uptime' -C 1 -W 5`
   - DB erreichbar: `docker exec automationone-postgres pg_isready -U god_kaiser -d god_kaiser_db`
4. **Firmware-Status abfragen:**
   ```
   Ist die ESP32-Firmware aktuell?
   - JA: Flash ueberspringen, weiter mit Captive Portal
   - NEIN: Firmware bauen und flashen (pio run -e esp32_dev -t upload)
   - UNSICHER: `pio run -e esp32_dev` (nur Build, kein Flash) und Robin fragen
   ```
5. **Mock-Mode-Empfehlung:** Falls erster Test mit diesem Profil, empfehle Mock-Modus
   als Vorab-Check (device_mode=mock, Stabilitaet 5 Min). Nur wenn Mock erfolgreich, weiter mit Real-Hardware.
6. **Profil-Summary an Robin zeigen:**
   ```
   Hardware-Test Profil: {name}
   Board: {board}
   Sensoren: {anzahl}x ({typen})
   Aktoren: {anzahl}x ({typen})
   Stabilitaetstest: {dauer} Minuten

   Voraussetzungen:
   - [ ] ESP32 geflasht mit aktueller Firmware
   - [ ] ESP32 per Captive Portal mit WiFi + MQTT Broker IP verbunden
   - [ ] Docker Stack laeuft (alle 4 Core-Container: postgres, mqtt, server, frontend)
   - [ ] Kein anderer ESP32 mit gleicher Device-ID aktiv
   - [ ] Sensoren/Aktoren physisch vorhanden (laut Profil)

   Sind alle Voraussetzungen erfuellt?
   ```

### Phase 1: Session starten + Briefing

1. Wenn `start_session.sh hw-test` Modus verfuegbar: ausfuehren
2. Sonst: Manuell STATUS.md mit Profil-Infos schreiben
3. **Task(system-control):** "HW-Test-Briefing erstellen. Profil: {name}. STATUS.md liegt in logs/current/."
4. SESSION_BRIEFING.md lesen und pruefen

### Phase 2: Device Setup (auto-ops)

**Task(auto-ops):**
```
Hardware-Test Orchestrator — Phase Setup.
Profil: {vollstaendiger YAML-Inhalt hier einfuegen}
Device-ID des ESP: {device_id falls bekannt, sonst "wird bei Registration vergeben"}

Ausfuehren:
1. Pre-Check: Server Health, MQTT Broker, DB
2. Device registrieren (device_mode=real)
3. Device genehmigen (POST /api/v1/esp/devices/{esp_id}/approve)
4. Sensoren aus Profil anlegen
5. Aktoren aus Profil anlegen (wenn vorhanden)
6. Zone/Subzone zuweisen
7. Config-Push abwarten (config_response via MQTT, 30s Timeout)

Ergebnis nach .claude/reports/current/HW_TEST_PHASE_SETUP.md schreiben.
Enthaelt: Device-ID, Sensor-IDs, GPIO-Mapping, Config-Status.
```

**Phase 2 Error Recovery:**
- "Device already exists" → Pruefen ob Device aktiv. Wenn ja: bestehende ID nutzen, NICHT doppelt anlegen. Wenn inaktiv/pending: loeschen und neu anlegen.
- "Sensor add failed" (z.B. GPIO-Konflikt) → GPIO-Belegung pruefen (`GET /api/v1/esp/devices/{esp_id}/gpio-status`). Bestehenden Sensor auf gleichem GPIO loeschen, dann erneut anlegen.
- "Config push timeout" (30s ohne config_response) → 1x Retry: Config erneut pushen. Falls zweiter Timeout: ESP Serial-Log pruefen (Verbindung? MQTT-Subscription?). Report als PARTIAL schreiben.

### Phase 3: Hardware verbinden (Robin)

**PAUSE — Robin muss physisch handeln.**

Wiring-Guide aus Profil generieren:
```
WIRING GUIDE: Profil "{name}"

{Fuer jeden Sensor im Profil:}
{nummer}. {sensor.name} ({sensor.type}, {sensor.interface}):

{Fuer I2C:}
   SDA  -> ESP32 GPIO {sensor.gpio}
   SCL  -> ESP32 GPIO {22 fuer ESP32_WROOM, 5 fuer XIAO_ESP32_C3}
   VCC  -> 3.3V
   GND  -> GND
   HINWEIS: 4.7kOhm Pull-Up auf SDA und SCL empfohlen (manche Breakout-Boards
   haben diese onboard). I2C-Adresse: {sensor.i2c_address}.
   Zweiter Sensor gleichen Typs: alternative Adresse pruefen (z.B. 0x45 statt 0x44).

{Fuer OneWire:}
   DATA -> ESP32 GPIO {sensor.gpio}
   4.7kOhm Pull-Up: DATA -> 3.3V  (PFLICHT — ohne Pull-Up kein Signal!)
   VCC  -> 3.3V
   GND  -> GND
   HINWEIS: Mehrere DS18B20 koennen am selben DATA-Pin haengen (Daisy-Chain).

{Fuer Analog:}
   SIGNAL -> ESP32 GPIO {sensor.gpio}
   VCC    -> 3.3V (oder 5V je nach Sensor-Modul)
   GND    -> GND
   HINWEIS: NUR ADC1-Pins (32, 33, 34, 35, 36, 39) verwenden wenn WiFi aktiv.
   ADC2-Pins (0, 2, 4, 12-15, 25-27) funktionieren NICHT bei aktivem WiFi!

{Fuer jeden Aktor im Profil:}
{nummer}. {actuator.name} ({actuator.type}):
   SIGNAL -> ESP32 GPIO {actuator.gpio}
   VCC    -> 5V (Relay-Modul benoetigt eigene 5V-Versorgung, NICHT vom ESP32 3.3V!)
   GND    -> GND (gemeinsame Masse mit ESP32)
   HINWEIS: Keine Input-Only Pins (34, 35, 36, 39) fuer Aktoren verwenden.
```

Robin bestaetigt mit "fertig", "verbunden", "hardware steht" o.ae.

### Phase 4: Live-Verifikation (auto-ops)

**Task(auto-ops):**
```
Hardware-Test Orchestrator — Phase Verifikation.
Profil: {name}
Device-ID: {device_id aus Phase 2 Report}
Sensoren: {liste aus Phase 2 Report}

Ausfuehren:
1. Heartbeat-Check (60s Timeout)
2. Sensor-Daten-Check (3 Messages, 90s Timeout)
3. Actuator-Test (wenn Profil Aktoren hat): ON -> 2s -> OFF
4. DB-Persistenz (sensor_data Tabelle)
5. Grafana-Alert-Status (keine firing Alerts erwartet)
6. Bei Problemen: Debug-Agents delegieren (esp32-debug, server-debug, mqtt-debug)

Ergebnis nach .claude/reports/current/HW_TEST_PHASE_VERIFY.md schreiben.
Enthaelt: Check-Tabelle (PASS/FAIL pro Check), Sensor-Werte, Aktor-Response.
```

### Phase 5: Stabilitaetstest (auto-ops)

**Task(auto-ops):**
```
Hardware-Test Orchestrator — Phase Stabilitaet.
Profil: {name}
Device-ID: {device_id}
Dauer: {stability_test.duration_minutes} Minuten
Polling-Intervall: {stability_test.polling_interval_minutes} Minuten
Expected Ranges: {stability_test.expected_ranges}

Ausfuehren:
Bash Polling-Loop mit {iterationen} Iterationen:
Pro Iteration:
  1. Server Health Check
  2. Sensor-Daten der letzten {intervall} Minuten aus DB
  3. Heartbeat-Check (einmalig, -C 1 -W 10)
  4. Werte gegen Expected Ranges pruefen
  5. Zwischen-Ergebnis loggen

Nach Loop: Statistik berechnen (Min/Max/Avg/StdDev pro Sensor).

Ergebnis nach .claude/reports/current/HW_TEST_PHASE_STABILITY.md schreiben.
Enthaelt: Iteration-Tabelle, Statistik, Out-of-Range Events, Heartbeat-Luecken.
```

### Phase 6: Meta-Analyse + Final Report

1. **Task(meta-analyst):** "Modus B: Hardware-Test. Analysiere HW_TEST_PHASE_SETUP.md, HW_TEST_PHASE_VERIFY.md, HW_TEST_PHASE_STABILITY.md und alle Debug-Reports. Fokus: Sensor-Daten-Pipeline Konsistenz."
2. **Final Report generieren:** `.claude/reports/current/HW_TEST_FINAL_REPORT.md`

```markdown
# Hardware-Test Final Report

**Profil:** {name}
**Board:** {board}
**Device-ID:** {device_id}
**Datum:** {timestamp}
**Dauer:** {gesamtdauer}

## Hardware-Test Scorecard

| Check | Status | Details |
|-------|--------|---------|
| Stack Pre-Check | PASS/FAIL | {detail} |
| Device Registration | PASS/FAIL | {detail} |
| Config Push | PASS/FAIL | {detail} |
| Heartbeat | PASS/FAIL | {detail} |
| Sensor Data | PASS/FAIL | {detail} |
| Actuator Response | PASS/FAIL/N/A | {detail} |
| DB Persistence | PASS/FAIL | {detail} |
| Grafana Alerts | PASS/FAIL | {detail} |
| 30-Min Stability | PASS/FAIL | {detail} |
| Meta-Analysis | PASS/WARN/FAIL | {detail} |

## Sensor-Statistik (30 Min)

| Sensor | Min | Max | Avg | StdDev | In Range |
|--------|-----|-----|-----|--------|----------|
| {typ} | {min} | {max} | {avg} | {stddev} | YES/NO |

## Ergebnis

**BESTANDEN** / **NICHT BESTANDEN** / **TEILWEISE BESTANDEN**

{Zusammenfassung}
```

---

## Regeln

1. **Robin nur bei Phase 0 (Voraussetzungen) und Phase 3 (Verkabelung) einbeziehen**
2. **Jede Phase schreibt eigenen Report** — bei Crash an beliebiger Stelle kann an der letzten Phase fortgesetzt werden
3. **auto-ops wird MEHRMALS aufgerufen** (Phase 2, 4, 5, 6) — jeder Aufruf ist ein separater Task mit eigenem Kontext
4. **Debug-Agents werden NUR bei Problemen delegiert** — nicht praeventiv
5. **mosquitto_sub IMMER mit -C und -W** — sonst blockiert der Agent
6. **Bash sleep im Stabilitaetstest ist OK** — Main-Thread oder auto-ops kann 5 Min warten
7. **Bei Fehler in einer Phase:** Report schreiben, Robin informieren, NICHT automatisch weitermachen

---

## Trigger-Keywords

- "hardware-test"
- "hw-test"
- "sensor testen"
- "hardware pruefen"
- "hw-test --profile {name}"
- "Hardware-Test mit {Sensor}"
