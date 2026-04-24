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
| C3 | Firmware Publish-Lane Heartbeat | COM3 zeigt mehrfach `Publish rejected (oversize)` mit `payload_len=1225/1227/1228/1229` bei `PUBLISH_PAYLOAD_MAX_LEN=1024` | HOCH |
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
   - `El Trabajante/src/main.cpp`: Config-Ingress reject bei `payload_len >= CONFIG_PAYLOAD_MAX_LEN` mit `VALIDATION_FAIL`.
   - `El Trabajante/src/tasks/publish_queue.h`: `PUBLISH_PAYLOAD_MAX_LEN = 1024`.
   - `El Trabajante/src/tasks/publish_queue.cpp`: Oversize-Publishes werden hart verworfen.

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
