# Config-Austausch Architektur- und Live-Analyse (2026-04-23)

## Ziel

Pruefen, warum Configs im Live-System teilweise zu oft als Voll-Config gesendet werden, statt gezielt nur bei echtem Bedarf und sauberem Timing entlang Handshake/Contract/State.

## Kurzfazit

Das Problem ist reproduzierbar und liegt nicht primaer an fehlenden Komponenten, sondern an der Verdrahtung:

1. **Auto-Config-Push wird zu oft count-basiert ausgelöst** (`sensor_count/actuator_count` aus Heartbeat gegen DB).
2. **Voll-Config wird ohne durchgaengige Generation/Fingerprint-Mechanik gesendet** (ESP kann Guarding zwar, bekommt aber oft kein verwertbares Signal).
3. **Contract-Pfad ist teils tolerant statt strikt** (missing-correlation Fallbacks sichtbar).
4. **Observability hat Lueckenrisiko** (Alloy/Loki droppt teils alte Eintraege), was die Forensik von Burst-Fenstern erschwert.

## Live-Evidenz (Docker + DB)

### 1) Config-Response Burst-Muster

DB `audit_logs` zeigt fuer `ESP_6B27C8` wiederholte schnelle Voll-Responses:

- 07:39 UTC: 4 Responses/Minute
- 08:55 UTC: 4 Responses/Minute (2 Fehler)
- 09:19 UTC: 3 Responses/Minute

24h-Summe:

- `success=64`
- `error=5`

Fehlerbild im gleichen Pfad:

- `[CONFIG] Payload too large: 4370 bytes, max=4096`

### 2) Metadata-Signale

`esp_devices.device_metadata` (online devices):

- `ESP_6B27C8` hat `config_push_sent_at` gesetzt.
- Gleichzeitig laufen Heartbeats weiter (`last_heartbeat` aktuell), was auf wiederholte Trigger-/Apply-Fenster hindeutet.

### 3) Alloy/Loki

Alloy meldet mehrfach:

- `final error sending batch ... dropping data`
- Grund: `entry too far behind`

Folge: Forensik-Korrelation in Lastphasen kann unvollstaendig sein.

## Architekturabgleich (Diagramme vs. Code)

Die Diagramme (`firmware-architektur.svg`, `server-architektur.svg`, `kaiser-relay-skalierung.svg`) beschreiben korrekt:

- Contract-getriebenen Handshake,
- ACK-Pfade,
- serverzentrierte Steuerung,
- reconnect-basierte state pushes.

Im Code ist das grundsaetzlich vorhanden, aber mit nicht-optimalen Triggern:

### Server

- `src/mqtt/handlers/heartbeat_handler.py`
  - `_has_pending_config()` triggert Auto-Push bei Count-Mismatch (`ESP 0` vs `DB > 0`).
  - `_auto_push_config()` baut immer komplette Config und sendet sie.
- `src/services/config_builder.py`
  - liefert Voll-Config (`sensors`, `actuators`, `offline_rules`), aber ohne explizite serverseitige `generation`/`config_fingerprint`.
- `src/services/esp_service.py`
  - `send_config()` ist robust in Correlation/Audit-Ansatz, aber Push-Entscheidungen kommen upstream aus Triggerlogik.

### Firmware

- `src/main.cpp`
  - Config-Ingest geht ueber Contract/Admission.
- `src/tasks/config_update_queue.cpp`
  - hat bereits generation-basierte Scope-Guards (`STALE_*_SCOPE`), braucht aber konsistent belastbare Inputs.
- `src/services/communication/mqtt_client.cpp`
  - Heartbeat- und Publish-Layer enthalten bereits Schutzmechanismen, aber kein Ende-zu-Ende Delta-Contract fuer Config-Push.

## Root-Cause-Hypothese (arbeitsfaehig)

Primärer Treiber ist **Triggerdesign + fehlende Delta-SSOT**, nicht ein einzelner kaputter Handler:

1. Count-Mismatch ist als alleiniger Trigger zu grob.
2. Voll-Config ohne eindeutige serverseitige Versionierung/Fingerprint fuehrt zu unnoetigen Re-Applies.
3. Contract-Fallbacks (missing correlation) halten den Fluss am Leben, verdecken aber Teilfehler.

## Nicht-Ziele in diesem Schritt

- Kein Breaking Change am MQTT-/REST-/WS-Contract.
- Keine sofortige Grossrefaktorierung ueber mehrere Epics.
- Keine ad-hoc Produktcode-Aenderung ohne verify-plan Gate.

## Umsetzungsplan fuer Agenten (sequenziell)

### A) server-dev (zuerst)

1. Trigger-Haertung in `_has_pending_config()`:
   - Count-Mismatch nur noch als schwaches Signal.
   - zusaetzlicher Drift-Check via `config_fingerprint`.
2. Additive Payload-Metadaten in Config:
   - `generation`
   - `config_fingerprint`
3. reason_code-Audit fuer jede Send-Entscheidung.

**Gate A:** Kein Voll-Config-Push ohne Drift/Reconnect-Notwendigkeit.

### B) esp32-dev

1. Generation/Fingerprint strikt im Apply-Pfad auswerten.
2. Re-Apply bei identischem Payload vermeiden.
3. Oversize-Pfad deterministisch behandeln (kein Retry-Flood).

**Gate B:** Wiederholte identische Config fuehrt nicht zu wiederholtem Apply.

### C) mqtt-dev

1. Topic/QoS-Contract fuer Config/Response gegen SSOT pruefen.
2. Event-Dokumentation fuer neue reason_code/generation/fingerprint Felder aktualisieren.

**Gate C:** Contract-SSOT entspricht Implementierung.

### D) frontend-dev

1. Operatorische Sicht:
   - warum gesendet,
   - accepted/stale/failed,
   - wartend vs. echter Fehler.
2. Keine neue Parallel-UI, bestehende Muster weiterverwenden.

**Gate D:** Finalitaet und Ursachen sind fuer Operatoren klar sichtbar.

## Verify-Gates (gesamt)

- VG-01: 30 min Live-Lauf, keine Burst-Vollpushes ohne Drift.
- VG-02: Gleiches Fingerprint -> kein neuer Vollpush.
- VG-03: Missing-correlation wird als Contract-Verstoss sichtbar behandelt.
- VG-04: Oversize-Config erzeugt keinen unkontrollierten Retry-Sturm.
- VG-05: Alloy/Loki-Ingestion fuer Testfenster ohne relevante Luecken.

## Addendum 2026-04-24 (AUT-134 Incident-Lauf)

Neue Incident-Evidenz aus `INC-2026-04-24-aut134-config-resync-oversize` bestaetigt das bestehende Bild als **Dual-Oversize-Problem**:

1. **Config-Ingress Oversize (4096-Limit):**
   - User-Event (Pflichtevidenz):  
     `intent_outcome`, `flow=config`, `outcome=rejected`, `code=VALIDATION_FAIL`,  
     `reason=[CONFIG] Payload too large: 4164 bytes, max=4096`,  
     `correlation_id=intent_id=f9f74534-5c3a-4735-876f-4c3132cec644`.
2. **Heartbeat Publish Oversize (1024-Limit):**
   - COM3-Live-Serial (`terminals/47.txt`): wiederholt  
     `Publish rejected (oversize) ... payload_len=1225/1227/1228/1229`.

Konsequenz fuer weitere Umsetzung:
- Auto-Resync-Haertung muss **beide** Budget-Grenzen beruecksichtigen (Server-Precheck + Firmware-Lane).
- Korrelation bleibt cid-first; Notification-Felder (`fingerprint`, `parent_notification_id`) sind fuer dieses Fenster weiterhin als offene Luecke zu markieren.

## Linear

- Neues Issue angelegt: **AUT-134**
- Titel: `[EA-13.2] Config-Resync gezielt statt Flood: Heartbeat-Count-Mismatch + Contract-Gates härten`
- Parent: `AUT-132`
- Projekt: `MQTT-Transport & Recovery Hardening (INC EA5484)`

**Repo-IST 2026-04-24 (Orchestrator-Verify):** In `El Trabajante` sind `CONFIG_PAYLOAD_MAX_LEN` und `PUBLISH_PAYLOAD_MAX_LEN` gegenüber dem reinen 4096/1024-Muster aus den älteren Beobachtungen angehoben; die in diesem Abschnitt genannten Live-Zahlen (4164, 4370, HB ~1225) bleiben historische Befunde. Für Ausarbeitung/Tests immer die **aktuellen** Header-Werte + `max=` in `intent_outcome`/Logs heranziehen. Vollständiger Incident-Stand: `.claude/reports/current/incidents/INC-2026-04-24-aut134-config-resync-oversize/`.

