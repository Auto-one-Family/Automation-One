#!/bin/bash
# ============================================================================
# start_session.sh - Debug-Session für Multi-Agent Workflow
# ============================================================================
# Version: 4.0 (SYSTEM_MANAGER Integration, schlanke STATUS.md)
#
# Usage: ./scripts/debug/start_session.sh [session-name] [--with-server] [--mode MODE]
#
# Beispiele:
#   ./scripts/debug/start_session.sh boot-config-test
#   ./scripts/debug/start_session.sh boot-test --with-server
#   ./scripts/debug/start_session.sh sensor-test --mode sensor
#
# Flags:
#   --with-server    Server automatisch starten (im Hintergrund)
#   --mode MODE      Test-Modus: boot, config, sensor, actuator, e2e (default: boot)
#
# Diese Session erstellt:
#   - logs/current/mqtt_traffic.log    (MQTT-Messages)
#   - logs/current/god_kaiser.log      (Server-Log Symlink/Kopie)
#   - logs/current/esp32_serial.log    (Manuell durch User)
#   - logs/current/STATUS.md           (Agent-Kontext & erwartete Patterns)
# ============================================================================

set -e  # Bei Fehler abbrechen

# ----------------------------------------------------------------------------
# Konfiguration
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_DIR="$PROJECT_ROOT/logs/current"
LOGS_ARCHIVE="$PROJECT_ROOT/logs/archive"
REPORTS_DIR="$PROJECT_ROOT/.claude/reports/current"
REPORTS_ARCHIVE="$PROJECT_ROOT/.claude/reports/archive"
SERVER_DIR="$PROJECT_ROOT/El Servador/god_kaiser_server"
SERVER_LOG="$SERVER_DIR/logs/god_kaiser.log"
ESP_DIR="$PROJECT_ROOT/El Trabajante"

# ----------------------------------------------------------------------------
# OS-Erkennung (robust für Git Bash, MSYS, WSL)
# ----------------------------------------------------------------------------
IS_WINDOWS=false
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
    IS_WINDOWS=true
elif [[ -d "/c/Windows" ]] || [[ -n "$WINDIR" ]]; then
    IS_WINDOWS=true
fi

# ----------------------------------------------------------------------------
# Argumente parsen
# ----------------------------------------------------------------------------
SESSION_NAME="debug"
WITH_SERVER=false
TEST_MODE="boot"

# Argument-Parsing mit --mode=value Support
while [[ $# -gt 0 ]]; do
    case $1 in
        --with-server)
            WITH_SERVER=true
            shift
            ;;
        --mode)
            TEST_MODE="$2"
            shift 2
            ;;
        --mode=*)
            TEST_MODE="${1#*=}"
            shift
            ;;
        -*)
            echo "Unbekanntes Flag: $1"
            echo "Usage: ./start_session.sh [name] [--with-server] [--mode boot|config|sensor|actuator|e2e]"
            exit 1
            ;;
        *)
            SESSION_NAME="$1"
            shift
            ;;
    esac
done

# Modus validieren und Report-Suffix bestimmen
case $TEST_MODE in
    boot|BOOT)
        TEST_MODE="BOOT"
        MODE_DESCRIPTION="Boot-Sequenz (WiFi, MQTT, Heartbeat)"
        ;;
    config|CONFIG)
        TEST_MODE="CONFIG"
        MODE_DESCRIPTION="Konfigurationsfluss (Zone Assignment, Config Push)"
        ;;
    sensor|SENSOR)
        TEST_MODE="SENSOR"
        MODE_DESCRIPTION="Sensor-Datenfluss (Readings, Validation)"
        ;;
    actuator|ACTUATOR)
        TEST_MODE="ACTUATOR"
        MODE_DESCRIPTION="Aktor-Steuerung (Commands, Status)"
        ;;
    e2e|E2E|full|FULL)
        TEST_MODE="E2E"
        MODE_DESCRIPTION="End-to-End Hardware Test (Boot → Sensor → Actuator → Commands)"
        ;;
    *)
        echo "Unbekannter Modus: $TEST_MODE"
        echo "Verfügbare Modi: boot, config, sensor, actuator, e2e"
        exit 1
        ;;
esac

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M")
SESSION_ID="${TIMESTAMP}_${SESSION_NAME}"

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " 🚀 Debug-Session wird gestartet..."
echo " Session-ID: $SESSION_ID"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ----------------------------------------------------------------------------
# Schritt 1: Ordner vorbereiten
# ----------------------------------------------------------------------------
echo "[1/7] Ordner vorbereiten..."

# Archive-Ordner sicherstellen
mkdir -p "$LOGS_ARCHIVE"
mkdir -p "$REPORTS_ARCHIVE"

# logs/current/ leeren
if [ -d "$LOGS_DIR" ]; then
    rm -f "$LOGS_DIR"/*.log 2>/dev/null || true
    rm -f "$LOGS_DIR"/*.md 2>/dev/null || true
    rm -f "$LOGS_DIR"/.session_info 2>/dev/null || true
    echo "      ✓ logs/current/ geleert"
else
    mkdir -p "$LOGS_DIR"
    echo "      ✓ logs/current/ erstellt"
fi

# reports/current/ leeren
if [ -d "$REPORTS_DIR" ]; then
    rm -f "$REPORTS_DIR"/*.md 2>/dev/null || true
    echo "      ✓ reports/current/ geleert"
else
    mkdir -p "$REPORTS_DIR"
    echo "      ✓ reports/current/ erstellt"
fi

# ----------------------------------------------------------------------------
# Schritt 2: MQTT Broker prüfen
# ----------------------------------------------------------------------------
echo ""
echo "[2/7] MQTT Broker prüfen..."

MQTT_OK=false
if $IS_WINDOWS; then
    if /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -q ":1883"; then
        MQTT_OK=true
    fi
else
    if netstat -tuln 2>/dev/null | grep -q ":1883 "; then
        MQTT_OK=true
    fi
fi

if $MQTT_OK; then
    echo "      ✓ MQTT Broker läuft (Port 1883)"
else
    echo "      ✗ MQTT Broker NICHT erreichbar!"
    echo ""
    echo "      Bitte Mosquitto starten:"
    if $IS_WINDOWS; then
        echo "        net start mosquitto     (Windows Dienst)"
    fi
    echo "        mosquitto               (manuell)"
    echo ""
    exit 1
fi

# ----------------------------------------------------------------------------
# Schritt 3: Server prüfen / starten
# ----------------------------------------------------------------------------
echo ""
echo "[3/7] Server prüfen..."

SERVER_OK=false
SERVER_PID=""
POETRY_CMD=""

# Funktion: Server-PID über Port 8000 finden (robust für Windows)
get_server_pid_by_port() {
    if $IS_WINDOWS; then
        # Windows: netstat -ano zeigt PID, LISTENING (EN) oder ABHÖREN (DE)
        # grep -a für binary-safe (Umlaut-Probleme)
        /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -a ":8000" | grep -a "LISTENING\|ABH" | awk '{print $5}' | head -1
    else
        # Linux/Mac: lsof oder netstat
        lsof -ti:8000 2>/dev/null || netstat -tlnp 2>/dev/null | grep ":8000" | awk '{print $7}' | cut -d'/' -f1
    fi
}

# Funktion: Poetry finden (robust für Windows Git Bash)
find_poetry() {
    # Option 1: Im PATH
    if command -v poetry &> /dev/null; then
        echo "poetry"
        return 0
    fi

    # Option 2: Windows AppData (Python Scripts)
    if [[ -n "$APPDATA" && -f "$APPDATA/Python/Scripts/poetry.exe" ]]; then
        echo "$APPDATA/Python/Scripts/poetry.exe"
        return 0
    fi

    # Option 3: Windows LocalAppData (pip user install)
    if [[ -n "$LOCALAPPDATA" && -f "$LOCALAPPDATA/Programs/Python/Python313/Scripts/poetry.exe" ]]; then
        echo "$LOCALAPPDATA/Programs/Python/Python313/Scripts/poetry.exe"
        return 0
    fi

    # Option 4: User home local bin
    if [[ -f "$HOME/.local/bin/poetry" ]]; then
        echo "$HOME/.local/bin/poetry"
        return 0
    fi

    # Option 5: Windows User profile
    if [[ -n "$USERPROFILE" ]]; then
        # Konvertiere Windows-Pfad zu Unix-Pfad
        local user_profile_unix=$(echo "$USERPROFILE" | sed 's|\\|/|g' | sed 's|C:|/c|')
        if [[ -f "$user_profile_unix/AppData/Local/Programs/Python/Python313/Scripts/poetry.exe" ]]; then
            echo "$user_profile_unix/AppData/Local/Programs/Python/Python313/Scripts/poetry.exe"
            return 0
        fi
    fi

    return 1
}

if $IS_WINDOWS; then
    # Auf Windows: LISTENING (EN) oder ABHÖREN (DE) - grep mit -a für binary-safe
    if /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -a ":8000" | grep -a -q "LISTENING\|ABH"; then
        SERVER_OK=true
        SERVER_PID=$(get_server_pid_by_port)
    fi
else
    if netstat -tuln 2>/dev/null | grep -q ":8000 "; then
        SERVER_OK=true
        SERVER_PID=$(get_server_pid_by_port)
    fi
fi

if $SERVER_OK; then
    echo "      ✓ Server läuft bereits (Port 8000, PID: $SERVER_PID)"
    # Server wurde nicht von uns gestartet
    WITH_SERVER=false
    SERVER_PID=""
elif $WITH_SERVER; then
    echo "      ⏳ Server wird gestartet (--with-server)..."

    # Poetry finden
    POETRY_CMD=$(find_poetry)
    if [[ -z "$POETRY_CMD" ]]; then
        echo "      ✗ Poetry nicht gefunden!"
        echo ""
        echo "        Installieren mit:"
        echo "          curl -sSL https://install.python-poetry.org | python3 -"
        echo "        Oder:"
        echo "          pip install poetry"
        echo ""
        exit 1
    fi
    echo "      ✓ Poetry gefunden: $POETRY_CMD"

    # Prüfe ob Dependencies installiert sind
    if ! (cd "$SERVER_DIR" && "$POETRY_CMD" check &> /dev/null); then
        echo "      ⏳ Dependencies werden installiert..."
        (cd "$SERVER_DIR" && "$POETRY_CMD" install --no-interaction) || {
            echo "      ✗ poetry install fehlgeschlagen!"
            exit 1
        }
    fi

    # Server im Hintergrund starten
    # WICHTIG: Im god_kaiser_server Verzeichnis ist der Modul-Pfad "src.main:app"
    (
        cd "$SERVER_DIR"
        "$POETRY_CMD" run uvicorn src.main:app --host 0.0.0.0 --port 8000 2>&1
    ) > "$LOGS_DIR/server_console.log" 2>&1 &
    SHELL_PID=$!

    # Warten bis Server bereit ist (max 30s)
    echo "      ⏳ Warte auf Server-Start..."
    WAIT_COUNT=0
    while [ $WAIT_COUNT -lt 30 ]; do
        sleep 1
        ((WAIT_COUNT++)) || true

        if $IS_WINDOWS; then
            # LISTENING (EN) oder ABHÖREN (DE), grep -a für binary-safe
            if /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -a ":8000" | grep -a -q "LISTENING\|ABH"; then
                SERVER_OK=true
                # Hole echte PID über Port (nicht Shell-PID)
                SERVER_PID=$(get_server_pid_by_port)
                break
            fi
        else
            if netstat -tuln 2>/dev/null | grep -q ":8000 "; then
                SERVER_OK=true
                SERVER_PID=$(get_server_pid_by_port)
                break
            fi
        fi

        # Fortschritt anzeigen
        if [ $((WAIT_COUNT % 5)) -eq 0 ]; then
            echo "      ⏳ ... ${WAIT_COUNT}s"
        fi

        # Prüfe ob Prozess noch läuft (frühe Fehler erkennen)
        if ! kill -0 $SHELL_PID 2>/dev/null; then
            echo "      ✗ Server-Prozess beendet!"
            echo ""
            echo "      Letzte Zeilen aus server_console.log:"
            tail -20 "$LOGS_DIR/server_console.log" 2>/dev/null || echo "      (Log nicht verfügbar)"
            echo ""
            exit 1
        fi
    done

    if $SERVER_OK; then
        echo "      ✓ Server gestartet (Port 8000, PID: $SERVER_PID)"

        # Health-Check zur Bestätigung
        sleep 1
        if curl -s http://localhost:8000/health > /dev/null 2>&1; then
            echo "      ✓ Health-Check erfolgreich"
        else
            echo "      ⚠ Health-Check fehlgeschlagen (Server läuft aber evtl. noch nicht vollständig)"
        fi
    else
        echo "      ✗ Server konnte nicht gestartet werden!"
        echo ""
        echo "      Letzte Zeilen aus server_console.log:"
        tail -20 "$LOGS_DIR/server_console.log" 2>/dev/null || echo "      (Log nicht verfügbar)"
        echo ""
        exit 1
    fi
else
    echo "      ⚠ Server läuft NICHT (Port 8000)"
    echo ""
    echo "        Option 1: Session mit --with-server neu starten"
    echo "        Option 2: Server manuell starten:"
    echo "          cd \"El Servador/god_kaiser_server\""
    echo "          poetry run uvicorn src.main:app --host 0.0.0.0 --port 8000"
    echo ""
fi

# ----------------------------------------------------------------------------
# Schritt 4: Server-Log verlinken
# ----------------------------------------------------------------------------
echo ""
echo "[4/7] Server-Log verlinken..."

if [ -f "$SERVER_LOG" ]; then
    # Auf Windows: Symlinks funktionieren manchmal nicht, Kopie als Fallback
    ln -sf "$SERVER_LOG" "$LOGS_DIR/god_kaiser.log" 2>/dev/null

    if [ -L "$LOGS_DIR/god_kaiser.log" ] || [ -f "$LOGS_DIR/god_kaiser.log" ]; then
        echo "      ✓ god_kaiser.log verlinkt"
    else
        cp "$SERVER_LOG" "$LOGS_DIR/god_kaiser.log"
        echo "      ✓ god_kaiser.log kopiert (Symlink fehlgeschlagen)"
    fi
else
    echo "      ⚠ Server-Log nicht gefunden (wird erstellt wenn Server läuft)"
    touch "$LOGS_DIR/god_kaiser.log"
fi

# ----------------------------------------------------------------------------
# Schritt 5: MQTT Capture starten
# ----------------------------------------------------------------------------
echo ""
echo "[5/7] MQTT Capture starten..."

MOSQUITTO_SUB=""
if command -v mosquitto_sub &> /dev/null; then
    MOSQUITTO_SUB="mosquitto_sub"
elif [[ -f "/c/Program Files/mosquitto/mosquitto_sub.exe" ]]; then
    MOSQUITTO_SUB="/c/Program Files/mosquitto/mosquitto_sub.exe"
fi

MQTT_PID=""
if [[ -n "$MOSQUITTO_SUB" ]]; then
    "$MOSQUITTO_SUB" -h localhost -t "kaiser/#" -v > "$LOGS_DIR/mqtt_traffic.log" 2>&1 &
    MQTT_PID=$!

    sleep 1

    # Windows: Hole echten PID
    if $IS_WINDOWS; then
        REAL_PID=$(tasklist //FI "IMAGENAME eq mosquitto_sub.exe" //FO CSV //NH 2>/dev/null | head -1 | cut -d',' -f2 | tr -d '"')
        if [[ -n "$REAL_PID" && "$REAL_PID" =~ ^[0-9]+$ ]]; then
            MQTT_PID="$REAL_PID"
            echo "      ✓ MQTT Capture gestartet (PID: $MQTT_PID)"
        else
            echo "      ✗ MQTT Capture fehlgeschlagen"
            MQTT_PID=""
        fi
    else
        if kill -0 $MQTT_PID 2>/dev/null; then
            echo "      ✓ MQTT Capture gestartet (PID: $MQTT_PID)"
        else
            echo "      ✗ MQTT Capture fehlgeschlagen"
            MQTT_PID=""
        fi
    fi
else
    echo "      ✗ mosquitto_sub nicht gefunden!"
    echo "        Bitte Mosquitto-Clients installieren"
fi

# ----------------------------------------------------------------------------
# Schritt 6: STATUS.md erstellen (Agent-Kontext - VERIFIZIERT)
# ----------------------------------------------------------------------------
echo ""
echo "[6/7] STATUS.md für Agents erstellen..."

# Variablen für STATUS.md vorbereiten
SERVER_STATUS="❌ Nicht gestartet"
if $SERVER_OK; then
    SERVER_STATUS="✅ Läuft (Port 8000)"
fi

MQTT_STATUS="❌ Nicht aktiv"
if [ -n "$MQTT_PID" ]; then
    MQTT_STATUS="✅ Aktiv (PID: $MQTT_PID)"
fi

# Git Status erfassen
GIT_BRANCH=$(git branch --show-current 2>/dev/null || echo "nicht verfügbar")
GIT_LAST_COMMIT=$(git log --oneline -1 2>/dev/null || echo "nicht verfügbar")
GIT_CHANGES=$(git status --short 2>/dev/null | wc -l | tr -d ' ')
if [ "$GIT_CHANGES" = "0" ]; then
    GIT_STATUS_TEXT="✅ Keine uncommitted Änderungen"
else
    GIT_STATUS_TEXT="⚠️ $GIT_CHANGES uncommitted Änderungen"
fi

# Docker Status erfassen
DOCKER_STATUS=$(docker compose ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || echo "Docker nicht aktiv oder nicht installiert")

cat > "$LOGS_DIR/STATUS.md" << 'EOF'
# 🎯 Debug-Session Status

## Session-Info

EOF

# Session-Info dynamisch einfügen
echo "- **Session-ID:** $SESSION_ID" >> "$LOGS_DIR/STATUS.md"
echo "- **Gestartet:** $(date +"%Y-%m-%d %H:%M:%S")" >> "$LOGS_DIR/STATUS.md"
echo "- **Server:** $SERVER_STATUS" >> "$LOGS_DIR/STATUS.md"
echo "- **MQTT Capture:** $MQTT_STATUS" >> "$LOGS_DIR/STATUS.md"

# Git Status in STATUS.md
echo "" >> "$LOGS_DIR/STATUS.md"
echo "## Git Status" >> "$LOGS_DIR/STATUS.md"
echo "" >> "$LOGS_DIR/STATUS.md"
echo "- **Branch:** $GIT_BRANCH" >> "$LOGS_DIR/STATUS.md"
echo "- **Letzter Commit:** $GIT_LAST_COMMIT" >> "$LOGS_DIR/STATUS.md"
echo "- **Status:** $GIT_STATUS_TEXT" >> "$LOGS_DIR/STATUS.md"

# Docker Status in STATUS.md
echo "" >> "$LOGS_DIR/STATUS.md"
echo "## Docker Status" >> "$LOGS_DIR/STATUS.md"
echo "" >> "$LOGS_DIR/STATUS.md"
echo '```' >> "$LOGS_DIR/STATUS.md"
echo "$DOCKER_STATUS" >> "$LOGS_DIR/STATUS.md"
echo '```' >> "$LOGS_DIR/STATUS.md"

# Hardware-Setup Placeholder für User
cat >> "$LOGS_DIR/STATUS.md" << 'HARDWAREEOF'

---

## 🔌 Hardware-Setup

> **WICHTIG:** Vor "session gestartet" ausfüllen!

| GPIO | Komponente | Typ | Interface | Status |
|------|------------|-----|-----------|--------|
| ? | ? | Sensor/Actuator | ? | ? |

**Beispiel für E2E:**
| GPIO | Komponente | Typ | Interface | Status |
|------|------------|-----|-----------|--------|
| 4 | DS18B20 | Sensor | OneWire | angeschlossen |
| 26 | Olimex PWR-SWITCH | Actuator | Digital | angeschlossen |

HARDWAREEOF

cat >> "$LOGS_DIR/STATUS.md" << 'STATICEOF'

---

## 📁 Log-Dateien für Agents

| Agent | Log-Datei | Format |
|-------|-----------|--------|
| esp32-debug | `logs/current/esp32_serial.log` | `[timestamp] [LEVEL] message` |
| server-debug | `logs/current/god_kaiser.log` | JSON (eine Zeile pro Event) |
| mqtt-debug | `logs/current/mqtt_traffic.log` | `{topic} {payload}` |

## 📝 Report-Ausgabe
STATICEOF

# Dynamische Report-Pfade (mit Variable-Expansion)
cat >> "$LOGS_DIR/STATUS.md" << DYNAMICEOF

| Agent | Report-Pfad |
|-------|-------------|
| esp32-debug | \`.claude/reports/current/ESP32_${TEST_MODE}_REPORT.md\` |
| server-debug | \`.claude/reports/current/SERVER_${TEST_MODE}_REPORT.md\` |
| mqtt-debug | \`.claude/reports/current/MQTT_${TEST_MODE}_REPORT.md\` |

---

## 📋 Test-Modus: ${TEST_MODE}

> **Fokus:** ${MODE_DESCRIPTION}
> **Patterns:** Verifiziert gegen AutomationOne-Code (2026-02-02)
DYNAMICEOF

cat >> "$LOGS_DIR/STATUS.md" << 'STATICEOF2'

### Phase 1: BOOT-Sequenz

**Ziel:** ESP32 startet, verbindet sich mit WiFi/MQTT, sendet ersten Heartbeat

#### ESP32 Serial Log-Format

```
[  timestamp] [LEVEL   ] message
```
- Timestamp: 10-stellig, Millisekunden seit Boot
- Level: DEBUG, INFO, WARNING, ERROR, CRITICAL (8 Zeichen, rechtsbündig)

#### Boot-Banner (Kritisch - MUSS erscheinen)

```
╔════════════════════════════════════════╗
║  ESP32 Sensor Network v4.0 (Phase 2)  ║
╚════════════════════════════════════════╝
```

**Code-Location:** `El Trabajante/src/main.cpp:140-145`

#### WiFi-Verbindung

| Status | Exakter Pattern | Code-Location |
|--------|-----------------|---------------|
| ✅ SUCCESS | `[INFO    ] WiFi connected! IP: X.X.X.X` | `wifi_manager.cpp:149` |
| ✅ SUCCESS | `[INFO    ] WiFi RSSI: -XX dBm` | `wifi_manager.cpp:150` |
| 🔴 FAILURE | `[ERROR   ] ║  ❌ WIFI CONNECTION FAILED` | `wifi_manager.cpp:104` |

**Erwartete Zeit:** < 10 Sekunden nach Boot

#### MQTT-Verbindung

| Status | Exakter Pattern | Code-Location |
|--------|-----------------|---------------|
| ✅ SUCCESS | `[INFO    ] MQTT connected!` | `mqtt_client.cpp:239` |
| 🔴 FAILURE | `[ERROR   ] MQTT connection failed, rc=` | `mqtt_client.cpp:266` |
| ⚠️ FALLBACK | `[WARNING ] ║  ⚠️  MQTT PORT FALLBACK` | `mqtt_client.cpp:209` |

**Erwartete Zeit:** < 5 Sekunden nach WiFi

#### Initial Heartbeat

| Status | Exakter Pattern | Code-Location |
|--------|-----------------|---------------|
| ✅ SUCCESS | `[INFO    ] Initial heartbeat sent for ESP registration` | `main.cpp:700` |
| ✅ SUCCESS | `[INFO    ] Subscribed to system + actuator + zone...` | `main.cpp:744` |

---

### Phase 2: MQTT Traffic Patterns

#### Topic-Struktur (kaiser_id = "god")

| Funktion | Topic-Pattern |
|----------|---------------|
| Heartbeat | `kaiser/god/esp/{esp_id}/system/heartbeat` |
| Heartbeat ACK | `kaiser/god/esp/{esp_id}/system/heartbeat/ack` |
| Zone Assign | `kaiser/god/esp/{esp_id}/zone/assign` |
| Zone ACK | `kaiser/god/esp/{esp_id}/zone/ack` |

#### Heartbeat Payload (ESP32 → Server)

```json
{
    "esp_id": "ESP_XXXXXXXX",
    "ts": 1735818000,
    "uptime": 12345,
    "heap_free": 45000,
    "wifi_rssi": -45
}
```

**Pflichtfelder:** `ts`, `uptime`, `heap_free`, `wifi_rssi`

---

### Phase 3: Server Log Patterns (JSON Format)

#### Heartbeat-Verarbeitung

| Status | Pattern im "message" Feld | Code-Location |
|--------|---------------------------|---------------|
| ✅ NEW | `🔔 New ESP discovered: {esp_id} (pending_approval)` | `heartbeat_handler.py:379` |
| ✅ ONLINE | `✅ Device {esp_id} now online after approval` | `heartbeat_handler.py:184` |
| 🔴 ERROR | `[ValidationErrorCode] Invalid heartbeat payload` | `heartbeat_handler.py:106` |

---

### Phase 4: Zone Assignment (CONFIG-Flow)

#### ESP32 Serial - Zone Empfang

| Status | Exakter Pattern |
|--------|-----------------|
| ✅ RECEIVED | `[INFO    ] ║  ZONE ASSIGNMENT RECEIVED` |
| ✅ SUCCESS | `[INFO    ] ✅ Zone assignment successful` |
| 🔴 FAILURE | `[ERROR   ] Zone assignment failed: zone_id is empty` |

#### Server - Zone ACK Verarbeitung

| Status | Pattern im "message" Feld |
|--------|---------------------------|
| ✅ SUCCESS | `Zone assignment confirmed for {esp_id}` |
| 🔴 FAILURE | `Zone assignment failed for {esp_id}` |

---
STATICEOF2

# E2E-spezifische Phasen (nur wenn TEST_MODE="E2E")
if [ "$TEST_MODE" = "E2E" ]; then
cat >> "$LOGS_DIR/STATUS.md" << 'E2EPHASESEOF'

---

### Phase 5: SENSOR Configuration (E2E)

> **Hardware:** DS18B20 OneWire Temperatur auf GPIO 4

#### Config Push (Server → ESP)

| Status | Log | Pattern |
|--------|-----|---------|
| ✅ SENT | Server | `Sensor config published to {esp_id}` |
| ✅ RECEIVED | ESP32 | `[INFO    ] ║  CONFIG PUSH RECEIVED` |
| ✅ APPLIED | ESP32 | `[INFO    ] ✅ Config applied successfully` |
| ✅ ACK | MQTT | `config_response {"status": "SUCCESS"}` |

#### Sensor Discovery (DS18B20 spezifisch)

| Status | ESP32 Pattern | Problem wenn fehlt |
|--------|---------------|-------------------|
| ✅ FOUND | `DS18B20: Found X devices` | Verkabelung prüfen |
| ✅ ROM | `ROM: 28-XX-XX-XX-XX-XX-XX-XX` | 4.7kΩ Pull-up fehlt? |
| 🔴 ERROR | `ROM-Code missing for GPIO` | Kein Sensor erkannt |
| 🔴 ERROR | `OneWire: No devices found` | Verkabelung falsch |

#### Data Flow (ESP → Server)

| Status | MQTT Topic | Intervall |
|--------|------------|-----------|
| ✅ DATA | `kaiser/god/esp/{esp_id}/sensor/4/data` | Alle 10 Sekunden |

**Erwartetes Payload-Schema:**
```json
{
  "esp_id": "ESP_XXXXXX",
  "gpio": 4,
  "sensor_type": "DS18B20",
  "raw": 2150,
  "ts": 1735818000,
  "raw_mode": true
}
```

---

### Phase 6: ACTUATOR Configuration (E2E)

> **Hardware:** Olimex PWR-SWITCH (230V/16A Relais) auf GPIO 26

#### Config Push (Server → ESP)

| Status | Log | Pattern |
|--------|-----|---------|
| ✅ SENT | Server | `Actuator config published to {esp_id}` |
| ✅ RECEIVED | ESP32 | `[INFO    ] Actuator config received` |
| ✅ GPIO | ESP32 | `[INFO    ] GPIO 26 reserved for actuator` |
| ✅ INIT | ESP32 | `[INFO    ] Actuator initialized: relay on GPIO 26` |
| ✅ ACK | MQTT | `config_response {"status": "SUCCESS"}` |

#### Initial Status nach Config

| Status | MQTT Topic | Expected Payload |
|--------|------------|------------------|
| ✅ STATUS | `actuator/26/status` | `{"state": "OFF", "gpio": 26}` |

**Kritische Fehler:**

| ESP32 Pattern | Problem | Lösung |
|---------------|---------|--------|
| `GPIO 26 already reserved` | GPIO-Konflikt | Anderen GPIO wählen |
| `Unknown actuator type` | Typ nicht unterstützt | "relay" verwenden |

---

### Phase 7: ACTUATOR Commands (E2E)

> **⚠️ ACHTUNG:** Physikalische Hardware wird geschaltet!

#### Command Sequence: ON

| Step | Log | Pattern | Hardware-Effekt |
|------|-----|---------|-----------------|
| 1 | Server | `Actuator command sent to {esp_id}: ON` | - |
| 2 | MQTT | `actuator/26/command` mit `{"command": "ON"}` | - |
| 3 | ESP32 | `[INFO    ] Actuator command received: ON` | - |
| 4 | ESP32 | `[INFO    ] GPIO 26 set to HIGH` | **⚡ PWR-SWITCH: AN** |
| 5 | MQTT | `actuator/26/status` mit `{"state": "ON"}` | - |
| 6 | Server | `Actuator status updated: ON` | - |

#### Command Sequence: OFF

| Step | Log | Pattern | Hardware-Effekt |
|------|-----|---------|-----------------|
| 1 | Server | `Actuator command sent to {esp_id}: OFF` | - |
| 2 | MQTT | `actuator/26/command` mit `{"command": "OFF"}` | - |
| 3 | ESP32 | `[INFO    ] GPIO 26 set to LOW` | **PWR-SWITCH: AUS** |
| 4 | MQTT | `actuator/26/status` mit `{"state": "OFF"}` | - |

#### Timing-Erwartungen

| Metrik | Erwartung | Alarm wenn |
|--------|-----------|------------|
| Command → Status | < 500ms | > 2s |
| GPIO Toggle | Sofort | Verzögerung sichtbar |

---

### Phase 8: E2E Verification Checklist

Nach Abschluss aller Tests müssen ALLE Punkte erfüllt sein:

#### Boot & Connection ✓
- [ ] Boot-Banner erscheint
- [ ] WiFi Connected (< 10s)
- [ ] MQTT Connected (< 5s nach WiFi)
- [ ] Initial Heartbeat gesendet

#### Device Registration ✓
- [ ] Heartbeat vom Server empfangen
- [ ] ESP in DB mit Status `pending_approval`
- [ ] Approval durchgeführt
- [ ] Nächster Heartbeat → Status `ONLINE`

#### Sensor Flow ✓
- [ ] DS18B20 Config an ESP gesendet
- [ ] Config erfolgreich applied (kein ERROR)
- [ ] ROM-Code erkannt (28-XX-...)
- [ ] Temperatur-Readings erscheinen (alle 10s)
- [ ] Server speichert Daten in `sensor_data` Tabelle

#### Actuator Flow ✓
- [ ] Relay Config an ESP gesendet
- [ ] GPIO 26 erfolgreich reserviert
- [ ] Initial Status: OFF
- [ ] ON-Command → PWR-SWITCH physisch AN
- [ ] Status-Update: ON in MQTT
- [ ] OFF-Command → PWR-SWITCH physisch AUS
- [ ] Status-Update: OFF in MQTT

#### Error-Free ✓
- [ ] ESP32 Log: Keine [ERROR] nach Config-Phase
- [ ] Server Log: Keine Exceptions/Tracebacks
- [ ] MQTT: Alle erwarteten Topics vorhanden
- [ ] Keine Timeouts oder fehlende ACKs

E2EPHASESEOF
fi

# Agent-Aktivierung - SYSTEM_MANAGER Workflow
cat >> "$LOGS_DIR/STATUS.md" << AGENTEOF

---

## 🤖 Agent-Workflow: SYSTEM_MANAGER

> **SYSTEM_MANAGER erstellt Briefing - führt KEINE Agents aus!**

---

### Schritt 1: Plan Mode aktivieren

\`\`\`
Shift+Tab → bis "⏸ plan mode on" erscheint
\`\`\`

### Schritt 2: Session starten

\`\`\`
session gestartet
\`\`\`

### Schritt 3: SYSTEM_MANAGER arbeitet

Der SYSTEM_MANAGER wird automatisch aktiviert und:

1. **Liest** diese STATUS.md
2. **Analysiert** System-Status (Server, MQTT, Git)
3. **Empfiehlt** Agents für Technical Manager:
   - \`esp32-debug\` → wenn Serial-Log vorhanden
   - \`server-debug\` → wenn Server-Errors
   - \`mqtt-debug\` → wenn MQTT-Probleme
   - \`db-inspector\` → wenn Daten-Inkonsistenzen
4. **Erstellt** \`.claude/reports/current/SESSION_BRIEFING.md\`
5. **FERTIG** (führt keine Agents aus!)

### Schritt 4: Technical Manager übernimmt

Nach dem SESSION_BRIEFING:

1. Plan Mode verlassen: \`Shift+Tab\`
2. SESSION_BRIEFING.md lesen
3. Fokussierte Entwickler-Aufträge formulieren
4. Entscheiden: Debug-Agent oder Dev-Agent?

### Schritt 5: User aktiviert Agent

1. Agent-Auftrag in VS Code eingeben
2. Agent führt Analyse/Implementation durch
3. Report wird erstellt

---

### Wichtig

SYSTEM_MANAGER ≠ Agent-Orchestrator
SYSTEM_MANAGER = Briefing-Ersteller für Technical Manager

---

### SYSTEM_MANAGER Referenz

| Attribut | Wert |
|----------|------|
| **Agent-Pfad** | \`.claude/agents/System Manager/system-manager.md\` |
| **Skill-Pfad** | \`.claude/skills/System Manager/SKILL.md\` |
| **Modus** | Plan Mode PFLICHT |
| **Output** | \`.claude/reports/current/SESSION_BRIEFING.md\` |

---

### Verfügbare Debug-Agents (für Edit Mode)

| Agent | Log-Datei | Report-Pfad |
|-------|-----------|-------------|
| esp32-debug | \`logs/current/esp32_serial.log\` | \`ESP32_${TEST_MODE}_REPORT.md\` |
| server-debug | \`logs/current/god_kaiser.log\` | \`SERVER_${TEST_MODE}_REPORT.md\` |
| mqtt-debug | \`logs/current/mqtt_traffic.log\` | \`MQTT_${TEST_MODE}_REPORT.md\` |

---

### Fallback: Manuelle Agent-Aktivierung

Falls SYSTEM_MANAGER nicht verfügbar:

\`\`\`bash
# In separaten VS Code Chat-Windows:

# ESP32 Debug
Du bist esp32-debug. Lies logs/current/STATUS.md und analysiere logs/current/esp32_serial.log

# Server Debug
Du bist server-debug. Lies logs/current/STATUS.md und analysiere logs/current/god_kaiser.log

# MQTT Debug
Du bist mqtt-debug. Lies logs/current/STATUS.md und analysiere logs/current/mqtt_traffic.log
\`\`\`

AGENTEOF

# E2E: Hinweis für SYSTEM_MANAGER
if [ "$TEST_MODE" = "E2E" ]; then
cat >> "$LOGS_DIR/STATUS.md" << 'E2EAGENTEOF'

---

### E2E-Modus: Erweiterte Hardware-Verifikation

> **Hinweis für SYSTEM_MANAGER:** E2E-Tests erfordern Hardware-Checks.

**Zusätzliche Prüfpunkte:**
- DS18B20 Sensor-Discovery (ROM-Code erkannt?)
- Actuator GPIO-Reservation (GPIO 26 reserviert?)
- Sensor-Readings (Temperatur-Werte plausibel?)
- Actuator-Commands (ON/OFF physisch ausgeführt?)

**Delegations-Empfehlung:**
- esp32-debug: Sensor/Actuator Init prüfen
- server-debug: Data-Processing verifizieren
- mqtt-debug: Command→Response Sequenzen validieren

E2EAGENTEOF
fi

# Finale Checkliste
cat >> "$LOGS_DIR/STATUS.md" << FINALEOF

---

## 📊 Session-Abschluss Checkliste

### SYSTEM_MANAGER Workflow

- [ ] Plan Mode aktiviert (⏸)
- [ ] "session gestartet" gesendet
- [ ] SESSION_BRIEFING.md erstellt
- [ ] Technical Manager hat Briefing gelesen

### Agent-Reports (nach Edit Mode)

- [ ] ESP32_${TEST_MODE}_REPORT.md erstellt
- [ ] SERVER_${TEST_MODE}_REPORT.md erstellt
- [ ] MQTT_${TEST_MODE}_REPORT.md erstellt

### Session beenden

\`\`\`bash
./scripts/debug/stop_session.sh
\`\`\`

---

FINALEOF

# Timestamp am Ende
echo "" >> "$LOGS_DIR/STATUS.md"
echo "*Generiert: $(date +"%Y-%m-%d %H:%M:%S")*" >> "$LOGS_DIR/STATUS.md"
echo "*Session: $SESSION_ID*" >> "$LOGS_DIR/STATUS.md"

echo "      ✓ STATUS.md erstellt"

# ----------------------------------------------------------------------------
# Schritt 7: Session-Info speichern
# ----------------------------------------------------------------------------
echo ""
echo "[7/7] Session-Info speichern..."

cat > "$LOGS_DIR/.session_info" << EOF
SESSION_ID="$SESSION_ID"
STARTED_AT="$(date +"%Y-%m-%d %H:%M:%S")"
TEST_MODE="$TEST_MODE"
MODE_DESCRIPTION="$MODE_DESCRIPTION"
MQTT_PID="$MQTT_PID"
SERVER_PID="$SERVER_PID"
PROJECT_ROOT="$PROJECT_ROOT"
WITH_SERVER="$WITH_SERVER"
SERVER_LOG_SOURCE="$SERVER_LOG"
ESP_DIR="$ESP_DIR"
EOF

echo "      ✓ Session-Info gespeichert"

# ----------------------------------------------------------------------------
# COM-Port erkennen (Windows)
# ----------------------------------------------------------------------------
DETECTED_COM=""
if $IS_WINDOWS; then
    # Suche nach USB Serial Ports
    DETECTED_COM=$(powershell.exe -Command "Get-WMIObject Win32_SerialPort | Where-Object { \$_.Description -match 'USB|CH340|CP210|FTDI' } | Select-Object -First 1 -ExpandProperty DeviceID" 2>/dev/null | tr -d '\r\n')
fi

# ----------------------------------------------------------------------------
# Zusammenfassung
# ----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ Debug-Session bereit"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " Session-ID: $SESSION_ID"
echo " Test-Modus: $TEST_MODE ($MODE_DESCRIPTION)"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ 📊 LOG-STATUS"
echo " ├─────────────────────────────────────────────────────────────────"
if [ -n "$MQTT_PID" ]; then
echo " │ ✅ mqtt_traffic.log    → Capture läuft (PID: $MQTT_PID)"
else
echo " │ ❌ mqtt_traffic.log    → Capture NICHT aktiv"
fi
if $SERVER_OK; then
echo " │ ✅ god_kaiser.log      → Verlinkt"
else
echo " │ ⚠️  god_kaiser.log      → Server läuft nicht"
fi
echo " │ ⏳ esp32_serial.log    → Wird erstellt wenn ESP32 gestartet"
echo " │ 📋 STATUS.md           → Bereit für Agents"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo " 📋 ESP32 STARTEN - WÄHLE EINE OPTION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
# Absoluter Pfad für ESP32 Log
ESP_LOG_PATH="$LOGS_DIR/esp32_serial.log"

echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ OPTION A: Wokwi Simulation"
echo " │ (ESP32 wird simuliert, kein Hardware nötig)"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │ cd \"$ESP_DIR\" && wokwi-cli . --timeout 300000 --serial-log-file \"$ESP_LOG_PATH\""
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ OPTION B: Hardware - Flash + Monitor"
echo " │ (ESP32 wird neu geflasht und dann überwacht)"
echo " ├─────────────────────────────────────────────────────────────────"
if [ -n "$DETECTED_COM" ]; then
echo " │ Erkannter Port: $DETECTED_COM"
echo " │ cd \"$ESP_DIR\" && pio run -t upload && pio device monitor --port $DETECTED_COM --baud 115200 2>&1 | tee \"$ESP_LOG_PATH\""
else
echo " │ cd \"$ESP_DIR\" && pio run -t upload && pio device monitor --baud 115200 2>&1 | tee \"$ESP_LOG_PATH\""
fi
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ OPTION C: Hardware - Nur Monitor (bereits geflasht)"
echo " │ (ESP32 ist schon geflasht, nur Serial Monitor starten)"
echo " ├─────────────────────────────────────────────────────────────────"
if [ -n "$DETECTED_COM" ]; then
echo " │ Erkannter Port: $DETECTED_COM"
echo " │ cd \"$ESP_DIR\" && pio device monitor --port $DETECTED_COM --baud 115200 2>&1 | tee \"$ESP_LOG_PATH\""
else
echo " │ cd \"$ESP_DIR\" && pio device monitor --baud 115200 2>&1 | tee \"$ESP_LOG_PATH\""
fi
echo " │"
echo " │ Falls ESP32 nicht automatisch startet, Reset-Taste drücken!"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ OPTION D: Hardware - Manueller Reset"
echo " │ (Monitor läuft, ESP32 per Reset-Taste neu starten)"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │ 1. Monitor starten (wie Option C)"
echo " │ 2. Reset-Taste auf ESP32 drücken"
echo " │ 3. Boot-Sequenz im Log beobachten"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ⚠️  WICHTIG: Terminal mit ESP32-Befehl offen lassen bis Session endet!"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ 🤖 DANACH: SYSTEM_MANAGER aktivieren"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │"
echo " │ 1. VS Code öffnen mit Claude Extension"
echo " │"
echo " │ 2. Plan Mode aktivieren:"
echo " │    Shift+Tab → bis '⏸ plan mode on' erscheint"
echo " │"
echo " │ 3. Session starten:"
echo " │    > session gestartet"
echo " │"
echo " │ 4. SYSTEM_MANAGER erstellt SESSION_BRIEFING.md"
echo " │"
echo " │ 5. Technical Manager übernimmt (Plan Mode verlassen)"
echo " │"
echo " │ Agent-Pfad: .claude/agents/System Manager/system-manager.md"
echo " │"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " Session beenden: ./scripts/debug/stop_session.sh"
echo ""
echo "════════════════════════════════════════════════════════════════"