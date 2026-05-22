# Aktor-Latenz Root-Cause Bericht (2026-05-20)

- Laufartefakt: `/home/robin/autoone/logs/current/hardware/actuator-chain-20260520T104500Z`
- Bericht erstellt: `2026-05-20T10:52:31.678193+00:00`

## Kurzfazit (gelb)
- Hauptdominanz liegt in `t6-t5` (DB-Terminalisierung nach MQTT-terminal) und in `t1-t0` (API-Path bis REST-Return).
- Queue-Pressure ist weiterhin aktiv und korreliert mit langsamen Ketten unter Last.
- Traceability ist end-to-end vorhanden (correlation_id), aber `t7` (WS/UI arrival) bleibt in diesem Lauf nicht direkt messbar.

## Verifizierter Deploy-/Flash-Stand
- Backend-Container: `sha256:217a3cf8dce28112f6cf43e5d8ac0ec58647c899215b84069964c2566f2e740f|2026-05-20T09:52:47.522801793Z|/home/robin/autoone/El Servador/god_kaiser_server/src:/app/src:bind;/home/robin/autoone/logs/server:/app/logs:bind;/home/robin/autoone/backups:/app/backups:bind;`
- API Health: `healthy` | Env `production` | Version `2.0.0`
- ESP State: `online` | boot_sequence_id `ESP_EA5484-b1-r1` | mqtt_connected `True`
- Firmware-Feld in Device-API: `None` (null), Laufzeit über Heartbeat/Boot-Sequenz verifiziert

## Segmentierte Latenzanalyse (t0..t7)
| Segment | count | p50 ms | p95 ms | max ms |
|---|---:|---:|---:|---:|
| t6_t5 | 15 | 6201 | 10072 | 11852 |
| t1_t0 | 14 | 4203 | 9362 | 9813 |
| t3_t2 | 15 | 0 | 1000 | 1000 |
| t5_t4 | 15 | 0 | 1000 | 1000 |
| t4_t3 | 15 | 0 | 0 | 0 |
| t2_t1 | 14 | -2070 | -310 | -160 |

- Interpretation: Dominant sind `t6_t5` (p95 10072 ms) und `t1_t0` (p95 9362 ms).
- `t2..t5` sind aufgrund MQTT-Prefix-Zeitauflösung (Sekunden) nur grob; Dominanzbefund bleibt über DB-Zeitpunkte stabil.
- `t7` nicht direkt gemessen (kein dedizierter WS-Correlation-Timestamp im Lauf).

## Root-Cause-Kette (technisch + fachlich)
1. **API-Path-Latenz (`t1_t0`)**: synchrone Vor-/Nach-DB-Phasen im Command-Path plus MQTT-Publish im Request-Pfad erhöhen REST-Return-Zeit deutlich.
   - Code: `El Servador/god_kaiser_server/src/services/actuator_service.py`, `El Servador/god_kaiser_server/src/mqtt/publisher.py`
2. **Terminalisierungslatenz (`t6_t5`)**: `command_outcomes(flow=command)` erhält terminale `terminal_at` teils viele Sekunden nach erstem Outcome-Eintreffen.
   - Evidenz: `command_outcomes.txt`, `stage_timeline_traces.json`, Outlier-Top10
3. **Queue/Backpressure als Verstärker**: wiederholte `queue_pressure entered/recovered`, steigende `shed_count/drop_count` während Aktor-Ketten.
   - Evidenz: `mqtt_revalidate_filtered.log`, `server_window_filtered_current.log`
4. **Rule-Noop-/Duplicate-Effekte**: zusätzliche `NOOP_DESIRED_EQUALS_CURRENT` Outcomes in S3/S4 erhöhen Event-Volumen ohne fachlichen Mehrwert.
   - Evidenz: `post_noop_fix_validation.json`, `command_outcomes.txt`

## Fix-Liste (surgical)
- **Umgesetzt in dieser Session:** Kein Produktionscode-Fix, da `t2..t5` mangels ms-genauer WS/MQTT-Stage-Timestamps noch nicht stark genug für risikoarmen Eingriff in Laufzeitlogik ist.
- **Observability repariert:** Neuer versionierter Lauf mit sauberen Artefakten und reproduzierbarer Stage-Pipeline unter `actuator-chain-20260520T104500Z`.
- **Nächster minimal-invasiver Schritt (priorisiert):** serverseitige Stage-Timestamps (ms, correlation_id-gebunden) in Subscriber/Handler/WS-Emit ergänzen, dann 1 gezielter Fix auf dominantes Segment (`t6_t5` oder `t1_t0`).

## Correlation-Traceability (Stichprobe + Aggregation)
- Traces gesamt: `18`
- Top-10 Outlier: `10` in `outliers_top10.json`
- `b47c9900-3f7d-4823-b5d8-c405b949537b` | `S2_rapid_on_off` | total_known_ms `14144` | code `NONE`
- `0c14ab53-cb45-4527-8721-e0b9b55b0272` | `S1_baseline_on_off` | total_known_ms `13334` | code `NONE`
- `6713a113-c8e6-4505-b3a0-fe1dc43bad76` | `S2_rapid_on_off` | total_known_ms `12388` | code `NONE`
- `dabc7621-2aa0-42e8-9e9a-4c3adc6ca381` | `S2_rapid_on_off` | total_known_ms `10894` | code `NONE`
- `43a06e50-ad90-43d9-965e-6237a8665fd2` | `S2_rapid_on_off` | total_known_ms `10804` | code `NONE`

## Non-Regression-Ergebnisse
- Health/API: `healthy` / `healthy`
- Sensorpfad: sensor_count `4`
- Rule enable/disable: HTTP `200` / `200`
- Actuator smoke `OFF`: HTTP `200`, terminal `applied|NONE|2026-05-20 10:51:34.503766+00`, elapsed_ms `5283`
- Actuator smoke `ON`: HTTP `200`, terminal `applied|NONE|2026-05-20 10:51:40.371397+00`, elapsed_ms `5942`

## Offene Risiken & nächste Schritte (priorisiert)
1. `t7` (WS/UI arrival) fehlt weiterhin als harte Stage-Metrik -> WS-Emit/Client-Arrival Timestamp ergänzen.
2. `t6_t5`-Dominanz verifizieren mit ms-genauen Handler-Commit-Spans (Subscriber/IntentOutcome/ActuatorResponse).
3. Danach genau **einen** Surgical-Fix implementieren und sofort S1+S2 (+S3/S4 bei Rule) revalidieren.
4. Serial-Kanal liefert in diesem Lauf keine verwertbaren Bytes; UART-Capture-Pfad separat stabilisieren (kein Binär-/Leercapture).