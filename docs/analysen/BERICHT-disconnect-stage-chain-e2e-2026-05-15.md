# End-to-End Bericht: Disconnect Stage Chain (2026-05-15)

## Auftrag und Umfang
- Ziel war ein kompletter Lauf `Phase 0 -> Stage 1 -> Stage 2A -> Stage 2B -> Stage 2C` via `scripts/hardware/run_disconnect_stage_chain.sh` mit Live-Korrelation ueber Runner, Repro-Artefakte, Loki, Server, API und DB.
- Es wurden zwei reale Laufversuche mit Standard-Laufzeiten durchgefuehrt (keine Smoke-Parameter): `20260515_231419` und `20260515_231639`.
- Ein kleiner Script-Flow-Blocker wurde minimal-invasiv adressiert: Grace-Recheck fuer Early-Serial in `scripts/hardware/repro_disconnect_esp32.sh`.

## Testkonfiguration
- Runner: `scripts/hardware/run_disconnect_stage_chain.sh`
- Repro-Subrunner: `scripts/hardware/repro_disconnect_esp32.sh`
- ESP: `ESP_EA5484`, GPIO `25`, Baud `115200`
- Capture:
  - Phase 0: `90s`
  - Stage 1/2A/2B: `120s` (nicht erreicht)
  - Stage 2C: `180s` (nicht erreicht)
- Pre-Run API-Schritt im Repro aktiv (`Frontend-Actuator-Save`).

## Exakte Lauf-IDs und Ergebnis
- Versuch 1:
  - Stage-Tag: `20260515_231419`
  - Repro-Run: `logs/current/hardware/disconnect-repro/20260515_231419`
  - Stage-Log: `logs/current/hardware/disconnect-repro/stage_chain_live_20260515_231419.log`
  - Monitor: `stage_chain_monitor_20260515_231419.jsonl`, `stage_chain_issues_20260515_231419.jsonl`
- Versuch 2 (nach Minimal-Fix):
  - Stage-Tag: `20260515_231639`
  - Repro-Run: `logs/current/hardware/disconnect-repro/20260515_231639`
  - Stage-Log: `logs/current/hardware/disconnect-repro/stage_chain_live_20260515_231639.log`
  - Monitor: `stage_chain_monitor_20260515_231639.jsonl`, `stage_chain_issues_20260515_231639.jsonl`

## Stage-by-Stage (Go/No-Go)
- Phase 0: `No-Go` (beide Versuche)
  - Beleg: `logs/current/hardware/disconnect-repro/stage_chain_result_latest.json`
  - `capture_exit=2`, `summary_json_exists=false`, `unusable=true`, `stop_reason=phase0_no_go`
- Stage 1: nicht gestartet
- Stage 2A: nicht gestartet
- Stage 2B: nicht gestartet
- Stage 2C: nicht gestartet

## Korrelierte Timeline (ESP/Broker/Server/Loki/API/DB)
- 21:14:19 UTC+0: Start Versuch 1 (`stage-chain-phase0`).
  - Beleg: `stage_chain_live_20260515_231419.log`
- 21:14:44-21:14:46 UTC+0: Broker sieht ESP-Verbindung + Topic-Subscriptions.
  - Beleg: `20260515_231419/mqtt_broker.log`
- 21:15:55 UTC+2 (Serial-Zeitstempel im Log): ESP meldet `tls_timeout`, danach `MQTT_EVENT_DISCONNECTED`.
  - Beleg: `20260515_231419/esp32_serial.log`
- 21:15:55 UTC+0: Runner markiert Versuch 1 als unverwertbar und stoppt nach Phase 0.
  - Beleg: `stage_chain_live_20260515_231419.log`
- 21:16:39 UTC+0: Start Versuch 2 nach Minimal-Fix (Early-Serial Grace-Recheck).
  - Beleg: `stage_chain_live_20260515_231639.log`
- 21:16:39-21:18:15 UTC+0: trotz Grace-Recheck weiterhin `0B` beim Early-Check, Run unverwertbar, Phase 0 No-Go.
  - Beleg: `stage_chain_live_20260515_231639.log`
- Parallel-Live-Monitoring 21:17-21:18 UTC+0:
  - Loki `ready=200`, Query-Responses vorhanden.
  - DB-Konsistenz vorhanden (`esp_devices` online, `command_intents/outcomes` wachsen, `actuator_state_rows=1`, `sensor_data` vorhanden).
  - API Login konstant `200`.
  - Beleg: `stage_chain_monitor_20260515_231639.jsonl`
- Nachlauf-Verifikation API (sauberer Bearer-Token, volle Antwort geparst):
  - `/esp/devices`, `/esp/devices/ESP_EA5484`, `/actuators/ESP_EA5484/25/status`, `/sensors/health` => jeweils `200`.
  - Beleg: interaktiver Check in dieser Session (Shell-Ausgabe).

## Gefundene Fehler (strukturiert)

### F1 - Phase-0 Unverwertbar wegen Early-Serial-Check
- Zeit: 21:15:55 (Versuch 1), 21:18:15 (Versuch 2)
- Quelle: Runner/Repro (`repro_disconnect_esp32.sh`)
- Symptom: `Run nicht verwertbar: Zu wenig Serial-Input nach Start (0B < 16B).`
- Vermutete Ursache: Early-Serial-Gate feuert vor stabiler Datenverfuegbarkeit am Port; gleichzeitig zeigen Artefakte spaeter Serial-Daten.
- Auswirkung: Vollkette endet immer in Phase 0 (`No-Go`), Stages 1/2A/2B/2C nicht erreichbar.
- Reproduzierbarkeit: hoch (2/2)
- Belegpfade:
  - `stage_chain_live_20260515_231419.log`
  - `stage_chain_live_20260515_231639.log`
  - `stage_chain_result_latest.json`
  - `20260515_231419/esp32_serial.log`
  - `20260515_231639/esp32_serial.log`

### F2 - Monitor-seitige API-401 in Live-Recorder (Artefaktfehler)
- Zeit: 21:17-21:18
- Quelle: Live-Monitor-Skript (dieser Testlauf)
- Symptom: `esp_devices HTTP 401`, `esp_device HTTP 401`
- Vermutete Ursache: im Monitor wurde Login-Body fuer Persistenz gekuerzt; Token-Parsing daraus fuehrte zu fehlendem/ungueltigem Auth-Header.
- Auswirkung: API-Teilbefund im JSONL war zeitweise falsch-negativ.
- Reproduzierbarkeit: mittel (im verwendeten Monitor-Code)
- Belegpfade:
  - `stage_chain_monitor_20260515_231639.jsonl`
  - `stage_chain_issues_20260515_231639.jsonl`
- Gegenbeleg:
  - unmittelbarer manueller API-Check mit vollstaendigem Token zeigt alle Zielendpunkte `200`.

### F3 - Disconnect/TLS-Timeout-Signal unter Last sichtbar (nur Versuch 1 Artefakt)
- Zeit: 21:15:55 (Serial-Zeit im Log)
- Quelle: ESP Serial
- Symptom: `ESP_ERR_ESP_TLS_CONNECTION_TIMEOUT`, `MQTT_EVENT_DISCONNECTED`
- Vermutete Ursache: Transport-Instabilitaet/Timeout-Pfad unter den beobachteten Laufbedingungen.
- Auswirkung: Verbindungsabbruch-Signatur vorhanden, aber wegen Phase-0-Abbruch keine Stage-Bewertung moeglich.
- Reproduzierbarkeit: einmal im verwerteten Logausschnitt sichtbar.
- Belegpfad: `20260515_231419/esp32_serial.log`

## Stabil / Nicht stabil
- Stabil:
  - Monitoring-Stack erreichbar (`Loki ready`, Querys liefern Daten).
  - Backend-Liveness und Sensor-Health-Endpunkt erreichbar.
  - DB-Konsistenz fuer Zielgeraet vorhanden (`esp_devices.status=online`, Marker-Zaehler vorhanden).
  - MQTT-Broker laeuft stabil (Healthcheck-Verbindungen sichtbar).
- Nicht stabil bzw. nicht freigegeben:
  - End-to-End Stage-Kette nicht bis Stage 1+ ausfuehrbar, da Phase 0 in beiden Versuchen No-Go.
  - Verlaessliche Early-Serial-Gating-Entscheidung weiterhin kritisch.

## Durchgefuehrte minimal-invasive Aenderung
- Datei: `scripts/hardware/repro_disconnect_esp32.sh`
- Aenderung:
  - Neue Env-Parameter:
    - `EARLY_SERIAL_GRACE_SECONDS` (Default `12`)
    - `EARLY_SERIAL_RECHECK_INTERVAL_SECONDS` (Default `3`)
  - Vor Exit bei `early_serial_bytes < EARLY_SERIAL_MIN_BYTES` wird Grace-Recheck durchgefuehrt.
- Ergebnis:
  - Blocker nicht vollstaendig aufgeloest (Versuch 2 weiterhin `0B` waehrend Early-Window).
  - Diagnose verbessert, da Timing-Race explizit sichtbar.

## Konkrete naechste Massnahmen
- M1 (hoch): Early-Serial-Gate robustisieren statt starrer Byte-Mindestmenge (z. B. zweite Bedingung: Broker-ESP-Events oder expliziter Boot/Heartbeat-Marker im Serial/Broker innerhalb eines erweiterten Fensters).
- M2 (hoch): Optionaler `PHASE0_RETRY_COUNT` im Stage-Chain-Runner (z. B. 2-3 automatische Phase-0-Retries) ohne manuelle Neustarts.
- M3 (hoch): Bei `capture_exit=2` trotzdem `run_summary.json` schreiben, damit Gate-Entscheidung und Root-Cause sauber maschinenlesbar bleiben.
- M4 (mittel): Monitoring-Skript fuer API-Checks dauerhaft korrigieren (Token nur aus ungekürztem Login-Body parsen).
- M5 (mittel): Serielle Vorbedingungen hardwareseitig pruefen (USB-Stabilitaet, Bootfenster, eventuelle Port-Arbitration).

## Gesamtfazit
- Ein vollstaendiger Stage-Kettenlauf bis 2C war hardware-/timingseitig nicht erreichbar.
- Bis zum maximal sinnvollen Punkt wurde weitergelaufen: zwei vollwertige Phase-0-Versuche inkl. Live-Korrelation ueber Runner, Repro-Artefakte, Loki, Server, API und DB.
- Die zentrale Blockade liegt weiterhin im fruehen Verwertbarkeits-Gate der Serial-Capture-Phase.
