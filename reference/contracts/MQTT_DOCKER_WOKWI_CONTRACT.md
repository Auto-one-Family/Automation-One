# MQTT Docker-Wokwi Transport Contract

**Version:** 1.0
**Status:** Verbindlich ab 2026-04-06
**Scope:** Alle Wokwi-SIL-Tests (lokal, Docker, CI)

---

## 1. Verbindlicher Transportpfad

```
ESP32 (Wokwi Simulator)
    |
    | TCP:1883 → host.wokwi.internal
    |
    v
Host-Netzwerk (localhost:1883)
    |
    | Docker Port-Mapping: 0.0.0.0:1883 → 1883/tcp
    |
    v
Mosquitto Container (eclipse-mosquitto:2)
    |
    | Docker-Network: automationone-net
    |
    v
El Servador Container (FastAPI)
```

## 2. Hostname-Aufloesung (UNVERAENDERLICH)

| Kontext | ESP32 MQTT Host | Aufloesung | Broker-Erreichbarkeit |
|---------|-----------------|------------|----------------------|
| **Lokal (Windows/Mac)** | `host.wokwi.internal` | Wokwi Gateway → `127.0.0.1` | Docker `0.0.0.0:1883→1883` |
| **CI (GitHub Actions)** | `host.wokwi.internal` | Wokwi Gateway → Docker Bridge | Inline Mosquitto `-p 1883:1883` |
| **Docker-intern** | `mqtt-broker` | Docker DNS | Direkt ueber Docker-Network |

### Pflicht-Voraussetzungen

1. **wokwi.toml:** `gateway = true` MUSS gesetzt sein
2. **Docker Port:** `0.0.0.0:1883->1883/tcp` MUSS verifizierbar sein
3. **Windows Firewall:** Inbound TCP 1883 MUSS erlaubt sein
4. **Kein lokaler Mosquitto-Service:** Port 1883 darf nicht blockiert sein

## 3. Firmware Build-Flags (Compile-Time)

```ini
# platformio.ini [env:wokwi_simulation]
-D WOKWI_SIMULATION=1
-D WOKWI_MQTT_HOST=\"host.wokwi.internal\"
-D WOKWI_MQTT_PORT=1883
-D WOKWI_WIFI_SSID=\"Wokwi-GUEST\"
-D WOKWI_WIFI_PASSWORD=\"\"
```

**Regel:** Credentials kommen ausschliesslich ueber Build-Flags oder Env-Variablen. Kein Hardcoding in Quellcode.

## 4. Mosquitto-Konfiguration

### 4.1 Verbindliche Basis-Config (alle Kontexte)

```conf
listener 1883 0.0.0.0
allow_anonymous true
persistence false
```

### 4.2 Erweiterte Config (empfohlen fuer Debugging)

```conf
listener 1883 0.0.0.0
allow_anonymous true
persistence false
log_dest stderr
log_type error
log_type warning
log_type notice
log_type information
connection_messages true
log_timestamp true
log_timestamp_format %Y-%m-%dT%H:%M:%SZ
```

### 4.3 Lokale Entwicklung (docker-compose.yml)

Nutzt `docker/mosquitto/mosquitto.conf` mit:
- Persistence: `true` (State-Erhalt zwischen Tests)
- WebSocket: Port 9001 (fuer Frontend-Debug)
- Erweiterte Logging (stdout → Docker json-file → Loki)

### 4.4 CI (GitHub Actions)

Nutzt Inline-Config oder `.github/mosquitto/mosquitto.conf` mit:
- Persistence: `false` (ephemeral)
- Kein WebSocket
- Logging: `stderr` (GitHub Actions Capture)

## 5. Verbotene Muster

| Muster | Grund | Alternative |
|--------|-------|-------------|
| Hardcoded `localhost` in Firmware | Bricht in CI/Docker | `host.wokwi.internal` ueber Build-Flag |
| `sleep 25` als einzige Wartelogik | Fragil bei langsamen Runnern | Dynamic Wait (Abschnitt 6) |
| Verschiedene Mosquitto-Inline-Configs pro Job | Inkonsistentes Verhalten | Standardisierte Templates (Abschnitt 4) |
| Mosquitto ohne Healthcheck starten | Race-Condition | Loop-basierter Readiness-Check |

## 6. Verbindliches Warte-Pattern (Dynamic Wait)

### Fuer CI-Jobs mit MQTT-Injection

```bash
# 1. Wokwi starten (Background)
timeout 120 wokwi-cli . \
  --timeout 90000 \
  --scenario "$SCENARIO" \
  > "$LOGFILE" 2>&1 &
WOKWI_PID=$!

# 2. Dynamic Wait auf MQTT-Verbindung (max 60s)
MQTT_READY=false
for i in $(seq 1 60); do
  if grep -q "MQTT connected" "$LOGFILE" 2>/dev/null; then
    echo "MQTT connected after ${i}s"
    MQTT_READY=true
    break
  fi
  sleep 1
done

if [ "$MQTT_READY" != "true" ]; then
  echo "FEHLER: MQTT nicht verbunden nach 60s"
  kill $WOKWI_PID 2>/dev/null
  exit 1
fi

# 3. Buffer nach Verbindung
sleep 2

# 4. MQTT-Injection ausfuehren
mosquitto_pub -h localhost -t "$TOPIC" -m "$PAYLOAD"

# 5. Wokwi abwarten
wait $WOKWI_PID
EXIT_CODE=$?
```

### Fuer Broker-Readiness

```bash
echo "Warte auf Mosquitto..."
for i in {1..30}; do
  if docker exec mosquitto mosquitto_pub -t 'health/check' -m 'ping' 2>/dev/null; then
    echo "Mosquitto ready nach ${i}s"
    break
  fi
  sleep 1
done
```

## 7. Verifikations-Checkliste (vor jedem Test-Run)

```bash
# 1. Docker-Port verifizieren
docker ps --format "{{.Names}}\t{{.Ports}}" | grep mqtt
# Erwartet: automationone-mqtt   0.0.0.0:1883->1883/tcp

# 2. Broker Healthcheck
docker exec automationone-mqtt mosquitto_pub -t 'test/ping' -m 'pong'
# Erwartet: Exit-Code 0

# 3. Kein Port-Konflikt
# Windows: netstat -ano | findstr :1883
# Linux: ss -tlnp | grep 1883
# Erwartet: Nur Docker-Prozess

# 4. Wokwi Gateway-Test (im Simulator)
# Serial-Log muss zeigen: "MQTT connected successfully"
```

## 8. Fehlerdiagnose-Matrix

| Symptom | Wahrscheinliche Ursache | Diagnose | Fix |
|---------|------------------------|----------|-----|
| "Connection reset by peer" | Lokaler Mosquitto-Service blockiert Port | `netstat -ano \| findstr :1883` | `Stop-Service mosquitto` |
| "Connection timed out" | Firewall blockiert | Firewall-Regel pruefen | `New-NetFirewallRule -DisplayName "MQTT" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow` |
| "MQTT connected" fehlt im Log | Broker nicht erreichbar | `docker ps` pruefen | `docker compose restart mqtt-broker` |
| Test laeuft mal gruen, mal rot | Race-Condition durch `sleep 25` | Timing-Logs pruefen | Dynamic Wait Pattern (Abschnitt 6) |
| CI-Job timeout nach 120s | Wokwi-Simulator haengt | Serial-Log auf Crash pruefen | Firmware-Build verifizieren |

## 9. Secret-Management

| Secret | Kontext | Quelle |
|--------|---------|--------|
| `WOKWI_CLI_TOKEN` | CI/Lokal | GitHub Secret / Env-Variable |
| MQTT Username | Produktion (nicht Wokwi) | `.env` / Docker Secret |
| MQTT Password | Produktion (nicht Wokwi) | `.env` / Docker Secret |

**Regel:** Kein Secret in versionierten Dateien. Nur ueber `$env:` (Windows) oder `export` (Linux).

---

**Gueltig ab:** 2026-04-06
**Naechste Revision:** Bei Aenderung des MQTT-Pfades oder Wokwi-CLI-Version
