# Bugs Found - Wokwi Integration

> **Dokument-Zweck:** Dokumentation aller gefundenen Bugs bei Wokwi Integration (CI/CD + lokale Entwicklung) und Server-Bugs
> **Erstellt:** 2026-01-05
> **Aktualisiert:** 2026-01-08
> **Status:** Aktiv

---

## Übersicht

### Lokale Entwicklung (2026-01-06)

| Bug | Status | Beschreibung |
|-----|--------|--------------|
| **Bug R** | ✅ GEFIXT | Timezone-Anzeigefehler im Frontend |
| **Bug S** | ✅ GEFIXT | Ungültige ESP ID (ESP_WOKWI001) in Datenbank |
| **Bug T** | ⚠️ BEKANNT | MQTT-Verbindung nach Laptop-Standby |
| **Bug U** | ✅ GEFIXT | ESP-Status keine automatische Aktualisierung (WebSocket Timing) |
| **Bug V** | 🔴 OFFEN | MQTT Connection Loop - Server reconnected jede Sekunde |
| **Bug W** | 🔴 OFFEN | Keine WebSocket esp_health Broadcasts (Folge von Bug V) |
| **Bug X** | ✅ GEFIXT | Initial-Heartbeat durch Throttle blockiert (ESP32 Firmware) |

### Server-Bugs (2026-01-08)

| Bug | Status | Beschreibung |
|-----|--------|--------------|
| **Bug Y** | ✅ GEFIXT | Mock-ESP Auto-Heartbeat funktioniert nicht nach Server-Neustart |
| **Bug Z** | ✅ GEFIXT | Windows Unicode Encoding Error in Console-Logging |

### CI/CD Pipeline (2026-01-05)

| Bug | Status | Beschreibung |
|-----|--------|--------------|
| **Bug #1** | ✅ GEFIXT | Mosquitto Health-Check Timeout |
| **Bug #2** | ✅ GEFIXT | WOKWI_CLI_TOKEN Secret nicht konfiguriert |
| **Bug #3** | ✅ GEFIXT | wokwi.toml nicht gefunden - falscher Pfad |
| **Bug #4** | ✅ GEFIXT | Ungültige Szenario-Syntax (timeout pro Step) |

---

# TEIL 1: Lokale Entwicklungs-Bugs

---

## Bug R: Timezone-Anzeigefehler im Frontend (GEFIXT)

### Zusammenfassung

Der letzte Heartbeat-Timestamp zeigte "vor 1 Stunde" statt "vor 30 Sekunden" an.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Komponente** | Frontend (`El Frontend/src/utils/formatters.ts`) |
| **Fix Status** | ✅ GEFIXT |

### Symptome

- ESP_00000001 sendet Heartbeats alle 60 Sekunden
- Server empfängt und speichert korrekt (verifiziert in Logs)
- Frontend zeigt "vor 1 Stunde" statt "vor 30 Sekunden"

### Root Cause Analyse

**Problem:**
- Server speichert `last_seen` als UTC-Timestamp ohne `Z`-Suffix: `2026-01-06T01:26:48`
- JavaScript `new Date()` interpretiert Timestamps ohne Timezone-Info als **lokale Zeit** (CET)
- Resultat: 1 Stunde Verschiebung (CET = UTC+1)

**Beispiel:**
```
DB speichert:     2026-01-06T01:26:48 (gemeint: UTC)
JS interpretiert: 2026-01-06T01:26:48 CET = 2026-01-06T00:26:48 UTC
Aktuelle Zeit:    2026-01-06T02:27:00 CET
Differenz:        ~1 Stunde statt ~30 Sekunden
```

### Lösung

**Datei:** `El Frontend/src/utils/formatters.ts`

Neue Helper-Funktion `normalizeTimestamp()` hinzugefügt:

```typescript
function normalizeTimestamp(date: string | Date): Date {
  if (date instanceof Date) {
    return date
  }
  // If no timezone info, assume UTC
  if (!date.endsWith('Z') && !date.includes('+') && !date.includes('-', 10)) {
    return new Date(date + 'Z')
  }
  return new Date(date)
}
```

Diese Funktion wird in allen Zeit-Formatierungs-Funktionen verwendet:
- `formatRelativeTime()`
- `formatDateTime()`
- `formatDate()`
- `formatTime()`

---

## Bug S: Ungültige ESP ID in Datenbank (GEFIXT)

### Zusammenfassung

500 Internal Server Error beim Laden der ESP-Geräte-Liste im Frontend.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Komponente** | Server Datenbank + Pydantic Schema |
| **Fix Status** | ✅ GEFIXT |

### Symptome

- Frontend zeigt "0 DB devices" und nur Mock ESPs
- Console-Log: `GET /api/v1/esp/devices 500 (Internal Server Error)`
- Server-Log: `ValidationError for ESPDeviceResponse.device_id`

### Root Cause Analyse

**Problem:**
- Alter Datenbank-Eintrag: `device_id = 'ESP_WOKWI001'`
- Pydantic-Schema Pattern: `^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$`
- `ESP_WOKWI001` passt NICHT:
  - `WOKWI` enthält Buchstaben die keine Hex-Zeichen sind (W, K, I)
  - Nur 8 Zeichen nach `ESP_`, aber nicht alle sind `[A-F0-9]`

**Server-Fehler:**
```
ValidationError: 1 validation error for ESPDeviceResponse
device_id
  String should match pattern '^(ESP_[A-F0-9]{8}|MOCK_[A-Z0-9]+)$'
  input_value='ESP_WOKWI001'
```

### Lösung

Ungültigen Eintrag aus Datenbank gelöscht:

```sql
DELETE FROM esp_devices WHERE device_id = 'ESP_WOKWI001';
```

**Korrekte ESP ID:** `ESP_00000001` (8 Hex-Zeichen: 0-9, A-F)

**Wichtig für zukünftige ESPs:**
- Format: `ESP_XXXXXXXX` (genau 8 Hex-Zeichen)
- Erlaubt: `0-9`, `A-F` (Großbuchstaben)
- Beispiele: `ESP_00000001`, `ESP_12AB34CD`, `ESP_DEADBEEF`

---

## Bug T: MQTT-Verbindung nach Laptop-Standby (BEKANNT)

### Zusammenfassung

Wokwi-ESP kann sich nach Laptop-Standby nicht mehr mit MQTT verbinden.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Komponente** | Wokwi Gateway / Netzwerk |
| **Fix Status** | ⚠️ BEKANNT (Workaround verfügbar) |

### Symptome

```
[E][WiFiGeneric.cpp:1583] hostByName(): DNS Failed for host.wokwi.internal
mqtt_state: -2
reconnect_attempts: 4, 5, 6...
```

### Root Cause Analyse

**Problem:**
- Laptop geht in Standby
- Wokwi-Gateway verliert Netzwerkverbindung zum Host
- Nach Aufwachen: `host.wokwi.internal` kann nicht mehr aufgelöst werden
- ESP32-Firmware versucht endlos reconnect, scheitert

### Workaround

**Wokwi-Simulation neu starten:**

1. `Ctrl+C` im Wokwi CLI Terminal
2. Wokwi erneut starten:
   ```powershell
   cd "El Trabajante"
   wokwi-cli . --timeout 0
   ```

**Langfristige Lösung:** Keine bekannt - Wokwi-Gateway-Limitation.

---

# TEIL 2: CI/CD Pipeline Bugs

---

## Bug #1: Mosquitto Health-Check Timeout (KRITISCH)

### Zusammenfassung

Der Wokwi-Workflow schlägt beim Schritt "Start Mosquitto MQTT Broker" fehl, obwohl Mosquitto tatsächlich läuft und Verbindungen akzeptiert.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Workflow Run ID** | 20703443328 |
| **Fehler-Schritt** | `Start Mosquitto MQTT Broker` |
| **Exit Code** | 1 |
| **Ursache** | Fehlerhafter Health-Check |
| **Fix Status** | ANGEWENDET (2026-01-05) |

### Symptome

```
Mosquitto failed to start
```

**Aber in den Logs sieht man:**
```
1767580771: mosquitto version 2.0.22 running
1767580771: Opening ipv4 listen socket on port 1883.
1767580771: New connection from 127.0.0.1:45580 on port 1883.
1767580771: New client connected from 127.0.0.1:45580 as auto-DBE4B187-...
```

Mosquitto läuft und akzeptiert Verbindungen erfolgreich!

### Root Cause Analyse

**Datei:** [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml)
**Zeilen:** 66-77

```yaml
# Wait for Mosquitto to be ready
echo "Waiting for Mosquitto to start..."
for i in {1..30}; do
  if docker exec mosquitto mosquitto_sub -t '#' -C 1 -W 1 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    docker logs mosquitto
    exit 1
  fi
  sleep 1
done
```

**Problem:**
- `mosquitto_sub -t '#' -C 1 -W 1` wartet auf **eine eingehende Nachricht** (Parameter `-C 1`)
- Timeout ist 1 Sekunde (`-W 1`)
- Da niemand eine Nachricht sendet, timeout der Befehl immer
- Nach 30 Versuchen (30 Sekunden) gibt der Workflow auf

**Dies ist ein falsches Negativ** - der Broker funktioniert, aber der Test ist falsch konstruiert.

### Lösung

Der Health-Check muss prüfen ob Mosquitto **Verbindungen akzeptiert**, nicht ob **Nachrichten ankommen**.

**Option A: Selbst-Test mit Publish/Subscribe (empfohlen)**
```yaml
# Self-test: publish and subscribe to same topic
for i in {1..30}; do
  if docker exec mosquitto sh -c 'mosquitto_pub -t test/health -m "ok" && mosquitto_sub -t test/health -C 1 -W 1' 2>/dev/null | grep -q "ok"; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    docker logs mosquitto
    exit 1
  fi
  sleep 1
done
```

**Option B: Port-Check mit netcat**
```yaml
for i in {1..30}; do
  if docker exec mosquitto sh -c 'nc -z localhost 1883' 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    exit 1
  fi
  sleep 1
done
```

**Option C: Einfacher mosquitto_pub Test**
```yaml
for i in {1..30}; do
  if docker exec mosquitto mosquitto_pub -t 'health/check' -m 'ping' 2>/dev/null; then
    echo "Mosquitto is ready!"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "Mosquitto failed to start"
    exit 1
  fi
  sleep 1
done
```

### Betroffene Dateien

| Datei | Beschreibung |
|-------|--------------|
| [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml) | GitHub Actions Workflow |

### Log-Abruf

```bash
# Workflow-Status prüfen
gh run list --workflow=wokwi-tests.yml

# Fehlgeschlagene Logs abrufen
gh run view 20703443328 --log-failed

# Vollständige Logs
gh run view 20703443328 --log
```

### Priorität

**GEFIXT** - Der Mosquitto Health-Check wurde korrigiert (Run 20703490678 erfolgreich)

---

## Bug #2: WOKWI_CLI_TOKEN Secret nicht konfiguriert (KRITISCH)

### Zusammenfassung

Das GitHub Secret `WOKWI_CLI_TOKEN` ist nicht korrekt konfiguriert. Die Wokwi CLI kann nicht authentifizieren und die ESP32-Simulation läuft nicht.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Workflow Run ID** | 20703490678 |
| **Fehler-Schritt** | `Run Boot Sequence Test` / `Run MQTT Connection Test` |
| **Exit Code** | 0 (durch `|| true` maskiert) |
| **Ursache** | WOKWI_CLI_TOKEN Secret fehlt oder leer |

### Symptome

Der Workflow zeigt "SUCCESS", aber in den Logs:

```
Wokwi CLI v0.19.1 (e0043c48bf15)
Error: Missing WOKWI_CLI_TOKEN environment variable. Please set it to your Wokwi token.
Get your token at https://wokwi.com/dashboard/ci.
```

**Die Wokwi-Simulation läuft NICHT!** Der "Erfolg" ist ein falsches Positiv.

### Root Cause Analyse

**Datei:** [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml)
**Zeilen:** 118-129

```yaml
- name: Run Boot Sequence Test
  env:
    WOKWI_CLI_TOKEN: ${{ secrets.WOKWI_CLI_TOKEN }}
  run: |
    ...
    timeout 120 wokwi-cli run \
      --timeout 90000 \
      --scenario tests/wokwi/boot_test.yaml \
      2>&1 | tee wokwi_output.log || true  # <-- || true maskiert den Fehler!
```

**Probleme:**

1. **Secret nicht vorhanden oder leer:** Das Secret `WOKWI_CLI_TOKEN` wurde nicht im GitHub Repository konfiguriert
2. **Fehler wird maskiert:** `|| true` am Ende des Commands lässt den Workflow "erfolgreich" erscheinen obwohl die Simulation fehlschlägt

### Lösung

**Schritt 1: GitHub Secret konfigurieren**

1. Gehe zu: https://github.com/Auto-one-Family/Automation-One/settings/secrets/actions
2. Klicke "New repository secret"
3. Name: `WOKWI_CLI_TOKEN`
4. Value: Token von https://wokwi.com/dashboard/ci
5. Klicke "Add secret"

**Schritt 2 (Optional): Workflow robuster machen**

Das `|| true` sollte entfernt werden, damit echte Fehler erkannt werden:

```yaml
# Statt:
timeout 120 wokwi-cli run ... 2>&1 | tee wokwi_output.log || true

# Besser:
if ! timeout 120 wokwi-cli run ... 2>&1 | tee wokwi_output.log; then
  echo "Wokwi simulation failed"
  # Nur bei Token-Fehler fortfahren, sonst abbrechen
  if grep -q "Missing WOKWI_CLI_TOKEN" wokwi_output.log; then
    echo "::warning::Wokwi token not configured, skipping simulation"
  else
    exit 1
  fi
fi
```

### Betroffene Dateien

| Datei | Beschreibung |
|-------|--------------|
| [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml) | GitHub Actions Workflow |
| GitHub Repository Settings | Secrets → Actions |

### Log-Abruf

```bash
# Vollständige Logs abrufen
gh run view 20703490678 --log | grep -A 5 "WOKWI_CLI_TOKEN"
```

### Priorität

**KRITISCH** - Ohne Token läuft keine ESP32-Simulation, der gesamte Wokwi-Test ist wirkungslos.

---

## Workflow-Status Übersicht (2026-01-05)

| Workflow | Run ID | Status | Fehler |
|----------|--------|--------|--------|
| **Wokwi ESP32 Tests** | 20703443328 | FAILURE | Bug #1 (Mosquitto Health-Check) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703490678 | SUCCESS* | Bug #2 (Token fehlt) - *Falsches Positiv |
| **ESP32 Tests** | 20703443326 | SUCCESS | - |
| **Server Tests** | 20703443330 | SUCCESS | - |

---

## Bug #3: wokwi.toml nicht gefunden - falscher Pfad (KRITISCH)

### Zusammenfassung

Die Wokwi CLI sucht `wokwi.toml` im falschen Verzeichnis (`El Trabajante/run/` statt `El Trabajante/`).

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Workflow Run ID** | 20703576871 |
| **Fehler-Schritt** | `Run Boot Sequence Test` |
| **Exit Code** | 0 (durch `|| true` maskiert) |
| **Ursache** | Wokwi CLI interpretiert Pfad falsch |

### Symptome

```
Wokwi CLI v0.19.1 (e0043c48bf15)
Error: wokwi.toml not found in /home/runner/work/Automation-One/Automation-One/El Trabajante/run.
```

Die Wokwi CLI sucht in `El Trabajante/run/` statt in `El Trabajante/`.

### Root Cause Analyse

**Datei:** [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml)
**Zeilen:** 126-129

```yaml
timeout 120 wokwi-cli run \
  --timeout 90000 \
  --scenario tests/wokwi/boot_test.yaml \
  2>&1 | tee wokwi_output.log || true
```

**Problem:** Die Wokwi CLI braucht explizit das Projektverzeichnis oder muss ohne Unterverzeichnis aufgerufen werden.

### Lösung

**Korrekte Syntax (Projektverzeichnis als ERSTES Argument):**
```yaml
# Syntax: wokwi-cli <project-dir> --timeout <ms> --scenario <path>
timeout 120 wokwi-cli . \
  --timeout 90000 \
  --scenario tests/wokwi/boot_test.yaml \
  2>&1 | tee wokwi_output.log || true
```

**WICHTIG:** Das Projektverzeichnis (`.`) muss als erstes Argument kommen, nicht als letztes!
Die Wokwi CLI interpretiert das erste Argument als Projektpfad und sucht dort nach `wokwi.toml`.

### Betroffene Dateien

| Datei | Beschreibung |
|-------|--------------|
| [.github/workflows/wokwi-tests.yml](.github/workflows/wokwi-tests.yml) | GitHub Actions Workflow |

### Priorität

**KRITISCH** - Die Wokwi-Simulation kann nicht starten.

---

## Workflow-Status Übersicht (2026-01-05)

| Workflow | Run ID | Status | Fehler |
|----------|--------|--------|--------|
| **Wokwi ESP32 Tests** | 20703443328 | FAILURE | Bug #1 (Mosquitto Health-Check) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703490678 | SUCCESS* | Bug #2 (Token fehlt) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703576871 | SUCCESS* | Bug #3 (wokwi.toml Pfad) - *Falsches Positiv |
| **ESP32 Tests** | 20703443326 | SUCCESS | - |
| **Server Tests** | 20703443330 | SUCCESS | - |

---

## Bug #4: Ungültige Szenario-Syntax - "timeout" pro Step nicht erlaubt

### Zusammenfassung

Die Wokwi Szenario-YAML-Dateien verwenden `timeout:` als separates Feld pro Step, was nicht unterstützt wird.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Workflow Run ID** | 20703687677 |
| **Fehler-Schritt** | `Run Boot Sequence Test` |
| **Exit Code** | 0 (durch `|| true` maskiert) |
| **Ursache** | Falsche YAML-Syntax in Szenario-Dateien |

### Symptome

```
Wokwi CLI v0.19.1 (e0043c48bf15)
Error: Invalid scenario step key: timeout
```

### Root Cause Analyse

**Dateien:**
- `El Trabajante/tests/wokwi/boot_test.yaml`
- `El Trabajante/tests/wokwi/mqtt_connection.yaml`

**Falsche Syntax:**
```yaml
steps:
  - wait-serial: "ESP32 Sensor Network"
    timeout: 10000  # FALSCH! Nicht unterstützt
```

**Korrekte Syntax:**
```yaml
steps:
  - wait-serial: "ESP32 Sensor Network"  # Kein timeout pro Step!
```

Der Timeout wird **nur** als CLI-Option gesetzt: `--timeout 90000`

### Lösung

Alle `timeout:` Zeilen aus den Szenario-Dateien entfernen. Der globale Timeout wird über die CLI-Option gesteuert.

### Priorität

**GEFIXT** - Szenario-Dateien korrigiert (2026-01-05)

---

## Workflow-Status Übersicht (2026-01-05)

| Workflow | Run ID | Status | Fehler |
|----------|--------|--------|--------|
| **Wokwi ESP32 Tests** | 20703443328 | FAILURE | Bug #1 (Mosquitto Health-Check) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703490678 | SUCCESS* | Bug #2 (Token fehlt) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703576871 | SUCCESS* | Bug #3 (wokwi.toml Pfad) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703634815 | SUCCESS* | Bug #3 (noch falscher Pfad) |
| **Wokwi ESP32 Tests** | 20703687677 | SUCCESS* | Bug #4 (Szenario Syntax) - GEFIXT |
| **Wokwi ESP32 Tests** | 20703799303 | ✅ SUCCESS | Alle Bugs gefixt - Simulation läuft! |
| **ESP32 Tests** | 20703443326 | SUCCESS | - |
| **Server Tests** | 20703443330 | SUCCESS | - |

---

## Nächste Schritte

1. [x] Bug #1 fixen: Mosquitto Health-Check korrigieren
2. [x] Bug #2 fixen: WOKWI_CLI_TOKEN Secret konfiguriert
3. [x] Bug #3 fixen: wokwi.toml Pfad korrigieren (Projektverzeichnis als erstes Argument)
4. [x] Bug #4 fixen: Szenario-Syntax korrigiert (kein timeout pro Step)
5. [x] **Workflow erfolgreich validiert - Wokwi Simulation läuft!**

---

**Letzte Aktualisierung:** 2026-01-05 04:45 UTC

---

## Zusammenfassung

**Status: ✅ ERFOLGREICH ABGESCHLOSSEN**

Das Wokwi ESP32 CI/CD Setup ist vollständig funktional. Alle 4 Bugs wurden identifiziert, dokumentiert und behoben:

1. **Bug #1:** Mosquitto Health-Check wartete auf Nachrichten statt Verbindungstest
2. **Bug #2:** GitHub Secret `WOKWI_CLI_TOKEN` fehlte
3. **Bug #3:** Wokwi CLI Syntax - Projektverzeichnis muss ERSTES Argument sein
4. **Bug #4:** Wokwi Szenario-YAML unterstützt kein `timeout:` pro Step

Der finale Workflow-Run (20703799303) war erfolgreich und die ESP32-Firmware wird nun in der Wokwi-Simulation getestet.

---

## Debug-Session: 2026-01-05 04:45 UTC

### System-Status

| Service | Port | Status | Details |
|---------|------|--------|---------|
| **Server (uvicorn)** | 8000 | ✅ RUNNING | PID 30856 |
| **Frontend (Vite)** | 5173 | ✅ RUNNING | PID 5756 |
| **MQTT (Mosquitto)** | 1883 | ✅ RUNNING | PID 4900, Service STATE: 4 RUNNING |

### Health-Checks

| Endpoint | Status | Response |
|----------|--------|----------|
| `GET /api/v1/auth/status` | ✅ 200 | `{"setup_required":false,"users_exist":true,...}` |
| `GET http://localhost:5173` | ✅ 200 | HTML Response |
| MQTT Connection | ✅ OK | Result code: 0 |

### Server-Logs Analyse

| Kategorie | Status | Details |
|-----------|--------|---------|
| **ERROR-Level Logs** | ✅ KEINE | Keine ERROR oder CRITICAL Logs gefunden |
| **WARNING-Level Logs** | ⚠️ Normal | JWT Token Expiry (erwartetes Verhalten) |
| **Scheduler Jobs** | ✅ OK | SimulationScheduler, MaintenanceService laufen |
| **Mock ESPs** | ✅ 9 online | Health-Check: 9 checked, 9 online, 0 timed out |

### MQTT-Kommunikation

- **Verbindung:** `MQTT connected with result code: 0`
- **Heartbeats:** Alle Mock-ESPs senden regelmäßig (alle 60s)
- **Sensor-Daten:** Werden alle 30s publiziert und gespeichert

### Gefundene Bugs: KEINE NEUEN

Alle bekannten Bugs wurden in früheren Sessions behoben. Siehe:
- `El Frontend/Docs/Bugs_and_Phases/Bugs_Found_2.md` - **Bug O (Event-Loop)** bleibt offen (sporadisch)
- `El Frontend/Docs/Bugs_and_Phases/Bugs_Found_3.md` - Drag & Drop Fixes ✅

---

## Debug-Session: 2026-01-06 ~06:00 UTC

---

## Bug U: ESP-Status wird nicht automatisch aktualisiert (GEFIXT)

### Zusammenfassung

Der ESP Online/Offline-Status im Frontend wurde nicht automatisch aktualisiert wenn ein ESP sich verbindet oder einen Heartbeat sendet. Der User musste die Seite manuell neu laden oder den "Aktualisieren"-Button klicken.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Gefixt** | 2026-01-06 |
| **Komponente** | Frontend (`websocket.ts`, `esp.ts`) |
| **Fix Status** | ✅ GEFIXT |
| **Priorität** | MITTEL |

### Symptome

- Wokwi ESP_00000001 sendete Heartbeat
- Server empfing und verarbeitete Heartbeat korrekt (Logs bestätigen)
- Frontend zeigte ESP weiterhin als "offline" an
- Erst nach ~1 Minute UND manuellem Frontend-Neustart wurde Status aktualisiert

### Root Cause Analyse (KORRIGIERT)

**Ursprüngliche Annahme (FALSCH):**
- DevicesView.vue hat keine WebSocket-Integration

**Tatsächliche Root Cause:**

Die Architektur war KORREKT implementiert:
1. Server broadcastet `esp_health` via WebSocket bei jedem Heartbeat ✅
2. `espStore` hat WebSocket-Handler für `esp_health` registriert ✅
3. `handleEspHealth()` aktualisiert Device-Status korrekt ✅

**Das EIGENTLICHE Problem war ein Timing-Issue:**

1. **`websocket.ts connect()` gab sofort zurück** - Die `connect()` Methode erstellte das WebSocket und gab das Promise sofort zurück, BEVOR die Verbindung tatsächlich hergestellt war.

2. **Verpasste Heartbeats** - Wenn ein Heartbeat ankam während der WebSocket noch verbunden wurde, ging die Nachricht verloren.

3. **Kein State-Sync nach Connect** - Nach erfolgreicher WebSocket-Verbindung wurde der aktuelle ESP-Status nicht vom Server geholt.

**Timeline des Bugs:**
```
T=0:    User öffnet Frontend
T=0.1:  fetchAll() wird aufgerufen → ESP ist offline (noch kein Heartbeat in DB)
T=0.2:  WebSocket beginnt zu verbinden
T=0.5:  Heartbeat kommt an, Server broadcastet
T=0.5:  WebSocket noch nicht offen → Broadcast verpasst!
T=1.0:  WebSocket verbindet erfolgreich
T=60:   Nächster Heartbeat → JETZT würde UI aktualisieren
T=60+:  User hat aber schon neu gestartet
```

### Lösung

**Fix 1: `websocket.ts` - `connect()` wartet auf tatsächliche Verbindung**

```typescript
// VORHER: Gab sofort zurück
async connect(): Promise<void> {
  this.ws = new WebSocket(url)
  this.ws.onopen = () => { ... }  // Callback später
  // Returned HERE - before onopen!
}

// NACHHER: Wartet auf onopen
async connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    this.ws = new WebSocket(url)
    this.ws.onopen = () => {
      // ... setup ...
      this.notifyConnectCallbacks()
      resolve()  // NOW it resolves
    }
    this.ws.onerror = () => reject(...)
  })
}
```

**Fix 2: `websocket.ts` - Connect-Callbacks für State-Sync**

```typescript
// Neue onConnect() Methode
onConnect(callback: () => void): () => void {
  this.onConnectCallbacks.add(callback)
  return () => this.onConnectCallbacks.delete(callback)
}

// In onopen wird notifyConnectCallbacks() aufgerufen
```

**Fix 3: `esp.ts` - Refresh nach WebSocket-Verbindung**

```typescript
function initWebSocket(): void {
  // ... existing handlers ...

  // BUG U FIX: Refresh data when WebSocket connects/reconnects
  wsUnsubscribers.push(
    websocketService.onConnect(() => {
      console.log('[ESP Store] WebSocket connected, refreshing ESP data...')
      fetchAll().catch(err => {
        console.error('[ESP Store] Failed to refresh:', err)
      })
    })
  )
}
```

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `El Frontend/src/services/websocket.ts` | `connect()` wartet auf `onopen`, neue `onConnect()` Methode |
| `El Frontend/src/stores/esp.ts` | `fetchAll()` nach WebSocket-Connect |

### Verifikation

Nach dem Fix:
1. Frontend öffnen → `fetchAll()` holt initialen Status
2. WebSocket verbindet → `onConnect` Callback triggert `fetchAll()`
3. Jetzt ist der aktuelle Status geladen (inkl. aller zwischenzeitlichen Heartbeats)
4. Zukünftige Heartbeats werden live via WebSocket aktualisiert

### Lessons Learned

- **Async/Promise Timing ist kritisch** - Eine `async` Funktion die sofort zurückkehrt kann Race Conditions verursachen
- **State-Sync bei Verbindung** - Nach WebSocket-Connect sollte immer der aktuelle State geholt werden
- **Architektur war korrekt** - Manchmal liegt das Problem nicht im Design, sondern in der Implementierung von Async-Flows

---

## Bug V: MQTT Connection Loop - Server reconnected jede Sekunde (OFFEN)

### Zusammenfassung

Der Server verbindet und re-subscribed jede Sekunde zum MQTT-Broker. Dies verhindert stabile MQTT-Kommunikation und blockiert die Verarbeitung von Heartbeats.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Komponente** | Server (`mqtt/client.py`) |
| **Fix Status** | 🔴 OFFEN |
| **Priorität** | KRITISCH |

### Symptome

Server-Logs zeigen jede Sekunde eine neue MQTT-Verbindung:

```json
{"timestamp": "2026-01-06 04:40:46", "message": "MQTT connected with result code: 0"}
{"timestamp": "2026-01-06 04:40:47", "message": "MQTT connected with result code: 0"}
{"timestamp": "2026-01-06 04:40:48", "message": "MQTT connected with result code: 0"}
{"timestamp": "2026-01-06 04:40:49", "message": "MQTT connected with result code: 0"}
... (jede Sekunde wiederholt)
```

- **Keine Heartbeat-Handler-Logs** - Der Server hat keine Zeit, Heartbeats zu verarbeiten
- **Keine WebSocket-Broadcasts** - Keine `esp_health` Events werden gesendet
- **User wartet 60 Sekunden** - Updates kommen nur durch `fetchAll()` alle 60 Sekunden

### Root Cause Analyse

**Vermutete Ursachen:**

1. **MQTT Client Multiple Instances:** Möglicherweise werden mehrere MQTTClient-Instanzen erstellt, die alle versuchen sich zu verbinden

2. **Connection Loop Bug:** Der `_on_connect` Callback triggert möglicherweise einen erneuten Connect

3. **Mosquitto Broker-Konfiguration:** Der Broker könnte Verbindungen nach 1 Sekunde trennen (keepalive Konfiguration)

4. **Service-Restart-Loop:** Ein Service könnte den MQTT-Client in einer Schleife neu starten

### Betroffene Dateien (zur Analyse)

| Datei | Zu prüfen |
|-------|-----------|
| `El Servador/god_kaiser_server/src/mqtt/client.py` | Connection Logic, Singleton Pattern |
| `El Servador/god_kaiser_server/src/main.py` | MQTT Client Initialisierung |
| `El Servador/god_kaiser_server/mosquitto.conf` | Broker Konfiguration (keepalive) |

### Workaround

Keiner bekannt - **Server muss neu gestartet werden** wenn Problem auftritt.

### Nächste Schritte zur Analyse

1. [ ] MQTT Client Singleton-Pattern prüfen
2. [ ] Mosquitto Logs analysieren (`mosquitto -v`)
3. [ ] `_on_connect` Callback auf Reconnect-Logik prüfen
4. [ ] Server mit `--log-level DEBUG` starten für mehr Details

---

## Bug W: Keine WebSocket esp_health Broadcasts (OFFEN)

### Zusammenfassung

Das Frontend erhält keine WebSocket-Broadcasts für ESP-Health-Updates. Die 60-Sekunden-Verzögerung ist eine Folge davon, dass Live-Updates nicht funktionieren.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Komponente** | Server (`heartbeat_handler.py`, `websocket/manager.py`) |
| **Fix Status** | 🔴 OFFEN (Folge von Bug V) |
| **Priorität** | HOCH |

### Symptome

- Wokwi ESP_00000001 sendet Heartbeats alle 60 Sekunden
- Server empfängt Heartbeats (in Logs verifiziert)
- **KEINE** `esp_health` WebSocket-Broadcasts in Logs
- **KEINE** "WebSocket client connected" Logs
- **KEINE** "subscribed with filters" Logs
- Frontend aktualisiert nur bei `fetchAll()` (alle 60 Sekunden oder manueller Reload)

### Root Cause Analyse

**Bug W ist eine FOLGE von Bug V:**

1. **MQTT Connection Loop (Bug V)** verhindert stabile Heartbeat-Verarbeitung
2. Heartbeat-Handler kann `ws_manager.broadcast()` nicht aufrufen
3. Selbst wenn Heartbeat verarbeitet wird:
   - WebSocket Manager `_loop` könnte `None` sein (Event Loop nicht initialisiert)
   - `broadcast_threadsafe()` würde dann mit "Cannot broadcast: event loop not available" warnen

**Sekundäre mögliche Ursachen:**

1. **WebSocket Event Loop nicht initialisiert:** `WebSocketManager.initialize()` wurde nicht aufgerufen
2. **Keine aktiven WebSocket-Clients:** Frontend hat keine WebSocket-Verbindung
3. **Debug-Level Logs deaktiviert:** "subscribed with filters" ist DEBUG-Level

### Log-Suche durchgeführt

```
Suchmuster: "WebSocket|broadcast|esp_health|subscribed"
Ergebnis: KEINE MATCHES im god_kaiser.log
```

Dies bestätigt:
- Keine WebSocket-Client-Verbindungen werden geloggt
- Keine esp_health Broadcasts passieren
- Log-Level könnte DEBUG-Messages unterdrücken

### Betroffene Dateien

| Datei | Beschreibung |
|-------|--------------|
| `src/mqtt/handlers/heartbeat_handler.py:153-168` | WebSocket Broadcast Logik |
| `src/websocket/manager.py` | WebSocket Manager (Singleton) |
| `src/api/v1/websocket/realtime.py` | WebSocket Endpoint |
| `El Frontend/src/services/websocket.ts` | Frontend WebSocket Service |
| `El Frontend/src/stores/esp.ts` | ESP Store mit WebSocket-Handlern |

### Workaround

**Temporär:** Manueller "Aktualisieren"-Button oder Page-Reload um `fetchAll()` zu triggern.

### Nächste Schritte zur Analyse

1. [ ] **Zuerst Bug V fixen** - MQTT Connection Loop stoppen
2. [ ] Log-Level auf DEBUG setzen um mehr Details zu sehen
3. [ ] WebSocket-Verbindung im Browser DevTools prüfen (Network → WS)
4. [ ] `WebSocketManager.initialize()` Aufruf in `main.py` verifizieren
5. [ ] Test: Heartbeat manuell triggern und Broadcast-Logs prüfen

### Zusammenhang mit Bug U

Bug U wurde bereits gefixt (WebSocket Timing), aber Bug W zeigt dass der **Server-seitige** WebSocket-Broadcast nicht funktioniert:

- **Bug U:** Frontend-Timing-Problem → GEFIXT
- **Bug W:** Server-Broadcast-Problem → OFFEN

---

## Bug X: Initial-Heartbeat wird durch Throttle blockiert (GEFIXT)

### Zusammenfassung

Der initiale Heartbeat nach MQTT-Verbindung wird durch den 60-Sekunden-Throttle-Check in `publishHeartbeat()` blockiert. Der ESP sendet erst nach 60 Sekunden den ersten Heartbeat, obwohl der Log "Initial heartbeat sent for ESP registration" sofort erscheint.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-06 |
| **Gefixt** | 2026-01-06 |
| **Komponente** | ESP32 Firmware (`mqtt_client.cpp`, `main.cpp`) |
| **Fix Status** | ✅ GEFIXT |
| **Priorität** | KRITISCH |

### Symptome

- ESP verbindet mit MQTT
- Log zeigt "Initial heartbeat sent for ESP registration"
- **ABER:** Server erhält KEINEN Heartbeat
- Erst nach 60 Sekunden kommt der erste echte Heartbeat
- Frontend zeigt ESP als "offline" obwohl er verbunden ist

### Root Cause Analyse

**Datei:** `El Trabajante/src/services/communication/mqtt_client.cpp`
**Zeilen:** 605-612

```cpp
void MQTTClient::publishHeartbeat() {
    unsigned long current_time = millis();

    // ⚠️ HIER IST DAS PROBLEM!
    if (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS) {
        return;  // Heartbeat wird übersprungen!
    }

    last_heartbeat_ = current_time;
    // ... rest of heartbeat publishing
}
```

**Problem:**
1. `last_heartbeat_` wird im Constructor auf `0` initialisiert
2. Bei Boot ist `millis()` z.B. 10.000ms (10 Sekunden nach Boot)
3. Check: `10000 - 0 = 10000 < 60000` → **TRUE** → Heartbeat wird **ÜBERSPRUNGEN**!
4. Der Log "Initial heartbeat sent" ist irreführend - er wird VOR dem `return` ausgegeben

**Timeline des Bugs:**
```
T=0:      ESP bootet
T=10s:    MQTT verbindet
T=10s:    publishHeartbeat() aufgerufen
T=10s:    Check: 10000 - 0 = 10000 < 60000 → return (keine Nachricht gesendet!)
T=10s:    Log "Initial heartbeat sent" (IRREFÜHREND!)
T=70s:    Nächster publishHeartbeat() Aufruf
T=70s:    Check: 70000 - 0 = 70000 > 60000 → Heartbeat wird JETZT gesendet
T=70s:    Server empfängt ersten Heartbeat (60s Verzögerung!)
```

### Lösung

**Änderung 1: Header-Datei (`mqtt_client.h`)**

```cpp
// VORHER:
void publishHeartbeat();

// NACHHER:
void publishHeartbeat(bool force = false);
```

**Änderung 2: Implementation (`mqtt_client.cpp`)**

```cpp
// VORHER:
void MQTTClient::publishHeartbeat() {
    unsigned long current_time = millis();

    if (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS) {
        return;
    }

// NACHHER:
void MQTTClient::publishHeartbeat(bool force) {
    unsigned long current_time = millis();

    // Skip throttle check if force=true (for initial heartbeat after connect/reconnect)
    if (!force && (current_time - last_heartbeat_ < HEARTBEAT_INTERVAL_MS)) {
        return;
    }
```

**Änderung 3: Initial-Heartbeat (`main.cpp:506-507`)**

```cpp
// VORHER:
mqttClient.publishHeartbeat();

// NACHHER:
// force=true bypasses throttle check (fix for initial heartbeat being blocked)
mqttClient.publishHeartbeat(true);
```

**Änderung 4: Zone-Assignment-Heartbeat (`main.cpp:741-742`)**

```cpp
// VORHER:
mqttClient.publishHeartbeat();

// NACHHER:
// force=true to immediately notify server of zone change
mqttClient.publishHeartbeat(true);
```

### Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `El Trabajante/src/services/communication/mqtt_client.h:70` | `publishHeartbeat(bool force = false)` |
| `El Trabajante/src/services/communication/mqtt_client.cpp:605-611` | Force-Check hinzugefügt |
| `El Trabajante/src/main.cpp:506-507` | `publishHeartbeat(true)` nach MQTT connect |
| `El Trabajante/src/main.cpp:741-742` | `publishHeartbeat(true)` nach Zone-Assignment |

### Verifikation

Nach dem Fix:
1. ESP flashen
2. Wokwi starten
3. Frontend Dashboard öffnen
4. **Erwartung:** ESP erscheint innerhalb von 1-2 Sekunden als "Online" (nicht nach 60s)

### Build-Status

```
========================= [SUCCESS] Took 53.22 seconds =========================
Environment    Status    Duration
-------------  --------  ------------
esp32_dev      SUCCESS   00:00:53.224
```

### Lessons Learned

- **Throttle-Checks brauchen Bypass-Optionen** - Initiale Aktionen sollten Throttle umgehen können
- **Irreführende Logs** - Logs sollten NACH der Aktion kommen, nicht davor
- **Default-Werte prüfen** - `last_heartbeat_ = 0` führte zu unerwartetem Verhalten

---

# TEIL 3: Server-Bugs (2026-01-08)

---

## Bug Y: Mock-ESP Auto-Heartbeat funktioniert nicht nach Server-Neustart (GEFIXT)

### Zusammenfassung

Nach einem Server-Neustart senden Mock-ESPs keinen automatischen Heartbeat. Der User muss erst manuell einen Heartbeat triggern (z.B. über das Debug-Dashboard), damit die Mock-ESPs als "online" erscheinen. Echte ESPs (Wokwi, Hardware) sind **NICHT betroffen** - diese senden sofort nach Verbindung ihren Heartbeat.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-08 |
| **Komponente** | Server (`SimulationScheduler`, `MaintenanceService`) |
| **Fix Status** | ✅ GEFIXT (2026-01-08) |
| **Priorität** | MITTEL |
| **Betroffene ESPs** | Nur Mock-ESPs (MOCK_*) |
| **Nicht betroffen** | Echte ESPs (ESP_*, Wokwi-Simulation) |

### Symptome

1. Server wird neu gestartet (z.B. nach Code-Änderung, Crash, manueller Neustart)
2. Mock-ESPs werden aus der Datenbank wiederhergestellt ("Mock recovery complete: 2 recovered")
3. Mock-ESPs erscheinen im Frontend als "offline" / "timed out"
4. **Erst nach manuellem Heartbeat-Trigger** (Debug-Dashboard → "Heartbeat senden") werden sie "online"
5. Echte ESPs (Wokwi ESP_00000001) senden sofort nach Neustart ihren Heartbeat und funktionieren

### Beobachtete Server-Logs

```
2026-01-08 01:06:50 - Recovering 2 mock simulations from database...
2026-01-08 01:06:50 - [AUTO-HB] MOCK_DE6B2E7F heartbeat published (state=OPERATIONAL)
2026-01-08 01:06:51 - Device MOCK_DE6B2E7F timed out. Last seen: 2026-01-08 00:06:51.007017
2026-01-08 01:06:51 - Mock recovery complete: 2 recovered, 0 failed
```

**Beobachtung:** Der Heartbeat wird gesendet (`[AUTO-HB] ... heartbeat published`), aber kurz danach wird das Device als "timed out" markiert. Die `last_seen`-Zeit liegt 1 Stunde in der Vergangenheit.

### Mögliche Root Causes (zu analysieren)

1. **Heartbeat-Timing vs. Health-Check-Timing:**
   - SimulationScheduler sendet Heartbeat
   - MaintenanceService prüft ESP-Health fast gleichzeitig
   - Race Condition: Health-Check läuft VOR dem Heartbeat-Update in der DB

2. **Timezone-Problem bei `last_seen`:**
   - Heartbeat-Handler speichert `last_seen` mit UTC
   - Health-Check vergleicht mit lokaler Zeit (CET = UTC+1)
   - Resultat: Device erscheint 1 Stunde in der Zukunft → "timed out"

3. **SimulationScheduler Recovery Timing:**
   - Mock-Recovery startet Heartbeat-Jobs
   - Aber Jobs laufen erst nach 60 Sekunden (Intervall)
   - Erster initialer Heartbeat wird nicht sofort gesendet

4. **Datenbank-State inkonsistent:**
   - Mock-ESP hat `simulation_state = 'running'` in DB
   - Aber `last_seen` wurde nicht aktualisiert beim Recovery

### Betroffene Dateien (zur Analyse)

| Datei | Beschreibung |
|-------|--------------|
| `El Servador/god_kaiser_server/src/services/simulation/scheduler.py` | SimulationScheduler - Mock-Recovery, Heartbeat-Jobs |
| `El Servador/god_kaiser_server/src/services/simulation/scheduler.py:430-470` | `recover_mocks()` Methode |
| `El Servador/god_kaiser_server/src/services/simulation/scheduler.py:650-680` | `_heartbeat_job()` Methode |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py` | Heartbeat-Verarbeitung, `last_seen` Update |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:520-570` | `check_device_timeouts()` Health-Check |
| `El Servador/god_kaiser_server/src/services/maintenance/service.py:330-340` | `_health_check_esps()` Job |
| `El Servador/god_kaiser_server/src/main.py:180-200` | Startup-Sequenz, Scheduler-Initialisierung |

### Workaround

**Manueller Heartbeat-Trigger:**
1. Frontend öffnen → Debug-Dashboard
2. Mock-ESP auswählen
3. "Heartbeat senden" klicken
4. ESP erscheint als "online"

### Root Cause (ANALYSIERT)

**Race Condition beim Server-Startup:**

1. `recover_mocks()` startet Simulation mit `start_immediately=True`
2. Heartbeat wird via MQTT gesendet
3. **GLEICHZEITIG:** Health-Check läuft und prüft die ALTE `last_seen` Zeit
4. Health-Check markiert Device als "timed out" (weil `last_seen` noch von vor dem Neustart ist)
5. DANACH erst: Heartbeat-Handler aktualisiert `last_seen`

**Das Kernproblem:** `recover_mocks()` setzte nur `device.status = "online"`, aber **NICHT** `device.last_seen`.

### Fix (Implementiert 2026-01-08)

**Datei:** `El Servador/god_kaiser_server/src/services/simulation/scheduler.py`

**Änderung in `recover_mocks()` (Zeile 449-456):**
```python
if success:
    recovered += 1
    # Update device status to online AND last_seen to current time
    # Bug Y Fix: Set last_seen BEFORE health-check can run to avoid
    # race condition where health-check sees old last_seen and marks
    # device as timed out before heartbeat-handler can update it.
    device.status = "online"
    device.last_seen = datetime.now(timezone.utc)  # ← NEU
    logger.debug(f"Recovered mock simulation: {device.device_id}")
```

### Lessons Learned

- **Race Conditions bei Startup:** Wenn mehrere Services gleichzeitig starten, können Race Conditions entstehen
- **Direkte DB-Updates statt MQTT-Roundtrip:** Bei kritischen Zustandsänderungen sollte die DB direkt aktualisiert werden, nicht erst nach dem MQTT-Roundtrip
- **Timezone-Awareness:** Alle `last_seen` Timestamps müssen UTC-timezone-aware sein

---

## Bug Z: Windows Unicode Encoding Error in Console-Logging (GEFIXT)

### Zusammenfassung

Auf Windows wurde bei der Console-Ausgabe ein `UnicodeEncodeError` geworfen, wenn Log-Nachrichten Unicode-Zeichen (Emojis, Pfeile) enthielten. Die Log-Datei (JSON-Format) war **NICHT betroffen** - nur die Console-Ausgabe.

### Status

| Eigenschaft | Wert |
|-------------|------|
| **Entdeckt** | 2026-01-08 |
| **Gefixt** | 2026-01-08 |
| **Komponente** | Server (Logging-Konfiguration, Python Console Output) |
| **Fix Status** | ✅ GEFIXT |
| **Priorität** | NIEDRIG (nur kosmetisch) |
| **Betrifft** | Nur Windows-Systeme mit cp1252 Console-Encoding |
| **Nicht betroffen** | Linux/Mac, Log-Datei (JSON), tatsächliche Funktionalität |

### Symptome

Console zeigt Fehler wie:

```
--- Logging error ---
Traceback (most recent call last):
  File "C:\Python314\Lib\logging\__init__.py", line 1154, in emit
    stream.write(msg + self.terminator)
UnicodeEncodeError: 'charmap' codec can't encode character '\u2192' in position 123: character maps to <undefined>
Message: '[resilience] CircuitBreaker[mqtt]: Manual reset (closed → closed)'
```

```
UnicodeEncodeError: 'charmap' codec can't encode character '\U0001f4e1' in position 67
Message: '📡 Broadcast esp_health offline event for MOCK_DE6B2E7F'
```

### Root Cause

**Problem:**
- Windows Console verwendet standardmäßig `cp1252` Encoding
- `cp1252` unterstützt keine Unicode-Zeichen wie:
  - `→` (U+2192, Pfeil rechts)
  - `📡` (U+1F4E1, Satellitenantenne Emoji)
  - `⚠️` (U+26A0, Warnung Emoji)
- Python's `logging` Modul versucht diese Zeichen auf die Console zu schreiben → Crash

**Betroffene Log-Messages (Beispiele):**
- `CircuitBreaker[mqtt]: Manual reset (closed → closed)` - Pfeil `→`
- `📡 Broadcast esp_health offline event for ...` - Emoji `📡`
- `⚠️ Orphaned Mock detected: ...` - Emoji `⚠️`

### Betroffene Dateien (zur Analyse)

| Datei | Beschreibung |
|-------|--------------|
| `El Servador/god_kaiser_server/src/core/logging_config.py` | Logging-Konfiguration |
| `El Servador/god_kaiser_server/src/core/resilience/circuit_breaker.py:338` | Pfeil `→` in Log-Message |
| `El Servador/god_kaiser_server/src/mqtt/handlers/heartbeat_handler.py:560` | Emoji `📡` in Log-Message |
| `El Servador/god_kaiser_server/src/services/maintenance/jobs/cleanup.py:468` | Emoji `⚠️` in Log-Message |

### Lösungsoptionen (zur Auswahl)

**Option A: Emojis/Unicode aus Log-Messages entfernen**
- Ersetze `→` durch `->` oder `=>`
- Ersetze `📡` durch `[BROADCAST]`
- Ersetze `⚠️` durch `[WARNING]`
- Pro: Einfachste Lösung
- Contra: Logs werden weniger visuell ansprechend

**Option B: Console-Handler mit Error-Handling**
```python
# In logging_config.py
import sys
if sys.platform == 'win32':
    sys.stdout.reconfigure(errors='replace')  # Ersetze unbekannte Zeichen mit ?
```

**Option C: UTF-8 Console auf Windows erzwingen**
```python
# In main.py oder logging_config.py
import sys
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, errors='replace')
```

**Option D: Nur File-Logging auf Windows**
- Console-Handler deaktivieren wenn Windows detected
- Pro: Keine Encoding-Probleme
- Contra: Keine Live-Console-Logs

### Lösung (Implementiert 2026-01-08)

**Datei:** `El Servador/god_kaiser_server/src/core/logging_config.py`

**Änderung am Anfang von `setup_logging()`:**
```python
# Bug Z Fix: Windows Console kann keine Unicode-Zeichen (Emojis, Pfeile) darstellen
# Ersetze nicht darstellbare Zeichen durch '?' statt einen UnicodeEncodeError zu werfen
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    except AttributeError:
        # Python < 3.7 hat kein reconfigure()
        pass
```

**Effekt:**
- Unicode-Zeichen die nicht dargestellt werden können (`→`, `📡`, `⚠️`) werden durch `?` ersetzt
- Kein `UnicodeEncodeError` mehr auf Windows Console
- Log-Datei (`logs/god_kaiser.log`) bleibt unverändert (UTF-8 mit allen Zeichen)

### Betroffene Dateien mit Unicode-Zeichen

| Datei | Zeichen | Verwendung |
|-------|---------|------------|
| `circuit_breaker.py:340, 388` | `→` | State-Transition-Logs |
| `heartbeat_handler.py:561` | `📡` | Broadcast-Logs |
| `cleanup.py:118, 296, 469, 507` | `⚠️` | Cleanup-Logs |
| `actuator_alert_handler.py:104, 109` | `⚠️` | Alert-Logs |
| `debug.py:2949, 3597` | `→` | State-Change-Logs |

### Lessons Learned

- Windows Console verwendet `cp1252` Encoding (kein Unicode-Support)
- `sys.stdout.reconfigure(errors="replace")` ist die sauberste Lösung
- Log-Dateien sollten immer `encoding="utf-8"` verwenden (war bereits korrekt)

---

**Letzte Aktualisierung:** 2026-01-08
