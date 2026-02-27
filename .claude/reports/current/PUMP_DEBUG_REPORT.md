# Pump Debug Report - Mock Actuator Flow

**Datum:** 2026-02-27
**Trigger:** User hat Pumpe auf Mock eingeschaltet, sieht nichts in Browser-Console

---

## Ergebnisse

### 1. Console-Output: Warum nichts sichtbar?

**Root Cause:** Das Frontend verwendet `createLogger()` (nicht `console.log`). Der Logger nutzt:
- `console.debug()` für DEBUG-Level (Actuator API-Requests)
- `console.info()` für INFO-Level (WebSocket, Store-Events)

**Problem:** In Chrome DevTools sind `console.debug()` Messages standardmäßig **ausgeblendet** - man muss "Verbose" im Console-Filter aktivieren.

**Zusätzlich:** Die `sendActuatorCommand()` Funktion in `esp.ts:1450` hat **keine eigenen Log-Statements** - nur:
- Debug-API-Request-Logs (generisch, via Axios-Interceptor)
- Toast-Benachrichtigungen (UI-seitig)

**Empfehlung:** Im Browser Console-Filter "Verbose" aktivieren, dann sieht man:
```
[API] POST /debug/mock-esp/MOCK_95A49FCB/actuators/18 → 200
[API] GET /debug/mock-esp/MOCK_95A49FCB → 200
```

### 2. Mock-Pump Flow (End-to-End)

| Schritt | Was passiert | Status |
|---------|-------------|--------|
| UI: Toggle-Button | `toggleActuator()` in ActuatorConfigPanel.vue:150 | OK |
| Store: sendActuatorCommand | `debugApi.setActuatorState()` (Mock-Path) | OK |
| API: Debug Endpoint | `POST /debug/mock-esp/{id}/actuators/{gpio}` → 200 | OK |
| State Update | Mock-Store aktualisiert state + pwm_value | OK |
| Device Refresh | `fetchDevice()` holt frischen State | OK |
| UI Update | Button wechselt AN/AUS, Badge aktualisiert | OK |
| MQTT Publish | Mock publiziert Status auf `kaiser/god/esp/{id}/actuator/{gpio}/status` | OK |
| Server Handler | `actuator_handler.py` empfängt MQTT-Message | OK |
| DB Write | `actuator_repo.update_state()` | **FEHLER** |
| WS Broadcast | `actuator_status` WebSocket-Event | **NICHT ERREICHT** |

### 3. Bug: Timezone-Mismatch in actuator_handler

**Datei:** `El Servador/god_kaiser_server/src/db/models/actuator.py:255`
```python
last_command_timestamp: Mapped[Optional[datetime]] = mapped_column(
    DateTime,        # <-- OHNE timezone=True
    nullable=True,
)
```

**Problem:** Handler sendet `datetime(2026, 2, 27, 17, 14, 58, tzinfo=timezone.utc)` (timezone-aware) an eine `TIMESTAMP WITHOUT TIME ZONE` Spalte. PostgreSQL lehnt das ab.

**Error:**
```
asyncpg.exceptions.DataError: invalid input for query argument $8:
  datetime.datetime(2026, 2, 27, 17, 14, 58, tzinfo=datetime.timezone.utc)
  (can't subtract offset-naive and offset-aware datetimes)
```

**Impact:**
- Actuator-Status wird NICHT in DB persistiert
- WebSocket-Broadcast `actuator_status` wird NICHT gesendet
- Frontend erhält keine Live-Updates über WS (nur über Device-Refresh nach API-Call)
- Betrifft ALLE Mock-Actuatoren (MOCK_95A49FCB, MOCK_PW72212497)

**Fix:** `DateTime` → `DateTime(timezone=True)` in actuator.py:255 + Alembic Migration

### 4. Parallel-Test: Mock + Mock Koexistenz

**Test-Setup:**
- Mock #9FCB: 2 Pumpen (GPIO 18, GPIO 13)
- Mock #2497 (Playwright-erstellt): 1 Pumpe (GPIO 25)

**Ergebnis:**

| Test | Mock #9FCB GPIO 18 | Mock #9FCB GPIO 13 | Mock #2497 GPIO 25 | Resultat |
|------|-------------------|--------------------|--------------------| ---------|
| Beide ON | OFF → ON | - | ON → ON | OK |
| Gegenläufig | ON → OFF | OFF → ON | ON (unverändert) | OK |

- Keine Race Conditions
- Keine Deadlocks
- Keine gegenseitige Beeinflussung
- Heartbeats laufen parallel für alle Mocks
- Server-Simulation stabil (3 aktive Simulationen)

### 5. Mock vs. Real ESP Architektur

| Aspekt | Mock ESP | Real ESP |
|--------|----------|----------|
| Command-Path | `debugApi.setActuatorState()` | `actuatorsApi.sendCommand()` |
| Transport | HTTP POST → Mock-Store | HTTP POST → MQTT → ESP32 |
| State-Update | Direkt im Mock-Store | Via MQTT Status-Topic |
| Feedback | Device-Refresh (Poll) | WebSocket `actuator_response` |
| Parallelität | Kein Konflikt (separate Stores) | Kein Konflikt (separate MQTT-Topics) |

**Koexistenz Mock + Real:** Architektonisch getrennte Pfade - kein Konflikt möglich.

---

## Offene Punkte

1. **CRITICAL:** Timezone-Bug in `actuator_handler.py` → DB-Write schlägt fehl → kein WS-Broadcast
2. **LOW:** `sendActuatorCommand()` hat keine business-level Logs (nur generische API-Logs)
3. **INFO:** MQTT Message History (`/messages`) ist bei allen Mocks leer (Bug oder Feature?)
