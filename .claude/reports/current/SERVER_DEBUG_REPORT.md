# Server Debug Report

**Erstellt:** 2026-04-06 ~06:26 UTC
**Modus:** B (Spezifisch: "Aktor/Actuator-relevante Fehler der letzten 30 Minuten")
**Quellen:** `docker logs automationone-server --since 30m`, `.claude/reports/current/SAFETY-P4-ACTUATOR-OFFLINE-BUG-ANALYSE-2026-04-02.md`

---

## 1. Zusammenfassung

Drei voneinander unabhaengige Aktor-Probleme sind aktiv. Das schwerste ist ein dauerhafter ERROR im `intent_outcome_handler` (fehlendes `intent_id`-Feld im Payload von ESP_EA5484), der alle ~60-90s wiederholt auftritt. Zusaetzlich skipped die Logic Engine Regel `TimmsRegenReloaded` den Aktor GPIO 25 dauerhaft mit `subzone=None`. Keine CRITICAL-Errors, kein Stack-Trace, kein "Befeuchter"-Log gefunden.

---

## 2. Analysierte Quellen

| Quelle | Status | Bemerkung |
|--------|--------|-----------|
| `docker logs automationone-server --since 30m` | OK | ~30 Min Logs ausgewertet |
| `SAFETY-P4-ACTUATOR-OFFLINE-BUG-ANALYSE-2026-04-02.md` | OK | Historische Safety-Analyse einbezogen |

---

## 3. Befunde

### 3.1 ERROR: intent_outcome_handler — fehlendes `intent_id`-Feld (HOCH)

- **Schwere:** Hoch
- **Handler:** `src.mqtt.handlers.intent_outcome_handler`
- **Auftreten:** Wiederholt ca. alle 60-90 Sekunden, erstmals 05:57:13, zuletzt gesehen 06:24:24
- **Evidenz:**
  ```
  2026-04-06 05:57:13 - src.mqtt.handlers.intent_outcome_handler - ERROR - [-] -
    Invalid intent_outcome payload (permanent, not retrying):
    Missing required field: intent_id
    topic=kaiser/god/esp/ESP_EA5484/system/intent_outcome
  ```
- **Kontext:** Tritt immer nach einer erfolgreichen `intent_outcome`-Sequenz auf (accepted -> applied -> dann fehlerhaftes drittes Payload). ESP sendet mindestens ein Folge-Payload auf demselben Topic ohne `intent_id`. Nicht retried (permanent verworfen).
- **Betroffenes Topic:** `kaiser/god/esp/ESP_EA5484/system/intent_outcome`
- **Betroffenes Geraet:** ESP_EA5484

### 3.2 WARNING: Logic Engine — `TimmsRegenReloaded` skipped GPIO 25 permanent (MITTEL)

- **Schwere:** Mittel
- **Handler:** `src.services.logic_engine`
- **Auftreten:** Alle ~30s durchgehend
- **Evidenz:**
  ```
  2026-04-06 05:58:12 - src.services.logic_engine - INFO - [-] -
    Rule TimmsRegenReloaded executed action: actuator -
    Skipped: actuator serves different subzone (None)
  ```
- **Ursache:** Aktor GPIO 25 (id=`2722d536-d51b-48b4-906f-ebd4f6cbc599`, ESP_EA5484) hat `subzone=None` in der DB. Die Regel `TimmsRegenReloaded` hat eine Subzone gesetzt, der Aktor nicht — Subzone-Matching schlaegt fehl.
- **Folge:** Regel `TimmsRegenReloaded` steuert GPIO 25 nie, obwohl sie triggert.

### 3.3 WARNING: WebSocket contract_mismatch bei Aktor-Events (NIEDRIG)

- **Schwere:** Niedrig
- **Handler:** `src.websocket.manager`
- **Auftreten:** 4x bei 05:57:11-12 (cluster um Aktor-Command-Zyklus), einmalig bei 06:14:58
- **Evidenz:** `contract_mismatch detected: message_type=actuator_command envelope_correlation_id != data_correlation_id`
- **Ursache:** Correlation-ID in WS-Envelope und Data-Payload stimmen nicht ueberein. Tritt bei `actuator_command`, `actuator_response` und `config_published` auf.

### 3.4 Hintergrundlaerm: ESP_00000001 not found (NIEDRIG)

- **Schwere:** Niedrig, kein Aktor-Bug
- **Auftreten:** Dauerhaft ~4x/30s
- **Evidenz:** `API error: ESP_NOT_FOUND - ESP32 device ESP_00000001 not found`
- **Ursache:** Frontend-Polling auf nicht-existentem Mock-Geraet. Kein Bezug zu Aktor-Logik.

---

## 4. Extended Checks (eigenstaendig durchgefuehrt)

| Check | Ergebnis |
|-------|----------|
| CRITICAL-Level Eintraege | Keine vorhanden |
| Stack-Traces | Keine vorhanden |
| Suche "Befeuchter" / "humidifier" | Kein einziger Eintrag im 30-Min-Fenster |
| Aktor GPIO 25 aktueller State | `state=on, value=255.0` (zuletzt 06:26:05) — laeuft |
| Aktor GPIO 14 aktueller State | Dauerhaft `state=on, value=255.0`, no-op via Logic Engine |
| LWT-Disconnect-Event | 06:04:06 — `Reset 2 actuator state(s) to idle for ESP_EA5484`, danach wieder online |
| Safety-P4 Report (2026-04-02) | 3 offene CRITICAL-Luecken: Zeit-Regel nicht serialisiert, Aktor bei NVS-Fehler nicht in ActuatorManager, default_state wird nie angewendet |

---

## 5. Bewertung & Empfehlung

**Root Cause Befund 3.1:** ESP_EA5484 sendet nach dem normalen intent-Flow ein zusaetzliches Payload auf `kaiser/god/esp/ESP_EA5484/system/intent_outcome` ohne `intent_id`. Zu pruefen: ESP-Firmware — sendet die Firmware bei Config-Bestaetigungen oder Heartbeats ein Payload ohne `intent_id` auf dasselbe Topic?

**Root Cause Befund 3.2:** Aktor GPIO 25 hat `subzone=None` in der DB. Fix: Subzone fuer diesen Aktor setzen (Frontend HardwareView oder direkt per API), damit `TimmsRegenReloaded` matcht.

**Befeuchter:** Kein Log-Eintrag vorhanden. Entweder kein Geraet mit diesem Namen konfiguriert, oder es produziert im aktuellen Zeitfenster keine Events.

**Naechste Schritte:**
1. ESP-Firmware `intent_outcome`-Publishing pruefen: Welches dritte Event sendet keinen `intent_id`?
2. Subzone fuer Aktor `2722d536-d51b-48b4-906f-ebd4f6cbc599` (GPIO 25, ESP_EA5484) setzen.
3. Safety-P4 Fixes (Report 2026-04-02) sind noch offen — drei CRITICAL-Luecken unbehandelt.
