# BERICHT Disconnect Live Step-by-Step (2026-05-15)

Ziel dieses laufenden Berichts: reproduzierbare Echtlaeufe, harte Evidenz aus den jeweils neuesten Run-Artefakten, fortlaufende Fehlerliste und klare naechste Schritte.

## Aktueller Gesamtstatus

- Aktiver Testmodus: `ACTUATOR_GPIOS=14,25`
- Laufsteuerung: vorhandenen parallelen Live-Run weiterbeobachtet (kein Doppelstart, um Artefakt-Konflikte zu vermeiden)
- Bisheriger Fortschritt: mehrere Echtlaeufe abgeschlossen, Stage-1-Ziel weiter `No-Go`
- Live-Stage-Chain-Terminal: `/home/robin/.cursor/projects/home-robin/terminals/459866.txt`

## S1 - Ausgangslage aus den neuesten Artefakten vor Live-Run

### Schrittziel

- Verifizieren, warum der direkt vorherige Stage-Chain-Lauf (ohne GPIO-14/25-Fokus) an Stage 1 scheitert.

### Frische Artefakte

- `logs/current/hardware/disconnect-repro/stage_chain_result_latest.json`
- `logs/current/hardware/disconnect-repro/20260515_233535/run_summary.json`
- `logs/current/hardware/disconnect-repro/20260515_233750/run_summary.json`
- `logs/current/hardware/disconnect-repro/20260515_233750/esp32_serial.log`
- `logs/current/hardware/disconnect-repro/20260515_233750/server.log`
- `logs/current/hardware/disconnect-repro/20260515_233750/mqtt_broker.log`

### Ergebnis

- Stage-Chain-Status: `stage1_no_go`
- Stage1 Run2 (`20260515_233750`) zeigt gleichzeitige Signale:
  - starke Queue-Ueberlast (`err_4062=515`)
  - Disconnect-Signal (`mqtt_disconnected=6`)
  - Transport-Timeout-Klassifikation (`write_timeout_classified=1`)
  - Server-LWT (`lwt_unexpected=1`)

### Naechste Massnahme

- Frischen Lauf mit explizitem GPIO-Round-Robin `14,25` fortsetzen und Fehlerkette strikt als Trigger -> Code-/Stack-Stelle -> Folgeeffekt dokumentieren.

## S2 - Live-Lauf mit GPIO 14/25 (abgeschlossen)

### Schrittziel

- Stabilen Fortschritt bis mindestens Stage 1 mit GPIO `14,25` erreichen und No-Go-Ursachen komplett belegen.

### Laufstart / Konfliktentscheidung

- Bereits laufender Prozess erkannt:
  - Kommando: `ACTUATOR_GPIOS="14,25" bash "scripts/hardware/run_disconnect_stage_chain.sh"`
  - Entscheidung: beobachten statt neu starten, um keinen konkurrierenden Capture-Lauf zu erzeugen.

### Aktueller Laufstand (aus Live-Terminal)

- Phase 0 Run-ID: `20260515_234458` abgeschlossen
  - Ergebnis: `unusable=False dis=7 wt=1 4062=35 tls=0 fp2=2`
- Stage1 Run1 Run-ID: `20260515_234645` abgeschlossen
  - Ergebnis: `unusable=False dis=1 wt=0 4062=288 tls=0 fp2=0`
- Stage1 Run2 Run-ID: `20260515_234931` abgeschlossen
  - Ergebnis: `unusable=False dis=0 wt=0 4062=264 tls=0 fp2=0`
  - Stage-Chain-Result: `stage1_no_go` (`stage_chain_result_latest.json`)

### Gezielter Stack-/Wirkpfad (Echtbelege)

- Trigger (Lastphase/Flood auf 14/25):
  - `repro_disconnect_esp32.sh` publiziert Round-Robin auf beide Topics:
    - `kaiser/god/esp/ESP_EA5484/actuator/14/command`
    - `kaiser/god/esp/ESP_EA5484/actuator/25/command`
- Betroffene Codepfade im Device:
  - Queue-Enqueue-Fehlerpfad (kritische Publishes):
    - `El Trabajante/src/services/communication/mqtt_client.cpp` (`Publish queue enqueue failed (critical, no CB failure)`)
  - Transport-Fehlerklassifikation:
    - `mqtt_client.cpp` MQTT `MQTT_EVENT_ERROR` (`[INC-EA5484] ... classified=write_timeout`)
    - `mqtt_client.cpp` Debugmarker `[DBG5126ae] transport error context ...`
  - Disconnect-Folgepfad:
    - `mqtt_client.cpp` MQTT `MQTT_EVENT_DISCONNECTED`
    - Debugmarker `[DBG5126ae] disconnect event context ...`
- Folgeeffekt im System:
  - Device meldet `ERRTRAK [4062] Publish queue full`
  - Broker/Server sehen Disconnect/LWT-Ereignisse
  - Stage-Gate verletzt (insb. 4062-Schwelle fuer Stage 1)

## S3 - Minimal-invasive Gegenmassnahme (Low-Load Stage1) und Re-Test

### Schrittziel

- Mit gleicher GPIO-Topologie (`14,25`) und deutlich reduzierter Last pruefen, ob Stage1-Grenzen erreichbar werden.

### Durchgefuehrte Massnahme (ohne Codeaenderung)

- Zwei direkte Repro-Laeufe mit reduzierten Parametern:
  - `FLOOD_COUNT_FAST=6`
  - `FLOOD_COUNT_SLOW=4`
  - `FLOOD_DELAY_SLOW_MS=60`
  - `CAPTURE_SECONDS=120`
- Run-IDs:
  - `20260515_235328` (`stage1-low-run1`)
  - `20260515_235555` (`stage1-low-run2`)

### Frische Artefakte

- `logs/current/hardware/disconnect-repro/20260515_235328/run_summary.json`
- `logs/current/hardware/disconnect-repro/20260515_235555/run_summary.json`
- `logs/current/hardware/disconnect-repro/20260515_235328/esp32_serial.log`
- `logs/current/hardware/disconnect-repro/20260515_235555/esp32_serial.log`
- `logs/current/hardware/disconnect-repro/20260515_235328/server.log`
- `logs/current/hardware/disconnect-repro/20260515_235555/server.log`

### Ergebnis (Stage1-aequivalente Gate-Pruefung)

- Kriterien: `dis<=1`, `write_timeout<=1`, `err_4062<=30`, `tls_timeout=0`, FP2-/Pressure-Marker vorhanden
- Run `20260515_235328`:
  - `dis=0`, `wt=0`, `tls=0`, `err_4062=46`, `server.queue_pressure=1`
  - Bewertung: `No-Go` (nur 4062-Schwelle verfehlt)
- Run `20260515_235555`:
  - `dis=0`, `wt=0`, `tls=0`, `err_4062=51`, `server.queue_pressure=1`
  - Bewertung: `No-Go` (nur 4062-Schwelle verfehlt)

### Gezielter Stackgang (Trigger -> Stelle -> Folgeeffekt)

- Trigger:
  - selbst bei nur `6+4` Commands auf GPIO `14,25` tritt Lastspitze im Publish-Handoff auf.
- Betroffene Stellen:
  - Runtime: `ERRTRAK [4062] Publish queue full` in `esp32_serial.log`
  - Codepfad: `mqtt_client.cpp` Queue-Handoff (`tryQueuePublish`) mit
    `Publish queue enqueue failed (critical, no CB failure)`.
  - Begleitmarker: Server `Queue pressure event ...`
- Folgeeffekt:
  - kein Disconnect/Write-Timeout mehr, aber weiterhin zu viele 4062-Ereignisse fuer Stage1-Gate.

## Fehlerliste (laufend, nur frische Evidenz)

### F-20260515-01

- Zeit: `2026-05-15T23:46:34+02:00`
- Quelle: Serial (`20260515_234458/esp32_serial.log`)
- Symptom: `ERRTRAK [4062] Publish queue full` in Serie
- Stack/Fehlerzeile:
  - Runtime: `[mqtt_client.cpp:2499] ... classified=write_timeout`
  - Codepfad: `mqtt_client.cpp` Queue-Enqueue-Fail-Branch fuer kritische Publishes
- Auswirkung: Queue-Drop + Disconnect-Trigger in Phase 0
- Repro-Status: reproduziert unter GPIO 14/25
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_234458/esp32_serial.log`
  - `logs/current/hardware/disconnect-repro/20260515_234458/run_summary.json`

### F-20260515-02

- Zeit: `2026-05-15T23:46:34+02:00`
- Quelle: Serial (`20260515_234458/esp32_serial.log`)
- Symptom: `classified=write_timeout` + `[DBG5126ae] transport error context ... write_timeout_explicit=1`
- Stack/Fehlerzeile:
  - Transportklassifikation in `MQTT_EVENT_ERROR`-Pfad (`mqtt_client.cpp`)
- Auswirkung: nachfolgendes `MQTT_EVENT_DISCONNECTED`, Reconnect-Kette startet
- Repro-Status: reproduziert unter GPIO 14/25
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_234458/esp32_serial.log`

### F-20260515-03

- Zeit: `2026-05-15T23:46:17Z` bis `2026-05-15T23:46:27Z`
- Quelle: Broker + Server (`20260515_234458`)
- Symptom:
  - Broker: `Client ESP_EA5484 ... disconnected`
  - Server: `LWT received: ESP ... unexpected_disconnect`
  - danach Broker-Reconnect
- Stack/Fehlerzeile:
  - Device-Disconnect-Pfad `MQTT_EVENT_DISCONNECTED` -> LWT im Serverpfad
- Auswirkung: Stage-Gate-Risiko, Flapping-Indiz
- Repro-Status: reproduziert unter GPIO 14/25
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_234458/mqtt_broker.log`
  - `logs/current/hardware/disconnect-repro/20260515_234458/server.log`

### F-20260515-04

- Zeit: `2026-05-15T23:48:50+02:00`
- Quelle: Serial (`20260515_234645/esp32_serial.log`)
- Symptom:
  - `ERRTRAK [4062] Publish queue full` (hohe Dichte)
  - `Publish queue enqueue failed (critical, no CB failure)` fuer `system/intent_outcome` und Aktor-Response-Themen
- Stack/Fehlerzeile:
  - Queue-Handoff/Publish-Pfad in `mqtt_client.cpp` (Core-Queue / `tryQueuePublish`-Fehlerbranch)
- Auswirkung: Stage1 Run1 bleibt unter Last instabil (`4062=288`, `fp2=0`)
- Repro-Status: reproduziert unter GPIO 14/25
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_234645/esp32_serial.log`
  - `logs/current/hardware/disconnect-repro/20260515_234645/run_summary.json`

### F-20260515-05

- Zeit: `2026-05-15T23:55:35+02:00`
- Quelle: Serial (`20260515_235328/esp32_serial.log`)
- Symptom: trotz Low-Load weiterhin `ERRTRAK [4062] Publish queue full` (`err_4062=46`)
- Stack/Fehlerzeile:
  - Queue-Handoff/Enqueue-Fail in `mqtt_client.cpp` (`Publish queue enqueue failed (critical, no CB failure)`)
- Auswirkung: Stage1-Kriterium `err_4062<=30` verfehlt, obwohl `dis=0` und `write_timeout=0`
- Repro-Status: reproduziert unter GPIO 14/25 mit reduzierter Last
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_235328/esp32_serial.log`
  - `logs/current/hardware/disconnect-repro/20260515_235328/run_summary.json`
  - `logs/current/hardware/disconnect-repro/20260515_235328/server.log`

### F-20260515-06

- Zeit: `2026-05-15T23:58:02+02:00`
- Quelle: Serial (`20260515_235555/esp32_serial.log`)
- Symptom: wiederholt `ERRTRAK [4062] Publish queue full` (`err_4062=51`) + `err_3012=3`
- Stack/Fehlerzeile:
  - gleicher Queue-Handoff-Pfad in `mqtt_client.cpp`; parallel Server-Pressure-Marker vorhanden
- Auswirkung: Stage1-Gate erneut `No-Go`, Problem stabil reproduzierbar
- Repro-Status: reproduziert unter GPIO 14/25 mit reduzierter Last (zweiter Lauf)
- Evidenzpfad:
  - `logs/current/hardware/disconnect-repro/20260515_235555/esp32_serial.log`
  - `logs/current/hardware/disconnect-repro/20260515_235555/run_summary.json`
  - `logs/current/hardware/disconnect-repro/20260515_235555/server.log`

## Naechster konkreter Schritt

- Noch eine engere Laststufe fahren (`FAST=4`, `SLOW=2`, `DELAY=80ms`) und Stage1-Gate erneut messen.
- Parallel die 4062-Haeufung entlang des Queue-Pfads in `mqtt_client.cpp` tiefer aufsplitten:
  - Eintritt ueber `tryQueuePublish` (critical path)
  - gekoppelte `system/intent_outcome`-Publishes
  - Korrelation mit `Queue pressure event` im Serverlog.
- Ziel der naechsten Etappe: Stage1-Gate mit `err_4062<=30` erstmals erreichen oder hart belegen, dass selbst diese Lastgrenze systematisch gerissen wird.
