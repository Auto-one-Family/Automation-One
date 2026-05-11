#!/bin/bash
# ============================================================================
# stop_session.sh - Debug-Session beenden und archivieren
# ============================================================================
# Version: 3.0 (Robuster Server-Stop über Port, verbesserte Archivierung)
#
# Usage: ./scripts/debug/stop_session.sh
#
# Was passiert:
#   1. MQTT-Capture stoppen
#   2. Server stoppen (wenn mit --with-server gestartet)
#   3. Alle Logs nach logs/archive/{session_id}/ verschieben
#   4. Alle Reports nach .claude/reports/archive/{session_id}/ verschieben
#   5. logs/current/ und reports/current/ leeren
# ============================================================================

set -e  # Bei Fehler abbrechen

# ----------------------------------------------------------------------------
# Konfiguration
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOGS_CURRENT="$PROJECT_ROOT/logs/current"
LOGS_ARCHIVE="$PROJECT_ROOT/logs/archive"
REPORTS_CURRENT="$PROJECT_ROOT/.claude/reports/current"
REPORTS_ARCHIVE="$PROJECT_ROOT/.claude/reports/archive"
SESSION_INFO="$LOGS_CURRENT/.session_info"

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
# Hilfsfunktionen
# ----------------------------------------------------------------------------

# Server-PID über Port 8000 finden
get_server_pid_by_port() {
    if $IS_WINDOWS; then
        # LISTENING (EN) oder ABHÖREN (DE), grep -a für binary-safe (Umlaut-Probleme)
        /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -a ":8000" | grep -a "LISTENING\|ABH" | awk '{print $5}' | head -1
    else
        lsof -ti:8000 2>/dev/null || netstat -tlnp 2>/dev/null | grep ":8000" | awk '{print $7}' | cut -d'/' -f1
    fi
}

# Prüfen ob Port 8000 belegt ist
is_server_running() {
    if $IS_WINDOWS; then
        # LISTENING (EN) oder ABHÖREN (DE), grep -a für binary-safe
        /c/Windows/System32/netstat.exe -ano 2>/dev/null | grep -a ":8000" | grep -a -q "LISTENING\|ABH"
    else
        netstat -tuln 2>/dev/null | grep -q ":8000 "
    fi
}

# Prozess beenden (cross-platform)
kill_process() {
    local PID=$1
    if [ -z "$PID" ]; then
        return 1
    fi
    
    if $IS_WINDOWS; then
        taskkill //PID "$PID" //F //T >/dev/null 2>&1 || true
    else
        kill -TERM "$PID" 2>/dev/null || true
        sleep 1
        kill -9 "$PID" 2>/dev/null || true
    fi
}

# ----------------------------------------------------------------------------
# Header
# ----------------------------------------------------------------------------
echo ""
echo "════════════════════════════════════════════════════════════════"
echo " 🛑 Debug-Session wird beendet..."
echo "════════════════════════════════════════════════════════════════"
echo ""

# ----------------------------------------------------------------------------
# Schritt 1: Session-Info prüfen
# ----------------------------------------------------------------------------
echo "[1/6] Session-Info laden..."

if [ ! -f "$SESSION_INFO" ]; then
    echo ""
    echo "      ❌ Keine aktive Debug-Session gefunden"
    echo ""
    echo "      Es existiert keine .session_info in logs/current/"
    echo ""
    echo "      Starte zuerst eine Session:"
    echo "        ./scripts/debug/start_session.sh [name] [--with-server]"
    echo ""
    exit 1
fi

# Session-Info einlesen
source "$SESSION_INFO"

echo "      ✓ Session gefunden: $SESSION_ID"
echo "      ✓ Gestartet: $STARTED_AT"

# ----------------------------------------------------------------------------
# Schritt 2: MQTT-Capture stoppen
# ----------------------------------------------------------------------------
echo ""
echo "[2/6] MQTT-Capture stoppen..."

MQTT_STOPPED=false

if [ -n "$MQTT_PID" ]; then
    # Prüfen ob Prozess noch läuft
    PROCESS_RUNNING=false
    
    if $IS_WINDOWS; then
        if tasklist //FI "PID eq $MQTT_PID" 2>/dev/null | grep -q "$MQTT_PID"; then
            PROCESS_RUNNING=true
        fi
    else
        if kill -0 "$MQTT_PID" 2>/dev/null; then
            PROCESS_RUNNING=true
        fi
    fi
    
    if $PROCESS_RUNNING; then
        kill_process "$MQTT_PID"
        sleep 1
        echo "      ✅ MQTT-Capture gestoppt (PID: $MQTT_PID)"
        MQTT_STOPPED=true
    else
        echo "      ⚠️  MQTT-Prozess war bereits beendet (PID: $MQTT_PID)"
    fi
else
    echo "      ⚠️  Keine MQTT-PID in Session-Info"
fi

# Fallback: Alle mosquitto_sub Prozesse beenden
if ! $MQTT_STOPPED && $IS_WINDOWS; then
    if tasklist 2>/dev/null | grep -q "mosquitto_sub"; then
        taskkill //IM "mosquitto_sub.exe" //F >/dev/null 2>&1 || true
        echo "      ✅ Alle mosquitto_sub Prozesse beendet"
    fi
fi

# ----------------------------------------------------------------------------
# Schritt 3: Server stoppen (wenn mit --with-server gestartet)
# ----------------------------------------------------------------------------
echo ""
echo "[3/6] Server prüfen..."

if [ "$WITH_SERVER" = "true" ]; then
    if is_server_running; then
        echo "      ⏳ Server wird gestoppt..."
        
        # PID über Port holen (robuster als gespeicherte PID)
        CURRENT_SERVER_PID=$(get_server_pid_by_port)
        
        if [ -n "$CURRENT_SERVER_PID" ]; then
            kill_process "$CURRENT_SERVER_PID"
            sleep 2
            
            # Verifizieren
            if is_server_running; then
                echo "      ⚠️  Server reagiert nicht - zweiter Versuch..."
                # Auf Windows: Alle Python-Prozesse auf Port 8000 killen
                if $IS_WINDOWS; then
                    CURRENT_SERVER_PID=$(get_server_pid_by_port)
                    if [ -n "$CURRENT_SERVER_PID" ]; then
                        taskkill //PID "$CURRENT_SERVER_PID" //F //T >/dev/null 2>&1 || true
                        sleep 2
                    fi
                fi
            fi
            
            if ! is_server_running; then
                echo "      ✅ Server gestoppt (Port 8000 frei)"
            else
                echo "      ⚠️  Server-Port 8000 noch belegt!"
                echo "         Manuell beenden: taskkill //PID $(get_server_pid_by_port) //F"
            fi
        else
            echo "      ⚠️  Konnte Server-PID nicht ermitteln"
        fi
    else
        echo "      ℹ️  Server war bereits beendet"
    fi
else
    if is_server_running; then
        echo "      ℹ️  Server läuft (wurde nicht mit dieser Session gestartet)"
    else
        echo "      ℹ️  Server wurde nicht mit dieser Session gestartet"
    fi
fi

# ----------------------------------------------------------------------------
# Schritt 4: Archiv-Ordner erstellen
# ----------------------------------------------------------------------------
echo ""
echo "[4/6] Archiv-Ordner erstellen..."

LOGS_DEST="$LOGS_ARCHIVE/$SESSION_ID"
REPORTS_DEST="$REPORTS_ARCHIVE/$SESSION_ID"

mkdir -p "$LOGS_DEST"
mkdir -p "$REPORTS_DEST"

echo "      ✓ logs/archive/$SESSION_ID/"
echo "      ✓ .claude/reports/archive/$SESSION_ID/"

# ----------------------------------------------------------------------------
# Schritt 5: Logs archivieren
# ----------------------------------------------------------------------------
echo ""
echo "[5/6] Logs archivieren..."

LOG_COUNT=0

# Funktion: Datei sicher archivieren
archive_log() {
    local FILE=$1
    local NAME=$(basename "$FILE")
    
    if [ -L "$FILE" ]; then
        # Symlink: Inhalt kopieren
        if cp -L "$FILE" "$LOGS_DEST/$NAME" 2>/dev/null; then
            rm -f "$FILE"
            echo "      ✅ $NAME (Snapshot von Symlink)"
            ((LOG_COUNT++)) || true
        else
            echo "      ⚠️  $NAME (Symlink-Kopie fehlgeschlagen)"
        fi
    elif [ -f "$FILE" ]; then
        # Normale Datei: Verschieben
        mv "$FILE" "$LOGS_DEST/"
        echo "      ✅ $NAME"
        ((LOG_COUNT++)) || true
    fi
}

# Alle Log-Dateien archivieren
archive_log "$LOGS_CURRENT/mqtt_traffic.log"
archive_log "$LOGS_CURRENT/esp32_serial.log"
archive_log "$LOGS_CURRENT/server_console.log"
archive_log "$LOGS_CURRENT/god_kaiser.log"

# STATUS.md archivieren (wichtiger Agent-Kontext)
if [ -f "$LOGS_CURRENT/STATUS.md" ]; then
    mv "$LOGS_CURRENT/STATUS.md" "$LOGS_DEST/"
    echo "      ✅ STATUS.md"
    ((LOG_COUNT++)) || true
fi

if [ $LOG_COUNT -eq 0 ]; then
    echo "      ⚠️  Keine Log-Dateien gefunden"
fi

# ----------------------------------------------------------------------------
# Schritt 6: Reports archivieren
# ----------------------------------------------------------------------------
echo ""
echo "[6/6] Reports archivieren..."

REPORT_COUNT=0

# Alle .md Dateien verschieben
if [ -d "$REPORTS_CURRENT" ]; then
    for report in "$REPORTS_CURRENT"/*.md; do
        if [ -f "$report" ]; then
            REPORT_NAME=$(basename "$report")
            mv "$report" "$REPORTS_DEST/"
            echo "      ✅ $REPORT_NAME"
            ((REPORT_COUNT++)) || true
        fi
    done
fi

if [ $REPORT_COUNT -eq 0 ]; then
    echo "      ℹ️  Keine Reports gefunden (Agents haben keine erstellt)"
fi

# ----------------------------------------------------------------------------
# Aufräumen
# ----------------------------------------------------------------------------

# Session-Info löschen
rm -f "$SESSION_INFO"

# .gitkeep wiederherstellen
touch "$LOGS_CURRENT/.gitkeep" 2>/dev/null || true
touch "$REPORTS_CURRENT/.gitkeep" 2>/dev/null || true

# Restliche temporäre Dateien entfernen
rm -f "$LOGS_CURRENT"/*.tmp 2>/dev/null || true

# ----------------------------------------------------------------------------
# Abschluss-Zusammenfassung
# ----------------------------------------------------------------------------

ENDED_AT=$(date +"%Y-%m-%d %H:%M:%S")

echo ""
echo "════════════════════════════════════════════════════════════════"
echo " ✅ Debug-Session beendet"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo " Session:   $SESSION_ID"
echo " Gestartet: $STARTED_AT"
echo " Beendet:   $ENDED_AT"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ 📁 Archiviert:"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │ Logs:    $LOG_COUNT Datei(en)"
echo " │          → logs/archive/$SESSION_ID/"
echo " │"
echo " │ Reports: $REPORT_COUNT Datei(en)"
echo " │          → .claude/reports/archive/$SESSION_ID/"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ 🔍 Archiv anzeigen:"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │ ls -la \"logs/archive/$SESSION_ID/\""
echo " │ ls -la \".claude/reports/archive/$SESSION_ID/\""
echo " │"
echo " │ Oder im Explorer:"
echo " │ explorer \"logs\\archive\\$SESSION_ID\""
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo " ┌─────────────────────────────────────────────────────────────────"
echo " │ 🚀 Neue Session starten:"
echo " ├─────────────────────────────────────────────────────────────────"
echo " │ ./scripts/debug/start_session.sh [name] [--with-server]"
echo " │"
echo " │ Beispiele:"
echo " │   ./scripts/debug/start_session.sh boot-test"
echo " │   ./scripts/debug/start_session.sh config-test --with-server"
echo " └─────────────────────────────────────────────────────────────────"
echo ""
echo "════════════════════════════════════════════════════════════════"