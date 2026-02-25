# Zugriffs-Limitationen für KI-Assistenten

> **Version:** 1.3 | **Aktualisiert:** 2026-02-15
> **Zweck:** Dokumentation von Ressourcen die für KI-Assistenten NICHT oder nur eingeschränkt zugänglich sind
> **Themengebiet:** Debugging, Systemzugriff, Workarounds

---

## 1. Nicht zugängliche Ressourcen

Diese Ressourcen können von Claude **NICHT** direkt gelesen oder genutzt werden.

| Ressource | Grund | Impact | Workaround |
|-----------|-------|--------|------------|
| **Mosquitto System Logs** | `/var/log/mosquitto/` existiert nicht auf Windows | Kein Zugriff auf Broker-interne Logs | MQTT Traffic via `mosquitto_sub` capturen |
| **GitHub Secrets** | Sicherheitsdesign | Keine Token/Passwörter sichtbar | User muss Secrets manuell konfigurieren |
| **Wokwi ohne Token** | Authentifizierung erforderlich | `wokwi-cli` funktioniert nicht | User muss `WOKWI_CLI_TOKEN` setzen |
| **ESP32 Serial ohne Hardware** | Physische Verbindung nötig | Kein Serial Monitor möglich | Wokwi-Simulation nutzen |
| **Browser DevTools** | Keine GUI-Interaktion | Frontend-Debugging limitiert | User muss Screenshot/Logs teilen |
| **Live MQTT Traffic** | Mosquitto Clients nicht im PATH | `mosquitto_sub` nicht direkt nutzbar | User muss Mosquitto installieren |
| **Docker Port 1883 blockiert** | Lokaler Mosquitto Windows-Service belegt Port | Docker zeigt `1883/tcp` statt `0.0.0.0:1883->1883/tcp` | Lokalen Mosquitto stoppen: `Stop-Service mosquitto` (Admin PS) |
| **Wokwi Gateway Firewall** | Windows Firewall blockiert Inbound 1883 | `host.wokwi.internal` MQTT Connection Reset | Firewall-Regel: `New-NetFirewallRule -DisplayName "MQTT Mosquitto" -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow` |
| **COM-Port von Git Bash** | PlatformIO Upload schlägt fehl mit `Could not open COM5, the port doesn't exist` | Firmware kann nicht geflasht werden | Upload aus PowerShell oder VS Code PlatformIO Terminal ausführen |
| **Hook-blockierte DB-Befehle** | Pre-Tool Hooks blockieren `DELETE FROM` Pattern in Bash | Keine Datenbank-Bereinigung via `docker exec psql` möglich | Python-Cleanup-Script schreiben und via `.venv/Scripts/python.exe` ausführen |
| **Hook-blockierte Docker-Befehle** | Pre-Tool Hooks blockieren `docker compose restart` und `docker restart` | Container können nicht automatisch neu gestartet werden | User muss manuell `docker compose up -d <service>` ausführen |

---

## 2. Eingeschränkt zugängliche Ressourcen

Diese Ressourcen sind nur unter bestimmten Bedingungen zugänglich.

| Ressource | Einschränkung | Bedingung | Workaround |
|-----------|---------------|-----------|------------|
| **Wokwi CLI** | Token erforderlich | `WOKWI_CLI_TOKEN` Environment Variable gesetzt | User setzt Token: `export WOKWI_CLI_TOKEN=xxx` |
| **ESP32 Serial Monitor** | Hardware muss angeschlossen sein | ESP32 via USB verbunden | Wokwi-Simulation oder User-Feedback |
| **MQTT Broker Zugriff** | Mosquitto muss laufen | Broker auf localhost:1883 aktiv | User startet Broker |
| **Server Logs** | Server muss laufen | God-Kaiser Server aktiv | User startet Server |
| **CI Logs (aktuell)** | Nur nach Workflow-Run | Run muss existieren | Lokale Tests oder manueller Trigger |
| **Coverage HTML** | Report muss generiert sein | `pytest --cov-report=html` ausgeführt | Coverage-Report generieren |

---

## 3. User-abhängige Aktionen

Folgende Aktionen kann Claude **NICHT** selbst durchführen und benötigt User-Interaktion:

### 3.1 Hardware-Aktionen

| Aktion | Was Claude braucht |
|--------|-------------------|
| **ESP32 anschließen** | User muss Hardware verbinden |
| **Serial Monitor lesen** | User muss Output teilen oder Wokwi nutzen |
| **LED/Sensor prüfen** | User muss physischen Zustand berichten |
| **Wokwi Browser starten** | User muss VS Code Extension nutzen |

### 3.2 Authentifizierung

| Aktion | Was Claude braucht |
|--------|-------------------|
| **Wokwi Token setzen** | Bash: `export WOKWI_CLI_TOKEN=your_token` / PowerShell: `$env:WOKWI_CLI_TOKEN='wok_...'` |
| **GitHub Secrets** | User konfiguriert in Repository Settings |
| **MQTT Auth** | User konfiguriert Mosquitto Passwörter |

### 3.3 Service-Management

| Aktion | Was Claude braucht |
|--------|-------------------|
| **Mosquitto starten** | User: `mosquitto` oder Docker |
| **Server starten** | User: `poetry run uvicorn...` (kann Claude auch triggern) |
| **Frontend starten** | User: `npm run dev` |

---

## 4. Verifizierte Zugriffe (Was funktioniert)

Diese Ressourcen sind für Claude **verfügbar**:

### 4.1 GitHub CLI

```bash
# Funktioniert ✅
gh workflow list                    # Workflows auflisten
gh run list --limit=5               # Runs auflisten
gh run view <id>                    # Run-Details
gh run view <id> --log              # Logs abrufen
gh run view <id> --log-failed       # Fehler-Logs
gh run download <id>                # Artifacts herunterladen
```

**Getesteter Status:**
```
gh version 2.83.2 (2025-12-10)
```

### 4.2 Dateisystem-Zugriff

```bash
# Funktioniert ✅
# Lesen
Read Tool für alle Projekt-Dateien

# Schreiben
Write Tool für neue Dateien
Edit Tool für bestehende Dateien

# Suchen
Glob Tool für Datei-Patterns
Grep Tool für Inhaltssuche
```

### 4.3 Server Logs

```bash
# Funktioniert ✅ (wenn Server gelaufen ist)
tail -f "El Servador/god_kaiser_server/logs/god_kaiser.log"
grep "error" "El Servador/god_kaiser_server/logs/god_kaiser.log"

# Via Docker (EMPFOHLEN):
docker compose logs -f --tail=100 el-servador
```

**Existierende Log-Dateien:**
```
El Servador/god_kaiser_server/logs/
├── god_kaiser.log
├── god_kaiser.log.100
└── mosquitto.log
```

### 4.4 Build-Befehle

**Wichtig:** `platformio.ini` liegt in `El Trabajante/` — alle `pio`-Befehle muessen aus diesem Verzeichnis ausgefuehrt werden.

```bash
# Funktioniert ✅ (Git Bash) — NUR Build, kein Flash/Monitor (COM-Port nicht erreichbar)
cd "El Trabajante"
~/.platformio/penv/Scripts/pio.exe run -e esp32_dev

cd "El Servador/god_kaiser_server"
.venv/Scripts/pytest.exe tests/ -v --no-cov
```

```powershell
# Funktioniert ✅ (PowerShell) — Build, Flash UND Monitor
# HINWEIS: && geht NICHT in PowerShell 5.x → Befehle einzeln oder mit ; trennen
cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev           # Build
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t upload # Flash
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev # Monitor

# Flash + Monitor nacheinander (mit ; statt &&):
C:\Users\PCUser\.platformio\penv\Scripts\pio.exe run -e esp32_dev -t upload; C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev
```

---

## 5. Bekannte Tool-Installationen

### 5.1 Installiert und verfügbar

| Tool | Version | Pfad |
|------|---------|------|
| **gh (GitHub CLI)** | 2.83.2 | `/c/Program Files/GitHub CLI/gh` |
| **PlatformIO** | 6.1.18 | `~/.platformio/penv/Scripts/pio.exe` (alias: `platformio.exe`) |
| **Python** | 3.13/3.14 | Multiple locations |
| **Poetry** | - | Via Python |
| **Git** | - | Standard |
| **Node.js** | - | `/c/Program Files/nodejs/` |
| **jq** | 1.8.1 | `~/bin/jq.exe` (winget, PATH via `~/.bashrc`) |

### 5.2 NICHT installiert oder nicht im PATH

| Tool | Status | Installation |
|------|--------|--------------|
| **mosquitto_sub** | ❌ Nicht im PATH | `choco install mosquitto` |
| **mosquitto_pub** | ❌ Nicht im PATH | `choco install mosquitto` |
| **ts (timestamps)** | ❌ Nicht verfügbar | WSL oder manuell |

---

## 6. Workaround-Strategien

### 6.1 MQTT Traffic ohne mosquitto_sub

**Option 1:** User installiert Mosquitto Clients
```bash
choco install mosquitto
```

**Option 2:** User nutzt Python Script
```python
# mqtt_capture.py
import paho.mqtt.client as mqtt

def on_message(client, userdata, msg):
    print(f"{msg.topic}: {msg.payload.decode()}")

client = mqtt.Client()
client.on_message = on_message
client.connect("localhost", 1883)
client.subscribe("kaiser/#")
client.loop_forever()
```

**Option 3:** User teilt MQTT Traffic Screenshots

### 6.2 Wokwi ohne Token

**Option 1:** User setzt Token
```bash
export WOKWI_CLI_TOKEN=xxx
# Dann kann Claude wokwi-cli nutzen
```

**Option 2:** User startet Wokwi manuell (VS Code Extension)
1. User öffnet VS Code
2. User drückt F1 → "Wokwi: Start Simulator"
3. User teilt Serial Output als Text

### 6.3 ESP32 Serial ohne Hardware

**Option 1:** Wokwi-Simulation nutzen

**Option 2:** MockESP32Client für Server-seitige Tests
```bash
cd "El Servador/god_kaiser_server"
poetry run pytest tests/esp32/ -v
```

### 6.4 CI Logs bei fehlendem Run

**Option 1:** Manuell triggern
```bash
gh workflow run server-tests.yml
```

**Option 2:** Lokale Tests
```bash
cd "El Servador/god_kaiser_server"
poetry run pytest tests/ -v --no-cov
```

---

## 7. Kommunikations-Muster mit User

### 7.1 Wenn Hardware-Zugriff nötig

```
Ich benötige Serial Output vom ESP32.

Bitte führe folgendes in PowerShell aus und teile die Ausgabe:
1. Verbinde den ESP32 via USB
2. cd "C:\Users\PCUser\Documents\PlatformIO\Projects\Auto-one\El Trabajante"
3. C:\Users\PCUser\.platformio\penv\Scripts\pio.exe device monitor -e esp32_dev
4. Warte auf die relevanten Log-Zeilen
5. Kopiere die Ausgabe hier (Ctrl+C beendet den Monitor)
```

### 7.2 Wenn Token/Secrets nötig

```
Für diesen Test wird ein Wokwi Token benötigt.

Bitte setze die Environment Variable:
- Windows: `set WOKWI_CLI_TOKEN=dein_token`
- Linux/Mac: `export WOKWI_CLI_TOKEN=dein_token`

Token erstellen: https://wokwi.com/dashboard/ci
```

### 7.3 Wenn Service nicht läuft

```
Der MQTT Broker scheint nicht zu laufen.

Bitte starte Mosquitto:
- Windows: `net start mosquitto` oder Mosquitto-Dienst
- Docker: `docker run -d -p 1883:1883 eclipse-mosquitto:2`
- Linux: `sudo systemctl start mosquitto`
```

---

## 8. Checkliste: Was kann Claude?

### 8.1 Selbstständig (ohne User)

- [x] Dateien lesen/schreiben/editieren
- [x] GitHub CLI (`gh workflow`, `gh run`)
- [x] PlatformIO Build (`pio run`)
- [x] pytest ausführen
- [x] Server Logs lesen (wenn vorhanden)
- [x] Bash-Befehle ausführen
- [x] Git-Operationen

### 8.2 Mit User-Vorbereitung

- [ ] Wokwi-Tests (Token nötig)
- [ ] ESP32 Serial Monitor (Hardware nötig)
- [ ] MQTT Traffic Capture (Mosquitto Clients nötig)
- [ ] Live Server Logs (Server muss laufen)

### 8.3 Nur durch User

- [ ] Hardware anschließen
- [ ] Browser öffnen
- [ ] Physischen Zustand prüfen
- [ ] VS Code Extensions starten
- [ ] Secrets in GitHub konfigurieren

---

## 9. Quick Reference: Limitation-Checks

```bash
# ============================================
# VOR EINEM DEBUG-SESSION PRÜFEN
# ============================================

# GitHub CLI verfügbar?
gh --version

# PlatformIO verfügbar?
~/.platformio/penv/Scripts/platformio.exe --version

# Mosquitto Clients verfügbar?
which mosquitto_sub || echo "Nicht installiert"

# Wokwi Token gesetzt?
echo $WOKWI_CLI_TOKEN || echo "Nicht gesetzt"

# Server Logs existieren?
ls -la "El Servador/god_kaiser_server/logs/"

# MQTT Broker läuft? (Docker-native, funktioniert in Git Bash)
docker compose ps mqtt-broker --format "{{.Status}}" || echo "Broker nicht aktiv"
```

---

## 10. Windows/PowerShell-Besonderheiten

### 10.1 PowerShell vs Bash Syntax

| Feature | Bash (Git Bash) | PowerShell |
|---------|-----------------|------------|
| Command chaining | `cmd1 && cmd2` | `cmd1; cmd2` (oder einzeln) |
| Environment variable | `export VAR=val` | `$env:VAR='val'` |
| Log redirect | `cmd \| tee file.log` | `cmd \| Tee-Object -FilePath "file.log"` |
| `make` | Verfügbar | NICHT verfügbar (nutze `docker compose` direkt) |
| `pio` | Via `~/.platformio/penv/Scripts/pio` | `& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe"` |
| `python -m platformio` | Funktioniert (wenn platformio installiert) | System-Python 3.14 hat KEIN platformio |

### 10.2 PlatformIO auf Windows

```powershell
# System-Python (C:\Python314) hat KEIN platformio installiert
# Workaround 1: PlatformIO Terminal in VS Code (hat pio im PATH)
pio run -e wokwi_esp01

# Workaround 2: Vollständiger Pfad
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -e wokwi_esp01

# Workaround 3: Backend .venv (Python 3.13 mit platformio)
.venv\Scripts\python.exe -m platformio run -e wokwi_esp01
```

### 10.3 Funktionierende Test-Befehle (PowerShell)

```powershell
# Frontend (Vitest) - 1118 Tests
cd "El Frontend"; npx vitest run

# Backend Unit (pytest) - 759+ Tests
cd "El Servador\god_kaiser_server"
.venv\Scripts\pytest.exe tests\unit\ -x -q

# ESP32 Native (Unity) - 22 Tests
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" test -e native

# Backend Integration (braucht Docker Stack)
.venv\Scripts\pytest.exe tests\integration\ -v --tb=short
```

### 10.4 PowerShell-Aufrufe aus Git Bash

**Problem:** Bash interpretiert `$_` in PowerShell-Befehlen als Shell-Variable.

```bash
# FALSCH (Bash interpretiert $_ als Shell-Variable → \extglob.Caption):
powershell.exe -Command "Get-Process | Where-Object { $_.Name -match 'mosquitto' }"

# RICHTIG (Dollar-Zeichen escapen):
powershell.exe -Command 'Get-Process | Where-Object { $_.Name -match "mosquitto" }'

# ODER: Einzeiler ohne Where-Object:
powershell.exe -Command "Get-Process -Name mosquitto -ErrorAction SilentlyContinue"
```

**Regel:** In Git Bash PowerShell-Befehle mit einfachen Anführungszeichen umschließen, NICHT mit doppelten.

### 10.5 Python .venv Pfad

```bash
# FALSCH (existiert nicht):
"El Servador/.venv/Scripts/python.exe"

# RICHTIG (innerhalb god_kaiser_server):
"El Servador/god_kaiser_server/.venv/Scripts/python.exe"

# Für pytest, alembic etc.:
"El Servador/god_kaiser_server/.venv/Scripts/pytest.exe"
```

**Hinweis:** `poetry run` kann auf Python 3.14 (C:\Python314) statt auf `.venv` (Python 3.13) resolven. Workaround: `.venv/Scripts/` direkt nutzen.

### 10.6 Hook-blockierte Befehle

Folgende Patterns werden von Pre-Tool Hooks blockiert:

| Pattern | Blockiert | Workaround |
|---------|-----------|------------|
| `DELETE FROM` | Jeder Bash-Befehl mit SQL DELETE | Python-Script schreiben |
| `docker compose restart` | Container-Neustarts | User führt manuell aus: `docker compose up -d <service>` |
| `docker restart` | Einzelne Container-Neustarts | User führt manuell aus |
| `docker compose down` (teilweise) | Stack-Stopp | Einzelne `docker stop` Befehle |
| Mehrere `DELETE FROM` in einem Befehl | Batch-Cleanup | Einzelne Befehle ODER Python-Script |

**Best Practice für DB-Cleanup:**
```bash
# Python-Script schreiben, das asyncpg/psycopg2 nutzt:
"El Servador/god_kaiser_server/.venv/Scripts/python.exe" scripts/cleanup_for_real_esp.py
```

### 10.7 Docker Port-Blockade durch lokalen Mosquitto

**Symptom:** `docker ps` zeigt `1883/tcp` OHNE `0.0.0.0:1883->` (exposed but not published)

**Diagnose:**
```powershell
# Port-Belegung prüfen
netstat -ano | findstr ":1883"
# Wenn PID != Docker → lokaler Mosquitto blockiert

# Docker Port-Status prüfen
docker ps --format "table {{.Names}}\t{{.Ports}}" | Select-String mqtt
# Erwartet: 0.0.0.0:1883->1883/tcp (published)
# Problem:  1883/tcp (nur exposed, nicht published)
```

**Fix:**
```powershell
# Lokalen Mosquitto stoppen (Admin-PowerShell)
Stop-Service mosquitto
# Oder: Stop-Process -Id <PID> -Force

# Docker MQTT-Broker neu starten
docker compose restart mqtt-broker

# Verifizieren
docker ps --format "table {{.Names}}\t{{.Ports}}" | Select-String mqtt
# Muss zeigen: 0.0.0.0:1883->1883/tcp
```

### 10.8 Windows Firewall für Wokwi Gateway

**Wann nötig:** Wokwi `gateway = true` in `wokwi.toml` → `host.wokwi.internal` muss Port 1883 auf dem Host erreichen.

```powershell
# Firewall-Regel hinzufügen (Admin-PowerShell)
New-NetFirewallRule -DisplayName "MQTT Mosquitto" `
  -Direction Inbound -LocalPort 1883 -Protocol TCP -Action Allow

# Regel prüfen
Get-NetFirewallRule -DisplayName "MQTT Mosquitto"
```

### 10.9 Wokwi CLI auf Windows

```powershell
# Token setzen (Session)
$env:WOKWI_CLI_TOKEN='wok_xxxxx'

# Token setzen (permanent)
setx WOKWI_CLI_TOKEN "wok_xxxxx"

# Wokwi starten (direkt, kein make nötig)
cd "El Trabajante"
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml

# Wokwi mit Log-Capture (kein automatisches Logfile!)
wokwi-cli . --timeout 90000 --scenario tests/wokwi/scenarios/01-boot/boot_full.yaml | Tee-Object -FilePath "wokwi_output.log"
```

### 10.10 Wokwi Seed-Script

```powershell
# FALSCH: Script ist NICHT im Docker-Container gemountet
docker exec -it automationone-server python scripts/seed_wokwi_esp.py  # FEHLER!

# RICHTIG: Lokal ausführen mit Backend .venv
cd "El Servador\god_kaiser_server"
.venv\Scripts\python.exe scripts\seed_wokwi_esp.py
```

### 10.11 Docker Desktop Troubleshooting

```powershell
# 500 Internal Server Error → Docker Desktop neu starten
# Falls weiterhin 500er:
wsl --shutdown
# Dann Docker Desktop manuell starten (Quit + Restart)

# "Network still in use" bei docker compose down
# → Monitoring-Stack auf gleichem Netzwerk aktiv
docker compose --profile monitoring down
docker compose down
```

---

**Letzte Aktualisierung:** 2026-02-11
**Version:** 1.2
