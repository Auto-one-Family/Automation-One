# Server Dev Report: AUT-121 Heartbeat-Metrics Analyse

## Modus: A (Analyse)
## Auftrag: Analyse der AUT-121-Umsetzung aus Server-Sicht

## Codebase-Analyse

### Analysierte Dateien
| Datei | Zeilen | Rolle |
|-------|--------|-------|
| `src/mqtt/handlers/heartbeat_metrics_handler.py` | 109 | TTLCache-basierter Ingest-Handler |
| `src/mqtt/handlers/heartbeat_handler.py` | ~2400 | Haupt-Heartbeat-Handler mit Metrics-Merge |
| `src/mqtt/subscriber.py` | 626 | MQTT Subscriber mit QoS-Routing |
| `src/main.py` | 1272 | Handler-Registrierung im Lifespan |
| `src/services/event_contract_serializers.py` | 248 | WS/REST Event-Serialisierung |
| `src/db/repositories/esp_heartbeat_repo.py` | 371 | Heartbeat-DB-Persistenz |
| `src/mqtt/topics.py` | ~1200 | Topic Build/Parse |
| `src/core/constants.py` | - | Topic-Konstanten |
| `tests/mqtt/test_heartbeat_metrics_handler.py` | 82 | Unit-Tests Metrics-Handler |
| `tests/mqtt/test_heartbeat_handler.py` | ~220 | Unit-Tests inkl. AUT-121 Merge |
| `tests/unit/test_topic_validation.py` | - | Topic Build/Parse Tests |

### Architektur-Überblick AUT-121

```
ESP32 ──► heartbeat_metrics ──► HeartbeatMetricsHandler (TTLCache)
                                         │
ESP32 ──► heartbeat ──► HeartbeatHandler ─┤
                            │             │ get_latest(esp_id)
                            │             ▼
                            │    _merge_metrics_into_payload()
                            │             │
                            ▼             ▼
                    Validation ──► Merge ──► DB Persist ──► WS Broadcast
```

**Design-Entscheidung:** Metrics werden in einem separaten TTLCache (120s, max 10k Einträge) gepuffert und beim nächsten Heartbeat idempotent gemergt. Kein eigener DB-Write, kein eigener WS-Broadcast. Heartbeat ist autoritativ bei Feldkollisionen.

---

## Findings (priorisiert)

### P1-01: QoS-Routing trifft heartbeat_metrics mit QoS 0 durch Substring-Match

**Datei:** `src/mqtt/subscriber.py` Zeile 131
**Problem:** `if "heartbeat" in pattern:` matcht sowohl `heartbeat` als auch `heartbeat_metrics` per Substring. Beide erhalten QoS 0 (fire-and-forget). Für den regulären Heartbeat ist QoS 0 dokumentiert und gewollt. Für `heartbeat_metrics` ist dies **nicht explizit entschieden** — die QoS-Zuweisung ist ein Seiteneffekt des Substring-Matchings.

**Risiko:** Bei QoS 0 geht eine verlorene Metrics-Nachricht still verloren. Da die TTLCache-TTL nur 120s beträgt, fehlen dem nächsten Heartbeat die Metriken. Bei hohem Paketverlust (z.B. WLAN-Störung) degradiert die Observability systematisch ohne Warnung.

**Fix-Vorschlag:**
```python
# subscriber.py, subscribe_all()
if pattern.endswith("/system/heartbeat"):
    qos = 0
elif "heartbeat_metrics" in pattern:
    qos = 0  # EXPLIZIT: fire-and-forget, Cache-basiert
```
**Warum:** Explizite QoS-Zuweisung statt implizites Substring-Matching verhindert unbeabsichtigte QoS-Zuweisungen bei zukünftigen Topics mit "heartbeat" im Namen.

---

### P1-02: Metrics-Merge ohne Feld-Whitelist — unkontrollierte Key-Injection

**Datei:** `src/mqtt/handlers/heartbeat_handler.py` Zeile 250-254
```python
for key, value in metrics_payload.items():
    if key == "ts":
        continue
    if key not in payload:
        payload[key] = value
```

**Problem:** Alle Schlüssel aus dem Metrics-Payload (außer `ts`) werden blind in den Heartbeat-Payload gemergt, sofern sie dort noch nicht existieren. Die `heartbeat_metrics_handler.py` führt **keine Payload-Validierung** durch (Zeile 73: nur `isinstance(payload, dict)` Check). Ein ESP mit fehlerhafter Firmware oder ein manipuliertes MQTT-Paket kann beliebige Schlüssel injizieren.

**Impact-Kette:**
1. Injizierte Keys landen im Heartbeat-Payload
2. `extract_heartbeat_runtime_telemetry()` filtert auf `_RUNTIME_TELEMETRY_KEYS` → **DB ist geschützt**
3. Aber: Der Heartbeat-Handler liest nach dem Merge weitere Felder wie `system_state`, `boot_sequence_id`, `segment_start_ts` → potentielles Überschreiben von nicht-vorhandenen Heartbeat-Feldern möglich
4. WS-Broadcast über `serialize_esp_health_event(runtime_telemetry=...)` → gefiltert durch `_RUNTIME_TELEMETRY_KEYS`

**Reales Risiko:** Niedrig-Mittel. Heartbeat-Felder sind autoritativ, und DB/WS sind durch den `_RUNTIME_TELEMETRY_KEYS`-Filter geschützt. Aber die Merge-Phase selbst ist unbeschränkt.

**Fix-Vorschlag:** Whitelist für erlaubte Metrics-Keys im Merge:
```python
_ALLOWED_METRICS_KEYS = frozenset({
    "heap_min_free", "heap_fragmentation", "loop_time_avg_us",
    "loop_time_max_us", "stack_high_water", "task_count",
    "isr_time_us", "nvs_free_entries",
})

for key, value in metrics_payload.items():
    if key == "ts":
        continue
    if key in _ALLOWED_METRICS_KEYS and key not in payload:
        payload[key] = value
```
**Warum:** Defense-in-depth. Explizite Whitelist verhindert unerwartete Feldinjektionen und dokumentiert den Vertrag zwischen Metrics- und Heartbeat-Daten.

---

### P2-01: Singleton ohne Reset-Funktion — Test-Isolation und Lifecycle-Problem

**Datei:** `src/mqtt/handlers/heartbeat_metrics_handler.py` Zeile 94-102

**Problem:** Der Module-Level Singleton `_handler_instance` hat keine Reset-Funktion. Konsequenzen:
- **Integration-Tests:** Wenn `handle_heartbeat_metrics()` (Modul-Funktion) in mehreren Tests aufgerufen wird, teilen sie sich den Cache-Zustand.
- **Server-Lifecycle:** Bei einem Hot-Reload (Uvicorn dev mode) bleibt der Cache-Zustand bestehen.
- **Kein Cache-Flush:** Wenn ein ESP neu startet und alte Metrics im Cache liegen, werden veraltete Daten gemergt.

Die Unit-Tests umgehen das korrekt (`HeartbeatMetricsHandler()` direkt), aber die Architektur ist fragil.

**Fix-Vorschlag:**
```python
def reset_heartbeat_metrics_handler() -> None:
    """Reset singleton (für Tests und Server-Lifecycle)."""
    global _handler_instance
    _handler_instance = None
```
Zusätzlich in `main.py` Shutdown-Phase aufrufen.

**Warum:** Ermöglicht saubere Test-Isolation und deterministisches Verhalten bei Server-Neustart.

---

### P2-02: HeartbeatMetricsHandler hat keine Payload-Validierung

**Datei:** `src/mqtt/handlers/heartbeat_metrics_handler.py` Zeile 73

```python
safe_payload = payload if isinstance(payload, dict) else {}
```

**Problem:** Einzige Validierung ist `isinstance(dict)`. Es gibt keinen Check auf:
- Pflichtfelder (z.B. `ts`)
- Feldtypen (z.B. `heap_min_free` muss numerisch sein)
- Maximale Payload-Größe (unbegrenzt im Cache speicherbar)

Im Gegensatz dazu hat der reguläre `heartbeat_handler.py` eine dedizierte `_validate_payload()` Methode mit Field-Checks.

**Risiko:** Ein überdimensionierter Payload (z.B. 100 KB JSON) pro ESP × 10.000 ESPs könnte den TTLCache auf ~1 GB aufblähen, bevor die TTL greift.

**Fix-Vorschlag:** Minimale Validierung + Größenbegrenzung:
```python
MAX_METRICS_PAYLOAD_KEYS = 50

safe_payload = payload if isinstance(payload, dict) else {}
if len(safe_payload) > MAX_METRICS_PAYLOAD_KEYS:
    logger.warning("Oversized metrics payload from %s: %d keys", esp_id, len(safe_payload))
    safe_payload = dict(list(safe_payload.items())[:MAX_METRICS_PAYLOAD_KEYS])
```
**Warum:** Verhindert Memory-Exhaustion durch fehlerhafte oder manipulierte Payloads.

---

### P2-03: `serialize_esp_health_event` — runtime_telemetry überschreibt Basis-Felder

**Datei:** `src/services/event_contract_serializers.py` Zeile 244-246

```python
if runtime_telemetry:
    for key, value in runtime_telemetry.items():
        payload[key] = value
```

**Problem:** Kein Kollisions-Guard. Wenn `runtime_telemetry` einen Key wie `esp_id`, `status` oder `timestamp` enthält, wird der Basis-Wert überschrieben. AUT-121 erweitert `_RUNTIME_TELEMETRY_KEYS` um `metrics_delta_ts` und `metrics_freshness_seconds` — diese kollidieren aktuell nicht, aber das Pattern ist fragil.

**Fix-Vorschlag:**
```python
_BASE_FIELDS = frozenset(payload.keys())
if runtime_telemetry:
    for key, value in runtime_telemetry.items():
        if key not in _BASE_FIELDS:
            payload[key] = value
```
**Warum:** Gleiche "Heartbeat ist autoritativ"-Logik wie im Merge — verhindert stille Überschreibung struktureller WS-Event-Felder.

---

### P2-04: Fehlender Error-Code für Topic-Parse-Fehler im Metrics-Handler

**Datei:** `src/mqtt/handlers/heartbeat_metrics_handler.py` Zeile 66-70

```python
logger.error(
    "[%s] Failed to parse heartbeat_metrics topic: %s",
    ValidationErrorCode.MISSING_REQUIRED_FIELD,
    topic,
)
```

**Problem:** `MISSING_REQUIRED_FIELD` ist semantisch falsch — es fehlt kein Pflichtfeld, sondern das Topic-Format ist ungültig. Das erschwert Log-Analyse und Alerting-Filter.

**Fix-Vorschlag:** Passenden Error-Code verwenden (z.B. `ValidationErrorCode.INVALID_TOPIC_FORMAT` falls vorhanden, sonst einen spezifischeren Log-Prefix).

---

### P3-01: Keine Prometheus-Metriken für den Metrics-Handler selbst

**Datei:** `src/mqtt/handlers/heartbeat_metrics_handler.py`

**Problem:** Der Handler hat keine eigenen Prometheus-Counter/Gauges:
- Empfangene Metrics-Nachrichten
- Cache-Hits bei `get_latest()` (gefunden vs. None)
- Aktuelle Cache-Größe

Im Gegensatz dazu hat der reguläre Heartbeat-Handler umfangreiche Metriken (`increment_heartbeat_ack_valid`, `observe_heartbeat_ack_latency_ms`, etc.).

**Fix-Vorschlag:** Mindestens einen Counter `heartbeat_metrics_received_total` und ein Gauge `heartbeat_metrics_cache_size` in `src/core/metrics.py` anlegen.

**Warum:** Ohne eigene Metriken ist die AUT-121-Feature-Gesundheit nicht über Grafana beobachtbar. Ein stummer Ausfall des Metrics-Channels wäre erst bei Fehlen der Merge-Felder im Dashboard auffällig.

---

### P3-02: Kein TTL-Expiry-Test

**Datei:** `tests/mqtt/test_heartbeat_metrics_handler.py`

**Problem:** Die Testsuite prüft:
- ✅ Happy Path (buffering)
- ✅ Invalid Topic
- ✅ Malformed Topic
- ✅ Cache Overwrite
- ✅ Unknown ESP returns None
- ✅ Non-dict Payload safety
- ❌ TTL Expiry (Entry nach 120s verschwunden)
- ❌ Cache Maxsize eviction
- ❌ Concurrent ESP IDs (mehrere ESPs gleichzeitig)

**Fix-Vorschlag:** TTL-Test mit `time.sleep()` oder TTLCache-Mock:
```python
@pytest.mark.asyncio
async def test_ttl_expiry(handler):
    topic = "kaiser/god/esp/ESP_TTL/system/heartbeat_metrics"
    await handler.handle_heartbeat_metrics(topic, {"ts": 1})
    assert handler.get_latest("ESP_TTL") is not None
    # Simulate expiry
    handler._latest._TTLCache__data.clear()  # oder time mock
    assert handler.get_latest("ESP_TTL") is None
```

---

### P3-03: `_merge_metrics_into_payload` ist `@staticmethod` aber nutzt Singleton-State

**Datei:** `src/mqtt/handlers/heartbeat_handler.py` Zeile 224-254

**Problem:** Die Methode ist `@staticmethod`, ruft aber `get_heartbeat_metrics_handler()` auf — also globalen Singleton-State. Das widerspricht dem `@staticmethod`-Kontrakt (sollte keine versteckten Abhängigkeiten haben) und erschwert das Testing (braucht `patch`).

**Fix-Vorschlag:** Entweder als reguläre Methode mit injiziertem Handler, oder den `get_heartbeat_metrics_handler()`-Call als Parameter:
```python
@staticmethod
def _merge_metrics_into_payload(
    esp_id: str, payload: dict, 
    metrics_handler: HeartbeatMetricsHandler | None = None
) -> None:
    entry = (metrics_handler or get_heartbeat_metrics_handler()).get_latest(esp_id)
```
**Warum:** Explizite Dependency Injection statt verstecktem Singleton macht Tests einfacher und den Code ehrlicher.

---

## Qualitätsprüfung (8-Dimensionen)

| # | Dimension | Status | Anmerkung |
|---|-----------|--------|-----------|
| 1 | Struktur & Einbindung | ✅ | Handler korrekt in `handlers/`, `__init__.py` exportiert, `main.py` registriert |
| 2 | Namenskonvention | ✅ | snake_case durchgängig, PascalCase für Klasse |
| 3 | Rückwärtskompatibilität | ✅ | Merge ist additiv, keine Breaking Changes |
| 4 | Wiederverwendbarkeit | ⚠️ | Singleton ohne Reset, keine DI für Handler |
| 5 | Speicher & Ressourcen | ⚠️ | Keine Payload-Größenbegrenzung im Cache |
| 6 | Fehlertoleranz | ✅ | try/except um alles, non-blocking, safe_payload Fallback |
| 7 | Seiteneffekte | ✅ | Kein DB-Write, kein WS-Broadcast (by design) |
| 8 | Industrielles Niveau | ⚠️ | Fehlende Prometheus-Metriken, keine Key-Whitelist |

---

## Cross-Layer Impact

| Bereich | Impact | Status |
|---------|--------|--------|
| ESP32 Firmware | Sendet `heartbeat_metrics` Topic | Kein Server-Impact |
| MQTT QoS | `heartbeat_metrics` erhält QoS 0 implizit | ⚠️ Finding P1-01 |
| DB Persistenz | `_RUNTIME_TELEMETRY_KEYS` enthält Metrics-Keys | ✅ Korrekt |
| WebSocket | Merge-Felder fließen durch `runtime_telemetry` | ⚠️ Finding P2-03 |
| Frontend | Konsumiert Merge-Felder aus WS-Events | Kein direkter Impact |
| Grafana/Prometheus | Keine eigenen Metriken für AUT-121 | ⚠️ Finding P3-01 |

---

## Zusammenfassung

Die AUT-121-Umsetzung ist **architektonisch solide**: Die Trennung in einen leichtgewichtigen Ingest-Handler (kein DB, kein WS) mit TTLCache-Puffer und idempotenter Merge-Phase im Heartbeat-Handler ist ein gutes Pattern. Die Testabdeckung ist für den Kern-Flow gut.

**Hauptkritikpunkte:**
1. Das QoS-Routing im Subscriber ist fragil (Substring-Match) — sollte explizit sein
2. Der Merge hat keine Feld-Whitelist — erlaubt unkontrollierte Key-Injection
3. Keine eigenen Observability-Metriken für das Feature selbst
4. Singleton-Lifecycle ist unvollständig (kein Reset/Flush)

**Kein Blocker, aber alle P1/P2-Findings sollten vor Production-Hardening adressiert werden.**

---

## Empfehlung

| Agent | Aufgabe |
|-------|---------|
| `server-dev` | P1-01 (QoS), P1-02 (Whitelist), P2-01 (Reset), P2-02 (Validierung) implementieren |
| `mqtt-dev` | QoS-Entscheidung für `heartbeat_metrics` formal dokumentieren |
| `test-log-analyst` | P3-02 Tests nach Implementierung verifizieren |

---

**Version:** 1.0
**Datum:** 2026-04-24
**Agent:** server-dev (Modus A)
