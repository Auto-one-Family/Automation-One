# HTTP API - Real-Time Sensor Processing

## Overview

High-performance HTTP endpoint for ESP32 raw sensor data processing.

**Target Latency**: <10ms on local network  
**Authentication**: API Key (X-API-Key header)  
**Rate Limit**: 100 requests/minute per API key  
**Protocol**: HTTP/1.1 with JSON payloads

---

## Endpoint

```
POST /api/v1/sensors/process
```

### Authentication

Include API key in request header:

```http
X-API-Key: esp_your_api_key_here
```

**Production**: API keys are validated against database  
**Development**: Debug mode allows requests without key

### Request

**Content-Type**: `application/json`

```json
{
  "esp_id": "ESP_12AB34CD",
  "gpio": 34,
  "sensor_type": "ph",
  "raw_value": 2150,
  "calibration": {
    "slope": -3.5,
    "offset": 21.34
  },
  "params": {
    "temperature_compensation": 25.0,
    "decimal_places": 2
  },
  "timestamp": 1735818000
}
```

**Required Fields**:
- `esp_id`: ESP device ID (format: `ESP_XXXXXXXX`)
- `gpio`: GPIO pin (0-39)
- `sensor_type`: Sensor type identifier (`ph`, `temperature`, etc.)
- `raw_value`: Raw ADC value (0-4095 for ESP32)

**Optional Fields**:
- `calibration`: Sensor-specific calibration data
- `params`: Processing parameters
- `timestamp`: Unix timestamp (seconds)

### Response

**Success (200 OK)**:

```json
{
  "success": true,
  "processed_value": 7.2,
  "unit": "pH",
  "quality": "good",
  "processing_time_ms": 8.5,
  "metadata": {
    "voltage": 1.75,
    "calibrated": true
  }
}
```

**Error (400/404/500)**:

```json
{
  "detail": "No processor found for sensor type 'invalid_sensor'"
}
```

---

## Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | Success | Processing completed successfully |
| 400 | Bad Request | Invalid request format or parameters |
| 401 | Unauthorized | Missing or invalid API key |
| 404 | Not Found | Sensor processor not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Error | Server-side processing error |

---

## Quality Indicators

| Quality | Description |
|---------|-------------|
| `excellent` | Perfect measurement, no deviations |
| `good` | Good measurement, minimal deviations |
| `fair` | Acceptable measurement, moderate deviations |
| `poor` | Borderline measurement, high deviations |
| `bad` | Invalid measurement, out of range |
| `error` | Processing failed |

---

## Supported Sensor Types

Get list of available sensors:

```http
GET /api/v1/sensors/types
X-API-Key: esp_your_api_key_here
```

**Current Support**:
- `ph` - pH sensors (analog)
- `temperature` - Temperature sensors
- `humidity` - Humidity sensors
- `ec` - Electrical conductivity
- `moisture` - Soil moisture
- `pressure` - Pressure sensors
- `co2` - CO2 sensors
- `light` - Light intensity
- `flow` - Flow rate sensors

---

## ESP32 Integration

### Arduino Code Example

```cpp
#include <HTTPClient.h>
#include <ArduinoJson.h>

void sendSensorData(float raw_value) {
    HTTPClient http;
    
    // Configure endpoint
    http.begin("http://192.168.1.100:8000/api/v1/sensors/process");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", "esp_your_api_key_here");
    
    // Build JSON payload
    StaticJsonDocument<512> doc;
    doc["esp_id"] = "ESP_12AB34CD";
    doc["gpio"] = 34;
    doc["sensor_type"] = "ph";
    doc["raw_value"] = raw_value;
    doc["timestamp"] = millis();
    
    String payload;
    serializeJson(doc, payload);
    
    // Send POST request
    int httpCode = http.POST(payload);
    
    if (httpCode == 200) {
        String response = http.getString();
        
        // Parse response
        StaticJsonDocument<512> responseDoc;
        deserializeJson(responseDoc, response);
        
        float processed_value = responseDoc["processed_value"];
        const char* unit = responseDoc["unit"];
        const char* quality = responseDoc["quality"];
        
        Serial.printf("Processed: %.2f %s (quality: %s)\\n", 
                     processed_value, unit, quality);
    } else {
        Serial.printf("HTTP Error: %d\\n", httpCode);
    }
    
    http.end();
}
```

---

## Performance Characteristics

### Latency Benchmarks

| Network | Latency (avg) | Latency (p99) |
|---------|---------------|---------------|
| Local (Ethernet) | 5ms | 12ms |
| Local (WiFi) | 8ms | 18ms |
| Internet | 50-200ms | 500ms |

### Throughput

- **Single ESP32**: 100 req/min (rate limit)
- **100 ESP32s**: 10,000 req/min (with 100 workers)
- **Database writes**: 1,000 writes/sec (PostgreSQL)

### Scaling

**Small Systems (1-10 ESPs)**:
- Default config works out-of-box
- No tuning needed

**Medium Systems (10-50 ESPs)**:
- Increase subscriber `max_workers` to 20
- Enable Redis for rate limiting

**Large Systems (50+ ESPs)**:
- Use load balancer (multiple server instances)
- PostgreSQL connection pooling (pool_size=20)
- Redis rate limiting + caching

---

## Security

### API Key Management

**Generate API Key**:
```bash
# Production: Store in database
import secrets
api_key = f"esp_{secrets.token_urlsafe(32)}"
```

**Validate API Key**:
- Production: Database lookup with bcrypt hash
- Development: Simple prefix check (`esp_*`)

### Rate Limiting

- 100 requests per minute per API key
- Prevents DDoS attacks
- Returns 429 with `Retry-After` header

### Input Validation

- Pydantic models validate all inputs
- SQL injection prevention (SQLAlchemy)
- XSS prevention (no HTML rendering)

---

## Monitoring

### Health Check

```http
GET /api/v1/sensors/health
```

**Response**:
```json
{
  "status": "healthy",
  "processors_loaded": 9,
  "available_sensors": ["ph", "temperature", ...]
}
```

### Metrics

**Per-Request Metrics**:
- `processing_time_ms`: Server processing time
- Returns in response body

**System Metrics** (logs):
- Total requests processed
- Success rate
- Average processing time
- Rate limit triggers

---

## Troubleshooting

### "401 Unauthorized"

**Cause**: Missing or invalid API key  
**Solution**: Include valid `X-API-Key` header

### "404 Not Found - No processor found"

**Cause**: Sensor type not supported  
**Solution**: Check `/api/v1/sensors/types` for available types

### "429 Too Many Requests"

**Cause**: Rate limit exceeded (100 req/min)  
**Solution**: Reduce request frequency or request higher limit

### High Latency (>50ms on local network)

**Causes**:
- Database slow queries (check indices)
- Sensor library CPU-intensive (optimize)
- Thread pool exhausted (increase `max_workers`)

**Solutions**:
1. Check database query performance
2. Profile sensor library processing
3. Increase subscriber `max_workers` (default: 10)

---

## Best Practices

### ESP32 Implementation

1. **Connection Pooling**: Reuse HTTP client
2. **Timeout**: Set 5s timeout for HTTP requests
3. **Error Handling**: Retry on failure (max 3 retries)
4. **Circuit Breaker**: Disable HTTP after 5 consecutive failures

### Server Configuration

1. **Worker Threads**: 10-20 for <100 ESPs
2. **Database Pool**: pool_size=10, max_overflow=20
3. **Logging Level**: INFO in production, DEBUG in development
4. **Rate Limits**: 100/min for sensors, 10/min for commands

### Production Deployment

1. **Use HTTPS**: TLS encryption for internet-facing
2. **API Key Rotation**: Rotate keys every 90 days
3. **Database Backups**: Daily backups with 30-day retention
4. **Monitoring**: Prometheus + Grafana for metrics
5. **Load Balancing**: NGINX for >100 ESPs

---

## Future Enhancements

- [ ] WebSocket endpoint for bidirectional real-time
- [ ] Batch processing (multiple sensors in one request)
- [ ] Response caching (Redis)
- [ ] Prometheus metrics export
- [ ] GraphQL API option

---

**Version**: 2.0.0  
**Last Updated**: 2025-01-02

