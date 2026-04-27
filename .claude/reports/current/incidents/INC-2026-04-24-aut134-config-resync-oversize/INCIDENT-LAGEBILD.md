# INCIDENT-LAGEBILD — AUT-134 Config-Resync Oversize (2026-04-24)

> **Incident-ID:** `INC-2026-04-24-aut134-config-resync-oversize`  
> **Run-Mode:** `both` (Reihenfolge `incident_first`)  
> **Git-Branch (IST/SOLL):** `auto-debugger/work` / `auto-debugger/work`  
> **Linear-Kontext:** AUT-134 (Parent AUT-132)

---

## Symptom-Cluster (IST)

| Cluster | Schicht | Befund | Status |
|---|---|---|---|
| C1 | Firmware Config-Ingress | `intent_outcome`: `flow=config`, `outcome=rejected`, `code=VALIDATION_FAIL`, `reason=[CONFIG] Payload too large: 4164 bytes, max=4096` (CID `f9f74534-5c3a-4735-876f-4c3132cec644`) | KRITISCH |
| C2 | Server/DB Config-Response | Wiederholte Config-Responses inkl. Fehler `[CONFIG] Payload too large: 4370 bytes, max=4096` im AUT-134-Kontext | KRITISCH |
| C3 | Firmware Publish-Lane Heartbeat | COM3 zeigt historisch mehrfach `Publish rejected (oversize)` mit `payload_len=1225..1229` (über damaligem Limit); Repo-IST: `PUBLISH_PAYLOAD_MAX_LEN=1536` in `publish_queue.h` | HOCH (Forensik) / teilweise gemildert (aktueller Build) |
| C4 | Observability/Forensik | Alloy/Loki `entry too far behind` und `dropping data` erschweren lückenlose Burst-Korrelation | HOCH |

---

## Belastbare Evidence-Spur

1. **User-Event JSON (Pflichtevidenz, vom Auftraggeber geliefert):**
   - `intent_outcome`
   - `flow=config`
   - `outcome=rejected`
   - `code=VALIDATION_FAIL`
   - `reason=[CONFIG] Payload too large: 4164 bytes, max=4096`
   - `correlation_id=intent_id=f9f74534-5c3a-4735-876f-4c3132cec644`

2. **Repo-Dokumentation AUT-134:**
   - `docs/analysen/configaustausch-architekturanalyse-2026-04-23.md`
   - zeigt Burst-Muster und Fehler `[CONFIG] Payload too large: 4370 bytes, max=4096` sowie Triggerpfad über Count-Mismatch.

3. **Live-Serial COM3 (Terminaldatei):**
   - `.../terminals/47.txt` enthält wiederholt:
     - `Publish rejected (oversize) topic_len=42 payload_len=1225`
     - `Publish rejected (oversize) ... payload_len=1227`
     - `Publish rejected (oversize) ... payload_len=1228`
     - `Publish rejected (oversize) ... payload_len=1229`
   - Folgekette: Queue-Drop -> CircuitBreaker-Failure -> `Heartbeat publish failed`.

4. **Firmware-Code-Evidence (harte Limits):**
   - `El Trabajante/src/main.cpp`: Config-Ingress reject bei `payload_len >= CONFIG_PAYLOAD_MAX_LEN` mit `VALIDATION_FAIL` (Reason-String enthält `max=<CONFIG_PAYLOAD_MAX_LEN>`).
   - `El Trabajante/src/tasks/config_update_queue.h`: `CONFIG_PAYLOAD_MAX_LEN` (Repo-**IST 2026-04-24:** `4352`, Kommentar CP-F4).
   - `El Trabajante/src/tasks/publish_queue.h`: `PUBLISH_PAYLOAD_MAX_LEN` (Repo-**IST 2026-04-24:** `1536`, Kommentar AUT-134 Headroom).
   - `El Trabajante/src/tasks/publish_queue.cpp`: Oversize-Publishes werden hart verworfen.
   - **Abgleich Live-Evidence (ältere Builds):** User-/Audit-Werte `4164/4096` bzw. `4370/4096` und Serial `1225/1024` beziehen sich auf die **früheren** härteren Limits; aktueller Branch hebt die Budgets, **ohne** das Server-Budget-Problem 4370>4352 loszuwerden (siehe Auftrag PKG-01).

5. **Server-Code-Evidence (Resync-Trigger):**
   - `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py`:
     - `_has_pending_config()` triggert bei Count-Drift (`esp_*_count != db_*_count`).
     - `_auto_push_config()` sendet komplette `combined_config`.
   - `El Servador/god_kaiser_server/src/services/esp_service.py`:
     - sendet mit `correlation_id=request_id=intent_id`,
     - ergänzt `generation` + `config_fingerprint`,
     - hat keinen expliziten Payload-Budget-Precheck vor Publish.

6. **TM-Kontext (Priorisierung/Architektur):**
   - `.technical-manager/TECHNICAL_MANAGER.md` bestätigt Fokus auf Heartbeat/Config-Härtung (AUT-121/AUT-133 parallel zu AUT-134-Risiko).

7. **Docker-Live-Logs (24h, ergänzend):**
   - `automationone-server`: zeigt Config-/Outcome-Verarbeitung für `ESP_698EB4` (`intent_outcome flow=config outcome=accepted/persisted`) und Guard-Log
     `Skipping stale config_response due to terminal authority guard`.
   - `automationone-mqtt`: zeigt aktive Reconnect-/Subscribe-Phasen (`ESP_698EB4`, `system/heartbeat/ack`, `.../config`), aber im gezogenen Fenster keine
     expliziten `Payload too large`-Brokerzeilen.
   - `automationone-alloy`: bestätigt Ingestion-Störungen (`final error sending batch ... dropping data`, `entry too far behind`).

---

## Arbeits-Hypothese (evidenzbasiert)

1. **Dual-Oversize-Pfad** ist aktiv:
   - **Pfad A (Config-Ingress):** Server/Firmware tauschen zu große Config-Payloads (`>4096`) aus, Firmware rejected deterministisch.
   - **Pfad B (Heartbeat-Publish):** Runtime-/Telemetry-Ballast sprengt `1024` im Publish-Envelope bei Zone-/Resync-Phasen.
2. **Count-Drift-getriebene Auto-Resyncs** verstärken Lastfenster und erhöhen die Wahrscheinlichkeit für Oversize + Reattempt-Muster.
3. **Observability-Lücken** verhindern aktuell eine vollständig geschlossene Docker-Layer-Timeline ohne zusätzliche User-Hand-Exports.

---

## Zusammenhängende Fehlerbilder (AUT-134/EA-132)

- `rejected/VALIDATION_FAIL` auf Config-Pfad (CID-basiert) -> kein sauberer Config-Abschluss.
- Wiederholte Config-Re-Sync-Impulse aus Heartbeat-Drift -> Burst-Risiko.
- Heartbeat Oversize in derselben Betriebsphase -> reduzierte Stabilitätsmarge + Circuit-Breaker-Noise.
- Operatorisch schwer trennbar ohne klare Korrelation zwischen Intent-Outcome, Config-Publish und Telemetry-Drift.

---

## Kritische Abgrenzung (Pflicht)

- **ISA-18.2 / NotificationRouter / persistierte DB-Notifications** und
- **WebSocket `error_event` (realtime, potenziell ohne NotificationRouter)**

sind **getrennte Ketten**. In diesem Incident liegt der Primärfokus auf Config-/Heartbeat-Contract- und Payload-Pfaden; eine direkte Root-Cause-Zuordnung in die Notification-Kette erfolgt nur mit zusätzlicher Evidence.

---

## Offene Fragen / BLOCKER

1. Für CID `f9f74534-5c3a-4735-876f-4c3132cec644` fehlt im Workspace derzeit der komplette Server/Broker-Raw-Logausschnitt (nur User-Event + abgeleitete Spuren vorhanden).
2. Docker-Broker/Server/Alloy-Livefenster sind nun teilweise verifiziert (24h-Tails vorhanden), aber der exakte CID-Zeitkorridor für `f9f74534-...` ist
   darin noch nicht vollständig enthalten.
3. DB-Stichprobe zu betroffenen `audit_logs`/`command_intents` für exakt diese CID nicht direkt ausgeführt (optional `db-inspector`-Paket).

---

## Eingebrachte Erkenntnisse

- 2026-04-24T00:00Z: Incident-Zielordner neu aufgebaut; Pflicht-Branch geprüft (`auto-debugger/work`).
- 2026-04-24T00:00Z: Pflicht-Evidenzen aus Steuerdatei + AUT-134-Doku + COM3-Terminal + TM-Kontext korreliert.
- 2026-04-24T00:00Z: Dual-Oversize-Bild (Config 4096-Limit vs. Heartbeat 1024-Limit) als primärer Incident-Treiber bestätigt.
- 2026-04-24T00:00Z: Docker-Live-Logs aus `automationone-server`, `automationone-mqtt` und `automationone-alloy` nachgezogen; Alloy-Drop-Problematik erneut bestätigt.
- 2026-04-24 (Orchestrator): **Code-Root-Cause max_runtime:** In `actuator_manager.cpp` (R20-P11) sind `soft_changed` und der Soft-Update-Pfad **ohne** `runtime_protection` (v. a. `max_runtime_ms`). Wenn Namen, Subzone, critical/inverted/defaults unverändert bleiben, endet `configureActuator` mit „config unchanged, skipping“ **bevor** frisch geparstes `max_runtime_ms` aus dem MQTT-JSON angewendet wird. Server-Mapping `safety_constraints.max_runtime` -> `max_runtime_ms` in `config_mapping.py` ist davon unabhängig plausibel; das Symptom „max. Laufzeit kam nicht an“ erklärt sich firmwareseitig als Skip-Pfad, nicht zwingend als fehlender Server-Wert.
- 2026-04-24 (Orchestrator): **NVS [E] sen_1_type / sensor_1_type:** In `config_manager.cpp` (Schleife „Sensor bereits vorhanden“) wird `getString` auf `sen_%d_type` / Legacy-Key **ohne** vorgeschaltetes `keyExists` aufgerufen – ESP-`Preferences` loggt `[E] NOT_FOUND` auch wenn der Folgecode leer weitermacht. Funktional harmlos, diagnostisch laut; Abhilfe: gleiches Muster wie `migrateReadString` (siehe Kommentar Zeile ~1564).
- 2026-04-24 (Orchestrator): **6 offline_rules / „eine Regel in der UI“:** Log-Zeile `__twindow_on` + `sensor GPIO 255 (INVALID)` ist bei Zeitfenster-Regeln **Anzeige-Semantik** (`formatGpioUi(255)` in `offline_mode_manager.cpp`), nicht automatisch fehlerhafte Logik. Abgleich Anzahl: Server `config_builder._build_offline_rules` inkl. `MAX_OFFLINE_RULES` + DB-Logik-Regeln vs. UI-Zählung bleibt separates Klär-Paket (siehe TASK-PACKAGES PKG-08).
- 2026-04-24 (Orchestrator, Verify-Nachlauf): **Repo-IST vs. Incident-Evidence** — In `config_update_queue.h` / `publish_queue.h` liegen `CONFIG_PAYLOAD_MAX_LEN=4352` und `PUBLISH_PAYLOAD_MAX_LEN=1536` (nicht mehr 4096/1024). `platformio.ini` empfiehlt `pio test -e native -f test_topic_*` (nicht `-f test_topic_builder`). `VERIFY-PLAN-REPORT.md` und `TASK-PACKAGES.md`/`SPECIALIST-PROMPTS.md` an diese IST-Werte angeglichen. **Konsequenz:** 4164 B wäre mit 4352-Buffer akzeptabel; 4370 B bleibt >4352 und damit serverseitiger Budget-Druck weiterhin belegt. `LINEAR-SYNC-MANIFEST.json` angelegt (Parent AUT-134, Sub AUT-164..166).
