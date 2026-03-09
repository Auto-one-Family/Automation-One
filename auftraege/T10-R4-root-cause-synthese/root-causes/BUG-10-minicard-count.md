# Root-Cause: BUG-10 — MiniCard zaehlt falsch

## Symptom
MiniCard zeigt "3S" statt "4S" — sensor_config mit status "pending" wird nicht gezaehlt.

## Reproduktion
1. MOCK_A3592B7E hat 4 sensor_configs (2x SHT31, 2x DS18B20)
2. L1 → MiniCard zeigt "3S"
3. `SELECT config_status, COUNT(*) FROM sensor_configs WHERE esp_id = ... GROUP BY config_status;`
→ 3 confirmed, 1 pending

## Root Cause
- **Datei:** `DeviceMiniCard.vue:154-159`
- **Funktion:** `sensorCount` Computed Property
- **Problem:** `groupSensorsByBaseType(sensors)` zaehlt nur Sensoren im `device.sensors[]` Array. Pending Configs werden vom Server NICHT im `sensors[]`-Array mitgeliefert (nur confirmed). Fallback auf `device.sensor_count` (DB-Wert, zaehlt ALLE inkl. pending) greift nur wenn `sensors.length === 0`. Bei `sensors.length > 0` (3 confirmed) → kein Fallback → zeigt 3 statt 4.

## Betroffene Schicht
- [ ] El Servador (Backend)
- [ ] El Trabajante (Firmware)
- [x] El Frontend (Vue 3)
- [ ] Infrastruktur (DB, MQTT, Docker)

## Blast Radius
- Welche Devices: Jeder ESP mit pending sensor_configs
- Welche Daten: Nur Anzeige betroffen, keine Datenverluste
- Welche Funktionen: MiniCard Sensor-Count

## Fix-Vorschlag
`Math.max(groupSensorsByBaseType(sensors).length, props.device.sensor_count ?? 0)` — nimmt den hoeheren Wert.

## Fix-Komplexitaet
- [x] Einzeiler
- [ ] Klein (1-2 Dateien, < 50 Zeilen)
- [ ] Mittel (3-5 Dateien, < 200 Zeilen)
- [ ] Gross (> 5 Dateien oder Architektur-Aenderung)

## Abhaengigkeiten
- Blockiert von: —
- Blockiert: — (standalone)

## Verifikation nach Fix
```
L1 → MiniCard → Sensor-Count muss mit DB-Count uebereinstimmen
→ SOLL: "4S" (oder entsprechend der tatsaechlichen sensor_configs)
```
