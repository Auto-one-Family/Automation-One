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
