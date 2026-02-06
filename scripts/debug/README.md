# Debug Scripts

> **Zweck:** Helper-Scripts für Debug-Sessions
> **Version:** 4.0 | **Aktualisiert:** 2026-02-06

## start_session.sh (v4.0)

Primary debug session script using Docker-based workflow.

### Usage

```bash
./scripts/debug/start_session.sh [session-name] [--with-server] [--mode MODE]
```

### Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `session-name` | Name for the session | `debug` |
| `--with-server` | Start server if not running | - |
| `--mode MODE` | Test mode: `boot`, `config`, `sensor`, `actuator`, `e2e` | `boot` |

### Features (v4.0)

- **Docker-Stack Health-Check:** Verifies Docker containers instead of local services
- **MQTT-Capture with Timestamps:** `mosquitto_sub` via Docker exec with ISO timestamps
- **Log-Archivierung:** Archives previous session logs to `logs/archive/`
- **Extended STATUS.md:** Includes Docker container details for agents

### Output Files

| File | Description |
|------|-------------|
| `logs/current/mqtt_traffic.log` | MQTT traffic with timestamps |
| `logs/current/STATUS.md` | Agent context file |
| `logs/current/god_kaiser.log` | Symlink to server log |

### Examples

```bash
# Basic boot test
./scripts/debug/start_session.sh boot-test

# Sensor test session
./scripts/debug/start_session.sh sensor-test --mode sensor

# Full E2E test with server start
./scripts/debug/start_session.sh e2e-test --mode e2e --with-server
```

## stop_session.sh

Stops the debug session and archives all logs.

```bash
./scripts/debug/stop_session.sh
```

### Actions

1. Stops MQTT capture process
2. Stops server (if started with `--with-server`)
3. Archives logs → `logs/archive/{session_id}/`
4. Archives reports → `.claude/reports/archive/{session_id}/`
5. Clears `logs/current/` and `reports/current/`

## Log Directories

| Directory | Content |
|-----------|---------|
| `logs/server/` | Server JSON-Logs (Docker bind-mount) |
| `logs/mqtt/` | Mosquitto Broker-Logs (Docker bind-mount) |
| `logs/postgres/` | PostgreSQL Query-Logs (Docker bind-mount) |
| `logs/esp32/` | ESP32 Serial-Logs (manual) |
| `logs/current/` | Session-Logs (via start_session.sh) |
| `logs/archive/` | Archived session logs |
