# Error Flow E2E Debug & Fix Report

> **Datum:** 2026-03-01
> **Scope:** Vollständiger Error-Flow ESP32 → MQTT → Server → Frontend
> **Methode:** Live MQTT Test-Messages + Codebase-Analyse + Fixes

---

## 1. E2E Test-Ergebnisse

### MQTT Test-Nachrichten gesendet

| # | Typ | Error-Code | Severity | Ergebnis |
|---|-----|-----------|----------|----------|
| 1 | OneWire ROM error | 1023 | ERROR (2) | ✅ Gespeichert + Broadcast |
| 2 | MQTT Connection Lost | 3014 | CRITICAL (3) | ✅ Gespeichert + Broadcast |
| 3 | Config Validation | 2014 | WARNING (1) | ✅ Gespeichert + Broadcast |
| 4 | Unknown Code | 9999 | ERROR (2) | ✅ Graceful Handling |
| 5 | Missing Severity | 1001 | - | ✅ Korrekt rejected (5205) |
| 6 | String Error-Code | "GPIO_CONFLICT" | ERROR (2) | ✅ Korrekt rejected (5206) |

### Flow-Verifikation

```
ESP32 MQTT Publish → Mosquitto Broker → Server Handler → AuditLog → WebSocket → Frontend Toast
         ✅              ✅                  ✅             ✅          ✅           ✅
```

### REST API Test

| Endpoint | Test | Ergebnis |
|----------|------|----------|
| `GET /api/v1/errors/codes/1023` | Bekannter Code | ✅ Deutsche Beschreibung + Troubleshooting |
| `GET /api/v1/errors/codes/3014` | Bekannter Code | ✅ Deutsche Beschreibung + Troubleshooting |
| `GET /api/v1/errors/codes/9999` | Unbekannter Code | ✅ 404 Not Found |

---

## 2. Gefundene Issues & Fixes

### Fix 1: INVALID_PAYLOAD_FORMAT Runtime Bug ✅ BEHOBEN

**Schweregrad:** CRITICAL (Runtime AttributeError)
**Datei:** `El Servador/god_kaiser_server/src/core/error_codes.py`

**Problem:** `ValidationErrorCode.INVALID_PAYLOAD_FORMAT` wird in `zone_ack_handler.py:240,249` referenziert, existierte aber nicht im Enum.

**Fix:**
```python
# ValidationErrorCode Enum (Zeile 253)
INVALID_PAYLOAD_FORMAT = 5209

# SERVER_ERROR_DESCRIPTIONS (Zeile 509)
5209: "Invalid payload format",
```

**Referenz-Doku:** `.claude/reference/errors/ERROR_CODES.md` ebenfalls aktualisiert.

---

### Fix 2: Frontend Severity-Mapping ✅ BEHOBEN

**Schweregrad:** MEDIUM (Severity-Verlust)
**Datei:** `El Frontend/src/shared/stores/notification.store.ts:98`

**Problem:** `info`-Severity wurde als `error`-Toast angezeigt.

**Vorher:**
```typescript
type: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : 'error'
// info → error ❌
```

**Nachher:**
```typescript
type: severity === 'critical' ? 'error' : severity === 'warning' ? 'warning' : severity === 'info' ? 'info' : 'error'
// info → info ✅
```

---

### Fix 3: MQTT-Protokoll-Dokumentation ✅ BEHOBEN

**Schweregrad:** HIGH (Dokumentation komplett veraltet)
**Datei:** `El Trabajante/docs/Mqtt_Protocoll.md:1159-1207`

**Korrigiert:**

| Feld | Alt (FALSCH) | Neu (KORREKT) |
|------|-------------|---------------|
| `error_code` Typ | String (`"GPIO_CONFLICT"`) | int (`1002`) |
| `severity` Typ | String (`"critical"`) | int (`0-3`) |
| Module-Referenz | `error_reporter.cpp` | `error_tracker.cpp` |
| Throttle-Intervall | 10 Sekunden | 60 Sekunden |
| Payload-Felder | `module`, `function`, `stack_trace` | `category`, `context`, `ts` |
| Error-Code-Beispiele | String-basiert | Numerisch mit Ranges |

---

### Fix 4: translateErrorCode() API ✅ KEIN FIX NÖTIG

**Status:** Nicht toter Code - bereit für Nutzung

**Analyse:**
- `El Frontend/src/api/errors.ts:translateErrorCode()` ist ein API-Client für `/api/v1/errors/codes/{code}`
- Server-Endpoint existiert und funktioniert korrekt ✅
- Wird aktuell nicht aufgerufen, aber architektonisch korrekt angelegt für historische Events
- `El Frontend/src/utils/errorCodeTranslator.ts` enthält UI-Helper (Icons, Labels, Category-Detection)

---

## 3. Error-Flow Architektur (Verifiziert)

```
┌──────────────────────────────────────────────┐
│              ESP32 (El Trabajante)            │
│  ErrorTracker.trackError(code, sev, msg)     │
│  ├─ Ring-Buffer (50 max)                     │
│  ├─ Logger (Serial)                          │
│  └─ MQTT Publish (Rate-Limited: 1/60s/code)  │
│      Topic: kaiser/god/esp/{id}/system/error │
│      QoS: 1                                  │
└──────────────────┬───────────────────────────┘
                   │ MQTT
                   ▼
┌──────────────────────────────────────────────┐
│              Server (God-Kaiser)              │
│  error_handler.py:handle_error_event()       │
│  ├─ 1. Parse Topic → esp_id                 │
│  ├─ 2. Validate Payload (code+severity)      │
│  ├─ 3. Lookup ESP Device (resilient_session)  │
│  ├─ 4. Enrich via get_error_info() (100+ de) │
│  ├─ 5. Save to AuditLog (details JSON)       │
│  ├─ 6. Update Prometheus Metrics             │
│  └─ 7. WebSocket Broadcast (error_event)     │
└──────────────────┬───────────────────────────┘
                   │ WebSocket
                   ▼
┌──────────────────────────────────────────────┐
│             Frontend (El Frontend)            │
│  notification.store.ts:handleErrorEvent()    │
│  ├─ Map esp_id → Device Name                │
│  ├─ Build Display Message                    │
│  ├─ Add "Details" Action (Troubleshooting)   │
│  └─ Toast Show (severity-mapped)             │
│      ├─ critical → error (persistent) ✅     │
│      ├─ error → error (persistent) ✅        │
│      ├─ warning → warning (auto-dismiss) ✅  │
│      └─ info → info (auto-dismiss) ✅ FIXED  │
└──────────────────────────────────────────────┘
```

---

## 4. Stärken des Error-Systems

1. **100% ESP32 ↔ Server Code-Sync** — Alle Enum-Werte identisch
2. **Rate-Limiting** — 1 MQTT Error pro Code pro 60s (kein Broker-Flooding)
3. **Graceful Degradation** — Unknown codes werden gespeichert, nicht verworfen
4. **Deutsche Enrichment** — 100+ Error-Codes mit deutschen Beschreibungen + Troubleshooting
5. **Validation** — Strikte Payload-Prüfung (Type-Check, Range-Check)
6. **Audit-Trail** — Alle Errors persistiert mit vollständigem ESP-Raw-Payload
7. **REST API** — On-Demand Error-Code-Translation für historische Events

---

## 5. Bekannte Lücken (nicht gefixt — Architektur-Entscheidungen)

| # | Lücke | Schweregrad | Empfehlung |
|---|-------|-------------|------------|
| 1 | ~180 HTTPExceptions ohne Error-Codes | Strukturell | Mittelfristig: Custom Exception Handler |
| 2 | 45 tote ESP32-Codes (40%) | Wartbarkeit | Phase-Kommentare hinzufügen |
| 3 | Custom Exceptions ohne Error-Codes | Architektur | Bei nächstem Refactoring |
| 4 | Server-Errors (5000-5999) nicht zu MQTT | Feature | Optional: server-error MQTT Topic |

---

## 6. Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `El Servador/god_kaiser_server/src/core/error_codes.py` | +`INVALID_PAYLOAD_FORMAT = 5209` + Beschreibung |
| `El Frontend/src/shared/stores/notification.store.ts` | Severity-Mapping: info → info statt error |
| `El Trabajante/docs/Mqtt_Protocoll.md` | Sektion 15 komplett aktualisiert |
| `.claude/reference/errors/ERROR_CODES.md` | Bug-Status aktualisiert |
