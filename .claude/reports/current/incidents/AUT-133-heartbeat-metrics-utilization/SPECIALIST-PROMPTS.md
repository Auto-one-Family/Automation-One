# SPECIALIST-PROMPTS — AUT-133 Heartbeat Metrics Utilization

**Stand:** 2026-05-06 (nach verify-plan)  
**Branch:** `auto-debugger/work`  
**Dispatch:** PKG-01 und PKG-02 **parallel**

---

## PKG-01 — server-dev

**Kontext:** AUT-133 EA-15.4. AUT-121 (HeartbeatMetricsHandler + `_merge_metrics_into_payload`) ist bereits implementiert.
Transport funktioniert. Dieses Paket macht Metriken in DB und Prometheus nutzbar.

**Dateien:**
1. `El Servador/god_kaiser_server/src/db/repositories/esp_heartbeat_repo.py` (Zeile 27-50)
2. `El Servador/god_kaiser_server/src/core/metrics.py` (Zeile 977-990, neu nach 990)
3. `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Zeile 33-43, Zeile 353)

**Pattern-Reuse:**
- `_RUNTIME_TELEMETRY_KEYS` frozenset → additiv erweitern (esp_heartbeat_repo.py:27)
- `observe_heartbeat_firmware_flags(payload)` → neues Analogon `observe_heartbeat_firmware_counters(esp_id_str, payload)` (metrics.py:977)
- Import-Block heartbeat_handler.py Zeile 33-43 → `observe_heartbeat_firmware_counters` ergänzen

**Implementierung:**

### Schritt 1: `_RUNTIME_TELEMETRY_KEYS` erweitern (esp_heartbeat_repo.py:27-50)

Füge diese 3 Felder in die frozenset ein:
```python
"publish_queue_drop_count",    # Queue-Verwerfungen (war bisher nicht persistiert)
"safe_publish_retry_count",    # Retry-Druck
"adoption_delta_count",        # NVS-Adoption-Delta
```

### Schritt 2: Prometheus Gauge + Funktion (metrics.py)

Nach `HEARTBEAT_FIRMWARE_FLAG_TOTAL` (Zeile 344) einfügen:
```python
HEARTBEAT_FIRMWARE_COUNTER_GAUGE = Gauge(
    "heartbeat_firmware_counter",
    "Latest firmware counter value reported in heartbeat (drop/reject/drift)",
    ["esp_id", "counter_name"],
)
```

Nach `observe_heartbeat_firmware_flags()` (Zeile 990) einfügen:
```python
def observe_heartbeat_firmware_counters(esp_id: str, payload: dict) -> None:
    """Track latest firmware counter values as Prometheus Gauges (per ESP)."""
    if not isinstance(payload, dict):
        return
    counter_fields = (
        "critical_outcome_drop_count",
        "publish_outbox_drop_count",
        "persistence_drift_count",
        "heartbeat_degraded_count",
        "publish_queue_drop_count",
        "safe_publish_retry_count",
    )
    for field in counter_fields:
        value = payload.get(field)
        if isinstance(value, (int, float)) and value >= 0:
            HEARTBEAT_FIRMWARE_COUNTER_GAUGE.labels(
                esp_id=esp_id, counter_name=field
            ).set(value)
```

Kein Warm-up in `init_metrics()` — `esp_id` ist dynamisch, Zeitreihen erscheinen beim ersten `set()`.

### Schritt 3: heartbeat_handler.py verdrahten (Zeile 33-43 + 353)

Import-Block ergänzen:
```python
from ...core.metrics import (
    ...
    observe_heartbeat_firmware_flags,
    observe_heartbeat_firmware_counters,   # NEU
    ...
)
```

Nach `observe_heartbeat_firmware_flags(payload)` (Zeile 353):
```python
observe_heartbeat_firmware_counters(esp_id_str, payload)
```

**ACHTUNG:** Variable heißt `esp_id_str` (nicht `esp_id`) — verify-plan-Korrektur.

**Git:**
```bash
git checkout auto-debugger/work
# Commit nach grüner Verifikation:
git add El\ Servador/god_kaiser_server/src/db/repositories/esp_heartbeat_repo.py \
        El\ Servador/god_kaiser_server/src/core/metrics.py \
        El\ Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py
git commit -m "feat(server): AUT-133 Heartbeat metrics utilization — DB persistence + Prometheus counters"
```

**Verify:**
```bash
cd "El Servador/god_kaiser_server"
poetry run ruff check src/db/repositories/esp_heartbeat_repo.py src/core/metrics.py src/mqtt/handlers/heartbeat_handler.py
poetry run pytest tests/mqtt/test_heartbeat_handler.py tests/mqtt/test_heartbeat_metrics_handler.py -q --tb=short
```

**Fehler-Register:** Bei Fehlern in `.claude/reports/current/incidents/AUT-133-heartbeat-metrics-utilization/FEHLER-REGISTER.md` eintragen (ID, Evidenz, Hypothese, Fix, Verify).

**Akzeptanzkriterien:**
- [ ] B-MU-02: `publish_queue_drop_count` in `_RUNTIME_TELEMETRY_KEYS` — `extract_heartbeat_runtime_telemetry()` gibt es zurück
- [ ] B-MU-04: `heartbeat_firmware_counter{esp_id=...,counter_name=...}` in `/api/v1/health/metrics` Output nach erstem Heartbeat

---

## PKG-02 — frontend-dev

**Kontext:** AUT-133 EA-15.4. Counter-Felder (`critical_outcome_drop_count`, `publish_outbox_drop_count`, `persistence_drift_count`) kommen via WS im `esp_health` Event an, landen in `rawTelemetry`, werden aber in Zeile 328-338 von espHealth.ts aus der Anzeige herausgefiltert — silenter Drop. Dieses Paket surfaced diese Counter strukturiert für Operatoren.

**Dateien:**
1. `El Frontend/src/types/websocket-events.ts` (Zeile 85-124)
2. `El Frontend/src/types/index.ts` (Zeile 574+)
3. `El Frontend/src/domain/esp/espHealth.ts` (vollständig: Interface, MAPPED_KEYS, Normalizer, Presentation)
4. `El Frontend/tests/unit/domain/espHealth.test.ts` (erweitern)

**Pattern-Reuse:**
- `MAPPED_TELEMETRY_FLAG_KEYS` Set (Zeile 33-49) — Counter-Keys analog zu bool-Keys ergänzen
- `EspHealthViewModel` Interface (Zeile 6-30) — `metrics` Block analog zu `handover` Block
- `normalizeEspHealthPayload()` (Zeile 91-133) — `asNum()` Pattern für Counter-Werte
- `espHealthPresentation()` (Zeile 251+) — `tooltipLines` wie bestehende `reasons.flatMap()`

**Implementierung:**

### Schritt 1: `ESPHealthEvent.data` erweitern (websocket-events.ts:109-122)

Nach `metrics_freshness_seconds?: number` (Zeile 111) einfügen:
```typescript
critical_outcome_drop_count?: number
publish_outbox_drop_count?: number
persistence_drift_count?: number
heartbeat_degraded_count?: number
publish_queue_drop_count?: number
safe_publish_retry_count?: number
```

### Schritt 2: `EspHealthEvent` (index.ts:574+) analog erweitern

Gleiche 6 Felder optional ergänzen.

### Schritt 3: `espHealth.ts` — 4 Änderungen

**a) `EspHealthViewModel` (Zeile 6-30)** — `metrics`-Block nach `handover`-Block:
```typescript
metrics: {
  criticalOutcomeDropCount: number
  publishOutboxDropCount: number
  persistenceDriftCount: number
  heartbeatDegradedCount: number
  publishQueueDropCount: number
}
```

**b) `MAPPED_TELEMETRY_FLAG_KEYS` (Zeile 33-49)** — Counter-Keys ergänzen:
```typescript
'critical_outcome_drop_count',
'publish_outbox_drop_count',
'persistence_drift_count',
'heartbeat_degraded_count',
'publish_queue_drop_count',
'safe_publish_retry_count',
```

**c) `normalizeEspHealthPayload()` (Zeile 115-132 return block)** — `metrics` Property hinzufügen:
```typescript
metrics: {
  criticalOutcomeDropCount: asNum(raw.critical_outcome_drop_count) ?? 0,
  publishOutboxDropCount: asNum(raw.publish_outbox_drop_count) ?? 0,
  persistenceDriftCount: asNum(raw.persistence_drift_count) ?? 0,
  heartbeatDegradedCount: asNum(raw.heartbeat_degraded_count) ?? 0,
  publishQueueDropCount: asNum(raw.publish_queue_drop_count) ?? 0,
},
```

**d) `espHealthPresentation()` (Zeile 320 nach bestehenden reasons-Checks)** — Counter-Indicator-Block:
```typescript
const { metrics } = vm
const counterLines: string[] = []
if (metrics.criticalOutcomeDropCount > 0)
  counterLines.push(`Kritische Drops: ${metrics.criticalOutcomeDropCount}`)
if (metrics.publishOutboxDropCount > 0)
  counterLines.push(`Outbox-Drops: ${metrics.publishOutboxDropCount}`)
if (metrics.persistenceDriftCount > 0)
  counterLines.push(`Persistenz-Drifts: ${metrics.persistenceDriftCount}`)
if (metrics.publishQueueDropCount > 0)
  counterLines.push(`Queue-Drops: ${metrics.publishQueueDropCount}`)
if (counterLines.length > 0) {
  lines.push('Metriken:', ...counterLines)
}
```

**e) rawTelemetry-Exclusion-Liste bereinigen (Zeile 328-338)**:
- `critical_outcome_drop_count`, `publish_outbox_drop_count`, `persistence_drift_count` aus der Exclusion-Liste entfernen (sie sind jetzt in MAPPED_TELEMETRY_FLAG_KEYS — nie mehr in rawTelemetry)
- `metrics_schema_version` **BEHALTEN** (bleibt absichtlich in rawTelemetry)

### Schritt 4: Tests erweitern (espHealth.test.ts)

```typescript
it('maps counter fields into metrics ViewModel', () => {
  const vm = normalizeEspHealthPayload({
    esp_id: 'ESP_X',
    critical_outcome_drop_count: 3,
    publish_outbox_drop_count: 1,
    persistence_drift_count: 2,
    publish_queue_drop_count: 5,
  })
  expect(vm.metrics.criticalOutcomeDropCount).toBe(3)
  expect(vm.metrics.publishOutboxDropCount).toBe(1)
  expect(vm.metrics.persistenceDriftCount).toBe(2)
  expect(vm.metrics.publishQueueDropCount).toBe(5)
  // Counter-Felder dürfen NICHT in rawTelemetry landen
  expect(vm.rawTelemetry.critical_outcome_drop_count).toBeUndefined()
  expect(vm.rawTelemetry.publish_outbox_drop_count).toBeUndefined()
})

it('shows counter indicators in tooltipLines when counters > 0', () => {
  const vm = normalizeEspHealthPayload({
    esp_id: 'ESP_X',
    critical_outcome_drop_count: 2,
  })
  const p = espHealthPresentation(vm, true)
  expect(p.tooltipLines.some(l => l.includes('Kritische Drops'))).toBe(true)
})

it('does not show counter indicators when all counters are 0', () => {
  const vm = normalizeEspHealthPayload({ esp_id: 'ESP_X' })
  const p = espHealthPresentation(vm, true)
  expect(p.tooltipLines.some(l => l.includes('Metriken:'))).toBe(false)
})
```

**Git:**
```bash
git checkout auto-debugger/work
# Commit nach grüner Verifikation:
git add "El Frontend/src/types/websocket-events.ts" \
        "El Frontend/src/types/index.ts" \
        "El Frontend/src/domain/esp/espHealth.ts" \
        "El Frontend/tests/unit/domain/espHealth.test.ts"
git commit -m "feat(frontend): AUT-133 Heartbeat metrics utilization — WS types + ViewModel counter indicators"
```

**Verify:**
```bash
cd "El Frontend"
npx vitest run tests/unit/domain/espHealth.test.ts
npx vue-tsc --noEmit
npm run build
```

**Fehler-Register:** Bei Fehlern in `.claude/reports/current/incidents/AUT-133-heartbeat-metrics-utilization/FEHLER-REGISTER.md` eintragen.

**Akzeptanzkriterien:**
- [ ] B-MU-01: `critical_outcome_drop_count`, `publish_outbox_drop_count` in `ESPHealthEvent.data` typisiert
- [ ] B-MU-03: `espHealthPresentation()` zeigt ≥3 Counter strukturiert wenn > 0
- [ ] B-MU-05: espHealth.test.ts Counter-Tests grün (neue 3 Tests grün)
