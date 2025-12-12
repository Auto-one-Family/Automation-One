# El Frontend - Bug-Dokumentation für KI-Agenten

> **Zweck:** Diese Dokumentation erklärt gefundene Bugs so, dass KI-Agenten den Systemkontext verstehen und ähnliche Probleme selbständig lösen können.

---

## Architektur-Kontext

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (localhost:5173)                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Vue 3 Frontend (Vite Dev Server)                        │   │
│  │  - REST: axios → /api/... → Vite Proxy → Backend        │   │
│  │  - WebSocket: direkt → ws://localhost:8000/api/v1/ws/...│   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                    Vite Proxy (nur /api)
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Backend (localhost:8000)                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  REST API: /api/v1/debug/mock-esp/...                   │   │
│  │  WebSocket: /api/v1/ws/realtime/{client_id}             │   │
│  │  MQTT: Mosquitto Broker (localhost:1883)                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Wichtige Pfad-Mappings

| Frontend ruft auf | Vite Proxy leitet zu | Backend erwartet |
|-------------------|---------------------|------------------|
| `/api/v1/debug/mock-esp` | `http://localhost:8000/api/v1/debug/mock-esp` | Router mit `prefix="/v1/debug"` |
| `/api/v1/auth/login` | `http://localhost:8000/api/v1/auth/login` | Router mit `prefix="/v1/auth"` |

### WebSocket-Besonderheit
WebSocket-Verbindungen gehen **NICHT** durch den Vite Proxy wenn sie direkt mit `ws://` erstellt werden. Sie müssen explizit auf `localhost:8000` zeigen.

---

## Bug #1: 404 Not Found beim "Add Sensor" (GELÖST)

### Symptom
```
POST http://localhost:5173/api/v1/debug/mock-esp/ESP_406149A0/sensors 404 (Not Found)
```

### Workflow der den Bug auslöst
```
1. User klickt "Add Sensor" Button im MockEspDetailView
2. MockEspDetailView.vue:79 → addSensor()
3. stores/mockEsp.ts:126 → addSensor()
4. api/debug.ts:129 → POST /debug/mock-esp/{esp_id}/sensors
5. Axios sendet zu /api/v1/debug/mock-esp/{esp_id}/sensors
6. Vite Proxy leitet zu Backend
7. Backend findet keine Route → 404
```

### Root Cause
**Router-Prefix Mismatch:**

```python
# El Servador/god_kaiser_server/src/api/v1/debug.py (VORHER - FALSCH)
router = APIRouter(prefix="/debug", tags=["Debug"])

# main.py bindet ein mit:
app.include_router(debug.router, prefix="/api/v1")

# Resultat: /api/v1/debug/mock-esp (DOPPELTES v1 fehlt!)
```

### Fix angewandt
```python
# El Servador/god_kaiser_server/src/api/v1/debug.py (NACHHER - KORREKT)
router = APIRouter(prefix="/v1/debug", tags=["Debug"])

# Resultat: /api/v1/debug/mock-esp ✓
```

### Betroffene Dateien
- `El Servador/god_kaiser_server/src/api/v1/debug.py` (Zeile 36)

### Wie KI diesen Bug erkennt
1. 404 Error in Browser Console
2. Pfad enthält `/api/v1/`
3. Prüfe: Wie ist der Router in `main.py` eingebunden?
4. Prüfe: Welchen `prefix` hat der Router selbst?
5. Addiere beide Prefixes - stimmt das mit dem API-Call überein?

---

## Bug #2: WebSocket 403 Forbidden (GELÖST)

### Symptom
```
WebSocket connection to 'ws://localhost:5173/ws/realtime/frontend_1735000000000?token=...' failed
```

### Workflow der den Bug auslöst
```
1. User öffnet MqttLogView
2. MqttLogView.vue:171 → onMounted() → connect()
3. connect() erstellt WebSocket mit window.location.host (5173!)
4. Browser versucht ws://localhost:5173/ws/...
5. Vite hat keinen WebSocket-Handler für diesen Pfad → 403
```

### Root Cause
**Zwei Probleme:**

1. **Falscher Host:** Frontend verwendete `window.location.host` (localhost:5173) statt Backend (localhost:8000)

2. **Falscher Pfad:** WebSocket-Endpoint ist `/api/v1/ws/realtime/...`, Code verwendete `/ws/realtime/...`

```typescript
// VORHER - FALSCH
const wsUrl = `ws://${window.location.host}/ws/realtime/${clientId}?token=${token}`
// → ws://localhost:5173/ws/realtime/... (Frontend-Port, falscher Pfad)

// NACHHER - KORREKT
const apiHost = import.meta.env.VITE_API_HOST || 'localhost:8000'
const wsUrl = `ws://${apiHost}/api/v1/ws/realtime/${clientId}?token=${token}`
// → ws://localhost:8000/api/v1/ws/realtime/... (Backend-Port, korrekter Pfad)
```

### Betroffene Dateien
- `El Frontend/src/views/MqttLogView.vue` (Zeilen 62-65)

### Wie KI diesen Bug erkennt
1. WebSocket Error (403 oder Connection Failed)
2. Prüfe URL: Zeigt sie auf Frontend-Port (5173)?
3. Prüfe Pfad: Stimmt er mit Backend-Route überein?
4. WebSocket geht NICHT durch Vite Proxy - muss direkt zum Backend!

---

## Bug #3: MockESP32Client.set_sensor_value() TypeError (GELÖST)

### Symptom
```
TypeError: MockESP32Client.set_sensor_value() got an unexpected keyword argument 'raw_mode'
```

### Workflow der den Bug auslöst
```
1. User klickt "Add Sensor" Button
2. Frontend POST /debug/mock-esp/{esp_id}/sensors
3. Backend: debug.py:add_sensor() → manager.add_sensor()
4. mock_esp_manager.py:261 → mock.set_sensor_value(..., raw_mode=config.raw_mode)
5. MockESP32Client.set_sensor_value() akzeptiert raw_mode nicht → TypeError
```

### Root Cause
**Schema-Method Mismatch:**

Der MockSensorConfig im Schema hat `raw_mode: bool`, aber MockESP32Client.set_sensor_value() akzeptierte diesen Parameter nicht.

```python
# El Servador/.../schemas/debug.py
class MockSensorConfig(BaseModel):
    raw_mode: bool = True  # ← Existiert im Schema

# El Servador/.../services/mock_esp_manager.py
mock.set_sensor_value(
    ...
    raw_mode=sensor_cfg.raw_mode  # ← Wird übergeben
)

# El Servador/.../tests/esp32/mocks/mock_esp32_client.py (VORHER)
def set_sensor_value(self, gpio, raw_value, ...):  # ← raw_mode fehlte!
```

### Fix angewandt
```python
# mock_esp32_client.py (NACHHER)
def set_sensor_value(
    self,
    gpio: int,
    raw_value: float,
    sensor_type: str = "analog",
    name: str = "",
    unit: str = "",
    quality: str = "good",
    library_name: str = "",
    subzone_id: Optional[str] = None,
    calibration: Optional[Dict[str, float]] = None,
    processed_value: Optional[float] = None,
    is_multi_value: bool = False,
    secondary_values: Optional[Dict[str, float]] = None,
    raw_mode: bool = False  # ← HINZUGEFÜGT
):
```

### Betroffene Dateien
- `El Servador/god_kaiser_server/tests/esp32/mocks/mock_esp32_client.py` (Zeilen 1266-1318)

### Wie KI diesen Bug erkennt
1. TypeError mit "unexpected keyword argument"
2. Finde wo der Call herkommt (Stack Trace)
3. Vergleiche Schema-Felder mit Method-Signatur
4. Fehlende Parameter zur Method hinzufügen

---

## Bug #4: AttributeError 'str' has no attribute 'value' (GELÖST)

### Symptom
```
AttributeError: 'str' object has no attribute 'value'
```

### Workflow der den Bug auslöst
```
1. User ändert System State im MockESP Detail View
2. Frontend POST /debug/mock-esp/{esp_id}/state mit body: {"state": "SAFE_MODE"}
3. Backend: debug.py:set_state() → manager.set_state(esp_id, request.state, ...)
4. mock_esp_manager.py:357 → state.value  ← CRASH!
```

### Root Cause
**Pydantic v2 Enum-Handling:**

In Pydantic v2 kann ein `str, Enum` Union-Typ manchmal als String ankommen statt als Enum. Der Code nahm an, dass `state` immer ein Enum mit `.value` Attribut ist.

```python
# Schema definiert:
class MockSystemState(str, Enum):
    SAFE_MODE = "SAFE_MODE"
    OPERATIONAL = "OPERATIONAL"
    ...

class StateTransitionRequest(BaseModel):
    state: MockSystemState  # ← Kann als str ODER Enum ankommen!

# VORHER - FALSCH
if state == MockSystemState.SAFE_MODE:  # Funktioniert nicht wenn state ein str ist
    ...
target_state = SystemState[state.value]  # ← CRASH wenn state ein str ist
```

### Fix angewandt
```python
# mock_esp_manager.py (NACHHER)
# Handle both string and enum input
state_value = state.value if hasattr(state, 'value') else str(state)
target_state = SystemState[state_value]

if state_value == "SAFE_MODE":
    mock.enter_safe_mode(reason or "manual")
elif state_value == "OPERATIONAL" and mock.system_state == SystemState.SAFE_MODE:
    mock.exit_safe_mode()
else:
    mock._transition_state(target_state)
```

### Betroffene Dateien
- `El Servador/god_kaiser_server/src/services/mock_esp_manager.py` (Zeilen 356-365)

### Wie KI diesen Bug erkennt
1. AttributeError mit `.value` auf einem str
2. Prüfe: Ist der Parameter ein `str, Enum` Union?
3. Pydantic v2 kann beides liefern → defensiv programmieren
4. Pattern: `x.value if hasattr(x, 'value') else str(x)`

---

## Bug-Pattern Zusammenfassung

| Bug-Typ | Erkennungsmuster | Lösung |
|---------|------------------|--------|
| **404 Not Found** | Pfad stimmt nicht mit Router-Prefix | Addiere alle Prefixes: main.py + router |
| **WebSocket 403** | WS geht an Frontend-Port | WS direkt an Backend (8000), mit /api/v1 Prefix |
| **Unexpected Kwarg** | Schema hat Feld, Method nicht | Parameter zur Method-Signatur hinzufügen |
| **str has no .value** | Pydantic Enum als str | `hasattr(x, 'value')` Check verwenden |

---

## Debugging-Checkliste für KI-Agenten

### Bei HTTP 404:
1. [ ] Frontend API-Call Pfad prüfen (`/api/v1/...`)
2. [ ] Vite Proxy Config prüfen (`vite.config.ts`)
3. [ ] Backend Router Prefix prüfen (`router = APIRouter(prefix="...")`)
4. [ ] main.py include_router Prefix prüfen

### Bei WebSocket Fehler:
1. [ ] Geht WS an Backend-Port (8000), nicht Frontend (5173)?
2. [ ] Hat WS-URL den korrekten Pfad (`/api/v1/ws/...`)?
3. [ ] Ist JWT-Token im Query-Parameter?
4. [ ] Ist Backend WebSocket-Router registriert?

### Bei TypeError/AttributeError:
1. [ ] Stack Trace analysieren - wo ist der Ursprung?
2. [ ] Schema vs. Method-Signatur vergleichen
3. [ ] Pydantic v2 Enum-Handling beachten
4. [ ] Defensive Programmierung für Union-Types

---

**Letzte Aktualisierung:** 2024-12-XX
**Gefundene & Gelöste Bugs:** 4
