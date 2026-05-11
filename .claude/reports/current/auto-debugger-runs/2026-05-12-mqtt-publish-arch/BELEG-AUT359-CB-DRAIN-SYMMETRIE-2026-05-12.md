# BELEG: AUT-359 — `processPublishQueue()` respektiert MQTT Circuit Breaker (Drain-Admission-/Feedback-Symmetrie)

**Issue:** [AUT-359](https://linear.app/autoone/issue/AUT-359) (Sub von [AUT-346](https://linear.app/autoone/issue/AUT-346); Analyse-Parent [AUT-353](https://linear.app/autoone/issue/AUT-353))
**Datum:** 2026-05-12
**Schicht:** Firmware (El Trabajante)
**Build-Pfad:** ESP-IDF (`#ifndef MQTT_USE_PUBSUBCLIENT`) — PubSubClient-Pfad nicht betroffen, hat keinen Drain
**Run-Ordner:** `.claude/reports/current/auto-debugger-runs/2026-05-12-mqtt-publish-arch/`

---

## 1. Problem (Repo-IST vor Patch)

`MQTTClient::processPublishQueue()` rief `esp_mqtt_client_publish()` direkt auf — ohne `circuit_breaker_.allowRequest()`. Asymmetrie zu `MQTTClient::publish()` (Z. 610), wodurch unter CB OPEN:

- Bereits eingereihte Queue-Nachrichten transportierten weiter über die ESP-IDF-Outbox/TCP — Pfad zu OUTBOX-Pressure (AUT-326-Crash) und TCP-`errno=11`/Write-Timeout (AUT-356/S3 §1).
- Neue `publish()`-Aufrufe (Heartbeat, Core-0-Direkt) blockierten am CB sofort. Heartbeat-Loss unter OPEN dokumentiert: AUT-346 / S3 §3.

**Zusatzbefund (im Issue nicht erwähnt, im Patch mit erledigt):** Drain rief weder `recordSuccess()` noch `recordFailure()`. Erfolgreiche Drain-Publishes feedbackten den CB nicht Richtung CLOSED, Drain-Fehler akkumulierten nicht Richtung OPEN. Das ergibt eine zweite, **Feedback-Asymmetrie** zwischen Direktpfad und Drain-Pfad.

**Beleg-Vorlauf:** `.claude/reports/current/auto-debugger-runs/2026-05-12-mqtt-publish-arch/S3-recovery-pfad-2026-05-12.md` §5; `KONSOLIDIERT-AUT353-Zwei-Pfad-Inkonsistenz-TM-2026-05-12.md` §6.3 F1.

---

## 2. Entscheidung (Policy)

**Option A** aus AUT-359: Drain respektiert CB via `allowRequest()`. Begründung:

| Aspekt | Wirkung |
|--------|---------|
| Konsistenz zur Admission | Drain folgt derselben Regel wie `publish()` (Z. 610) und Heartbeat |
| Schutz IDF-Outbox | Bei OPEN keine Transportversuche → AUT-326-Pfad nicht zusätzlich belastet |
| Schutz TCP-Layer | Kein neuer `errno=11`-Druck bei persistentem Broker-Ausfall |
| Recovery | `allowRequest()` liefert in HALF_OPEN automatisch `true` (max. 10 s Test-Fenster) — Drain-Probe passiert ohne Sondercode |
| Queue-Verhalten | Wachstum bei OPEN gewollt; Shedding ab WATERMARK 6, `intent_outcome`-NVS-Replay, `queue_pressure`-Hysterese greifen wie heute |
| `intent_outcome`-Replay | `processIntentOutcomeOutbox()` läuft **vor** dem Admission-Check — kritischer Replay-Pfad bleibt unter OPEN aktiv |

---

## 3. Patch (vollständig)

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp` — `MQTTClient::processPublishQueue()`

### 3.1 Admission-Check (vor der Drain-Schleife)

```cpp
if (!circuit_breaker_.allowRequest()) {
    static unsigned long last_cb_drain_log_ms = 0;
    unsigned long now = millis();
    if (now - last_cb_drain_log_ms > 5000) {
        last_cb_drain_log_ms = now;
        LOG_D(TAG, "[OUTBOX-TRACE] Drain skipped: MQTT Circuit Breaker OPEN");
    }
    return;
}
```

- Logging throttled auf 1× / 5 s, gleiche Konvention wie bestehende `[OUTBOX-TRACE]`-Zeilen.
- `processIntentOutcomeOutbox()` läuft bewusst vor diesem Block (Z. 1217).

### 3.2 Feedback-Symmetrie nach `esp_mqtt_client_publish()`

| Return | Direktpfad `publish()` | Drain (vor Patch) | Drain (nach Patch) |
|--------|------------------------|-------------------|--------------------|
| `msg_id >= 0` | `recordSuccess()` (Z. 708) | — | `recordSuccess()` |
| `msg_id == -2` (OUTBOX full) | `recordFailure()` (Z. 733) | — | `recordFailure()` |
| `msg_id == -1` + connected | `recordFailure()` (Z. 768f) | — | `recordFailure()` |
| `msg_id == -1` + nicht verbunden | kein Feedback (Z. 773-775, „pre-connection“) | — | kein Feedback |

Diese Klassifizierung spiegelt 1:1 den Direktpfad — keine neue CB-Semantik, nur Symmetrie.

### 3.3 Nicht geändert
- Drain-Budget bleibt `PUBLISH_DRAIN_BUDGET_PER_TICK = 1` (AUT-54/AUT-360).
- Backoff-/Retry-/Shedding-Logik (AUT-55 / `under_pressure`) unverändert.
- `intent_outcome`-Failed-Publish-Pfad bei `req.critical` unverändert.
- `g_publish_outbox_full_count` / `g_publish_outbox_noncritical_drops` unverändert.
- PubSubClient-Pfad (`MQTT_USE_PUBSUBCLIENT=1`) nicht berührt — dort existiert kein Drain.

---

## 4. Spiegelstellen / Querverweise

| Bereich | Pfad | Status |
|---------|------|--------|
| Direktpfad-Vorlage (Admission) | `mqtt_client.cpp` Z. 610 | Vorhanden, Vorlage |
| Direktpfad-Vorlage (Feedback) | `mqtt_client.cpp` Z. 708 / 733 / 768f | Vorhanden, Vorlage |
| Drain-Aufrufer | `tasks/communication_task.cpp` Z. 70, 356, 369 | Unverändert; CB-Skip = stiller No-Op |
| `queue_pressure`-Emitter | `tasks/communication_task.cpp` `handleQueuePressureHysteresis` | Unverändert; läuft direkt, eigener `mqttClient.publish()`-Pfad mit eigenem CB-Check |
| Heartbeat | `mqtt_client.cpp` `publishHeartbeat()` → `publish()` | Unverändert; war/bleibt CB-blockiert (siehe AUT-346) |
| `safePublish` | `mqtt_client.cpp` Z. 807 | Unverändert; Sonderlogik für critical Topics bei OPEN bleibt |
| Server-Telemetrie | `god_kaiser_server/.../queue_pressure_handler.py` | Unverändert; Observability-only (S4) |
| MQTT-Topics-SSOT | `.claude/reference/api/MQTT_TOPICS.md` | Keine Topic-Änderung — keine Doku-Pflege nötig |

---

## 5. Verifikation

| Schritt | Befehl | Ergebnis |
|---------|--------|----------|
| Build ESP-IDF (betroffener Pfad) | `pio run -e esp32_dev` | SUCCESS, 00:00:11.641, Flash 96.6 %, RAM 38.0 % |
| Smoke-Build PubSubClient-Pfad | `pio run -e seeed_xiao_esp32c3` | siehe Lauf-Log unten |
| Native-Tests | nicht betroffen | `processPublishQueue` ist ESP-IDF-only, kein Test in `test/test_*` |
| Linter | `ReadLints mqtt_client.cpp` | keine Errors |

**Hinweis Build:** Flash bleibt unter dem 1572864-B-Limit; Patch fügt ~30 Codezeilen + 2 statische Logging-Variablen hinzu (vernachlässigbar).

---

## 6. Erwartetes Laufzeitverhalten

| Szenario | Vor Patch | Nach Patch |
|----------|-----------|------------|
| CB CLOSED | Drain läuft, kein CB-Feedback | Drain läuft, CB-Feedback (Success/Failure) konsistent |
| CB OPEN, Drain-Tick mit Items in Queue | `esp_mqtt_client_publish()` wird aufgerufen → kann Outbox/TCP belasten | Drain skippt (Log 1×/5 s `Drain skipped: MQTT Circuit Breaker OPEN`) |
| CB OPEN → 30 s vorbei → HALF_OPEN | Drain unverändert aktiv | `allowRequest()` liefert `true`, Drain probiert (max. 1/Tick) — Erfolg/Fehler treibt CB Richtung CLOSED bzw. OPEN |
| `msg_id == -2` (OUTBOX full) im Drain | Counter +1, kein CB-Feedback | Counter +1, **zusätzlich** `recordFailure()` |
| `msg_id == -1` im Drain, nicht verbunden | Drop ohne CB-Feedback | Drop ohne CB-Feedback (Pre-Connection-Schutz) |

---

## 7. Was bewusst NICHT geändert wurde

- **Heartbeat (AUT-346):** weiterhin durch `publish()` → CB-blockiert. Eine eigene CB-Ausnahme für Heartbeat ist eine separate Policy-Frage und gehört in AUT-346, nicht in AUT-359.
- **Server-seitige Reaktion:** keine Aktion. `queue_pressure_handler.py` bleibt Observability-only (Konsolidierung §6.1 D4).
- **Zusätzliche Telemetrie-Felder** (`cb_drain_blocks`, …): kein neuer Heartbeat/MQTT-Vertrag — `mqtt_circuit_breaker_open` im Heartbeat (Z. 1543) macht die Sicht bereits transparent.

---

## 8. Abgrenzung

- Nicht AUT-326 (Outbox-Crash) — orthogonale Transport-Ebene
- Nicht AUT-344 (Aktor-Burst) — Queue-Größe / Shedding
- Nicht AUT-360 (Drain-Budget Dead-Code) — bereits separat erledigt
- AUT-346 (CB-OPEN blockiert Heartbeat) — Drain-Aspekt **dieses** Issue; Heartbeat-Aspekt bleibt offen in AUT-346

---

*Patch lokal in einem Funktionsblock; volle Symmetrie zum bestehenden Direktpfad. Keine Architektur-Änderung, keine Vertrags-Änderung.*
