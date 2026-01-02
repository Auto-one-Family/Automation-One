# Bugs Found - Session 2 (2025-12-30)

---

## Bug 1: Mock ESP Name wird nicht persistent angezeigt

### Status: BEHOBEN ✅

### Symptom
- User gibt Namen für Mock ESP über Inline-Editing in ESPCard.vue ein
- Name wird kurz angezeigt (nach Store-Update)
- Bei Page-Refresh oder listDevices() wird Name wieder auf "Unbenannt" zurückgesetzt

### Root Cause
Die Debug API (`/debug/mock-esp`) gab das `name`-Feld nicht zurück:
- Server Schema `MockESPResponse` hatte kein `name`-Feld
- Server API `_build_mock_esp_response()` übergab `device.name` nicht
- Frontend TypeScript Interface `MockESP` hatte kein `name`-Feld
- Frontend API setzte `name: null` hardcoded

### Lösung (4 Dateien geändert)

**1. Server Schema** ([debug.py:277](El Servador/god_kaiser_server/src/schemas/debug.py#L277)):
```python
class MockESPResponse(BaseModel):
    esp_id: str
    name: Optional[str] = None  # NEU
```

**2. Server API** ([debug.py:143](El Servador/god_kaiser_server/src/api/v1/debug.py#L143)):
```python
return MockESPResponse(
    esp_id=device.device_id,
    name=device.name,  # NEU
    ...
)
```

**3. Frontend Type** ([types/index.ts:105](El Frontend/src/types/index.ts#L105)):
```typescript
export interface MockESP {
  esp_id: string
  name: string | null  // NEU
}
```

**4. Frontend API** ([esp.ts](El Frontend/src/api/esp.ts) - 4 Stellen):
```typescript
name: mock.name || null  // Zeile 206, 275, 329, 396
```

**5. Server Neustart erforderlich** - Änderungen werden erst nach Neustart wirksam

---

## Bug 2: Freshness-Anzeige nach Name-Update (UX-Problem)

### Status: BEHOBEN ✅

### Symptom
- User ändert Namen in ESPCard
- Name wird korrekt gespeichert und angezeigt
- Card zeigt sofort "Veraltet" (stale) an
- Erst nach manuellem Heartbeat oder Tab-Wechsel wird Status wieder "Aktuell"

### Root Cause

Der PATCH zu `/esp/devices/{id}` aktualisiert nur die DB-Felder (name, zone_id, etc.), aber:
- `last_heartbeat` wird NICHT aktualisiert (kommt nur von echten Heartbeats)
- Die Freshness-Logik in ESPCard basiert auf `last_heartbeat`
- Nach Update ist `last_heartbeat` älter → Card zeigt "Veraltet"

### Lösung: Server-seitiger Heartbeat nach Update

**Gewählte Lösung:** Server triggert automatisch einen Heartbeat für Mock ESPs nach PATCH.
Dies nutzt den **gleichen Flow wie bei echten ESPs**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Neuer Flow (Behoben)                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. User ändert Name                                                         │
│ 2. PATCH /esp/devices/{id} → DB aktualisiert (name)                        │
│ 3. Server erkennt: hardware_type == "MOCK_ESP32"                           │
│ 4. Server triggert: scheduler.trigger_heartbeat(esp_id)                    │
│    → MQTT Heartbeat → HeartbeatHandler:                                    │
│      a. update_status() → last_seen aktualisiert                           │
│      b. WebSocket Broadcast "esp_health"                                   │
│ 5. Frontend empfängt WebSocket Event → Store aktualisiert                  │
│ 6. Card zeigt "Aktuell" ✅                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Änderung in** [esp.py:360-371](El Servador/god_kaiser_server/src/api/v1/esp.py#L360):
```python
# Nach db.commit()

# Für Mock ESPs: Heartbeat triggern (gleicher Flow wie echte ESPs)
# Dies aktualisiert last_seen und sendet WebSocket Broadcast
if device.hardware_type == "MOCK_ESP32":
    try:
        from ..deps import get_simulation_scheduler
        scheduler = get_simulation_scheduler()
        if scheduler.is_mock_active(esp_id):
            await scheduler.trigger_heartbeat(esp_id)
            logger.debug(f"Triggered heartbeat for mock {esp_id} after update")
    except Exception as e:
        # Non-critical: Log but don't fail the update
        logger.debug(f"Could not trigger heartbeat for {esp_id}: {e}")
```

### Vorteile gegenüber Frontend-Lösung

| Aspekt | Frontend-Fix | Server-Fix ✅ |
|--------|-------------|--------------|
| **Flow-Konsistenz** | Extra API-Call | Gleicher Flow wie echte ESPs |
| **Frontend-Logik** | Muss wissen "ist Mock?" | Keine Änderung nötig |
| **API-Calls** | 2 Calls (PATCH + triggerHeartbeat) | 1 Call (PATCH) |
| **Zentralisierung** | Logik im Frontend | Logik im Server |

### Relevante Dateien

| Datei | Änderung |
|-------|----------|
| [esp.py](El Servador/god_kaiser_server/src/api/v1/esp.py#L360) | Heartbeat-Trigger nach PATCH für Mocks |
| [scheduler.py](El Servador/god_kaiser_server/src/services/simulation/scheduler.py#L631) | trigger_heartbeat() Methode |
| [heartbeat_handler.py](El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py#L153) | WebSocket Broadcast |

### Server Neustart erforderlich
Änderungen werden erst nach Neustart wirksam.

---

## Debug-Logs (Referenz)

### Bug 1: Vorher (Fehlerhaft)
```javascript
[ESP API] listDevices: Raw Mock ESP data from debug API:
  - MOCK_DDD0397F: name="undefined", zone_id="test_1"
```

### Bug 1: Nachher (Behoben)
```javascript
[ESP API] listDevices: Raw Mock ESP data from debug API:
  - MOCK_DDD0397F: name="Test Name", zone_id="test_1"
```

### Bug 2: Name-Update erfolgreich, aber "Veraltet"
```javascript
[ESP API] updateDevice: Server response: {
  name: 'Test Name',
  last_heartbeat: '2025-12-30T06:45:16.303000'  // > 2 Min alt
}
// Card zeigt: "Veraltet" weil last_heartbeat alt ist
```

---

## Bug 3: Heartbeat schlägt fehl wenn Mock nach Server-Neustart existiert

### Status: BEHOBEN ✅

### Symptom
- Mock ESP existiert in der Datenbank (Name ändern funktioniert)
- Heartbeat-Button gibt 400 Error: "Simulation for ESP MOCK_XXX is not running"
- Tritt auf nach Server-Neustart oder wenn Mock mit `auto_heartbeat=false` erstellt wurde

```javascript
// Server-Log
[stderr] API error: VALIDATION_ERROR - Validation failed for field 'simulation_state':
Simulation for ESP MOCK_DDD0397F is not running
INFO: POST /api/v1/debug/mock-esp/MOCK_DDD0397F/heartbeat 400 Bad Request

// Frontend Console
POST http://localhost:5173/api/v1/debug/mock-esp/MOCK_DDD0397F/heartbeat 400 (Bad Request)
```

### Root Cause

**Dual-State-Problem:** Mock ESPs haben zwei getrennte Zustände:

1. **DB-State** (`esp_devices` Tabelle):
   - `device_metadata.simulation_state` = "running" oder "stopped"
   - Persistiert auch nach Server-Neustart

2. **Runtime-State** (SimulationScheduler `_runtimes` Dict):
   - In-Memory, geht bei Server-Neustart verloren
   - `is_mock_active()` prüft NUR diesen State

**Problem-Flow:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Mock erstellt mit auto_heartbeat=false                                   │
│    → simulation_state="stopped" in DB                                       │
│    → Keine Simulation gestartet                                             │
│                                                                             │
│ ODER                                                                        │
│                                                                             │
│ 2. Server-Neustart                                                          │
│    → recover_mocks() sucht simulation_state="running"                       │
│    → Mock mit "stopped" wird NICHT recovered                                │
│    → _runtimes ist leer für diesen Mock                                     │
│                                                                             │
│ 3. User klickt Heartbeat-Button                                             │
│    → trigger_heartbeat() prüft is_mock_active()                             │
│    → is_mock_active() checkt nur _runtimes (In-Memory)                      │
│    → Return False → 400 Error                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Lösung: Auto-Start bei Heartbeat-Trigger

Der `trigger_heartbeat` Endpoint startet jetzt automatisch die Simulation, wenn:
1. Mock in DB existiert
2. Simulation nicht aktiv

**Änderung in** [debug.py:575-636](El Servador/god_kaiser_server/src/api/v1/debug.py#L575):
```python
async def trigger_heartbeat(..., db: DBSession):
    # Check if mock is active
    if not scheduler.is_mock_active(esp_id):
        logger.debug(f"[HEARTBEAT] Simulation not active for {esp_id}, checking DB...")

        # Check if mock exists in database
        esp_repo = ESPRepository(db)
        device = await esp_repo.get_mock_device(esp_id)

        if device is None:
            raise ESPNotFoundError(esp_id)

        # Mock exists in DB but simulation not running - auto-start it
        logger.info(f"[HEARTBEAT] Auto-starting simulation for {esp_id} (found in DB)")

        # Get config from device metadata
        heartbeat_interval = esp_repo.get_heartbeat_interval(device)

        # Start simulation
        success = await scheduler.start_mock(
            esp_id=esp_id,
            kaiser_id=device.kaiser_id or "god",
            zone_id=device.zone_id or "",
            heartbeat_interval=heartbeat_interval
        )

        if success:
            # Update simulation_state in DB to 'running'
            await esp_repo.update_simulation_state(esp_id, "running")
            device.status = "online"
            await db.commit()
            logger.info(f"[HEARTBEAT] Simulation auto-started for {esp_id}")

    # Continue with normal heartbeat trigger...
```

### Vorteile dieser Lösung

| Aspekt | Vorher | Nachher ✅ |
|--------|--------|-----------|
| **UX** | 400 Error, User verwirrt | Heartbeat funktioniert immer |
| **Konsistenz** | DB ≠ Runtime State | States werden synchronisiert |
| **Recovery** | Manuelles Start nötig | Automatisch bei erster Interaktion |
| **Backward-Compat** | - | Bestehende Mocks funktionieren sofort |

### Relevante Dateien

| Datei | Änderung |
|-------|----------|
| [debug.py:575-636](El Servador/god_kaiser_server/src/api/v1/debug.py#L575) | Auto-Start bei Heartbeat wenn Mock in DB aber nicht aktiv |
| [esp_repo.py:400](El Servador/god_kaiser_server/src/db/repositories/esp_repo.py#L400) | `simulation_state` wird bei Erstellung gesetzt |
| [scheduler.py:405-472](El Servador/god_kaiser_server/src/services/simulation/scheduler.py#L405) | `recover_mocks()` - Recovery-Logik |

### Server Neustart erforderlich
Änderungen werden erst nach Neustart wirksam.

---

## Architektur-Hinweis: Dual-State-Problem bei Mock ESPs

Mock ESPs haben zwei getrennte Zustände:

1. **DB-State (Persistent):**
   - `ESPDevice` in `esp_devices` Tabelle
   - `device_metadata.simulation_state` = "running" | "stopped"
   - Überlebt Server-Neustart

2. **Runtime-State (In-Memory):**
   - `SimulationScheduler._runtimes` Dict
   - Enthält `MockESPRuntime` Objekte
   - Geht bei Server-Neustart verloren

**Wichtig für zukünftige Entwicklung:**
- Immer beide States berücksichtigen
- Bei Operationen prüfen: Existiert in DB? Ist Simulation aktiv?
- Recovery-Mechanismus nutzt `simulation_state="running"` als Trigger

---

## Bug 4: Freshness-Indikator (Info-Punkt) wechselt bei Name-Änderung

### Status: BEHOBEN ✅

### Symptom
- User ändert Namen eines Mock ESP über Inline-Editing
- Der Freshness-Indikator (Info-Punkt) wechselt kurzzeitig auf "Veraltet" oder "Unbekannt"
- Nach einem manuellen Heartbeat oder Page-Refresh ist der Status wieder korrekt

### Root Cause

**Frontend WebSocket Handler ignoriert `last_seen` Feld:**

Der MOCK-FIX in `esp.py` sendet einen WebSocket Broadcast mit:
```python
await ws_manager.broadcast("esp_health", {
    "esp_id": esp_id,
    "status": "online",
    "last_seen": device.last_seen.isoformat(),  # ISO String!
    "name": device.name,
})
```

Aber `handleEspHealth()` im ESP Store suchte nur nach `timestamp` (Unix Seconds):
```typescript
// ALT (fehlerhaft):
if (data.timestamp) device.last_seen = new Date(data.timestamp * 1000).toISOString()
// → last_seen aus MOCK-FIX wird ignoriert!
```

**Zusätzliches Problem:** ESPCard prüft `last_heartbeat` ZUERST:
```typescript
const timestamp = props.esp.last_heartbeat || props.esp.last_seen
```

Da `last_heartbeat` nie durch den MOCK-FIX aktualisiert wurde, zeigte ESPCard den alten Wert.

### Lösung: Frontend WebSocket Handler erweitert

**Änderung in** [esp.ts:524-579](El Frontend/src/stores/esp.ts#L524):
```typescript
function handleEspHealth(message: any): void {
  const data = message.data
  const espId = data.esp_id || data.device_id

  if (!espId) return

  const device = devices.value.find(d => getDeviceId(d) === espId)
  if (device) {
    // ... health metrics ...

    // Handle last_seen from either source:
    // - timestamp: Unix seconds from heartbeat handler (MQTT)
    // - last_seen: ISO string from MOCK-FIX (esp.py PATCH)
    let newLastSeen: string | null = null
    if (data.timestamp) {
      newLastSeen = new Date(data.timestamp * 1000).toISOString()
    } else if (data.last_seen) {
      newLastSeen = data.last_seen
    }

    if (newLastSeen) {
      device.last_seen = newLastSeen
      // Also update last_heartbeat since ESPCard uses it for freshness
      device.last_heartbeat = newLastSeen
    }

    // Update status if provided (from MOCK-FIX or heartbeat)
    if (data.status !== undefined) {
      device.status = data.status
    }

    // Update name if provided (from MOCK-FIX broadcast)
    if (data.name !== undefined) {
      device.name = data.name
    }
  }
}
```

### Vollständiger Flow nach Fix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Neuer Flow (Behoben)                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. User ändert Name in ESPCard.vue                                          │
│ 2. saveName() → espStore.updateDevice()                                     │
│ 3. espApi.updateDevice() → PATCH /esp/devices/{id}                         │
│ 4. Server esp.py: Updates DB + MOCK-FIX für Mock ESPs:                     │
│    a. device.last_seen = datetime.now(UTC)                                 │
│    b. device.status = "online"                                             │
│    c. WebSocket broadcast("esp_health", {last_seen, status, name})         │
│ 5. Frontend: handleEspHealth() empfängt Broadcast                           │
│    a. Erkennt last_seen (ISO String) ODER timestamp (Unix)                 │
│    b. Aktualisiert device.last_seen UND device.last_heartbeat              │
│    c. Aktualisiert device.status und device.name                           │
│ 6. ESPCard.vue: dataFreshness computed property re-evaluiert               │
│    → Nutzt jetzt aktuelles last_heartbeat → zeigt "Live" oder "Aktuell" ✅ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vorteile der Lösung

| Aspekt | Vorher | Nachher ✅ |
|--------|--------|-----------:|
| **last_seen Handling** | Nur timestamp (Unix) | timestamp ODER last_seen (ISO) |
| **last_heartbeat** | Nicht aktualisiert | Synchron mit last_seen |
| **ESPCard Freshness** | Zeigt alten Wert | Zeigt korrekten Status |
| **WebSocket Payload** | Teilweise ignoriert | Vollständig verarbeitet |

### Relevante Dateien

| Datei | Änderung |
|-------|----------|
| [esp.ts:524-579](El Frontend/src/stores/esp.ts#L524) | `handleEspHealth()` erweitert für last_seen (ISO) + last_heartbeat sync |
| [ESPCard.vue:306-308](El Frontend/src/components/esp/ESPCard.vue#L306) | Nutzt last_heartbeat \|\| last_seen (unverändert) |
| [esp.py:375-380](El Servador/god_kaiser_server/src/api/v1/esp.py#L375) | MOCK-FIX sendet last_seen als ISO (unverändert) |

### Kein Server-Neustart erforderlich
Frontend-Änderung wird via HMR (Hot Module Replacement) sofort übernommen.

---

## Info: Server-Log-Meldungen (Referenz)

### Normale Startup-Meldungen

Diese Meldungen sind **KEIN Bug** - sie zeigen erwartetes Verhalten:

```
⚠️ Orphaned Mock detected: MOCK_XXXXXX - State was 'running' but no active simulation found. Set to 'stopped'.
```
**Bedeutung:** Mock war in DB als "running" markiert, aber Server hatte keinen aktiven Scheduler-Job. Passiert nach Server-Neustart. Der Mock wird automatisch auf "stopped" gesetzt.

```
Device MOCK_XXXXXX timed out. Last seen: 2025-12-30 20:27:57
[monitor] health_check_esps: 3 ESP(s) timed out
```
**Bedeutung:** Health-Check erkennt, dass Mocks keine Heartbeats senden (weil Simulation nicht aktiv). Normal für Mocks mit `auto_heartbeat=false` oder nach Server-Neustart.

```
SECURITY: Using default JWT secret key (OK for development only).
MQTT TLS is disabled.
```
**Bedeutung:** Entwicklungsumgebung-Warnungen. In Produktion müssen `JWT_SECRET_KEY` und `MQTT_USE_TLS` konfiguriert werden.

### Wann sind Logs problematisch?

| Log-Pattern | Status | Aktion |
|-------------|--------|--------|
| `RuntimeError: Queue bound to different event loop` | ❌ Bug | Siehe Bug O unten |
| `Handler returned False` | ⚠️ Prüfen | Traceback analysieren |
| `MQTT connection lost` | ⚠️ Prüfen | Mosquitto-Dienst prüfen |
| `Database connection failed` | ❌ Kritisch | PostgreSQL prüfen |

---

## Bug O: Event-Loop-Konflikt im MQTT-Subscriber (Python 3.12+)

### Status: BEOBACHTET ⚠️

### Symptom
Server startet normal, aber nach einiger Zeit erscheinen Fehler:
```
RuntimeError: Queue bound to different event loop
```
oder
```
RuntimeError: This event loop is already running
```

### Root Cause (Vermutung)
Der MQTT-Subscriber läuft in einem Thread-Pool (`MQTT_SUBSCRIBER_MAX_WORKERS`). Bei Python 3.12+ gibt es strengere Prüfungen für Event-Loop-Binding. Wenn ein Handler versucht, auf eine Queue zuzugreifen, die in einem anderen Event-Loop erstellt wurde, kommt es zum Fehler.

### Betroffene Dateien
- [subscriber.py](El Servador/god_kaiser_server/src/mqtt/subscriber.py) - Thread-Pool für Handler
- [scheduler.py](El Servador/god_kaiser_server/src/services/simulation/scheduler.py) - APScheduler Jobs

### Workaround
Server neu starten. Der Fehler tritt sporadisch auf und verschwindet nach Neustart.

### Langfristige Lösung (TODO)
1. Prüfen ob alle async Queues im Main-Event-Loop erstellt werden
2. APScheduler auf `AsyncIOScheduler` umstellen
3. Thread-Pool durch `asyncio.to_thread()` ersetzen

### Reproduktion
Schwer reproduzierbar - tritt nach längerer Laufzeit oder hoher Last auf.
