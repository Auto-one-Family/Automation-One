# TASK-PACKAGES — AUT-133 Heartbeat Metrics Utilization

**Stand:** 2026-05-06  
**Branch:** `auto-debugger/work`  
**Reihenfolge:** PKG-01 (server-dev) und PKG-02 (frontend-dev) **parallel** (keine geteilten Dateien)

---

## PKG-01 — Server: DB-Persistenz + Prometheus Counter-Metriken

**Agent:** `server-dev`  
**Schätzung:** 1.5 SP  
**Priorität:** P0 (B-MU-02 + B-MU-04 verletzt)

### Dateien

1. `El Servador/god_kaiser_server/src/db/repositories/esp_heartbeat_repo.py` (Zeile 27-50)
2. `El Servador/god_kaiser_server/src/core/metrics.py` (Zeile 977-990 + neu)
3. `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` (Zeile 353)

### Änderungen

**1. `_RUNTIME_TELEMETRY_KEYS` erweitern** (esp_heartbeat_repo.py:27-50)

Aktuell 19 Felder. Ergänzen:
```python
"publish_queue_drop_count",    # Queue-Verwerfungen (operativ kritisch)
"safe_publish_retry_count",    # Retry-Druck
"adoption_delta_count",        # NVS-Adoption-Delta
```

Begründung: Diese 3 Felder werden von der Firmware über `heartbeat_metrics` Topic gesendet,
von `_merge_metrics_into_payload()` in den Payload eingebracht, aber durch `_RUNTIME_TELEMETRY_KEYS`
nicht persistiert → stiller MQTT→DB Drop (B-MU-02 verletzt).

**2. `observe_heartbeat_firmware_counters()` neu anlegen** (metrics.py)

```python
# Nach HEARTBEAT_FIRMWARE_FLAG_TOTAL (Zeile 344) einfügen:
HEARTBEAT_FIRMWARE_COUNTER_GAUGE = Gauge(
    "heartbeat_firmware_counter",
    "Latest firmware counter value reported in heartbeat (drop/reject/drift)",
    ["esp_id", "counter_name"],
)

# Kein Warm-up: esp_id ist dynamisch — Zeitreihen erscheinen automatisch beim ersten set().

# Neue Funktion nach observe_heartbeat_firmware_flags() (Zeile 977):
def observe_heartbeat_firmware_counters(esp_id: str, payload: dict) -> None:
    """Track latest firmware counter values as Prometheus Gauges."""
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

**3. heartbeat_handler.py — Aufruf verdrahten** (Zeile 353)

Imports ergänzen: `observe_heartbeat_firmware_counters` in Import-Block (Zeile 36-42).

In `process_message()` nach `observe_heartbeat_firmware_flags(payload)` (Zeile 353):
```python
observe_heartbeat_firmware_counters(esp_id_str, payload)
```

Hinweis: Variable heißt im Scope Zeile 353 **`esp_id_str`** (nicht `esp_id` — verify-plan-Korrektur).

### Akzeptanzkriterien (B-MU Gates)

- [ ] B-MU-02: `publish_queue_drop_count` in `_RUNTIME_TELEMETRY_KEYS` → wird in `runtime_telemetry` JSONB persistiert
- [ ] B-MU-04: `heartbeat_firmware_counter{esp_id=...,counter_name=...}` erscheint in `/api/v1/health/metrics` Output

### Verify

```bash
cd "El Servador/god_kaiser_server"
poetry run ruff check src/db/repositories/esp_heartbeat_repo.py src/core/metrics.py src/mqtt/handlers/heartbeat_handler.py
poetry run pytest tests/mqtt/test_heartbeat_handler.py tests/mqtt/test_heartbeat_metrics_handler.py -q --tb=short
```

### Fehler-Register

`FEHLER-REGISTER.md` im gleichen Ordner.

---

## PKG-02 — Frontend: WS-Typen + ViewModel Counter-Indikatoren

**Agent:** `frontend-dev`  
**Schätzung:** 1 SP  
**Priorität:** P0 (B-MU-03 verletzt)

### Dateien

1. `El Frontend/src/types/websocket-events.ts` (Zeile 85-124)
2. `El Frontend/src/types/index.ts` (Zeile 574+)
3. `El Frontend/src/domain/esp/espHealth.ts` (vollständig)
4. `El Frontend/tests/unit/domain/espHealth.test.ts` (erweitern)

### Änderungen

**1. `ESPHealthEvent.data` (websocket-events.ts:109-122) erweitern**

Nach `metrics_freshness_seconds?: number` (Zeile 111) einfügen:
```typescript
critical_outcome_drop_count?: number
publish_outbox_drop_count?: number
persistence_drift_count?: number
heartbeat_degraded_count?: number
publish_queue_drop_count?: number
safe_publish_retry_count?: number
```

**2. `EspHealthEvent` (index.ts:574+) analog erweitern**

Gleiche 6 Felder optional hinzufügen.

**3. `espHealth.ts` — 4-teilige Änderung**

*a) `EspHealthViewModel` erweitern* (nach `handover`-Block):
```typescript
metrics: {
  criticalOutcomeDropCount: number
  publishOutboxDropCount: number
  persistenceDriftCount: number
  heartbeatDegradedCount: number
  publishQueueDropCount: number
}
```

*b) `MAPPED_TELEMETRY_FLAG_KEYS` erweitern* (Zeile 33-49):
```typescript
'critical_outcome_drop_count',
'publish_outbox_drop_count',
'persistence_drift_count',
'heartbeat_degraded_count',
'publish_queue_drop_count',
'safe_publish_retry_count',
```

*c) `normalizeEspHealthPayload()` erweitern* (Zeile 91-133):
```typescript
metrics: {
  criticalOutcomeDropCount: asNum(raw.critical_outcome_drop_count) ?? 0,
  publishOutboxDropCount: asNum(raw.publish_outbox_drop_count) ?? 0,
  persistenceDriftCount: asNum(raw.persistence_drift_count) ?? 0,
  heartbeatDegradedCount: asNum(raw.heartbeat_degraded_count) ?? 0,
  publishQueueDropCount: asNum(raw.publish_queue_drop_count) ?? 0,
},
```

*d) `espHealthPresentation()` erweitern* (Zeile 251+):
Strukturierte Counter-Indikatoren in `tooltipLines` wenn Counter > 0:
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

Außerdem: rawTelemetry exclusion-Liste (espHealth.ts:330-336) bereinigen — `critical_outcome_drop_count`, `publish_outbox_drop_count`, `persistence_drift_count` entfernen (sie erreichen rawTelemetry nie mehr, da sie jetzt in MAPPED_TELEMETRY_FLAG_KEYS sind). `metrics_schema_version` in der Liste BEHALTEN.

**4. `espHealth.test.ts` erweitern**

Neue Tests:
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
})

it('shows counter indicators in tooltipLines when counters > 0', () => {
  const vm = normalizeEspHealthPayload({
    esp_id: 'ESP_X',
    critical_outcome_drop_count: 2,
  })
  const p = espHealthPresentation(vm, true)
  expect(p.tooltipLines.some(l => l.includes('Kritische Drops'))).toBe(true)
})
```

### Akzeptanzkriterien (B-MU Gates)

- [ ] B-MU-01: Counter-Felder in `ESPHealthEvent.data` typisiert (kein `unknown`)
- [ ] B-MU-03: `espHealthPresentation()` zeigt ≥3 Counter strukturiert wenn > 0
- [ ] B-MU-05: `espHealth.test.ts` Counter-Tests grün

### Verify

```bash
cd "El Frontend"
npx vitest run tests/unit/domain/espHealth.test.ts
npx vue-tsc --noEmit
npm run build
```

---

## Reihenfolge

```
PKG-01 (server-dev) ──┐
                       ├── PARALLEL (keine geteilten Dateien)
PKG-02 (frontend-dev) ─┘

Danach: B-MU-01..05 manuell verifizieren → Linear-Status auf Done setzen
```

---

## B-MU Feld-Matrix (nach Implementierung)

| Feld | Firmware | DB | WS-Typ | VM | UI | Prometheus |
|------|----------|----|---------|----|----|-----------:|
| critical_outcome_drop_count | ✓ | ✓ | +02 | +02 | +02 | +01 |
| publish_outbox_drop_count | ✓ | ✓ | +02 | +02 | +02 | +01 |
| persistence_drift_count | ✓ | ✓ | +02 | +02 | +02 | +01 |
| heartbeat_degraded_count | ✓ | ✓ | +02 | +02 | - | +01 |
| publish_queue_drop_count | ✓ | +01 | +02 | +02 | +02 | +01 |
| safe_publish_retry_count | ✓ | +01 | +02 | - | - | +01 |
| adoption_delta_count | ✓ | +01 | - | - | - | - |

(+01 = PKG-01, +02 = PKG-02)
