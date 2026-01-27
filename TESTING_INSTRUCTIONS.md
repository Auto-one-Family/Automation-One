# Hardware Validation Testing Instructions

## Quick Start

### 1. Start the Server

```powershell
cd "El Servador"
poetry run uvicorn god_kaiser_server.src.main:app --reload --host 0.0.0.0 --port 8000
```

**Alternative (if using systemd):**
```bash
sudo systemctl start god_kaiser_server
sudo systemctl status god_kaiser_server
```

### 2. Verify Server is Running

```powershell
# Check if port 8000 is listening
netstat -an | Select-String "8000"

# Or test with curl
curl http://localhost:8000/health
```

### 3. Run Test Suite

```powershell
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one"
powershell -ExecutionPolicy Bypass -File test_hardware_validation.ps1
```

---

## Troubleshooting

### Server Not Running

**Error:** `❌ Server is not running on http://localhost:8000`

**Solution:**
1. Check if server process is running:
   ```powershell
   Get-Process | Where-Object {$_.ProcessName -like "*python*" -or $_.ProcessName -like "*uvicorn*"}
   ```

2. Check server logs:
   ```powershell
   Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Tail 50
   ```

3. Start server manually (see Step 1 above)

### Authentication Failed

**Error:** `❌ Authentication failed`

**Solution:**
1. Check if database is initialized:
   ```powershell
   cd "El Servador"
   poetry run alembic upgrade head
   ```

2. Manually create test user:
   ```powershell
   # Via API (if registration endpoint is open)
   curl -X POST http://localhost:8000/api/v1/auth/register `
     -H "Content-Type: application/json" `
     -d '{
       "username": "testuser",
       "email": "test@test.local",
       "password": "TestP@ss123",
       "full_name": "Test User"
     }'
   ```

3. Or login with existing credentials:
   - Edit `test_hardware_validation.ps1`
   - Change `$Username` and `$Password` in `Get-AuthToken` function

### Database Connection Error

**Error:** Database connection failures in server logs

**Solution:**
1. Check PostgreSQL is running:
   ```powershell
   Get-Service postgresql*
   ```

2. Verify database URL in `.env`:
   ```powershell
   cd "El Servador"
   Get-Content .env | Select-String "DATABASE_URL"
   ```

3. Test database connection:
   ```powershell
   cd "El Servador"
   poetry run python -c "from god_kaiser_server.src.db.session import get_engine; import asyncio; asyncio.run(get_engine())"
   ```

### MQTT Connection Error

**Error:** MQTT connection failures (non-blocking for tests, but may affect config publishing)

**Solution:**
1. Check Mosquitto is running:
   ```powershell
   Get-Service mosquitto
   ```

2. Start Mosquitto if needed:
   ```powershell
   Start-Service mosquitto
   ```

3. Test MQTT connection:
   ```powershell
   # Install mosquitto client tools if needed
   # Test publish
   mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "test message"
   ```

---

## Manual Test Execution

If automated script fails, you can run tests manually:

### 1. Get Authentication Token

```powershell
$loginBody = @{
    username = "testuser"
    password = "TestP@ss123"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$token = $response.access_token
```

### 2. Run Individual Tests

**Test 1.1: Negative I2C Address**
```powershell
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$body = @{
    sensor_type = "sht31_temp"
    interface_type = "I2C"
    i2c_address = -1
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "http://localhost:8000/api/v1/sensors/ESP_00000001/NULL" `
        -Method POST `
        -Headers $headers `
        -Body $body
    Write-Host "❌ Test failed: Should have returned 400" -ForegroundColor Red
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 400) {
        Write-Host "✅ Test passed: Got 400 as expected" -ForegroundColor Green
    } else {
        Write-Host "❌ Test failed: Got $statusCode instead of 400" -ForegroundColor Red
    }
}
```

---

## Test Results Interpretation

### Success Criteria

- ✅ **All 17 tests return expected status codes**
- ✅ **Server logs show rejection messages for invalid configs**
- ✅ **No unexpected errors in server logs**
- ✅ **Regression tests pass (multi-value sensors, OneWire, GPIO status)**

### Failure Analysis

**If tests fail:**

1. **Check server logs** for detailed error messages:
   ```powershell
   Get-Content "El Servador\god_kaiser_server\logs\god_kaiser.log" -Tail 100
   ```

2. **Verify implementation** matches expected behavior:
   - Check `El Servador/god_kaiser_server/src/api/v1/sensors.py` (I2C validation)
   - Check `El Servador/god_kaiser_server/src/services/gpio_validation_service.py` (GPIO validation)

3. **Compare with test expectations** in `TEST_REPORT_TEMPLATE.md`

---

## Next Steps After Testing

1. **If all tests pass:**
   - ✅ Update documentation (Section 7)
   - ✅ Prepare production deployment (Section 6)
   - ✅ Commit code with proper message

2. **If tests fail:**
   - ❌ Review implementation
   - ❌ Fix issues
   - ❌ Re-run tests
   - ❌ Update test script if expectations are wrong

---

**Last Updated:** 2026-01-14  
**Test Script:** `test_hardware_validation.ps1`  
**Status:** Ready for Use
