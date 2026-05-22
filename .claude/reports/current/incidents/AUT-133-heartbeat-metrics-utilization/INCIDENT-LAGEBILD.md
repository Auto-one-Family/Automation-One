# INCIDENT-LAGEBILD — AUT-133 Heartbeat Metrics Utilization

**Stand:** 2026-05-06  
**Linear:** https://linear.app/autoone/issue/AUT-133  
**Branch:** `auto-debugger/work`  
**Incident-ID:** AUT-133-heartbeat-metrics-utilization

---

## 1. Kontext & Scope

AUT-121 (HeartbeatMetricsHandler) ist **implementiert**: separater `heartbeat_metrics` MQTT-Topic,
TTLCache-Buffer, `_merge_metrics_into_payload()` in heartbeat_handler.py.  
AUT-133 macht die Metriken **produktiv nutzbar** (DB/WS/UI/Monitoring).

---

## 2. IST-Befund (code-verifiziert 2026-05-06)

### Layer 1 — Firmware → MQTT (Ist-Felder aus Mqtt_Protocoll.md)

Counter-Felder, die die Firmware sendet (via heartbeat oder heartbeat_metrics):
- `critical_outcome_drop_count` (NVS intent_outbox drops)
- `publish_outbox_drop_count` (ESP-IDF Outbox drops)
- `persistence_drift_count` (Drift-Zähler)
- `heartbeat_degraded_count`
- `publish_queue_drop_count` (Queue-Verwerfungen)
- `publish_queue_fill`, `publish_queue_hwm`, `publish_queue_shed_count`
- `safe_publish_retry_count`
- `sensor_command_queue_overflow_count`
- `adoption_delta_count`, `handover_abort_count`

### Layer 2 — Server DB-Persistenz (`_RUNTIME_TELEMETRY_KEYS`, esp_heartbeat_repo.py:27-50)

| Feld | Persistiert? |
|------|-------------|
| `critical_outcome_drop_count` | ✓ |
| `publish_outbox_drop_count` | ✓ |
| `persistence_drift_count` | ✓ |
| `heartbeat_degraded_count` | ✓ |
| `handover_contract_reject*` (3 Felder) | ✓ |
| `session_epoch`, `handover_epoch` | ✓ |
| `metrics_delta_ts`, `metrics_freshness_seconds` | ✓ |
| `metrics_schema_version` | ✓ |
| `payload_degraded`, `degraded_fields` | ✓ |
| **`publish_queue_drop_count`** | **✗ FEHLT** |
| **`safe_publish_retry_count`** | **✗ FEHLT** |
| **`adoption_delta_count`** | **✗ FEHLT** |

### Layer 3 — WS-Serialisierung (event_contract_serializers.py:244-246)

Flat-Spread aller `runtime_telemetry`-Felder in den WS-Payload — funktioniert,
aber ohne explizite Feld-Dokumentation. Kein separates `esp_metrics_update` Event.

### Layer 4 — WS-Typ (`ESPHealthEvent.data`, websocket-events.ts:85-124)

Explizit typisiert: `handover_contract_reject*`, `persistence_degraded*`, `metrics_delta_ts`, `metrics_freshness_seconds`, `degraded*`

**FEHLT im Typ:**
- `critical_outcome_drop_count?: number`
- `publish_outbox_drop_count?: number`
- `persistence_drift_count?: number`
- `heartbeat_degraded_count?: number`
- `publish_queue_drop_count?: number`

→ Diese Felder landen als `[key: string]: unknown` (TypeScript-Lücke)

### Layer 5 — Frontend ViewModel (espHealth.ts)

`MAPPED_TELEMETRY_FLAG_KEYS` (Zeile 33-49): erfasst booleans + handover-Felder — **keine Counter**.

`espHealth.ts:328-338`: `critical_outcome_drop_count`, `publish_outbox_drop_count`, `persistence_drift_count` sind in der exclusion-Liste der rawTelemetry-Anzeige → **silenter Drop** — kein Operator sieht diese Werte.

`EspHealthViewModel`: keine Counter-Felder.

### Layer 6 — Prometheus (metrics.py:977-990)

`observe_heartbeat_firmware_flags()`: nur 5 bool-Flags.  
**Keine Counter-basierten Metriken** für Drop/Reject/Drift-Counts.  
Kein `deploy/prometheus/rules/` Verzeichnis → keine Alert-Regeln im Repo.

---

## 3. Gap-Matrix (B-MU Gates)

| Gate | Status | Gap |
|------|--------|-----|
| B-MU-01: Feld-Matrix dokumentiert | ✗ | Kein Dokument existiert |
| B-MU-02: Kein operativer Feldverlust MQTT→DB | ✗ | `publish_queue_drop_count` fehlt in `_RUNTIME_TELEMETRY_KEYS` |
| B-MU-03: ≥3 Counter strukturiert im Frontend | ✗ | rawTelemetry-silenter Drop (espHealth.ts:328-338) |
| B-MU-04: Prometheus counter-basiert | ✗ | Nur bool-Flags, keine Gauge-Counters |
| B-MU-05: Contract-Tests grün | ✗ | Keine Counter-Assertions in espHealth.test.ts |

---

## 4. Pattern-Scan

| Was | Closest Implementation | Pfad |
|-----|------------------------|------|
| Bool-Flag Prometheus | `HEARTBEAT_FIRMWARE_FLAG_TOTAL` + `observe_heartbeat_firmware_flags()` | `metrics.py:344,977` |
| VM-Normalizer | `normalizeEspHealthPayload()` + `MAPPED_TELEMETRY_FLAG_KEYS` | `espHealth.ts:33,91` |
| WS-Typ-Erweiterung | `ESPHealthEvent.data` Felder | `websocket-events.ts:85-124` |
| DB-Persistenz-Erweiterung | `_RUNTIME_TELEMETRY_KEYS` frozenset | `esp_heartbeat_repo.py:27-50` |
| Prometheus Gauge pro ESP | Noch kein Pattern — neu anlegen ähnlich `ESP_TOTAL_GAUGE` | `metrics.py:114` |
| Frontend Counter Display | `espHealthPresentation()` reasons-Array | `espHealth.ts:251` |

---

## 5. Nicht-Scope (bewusste Abgrenzung)

- Root-Cause 5h-Offline (AUT-109)
- Reconnect-Ordering (AUT-69)
- Heartbeat-Core-Slimming (AUT-68)
- Neue WS-Event-Types (kein `esp_metrics_update` — zu großer Scope)
- Alert-Regel-Dateien (kein `deploy/prometheus/rules/` im Repo)
- Alembic-Migration (runtime_telemetry ist JSONB — Erweiterung ist schema-frei)

---

## 6. Eingebrachte Erkenntnisse (2026-05-06)

- AUT-121 HeartbeatMetricsHandler vollständig implementiert und getestet
  (`tests/mqtt/test_heartbeat_metrics_handler.py`)
- `_merge_metrics_into_payload()` merged alle Metrics-Felder außer `ts` idempotent
- JSONB-Spalte `runtime_telemetry` ist schema-frei — kein Alembic nötig
- `metrics_schema_version` ist bereits in `_RUNTIME_TELEMETRY_KEYS` und im WS-Typ
- Testpfade bestätigt: `tests/mqtt/test_heartbeat_handler.py`, `tests/unit/domain/espHealth.test.ts`
