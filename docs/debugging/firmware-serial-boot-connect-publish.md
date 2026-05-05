# Firmware: Beispielsequenz Boot → MQTT-Connect → Publish (Serial / Logs)

**Zweck:** Orientierung für **Korrelation** und **Reihenfolge** auf dem ESP32: welche Felder (`seq`, `boot_sequence_id`, `correlation_id`) wo gesetzt werden — **ohne** echte Secrets, WLAN-Passwörter oder Tokens.

**Verwandt:** `docs/debugging/correlation-id-playbook.md`, `docs/debugging/firmware-alert-path-hw-checklist.md`, Analyse `docs/analysen/IST-observability-correlation-contracts-2026-04-09.md` (§ I / Firmware-Serial).

---

## 1. Kurzablauf (logische Phasen)

| Phase | Was passiert | Typische Artefakte |
|--------|----------------|---------------------|
| **Boot** | Reset-Grund liegt vor; nach erstem Heartbeat-Aufruf wird eine **Boot-Telemetry-ID** gebildet. | `boot_sequence_id`, `reset_reason`, `segment_start_ts` (wenn Zeit gültig) |
| **Netz** | WiFi verbindet (kein Secret in Logs nötig). | RSSI, lokale IP nur zur Plausibilisierung |
| **MQTT connect** | Client verbindet zum Broker; danach Heartbeats und ggf. Registrierung. | Broker-Logs / Firmware-`LOG_*` mit Tag `MQTT` |
| **Publish** | Zuerst typischerweise **System-Heartbeat** (enthält `seq` und `boot_sequence_id`). Weitere Payloads erhöhen `seq` weiter. | JSON auf `TopicBuilder::buildSystemHeartbeatTopic()` |

Keine der unten stehenden **Beispielwerte** ist ein realer Geräte- oder Live-Stand — Platzhalter nur zur Gegenprobe mit Wokwi/Hardware.

---

## 2. Code-Fundstellen (repo-relativ)

### `seq` und `boot_sequence_id` (Heartbeat)

- **`El Trabajante/src/services/communication/mqtt_client.cpp`**
  - **`g_boot_sequence_id`:** wird bei erstem Heartbeat-Telemetrie-Init gesetzt: `esp_id + "-b" + boot_count + "-r" + reset_reason` (siehe `ensureBootTelemetryInitialized`).
  - **`getNextSeq()` / `publish_seq_`:** monoton steigende Publish-Sequenz pro Lauf; Heartbeat nutzt `getNextSeq()` im JSON.
  - Heartbeat-Payload baut u. a. `"seq":…`, `"boot_sequence_id":"…"` (Assembly in `publishHeartbeat`).

### `correlation_id` / Intent-Metadaten

- **`El Trabajante/src/tasks/intent_contract.h`** — `IntentMetadata` mit `correlation_id` und `intent_id` (max. 64 Zeichen).
- **`El Trabajante/src/tasks/intent_contract.cpp`**
  - `extractIntentMetadataFromPayload` liest **top-level** oder `data.*` (`correlation_id`, `intent_id`, …).
  - `publishIntentOutcome` schreibt u. a. `correlation_id` in Outcome-JSON; NVS-Outbox für kritische Pfade.

Weitere Spiegelung von `correlation_id` in ACKs/Responses: u. a. `El Trabajante/src/main.cpp` (`ensureCorrelationId`, Subzone-/Zone-ACKs mit `seq`).

---

## 3. Beispielzeilen (illustrativ)

### 3.1 Heartbeat-JSON (Auszug)

Nach Connect und Aufruf von `publishHeartbeat` kann ein Payload **in dieser Struktur** erscheinen (gekürzt, fiktive IDs):

```json
{
  "esp_id": "esp-demo-01",
  "seq": 3,
  "zone_id": "zone-demo",
  "master_zone_id": "master-demo",
  "zone_assigned": true,
  "ts": 1712732400,
  "time_valid": true,
  "boot_sequence_id": "esp-demo-01-b7-r1",
  "reset_reason": "POWERON",
  "segment_start_ts": 1712732380,
  "uptime": 42
}
```

- **`seq`:** laufende Nummer für **viele** MQTT-Publishes (nicht nur Heartbeat).
- **`boot_sequence_id`:** stabil für den Boot-Segment-Kontext; Format siehe Code (`-b{boot_count}-r{reset_reason}`).

### 3.2 Intent-Outcome (Auszug, Korrelation)

Für Befehls-/Config-Ketten erscheinen `intent_id` und `correlation_id` in Payloads; Server und Logs können damit matchen:

```json
{
  "intent_id": "cfg-intent-example",
  "correlation_id": "550e8400-e29b-41d4-a716-446655440000",
  "outcome": "applied"
}
```

(Exakte Felder je nach Flow/Topic — verifizieren über `intent_contract.cpp` und den jeweiligen Handler.)

### 3.3 Serial-Konsole (UART)

Bootloader- und App-Logs sind **baustufenabhängig**; typisch erscheinen Zeilen mit Tags wie `MQTT`, `MEM`, `WIFI`. Zum Abgleich mit dem obigen JSON genügt oft: **ein** Heartbeat mit erkennbarem `boot_sequence_id` und aufsteigendem `seq` über mehrere Sekunden.

---

## 4. Gegenprobe (Hardware / Wokwi)

1. Flashen mit bekanntem `esp_id` (NVS/Config), Broker erreichbar.
2. Serial monitor an — nach MQTT-Connect Heartbeat-Zeilen oder Broker-Subscribe auf `…/system/heartbeat` (projektspezifisches Topic über `TopicBuilder`).
3. **Korrelation:** dieselbe `correlation_id` vom Server-Befehl in Firmware-ACK/`intent_outcome`-Pfaden suchen (siehe IST-Tabelle Server ↔ Firmware).

**Nicht-Ziele:** Keine „Production live“-Behauptung ohne eigenen Capture; keine echten Zugangsdaten in Tickets/Reports.

---

## 5. CI / Checks

Für diese **Doku-Datei** ist kein zusätzlicher CI-Schritt vorgesehen. Firmware-Änderungen am Code: `pio run -e esp32_dev` bzw. Ziel-Board-Env wie in `docs/debugging/firmware-alert-path-hw-checklist.md` beschrieben.
