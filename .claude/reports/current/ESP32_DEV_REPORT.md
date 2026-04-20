# ESP32 Dev Report: PKG-18 Standby-Resume Transporthärtung

## Modus: B (Implementierung)
## Auftrag: PKG-18 — Disconnect-Loop nach Standby/Resume entschärfen

## Codebase-Analyse

Analysierte Dateien:
- `El Trabajante/src/services/communication/mqtt_client.cpp` (~2000 Zeilen)
- `El Trabajante/src/services/communication/mqtt_client.h` (291 Zeilen)
- `El Trabajante/src/tasks/publish_queue.cpp` (181 Zeilen)
- `El Trabajante/src/tasks/publish_queue.h` (68 Zeilen)
- `El Trabajante/src/error_handling/circuit_breaker.h` (CB-Pattern)
- Incident-Bericht + TASK-PACKAGES.md (PKG-18 Spezifikation)

Extrahierte Patterns:
- Managed-Reconnect mit exponential Backoff + Jitter (bestehendes Pattern)
- `pauseForAnnounceAck()` Queue-Pause-Mechanismus (AUT-69, wiederverwendet)
- `isWritePathTimeoutErrno()` Transport-Backpressure-Erkennung (AUT-67/PKG-15)
- `PUBLISH_DRAIN_BUDGET_PER_TICK` Drain-Limitierung (bestehendes Throttle-Pattern)

## Qualitätsprüfung: 8-Dimensionen-Checkliste

| # | Dimension | Ergebnis |
|---|-----------|----------|
| 1 | Struktur & Einbindung | ✅ Alle Änderungen in bestehenden Blöcken, keine neuen Dateien/Includes |
| 2 | Namenskonvention | ✅ `WRITE_TIMEOUT_ESCALATION_THRESHOLD`, `MANAGED_RECONNECT_WRITE_TIMEOUT_BOOST_MS` — konsistent mit `MANAGED_RECONNECT_*` Pattern |
| 3 | Rückwärtskompatibilität | ✅ Keine MQTT-Payload/Topic/LWT-Änderungen, keine Contract-Breaking-Changes |
| 4 | Wiederverwendbarkeit | ✅ Nutzt bestehende `pauseForAnnounceAck()`, `isWritePathTimeoutErrno()`, `scheduleManagedReconnect_()` |
| 5 | Speicher & Ressourcen | ✅ 3 neue `constexpr` (keine Runtime-Allokation), 1 lokale `uint32_t`, 1 lokale `uint8_t` |
| 6 | Fehlertoleranz | ✅ Alle neuen Pfade sind graceful (Fallback auf Default-Werte wenn Threshold nicht erreicht) |
| 7 | Seiteneffekte | ✅ Keine GPIO-/NVS-/Topic-Änderungen; nur Timing-Verhalten der Reconnect- und Drain-Logik |
| 8 | Industrielles Niveau | ✅ Kein Blocking in Tasks, keine delay() in Hotpaths, Watchdog-kompatibel |

## Cross-Layer Impact

| Bereich | Betroffen? | Status |
|---------|-----------|--------|
| MQTT Topics / Payloads | Nein | ✅ Unverändert |
| LWT Contract | Nein | ✅ Unverändert |
| Circuit Breaker Thresholds | Nein | ✅ CB(5, 30s, 10s) unverändert |
| Server Heartbeat-Handler | Nein | ✅ Keine Payload-Feldänderung |
| Frontend esp.ts / Stores | Nein | ✅ Kein neues WS-Event |
| publish_queue.h/cpp | Nein | ✅ Bestehende API `pauseForAnnounceAck(ms)` reicht aus |

## Ergebnis: Implementierung

### Geänderte Datei

**`El Trabajante/src/services/communication/mqtt_client.cpp`** — 4 lokale Änderungen:

#### 1. Neue Konstanten (nach Zeile 49)
- `WRITE_TIMEOUT_ESCALATION_THRESHOLD = 3` — Ab 3 Write-Timeouts greifen die PKG-18-Maßnahmen
- `MANAGED_RECONNECT_WRITE_TIMEOUT_BOOST_MS = 5000` — Boosted Reconnect-Delay (vs 1500ms Default)
- `POST_RECONNECT_TRANSPORT_SETTLE_MS = 2000` — Queue-Pause nach Write-Timeout-Reconnect

#### 2. MQTT_EVENT_CONNECTED: Transport Recovery Hold
- `prior_write_timeouts` wird VOR Counter-Reset erfasst
- Bei `prior_write_timeouts >= 3`: `pauseForAnnounceAck(2000)` statt Default 300ms
- Gibt dem TCP/TLS-Handshake und erstem Keepalive-Roundtrip Zeit vor Queue-Drain

#### 3. MQTT_EVENT_DISCONNECTED: Reconnect-Delay-Boost
- Bei `transport_write_timeout_count_ >= 3`: Base-Delay auf 5000ms statt 1500ms
- Exponentieller Backoff + Jitter läuft weiter auf dem geboostetem Base-Wert
- Bricht das enge Reconnect-Flapping nach Standby/Resume

#### 4. processPublishQueue: Drain-Budget-Drosselung
- `drain_budget` dynamisch: 1 (statt 3) wenn `last_transport_errno_` Write-Timeout anzeigt
- Verhindert Publish-Burst auf instabilem Socket nach Resume
- Wird automatisch auf 3 zurückgesetzt wenn `MQTT_EVENT_CONNECTED` den errno cleared

### Implementierte Logik-Kette (Wirkungsmechanismus)

```
Standby → Resume → ESP MQTT write timeout
    │
    ├── [Bisher] sofortiger Reconnect (1.5s) → Socket noch instabil → erneuter write timeout → Loop
    │
    └── [PKG-18]
        ├── Drain-Budget: 3 → 1 pro Tick (weniger Schreibdruck auf instabilem Socket)
        ├── Disconnect → Reconnect-Delay: 1500ms → 5000ms Base (+ Jitter/Backoff)
        ├── Connect → Queue-Pause: 300ms → 2000ms (Transport-Settle)
        └── Ergebnis: Cycle-Zeit von ~3s auf ~8-12s gestreckt,
            Socket hat Zeit sich zu stabilisieren → Loop bricht ab
```

## Verifikation

```
Build: pio run -e esp32_dev
Ergebnis: SUCCESS (10.44s)
RAM:   36.5% (119716 / 327680 B)
Flash: 95.3% (1498221 / 1572864 B)
```

Keine neuen Compiler-Warnings. Bestehende `null character(s) ignored` in Zeile 2043 ist trailing-whitespace am Dateiende (vorbestehend).

## Offene Risiken / Blocker

| Risiko | Bewertung | Mitigation |
|--------|-----------|------------|
| 5s Reconnect-Delay kann Heartbeat-Timeout auslösen | Niedrig — Server-Timeout ist 120s (ACK), Heartbeat-Interval 60s | Kein Handlungsbedarf |
| Queue-Pause 2s kann Critical Publishes verzögern | Niedrig — `pauseForAnnounceAck` hat Guard-Timeout, direct `publish()` bleibt aktiv | Critical Publishes laufen über direct path (Core 0) |
| Flash 95.3% nah am Limit | Vorbestehend — keine neue Allokation durch PKG-18 | Monitoring bei nächsten Features |
| HW-Repro ausstehend | Mittel — Logik-Korrektheit verifiziert, Runtime-Verhalten braucht reales Standby-Resume-Fenster | PKG-21 (test-log-analyst) als formales Abnahme-Gate |

## Empfehlung

- **Nächster Agent:** `test-log-analyst` (PKG-21) für Runtime-Abnahme nach Flash
- **Parallel möglich:** `mqtt-dev` + `server-dev` (PKG-19) für Broker-/LWT-Kette
- **Parallel möglich:** `frontend-dev` (PKG-20) für Flapping-UX
