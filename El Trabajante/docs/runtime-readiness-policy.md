# Runtime-Mindestbasis und Profile

Diese Spezifikation definiert den verbindlichen Vertrag fuer den Exit aus `CONFIG_PENDING_AFTER_RESET`.

## Ziel

Nach Reset darf die Firmware den Pending-Zustand nur verlassen, wenn die Runtime-Basis laut Policy vollstaendig ist.

## Verbindliche Policy

- Default-Profil: `sensor_required`
- Pflicht: mindestens ein Aktor (`actuator_count > 0`)
- Pflicht: mindestens eine Offline-Rule (`offline_rule_count > 0`)
- Sensoren:
  - `sensor_required`: mindestens ein Sensor (`sensor_count > 0`)
  - `sensor_optional`: Sensoren sind optional (fuer spaetere profile-basierte Setups)

## Entscheidungscodes

- `CONFIG_PENDING_EXIT_READY`
- `MISSING_SENSORS`
- `MISSING_ACTUATORS`
- `MISSING_OFFLINE_RULES`

## State-Transition-Regeln

- Enter: `entered_config_pending` bei partieller Runtime-Basis nach Boot.
- Blocked Exit: `exit_blocked_config_pending` mit reason:
  - `CONFIG_PENDING_RETAINS_STATE_ON_ACK` (ACK darf Pending nicht direkt verlassen)
  - `CONFIG_PENDING_EXIT_NOT_READY` (Policy nicht erfuellt)
- Erfolgreicher Exit: `exited_config_pending` mit reason `CONFIG_PENDING_EXIT_READY`.

## Telemetrie-Felder

Jedes Transition-Event enthaelt mindestens:

- `event_type`
- `reason_code`
- `sensor_count`
- `actuator_count`
- `offline_rule_count`
- `state_before`
- `state_after`

Zusaetzlich werden Counter transportiert:

- `config_pending_enter_count`
- `config_pending_exit_count`
- `config_pending_exit_blocked_count`
