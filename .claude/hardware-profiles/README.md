# Hardware-Profile fuer F4 Hardware-Test-Flow

Profile definieren welche Sensoren/Aktoren an einem ESP32 angeschlossen sind.
Genutzt von: start_session.sh, auto-ops, system-control, Debug-Agents.

## Format

YAML mit folgenden Top-Level-Keys:
- `name` (string, required): Menschenlesbarer Name
- `description` (string, required): Was wird getestet
- `version` (string, required): Profil-Version
- `esp` (object, required): Board-Typ, Device-Name, Zone
- `sensors` (array): Sensor-Definitionen
- `actuators` (array): Aktor-Definitionen
- `stability_test` (object): Stabilitaetstest-Konfiguration

## Sensor-Felder

| Feld | Typ | Required | Beschreibung |
|------|-----|----------|-------------|
| type | string | ja | Firmware-registriert: ds18b20, sht31, bmp280, bme280, ph, ec, moisture. Server-only (co2, light, flow) NICHT fuer HW-Tests |
| name | string | ja | Menschenlesbarer Name |
| gpio | int | ja | GPIO-Pin (SDA bei I2C) |
| interface | string | ja | ONEWIRE, I2C, ANALOG |
| i2c_address | string | nein | Hex-Adresse (z.B. "0x44") |
| sample_interval_ms | int | nein | Default: 30000 |
| operating_mode | string | nein | continuous (default), on_demand |

## Actuator-Felder

| Feld | Typ | Required | Beschreibung |
|------|-----|----------|-------------|
| type | string | ja | relay, pump, valve, pwm |
| name | string | ja | Menschenlesbarer Name |
| gpio | int | ja | GPIO-Pin |
| inverted_logic | bool | nein | Default: false |

## Profil erstellen

Kopiere ein bestehendes Profil und passe es an. Validierung erfolgt automatisch.
