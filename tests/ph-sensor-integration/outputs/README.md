# Test Outputs

All test result files are written here. Format: `<script>-result-YYYY-MM-DD-HH.json` and `<script>-serial-YYYY-MM-DD-HH.log`.

## File Schema — result JSON

```json
{
  "script": "s1-setup-config-verify",
  "run_at": "2026-05-12T15:30:00Z",
  "esp_id": "ESP_XXXXXX",
  "assertions": [
    {
      "step": 1,
      "name": "ph_config_exists",
      "status": "pass",
      "expected": "sensor_type=ph, gpio=32, operating_mode=on_demand",
      "actual": { "sensor_type": "ph", "gpio": 32, "operating_mode": "on_demand" }
    }
  ],
  "summary": { "total": 8, "pass": 7, "fail": 0, "documented_gap": 1, "warning": 0 }
}
```

This directory is git-ignored (outputs change with each test run).
