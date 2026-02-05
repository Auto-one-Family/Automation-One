# ESP32 DEV: HTTP Timeout Fix Report

**Agent:** esp32-dev
**Datum:** 2026-02-05
**Status:** FIX IMPLEMENTIERT

---

## 1. System-Analyse

### Was macht PiEnhancedProcessor?

Der `PiEnhancedProcessor` ist die Schnittstelle zwischen ESP32 und dem God-Kaiser Server für Sensor-Datenverarbeitung:

```
ESP32 (Raw ADC/I2C) → HTTP POST → Server (Processing) → HTTP Response → ESP32 (Processed Value)
```

**Zweck:**
- Sendet Rohdaten (ADC-Wert, I2C-Bytes) an den Server
- Server verarbeitet mit Sensor-Library (Kalibrierung, Umrechnung)
- Empfängt verarbeitete Werte (z.B. 23.4°C statt Raw 23349)

**Dateien:**
- [pi_enhanced_processor.cpp](El Trabajante/src/services/sensor/pi_enhanced_processor.cpp)
- [pi_enhanced_processor.h](El Trabajante/src/services/sensor/pi_enhanced_processor.h)
- [http_client.cpp](El Trabajante/src/services/communication/http_client.cpp)
- [http_client.h](El Trabajante/src/services/communication/http_client.h)

### Circuit Breaker Pattern (Phase 6+)

Der PiEnhancedProcessor hat bereits Fallback-Logik implementiert:

| Zustand | Verhalten |
|---------|-----------|
| CLOSED | Normale HTTP-Requests zum Server |
| OPEN (nach 5 Failures) | Lokaler Fallback: RAW-Wert mit `unit="raw"`, `quality="fair"` |
| HALF_OPEN (nach 60s) | Test-Request zum Server |

**Fallback-Logik (Zeile 102-115):**
```cpp
// Server unavailable → use local fallback processing
processed_out.value = (float)data.raw_value;  // RAW value directly
processed_out.unit = "raw";                   // Mark as unprocessed
processed_out.quality = "fair";               // Medium quality (not calibrated)
processed_out.valid = true;
processed_out.error_message = "Local fallback - server unavailable";
return true;  // Success with fallback data
```

---

## 2. Bug-Analyse

### Symptom (Serial Log)

```
21:18:42.588 > PiEnhancedProcessor: HTTP POST START url=http://192.168.0.194:8000/api/v1/sensors/process
21:18:42.605 > PiEnhancedProcessor: HTTP POST payload={"esp_id":"ESP_472204"...
[... 50 Sekunden STILLE ...]
21:19:32.513 > E (88838) task_wdt: Task watchdog got triggered.
```

### Root Cause

**Problem:** `WiFiClient.connect(host, port)` blockiert unbegrenzt.

In [http_client.cpp:235](El Trabajante/src/services/communication/http_client.cpp#L235) (vor Fix):

```cpp
// Connect to server
if (!wifi_client_.connect(host, port)) {  // ← BLOCKIERT UNBEGRENZT!
    // ...
}

// Set timeout
wifi_client_.setTimeout(timeout_ms);  // ← ZU SPÄT!
```

**Warum blockiert es?**
- `WiFiClient.connect()` ohne Timeout-Parameter wartet auf TCP-Handshake
- Wenn Server nicht antwortet (Firewall, Server nicht gestartet): **unendliche Blockierung**
- Der `setTimeout()` wird erst NACH dem connect gesetzt → hilft nicht beim Verbindungsaufbau

**Konsequenz:**
- Task blockiert >50 Sekunden
- Watchdog wird nicht gefüttert
- Watchdog-Timeout triggert System-Reset

---

## 3. Implementierter Fix

**Datei:** [http_client.cpp](El Trabajante/src/services/communication/http_client.cpp)
**Zeile:** 234-247

### Vorher (blockierend)

```cpp
// Connect to server
if (!wifi_client_.connect(host, port)) {
    strncpy(response.error_message, "Connection failed", ...);
    errorTracker.trackError(ERROR_HTTP_REQUEST_FAILED, ...);
    return response;
}

// Set timeout
wifi_client_.setTimeout(timeout_ms);
```

### Nachher (mit Timeout)

```cpp
// Set read timeout BEFORE connect (used by connect() internally on ESP32)
wifi_client_.setTimeout(timeout_ms);

// Connect to server WITH TIMEOUT (ESP32 WiFiClient supports connect(host, port, timeout_ms))
// This prevents indefinite blocking when server is unreachable
yield();  // Feed watchdog before potentially blocking operation
if (!wifi_client_.connect(host, port, timeout_ms)) {
    snprintf(response.error_message, sizeof(response.error_message) - 1,
            "Connection failed (timeout %dms)", timeout_ms);
    errorTracker.trackError(ERROR_HTTP_REQUEST_FAILED, ERROR_SEVERITY_ERROR,
                           "HTTP connection failed/timeout");
    return response;
}
yield();  // Feed watchdog after connect
```

### Änderungen

| Aspekt | Vorher | Nachher |
|--------|--------|---------|
| Connection-Timeout | ❌ Keiner (unendlich) | ✅ timeout_ms (2500ms default) |
| setTimeout Position | Nach connect() | Vor connect() |
| Watchdog-Fütterung | ❌ Keine | ✅ yield() vor/nach connect |
| Error-Message | Generic | Mit Timeout-Info |

### Effektiver Timeout-Pfad

```
PiEnhancedProcessor::sendRawData()
    └── http_client_->post(..., 2500ms)  // timeout_ms = 2500
        └── sendRequest(..., 2500ms)
            └── wifi_client_.connect(host, port, 2500)  // ✅ MAX 2.5s blockieren
```

---

## 4. Server-Anforderung (für server-dev Agent)

### Endpoint

```
POST /api/v1/sensors/process
```

**Datei:** [sensor_processing.py](El Servador/god_kaiser_server/src/api/sensor_processing.py)

### Request-Payload (ESP32 → Server)

```json
{
    "esp_id": "ESP_472204",
    "gpio": 21,
    "sensor_type": "sht31_temp",
    "raw_value": 23349,
    "timestamp": 30127,
    "metadata": {}
}
```

### Erwartete Response (Server → ESP32)

```json
{
    "success": true,
    "processed_value": 23.4,
    "unit": "°C",
    "quality": "good",
    "processing_time_ms": 2.15,
    "metadata": {}
}
```

### Response-Parsing (ESP32)

Der ESP32 erwartet diese JSON-Felder (Zeile 248-302):
- `"processed_value":` → float value
- `"unit":"` → String unit
- `"quality":"` → String quality
- `"timestamp":` → optional, int timestamp

### Authentifizierung

**Achtung:** Der Server erwartet `X-API-Key` Header!

```python
api_key: Annotated[str, Depends(verify_api_key)],
```

**TODO:** Der HTTPClient sendet aktuell **keinen API-Key**. Dies muss geprüft werden:
1. Ist der Endpoint ohne Auth erreichbar? (Development Mode)
2. Muss API-Key im HTTPClient hinzugefügt werden?

---

## 5. Verifikation

### Build-Test

```bash
cd "El Trabajante" && pio run
```

### Erwartetes Verhalten nach Fix

| Szenario | Vorher | Nachher |
|----------|--------|---------|
| Server erreichbar | OK | OK |
| Server nicht gestartet | Watchdog-Crash nach 50s | Timeout nach 2.5s, Circuit Breaker |
| Server Firewall blockiert | Watchdog-Crash | Timeout nach 2.5s, Circuit Breaker |
| Netzwerk-Ausfall | Watchdog-Crash | Timeout nach 2.5s, Circuit Breaker |

### Log nach Fix (erwartet)

```
21:18:42.588 > PiEnhancedProcessor: HTTP POST START url=http://192.168.0.194:8000/...
21:18:45.100 > PiEnhancedProcessor: HTTP POST END duration=2512ms success=NO
21:18:45.101 > ERROR: PiEnhancedProcessor: HTTP request failed - Connection failed (timeout 2500ms)
21:18:45.102 > PiEnhancedProcessor: Using local fallback processing - returning raw values
```

---

## 6. Zusammenfassung

| Status | Beschreibung |
|--------|--------------|
| ✅ Root Cause | `WiFiClient.connect()` ohne Timeout blockiert unbegrenzt |
| ✅ Fix | Connection-Timeout via `connect(host, port, timeout_ms)` |
| ✅ Watchdog | `yield()` vor/nach blocking operation |
| ⚠️ Prüfen | API-Key Authentifizierung am Server-Endpoint |
| ⏳ Verifizieren | Build + Funktionstest mit Server offline |

---

**Fix-Status:** IMPLEMENTIERT
**Nächster Schritt:** Build verifizieren, dann mit Server offline testen
